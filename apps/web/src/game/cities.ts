import { Feature, Terrain, balance, cityCenter, cityHarbour, crownRulerName, hash, heightAt } from '@game/shared'
import type { CitySide, CrownKey, Point, World } from '@game/shared'
import type { KingdomColor, Structure, StructureLook } from './buildingSprites'
import { squad } from './armies'
import { palisade, pavilion, rack, tent } from './campSprites'
import type { Sprite } from './sprites'
import { SHIP_LENGTH } from './shipSprites'
import { L } from '../lib/i18n'

// The free cities (CLAUDE.md §4.2, §7.7): walled towns that belong to no player. Each is the capital of a crown
// kingdom the players swear fealty to as its lords (§7.8). Their names and layout follow from the lobby seed, so every
// player sees the same city; they are drawn with the kingdoms' own buildings.

const NAMES = [
  'Altınkapı', 'Sedefhisar', 'Gümüşsu', 'Kervankale', 'Yıldızlıhan', 'Akkale', 'Mermerli', 'Lalezar', 'Bakırköprü',
  'Safranbolu', 'Mercankale', 'Gülşehir', 'Firuzehisar', 'Tunçkapı', 'Sarıkemer', 'Sarayburnu', 'Çinikale',
  'İpekhan', 'Gökkubbe', 'Demirkapı',
]
const RULERS = [
  L('Kral Alparslan', 'King Alparslan'), L('Kraliçe Nilüfer', 'Queen Nilüfer'), L('Kral Orhan', 'King Orhan'), L('Kraliçe Selcan', 'Queen Selcan'), L('Kral Tuğrul', 'King Tuğrul'), L('Kraliçe Gevherhan', 'Queen Gevherhan'),
  L('Kral Kılıç Arslan', 'King Kılıç Arslan'), L('Kraliçe Mahperi', 'Queen Mahperi'), L('Kral Kubilay', 'King Kubilay'), L('Kraliçe Tomris', 'Queen Tomris'), L('Kral Selçuk', 'King Selçuk'), L('Kraliçe Turhan', 'Queen Turhan'),
  L('Kral Osman', 'King Osman'), L('Kraliçe Gülbahar', 'Queen Gülbahar'), L('Kral Keykubad', 'King Keykubad'), L('Kraliçe Mihrimah', 'Queen Mihrimah'),
]
// The crowns' banners: the first capital's red, the second's blue.
export const CROWN_COLORS = ['#b23a26', '#2f5d9e']
// The same crowns' colours lifted for text on the dark panels, where the banner colours are too dark to read.
export const CROWN_INKS = ['#e8735a', '#7fa8e8']
// The same colours as roof colours (see KINGDOM_COLORS).
export const CROWN_ROOFS = ['crimson', 'royal']

export interface CityInfo {
  index: number
  // The crown kingdom ("Altınkapı Krallığı") and its capital ("Altınkapı").
  name: string
  capital: string
  ruler: string
  color: string
  // The colour for its name written on a dark panel.
  ink: string
}

// Each crown's ruler, drawn from its capital; never the same one for both.
function rulerOf(world: World, index: number) {
  const pick = (i: number) => Math.floor(hash(world.cities[i].x, world.cities[i].y, world.seed + 2017) * RULERS.length)
  const own = pick(index)
  return index > 0 && own === pick(0) ? (own + 1) % RULERS.length : own
}

// The crowns' royal houses follow from the lobby's number, the season's start and the clock (crownHouse.ts); the app
// sets them once the realm is known, so every ruler named anywhere is the one reigning now. Until then the old
// seeded names stand in.
let crownKey: CrownKey | null = null
let crownClock = () => Date.now()
export function setCrownClock(key: CrownKey | null, now: () => number) {
  crownKey = key
  crownClock = now
}
export const crownKeyNow = () => crownKey

export function cityInfo(world: World, index: number): CityInfo {
  const start = Math.floor(hash(3, 4, world.seed + 2011) * NAMES.length)
  const capital = NAMES[(start + index * 3) % NAMES.length]
  return {
    index,
    name: L(`${capital} Krallığı`, `Kingdom of ${capital}`),
    capital,
    ruler: crownKey ? crownRulerName(crownKey, index, crownClock()) : RULERS[rulerOf(world, index)],
    color: CROWN_COLORS[index % CROWN_COLORS.length],
    ink: CROWN_INKS[index % CROWN_INKS.length],
  }
}

