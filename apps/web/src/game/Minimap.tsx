import { Terrain, balance } from '@game/shared'
import type { Point, World } from '@game/shared'
import { useEffect, useMemo, useRef } from 'react'
import { FEATURE_COLORS, TERRAIN_COLORS } from './createWorld'

const SIZE = 256

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
}

interface Props {
  world: World
  center: Point | null
  flags?: MinimapFlag[]
  onJump: (tile: Point) => void
}

// Banner size in canvas pixels, before the minimap's own turn and squash.
const POLE = 11
const CLOTH_W = 7
const CLOTH_H = 5

// The minimap is turned 45° and squashed to half height on screen (see .minimap); a banner is drawn through the inverse
// of that, so it stands upright with its pole on the site.
function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, own: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(1, 2)
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

// A free city's pin: a small castle of pale stone with two towers and a dark gate, standing upright like the banners.
// Rows from the top, 13 wide: '#' outline, 's' stone, 'l' lit stone, 'g' gate.
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
const CASTLE_COLORS: Record<string, string> = { '#': '#1a120c', s: '#c9b48a', l: '#f2e3b8', g: '#3a2414' }

function drawCastle(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.scale(1, 2)
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

export function Minimap({ world, center, flags = [], onJump }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => renderBase(world), [world])

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    ctx.putImageData(base, 0, 0)
    const scale = SIZE / world.size
    if (center) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.strokeRect(center.x * scale - 6, center.y * scale - 6, 12, 12)
    }
    // Free cities under the banners, at the middle of each city.
    const half = balance.cities.size / 2
    for (const c of world.cities) drawCastle(ctx, (c.x + half) * scale, (c.y + half) * scale)
    // Back to front on screen (the screen's vertical is x + y), the player's own on top.
    const order = [...flags].sort((a, b) => Number(a.own) - Number(b.own) || a.site.x + a.site.y - (b.site.x + b.site.y))
    for (const flag of order) drawFlag(ctx, flag.site.x * scale, flag.site.y * scale, flag.color, flag.own)
  }, [base, center, flags, world])

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
