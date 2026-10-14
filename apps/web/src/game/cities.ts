import { Terrain, balance, cityCenter, cityHarbour, hash } from '@game/shared'
import type { CitySide, Point, World } from '@game/shared'
import type { Structure, StructureLook } from './buildingSprites'
import { SHIP_LENGTH } from './shipSprites'

// The free cities (CLAUDE.md §4.2, §7.6): one or two walled towns that belong to no kingdom. Their name and layout
// follow from the lobby seed, so every player sees the same city; they are drawn with the kingdoms' own buildings.

const NAMES = ['Altınkapı', 'Sedefhisar', 'Gümüşsu', 'Kervankale', 'Yıldızlıhan', 'Akkale', 'Mermerli', 'Lalezar', 'Bakırköprü', 'Safranbolu']
const RULERS = ['Tüccarlar Divanı', 'Loncalar Meclisi', 'Yaşlı Kadı Hüsnü', 'Kervanbaşılar Kurulu', 'Bilge Şehbender Nazlı', 'Kadı Ahmet Efendi']

export interface CityInfo {
  index: number
  name: string
  ruler: string
}

export function cityInfo(world: World, index: number): CityInfo {
  const start = Math.floor(hash(3, 4, world.seed + 2011) * NAMES.length)
  const c = world.cities[index]
  return {
    index,
    name: `${NAMES[(start + index * 3) % NAMES.length]} Serbest Şehri`,
    ruler: RULERS[Math.floor(hash(c.x, c.y, world.seed + 2017) * RULERS.length)],
  }
}

// The free city whose square holds the tile, if any.
export function cityAt(world: World, tile: Point): number | undefined {
  const S = balance.cities.size
  const index = world.cities.findIndex((c) => tile.x >= c.x && tile.y >= c.y && tile.x < c.x + S && tile.y < c.y + S)
  return index < 0 ? undefined : index
}

type Side = CitySide

// A big ship of a city's harbour: where it lies (tile coordinates of its middle) and along which axis; a sailing one
// goes out and back between `at` and `to` over `period` seconds.
export interface HarbourShip {
  at: Point
  along: 'x' | 'y'
  sailing: boolean
  to?: Point
  period?: number
  seed: number
}

interface Harbour {
  gate: { side: Side; at: number }
  // Bow out toward the lake means toward -along on this side.
  reverse: boolean
  // The lane from the sea gate down to the jetty.
  lane: Point[]
  structures: Structure[]
  ships: HarbourShip[]
}

// A free city on a big lake's shore has a harbour (CLAUDE.md §7.7): a sea gate in the middle of the wall facing the
// lake, a broad jetty from the bank below it out over the water and a narrower one beside it, a harbour house on the
// bank, big ships moored along the jetties and one sailing out and back. It follows from the world's tiles alone.
const harbours = new WeakMap<World, (Harbour | null)[]>()
export function harbourOf(world: World, index: number): Harbour | null {
  let list = harbours.get(world)
  if (!list) {
    list = world.cities.map((c, i) => makeHarbour(world, c, i))
    harbours.set(world, list)
  }
  return list[index] ?? null
}

