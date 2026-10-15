import { dynastyEffects } from './dynasty'
import { balance } from './balance'
import type { Cost, Good, Kingdom } from './economy'
import { isNightAt, phaseEndsAt } from './society'
import { perSpan } from './span'
import type { SpanCache } from './span'

// The university, the hospital and the temple, and the fortunes that come and go (CLAUDE.md §9.8). Pure helpers on a
// kingdom's state; `advance` (economy.ts) applies them every production round.

const I = balance.institutions

// ---- University: research ----------------------------------------------------------------------------------------

export interface ResearchSpec {
  // Its branch of the tree and its tier there: each tier offers two studies and only one of them may be taken; a tier
  // waits for the one below it in the same branch.
  category: string
  tier: number
  // The university level it waits for.
  level: number
  cost: Cost
  seconds: number
  // One more construction slot.
  queue?: number
  // A product it makes available (BuildingSpec.products[…].research names it).
  unlocks?: string
  // Extra output of buildings of a kind (0.2 = +20%).
  output?: Record<string, number>
  // Fewer people falling ill (a factor) and faster recovery (a factor).
  sickness?: number
  healing?: number
  // Extra taxes, merchant's gold and battle roll.
  tax?: number
  trade?: number
  battle?: number
  // More room in the stores (a share), more walls in a siege, faster training (a share), cheaper soldiers' upkeep (a
  // share off), happiness, more of the temple's faith (a share), longer sermons (a share), counter-espionage, and
  // relation gains from envoys (a share).
  storage?: number
  fortify?: number
  trainSpeed?: number
  upkeep?: number
  happiness?: number
  faith?: number
  sermon?: number
  counter?: number
  diplomacy?: number
}

export const RESEARCH_CATEGORIES = I.researchCategories as string[]

export const RESEARCH = I.research as Record<string, ResearchSpec>
export type ResearchId = keyof typeof I.research
export const RESEARCH_IDS = Object.keys(RESEARCH) as ResearchId[]

export const hasResearch = (k: Kingdom, id: string, at: number) => (k.researches ?? []).some((r) => r.id === id && r.doneAt <= at)

// The study under way, if any.
export const researching = (k: Kingdom, at: number) => (k.researches ?? []).find((r) => r.doneAt > at) ?? null

const finished = (k: Kingdom, at: number) => (k.researches ?? []).filter((r) => r.doneAt <= at).map((r) => RESEARCH[r.id]).filter(Boolean)

// What all finished research adds up to, worked out once for each stretch between two studies' completion (see
// perSpan); read it, never change it.
const NONE: NonNullable<Kingdom['researches']> = []
const effects: SpanCache<ReturnType<typeof sumEffects>> = new WeakMap()
export const researchEffects = (k: Kingdom, at: number) => perSpan(effects, k.researches ?? NONE, at, () => sumEffects(k, at))

function sumEffects(k: Kingdom, at: number) {
  const out = {
    queue: 0,
    output: {} as Record<string, number>,
    sickness: 1,
    healing: 1,
    tax: 0,
    trade: 0,
    battle: 0,
    storage: 0,
    fortify: 0,
    trainSpeed: 0,
    upkeep: 0,
    happiness: 0,
    faith: 0,
    sermon: 0,
    counter: 0,
    diplomacy: 0,
  }
  for (const r of finished(k, at)) {
    out.queue += r.queue ?? 0
    for (const [kind, v] of Object.entries(r.output ?? {})) out.output[kind] = (out.output[kind] ?? 0) + v
    out.sickness *= r.sickness ?? 1
    out.healing *= r.healing ?? 1
    for (const key of ['tax', 'trade', 'battle', 'storage', 'fortify', 'trainSpeed', 'upkeep', 'happiness', 'faith', 'sermon', 'counter', 'diplomacy'] as const) {
      out[key] += r[key] ?? 0
    }
  }
  return out
}

// ---- Standing institutions ---------------------------------------------------------------------------------------

// The finished level of the kingdom's building of `kind` (0 without one; one being raised counts at the level below).
export function levelOf(k: Kingdom, kind: string, at: number) {
  const b = k.buildings.find((x) => x.kind === kind)
  if (!b) return 0
  const level = b.level ?? 1
  return b.doneAt <= at ? level : level - 1
}

const byLevel = (values: number[], level: number) => (level <= 0 ? 0 : values[Math.min(values.length - 1, level - 1)])

export const templeHappiness = (k: Kingdom, at: number) => byLevel(I.temple.happinessByLevel, levelOf(k, 'temple', at))

// What soldiers add to their rolls: faith from the temple (more with theology), what was learnt at the university, and
// the ruler's head for war (dynasty.ts).
export const battleSpirit = (k: Kingdom, at: number) => {
  const learnt = researchEffects(k, at)
  return byLevel(I.temple.faithByLevel, levelOf(k, 'temple', at)) * (1 + learnt.faith) + learnt.battle + dynastyEffects(k).dice
}

