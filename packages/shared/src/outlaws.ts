import { balance } from './balance'
import type { Kingdom } from './economy'
import type { Point } from './iso'
import { atHome, fleetOf, navalBattle, navyOf, shipMight, warships } from './navy'
import type { Fleet, Ships } from './navy'
import type { OutlawPressure } from './outlawPressure'
import { alongPath, fleetAt, isWaterTile, openWater, pathLength, shoreClearance, waterPath } from './seaways'
import type { SailError } from './seaways'
import { Feature, hash } from './worldgen'
import type { World } from './worldgen'

// Bandits on the trade roads and pirates on the water (CLAUDE.md §7.9, §8.5). Each lobby has a few bands of bandits,
// each holding a stretch of a trade road, and a few pirate boats, each roaming a loop of a lake or river. Where they
// are and which stretch they hold follow from the lobby's seed and the clock (like the crowns' patrols), so every
// screen and the server see the same; only what happened to them is kept (lobby_outlaws: beaten and until when, in a
// battle, how far a fight held a band back, the losses it took). A band slows the merchants of the lords whose trade
// post lies by its road and a boat the lords' sea trade and fishing; an army sent after a band (or a fleet after a
// boat) catches it, since they are slower, and fights it for its loot.

const B = () => balance.outlaws.bands
const P = () => balance.outlaws.boats

type Ground = Pick<World, 'size' | 'terrain' | 'feature'>

// What the lobby keeps of a band or a boat (absent: as it was made, at large).
export interface OutlawRow {
  kind: 'band' | 'boat'
  idx: number
  // Times beaten (a band comes back a little stronger each time).
  gen?: number | null
  // Beaten and gone until then (ms).
  down_until?: number | null
  // The battle it is fighting now (bands only).
  battle?: number | null
  // How long fights have held it back (ms): it goes on from where it fought.
  shift?: number | null
  // Soldiers lost in fights it won since it last came back.
  losses?: number | null
}

// ---- Names --------------------------------------------------------------------------------------------------------

const BAND_EPITHETS = ['Kara', 'Topal', 'Kızıl', 'Deli', 'Çolak', 'Sarı', 'Yaralı', 'Kör', 'Uzun', 'Kurt', 'Tilki', 'Demir']
const BAND_NAMES = ['Yusuf', 'Hasan', 'Murat', 'Kasım', 'Bayram', 'Şahin', 'Rüstem', 'Doğan', 'Ali', 'Halil', 'Cafer', 'Ömer', 'Selim', 'Arslan']
const BOAT_FIRST = ['Kara', 'Kanlı', 'Sisli', 'Kızıl', 'Gece', 'Fırtına', 'Yırtık', 'Sinsi', 'Deli', 'Paslı']
const BOAT_SECOND = ['Martı', 'Kürek', 'Yelken', 'Yılan', 'Balina', 'Kanca', 'Kurt', 'Dalga', 'Çapa', 'Akrep']
const pick = <T>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length]

export const bandName = (seed: number, idx: number) => `${pick(BAND_EPITHETS, hash(idx, 1, seed + 5201))} ${pick(BAND_NAMES, hash(idx, 2, seed + 5203))} çetesi`
export const boatName = (seed: number, idx: number) => `${pick(BOAT_FIRST, hash(idx, 3, seed + 5207))} ${pick(BOAT_SECOND, hash(idx, 4, seed + 5209))}`

// ---- Where the bands hold the roads -------------------------------------------------------------------------------

export interface BandSpot {
  idx: number
  name: string
  // The stretch of road it walks up and down (tile centres), and its length in tiles.
  path: Point[]
  length: number
  // Where along its walk it is at time 0 (share of the round trip).
  phase: number
}

