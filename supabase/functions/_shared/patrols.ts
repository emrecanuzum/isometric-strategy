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
  // Each crown's share of the power its lords give it (crowns.ts): a strong crown asks more, and gives more.
  const { share } = game.crownPower(rows.filter((r) => r.state).map((r) => ({ liege: r.state.liege, score: game.scoreOf(r.state, now).total })), world.cities.length)
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
        const power = game.balance.cities.crown.power
        const favour = game.byPower(share[crown] ?? 0.5, power.favour)
        // A rival crown asks less of a lord it is on good terms with, and more the stronger it is.
        const ease = 1 - (Math.max(0, game.crownRelation(settled, crown)) / 100) * game.balance.cities.crown.relation.tributeEase
        const amount =
          kind === 'tribute'
            ? Math.round(game.tributeDemand(settled.stock?.gold ?? 0) * ease * game.byPower(share[crown] ?? 0.5, power.demand))
            : tip
              ? Math.round(spec.tip * favour)
              : 0
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
        } else {
          // Its own crown's patrol: the tip at the house of entertainment, and a gift once the crown thinks well enough
          // of the lord (more from a strong crown); the visit itself warms the crown a little.
          const gift = game.giftAt(game.crownRelation(settled, crown))
          const goods: Record<string, number> = {}
          for (const [g, v] of Object.entries(gift?.goods ?? {})) goods[g] = Math.round((v as number) * favour)
          const giftGold = gift ? Math.round(gift.gold * favour) : 0
          await mutateKingdom(target, arrive, (k) => {
            const stock = { ...k.stock, gold: k.stock.gold + amount + giftGold }
            for (const [g, v] of Object.entries(goods)) stock[g] = (stock[g] ?? 0) + v
            return game.changeCrownRelation({ ...k, stock }, crown, game.balance.cities.crown.relation.visit)
          })
          if (tip) await notify(lobby, [target], 'patrol_tip', { crown, amount }, arrive)
          if (gift) await notify(lobby, [target], 'crown_gift', { crown, name: gift.name, gold: giftGold, goods }, arrive)
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
    // Taken, not given: the crown thinks the less of the lord for it.
    return game.changeCrownRelation({ ...k, stock: { ...k.stock, gold: k.stock.gold - taken } }, crown, game.balance.cities.crown.relation.tributeTaken)
  })
  await notify(lobby, [kingdom], 'patrol_taken', { crown, amount: taken }, at)
}
