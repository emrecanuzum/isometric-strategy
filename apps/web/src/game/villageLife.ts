import { Feature, TILE_HEIGHT, TILE_WIDTH, Terrain, gameTime, hash, heightAt } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Sprite as PixiSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { VILLAGER_SPRITES } from './buildingSprites'
import { isNight } from './daylight'
import { CLOTH, Canvas, TIMBER, beast, ramp, rgb, shadow } from './sprites'
import type { Sprite } from './sprites'
import { textureOf } from './textures'
import { findPath } from './town'
import type { Path } from './town'

// The lordships' everyday life (CLAUDE.md §6.4): townsfolk strolling between nearby buildings and standing to chat,
// women fetching water, children at play, a dog, cows and sheep grazing by the fields, hens by the houses and the barn,
// an ox cart on the lord's paths, and close up a bustle round the market. Visual only: everything follows from the
// clock and the seed, nothing is stored. How many walk about grows with the people.
//
// Cheap by design (CLAUDE.md §12): a lordship's plan (paths, spots) is worked out once, the first time it comes into
// view (one lordship a frame), and kept until its buildings or people change; each frame only the lordships on screen
// are visited and only what is on screen takes a sprite, from one capped pool. Nothing is allocated per frame.

// One visible figure per this many villagers, at most this many figures and animals a lordship, this many sprites in all.
const PEOPLE_PER_FIGURE = 3.5
const MAX_FIGURES = 40
const MAX_ANIMALS = 30
const MAX_SPRITES = 200
// With detail animations off (phones, power saving): a few strollers, the dog, the cart and fewer beasts.
const LEAN_STROLLERS = 6
const LEAN_ANIMALS = 12
// At night all but this many strollers a lordship are indoors.
const NIGHT_STROLLERS = 2
// The market's bustle shows from this zoom in.
const BUSTLE_ZOOM = 2
// Paths are searched this many tiles round the box of their two ends; longer walks are dropped.
const SEARCH_MARGIN = 6
const STROLL_TILES = 16
const MAX_STROLL = 30
const STRIDES_PER_TILE = 3
// The lordship's box on screen is widened by this much (world pixels; tall ground lifts things up the screen).
const BOX_MARGIN = 220

// ---- Sprites ----

const SKIN = ramp(0x6b4630, 0x93633f, 0xb88458)
const SCARF = [ramp(0x9c9484, 0xd8d0bc, 0xf2ecdc), ramp(0x5a2a1e, 0x8a4430, 0xb06a48), ramp(0x2c3a52, 0x4a5e80, 0x7088aa)]
const HAIR = [rgb(0x2a1a10), rgb(0x6a4420), rgb(0xc89a4a)]
const BUCKET = ramp(0x3a2616, 0x6a4a2a, 0x8e6a3e)
const IRON = rgb(0x4a4c52)

// A woman in a long dress and headscarf, facing right, two stride frames; with a wooden bucket in her near hand.
function woman(frame: number, dress: Uint32Array, scarf: Uint32Array, bucket: boolean): Sprite {
  const canvas = new Canvas(12, 20)
  const cx = 5
  const base = 18
  const stride = frame === 0 ? 1 : -1
  canvas.set(cx - 1 - stride, base, TIMBER[0])
  canvas.set(cx + 1 + stride, base, TIMBER[0])
  for (let y = base - 8; y < base; y++) {
    const half = 1 + (y - (base - 8)) / 6
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) canvas.set(x, y, dress[x < cx ? 2 : x === cx ? 1 : 0])
  }
  // An apron.
  for (let y = base - 5; y < base - 1; y++) canvas.set(cx + 1, y, scarf[2])
  canvas.set(cx, base - 9, SKIN[2])
  canvas.set(cx + 1, base - 9, SKIN[1])
  for (let x = cx - 1; x <= cx + 1; x++) canvas.set(x, base - 10, scarf[x < cx ? 2 : 1])
  canvas.set(cx - 1, base - 9, scarf[0])
  canvas.set(cx, base - 11, scarf[1])
  if (bucket) {
    canvas.set(cx + 2, base - 6, SKIN[1])
    for (let x = cx + 2; x <= cx + 4; x++) for (let y = base - 5; y <= base - 3; y++) canvas.set(x, y, BUCKET[x === cx + 2 ? 2 : x === cx + 4 ? 0 : 1])
    for (let x = cx + 2; x <= cx + 4; x++) canvas.set(x, base - 4, IRON)
    canvas.set(cx + 3, base - 6, IRON)
  } else canvas.set(cx - 2, base - 6 + (frame === 0 ? 0 : 1), SKIN[2])
  shadow(canvas, cx, base, 3)
  return canvas.sprite(cx, base, 0)
}

