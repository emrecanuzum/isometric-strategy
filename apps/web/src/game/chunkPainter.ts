import { Feature, MAX_HEIGHT, TILE_HEIGHT, TILE_WIDTH, Terrain, balance, caveSpots, hash, heightAt, valueNoise } from '@game/shared'
import type { Point, World } from '@game/shared'
import { structureParts } from './buildingSprites'
import type { Structure } from './buildingSprites'
import { innLook } from './innSprites'
import { caveLook } from './caveSprites'
import { BAYER, SPRITES, castShadow, ramp, snowOf } from './sprites'
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
  // Per tile whether a building (or field, or wall) stands right on it: the low growth of a lordship's ground keeps off
  // only these.
  footprint: Uint8Array
  // Per tile: distance to the nearest footpath between the player's buildings, in tiles.
  trail: Float32Array
  // Per tile near a footpath, the footpath segments passing close by ([ax, ay, bx, by] each): close to a path the
  // painting measures the distance to them exactly, as tile-centre distances blend a thin line crossing a tile
  // corner-wise into a string of dots.
  trailNear: Map<number, number[]>
  // Per tile whether a road the lord laid (CLAUDE.md §6.4, "Yol") passes over or near it, and for those tiles the road's
  // centre-line segments ([ax, ay, bx, by] each), joining each road tile to its road neighbours (and to a trade route
  // beside it), so the road bends round in smooth, rounded joints.
  lane: Uint8Array
  laneNear: Map<number, number[]>
}

export type { Structure }

// Footpaths are this many tiles wide either side of their center line.
const TRAIL_HALF = 0.2
// How a footpath is painted: worn earth showing through the grass at most this opaque (dithered in steps), its width
// swelling and narrowing gently along the way (by this share either side), and patchy where the grass holds on.
const TRAIL_ALPHA = 0.55
const TRAIL_SWELL = 0.3
// A laid road: half its width (tiles), and its two cart ruts this far either side of the middle.
const LANE_HALF = 0.42
const LANE_RUT = 0.17
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
  context.footprint = new Uint8Array(size * size)
  for (const s of structures) {
    for (let y = Math.max(0, s.y); y < Math.min(size, s.y + s.size); y++) {
      for (let x = Math.max(0, s.x); x < Math.min(size, s.x + s.size); x++) context.footprint[y * size + x] = 1
    }
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
  setLanes(context, structures)
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

// The roads laid by the lords: each road tile joined to the road tiles beside it (straight neighbours, and diagonal
// ones that share no straight neighbour), and to a trade route it touches; a lone tile is a round patch.
function setLanes(context: PaintContext, structures: Structure[]) {
  const { size, feature } = context.world
  context.lane = new Uint8Array(size * size)
  context.laneNear = new Map()
  const roads = new Set<number>()
  for (const s of structures) if (s.look === 'road' && s.x >= 0 && s.y >= 0 && s.x < size && s.y < size) roads.add(s.y * size + s.x)
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && roads.has(y * size + x)
  const isRoute = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && (feature[y * size + x] === Feature.Road || feature[y * size + x] === Feature.Bridge)
  const add = (ax: number, ay: number, bx: number, by: number) => {
    for (let y = Math.max(0, Math.floor(Math.min(ay, by)) - 1); y <= Math.min(size - 1, Math.floor(Math.max(ay, by)) + 1); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx)) - 1); x <= Math.min(size - 1, Math.floor(Math.max(ax, bx)) + 1); x++) {
        const i = y * size + x
        context.lane[i] = 1
        const near = context.laneNear.get(i)
        if (near) near.push(ax, ay, bx, by)
        else context.laneNear.set(i, [ax, ay, bx, by])
      }
    }
  }
  for (const i of roads) {
    const x = i % size
    const y = (i - x) / size
    const cx = x + 0.5
    const cy = y + 0.5
    let linked = false
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (isRoad(x + dx, y + dy)) {
        linked = true
        // Each straight link once, from the tile before.
        if (dx > 0 || dy > 0) add(cx, cy, cx + dx, cy + dy)
      } else if (isRoute(x + dx, y + dy)) {
        linked = true
        add(cx, cy, cx + dx, cy + dy)
      }
    }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      if (!isRoad(x + dx, y + dy) || isRoad(x + dx, y) || isRoad(x, y + dy)) continue
      linked = true
      if (dx > 0) add(cx, cy, cx + dx, cy + dy)
    }
    if (!linked) add(cx - 0.12, cy - 0.12, cx + 0.12, cy + 0.12)
  }
}

// Distance from (x, y) to the nearest road centre-line segment ([ax, ay, bx, by] each).
function laneDistance(segments: number[], x: number, y: number) {
  let best = Infinity
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i]
    const ay = segments[i + 1]
    const dx = segments[i + 2] - ax
    const dy = segments[i + 3] - ay
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
  }
  return best
}