const isRoad = (world: Ground, i: number) => world.feature[i] === Feature.Road || world.feature[i] === Feature.Bridge
const cityCentres = (world: Ground) => {
  const size = balance.cities.size
  const out: Point[] = []
  for (let y = 0; y < world.size; y++) {
    for (let x = 0; x < world.size; x++) {
      const i = y * world.size + x
      if (world.feature[i] !== Feature.City) continue
      if ((x > 0 && world.feature[i - 1] === Feature.City) || (y > 0 && world.feature[i - world.size] === Feature.City)) continue
      out.push({ x: x + size / 2, y: y + size / 2 })
    }
  }
  return out
}

const bandCache = new WeakMap<object, Map<number, BandSpot[]>>()

// The lobby's bands and the stretches of road they hold: drawn from the seed along the trade roads (Feature.Road and
// bridges), well away from the crowns' capitals and from one another. A stretch runs from the drawn tile along the
// road as far as it goes, up to stretchTiles.
export function bandSpots(world: Ground, seed: number): BandSpot[] {
  let bySeed = bandCache.get(world)
  if (!bySeed) bandCache.set(world, (bySeed = new Map()))
  const known = bySeed.get(seed)
  if (known) return known
  const { size } = world
  const spec = B()
  const roads: number[] = []
  const cities = cityCentres(world)
  for (let i = 0; i < size * size; i++) {
    if (!isRoad(world, i)) continue
    const x = i % size
    const y = Math.floor(i / size)
    if (cities.some((c) => Math.hypot(c.x - x, c.y - y) < spec.cityClear)) continue
    roads.push(i)
  }
  const spots: BandSpot[] = []
  const starts: Point[] = []
  for (let attempt = 0; attempt < 600 && spots.length < spec.count && roads.length > 0; attempt++) {
    const start = roads[Math.floor(hash(attempt, 11, seed + 5101) * roads.length) % roads.length]
    const sx = start % size
    const sy = Math.floor(start / size)
    if (starts.some((p) => Math.hypot(p.x - sx, p.y - sy) < spec.minSpacing)) continue
    // Along the road from the drawn tile: the furthest road tile within the stretch's length, and the way to it.
    const dist = new Map<number, number>([[start, 0]])
    const came = new Map<number, number>([[start, -1]])
    const queue = [start]
    let far = start
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]
      const d = dist.get(i)!
      if (d > dist.get(far)!) far = i
      const x = i % size
      const y = Math.floor(i / size)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const n = ny * size + nx
        if (dist.has(n) || !isRoad(world, n)) continue
        // The stretch keeps out of the capitals' reach (their peace, CLAUDE.md §7.7).
        if (cities.some((c) => Math.hypot(c.x - nx, c.y - ny) < spec.cityClear)) continue
        const nd = d + (dx && dy ? Math.SQRT2 : 1)
        if (nd > spec.stretchTiles) continue
        dist.set(n, nd)
        came.set(n, i)
        queue.push(n)
      }
    }
    if (dist.get(far)! < spec.minStretchTiles) continue
    const tiles: Point[] = []
    for (let i = far; i !== -1; i = came.get(i)!) tiles.push({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 })
    tiles.reverse()
    starts.push({ x: sx, y: sy })
    const idx = spots.length
    spots.push({ idx, name: bandName(seed, idx), path: tiles, length: pathLength(tiles), phase: hash(idx, 13, seed + 5111) })
  }
  bySeed.set(seed, spots)
  return spots
}

// ---- The bands as they stand ------------------------------------------------------------------------------------

export interface Band extends BandSpot {
  gen: number
  soldiers: number
  downUntil: number | null
  battle: number | null
  shift: number
}

const rowOf = (rows: OutlawRow[] | null | undefined, kind: 'band' | 'boat', idx: number) => rows?.find((r) => r.kind === kind && r.idx === idx)

// A band's strength: drawn from the seed, a little more each time it comes back, less what it lost since.
export function bandStrength(seed: number, idx: number, gen: number, losses = 0) {
  const [lo, hi] = B().soldiers
  const base = lo + Math.floor(hash(idx, 17 + gen, seed + 5113) * (hi - lo + 1))
  return Math.max(1, Math.min(hi + 4, base + gen * B().growPerRespawn) - losses)
}

