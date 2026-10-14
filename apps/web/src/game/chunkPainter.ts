import { Feature, MAX_HEIGHT, TILE_HEIGHT, TILE_WIDTH, Terrain, balance, hash, heightAt, valueNoise } from '@game/shared'
import type { Point, World } from '@game/shared'
import { structureParts } from './buildingSprites'
import type { Structure } from './buildingSprites'
import { innLook } from './innSprites'
import { BAYER, SPRITES, castShadow, ramp } from './sprites'
import type { Sprite } from './sprites'
import type { SunShadow } from './daylight'

// This module has no DOM dependency: it runs in a worker (and in headless previews) and returns raw pixels.

// Screen pixels kept above a chunk for raised ground and for trees and buildings on its top rows.
export const CHUNK_PAD = Math.ceil((MAX_HEIGHT + 64) / 32) * 32
// Tiles around a chunk whose sprites can reach into it.
const SPRITE_MARGIN = 3

export interface ChunkImage {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
  // Trees left out of the painting to be drawn (and sway) as sprites of their own: which list and which sprite of it,
  // and where they stand (tile coordinates).
  trees?: LiftedTree[]
}

export type TreeSet = 'pine' | 'leaf' | 'fir' | 'birch' | 'poplar' | 'autumn' | 'blossom' | 'bigBlossom' | 'oak' | 'giantPine' | 'fruit'

export interface LiftedTree {
  set: TreeSet
  index: number
  tx: number
  ty: number
}

export interface PaintContext {
  world: World
  // Per tile: how much the slope faces the light (upper left of the screen).
  lit: Float32Array
  // Per tile: broad patches of tone variation.
  patch: Float32Array
  // Per tile: distance to the nearest trade route center line, in tiles.
  road: Float32Array
  bridges: Bridge[]
  // The player's buildings, and per tile whether one stands on or right next to it (no trees or rocks grow there, so
  // none covers a wall).
  structures: Structure[]
  occupied: Uint8Array
  // Per tile: distance to the nearest footpath between the player's buildings, in tiles.
  trail: Float32Array
  // Per tile near a footpath, the footpath segments passing close by ([ax, ay, bx, by] each): close to a path the
  // painting measures the distance to them exactly, as tile-centre distances blend a thin line crossing a tile
  // corner-wise into a string of dots.
  trailNear: Map<number, number[]>
}

export type { Structure }

// Footpaths are this many tiles wide either side of their center line.
const TRAIL_HALF = 0.2
const TRAIL_REACH = 2
// How far a footpath wanders off its straight line, in tiles (peak to peak).
const WANDER = 1.3
// Within this many tiles of a footpath, the distance to it is measured exactly (see PaintContext.trailNear).
const NEAR_TRAIL = 0.6
// A footpath with a loose end (one not joining another path) narrows and breaks up over this many tiles before it.
const TRAIL_TAPER = 2.5

// Distance from (x, y) to the nearest of the segments ([ax, ay, bx, by, fromStart, toEnd] each: how far along the
// path a lies from its loose start, and b from its loose end; Infinity where that end joins another path). Toward a
// loose end the path is measured as farther away than it is, in patches, so it thins out into the grass.
const SEGMENT = 6
function segmentDistance(segments: number[], x: number, y: number, seed: number) {
  let best = Infinity
  for (let i = 0; i < segments.length; i += SEGMENT) {
    const ax = segments[i]
    const ay = segments[i + 1]
    const bx = segments[i + 2]
    const by = segments[i + 3]
    const fromStart = segments[i + 4]
    const toEnd = segments[i + 5]
    const dx = bx - ax
    const dy = by - ay
    const length = Math.hypot(dx, dy)
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (length * length || 1)))
    let d = Math.hypot(x - ax - dx * t, y - ay - dy * t)
    const along = Math.min(fromStart + t * length, toEnd + (1 - t) * length)
    if (along < TRAIL_TAPER) {
      const f = along / TRAIL_TAPER
      const worn = f * f * (3 - 2 * f)
      d += TRAIL_HALF * (1 - worn) * (0.55 + valueNoise(x * 2.6, y * 2.6, seed + 99) * 0.9)
    }
    best = Math.min(best, d)
  }
  return best
}

export function setStructures(context: PaintContext, structures: Structure[], trails: Point[][]) {
  const { size } = context.world
  context.structures = structures
  context.occupied = new Uint8Array(size * size)
  for (const s of structures) {
    for (let y = Math.max(0, s.y - 1); y < Math.min(size, s.y + s.size + 1); y++) {
      for (let x = Math.max(0, s.x - 1); x < Math.min(size, s.x + s.size + 1); x++) context.occupied[y * size + x] = 1
    }
    // A dock's jetty reaches over the water, where rushes would grow through it.
    const p = s.pier
    if (!p) continue
    for (let y = Math.max(0, p.y - 1); y < Math.min(size, p.y + p.h + 1); y++) {
      for (let x = Math.max(0, p.x - 1); x < Math.min(size, p.x + p.w + 1); x++) context.occupied[y * size + x] = 1
    }
  }
  context.trail = new Float32Array(size * size).fill(TRAIL_REACH + 1)
  context.trailNear = new Map()
  // An end of a path is loose unless it meets another path there (a branch joining a trunk), reaches a building's
  // door (or a field it crosses into), or comes out on a trade route.
  const atBuilding = (p: Point) =>
    structures.some((s) => p.x > s.x - 0.8 && p.x < s.x + s.size + 0.8 && p.y > s.y - 0.8 && p.y < s.y + s.size + 0.8)
  const atRoad = (p: Point) =>
    context.road[Math.min(size - 1, Math.max(0, Math.floor(p.y))) * size + Math.min(size - 1, Math.max(0, Math.floor(p.x)))] < ROAD_HALF + 1.6
  const meets = (p: Point, own: Point[]) =>
    atBuilding(p) ||
    atRoad(p) ||
    trails.some((other) => {
      if (other === own) return false
      for (let i = 1; i < other.length; i++) {
        const a = other[i - 1]
        const b = other[i]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        if (Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t) < 0.6) return true
      }
      return false
    })
  for (const line of trails) {
    if (line.length < 2) continue
    // How far along the path each point lies from the start and from the end.
    const run = [0]
    for (let i = 1; i < line.length; i++) run.push(run[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y))
    const total = run[run.length - 1]
    const startLoose = !meets(line[0], line)
    const endLoose = !meets(line[line.length - 1], line)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const fromStart = startLoose ? run[i - 1] : Infinity
      const toEnd = endLoose ? total - run[i] : Infinity
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSq = dx * dx + dy * dy || 1
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y)) - TRAIL_REACH); y <= Math.min(size - 1, Math.floor(Math.max(a.y, b.y)) + TRAIL_REACH); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x)) - TRAIL_REACH); x <= Math.min(size - 1, Math.floor(Math.max(a.x, b.x)) + TRAIL_REACH); x++) {
          const t = Math.min(1, Math.max(0, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / lengthSq))
          const d = Math.hypot(x + 0.5 - a.x - dx * t, y + 0.5 - a.y - dy * t)
          if (d < context.trail[y * size + x]) context.trail[y * size + x] = d
          if (d < NEAR_TRAIL + 0.75 + WANDER / 2) {
            const near = context.trailNear.get(y * size + x)
            if (near) near.push(a.x, a.y, b.x, b.y, fromStart, toEnd)
            else context.trailNear.set(y * size + x, [a.x, a.y, b.x, b.y, fromStart, toEnd])
          }
        }
      }
    }
  }
}

// A straight wooden bridge carrying a route over water, from bank point `a` to bank point `b`.
export interface Bridge {
  // The stretch of the resampled route (see resampleRoute) the bridge replaces.
  from: number
  to: number
  ax: number
  ay: number
  bx: number
  by: number
  // Ground height at each end, where the deck meets the bank.
  ha: number
  hb: number
  // A humped stone arch bridge (off the trade routes) instead of a flat wooden one.
  stone?: boolean
}

