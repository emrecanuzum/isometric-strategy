// What comes due on its own (CLAUDE.md §9.7, §11.1): envoys arrive and proposals expire, caught spies end, orders
// reach their armies, armies meet, lay siege and come home, watchtowers shoot, and battles end. Armies are simulated
// a little ahead, so a battle can be planned before it starts and every screen sees it begin on time. Run by the
// `tick` function (pg_cron, every minute while anything is under way) and by players' `settle` nudges the moment
// something they can see comes due.

import * as game from './game.js'
import { applyOrder, armiesOf, armyNow, doorOf, march, standing, unitsOf } from './armies.ts'
import type { ArmyRow, Order } from './armies.ts'
import { answer, arrive, settleTributes } from './diplomacy.ts'
import { ensureTowns, settleQuell, settleTowns } from './towns.ts'
import { settlePatrols } from './patrols.ts'
import { settleNavy } from './navy.ts'
import { settleOutlawBattle, settleOutlaws } from './outlaws.ts'
import { settleHouses, settlePretender } from './house.ts'
import type { EnvoyRow } from './diplomacy.ts'
import { admin, changeRelation, grantClaim, iso, loadKingdoms, ms, mutateKingdom, nameOf, notify, pactsOf, settleFoodDemand, syncWarFlags, worldOf } from './server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'

// deno-lint-ignore no-explicit-any
type Pact = any
interface Fighter {
  kingdom: number
  army: number | null
  soldiers: number
  morale: number
  familiarity: number
  units?: Record<string, number>
  faith?: number
  king?: boolean
  rebels?: boolean
  outlaws?: boolean
  pretender?: string
}
interface Plan {
  winner: 'attackers' | 'defenders'
  attackerLosses: number[]
  defenderLosses: number[]
  attackerMorale: number
  defenderMorale: number
}