export function bandsOf(world: Ground, seed: number, rows?: OutlawRow[] | null): Band[] {
  return bandSpots(world, seed).map((s) => {
    const row = rowOf(rows, 'band', s.idx)
    const gen = row?.gen ?? 0
    return { ...s, gen, soldiers: bandStrength(seed, s.idx, gen, row?.losses ?? 0), downUntil: row?.down_until ?? null, battle: row?.battle ?? null, shift: Number(row?.shift ?? 0) }
  })
}

// Whether the band is about (not beaten and gone) at `at`.
export const outlawUp = (o: { downUntil: number | null }, at: number) => !(o.downUntil !== null && o.downUntil > at)

// How far along its round trip (out and back along its stretch) the band is at `at`, in tiles.
function bandWalked(b: Band, at: number) {
  const total = b.length * 2
  if (total <= 0) return 0
  const d = ((at - b.shift) / 1000) * B().speedTilesPerSecond + b.phase * total
  return ((d % total) + total) % total
}

// Where the band is at `at` (walking up and down its stretch of road, slower than any army).
export function bandAt(b: Band, at: number): Point {
  const d = bandWalked(b, at)
  return alongPath(b.path, d <= b.length ? d : b.length * 2 - d).at
}

// The leg of its walk the band is on at `at`, as an army's march (path, set off, arrival) for drawing it.
export function bandLeg(b: Band, at: number) {
  const d = bandWalked(b, at)
  const legMs = (b.length / B().speedTilesPerSecond) * 1000
  const out = d <= b.length
  const done = ((out ? d : d - b.length) / B().speedTilesPerSecond) * 1000
  return { path: out ? b.path : [...b.path].reverse(), departAt: at - done, arriveAt: at - done + legMs }
}

// The band as a side of a battle: spearmen and archers who know the roads (kingdom 0: no one's).
export function bandFighter(b: Pick<Band, 'soldiers'>) {
  const archers = Math.round(b.soldiers * B().archerShare)
  return { kingdom: 0, army: null, soldiers: b.soldiers, morale: B().morale, familiarity: B().familiarity, units: { spear: b.soldiers - archers, archer: archers }, outlaws: true }
}

// What beating a band brings: its hoard of war materials, gold and building goods, by its size.
export function bandLoot(soldiers: number) {
  const l = B().loot
  return { arms: Math.round(soldiers * l.armsPerSoldier), gold: Math.round(soldiers * l.goldPerSoldier), materials: Math.round(soldiers * l.materialsPerSoldier) }
}

// ---- The road the bands hold --------------------------------------------------------------------------------------

const heldCache = new WeakMap<object, Map<string, Set<number>>>()

// The road tiles a band holds: those within holdTiles of its stretch.
function heldBy(world: Ground, b: BandSpot, seed: number) {
  let byKey = heldCache.get(world)
  if (!byKey) heldCache.set(world, (byKey = new Map()))
  const key = `${seed}:${b.idx}`
  let held = byKey.get(key)
  if (held) return held
  held = new Set()
  const r = B().holdTiles
  const { size } = world
  for (const p of b.path) {
    for (let y = Math.floor(p.y - r); y <= p.y + r; y++) {
      for (let x = Math.floor(p.x - r); x <= p.x + r; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) > r) continue
        const i = y * size + x
        if (isRoad(world, i)) held.add(i)
      }
    }
  }
  byKey.set(key, held)
  return held
}