const GRASS = ramp(0x16382c, 0x1c4433, 0x24523a, 0x2f663d, 0x3d7c40, 0x4f9142, 0x66a546, 0x80b74e, 0x9cc85a, 0xb9d86e)
const SAND = ramp(0x8a6844, 0xa98250, 0xc39b5e, 0xd6b471, 0xe4c988, 0xefdba3, 0xf7eac0)
const ROCK = ramp(0x2e2c3d, 0x423f50, 0x595563, 0x726d78, 0x8c878c, 0xa6a19f, 0xbfbab1, 0xd8d3c5)
const SNOW = ramp(0x7f93bd, 0xa7b8d8, 0xc9d6ea, 0xe6edf7, 0xffffff)
const WATER = ramp(0x8fd6dc, 0x6cc0d4, 0x4fa6cc, 0x3c8cc0, 0x2f73b0, 0x275c9c, 0x214884, 0x1b376b)
const FOAM = ramp(0xeaf8fa)
const SWAMP = ramp(0x2a3b36, 0x36493c, 0x445a43, 0x556c4a, 0x687e52, 0x7c905c)
const POOL = ramp(0x22343f, 0x2a4450, 0x35565c)
const BEACH = ramp(0xc7a970, 0xdcc388, 0xecd9a2, 0xf6e8bd)
const ROAD = ramp(0x5e4630, 0x7c5f3f, 0x9b7c52, 0xb89866, 0xcdb07e)
const WOOD = ramp(0x3a2619, 0x5a3d28, 0x7a5535, 0x9c7245, 0xb98d58)
const MASONRY = ramp(0x3b3542, 0x575060, 0x766d78, 0x958b8c, 0xb3a89f, 0xcfc4b4)
const EARTH = ramp(0x2a1f1c, 0x3d2c24, 0x54392b)
const FLOWERS = [ramp(0xf6f3e4), ramp(0xf2cf4a), ramp(0xe2798f), ramp(0xb48be0)]

const ROAD_HALF = 0.62
// Footpaths off the ends of stone bridges: length in tiles, and how much narrower than a road they start.
const PATH_LENGTH = 3.2
const PATH_NARROW = 0.3
// Bridge shape: deck lift above the banks (pixels), half width (tiles), deck thickness and railing height (pixels),
// length of the ramp onto each bank and the spacing of the piers (tiles).
const BRIDGE_LIFT = 12
const BRIDGE_HALF = 0.55
const DECK_THICK = 3
const RAIL_HEIGHT = 7
const BRIDGE_RAMP = 1.2
const PIER_SPACING = 1.5
// Stone bridges: hump height (pixels), half width (tiles), parapet height (pixels), abutment length on each bank and
// the span of one arch (tiles).
const STONE_LIFT = 14
const STONE_HALF = 0.5
const PARAPET = 4
const ABUTMENT = 0.9
const ARCH_SPAN = 2.2
const NO_GROUND = -32768
// The sun painted when none is given (headless previews).
const NOON: SunShadow = { x: 0.45, y: 0.32, alpha: 0.36 }

// Light climbs this many pixels per tile diagonal; shadows are searched this many diagonals toward the light.
const SHADOW_RISE = 30
const SHADOW_STEPS = Math.ceil(MAX_HEIGHT / SHADOW_RISE)

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function preparePaint(world: World): PaintContext {
  const { size, height, seed } = world
  const lit = new Float32Array(size * size)
  const patch = new Float32Array(size * size)
  const at = (x: number, y: number) => height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hx = (at(x + 1, y) - at(x - 1, y)) / 2
      const hy = (at(x, y + 1) - at(x, y - 1)) / 2
      // Slope toward screen right and toward the viewer, in height pixels per ground pixel.
      let light = ((hx - hy) / TILE_WIDTH) * 0.85 + ((hx + hy) / TILE_WIDTH) * 0.2
      // Cast shadow: higher ground toward the light (screen left) blocks it.
      let blocked = 0
      for (let step = 1; step <= SHADOW_STEPS; step++) {
        blocked = Math.max(blocked, at(x - step, y + step) - at(x, y) - step * SHADOW_RISE)
      }
      light -= Math.min(1, blocked / 24) * 0.2
      lit[y * size + x] = light
      // Sampled on a rotated lattice so the patches do not line up with the tile grid.
      patch[y * size + x] = valueNoise((x * 0.83 + y * 0.56) * 0.13, (y * 0.83 - x * 0.56) * 0.13, seed + 4)
    }
  }

  const road = new Float32Array(size * size).fill(Infinity)
  const reach = 2
  const bridges: Bridge[] = []
  for (const route of world.roads) {
    const line = roundRoute(route.points)
    bridges.push(...findBridges(world, resampleRoute(line)))
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSq = dx * dx + dy * dy || 1
      const xEnd = Math.min(size - 1, Math.floor(Math.max(a.x, b.x)) + reach)
      const yEnd = Math.min(size - 1, Math.floor(Math.max(a.y, b.y)) + reach)
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y)) - reach); y <= yEnd; y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x)) - reach); x <= xEnd; x++) {
          const t = Math.min(1, Math.max(0, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / lengthSq))
          const d = Math.hypot(x + 0.5 - a.x - dx * t, y + 0.5 - a.y - dy * t)
          if (d < road[y * size + x]) road[y * size + x] = d
        }
      }
    }
  }
  for (const { a, b } of world.crossings) {
    const ha = heightAt(world, a.x, a.y)
    const hb = heightAt(world, b.x, b.y)
    bridges.push({ from: 0, to: 0, ax: a.x, ay: a.y, bx: b.x, by: b.y, ha, hb, stone: true })
    // A short footpath leads off each end, narrower than a trade route and fading out at its tip.
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
    for (const [end, sx, sy] of [[a, (a.x - b.x) / length, (a.y - b.y) / length], [b, (b.x - a.x) / length, (b.y - a.y) / length]] as const) {
      for (let y = Math.floor(end.y - PATH_LENGTH - 1); y <= end.y + PATH_LENGTH + 1; y++) {
        for (let x = Math.floor(end.x - PATH_LENGTH - 1); x <= end.x + PATH_LENGTH + 1; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          // Bends a little, so the path does not run dead straight off the bridge.
          const along = (x + 0.5 - end.x) * sx + (y + 0.5 - end.y) * sy
          if (along < -0.5 || along > PATH_LENGTH) continue
          const t = Math.max(0, along) / PATH_LENGTH
          const bend = Math.sin(t * Math.PI) * 0.35 * (hash(Math.floor(end.x), Math.floor(end.y), world.seed + 77) - 0.5) * 2
          const across = Math.abs((x + 0.5 - end.x) * -sy + (y + 0.5 - end.y) * sx - bend)
          const d = across + PATH_NARROW + t ** 4 * ROAD_HALF
          if (d < road[y * size + x]) road[y * size + x] = d
        }
      }
    }
  }
  for (let i = 0; i < road.length; i++) if (road[i] === Infinity) road[i] = reach + 1
  return { world, lit, patch, road, bridges, structures: [], occupied: new Uint8Array(size * size), trail: new Float32Array(size * size).fill(TRAIL_REACH + 1), trailNear: new Map() }
}

// How a biome border looks around a point: finely dithered, in blotches and islands, or in frayed fibres. The
// threshold a biome's weight must beat there is shared by the painter (which adds per-pixel dither) and by sprite
// placement, so trees never stand on a patch painted as rock.
export function borderStyle(world: World, rx: number, ry: number) {
  const { seed } = world
  const fray = valueNoise(rx * 1.3, ry * 1.3, seed + 13) - 0.5
  const patch = valueNoise(rx * 0.35, ry * 0.35, seed + 18) - 0.5
  const style = valueNoise(rx * 0.035, ry * 0.035, seed + 17)
  const fine = smoothstep(0.55, 0.72, style)
  const blotch = 1 - smoothstep(0.28, 0.45, style)
  const fibre = 1 - fine - blotch
  // Kept off 0 and 1, so ground far from a border never flips to the other biome.
  const threshold = Math.min(0.9, Math.max(0.1, 0.5 + patch * 1.3 * blotch + fray * 1.5 * fibre))
  return { fray, patch, fine, blotch, threshold }
}