function makeHarbour(world: World, c: Point, index: number): Harbour | null {
  const found = cityHarbour(world, c)
  if (!found) return null
  const S = balance.cities.size
  const { side } = found
  const { size, terrain } = world
  // Harbour space: d tiles out from the wall, l tiles across from the middle of the side (+l toward the viewer).
  const point = (d: number, l: number): Point =>
    side === 's' ? { x: c.x + S / 2 + l, y: c.y + S - 1 + d }
    : side === 'n' ? { x: c.x + S / 2 + l, y: c.y + 1 - d }
    : side === 'e' ? { x: c.x + S - 1 + d, y: c.y + S / 2 + l }
    : { x: c.x + 1 - d, y: c.y + S / 2 + l }
  const tile = (d: number, l: number) => {
    const p = point(d + 0.5, l + 0.5)
    return { x: Math.floor(p.x), y: Math.floor(p.y) }
  }
  const lake = (d: number, l: number) => {
    const t = tile(d, l)
    return t.x >= 0 && t.y >= 0 && t.x < size && t.y < size && terrain[t.y * size + t.x] === Terrain.Lake
  }
  const land = (d: number, l: number) => {
    const t = tile(d, l)
    const k = terrain[t.y * size + t.x]
    return k !== Terrain.Lake && k !== Terrain.River && k !== Terrain.Mountain
  }
  // The tiles from d0 to d1 and l0 to l1 as a rectangle of tiles.
  const rect = (d0: number, d1: number, l0: number, l1: number) => {
    const a = tile(d0, l0)
    const b = tile(d1, l1)
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 }
  }
  // The jetty leaves the bank where the water begins under all three of its lanes (the shore is ragged).
  const first = (l: number) => {
    let d = 1
    while (d < 12 && !lake(d, l)) d++
    return d
  }
  const shore = Math.max(first(-1), first(0), first(1))
  // How far open water runs out across lanes l0..l1, from the shore.
  const run = (l0: number, l1: number, max: number) => {
    let n = 0
    while (n < max) {
      for (let l = l0; l <= l1; l++) if (!lake(shore + n, l)) return n
      n++
    }
    return n
  }
  const along: 'x' | 'y' = side === 'n' || side === 's' ? 'y' : 'x'
  const gateTile = tile(0, 0)
  const structures: Structure[] = []
  const jetty = (l0: number, l1: number, length: number) => {
    const r = rect(shore - 1, shore + length - 1, l0, l1)
    structures.push({ x: gateTile.x, y: gateTile.y, size: 1, look: 'jetty', variant: 0, city: index, pier: { ...r, along } })
  }
  const main = Math.min(12, run(-1, 1, 12))
  if (main < 4) return null
  jetty(-1, 1, main)
  const side2 = Math.min(main - 3, run(6, 7, main - 3))
  if (side2 >= 4) jetty(6, 7, side2)
  // The harbour house on the bank, beside the lane down to the jetty.
  if (shore >= 4 && [1, 2].every((d) => [-5, -4].every((l) => land(d, l)))) {
    const r = rect(1, 2, -5, -4)
    structures.push({ x: r.x, y: r.y, size: 2, look: 'dock', level: 3, variant: index, city: index })
  }
  // Ships moored along the jetties (on their near sides, so a jetty never shows over a ship), and one under sail.
  const ships: HarbourShip[] = []
  const moor = (d: number, l: number, n: number) => {
    // The ship's whole length must lie on the lake.
    const reach = Math.ceil(SHIP_LENGTH / 2)
    for (let k = -reach; k <= reach; k++) if (!lake(Math.floor(d + k), Math.floor(l))) return
    ships.push({ at: point(d, l), along, sailing: false, seed: index * 31 + n })
  }
  moor(shore + main / 2 + 0.5, 2.8, 0)
  if (side2 >= 4) moor(shore + side2 / 2 + 0.5, 8.8, 1)
  const out = run(-7, -5, 40)
  // One more lies at anchor off the harbour, waiting its turn at the jetty.
  const anchorage = run(-11, -9, 30)
  if (anchorage >= 14) moor(shore + anchorage - 5, -10, 2)
  if (out >= 12) {
    ships.push({ at: point(shore + 4, -6), to: point(shore + out - 3, -6), along, sailing: true, period: 50 + out * 4, seed: index * 31 + 7 })
  }
  return {
    gate: { side, at: Math.floor(S / 2) },
    reverse: side === 'n' || side === 'w',
    lane: [point(0.5, 0.5), point(shore - 0.5, 0)],
    structures,
    ships,
  }
}

