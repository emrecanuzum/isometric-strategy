import { BAYER, ramp, rgb } from '../../../game/sprites'

// The mini-games' painting kit (CLAUDE.md §6.5): every game is a small hi-bit picture, 256×144 art pixels, scaled up
// nearest-neighbour. Still layers (sky, hills, walls) are painted once a pixel at a time, with short colour ramps and
// ordered dither between tones, and kept as canvases; moving things are drawn over them each frame with plain
// rectangles. Nothing here feeds the games' rules: the drawing only reads the run's state.

export const W = 256
export const H = 144

export const bay = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)]
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// A small integer hash in [0, 1): the same picture every time.
export function hash(x: number, y = 0, s = 0) {
  let n = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
const smooth = (t: number) => t * t * (3 - 2 * t)
// Value noise along a line that repeats every `period` (for layers that scroll round).
export function wave(x: number, s = 0, period = 1 << 20) {
  const i = Math.floor(x)
  const f = smooth(x - i)
  const a = hash(((i % period) + period) % period, 0, s)
  const b = hash((((i + 1) % period) + period) % period, 0, s)
  return a + (b - a) * f
}
export function ridge(x: number, s: number, scale: number, period: number) {
  return wave(x / scale, s, Math.max(1, Math.round(period / scale))) * 0.65 + wave((x / scale) * 2.3, s + 9, Math.max(1, Math.round((period / scale) * 2.3))) * 0.35
}

// Colours as canvas words (see sprites.ts) and as CSS for the frame-by-frame drawing.
export { ramp, rgb }
export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`

export function mixWord(a: number, b: number, t: number) {
  const r = Math.round((a & 255) + ((b & 255) - (a & 255)) * t)
  const g = Math.round(((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t)
  const bl = Math.round(((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t)
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0
}

// A tone of a ramp (0 … length-1), dithered where two tones meet.
export function tone(r: ArrayLike<number>, t: number, x: number, y: number) {
  const n = r.length - 1
  const v = t < 0 ? 0 : t > n ? n : t
  const i = Math.floor(v)
  const f = clamp01((v - i - 0.5) * 2 + 0.5)
  return r[Math.min(n, f > bay(x, y) ? i + 1 : i)]
}

// ---- Palettes (hex) ----------------------------------------------------------------------------------------------------

export const PAL = {
  ink: 0x14101a,
  paper: 0xf3e6c8,
  gold: [0x5a3a0e, 0x8e6216, 0xc8952e, 0xf2d16b, 0xfff4c0],
  wood: [0x2a1a12, 0x4a3020, 0x6e4a2e, 0x936a40, 0xb48a58, 0xd2ae7a],
  stone: [0x2a2834, 0x44424e, 0x63606a, 0x85818a, 0xa8a4a6, 0xcac6c0],
  iron: [0x1a1a22, 0x2e2e38, 0x4a4a56, 0x6a6a78, 0x9898a6, 0xd0d0dc],
  fire: [0x6a160c, 0xb0300e, 0xe8661a, 0xfaa630, 0xffe070, 0xfffbe0],
  grass: [0x1c3a28, 0x2a5232, 0x3d6e3a, 0x548c44, 0x74a852, 0x9cc464],
  leaf: [0x173d2c, 0x235a33, 0x35793a, 0x529a42, 0x7fba50, 0xa9d266],
  pine: [0x0f2b2a, 0x163d31, 0x1f5239, 0x2c6941, 0x41824c, 0x5c9a58],
  sand: [0x8a6236, 0xa87c46, 0xc49a5a, 0xdcb874, 0xeed294, 0xf8e8b8],
  dirt: [0x2e1e14, 0x4a3220, 0x6a4a2e, 0x8a6640, 0xa8845a],
  wheat: [0x6a4a14, 0x9c7424, 0xc89a34, 0xe6c050, 0xf6de86, 0xfff2c0],
  green: [0x2c4a1c, 0x44702a, 0x5e9234, 0x82b048],
  water: [0x0e2236, 0x16344e, 0x1f4a6a, 0x2c6688, 0x4486a6, 0x6aa8c2, 0xa6d4e0],
  skin: [0x6a3c26, 0xa06a46, 0xcc9466, 0xecba90],
  red: [0x4a1418, 0x7a2224, 0xa8342e, 0xd0503c, 0xec7a5a],
  blue: [0x1a2444, 0x2a3c6a, 0x3c5a96, 0x5a80c0, 0x8aaee0],
  cloth: [0x3f2a1c, 0x6b4a2e, 0x93704a, 0xbc9868],
  white: [0x8a8478, 0xc8c0ae, 0xeee6d2, 0xfffaf0],
  crow: [0x0c0c14, 0x1c1c2a, 0x2e2e44, 0x4a4a66],
  skyDay: [0x4a7ab8, 0x6a98cc, 0x8ab4dc, 0xb0d0e8, 0xd8ecf2],
  skyDusk: [0x2a2450, 0x5a3a6a, 0x9a5a6a, 0xd8825a, 0xf2b46a, 0xfadc96],
  skyDawn: [0x5a7ab0, 0x8a9ac4, 0xc8b0c0, 0xf0c8a8, 0xfae2be],
} as const

export const C = (hex: number) => css(hex)

// ---- A still layer, painted once ---------------------------------------------------------------------------------------

export class Buf {
  w: number
  h: number
  px: Uint32Array
  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.px = new Uint32Array(w * h)
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = c
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]
  }
  // Blends towards a colour in quarter steps chosen by the dither matrix.
  tint(x: number, y: number, c: number, t: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (t <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const q = Math.min(1, Math.floor(t * 4 + bay(x, y)) / 4)
    if (q <= 0) return
    const i = y * this.w + x
    this.px[i] = q >= 1 ? c : this.px[i] >>> 24 ? mixWord(this.px[i], c, q) : c
  }
  dot(x: number, y: number, c: number, t: number) {
    if (t > bay(Math.round(x), Math.round(y))) this.set(x, y, c)
  }
  rect(x: number, y: number, w: number, h: number, c: number | ((x: number, y: number) => number | undefined)) {
    for (let j = Math.max(0, Math.floor(y)); j < Math.min(this.h, Math.ceil(y + h)); j++)
      for (let i = Math.max(0, Math.floor(x)); i < Math.min(this.w, Math.ceil(x + w)); i++) {
        const v = typeof c === 'number' ? c : c(i, j)
        if (v !== undefined) this.px[j * this.w + i] = v
      }
  }
  // A vertical dithered gradient through a ramp, rows y0 … y1.
  sky(stops: ArrayLike<number>, y0: number, y1: number) {
    const n = stops.length - 1
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++)
      for (let x = 0; x < this.w; x++) this.px[y * this.w + x] = tone(stops, ((y - y0) / (y1 - y0)) * n, x, y)
  }
  disc(cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number, d: number) => number | undefined)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        const d = dx * dx + dy * dy
        if (d > 1) continue
        const v = typeof c === 'number' ? c : c(x, y, Math.sqrt(d))
        if (v !== undefined) this.set(x, y, v)
      }
  }
  // A soft glow in dithered rings.
  glow(cx: number, cy: number, r: number, c: number, max: number, squash = 1) {
    for (let y = Math.floor(cy - r * squash); y <= cy + r * squash; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash) / r
        if (d < 1) this.tint(x, y, c, max * (1 - d) * (1 - d))
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c)
  }
  // A ridge of hills (or a far wood) along the layer: `top(x)` its height, shaded by a ramp from its crest down.
  hills(top: (x: number) => number, r: ArrayLike<number>, depth = 24, bottom = this.h, light = 0) {
    for (let x = 0; x < this.w; x++) {
      const t0 = Math.round(top(x))
      const slope = top(x + 1) - top(x - 1)
      for (let y = Math.max(0, t0); y < bottom; y++) {
        const k = (y - t0) / depth
        this.set(x, y, tone(r, (r.length - 1) * (1 - Math.min(1, k)) * 0.8 + (slope < 0 ? light : -light), x, y))
      }
    }
  }
  canvas() {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    const g = c.getContext('2d')!
    const img = g.createImageData(this.w, this.h)
    new Uint32Array(img.data.buffer).set(this.px)
    g.putImageData(img, 0, 0)
    return c
  }
}

const baked = new Map<string, HTMLCanvasElement>()
// A layer painted once and kept (by name).
export function bake(name: string, w: number, h: number, paint: (b: Buf) => void) {
  let c = baked.get(name)
  if (!c) {
    const b = new Buf(w, h)
    paint(b)
    c = b.canvas()
    baked.set(name, c)
  }
  return c
}

// A layer scrolled sideways, repeating.
export function scroll(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement, offset: number, y = 0) {
  const w = layer.width
  const x = -(((Math.round(offset) % w) + w) % w)
  ctx.drawImage(layer, x, y)
  if (x + w < W) ctx.drawImage(layer, x + w, y)
}

// ---- Drawing each frame ------------------------------------------------------------------------------------------------

export const box = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

// A dithered translucent box (every other pixel, in a checker): shadows and glows without blending.
const patterns = new Map<string, CanvasPattern>()
// The checker as a fill pattern (one per colour and phase), so even a full-screen veil is a single fill.
function checkerPattern(ctx: CanvasRenderingContext2D, color: string, phase: number) {
  const key = `${color}|${phase}`
  let p = patterns.get(key)
  if (!p) {
    const c = document.createElement('canvas')
    c.width = c.height = 2
    const g = c.getContext('2d')!
    g.fillStyle = color
    g.fillRect(phase, 0, 1, 1)
    g.fillRect(1 - phase, 1, 1, 1)
    p = ctx.createPattern(c, 'repeat')!
    patterns.set(key, p)
  }
  return p
}
export function checker(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number, phase = 0) {
  ctx.fillStyle = checkerPattern(ctx, color, phase & 1)
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

// An ellipse of a solid colour (shadows, bubbles).
export function oval(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, rx: number, ry: number) {
  ctx.fillStyle = color
  for (let y = -Math.floor(ry); y <= Math.floor(ry); y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))))
    if (half > 0) ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2, 1)
  }
}

// A sprite given as rows of letters, each letter a colour (space or '.' clear).
export type Glyph = { rows: string[]; colors: Record<string, string> }
export function glyph(ctx: CanvasRenderingContext2D, g: Glyph, x: number, y: number, flip = false) {
  x = Math.round(x)
  y = Math.round(y)
  const w = g.rows[0].length
  for (let j = 0; j < g.rows.length; j++) {
    const row = g.rows[j]
    for (let i = 0; i < row.length; i++) {
      const c = g.colors[row[i]]
      if (!c) continue
      ctx.fillStyle = c
      ctx.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1)
    }
  }
}

// Words in Pixelify Sans, numbers in Tiny5 (fonts.ts), with a dark outline so they read on any ground.
export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  o: { color?: string; size?: number; align?: CanvasTextAlign; outline?: string; alpha?: number } = {},
) {
  const size = o.size ?? 10
  ctx.font = `${size}px Digits, "Pixelify Sans", monospace`
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'top'
  ctx.globalAlpha = o.alpha ?? 1
  ctx.fillStyle = o.outline ?? '#14101a'
  x = Math.round(x)
  y = Math.round(y)
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
  ])
    ctx.fillText(s, x + dx, y + dy)
  ctx.fillStyle = o.color ?? '#f3e6c8'
  ctx.fillText(s, x, y)
  ctx.globalAlpha = 1
}

// ---- The heads-up display ---------------------------------------------------------------------------------------------

// The score on a little plaque in the top right, ticking up to the run's score.
export function hudScore(ctx: CanvasRenderingContext2D, shown: number, pulse: number) {
  const w = 44
  const x = W - w - 4
  box(ctx, '#14101a', x - 1, 5, w + 2, 15)
  box(ctx, '#3a2a1c', x, 6, w, 13)
  box(ctx, '#5a4028', x, 6, w, 1)
  box(ctx, '#c8952e', x + 2, 8, 2, 2)
  box(ctx, '#f2d16b', x + 2, 8, 1, 1)
  text(ctx, `${Math.round(shown)}`, x + w - 4, 7 - (pulse > 0 ? 1 : 0), { align: 'right', color: pulse > 0 ? '#fff4c0' : '#f2d16b', size: 10 })
}

// Time left: a bar along the top with an hourglass, turning red near the end.
export function hudTime(ctx: CanvasRenderingContext2D, left: number, t: number) {
  const x = 16
  const w = W - 72 - x
  const low = left < 0.2
  box(ctx, '#14101a', x - 1, 7, w + 2, 6)
  box(ctx, '#2a2030', x, 8, w, 4)
  const fill = Math.round(w * clamp01(left))
  const blink = low && Math.floor(t * 6) % 2 === 0
  box(ctx, blink ? '#ec7a5a' : low ? '#d0503c' : '#c8952e', x, 8, fill, 4)
  box(ctx, blink ? '#fadc96' : low ? '#ec7a5a' : '#f2d16b', x, 8, fill, 1)
  // The hourglass.
  const hx = 5
  box(ctx, '#14101a', hx - 1, 4, 9, 12)
  box(ctx, '#936a40', hx, 5, 7, 1)
  box(ctx, '#936a40', hx, 14, 7, 1)
  box(ctx, '#d8ecf2', hx + 1, 6, 5, 3)
  box(ctx, '#d8ecf2', hx + 2, 9, 3, 1)
  box(ctx, '#d8ecf2', hx + 1, 10, 5, 4)
  const sand = Math.round(3 * clamp01(left))
  box(ctx, '#e6c050', hx + 1, 9 - sand, 5, sand)
  box(ctx, '#e6c050', hx + 3, 9, 1, 1 + ((Math.floor(t * 8) & 1) as number))
  box(ctx, '#e6c050', hx + 1, 14 - (3 - sand), 5, 3 - sand)
}

// A combo counter that swells on every step up.
export function hudCombo(ctx: CanvasRenderingContext2D, combo: number, x: number, y: number, pulse: number) {
  if (combo < 2) return
  const hot = combo >= 8 ? '#ec7a5a' : combo >= 4 ? '#faa630' : '#f2d16b'
  text(ctx, `${combo}x`, x, y - (pulse > 0 ? 2 : 0), { align: 'right', color: hot, size: pulse > 0 ? 16 : 13 })
  text(ctx, 'seri', x, y + 13, { align: 'right', color: '#c8b8a0', size: 8 })
}

// A meter with a label (stamina, tension, progress), vertical.
export function vmeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  fill: string,
  hi: string,
  bands: { from: number; to: number; color: string }[] = [],
) {
  box(ctx, '#14101a', x - 1, y - 1, w + 2, h + 2)
  box(ctx, '#2a2030', x, y, w, h)
  for (const b of bands) box(ctx, b.color, x, y + h - Math.round(b.to * h), w, Math.round((b.to - b.from) * h))
  const f = Math.round(clamp01(value) * h)
  box(ctx, fill, x + 1, y + h - f, w - 2, f)
  box(ctx, hi, x + 1, y + h - f, 1, f)
}

// ---- Effects (only for the eye; the run's rules never see them) -----------------------------------------------------

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  colors: string[]
  size: number
  gravity: number
  drag: number
  floor?: number
}
interface Floater {
  text: string
  x: number
  y: number
  life: number
  max: number
  color: string
  size: number
}

const pickOf = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
const span = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a)

export class Fx {
  parts: Particle[] = []
  floats: Floater[] = []
  shakeLeft = 0
  shakeAmp = 0
  flashLeft = 0
  flashMax = 0
  flashColor = '#fff'
  burst(
    x: number,
    y: number,
    n: number,
    o: {
      colors: string[]
      speed?: [number, number]
      angle?: [number, number]
      life?: [number, number]
      gravity?: number
      drag?: number
      size?: [number, number]
      floor?: number
      spread?: number
    },
  ) {
    const [a0, a1] = o.angle ?? [0, Math.PI * 2]
    for (let i = 0; i < n; i++) {
      const a = a0 + Math.random() * (a1 - a0)
      const v = span(o.speed ?? [20, 60])
      const life = span(o.life ?? [0.4, 0.9])
      this.parts.push({
        x: x + (Math.random() - 0.5) * (o.spread ?? 0),
        y: y + (Math.random() - 0.5) * (o.spread ?? 0) * 0.5,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        colors: o.colors,
        size: Math.round(span(o.size ?? [1, 1.99])),
        gravity: o.gravity ?? 120,
        drag: o.drag ?? 1.5,
        floor: o.floor,
      })
    }
  }
  float(text: string, x: number, y: number, color: string, size = 10, life = 0.9) {
    this.floats.push({ text, x, y, life, max: life, color, size })
  }
  shake(amp: number, seconds = 0.25) {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeLeft > 0 ? 1 : 0), amp)
    this.shakeLeft = Math.max(this.shakeLeft, seconds)
  }
  flash(color: string, seconds = 0.15) {
    this.flashColor = color
    this.flashLeft = this.flashMax = seconds
  }
  update(dt: number) {
    for (const p of this.parts) {
      p.vy += p.gravity * dt
      p.vx -= p.vx * p.drag * dt
      p.vy -= p.vy * p.drag * dt * 0.3
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor
        p.vy *= -0.3
        p.vx *= 0.6
      }
      p.life -= dt
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400)
    this.parts = this.parts.filter((p) => p.life > 0)
    for (const f of this.floats) {
      f.life -= dt
      f.y -= dt * 18 * (f.life / f.max)
    }
    this.floats = this.floats.filter((f) => f.life > 0)
    this.shakeLeft = Math.max(0, this.shakeLeft - dt)
    this.flashLeft = Math.max(0, this.flashLeft - dt)
  }
  // Where the picture sits this frame (the shake).
  offset(): [number, number] {
    if (this.shakeLeft <= 0) return [0, 0]
    const k = this.shakeAmp * Math.min(1, this.shakeLeft * 6)
    return [Math.round((Math.random() * 2 - 1) * k), Math.round((Math.random() * 2 - 1) * k)]
  }
  drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const k = p.life / p.max
      ctx.fillStyle = p.colors[Math.min(p.colors.length - 1, Math.floor((1 - k) * p.colors.length))]
      const s = k < 0.3 ? 1 : p.size
      ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s)
    }
  }
  drawFloats(ctx: CanvasRenderingContext2D) {
    for (const f of this.floats) {
      const k = f.life / f.max
      const pop = k > 0.85 ? 2 : 0
      text(ctx, f.text, f.x, f.y, { color: f.color, size: f.size + pop, align: 'center', alpha: k < 0.25 ? k * 4 : 1 })
    }
  }
  drawFlash(ctx: CanvasRenderingContext2D) {
    if (this.flashLeft <= 0) return
    ctx.globalAlpha = 0.45 * (this.flashLeft / this.flashMax)
    ctx.fillStyle = this.flashColor
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }
}

export { pickOf, span }

// ---- Common scenery ---------------------------------------------------------------------------------------------------

// Clouds drifting across a sky: soft lumps in two tones with a dithered underside.
export function cloudLayer(name: string, w: number, h: number, light: number, shade: number, seed: number, count = 6) {
  return bake(name, w, h, (b) => {
    for (let i = 0; i < count; i++) {
      const cx = hash(i, 1, seed) * w
      const cy = 6 + hash(i, 2, seed) * (h - 14)
      const rw = 10 + hash(i, 3, seed) * 18
      for (let k = 0; k < 5; k++) {
        const ox = (k - 2) * rw * 0.45 + (hash(i, k, seed + 5) - 0.5) * 6
        const r = rw * (0.45 + hash(i, k, seed + 7) * 0.3)
        for (const wrap of [-w, 0, w])
          b.disc(cx + ox + wrap, cy - r * 0.2, r, r * 0.55, (x, y, d) => {
            const under = y > cy
            return under ? (d > 0.6 || bay(x, y) > 0.5 ? shade : light) : light
          })
      }
    }
  })
}

// A flock of birds drawn as little flapping v's (pure decoration).
export function birds(ctx: CanvasRenderingContext2D, t: number, seed: number, color = '#2a2030', n = 4, y0 = 18) {
  for (let i = 0; i < n; i++) {
    const speed = 10 + hash(i, 0, seed) * 8
    const x = ((hash(i, 1, seed) * 400 + t * speed) % 340) - 40
    const y = y0 + hash(i, 2, seed) * 20 + Math.sin(t * 1.3 + i) * 2
    const up = Math.floor(t * 6 + i * 2) % 2 === 0
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
    ctx.fillRect(Math.round(x - 1), Math.round(y + (up ? -1 : 0)), 1, 1)
    ctx.fillRect(Math.round(x + 1), Math.round(y + (up ? -1 : 0)), 1, 1)
    ctx.fillRect(Math.round(x - 2), Math.round(y + (up ? -2 : 1)), 1, 1)
    ctx.fillRect(Math.round(x + 2), Math.round(y + (up ? -2 : 1)), 1, 1)
  }
}

// Chimney smoke: puffs that rise, grow and drift, fading in dither.
export function smoke(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, seed: number, color = '#c8c0ae', n = 6) {
  for (let i = 0; i < n; i++) {
    const age = (t * 0.5 + i / n + hash(i, 0, seed) * 0.1) % 1
    const px = x + age * 14 + Math.sin(t * 2 + i) * 1.5
    const py = y - age * 26
    const r = Math.round(1 + age * 4)
    ctx.fillStyle = color
    const cx = Math.round(px)
    const cy = Math.round(py)
    // Solid while young, thinning to a dither as it fades.
    for (let j = -r; j <= r; j++)
      for (let k = -r; k <= r; k++) {
        if (j * j + k * k > r * r + 1) continue
        if (age > 0.45 && bay(cx + k, cy + j) < (age - 0.45) * 1.8) continue
        ctx.fillRect(cx + k, cy + j, 1, 1)
      }
    if (age < 0.5) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - Math.floor(r / 2), cy - Math.floor(r / 2), 1, 1)
      ctx.fillStyle = color
    }
  }
}

// A pennant on a pole flapping in the wind; `wind` from −1 (left) to 1 (right).
export function pennant(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, wind: number, colors: [string, string], len = 14) {
  box(ctx, '#2a1a12', x, y, 1, 22)
  box(ctx, '#c8952e', x, y - 1, 1, 1)
  const dir = wind >= 0 ? 1 : -1
  const reach = Math.round(len * (0.35 + Math.abs(wind) * 0.65))
  for (let i = 0; i < reach; i++) {
    const wav = Math.round(Math.sin(t * 9 - i * 0.6) * (1 + i / 8) * (0.4 + Math.abs(wind)))
    const hgt = Math.max(1, Math.round(5 * (1 - i / (reach + 2))))
    const droop = Math.round((1 - Math.abs(wind)) * i * 0.5)
    box(ctx, Math.floor(i / 3) % 2 ? colors[1] : colors[0], x + dir * (i + 1), y + 1 + wav + droop, 1, hgt)
  }
}

// A line of pixels (rope, handles, rods).
export function pline(ctx: CanvasRenderingContext2D, color: string, x0: number, y0: number, x1: number, y1: number, width = 1) {
  ctx.fillStyle = color
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), width, width)
}

// A soft dithered glow drawn over the frame (fire, sparkle), in rings of decreasing density.
const halos = new Map<string, HTMLCanvasElement>()
export function halo(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number, strength = 1) {
  r = Math.round(r)
  const key = `${color}|${r}|${strength.toFixed(2)}`
  let c = halos.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = r * 2 + 1
    const g = c.getContext('2d')!
    g.fillStyle = color
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y) / r
        if (d < 1 && (1 - d) * (1 - d) * strength > bay(x + r, y + r) + 0.05) g.fillRect(x + r, y + r, 1, 1)
      }
    if (halos.size > 200) halos.clear()
    halos.set(key, c)
  }
  ctx.drawImage(c, Math.round(cx) - r, Math.round(cy) - r)
}

// Pine trees in a row for a far wood: dark triangles with a lit edge.
export function pineRow(b: Buf, y: number, r: ArrayLike<number>, seed: number, spacing = 7, size = 1, period = b.w) {
  for (let i = 0; i * spacing < period + spacing; i++) {
    const x = i * spacing + hash(i, 0, seed) * spacing * 0.8
    const h = (14 + hash(i, 1, seed) * 12) * size
    const base = y + hash(i, 2, seed) * 4
    for (let j = 0; j < h; j++) {
      const half = Math.max(0, ((j / h) * 0.55 * h) / 2.2 + (j % 4 === 3 ? -1 : 0))
      for (let k = -Math.round(half); k <= Math.round(half); k++) {
        const lit = k < -half * 0.3
        const c = tone(r, (lit ? 2.6 : 1.2) + (1 - j / h) * 0.8 - (k > half * 0.5 ? 0.8 : 0), Math.round(x + k), Math.round(base - h + j))
        for (const wrap of [0, period, -period]) b.set(x + k + wrap, base - h + j, c)
      }
    }
    for (const wrap of [0, period, -period]) b.rect(Math.round(x) + wrap, Math.round(base), 1, 3, r[0])
  }
}

// A limb (arm, leg) between two joints: a dark outline, a two-tone body shaded away from the light, a highlight on the
// lit edge and, if given, a warm rim light. `r` is dark, mid, light.
export function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, r: readonly [string, string, string], rim?: string) {
  const o = Math.floor(w / 2)
  pline(ctx, '#14101a', x0 - o - 1, y0 - o - 1, x1 - o - 1, y1 - o - 1, w + 2)
  pline(ctx, r[0], x0 - o, y0 - o, x1 - o, y1 - o, w)
  pline(ctx, r[1], x0 - o, y0 - o, x1 - o, y1 - o, Math.max(1, w - 2))
  pline(ctx, r[2], x0 - o + 1, y0 - o, x1 - o + 1, y1 - o, 1)
  if (rim) pline(ctx, rim, x0 - o, y0 - o + 1, x1 - o, y1 - o + 1, 1)
}

// A rounded joint (shoulder, elbow, fist) to close a limb.
export function joint(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number, r: readonly [string, string, string]) {
  oval(ctx, '#14101a', x, y, rad + 1, rad + 1)
  oval(ctx, r[0], x, y, rad, rad)
  oval(ctx, r[1], x - 0.5, y - 0.5, Math.max(1, rad - 1), Math.max(1, rad - 1))
  box(ctx, r[2], Math.round(x - rad / 2), Math.round(y - rad / 2), 1, 1)
}
