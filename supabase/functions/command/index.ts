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
  seasonStartOf,
  syncWarFlags,
  worldOf,
} from '../_shared/server.ts'
import type { Kingdom, Point, Row, World } from '../_shared/server.ts'
import { tickLobby } from '../_shared/tick.ts'
import { ensureTowns, townOf, townsOf } from '../_shared/towns.ts'
import type { TownRow } from '../_shared/towns.ts'
import { refuseDemand } from '../_shared/patrols.ts'
import type { VisitRow } from '../_shared/patrols.ts'

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
  // A fair start (CLAUDE.md §4.3): the first tries ask for a trade post plot and a dock plot within reach; a site with
  // neither road nor water nearby leaves its lord without a merchant. Only if none is found is any clear site taken.
  const reachable = (site: Point) => {
    const land = game.territoryRect(site, 0)
    return !!game.findPlot(world, land, game.TileRule.TradePostOnly) && !!game.findPlot(world, land, game.TileRule.DockOnly)
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const site = game.assignStartSite(world, Math.random)
    if (site && game.siteIsClear(site, taken) && game.siteClearOfTowns(site, towns) && !seen.some((s) => s.x === site.x && s.y === site.y) && (attempt >= 16 || reachable(site))) return site
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
  // The realm keeps when its lobby's season began: the calendar's seasons count from it (CLAUDE.md §2).
  const seasonStart = await seasonStartOf(lobby)
  const settled = row.state ? game.advance({ ...row.state, seasonStart }, now, market) : null
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
      const error = game.fealtyError(k, index, cities.length, now)
      if (error) refuse(error)
      next = changed(game.swearFealty(k, index, cities.length, now))
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
      const k = need()
      const after = game.disbandUnits(k, units, now)
      next = changed(after === k ? k : game.book(after, {}, { disband: (k.soldiers ?? 0) - (after.soldiers ?? 0) }))
      break
    }
    case 'nightShift':
      next = { state: game.setNightShift(need(), cmd.on === true) }
      break
    case 'releaseTown': {
      // Letting a held town go (CLAUDE.md §8.4): freed in the lobby first (only by its owner, not while besieged), then
      // dropped from the lord's holdings; a retry after the town was already freed only drops it.
      const k = need()
      const id = Number(cmd.town)
      const { data: town } = await admin.from('lobby_towns').select('*').eq('lobby_id', lobby).eq('id', id).maybeSingle()
      const error = game.releaseTownError(k, id, !!town?.siege)
      if (error) refuse(error)
      if (town && town.owner_id === row.id) {
        const [low, high] = game.balance.towns.revolt.garrison
        // Its rebels, if it has risen, stay on as its garrison.
        const garrison = town.rebels?.count ?? low + Math.floor(game.hash(town.idx, 11, Math.floor(now / 1000)) * (high - low + 1))
        const { data: freed } = await admin.from('lobby_towns').update({ owner_id: null, garrison, rebels: null }).eq('id', id).eq('owner_id', row.id).is('siege', null).select('id').maybeSingle()
        if (!freed) refuse('besieged')
      } else if (town && town.owner_id !== null) refuse('town')
      next = changed(game.releaseTown(k, id))
      break
    }
    case 'townUpkeep':
      // The upkeep paid a town held, for its loyalty (CLAUDE.md §8.4).
      next = changed(game.setTownUpkeep(need(), Number(cmd.town), Number(cmd.level)))
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
    case 'nameChild': {
      // A child of the lord's house named (CLAUDE.md §9.1).
      const k = need()
      const error = game.nameError(k, Number(cmd.id), String(cmd.name ?? ''))
      if (error) refuse(error)
      // Only once: the ruler, the lady and a child the lord has named keep their names.
      next = changed(game.nameChild(k, Number(cmd.id), String(cmd.name)))
      break
    }
    case 'educate': {
      // A child's upbringing chosen: the gift its tutors work on.
      const k = need()
      const error = game.educateError(k, Number(cmd.id), String(cmd.focus), now)
      if (error) refuse(error === 'grown' || error === 'council' ? error : 'rejected')
      next = changed(game.educate(k, Number(cmd.id), cmd.focus, now))
      break
    }
    case 'crisis': {
      // A crisis answered (CLAUDE.md §9.8): the villagers or the garrison sent out, or nothing done.
      const k = need()
      const choice = String(cmd.choice) as 'villagers' | 'army' | 'none'
      if (!['villagers', 'army', 'none'].includes(choice)) refuse('rejected')
      const error = game.crisisError(k, String(cmd.key), choice, now)
      if (error) refuse(error === 'soldiers' ? 'soldiers' : 'rejected')
      const after = game.answerCrisis(k, String(cmd.key), choice, now, (units: unknown, n: number) => game.takeShare(units, n).left, game.countOf)
      const fell = (k.soldiers ?? 0) - (after.soldiers ?? 0)
      next = changed(fell > 0 ? game.book(after, {}, { crisis: fell }) : after)
      break
    }
    case 'choose': {
      // A fortune met one of its two ways (CLAUDE.md §9.8): the cost paid, the gain given, its effects while it lasts.
      const k = need()
      const choice = String(cmd.choice) as 'a' | 'b'
      if (choice !== 'a' && choice !== 'b') refuse('rejected')
      const error = game.dilemmaError(k, String(cmd.key), choice, now)
      if (error) refuse(error === 'afford' ? 'cost' : 'rejected')
      const after = game.answerDilemma(k, String(cmd.key), choice, now)
      const found = Math.max(0, (after.stock.gold ?? 0) - (k.stock.gold ?? 0))
      next = changed(found > 0 ? game.book(after, { other: found }) : after)
      break
    }
    case 'expedition': {
      // A party of villagers sent on a journey, or called home (CLAUDE.md §9.9).
      const k = need()
      if (cmd.action === 'recall') {
        const id = isId(cmd.id) ? cmd.id : refuse('rejected')
        if (game.expeditionRecallError(k, id, now)) refuse('rejected')
        next = changed(game.recallExpedition(k, id, now))
        break
      }
      if (typeof cmd.kind !== 'string' || !game.EXPEDITION_KINDS.includes(cmd.kind)) refuse('rejected')
      const villagers = whole(cmd.villagers, 1, 50)
      // Only known kinds of soldier, in whole numbers.
      const escort: Record<string, number> = {}
      for (const [unit, n] of Object.entries(cmd.escort ?? {})) {
        if (!(game.UNITS as readonly string[]).includes(unit)) refuse('rejected')
        const count = whole(n, 0, 50)
        if (count > 0) escort[unit] = count
      }
      const error = game.expeditionError(k, cmd.kind, villagers, escort, now)
      if (error) refuse(error === 'cost' || error === 'soldiers' || error === 'locked' ? error : 'rejected')
      next = changed(game.startExpedition(k, cmd.kind, villagers, escort, now))
      break
    }
    case 'steward':
      // The steward who turns the villagers out against an unanswered crisis (CLAUDE.md §9.8).
      next = changed(game.setSteward(need(), cmd.on === true))
      break
    case 'repairTrade':
      next = changed(game.repairTrade(need()))
      break
    case 'repairWalls':
      next = changed(game.repairWalls(need()))
      break
    case 'order': {
      // A crown's commission delivered (CLAUDE.md §7.8).
      const k = need()
      const crowns = lobbyWorld.cities.length
      const palace = game.palaceLevel(k, now)
      const error = game.crownOrderError(k, cmd.crown, now, crowns, palace)
      if (error) refuse(error)
      next = changed(game.fulfilOrder(k, cmd.crown, now, crowns, palace, game.cityTripMs(k, lobbyWorld.cities[cmd.crown]), market))
      break
    }
    case 'quest': {
      // A crown's task of the hour taken, or its reward claimed (CLAUDE.md §7.8).
      const k = need()
      const crowns = lobbyWorld.cities.length
      const palace = game.palaceLevel(k, now)
      const action = cmd.action === 'claim' ? 'claim' : 'take'
      const error = game.questError(k, cmd.crown, action, now, crowns, palace)
      if (error) refuse(error)
      next = changed(action === 'take' ? game.takeQuest(k, cmd.crown, now, crowns, palace) : game.claimQuest(k, cmd.crown, now, crowns, palace, game.goldCap(k, now) - k.stock.gold))
      break
    }
    case 'royal': {
      // The liege's royal envoy answered (CLAUDE.md §7.8): its request taken on, turned down, or the lot handed over.
      const k = need()
      const action = String(cmd.action) as 'accept' | 'decline' | 'deliver'
      if (!['accept', 'decline', 'deliver'].includes(action)) refuse('rejected')
      const error = game.royalError(k, action, now, market)
      if (error) refuse(error)
      next = changed(game.answerRoyal(k, action, now, market, game.goldCap(k, now) - k.stock.gold))
      break
    }
    case 'ships': {
      // Ships laid down at the shipyard (CLAUDE.md §8.5).
      const count = whole(cmd.count, 1, 20)
      if (!game.SHIPS.includes(cmd.ship)) refuse('rejected')
      const error = game.shipsError(need(), cmd.ship, count, now)
      if (error) refuse(error)
      next = changed(game.orderShips(need(), cmd.ship, count, now))
      break
    }
    case 'fleet': {
      const k = need()
      const id = Number.isInteger(cmd.fleet) ? cmd.fleet : -1
      switch (cmd.action) {
        case 'form': {
          const ships = game.cleanShips(cmd.ships) ?? refuse('rejected')
          const error = game.formFleetError(k, ships)
          if (error) refuse(error)
          next = changed(game.formFleet(k, ships))
          break
        }
        case 'split': {
          const ships = game.cleanShips(cmd.ships) ?? refuse('rejected')
          const error = game.splitFleetError(k, id, ships)
          if (error) refuse(error)
          next = changed(game.splitFleet(k, id, ships))
          break
        }
        case 'merge': {
          const error = game.mergeFleetsError(k, id, cmd.other)
          if (error) refuse(error)
          next = changed(game.mergeFleets(k, id, cmd.other))
          break
        }
        case 'sail': {
          // Sent somewhere on the water (CLAUDE.md §8.5): over rivers and lakes only, from where it is now.
          const to = { x: Number(cmd.x), y: Number(cmd.y) }
          const sailed = game.sailFleet(lobbyWorld.world, k, id, to, now)
          if (sailed === k) refuse(game.sailError(lobbyWorld.world, k, id, to, now) ?? 'rejected')
          next = changed(sailed)
          break
        }
        case 'dock': {
          const error = game.dockFleetError(k, id)
          if (error) refuse(error)
          next = changed(game.dockFleet(k, id))
          break
        }
        case 'mission': {
          const o = cmd.order ?? {}
          const kinds = ['port', 'fish', 'hunt', 'sortie', 'trade', 'blockade', 'raid']
          if (!kinds.includes(o.kind)) refuse('rejected')
          const order =
            o.kind === 'trade' ? { kind: 'trade', good: o.good, city: o.city } : o.kind === 'blockade' || o.kind === 'raid' ? { kind: o.kind, target: o.target } : { kind: o.kind }
          // Against another lord: its dock, whether it is already blockaded, and whether we are at war with it.
          let ctx: Record<string, unknown> = { cities: lobbyWorld.cities }
          if (order.kind === 'blockade' || order.kind === 'raid') {
            const { data: t } = await admin.from('kingdoms').select('id, name, state').eq('lobby_id', lobby).eq('id', o.target).neq('id', row.id).maybeSingle()
            if (!t?.state) refuse('target')
            const pacts = await pactsOf(lobby)
            ctx = {
              ...ctx,
              atWar: game.atWar(pacts, row.id, t!.id),
              target: { id: t!.id, name: t!.name ?? '?', dockPlot: t!.state.dockPlot, hasDock: t!.state.buildings.some((b: { kind: string; doneAt: number }) => b.kind === 'dock' && b.doneAt <= now), blockadedBy: t!.state.blockade?.by ?? null },
            }
          }
          const error = game.missionError(k, id, order, now, ctx)
          if (error) refuse(error)
          next = changed(game.setMission(k, id, order, now, ctx))
          break
        }
        case 'recall': {
          const error = game.recallError(k, id, now)
          if (error) refuse(error)
          const m = game.fleetOf(k, id).mission
          let outMs: number | undefined
          if (m.kind === 'blockade' || m.kind === 'raid') {
            const { data: t } = await admin.from('kingdoms').select('id, state').eq('id', m.target).maybeSingle()
            outMs = game.voyageMs(k.dockPlot, t?.state?.dockPlot)
            // A blockade called off leaves the target's waters at once.
            if (t?.state?.blockade?.by === row.id && t.state.blockade.fleet === id) {
              await mutateKingdom(t.id, now, (s) => (s.blockade?.by === row.id ? { ...s, blockade: null } : null))
              await notify(lobby, [t.id], 'blockade_lifted', { by: row.name, why: 'recalled' }, now)
            }
          } else outMs = game.balance.navy.sortieSeconds * 1000
          next = changed(game.recallFleet(k, id, now, outMs))
          break
        }
        default:
          refuse('rejected')
      }
      break
    }
    case 'reset':
      // Testing aid: start the kingdom over in the same lobby (its armies, spies and pacts go with it).
      await admin.from('armies').delete().eq('kingdom_id', row.id)
      await admin.from('spy_missions').update({ ended_at: iso(now), end_reason: 'reset' }).eq('owner_id', row.id).is('ended_at', null)
      await admin.from('pacts').update({ ended_at: iso(now), ended_by: row.id }).or(`from_id.eq.${row.id},to_id.eq.${row.id}`).is('ended_at', null)
      // A crown's tribute demand still waiting on the old lord is dropped: it would otherwise be taken from the new one.
      await admin.from('patrol_visits').update({ status: 'done' }).eq('kingdom_id', row.id).eq('status', 'pending')
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
  // How things stand is kept with it, for the report shown when the ruler comes back after a while.
  // A real command marks the ruler present; the open game's 'seen' only for a while after the last one (presenceAt).
  if (next?.state) next = { ...next, state: { ...next.state, ...game.presenceAt(next.state as Kingdom, now, cmd.type !== 'seen'), seen: game.seenSnapshot(next.state as Kingdom, now), lobbyKey: game.lobbyKeyOf(lobby), seasonStart } }
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

