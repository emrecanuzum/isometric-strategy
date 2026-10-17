// The lord's house on the server (CLAUDE.md §9.1.1): kin grown unhappy are told of, a brother who hates the ruler
// enough rises as a pretender and raises a camp near the realm (everyone sees it), the lord's armies sent to the camp
// fight his men there, and a camp left standing long enough marches on the palace. A lost siege there costs the lord
// his throne. Run by the tick; the decisions come from the shared logic (intrigue.ts) and its seeded draws, and each is
// claimed on the lord's state, so two runs make it once.

import * as game from './game.js'
import { armyNow, doorOf, unitsOf } from './armies.ts'
import type { ArmyRow } from './armies.ts'
import { townsOf } from './towns.ts'
import { admin, iso, ms, mutateKingdom, notify } from './server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'

const V = () => game.balance.dynasty.intrigue.revolt
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Whether anything about a lord's house may need the server now (cheap, from the state as it was last written).
function stirring(state: Kingdom, now: number) {
  const d = state?.dynasty
  if (!d) return false
  if (state.pretender) return true
  const men = [...d.children, ...(d.siblings ?? [])].filter((p: { sex: string; bornAt: number }) => game.hasOpinion(p, now))
  return men.length > 0
}

export async function settleHouses(lobby: string, world: LobbyWorld, rows: Row[], now: number) {
  for (const row of rows) {
    if (!row.state || !stirring(row.state, now)) continue
    try {
      await settleHouse(lobby, world, rows, row, now)
    } catch (e) {
      console.error('house', row.id, e)
    }
  }
}

async function settleHouse(lobby: string, world: LobbyWorld, rows: Row[], row: Row, now: number) {
  // Kin grown unhappy (told once, until content again).
  const told: { name: string; opinion: number; kinship: string; id: number }[] = []
  const peek = game.unhappyKin(row.state, now)
  if (peek.unhappy.length > 0 || peek.calm.length > 0) {
    await mutateKingdom(row.id, now, (k) => {
      told.length = 0
      const { unhappy, calm } = game.unhappyKin(k, now)
      if (unhappy.length === 0 && calm.length === 0) return null
      for (const u of unhappy) told.push({ name: u.person.name, opinion: u.opinion, kinship: String(u.kinship), id: u.person.id })
      return game.markWarned(k, unhappy.map((u: { person: { id: number } }) => u.person.id), calm)
    })
    for (const t of told) await notify(lobby, [row.id], 'kin_unhappy', t, now)
  }

  // A brother rises: he leaves with some of the garrison and camps near the realm.
  const roll = game.revoltCandidate(row.state, now)
  let raised = false
  if (roll.checked) {
    const camp = roll.person ? await campFor(lobby, world, rows, row, now) : null
    // deno-lint-ignore no-explicit-any
    const risen: { r: any } = { r: null }
    await mutateKingdom(row.id, now, (k) => {
      risen.r = null
      const c = game.revoltCandidate(k, now)
      if (!c.checked) return null
      const kept = game.keepRevoltSlot(k, c.slot)
      if (!c.person || !camp) return kept
      const r = game.raisePretender(kept, c.person.id, now, camp)
      if (!r) return kept
      risen.r = r
      return r.kingdom
    })
    const p = risen.r as { pretender: { person: { name: string }; start: number; deserters?: number; backed: boolean; crown?: number; marchAt: number; at: Point } } | null
    if (p) {
      raised = true
      const pr = p.pretender
      await notify(lobby, [row.id], 'pretender_rise', { name: pr.person.name, soldiers: pr.start, deserters: pr.deserters ?? 0, backed: pr.backed, crown: pr.crown ?? null, minutes: Math.round((pr.marchAt - now) / 60_000), at: pr.at }, now)
    }
  }

  // The pretender's camp, as the state now stands (only when one is out).
  if (!row.state.pretender && !raised) return
  const fresh = (await admin.from('kingdoms').select('state').eq('id', row.id).single()).data?.state as Kingdom | undefined
  const pretender = fresh?.pretender
  if (!pretender) return
  row.state = fresh

  // The camp grows: the lord is warned as it nears its march.
  const shares = V().warnShares as number[]
  const told2 = pretender.told ?? 0
  const share = (now - pretender.since) / Math.max(1, pretender.marchAt - pretender.since)
  if (told2 < shares.length && share >= shares[told2] && !pretender.marching) {
    let grew = false
    await mutateKingdom(row.id, now, (k) => {
      grew = false
      if (!k.pretender || (k.pretender.told ?? 0) !== told2) return null
      grew = true
      return { ...k, pretender: { ...k.pretender, told: told2 + 1 } }
    })
    if (grew) await notify(lobby, [row.id], 'pretender_grow', { name: pretender.person.name, soldiers: game.campSoldiers(pretender, now), minutes: Math.max(0, Math.round((pretender.marchAt - now) / 60_000)), backed: pretender.backed, soon: told2 + 1 >= shares.length }, now)
  }

  if (pretender.battle) return
  // The lord's armies at the camp attack it.
  const { data } = await admin.from('armies').select('*').eq('kingdom_id', row.id)
  const armies = (data ?? []) as ArmyRow[]
  const attacker = armies.find((a) => a.goal?.kind === 'camp' && a.status !== 'battle' && ms(a.arrive_at) <= now)
  if (attacker && now < pretender.marchAt) {
    await campBattle(lobby, world, row, attacker, Math.min(now, Math.max(ms(attacker.arrive_at), now - 60_000)))
    return
  }
  // The camp left standing: the pretender marches on the palace.
  if (now >= pretender.marchAt && !pretender.marching) await usurpBattle(lobby, world, row, armies, Math.max(pretender.marchAt, now - 60_000))
}