// A child, half a grown-up's height: a short tunic, bare head; frames 0 and 1 run, 2 jumps.
function child(frame: number, tunic: Uint32Array, hair: number): Sprite {
  const canvas = new Canvas(9, 15)
  const cx = 4
  const base = 13
  const up = frame === 2 ? 2 : 0
  const stride = frame === 0 ? 1 : frame === 1 ? -1 : 0
  canvas.set(cx - 1 - stride, base - up, TIMBER[0])
  canvas.set(cx + 1 + stride, base - up, TIMBER[0])
  for (let y = base - 5 - up; y < base - up; y++) for (let x = cx - 1; x <= cx + 1; x++) canvas.set(x, y, tunic[x < cx ? 2 : x === cx ? 1 : 0])
  // Arms swing with the run, both up in the jump.
  canvas.set(cx - 2, base - 4 - up + (frame === 2 ? -2 : stride), SKIN[2])
  canvas.set(cx + 2, base - 4 - up + (frame === 2 ? -2 : -stride), SKIN[1])
  canvas.set(cx, base - 6 - up, SKIN[2])
  canvas.set(cx + 1, base - 6 - up, SKIN[1])
  canvas.set(cx - 1, base - 6 - up, hair)
  for (let x = cx - 1; x <= cx + 1; x++) canvas.set(x, base - 7 - up, hair)
  shadow(canvas, cx, base, 2)
  return canvas.sprite(cx, base, 0)
}

// A hen, a few pixels big, facing right: standing, pecking (head to the ground), stepping.
function hen(frame: number, feathers: Uint32Array): Sprite {
  const canvas = new Canvas(8, 8)
  const base = 6
  const peck = frame === 1
  canvas.set(2 + (frame === 2 ? 1 : 0), base, rgb(0xd09030))
  canvas.set(4, base, rgb(0xd09030))
  for (let x = 1; x <= 4; x++) for (let y = base - 3; y <= base - 1; y++) canvas.set(x, y, feathers[y === base - 1 || x === 4 ? 0 : x === 1 ? 2 : 1])
  canvas.set(0, base - 3, feathers[1])
  canvas.set(0, base - 4, feathers[2])
  const hx = peck ? 6 : 5
  const hy = peck ? base - 1 : base - 4
  canvas.set(hx, hy, feathers[2])
  canvas.set(hx, hy - 1, rgb(0xc82020))
  canvas.set(hx + 1, hy, rgb(0xe0a030))
  shadow(canvas, 3, base, 2)
  return canvas.sprite(3, base, 0)
}

const COW = [ramp(0x2a1a12, 0x5a3a24, 0x8a5a36, 0xb8865a, 0xe0c8a4), ramp(0x3a3026, 0x6a5a48, 0x9a8a70, 0xc8baa0, 0xece4d2)]
const OX = ramp(0x2e1c10, 0x553620, 0x7c5434, 0xa2764c, 0xc49c6e)
const WOOL = ramp(0x5a5650, 0x9c968a, 0xd2ccbe, 0xece8de, 0xfbf8f0)
const DOG = [ramp(0x2a1c12, 0x4e3420, 0x765030, 0x9c7046, 0xc49a6a), ramp(0x1c1c20, 0x34343a, 0x50505a, 0x8a8a90, 0xd8d4cc)]
const HENS = [ramp(0x8a8070, 0xd8d0bc, 0xf6f2e6), ramp(0x4a2410, 0x8a4a20, 0xb8743a)]
const HAY = ramp(0x8a6a20, 0xc8a038, 0xe8cc6a)

