import { balance } from './balance'
import type { Point } from './iso'
import { hash } from './worldgen'

// The crown kingdoms' patrols (CLAUDE.md §7.8): each crown sends a couple of mounted patrols out of its capital, one
// errand every slot. A patrol rides to a sworn lord's palace, stays a while and rides home. At its own crown's lords
// it stops at the house of entertainment and leaves a tip; at a rival crown's lords it demands tribute. Where and when
// follow from the lobby seed and the clock, so every screen shows the same patrols and the server settles the visits.

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

// The lord patrol `patrol` of crown `crown` visits in slot `slot`: one of the sworn lords, drawn from the seed; the
// crown's patrols never pick the same lord in one slot. Null when no lord is sworn yet.
export function patrolTarget(seed: number, crown: number, patrol: number, slot: number, lords: Lord[]): number | null {
  const sworn = lords.filter((l) => l.liege !== undefined && l.liege !== null).sort((a, b) => a.id - b.id)
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

// The tribute a rival crown's patrol demands of a lord with `gold` in his treasury.
export function tributeDemand(gold: number) {
  const t = patrolSpec().tribute
  return Math.round(Math.min(t.max, Math.max(t.min, gold * t.share)))
}

// Where a crown's patrols ride out from: just outside the capital's front wall.
export const capitalGate = (city: Point): Point => ({ x: city.x + balance.cities.size / 2, y: city.y + balance.cities.size + 1.5 })
