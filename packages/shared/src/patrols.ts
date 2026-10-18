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
// A lord's own crown's patrol near his palace: from shortly before it pulls up until shortly after it rides off, in
// every patrol slot from `from` to `to` that it calls on him (CLAUDE.md §7.8).
function patrolStays(seed: number, liege: number, lord: number, from: number, to: number, lords: Lord[]) {
  const near = patrolSpec().tribute.clearSeconds * 1000
  const out: [number, number][] = []
  for (let slot = patrolSlotAt(from) - 1; slot <= patrolSlotAt(to) + 1; slot++) {
    for (let p = 0; p < patrolSpec().perCrown; p++) {
      if (patrolTarget(seed, liege, p, slot, lords) !== lord) continue
      const { arrive, leave } = patrolTimes(slot)
      out.push([arrive - near, leave + near])
    }
  }
  return out
}

// When crown `crown`'s collectors reach lord `lord` in tribute slot `slot`: a point of the slot drawn from the seed,
// within its first two thirds (so the time to answer ends well before the next demand), moved on in small steps until
// their stay at the gate (with the end of the ride in and the start of the ride home) keeps clear of the lord's own
// crown's patrol and of the other rival crowns' collectors, so two crowns' soldiers never stand at one palace together.
// Needs the lords (with their liege) and the number of crowns, as patrolTarget does, so server and screens agree.
export function tributeVisitAt(seed: number, crown: number, lord: number, slot: number, lords: Lord[], crowns: number): number {
  const ms = tributeSlotMs()
  const span = Math.floor((2 / 3) * ms)
  const start = slot * ms
  const base = Math.floor(hash(lord, crown, seed + 4013) * span)
  const spec = patrolSpec()
  const near = spec.tribute.clearSeconds * 1000
  const margin = spec.tribute.marginSeconds * 1000
  const step = Math.max(1000, spec.tribute.stepSeconds * 1000)
  const wait = spec.answerSeconds * 1000
  const liege = lords.find((l) => l.id === lord)?.liege
  const busy = liege === undefined || liege === null ? [] : patrolStays(seed, liege, lord, start - wait - near - margin, start + span + wait + near + margin, lords)
  // The rival crowns before this one have their places already.
  for (const other of tributeCrowns(crowns, liege)) {
    if (other >= crown) continue
    const at = tributeVisitAt(seed, other, lord, slot, lords, crowns)
    busy.push([at - near, at + wait + near])
  }
  if (busy.length === 0) return start + base
  const clash = (at: number) => busy.reduce((sum, [lo, hi]) => sum + Math.max(0, Math.min(hi, at + wait + near + margin) - Math.max(lo, at - near - margin)), 0)
  // The first clear point on from the drawn one (round the slot's span); with none clear, the least crowded.
  let best = base
  let least = Infinity
  for (let i = 0; i * step < span; i++) {
    const offset = (base + i * step) % span
    const c = clash(start + offset)
    if (c === 0) return start + offset
    if (c < least) [least, best] = [c, offset]
  }
  return start + best
}
// The crowns a lord pays tribute to: every crown but its own (none before fealty).
export const tributeCrowns = (crowns: number, liege: number | null | undefined) =>
  liege === undefined || liege === null ? [] : Array.from({ length: crowns }, (_, i) => i).filter((c) => c !== liege)

// A demand left unanswered is paid all the same. A lord who had the game open (seen within onlineMinutes of the
// demand running out) but let it pass pays it with a surcharge; one who was away pays the plain tribute, no harm done.
// Seen only well after the demand ran out (the server settled it late), the lord is not taken to have let it pass
// while playing: what he did at that moment is not known, so no surcharge.
export function unansweredTribute(amount: number, lastSeenAt: number | undefined, at: number) {
  const t = patrolSpec().tribute
  const seen = lastSeenAt ?? 0
  const afk = seen >= at - t.onlineMinutes * 60_000 && seen <= at + t.lateSeenSeconds * 1000
  return { afk, amount: afk ? Math.round(amount * t.afkFactor) : amount }
}

// The tribute demanded of a lord with `gold` in the treasury: a fixed share of it, tilted by the asking crown's ruler
// (`factor`: the reigning ruler's trait, crownHouse.ts → crownTraitAt).
// What the rival crown's collectors ask: a share of the treasury, never less than a floor (all there is, if the
// treasury holds less), so the crowns cost a lord more than they give (CLAUDE.md §7.8).
export const tributeDemand = (gold: number, factor = 1) => {
  const t = patrolSpec().tribute
  const have = Math.max(0, gold)
  return Math.floor(Math.min(have, Math.max(have * t.share, t.min) * factor))
}

// Where a crown's patrols ride out from: just outside the capital's front wall.
export const capitalGate = (city: Point): Point => ({ x: city.x + balance.cities.size / 2, y: city.y + balance.cities.size + 1.5 })
