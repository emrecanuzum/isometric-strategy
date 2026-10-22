import { memo } from 'react'
import { chooseLang, getLang, L } from '../../lib/i18n'
import type { Lang } from '../../lib/i18n'

// The two languages as small pixel flags under the opening's "Devam et" (CLAUDE.md §11): a tap switches at once, the
// one in use stands framed in gold. Painted pixel by pixel into one path per colour, like the icons.

const W = 24
const H = 16

type Paint = (x: number, y: number) => string

// The crescent and star on red: a white disc less a red one set off to the fly, and a five-pointed star beyond.
const turkish: Paint = (x, y) => {
  const px = x + 0.5
  const py = y + 0.5
  const star = (() => {
    const cx = 14.6
    const cy = 8
    const pts: [number, number][] = []
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 2.6 : 1.05
      const a = Math.PI + (i * Math.PI) / 5
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  })()
  const moon = Math.hypot(px - 8.4, py - 8) <= 4.8 && Math.hypot(px - 9.6, py - 8) > 3.7
  return star || moon ? '#f4f0e8' : y === 0 || y === H - 1 ? '#a8141c' : '#d8202a'
}

// The Union Flag: blue field, white and thin red saltires, the broad white and red cross over them.
const british: Paint = (x, y) => {
  const px = (x + 0.5) / W
  const py = (y + 0.5) / H
  const cross = Math.abs(px - 0.5) * W
  const crossY = Math.abs(py - 0.5) * H
  if (cross <= 1 || crossY <= 1) return '#d8202a'
  if (cross <= 2.2 || crossY <= 2.2) return '#f4f0e8'
  // Distance (in pixels) from each diagonal; the red stripe sits off the middle, counterchanged.
  const d1 = (px - py) * H
  const d2 = (px + py - 1) * H
  const onRed = (d: number, up: boolean) => (up ? d >= 0 && d <= 1 : d <= 0 && d >= -1)
  const top = py < 0.5
  const left = px < 0.5
  if (onRed(d1, top !== left ? false : left) || onRed(d2, left === top ? !left : left)) return '#d8202a'
  if (Math.abs(d1) <= 1.9 || Math.abs(d2) <= 1.9) return '#f4f0e8'
  return y === H - 1 ? '#0f2152' : '#1f3a8a'
}

function pathsOf(paint: Paint) {
  const byColor = new Map<string, string>()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = paint(x, y)
      byColor.set(c, (byColor.get(c) ?? '') + `M${x} ${y}h1v1h-1z`)
    }
  }
  return [...byColor]
}

const FLAGS: { id: Lang; name: string; paths: [string, string][] }[] = [
  { id: 'tr', name: 'Türkçe', paths: pathsOf(turkish) },
  { id: 'en', name: 'English', paths: pathsOf(british) },
]

export const LangFlags = memo(function LangFlags() {
  const now = getLang()
  return (
    <div className="lang-flags" role="radiogroup" aria-label={L('Dil', 'Language')}>
      {FLAGS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={now === f.id}
          aria-label={f.name}
          title={f.name}
          className={now === f.id ? 'lang-flag on' : 'lang-flag'}
          onClick={() => chooseLang(f.id)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} width={W * 1.5} height={H * 1.5} shapeRendering="crispEdges" aria-hidden>
            {f.paths.map(([color, d]) => (
              <path key={color} d={d} fill={color} />
            ))}
          </svg>
        </button>
      ))}
    </div>
  )
})
