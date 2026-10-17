// Bandits and pirates on the server (CLAUDE.md §7.9, §8.5). Where the bands and boats are is worked out from the
// lobby's seed and the clock (game.bandsOf, game.boatsOf); lobby_outlaws keeps only what happened to them. Here: the
// armies chasing a band catch it and fight it (a battle of kind 'outlaw', in rounds like any other), the fleets
// chasing a boat catch it and fight it at once (a sea fight), chases that run too long are given up, and each lord's
// share of the bandits' and pirates' hold is written into its state for `advance` (with the envoy's word when it rises
// or clears).

import * as game from './game.js'
import { armyNow, march, unitsOf } from './armies.ts'
import type { ArmyRow } from './armies.ts'
import { admin, iso, ms, mutateKingdom, nameOf, notify } from './server.ts'
import { followTrail } from './caves.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'

// deno-lint-ignore no-explicit-any
type Band = any
// deno-lint-ignore no-explicit-any
type Boat = any
// deno-lint-ignore no-explicit-any
type Fleet = any

const O = game.balance.outlaws
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const seedOf = (...values: number[]) => values.reduce((h, v) => Math.imul(h ^ (Math.floor(v) | 0), 0x01000193) >>> 0, 0x811c9dc5)

const seeds = new Map<string, Promise<number>>()
export function lobbySeed(lobby: string): Promise<number> {
  let found = seeds.get(lobby)
  if (!found) {
    found = (async () => {
      const { data } = await admin.from('lobbies').select('seed').eq('id', lobby).single()
      return Number(data?.seed ?? 0)
    })()
    found.catch(() => seeds.delete(lobby))
    seeds.set(lobby, found)
  }
  return found
}

export interface OutlawDbRow {
  lobby_id: string
  kind: 'band' | 'boat'
  idx: number
  gen: number
  down_until: number | null
  battle: number | null
  shift: number
  losses: number
}

// The lobby's bands and boats as they stand now.
export async function outlawsIn(lobby: string, world: LobbyWorld) {
  const [seed, { data }] = await Promise.all([lobbySeed(lobby), admin.from('lobby_outlaws').select('*').eq('lobby_id', lobby)])
  const rows = ((data ?? []) as OutlawDbRow[]).map((r) => ({ ...r, down_until: r.down_until === null ? null : Number(r.down_until), shift: Number(r.shift ?? 0) }))
  return { seed, rows, bands: game.bandsOf(world.world, seed, rows) as Band[], boats: game.boatsOf(world.world, seed, rows) as Boat[] }
}

// A band's or boat's row, made (as at large) if it has none yet.
const ensureRow = (lobby: string, kind: 'band' | 'boat', idx: number) =>
  admin.from('lobby_outlaws').upsert({ lobby_id: lobby, kind, idx }, { onConflict: 'lobby_id,kind,idx', ignoreDuplicates: true })

const holdingsOf = (kingdoms: Row[]) => kingdoms.map((k) => ({ id: k.id, buildings: k.state?.buildings ?? [] }))

// Sets an army off after the band from where it is at `at`: to where it can meet it (it is faster). Null: no way there.
export function chaseMarch(world: LobbyWorld, army: ArmyRow, owner: Kingdom, kingdoms: Row[], band: Band, at: number, since: number) {
  const { here } = armyNow(army, world, owner, at)
  const meet = game.bandIntercept(band, here, at)
  const holdings = holdingsOf(kingdoms)
  return march(world, army, owner, at, meet.point, { kind: 'chase', band: band.idx, since } as ArmyRow['goal'], game.buildingBlocker(holdings, army.kingdom_id), undefined, game.buildingBlocker(holdings))
}

// An order to chase a band reaching its army (at once in its own lands or with the lord at its head, else by envoy;
// CLAUDE.md §8.2.1). Returns why not, if it cannot be done.
export async function orderChase(world: LobbyWorld, army: ArmyRow, owner: Kingdom, kingdoms: Row[], idx: number, at: number): Promise<string | null> {
  const { bands } = await outlawsIn(army.lobby_id, world)
  const band = bands.find((b: Band) => b.idx === idx)
  if (!band || !game.outlawUp(band, at)) return 'outlaw'
  // Already after it (a repeated order): nothing new, no second word of it.
  if (army.goal?.kind === 'chase' && army.goal.band === idx) return null
  const update = chaseMarch(world, army, owner, kingdoms, band, at, at)
  if (!update) return 'route'
  await admin.from('armies').update(update).eq('id', army.id)
  await notify(army.lobby_id, [army.kingdom_id], 'outlaw_chase', { band: idx, name: band.name, soldiers: band.soldiers }, at)
  return null
}