// Two colours mixed, `t` of the way from `a` to `b` (channel by channel).
function mix(a: number, b: number, t: number) {
  let out = 0
  for (let shift = 0; shift < 24; shift += 8) {
    const ca = (a >>> shift) & 0xff
    const cb = (b >>> shift) & 0xff
    out |= Math.round(ca + (cb - ca) * t) << shift
  }
  return (out | (a & 0xff000000)) >>> 0
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
// The low growth and stones the snow buries (see paintChunk's `snow`).
const BURIED = new Set<Sprite>([...SPRITES.tallGrass, ...SPRITES.wildflowers.flat(), ...SPRITES.tuft, ...SPRITES.pebbles])
// How much of the open ground the snow covers at each depth (see paintChunk's `snow`).
const SNOW_COVER = [0, 0.32, 0.7, 0.94]
const WATER = ramp(0x8fd6dc, 0x6cc0d4, 0x4fa6cc, 0x3c8cc0, 0x2f73b0, 0x275c9c, 0x214884, 0x1b376b)
const FOAM = ramp(0xeaf8fa)
const SWAMP = ramp(0x2a3b36, 0x36493c, 0x445a43, 0x556c4a, 0x687e52, 0x7c905c)
const POOL = ramp(0x22343f, 0x2a4450, 0x35565c)
const BEACH = ramp(0xc7a970, 0xdcc388, 0xecd9a2, 0xf6e8bd)
const ROAD = ramp(0x5e4630, 0x7c5f3f, 0x9b7c52, 0xb89866, 0xcdb07e)
const WOOD = ramp(0x3a2619, 0x5a3d28, 0x7a5535, 0x9c7245, 0xb98d58)
const MASONRY = ramp(0x3b3542, 0x575060, 0x766d78, 0x958b8c, 0xb3a89f, 0xcfc4b4)
// Laid roads: packed earth and gravel, a little paler and greyer than the worn trade routes.
const LANE = ramp(0x4e4034, 0x6a5946, 0x87745c, 0xa38f72, 0xbba887, 0xd2c3a2)
const EARTH = ramp(0x2a1f1c, 0x3d2c24, 0x54392b)
const FLOWERS = [ramp(0xf6f3e4), ramp(0xf2cf4a), ramp(0xe2798f), ramp(0xb48be0)]

const ROAD_HALF = 0.62
// Footpaths off the ends of stone bridges: length in tiles, and how much narrower than a road they start.
const PATH_LENGTH = 3.2
const PATH_NARROW = 0.3
// Bridge shape: deck lift above the banks (pixels), half width (tiles), deck thickness and railing height (pixels),
// length of the ramp onto each bank and the spacing of the piers (tiles).
const BRIDGE_LIFT = 30
const BRIDGE_HALF = 0.75
const DECK_THICK = 3
const RAIL_HEIGHT = 7
const BRIDGE_RAMP = 2.2
const PIER_SPACING = 1.5
// Stone bridges: hump height (pixels), half width (tiles), parapet height (pixels), abutment length on each bank and
// the span of one arch (tiles).
const STONE_LIFT = 34
const STONE_HALF = 0.68
const PARAPET = 4
const ABUTMENT = 1.3
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
  const bridges = worldBridges(world)
  for (const route of drawnRoads(world)) {
    const line = roundRoute(route.points)
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
  return { world, lit, patch, road, bridges, structures: [], occupied: new Uint8Array(size * size), footprint: new Uint8Array(size * size), trail: new Float32Array(size * size).fill(TRAIL_REACH + 1), trailNear: new Map(), lane: new Uint8Array(size * size), laneNear: new Map() }
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

// The trade routes as they are drawn and walked. World generation sometimes lays a route along a stream, in the water,
// or forks it in the middle of a river; drawn as it is, that made long bridges running beside the stream and crooked
// bridges piled on one another. So each stretch of a route through water is mended here (drawing only; the server's
// tiles are left as they are): where it comes back out on the bank it went in by, it keeps to the land instead; where
// it really crosses, it walks its own bank to the narrowest place nearby and crosses there, straight.
const drawn = new WeakMap<World, World['roads']>()
const MEND_BOX = 10
export function drawnRoads(world: World): World['roads'] {
  let roads = drawn.get(world)
  if (roads) return roads
  const { size, terrain } = world
  const wet = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return true
    const t = terrain[y * size + x]
    return t === Terrain.Lake || t === Terrain.River
  }
  const dry = (x: number, y: number) => !wet(x, y) && terrain[y * size + x] !== Terrain.Mountain
  const shore = (x: number, y: number) => dry(x, y) && (wet(x + 1, y) || wet(x - 1, y) || wet(x, y + 1) || wet(x, y - 1))
  // Land reachable from a tile inside a box, with the way back to it (8 ways, no cutting a corner past water); tiles
  // on the shore cost a little more, so a mended road keeps a tile off the water where it can.
  const reach = (from: Point, x0: number, y0: number, x1: number, y1: number) => {
    const w = x1 - x0 + 1
    const cost = new Float64Array(w * (y1 - y0 + 1)).fill(Infinity)
    const came = new Int32Array(cost.length).fill(-1)
    const key = (x: number, y: number) => (y - y0) * w + (x - x0)
    const start = key(from.x, from.y)
    cost[start] = 0
    const open = [start]
    while (open.length > 0) {
      let k = 0
      for (let q = 1; q < open.length; q++) if (cost[open[q]] < cost[open[k]]) k = q
      const i = open[k]
      open[k] = open[open.length - 1]
      open.pop()
      const x = x0 + (i % w)
      const y = y0 + Math.floor(i / w)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < x0 || ny < y0 || nx > x1 || ny > y1 || !dry(nx, ny)) continue
          if (dx && dy && (!dry(x + dx, y) || !dry(x, y + dy))) continue
          const j = key(nx, ny)
          const g = cost[i] + (dx && dy ? Math.SQRT2 : 1) + (shore(nx, ny) ? 0.6 : 0)
          if (g >= cost[j]) continue
          cost[j] = g
          came[j] = i
          open.push(j)
        }
      }
    }
    const pathTo = (to: Point) => {
      const out: Point[] = []
      for (let i = key(to.x, to.y); i >= 0; i = came[i]) out.push({ x: x0 + (i % w) + 0.5, y: y0 + Math.floor(i / w) + 0.5 })
      return out.reverse()
    }
    return { cost, key, pathTo, has: (p: Point) => Number.isFinite(cost[key(p.x, p.y)]) }
  }
  // A path of tiles thinned to every other one (the corners are rounded later), its ends kept.
  const thin = (path: Point[]) => path.filter((_, i) => i % 2 === 0 || i === path.length - 1)

  roads = world.roads.map((road) => {
    // The route tile by tile.
    const tiles: Point[] = []
    for (let i = 0; i < road.points.length; i++) {
      const a = road.points[Math.max(0, i - 1)]
      const b = road.points[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2))
      for (let k = i === 0 ? steps : 1; k <= steps; k++) {
        const t = { x: Math.floor(a.x + ((b.x - a.x) * k) / steps), y: Math.floor(a.y + ((b.y - a.y) * k) / steps) }
        const last = tiles[tiles.length - 1]
        if (!last || last.x !== t.x || last.y !== t.y) tiles.push(t)
      }
    }
    if (!tiles.some((t) => wet(t.x, t.y))) return road
    // Walked tile by tile: dry tiles kept a few apart, each stretch in the water replaced by its mended way.
    const points: Point[] = []
    let since = 0
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]
      if (!wet(tile.x, tile.y) || i === 0) {
        if (since++ % 3 === 0) points.push({ x: tile.x + 0.5, y: tile.y + 0.5 })
        continue
      }
      let j = i
      while (j + 1 < tiles.length && wet(tiles[j + 1].x, tiles[j + 1].y)) j++
      if (j + 1 >= tiles.length) break
      const P = tiles[i - 1]
      const Q = tiles[j + 1]
      const x0 = Math.max(0, Math.min(P.x, Q.x) - MEND_BOX)
      const y0 = Math.max(0, Math.min(P.y, Q.y) - MEND_BOX)
      const x1 = Math.min(size - 1, Math.max(P.x, Q.x) + MEND_BOX)
      const y1 = Math.min(size - 1, Math.max(P.y, Q.y) + MEND_BOX)
      const at = (p: Point) => ({ x: p.x + 0.5, y: p.y + 0.5 })
      // The tile before the water is always kept, so the mended way starts from it.
      const head = points[points.length - 1]
      if (!head || head.x !== P.x + 0.5 || head.y !== P.y + 0.5) points.push(at(P))
      const fromP = reach(P, x0, y0, x1, y1)
      const run = Math.hypot(Q.x - P.x, Q.y - P.y)
      if (fromP.has(Q) && fromP.cost[fromP.key(Q.x, Q.y)] <= run * 2.5 + 6) {
        // Out on the bank it went in by, and not far round by land: keep to the land.
        points.push(...thin(fromP.pathTo(Q)).slice(1))
      } else {
        // A crossing: from the shore of P's bank to the shore of Q's, the narrowest place, not far from where it was.
        const fromQ = reach(Q, x0, y0, x1, y1)
        const shores = (r: ReturnType<typeof reach>) => {
          const list: Point[] = []
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (shore(x, y) && r.has({ x, y })) list.push({ x, y })
          return list
        }
        const near = shores(fromP)
        const far = shores(fromQ)
        let best: [Point, Point] | null = null
        let bestCost = Infinity
        for (const L of near) {
          for (const M of far) {
            const c = Math.hypot(M.x - L.x, M.y - L.y) * 3 + (fromP.cost[fromP.key(L.x, L.y)] + fromQ.cost[fromQ.key(M.x, M.y)]) * 0.25
            if (c < bestCost) {
              bestCost = c
              best = [L, M]
            }
          }
        }
        if (best) {
          const [L, M] = best
          points.push(...thin(fromP.pathTo(L)).slice(1))
          points.push(...thin(fromQ.pathTo(M)).reverse())
        } else points.push(at(Q))
      }
      since = 1
      i = j + 1
    }
    const last = road.points[road.points.length - 1]
    return { ...road, points: [road.points[0], ...points.slice(1), last] }
  })
  drawn.set(world, roads)
  return roads
}

