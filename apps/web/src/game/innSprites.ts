import { TILE_HEIGHT, TILE_WIDTH, Terrain, hash } from '@game/shared'
import type { Point, World } from '@game/shared'
import { innKind } from './innInfo'
import type { InnKind } from './innInfo'
import { CLOTH, Canvas, GLASS, ROOF, SACK, STONE, TIMBER, WALL, diamondAt, ellipseAt, pick, ramp, rgb, shadeBlobs } from './sprites'
import type { Sprite } from './sprites'

// Inns come in a few styles that suit the land they stand on. Every one covers a 2×2 tile footprint and is
// anchored at the footprint's front corner; smoke rises from its chimneys.

export interface InnLook {
  sprite: Sprite
  // Chimney tops, in pixels from the anchor.
  smoke: Point[]
}

const SLATE = ramp(0x232836, 0x2f3646, 0x3d4658, 0x4f5a6c, 0x647083, 0x7c889a)
const THATCH = ramp(0x4a3517, 0x6b4f22, 0x8d6b2f, 0xae8a41, 0xc8a658, 0xdcc07a)
const LOG = ramp(0x2e1f15, 0x4a3221, 0x684830, 0x86603f, 0xa47c52)
const ADOBE = ramp(0x7a5838, 0x9a7449, 0xb9915c, 0xd2ad74, 0xe6c992, 0xf3dfb0)
const MOSS_ROOF = ramp(0x1f2c22, 0x2b3d2c, 0x3a5036, 0x4b6441, 0x5f784c, 0x768e5a)
const SMOKE = ramp(0x6c6a70, 0x88868b, 0xa3a1a4, 0xbdbbbc, 0xd6d4d2)

interface Style {
  wallHeight: number
  // Color of a wall pixel. `side` is -1 for the lit left wall, `t` runs along it from the outer corner to the front
  // corner (0..TILE_WIDTH) and `z` runs up from the ground.
  wall: (side: number, t: number, z: number) => number
  // A hip roof of this height and texture, or a flat roof with a parapet and a dome when absent.
  roof?: { height: number; eave: number; color: (side: number, x: number, y: number, edge: boolean) => number }
  // Chimneys as signed offsets from the center line (right of it is the shaded roof face) and their height.
  chimneys: { dx: number; height: number }[]
}

