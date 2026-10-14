import { Feature, MAX_HEIGHT, TILE_HEIGHT, TILE_WIDTH, Terrain, balance, hash, heightAt } from '@game/shared'
import type { World } from '@game/shared'
import { Container, Sprite as PixiSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { ROUTE_STEP, resampleRoute } from './chunkPainter'
import { SMOKE_PUFFS, innLook } from './innSprites'
import { harbourOf } from './cities'
import { ship } from './shipSprites'
import { SPRITES, cloudShapes } from './sprites'
import type { Sprite } from './sprites'
import { textureOf } from './textures'

// Ambient life drawn over the painted ground: the current on rivers, animals, birds and clouds. It is purely
// visual and follows from the clock and the world seed, so every client shows the same scene without storing it.

export interface View {
  left: number
  top: number
  right: number
  bottom: number
}

// Zoom ranges where each kind of life shows.
const FLOW_MIN_ZOOM = 1
const LIFE_MIN_ZOOM = 0.5
const CLOUD_MAX_ZOOM = 0.25
// Tiles per side of the buckets things are looked up in by position.
const CELL = 16

// River current: glints drift downstream for FLOW_LIFE tiles while fading in and out.
const FLOW_LIFE = 2.5
const FLOW_SPEED = [0.8, 1.3]
const FLOW_ALPHA = 0.6

// Birds fly in loose V formations at this height above the ground (pixels), in tiles per second.
const FLOCKS = 280
const BIRD_ALTITUDE = 150
const BIRD_SPEED = [2.2, 3.6]

// Chimney smoke: puffs per chimney, seconds each one lives, how high it rises and how far the wind carries it.
const SMOKE_PUFFS_PER_CHIMNEY = 8
const SMOKE_LIFE = 7
const SMOKE_RISE = 54
const SMOKE_DRIFT = 22

// Clouds: drawn magnified by CLOUD_SCALE (varied per cloud by CLOUD_SIZE), drifting in pixels per second; opacity
// at the farthest zoom.
const CLOUDS = 220
// How common each cloud type is (cumulus, stratus, cirrus, scattered) and how opaque it looks.
const CLOUD_TYPES = [
  { weight: 0.35, alpha: 1 },
  { weight: 0.2, alpha: 0.85 },
  { weight: 0.25, alpha: 0.6 },
  { weight: 0.2, alpha: 0.9 },
]
const CLOUD_SCALE = 13
const CLOUD_SIZE = [0.7, 1.5]
const CLOUD_DRIFT = [18, 36]
const CLOUD_ALPHA = 0.45

interface Kind {
  frames: Sprite[][]
  // Seconds per rest-and-move cycle, the share of it spent moving, and how far from home it roams (tiles).
  period: number
  move: number
  range: number
  strides: number
  // Animals on water float at the water surface.
  water: boolean
  allowed: (terrain: number) => boolean
}

const KINDS: Record<string, Kind> = {
  deer: {
    frames: [SPRITES.deer, SPRITES.stag],
    period: 11,
    move: 0.3,
    range: 4,
    strides: 4,
    water: false,
    allowed: (t) => t === Terrain.Grass || t === Terrain.Forest,
  },
  hare: {
    frames: [SPRITES.hare],
    period: 6,
    move: 0.25,
    range: 3,
    strides: 6,
    water: false,
    allowed: (t) => t === Terrain.Grass,
  },
  goat: {
    frames: [SPRITES.goat],
    period: 12,
    move: 0.3,
    range: 3,
    strides: 5,
    water: false,
    allowed: (t) => t === Terrain.Mountain,
  },
  duck: {
    frames: [SPRITES.duck],
    period: 9,
    move: 0.5,
    range: 3,
    strides: 0,
    water: true,
    allowed: (t) => t === Terrain.Lake || t === Terrain.River,
  },
  wolf: {
    frames: [SPRITES.wolf],
    period: 9,
    move: 0.4,
    range: 7,
    strides: 5,
    water: false,
    allowed: (t) => t === Terrain.Forest || t === Terrain.Grass,
  },
  fox: {
    frames: [SPRITES.fox],
    period: 7,
    move: 0.35,
    range: 4,
    strides: 7,
    water: false,
    allowed: (t) => t === Terrain.Grass || t === Terrain.Forest,
  },
  boar: {
    frames: [SPRITES.boar],
    period: 10,
    move: 0.25,
    range: 3,
    strides: 6,
    water: false,
    allowed: (t) => t === Terrain.Forest || t === Terrain.Swamp,
  },
  bear: {
    frames: [SPRITES.bear],
    period: 16,
    move: 0.3,
    range: 4,
    strides: 3,
    water: false,
    allowed: (t) => t === Terrain.Forest || t === Terrain.Mountain,
  },
  horse: {
    frames: SPRITES.horse,
    period: 13,
    move: 0.3,
    range: 6,
    strides: 3,
    water: false,
    allowed: (t) => t === Terrain.Grass,
  },
  aurochs: {
    frames: [SPRITES.aurochs],
    period: 15,
    move: 0.25,
    range: 5,
    strides: 3,
    water: false,
    allowed: (t) => t === Terrain.Grass,
  },
  sheep: {
    frames: [SPRITES.sheep],
    period: 10,
    move: 0.3,
    range: 3,
    strides: 5,
    water: false,
    allowed: (t) => t === Terrain.Grass || t === Terrain.Mountain,
  },
  gazelle: {
    frames: [SPRITES.gazelle],
    period: 9,
    move: 0.3,
    range: 5,
    strides: 5,
    water: false,
    allowed: (t) => t === Terrain.Desert || t === Terrain.Grass,
  },
  swan: {
    frames: [SPRITES.swan],
    period: 12,
    move: 0.5,
    range: 3,
    strides: 0,
    water: true,
    allowed: (t) => t === Terrain.Lake,
  },
  heron: {
    frames: [SPRITES.heron],
    period: 14,
    move: 0.25,
    range: 2,
    strides: 3,
    water: false,
    allowed: (t) => t === Terrain.Swamp,
  },
}

interface Animal {
  kind: Kind
  look: Sprite[]
  frames: Texture[]
  homeX: number
  homeY: number
  id: number
  offset: number
}

interface Streak {
  river: number
  base: number
  lateral: number
  speed: number
  phase: number
  texture: Texture
}

interface RiverTrack {
  x: Float32Array
  y: Float32Array
  // Points hidden behind nearer raised ground or under a bridge.
  hidden: Uint8Array
  length: number
}

// Sprites handed out each frame and hidden again when no longer needed.
class Pool {
  private sprites: PixiSprite[] = []
  private used = 0
  private layer: Container
  constructor(layer: Container) {
    this.layer = layer
  }
  take(texture: Texture): PixiSprite {
    let sprite = this.sprites[this.used]
    if (!sprite) {
      sprite = new PixiSprite(texture)
      this.layer.addChild(sprite)
      this.sprites.push(sprite)
    }
    this.used++
    sprite.texture = texture
    sprite.visible = true
    return sprite
  }
  finish() {
    for (let i = this.used; i < this.sprites.length; i++) this.sprites[i].visible = false
    this.used = 0
  }
}

const anchored = (sprite: PixiSprite, source: Sprite) =>
  sprite.anchor.set(source.anchorX / source.width, source.anchorY / source.height)

export interface Ambient {
  // Ground-level overlays (the current, bird shadows), below the walkers.
  under: Container
  // Birds and clouds, above everything on the ground.
  sky: Container
  update(seconds: number, view: View, zoom: number): void
  // Ground animals keep off tiles where this holds (the player's buildings).
  setBlocked(blocked: (x: number, y: number) => boolean): void
  // Chimney tops of the player's buildings (screen points, and the depth to sort the smoke at).
  setChimneys(points: { x: number; y: number; depth: number }[]): void
}

export function createAmbient(world: World, actors: Container): Ambient {
  const { size, seed } = world
  const under = new Container()
  const sky = new Container()
  const cells = size / CELL
  const bucket = <T>() => Array.from({ length: cells * cells }, () => [] as T[])
  const cellOf = (x: number, y: number) =>
    Math.min(cells - 1, Math.max(0, Math.floor(y / CELL))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)))
  const terrainAt = (x: number, y: number) => {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    if (tx < 0 || ty < 0 || tx >= size || ty >= size) return -1
    return world.feature[ty * size + tx] === Feature.None ? world.terrain[ty * size + tx] : -1
  }
  const toScreen = (x: number, y: number, z: number) => ({
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2) - z,
  })

  // Buckets overlapping the view; raised ground below the view's bottom edge can reach into it.
  function visibleCells(view: View, reach: number) {
    const corners = [
      [view.left, view.top],
      [view.right, view.top],
      [view.left, view.bottom + reach],
      [view.right, view.bottom + reach],
    ].map(([sx, sy]) => ({
      x: (sy / (TILE_HEIGHT / 2) + sx / (TILE_WIDTH / 2)) / 2,
      y: (sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2,
    }))
    const clamp = (v: number) => Math.min(cells - 1, Math.max(0, Math.floor(v / CELL)))
    const x0 = clamp(Math.min(...corners.map((c) => c.x)))
    const x1 = clamp(Math.max(...corners.map((c) => c.x)))
    const y0 = clamp(Math.min(...corners.map((c) => c.y)))
    const y1 = clamp(Math.max(...corners.map((c) => c.y)))
    const list: number[] = []
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) list.push(cy * cells + cx)
    return list
  }
  const inView = (view: View, sx: number, sy: number, margin: number) =>
    sx > view.left - margin && sx < view.right + margin && sy > view.top - margin && sy < view.bottom + margin

  // --- River current ---
  const tracks: RiverTrack[] = world.rivers.map((river) => {
    const line = resampleRoute(river.points)
    const n = line.length
    const track: RiverTrack = {
      x: Float32Array.from(line, (p) => p.x),
      y: Float32Array.from(line, (p) => p.y),
      hidden: new Uint8Array(n),
      length: (n - 1) * ROUTE_STEP,
    }
    for (let i = 0; i < n; i++) {
      const { x, y } = line[i]
      let hidden = false
      for (let dy = -1; dy <= 1 && !hidden; dy++) {
        for (let dx = -1; dx <= 1 && !hidden; dx++) hidden = world.feature[(Math.floor(y) + dy) * size + Math.floor(x) + dx] === Feature.Bridge
      }
      // Ground d tiles nearer the viewer along the line of sight covers the water if it rises above it.
      for (let d = 0.5; !hidden && d * TILE_HEIGHT <= MAX_HEIGHT; d += 0.5) {
        if (x + d >= size || y + d >= size) break
        hidden = heightAt(world, x + d, y + d) > d * TILE_HEIGHT
      }
      track.hidden[i] = hidden ? 1 : 0
    }
    return track
  })
  const streaks = bucket<Streak>()
  world.rivers.forEach((river, r) => {
    const track = tracks[r]
    const spacing = 1.6 / river.width
    for (let i = 0, base = 0; base < track.length; i++, base += spacing) {
      const roll = (n: number) => hash(r * 7919 + i, n, seed + 501)
      const at = Math.min(track.x.length - 1, Math.floor(base / ROUTE_STEP))
      streaks[cellOf(track.x[at], track.y[at])].push({
        river: r,
        base: base + roll(0) * spacing,
        lateral: (roll(1) - 0.5) * river.width * 0.6,
        speed: FLOW_SPEED[0] + roll(2) * (FLOW_SPEED[1] - FLOW_SPEED[0]),
        phase: roll(3),
        texture: textureOf(SPRITES.ripple[roll(4) < 0.6 ? 0 : 1]),
      })
    }
  })
  const flowPool = new Pool(under)

  function updateFlow(seconds: number, view: View) {
    for (const cell of visibleCells(view, 0)) {
      for (const s of streaks[cell]) {
        const track = tracks[s.river]
        const p = (seconds * s.speed / FLOW_LIFE + s.phase) % 1
        const along = s.base + p * FLOW_LIFE
        const f = Math.floor(along / ROUTE_STEP)
        if (f >= track.x.length - 1 || track.hidden[f]) continue
        const t = along / ROUTE_STEP - f
        const dx = track.x[f + 1] - track.x[f]
        const dy = track.y[f + 1] - track.y[f]
        const length = Math.hypot(dx, dy) || 1
        const x = track.x[f] + dx * t - (dy / length) * s.lateral
        const y = track.y[f] + dy * t + (dx / length) * s.lateral
        const screen = toScreen(x, y, 0)
        if (!inView(view, screen.x, screen.y, 8)) continue
        const sprite = flowPool.take(s.texture)
        sprite.anchor.set(0.5, 0)
        sprite.position.set(Math.round(screen.x), Math.round(screen.y))
        sprite.alpha = Math.sin(p * Math.PI) * FLOW_ALPHA
      }
    }
    flowPool.finish()
  }

  // --- Animals ---
  const animals = bucket<Animal>()
  const step = 5
  let nextId = 0
  const spawn = (kind: Kind, x: number, y: number, count: number, variant: number) => {
    for (let m = 0; m < count; m++) {
      const id = nextId++
      const homeX = x + (hash(id, 1, seed + 601) - 0.5) * 2
      const homeY = y + (hash(id, 2, seed + 601) - 0.5) * 2
      if (!kind.allowed(terrainAt(homeX, homeY))) continue
      // A herd has one animal of the second look (a stag), if the kind has one.
      const look = kind.frames[m === 0 ? Math.min(kind.frames.length - 1, variant) : 0]
      animals[cellOf(homeX, homeY)].push({
        kind,
        look,
        frames: look.map(textureOf),
        homeX,
        homeY,
        id,
        offset: hash(id, 3, seed + 601) * 50,
      })
    }
  }
  for (let cy = 0; cy < size / step; cy++) {
    for (let cx = 0; cx < size / step; cx++) {
      const roll = (n: number) => hash(cx, cy * 16 + n, seed + 401)
      const x = cx * step + roll(0) * step
      const y = cy * step + roll(1) * step
      const terrain = terrainAt(x, y)
      const r = roll(2)
      const herd = 2 + Math.floor(roll(3) * 3)
      const near = (match: number) =>
        [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]].some(([dx, dy]) => terrainAt(x + dx, y + dy) === match)
      const nearForest = near(Terrain.Forest)
      const pack = 3 + Math.floor(roll(7) * 3)
      // A grazer herd sometimes has a second look in it (a stag, a grey horse).
      const lead = roll(4) < 0.5 ? 1 : 0
      // Half the old density, and the open grassland shared by horses, aurochs, wild sheep, hares and foxes.
      const nearMountain = near(Terrain.Mountain)
      const small = 2 + Math.floor(roll(7) * 3)
      if (terrain === Terrain.Grass) {
        if (nearForest) {
          if (r < 0.05) spawn(KINDS.deer, x, y, herd, lead)
          else if (r < 0.065) spawn(KINDS.boar, x, y, small, 0)
          else if (r < 0.08) spawn(KINDS.fox, x, y, 1, 0)
        } else if (nearMountain && r < 0.04) spawn(KINDS.sheep, x, y, pack, 0)
        else if (r < 0.03) spawn(KINDS.horse, x, y, small, lead)
        else if (r < 0.055) spawn(KINDS.aurochs, x, y, small, 0)
        else if (r < 0.075) spawn(KINDS.sheep, x, y, small, 0)
        else if (r < 0.1) spawn(KINDS.hare, x, y, 1 + Math.floor(roll(5) * 2), 0)
        else if (r < 0.112) spawn(KINDS.fox, x, y, 1, 0)
      } else if (terrain === Terrain.Forest) {
        if (r < 0.025) spawn(KINDS.deer, x, y, herd, lead)
        else if (r < 0.045) spawn(KINDS.boar, x, y, herd, 0)
        else if (r < 0.053) spawn(KINDS.wolf, x, y, pack, 0)
        else if (r < 0.063) spawn(KINDS.fox, x, y, 1, 0)
        else if (r < 0.068 && nearMountain) spawn(KINDS.bear, x, y, 1, 0)
        else if (r < 0.07) spawn(KINDS.bear, x, y, 1, 0)
      } else if (terrain === Terrain.Desert) {
        if (r < 0.03) spawn(KINDS.gazelle, x, y, pack, 0)
      } else if (terrain === Terrain.Mountain) {
        const below = heightAt(world, x, y) < balance.world.snowHeight * 0.8
        if (r < 0.035 && below) spawn(KINDS.goat, x, y, herd, 0)
        else if (r < 0.05 && below) spawn(KINDS.sheep, x, y, small, 0)
      } else if (terrain === Terrain.Lake) {
        if (r < 0.1) spawn(KINDS.duck, x, y, herd, 0)
        else if (r < 0.13) spawn(KINDS.swan, x, y, 2, 0)
      } else if (terrain === Terrain.River) {
        if (r < 0.06) spawn(KINDS.duck, x, y, 2 + Math.floor(roll(6) * 2), 0)
      } else if (terrain === Terrain.Swamp) {
        if (r < 0.06) spawn(KINDS.heron, x, y, 1 + Math.floor(roll(6) * 2), 0)
        else if (r < 0.08) spawn(KINDS.boar, x, y, herd, 0)
      }
    }
  }

  // Whether an animal can walk the straight line between two points: every half tile on ground it is allowed on, so
  // land animals never wade a river and water birds never cross land.
  const clear = (a: Animal, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2)
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps
      const y = from.y + ((to.y - from.y) * i) / steps
      if (!a.kind.allowed(terrainAt(x, y)) || blocked(Math.floor(x), Math.floor(y))) return false
    }
    return true
  }
  // Where an animal rests during cycle k: a random spot near home it can walk to straight from home, else home itself.
  const waypoints = new Map<string, { x: number; y: number }>()
  const waypoint = (a: Animal, k: number) => {
    const key = `${a.id}:${k}`
    const known = waypoints.get(key)
    if (known) return known
    const home = { x: a.homeX, y: a.homeY }
    const x = a.homeX + (hash(a.id, k * 2, seed + 701) - 0.5) * 2 * a.kind.range
    const y = a.homeY + (hash(a.id, k * 2 + 1, seed + 701) - 0.5) * 2 * a.kind.range
    const spot = clear(a, home, { x, y }) ? { x, y } : home
    if (waypoints.size > 20_000) waypoints.clear()
    waypoints.set(key, spot)
    return spot
  }
  // Two rests on either side of a bend of the river: the walk goes by way of home.
  const detours = new Map<string, boolean>()
  const viaHome = (a: Animal, k: number, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const key = `${a.id}:${k}`
    let via = detours.get(key)
    if (via === undefined) {
      via = !clear(a, from, to)
      if (detours.size > 20_000) detours.clear()
      detours.set(key, via)
    }
    return via
  }
  let blocked = (_x: number, _y: number) => false
  const lifePool = new Pool(actors)

  function updateLife(seconds: number, view: View) {
    for (const cell of visibleCells(view, MAX_HEIGHT)) {
      for (const a of animals[cell]) {
        const { kind } = a
        const u = seconds / kind.period + a.offset
        const k = Math.floor(u)
        const f = u - k
        const here = waypoint(a, k)
        const moving = f > 1 - kind.move
        const from = moving ? here : waypoint(a, k - 1)
        const to = moving ? waypoint(a, k + 1) : here
        const s = moving ? (f - (1 - kind.move)) / kind.move : 1
        let x = from.x + (to.x - from.x) * s
        let y = from.y + (to.y - from.y) * s
        if (moving && viaHome(a, k, from, to)) {
          const leg = s < 0.5 ? { a: from, b: { x: a.homeX, y: a.homeY }, t: s * 2 } : { a: { x: a.homeX, y: a.homeY }, b: to, t: s * 2 - 1 }
          x = leg.a.x + (leg.b.x - leg.a.x) * leg.t
          y = leg.a.y + (leg.b.y - leg.a.y) * leg.t
        }
        const screen = toScreen(x, y, kind.water ? 0 : heightAt(world, x, y))
        if (!inView(view, screen.x, screen.y, 24)) continue
        let frame: number
        if (kind.water) frame = Math.floor(seconds * 1.5 + a.offset) % 2
        else if (moving) frame = Math.floor(Math.hypot(to.x - from.x, to.y - from.y) * s * kind.strides) % 2
        else frame = hash(a.id, k, seed + 703) < 0.6 ? 2 : 0
        const sprite = lifePool.take(a.frames[frame])
        anchored(sprite, a.look[frame])
        sprite.position.set(Math.round(screen.x), Math.round(screen.y))
        sprite.zIndex = screen.y
        sprite.scale.x = to.x - from.x - (to.y - from.y) < 0 ? -1 : 1
      }
    }
    lifePool.finish()
  }

  // --- Chimney smoke ---
  // Puffs rise from every inn chimney, swell, drift downwind and fade. They sort with the walkers just in front of
  // the inn, so caravans passing in front cover them.
  const innChimneys = world.inns.flatMap((p, n) => {
    const sx = (p.x - p.y) * (TILE_WIDTH / 2)
    const sy = (p.x + p.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, p.x + 1, p.y + 1)
    return innLook(world, p).smoke.map((c, m) => ({ x: sx + c.x, y: sy + c.y, depth: sy + 1, phase: hash(n, m, seed + 951) }))
  })
  // The player's buildings add theirs (see setChimneys).
  let chimneys = innChimneys
  const puffTextures = SMOKE_PUFFS.map(textureOf)
  const smokePool = new Pool(actors)

  function updateSmoke(seconds: number, view: View) {
    for (const c of chimneys) {
      if (!inView(view, c.x, c.y, SMOKE_RISE + 16)) continue
      for (let i = 0; i < SMOKE_PUFFS_PER_CHIMNEY; i++) {
        const p = (seconds / SMOKE_LIFE + i / SMOKE_PUFFS_PER_CHIMNEY + c.phase) % 1
        const sway = Math.sin(seconds * 0.8 + i * 1.7 + c.phase * 9) * 2 * p
        const size = Math.min(puffTextures.length - 1, Math.floor(p * puffTextures.length * 1.1))
        const sprite = smokePool.take(puffTextures[size])
        sprite.label = 'smoke'
        sprite.anchor.set(0.5, 0.5)
        sprite.position.set(Math.round(c.x + p * p * SMOKE_DRIFT + sway), Math.round(c.y - p * SMOKE_RISE))
        sprite.alpha = 0.7 * Math.min(1, p * 10) * (1 - p) ** 1.3
        sprite.zIndex = c.depth
      }
    }
    smokePool.finish()
  }

  // --- Birds ---
  const flocks = Array.from({ length: FLOCKS }, (_, i) => {
    const roll = (n: number) => hash(i, n, seed + 801)
    const angle = roll(0) * Math.PI * 2
    return {
      x: roll(1) * size,
      y: roll(2) * size,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      speed: BIRD_SPEED[0] + roll(3) * (BIRD_SPEED[1] - BIRD_SPEED[0]),
      members: 3 + Math.floor(roll(4) * 5),
    }
  })
  const birdTextures = SPRITES.bird.map(textureOf)
  const shadowTexture = textureOf(SPRITES.ripple[0])
  const birdShadows = new Pool(under)
  const birdPool = new Pool(sky)
  const wrap = (v: number) => ((v % size) + size) % size

  function updateBirds(seconds: number, view: View) {
    flocks.forEach((flock, i) => {
      for (let m = 0; m < flock.members; m++) {
        // V formation: the leader in front, the others trailing off to alternate sides.
        const row = Math.ceil(m / 2)
        const side = (m % 2 === 0 ? 1 : -1) * row * 0.7
        const x = wrap(flock.x + flock.dx * (seconds * flock.speed - row * 0.9) - flock.dy * side)
        const y = wrap(flock.y + flock.dy * (seconds * flock.speed - row * 0.9) + flock.dx * side)
        const ground = heightAt(world, x, y)
        const alt = BIRD_ALTITUDE + Math.sin(seconds * 0.7 + i + m) * 6
        const screen = toScreen(x, y, ground + alt)
        if (!inView(view, screen.x, screen.y, 16)) continue
        const bird = birdPool.take(birdTextures[Math.floor(seconds * 5 + m * 1.7 + i) % 2])
        bird.anchor.set(0.5, 0.5)
        bird.position.set(Math.round(screen.x), Math.round(screen.y))
        // Light comes from the upper left, so shadows fall a little down and to the right.
        const shade = toScreen(x, y, ground)
        const shadow = birdShadows.take(shadowTexture)
        shadow.anchor.set(0.5, 0.5)
        shadow.tint = 0x000000
        shadow.alpha = 0.25
        shadow.position.set(Math.round(shade.x + alt * 0.25), Math.round(shade.y + alt * 0.12))
      }
    })
    birdPool.finish()
    birdShadows.finish()
  }

  // --- Harbour ships ---
  // The big ships of the free cities: moored ones rock gently at the jetties, a sailing one goes out across the lake
  // and comes back, its bow always the way it goes. Their looks are made on first sight.
  const ships = world.cities.flatMap((_, index) => {
    const harbour = harbourOf(world, index)
    return harbour ? harbour.ships.map((s) => ({ ...s, reverse: harbour.reverse })) : []
  })
  const shipLooks = new Map<string, { sprite: Sprite; texture: Texture }>()
  const shipLook = (along: 'x' | 'y', sailing: boolean, seed: number, reverse: boolean) => {
    const key = `${along}:${sailing}:${seed % 3}:${reverse}`
    let look = shipLooks.get(key)
    if (!look) {
      const sprite = ship(along, sailing, seed % 3, reverse)
      look = { sprite, texture: textureOf(sprite) }
      shipLooks.set(key, look)
    }
    return look
  }
  const shipPool = new Pool(actors)

  function updateShips(seconds: number, view: View) {
    for (const s of ships) {
      let { x, y } = s.at
      let reverse = s.reverse
      if (s.to && s.period) {
        const u = (seconds / s.period + s.seed * 0.137) % 1
        const outward = u < 0.5
        const f = outward ? u * 2 : 2 - u * 2
        const e = f * f * (3 - 2 * f)
        x += (s.to.x - x) * e
        y += (s.to.y - y) * e
        if (!outward) reverse = !reverse
      }
      const screen = toScreen(x, y, 0)
      if (!inView(view, screen.x, screen.y, 200)) continue
      const look = shipLook(s.along, s.sailing, s.seed, reverse)
      const sprite = shipPool.take(look.texture)
      anchored(sprite, look.sprite)
      const bob = Math.round(Math.sin(seconds * 1.1 + s.seed) * 1)
      sprite.position.set(Math.round(screen.x), Math.round(screen.y) + bob)
      sprite.zIndex = screen.y
    }
    shipPool.finish()
  }

  // --- Clouds ---
  const span = { left: -size * (TILE_WIDTH / 2), width: size * TILE_WIDTH, height: size * (TILE_HEIGHT / 2) * 2 }
  const clouds = Array.from({ length: CLOUDS }, (_, i) => {
    const roll = (n: number) => hash(i, n, seed + 901)
    let pick = roll(4)
    let type = 0
    while (type < CLOUD_TYPES.length - 1 && pick > CLOUD_TYPES[type].weight) pick -= CLOUD_TYPES[type++].weight
    const shapes = cloudShapes()[type]
    return {
      x: roll(0) * span.width,
      y: roll(1) * span.height - span.height * 0.25,
      drift: CLOUD_DRIFT[0] + roll(2) * (CLOUD_DRIFT[1] - CLOUD_DRIFT[0]),
      sprite: shapes[Math.floor(roll(3) * shapes.length)],
      alpha: CLOUD_TYPES[type].alpha,
      scale: CLOUD_SCALE * (CLOUD_SIZE[0] + roll(5) * (CLOUD_SIZE[1] - CLOUD_SIZE[0])),
    }
  })
  const shadowLayer = new Container()
  const cloudLayer = new Container()
  sky.addChild(shadowLayer, cloudLayer)
  const cloudShadows = new Pool(shadowLayer)
  const cloudPool = new Pool(cloudLayer)

  function updateClouds(seconds: number, view: View, alpha: number) {
    for (const cloud of clouds) {
      const sx = span.left + ((((cloud.x + seconds * cloud.drift) % span.width) + span.width) % span.width)
      const sy = cloud.y
      const reach = cloud.sprite.width * cloud.scale
      if (!inView(view, sx, sy, reach)) continue
      // Only over the map: the center must fall on a tile.
      const tx = (sy / (TILE_HEIGHT / 2) + sx / (TILE_WIDTH / 2)) / 2
      const ty = (sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2
      if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue
      const texture = textureOf(cloud.sprite)
      const shadow = cloudShadows.take(texture)
      anchored(shadow, cloud.sprite)
      shadow.scale.set(cloud.scale)
      shadow.tint = 0x000000
      shadow.alpha = alpha * cloud.alpha * 0.22
      shadow.position.set(Math.round(sx + cloud.scale * 85), Math.round(sy + cloud.scale * 110))
      const sprite = cloudPool.take(texture)
      anchored(sprite, cloud.sprite)
      sprite.scale.set(cloud.scale)
      sprite.alpha = alpha * cloud.alpha
      sprite.position.set(Math.round(sx), Math.round(sy))
    }
    cloudShadows.finish()
    cloudPool.finish()
  }

  return {
    under,
    sky,
    setBlocked(next) {
      blocked = next
      // New buildings change which walks are clear.
      waypoints.clear()
      detours.clear()
    },
    setChimneys(points) {
      chimneys = [...innChimneys, ...points.map((c, i) => ({ ...c, phase: hash(i, Math.round(c.x), seed + 953) }))]
    },
    update(seconds, view, zoom) {
      updateShips(seconds, view)
      if (zoom >= FLOW_MIN_ZOOM) updateFlow(seconds, view)
      else flowPool.finish()
      if (zoom >= LIFE_MIN_ZOOM) {
        updateLife(seconds, view)
        updateBirds(seconds, view)
        updateSmoke(seconds, view)
      } else {
        lifePool.finish()
        smokePool.finish()
        birdPool.finish()
        birdShadows.finish()
      }
      if (zoom <= CLOUD_MAX_ZOOM) updateClouds(seconds, view, zoom <= 0.125 ? CLOUD_ALPHA : CLOUD_ALPHA * 0.55)
      else {
        cloudShadows.finish()
        cloudPool.finish()
      }
    },
  }
}
