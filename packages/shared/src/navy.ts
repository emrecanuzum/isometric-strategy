import { balance } from './balance'
import type { Cost, Good, Kingdom, Stock } from './economy'
import { levelOf, fortunesAt } from './institutions'
import type { Point } from './iso'
import type { Rect } from './territory'
import { cityCenter } from './worldgen'

// The lord's ships (CLAUDE.md §8.5): built at the shipyard, kept in the harbour, sent out in fleets (at most two, like
// armies) that sail on missions: carrying goods by sea to a crown's harbour, escorting that trade against pirates,
// hunting pirates for their bounty, fishing, and — at war — blockading an enemy's dock or raiding its shore. Like
// everything else they are stored as moments: a voyage is where it set out and how long it takes, and `advance`
// (economy.ts) settles what came due. Meetings with another lord's ships are settled by the server (tick).

const N = balance.navy

export const SHIPS = ['galley', 'cog', 'corsair'] as const
export type Ship = (typeof SHIPS)[number]
export type Ships = Partial<Record<Ship, number>>

export interface ShipSpec {
  cost: Cost
  buildSeconds: number
  crew: number
  might: number
  escort: number
  cargo: number
  fish: number
  upkeep: number
  shipyardLevel: number
}

export const shipSpec = (ship: Ship) => N.ships[ship] as ShipSpec

// What a fleet is out doing. Missions near home (port, trade, fishing, hunting) may be changed at once; a fleet sent
// against another lord is away until it is back ('return').
export type FleetMission =
  | { kind: 'port' }
  // Sea trade: sails to a crown's harbour (index in world.cities) with `good` and back, again and again.
  | { kind: 'trade'; good: Good; city: number; tripMs: number; departedAt: number }
  | { kind: 'fish' }
  | { kind: 'hunt' }
  // At war: sails to the target's dock; the server settles the meeting on arrival (resolved), and a blockade holds
  // there until called back, beaten or the war ends.
  | { kind: 'blockade'; target: number; name: string; arriveAt: number; resolved?: boolean }
  | { kind: 'raid'; target: number; name: string; arriveAt: number }
  // Breaking a blockade of one's own dock: meets the blockading ships on arrival.
  | { kind: 'sortie'; arriveAt: number }
  // Coming home, with what it carries.
  | { kind: 'return'; arriveAt: number; cargo?: Partial<Stock> }

export type MissionKind = FleetMission['kind']

export interface Fleet {
  id: number
  ships: Ships
  mission: FleetMission
}

export interface Navy {
  // Ships moored at the dock, not in a fleet.
  harbour: Ships
  fleets: Fleet[]
  // Batches on the slipways.
  building: { ship: Ship; count: number; doneAt: number }[]
  nextFleetId: number
  lastRaidAt?: number
  // The season's sea trade: voyages, what they sold and earned, what pirates took and the bounties won.
  ledger?: { voyages: number; units: number; gold: number; pirates: number; lostUnits: number; sunk: number; bounty: number }
}

// Another lord's ships riding off this lord's dock (CLAUDE.md §8.5).
export interface Blockade {
  by: number
  name: string
  color?: string
  fleet: number
  since: number
}

export const EMPTY_NAVY: Navy = { harbour: {}, fleets: [], building: [], nextFleetId: 1 }
export const navyOf = (k: Pick<Kingdom, 'navy'>): Navy => k.navy ?? EMPTY_NAVY

// ---- Counting ships -----------------------------------------------------------------------------------------------

export const countShips = (s: Ships | null | undefined) => SHIPS.reduce((n, x) => n + (s?.[x] ?? 0), 0)
const sumBy = (s: Ships | null | undefined, field: 'might' | 'escort' | 'cargo' | 'crew' | 'fish' | 'upkeep') =>
  SHIPS.reduce((n, x) => n + (s?.[x] ?? 0) * shipSpec(x)[field], 0)