// The army has caught the band: the fight begins (claimed on the band, so it fights one army at a time).
async function startOutlawBattle(lobby: string, world: LobbyWorld, kingdoms: Row[], army: ArmyRow, band: Band, t: number) {
  const owner = kingdoms.find((r) => r.id === army.kingdom_id)?.state
  if (!owner) return
  const now = armyNow(army, world, owner, t)
  const king = game.leadsArmy(owner, army.led_by, t)
  const attacker = { kingdom: army.kingdom_id, army: army.id, soldiers: army.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(army), faith: game.battleSpirit(owner, t, king), ...(king && { king: true }) }
  const defender = game.bandFighter(band)
  const defense = { towers: 0, walls: 0 }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const plan = game.planBattle([attacker], [defender], seed, defense)
  const ends = t + game.battleMs(plan)
  const point = game.bandAt(band, t) as Point
  const { data: battle } = await admin
    .from('battles')
    .insert({ lobby_id: lobby, kind: 'outlaw', x: point.x, y: point.y, started_at: iso(t), ends_at: iso(ends), attackers: [attacker], defenders: [defender], besieged: null, plan: { ...plan, defense, outlaw: { kind: 'band', idx: band.idx, name: band.name } }, seed })
    .select('id')
    .single()
  if (!battle) return
  await ensureRow(lobby, 'band', band.idx)
  const { data: claimed } = await admin
    .from('lobby_outlaws')
    .update({ battle: battle.id })
    .eq('lobby_id', lobby)
    .eq('kind', 'band')
    .eq('idx', band.idx)
    .is('battle', null)
    .or(`down_until.is.null,down_until.lte.${t}`)
    .select('idx')
    .maybeSingle()
  if (!claimed) {
    await admin.from('battles').delete().eq('id', battle.id)
    return
  }
  await admin
    .from('armies')
    .update({ path: [now.here], depart_at: iso(t), arrive_at: iso(t), status: 'battle', morale: now.morale, familiarity: now.familiarity, camp: now.here, goal: { kind: 'move' } })
    .eq('id', army.id)
  await notify(lobby, [army.kingdom_id], 'battle_start', { battle: battle.id, kind: 'outlaw', at: point, name: band.name, sides: [[nameOf(kingdoms, army.kingdom_id)], [band.name]] }, t)
}

// A fight with a band is over (called as the battle is settled): won, the band is gone for a while (it comes back a
// little stronger) and its hoard goes to the lord; lost, the band goes on from where it fought, fewer by those who fell.
export async function settleOutlawBattle(
  battle: { id: number; lobby_id: string; x: number; y: number; started_at: string; ends_at: string; plan: { outlaw?: { kind: string; idx: number; name: string }; winner: string; defenderLosses: number[] }; attackers: { kingdom: number; soldiers: number }[]; defenders: { soldiers: number }[] },
  at: number,
  world?: LobbyWorld,
) {
  const o = battle.plan.outlaw
  if (!o) return null
  const lobby = battle.lobby_id
  const { data } = await admin.from('lobby_outlaws').select('*').eq('lobby_id', lobby).eq('kind', 'band').eq('idx', o.idx).maybeSingle()
  const row = data as OutlawDbRow | null
  const mine = !!row && Number(row.battle) === battle.id
  const won = battle.plan.winner === 'attackers'
  if (!won) {
    if (mine) {
      const held = ms(battle.ends_at) - ms(battle.started_at)
      await admin
        .from('lobby_outlaws')
        .update({ battle: null, shift: Number(row!.shift ?? 0) + held, losses: (row!.losses ?? 0) + (battle.plan.defenderLosses[0] ?? 0) })
        .eq('lobby_id', lobby)
        .eq('kind', 'band')
        .eq('idx', o.idx)
        .eq('battle', battle.id)
    }
    return { name: o.name, won: false, loot: null }
  }
  if (mine) {
    await admin
      .from('lobby_outlaws')
      .update({ battle: null, down_until: at + O.bands.respawnSeconds * 1000, gen: (row!.gen ?? 0) + 1, losses: 0, shift: 0 })
      .eq('lobby_id', lobby)
      .eq('kind', 'band')
      .eq('idx', o.idx)
      .eq('battle', battle.id)
  }
  // The hoard: by how many the band was when the fight began.
  const lord = battle.attackers[0]?.kingdom
  const want = game.bandLoot(battle.defenders[0]?.soldiers ?? 0) as Record<string, number>
  const loot: Record<string, number> = {}
  if (lord) {
    await mutateKingdom(lord, at, (k) => {
      const stock = { ...k.stock }
      const cap = game.storageCap(k, at)
      for (const g of ['arms', 'materials']) {
        loot[g] = Math.max(0, Math.min(want[g] ?? 0, Math.floor(cap - stock[g])))
        stock[g] += loot[g]
      }
      loot.gold = Math.max(0, Math.min(want.gold ?? 0, Math.floor(game.goldCap(k, at) - stock.gold)))
      stock.gold += loot.gold
      return game.book({ ...k, stock }, { outlawLoot: loot.gold })
    }).catch(() => null)
    // A step further on the trail of the band's clan, to its cave (CLAUDE.md §7.9.1).
    if (world && mine) await followTrail(lobby, world, lord, o.idx, { x: battle.x, y: battle.y }, at).catch((e) => console.error('followTrail', e))
  }
  return { name: o.name, won: true, loot }
}