// Every bridge of a world (on the trade routes and the stone crossings), worked out once.
const bridgesOf = new WeakMap<World, Bridge[]>()
export function worldBridges(world: World): Bridge[] {
  let list = bridgesOf.get(world)
  if (!list) {
    // Routes sharing a stretch (they often do) find the same bridge: it is built once.
    const same = (p: Bridge, q: Bridge) =>
      (Math.hypot(p.ax - q.ax, p.ay - q.ay) < 1.5 && Math.hypot(p.bx - q.bx, p.by - q.by) < 1.5) || (Math.hypot(p.ax - q.bx, p.ay - q.by) < 1.5 && Math.hypot(p.bx - q.ax, p.by - q.ay) < 1.5)
    list = []
    for (const bridge of drawnRoads(world).flatMap((route) => findBridges(world, resampleRoute(roundRoute(route.points))))) {
      if (!list.some((b) => same(b, bridge))) list.push(bridge)
    }
    for (const { a, b } of world.crossings) list.push({ from: 0, to: 0, ax: a.x, ay: a.y, bx: b.x, by: b.y, ha: heightAt(world, a.x, a.y), hb: heightAt(world, b.x, b.y), stone: true })
    bridgesOf.set(world, list)
  }
  return list
}

// A stone bridge's arches: where the abutments end (t0, t1 along the deck), how many arches span between, and the share
// of each arch's span its piers take at either end.
function archLayout(bridge: Bridge) {
  const length = Math.hypot(bridge.bx - bridge.ax, bridge.by - bridge.ay)
  const t0 = Math.min(0.45, ABUTMENT / length)
  return { t0, t1: 1 - t0, arches: Math.max(1, Math.round((length - ABUTMENT * 2) / ARCH_SPAN)), pier: 0.13 }
}