// Where the pretender camps: open land outside the realm, clear of other lands, towns and the crown cities.
async function campFor(lobby: string, world: LobbyWorld, rows: Row[], row: Row, now: number): Promise<Point | null> {
  const last = game.balance.territory.stageParcels.length - 1
  const lands = rows.filter((r) => r.state?.site && r.id !== row.id).map((r) => game.territoryRect(r.state.site, last))
  const towns = await townsOf(lobby)
  const S = game.balance.towns.size
  const blocked = (x: number, y: number) =>
    lands.some((l: { x: number; y: number; size: number }) => x >= l.x - 4 && y >= l.y - 4 && x < l.x + l.size + 4 && y < l.y + l.size + 4) ||
    towns.some((t) => x >= t.x - 3 && y >= t.y - 3 && x < t.x + S + 3 && y < t.y + S + 3) ||
    world.cities.some((c) => dist(c, { x, y }) < 40)
  return game.campSpot(world.world, row.state, now, blocked)
}

// An army of the lord's own at the pretender's camp: a battle of kind 'pretender', claimed on the lord's state (one at
// a time). The camp's palisade stands with the pretender's men.
async function campBattle(lobby: string, world: LobbyWorld, row: Row, army: ArmyRow, at: number) {
  const state = game.advance(row.state, at).kingdom
  const p = state.pretender
  if (!p) return
  const now = armyNow(army, world, state, at)
  const king = game.leadsArmy(state, army.led_by, at)
  const attacker = { kingdom: row.id, army: army.id, soldiers: army.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(army), faith: game.battleSpirit(state, at, king), ...(king && { king: true }) }
  const defender = game.pretenderFighter(p, at)
  const defense = { towers: 0, walls: V().palisade }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const plan = game.planBattle([attacker], [defender], seed, defense)
  const ends = at + game.battleMs(plan)
  const { data: battle } = await admin
    .from('battles')
    .insert({ lobby_id: lobby, kind: 'pretender', x: p.at.x, y: p.at.y, started_at: iso(at), ends_at: iso(ends), attackers: [attacker], defenders: [defender], besieged: null, plan: { ...plan, defense, pretender: row.id }, seed })
    .select('id')
    .single()
  if (!battle) return
  if (!(await claimBattle(row.id, at, battle.id, false))) {
    await admin.from('battles').delete().eq('id', battle.id)
    return
  }
  await admin
    .from('armies')
    .update({ path: [now.here], depart_at: iso(at), arrive_at: iso(at), status: 'battle', morale: now.morale, familiarity: now.familiarity, camp: now.here, goal: { kind: 'move' } })
    .eq('id', army.id)
  await notify(lobby, [row.id], 'battle_start', { battle: battle.id, kind: 'pretender', at: p.at, name: p.person.name, sides: [[row.name ?? '?'], [`${p.person.name} asileri`]] }, at)
}

