import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Sprite as PixiSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { VILLAGER_SPRITES } from './buildingSprites'
import { SPRITES } from './sprites'
import type { Sprite } from './sprites'
import { textureOf } from './textures'

// Life in the player's town: villagers walking between their houses and their work, and the merchant leading a
// camel to the trade post and back. They walk around buildings, not through them. Like the caravans, positions
// follow from the clock and are never stored.

const VILLAGER_SPEED = 0.6
const REST_SECONDS = [2, 6]
const STRIDES_PER_TILE = 3
// A merchant trip longer than this many tiles each way would be a blur; it is not walked on screen.
const MERCHANT_MAX_TILES = 40
// Paths are searched within this many tiles around the box spanned by their two ends.
const SEARCH_MARGIN = 12

export interface Errand {
  from: Point
  to: Point
}

export interface MerchantTrip {
  home: Point
  market: Point
  departedAt: number
  tripMs: number
}

// A walked line: its corner points and the distance along it at each one.
export interface Path {
  points: Point[]
  at: number[]
  length: number
}

// Shortest walk over tiles that are not blocked (8 directions, no corner cutting), pulled taut wherever a straight
// line stays clear. The two ends may stand on blocked tiles (a field, a doorway).
export function findPath(from: Point, to: Point, blocked: (x: number, y: number) => boolean): Path | null {
  const x0 = Math.floor(Math.min(from.x, to.x)) - SEARCH_MARGIN
  const y0 = Math.floor(Math.min(from.y, to.y)) - SEARCH_MARGIN
  const w = Math.floor(Math.max(from.x, to.x)) + SEARCH_MARGIN - x0 + 1
  const h = Math.floor(Math.max(from.y, to.y)) + SEARCH_MARGIN - y0 + 1
  const index = (p: Point) => (Math.floor(p.y) - y0) * w + (Math.floor(p.x) - x0)
  const start = index(from)
  const goal = index(to)
  const free = (i: number) => i === start || i === goal || !blocked(x0 + (i % w), y0 + Math.floor(i / w))
  const cost = new Float32Array(w * h).fill(Infinity)
  const came = new Int32Array(w * h).fill(-1)
  const open: number[] = [start]
  cost[start] = 0
  const guess = (i: number) => Math.hypot((i % w) - (goal % w), Math.floor(i / w) - Math.floor(goal / w))
  while (open.length > 0) {
    // Few tiles: a linear scan for the best open node is plenty.
    let best = 0
    for (let n = 1; n < open.length; n++) if (cost[open[n]] + guess(open[n]) < cost[open[best]] + guess(open[best])) best = n
    const i = open.splice(best, 1)[0]
    if (i === goal) break
    const x = i % w
    const y = Math.floor(i / w)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (!free(n) || (dx !== 0 && dy !== 0 && (!free(y * w + nx) || !free(ny * w + x)))) continue
        const next = cost[i] + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1)
        if (next >= cost[n]) continue
        if (cost[n] === Infinity) open.push(n)
        cost[n] = next
        came[n] = i
      }
    }
  }
  if (cost[goal] === Infinity) return null
  const cells: Point[] = []
  for (let i = goal; i !== start; i = came[i]) cells.push({ x: x0 + (i % w) + 0.5, y: y0 + Math.floor(i / w) + 0.5 })
  const raw = [from, ...cells.reverse().slice(0, -1), to]
  // String pulling: skip corners while the straight line between stays on free tiles.
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
    for (let s = 1; s < steps; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps }
      const i = index(p)
      if (i !== start && i !== goal && blocked(Math.floor(p.x), Math.floor(p.y))) return false
    }
    return true
  }
  const points = [raw[0]]
  for (let i = 1; i < raw.length; i++) {
    if (i === raw.length - 1 || !clear(points[points.length - 1], raw[i + 1])) points.push(raw[i])
  }
  const at = [0]
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  return { points, at, length: at[at.length - 1] }
}

// Position and screen heading at distance `d` along a path.
function along(path: Path, d: number) {
  d = Math.min(path.length, Math.max(0, d))
  let i = 1
  while (i < path.points.length - 1 && path.at[i] < d) i++
  const a = path.points[i - 1]
  const b = path.points[i]
  const t = (d - path.at[i - 1]) / Math.max(1e-6, path.at[i] - path.at[i - 1])
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: b.x - a.x - (b.y - a.y) }
}