// ---- The tick's part ----------------------------------------------------------------------------------------------

export async function settleOutlaws(lobby: string, world: LobbyWorld, kingdoms: Row[], from: number, now: number) {
  const { seed, bands, boats } = await outlawsIn(lobby, world)
  // (No early return without bands or boats: every lord still gets its zeroed `outlaws`, which tick_due waits for.)
  const begin = Math.max(from, now - 120_000)

  // Armies chasing a band: caught on the way (within reach at any second since the last run), sent on again where the
  // band slipped by, called off after too long or when the band is gone.
  const { data: chasing } = await admin.from('armies').select('*').eq('lobby_id', lobby).eq('goal->>kind', 'chase')
  for (const army of (chasing ?? []) as ArmyRow[]) {
    if (army.status === 'battle') continue
    const goal = army.goal as unknown as { band: number; since?: number }
    const band = bands.find((b: Band) => b.idx === goal.band)
    const owner = kingdoms.find((r) => r.id === army.kingdom_id)?.state
    if (!owner) continue
    if (!band || !game.outlawUp(band, now)) {
      await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', army.id).eq('goal->>kind', 'chase')
      await notify(lobby, [army.kingdom_id], 'outlaw_gone', { band: goal.band, name: band?.name ?? '?' }, now)
      continue
    }
    // Fighting another lord's army just now: the chase waits for the outcome.
    if (band.battle) continue
    let caught: number | null = null
    for (let t = Math.max(begin, ms(army.depart_at)); t <= now; t += 1000) {
      if (!game.outlawUp(band, t)) continue
      if (dist(game.armyAt(army, t), game.bandAt(band, t)) <= O.bands.chase.contactTiles) {
        caught = t
        break
      }
    }
    if (caught !== null) {
      await startOutlawBattle(lobby, world, kingdoms, army, band, caught)
      band.battle = -1
      continue
    }
    if (ms(army.arrive_at) > now) continue
    const since = goal.since ?? ms(army.depart_at)
    const update = now - since <= O.bands.chase.maxSeconds * 1000 ? chaseMarch(world, army, owner, kingdoms, band, now, since) : null
    if (update) {
      await admin.from('armies').update(update).eq('id', army.id).eq('goal->>kind', 'chase')
      continue
    }
    await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', army.id).eq('goal->>kind', 'chase')
    await notify(lobby, [army.kingdom_id], 'outlaw_escaped', { band: band.idx, name: band.name }, now)
  }

  // Fleets chasing a pirate boat: caught on the way, they fight at once (summed might of the ships; game.pirateFight).
  for (const row of kingdoms) {
    for (const f of (row.state?.navy?.fleets ?? []) as Fleet[]) {
      if (!f.chase) continue
      const boat = boats.find((b: Boat) => b.idx === f.chase.boat)
      const drop = async (kind: string) => {
        await mutateKingdom(row.id, now, (k) => (game.fleetOf(k, f.id)?.chase ? game.dropChase(k, f.id) : null)).catch(() => null)
        await notify(lobby, [row.id], kind, { boat: f.chase.boat, name: boat?.name ?? '?' }, now)
      }
      if (!boat || !game.outlawUp(boat, now)) {
        await drop('pirate_gone')
        continue
      }
      let caught: number | null = null
      const start = Math.max(begin, f.sail?.departAt ?? now)
      for (let t = start; t <= now; t += 1000) {
        const here = game.fleetAt(world.world, row.state, f, t) as Point | null
        if (here && dist(here, game.boatAt(boat, t).at) <= O.boats.chase.contactTiles) {
          caught = t
          break
        }
      }
      if (caught !== null) {
        await pirateBattle(lobby, row, f, boat, caught, now)
        continue
      }
      if ((f.sail?.arriveAt ?? 0) > now) continue
      const since = f.chase.since ?? now
      let moved = false
      if (now - since <= O.boats.chase.maxSeconds * 1000) {
        await mutateKingdom(row.id, now, (k) => {
          const x = game.fleetOf(k, f.id)
          if (!x?.chase) return null
          const next = game.chaseBoat(world.world, k, f.id, boat, now, since)
          moved = next !== k
          return moved ? next : null
        }).catch(() => null)
      }
      if (!moved) await drop('pirate_escaped')
    }
  }

  // Each lord's share of the bandits' and pirates' hold, written when it changes (with word when it rises or clears).
  for (const row of kingdoms) {
    if (!row.state) continue
    const before = row.state.outlaws as { road: number; sea: number; bands?: number; boats?: number } | undefined
    const p = game.pressureOf(world.world, seed, bands, boats, row.state, now)
    if (before && Math.abs(before.road - p.road) < 0.01 && Math.abs(before.sea - p.sea) < 0.01 && (before.bands ?? 0) === p.bands && (before.boats ?? 0) === p.boats) continue
    await mutateKingdom(row.id, now, (k) => ({ ...k, outlaws: p })).catch(() => null)
    const road = before?.road ?? 0
    const sea = before?.sea ?? 0
    if (p.road >= road + O.road.noticeStep) await notify(lobby, [row.id], 'outlaw_road', { share: p.road, bands: p.bands, cut: game.outlawEffects({ outlaws: p }).merchantCut }, now)
    else if (road > 0 && p.road === 0) await notify(lobby, [row.id], 'outlaw_road_clear', {}, now)
    if (p.sea >= sea + O.sea.noticeStep) await notify(lobby, [row.id], 'pirate_waters', { share: p.sea, boats: p.boats }, now)
    else if (sea > 0 && p.sea === 0) await notify(lobby, [row.id], 'pirate_waters_clear', {}, now)
  }
}

