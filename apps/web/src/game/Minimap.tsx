import { Terrain, balance } from '@game/shared'
import type { Point, World } from '@game/shared'
import { useEffect, useMemo, useRef } from 'react'
import { FEATURE_COLORS, TERRAIN_COLORS } from './createWorld'
import { cityInfo } from './cities'

// Pixels per side: two tiles to a pixel on the 1024-tile world. Icons are drawn at ICON times their pixel sizes.
const SIZE = 512
const ICON = 2.4

function renderBase(world: World) {
  const step = world.size / SIZE
  const image = new ImageData(SIZE, SIZE)
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      // A road, inn or river anywhere in the block wins, otherwise thin features vanish when downsampled.
      let color = TERRAIN_COLORS[world.terrain[(py * step + (step >> 1)) * world.size + px * step + (step >> 1)]]
      let best = -1
      for (let oy = 0; oy < step; oy++) {
        for (let ox = 0; ox < step; ox++) {
          const i = (py * step + oy) * world.size + px * step + ox
          if (world.feature[i] > best) {
            best = world.feature[i]
            if (best > 0) color = FEATURE_COLORS[best]
          }
          if (best <= 0 && world.terrain[i] === Terrain.River) {
            best = 0
            color = TERRAIN_COLORS[Terrain.River]
          }
        }
      }
      const o = (py * SIZE + px) * 4
      image.data[o] = color >> 16
      image.data[o + 1] = (color >> 8) & 0xff
      image.data[o + 2] = color & 0xff
      image.data[o + 3] = 255
    }
  }
  return image
}

// A kingdom's banner on the map: at its site, in its colour; the player's own is edged in gold.
export interface MinimapFlag {
  site: Point
  color: string
  own: boolean
  // Its territory, shaded in its colour.
  rect?: { x: number; y: number; size: number }
}

// A town (CLAUDE.md §8.4), drawn as a little house roofed in its holder's colour (free: a plain thatch).
export interface MinimapTown {
  at: Point
  color: string | null
}

// A crown's patrol riding (CLAUDE.md §7.8): where it is now, in the crown's colour.
export interface MinimapPatrol {
  at: Point
  color: string
}

interface Props {
  world: World
  center: Point | null
  flags?: MinimapFlag[]
  towns?: MinimapTown[]
  patrols?: MinimapPatrol[]
  onJump: (tile: Point) => void
}

// Banner size in canvas pixels, before the minimap's own turn and squash.
const POLE = 11
const CLOTH_W = 7
const CLOTH_H = 5

// Banners are drawn a little smaller than the other icons, so they do not crowd the map.
const FLAG = ICON * 0.75

// The minimap is turned 45° and squashed to half height on screen (see .minimap); a banner is drawn through the inverse
// of that, so it stands upright with its pole on the site.
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, own: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(FLAG, FLAG * 2)
  const edge = own ? '#f2d16b' : '#120d0b'
  ctx.fillStyle = edge
  ctx.fillRect(-1, -POLE - 1, 3, POLE + 1)
  ctx.fillRect(0, -POLE - 1, CLOTH_W + 2, CLOTH_H + 2)
  ctx.fillStyle = '#e8d8b0'
  ctx.fillRect(0, -POLE, 1, POLE)
  ctx.fillStyle = color
  ctx.fillRect(1, -POLE, CLOTH_W, CLOTH_H)
  ctx.restore()
}

// A crown capital's pin: a small castle with two towers and a dark gate in the crown's colour, standing upright like
// the banners. Rows from the top, 13 wide: '#' outline, 's' wall, 'l' lit wall, 'g' gate.
const CASTLE = [
  '#.#.#...#.#.#',
  '#l#s#...#l#s#',
  '#lsss#.#llss#',
  '#lsss###lsss#',
  '#lsss#l#lsss#',
  '#lssslssslss#',
  '#lsssl#g#lss#',
  '#lsss#ggg#ss#',
  '#lsss#ggg#ss#',
  '#############',
]
// A colour mixed toward white by `share`.
function lighten(hex: string, share: number) {
  const v = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * share)
  return `rgb(${mix(v >> 16)}, ${mix((v >> 8) & 255)}, ${mix(v & 255)})`
}

