// The crown kingdoms' patrols on the server (CLAUDE.md §7.8): each visit is settled once, when it reaches the lord: a
// tip at the house of entertainment from its own crown's patrol, and every tribute slot a demand from each rival
// crown's collectors (paid or refused by the lord; left unanswered, as by a lord who is away, it is taken all the same).

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
  // The word had with the collectors' captain (CLAUDE.md §7.8), once: the replies, what it did to the demand.
  talk?: { replies: number[]; factor: number; angry: boolean; asked: number } | null
}

const hasTavern = (state: Kingdom, at: number) =>
  (state?.buildings ?? []).some((b: { kind: string; doneAt: number }) => b.kind === 'tavern' && b.doneAt <= at)

// A refused (or ignored) demand: the crown's lords hold it against the lord.
export async function refuseDemand(visit: VisitRow, rows: Row[], at: number) {
  const spec = game.patrolSpec()
  // A captain sent off in anger tells his lords all about it.
  const angry = visit.talk?.angry ? spec.tribute.talk.angryRefuseFactor : 1
  const lords = rows.filter((r) => r.id !== visit.kingdom_id && r.state?.liege === visit.crown)
  for (const lord of lords) await changeRelation(visit.lobby_id, visit.kingdom_id, lord.id, Math.round(spec.refuseRelation * angry), at)
}