// The other study of the same tier of a branch (taking one closes the other).
export const rivalOf = (id: string) =>
  Object.keys(RESEARCH).find((other) => other !== id && RESEARCH[other].category === RESEARCH[id]?.category && RESEARCH[other].tier === RESEARCH[id]?.tier) ?? null

// Studies the kingdom has taken or is taking.
export const taken = (k: Kingdom, id: string) => (k.researches ?? []).some((r) => r.id === id)

// Whether the branch's tier below `id` has been learnt (either of its two studies).
export function tierOpen(k: Kingdom, id: string, at: number) {
  const spec = RESEARCH[id]
  if (!spec || spec.tier <= 1) return true
  return Object.entries(RESEARCH).some(([other, o]) => o.category === spec.category && o.tier === spec.tier - 1 && hasResearch(k, other, at))
}

// A sermon telling the people their taxes are good: while it lasts the tax weighs less on their mood.
export const preaching = (k: Kingdom, at: number) => (k.sermonUntil ?? 0) > at
export const sermonTaxFactor = (k: Kingdom, at: number) =>
  preaching(k, at) ? byLevel(I.temple.sermon.taxFactorByLevel, Math.max(1, levelOf(k, 'temple', at))) : 1
export const sermonReadyAt = (k: Kingdom) => (k.lastSermonAt ?? -Infinity) + I.temple.sermon.cooldownSeconds * 1000

export const hospitalHeal = (level: number) => byLevel(I.sickness.hospitalHealByLevel, level)

// ---- Fortunes: random events -------------------------------------------------------------------------------------

export interface FortuneSpec {
  weight: number
  // Output of goods (−0.3 = 30% less), the merchant's gold, the people's work.
  output?: Partial<Record<Good, number>>
  trade?: number
  work?: number
  // Happiness while it lasts (and more with a temple).
  happiness?: number
  templeHappiness?: number
  // How fast sickness spreads (a factor).
  sickSpread?: number
  // Once, when it begins: a share of the people falls ill, a share of the stores is lost, gold is found.
  sicken?: number
  lose?: Partial<Record<Good, number>>
  gold?: number
  // Only by day (scorching sun) or by night (a freezing cold): it begins then and ends with it at the latest.
  time?: 'day' | 'night'
}

// Two kinds of fortune (CLAUDE.md §9.8): weather and the world's events fall on the whole lobby at once (seeded by
// the lobby), the rest on one kingdom alone (seeded by the kingdom). Each has its own windows, at most one per window.
export type FortuneScope = 'lobby' | 'kingdom'
const TRACKS = { lobby: I.events.lobby, kingdom: I.events.kingdom } as Record<FortuneScope, { windowSeconds: number; chance: number; minSeconds: number; maxSeconds: number; kinds: Record<string, FortuneSpec> }>

export const FORTUNES: Record<string, FortuneSpec> = { ...TRACKS.lobby.kinds, ...TRACKS.kingdom.kinds }
export type FortuneKind = keyof typeof I.events.lobby.kinds | keyof typeof I.events.kingdom.kinds

export interface Fortune {
  kind: FortuneKind
  scope: FortuneScope
  start: number
  end: number
  spec: FortuneSpec
}

type Seeded = Pick<Kingdom, 'site' | 'foundedAt' | 'lobbyKey'> & Partial<Pick<Kingdom, 'responses'>>

function hash(...values: number[]) {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  return h >>> 0
}

// A number for a lobby's id, the seed of its shared fortunes (set on its kingdoms by the server).
export function lobbyKeyOf(id: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193)
  return (h >>> 0) & 0x7fffffff
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

const windowMs = (scope: FortuneScope) => TRACKS[scope].windowSeconds * 1000

// The fortune of window `index` on one track, wholly inside the window. It follows from the lobby (or the kingdom) and
// the window alone, so the server and every screen agree on it and nothing is stored.
export function fortuneIn(k: Seeded, index: number, scope: FortuneScope = 'kingdom'): Fortune | null {
  const e = TRACKS[scope]
  if (scope === 'lobby' && k.lobbyKey === undefined) return null
  const seed = scope === 'lobby' ? hash(k.lobbyKey!, index, 7) : hash(k.site.x, k.site.y, Math.floor((k.foundedAt ?? 0) / 1000), index)
  const r = random(seed)
  if (r() >= e.chance) return null
  const roll = r()
  const length = (e.minSeconds + r() * (e.maxSeconds - e.minSeconds)) * 1000
  const start = index * windowMs(scope) + Math.floor(r() * (windowMs(scope) - length))
  // Nothing befalls a kingdom before it was founded.
  if (start < (k.foundedAt ?? 0)) return null
  // Only the kinds that fit the time of day it begins at.
  const phase = isNightAt(start) ? 'night' : 'day'
  const kinds = Object.entries(e.kinds).filter(([, f]) => !f.time || f.time === phase)
  let pick = roll * kinds.reduce((sum, [, f]) => sum + f.weight, 0)
  let kind = kinds[0][0]
  for (const [name, f] of kinds) {
    pick -= f.weight
    kind = name
    if (pick < 0) break
  }
  const spec = e.kinds[kind]
  const end = spec.time ? Math.min(start + length, phaseEndsAt(start)) : start + length
  return { kind: kind as FortuneKind, scope, start, end, spec }
}

