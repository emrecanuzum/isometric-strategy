import { balance } from './balance'
import { dynastyStep } from './dynasty'
import { affordable, armoryOf, palaceLevel, population, recruitment, withPeople } from './economy'
import type { Cost, Good, Kingdom, Resource, Stock } from './economy'
import { buyTotal } from './market'
import type { Market } from './market'
import { RESEARCH, hasResearch, levelOf, researchEffects, researching, rivalOf, sermonReadyAt, taken, tierOpen } from './institutions'
import { TAX_LEVELS } from './society'
import type { TaxLevel } from './society'
import { countOf, garrisonOf, hasUnits, subtractUnits, unitSpec } from './units'
import type { Unit, Units } from './units'
import { buildShipsError, layDownShips, shipSpec, shipsCost } from './navy'
import type { NavyError, Ship } from './navy'

// Commands on the realm itself (CLAUDE.md §9.7): taxes, the queen, training soldiers, buying at the market and
// repairing walls. Each returns the kingdom unchanged when it is not allowed; the `…Error` functions say why.

const pay = (stock: Stock, cost: Cost): Stock => {
  const next = { ...stock }
  for (const [k, v] of Object.entries(cost)) next[k as Resource] -= v ?? 0
  return next
}
const times = (cost: Cost, n: number): Cost => Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, (v ?? 0) * n]))
const standing = (kingdom: Kingdom, kind: string, at: number) => kingdom.buildings.some((b) => b.kind === kind && b.doneAt <= at)

export const setTax = (kingdom: Kingdom, tax: TaxLevel): Kingdom => (TAX_LEVELS.includes(tax) ? { ...kingdom, tax } : kingdom)

export type RealmError = 'locked' | 'cost' | 'people' | 'have' | 'building' | 'none' | 'busy' | 'research' | 'excluded' | 'prereq'

// A palace already past the level that needs a queen (raised before the rule) brings one at once, free (CLAUDE.md §9.1).
export const queenOwed = (kingdom: Kingdom, at: number) => palaceLevel(kingdom, at) >= balance.dynasty.queenForPalaceLevel

export function queenError(kingdom: Kingdom, at: number): RealmError | null {
  const q = balance.society.queen
  if (kingdom.queen) return 'have'
  if (kingdom.queenHeldBy) return 'busy'
  if (queenOwed(kingdom, at)) return null
  if (palaceLevel(kingdom, at) < q.minPalaceLevel) return 'locked'
  const { villagers, soldiers } = population(kingdom, at)
  if (villagers + soldiers < q.minPopulation) return 'people'
  if (!affordable(kingdom.stock, q.cost as Cost)) return 'cost'
  return null
}

// The lady comes to court at once and joins the lord's house (CLAUDE.md §9.1).
export const takeQueen = (kingdom: Kingdom, at: number): Kingdom =>
  queenError(kingdom, at) ? kingdom : dynastyStep({ ...kingdom, queen: true, stock: queenOwed(kingdom, at) ? kingdom.stock : pay(kingdom.stock, balance.society.queen.cost as Cost) }, at).kingdom

export function trainError(kingdom: Kingdom, count: number, at: number, unit: Unit = 'spear'): RealmError | null {
  const barracks = kingdom.buildings.find((b) => b.kind === 'barracks' && b.doneAt <= at)
  if (!barracks) return 'building'
  if ((barracks.level ?? 1) < (unitSpec(unit).barracksLevel ?? 1)) return 'locked'
  if (unitSpec(unit).research && !hasResearch(kingdom, unitSpec(unit).research!, at)) return 'research'
  const { willing, cost, weapons } = recruitment(kingdom, at, unit)
  if (count < 1 || count > willing) return 'people'
  if (!affordable(kingdom.stock, times(cost, count))) return 'cost'
  const armory = armoryOf(kingdom)
  if (Object.entries(weapons).some(([w, n]) => armory[w as keyof typeof armory] < (n ?? 0) * count)) return 'cost'
  return null
}

// Batches train one after another; each trainee leaves the villagers at once and draws on the manpower pool.
export function trainSoldiers(kingdom: Kingdom, count: number, at: number, unit: Unit = 'spear'): Kingdom {
  count = Math.floor(count)
  if (trainError(kingdom, count, at, unit)) return kingdom
  const { cost, weapons, pool } = recruitment(kingdom, at, unit)
  const queue = kingdom.training ?? []
  const start = Math.max(at, ...queue.map((t) => t.doneAt))
  const doneAt = start + (count * unitSpec(unit).trainSeconds * 1000) / (1 + researchEffects(kingdom, at).trainSpeed)
  const armory = { ...armoryOf(kingdom) }
  for (const [w, n] of Object.entries(weapons)) armory[w as keyof typeof armory] -= (n ?? 0) * count
  return {
    ...withPeople(kingdom, at, -count),
    stock: pay(kingdom.stock, times(cost, count)),
    armory,
    manpower: pool - count,
    training: [...queue, { count, doneAt, unit }],
  }
}

export const setNightShift = (kingdom: Kingdom, on: boolean): Kingdom => ({ ...kingdom, nightShift: on })