function build(style: Style, kind: InnKind): InnLook {
  const w = TILE_WIDTH
  const h = TILE_HEIGHT
  const wall = style.wallHeight
  const roofHeight = style.roof?.height ?? 26
  const canvas = new Canvas(w * 2 + 30, h * 2 + wall + roofHeight + 30)
  const cx = canvas.width >> 1
  const base = canvas.height - 2
  const top = base - h * 2
  const smoke: Point[] = []

  for (const side of [-1, 1]) {
    for (let t = 0; t <= w; t++) {
      const x = cx + side * (w - t)
      const ground = base - h + t / 2
      for (let z = 0; z <= wall; z++) canvas.set(x, ground - z, style.wall(side, t, z))
    }
  }
  // Its shape for the shadow (see Solid): the walls, then the roof and chimneys below.
  canvas.solid(diamondAt(cx, base - h, w), 0, wall)

  const stack = (x: number, foot: number, height: number) => {
    for (let z = 0; z < height; z++) {
      for (let dx = 0; dx < 7; dx++) {
        const course = (z + (dx > 3 ? 1 : 0)) % 4 === 0
        canvas.set(x + dx, foot - z, z > height - 3 ? STONE[1] : dx < 3 ? STONE[course ? 3 : 4] : STONE[course ? 1 : 2])
      }
    }
    smoke.push({ x: x + 3 - cx, y: foot - height - base })
    canvas.solid(diamondAt(x + 3.5, base - h, 3.5), wall, base - h - (foot - height))
  }

  if (style.roof) {
    // Hip roof: a pyramid over the footprint. Its two front faces show, bounded below by the front eaves and above
    // by the hips running from the apex down to the left and right eave corners.
    const { height: roof, eave, color } = style.roof
    canvas.solid(diamondAt(cx, base - h, w + eave), Math.max(0, wall - eave / 2), wall + roof, [cx, base - h])
    const apexY = top + h - wall - roof
    const cornerY = base - wall + eave - (w + eave) / 2
    const ridgeAt = (dx: number) => apexY + dx * ((cornerY - apexY) / (w + eave))
    for (let y = apexY; y <= base - wall + eave; y++) {
      for (let x = cx - w - eave; x <= cx + w + eave; x++) {
        const side = x < cx ? -1 : 1
        const dx = Math.abs(x - cx)
        const eaveY = base - wall + eave - dx / 2
        const ridgeY = ridgeAt(dx) - 0.01
        if (y > eaveY || y < ridgeY) continue
        const f = (y - ridgeY) / (eaveY - ridgeY + 0.01)
        canvas.set(x, y, color(side, x, y + dx / 2, f > 0.93))
      }
    }
    for (let y = apexY; y <= base - wall + eave; y++) canvas.set(cx, y, color(-1, cx, y, false))
    for (const { dx, height } of style.chimneys) stack(cx + dx, Math.round(ridgeAt(Math.abs(dx) + 3)) + 8, height)
  } else {
    // Flat roof behind a parapet, with a small dome in the middle.
    const roofY = (dx: number, back: boolean) => (back ? base - 2 * h + dx / 2 : base - dx / 2) - wall
    for (let x = cx - w; x <= cx + w; x++) {
      const dx = Math.abs(x - cx)
      for (let y = Math.ceil(roofY(dx, true)); y <= roofY(dx, false); y++) {
        const tone = 2.6 + (hash(x >> 2, y >> 1, 77) > 0.8 ? -0.6 : 0) + (x < cx ? 0.5 : 0)
        canvas.set(x, y, pick(ADOBE, tone))
      }
      for (let z = 0; z <= 3; z++) {
        canvas.set(x, Math.round(roofY(dx, true)) - z, ADOBE[z === 3 ? 5 : 2])
        canvas.set(x, Math.round(roofY(dx, false)) - z, ADOBE[z === 3 ? 5 : x < cx ? 4 : 2])
      }
    }
    const dome = new Canvas(canvas.width, canvas.height)
    const domeY = base - h - wall - 2
    canvas.solid(diamondAt(cx, base - h, w), wall, wall + 3)
    canvas.solid(ellipseAt(cx - 6, base - h, 13), wall, wall + 15, [cx - 6, base - h])
    shadeBlobs(dome, [{ x: cx - 6, y: domeY, r: 15 }], ADOBE, 51, 0.85)
    dome.rim(ADOBE[1])
    for (let y = 0; y < dome.height; y++) {
      for (let x = 0; x < dome.width; x++) {
        const c = dome.get(x, y)
        if (c && y <= domeY + 3) canvas.set(x, y, c)
      }
    }
    canvas.set(cx - 6, domeY - 13, TIMBER[0])
    canvas.set(cx - 6, domeY - 14, rgb(0xd9b44a))
    for (const { dx, height } of style.chimneys) stack(cx + dx, base - h - wall + 6, height)
  }
  adorn(canvas, kind, cx, base, wall)
  return { sprite: canvas.sprite(cx, base, 0), smoke }
}

const WATER = ramp(0x2a4a6a, 0x3f6f96, 0x6aa0c4)
const BARREL = ramp(0x3a2414, 0x5c3a20, 0x80542e, 0xa06c3c)

