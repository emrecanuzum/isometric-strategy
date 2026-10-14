import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Sprite as PixiSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { VILLAGER_SPRITES } from './buildingSprites'
import { SPRITES } from './sprites'
import type { Sprite } from './sprites'
import { textureOf } from './textures'

// Life in the player's town: villagers walking between their houses and their work, and the merchants (the player's
// and every other kingdom's) leading camels to their trade posts and back. They walk around buildings, not through them. Like the caravans, positions
// follow from the clock and are never stored.

const VILLAGER_SPEED = 0.6
const REST_SECONDS = [2, 6]
const STRIDES_PER_TILE = 3
// Paths are searched within this many tiles around the box spanned by their two ends.
const SEARCH_MARGIN = 12
const WIDE_MARGIN = 48

export interface Errand {
  from: Point
  to: Point
}

export interface MerchantTrip {
  home: Point
  market: Point
  departedAt: number
  tripMs: number
  // The merchant's robe (see SPRITES.merchant); the player's own wears the last.
  robe?: number
}

// A walked line: its corner points and the distance along it at each one.
export interface Path {
  points: Point[]
  at: number[]
  length: number
}

// Stepping onto a worn footpath costs this much of fresh ground, so new walks join the paths already there and the
// town wears a few shared paths instead of a fan of straight lines.
const WORN_COST = 0.35

// Shortest walk over tiles that are not blocked (8 directions, no corner cutting), pulled taut wherever a straight
// line stays clear. The two ends may stand on blocked tiles (a field, a doorway). With `worn`, tiles on footpaths are
// cheaper to walk, and the walk is pulled taut only along stretches that stay all on or all off them.
export function findPath(from: Point, to: Point, blocked: (x: number, y: number) => boolean, worn?: (x: number, y: number) => boolean, margin = SEARCH_MARGIN): Path | null {
  const x0 = Math.floor(Math.min(from.x, to.x)) - margin
  const y0 = Math.floor(Math.min(from.y, to.y)) - margin
  const w = Math.floor(Math.max(from.x, to.x)) + margin - x0 + 1
  const h = Math.floor(Math.max(from.y, to.y)) + margin - y0 + 1
  const index = (p: Point) => (Math.floor(p.y) - y0) * w + (Math.floor(p.x) - x0)
  const start = index(from)
  const goal = index(to)
  const free = (i: number) => i === start || i === goal || !blocked(x0 + (i % w), y0 + Math.floor(i / w))
  const step = (i: number) => (worn?.(x0 + (i % w), y0 + Math.floor(i / w)) ? WORN_COST : 1)
  // Float64: with 32-bit costs rounding can make two tiles each look cheaper by way of the other, which loops the
  // walk back from the goal forever.
  const cost = new Float64Array(w * h).fill(Infinity)
  const closed = new Uint8Array(w * h)
  const came = new Int32Array(w * h).fill(-1)
  cost[start] = 0
  // The guess never overestimates, even when the whole way could be on footpaths.
  const scale = worn ? WORN_COST : 1
  const guess = (i: number) => scale * Math.hypot((i % w) - (goal % w), Math.floor(i / w) - Math.floor(goal / w))
  // A binary heap of [priority, tile]; stale entries are skipped when popped.
  const heap: [number, number][] = [[guess(start), start]]
  const push = (entry: [number, number]) => {
    heap.push(entry)
    for (let c = heap.length - 1; c > 0; ) {
      const p = (c - 1) >> 1
      if (heap[p][0] <= heap[c][0]) break
      ;[heap[p], heap[c]] = [heap[c], heap[p]]
      c = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const end = heap.pop()!
    if (heap.length > 0) {
      heap[0] = end
      for (let p = 0; ; ) {
        const l = p * 2 + 1
        const r = l + 1
        let m = p
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === p) break
        ;[heap[p], heap[m]] = [heap[m], heap[p]]
        p = m
      }
    }
    return top
  }
  while (heap.length > 0) {
    const i = pop()[1]
    if (closed[i]) continue
    closed[i] = 1
    if (i === goal) break
    const x = i % w
    const y = Math.floor(i / w)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const n = ny * w + nx
        if (closed[n] || !free(n) || (dx !== 0 && dy !== 0 && (!free(y * w + nx) || !free(ny * w + x)))) continue
        const next = cost[i] + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * step(n)
        if (next >= cost[n]) continue
        cost[n] = next
        came[n] = i
        push([next + guess(n), n])
      }
    }
  }
  if (cost[goal] === Infinity) return null
  const cells: Point[] = []
  // No walk is longer than the box it was searched in; anything longer would be a loop.
  for (let i = goal; i !== start; i = came[i]) {
    if (i < 0 || cells.length > w * h) return null
    cells.push({ x: x0 + (i % w) + 0.5, y: y0 + Math.floor(i / w) + 0.5 })
  }
  const raw = [from, ...cells.reverse().slice(0, -1), to]
  // String pulling: skip corners while the straight line between stays on free tiles (and on or off the footpaths
  // throughout, so a walk that joins a path keeps to it).
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
    let side: boolean | null = null
    for (let s = 1; s < steps; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps }
      const i = index(p)
      if (i === start || i === goal) continue
      if (blocked(Math.floor(p.x), Math.floor(p.y))) return false
      if (worn) {
        const on = worn(Math.floor(p.x), Math.floor(p.y))
        if (side !== null && on !== side) return false
        side = on
      }
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

// The tiles a walked line passes over.
export function tilesAlong(points: Point[], visit: (x: number, y: number) => void) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3))
    for (let s = 0; s <= steps; s++) visit(Math.floor(a.x + ((b.x - a.x) * s) / steps), Math.floor(a.y + ((b.y - a.y) * s) / steps))
  }
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
  set(errands: Errand[], merchants: MerchantTrip[], blocked: (x: number, y: number) => boolean, worn: (x: number, y: number) => boolean): void
  update(now: number, view: { left: number; top: number; right: number; bottom: number }): void
}

export function createTown(world: World, layer: Container): Town {
  let villagers: (Walker & { path: Path; rest: number; offset: number })[] = []
  // Each merchant with the camel he leads (full, half, empty loads), and his walk.
  let trips: (MerchantTrip & { path: Path; merchant: Walker; camels: Walker[] })[] = []

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
    set(errands, next, blocked, worn) {
      for (const v of villagers) v.sprite.destroy()
      villagers = errands.flatMap((errand, i) => {
        const path = findPath(errand.from, errand.to, blocked, worn)
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
      for (const t of trips) for (const w of [t.merchant, ...t.camels]) w.sprite.destroy()
      trips = next.flatMap((trip) => {
        // Walls can send the way round by a gate well off the straight line, and water by a bridge: look wider
        // before giving up. A far trade post's trip takes longer (lobbyTripMs), so the walk keeps its pace. With no
        // way out at all (walled in without a gate) the merchant stays home, as he sells nothing then either.
        const path = findPath(trip.home, trip.market, blocked, worn) ?? findPath(trip.home, trip.market, blocked, worn, WIDE_MARGIN)
        if (!path) return []
        const robe = Math.min(SPRITES.merchant.length - 1, trip.robe ?? SPRITES.merchant.length - 1)
        return [{ ...trip, path, merchant: walker(layer, SPRITES.merchant[robe]), camels: [0, 1, 2].map((load) => walker(layer, SPRITES.camel[robe][load])) }]
      })
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

      for (const { path, departedAt, tripMs, merchant, camels } of trips) {
        for (const c of [merchant, ...camels]) c.sprite.visible = false
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
      }
    },
  }
}