// A fleet meets a pirate boat at `t`: a sea fight. Won, the boat is sunk (back after a while, maybe with more boats)
// and its bounty and hold go to the lord; lost, the fleet loses ships and the pirates sail on. Either way the chase
// is over.
async function pirateBattle(lobby: string, row: Row, f: Fleet, boat: Boat, t: number, now: number) {
  const fight = game.pirateFight(f.ships, boat, seedOf(row.id, f.id, t / 1000, boat.idx))
  let won = fight.winner === 'attackers'
  if (won) {
    await ensureRow(lobby, 'boat', boat.idx)
    const { data: claimed } = await admin
      .from('lobby_outlaws')
      .update({ down_until: t + O.boats.respawnSeconds * 1000, gen: (boat.gen ?? 0) + 1 })
      .eq('lobby_id', lobby)
      .eq('kind', 'boat')
      .eq('idx', boat.idx)
      .or(`down_until.is.null,down_until.lte.${t}`)
      .select('idx')
      .maybeSingle()
    // Sunk meanwhile by someone else: nothing left to fight.
    if (!claimed) {
      await mutateKingdom(row.id, now, (k) => (game.fleetOf(k, f.id)?.chase ? game.dropChase(k, f.id) : null)).catch(() => null)
      await notify(lobby, [row.id], 'pirate_gone', { boat: boat.idx, name: boat.name }, now)
      return
    }
  }
  const want = game.boatLoot(boat) as Record<string, number>
  const loot: Record<string, number> = {}
  await mutateKingdom(row.id, now, (k) => {
    const x = game.fleetOf(k, f.id)
    if (!x?.chase || x.chase.boat !== boat.idx) return null
    let next = game.takeFleetLosses(game.dropChase(k, f.id), f.id, fight.attackerLoss)
    if (won) {
      const stock = { ...next.stock }
      const cap = game.storageCap(next, now)
      for (const g of ['arms', 'materials']) {
        loot[g] = Math.max(0, Math.min(want[g] ?? 0, Math.floor(cap - stock[g])))
        stock[g] += loot[g]
      }
      loot.gold = Math.max(0, Math.min(want.gold ?? 0, Math.floor(game.goldCap(next, now) - stock.gold)))
      stock.gold += loot.gold
      const n = game.navyOf(next)
      const l = n.ledger ?? { voyages: 0, units: 0, gold: 0, pirates: 0, lostUnits: 0, sunk: 0, bounty: 0 }
      next = game.book({ ...next, stock, navy: { ...n, ledger: { ...l, pirates: l.pirates + 1, bounty: l.bounty + loot.gold } } }, { outlawLoot: loot.gold })
    }
    return next
  }).catch(() => {
    won = false
    return null
  })
  await notify(
    lobby,
    [row.id],
    'pirate_battle',
    { boat: boat.idx, name: boat.name, won, ships: boat.ships, might: game.boatMight(boat), fleetMight: game.shipMight(f.ships), loss: fight.attackerLoss, rolls: fight.rolls, ...(won && { loot }) },
    t,
  )
}
