import { balance } from './balance'
import type { Fighter } from './military'

// Relations between kingdoms (CLAUDE.md §9.7). A pair's value is stored with the moment it was set and drifts back
// toward 0 as time passes, so nothing has to be written while the kingdoms leave each other alone.

export interface Relation {
  a: number
  b: number
  value: number
  // ISO time the value was set.
  at: string
  improved_at?: string | null
}

export type PactKind = 'tribute' | 'alliance' | 'war'

export interface Pact {
  id: number
  kind: PactKind
  // Tribute: `from` receives, `to` pays. Alliance: `from` proposed. War: `from` declared.
  from_id: number
  to_id: number
  gold: number | null
  started_at: string
  ended_at: string | null
}

export type EnvoyKind = 'improve' | 'gift' | 'tribute' | 'alliance' | 'peace'

// What a peace offer asks: nothing, gold from the other side, a tribute from it, or gold given to it.
export type PeaceTerms = { kind: 'white' } | { kind: 'gold'; gold: number } | { kind: 'tribute'; gold: number } | { kind: 'offer'; gold: number }

export interface Envoy {
  id: number
  from_id: number
  to_id: number
  kind: EnvoyKind
  gold: number | null
  terms?: PeaceTerms | null
  sent_at: string
  arrive_at: string
  expires_at: string | null
  status: 'traveling' | 'pending' | 'accepted' | 'rejected' | 'expired' | 'done'
}

export const pairOf = (x: number, y: number) => (x < y ? { a: x, b: y } : { a: y, b: x })

export const clampRelation = (v: number) => Math.max(-100, Math.min(100, v))

// The value at `now`, drifted toward 0 since it was set.
export function relationAt(value: number, setAt: number, now: number) {
  const drift = (balance.diplomacy.driftPerHour * Math.max(0, now - setAt)) / 3_600_000
  return value > 0 ? Math.max(0, value - drift) : Math.min(0, value + drift)
}

export function relationBetween(relations: Relation[], x: number, y: number, now: number) {
  const { a, b } = pairOf(x, y)
  const r = relations.find((r) => r.a === a && r.b === b)
  return r ? relationAt(r.value, Date.parse(r.at), now) : 0
}

const active = (p: Pact) => p.ended_at === null
const between = (p: Pact, x: number, y: number) => (p.from_id === x && p.to_id === y) || (p.from_id === y && p.to_id === x)

export const atWar = (pacts: Pact[], x: number, y: number) => pacts.some((p) => active(p) && p.kind === 'war' && between(p, x, y))
export const allied = (pacts: Pact[], x: number, y: number) => pacts.some((p) => active(p) && p.kind === 'alliance' && between(p, x, y))
export const alliesOf = (pacts: Pact[], x: number) =>
  pacts.filter((p) => active(p) && p.kind === 'alliance' && (p.from_id === x || p.to_id === x)).map((p) => (p.from_id === x ? p.to_id : p.from_id))
export const enemiesOf = (pacts: Pact[], x: number) =>
  pacts.filter((p) => active(p) && p.kind === 'war' && (p.from_id === x || p.to_id === x)).map((p) => (p.from_id === x ? p.to_id : p.from_id))
export const tributeBetween = (pacts: Pact[], receiver: number, payer: number) =>
  pacts.find((p) => active(p) && p.kind === 'tribute' && p.from_id === receiver && p.to_id === payer) ?? null

// Why a diplomatic step cannot be taken now, if it cannot.
export type DiplomacyError = 'self' | 'relation' | 'already' | 'war' | 'cooldown' | 'gold' | 'none'

// A casus belli: a grievance that lets one kingdom declare war on another without the world turning against it.
export interface Claim {
  holder_id: number
  target_id: number
  reason: 'spy' | 'tribute' | 'renege' | 'alliance' | 'kidnap' | 'sabotage'
  expires_at: string
}

export const hasClaim = (claims: Claim[], holder: number, target: number, now: number) =>
  claims.some((c) => c.holder_id === holder && c.target_id === target && Date.parse(c.expires_at) > now)

