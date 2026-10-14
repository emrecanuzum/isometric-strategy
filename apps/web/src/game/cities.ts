import { balance, cityCenter, hash } from '@game/shared'
import type { Point, World } from '@game/shared'
import type { Structure, StructureLook } from './buildingSprites'

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

type Side = 'n' | 's' | 'w' | 'e'

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
    found = world.cities.flatMap((_, index) => layout(world, index))
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
      return [ring, ...streets]
    })
    lanes.set(world, found)
  }
  return found
}