const SCOPES: FortuneScope[] = ['lobby', 'kingdom']

// The fortunes under way at `at` (one per track at most).
export function fortunesAt(k: Seeded, at: number): Fortune[] {
  return SCOPES.map((scope) => fortuneIn(k, Math.floor(at / windowMs(scope)), scope)).filter((f): f is Fortune => !!f && f.start <= at && at < f.end)
}

// ---- Crises: bad fortunes the lord can answer (CLAUDE.md §9.8) ------------------------------------------------------

const CRISIS = I.events.crisis
export type CrisisChoice = 'villagers' | 'army' | 'none'
export const isCrisis = (kind: string) => (CRISIS.kinds as string[]).includes(kind)
export const crisisKey = (f: Pick<Fortune, 'scope' | 'start'>) => `${f.scope}:${f.start}`
export const crisisDecideMs = () => CRISIS.decideSeconds * 1000
// Answered by sending the villagers or the army: the fortune's harm is warded off.
export const crisisWarded = (k: Seeded, f: Pick<Fortune, 'scope' | 'start'>) => {
  const choice = k.responses?.[crisisKey(f)]?.choice
  return choice === 'villagers' || choice === 'army'
}
// Soldiers lost to the army's answer: one, now and then two (from the crisis itself, so it is the same everywhere).
export const crisisArmyLoss = (key: string) => CRISIS.army.loss + (hash(...[...key].map((c) => c.charCodeAt(0)), 31) / 4294967296 < CRISIS.army.moreChance ? 1 : 0)

// Why the lord cannot answer crisis `key` that way now, if not.
export function crisisError(k: Seeded & Pick<Kingdom, 'units' | 'soldiers'>, key: string, choice: CrisisChoice, at: number): 'none' | 'answered' | 'late' | 'soldiers' | null {
  const f = fortunesAt(k, at).find((x) => crisisKey(x) === key)
  if (!f || !isCrisis(f.kind)) return 'none'
  if (k.responses?.[key]) return 'answered'
  if (at > f.start + crisisDecideMs()) return 'late'
  if (choice === 'army' && (k.soldiers ?? 0) < CRISIS.army.minSoldiers) return 'soldiers'
  return null
}

// Gives the answer: the villagers turned out (less work for a while), the garrison sent (a soldier or two lost, and no
// army led out for a while), or nothing done.
export function answerCrisis<K extends Seeded & Pick<Kingdom, 'units' | 'soldiers' | 'armyLockUntil'>>(k: K, key: string, choice: CrisisChoice, at: number, take: (units: K['units'], n: number) => K['units'], count: (units: K['units']) => number): K {
  if (crisisError(k, key, choice, at)) return k
  const keep = at - CRISIS.keepHours * 3_600_000
  const responses = Object.fromEntries(Object.entries(k.responses ?? {}).filter(([, r]) => r.at > keep))
  responses[key] = { choice, at }
  let next: K = { ...k, responses }
  if (choice === 'army') {
    const units = take(k.units, Math.min(k.soldiers ?? 0, crisisArmyLoss(key)))
    next = { ...next, units, soldiers: count(units), armyLockUntil: at + CRISIS.army.lockSeconds * 1000 }
  }
  return next
}

// What the fortunes under way add up to (a crisis warded off does nothing; villagers turned out work less a while).
export function fortuneEffects(k: Seeded, at: number) {
  const out = { output: {} as Partial<Record<Good, number>>, trade: 0, work: 0, happiness: 0, templeHappiness: 0, sickSpread: 1 }
  for (const r of Object.values(k.responses ?? {})) if (r.choice === 'villagers' && at >= r.at && at < r.at + CRISIS.villagers.seconds * 1000) out.work += CRISIS.villagers.work
  for (const f of fortunesAt(k, at)) {
    if (isCrisis(f.kind) && crisisWarded(k, f)) continue
    const { spec } = f
    for (const [g, v] of Object.entries(spec.output ?? {})) out.output[g as Good] = (out.output[g as Good] ?? 0) + (v ?? 0)
    out.trade += spec.trade ?? 0
    out.work += spec.work ?? 0
    out.happiness += spec.happiness ?? 0
    out.templeHappiness += spec.templeHappiness ?? 0
    out.sickSpread *= spec.sickSpread ?? 1
  }
  return out
}

// The fortunes that began in (from, to].
export function fortunesBegun(k: Seeded, from: number, to: number): Fortune[] {
  const out: Fortune[] = []
  for (const scope of SCOPES) {
    for (let i = Math.floor(from / windowMs(scope)); i <= Math.floor(to / windowMs(scope)); i++) {
      const f = fortuneIn(k, i, scope)
      if (f && f.start > from && f.start <= to) out.push(f)
    }
  }
  return out
}
