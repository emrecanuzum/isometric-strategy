import {
  BUILDINGS,
  Feature,
  Terrain,
  TileRule,
  advance,
  balance,
  townCenter,
  inTown,
  patrolTimes,
  patrolSlotAt,
  patrolSlotMs,
  patrolTarget,
  visitKind,
  capitalGate,
  findRoute,
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
} from '@game/shared'
import type { Along, Lord, BuildError, EconomyEvent, BuildingKind, Good, Kingdom, PlanStep, Point, World } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { WorldMap } from './game/WorldMap'
import { ConfirmBuild } from './ui/hud/ConfirmBuild'
import { PlanBar } from './ui/hud/PlanBar'
import { cityInfo } from './game/cities'
import { townStructures, townTrails } from './game/towns'
import { Minimap } from './game/Minimap'
import type { MinimapFlag } from './game/Minimap'
import type { Structure } from './game/chunkPainter'
import type { StructureLook } from './game/buildingSprites'
import { createWorld, footprintOrigin } from './game/createWorld'
import type { MapTool } from './game/createWorld'
import type { Hover, RivalTerritory, WorldView } from './game/createWorld'
import { KINGDOM_COLORS } from './game/buildingSprites'
import type { KingdomColor } from './game/buildingSprites'
import { serverNow } from './net/clock'
import { CHAT_KEEP, CommandError, loadChat, loadMine, loadRivals, markSeen, postChat, send, sendFor, subscribe } from './net/online'
import type { ChatMessage, Command, IntelReport, Lobby, Mine, Notice, Rival } from './net/online'
import { useLayer } from './net/layer'
import type { MapArmy } from './game/armies'
import { play } from './audio/sfx'
import type { Cue } from './audio/sfx'
import { DetailSettings, SoundSettings } from './ui/home/SettingsPanel'
import { WarTargets } from './ui/hud/WarTargets'
import { EnvoyDialog, describe as describeNotice } from './ui/Envoy'
import type { KingdomInfo, Online } from './ui/hud/online'
import { BattleView } from './ui/hud/war'
import type { Settings } from './net/settings'
import { Chat } from './ui/Chat'
import { findPath, tilesAlong } from './game/town'
import type { Path } from './game/town'
import type { Errand, MerchantTrip } from './game/town'
import { Icon } from './ui/icons'
import { BUILDING_NAMES, FORTUNE_TEXTS, RESOURCE_NAMES, SCOPE_NAMES } from './ui/names'
import { Dock, Sheet, TopBar, useTabKeys } from './ui/hud/Hud'
import type { TabId } from './ui/hud/Hud'
import { useJournal } from './ui/hud/journal'
import { BuildingSheet } from './ui/hud/BuildingSheet'
import { MapAlerts } from './ui/hud/MapAlerts'
import { InnTip, MapTip } from './ui/hud/MapTip'
import { InnSheet } from './ui/hud/inns'
import { CitySheet, CityTip, CrownBanner } from './ui/hud/cities'
import { TownSheet } from './ui/hud/towns'
import type { HudData } from './ui/hud/tabs'
import { GoodPicker, SitePicker, missingText } from './ui/panels'
import { Timers } from './ui/hud/Timers'

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
  [Feature.City]: 'Serbest şehir',
}

const RULE_NAMES: Record<number, string> = {
  [TileRule.Free]: 'inşa edilebilir',
  [TileRule.Blocked]: 'inşa edilemez',
  [TileRule.DockOnly]: 'yalnızca iskele',
  [TileRule.TunnelOnly]: 'yalnızca tünel',
  [TileRule.TradePostOnly]: 'yalnızca ticaret noktası',
}