export const shipMight = (s: Ships | null | undefined) => sumBy(s, 'might')
export const escortOf = (s: Ships | null | undefined) => sumBy(s, 'escort')
export const cargoOf = (s: Ships | null | undefined) => sumBy(s, 'cargo')
export const crewOf = (s: Ships | null | undefined) => sumBy(s, 'crew')
export const warships = (s: Ships | null | undefined) => (s?.galley ?? 0) + (s?.corsair ?? 0)

export const addShips = (a: Ships | null | undefined, b: Ships | null | undefined): Ships =>
  Object.fromEntries(SHIPS.map((x) => [x, (a?.[x] ?? 0) + (b?.[x] ?? 0)]).filter(([, n]) => (n as number) > 0))
export const subShips = (a: Ships | null | undefined, b: Ships | null | undefined): Ships =>
  Object.fromEntries(SHIPS.map((x) => [x, Math.max(0, (a?.[x] ?? 0) - (b?.[x] ?? 0))]).filter(([, n]) => (n as number) > 0))
export const hasShips = (have: Ships | null | undefined, want: Ships) => SHIPS.every((x) => (want[x] ?? 0) <= (have?.[x] ?? 0))

// Well-formed ship counts (whole, not negative, known kinds); null otherwise. For commands from the client.
export function cleanShips(raw: unknown): Ships | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Ships = {}
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(SHIPS as readonly string[]).includes(key)) return null
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 999) return null
    if (v > 0) out[key as Ship] = v
  }
  return out
}

// Every ship of the lord: in the harbour, in fleets and on the slipways.
export const allShips = (k: Pick<Kingdom, 'navy'>) => {
  const n = navyOf(k)
  return n.fleets.reduce((s, f) => addShips(s, f.ships), n.harbour)
}

// The sailors manning the ships (and those waiting for the ships on the slipways): they are not villagers.
export const sailorsOf = (k: Pick<Kingdom, 'navy'>) =>
  crewOf(allShips(k)) + navyOf(k).building.reduce((n, b) => n + b.count * shipSpec(b.ship).crew, 0)

// ---- The shipyard -------------------------------------------------------------------------------------------------

const byLevel = (values: number[], level: number) => (level <= 0 ? 0 : values[Math.min(values.length - 1, level - 1)])
export const shipyardLevel = (k: Kingdom, at: number) => levelOf(k, 'shipyard', at)
export const yardSlots = (k: Kingdom, at: number) => byLevel(N.yardSlotsByLevel, shipyardLevel(k, at))
export const harbourCap = (k: Kingdom, at: number) => byLevel(N.harbourCapByLevel, shipyardLevel(k, at))
const shipCount = (k: Kingdom) => countShips(allShips(k)) + navyOf(k).building.reduce((n, b) => n + b.count, 0)

export type NavyError =
  | 'locked'
  | 'count'
  | 'cap'
  | 'cost'
  | 'crew'
  | 'queue'
  | 'fleet'
  | 'fleets'
  | 'ships'
  | 'away'
  | 'dock'
  | 'cargo'
  | 'warships'
  | 'blockaded'
  | 'notBlockaded'
  | 'target'
  | 'cooldown'
  | 'city'
  | 'good'
  | 'engaged'

const scaled = (cost: Cost, n: number): Cost => Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, (v ?? 0) * n]))

export const shipsCost = (ship: Ship, count: number) => scaled(shipSpec(ship).cost, count)