// ---- Mini-game leaderboards (CLAUDE.md §6.5) --------------------------------------------------------------------------

// A verified run on the boards, with the lord's name and colour as they are now (the player's and lobby's names are
// stamped by the database). A failed write costs the player nothing else.
async function recordScore(lobby: string, me: Row, which: string, score: number) {
  const { error } = await admin.from('minigame_scores').insert({ lobby_id: lobby, kingdom_id: me.id, user_id: me.user_id, game: which, score, name: me.name, color: me.color })
  if (error) console.error('minigame score', error)
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
      await syncWarFlags(lobby, now, [me.id, to.id])
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
      const town = cmd.op === 'townRevolt' ? Number(cmd.town) : undefined
      const error = game.operationError(cmd.op, strength, game.advance(me.state, now).kingdom, theirs, town)
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
      } else if (cmd.op === 'townRevolt') {
        // The town's loyalty falls at once; low enough, it rises against its lord (see game.townsRound).
        await mutateKingdom(target.id, now, (k) => game.inciteTown(k, town!, now))
      }
      await spend()
      const townName = cmd.op === 'townRevolt' ? ((await townsOf(lobby)).find((t) => t.id === town)?.name ?? null) : null
      await notify(lobby, [target.id], 'operation_struck', { op: cmd.op, by: cmd.op === 'kidnap' ? me.name : null, ...(townName && { town: townName }) }, now)
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
        return game.book({ ...k, units, soldiers: game.countOf(units), stock }, {}, { raid: lost })
      })
      await changeRelation(lobby, me.id, target.id, r.relation, now)
      await grantClaim(lobby, target.id, me.id, 'raid', now)
      await notify(lobby, [target.id], success ? 'trade_raided' : 'raid_repelled', { by: me.name, ...(loot ?? {}) }, now)
      return { success, lost, loot }
    }
    case 'patrolAnswer': {
      // A rival crown's patrol at the gates demanding tribute (CLAUDE.md §7.8): paid, or refused. Claimed while still
      // pending, so it is answered once.
      const { data } = await admin.from('patrol_visits').select('*').eq('id', Number(cmd.visit)).eq('kingdom_id', me.id).maybeSingle()
      const visit = data as VisitRow | null
      if (!visit || visit.status !== 'pending' || ms(visit.expires_at) <= now) refuse('none')
      // A word with the captain first (once a visit): the server works the outcome out again from the replies and
      // writes the new demand on the visit, so paying, refusing and the payment taken on expiry all go by it.
      if (cmd.talk !== undefined) {
        if (visit!.talk) refuse('talked')
        const { data: info } = await admin.from('lobbies').select('seed').eq('id', lobby).single()
        const outcome = info ? game.tributeTalk(info.seed, visit!.id, cmd.talk) : null
        if (!outcome) refuse('rejected')
        const amount = game.talkedTribute(visit!.amount, outcome!.factor)
        const talk = { replies: cmd.talk as number[], factor: outcome!.factor, angry: outcome!.angry, asked: visit!.amount }
        const { data: talked } = await admin
          .from('patrol_visits')
          .update({ amount, talk })
          .eq('id', visit!.id)
          .eq('status', 'pending')
          .is('talk', null)
          .select('id')
          .maybeSingle()
        if (!talked) refuse('talked')
        visit!.amount = amount
        visit!.talk = talk
        if (cmd.pay === undefined) return { amount, factor: outcome!.factor, angry: outcome!.angry }
      }
      const pay = cmd.pay === true
      if (pay) {
        await mutateKingdom(me.id, now, (k) => {
          if (k.stock.gold < visit!.amount) refuse('cost')
          return game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold - visit!.amount } }, { crownPaid: visit!.amount })
        })
      }
      const { data: claimed } = await admin.from('patrol_visits').update({ status: pay ? 'paid' : 'refused' }).eq('id', visit!.id).eq('status', 'pending').select('id').maybeSingle()
      if (!claimed) {
        // Answered meanwhile (or run out): the gold goes back.
        if (pay) await mutateKingdom(me.id, now, (k) => game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold + visit!.amount } }, { crownPaid: -visit!.amount }))
        refuse('none')
      }
      if (!pay) await refuseDemand(visit!, rows, now)
      // The crown remembers how it was received.
      const r = game.balance.cities.crown.relation
      const angry = !pay && visit!.talk?.angry ? game.patrolSpec().tribute.talk.angryRefuseFactor : 1
      await mutateKingdom(me.id, now, (k) => game.changeCrownRelation(k, visit!.crown, pay ? r.tributePaid : r.tributeRefused * angry))
      return { paid: pay }
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
      // A catch joins the fishing leaderboard (CLAUDE.md §6.5): the sooner caught, the higher.
      const score = game.fishScore(caught, played.steps)
      if (score > 0) await recordScore(lobby, me, 'fishing', score)
      return { ...entry, score }
    }
    case 'play': {
      // A mini-game begins (CLAUDE.md §6.5): the server draws the seed of its run and starts the pause before the next.
      const which = cmd.game
      if (!game.isArcadeGame(which)) return refuse('rejected')
      const why = game.gameError(game.advance(me.state, now).kingdom, which, now)
      if (why) refuse(why)
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0
      await mutateKingdom(me.id, now, (k) => {
        if (game.gameReadyAt(k, which) > now) refuse('busy')
        return { ...k, minigames: { ...k.minigames, [which]: { ...k.minigames?.[which], lastAt: now, run: { seed, at: now } } } }
      })
      return { seed }
    }
    case 'played': {
      // The run played out: the server plays it again from its seed and the player's presses; the score it gets is
      // what counts, for the reward and the leaderboard.
      const which = cmd.game
      if (!game.isArcadeGame(which)) return refuse('rejected')
      const run = me.state.minigames?.[which]?.run as { seed: number; at: number } | null | undefined
      if (!run || now - run.at > game.balance.minigames.runTimeoutSeconds * 1000) refuse('none')
      if (!game.validToggles(cmd.toggles)) refuse('rejected')
      const played = game.replayGame(which, run!.seed, cmd.toggles)
      // Over sooner than it can be played: not counted.
      const score = game.playedInTime(run!.at, played.steps, now) ? played.score : 0
      const earned = game.gameReward(which, score)
      let reward: Record<string, number> = {}
      let fresh = true
      let best = 0
      let left = 0
      await mutateKingdom(me.id, now, (k) => {
        const mine = k.minigames?.[which]
        // Settled once only, even if two answers for the same run arrive together.
        if (mine?.run?.seed !== run!.seed) {
          fresh = false
          return null
        }
        // All the games together bring no more than the hour's budget (CLAUDE.md §6.5).
        const budgeted = game.budgetedReward(k, earned, now) as Record<string, number>
        const stock = { ...k.stock }
        const caps: Record<string, number> = { gold: game.goldCap(k, now) }
        const given: Record<string, number> = {}
        for (const [r, v] of Object.entries(budgeted)) {
          const cap = caps[r] ?? game.storageCap(k, now)
          const next = Math.max(stock[r], Math.min(cap, stock[r] + v))
          if (next > stock[r]) given[r] = next - stock[r]
          stock[r] = next
        }
        reward = given
        best = Math.max(mine?.best ?? 0, score)
        const out = { ...k, stock, minigames: { ...k.minigames, [which]: { ...mine, run: null, best } }, minigameEarned: game.noteEarning(k, given, now) }
        left = game.budgetLeft(out, now)
        return out
      })
      if (!fresh) refuse('none')
      if (score > 0) await recordScore(lobby, me, which, score)
      // `earned`: what the score was worth before the budget; `reward`: what was given.
      return { score, reward, earned, best, budgetLeft: left }
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
        // The garrison is out fighting a fire or a flood (a crisis answered with the army).
        if ((k.armyLockUntil ?? 0) > now) refuse('armyLocked')
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
      const given = cmd.order as Order
      // A move lays siege to the town it reaches only when the siege is asked for (the town's panel); else the army
      // just stands at its gate.
      const order: Order = given?.kind === 'move' ? { kind: 'move', x: Number(given.x), y: Number(given.y), ...(given.siege === true && { siege: true }) } : given
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
      // The lord at its head gives his orders himself, wherever it is.
      const led = game.leadsArmy(me.state, army!.led_by, now)
      if (inTerritory(me.state, here, now) || inTouch || led) {
        const why = await applyOrder(world, army!, order, rows, pacts, now)
        if (why) refuse(why)
        return { at: iso(now) }
      }
      const delay = game.balance.time.messengerDelayGameDays * game.balance.time.gameDayMs
      await admin.from('army_orders').insert({ lobby_id: lobby, army_id: army!.id, kingdom_id: me.id, effective_at: iso(now + delay), payload: order })
      return { at: iso(now + delay) }
    }
    case 'king': {
      // The lord takes command of an army in front of his palace, or leaves it there (CLAUDE.md §8.2.1).
      const { data } = await admin.from('armies').select('*').eq('id', cmd.army).maybeSingle()
      const army = data as ArmyRow | null
      if (!army || army.kingdom_id !== me.id) refuse('army')
      const state = game.advance(me.state, now).kingdom
      const atPalace = game.atPalace(army!, state.buildings, now)
      if (cmd.action === 'lead') {
        const { data: mine } = await admin.from('armies').select('id, led_by').eq('kingdom_id', me.id)
        const leadingAnother = (mine ?? []).some((a: { id: number; led_by: number | null }) => a.id !== army!.id && game.leadsArmy(state, a.led_by, now))
        if (game.leadsArmy(state, army!.led_by, now)) refuse('king_led')
        const why = game.leadError(state, now, { atPalace, battle: army!.status === 'battle', leadingAnother })
        if (why) refuse(`king_${why}`)
        // Only from the army as it was read (not meanwhile in battle).
        const { data: done } = await admin.from('armies').update({ led_by: state.dynasty.king.id }).eq('id', army!.id).neq('status', 'battle').select('id').maybeSingle()
        if (!done) refuse('king_battle')
        // A mark left by a lord now dead is cleared from the other armies.
        await admin.from('armies').update({ led_by: null }).eq('kingdom_id', me.id).neq('id', army!.id).not('led_by', 'is', null)
        await notify(lobby, [me.id], 'king_command', { lead: true, king: state.dynasty.king.name }, now)
        return null
      }
      if (cmd.action === 'leave') {
        if (army!.led_by == null) refuse('king_none')
        // A lord who is no longer (dead, or the regents rule) leaves it anywhere; a living one in front of his palace.
        if (game.leadsArmy(state, army!.led_by, now) && !atPalace) refuse('king_palace')
        await admin.from('armies').update({ led_by: null }).eq('id', army!.id)
        await notify(lobby, [me.id], 'king_command', { lead: false, king: state.dynasty?.king?.name ?? '' }, now)
        return null
      }
      return refuse('rejected')
    }
    case 'townBuy': {
      // Goods bought at a town's market by an army standing at its gate (CLAUDE.md §8.4): the gold goes to the town's
      // lord at once (nowhere for a free town or the lord's own purchase), the goods ride home with the army.
      const units = whole(cmd.units, 1, game.balance.towns.market.stock)
      const { data: townData } = await admin.from('lobby_towns').select('*').eq('lobby_id', lobby).eq('id', Number(cmd.town)).maybeSingle()
      const row = townData as TownRow | null
      if (!row) return refuse('town')
      const { data: armyData } = await admin.from('armies').select('*').eq('id', cmd.army).maybeSingle()
      const army = armyData as ArmyRow | null
      if (!army || army.kingdom_id !== me.id || army.lobby_id !== lobby) return refuse('army')
      if (army.status === 'battle') refuse('battle')
      const world = await worldOf(lobby)
      const { here } = armyNow(army, world, me.state, now)
      const gate = game.townGate(row)
      if (ms(army.arrive_at) > now || Math.hypot(here.x - gate.x, here.y - gate.y) > game.balance.towns.market.gateTiles) refuse('gate')
      const town = townOf(row)
      const owner = row.owner_id
      const relation = owner === null || owner === me.id ? null : (await relationOf(lobby, me.id, owner, now)).value
      const market = await lobbyMarket(lobby)
      const cost = game.townBuyCost(market, row.kind, units, now, relation)
      const error = game.townBuyError(town, units, army.soldiers, army.cargo, Infinity, cost, now)
      if (error) refuse(error === 'besieged' ? 'townBesieged' : error)
      const good = game.townMarketGood(row.kind) as string
      // Paid first; the stock is then claimed only as it was read (or the gold goes back).
      await mutateKingdom(me.id, now, (k) => (k.stock.gold >= cost ? { ...k, stock: { ...k.stock, gold: k.stock.gold - cost } } : refuse('cost')))
      const refund = () => mutateKingdom(me.id, now, (k) => ({ ...k, stock: { ...k.stock, gold: k.stock.gold + cost } }))
      const left = game.townStock(town, now) - units
      let claim = admin.from('lobby_towns').update({ market_stock: left, market_at: now }).eq('id', row.id).is('rebels', null).is('siege', null)
      claim = row.market_at === null || row.market_at === undefined ? claim.is('market_at', null) : claim.eq('market_at', row.market_at)
      const { data: claimed } = await claim.select('id').maybeSingle()
      if (!claimed) {
        await refund()
        refuse('stock')
      }
      // Loaded onto the army as it was read (a split or a loss meanwhile: the purchase is undone).
      const { data: loaded } = await admin
        .from('armies')
        .update({ cargo: game.addCargo(army.cargo, { [good]: units }) })
        .eq('id', army.id)
        .eq('soldiers', army.soldiers)
        .neq('status', 'battle')
        .select('id')
        .maybeSingle()
      if (!loaded) {
        await admin.from('lobby_towns').update({ market_stock: left + units }).eq('id', row.id).eq('market_at', now)
        await refund()
        refuse('army')
      }
      // The town's lord takes the gold, as far as his treasury holds it.
      if (owner !== null && owner !== me.id) {
        let got = 0
        await mutateKingdom(owner, now, (k) => {
          got = Math.max(0, Math.min(cost, game.goldCap(k, now) - k.stock.gold))
          return game.book({ ...k, stock: { ...k.stock, gold: k.stock.gold + got } }, { townSales: got, wastedGold: cost - got })
        }).catch(() => null)
        await notify(lobby, [owner], 'town_sale', { town: row.id, name: row.name, by: me.name ?? '?', good, units, gold: got, wasted: cost - got }, now)
      }
      return { cost, good, units }
    }
    default:
      return refuse('unknown')
  }
}