// The roads into a city end at its wall (see generateWorld): a gate stands wherever one does (local coordinates along
// the side it comes in by).
function gatesOf(world: World, c: Point): { side: Side; at: number }[] {
  const S = balance.cities.size
  const gates: { side: Side; at: number }[] = []
  for (const road of world.roads) {
    for (const p of [road.points[0], road.points[road.points.length - 1]]) {
      if (p.x < c.x - 0.5 || p.y < c.y - 0.5 || p.x > c.x + S + 0.5 || p.y > c.y + S + 0.5) continue
      const edges: [Side, number][] = [['w', p.x - c.x], ['e', c.x + S - p.x], ['n', p.y - c.y], ['s', c.y + S - p.y]]
      const side = edges.reduce((a, b) => (Math.abs(b[1]) < Math.abs(a[1]) ? b : a))[0]
      const along = side === 'w' || side === 'e' ? p.y - c.y : p.x - c.x
      const at = Math.max(3, Math.min(S - 4, Math.floor(along)))
      if (!gates.some((g) => g.side === side && Math.abs(g.at - at) < 4)) gates.push({ side, at })
    }
  }
  const index = world.cities.indexOf(c)
  const harbour = index >= 0 ? harbourOf(world, index) : null
  if (harbour && !gates.some((g) => g.side === harbour.gate.side && Math.abs(g.at - harbour.gate.at) < 4)) gates.push(harbour.gate)
  if (gates.length === 0) gates.push({ side: 's', at: S / 2 })
  return gates
}

// Buildings a free city is made of, the grand ones first; houses fill what is left.
const PLAN: { look: StructureLook; size: number; level: number }[] = [
  { look: 'market', size: 2, level: 3 },
  { look: 'temple', size: 2, level: 3 },
  { look: 'warehouse', size: 2, level: 3 },
  { look: 'market', size: 2, level: 2 },
  { look: 'treasury', size: 2, level: 2 },
  { look: 'hospital', size: 2, level: 2 },
  { look: 'forge', size: 2, level: 3 },
  { look: 'warehouse', size: 2, level: 2 },
]

// One city's buildings: a ring of wall with a gate wherever a road comes in, the city hall in the middle, the streets
// the roads make kept open, and markets, a temple, stores and houses packed in between.
function layout(world: World, index: number): Structure[] {
  const S = balance.cities.size
  const c = world.cities[index]
  const roll = (n: number) => hash(index * 97 + n, c.x + c.y, world.seed + 2027)
  const out: Structure[] = []
  const add = (x: number, y: number, size: number, look: StructureLook, level = 1, variant = 0) =>
    out.push({ x: c.x + x, y: c.y + y, size, look, level, variant, city: index })

  // The wall: towers at the corners and beside every gate.
  const special = new Map<string, StructureLook>()
  for (const [x, y] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1]]) special.set(`${x},${y}`, 'towerWall')
  for (const g of gatesOf(world, c)) {
    const along = g.side === 'n' || g.side === 's'
    const fixed = g.side === 'n' || g.side === 'w' ? 0 : S - 1
    const tile = (t: number) => (along ? `${t},${fixed}` : `${fixed},${t}`)
    special.set(tile(g.at), along ? 'gate' : 'gateY')
    special.set(tile(g.at - 1), 'towerWall')
    special.set(tile(g.at + 1), 'towerWall')
  }
  for (let t = 0; t < S; t++) {
    for (const [x, y] of [[t, 0], [t, S - 1], [0, t], [S - 1, t]]) {
      if (out.some((s) => s.x === c.x + x && s.y === c.y + y)) continue
      add(x, y, 1, special.get(`${x},${y}`) ?? 'wall')
    }
  }

  // Inside: buildings keep a tile from the walls behind them and two from those in front (see linkWalls).
  const lo = 2
  const hi = S - 3
  const taken = new Uint8Array(S * S)
  const free = (x: number, y: number, size: number) => {
    if (x < lo || y < lo || x + size > hi || y + size > hi) return false
    for (let yy = y; yy < y + size; yy++) for (let xx = x; xx < x + size; xx++) if (taken[yy * S + xx]) return false
    return true
  }
  const take = (x: number, y: number, size: number, margin = 0) => {
    for (let yy = y - margin; yy < y + size + margin; yy++) {
      for (let xx = x - margin; xx < x + size + margin; xx++) if (xx >= 0 && yy >= 0 && xx < S && yy < S) taken[yy * S + xx] = 1
    }
  }
  // The streets: the roads that run into the city, a tile either side of them.
  for (const road of world.roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]
      const b = road.points[i]
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(a.x + ((b.x - a.x) * s) / steps) - c.x
        const y = Math.floor(a.y + ((b.y - a.y) * s) / steps) - c.y
        if (x >= -1 && y >= -1 && x <= S && y <= S) take(x, y, 1, 1)
      }
    }
  }
  // The lanes from the gates to the city hall stay open.
  for (const g of gatesOf(world, c)) {
    const fixed = g.side === 'n' || g.side === 'w' ? 0 : S - 1
    const from = g.side === 'n' || g.side === 's' ? { x: g.at, y: fixed } : { x: fixed, y: g.at }
    const to = { x: S / 2, y: S / 2 }
    const steps = S * 4
    for (let k = 0; k <= steps; k++) take(Math.floor(from.x + 0.5 + ((to.x - from.x - 0.5) * k) / steps), Math.floor(from.y + 0.5 + ((to.y - from.y - 0.5) * k) / steps), 1)
  }
  // The city hall stands in the middle with a square around it.
  const hall = Math.floor(S / 2) - 2
  add(hall, hall, 3, 'palace', 3)
  take(hall, hall, 3, 1)

  // Each building tries the free spots in an order of its own.
  const spots: Point[] = []
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) spots.push({ x, y })
  PLAN.forEach((p, n) => {
    const order = spots.map((s, i) => ({ s, k: hash(s.x * 31 + n, s.y * 17 + i, world.seed + 2029 + index) })).sort((a, b) => a.k - b.k)
    const spot = order.find(({ s }) => free(s.x, s.y, p.size))
    if (!spot) return
    add(spot.s.x, spot.s.y, p.size, p.look, p.level, Math.floor(roll(n) * 4))
    take(spot.s.x, spot.s.y, p.size)
  })
  // Houses fill most of the rest, leaving a few yards and lanes.
  for (const s of spots) {
    if (!free(s.x, s.y, 1) || hash(s.x, s.y, world.seed + 2031 + index) < 0.2) continue
    const r = hash(s.y, s.x, world.seed + 2033 + index)
    add(s.x, s.y, 1, 'house', r < 0.35 ? 3 : r < 0.75 ? 2 : 1, Math.floor(r * 97))
    take(s.x, s.y, 1)
  }
  return out
}

