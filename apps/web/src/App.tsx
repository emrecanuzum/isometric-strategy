import {
  BUILDINGS,
  Feature,
  Terrain,
  TileRule,
  advance,
  balance,
  build,
  buildError,
  canPlace,
  dockPier,
  findPlot,
  hasPalace,
  hasTradePost,
  lobbyColors,
  setTradeGood,
  surveySite,
  territoryRect,
  territoryStage,
  setProduct,
  setWorkers,
  upgradeBuilding,
  upgradeError,
  upgradeTrade,
} from '@game/shared'
import type { BuildError, Building, BuildingKind, Good, Kingdom, Point, World } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { WorldMap } from './game/WorldMap'
import { ConfirmBuild } from './ui/hud/ConfirmBuild'
import { Minimap } from './game/Minimap'
import type { Structure } from './game/chunkPainter'
import { createWorld, footprintOrigin } from './game/createWorld'
import type { Hover, RivalTerritory, WorldView } from './game/createWorld'
import { KINGDOM_COLORS } from './game/buildingSprites'
import type { KingdomColor } from './game/buildingSprites'
import { serverNow } from './net/clock'
import { CHAT_KEEP, CommandError, loadChat, loadMine, loadRivals, postChat, send, subscribe } from './net/online'
import type { ChatMessage, Command, Lobby, Mine, Rival } from './net/online'
import type { Settings } from './net/settings'
import { Chat } from './ui/Chat'
import { findPath } from './game/town'
import type { Errand } from './game/town'
import { Icon } from './ui/icons'
import { BUILDING_NAMES, RESOURCE_NAMES } from './ui/names'
import { Dock, Sheet, TopBar, useTabKeys } from './ui/hud/Hud'
import type { TabId } from './ui/hud/Hud'
import { useJournal } from './ui/hud/journal'
import { BuildingSheet } from './ui/hud/BuildingSheet'
import { MapTip } from './ui/hud/MapTip'
import type { HudData } from './ui/hud/tabs'
import { Constructions, GoodPicker, SitePicker } from './ui/panels'

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
  full: 'Lobide yer kalmadı',
  taken: 'Bu yer artık başka bir krallığa yakın; yeni yer keşfet',
  color: 'Bu renk başka bir krallığın; başka bir renk seç',
  conflict: 'Krallık başka yerden değişti, yeniden dene',
  server: 'Sunucuya ulaşılamadı',
}
const refusal = (e: unknown) => {
  const code = e instanceof CommandError ? e.message : 'server'
  return REFUSALS[code] ?? BUILD_ERRORS[code as BuildError] ?? 'Komut reddedildi'
}

// Kingdom colours as numbers for the map.
const hexOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#f2d16b'
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
}

// Walkers keep to dry land below the mountains.
const walkable = (world: World, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const t = world.terrain[y * world.size + x]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
}

// Footpaths are worn only between buildings closer than this to the palace.
const TRAIL_MAX_TILES = 40

