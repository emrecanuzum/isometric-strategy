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
  // The free cities (no battles near them; armies rest there as at an inn), in the order world.cities has them.
  cities: Point[]
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
  return { world: { size, terrain, feature }, inns, cities: game.citiesOf({ size, feature }) }
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

// When the lobby's season began (ms), which the calendar and its seasons count from (CLAUDE.md §2).
const seasonStarts = new Map<string, Promise<number>>()
export function seasonStartOf(lobby: string): Promise<number> {
  let found = seasonStarts.get(lobby)
  if (!found) {
    found = (async () => {
      const { data, error } = await admin.from('lobbies').select('season_start').eq('id', lobby).single()
      if (error || !data) refuse('lobby')
      return ms(data!.season_start as string)
    })()
    found.catch(() => seasonStarts.delete(lobby))
    seasonStarts.set(lobby, found)
  }
  return found
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

// The crown kingdoms the kingdoms are sworn to, by id (CLAUDE.md §7.8; none for one not sworn).
async function liegesOf(filter: { lobby: string } | { ids: number[] }): Promise<Map<number, number | null>> {
  const query = admin.from('kingdoms').select('id, liege:state->liege')
  const { data } = await ('lobby' in filter ? query.eq('lobby_id', filter.lobby) : query.in('id', filter.ids))
  return new Map((data ?? []).map((r: { id: number; liege: number | null }) => [r.id, r.liege ?? null]))
}

// Where the relation of two kingdoms rests and how high it may go (lords of rival crowns stay cool; see game.relationTerms).
export async function relationTermsOf(x: number, y: number) {
  const lieges = await liegesOf({ ids: [x, y] })
  return game.relationTerms(lieges.get(x), lieges.get(y))
}

export async function relationOf(lobby: string, x: number, y: number, now: number) {
  const { a, b } = game.pairOf(x, y)
  const [{ data }, terms] = await Promise.all([admin.from('relations').select('*').eq('a', a).eq('b', b).maybeSingle(), relationTermsOf(x, y)])
  return { value: data ? game.relationAt(data.value, ms(data.at), now, terms) : terms.rest, row: data, lobby, terms }
}

// A kingdom's standing with the whole lobby (see game.reputation).
export async function reputationOf(lobby: string, kingdom: number, now: number) {
  const [{ data }, lieges] = await Promise.all([admin.from('relations').select('*').eq('lobby_id', lobby).or(`a.eq.${kingdom},b.eq.${kingdom}`), liegesOf({ lobby })])
  return game.reputation(
    (data ?? []).map((r: { a: number; b: number; value: number; at: string }) => game.relationAt(r.value, ms(r.at), now, game.relationTerms(lieges.get(r.a), lieges.get(r.b)))),
  ) as number
}

// The counter-espionage a spy of `owner` meets in `target`: the target's own, and its wariness of the owner.
export async function counterAgainst(lobby: string, owner: number, target: number, state: Kingdom, now: number) {
  const { value } = await relationOf(lobby, owner, target, now)
  return (game.counterOf(state) + game.wariness(value)) as number
}

// Adds `delta` to the relation of two kingdoms (after its drift up to now), within how high it may go.
export async function changeRelation(lobby: string, x: number, y: number, delta: number, now: number, improved = false) {
  const { a, b } = game.pairOf(x, y)
  const { value, terms } = await relationOf(lobby, x, y, now)
  await admin.from('relations').upsert({
    lobby_id: lobby,
    a,
    b,
    value: game.clampRelation(value + delta, terms),
    at: iso(now),
    ...(improved && { improved_at: iso(now) }),
  })
}

export async function setRelation(lobby: string, x: number, y: number, value: number, now: number) {
  const { a, b } = game.pairOf(x, y)
  const terms = await relationTermsOf(x, y)
  await admin.from('relations').upsert({ lobby_id: lobby, a, b, value: game.clampRelation(value, terms), at: iso(now) })
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

// ---- The world's people -------------------------------------------------------------------------------------------

// Food's usual price follows the lobby's people (CLAUDE.md §9.7): written only when it moves a step.
export async function settleFoodDemand(lobby: string, rows: Row[], now: number) {
  let people = 0
  for (const r of rows) {
    if (!r.state) continue
    const p = game.population(r.state, now)
    people += p.villagers + p.soldiers + p.sailors
  }
  const demand = game.foodDemandFor(people) as number
  const market = await lobbyMarket(lobby)
  if (Math.abs((market?.foodDemand ?? 1) - demand) < 1e-6) return
  await admin.from('lobbies').update({ market: game.withFoodDemand(market, demand, now) }).eq('id', lobby)
}

// Marks which lords are at war (their people grow slower, CLAUDE.md §5.2): written only where it changed. `only`
// limits it to some kingdoms.
export async function syncWarFlags(lobby: string, now: number, only?: number[]) {
  const [rows, pacts] = await Promise.all([loadKingdoms(lobby), pactsOf(lobby)])
  for (const r of rows) {
    if (!r.state || (only && !only.includes(r.id))) continue
    const atWar = pacts.some((p) => p.kind === 'war' && (p.from_id === r.id || p.to_id === r.id))
    if (!!r.state.atWar === atWar) continue
    await mutateKingdom(r.id, now, (k) => (!!k.atWar === atWar ? null : { ...k, atWar }))
  }
}