// What stands against an inn's walls tells its trade: market stalls under a striped awning, a horse trough and hay at
// a post house, a striped barrier and a flag at a toll house, barrels and a hanging sign at a plain inn. Every one has
// lanterns by its door, lit at night.
function adorn(canvas: Canvas, kind: InnKind, cx: number, base: number, wall: number) {
  const w = TILE_WIDTH
  const h = TILE_HEIGHT
  // A point `out` pixels in front of the left (side -1, lit) or right wall, `t` along it from the outer corner toward
  // the front corner, `z` above the ground.
  const at = (side: number, t: number, z: number, out = 0) => ({ x: cx + side * (w - t) + side * out, y: base - h + t / 2 - z + out / 2 })
  const dot = (p: { x: number; y: number }, color: number) => canvas.set(p.x, p.y, color)
  // A box on the ground in front of a wall: `len` along it, `deep` out from it, `tall` high.
  const box = (side: number, t: number, out: number, len: number, deep: number, tall: number, colors: Uint32Array) => {
    for (let d = deep; d >= 0; d--) {
      for (let u = 0; u < len; u++) {
        for (let z = 0; z <= tall; z++) {
          const top = z === tall
          const front = d === deep
          dot(at(side, t + u, z, out + d), colors[top ? colors.length - 1 : front ? (side < 0 ? 2 : 1) : 1])
        }
      }
    }
  }
  const barrel = (side: number, t: number, out: number) => {
    const p = at(side, t, 0, out)
    for (let z = 0; z < 7; z++) {
      for (let dx = -2; dx <= 2; dx++) {
        const hoop = z === 1 || z === 5
        canvas.set(p.x + dx, p.y - z, hoop ? STONE[1] : BARREL[dx < 0 ? 3 : dx === 0 ? 2 : 1])
      }
    }
    for (let dx = -1; dx <= 1; dx++) canvas.set(p.x + dx, p.y - 7, BARREL[0])
  }
  // Lanterns either side of the door (on the lit wall, see the styles' doors around t 44..59).
  for (const t of [41, 62]) {
    const p = at(-1, t, 18, 2)
    canvas.set(p.x, p.y - 1, TIMBER[0])
    canvas.set(p.x, p.y, GLASS[2])
    canvas.set(p.x, p.y + 1, GLASS[1])
  }
  if (kind === 'market') {
    // A striped awning along the shaded wall, sloping down and out over crates and sacks.
    const top = Math.min(wall - 6, 20)
    for (let t = 6; t <= 56; t++) {
      for (let k = 0; k <= 7; k++) {
        const stripe = Math.floor(t / 5) % 2 === 0
        const edge = k === 7
        const color = edge ? (stripe ? CLOTH[0][1] : rgb(0xb8ab92)) : stripe ? CLOTH[0][k < 3 ? 3 : 2] : rgb(k < 3 ? 0xf2ead6 : 0xd8ccb4)
        dot(at(1, t, top - k * 0.9, k * 1.4), color)
      }
      if (t % 25 === 6) for (let z = 0; z < top - 6; z++) dot(at(1, t, z, 10), TIMBER[1])
    }
    box(1, 12, 3, 6, 3, 4, SACK)
    box(1, 22, 4, 5, 3, 5, BARREL)
    box(1, 38, 3, 7, 3, 3, SACK)
    // Bolts of cloth on the counter.
    for (let u = 0; u < 4; u++) for (let z = 4; z < 6; z++) dot(at(1, 39 + u, z, 4), CLOTH[1][2 + (z & 1)])
    box(-1, 14, 3, 6, 3, 4, SACK)
  } else if (kind === 'post') {
    // A water trough and a heap of hay by the lit wall, a hitching rail on the shaded one.
    box(-1, 10, 3, 14, 3, 3, BARREL)
    for (let u = 1; u < 13; u++) dot(at(-1, 10 + u, 3, 4), WATER[u % 5 === 0 ? 2 : 1])
    const hay = at(-1, 30, 0, 5)
    const pile = new Canvas(canvas.width, canvas.height)
    shadeBlobs(pile, [{ x: hay.x, y: hay.y - 3, r: 5 }, { x: hay.x + 4, y: hay.y - 2, r: 4 }], ramp(0x6b4f22, 0x8d6b2f, 0xae8a41, 0xc8a658, 0xdcc07a), 71, 0.7)
    for (let i = 0; i < pile.pixels.length; i++) if (pile.pixels[i] && Math.floor(i / canvas.width) <= hay.y) canvas.pixels[i] = pile.pixels[i]
    for (let t = 14; t <= 44; t++) dot(at(1, t, 9, 5), TIMBER[2])
    for (const t of [14, 29, 44]) for (let z = 0; z < 10; z++) dot(at(1, t, z, 5), TIMBER[1])
  } else if (kind === 'toll') {
    // A red and white barrier on posts out in front of the shaded wall, and a tall flagpole beside it.
    for (let t = 8; t <= 50; t++) {
      const color = Math.floor(t / 4) % 2 === 0 ? rgb(0xc23a2c) : rgb(0xf0e8d8)
      dot(at(1, t, 10, 12), color)
      dot(at(1, t, 11, 12), color)
    }
    for (const t of [8, 50]) for (let z = 0; z < 12; z++) dot(at(1, t, z, 12), TIMBER[1])
    // The flagpole stands off the shaded wall's far corner, clear of the roof.
    const pole = at(1, 6, 0, 8)
    for (let z = 0; z < wall + 52; z++) {
      canvas.set(pole.x, pole.y - z, TIMBER[2])
      canvas.set(pole.x + 1, pole.y - z, TIMBER[0])
    }
    canvas.set(pole.x, pole.y - wall - 53, rgb(0xd9b44a))
    for (let y = 0; y < 8; y++) {
      for (let x = 2; x < 15; x++) {
        const wave = Math.round(Math.sin(x * 0.6) * 0.8)
        canvas.set(pole.x + x, pole.y - wall - 50 + y + wave, y === 3 || y === 4 ? rgb(0xf0e8d8) : CLOTH[0][x < 8 ? 2 : 1])
      }
    }
    box(1, 26, 4, 5, 3, 4, SACK)
  } else {
    // Barrels by the door and a sign on a bracket over it.
    barrel(-1, 33, 4)
    barrel(-1, 37, 7)
    barrel(1, 50, 4)
    const bracket = at(-1, 64, 24, 0)
    for (let i = 0; i < 7; i++) canvas.set(bracket.x - i, bracket.y + i / 2, TIMBER[0])
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        const edge = y === 0 || x === 0 || y === 5 || x === 5
        canvas.set(bracket.x - 8 + x, bracket.y + 4 + y + x / 2, edge ? TIMBER[0] : (x === 2 || x === 3) && y > 1 ? rgb(0xd9b44a) : TIMBER[2])
      }
    }
  }
}