// How far a ground point lies into bare rock, 0..1, before the per-pixel threshold that dithers the border.
// `rx`, `ry` are the tile position on the rotated lattice that keeps noise off the tile grid.
export function rockWeight(world: World, e: number, rx: number, ry: number) {
  const meander = valueNoise(rx * 0.09, ry * 0.09, world.seed + 12) - 0.5
  return smoothstep(-0.011, 0.005, e + meander * 0.02 - world.levels.mountain)
}

// Bilinear sample of a per-tile field; a tile's own value sits at its center.
function sample(world: World, field: Float32Array, x: number, y: number) {
  const { size } = world
  const fx = Math.min(size - 1.001, Math.max(0, x - 0.5))
  const fy = Math.min(size - 1.001, Math.max(0, y - 0.5))
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const i = iy * size + ix
  const top = field[i] * (1 - tx) + field[i + 1] * tx
  return top * (1 - ty) + (field[i + size] * (1 - tx) + field[i + size + 1] * tx) * ty
}

// Corner cutting rounds the bends of a route, the same way for the painted road and anything travelling on it.
export function roundRoute(points: Point[]): Point[] {
  let line = points
  for (let pass = 0; pass < 2 && line.length > 2; pass++) {
    const smooth = [line[0]]
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      smooth.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
      smooth.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
    }
    smooth.push(line[line.length - 1])
    line = smooth
  }
  return line
}

// Points along a rounded route about ROUTE_STEP tiles apart.
export const ROUTE_STEP = 0.25
export function resampleRoute(line: Point[]): Point[] {
  const points: Point[] = []
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / ROUTE_STEP))
    for (let s = 0; s < n; s++) points.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n })
  }
  points.push(line[line.length - 1])
  return points
}

// Height of a bridge's deck `t` of the way from its first end to its second.
export function deckHeight(bridge: Bridge, t: number) {
  const length = Math.hypot(bridge.bx - bridge.ax, bridge.by - bridge.ay)
  const level = bridge.ha + (bridge.hb - bridge.ha) * t
  if (bridge.stone) return level + STONE_LIFT * Math.sin(Math.PI * t) ** 0.6
  const rise = smoothstep(0, 1, Math.min(t * length, (1 - t) * length) / BRIDGE_RAMP)
  return level + BRIDGE_LIFT * rise
}

// Each stretch of a resampled route over water becomes a straight bridge reaching a little onto both banks.
export function findBridges(world: World, points: Point[]): Bridge[] {
  const wet = points.map((p) => sample(world, world.elevation, p.x, p.y) < world.levels.lake)
  const bridges: Bridge[] = []
  const landing = Math.round(0.75 / ROUTE_STEP)
  for (let i = 0; i < points.length; i++) {
    if (!wet[i]) continue
    let end = i
    while (end + 1 < points.length && wet[end + 1]) end++
    const from = Math.max(0, i - landing)
    const to = Math.min(points.length - 1, end + landing)
    const a = points[from]
    const b = points[to]
    bridges.push({
      from,
      to,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      ha: heightAt(world, a.x, a.y),
      hb: heightAt(world, b.x, b.y),
    })
    i = end
  }
  return bridges
}

interface Placed {
  sprite: Sprite
  // Canvas position of the anchor and the ground row it stands on.
  x: number
  y: number
  row: number
  own: boolean
  // Casts a shadow into the painting: from its anchor (0) or a footprint of this many tiles; -1 for none (the
  // player's buildings cast theirs in the shadow layer above the ground).
  foot: number
}

// Shadows cast with the sun painted last, per sprite and footprint.
let castSun: SunShadow | null = null
const casts = new Map<Sprite, Map<number, Sprite>>()
function shadowOf(sprite: Sprite, foot: number, sun: SunShadow) {
  if (castSun?.x !== sun.x || castSun.y !== sun.y) {
    castSun = sun
    casts.clear()
  }
  let byFoot = casts.get(sprite)
  if (!byFoot) casts.set(sprite, (byFoot = new Map()))
  let shadow = byFoot.get(foot)
  if (!shadow) byFoot.set(foot, (shadow = castShadow(sprite, sun, foot > 0)))
  return shadow
}