function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const CASTLE_COLORS: Record<string, string> = { '#': '#1a120c', s: color, l: lighten(color, 0.35), g: '#3a2414' }
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(ICON, ICON * 2)
  const w = CASTLE[0].length
  for (let row = 0; row < CASTLE.length; row++) {
    for (let col = 0; col < w; col++) {
      const c = CASTLE[row][col]
      if (c === '.') continue
      ctx.fillStyle = CASTLE_COLORS[c]
      ctx.fillRect(col - (w >> 1), row - CASTLE.length, 1, 1)
    }
  }
  ctx.restore()
}

// A town's house: walls of pale plaster, a pointed roof, a dark door, upright like the banners.
const HOUSE = [
  '...#...',
  '..#r#..',
  '.#rrr#.',
  '#rrrrr#',
  '#wwwww#',
  '#wwdww#',
  '#wwdww#',
  '#######',
]
function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, roof: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(ICON, ICON * 2)
  const colors: Record<string, string> = { '#': '#1a120c', r: roof, w: '#e8d8b0', d: '#3a2414' }
  const w = HOUSE[0].length
  for (let row = 0; row < HOUSE.length; row++) {
    for (let col = 0; col < w; col++) {
      const c = HOUSE[row][col]
      if (c === '.') continue
      ctx.fillStyle = colors[c]
      ctx.fillRect(col - (w >> 1), row - HOUSE.length, 1, 1)
    }
  }
  ctx.restore()
}

// A patrol: a mounted rider's pennant on a pole, small, in the crown's colour with a pale edge so it shows on any
// ground.
function drawPatrol(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(ICON, ICON * 2)
  ctx.fillStyle = '#f2e8cc'
  ctx.fillRect(-2, -4, 5, 5)
  ctx.fillStyle = color
  ctx.fillRect(-1, -3, 3, 3)
  ctx.fillStyle = '#120d0b'
  ctx.fillRect(0, -9, 1, 6)
  ctx.fillStyle = color
  ctx.fillRect(1, -9, 4, 2)
  ctx.restore()
}

export function Minimap({ world, center, flags = [], towns = [], patrols = [], onJump }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => renderBase(world), [world])

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    ctx.putImageData(base, 0, 0)
    const scale = SIZE / world.size
    if (center) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4
      ctx.strokeRect(center.x * scale - 12, center.y * scale - 12, 24, 24)
    }
    // Each kingdom's lands in its colour, the player's edged in gold.
    for (const flag of flags) {
      if (!flag.rect) continue
      const r = flag.rect
      ctx.globalAlpha = 0.35
      ctx.fillStyle = flag.color
      ctx.fillRect(r.x * scale, r.y * scale, r.size * scale, r.size * scale)
      ctx.globalAlpha = 1
      ctx.strokeStyle = flag.own ? '#f2d16b' : flag.color
      ctx.lineWidth = 3
      ctx.strokeRect(r.x * scale, r.y * scale, r.size * scale, r.size * scale)
    }
    // The crowns' capitals, at the middle of each, their castles in the crown's colour.
    const half = balance.cities.size / 2
    world.cities.forEach((c, i) => drawCastle(ctx, (c.x + half) * scale, (c.y + half) * scale, cityInfo(world, i).color))
    for (const t of towns) drawHouse(ctx, t.at.x * scale, t.at.y * scale, t.color ?? '#b08a3c')
    for (const p of patrols) drawPatrol(ctx, p.at.x * scale, p.at.y * scale, p.color)
    // Back to front on screen (the screen's vertical is x + y), the player's own on top.
    const order = [...flags].sort((a, b) => Number(a.own) - Number(b.own) || a.site.x + a.site.y - (b.site.x + b.site.y))
    for (const flag of order) drawFlag(ctx, flag.site.x * scale, flag.site.y * scale, flag.color, flag.own)
  }, [base, center, flags, towns, patrols, world])

  return (
    <div className="minimap">
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        onClick={(e) => {
          // The canvas is drawn smaller than SIZE on narrow screens.
          const scale = world.size / e.currentTarget.clientWidth
          onJump({
            x: Math.floor(e.nativeEvent.offsetX * scale),
            y: Math.floor(e.nativeEvent.offsetY * scale),
          })
        }}
      />
    </div>
  )
}