// Villagers walk from their homes to the fields and workshops; the merchant tends the trade post.
function townErrands(buildings: Building[], time: number): Errand[] {
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

const center = (b: Building): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
// Where a walker stands outside a building: just past the middle of its front-left wall, by the door.
const doorstep = (b: Building): Point => ({ x: b.x + b.size * 0.7, y: b.y + b.size + 0.35 })

function App({
  lobby,
  initial,
  settings,
  onSettings,
  onExit,
}: {
  lobby: Lobby
  initial: Mine
  // The player's settings (music plays from the root, for the menu and the map alike).
  settings: Settings
  onSettings: (change: Partial<Settings>) => void
  // Back to the main menu.
  onExit: () => void
}) {
  const seed = lobby.seed
  const seasonStart = Date.parse(lobby.season_start)
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<WorldView | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [cameraCenter, setCameraCenter] = useState<Point | null>(null)
  const [loading, setLoading] = useState(true)
  const tapRef = useRef<(tile: Point, building?: number) => void>(() => {})

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
        onTap: (tile, building) => tapRef.current(tile, building),
      },
      serverNow,
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
  const toggleMusic = () => onSettings({ music: muted })

  // The server's copy of the player's row, and the kingdom as shown: the server's state settled up to now by the same
  // `advance` the server runs, with the player's commands applied at once while the server confirms them.
  const [mine, setMine] = useState(initial)
  const mineRef = useRef(mine)
  const [kingdom, setKingdomState] = useState<Kingdom | null>(() => initial.state && advance(initial.state, serverNow()).kingdom)
  const kingdomRef = useRef(kingdom)
  const setKingdom = useCallback((next: Kingdom | null) => {
    kingdomRef.current = next
    setKingdomState(next)
  }, [])
  // The territory's stage follows the palace's level (re-read every clock tick, so it grows when an upgrade ends).
  const stage = kingdom ? territoryStage(kingdom, serverNow()) : 0
  const [selectedSite, setSelectedSite] = useState(0)

  // A row from the server replaces what is shown, unless an older answer arrives late.
  const accept = useCallback(
    (row: Mine) => {
      if (row.version < mineRef.current.version) return
      mineRef.current = row
      setMine(row)
      setKingdom(row.state && advance(row.state, serverNow()).kingdom)
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
        setKingdom(state && advance(state, serverNow()).kingdom)
      }
    },
    [lobby.id, accept, setKingdom],
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
          if (version > mineRef.current.version) loadMine(lobby.id).then((row) => live && row && accept(row))
          return
        }
        clearTimeout(rivalTimer)
        rivalTimer = window.setTimeout(refreshRivals, 300)
      },
      onChat(message) {
        setChat((list) => (list.some((m) => m.id === message.id) ? list : [...list, message].slice(-CHAT_KEEP)))
      },
    })
    return () => {
      live = false
      clearTimeout(rivalTimer)
      unsubscribe()
    }
  }, [lobby.id, accept])
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
      })),
    )
  }, [view, rivals])

  // Before founding, the site under consideration; afterwards, the kingdom's own.
  const choosing = kingdom ? null : (mine.sites[selectedSite] ?? null)
  const survey = useMemo(() => (view && choosing ? surveySite(view.world, choosing) : null), [view, choosing])
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
  useEffect(() => {
    // After founding, the dock plot stays marked until a dock stands on it.
    const dockPlot = kingdom ? (kingdom.buildings.some((b) => b.kind === 'dock') ? null : kingdom.dockPlot) : plots?.dock?.plot
    view?.setTerritory(
      site ? territoryRect(site, stage) : null,
      { dock: dockPlot ?? null, trade: plots?.trade?.plot ?? null },
      kingdom?.name,
    )
  }, [view, site, stage, plots, kingdom])

  // The envoy's journal of what happened, kept in this browser per lobby.
  const { journal, record: recordJournal, markRead, reset: resetJournal } = useJournal(`journal-v2:${lobby.id}`, seasonStart)

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
      const { kingdom: next, events } = advance(current, time)
      if (next !== current) setKingdom(next)
      recordJournal(events, next, time)
      const palace = next.buildings.find((b) => b.kind === 'palace')
      for (const event of events) {
        if (event.kind === 'trade' && palace) {
          view.float(
            center(palace),
            event.sold > 0 ? `+${event.gold} altın` : `Satacak ${RESOURCE_NAMES[event.good].toLowerCase()} yok`,
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

  // Buildings into the ground painting; sites under construction show scaffolding.
  useEffect(() => {
    if (!view) return
    const time = serverNow()
    const buildings = kingdom?.buildings ?? []
    const structure = (b: Rival['buildings'][number], color: string | undefined, own: boolean, variant: number): Structure => {
      const done = b.doneAt <= time
      const pier = done && b.kind === 'dock' ? dockPier(view.world, b) : null
      // Only the player's own buildings answer to the pointer.
      return { x: b.x, y: b.y, size: b.size, look: done ? b.kind : 'scaffold', variant, level: b.level ?? 1, ...(own && { id: b.id }), color, ...(pier && { pier }) }
    }
    const structures: Structure[] = [
      ...buildings.map((b) => structure(b, kingdom?.color, true, b.id)),
      ...rivals.flatMap((r) => r.buildings.map((b) => structure(b, r.color, false, r.id * 1000 + b.id))),
    ]
    // Footpaths worn from every building's door to the palace gate, around the buildings in between.
    const palace = buildings.find((b) => b.kind === 'palace')
    const solid = new Set<number>()
    for (const b of buildings) {
      if (b.kind === 'farm') continue
      for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) solid.add(y * view.world.size + x)
    }
    // Villagers also wear paths on their daily walks from home to work, so every route walked is a footpath (and
    // nothing grows in front of it to stand over the walkers; see paintChunk).
    const routes = [
      ...(palace ? buildings.filter((b) => b !== palace && b.doneAt <= time).map((b) => ({ from: doorstep(b), to: doorstep(palace) })) : []),
      ...townErrands(buildings, time),
    ]
    const trails = routes.flatMap(({ from, to }) => {
      if (Math.hypot(to.x - from.x, to.y - from.y) > TRAIL_MAX_TILES) return []
      const path = findPath(from, to, (x, y) => solid.has(y * view.world.size + x) || !walkable(view.world, x, y))
      return path ? [path.points] : []
    })
    view.setStructures(structures, trails)
  }, [view, kingdom, rivals])

  // Villagers walk from their houses to the fields and workshops; the merchant walks to the trade post.
  const buildings = kingdom?.buildings
  const departedAt = kingdom?.trade.good ? kingdom.trade.departedAt : null
  const doneCount = buildings?.filter((b) => b.doneAt <= now).length ?? 0
  useEffect(() => {
    if (!view) return
    const time = serverNow()
    const done = (buildings ?? []).filter((b) => b.doneAt <= time)
    const palace = done.find((b) => b.kind === 'palace')
    const post = done.find((b) => b.kind === 'tradePost')
    view.setTown(
      townErrands(buildings ?? [], time),
      palace && post && departedAt !== null
        ? { home: doorstep(palace), market: doorstep(post), departedAt, tripMs: balance.economy.trade.tripSeconds * 1000 }
        : null,
    )
  }, [view, buildings, departedAt, doneCount])

  // ---- Commands ----

  const [panel, setPanel] = useState<TabId | null>(null)
  // The building whose menu is open (it replaces the open tab).
  const [selected, setSelected] = useState<number | null>(null)
  const toggleTab = useCallback((tab: TabId) => {
    setSelected(null)
    setPanel((open) => (open === tab ? null : tab))
  }, [])
  const closeTab = useCallback(() => {
    setPanel(null)
    setSelected(null)
  }, [])
  useTabKeys(toggleTab, closeTab)
  useEffect(() => {
    if (panel === 'journal') markRead()
  }, [panel, journal.unread, markRead])
  // On phones the open sheet covers the map controls; the stylesheet hides them meanwhile.
  useEffect(() => {
    document.documentElement.dataset.sheet = panel || selected !== null ? 'open' : 'closed'
  }, [panel, selected])
  const [placing, setPlacing] = useState<BuildingKind | null>(null)
  // A new kingdom first places its palace, wherever the player likes inside the territory.
  const needsPalace = kingdom !== null && !hasPalace(kingdom)
  const placingKind: BuildingKind | null = needsPalace ? 'palace' : placing
  const [preview, setPreview] = useState<Point | null>(null)
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!view) return
    if (!placingKind || !kingdom) {
      view.setPlacement(null)
      return
    }
    const size = BUILDINGS[placingKind].size
    view.setPlacement({ size, valid: (origin) => canPlace(view.world, kingdom, stage, { ...origin, size }), pinned: preview ?? undefined })
  }, [view, placingKind, kingdom, stage, preview])

  // The whole-world map, opened from the minimap on phones.
  const [fullMap, setFullMap] = useState(false)
  const cancelPlacing = () => {
    setPlacing(null)
    setPreview(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelPlacing()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  tapRef.current = (tile, building) => {
    const current = kingdomRef.current
    // Without a building in hand, a tap on a building opens its menu; on open ground it closes it.
    if (view && current && !placingKind) {
      setSelected(building ?? null)
      if (building !== undefined) setPanel(null)
      return
    }
    if (!view || !placingKind || !current) return
    // A picked spot waits for confirmation (see ConfirmBuild); picking again moves it.
    const origin = footprintOrigin(tile, BUILDINGS[placingKind].size)
    const error = buildError(view.world, current, stage, placingKind, origin, serverNow())
    if (error) {
      setToast(BUILD_ERRORS[error])
      setPreview(null)
      return
    }
    setPreview(origin)
  }
  const confirmBuild = () => {
    const current = kingdomRef.current
    if (!view || !placingKind || !current || !preview) return
    const time = serverNow()
    const error = buildError(view.world, current, stage, placingKind, preview, time)
    if (error) {
      setToast(BUILD_ERRORS[error])
      setPreview(null)
      return
    }
    command({ type: 'build', kind: placingKind, ...preview }, build(view.world, current, stage, placingKind, preview, time))
    cancelPlacing()
  }

  const startPlacing = (kind: BuildingKind) => {
    const error = view && kingdom && buildError(view.world, kingdom, stage, kind, null, serverNow())
    if (error) return setToast(BUILD_ERRORS[error])
    setPanel(null)
    // The dock has its own plot on the shore: no placing, it goes straight there.
    if (kind === 'dock' && view && kingdom?.dockPlot) {
      command({ type: 'build', kind: 'dock', x: kingdom.dockPlot.x, y: kingdom.dockPlot.y }, build(view.world, kingdom, stage, 'dock', kingdom.dockPlot, serverNow()))
      view.centerOn({ x: kingdom.dockPlot.x + 1, y: kingdom.dockPlot.y + 1 })
      return
    }
    setPlacing(kind)
  }

  const chooseGood = (good: Good) => kingdom && command({ type: 'tradeGood', good }, setTradeGood(kingdom, good, serverNow()))
  const upgrade = (id: number) => {
    if (!kingdom) return
    const error = upgradeError(kingdom, id, serverNow())
    if (error) return setToast(BUILD_ERRORS[error])
    command({ type: 'upgrade', id }, upgradeBuilding(kingdom, id, serverNow()))
  }

  const found = (name: string, color: string) => {
    if (!choosing) return
    command({ type: 'found', site: selectedSite, name, color })
  }
  const roll = async () => {
    await command({ type: 'roll' })
    setSelectedSite(mineRef.current.sites.length - 1)
  }

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
          onUpgrade: () => command({ type: 'upgradeTrade' }, upgradeTrade(kingdom)),
          onUpgradeBuilding: upgrade,
          onMute: toggleMusic,
          onExit,
          onReset: reset,
          onShow: (tile) => view.centerOn(tile),
        }
      : null
  const selectedBuilding = kingdom?.buildings.find((b) => b.id === selected) ?? null

  return (
    <>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      <div className="top">
        {kingdom && <TopBar kingdom={kingdom} now={now} seasonStart={seasonStart} history={journal.history} onOpen={setPanel} />}
        {kingdom && <Constructions kingdom={kingdom} now={now} />}
      </div>
      <button className="btn icon-only music frame" aria-pressed={!muted} onClick={toggleMusic} title={muted ? 'Müziği aç' : 'Müziği kapat'}>
        <Icon name="music" size={16} slash={muted} />
      </button>
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
          survey={survey}
          seen={mine.sites.length}
          selected={selectedSite}
          rollsLeft={balance.economy.siteRolls - mine.sites.length}
          onSelect={setSelectedSite}
          onRoll={roll}
          colors={lobbyColors(lobby.max_players)}
          taken={new Set(rivals.map((r) => r.color))}
          onFound={found}
        />
      )}
      {view && kingdom && !placingKind && <Dock open={panel} unread={journal.unread} onToggle={toggleTab} />}
      {view && kingdom && !placingKind && hover?.building && hover.building.id !== selected && (
        <MapTip building={kingdom.buildings.find((b) => b.id === hover.building!.id)} at={hover.building.screen} now={now} />
      )}
      {view && kingdom && !placingKind && hudData && selectedBuilding && (
        <BuildingSheet
          building={selectedBuilding}
          data={hudData}
          commands={{
            onUpgrade: upgrade,
            onWorkers: commandWorkers,
            onProduct: (id, product) => command({ type: 'product', id, product }, setProduct(kingdom, id, product)),
            onClose: closeTab,
          }}
        />
      )}
      {view && kingdom && !placingKind && panel && hudData && <Sheet tab={panel} onClose={closeTab} data={hudData} />}
      {placingKind && (
        <div className="placing frame" role="status">
          <Icon name="build" size={24} />
          <span>
            <b>{needsPalace ? 'Sarayını yerleştir' : BUILDING_NAMES[placingKind]}</b> ·{' '}
            {touchOnly ? 'Hudut içinde bir yere dokun' : 'Hudut içinde yeşil bir yere tıkla'}
          </span>
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
      {kingdom && !needsPalace && hasTradePost(kingdom) && kingdom.trade.good === null && <GoodPicker kingdom={kingdom} onGood={chooseGood} />}
      {toast && (
        <div className="toast frame" role="alert">
          <Icon name="warn" size={16} /> {toast}
        </div>
      )}
      {!view && <PixelSpinner big />}
      {view && loading && <PixelSpinner />}
      {view && (
        <div className="zoom">
          <button className="btn icon-only" onClick={() => site && view.centerOn(site)} aria-label="Üsse dön" title="Üsse dön">
            <Icon name="home" size={16} />
          </button>
          <button className="btn icon-only" onClick={() => view.zoomBy(1)} aria-label="Yakınlaştır" title="Yakınlaştır">
            <Icon name="plus" size={16} />
          </button>
          <button className="btn icon-only" onClick={() => view.zoomBy(-1)} aria-label="Uzaklaştır" title="Uzaklaştır">
            <Icon name="minus" size={16} />
          </button>
        </div>
      )}
      {view && <Minimap world={view.world} center={cameraCenter} onJump={(tile) => (touchOnly ? setFullMap(true) : view.centerOn(tile))} />}
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
      {view && !placingKind && <Chat messages={chat} mine={kingdom ? mine.id : null} canPost={kingdom !== null} onSend={sendChat} />}
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