// The whole ground of a crown capital: its walled core and the outer city round it, out to the outer wall.
export function cityArea(world: World, index: number) {
  const c = world.cities[index]
  return { x: c.x - RING, y: c.y - RING, size: balance.cities.size + RING * 2 }
}

// The capital whose whole ground (see cityArea) holds the tile, if any.
export function cityAreaAt(world: World, tile: Point): number | undefined {
  const index = world.cities.findIndex((_, i) => {
    const r = cityArea(world, i)
    return tile.x >= r.x && tile.y >= r.y && tile.x < r.x + r.size && tile.y < r.y + r.size
  })
  return index < 0 ? undefined : index
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
  // One more lies at anchor off the harbour, waiting its turn at the jetty.
  const anchorage = run(-11, -9, 30)
  if (anchorage >= 14) moor(shore + anchorage - 5, -10, 2)
  // Every harbour has one galley under sail, going out across the lake and back: on the lane clear of the jetties and
  // the moored ships with the longest open water, starting where the water begins under it (the shore is ragged).
  const lane = (centre: number) => {
    let from = shore
    while (from < shore + 12 && ![-1, 0, 1].every((dl) => lake(from, centre + dl))) from++
    let length = 0
    while (length < 40 && [-1, 0, 1].every((dl) => lake(from + length, centre + dl))) length++
    return { centre, from, length }
  }
  const best = [-6, -14, -17, -20, -23, 12, 15, 18, 21, 24, 4].map(lane).reduce((a, b) => (b.length > a.length ? b : a))
  if (best.length >= 9) {
    const { centre, from, length } = best
    ships.push({ at: point(from + 4, centre), to: point(from + length - 3, centre), along, sailing: true, period: 50 + length * 4, seed: index * 31 + 7 })
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
  // The crown's own: a cathedral and a monument no lord may raise.
  { look: 'cathedral', size: 3, level: 1 },
  { look: 'monument', size: 2, level: 1 },
  { look: 'market', size: 2, level: 3 },
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
  // The royal keep stands in the middle with a square around it: a palace grander than any lord's, roofed in the
  // crown's colour.
  const hall = Math.floor(S / 2) - 2
  out.push({ x: c.x + hall, y: c.y + hall, size: 4, look: 'palace', level: 6, variant: 0, city: index, color: CROWN_ROOFS[index % CROWN_ROOFS.length] })
  take(hall, hall, 4, 1)

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

// The outer city round a crown capital (drawn only; the capital's own tiles stay its walled core): a second, wider
// ring of wall with gates where the roads cross it and towers along it, and between the two walls a crowded town of
// tall houses, markets, stores and temples. The side facing the harbour stays open to the water.
const RING = 10
function outskirts(world: World, index: number): Structure[] {
  const S = balance.cities.size
  const c = world.cities[index]
  const { size, terrain, feature } = world
  const out: Structure[] = []
  const harbour = harbourOf(world, index)
  const x0 = c.x - RING
  const y0 = c.y - RING
  const N = S + RING * 2
  const at = (x: number, y: number) => y * size + x
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size
  const land = (x: number, y: number) => {
    if (!inMap(x, y)) return false
    const t = terrain[at(x, y)]
    return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
  }
  const road = (x: number, y: number) => inMap(x, y) && (feature[at(x, y)] === Feature.Road || feature[at(x, y)] === Feature.Bridge)
  // Tiles the harbour's buildings and lane hold, with a tile round them; the lane itself goes through the outer wall
  // by a gate.
  const kept = new Set<number>()
  for (const st of harbour?.structures ?? []) {
    const rect = st.pier ?? { x: st.x, y: st.y, w: st.size, h: st.size }
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++) for (let x = rect.x - 1; x <= rect.x + rect.w; x++) kept.add(at(x, y))
  }
  const lane = new Set<number>()
  if (harbour) {
    const [a, b] = harbour.lane
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
    for (let k = 0; k <= steps; k++) lane.add(at(Math.floor(a.x + ((b.x - a.x) * k) / steps), Math.floor(a.y + ((b.y - a.y) * k) / steps)))
  }
  const free = (x: number, y: number) => inMap(x, y) && land(x, y) && feature[at(x, y)] === 0 && !kept.has(at(x, y)) && !lane.has(at(x, y))

  // The outer wall, side by side: a gate where a road or the harbour lane crosses it (one per crossing, however
  // long the road runs along the wall), towers at the corners, beside the gates and every so often; no wall on water.
  const sides: { x: number; y: number; along: 'x' | 'y' }[][] = [
    Array.from({ length: N }, (_, t) => ({ x: x0 + t, y: y0, along: 'x' as const })),
    Array.from({ length: N }, (_, t) => ({ x: x0 + t, y: y0 + N - 1, along: 'x' as const })),
    Array.from({ length: N }, (_, t) => ({ x: x0, y: y0 + t, along: 'y' as const })),
    Array.from({ length: N }, (_, t) => ({ x: x0 + N - 1, y: y0 + t, along: 'y' as const })),
  ]
  const crossing = (x: number, y: number) => road(x, y) || lane.has(at(x, y))
  const pieces = new Map<number, Structure>()
  for (const line of sides) {
    const gates = new Set<number>()
    for (let t = 0; t < line.length; t++) {
      if (!crossing(line[t].x, line[t].y)) continue
      let end = t
      while (end + 1 < line.length && crossing(line[end + 1].x, line[end + 1].y)) end++
      // On land, the nearest to the middle of the crossing: a road bridging water where the wall runs has no gate (the
      // wall is open over the water anyway).
      const mid = (t + end) / 2
      let gate = -1
      for (let k = t; k <= end; k++) if (land(line[k].x, line[k].y) && (gate < 0 || Math.abs(k - mid) < Math.abs(gate - mid))) gate = k
      if (gate >= 0) gates.add(gate)
      t = end
    }
    for (let t = 0; t < line.length; t++) {
      const p = line[t]
      const i = at(p.x, p.y)
      if (pieces.has(i) || kept.has(i)) continue
      if (gates.has(t)) {
        pieces.set(i, { x: p.x, y: p.y, size: 1, look: p.along === 'x' ? 'gate' : 'gateY', variant: 0, city: index })
        continue
      }
      if (!land(p.x, p.y) || (feature[i] !== 0 && !crossing(p.x, p.y))) continue
      const corner = t === 0 || t === line.length - 1
      const byGate = gates.has(t - 1) || gates.has(t + 1)
      pieces.set(i, { x: p.x, y: p.y, size: 1, look: corner || byGate || t % 9 === 4 ? 'towerWall' : 'wall', variant: 0, city: index })
    }
    // A scrap of wall the water cuts off (shorter than three pieces, no gate, not at a corner) is left out.
    for (let t = 0; t < line.length; t++) {
      if (!pieces.has(at(line[t].x, line[t].y))) continue
      let end = t
      while (end + 1 < line.length && pieces.has(at(line[end + 1].x, line[end + 1].y))) end++
      let gate = false
      for (let k = t; k <= end; k++) gate ||= gates.has(k)
      if (end - t < 2 && !gate && t > 0 && end < line.length - 1) for (let k = t; k <= end; k++) pieces.delete(at(line[k].x, line[k].y))
      t = end
    }
  }
  out.push(...pieces.values())

  // The town between the walls: buildings keep two tiles off both walls and off the roads.
  const taken = new Set<number>()
  const roll = (x: number, y: number, n: number) => hash(x * 13 + n, y * 7, world.seed + 2041 + index)
  const fits = (x: number, y: number, n: number) => {
    for (let yy = y - 1; yy < y + n + 1; yy++) {
      for (let xx = x - 1; xx < x + n + 1; xx++) {
        if (road(xx, yy)) return false
        if (xx >= x && yy >= y && xx < x + n && yy < y + n && (!free(xx, yy) || taken.has(at(xx, yy)))) return false
      }
    }
    // Not within two tiles of either wall.
    const inner = x + n > c.x - 2 && x < c.x + S + 2 && y + n > c.y - 2 && y < c.y + S + 2
    const outer = x < x0 + 3 || y < y0 + 3 || x + n > x0 + N - 3 || y + n > y0 + N - 3
    return !inner && !outer
  }
  const BIG: StructureLook[] = ['market', 'warehouse', 'temple', 'hospital', 'treasury', 'forge']
  for (let y = y0 + 3; y < y0 + N - 3; y++) {
    for (let x = x0 + 3; x < x0 + N - 3; x++) {
      const r = roll(x, y, 1)
      if (r < 0.06 && fits(x, y, 2)) {
        out.push({ x, y, size: 2, look: BIG[Math.floor(roll(x, y, 2) * BIG.length)], level: 2 + (roll(x, y, 3) < 0.5 ? 1 : 0), variant: Math.floor(roll(x, y, 4) * 4), city: index })
        for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 2; xx++) taken.add(at(xx, yy))
      } else if (r < 0.72 && fits(x, y, 1)) {
        const l = roll(x, y, 5)
        out.push({ x, y, size: 1, look: 'house', level: l < 0.55 ? 3 : 2, variant: Math.floor(l * 97), city: index })
        taken.add(at(x, y))
      }
    }
  }
  return out
}

