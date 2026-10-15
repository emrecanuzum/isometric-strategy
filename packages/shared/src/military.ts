import { balance } from './balance'
import type { Point } from './iso'
import { counterBonus, mightOf } from './units'
import type { Units } from './units'
import { Feature, Terrain, mulberry32 } from './worldgen'
import type { World } from './worldgen'

// Armies (CLAUDE.md §8.2, §9.7). The server keeps an army's route and its start and end times; where it is at any
// moment is computed from them, the same way on every screen.

export interface Army {
  id: number
  kingdom_id: number
  // Known to its own kingdom only; others see null.
  soldiers: number | null
  units?: Units | null
  path: Point[]
  depart_at: string
  arrive_at: string
  status: 'moving' | 'idle' | 'battle'
  // Where it is heading: a place, home (to rejoin the garrison) or an enemy palace (to lay siege).
  goal: { kind: 'move' } | { kind: 'home'; retreat?: boolean } | { kind: 'siege'; kingdom: number } | { kind: 'town'; town: number }
  // Its morale and its knowledge of the ground as they were when it set off on this route, and where it had camped.
  morale: number
  familiarity: number
  camp: Point
  // How many figures to draw (3–9, growing with its soldiers) and whether it drags catapults; seen by everyone.
  figures?: number
  catapults?: boolean
  // The player's own armies: orders reach it at once until then (an envoy has just reached it).
  contact_until?: string | null
}

// Walkers keep to dry land below the mountains; bridges cross the water.
const passable = (world: Pick<World, 'size' | 'terrain' | 'feature'>, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const i = y * world.size + x
  if (world.feature[i] === Feature.Bridge) return true
  const t = world.terrain[i]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
}

const CELL = 4

type Ground = Pick<World, 'size' | 'terrain' | 'feature'>

// Tiles armies cannot walk over: buildings (fields excepted), standing walls, and the gates of every kingdom but the
// army's own (`mover`). `breach`: a kingdom whose walls and gates are left open, for an army sent to besiege it to find
// the way up to them (see wallsOf).
export type Blocked = (x: number, y: number) => boolean
type Holding = { id?: number; buildings?: { kind: string; x: number; y: number; size: number; broken?: boolean }[] }
export function buildingBlocker(kingdoms: Holding[], mover?: number, breach?: number): Blocked {
  const taken = new Set<number>()
  for (const k of kingdoms) {
    for (const b of k.buildings ?? []) {
      if (b.kind === 'farm') continue
      if ((b.kind === 'wall' || b.kind === 'gate') && k.id !== undefined && k.id === breach) continue
      if (b.kind === 'wall' && b.broken) continue
      if (b.kind === 'gate' && k.id !== undefined && k.id === mover) continue
      for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) taken.add(y * 65536 + x)
    }
  }
  return (x, y) => taken.has(y * 65536 + x)
}

// The standing walls and gates of one kingdom, where a besieging army halts.
export function wallsOf(kingdom: Holding): Blocked {
  const taken = new Set<number>()
  for (const b of kingdom.buildings ?? []) if ((b.kind === 'wall' && !b.broken) || b.kind === 'gate') taken.add(b.y * 65536 + b.x)
  return (x, y) => taken.has(y * 65536 + x)
}

// `route` cut short in the last tile before it first touches a tile where `stop` holds (unchanged if it never does).
export function haltBefore(route: Point[], stop: Blocked): Point[] {
  const out = [route[0]]
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    let last: Point | null = null
    let halted = false
    walkTiles(a, b, (x, y) => {
      if (stop(x, y)) {
        halted = true
        return false
      }
      last = { x: x + 0.5, y: y + 0.5 }
      return true
    })
    if (halted) {
      // Stand in the middle of the last tile reached (or where this leg began if the first tile was already a wall).
      out.push(last ?? a)
      return out
    }
    out.push(b)
  }
  return out
}

// The nearest tile to `p` an army can stand on (not water, mountain or a building), searching outward a few tiles.
export function standingSpot(world: Ground, p: Point, blocked?: Blocked): Point {
  const ok = (x: number, y: number) => passable(world, x, y) && !blocked?.(x, y)
  const px = Math.floor(p.x)
  const py = Math.floor(p.y)
  if (ok(px, py)) return p
  for (let r = 1; r <= 8; r++) {
    let best: Point | null = null
    let bestD = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(px + dx, py + dy)) continue
        const d = Math.hypot(dx, dy)
        if (d < bestD) {
          bestD = d
          best = { x: px + dx + 0.5, y: py + dy + 0.5 }
        }
      }
    }
    if (best) return best
  }
  return p
}

