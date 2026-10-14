// Towns on the server (CLAUDE.md §8.4): placed once per lobby, besieged by the armies sent to them, taken when the
// siege runs its course, and lost when another lord at war with the holder takes them in turn.

import * as game from './game.js'
import { unitsOf } from './armies.ts'
import type { ArmyRow } from './armies.ts'
import { admin, iso, loadKingdoms, ms, mutateKingdom, nameOf, notify } from './server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'

// deno-lint-ignore no-explicit-any
type Pact = any

export interface TownRow {
  id: number
  lobby_id: string
  idx: number
  x: number
  y: number
  kind: string
  name: string
  owner_id: number | null
  garrison: number
  siege: { army: number; kingdom: number; startedAt: number; endsAt: number } | null
}

export async function townsOf(lobby: string): Promise<TownRow[]> {
  const { data } = await admin.from('lobby_towns').select('*').eq('lobby_id', lobby).order('idx')
  return (data ?? []) as TownRow[]
}

// Lobbies known (to this instance) to have their towns already.
const placed = new Set<string>()

// Places the lobby's towns if it has none yet: around every site given out so far (founded or only offered), so none
// lands in a kingdom's lands. Two runs at once insert the same rows; the second is ignored.
export async function ensureTowns(lobby: string, world: LobbyWorld, given?: Row[]) {
  if (placed.has(lobby)) return
  const { count } = await admin.from('lobby_towns').select('id', { count: 'exact', head: true }).eq('lobby_id', lobby)
  if ((count ?? 0) > 0) {
    placed.add(lobby)
    return
  }
  const { data: info } = await admin.from('lobbies').select('seed, max_players').eq('id', lobby).single()
  if (!info) return
  const rows = given ?? (await loadKingdoms(lobby))
  const sites: Point[] = rows.flatMap((r) => [...(r.state?.site ? [r.state.site as Point] : []), ...((r.sites ?? []) as Point[])])
  const spots = game.placeTowns(world.world, info.seed, game.townCount(info.max_players ?? 9), sites)
  const [low, high] = game.balance.towns.garrison
  const towns = spots.map((p: { x: number; y: number; kind: string }, idx: number) => ({
    lobby_id: lobby,
    idx,
    x: p.x,
    y: p.y,
    kind: p.kind,
    name: game.townName(info.seed, idx),
    garrison: low + Math.floor(game.hash(idx, 5, info.seed + 3011) * (high - low + 1)),
  }))
  if (towns.length > 0) await admin.from('lobby_towns').upsert(towns, { onConflict: 'lobby_id,idx', ignoreDuplicates: true })
  placed.add(lobby)
}

// The town whose square holds the tile, if any.
export const townAt = (towns: TownRow[], p: Point) => towns.find((t) => game.inTown(t, p))

// What the holder's state keeps of its towns.
const hold = (k: Kingdom, town: TownRow, held: boolean) => ({
  ...k,
  towns: [...(k.towns ?? []).filter((h: { id: number }) => h.id !== town.id), ...(held ? [{ id: town.id, kind: town.kind }] : [])],
})