// The crown's war camp outside the capital's outer wall, on the side away from the harbour: the commander's striped
// pavilion, rows of tents in the crown's colour, squads at drill, racks of spears under tall banners.
const CAMP_W = 14
const CAMP_H = 12
const camps = new Map<string, { tents: Sprite[]; pavilion: Sprite; rack: Sprite; squads: Sprite[]; fence: Record<'x' | 'y', Sprite> }>()
function campLooks(color: KingdomColor) {
  let looks = camps.get(color)
  if (!looks) {
    looks = {
      tents: [tent(color, 0), tent(color, 1)],
      pavilion: pavilion(color),
      rack: rack(color),
      squads: [squad(color, 0, 20), squad(color, 2, 18), squad(color, 1, 20)],
      fence: { x: palisade('x'), y: palisade('y') },
    }
    camps.set(color, looks)
  }
  return looks
}
function warCamp(world: World, index: number): Structure[] {
  const S = balance.cities.size
  const c = world.cities[index]
  const { size, terrain, feature } = world
  const harbour = harbourOf(world, index)
  const roadNear = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = (y + dy) * size + x + dx
        if (feature[i] === Feature.Road || feature[i] === Feature.Bridge) return true
      }
    }
    return false
  }
  const free = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + CAMP_H; y++) {
      for (let x = x0; x < x0 + CAMP_W; x++) {
        if (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) return false
        const t = terrain[y * size + x]
        if (t === Terrain.Lake || t === Terrain.River || t === Terrain.Mountain || feature[y * size + x] !== Feature.None || roadNear(x, y)) return false
      }
    }
    return true
  }
  // Just outside the outer wall, along each side in turn, the side facing away from the harbour first.
  const out = RING + 3
  const opposite: Record<string, string> = { n: 's', s: 'n', e: 'w', w: 'e' }
  const order = ['s', 'e', 'w', 'n'].sort((a, b) => Number(b === opposite[harbour?.gate.side ?? '']) - Number(a === opposite[harbour?.gate.side ?? '']))
  let spot: Point | null = null
  for (const side of order) {
    if (side === harbour?.gate.side) continue
    for (let t = 0; t <= S + RING * 2 - CAMP_W && !spot; t += 2) {
      const p =
        side === 's' ? { x: c.x - RING + t, y: c.y + S + out }
        : side === 'n' ? { x: c.x - RING + t, y: c.y - out - CAMP_H }
        : side === 'e' ? { x: c.x + S + out, y: c.y - RING + t }
        : { x: c.x - out - CAMP_W, y: c.y - RING + t }
      if (free(p.x, p.y)) spot = p
    }
    if (spot) break
  }
  if (!spot) return []
  const looks = campLooks(CROWN_ROOFS[index % CROWN_ROOFS.length] as KingdomColor)
  const at = (dx: number, dy: number, sprite: Sprite, n = 1, fence?: 'x' | 'y'): Structure => ({ x: spot!.x + dx, y: spot!.y + dy, size: n, look: 'house', variant: 0, city: index, sprite, ...(fence && { fence }) })
  const parts: Structure[] = []
  // A palisade round it, open at the middle of the front.
  for (let t = 0; t < CAMP_W; t++) {
    parts.push(at(t, 0, looks.fence.x, 1, 'x'))
    if (Math.abs(t - CAMP_W / 2) > 1) parts.push(at(t, CAMP_H - 1, looks.fence.x, 1, 'x'))
  }
  for (let t = 1; t < CAMP_H - 1; t++) parts.push(at(0, t, looks.fence.y, 1, 'y'), at(CAMP_W - 1, t, looks.fence.y, 1, 'y'))
  // The commander's pavilion at the back, rows of tents to either side.
  parts.push(at(6, 2, looks.pavilion, 2))
  for (const dx of [2, 3, 4, 9, 10, 11]) parts.push(at(dx, 2, looks.tents[dx % 2]))
  for (const dx of [2, 4, 9, 11]) parts.push(at(dx, 4, looks.tents[(dx + 1) % 2]))
  // The parade ground in front: squads at drill in three ranks of four.
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) parts.push(at(3 + k * 2 + (r % 2), 6 + r * 1.5 > 9 ? 9 : 6 + Math.round(r * 1.5), looks.squads[(r + k) % 3]))
  parts.push(at(1, 1, looks.rack), at(CAMP_W - 2, 1, looks.rack), at(1, CAMP_H - 2, looks.rack), at(CAMP_W - 2, CAMP_H - 2, looks.rack))
  return parts
}

