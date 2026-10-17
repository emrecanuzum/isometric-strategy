import { balance } from './balance'
import { dockPier } from './economy'
import type { Kingdom } from './economy'
import type { Point } from './iso'
import { atHome, fleetOf, navyOf } from './navy'
import type { Fleet, NavyError, Sail } from './navy'
import type { Rect } from './territory'
import { Terrain } from './worldgen'
import type { World } from './worldgen'

// The fleets' own ways over the water (CLAUDE.md §8.5): a fleet at home lies at anchor off its dock until it is sent
// somewhere on the water ("Hareket et"); it sails there over rivers and lakes (never over land) and rides at anchor
// where it arrived. Like an army's march, a sail is stored as its path and moments, and where the fleet is is worked
// out from them.

const S = balance.navy.sail

export const isWaterTile = (world: World, x: number, y: number) => {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) return false
  const t = world.terrain[ty * world.size + tx]
  return t === Terrain.Lake || t === Terrain.River
}

// Where a fleet waits off a dock: a little way out from the jetty's tip, on the middle of a water tile.
export function dockWater(world: World, dock: Rect): Point | null {
  const pier = dockPier(world, dock)
  if (!pier) return null
  const c = { x: dock.x + dock.size / 2, y: dock.y + dock.size / 2 }
  const mid = { x: pier.x + pier.w / 2, y: pier.y + pier.h / 2 }
  const dir = pier.along === 'x' ? { x: Math.sign(mid.x - c.x) || 1, y: 0 } : { x: 0, y: Math.sign(mid.y - c.y) || 1 }
  const tip = pier.along === 'x' ? { x: dir.x > 0 ? pier.x + pier.w : pier.x, y: mid.y } : { x: mid.x, y: dir.y > 0 ? pier.y + pier.h : pier.y }
  for (const d of [2, 1.5, 1, 0.5, 2.5, 3]) {
    const p = { x: Math.floor(tip.x + dir.x * d), y: Math.floor(tip.y + dir.y * d) }
    if (isWaterTile(world, p.x, p.y)) return { x: p.x + 0.5, y: p.y + 0.5 }
  }
  return null
}

// How far each water tile lies from the nearest land, in tiles (8-way; 1 = beside land), counted up to just past the
// shore penalty's reach (land 0). Worked out once per world.
const CLEAR_CAP = S.shorePenalty.length + 1
const clearances = new WeakMap<World, Uint8Array>()
export function shoreClearance(world: World): Uint8Array {
  let field = clearances.get(world)
  if (field) return field
  const size = world.size
  field = new Uint8Array(size * size)
  for (let i = 0; i < size * size; i++) {
    const t = world.terrain[i]
    field[i] = t === Terrain.Lake || t === Terrain.River ? CLEAR_CAP : 0
  }
  // Two sweeps of a chessboard distance; off the map counts as land.
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : field![y * size + x])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (!field[i]) continue
      field[i] = Math.min(field[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1, at(x + 1, y - 1) + 1)
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x
      if (!field[i]) continue
      field[i] = Math.min(field[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1, at(x - 1, y + 1) + 1)
    }
  }
  clearances.set(world, field)
  return field
}

// What a step onto a water tile costs on top of its length: the nearer the bank, the dearer, so fleets keep to the
// middle of a river or lake where there is room (a narrow river costs the same all across, and still takes them).
const shoreCost = (clearance: number) => S.shorePenalty[clearance - 1] ?? 0

// Whether the straight run from a to b stays on water, with a little room on either side for the hull, and never
// comes nearer the bank than `room` tiles of clearance
// (but within a tile and a half of either end).
function clear(world: World, a: Point, b: Point, room = 0) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0) return true
  const field = room > 0 ? shoreClearance(world) : null
  const n = Math.ceil(len * 12)
  const side = { x: (-(b.y - a.y) / len) * 0.2, y: ((b.x - a.x) / len) * 0.2 }
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n
    const y = a.y + ((b.y - a.y) * i) / n
    if (!isWaterTile(world, x, y) || !isWaterTile(world, x + side.x, y + side.y) || !isWaterTile(world, x - side.x, y - side.y)) return false
    // (Near its ends the run may be as near the bank as the ends themselves are.)
    const end = (len * Math.min(i, n - i)) / n
    if (field && end > 1.5 && field[Math.floor(y) * world.size + Math.floor(x)] < room) return false
  }
  return true
}

