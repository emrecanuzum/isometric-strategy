import { balance } from './balance'
import { affordable, book, goldCap, hasTradePost, palaceLevel, population, storageCap } from './economy'
import type { Cost, Kingdom, Resource, Stock } from './economy'
import { addUnits, countOf, garrisonOf, hasUnits, subtractUnits, takeShare } from './units'
import type { Units } from './units'

// Expeditions (CLAUDE.md §9.9): a small party of villagers (and a few soldiers to guard them) sent from the palace on
// a journey that runs while the lord is away: hunters to the woods, explorers to the mountains, pilgrims to a shrine, a
// caravan to far lands, a treasure hunt. While away the villagers neither work nor pay taxes (that is the cost, with
// the provisions paid up front); they come back with a haul and a story. Everything they meet follows from the
// kingdom and the moment they set out, so the server and every screen agree on it; only the start, the end and, once
// back, the outcome are stored.

const X = balance.expeditions

export interface Incident {
  weight: number
  // A share more (or less) of the haul (and of a pilgrimage's blessing).
  haul?: number
  // Goods found on the way, once.
  gain?: Cost
  // Happiness the party brings home (or a curse) for a while after it is back.
  boon?: number
  // A better (or worse) chance at the treasure.
  find?: number
  // The chance a villager (or one of the escort) does not come back.
  villagerLost?: number
  soldierLost?: number
  // News of the world picked up on the road.
  rumour?: boolean
}

export interface ExpeditionSpec {
  palace: number
  tradePost?: boolean
  minutes: number
  villagers: [number, number]
  // The most soldiers that may go with it.
  escort: number
  // Provisions for each villager, and once for the whole party.
  cost: Cost
  costFlat?: Cost
  // What each villager brings back on an ordinary journey.
  haul: Partial<Stock>
  // A pilgrimage brings home happiness instead: per pilgrim, up to a most, for a while.
  boon?: { perVillager: number; max: number; minutes: number }
  // How many things befall it on the way, and the chance each one is bad (before the escort).
  incidents: number
  danger: number
  // A treasure hunt's finds, best first: a chance (more with every hand searching) and what it gives.
  find?: Record<string, { chance: number; perVillager: number; gain: Cost }>
  good: Record<string, Incident>
  bad: Record<string, Incident>
}

export const EXPEDITIONS = X.kinds as unknown as Record<string, ExpeditionSpec>
export type ExpeditionKind = keyof typeof X.kinds
export const EXPEDITION_KINDS = Object.keys(X.kinds) as ExpeditionKind[]

export interface Expedition {
  id: number
  kind: ExpeditionKind
  startAt: number
  endAt: number
  villagers: number
  escort?: Units
  // What it cost to send.
  paid: Cost
  // Set once it is back.
  result?: ExpeditionResult
}

export interface ExpeditionResult {
  at: number
  // Called home early: back at once, with nothing.
  recalled?: boolean
  incidents: { id: string; bad: boolean }[]
  // What came into the stores, and what did not fit.
  gains: Partial<Stock>
  wasted?: Partial<Stock>
  // The treasure found, if any.
  find?: string
  villagersLost: number
  soldiersLost: number
  boon?: { happiness: number; until: number }
  // A seed for the news of the world they heard (the screen picks what to tell from what it knows).
  rumour?: number
}

type Seeded = Pick<Kingdom, 'site' | 'foundedAt'>

function hash(...values: number[]) {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  return h >>> 0
}

