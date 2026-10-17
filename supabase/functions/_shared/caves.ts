// The bandits' caves and clans on the server (CLAUDE.md §7.9.1). The caves follow from the lobby's seed
// (game.caveSpots); the clans are rows of lobby_outlaws of kind 'clan' (idx: slot), whose `cave` only the server
// reads. Here: the lobby's first clans settled, the lords' trails (a clan's band beaten: a hint, at last the cave),
// armies marching on a cave they know and the siege fought there (a battle of kind 'cave'), and a clan wiped out: its
// hoard to the lord, a new clan in another cave at once, word to every lord.

import * as game from './game.js'
import { armyNow, march, unitsOf } from './armies.ts'
import type { ArmyRow } from './armies.ts'
import { townsOf } from './towns.ts'
import { admin, iso, ms, mutateKingdom, nameOf, notify } from './server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'
import { lobbySeed } from './outlaws.ts'

// Which cave a clan takes is drawn from the server's own randomness, not the lobby seed: every lord knows the seed and
// the clans' generations, and could otherwise work out the hidden cave (CLAUDE.md §7.9.1).
const secretRoll = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1

// deno-lint-ignore no-explicit-any
type Clan = any
// deno-lint-ignore no-explicit-any
type Cave = any

const K = game.balance.outlaws.clans
const CV = game.balance.outlaws.caves

interface ClanDbRow {
  lobby_id: string
  kind: 'clan'
  idx: number
  gen: number
  born_at: number | null
  battle: number | null
  losses: number
  fallen: { cave: number; at: number; by: number; byName?: string; name: string }[]
  cave: number | null
}

const normal = (r: ClanDbRow): ClanDbRow => ({ ...r, born_at: r.born_at === null ? null : Number(r.born_at), battle: r.battle === null ? null : Number(r.battle), fallen: r.fallen ?? [] })

// The lobby's clans as they stand (with their caves), and the caves.
export async function clansIn(lobby: string, world: LobbyWorld) {
  const [seed, { data }] = await Promise.all([lobbySeed(lobby), admin.from('lobby_outlaws').select('*').eq('lobby_id', lobby).eq('kind', 'clan')])
  const rows = ((data ?? []) as ClanDbRow[]).map(normal)
  return { seed, rows, clans: game.clansOf(seed, rows) as Clan[], caves: game.caveSpots(world.world, seed) as Cave[] }
}

// Caves too near the lords' lands (their last border) or the towns are left for the clans to settle in.
async function avoidOf(lobby: string, kingdoms: Row[]) {
  const stage = game.balance.territory.stageParcels.length - 1
  const lands = kingdoms.filter((k) => k.state?.site).map((k) => game.territoryRect(k.state.site, stage) as { x: number; y: number; size: number })
  const towns = await townsOf(lobby)
  const size = game.balance.towns.size ?? 8
  return (c: Cave) =>
    lands.some((r) => c.x >= r.x - CV.lordClear && c.y >= r.y - CV.lordClear && c.x < r.x + r.size + CV.lordClear && c.y < r.y + r.size + CV.lordClear) ||
    towns.some((t: { x: number; y: number }) => Math.hypot(t.x + size / 2 - c.x, t.y + size / 2 - c.y) < CV.townClear + size / 2)
}

