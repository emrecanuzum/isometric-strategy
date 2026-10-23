import { ENVOY_H, ENVOY_W, paintEnvoy } from '../ui/advisor/EnvoyPortrait'
import { ramp } from '../game/sprites'
import { C, GOLD, Paint, noise, rnd, tone } from '../ui/artKit'

// The game's brand art (logo, profile picture, favicon), painted in code like everything else: the envoy (Elçi), the
// mascot the game is named after, in a gilt medallion against the menu's twilight. Every picture is a small buffer of
// art pixels, scaled up by whole numbers with nearest neighbour when exported (see main.ts).

export interface Art {
  w: number
  h: number
  px: Uint32Array
}

const INK = C(0x120d0b)
const SKY = ramp(0x0c0a1e, 0x16123a, 0x24195a, 0x3a2270, 0x5a2c78, 0x8a3a6e)
const RING = ramp(0x3a2408, 0x6b4a12, 0xa8781f, 0xd9aa3e, 0xf2d16b, 0xfff4c0)
const WORD = ramp(0x6b4a12, 0xa8781f, 0xd9aa3e, 0xf2d16b, 0xfff4c0)

function art(w: number, h: number): Art {
  return { w, h, px: new Uint32Array(w * h) }
}

// A 1-pixel ink line round everything drawn (four-way), as the menu's crown has.
function outline(a: Art, c = INK) {
  const solid = a.px.slice()
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      if (solid[y * a.w + x]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx
        const yy = y + dy
        return xx >= 0 && yy >= 0 && xx < a.w && yy < a.h && solid[yy * a.w + xx]
      })
      if (near) a.px[y * a.w + x] = c
    }
  }
}

function blit(dst: Art, src: Art, ox: number, oy: number, keep?: (x: number, y: number) => boolean) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.px[y * src.w + x]
      const dx = x + ox
      const dy = y + oy
      if (!c || dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h || (keep && !keep(dx, dy))) continue
      dst.px[dy * dst.w + dx] = c
    }
  }
}

// The envoy alone on clear pixels, outlined in ink.
function envoy(): Art {
  const a: Art = { w: ENVOY_W + 2, h: ENVOY_H + 2, px: new Uint32Array((ENVOY_W + 2) * (ENVOY_H + 2)) }
  blit(a, { w: ENVOY_W, h: ENVOY_H, px: paintEnvoy({ ground: false, framed: false }) }, 1, 1)
  outline(a)
  return a
}

// The twilight behind him: violet sky darkening upwards, a lit halo behind the head, a few stars.
function sky(p: Paint, w: number, h: number, hx: number, hy: number, seed: number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const halo = Math.max(0, 1 - Math.hypot(x - hx, (y - hy) * 1.1) / (w * 0.42))
      const l = 0.6 + (y / h) * 2.6 + halo * 1.6 + (noise(x * 0.15, y * 0.15, seed) - 0.5) * 0.4
      p.set(x, y, tone(SKY, l, x, y))
    }
  }
  for (let i = 0; i < w * h * 0.012; i++) {
    const x = Math.floor(rnd(i, 1, seed) * w)
    const y = Math.floor(rnd(i, 2, seed) * h * 0.55)
    if (Math.hypot(x - hx, y - hy) < w * 0.3) continue
    const big = rnd(i, 3, seed) < 0.2
    p.set(x, y, big ? C(0xfff4c0) : C(0xb8a8d8))
    if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, C(0x6a5a9a))
  }
}

// A gilt ring of radius r round (cx, cy), lit from the upper left, with four studs.
function ring(p: Paint, cx: number, cy: number, r: number, width = 4) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const k = r - d
      if (k < -1 || k > width) continue
      if (k < 0 || k >= width - 0.5) {
        p.set(x, y, INK)
        continue
      }
      const lit = ((x - cx) * -0.7 + (y - cy) * -0.7) / r
      const bevel = k < 1.2 ? 1.2 : k > width - 1.8 ? -1 : 0.2
      p.set(x, y, tone(RING, 2.6 + lit * 1.6 + bevel, x, y))
    }
  }
  for (const a of [0.25, 0.75, 1.25, 1.75]) {
    const x = cx + Math.cos(a * Math.PI) * (r - width / 2)
    const y = cy + Math.sin(a * Math.PI) * (r - width / 2)
    p.set(x, y, RING[5])
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(x + dx, y + dy, RING[1])
  }
}

