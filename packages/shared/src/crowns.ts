import { balance } from './balance'
import { book } from './economy'
import { priceAt } from './market'
import type { Market } from './market'
import type { Good, Kingdom } from './economy'

// The politics of the two crown kingdoms (CLAUDE.md §7.8): every lord stands somewhere with each crown (a relation from
// −100 to 100), each crown watches over the trade in one good at a time, and a crown is as strong as the lords sworn to
// it. Pure helpers shared by the server and the client.

const spec = () => balance.cities.crown
const GOODS_ORDER: Good[] = ['food', 'materials', 'arms']

// Where a lord's standing with a crown drifts back to: warm with its own crown, cool with the rival one.
export function crownRest(kingdom: Pick<Kingdom, 'liege'>, crown: number) {
  const r = spec().relation
  if (kingdom.liege === undefined || kingdom.liege === null) return 0
  return kingdom.liege === crown ? r.restSworn : r.restRival
}

export const crownRelation = (kingdom: Pick<Kingdom, 'liege' | 'crownRelations'>, crown: number) => kingdom.crownRelations?.[crown] ?? crownRest(kingdom, crown)

const clampRelation = (v: number) => Math.max(-100, Math.min(100, v))

export function changeCrownRelation<K extends Pick<Kingdom, 'liege' | 'crownRelations'>>(kingdom: K, crown: number, delta: number): K {
  const list = [0, 1].map((i) => crownRelation(kingdom, i))
  list[crown] = clampRelation(list[crown] + delta)
  return { ...kingdom, crownRelations: list }
}

// One production round's drift back toward the rest.
export function driftCrownRelations<K extends Pick<Kingdom, 'liege' | 'crownRelations'>>(kingdom: K): K {
  if (!kingdom.crownRelations) return kingdom
  const step = spec().relation.driftPerRound
  const list = kingdom.crownRelations.map((v, i) => {
    const rest = crownRest(kingdom, i)
    return Math.abs(v - rest) <= step ? rest : v + Math.sign(rest - v) * step
  })
  return { ...kingdom, crownRelations: list }
}

// ---- Stewardship: each crown watches over one good for a while ------------------------------------------------------

function mix(...values: number[]) {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 16
  return h >>> 0
}

export const stewardPeriodMs = () => spec().stewardship.periodSeconds * 1000

// The goods the two crowns watch over at `at` (never the same one), and when that period ends.
export function crownGoods(lobbyKey: number | undefined, at: number): { goods: [Good, Good]; endsAt: number } {
  const period = Math.floor(at / stewardPeriodMs())
  const h = mix(lobbyKey ?? 0, period, 9137)
  const first = GOODS_ORDER[h % 3]
  const rest = GOODS_ORDER.filter((g) => g !== first)
  const second = rest[(h >>> 8) % 2]
  return { goods: [first, second], endsAt: (period + 1) * stewardPeriodMs() }
}

// What a lord's merchant gets for `good` over the market price, by its standing with the crown watching over it: up
// to a quarter more with a friendly crown, less with a cold one, and half when that crown's merchants will not deal
// with the lord at all.
export function stewardFactor(kingdom: Pick<Kingdom, 'liege' | 'crownRelations' | 'lobbyKey'>, good: Good, at: number) {
  const s = spec().stewardship
  const crown = crownGoods(kingdom.lobbyKey, at).goods.indexOf(good)
  if (crown < 0) return 1
  const relation = crownRelation(kingdom, crown)
  if (relation <= s.refuseBelow) return s.refuseFactor
  return relation >= 0 ? 1 + (relation / 100) * s.bonus : 1 + (relation / 100) * s.penalty
}

// The crown watching over a good now, if any.
export const stewardOf = (lobbyKey: number | undefined, good: Good, at: number) => {
  const crown = crownGoods(lobbyKey, at).goods.indexOf(good)
  return crown < 0 ? null : crown
}

// ---- Gifts: a friendly crown's patrol brings something --------------------------------------------------------------

export type CrownGift = (typeof balance.cities.crown.gifts)[number]

// The best gift a crown's patrol brings at this standing, if any.
export function giftAt(relation: number): CrownGift | null {
  let best: CrownGift | null = null
  for (const g of spec().gifts) if (relation >= g.at) best = g
  return best
}

// ---- Power: a crown is as strong as its lords -----------------------------------------------------------------------

// Each crown's strength (a base of its own and the scores of the lords sworn to it) and its share of the two.
export function crownPower(lords: { liege?: number | null; score?: number | null }[], crowns = 2) {
  const power = Array.from({ length: crowns }, () => spec().power.base)
  for (const l of lords) if (l.liege !== undefined && l.liege !== null && l.liege < crowns) power[l.liege] += Math.max(0, l.score ?? 0)
  const total = power.reduce((a, b) => a + b, 0)
  return { power, share: power.map((p) => p / total) }
}

// A factor between `range[0]` (a crown holding none of the power) and `range[1]` (all of it); 1 at an even balance.
export const byPower = (share: number, range: readonly number[]) => range[0] + (range[1] - range[0]) * share

