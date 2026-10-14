// The crown kingdoms' patrols on the server (CLAUDE.md §7.8): each visit is settled once, when the patrol reaches the
// lord: a tip at the house of entertainment from its own crown, a demand for tribute from a rival one (paid or
// refused by the lord; left unanswered, as by a lord who is away, the patrol takes it all the same).

import * as game from './game.js'
import { admin, changeRelation, iso, ms, mutateKingdom, notify } from './server.ts'
import type { Kingdom, LobbyWorld, Row } from './server.ts'

export interface VisitRow {
  id: number
  lobby_id: string
  crown: number
  patrol: number
  slot: number
  kingdom_id: number
  kind: 'tip' | 'tribute' | 'visit'
  amount: number
  status: 'done' | 'pending' | 'paid' | 'refused' | 'expired'
  visit_at: string
  expires_at: string | null
}

const hasTavern = (state: Kingdom, at: number) =>
  (state?.buildings ?? []).some((b: { kind: string; doneAt: number }) => b.kind === 'tavern' && b.doneAt <= at)

// A refused (or ignored) demand: the crown's lords hold it against the lord.
export async function refuseDemand(visit: VisitRow, rows: Row[], at: number) {
  const spec = game.patrolSpec()
  const lords = rows.filter((r) => r.id !== visit.kingdom_id && r.state?.liege === visit.crown)
  for (const lord of lords) await changeRelation(visit.lobby_id, visit.kingdom_id, lord.id, spec.refuseRelation, at)
}

export async function settlePatrols(lobby: string, world: LobbyWorld, rows: Row[], now: number) {
  if (world.cities.length === 0) return
  const { data: info } = await admin.from('lobbies').select('seed').eq('id', lobby).single()
  if (!info) return
  const spec = game.patrolSpec()
  const lords = rows.filter((r) => r.state).map((r) => ({ id: r.id, liege: r.state.liege }))
  const current = game.patrolSlotAt(now)
  for (const slot of [current - 1, current]) {
    const { arrive } = game.patrolTimes(slot)
    if (arrive > now) continue
    for (let crown = 0; crown < world.cities.length; crown++) {
      for (let patrol = 0; patrol < spec.perCrown; patrol++) {
        const target = game.patrolTarget(info.seed, crown, patrol, slot, lords)
        if (target === null) continue
        const row = rows.find((r) => r.id === target)
        if (!row?.state) continue
        // A demand whose time to answer had already run out when it was first seen (the server was away) is taken at
        // once, without asking.
        const late = arrive + spec.answerSeconds * 1000 <= now
        const kind = game.visitKind(crown, row.state.liege)
        const settled = game.advance(row.state, arrive).kingdom
        const tip = kind === 'tip' && hasTavern(settled, arrive)
        const amount = kind === 'tribute' ? game.tributeDemand(settled.stock?.gold ?? 0) : tip ? spec.tip : 0
        // Settled once: only the run that writes the visit acts on it.
        const { data: written } = await admin
          .from('patrol_visits')
          .upsert(
            {
              lobby_id: lobby,
              crown,
              patrol,
              slot,
              kingdom_id: target,
              kind: kind === 'tribute' ? 'tribute' : tip ? 'tip' : 'visit',
              amount,
              status: kind === 'tribute' && !late ? 'pending' : 'done',
              visit_at: iso(arrive),
              expires_at: kind === 'tribute' ? iso(arrive + spec.answerSeconds * 1000) : null,
            },
            { onConflict: 'lobby_id,crown,patrol,slot', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()
        if (!written) continue
        if (kind === 'tribute' && late) {
          await takeTribute(lobby, target, crown, amount, arrive + spec.answerSeconds * 1000)
        } else if (kind === 'tribute') {
          const gold = Math.round(settled.stock?.gold ?? 0)
          await notify(lobby, [target], 'patrol_tribute', { visit: written.id, crown, amount, gold, expiresAt: arrive + spec.answerSeconds * 1000 }, arrive)
        } else if (tip) {
          await mutateKingdom(target, arrive, (k) => ({ ...k, stock: { ...k.stock, gold: k.stock.gold + amount } }))
          await notify(lobby, [target], 'patrol_tip', { crown, amount }, arrive)
        }
      }
    }
  }
  // Demands left unanswered: the patrol takes the tribute anyway.
  const { data: lapsed } = await admin
    .from('patrol_visits')
    .update({ status: 'expired' })
    .eq('lobby_id', lobby)
    .eq('status', 'pending')
    .lte('expires_at', iso(now))
    .select('*')
  for (const visit of (lapsed ?? []) as VisitRow[]) await takeTribute(lobby, visit.kingdom_id, visit.crown, visit.amount, ms(visit.expires_at))
}

// A demand nobody answered: the patrol carries off the tribute (as much as the treasury holds).
async function takeTribute(lobby: string, kingdom: number, crown: number, amount: number, at: number) {
  let taken = 0
  await mutateKingdom(kingdom, at, (k) => {
    taken = Math.min(amount, Math.max(0, Math.floor(k.stock.gold)))
    return { ...k, stock: { ...k.stock, gold: k.stock.gold - taken } }
  })
  await notify(lobby, [kingdom], 'patrol_taken', { crown, amount: taken }, at)
}