// How much of the road within `radius` tiles of `centre` the bands about at `at` hold (0–1), and how many bands that is.
export function roadHeld(world: Ground, seed: number, bands: Band[], centre: Point, at: number, radius = balance.outlaws.road.radiusTiles) {
  const near = bands.filter((b) => outlawUp(b, at) && b.path.some((p) => Math.hypot(p.x - centre.x, p.y - centre.y) <= radius + B().holdTiles))
  const { size } = world
  let total = 0
  let held = 0
  const sets = near.map((b) => heldBy(world, b, seed))
  for (let y = Math.max(0, Math.floor(centre.y - radius)); y <= Math.min(size - 1, centre.y + radius); y++) {
    for (let x = Math.max(0, Math.floor(centre.x - radius)); x <= Math.min(size - 1, centre.x + radius); x++) {
      const i = y * size + x
      if (!isRoad(world, i) || Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) > radius) continue
      total++
      if (sets.some((s) => s.has(i))) held++
    }
  }
  return { share: total === 0 ? 0 : held / total, bands: near.length, roadTiles: total }
}

// ---- Where the pirates roam ---------------------------------------------------------------------------------------

export interface BoatSpot {
  idx: number
  name: string
  // The loop it sails round and round (out over the water and back), and its length in tiles.
  loop: Point[]
  length: number
  phase: number
}

const boatCache = new WeakMap<object, Map<number, BoatSpot[]>>()

// The sizes of the water bodies, each water tile labelled with its body's size.
function waterBodies(world: Ground) {
  const { size } = world
  const label = new Int32Array(size * size).fill(-1)
  const sizes: number[] = []
  const water = (x: number, y: number) => isWaterTile(world as World, x, y)
  for (let i = 0; i < size * size; i++) {
    if (label[i] >= 0 || !water(i % size, Math.floor(i / size))) continue
    const id = sizes.length
    let count = 0
    const stack = [i]
    label[i] = id
    while (stack.length > 0) {
      const j = stack.pop()!
      count++
      const x = j % size
      const y = Math.floor(j / size)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
        const n = ny * size + nx
        if (label[n] >= 0 || !water(nx, ny)) continue
        label[n] = id
        stack.push(n)
      }
    }
    sizes.push(count)
  }
  return { label, sizes }
}

// The lobby's pirate boats and their loops: drawn from the seed on the open water of the bigger lakes and rivers
// (not by the crowns' harbours), apart from one another; each sails out to the furthest open water it finds within
// its reach and back.
export function boatSpots(world: Ground, seed: number): BoatSpot[] {
  let bySeed = boatCache.get(world)
  if (!bySeed) boatCache.set(world, (bySeed = new Map()))
  const known = bySeed.get(seed)
  if (known) return known
  const spec = P()
  const { size } = world
  const field = shoreClearance(world as World)
  const { label, sizes } = waterBodies(world)
  const cities = cityCentres(world)
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && field[y * size + x] >= 2
  const spots: BoatSpot[] = []
  const starts: Point[] = []
  for (let attempt = 0; attempt < 3000 && spots.length < spec.count; attempt++) {
    const i = Math.floor(hash(attempt, 21, seed + 5301) * size * size) % (size * size)
    const sx = i % size
    const sy = Math.floor(i / size)
    if (!open(sx, sy) || sizes[label[i]] < spec.minWater) continue
    if (starts.some((p) => Math.hypot(p.x - sx, p.y - sy) < spec.minSpacing)) continue
    if (cities.some((c) => Math.hypot(c.x - sx, c.y - sy) < spec.cityClear + balance.cities.size)) continue
    const from = { x: sx + 0.5, y: sy + 0.5 }
    let best: Point[] | null = null
    let bestLength = 0
    for (let j = 0; j < 12; j++) {
      const angle = (j / 12) * Math.PI * 2 + hash(attempt, j, seed + 5303) * 0.4
      for (const r of [spec.loopTiles[1], (spec.loopTiles[0] + spec.loopTiles[1]) / 2, spec.loopTiles[0]]) {
        const tx = Math.floor(from.x + Math.cos(angle) * r)
        const ty = Math.floor(from.y + Math.sin(angle) * r)
        if (!open(tx, ty) || label[ty * size + tx] !== label[i]) continue
        const path = waterPath(world as World, from, { x: tx + 0.5, y: ty + 0.5 }, 30000)
        if (!path) continue
        const length = pathLength(path)
        if (length > bestLength) [best, bestLength] = [path, length]
        break
      }
      if (bestLength >= spec.loopTiles[1]) break
    }
    if (!best || bestLength < spec.loopTiles[0] * 0.6) continue
    starts.push({ x: sx, y: sy })
    const idx = spots.length
    const loop = [...best, ...best.slice(0, -1).reverse()]
    spots.push({ idx, name: boatName(seed, idx), loop, length: pathLength(loop), phase: hash(idx, 23, seed + 5311) })
  }
  bySeed.set(seed, spots)
  return spots
}