// The relation a war needs: anything below zero with a claim, deep enmity without one.
export const warThreshold = (claim: boolean) => (claim ? balance.diplomacy.casusBelli.maxRelation : balance.diplomacy.war.maxRelation)

export function proposalError(kind: EnvoyKind | 'war', relation: number, pacts: Pact[], me: number, other: number, claim = false): DiplomacyError | null {
  const d = balance.diplomacy
  if (me === other) return 'self'
  if (kind === 'alliance') {
    if (allied(pacts, me, other)) return 'already'
    if (atWar(pacts, me, other)) return 'war'
    if (relation < d.alliance.minRelation) return 'relation'
  }
  if (kind === 'war') {
    if (atWar(pacts, me, other)) return 'already'
    if (allied(pacts, me, other)) return 'already'
    if (relation > warThreshold(claim)) return 'relation'
  }
  if (kind === 'peace' && !atWar(pacts, me, other)) return 'none'
  // At war, envoys bring only peace.
  if ((kind === 'improve' || kind === 'gift' || kind === 'tribute') && atWar(pacts, me, other)) return 'war'
  if (kind === 'tribute' && (tributeBetween(pacts, me, other) || allied(pacts, me, other))) return 'already'
  return null
}

// ---- War score and peace (EU4-like) ---------------------------------------------------------------------------------

export interface BattleRecord {
  kind: 'field' | 'siege'
  started_at: string
  besieged: number | null
  attackers: Fighter[]
  defenders: Fighter[]
  resolved: boolean
  plan: { winner: 'attackers' | 'defenders'; attackerLosses: number[]; defenderLosses: number[] }
}

// How the war between `me` and `enemy` stands for `me` (−100..100): battles won and lost between the two since the
// war began, the soldiers each side lost there, and palaces taken.
export function warScore(battles: BattleRecord[], war: Pact, me: number, enemy: number) {
  const w = balance.diplomacy.warScore
  const since = Date.parse(war.started_at)
  let score = 0
  for (const b of battles) {
    if (!b.resolved || Date.parse(b.started_at) < since) continue
    const mineA = b.attackers.some((f) => f.kingdom === me)
    const mineD = b.defenders.some((f) => f.kingdom === me)
    const theirsA = b.attackers.some((f) => f.kingdom === enemy)
    const theirsD = b.defenders.some((f) => f.kingdom === enemy)
    if (!((mineA && theirsD) || (mineD && theirsA))) continue
    const mySide = mineA ? 'attackers' : 'defenders'
    const won = b.plan.winner === mySide
    const lost = (side: Fighter[], losses: number[], k: number) => side.reduce((n, f, i) => n + (f.kingdom === k ? (losses[i] ?? 0) : 0), 0)
    const myLosses = lost(b.attackers, b.plan.attackerLosses, me) + lost(b.defenders, b.plan.defenderLosses, me)
    const theirLosses = lost(b.attackers, b.plan.attackerLosses, enemy) + lost(b.defenders, b.plan.defenderLosses, enemy)
    score += (won ? w.battle : -w.battle) + w.perKill * (theirLosses - myLosses)
    if (b.kind === 'siege' && b.besieged === enemy && won) score += w.siege
    if (b.kind === 'siege' && b.besieged === me && !won) score -= w.siege
  }
  return Math.max(-w.max, Math.min(w.max, Math.round(score)))
}

export type PeaceError = 'score' | 'gold' | 'terms'

// Whether a side with this war score may ask for these terms.
export function peaceTermsError(terms: PeaceTerms, score: number): PeaceError | null {
  const p = balance.diplomacy.peace
  if (terms.kind === 'white' || terms.kind === 'offer') return null
  if (!(terms.gold > 0)) return 'terms'
  if (terms.kind === 'gold' && score < terms.gold / p.goldPerScore) return 'score'
  if (terms.kind === 'tribute' && (score < p.tributeMinScore || terms.gold > balance.diplomacy.tribute.maxGold)) return 'score'
  return null
}

// A side that has crushed the other dictates the peace: it is accepted on arrival.
export const enforcedPeace = (score: number) => score >= balance.diplomacy.peace.enforceScore