// What the server answers when it refuses a command (see supabase/functions/command).
const REFUSALS: Record<string, string> = {
  step: 'Bu miktar seçilemez',
  tradeWait: 'Satış miktarı az önce değişti; biraz bekle',
  full: 'Lobide yer kalmadı',
  taken: 'Bu yer artık başka bir krallığa yakın; yeni yer keşfet',
  color: 'Bu renk başka bir krallığın; başka bir renk seç',
  conflict: 'Krallık başka yerden değişti, yeniden dene',
  server: 'Sunucuya ulaşılamadı',
  relation: 'İlişkiniz bunun için uygun değil',
  already: 'Bu zaten var ya da yolda',
  war: 'Savaştayken olmaz',
  cooldown: 'Biraz bekle, elçin yeni döndü',
  spies: 'Evde casusun yok',
  soldiers: 'Yeterli asker yok',
  armies: 'Sahada en fazla 2 ordun olabilir',
  battle: 'Ordu savaşta; emir alamaz',
  route: 'Oraya yol yok',
  far: 'Ordular birleşmek için çok uzak',
  people: 'Yeterli gönüllü ya da nüfus yok',
  building: 'Bunun için gereken bina yok',
  have: 'Zaten var',
  none: 'Yapılacak bir şey yok',
  target: 'Krallık bulunamadı',
  founded: 'Önce krallığını kur',
  prison: 'Kraliçe kaçırmak için önce hapishane kur (2. seviye saray)',
  sworn: 'Zaten bir taç krallığına biat ettin; sezon boyunca değişmez',
}
const refusal = (e: unknown) => {
  const code = e instanceof CommandError ? e.message : 'server'
  return REFUSALS[code] ?? BUILD_ERRORS[code as BuildError] ?? 'Komut reddedildi'
}

type FortuneEvent = Extract<EconomyEvent, { kind: 'fortune' }>

// A random event as it begins: a window of its own, green-edged for good fortune and red for bad.
function FortuneDialog({ event, now, onClose }: { event: FortuneEvent; now: number; onClose: () => void }) {
  const f = FORTUNE_TEXTS[event.fortune]
  const tone = f?.tone ?? 'good'
  const extra = [
    ...Object.entries(event.lost ?? {})
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([g, v]) => `${Math.round(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} kayboldu`),
    ...(event.gold ? [`+${event.gold} altın`] : []),
  ]
  return (
    <div className="modal" role="dialog" aria-labelledby="fortune-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`dialog frame fortune-dialog ${tone}`}>
        <header className="sheet-head">
          <Icon name={f?.icon ?? 'star'} size={32} />
          <div>
            <small>
              {tone === 'good' ? 'Hayırlı bir haber' : 'Kötü bir haber'} · {SCOPE_NAMES[event.scope ?? 'kingdom']}
            </small>
            <h2 id="fortune-title">{f?.title ?? 'Beklenmedik bir olay'}</h2>
          </div>
        </header>
        <p>{f?.text}</p>
        <p className="hint">{event.scope === 'lobby' ? 'Bu olay lobideki bütün krallıkları etkiliyor.' : 'Bu olay yalnızca senin krallığını etkiliyor.'}</p>
        {extra.length > 0 && <p className={tone === 'good' ? 'up' : 'down'}>{extra.join(' · ')}</p>}
        <p className="hint">Yaklaşık {Math.max(1, Math.round((event.until - now) / 60_000))} dakika sürecek.</p>
        <div className="row spread">
          <span />
          <button className="btn small" onClick={onClose}>
            Tamam
          </button>
        </div>
      </section>
    </div>
  )
}

// The sound each kind of news comes with (the envoy's fanfare otherwise).
const NOTICE_CUES: Record<string, Cue> = {
  battle_start: 'battle',
  battle_end: 'battle',
  war_declared: 'war',
  tower_losses: 'bad',
  operation_struck: 'bad',
  spy_caught: 'bad',
  spy_lost: 'bad',
  alliance_broken: 'bad',
  order_failed: 'bad',
  peace_enforced: 'war',
  envoy_courtesy: 'good',
  queen_released: 'good',
  ransom_paid: 'coin',
  envoy_insult: 'war',
  army_threat: 'war',
  trade_raided: 'battle',
  raid_repelled: 'good',
  town_siege: 'war',
  town_taken: 'coin',
  town_held: 'bad',
  patrol_tribute: 'war',
  patrol_tip: 'coin',
  patrol_ignored: 'bad',
}