// A door on the lit wall and windows in bays along both walls.
const door = (side: number, t: number, z: number, from: number, to: number, tall: number) =>
  side < 0 && t > from && t < to && z < tall

// Plaster walls in a timber frame, with a tiled roof.
const timber = (roofColors: Uint32Array): Style => ({
  wallHeight: 30,
  wall(side, t, z) {
    let color = side < 0 ? WALL[3] : WALL[1]
    if (hash(t >> 2, z >> 2, 7 + side) > 0.8) color = side < 0 ? WALL[4] : WALL[2]
    if (z < 4) color = side < 0 ? rgb(0x8d8a86) : rgb(0x6a6770)
    if (t % 21 === 0 || z === 30 || z === 16 || t === TILE_WIDTH) color = TIMBER[side < 0 ? 2 : 1]
    const bay = t % 21
    if (z > 18 && z < 28 && bay > 6 && bay < 15) color = bay === 10 || z === 23 ? TIMBER[0] : GLASS[side < 0 ? 2 : 1]
    if (door(side, t, z, 46, 59, 15)) color = t === 52 ? TIMBER[0] : TIMBER[1]
    return color
  },
  roof: {
    height: 44,
    eave: 4,
    color(side, x, y, edge) {
      if (edge) return roofColors[side < 0 ? 1 : 0]
      const course = Math.floor(y / 4)
      const shingle = Math.floor(y) % 4 === 0 || (x + course * 3) % 7 === 0
      return pick(roofColors, (side < 0 ? 4 : 2) - (shingle ? 1 : 0) + (hash(x >> 1, course, 9) > 0.75 ? 0.6 : 0))
    },
  },
  chimneys: [{ dx: 24, height: 18 }],
})