// The medallion: the envoy in a gilt ring, his shoulders and scroll breaking over its lower rim. `bleed` fills the
// square's corners with the sky too (a profile picture, cropped to a circle by the site); otherwise they stay clear.
export function badge(size = 60, bleed = false): Art {
  const a = art(size, size)
  const p = new Paint(a.px, size, size)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 1
  const e = envoy()
  const ox = Math.round(cx - e.w / 2)
  const oy = Math.round(size * 0.06)
  const inside = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r - 1
  const sk = art(size, size)
  sky(new Paint(sk.px, size, size), size, size, cx - 2, oy + 24, 11)
  blit(a, sk, 0, 0, bleed ? undefined : inside)
  ring(p, cx, cy, r)
  // Inside the ring the whole envoy; below its middle he steps over the rim (but not past the picture's circle).
  blit(a, e, ox, oy, (x, y) => inside(x, y) || (y > cy + 4 && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r + (bleed ? 99 : 1)))
  if (!bleed) {
    // The overlap keeps an ink edge where the coat leaves the ring.
    const solid = a.px.slice()
    for (let y = Math.ceil(cy); y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (solid[y * size + x]) continue
        if ([[1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => solid[(y + dy) * size + x + dx])) a.px[y * size + x] = INK
      }
    }
  }
  return a
}

// The favicon: his head alone, hat to beard, 32 art pixels on clear ground.
export function favicon(): Art {
  const e = envoy()
  const a = art(32, 32)
  blit(a, e, -7, -4)
  // Trim what the crop cut through the frame's edge so the silhouette keeps its ink line.
  const out = art(32, 32)
  blit(out, a, 0, 0, (x, y) => x > 0 && y > 0 && x < 31 && y < 31)
  outline(out)
  return out
}

// The wordmark, rasterised from Pixelify Sans and re-coloured in gilt bands with an ink edge and a brown drop, as the
// menu's title. Drawn at `cap` art pixels per em; crisp (alpha thresholded), never blurred.
export function wordmark(text: string, em = 22): Art {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = `600 ${em}px "Pixelify Sans"`
  const m = ctx.measureText(text)
  const w = Math.ceil(m.width) + 8
  const h = Math.ceil(em * 1.25) + 6
  c.width = w
  c.height = h
  ctx.font = `600 ${em}px "Pixelify Sans"`
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  const base = Math.round(em * 0.95) + 2
  ctx.fillText(text, 3, base)
  const data = ctx.getImageData(0, 0, w, h).data
  let top = h
  let bottom = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 127) ((top = Math.min(top, y)), (bottom = Math.max(bottom, y)))
  const a = art(w, h)
  const p = new Paint(a.px, w, h)
  const span = Math.max(1, bottom - top)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 127) continue
      const v = (y - top) / span
      p.set(x, y, tone(WORD, 4.4 - v * 4.2, x, y))
    }
  }
  // Brown drop under the letters, then the ink edge round both.
  const solid = a.px.slice()
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      if (solid[y * w + x]) continue
      // Not inside a letter's mouth (the C's, the e's): the drop would close it.
      if ([1, 2, 3, 4].some((k) => y + k < h && solid[(y + k) * w + x])) continue
      if (y > 0 && solid[(y - 1) * w + x]) a.px[y * w + x] = C(0x6b4a12)
      else if (y > 1 && solid[(y - 2) * w + x]) a.px[y * w + x] = C(0x6b4a12)
    }
  }
  outline(a)
  return a
}

// A plain bar of gilt with a baklava in its middle (the menu's rule under the title).
function rule(a: Art, x0: number, x1: number, y: number) {
  const p = new Paint(a.px, a.w, a.h)
  const mid = Math.round((x0 + x1) / 2)
  for (let x = x0; x <= x1; x++) {
    p.set(x, y - 1, INK)
    p.set(x, y, tone(GOLD, 3.4 - Math.abs(x - mid) / (x1 - x0) * 2, x, y))
    p.set(x, y + 1, INK)
  }
  for (let dy = -3; dy <= 3; dy++) {
    const half = 3 - Math.abs(dy)
    for (let dx = -half - 1; dx <= half + 1; dx++) p.set(mid + dx, y + dy, Math.abs(dx) === half + 1 ? INK : tone(GOLD, 3.6 - dy * 0.5 - dx * 0.3, mid + dx, y + dy))
  }
}

function crop(a: Art): Art {
  let x0 = a.w
  let y0 = a.h
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (a.px[y * a.w + x]) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)))
  const out = art(x1 - x0 + 3, y1 - y0 + 3)
  blit(out, a, 1 - x0, 1 - y0)
  return out
}

// The horizontal logo: medallion on the left, the name beside it over a gilt rule.
export function logoWide(): Art {
  const b = badge(64)
  const word = crop(wordmark('Crownherald', 36))
  const w = b.w + 6 + word.w
  const a = art(w, 72)
  blit(a, b, 0, 4)
  const wy = 36 - Math.round(word.h / 2) - 3
  blit(a, word, b.w + 6, wy)
  rule(a, b.w + 10, w - 4, wy + word.h + 4)
  return crop(a)
}

// The stacked logo: medallion above the name.
export function logoStacked(): Art {
  const b = badge(60)
  const word = crop(wordmark('Crownherald', 32))
  const w = Math.max(b.w, word.w) + 4
  const a = art(w, b.h + word.h + 12)
  blit(a, b, Math.round((w - b.w) / 2), 0)
  blit(a, word, Math.round((w - word.w) / 2), b.h + 2)
  rule(a, Math.round(w * 0.18), Math.round(w * 0.82), b.h + word.h + 7)
  return crop(a)
}
