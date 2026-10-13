import {
  Feature,
  TILE_HEIGHT,
  TILE_WIDTH,
  Terrain,
  balance,
  generateWorld,
  groundToScreen,
  screenToGround,
  screenToTile,
  tileRule,
} from '@game/shared'
import type { Point, Rect, World } from '@game/shared'
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js'
import { createAmbient } from './ambient'
import { createCaravans } from './caravans'
import { CHUNK_PAD } from './chunkPainter'
import type { PaintRequest, PaintResult } from './paintWorker'
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

export interface Hover {
  tile: Point
  terrain: number
  feature: number
  rule: number
}

export interface Plots {
  dock: Rect | null
  trade: Rect | null
}

export interface WorldView {
  world: World
  centerOn(tile: Point): void
  setTerritory(rect: Rect | null, plots: Plots): void
  /** Steps the zoom in (+1) or out (-1) around the middle of the screen. */
  zoomBy(step: number): void
  destroy(): void
}

interface Chunk {
  sprite: Sprite
  bitmap: ImageBitmap
  lod: number
  bytes: number
}

interface Job {
  key: number
  lod: number
}

export async function createWorld(
  host: HTMLElement,
  seed: number,
  onHover: (hover: Hover | null) => void,
  onCamera: (center: Point) => void,
  onLoading: (loading: boolean) => void,
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
  const cursor = new Graphics()
  const caravans = createCaravans(world)
  const ambient = createAmbient(world, caravans.layer)
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
  camera.addChild(ground, ambient.under, caravans.layer, ambient.sky, territory, cursor, plotLabels.dock, plotLabels.trade)
  app.stage.addChild(camera)
  app.ticker.add(() => {
    const scale = camera.scale.x
    const seconds = performance.now() / 1000
    const view = {
      left: -camera.x / scale,
      top: -camera.y / scale,
      right: (app.screen.width - camera.x) / scale,
      bottom: (app.screen.height - camera.y) / scale,
    }
    ambient.update(seconds, view, scale)
    caravans.layer.visible = scale >= CARAVAN_MIN_ZOOM
    if (!caravans.layer.visible) return
    const margin = 40
    caravans.update(seconds, {
      left: view.left - margin,
      top: view.top - margin,
      right: view.right + margin,
      bottom: view.bottom + margin,
    })
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
  const workers = Array.from(
    { length: Math.max(1, Math.min(MAX_WORKERS, (navigator.hardwareConcurrency || 4) - 1)) },
    () => {
      const worker = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<PaintResult>) => {
        const job = jobs.get(e.data.id)!
        jobs.delete(e.data.id)
        idle.push(worker)
        if (job.lod === lodFor(camera.scale.x) && visible.has(job.key)) show(job, e.data.bitmap)
        else e.data.bitmap.close()
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
    const busy = new Set([...jobs.values()].filter((job) => job.lod === lod).map((job) => job.key))
    while (idle.length > 0 && wanted.length > 0) {
      const key = wanted.shift()!
      if (busy.has(key)) continue
      const id = nextJob++
      jobs.set(id, { key, lod })
      const request: PaintRequest = { id, cx: key % chunkCount, cy: Math.floor(key / chunkCount), lod }
      idle.pop()!.postMessage(request)
    }
  }

  function show({ key, lod }: Job, bitmap: ImageBitmap) {
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
    chunks.set(key, { sprite, bitmap, lod, bytes })
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
    wanted = [...visible].filter((key) => chunks.get(key)?.lod !== lod).sort((a, b) => distance(a) - distance(b))
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

  // Overlay lines keep their screen thickness at every zoom level, so they are redrawn when it changes.
  let claimed: [Rect | null, Plots] = [null, { dock: null, trade: null }]
  function setTerritory(rect: Rect | null, plots: Plots) {
    claimed = [rect, plots]
    territory.clear()
    for (const text of Object.values(plotLabels)) text.visible = false
    if (!rect) return
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
    territory.poly(outline(rect)).stroke({ width: thick, color: TERRITORY, alpha: 0.9 })
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
    setTerritory(...claimed)
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
    if (!inside) return onHover(null)
    // The tile grid is not drawn; only the tile under the pointer is outlined, lying on the slope.
    cursor
      .poly(square(tile.x, tile.y, 1))
      .fill({ color: HOVER, alpha: 0.12 })
      .stroke({ width: 2 / camera.scale.x, color: HOVER, alpha: 0.9 })
    const i = tile.y * world.size + tile.x
    onHover({ tile, terrain: world.terrain[i], feature: world.feature[i], rule: tileRule(world, tile.x, tile.y) })
  }

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
    if (press && !press.moved && e.type === 'pointerup') pick({ x: e.global.x, y: e.global.y })
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
    if (e.pointerType === 'mouse') pick({ x: e.global.x, y: e.global.y })
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

  return {
    world,
    centerOn,
    setTerritory,
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
