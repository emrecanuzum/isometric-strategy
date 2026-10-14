import { Terrain, balance } from '@game/shared'
import type { Point, Rect, World } from '@game/shared'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Icon } from '../ui/icons'
import { TERRAIN_COLORS } from './createWorld'

// The whole world on one screen, opened from the minimap on phones: the land in the same isometric angle as the
// map, shaded by its relief, with the trade routes, rivers, inns and the kingdoms' borders and names on it. A tap
// jumps the camera there.

export interface MapKingdom {
  name: string
  color: string
  rect: Rect
  mine?: boolean
}

// Samples per side; each covers size / SAMPLES tiles. The canvas is twice as wide as it is tall.
const SAMPLES = 512
const W = SAMPLES * 2
const H = SAMPLES
const ZOOMS = [1, 1.6, 2.4]

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
const SNOW = rgb(0xeef2f8)

function paintBase(world: World) {
  const { size, terrain, height } = world
  const step = size / SAMPLES
  const image = new ImageData(W, H)
  const at = (x: number, y: number) => height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))]
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      // Back from the canvas to the sample grid: px = sx - sy + SAMPLES, py = (sx + sy) / 2.
      const sx = py + (px - SAMPLES) / 2
      const sy = py - (px - SAMPLES) / 2
      if (sx < 0 || sy < 0 || sx >= SAMPLES || sy >= SAMPLES) continue
      const x = Math.floor(sx * step)
      const y = Math.floor(sy * step)
      const t = terrain[y * size + x]
      const h = at(x, y)
      let [r, g, b] = rgb(TERRAIN_COLORS[t])
      if (t === Terrain.Mountain && h > balance.world.snowHeight) [r, g, b] = SNOW
      // Light from the upper left, as on the map: slopes facing it are brighter.
      const slope = (at(x - 2, y) - at(x + 2, y) + at(x, y - 2) - at(x, y + 2)) * 0.01
      const shade = 1 + Math.max(-0.35, Math.min(0.35, slope)) + (h / 400) * 0.15
      const o = (py * W + px) * 4
      image.data[o] = Math.min(255, r * shade)
      image.data[o + 1] = Math.min(255, g * shade)
      image.data[o + 2] = Math.min(255, b * shade)
      image.data[o + 3] = 255
    }
  }
  return image
}

export function WorldMap({
  world,
  kingdoms,
  center,
  onJump,
  onClose,
}: {
  world: World
  kingdoms: MapKingdom[]
  center: Point | null
  onJump: (tile: Point) => void
  onClose: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => paintBase(world), [world])
  const [zoom, setZoom] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const here = useRef<HTMLSpanElement>(null)
  // Zooming brings the spot being looked at (or the middle of the world) to the middle of the screen.
  useLayoutEffect(() => {
    const box = scroller.current
    if (!box) return
    const spot = here.current?.getBoundingClientRect()
    const view = box.getBoundingClientRect()
    if (spot) {
      box.scrollLeft += spot.left + spot.width / 2 - (view.left + view.width / 2)
      box.scrollTop += spot.top + spot.height / 2 - (view.top + view.height / 2)
    } else {
      box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2
      box.scrollTop = (box.scrollHeight - box.clientHeight) / 2
    }
  }, [zoom])
  const k = SAMPLES / world.size
  const toCanvas = (p: Point) => ({ x: (p.x - p.y) * k + SAMPLES, y: ((p.x + p.y) * k) / 2 })

  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    ctx.putImageData(base, 0, 0)
    const line = (points: Point[], width: number, color: string) => {
      ctx.beginPath()
      points.forEach((p, i) => {
        const c = toCanvas(p)
        if (i === 0) ctx.moveTo(c.x, c.y)
        else ctx.lineTo(c.x, c.y)
      })
      ctx.lineWidth = width
      ctx.strokeStyle = color
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    for (const river of world.rivers) line(river.points, Math.max(1.5, river.width * k * 1.4), '#4a90c8')
    for (const road of world.roads) line(road.points, 3, '#3a2619')
    for (const road of world.roads) line(road.points, 1.5, '#e2c48a')
    for (const kingdom of kingdoms) {
      const { x, y, size } = kingdom.rect
      const corners = [
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
      ].map(toCanvas)
      ctx.beginPath()
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)))
      ctx.closePath()
      ctx.fillStyle = `${kingdom.color}55`
      ctx.fill()
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 2
      ctx.strokeStyle = kingdom.color
      ctx.stroke()
      ctx.setLineDash([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, world, kingdoms])

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * H
    const tile = { x: (py + (px - SAMPLES) / 2) / k, y: (py - (px - SAMPLES) / 2) / k }
    if (tile.x < 0 || tile.y < 0 || tile.x >= world.size || tile.y >= world.size) return
    onJump({ x: Math.floor(tile.x), y: Math.floor(tile.y) })
    onClose()
  }

  const marker = (p: Point) => {
    const c = toCanvas(p)
    return { left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%` }
  }
  return (
    <div className="worldmap" role="dialog" aria-modal="true" aria-label="Dünya haritası">
      <header className="worldmap-head frame">
        <Icon name="pin" size={24} />
        <h2>Dünya haritası</h2>
        <button className="btn icon-only" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Uzaklaştır">
          <Icon name="minus" size={16} />
        </button>
        <button className="btn icon-only" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Yakınlaştır">
          <Icon name="plus" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label="Kapat">
          <Icon name="close" size={16} />
        </button>
      </header>
      {/* Centred with margins, not by the grid, so a zoomed map can be scrolled to every edge; zoomed in, a margin
          all round lets any spot be brought to the middle, up and down as well as sideways. */}
      <div className="worldmap-scroll" ref={scroller}>
        <div className={zoom > 0 ? 'worldmap-pad zoomed' : 'worldmap-pad'}>
        <div className="worldmap-sheet" style={{ width: `${ZOOMS[zoom] * 100}cqw` }}>
          <canvas ref={canvas} width={W} height={H} onClick={pick} />
          {world.inns.map((p) => (
            <span key={`${p.x},${p.y}`} className="worldmap-inn" style={marker({ x: p.x + 1, y: p.y + 1 })} aria-hidden>
              <Icon name="inn" size={zoom > 0 ? 16 : 8} />
            </span>
          ))}
          {kingdoms.map((kingdom) => (
            <span
              key={kingdom.name}
              className={kingdom.mine ? 'worldmap-name mine' : 'worldmap-name'}
              style={{ ...marker({ x: kingdom.rect.x + kingdom.rect.size / 2, y: kingdom.rect.y + kingdom.rect.size / 2 }), color: kingdom.color }}
            >
              {kingdom.name}
            </span>
          ))}
          {center && <span ref={here} className="worldmap-here" style={marker(center)} aria-label="Şu an baktığın yer" />}
        </div>
        </div>
      </div>
      <footer className="worldmap-legend frame">
        <span>
          <i style={{ background: '#e2c48a' }} /> Ticaret yolu
        </span>
        <span>
          <i style={{ background: '#4a90c8' }} /> Nehir
        </span>
        <span>
          <Icon name="inn" size={8} /> Han
        </span>
        <span>
          <i className="here" /> Bakılan yer
        </span>
        <small>Gitmek için haritaya dokun</small>
      </footer>
    </div>
  )
}
