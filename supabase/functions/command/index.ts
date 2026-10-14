// Every command that changes the game (CLAUDE.md §11.1, §9.7). The player's kingdom is settled up to now with the
// same `advance` the client runs, the command is checked and applied with the shared rules, and the row is written
// back only if no other command got there first (optimistic lock on `version`). Commands that reach other kingdoms
// (envoys, spies, armies) write their own tables; what then comes due on its own is the `tick` function's work.
//
// game.js is packages/shared bundled into one file: `bun run fn:bundle` (run by `bun run fn:deploy`).

import * as game from '../_shared/game.js'
import { applyOrder, armyNow, inTerritory, raiseArmy } from '../_shared/armies.ts'
import type { ArmyRow, Order } from '../_shared/armies.ts'
import { answer, endTribute, intel } from '../_shared/diplomacy.ts'
import type { EnvoyRow } from '../_shared/diplomacy.ts'
import {
  Refusal,
  admin,
  applySold,
  changeRelation,
  claimsOf,
  grantClaim,
  scoreOf,
  iso,
  loadKingdoms,
  lobbyMarket,
  makeWorld,
  counterAgainst,
  ms,
  mutateKingdom,
  notify,
  pactsOf,
  refuse,
  relationOf,
  rememberWorld,
  worldOf,
} from '../_shared/server.ts'
import type { Kingdom, Point, Row, World } from '../_shared/server.ts'
import { tickLobby } from '../_shared/tick.ts'
import { ensureTowns, townsOf } from '../_shared/towns.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// deno-lint-ignore no-explicit-any
type Pact = any

const GOODS: string[] = [...game.GOODS]
// What a player may place: the palace once, then the buildable kinds (the trade post comes with the kingdom).
const PLACEABLE: string[] = ['palace', ...game.BUILDABLE]
const ENVOYS = ['improve', 'gift', 'tribute', 'alliance', 'peace', 'insult']
const isId = (v: unknown): v is number => Number.isSafeInteger(v)
const whole = (v: unknown, min: number, max: number) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : refuse('rejected'))
const dip = game.balance.diplomacy

// A random site for a new kingdom, clear of the kingdoms already in the lobby.
async function rollSite(world: World, lobby: string, seen: Point[]): Promise<Point> {
  const { data } = await admin.from('kingdoms').select('sites, state').eq('lobby_id', lobby)
  const taken = (data ?? []).flatMap((k) => (k.state ? [k.state.site as Point] : []))
  // Kept clear of the towns too (CLAUDE.md §8.4).
  const towns = await townsOf(lobby)
  for (let attempt = 0; attempt < 24; attempt++) {
    const site = game.assignStartSite(world, Math.random)
    if (site && game.siteIsClear(site, taken) && game.siteClearOfTowns(site, towns) && !seen.some((s) => s.x === site.x && s.y === site.y)) return site
  }
  return refuse('full')
}

// All the sites a player may choose from, shown together from the start (CLAUDE.md §3.2).
async function rollSites(world: World, lobby: string, seen: Point[]): Promise<Point[]> {
  const sites = [...seen]
  while (sites.length < game.balance.economy.siteRolls) sites.push(await rollSite(world, lobby, sites))
  return sites
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
  // A quick look first so a player at the limit is not made to wait for a world; open_lobby counts again under a lock.
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
  if (error?.message === 'lobbies') refuse('lobbies')
  if (error || !lobby) throw error ?? new Error('open_lobby')
  // The world above was made by this revision of the rules; clients make the same one from it.
  const { error: revError } = await admin.from('lobbies').update({ world_rev: game.WORLD_REV }).eq('id', lobby)
  if (revError) {
    await admin.from('lobbies').delete().eq('id', lobby)
    throw revError
  }
  const { error: worldError } = await admin.from('lobby_worlds').insert({ lobby_id: lobby, size: world.size, tiles: `\\x${toHex(packed)}` })
  if (worldError) {
    await admin.from('lobbies').delete().eq('id', lobby)
    throw worldError
  }
  rememberWorld(lobby, makeWorld(world.size, world.terrain, world.feature))
  return lobby as string
}

