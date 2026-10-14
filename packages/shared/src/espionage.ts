import { balance } from './balance'
import { researchEffects } from './institutions'
import type { Kingdom } from './economy'
import { mulberry32 } from './worldgen'

// Spies (CLAUDE.md §9.7). A spy sent to a kingdom builds a network on one topic; its strength grows while the spy
// stays, more slowly against a kingdom that keeps spies at home. When the spy will be caught is drawn when it sets
// out, from the target's counter-espionage at that moment, so nothing needs watching meanwhile.

export type SpyTopic = 'stores' | 'army' | 'diplomacy'
export const SPY_TOPICS: SpyTopic[] = ['stores', 'army', 'diplomacy']

export interface SpyMission {
  id: number
  owner_id: number
  target_id: number
  topic: SpyTopic
  started_at: string
  ended_at: string | null
  caught_at: string | null
  end_reason?: string | null
}

// A kingdom's counter-espionage: its spies at home and its spy house.
export function counterOf(kingdom: Kingdom) {
  const e = balance.espionage
  const house = kingdom.buildings.find((b) => b.kind === 'spyHouse')
  // A spy school learnt at the university adds to it (as of the kingdom's last settling).
  return (kingdom.spies ?? 0) * e.counterPerSpy + (house ? (house.level ?? 1) * e.counterPerLevel : 0) + researchEffects(kingdom, kingdom.settledAt).counter
}

// A kingdom that dislikes the spy's master watches its people closely: against a bad relation the network grows more
// slowly and spies are caught sooner, as if more counter-espionage stood against them.
export const wariness = (relation: number) => (Math.max(0, -relation) / 100) * balance.espionage.warinessCounter

// How fast a kingdom's spies build their networks abroad: its spy house trains them better with every level (×1 at
// the first, networkSpeedPerLevel more with each one above).
export function networkSpeed(kingdom: Pick<Kingdom, 'buildings'>) {
  const house = kingdom.buildings.find((b) => b.kind === 'spyHouse')
  return 1 + Math.max(0, (house?.level ?? 1) - 1) * balance.espionage.networkSpeedPerLevel
}

// Network strength (0..100) after `ms` with `spies` on the topic against `counter`, built at `speed`.
export function networkStrength(ms: number, spies: number, counter: number, speed = 1) {
  if (spies <= 0 || ms <= 0) return 0
  const tau = (balance.espionage.networkSeconds * 1000 * (1 + counter)) / (spies * speed)
  return 100 * (1 - Math.exp(-ms / tau))
}

// Strength of the owner's network in a target on a topic at `now`, from the missions still running there (`speed`: the
// owner's, see networkSpeed).
export function strengthOf(missions: SpyMission[], owner: number, target: number, topic: SpyTopic, counter: number, now: number, speed = 1) {
  const running = missions.filter(
    (m) => m.owner_id === owner && m.target_id === target && m.topic === topic && !m.ended_at && (!m.caught_at || Date.parse(m.caught_at) > now),
  )
  if (running.length === 0) return 0
  const since = Math.min(...running.map((m) => Date.parse(m.started_at)))
  return networkStrength(now - since, running.length, counter, speed)
}

// When a spy setting out now would be caught, or null if never (no counter-espionage).
export function catchTime(seed: number, counter: number, start: number) {
  const rate = (balance.espionage.catchPerHourPerCounter * counter) / 3_600_000
  if (rate <= 0) return null
  const u = mulberry32(seed)()
  return start + Math.round(-Math.log(1 - u * 0.999999) / rate)
}

export interface Estimate {
  lo: number
  hi: number
}

// A range around `value` that gets narrower as the network grows; it always holds the true value and does not change
// within an hour, so asking again tells nothing new. Null below the minimum strength.
export function estimate(value: number, strength: number, seed: number, now: number): Estimate | null {
  const e = balance.espionage
  if (strength < e.minStrength) return null
  const error = e.maxError * (1 - strength / 100)
  const random = mulberry32(seed * 7919 + Math.floor(now / 3_600_000))
  const below = error * random()
  const above = error - below
  return { lo: Math.max(0, Math.floor(value * (1 - below))), hi: Math.ceil(value * (1 + above)) }
}

// ---- Operations (CK-like) -------------------------------------------------------------------------------------------

// Done through a network already built in the target, the strongest on any topic: sabotage at 50, carrying off the
// queen at 70, inciting a revolt at 90. Each costs gold; a failed one loses the spy and reveals who sent it.
export type Operation = 'burn' | 'delay' | 'kidnap' | 'revolt'
export const OPERATIONS: Operation[] = ['burn', 'delay', 'kidnap', 'revolt']

export const operationSpec = (op: Operation) => {
  const o = balance.espionage.operations
  return op === 'burn' || op === 'delay' ? o.sabotage : o[op]
}

export function operationChance(op: Operation, strength: number, counter: number) {
  const o = balance.espionage.operations
  const chance = o.baseChance + (strength - operationSpec(op).minStrength) * o.chancePerPoint - counter * o.counterPenalty
  return Math.max(o.minChance, Math.min(o.maxChance, chance))
}

export type OperationError = 'strength' | 'queen' | 'cost'

export function operationError(op: Operation, strength: number, owner: Kingdom, target: Kingdom): OperationError | null {
  const spec = operationSpec(op)
  if (strength < spec.minStrength) return 'strength'
  if (op === 'kidnap' && !target.queen) return 'queen'
  if (owner.stock.gold < (spec.cost.gold ?? 0)) return 'cost'
  return null
}

// The strongest network the owner has in the target, on any topic.
export const bestStrength = (missions: SpyMission[], owner: number, target: number, counter: number, now: number, speed = 1) =>
  Math.max(0, ...SPY_TOPICS.map((t) => strengthOf(missions, owner, target, t, counter, now, speed)))