// The camp marches on the palace: a battle of kind 'usurp' at its door, the garrison (with the lord's armies standing
// by the palace) behind the walls and towers.
async function usurpBattle(lobby: string, world: LobbyWorld, row: Row, armies: ArmyRow[], at: number) {
  const state = game.advance(row.state, at).kingdom
  const p = state.pretender
  const door = doorOf(state)
  if (!p || !door) return
  const attacker = game.pretenderFighter(p, at)
  const garrison = game.garrisonOf(state)
  const citadel = game.citadelOf(state, at)
  const defenders: Record<string, unknown>[] = [
    { kingdom: row.id, army: null, soldiers: game.countOf(garrison), morale: Math.min(100, (state.happiness ?? 60) + citadel.morale), familiarity: 100, units: garrison, faith: game.battleSpirit(state, at) },
  ]
  // The lord's armies standing by the palace fight too.
  const near = armies.filter((a) => a.status !== 'battle' && !a.goal?.retreat && ms(a.arrive_at) <= at && dist(game.armyAt(a, at), door) <= game.balance.military.allyTiles)
  for (const a of near) {
    const now = armyNow(a, world, state, at)
    const king = game.leadsArmy(state, a.led_by, at)
    defenders.push({ kingdom: row.id, army: a.id, soldiers: a.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(a), faith: game.battleSpirit(state, at, king), ...(king && { king: true }) })
  }
  const standingAt = (kind: string) => state.buildings.filter((b: { kind: string; doneAt: number; broken?: boolean }) => b.kind === kind && b.doneAt <= at && !b.broken).length
  const defense = { towers: standingAt('watchtower'), walls: standingAt('wall') + standingAt('gate') + game.researchEffects(state, at).fortify, ...(citadel.dice > 0 && { keep: citadel.dice }) }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const plan = game.planBattle([attacker], defenders, seed, defense)
  const ends = at + game.battleMs(plan)
  const { data: battle } = await admin
    .from('battles')
    .insert({ lobby_id: lobby, kind: 'usurp', x: door.x, y: door.y, started_at: iso(at), ends_at: iso(ends), attackers: [attacker], defenders, besieged: row.id, plan: { ...plan, defense, pretender: row.id }, seed })
    .select('id')
    .single()
  if (!battle) return
  if (!(await claimBattle(row.id, at, battle.id, true))) {
    await admin.from('battles').delete().eq('id', battle.id)
    return
  }
  for (const a of near) await admin.from('armies').update({ path: [game.armyAt(a, at)], depart_at: iso(at), arrive_at: iso(at), status: 'battle' }).eq('id', a.id)
  await notify(lobby, [row.id], 'pretender_siege', { battle: battle.id, name: p.person.name, soldiers: attacker.soldiers, garrison: defenders.reduce((n, f) => n + (f.soldiers as number), 0) }, at)
  await notify(lobby, [row.id], 'battle_start', { battle: battle.id, kind: 'usurp', at: door, name: p.person.name, sides: [[`${p.person.name} asileri`], [row.name ?? '?']] }, at)
}

// The battle claimed on the pretender: only while none is being fought.
async function claimBattle(id: number, at: number, battle: number, marching: boolean) {
  let claimed = false
  await mutateKingdom(id, at, (k) => {
    claimed = false
    if (!k.pretender || k.pretender.battle) return null
    claimed = true
    return { ...k, pretender: { ...k.pretender, battle, ...(marching && { marching: true }) } }
  })
  return claimed
}

// A battle with the pretender is over (called as the battle is settled). At the camp: won, he is put down; lost, he
// keeps it with those left. At the palace: held, he is put down; taken, he is the ruler now.
// deno-lint-ignore no-explicit-any
export async function settlePretender(battle: any, at: number) {
  const lord = battle.plan?.pretender as number | undefined
  if (lord === undefined) return null
  const lobby = battle.lobby_id
  const name = (battle.kind === 'usurp' ? battle.attackers[0] : battle.defenders[0])?.pretender ?? '?'
  if (battle.kind === 'pretender') {
    if (battle.plan.winner === 'attackers') {
      const offer = await crush(lord, battle.id, at)
      await notify(lobby, [lord], 'pretender_crushed', { name, where: 'camp', ...(offer && { offer }) }, at)
      return { name, crushed: true }
    }
    await mutateKingdom(lord, at, (k) => (k.pretender?.battle === battle.id ? game.pretenderLosses(k, battle.plan.defenderLosses?.[0] ?? 0) : null))
    return { name, crushed: false }
  }
  if (battle.kind === 'usurp') {
    if (battle.plan.winner === 'defenders') {
      const offer = await crush(lord, battle.id, at)
      await notify(lobby, [lord], 'throne_held', { name, ...(offer && { offer }) }, at)
      return { name, crushed: true }
    }
    let old = ''
    const survivors = Math.max(0, (battle.attackers[0]?.soldiers ?? 0) - (battle.plan.attackerLosses?.[0] ?? 0))
    await mutateKingdom(lord, at, (k) => {
      if (k.pretender?.battle !== battle.id) return null
      old = k.dynasty?.king?.name ?? ''
      return { ...game.usurp(k, at, survivors), shieldUntil: at + game.siegeShieldMs(k, at), happiness: Math.max(0, (k.happiness ?? 60) + game.balance.society.happiness.looted) }
    })
    // The fallen lord's lead of any army lapses with him.
    await admin.from('armies').update({ led_by: null }).eq('kingdom_id', lord).not('led_by', 'is', null)
    await notify(lobby, [lord], 'throne_lost', { name, old }, at)
    return { name, crushed: false, usurped: true }
  }
  return null
}

// The pretender put down; when the liege crown had backed him, the offer to go over to the rival crown it leaves
// (CLAUDE.md §9.1.1: told with the news, answered with the `switchLiege` command).
async function crush(lord: number, battle: number, at: number) {
  let offer: { from: number; to: number; until: number } | null = null
  await mutateKingdom(lord, at, (k) => {
    if (k.pretender?.battle !== battle) return null
    const next = game.crushPretender(k, at)
    offer = next.liegeOffer && next.liegeOffer.at === at ? { from: next.liegeOffer.from, to: next.liegeOffer.to, until: next.liegeOffer.until } : null
    return next
  })
  return offer as { from: number; to: number; until: number } | null
}
