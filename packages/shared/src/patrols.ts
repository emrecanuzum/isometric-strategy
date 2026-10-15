import { balance } from './balance'
import type { Point } from './iso'
import { hash } from './worldgen'

// The crown kingdoms' patrols (CLAUDE.md §7.8): each crown sends a mounted patrol out of its capital, one errand every
// slot. A patrol rides to one of its own lords' palaces, stops at the house of entertainment, leaves a tip and rides
// home. Apart from the patrol, a rival crown's tribute collectors come to every lord sworn to the other crown at a
// steady pace and ask a fixed share of the treasury. Where and when follow from the lobby seed and the clock, so every
// screen shows the same patrols and the server settles the visits.

export const patrolSpec = () => balance.cities.crown.patrol
export const patrolSlotMs = () => patrolSpec().slotSeconds * 1000
export const patrolSlotAt = (at: number) => Math.floor(at / patrolSlotMs())

// When a patrol of slot `slot` sets out, reaches the lord, leaves and is home again.
export function patrolTimes(slot: number) {
  const ms = patrolSlotMs()
  const { out, stay } = patrolSpec()
  const start = slot * ms
  return { start, arrive: start + out * ms, leave: start + (out + stay) * ms, home: start + (2 * out + stay) * ms }
}

export interface Lord {
  id: number
  liege?: number | null
}

// The lord patrol `patrol` of crown `crown` visits in slot `slot`: one of the lords sworn to it, drawn from the seed;
// the crown's patrols never pick the same lord in one slot. Null when no lord is sworn to it yet.
export function patrolTarget(seed: number, crown: number, patrol: number, slot: number, lords: Lord[]): number | null {
  const sworn = lords.filter((l) => l.liege === crown).sort((a, b) => a.id - b.id)
  if (sworn.length === 0) return null
  if (patrol >= sworn.length) return null
  // Each patrol in turn draws a lord, stepping on past the ones its fellows have taken.
  const used: number[] = []
  for (let p = 0; p <= patrol; p++) {
    let index = Math.floor(hash(slot, crown * 16 + p, seed + 4001) * sworn.length)
    while (used.includes(index)) index = (index + 1) % sworn.length
    used.push(index)
  }
  return sworn[used[patrol]].id
}

// What a patrol does at a lord's: a tip from its own crown, tribute demanded by a rival one.
export const visitKind = (crown: number, liege: number | null | undefined) => (liege === crown ? 'tip' : 'tribute')

// A rival crown's tribute collectors: one visit to each lord sworn to another crown every tribute slot, always at the
// same point of the slot for that lord (drawn from the seed), so the demands come at a steady pace.
export const tributeSlotMs = () => patrolSpec().tribute.everySeconds * 1000
export const tributeSlotAt = (at: number) => Math.floor(at / tributeSlotMs())
export function tributeVisitAt(seed: number, crown: number, lord: number, slot: number) {
  // Within the first two thirds of the slot, so the time to answer ends well before the next demand.
  return slot * tributeSlotMs() + Math.floor(hash(lord, crown, seed + 4013) * (2 / 3) * tributeSlotMs())
}
// The crowns a lord pays tribute to: every crown but its own (none before fealty).
export const tributeCrowns = (crowns: number, liege: number | null | undefined) =>
  liege === undefined || liege === null ? [] : Array.from({ length: crowns }, (_, i) => i).filter((c) => c !== liege)

// The tribute demanded of a lord with `gold` in the treasury: a fixed share of it.
export const tributeDemand = (gold: number) => Math.floor(Math.max(0, gold) * patrolSpec().tribute.share)

// Where a crown's patrols ride out from: just outside the capital's front wall.
export const capitalGate = (city: Point): Point => ({ x: city.x + balance.cities.size / 2, y: city.y + balance.cities.size + 1.5 })