// The lobby's clans settled in their caves if it has none yet (or fewer than it should), and a clan whose cave is no
// longer among the lobby's caves (their number was lowered) moved to a free one.
async function ensureClans(lobby: string, world: LobbyWorld, kingdoms: Row[], now: number) {
  // A cheap look first: the caves (a scan of the whole map) are only worked out when something is to be done.
  const { data: quick } = await admin.from('lobby_outlaws').select('idx, cave, battle').eq('lobby_id', lobby).eq('kind', 'clan')
  const stray = (r: { cave: number | null }, n: number) => r.cave !== null && r.cave >= n
  if ((quick?.length ?? 0) >= K.count && !(quick ?? []).some((r) => stray(r, game.balance.outlaws.caves.count))) return
  const { rows, caves } = await clansIn(lobby, world)
  if (caves.length === 0) return
  const avoid = await avoidOf(lobby, kingdoms)
  const held = rows.map((r) => r.cave).filter((c): c is number => c !== null && c < caves.length)
  for (const r of rows) {
    if (!stray(r, caves.length) || r.battle !== null) continue
    const cave = game.pickCave(caves, secretRoll(), r.idx, r.gen ?? 0, held, [], avoid)
    if (cave === null) continue
    held.push(cave)
    await admin.from('lobby_outlaws').update({ cave }).eq('lobby_id', lobby).eq('kind', 'clan').eq('idx', r.idx).is('battle', null)
  }
  if (rows.length >= K.count) return
  for (let slot = 0; slot < K.count; slot++) {
    if (rows.some((r) => r.idx === slot)) continue
    const cave = game.pickCave(caves, secretRoll(), slot, 0, held, [], avoid)
    if (cave === null) continue
    held.push(cave)
    await admin.from('lobby_outlaws').upsert({ lobby_id: lobby, kind: 'clan', idx: slot, gen: 0, born_at: now, cave }, { onConflict: 'lobby_id,kind,idx', ignoreDuplicates: true })
  }
}

// A lord's army has beaten one of a clan's bands at `from`: the lord follows its trail a step further, and finds the
// cave at the last step (CLAUDE.md §7.9.1).
export async function followTrail(lobby: string, world: LobbyWorld, lord: number, bandIdx: number, from: Point, at: number) {
  const { clans, caves } = await clansIn(lobby, world)
  const clan = clans[game.clanOfBand(bandIdx)]
  if (!clan || clan.cave === null) return
  const cave = caves[clan.cave]
  if (!cave) return
  // deno-lint-ignore no-explicit-any
  let trail: any = null
  let need = 0
  await mutateKingdom(lord, at, (k) => {
    trail = null
    const before = k.caveTrail?.[clan.slot]
    if (before && before.gen === clan.gen && before.cave !== undefined) return null
    need = game.winsToFind(k, at)
    trail = game.followTrail(before, clan.gen, cave, from, need, at)
    return { ...k, caveTrail: { ...(k.caveTrail ?? {}), [clan.slot]: trail } }
  }).catch(() => null)
  if (!trail) return
  if (trail.cave !== undefined) await notify(lobby, [lord], 'cave_found', { slot: clan.slot, clan: clan.name, cave: cave.idx, at: cave.mouth }, at)
  else await notify(lobby, [lord], 'cave_trail', { slot: clan.slot, clan: clan.name, wins: trail.wins, need, dir: trail.dir, far: trail.far ?? null }, at)
}

// An order to lay siege to a clan's cave reaching its army: only a cave the lord has found, of the clan living there
// now. Returns why not.
export async function orderCave(world: LobbyWorld, army: ArmyRow, owner: Kingdom, kingdoms: Row[], slot: number, at: number): Promise<string | null> {
  const { clans, caves } = await clansIn(army.lobby_id, world)
  const clan = clans[slot]
  if (!clan || clan.cave === null) return 'cave'
  const trail = game.trailOf(owner.caveTrail, clan)
  if (!trail || trail.cave !== clan.cave) return 'cave'
  const cave = caves[clan.cave]
  if (!cave) return 'cave'
  const holdings = kingdoms.map((k) => ({ id: k.id, buildings: k.state?.buildings ?? [] }))
  const update = march(world, army, owner, at, cave.mouth, { kind: 'cave', slot, gen: clan.gen } as unknown as ArmyRow['goal'], game.buildingBlocker(holdings, army.kingdom_id), undefined, game.buildingBlocker(holdings))
  if (!update) return 'route'
  await admin.from('armies').update(update).eq('id', army.id)
  return null
}