// Height of a stone bridge's arch opening above the water at `t` along it; 0 on the piers and abutments.
export function archOpening(bridge: Bridge, t: number) {
  const { t0, t1, arches, pier } = archLayout(bridge)
  if (t <= t0 || t >= t1) return 0
  const u = ((t - t0) / (t1 - t0)) * arches
  const f = u - Math.floor(u)
  if (f < pier || f > 1 - pier) return 0
  const v = ((f - pier) / (1 - pier * 2)) * 2 - 1
  const crown = deckHeight(bridge, t0 + ((Math.floor(u) + 0.5) / arches) * (t1 - t0)) - DECK_THICK - 3
  return Math.max(0, crown) * Math.sqrt(1 - v * v)
}

// The bridges' decks as they stand on screen (CLAUDE.md §4.2.1): what they cover of the water behind and below them
// (the river's glints and its ducks are not drawn there; ships sailing under are cut by them), and the line along
// each deck a marcher keeps to.
export interface Decks {
  // Polygons on screen (x, y pairs; tile x→ (x − y)·32, y → (x + y)·16 − z) covering each deck in slices.
  polygons: number[][]
  // Whether the deck covers a point of the water (tile coordinates, on the water's surface).
  covers(x: number, y: number): boolean
  // A point on a deck carried onto the deck's middle line (a walk over the bridge tiles zigzags); others as they are.
  snap(p: Point): Point
  // What of the decks hides a ship whose hull runs `length` tiles along `along` about (x, y): for each deck it lies
  // behind or under, that deck's slices — only on the stern's side (on screen) of where the hull comes out in front
  // of the deck, if it does. Empty when nothing hides it; `key` changes whenever the cut does.
  cut(x: number, y: number, along: 'x' | 'y', length: number): { polygons: number[][]; key: string }
  // Whether a point of the water lies within `pad` tiles of a deck's footprint (no ship rests there).
  near(x: number, y: number, pad: number): boolean
  // The deck nearest a point, within `reach` tiles of its middle line: its two ends (where it meets the banks).
  nearest(p: Point, reach: number): { a: Point; b: Point } | null
}