// ---- When a lord may swear -------------------------------------------------------------------------------------------

// Fealty is offered once the lord has a few buildings standing (the crowns are introduced then).
export const doneBuildings = (kingdom: Pick<Kingdom, 'buildings'>, at: number) => kingdom.buildings.filter((b) => b.doneAt <= at && b.kind !== 'wall' && b.kind !== 'gate').length
export const fealtyOpen = (kingdom: Pick<Kingdom, 'buildings'>, at: number) => doneBuildings(kingdom, at) >= spec().intro.buildings

// ---- Commissions: each crown orders goods every hour (CLAUDE.md §7.8) -----------------------------------------------

export interface CrownOrder {
  crown: number
  // The window the order belongs to (its number), when it ends.
  window: number
  endsAt: number
  good: Good
  units: number
}

const orders = () => spec().orders

// The order of crown `crown` in the window around `at`: a lot of one good, paid over its usual price. Seeded by the
// lobby, so every lord sees the same order and the server can check it.
export function crownOrder(lobbyKey: number | undefined, crown: number, at: number): CrownOrder {
  const o = orders()
  const ms = o.windowSeconds * 1000
  const window = Math.floor(at / ms)
  const h = mix(lobbyKey ?? 0, window, crown, 4421)
  const good = GOODS_ORDER[h % 3]
  const steps = Math.floor((o.units[1] - o.units[0]) / o.step)
  const units = o.units[0] + ((h >>> 4) % (steps + 1)) * o.step
  return { crown, window, endsAt: (window + 1) * ms, good, units }
}

// What the crown pays for the lot: over the lobby's price of the moment (so goods bought cheap at the market and
// handed over earn nothing more than selling them would), more from one's own crown.
export const orderPay = (kingdom: Pick<Kingdom, 'liege'>, order: CrownOrder, market: Market | null | undefined, at: number) =>
  Math.round(order.units * priceAt(market, order.good, at) * orders().payFactor * (kingdom.liege === order.crown ? 1 + orders().swornBonus : 1))


export type OrderError = 'done' | 'have' | 'relation' | 'locked' | 'crown'

export function crownOrderError(kingdom: Kingdom, crown: number, at: number, crowns: number, palace: number): OrderError | null {
  if (!Number.isInteger(crown) || crown < 0 || crown >= crowns) return 'crown'
  if (palace < orders().minPalace) return 'locked'
  const order = crownOrder(kingdom.lobbyKey, crown, at)
  if ((kingdom.ordersDone ?? [])[crown] === order.window) return 'done'
  if (crownRelation(kingdom, crown) < orders().minRelation) return 'relation'
  if (kingdom.stock[order.good] < order.units) return 'have'
  return null
}

// Sends the order (CLAUDE.md §7.8): the goods leave the stores at once on a caravan to the crown's capital (a trip
// as long as the merchant's there and back, `tripMs`); the crown's payment, fixed at its price of the moment, and its
// goodwill come back with the caravan (settled by `settleOrderTrips`).
export function fulfilOrder(kingdom: Kingdom, crown: number, at: number, crowns: number, palace: number, tripMs: number | null, market: Market | null | undefined): Kingdom {
  if (crownOrderError(kingdom, crown, at, crowns, palace) || !tripMs) return kingdom
  const order = crownOrder(kingdom.lobbyKey, crown, at)
  const done = [...(kingdom.ordersDone ?? [])]
  done[crown] = order.window
  const trip: OrderTrip = { crown, good: order.good, units: order.units, gold: orderPay(kingdom, order, market, at), leftAt: at, arriveAt: at + tripMs }
  return { ...kingdom, stock: { ...kingdom.stock, [order.good]: kingdom.stock[order.good] - order.units }, ordersDone: done, orderTrips: [...(kingdom.orderTrips ?? []), trip] }
}

export interface OrderTrip {
  crown: number
  good: Good
  units: number
  gold: number
  leftAt: number
  arriveAt: number
}

// Caravans back from the crowns by `at`: their gold (as much as the treasury holds, `goldRoom`) and the crowns'
// goodwill.
export function settleOrderTrips(kingdom: Kingdom, at: number, goldRoom: (k: Kingdom) => number): { kingdom: Kingdom; back: OrderTrip[] } {
  const back = (kingdom.orderTrips ?? []).filter((t) => t.arriveAt <= at)
  if (back.length === 0) return { kingdom, back }
  let k: Kingdom = { ...kingdom, orderTrips: (kingdom.orderTrips ?? []).filter((t) => t.arriveAt > at) }
  const r = orders().relation
  for (const t of back) {
    const pay = Math.min(t.gold, Math.max(0, Math.floor(goldRoom(k))))
    k = book({ ...k, stock: { ...k.stock, gold: k.stock.gold + pay } }, { other: pay, ...(t.gold > pay && { wastedGold: t.gold - pay }) })
    k = changeCrownRelation(k, t.crown, k.liege === t.crown ? r.own : r.other)
  }
  return { kingdom: k, back }
}