// Dressed stone with a slate roof, on high and rocky ground.
const stone: Style = {
  wallHeight: 34,
  wall(side, t, z) {
    const course = Math.floor(z / 5)
    const joint = z % 5 === 0 || (t + (course & 1) * 5) % 10 === 0
    const lit = side < 0
    let color = pick(STONE, (lit ? 4 : 2.2) - (joint ? 1.4 : 0) + (hash(Math.floor((t + (course & 1) * 5) / 10), course, 17 + side) - 0.5) * 0.9)
    if (t < 3 || t > TILE_WIDTH - 3) color = STONE[lit ? 5 : 3]
    const bay = t % 21
    if (z > 20 && z < 30 && bay > 8 && bay < 14) color = z < 22 ? STONE[1] : GLASS[lit ? 2 : 1]
    if (door(side, t, z, 45, 58, 17)) color = z === 16 || t === 46 || t === 57 ? STONE[2] : TIMBER[t % 3 === 0 ? 0 : 1]
    return color
  },
  roof: {
    height: 50,
    eave: 3,
    color(side, x, y, edge) {
      if (edge) return SLATE[side < 0 ? 2 : 0]
      const course = Math.floor(y / 3)
      const joint = Math.floor(y) % 3 === 0 || (x + course * 2) % 5 === 0
      return pick(SLATE, (side < 0 ? 4.2 : 2) - (joint ? 1.2 : 0) + (hash(x >> 2, course, 19) > 0.8 ? 0.7 : 0))
    },
  },
  chimneys: [
    { dx: 26, height: 20 },
    { dx: -36, height: 16 },
  ],
}

// Log walls under a deep thatch, in the woods.
const lodge = (roofColors: Uint32Array, mossy: boolean): Style => ({
  wallHeight: 26,
  wall(side, t, z) {
    const lit = side < 0
    const log = Math.floor(z / 4)
    const seam = z % 4 === 0
    let color = pick(LOG, (lit ? 3 : 1.8) - (seam ? 1.3 : 0) + (z % 4 === 2 && lit ? 0.6 : 0) + (hash(t >> 3, log, 23) - 0.5) * 0.6)
    // Log ends cross at the corners.
    if (t < 3 || t > TILE_WIDTH - 3) color = seam ? LOG[0] : LOG[lit ? 4 : 3]
    const bay = (t + 6) % 26
    if (z > 12 && z < 21 && bay > 8 && bay < 17) color = bay === 9 || bay === 16 ? rgb(0x7a3a28) : GLASS[lit ? 2 : 1]
    if (door(side, t, z, 44, 56, 16)) color = (t - 44) % 4 === 0 ? TIMBER[0] : TIMBER[2]
    return color
  },
  roof: {
    height: 40,
    eave: 7,
    color(side, x, y, edge) {
      if (edge) return roofColors[side < 0 ? 1 : 0]
      // Straw lies in short downward strokes, laid in courses.
      const stroke = hash(x, Math.floor(y / 3), 29) - 0.5
      const course = Math.floor(y) % 7 === 0 ? -0.9 : 0
      let color = pick(roofColors, (side < 0 ? 3.8 : 2) + stroke * 1.4 + course)
      if (mossy && hash(x >> 2, Math.floor(y) >> 2, 31) > 0.82) color = MOSS_ROOF[side < 0 ? 3 : 2]
      return color
    },
  },
  chimneys: [{ dx: 18, height: 16 }],
})