// A convex polygon (x, y pairs) cut down to the side x ≤ c (side < 0) or x ≥ c (side > 0) of a vertical line.
function clipX(poly: number[], c: number, side: number): number[] {
  const out: number[] = []
  const n = poly.length / 2
  const keep = (x: number) => (side < 0 ? x <= c : x >= c)
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2]
    const ay = poly[i * 2 + 1]
    const bx = poly[((i + 1) % n) * 2]
    const by = poly[((i + 1) % n) * 2 + 1]
    if (keep(ax)) out.push(ax, ay)
    if (keep(ax) !== keep(bx)) out.push(c, ay + ((by - ay) * (c - ax)) / (bx - ax))
  }
  return out.length >= 6 ? out : []
}
const decksOf = new WeakMap<World, Decks>()
export function worldDecks(world: World): Decks {
  let decks = decksOf.get(world)
  if (decks) return decks
  const screen = (x: number, y: number, z: number) => [(x - y) * (TILE_WIDTH / 2), (x + y) * (TILE_HEIGHT / 2) - z] as const
  const hull = (points: (readonly [number, number])[]) => {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const lower: (readonly [number, number])[] = []
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
      lower.push(p)
    }
    const upper: (readonly [number, number])[] = []
    for (const p of sorted.reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
      upper.push(p)
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)]
  }
  const items = worldBridges(world).map((bridge) => {
    const dx = bridge.bx - bridge.ax
    const dy = bridge.by - bridge.ay
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const half = bridge.stone ? STONE_HALF : BRIDGE_HALF
    // Above the deck its railing or parapet; below it the deck's planks, or a stone bridge's walls down to the water.
    const top = bridge.stone ? PARAPET : RAIL_HEIGHT
    const slices: number[][] = []
    const steps = Math.max(2, Math.ceil(length / 0.125))
    for (let k = 0; k < steps; k++) {
      const corners: (readonly [number, number])[] = []
      for (const t of [k / steps, (k + 1) / steps]) {
        const z = deckHeight(bridge, t)
        const cx = bridge.ax + dx * t
        const cy = bridge.ay + dy * t
        for (const side of [-1, 1]) {
          const x = cx + nx * half * side
          const y = cy + ny * half * side
          // A stone bridge's walls reach down to the water, but not across its arches' openings.
          const arch = bridge.stone ? Math.min(archOpening(bridge, k / steps), archOpening(bridge, (k + 1) / steps)) : 0
          const bottom = bridge.stone ? (arch > 0 ? arch : Math.min(z, heightAt(world, x, y))) : z - DECK_THICK
          corners.push(screen(x, y, z + top), screen(x, y, bottom))
        }
      }
      slices.push(hull(corners).flat())
    }
    const xs = slices.flatMap((poly) => poly.filter((_, i) => i % 2 === 0))
    const ys = slices.flatMap((poly) => poly.filter((_, i) => i % 2 === 1))
    return { bridge, dx, dy, length, nx, ny, half, slices, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
  })
  const inside = (poly: number[], x: number, y: number) => {
    let sign = 0
    for (let i = 0; i < poly.length; i += 2) {
      const j = (i + 2) % poly.length
      const c = (poly[j] - poly[i]) * (y - poly[i + 1]) - (poly[j + 1] - poly[i + 1]) * (x - poly[i])
      if (c === 0) continue
      if (sign === 0) sign = Math.sign(c)
      else if (Math.sign(c) !== sign) return false
    }
    return true
  }
  const along = (it: (typeof items)[number], p: Point) => {
    const t = ((p.x - it.bridge.ax) * it.dx + (p.y - it.bridge.ay) * it.dy) / (it.length * it.length)
    const across = (p.x - it.bridge.ax) * it.nx + (p.y - it.bridge.ay) * it.ny
    return { t, across }
  }
  decks = {
    polygons: items.flatMap((it) => it.slices),
    covers(x, y) {
      const [sx, sy] = screen(x, y, 0)
      for (const it of items) {
        if (sx < it.box[0] || sx > it.box[2] || sy < it.box[1] || sy > it.box[3]) continue
        if (it.slices.some((poly) => inside(poly, sx, sy))) return true
      }
      return false
    },
    snap(p) {
      // Over water a marcher is carried onto a deck from further off: the server's way over a river may run a tile
      // or two beside the bridge drawn (the drawn roads are mended, the server's tiles are not).
      const tx = Math.floor(p.x)
      const ty = Math.floor(p.y)
      const terrain = tx >= 0 && ty >= 0 && tx < world.size && ty < world.size ? world.terrain[ty * world.size + tx] : -1
      const wet = terrain === Terrain.River || terrain === Terrain.Lake
      for (const it of items) {
        const { t, across } = along(it, p)
        if (t < -0.02 || t > 1.02 || Math.abs(across) > it.half + (wet ? 2.5 : 0.7)) continue
        const u = Math.min(1, Math.max(0, t))
        return { x: it.bridge.ax + it.dx * u, y: it.bridge.ay + it.dy * u }
      }
      return p
    },
    cut(x, y, way, length) {
      const polygons: number[][] = []
      let key = ''
      const half = length / 2
      const ux = way === 'x' ? half : 0
      const uy = way === 'y' ? half : 0
      for (const [i, it] of items.entries()) {
        const { t, across } = along(it, { x, y })
        const reach = 0.15 + half / it.length
        if (t < -reach || t > 1 + reach || Math.abs(across) > 6) continue
        // How far toward the viewer (+x +y) each end of the hull lies past the deck's front edge (≤ 0: behind or under).
        const s = it.nx + it.ny
        const edge = it.half * Math.abs(s) + 0.3
        const past = (px: number, py: number) => ((px - it.bridge.ax) * it.nx + (py - it.bridge.ay) * it.ny) * s - edge
        const ga = past(x - ux, y - uy)
        const gb = past(x + ux, y + uy)
        if (ga > 0 && gb > 0) continue
        if (ga <= 0 && gb <= 0) {
          polygons.push(...it.slices)
          key += `${i};`
          continue
        }
        // The hull comes out from under the deck: hide only the part of the ship behind it, which on screen lies to
        // one side of the point where the hull crosses the deck's front edge (a hull runs along a tile axis, a slant
        // on screen; its masts and sails stand straight above it).
        const f = ga / (ga - gb)
        const cx = x - ux + 2 * ux * f
        const cy = y - uy + 2 * uy * f
        const c = (cx - cy) * (TILE_WIDTH / 2)
        const hidden = ga <= 0 ? -ux + uy : ux - uy
        const side = hidden < 0 ? -1 : 1
        for (const poly of it.slices) {
          const clipped = clipX(poly, c, side)
          if (clipped.length) polygons.push(clipped)
        }
        key += `${i}:${Math.round(c)}:${side};`
      }
      return { polygons, key }
    },
    near(x, y, pad) {
      for (const it of items) {
        const { t, across } = along(it, { x, y })
        const reach = pad / it.length
        if (t >= -reach && t <= 1 + reach && Math.abs(across) <= it.half + pad) return true
      }
      return false
    },
    nearest(p, reach) {
      let best: { a: Point; b: Point } | null = null
      let bestD = reach
      for (const it of items) {
        const { t, across } = along(it, p)
        const off = Math.max(0, -t, t - 1) * it.length
        const d = Math.hypot(off, across)
        if (d > bestD) continue
        bestD = d
        best = { a: { x: it.bridge.ax, y: it.bridge.ay }, b: { x: it.bridge.bx, y: it.bridge.by } }
      }
      return best
    },
  }
  decksOf.set(world, decks)
  return decks
}