// News that goes against the player: kept under the journal's "Önemli" tab.
const HURTFUL = new Set(['patrol_tribute', 'patrol_ignored', 'army_threat', 'war_declared', 'trade_raided', 'raid_repelled', 'operation_struck', 'spy_caught', 'spy_lost', 'tower_losses', 'alliance_broken', 'envoy_insult', 'peace_enforced', 'order_failed'])
function noticeHurts(n: Notice, me: string | undefined) {
  if (HURTFUL.has(n.kind)) return true
  const p = n.payload as { kind?: string; accepted?: boolean; report?: { losses?: Record<string, number> } }
  // A battle that cost the player soldiers; a proposal of theirs turned down.
  if (n.kind === 'battle_end') return !!me && (p.report?.losses?.[me] ?? 0) > 0
  if (n.kind === 'envoy_answer') return p.accepted === false
  if (n.kind === 'envoy_proposal') return p.kind === 'tribute'
  // A town of the player's besieged or taken by someone else, or a siege of theirs beaten off.
  const by = (n.payload as { by?: string }).by
  if (n.kind === 'town_siege' || n.kind === 'town_taken') return by !== me
  if (n.kind === 'town_held') return true
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
  liege: 'Sarayı yükseltmek için önce bir taç krallığına biat et (Krallık sekmesi → Bağlılık)',
}

// Walkers keep to dry land below the mountains.
const walkable = (world: World, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const t = world.terrain[y * world.size + x]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
}

// Footpaths are worn only between buildings closer than this to the palace.
const TRAIL_MAX_TILES = 40

// What the town's walkers need to know of a building (rivals' buildings carry no more).
type TownBuilding = Rival['buildings'][number]

