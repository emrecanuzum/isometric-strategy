import {
  BUILDINGS,
  leadsArmy,
  Feature,
  Terrain,
  TileRule,
  advance,
  balance,
  townCenter,
  cityCenter,
  crisisDecideMs,
  crisisKey,
  dilemmaDecideMs,
  fealtyOpen,
  townWalled,
  townGate,
  relationBetween,
  inTown,
  patrolTimes,
  patrolSlotAt,
  patrolSlotMs,
  patrolTarget,
  visitKind,
  tributeCrowns,
  tributeSlotAt,
  tributeVisitAt,
  capitalGate,
  lobbyTripMs,
  tradeTripMs,
  build,
  buildError,
  armyAt,
  canPlace,
  dockAnnex,
  fits,
  scoreOf,
  gateAlong,
  gateTiles,
  dockPier,
  findPlot,
  hasPalace,
  hasTradePost,
  lobbyColors,
  setTradeGood,
  setTradeAmount,
  siegeShieldMs,
  STROKE_KINDS,
  applyPlan,
  canDemolish,
  movable,
  moveError,
  surveySite,
  territoryRect,
  territoryStage,
  setProduct,
  setWorkers,
  upgradeBuilding,
  upgradeError,
  upgradeSpec,
  upgradeTrade,
  clogsOf,
  countShips,
  dockWater,
  fleetAt,
  alongPath,
  pathLength,
  sailError,
  royalAnswer,
  royalRequest,
  campSoldiers,
  campTier,
} from '@game/shared'
import type { Along, Lord, BuildError, BuildingKind, Good, Kingdom, PlanStep, Point, Ships, World } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { WorldMap } from './game/WorldMap'
import { ConfirmBuild } from './ui/hud/ConfirmBuild'
import { PlanBar } from './ui/hud/PlanBar'
import { cityInfo, setCrownClock } from './game/cities'
import { setHintWorld } from './game/caveHints'
import { BetrayalDialog, crownNews, liveOffer } from './ui/hud/crownHouse'
import { townStructures, townTrails } from './game/towns'
import { pretenderCampStructures } from './game/pretenderCamp'
import { Minimap } from './game/Minimap'
import type { MinimapFlag, MinimapPatrol, MinimapTown } from './game/Minimap'
import { haltSpots, patrolBlocker, patrolRoute } from './game/patrolRoutes'
import type { Structure } from './game/chunkPainter'
import type { StructureLook } from './game/buildingSprites'
import { fleetShips } from './game/fleetShips'
import type { NavyOnMap } from './game/fleetShips'
import type { ShipKind } from './game/shipSprites'
import { createWorld, footprintOrigin } from './game/createWorld'
import type { MapTool } from './game/createWorld'
import type { AimMark, Hover, ProgressMark, RivalTerritory, WorldView } from './game/createWorld'
import { KINGDOM_COLORS } from './game/buildingSprites'
import type { KingdomColor } from './game/buildingSprites'
import { serverNow } from './net/clock'
import { CHAT_KEEP, CommandError, loadChat, loadMine, loadRivals, markSeen, postChat, send, sendFor, settle, subscribe } from './net/online'
import type { ChatMessage, Command, IntelReport, Lobby, Mine, Notice, Rival } from './net/online'
import { useLayer } from './net/layer'
import type { MapArmy } from './game/armies'
import { BANDIT_COLOR, REBEL_COLOR, roughSize } from './game/armies'
import { OutlawSheet, lobbyBands, lobbyBoats } from './ui/hud/outlaws'
import type { OutlawPick } from './ui/hud/outlaws'
import { SHIP_LENGTHS } from './game/fleetShips'
import { bandAt, bandLeg, boatAt, caveAt, caveSpots, clansOf, outlawUp, roadHeld, seaHeld, trailOf } from '@game/shared'
import { lobbyKeyOf } from '@game/shared'
import type { Spot } from './ui/MinimapCorners'

import { play } from './audio/sfx'
import type { Cue } from './audio/sfx'
import { DetailSettings, SoundSettings } from './ui/home/SettingsPanel'
import { usePowerSave } from './lib/power'
import { WarTargets } from './ui/hud/WarTargets'
import { EnvoyDialog, describe as describeNotice } from './ui/Envoy'
import { Advisor, AdvisorSettings } from './ui/advisor/Advisor'
import type { AdvisorAction } from './ui/advisor/lines'
import { EnvoyPortrait } from './ui/advisor/EnvoyPortrait'
import { EnvoyNote } from './ui/advisor/EnvoyNote'
import { CrownColumnSheet } from './ui/hud/crownColumn'
import type { CrownColumn } from './ui/hud/crownColumn'
import { AwayReport, awaySince } from './ui/AwayReport'
import { CrownIntro, introSeen } from './ui/CrownIntro'
import { FortuneDialog } from './ui/FortuneDialog'
import type { FortuneEvent } from './ui/FortuneDialog'
import { HouseDialog, TITLES as HOUSE_TITLES, allKnown, houseNews, readKnown, writeKnown } from './ui/hud/dynasty'
import { ClosedSummary, QueueContext } from './ui/DialogQueue'
import type { SummaryItem } from './ui/DialogQueue'
import { usePlaying } from './ui/hud/minigames/playing'
import type { HouseNews } from './ui/hud/dynasty'
import type { KingdomInfo, Online } from './ui/hud/online'
import { relationTermsIn } from './ui/hud/online'
import { BattleView, TownSiegeView, showArmyPart, warNotes } from './ui/hud/war'
import { RivalFleetSheet } from './ui/hud/navy'
import { showPart } from './ui/hud/Subtabs'
import type { Settings } from './net/settings'
import { Chat } from './ui/Chat'
import { findPath, tilesAlong } from './game/town'
import type { Path } from './game/town'
import type { Errand, MerchantTrip } from './game/town'
import { Icon } from './ui/icons'
import { BUILDING_NAMES, FORTUNE_TEXTS, RESOURCE_NAMES } from './ui/names'
import { Dock, Sheet, TopBar, useTabKeys } from './ui/hud/Hud'
import type { TabId } from './ui/hud/Hud'
import { useJournal } from './ui/hud/journal'
import { ExpeditionReport } from './ui/hud/expeditions'
import { EXPEDITION_TEXTS, GOAL_TEXTS } from './ui/expeditionNames'
import { BuildingSheet } from './ui/hud/BuildingSheet'
import { MapAlerts } from './ui/hud/MapAlerts'
import { MinimapCorners } from './ui/MinimapCorners'
import { InnTip, MapTip } from './ui/hud/MapTip'
import { InnSheet } from './ui/hud/inns'
import { CitySheet, CityTip, CrownBanner } from './ui/hud/cities'
import { TownSheet } from './ui/hud/towns'
import { showPalacePart } from './ui/hud/tabs'
import type { HudData } from './ui/hud/tabs'
import { GoodPicker, SitePicker, missingText } from './ui/panels'
import type { SiteAccess } from './ui/panels'
import { Timers, buildSeconds } from './ui/hud/Timers'
import type { TimerGo } from './ui/hud/Timers'
import { QuestTracker, RoyalDialog, itemName, liveRequest, royalSaying } from './ui/hud/RoyalRequests'
import { fmt } from './ui/hud/primitives'

// Map ids of the bands of bandits (-(BAND_ID + idx)) and the lord number the pirate boats are drawn under.
// Map ids of the NPC columns drawn with the armies, each kind in a range of its own so none can meet another: crown
// patrols -(crown·16 + n + 1), town rebels -(REBELS_ID + town), tribute collectors -(TRIBUTE_ID + lord·8 + crown),
// pretenders' camps -(CAMP_ID + lord), bandit bands -(BAND_ID + idx), found caves -(CAVE_ID + slot).
const REBELS_ID = 100_000_000
const TRIBUTE_ID = 300_000_000
const CAMP_ID = 500_000_000
const BAND_ID = 800_000_000
// Map ids of the bandit clans' caves a lord has found (-(CAVE_ID + slot); CLAUDE.md §7.9.1), tested before the bands.
const CAVE_ID = 900_000_000
const OUTLAW_LORD = -1

const TERRAIN_NAMES: Record<number, string> = {
  [Terrain.Grass]: 'Çayır',
  [Terrain.Forest]: 'Orman',
  [Terrain.Mountain]: 'Dağ',
  [Terrain.Swamp]: 'Bataklık',
  [Terrain.Desert]: 'Kurak',
  [Terrain.Lake]: 'Göl',
  [Terrain.River]: 'Nehir',
}
const FEATURE_NAMES: Record<number, string> = {
  [Feature.Road]: 'Ticaret yolu',
  [Feature.Bridge]: 'Köprü',
  [Feature.Inn]: 'Han',
  [Feature.City]: 'Taç başkenti',
}

const RULE_NAMES: Record<number, string> = {
  [TileRule.Free]: 'inşa edilebilir',
  [TileRule.Blocked]: 'inşa edilemez',
  [TileRule.DockOnly]: 'yalnızca iskele ve sur',
  [TileRule.TunnelOnly]: 'yalnızca tünel',
  [TileRule.TradePostOnly]: 'yalnızca ticaret noktası',
}

// What the server answers when it refuses a command (see supabase/functions/command).
const REFUSALS: Record<string, string> = {
  // The lord at the head of an army (CLAUDE.md §8.2.1).
  king_council: 'Naipler konseyi yönetirken kral orduya geçemez',
  king_queen: 'Kral ordunun başına geçmeden önce sarayda bir kraliçe olmalı',
  king_son: 'Kral ordunun başına geçmeden önce bir oğlu olmalı',
  king_leading: 'Kral zaten başka bir orduya komuta ediyor',
  king_battle: 'Ordu savaşta',
  king_palace: 'Ordu sarayın önünde durmalı',
  king_led: 'Kral zaten bu ordunun başında',
  king_none: 'Bu ordunun başında kral yok',
  step: 'Bu miktar seçilemez',
  tradeWait: 'Satış miktarı az önce değişti; biraz bekle',
  full: 'Lobide yer kalmadı',
  taken: 'Bu yer artık başka bir lordluğa yakın; yeni yer keşfet',
  color: 'Bu renk başka bir lordun; başka bir renk seç',
  conflict: 'Lordluk başka yerden değişti, yeniden dene',
  server: 'Sunucuya ulaşılamadı',
  relation: 'İlişkiniz bunun için uygun değil',
  already: 'Bu zaten var ya da yolda',
  war: 'Savaştayken olmaz',
  cooldown: 'Biraz bekle, elçin yeni döndü',
  spies: 'Evde casusun yok',
  soldiers: 'Yeterli asker yok',
  armyLocked: 'Garnizon bir felaketle uğraşıyor; ordu bir süre sefere çıkamaz',
  armies: 'Sahada en fazla 2 ordun olabilir',
  battle: 'Ordu savaşta; emir alamaz',
  route: 'Oraya yol yok',
  far: 'Ordular birleşmek için çok uzak',
  people: 'Yeterli gönüllü ya da nüfus yok',
  building: 'Bunun için gereken bina yok',
  have: 'Zaten var',
  none: 'Yapılacak bir şey yok',
  talked: 'Haraççıyla zaten konuştun',
  target: 'Lord bulunamadı',
  founded: 'Önce lordluğunu kur',
  prison: 'Kraliçe kaçırmak için önce hapishane kur (2. seviye saray)',
  town: 'Bu kasaba o lordun elinde değil',
  sworn: 'Zaten bir taç krallığına biat ettin; sezon boyunca değişmez',
  early: 'Şu an uygun değil: taçlar seninle lordluğun biraz büyüyünce ilgilenecek',
  grown: 'Bu çocuk artık reşit; eğitimi tamamlandı',
  named: 'Bu çocuğun adı zaten konuldu',
  council: 'Naipler konseyi yönetirken bu karar verilemez',
  // The crowns' commissions.
  done: 'Bu siparişi zaten teslim ettin; sonraki saati bekle',
  crown: 'Böyle bir taç yok',
  // The navy (CLAUDE.md §8.5).
  count: 'Geçersiz gemi sayısı',
  crew: 'Gemilere tayfa yok: asker havuzu boş',
  fleet: 'Böyle bir filo yok',
  fleets: 'En fazla 2 filon olabilir',
  ships: 'Önce gemi seç',
  away: 'Filo uzakta; önce geri çağır',
  dock: 'Önce iskeleni kur',
  cargo: 'Filoda yük taşıyacak gemi yok',
  warships: 'Bunun için savaş gemisi (kadırga ya da çektiri) gerekir',
  blockaded: 'İskelen abluka altında',
  notBlockaded: 'İskelen abluka altında değil',
  city: 'Bir liman seç',
  good: 'Taşınacak malı seç',
  engaged: 'Filo vardı, çarpışma başlamak üzere; şimdi geri çağrılamaz',
  besieged: 'Kuşatma altındaki kasaba serbest bırakılamaz',
  // The liege's royal requests (CLAUDE.md §7.8).
  unsworn: 'Önce bir taç krallığına biat et',
  noRequest: 'Kraliyet elçisinin bir isteği yok',
  expired: 'Bu isteğin süresi doldu',
  answered: 'Bu isteğe zaten cevap verdin',
  declined: 'Bu isteği geri çevirdin',
  delivered: 'Bu isteği zaten teslim ettin',
  short: 'İstenen miktar elinde yok',
  // Town markets (CLAUDE.md §8.4).
  gate: 'Ordun kasabanın kapısında değil',
  stock: 'Kasabanın elinde o kadar mal yok',
  carry: 'Ordun bu kadar yük taşıyamaz',
  rebels: 'Kasabada ayaklanma var; önce asileri bastır',
  townBesieged: 'Kasaba kuşatma altında; pazarı kapalı',
  // Bandits and pirates (CLAUDE.md §7.9, §8.5).
  outlaw: 'Bu çete dağıtılmış',
  cave: 'Bu mağarayı bilmiyorsun ya da klan artık orada değil',
  chasing: 'Zaten peşinde (ya da emri yolda)',
  boat: 'Bu korsan teknesi batırılmış',
  // The lord's house (CLAUDE.md §9.1.1).
  role_none: 'Bu hanedan üyesine görev verilemez',
  role_age: `Görev için en az ${balance.dynasty.intrigue.roles.minAge} yaşında olmalı`,
  role_sex: 'Devriyenin başına bir prens geçebilir',
  role_liege: 'Önce bir taç krallığına biat et',
  role_town: 'Bu kasaba senin elinde değil',
  role_taken: 'Bu görevde zaten başka biri var',
  role_rejected: 'Bu görev zaten onda',
  marry_none: 'Bu prenses sarayda değil',
  marry_sex: 'Yalnızca prensesler evlendirilebilir',
  marry_age: 'Prenses henüz reşit değil',
  marry_liege: 'Önce bir taç krallığına biat et',
  marry_cost: 'Çeyiz için yeterli altın yok',
  marry_town: 'Bu kasaba senin elinde değil (ya da kimseye ait olmayan bir kasaba değil)',
  aid_none: 'Ortada bir taht davacısı yok',
  aid_liege: 'Bağlı olduğun bir taç yok',
  aid_asked: 'Bunu taçtan zaten istedin',
}
const refusal = (e: unknown) => {
  const code = e instanceof CommandError ? e.message : 'server'
  return REFUSALS[code] ?? BUILD_ERRORS[code as BuildError] ?? 'Komut reddedildi'
}

// News that goes against the player: kept under the journal's "Önemli" tab.
const HURTFUL = new Set(['king_fell', 'siege_people', 'fleet_turned', 'town_revolt', 'town_lost_revolt', 'patrol_tribute', 'patrol_ignored', 'patrol_taken', 'army_threat', 'war_declared', 'trade_raided', 'raid_repelled', 'operation_struck', 'spy_caught', 'spy_lost', 'tower_losses', 'alliance_broken', 'envoy_insult', 'peace_enforced', 'order_failed', 'cargo_lost', 'outlaw_road', 'pirate_waters', 'outlaw_escaped', 'pirate_escaped'])
// War news keeps longer as a popup (CLAUDE.md §9.8: the popups' shelf life).
const WAR_NEWS = new Set(['battle_start', 'battle_end', 'war_declared', 'peace_enforced', 'king_fell', 'king_command', 'siege_people', 'town_siege', 'town_taken', 'town_held', 'town_siege_lifted', 'naval_battle'])
function noticeHurts(n: Notice, me: string | undefined) {
  if (HURTFUL.has(n.kind)) return true
  const p = n.payload as { kind?: string; accepted?: boolean; report?: { losses?: Record<string, number> } }
  // A battle that cost the player soldiers; a proposal of theirs turned down.
  if (n.kind === 'battle_end') return !!me && (p.report?.losses?.[me] ?? 0) > 0
  if (n.kind === 'envoy_answer') return p.accepted === false
  if (n.kind === 'envoy_proposal') return p.kind === 'tribute'
  // Sieges of towns, laid or suffered, lifted, won or beaten off: war is always important.
  // Sea battles are war too.
  if (n.kind === 'naval_battle') return true
  if (n.kind === 'pirate_battle') return !(p as { won?: boolean }).won
  if (n.kind === 'town_siege' || n.kind === 'town_taken' || n.kind === 'town_held' || n.kind === 'town_siege_lifted') return true
  return false
}

// Kingdom colours as numbers for the map.
const hexOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#f2d16b'
// A crown kingdom's banner colour, for the map (CLAUDE.md §7.8).
const crownColor = (world: World, liege: number) => parseInt(cityInfo(world, liege).color.slice(1), 16)
const colorOf = (color: string | null | undefined) => parseInt((KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#f2d16b').slice(1), 16)

// On touch screens there is no hover, so placing takes a tap to preview and a second tap to confirm.
const touchOnly = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

const BUILD_ERRORS: Record<BuildError, string> = {
  palace: 'Önce sarayını yerleştir',
  unique: 'Bundan yalnızca bir tane kurulabilir',
  cost: 'Yetersiz kaynak',
  queue: 'İnşaat kuyruğu dolu',
  spot: 'Buraya inşa edilemez',
  top: 'En yüksek seviyede',
  busy: 'Bina şu an inşaatta',
  locked: 'Önce sarayı yükselt (bu yapı daha yüksek seviye saray ister)',
  limit: 'Bu yapının sınırı dolu (evlerde nüfus sınırı); sarayı yükselt',
  liege: 'Sarayı yükseltmek için önce bir taç krallığına biat et (Saray sekmesi → Bağlılık)',
  queen: 'Sarayı 3. seviyeye yükseltmek için sarayda bir kraliçe olmalı (Halk sekmesi → Kraliçe)',
}

// Where something walking a path from `departAt` to `arriveAt` (evenly along its length) is at `t`.
function pointOnPath(path: Point[], departAt: number, arriveAt: number, t: number): Point {
  if (path.length < 2 || t <= departAt) return path[0]
  if (t >= arriveAt) return path[path.length - 1]
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y))
  let d = ((t - departAt) / (arriveAt - departAt)) * lengths.reduce((a, b) => a + b, 0)
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i]) {
      const f = lengths[i] ? d / lengths[i] : 0
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f }
    }
    d -= lengths[i]
  }
  return path[path.length - 1]
}