// ---- The tick's part ----------------------------------------------------------------------------------------------

export async function settleCaves(lobby: string, world: LobbyWorld, kingdoms: Row[], now: number) {
  await ensureClans(lobby, world, kingdoms, now)
  const { data: marching } = await admin.from('armies').select('*').eq('lobby_id', lobby).eq('goal->>kind', 'cave')
  if (!marching?.length) return
  const { seed, clans, caves } = await clansIn(lobby, world)
  for (const army of marching as ArmyRow[]) {
    if (army.status === 'battle' || ms(army.arrive_at) > now) continue
    const goal = army.goal as unknown as { slot: number; gen: number }
    const clan = clans[goal.slot]
    // The clan is gone (wiped out by another lord meanwhile): the cave stands empty.
    if (!clan || clan.gen !== goal.gen || clan.cave === null) {
      await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', army.id).eq('goal->>kind', 'cave')
      await notify(lobby, [army.kingdom_id], 'cave_empty', {}, now)
      continue
    }
    // Another lord's army is fighting at the cave just now: it waits its turn.
    if (clan.battle !== null || !caves[clan.cave]) continue
    await startCaveBattle(lobby, world, kingdoms, army, clan, caves[clan.cave], seed, Math.max(ms(army.arrive_at), now - 60_000))
    clan.battle = -1
  }
}

async function startCaveBattle(lobby: string, world: LobbyWorld, kingdoms: Row[], army: ArmyRow, clan: Clan, cave: Cave, seed: number, t: number) {
  const owner = kingdoms.find((r) => r.id === army.kingdom_id)?.state
  if (!owner) return
  const now = armyNow(army, world, owner, t)
  const king = game.leadsArmy(owner, army.led_by, t)
  const attacker = { kingdom: army.kingdom_id, army: army.id, soldiers: army.soldiers, morale: now.morale, familiarity: now.familiarity, units: unitsOf(army), faith: game.battleSpirit(owner, t, king), ...(king && { king: true }) }
  const defender = game.clanFighter(game.clanGarrison(seed, clan, t))
  // The defenders in their own cave: a bonus on their roll no catapult takes away.
  const defense = { towers: 0, walls: 0, keep: K.caveBonus }
  const battleSeed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const plan = game.planBattle([attacker], [defender], battleSeed, defense)
  const ends = t + game.battleMs(plan)
  const point = cave.mouth as Point
  // The battle row (read by every lord) carries where the army stands, not the cave's mouth itself.
  const { data: battle } = await admin
    .from('battles')
    .insert({ lobby_id: lobby, kind: 'cave', x: now.here.x, y: now.here.y, started_at: iso(t), ends_at: iso(ends), attackers: [attacker], defenders: [defender], besieged: null, plan: { ...plan, defense, outlaw: { kind: 'clan', idx: clan.slot, gen: clan.gen, name: clan.name } }, seed: battleSeed })
    .select('id')
    .single()
  if (!battle) return
  const { data: claimed } = await admin
    .from('lobby_outlaws')
    .update({ battle: battle.id })
    .eq('lobby_id', lobby)
    .eq('kind', 'clan')
    .eq('idx', clan.slot)
    .eq('gen', clan.gen)
    .is('battle', null)
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
  await notify(lobby, [army.kingdom_id], 'battle_start', { battle: battle.id, kind: 'cave', at: point, name: clan.name, sides: [[nameOf(kingdoms, army.kingdom_id)], [clan.name]] }, t)
}