// Villagers walk from their homes to the fields and workshops; the merchant tends the trade post.
function townErrands(buildings: TownBuilding[], time: number): Errand[] {
  const done = buildings.filter((b) => b.doneAt <= time)
  const palace = done.find((b) => b.kind === 'palace')
  const work = done.filter((b) => BUILDINGS[b.kind].workers && b.kind !== 'tradePost')
  const errands: Errand[] = []
  done
    .filter((b) => b.kind === 'house' || b.kind === 'palace')
    .forEach((home, i) => {
      for (let n = 0; n < 2; n++) {
        const place = work[(i * 2 + n) % Math.max(1, work.length)] ?? (home === palace ? undefined : palace)
        if (place) errands.push({ from: doorstep(home), to: place.kind === 'farm' ? center(place) : doorstep(place) })
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
  for (const b of buildings) {
    // Fields and gates are walked over; everything else is walked around.
    if (b.kind === 'farm' || b.kind === 'gate') continue
    for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) solid.add(y * world.size + x)
  }
  const visited = buildings.filter((b) => b !== palace && b.doneAt <= time && b.kind !== 'wall' && b.kind !== 'gate')
  const gate = palace && doorstep(palace)
  const far = (p: Point) => (gate ? Math.hypot(p.x - gate.x, p.y - gate.y) : 0)
  const routes = [
    ...(gate ? visited.map((b) => ({ from: doorstep(b), to: gate })).sort((a, b) => far(a.from) - far(b.from)) : []),
    ...townErrands(buildings, time),
  ]
  // Tiles a footpath already wears, with a tile of margin either side: a later walk there keeps to that path and is
  // not drawn again beside it (two lines a tile apart read as a braid).
  const worn = new Set<number>()
  // A trade route (and a tile beside it) is worn ground already: walks keep to it, and no footpath is drawn on it or
  // running alongside it; a path that reaches it simply ends there.
  const nearRoad = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= world.size || ny >= world.size) continue
        const f = world.feature[ny * world.size + nx]
        if (f === Feature.Road || f === Feature.Bridge) return true
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
  const [loading, setLoading] = useState(true)
  // The first view is held back until the ground around the kingdom (or the sites to choose from) is painted: the
  // camera has moved there and no chunk on screen is missing for a moment.
  const [ready, setReady] = useState(false)
  const tapRef = useRef<(tile: Point, building?: number, army?: number, inn?: number, city?: number) => void>(() => {})
  const strokeRef = useRef<(spots: Point[]) => void>(() => {})

  useEffect(() => {
    let cancelled = false
    let created: WorldView | undefined
    createWorld(
      host.current!,
      seed,
      {
        onHover: setHover,
        onCamera: setCameraCenter,
        onLoading: setLoading,
        onTap: (tile, building, army, inn, city) => tapRef.current(tile, building, army, inn, city),
        onStroke: (spots) => strokeRef.current(spots),
      },
      serverNow,
      lobby.world_rev ?? 1,
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
  // Detail animations follow the setting.
  useEffect(() => view?.setDetail(settings.detail), [view, settings.detail])
  // The sound settings, opened from the corner button or the kingdom tab.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The phone menu (settings, main menu); a tap anywhere else closes it.
  const [menuOpen, setMenuOpen] = useState(false)
  const mapMenu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: PointerEvent) => {
      if (!mapMenu.current?.contains(e.target as Node)) setMenuOpen(false)
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
  const [following, setFollowing] = useState<number | null>(null)
  const [watching, setWatching] = useState<number | null>(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        : events.some((e) => e.kind === 'researched' || e.kind === 'trained')
          ? 'good'
          : events.some((e) => e.kind === 'built')
            ? 'build'
            : null
      if (cue) play(cue)
      const begun = events.filter((e): e is FortuneEvent => e.kind === 'fortune' && e.until > time)
      if (begun.length > 0) setFortunes((list) => [...list, ...begun])
      const palace = next.buildings.find((b) => b.kind === 'palace')
      for (const event of events) {
        if (event.kind === 'trade' && palace) {
          view.float(
            center(palace),
            event.sold > 0 ? `+${event.gold} altın` : event.walledIn ? 'Tüccar surdan çıkamıyor: kapı yap' : `Satacak ${RESOURCE_NAMES[event.good].toLowerCase()} yok`,
            event.sold > 0 ? 0xf2d16b : 0xff7a6a,
          )
        } else if (event.kind === 'built') {
          view.float(center(event.building), `${BUILDING_NAMES[event.building.kind]} tamamlandı`, 0x9ee6a0)
        }
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [view, founded, setKingdom, recordJournal])

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
      const look: StructureLook = !done
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
      ...townsRef.current.flatMap(townStructures),
    ]
    // Footpaths (nothing grows in front of them to stand over the walkers; see paintChunk).
    const trails = [
      ...[buildings, ...rivals.map((r) => r.buildings)].flatMap((town) => footpaths(view.world, town, time)),
      ...townsRef.current.flatMap(townTrails),
    ]
    view.setStructures(structures, trails)
  }, [view, shown, mapBuildings, rivals, townPlaces])

  // The towns' names in their holders' colours, and the sieges under way (CLAUDE.md §8.4).
  useEffect(() => {
    if (!view) return
    const colorFor = (id: number | null) =>
      id === null ? 0xe8d8b0 : id === mine?.id ? colorOf(shown?.color) : colorOf(rivals.find((r) => r.id === id)?.color)
    view.setTowns(
      layer.towns.map((t) => ({
        at: townCenter(t),
        name: t.owner === null ? t.name : `${t.name} · ${t.owner === mine?.id ? (shown?.name ?? 'Senin') : (rivals.find((r) => r.id === t.owner)?.name ?? '?')}`,
        color: colorFor(t.owner),
        siege: t.siege ? { startedAt: t.siege.startedAt, endsAt: t.siege.endsAt, color: colorFor(t.siege.kingdom) } : null,
      })),
    )
  }, [view, layer.towns, rivals, mine?.id, shown?.color, shown?.name])

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
  }, [])
  useTabKeys(toggleTab, closeTab)
  useEffect(() => {
    if (panel === 'journal') markRead()
  }, [panel, journal.unread, markRead])
  // On phones the open sheet covers the map controls; the stylesheet hides them meanwhile.
  useEffect(() => {
    document.documentElement.dataset.sheet = panel || selected !== null || innOpen !== null || cityOpen !== null || townOpen !== null ? 'open' : 'closed'
  }, [panel, selected, innOpen, cityOpen, townOpen])
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
  const movingBuilding = moving !== null ? shown?.buildings.find((b) => b.id === moving) : undefined
  // Tearing down or moving several buildings: a tool in hand until the player is done (see MapTool).
  const [tool, setTool] = useState<MapTool>(null)
  const holding = placingKind !== null || moving !== null || tool !== null
  useEffect(() => view?.setTool(placingKind ? null : tool), [view, tool, placingKind])
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

  // Sends the aimed army toward a tile (an enemy's lands mean a siege) and leaves aiming.
  const sendArmy = (army: number, tile: Point) => {
    act({ type: 'army', army, order: { kind: 'move', x: Math.floor(tile.x), y: Math.floor(tile.y) } }).then((r) => {
      const at = (r as { at?: string } | undefined)?.at
      if (at && Date.parse(at) > serverNow() + 5000) setToast('Elçi yola çıktı; emir orduya ulaşınca uygulanacak')
    })
    setAiming(null)
  }

  tapRef.current = (tile, building, army, inn, city) => {
    const current = kingdomRef.current
    if (aiming === null && !tool && !placingKind) setInnOpen(inn ?? null)
    if (aiming === null && !tool && !placingKind) setCityOpen(city ?? null)
    // A town's houses and lanes open its sheet.
    if (aiming === null && !tool && !placingKind) setTownOpen(townsRef.current.find((t) => inTown(t, tile))?.id ?? null)
    // Choosing where an army marches.
    if (aiming !== null) {
      sendArmy(aiming, tile)
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

  const [confirmReset, setConfirmReset] = useState(false)
  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 3000)
      return
    }
    setConfirmReset(false)
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
        ? [{ id: mine.id, name: kingdom.name ?? 'Krallığın', color: kingdom.color ?? null, username: null, site: kingdom.site, queen: !!kingdom.queen, palace: palaceOf(kingdom.buildings), shieldUntil: kingdom.shieldUntil ?? null, score: scoreOf(kingdom, now), tradeGood: kingdom.trade.idle ? null : kingdom.trade.good, tradeLedger: kingdom.trade.ledger ?? null, tradeDamaged: !!kingdom.trade.damaged, liege: kingdom.liege ?? null }]
        : []),
      ...rivals.map((r) => ({ id: r.id, name: r.name, color: r.color, username: r.username, site: r.site, queen: r.queen, palace: palaceOf(r.buildings), seenAt: r.seen_at, buildings: r.buildings, shieldUntil: r.shield_until, score: r.score ?? null, tradeGood: r.trade_good ?? null, tradeLedger: r.trade_ledger ?? null, tradeDamaged: !!r.trade_damaged, liege: r.liege ?? null })),
    ],
    // Palace levels only change with the buildings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    intel,
    loadIntel,
    act,
    target: (army) => {
      setAiming(army)
      setPanel(null)
      setSelected(null)
    },
    watch: setWatching,
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
    const id = window.setTimeout(() => setPatrolStep((n) => n + 1), next - t + 50)
    return () => clearTimeout(id)
  }, [patrolStep])
  const patrolRoutes = useRef(new Map<string, Point[] | null>())
  const patrols = useMemo((): MapArmy[] => {
    if (!view || view.world.cities.length === 0) return []
    const t = serverNow()
    const slot = patrolSlotAt(t)
    const times = patrolTimes(slot)
    if (t >= times.home) return []
    const lords: Lord[] = JSON.parse(lordsKey).map(([id, liege]: [number, number | null]) => ({ id, liege }))
    const towns = new Map<number, TownBuilding[]>([[mine.id, (shown?.buildings ?? []) as TownBuilding[]], ...rivals.map((r) => [r.id, r.buildings] as [number, TownBuilding[]])])
    const out: MapArmy[] = []
    view.world.cities.forEach((city, crown) => {
      for (let p = 0; p < balance.cities.crown.patrol.perCrown; p++) {
        const target = patrolTarget(view.world.seed, crown, p, slot, lords)
        if (target === null) continue
        const liege = lords.find((l) => l.id === target)?.liege
        const done = (towns.get(target) ?? []).filter((b) => b.doneAt <= times.arrive)
        // Its own crown's patrol stops at the house of entertainment, if there is one; otherwise at the palace.
        const stop = (visitKind(crown, liege) === 'tip' && done.find((b) => b.kind === 'tavern')) || done.find((b) => b.kind === 'palace')
        if (!stop) continue
        const key = `${crown}:${p}:${slot}`
        if (!patrolRoutes.current.has(key)) {
          const door = { x: stop.x + stop.size + 0.8, y: stop.y + stop.size + 0.8 }
          patrolRoutes.current.set(key, findRoute(view.world, capitalGate(city), door))
        }
        const route = patrolRoutes.current.get(key)
        if (!route || route.length === 0) continue
        const [path, departAt, arriveAt] =
          t < times.arrive ? [route, times.start, times.arrive] : t < times.leave ? [[route[route.length - 1]], times.leave, times.leave] : [[...route].reverse(), times.leave, times.home]
        out.push({ id: -(crown * 16 + p + 1), color: crown % 2 === 0 ? 'crimson' : 'royal', own: false, soldiers: null, path, departAt, arriveAt, battle: false, selected: false, figures: 5, catapult: false })
      }
    })
    if (patrolRoutes.current.size > 64) patrolRoutes.current.clear()
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lordsKey, patrolStep, mapBuildings, rivals])

  // Armies and battles on the map.
  useEffect(() => {
    if (!view) return
    const colors = new Map(kingdoms.map((k) => [k.id, k.color]))
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
      }))],
      layer.battles
        .filter((b) => !b.resolved || Date.parse(b.ends_at) > serverNow())
        .map((b) => ({ id: b.id, at: { x: b.x, y: b.y }, startedAt: Date.parse(b.started_at), endsAt: Date.parse(b.ends_at) })),
    )
  }, [view, layer.armies, layer.battles, kingdoms, mine.id, armyFocus, patrols])

  // The envoy's dialogs, one at a time, once their moment has come.
  const notice = layer.notices.find((n) => Date.parse(n.show_at) <= now) ?? null
  // Every piece of news is also written in the journal, on the envoy's paper, and announced with a sound.
  const heard = useRef(new Set<number>())
  useEffect(() => {
    for (const n of layer.notices) {
      const at = Date.parse(n.show_at)
      if (at > now) continue
      if (!heard.current.has(n.id)) {
        heard.current.add(n.id)
        play(NOTICE_CUES[n.kind] ?? 'envoy')
      }
      const { icon, title, text } = describeNotice(n, online)
      noteJournal(n.id, at, { icon, title, text: text || undefined, important: noticeHurts(n, kingdom?.name) })
    }
  })
  const closeNotice = () => {
    if (!notice) return
    markSeen([notice.id])
    dropNotices([notice.id])
  }
  const watchedBattle = layer.battles.find((b) => b.id === watching) ?? null

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
        }
      : null
  const selectedBuilding = kingdom?.buildings.find((b) => b.id === selected) ?? null
  // Every kingdom's banner on the minimap.
  const flags = useMemo(
    (): MinimapFlag[] => [
      ...rivals.map((r) => ({ site: r.site, color: hexOf(r.color), own: false })),
      ...(kingdom ? [{ site: kingdom.site, color: hexOf(kingdom.color), own: true }] : []),
    ],
    // The player's site and colour only change at founding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rivals, kingdom?.site, kingdom?.color],
  )

  return (
    <>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
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
      <button className="btn icon-only exit frame" onClick={onExit} title="Ana menüye dön" aria-label="Ana menüye dön">
        <Icon name="home" size={16} />
      </button>
      <button className="btn icon-only music frame" onClick={() => setSettingsOpen(true)} title="Ayarlar" aria-label="Ayarlar">
        <Icon name="gear" size={16} />
      </button>
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
            {lobby.name} · {rivals.length + (kingdom ? 1 : 0)}/{lobby.max_players} krallık
          </>
        )}
      </div>
      {view && !kingdom && (
        <SitePicker
          surveys={surveys}
          selected={selectedSite}
          onSelect={setSelectedSite}
          colors={lobbyColors(lobby.max_players)}
          taken={new Set(rivals.map((r) => r.color))}
          names={rivals.map((r) => r.name)}
          onFound={found}
        />
      )}
      {view && kingdom && !holding && <Dock open={panel} unread={journal.unread} onToggle={toggleTab} />}
      {view && kingdom && !holding && !panel && !selectedBuilding && innOpen === null && cityOpen === null && <Timers kingdom={kingdom} online={online} now={now} />}
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
              town={town}
              kingdom={kingdom}
              me={mine.id}
              names={new Map(rivals.map((r) => [r.id, r.name ?? '?']))}
              armies={layer.armies}
              pacts={layer.pacts}
              now={now}
              onSend={(army, tile) => sendArmy(army, tile)}
              onShow={(tile) => view.centerOn(tile)}
              onClose={closeTab}
            />
          )
        )
      })()}
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
      {kingdom && !needsPalace && hasTradePost(kingdom) && kingdom.trade.good === null && !kingdom.trade.idle && <GoodPicker kingdom={kingdom} onGood={chooseGood} market={layer.market} now={now} />}
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
      {view && <Minimap world={view.world} center={cameraCenter} flags={flags} onJump={(tile) => (touchOnly ? setFullMap(true) : view.centerOn(tile))} />}
      {view && fullMap && (
        <WorldMap
          world={view.world}
          kingdoms={[
            ...(kingdom && site
              ? [{ name: kingdom.name ?? 'Krallığın', color: hexOf(kingdom.color), rect: territoryRect(site, stage), mine: true }]
              : []),
            ...rivals.map((r) => ({
              name: r.name,
              color: hexOf(r.color),
              rect: territoryRect(r.site, territoryStage({ buildings: r.buildings } as Kingdom, serverNow())),
            })),
          ]}
          center={cameraCenter}
          onJump={view.centerOn}
          onClose={() => setFullMap(false)}
        />
      )}
      {view && !holding && aiming === null && (
        <Chat
          storeKey={`chat-seen:${lobby.id}`}
          username={username}
          messages={chat}
          mine={kingdom ? mine.id : null}
          canPost={kingdom !== null}
          onSend={sendChat}
          kingdoms={kingdoms}
          banner={(id) => view && <CrownBanner world={view.world} liege={kingdoms.find((k) => k.id === id)?.liege} />}
          onLocate={(site) => view?.centerOn(site)}
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
      {aiming !== null && (
        <div className="placing frame" role="status">
          <Icon name="swords" size={24} />
          <span>
            <b>Ordunun hedefi</b> · {touchOnly ? 'Haritada bir yere dokun' : 'Haritada bir yere tıkla'} (savaştığın bir krallığın hududu kuşatma demektir)
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
      {notice && kingdom && <EnvoyDialog notice={notice} online={online} onClose={closeNotice} />}
      {!notice && kingdom && fortunes[0] && <FortuneDialog event={fortunes[0]} now={now} onClose={() => setFortunes((list) => list.slice(1))} />}
      {watchedBattle && <BattleView battle={watchedBattle} online={online} now={now} onClose={() => setWatching(null)} />}
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