// Why `count` ships of a kind cannot be laid down now, if they cannot. `pool` is the manpower willing to serve (crews
// come from it, like soldiers), `affordable` checks the stores.
export function buildShipsError(k: Kingdom, ship: Ship, count: number, at: number, pool: number, affordable: (cost: Cost) => boolean): NavyError | null {
  if (!(SHIPS as readonly string[]).includes(ship)) return 'count'
  if (!Number.isInteger(count) || count < 1 || count > 20) return 'count'
  if (shipyardLevel(k, at) < shipSpec(ship).shipyardLevel) return 'locked'
  if (navyOf(k).building.filter((b) => b.doneAt > at).length >= yardSlots(k, at)) return 'queue'
  if (shipCount(k) + count > harbourCap(k, at)) return 'cap'
  if (pool < shipSpec(ship).crew * count) return 'crew'
  if (!affordable(shipsCost(ship, count))) return 'cost'
  return null
}

export function layDownShips(k: Kingdom, ship: Ship, count: number, at: number): Kingdom {
  const n = navyOf(k)
  const doneAt = at + shipSpec(ship).buildSeconds * count * 1000
  return { ...k, navy: { ...n, building: [...n.building, { ship, count, doneAt }] } }
}

// Ships whose building is over go to the harbour.
export function launchShips(k: Kingdom, at: number): { kingdom: Kingdom; launched: { ship: Ship; count: number }[] } {
  const n = navyOf(k)
  const ready = n.building.filter((b) => b.doneAt <= at)
  if (ready.length === 0) return { kingdom: k, launched: [] }
  const harbour = ready.reduce((h, b) => addShips(h, { [b.ship]: b.count }), n.harbour)
  return { kingdom: { ...k, navy: { ...n, harbour, building: n.building.filter((b) => b.doneAt > at) } }, launched: ready.map(({ ship, count }) => ({ ship, count })) }
}

// ---- Distances ----------------------------------------------------------------------------------------------------

const plotCenter = (p: Rect): Point => ({ x: p.x + p.size / 2, y: p.y + p.size / 2 })
const hasDock = (k: Kingdom, at: number) => k.buildings.some((b) => b.kind === 'dock' && b.doneAt <= at)

// A trade voyage to a crown's harbour and back: longer the farther the city lies from the dock.
export function seaTripMs(k: Kingdom, city: Point) {
  if (!k.dockPlot) return null
  const m = cityCenter(city)
  const from = plotCenter(k.dockPlot)
  const tiles = Math.hypot(from.x - m.x, from.y - m.y)
  return Math.round((N.trade.baseSeconds + tiles * N.trade.secondsPerTile) * 1000)
}

// How long ships take from one dock to another (one way).
export function voyageMs(from: Rect | null | undefined, to: Rect | null | undefined) {
  if (!from || !to) return N.minVoyageSeconds * 1000
  const a = plotCenter(from)
  const b = plotCenter(to)
  return Math.round(Math.max(N.minVoyageSeconds, Math.hypot(a.x - b.x, a.y - b.y) * N.speedSecondsPerTile) * 1000)
}

// ---- Fleets -------------------------------------------------------------------------------------------------------

export const HOME_MISSIONS: MissionKind[] = ['port', 'trade', 'fish', 'hunt']
export const atHome = (f: Fleet) => HOME_MISSIONS.includes(f.mission.kind)
export const fleetOf = (k: Pick<Kingdom, 'navy'>, id: number) => navyOf(k).fleets.find((f) => f.id === id) ?? null
const putFleets = (k: Kingdom, n: Navy, fleets: Fleet[], harbour = n.harbour): Kingdom => ({ ...k, navy: { ...n, fleets, harbour } })

// Ships from the harbour form a new fleet, waiting at the dock.
export function formFleetError(k: Kingdom, ships: Ships): NavyError | null {
  const n = navyOf(k)
  if (countShips(ships) < 1) return 'ships'
  if (!hasShips(n.harbour, ships)) return 'ships'
  if (n.fleets.length >= N.maxFleets) return 'fleets'
  return null
}
export function formFleet(k: Kingdom, ships: Ships): Kingdom {
  if (formFleetError(k, ships)) return k
  const n = navyOf(k)
  const fleet: Fleet = { id: n.nextFleetId, ships, mission: { kind: 'port' } }
  return { ...k, navy: { ...n, harbour: subShips(n.harbour, ships), fleets: [...n.fleets, fleet], nextFleetId: n.nextFleetId + 1 } }
}