interface Walker {
  sprite: PixiSprite
  frames: Texture[]
}

function walker(layer: Container, pair: Sprite[]): Walker {
  const sprite = new PixiSprite(textureOf(pair[0]))
  sprite.anchor.set(pair[0].anchorX / pair[0].width, pair[0].anchorY / pair[0].height)
  sprite.visible = false
  layer.addChild(sprite)
  return { sprite, frames: pair.map(textureOf) }
}

export interface Town {
  set(errands: Errand[], merchant: MerchantTrip | null, blocked: (x: number, y: number) => boolean): void
  update(now: number, view: { left: number; top: number; right: number; bottom: number }): void
}

export function createTown(world: World, layer: Container): Town {
  let villagers: (Walker & { path: Path; rest: number; offset: number })[] = []
  const merchant = walker(layer, SPRITES.merchant[3])
  const camels = [0, 1, 2].map((load) => walker(layer, SPRITES.camel[3][load]))
  let trip: (MerchantTrip & { path: Path }) | null = null

  const draw = ({ sprite, frames }: Walker, at: Point, heading: number, stride: number, view: Parameters<Town['update']>[1]) => {
    const sx = (at.x - at.y) * (TILE_WIDTH / 2)
    const sy = (at.x + at.y) * (TILE_HEIGHT / 2) - heightAt(world, at.x, at.y)
    sprite.visible = sx > view.left && sx < view.right && sy > view.top && sy < view.bottom
    if (!sprite.visible) return
    sprite.position.set(Math.round(sx), Math.round(sy))
    sprite.zIndex = sy
    sprite.scale.x = heading < 0 ? -1 : 1
    sprite.texture = frames[Math.floor(stride * STRIDES_PER_TILE) % 2]
  }

  return {
    set(errands, next, blocked) {
      for (const v of villagers) v.sprite.destroy()
      villagers = errands.flatMap((errand, i) => {
        const path = findPath(errand.from, errand.to, blocked)
        if (!path) return []
        const pair = VILLAGER_SPRITES[Math.floor(hash(i, 3, world.seed) * VILLAGER_SPRITES.length)]
        const roll = (n: number) => hash(Math.round(errand.from.x * 7 + errand.to.y), i * 8 + n, world.seed + 77)
        return [
          {
            ...walker(layer, pair),
            path,
            rest: REST_SECONDS[0] + roll(0) * (REST_SECONDS[1] - REST_SECONDS[0]),
            offset: roll(1) * 100,
          },
        ]
      })
      const far = !next || Math.hypot(next.market.x - next.home.x, next.market.y - next.home.y) > MERCHANT_MAX_TILES
      const path = next && !far ? findPath(next.home, next.market, blocked) : null
      trip = next && path ? { ...next, path } : null
    },
    update(now, view) {
      const seconds = now / 1000
      // Each villager walks out, rests at work, walks back and rests at home; out of sight while indoors.
      for (const v of villagers) {
        const walk = v.path.length / VILLAGER_SPEED
        const loop = (walk + v.rest) * 2
        const u = (seconds + v.offset) % loop
        const out = u < walk + v.rest
        const moving = out ? u < walk : u - walk - v.rest < walk
        if (!moving) {
          v.sprite.visible = false
          continue
        }
        const d = (out ? u : walk - (u - walk - v.rest)) * VILLAGER_SPEED
        const p = along(v.path, d)
        draw(v, p, out ? p.heading : -p.heading, d, view)
      }

      for (const c of [merchant, ...camels]) c.sprite.visible = false
      if (!trip) return
      const { path, departedAt, tripMs } = trip
      // Out with full loads during the first half of the trip, back with empty ones in the second.
      const p = ((((now - departedAt) % tripMs) + tripMs) % tripMs) / tripMs
      const out = p < 0.5
      const d = (out ? p * 2 : 2 - p * 2) * path.length
      const lead = along(path, d)
      draw(merchant, lead, out ? lead.heading : -lead.heading, d, view)
      // The camel follows a step behind its driver.
      const behind = d - (out ? 0.9 : -0.9)
      const camel = along(path, behind)
      draw(camels[out ? 2 : 0], camel, out ? camel.heading : -camel.heading, behind, view)
    },
  }
}