// Every free city's buildings, made once per world.
const made = new WeakMap<World, Structure[]>()
export function cityStructures(world: World): Structure[] {
  let found = made.get(world)
  if (!found) {
    found = world.cities.flatMap((_, index) => [...layout(world, index), ...(harbourOf(world, index)?.structures ?? [])])
    made.set(world, found)
  }
  return found
}

// The lanes of the free cities, worn into the ground like the kingdoms' footpaths: one running round inside the walls,
// and one from every gate to the city hall.
const lanes = new WeakMap<World, Point[][]>()
export function cityTrails(world: World): Point[][] {
  let found = lanes.get(world)
  if (!found) {
    const S = balance.cities.size
    found = world.cities.flatMap((c) => {
      const ring = [
        { x: c.x + 1.5, y: c.y + 1.5 },
        { x: c.x + S - 1.5, y: c.y + 1.5 },
        { x: c.x + S - 1.5, y: c.y + S - 1.5 },
        { x: c.x + 1.5, y: c.y + S - 1.5 },
        { x: c.x + 1.5, y: c.y + 1.5 },
      ]
      const hall = cityCenter(c)
      const streets = gatesOf(world, c).map((g) => {
        const fixed = g.side === 'n' || g.side === 'w' ? 0.5 : S - 0.5
        const gate = g.side === 'n' || g.side === 's' ? { x: c.x + g.at + 0.5, y: c.y + fixed } : { x: c.x + fixed, y: c.y + g.at + 0.5 }
        return [gate, hall]
      })
      const harbour = harbourOf(world, world.cities.indexOf(c))
      return [ring, ...streets, ...(harbour ? [harbour.lane] : [])]
    })
    lanes.set(world, found)
  }
  return found
}
