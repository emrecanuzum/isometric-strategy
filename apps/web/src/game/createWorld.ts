import {
  gameTime,
  Feature,
  TILE_HEIGHT,
  TILE_WIDTH,
  Terrain,
  balance,
  generateWorld,
  groundToScreen,
  heightAt,
  screenToGround,
  screenToTile,
  tileRule,
} from '@game/shared'
import type { Point, Rect, World } from '@game/shared'
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js'
import { createAmbient } from './ambient'
import { createArmies } from './armies'
import { dashes } from './dashes'
import type { MapArmy, MapBattle } from './armies'
import { createCaravans } from './caravans'
import { CHIMNEYS, structureParts } from './buildingSprites'
import { lightsOf, outlineOf } from './sprites'
import { daylight, nightness } from './daylight'
import { innLook } from './innSprites'
import type { Sprite as Sprite_ } from './sprites'
import { CHUNK_PAD } from './chunkPainter'
import type { Structure } from './chunkPainter'
import type { PaintRequest, PaintResult } from './paintWorker'
import { textureOf } from './textures'
import { createTown } from './town'
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
}

const HOVER = 0xffffff
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
const TEXTURE_BUDGET_BYTES = 320 * 1024 * 1024
const MAX_WORKERS = 4
// Caravans are too small to make out below this zoom.
const CARAVAN_MIN_ZOOM = 0.5
// Tiles around a building whose chunks show part of it (see SPRITE_MARGIN in chunkPainter).
const STRUCTURE_REACH = 10
const FLOAT_SECONDS = 1.6
const GHOST_OK = 0x7dff8a
const GHOST_BAD = 0xff5a4a
const HIGHLIGHT = 0xf2d16b
// Territory border dashes and gaps, in screen pixels; the kingdom's name shows at this zoom and below.
const DASH = 12
const GAP = 8
const NAME_MAX_ZOOM = 0.5

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
  // The player's building under the pointer, and the screen point above its top.
  building?: { id: number; screen: Point }
}

export interface Plots {
  dock: Rect | null
  trade: Rect | null
}

export interface Placement {
  size: number
  valid(origin: Point): boolean
  // A spot already picked and awaiting confirmation: the footprint stays there whatever the pointer does.
  pinned?: Point
}

export interface WorldHandlers {
  onHover(hover: Hover | null): void
  onCamera(center: Point): void
  onLoading(loading: boolean): void
  // A tap or click that did not drag the map, and the player's building or the army drawn under it, if any.
  onTap(tile: Point, building?: number, army?: number): void
}

export interface RivalTerritory {
  rect: Rect
  name: string
  color: number
}

export interface WorldView {
  world: World
  centerOn(tile: Point): void
  setTerritory(rect: Rect | null, plots: Plots, name?: string): void
  // The other kingdoms of the lobby: their borders in their own colour, and their names when zoomed out.
  setRivals(rivals: RivalTerritory[]): void
  // Every army in the lobby and the battles being fought (see armies.ts).
  setArmies(armies: MapArmy[], battles: MapBattle[]): void
  // The player's buildings, painted into the ground like the inns.
  setStructures(structures: Structure[], trails: Point[][]): void
  // While set, the pointer shows the footprint of the building being placed, green where it fits.
  setPlacement(placement: Placement | null): void
  setTown(errands: Errand[], merchant: MerchantTrip | null): void
  // Tiles walkers go around: building footprints, except flat ones such as fields.
  blocksWalkers(x: number, y: number): boolean
  // A short message rising from a spot on the ground.
  float(tile: Point, text: string, color: number): void
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
}

interface Job {
  key: number
  lod: number
  // Structures version the worker painted with.
  version: number
}