// A caravanserai of sun-dried brick in the desert: high walls, small windows, a gate and a domed flat roof.
const caravanserai: Style = {
  wallHeight: 32,
  wall(side, t, z) {
    const lit = side < 0
    let color = pick(ADOBE, (lit ? 4 : 2) + (hash(t >> 1, z >> 1, 37 + side) > 0.85 ? -0.7 : 0))
    if (z < 3) color = ADOBE[lit ? 2 : 1]
    // Roof beams poke out under the parapet.
    if (z === 27 && t % 9 === 4) color = TIMBER[1]
    const bay = t % 16
    if (z > 18 && z < 24 && bay > 6 && bay < 10) color = rgb(0x2a2018)
    // An arched gate with a lighter brick surround.
    const g = (t - 48) / 7
    const arch = 14 + Math.sqrt(Math.max(0, 1 - g * g)) * 5
    if (lit && Math.abs(g) < 1.2 && z < arch + 1.5) color = Math.abs(g) < 1 && z < arch ? TIMBER[0] : ADOBE[5]
    return color
  },
  chimneys: [{ dx: 30, height: 9 }],
}

const STYLES: Style[] = [timber(ROOF), timber(SLATE), stone, lodge(THATCH, false), lodge(THATCH, true), caravanserai]
const DESERT = 5
// Each style with each trade, made when first seen.
const looks = new Map<number, InnLook>()
export const innLookOf = (style: number, kind: InnKind) => {
  const key = style * 8 + ['inn', 'market', 'post', 'toll'].indexOf(kind)
  let look = looks.get(key)
  if (!look) looks.set(key, (look = build(STYLES[style], kind)))
  return look
}

// The look of an inn follows the ground it stands on: caravanserais in the desert, stone near the mountains, log
// lodges in the woods, timber-framed houses elsewhere.
export function innLook(world: World, inn: Point): InnLook {
  return innLookOf(innStyle(world, inn), innKind(world, inn))
}

// Whether the inn is a caravanserai of the desert.
export const isCaravanserai = (world: World, inn: Point) => innStyle(world, inn) === DESERT

function innStyle(world: World, inn: Point): number {
  const { size, terrain, height, levels, moisture } = world
  const i = (inn.y + 1) * size + inn.x + 1
  const roll = hash(inn.x, inn.y, world.seed + 991)
  const near = (r: number, match: (t: number) => boolean) => {
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const x = Math.min(size - 1, Math.max(0, inn.x + dx))
        const y = Math.min(size - 1, Math.max(0, inn.y + dy))
        if (match(terrain[y * size + x])) return true
      }
    }
    return false
  }
  if (terrain[i] === Terrain.Desert || moisture[i] < levels.desert + 0.01) return DESERT
  if (height[i] > 70 || near(10, (t) => t === Terrain.Mountain)) return roll < 0.75 ? 2 : 1
  if (terrain[i] === Terrain.Forest || near(4, (t) => t === Terrain.Forest)) return roll < 0.5 ? 3 : 4
  return roll < 0.45 ? 0 : roll < 0.7 ? 1 : roll < 0.85 ? 3 : 2
}

// Puffs of chimney smoke, small to large.
function puff(r: number): Sprite {
  const size = Math.ceil(r * 2) + 2
  const canvas = new Canvas(size, size)
  shadeBlobs(canvas, [{ x: size / 2, y: size / 2, r }, { x: size / 2 + r * 0.4, y: size / 2 - r * 0.3, r: r * 0.7 }], SMOKE, 61 + r, 0.9)
  return canvas.sprite(size >> 1, size >> 1, 0)
}
export const SMOKE_PUFFS = [puff(1.6), puff(2.4), puff(3.2), puff(4.2), puff(5.2)]
