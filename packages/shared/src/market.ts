import { balance } from './balance'

// The lobby's market (CLAUDE.md §9.7): one price per good for every kingdom. Selling lowers it, buying raises it, and
// with time it drifts back to the base price, so the server keeps only the last price and when it was set.

export type MarketGood = 'food' | 'materials' | 'arms'
export type Market = Record<MarketGood, { price: number; at: number }>

const GOODS: MarketGood[] = ['food', 'materials', 'arms']
export const basePrice = (good: MarketGood) => balance.economy.trade.price[good]

export const freshMarket = (now: number): Market =>
  Object.fromEntries(GOODS.map((g) => [g, { price: basePrice(g), at: now }])) as Market

// The price at `at`, drifted back toward the base since it was last set.
export function priceAt(market: Market | null | undefined, good: MarketGood, at: number) {
  const base = basePrice(good)
  const entry = market?.[good]
  if (!entry) return base
  const half = balance.market.halfLifeSeconds * 1000
  const k = Math.pow(0.5, Math.max(0, at - entry.at) / half)
  return base + (entry.price - base) * k
}

// After `units` were sold (negative: bought) at `at`.
export function afterTrade(market: Market | null | undefined, good: MarketGood, units: number, at: number): Market {
  const { impactPerUnit, minFactor, maxFactor } = balance.market
  const base = basePrice(good)
  const price = priceAt(market, good, at) * Math.pow(1 - impactPerUnit, units)
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
  const { impactPerUnit, maxFactor, buyMarkup } = balance.market
  const top = basePrice(good) * maxFactor
  let price = priceAt(market, good, at)
  let total = 0
  for (let i = 0; i < units; i++) {
    total += Math.min(top, price) * buyMarkup
    price /= 1 - impactPerUnit
  }
  return total
}
