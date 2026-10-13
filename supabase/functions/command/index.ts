// Every command that changes the game (CLAUDE.md §11.1). The kingdom is settled up to now with the same `advance` the
// client runs, the command is checked and applied with the shared rules, and the row is written back only if no
// other command got there first (optimistic lock on `version`).
//
// game.js is packages/shared bundled into one file: `bun run fn:bundle` (run by `bun run fn:deploy`).

import { createClient } from 'npm:@supabase/supabase-js@2'
import * as game from '../_shared/game.js'

// The bundle carries no types; these stand in for the shared ones.
// deno-lint-ignore no-explicit-any
type Kingdom = any
// deno-lint-ignore no-explicit-any
type World = any
type Point = { x: number; y: number }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

class Refusal extends Error {}
const refuse = (code: string): never => {
  throw new Refusal(code)
}

// The tiles of each lobby's world, kept for as long as this instance lives.
const worlds = new Map<string, Promise<World>>()
function worldOf(lobby: string): Promise<World> {
  let world = worlds.get(lobby)
  if (!world) {
    world = (async () => {
      const { data, error } = await admin.from('lobby_worlds').select('size, tiles').eq('lobby_id', lobby).single()
      if (error || !data) refuse('lobby')
      const hex = (data!.tiles as string).replace(/^\\x/, '')
      const packed = new Uint8Array(hex.length / 2)
      for (let i = 0; i < packed.length; i++) packed[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      const tiles = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      const size = data!.size as number
      // Placement and plot rules read only terrain and features (see territory.ts).
      return { size, terrain: tiles.subarray(0, size * size), feature: tiles.subarray(size * size) } as unknown as World
    })()
    world.catch(() => worlds.delete(lobby))
    worlds.set(lobby, world)
  }
  return world
}

interface Row {
  id: number
  lobby_id: string
  user_id: string
  name: string | null
  color: string | null
  sites: Point[]
  state: Kingdom | null
  version: number
}

const GOODS: string[] = [...game.GOODS]
// What a player may place: the palace once, then the buildable kinds (the trade post comes with the kingdom).
const PLACEABLE: string[] = ['palace', ...game.BUILDABLE]
const isId = (v: unknown): v is number => Number.isSafeInteger(v)


// A random site for a new kingdom, clear of the kingdoms already in the lobby.
async function rollSite(world: World, lobby: string, seen: Point[]): Promise<Point> {
  const { data } = await admin.from('kingdoms').select('sites, state').eq('lobby_id', lobby)
  const taken = (data ?? []).flatMap((k) => (k.state ? [k.state.site as Point] : []))
  for (let attempt = 0; attempt < 24; attempt++) {
    const site = game.assignStartSite(world, Math.random)
    if (site && game.siteIsClear(site, taken) && !seen.some((s) => s.x === site.x && s.y === site.y)) return site
  }
  return refuse('full')
}

const MAX_OPEN_LOBBIES = 3
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

// A lobby opened by a player: its world is made from a fresh seed here, and the tiles the commands are checked
// against are kept next to it. The player who opens it joins it at once.
// deno-lint-ignore no-explicit-any
async function openLobby(user: string, cmd: any): Promise<string> {
  const name = String(cmd.name ?? '').trim()
  const players = Number(cmd.maxPlayers)
  const password = String(cmd.password ?? '')
  if (!name || name.length > 40 || !(game.LOBBY_SIZES as readonly number[]).includes(players) || password.length > 64) refuse('rejected')
  const { count } = await admin
    .from('lobbies')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user)
    .gt('season_end', new Date().toISOString())
  if ((count ?? 0) >= MAX_OPEN_LOBBIES) refuse('lobbies')
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
  const world = game.generateWorld(seed)
  const tiles = new Uint8Array(world.size * world.size * 2)
  tiles.set(world.terrain, 0)
  tiles.set(world.feature, world.size * world.size)
  const packed = new Uint8Array(await new Response(new Blob([tiles]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
  const { data: lobby, error } = await admin.rpc('open_lobby', { owner: user, lobby_name: name, lobby_seed: seed, players, password })
  if (error || !lobby) throw error ?? new Error('open_lobby')
  const { error: worldError } = await admin.from('lobby_worlds').insert({ lobby_id: lobby, size: world.size, tiles: `\\x${toHex(packed)}` })
  if (worldError) {
    await admin.from('lobbies').delete().eq('id', lobby)
    throw worldError
  }
  worlds.set(lobby, Promise.resolve(world))
  return lobby as string
}

// deno-lint-ignore no-explicit-any
async function run(user: string, lobby: string, cmd: any): Promise<Row> {
  const world = await worldOf(lobby)
  const now = Date.now()
  const { data: found } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby).eq('user_id', user).maybeSingle()
  let row = found as Row | null

  if (cmd.type === 'join') {
    if (row) return row
    const { data: ok } = await admin.rpc('lobby_password_ok', { lobby, password: String(cmd.password ?? '') })
    if (!ok) refuse('password')
    const { data: lobbyRow } = await admin.from('lobbies').select('max_players, season_end').eq('id', lobby).single()
    if (!lobbyRow || new Date(lobbyRow.season_end).getTime() < now) refuse('lobby')
    const { count } = await admin.from('kingdoms').select('id', { count: 'exact', head: true }).eq('lobby_id', lobby)
    if ((count ?? 0) >= lobbyRow!.max_players) refuse('full')
    const site = await rollSite(world, lobby, [])
    const { data, error } = await admin.from('kingdoms').insert({ lobby_id: lobby, user_id: user, sites: [site] }).select().single()
    if (error) refuse('conflict')
    return data as Row
  }
  if (!row) return refuse('member')

  let next: Partial<Row> | null = null
  const state = row.state && game.advance(row.state, now).kingdom
  const stage = state ? game.territoryStage(state, now) : 0
  const need = (): Kingdom => state ?? refuse('founded')
  const changed = (k: Kingdom) => (k === state ? refuse('rejected') : { state: k })

  switch (cmd.type) {
    case 'roll': {
      if (row.state || row.sites.length >= game.balance.economy.siteRolls) refuse('rejected')
      next = { sites: [...row.sites, await rollSite(world, lobby, row.sites)] }
      break
    }
    case 'found': {
      const site = row.sites[cmd.site]
      const name = String(cmd.name ?? '').trim().slice(0, 32)
      const { data: lobbyRow } = await admin.from('lobbies').select('max_players').eq('id', lobby).single()
      // Each kingdom of a lobby has a colour of its own, from as many colours as the lobby has places.
      if (row.state || !site || !name || !game.lobbyColors(lobbyRow?.max_players ?? 0).includes(cmd.color)) refuse('rejected')
      const { data } = await admin.from('kingdoms').select('state, color').eq('lobby_id', lobby).neq('id', row.id).not('state', 'is', null)
      if ((data ?? []).some((k) => k.color === cmd.color)) refuse('color')
      if (!game.siteIsClear(site, (data ?? []).map((k) => k.state.site))) refuse('taken')
      next = { state: game.foundKingdom(world, site, now, name, cmd.color), name, color: cmd.color }
      break
    }
    case 'build': {
      const k = need()
      if (!PLACEABLE.includes(cmd.kind) || !Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) refuse('rejected')
      const error = game.buildError(world, k, stage, cmd.kind, { x: cmd.x | 0, y: cmd.y | 0 }, now)
      if (error) refuse(error)
      next = changed(game.build(world, k, stage, cmd.kind, { x: cmd.x | 0, y: cmd.y | 0 }, now))
      break
    }
    case 'upgrade': {
      const k = need()
      if (!isId(cmd.id)) refuse('rejected')
      const error = game.upgradeError(k, cmd.id, now)
      if (error) refuse(error)
      next = changed(game.upgradeBuilding(k, cmd.id, now))
      break
    }
    case 'upgradeTrade':
      next = changed(game.upgradeTrade(need()))
      break
    case 'tradeGood':
      if (!GOODS.includes(cmd.good)) refuse('rejected')
      next = changed(game.setTradeGood(need(), cmd.good, now))
      break
    case 'workers': {
      // setWorkers clamps to the building's slots at its level.
      const k = need()
      if (!isId(cmd.id) || !k.buildings.some((b: { id: number }) => b.id === cmd.id) || !Number.isFinite(cmd.workers)) refuse('rejected')
      next = { state: game.setWorkers(k, cmd.id, cmd.workers) }
      break
    }
    case 'product': {
      // setProduct keeps the building as it is unless the product is one of its own.
      const k = need()
      if (!isId(cmd.id) || typeof cmd.product !== 'string') refuse('rejected')
      next = changed(game.setProduct(k, cmd.id, cmd.product))
      break
    }
    case 'reset':
      // Testing aid: start the kingdom over in the same lobby.
      next = { state: null, name: null, color: null, sites: [await rollSite(world, lobby, [])] }
      break
    default:
      refuse('unknown')
  }

  const { data, error } = await admin
    .from('kingdoms')
    .update({ ...next, version: row.version + 1, updated_at: new Date(now).toISOString(), ...(cmd.type === 'found' && { founded_at: new Date(now).toISOString() }) })
    .eq('id', row.id)
    .eq('version', row.version)
    .select()
    .maybeSingle()
  // Two kingdoms founded at once in the same colour: the unique index lets only the first through.
  if (error?.code === '23505') refuse('color')
  if (error) throw error
  if (!data) refuse('conflict')
  row = data as Row
  return row
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } }
  if (!auth.user) return json({ error: 'auth' }, 401)
  try {
    const body = await req.json()
    const { ...cmd } = body
    let lobby = body.lobby
    if (cmd.type === 'createLobby') lobby = await openLobby(auth.user.id, cmd)
    if (typeof lobby !== 'string') return json({ error: 'lobby' }, 400)
    if (cmd.type === 'createLobby') cmd.type = 'join'
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await run(auth.user.id, lobby, cmd)
        return json({ lobby, kingdom: { id: row.id, version: row.version, sites: row.sites, state: row.state }, now: Date.now() })
      } catch (e) {
        // Another command changed the kingdom meanwhile: settle again from the new row.
        if (e instanceof Refusal && e.message === 'conflict' && attempt < 2) continue
        throw e
      }
    }
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.message }, 409)
    console.error(e)
    return json({ error: 'server' }, 500)
  }
})
