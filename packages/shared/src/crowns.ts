import { balance } from './balance'
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