// The height of what one walks on at a point: a bridge's deck where it crosses, the ground elsewhere. Toward the deck's
// edges it eases down to the ground, so one walking by close beside a bridge's end does not hop onto it and off.
export function surfaceHeight(world: World, p: Point) {
  const ground = heightAt(world, p.x, p.y)
  let best = ground
  for (const bridge of worldBridges(world)) {
    const dx = bridge.bx - bridge.ax
    const dy = bridge.by - bridge.ay
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = ((p.x - bridge.ax) * dx + (p.y - bridge.ay) * dy) / lengthSq
    if (t < 0 || t > 1) continue
    const across = Math.abs((p.x - bridge.ax) * dy - (p.y - bridge.ay) * dx) / Math.sqrt(lengthSq)
    const half = bridge.stone ? STONE_HALF : BRIDGE_HALF
    if (across > half + 0.1) continue
    const deck = deckHeight(bridge, t)
    best = Math.max(best, ground + (deck - ground) * (1 - smoothstep(half - 0.25, half + 0.1, across)))
  }
  return best
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
  // A wall or fence sheared to the slope along its run (see structureParts → shear).
  shear?: number
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
// The tiles of the lobby's caves (caves.ts, from the seed): the rock each opens into and the land before its mouth,
// and round them (`clear`) the tiles where no crag, boulder or tree may stand, so the mouth shows from afar.
const CAVE_CLEAR = 2
const caveTilesOf = new WeakMap<World, Map<number, { rock: boolean; dx: number; dy: number } | 'clear'>>()
function caveTiles(world: World) {
  let tiles = caveTilesOf.get(world)
  if (!tiles) {
    tiles = new Map()
    for (const c of caveSpots(world, world.seed)) {
      for (let dy = -CAVE_CLEAR; dy <= CAVE_CLEAR; dy++)
        for (let dx = -CAVE_CLEAR; dx <= CAVE_CLEAR; dx++) {
          const x = c.x + dx
          const y = c.y + dy
          if (x >= 0 && y >= 0 && x < world.size && y < world.size) tiles.set(y * world.size + x, 'clear')
        }
    }
    for (const c of caveSpots(world, world.seed)) {
      tiles.set(c.y * world.size + c.x, { rock: true, dx: c.dx, dy: c.dy })
      tiles.set(Math.floor(c.mouth.y) * world.size + Math.floor(c.mouth.x), { rock: false, dx: c.dx, dy: c.dy })
    }
    caveTilesOf.set(world, tiles)
  }
  return tiles
}

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
// `lift`: leave the trees out and hand back where they stand instead (see ChunkImage.trees). `liftedNear`: the chunks
// round it whose trees are lifted too ('all' when every chunk's are), so the trees of theirs reaching into this one are
// left to them, and those of the others painted here.
// `snow`: how deep the snow lies (weather.ts → snowCover, 0..3): it whitens the open ground (less on roads, paths and
// sand, none on water) and the trees, rocks, inns and buildings painted in (sprites.ts → snowOf).
export function paintChunk(context: PaintContext, cx: number, cy: number, k: number, lift = false, sun: SunShadow = NOON, liftedNear: number[] | 'all' = 'all', snow = 0): ChunkImage {
  const { world, lit, patch, road, bridges, structures, occupied, footprint, trail, trailNear, lane, laneNear } = context
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
      // A laid road over or near this point: the distance to its middle, its edge wandering a little.
      let lanes = Infinity
      const li = Math.min(size - 1, Math.max(0, Math.floor(wy))) * size + Math.min(size - 1, Math.max(0, Math.floor(wx)))
      if (lane[li]) lanes = laneDistance(laneNear.get(li)!, wx, wy)
      // How worn a footpath leaves the grass here (0: not at all): strongest along its middle, its width swelling and
      // narrowing gently, patchy where the grass holds on, fading out at its sides.
      let wear = 0
      if (foot < TRAIL_HALF * (1 + TRAIL_SWELL) + 0.2) {
        const half = TRAIL_HALF * (1 - TRAIL_SWELL + valueNoise(wx * 0.31, wy * 0.31, seed + 131) * 2 * TRAIL_SWELL)
        const body = 1 - smoothstep(half * 0.35, half + 0.14, foot)
        const patchy = 0.4 + valueNoise(wx * 1.7, wy * 1.7, seed + 137) * 0.8
        wear = Math.min(1, body * patchy) * TRAIL_ALPHA
      }

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
      } else if (lanes < LANE_HALF + (dither - 0.5) * 0.13 + mid * 0.07 + (valueNoise(wx * 2.3, wy * 2.3, seed + 147) - 0.5) * 0.14) {
        // A road the lord laid: packed earth, a darker rim where it meets the grass, two faint cart ruts and gravel.
        wear = 0
        const rut = Math.abs(lanes - LANE_RUT) < 0.035 + (valueNoise(wx * 3.1, wy * 3.1, seed + 141) - 0.5) * 0.03
        colors = LANE
        tone = 3 + broad * 1.2 + light * 6 + (speck > 0.9 ? 0.8 : speck < 0.1 ? -0.8 : 0)
        if (lanes > LANE_HALF - 0.08) tone -= 1.3
        else if (rut) tone -= 1.2
        else if (lanes < 0.07) tone += 0.4
        spread = 0.35
        // Pebbles: a few pixels of stone, lit on top.
        const pebble = hash(gx >> 1, gy >> 1, seed + 143)
        if (lanes < LANE_HALF - 0.1 && pebble > 0.965) {
          colors = ROCK
          tone = 4.5 + light * 4 + (pebble > 0.985 ? 1 : 0)
        }
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
        let color = colors[index < 0 ? 0 : index >= colors.length ? colors.length - 1 : index]
        // A footpath's worn earth over the ground, in a few dithered steps of see-through rather than a smooth fade.
        if (wear > 0 && colors !== ROAD && colors !== LANE && colors !== WATER && colors !== FOAM && colors !== POOL) {
          const step = Math.floor((wear / TRAIL_ALPHA) * 3 + d) / 3
          if (step > 0) color = mix(color, ROAD[Math.max(0, Math.min(ROAD.length - 1, Math.round(1.6 + broad * 1.2 + light * 6)))], Math.min(1, step) * TRAIL_ALPHA)
        }
        // Snow over the open ground, patchy until it lies deep; trodden thin on roads and paths, thin on sand.
        if (snow > 0 && colors !== WATER && colors !== FOAM && colors !== POOL && colors !== SNOW) {
          const lies = SNOW_COVER[snow] * (colors === ROAD || colors === LANE ? 0.5 : colors === SAND ? 0.4 : 1) * (1 - (wear / TRAIL_ALPHA) * 0.6)
          if (valueNoise(wx * 0.6, wy * 0.6, seed + 301) * 0.6 + (d + 0.5) * 0.4 < lies) {
            const t = Math.floor(2.6 + light * 6 + d * 0.7)
            color = SNOW[t < 0 ? 0 : t >= SNOW.length ? SNOW.length - 1 : t]
          } else if (wear > 0.02 || colors === ROAD || colors === LANE) {
            // Where it is trodden through: grey slush over the earth, not green grass.
            color = mix(ROAD[Math.max(0, Math.min(ROAD.length - 1, Math.round(1.4 + light * 5)))], SNOW[1], snow * 0.12)
          }
        }
        out[yy * width + px] = color
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
        if (road[i] < ROAD_HALF + 0.4 || trail[i] < TRAIL_HALF + 0.6 + WANDER / 2 || lane[i]) return true
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
  const caves = caveTiles(world)
  const lifted: LiftedTree[] = []
  const xEnd = Math.min(size, x0 + S + SPRITE_MARGIN)
  const yEnd = Math.min(size, y0 + S + SPRITE_MARGIN)
  for (let y = Math.max(0, y0 - SPRITE_MARGIN); y < yEnd; y++) {
    for (let x = Math.max(0, x0 - SPRITE_MARGIN); x < xEnd; x++) {
      const i = y * size + x
      const own = x >= x0 && y >= y0 && x < x0 + S && y < y0 + S
      const terrain = world.terrain[i]
      const spot = (n: number) =>
        [x + 0.15 + hash(x, y, seed + 21 + n) * 0.7, y + 0.15 + hash(x, y, seed + 31 + n) * 0.7] as const
      // The bandits' caves open at the foot of the slopes (CLAUDE.md §7.9.1): a mouth in the rock, nothing grown
      // before it.
      const cave = caves.get(i)
      if (cave !== undefined) {
        if (cave !== 'clear' && cave.rock) {
          // The model stands on the mouth's land tile, its anchor that tile's front corner (caveSprites.ts).
          const look = caveLook(seed, { x, y, dx: cave.dx, dy: cave.dy })
          place(look.sprite, look.at.x, look.at.y, own)
        }
        continue
      }
      if (!clear(x, y)) {
        // A lordship's ground between its buildings and along its footpaths, where no tree may stand (it would hide a
        // wall or a walker): grass tufts, wildflowers and a stone here and there, thicker along the path's verges, and
        // a low bush where nobody walks just behind it (CLAUDE.md §6.4).
        if (footprint[i] || world.feature[i] !== Feature.None) continue
        if (terrain !== Terrain.Grass && terrain !== Terrain.Forest && terrain !== Terrain.Desert) continue
        if (road[i] < ROAD_HALF + 0.45 || trail[i] < TRAIL_HALF + 0.3) continue
        const verge = trail[i] < TRAIL_HALF + 1.4
        const g = hash(x, y, seed + 201)
        const v = hash(x, y, seed + 203)
        if (terrain === Terrain.Desert) {
          // Dry ground stays sparse: a stone, a dry tuft, a scrub where nobody walks behind it.
          if (g < (verge ? 0.1 : 0.06)) place(choose(SPRITES.tuft, v), ...spot(9), own)
          else if (g < 0.12) place(choose(SPRITES.pebbles, v), ...spot(9), own)
          else if (g < 0.15 && !walkedBehind(x, y)) place(choose(SPRITES.scrub, v), ...spot(9), own)
          continue
        }
        const grass = verge ? 0.42 : 0.24
        if (g < grass) place(choose(SPRITES.tallGrass, v), ...spot(9), own)
        else if (g < grass + 0.07) {
          const k = Math.floor(hash(x, y, seed + 205) * SPRITES.wildflowers.length)
          place(choose(SPRITES.wildflowers[k], v), ...spot(9), own)
        } else if (g < grass + 0.13 && !walkedBehind(x, y)) place(choose(hash(x, y, seed + 207) < 0.25 ? SPRITES.berryBush : SPRITES.bush, v), ...spot(9), own)
        else if (g < grass + 0.15) place(choose(SPRITES.pebbles, v), ...spot(9), own)
        continue
      }
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
        // Each lifted tree once, by the chunk it stands in.
        if (own ? lift : liftedNear === 'all' ? lift : liftedNear.includes(Math.floor(y / S) * (size / S) + Math.floor(x / S))) {
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
    // Roads are painted into the ground itself (see setLanes), not as sprites.
    ...structures.filter((s) => s.look !== 'road').flatMap((s) => structureParts(world, s).map((part) => ({ ...part, foot: -1 }))),
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
    const lean: number = ('shear' in p && typeof p.shear === 'number' && p.shear) || 0
    const slack = Math.abs(lean) * p.sprite.width * k
    if (left > width || left + p.sprite.width * k < 0 || top - slack > canvasHeight || top + p.sprite.height * k + slack < 0) continue
    placed.push({ sprite: p.sprite, x, y, row, own, foot: p.foot, ...(lean && { shear: lean }) })
  }
  placed.sort((p, q) => p.row - q.row || p.x - q.x)

  // Shadows darken the ground once, however many of them overlap, and only ground about as far down the screen as the
  // shadow falls (not a hillside rising in front of it).
  const shaded = new Uint8Array(width * canvasHeight)
  const dark = [1 - sun.alpha, 1 - sun.alpha * 0.82, 1 - sun.alpha * 0.6]
  const reach = 6 + 10 * k
  for (const { sprite, x, y, row, foot } of placed) {
    if (foot < 0 || (snow >= 2 && BURIED.has(sprite))) continue
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
  // Grass tufts, wildflowers and pebbles are buried once the snow lies patchy or deeper.
  const buried = snow >= 2 ? BURIED : null
  for (const { sprite: drawn, x, y, row, own, shear } of placed) {
    if (buried?.has(drawn)) continue
    const sprite = snowOf(drawn, snow)
    const w = Math.ceil(sprite.width * k)
    const h = Math.ceil(sprite.height * k)
    const left = x - Math.round(sprite.anchorX * k)
    const top = y - Math.round(sprite.anchorY * k)
    for (let dy = 0; dy < h; dy++) {
      const source = Math.min(sprite.height - 1, Math.floor((dy + 0.5) * step)) * sprite.width
      for (let dx = 0; dx < w; dx++) {
        const xx = left + dx
        if (xx < 0 || xx >= width) continue
        // A sheared piece moves each column up or down with the slope (its anchor column stays).
        const yy = top + dy + (shear ? Math.round(shear * (xx + 0.5 - x)) : 0)
        if (yy < 0 || yy >= canvasHeight) continue
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
    const { t0, t1, arches, pier } = archLayout(bridge)
    const opening = (t: number) => archOpening(bridge, t)
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