// A siege of a cave is over (called as the battle is settled). Won: the clan is wiped out, its hoard goes to the lord
// (as far as the stores and treasury hold), a new clan settles at once in another cave, its bands come out a while
// later, and every lord hears of it. Lost: the cave holds, fewer by those who fell.
export async function settleCaveBattle(
  battle: { id: number; lobby_id: string; x: number; y: number; plan: { outlaw?: { kind: string; idx: number; gen: number; name: string }; winner: string; defenderLosses: number[] }; attackers: { kingdom: number }[] },
  at: number,
  world: LobbyWorld,
) {
  const o = battle.plan.outlaw
  if (!o) return null
  const lobby = battle.lobby_id
  const { seed, rows, clans, caves } = await clansIn(lobby, world)
  const row = rows.find((r) => r.idx === o.idx)
  const mine = !!row && row.battle === battle.id && row.gen === o.gen
  const won = battle.plan.winner === 'attackers'
  if (!mine) return { name: o.name, won, loot: null, next: null }
  if (!won) {
    await admin
      .from('lobby_outlaws')
      .update({ battle: null, losses: (row!.losses ?? 0) + (battle.plan.defenderLosses[0] ?? 0) })
      .eq('lobby_id', lobby)
      .eq('kind', 'clan')
      .eq('idx', o.idx)
      .eq('battle', battle.id)
    return { name: o.name, won: false, loot: null, next: null }
  }
  const lord = battle.attackers[0]?.kingdom
  const { data: lords } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby)
  const kingdoms = (lords ?? []) as Row[]
  const clan = clans[o.idx]
  const hoard = game.clanHoard(clan, at) as Record<string, number>
  // The new clan: in another cave (not one held, not one razed, away from the lords and towns).
  const fallen = [...row!.fallen, { cave: row!.cave ?? -1, at, by: lord, byName: nameOf(kingdoms, lord), name: o.name }]
  const held = rows.filter((r) => r.idx !== o.idx).map((r) => r.cave).filter((c): c is number => c !== null)
  const gen = row!.gen + 1
  const next = game.pickCave(caves, secretRoll(), o.idx, gen, [...held, row!.cave ?? -1], fallen.map((f) => f.cave), await avoidOf(lobby, kingdoms))
  const { data: done } = await admin
    .from('lobby_outlaws')
    .update({ battle: null, gen, born_at: at, cave: next, losses: 0, fallen })
    .eq('lobby_id', lobby)
    .eq('kind', 'clan')
    .eq('idx', o.idx)
    .eq('battle', battle.id)
    .select('idx')
    .maybeSingle()
  if (!done) return { name: o.name, won, loot: null, next: null }
  // The clan's bands scattered: what they carried and lost goes with them; the new clan's bands start afresh.
  const bandIdx = Array.from({ length: game.balance.outlaws.bands.count }, (_, i) => i).filter((i) => game.clanOfBand(i) === o.idx)
  if (bandIdx.length) await admin.from('lobby_outlaws').update({ losses: 0, shift: 0, battle: null }).eq('lobby_id', lobby).eq('kind', 'band').in('idx', bandIdx).is('battle', null)
  const loot: Record<string, number> = {}
  if (lord) {
    await mutateKingdom(lord, at, (k) => {
      const stock = { ...k.stock }
      const cap = game.storageCap(k, at)
      for (const g of ['arms', 'materials', 'food']) {
        loot[g] = Math.max(0, Math.min(hoard[g] ?? 0, Math.floor(cap - stock[g])))
        stock[g] += loot[g]
      }
      loot.gold = Math.max(0, Math.min(hoard.gold ?? 0, Math.floor(game.goldCap(k, at) - stock.gold)))
      stock.gold += loot.gold
      const record = { ...(k.record ?? {}), cavesTaken: (k.record?.cavesTaken ?? 0) + 1 }
      return game.book({ ...k, stock, record }, { outlawLoot: loot.gold })
    }).catch(() => null)
  }
  const nextName = game.clanName(seed, o.idx, gen)
  const others = kingdoms.filter((k) => k.state && k.id !== lord).map((k) => k.id)
  await notify(lobby, others, 'clan_destroyed', { slot: o.idx, clan: o.name, by: lord, byName: nameOf(kingdoms, lord), next: nextName, mine: false }, at)
  return { name: o.name, won: true, loot, next: nextName }
}