const OWN = new Set(['join', 'roll', 'found', 'build', 'buildMany', 'plan', 'demolish', 'disband', 'upgrade', 'upgradeTrade', 'tradeGood', 'tradeAmount', 'tradeCity', 'swear', 'workers', 'product', 'tax', 'queen', 'train', 'nightShift', 'townUpkeep', 'buy', 'repairWalls', 'repairTrade', 'research', 'sermon', 'nameChild', 'educate', 'crisis', 'choose', 'seen', 'reset', 'ships', 'fleet', 'order', 'quest', 'royal', 'releaseTown', 'expedition', 'steward'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  const { data: auth, error: authError } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: null }
  // Only a token the auth server turned down is a 401 (the client signs the player out on it); an auth server that
  // could not be reached or failed is a 503, so a busy moment does not throw everyone back to the sign-in screen.
  const refused = !authError || (authError.status !== undefined && authError.status >= 400 && authError.status < 500)
  if (!auth.user) return refused ? json({ error: 'auth' }, 401) : json({ error: 'busy' }, 503)
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
          // Commands that reach out (envoys, spies, armies, games) mark the ruler present too.
          const { data: mine } = await admin.from('kingdoms').select('id, state').eq('lobby_id', lobby).eq('user_id', auth.user.id).maybeSingle()
          if (mine?.state) await mutateKingdom(mine.id, Date.now(), (k) => ({ ...k, ...game.presenceAt(k, Date.now(), true) })).catch(() => null)
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