const shortHorns = (canvas: Canvas, x: number, y: number) => {
  canvas.set(x, y, rgb(0xd8ccb0))
  canvas.set(x + 1, y - 1, rgb(0xd8ccb0))
}
const longHorns = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [1, -1], [2, -1], [-1, -1], [-2, -1]]) canvas.set(x + dx, y + dy, rgb(0xd8ccb0))
}
const sheepFace = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2]]) canvas.set(x + dx, y + dy, rgb(0x2a2420))
}
const dogEars = (canvas: Canvas, x: number, y: number) => {
  canvas.set(x, y + 1, rgb(0x2a1c12))
  canvas.set(x + 1, y + 1, rgb(0x2a1c12))
}

// An ox drawing a two-wheeled cart heaped with hay, facing right; the wheel's spokes turn with the stride.
function oxCart(frame: number): Sprite {
  const ox = beast({ colors: OX, size: 0.85, tail: 1, crown: longHorns, legs: 0.85, brush: { length: 4, color: OX[0] } }, frame)
  const at = 17
  const canvas = new Canvas(ox.width + at, Math.max(ox.height, 24))
  const base = canvas.height - 2
  const wheel = { x: 8, y: base - 4 }
  // The shaft first, so the ox covers its end.
  for (let x = 14; x <= at + Math.round(ox.width * 0.55); x++) canvas.set(x, base - 8, TIMBER[1])
  // The bed, its side boards, and the hay on it.
  for (let x = 1; x <= 15; x++) for (let y = base - 9; y <= base - 6; y++) canvas.set(x, y, TIMBER[y === base - 9 ? 2 : y === base - 6 ? 0 : 1])
  for (let x = 2; x <= 14; x++) {
    const top = base - 10 - Math.round(3.2 * Math.sin(((x - 2) / 12) * Math.PI))
    for (let y = top; y <= base - 10; y++) canvas.set(x, y, HAY[y === top ? 2 : x > 10 ? 0 : 1])
  }
  for (let y = -4; y <= 4; y++) {
    for (let x = -4; x <= 4; x++) {
      const r = Math.hypot(x, y)
      if (r > 4.4) continue
      if (r > 3.3) canvas.set(wheel.x + x, wheel.y + y, TIMBER[0])
      else if (frame === 0 ? x === 0 || y === 0 : Math.abs(x) === Math.abs(y)) canvas.set(wheel.x + x, wheel.y + y, TIMBER[2])
    }
  }
  canvas.set(wheel.x, wheel.y, IRON)
  shadow(canvas, 8, base, 6)
  const oy = base - ox.anchorY
  for (let y = 0; y < ox.height; y++) {
    for (let x = 0; x < ox.width; x++) {
      const c = ox.pixels[y * ox.width + x]
      if (c && canvas.get(x + at, y + oy) >>> 24 !== 0xff) canvas.set(x + at, y + oy, c)
    }
  }
  return canvas.sprite(Math.round(canvas.width / 2), base, 0)
}

interface Looks {
  folk: Sprite[][]
  bucket: Sprite[][]
  children: Sprite[][]
  cows: Sprite[][]
  sheep: Sprite[]
  dogs: Sprite[][]
  hens: Sprite[][]
  cart: Sprite[]
}
let looks: Looks | null = null
// Made once, the first time a lordship is planned.
function looksOf(): Looks {
  return (looks ??= {
    folk: [...VILLAGER_SPRITES, ...CLOTH.map((dress, i) => [0, 1].map((f) => woman(f, dress, SCARF[i % SCARF.length], false)))],
    bucket: CLOTH.slice(0, 3).map((dress, i) => [0, 1].map((f) => woman(f, dress, SCARF[(i + 1) % SCARF.length], true))),
    children: CLOTH.map((tunic, i) => [0, 1, 2].map((f) => child(f, tunic, HAIR[i % HAIR.length]))),
    cows: COW.map((colors) => [0, 1, 2].map((f) => beast({ colors, size: 0.8, tail: 1, crown: shortHorns, legs: 0.8, brush: { length: 4, color: colors[0] } }, f))),
    sheep: [0, 1, 2].map((f) => beast({ colors: WOOL, size: 0.5, tail: 3, crown: sheepFace, legs: 0.6 }, f)),
    dogs: DOG.map((colors) => [0, 1, 2].map((f) => beast({ colors, size: 0.4, tail: 2, crown: dogEars, legs: 0.85, brush: { length: 3, color: colors[1] } }, f))),
    // Stand, step (the walking pair), then peck.
    hens: HENS.map((feathers) => [0, 2, 1].map((f) => hen(f, feathers))),
    cart: [0, 1].map(oxCart),
  })
}

