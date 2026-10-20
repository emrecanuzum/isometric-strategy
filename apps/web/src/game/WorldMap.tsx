import { Terrain, balance, cityCenter } from '@game/shared'
import type { Point, Rect, World } from '@game/shared'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { Icon } from '../ui/icons'
import { L } from '../lib/i18n'
import { TERRAIN_COLORS } from './createWorld'
import { cityInfo } from './cities'
import { CASTLE, lighten, viewOutline } from './Minimap'
import type { MinimapPatrol, MinimapTown } from './Minimap'

// The whole world on one screen (CLAUDE.md §11): the land in the same isometric angle as the map, shaded by its relief,
// with the trade routes, rivers, inns, towns, the lords' lands and the crowns' capitals on it. Only for looking around:
// the wheel (or a pinch) zooms about the pointer, dragging pans; a tap does not move the camera.

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
// Zoom, as a multiple of the size that fits the screen.
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const BUTTON_STEP = 1.6

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff]
const SNOW = rgb(0xeef2f8)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

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

// A lord's banner: a pole with a gilded finial and a square cloth in the lord's colour ('e' its edge, gold for the
// player's own). Rows from the top.
const BANNER = [
  '.#.......',
  '#y#......',
  '#p#eeeee.',
  '#p#cccce.',
  '#p#lccce.',
  '#p#cccce.',
  '#p#cccce.',
  '#p#eeeee.',
  '#p#......',
  '#p#......',
  '#p#......',
  '###......',
]

// Pixel art as crisp SVG: one rect per run of a colour in a row, `unit` screen pixels to an art pixel.
function Pixels({ rows, palette, unit, className, style }: { rows: string[]; palette: Record<string, string>; unit: number; className?: string; style?: React.CSSProperties }) {
  const rects: React.ReactNode[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      let end = x + 1
      while (end < row.length && row[end] === c) end++
      if (c !== '.' && palette[c]) rects.push(<rect key={`${x},${y}`} x={x} y={y} width={end - x} height={1} fill={palette[c]} />)
      x = end
    }
  })
  const w = rows[0].length
  return (
    <svg className={className} style={style} width={w * unit} height={rows.length * unit} viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  )
}

interface ViewState {
  z: number
  x: number
  y: number
}

// A label placed on the sheet, in sheet pixels.
interface Label {
  key: string
  text: string
  className: string
  color?: string
  at: { x: number; y: number }
  // How far above and below the anchor the icon reaches, so the label sits clear of it.
  up: number
  down: number
  // Always shown (the player's own lands).
  must?: boolean
}

