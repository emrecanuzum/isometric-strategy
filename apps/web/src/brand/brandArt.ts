import { ENVOY_H, ENVOY_W, paintEnvoy } from '../ui/advisor/EnvoyPortrait'
import { ramp } from '../game/sprites'
import { C, GOLD, Paint, mix, noise, rnd, tone } from '../ui/artKit'
import { frame as sceneFrame, paintScene } from '../ui/home/menuScene'

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

// The favicon: his head alone, 32 art pixels on clear ground. The head is 32 rows from the hat's crown to the chin, so
// it takes the whole height (crown on the top row, chin on the bottom); only the tips of the brim and the plume reach
// past the sides. (It was cut at (-7, -4) and lost the crown and the beard.)
export function favicon(): Art {
  const e = envoy()
  const out = art(32, 32)
  // The portrait's head spans rows 6–37 and columns 9–40 (the envoy art adds a pixel of margin all round).
  blit(out, e, -10, -7)
  outline(out)
  return out
}

// The wordmark, rasterised from Pixelify Sans and re-coloured in gilt bands with an ink edge and a brown drop, as the
// menu's title. Drawn at `cap` art pixels per em; crisp (alpha thresholded), never blurred.
export function wordmark(text: string, em = 22, flat = false): Art {
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
      // Flat gilt (the covers): one colour, so small letters keep their shapes.
      p.set(x, y, flat ? WORD[3] : tone(WORD, 4.4 - v * 4.2, x, y))
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

// A line of plain text (the tagline): Pixelify Sans in parchment with an ink edge, crisp.
function textLine(text: string, em: number, color = C(0xf2e2b8)): Art {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = `400 ${em}px "Pixelify Sans"`
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 6
  const h = Math.ceil(em * 1.4) + 4
  c.width = w
  c.height = h
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 3, Math.round(em * 1.05) + 1)
  const data = ctx.getImageData(0, 0, w, h).data
  const a = art(w, h)
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 127) a.px[i] = color
  outline(a)
  return crop(a)
}

// The tagline on the menu's ribbon: a dark band with gilt lips and notched ends.
function ribbon(text: string, em: number): Art {
  const t = textLine(text, em)
  const w = t.w + 22
  const h = t.h + 6
  const a = art(w, h)
  const p = new Paint(a.px, w, h)
  for (let y = 0; y < h; y++) {
    const notch = Math.round(5 * (1 - Math.abs(y - (h - 1) / 2) / ((h - 1) / 2)))
    for (let x = notch; x < w - notch; x++) {
      const edge = x === notch || x === w - notch - 1 || y === 0 || y === h - 1
      p.set(x, y, edge ? INK : y === 1 ? C(0xd9aa3e) : y === h - 2 ? C(0x6b4a12) : C(0x1a120e))
    }
  }
  blit(a, t, 11, 3)
  return a
}

// Nearest-neighbour enlargement by a whole number.
function grow(a: Art, k: number): Art {
  const out = art(a.w * k, a.h * k)
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = a.px[Math.floor(y / k) * a.w + Math.floor(x / k)]
  return out
}

// Darkens the scene towards the night colour where the words sit, in dithered quarter steps (no blur).
function shade(a: Art, k: (x: number, y: number) => number) {
  const p = new Paint(a.px, a.w, a.h)
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) p.tint(x, y, C(0x05060e), k(x, y))
}

export type Shape = 'square' | 'wide' | 'tall'

// The thumbnail: the menu's dusk panorama, the envoy's medallion at twice the art pixel, the name and the tagline on
// its ribbon. 270 art pixels on the short side (the panorama is drawn for about that height), exported at 4×.
export function thumbnail(shape: Shape, tagline: string): Art {
  const [w, h] = shape === 'wide' ? [480, 270] : shape === 'tall' ? [270, 480] : [270, 270]
  const sc = paintScene(w, h)
  const a = art(w, h)
  sceneFrame(sc, 3.2, a.px)
  const b = grow(badge(64), 2)
  if (shape === 'wide') {
    const word = crop(wordmark('Crownherald', 40))
    const rib = ribbon(tagline, 12)
    const bx = 28
    const by = Math.round((h - b.h) / 2) - 18
    const tx = bx + b.w + 14
    const ty = by + 30
    shade(a, (x, y) => 0.75 - Math.hypot((x - (tx + word.w / 2 - 50)) / 300, (y - ty - 20) / 120))
    blit(a, b, bx, by)
    blit(a, word, tx, ty)
    rule(a, tx + 4, tx + word.w - 4, ty + word.h + 5)
    blit(a, rib, tx + Math.round((word.w - rib.w) / 2), ty + word.h + 14)
  } else {
    const word = crop(wordmark('Crownherald', shape === 'tall' ? 38 : 36))
    const rib = ribbon(tagline, shape === 'tall' ? 11 : 10)
    const by = shape === 'tall' ? 64 : 14
    const wy = by + b.h + 6
    shade(a, (x, y) => 0.7 - Math.hypot((x - w / 2) / 220, (y - wy - 10) / (shape === 'tall' ? 200 : 120)))
    blit(a, b, Math.round((w - b.w) / 2), by)
    blit(a, word, Math.round((w - word.w) / 2), wy)
    rule(a, Math.round(w / 2 - word.w / 2 + 6), Math.round(w / 2 + word.w / 2 - 6), wy + word.h + 5)
    blit(a, rib, Math.round((w - rib.w) / 2), wy + word.h + 14)
  }
  return a
}