// ---- Plans ----

// A lordship as the map knows it: its finished buildings and how many villagers live there.
export interface Hamlet {
  id: number
  buildings: { kind: string; x: number; y: number; size: number }[]
  people: number
}

interface Art {
  looks: Sprite[]
  frames: Texture[]
}

// Walks a path out and back: resting `restB` at the far end, `restA` at home; shown at an end only if told so.
interface Walk {
  type: 0
  art: Art
  path: Path
  speed: number
  restA: number
  restB: number
  showA: boolean
  showB: boolean
  // The frame shown while standing at an end.
  still: number
  offset: number
  night: boolean
  rich: boolean
}

// Wanders round a home point, from one waypoint to the next and resting between: livestock, hens, children, the bustle.
interface Roam {
  type: 1
  art: Art
  id: number
  x: number
  y: number
  r: number
  period: number
  // The share of each period spent moving.
  move: number
  offset: number
  strides: number
  // Frames shown while resting, picked by the period (and flickered between for pecking hens).
  rest: number[]
  flicker: number
  // Shown at night, standing still on the frame given (-1: indoors).
  nightFrame: number
  rich: boolean
  close: boolean
}

// Two townsfolk standing to talk, facing each other, now and then.
interface Talk {
  type: 2
  a: Art
  b: Art
  ax: number
  ay: number
  bx: number
  by: number
  offset: number
  rich: boolean
}

type Item = Walk | Roam | Talk

interface Plan {
  key: string
  hamlet: Hamlet
  // The lordship's box on screen (world pixels).
  left: number
  top: number
  right: number
  bottom: number
  items: Item[] | null
}

const artOf = (pair: Sprite[]): Art => ({ looks: pair, frames: pair.map((s) => textureOf(s)) })

const center = (b: Hamlet['buildings'][number]): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
// Just past the middle of the front-left wall, by the door (as App's doorstep).
const doorstep = (b: Hamlet['buildings'][number]): Point => ({ x: b.x + b.size * 0.7, y: b.y + b.size + 0.35 })

type Blocked = (x: number, y: number) => boolean