// The suburbs round a crown capital (CLAUDE.md §7.7; drawn only): unwalled hamlets outside the outer wall, roadside
// rows of houses with an inn, a forge or a chapel by the roads out of the gates, and farther off farmsteads with a red
// barn, fields and a woodcutter's yard. They are thick by the wall and the roads and thin out toward the edge of the
// ground no lord may hold (cities.json → kingdomGapTiles keeps every lord's fully grown lands some 33 tiles off the
// walled core; the suburbs reach SUBURB tiles past the outer wall, to 30). A worn lane runs from each hamlet to the
// nearest road, or to the hamlet before it. The ground knows nothing of them, like the outer town.
const SUBURB = 20
const SUBURB_STEP = 6
interface Suburbs {
  structures: Structure[]
  lanes: Point[][]
}
const suburbsMade = new WeakMap<World, Suburbs[]>()
function suburbsOf(world: World, index: number): Suburbs {
  let list = suburbsMade.get(world)
  if (!list) {
    list = world.cities.map((_, i) => suburbs(world, i))
    suburbsMade.set(world, list)
  }
  return list[index]
}
function suburbs(world: World, index: number): Suburbs {
  const S = balance.cities.size
  const c = world.cities[index]
  const { size, terrain, feature } = world
  const out: Structure[] = []
  const lanes: Point[][] = []
  const at = (x: number, y: number) => y * size + x
  const inMap = (x: number, y: number) => x >= 2 && y >= 2 && x < size - 2 && y < size - 2
  const water = (x: number, y: number) => {
    const t = terrain[at(x, y)]
    return t === Terrain.Lake || t === Terrain.River
  }
  const road = (x: number, y: number) => feature[at(x, y)] === Feature.Road || feature[at(x, y)] === Feature.Bridge
  // How far a tile lies outside the walled core (the outer wall stands at RING).
  const reach = (x: number, y: number) => Math.max(x < c.x ? c.x - x : x >= c.x + S ? x - (c.x + S - 1) : 0, y < c.y ? c.y - y : y >= c.y + S ? y - (c.y + S - 1) : 0)
  const lo = RING + 3
  const hi = RING + SUBURB
  // The war camp and the harbour keep their ground, with a margin round it.
  const kept = new Set<number>()
  const keep = (x0: number, y0: number, w: number, h: number, m: number) => {
    for (let y = y0 - m; y < y0 + h + m; y++) for (let x = x0 - m; x < x0 + w + m; x++) kept.add(at(x, y))
  }
  for (const st of warCamp(world, index)) keep(st.x, st.y, st.size, st.size, 2)
  for (const st of harbourOf(world, index)?.structures ?? []) {
    const rect = st.pier ?? { x: st.x, y: st.y, w: st.size, h: st.size }
    keep(rect.x, rect.y, rect.w, rect.h, 2)
  }
  const lane = new Set<number>()
  const taken = new Set<number>()
  // Houses may stand wall to wall; everything else keeps a tile apart.
  const houses = new Set<number>()
  const corners = (x: number, y: number, n: number) => [heightAt(world, x, y), heightAt(world, x + n, y), heightAt(world, x, y + n), heightAt(world, x + n, y + n)]
  const fits = (x: number, y: number, n: number, packed = false) => {
    for (let yy = y - 2; yy < y + n + 2; yy++) {
      for (let xx = x - 2; xx < x + n + 2; xx++) {
        if (!inMap(xx, yy)) return false
        const i = at(xx, yy)
        const own = xx >= x && yy >= y && xx < x + n && yy < y + n
        const ring = xx >= x - 1 && yy >= y - 1 && xx < x + n + 1 && yy < y + n + 1
        // Off the water, the inns and the cities by two tiles, off the roads and the other buildings by one.
        if (water(xx, yy) || feature[i] === Feature.Inn || feature[i] === Feature.City) return false
        if (ring && (road(xx, yy) || (taken.has(i) && !(packed && houses.has(i))) || terrain[i] === Terrain.Mountain)) return false
        if (own && (feature[i] !== Feature.None || taken.has(i) || kept.has(i) || lane.has(i) || reach(xx, yy) < lo || reach(xx, yy) > hi)) return false
      }
    }
    // Not on a steep slope (a low base is fine).
    const h = corners(x, y, n)
    return Math.max(...h) - Math.min(...h) <= 10
  }
  const nearest = (x: number, y: number, r: number, hit: (x: number, y: number) => boolean): Point | null => {
    let best: Point | null = null
    let bestD = Infinity
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) {
        const d = Math.hypot(xx - x, yy - y)
        if (d < bestD && d <= r && inMap(xx, yy) && hit(xx, yy)) {
          best = { x: xx, y: yy }
          bestD = d
        }
      }
    }
    return best
  }
  // A straight lane, if it keeps to dry land clear of buildings.
  const along = (a: Point, b: Point, each: (x: number, y: number) => boolean) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 3)
    for (let k = 0; k <= steps; k++) if (!each(Math.floor(a.x + ((b.x - a.x) * k) / steps), Math.floor(a.y + ((b.y - a.y) * k) / steps))) return false
    return true
  }
  const roll = (x: number, y: number, n: number) => hash(x * 29 + n, y * 11 + index, world.seed + 2053)
  const centers: Point[] = []
  const x0 = c.x - hi
  const y0 = c.y - hi
  const span = S + hi * 2
  for (let gy = 0; gy < span; gy += SUBURB_STEP) {
    for (let gx = 0; gx < span; gx += SUBURB_STEP) {
      const x = x0 + gx + Math.floor(roll(gx, gy, 1) * 5) - 2
      const y = y0 + gy + Math.floor(roll(gx, gy, 2) * 5) - 2
      const d = reach(x, y)
      if (d < lo + 1 || d > hi - 1 || !inMap(x, y) || water(x, y) || feature[at(x, y)] !== Feature.None || terrain[at(x, y)] === Terrain.Mountain || kept.has(at(x, y)) || taken.has(at(x, y))) continue
      const t = (d - lo) / (hi - lo)
      const byRoad = nearest(x, y, 6, road)
      // Thick by the wall and the roads out of the gates, thin toward the edge.
      if (roll(x, y, 3) > (byRoad ? 1.1 : 0.95) - 0.65 * t) continue
      const yard = { x: x + 0.5, y: y + 0.5 }
      // The lane first, so the buildings keep off it: to the nearest road, else to the nearest hamlet before.
      const to = nearest(x, y, 12, road) ?? centers.filter((p) => Math.hypot(p.x - x, p.y - y) < 15).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
      if (to) {
        const end = { x: to.x + 0.5, y: to.y + 0.5 }
        const clear = (xx: number, yy: number) => inMap(xx, yy) && !water(xx, yy) && terrain[at(xx, yy)] !== Terrain.Mountain && (!taken.has(at(xx, yy)) || (xx === to.x && yy === to.y)) && !kept.has(at(xx, yy)) && feature[at(xx, yy)] !== Feature.City && feature[at(xx, yy)] !== Feature.Inn
        if (along(yard, end, clear)) {
          along(yard, end, (xx, yy) => (lane.add(at(xx, yy)), true))
          lanes.push([yard, end])
        }
      }
      taken.add(at(x, y))
      centers.push({ x, y })
      // What the hamlet is made of: by the wall and the roads a row of houses round an inn, a forge, a store or a
      // chapel; farther off a farmstead with a barn, fields and a woodcutter's yard by the forest.
      const r = (n: number) => roll(x, y, 10 + n)
      const plan: { look: StructureLook; size: number; level: number }[] = []
      const forest = nearest(x, y, 6, (xx, yy) => terrain[at(xx, yy)] === Terrain.Forest) !== null
      const row = t < 0.5 || (byRoad && r(0) < 0.6)
      if (row) {
        const BIG: StructureLook[] = ['tavern', 'forge', 'warehouse', 'market', 'tavern', 'temple']
        if (r(1) < 0.55) plan.push({ look: BIG[Math.floor(r(2) * BIG.length)], size: 2, level: r(3) < 0.5 ? 1 : 2 })
        if (r(4) < 0.3) plan.push({ look: 'farm', size: 2, level: 1 + Math.floor(r(5) * 3) })
        for (let k = 0, n = 6 + Math.floor(r(6) * 7 * (1 - t / 2)); k < n; k++) plan.push({ look: 'house', size: 1, level: r(20 + k) < 0.4 ? 1 : r(20 + k) < 0.85 ? 2 : 3 })
      } else {
        if (r(1) < 0.7) plan.push({ look: 'warehouse', size: 2, level: r(2) < 0.6 ? 1 : 2 })
        if (forest && r(3) < 0.5) plan.push({ look: 'lumberCamp', size: 2, level: 1 + Math.floor(r(4) * 2) })
        for (let k = 0, n = 1 + Math.floor(r(5) * 3); k < n; k++) plan.push({ look: 'farm', size: 2, level: 1 + Math.floor(r(30 + k) * 3) })
        if (r(6) < 0.06) plan.push({ look: 'watchtower', size: 1, level: 1 })
        for (let k = 0, n = 2 + Math.floor(r(7) * 3); k < n; k++) plan.push({ look: 'house', size: 1, level: r(40 + k) < 0.6 ? 1 : 2 })
      }
      // Each tries the spots round the yard, nearest first with a little shuffle.
      const spots: { x: number; y: number; k: number }[] = []
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) spots.push({ x: x + dx, y: y + dy, k: Math.hypot(dx, dy) + roll(x + dx, y + dy, 50) * 2.5 })
      spots.sort((a, b) => a.k - b.k)
      plan.forEach((p, n) => {
        const packed = p.look === 'house'
        const spot = spots.find((s) => fits(s.x, s.y, p.size, packed))
        if (!spot) return
        out.push({ x: spot.x, y: spot.y, size: p.size, look: p.look, level: p.level, variant: Math.floor(roll(spot.x, spot.y, 60 + n) * 97), city: index, suburb: true })
        for (let yy = spot.y; yy < spot.y + p.size; yy++) for (let xx = spot.x; xx < spot.x + p.size; xx++) taken.add(at(xx, yy))
        if (packed) houses.add(at(spot.x, spot.y))
      })
    }
  }
  return { structures: out, lanes }
}

// Every free city's buildings, made once per world.
const made = new WeakMap<World, Structure[]>()
export function cityStructures(world: World): Structure[] {
  let found = made.get(world)
  if (!found) {
    found = world.cities.flatMap((_, index) => [...layout(world, index), ...outskirts(world, index), ...warCamp(world, index), ...(harbourOf(world, index)?.structures ?? []), ...suburbsOf(world, index).structures])
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
      return [ring, ...streets, ...(harbour ? [harbour.lane] : []), ...suburbsOf(world, world.cities.indexOf(c)).lanes]
    })
    lanes.set(world, found)
  }
  return found
}
