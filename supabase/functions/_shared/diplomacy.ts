// Envoys and what they bring about (CLAUDE.md §9.7), and the spy reports a kingdom's networks allow. Used by the
// `command` function (answers, intel) and the `tick` function (arrivals, expiries).

import * as game from './game.js'
import { admin, changeRelation, grantClaim, iso, loadKingdoms, lobbyMarket, ms, mutateKingdom, nameOf, notify, pactsOf, relationOf, reputationOf, counterAgainst, scoreOf, setRelation, syncWarFlags } from './server.ts'
import type { Row } from './server.ts'

const d = game.balance.diplomacy

export interface EnvoyRow {
  id: number
  lobby_id: string
  from_id: number
  to_id: number
  kind: 'improve' | 'gift' | 'tribute' | 'alliance' | 'peace' | 'insult' | 'marriage'
  gold: number | null
  sent_at: string
  arrive_at: string
  expires_at: string | null
  status: string
  // A peace's terms, or a marriage's bride (CLAUDE.md §9.1.1).
  terms: { kind: 'white' | 'gold' | 'tribute' | 'offer' | 'marriage'; gold?: number; bride?: number; name?: string } | null
}

// An envoy reaching the other palace: courtesies take effect, proposals wait for an answer.
export async function arrive(envoy: EnvoyRow, rows: Row[]) {
  const at = ms(envoy.arrive_at)
  const from = nameOf(rows, envoy.from_id)
  // An insult: the relation sours and the insulted may go to war over it.
  if (envoy.kind === 'insult') {
    await changeRelation(envoy.lobby_id, envoy.from_id, envoy.to_id, d.insult.relation, at)
    await grantClaim(envoy.lobby_id, envoy.to_id, envoy.from_id, 'insult', at)
    await admin.from('envoys').update({ status: 'done', resolved_at: iso(at) }).eq('id', envoy.id)
    await notify(envoy.lobby_id, [envoy.to_id], 'envoy_insult', { from, seed: envoy.id }, at)
    await notify(envoy.lobby_id, [envoy.from_id], 'insult_delivered', { to: nameOf(rows, envoy.to_id) }, at)
    return
  }
  if (envoy.kind === 'improve' || envoy.kind === 'gift') {
    // A sender with many enemies is believed less.
    const sender = rows.find((r) => r.id === envoy.from_id)?.state
    // Diplomacy learnt at the university makes the envoy's words count for more.
    const standing = (await reputationOf(envoy.lobby_id, envoy.from_id, at)) * (1 + (sender ? game.researchEffects(sender, at).diplomacy : 0))
    if (envoy.kind === 'improve') await changeRelation(envoy.lobby_id, envoy.from_id, envoy.to_id, d.improve.gain * standing, at)
    else {
      const gold = envoy.gold ?? 0
      await mutateKingdom(envoy.to_id, at, (k) => ({ ...k, stock: { ...k.stock, gold: k.stock.gold + gold } }))
      await changeRelation(envoy.lobby_id, envoy.from_id, envoy.to_id, Math.min(d.gift.maxGain, gold * d.gift.relationPerGold) * standing, at)
    }
    await admin.from('envoys').update({ status: 'done', resolved_at: iso(at) }).eq('id', envoy.id)
    await notify(envoy.lobby_id, [envoy.to_id], 'envoy_courtesy', { kind: envoy.kind, from, gold: envoy.gold }, at)
    return
  }
  // A side that has crushed the other dictates the peace.
  if (envoy.kind === 'peace') {
    const { score } = await scoreOf(envoy.lobby_id, envoy.from_id, envoy.to_id)
    if (game.enforcedPeace(score)) {
      await answer(envoy, true, at)
      await notify(envoy.lobby_id, [envoy.to_id], 'peace_enforced', { from, terms: envoy.terms }, at)
      return
    }
  }
  await admin
    .from('envoys')
    .update({ status: 'pending', expires_at: iso(at + d.proposalSeconds * 1000) })
    .eq('id', envoy.id)
  await notify(envoy.lobby_id, [envoy.to_id], 'envoy_proposal', { envoy: envoy.id, kind: envoy.kind, from, gold: envoy.gold, terms: envoy.terms }, at)
}

// Gold moved between two kingdoms (as much as the giver has).
async function pay(from: number, to: number, gold: number, at: number) {
  let paid = 0
  await mutateKingdom(from, at, (k) => {
    paid = Math.min(gold, Math.floor(k.stock.gold))
    return { ...k, stock: { ...k.stock, gold: k.stock.gold - paid } }
  })
  await mutateKingdom(to, at, (k) => ({ ...k, stock: { ...k.stock, gold: k.stock.gold + paid } }))
  return paid
}

