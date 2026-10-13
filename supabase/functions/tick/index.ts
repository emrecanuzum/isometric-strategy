// What comes due on its own (CLAUDE.md §9.7, §11.1). pg_cron calls this every minute while anything is under way
// (see maybe_tick): envoys arrive and proposals expire, caught spies end, orders reach their armies, armies meet,
// lay siege and come home, watchtowers shoot, and battles end. Armies are simulated a little ahead, so a battle can
// be planned before it starts and every screen sees it begin on time.

import * as game from '../_shared/game.js'
import { applyOrder, armiesOf, armyNow, doorOf, march, standing, unitsOf } from '../_shared/armies.ts'
import type { ArmyRow, Order } from '../_shared/armies.ts'
import { answer, arrive } from '../_shared/diplomacy.ts'
import type { EnvoyRow } from '../_shared/diplomacy.ts'
import { admin, changeRelation, grantClaim, iso, loadKingdoms, ms, mutateKingdom, nameOf, notify, pactsOf, worldOf } from '../_shared/server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from '../_shared/server.ts'

// deno-lint-ignore no-explicit-any
type Pact = any
interface Fighter {
  kingdom: number
  army: number | null
  soldiers: number
  morale: number
  familiarity: number
  units?: Record<string, number>
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

Deno.serve(async (req) => {
  if (req.headers.get('x-tick-secret') !== Deno.env.get('TICK_SECRET')) return new Response('no', { status: 401 })
  const now = Date.now()
  const { data: lobbies } = await admin.from('lobbies').select('id, sim_at').gt('season_end', iso(now))
  const done: string[] = []
  for (const lobby of lobbies ?? []) {
    try {
      await tick(lobby.id, lobby.sim_at ? ms(lobby.sim_at) : now - 60_000, now)
      done.push(lobby.id)
    } catch (e) {
      console.error('tick', lobby.id, e)
    }
  }
  return new Response(JSON.stringify({ done }), { headers: { 'Content-Type': 'application/json' } })
})

async function tick(lobby: string, simAt: number, now: number) {
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
    if (why) await notify(lobby, [order.kingdom_id], 'order_failed', { order: order.payload, why }, at)
  }

  // Battles that are over.
  const { data: ending } = await admin.from('battles').select('*').eq('lobby_id', lobby).eq('resolved', false).lte('ends_at', iso(now))
  for (const battle of ending ?? []) await finishBattle(battle, world, now)