// Sends soldiers of the garrison home: they become villagers again and count toward the manpower pool once more.
// What was paid to train them is not given back.
export function disbandUnits(kingdom: Kingdom, units: Units, at: number): Kingdom {
  const garrison = garrisonOf(kingdom)
  const n = countOf(units)
  if (n < 1 || !hasUnits(garrison, units)) return kingdom
  const left = subtractUnits(garrison, units)
  return { ...withPeople(kingdom, at, n), units: left, soldiers: countOf(left), manpower: (kingdom.manpower ?? 0) + n }
}

export const buyCost = (market: Market | null | undefined, good: Good, units: number, at: number) =>
  Math.ceil(buyTotal(market, good, units, at))

export function buyError(kingdom: Kingdom, market: Market | null | undefined, good: Good, units: number, at: number): RealmError | null {
  if (!standing(kingdom, 'market', at)) return 'building'
  if (units < 1 || units > balance.market.maxBuy) return 'none'
  if (kingdom.stock.gold < buyCost(market, good, units, at)) return 'cost'
  return null
}

export function buy(kingdom: Kingdom, market: Market | null | undefined, good: Good, units: number, at: number): Kingdom {
  units = Math.floor(units)
  if (buyError(kingdom, market, good, units, at)) return kingdom
  const stock = { ...kingdom.stock, gold: kingdom.stock.gold - buyCost(market, good, units, at) }
  stock[good] += units
  return { ...kingdom, stock }
}

// Broken walls stand again for their building cost.
export const repairCost = (kingdom: Kingdom): Cost =>
  times(balance.economy.buildings.wall.cost as Cost, kingdom.buildings.filter((b) => b.kind === 'wall' && b.broken).length)

export function repairWalls(kingdom: Kingdom): Kingdom {
  const cost = repairCost(kingdom)
  if (!Object.values(cost).some((v) => (v ?? 0) > 0) || !affordable(kingdom.stock, cost)) return kingdom
  return { ...kingdom, stock: pay(kingdom.stock, cost), buildings: kingdom.buildings.map((b) => (b.broken ? { ...b, broken: false } : b)) }
}

// A study at the university (CLAUDE.md §9.8): one at a time, each once, the harder ones at a higher university level.
export function researchError(kingdom: Kingdom, id: string, at: number): RealmError | null {
  const spec = RESEARCH[id]
  if (!spec) return 'none'
  const level = levelOf(kingdom, 'university', at)
  if (level === 0) return 'building'
  if ((kingdom.researches ?? []).some((r) => r.id === id)) return 'have'
  // The other road of this tier was taken: this one is closed for good.
  const rival = rivalOf(id)
  if (rival && taken(kingdom, rival)) return 'excluded'
  if (!tierOpen(kingdom, id, at)) return 'prereq'
  if (level < spec.level) return 'locked'
  if (researching(kingdom, at)) return 'busy'
  if (!affordable(kingdom.stock, spec.cost)) return 'cost'
  return null
}

export function startResearch(kingdom: Kingdom, id: string, at: number): Kingdom {
  if (researchError(kingdom, id, at)) return kingdom
  const spec = RESEARCH[id]
  return { ...kingdom, stock: pay(kingdom.stock, spec.cost), researches: [...(kingdom.researches ?? []), { id, doneAt: at + spec.seconds * 1000 }] }
}

// A sermon at the temple that the taxes are good: for a while the tax weighs less on the people's mood.
export function sermonError(kingdom: Kingdom, at: number): RealmError | null {
  if (levelOf(kingdom, 'temple', at) === 0) return 'building'
  if (sermonReadyAt(kingdom) > at) return 'busy'
  if (!affordable(kingdom.stock, balance.institutions.temple.sermon.cost as Cost)) return 'cost'
  return null
}

export function preach(kingdom: Kingdom, at: number): Kingdom {
  if (sermonError(kingdom, at)) return kingdom
  const s = balance.institutions.temple.sermon
  return { ...kingdom, stock: pay(kingdom.stock, s.cost as Cost), sermonUntil: at + s.seconds * 1000 * (1 + researchEffects(kingdom, at).sermon), lastSermonAt: at }
}

// ---- Ships (CLAUDE.md §8.5) ----------------------------------------------------------------------------------------

// Why `count` ships of a kind cannot be laid down: the crews come from the people willing to serve, like soldiers.
export function shipsError(kingdom: Kingdom, ship: Ship, count: number, at: number): NavyError | null {
  return buildShipsError(kingdom, ship, count, at, recruitment(kingdom, at).willing, (cost) => affordable(kingdom.stock, cost))
}

export function orderShips(kingdom: Kingdom, ship: Ship, count: number, at: number): Kingdom {
  if (shipsError(kingdom, ship, count, at)) return kingdom
  const { pool } = recruitment(kingdom, at)
  const paid = { ...withPeople(kingdom, at, -shipSpec(ship).crew * count), stock: pay(kingdom.stock, shipsCost(ship, count)), manpower: Math.max(0, pool - shipSpec(ship).crew * count) }
  return layDownShips(paid, ship, count, at)
}