// ---- Commands on the player's own kingdom ----------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function own(user: string, lobby: string, cmd: any): Promise<Row> {
  const lobbyWorld = await worldOf(lobby)
  const { world } = lobbyWorld
  const now = Date.now()
  // A lobby gets its towns the first time anyone acts in it (older lobbies included; CLAUDE.md §8.4).
  await ensureTowns(lobby, lobbyWorld)
  const { data: found } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby).eq('user_id', user).maybeSingle()
  const row = found as Row | null

  if (cmd.type === 'join') {
    if (row) return row
    // The password, the tries left and the places are checked under the lobby's lock (see join_lobby).
    const site = await rollSite(world, lobby, [])
    const { data: reply, error } = await admin.rpc('join_lobby', { lobby, player: user, first_site: site, password: String(cmd.password ?? '') })
    if (error) throw error
    if (reply !== 'ok') refuse(reply)
    const { data } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby).eq('user_id', user).single()
    const joined = data as Row
    const sites = await rollSites(world, lobby, joined.sites)
    await admin.from('kingdoms').update({ sites }).eq('id', joined.id)
    return { ...joined, sites }
  }
  if (!row) return refuse('member')

  const market = await lobbyMarket(lobby)
  const settled = row.state ? game.advance(row.state, now, market) : null
  const state = settled?.kingdom ?? null
  const stage = state ? game.territoryStage(state, now) : 0
  const need = (): Kingdom => state ?? refuse('founded')
  const changed = (k: Kingdom) => (k === state ? refuse('rejected') : { state: k })
  let next: Partial<Row> | null = null
  let bought: { good: string; units: number } | null = null

  switch (cmd.type) {
    case 'roll': {
      if (row.state || row.sites.length >= game.balance.economy.siteRolls) refuse('rejected')
      // Every remaining site at once (older rows were given one at a time).
      next = { sites: await rollSites(world, lobby, row.sites) }
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
      // A gate may be turned by the player; otherwise it follows the wall around it.
      const turned = cmd.along === 'x' || cmd.along === 'y' ? cmd.along : null
      const error = game.buildError(world, k, stage, cmd.kind, { x: cmd.x | 0, y: cmd.y | 0 }, now, turned)
      if (error) refuse(error)
      next = changed(game.build(world, k, stage, cmd.kind, { x: cmd.x | 0, y: cmd.y | 0 }, now, turned))
      break
    }
    case 'buildMany': {
      // A row laid by dragging (walls, houses).
      const k = need()
      if (!game.STROKE_KINDS.includes(cmd.kind) || !Array.isArray(cmd.spots) || cmd.spots.length > game.balance.economy.maxBatch) refuse('rejected')
      const spots = cmd.spots.map((p: { x: unknown; y: unknown }) => (Number.isFinite(p?.x) && Number.isFinite(p?.y) ? { x: (p.x as number) | 0, y: (p.y as number) | 0 } : refuse('rejected')))
      const { kingdom: built, placed } = game.buildMany(world, k, stage, cmd.kind, spots, now)
      if (!placed) refuse('spot')
      next = { state: built }
      break
    }
    case 'plan': {
      // Builds, moves and demolitions laid out on the map and confirmed together (CLAUDE.md §6.4).
      const k = need()
      if (!Array.isArray(cmd.steps) || cmd.steps.length === 0 || cmd.steps.length > game.balance.economy.maxPlan) refuse('rejected')
      const spot = (p: { x: unknown; y: unknown }) => (Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: (p.x as number) | 0, y: (p.y as number) | 0 } : refuse('rejected'))
      // deno-lint-ignore no-explicit-any
      const steps = cmd.steps.map((s: any) => {
        if (s?.type === 'demolish' && isId(s.id)) return { type: 'demolish', id: s.id }
        if (s?.type === 'move' && isId(s.id)) return { type: 'move', id: s.id, ...spot(s) }
        if (s?.type === 'build' && game.BUILDABLE.includes(s.kind)) return { type: 'build', kind: s.kind, ...spot(s), ...((s.along === 'x' || s.along === 'y') && { along: s.along }) }
        return refuse('rejected')
      })
      const { kingdom: planned, done } = game.applyPlan(world, k, stage, steps, now)
      if (!done) refuse('spot')
      next = { state: planned }
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
    case 'demolish': {
      const k = need()
      if (!isId(cmd.id) || !game.canDemolish(k, cmd.id)) refuse('rejected')
      next = changed(game.demolish(k, cmd.id))
      break
    }
    case 'upgradeTrade':
      next = changed(game.upgradeTrade(need()))
      break
    case 'tradeGood':
      // 'none': the merchant stays home.
      if (cmd.good !== 'none' && !GOODS.includes(cmd.good)) refuse('rejected')
      next = changed(game.setTradeGood(need(), cmd.good === 'none' ? null : cmd.good, now))
      break
    case 'tradeCity': {
      // A free city by its index in the world's cities, or null for the lobby's market (see game.setTradeCity).
      const k = need()
      const { cities } = await worldOf(lobby)
      const index = cmd.city === null ? null : Number.isInteger(cmd.city) && cmd.city >= 0 && cmd.city < cities.length ? cmd.city : refuse('rejected')
      if (now < game.tradeCityReadyAt(k)) refuse('tradeWait')
      next = changed(game.setTradeCity(k, cities, index, now))
      break
    }
    case 'tradeAmount': {
      // Units per trip, in steps and once in a while (see game.tradeAmountError).
      const k = need()
      const units = whole(cmd.units, 1, 10000)
      const error = game.tradeAmountError(k, units, now)
      if (error) refuse(error)
      next = changed(game.setTradeAmount(k, units, now))
      break
    }
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
      if (!k.buildings.some((b: { id: number; kind: string }) => b.id === cmd.id && game.productAllowed(k, b.kind, cmd.product, now))) refuse('locked')
      next = changed(game.setProduct(k, cmd.id, cmd.product, now))
      break
    }
    case 'tax':
      if (!game.TAX_LEVELS.includes(cmd.tax)) refuse('rejected')
      next = { state: game.setTax(need(), cmd.tax) }
      break
    case 'swear': {
      // Fealty to a crown kingdom, by its capital's index in the world's cities (CLAUDE.md §7.8); once a season.
      const k = need()
      const { cities } = await worldOf(lobby)
      const index = Number(cmd.city)
      const error = game.fealtyError(k, index, cities.length)
      if (error) refuse(error)
      next = changed(game.swearFealty(k, index, cities.length))
      break
    }
    case 'queen': {
      const error = game.queenError(need(), now)
      if (error) refuse(error)
      next = changed(game.takeQueen(need(), now))
      break
    }
    case 'train': {
      const count = whole(cmd.count, 1, 200)
      const unit = cmd.unit ?? 'spear'
      if (!game.UNITS.includes(unit)) refuse('rejected')
      const error = game.trainError(need(), count, now, unit)
      if (error) refuse(error)
      next = changed(game.trainSoldiers(need(), count, now, unit))
      break
    }
    case 'disband': {
      const units = Object.fromEntries(
        Object.entries(cmd.units ?? {})
          .filter(([u]) => game.UNITS.includes(u))
          .map(([u, n]) => [u, whole(n, 0, 10000)]),
      )
      next = changed(game.disbandUnits(need(), units))
      break
    }
    case 'nightShift':
      next = { state: game.setNightShift(need(), cmd.on === true) }
      break
    case 'buy': {
      const units = whole(cmd.units, 1, game.balance.market.maxBuy)
      if (!GOODS.includes(cmd.good)) refuse('rejected')
      const error = game.buyError(need(), market, cmd.good, units, now)
      if (error) refuse(error)
      next = changed(game.buy(need(), market, cmd.good, units, now))
      bought = { good: cmd.good, units }
      break
    }
    case 'research': {
      if (typeof cmd.id !== 'string') refuse('rejected')
      const error = game.researchError(need(), cmd.id, now)
      if (error) refuse(error)
      next = changed(game.startResearch(need(), cmd.id, now))
      break
    }
    case 'sermon': {
      const error = game.sermonError(need(), now)
      if (error) refuse(error)
      next = changed(game.preach(need(), now))
      break
    }
    case 'repairTrade':
      next = changed(game.repairTrade(need()))
      break
    case 'repairWalls':
      next = changed(game.repairWalls(need()))
      break
    case 'reset':
      // Testing aid: start the kingdom over in the same lobby (its armies, spies and pacts go with it).
      await admin.from('armies').delete().eq('kingdom_id', row.id)
      await admin.from('spy_missions').update({ ended_at: iso(now), end_reason: 'reset' }).eq('owner_id', row.id).is('ended_at', null)
      await admin.from('pacts').update({ ended_at: iso(now), ended_by: row.id }).or(`from_id.eq.${row.id},to_id.eq.${row.id}`).is('ended_at', null)
      next = { state: null, name: null, color: null, sites: await rollSites(world, lobby, []) }
      break
    case 'seen':
      // The player has the game open (see game.idleFactor).
      next = { state: need() }
      break
    default:
      refuse('unknown')
  }
  // Any command of a founded kingdom marks its ruler as present.
  if (next?.state) next = { ...next, state: { ...next.state, lastSeenAt: now, lobbyKey: game.lobbyKeyOf(lobby) } }
  // The lobby's ranking reads the score kept beside the state.
  if (next?.state) next = { ...next, score: game.scoreOf(next.state as Kingdom, now) }

  const { data, error } = await admin
    .from('kingdoms')
    .update({ ...next, version: row.version + 1, updated_at: iso(now), ...(cmd.type === 'found' && { founded_at: iso(now) }) })
    .eq('id', row.id)
    .eq('version', row.version)
    .select()
    .maybeSingle()
  // Two kingdoms founded at once in the same colour: the unique index lets only the first through.
  if (error?.code === '23505') refuse('color')
  if (error) throw error
  if (!data) refuse('conflict')
  if (settled) await applySold(lobby, settled.sold, now)
  if (bought) await applySold(lobby, { [bought.good]: -bought.units }, now)
  return data as Row
}