// The YouTube channel banner: 2560 × 1440 at 5× (512 × 288 art pixels). Everything that matters sits in the band every
// device shows, 1546 × 423 in the middle (309 × 85 art pixels); TVs show the whole panorama around it.
export function banner(tagline: string): Art {
  const w = 512
  const h = 288
  const sc = paintScene(w, h)
  const a = art(w, h)
  sceneFrame(sc, 3.2, a.px)
  const b = badge(64)
  const word = crop(wordmark('Crownherald', 34))
  const rib = ribbon(tagline, 10)
  const gap = 8
  const block = b.w + gap + Math.max(word.w, rib.w)
  const bx = Math.round((w - block) / 2)
  const by = Math.round((h - b.h) / 2)
  const tx = bx + b.w + gap
  const ty = Math.round(h / 2 - (word.h + 12 + rib.h) / 2)
  shade(a, (x, y) => 0.8 - Math.hypot((x - w / 2) / 230, (y - h / 2) / 70))
  blit(a, b, bx, by)
  blit(a, word, tx, ty)
  rule(a, tx + 4, tx + word.w - 4, ty + word.h + 4)
  blit(a, rib, tx + Math.round((word.w - rib.w) / 2), ty + word.h + 11)
  return a
}

// A music video's cover: one of the game's event or news scenes at twice the art pixel (512 × 256) under the name and
// one of the envoy's quips on the menu's ribbon, with the piece's title on a band below in the piece's own colours, the
// envoy's medallion at its left end. 512 × 288 art pixels, exported at 5× (2560 × 1440).
export function cover(scene: { draw: (p: Paint) => void; fx?: (p: Paint, t: number) => void }, title: string, quip: string, band: [number, number, number], t = 2.4): Art {
  const w = 512
  const h = 288
  const small = art(256, 128)
  small.px.fill(C(0x000000)) // as the game's still layer: a scene may leave a seam unpainted
  const sp = new Paint(small.px, 256, 128)
  scene.draw(sp)
  scene.fx?.(sp, t)
  const a = art(w, h)
  blit(a, scale2x(soften(small)), 0, 0)
  const word = crop(wordmark('Crownherald', 34, true))
  const rib = ribbon(quip, 10)
  const wy = 10
  // The scene a little darker overall, and a smooth veil behind the words (no dither, so no grille over the scene).
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < w; x++) {
      const k = Math.max(0.22, Math.min(0.72, 0.85 - Math.hypot((x - w / 2) / 260, (y - wy - 24) / 46)))
      if (k > 0) a.px[y * w + x] = mix(a.px[y * w + x], C(0x05060e), k)
    }
  }
  blit(a, word, Math.round((w - word.w) / 2), wy)
  rule(a, Math.round(w / 2 - word.w / 2 + 6), Math.round(w / 2 + word.w / 2 - 6), wy + word.h + 4)
  blit(a, rib, Math.round((w - rib.w) / 2), wy + word.h + 12)
  // The band: dark ground of the piece's colour, gilt lips, the title in gilt letters.
  const p = new Paint(a.px, w, h)
  const [dark, mid, lip] = band.map((c) => C(c))
  for (let y = 256; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y === 256 || y === h - 1) p.set(x, y, INK)
      else if (y === 257) p.set(x, y, C(0xd9aa3e))
      else if (y === 258) p.set(x, y, lip)
      else if (y === h - 2) p.set(x, y, C(0x6b4a12))
      else p.set(x, y, mix(mid, dark, 0.35 + ((y - 259) / 26) * 0.5))
    }
  }
  const name = crop(wordmark(title, 27, true))
  blit(a, name, Math.round((w - name.w) / 2), 272 - Math.round(name.h / 2))
  const b = badge(64)
  blit(a, b, 6, h - b.h - 4)
  return a
}

// Scale2x (EPX): doubles a picture and rounds its diagonal steps instead of making each pixel a 2 × 2 block, so a
// 256 × 128 scene sits at the covers' finer pixel without looking blown up.
function scale2x(a: Art): Art {
  const out = art(a.w * 2, a.h * 2)
  const at = (x: number, y: number) => a.px[Math.min(a.h - 1, Math.max(0, y)) * a.w + Math.min(a.w - 1, Math.max(0, x))]
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const P = at(x, y)
      const A = at(x, y - 1)
      const B = at(x + 1, y)
      const Cc = at(x - 1, y)
      const D = at(x, y + 1)
      const e0 = Cc === A && Cc !== D && A !== B ? A : P
      const e1 = A === B && A !== Cc && B !== D ? B : P
      const e2 = D === Cc && D !== B && Cc !== A ? Cc : P
      const e3 = B === D && B !== A && D !== Cc ? D : P
      const o = y * 2 * out.w + x * 2
      out.px[o] = e0
      out.px[o + 1] = e1
      out.px[o + out.w] = e2
      out.px[o + out.w + 1] = e3
    }
  }
  return out
}