// Sieges begun, broken off and ended, up to `now`. Called by the tick after the armies have moved.
export async function settleTowns(lobby: string, rows: Row[], pacts: Pact[], now: number) {
  const towns = await townsOf(lobby)
  if (towns.length === 0) return
  const { data: info } = await admin.from('lobbies').select('seed').eq('id', lobby).single()
  const walled = (town: TownRow) => !!info && game.townWalled(info.seed, town.idx)
  const { data } = await admin.from('armies').select('*').eq('lobby_id', lobby)
  const armies = (data ?? []) as ArmyRow[]
  const byId = new Map(armies.map((a) => [a.id, a]))
  const arrived = (a: ArmyRow) => a.status !== 'moving' || ms(a.arrive_at) <= now

  // Sieges that can no longer go on: the besieger gone, sent elsewhere, beaten, or no longer at war with the holder.
  for (const town of towns) {
    const s = town.siege
    if (!s) continue
    const army = byId.get(s.army)
    const still = army && army.goal.kind === 'town' && army.goal.town === town.id && !army.goal.retreat
    const lawful = town.owner_id === null || game.atWar(pacts, s.kingdom, town.owner_id)
    if (still && lawful) continue
    await admin.from('lobby_towns').update({ siege: null }).eq('id', town.id)
    town.siege = null
    await notify(lobby, [s.kingdom, ...(town.owner_id ? [town.owner_id] : [])], 'town_siege_lifted', { town: town.id, name: town.name }, now)
  }

  // Armies that have reached a town they were sent to: they lay siege if they may, else they just stand there.
  for (const army of armies) {
    const goal = army.goal
    if (goal.kind !== 'town' || !arrived(army) || army.status === 'battle') continue
    const town = towns.find((t) => t.id === goal.town)
    const own = town?.owner_id === army.kingdom_id
    const lawful = town && (town.owner_id === null || game.atWar(pacts, army.kingdom_id, town.owner_id))
    if (!town || own || !lawful) {
      await admin.from('armies').update({ goal: { kind: 'move' }, status: 'idle' }).eq('id', army.id)
      if (town && !own) await notify(lobby, [army.kingdom_id], 'order_failed', { order: { kind: 'town', town: town.id }, why: 'peace' }, now)
      continue
    }
    if (town.siege) continue
    const at = Math.min(now, Math.max(ms(army.arrive_at), now - 60_000))
    const siege = { army: army.id, kingdom: army.kingdom_id, startedAt: at, endsAt: at + game.townSiegeMs(walled(town)) }
    // Only one siege at a time: claimed only if no other army laid one meanwhile.
    const { data: claimed } = await admin.from('lobby_towns').update({ siege }).eq('id', town.id).is('siege', null).select('id').maybeSingle()
    if (!claimed) continue
    town.siege = siege
    if (army.status === 'moving') await admin.from('armies').update({ status: 'idle' }).eq('id', army.id)
    await notify(lobby, [army.kingdom_id, ...(town.owner_id ? [town.owner_id] : [])], 'town_siege', { town: town.id, name: town.name, by: nameOf(rows, army.kingdom_id) }, at)
  }

  // Sieges that have run their course: a free town's garrison costs the besiegers some soldiers; if any are left, the
  // town is theirs.
  for (const town of towns) {
    const s = town.siege
    if (!s || s.endsAt > now) continue
    const army = byId.get(s.army)
    if (!army || army.status === 'battle') continue
    const lost = town.owner_id === null ? Math.min(army.soldiers, game.townLosses(town.garrison, walled(town))) : 0
    const left = army.soldiers - lost
    // Claimed only while this very siege is still on.
    const taking = admin.from('lobby_towns').update(left > 0 ? { siege: null, owner_id: s.kingdom, garrison: 0, taken_at: iso(s.endsAt) } : { siege: null, garrison: Math.max(0, town.garrison - Math.ceil(lost / game.balance.towns.lossPerDefender)) })
    const { data: claimed } = await taking.eq('id', town.id).eq('siege->>army', String(s.army)).eq('siege->>endsAt', String(s.endsAt)).select('id').maybeSingle()
    if (!claimed) continue
    if (lost > 0) {
      await mutateKingdom(s.kingdom, s.endsAt, (k) => ({ ...k, fielded: Math.max(0, (k.fielded ?? 0) - lost) }))
      if (left <= 0) await admin.from('armies').delete().eq('id', army.id)
      else await admin.from('armies').update({ soldiers: left, units: game.takeShare(unitsOf(army), lost).left }).eq('id', army.id)
    }
    if (left <= 0) {
      await notify(lobby, [s.kingdom], 'town_held', { town: town.id, name: town.name, lost }, s.endsAt)
      continue
    }
    await admin.from('armies').update({ goal: { kind: 'move' } }).eq('id', army.id)
    const before = town.owner_id
    await mutateKingdom(s.kingdom, s.endsAt, (k) => hold(k, town, true))
    if (before !== null) await mutateKingdom(before, s.endsAt, (k) => hold(k, town, false))
    await notify(lobby, [s.kingdom, ...(before !== null ? [before] : [])], 'town_taken', { town: town.id, name: town.name, kind: town.kind, by: nameOf(rows, s.kingdom), from: before !== null ? nameOf(rows, before) : null, lost }, s.endsAt)
  }
}