export interface Boat extends BoatSpot {
  gen: number
  // How many corsair-like boats sail together (their might in a fight).
  ships: number
  downUntil: number | null
}

export function boatsOf(world: Ground, seed: number, rows?: OutlawRow[] | null): Boat[] {
  const [lo, hi] = P().ships
  return boatSpots(world, seed).map((s) => {
    const row = rowOf(rows, 'boat', s.idx)
    const gen = row?.gen ?? 0
    return { ...s, gen, ships: lo + Math.floor(hash(s.idx, 31 + gen, seed + 5313) * (hi - lo + 1)), downUntil: row?.down_until ?? null }
  })
}

// Where the boat is at `at`, and the way it heads.
export function boatAt(b: BoatSpot, at: number) {
  const d = (at / 1000) * P().speedTilesPerSecond + b.phase * b.length
  return alongPath(b.loop, ((d % b.length) + b.length) % b.length)
}

// The pirates as ships in a sea fight: corsairs, light and quick.
export const boatShips = (b: Pick<Boat, 'ships'>): Ships => ({ corsair: b.ships })
export const boatMight = (b: Pick<Boat, 'ships'>) => shipMight(boatShips(b))

// What sinking a pirate boat brings: the bounty and what was in its hold.
export function boatLoot(b: Pick<Boat, 'ships'>) {
  const l = P().loot
  return { gold: l.bounty + l.perShip * b.ships, arms: l.arms * b.ships, materials: l.materials * b.ships }
}

// The pirates' hold on the water by `dock` (0–1): each boat whose loop comes within reach of it adds its share.
export function seaHeld(boats: Boat[], dock: Point, at: number) {
  const reach = P().reachTiles
  const near = boats.filter((b) => outlawUp(b, at) && b.loop.some((p) => Math.hypot(p.x - dock.x, p.y - dock.y) <= reach))
  return { share: Math.min(1, near.length * balance.outlaws.sea.perBoat), boats: near.length }
}

// ---- A lord's lot -------------------------------------------------------------------------------------------------

const centreOf = (r: { x: number; y: number; size: number }): Point => ({ x: r.x + r.size / 2, y: r.y + r.size / 2 })

// What the bandits and pirates hold of a lord's trade: the road round its trade post, the water by its dock (only
// with a dock built). The server writes this into the lord's state (see outlawPressure.ts).
export function pressureOf(world: Ground, seed: number, bands: Band[], boats: Boat[], k: Pick<Kingdom, 'buildings' | 'dockPlot'>, at: number): OutlawPressure {
  const post = k.buildings.find((b) => b.kind === 'tradePost' && b.doneAt <= at)
  const dock = k.buildings.find((b) => b.kind === 'dock' && b.doneAt <= at)
  const road = post ? roadHeld(world, seed, bands, centreOf(post), at) : { share: 0, bands: 0 }
  const sea = dock ? seaHeld(boats, centreOf(dock), at) : { share: 0, boats: 0 }
  const round = (v: number) => Math.round(v * 100) / 100
  return { road: round(road.share), sea: round(sea.share), bands: road.bands, boats: sea.boats, at }
}