// A fleet at home splits in two (each keeps the mission's harbour; the new one waits at port).
export function splitFleetError(k: Kingdom, id: number, ships: Ships): NavyError | null {
  const n = navyOf(k)
  const f = fleetOf(k, id)
  if (!f) return 'fleet'
  if (!atHome(f)) return 'away'
  if (n.fleets.length >= N.maxFleets) return 'fleets'
  if (countShips(ships) < 1 || !hasShips(f.ships, ships) || countShips(subShips(f.ships, ships)) < 1) return 'ships'
  return null
}
export function splitFleet(k: Kingdom, id: number, ships: Ships): Kingdom {
  if (splitFleetError(k, id, ships)) return k
  const n = navyOf(k)
  const fleets = n.fleets.map((f) => (f.id === id ? { ...f, ships: subShips(f.ships, ships) } : f))
  return { ...k, navy: { ...n, fleets: [...fleets, { id: n.nextFleetId, ships, mission: { kind: 'port' } }], nextFleetId: n.nextFleetId + 1 } }
}

// Two fleets at home become one (the first keeps its mission).
export function mergeFleetsError(k: Kingdom, a: number, b: number): NavyError | null {
  const x = fleetOf(k, a)
  const y = fleetOf(k, b)
  if (!x || !y || a === b) return 'fleet'
  if (!atHome(x) || !atHome(y)) return 'away'
  return null
}
export function mergeFleets(k: Kingdom, a: number, b: number): Kingdom {
  if (mergeFleetsError(k, a, b)) return k
  const n = navyOf(k)
  const y = fleetOf(k, b)!
  const fleets = n.fleets.filter((f) => f.id !== b).map((f) => (f.id === a ? { ...f, ships: addShips(f.ships, y.ships) } : f))
  return putFleets(k, n, fleets)
}

// A fleet at home is stood down: its ships moor in the harbour.
export function dockFleetError(k: Kingdom, id: number): NavyError | null {
  const f = fleetOf(k, id)
  if (!f) return 'fleet'
  if (!atHome(f)) return 'away'
  return null
}
export function dockFleet(k: Kingdom, id: number): Kingdom {
  if (dockFleetError(k, id)) return k
  const n = navyOf(k)
  const f = fleetOf(k, id)!
  return putFleets(k, n, n.fleets.filter((x) => x.id !== id), addShips(n.harbour, f.ships))
}

// What the player asks a fleet to do.
export type MissionOrder =
  | { kind: 'port' | 'fish' | 'hunt' | 'sortie' }
  | { kind: 'trade'; good: Good; city: number }
  | { kind: 'blockade' | 'raid'; target: number }

export interface MissionContext {
  cities: Point[]
  // The target lord (blockade, raid): its dock plot and whether it has a dock; whether we are at war with it.
  target?: { id: number; name: string; dockPlot: Rect | null; hasDock: boolean; blockadedBy?: number | null }
  atWar?: boolean
}

const GOOD_KINDS = ['food', 'materials', 'arms']