// The way over water from one water point to another (tile centres, then straightened where the water allows), or
// null when no water joins them within the search's reach.
export function waterPath(world: World, from: Point, to: Point, maxNodes = S.maxNodes): Point[] | null {
  const size = world.size
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)
  if (!isWaterTile(world, sx, sy) || !isWaterTile(world, tx, ty)) return null
  const start = sy * size + sx
  const goal = ty * size + tx
  const field = shoreClearance(world)
  const came = new Map<number, number>([[start, -1]])
  const cost = new Map<number, number>([[start, 0]])
  // A binary heap of [priority, node].
  const heap: [number, number][] = [[0, start]]
  const push = (p: number, n: number) => {
    heap.push([p, n])
    let i = heap.length - 1
    while (i > 0) {
      const j = (i - 1) >> 1
      if (heap[j][0] <= heap[i][0]) break
      ;[heap[i], heap[j]] = [heap[j], heap[i]]
      i = j
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[i], heap[m]] = [heap[m], heap[i]]
        i = m
      }
    }
    return top
  }
  const h = (n: number) => Math.hypot((n % size) - tx, Math.floor(n / size) - ty)
  let seen = 0
  let found = start === goal
  while (heap.length > 0 && !found) {
    const [, n] = pop()
    if (n === goal) {
      found = true
      break
    }
    if (++seen > maxNodes) return null
    const x = n % size
    const y = Math.floor(n / size)
    const base = cost.get(n)!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (!isWaterTile(world, nx, ny)) continue
      // Diagonally only between two water tiles, never across a corner of land.
      if (dx && dy && (!isWaterTile(world, x + dx, y) || !isWaterTile(world, x, y + dy))) continue
      const m = ny * size + nx
      const c = base + (dx && dy ? Math.SQRT2 : 1) * (1 + shoreCost(field[m]))
      if (c >= (cost.get(m) ?? Infinity)) continue
      cost.set(m, c)
      came.set(m, n)
      push(c + h(m), m)
    }
  }
  if (!found) return null
  const tiles: Point[] = []
  for (let n = goal; n !== -1; n = came.get(n)!) tiles.push({ x: (n % size) + 0.5, y: Math.floor(n / size) + 0.5 })
  tiles.reverse()
  tiles[0] = { x: from.x, y: from.y }
  tiles[tiles.length - 1] = { x: to.x, y: to.y }
  // Straighten: from each kept point, on to the furthest one the water lets it reach directly without coming nearer
  // the bank than the tiles it cuts out did (so a fleet keeps to the middle, and a narrow river still lets it by).
  const room = tiles.map((p) => Math.min(CLEAR_CAP - 1, field[Math.floor(p.y) * size + Math.floor(p.x)]))
  const path = [tiles[0]]
  let i = 0
  while (i < tiles.length - 1) {
    // The least clearance of the tiles a run from i to each j would cut out.
    const least: number[] = []
    for (let k = i + 1, m = CLEAR_CAP; k < tiles.length; k++) {
      least[k] = m
      m = Math.min(m, room[k])
    }
    let j = tiles.length - 1
    while (j > i + 1 && !clear(world, tiles[i], tiles[j], least[j])) j--
    path.push(tiles[j])
    i = j
  }
  return path
}

export const pathLength = (path: Point[]) => path.reduce((n, p, i) => (i ? n + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0)

// The point `d` tiles along a path (clamped to its ends), and the way it heads there.
export function alongPath(path: Point[], d: number): { at: Point; dir: Point } {
  let left = Math.max(0, d)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= len || i === path.length - 1) {
      const f = len ? Math.min(1, left / len) : 0
      return { at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir: { x: b.x - a.x, y: b.y - a.y } }
    }
    left -= len
  }
  return { at: path[0], dir: { x: 1, y: 0 } }
}

// How far along its sail a fleet is at `at` (tiles).
export const sailDone = (sail: Sail, at: number) =>
  sail.arriveAt <= sail.departAt ? pathLength(sail.path) : (Math.min(1, Math.max(0, (at - sail.departAt) / (sail.arriveAt - sail.departAt))) * pathLength(sail.path))

const dockOf = (k: Kingdom): Rect | null => {
  const b = k.buildings.find((x) => x.kind === 'dock')
  return b ? { x: b.x, y: b.y, size: b.size } : k.dockPlot
}

// Where a fleet is on the water at `at`: along its sail, or off its dock if it has never been sent anywhere.
export function fleetAt(world: World, k: Kingdom, fleet: Fleet, at: number): Point | null {
  if (fleet.sail) return alongPath(fleet.sail.path, sailDone(fleet.sail, at)).at
  const dock = dockOf(k)
  return dock ? dockWater(world, dock) : null
}

export type SailError = NavyError | 'land' | 'route'

// Where a fleet sent to `to` rides at anchor: `to` itself if the water all round it is open, else the nearest spot
// within a few tiles that is (so the hulls do not hang over the bank), else `to`.
export function openWater(world: World, to: Point): Point {
  const open = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isWaterTile(world, x + dx, y + dy)) return false
    return true
  }
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)
  for (let r = 0; r <= 4; r++) {
    let best: Point | null = null
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !open(tx + dx, ty + dy)) continue
      const p = { x: tx + dx + 0.5, y: ty + dy + 0.5 }
      if (!best || Math.hypot(p.x - to.x, p.y - to.y) < Math.hypot(best.x - to.x, best.y - to.y)) best = p
    }
    if (best) return best
  }
  return to
}

// The way a fleet would sail to `to` now, or why it cannot: it must be at home (not trading, not off on a raid), the
// spot must be water, and water must join it to where the fleet is.
function plan(world: World, k: Kingdom, id: number, to: Point, at: number): { error: SailError } | { path: Point[] } {
  const fleet = fleetOf(k, id)
  if (!fleet) return { error: 'fleet' }
  if (!atHome(fleet) || fleet.mission.kind === 'trade') return { error: 'away' }
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || !isWaterTile(world, to.x, to.y)) return { error: 'land' }
  const from = fleetAt(world, k, fleet, at)
  const path = from && waterPath(world, from, openWater(world, to))
  return path ? { path } : { error: 'route' }
}

export function sailError(world: World, k: Kingdom, id: number, to: Point, at: number): SailError | null {
  const p = plan(world, k, id, to, at)
  return 'error' in p ? p.error : null
}

export function sailFleet(world: World, k: Kingdom, id: number, to: Point, at: number): Kingdom {
  const p = plan(world, k, id, to, at)
  if ('error' in p) return k
  const path = p.path.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }))
  const sail: Sail = { path, departAt: at, arriveAt: at + Math.round(pathLength(path) * S.secondsPerTile * 1000) }
  const n = navyOf(k)
  return { ...k, navy: { ...n, fleets: n.fleets.map((f) => (f.id === id ? { ...f, sail } : f)) } }
}
