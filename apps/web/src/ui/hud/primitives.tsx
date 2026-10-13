import { useEffect, useRef } from 'react'
import type React from 'react'
import type { Sprite } from '../../game/sprites'
import { Icon } from '../icons'
import type { IconName } from '../icons'

// Building blocks of the pixel interface. Everything is drawn on whole art pixels (see --px in index.css):
// stepped frames, segmented meters, sprites shown at whole scales.

export const fmt = (v: number) => Math.floor(v).toLocaleString('tr-TR')
// Short form for tight spaces: 1.390 → 1,4K, 2.500.000 → 2,5M.
const one = (v: number) => (Math.floor(v * 10) / 10).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
export const short = (v: number) => (v < 1000 ? fmt(v) : v < 1_000_000 ? `${one(v / 1000)}K` : `${one(v / 1_000_000)}M`)
export const signed = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ',')}`
export const times = (v: number) => `×${v.toFixed(2).replace('.', ',')}`

// A game sprite from the map, drawn with square pixels at `scale` screen pixels per art pixel.
export function SpriteView({ sprite, scale = 1, label }: { sprite: Sprite; scale?: number; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!
    const image = new ImageData(sprite.width, sprite.height)
    new Uint32Array(image.data.buffer).set(sprite.pixels)
    ctx.putImageData(image, 0, 0)
  }, [sprite])
  return (
    <canvas
      ref={canvas}
      className="sprite"
      width={sprite.width}
      height={sprite.height}
      style={{ width: sprite.width * scale, height: sprite.height * scale }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

// A meter of square segments; `value` is 0..1. The tone picks the fill color.
export function Meter({
  value,
  tone = 'gold',
  segments = 12,
  label,
}: {
  value: number
  tone?: 'gold' | 'up' | 'down' | 'water'
  segments?: number
  label: string
}) {
  const lit = Math.round(Math.min(1, Math.max(0, value)) * segments)
  return (
    <span className={`meter ${tone}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : ''} />
      ))}
    </span>
  )
}

export function Section({ title, icon, aside, children }: { title: string; icon?: IconName; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="section">
      <h3>
        {icon && <Icon name={icon} size={16} />}
        <span>{title}</span>
        {aside && <small>{aside}</small>}
      </h3>
      {children}
    </section>
  )
}

// A key–value line: a label on the left, a value (and optional note) on the right.
export function Stat({ label, value, note, tone }: { label: React.ReactNode; value: React.ReactNode; note?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className={tone}>{value}</b>
      {note && <small>{note}</small>}
    </div>
  )
}

// Column chart of recent values, one pixel column per sample.
export function History({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values)
  const rows = 12
  return (
    <span className="history" role="img" aria-label={label}>
      {values.map((v, i) => (
        <i key={i} style={{ height: `calc(var(--px) * ${Math.max(1, Math.round((v / max) * rows))})` }} />
      ))}
    </span>
  )
}

// An empty state or a feature still to come: a large icon and a short line of text.
export function Placeholder({ icon, title, children }: { icon: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="placeholder">
      <Icon name={icon} size={32} />
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  )
}