export function missionError(k: Kingdom, id: number, order: MissionOrder, at: number, ctx: MissionContext): NavyError | null {
  const f = fleetOf(k, id)
  if (!f) return 'fleet'
  if (!atHome(f)) return 'away'
  const blockaded = !!k.blockade
  switch (order.kind) {
    case 'port':
      return null
    case 'trade': {
      if (!hasDock(k, at)) return 'dock'
      if (blockaded) return 'blockaded'
      if (!GOOD_KINDS.includes(order.good)) return 'good'
      if (!Number.isInteger(order.city) || !ctx.cities[order.city]) return 'city'
      if (cargoOf(f.ships) < 1) return 'cargo'
      return null
    }
    case 'fish':
      if (!hasDock(k, at)) return 'dock'
      if (blockaded) return 'blockaded'
      return null
    case 'hunt':
      if (blockaded) return 'blockaded'
      return warships(f.ships) > 0 ? null : 'warships'
    case 'sortie':
      if (!blockaded) return 'notBlockaded'
      return warships(f.ships) > 0 ? null : 'warships'
    case 'blockade':
    case 'raid': {
      if (blockaded) return 'blockaded'
      if (!hasDock(k, at)) return 'dock'
      if (warships(f.ships) < 1) return 'warships'
      const t = ctx.target
      if (!t || t.id !== order.target || !t.hasDock) return 'target'
      if (!ctx.atWar) return 'target'
      if (order.kind === 'blockade' && t.blockadedBy != null) return 'target'
      if (order.kind === 'raid' && at < (navyOf(k).lastRaidAt ?? -Infinity) + N.raid.cooldownSeconds * 1000) return 'cooldown'
      return null
    }
  }
  return 'fleet'
}

export function setMission(k: Kingdom, id: number, order: MissionOrder, at: number, ctx: MissionContext): Kingdom {
  if (missionError(k, id, order, at, ctx)) return k
  const n = navyOf(k)
  let mission: FleetMission
  let lastRaidAt = n.lastRaidAt
  switch (order.kind) {
    case 'trade': {
      const tripMs = seaTripMs(k, ctx.cities[order.city])!
      mission = { kind: 'trade', good: order.good, city: order.city, tripMs, departedAt: at }
      break
    }
    case 'blockade':
    case 'raid':
      mission = { kind: order.kind, target: order.target, name: ctx.target!.name, arriveAt: at + voyageMs(k.dockPlot, ctx.target!.dockPlot) }
      if (order.kind === 'raid') lastRaidAt = at
      break
    case 'sortie':
      mission = { kind: 'sortie', arriveAt: at + N.sortieSeconds * 1000 }
      break
    default:
      mission = { kind: order.kind }
  }
  return { ...k, navy: { ...n, lastRaidAt, fleets: n.fleets.map((f) => (f.id === id ? { ...f, mission } : f)) } }
}

// A fleet away is called home: it turns back from where it is (as long a way back as it sailed), keeping what it
// carries. A blockade lifted this way leaves the target (the server clears it).
export function recallError(k: Kingdom, id: number, at = -Infinity): NavyError | null {
  const f = fleetOf(k, id)
  if (!f) return 'fleet'
  const m = f.mission
  if (m.kind !== 'blockade' && m.kind !== 'raid' && m.kind !== 'sortie') return 'away'
  // Arrived and about to fight: the battle is fought first (its outcome is not to be dodged).
  if (m.arriveAt <= at && !(m.kind === 'blockade' && m.resolved)) return 'engaged'
  return null
}
// (The server turns fleets home after their battle too, so this does not wait for the battle: the player's command
// is checked with recallError(k, id, now).)
export function recallFleet(k: Kingdom, id: number, at: number, outMs?: number): Kingdom {
  if (recallError(k, id)) return k
  const n = navyOf(k)
  const f = fleetOf(k, id)!
  const m = f.mission as Extract<FleetMission, { arriveAt: number }>
  // Still under way: as long back as it has sailed; there already: the whole way back.
  const full = outMs ?? N.minVoyageSeconds * 1000
  const sailed = m.arriveAt > at ? Math.max(0, full - (m.arriveAt - at)) : full
  const back = Math.max(N.sortieSeconds * 1000, sailed)
  return putFleets(k, n, n.fleets.map((x) => (x.id === id ? { ...x, mission: { kind: 'return', arriveAt: at + back } } : x)))
}

// ---- Pirates ------------------------------------------------------------------------------------------------------

