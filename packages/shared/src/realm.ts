import { balance } from './balance'
import { affordable, armoryOf, palaceLevel, population, recruitment } from './economy'
import type { Cost, Good, Kingdom, Resource, Stock } from './economy'
import { buyPrice } from './market'
import type { Market } from './market'
import { TAX_LEVELS } from './society'
import type { TaxLevel } from './society'
import { unitSpec } from './units'
import type { Unit } from './units'

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

export type RealmError = 'locked' | 'cost' | 'people' | 'have' | 'building' | 'none'

export function queenError(kingdom: Kingdom, at: number): RealmError | null {
  const q = balance.society.queen
  if (kingdom.queen) return 'have'
  if (palaceLevel(kingdom, at) < q.minPalaceLevel) return 'locked'
  const { villagers, soldiers } = population(kingdom, at)
  if (villagers + soldiers < q.minPopulation) return 'people'
  if (!affordable(kingdom.stock, q.cost as Cost)) return 'cost'
  return null
}

export const takeQueen = (kingdom: Kingdom, at: number): Kingdom =>
  queenError(kingdom, at) ? kingdom : { ...kingdom, queen: true, stock: pay(kingdom.stock, balance.society.queen.cost as Cost) }

export function trainError(kingdom: Kingdom, count: number, at: number, unit: Unit = 'spear'): RealmError | null {
  const barracks = kingdom.buildings.find((b) => b.kind === 'barracks' && b.doneAt <= at)
  if (!barracks) return 'building'
  if ((barracks.level ?? 1) < (unitSpec(unit).barracksLevel ?? 1)) return 'locked'
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
  const doneAt = start + count * unitSpec(unit).trainSeconds * 1000
  const armory = { ...armoryOf(kingdom) }
  for (const [w, n] of Object.entries(weapons)) armory[w as keyof typeof armory] -= (n ?? 0) * count
  return {
    ...kingdom,
    stock: pay(kingdom.stock, times(cost, count)),
    armory,
    manpower: pool - count,
    training: [...queue, { count, doneAt, unit }],
  }
}

export const setNightShift = (kingdom: Kingdom, on: boolean): Kingdom => ({ ...kingdom, nightShift: on })

export const buyCost = (market: Market | null | undefined, good: Good, units: number, at: number) =>
  Math.ceil(buyPrice(market, good, at) * units)

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