// Every tile a straight walk from `a` to `b` touches, in order (a grid traversal, not sampling, so nothing slips
// between two tiles that meet at a corner: where the walk passes exactly through a corner, both tiles beside it are
// visited too). `visit` returns false to stop; the result says whether the walk was completed.
export function walkTiles(a: Point, b: Point, visit: (x: number, y: number) => boolean) {
  let x = Math.floor(a.x)
  let y = Math.floor(a.y)
  const ex = Math.floor(b.x)
  const ey = Math.floor(b.y)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const tdx = dx === 0 ? Infinity : Math.abs(1 / dx)
  const tdy = dy === 0 ? Infinity : Math.abs(1 / dy)
  let tx = dx === 0 ? Infinity : (sx > 0 ? x + 1 - a.x : a.x - x) * tdx
  let ty = dy === 0 ? Infinity : (sy > 0 ? y + 1 - a.y : a.y - y) * tdy
  if (!visit(x, y)) return false
  for (let guard = 0; (x !== ex || y !== ey) && guard < 100000; guard++) {
    if (Math.abs(tx - ty) < 1e-9) {
      // Through a corner: the two tiles beside it count as touched.
      if (!visit(x + sx, y) || !visit(x, y + sy)) return false
      x += sx
      y += sy
      tx += tdx
      ty += tdy
    } else if (tx < ty) {
      x += sx
      tx += tdx
    } else {
      y += sy
      ty += tdy
    }
    // Stepped past the end (a corner taken right at the last tile): the walk is over.
    if ((sx > 0 && x > ex) || (sx < 0 && x < ex) || (sy > 0 && y > ey) || (sy < 0 && y < ey)) break
    if (!visit(x, y)) return false
  }
  return true
}

// Whether a straight walk from `a` to `b` stays on passable ground, off buildings and walls.
function clearLine(world: Ground, a: Point, b: Point, blocked?: Blocked) {
  return walkTiles(a, b, (x, y) => passable(world, x, y) && !blocked?.(x, y))
}

// A binary heap of [priority, value] pairs, smallest first.
function heapOf() {
  const heap: [number, number][] = []
  return {
    get size() {
      return heap.length
    },
    push(f: number, v: number) {
      heap.push([f, v])
      let i = heap.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (heap[p][0] <= heap[i][0]) break
        ;[heap[p], heap[i]] = [heap[i], heap[p]]
        i = p
      }
    },
    pop() {
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
          ;[heap[m], heap[i]] = [heap[i], heap[m]]
          i = m
        }
      }
      return top[1]
    },
  }
}

