// Armies on the server (CLAUDE.md §8.2, §9.7): raising them, and the orders that reach them (at once at home, after
// the envoy's ride away from it). Positions, morale and knowledge of the ground are always computed for a moment from
// the route and its times, then written down as the army sets off again.

import * as game from './game.js'
import { admin, iso, refuse } from './server.ts'
import type { Kingdom, LobbyWorld, Point, Row } from './server.ts'

export interface ArmyRow {
  id: number
  lobby_id: string
  kingdom_id: number
  // Until then the commander is in touch: new orders take effect at once (an envoy has just reached it).
  contact_until?: string | null
  soldiers: number
  // Of which kinds (see units.ts).
  units: Record<string, number>
  path: Point[]
  depart_at: string
  arrive_at: string
  status: 'idle' | 'moving' | 'battle'
  // A beaten army falling back home (`retreat`) cannot be caught again before it gets there.
  goal: { kind: 'move' | 'home' | 'siege'; kingdom?: number; retreat?: boolean }
  morale: number
  familiarity: number
  camp: Point
  exposure: number
}

export type Order =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'home' }
  | { kind: 'split'; soldiers: number }
  | { kind: 'merge'; with: number }

// Where a kingdom's soldiers gather: just outside the palace's front corner.
export function doorOf(state: Kingdom): Point | null {
  const palace = state?.buildings?.find((b: { kind: string }) => b.kind === 'palace')
  // Just out in front of the palace gate (its front corner), clear of the walls.
  return palace ? { x: palace.x + palace.size + 0.8, y: palace.y + palace.size + 0.8 } : null
}

const inside = (rect: { x: number; y: number; size: number }, p: Point) => p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.size && p.y < rect.y + rect.size

export const territoryOf = (state: Kingdom, at: number) => game.territoryRect(state.site, game.territoryStage(state, at))

export const inTerritory = (state: Kingdom, p: Point, at: number) => !!state && inside(territoryOf(state, at), p)

// Where an army rests for its morale: in its own lands, by an inn, or out in the field.
export const restFor = (world: LobbyWorld, owner: Kingdom, at: number) => (p: Point) =>
  inTerritory(owner, p, at) ? 'home' : game.nearInn(world.inns, p) ? 'inn' : 'field'

// The army as it stands at `at`: where, how its spirits are and how well it knows the ground.
export function armyNow(army: ArmyRow, world: LobbyWorld, owner: Kingdom, at: number) {
  return {
    here: game.armyAt(army, at) as Point,
    morale: game.moraleAt(army, at, restFor(world, owner, at)) as number,
    familiarity: game.familiarityAt(army, at) as number,
  }
}

// The army standing still at `p` from `at` on.
export const standing = (p: Point, at: number, morale: number, familiarity: number) => ({
  path: [p],
  depart_at: iso(at),
  arrive_at: iso(at),
  status: 'idle' as const,
  morale,
  familiarity,
  camp: p,
})

// Sets the army off from where it is at `at` to `dest`.
// Armies walk around buildings (`blocked`, from every kingdom of the lobby) and stop beside one rather than on it.
export function march(world: LobbyWorld, army: ArmyRow, owner: Kingdom, at: number, dest: Point, goal: ArmyRow['goal'], blocked?: (x: number, y: number) => boolean) {
  const now = armyNow(army, world, owner, at)
  const end = game.standingSpot(world.world, dest, blocked) as Point
  const route = game.findRoute(world.world, now.here, end, blocked) as Point[] | null
  if (!route) return null
  return {
    path: route,
    depart_at: iso(at),
    arrive_at: iso(at + game.travelMs(route)),
    status: 'moving' as const,
    goal,
    morale: now.morale,
    familiarity: now.familiarity,
    camp: now.here,
  }
}

export const isMoving = (army: ArmyRow, at: number) => army.status === 'moving' && Date.parse(army.arrive_at) > at

export async function armiesOf(lobby: string): Promise<ArmyRow[]> {
  const { data } = await admin.from('armies').select('*').eq('lobby_id', lobby)
  return (data ?? []) as ArmyRow[]
}