function planItems(world: World, h: Hamlet, blocked: Blocked, worn: Blocked): Item[] {
  const kit = looksOf()
  const seed = world.seed + 4049
  let n = 0
  const roll = () => hash(h.id * 131 + 7, n++, seed)
  const pick = <T,>(list: T[]) => list[Math.floor(roll() * list.length) % list.length]
  const span = (lo: number, hi: number) => lo + roll() * (hi - lo)
  const all = h.buildings
  const places = all.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road')
  const palace = all.find((b) => b.kind === 'palace')
  const homes = all.filter((b) => b.kind === 'house' || b.kind === 'palace')
  const markets = all.filter((b) => b.kind === 'market' || b.kind === 'tradePost')
  const farms = all.filter((b) => b.kind === 'farm')
  const barns = all.filter((b) => b.kind === 'warehouse')
  const items: Item[] = []
  const used: Point[] = []
  const size = world.size

  const terrain = (x: number, y: number) => world.terrain[y * size + x]
  // Open ground for a herd: nothing built, no water or rock, off the paths and roads.
  const grass = (x: number, y: number) => {
    if (blocked(x, y) || worn(x, y)) return false
    const f = world.feature[y * size + x]
    const t = terrain(x, y)
    return f !== Feature.Road && f !== Feature.Bridge && t !== Terrain.Swamp
  }
  const open = (x: number, y: number) => !blocked(x, y)
  // Every tile the disk touches passes `ok`: anything wandering inside it stays clear of buildings and water.
  const disk = (cx: number, cy: number, r: number, ok: Blocked) => {
    for (let ty = Math.floor(cy - r); ty <= Math.floor(cy + r); ty++) {
      for (let tx = Math.floor(cx - r); tx <= Math.floor(cx + r); tx++) {
        const nx = Math.max(tx, Math.min(cx, tx + 1))
        const ny = Math.max(ty, Math.min(cy, ty + 1))
        if (Math.hypot(nx - cx, ny - cy) < r && !ok(tx, ty)) return false
      }
    }
    return true
  }
  // A home point near a building, `near` to `far` tiles off its footprint, inside a clear disk and apart from others.
  const spotBy = (b: Hamlet['buildings'][number], near: number, far: number, r: number, ok: Blocked, apart = 2.5): Point | null => {
    const tiles: { x: number; y: number; k: number }[] = []
    for (let y = b.y - far; y < b.y + b.size + far; y++) {
      for (let x = b.x - far; x < b.x + b.size + far; x++) {
        const d = Math.max(b.x - x, x - (b.x + b.size - 1), b.y - y, y - (b.y + b.size - 1))
        if (d >= near && d <= far) tiles.push({ x, y, k: hash(x * 31 + h.id, y, seed + n) })
      }
    }
    n++
    tiles.sort((a, c) => a.k - c.k)
    for (const t of tiles) {
      const p = { x: t.x + 0.5, y: t.y + 0.5 }
      if (used.some((u) => Math.hypot(u.x - p.x, u.y - p.y) < apart)) continue
      if (!disk(p.x, p.y, r, ok)) continue
      used.push(p)
      return p
    }
    return null
  }
  const pathOf = (from: Point, to: Point, margin = SEARCH_MARGIN, max = MAX_STROLL) => {
    const path = findPath(from, to, blocked, worn, margin)
    return path && path.length > 0.5 && path.length <= max ? path : null
  }
  // Somewhere near a building to walk to: one of the few nearest.
  const neighbour = (from: Hamlet['buildings'][number]) => {
    const c = center(from)
    const near = places
      .filter((b) => b !== from && Math.hypot(center(b).x - c.x, center(b).y - c.y) < STROLL_TILES)
      .sort((a, b) => Math.hypot(center(a).x - c.x, center(a).y - c.y) - Math.hypot(center(b).x - c.x, center(b).y - c.y))
    return near.length > 0 ? near[Math.floor(roll() * Math.min(4, near.length))] : null
  }

  // How the figures are shared: a pair or two talking, children's games, women at the well, a dog or two, strollers.
  let figures = Math.min(MAX_FIGURES, Math.round(h.people / PEOPLE_PER_FIGURE))
  const talks = figures >= 10 ? 2 : figures >= 6 ? 1 : 0
  const games = homes.length > 0 ? Math.min(3, Math.floor(figures / 10)) : 0
  const wells = Math.min(3, homes.length, Math.floor(figures / 8))
  const dogs = figures >= 20 ? 2 : figures >= 5 ? 1 : 0
  figures -= talks * 2 + games * 3 + wells + dogs

  if (places.length > 1) {
    let made = 0
    for (let tries = 0; made < figures && tries < figures * 2; tries++) {
      const a = pick(places)
      const b = neighbour(a)
      const path = b && pathOf(doorstep(a), doorstep(b))
      if (!path) continue
      items.push({
        type: 0,
        art: artOf(pick(kit.folk)),
        path,
        speed: span(0.45, 0.65),
        restA: span(4, 20),
        restB: span(3, 10),
        showA: false,
        showB: true,
        still: 0,
        offset: roll() * 200,
        night: made < NIGHT_STROLLERS,
        rich: made >= LEAN_STROLLERS,
      })
      made++
    }
    for (let d = 0; d < dogs; d++) {
      const a = pick(places)
      const b = neighbour(a)
      const path = b && pathOf(doorstep(a), doorstep(b))
      if (!path) continue
      items.push({ type: 0, art: artOf(pick(kit.dogs)), path, speed: 1.3, restA: span(3, 8), restB: span(3, 8), showA: true, showB: true, still: 2, offset: roll() * 100, night: true, rich: false })
    }
  }
  for (let w = 0; w < wells; w++) {
    const home = pick(homes)
    const door = doorstep(home)
    const well = spotBy(home, 2, 4, 0.6, open, 1.5)
    const path = well && pathOf(door, well, 4, 10)
    if (!path) continue
    items.push({ type: 0, art: artOf(pick(kit.bucket)), path, speed: 0.5, restA: span(10, 25), restB: span(6, 12), showA: false, showB: true, still: 0, offset: roll() * 100, night: false, rich: true })
  }
  for (let g = 0; g < games; g++) {
    const home = pick(homes)
    const at = spotBy(home, 1, 3, 1.4, open)
    if (!at) continue
    for (let c = 0; c < 3; c++) {
      items.push({ type: 1, art: artOf(pick(kit.children)), id: n++, x: at.x, y: at.y, r: 1.2, period: span(1.6, 2.4), move: 0.8, offset: roll() * 50, strides: 4, rest: [2, 0], flicker: 0, nightFrame: -1, rich: true, close: false })
    }
  }
  const talkers = [...(palace ? [palace] : []), ...markets]
  for (let t = 0; t < talks && talkers.length > 0; t++) {
    const by = talkers[t % talkers.length]
    const at = spotBy(by, 1, 3, 0.9, open, 2)
    if (!at) continue
    items.push({ type: 2, a: artOf(pick(kit.folk)), b: artOf(pick(kit.folk)), ax: at.x - 0.4, ay: at.y, bx: at.x + 0.4, by: at.y, offset: roll() * 60, rich: true })
  }

  // Livestock by the fields and the barn, hens by the barn and some houses.
  let animals = 0
  const herd = (art: Sprite[], count: number, at: Point, r: number, period: number, nightFrame: number, rest: number[], flicker: number) => {
    for (let i = 0; i < count && animals < MAX_ANIMALS; i++, animals++) {
      items.push({ type: 1, art: artOf(art), id: n++, x: at.x, y: at.y, r, period: period * span(0.85, 1.2), move: 0.25, offset: roll() * 50, strides: 2, rest, flicker, nightFrame, rich: animals >= LEAN_ANIMALS, close: false })
    }
  }
  for (const farm of farms.slice(0, 8)) {
    const cows = roll() < 0.5
    const at = spotBy(farm, 1, 3, 1.8, grass, 4)
    if (!at) continue
    if (cows) herd(pick(kit.cows), 2 + Math.floor(roll() * 2), at, 1.6, 12, 2, [2, 2, 0], 0)
    else herd(kit.sheep, 3 + Math.floor(roll() * 3), at, 1.5, 10, 2, [2, 2, 0], 0)
  }
  for (const barn of barns) {
    const yard = spotBy(barn, 1, 2, 1.2, open)
    if (yard) herd(pick(kit.hens), 4, yard, 1.1, 3, -1, [2, 0], 0.4)
    const field = spotBy(barn, 2, 4, 1.8, grass, 4)
    if (field) herd(pick(kit.cows), 2, field, 1.6, 12, 2, [2, 2, 0], 0)
  }
  for (const [i, house] of homes.entries()) {
    if (i % 3 !== 1) continue
    const yard = spotBy(house, 1, 2, 1, open, 2)
    if (yard) herd(pick(kit.hens), 2 + Math.floor(roll() * 2), yard, 0.9, 3, -1, [2, 0], 0.4)
  }

  // The ox cart, between the fields or barn and the palace or market.
  const store = barns[0] ?? farms[0]
  const goal = markets.find((b) => b.kind === 'market') ?? palace
  if (store && goal) {
    const path = pathOf(doorstep(store), doorstep(goal), 12, 60)
    if (path) items.push({ type: 0, art: artOf(kit.cart), path, speed: 0.5, restA: span(12, 20), restB: span(12, 20), showA: true, showB: true, still: 0, offset: roll() * 200, night: false, rich: false })
  }

  // The bustle round the market and the trade post, close up only.
  for (const m of markets) {
    const at = spotBy(m, 1, 2, 1.2, open, 1.5)
    if (!at) continue
    for (let i = 0; i < 5; i++) {
      items.push({ type: 1, art: artOf(pick(kit.folk)), id: n++, x: at.x, y: at.y, r: 1.1, period: span(4, 7), move: 0.35, offset: roll() * 50, strides: STRIDES_PER_TILE, rest: [0], flicker: 0, nightFrame: -1, rich: true, close: true })
    }
  }
  return items
}