// A route over land from `from` to `to` (tile points); null if none. Searched in two steps so it stays quick on a big
// map yet exact: first over 4×4-tile cells (two neighbouring cells are joined when a walk between them exists inside
// them, so a narrow bridge is found), then tile by tile inside the corridor of cells that search chose, and the tile
// path is pulled straight wherever the ground allows.
export function findRoute(world: Ground, from: Point, to: Point, blocked?: Blocked): Point[] | null {
  const size = world.size
  const n = size / CELL
  const ok = (x: number, y: number) => passable(world, x, y) && !blocked?.(x, y)
  const fx = Math.floor(from.x)
  const fy = Math.floor(from.y)
  const tx = Math.floor(to.x)
  const ty = Math.floor(to.y)
  if (!ok(tx, ty)) return null
  const cellOf = (x: number, y: number) => Math.floor(y / CELL) * n + Math.floor(x / CELL)

  // Step one runs over the walkable parts of cells, not whole cells: a cell a wall runs through is two parts, one on
  // either side, so the search cannot slip through the wall there and must find the gate. A part is the tiles of a
  // cell joined to one another inside it; a node is a cell and the number of one of its parts.
  const parts = new Map<number, Int8Array>()
  const partsOf = (cell: number) => {
    let labels = parts.get(cell)
    if (labels) return labels
    labels = new Int8Array(CELL * CELL).fill(-1)
    const x0 = (cell % n) * CELL
    const y0 = Math.floor(cell / n) * CELL
    let next = 0
    for (let k = 0; k < CELL * CELL; k++) {
      if (labels[k] >= 0 || !ok(x0 + (k % CELL), y0 + Math.floor(k / CELL))) continue
      const queue = [k]
      labels[k] = next
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q]
        const x = i % CELL
        const y = Math.floor(i / CELL)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL) continue
          const j = ny * CELL + nx
          if (labels[j] >= 0 || !ok(x0 + nx, y0 + ny)) continue
          labels[j] = next
          queue.push(j)
        }
      }
      next++
    }
    parts.set(cell, labels)
    return labels
  }
  const PARTS = CELL * CELL
  const nodeAt = (x: number, y: number) => {
    const cell = cellOf(x, y)
    const part = partsOf(cell)[(y % CELL) * CELL + (x % CELL)]
    return part < 0 ? -1 : cell * PARTS + part
  }
  // The parts a part steps into across its cell's edge (corners only where neither side tile is blocked).
  const stepsFrom = (node: number) => {
    const cell = Math.floor(node / PARTS)
    const part = node % PARTS
    const labels = partsOf(cell)
    const x0 = (cell % n) * CELL
    const y0 = Math.floor(cell / n) * CELL
    const out = new Set<number>()
    for (let k = 0; k < PARTS; k++) {
      if (labels[k] !== part) continue
      const x = x0 + (k % CELL)
      const y = y0 + Math.floor(k / CELL)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || cellOf(nx, ny) === cell || !ok(nx, ny)) continue
          if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue
          out.add(nodeAt(nx, ny))
        }
      }
    }
    return out
  }
  // Where the walk starts: the start tile's part, or (standing on a blocked tile, in a doorway) the parts beside it.
  const starts = new Set<number>()
  if (ok(fx, fy)) starts.add(nodeAt(fx, fy))
  else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ok(fx + dx, fy + dy)) starts.add(nodeAt(fx + dx, fy + dy))
  const goal = nodeAt(tx, ty)
  if (starts.size === 0) return null

  // Step one: over the parts of cells.
  const cost = new Map<number, number>()
  const closed = new Set<number>()
  const came = new Map<number, number>()
  const open = heapOf()
  const center = (node: number) => {
    const cell = Math.floor(node / PARTS)
    return { x: cell % n, y: Math.floor(cell / n) }
  }
  const goalAt = center(goal)
  const h = (node: number) => {
    const c = center(node)
    return Math.hypot(c.x - goalAt.x, c.y - goalAt.y)
  }
  for (const s of starts) {
    cost.set(s, 0)
    open.push(h(s), s)
  }
  let reached = false
  while (open.size > 0) {
    const node = open.pop()
    if (closed.has(node)) continue
    closed.add(node)
    if (node === goal) {
      reached = true
      break
    }
    const here = center(node)
    for (const next of stepsFrom(node)) {
      if (closed.has(next)) continue
      const there = center(next)
      const g = cost.get(node)! + (here.x !== there.x && here.y !== there.y ? Math.SQRT2 : 1)
      if (g >= (cost.get(next) ?? Infinity)) continue
      cost.set(next, g)
      came.set(next, node)
      open.push(g + h(next), next)
    }
  }
  if (!reached) return null

  // The corridor: the cells chosen and those around them.
  const corridor = new Set<number>()
  let guard = 0
  for (let node: number | undefined = goal; node !== undefined; node = came.get(node)) {
    const cx = Math.floor(node / PARTS) % n
    const cy = Math.floor(Math.floor(node / PARTS) / n)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < n && cy + dy < n) corridor.add((cy + dy) * n + cx + dx)
    }
    if (++guard > n * n * PARTS) break
  }

  // Step two: tile by tile inside the corridor (no cutting a corner past a blocked tile).
  const inCorridor = (x: number, y: number) => corridor.has(cellOf(x, y))
  const tileCost = new Map<number, number>()
  const tileCame = new Map<number, number>()
  const done = new Set<number>()
  const tiles = heapOf()
  const startTile = fy * size + fx
  const goalTile = ty * size + tx
  const th = (i: number) => Math.hypot((i % size) - tx, Math.floor(i / size) - ty)
  tileCost.set(startTile, 0)
  tiles.push(th(startTile), startTile)
  while (tiles.size > 0) {
    const i = tiles.pop()
    if (done.has(i)) continue
    done.add(i)
    if (i === goalTile) break
    const x = i % size
    const y = Math.floor(i / size)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || !inCorridor(nx, ny) || !ok(nx, ny)) continue
        if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue
        const j = ny * size + nx
        if (done.has(j)) continue
        const g = tileCost.get(i)! + (dx && dy ? Math.SQRT2 : 1)
        if (g >= (tileCost.get(j) ?? Infinity)) continue
        tileCost.set(j, g)
        tileCame.set(j, i)
        tiles.push(g + th(j), j)
      }
    }
  }
  if (startTile !== goalTile && !tileCame.has(goalTile)) return null
  const path: Point[] = []
  guard = 0
  for (let i = goalTile; i !== startTile; i = tileCame.get(i)!) {
    path.push({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 })
    if (++guard > size * size) return null
  }
  const points = [from, ...path.reverse().slice(0, -1), to]
  // Pulled straight: a point is kept only where the straight walk past it would leave the ground.
  const route = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    if (!clearLine(world, route[route.length - 1], points[i + 1], blocked)) route.push(points[i])
  }
  route.push(to)
  return route
}