export function WorldMap({
  world,
  kingdoms,
  center,
  corners,
  towns = [],
  patrols = [],
  onClose,
}: {
  world: World
  kingdoms: MapKingdom[]
  center: Point | null
  // The screen's corners on the ground: the area in view, outlined on the map.
  corners?: Point[] | null
  // The towns (CLAUDE.md §8.4) and the crowns' patrols where they ride now (§7.8).
  towns?: MinimapTown[]
  patrols?: MinimapPatrol[]
  onClose: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => paintBase(world), [world])
  const port = useRef<HTMLDivElement>(null)
  // Escape closes the map, as it does every other window (M opens and closes it too).
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => canvas.current!.getContext('2d')!.putImageData(base, 0, 0), [base])

  // The viewport's size; the sheet fits it at zoom 1.
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = port.current!
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fit = Math.max(1, Math.min(box.w, box.h * 2) * 0.98)

  // Kept inside: a sheet smaller than the screen stays in the middle, a larger one always covers the screen's middle.
  const settle = (v: ViewState, b = box): ViewState => {
    const f = Math.max(1, Math.min(b.w, b.h * 2) * 0.98)
    const sw = f * v.z
    const sh = sw / 2
    const axis = (p: number, size: number, room: number) => (size <= room ? (room - size) / 2 : clamp(p, room / 2 - size, room / 2))
    return { z: v.z, x: axis(v.x, sw, b.w), y: axis(v.y, sh, b.h) }
  }
  const [view, setView] = useState<ViewState>({ z: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const boxRef = useRef(box)
  boxRef.current = box
  // Opened on the spot being looked at: the whole world on a wide screen, closer on a tall one (a phone), where the
  // whole world would be a thin strip. Resizing keeps the spot in the middle of the screen where it was.
  const last = useRef<{ w: number; h: number; sw: number } | null>(null)
  useLayoutEffect(() => {
    if (box.w === 0) return
    const before = last.current
    if (!before) {
      const z = clamp((box.h * 1.2) / fit, 1, 2.2)
      const sw = fit * z
      const spot = center ? toCanvas(center) : { x: W / 2, y: H / 2 }
      setView(settle({ z, x: box.w / 2 - (spot.x / W) * sw, y: box.h / 2 - (spot.y / H) * (sw / 2) }))
    } else {
      setView((v) => {
        const fx = (before.w / 2 - v.x) / before.sw
        const fy = (before.h / 2 - v.y) / (before.sw / 2)
        const sw = fit * v.z
        return settle({ z: v.z, x: box.w / 2 - fx * sw, y: box.h / 2 - fy * (sw / 2) })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h])
  useLayoutEffect(() => {
    if (box.w > 0) last.current = { w: box.w, h: box.h, sw: fit * view.z }
  })

  const zoomAt = (v: ViewState, cx: number, cy: number, z: number): ViewState => {
    const nz = clamp(z, MIN_ZOOM, MAX_ZOOM)
    const r = nz / v.z
    return settle({ z: nz, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }, boxRef.current)
  }
  // The buttons and a double click glide to the new zoom.
  const glide = useRef(0)
  const animateZoom = (cx: number, cy: number, target: number) => {
    cancelAnimationFrame(glide.current)
    const from = viewRef.current.z
    const to = clamp(target, MIN_ZOOM, MAX_ZOOM)
    const start = performance.now()
    const step = (t: number) => {
      const s = Math.min(1, (t - start) / 220)
      const e = 1 - (1 - s) ** 3
      setView((v) => zoomAt(v, cx, cy, from * (to / from) ** e))
      if (s < 1) glide.current = requestAnimationFrame(step)
    }
    glide.current = requestAnimationFrame(step)
  }
  useEffect(() => () => cancelAnimationFrame(glide.current), [])

  // The wheel zooms about the pointer (a native listener: React's wheel events cannot stop the page scrolling).
  useEffect(() => {
    const el = port.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelAnimationFrame(glide.current)
      const r = el.getBoundingClientRect()
      const speed = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015
      const factor = Math.exp(-e.deltaY * speed)
      setView((v) => zoomAt(v, e.clientX - r.left, e.clientY - r.top, v.z * factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dragging pans (mouse or one finger), two fingers pinch to zoom about their middle.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const [dragging, setDragging] = useState(false)
  const local = (e: React.PointerEvent) => {
    const r = port.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    cancelAnimationFrame(glide.current)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // A pointer the browser no longer tracks: it is still followed while over the map.
    }
    pointers.current.set(e.pointerId, local(e))
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev) return
    const now = local(e)
    if (map.size === 1) {
      setView((v) => settle({ z: v.z, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }, boxRef.current))
    } else if (map.size === 2) {
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1]
      const before = Math.hypot(prev.x - other.x, prev.y - other.y)
      const after = Math.hypot(now.x - other.x, now.y - other.y)
      const mid0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
      const mid1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }
      setView((v) => {
        const moved = { z: v.z, x: v.x + mid1.x - mid0.x, y: v.y + mid1.y - mid0.y }
        return zoomAt(moved, mid1.x, mid1.y, v.z * (before > 0 ? after / before : 1))
      })
    }
    map.set(e.pointerId, now)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) setDragging(false)
  }

  const k = SAMPLES / world.size
  function toCanvas(p: Point) {
    return { x: (p.x - p.y) * k + SAMPLES, y: ((p.x + p.y) * k) / 2 }
  }
  const points = (list: Point[]) =>
    list
      .map((p) => {
        const c = toCanvas(p)
        return `${c.x.toFixed(1)},${c.y.toFixed(1)}`
      })
      .join(' ')
  const lines = useMemo(
    () => ({
      rivers: world.rivers.map((r) => ({ points: points(r.points), width: Math.max(1.5, r.width * k * 1.4) })),
      roads: world.roads.map((r) => points(r.points)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world],
  )

  const { z } = view
  const sw = fit * z
  const sh = sw / 2
  // Sizes on screen grow with the zoom, but slower than the map, so nothing is tiny far out or huge close in.
  const fontSize = Math.round(clamp(11 + z * 1.3, 12, 20))
  const bannerUnit = clamp(1.6 + z * 0.45, 2, 4)
  const castleUnit = clamp(2 + z * 0.55, 2.5, 6)
  const innSize = Math.round(clamp(6 + z * 3, 8, 18))
  const townSize = Math.round(clamp(8 + z * 3, 10, 20))
  const roadPx = clamp(0.6 + z * 0.35, 1.2, 3.2)
  const sheetAt = (p: Point) => {
    const c = toCanvas(p)
    return { x: (c.x / W) * sw, y: (c.y / H) * sh }
  }
  const marker = (p: Point) => {
    const c = toCanvas(p)
    return { left: `${(c.x / W) * 100}%`, top: `${(c.y / H) * 100}%` }
  }

  const cities = world.cities.map((c, index) => ({ at: cityCenter(c), info: cityInfo(world, index) }))
  const middle = (r: Rect) => ({ x: r.x + r.size / 2, y: r.y + r.size / 2 })
  // The player's own last, so it is drawn on top.
  const lands = [...kingdoms].sort((a, b) => Number(!!a.mine) - Number(!!b.mine))

  // Labels: the player's own first, then the capitals, then the other lords; each tries above its icon, below, to the
  // right and to the left, and a label with no free place is left out (the icon stays) until zoomed in enough.
  const placed = useMemo(() => {
    const labels: Label[] = [
      ...kingdoms.filter((k) => k.mine).map((k): Label => ({ key: `k${k.name}`, text: k.name, className: 'worldmap-name mine', color: k.color, at: sheetAt(middle(k.rect)), up: BANNER.length * bannerUnit, down: 0, must: true })),
      ...cities.map((c, i): Label => ({ key: `c${i}`, text: c.info.capital, className: 'worldmap-name city', at: sheetAt(c.at), up: CASTLE.length * castleUnit, down: 0 })),
      ...kingdoms.filter((k) => !k.mine).map((k): Label => ({ key: `k${k.name}`, text: k.name, className: 'worldmap-name', color: k.color, at: sheetAt(middle(k.rect)), up: BANNER.length * bannerUnit, down: 0 })),
    ]
    type Box = { l: number; t: number; r: number; b: number }
    const hits = (a: Box, list: Box[]) => list.some((o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t)
    // The icons are kept clear too, except a label's own.
    const icons: Box[] = labels.map((l) => ({ l: l.at.x - 4 * castleUnit, t: l.at.y - l.up, r: l.at.x + 4 * castleUnit, b: l.at.y }))
    const taken: Box[] = []
    const out: { label: Label; left: number; top: number }[] = []
    labels.forEach((label, i) => {
      const w = label.text.length * fontSize * 0.56 + 12
      const h = fontSize + 6
      const { x, y } = label.at
      const gap = 3
      const spots = [
        { left: x - w / 2, top: y - label.up - gap - h },
        { left: x - w / 2, top: y + label.down + gap },
        { left: x + 4 * castleUnit + gap, top: y - label.up / 2 - h / 2 },
        { left: x - 4 * castleUnit - gap - w, top: y - label.up / 2 - h / 2 },
      ]
      const others = [...taken, ...icons.filter((_, j) => j !== i)]
      const spot = spots.find((s) => !hits({ l: s.left, t: s.top, r: s.left + w, b: s.top + h }, others)) ?? (label.must ? spots[0] : null)
      if (!spot) return
      taken.push({ l: spot.left, t: spot.top, r: spot.left + w, b: spot.top + h })
      out.push({ label, left: spot.left, top: spot.top })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kingdoms, world, sw, fontSize, bannerUnit, castleUnit])

  const zoomButton = (factor: number) => animateZoom(box.w / 2, box.h / 2, view.z * factor)

  return (
    <div className="worldmap" role="dialog" aria-modal="true" aria-label={L('Dünya haritası', 'World map')}>
      <header className="worldmap-head frame">
        <Icon name="pin" size={24} />
        <h2>{L('Dünya haritası', 'World map')}</h2>
        <button className="btn icon-only" disabled={z <= MIN_ZOOM + 0.001} data-why={L('En uzak görünümdesin', 'You are zoomed all the way out')} onClick={() => zoomButton(1 / BUTTON_STEP)} aria-label={L('Uzaklaştır', 'Zoom out')} title={L('Uzaklaştır', 'Zoom out')}>
          <Icon name="minus" size={16} />
        </button>
        <button className="btn icon-only" disabled={z >= MAX_ZOOM - 0.001} data-why={L('En yakın görünümdesin', 'You are zoomed all the way in')} onClick={() => zoomButton(BUTTON_STEP)} aria-label={L('Yakınlaştır', 'Zoom in')} title={L('Yakınlaştır', 'Zoom in')}>
          <Icon name="plus" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat', 'Close')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div
        className={dragging ? 'worldmap-port dragging' : 'worldmap-port'}
        ref={port}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const r = port.current!.getBoundingClientRect()
          animateZoom(e.clientX - r.left, e.clientY - r.top, view.z * 2)
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="worldmap-sheet" style={{ width: sw, height: sh, transform: `translate(${view.x}px, ${view.y}px)` }}>
          <canvas ref={canvas} width={W} height={H} />
          <svg className="worldmap-lines" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {lines.rivers.map((r, i) => (
              <polyline key={`r${i}`} points={r.points} className="river" strokeWidth={r.width} />
            ))}
            {lines.roads.map((p, i) => (
              <polyline key={`d${i}`} points={p} className="road-edge" style={{ strokeWidth: roadPx + 1.6 }} />
            ))}
            {lines.roads.map((p, i) => (
              <polyline key={`o${i}`} points={p} className="road" style={{ strokeWidth: roadPx }} />
            ))}
            {/* Each lord's lands: a diamond in its colour, edged dark under the colour so it shows on any ground; the
                player's own edged in gold. */}
            {lands.map((kingdom) => {
              const { x, y, size } = kingdom.rect
              const shape = points([
                { x, y },
                { x: x + size, y },
                { x: x + size, y: y + size },
                { x, y: y + size },
              ])
              return (
                <g key={kingdom.name} className={kingdom.mine ? 'realm mine' : 'realm'}>
                  <polygon points={shape} fill={kingdom.color} className="fill" />
                  <polygon points={shape} className="under" />
                  <polygon points={shape} stroke={kingdom.mine ? '#f2d16b' : kingdom.color} className="edge" />
                </g>
              )
            })}
            {center && corners?.length === 4 && <polygon className="view" points={points(viewOutline(center, corners, 1, 36))} />}
          </svg>
          {world.inns.map((p) => (
            <span key={`${p.x},${p.y}`} className="worldmap-pin worldmap-inn" style={marker({ x: p.x + 1, y: p.y + 1 })} aria-hidden>
              <Icon name="inn" size={innSize} />
            </span>
          ))}
          {towns.map((t, i) => (
            <span key={`town${i}`} className="worldmap-pin worldmap-town" style={{ ...marker(t.at), color: t.color ?? '#e8d8b0' }} aria-hidden>
              <Icon name="house" size={townSize} />
            </span>
          ))}
          {patrols.map((p, i) => (
            <span key={`patrol${i}`} className={p.outlaw ? 'worldmap-patrol outlaw' : 'worldmap-patrol'} style={{ ...marker(p.at), background: p.color }} aria-hidden />
          ))}
          {cities.map((c, i) => (
            <Pixels
              key={`castle${i}`}
              className="worldmap-icon"
              rows={CASTLE}
              unit={castleUnit}
              palette={{ '#': '#1a120c', s: c.info.color, l: lighten(c.info.color, 0.35), g: '#3a2414' }}
              style={marker(c.at)}
            />
          ))}
          {lands.map((kingdom) => (
            <Pixels
              key={`banner${kingdom.name}`}
              className="worldmap-icon banner"
              rows={BANNER}
              unit={bannerUnit}
              palette={{ '#': '#120d0b', y: '#f2d16b', p: '#e8d8b0', e: kingdom.mine ? '#f2d16b' : '#120d0b', c: kingdom.color, l: lighten(kingdom.color, 0.3) }}
              style={marker(middle(kingdom.rect))}
            />
          ))}
          {placed.map(({ label, left, top }) => (
            <span key={label.key} className={label.className} style={{ left, top, fontSize, color: label.color }}>
              {label.text}
            </span>
          ))}
          {center && <span className="worldmap-here" style={marker(center)} aria-label={L('Şu an baktığın yer', 'Where you are looking now')} />}
        </div>
      </div>
      <footer className="worldmap-legend frame">
        <span>
          <i style={{ background: '#e2c48a' }} /> {L('Ticaret yolu', 'Trade road')}
        </span>
        <span>
          <i style={{ background: '#4a90c8' }} /> {L('Nehir', 'River')}
        </span>
        <span>
          <Icon name="inn" size={8} /> {L('Han', 'Inn')}
        </span>
        <span>
          <Icon name="house" size={8} /> {L('Kasaba', 'Town')}
        </span>
        <span>
          <i className="patrol" /> {L('Taç devriyesi', 'Crown patrol')}
        </span>
        <span>
          <i className="here" /> {L('Bakılan yer', 'Your view')}
        </span>
        <small>{L('Tekerlek ya da iki parmak: yakınlaştır · Sürükle: kaydır', 'Wheel or two fingers: zoom · Drag: pan')}</small>
      </footer>
    </div>
  )
}