// ---- The system ----

export interface VillageLife {
  // The lordships to bring to life. Called whenever buildings or people change; unchanged lordships keep their plan.
  set(hamlets: Hamlet[], blocked: Blocked, worn: Blocked): void
  // Detail animations on or off (Ayarlar → Görüntü; off on phones and under power saving): off, a lean set shows.
  setDetail(on: boolean): void
  update(now: number, view: { left: number; top: number; right: number; bottom: number }, scale: number): void
}

export function createVillageLife(world: World, layer: Container): VillageLife {
  let plans: Plan[] = []
  let blocked: Blocked = () => false
  let worn: Blocked = () => false
  let detail = true
  const sprites: PixiSprite[] = []
  let used = 0
  let shown = 0
  // Where the current item stands this frame (reused, no allocation per frame).
  const at = { x: 0, y: 0, heading: 1, frame: 0 }

  const take = (art: Art, frame: number) => {
    if (used >= MAX_SPRITES) return null
    let sprite = sprites[used]
    if (!sprite) {
      sprite = new PixiSprite()
      layer.addChild(sprite)
      sprites.push(sprite)
    }
    used++
    const look = art.looks[frame]
    if (sprite.texture !== art.frames[frame]) {
      sprite.texture = art.frames[frame]
      sprite.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
    }
    sprite.visible = true
    return sprite
  }

  // Position and heading `d` tiles along a path.
  const along = (path: Path, d: number) => {
    const pts = path.points
    d = Math.min(path.length, Math.max(0, d))
    let i = 1
    while (i < pts.length - 1 && path.at[i] < d) i++
    const a = pts[i - 1]
    const b = pts[i]
    const t = (d - path.at[i - 1]) / Math.max(1e-6, path.at[i] - path.at[i - 1])
    at.x = a.x + (b.x - a.x) * t
    at.y = a.y + (b.y - a.y) * t
    at.heading = b.x - a.x - (b.y - a.y)
  }

  // A roamer's k-th waypoint inside its disk.
  const wx = (r: Roam, k: number) => r.x + Math.cos(hash(r.id, k, world.seed + 4051) * Math.PI * 2) * Math.sqrt(hash(r.id, k, world.seed + 4052)) * r.r
  const wy = (r: Roam, k: number) => r.y + Math.sin(hash(r.id, k, world.seed + 4051) * Math.PI * 2) * Math.sqrt(hash(r.id, k, world.seed + 4052)) * r.r

  // Where an item stands now (into `at`); false while indoors or out of time.
  function place(item: Walk | Roam, seconds: number, night: boolean): boolean {
    if (item.type === 0) {
      const walk = item.path.length / item.speed
      const loop = walk * 2 + item.restA + item.restB
      const u = (seconds + item.offset) % loop
      if (u < walk) {
        along(item.path, u * item.speed)
        at.frame = Math.floor(u * item.speed * STRIDES_PER_TILE) % 2
      } else if (u < walk + item.restB) {
        if (!item.showB) return false
        along(item.path, item.path.length)
        at.frame = item.still
      } else if (u < walk * 2 + item.restB) {
        const d = (walk * 2 + item.restB - u) * item.speed
        along(item.path, d)
        at.heading = -at.heading
        at.frame = Math.floor(d * STRIDES_PER_TILE) % 2
      } else {
        if (!item.showA) return false
        along(item.path, 0)
        at.heading = -at.heading
        at.frame = item.still
      }
      return true
    }
    const u = seconds / item.period + item.offset
    const k = Math.floor(u)
    const f = u - k
    if (night) {
      if (item.nightFrame < 0) return false
      // Bedded down for the night at one spot.
      at.x = wx(item, 0)
      at.y = wy(item, 0)
      at.heading = hash(item.id, 0, world.seed + 4053) - 0.5
      at.frame = item.nightFrame
      return true
    }
    const moving = f > 1 - item.move
    const fx = wx(item, moving ? k : k - 1)
    const fy = wy(item, moving ? k : k - 1)
    const tx = wx(item, moving ? k + 1 : k)
    const ty = wy(item, moving ? k + 1 : k)
    const s = moving ? (f - (1 - item.move)) / item.move : 1
    at.x = fx + (tx - fx) * s
    at.y = fy + (ty - fy) * s
    at.heading = tx - fx - (ty - fy)
    if (moving) at.frame = Math.floor(Math.hypot(tx - fx, ty - fy) * s * item.strides) % 2
    else if (item.flicker > 0) at.frame = item.rest[Math.floor(seconds / item.flicker + item.offset) % item.rest.length]
    else at.frame = item.rest[k % item.rest.length]
    return true
  }

  function show(art: Art, x: number, y: number, heading: number, frame: number, view: Parameters<VillageLife['update']>[1]) {
    const sx = (x - y) * (TILE_WIDTH / 2)
    const sy = (x + y) * (TILE_HEIGHT / 2) - heightAt(world, x, y)
    if (sx < view.left || sx > view.right || sy < view.top || sy > view.bottom) return true
    const sprite = take(art, frame)
    if (!sprite) return false
    sprite.position.set(Math.round(sx), Math.round(sy))
    sprite.zIndex = sy
    sprite.scale.x = heading < 0 ? -1 : 1
    return true
  }

  return {
    set(hamlets, nextBlocked, nextWorn) {
      blocked = nextBlocked
      worn = nextWorn
      const old = new Map(plans.map((p) => [p.key, p]))
      plans = hamlets
        .filter((h) => h.buildings.length > 0)
        .map((h) => {
          const key = `${h.id}:${Math.round(h.people / PEOPLE_PER_FIGURE)}:${h.buildings.map((b) => `${b.kind}${b.x},${b.y}`).join(';')}`
          const kept = old.get(key)
          if (kept) return kept
          let x0 = Infinity
          let y0 = Infinity
          let x1 = -Infinity
          let y1 = -Infinity
          for (const b of h.buildings) {
            x0 = Math.min(x0, b.x - 6)
            y0 = Math.min(y0, b.y - 6)
            x1 = Math.max(x1, b.x + b.size + 6)
            y1 = Math.max(y1, b.y + b.size + 6)
          }
          return {
            key,
            hamlet: h,
            left: (x0 - y1) * (TILE_WIDTH / 2) - BOX_MARGIN,
            right: (x1 - y0) * (TILE_WIDTH / 2) + BOX_MARGIN,
            top: (x0 + y0) * (TILE_HEIGHT / 2) - BOX_MARGIN * 2,
            bottom: (x1 + y1) * (TILE_HEIGHT / 2) + BOX_MARGIN,
            items: null,
          }
        })
    },
    setDetail(on) {
      detail = on
    },
    update(now, view, scale) {
      const seconds = now / 1000
      const night = isNight(gameTime(now, 0).hour)
      const close = scale >= BUSTLE_ZOOM
      let planned = false
      used = 0
      outer: for (const plan of plans) {
        if (plan.right < view.left || plan.left > view.right || plan.bottom < view.top || plan.top > view.bottom) continue
        if (!plan.items) {
          // One new lordship planned a frame: panning over many at once spreads the path searches out.
          if (planned) continue
          plan.items = planItems(world, plan.hamlet, blocked, worn)
          planned = true
        }
        for (const item of plan.items) {
          if (item.rich && !detail) continue
          if (item.type === 2) {
            if (night) continue
            // Stand and talk for two thirds of each minute, shifting their weight now and then.
            const u = (seconds + item.offset) % 60
            if (u > 40) continue
            const sway = Math.floor(u / 1.3) % 2
            if (!show(item.a, item.ax, item.ay, 1, sway, view) || !show(item.b, item.bx, item.by, -1, 1 - sway, view)) break outer
            continue
          }
          if (item.type === 0 ? night && !item.night : item.close && (!close || night)) continue
          if (!place(item, seconds, night)) continue
          if (!show(item.art, at.x, at.y, at.heading, at.frame, view)) break outer
        }
      }
      for (let i = used; i < shown; i++) sprites[i].visible = false
      shown = used
    },
  }
}