// Walkers keep to dry land below the mountains.
const walkable = (world: World, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const t = world.terrain[y * world.size + x]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
}

// An aimed army snaps to a lord, a crown city or a town this many tiles away or closer; a tap on open ground this
// close to one of the player's armies picks it.
const AIM_SNAP_TILES = 8
const ARMY_PICK_TILES = 2.5

// Footpaths are worn only between buildings closer than this to the palace.
const TRAIL_MAX_TILES = 40

// What the town's walkers need to know of a building (rivals' buildings carry no more).
type TownBuilding = Rival['buildings'][number]

// Villagers walk from their homes to the fields and workshops; the merchant tends the trade post. With `edge` a walk
// to a field ends at its edge (the footpaths go round the fields; the villagers walk in to work them).
function townErrands(buildings: TownBuilding[], time: number, edge = false): Errand[] {
  const done = buildings.filter((b) => b.doneAt <= time)
  const palace = done.find((b) => b.kind === 'palace')
  const work = done.filter((b) => BUILDINGS[b.kind].workers && b.kind !== 'tradePost')
  const errands: Errand[] = []
  done
    .filter((b) => b.kind === 'house' || b.kind === 'palace')
    .forEach((home, i) => {
      for (let n = 0; n < 2; n++) {
        const place = work[(i * 2 + n) % Math.max(1, work.length)] ?? (home === palace ? undefined : palace)
        if (place) errands.push({ from: doorstep(home), to: place.kind === 'farm' && !edge ? center(place) : doorstep(place) })
      }
    })
  return errands
}

const center = (b: TownBuilding): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
// Where a walker stands outside a building: just past the middle of its front-left wall, by the door.
const doorstep = (b: TownBuilding): Point => ({ x: b.x + b.size * 0.7, y: b.y + b.size + 0.35 })

// Footpaths worn in a town (the player's or a rival's, as everyone sees them alike): from every building's door to
// the palace gate, around the buildings in between, and along the villagers' daily walks from home to work. Walls
// and gates send nobody out, so they wear no paths of their own. The walks nearest the palace are worn first and later
// ones join them where they can (see findPath), so the town grows a few shared paths branching out from the palace.
function footpaths(world: World, buildings: TownBuilding[], time: number): Point[][] {
  const palace = buildings.find((b) => b.kind === 'palace')
  const solid = new Set<number>()
  // Roads the lord laid are worn ground like a trade route (see nearRoad).
  const laid = new Set<number>()
  for (const b of buildings) {
    if (b.kind === 'road') {
      laid.add(b.y * world.size + b.x)
      continue
    }
    // Gates are walked through; everything else, the fields too, is walked around.
    if (b.kind === 'gate') continue
    for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) solid.add(y * world.size + x)
  }
  const visited = buildings.filter((b) => b !== palace && b.doneAt <= time && b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road')
  const gate = palace && doorstep(palace)
  const far = (p: Point) => (gate ? Math.hypot(p.x - gate.x, p.y - gate.y) : 0)
  const routes = [
    ...(gate ? visited.map((b) => ({ from: doorstep(b), to: gate })).sort((a, b) => far(a.from) - far(b.from)) : []),
    ...townErrands(buildings, time, true),
  ]
  // Tiles a footpath already wears, with a tile of margin either side: a later walk there keeps to that path and is
  // not drawn again beside it (two lines a tile apart read as a braid).
  const worn = new Set<number>()
  // A trade route or a laid road (and a tile beside it) is worn ground already: walks keep to it, and no footpath is drawn on it or
  // running alongside it; a path that reaches it simply ends there.
  const nearRoad = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= world.size || ny >= world.size) continue
        const f = world.feature[ny * world.size + nx]
        if (f === Feature.Road || f === Feature.Bridge || laid.has(ny * world.size + nx)) return true
      }
    }
    return false
  }
  const isWorn = (x: number, y: number) => worn.has(y * world.size + x) || nearRoad(x, y)
  const blocked = (x: number, y: number) => solid.has(y * world.size + x) || !walkable(world, x, y)
  const drawn: Point[][] = []
  for (const { from, to } of routes) {
    if (Math.hypot(to.x - from.x, to.y - from.y) > TRAIL_MAX_TILES) continue
    const path = findPath(from, to, blocked, isWorn)
    if (!path) continue
    const pieces = freshStretches(path, isWorn, drawn, nearRoad)
    tilesAlong(path.points, (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) worn.add((y + dy) * world.size + x + dx)
    })
    drawn.push(...pieces)
  }
  return drawn
}

// The nearest point on the paths drawn so far: where a new stretch joins them.
function nearestOn(lines: Point[][], p: Point): Point | null {
  let best: Point | null = null
  let bestD = Infinity
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      const q = { x: a.x + dx * t, y: a.y + dy * t }
      const d = Math.hypot(p.x - q.x, p.y - q.y)
      if (d < bestD) {
        bestD = d
        best = q
      }
    }
  }
  return bestD < 2.5 ? best : null
}