export async function settlePatrols(lobby: string, world: LobbyWorld, rows: Row[], now: number) {
  if (world.cities.length === 0) return
  const { data: info } = await admin.from('lobbies').select('seed').eq('id', lobby).single()
  if (!info) return
  const spec = game.patrolSpec()
  const lords = rows.filter((r) => r.state).map((r) => ({ id: r.id, liege: r.state.liege }))
  // Each crown's share of the power its lords give it (crowns.ts): a strong crown gives its lords more.
  const { share } = game.crownPower(rows.filter((r) => r.state).map((r) => ({ liege: r.state.liege, score: game.scoreOf(r.state, now).total })), world.cities.length)
  // Writes a visit once: only the run that writes it acts on it.
  const claim = async (visit: Omit<VisitRow, 'id' | 'lobby_id'>) => {
    const { data } = await admin
      .from('patrol_visits')
      .upsert({ lobby_id: lobby, ...visit }, { onConflict: 'lobby_id,crown,patrol,slot,kingdom_id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle()
    return data as { id: number } | null
  }

  // The patrols: each rides to one of its own crown's lords, drinks at the house of entertainment and leaves a tip,
  // with a gift once the crown thinks well enough of the lord (more from a strong crown); the visit itself warms the
  // crown a little.
  const current = game.patrolSlotAt(now)
  for (const slot of [current - 1, current]) {
    const { arrive } = game.patrolTimes(slot)
    if (arrive > now) continue
    for (let crown = 0; crown < world.cities.length; crown++) {
      for (let patrol = 0; patrol < spec.perCrown; patrol++) {
        const target = game.patrolTarget(info.seed, crown, patrol, slot, lords)
        if (target === null) continue
        const row = rows.find((r) => r.id === target)
        // A lord sworn only after the patrol arrived is not visited for it (no gift for the time before fealty).
        if (!row?.state || arrive < (row.state.liegeAt ?? 0)) continue
        const settled = game.advance(row.state, arrive).kingdom
        const tip = hasTavern(settled, arrive)
        const favour = game.byPower(share[crown] ?? 0.5, game.balance.cities.crown.power.favour)
        // A brother of the lord at the patrol's head: a bigger tip, a warmer crown (CLAUDE.md §9.1.1).
        const kin = game.patrolFavour(settled)
        // The reigning ruler's ways and the crowns' rivalry: a generous ruler, a crown at war tips more (CLAUDE.md §7.8).
        const ways = game.crownWays(row.state, crown, arrive)
        const amount = tip ? Math.round(spec.tip * favour * kin.tip * ways.tip) : 0
        const written = await claim({ crown, patrol, slot, kingdom_id: target, kind: tip ? 'tip' : 'visit', amount, status: 'done', visit_at: iso(arrive), expires_at: null })
        if (!written) continue
        const gift = game.giftAt(game.crownRelation(settled, crown))
        const goods: Record<string, number> = {}
        for (const [g, v] of Object.entries(gift?.goods ?? {})) goods[g] = Math.round((v as number) * favour)
        const giftGold = gift ? Math.round(gift.gold * favour) : 0
        await mutateKingdom(target, arrive, (k) => {
          const stock = { ...k.stock, gold: k.stock.gold + amount + giftGold }
          for (const [g, v] of Object.entries(goods)) stock[g] = (stock[g] ?? 0) + v
          return game.book(game.changeCrownRelation({ ...k, stock }, crown, game.balance.cities.crown.relation.visit + kin.relation), { crownGot: amount + giftGold })
        })
        if (tip) await notify(lobby, [target], 'patrol_tip', { crown, amount }, arrive)
        if (gift) await notify(lobby, [target], 'crown_gift', { crown, name: gift.name, gold: giftGold, goods }, arrive)
        // With neither a tip nor a gift, the patrol still says it came (no lord sees soldiers at his gate in silence).
        if (!tip && !gift) await notify(lobby, [target], 'patrol_visit', { crown, relation: game.balance.cities.crown.relation.visit + kin.relation }, arrive)
      }
    }
  }

  // Tribute: every lord sworn to a crown is called on by each rival crown's collectors once a tribute slot, and asked
  // a fixed share of the treasury as it stands (CLAUDE.md §7.8).
  const tributeSlot = game.tributeSlotAt(now)
  for (const slot of [tributeSlot - 1, tributeSlot]) {
    for (const row of rows) {
      if (!row.state) continue
      for (const crown of game.tributeCrowns(world.cities.length, row.state.liege)) {
        const arrive = game.tributeVisitAt(info.seed, crown, row.id, slot, lords, world.cities.length)
        // A demand missed long ago (the server was away for a while) is let go rather than taken out of the blue.
        if (arrive > now || arrive < now - (spec.answerSeconds + 180) * 1000 || arrive < (row.state.liegeAt ?? 0)) continue
        const expires = arrive + spec.answerSeconds * 1000
        // A demand whose time to answer had already run out when it was first seen (the server was away) is taken at
        // once, without asking.
        const late = expires <= now
        const gold = Math.floor(game.advance(row.state, arrive).kingdom.stock?.gold ?? 0)
        const amount = game.tributeDemand(gold, game.crownWays(row.state, crown, arrive).tribute)
        if (amount < 1) continue
        const written = await claim({ crown, patrol: -1, slot, kingdom_id: row.id, kind: 'tribute', amount, status: late ? 'done' : 'pending', visit_at: iso(arrive), expires_at: iso(expires) })
        if (!written) continue
        if (late) await takeTribute(lobby, row.id, crown, amount, expires, false)
        else await notify(lobby, [row.id], 'patrol_tribute', { visit: written.id, crown, amount, gold, expiresAt: expires }, arrive)
      }
    }
  }

  // Demands left unanswered: the collectors take the tribute anyway.
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
// A demand nobody answered is paid all the same (as much as the treasury holds): the plain tribute by a lord who was
// away, with a surcharge by one who had the game open and let it pass. The crown holds neither against the lord.
// A demand that was never put to the lord (first seen after its time to answer had run out) carries no surcharge.
async function takeTribute(lobby: string, kingdom: number, crown: number, amount: number, at: number, asked = true) {
  let taken = 0
  let afk = false
  await mutateKingdom(kingdom, at, (k) => {
    const due = asked ? game.unansweredTribute(amount, k.lastSeenAt, at) : { amount, afk: false }
    afk = due.afk
    taken = Math.min(due.amount, Math.max(0, Math.floor(k.stock.gold)))
    return game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold - taken } }, { crownPaid: taken })
  })
  await notify(lobby, [kingdom], 'patrol_taken', { crown, amount: taken, afk, asked: amount }, at)
}
