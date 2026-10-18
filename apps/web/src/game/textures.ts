import { CanvasSource, Rectangle, Texture } from 'pixi.js'
import type { Sprite } from './sprites'

// Generated sprites are packed into a few large atlas pages (CLAUDE.md §12). Each sprite having a texture of its own
// broke Pixi's batches every 16 textures: hundreds of draw calls a frame, each a command to the GPU process, which is
// most of what the map cost the battery. On shared pages a frame is drawn in a few dozen calls.

// Side of a page, in pixels. Sprites larger than a page keep a texture of their own.
const PAGE = 2048
// Transparent gap around each sprite on a page, so nearest sampling at a fractional zoom (or a swaying tree's skew)
// never picks a neighbour's pixel.
const PAD = 2

// Which pages a sprite goes on. Sprites freed again soon (shadows, recast at every step of the sun; masked copies) are
// kept apart from those that live as long as the map, so their pages empty out whole and are filled again.
// `own` keeps a texture of its own: for a sprite made one at a time over many frames (the shade falling on one building),
// where each would otherwise upload a whole page.
export type Pool = 'main' | 'shade' | 'masked' | 'own'

interface Page {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  source: CanvasSource
  // Shelf packing: where the next sprite goes, and the height of the current shelf.
  x: number
  y: number
  shelf: number
  // Sprites on the page not yet freed; a page with none is packed again from the top.
  live: number
}

interface Entry {
  texture: Texture
  page: Page | null
}

const cache = new Map<Sprite, Entry>()
const looks = new WeakMap<Texture, Sprite>()
const pools = new Map<Pool, Page[]>()
const dirty = new Set<Page>()

function newPage(): Page {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE
  canvas.height = PAGE
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!
  const source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' })
  return { canvas, ctx, source, x: 0, y: 0, shelf: 0, live: 0 }
}

// Room for a w×h box on a page of the pool: the first page whose shelf it fits, or a new one.
function place(pool: Pool, w: number, h: number): { page: Page; x: number; y: number } {
  let pages = pools.get(pool)
  if (!pages) pools.set(pool, (pages = []))
  for (const page of pages) {
    if (page.live === 0) {
      page.x = 0
      page.y = 0
      page.shelf = 0
    }
    if (page.x + w > PAGE) {
      page.x = 0
      page.y += page.shelf
      page.shelf = 0
    }
    if (page.y + h > PAGE) continue
    const at = { page, x: page.x, y: page.y }
    page.x += w
    page.shelf = Math.max(page.shelf, h)
    return at
  }
  const page = newPage()
  pages.push(page)
  page.x = w
  page.shelf = h
  return { page, x: 0, y: 0 }
}

// A generated sprite as a pixel-exact texture, made once per sprite and shared by every scene.
export function textureOf(sprite: Sprite, pool: Pool = 'main'): Texture {
  const known = cache.get(sprite)
  if (known) return known.texture
  const w = sprite.width + PAD * 2
  const h = sprite.height + PAD * 2
  const image = new ImageData(new Uint8ClampedArray(sprite.pixels.slice().buffer), sprite.width, sprite.height)
  let entry: Entry
  if (pool === 'own' || w > PAGE || h > PAGE) {
    const canvas = document.createElement('canvas')
    canvas.width = sprite.width
    canvas.height = sprite.height
    canvas.getContext('2d')!.putImageData(image, 0, 0)
    entry = { texture: new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) }), page: null }
  } else {
    const { page, x, y } = place(pool, w, h)
    // The whole box, gap included, is written: whatever stood there before (on a page packed again) is cleared.
    page.ctx.clearRect(x, y, w, h)
    page.ctx.putImageData(image, x + PAD, y + PAD)
    page.live++
    dirty.add(page)
    entry = { texture: new Texture({ source: page.source, frame: new Rectangle(x + PAD, y + PAD, sprite.width, sprite.height) }), page }
  }
  cache.set(sprite, entry)
  looks.set(entry.texture, sprite)
  return entry.texture
}

// Sends the pages changed since the last frame to the GPU, once each (an upload is the whole page). Called every frame
// just before the map is drawn.
export function flushTextures() {
  if (dirty.size === 0) return
  for (const page of dirty) page.source.update()
  dirty.clear()
}

// The generated sprite a texture was made from, if it was made by textureOf.
export const lookOf = (texture: Texture) => looks.get(texture)

// Drops the texture of a sprite made for one moment (a shadow, a masked copy), so it does not linger in the cache; its
// room on the page is taken again once everything on that page is freed.
export function freeTexture(sprite: Sprite) {
  const entry = cache.get(sprite)
  if (!entry) return
  cache.delete(sprite)
  if (!entry.page) {
    entry.texture.destroy(true)
    return
  }
  entry.texture.destroy(false)
  entry.page.live--
}
