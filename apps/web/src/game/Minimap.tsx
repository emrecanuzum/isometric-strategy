import { Terrain } from '@game/shared'
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

interface Props {
  world: World
  center: Point | null
  onJump: (tile: Point) => void
}

export function Minimap({ world, center, onJump }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => renderBase(world), [world])

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    ctx.putImageData(base, 0, 0)
    if (!center) return
    const scale = SIZE / world.size
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(center.x * scale - 6, center.y * scale - 6, 12, 12)
  }, [base, center, world.size])

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