export const routeLength = (path: Point[]) => path.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - path[i - 1].x, p.y - path[i - 1].y) : 0), 0)

export const travelMs = (path: Point[]) => (routeLength(path) / balance.military.speedTilesPerSecond) * 1000

// Where an army on `path` is at `at`: at the start before it sets off, at the end after it arrives.
export function positionOn(path: Point[], departAt: number, arriveAt: number, at: number): Point {
  if (path.length === 0) return { x: 0, y: 0 }
  if (path.length === 1 || at <= departAt) return path[0]
  if (at >= arriveAt) return path[path.length - 1]
  let left = (routeLength(path) * (at - departAt)) / (arriveAt - departAt)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    if (left <= d) return { x: a.x + ((b.x - a.x) * left) / Math.max(d, 1e-9), y: a.y + ((b.y - a.y) * left) / Math.max(d, 1e-9) }
    left -= d
  }
  return path[path.length - 1]
}

export const armyAt = (army: Pick<Army, 'path' | 'depart_at' | 'arrive_at'>, at: number) =>
  positionOn(army.path, Date.parse(army.depart_at), Date.parse(army.arrive_at), at)

// The part of `path` already walked by `at`, ending where the army stands.
export function walkedTo(path: Point[], departAt: number, arriveAt: number, at: number): Point[] {
  const here = positionOn(path, departAt, arriveAt, at)
  if (at >= arriveAt) return path
  let left = (routeLength(path) * Math.max(0, at - departAt)) / Math.max(1, arriveAt - departAt)
  const out = [path[0]]
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (left <= d) break
    out.push(path[i])
    left -= d
  }
  out.push(here)
  return out
}

// ---- Morale and knowledge of the ground ------------------------------------------------------------------------

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Morale (0..100) at `at`: marching wears it down; once the army stands still it recovers at home and fastest at an
// inn, and slowly sags anywhere else. In battle it is whatever the battle left.
export function moraleAt(army: Pick<Army, 'path' | 'depart_at' | 'arrive_at' | 'morale' | 'status'>, at: number, rest: (p: Point) => 'home' | 'inn' | 'field') {
  const m = balance.military.morale
  if (army.status === 'battle') return army.morale
  const depart = Date.parse(army.depart_at)
  const arrive = Date.parse(army.arrive_at)
  const hours = (ms: number) => Math.max(0, ms) / 3_600_000
  let value = army.morale + m.marchPerHour * hours(Math.min(at, arrive) - depart) * (army.path.length > 1 ? 1 : 0)
  if (at > arrive) {
    const place = rest(army.path[army.path.length - 1])
    value += (place === 'home' ? m.homePerHour : place === 'inn' ? m.innPerHour : m.idlePerHour) * hours(at - Math.max(arrive, depart))
  }
  return Math.max(0, Math.min(100, value))
}

