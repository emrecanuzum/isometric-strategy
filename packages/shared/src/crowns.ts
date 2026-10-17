import { balance } from './balance'
import { BUILDINGS, WEAPONS, armoryCap, armoryOf, book, palaceLevel, storageCap } from './economy'
import { priceAt } from './market'
import type { Market } from './market'
import type { Good, Kingdom, Weapon } from './economy'

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
export const doneBuildings = (kingdom: Pick<Kingdom, 'buildings'>, at: number) => kingdom.buildings.filter((b) => b.doneAt <= at && b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road').length
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

// ---- What the crowns ask of the lords (CLAUDE.md §7.8) --------------------------------------------------------------

// Each crown asks one task an hour of every lord, the same for all (seeded by the lobby): sell a lot of a good (trade
// mastery), take a town, send its order, or grow the army. A lord takes it (what it starts from is noted), does it
// before the hour is out and claims gold and the crown's goodwill.
export type QuestKind = 'trade' | 'town' | 'order' | 'army'

export interface CrownQuest {
  crown: number
  window: number
  endsAt: number
  kind: QuestKind
  // Trade: the good and how many units to sell.
  good?: Good
  units?: number
  gold: number
}

// A task taken: in which window, and what it started from (units of the good sold so far, towns held, the soldiers to
// reach).
export interface QuestTaken {
  window: number
  base: number
  target?: number
  done?: boolean
}

const quests = () => spec().quests

export function crownQuest(lobbyKey: number | undefined, crown: number, at: number): CrownQuest {
  const q = quests()
  const ms = q.windowSeconds * 1000
  const window = Math.floor(at / ms)
  const h = mix(lobbyKey ?? 0, window, crown, 7717)
  const kind = q.kinds[h % q.kinds.length] as QuestKind
  const steps = Math.floor((q.tradeUnits[1] - q.tradeUnits[0]) / q.tradeStep)
  const gold = q.gold[0] + ((h >>> 8) % (q.gold[1] - q.gold[0] + 1))
  return {
    crown,
    window,
    endsAt: (window + 1) * ms,
    kind,
    ...(kind === 'trade' && { good: GOODS_ORDER[(h >>> 4) % 3], units: q.tradeUnits[0] + ((h >>> 6) % (steps + 1)) * q.tradeStep }),
    gold,
  }
}

const soldiersNow = (k: Kingdom) => (k.soldiers ?? 0) + (k.fielded ?? 0)

// Where the lord stands on the task: how far along and how far to go.
export function questProgress(kingdom: Kingdom, crown: number, at: number): { quest: CrownQuest; taken: QuestTaken | null; have: number; need: number } {
  const quest = crownQuest(kingdom.lobbyKey, crown, at)
  const t = kingdom.crownQuests?.[crown] ?? null
  const taken = t && t.window === quest.window ? t : null
  const sold = (g?: Good) => (g ? (kingdom.trade.ledger?.[g] ?? 0) : 0)
  switch (quest.kind) {
    case 'trade':
      return { quest, taken, have: taken ? Math.max(0, sold(quest.good) - taken.base) : 0, need: quest.units ?? 0 }
    case 'town':
      return { quest, taken, have: taken ? Math.max(0, (kingdom.towns?.length ?? 0) - taken.base) : 0, need: 1 }
    case 'order':
      return { quest, taken, have: (kingdom.ordersDone ?? [])[crown] === quest.window ? 1 : 0, need: 1 }
    case 'army':
      return { quest, taken, have: soldiersNow(kingdom), need: taken?.target ?? Math.max(quests().armyMin, Math.ceil(soldiersNow(kingdom) * quests().armyGrowth)) }
  }
}

export type QuestError = 'crown' | 'locked' | 'relation' | 'taken' | 'notTaken' | 'done' | 'notYet'

export function questError(kingdom: Kingdom, crown: number, action: 'take' | 'claim', at: number, crowns: number, palace: number): QuestError | null {
  if (!Number.isInteger(crown) || crown < 0 || crown >= crowns) return 'crown'
  if (palace < quests().minPalace) return 'locked'
  if (crownRelation(kingdom, crown) < quests().minRelation) return 'relation'
  const { taken, have, need } = questProgress(kingdom, crown, at)
  if (action === 'take') return taken ? 'taken' : null
  if (!taken) return 'notTaken'
  if (taken.done) return 'done'
  return have >= need ? null : 'notYet'
}

export function takeQuest(kingdom: Kingdom, crown: number, at: number, crowns: number, palace: number): Kingdom {
  if (questError(kingdom, crown, 'take', at, crowns, palace)) return kingdom
  const { quest, need } = questProgress(kingdom, crown, at)
  const base = quest.kind === 'trade' ? (kingdom.trade.ledger?.[quest.good!] ?? 0) : quest.kind === 'town' ? (kingdom.towns?.length ?? 0) : 0
  const list = [...(kingdom.crownQuests ?? [])]
  while (list.length <= crown) list.push(null)
  list[crown] = { window: quest.window, base, ...(quest.kind === 'army' && { target: need }) }
  return { ...kingdom, crownQuests: list }
}

// Claims the reward: the gold (as far as the treasury holds it) and the crown's goodwill, more from one's own crown.
export function claimQuest(kingdom: Kingdom, crown: number, at: number, crowns: number, palace: number, goldRoom: number): Kingdom {
  if (questError(kingdom, crown, 'claim', at, crowns, palace)) return kingdom
  const { quest } = questProgress(kingdom, crown, at)
  const gold = Math.max(0, Math.min(quest.gold, goldRoom))
  const list = [...(kingdom.crownQuests ?? [])]
  list[crown] = { ...list[crown]!, done: true }
  const q = quests()
  const next = changeCrownRelation({ ...kingdom, crownQuests: list, stock: { ...kingdom.stock, gold: kingdom.stock.gold + gold } }, crown, kingdom.liege === crown ? q.relation.own : q.relation.other)
  return gold > 0 ? book(next, { crownGot: gold }) : next
}

// ---- The liege's royal requests (CLAUDE.md §7.8) --------------------------------------------------------------------

// Every hour the royal envoy of the crown a lord is sworn to asks for a lot of one thing (a weapon from the armory or
// a good from the stores), to be handed over within the hour. Each lord's envoy comes at its own moment of the hour
// (seeded by the lobby and the lord's seat), the lot is sized to the lord's palace and forges, and the crown pays a
// little over what the lot would fetch at the market, never more than a palace-level sum: goodwill more than gold.
// Nothing is stored but the answers (Kingdom.royal).
export type RoyalItem = Good | Weapon

export interface RoyalRequest {
  // The request's number (the n-th since the epoch for this lord), its crown, what and how many it asks.
  n: number
  crown: number
  item: RoyalItem
  units: number
  // The gold it pays (at the prices of the moment; fixed once the request is answered).
  gold: number
  arriveAt: number
  endsAt: number
}

export interface RoyalAnswer {
  n: number
  status: 'accepted' | 'declined' | 'delivered'
  at: number
  // What was asked and offered when the request was answered (kept, so the lot does not change afterwards).
  item?: RoyalItem
  units?: number
  gold?: number
}

const royal = () => spec().royal
export const isWeaponItem = (item: RoyalItem): item is Weapon => (WEAPONS as readonly string[]).includes(item)

const royalPhase = (kingdom: Pick<Kingdom, 'lobbyKey' | 'site'>) => mix(kingdom.lobbyKey ?? 0, kingdom.site.x, kingdom.site.y, 5303) % (royal().everySeconds * 1000)

// What a unit of the item is worth at the lobby's market: the good itself, or the raw goods a forge works into it.
export function royalUnitValue(item: RoyalItem, market: Market | null | undefined, at: number) {
  if (!isWeaponItem(item)) return priceAt(market, item, at)
  const uses = BUILDINGS.forge.products?.[item]?.uses ?? {}
  return Object.entries(uses).reduce((sum, [g, v]) => sum + (v ?? 0) * priceAt(market, g as Good, at), 0)
}

// The gold for `units` of the item: the market value with the premium, under the palace-level cap.
export function royalGold(item: RoyalItem, units: number, palace: number, market: Market | null | undefined, at: number) {
  const r = royal()
  const cap = r.goldCapByPalaceLevel[Math.max(0, Math.min(r.goldCapByPalaceLevel.length - 1, palace - 1))]
  return Math.max(0, Math.min(cap, Math.round(units * royalUnitValue(item, market, at) * r.premium)))
}

const roundTo = (v: number, step: number) => Math.max(step, Math.floor(v / step) * step)

export const royalAnswer = (kingdom: Pick<Kingdom, 'royal'>, n: number) => (kingdom.royal ?? []).find((a) => a.n === n) ?? null

// The request in hand at `at` (the latest to have arrived, perhaps run out), for a sworn lord; null otherwise.
export function royalRequest(kingdom: Kingdom, at: number, market: Market | null | undefined): RoyalRequest | null {
  if (kingdom.liege === undefined || kingdom.liege === null) return null
  const r = royal()
  const every = r.everySeconds * 1000
  const phase = royalPhase(kingdom)
  const n = Math.floor((at - phase) / every)
  const arriveAt = n * every + phase
  const endsAt = arriveAt + r.durationSeconds * 1000
  const crown = kingdom.liege
  const answer = royalAnswer(kingdom, n)
  if (answer?.item && answer.units) return { n, crown, item: answer.item, units: answer.units, gold: answer.gold ?? 0, arriveAt, endsAt }
  // Sized to the lord as it stood when the envoy came.
  const palace = Math.max(1, palaceLevel(kingdom, arriveAt))
  const forges = kingdom.buildings.filter((b) => b.kind === 'forge' && b.doneAt <= arriveAt).length
  const h = mix(kingdom.lobbyKey ?? 0, kingdom.site.x, kingdom.site.y, n, 8819)
  const factor = r.factor[0] + (((h >>> 12) % 1000) / 999) * (r.factor[1] - r.factor[0])
  const level = (list: readonly number[]) => list[Math.min(list.length - 1, palace - 1)]
  let item: RoyalItem
  let units: number
  if (forges > 0 && (h % 1000) / 1000 < r.weaponShare) {
    item = WEAPONS[(h >>> 4) % WEAPONS.length]
    const w = r.weapons
    const most = Math.min(w.max, Math.floor(armoryCap(kingdom, arriveAt) * w.armoryShare))
    units = Math.min(roundTo(most, w.step), roundTo((level(w.byPalaceLevel) + w.perForge * forges) * factor, w.step))
  } else {
    item = GOODS_ORDER[(h >>> 4) % GOODS_ORDER.length]
    const g = r.goods
    units = Math.min(roundTo(storageCap(kingdom, arriveAt) * g.storeShare, g.step), roundTo(level(g.byPalaceLevel) * factor, g.step))
  }
  return { n, crown, item, units, gold: royalGold(item, units, palaceLevel(kingdom, at), market, at), arriveAt, endsAt }
}

// How much of the item the lord holds.
export const royalHave = (kingdom: Kingdom, item: RoyalItem) => (isWeaponItem(item) ? armoryOf(kingdom)[item] : kingdom.stock[item])

export type RoyalAction = 'accept' | 'decline' | 'deliver'
export type RoyalError = 'unsworn' | 'noRequest' | 'expired' | 'answered' | 'declined' | 'delivered' | 'short'

export function royalError(kingdom: Kingdom, action: RoyalAction, at: number, market: Market | null | undefined): RoyalError | null {
  if (kingdom.liege === undefined || kingdom.liege === null) return 'unsworn'
  const req = royalRequest(kingdom, at, market)
  if (!req) return 'noRequest'
  if (at >= req.endsAt) return 'expired'
  const answer = royalAnswer(kingdom, req.n)
  if (answer?.status === 'delivered') return 'delivered'
  if (answer?.status === 'declined') return 'declined'
  if (action !== 'deliver') return answer ? 'answered' : null
  return royalHave(kingdom, req.item) >= req.units ? null : 'short'
}

// The answers of the last day, with this one in place of any earlier answer to the same request.
function answered(kingdom: Kingdom, answer: RoyalAnswer, at: number): RoyalAnswer[] {
  const keep = at - royal().keepSeconds * 1000
  return [...(kingdom.royal ?? []).filter((a) => a.n !== answer.n && a.at >= keep), answer]
}

// Answers the royal envoy: takes the request on (the lot and its pay fixed), turns it down (the crown is a little
// put out) or hands the lot over (the items leave, the gold comes as far as the treasury holds it, `goldRoom`, and
// the crown's goodwill).
export function answerRoyal(kingdom: Kingdom, action: RoyalAction, at: number, market: Market | null | undefined, goldRoom: number): Kingdom {
  if (royalError(kingdom, action, at, market)) return kingdom
  const req = royalRequest(kingdom, at, market)!
  const r = royal()
  const lot = { item: req.item, units: req.units, gold: req.gold }
  if (action === 'accept') return { ...kingdom, royal: answered(kingdom, { n: req.n, status: 'accepted', at, ...lot }, at) }
  if (action === 'decline') return changeCrownRelation({ ...kingdom, royal: answered(kingdom, { n: req.n, status: 'declined', at, ...lot }, at) }, req.crown, r.relation.decline)
  const gold = Math.max(0, Math.min(req.gold, Math.floor(goldRoom)))
  let k: Kingdom = { ...kingdom, royal: answered(kingdom, { n: req.n, status: 'delivered', at, ...lot }, at) }
  if (isWeaponItem(req.item)) k = { ...k, armory: { ...armoryOf(k), [req.item]: armoryOf(k)[req.item] - req.units } }
  else k = { ...k, stock: { ...k.stock, [req.item]: k.stock[req.item] - req.units } }
  k = changeCrownRelation({ ...k, stock: { ...k.stock, gold: k.stock.gold + gold } }, req.crown, r.relation.deliver)
  return req.gold > 0 ? book(k, { crownGot: gold, ...(req.gold > gold && { wastedGold: req.gold - gold }) }) : k
}