// The stretches of a walk off the paths already worn. Where a stretch leaves or meets a worn path, its end is carried
// onto that path's line, so it joins it in a clean fork instead of stopping a tile short of it.
function freshStretches(path: Path, worn: (x: number, y: number) => boolean, drawn: Point[][], road: (x: number, y: number) => boolean): Point[][] {
  const STEP = 0.25
  const pointAt = (d: number): Point => {
    let i = 1
    while (i < path.points.length - 1 && path.at[i] < d) i++
    const a = path.points[i - 1]
    const b = path.points[i]
    const t = Math.min(1, Math.max(0, (d - path.at[i - 1]) / Math.max(1e-6, path.at[i] - path.at[i - 1])))
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  const count = Math.max(1, Math.ceil(path.length / STEP))
  const fresh = Array.from({ length: count + 1 }, (_, n) => {
    const p = pointAt((path.length * n) / count)
    return !worn(Math.floor(p.x), Math.floor(p.y))
  })
  const pieces: Point[][] = []
  for (let n = 0; n <= count; n++) {
    if (!fresh[n] || (n > 0 && fresh[n - 1])) continue
    let end = n
    while (end < count && fresh[end + 1]) end++
    // One step onto the worn path at either end, so the new stretch meets it.
    const d0 = (path.length * Math.max(0, n - 1)) / count
    const d1 = (path.length * Math.min(count, end + 1)) / count
    const corners = path.points.filter((_, i) => path.at[i] > d0 && path.at[i] < d1)
    const a = pointAt(d0)
    const b = pointAt(d1)
    // Where it leaves a footpath it joins that path. Where it leaves a trade route it reaches a tile further, under
    // the road (which is painted over it), so it meets the road's edge instead of stopping short of it.
    const onRoad = (p: Point) => road(Math.floor(p.x), Math.floor(p.y))
    const start = n > 0 && onRoad(a) ? pointAt(Math.max(0, d0 - 1)) : (n > 0 && nearestOn(drawn, a)) || a
    const finish = d1 < path.length && onRoad(b) ? pointAt(Math.min(path.length, d1 + 1)) : (d1 < path.length && nearestOn(drawn, b)) || b
    const piece = [start, ...corners, finish]
    if (d1 - d0 > STEP) pieces.push(piece)
  }
  return pieces
}

function App({
  lobby,
  initial,
  username,
  settings,
  onSettings,
  onExit,
}: {
  // The player's name, so the chat knows when they are mentioned.
  username: string
  lobby: Lobby
  initial: Mine
  // The player's settings (music plays from the root, for the menu and the map alike).
  settings: Settings
  onSettings: (change: Partial<Settings>) => void
  // Back to the main menu.
  onExit: () => void
}) {
  const seed = lobby.seed
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  const seasonStart = Date.parse(lobby.season_start)
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<WorldView | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [cameraCenter, setCameraCenter] = useState<Point | null>(null)
  // The screen's corners on the ground, drawn on the minimap and world map as the area in view.
  const [cameraCorners, setCameraCorners] = useState<Point[] | null>(null)
  const [loading, setLoading] = useState(true)
  // The first view is held back until the ground around the kingdom (or the sites to choose from) is painted: the
  // camera has moved there and no chunk on screen is missing for a moment.
  const [ready, setReady] = useState(false)
  const tapRef = useRef<(tile: Point, building?: number, army?: number, inn?: number, city?: number, ship?: { lord: number; fleet?: number }) => void>(() => {})
  const strokeRef = useRef<(spots: Point[]) => void>(() => {})
  const rightTapRef = useRef<(tile: Point) => void>(() => {})

  useEffect(() => {
    let cancelled = false
    let created: WorldView | undefined
    createWorld(
      host.current!,
      seed,
      {
        onHover: setHover,
        onCamera: (center, corners) => {
          setCameraCenter(center)
          setCameraCorners(corners)
        },
        onLoading: setLoading,
        onTap: (tile, building, army, inn, city, ship) => tapRef.current(tile, building, army, inn, city, ship),
        onStroke: (spots) => strokeRef.current(spots),
        onRightTap: (tile) => rightTapRef.current(tile),
      },
      serverNow,
      lobby.world_rev ?? 1,
      lobby.river_keep ?? [],
    ).then((v) => {
      if (cancelled) return v.destroy()
      created = v
      setView(v)
    })
    return () => {
      cancelled = true
      created?.destroy()
      setView(null)
    }
  }, [seed])

  const muted = !settings.music
  // Detail animations follow the setting; power saving (CLAUDE.md §12) turns them off with the rest.
  const saving = usePowerSave(settings.power)
  useEffect(() => view?.setPowerSave(saving), [view, saving])
  // The weather over the map follows the lobby (see weather.ts).
  useEffect(() => view?.setWeather(lobbyKeyOf(lobby.id)), [view, lobby.id])
  useEffect(() => view?.setDetail(settings.detail && !saving), [view, settings.detail, saving])
  // The sound settings, opened from the corner button or the kingdom tab.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The phone menu (settings, main menu); a tap anywhere else closes it.
  const [menuOpen, setMenuOpen] = useState(false)
  const mapMenu = useRef<HTMLDivElement>(null)
  // The same menu in the top-right corner on wider screens.
  const cornerMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: PointerEvent) => {
      if (!mapMenu.current?.contains(e.target as Node) && !cornerMenu.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [menuOpen])

  // The server's copy of the player's row, and the kingdom as shown: the server's state settled up to now by the same
  // `advance` the server runs, with the player's commands applied at once while the server confirms them.
  // The layer between kingdoms (diplomacy, spies, armies, battles, notices, prices).
  const { layer, refreshAll, onChange: onLayerChange, onMarket, dropNotices } = useLayer(lobby.id, lobby.market)
  const marketRef = useRef(layer.market)
  marketRef.current = layer.market
  const [mine, setMine] = useState(initial)
  const mineRef = useRef(mine)
  const [kingdom, setKingdomState] = useState<Kingdom | null>(() => initial.state && advance(initial.state, serverNow(), lobby.market).kingdom)
  const kingdomRef = useRef(kingdom)
  // Back after a while: what happened meanwhile, told before anything else (CLAUDE.md §11). The server's record of
  // when the ruler was last here, read before this visit's first command updates it.
  const [away, setAway] = useState(() => awaySince(initial.state, serverNow()))
  // The crowns introduce themselves once the lord has grown a little (CLAUDE.md §7.8), once per browser.
  const [introDone, setIntroDone] = useState(() => introSeen(lobby.id, initial.id))
  // News of the lord's house (CLAUDE.md §9.1), told from what the house holds now that was not told before; on a first
  // visit the past is not news.
  const [houseQueue, setHouseQueue] = useState<HouseNews[]>([])
  const houseKnown = useRef<Set<string> | null>(null)
  const dynasty = kingdom?.dynasty
  useEffect(() => {
    if (!dynasty) return
    if (!houseKnown.current) {
      houseKnown.current = readKnown(lobby.id, initial.id) ?? allKnown(dynasty)
      writeKnown(lobby.id, initial.id, houseKnown.current)
    }
    const news = houseNews(dynasty, houseKnown.current, serverNow())
    if (news.length === 0) return
    for (const n of news) houseKnown.current.add(n.key)
    writeKnown(lobby.id, initial.id, houseKnown.current)
    const heard = serverNow()
    setHouseQueue((q) => [...q, ...news.map((n) => ({ ...n, at: n.at ?? heard }))])
  }, [dynasty, lobby.id, initial.id])
  // The crowns' royal houses follow from the lobby's number and the season's start (CLAUDE.md §7.8): every ruler named
  // anywhere is the one reigning now.
  setCrownClock(kingdom && kingdom.lobbyKey !== undefined ? { lobbyKey: kingdom.lobbyKey, seasonStart: kingdom.seasonStart } : null, serverNow)
  setHintWorld(view?.world ?? null)
  const setKingdom = useCallback((next: Kingdom | null) => {
    kingdomRef.current = next
    setKingdomState(next)
  }, [])
  // The territory's stage follows the palace's level (re-read every clock tick, so it grows when an upgrade ends).
  const stage = kingdom ? territoryStage(kingdom, serverNow()) : 0
  // Builds, moves and demolitions laid out on the map, sent together once the player confirms them (CLAUDE.md §6.4).
  // The map shows the kingdom as it would be with them carried out.
  const [plan, setPlan] = useState<PlanStep[]>([])
  const planned = useMemo(
    () => (view && kingdom && plan.length > 0 ? applyPlan(view.world, kingdom, stage, plan, serverNow()) : null),
    [view, kingdom, stage, plan],
  )
  const shown = planned?.kingdom ?? kingdom
  // Buildings marked to be torn down stay on the map (under a red silhouette) until the plan is carried out.
  const demolishing = useMemo(() => new Set(plan.flatMap((s) => (s.type === 'demolish' ? [s.id] : []))), [plan])
  const mapBuildings = useMemo(
    () => (!shown ? [] : demolishing.size === 0 ? shown.buildings : [...shown.buildings, ...(kingdom?.buildings.filter((b) => demolishing.has(b.id)) ?? [])]),
    [shown, kingdom, demolishing],
  )
  const [selectedSite, setSelectedSite] = useState(0)

  // A row from the server replaces what is shown, unless an older answer arrives late.
  const accept = useCallback(
    (row: Mine) => {
      if (row.version < mineRef.current.version) return
      mineRef.current = row
      setMine(row)
      setKingdom(row.state && advance(row.state, serverNow(), marketRef.current).kingdom)
    },
    [setKingdom],
  )
  const [toast, setToast] = useState<string | null>(null)
  // Sends a command, showing `predicted` meanwhile; a refused command puts back the server's state.
  const command = useCallback(
    async (cmd: Command, predicted?: Kingdom) => {
      if (predicted) setKingdom(predicted)
      try {
        accept(await send(lobby.id, cmd))
      } catch (e) {
        setToast(refusal(e))
        const state = mineRef.current.state
        setKingdom(state && advance(state, serverNow(), marketRef.current).kingdom)
      }
    },
    [lobby.id, accept, setKingdom],
  )
  // While the game is open and visible, the server hears every few minutes that the ruler is present (an absent
  // ruler's lands give less); silently, as nothing on screen depends on it.
  const founded_ = !!mine.state
  useEffect(() => {
    if (!founded_) return
    const ping = () => {
      if (document.visibilityState === 'visible') send(lobby.id, { type: 'seen' }).then(accept, () => {})
    }
    ping()
    const id = setInterval(ping, 5 * 60_000)
    document.addEventListener('visibilitychange', ping)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [lobby.id, accept, founded_])
  // Commands that reach other kingdoms: their answer comes back (undefined when refused).
  const act = useCallback(
    async <T,>(cmd: Command): Promise<T | undefined> => {
      try {
        const { kingdom: row, result } = await sendFor<T>(lobby.id, cmd)
        accept(row)
        refreshAll()
        return (result ?? null) as T
      } catch (e) {
        setToast(refusal(e))
        return undefined
      }
    },
    [lobby.id, accept, refreshAll],
  )
  // Worker sliders send one command when they settle, not one per step.
  const workerTimers = useRef(new Map<number, number>())
  const commandWorkers = (id: number, workers: number) => {
    const current = kingdomRef.current
    if (!current) return
    setKingdom(setWorkers(current, id, workers))
    clearTimeout(workerTimers.current.get(id))
    workerTimers.current.set(id, window.setTimeout(() => command({ type: 'workers', id, workers }), 400))
  }

  // The other kingdoms of the lobby, and the chat; the lobby's broadcast says when either changes.
  const [rivals, setRivals] = useState<Rival[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  // The kingdom looked at in the diplomacy tab, the army picked, one being sent somewhere, the battle watched, spy reports.
  const [focus, setFocus] = useState<number | null>(null)
  const [armyFocus, setArmyFocus] = useState<number | null>(null)
  const [aiming, setAiming] = useState<number | null>(null)
  // A fleet whose destination on the water is being picked (CLAUDE.md §8.5).
  const [sailing, setSailing] = useState<number | null>(null)
  // The fleet picked on the map or in the navy panel (its ships outlined), and another lord's fleet whose sheet is open.
  const [fleetFocus, setFleetFocus] = useState<{ lord: number; fleet: number } | null>(null)
  const [fleetSheet, setFleetSheet] = useState<{ lord: number; fleet: number } | null>(null)
  // A band of bandits or a pirate boat whose sheet is open (CLAUDE.md §7.9, §8.5).
  const [outlawOpen, setOutlawOpen] = useState<OutlawPick | null>(null)
  useEffect(() => view?.setFleetFocus(fleetFocus), [view, fleetFocus])
  const [following, setFollowing] = useState<number | null>(null)
  const [watching, setWatching] = useState<number | null>(null)
  // A town whose siege is being watched.
  const [watchingTown, setWatchingTown] = useState<number | null>(null)
  const [intel, setIntel] = useState<Record<number, IntelReport | null | undefined>>({})
  useEffect(() => {
    let live = true
    let rivalTimer = 0
    const refreshRivals = () => loadRivals(lobby.id).then((r) => live && setRivals(r.filter((k) => k.id !== mineRef.current.id)))
    refreshRivals()
    loadChat(lobby.id).then((c) => live && setChat(c))
    const unsubscribe = subscribe(lobby.id, {
      onKingdom(id, version) {
        if (id === mineRef.current.id) {
          // Changed from another tab or device.
          if (version > mineRef.current.version) loadMine(lobby.id).then((row) => live && row && accept(row), () => {})
          return
        }
        clearTimeout(rivalTimer)
        rivalTimer = window.setTimeout(refreshRivals, 300)
      },
      onChat(message) {
        setChat((list) => (list.some((m) => m.id === message.id) ? list : [...list, message].slice(-CHAT_KEEP)))
      },
      onChange(table, kingdom) {
        onLayerChange(table, kingdom, mineRef.current.id)
      },
      onMarket,
      onClosed: () => live && exitRef.current(),
    })
    // In case the closing broadcast was missed: a lobby that is gone takes the player's row with it.
    const alive = setInterval(() => loadMine(lobby.id).then((row) => live && !row && exitRef.current(), () => {}), 60_000)
    return () => {
      live = false
      clearTimeout(rivalTimer)
      clearInterval(alive)
      unsubscribe()
    }
  }, [lobby.id, accept, onLayerChange, onMarket])
  const sendChat = async (body: string) => {
    try {
      await postChat(lobby.id, mine.id, body)
    } catch {
      setToast('Mesaj gönderilemedi')
      throw new Error('chat')
    }
  }
  useEffect(() => {
    view?.setRivals(
      rivals.map((r): RivalTerritory => ({
        rect: territoryRect(r.site, territoryStage({ buildings: r.buildings } as Kingdom, serverNow())),
        name: r.name,
        color: colorOf(r.color),
        palace: r.buildings.find((b) => b.kind === 'palace'),
        ...(r.liege != null && view.world.cities[r.liege] && { banner: crownColor(view.world, r.liege) }),
      })),
    )
  }, [view, rivals])

  // Before founding, the site under consideration; afterwards, the kingdom's own.
  const choosing = kingdom ? null : (mine.sites[selectedSite] ?? null)
  // The land around each site the player may choose from.
  const surveys = useMemo(() => (view && !kingdom ? mine.sites.map((site) => surveySite(view.world, site)) : []), [view, kingdom, mine.sites])
  // How far each offered site's trade post and dock plots lie (the merchant's trip grows with the trade post's
  // distance from a palace in the middle of the land).
  const access = useMemo(
    (): SiteAccess[] =>
      view && !kingdom
        ? mine.sites.map((site) => {
            const rect = territoryRect(site, 0)
            const trade = findPlot(view.world, rect, TileRule.TradePostOnly)
            const dock = findPlot(view.world, rect, TileRule.DockOnly)
            const palace = { kind: 'palace' as const, x: site.x - 2, y: site.y - 2, size: 4 }
            const middle = (p: { x: number; y: number; size: number }) => Math.round(Math.hypot(p.x + p.size / 2 - site.x, p.y + p.size / 2 - site.y))
            return {
              trade: trade && { tiles: middle(trade.plot), outside: trade.granted, tripMs: lobbyTripMs([palace, { kind: 'tradePost', ...trade.plot }]) },
              dock: dock && { tiles: middle(dock.plot), outside: dock.granted },
            }
          })
        : [],
    [view, kingdom, mine.sites],
  )
  const site = kingdom?.site ?? choosing
  const plots = useMemo(() => {
    if (!view || !site) return null
    const rect = territoryRect(site, stage)
    return {
      dock: kingdom ? null : findPlot(view.world, rect, TileRule.DockOnly),
      trade: kingdom ? null : findPlot(view.world, rect, TileRule.TradePostOnly),
    }
  }, [view, site, stage, kingdom])

  useEffect(() => {
    if (view && site) view.centerOn(site)
    // Only when the site itself changes, not on every kingdom update.
  }, [view, site?.x, site?.y])
  // Ready once the camera is on the site and nothing on screen has been missing for a short while (a chunk still to
  // paint turns `loading` back on and starts the wait over).
  useEffect(() => {
    if (ready || !view || !site || loading) return
    const id = window.setTimeout(() => setReady(true), 500)
    return () => clearTimeout(id)
  }, [ready, view, site, loading])
  useEffect(() => {
    // After founding, the dock plot stays marked until a dock stands on it.
    const dockPlot = kingdom ? (kingdom.buildings.some((b) => b.kind === 'dock') ? null : kingdom.dockPlot) : plots?.dock?.plot
    view?.setTerritory(
      site ? territoryRect(site, stage) : null,
      { dock: dockPlot ?? null, trade: plots?.trade?.plot ?? null, annex: kingdom ? dockAnnex(kingdom, stage) : null },
      kingdom?.name,
      kingdom?.buildings.find((b) => b.kind === 'palace'),
      view && kingdom?.liege !== undefined && view.world.cities[kingdom.liege] ? crownColor(view.world, kingdom.liege) : undefined,
    )
  }, [view, site, stage, plots, kingdom])

  // Parties back from their journeys whose report the player has not seen yet (remembered in this browser per lobby;
  // CLAUDE.md §9.9), the oldest first.
  const expeditionKey = `expedition-seen:${lobby.id}`
  const [expeditionSeen, setExpeditionSeen] = useState(() => {
    try {
      return Number(localStorage.getItem(expeditionKey) ?? 0) || 0
    } catch {
      return 0
    }
  })
  const markExpeditionSeen = useCallback(
    (id: number) => {
      setExpeditionSeen((was) => {
        const next = Math.max(was, id)
        try {
          localStorage.setItem(expeditionKey, String(next))
        } catch {
          // Not remembered: shown again next time.
        }
        return next
      })
    },
    [expeditionKey],
  )
  const returned = (kingdom?.expeditions ?? []).filter((e) => e.result && !e.result.recalled && e.id > expeditionSeen).sort((a, b) => a.id - b.id)[0] ?? null

  // The envoy's journal of what happened, kept in this browser per lobby.
  // The day's events waiting to be shown in their window, oldest first.
  const [fortunes, setFortunes] = useState<FortuneEvent[]>([])
  const { journal, record: recordJournal, markRead, reset: resetJournal, notice: noteJournal, markImportantRead } = useJournal(`journal-v2:${lobby.id}`, seasonStart)

  // The clock: settle whatever came due and show it on the map.
  const [now, setNow] = useState(serverNow)
  const founded = kingdom !== null
  useEffect(() => {
    if (!view || !founded) return
    const tick = () => {
      const time = serverNow()
      setNow(time)
      const current = kingdomRef.current
      if (!current) return
      const { kingdom: next, events } = advance(current, time, marketRef.current)
      if (next !== current) setKingdom(next)
      recordJournal(events, next, time)
      // A sound for what stands out (one per tick, the most important).
      const cue: Cue | null = events.some((e) => e.kind === 'fortune')
        ? FORTUNE_TEXTS[(events.find((e) => e.kind === 'fortune') as { fortune: string }).fortune]?.tone === 'bad'
          ? 'omen'
          : 'fortune'
        : events.some((e) => e.kind === 'researched' || e.kind === 'trained' || e.kind === 'goal')
          ? 'good'
          : events.some((e) => e.kind === 'built')
            ? 'build'
            : null
      if (cue) play(cue)
      const begun = events.filter((e): e is FortuneEvent => e.kind === 'fortune' && e.until > time)
      // Waiting fortunes that have run their course meanwhile (behind a report or another dialog) are dropped: the
      // journal keeps them; only news still under way pops up.
      setFortunes((list) => {
        const kept = list.filter((f) => f.until > time)
        return begun.length > 0 ? [...kept, ...begun] : kept.length === list.length ? list : kept
      })
      const palace = next.buildings.find((b) => b.kind === 'palace')
      for (const event of events) {
        if (event.kind === 'trade' && palace) {
          view.float(
            center(palace),
            event.sold > 0 ? `+${event.gold} altın` : event.full ? 'Hazine dolu: tüccar bekliyor' : event.walledIn ? 'Tüccar surdan çıkamıyor: kapı yap' : `Satacak ${RESOURCE_NAMES[event.good].toLowerCase()} yok`,
            event.sold > 0 ? 0xf2d16b : event.full ? 0xf2d16b : 0xff7a6a,
          )
        } else if (event.kind === 'built' && event.building.kind !== 'road') {
          view.float(center(event.building), `${BUILDING_NAMES[event.building.kind]} tamamlandı`, 0x9ee6a0)
        } else if (event.kind === 'goal' && palace) {
          view.float(center(palace), `★ ${GOAL_TEXTS[event.track]?.badges[event.tier - 1] ?? 'Hedef'}`, 0xf2d16b)
        } else if (event.kind === 'expedition' && palace && !event.expedition.result?.recalled) {
          view.float(center(palace), `${EXPEDITION_TEXTS[event.expedition.kind]?.short ?? 'Sefer'} döndü`, 0x9ee6a0)
        }
      }
    }
    // Once a second, on the second (the interface's timers count whole seconds), and not at all while the tab is
    // hidden: what came due meanwhile is settled at once when it shows again (CLAUDE.md §12).
    let timer = 0
    const next = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) tick()
        next()
      }, 1000 - (serverNow() % 1000) + 5)
    }
    const onShow = () => !document.hidden && tick()
    tick()
    next()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [view, founded, setKingdom, recordJournal])

  // Pretenders' camps (CLAUDE.md §9.1.1): the player's own and the other lords', painted again as one grows a tier.
  const camps = useMemo(
    () => [
      ...(shown?.pretender ? [{ ...shown.pretender, name: shown.pretender.person.name, lord: mine.id }] : []),
      ...rivals.flatMap((r) => (r.pretender ? [{ ...r.pretender, lord: r.id }] : [])),
    ],
    [shown?.pretender, rivals, mine.id],
  )
  const campKey = camps.map((c) => `${c.lord}:${c.at.x},${c.at.y}:${campTier(campSoldiers(c, now))}`).join(';')

  // The towns stand where they stand for the whole season: the ground is painted again only when one appears.
  const townsRef = useRef(layer.towns)
  townsRef.current = layer.towns
  const townPlaces = layer.towns.map((t) => `${t.x},${t.y},${t.kind}`).join(';')

  // Buildings into the ground painting; sites under construction show scaffolding.
  useEffect(() => {
    if (!view) return
    const time = serverNow()
    const buildings = mapBuildings
    const structure = (b: Rival['buildings'][number], color: string | undefined, owner: Rival | null, variant: number, ruined = false): Structure => {
      const own = owner === null
      const done = b.doneAt <= time
      const pier = done && b.kind === 'dock' ? dockPier(view.world, b) : null
      // A road is laid in a moment and needs no scaffolding.
      const look: StructureLook = b.kind === 'road'
        ? 'road'
        : !done
        ? 'scaffold'
        : b.kind === 'wall'
          ? b.broken
            ? 'brokenWall'
            : b.tower
              ? 'towerWall'
              : 'wall'
          : b.kind === 'gate' && b.along === 'y'
            ? 'gateY'
            : b.kind === 'tradePost' && ruined
              ? 'tradePostRuined'
              : b.kind === 'prison' && own && (shown?.hostages?.length ?? 0) > 0
                ? 'prisonFull'
                : b.kind
      // The player's own trade post grows with the trade level (older saves keep no level on the building).
      const level = own && b.kind === 'tradePost' && shown ? shown.trade.level + 1 : (b.level ?? 1)
      // Every building answers to the pointer; another kingdom's is outlined in its colour and only says what it is.
      return { x: b.x, y: b.y, size: b.size, look, variant, level, id: b.id, ...(owner && { owner: { kingdom: owner.id, tint: colorOf(owner.color) } }), color, ...(pier && { pier }) }
    }
    const structures: Structure[] = [
      ...buildings.map((b) => structure(b, shown?.color, null, b.id, !!shown?.trade.damaged)),
      ...rivals.flatMap((r) => r.buildings.map((b) => structure(b, r.color, r, r.id * 1000 + b.id, !!r.trade_damaged))),
      ...townsRef.current.flatMap((t) => townStructures(t, townWalled(view.world.seed, t.idx))),
      // Pretenders' camps near the realms they rose against (CLAUDE.md §9.1.1).
      ...camps.flatMap((c) => pretenderCampStructures(c.at, campTier(campSoldiers(c, time)))),
    ]
    // Footpaths (nothing grows in front of them to stand over the walkers; see paintChunk).
    const trails = [
      ...[buildings, ...rivals.map((r) => r.buildings)].flatMap((town) => footpaths(view.world, town, time)),
      ...townsRef.current.flatMap(townTrails),
    ]
    view.setStructures(structures, trails)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, shown, mapBuildings, rivals, townPlaces, campKey])

  // The towns' names in their holders' colours, and the sieges under way (CLAUDE.md §8.4).
  useEffect(() => {
    if (!view) return
    const colorFor = (id: number | null) =>
      id === null ? 0xe8d8b0 : id === mine?.id ? colorOf(shown?.color) : colorOf(rivals.find((r) => r.id === id)?.color)
    view.setTowns(
      layer.towns.map((t) => ({
        at: townCenter(t),
        rect: { x: t.x, y: t.y, size: balance.towns.size },
        name: t.owner === null ? t.name : `${t.name} · ${t.owner === mine?.id ? (shown?.name ?? 'Senin') : (rivals.find((r) => r.id === t.owner)?.name ?? '?')}`,
        color: colorFor(t.owner),
        siege: t.siege ? { startedAt: t.siege.startedAt, endsAt: t.siege.endsAt, color: colorFor(t.siege.kingdom) } : null,
      })).concat(
        // A pretender's camp by name, its time to march on the palace running out (CLAUDE.md §9.1.1).
        camps.map((c) => ({
          at: c.at,
          rect: { x: Math.round(c.at.x) - 3, y: Math.round(c.at.y) - 3, size: 7 },
          name: `${c.name} karargâhı · ${c.lord === mine?.id ? (shown?.name ?? '') : (rivals.find((r) => r.id === c.lord)?.name ?? '?')} taht davacısı`,
          color: 0x8a8a90,
          siege: c.marching ? null : { startedAt: c.since, endsAt: c.marchAt, color: 0x3a3a40 },
        })),
      ),
    )
  }, [view, layer.towns, rivals, mine?.id, shown?.color, shown?.name, camps])

  // Bars over the map: the player's buildings going up, and every palace under siege or shielded after one fell.
  const siegeKey = layer.battles.filter((b) => (b.kind === 'siege' || b.kind === 'usurp') && !b.resolved).map((b) => `${b.id}:${b.ends_at}`).join(';')
  const shieldKey = [kingdom?.shieldUntil ?? 0, ...rivals.map((r) => r.shield_until ?? 0)].join(';')
  const worksKey = (kingdom?.buildings ?? []).filter((b) => b.doneAt > serverNow()).map((b) => `${b.id}:${b.doneAt}`).join(';')
  useEffect(() => {
    if (!view) return
    const time = serverNow()
    const palaceOf = (id: number) => (id === mine?.id ? kingdom?.buildings : rivals.find((r) => r.id === id)?.buildings)?.find((b) => b.kind === 'palace')
    const colorFor = (id: number) => (id === mine?.id ? colorOf(shown?.color) : colorOf(rivals.find((r) => r.id === id)?.color))
    const middle = (b: { x: number; y: number; size: number }) => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
    const marks: ProgressMark[] = []
    for (const b of kingdom?.buildings ?? []) {
      if (b.doneAt <= time || b.doneAt === 0 || b.kind === 'road') continue
      marks.push({ key: `b:${b.id}`, at: middle(b), lift: 26 + b.size * 14, startedAt: b.doneAt - buildSeconds(b) * 1000, endsAt: b.doneAt, color: 0xe8c65a })
    }
    for (const battle of layer.battles) {
      if ((battle.kind !== 'siege' && battle.kind !== 'usurp') || battle.resolved || battle.besieged === null) continue
      const palace = palaceOf(battle.besieged)
      if (!palace) continue
      const by = battle.attackers[0]?.kingdom
      marks.push({ key: `s:${battle.id}`, at: middle(palace), lift: 110, startedAt: Date.parse(battle.started_at), endsAt: Date.parse(battle.ends_at), color: by ? colorFor(by) : 0xc0392b, label: 'Kuşatma' })
    }
    // The shield runs longer behind a citadel (CLAUDE.md §9.8).
    const spanOf = (id: number) => {
      const buildings = id === mine?.id ? kingdom?.buildings : rivals.find((r) => r.id === id)?.buildings
      return buildings ? siegeShieldMs({ buildings }, time) : balance.military.siege.shieldSeconds * 1000
    }
    for (const [id, until] of [[mine?.id, kingdom?.shieldUntil], ...rivals.map((r) => [r.id, r.shield_until])] as [number | undefined, number | null | undefined][]) {
      if (id === undefined || !until || until <= time) continue
      const palace = palaceOf(id)
      if (palace) marks.push({ key: `k:${id}`, at: middle(palace), lift: 110, startedAt: until - spanOf(id), endsAt: until, color: 0x8fc4e8, label: 'Kuşatma kalkanı' })
    }
    view.setProgress(marks)
  }, [view, worksKey, siegeKey, shieldKey])

  // Villagers walk from their houses to the fields and workshops; every kingdom's merchant walks to its trade post.
  const buildings = kingdom?.buildings
  const departedAt = kingdom?.trade.good ? kingdom.trade.departedAt : null
  const ownTripMs = kingdom ? tradeTripMs(kingdom) : 0
  const doneCount = buildings?.filter((b) => b.doneAt <= now).length ?? 0
  // Others' merchants change only with what they sell, a wrecked post, or where palace and post stand; their rows
  // change far more often than that.
  const rivalTrade = JSON.stringify(
    rivals.map((r) => [r.id, r.trade_good ?? null, !!r.trade_damaged, r.buildings.filter((b) => (b.kind === 'palace' || b.kind === 'tradePost') && b.doneAt <= now).map((b) => [b.x, b.y])]),
  )
  const rivalsRef = useRef(rivals)
  rivalsRef.current = rivals
  useEffect(() => {
    if (!view) return
    const time = serverNow()
    // A merchant's walk from the palace door to the trade post's, when both stand.
    const walk = (town: TownBuilding[]) => {
      const done = town.filter((b) => b.doneAt <= time)
      const palace = done.find((b) => b.kind === 'palace')
      const post = done.find((b) => b.kind === 'tradePost')
      return palace && post ? { home: doorstep(palace), market: doorstep(post) } : null
    }
    const own = walk(buildings ?? [])
    // A trip takes longer the farther the trade post lies from the palace; the merchant walks the whole way in it.
    const merchants: MerchantTrip[] = own && departedAt !== null ? [{ ...own, departedAt, tripMs: ownTripMs }] : []
    // Others' merchants: when each set out is the other kingdom's own business, so each keeps a pace of its own. One
    // selling nothing stays home, as does one whose trade post lies wrecked.
    for (const r of rivalsRef.current) {
      const trip = r.trade_good && !r.trade_damaged ? walk(r.buildings) : null
      const tripMs = lobbyTripMs(r.buildings)
      if (trip) merchants.push({ ...trip, departedAt: (r.id * 7919) % tripMs, tripMs, robe: r.id % 3 })
    }
    view.setTown(townErrands(buildings ?? [], time), merchants)
  }, [view, buildings, departedAt, ownTripMs, doneCount, rivalTrade])

  // ---- Commands ----

  const [panel, setPanel] = useState<TabId | null>(null)
  // The building whose menu is open (it replaces the open tab).
  const [selected, setSelected] = useState<number | null>(null)
  // The inn whose sheet is open (its index in world.inns).
  const [innOpen, setInnOpen] = useState<number | null>(null)
  // The free city whose sheet is open (its index in world.cities).
  const [cityOpen, setCityOpen] = useState<number | null>(null)
  // A crown column's sheet (a patrol or tribute collectors; CLAUDE.md §7.8).
  const [columnOpen, setColumnOpen] = useState<CrownColumn | null>(null)
  // The town whose sheet is open (its id).
  const [townOpen, setTownOpen] = useState<number | null>(null)
  const toggleTab = useCallback((tab: TabId) => {
    setSelected(null)
    setInnOpen(null)
    setCityOpen(null)
    setTownOpen(null)
    setPanel((open) => (open === tab ? null : tab))
  }, [])
  const closeTab = useCallback(() => {
    setPanel(null)
    setSelected(null)
    setInnOpen(null)
    setCityOpen(null)
    setTownOpen(null)
    setFleetSheet(null)
    setOutlawOpen(null)
  }, [])
  useTabKeys(toggleTab, closeTab)
  useEffect(() => {
    if (panel === 'journal') markRead()
  }, [panel, journal.unread, markRead])
  // On phones the open sheet covers the map controls; the stylesheet hides them meanwhile.
  useEffect(() => {
    document.documentElement.dataset.sheet = panel || selected !== null || innOpen !== null || cityOpen !== null || townOpen !== null || fleetSheet !== null || outlawOpen !== null ? 'open' : 'closed'
  }, [panel, selected, innOpen, cityOpen, townOpen, fleetSheet, outlawOpen])
  const [placing, setPlacing] = useState<BuildingKind | null>(null)
  // A gate turned with R (null: it follows the wall around it).
  const [turned, setTurned] = useState<Along | null>(null)
  // A new kingdom first places its palace, wherever the player likes inside the territory.
  const needsPalace = kingdom !== null && !hasPalace(kingdom)
  const placingKind: BuildingKind | null = needsPalace ? 'palace' : placing
  // A building picked up to be moved, waiting for its new spot.
  const [moving, setMoving] = useState<number | null>(null)
  // Marked on the map: red over those to be torn down, blue over the one in hand.
  useEffect(
    () => view?.setMarked([...[...demolishing].map((id) => ({ id, tone: 'demolish' as const })), ...(moving !== null ? [{ id: moving, tone: 'move' as const }] : [])]),
    [view, demolishing, moving],
  )
  // Buildings whose work goes nowhere carry a warning sign on the map (CLAUDE.md §6.4).
  const clogKey = kingdom ? JSON.stringify(clogsOf(kingdom, serverNow()).map((c) => [c.id, c.reason])) : '[]'
  useEffect(() => view?.setClogged((JSON.parse(clogKey) as [number, 'armory' | 'store'][]).map(([id, tone]) => ({ id, tone }))), [view, clogKey])
  const movingBuilding = moving !== null ? shown?.buildings.find((b) => b.id === moving) : undefined
  // Tearing down or moving several buildings: a tool in hand until the player is done (see MapTool).
  const [tool, setTool] = useState<MapTool>(null)
  const holding = placingKind !== null || moving !== null || tool !== null
  useEffect(() => view?.setTool(placingKind ? null : tool), [view, tool, placingKind])
  useEffect(() => view?.setTargeting(aiming !== null || sailing !== null), [view, aiming, sailing])
  const [preview, setPreview] = useState<Point | null>(null)
  // A row drawn by dragging (walls, houses), awaiting confirmation.
  const [previewMany, setPreviewMany] = useState<Point[] | null>(null)
  const stroking = placingKind !== null && STROKE_KINDS.includes(placingKind)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!view) return
    if (movingBuilding && shown) {
      view.setPlacement({
        size: movingBuilding.size,
        // The building itself follows the pointer, see-through.
        carry: { size: movingBuilding.size, look: movingBuilding.kind, variant: movingBuilding.id, level: movingBuilding.level ?? 1, color: shown.color },
        valid: (origin) => {
          const error = moveError(view.world, shown, stage, movingBuilding.id, origin, serverNow())
          return !error || error === 'queue'
        },
      })
      return
    }
    if (!placingKind || !shown) {
      view.setPlacement(null)
      return
    }
    const size = BUILDINGS[placingKind].size
    view.setPlacement({
      size,
      // Checked against the kingdom with the plan carried out, so planned buildings take their ground.
      valid: (origin) => fits(view.world, shown, stage, placingKind, origin, turned),
      // A gate shows its two towers beside it.
      ...(placingKind === 'gate' && { extra: (origin: Point) => gateTiles(origin, gateAlong(shown, origin, turned)).filter((t) => t.x !== origin.x || t.y !== origin.y) }),
      pinned: preview ?? undefined,
      stroke: stroking,
      pinnedMany: previewMany ?? undefined,
    })
  }, [view, placingKind, movingBuilding, shown, stage, preview, previewMany, stroking, turned])

  // The whole-world map, opened from the minimap on phones.
  const [fullMap, setFullMap] = useState(false)
  const cancelPlacing = () => {
    setSailing(null)
    setTool(null)
    setMoving(null)
    setTurned(null)
    setPlacing(null)
    setPreview(null)
    setPreviewMany(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelPlacing()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // R turns a gate a quarter round from the way it faces under the pointer (or at the picked spot).
  const turnGate = () => {
    const current = kingdomRef.current
    const at = preview ?? hover?.tile
    if (!current || !at) return setTurned((t) => (t === 'y' ? 'x' : 'y'))
    setTurned(gateAlong(current, at, turned) === 'x' ? 'y' : 'x')
  }
  const turnRef = useRef(turnGate)
  turnRef.current = turnGate
  useEffect(() => {
    if (placingKind !== 'gate') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) turnRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placingKind])

  // While an army is being sent, the target the pointer is on or near (CLAUDE.md §8.2.1): another lord's lands, a
  // crown city or a town, whichever is nearest within AIM_SNAP_TILES; it is outlined, and a tap sends the army there.
  const snapAt = (tile: Point): (AimMark & { point: Point }) | null => {
    if (!view) return null
    const p = { x: tile.x + 0.5, y: tile.y + 0.5 }
    const away = (r: { x: number; y: number; size: number }) =>
      Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.size)), Math.max(r.y - p.y, 0, p.y - (r.y + r.size)))
    const t = serverNow()
    const options: (AimMark & { point: Point })[] = [
      ...rivals.map((r) => {
        const palace = r.buildings.find((b) => b.kind === 'palace')
        return {
          rect: territoryRect(r.site, territoryStage({ buildings: r.buildings } as Kingdom, t)),
          color: colorOf(r.color),
          label: r.name,
          point: palace ? { x: palace.x + 1, y: palace.y + 1 } : r.site,
        }
      }),
      ...view.world.cities.map((c, i) => ({
        rect: { x: c.x - 10, y: c.y - 10, size: balance.cities.size + 20 },
        color: parseInt(cityInfo(view.world, i).color.slice(1), 16),
        label: cityInfo(view.world, i).name,
        point: cityCenter(c),
      })),
      ...layer.towns.map((tw) => ({
        rect: { x: tw.x - 1, y: tw.y - 1, size: balance.towns.size + 2 },
        color: 0xf2d16b,
        label: tw.name,
        point: townCenter(tw),
      })),
    ]
    let best: (AimMark & { point: Point }) | null = null
    let bestD = AIM_SNAP_TILES
    for (const o of options) {
      const d = away(o.rect)
      if (d <= bestD) {
        bestD = d
        best = o
      }
    }
    return best
  }
  const aimTarget = useMemo(() => (aiming === null || !hover ? null : snapAt(hover.tile)), [aiming, hover?.tile.x, hover?.tile.y, view, rivals, layer.towns])
  const aimTargetRef = useRef(aimTarget)
  aimTargetRef.current = aimTarget
  useEffect(() => {
    view?.setAimMark(aimTarget ? { rect: aimTarget.rect, color: aimTarget.color, label: aimTarget.label } : null)
  }, [view, aimTarget])

  // Sends the aimed army toward a tile (an enemy's lands mean a siege; a town is besieged only with `siege`, from its
  // panel) and leaves aiming.
  const sendArmy = (army: number, tile: Point, siege = false) => {
    act({ type: 'army', army, order: { kind: 'move', x: Math.floor(tile.x), y: Math.floor(tile.y), ...(siege && { siege: true }) } }).then((r) => {
      const at = (r as { at?: string } | undefined)?.at
      if (at && Date.parse(at) > serverNow() + 5000) setToast('Elçi yola çıktı; emir orduya ulaşınca uygulanacak')
    })
    setAiming(null)
  }

  // Only one thing is picked to be sent at a time: an army or a fleet, whichever was picked last.
  useEffect(() => {
    if (armyFocus !== null) setFleetFocus((f) => (f?.lord === mine.id ? null : f))
  }, [armyFocus, mine.id])
  useEffect(() => {
    if (fleetFocus?.lord === mine.id) setArmyFocus(null)
  }, [fleetFocus, mine.id])

  // A right click on the map: the picked fleet sails there, or the picked army marches there (snapping onto a lord, a
  // city or a town nearby, as Hareket does; the messenger rules hold). While aiming or sailing it acts as a tap; while
  // placing or holding a tool it puts it down. With nothing picked it does nothing.
  rightTapRef.current = (tile) => {
    if (aiming !== null || sailing !== null) return tapRef.current(tile)
    if (placingKind || tool || movingBuilding) return cancelPlacing()
    const current = kingdomRef.current
    if (!view || !current) return
    if (fleetFocus?.lord === mine.id) {
      const id = fleetFocus.fleet
      const to = { x: tile.x + 0.5, y: tile.y + 0.5 }
      const why = sailError(view.world, current, id, to, serverNow())
      if (why === 'land') return setToast('Gemiler yalnız suda yüzer: bir nehre ya da göle tıkla')
      if (why === 'route') return setToast('Oraya su yolu yok')
      if (why) return setToast(why === 'away' ? 'Filo bir görevde; önce limana çağır' : 'Filo gönderilemedi')
      play('click')
      view.markMove(to, 0x7ad0ff)
      act({ type: 'fleet', action: 'sail', fleet: id, x: to.x, y: to.y })
      return
    }
    const army = armyFocus === null ? undefined : layer.armies.find((a) => a.id === armyFocus && a.kingdom_id === mine.id)
    if (!army) return
    if (army.status === 'battle') return setToast('Ordu muharebede; şimdi emir alamaz')
    const snap = snapAt(tile)
    play('click')
    view.markMove({ x: tile.x + 0.5, y: tile.y + 0.5 }, 0xf2d16b)
    if (snap) view.float(snap.point, snap.label, snap.color)
    sendArmy(army.id, snap?.point ?? tile)
  }

  tapRef.current = (tile, building, picked, inn, city, ship) => {
    let army = picked
    const current = kingdomRef.current
    // Sending a fleet: onto water only, and water that joins where it is.
    if (sailing !== null) {
      if (!view || !current) return
      const to = { x: tile.x + 0.5, y: tile.y + 0.5 }
      const why = sailError(view.world, current, sailing, to, serverNow())
      if (why === 'land') return setToast('Gemiler yalnız suda yüzer: bir nehre ya da göle tıkla')
      if (why === 'route') return setToast('Oraya su yolu yok')
      if (why) {
        setSailing(null)
        return setToast(why === 'away' ? 'Filo bir görevde; önce limana çağır' : 'Filo gönderilemedi')
      }
      play('click')
      act({ type: 'fleet', action: 'sail', fleet: sailing, x: to.x, y: to.y })
      setFleetFocus({ lord: mine.id, fleet: sailing })
      setSailing(null)
      return
    }
    if (aiming === null && !tool && !placingKind) {
      setFleetFocus(ship?.fleet !== undefined ? { lord: ship.lord, fleet: ship.fleet } : null)
      setFleetSheet(null)
      setOutlawOpen(null)
    }
    // A pirate boat (lord -1): its sheet, with "Takip et" for the player's fleets (CLAUDE.md §8.5).
    if (ship && ship.lord === OUTLAW_LORD && ship.fleet !== undefined && aiming === null && !tool && !placingKind) {
      setInnOpen(null)
      setCityOpen(null)
      setTownOpen(null)
      setSelected(null)
      setPanel(null)
      play('click')
      setOutlawOpen({ kind: 'boat', idx: ship.fleet })
      return
    }
    // A lord's ship: one's own opens the navy at its fleets (or harbour), another's opens that lord in diplomacy.
    if (ship && aiming === null && !tool && !placingKind) {
      setInnOpen(null)
      setCityOpen(null)
      setTownOpen(null)
      setSelected(null)
      play('click')
      if (ship.lord === mine.id) {
        showArmyPart('sea')
        showPart('navy', ship.fleet !== undefined ? 'fleets' : 'harbour')
        setPanel('army')
      } else if (ship.fleet !== undefined) {
        // Another lord's fleet: its sheet (how many of which ships, what it is doing).
        setPanel(null)
        setFleetSheet({ lord: ship.lord, fleet: ship.fleet })
      } else {
        setFocus(ship.lord)
        setPanel('diplomacy')
      }
      return
    }
    if (aiming === null && !tool && !placingKind) setInnOpen(inn ?? null)
    if (aiming === null && !tool && !placingKind) setCityOpen(city ?? null)
    // A town's houses and lanes open its sheet.
    if (aiming === null && !tool && !placingKind) setTownOpen(townsRef.current.find((t) => inTown(t, tile))?.id ?? null)
    // Choosing where an army marches: onto a bandit clan's cave the lord has found, it lays siege to it (CLAUDE.md §7.9.1).
    if (aiming !== null && army !== undefined && army <= -CAVE_ID) {
      play('click')
      act({ type: 'army', army: aiming, order: { kind: 'cave', slot: -army - CAVE_ID } })
      setAiming(null)
      return
    }
    // Choosing where an army marches: onto a band of bandits, it goes after it (CLAUDE.md §7.9).
    if (aiming !== null && army !== undefined && army <= -BAND_ID && army > -CAVE_ID) {
      play('click')
      act({ type: 'army', army: aiming, order: { kind: 'chase', band: -army - BAND_ID } })
      setAiming(null)
      return
    }
    // Choosing where an army marches: onto the target the pointer has snapped to, if any.
    if (aiming !== null) {
      sendArmy(aiming, aimTargetRef.current?.point ?? tile)
      return
    }
    // Tearing down: every building clicked joins the plan.
    if (tool === 'demolish') {
      if (building === undefined || !current) return
      if (!current.buildings.some((b) => b.id === building)) return setToast('Planlanan yapıyı plan çubuğundaki Geri al ile kaldır')
      play('click')
      // A second click takes the mark off.
      if (demolishing.has(building)) return setPlan((steps) => steps.filter((s) => !(s.type === 'demolish' && s.id === building)))
      if (!canDemolish(current, building)) return setToast('Saray ve ticaret noktası yıkılamaz')
      planDemolish(building)
      return
    }
    // Moving: a click on a building picks it up (instead of the one in hand), a click on the ground sets it down there.
    if (tool === 'move') {
      if (building !== undefined) return pickUp(building)
      if (!movingBuilding || !shown || !view) return
      const origin = footprintOrigin(tile, movingBuilding.size)
      const error = moveError(view.world, shown, stage, movingBuilding.id, origin, serverNow())
      if (error && error !== 'queue') return setToast(BUILD_ERRORS[error])
      addToPlan([{ type: 'move', id: movingBuilding.id, ...origin }])
      setMoving(null)
      return
    }
    // A tap on open ground right by one of the player's armies picks that army, as a tap on it does.
    if (army === undefined && building === undefined && inn === undefined && city === undefined && !placingKind && !tool) {
      const t = serverNow()
      let best: { id: number; d: number } | null = null
      for (const a of layer.armies) {
        if (a.kingdom_id !== mine.id) continue
        const p = armyAt(a, t)
        const d = Math.hypot(p.x - (tile.x + 0.5), p.y - (tile.y + 0.5))
        if (d <= ARMY_PICK_TILES && (!best || d < best.d)) best = { id: a.id, d }
      }
      if (best) army = best.id
    }
    // A cave in the rock (one found, by its guards; or any cave mouth tapped): its sheet (CLAUDE.md §7.9.1).
    const caveTapped = army !== undefined && army <= -CAVE_ID ? -army - CAVE_ID : null
    const caveHere = caveTapped === null && army === undefined && building === undefined && inn === undefined && city === undefined && view ? caveAt(caveSpots(view.world, view.world.seed), tile) : undefined
    if ((caveTapped !== null || caveHere) && !placingKind && !tool && aiming === null) {
      setSelected(null)
      setPanel(null)
      setInnOpen(null)
      setCityOpen(null)
      setTownOpen(null)
      play('click')
      if (caveTapped !== null) setOutlawOpen({ kind: 'clan', idx: caveTapped })
      else setOutlawOpen({ kind: 'cave', idx: caveHere!.idx })
      return
    }
    // A crown's patrol or its tribute collectors: who they are and where they ride (CLAUDE.md §7.8).
    const column = army !== undefined ? crownColumns.current.get(army) : undefined
    if (column && !placingKind && !tool && aiming === null) {
      setSelected(null)
      setPanel(null)
      setInnOpen(null)
      setCityOpen(null)
      setTownOpen(null)
      setOutlawOpen(null)
      play('click')
      setColumnOpen(column)
      return
    }
    // A town's rebels at its gate: the town's sheet.
    if (army !== undefined && army <= -REBELS_ID && army > -TRIBUTE_ID && !placingKind && !tool && aiming === null) {
      setSelected(null)
      setPanel(null)
      play('click')
      setTownOpen(-army - REBELS_ID)
      return
    }
    // A pretender's camp: its lord's page (the player's own in the palace's dynasty part).
    if (army !== undefined && army <= -CAMP_ID && army > -BAND_ID && !placingKind && !tool && aiming === null) {
      const lord = -army - CAMP_ID
      setSelected(null)
      play('click')
      if (lord === mine.id) {
        showPalacePart('house')
        setPanel('kingdom')
      } else {
        setFocus(lord)
        setPanel('diplomacy')
      }
      return
    }
    // A band of bandits: its sheet, with "Takip et" for the player's armies (CLAUDE.md §7.9).
    if (army !== undefined && army <= -BAND_ID && army > -CAVE_ID && !placingKind && !tool && aiming === null) {
      setSelected(null)
      setPanel(null)
      setInnOpen(null)
      setCityOpen(null)
      setTownOpen(null)
      play('click')
      setOutlawOpen({ kind: 'band', idx: -army - BAND_ID })
      return
    }
    if (army !== undefined && !placingKind) {
      const owner = layer.armies.find((a) => a.id === army)?.kingdom_id
      if (owner === mine.id) {
        setArmyFocus(army)
        setSelected(null)
        setPanel('army')
      } else if (owner !== undefined) {
        setFocus(owner)
        setSelected(null)
        setPanel('diplomacy')
      }
      return
    }
    // Without a building in hand, a tap on a building opens its menu; on open ground it closes it. An inn opens its
    // sheet (above).
    if ((inn !== undefined || city !== undefined) && !placingKind) {
      setSelected(null)
      setPanel(null)
      return
    }
    if (view && current && !placingKind) {
      // A tap on open ground lets go of the picked army.
      if (building === undefined) setArmyFocus(null)
      setSelected(building ?? null)
      if (building !== undefined) setPanel(null)
      return
    }
    if (!view || !placingKind || !current) return
    const origin = footprintOrigin(tile, BUILDINGS[placingKind].size)
    if (placingKind === 'palace') {
      // The palace's spot waits for confirmation (see ConfirmBuild); picking again moves it.
      const error = buildError(view.world, current, stage, placingKind, origin, serverNow(), turned)
      if (error) {
        setToast(BUILD_ERRORS[error])
        setPreview(null)
        return
      }
      return setPreview(origin)
    }
    // Everything else joins the plan; the player keeps placing until done, then confirms the plan.
    const base = shown ?? current
    const error = buildError(view.world, base, stage, placingKind, origin, serverNow(), turned)
    if (error && error !== 'queue') return setToast(error === 'cost' ? (missingText(BUILDINGS[placingKind].cost, base.stock) ?? BUILD_ERRORS.cost) : BUILD_ERRORS[error])
    const along = placingKind === 'gate' ? gateAlong(base, origin, turned) : undefined
    addToPlan([{ type: 'build', kind: placingKind, ...origin, ...(along && { along }) }])
  }
  const confirmBuild = () => {
    const current = kingdomRef.current
    if (!view || !placingKind || !current || !preview) return
    const time = serverNow()
    const error = buildError(view.world, current, stage, placingKind, preview, time, turned)
    if (error) {
      setToast(BUILD_ERRORS[error])
      setPreview(null)
      return
    }
    play('start')
    const along = placingKind === 'gate' ? gateAlong(current, preview, turned) : undefined
    command({ type: 'build', kind: placingKind, ...preview, ...(along && { along }) }, build(view.world, current, stage, placingKind, preview, time, along))
    cancelPlacing()
  }

  // A dragged row: the spots that fit join the plan.
  strokeRef.current = (spots) => {
    const current = shown ?? kingdomRef.current
    if (!view || !placingKind || !current) return
    const size = BUILDINGS[placingKind].size
    const placeable = spots.filter((p) => canPlace(view.world, current, stage, { ...p, size }, 0, placingKind))
    if (placeable.length === 0) return setToast(BUILD_ERRORS.spot)
    const kind = placingKind
    addToPlan(placeable.map((p): PlanStep => ({ type: 'build', kind, ...p })))
  }
  // Steps join the plan up to the most one command carries (balance.economy.maxPlan); the rest wait for the next plan.
  const planFull = `Plan en fazla ${balance.economy.maxPlan} adım alır; önce onu onayla`
  const addToPlan = (steps: PlanStep[]) => {
    const room = balance.economy.maxPlan - plan.length
    if (room < steps.length) setToast(planFull)
    if (room > 0) setPlan([...plan, ...steps.slice(0, room)])
  }
  // The plan, confirmed: every step goes to the server in one command.
  const confirmPlan = () => {
    const current = kingdomRef.current
    if (!view || !current || plan.length === 0) return
    const { kingdom: predicted, done, skipped } = applyPlan(view.world, current, stage, plan, serverNow())
    setPlan([])
    cancelPlacing()
    if (!done) return setToast('Plandaki hiçbir adım şu an yapılamıyor')
    play('start')
    command({ type: 'plan', steps: plan }, predicted)
    if (skipped > 0) setToast(`${skipped} adım yapılamadı (kaynak, sınır ya da yer)`)
  }
  // Picks a building up to be moved; moving it again replaces the move already planned.
  const pickUp = (id: number) => {
    const current = kingdomRef.current
    const b = current?.buildings.find((x) => x.id === id)
    if (!b) return setToast('Planlanan yapıyı plan çubuğundaki Geri al ile kaldır')
    if (!movable(b)) return setToast('Saray, ticaret noktası, iskele, sur ve kapı taşınamaz')
    if (b.doneAt > serverNow()) return setToast(BUILD_ERRORS.busy)
    setPlan((steps) => steps.filter((s) => !((s.type === 'move' || s.type === 'demolish') && s.id === id)))
    setMoving(id)
  }
  const startTool = (next: 'demolish' | 'move') => {
    setPlacing(null)
    setPreview(null)
    setPanel(null)
    setSelected(null)
    setMoving(null)
    setTool(next)
  }
  const startMoving = (id: number) => {
    startTool('move')
    pickUp(id)
  }
  const planDemolish = (id: number) => {
    const kept = plan.filter((s) => !((s.type === 'move' || s.type === 'demolish') && s.id === id))
    if (kept.length >= balance.economy.maxPlan) return setToast(planFull)
    setPlan([...kept, { type: 'demolish', id }])
  }

  const startPlacing = (kind: BuildingKind) => {
    const base = shown ?? kingdom
    const error = view && base && buildError(view.world, base, stage, kind, null, serverNow())
    // Planned buildings wait for a free construction slot instead of needing one now.
    if (error && error !== 'queue') return setToast(error === 'cost' && base ? (missingText(BUILDINGS[kind].cost, base.stock) ?? BUILD_ERRORS.cost) : BUILD_ERRORS[error])
    setPanel(null)
    setMoving(null)
    // The dock has its own plot on the shore: no placing, it joins the plan there.
    if (kind === 'dock' && view && kingdom?.dockPlot) {
      addToPlan([{ type: 'build', kind: 'dock', x: kingdom.dockPlot.x, y: kingdom.dockPlot.y }])
      view.centerOn({ x: kingdom.dockPlot.x + 1, y: kingdom.dockPlot.y + 1 })
      return
    }
    setPlacing(kind)
  }

  const chooseGood = (good: Good | null) => kingdom && command({ type: 'tradeGood', good: good ?? 'none' }, setTradeGood(kingdom, good, serverNow()))
  const chooseTradeAmount = (units: number) => kingdom && command({ type: 'tradeAmount', units }, setTradeAmount(kingdom, units, serverNow()))
  const upgrade = (id: number) => {
    if (!kingdom) return
    const error = upgradeError(kingdom, id, serverNow())
    if (error === 'cost') return setToast(missingText(upgradeSpec(kingdom.buildings.find((b) => b.id === id)!)?.cost, kingdom.stock) ?? BUILD_ERRORS.cost)
    if (error) return setToast(BUILD_ERRORS[error])
    play('start')
    command({ type: 'upgrade', id }, upgradeBuilding(kingdom, id, serverNow()))
  }

  const found = (name: string, color: string) => {
    if (!choosing) return
    command({ type: 'found', site: selectedSite, name, color })
  }
  // Older rows were given one site at a time: ask for the rest, so all of them can be compared at once.
  const rolled = useRef(false)
  useEffect(() => {
    if (kingdom || rolled.current || mine.sites.length === 0 || mine.sites.length >= balance.economy.siteRolls) return
    rolled.current = true
    void command({ type: 'roll' })
  })

  // Starting over asks twice: the button once, then the envoy himself.
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetAsk, setResetAsk] = useState(false)
  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 5000)
      return
    }
    setConfirmReset(false)
    setResetAsk(true)
  }
  const resetNow = () => {
    setResetAsk(false)
    cancelPlacing()
    setPanel(null)
    resetJournal()
    setSelectedSite(0)
    command({ type: 'reset' })
  }


  // ---- The lobby: kingdoms, diplomacy, spies, armies ----

  const loadIntel = useCallback(
    (target: number) => {
      act<IntelReport>({ type: 'intel', target }).then((report) => setIntel((all) => ({ ...all, [target]: report ?? null })))
    },
    [act],
  )
  const palaceOf = (buildings: { kind: string; level?: number; doneAt: number }[]) => {
    const p = buildings.find((b) => b.kind === 'palace')
    return p ? Math.max(1, (p.level ?? 1) - (p.doneAt > now ? 1 : 0)) : 0
  }
  const kingdoms: KingdomInfo[] = useMemo(
    () => [
      ...(kingdom
        ? [{ id: mine.id, name: kingdom.name ?? 'Lordluğun', color: kingdom.color ?? null, username: null, site: kingdom.site, queen: !!kingdom.queen, palace: palaceOf(kingdom.buildings), shieldUntil: kingdom.shieldUntil ?? null, score: scoreOf(kingdom, now), tradeGood: kingdom.trade.idle ? null : kingdom.trade.good, tradeLedger: kingdom.trade.ledger ?? null, tradeDamaged: !!kingdom.trade.damaged, liege: kingdom.liege ?? null, blockade: kingdom.blockade ?? null }]
        : []),
      ...rivals.map((r) => ({ id: r.id, name: r.name, color: r.color, username: r.username, site: r.site, queen: r.queen, palace: palaceOf(r.buildings), seenAt: r.seen_at, buildings: r.buildings, shieldUntil: r.shield_until, score: r.score ?? null, tradeGood: r.trade_good ?? null, tradeLedger: r.trade_ledger ?? null, tradeDamaged: !!r.trade_damaged, liege: r.liege ?? null, navy: r.navy ?? null, blockade: r.blockade ?? null })),
    ],
    // Palace levels only change with the buildings.
    [kingdom?.name, kingdom?.color, kingdom?.site, kingdom?.queen, kingdom?.buildings, kingdom?.trade, rivals, mine.id],
  )
  const online: Online = {
    ...layer,
    lobby,
    me: mine.id,
    kingdoms,
    focus,
    setFocus,
    army: armyFocus,
    setArmy: setArmyFocus,
    fleet: fleetFocus?.lord === mine.id ? fleetFocus.fleet : null,
    showFleet: (id) => {
      setFleetFocus({ lord: mine.id, fleet: id })
      const current = kingdomRef.current
      const f = current?.navy?.fleets.find((x) => x.id === id)
      const at = view && current && f ? fleetAt(view.world, current, f, serverNow()) : null
      if (at && view) view.centerOn({ x: Math.floor(at.x), y: Math.floor(at.y) })
    },
    intel,
    loadIntel,
    act,
    target: (army) => {
      setAiming(army)
      setPanel(null)
      setSelected(null)
    },
    sail: (fleet) => {
      setSailing(fleet)
      setPanel(null)
      setSelected(null)
    },
    watch: setWatching,
    watchTown: setWatchingTown,
    openCrown: (index) => {
      setPanel(null)
      setSelected(null)
      setInnOpen(null)
      setTownOpen(null)
      setCityOpen(index)
      const c = view?.world.cities[index]
      if (c) view!.centerOn(cityCenter(c))
    },
    following,
    follow: setFollowing,
    crowns: view ? view.world.cities.map((_, i) => cityInfo(view.world, i).name) : [],
  }

  // The camera locked onto an army: it glides along with it until let go, dragged away, or the army is gone.
  const armiesRef = useRef(layer.armies)
  armiesRef.current = layer.armies
  useEffect(() => {
    if (!view || following === null) return
    view.follow(
      () => {
        const army = armiesRef.current.find((a) => a.id === following)
        return army ? armyAt(army, serverNow()) : null
      },
      () => setFollowing(null),
    )
    return () => view.follow(null)
  }, [view, following])
  useEffect(() => {
    if (following !== null && !layer.armies.some((a) => a.id === following)) setFollowing(null)
  }, [following, layer.armies])

  // The crown kingdoms' patrols (CLAUDE.md §7.8): worked out from the seed and the clock like the server does, and
  // drawn as small mounted squads in the crown's colour. Redrawn at each turn of their errand.
  const lordsKey = JSON.stringify([[mine.id, shown?.liege ?? null], ...rivals.map((r) => [r.id, r.liege ?? null])])
  const [patrolStep, setPatrolStep] = useState(0)
  useEffect(() => {
    const t = serverNow()
    const times = patrolTimes(patrolSlotAt(t))
    const next = [times.arrive, times.leave, times.home, times.start + patrolSlotMs()].find((x) => x > t) ?? t + 1000
    // The tribute collectors set out and turn back at times of their own: looked at every few seconds.
    const id = window.setTimeout(() => setPatrolStep((n) => n + 1), Math.min(next - t + 50, 5000))
    return () => clearTimeout(id)
  }, [patrolStep])
  const patrolRoutes = useRef(new Map<string, { route: Point[]; gather: Point[] } | null>())
  // What each crown column on the map is, by its map id (for the sheet a tap on one opens).
  const crownColumns = useRef(new Map<number, CrownColumn>())
  const patrols = useMemo((): MapArmy[] => {
    if (!view || view.world.cities.length === 0) return []
    const t = serverNow()
    const slot = patrolSlotAt(t)
    const times = patrolTimes(slot)
    const lords: Lord[] = JSON.parse(lordsKey).map(([id, liege]: [number, number | null]) => ({ id, liege }))
    const towns = new Map<number, TownBuilding[]>([[mine.id, (shown?.buildings ?? []) as TownBuilding[]], ...rivals.map((r) => [r.id, r.buildings] as [number, TownBuilding[]])])
    const out: MapArmy[] = []
    const lordNameOf = (id: number) => (id === mine.id ? (shown?.name ?? null) : (rivals.find((r) => r.id === id)?.name ?? null))
    // What stands in the way (every lord's buildings, walls and gates included), as a short fingerprint: a route worked
    // out before a wall went up, or before the other lords had loaded, is worked out again rather than kept.
    let blockPrint = 0
    for (const [id, buildings] of towns) for (const b of buildings) blockPrint = (Math.imul(blockPrint ^ (id * 131 + b.x * 7919 + b.y * 104729 + b.size * 31 + b.kind.length), 0x01000193) + (b.broken ? 7 : 0)) >>> 0
    // The road from a capital's gate to the free ground in front of a building, and where the squads behind the head
    // gather round it there (CLAUDE.md §7.8; haltSpots), worked out once for the buildings as they stand.
    const routeTo = (base: string, city: { x: number; y: number }, stop: { x: number; y: number; size: number }, squads: number) => {
      const key = `${base}:${blockPrint}`
      if (!patrolRoutes.current.has(key)) {
        const blocked = patrolBlocker(view.world, [...towns.values()].map((buildings) => ({ buildings })))
        const { door, gather } = haltSpots(view.world, blocked, stop, squads - 1)
        const route = patrolRoute(view.world, city, capitalGate(city), door, blocked) ?? patrolRoute(view.world, city, capitalGate(city), door)
        patrolRoutes.current.set(key, route ? { route, gather } : null)
      }
      return patrolRoutes.current.get(key)
    }
    // A rival crown's tribute collectors (CLAUDE.md §7.8): they ride out so as to reach the lord's palace the moment
    // the demand is made, wait there while it may be answered, and ride home. Everyone sees them.
    const spec = balance.cities.crown.patrol
    const ride = spec.out * patrolSlotMs()
    const wait = spec.answerSeconds * 1000
    const tributeSlot = tributeSlotAt(t)
    for (const lord of lords) {
      const palace = (towns.get(lord.id) ?? []).find((b) => b.kind === 'palace' && b.doneAt <= t)
      if (!palace) continue
      for (const crown of tributeCrowns(view.world.cities.length, lord.liege)) {
        const city = view.world.cities[crown]
        for (const s of [tributeSlot - 1, tributeSlot, tributeSlot + 1]) {
          const arrive = tributeVisitAt(view.world.seed, crown, lord.id, s, lords, view.world.cities.length)
          if (t < arrive - ride || t >= arrive + wait + ride) continue
          const ride0 = routeTo(`tribute:${crown}:${lord.id}:${palace.x},${palace.y}`, city, palace, 2)
          if (!ride0 || ride0.route.length === 0) continue
          const { route, gather } = ride0
          const back = t >= arrive + wait
          const [path, departAt, arriveAt] = back ? [[...route].reverse(), arrive + wait, arrive + wait + ride] : [route, arrive - ride, arrive]
          crownColumns.current.set(-(TRIBUTE_ID + lord.id * 8 + crown), { kind: 'tribute', crown, lord: back ? null : lord.id, lordName: back ? null : lordNameOf(lord.id) })
          out.push({ id: -(TRIBUTE_ID + lord.id * 8 + crown), color: crown % 2 === 0 ? 'crimson' : 'royal', own: false, soldiers: null, path, departAt, arriveAt, battle: false, selected: false, figures: 3, catapult: false, train: 2, size: 1.3, trainAhead: back, gather, tag: `${cityInfo(view.world, crown).capital} haraççıları`, tagColor: parseInt(cityInfo(view.world, crown).color.slice(1), 16) })
        }
      }
    }
    if (t >= times.home) return out
    view.world.cities.forEach((city, crown) => {
      for (let p = 0; p < balance.cities.crown.patrol.perCrown; p++) {
        const target = patrolTarget(view.world.seed, crown, p, slot, lords)
        if (target === null) continue
        const liege = lords.find((l) => l.id === target)?.liege
        const done = (towns.get(target) ?? []).filter((b) => b.doneAt <= times.arrive)
        // Its own crown's patrol stops at the house of entertainment, if there is one; otherwise at the palace.
        const stop = (visitKind(crown, liege) === 'tip' && done.find((b) => b.kind === 'tavern')) || done.find((b) => b.kind === 'palace')
        if (!stop) continue
        // The lord in the key: drawn before the other lords had loaded, the patrol may have been sent elsewhere.
        const ride0 = routeTo(`${crown}:${p}:${slot}:${target}:${stop.id}`, city, stop, 5)
        if (!ride0 || ride0.route.length === 0) continue
        const { route, gather } = ride0
        // Through the stay the column stands gathered round the building's front, then rides back the way it came.
        const back = t >= times.leave
        const [path, departAt, arriveAt] = back ? [[...route].reverse(), times.leave, times.home] : [route, times.start, times.arrive]
        crownColumns.current.set(-(crown * 16 + p + 1), { kind: 'patrol', crown, lord: back ? null : target, lordName: back ? null : lordNameOf(target) })
        out.push({ id: -(crown * 16 + p + 1), color: crown % 2 === 0 ? 'crimson' : 'royal', own: false, soldiers: null, path, departAt, arriveAt, battle: false, selected: false, figures: 4, catapult: false, train: 5, size: 1.6, trainAhead: back, gather, tag: `${cityInfo(view.world, crown).capital} devriyesi`, tagColor: parseInt(cityInfo(view.world, crown).color.slice(1), 16) })
      }
    })
    if (patrolRoutes.current.size > 256) patrolRoutes.current.clear()
    return out
  }, [view, lordsKey, patrolStep, mapBuildings, rivals])

  // When the crown's patrol or a rival crown's collectors reach the player's palace, the server is nudged at that
  // moment so the envoy's dialog comes as they arrive, not at the next minute's tick.
  useEffect(() => {
    if (!view || view.world.cities.length === 0 || !shown) return
    const t = serverNow()
    const lords: Lord[] = JSON.parse(lordsKey).map(([id, liege]: [number, number | null]) => ({ id, liege }))
    const due: number[] = []
    for (const slot of [patrolSlotAt(t), patrolSlotAt(t) + 1]) {
      view.world.cities.forEach((_, crown) => {
        for (let p = 0; p < balance.cities.crown.patrol.perCrown; p++) if (patrolTarget(view.world.seed, crown, p, slot, lords) === mine.id) due.push(patrolTimes(slot).arrive)
      })
    }
    const wait = balance.cities.crown.patrol.answerSeconds * 1000
    for (const crown of tributeCrowns(view.world.cities.length, shown.liege)) {
      for (const s of [tributeSlotAt(t), tributeSlotAt(t) + 1]) {
        const arrive = tributeVisitAt(view.world.seed, crown, mine.id, s, lords, view.world.cities.length)
        due.push(arrive, arrive + wait)
      }
    }
    const next = Math.min(...due.filter((x) => x > t))
    if (!Number.isFinite(next)) return
    const id = window.setTimeout(() => settle(lobby.id).then(() => refreshAll()), next - t + 1500)
    return () => clearTimeout(id)
  }, [view, lordsKey, patrolStep, mine.id, shown?.liege])

  // A town's rebels camped at its gate (CLAUDE.md §8.4), drawn as a squad in black and grey, everyone sees them.
  const rebelSquads = useMemo(
    (): MapArmy[] =>
      layer.towns
        .filter((t) => t.rebels)
        .map((t) => {
          const gate = townGate(t)
          const since = t.rebels!.since
          return { id: -(REBELS_ID + t.id), color: REBEL_COLOR, own: false, soldiers: null, path: [{ x: gate.x + 1.4, y: gate.y + 0.4 }], departAt: since, arriveAt: since, battle: !!t.rebels!.battle, selected: false, figures: Math.min(20, Math.max(2, Math.ceil(t.rebels!.count / 2))), catapult: false, tag: `${t.name} asileri`, tagOutlaw: true }
        }),
    [layer.towns],
  )

  // The bands of bandits on the trade roads (CLAUDE.md §7.9): worked out from the seed and the clock like the server
  // does, drawn as ragged squads under a torn black banner; redrawn as each turns round at the end of its stretch.
  const [bandStep, setBandStep] = useState(0)
  const bands = useMemo(() => (view ? lobbyBands(view.world, layer.outlaws) : []), [view, layer.outlaws])
  const banditSquads = useMemo((): MapArmy[] => {
    const t = serverNow()
    const out: MapArmy[] = []
    for (const b of bands) {
      if (!outlawUp(b, t)) continue
      const figures = Math.min(20, Math.max(2, Math.ceil(b.soldiers / 2)))
      const fight = b.battle !== null ? layer.battles.find((x) => x.id === b.battle && !x.resolved) : undefined
      if (fight) {
        out.push({ id: -(BAND_ID + b.idx), color: BANDIT_COLOR, own: false, soldiers: null, path: [{ x: fight.x + 0.8, y: fight.y + 0.4 }], departAt: t, arriveAt: t, battle: true, selected: false, figures, catapult: false, tag: `${b.name} · ${b.clanName}`, tagOutlaw: true })
        continue
      }
      const leg = bandLeg(b, t)
      out.push({ id: -(BAND_ID + b.idx), color: BANDIT_COLOR, own: false, soldiers: null, path: leg.path, departAt: leg.departAt, arriveAt: leg.arriveAt, battle: false, selected: false, figures, catapult: false, tag: `${b.name} · ${b.clanName}`, tagOutlaw: true })
    }
    // The caves the player has found, each with its clan's guards before the mouth (no one else sees them there).
    for (const clan of clansOf(view?.world.seed ?? 0, layer.outlaws)) {
      const trail = trailOf(kingdom?.caveTrail, clan)
      const cave = trail?.cave !== undefined && view ? caveSpots(view.world, view.world.seed)[trail.cave] : undefined
      if (!cave) continue
      const fight = clan.battle !== null ? layer.battles.find((x) => x.id === clan.battle && !x.resolved) : undefined
      out.push({ id: -(CAVE_ID + clan.slot), color: BANDIT_COLOR, own: false, soldiers: null, path: [{ x: cave.front.x - cave.dx * 0.15, y: cave.front.y - cave.dy * 0.15 }], departAt: t, arriveAt: t, battle: !!fight, selected: false, figures: 4, catapult: false, tag: `${clan.name} · mağara`, tagOutlaw: true })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands, bandStep, layer.battles, layer.outlaws, kingdom?.caveTrail, view])
  useEffect(() => {
    const t = serverNow()
    const ends = banditSquads.filter((a) => !a.battle && a.arriveAt > t).map((a) => a.arriveAt)
    // Bands beaten come back on their own.
    for (const b of bands) if (b.downUntil !== null && b.downUntil > t) ends.push(b.downUntil)
    const next = ends.length ? Math.min(...ends) : t + 30_000
    const id = window.setTimeout(() => setBandStep((n) => n + 1), Math.max(500, Math.min(next - t + 100, 60_000)))
    return () => clearTimeout(id)
  }, [banditSquads, bands])

  // Bandits on the road by the player's trade post, pirates by the dock, and the chases under way: hot spots by the
  // minimap (CLAUDE.md §7.9, §8.5).
  const outlawSpots = useMemo((): Spot[] => {
    if (!view || !kingdom) return []
    const t = serverNow()
    const out: Spot[] = []
    const post = kingdom.buildings.find((b) => b.kind === 'tradePost' && b.doneAt <= t)
    const dock = kingdom.buildings.find((b) => b.kind === 'dock' && b.doneAt <= t)
    const mid = (b: { x: number; y: number; size: number }) => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
    for (const b of bands) {
      if (!outlawUp(b, t) || !post) continue
      if (roadHeld(view.world, view.world.seed, [b], mid(post), t).share > 0) out.push({ key: `band${b.idx}`, label: `${b.name} yolunu tutuyor`, at: bandAt(b, t) })
    }
    for (const b of lobbyBoats(view.world, layer.outlaws)) {
      if (!outlawUp(b, t)) continue
      const chasing = kingdom.navy?.fleets.some((f) => f.chase?.boat === b.idx)
      if (chasing || (dock && seaHeld([b], mid(dock), t).share > 0)) out.push({ key: `boat${b.idx}`, label: chasing ? `Filon ${b.name} peşinde` : `${b.name} sularında`, at: boatAt(b, t).at })
    }
    // The clans' caves the player has found (CLAUDE.md §7.9.1).
    for (const clan of clansOf(view.world.seed, layer.outlaws)) {
      const trail = trailOf(kingdom.caveTrail, clan)
      const cave = trail?.cave !== undefined ? caveSpots(view.world, view.world.seed)[trail.cave] : undefined
      if (cave) out.push({ key: `cave${clan.slot}`, label: `${clan.name} mağarası`, at: cave.mouth })
    }
    for (const a of layer.armies) {
      const goal = a.goal
      if (a.kingdom_id !== mine.id || goal.kind !== 'chase') continue
      const band = bands.find((b) => b.idx === goal.band)
      out.push({ key: `chase${a.id}`, label: `Ordun ${band?.name ?? 'yağmacıların'} peşinde`, at: armyAt(a, t) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, bands, bandStep, layer.outlaws, layer.armies, kingdom?.buildings, kingdom?.navy, kingdom?.caveTrail, mine.id])
  // A pretender's men at their camp's gate (CLAUDE.md §9.1.1), drawn like a town's rebels, more of them as it grows.
  const campSquads = useMemo(
    (): MapArmy[] =>
      camps
        .filter((c) => !c.marching)
        .map((c) => ({ id: -(CAMP_ID + c.lord), color: REBEL_COLOR, own: false, soldiers: null, path: [{ x: c.at.x + 0.5, y: c.at.y + 4.2 }], departAt: c.since, arriveAt: c.since, battle: !!c.battle, selected: false, figures: Math.min(20, Math.max(2, Math.ceil(campSoldiers(c, now) / 3))), catapult: false })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campKey],
  )

  // Armies and battles on the map.
  useEffect(() => {
    if (!view) return
    const colors = new Map(kingdoms.map((k) => [k.id, k.color]))
    const names = new Map(kingdoms.map((k) => [k.id, k.name]))
    view.setArmies(
      [...patrols, ...layer.armies.map((a): MapArmy => ({
        id: a.id,
        color: colors.get(a.kingdom_id) ?? null,
        own: a.kingdom_id === mine.id,
        soldiers: a.soldiers,
        path: a.path,
        departAt: Date.parse(a.depart_at),
        arriveAt: Date.parse(a.arrive_at),
        battle: a.status === 'battle',
        selected: a.id === armyFocus,
        // Own armies by their exact size; others by what everyone can see of them.
        figures: a.soldiers !== null ? Math.min(20, Math.max(2, Math.ceil(a.soldiers / 2))) : (a.figures ?? 3),
        catapult: a.units ? (a.units.catapult ?? 0) > 0 : !!a.catapults,
        // The lord at its head (own armies: only while he lives and rules).
        royal: a.kingdom_id === mine.id ? !!kingdomRef.current && leadsArmy(kingdomRef.current, a.led_by, serverNow()) : !!a.royal,
        // Whose it is and how many: exact for the player's own, roughly for the rest (CLAUDE.md §9.7).
        tag: `${names.get(a.kingdom_id) ?? 'Bir lord'} · ${a.soldiers !== null ? a.soldiers : roughSize(a.figures ?? 3)}`,
        tagColor: colorOf(colors.get(a.kingdom_id)),
      })), ...rebelSquads, ...banditSquads, ...campSquads],
      layer.battles
        .filter((b) => !b.resolved || Date.parse(b.ends_at) > serverNow())
        .map((b) => ({ id: b.id, at: { x: b.x, y: b.y }, startedAt: Date.parse(b.started_at), endsAt: Date.parse(b.ends_at) })),
    )
  }, [view, layer.armies, layer.battles, kingdoms, mine.id, armyFocus, patrols, rebelSquads, banditSquads, campSquads])

  // The lords' ships at their docks and at sea (CLAUDE.md §8.5): each drawn as its type, warships first.
  const kindsOf = (ships: Ships | null | undefined): ShipKind[] => (['galley', 'corsair', 'cog'] as const).flatMap((x) => Array.from({ length: Math.min(4, ships?.[x] ?? 0) }, () => x)).slice(0, 4)
  const fleetKey = JSON.stringify([kingdom?.navy?.harbour, kingdom?.navy?.fleets.map((f) => [f.id, f.ships, f.mission.kind, f.mission.kind === 'trade' ? f.mission.departedAt : 0, f.sail?.departAt]), kingdom?.blockade?.by, rivals.map((r) => [r.id, r.navy, r.blockade?.by])])
  useEffect(() => {
    if (!view) return
    const lords: NavyOnMap[] = []
    const dockOf = (buildings: { kind: string; x: number; y: number; size: number; doneAt: number }[]) => buildings.find((b) => b.kind === 'dock' && b.doneAt <= serverNow())
    if (kingdom) {
      const dock = dockOf(kingdom.buildings)
      const navy = kingdom.navy
      if (dock && (navy || kingdom.blockade)) {
        lords.push({
          id: mine.id,
          color: colorOf(kingdom.color),
          dock: { x: dock.x, y: dock.y, size: dock.size },
          harbour: kindsOf(navy?.harbour),
          fleets: (navy?.fleets ?? []).map((f) => ({ id: f.id, ships: countShips(f.ships), kinds: kindsOf(f.ships), mission: f.mission.kind, sail: f.sail, ...(f.mission.kind === 'trade' && { departedAt: f.mission.departedAt, tripMs: f.mission.tripMs }) })),
          blockade: kingdom.blockade,
        })
      }
    }
    for (const r of rivals) {
      const dock = dockOf(r.buildings)
      if (!dock || (!r.navy && !r.blockade)) continue
      lords.push({
        id: r.id,
        color: colorOf(r.color),
        dock: { x: dock.x, y: dock.y, size: dock.size },
        // Others' harbours and fleets come only roughly sized (whether galleys sail among them; types are for spies).
        harbour: Array.from({ length: Math.min(4, r.navy?.harbour ?? 0) }, () => 'cog' as const),
        fleets: (r.navy?.fleets ?? []).map((f) => ({ id: f.id, ships: f.ships, rough: true, kinds: f.kinds ? kindsOf(f.kinds) : Array.from({ length: Math.min(3, f.ships) }, (_, i) => (i === 0 && f.galleys ? 'galley' : 'cog') as ShipKind), mission: f.mission, departedAt: f.departedAt, tripMs: f.tripMs, sail: f.sail })),
        blockade: r.blockade,
      })
    }
    // The pirate boats (CLAUDE.md §8.5): dark-sailed corsairs going round their loops (lord -1, the boat's number as the
    // fleet), a few in a line; the clock and the seed say where, as on the server.
    const t = serverNow()
    const pirates = lobbyBoats(view.world, layer.outlaws)
      .filter((b) => outlawUp(b, t))
      .flatMap((b) => {
        const period = (b.length / balance.outlaws.boats.speedTilesPerSecond) * 1000
        const start = -b.phase * period
        return Array.from({ length: b.ships }, (_, i) => ({
          key: `pirate:${b.idx}:${i}`,
          at: b.loop[0],
          loop: { path: b.loop, start, period },
          behind: i * 2.2,
          along: 'x' as const,
          reverse: false,
          seed: b.idx * 5 + i,
          length: SHIP_LENGTHS.pirate,
          kind: 'pirate' as const,
          lord: OUTLAW_LORD,
          fleet: b.idx,
          color: 0x2a2226,
          ...(i === 0 && { tag: `${b.name} · korsan` }),
        }))
      })
    view.setFleets([...fleetShips(view.world, lords), ...pirates])
  }, [view, fleetKey, layer.outlaws])

  // The envoy's dialogs, one at a time, once their moment has come.
  // A tribute demand still waiting for an answer comes before older news: it is paid on its own when its time runs out.
  const notice =
    layer.notices.find((n) => n.kind === 'patrol_tribute' && Date.parse(n.show_at) <= now && Number((n.payload as { expiresAt?: number }).expiresAt) > now) ??
    layer.notices.find((n) => Date.parse(n.show_at) <= now) ??
    null
  // Every piece of news is also written in the journal, on the envoy's paper (its sound plays as its dialog opens:
  // Envoy.tsx → soundForNotice).
  // (Each once: this runs every render, and describing every notice each second was wasted work, CLAUDE.md §12.)
  const journaled = useRef(new Set<number>())
  useEffect(() => {
    for (const n of layer.notices) {
      if (journaled.current.has(n.id)) continue
      const at = Date.parse(n.show_at)
      if (at > now) continue
      journaled.current.add(n.id)
      const { icon, title, text } = describeNotice(n, online)
      noteJournal(n.id, at, { icon, title, text: text || undefined, important: noticeHurts(n, kingdom?.name) })
    }
  })
  // The liege's royal envoy (CLAUDE.md §7.8): the request of the hour opens its dialog once (remembered in this
  // browser), and its arrival, delivery or running out goes in the journal (each once, under ids of its own).
  const royalLive = kingdom ? liveRequest(kingdom, layer.market, now) : null
  const royalKey = `royal-seen:${lobby.id}`
  const [royalSeen, setRoyalSeen] = useState(() => {
    try {
      return Number(localStorage.getItem(royalKey) ?? 0)
    } catch {
      return 0
    }
  })
  const seeRoyal = (n: number) => {
    setRoyalSeen(n)
    try {
      localStorage.setItem(royalKey, String(n))
    } catch {
      // Without storage it is only remembered for now.
    }
  }
  useEffect(() => {
    if (!view || !kingdom) return
    const req = royalRequest(kingdom, now, layer.market)
    if (!req) return
    const id = (n: number, k: number) => -(n * 4 + k)
    const answer = royalAnswer(kingdom, req.n)
    if (now < req.endsAt) noteJournal(id(req.n, 1), req.arriveAt, { icon: 'crown', title: 'Kraliyet elçisi geldi', text: `${royalSaying(view.world, req)} (Görevler kutusunda.)` })
    if (answer?.status === 'delivered') noteJournal(id(req.n, 2), answer.at, { icon: 'chest', title: 'Kraliyet isteği teslim edildi', text: `${fmt(req.units)} ${itemName(req.item)} başkente gitti; taç ${fmt(req.gold)} altın ödedi ve sana minnettar.` })
    // The one before (or this one, once over): run out without being handed over.
    const prev = now >= req.endsAt ? req : royalRequest(kingdom, req.arriveAt - 1, layer.market)
    if (!prev || now < prev.endsAt) return
    const was = royalAnswer(kingdom, prev.n)
    if (journal.notices?.includes(id(prev.n, 1)) && (!was || was.status === 'accepted'))
      noteJournal(id(prev.n, 3), prev.endsAt, { icon: 'warn', title: 'Kraliyet isteği yetişmedi', text: `${fmt(prev.units)} ${itemName(prev.item)} zamanında gönderilemedi; elçi eli boş döndü.` })
  })
  // The dialogs in a line (CLAUDE.md §9.8): how many came since the line began, for the "2 / 5" on each, and closing
  // them all at once (those still waiting for an answer stay: a live tribute demand, a crisis or a choice still open).
  const [crownQueue, setCrownQueue] = useState<Notice[]>([])
  // The crowns' news counts from when the lord was last seen (the server's time, as the game opened), so another device
  // does not tell it again; what happened while away is in the away report, so it pops up only from the report's close.
  const crownFrom = useRef<number>(initial.state?.lastSeenAt ?? serverNow())
  const crownPopFrom = useRef<number>(away ? Infinity : crownFrom.current)
  useEffect(() => {
    if (!away && crownPopFrom.current === Infinity) crownPopFrom.current = serverNow()
  }, [away])
  const [lineSeen, setLineSeen] = useState(0)
  const [closedTitles, setClosedTitles] = useState<SummaryItem[] | null>(null)
  const dueNotices = layer.notices.filter((n) => Date.parse(n.show_at) <= now)
  const waiting = dueNotices.length + houseQueue.length + fortunes.length + crownQueue.length
  useEffect(() => {
    if (waiting === 0 && lineSeen !== 0) setLineSeen(0)
  }, [waiting, lineSeen])
  // When the player last went on to the next dialog: news waiting behind the ones being read does not grow stale.
  const lastStep = useRef(0)
  const stepLine = () => {
    lastStep.current = serverNow()
    setLineSeen((n) => n + 1)
  }
  const closeNotice = () => {
    if (!notice) return
    markSeen([notice.id])
    dropNotices([notice.id])
    stepLine()
  }
  // A crown's ruler died and the heir is crowned (CLAUDE.md §7.8): told by the envoy once per reign in this browser
  // (the reigns follow from the clock, so there is nothing to fetch), and written in the journal.
  const crownTick = Math.floor(now / 5000)
  useEffect(() => {
    if (!view || !kingdom || kingdom.lobbyKey === undefined || view.world.cities.length === 0) return
    const news = crownNews(lobby.id, mine.id, kingdom, view.world.cities.length, crownFrom.current, crownPopFrom.current, serverNow())
    for (const n of news.journal) {
      const { icon, title, text } = describeNotice(n, online)
      noteJournal(n.id, Date.parse(n.show_at), { icon, title, text })
    }
    if (news.show.length > 0) setCrownQueue((q) => [...q, ...news.show])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crownTick, view, kingdom?.lobbyKey, kingdom?.seasonStart, lobby.id, mine.id])
  // The liege crown backed a beaten pretender: the lord may go over to the rival crown (CLAUDE.md §9.1.1). "Sonra" puts
  // the question off for this visit (it stays in Diplomasi → Krallık while it stands).
  const [betrayalLater, setBetrayalLater] = useState<number | null>(null)
  const betrayal = view && kingdom ? liveOffer(kingdom, view.world.cities.length, now) : null
  const watchedBattle = layer.battles.find((b) => b.id === watching) ?? null
  const watchedTown = layer.towns.find((t) => t.id === watchingTown) ?? null

  // The envoy as advisor and teacher (CLAUDE.md §9.8): called with the envoy button, coming on his own otherwise.
  const [advisorCall, setAdvisorCall] = useState(0)
  // A mini game's window is open (CLAUDE.md §6.5).
  const playing = usePlaying()
  const introShown = !!view && !!kingdom && !away && !introDone && kingdom.liege === undefined && view.world.cities.length > 1 && fealtyOpen(kingdom, now)
  // The merchant's first good is asked for in a dialog of its own; the envoy waits behind it, not over it.
  const pickingGood = !!kingdom && !needsPalace && hasTradePost(kingdom) && kingdom.trade.good === null && !kingdom.trade.idle
  // A crisis or a choice still waiting for an answer shows over the away report; one whose time ran out waits behind it.
  const fortuneDecisionOpen = (f: FortuneEvent, k: Kingdom, at: number) =>
    (!!f.crisis || !!f.dilemma) &&
    f.start !== undefined &&
    !k.responses?.[crisisKey({ scope: f.scope ?? 'kingdom', start: f.start })]?.choice &&
    at <= f.start + (f.dilemma ? dilemmaDecideMs() : crisisDecideMs())
  // A crisis or a choice still to be answered goes before the envoy's news: its time to decide runs out (a tribute
  // demand, which also runs out, is the one notice that stays ahead of it).
  const decisionFirst = !!kingdom && !!fortunes[0] && fortuneDecisionOpen(fortunes[0], kingdom, now) && notice?.kind !== 'patrol_tribute'
  // The summaries' lines, each enough to read the news again (DialogQueue.tsx → ClosedSummary).
  const noticeItem = (n: Notice): SummaryItem => describeNotice(n, online)
  const houseItem = (h: HouseNews): SummaryItem => ({ icon: 'crown', title: HOUSE_TITLES[h.kind] ?? 'Hanedandan haber', text: `${HOUSE_TITLES[h.kind] ?? 'Hanedandan haber'}: ${h.person.name}${h.heir ? `; yerine ${h.heir.name}` : ''}. Ayrıntısı Saray → Hanedan'da.` })
  const fortuneItem = (f: FortuneEvent): SummaryItem => {
    const t = FORTUNE_TEXTS[f.fortune]
    return { icon: t?.icon ?? 'star', title: t?.title ?? 'Bir olay', text: t?.text ?? '' }
  }
  const closeAllDialogs = () => {
    if (!kingdom) return
    const liveDemand = (n: (typeof dueNotices)[number]) =>
      (n.kind === 'patrol_tribute' && Number((n.payload as { expiresAt?: number }).expiresAt) > now) ||
      (n.kind === 'envoy_proposal' && online.envoys.some((e) => e.id === (n.payload as { envoy?: number }).envoy && e.status === 'pending'))
    const gone = dueNotices.filter((n) => !liveDemand(n))
    const keep = fortunes.filter((f) => fortuneDecisionOpen(f, kingdom, now))
    const titles = [...houseQueue.map(houseItem), ...gone.map(noticeItem), ...crownQueue.map(noticeItem), ...fortunes.filter((f) => !keep.includes(f)).map(fortuneItem)]
    if (gone.length > 0) {
      markSeen(gone.map((n) => n.id))
      dropNotices(gone.map((n) => n.id))
    }
    setHouseQueue([])
    setCrownQueue([])
    setFortunes(keep)
    setLineSeen(0)
    if (titles.length > 0) setClosedTitles(titles)
  }
  const noticeShown = !!notice && !!kingdom && !away && !houseQueue[0] && !decisionFirst && (introDone || kingdom.liege !== undefined || !fealtyOpen(kingdom, now))
  // The popups' shelf life (CLAUDE.md §9.8, `config/balance/dialogs.json`): news that has waited past it (the tab left
  // in the background, a long stay behind other dialogs) or that came in a flood does not pop up one by one. It is
  // marked seen (the journal has it already) and told in one summary once the line is empty. What still waits for an
  // answer (a live tribute demand, a pending proposal, an open crisis or choice) never expires, nor does a dialog the
  // player has had on screen with the tab visible; nor does news while the player is going through the line (its age
  // counts from the last step on). While the away report is to show, it tells them; nothing is folded.
  const [folded, setFolded] = useState<SummaryItem[]>([])
  const onScreen = useRef(new Set<string>())
  const awayClosedAt = useRef(0)
  const fortuneKey = (f: FortuneEvent) => `f:${f.scope ?? 'kingdom'}:${f.start}:${f.fortune}`
  const fortuneShown = (!notice || decisionFirst) && !!kingdom && !!fortunes[0] && (!away || fortuneDecisionOpen(fortunes[0], kingdom, now))
  const shownKey = !kingdom || away
    ? null
    : houseQueue[0]
      ? `h:${houseQueue[0].key}`
      : noticeShown && notice
        ? `n:${notice.id}`
        : fortuneShown
          ? fortuneKey(fortunes[0])
          : null
  useEffect(() => {
    if (!kingdom || away) return
    const S = balance.dialogs
    const answerable = (n: Notice) =>
      (n.kind === 'patrol_tribute' && Number((n.payload as { expiresAt?: number }).expiresAt) > now) ||
      (n.kind === 'envoy_proposal' && online.envoys.some((e) => e.id === (n.payload as { envoy?: number }).envoy && e.status === 'pending'))
    const items: { key: string; at: number; important: boolean; title: () => SummaryItem }[] = [
      ...dueNotices
        .filter((n) => !answerable(n))
        .map((n) => ({ key: `n:${n.id}`, at: Date.parse(n.show_at), important: noticeHurts(n, kingdom.name) || WAR_NEWS.has(n.kind), title: () => noticeItem(n) })),
      ...houseQueue.map((h) => ({ key: `h:${h.key}`, at: h.at ?? now, important: h.kind === 'death' || h.kind === 'coronation' || h.kind === 'council', title: () => houseItem(h) })),
      ...fortunes
        .filter((f) => !fortuneDecisionOpen(f, kingdom, now))
        .map((f) => ({ key: fortuneKey(f), at: f.start ?? now, important: FORTUNE_TEXTS[f.fortune]?.tone === 'bad', title: () => fortuneItem(f) })),
    ].filter((i) => !onScreen.current.has(i.key))
    const stale = new Set(items.filter((i) => now - Math.max(i.at, lastStep.current) > (i.important ? S.shelfSeconds.important : S.shelfSeconds.news) * 1000).map((i) => i.key))
    // A flood: the important ones and the newest stay, the rest are folded.
    const left = items.filter((i) => !stale.has(i.key))
    if (left.length > S.maxWaiting) {
      const keep = new Set([...left].sort((a, b) => Number(b.important) - Number(a.important) || b.at - a.at).slice(0, S.keepWhenFlooded).map((i) => i.key))
      for (const i of left) if (!keep.has(i.key)) stale.add(i.key)
    }
    if (stale.size > 0) {
      const ids = dueNotices.filter((n) => stale.has(`n:${n.id}`)).map((n) => n.id)
      if (ids.length > 0) {
        markSeen(ids)
        dropNotices(ids)
      }
      if (houseQueue.some((h) => stale.has(`h:${h.key}`))) setHouseQueue((q) => q.filter((h) => !stale.has(`h:${h.key}`)))
      if (fortunes.some((f) => stale.has(fortuneKey(f)))) setFortunes((list) => list.filter((f) => !stale.has(fortuneKey(f))))
      // What the away report just told is not told again.
      const told = items.filter((i) => stale.has(i.key) && i.at > awayClosedAt.current).map((i) => i.title())
      if (told.length > 0) setFolded((t) => [...t, ...told])
    }
    // The dialog on screen, with the tab visible, is being read: it does not expire under the reader's eyes.
    if (shownKey && !stale.has(shownKey) && !document.hidden && !playing) onScreen.current.add(shownKey)
  })
  const foldedShown = folded.length > 0 && !closedTitles && !away && waiting === 0 && !document.hidden
  const royalShown = !!view && !!kingdom && !!royalLive && !royalLive.accepted && royalSeen !== royalLive.req.n && !notice && !away && !houseQueue[0] && !fortunes[0]
  const advisorBlocked = playing || pickingGood || royalShown || resetAsk || noticeShown || foldedShown || introShown || !!away || !!houseQueue[0] || (!notice && !!fortunes[0]) || settingsOpen || !!watchedBattle || !!watchedTown || fullMap || !!preview
  // A tap on a timer: the building's menu (the camera to it), or the tab it belongs to.
  const timerGo = (go: TimerGo) => {
    if ('building' in go) {
      const b = kingdom?.buildings.find((x) => x.id === go.building)
      if (!b) return
      setPanel(null)
      setSelected(b.id)
      view?.centerOn({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
      return
    }
    if (go.part) showPart(go.part[0], go.part[1])
    if (go.focus !== undefined) setFocus(go.focus)
    setSelected(null)
    setPanel(go.tab)
  }
  const advisorAct = (a: AdvisorAction) => {
    if (a.kind === 'tab') {
      closeTab()
      if (a.part) showPart(a.part.key, a.part.part)
      setPanel(a.tab)
    } else if (a.kind === 'build') {
      closeTab()
      startPlacing(a.building)
    } else if (a.kind === 'open') {
      const b = kingdom?.buildings.find((x) => x.kind === a.building)
      if (!b) return
      closeTab()
      setSelected(b.id)
      view?.centerOn({ x: b.x, y: b.y })
    } else if (site) view?.centerOn(site)
  }
  // The tab the tutorial points at glows in the dock.
  const onAdvisorHint = useCallback((tab: string | null) => {
    if (tab) document.documentElement.dataset.hint = tab
    else delete document.documentElement.dataset.hint
  }, [])

  // What the tabs and building menus read, and the commands they give.
  const hudData: HudData | null =
    view && kingdom
      ? {
          world: view.world,
          kingdom,
          now,
          journal,
          stage,
          plots,
          muted,
          confirmReset,
          onPlace: startPlacing,
          onGood: chooseGood,
          onTradeAmount: chooseTradeAmount,
          onUpgrade: () => (play('start'), command({ type: 'upgradeTrade' }, upgradeTrade(kingdom))),
          onUpgradeBuilding: upgrade,
          onMute: () => setSettingsOpen(true),
          onExit,
          onReset: reset,
          onShow: (tile) => view.centerOn(tile),
          onImportantRead: markImportantRead,
          online,
          towns: layer.towns,
        }
      : null
  const selectedBuilding = kingdom?.buildings.find((b) => b.id === selected) ?? null
  // Every kingdom's banner on the minimap.
  const flags = useMemo(
    (): MinimapFlag[] => [
      ...rivals.map((r) => ({
        site: r.site,
        color: hexOf(r.color),
        own: false,
        rect: territoryRect(r.site, territoryStage({ buildings: r.buildings } as Kingdom, serverNow())),
      })),
      ...(kingdom ? [{ site: kingdom.site, color: hexOf(kingdom.color), own: true, rect: territoryRect(kingdom.site, stage) }] : []),
    ],
    // The player's site and colour only change at founding.
    [rivals, kingdom?.site, kingdom?.color, stage],
  )

  // The towns on the minimap and the world map, roofed in their holders' colours (CLAUDE.md §8.4).
  const townMarks = useMemo(
    (): MinimapTown[] =>
      layer.towns.map((t) => ({
        at: townCenter(t),
        color: t.owner === null ? null : t.owner === mine.id ? hexOf(kingdom?.color) : hexOf(rivals.find((r) => r.id === t.owner)?.color),
      })),
    [layer.towns, mine.id, kingdom?.color, rivals],
  )
  // Where the crowns' patrols are now, for the minimap and the world map, moved on every couple of seconds.
  const [patrolDots, setPatrolDots] = useState<MinimapPatrol[]>([])
  useEffect(() => {
    // The crowns' patrols. Bandits and pirates are not on the minimap or the world map (only on the map itself).
    const place = () => {
      const t = serverNow()
      setPatrolDots([
        ...patrols.map((p) => ({ at: pointOnPath(p.path, p.departAt, p.arriveAt, t), color: hexOf(p.color) })),
      ])
    }
    place()
    if (patrols.length === 0) return
    // Not while the tab is hidden: nobody sees the minimap then.
    const id = window.setInterval(() => !document.hidden && place(), 2000)
    return () => clearInterval(id)
  }, [patrols])

  return (
    <>
      <div ref={host} className="world-host" style={{ width: '100%', height: '100%' }} />
      <div className="top">
        {kingdom && (
          <TopBar
            kingdom={kingdom}
            now={now}
            seasonStart={seasonStart}
            history={journal.history}
            onOpen={setPanel}
            market={online.market}
            menu={
              <>
                {/* On phones the settings and the way back to the main menu fold into one menu, the store bar's last chip. */}
                <div className="map-menu" ref={mapMenu}>
                  <button className="res menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Menü">
                    <Icon name={menuOpen ? 'close' : 'menu'} size={16} />
                  </button>
                  {menuOpen && (
                    <div className="map-menu-list frame" role="menu">
                      <button
                        className="btn small"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false)
                          setSettingsOpen(true)
                        }}
                      >
                        <Icon name="gear" size={16} /> Ayarlar
                      </button>
                      <button className="btn small" role="menuitem" onClick={onExit}>
                        <Icon name="home" size={16} /> Ana menü
                      </button>
                    </div>
                  )}
                </div>
              </>
            }
          />
        )}
      </div>
      <div className="corner-menu" ref={cornerMenu}>
        <button className="btn icon-only menu-chip frame" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} title="Menü" aria-label="Menü">
          <Icon name={menuOpen ? 'close' : 'menu'} size={16} />
        </button>
        {menuOpen && (
          <div className="corner-menu-list frame" role="menu">
            <button
              className="btn small"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                setSettingsOpen(true)
              }}
            >
              <Icon name="gear" size={16} /> Ayarlar
            </button>
            <button className="btn small" role="menuitem" onClick={onExit}>
              <Icon name="home" size={16} /> Ana menü
            </button>
          </div>
        )}
      </div>
      {resetAsk && (
        <div className="modal" role="dialog" aria-labelledby="reset-title">
          <section className="dialog frame fortune-dialog envoy-dialog bad">
            <header className="fortune-banner">
              <span className="envoy-face">
                <EnvoyPortrait size={44} talking />
              </span>
              <div>
                <small>Elçinin sözü</small>
                <h2 id="reset-title">Emin misiniz, lordum?</h2>
              </div>
            </header>
            <div className="fortune-body">
              <p>
                Lordum, bir söyleyin de içim rahat etsin: sarayı, ambarları, hazineyi, ordunuzu, hanedanınızı... hepsini rüzgâra mı savuruyoruz? Bir
                kez "evet" derseniz geri dönüşü yok; ben de yeni sarayda yine kuzey kulesini isterim.
              </p>
              <div className="row spread">
                <button className="btn small" onClick={() => setResetAsk(false)}>
                  Vazgeçtim
                </button>
                <button className="btn small danger" onClick={resetNow}>
                  Evet, her şeyi sıfırla
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="modal" role="dialog" aria-labelledby="settings-title" onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <section className="dialog frame settings-dialog">
            <header className="sheet-head">
              <Icon name="gear" size={32} />
              <div>
                <h2 id="settings-title">Ayarlar</h2>
                <small>Ses, müzik ve görüntü</small>
              </div>
              <button className="btn icon-only" onClick={() => setSettingsOpen(false)} aria-label="Kapat">
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className="form">
              <SoundSettings settings={settings} onChange={onSettings} />
              <DetailSettings settings={settings} onChange={onSettings} />
              {kingdom && <AdvisorSettings storeKey={`advisor:${lobby.id}:${mine.id}`} />}
            </div>
          </section>
        </div>
      )}
      <div className="tile-tag" aria-hidden>
        {hover ? (
          <>
            <b>{FEATURE_NAMES[hover.feature] ?? TERRAIN_NAMES[hover.terrain]}</b> {hover.tile.x}, {hover.tile.y} · {RULE_NAMES[hover.rule]}
          </>
        ) : (
          <>
            {lobby.name} · {rivals.length + (kingdom ? 1 : 0)}/{lobby.max_players} lord
          </>
        )}
      </div>
      {view && !kingdom && (
        <SitePicker
          surveys={surveys}
          access={access}
          selected={selectedSite}
          onSelect={setSelectedSite}
          colors={lobbyColors(lobby.max_players)}
          taken={new Set(rivals.map((r) => r.color))}
          names={rivals.map((r) => r.name)}
          onFound={found}
        />
      )}
      {view && kingdom && !holding && <Dock open={panel} unread={journal.unread} onToggle={toggleTab} />}
      {view && kingdom && (
        <div className="side-stack">
          {!needsPalace && <QuestTracker world={view.world} kingdom={kingdom} online={online} now={now} />}
          {!holding && !panel && !selectedBuilding && innOpen === null && cityOpen === null && <Timers kingdom={kingdom} online={online} now={now} onGo={timerGo} />}
        </div>
      )}
      {view && kingdom && !holding && hover?.building && hover.building.owner === undefined && hover.building.id !== selected && (
        <MapTip building={kingdom.buildings.find((b) => b.id === hover.building!.id)} at={hover.building.screen} now={now} />
      )}
      {view && kingdom && !holding && hover?.inn && hover.inn.index !== innOpen && (
        <InnTip world={view.world} index={hover.inn.index} at={hover.inn.screen} />
      )}
      {view && kingdom && !holding && hover?.city && hover.city.index !== cityOpen && (
        <CityTip world={view.world} index={hover.city.index} at={hover.city.screen} />
      )}
      {view && kingdom && !holding && cityOpen !== null && !panel && !selectedBuilding && (
        <CitySheet
          world={view.world}
          index={cityOpen}
          kingdom={kingdom}
          online={online}
          market={online.market}
          now={now}
          onCity={(city) => online.act({ type: 'tradeCity', city })}
          onSwear={(city) => online.act({ type: 'swear', city })}
          onShow={(tile) => view.centerOn(tile)}
          onClose={closeTab}
        />
      )}
      {view && kingdom && mine && !holding && townOpen !== null && !panel && !selectedBuilding && (() => {
        const town = layer.towns.find((t) => t.id === townOpen)
        return (
          town && (
            <TownSheet
              world={view.world}
              town={town}
              walled={townWalled(view.world.seed, town.idx)}
              kingdom={kingdom}
              me={mine.id}
              names={new Map(rivals.map((r) => [r.id, r.name ?? '?']))}
              armies={layer.armies}
              pacts={layer.pacts}
              now={now}
              market={layer.market}
              relation={town.owner === null || town.owner === mine.id ? null : relationBetween(layer.relations, mine.id, town.owner, now, relationTermsIn(online, mine.id, town.owner))}
              onSend={(army, tile) => sendArmy(army, tile, true)}
              onMove={(army, tile) => sendArmy(army, tile)}
              onBuy={(army, units) => online.act({ type: 'townBuy', town: town.id, army, units }).then((r) => {
                const got = r as { cost?: number } | undefined
                if (got?.cost !== undefined) setToast(`Mallar orduya yüklendi: ${units} birim, ${got.cost} altın`)
              })}
              onWatchBattle={(battle) => online.watch(battle)}
              onShow={(tile) => view.centerOn(tile)}
              onWatch={() => setWatchingTown(town.id)}
              onUpkeep={(level) => online?.act({ type: 'townUpkeep', town: town.id, level })}
              onRelease={() => online?.act({ type: 'releaseTown', town: town.id }).then(closeTab)}
              onClose={closeTab}
            />
          )
        )
      })()}
      {view && kingdom && !holding && fleetSheet !== null && !panel && !selectedBuilding && (() => {
        const owner = rivals.find((r) => r.id === fleetSheet.lord)
        const list = owner?.navy?.fleets ?? []
        const index = list.findIndex((f) => f.id === fleetSheet.fleet)
        if (!owner || index < 0) return null
        const fleet = list[index]
        // Where it is: along its way over the water, or off its dock.
        const where = () => {
          const t = serverNow()
          if (fleet.sail) {
            const total = pathLength(fleet.sail.path)
            const span = fleet.sail.arriveAt - fleet.sail.departAt
            return alongPath(fleet.sail.path, span > 0 ? Math.min(1, Math.max(0, (t - fleet.sail.departAt) / span)) * total : total).at
          }
          const dock = owner.buildings.find((b) => b.kind === 'dock')
          return dock ? dockWater(view.world, { x: dock.x, y: dock.y, size: dock.size }) : null
        }
        return (
          <RivalFleetSheet
            lord={owner.name}
            color={hexOf(owner.color)}
            index={index + 1}
            fleet={fleet}
            intel={online?.intel[owner.id]}
            now={now}
            onSpy={() => online?.loadIntel(owner.id)}
            onLord={() => {
              setFleetSheet(null)
              setFocus(owner.id)
              setPanel('diplomacy')
            }}
            onShow={() => {
              const at = where()
              if (at) view.centerOn({ x: Math.floor(at.x), y: Math.floor(at.y) })
            }}
            onClose={closeTab}
          />
        )
      })()}
      {view && kingdom && !holding && columnOpen !== null && !panel && !selectedBuilding && (
        <CrownColumnSheet
          world={view.world}
          kingdom={kingdom}
          column={columnOpen}
          online={online}
          now={now}
          onCrown={(crown) => {
            setColumnOpen(null)
            setCityOpen(crown)
            view.centerOn(cityCenter(view.world.cities[crown]))
          }}
          onClose={() => setColumnOpen(null)}
        />
      )}
      {view && kingdom && !holding && outlawOpen !== null && !panel && !selectedBuilding && (
        <OutlawSheet world={view.world} pick={outlawOpen} online={online} kingdom={kingdom} now={now} onShow={(at) => view.centerOn({ x: Math.floor(at.x), y: Math.floor(at.y) })} onClose={closeTab} />
      )}
      {view && kingdom && !holding && innOpen !== null && !panel && !selectedBuilding && (
        <InnSheet world={view.world} index={innOpen} online={online} now={now} home={kingdom.site} onShow={(tile) => view.centerOn(tile)} onClose={closeTab} />
      )}
      {view && kingdom && !holding && hover?.building?.owner !== undefined && (() => {
        const owner = rivals.find((r) => r.id === hover.building!.owner)
        return (
          owner && (
            <MapTip
              building={owner.buildings.find((b) => b.id === hover.building!.id)}
              owner={{ name: owner.name, color: hexOf(owner.color) }}
              at={hover.building.screen}
              now={now}
            />
          )
        )
      })()}
      {view && kingdom && !holding && hudData && selectedBuilding && (
        <BuildingSheet
          building={selectedBuilding}
          data={hudData}
          commands={{
            onUpgrade: upgrade,
            onWorkers: commandWorkers,
            onProduct: (id, product) => command({ type: 'product', id, product }, setProduct(kingdom, id, product, now)),
            onDemolish: (id) => {
              planDemolish(id)
              startTool('demolish')
            },
            onMove: startMoving,
            onClose: closeTab,
          }}
        />
      )}
      {view && kingdom && !holding && panel && hudData && <Sheet tab={panel} onClose={closeTab} data={hudData} />}
      {placingKind && (
        <div className="placing frame" role="status">
          <Icon name="build" size={24} />
          <span>
            <b>{needsPalace ? 'Sarayını yerleştir' : BUILDING_NAMES[placingKind]}</b> ·{' '}
            {stroking
              ? 'Basılı tutup sürükleyerek sıra hâlinde yerleştir'
              : placingKind === 'gate'
                ? 'Kapı iki kulesiyle 3 karo kaplar; surun üstüne de kurulur.'
              : touchOnly
                ? 'Hudut içinde bir yere dokun'
                : 'Hudut içinde yeşil bir yere tıkla'}
          </span>
          {placingKind === 'gate' && (
            <button className="btn small" onClick={turnGate} title="Kapıyı döndür (R)">
              <kbd>R</kbd> Döndür
            </button>
          )}
          {!needsPalace && (
            <button className="btn small" onClick={cancelPlacing}>
              İptal
            </button>
          )}
        </div>
      )}
      {placingKind && preview && kingdom && (
        <ConfirmBuild kind={placingKind} kingdom={kingdom} onConfirm={confirmBuild} onCancel={() => setPreview(null)} />
      )}
      {tool && !placingKind && (
        <div className="placing frame" role="status">
          <Icon name={tool === 'demolish' ? 'warn' : 'build'} size={24} />
          <span>
            {tool === 'demolish' ? (
              <>
                <b>Yıkım</b> · Yıkılacak binalara tıkla
              </>
            ) : movingBuilding ? (
              <>
                <b>{BUILDING_NAMES[movingBuilding.kind]} taşınıyor</b> · Yeni yerine tıkla ya da başka bir bina seç
              </>
            ) : (
              <>
                <b>Taşıma</b> · Taşınacak binaya tıkla
              </>
            )}
          </span>
          <button className="btn small" onClick={cancelPlacing}>
            Bitti
          </button>
        </div>
      )}
      {kingdom && planned && plan.length > 0 && (
        <PlanBar
          steps={plan}
          kingdom={kingdom}
          planned={planned.kingdom}
          skipped={planned.skipped}
          onUndo={() => setPlan((steps) => steps.slice(0, -1))}
          onClear={() => setPlan([])}
          onConfirm={confirmPlan}
        />
      )}
      {kingdom && pickingGood && <GoodPicker kingdom={kingdom} onGood={chooseGood} market={layer.market} now={now} />}
      {toast && (
        <div className="toast frame" role="alert">
          <Icon name="warn" size={16} /> {toast}
        </div>
      )}
      {!ready && (
        <div className="loading-screen" role="status" aria-label="Harita yükleniyor">
          <PixelSpinner big />
          <p>Diyar yükleniyor…</p>
        </div>
      )}
      {ready && view && loading && <PixelSpinner />}
      {kingdom && !needsPalace && (
        <MapAlerts
          kingdom={kingdom}
          now={now}
          war={warNotes(online, now)}
          onQueen={() => online.act({ type: 'queen' })}
          onTown={(id) => {
            const town = layer.towns.find((t) => t.id === id)
            closeTab()
            setTownOpen(id)
            if (town && view) view.centerOn(townCenter(town))
          }}
          onOpen={(tab) => {
            setSelected(null)
            setPanel(tab)
          }}
        />
      )}
      {view && (
        <div className="zoom">
          <button className="btn icon-only" onClick={() => site && view.centerOn(site)} aria-label="Üsse dön" title="Üsse dön">
            <Icon name="pin" size={16} />
          </button>
          <button className="btn icon-only" onClick={() => view.zoomBy(1)} aria-label="Yakınlaştır" title="Yakınlaştır">
            <Icon name="plus" size={16} />
          </button>
          <button className="btn icon-only" onClick={() => view.zoomBy(-1)} aria-label="Uzaklaştır" title="Uzaklaştır">
            <Icon name="minus" size={16} />
          </button>
        </div>
      )}
      {view && <Minimap world={view.world} center={cameraCenter} corners={cameraCorners} flags={flags} towns={townMarks} patrols={patrolDots} onJump={(tile) => (touchOnly ? setFullMap(true) : view.centerOn(tile))} />}
      {view && (
        <MinimapCorners
          view={view}
          center={cameraCenter}
          me={mine.id}
          kingdom={kingdom}
          rect={kingdom && site ? territoryRect(site, stage) : null}
          armies={layer.armies}
          battles={layer.battles}
          towns={layer.towns}
          pacts={layer.pacts}
          patrols={patrols}
          outlaws={outlawSpots}
          nameOf={(id) => kingdoms.find((k) => k.id === id)?.name ?? 'Bir lord'}
          seasonStart={seasonStart}
          onWorldMap={() => setFullMap((open) => !open)}
          onArmy={(id) => {
            setFleetFocus(null)
            setArmyFocus(id)
          }}
          onFleet={(id) => setFleetFocus({ lord: mine.id, fleet: id })}
        />
      )}
      {view && fullMap && (
        <WorldMap
          world={view.world}
          kingdoms={[
            ...(kingdom && site
              ? [{ name: kingdom.name ?? 'Lordluğun', color: hexOf(kingdom.color), rect: territoryRect(site, stage), mine: true }]
              : []),
            ...rivals.map((r) => ({
              name: r.name,
              color: hexOf(r.color),
              rect: territoryRect(r.site, territoryStage({ buildings: r.buildings } as Kingdom, serverNow())),
            })),
          ]}
          center={cameraCenter}
          corners={cameraCorners}
          towns={townMarks}
          patrols={patrolDots}
          onClose={() => setFullMap(false)}
        />
      )}
      {view && !holding && aiming === null && (
        <Chat
          storeKey={`chat-seen:${lobby.id}`}
          lobby={lobby.id}
          username={username}
          messages={chat}
          mine={kingdom ? mine.id : null}
          canPost={kingdom !== null}
          onSend={sendChat}
          kingdoms={kingdoms}
          banner={(id) => view && <CrownBanner world={view.world} liege={kingdoms.find((k) => k.id === id)?.liege} />}
          onLocate={(site) => view?.centerOn(site)}
          aside={
            kingdom && (
              <button className="btn advisor-toggle" onClick={() => setAdvisorCall((n) => n + 1)} aria-label="Elçiyi çağır" title="Elçiyi çağır: öğüt, öğretici, oyunun anlatımı">
                <EnvoyPortrait size={26} still /> Elçi
              </button>
            )
          }
          onKingdom={(id) => {
            if (id === mine.id) return
            setFocus(id)
            setSelected(null)
            setPanel('diplomacy')
          }}
        />
      )}
      {following !== null && aiming === null && !holding && (
        <div className="placing frame" role="status">
          <Icon name="eye" size={24} />
          <span>
            <b>Ordu takip ediliyor</b> · haritayı sürüklersen takip biter
          </span>
          <button className="btn small" onClick={() => setFollowing(null)}>
            Bırak
          </button>
        </div>
      )}
      {sailing !== null && (
        <div className="placing frame" role="status">
          <Icon name="ship" size={24} />
          <span>
            <b>Filonun gideceği yer</b> · {touchOnly ? 'Bir nehre ya da göle dokun' : 'Bir nehre ya da göle tıkla'} (gemiler karaya çıkamaz)
          </span>
          <button className="btn small" onClick={() => setSailing(null)}>
            İptal
          </button>
        </div>
      )}
      {aiming !== null && (
        <div className="placing frame" role="status">
          <Icon name="swords" size={24} />
          <span>
            <b>Ordunun hedefi</b> · {touchOnly ? 'Haritada bir yere dokun' : 'Haritada bir yere tıkla'} (savaştığın bir lordun hududu kuşatma demektir)
          </span>
          <button className="btn small" onClick={() => setAiming(null)}>
            İptal
          </button>
        </div>
      )}
      {aiming !== null && (
        <WarTargets
          online={online}
          rivals={rivals}
          now={now}
          from={(() => {
            const army = layer.armies.find((a) => a.id === aiming)
            return army ? armyAt(army, now) : null
          })()}
          onSend={(tile) => sendArmy(aiming, tile)}
          onHome={() => {
            act({ type: 'army', army: aiming, order: { kind: 'home' } })
            setAiming(null)
          }}
          onShow={(tile) => view?.centerOn(tile)}
        />
      )}
      {away && kingdom && (
        <AwayReport
          lobby={lobby.id}
          me={mine.id}
          since={away.since}
          before={away.before}
          kingdom={kingdom}
          online={online}
          now={now}
          onClose={(ids) => {
            setAway(null)
            awayClosedAt.current = serverNow()
            // The parties back while away were told in the report.
            markExpeditionSeen(Math.max(0, ...(kingdom.expeditions ?? []).filter((e) => e.result).map((e) => e.id)))
            if (ids.length > 0) {
              markSeen(ids)
              dropNotices(ids)
            }
          }}
        />
      )}
      {/* While a mini game is being played, the popups below wait (they would take its keys and taps). */}
      {!playing && (
        <QueueContext.Provider value={{ pos: lineSeen + 1, total: lineSeen + waiting, closeAll: closeAllDialogs }}>
      {closedTitles && <ClosedSummary items={closedTitles} onClose={() => setClosedTitles(null)} />}
      {foldedShown && (
        <ClosedSummary
          folded
          items={folded}
          onClose={() => setFolded([])}
          onJournal={() => {
            setFolded([])
            setPanel('journal')
          }}
        />
      )}
      {view && kingdom && !away && !introDone && kingdom.liege === undefined && view.world.cities.length > 1 && fealtyOpen(kingdom, now) && (
        <CrownIntro world={view.world} kingdom={kingdom} online={online} lobby={lobby.id} onSwear={(city) => online.act({ type: 'swear', city })} onClose={() => setIntroDone(true)} />
      )}
      {kingdom && !away && houseQueue[0] && (
        <HouseDialog key={houseQueue[0].key} news={houseQueue[0]} kingdom={kingdom} now={now} online={online} onClose={() => (setHouseQueue((q) => q.slice(1)), stepLine())} />
      )}
      {notice && kingdom && !away && !houseQueue[0] && !decisionFirst && (introDone || kingdom.liege !== undefined || !fealtyOpen(kingdom, now)) && <EnvoyDialog notice={notice} online={online} onClose={closeNotice} />}
      {!notice && !away && kingdom && !houseQueue[0] && !decisionFirst && crownQueue[0] && (
        <EnvoyDialog key={crownQueue[0].id} notice={crownQueue[0]} online={online} onClose={() => (setCrownQueue((q) => q.slice(1)), stepLine())} />
      )}
      {!notice && !away && view && kingdom && !houseQueue[0] && !decisionFirst && !crownQueue[0] && betrayal && betrayalLater !== betrayal.at && (
        <BetrayalDialog world={view.world} kingdom={kingdom} online={online} now={now} onLater={() => setBetrayalLater(betrayal.at)} />
      )}
      {!notice && !away && kingdom && !fortunes[0] && returned && <ExpeditionReport expedition={returned} kingdom={kingdom} online={online} onClose={() => markExpeditionSeen(returned.id)} />}
      {/* A plain news of the day waits behind the away report (it is told there too); a crisis or a choice, timed, does not. */}
      {(!notice || decisionFirst) && kingdom && fortunes[0] && (!away || fortuneDecisionOpen(fortunes[0], kingdom, now)) && (
        <FortuneDialog
          event={fortunes[0]}
          now={now}
          kingdom={kingdom}
          onAnswer={(choice) => online.act({ type: 'crisis', key: crisisKey({ scope: fortunes[0].scope ?? 'kingdom', start: fortunes[0].start }), choice })}
          onChoose={(choice) => online.act({ type: 'choose', key: crisisKey({ scope: fortunes[0].scope ?? 'kingdom', start: fortunes[0].start }), choice })}
          onClose={() => (setFortunes((list) => list.slice(1)), stepLine())}
        />
      )}
      {view && kingdom && royalLive && royalShown && (
        <RoyalDialog world={view.world} kingdom={kingdom} req={royalLive.req} online={online} onClose={() => seeRoyal(royalLive.req.n)} />
      )}
        </QueueContext.Provider>
      )}
      {view && kingdom && <EnvoyNote quiet={advisorBlocked} />}
      {view && kingdom && (
        <Advisor
          storeKey={`advisor:${lobby.id}:${mine.id}`}
          ctx={{ kingdom, now, online, crowns: view.world.cities.length }}
          blocked={advisorBlocked}
          aside={holding && !needsPalace}
          busy={(holding && !needsPalace) || aiming !== null || sailing !== null || selected !== null || panel !== null || plan.length > 0}
          summon={advisorCall}
          onAct={advisorAct}
          onHint={onAdvisorHint}
        />
      )}
      {watchedBattle && <BattleView battle={watchedBattle} online={online} now={now} onClose={() => setWatching(null)} />}
      {watchedTown && view && (
        <TownSiegeView
          town={watchedTown}
          army={layer.armies.find((a) => a.id === watchedTown.siege?.army) ?? null}
          walled={townWalled(view.world.seed, watchedTown.idx)}
          online={online}
          now={now}
          onClose={() => setWatchingTown(null)}
        />
      )}
    </>
  )
}

// Eight square pixels in a ring, lit one after another.
function PixelSpinner({ big = false }: { big?: boolean }) {
  return (
    <div className={big ? 'spinner big' : 'spinner'} role="status" aria-label="Yükleniyor">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ '--i': i } as React.CSSProperties} />
      ))}
    </div>
  )
}

export default App