// Where two colours meet in a checkerboard (the scenes' 50 % dither), each pixel takes their mean, so a large cover
// shows the tone instead of a grille. Sparser dither (scattered dots, the edges of a glow) is kept.
function soften(a: Art): Art {
  const out = art(a.w, a.h)
  out.px.set(a.px)
  for (let y = 1; y < a.h - 1; y++) {
    for (let x = 1; x < a.w - 1; x++) {
      const i = y * a.w + x
      const P = a.px[i]
      const Q = a.px[i - 1]
      if (Q === P || a.px[i + 1] !== Q || a.px[i - a.w] !== Q || a.px[i + a.w] !== Q) continue
      if (a.px[i - a.w - 1] !== P || a.px[i + a.w + 1] !== P) continue
      out.px[i] = mix(P, Q, 0.5)
    }
  }
  return out
}

type SceneLike = { draw: (p: Paint) => void; fx?: (p: Paint, t: number) => void }

// One of the game's scenes at the covers' pixel: painted at 256 × 128, its checkerboards evened, doubled by Scale2x.
function sceneArt(scene: SceneLike, t = 2.4): Art {
  const small = art(256, 128)
  small.px.fill(C(0x000000))
  const sp = new Paint(small.px, 256, 128)
  scene.draw(sp)
  scene.fx?.(sp, t)
  return scale2x(soften(small))
}

// The soundtrack's album cover (3000 × 3000 at 10×; 300 × 300 art pixels): a rose window. The envoy's medallion at its
// heart, round it five panes of lead and gilt, each a glimpse of one piece's scene (`panes`: the scene and the point
// of it to show, in its 512 × 256 pixels), clockwise from the top; gilt rays on a night sky behind, the name above and
// the ribbon below.
export function album(panes: [SceneLike, number, number][], subtitle: string): Art {
  const S = 300
  const cx = 150
  const cy = 160
  const r0 = 68
  const r1 = 114
  const a = art(S, S)
  const p = new Paint(a.px, S, S)
  sky(p, S, S, cx, cy, 23)
  // Gilt rays fanning out from the window, smooth (no dither).
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d < r1) continue
      const ang = Math.atan2(y - cy, x - cx)
      const ray = Math.max(0, Math.cos(ang * 12)) ** 6
      const k = ray * Math.max(0, 1 - (d - r1) / 120) * 0.42
      if (k > 0.01) a.px[y * S + x] = mix(a.px[y * S + x], C(0xf2b84a), k)
    }
  }
  const scenes = panes.map(([sc]) => sceneArt(sc))
  const n = panes.length
  const step = (Math.PI * 2) / n
  const start = -Math.PI / 2 - step / 2
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d < r0 || d > r1) continue
      let ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx) - start
      ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const i = Math.floor(ang / step)
      const mid = start + (i + 0.5) * step
      const px0 = cx + Math.cos(mid) * (r0 + r1) / 2
      const py0 = cy + Math.sin(mid) * (r0 + r1) / 2
      const [, fx, fy] = panes[i]
      const sx = Math.round(x - px0 + fx)
      const sy = Math.round(y - py0 + fy)
      const sc = scenes[i]
      const c = sc.px[Math.min(sc.h - 1, Math.max(0, sy)) * sc.w + Math.min(sc.w - 1, Math.max(0, sx))]
      // Old glass: a touch darker towards the lead.
      const edge = Math.min(d - r0, r1 - d, Math.abs(ang - (i + 0.5) * step) < step / 2 ? (step / 2 - Math.abs(ang - (i + 0.5) * step)) * d : 99)
      a.px[y * S + x] = mix(c, C(0x05060e), edge < 4 ? 0.35 - edge * 0.06 : 0.1)
    }
  }
  // The lead between the panes: ink with a gilt core.
  for (let i = 0; i < n; i++) {
    const ang = start + i * step
    for (let d = r0; d <= r1; d += 0.25) {
      const x = cx + Math.cos(ang) * d
      const y = cy + Math.sin(ang) * d
      const nx = -Math.sin(ang)
      const ny = Math.cos(ang)
      for (const o of [-1.5, -0.75, 0.75, 1.5]) p.set(x + nx * o, y + ny * o, INK)
      p.set(x, y, tone(RING, 3.2 - Math.cos(ang + 0.8) * 1.2, Math.round(x), Math.round(y)))
    }
  }
  ring(p, cx, cy, r1 + 4, 5)
  ring(p, cx, cy, r0 + 1, 3)
  // The envoy at the heart, at the covers' pixel.
  const b = scale2x(badge(64))
  blit(a, b, Math.round(cx - b.w / 2), Math.round(cy - b.h / 2))
  const word = crop(wordmark('Crownherald', 36, true))
  blit(a, word, Math.round((S - word.w) / 2), 6)
  const rib = ribbon(subtitle, 11)
  blit(a, rib, Math.round((S - rib.w) / 2), S - rib.h - 6)
  return a
}
