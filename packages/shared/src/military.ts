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
  goal: { kind: 'move' } | { kind: 'home'; retreat?: boolean } | { kind: 'siege'; kingdom: number }
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

// Tiles taken by buildings, which armies walk around (walls, gates and fields excepted: armies cross those).
export type Blocked = (x: number, y: number) => boolean
export function buildingBlocker(kingdoms: { buildings?: { kind: string; x: number; y: number; size: number }[] }[]): Blocked {
  const taken = new Set<number>()
  for (const k of kingdoms) {
    for (const b of k.buildings ?? []) {
      if (b.kind === 'wall' || b.kind === 'gate' || b.kind === 'farm') continue
      for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) taken.add(y * 65536 + x)
    }
  }
  return (x, y) => taken.has(y * 65536 + x)
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

// Whether a straight walk from `a` to `b` stays on passable ground (sampled every quarter tile).
function clearLine(world: Ground, a: Point, b: Point, blocked?: Blocked) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.floor(a.x + (b.x - a.x) * t)
    const y = Math.floor(a.y + (b.y - a.y) * t)
    if (!passable(world, x, y) || blocked?.(x, y)) return false
  }
  return true
}

// For each 4×4 cell, the point an army passes through it: a bridge tile when the cell holds one (so narrow bridges are
// found), else the passable tile nearest its middle; -1 for a cell with no passable tile. Made once per world.
const waypoints = new WeakMap<object, Int32Array>()
function waypointsOf(world: Ground) {
  let found = waypoints.get(world.terrain)
  if (found) return found
  const n = world.size / CELL
  found = new Int32Array(n * n).fill(-1)
  for (let c = 0; c < n * n; c++) {
    const x0 = (c % n) * CELL
    const y0 = Math.floor(c / n) * CELL
    let best = -1
    let bestScore = Infinity
    for (let y = y0; y < y0 + CELL; y++) {
      for (let x = x0; x < x0 + CELL; x++) {
        if (!passable(world, x, y)) continue
        const i = y * world.size + x
        const score = (world.feature[i] === Feature.Bridge ? -100 : 0) + Math.hypot(x + 0.5 - (x0 + CELL / 2), y + 0.5 - (y0 + CELL / 2))
        if (score < bestScore) {
          bestScore = score
          best = i
        }
      }
    }
    found[c] = best
  }
  waypoints.set(world.terrain, found)
  return found
}

// A route over land from `from` to `to` (tile points), searched on a grid of 4×4-tile cells; null if none.
export function findRoute(world: Ground, from: Point, to: Point, blocked?: Blocked): Point[] | null {
  const n = world.size / CELL
  const base = waypointsOf(world)
  // A cell whose waypoint is under a building passes through another tile of it, if it has a free one.
  const moved = new Map<number, number>()
  const wayOf = (c: number) => {
    const w = base[c]
    if (w < 0 || !blocked || !blocked(w % world.size, Math.floor(w / world.size))) return w
    if (moved.has(c)) return moved.get(c)!
    let found = -1
    const x0 = (c % n) * CELL
    const y0 = Math.floor(c / n) * CELL
    for (let y = y0; y < y0 + CELL && found < 0; y++) for (let x = x0; x < x0 + CELL; x++) if (passable(world, x, y) && !blocked(x, y)) { found = y * world.size + x; break }
    moved.set(c, found)
    return found
  }
  const cellOf = (p: Point) => Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL)
  const open = (c: number) => wayOf(c) >= 0
  const pointOf = (c: number): Point => ({ x: (wayOf(c) % world.size) + 0.5, y: Math.floor(wayOf(c) / world.size) + 0.5 })
  // Two cells are joined only when the walk between their waypoints keeps out of the water and off buildings.
  const joined = (a: number, b: number) => clearLine(world, pointOf(a), pointOf(b), blocked)
  const start = cellOf(from)
  const goal = cellOf(to)
  const cost = new Float64Array(n * n).fill(Infinity)
  const closed = new Uint8Array(n * n)
  const came = new Int32Array(n * n).fill(-1)
  const heap: [number, number][] = []
  const push = (c: number, f: number) => {
    heap.push([f, c])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
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
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top[1]
  }
  const h = (c: number) => Math.hypot((c % n) - (goal % n), Math.floor(c / n) - Math.floor(goal / n))
  if (!open(start) || !open(goal)) return null
  cost[start] = 0
  push(start, h(start))
  while (heap.length > 0) {
    const c = pop()
    if (closed[c]) continue
    closed[c] = 1
    if (c === goal) break
    const cx = c % n
    const cy = Math.floor(c / n)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue
        const next = ny * n + nx
        if (closed[next] || !open(next)) continue
        // No cutting a corner between two closed cells.
        if (dx && dy && !open(cy * n + nx) && !open(ny * n + cx)) continue
        if (!joined(c, next)) continue
        const g = cost[c] + (dx && dy ? Math.SQRT2 : 1)
        if (g >= cost[next]) continue
        cost[next] = g
        came[next] = c
        push(next, g + h(next))
      }
    }
  }
  if (start !== goal && came[goal] === -1) return null
  const cells: number[] = []
  for (let c = goal; c !== start && c !== -1; c = came[c]) {
    // A loop in the trail back would never end.
    if (cells.length > n * n) return null
    cells.push(c)
  }
  // From where the army stands, through each cell's waypoint, to where it was sent.
  const points = [from, pointOf(start), ...cells.reverse().map(pointOf), to]
  // Waypoints are skipped where the straight walk past them stays on land, so the route bends only where it must.
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