function random(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One incident from the pool by weight, leaving out those the party has already met (unless none are left).
function pick(pool: Record<string, Incident>, roll: number, met: string[] = []) {
  const fresh = Object.entries(pool).filter(([id]) => !met.includes(id))
  const entries = fresh.length > 0 ? fresh : Object.entries(pool)
  let left = roll * entries.reduce((n, [, i]) => n + i.weight, 0)
  for (const [id, i] of entries) {
    left -= i.weight
    if (left < 0) return [id, i] as const
  }
  return entries[entries.length - 1]
}

// ---- What a party costs and may be -------------------------------------------------------------------------------

export const expeditionSpec = (kind: string): ExpeditionSpec | null => EXPEDITIONS[kind] ?? null

export function expeditionCost(kind: string, villagers: number): Cost {
  const spec = EXPEDITIONS[kind]
  const out: Cost = { ...spec.costFlat }
  for (const [r, v] of Object.entries(spec.cost)) out[r as Resource] = (out[r as Resource] ?? 0) + (v ?? 0) * villagers
  return out
}

export const expeditionMs = (kind: string) => EXPEDITIONS[kind].minutes * 60_000

// The chance each thing that befalls the party is a bad one: soldiers keep some of it off.
export function expeditionDanger(kind: string, escort: number) {
  const spec = EXPEDITIONS[kind]
  return spec.danger * Math.max(X.escortFloor, 1 - X.escortCut * escort)
}

export const expeditionsOf = (k: Pick<Kingdom, 'expeditions'>) => k.expeditions ?? []
// On the road at `at` (not yet back).
export const expeditionsOut = (k: Pick<Kingdom, 'expeditions'>, at: number) => expeditionsOf(k).filter((e) => !e.result && e.startAt <= at && at < e.endAt)

// The villagers away at `at`: they neither work nor pay taxes (they still eat what they carry).
export function villagersAway(k: Pick<Kingdom, 'expeditions'>, at: number) {
  let n = 0
  for (const e of k.expeditions ?? []) if (!e.result && e.startAt <= at && at < e.endAt) n += e.villagers
  return n
}

// Soldiers guarding a party that is not yet back: paid and counted like the rest, but not in the garrison.
export function escortAway(k: Pick<Kingdom, 'expeditions'>) {
  let n = 0
  for (const e of k.expeditions ?? []) if (!e.result) n += countOf(e.escort)
  return n
}

export const maxExpeditions = (k: Kingdom, at: number) => {
  const caps = X.maxActiveByPalaceLevel
  return caps[Math.max(0, Math.min(caps.length - 1, palaceLevel(k, at) - 1))]
}

// How many more villagers may set out: a share of the people, less those already away.
export function villagersFree(k: Kingdom, at: number) {
  const { villagers } = population(k, at)
  return Math.max(0, Math.floor(villagers * X.maxVillagerShare) - villagersAway(k, at))
}

export type ExpeditionError = 'locked' | 'tradePost' | 'busy' | 'villagers' | 'soldiers' | 'cost' | 'rejected'

export function expeditionError(k: Kingdom, kind: string, villagers: number, escort: Units, at: number): ExpeditionError | null {
  const spec = EXPEDITIONS[kind]
  if (!spec || !Number.isInteger(villagers) || villagers < spec.villagers[0] || villagers > spec.villagers[1]) return 'rejected'
  if (!k.buildings.some((b) => b.kind === 'palace') || palaceLevel(k, at) < spec.palace) return 'locked'
  if (spec.tradePost && !hasTradePost(k)) return 'tradePost'
  if (expeditionsOut(k, at).length >= maxExpeditions(k, at)) return 'busy'
  if (villagers > villagersFree(k, at)) return 'villagers'
  const guards = countOf(escort)
  if (guards > spec.escort || !hasUnits(garrisonOf(k), escort) || Object.values(escort).some((n) => !Number.isInteger(n) || (n ?? 0) < 0)) return 'soldiers'
  if (!affordable(k.stock, expeditionCost(kind, villagers))) return 'cost'
  return null
}

// Sends a party off: its provisions paid, its escort taken out of the garrison.
export function startExpedition(k: Kingdom, kind: ExpeditionKind, villagers: number, escort: Units, at: number): Kingdom {
  if (expeditionError(k, kind, villagers, escort, at)) return k
  const paid = expeditionCost(kind, villagers)
  const stock = { ...k.stock }
  for (const [r, v] of Object.entries(paid)) stock[r as Resource] -= v ?? 0
  const guards = countOf(escort) > 0 ? escort : undefined
  const units = guards ? subtractUnits(garrisonOf(k), guards) : k.units
  const id = k.nextExpeditionId ?? 1
  const e: Expedition = { id, kind, startAt: at, endAt: at + expeditionMs(kind), villagers, ...(guards && { escort: guards }), paid }
  return {
    ...k,
    stock,
    ...(guards && { units, soldiers: countOf(units) }),
    nextExpeditionId: id + 1,
    expeditions: [...expeditionsOf(k), e],
  }
}

export const expeditionRecallError = (k: Kingdom, id: number, at: number): 'rejected' | null => (expeditionsOut(k, at).some((e) => e.id === id) ? null : 'rejected')

// Calls a party home: back at once, empty-handed (the provisions are spent).
export function recallExpedition(k: Kingdom, id: number, at: number): Kingdom {
  if (expeditionRecallError(k, id, at)) return k
  const e = expeditionsOf(k).find((x) => x.id === id)!
  const result: ExpeditionResult = { at, recalled: true, incidents: [], gains: {}, villagersLost: 0, soldiersLost: 0 }
  const units = e.escort ? addUnits(garrisonOf(k), e.escort) : k.units
  return {
    ...k,
    ...(e.escort && { units, soldiers: countOf(units) }),
    expeditions: prune(expeditionsOf(k).map((x) => (x.id === id ? { ...x, endAt: at, result } : x))),
  }
}

// Keeps the parties on the road and the latest ones back.
function prune(list: Expedition[]) {
  const back = list.filter((e) => e.result).sort((a, b) => b.result!.at - a.result!.at).slice(0, X.keepFinished)
  return list.filter((e) => !e.result || back.includes(e))
}

// ---- What befalls a party ------------------------------------------------------------------------------------------

export interface ExpeditionOutcome {
  incidents: { id: string; bad: boolean }[]
  haul: Partial<Stock>
  find?: string
  villagersLost: number
  soldiersLost: number
  boon: number
  rumour?: number
}

// Everything the party meets, from the kingdom and the moment it set out: the same everywhere, every time.
export function expeditionOutcome(k: Seeded, e: Pick<Expedition, 'id' | 'kind' | 'startAt' | 'villagers' | 'escort'>): ExpeditionOutcome {
  const spec = EXPEDITIONS[e.kind]
  const seed = hash(k.site.x, k.site.y, Math.floor((k.foundedAt ?? 0) / 1000), Math.floor(e.startAt / 1000), e.id, 4021)
  const r = random(seed)
  const guards = countOf(e.escort)
  const danger = expeditionDanger(e.kind, guards)
  const incidents: ExpeditionOutcome['incidents'] = []
  let share = 1
  let boon = 0
  let find = 0
  const gains: Partial<Stock> = {}
  let villagersLost = 0
  let soldiersLost = 0
  let rumour: number | undefined
  for (let i = 0; i < spec.incidents; i++) {
    const bad = r() < danger
    const [id, inc] = pick(bad ? spec.bad : spec.good, r(), incidents.map((x) => x.id))
    // Rolled every time, so one draw never shifts the next.
    const lostVillager = r()
    const lostSoldier = r()
    incidents.push({ id, bad })
    share += inc.haul ?? 0
    boon += inc.boon ?? 0
    find += inc.find ?? 0
    for (const [g, v] of Object.entries(inc.gain ?? {})) gains[g as Resource] = (gains[g as Resource] ?? 0) + (v ?? 0)
    if (inc.villagerLost && lostVillager < inc.villagerLost && villagersLost < e.villagers - 1) villagersLost++
    if (inc.soldierLost && guards > soldiersLost && lostSoldier < inc.soldierLost) soldiersLost++
    if (inc.rumour && rumour === undefined) rumour = hash(seed, i, 77) & 0x7fffffff
  }
  share = Math.max(0, share)
  const haul: Partial<Stock> = {}
  for (const [g, v] of Object.entries(spec.haul)) haul[g as Resource] = Math.round((v ?? 0) * e.villagers * share)
  for (const [g, v] of Object.entries(gains)) haul[g as Resource] = (haul[g as Resource] ?? 0) + (v ?? 0)
  let found: string | undefined
  if (spec.find) {
    for (const [id, f] of Object.entries(spec.find)) {
      const roll = r()
      if (found || roll >= Math.max(0, f.chance + f.perVillager * e.villagers + find)) continue
      found = id
      for (const [g, v] of Object.entries(f.gain)) haul[g as Resource] = (haul[g as Resource] ?? 0) + (v ?? 0)
    }
  }
  if (spec.boon) boon += Math.min(spec.boon.max, spec.boon.perVillager * e.villagers) * share
  return { incidents, haul, ...(found && { find: found }), villagersLost, soldiersLost, boon: Math.round(boon), ...(rumour !== undefined && { rumour }) }
}

// Parties back by `at`: their haul into the stores (as much as there is room for), the escort back in the garrison,
// any lost on the way gone, the blessing begun. Returns those that came back.
export function settleExpeditions(kingdom: Kingdom, at: number): { kingdom: Kingdom; back: Expedition[] } {
  const due = expeditionsOf(kingdom).filter((e) => !e.result && e.endAt <= at)
  if (due.length === 0) return { kingdom, back: [] }
  let k: Kingdom = { ...kingdom, stock: { ...kingdom.stock } }
  const back: Expedition[] = []
  let list = expeditionsOf(kingdom)
  for (const e of due) {
    const o = expeditionOutcome(k, e)
    const gains: Partial<Stock> = {}
    const wasted: Partial<Stock> = {}
    for (const [r, v] of Object.entries(o.haul)) {
      if (!v) continue
      const res = r as Resource
      const room = Math.max(0, Math.floor((res === 'gold' ? goldCap(k, at) : storageCap(k, at, res)) - k.stock[res]))
      const kept = Math.min(v, room)
      if (kept > 0) gains[res] = kept
      if (v > kept) wasted[res] = v - kept
      k.stock[res] += kept
    }
    const wastedGoods = (wasted.food ?? 0) + (wasted.materials ?? 0) + (wasted.arms ?? 0)
    k = book(k, { expedition: gains.gold ?? 0, wastedGold: wasted.gold ?? 0, wastedGoods }, o.soldiersLost > 0 ? { expedition: o.soldiersLost } : undefined)
    if (e.escort) {
      const home = takeShare(e.escort, countOf(e.escort) - o.soldiersLost).taken
      const units = addUnits(garrisonOf(k), home)
      k = { ...k, units, soldiers: countOf(units) }
    }
    if (o.villagersLost > 0) k = { ...k, people: Math.max(0, population(k, at).people - o.villagersLost) }
    const spec = EXPEDITIONS[e.kind]
    const result: ExpeditionResult = {
      at: e.endAt,
      incidents: o.incidents,
      gains,
      ...(Object.keys(wasted).length > 0 && { wasted }),
      ...(o.find && { find: o.find }),
      villagersLost: o.villagersLost,
      soldiersLost: o.soldiersLost,
      ...(o.boon !== 0 && { boon: { happiness: o.boon, until: e.endAt + (spec.boon?.minutes ?? X.boonMinutes) * 60_000 } }),
      ...(o.rumour !== undefined && { rumour: o.rumour }),
    }
    const done = { ...e, result }
    list = list.map((x) => (x.id === e.id ? done : x))
    back.push(done)
  }
  k = { ...k, expeditions: prune(list), record: { ...k.record, expeditions: (k.record?.expeditions ?? 0) + back.length } }
  return { kingdom: k, back }
}

// Happiness the parties back brought home (a blessing, wonders seen, or a curse), while it lasts.
export function expeditionHappiness(k: Pick<Kingdom, 'expeditions'>, at: number) {
  let n = 0
  for (const e of k.expeditions ?? []) {
    const b = e.result?.boon
    if (b && e.endAt <= at && at < b.until) n += b.happiness
  }
  return n
}

// ---- Expected value (for the balance and the panel) -----------------------------------------------------------------

// What a party is worth on average in gold at the usual prices, worked out over many seeds; and what it costs: the
// provisions and the taxes (and, for villagers who had work, the work) left undone while away.
export function expeditionValue(kind: ExpeditionKind, villagers: number, escort = 0, runs = 4000) {
  const v = X.valuation
  const price = v.prices as Record<Resource, number>
  const worth = (c: Partial<Stock>) => Object.entries(c).reduce((n, [r, x]) => n + (x ?? 0) * price[r as Resource], 0)
  let total = 0
  let lostVillagers = 0
  let lostSoldiers = 0
  let boon = 0
  const site = { site: { x: 11, y: 23 }, foundedAt: 1_000_000 }
  for (let i = 0; i < runs; i++) {
    const o = expeditionOutcome(site, { id: i + 1, kind, startAt: 1_700_000_000_000 + i * 7919_000, villagers, escort: escort ? { spear: escort } : undefined })
    total += worth(o.haul)
    lostVillagers += o.villagersLost
    lostSoldiers += o.soldiersLost
    boon += o.boon
  }
  const rounds = (expeditionMs(kind) / 1000) / balance.economy.productionSeconds
  const provisions = worth(expeditionCost(kind, villagers))
  const tax = villagers * rounds * v.taxPerRound
  const work = villagers * rounds * v.workPerRound
  return { value: total / runs, provisions, tax, work, lostVillagers: lostVillagers / runs, lostSoldiers: lostSoldiers / runs, boon: boon / runs }
}