// ---- Commands that reach out: envoys, pacts, spies, armies --------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function act(user: string, lobby: string, cmd: any): Promise<unknown> {
  const now = Date.now()
  const rows = await loadKingdoms(lobby)
  const me = rows.find((r) => r.user_id === user)
  if (!me?.state) return refuse('founded')
  const other = (id: unknown) => {
    const row = rows.find((r) => r.id === id && r.id !== me.id)
    return row?.state ? row : refuse('target')
  }
  const pacts = await pactsOf(lobby)
  const between = (p: Pact, x: number, y: number) => (p.from_id === x && p.to_id === y) || (p.from_id === y && p.to_id === x)

  switch (cmd.type) {
    case 'envoy': {
      const to = other(cmd.to)
      if (!ENVOYS.includes(cmd.kind)) refuse('rejected')
      const relation = await relationOf(lobby, me.id, to.id, now)
      const error = game.proposalError(cmd.kind, relation.value, pacts, me.id, to.id, false, relation.terms.max)
      if (error) refuse(error)
      // A peace offer carries its terms, which the war score has to bear.
      let terms: unknown = null
      if (cmd.kind === 'peace') {
        const kind = cmd.terms?.kind ?? 'white'
        if (!['white', 'gold', 'tribute', 'offer'].includes(kind)) refuse('rejected')
        const t = kind === 'white' ? { kind } : { kind, gold: whole(cmd.terms.gold, 1, 100000) }
        const { score } = await scoreOf(lobby, me.id, to.id)
        const why = game.peaceTermsError(t, score)
        if (why) refuse(why)
        if (t.kind === 'offer' && me.state.stock.gold < (t as { gold: number }).gold) refuse('cost')
        terms = t
      }
      const { count } = await admin
        .from('envoys')
        .select('id', { count: 'exact', head: true })
        .eq('from_id', me.id)
        .eq('to_id', to.id)
        .eq('kind', cmd.kind)
        .in('status', ['traveling', 'pending'])
      if (count) refuse('already')
      let gold: number | null = null
      if (cmd.kind === 'improve') {
        const last = ms(relation.row?.improved_at)
        if (last && now - last < dip.improve.cooldownSeconds * 1000) refuse('cooldown')
        const cost = dip.improve.cost
        await mutateKingdom(me.id, now, (k) => (game.affordable(k.stock, cost) ? { ...k, stock: { ...k.stock, gold: k.stock.gold - cost.gold } } : refuse('cost')))
        await changeRelation(lobby, me.id, to.id, 0, now, true)
      } else if (cmd.kind === 'gift') {
        gold = whole(cmd.gold, dip.gift.minGold, 100000)
        await mutateKingdom(me.id, now, (k) => (k.stock.gold >= gold! ? { ...k, stock: { ...k.stock, gold: k.stock.gold - gold! } } : refuse('cost')))
      } else if (cmd.kind === 'tribute') {
        gold = whole(cmd.gold, dip.tribute.minGold, dip.tribute.maxGold)
      } else if (cmd.kind === 'insult') {
        // One insult to the same kingdom every few minutes.
        const { count: recent } = await admin
          .from('envoys')
          .select('id', { count: 'exact', head: true })
          .eq('from_id', me.id)
          .eq('to_id', to.id)
          .eq('kind', 'insult')
          .gte('sent_at', iso(now - dip.insult.cooldownSeconds * 1000))
        if (recent) refuse('cooldown')
      }
      await admin.from('envoys').insert({
        lobby_id: lobby,
        from_id: me.id,
        to_id: to.id,
        kind: cmd.kind,
        gold,
        terms,
        sent_at: iso(now),
        arrive_at: iso(now + dip.envoySeconds * 1000),
      })
      return null
    }
    case 'respond': {
      const { data } = await admin.from('envoys').select('*').eq('id', cmd.envoy).maybeSingle()
      const envoy = data as EnvoyRow | null
      if (!envoy || envoy.to_id !== me.id || envoy.status !== 'pending') refuse('envoy')
      return { accepted: await answer(envoy!, cmd.accept === true, now) }
    }
    case 'endTribute': {
      const pact = pacts.find((p: Pact) => p.id === cmd.pact && p.kind === 'tribute' && (p.from_id === me.id || p.to_id === me.id))
      if (!pact) refuse('pact')
      await endTribute(pact, me.id, now, lobby)
      return null
    }
    case 'breakAlliance': {
      const pact = pacts.find((p: Pact) => p.id === cmd.pact && p.kind === 'alliance' && (p.from_id === me.id || p.to_id === me.id))
      if (!pact) refuse('pact')
      const partner = pact.from_id === me.id ? pact.to_id : pact.from_id
      await admin.from('pacts').update({ ended_at: iso(now), ended_by: me.id }).eq('id', pact.id)
      await changeRelation(lobby, me.id, partner, dip.alliance.break, now)
      await grantClaim(lobby, partner, me.id, 'alliance', now)
      await notify(lobby, [partner], 'alliance_broken', { by: me.name }, now)
      return null
    }
    case 'declareWar': {
      const to = other(cmd.to)
      const relation = await relationOf(lobby, me.id, to.id, now)
      const claim = game.hasClaim(await claimsOf(lobby, now), me.id, to.id, now)
      const error = game.proposalError('war', relation.value, pacts, me.id, to.id, claim)
      if (error) refuse(error)
      // A war without a claim turns every other kingdom against the one who started it.
      if (!claim) {
        for (const r of rows) if (r.state && r.id !== me.id && r.id !== to.id) await changeRelation(lobby, me.id, r.id, dip.casusBelli.infamy, now)
      }
      // Tributes between them end with the war.
      const drop = (o: number) => (k: Kingdom) => ({ ...k, tributes: (k.tributes ?? []).filter((t: { other: number }) => t.other !== o) })
      for (const p of pacts.filter((p: Pact) => p.kind === 'tribute' && between(p, me.id, to.id))) {
        await admin.from('pacts').update({ ended_at: iso(now), ended_by: me.id }).eq('id', p.id)
        await mutateKingdom(me.id, now, drop(to.id))
        await mutateKingdom(to.id, now, drop(me.id))
      }
      await admin.from('pacts').insert({ lobby_id: lobby, kind: 'war', from_id: me.id, to_id: to.id, started_at: iso(now) })
      const told = [to.id, ...game.alliesOf(pacts, to.id), ...game.alliesOf(pacts, me.id)]
      await notify(lobby, told, 'war_declared', { by: me.name, on: to.name, claim }, now)
      return null
    }
    case 'operation': {
      const target = other(cmd.target)
      if (!game.OPERATIONS.includes(cmd.op)) refuse('rejected')
      const theirs = game.advance(target.state, now).kingdom
      const counter = await counterAgainst(lobby, me.id, target.id, theirs, now)
      const { data: missions } = await admin.from('spy_missions').select('*').eq('owner_id', me.id).eq('target_id', target.id).is('ended_at', null)
      const speed = game.networkSpeed(me.state)
      const strength = game.bestStrength(missions ?? [], me.id, target.id, counter, now, speed)
      const error = game.operationError(cmd.op, strength, game.advance(me.state, now).kingdom, theirs)
      if (error) refuse(error)
      const spec = game.operationSpec(cmd.op)
      // Paid, and the pause between operations kept, in the same write as the check (no double spending, no flood).
      const pause = game.balance.espionage.operations.cooldownSeconds * 1000
      await mutateKingdom(me.id, now, (k) => {
        if ((k.lastOperationAt ?? 0) + pause > now) refuse('cooldown')
        if (k.stock.gold < (spec.cost.gold ?? 0)) refuse('cost')
        return { ...k, lastOperationAt: now, stock: { ...k.stock, gold: k.stock.gold - (spec.cost.gold ?? 0) } }
      })
      const success = Math.random() < game.operationChance(cmd.op, strength, counter)
      // The operation spends the network it went through, win or lose: as many points as it needs (see
      // game.operationNetworkCost). Its missions are counted as begun later, so it grows back from what is left.
      const spend = async (gone?: number) => {
        const topic = game.bestTopic(missions ?? [], me.id, target.id, counter, now, speed)
        const running = (missions ?? []).filter(
          (m: { id: number; topic: string; caught_at: string | null }) => m.topic === topic && m.id !== gone && (!m.caught_at || Date.parse(m.caught_at) > now),
        )
        if (running.length === 0) return
        const since = game.networkSince(Math.max(0, strength - game.operationNetworkCost(cmd.op)), running.length, counter, now, speed)
        const moved = running.filter((m: { started_at: string }) => Date.parse(m.started_at) < since).map((m: { id: number }) => m.id)
        if (moved.length > 0) await admin.from('spy_missions').update({ started_at: iso(since) }).in('id', moved)
      }
      if (!success) {
        // The spy is taken: the strongest network there loses its spy, and the target learns who sent it.
        const lost = (missions ?? []).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))[0]
        if (lost) {
          await admin.from('spy_missions').update({ ended_at: iso(now), end_reason: 'caught' }).eq('id', lost.id)
          await mutateKingdom(me.id, now, (k) => ({ ...k, spiesAway: Math.max(0, (k.spiesAway ?? 0) - 1) }))
        }
        await spend(lost?.id)
        await changeRelation(lobby, me.id, target.id, dip.spyCaught, now)
        await grantClaim(lobby, target.id, me.id, 'sabotage', now)
        await notify(lobby, [target.id], 'operation_foiled', { op: cmd.op, by: me.name }, now)
        return { success: false }
      }
      const o = game.balance.espionage.operations
      if (cmd.op === 'burn') {
        await mutateKingdom(target.id, now, (k) => ({
          ...k,
          stock: { ...k.stock, food: k.stock.food * (1 - o.sabotage.burnShare), materials: k.stock.materials * (1 - o.sabotage.burnShare) },
        }))
      } else if (cmd.op === 'delay') {
        await mutateKingdom(target.id, now, (k) => ({
          ...k,
          buildings: k.buildings.map((b: { doneAt: number }) => (b.doneAt > now ? { ...b, doneAt: b.doneAt + (b.doneAt - now) * o.sabotage.delayShare } : b)),
        }))
      } else if (cmd.op === 'kidnap') {
        // The ransom: a share of the gold our spies on its stores reckon it holds (the same estimate their report
        // gives), never under the minimum (see game.ransomFor).
        const stores = Math.round(game.strengthOf(missions ?? [], me.id, target.id, 'stores', counter, now, speed))
        const ransom = game.ransomFor(game.estimate(theirs.stock.gold, stores, (me.id * 1_000_003 + target.id * 101 + 1) | 0, now))
        await mutateKingdom(target.id, now, (k) =>
          k.queen
            ? { ...k, queen: false, queenHeldBy: { id: me.id, name: me.name, ransom }, happiness: Math.max(0, (k.happiness ?? 60) + o.kidnap.shock) }
            : refuse('queen'),
        )
        await mutateKingdom(me.id, now, (k) => ({ ...k, hostages: [...(k.hostages ?? []), { of: target.id, name: target.name, ransom }] }))
        // A queen carried off is soon known: the victim may go to war over it.
        await grantClaim(lobby, target.id, me.id, 'kidnap', now)
      } else if (cmd.op === 'revolt') {
        await mutateKingdom(target.id, now, (k) => ({ ...k, revoltUntil: now + o.revolt.seconds * 1000 }))
      }
      await spend()
      await notify(lobby, [target.id], 'operation_struck', { op: cmd.op, by: cmd.op === 'kidnap' ? me.name : null }, now)
      return { success: true }
    }
    case 'raid': {
      // Soldiers of the garrison fall on another kingdom's merchant: the goods he carries are taken and the trade
      // post is wrecked until repaired. Paid in soldiers either way; the victim learns who did it.
      const target = other(cmd.target)
      const r = dip.raid
      if (game.allied(pacts, me.id, target.id)) refuse('relation')
      const theirs = game.advance(target.state, now).kingdom
      if (!game.hasTradePost(theirs)) refuse('target')
      if (theirs.trade.damaged) refuse('already')
      const pause = r.cooldownSeconds * 1000
      await mutateKingdom(me.id, now, (k) => {
        if ((k.lastRaidAt ?? 0) + pause > now) refuse('cooldown')
        if ((k.soldiers ?? 0) < r.soldiers) refuse('soldiers')
        return { ...k, lastRaidAt: now }
      })
      const chance = game.raidChance(game.towersNear(theirs.buildings, now))
      const success = Math.random() < chance
      const lost = Math.round(r.soldiers * (success ? r.lossOnSuccess : r.lossOnFailure))
      let loot: { good: string; units: number } | null = null
      if (success) {
        await mutateKingdom(target.id, now, (k) => {
          const good = k.trade.good ?? 'food'
          const units = Math.floor(Math.min(k.stock[good], game.tradeUnits(k) * r.lootTrips))
          loot = { good, units }
          return { ...k, stock: { ...k.stock, [good]: k.stock[good] - units }, trade: { ...k.trade, damaged: true } }
        })
      }
      await mutateKingdom(me.id, now, (k) => {
        const units = game.takeShare(game.garrisonOf(k), lost).left
        const stock = { ...k.stock }
        if (loot) stock[loot.good] += loot.units
        return { ...k, units, soldiers: game.countOf(units), stock }
      })
      await changeRelation(lobby, me.id, target.id, r.relation, now)
      await grantClaim(lobby, target.id, me.id, 'raid', now)
      await notify(lobby, [target.id], success ? 'trade_raided' : 'raid_repelled', { by: me.name, ...(loot ?? {}) }, now)
      return { success, lost, loot }
    }
    case 'ransom': {
      // Paying for the queen's return; checked and paid in one write, so two requests cannot both pay.
      // As set when she was taken (older captures: the plain ransom).
      let ransom = game.balance.espionage.operations.kidnap.ransom
      let holder: { id: number; name: string } | null = null
      await mutateKingdom(me.id, now, (k) => {
        holder = k.queenHeldBy ?? null
        if (!holder) refuse('none')
        ransom = k.queenHeldBy.ransom ?? ransom
        if (k.stock.gold < ransom) refuse('cost')
        return { ...k, queen: true, queenHeldBy: null, stock: { ...k.stock, gold: k.stock.gold - ransom } }
      })
      holder = holder!
      await mutateKingdom(holder.id, now, (k) => ({
        ...k,
        stock: { ...k.stock, gold: k.stock.gold + ransom },
        hostages: (k.hostages ?? []).filter((h: { of: number }) => h.of !== me.id),
      }))
      await notify(lobby, [holder.id], 'ransom_paid', { by: me.name, gold: ransom }, now)
      return null
    }
    case 'release': {
      // Sending a held queen home freely mends the relation.
      const target = other(cmd.target)
      await mutateKingdom(me.id, now, (k) =>
        (k.hostages ?? []).some((h: { of: number }) => h.of === target.id)
          ? { ...k, hostages: (k.hostages ?? []).filter((h: { of: number }) => h.of !== target.id) }
          : refuse('none'),
      )
      // Only the queen this kingdom holds goes home.
      await mutateKingdom(target.id, now, (k) => (k.queenHeldBy?.id === me.id ? { ...k, queen: true, queenHeldBy: null } : null))
      await changeRelation(lobby, me.id, target.id, game.balance.espionage.operations.kidnap.release, now)
      await notify(lobby, [target.id], 'queen_released', { by: me.name }, now)
      return null
    }
    case 'spy': {
      const target = other(cmd.target)
      if (!game.SPY_TOPICS.includes(cmd.topic)) refuse('rejected')
      const counter = await counterAgainst(lobby, me.id, target.id, game.advance(target.state, now).kingdom, now)
      const caught = game.catchTime(crypto.getRandomValues(new Uint32Array(1))[0], counter, now)
      // One spy per kingdom and topic, held by a unique index: the mission is written first, so of two requests at
      // once only one gets through, and only then is a spy taken from home (given back if there is none).
      const { data: mission, error } = await admin
        .from('spy_missions')
        .insert({
          lobby_id: lobby,
          owner_id: me.id,
          target_id: target.id,
          topic: cmd.topic,
          started_at: iso(now),
          caught_at: caught === null ? null : iso(caught),
        })
        .select('id')
        .single()
      if (error?.code === '23505') refuse('already')
      if (error || !mission) throw error ?? new Error('spy mission')
      try {
        await mutateKingdom(me.id, now, (k) =>
          (k.spies ?? 0) >= 1 ? { ...k, spies: (k.spies ?? 0) - 1, spiesAway: (k.spiesAway ?? 0) + 1 } : refuse('spies'),
        )
      } catch (e) {
        await admin.from('spy_missions').delete().eq('id', mission.id)
        throw e
      }
      return null
    }
    case 'cast': {
      // The line goes in: the server draws the seed of this cast's game and starts the pause before the next one.
      const settled = game.advance(me.state, now).kingdom
      const why = game.fishError(settled, now)
      if (why) refuse(why)
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0
      await mutateKingdom(me.id, now, (k) => {
        if (game.castReadyAt(k) > now) refuse('busy')
        return { ...k, lastFishAt: now, fishCast: { seed, at: now } }
      })
      return { seed }
    }
    case 'fish': {
      // The cast played out: the server plays the same game again from its seed and the player's presses, and so
      // decides the catch itself; then draws what a catch brings up.
      const cast = me.state.fishCast as { seed: number; at: number } | undefined
      if (!cast || now - cast.at > 90_000) refuse('none')
      const toggles = cmd.toggles
      if (
        !Array.isArray(toggles) ||
        toggles.length > game.FISH_MAX_TOGGLES ||
        !toggles.every((t: unknown, n: number) => Number.isInteger(t) && (t as number) >= 0 && (n === 0 || (t as number) >= toggles[n - 1]))
      )
        refuse('rejected')
      const played = game.replayCast(cast!.seed, toggles)
      // A game cannot end sooner than it takes to play (a little slack for the network).
      const caught = played.caught && now - cast!.at >= (played.steps / 60) * 1000 - 3000
      const rivals = rows
        .filter((r) => r.id !== me.id && r.state)
        .map((r) => ({ name: r.name ?? '?', color: r.color, kingdom: game.advance(r.state, now).kingdom }))
      const bytes = crypto.getRandomValues(new Uint32Array(32))
      let i = 0
      const random = () => bytes[i++ % bytes.length] / 4294967296
      const entry = caught ? game.castReward(random, rivals, now) : { at: now, kind: 'miss' }
      let fresh = true
      await mutateKingdom(me.id, now, (k) => {
        // Settled once only, even if two answers for the same cast arrive together.
        if (k.fishCast?.seed !== cast!.seed) {
          fresh = false
          return null
        }
        const stock = { ...k.stock }
        if (entry.kind === 'bag') for (const [r, v] of Object.entries(entry.goods as Record<string, number>)) stock[r] += v
        return { ...k, stock, fishCast: null, fisherLog: game.logCast(k, entry) }
      })
      if (!fresh) refuse('none')
      return entry
    }
    case 'recall': {
      const { data: mission } = await admin.from('spy_missions').select('*').eq('id', cmd.mission).maybeSingle()
      if (!mission || mission.owner_id !== me.id || mission.ended_at) refuse('mission')
      await admin.from('spy_missions').update({ ended_at: iso(now), end_reason: 'recalled' }).eq('id', mission.id)
      await mutateKingdom(me.id, now, (k) => ({ ...k, spies: (k.spies ?? 0) + 1, spiesAway: Math.max(0, (k.spiesAway ?? 0) - 1) }))
      return null
    }
    case 'intel':
      return await intel(lobby, me.id, other(cmd.target).id, now)
    case 'raise': {
      // Soldiers by kind out of the garrison (a bare number means spearmen, as before kinds).
      const units: Record<string, number> =
        typeof cmd.soldiers === 'number' ? { spear: whole(cmd.soldiers, 1, 10000) } : Object.fromEntries(Object.entries(cmd.units ?? {}).filter(([u]) => game.UNITS.includes(u)).map(([u, n]) => [u, whole(n, 0, 10000)]).filter(([, n]) => (n as number) > 0))
      const army = await raiseArmy(me, units, now)
      const soldiers = game.countOf(units)
      await mutateKingdom(me.id, now, (k) => {
        const garrison = game.garrisonOf(k)
        if (!game.hasUnits(garrison, units)) refuse('soldiers')
        const left = game.subtractUnits(garrison, units)
        return { ...k, units: left, soldiers: game.countOf(left), fielded: (k.fielded ?? 0) + soldiers }
      })
      const { error: armyError } = await admin.from('armies').insert(army)
      if (armyError) {
        // The soldiers go back to the garrison rather than vanish.
        await mutateKingdom(me.id, now, (k) => {
          const back = game.addUnits(game.garrisonOf(k), units)
          return { ...k, units: back, soldiers: game.countOf(back), fielded: Math.max(0, (k.fielded ?? 0) - soldiers) }
        })
        throw armyError
      }
      return null
    }
    case 'army': {
      const world = await worldOf(lobby)
      const { data } = await admin.from('armies').select('*').eq('id', cmd.army).maybeSingle()
      const army = data as ArmyRow | null
      if (!army || army.kingdom_id !== me.id) refuse('army')
      if (army!.status === 'battle') refuse('battle')
      const order = cmd.order as Order
      const valid =
        (order?.kind === 'move' && Number.isFinite(order.x) && Number.isFinite(order.y)) ||
        order?.kind === 'home' ||
        (order?.kind === 'split' && Number.isInteger(order.soldiers)) ||
        (order?.kind === 'merge' && isId(order.with))
      if (!valid) refuse('rejected')
      // Inside its own lands the army hears the order at once, and so it does while an envoy that has just reached it
      // is still at its side; elsewhere the envoy has to ride to it (§8.2.1).
      const { here } = armyNow(army!, world, me.state, now)
      const inTouch = !!army!.contact_until && ms(army!.contact_until) > now
      if (inTerritory(me.state, here, now) || inTouch) {
        const why = await applyOrder(world, army!, order, rows, pacts, now)
        if (why) refuse(why)
        return { at: iso(now) }
      }
      const delay = game.balance.time.messengerDelayGameDays * game.balance.time.gameDayMs
      await admin.from('army_orders').insert({ lobby_id: lobby, army_id: army!.id, kingdom_id: me.id, effective_at: iso(now + delay), payload: order })
      return { at: iso(now + delay) }
    }
    default:
      return refuse('unknown')
  }
}

