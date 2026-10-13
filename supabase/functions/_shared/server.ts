// What the `command` and `tick` functions share: the service client, the lobby's world, writing a kingdom under its
// optimistic lock, the lobby's market, relations and the notices that become the envoy's dialogs.

import { createClient } from 'npm:@supabase/supabase-js@2'
import * as game from './game.js'

// The bundle carries no types; these stand in for the shared ones.
// deno-lint-ignore no-explicit-any
export type Kingdom = any
// deno-lint-ignore no-explicit-any
export type World = any
export type Point = { x: number; y: number }

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

export class Refusal extends Error {}
export const refuse = (code: string): never => {
  throw new Refusal(code)
}

export const iso = (ms: number) => new Date(ms).toISOString()
export const ms = (value: string | null | undefined) => (value ? Date.parse(value) : 0)

// ---- The world --------------------------------------------------------------------------------------------------

export interface LobbyWorld {
  world: World
  // Tiles of the inns (armies recover their morale near them).
  inns: Point[]
}

const worlds = new Map<string, Promise<LobbyWorld>>()

export function worldOf(lobby: string): Promise<LobbyWorld> {
  let found = worlds.get(lobby)
  if (!found) {
    found = (async () => {
      const { data, error } = await admin.from('lobby_worlds').select('size, tiles').eq('lobby_id', lobby).single()
      if (error || !data) refuse('lobby')
      const hex = (data!.tiles as string).replace(/^\\x/, '')
      const packed = new Uint8Array(hex.length / 2)
      for (let i = 0; i < packed.length; i++) packed[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      const tiles = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      const size = data!.size as number
      return makeWorld(size, tiles.subarray(0, size * size), tiles.subarray(size * size))
    })()
    found.catch(() => worlds.delete(lobby))
    worlds.set(lobby, found)
  }
  return found
}

export function makeWorld(size: number, terrain: Uint8Array, feature: Uint8Array): LobbyWorld {
  const inns: Point[] = []
  for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) if (feature[y * size + x] === game.Feature.Inn) inns.push({ x, y })
  // Placement, plot and route rules read only terrain and features.
  return { world: { size, terrain, feature }, inns }
}

export const rememberWorld = (lobby: string, world: LobbyWorld) => worlds.set(lobby, Promise.resolve(world))

// ---- Kingdoms -----------------------------------------------------------------------------------------------------

export interface Row {
  id: number
  lobby_id: string
  user_id: string
  name: string | null
  color: string | null
  sites: Point[]
  state: Kingdom | null
  version: number
  // The lobby ranking's breakdown (game.scoreOf), written with the state.
  score?: unknown
}

export async function loadKingdoms(lobby: string): Promise<Row[]> {
  const { data } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby)
  return (data ?? []) as Row[]
}

export async function lobbyMarket(lobby: string) {
  const { data } = await admin.from('lobbies').select('market').eq('id', lobby).single()
  return (data?.market ?? null) as any
}

// The merchant's sales move the lobby's prices.
export async function applySold(lobby: string, sold: Record<string, number>, at: number) {
  const goods = Object.entries(sold).filter(([, n]) => n !== 0)
  if (goods.length === 0) return
  let market = await lobbyMarket(lobby)
  for (const [good, units] of goods) market = game.afterTrade(market, good, units, at)
  await admin.from('lobbies').update({ market }).eq('id', lobby)
}

// Settles a kingdom up to `at` and applies `change` to it, writing it back only if no one else wrote it meanwhile
// (otherwise it starts over from the new row). `change` returns null to leave it as it is.
export async function mutateKingdom(
  id: number,
  at: number,
  change: (state: Kingdom, row: Row) => Kingdom | null,
  extra: (row: Row) => Partial<Row> = () => ({}),
): Promise<Row | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await admin.from('kingdoms').select('*').eq('id', id).single()
    const row = data as Row | null
    if (!row?.state) return row
    const market = await lobbyMarket(row.lobby_id)
    const settled = game.advance(row.state, at, market)
    const next = change(settled.kingdom, row)
    if (next === null) return row
    const { data: written } = await admin
      .from('kingdoms')
      .update({ state: next, version: row.version + 1, updated_at: iso(Date.now()), score: game.scoreOf(next, at), ...extra(row) })
      .eq('id', id)
      .eq('version', row.version)
      .select()
      .maybeSingle()
    if (written) {
      await applySold(row.lobby_id, settled.sold, at)
      return written as Row
    }
  }
  return refuse('conflict')
}