// Knowledge of the ground (0..100) at `at`: it grows while the army stays put and fades the further it goes from
// where it had camped.
export function familiarityAt(army: Pick<Army, 'path' | 'depart_at' | 'arrive_at' | 'familiarity' | 'camp'>, at: number) {
  const f = balance.military.familiarity
  const depart = Date.parse(army.depart_at)
  const arrive = Date.parse(army.arrive_at)
  const here = positionOn(army.path, depart, arrive, at)
  const kept = army.familiarity * Math.exp(-dist(here, army.camp) / f.loseTiles)
  if (at <= arrive) return kept
  return 100 - (100 - kept) * Math.exp(-(at - Math.max(arrive, depart)) / (f.gainSeconds * 1000))
}

export const familiarityBonus = (familiarity: number) => (Math.max(0, Math.min(100, familiarity)) / 100) * balance.military.familiarity.maxBonus

export const nearInn = (inns: Point[], p: Point) => inns.some((inn) => dist(inn, p) <= balance.military.morale.innTiles)

// ---- Battle -------------------------------------------------------------------------------------------------------

// One army (or a palace garrison, army null) in a battle.
export interface Fighter {
  kingdom: number
  army: number | null
  soldiers: number
  morale: number
  familiarity: number
  // Of which kinds (all spearmen when absent).
  units?: Units
  // Added to the roll: faith from the temple and tactics from the university (institutions.ts battleSpirit).
  faith?: number
}

// What stands with each side besides its soldiers: its watchtowers within reach of the battle (attackers' too in a
// field battle) and, for a besieged palace, its walls.
export interface Defense {
  towers: number
  walls: number
  attackerTowers?: number
}

export interface SideRound {
  roll: number
  bonus: number
  // Soldiers killed (of them by towers) and morale knocked off the other side this round.
  kills: number
  towerKills?: number
  moraleHit: number
  // This side after the round.
  soldiers: number
  morale: number
}

export interface BattleRound {
  attackers: SideRound
  defenders: SideRound
}

export interface BattlePlan {
  rounds: BattleRound[]
  winner: 'attackers' | 'defenders'
  attackerLosses: number[]
  defenderLosses: number[]
  // Each side's morale at the end, for its armies.
  attackerMorale: number
  defenderMorale: number
  // The roll bonuses each side had: knowledge of the ground, the mix of soldiers against the other's, and for a
  // besieged palace its towers and the walls the catapults have not cancelled.
  attackerBonus: number
  defenderBonus: number
  attackerCounter: number
  defenderCounter: number
  walls: number
  attackerFaith?: number
  defenderFaith?: number
}

const total = (side: Fighter[]) => side.reduce((s, f) => s + f.soldiers, 0)
const weighted = (side: Fighter[], value: (f: Fighter) => number) => {
  const n = total(side)
  return n === 0 ? 0 : side.reduce((s, f) => s + value(f) * f.soldiers, 0) / n
}

// Losses shared out in proportion to each fighter's soldiers (largest remainders get the odd ones).
function share(side: Fighter[], lost: number) {
  const n = total(side)
  if (n === 0) return side.map(() => 0)
  const exact = side.map((f) => (f.soldiers * lost) / n)
  const out = exact.map(Math.floor)
  let left = lost - out.reduce((a, b) => a + b, 0)
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    if (out[i] < side[i].soldiers) {
      out[i]++
      left--
    }
  }
  return out
}