// ---- Chasing ------------------------------------------------------------------------------------------------------

// Where a chaser setting out from `from` at `at` at `speed` tiles a second can meet a quarry whose place in time is
// `quarry`: the first moment the quarry is no further (allowing for the way round) than the chaser can go by then. With
// none within the look-ahead, where the quarry will be at its end.
export function interceptOf(from: Point, speed: number, quarry: (t: number) => Point, at: number, spec: { lookAheadSeconds: number; stepSeconds: number; detour: number }) {
  for (let dt = 0; dt <= spec.lookAheadSeconds; dt += spec.stepSeconds) {
    const p = quarry(at + dt * 1000)
    if ((Math.hypot(p.x - from.x, p.y - from.y) * spec.detour) / speed <= dt) return { point: p, at: at + dt * 1000 }
  }
  const t = at + spec.lookAheadSeconds * 1000
  return { point: quarry(t), at: t }
}

// Where an army at `from` at `at` heads to catch the band.
export const bandIntercept = (b: Band, from: Point, at: number) => interceptOf(from, balance.military.speedTilesPerSecond, (t) => bandAt(b, t), at, B().chase)

// ---- A fleet after a pirate boat ----------------------------------------------------------------------------------

export type ChaseError = SailError | 'boat' | 'warships'

function chasePlan(world: World, k: Kingdom, id: number, boat: Boat | undefined, at: number): { error: ChaseError } | { path: Point[] } {
  const fleet = fleetOf(k, id)
  if (!fleet) return { error: 'fleet' }
  if (!atHome(fleet) || fleet.mission.kind === 'trade') return { error: 'away' }
  if (warships(fleet.ships) < 1) return { error: 'warships' }
  if (!boat || !outlawUp(boat, at)) return { error: 'boat' }
  const from = fleetAt(world, k, fleet, at)
  if (!from) return { error: 'route' }
  const speed = 1 / balance.navy.sail.secondsPerTile
  const meet = interceptOf(from, speed, (t) => boatAt(boat, t).at, at, P().chase)
  const path = waterPath(world, from, openWater(world, meet.point))
  return path ? { path } : { error: 'route' }
}

export function chaseBoatError(world: World, k: Kingdom, id: number, boat: Boat | undefined, at: number): ChaseError | null {
  const p = chasePlan(world, k, id, boat, at)
  return 'error' in p ? p.error : null
}

// Sends the fleet after the boat: it sails to where it can meet it (the server looks for the meeting on the way, and
// sends it on again if the boat has slipped by; CLAUDE.md §8.5).
export function chaseBoat(world: World, k: Kingdom, id: number, boat: Boat | undefined, at: number, since = at): Kingdom {
  const p = chasePlan(world, k, id, boat, at)
  if ('error' in p) return k
  const path = p.path.map((q) => ({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }))
  const sail = { path, departAt: at, arriveAt: at + Math.round(pathLength(path) * balance.navy.sail.secondsPerTile * 1000) }
  const n = navyOf(k)
  return { ...k, navy: { ...n, fleets: n.fleets.map((f) => (f.id === id ? { ...f, sail, chase: { boat: boat!.idx, since } } : f)) } }
}

// The fleet gives up the chase (it stays where it is).
export function dropChase(k: Kingdom, id: number): Kingdom {
  const n = navyOf(k)
  return { ...k, navy: { ...n, fleets: n.fleets.map((f) => (f.id === id && f.chase ? (({ chase: _c, ...rest }) => rest as Fleet)(f) : f)) } }
}

// A fleet meets the pirates: a sea fight of the summed might of its ships against theirs (navalBattle; the pirates'
// corsairs beat cogs, galleys beat them). The pirates are not in their own harbour.
export const pirateFight = (fleet: Ships, boat: Pick<Boat, 'ships'>, seed: number) => navalBattle(fleet, boatShips(boat), seed, false)
