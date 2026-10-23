import {
  gameTime,
  Feature,
  TILE_HEIGHT,
  TILE_WIDTH,
  Terrain,
  balance,
  generateWorld,
  groundToScreen,
  WORLD_REV,
  hash,
  heightAt,
  screenToGround,
  tileToScreen,
  screenToTile,
  tileRule,
  caveSpots,
  snowCover,
} from '@game/shared'
import type { Point, Polyline, Rect, RiverKeep, World } from '@game/shared'
import type { Video } from '../net/settings'
import { Application, BlurFilter, Container, Graphics, ImageSource, Rectangle, Sprite, Text, Texture, UPDATE_PRIORITY } from 'pixi.js'
import { L, locale } from '../lib/i18n'
import { createAmbient } from './ambient'
import { createArmies } from './armies'
import type { FleetShip } from './ambient'
import { dashes } from './dashes'
import type { MapArmy, MapBattle } from './armies'
import { createCaravans } from './caravans'
import { cityArea, cityAreaAt, cityAt, cityInfo, cityStructures, cityTrails } from './cities'
import { BUILDER_SPRITES, CHIMNEYS, VILLAGER_SPRITES, linkWalls, structureParts } from './buildingSprites'
import type { StructureLook } from './buildingSprites'
import { animOf } from './buildingKit'
import type { Anim } from './buildingKit'
import { openGate } from './wallSprites'
import { caveLook } from './caveSprites'
import { handCursor } from '../lib/cursors'
import type { IconName } from '../ui/icons'
import { Canvas, SPRITES, lightsOf, outlineOf, rgb, silhouetteOf, snowOf } from './sprites'
import { daylight, nightness, sunShadow } from './daylight'
import { createShadows } from './shadows'
import { createWeather } from './weather'
import { createSoundscape } from '../audio/ambience'
import { createPacer } from './pacing'
import { innLook } from './innSprites'
import type { Sprite as Sprite_ } from './sprites'
import { CHUNK_PAD } from './chunkPainter'
import type { LiftedTree, Structure } from './chunkPainter'
import type { PaintRequest, PaintResult } from './paintWorker'
import { flushTextures, freeTexture, textureOf } from './textures'
import { createTown, tilesAlong } from './town'
import { createVillageLife } from './villageLife'
import type { Hamlet } from './villageLife'
import type { Errand, MerchantTrip } from './town'
import type { FederatedPointerEvent } from 'pixi.js'

// Flat colors for the minimap; the main view is painted by chunkPainter.
export const TERRAIN_COLORS: Record<number, number> = {
  [Terrain.Grass]: 0x6a9f45,
  [Terrain.Forest]: 0x2f6b34,
  [Terrain.Mountain]: 0x8a8578,
  [Terrain.Swamp]: 0x4f6652,
  [Terrain.Desert]: 0xd2bc7c,
  [Terrain.Lake]: 0x2f6fa8,
  [Terrain.River]: 0x4a90c8,
}
export const FEATURE_COLORS: Record<number, number> = {
  [Feature.Road]: 0xb08a55,
  [Feature.Bridge]: 0x7a5230,
  [Feature.Inn]: 0xc0392b,
  [Feature.City]: 0xe8c45a,
}

const HOVER = 0xffffff
// Builders carrying planks across a site: tiles a second, and seconds of rest at each end.
const BUILDER_SPEED = 0.35
const BUILDER_REST = 1.2
const TERRITORY = 0xf2d16b
const DOCK_PLOT = 0x7fd4ff
const TRADE_PLOT = 0xffa24a
// Zoom moves in steps so art pixels always cover a whole number of screen pixels; below 1× the chunks are
// repainted at that scale instead of being shrunk.
const ZOOMS = [0.125, 0.25, 0.5, 1, 2, 3]
const DEFAULT_ZOOM_INDEX = 3
const WHEEL_STEP = 50
const WHEEL_COOLDOWN_MS = 220
// A press that moves less than this many screen pixels is a tap, not a drag.
const TAP_SLOP = 10
// How long a move order's mark stays on the ground.
const MARK_SECONDS = 0.9
// Phones and small machines (CLAUDE.md §12): a touch-only screen or at most 4 GB of memory. iOS kills a tab that holds
// too much canvas and texture memory, so they keep fewer painted chunks and fewer painting workers (each holds a copy
// of the world and its own sprites, ~40 MB).
const LOW_MEMORY =
  typeof window !== 'undefined' &&
  ((window.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false) || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4)
// Painted chunks kept off screen until this much is held (a chunk at full detail is ~10 MB).
const TEXTURE_BUDGET_BYTES = (LOW_MEMORY ? 64 : 192) * 1024 * 1024
const MAX_WORKERS = LOW_MEMORY ? 2 : 4
// Caravans are too small to make out below this zoom.
const CARAVAN_MIN_ZOOM = 0.5
// How often the camera's place is told to the interface while the map moves, in milliseconds.
const CAMERA_REPORT_MS = 120

// The canvas's pixels per screen point (CLAUDE.md §12). The map is pixel art drawn at whole zooms (1×, 2×, 3×) and
// shown with nearest-neighbour scaling, so at those zooms a canvas of one pixel per point looks the same as a dense
// one while filling a quarter of the pixels on a 2× screen (a laptop's or phone's battery goes on filling pixels).
// Zoomed out, where a building is drawn smaller than its art, the screen's own density (up to 2) keeps its detail;
// with sharp drawing off (Ayarlar → Görüntü, or power saving) it is one pixel per point at every zoom.
export function canvasResolution(sharp: boolean, zoom = 1): number {
  const dpr = window.devicePixelRatio || 1
  if (!sharp || zoom >= 1) return 1
  return Math.min(2, dpr)
}
// Tiles around a building whose chunks show part of it (see SPRITE_MARGIN in chunkPainter).
const STRUCTURE_REACH = 10
const FLOAT_SECONDS = 1.6
const GHOST_OK = 0x7dff8a
const GHOST_BAD = 0xff5a4a
const HIGHLIGHT = 0xf2d16b
// The outline under a tool: red for tearing down, blue for picking up to move.
const DEMOLISH_HIGHLIGHT = 0xff4a3a
const MOVE_HIGHLIGHT = 0x7ad0ff
// A pixel hammer for the pointer while tearing down, its head's corner on the spot.
// The icon the pointer's hand carries over each kind of building (lib/cursors.ts): what it makes or what it is for.
const LOOK_ICONS: Partial<Record<StructureLook, IconName>> = {
  palace: 'crown',
  tradePost: 'trade',
  tradePostRuined: 'trade',
  house: 'house',
  farm: 'wheat',
  lumberCamp: 'axe',
  dock: 'fish',
  jetty: 'anchor',
  fisherHut: 'fish',
  forge: 'anvil',
  market: 'gold',
  barracks: 'swords',
  spyHouse: 'eye',
  watchtower: 'bow',
  wall: 'shield',
  gate: 'shield',
  gateY: 'shield',
  towerWall: 'shield',
  brokenWall: 'shield',
  university: 'book',
  hospital: 'heal',
  temple: 'temple',
  cathedral: 'temple',
  warehouse: 'chest',
  treasury: 'gold',
  tavern: 'music',
  prison: 'lock',
  prisonFull: 'lock',
  shipyard: 'ship',
  citadel: 'shield',
  memorial: 'star',
  monument: 'star',
  guildHall: 'scroll',
  scaffold: 'build',
  road: 'map',
}

const HAMMER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' shape-rendering='crispEdges'><g transform='rotate(-45 16 16)'><rect x='14.5' y='11.5' width='4' height='19' fill='#8a6440' stroke='#1a0f08'/><rect x='15.5' y='12' width='1' height='18' fill='#b08a5a'/><rect x='7.5' y='4.5' width='18' height='8' fill='#8a949c' stroke='#1a0f08'/><rect x='8' y='5' width='17' height='2' fill='#d8dee2'/><rect x='8' y='10' width='17' height='2' fill='#5a646c'/></g></svg>",
)}") 6 6, crosshair`

// A tool in the player's hand on the map (see WorldView.setTool).
export type MapTool = 'demolish' | 'move' | null
// Territory border dashes and gaps, in screen pixels; the kingdom's name shows at this zoom and below.
const DASH = 12
const GAP = 8
const NAME_MAX_ZOOM = 0.5
const CITY_NAME_MAX_ZOOM = 1

// Top-left tile of a footprint of `size` held under the pointer at `tile`.
export const footprintOrigin = (tile: Point, size: number): Point => ({
  x: tile.x - Math.floor((size - 1) / 2),
  y: tile.y - Math.floor((size - 1) / 2),
})

export interface Hover {
  tile: Point
  terrain: number
  feature: number
  rule: number
  // The building under the pointer, and the screen point above its top; `owner` is set for another kingdom's.
  building?: { id: number; screen: Point; owner?: number }
  // The inn under the pointer (its index in world.inns), and the screen point above its top.
  inn?: { index: number; screen: Point }
  // The free city under the pointer (its index in world.cities), and the screen point above it.
  city?: { index: number; screen: Point }
}

export interface Plots {
  dock: Rect | null
  trade: Rect | null
  // The shore ground beside a dock plot granted outside the territory, where the fisher's hut may go.
  annex?: Rect | null
}

export interface Placement {
  size: number
  valid(origin: Point): boolean
  // A spot already picked and awaiting confirmation: the footprint stays there whatever the pointer does.
  pinned?: Point
  // Laid by dragging (walls, houses): press and drag draws a row of footprints, handed to onStroke on release.
  stroke?: boolean
  // A row already drawn and awaiting confirmation.
  pinnedMany?: Point[]
  // Single tiles that come with the footprint at `origin` (a gate's towers), drawn with it.
  extra?(origin: Point): Point[]
  // A building carried to a new spot: drawn see-through at the footprint under the pointer.
  carry?: Omit<Structure, 'x' | 'y'>
}

export interface WorldHandlers {
  onHover(hover: Hover | null): void
  // Where the camera looks and the screen's four corners on the ground (top left, top right, bottom right, bottom left),
  // in tiles; sent again only when one of them moves by a tile.
  onCamera(center: Point, corners: Point[]): void
  onLoading(loading: boolean): void
  // A tap or click that did not drag the map, and the player's building or the army drawn under it, if any; or a
  // lord's ship (whose, and its fleet).
  // `lord` is set when the tap fell on another lord's building.
  onTap(tile: Point, building?: number, army?: number, inn?: number, city?: number, ship?: { lord: number; fleet?: number }, lord?: number): void
  // A row of footprints drawn by dragging while placing a stroke kind (see Placement.stroke).
  onStroke?(spots: Point[]): void
  // A right click that did not drag: the tile under it (a selected army or fleet is sent there).
  onRightTap?(tile: Point): void
}

export interface RivalTerritory {
  rect: Rect
  name: string
  color: number
  // Where its palace stands (a tile on it), for the name over it.
  palace?: Point
  // The banner colour of the crown kingdom its lord is sworn to (CLAUDE.md §7.8), flown beside the name.
  banner?: number
}

// A town on the map as drawn: where its name goes (a ground point), its name and colour, and the siege under way.
export interface TownMark {
  at: Point
  // The town's ground, outlined while the pointer is over it.
  rect?: Rect
  name: string
  color: number
  siege: { startedAt: number; endsAt: number; color: number } | null
}

// A bar over the map showing how far something has come: a building going up, a palace under siege, its shield.
// `at` is the ground point it stands over and `lift` how many pixels above the ground it floats.
export interface ProgressMark {
  key: string
  at: Point
  lift: number
  startedAt: number
  endsAt: number
  color: number
  label?: string
}

// A target an army is about to be sent to, as drawn while aiming: its square on the map, colour and name.
export interface AimMark {
  rect: { x: number; y: number; size: number }
  color: number
  label: string
}

export interface WorldView {
  world: World
  centerOn(tile: Point): void
  // An army or a fleet is being sent somewhere: the tile under the pointer is marked (not while just looking round).
  setTargeting(on: boolean): void
  // What the map draws and how often (Ayarlar → Görüntü and Performans, with power saving worked in; see videoOf).
  // Turning detail animations (swaying trees, moving buildings) on or off paints the chunks on screen again.
  setVideo(video: Video): void
  // Frames the map drew in the last second (for measuring).
  fps(): number
  // The lobby's key (lobbyKeyOf), which the weather follows (see weather.ts); undefined for a clear sky.
  setWeather(key: number | undefined): void
  // Keeps the camera on whatever `target` says each frame (an army on the march), until null is given or the map is
  // dragged; `onStop` hears when a drag ended it.
  follow(target: (() => Point | null) | null, onStop?: () => void): void
  setTerritory(rect: Rect | null, plots: Plots, name?: string, palace?: Point, banner?: number): void
  // The other kingdoms of the lobby: their borders in their own colour, and their names when zoomed out.
  setRivals(rivals: RivalTerritory[]): void
  // Every army in the lobby and the battles being fought (see armies.ts).
  setArmies(armies: MapArmy[], battles: MapBattle[]): void
  // The lords' ships at their docks and at sea (CLAUDE.md §8.5).
  setFleets(ships: FleetShip[]): void
  // The fleet picked (its ships outlined), if any.
  setFleetFocus(focus: { lord: number; fleet: number } | null): void
  // The player's buildings, painted into the ground like the inns.
  setStructures(structures: Structure[], trails: Point[][]): void
  // While set, the pointer shows the footprint of the building being placed, green where it fits.
  setPlacement(placement: Placement | null): void
  // The pointer and outline for tearing down (a hammer, red) or moving (blue); buildings stay pickable while moving.
  setTool(tool: MapTool): void
  // The player's buildings marked in the plan: a red silhouette over those to be torn down, a blue one over the one
  // picked up to be moved.
  setMarked(marks: { id: number; tone: 'demolish' | 'move' }[]): void
  // The player's buildings whose work goes nowhere ("üretim ağı tıkandı"): a warning sign bobs over each.
  setClogged(ids: { id: number; tone: 'armory' | 'store' }[]): void
  setTown(errands: Errand[], merchants: MerchantTrip[]): void
  // The lordships' everyday life round their buildings (villageLife.ts): townsfolk, children, livestock, the cart.
  setVillages(hamlets: Hamlet[]): void
  // The towns' names over them (in their holder's colour) and, while one is besieged, how far the siege has come.
  setTowns(marks: TownMark[]): void
  // Progress bars over buildings going up and palaces under siege or shielded.
  setProgress(marks: ProgressMark[]): void
  // While an army is being sent: the target the pointer has snapped to (a lord, a crown city or a town), outlined in
  // dashes with its name over it; null for none.
  setAimMark(mark: AimMark | null): void
  // Tiles walkers go around: building footprints, except flat ones such as fields.
  blocksWalkers(x: number, y: number): boolean
  // A short message rising from a spot on the ground.
  float(tile: Point, text: string, color: number): void
  // A move order's mark on the ground (rings closing in on the spot), fading in under a second.
  markMove(at: Point, color: number): void
  /** Steps the zoom in (+1) or out (-1) around the middle of the screen. */
  zoomBy(step: number): void
  destroy(): void
}

