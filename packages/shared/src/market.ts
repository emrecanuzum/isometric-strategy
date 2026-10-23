import { balance } from './balance'

// The lobby's market (CLAUDE.md §9.7): one price per good for every kingdom. Selling lowers it, buying raises it (the
// players' and the crown kingdoms', see crownDemand), and with time it drifts back to the base price, so the server
// keeps only the last price and when it was set. Prices
// climb harder than they fall: a unit bought moves the price less than a unit sold, and a price below the base
// recovers more slowly than one above it comes down.

export type MarketGood = 'food' | 'materials' | 'arms'
// foodDemand: how much dearer food is as the world's people grow (set by the server; missing: 1, see foodDemandFor).
// priceRev: the revision of the base prices the stored prices follow (migrations move them with it).
// inns: each inn's own price per good (keyed by innKey) (a factor on the lobby's, see inns.ts) and when it was set.
export type Market = Record<MarketGood, { price: number; at: number }> & { foodDemand?: number; priceRev?: number; inns?: Record<string, Partial<Record<MarketGood, { f: number; at: number }>>> }

const GOODS: MarketGood[] = ['food', 'materials', 'arms']
export const basePrice = (good: MarketGood, market?: Market | null) =>
  balance.economy.trade.price[good] * (good === 'food' ? (market?.foodDemand ?? 1) : 1)

// The more people live in the lobby's lordships, the more bread they want: food's usual price rises a little, from
// nothing at fromPeople to maxRise at toPeople (in steps, so the server need not write it for every soul born).
export function foodDemandFor(people: number) {
  const d = balance.market.foodDemand
  const t = Math.max(0, Math.min(1, (people - d.fromPeople) / (d.toPeople - d.fromPeople)))
  return Number((1 + Math.round((t * d.maxRise) / d.step) * d.step).toFixed(4))
}

// The revision of the base prices in config (bumped with a migration that moves the stored prices).
export const PRICE_REV = 3
export const freshMarket = (now: number): Market =>
  ({ ...Object.fromEntries(GOODS.map((g) => [g, { price: basePrice(g), at: now }])), priceRev: PRICE_REV }) as unknown as Market

// The crown kingdoms buy (CLAUDE.md §7.8): in each window of the clock each crown wants one good, drawn from the
// window and the crown, and takes so many units of it off the lobby's market every step. Like everything else it
// follows from the clock alone, so the server and every player work out the same prices and nothing is stored.
export interface CrownDemand {
  crown: number
  good: MarketGood
  // Units bought each minute, and when this window ends.
  perMinute: number
  until: number
}

const mix = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

export function crownDemand(at: number): CrownDemand[] {
  const { count, windowMinutes, unitsPerMinute } = balance.market.crowns
  const length = windowMinutes * 60_000
  const window = Math.floor(at / length)
  return Array.from({ length: count }, (_, crown) => ({
    crown,
    good: GOODS[Math.floor(mix(window, crown + 1) * GOODS.length)],
    perMinute: unitsPerMinute,
    until: (window + 1) * length,
  }))
}

// How much of their full demand the crowns buy at `price`: all of it when the good is cheap, less as it nears its base
// price, none above upToFactor of it. So they lift a market that has sunk to its floor without driving it to its top.
export const crownAppetite = (good: MarketGood, price: number, market?: Market | null) => {
  const top = basePrice(good, market) * balance.market.crowns.upToFactor
  return Math.max(0, (top - price) / top)
}

// How many units of `good` the crowns buy in the step ending at `at`, at `price`.
const crownUnits = (good: MarketGood, at: number, price: number, market?: Market | null) => {
  const { stepSeconds } = balance.market.crowns
  const wanted = crownDemand(at - 1).filter((d) => d.good === good).reduce((n, d) => n + (d.perMinute * stepSeconds) / 60, 0)
  return wanted * crownAppetite(good, price, market)
}

// Drifted back toward the base over `ms`: from below slowly, from above faster.
function drift(price: number, base: number, ms: number) {
  const half = (price < base ? balance.market.recoverUpSeconds : balance.market.recoverDownSeconds) * 1000
  return base + (price - base) * Math.pow(0.5, Math.max(0, ms) / half)
}