const OWN = new Set(['join', 'roll', 'found', 'build', 'buildMany', 'plan', 'demolish', 'disband', 'upgrade', 'upgradeTrade', 'tradeGood', 'tradeAmount', 'tradeCity', 'swear', 'workers', 'product', 'tax', 'queen', 'train', 'nightShift', 'buy', 'repairWalls', 'repairTrade', 'research', 'sermon', 'seen', 'reset'])

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
    // Admins may delete any lobby; everything in it goes with it (cascade).
    if (cmd.type === 'deleteLobby') {
      const { data: profile } = await admin.from('profiles').select('is_admin').eq('user_id', auth.user.id).single()
      if (!profile?.is_admin) return json({ error: 'admin' }, 403)
      if (typeof lobby !== 'string') return json({ error: 'lobby' }, 400)
      const { error } = await admin.from('lobbies').delete().eq('id', lobby)
      if (error) throw error
      return json({ deleted: lobby })
    }
    if (cmd.type === 'createLobby') lobby = await openLobby(auth.user.id, cmd)
    if (typeof lobby !== 'string') return json({ error: 'lobby' }, 400)
    // A member's nudge when something it can see has come due (a battle over, an envoy arrived): settle the lobby now
    // instead of at the next minute's tick. At most one run every few seconds per lobby.
    if (cmd.type === 'settle') {
      const { count } = await admin.from('kingdoms').select('id', { count: 'exact', head: true }).eq('lobby_id', lobby).eq('user_id', auth.user.id)
      if (!count) return json({ error: 'member' }, 403)
      return json({ ran: await tickLobby(lobby, Date.now()) })
    }
    if (cmd.type === 'createLobby') cmd.type = 'join'
    for (let attempt = 0; ; attempt++) {
      try {
        let result: unknown = null
        let row: Row
        if (OWN.has(cmd.type)) row = await own(auth.user.id, lobby, cmd)
        else {
          result = await act(auth.user.id, lobby, cmd)
          const { data } = await admin.from('kingdoms').select('*').eq('lobby_id', lobby).eq('user_id', auth.user.id).single()
          row = data as Row
        }
        return json({ lobby, kingdom: { id: row.id, version: row.version, sites: row.sites, state: row.state }, result, now: Date.now() })
      } catch (e) {
        // Another command changed the kingdom meanwhile: settle again from the new row.
        if (e instanceof Refusal && e.message === 'conflict' && attempt < 2 && OWN.has(cmd.type)) continue
        throw e
      }
    }
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.message }, 409)
    console.error(e)
    return json({ error: 'server' }, 500)
  }
})
