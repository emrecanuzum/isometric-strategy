import { balance } from './balance'
import type { Point } from './iso'
import type { Good } from './economy'
import type { Market } from './market'
import { hash } from './worldgen'

// The inns of the trade roads as markets (CLAUDE.md §7.6): every inn pays its own price for each good, drawn from the
// lobby seed (some pay well, some next to nothing), and trades only with the lords near it. How near a lord is, is its
// pull on the inn: from its palace and, less, from every town it holds, so a lord far away can win a good inn by taking
// a town by it. The inn's own price sinks as the lords sell to it and recovers with time; the server keeps it in the
// lobby's market (Market.inns).

const GOODS: Good[] = ['food', 'materials', 'arms']
export const innSpec = () => balance.economy.trade.inns

// What an inn pays for each good against the lobby's price: a bias for the inn and a spread for the good.
// An inn is known by where it stands (the server's list of inns is in another order than the world's).
export const innKey = (inn: Point) => `${inn.x},${inn.y}`

export function innStats(seed: number, inn: Point): Record<Good, number> {
  const s = innSpec()
  const bias = (hash(inn.x, inn.y, seed + 7101) - 0.5) * 2 * s.bias
  const out = {} as Record<Good, number>
  GOODS.forEach((good, g) => {
    const raw = 1 + bias + (hash(inn.x * 4 + g, inn.y, seed + 7103) - 0.5) * 2 * s.spread
    out[good] = Math.min(s.max, Math.max(s.min, Math.round(raw / s.step) * s.step))
  })
  return out
}

// The middle of an inn's 2×2 tiles.
export const innCenter = (inn: Point): Point => ({ x: inn.x + 1, y: inn.y + 1 })

export interface InnLord {
  id: number
  // Its palace (or its site before the palace stands).
  palace: Point
}
export interface InnTown {
  owner: number | null
  // The middle of the town.
  at: Point
}

export interface InnPull {
  id: number
  value: number
  // Its slice of the pie (0..1).
  share: number
  towns: number
  // Tiles from its palace.
  distance: number
}

// Every lord's pull on an inn, nearest first; lords with no pull are left out.
export function innPulls(inn: Point, lords: InnLord[], towns: InnTown[]): InnPull[] {
  const { reachTiles, town } = innSpec()
  const c = innCenter(inn)
  const pull = (p: Point) => Math.max(0, 1 - Math.hypot(p.x - c.x, p.y - c.y) / reachTiles)
  const rows = lords.map((l) => {
    // Only the towns near enough to pull count (and are counted).
    const held = towns.filter((t) => t.owner === l.id && pull(t.at) > 0)
    const value = pull(l.palace) + held.reduce((sum, t) => sum + town * pull(t.at), 0)
    return { id: l.id, value, towns: held.length, distance: Math.round(Math.hypot(l.palace.x - c.x, l.palace.y - c.y)) }
  })
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return rows
    .filter((r) => r.value > 0)
    .map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

// A lord's slice of an inn's pie (0 when it has none).
export const innShareOf = (pulls: InnPull[], lord: number) => pulls.find((p) => p.id === lord)?.share ?? 0

// Whether a slice is big enough to trade there.
export const canTradeAt = (share: number) => share >= innSpec().minShare

// What the slice adds to the price: from shareLow at the thinnest slice to shareHigh for the whole pie.
export const innShareFactor = (share: number) => {
  const s = innSpec()
  return s.shareLow + (s.shareHigh - s.shareLow) * Math.max(0, Math.min(1, share))
}

// The inn's own price for a good (1 untouched), recovered since it was last set.
export function innSaturation(market: Market | null | undefined, inn: Point, good: Good, at: number) {
  const entry = market?.inns?.[innKey(inn)]?.[good]
  if (!entry) return 1
  const half = innSpec().recoverSeconds * 1000
  return 1 - (1 - entry.f) * Math.pow(0.5, Math.max(0, at - entry.at) / half)
}

// The market after `units` of a good were sold at an inn.
export function afterInnSale(market: Market, inn: Point, good: Good, units: number, at: number): Market {
  const s = innSpec()
  const key = innKey(inn)
  const f = Math.max(s.floor, innSaturation(market, inn, good, at) * Math.pow(1 - s.sellImpactPerUnit, units))
  const inns = { ...(market.inns ?? {}) }
  inns[key] = { ...(inns[key] ?? {}), [good]: { f: Number(f.toFixed(5)), at } }
  return { ...market, inns }
}