const clampPrice = (price: number, base: number) => Math.min(base * balance.market.maxFactor, Math.max(base * balance.market.minFactor, price))

// The last price worked out for each market and good, so asking again a little later goes on from there.
const known = new WeakMap<object, Partial<Record<MarketGood, { at: number; price: number }>>>()
const NO_MARKET = {}

// The price at `at`: drifted back toward the base since it was last set, and pushed up by the crowns' purchases at
// every step since (stepSeconds apart on the clock; over a long gap only the last catchUpHours are walked).
export function priceAt(market: Market | null | undefined, good: MarketGood, at: number) {
  const base = basePrice(good, market)
  const { stepSeconds, catchUpHours } = balance.market.crowns
  const step = stepSeconds * 1000
  const entry = market?.[good]
  const cache = known.get(market ?? NO_MARKET) ?? {}
  known.set(market ?? NO_MARKET, cache)
  // Where to walk from: the last answer if it is not past `at`, else the price as last set (a good never traded starts
  // at its base, catchUpHours back).
  let from = entry ? { at: entry.at, price: entry.price } : { at: at - catchUpHours * 3_600_000, price: base }
  const last = cache[good]
  if (last && last.at <= at && last.at >= from.at) from = last
  if (at - from.at > catchUpHours * 3_600_000) {
    const start = at - catchUpHours * 3_600_000
    from = { at: start, price: drift(from.price, base, start - from.at) }
  }
  let t = from.at
  let price = from.price
  for (let next = Math.floor(t / step) * step + step; next <= at; next += step) {
    price = drift(price, base, next - t)
    const units = crownUnits(good, next, price, market)
    if (units > 0) price = clampPrice(price / Math.pow(1 - balance.market.buyImpactPerUnit, units), base)
    t = next
  }
  cache[good] = { at: t, price }
  return clampPrice(drift(price, base, at - t), base)
}

// Whether a price sits on its floor: selling cannot take it lower.
export const atFloor = (price: number, good: MarketGood, market?: Market | null) => price <= basePrice(good, market) * balance.market.minFactor * 1.005

// After `units` were sold (negative: bought) at `at`.
export function afterTrade(market: Market | null | undefined, good: MarketGood, units: number, at: number): Market {
  const { sellImpactPerUnit, buyImpactPerUnit, minFactor, maxFactor } = balance.market
  const base = basePrice(good, market)
  const price = units >= 0 ? priceAt(market, good, at) * Math.pow(1 - sellImpactPerUnit, units) : priceAt(market, good, at) / Math.pow(1 - buyImpactPerUnit, -units)
  const next = { ...(market ?? freshMarket(at)) }
  next[good] = { price: Math.min(base * maxFactor, Math.max(base * minFactor, price)), at }
  return next
}

// What a market building asks for one unit.
export const buyPrice = (market: Market | null | undefined, good: MarketGood, at: number) =>
  priceAt(market, good, at) * balance.market.buyMarkup

// What a market building asks for `units` bought at once: every unit raises the price of the next, as afterTrade does,
// so one large purchase costs the same as the same units bought a few at a time.
export function buyTotal(market: Market | null | undefined, good: MarketGood, units: number, at: number) {
  const { buyImpactPerUnit, maxFactor, buyMarkup } = balance.market
  const top = basePrice(good, market) * maxFactor
  let price = priceAt(market, good, at)
  let total = 0
  for (let i = 0; i < units; i++) {
    total += Math.min(top, price) * buyMarkup
    price /= 1 - buyImpactPerUnit
  }
  return total
}

// The market with food's demand set anew: the price as it stands now is kept, so the change moves only where it drifts
// from here on, not what it was before.
export function withFoodDemand(market: Market | null | undefined, demand: number, at: number): Market {
  const base = market ?? freshMarket(at)
  return { ...base, food: { price: priceAt(market, 'food', at), at }, foodDemand: demand }
}