async function startTribute(lobby: string, receiver: number, payer: number, gold: number, at: number, rows: Row[]) {
  const { data: pact } = await admin
    .from('pacts')
    .insert({ lobby_id: lobby, kind: 'tribute', from_id: receiver, to_id: payer, gold, started_at: iso(at), paid_at: iso(at) })
    .select()
    .single()
  const add = (other: number, dir: 'in' | 'out') => (k: any) => ({
    ...k,
    tributes: [...(k.tributes ?? []).filter((t: { other: number }) => t.other !== other), { other, name: nameOf(rows, other), gold, dir, pact: pact.id }],
  })
  await mutateKingdom(receiver, at, add(payer, 'in'))
  await mutateKingdom(payer, at, add(receiver, 'out'))
}

// The answer to a proposal (an unanswered one counts as refused when it expires).
export async function answer(envoy: EnvoyRow, accept: boolean, at: number, expired = false) {
  const rows = await loadKingdoms(envoy.lobby_id)
  const lobby = envoy.lobby_id
  const pacts = await pactsOf(lobby)
  let accepted = accept
  if (accept && envoy.kind === 'tribute') {
    await startTribute(lobby, envoy.from_id, envoy.to_id, envoy.gold ?? 0, at, rows)
    await changeRelation(lobby, envoy.from_id, envoy.to_id, d.tribute.accept, at)
  } else if (accept && envoy.kind === 'alliance') {
    const { value } = await relationOf(lobby, envoy.from_id, envoy.to_id, at)
    if (game.proposalError('alliance', value, pacts, envoy.from_id, envoy.to_id)) accepted = false
    else await admin.from('pacts').insert({ lobby_id: lobby, kind: 'alliance', from_id: envoy.from_id, to_id: envoy.to_id, started_at: iso(at) })
  } else if (accept && envoy.kind === 'peace') {
    const war = pacts.find((p: any) => p.kind === 'war' && ((p.from_id === envoy.from_id && p.to_id === envoy.to_id) || (p.from_id === envoy.to_id && p.to_id === envoy.from_id)))
    if (!war) accepted = false
    else {
      await admin.from('pacts').update({ ended_at: iso(at), ended_by: envoy.to_id }).eq('id', war.id)
      await syncWarFlags(lobby, at, [envoy.from_id, envoy.to_id])
      const { value } = await relationOf(lobby, envoy.from_id, envoy.to_id, at)
      await setRelation(lobby, envoy.from_id, envoy.to_id, Math.max(value, d.war.peaceRelation), at)
      // The terms: gold or a tribute from the side that accepted, or gold given to it.
      const terms = envoy.terms ?? { kind: 'white' }
      if (terms.kind === 'gold') await pay(envoy.to_id, envoy.from_id, terms.gold ?? 0, at)
      if (terms.kind === 'offer') await pay(envoy.from_id, envoy.to_id, terms.gold ?? 0, at)
      if (terms.kind === 'tribute') await startTribute(lobby, envoy.from_id, envoy.to_id, terms.gold ?? 0, at, rows)
      // Armies on their way to besiege the other side stop where they are.
      await admin
        .from('armies')
        .update({ goal: { kind: 'move' } })
        .in('kingdom_id', [envoy.from_id, envoy.to_id])
        .eq('goal->>kind', 'siege')
    }
  } else if (accept && envoy.kind === 'marriage') {
    // The bride leaves her father's (or brother's) house for the other lord's, if she is still at court and unwed.
    const bride = envoy.terms?.bride ?? -1
    let wed = false
    await mutateKingdom(envoy.from_id, at, (k) => {
      wed = false
      if (game.brideError(k, bride, at)) return null
      wed = true
      return game.marry(k, bride, { kind: 'lord', id: envoy.to_id, name: nameOf(rows, envoy.to_id) }, at)
    })
    if (!wed) accepted = false
    else {
      await mutateKingdom(envoy.to_id, at, (k) => game.receiveBride(k, { name: envoy.terms?.name ?? '?', from: nameOf(rows, envoy.from_id), fromId: envoy.from_id, at }))
      await changeRelation(lobby, envoy.from_id, envoy.to_id, game.balance.dynasty.intrigue.marriage.lord.relation, at)
      await notify(lobby, [envoy.to_id], 'house_marriage', { kind: 'bride', name: envoy.terms?.name ?? '?', from: nameOf(rows, envoy.from_id) }, at)
    }
  } else if (!accept && envoy.kind === 'tribute') {
    await changeRelation(lobby, envoy.from_id, envoy.to_id, d.tribute.reject, at)
    // Refusing tribute gives the one who asked a claim.
    await grantClaim(lobby, envoy.from_id, envoy.to_id, 'tribute', at)
  }
  await admin
    .from('envoys')
    .update({ status: expired ? 'expired' : accepted ? 'accepted' : 'rejected', resolved_at: iso(at) })
    .eq('id', envoy.id)
  await notify(lobby, [envoy.from_id], 'envoy_answer', { kind: envoy.kind, by: nameOf(rows, envoy.to_id), accepted, expired, gold: envoy.gold, ...(envoy.kind === 'marriage' && { bride: envoy.terms?.name ?? '' }) }, at)
  return accepted
}