// Plays a battle out round by round (EU4-like): each round both sides roll a die, add their bonuses, and kill and
// shake the other side in proportion. A side whose morale breaks or who has no one left loses; after the last round
// the attackers give up. Deterministic from the seed, so every screen can replay it as it happens.
export function planBattle(attackers: Fighter[], defenders: Fighter[], seed: number, defense: Defense = { towers: 0, walls: 0 }): BattlePlan {
  const b = balance.military.battle
  const tower = balance.military.tower
  const aTowers = defense.attackerTowers ?? 0
  const dTowers = defense.towers
  const random = mulberry32(seed)
  const unitsOf = (side: Fighter[]) =>
    side.reduce<Units>((all, f) => {
      const u = f.units ?? { spear: f.soldiers }
      for (const [k, n] of Object.entries(u)) all[k as keyof Units] = (all[k as keyof Units] ?? 0) + (n ?? 0)
      return all
    }, {})
  const aUnits = unitsOf(attackers)
  const dUnits = unitsOf(defenders)
  // Each catapult cancels a few walls.
  const walls = Math.max(0, defense.walls - (aUnits.catapult ?? 0) * balance.military.catapult.wallsPerCatapult)
  const attackerCounter = counterBonus(aUnits, dUnits)
  const defenderCounter = counterBonus(dUnits, aUnits)
  const attackerFaith = weighted(attackers, (f) => f.faith ?? 0)
  const defenderFaith = weighted(defenders, (f) => f.faith ?? 0)
  const attackerBonus =
    familiarityBonus(weighted(attackers, (f) => f.familiarity)) + attackerCounter + attackerFaith + Math.min(b.maxTowerBonus, aTowers * b.towerBonus)
  const defenderBonus =
    familiarityBonus(weighted(defenders, (f) => f.familiarity)) +
    defenderCounter +
    defenderFaith +
    Math.min(b.maxTowerBonus, dTowers * b.towerBonus) +
    Math.min(b.maxWallBonus, Math.floor(walls / b.wallsForBonus))
  // Soldiers strike as hard as their kinds: cavalry harder, catapults weakly in the field.
  const weight = (units: Units) => mightOf(units) / Math.max(1, Object.values(units).reduce((s, n) => s + (n ?? 0), 0))
  const aWeight = weight(aUnits) || 1
  const dWeight = weight(dUnits) || 1
  const a = { soldiers: total(attackers), morale: weighted(attackers, (f) => f.morale) }
  const d = { soldiers: total(defenders), morale: weighted(defenders, (f) => f.morale) }
  const start = { a: a.soldiers, d: d.soldiers }
  const rounds: BattleRound[] = []
  let winner: 'attackers' | 'defenders' = 'defenders'
  for (let i = 0; i < b.maxRounds; i++) {
    const ra = 1 + Math.floor(random() * b.dice)
    const rd = 1 + Math.floor(random() * b.dice)
    const sa = Math.max(1, ra + attackerBonus)
    const sd = Math.max(1, rd + defenderBonus)
    // Towers shoot every round, with or without soldiers beside them.
    const towersA = Math.min(d.soldiers, aTowers * tower.killsPerRound)
    const towersD = Math.min(a.soldiers, dTowers * tower.killsPerRound)
    const killsByA = Math.min(d.soldiers, Math.round(a.soldiers * aWeight * b.killRate * sa) + towersA)
    const killsByD = Math.min(a.soldiers, Math.round(d.soldiers * dWeight * b.killRate * sd) + towersD)
    const hitByA = sa * b.moraleHit * Math.sqrt(Math.max(1, a.soldiers) / Math.max(1, d.soldiers))
    const hitByD = sd * b.moraleHit * Math.sqrt(Math.max(1, d.soldiers) / Math.max(1, a.soldiers))
    a.soldiers -= killsByD
    d.soldiers -= killsByA
    a.morale = Math.max(0, a.morale - hitByD)
    d.morale = Math.max(0, d.morale - hitByA)
    rounds.push({
      attackers: { roll: ra, bonus: attackerBonus, kills: killsByA, towerKills: towersA, moraleHit: hitByA, soldiers: a.soldiers, morale: a.morale },
      defenders: { roll: rd, bonus: defenderBonus, kills: killsByD, towerKills: towersD, moraleHit: hitByD, soldiers: d.soldiers, morale: d.morale },
    })
    // A side left with no soldiers but towers holds out for a few rounds while the towers shoot.
    const holding = (side: { soldiers: number }, towers: number) => side.soldiers <= 0 && towers > 0 && i + 1 < tower.holdRounds
    const aBroken = !holding(a, aTowers) && (a.soldiers <= 0 || a.morale <= b.retreatMorale)
    const dBroken = !holding(d, dTowers) && (d.soldiers <= 0 || d.morale <= b.retreatMorale)
    if (aBroken || dBroken) {
      winner = dBroken && (!aBroken || d.morale < a.morale) ? 'attackers' : 'defenders'
      break
    }
  }
  return {
    rounds,
    winner,
    attackerLosses: share(attackers, start.a - a.soldiers),
    defenderLosses: share(defenders, start.d - d.soldiers),
    attackerMorale: a.morale,
    defenderMorale: d.morale,
    attackerBonus,
    defenderBonus,
    attackerCounter,
    defenderCounter,
    walls,
    attackerFaith,
    defenderFaith,
  }
}

export const battleMs = (plan: Pick<BattlePlan, 'rounds'>) => plan.rounds.length * balance.military.battle.roundSeconds * 1000