// Carries out an order that has reached its army at `at`. Returns why not, if it could not be done.
export async function applyOrder(world: LobbyWorld, army: ArmyRow, order: Order, kingdoms: Row[], pacts: any[], at: number): Promise<string | null> {
  const owner = kingdoms.find((k) => k.id === army.kingdom_id)?.state
  if (!owner) return 'army'
  if (army.status === 'battle') return 'battle'
  const now = armyNow(army, world, owner, at)
  if (order.kind === 'move') {
    const target = { x: Math.floor(order.x), y: Math.floor(order.y) }
    // Into the lands of a kingdom it is at war with: lay siege to its palace.
    const enemy = kingdoms.find(
      (k) => k.id !== army.kingdom_id && k.state && inTerritory(k.state, target, at) && game.atWar(pacts, army.kingdom_id, k.id),
    )
    // Sent onto a palace (its own, or one not at war), the army stands at its gate.
    const onPalace = kingdoms.find((k) => k.state?.buildings?.some((b: { kind: string; x: number; y: number; size: number }) => b.kind === 'palace' && inside(b, target)))
    const dest = enemy ? doorOf(enemy.state) ?? target : onPalace ? doorOf(onPalace.state) ?? target : target
    const blocked = game.buildingBlocker(kingdoms.map((k) => k.state ?? {}))
    const update = march(world, army, owner, at, dest, enemy ? { kind: 'siege', kingdom: enemy.id } : { kind: 'move' }, blocked)
    if (!update) return 'route'
    await admin.from('armies').update(update).eq('id', army.id)
    return null
  }
  if (order.kind === 'home') {
    const door = doorOf(owner)
    if (!door) return 'route'
    const update = march(world, army, owner, at, door, { kind: 'home' }, game.buildingBlocker(kingdoms.map((k) => k.state ?? {})))
    if (!update) return 'route'
    await admin.from('armies').update(update).eq('id', army.id)
    return null
  }
  if (order.kind === 'split') {
    const part = Math.floor(order.soldiers)
    if (part < 1 || part >= army.soldiers) return 'soldiers'
    const { count } = await admin.from('armies').select('id', { count: 'exact', head: true }).eq('kingdom_id', army.kingdom_id)
    if ((count ?? 0) >= game.balance.military.maxArmies) return 'armies'
    // Both halves stop where the order found them; each kind is split in proportion.
    const still = standing(now.here, at, now.morale, now.familiarity)
    const { taken, left } = game.takeShare(unitsOf(army), part)
    await admin.from('armies').update({ ...still, soldiers: army.soldiers - part, units: left, goal: { kind: 'move' } }).eq('id', army.id)
    await admin.from('armies').insert({ ...still, lobby_id: army.lobby_id, kingdom_id: army.kingdom_id, soldiers: part, units: taken, goal: { kind: 'move' } })
    return null
  }
  if (order.kind === 'merge') {
    const { data } = await admin.from('armies').select('*').eq('id', order.with).maybeSingle()
    const other = data as ArmyRow | null
    if (!other || other.kingdom_id !== army.kingdom_id || other.id === army.id || other.status === 'battle') return 'army'
    const there = armyNow(other, world, owner, at)
    if (Math.hypot(there.here.x - now.here.x, there.here.y - now.here.y) > game.balance.military.mergeTiles) return 'far'
    const soldiers = army.soldiers + other.soldiers
    const morale = (now.morale * army.soldiers + there.morale * other.soldiers) / soldiers
    const familiarity = (now.familiarity * army.soldiers + there.familiarity * other.soldiers) / soldiers
    await admin
      .from('armies')
      .update({ ...standing(there.here, at, morale, familiarity), soldiers, units: game.addUnits(unitsOf(army), unitsOf(other)), goal: { kind: 'move' } })
      .eq('id', other.id)
    await admin.from('armies').delete().eq('id', army.id)
    return null
  }
  return 'order'
}

// An army's soldiers by kind (older armies were all spearmen).
export const unitsOf = (army: Pick<ArmyRow, 'units' | 'soldiers'>) => (army.units && Object.keys(army.units).length ? army.units : { spear: army.soldiers })

// Raises an army of the given soldiers from the garrison at the palace door.
export async function raiseArmy(row: Row, units: Record<string, number>, at: number) {
  const { count } = await admin.from('armies').select('id', { count: 'exact', head: true }).eq('kingdom_id', row.id)
  if ((count ?? 0) >= game.balance.military.maxArmies) refuse('armies')
  const door = doorOf(row.state)
  if (!door) refuse('palace')
  const state = game.advance(row.state, at).kingdom
  const soldiers = game.countOf(units)
  if (soldiers < 1 || !game.hasUnits(game.garrisonOf(state), units)) refuse('soldiers')
  return { lobby_id: row.lobby_id, kingdom_id: row.id, soldiers, units, ...standing(door!, at, game.balance.military.morale.start, 100), goal: { kind: 'move' } }
}