function mix(...values: number[]) {
  let h = 0x9e3779b9
  for (const v of values) {
    h ^= Math.floor(v) | 0
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}

// A pirate season rides the lobby's seas now and then (seeded by the lobby): the pirates strike far more often while it
// lasts. In two-hour windows, a quarter of them carry one of 30–50 minutes.
export const PIRATE_WINDOW_MS = 2 * 3_600_000
export function pirateSeason(lobbyKey: number | undefined, at: number): { start: number; end: number } | null {
  if (lobbyKey === undefined) return null
  const index = Math.floor(at / PIRATE_WINDOW_MS)
  if (mix(lobbyKey, index, 11) >= 0.25) return null
  const length = (30 + mix(lobbyKey, index, 12) * 20) * 60_000
  const start = index * PIRATE_WINDOW_MS + Math.floor(mix(lobbyKey, index, 13) * (PIRATE_WINDOW_MS - length))
  return at >= start && at < start + length ? { start, end: start + length } : null
}
export const PIRATE_SEASON_FACTOR = 2.5

// The odds that pirates fall upon a trade voyage: lower with warships alongside and with another fleet out hunting
// them, higher in storms and in a pirate season, lower in fog (they cannot find the ships either).
export function pirateChance(k: Kingdom, fleet: Fleet, at: number) {
  const p = N.pirates
  let chance = p.chance * Math.max(p.minShare, 1 - p.escortCut * escortOf(fleet.ships))
  if (navyOf(k).fleets.some((f) => f.id !== fleet.id && f.mission.kind === 'hunt' && warships(f.ships) > 0)) chance *= p.huntCut
  for (const f of fortunesAt(k, at)) {
    if (f.kind === 'storm') chance *= N.seaWeather.storm
    if (f.kind === 'fog') chance *= N.seaWeather.fog
  }
  if (pirateSeason(k.lobbyKey, at)) chance *= PIRATE_SEASON_FACTOR
  return Math.min(0.9, chance)
}

// The lightest ship of a fleet, which the pirates catch (and sink) first.
const lightest = (s: Ships): Ship | null => (['cog', 'corsair', 'galley'] as Ship[]).find((x) => (s[x] ?? 0) > 0) ?? null

export interface PirateStrike {
  won: boolean
  might: number
  sunk?: Ship
  bounty?: number
}

// What befalls a voyage that set out at `departedAt`: nothing, or pirates — beaten off by the escort (a bounty) or
// not (the cargo lost, perhaps a ship). Seeded by the lobby, the fleet and the voyage, so every screen agrees.
export function voyagePirates(k: Kingdom, fleet: Fleet, departedAt: number, at: number): PirateStrike | null {
  const p = N.pirates
  const seed = [k.lobbyKey ?? 0, k.site.x, k.site.y, fleet.id, Math.floor(departedAt / 1000)]
  if (mix(...seed, 1) >= pirateChance(k, fleet, at)) return null
  const might = p.might[0] + mix(...seed, 2) * (p.might[1] - p.might[0])
  const guard = shipMight({ galley: fleet.ships.galley, corsair: fleet.ships.corsair })
  const won = guard > 0 && guard * (0.7 + 0.6 * mix(...seed, 3)) > might
  if (won) return { won, might, bounty: p.bounty }
  const sinks = mix(...seed, 4) < (guard > 0 ? p.sinkChance.escorted : p.sinkChance.alone)
  const sunk = sinks ? lightest(fleet.ships) ?? undefined : undefined
  return { won, might, ...(sunk && { sunk }) }
}

// Pirate hunting in one production round (`round` is its number): now and then a pirate crew is caught for its
// bounty, and now and then a ship is lost doing it.
export function huntRound(k: Kingdom, fleet: Fleet, round: number): { bounty: number; sunk?: Ship } | null {
  const h = N.hunt
  const seed = [k.lobbyKey ?? 0, k.site.x, k.site.y, fleet.id, round]
  const might = shipMight({ galley: fleet.ships.galley, corsair: fleet.ships.corsair })
  // There are only so many pirates about: more ships find them more often, up to a ceiling; a bigger fleet loses
  // fewer ships doing it.
  if (might <= 0 || mix(...seed, 21) >= h.maxPerRound * (1 - Math.exp(-might / h.mightScale))) return null
  const sunk = mix(...seed, 22) < Math.min(h.maxLoss, h.lossPerMight / might) ? (fleet.ships.corsair ? 'corsair' : 'galley') : undefined
  return { bounty: h.bounty, ...(sunk && { sunk }) }
}

// ---- Naval battles ------------------------------------------------------------------------------------------------

// A side's strength: the might of its ships, more for kinds that beat the other side's (galleys hunt corsairs,
// corsairs take cogs).
function strength(mine: Ships, theirs: Ships) {
  const total = countShips(theirs) || 1
  let bonus = 0
  for (const x of SHIPS) {
    const n = mine[x] ?? 0
    if (!n) continue
    const beats = (N.counters as Record<string, string[]>)[x] ?? []
    const share = beats.reduce((s, y) => s + (theirs[y as Ship] ?? 0), 0) / total
    bonus += n * shipSpec(x).might * share * N.counterBonus
  }
  return shipMight(mine) + bonus
}

// Takes a share of a fleet's ships (rounded, at least one ship when the share is not nothing), lightest first.
export function shareOf(ships: Ships, share: number): Ships {
  const total = countShips(ships)
  let take = Math.min(total, Math.round(total * share))
  if (take === 0 && share > 0.08 && total > 0) take = 1
  const out: Ships = {}
  for (const x of ['cog', 'corsair', 'galley'] as Ship[]) {
    const n = Math.min(ships[x] ?? 0, take)
    if (n > 0) out[x] = n
    take -= n
  }
  return out
}

export interface NavalBattle {
  winner: 'attackers' | 'defenders'
  attackerLoss: Ships
  defenderLoss: Ships
  rolls: [number, number]
}

// Two fleets meet: each rolls a die over its strength (defenders in their own waters a little stronger); the loser
// loses a large share of its ships, the winner a small one. Seeded, so the server's result can be shown anywhere.
export function navalBattle(attackers: Ships, defenders: Ships, seed: number, defendersAtHome = true): NavalBattle {
  const b = N.battle
  const a = strength(attackers, defenders)
  const d = strength(defenders, attackers) * (defendersAtHome ? 1 + b.harbourBonus : 1)
  if (countShips(defenders) === 0 || d <= 0) return { winner: 'attackers', attackerLoss: {}, defenderLoss: {}, rolls: [0, 0] }
  if (countShips(attackers) === 0 || a <= 0) return { winner: 'defenders', attackerLoss: { ...attackers }, defenderLoss: {}, rolls: [0, 0] }
  const ra = 1 + Math.floor(mix(seed, 31) * b.dice)
  const rd = 1 + Math.floor(mix(seed, 32) * b.dice)
  const sa = a * (0.75 + ra / (b.dice * 2))
  const sd = d * (0.75 + rd / (b.dice * 2))
  const winner = sa > sd ? 'attackers' : 'defenders'
  const lerp = (r: number[], t: number) => r[0] + (r[1] - r[0]) * t
  // The closer the fight, the more the winner loses too.
  const close = Math.min(sa, sd) / Math.max(sa, sd)
  const loser = lerp(b.lossShare, 1 - close * 0.5 + mix(seed, 33) * 0.2 - 0.1)
  const won = lerp(b.winnerLossShare, close)
  const attackerLoss = shareOf(attackers, winner === 'attackers' ? won : loser)
  const defenderLoss = shareOf(defenders, winner === 'defenders' ? won : loser)
  return { winner, attackerLoss, defenderLoss, rolls: [ra, rd] }
}

// The ships at home that meet an enemy at the dock: the harbour and the fleets near it (not a trade fleet, which is
// out at sea most of the time).
const DEFENDING: MissionKind[] = ['port', 'fish', 'hunt', 'sortie']
export const defendersOf = (k: Pick<Kingdom, 'navy'>): Ships =>
  navyOf(k).fleets.filter((f) => DEFENDING.includes(f.mission.kind)).reduce((s, f) => addShips(s, f.ships), navyOf(k).harbour)

// Losses at home: from the harbour first, then from the fleets near home; empty fleets are gone.
export function takeHomeLosses<K extends Pick<Kingdom, 'navy'>>(k: K, loss: Ships): K {
  const n = navyOf(k)
  let left = { ...loss }
  const harbourTake: Ships = {}
  for (const x of SHIPS) {
    const t = Math.min(n.harbour[x] ?? 0, left[x] ?? 0)
    if (t > 0) harbourTake[x] = t
    left = subShips(left, { [x]: t })
  }
  const fleets = n.fleets
    .map((f) => {
      if (!DEFENDING.includes(f.mission.kind)) return f
      const t: Ships = {}
      for (const x of SHIPS) {
        const take = Math.min(f.ships[x] ?? 0, left[x] ?? 0)
        if (take > 0) t[x] = take
      }
      left = subShips(left, t)
      return { ...f, ships: subShips(f.ships, t) }
    })
    .filter((f) => countShips(f.ships) > 0)
  return { ...k, navy: { ...n, harbour: subShips(n.harbour, harbourTake), fleets } }
}

// A fleet's losses: fewer ships, gone if none are left.
export function takeFleetLosses<K extends Pick<Kingdom, 'navy'>>(k: K, id: number, loss: Ships): K {
  const n = navyOf(k)
  const fleets = n.fleets.map((f) => (f.id === id ? { ...f, ships: subShips(f.ships, loss) } : f)).filter((f) => countShips(f.ships) > 0)
  return { ...k, navy: { ...n, fleets } }
}

// What a raid carries off: a share of each good, as much as the fleet can hold.
export function raidLoot(stock: Stock, ships: Ships): Partial<Stock> {
  let room = cargoOf(ships)
  const out: Partial<Stock> = {}
  for (const g of ['arms', 'materials', 'food'] as Good[]) {
    const n = Math.min(Math.floor(stock[g] * N.raid.stealShare), Math.floor(room))
    if (n > 0) out[g] = n
    room -= n
  }
  return out
}

// ---- The round's upkeep and catches -------------------------------------------------------------------------------

// The navy's part of a production round: the crews' pay and bread, the fishing fleets' catch.
export function navyUpkeep(k: Kingdom) {
  const all = allShips(k)
  return { gold: sumBy(all, 'upkeep'), food: crewOf(all) * N.upkeepFoodPerCrew }
}

export function fishCatch(k: Kingdom) {
  if (k.blockade) return 0
  return navyOf(k).fleets.filter((f) => f.mission.kind === 'fish').reduce((n, f) => n + sumBy(f.ships, 'fish'), 0) * k.yields.food
}

// The next sea-trade voyage to end (and the fleet), or null.
export function nextVoyage(k: Pick<Kingdom, 'navy'>): { fleet: Fleet; end: number } | null {
  let best: { fleet: Fleet; end: number } | null = null
  for (const f of navyOf(k).fleets) {
    const m = f.mission
    const end = m.kind === 'trade' ? m.departedAt + m.tripMs : m.kind === 'return' ? m.arriveAt : Infinity
    if (end < (best?.end ?? Infinity)) best = { fleet: f, end }
  }
  return best
}

// How the lobby sees a lord's navy (lobby_kingdoms): its fleets' missions and rough sizes.
export interface NavyLook {
  harbour: number
  fleets: { id: number; ships: number; galleys: number; mission: MissionKind; target?: number; arriveAt?: number; departedAt?: number; tripMs?: number }[]
}