// Paints one chunk at `k` texture pixels per screen pixel. Each ground point is colored from the continuous
// elevation and moisture fields and drawn lifted by its height, back to front, so nearer ground covers
// farther ground. Sprites are then composited against the depth of the ground they stand behind.
// `lift`: leave the trees out and hand back where they stand instead (see ChunkImage.trees).
export function paintChunk(context: PaintContext, cx: number, cy: number, k: number, lift = false, sun: SunShadow = NOON): ChunkImage {
  const { world, lit, patch, road, bridges, structures, occupied, trail, trailNear } = context
  const { size, seed, elevation, moisture, height, levels } = world
  const S = balance.map.chunkSize
  const chunkCount = size / S
  const W = S * TILE_WIDTH
  const H = S * TILE_HEIGHT
  const width = W * k
  const rows = H * k
  const pad = CHUNK_PAD * k
  const canvasHeight = rows + pad
  const out = new Uint32Array(width * canvasHeight)
  const depth = new Int16Array(width * canvasHeight).fill(NO_GROUND)

  const x0 = cx * S
  const y0 = cy * S
  // Position of the canvas in world pixels at this scale; textures and dither stay continuous across chunks.
  const gx0 = ((cx - cy) * S * (TILE_WIDTH / 2) - W / 2) * k
  const gy0 = (cx + cy) * S * (TILE_HEIGHT / 2) * k - pad
  const relief = levels.mountain - levels.lake

  for (let px = 0; px < width; px++) {
    const sx = (px + 0.5) / k - W / 2
    const a = sx / (TILE_WIDTH / 2)
    const inset = Math.abs(sx) / 2
    const first = Math.max(0, Math.ceil(inset * k - 0.5))
    const last = Math.min(rows - 1, Math.ceil((H - inset) * k - 0.5) - 1)
    const gx = gx0 + px
    let previous = 0

    for (let row = first - 1; row <= last; row++) {
      const b = (row + 0.5) / k / (TILE_HEIGHT / 2)
      const wx = x0 + (a + b) / 2
      const wy = y0 + (b - a) / 2

      // Bilinear weights, with each tile's own value at the tile center.
      const fx = Math.min(size - 1.001, Math.max(0, wx - 0.5))
      const fy = Math.min(size - 1.001, Math.max(0, wy - 0.5))
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      const tx = fx - ix
      const ty = fy - iy
      const i00 = iy * size + ix
      const i10 = i00 + size
      const w00 = (1 - tx) * (1 - ty)
      const w01 = tx * (1 - ty)
      const w10 = (1 - tx) * ty
      const w11 = tx * ty

      const h = height[i00] * w00 + height[i00 + 1] * w01 + height[i10] * w10 + height[i10 + 1] * w11
      const e = elevation[i00] * w00 + elevation[i00 + 1] * w01 + elevation[i10] * w10 + elevation[i10 + 1] * w11
      const way = road[i00] * w00 + road[i00 + 1] * w01 + road[i10] * w10 + road[i10 + 1] * w11
      let foot = trail[i00] * w00 + trail[i00 + 1] * w01 + trail[i10] * w10 + trail[i10 + 1] * w11
      if (foot < NEAR_TRAIL + 0.5 + WANDER / 2) {
        const near = trailNear.get(Math.floor(wy) * size + Math.floor(wx))
        // Measured from a point nudged by a gentle noise, so the path wanders a little instead of running ruler-straight.
        if (near) foot = segmentDistance(near, wx + (valueNoise(wx * 0.22, wy * 0.22, seed + 91) - 0.5) * WANDER, wy + (valueNoise(wx * 0.22, wy * 0.22, seed + 97) - 0.5) * WANDER, seed)
      }
      const depthBelow = levels.lake - e

      const y = row + pad - Math.round(h * k)
      if (row < first) {
        previous = y
        continue
      }
      const gy = gy0 + y
      const dither = BAYER[(gx & 3) | ((gy & 3) << 2)] - 0.5
      const speck = hash(gx, gy, seed + 6)

      const rx = wx * 0.83 + wy * 0.56
      const ry = wy * 0.83 - wx * 0.56
      const mid = valueNoise(rx * 0.45, ry * 0.45, seed + 3) - 0.5
      const broad = patch[i00] * w00 + patch[i00 + 1] * w01 + patch[i10] * w10 + patch[i10 + 1] * w11 - 0.5
      const light = lit[i00] * w00 + lit[i00 + 1] * w01 + lit[i10] * w10 + lit[i10 + 1] * w11

      let colors: Uint32Array
      let tone: number
      let spread = 0.4
      if (depthBelow > 0) {
        colors = WATER
        tone = Math.min(1, depthBelow / 0.03) * 7
        spread = 0.7
        if (depthBelow < 0.0014 + mid * 0.0012) {
          colors = FOAM
        } else if (depthBelow > 0.004 && depthBelow < 0.0052 && mid > 0.08) {
          tone -= 1.5
        } else {
          // Glints: short horizontal dashes scattered over the surface.
          const dash = Math.floor((gx + Math.floor(hash(gy, 1, seed + 5) * 9)) / 9)
          if (hash(dash, gy, seed + 5) > 0.965 && (gx + Math.floor(hash(gy, 1, seed + 5) * 9)) % 9 < 4) tone -= 1.6
        }
      } else if (way < ROAD_HALF + dither * 0.06) {
        colors = ROAD
        tone = way > ROAD_HALF - 0.13 ? 0.6 : 2.6 + broad * 1.5 + (speck > 0.9 ? 1 : speck < 0.12 ? -1 : 0)
        tone += light * 6
        spread = 0.3
      } else if (foot < TRAIL_HALF + dither * 0.12 + mid * 0.06) {
        // Footpaths worn between the player's buildings: bare earth, its edge broken up by grass.
        colors = ROAD
        tone = (foot > TRAIL_HALF - 0.1 ? 1 : 2) + broad * 1.2 + (speck > 0.88 ? 1 : speck < 0.1 ? -1 : 0) + light * 6
        spread = 0.35
      } else {
        const land = -depthBelow
        const m = moisture[i00] * w00 + moisture[i00 + 1] * w01 + moisture[i10] * w10 + moisture[i10 + 1] * w11
        const wobble = mid * 0.012 + broad * 0.012
        const grain = speck > 0.92 ? -1 : speck < 0.07 ? 1 : 0
        // Biomes meet over a band. Each biome has a continuous weight, and a pixel shows the neighbouring ground
        // where that weight beats a per-pixel threshold. How the threshold varies changes from stretch to stretch
        // of a border: fine dithering, blotches and islands, or frayed fibres.
        const { fray, patch, fine, blotch, threshold } = borderStyle(world, rx, ry)
        const clump = hash(gx >> 1, gy >> 1, seed + 14)
        const pick = Math.min(0.97, Math.max(0.03, threshold + (dither - 0.5) * (0.15 + 0.45 * fine) + (clump - 0.5) * 0.12))
        // The weights rise over a narrow band (a few tiles) and their borders wander with broad noise; where a
        // field changes slowly a wide band would smear into a large dithered area.
        const drift = valueNoise(rx * 0.09, ry * 0.09, seed + 19) - 0.5
        const lowland = 1 - smoothstep(-0.01, 0.006, e + mid * 0.004 + drift * 0.02 - levels.swampMaxElevation)
        const rockW = rockWeight(world, e, rx, ry)
        const swampW = smoothstep(-0.014, 0.006, m + wobble + drift * 0.025 - levels.swamp) * lowland
        const dryW = smoothstep(-0.01, 0.01, levels.desert - (m + wobble + drift * 0.025))
        // Wide, smooth versions for tinting the ground and scattering stones, mud and sand ahead of a border.
        const rockNear = smoothstep(-0.03, 0, e - levels.mountain)
        const marsh = smoothstep(levels.swamp - 0.03, levels.swamp, m) * lowland
        const parched = 1 - smoothstep(levels.desert - 0.03, levels.desert + 0.03, m)
        const wooded = smoothstep(levels.forest - 0.045, levels.forest + 0.03, m + wobble + fray * 0.01)
        // The beach widens and narrows along a shore, and some stretches have none: grass runs to the water.
        const sandy = smoothstep(0.3, 0.75, valueNoise(rx * 0.045, ry * 0.045, seed + 23))
        const beach = 0.0008 + sandy * sandy * 0.011
        const shore = beach + (mid * 0.002 + patch * 0.003 * blotch) * (0.25 + sandy) + dither * 0.0006
        // Tufts and stones of one ground left on the other near their border.
        const tuft = (weight: number) => weight - pick < 0.12 && clump < 0.32
        const speckOf = (weight: number) => weight > 0.35 && clump > 1 - (weight - 0.35) * 0.12
        if (rockW > pick && !tuft(rockW)) {
          if (h + mid * 30 + light * 40 + dither * 6 > balance.world.snowHeight) {
            colors = SNOW
            tone = 2.4 + light * 5 + mid * 1.2
          } else {
            colors = ROCK
            // Strata follow the height contours.
            const strata = Math.abs(light) > 0.07 && Math.sin(h * 0.8 + mid * 4) > 0.72 ? -1 : 0
            // Shade is limited so deep shadow keeps its texture instead of flattening into one dark tone.
            tone = Math.max(1.2, 3.4 + Math.max(-0.3, light) * 5.5 + mid * 0.8 + strata + grain * 0.8)
            spread = 0.5
          }
        } else if (land < shore) {
          colors = BEACH
          tone = 1 + (land / beach) * 2 + grain * 0.6
          // Grass creeps onto the upper beach.
          if (land > shore * 0.65 && clump < 0.22 && dryW < 0.5) {
            colors = GRASS
            tone = 5 + light * 6
          }
        } else if (swampW > pick && !tuft(swampW)) {
          const pool = -0.14 + (dither - 0.5) * 0.025
          if (mid < pool && swampW > pick + 0.15) {
            colors = POOL
            tone = 1 + broad * 2
          } else {
            colors = SWAMP
            tone = 2.6 + broad * 3 + mid * 3 + grain
            // A ring of dark mud around the pools.
            if (mid < pool + 0.04 && swampW > pick + 0.1) tone = 0.8 + broad * 2
          }
        } else if (dryW > pick && !tuft(dryW)) {
          colors = SAND
          tone = 3.3 + Math.sin(wx * 0.9 + wy * 0.5 + broad * 9) * 0.8 + broad * 2 + light * 7 + grain * 0.7
        } else {
          colors = GRASS
          // The forest floor darkens in step with the woods, unevenly where they begin.
          const canopy = wooded > pick ? 1 : 0
          tone = 5.3 + broad * 2.6 + mid * 1.1 + light * 7 + (land / relief) * 0.9 + parched * 2
          tone -= wooded * 1.8 + canopy * wooded * 0.9 + rockNear * 0.9 + marsh * 0.9
          // Tufts are two pixels tall; meadows carry a few flowers.
          tone += hash(gx, gy >> 1, seed + 7) > 0.9 ? -1 : speck < 0.05 ? 1 : 0
          if (wooded < 0.3 && dryW < 0.3 && broad > 0.04 && hash(gx >> 1, gy >> 1, seed + 8) > 0.9975) {
            colors = FLOWERS[Math.floor(hash(gx >> 6, gy >> 5, seed + 9) * FLOWERS.length)]
          }
          // Stones below the rock, mud near the swamp, bare sand toward the desert.
          if (speckOf(Math.max(rockW, rockNear))) {
            colors = ROCK
            tone = 4 + light * 5 + (speck > 0.5 ? 1 : 0)
          } else if (speckOf(Math.max(swampW, marsh))) {
            colors = SWAMP
            tone = 1 + broad * 2
          } else if (speckOf(Math.max(dryW, parched))) {
            colors = SAND
            tone = 3 + light * 6
          }
        }
      }

      const top = y > previous + 1 ? previous + 1 : y
      for (let yy = top; yy <= y; yy++) {
        const d = yy === y ? dither : BAYER[(gx & 3) | (((gy0 + yy) & 3) << 2)] - 0.5
        const index = Math.floor(tone + 0.5 + d * spread)
        out[yy * width + px] = colors[index < 0 ? 0 : index >= colors.length ? colors.length - 1 : index]
        depth[yy * width + px] = row
      }
      previous = y
    }

    // The world's front edges show the earth under the raised ground.
    const frontEdge = sx > 0 ? cx === chunkCount - 1 : cy === chunkCount - 1
    if (frontEdge && last >= first) {
      for (let yy = previous + 1; yy <= last + pad; yy++) {
        out[yy * width + px] = EARTH[yy - previous < 3 * k ? 0 : (gx & 7) === 0 ? 0 : sx > 0 ? 1 : 2]
      }
    }
  }

  for (const bridge of bridges) paintBridge(world, bridge, out, depth, x0, y0, k)

  // Trees, rocks, inns and buildings are drawn at every zoom, down to the farthest.
  const data = new Uint8ClampedArray(out.buffer)

  // Sprites: gathered from this chunk and a margin around it, so shapes crossing a chunk border match up.
  const placed: Placed[] = []
  const place = (sprite: Sprite, tx: number, ty: number, own: boolean) => {
    const u = tx - x0
    const v = ty - y0
    const row = Math.round((u + v) * (TILE_HEIGHT / 2) * k)
    placed.push({
      sprite,
      x: Math.round(((u - v) * (TILE_WIDTH / 2) + W / 2) * k),
      y: row + pad - Math.round(heightAt(world, tx, ty) * k),
      row,
      own,
      foot: sprite.shadow > 0 ? 0 : -1,
    })
  }
  const clear = (x: number, y: number) =>
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
      const nx = Math.min(size - 1, Math.max(0, x + dx))
      const ny = Math.min(size - 1, Math.max(0, y + dy))
      return world.feature[ny * size + nx] === Feature.None && !occupied[ny * size + nx]
    }) && !walkedBehind(x, y)
  // Trees and rocks are painted into the ground, below the walkers, so none may stand where it would have to cover
  // someone walking a road or footpath just behind it (up to two tiles back toward the top of the screen).
  const walkedBehind = (x: number, y: number) => {
    for (let dy = 0; dy <= 2; dy++) {
      for (let dx = 0; dx <= 2; dx++) {
        const i = Math.max(0, y - dy) * size + Math.max(0, x - dx)
        if (road[i] < ROAD_HALF + 0.4 || trail[i] < TRAIL_HALF + 0.6 + WANDER / 2) return true
      }
    }
    return false
  }
  const choose = <T>(list: T[], r: number) => list[Math.floor(r * list.length)]
  // Patches of open ground where trees in flower grow thick, like old orchards gone wild, 0..1.
  const bloom = (x: number, y: number) => smoothstep(0.55, 0.8, valueNoise(x * 0.07, y * 0.07, seed + 71))
  // Rare great trees: a few in the woods, now and then one alone in a meadow.
  const giantAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    const t = world.terrain[y * size + x]
    const r = hash(x, y, seed + 57)
    return (t === Terrain.Forest ? r < 0.0035 : t === Terrain.Grass && r < 0.0006) && clear(x, y)
  }
  const nearGiant = (x: number, y: number) => {
    // Trees behind it and beside it, and the ones just in front that would hide its trunk.
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if ((dx || dy) && giantAt(x - dx, y - dy)) return true
    return false
  }
  // Stretches of bank where rushes grow thick, and stretches where they grow not at all, 0..1.
  const reedy = (x: number, y: number) => smoothstep(0.4, 0.68, valueNoise(x * 0.09, y * 0.09, seed + 75))
  // Clearings in the woods where wild fruit trees grow together, 0..1.
  const fruitful = (x: number, y: number) => smoothstep(0.55, 0.78, valueNoise(x * 0.08, y * 0.08, seed + 73))
  // Fields of one kind of wildflower in the open meadows, and which kind.
  const field = (x: number, y: number) => smoothstep(0.5, 0.75, valueNoise(x * 0.05, y * 0.05, seed + 77))
  const fieldKind = (x: number, y: number) => Math.floor(valueNoise(x * 0.03, y * 0.03, seed + 79) * 12) % SPRITES.wildflowers.length
  const wet = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return false
    const t = world.terrain[y * size + x]
    return t === Terrain.Lake || t === Terrain.River
  }
  // The direction from a tile toward its neighbours that are (or are not) water; [0, 0] if there are none.
  const toward = (x: number, y: number, water: boolean) => {
    let dx = 0
    let dy = 0
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox
      const ny = y + oy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || wet(nx, ny) !== water) continue
      if (!water && world.terrain[ny * size + nx] === Terrain.Mountain) continue
      dx += ox
      dy += oy
    }
    const length = Math.hypot(dx, dy)
    return length ? [dx / length, dy / length] : [0, 0]
  }
  const lifted: LiftedTree[] = []
  const xEnd = Math.min(size, x0 + S + SPRITE_MARGIN)
  const yEnd = Math.min(size, y0 + S + SPRITE_MARGIN)
  for (let y = Math.max(0, y0 - SPRITE_MARGIN); y < yEnd; y++) {
    for (let x = Math.max(0, x0 - SPRITE_MARGIN); x < xEnd; x++) {
      const i = y * size + x
      const own = x >= x0 && y >= y0 && x < x0 + S && y < y0 + S
      const terrain = world.terrain[i]
      if (!clear(x, y)) continue
      const spot = (n: number) =>
        [x + 0.15 + hash(x, y, seed + 21 + n) * 0.7, y + 0.15 + hash(x, y, seed + 31 + n) * 0.7] as const
      const roll = (n: number) => hash(x, y, seed + 11 + n)
      const kind = hash(x, y, seed + 41)
      // Rushes stand in the shallows along the banks, thick in some stretches and missing in others, and a few
      // grow up the bank itself.
      const rushes = (n: number, water: boolean, chance: number) => {
        const [dx, dy] = toward(x, y, !water)
        if ((!dx && !dy) || roll(n) >= reedy(x, y) * chance) return false
        // Toward the bank from the water, toward the water from the bank.
        const [sx, sy] = spot(n)
        const at = [x + 0.5 + (sx - x - 0.5) * 0.5 + dx * 0.3, y + 0.5 + (sy - y - 0.5) * 0.5 + dy * 0.3] as const
        place(hash(x, y, seed + 81 + n) < 0.7 ? choose(SPRITES.rushes, kind) : choose(SPRITES.reeds, kind), ...at, own)
        return true
      }
      if (terrain === Terrain.Lake || terrain === Terrain.River) {
        if (rushes(6, true, 1)) rushes(7, true, 0.7)
        continue
      }
      if (terrain !== Terrain.Mountain && terrain !== Terrain.Desert) rushes(8, false, 0.45)
      const variant = hash(x, y, seed + 43)
      const upland = (elevation[i] - levels.lake) / relief
      // Woods thin out over a band of moisture with ragged edges, so the forest has no hard border.
      const edge = (valueNoise(x * 0.15, y * 0.15, seed + 49) - 0.5) * 0.04
      const woods = smoothstep(levels.forest - 0.05, levels.forest + 0.03, moisture[i] + edge)
      const grove = valueNoise(x * 0.06, y * 0.06, seed + 51)
      const turning = valueNoise(x * 0.09, y * 0.09, seed + 55) > 0.8
      const conifers = (n: number) => hash(x, y, seed + 45 + n) < upland * 1.3 - 0.25
      const grow = (set: TreeSet, n: number, at: readonly [number, number]) => {
        const list = SPRITES[set]
        const index = Math.floor(hash(x, y, seed + 47 + n) * list.length)
        if (lift) {
          // Each tree once, by the chunk it stands in.
          if (own) lifted.push({ set, index, tx: at[0], ty: at[1] })
          return
        }
        place(list[index], at[0], at[1], own)
      }
      // Woods grow in stands: birch groves, spruce among the pines, a patch turning early; poplars and trees in
      // flower stand out on open ground.
      const tree = (n: number) => {
        const h = hash(x, y, seed + 53 + n)
        let set: TreeSet
        if (conifers(n)) set = h < smoothstep(0.35, 0.65, grove) * 0.8 ? 'fir' : 'pine'
        else if (turning && h < 0.6) set = 'autumn'
        else if (h < smoothstep(0.55, 0.75, grove) * 0.75) set = 'birch'
        else if (woods < 0.35 && h > 0.93) set = 'poplar'
        // Trees in flower, here and there on open ground and thick in orchard-like patches; now and then a great one.
        else if (woods < 0.35 && h < 0.12 + bloom(x, y) * 0.55) {
          const r = hash(x, y, seed + 57 + n)
          set = r < 0.07 ? 'bigBlossom' : r < 0.3 ? 'fruit' : 'blossom'
        }
        // Wild apples, pears and plums in clearings of the woods, cherries in flower among them.
        else if (woods >= 0.35 && h < 0.06 + fruitful(x, y) * 0.6) set = hash(x, y, seed + 57 + n) < 0.75 ? 'fruit' : 'blossom'
        else if (h > (woods < 0.7 ? 0.97 : 0.985)) set = hash(x, y, seed + 57 + n) < 0.5 ? 'fruit' : 'blossom'
        else set = 'leaf'
        grow(set, n, spot(n))
      }
      // Bare rock, wherever the painted ground shows it, carries rock formations and no trees.
      const climb = (elevation[i] - levels.mountain) / (levels.snow - levels.mountain)
      const rx = (x + 0.5) * 0.83 + (y + 0.5) * 0.56
      const ry = (y + 0.5) * 0.83 - (x + 0.5) * 0.56
      const rockW = rockWeight(world, elevation[i], rx, ry)
      if (terrain === Terrain.Mountain || rockW > borderStyle(world, rx, ry).threshold + (roll(5) - 0.5) * 0.1) {
        const r = roll(0)
        const high = heightAt(world, x + 0.5, y + 0.5) > balance.world.snowHeight - 20
        const foot = Math.max(0, 1 - Math.max(0, climb) / 0.35)
        const up = Math.max(0, climb) * 0.04
        if (high) {
          if (r < 0.035) place(choose(SPRITES.snowCrag, variant), ...spot(0), own)
          continue
        }
        // Big outcrops and rock steps break up the bare slopes; boulders, scree and slabs fill in between. Some
        // stretches are strewn with rock, others calmer.
        const m = 0.45 + valueNoise(x * 0.08, y * 0.08, seed + 59) * 1.3
        const at = r / m
        if (at < 0.03) place(choose(SPRITES.outcrop, variant), ...spot(0), own)
        else if (at < 0.05) place(choose(SPRITES.ledge, variant), ...spot(0), own)
        else if (at < 0.058) place(choose(SPRITES.pillar, variant), ...spot(0), own)
        else if (at < 0.11) place(choose(SPRITES.boulder, variant), ...spot(0), own)
        else if (at < 0.16) place(choose(SPRITES.scree, variant), ...spot(0), own)
        else if (at < 0.18) place(choose(SPRITES.slab, variant), ...spot(0), own)
        else if (at < 0.195 + up) place(choose(SPRITES.crag, variant), ...spot(0), own)
        else if (at < 0.21 + up) place(choose(SPRITES.tor, variant), ...spot(0), own)
        // Moss, alpine grass and dwarf shrubs hold on low down.
        else if (at < 0.21 + up + foot * 0.2) place(choose(SPRITES.tuft, kind), ...spot(1), own)
        else if (at < 0.24 + up + foot * 0.25) place(choose(SPRITES.scrub, kind), ...spot(1), own)
        // Gravel and a second, smaller stone between the rest.
        if (roll(3) < 0.3) place(choose(SPRITES.pebbles, kind), ...spot(3), own)
        else if (roll(3) < 0.4) place(choose(SPRITES.boulder, kind), ...spot(3), own)
        continue
      }
      // Fewer trees toward bare rock and dry ground.
      const dry = 1 - smoothstep(levels.desert - 0.025, levels.desert + 0.02, moisture[i] + edge)
      const thin = (1 - rockW) ** 2 * (1 - dry)
      if (terrain === Terrain.Forest || terrain === Terrain.Grass) {
        // A great old tree stands in a clearing of its own; the trees around it give it room.
        if (giantAt(x, y)) {
          grow(conifers(0) ? 'giantPine' : 'oak', 0, [x + 0.5, y + 0.5])
          continue
        }
        if (nearGiant(x, y)) continue
        let trees = 0
        for (let n = 0; n < 2; n++) {
          if (roll(n) < ((n === 0 ? 0.02 : 0) + woods * 0.8) * thin) {
            tree(n)
            trees++
          }
        }
        if (trees > 0) continue
        const open = 1 - woods
        const r = roll(2)
        const bushes = 0.04 * open + 0.03 * woods * open * 4
        if (r < bushes) {
          place(choose(hash(x, y, seed + 83) < 0.3 ? SPRITES.berryBush : SPRITES.bush, variant), ...spot(2), own)
          continue
        }
        // Open meadows carry patches of wildflowers (whole fields of one kind here and there) and clumps of tall grass.
        const flowers = open * (1 - dry) * (0.05 + field(x, y) * 0.45)
        if (r < bushes + flowers) {
          const k = field(x, y) > 0.3 ? fieldKind(x, y) : Math.floor(hash(x, y, seed + 85) * SPRITES.wildflowers.length)
          place(choose(SPRITES.wildflowers[k], variant), ...spot(2), own)
        } else if (r < bushes + flowers + open * 0.12) place(choose(SPRITES.tallGrass, variant), ...spot(2), own)
        // Now and then a stone lies in the grass.
        else if (r < bushes + flowers + open * 0.13) place(choose(SPRITES.pebbles, variant), ...spot(2), own)
      } else if (terrain === Terrain.Swamp) {
        // Living trees reach a little way into the swamp from the woods around it.
        if (roll(2) < woods * 0.5 * (1 - smoothstep(levels.swamp, levels.swamp + 0.025, moisture[i] + edge))) tree(2)
        else if (roll(0) < 0.12) place(choose(SPRITES.dead, variant), ...spot(0), own)
        if (roll(1) < 0.3) place(choose(SPRITES.reeds, kind), ...spot(1), own)
      } else if (terrain === Terrain.Desert) {
        if (roll(0) < 0.025) place(choose(SPRITES.boulder, variant), ...spot(0), own)
        else if (roll(0) < 0.035) place(choose(SPRITES.dead, variant), ...spot(0), own)
      }
    }
  }
  const buildings = [
    ...world.inns.map((p) => ({ fx: p.x + 2, fy: p.y + 2, z: heightAt(world, p.x + 1, p.y + 1), sprite: innLook(world, p).sprite, foot: 2 })),
    ...structures.flatMap((s) => structureParts(world, s).map((part) => ({ ...part, foot: -1 }))),
  ]
  for (const p of buildings) {
    // Tall buildings reach into chunks well behind them, so they are culled by their screen box (below).
    // A building belongs to the chunk holding its front tile.
    const tx = Math.ceil(p.fx) - 1
    const ty = Math.ceil(p.fy) - 1
    const own = tx >= x0 && ty >= y0 && tx < x0 + S && ty < y0 + S
    // Stands on the footprint's front corner, at the height given for it.
    const u = p.fx - x0
    const v = p.fy - y0
    const row = Math.round((u + v) * (TILE_HEIGHT / 2) * k)
    const x = Math.round(((u - v) * (TILE_WIDTH / 2) + W / 2) * k)
    const y = row + pad - Math.round(p.z * k)
    const left = x - p.sprite.anchorX * k
    const top = y - p.sprite.anchorY * k
    if (left > width || left + p.sprite.width * k < 0 || top > canvasHeight || top + p.sprite.height * k < 0) continue
    placed.push({ sprite: p.sprite, x, y, row, own, foot: p.foot })
  }
  placed.sort((p, q) => p.row - q.row || p.x - q.x)

  // Shadows darken the ground once, however many of them overlap, and only ground about as far down the screen as the
  // shadow falls (not a hillside rising in front of it).
  const shaded = new Uint8Array(width * canvasHeight)
  const dark = [1 - sun.alpha, 1 - sun.alpha * 0.82, 1 - sun.alpha * 0.6]
  const reach = 6 + 10 * k
  for (const { sprite, x, y, row, foot } of placed) {
    if (foot < 0) continue
    const shadow = shadowOf(sprite, foot, sun)
    const w = Math.ceil(shadow.width * k)
    const h = Math.ceil(shadow.height * k)
    const left = x - Math.round(shadow.anchorX * k)
    const top = y - Math.round(shadow.anchorY * k)
    for (let dy = 0; dy < h; dy++) {
      const yy = top + dy
      if (yy < 0 || yy >= canvasHeight) continue
      const source = Math.min(shadow.height - 1, Math.floor(dy / k)) * shadow.width
      const ground = row + (yy - y)
      for (let dx = 0; dx < w; dx++) {
        const xx = left + dx
        if (xx < 0 || xx >= width || shadow.pixels[source + Math.min(shadow.width - 1, Math.floor(dx / k))] === 0) continue
        const o = yy * width + xx
        if (shaded[o] || depth[o] === NO_GROUND || Math.abs(depth[o] - ground) > reach) continue
        shaded[o] = 1
        data[o * 4] *= dark[0]
        data[o * 4 + 1] *= dark[1]
        data[o * 4 + 2] *= dark[2]
      }
    }
  }

  // Marks pixels outside this chunk's ground that one of its own sprites covered.
  const covered = shaded.fill(0)
  const step = 1 / k
  for (const { sprite, x, y, row, own } of placed) {
    const w = Math.ceil(sprite.width * k)
    const h = Math.ceil(sprite.height * k)
    const left = x - Math.round(sprite.anchorX * k)
    const top = y - Math.round(sprite.anchorY * k)
    for (let dy = 0; dy < h; dy++) {
      const yy = top + dy
      if (yy < 0 || yy >= canvasHeight) continue
      const source = Math.min(sprite.height - 1, Math.floor((dy + 0.5) * step)) * sprite.width
      for (let dx = 0; dx < w; dx++) {
        const xx = left + dx
        if (xx < 0 || xx >= width) continue
        const color = sprite.pixels[source + Math.min(sprite.width - 1, Math.floor((dx + 0.5) * step))]
        if (color === 0) continue
        const o = yy * width + xx
        if (depth[o] === NO_GROUND) {
          // Ground of another chunk: that chunk decides, unless our own sprite already stands here.
          if (!own && !covered[o]) continue
          covered[o] = 1
        } else if (depth[o] > row + 2) {
          continue
        }
        out[o] = color
      }
    }
  }
  return { width, height: canvasHeight, data, ...(lift && { trees: lifted }) }
}