  rows = await loadKingdoms(lobby)
  pacts = await pactsOf(lobby)
  await moveArmies(lobby, world, rows, pacts, Math.max(simAt, now - BEHIND_MS), now)
  await admin.from('lobbies').update({ sim_at: iso(now) }).eq('id', lobby)
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
      await admin.from('armies').delete().eq('id', a.id)
      await mutateKingdom(a.kingdom_id, ms(a.arrive_at), (k) => {
        const units = game.addUnits(game.garrisonOf(k), unitsOf(a))
        return { ...k, units, soldiers: game.countOf(units), fielded: Math.max(0, (k.fielded ?? 0) - a.soldiers) }
      })
      l.engaged = true
    } else if (a.goal.kind === 'move') {
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
      if (game.atWar(pacts, a.kingdom_id, a.goal.kingdom)) await startBattle(lobby, world, rows, states, pacts, live, t, l, null, a.goal.kingdom!)
      else {
        await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', a.id)
        a.goal = { kind: 'move' }
      }
    }
    // Field battles: two armies of kingdoms at war within reach of each other (not one in retreat).
    for (const x of live) {
      if (x.engaged || x.army.goal.retreat) continue
      for (const y of live) {
        if (y.engaged || x.engaged || y.army.goal.retreat || y.army.id <= x.army.id) continue
        if (!game.atWar(pacts, x.army.kingdom_id, y.army.kingdom_id)) continue
        if (dist(here.get(x.army.id)!, here.get(y.army.id)!) > m.contactTiles) continue
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

  for (const [id, seconds] of exposure) {
    const l = live.find((x) => x.army.id === id)!
    const total = (l.army.exposure ?? 0) + seconds
    const killed = Math.min(l.army.soldiers, Math.floor(total / m.tower.secondsPerKill))
    const left = l.army.soldiers - killed
    if (killed > 0) {
      await mutateKingdom(l.army.kingdom_id, now, (k) => ({ ...k, fielded: Math.max(0, (k.fielded ?? 0) - killed) }))
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
    return { kingdom: l.army.kingdom_id, army: l.army.id, soldiers: l.army.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(l.army) }
  }
  const attackers = a.map(fighter)
  const defenders = b.map(fighter)
  let defense = { towers: 0, walls: 0 }
  if (besieged !== null) {
    const state = states.get(besieged)
    if (state) {
      const settled = game.advance(state, t).kingdom
      const garrison = game.garrisonOf(settled)
      defenders.unshift({ kingdom: besieged, army: null, soldiers: game.countOf(garrison), morale: settled.happiness ?? 60, familiarity: 100, units: garrison })
      const standingAt = (kind: string) => settled.buildings.filter((x: { kind: string; doneAt: number; broken?: boolean }) => x.kind === kind && x.doneAt <= t && !x.broken).length
      defense = { towers: standingAt('watchtower'), walls: standingAt('wall') }
    }
  }
  // The kingdom that declared the war attacks; in a siege, the besieger.
  const war = pacts.find((p: Pact) => p.kind === 'war' && ((p.from_id === sideA && p.to_id === sideB) || (p.from_id === sideB && p.to_id === sideA)))
  const swap = besieged === null && war?.from_id === sideB
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const att = swap ? defenders : attackers
  const def = swap ? attackers : defenders
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
  const rows = await loadKingdoms(lobby)
  const states = new Map(rows.filter((r) => r.state).map((r) => [r.id, r.state as Kingdom]))
  const report: Record<string, unknown> = { winner: plan.winner, losses: {} as Record<string, number> }
  const losses = report.losses as Record<string, number>
  const settle = async (side: Fighter[], lost: number[], morale: number, won: boolean) => {
    for (const [i, f] of side.entries()) {
      const loss = lost[i] ?? 0
      losses[nameOf(rows, f.kingdom)] = (losses[nameOf(rows, f.kingdom)] ?? 0) + loss
      if (f.army === null) {
        await mutateKingdom(f.kingdom, at, (k) => {
          const units = game.takeShare(game.garrisonOf(k), loss).left
          return { ...k, units, soldiers: game.countOf(units) }
        })
        continue
      }
      const { data } = await admin.from('armies').select('*').eq('id', f.army).maybeSingle()
      const army = data as ArmyRow | null
      if (loss > 0) await mutateKingdom(f.kingdom, at, (k) => ({ ...k, fielded: Math.max(0, (k.fielded ?? 0) - loss) }))
      if (!army) continue
      const soldiers = army.soldiers - loss
      const units = game.takeShare(unitsOf(army), loss).left
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
        const retreat = owner && door ? march(world, still, owner, at, door, { kind: 'home', retreat: true }) : null
        // With no way home it stays where it is, still out of the fight until it is given a new order.
        const fallback = { ...standing(here, at, morale, familiarity), goal: { kind: 'home', retreat: true } }
        await admin.from('armies').update({ ...(retreat ?? fallback), soldiers, units, morale }).eq('id', army.id)
      }
    }
  }
  await settle(battle.attackers, plan.attackerLosses, plan.attackerMorale, plan.winner === 'attackers')
  await settle(battle.defenders, plan.defenderLosses, plan.defenderMorale, plan.winner === 'defenders')

  // A palace taken: its stores are looted and part of its walls knocked down.
  if (battle.kind === 'siege' && battle.besieged !== null && plan.winner === 'attackers') {
    const share = m.siege.lootShare
    const loot: Record<string, number> = {}
    await mutateKingdom(battle.besieged, at, (k) => {
      const stock = { ...k.stock }
      for (const r of ['gold', 'food', 'materials', 'arms']) {
        loot[r] = Math.floor(stock[r] * share)
        stock[r] -= loot[r]
      }
      // Catapults bring down more of the walls.
      const catapults = battle.attackers.reduce((n, f) => n + (f.units?.catapult ?? 0), 0)
      const breakShare = Math.min(1, m.wall.breakShare + catapults * m.catapult.breakPerCatapult)
      let breaking = Math.ceil(k.buildings.filter((b: { kind: string; broken?: boolean }) => b.kind === 'wall' && !b.broken).length * breakShare)
      const buildings = k.buildings.map((b: { kind: string; broken?: boolean }) => (b.kind === 'wall' && !b.broken && breaking-- > 0 ? { ...b, broken: true } : b))
      return { ...k, stock, buildings, happiness: Math.max(0, (k.happiness ?? 60) + game.balance.society.happiness.looted) }
    })
    const taker = battle.attackers[0].kingdom
    await mutateKingdom(taker, at, (k) => {
      const stock = { ...k.stock }
      for (const [r, n] of Object.entries(loot)) stock[r] += n
      return { ...k, stock }
    })
    report.loot = loot
  }
  await admin.from('battles').update({ resolved: true, report }).eq('id', battle.id)
  const kingdoms = [...new Set([...battle.attackers, ...battle.defenders].map((f) => f.kingdom))]
  await notify(lobby, kingdoms, 'battle_end', { battle: battle.id, kind: battle.kind, winner: plan.winner, report }, Math.min(at, now))
}