interface Chunk {
  sprite: Sprite
  bitmap: ImageBitmap
  lod: number
  bytes: number
  version: number
  // Its trees as sprites of their own (painted with detail animations on, close up, and wherever an army is), which
  // sway in the wind.
  trees: Sprite[]
  lift: boolean
  // Which chunks round it had their trees lifted when it was painted (see nearFor).
  near: string
}

interface Job {
  key: number
  lod: number
  lift: boolean
  near: string
  // Structures version the worker painted with.
  version: number
}

export async function createWorld(
  host: HTMLElement,
  seed: number,
  { onHover: sendHover, onCamera: sendCamera, onLoading, onTap, onStroke, onRightTap }: WorldHandlers,
  // The shared game clock (server time), so every player sees the same hour, caravans and animals.
  clock: () => number = Date.now,
  // How the lobby's world is made from its seed (see WORLD_REV).
  rev = WORLD_REV,
  // What its widened rivers leave dry, for a lobby that was running when they came.
  keep: RiverKeep[] = [],
  // The channels joining its waters, for a lobby that was running when they came (revision 7).
  links: Polyline[] = [],
): Promise<WorldView> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: 0x10141a,
    antialias: false,
    roundPixels: true,
    resolution: canvasResolution(true, ZOOMS[DEFAULT_ZOOM_INDEX]),
    autoDensity: true,
    // Frames are stepped by the pacer (see pacing.ts), not by Pixi's own loop.
    autoStart: false,
    powerPreference: 'low-power',
  })
  app.canvas.style.imageRendering = 'pixelated'
  host.appendChild(app.canvas)
  // What the player chose to see (see setVideo).
  let video: Video = { detail: true, birds: true, clouds: true, glow: true, shadows: true, weather: 'full', sharp: true, pace: 'balanced' }
  const pacer = createPacer(app.ticker, () => camera.scale.x >= CARAVAN_MIN_ZOOM)
  const wake = pacer.wake
  // Sprites packed onto atlas pages this frame are uploaded once, after every update and just before the draw (the
  // draw itself runs at UPDATE_PRIORITY.LOW).
  app.ticker.add(flushTextures, undefined, UPDATE_PRIORITY.LOW + 1)
  // The pointer's hover is told only when what it is over changes (a mouse move inside one tile tells nothing new),
  // so the interface is not drawn again for every move of the mouse.
  let hoverKey = ''
  const onHover = (hover: Hover | null) => {
    const key = hover
      ? [hover.tile.x, hover.tile.y, hover.building?.id, hover.building?.screen.x, hover.building?.screen.y, hover.inn?.index, hover.inn?.screen.x, hover.inn?.screen.y, hover.city?.index, hover.city?.screen.x, hover.city?.screen.y].join(',')
      : ''
    if (key === hoverKey) return
    hoverKey = key
    sendHover(hover)
  }
  // The camera's place is told at most this often while the map moves (and once more where it stops).
  let cameraTimer = 0
  let cameraNext: [Point, Point[]] | null = null
  const onCamera = (center: Point, corners: Point[]) => {
    cameraNext = [center, corners]
    if (cameraTimer) return
    const flush = () => {
      if (!cameraNext) {
        cameraTimer = 0
        return
      }
      sendCamera(...cameraNext)
      cameraNext = null
      cameraTimer = window.setTimeout(flush, CAMERA_REPORT_MS)
    }
    flush()
  }

  const world = generateWorld(seed, rev, keep, links)
  const chunkSize = balance.map.chunkSize
  const chunkCount = world.size / chunkSize

  const camera = new Container()
  const ground = new Container()
  // What moves on the fields (the crops in the wind), over the ground and under the shadows.
  const fields = new Container()
  ground.sortableChildren = true
  const territory = new Graphics()
  const rivalLines = new Graphics()
  const rivalLabels = new Container()
  const cursor = new Graphics()
  const caravans = createCaravans(world)
  const ambient = createAmbient(world, caravans.layer)
  const town = createTown(world, caravans.layer)
  const village = createVillageLife(world, caravans.layer)
  const floats = new Container()
  const shadows = createShadows()
  // Plot names float above their outlines at a fixed screen size.
  const label = (text: string, color: number) =>
    new Text({
      text,
      resolution: window.devicePixelRatio * 2,
      anchor: { x: 0.5, y: 1 },
      style: {
        fontFamily: "'Digits', 'Pixelify Sans', system-ui, sans-serif",
        fontSize: 12,
        fontWeight: '600',
        fill: color,
        stroke: { color: 0x10141a, width: 3, join: 'round' },
      },
    })
  const plotLabels = { dock: label(L('İskele alanı', 'Dock plot'), DOCK_PLOT), trade: label(L('Ticaret alanı', 'Trade plot'), TRADE_PLOT) }
  // The kingdom's name over its territory, shown once the map is zoomed out far enough to see the whole of it.
  // Lords' names a little smaller than the crown kingdoms', which are written in capitals in their crown's colour.
  const nameLabel = (fill: number | string, fontSize = 27) => new Text({
    text: '',
    resolution: window.devicePixelRatio * 2,
    anchor: { x: 0.5, y: 0.5 },
    style: {
      fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace",
      // Kingdoms' and capitals' names, large enough to read the map by.
      fontSize,
      fontWeight: '600',
      fill,
      letterSpacing: 1,
      stroke: { color: 0x120d0b, width: 6, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.5, blur: 0, distance: 2, angle: Math.PI / 2 },
    },
  })
  const kingdomLabel = nameLabel(TERRITORY)
  kingdomLabel.visible = false
  // A lord's crown banner beside its name on the map: a pole with a swallow-tailed flag in the crown's colour, drawn in
  // screen pixels and set left of the name.
  const crownBanner = (color: number) => {
    const g = new Graphics()
    g.rect(-1, -16, 2, 26).fill(0x2a1c10)
    g.poly([1, -15, 15, -15, 11, -10, 15, -5, 1, -5]).fill(color).stroke({ width: 1, color: 0x120d0b })
    g.circle(0, -17, 1.5).fill(0xd2aa44)
    return g
  }
  const besideName = (banner: Graphics, text: Text) => {
    // Scaled up with the name (drawn for a 22 px name), and set just left of it.
    banner.scale.set(text.scale.x * 1.35)
    banner.position.set(text.x - text.width / 2 - 26 * text.scale.x, text.y + 3 * text.scale.x)
  }
  let kingdomBanner: Graphics | null = null
  // A building under the pointer is outlined instead of the tile.
  const highlight = new Sprite()
  highlight.tint = HIGHLIGHT
  highlight.visible = false
  // The territory lines lie on the ground: buildings and walkers stand over them.
  // Armies stay in sight at every zoom (the caravans' layer hides when zoomed out), their routes on the ground.
  const armyRoutes = new Graphics()
  // The lords' fleets: the way ahead of a sailing fleet with an arrow at its end, the picked fleet's outlines, and a
  // tag in the lord's colour over each fleet's first ship.
  const fleetRoutes = new Graphics()
  const fleetMarks = new Container()
  const fleetLabels = new Container()
  const armyLabels = new Container()
  // Red silhouettes over the buildings marked to be torn down.
  const marks = new Container()
  const clogSigns = new Container()
  // The building being moved, following the pointer.
  const carried = new Container()
  carried.alpha = 0.6
  const clearCursor = () => {
    cursor.clear()
    for (const child of carried.removeChildren()) child.destroy()
  }
  // The target an aimed army has snapped to, outlined over everything on the ground.
  const aimLines = new Graphics()
  // Where a right click sent an army or a fleet (see markMove).
  const moveMarks = new Graphics()
  camera.addChild(ground, fields, shadows.layer, rivalLines, territory, armyRoutes, fleetRoutes, ambient.under, caravans.layer, fleetMarks, marks, clogSigns, ambient.sky, cursor, carried, highlight, aimLines, moveMarks)
  app.stage.addChild(camera)
  // Day and night: the whole map is multiplied by the colour of the light at this hour of the game day. Lit windows
  // and the labels sit above it, in a layer that follows the camera, so night never dims them.
  const light = new Graphics()
  light.blendMode = 'multiply'
  const glow = new Container()
  // A soft halo under the lit windows: the same lights again, blurred and added onto the night.
  const halo = new Container()
  // Blurred anyway, so drawn at half a pixel per screen point (a sixteenth of the work of a sharp screen).
  halo.filters = [new BlurFilter({ strength: 5, quality: 2, resolution: 0.5 })]
  // Its area is what the screen shows (kept up to date each frame, in the camera's coordinates): measuring the bounds
  // of every light on the map each frame cost more than the blur. The shadow layer's filter uses the same area.
  const viewArea = new Rectangle()
  halo.filterArea = viewArea
  shadows.layer.filterArea = viewArea
  halo.blendMode = 'add'
  // Each light goes into both layers: crisp in `glow`, blurred in `halo`.
  const addLight = (texture: Texture, anchorX: number, anchorY: number, x: number, y: number) => {
    const crisp = new Sprite(texture)
    crisp.anchor.set(anchorX, anchorY)
    crisp.position.set(x, y)
    glow.addChild(crisp)
    const soft = new Sprite(texture)
    soft.anchor.set(anchorX, anchorY)
    soft.position.set(x, y)
    halo.addChild(soft)
    return [crisp, soft]
  }
  const above = new Container()
  const townLayer = new Container()
  // The name over an aimed army's target (see setAimMark).
  const aimLabel = new Text({
    text: '',
    resolution: window.devicePixelRatio * 2,
    anchor: { x: 0.5, y: 1 },
    style: { fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace", fontSize: 15, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x120d0b, width: 4, join: 'round' } },
  })
  aimLabel.visible = false
  above.addChild(halo, glow, plotLabels.dock, plotLabels.trade, rivalLabels, kingdomLabel, townLayer, aimLabel, armyLabels, fleetLabels, floats)
  // Armies stand in the same layer as buildings and walkers, so a wall or a house in front of an army hides it.
  const armies = createArmies(world, caravans.layer, armyRoutes, armyLabels)
  app.stage.addChild(light, above)
  // Rain (see weather.ts): splashes on the ground under the buildings, the grey and the falling rain under the light.
  const weather = createWeather(world)
  // The world's ambience (audio/ambience.ts): wind, water, birds, the village, from where the camera looks.
  const soundscape = createSoundscape(world)
  camera.addChildAt(weather.ground, camera.getChildIndex(shadows.layer) + 1)
  app.stage.addChildAt(weather.screen, app.stage.getChildIndex(light))
  app.stage.addChildAt(weather.flash, app.stage.getChildIndex(light) + 1)
  for (const inn of world.inns) {
    // Inns are painted into the ground, but trees lifted out of it to sway stand in the walkers' layer: a copy of the
    // inn stands there too, so the trees behind it stay behind it.
    const look = innLook(world, inn).sprite
    const cover = new Sprite(textureOf(look))
    cover.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
    const front = groundToScreen(world, { x: inn.x + 2, y: inn.y + 2 })
    const sy = (inn.x + inn.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, inn.x + 1, inn.y + 1)
    cover.position.set(front.x, sy)
    cover.zIndex = sy
    cover.label = 'inn'
    caravans.layer.addChild(cover)
    const lit = lightsOf(look)
    if (!lit) continue
    addLight(textureOf(lit), lit.anchorX / lit.width, lit.anchorY / lit.height, (inn.x - inn.y) * (TILE_WIDTH / 2), (inn.x + inn.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, inn.x + 1, inn.y + 1))
  }
  let lightColor = -1
  let paintedSunHour = Math.floor(gameTime(clock(), 0).hour)
  // The snow the buildings in view and the chunks were last drawn with (see snowCover); ?snow=1..3 forces it while
  // developing.
  const forcedSnow = import.meta.env.DEV ? new URLSearchParams(location.search).get('snow') : null
  const coverAt = (t: number) => (forcedSnow ? Math.min(3, Math.max(0, Number(forcedSnow) || 0)) : snowCover(t))
  let paintedSnow = coverAt(clock())
  let chunkSnow = paintedSnow
  // Trees sway in the wind close up: each leans a little to and fro about its foot, out of step with its neighbours.
  let detail = true
  app.ticker.add(() => {
    if (!detail || camera.scale.x < 1) return
    const t = performance.now() / 1000
    for (const chunk of chunks.values()) {
      if (!chunk.sprite.visible) continue
      for (const tree of chunk.trees) if (tree.visible) tree.skew.x = Math.sin(t * 1.4 + tree.x * 0.031 + tree.y * 0.047) * 0.045
    }
  })
  // The aimed army's target: redrawn when the zoom changes, so its dashes stay the same size on screen.
  let aim: AimMark | null = null
  let aimScale = -1
  app.ticker.add(() => {
    if (!aim || aimScale === camera.scale.x) return
    aimScale = camera.scale.x
    const { rect, color, label } = aim
    aimLines.clear()
    const border = square(rect.x, rect.y, rect.size)
    aimLines.poly(border).fill({ color, alpha: 0.12 })
    dashed(aimLines, border)
    aimLines.stroke({ width: 4 / camera.scale.x, color, alpha: 0.95, cap: 'butt' })
    let top = 1
    for (let i = 3; i < border.length; i += 2) if (border[i] < border[top]) top = i
    aimLabel.text = label
    aimLabel.style.fill = color
    aimLabel.position.set(border[top - 1], border[top] - 6 / camera.scale.y)
    aimLabel.scale.set(1 / camera.scale.x)
    aimLabel.visible = true
  })
  // Move marks: two flattened rings closing in on the spot and a dot, a fixed size on screen, gone after MARK_SECONDS.
  let moveOrders: { at: Point; color: number; born: number }[] = []
  app.ticker.add(() => {
    if (moveOrders.length === 0) return
    const now = performance.now()
    moveOrders = moveOrders.filter((m) => now - m.born < MARK_SECONDS * 1000)
    moveMarks.clear()
    const k = 1 / camera.scale.x
    for (const m of moveOrders) {
      const age = (now - m.born) / 1000 / MARK_SECONDS
      const s = groundToScreen(world, m.at)
      const fade = Math.min(1, (1 - age) * 2.5)
      for (const delay of [0, 0.22]) {
        const t = Math.min(1, Math.max(0, (age - delay) / 0.6))
        if (age < delay || t >= 1) continue
        const r = (26 - 20 * t) * k
        moveMarks.ellipse(s.x, s.y, r, r / 2).stroke({ width: 3 * k, color: 0x120d0b, alpha: 0.6 * fade })
        moveMarks.ellipse(s.x, s.y, r, r / 2).stroke({ width: 1.5 * k, color: m.color, alpha: fade })
      }
      moveMarks.rect(s.x - 2 * k, s.y - 1 * k, 4 * k, 2 * k).fill({ color: m.color, alpha: fade })
    }
    if (moveOrders.length === 0) moveMarks.clear()
  })
  // Town names and siege bars, at a fixed size on screen above each town.
  let townMarks: { mark: TownMark; text: Text; bar: Graphics; drawn?: boolean }[] = []
  app.ticker.add(() => {
    const now = clock()
    for (const entry of townMarks) {
      const { mark, text, bar } = entry
      const top = groundToScreen(world, mark.at)
      const k = 1 / camera.scale.x
      text.position.set(top.x, top.y - 70 - 6 * k)
      text.scale.set(k)
      // A town under no siege has nothing to draw: its bar is cleared once, not every frame.
      if (!mark.siege) {
        if (entry.drawn) bar.clear()
        entry.drawn = false
        continue
      }
      bar.clear()
      entry.drawn = true
      const f = Math.min(1, Math.max(0, (now - mark.siege.startedAt) / (mark.siege.endsAt - mark.siege.startedAt)))
      const w = 72
      bar.rect(-w / 2 - 2, -2, w + 4, 10).fill(0x120d0b)
      bar.rect(-w / 2, 0, w, 6).fill(0x3a2a20)
      bar.rect(-w / 2, 0, Math.round(w * f), 6).fill(mark.siege.color)
      bar.rect(-w / 2, 0, Math.round(w * f), 1).fill({ color: 0xffffff, alpha: 0.35 })
      bar.position.set(top.x, top.y - 70 + 2 * k)
      bar.scale.set(k)
    }
  })
  // Progress bars (buildings going up, palace sieges and shields), at a fixed size on screen like the towns'.
  let progressMarks: { mark: ProgressMark; bar: Graphics; text: Text | null }[] = []
  app.ticker.add(() => {
    const now = clock()
    const k = 1 / camera.scale.x
    for (const { mark, bar, text } of progressMarks) {
      const ground = groundToScreen(world, mark.at)
      const y = ground.y - mark.lift
      const f = Math.min(1, Math.max(0, (now - mark.startedAt) / Math.max(1, mark.endsAt - mark.startedAt)))
      bar.visible = f < 1
      if (text) text.visible = f < 1
      if (f >= 1) continue
      const w = 48
      bar.clear()
      bar.rect(-w / 2 - 2, -2, w + 4, 8).fill(0x120d0b)
      bar.rect(-w / 2, 0, w, 4).fill(0x3a2a20)
      bar.rect(-w / 2, 0, Math.round(w * f), 4).fill(mark.color)
      bar.rect(-w / 2, 0, Math.round(w * f), 1).fill({ color: 0xffffff, alpha: 0.35 })
      bar.position.set(ground.x, y)
      bar.scale.set(k)
      if (text) {
        text.position.set(ground.x, y - 4 * k)
        text.scale.set(k)
      }
    }
  })
  // The camera following something (see follow): it glides onto the target each frame.
  let followTarget: (() => Point | null) | null = null
  let followStop: (() => void) | null = null
  app.ticker.add(() => {
    if (!followTarget) return
    const p = followTarget()
    if (!p) return
    const s = groundToScreen(world, p)
    const tx = app.screen.width / 2 - s.x * camera.scale.x
    const ty = app.screen.height / 2 - s.y * camera.scale.y
    const nx = Math.round(camera.x + (tx - camera.x) * 0.2)
    const ny = Math.round(camera.y + (ty - camera.y) * 0.2)
    if (nx === camera.x && ny === camera.y) return
    camera.x = nx
    camera.y = ny
    wake()
    refresh()
  })
  app.ticker.add(() => {
    above.position.copyFrom(camera.position)
    above.scale.copyFrom(camera.scale)
    viewArea.x = -camera.x / camera.scale.x
    viewArea.y = -camera.y / camera.scale.y
    viewArea.width = app.screen.width / camera.scale.x
    viewArea.height = app.screen.height / camera.scale.y
    const hour = gameTime(clock(), 0).hour
    glow.alpha = nightness(hour)
    glow.visible = glow.alpha > 0.02
    halo.alpha = glow.alpha * 0.85
    halo.visible = glow.visible && video.glow
    shadows.update(hour, caravans.layer, viewArea)
    // Shadows painted into the ground follow the sun an hour at a time: each new hour paints the chunks again.
    // So does the snow lying on the ground, roofs and trees (weather.ts → snowCover): a few times an hour in winter.
    const sunHour = Math.floor(hour)
    const snow = coverAt(clock())
    if (snow !== paintedSnow) {
      paintedSnow = snow
      snowStructures()
    }
    if (sunHour !== paintedSunHour || snow !== chunkSnow) {
      paintedSunHour = sunHour
      chunkSnow = snow
      version++
      for (const key of chunks.keys()) staleSince.set(key, version)
      refresh()
    }
    const cam = { x: camera.x, y: camera.y, scale: camera.scale.x }
    weather.update(clock(), cam, app.screen.width, app.screen.height)
    soundscape.update(clock(), cam, app.screen.width, app.screen.height, weather.current())
    const color = weather.light(daylight(hour))
    if (color === lightColor && light.width === app.screen.width && light.height === app.screen.height) return
    lightColor = color
    light.clear().rect(0, 0, app.screen.width, app.screen.height).fill(color)
  })
  app.ticker.add(() => {
    const scale = camera.scale.x
    const time = clock()
    const seconds = time / 1000
    const view = {
      left: -camera.x / scale,
      top: -camera.y / scale,
      right: (app.screen.width - camera.x) / scale,
      bottom: (app.screen.height - camera.y) / scale,
    }
    ambient.update(seconds, view, scale)
    drawFleets(scale)
    armies.update(time, scale)
    followArmies(performance.now())
    for (const text of [...floats.children] as Text[]) {
      const age = (performance.now() - (text as Text & { born: number }).born) / 1000
      if (age > FLOAT_SECONDS) {
        text.destroy()
        continue
      }
      text.scale.set(1 / scale)
      text.alpha = Math.min(1, (FLOAT_SECONDS - age) * 2)
      text.y = (text as Text & { startY: number }).startY - (age * 28) / scale
    }
    // Zoomed far out, walkers, caravans and animals are left out but the buildings (which share their layer, to hide
    // whoever walks behind them) stay; zoomed back in, each walker's own update shows it again.
    if (scale < CARAVAN_MIN_ZOOM) {
      // Trees lifted round the armies keep the visibility of their chunk.
      for (const child of caravans.layer.children) {
        if (child.label === 'tree') continue
        child.visible = child.label === 'occluder' || child.label === 'anim' || child.label === 'inn' || (child.label === 'shade' && video.shadows) || child.label === 'ship' || child.label.startsWith('army')
      }
      return
    }
    const margin = 40
    const padded = {
      left: view.left - margin,
      top: view.top - margin,
      right: view.right + margin,
      bottom: view.bottom + margin,
    }
    caravans.update(seconds, padded)
    town.update(time, padded)
    village.update(time, padded, scale)
    updateBuilders(time / 1000, padded)
    sortWalkers()
  })

  const chunks = new Map<number, Chunk>()
  // Set once the buildings' layer exists (cullBuildings, below): the first refresh runs before it.
  let cull: ((r: ReturnType<typeof treeView>) => void) | null = null
  let visible = new Set<number>()
  let wanted: number[] = []
  let textureBytes = 0
  let zoomIndex = DEFAULT_ZOOM_INDEX
  const toTile = (screen: Point) =>
    screenToTile({ x: (screen.x - camera.x) / camera.scale.x, y: (screen.y - camera.y) / camera.scale.y })
  const lodFor = (zoom: number) => Math.min(1, zoom)

  // Loading while any visible chunk still lacks a painting at the current detail level.
  let loading: boolean | null = null
  function report() {
    const lod = lodFor(camera.scale.x)
    let missing = false
    for (const key of visible) if (chunks.get(key)?.lod !== lod) missing = true
    if (missing !== loading) onLoading((loading = missing))
  }

  function drop(key: number) {
    const chunk = chunks.get(key)
    if (!chunk) return
    textureBytes -= chunk.bytes
    chunk.sprite.destroy({ texture: true, textureSource: true })
    for (const tree of chunk.trees) tree.destroy()
    chunk.bitmap.close()
    chunks.delete(key)
  }

  // The trees are lifted out of the ground painting close up with detail animations on, and at every zoom in the chunks
  // where an army stands (and those round it), so an army in the woods walks behind the trees in front of it.
  let armyChunks = new Set<number>()
  const liftFor = (key: number, lod: number) => (detail && lod >= 1) || armyChunks.has(key)
  // The chunks next to one whose trees are lifted (they paint the trees of theirs reaching into it, or leave them).
  const nearOf = (key: number, lod: number): number[] | 'all' => {
    if (detail && lod >= 1) return 'all'
    const cx = key % chunkCount
    const cy = Math.floor(key / chunkCount)
    const out: number[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = (cy + dy) * chunkCount + cx + dx
        if ((dx || dy) && cx + dx >= 0 && cy + dy >= 0 && cx + dx < chunkCount && cy + dy < chunkCount && armyChunks.has(n)) out.push(n)
      }
    }
    return out
  }
  const nearFor = (key: number, lod: number) => String(nearOf(key, lod))
  let armyChunksAt = 0
  function followArmies(now: number) {
    if (now - armyChunksAt < 500) return
    armyChunksAt = now
    const next = new Set<number>()
    for (const p of armies.positions()) {
      for (const dy of [-4, 0, 4]) {
        for (const dx of [-4, 0, 4]) {
          const cx = Math.floor((p.x + dx) / chunkSize)
          const cy = Math.floor((p.y + dy) / chunkSize)
          if (cx >= 0 && cy >= 0 && cx < chunkCount && cy < chunkCount) next.add(cy * chunkCount + cx)
        }
      }
    }
    if (next.size === armyChunks.size && [...next].every((k) => armyChunks.has(k))) return
    armyChunks = next
    refresh()
  }

  // Each worker paints one chunk at a time, so the queue can follow the camera.
  const idle: Worker[] = []
  const jobs = new Map<number, Job>()
  let nextJob = 0
  // Structures are versioned; a chunk is stale when painted before the version that last changed it.
  let version = 0
  const staleSince = new Map<number, number>()
  const workers = Array.from(
    { length: Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 1)) },
    () => {
      const worker = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<PaintResult>) => {
        const job = jobs.get(e.data.id)!
        jobs.delete(e.data.id)
        idle.push(worker)
        const stale = job.version < (staleSince.get(job.key) ?? 0)
        const current = job.lod === lodFor(camera.scale.x) && job.lift === liftFor(job.key, job.lod) && job.near === nearFor(job.key, job.lod)
        if (current && visible.has(job.key) && !stale) show(job, e.data.bitmap, e.data.trees)
        else e.data.bitmap.close()
        // Painted before a building changed: paint it again.
        if (stale && visible.has(job.key)) wanted.unshift(job.key)
        dispatch()
        report()
      }
      worker.postMessage({ world } satisfies PaintRequest)
      idle.push(worker)
      return worker
    },
  )

  function dispatch() {
    const lod = lodFor(camera.scale.x)
    const busy = new Set(
      [...jobs.values()]
        .filter((job) => job.lod === lod && job.lift === liftFor(job.key, lod) && job.near === nearFor(job.key, lod) && job.version >= (staleSince.get(job.key) ?? 0))
        .map((job) => job.key),
    )
    while (idle.length > 0 && wanted.length > 0) {
      const key = wanted.shift()!
      if (busy.has(key)) continue
      const id = nextJob++
      const lift = liftFor(key, lod)
      const liftedNear = nearOf(key, lod)
      jobs.set(id, { key, lod, version, lift, near: String(liftedNear) })
      const sun = sunShadow(paintedSunHour + 0.5)
      const request: PaintRequest = { id, cx: key % chunkCount, cy: Math.floor(key / chunkCount), lod, lift, sun, liftedNear, snow: chunkSnow }
      idle.pop()!.postMessage(request)
    }
  }

  function show({ key, lod, version, lift, near }: Job, bitmap: ImageBitmap, lifted?: LiftedTree[]) {
    const cx = key % chunkCount
    const cy = Math.floor(key / chunkCount)
    drop(key)
    const sprite = new Sprite(new Texture({ source: new ImageSource({ resource: bitmap, scaleMode: 'nearest' }) }))
    sprite.x = (cx - cy) * chunkSize * (TILE_WIDTH / 2) - (chunkSize * TILE_WIDTH) / 2
    sprite.y = (cx + cy) * chunkSize * (TILE_HEIGHT / 2) - CHUNK_PAD
    sprite.scale.set(1 / lod)
    // Chunks further back are drawn first, so raised ground and trees overlap the chunk behind them.
    sprite.zIndex = cx + cy
    ground.addChild(sprite)
    const bytes = bitmap.width * bitmap.height * 4
    textureBytes += bytes
    const treeRect = treeView()
    const trees = (lifted ?? []).map((t) => {
      const look = snowOf(SPRITES[t.set][t.index], chunkSnow)
      const tree = new Sprite(textureOf(look))
      tree.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
      const at = groundToScreen(world, { x: t.tx, y: t.ty })
      tree.position.set(at.x, at.y)
      // Trees lifted out of the ground painting to sway stand with the walkers, animals and buildings, sorted by
      // where they meet the ground, so a deer in the woods walks behind the trees in front of it.
      tree.zIndex = at.y
      tree.label = 'tree'
      tree.visible = treeShown(tree, treeRect)
      caravans.layer.addChild(tree)
      return tree
    })
    chunks.set(key, { sprite, bitmap, lod, bytes, version, trees, lift, near })
  }

  // A chunk is far bigger than the screen, so the swaying trees of the chunks in view are culled one by one as well
  // (CLAUDE.md §12): two thirds of them were off screen, yet sorted, batched and shadowed every frame. A tree stands
  // up from its foot and its shadow falls to the right and down (long at dawn), hence the uneven margins.
  const TREE_MARGIN = { left: 320, right: 160, top: 160, bottom: 320 }
  function treeView() {
    const k = camera.scale.x
    return {
      left: -camera.x / k - TREE_MARGIN.left,
      right: (app.screen.width - camera.x) / k + TREE_MARGIN.right,
      top: -camera.y / k - TREE_MARGIN.top,
      bottom: (app.screen.height - camera.y) / k + TREE_MARGIN.bottom,
    }
  }
  const treeShown = (tree: Sprite, v: ReturnType<typeof treeView>) => tree.x >= v.left && tree.x <= v.right && tree.y >= v.top && tree.y <= v.bottom

  // The middle of the screen stays over the map (a little way into the mountains that ring it, no further), so the
  // camera cannot wander off into the dark.
  const EDGE_TILES = 24
  function keepInside() {
    const { width, height } = app.screen
    const wx = (width / 2 - camera.x) / camera.scale.x
    const wy = (height / 2 - camera.y) / camera.scale.y
    // The ground point under the middle of the screen, on flat ground.
    const a = wx / (TILE_WIDTH / 2)
    const b = wy / (TILE_HEIGHT / 2)
    const tx = (a + b) / 2
    const ty = (b - a) / 2
    const cx = Math.min(world.size - EDGE_TILES, Math.max(EDGE_TILES, tx))
    const cy = Math.min(world.size - EDGE_TILES, Math.max(EDGE_TILES, ty))
    if (cx === tx && cy === ty) return
    const s = tileToScreen({ x: cx, y: cy })
    camera.x = Math.round(width / 2 - s.x * camera.scale.x)
    camera.y = Math.round(height / 2 - s.y * camera.scale.y)
  }

  // The last camera view reported, rounded to tiles, so a pan of a pixel does not re-render the page.
  let cameraKey = ''
  function refresh() {
    keepInside()
    const { width, height } = app.screen
    // Raised ground from below the screen's bottom edge can reach into view.
    const reach = height + CHUNK_PAD * camera.scale.y
    const corners = [toTile({ x: 0, y: 0 }), toTile({ x: width, y: 0 }), toTile({ x: 0, y: reach }), toTile({ x: width, y: reach })]
    const clamp = (v: number) => Math.min(chunkCount - 1, Math.max(0, Math.floor(v / chunkSize)))
    const x0 = clamp(Math.min(...corners.map((c) => c.x)))
    const x1 = clamp(Math.max(...corners.map((c) => c.x)))
    const y0 = clamp(Math.min(...corners.map((c) => c.y)))
    const y1 = clamp(Math.max(...corners.map((c) => c.y)))
    const lod = lodFor(camera.scale.x)
    const middle = toTile({ x: width / 2, y: height / 2 })

    visible = new Set()
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // The screen is a diamond in tile space; skip chunks in the bounding box that fall outside it.
        const left = (cx - cy - 1) * chunkSize * (TILE_WIDTH / 2) * camera.scale.x + camera.x
        const right = (cx - cy + 1) * chunkSize * (TILE_WIDTH / 2) * camera.scale.x + camera.x
        const top = ((cx + cy) * chunkSize * (TILE_HEIGHT / 2) - CHUNK_PAD) * camera.scale.y + camera.y
        const bottom = (cx + cy + 2) * chunkSize * (TILE_HEIGHT / 2) * camera.scale.y + camera.y
        if (right < 0 || left > width || bottom < 0 || top > height) continue
        visible.add(cy * chunkCount + cx)
      }
    }
    const distance = (key: number) =>
      Math.hypot(
        ((key % chunkCount) + 0.5) * chunkSize - middle.x,
        (Math.floor(key / chunkCount) + 0.5) * chunkSize - middle.y,
      )
    wanted = [...visible]
      .filter((key) => chunks.get(key)?.lod !== lod || chunks.get(key)!.lift !== liftFor(key, lod) || chunks.get(key)!.near !== nearFor(key, lod) || (staleSince.get(key) ?? 0) > chunks.get(key)!.version)
      .sort((a, b) => distance(a) - distance(b))
    const treeRect = treeView()
    for (const [key, chunk] of chunks) {
      chunk.sprite.visible = visible.has(key)
      for (const tree of chunk.trees) tree.visible = chunk.sprite.visible && treeShown(tree, treeRect)
      if (!chunk.sprite.visible && textureBytes > TEXTURE_BUDGET_BYTES) drop(key)
    }
    cull?.(treeRect)
    dispatch()
    report()
    const view = [middle, toTile({ x: 0, y: 0 }), toTile({ x: width, y: 0 }), toTile({ x: width, y: height }), toTile({ x: 0, y: height })]
    const key = view.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')
    if (key !== cameraKey) {
      cameraKey = key
      onCamera(middle, view.slice(1))
    }
  }

  function centerOn(tile: Point) {
    wake()
    const s = groundToScreen(world, tile)
    camera.x = Math.round(app.screen.width / 2 - s.x * camera.scale.x)
    camera.y = Math.round(app.screen.height / 2 - s.y * camera.scale.y)
    refresh()
  }

  // Screen points of a path over the ground, following its height one tile at a time.
  // Flat screen points along the corners, draped over the ground; back to the first corner unless `closed` is false.
  const drape = (corners: Point[], closed = true) => [
    ...corners.slice(0, closed ? corners.length : corners.length - 1).flatMap((from, i) => {
      const to = corners[(i + 1) % corners.length]
      const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y)))
      return Array.from({ length: steps }, (_, n) => {
        const p = groundToScreen(world, {
          x: from.x + ((to.x - from.x) * n) / steps,
          y: from.y + ((to.y - from.y) * n) / steps,
        })
        return [p.x, p.y]
      }).flat()
    }),
    ...(closed ? [] : (({ x, y }) => [x, y])(groundToScreen(world, corners[corners.length - 1]))),
  ]
  const square = (x: number, y: number, size: number) =>
    drape([{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }])

  // A dashed border: whole dashes along the draped outline, a fixed length on screen.
  // A closed dashed border along flat [x, y, x, y, …] points, a fixed dash length on screen.
  function dashed(g: Graphics, border: number[]) {
    const points = []
    for (let k = 0; k < border.length; k += 2) points.push({ x: border[k], y: border[k + 1] })
    dashes(points, DASH / camera.scale.x, GAP / camera.scale.x, true, (x0, y0, x1, y1) => g.moveTo(x0, y0).lineTo(x1, y1))
  }

  // The stretches of `r`'s border that bound the union of `r` and `other`: whole tile edges whose outer tile is not in
  // `other`, joined into runs of corners (one closed loop when nothing is left out). Two overlapping areas so read as
  // one, with no line through where they meet.
  function borderOutside(r: Rect, other: Rect | null): { corners: Point[]; closed: boolean }[] {
    const inOther = (x: number, y: number) => !!other && x >= other.x && y >= other.y && x < other.x + other.size && y < other.y + other.size
    // Clockwise unit edges: each from a corner to the next, with the tile just outside it.
    const edges: { from: Point; to: Point; out: Point }[] = []
    for (let i = 0; i < r.size; i++) edges.push({ from: { x: r.x + i, y: r.y }, to: { x: r.x + i + 1, y: r.y }, out: { x: r.x + i, y: r.y - 1 } })
    for (let i = 0; i < r.size; i++) edges.push({ from: { x: r.x + r.size, y: r.y + i }, to: { x: r.x + r.size, y: r.y + i + 1 }, out: { x: r.x + r.size, y: r.y + i } })
    for (let i = r.size - 1; i >= 0; i--) edges.push({ from: { x: r.x + i + 1, y: r.y + r.size }, to: { x: r.x + i, y: r.y + r.size }, out: { x: r.x + i, y: r.y + r.size } })
    for (let i = r.size - 1; i >= 0; i--) edges.push({ from: { x: r.x, y: r.y + i + 1 }, to: { x: r.x, y: r.y + i }, out: { x: r.x - 1, y: r.y + i } })
    const kept = edges.map((e) => !inOther(e.out.x, e.out.y))
    if (kept.every(Boolean)) return [{ corners: [{ x: r.x, y: r.y }, { x: r.x + r.size, y: r.y }, { x: r.x + r.size, y: r.y + r.size }, { x: r.x, y: r.y + r.size }], closed: true }]
    // Start right after a left-out edge, so no run is split across the start of the list.
    const start = kept.indexOf(false) + 1
    const runs: { corners: Point[]; closed: boolean }[] = []
    let run: Point[] | null = null
    for (let k = 0; k < edges.length; k++) {
      const i = (start + k) % edges.length
      if (!kept[i]) {
        run = null
        continue
      }
      if (!run) runs.push({ corners: (run = [edges[i].from]), closed: false })
      run.push(edges[i].to)
    }
    return runs
  }
  // An open (or closed) line along tile corners, draped over the ground, as a dashed border.
  function dashedRun(g: Graphics, run: { corners: Point[]; closed: boolean }) {
    const flat = drape(run.corners, run.closed)
    const points: Point[] = []
    for (let k = 0; k < flat.length; k += 2) points.push({ x: flat[k], y: flat[k + 1] })
    dashes(points, DASH / camera.scale.x, GAP / camera.scale.x, run.closed, (x0, y0, x1, y1) => g.moveTo(x0, y0).lineTo(x1, y1))
  }

  // Overlay lines keep their screen thickness at every zoom level, so they are redrawn when it changes.
  let claimed: [Rect | null, Plots, string | undefined, Point | undefined, number | undefined] = [null, { dock: null, trade: null }, undefined, undefined, undefined]
  // A kingdom's name stands over its palace, just above the top of the palace as drawn; without a palace yet, over
  // the middle of its territory.
  let palaces: { x: number; y: number; size: number; top: number }[] = []
  const nameAt = (rect: Rect, palace: Point | undefined) => {
    const p = palace && palaces.find((q) => palace.x >= q.x && palace.y >= q.y && palace.x < q.x + q.size && palace.y < q.y + q.size)
    if (p) {
      const middle = groundToScreen(world, { x: p.x + p.size / 2, y: p.y + p.size / 2 })
      return { x: middle.x, y: p.top - 14 / camera.scale.y }
    }
    const middle = groundToScreen(world, { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 })
    return { x: middle.x, y: middle.y - 24 / camera.scale.y }
  }
  function setTerritory(rect: Rect | null, plots: Plots, name?: string, palace?: Point, banner?: number) {
    claimed = [rect, plots, name, palace, banner]
    territory.clear()
    for (const text of Object.values(plotLabels)) text.visible = false
    kingdomLabel.visible = false
    kingdomBanner?.destroy()
    kingdomBanner = null
    if (!rect) return
    if (name && camera.scale.x <= NAME_MAX_ZOOM) {
      kingdomLabel.text = name
      const at = nameAt(rect, palace)
      kingdomLabel.position.set(at.x, at.y)
      kingdomLabel.scale.set(1 / camera.scale.x)
      kingdomLabel.visible = true
      if (banner !== undefined) {
        kingdomBanner = crownBanner(banner)
        besideName(kingdomBanner, kingdomLabel)
        above.addChild(kingdomBanner)
      }
    }
    const thick = 3 / camera.scale.x
    const outline = (r: Rect) => square(r.x, r.y, r.size)
    const line = (from: Point, to: Point) => {
      const points = drape([from, to])
      territory.moveTo(points[0], points[1])
      for (let i = 2; i < points.length; i += 2) territory.lineTo(points[i], points[i + 1])
    }
    const parcel = balance.territory.parcelTiles
    for (let i = parcel; i < rect.size; i += parcel) {
      line({ x: rect.x + i, y: rect.y }, { x: rect.x + i, y: rect.y + rect.size })
      line({ x: rect.x, y: rect.y + i }, { x: rect.x + rect.size, y: rect.y + i })
    }
    territory.stroke({ width: 1 / camera.scale.x, color: 0xffffff, alpha: 0.1 })
    // The territory and the ground beside a dock plot outside it read as one area: each draws only its border outside
    // the other.
    for (const run of borderOutside(rect, plots.annex ?? null)) dashedRun(territory, run)
    territory.stroke({ width: thick, color: TERRITORY, alpha: 0.5, cap: 'butt' })
    if (plots.annex) {
      for (const run of borderOutside(plots.annex, rect)) dashedRun(territory, run)
      territory.stroke({ width: thick, color: DOCK_PLOT, alpha: 0.6, cap: 'butt' })
    }
    for (const [key, color] of [['dock', DOCK_PLOT], ['trade', TRADE_PLOT]] as const) {
      const plot = plots[key]
      if (!plot) continue
      const points = outline(plot)
      territory.poly(points).fill({ color, alpha: 0.45 }).stroke({ width: thick, color })
      // Above the outline's top corner.
      let top = 1
      for (let i = 3; i < points.length; i += 2) if (points[i] < points[top]) top = i
      const text = plotLabels[key]
      text.position.set(points[top - 1], points[top] - 4 / camera.scale.y)
      text.scale.set(1 / camera.scale.x)
      text.visible = true
    }
  }

  let rivals: RivalTerritory[] = []
  function setRivals(next: RivalTerritory[]) {
    rivals = next
    rivalLines.clear()
    for (const text of rivalLabels.removeChildren()) text.destroy()
    const thick = 3 / camera.scale.x
    for (const rival of rivals) {
      dashed(rivalLines, square(rival.rect.x, rival.rect.y, rival.rect.size))
      rivalLines.stroke({ width: thick, color: rival.color, alpha: 0.8, cap: 'butt' })
      if (camera.scale.x > NAME_MAX_ZOOM) continue
      const text = nameLabel(rival.color)
      text.text = rival.name
      const at = nameAt(rival.rect, rival.palace)
      text.position.set(at.x, at.y)
      text.scale.set(1 / camera.scale.x)
      rivalLabels.addChild(text)
      if (rival.banner !== undefined) {
        const flag = crownBanner(rival.banner)
        besideName(flag, text)
        rivalLabels.addChild(flag)
      }
    }
    // The free cities' names stand over their walls when zoomed out.
    if (camera.scale.x > CITY_NAME_MAX_ZOOM) return
    world.cities.forEach((_, index) => {
      const info = cityInfo(world, index)
      // The crown's colour, lifted a little so it reads against the dark outline.
      const c = parseInt(info.color.slice(1), 16)
      const lift = (v: number) => Math.round(v + (255 - v) * 0.22)
      const text = nameLabel((lift(c >> 16) << 16) | (lift((c >> 8) & 255) << 8) | lift(c & 255), 30)
      text.text = info.name.toLocaleUpperCase(locale())
      const middle = groundToScreen(world, cityHall(index))
      text.position.set(middle.x, middle.y - 110 - 14 / camera.scale.y)
      text.scale.set(1 / camera.scale.x)
      rivalLabels.addChild(text)
    })
  }
  const cityHall = (index: number) => {
    const c = world.cities[index]
    return { x: c.x + balance.cities.size / 2, y: c.y + balance.cities.size / 2 }
  }

  // Steps to a zoom level, keeping the ground under the given screen point fixed.
  // The canvas's density follows the zoom and the sharp drawing setting (see canvasResolution).
  const fitResolution = () => {
    const resolution = canvasResolution(video.sharp, camera.scale.x)
    if (app.renderer.resolution === resolution) return
    app.renderer.resolution = resolution
    app.resize()
  }
  const zoomTo = (index: number, at: Point) => {
    index = Math.min(ZOOMS.length - 1, Math.max(0, index))
    if (index === zoomIndex) return
    wake()
    const factor = ZOOMS[index] / camera.scale.x
    zoomIndex = index
    camera.x = Math.round(at.x - (at.x - camera.x) * factor)
    camera.y = Math.round(at.y - (at.y - camera.y) * factor)
    camera.scale.set(ZOOMS[index])
    fitResolution()
    clearCursor()
    highlight.visible = false
    onHover(null)
    setTerritory(...claimed)
    setRivals(rivals)
    refresh()
  }

  // The pointer picks the ground it is drawn over, which on a slope is not the flat tile under it.
  const pick = (at: Point) => {
    const ground = screenToGround(world, {
      x: (at.x - camera.x) / camera.scale.x,
      y: (at.y - camera.y) / camera.scale.y,
    })
    const tile = { x: Math.floor(ground.x), y: Math.floor(ground.y) }
    const inside = tile.x >= 0 && tile.y >= 0 && tile.x < world.size && tile.y < world.size
    clearCursor()
    highlight.visible = false
    pickedBuilding = undefined
    pickedLord = undefined
    pickedInn = undefined
    pickedCity = undefined
    if (!inside) {
      pointWith(null)
      return onHover(null)
    }
    const i = tile.y * world.size + tile.x
    // A building is picked by the pixels it covers on screen, nearest first, not by the ground behind its roof.
    const wx = (at.x - camera.x) / camera.scale.x
    const wy = (at.y - camera.y) / camera.scale.y
    const hit = placement && tool !== 'move'
      ? undefined
      : hits.find(({ sprite, sx, sy, owner, inn, city, cave }) => {
          // Other kingdoms' buildings, the inns, the caves and the free cities only show what they are, never while
          // tearing down or moving.
          if ((owner || inn || city || cave) && tool) return false
          const px = Math.floor(wx - sx + sprite.anchorX)
          const py = Math.floor(wy - sy + sprite.anchorY)
          return px >= 0 && py >= 0 && px < sprite.width && py < sprite.height && sprite.pixels[py * sprite.width + px] >>> 24 === 0xff
        })
    // A capital's or a town's whole ground is outlined while the pointer is anywhere over it, lying on the slope.
    const outlineArea = (r: Rect) =>
      cursor
        .poly(square(r.x, r.y, r.size))
        .fill({ color: HOVER, alpha: 0.06 })
        .stroke({ width: 3 / camera.scale.x, color: HOVER, alpha: 0.9 })
    const townUnder = placement || tool ? undefined : townMarks.find(({ mark: { rect: r } }) => r && tile.x >= r.x && tile.y >= r.y && tile.x < r.x + r.size && tile.y < r.y + r.size)
    // The pointer's hand carries what it is over: an army's swords, a field's sheaf, an inn's sign… (lib/cursors.ts).
    if (!placement && !tool) {
      const armyUnder = armies.pick({ x: wx, y: wy })
      const shipUnder = armyUnder === undefined && !hit ? ambient.pickShip({ x: wx, y: wy }) : null
      const cityUnder = armyUnder === undefined && !hit && (cityAt(world, tile) ?? cityAreaAt(world, tile)) !== undefined
      pointWith(armyUnder !== undefined ? 'swords' : hit ? (hit.icon ?? null) : shipUnder ? 'ship' : townUnder ? 'banner' : cityUnder ? 'crown' : null)
    }
    if (hit) {
      if (hit.city) outlineArea(cityArea(world, hit.id))
      else if (townUnder) outlineArea(townUnder.mark.rect!)
      const ring = outlineOf(hit.sprite)
      highlight.texture = textureOf(ring)
      highlight.anchor.set(ring.anchorX / ring.width, ring.anchorY / ring.height)
      highlight.position.set(hit.sx, hit.sy)
      highlight.tint = hit.owner?.tint ?? toolTint()
      highlight.visible = true
      const top = { x: camera.x + hit.sx * camera.scale.x, y: camera.y + (hit.sy - hit.sprite.anchorY + contentTop(hit.sprite)) * camera.scale.y }
      if (hit.city) {
        pickedCity = hit.id
        onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y), city: { index: hit.id, screen: top } })
        return tile
      }
      if (hit.cave) {
        // The tile its mouth opens onto: a tap there opens the cave's sheet, an army sent there stands before it.
        const c = caveSpots(world, world.seed)[hit.id]
        const mouth = { x: Math.floor(c.mouth.x), y: Math.floor(c.mouth.y) }
        const j = mouth.y * world.size + mouth.x
        onHover({ tile: mouth, terrain: world.terrain[j], feature: world.feature[j], rule: tileRule(world, mouth.x, mouth.y) })
        return mouth
      }
      if (hit.inn) {
        pickedInn = hit.id
        onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y), inn: { index: hit.id, screen: top } })
        return tile
      }
      if (!hit.owner) pickedBuilding = hit.id
      else pickedLord = hit.owner.kingdom
      const building = { id: hit.id, screen: top, ...(hit.owner && { owner: hit.owner.kingdom }) }
      onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y), building })
      return tile
    }
    // The streets and yards of a free city (out to its outer wall) name the city too.
    const city = placement || tool ? undefined : (cityAt(world, tile) ?? cityAreaAt(world, tile))
    if (city !== undefined) {
      outlineArea(cityArea(world, city))
      pickedCity = city
      const ground = groundToScreen(world, { x: tile.x + 0.5, y: tile.y + 0.5 })
      const screen = { x: camera.x + ground.x * camera.scale.x, y: camera.y + (ground.y - 24) * camera.scale.y }
      onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y), city: { index: city, screen } })
      return tile
    }
    if (townUnder) {
      outlineArea(townUnder.mark.rect!)
      onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y) })
      return tile
    }
    if (placement) {
      const p = placement
      const ghost = (origin: Point) => {
        const color = p.valid(origin) ? GHOST_OK : GHOST_BAD
        if (p.carry) {
          for (const part of structureParts(world, { ...p.carry, ...origin })) {
            const sprite = new Sprite(textureOf(part.sprite))
            sprite.anchor.set(part.sprite.anchorX / part.sprite.width, part.sprite.anchorY / part.sprite.height)
            sprite.position.set((part.fx - part.fy) * (TILE_WIDTH / 2), (part.fx + part.fy) * (TILE_HEIGHT / 2) - part.z)
            carried.addChild(sprite)
          }
        }
        for (const t of [origin, ...(p.extra?.(origin) ?? [])]) {
          cursor
            .poly(square(t.x, t.y, t === origin ? p.size : 1))
            .fill({ color, alpha: 0.3 })
            .stroke({ width: 2 / camera.scale.x, color, alpha: 0.95 })
        }
      }
      const row = stroke?.spots ?? p.pinnedMany
      if (row) row.forEach(ghost)
      else ghost(p.pinned ?? footprintOrigin(tile, p.size))
    } else {
      // The tile grid is not drawn; only the tile under the pointer is outlined, lying on the slope: plainly while a
      // destination is being picked, and as a faint ghost while just looking round the map.
      const picking = targeting || tool
      cursor
        .poly(square(tile.x, tile.y, 1))
        .fill({ color: HOVER, alpha: picking ? 0.12 : 0.03 })
        .stroke({ width: 2 / camera.scale.x, color: HOVER, alpha: picking ? 0.9 : 0.16 })
    }
    onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y) })
    return tile
  }
  let placement: Placement | null = null
  let tool: MapTool = null
  let targeting = false
  // The map's pointer: the gauntlet, with the icon of what it is over; the tools keep their own cursors.
  let pointing: IconName | null | undefined
  const pointWith = (icon: IconName | null) => {
    if (tool || icon === pointing) return
    pointing = icon
    app.canvas.style.cursor = handCursor(icon)
  }
  app.canvas.style.cursor = handCursor(null)
  const toolTint = () => (tool === 'demolish' ? DEMOLISH_HIGHLIGHT : tool === 'move' ? MOVE_HIGHLIGHT : HIGHLIGHT)
  // A row being drawn by dragging: where it began and the footprints along it so far.
  let stroke: { start: Point; spots: Point[] } | null = null
  // The tile under a screen point (the ground drawn there, as pick takes it).
  const tileAt = (at: Point) => {
    const ground = screenToGround(world, { x: (at.x - camera.x) / camera.scale.x, y: (at.y - camera.y) / camera.scale.y })
    return { x: Math.floor(ground.x), y: Math.floor(ground.y) }
  }
  // Footprints of `size` from one origin to another in a straight row, one footprint apart.
  const rowOf = (from: Point, to: Point, size: number) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const n = Math.max(Math.abs(dx), Math.abs(dy))
    if (n === 0) return [from]
    const spots: Point[] = []
    for (let d = 0; d <= n; d += size) {
      const p = { x: from.x + Math.round((dx * d) / n), y: from.y + Math.round((dy * d) / n) }
      if (!spots.some((q) => q.x === p.x && q.y === p.y)) spots.push(p)
    }
    return spots
  }
  let pickedBuilding: number | undefined
  let pickedLord: number | undefined
  let pickedInn: number | undefined
  let pickedCity: number | undefined
  let lastPointer: Point | null = null

  // One finger (or the mouse) drags; two fingers pinch to zoom (snapping to the zoom steps, like the wheel) and move the
  // map with their midpoint. A press that barely moves is a tap: on touch screens only a tap picks a tile, so panning
  // the map never changes the selection, and a touch that ever had two fingers is never a tap.
  const touches = new Map<number, Point>()
  let pinch: { distance: number; index: number; mid: Point } | null = null
  const twoFingers = () => {
    const [a, b] = [...touches.values()]
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  let press: { start: Point; camera: Point; moved: boolean } | null = null
  // A right button press (the mouse only): it never drags the map; released where it was pressed, it is a right tap.
  let rightPress: Point | null = null
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', (e) => {
    wake()
    if (e.button === 2) {
      // Only on the map itself, not over a panel on top of it.
      rightPress = e.nativeEvent.target === app.canvas ? { x: e.global.x, y: e.global.y } : null
      return
    }
    // Only the main mouse button drags, taps and picks; the right (and middle) button is left to its own handlers.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    touches.set(e.pointerId, { x: e.global.x, y: e.global.y })
    if (touches.size > 1) {
      // A multi-finger touch is never a tap, even after the other fingers lift.
      if (press) press.moved = true
      if (touches.size === 2 && !stroke) {
        const { distance, mid } = twoFingers()
        pinch = { distance, index: zoomIndex, mid }
        if (followTarget) {
          followTarget = null
          followStop?.()
          followStop = null
        }
      }
      return
    }
    press = { start: { x: e.global.x, y: e.global.y }, camera: { x: camera.x, y: camera.y }, moved: false }
    // Placing a stroke kind: the press starts a row instead of dragging the map.
    if (placement?.stroke && !placement.pinnedMany) {
      const origin = footprintOrigin(tileAt(press.start), placement.size)
      stroke = { start: origin, spots: [origin] }
      pick(press.start)
    }
  })
  const release = (e: FederatedPointerEvent) => {
    if (e.button === 2) {
      const from = rightPress
      rightPress = null
      if (from && e.type === 'pointerup' && Math.hypot(e.global.x - from.x, e.global.y - from.y) <= TAP_SLOP) {
        const tile = tileAt({ x: e.global.x, y: e.global.y })
        if (tile.x >= 0 && tile.y >= 0 && tile.x < world.size && tile.y < world.size) onRightTap?.(tile)
      }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    if (touches.size > 0) {
      // Out of a pinch with one finger still down: it drags on from where it is, without a jump.
      if (touches.size === 1 && press) {
        const [rest] = [...touches.values()]
        press = { start: { ...rest }, camera: { x: camera.x, y: camera.y }, moved: true }
      }
      return
    }
    if (stroke) {
      const spots = stroke.spots
      stroke = null
      press = null
      if (e.type === 'pointerup') onStroke?.(spots)
      return
    }
    if (press && !press.moved && e.type === 'pointerup') {
      const tile = pick({ x: e.global.x, y: e.global.y })
      const at = { x: (e.global.x - camera.x) / camera.scale.x, y: (e.global.y - camera.y) / camera.scale.y }
      const army = placement ? undefined : armies.pick(at)
      // A ship is picked only off the buildings and armies (it lies on the water, under nothing else of the player's).
      const ship = placement || army !== undefined || pickedBuilding !== undefined ? null : ambient.pickShip(at)
      if (tile) onTap(tile, army === undefined ? pickedBuilding : undefined, army, army === undefined ? pickedInn : undefined, army === undefined ? pickedCity : undefined, ship ?? undefined, army === undefined ? pickedLord : undefined)
    }
    press = null
  }
  app.stage.on('pointerup', release)
  app.stage.on('pointerupoutside', release)
  app.stage.on('pointercancel', release)
  // The pointer leaving the map for a window or panel on top of it: nothing on the map stays pointed at.
  const leaveMap = () => {
    if (press || stroke || touches.size > 0) return
    highlight.visible = false
    clearCursor()
    onHover(null)
    lastPointer = null
  }
  app.canvas.addEventListener('pointerleave', leaveMap)
  // No browser context menu over the map (right-click is a game action there); HUD panels keep theirs.
  const noContextMenu = (e: MouseEvent) => e.preventDefault()
  app.canvas.addEventListener('contextmenu', noContextMenu)
  app.stage.on('pointermove', (e) => {
    // Pixi replays a still pointer's last move now and then (untrusted): only a real move counts as the player's.
    if ((e.nativeEvent as Event).isTrusted !== false && (e.nativeEvent.target === app.canvas || press || touches.size > 0)) wake()
    // Pixi hears the pointer over the whole page: over a window or panel on top of the map nothing on the map is
    // pointed at (no outline, no label), unless a drag on the map is under way.
    if (e.nativeEvent.target !== app.canvas && !press && !stroke && touches.size === 0) {
      if (highlight.visible || lastPointer) {
        highlight.visible = false
        clearCursor()
        onHover(null)
        lastPointer = null
      }
      return
    }
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.global.x, y: e.global.y })
    if (stroke && placement) {
      const end = footprintOrigin(tileAt({ x: e.global.x, y: e.global.y }), placement.size)
      stroke.spots = rowOf(stroke.start, end, placement.size)
      pick({ x: e.global.x, y: e.global.y })
      return
    }
    if (pinch && touches.size === 2 && touches.has(e.pointerId)) {
      const { distance, mid } = twoFingers()
      // The map follows the fingers' midpoint, and zooms to the step nearest the fingers' spread.
      camera.x = Math.round(camera.x + mid.x - pinch.mid.x)
      camera.y = Math.round(camera.y + mid.y - pinch.mid.y)
      pinch.mid = mid
      const want = Math.log(ZOOMS[pinch.index] * (distance / pinch.distance))
      let index = zoomIndex
      for (let i = 0; i < ZOOMS.length; i++) if (Math.abs(Math.log(ZOOMS[i]) - want) < Math.abs(Math.log(ZOOMS[index]) - want)) index = i
      if (index !== zoomIndex) zoomTo(index, mid)
      else refresh()
      return
    }
    if (press && touches.size === 1) {
      const dx = e.global.x - press.start.x
      const dy = e.global.y - press.start.y
      if (!press.moved && Math.hypot(dx, dy) > TAP_SLOP) {
        press.moved = true
        // Dragging the map lets go of whatever the camera was following.
        if (followTarget) {
          followTarget = null
          followStop?.()
          followStop = null
        }
      }
      if (press.moved) {
        camera.x = Math.round(press.camera.x + dx)
        camera.y = Math.round(press.camera.y + dy)
        refresh()
      }
    }
    // The mouse highlights whatever it is over; a finger has no hover.
    if (e.pointerType === 'mouse') {
      lastPointer = { x: e.global.x, y: e.global.y }
      pick(lastPointer)
    }
  })

  let wheel = 0
  let lastStep = 0
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    wake()
    if (performance.now() - lastStep < WHEEL_COOLDOWN_MS) return
    wheel += e.deltaY
    if (Math.abs(wheel) < WHEEL_STEP) return
    const step = wheel < 0 ? 1 : -1
    wheel = 0
    lastStep = performance.now()
    const rect = app.canvas.getBoundingClientRect()
    zoomTo(zoomIndex + step, { x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })
  app.renderer.on('resize', () => {
    wake()
    refresh()
  })

  centerOn({ x: world.size / 2, y: world.size / 2 })

  // Buildings are painted into the ground, which lies below every walker. Each one also gets a copy in the walker
  // layer: anyone behind a building is sorted under that copy, and anyone whose feet are inside it is hidden.
  interface Occluder {
    x: number
    y: number
    size: number
    // Screen position of the front corner, and the box the sprite covers.
    sx: number
    sy: number
    left: number
    right: number
    top: number
    // Ground height under the building's middle.
    lift: number
    sprite: Sprite
    // Its pixels, and the order it is drawn in (later ones cover earlier ones).
    look: Sprite_
    depth: number
    // Walked over (what stands on a field): walkers on it are not hidden.
    walked: boolean
    // A gate's looks, closed and open; it opens while someone is in or right by its gateway.
    gate?: { closed: Sprite_; open: Sprite_ }
  }
  let occluders: Occluder[] = []
  // The buildings in view take the snow lying now (their snowy looks are made once each; see sprites.ts → snowOf).
  function snowStructures() {
    for (const o of occluders) o.sprite.texture = textureOf(snowOf(o.look, paintedSnow))
  }
  // Window lights cut to what the buildings in front leave visible, made anew with the buildings.
  let masked: Sprite_[] = []
  const solid = new Set<number>()
  const gates = new Set<number>()
  // Lit windows of the player's buildings, in the glow layer.
  let windows: Sprite[] = []
  // The moving parts of buildings (see buildingKit → animate): a sprite over each, its frames stepped by the clock.
  interface Moving {
    sprite: Sprite
    anim: Anim
    frames: Texture[]
    phase: number
    frame: number
  }
  let moving: Moving[] = []
  function addMoving(anim: Anim, x: number, y: number, z: number, seed: number, layer: Container) {
    const first = anim.frames[0]
    const sprite = new Sprite(textureOf(first))
    sprite.anchor.set(first.anchorX / first.width, first.anchorY / first.height)
    sprite.position.set(x, y)
    sprite.zIndex = z
    sprite.label = 'anim'
    layer.addChild(sprite)
    moving.push({ sprite, anim, frames: anim.frames.map((s) => textureOf(s)), phase: hash(seed, 7, 911) * anim.frames.length, frame: 0 })
  }
  app.ticker.add(() => {
    if (moving.length === 0) return
    const scale = camera.scale.x
    const on = detail && scale >= 0.5
    const t = performance.now() / 1000
    const left = -camera.x / scale - 160
    const top = -camera.y / scale - 160
    const right = (app.screen.width - camera.x) / scale + 160
    const bottom = (app.screen.height - camera.y) / scale + 160
    for (const m of moving) {
      const { x, y } = m.sprite.position
      if (on && (x < left || x > right || y < top || y > bottom)) continue
      const k = on ? Math.floor(t * m.anim.fps + m.phase) % m.frames.length : 0
      if (k === m.frame) continue
      m.frame = k
      const look = m.anim.frames[k]
      m.sprite.texture = m.frames[k]
      m.sprite.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
    }
  })
  // Buildings off screen (with the trees' margins, for their long shadows) are left out of the drawing (Pixi's
  // `culled`, apart from `visible`, which other code sets): a full lobby has thousands of them, every one gathered,
  // batched and sent to the GPU each frame though few are on screen (CLAUDE.md §12). Their moving parts and lit windows
  // alike; the shadows follow their casters (shadows.ts).
  function cullBuildings(r: ReturnType<typeof treeView>) {
    for (const o of occluders) o.sprite.culled = o.right < r.left || o.left > r.right || o.sy < r.top || o.top > r.bottom
    const off = (c: Container) => c.x < r.left || c.x > r.right || c.y < r.top || c.y > r.bottom + 160
    for (const m of moving) m.sprite.culled = off(m.sprite)
    for (const w of windows) w.culled = off(w)
  }
  cull = cullBuildings
  function placeOccluders(structures: Structure[]) {
    for (const m of moving) m.sprite.destroy()
    moving = []
    for (const o of occluders) o.sprite.destroy()
    for (const w of windows) w.destroy()
    windows = []
    for (const m of masked) freeTexture(m)
    masked = []
    const lights: { lit: Sprite_; sx: number; sy: number; depth: number }[] = []
    let order = 0
    solid.clear()
    gates.clear()
    const chimneys: { x: number; y: number; depth: number }[] = []
    occluders = structures.flatMap((s) => {
      const parts = structureParts(world, s)
      // Moving crops lie on the ground, under the shadows.
      for (const part of parts) {
        const anim = animOf(part.sprite)
        if (anim?.ground) addMoving(anim, (part.fx - part.fy) * (TILE_WIDTH / 2), (part.fx + part.fy) * (TILE_HEIGHT / 2) - part.z, 0, s.x * 977 + s.y, fields)
      }
      const solidParts = parts.filter((p) => p.solid || p.stands)
      if (solidParts.length === 0) return []
      const blocking = parts.some((p) => p.solid)
      // Gates and broken stretches of wall stand in the way of animals but let the townsfolk through.
      const through = s.look === 'gate' || s.look === 'gateY' || s.look === 'brokenWall'
      for (let y = s.y; y < s.y + s.size; y++) {
        for (let x = s.x; x < s.x + s.size; x++) {
          if (blocking) solid.add(y * world.size + x)
          if (through) gates.add(y * world.size + x)
        }
      }
      // The building itself is the last solid part; a base below it comes first.
      const main = solidParts[solidParts.length - 1]
      return solidParts.map((part) => {
        const look = part.sprite
        const sprite = new Sprite(textureOf(snowOf(look, paintedSnow)))
        sprite.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
        sprite.label = 'occluder'
        // A wall or a fence on a slope leans with the ground along its run (see structureParts): a vertical shear, the
        // width kept.
        if (part.shear) {
          const angle = Math.atan(part.shear)
          sprite.skew.set(0, angle)
          sprite.scale.x = 1 / Math.cos(angle)
        }
        shadows.setFootprint(sprite, s.size, Math.max(0, part.z - heightAt(world, part.fx, part.fy)), s, part !== main && !part.stands)
        const sx = (part.fx - part.fy) * (TILE_WIDTH / 2)
        const sy = (part.fx + part.fy) * (TILE_HEIGHT / 2) - part.z
        sprite.position.set(sx, sy)
        // Sorted by the front corner on the ground, so a base and its building sort together.
        const ground = (part.fx + part.fy) * (TILE_HEIGHT / 2) - main.z
        sprite.zIndex = ground
        caravans.layer.addChild(sprite)
        if (part === main) for (const c of CHIMNEYS.get(look) ?? []) chimneys.push({ x: sx + c.x, y: sy + c.y, depth: ground + 1 })
        const depth = ground * 4096 + order++
        const lit = part === main ? lightsOf(look) : null
        if (lit) lights.push({ lit, sx, sy, depth })
        const left = sx - look.anchorX
        const open = part === main ? openGate(look) : null
        return {
          x: s.x,
          y: s.y,
          size: s.size,
          sx,
          sy: ground,
          left,
          right: left + look.width,
          top: sy - look.anchorY,
          lift: main.z,
          sprite,
          look,
          depth,
          walked: !blocking,
          ...(open && { gate: { closed: look, open } }),
        }
      })
    })
    // Sorting by the front corner goes wrong for neighbours on a slope (a house on a tall base sorts by its base's top
    // and falls behind the palace beside it) or of different sizes. Footprints never overlap, so of two buildings whose
    // pictures overlap the one past the other along x or y stands in front: it is drawn after.
    {
      const groups = new Map<string, Occluder[]>()
      for (const o of occluders) {
        const key = `${o.x},${o.y}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(o)
      }
      const list = [...groups.values()].map((parts) => ({
        parts,
        o: parts[0],
        left: Math.min(...parts.map((p) => p.left)),
        right: Math.max(...parts.map((p) => p.right)),
        top: Math.min(...parts.map((p) => p.top)),
        bottom: Math.max(...parts.map((p) => p.top + p.look.height)),
        z: parts[0].sprite.zIndex,
      }))
      list.sort((a, b) => a.left - b.left)
      for (let pass = 0; pass < 4; pass++) {
        let moved = false
        for (let i = 0; i < list.length; i++) {
          const a = list[i]
          for (let j = i + 1; j < list.length && list[j].left < a.right; j++) {
            const b = list[j]
            if (b.top >= a.bottom || a.top >= b.bottom) continue
            const aFront = a.o.x >= b.o.x + b.o.size || a.o.y >= b.o.y + b.o.size
            const bFront = b.o.x >= a.o.x + a.o.size || b.o.y >= a.o.y + a.o.size
            if (aFront === bFront) continue
            const [front, back] = aFront ? [a, b] : [b, a]
            if (front.z > back.z) continue
            front.z = back.z + 0.02
            moved = true
          }
        }
        if (!moved) break
      }
      const redepth = new Map<number, number>()
      for (const g of list) {
        for (const p of g.parts) {
          const order = p.depth - p.sprite.zIndex * 4096
          // A building a little above its base, so the shade it throws on the base goes between them (shadows.ts).
          p.sprite.zIndex = g.z + (p === g.parts[g.parts.length - 1] && g.parts.length > 1 ? 0.002 : 0)
          redepth.set(p.depth, g.z * 4096 + order)
          p.depth = g.z * 4096 + order
        }
      }
      for (const l of lights) l.depth = redepth.get(l.depth) ?? l.depth
    }
    placeBuilders(structures)
    // Moving parts just over the building they belong to (under the shade other buildings throw on it).
    for (const o of occluders) {
      const anim = animOf(o.look)
      if (anim && !anim.ground) addMoving(anim, o.sprite.x, o.sprite.y, o.sprite.zIndex + 0.004, o.x * 977 + o.y, caravans.layer)
    }
    // Lit windows shine in the glow layer above everything, so the buildings in front of a house would not hide them:
    // each one is cut down to the pixels no building drawn after it covers.
    for (const { lit, sx, sy, depth } of lights) {
      const left = sx - lit.anchorX
      const top = sy - lit.anchorY
      const front = occluders.filter((o) => o.depth > depth && o.left < left + lit.width && o.right > left && o.top < top + lit.height && o.top + o.look.height > top)
      let shown = lit
      if (front.length > 0) {
        const pixels = lit.pixels.slice()
        let cut = false
        for (let y = 0; y < lit.height; y++) {
          for (let x = 0; x < lit.width; x++) {
            const i = y * lit.width + x
            if (pixels[i] >>> 24 === 0) continue
            for (const o of front) {
              const ox = left + x - o.left
              const oy = top + y - o.top
              if (ox < 0 || oy < 0 || ox >= o.look.width || oy >= o.look.height) continue
              if (o.look.pixels[oy * o.look.width + ox] >>> 24 !== 0) {
                pixels[i] = 0
                cut = true
                break
              }
            }
          }
        }
        if (cut) {
          shown = { ...lit, pixels }
          masked.push(shown)
        }
      }
      windows.push(...addLight(textureOf(shown, shown === lit ? 'main' : 'masked'), shown.anchorX / shown.width, shown.anchorY / shown.height, sx, sy))
    }
    ambient.setChimneys(chimneys)
    palaces = structures.flatMap((s) => {
      if (s.look !== 'palace') return []
      const main = structureParts(world, s).filter((p) => p.solid).pop()
      if (!main) return []
      const sy = (main.fx + main.fy) * (TILE_HEIGHT / 2) - main.z
      return [{ x: s.x, y: s.y, size: s.size, top: sy - main.sprite.anchorY + contentTop(main.sprite) }]
    })
    // The names stand over the palaces just found.
    setTerritory(...claimed)
    setRivals(rivals)
  }
  // How far from a gate's tile (in tiles) a walker swings it open: a step before the gateway and a step after.
  const GATE_REACH = 0.9
  // Builders at work on the sites under construction: some hammering, some carrying planks across. Only to look at;
  // they move with the clock and stand on the site, drawn just above its scaffolding.
  interface Builder {
    sprite: Sprite
    frames: Texture[]
    back: Texture[]
    from: Point
    to: Point
    z: number
    carry: boolean
    offset: number
  }
  let builders: Builder[] = []
  function placeBuilders(structures: Structure[]) {
    for (const b of builders) b.sprite.destroy()
    builders = []
    for (const s of structures) {
      if (s.look !== 'scaffold') continue
      const site = occluders.filter((o) => o.x === s.x && o.y === s.y).at(-1)
      if (!site) continue
      const roll = (k: number) => hash(s.x * 31 + s.y, k, world.seed + 313)
      const at = (u: number, v: number): Point => ({ x: s.x + s.size * u, y: s.y + s.size * v })
      const spots = [at(0.75, 0.3), at(0.3, 0.75), at(0.78, 0.78)].slice(0, s.size === 1 ? 1 : s.size === 2 ? 2 : 3)
      const carriers = s.size === 3 ? 2 : 1
      const crew = [
        ...spots.map((p) => ({ from: p, to: p, carry: false })),
        ...Array.from({ length: carriers }, (_, i) => ({ from: at(0.15 + 0.1 * i, 0.85), to: at(0.85, 0.15 + 0.1 * i), carry: true })),
      ]
      crew.forEach((c, i) => {
        const look = BUILDER_SPRITES[Math.floor(roll(i) * BUILDER_SPRITES.length)]
        const plain = VILLAGER_SPRITES[Math.floor(roll(i + 9) * VILLAGER_SPRITES.length)]
        const sprite = new Sprite(textureOf(look[0]))
        sprite.anchor.set(look[0].anchorX / look[0].width, look[0].anchorY / look[0].height)
        sprite.label = 'builder'
        sprite.zIndex = site.sprite.zIndex + 0.01 + i * 0.0001
        // A hammerer faces either way.
        if (!c.carry) sprite.scale.x = roll(i + 20) < 0.5 ? -1 : 1
        caravans.layer.addChild(sprite)
        builders.push({ sprite, frames: look.map((s) => textureOf(s)), back: plain.map((s) => textureOf(s)), ...c, z: site.lift, offset: roll(i + 40) * 10 })
      })
    }
  }
  function updateBuilders(seconds: number, view: { left: number; top: number; right: number; bottom: number }) {
    for (const b of builders) {
      const t = seconds + b.offset
      let p = b.from
      let frame: Texture
      if (b.carry) {
        // Across the site with a plank and back without, resting a moment at each end.
        const length = Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y)
        const walk = length / BUILDER_SPEED
        const u = t % ((walk + BUILDER_REST) * 2)
        const out = u < walk + BUILDER_REST
        const w = out ? u : u - walk - BUILDER_REST
        const f = Math.min(1, w / walk)
        const d = out ? f : 1 - f
        p = { x: b.from.x + (b.to.x - b.from.x) * d, y: b.from.y + (b.to.y - b.from.y) * d }
        const step = Math.floor(w * BUILDER_SPEED * 6) % 2
        frame = out ? b.frames[2 + (w < walk ? step : 0)] : b.back[w < walk ? step : 0]
        // Out the plank goes toward the site's right on screen, back to its left.
        const heading = (b.to.x - b.from.x - (b.to.y - b.from.y)) * (out ? 1 : -1)
        b.sprite.scale.x = heading < 0 ? -1 : 1
      } else {
        // A few blows, then a breath with the hammer down.
        const u = t % 3.2
        frame = b.frames[u < 2.4 && u % 0.5 < 0.36 ? 0 : 1]
      }
      const sx = (p.x - p.y) * (TILE_WIDTH / 2)
      const sy = (p.x + p.y) * (TILE_HEIGHT / 2) - b.z
      b.sprite.visible = sx > view.left && sx < view.right && sy > view.top && sy < view.bottom
      if (!b.sprite.visible) continue
      b.sprite.position.set(Math.round(sx), Math.round(sy))
      b.sprite.texture = frame
    }
  }

  // The occluders bucketed by the screen cells their box covers (gates by their reach too), so each walker is tested only
  // against the buildings around it (CLAUDE.md §12): testing every walker against every building on the map (two
  // thousand and more in a full lobby) was the largest cost of an idle frame.
  const CELL = 256
  let grid = new Map<number, Occluder[]>()
  let gridOf: Occluder[] | null = null
  const cellKey = (cx: number, cy: number) => (cy + 4096) * 8192 + (cx + 4096)
  function bucket() {
    gridOf = occluders
    grid = new Map()
    gateOccluders = occluders.filter((o) => o.gate)
    const reach = GATE_REACH * TILE_WIDTH
    for (const o of occluders) {
      const pad = o.gate ? reach : 0
      for (let cy = Math.floor((o.top - pad) / CELL); cy <= Math.floor((o.sy + 2 + pad) / CELL); cy++) {
        for (let cx = Math.floor((o.left - pad) / CELL); cx <= Math.floor((o.right + pad) / CELL); cx++) {
          const key = cellKey(cx, cy)
          const list = grid.get(key)
          if (list) list.push(o)
          else grid.set(key, [o])
        }
      }
    }
  }
  const NOT_WALKER = new Set(['occluder', 'anim', 'shade', 'army-ring', 'tree', 'inn', 'builder'])
  const opened = new Set<Occluder>()
  let gateOccluders: Occluder[] = []

  function sortWalkers() {
    if (occluders.length === 0) return
    if (gridOf !== occluders) bucket()
    opened.clear()
    for (const child of caravans.layer.children) {
      if (!child.visible || NOT_WALKER.has(child.label)) continue
      const { x: px, y: py } = child.position
      const near = grid.get(cellKey(Math.floor(px / CELL), Math.floor(py / CELL)))
      if (!near) continue
      // A gate opens while someone is in or right by its gateway.
      for (const o of near) {
        if (!o.gate || opened.has(o)) continue
        const a = px / (TILE_WIDTH / 2)
        const b = (py + o.lift) / (TILE_HEIGHT / 2)
        const tx = (a + b) / 2
        const ty = (b - a) / 2
        if (tx > o.x - GATE_REACH && ty > o.y - GATE_REACH && tx < o.x + o.size + GATE_REACH && ty < o.y + o.size + GATE_REACH) opened.add(o)
      }
      for (const o of near) {
        if (o.walked || px < o.left || px > o.right || py < o.top || py > o.sy + 2) continue
        // The ground point under the walker's feet, taking the building's own ground height.
        const a = px / (TILE_WIDTH / 2)
        const b = (py + o.lift) / (TILE_HEIGHT / 2)
        const tx = (a + b) / 2
        const ty = (b - a) / 2
        if (tx > o.x && ty > o.y && tx < o.x + o.size && ty < o.y + o.size) {
          child.visible = false
          break
        }
        // Behind the building only when behind both front walls; otherwise in front of it, even when higher up the
        // screen than its front corner (walking past a side wall).
        if (tx < o.x + o.size && ty < o.y + o.size) child.zIndex = Math.min(child.zIndex, o.sy - 0.5)
        else child.zIndex = Math.max(child.zIndex, o.sy + 0.5)
      }
    }
    for (const o of gateOccluders) {
      const look = opened.has(o) ? o.gate!.open : o.gate!.closed
      if (o.look !== look) {
        o.look = look
        o.sprite.texture = textureOf(snowOf(look, paintedSnow))
      }
    }
  }

  // The first row of a sprite with something drawn in it; sprites keep empty headroom above their art.
  const tops = new WeakMap<Sprite_, number>()
  const contentTop = (sprite: Sprite_) => {
    let top = tops.get(sprite)
    if (top === undefined) {
      top = sprite.pixels.findIndex((p) => p !== 0)
      top = top < 0 ? 0 : Math.floor(top / sprite.width)
      tops.set(sprite, top)
    }
    return top
  }
  // The buildings as drawn (main sprite and its anchor in world pixels), nearest to the viewer first; other kingdoms'
  // carry their owner.
  let hits: { id: number; sprite: Sprite_; sx: number; sy: number; depth: number; owner?: Structure['owner']; inn?: boolean; city?: boolean; cave?: boolean; icon?: IconName | null }[] = []
  // The inns answer to the pointer too (their id is their index in world.inns).
  const innHits = world.inns.map((p, index) => ({
    id: index,
    sprite: innLook(world, p).sprite,
    sx: (p.x - p.y) * (TILE_WIDTH / 2),
    sy: (p.x + p.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, p.x + 1, p.y + 1),
    depth: p.x + p.y + 4,
    inn: true,
    icon: 'inn' as const,
  }))
  // The caves too, by the same sprite the ground is painted with (their id is their index in caveSpots), so the pointer
  // outlines them like a building instead of marking a tile on the rock.
  const caveHits = caveSpots(world, world.seed).map((c) => {
    const { body: sprite, at } = caveLook(world.seed, c)
    return { id: c.idx, sprite, sx: (at.x - at.y) * (TILE_WIDTH / 2), sy: (at.x + at.y) * (TILE_HEIGHT / 2) - heightAt(world, at.x, at.y), depth: at.x + at.y, cave: true, icon: 'torch' as const }
  })
  hits = [...innHits, ...caveHits].sort((a, b) => b.depth - a.depth)
  let structureKeys = new Set<string>()
  let marked = new Map<number, 'demolish' | 'move'>()
  // The lords' fleets over their ships (see fleetRoutes above).
  let fleetFocus: { lord: number; fleet: number } | null = null
  const shipOutlines = new Map<Sprite_, Texture>()
  const outlineTexture = (look: Sprite_) => {
    let t = shipOutlines.get(look)
    if (!t) shipOutlines.set(look, (t = textureOf(outlineOf(look))))
    return t
  }
  const fleetTags = new Map<string, { box: Container; back: Graphics; text: Text; key: string }>()
  function drawFleets(scale: number) {
    const drawn = ambient.shipsDrawn()
    fleetRoutes.clear()
    // (An outline cut by a deck lets go of its mask first, which is then kept out of the drawing again.)
    for (const child of fleetMarks.removeChildren()) {
      const mask = child.mask as Container | null
      if (mask) {
        child.mask = null
        mask.includeInBuild = false
        mask.measurable = false
      }
      child.destroy()
    }
    const seen = new Set<string>()
    for (const d of drawn) {
      const s = d.ship
      const color = s.color ?? 0xf2d16b
      // The way ahead, dashed, and an arrowhead at its end pointing the way the fleet goes.
      if (d.ahead && d.ahead.length > 1) {
        dashes(d.ahead, 10 / scale, 7 / scale, false, (x0, y0, x1, y1) => fleetRoutes.moveTo(x0, y0).lineTo(x1, y1))
        fleetRoutes.stroke({ width: 3 / scale, color, alpha: 0.75, cap: 'butt' })
        const end = d.ahead[d.ahead.length - 1]
        const from = d.ahead[d.ahead.length - 2]
        const len = Math.hypot(end.x - from.x, end.y - from.y) || 1
        const ux = (end.x - from.x) / len
        const uy = (end.y - from.y) / len
        const size = 11 / scale
        fleetRoutes
          .poly([end.x + ux * size * 0.4, end.y + uy * size * 0.4, end.x - ux * size + uy * size * 0.6, end.y - uy * size - ux * size * 0.6, end.x - ux * size - uy * size * 0.6, end.y - uy * size + ux * size * 0.6])
          .fill({ color, alpha: 0.9 })
          .stroke({ width: 1.5 / scale, color: 0x120d0b, alpha: 0.8 })
      }
      // The picked fleet's ships, outlined.
      if (fleetFocus && s.fleet === fleetFocus.fleet && s.lord === fleetFocus.lord) {
        const ring = new Sprite(outlineTexture(d.look))
        ring.anchor.set(d.look.anchorX / d.look.width, d.look.anchorY / d.look.height)
        ring.position.set(d.x, d.y)
        ring.tint = 0xf2d16b
        fleetMarks.addChild(ring)
        // Under a bridge the outline is cut by the deck as the ship is.
        if (d.mask) {
          ring.setMask({ mask: d.mask, inverse: true })
          d.mask.includeInBuild = false
          d.mask.measurable = false
        }
      }
      // The tag over the fleet's first ship.
      if (s.tag) {
        seen.add(s.key)
        let tag = fleetTags.get(s.key)
        if (!tag || tag.key !== `${s.tag}:${color}`) {
          if (tag) tag.box.destroy({ children: true })
          const box = new Container()
          const back = new Graphics()
          const text = new Text({
            text: s.tag,
            resolution: window.devicePixelRatio * 2,
            anchor: { x: 0.5, y: 0.5 },
            style: { fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace", fontSize: 13, fill: 0xffffff, stroke: { color: 0x120d0b, width: 3, join: 'round' } },
          })
          back.roundRect(-text.width / 2 - 5, -text.height / 2 - 2, text.width + 10, text.height + 4, 3).fill({ color, alpha: 0.9 }).stroke({ width: 1.5, color: 0x120d0b })
          box.addChild(back, text)
          fleetLabels.addChild(box)
          tag = { box, back, text, key: `${s.tag}:${color}` }
          fleetTags.set(s.key, tag)
        }
        const top = d.y - d.look.anchorY + contentTop(d.look)
        tag.box.position.set(d.x, top - 8 * Math.max(1, 0.6 / scale))
        tag.box.scale.set(1 / scale)
        tag.box.visible = true
      }
    }
    for (const [key, tag] of fleetTags) {
      if (seen.has(key)) continue
      tag.box.destroy({ children: true })
      fleetTags.delete(key)
    }
  }
  // Warning signs over clogged buildings, bobbing; drawn once per tone.
  let clogged = new Map<number, 'armory' | 'store'>()
  const signLooks = new Map<string, Texture>()
  const signOf = (tone: 'armory' | 'store') => {
    let t = signLooks.get(tone)
    if (!t) {
      t = textureOf(warningSign(tone === 'armory' ? 0xe0402a : 0xe2a826))
      signLooks.set(tone, t)
    }
    return t
  }
  let signBase: number[] = []
  function placeClogs() {
    for (const child of clogSigns.removeChildren()) child.destroy()
    signBase = []
    for (const hit of hits) {
      const tone = hit.owner || hit.inn || hit.city ? undefined : clogged.get(hit.id)
      if (!tone) continue
      const sign = new Sprite(signOf(tone))
      sign.anchor.set(0.5, 1)
      // The post stands on the top of the art (sprites keep empty headroom), sunk a little into the roof.
      const base = hit.sy - hit.sprite.anchorY + contentTop(hit.sprite) + 6
      sign.position.set(hit.sx, base)
      signBase.push(base)
      clogSigns.addChild(sign)
    }
  }
  app.ticker.add(() => {
    if (clogSigns.children.length === 0) return
    const t = performance.now() / 1000
    // Bob gently; kept a fixed size on screen at every zoom.
    const scale = Math.max(1.5, 1.5 / camera.scale.x)
    for (const [i, sign] of clogSigns.children.entries()) {
      sign.scale.set(scale)
      sign.y = signBase[i] - Math.round(Math.abs(Math.sin(t * 2.4 + i)) * 4 * scale)
    }
  })
  function placeMarks() {
    for (const child of marks.removeChildren()) child.destroy()
    for (const hit of hits) {
      const tone = hit.owner || hit.inn || hit.city ? undefined : marked.get(hit.id)
      if (!tone) continue
      // The one picked up to be moved is washed out more: it is leaving.
      for (const [look, alpha] of [[silhouetteOf(hit.sprite), tone === 'move' ? 0.6 : 0.45], [outlineOf(hit.sprite), 0.95]] as const) {
        const sprite = new Sprite(textureOf(look))
        sprite.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
        sprite.position.set(hit.sx, hit.sy)
        sprite.tint = tone === 'move' ? MOVE_HIGHLIGHT : DEMOLISH_HIGHLIGHT
        sprite.alpha = alpha
        marks.addChild(sprite)
      }
    }
  }
  let trailKey = '[]'
  let trailPoints: Point[] = []
  // Tiles on a footpath: the town's walkers keep to them (see findPath).
  let worn = new Set<number>()
  // Tiles of the roads the lords laid: walkers keep to them as to the footpaths.
  let laid = new Set<number>()
  // Where the townsfolk cannot walk, and the worn ground they keep to (see findPath).
  const walkBlocked = (x: number, y: number) => {
    if ((solid.has(y * world.size + x) && !gates.has(y * world.size + x)) || x < 0 || y < 0 || x >= world.size || y >= world.size) return true
    const t = world.terrain[y * world.size + x]
    // Bridges carry walkers over the water.
    if (world.feature[y * world.size + x] === Feature.Bridge) return false
    return t === Terrain.Lake || t === Terrain.River || t === Terrain.Mountain
  }
  const walkWorn = (x: number, y: number) => worn.has(y * world.size + x) || laid.has(y * world.size + x)
  function setStructures(placed: Structure[], townTrails: Point[][]) {
    laid = new Set(placed.filter((s) => s.look === 'road').map((s) => s.y * world.size + s.x))
    const trails = [...cityTrails(world), ...townTrails]
    // The free cities stand with the kingdoms' buildings, and answer to the pointer as a whole (by the city's index).
    // A capital's suburbs give way to any lord who holds the ground (only old worlds, where the cities came after the
    // lords, let one so near): his lands and every building placed, with a tile round it.
    const held = new Set<number>()
    for (const p of placed) for (let y = p.y - 1; y <= p.y + p.size; y++) for (let x = p.x - 1; x <= p.x + p.size; x++) held.add(y * world.size + x)
    const lands = [...rivals.map((r) => r.rect), ...(claimed[0] ? [claimed[0]] : [])]
    const clearOf = (s: Structure) =>
      !lands.some((r) => s.x < r.x + r.size && r.x < s.x + s.size && s.y < r.y + r.size && r.y < s.y + s.size) &&
      ![...Array(s.size * s.size).keys()].some((k) => held.has((s.y + Math.floor(k / s.size)) * world.size + s.x + (k % s.size)))
    const structures = linkWalls([...cityStructures(world).filter((s) => !s.suburb || clearOf(s)), ...placed])
    soundscape.setStructures(structures)
    hits = structures
      .filter((s) => s.id !== undefined || s.city !== undefined)
      .map((s): (typeof hits)[number] => {
        const parts = structureParts(world, s)
        const main = parts.filter((p) => p.solid).at(-1) ?? parts[0]
        const at = { sprite: main.sprite, sx: (main.fx - main.fy) * (TILE_WIDTH / 2), sy: (main.fx + main.fy) * (TILE_HEIGHT / 2) - main.z, depth: main.fx + main.fy }
        return s.city !== undefined ? { id: s.city, ...at, city: true, icon: 'crown' as const } : { id: s.id!, ...at, owner: s.owner, icon: LOOK_ICONS[s.look] ?? null }
      })
      .concat(innHits, caveHits)
      .sort((a, b) => b.depth - a.depth)
    placeMarks()
    placeClogs()
    const keyOf = (s: Structure) => `${s.x},${s.y},${s.size},${s.look},${s.variant},${s.level ?? 1},${JSON.stringify(s.pier ?? null)},${s.links ?? ''}`
    const keys = new Set(structures.map(keyOf))
    const changed = [...structures.filter((s) => !structureKeys.has(keyOf(s)))]
    const removed = [...structureKeys].filter((k) => !keys.has(k)).map((k) => {
      const [x, y, size] = k.split(',').map(Number)
      return { x, y, size }
    })
    const nextTrailKey = JSON.stringify(trails)
    const trailsChanged = nextTrailKey !== trailKey
    if (changed.length === 0 && removed.length === 0 && !trailsChanged) return
    structureKeys = keys
    version++
    if (changed.length > 0 || removed.length > 0) {
      placeOccluders(structures)
      ambient.setBlocked((x, y) => solid.has(y * world.size + x))
    }
    for (const worker of workers) worker.postMessage({ structures, trails } satisfies PaintRequest)
    const dirty: { x: number; y: number; size: number }[] = [...changed, ...removed]
    if (trailsChanged) {
      const points = trails.flatMap((line) => densify(line))
      for (const p of [...trailPoints, ...points]) dirty.push({ x: Math.floor(p.x), y: Math.floor(p.y), size: 1 })
      trailPoints = points
      trailKey = nextTrailKey
      worn = new Set()
      for (const line of trails) tilesAlong(line, (x, y) => worn.add(y * world.size + x))
    }
    for (const s of dirty) {
      const clamp = (v: number) => Math.min(chunkCount - 1, Math.max(0, Math.floor(v / chunkSize)))
      for (let cy = clamp(s.y - STRUCTURE_REACH); cy <= clamp(s.y + s.size + STRUCTURE_REACH); cy++) {
        for (let cx = clamp(s.x - STRUCTURE_REACH); cx <= clamp(s.x + s.size + STRUCTURE_REACH); cx++) {
          staleSince.set(cy * chunkCount + cx, version)
        }
      }
    }
    refresh()
  }

  // Points along a line at most a tile apart, for marking the chunks it crosses.
  function densify(line: Point[]) {
    return line.flatMap((p, i) => {
      if (i === 0) return [p]
      const q = line[i - 1]
      const steps = Math.ceil(Math.hypot(p.x - q.x, p.y - q.y))
      return Array.from({ length: steps }, (_, n) => ({ x: q.x + ((p.x - q.x) * (n + 1)) / steps, y: q.y + ((p.y - q.y) * (n + 1)) / steps }))
    })
  }

  function float(tile: Point, text: string, color: number) {
    const s = groundToScreen(world, tile)
    const t = Object.assign(
      new Text({
        text,
        resolution: window.devicePixelRatio * 2,
        anchor: { x: 0.5, y: 1 },
        style: {
          fontFamily: "'Digits', 'Pixelify Sans', system-ui, sans-serif",
          fontSize: 14,
          fontWeight: '700',
          fill: color,
          stroke: { color: 0x10141a, width: 3, join: 'round' },
        },
      }),
      { born: performance.now(), startY: s.y - 40 },
    )
    t.position.set(s.x, t.startY)
    t.scale.set(1 / camera.scale.x)
    floats.addChild(t)
  }

  return {
    world,
    centerOn,
    setVideo(next) {
      const was = video
      video = next
      pacer.setPace(next.pace)
      ambient.setSky({ birds: next.birds, clouds: next.clouds })
      weather.setMode(next.weather)
      shadows.setEnabled(next.shadows)
      fitResolution()
      detail = next.detail
      village.setDetail(next.detail)
      if (next.detail !== was.detail) {
        // Paint the chunks again, with or without their trees lifted out.
        version++
        for (const key of chunks.keys()) staleSince.set(key, version)
        refresh()
      }
      wake()
    },
    fps: () => pacer.fps(),
    setWeather: (key) => weather.setKey(key),
    follow(target, onStop) {
      followTarget = target
      followStop = target ? (onStop ?? null) : null
    },
    setTerritory,
    setRivals,
    setArmies: (list, fights) => armies.set(list, fights),
    setFleets: (list) => ambient.setFleets(list),
    setFleetFocus: (focus) => {
      fleetFocus = focus
    },
    setStructures,
    setPlacement(next) {
      placement = next
      clearCursor()
      if (lastPointer) pick(lastPointer)
    },
    setClogged(list) {
      clogged = new Map(list.map((c) => [c.id, c.tone]))
      placeClogs()
    },
    setMarked(list) {
      marked = new Map(list.map((m) => [m.id, m.tone]))
      placeMarks()
    },
    setTargeting(on) {
      targeting = on
      if (lastPointer) pick(lastPointer)
    },
    setTool(next) {
      tool = next
      highlight.tint = toolTint()
      pointing = undefined
      app.canvas.style.cursor = tool === 'demolish' ? HAMMER_CURSOR : tool === 'move' ? 'grab' : handCursor(null)
      if (lastPointer) pick(lastPointer)
    },
    setTown: (errands, merchants) => town.set(errands, merchants, walkBlocked, walkWorn),
    setVillages: (hamlets) => village.set(hamlets, walkBlocked, walkWorn),
    blocksWalkers: (x, y) => solid.has(y * world.size + x),
    setAimMark(mark) {
      aim = mark
      aimScale = -1
      if (!mark) {
        aimLines.clear()
        aimLabel.visible = false
      }
    },
    setTowns(marks) {
      // The same towns under the same names and colours (most calls: the rivals are fetched again): the names, which
      // are costly to draw, are kept and only told the new marks (CLAUDE.md §12).
      if (marks.length === townMarks.length && marks.every((m, i) => townMarks[i].mark.name === m.name && townMarks[i].mark.color === m.color)) {
        townMarks = townMarks.map((t, i) => ({ ...t, mark: marks[i] }))
        return
      }
      for (const { text, bar } of townMarks) {
        text.destroy()
        bar.destroy()
      }
      townMarks = marks.map((mark) => {
        const text = new Text({
          text: mark.name,
          resolution: window.devicePixelRatio * 2,
          anchor: { x: 0.5, y: 1 },
          style: {
            fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace",
            fontSize: 14,
            fontWeight: '600',
            fill: mark.color,
            stroke: { color: 0x120d0b, width: 4, join: 'round' },
          },
        })
        const bar = new Graphics()
        townLayer.addChild(text, bar)
        return { mark, text, bar }
      })
    },
    setProgress(marks) {
      if (marks.length === progressMarks.length && marks.every((m, i) => progressMarks[i].mark.label === m.label && progressMarks[i].mark.color === m.color)) {
        progressMarks = progressMarks.map((p, i) => ({ ...p, mark: marks[i] }))
        return
      }
      for (const { bar, text } of progressMarks) {
        bar.destroy()
        text?.destroy()
      }
      progressMarks = marks.map((mark) => {
        const bar = new Graphics()
        const text = mark.label
          ? new Text({
              text: mark.label,
              resolution: window.devicePixelRatio * 2,
              anchor: { x: 0.5, y: 1 },
              style: {
                fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace",
                fontSize: 12,
                fontWeight: '600',
                fill: mark.color,
                stroke: { color: 0x120d0b, width: 4, join: 'round' },
              },
            })
          : null
        townLayer.addChild(bar, ...(text ? [text] : []))
        return { mark, bar, text }
      })
    },
    float,
    markMove(at, color) {
      wake()
      moveOrders.push({ at, color, born: performance.now() })
    },
    zoomBy: (step) => zoomTo(zoomIndex + step, { x: app.screen.width / 2, y: app.screen.height / 2 }),
    destroy() {
      pacer.destroy()
      weather.destroy()
      soundscape.destroy()
      clearTimeout(cameraTimer)
      app.canvas.removeEventListener('wheel', onWheel)
      app.canvas.removeEventListener('pointerleave', leaveMap)
      app.canvas.removeEventListener('contextmenu', noContextMenu)
      for (const worker of workers) worker.terminate()
      for (const key of [...chunks.keys()]) drop(key)
      // Walker, animal and cloud textures are shared by every scene (see textures.ts), so they are kept.
      app.destroy(true, { children: true })
    },
  }
}

// A little pixel warning sign on a post: a diamond of `color` with a black "!" (CLAUDE.md §6.4).
function warningSign(color: number): Sprite_ {
  const w = 15
  const h = 24
  const canvas = new Canvas(w, h)
  const fill = rgb(color)
  const dark = rgb(0x1c1612)
  const light = rgb(0xfff3c4)
  const c = 7
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - c) + Math.abs(y - 7)
      if (d > 7) continue
      canvas.set(x, y, d === 7 ? dark : d === 6 && x < c ? light : fill)
    }
  }
  for (let y = 3; y <= 8; y++) for (const x of [6, 7]) canvas.set(x, y, dark)
  for (let y = 10; y <= 11; y++) for (const x of [6, 7]) canvas.set(x, y, dark)
  for (let y = 15; y < h; y++) {
    canvas.set(6, y, rgb(0x5a3c22))
    canvas.set(7, y, rgb(0x7a5432))
  }
  return canvas.sprite(7, h - 1, 0)
}