// Ends a tribute: the payer stopping it is breaking their word; the receiver may let it go.
export async function endTribute(pact: any, by: number, at: number, lobby: string) {
  const payer = pact.to_id
  const receiver = pact.from_id
  await admin.from('pacts').update({ ended_at: iso(at), ended_by: by }).eq('id', pact.id)
  const drop = (other: number) => (k: any) => ({ ...k, tributes: (k.tributes ?? []).filter((t: { other: number }) => t.other !== other) })
  await mutateKingdom(payer, at, drop(receiver))
  await mutateKingdom(receiver, at, drop(payer))
  await changeRelation(lobby, payer, receiver, by === payer ? d.tribute.renege : d.tribute.release, at)
  if (by === payer) await grantClaim(lobby, receiver, payer, 'renege', at)
  // Word of a broken promise spreads: everyone else trusts the payer a little less.
  const rows = await loadKingdoms(lobby)
  if (by === payer) for (const r of rows) if (r.state && r.id !== payer && r.id !== receiver) await changeRelation(lobby, payer, r.id, d.tribute.renegeInfamy, at)
  await notify(lobby, [by === payer ? receiver : payer], 'tribute_ended', { by: nameOf(rows, by), payer: nameOf(rows, payer), renege: by === payer }, at)
}

// ---- Intelligence -------------------------------------------------------------------------------------------------

const seedOf = (owner: number, target: number, salt: number) => (owner * 1_000_003 + target * 101 + salt) | 0