const m = game.balance.military
const STEP_MS = 1000
const AHEAD_MS = 90_000
const BEHIND_MS = 120_000
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Works through one lobby up to `now`, unless another run did so in the last few seconds (the cron and the players'
// nudges can come at once; only one of them goes ahead, so nothing is settled twice). Returns whether it ran.
export async function tickLobby(lobby: string, now: number, minGapMs = 3000) {
  const { data: row } = await admin.from('lobbies').select('sim_at').eq('id', lobby).maybeSingle()
  if (!row) return false
  const last = row.sim_at ? ms(row.sim_at) : 0
  if (last > now - minGapMs) return false
  // Claimed only if sim_at is still what was read.
  const claim = admin.from('lobbies').update({ sim_at: iso(now) }).eq('id', lobby)
  const { data: claimed } = await (row.sim_at ? claim.eq('sim_at', row.sim_at) : claim.is('sim_at', null)).select('id').maybeSingle()
  if (!claimed) return false
  await tick(lobby, last || now - 60_000, now)
  return true
}

export async function tick(lobby: string, simAt: number, now: number) {
  let rows = await loadKingdoms(lobby)

  // Envoys arriving, and proposals left unanswered.
  const { data: arriving } = await admin.from('envoys').select('*').eq('lobby_id', lobby).eq('status', 'traveling').lte('arrive_at', iso(now))
  for (const envoy of (arriving ?? []) as EnvoyRow[]) await arrive(envoy, rows)
  const { data: expiring } = await admin.from('envoys').select('*').eq('lobby_id', lobby).eq('status', 'pending').lte('expires_at', iso(now))
  for (const envoy of (expiring ?? []) as EnvoyRow[]) await answer(envoy, false, ms(envoy.expires_at), true)

  // Spies caught: the spy is lost, the target learns who sent it.
  const { data: caught } = await admin.from('spy_missions').select('*').eq('lobby_id', lobby).is('ended_at', null).lte('caught_at', iso(now))
  for (const mission of caught ?? []) {
    const at = ms(mission.caught_at)
    await admin.from('spy_missions').update({ ended_at: mission.caught_at, end_reason: 'caught' }).eq('id', mission.id)
    await mutateKingdom(mission.owner_id, at, (k) => ({ ...k, spiesAway: Math.max(0, (k.spiesAway ?? 0) - 1) }))
    await changeRelation(lobby, mission.owner_id, mission.target_id, game.balance.diplomacy.spyCaught, at)
    await grantClaim(lobby, mission.target_id, mission.owner_id, 'spy', at)
    await notify(lobby, [mission.target_id], 'spy_caught', { owner: nameOf(rows, mission.owner_id), topic: mission.topic }, at)
    await notify(lobby, [mission.owner_id], 'spy_lost', { target: nameOf(rows, mission.target_id), topic: mission.topic }, at)
  }

  const world = await worldOf(lobby)
  let pacts = await pactsOf(lobby)

  // Orders the envoys have brought to their armies.
  const { data: orders } = await admin
    .from('army_orders')
    .select('*')
    .eq('lobby_id', lobby)
    .is('applied_at', null)
    .lte('effective_at', iso(now))
    .order('effective_at')
  for (const order of orders ?? []) {
    const { data: army } = await admin.from('armies').select('*').eq('id', order.army_id).maybeSingle()
    const at = ms(order.effective_at)
    const why = army ? await applyOrder(world, army as ArmyRow, order.payload as Order, rows, pacts, at) : 'army'
    await admin.from('army_orders').update({ applied_at: iso(now) }).eq('id', order.id)
    // The envoy stays with the commander for a while: further orders reach the army at once.
    if (army && !why) await admin.from('armies').update({ contact_until: iso(Math.max(at, now) + game.balance.time.contactSeconds * 1000) }).eq('id', army.id)
    if (why) await notify(lobby, [order.kingdom_id], 'order_failed', { order: order.payload, why }, at)
  }

  // Sieges begun: the people of the besieged palace flee (CLAUDE.md §8.3).
  const { data: besieging } = await admin.from('battles').select('*').eq('lobby_id', lobby).eq('kind', 'siege').eq('resolved', false).lte('started_at', iso(now))
  for (const battle of besieging ?? []) await siegeBegun(battle, rows)

  // Battles that are over.
  const { data: ending } = await admin.from('battles').select('*').eq('lobby_id', lobby).eq('resolved', false).lte('ends_at', iso(now))
  for (const battle of ending ?? []) await finishBattle(battle, world, now)

  rows = await loadKingdoms(lobby)
  pacts = await pactsOf(lobby)
  await moveArmies(lobby, world, rows, pacts, Math.max(simAt, now - BEHIND_MS), now)

  // Towns: placed if the lobby has none yet, and their sieges begun, broken off and ended.
  await ensureTowns(lobby, world, rows)
  await settleTowns(lobby, world, await loadKingdoms(lobby), await pactsOf(lobby), now)
  // The lords' houses: kin grown unhappy, pretenders rising, their camps fought and marching (CLAUDE.md §9.1.1).
  await settleHouses(lobby, world, await loadKingdoms(lobby), now)
  // The crown kingdoms' patrols reaching lords.
  await settlePatrols(lobby, world, await loadKingdoms(lobby), now)
  // Fleets meeting at the lords' docks: blockades, raids and sorties (CLAUDE.md §8.5).
  await settleNavy(lobby, await loadKingdoms(lobby), await pactsOf(lobby), now)
  // Bandits and pirates: chases caught, called off or sent on, and each lord's share of their hold (CLAUDE.md §7.9).
  try {
    await settleOutlaws(lobby, world, await loadKingdoms(lobby), Math.max(simAt, now - BEHIND_MS), now)
  } catch (e) {
    console.error('settleOutlaws', e)
  }
  // Which lords are at war (their people grow slower), and food's price as the world's people grow (CLAUDE.md §5.2, §9.7).
  // Tributes between lords: what the payers really pay reaches the receivers.
  await settleTributes(lobby, await pactsOf(lobby), now)
  await syncWarFlags(lobby, now)
  await settleFoodDemand(lobby, await loadKingdoms(lobby), now)
}

// A siege at a lord's palace has begun: a share of the people flee at once, and while it lasts more leave (the lord's
// state knows until when, see game.growthTerms). Done once per siege: the battle keeps how many fled.
// deno-lint-ignore no-explicit-any
async function siegeBegun(battle: any, rows: Row[]) {
  if (battle.kind !== 'siege' || battle.besieged === null || battle.plan?.fled !== undefined) return
  const at = ms(battle.started_at)
  const until = ms(battle.ends_at)
  // Claimed on the battle first, so the people flee once even if two runs meet here.
  const { data: claimed } = await admin.from('battles').update({ plan: { ...battle.plan, fled: 0 } }).eq('id', battle.id).is('plan->fled', null).select('id').maybeSingle()
  if (!claimed) return
  let fled = 0
  // A handful of soldiers frightens nobody, and a lord's people flee at most once in a while (no harrying a lordship
  // empty with one-man sieges).
  const g = game.balance.society.growth.siege
  const attackers = (battle.attackers ?? []).reduce((n: number, f: Fighter) => n + f.soldiers, 0)
  if (attackers >= g.minAttackers) {
    await mutateKingdom(battle.besieged, at, (k) => {
      const { people } = game.population(k, at)
      const resting = at - (k.fledAt ?? -Infinity) < g.cooldownSeconds * 1000
      fled = resting ? 0 : Math.min(Math.floor(people), Math.round(people * g.startShare))
      return { ...k, people: Math.max(0, people - fled), besiegedUntil: Math.max(k.besiegedUntil ?? 0, until), ...(fled > 0 && { fledAt: at }) }
    })
  }
  battle.plan = { ...battle.plan, fled }
  await admin.from('battles').update({ plan: battle.plan }).eq('id', battle.id)
  if (fled > 0) await notify(battle.lobby_id, [battle.besieged], 'siege_people', { lost: fled, by: nameOf(rows, battle.attackers?.[0]?.kingdom), taken: false }, at)
}

// ---- Armies on the move -------------------------------------------------------------------------------------------

interface Live {
  army: ArmyRow
  engaged: boolean
}

async function moveArmies(lobby: string, world: LobbyWorld, rows: Row[], pacts: Pact[], from: number, now: number) {
  const states = new Map(rows.filter((r) => r.state).map((r) => [r.id, r.state as Kingdom]))
  const live: Live[] = (await armiesOf(lobby)).map((army) => ({ army, engaged: army.status === 'battle' }))

  // Home, or simply there.
  for (const l of live) {
    const a = l.army
    if (l.engaged || a.status !== 'moving' || ms(a.arrive_at) > now) continue
    if (a.goal.kind === 'home') {
      const { data: gone } = await admin.from('armies').delete().eq('id', a.id).select('id').maybeSingle()
      if (!gone) continue
      // What it bought at a town goes into the stores as it marches in (what does not fit is lost; CLAUDE.md §8.4).
      const cargo = (a.cargo ?? {}) as Record<string, number>
      const stored: Record<string, number> = {}
      let wasted = 0
      const at = ms(a.arrive_at)
      await mutateKingdom(a.kingdom_id, at, (k) => {
        const units = game.addUnits(game.garrisonOf(k), unitsOf(a))
        const stock = { ...k.stock }
        const cap = game.storageCap(k, at)
        wasted = 0
        for (const [g, n] of Object.entries(cargo)) {
          if (!(g in stock) || !(n > 0)) continue
          const fit = Math.max(0, Math.min(n, cap - stock[g]))
          stock[g] += fit
          stored[g] = fit
          wasted += n - fit
        }
        const next = { ...k, units, soldiers: game.countOf(units), fielded: Math.max(0, (k.fielded ?? 0) - a.soldiers), stock }
        return wasted > 0 ? game.book(next, { wastedGoods: wasted }) : next
      })
      if (Object.keys(stored).length > 0 || wasted > 0) await notify(lobby, [a.kingdom_id], 'cargo_home', { goods: stored, wasted }, at)
      l.engaged = true
    } else if (a.goal.kind === 'move' || a.goal.kind === 'town' || a.goal.kind === 'camp') {
      await admin.from('armies').update({ status: 'idle' }).eq('id', a.id)
      a.status = 'idle'
    }
  }

  const towers = rows.flatMap((r) =>
    (r.state?.buildings ?? [])
      .filter((b: { kind: string; doneAt: number }) => b.kind === 'watchtower')
      .map((b: { x: number; y: number; doneAt: number }) => ({ kingdom: r.id, at: { x: b.x + 0.5, y: b.y + 0.5 }, doneAt: b.doneAt })),
  )
  const exposure = new Map<number, number>()

  for (let t = from; t <= now + AHEAD_MS; t += STEP_MS) {
    const here = new Map(live.filter((l) => !l.engaged).map((l) => [l.army.id, game.armyAt(l.army, t) as Point]))
    // Sieges: an army that reaches the palace of a kingdom it is at war with.
    for (const l of live) {
      const a = l.army
      if (l.engaged || a.goal.kind !== 'siege' || ms(a.arrive_at) > t) continue
      // A palace taken a short while ago is shielded: the army waits at its gates until the shield ends.
      if ((states.get(a.goal.kingdom!)?.shieldUntil ?? 0) > t) continue
      if (game.atWar(pacts, a.kingdom_id, a.goal.kingdom)) await startBattle(lobby, world, rows, states, pacts, live, t, l, null, a.goal.kingdom!)
      else {
        await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', a.id)
        a.goal = { kind: 'move' }
      }
    }
    // Field battles: two armies of kingdoms at war within reach of each other (not one in retreat), never in the peace
    // of a free city.
    for (const x of live) {
      if (x.engaged || x.army.goal.retreat) continue
      for (const y of live) {
        if (y.engaged || x.engaged || y.army.goal.retreat || y.army.id <= x.army.id) continue
        if (!game.atWar(pacts, x.army.kingdom_id, y.army.kingdom_id)) continue
        if (dist(here.get(x.army.id)!, here.get(y.army.id)!) > m.contactTiles) continue
        if (game.inCityPeace(world.cities, here.get(x.army.id)!) || game.inCityPeace(world.cities, here.get(y.army.id)!)) continue
        await startBattle(lobby, world, rows, states, pacts, live, t, x, y, null)
      }
    }
    // Watchtowers shoot at enemy armies in range (only for time that has passed).
    if (t <= now) {
      for (const l of live) {
        if (l.engaged) continue
        const p = here.get(l.army.id)!
        const shots = towers.filter((tw) => tw.doneAt <= t && game.atWar(pacts, tw.kingdom, l.army.kingdom_id) && dist(tw.at, p) <= m.tower.range).length
        if (shots) exposure.set(l.army.id, (exposure.get(l.army.id) ?? 0) + (shots * STEP_MS) / 1000)
      }
    }
  }

  // Enemy armies camped near a kingdom's border frighten its people for a while (renewed while they stay).
  const fear = m.fear
  for (const l of live) {
    const a = l.army
    if (l.engaged || a.status === 'battle' || (a.status === 'moving' && ms(a.arrive_at) > now)) continue
    const here = game.armyAt(a, now) as Point
    for (const [id, st] of states) {
      if (id === a.kingdom_id || !game.atWar(pacts, a.kingdom_id, id)) continue
      const rect = game.territoryRect(st.site, game.territoryStage(st, now))
      const dx = Math.max(rect.x - here.x, 0, here.x - (rect.x + rect.size))
      const dy = Math.max(rect.y - here.y, 0, here.y - (rect.y + rect.size))
      if (Math.hypot(dx, dy) > fear.tiles) continue
      const until = (st.fearUntil ?? 0) as number
      // Written only when it would otherwise run out within the minute.
      if (until > now + 60_000) continue
      await mutateKingdom(id, now, (k) => ({ ...k, fearUntil: now + fear.seconds * 1000 }))
      st.fearUntil = now + fear.seconds * 1000
      if (until <= now) await notify(lobby, [id], 'army_threat', { by: nameOf(rows, a.kingdom_id) }, now)
    }
  }

  for (const [id, seconds] of exposure) {
    const l = live.find((x) => x.army.id === id)!
    const total = (l.army.exposure ?? 0) + seconds
    const killed = Math.min(l.army.soldiers, Math.floor(total / m.tower.secondsPerKill))
    const left = l.army.soldiers - killed
    if (killed > 0) {
      await mutateKingdom(l.army.kingdom_id, now, (k) => game.book({ ...k, fielded: Math.max(0, (k.fielded ?? 0) - killed) }, {}, { towers: killed }))
      await notify(lobby, [l.army.kingdom_id], 'tower_losses', { army: id, killed }, now)
    }
    if (left <= 0) await admin.from('armies').delete().eq('id', id)
    else
      await admin
        .from('armies')
        .update({ soldiers: left, units: game.takeShare(unitsOf(l.army), killed).left, exposure: total - killed * m.tower.secondsPerKill })
        .eq('id', id)
  }
}

// ---- Battles ------------------------------------------------------------------------------------------------------

// Starts a battle at `t`: between two armies in the field, or by an army at the gates of `besieged`. Friends close by
// join in: the armies of the same kingdoms and of their allies.
async function startBattle(
  lobby: string,
  world: LobbyWorld,
  rows: Row[],
  states: Map<number, Kingdom>,
  pacts: Pact[],
  live: Live[],
  t: number,
  first: Live,
  second: Live | null,
  besieged: number | null,
) {
  const point: Point = second
    ? (() => {
        const a = game.armyAt(first.army, t)
        const b = game.armyAt(second.army, t)
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      })()
    : (game.armyAt(first.army, t) as Point)
  const sideA = first.army.kingdom_id
  const sideB = second ? second.army.kingdom_id : besieged!
  const friends = (k: number) => new Set([k, ...game.alliesOf(pacts, k)])
  const ofA = friends(sideA)
  const ofB = friends(sideB)
  const join = (side: Set<number>, other: Set<number>) =>
    live.filter((l) => !l.engaged && !l.army.goal.retreat && side.has(l.army.kingdom_id) && !other.has(l.army.kingdom_id) && dist(game.armyAt(l.army, t), point) <= m.allyTiles)
  const a = [first, ...join(ofA, ofB).filter((l) => l !== first)]
  const b = second ? [second, ...join(ofB, ofA).filter((l) => l !== second)] : join(ofB, ofA)
  const fighter = (l: Live) => {
    const owner = states.get(l.army.kingdom_id)
    const now = owner ? armyNow(l.army, world, owner, t) : { morale: l.army.morale, familiarity: 0, here: point }
    // The lord at its head adds his own gift for war in full (CLAUDE.md §8.2.1).
    const king = !!owner && game.leadsArmy(owner, l.army.led_by, t)
    const faith = owner ? game.battleSpirit(owner, t, king) : 0
    return { kingdom: l.army.kingdom_id, army: l.army.id, soldiers: l.army.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(l.army), faith, ...(king && { king: true }) }
  }
  const attackers = a.map(fighter)
  const defenders = b.map(fighter)
  let defense: { towers: number; walls: number; attackerTowers?: number; keep?: number } = { towers: 0, walls: 0 }
  if (besieged !== null) {
    const state = states.get(besieged)
    if (state) {
      const settled = game.advance(state, t).kingdom
      const garrison = game.garrisonOf(settled)
      // The citadel steadies the garrison and adds to its roll (CLAUDE.md §9.8).
      const citadel = game.citadelOf(settled, t)
      defenders.unshift({ kingdom: besieged, army: null, soldiers: game.countOf(garrison), morale: Math.min(100, (settled.happiness ?? 60) + citadel.morale), familiarity: 100, units: garrison, faith: game.battleSpirit(settled, t) })
      const standingAt = (kind: string) => settled.buildings.filter((x: { kind: string; doneAt: number; broken?: boolean }) => x.kind === kind && x.doneAt <= t && !x.broken).length
      // Gates stand in the wall like any other stretch of it.
      // Fortification learnt at the university counts as more wall.
      defense = { towers: standingAt('watchtower'), walls: standingAt('wall') + standingAt('gate') + game.researchEffects(settled, t).fortify, ...(citadel.dice > 0 && { keep: citadel.dice }) }
    }
  }
  // The kingdom that declared the war attacks; in a siege, the besieger.
  const war = pacts.find((p: Pact) => p.kind === 'war' && ((p.from_id === sideA && p.to_id === sideB) || (p.from_id === sideB && p.to_id === sideA)))
  const swap = besieged === null && war?.from_id === sideB
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const att = swap ? defenders : attackers
  const def = swap ? attackers : defenders
  // In the field, each side's watchtowers within reach of the battle stand with it.
  if (besieged === null) {
    const towersOf = (side: Fighter[]) => {
      const kingdoms = new Set(side.map((f) => f.kingdom))
      let n = 0
      for (const k of kingdoms) {
        for (const b of states.get(k)?.buildings ?? []) {
          if (b.kind === 'watchtower' && b.doneAt <= t && dist({ x: b.x + 0.5, y: b.y + 0.5 }, point) <= m.tower.battleRange) n++
        }
      }
      return n
    }
    defense = { towers: towersOf(def), walls: 0, attackerTowers: towersOf(att) }
  }
  const plan = game.planBattle(att, def, seed, defense)
  const ends = t + game.battleMs(plan)
  const { data: battle } = await admin
    .from('battles')
    .insert({
      lobby_id: lobby,
      kind: besieged === null ? 'field' : 'siege',
      x: point.x,
      y: point.y,
      started_at: iso(t),
      ends_at: iso(ends),
      attackers: att,
      defenders: def,
      besieged,
      plan: { ...plan, defense },
      seed,
    })
    .select('id')
    .single()
  // The armies stop where they stand for the length of the battle.
  for (const l of [...a, ...b]) {
    l.engaged = true
    const here = game.armyAt(l.army, t) as Point
    const f = fighter(l)
    await admin
      .from('armies')
      .update({ path: [here], depart_at: iso(t), arrive_at: iso(t), status: 'battle', morale: f.morale, familiarity: f.familiarity, camp: here })
      .eq('id', l.army.id)
  }
  const kingdoms = [...new Set([...att, ...def].map((f) => f.kingdom))]
  await notify(lobby, kingdoms, 'battle_start', { battle: battle?.id, kind: besieged === null ? 'field' : 'siege', at: point, sides: [att.map((f) => nameOf(rows, f.kingdom)), def.map((f) => nameOf(rows, f.kingdom))] }, t)
}

async function finishBattle(battle: { id: number; lobby_id: string; kind: string; ends_at: string; besieged: number | null; attackers: Fighter[]; defenders: Fighter[]; plan: Plan & { defense: { towers: number; walls: number } } }, world: LobbyWorld, now: number) {
  const lobby = battle.lobby_id
  const at = ms(battle.ends_at)
  const plan = battle.plan
  // Claimed first (resolved false → true under the row): two runs meeting here settle it once. Its report follows.
  const { data: mine } = await admin.from('battles').update({ resolved: true }).eq('id', battle.id).eq('resolved', false).select('id').maybeSingle()
  if (!mine) return
  // A siege begun and ended between two runs: its people fled first.
  await siegeBegun(battle, await loadKingdoms(lobby))
  const rows = await loadKingdoms(lobby)
  const states = new Map(rows.filter((r) => r.state).map((r) => [r.id, r.state as Kingdom]))
  const report: Record<string, unknown> = { winner: plan.winner, losses: {} as Record<string, number> }
  const losses = report.losses as Record<string, number>
  // What the dead are put down to in the lords' accounts.
  const cause = battle.kind === 'siege' || battle.kind === 'usurp' ? 'siege' : 'battle'
  const settle = async (side: Fighter[], lost: number[], morale: number, won: boolean) => {
    for (const [i, f] of side.entries()) {
      const loss = lost[i] ?? 0
      const who = f.rebels ? (f.pretender ? `${f.pretender} asileri` : 'Asiler') : f.outlaws ? 'Yağmacılar' : nameOf(rows, f.kingdom)
      losses[who] = (losses[who] ?? 0) + loss
      // A town's rebels, a pretender's men and a band of bandits belong to no one: their losses are counted where they
      // camp (see settleQuell, settlePretender, settleOutlawBattle).
      if (f.rebels || f.outlaws) continue
      if (f.army === null) {
        await mutateKingdom(f.kingdom, at, (k) => {
          const units = game.takeShare(game.garrisonOf(k), loss).left
          return game.book({ ...k, units, soldiers: game.countOf(units) }, {}, { [cause]: loss })
        })
        continue
      }
      const { data } = await admin.from('armies').select('*').eq('id', f.army).maybeSingle()
      const army = data as ArmyRow | null
      if (loss > 0) await mutateKingdom(f.kingdom, at, (k) => game.book({ ...k, fielded: Math.max(0, (k.fielded ?? 0) - loss) }, {}, { [cause]: loss }))
      if (!army) continue
      const soldiers = army.soldiers - loss
      const units = game.takeShare(unitsOf(army), loss).left
      // Goods carried from a town are lost with a beaten (or fallen) army.
      if (!won && army.cargo && game.cargoTotal(army.cargo) > 0) await notify(lobby, [f.kingdom], 'cargo_lost', { goods: army.cargo }, Math.min(at, now))
      if (soldiers <= 0) {
        await admin.from('armies').delete().eq('id', army.id)
        continue
      }
      const here = army.path[army.path.length - 1]
      const familiarity = army.familiarity
      if (won) {
        await admin.from('armies').update({ ...standing(here, at, morale, familiarity), soldiers, units, goal: { kind: 'move' } }).eq('id', army.id)
      } else {
        // The beaten army falls back home.
        const owner = states.get(f.kingdom)
        const door = owner && doorOf(owner)
        const still = { ...army, soldiers, units, morale, status: 'idle' as const, path: [here], depart_at: iso(at), arrive_at: iso(at) }
        const retreat = owner && door ? march(world, still, owner, at, door, { kind: 'home', retreat: true }, game.buildingBlocker([...states].map(([id, st]) => ({ id, buildings: st.buildings })), f.kingdom)) : null
        // With no way home it stays where it is, still out of the fight until it is given a new order.
        const fallback = { ...standing(here, at, morale, familiarity), goal: { kind: 'home', retreat: true } }
        await admin.from('armies').update({ ...(retreat ?? fallback), soldiers, units, morale, cargo: null }).eq('id', army.id)
      }
    }
  }
  await settle(battle.attackers, plan.attackerLosses, plan.attackerMorale, plan.winner === 'attackers')
  await settle(battle.defenders, plan.defenderLosses, plan.defenderMorale, plan.winner === 'defenders')

  // The winners' record, for the lobby's ranking: a field battle or a defence counts as a battle won, a palace taken
  // as a siege won.
  const winners = new Set((plan.winner === 'attackers' ? battle.attackers : battle.defenders).map((f) => f.kingdom))
  // A lord whose side lost may die of grief, now and then (CLAUDE.md §9.1): decided once, from the battle and the realm.
  // (Not for a skirmish with bandits: a nuisance, not a war; nor against a pretender: the throne itself is at stake
  // there, see settlePretender.)
  const house = battle.kind === 'pretender' || battle.kind === 'usurp'
  for (const id of battle.kind === 'outlaw' ? [] : new Set((plan.winner === 'attackers' ? battle.defenders : battle.attackers).map((f) => f.kingdom))) {
    if (winners.has(id) || id === 0 || house) continue
    // A lord who led his army into the lost battle may fall in it (more often); the army goes on without him.
    const led = [...battle.attackers, ...battle.defenders].find((f) => f.kingdom === id && f.king && f.army !== null)
    let fell = ''
    await mutateKingdom(id, at, (k) => {
      fell = ''
      if (led && game.fallStrikes(k, battle.id)) {
        fell = k.dynasty?.king?.name ?? ''
        return game.dieOfGrief(k, at, 'battle')
      }
      return game.griefStrikes(k, battle.id) ? game.dieOfGrief(k, at) : null
    })
    if (led && fell) {
      await admin.from('armies').update({ led_by: null }).eq('id', led.army!)
      const sides = [...new Set([...battle.attackers, ...battle.defenders].map((f) => f.kingdom))]
      await notify(lobby, sides, 'king_fell', { lord: id, name: nameOf(rows, id), king: fell }, at)
    }
  }
  const siegeTaken = battle.kind === 'siege' && plan.winner === 'attackers'
  // Putting down a town's own rebels is no victory for the ranking.
  for (const id of battle.kind === 'revolt' || battle.kind === 'outlaw' || house ? [] : winners) {
    if (id === 0) continue
    await mutateKingdom(id, at, (k) => {
      const record = { ...(k.record ?? {}) }
      if (siegeTaken) record.siegesWon = (record.siegesWon ?? 0) + 1
      else record.battlesWon = (record.battlesWon ?? 0) + 1
      return { ...k, record }
    })
  }

  // A palace taken: its stores are looted and part of its walls knocked down.
  if (battle.kind === 'siege' && battle.besieged !== null && plan.winner === 'attackers') {
    const share = m.siege.lootShare
    // The survivors carry away what they can: a share of each store, no more than their packs hold in all.
    const survivors = battle.attackers.reduce((n, f, i) => n + Math.max(0, f.soldiers - (plan.attackerLosses[i] ?? 0)), 0)
    const carry = survivors * m.siege.carryPerSoldier
    const loot: Record<string, number> = {}
    // More of the people flee a palace taken.
    let fled = 0
    const fleeing = survivors >= game.balance.society.growth.siege.minAttackers
    await mutateKingdom(battle.besieged, at, (k) => {
      const { people } = game.population(k, at)
      fled = fleeing ? Math.min(Math.floor(people), Math.round(people * game.balance.society.growth.siege.takenShare)) : 0
      const stock = { ...k.stock }
      const want: Record<string, number> = {}
      for (const r of ['gold', 'food', 'materials', 'arms']) want[r] = Math.floor(stock[r] * share)
      const total = Object.values(want).reduce((a, b) => a + b, 0)
      const fit = total > carry ? carry / total : 1
      for (const r of ['gold', 'food', 'materials', 'arms']) {
        loot[r] = Math.floor(want[r] * fit)
        stock[r] -= loot[r]
      }
      // Catapults bring down more of the walls.
      const catapults = battle.attackers.reduce((n, f) => n + (f.units?.catapult ?? 0), 0)
      const breakShare = Math.min(1, m.wall.breakShare + catapults * m.catapult.breakPerCatapult)
      let breaking = Math.ceil(k.buildings.filter((b: { kind: string; broken?: boolean }) => b.kind === 'wall' && !b.broken).length * breakShare)
      const buildings = k.buildings.map((b: { kind: string; broken?: boolean }) => (b.kind === 'wall' && !b.broken && breaking-- > 0 ? { ...b, broken: true } : b))
      // The shield against the next siege.
      return { ...k, stock, buildings, people: Math.max(0, people - fled), ...(fled > 0 && { fledAt: at }), happiness: Math.max(0, (k.happiness ?? 60) + game.balance.society.happiness.looted), shieldUntil: at + game.siegeShieldMs(k, at) }
    })
    if (fled > 0) await notify(lobby, [battle.besieged], 'siege_people', { lost: fled, by: nameOf(rows, battle.attackers[0].kingdom), taken: true }, Math.min(at, now))
    report.fled = fled
    const taker = battle.attackers[0].kingdom
    await mutateKingdom(taker, at, (k) => {
      const stock = { ...k.stock }
      for (const [r, n] of Object.entries(loot)) stock[r] += n
      return { ...k, stock }
    })
    report.loot = loot
  }
  // The rebels of a town beaten (the revolt ends) or holding out (CLAUDE.md §8.4).
  const quelled = battle.kind === 'revolt' ? await settleQuell(battle as never, at) : null
  if (quelled) report.town = quelled
  // A band of bandits beaten (gone for a while, its hoard to the lord) or holding on (CLAUDE.md §7.9).
  const outlaw = battle.kind === 'outlaw' ? await settleOutlawBattle(battle as never, at) : null
  if (outlaw) {
    report.outlaw = outlaw.name
    if (outlaw.loot) report.loot = outlaw.loot
  }
  // A pretender put down, holding his camp, or on the throne (CLAUDE.md §9.1.1).
  const claimant = house ? await settlePretender(battle, at) : null
  if (claimant) report.pretender = claimant
  await admin.from('battles').update({ report }).eq('id', battle.id)
  const kingdoms = [...new Set([...battle.attackers, ...battle.defenders].map((f) => f.kingdom))].filter((k) => k !== 0)
  await notify(lobby, kingdoms, 'battle_end', { battle: battle.id, kind: battle.kind, winner: plan.winner, report, ...(quelled && { town: quelled.town, name: quelled.name }), ...(outlaw && { name: outlaw.name }), ...(claimant && { name: claimant.name, usurped: !!claimant.usurped }) }, Math.min(at, now))
}