export async function createWorld(
  host: HTMLElement,
  seed: number,
  { onHover, onCamera, onLoading, onTap }: WorldHandlers,
  // The shared game clock (server time), so every player sees the same hour, caravans and animals.
  clock: () => number = Date.now,
): Promise<WorldView> {
  const app = new Application()
  await app.init({
    resizeTo: host,
    background: 0x10141a,
    antialias: false,
    roundPixels: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  })
  app.canvas.style.imageRendering = 'pixelated'
  host.appendChild(app.canvas)

  const world = generateWorld(seed)
  const chunkSize = balance.map.chunkSize
  const chunkCount = world.size / chunkSize

  const camera = new Container()
  const ground = new Container()
  ground.sortableChildren = true
  const territory = new Graphics()
  const rivalLines = new Graphics()
  const rivalLabels = new Container()
  const cursor = new Graphics()
  const caravans = createCaravans(world)
  const ambient = createAmbient(world, caravans.layer)
  const town = createTown(world, caravans.layer)
  const floats = new Container()
  // Plot names float above their outlines at a fixed screen size.
  const label = (text: string, color: number) =>
    new Text({
      text,
      resolution: window.devicePixelRatio * 2,
      anchor: { x: 0.5, y: 1 },
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        fontWeight: '600',
        fill: color,
        stroke: { color: 0x10141a, width: 3, join: 'round' },
      },
    })
  const plotLabels = { dock: label('İskele alanı', DOCK_PLOT), trade: label('Ticaret alanı', TRADE_PLOT) }
  // The kingdom's name over its territory, shown once the map is zoomed out far enough to see the whole of it.
  const nameLabel = (fill: number) => new Text({
    text: '',
    resolution: window.devicePixelRatio * 2,
    anchor: { x: 0.5, y: 0.5 },
    style: {
      fontFamily: "'Pixelify Sans', ui-monospace, monospace",
      fontSize: 22,
      fontWeight: '600',
      fill,
      letterSpacing: 1,
      stroke: { color: 0x120d0b, width: 5, join: 'round' },
      dropShadow: { color: 0x000000, alpha: 0.5, blur: 0, distance: 2, angle: Math.PI / 2 },
    },
  })
  const kingdomLabel = nameLabel(TERRITORY)
  kingdomLabel.visible = false
  // A building under the pointer is outlined instead of the tile.
  const highlight = new Sprite()
  highlight.tint = HIGHLIGHT
  highlight.visible = false
  // The territory lines lie on the ground: buildings and walkers stand over them.
  // Armies stay in sight at every zoom (the caravans' layer hides when zoomed out), their routes on the ground.
  const armyRoutes = new Graphics()
  const armyLayer = new Container()
  armyLayer.sortableChildren = true
  const armyLabels = new Container()
  camera.addChild(ground, rivalLines, territory, armyRoutes, ambient.under, caravans.layer, armyLayer, ambient.sky, cursor, highlight)
  app.stage.addChild(camera)
  // Day and night: the whole map is multiplied by the colour of the light at this hour of the game day. Lit windows
  // and the labels sit above it, in a layer that follows the camera, so night never dims them.
  const light = new Graphics()
  light.blendMode = 'multiply'
  const glow = new Container()
  const above = new Container()
  above.addChild(glow, plotLabels.dock, plotLabels.trade, rivalLabels, kingdomLabel, armyLabels, floats)
  const armies = createArmies(world, armyLayer, armyRoutes, armyLabels)
  app.stage.addChild(light, above)
  for (const inn of world.inns) {
    const lit = lightsOf(innLook(world, inn).sprite)
    if (!lit) continue
    const sprite = new Sprite(textureOf(lit))
    sprite.anchor.set(lit.anchorX / lit.width, lit.anchorY / lit.height)
    sprite.position.set((inn.x - inn.y) * (TILE_WIDTH / 2), (inn.x + inn.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, inn.x + 1, inn.y + 1))
    glow.addChild(sprite)
  }
  let lightColor = -1
  app.ticker.add(() => {
    above.position.copyFrom(camera.position)
    above.scale.copyFrom(camera.scale)
    const hour = gameTime(clock(), 0).hour
    glow.alpha = nightness(hour)
    glow.visible = glow.alpha > 0.02
    const color = daylight(hour)
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
    armies.update(time, scale)
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
    caravans.layer.visible = scale >= CARAVAN_MIN_ZOOM
    if (!caravans.layer.visible) return
    const margin = 40
    const padded = {
      left: view.left - margin,
      top: view.top - margin,
      right: view.right + margin,
      bottom: view.bottom + margin,
    }
    caravans.update(seconds, padded)
    town.update(time, padded)
    sortWalkers()
  })

  const chunks = new Map<number, Chunk>()
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
    chunk.bitmap.close()
    chunks.delete(key)
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
        if (job.lod === lodFor(camera.scale.x) && visible.has(job.key) && !stale) show(job, e.data.bitmap)
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
        .filter((job) => job.lod === lod && job.version >= (staleSince.get(job.key) ?? 0))
        .map((job) => job.key),
    )
    while (idle.length > 0 && wanted.length > 0) {
      const key = wanted.shift()!
      if (busy.has(key)) continue
      const id = nextJob++
      jobs.set(id, { key, lod, version })
      const request: PaintRequest = { id, cx: key % chunkCount, cy: Math.floor(key / chunkCount), lod }
      idle.pop()!.postMessage(request)
    }
  }

  function show({ key, lod, version }: Job, bitmap: ImageBitmap) {
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
    chunks.set(key, { sprite, bitmap, lod, bytes, version })
  }

  function refresh() {
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
      .filter((key) => chunks.get(key)?.lod !== lod || (staleSince.get(key) ?? 0) > chunks.get(key)!.version)
      .sort((a, b) => distance(a) - distance(b))
    for (const [key, chunk] of chunks) {
      chunk.sprite.visible = visible.has(key)
      if (!chunk.sprite.visible && textureBytes > TEXTURE_BUDGET_BYTES) drop(key)
    }
    dispatch()
    report()
    onCamera(middle)
  }

  function centerOn(tile: Point) {
    const s = groundToScreen(world, tile)
    camera.x = Math.round(app.screen.width / 2 - s.x * camera.scale.x)
    camera.y = Math.round(app.screen.height / 2 - s.y * camera.scale.y)
    refresh()
  }

  // Screen points of a path over the ground, following its height one tile at a time.
  const drape = (corners: Point[]) =>
    corners.flatMap((from, i) => {
      const to = corners[(i + 1) % corners.length]
      const steps = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.y - from.y)))
      return Array.from({ length: steps }, (_, n) => {
        const p = groundToScreen(world, {
          x: from.x + ((to.x - from.x) * n) / steps,
          y: from.y + ((to.y - from.y) * n) / steps,
        })
        return [p.x, p.y]
      }).flat()
    })
  const square = (x: number, y: number, size: number) =>
    drape([{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }])

  // A dashed border: whole dashes along the draped outline, a fixed length on screen.
  // A closed dashed border along flat [x, y, x, y, …] points, a fixed dash length on screen.
  function dashed(g: Graphics, border: number[]) {
    const points = []
    for (let k = 0; k < border.length; k += 2) points.push({ x: border[k], y: border[k + 1] })
    dashes(points, DASH / camera.scale.x, GAP / camera.scale.x, true, (x0, y0, x1, y1) => g.moveTo(x0, y0).lineTo(x1, y1))
  }

  // Overlay lines keep their screen thickness at every zoom level, so they are redrawn when it changes.
  let claimed: [Rect | null, Plots, string | undefined] = [null, { dock: null, trade: null }, undefined]
  function setTerritory(rect: Rect | null, plots: Plots, name?: string) {
    claimed = [rect, plots, name]
    territory.clear()
    for (const text of Object.values(plotLabels)) text.visible = false
    kingdomLabel.visible = false
    if (!rect) return
    if (name && camera.scale.x <= NAME_MAX_ZOOM) {
      const middle = groundToScreen(world, { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 })
      kingdomLabel.text = name
      kingdomLabel.position.set(middle.x, middle.y - 24 / camera.scale.y)
      kingdomLabel.scale.set(1 / camera.scale.x)
      kingdomLabel.visible = true
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
    dashed(territory, outline(rect))
    territory.stroke({ width: thick, color: TERRITORY, alpha: 0.5, cap: 'butt' })
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
      const middle = groundToScreen(world, { x: rival.rect.x + rival.rect.size / 2, y: rival.rect.y + rival.rect.size / 2 })
      text.text = rival.name
      text.position.set(middle.x, middle.y - 24 / camera.scale.y)
      text.scale.set(1 / camera.scale.x)
      rivalLabels.addChild(text)
    }
  }

  // Steps to a zoom level, keeping the ground under the given screen point fixed.
  const zoomTo = (index: number, at: Point) => {
    index = Math.min(ZOOMS.length - 1, Math.max(0, index))
    if (index === zoomIndex) return
    const factor = ZOOMS[index] / camera.scale.x
    zoomIndex = index
    camera.x = Math.round(at.x - (at.x - camera.x) * factor)
    camera.y = Math.round(at.y - (at.y - camera.y) * factor)
    camera.scale.set(ZOOMS[index])
    cursor.clear()
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
    cursor.clear()
    highlight.visible = false
    pickedBuilding = undefined
    if (!inside) return onHover(null)
    const i = tile.y * world.size + tile.x
    // A building is picked by the pixels it covers on screen, nearest first, not by the ground behind its roof.
    const wx = (at.x - camera.x) / camera.scale.x
    const wy = (at.y - camera.y) / camera.scale.y
    const hit = placement
      ? undefined
      : hits.find(({ sprite, sx, sy }) => {
          const px = Math.floor(wx - sx + sprite.anchorX)
          const py = Math.floor(wy - sy + sprite.anchorY)
          return px >= 0 && py >= 0 && px < sprite.width && py < sprite.height && sprite.pixels[py * sprite.width + px] >>> 24 === 0xff
        })
    if (hit) {
      const ring = outlineOf(hit.sprite)
      highlight.texture = textureOf(ring)
      highlight.anchor.set(ring.anchorX / ring.width, ring.anchorY / ring.height)
      highlight.position.set(hit.sx, hit.sy)
      highlight.visible = true
      pickedBuilding = hit.id
      const top = { x: camera.x + hit.sx * camera.scale.x, y: camera.y + (hit.sy - hit.sprite.anchorY + contentTop(hit.sprite)) * camera.scale.y }
      onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y), building: { id: hit.id, screen: top } })
      return tile
    }
    if (placement) {
      const origin = placement.pinned ?? footprintOrigin(tile, placement.size)
      const color = placement.valid(origin) ? GHOST_OK : GHOST_BAD
      cursor
        .poly(square(origin.x, origin.y, placement.size))
        .fill({ color, alpha: 0.3 })
        .stroke({ width: 2 / camera.scale.x, color, alpha: 0.95 })
    } else {
      // The tile grid is not drawn; only the tile under the pointer is outlined, lying on the slope.
      cursor
        .poly(square(tile.x, tile.y, 1))
        .fill({ color: HOVER, alpha: 0.12 })
        .stroke({ width: 2 / camera.scale.x, color: HOVER, alpha: 0.9 })
    }
    onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y) })
    return tile
  }
  let placement: Placement | null = null
  let pickedBuilding: number | undefined
  let lastPointer: Point | null = null

  // One finger (or the mouse) drags; zoom is on the buttons and the wheel only, so extra fingers are
  // ignored. A press that barely moves is a tap: on touch screens only a tap picks a tile, so panning
  // the map never changes the selection.
  const touches = new Map<number, Point>()

  let press: { start: Point; camera: Point; moved: boolean } | null = null
  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', (e) => {
    touches.set(e.pointerId, { x: e.global.x, y: e.global.y })
    if (touches.size > 1) {
      // A multi-finger touch is never a tap, even after the other fingers lift.
      if (press) press.moved = true
      return
    }
    press = { start: { x: e.global.x, y: e.global.y }, camera: { x: camera.x, y: camera.y }, moved: false }
  })
  const release = (e: FederatedPointerEvent) => {
    touches.delete(e.pointerId)
    if (touches.size > 0) return
    if (press && !press.moved && e.type === 'pointerup') {
      const tile = pick({ x: e.global.x, y: e.global.y })
      const army = placement ? undefined : armies.pick({ x: (e.global.x - camera.x) / camera.scale.x, y: (e.global.y - camera.y) / camera.scale.y })
      if (tile) onTap(tile, army === undefined ? pickedBuilding : undefined, army)
    }
    press = null
  }
  app.stage.on('pointerup', release)
  app.stage.on('pointerupoutside', release)
  app.stage.on('pointercancel', release)
  app.stage.on('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.global.x, y: e.global.y })
    if (press && touches.size === 1) {
      const dx = e.global.x - press.start.x
      const dy = e.global.y - press.start.y
      if (!press.moved && Math.hypot(dx, dy) > TAP_SLOP) press.moved = true
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
  app.renderer.on('resize', refresh)

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
  }
  let occluders: Occluder[] = []
  const solid = new Set<number>()
  // Lit windows of the player's buildings, in the glow layer.
  let windows: Sprite[] = []
  function placeOccluders(structures: Structure[]) {
    for (const o of occluders) o.sprite.destroy()
    for (const w of windows) w.destroy()
    windows = []
    solid.clear()
    const chimneys: { x: number; y: number; depth: number }[] = []
    occluders = structures.flatMap((s) => {
      const parts = structureParts(world, s)
      const solidParts = parts.filter((p) => p.solid)
      if (solidParts.length === 0) return []
      for (let y = s.y; y < s.y + s.size; y++) for (let x = s.x; x < s.x + s.size; x++) solid.add(y * world.size + x)
      // The building itself is the last solid part; a base below it comes first.
      const main = solidParts[solidParts.length - 1]
      return solidParts.map((part) => {
        const look = part.sprite
        const sprite = new Sprite(textureOf(look))
        sprite.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
        sprite.label = 'occluder'
        const sx = (part.fx - part.fy) * (TILE_WIDTH / 2)
        const sy = (part.fx + part.fy) * (TILE_HEIGHT / 2) - part.z
        sprite.position.set(sx, sy)
        // Sorted by the front corner on the ground, so a base and its building sort together.
        const ground = (part.fx + part.fy) * (TILE_HEIGHT / 2) - main.z
        sprite.zIndex = ground
        caravans.layer.addChild(sprite)
        if (part === main) for (const c of CHIMNEYS.get(look) ?? []) chimneys.push({ x: sx + c.x, y: sy + c.y, depth: ground + 1 })
        const lit = part === main ? lightsOf(look) : null
        if (lit) {
          const w = new Sprite(textureOf(lit))
          w.anchor.set(lit.anchorX / lit.width, lit.anchorY / lit.height)
          w.position.set(sx, sy)
          glow.addChild(w)
          windows.push(w)
        }
        const left = sx - look.anchorX
        return { x: s.x, y: s.y, size: s.size, sx, sy: ground, left, right: left + look.width, top: sy - look.anchorY, lift: main.z, sprite }
      })
    })
    ambient.setChimneys(chimneys)
  }
  function sortWalkers() {
    if (occluders.length === 0) return
    for (const child of caravans.layer.children) {
      if (!child.visible || child.label === 'occluder') continue
      const { x: px, y: py } = child.position
      for (const o of occluders) {
        if (px < o.left || px > o.right || py < o.top || py > o.sy + 2) continue
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
  // The player's buildings as drawn (main sprite and its anchor in world pixels), nearest to the viewer first.
  let hits: { id: number; sprite: Sprite_; sx: number; sy: number }[] = []
  let structureKeys = new Set<string>()
  let trailKey = '[]'
  let trailPoints: Point[] = []
  function setStructures(structures: Structure[], trails: Point[][]) {
    hits = structures
      .filter((s) => s.id !== undefined)
      .map((s) => {
        const parts = structureParts(world, s)
        const main = parts.filter((p) => p.solid).at(-1) ?? parts[0]
        return { id: s.id!, sprite: main.sprite, sx: (main.fx - main.fy) * (TILE_WIDTH / 2), sy: (main.fx + main.fy) * (TILE_HEIGHT / 2) - main.z, depth: main.fx + main.fy }
      })
      .sort((a, b) => b.depth - a.depth)
    const keyOf = (s: Structure) => `${s.x},${s.y},${s.size},${s.look},${s.variant},${s.level ?? 1},${JSON.stringify(s.pier ?? null)}`
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
          fontFamily: 'system-ui, sans-serif',
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
    setTerritory,
    setRivals,
    setArmies: (list, fights) => armies.set(list, fights),
    setStructures,
    setPlacement(next) {
      placement = next
      cursor.clear()
      if (lastPointer) pick(lastPointer)
    },
    setTown: (errands, merchant) =>
      town.set(errands, merchant, (x, y) => {
        if (solid.has(y * world.size + x) || x < 0 || y < 0 || x >= world.size || y >= world.size) return true
        const t = world.terrain[y * world.size + x]
        return t === Terrain.Lake || t === Terrain.River || t === Terrain.Mountain
      }),
    blocksWalkers: (x, y) => solid.has(y * world.size + x),
    float,
    zoomBy: (step) => zoomTo(zoomIndex + step, { x: app.screen.width / 2, y: app.screen.height / 2 }),
    destroy() {
      app.canvas.removeEventListener('wheel', onWheel)
      for (const worker of workers) worker.terminate()
      for (const key of [...chunks.keys()]) drop(key)
      // Walker, animal and cloud textures are shared by every scene (see textures.ts), so they are kept.
      app.destroy(true, { children: true })
    },
  }
}