// What `me` can tell about `target` through its spies: each topic's network strength and estimates.
export async function intel(lobby: string, me: number, targetId: number, now: number) {
  const rows = await loadKingdoms(lobby)
  const target = rows.find((r) => r.id === targetId)
  if (!target?.state) return null
  const state = game.advance(target.state, now, await lobbyMarket(lobby)).kingdom
  const { data: mine } = await admin.from('spy_missions').select('*').eq('owner_id', me).eq('target_id', targetId).is('ended_at', null)
  const counter = await counterAgainst(lobby, me, targetId, state, now)
  // Our spy house trains spies that build their networks faster (see game.networkSpeed).
  const own = rows.find((r) => r.id === me)?.state
  const speed = own ? game.networkSpeed(own) : 1
  const exact = Object.fromEntries(game.SPY_TOPICS.map((t: string) => [t, game.strengthOf(mine ?? [], me, targetId, t, counter, now, speed)]))
  const strength = Object.fromEntries(game.SPY_TOPICS.map((t: string) => [t, Math.round(exact[t])]))
  const est = (value: number, topic: string, salt: number) => game.estimate(value, strength[topic], seedOf(me, targetId, salt), now)
  const { data: armies } = await admin.from('armies').select('soldiers, units').eq('kingdom_id', targetId)
  const fielded = (armies ?? []).reduce((n: number, a: { soldiers: number }) => n + a.soldiers, 0)
  const allUnits = (armies ?? []).reduce((u: Record<string, number>, a: { units: Record<string, number> }) => game.addUnits(u, a.units), game.garrisonOf(state))
  const garrison = (state.soldiers ?? 0) + (state.training ?? []).reduce((n: number, t: { count: number }) => n + t.count, 0)
  // The odds of each operation through the strongest network, as the spies judge them (to the nearest 5%).
  const best = Math.max(0, ...Object.values(exact) as number[])
  const chances = Object.fromEntries(game.OPERATIONS.map((op: string) => [op, Math.round(game.operationChance(op, best, counter) * 20) * 5]))
  const report: Record<string, unknown> = { strength, chances }
  report.stores = {
    gold: est(state.stock.gold, 'stores', 1),
    food: est(state.stock.food, 'stores', 2),
    materials: est(state.stock.materials, 'stores', 3),
    arms: est(state.stock.arms, 'stores', 4),
  }
  report.army = {
    garrison: est(garrison, 'army', 5),
    field: est(fielded, 'army', 6),
    // How hard they would fight: soldiers weighed by the people's mood.
    might: est(Math.round((garrison + fielded) * (0.75 + (0.5 * (state.happiness ?? 60)) / 100)), 'army', 7),
    happiness: est(Math.round(state.happiness ?? 60), 'army', 8),
    // What kinds of soldier they field, once the network is fairly strong.
    units: strength.army >= 30 ? Object.fromEntries(game.UNITS.map((u: string, i: number) => [u, est(allUnits[u] ?? 0, 'army', 20 + i)])) : null,
  }
  // Their ships by type, harbour and each fleet, once the army network is fairly strong (CLAUDE.md §8.5): the lobby
  // only sees how big their fleets roughly are.
  if (strength.army >= 30) {
    const navy = game.navyOf(state)
    const byType = (ships: Record<string, number>, salt: number) => Object.fromEntries(game.SHIPS.map((x: string, i: number) => [x, est(ships[x] ?? 0, 'army', salt + i)]))
    report.navy = {
      harbour: byType(navy.harbour, 40),
      fleets: navy.fleets.map((f: { id: number; ships: Record<string, number> }) => ({ id: f.id, ships: byType(f.ships, 50 + f.id * 7) })),
    }
  }
  if (strength.diplomacy >= game.balance.espionage.minStrength) {
    const { data: envoys } = await admin.from('envoys').select('to_id, kind, status').eq('from_id', targetId).in('status', ['traveling', 'pending'])
    const { data: spies } = await admin.from('spy_missions').select('target_id, topic').eq('owner_id', targetId).is('ended_at', null)
    report.diplomacy = {
      envoys: (envoys ?? []).map((e: { to_id: number; kind: string; status: string }) => ({ to: nameOf(rows, e.to_id), kind: e.kind, status: e.status })),
      // Who they spy on shows once the network is strong; before that only how many.
      spies: strength.diplomacy >= 50 ? (spies ?? []).map((s: { target_id: number; topic: string }) => ({ target: nameOf(rows, s.target_id), topic: s.topic })) : null,
      spyCount: (spies ?? []).length,
    }
  }
  return report
}

// Tributes between lords (CLAUDE.md §9.7): every round's tribute is taken from the payer's treasury as far as it holds
// it, and only what was really paid reaches the receiver (as far as its treasury has room). Settled by the tick for the
// whole rounds since the pact was last paid; the rounds are claimed on the pact first, so two runs pay them once. A
// pact from before this rule starts counting from now.
// deno-lint-ignore no-explicit-any
export async function settleTributes(lobby: string, pacts: any[], now: number) {
  for (const p of pacts) {
    if (p.kind !== 'tribute' || p.ended_at) continue
    if (!p.paid_at) {
      await admin.from('pacts').update({ paid_at: iso(now) }).eq('id', p.id).is('paid_at', null)
      continue
    }
    // The tribute is gold an hour (CLAUDE.md §9.7), paid in whole coins as they fall due.
    const perHour = p.gold ?? 0
    if (perHour <= 0) continue
    const from = ms(p.paid_at)
    const owed = Math.floor(((now - from) * perHour) / 3_600_000)
    if (owed < 1) continue
    const { data: claimed } = await admin.from('pacts').update({ paid_at: iso(from + Math.round((owed * 3_600_000) / perHour)) }).eq('id', p.id).eq('paid_at', p.paid_at).select('id').maybeSingle()
    if (!claimed) continue
    let paid = 0
    await mutateKingdom(p.to_id, now, (k) => {
      paid = Math.max(0, Math.min(owed, Math.floor(k.stock.gold)))
      return game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold - paid } }, { tributeOut: paid })
    })
    if (paid <= 0) continue
    await mutateKingdom(p.from_id, now, (k) => {
      const room = Math.max(0, game.goldCap(k, now) - k.stock.gold)
      const kept = Math.min(paid, room)
      return game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold + kept } }, { tributeIn: paid, ...(paid > kept && { wastedGold: paid - kept }) })
    })
  }
}