// ---- Diplomacy ----------------------------------------------------------------------------------------------------

export async function pactsOf(lobby: string): Promise<any[]> {
  const { data } = await admin.from('pacts').select('*').eq('lobby_id', lobby).is('ended_at', null)
  return (data ?? []) as any[]
}

export async function relationOf(lobby: string, x: number, y: number, now: number) {
  const { a, b } = game.pairOf(x, y)
  const { data } = await admin.from('relations').select('*').eq('a', a).eq('b', b).maybeSingle()
  return { value: data ? game.relationAt(data.value, ms(data.at), now) : 0, row: data, lobby }
}

// A kingdom's standing with the whole lobby (see game.reputation).
export async function reputationOf(lobby: string, kingdom: number, now: number) {
  const { data } = await admin.from('relations').select('*').eq('lobby_id', lobby).or(`a.eq.${kingdom},b.eq.${kingdom}`)
  return game.reputation((data ?? []).map((r: { value: number; at: string }) => game.relationAt(r.value, ms(r.at), now))) as number
}

// The counter-espionage a spy of `owner` meets in `target`: the target's own, and its wariness of the owner.
export async function counterAgainst(lobby: string, owner: number, target: number, state: Kingdom, now: number) {
  const { value } = await relationOf(lobby, owner, target, now)
  return (game.counterOf(state) + game.wariness(value)) as number
}

// Adds `delta` to the relation of two kingdoms (after its drift up to now).
export async function changeRelation(lobby: string, x: number, y: number, delta: number, now: number, improved = false) {
  const { a, b } = game.pairOf(x, y)
  const { value } = await relationOf(lobby, x, y, now)
  await admin.from('relations').upsert({
    lobby_id: lobby,
    a,
    b,
    value: game.clampRelation(value + delta),
    at: iso(now),
    ...(improved && { improved_at: iso(now) }),
  })
}

export async function setRelation(lobby: string, x: number, y: number, value: number, now: number) {
  const { a, b } = game.pairOf(x, y)
  await admin.from('relations').upsert({ lobby_id: lobby, a, b, value: game.clampRelation(value), at: iso(now) })
}

// A grievance (casus belli) `holder` may go to war over, for a while.
export async function grantClaim(lobby: string, holder: number, target: number, reason: string, now: number) {
  await admin.from('claims').insert({
    lobby_id: lobby,
    holder_id: holder,
    target_id: target,
    reason,
    expires_at: iso(now + game.balance.diplomacy.casusBelli.seconds * 1000),
  })
}

export async function claimsOf(lobby: string, now: number) {
  const { data } = await admin.from('claims').select('*').eq('lobby_id', lobby).gt('expires_at', iso(now))
  return (data ?? []) as { holder_id: number; target_id: number; reason: string; expires_at: string }[]
}

// The war score of `me` against `enemy` in their war (0 if none).
export async function scoreOf(lobby: string, me: number, enemy: number) {
  const pacts = await pactsOf(lobby)
  const war = pacts.find((p) => p.kind === 'war' && ((p.from_id === me && p.to_id === enemy) || (p.from_id === enemy && p.to_id === me)))
  if (!war) return { war: null, score: 0 }
  const { data } = await admin.from('battles').select('*').eq('lobby_id', lobby).gte('started_at', war.started_at)
  return { war, score: game.warScore(data ?? [], war, me, enemy) as number }
}

// ---- Notices ------------------------------------------------------------------------------------------------------

export async function notify(lobby: string, kingdoms: number[], kind: string, payload: object, showAt?: number) {
  const unique = [...new Set(kingdoms)]
  if (unique.length === 0) return
  await admin.from('notices').insert(
    unique.map((kingdom_id) => ({ lobby_id: lobby, kingdom_id, kind, payload, ...(showAt && { show_at: iso(showAt) }) })),
  )
}

export const nameOf = (rows: Row[], id: number) => rows.find((r) => r.id === id)?.name ?? '?'