// Draws a bridge as small 3D parts sampled finely enough to cover every pixel. Each sample carries the ground row
// it stands on, so nearer ground hides the bridge ends and the bridge hides the water and ground behind it.
function paintBridge(
  world: World,
  bridge: Bridge,
  out: Uint32Array,
  depth: Int16Array,
  x0: number,
  y0: number,
  k: number,
) {
  const { seed } = world
  const S = balance.map.chunkSize
  const { ax, ay, bx, by } = bridge
  const margin = 4
  if (Math.max(ax, bx) < x0 - margin || Math.min(ax, bx) > x0 + S + margin) return
  if (Math.max(ay, by) < y0 - margin || Math.min(ay, by) > y0 + S + margin) return
  const W = S * TILE_WIDTH
  const width = W * k
  const pad = CHUNK_PAD * k
  const canvasHeight = S * TILE_HEIGHT * k + pad
  const length = Math.hypot(bx - ax, by - ay)
  const dx = (bx - ax) / length
  const dy = (by - ay) / length
  // Across the deck.
  const nx = -dy
  const ny = dx
  const id = Math.floor(ax * 7 + ay * 13)

  const deckAt = (t: number) => deckHeight(bridge, t)
  // How much a vertical face with outward normal (fx, fy) faces the light from the upper left of the screen.
  const facing = (fx: number, fy: number) => -fx * 0.6 + fy * 0.8

  const plot = (wx: number, wy: number, z: number, colors: Uint32Array, tone: number) => {
    const u = wx - x0
    const v = wy - y0
    const exact = (u + v) * (TILE_HEIGHT / 2) * k
    const row = Math.round(exact)
    const px = Math.round(((u - v) * (TILE_WIDTH / 2) + W / 2) * k)
    // Rounded once, so neighboring samples never skip a pixel row.
    const py = Math.round(exact - z * k) + pad
    if (px < 0 || py < 0 || px >= width || py >= canvasHeight) return
    const o = py * width + px
    const own = wx >= x0 && wy >= y0 && wx < x0 + S && wy < y0 + S
    if (depth[o] === NO_GROUND ? !own : depth[o] > row + 1) return
    const index = Math.round(tone + (BAYER[(px & 3) | ((py & 3) << 2)] - 0.5) * 0.5)
    out[o] = colors[index < 0 ? 0 : index >= colors.length ? colors.length - 1 : index]
    depth[o] = row
  }
  // Point on the bridge `t` along it and `s` tiles across it.
  const at = (t: number, s: number) => [ax + (bx - ax) * t + nx * s, ay + (by - ay) * t + ny * s] as const
  // Samples per tile and per pixel of height, dense enough to leave no holes at this zoom.
  const fine = Math.ceil(TILE_WIDTH * k)
  const dt = 1 / (length * fine)
  const ds = 1 / fine
  const dz = 0.5 / k

  // A square post from z0 to z1 centered on (t, s), its sides shaded by the way they face.
  const post = (t: number, s: number, half: number, z0: number, z1: number, colors: Uint32Array, base: number) => {
    const [cx, cy] = at(t, s)
    for (let z = z0; z <= z1; z += dz) {
      for (let q = -half; q <= half; q += ds) {
        for (const [fx, fy] of [[dx, dy], [-dx, -dy], [nx, ny], [-nx, -ny]]) {
          const ex = fx === dx || fx === -dx ? nx : dx
          const ey = fx === dx || fx === -dx ? ny : dy
          plot(cx + fx * half + ex * q, cy + fy * half + ey * q, z, colors, base + facing(fx, fy) * 1.4)
        }
      }
    }
  }

  if (bridge.stone) {
    paintStoneBridge()
    return
  }

  // A humped bridge of dressed stone: side walls pierced by round arches that spring from the water, a paved deck
  // and a low parapet on both sides.
  function paintStoneBridge() {
    const t0 = Math.min(0.45, ABUTMENT / length)
    const t1 = 1 - t0
    const arches = Math.max(1, Math.round((length - ABUTMENT * 2) / ARCH_SPAN))
    const pier = 0.13
    // Height of the arch opening at `t`; 0 on the piers and abutments.
    const opening = (t: number) => {
      if (t <= t0 || t >= t1) return 0
      const u = ((t - t0) / (t1 - t0)) * arches
      const f = u - Math.floor(u)
      if (f < pier || f > 1 - pier) return 0
      const v = ((f - pier) / (1 - pier * 2)) * 2 - 1
      const crown = deckAt(t0 + ((Math.floor(u) + 0.5) / arches) * (t1 - t0)) - DECK_THICK - 3
      return Math.max(0, crown) * Math.sqrt(1 - v * v)
    }
    const groundAt = (wx: number, wy: number) => Math.max(0, heightAt(world, wx, wy))
    // Dressed blocks in staggered courses; the joints are darker.
    const block = (t: number, z: number) => {
      const course = Math.floor(z / 3)
      const joint = z - course * 3 < 0.6 || (t * length * 3 + (course & 1) * 0.5) % 1 < 0.1
      return joint ? -1.1 : (hash(Math.floor(t * length * 3 + (course & 1) * 0.5), course, seed + id) - 0.5) * 0.9
    }
    // Pier feet stand in a ring of foam.
    for (let j = 0; j <= arches; j++) {
      const t = t0 + (j / arches) * (t1 - t0)
      const [px, py] = at(t, 0)
      if (sample(world, world.elevation, px, py) >= world.levels.lake) continue
      for (let s = -STONE_HALF - 0.14; s <= STONE_HALF + 0.14; s += ds) {
        for (const side of [-1, 1]) {
          const [wx, wy] = at(t + (side * (pier + 0.05) * (t1 - t0)) / arches, s)
          plot(wx, wy, 0, FOAM, 0)
        }
      }
    }
    // The near wall faces the viewer and is drawn last.
    const sides = nx + ny > 0 ? [-1, 1] : [1, -1]
    const wall = (side: number) => {
      const light = facing(side * nx, side * ny) * 1.4
      for (let t = 0; t <= 1; t += dt) {
        const [wx, wy] = at(t, side * STONE_HALF)
        const deck = deckAt(t)
        const arch = opening(t)
        for (let z = groundAt(wx, wy); z <= deck + PARAPET; z += dz) {
          if (z < arch) continue
          let tone = 2.6 + light + block(t, z)
          // The arch ring and the coping on the parapet are picked out lighter.
          if (arch > 0 && z < arch + 1.5) tone = 3.6 + light
          if (z > deck + PARAPET - 1.2) tone = 4.2 + light * 0.5
          plot(wx, wy, z, MASONRY, tone)
        }
      }
      // The parapet's inner face and its top.
      for (let t = 0; t <= 1; t += dt) {
        const [wx, wy] = at(t, side * (STONE_HALF - 0.12))
        const deck = deckAt(t)
        for (let z = deck; z <= deck + PARAPET; z += dz) plot(wx, wy, z, MASONRY, 2.2 - light * 0.5)
        for (let s = STONE_HALF - 0.12; s <= STONE_HALF; s += ds) {
          const [tx, ty] = at(t, side * s)
          plot(tx, ty, deck + PARAPET, MASONRY, 4.6)
        }
      }
    }
    // The arch vaults, seen through the openings.
    for (let t = t0; t <= t1; t += dt) {
      const arch = opening(t)
      if (arch <= 0) continue
      for (let s = -STONE_HALF; s <= STONE_HALF; s += ds) {
        const [wx, wy] = at(t, s)
        plot(wx, wy, arch, MASONRY, 0.6)
      }
    }
    wall(sides[0])
    for (let t = 0; t <= 1; t += dt) {
      const deck = deckAt(t)
      const cobble = Math.floor(t * length * 4)
      for (let s = -STONE_HALF; s <= STONE_HALF; s += ds) {
        const [wx, wy] = at(t, s)
        const seam = (t * length * 4) % 1 < 0.12 || (s * 4 + 8 + (cobble & 1) * 0.5) % 1 < 0.12
        const grain = hash(cobble, Math.floor(s * 4 + 8 + (cobble & 1) * 0.5), seed + id) - 0.5
        plot(wx, wy, deck, MASONRY, seam ? 2.4 : 3.4 + grain * 1.2)
      }
    }
    wall(sides[1])
  }

  // Piers: pairs of legs standing in the water, tied together by a beam under the deck.
  const spans = Math.max(1, Math.round((length - BRIDGE_RAMP * 2) / PIER_SPACING))
  for (let p = 0; p <= spans; p++) {
    const t = (BRIDGE_RAMP + ((length - BRIDGE_RAMP * 2) * p) / spans) / length
    const [px, py] = at(t, 0)
    if (sample(world, world.elevation, px, py) >= world.levels.lake) continue
    const top = deckAt(t) - DECK_THICK
    if (top < BRIDGE_LIFT / 2) continue
    // Legs stand just outside the deck edges so they show beside it from every side.
    const leg = BRIDGE_HALF + 0.04
    for (const side of [-1, 1]) {
      const [lx, ly] = at(t, side * leg)
      // A ring of foam where the leg meets the water.
      for (let a = 0; a < Math.PI * 2; a += ds * 3) plot(lx + Math.cos(a) * 0.13, ly + Math.sin(a) * 0.13, 0, FOAM, 0)
      post(t, side * leg, 0.065, 0, top + DECK_THICK, WOOD, 1)
    }
    for (let s = -leg; s <= leg; s += ds) {
      for (let z = top - 2; z <= top; z += dz) {
        const [wx, wy] = at(t, s)
        plot(wx + dx * 0.06, wy + dy * 0.06, z, WOOD, 0.8)
        plot(wx - dx * 0.06, wy - dy * 0.06, z, WOOD, 0.8)
      }
    }
  }

  // The deck's edge beams, then its planks.
  for (let t = 0; t <= 1; t += dt) {
    const deck = deckAt(t)
    for (const side of [-1, 1]) {
      const [wx, wy] = at(t, side * BRIDGE_HALF)
      for (let z = deck - DECK_THICK; z <= deck; z += dz) plot(wx, wy, z, WOOD, 1.3 + facing(side * nx, side * ny) * 1.4)
    }
    const plank = Math.floor(t * length * 5)
    const gap = (t * length * 5) % 1 < 0.14
    const grain = hash(plank, id, seed + 61) - 0.5
    for (let s = -BRIDGE_HALF; s <= BRIDGE_HALF; s += ds) {
      const [wx, wy] = at(t, s)
      const edge = Math.abs(s) > BRIDGE_HALF - 0.08
      plot(wx, wy, deck, WOOD, edge ? 1.6 : gap ? 1.2 : 2.9 + (plank & 1) * 0.5 + grain * 0.8)
    }
  }

  // Railings: posts along both edges carrying a hand rail.
  const posts = Math.max(2, Math.round(length / 0.6))
  for (const side of [-1, 1]) {
    const s = side * (BRIDGE_HALF - 0.04)
    for (let p = 0; p <= posts; p++) {
      const t = p / posts
      post(t, s, 0.035, deckAt(t), deckAt(t) + RAIL_HEIGHT, WOOD, 0.6)
    }
    for (let t = 0; t <= 1; t += dt) {
      const [wx, wy] = at(t, s)
      const deck = deckAt(t)
      for (let z = deck + RAIL_HEIGHT - 1.5; z <= deck + RAIL_HEIGHT - 0.5; z += dz) plot(wx, wy, z, WOOD, 1)
      plot(wx, wy, deck + RAIL_HEIGHT, WOOD, 3.6)
      plot(wx, wy, deck + RAIL_HEIGHT * 0.45, WOOD, 0.4)
    }
  }
}
