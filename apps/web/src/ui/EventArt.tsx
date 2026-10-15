import { useEffect, useRef } from 'react'
import { BAYER, LEAF, rgb, ramp, SPRITES, type Sprite } from '../game/sprites'

// Illustrations for the day's events (günün olayları): a small hi-bit painting per event, drawn in code pixel by pixel.
// Each scene is a still layer painted once (and kept) plus, for most, a few moving touches drawn over it each frame:
// rain, flames, smoke, fog, twinkling stars. Colours come in short ramps, tones meet in ordered dither, never blur.

const W = 256
const H = 128

// ---- Tools -----------------------------------------------------------------------------------------------------------

const bay = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)]
const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

// A small integer hash in [0, 1): the pictures are the same every time.
function rnd(x: number, y = 0, s = 0) {
  let n = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
const ease = (t: number) => t * t * (3 - 2 * t)
function noise(x: number, y = 0, s = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = ease(x - xi)
  const fy = ease(y - yi)
  const a = rnd(xi, yi, s)
  const b = rnd(xi + 1, yi, s)
  const c = rnd(xi, yi + 1, s)
  const d = rnd(xi + 1, yi + 1, s)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}
function fbm(x: number, y: number, s: number, octaves = 3) {
  let v = 0
  let amp = 0.5
  let sum = 0
  for (let i = 0; i < octaves; i++) {
    v += noise(x, y, s + i * 17) * amp
    sum += amp
    amp *= 0.5
    x *= 2
    y *= 2
  }
  return v / sum
}

// Colours are canvas words (see sprites.ts `rgb`); `mix` blends two of them.
function mix(a: number, b: number, t: number) {
  const ar = a & 255
  const ag = (a >>> 8) & 255
  const ab = (a >>> 16) & 255
  const r = Math.round(ar + ((b & 255) - ar) * t)
  const g = Math.round(ag + (((b >>> 8) & 255) - ag) * t)
  const bl = Math.round(ab + (((b >>> 16) & 255) - ab) * t)
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0
}

// A tone of a ramp (0 … length-1), dithered in a narrow band where two tones meet.
function tone(r: ArrayLike<number>, t: number, x: number, y: number) {
  const n = r.length - 1
  const v = clamp(t, 0, n)
  const i = Math.floor(v)
  const f = clamp((v - i - 0.5) * 2 + 0.5)
  return r[Math.min(n, f > bay(x, y) ? i + 1 : i)]
}

type Shade = number | ((x: number, y: number) => number | undefined)

class Paint {
  px: Uint32Array
  // While set, everything drawn is veiled towards a colour (night, fog, distance).
  veilColor = 0
  veilK = 0
  constructor(px: Uint32Array) {
    this.px = px
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    this.px[y * W + x] = this.veilK > 0 ? mix(c, this.veilColor, this.veilK) : c
  }
  get(x: number, y: number) {
    x = Math.round(x)
    y = Math.round(y)
    return x < 0 || y < 0 || x >= W || y >= H ? 0 : this.px[y * W + x]
  }
  // Blends towards a colour by t, in quarter steps picked by the dither matrix (light, fog, shadow).
  tint(x: number, y: number, c: number, t: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (t <= 0 || x < 0 || y < 0 || x >= W || y >= H) return
    const q = Math.min(1, Math.floor(t * 4 + bay(x, y)) / 4)
    if (q <= 0) return
    const i = y * W + x
    this.px[i] = q >= 1 ? c : mix(this.px[i], c, q)
  }
  // A dithered dot: drawn where t beats the matrix.
  dot(x: number, y: number, c: number, t: number) {
    if (t > bay(Math.round(x), Math.round(y))) this.set(x, y, c)
  }
  veil(c: number, k: number, draw: () => void) {
    const [pc, pk] = [this.veilColor, this.veilK]
    this.veilColor = c
    this.veilK = k
    draw()
    this.veilColor = pc
    this.veilK = pk
  }
  box(x0: number, y0: number, x1: number, y1: number, s: Shade) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const c = typeof s === 'number' ? s : s(x, y)
        if (c !== undefined) this.set(x, y, c)
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, s: Shade) {
    this.box(x, y, x + w, y + h, s)
  }
  // A filled polygon (x, y pairs), sampled at pixel centres.
  poly(pts: number[], s: Shade) {
    let top = Infinity
    let bottom = -Infinity
    for (let i = 1; i < pts.length; i += 2) {
      top = Math.min(top, pts[i])
      bottom = Math.max(bottom, pts[i])
    }
    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(H - 1, Math.ceil(bottom)); y++) {
      const cy = y + 0.5
      const xs: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        const ax = pts[i]
        const ay = pts[i + 1]
        const bx = pts[(i + 2) % pts.length]
        const by = pts[(i + 3) % pts.length]
        if (ay <= cy !== by <= cy) xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
      }
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
          const c = typeof s === 'number' ? s : s(x, y)
          if (c !== undefined) this.set(x, y, c)
        }
      }
    }
  }
  disc(cx: number, cy: number, rx: number, ry: number, s: Shade) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy > 1) continue
        const c = typeof s === 'number' ? s : s(x, y)
        if (c !== undefined) this.set(x, y, c)
      }
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0)
    y0 = Math.round(y0)
    x1 = Math.round(x1)
    y1 = Math.round(y1)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      this.set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }
  // A game sprite stood at (x, y) by its anchor; `scale` below 1 samples it nearest-neighbour.
  sprite(s: Sprite, x: number, y: number, o: { flip?: boolean; scale?: number } = {}) {
    const k = o.scale ?? 1
    const w = Math.round(s.width * k)
    const h = Math.round(s.height * k)
    const ox = Math.round(x - s.anchorX * k)
    const oy = Math.round(y - s.anchorY * k)
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const sx = Math.min(s.width - 1, Math.floor((o.flip ? w - 1 - tx : tx) / k))
        const sy = Math.min(s.height - 1, Math.floor(ty / k))
        const c = s.pixels[sy * s.width + sx]
        const a = c >>> 24
        if (a === 0) continue
        if (a >= 200) this.set(ox + tx, oy + ty, (c | 0xff000000) >>> 0)
        else this.tint(ox + tx, oy + ty, (c | 0xff000000) >>> 0, a / 255)
      }
    }
  }
}

// ---- Palettes --------------------------------------------------------------------------------------------------------

const C = rgb
const INK = C(0x14101a)
const SKINS = [ramp(0x8a5236, 0xc58a62, 0xecba90), ramp(0x6a3c26, 0xa06a46, 0xcc9466), ramp(0x47291b, 0x75482e, 0x9e6c48)]
const HAIR = [C(0x2a1c14), C(0x5a3a1e), C(0x8a6a3a), C(0x1a1a1e), C(0xa8a090)]
const ROBE = {
  red: ramp(0x5a1e22, 0x8f3030, 0xc0503c),
  blue: ramp(0x1e2c4f, 0x34507a, 0x5878a8),
  green: ramp(0x22402a, 0x3a6a3a, 0x5c9450),
  brown: ramp(0x3f2a1c, 0x6b4a2e, 0x93704a),
  ochre: ramp(0x6a4a1a, 0x9c7428, 0xc8a040),
  grey: ramp(0x3a3a44, 0x5c5c66, 0x86868e),
  white: ramp(0x8a8478, 0xc8c0ae, 0xeee6d2),
  purple: ramp(0x3a2346, 0x5e3a6e, 0x8a5a96),
  black: ramp(0x121216, 0x22222a, 0x383842),
  teal: ramp(0x153c40, 0x24626a, 0x3c8e92),
  rose: ramp(0x6a2440, 0x9c3a5a, 0xcc6080),
}
const WOOD = ramp(0x2a1a12, 0x4a3020, 0x6e4a2e, 0x936a40, 0xb48a58)
const STONE = ramp(0x2a2834, 0x44424e, 0x63606a, 0x85818a, 0xa8a4a6, 0xcac6c0)
const PLASTER = ramp(0x6e5e4a, 0x9a8670, 0xc2ae90, 0xdcccac, 0xeee2c6)
const TILE = ramp(0x3e1a1a, 0x62262a, 0x8a3630, 0xae4a38, 0xcc6a48)
const THATCH = ramp(0x4a3418, 0x6e5024, 0x967030, 0xbc9440, 0xdcb85c)
const SLATE = ramp(0x1e2230, 0x2e3446, 0x434a5e, 0x5c6478, 0x7a8294)
const GOLD = ramp(0x5a3a0e, 0x8e6216, 0xc8952e, 0xf2d16b, 0xfff4c0)
const GRASS = ramp(0x1c3a28, 0x2a5232, 0x3d6e3a, 0x548c44, 0x74a852, 0x9cc464)
const SAND = ramp(0x8a6236, 0xa87c46, 0xc49a5a, 0xdcb874, 0xeed294, 0xf8e8b8)
const DIRT = ramp(0x2e1e14, 0x4a3220, 0x6a4a2e, 0x8a6640, 0xa8845a)
const FIRE = ramp(0x6a160c, 0xb0300e, 0xe8661a, 0xfaa630, 0xffe070, 0xfffbe0)
const SNOW = ramp(0x5a6a8a, 0x7e90ae, 0xa6b6cc, 0xccd8e6, 0xeef4fa, 0xffffff)

// ---- Scenery ---------------------------------------------------------------------------------------------------------

// A dithered vertical gradient through the stops, between rows y0 and y1; `bend` shifts the gradient per pixel.
function sky(p: Paint, stops: ArrayLike<number>, y0 = 0, y1 = H, bend?: (x: number, y: number) => number) {
  const n = stops.length - 1
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = 0; x < W; x++) {
      const t = (y - y0) / (y1 - y0) + (bend ? bend(x, y) : 0)
      p.px[y * W + x] = tone(stops, t * n, x, y)
    }
  }
}

// A soft round glow, stepped in dithered rings.
function glow(p: Paint, cx: number, cy: number, r: number, c: number, max: number, squash = 1) {
  for (let y = Math.floor(cy - r * squash); y <= cy + r * squash; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash) / r
      if (d < 1) p.tint(x, y, c, max * (1 - d) * (1 - d))
    }
  }
}

// Land under a ridge line: shaded by depth below the ridge.
function land(p: Paint, ridge: (x: number) => number, shade: (x: number, y: number, depth: number) => number | undefined, bottom = H) {
  for (let x = 0; x < W; x++) {
    const top = Math.round(ridge(x))
    for (let y = Math.max(0, top); y < bottom; y++) {
      const c = shade(x, y, y - top)
      if (c !== undefined) p.set(x, y, c)
    }
  }
}

// A lit ball (canopy, cloud, sack, moon): light from the upper left; `rough` frays its edge and grains it.
function ball(p: Paint, cx: number, cy: number, rx: number, ry: number, r: ArrayLike<number>, o: { rough?: number; seed?: number; bias?: number; flat?: number } = {}) {
  const seed = o.seed ?? 1
  const rough = o.rough ?? 0
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      let d = nx * nx + ny * ny
      if (rough) d += (noise(x * 0.5, y * 0.5, seed) - 0.5) * rough
      if (d > 1) continue
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      let l = (-nx * 0.55 - ny * 0.65 + nz * (o.flat ?? 0.55) + 0.35) / 1.25
      if (rough) l += (rnd(x, y, seed) - 0.5) * rough * 0.5
      p.set(x, y, tone(r, l * (r.length - 1) + (o.bias ?? 0), x, y))
    }
  }
}

// A heap of puffs: a cloud or a canopy.
function cluster(p: Paint, cx: number, cy: number, w: number, h: number, r: ArrayLike<number>, seed: number, n = 7, o: { rough?: number; bias?: number } = {}) {
  const puffs: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = rnd(i, seed, 3)
    const px = cx + (a - 0.5) * w
    const py = cy + (rnd(i, seed, 4) - 0.3) * h * 0.5 - Math.cos((a - 0.5) * Math.PI) * h * 0.25
    puffs.push([px, py, (0.35 + rnd(i, seed, 5) * 0.4) * Math.min(w, h * 1.6) * 0.5])
  }
  puffs.sort((a, b) => a[1] - b[1])
  for (const [x, y, rad] of puffs) ball(p, x, y, rad, rad * 0.85, r, { rough: o.rough ?? 0.25, seed: seed + Math.round(x), bias: o.bias })
}

function cloud(p: Paint, cx: number, cy: number, w: number, h: number, r: ArrayLike<number>, seed: number) {
  cluster(p, cx, cy, w, h, r, seed, Math.max(5, Math.round(w / 6)), { rough: 0.15 })
}

// Shadow on the ground: an ellipse darkened by k.
function shadow(p: Paint, cx: number, cy: number, rx: number, ry = 2, k = 0.45, c = C(0x101018)) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
      if (d < 1) p.tint(x, y, c, k * (d < 0.5 ? 1 : 0.6))
    }
  }
}

// A round broadleaf tree: trunk and a heap of lit puffs.
function roundTree(p: Paint, x: number, y: number, r: number, leaves: ArrayLike<number>, seed: number) {
  shadow(p, x + r * 0.4, y, r * 0.9, 2)
  p.rect(x - 1, y - r - 2, 2, r + 2, (_, yy) => tone(WOOD, 1 + (yy % 3 === 0 ? 0 : 0.6), x, yy))
  p.set(x - 1, y - 1, WOOD[2])
  cluster(p, x, y - r * 1.5, r * 2.2, r * 1.8, leaves, seed, 8)
}

// A fir: tiers of drooping boughs, lit on the left, maybe snow on them.
function conifer(p: Paint, x: number, y: number, h: number, leaves: ArrayLike<number>, o: { snow?: boolean; seed?: number; char?: boolean } = {}) {
  const seed = o.seed ?? 1
  p.rect(x - 1, y - 3, 2, 3, WOOD[1])
  const tiers = Math.max(3, Math.round(h / 6))
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers
    const by = y - 2 - t0 * (h - 4)
    const half = (1 - t0) * h * 0.32 + 2
    const th = (h / tiers) * 1.7
    p.poly([x, by - th, x + half, by, x - half, by], (px, py) => {
      const u = (px - x) / half
      const v = (py - (by - th)) / th
      let l = 2.6 - u * 1.6 - v * 0.6 + (rnd(px, py, seed) - 0.5) * 0.8
      if (py >= by - 1) l -= 1
      if (o.snow && v < 0.55 + noise(px * 0.6, py, seed) * 0.4 - (py >= by - 1 ? 1 : 0) && u < 0.6) return tone(SNOW, 3.5 - u * 1.5, px, py)
      return tone(leaves, l, px, py)
    })
  }
  if (o.snow) p.set(x, y - h + 1, SNOW[5])
}

interface HouseLook {
  w: number
  d: number
  h: number
  wall?: ArrayLike<number>
  roof?: ArrayLike<number>
  timber?: boolean
  lit?: boolean
  snow?: boolean
  door?: 'shut' | 'open' | 'cross' | 'barn' | 'none'
  chimney?: boolean
  shutters?: boolean
  windows?: number
  icicles?: boolean
}

// A house seen from the front corner: its gable end lit on the left, the long side in shade, the near roof slope.
// Returns where its chimney top is, if it has one.
function house(p: Paint, x: number, y: number, o: HouseLook): [number, number] | null {
  const wall = o.wall ?? PLASTER
  const roof = o.roof ?? TILE
  const { w, d, h } = o
  const half = Math.floor(w / 2)
  const apex = y - h - half
  shadow(p, x + w + d * 0.6, y, d * 0.7 + 3, 2.5, 0.5)
  // Gable wall (lit) and its triangle.
  p.box(x, y - h, x + w, y, (px, py) => tone(wall, 3.2 - (py - (y - h)) / h * 0.9 - (px === x + w - 1 ? 1 : 0), px, py))
  for (let r = 1; r <= half; r++) p.box(x + r, y - h - r, x + w - r, y - h - r + 1, (px, py) => tone(wall, 3.4, px, py))
  // Long side (shaded).
  p.box(x + w, y - h, x + w + d, y, (px, py) => tone(wall, 1.6 - (py - (y - h)) / h * 0.5 + (rnd(px, py, 9) - 0.5) * 0.3, px, py))
  if (o.timber !== false) {
    const t = WOOD[1]
    p.line(x, y - h, x + w - 1, y - h, t)
    p.line(x, y - h, x, y - 1, t)
    p.line(x + w - 1, y - h, x + w - 1, y - 1, WOOD[0])
    p.line(x + w, y - h, x + w + d - 1, y - h, WOOD[0])
    p.line(x + w + d - 1, y - h, x + w + d - 1, y - 1, WOOD[0])
    if (h > 9) p.line(x + w, y - Math.round(h / 2), x + w + d - 1, y - Math.round(h / 2), WOOD[0])
    for (let i = 1; i < Math.floor(d / 8) + 1; i++) {
      const bx = x + w + Math.round((d * i) / (Math.floor(d / 8) + 1))
      p.line(bx, y - h, bx, y - 1, WOOD[0])
    }
  }
  // Stone footing.
  p.box(x, y - 2, x + w + d, y, (px, py) => ((px + (py & 1) * 2) % 4 === 0 ? STONE[1] : tone(STONE, px < x + w ? 3 : 2, px, py)))
  // The near roof slope over the long side, then the barge board along the gable's edges.
  const ridgeY = apex - 1
  const eaveY = y - h + 1
  const snowLine = (px: number) => 0.45 + noise(px * 0.35, 0, 7) * 0.35
  p.poly([x + half, ridgeY, x + half + d + 1, ridgeY, x + w + d + 2, eaveY + 1, x + w - 1, eaveY + 1], (px, py) => {
    const u = (py - ridgeY) / (eaveY + 1 - ridgeY)
    if (o.snow && u < snowLine(px)) return tone(SNOW, 4.6 - u * 2, px, py)
    const row = Math.floor(u * 6)
    const seam = (px + row * 2) % 5 === 0
    const edge = Math.floor((u * 6 - row) * 3) === 2
    return tone(roof, 3.2 - u * 1.4 - (edge ? 1.2 : 0) - (seam ? 0.6 : 0) + (rnd(px, py, 3) - 0.5) * 0.4, px, py)
  })
  for (let r = 0; r <= half + 1; r++) {
    const c = o.snow ? SNOW[4] : roof[1]
    p.set(x - 1 + r, y - h - r + 1, c)
    p.set(x + r, y - h - r + 1, o.snow ? SNOW[3] : roof[0])
    p.set(x + w - r, y - h - r + 1, o.snow ? SNOW[3] : roof[1])
  }
  if (o.icicles) {
    for (let px = x + w; px < x + w + d + 1; px += 2) {
      const len = 1 + Math.floor(rnd(px, 1, 4) * 4)
      for (let k = 0; k < len; k++) p.set(px, eaveY + 1 + k, k === 0 ? SNOW[5] : SNOW[3])
    }
  }
  // Door on the gable.
  const dx = x + Math.floor((w - 4) / 2)
  if (o.door === 'barn') {
    const dw = w - 6
    p.box(x + 3, y - h + 3, x + 3 + dw, y, (px, py) => tone(WOOD, (px - x) % 3 === 0 ? 1 : 2.4, px, py))
    p.line(x + 3, y - h + 3, x + 2 + dw, y - 1, WOOD[1])
    p.line(x + 2 + dw, y - h + 3, x + 3, y - 1, WOOD[1])
  } else if (o.door !== 'none') {
    p.box(dx, y - 7, dx + 4, y, (px, py) => (o.door === 'open' ? (px === dx ? WOOD[2] : tone(FIRE, 3.5 - (py - (y - 7)) * 0.3, px, py)) : tone(WOOD, px === dx ? 1.5 : 2.6, px, py)))
    p.line(dx, y - 8, dx + 3, y - 8, WOOD[1])
    if (o.door === 'cross') {
      const red = C(0xd02a1c)
      p.line(dx + 1, y - 7, dx + 1, y - 2, red)
      p.line(dx + 2, y - 7, dx + 2, y - 2, red)
      p.line(dx, y - 5, dx + 3, y - 5, red)
      p.line(dx, y - 6, dx + 3, y - 6, red)
    }
  }
  // Windows down the long side and one in the gable.
  const lit = C(0xffd870)
  const n = o.windows ?? Math.max(1, Math.floor(d / 9))
  for (let i = 0; i < n; i++) {
    const wx = x + w + Math.round(((i + 0.5) * d) / n) - 1
    const wy = y - h + Math.max(2, Math.round(h * 0.3))
    p.rect(wx - 1, wy - 1, 4, 5, WOOD[0])
    p.rect(wx, wy, 2, 3, o.lit ? lit : C(0x1e2230))
    if (o.lit) {
      p.set(wx, wy, C(0xfff6c0))
      glow(p, wx + 1, wy + 1.5, 7, C(0xffb040), 0.45)
    } else p.set(wx, wy, C(0x3a4660))
    if (o.shutters) {
      p.rect(wx - 2, wy - 1, 1, 5, WOOD[2])
      p.rect(wx + 2, wy - 1, 1, 5, WOOD[2])
      p.rect(wx, wy, 2, 3, WOOD[2])
      p.set(wx, wy + 1, WOOD[1])
      p.set(wx + 1, wy + 1, WOOD[1])
    }
  }
  if (half >= 4) {
    const gx = x + half - 1
    const gy = y - h - Math.floor(half / 2) - 1
    p.rect(gx, gy, 2, 2, o.lit ? lit : C(0x1e2230))
  }
  if (o.chimney) {
    const cx = x + half + Math.round(d * 0.65)
    p.box(cx, ridgeY - 4, cx + 3, ridgeY + 3, (px, py) => tone(STONE, px === cx ? 3.5 : 2, px, py))
    p.line(cx - 1, ridgeY - 4, cx + 3, ridgeY - 4, STONE[1])
    if (o.snow) p.line(cx - 1, ridgeY - 5, cx + 3, ridgeY - 5, SNOW[5])
    return [cx + 1, ridgeY - 6]
  }
  return null
}

// ---- People and beasts -----------------------------------------------------------------------------------------------

type Pose =
  | 'stand' | 'walk' | 'up' | 'point' | 'pray' | 'brow' | 'carry' | 'pick' | 'dig' | 'staff' | 'wave' | 'lute' | 'drum'
  | 'pipe' | 'hold' | 'lead' | 'shiver' | 'dance' | 'spear' | 'scythe' | 'cane' | 'bowl' | 'pan'
type Hat = 'none' | 'hood' | 'straw' | 'cap' | 'beak' | 'turban' | 'scarf' | 'helm' | 'veil'

interface Who {
  robe: ArrayLike<number>
  skin?: number
  hair?: number
  hat?: Hat
  hatColor?: number
  pose?: Pose
  frame?: number
  flip?: boolean
  kneel?: boolean
  legs?: number
}

// A villager, 16 pixels tall, standing on row y (feet on y - 1) and facing right (or left, flipped); lit from the left.
function person(p: Paint, x: number, y: number, w: Who) {
  const f = w.flip ? -1 : 1
  const R = w.robe
  const S = SKINS[w.skin ?? 0]
  const fr = w.frame ?? 0
  const pose = w.pose ?? 'stand'
  const k = w.kneel ? 4 : 0
  const at = (dx: number, dy: number, c: number) => p.set(x + dx * f, y + dy, c)
  const cloth = (dx: number, dy: number, darker = 0) => {
    const sx = dx * f
    at(dx, dy, R[Math.max(0, (sx <= -2 ? 2 : sx >= 2 ? 0 : 1) - darker)])
  }
  const wood = WOOD[2]
  const metal = STONE[4]
  shadow(p, x + 2, y, 5, 1.5, 0.4)
  // Hands (back, front) for the pose, and any tool held.
  let back: [number, number] = [-3, -6]
  let front: [number, number] = [3, -6]
  let tool: (() => void) | null = null
  const sw = fr % 2 === 1
  switch (pose) {
    case 'walk':
    case 'lead':
      back = sw ? [-2, -6] : [-3, -7]
      front = pose === 'lead' ? [5, -8] : sw ? [3, -7] : [2, -6]
      if (pose === 'lead') tool = () => p.line(x + 5 * f, y - 8, x + 9 * f, y - 10, C(0x8a6a40))
      break
    case 'up':
      back = [-4, -16 - (sw ? 1 : 0)]
      front = [4, -16 - (sw ? 0 : 1)]
      break
    case 'point':
      front = [5, -15]
      break
    case 'wave':
      front = sw ? [4, -16] : [5, -14]
      break
    case 'pray':
      back = [1, -9]
      front = [2, -9]
      break
    case 'brow':
      front = [1, -15]
      break
    case 'shiver':
      back = [1, -9]
      front = [0, -8]
      break
    case 'hold':
    case 'bowl':
      back = [2, -8]
      front = [3, -8]
      if (pose === 'bowl') tool = () => {
        at(3, -8, STONE[4])
        at(4, -8, STONE[3])
        at(2, -8, STONE[4])
        at(3, -9, C(0x8ab8c0))
      }
      break
    case 'carry':
      front = [4, -7]
      tool = () => {
        for (let dy = -6; dy <= -3; dy++) for (let dx = 3; dx <= 6; dx++) at(dx, dy, dy === -6 ? WOOD[1] : tone(WOOD, dx * f < 4 * f ? 3 : 2, x + dx, y + dy))
        at(4, -7, STONE[3])
        at(5, -7, STONE[3])
        at(4, -6, C(0x5a8ab8))
        at(5, -6, C(0x7aaad0))
      }
      break
    case 'pick':
      if (!sw) {
        back = [1, -14]
        front = [2, -14]
        tool = () => {
          p.line(x + 2 * f, y - 14, x - 2 * f, y - 20, wood)
          p.line(x - 5 * f, y - 19, x + 1 * f, y - 22, metal)
          at(-5, -18, STONE[2])
        }
      } else {
        back = [3, -8]
        front = [4, -9]
        tool = () => {
          p.line(x + 4 * f, y - 9, x + 9 * f, y - 4, wood)
          p.line(x + 7 * f, y - 1, x + 11 * f, y - 7, metal)
        }
      }
      break
    case 'dig':
      back = [1, -10 + (sw ? 2 : 0)]
      front = [4, -6 + (sw ? 1 : 0)]
      tool = () => {
        p.line(x - 1 * f, y - 13 + (sw ? 2 : 0), x + 6 * f, y - 2 + (sw ? 1 : 0), wood)
        p.rect(x + (f > 0 ? 6 : -8), y - 2 + (sw ? 1 : 0), 3, 3, metal)
      }
      break
    case 'staff':
      front = [3, -9]
      tool = () => {
        p.line(x + 4 * f, y - 19, x + 4 * f, y - 1, WOOD[3])
        at(4, -20, WOOD[2])
      }
      break
    case 'cane':
      front = [3, -8]
      tool = () => p.line(x + 4 * f, y - 9, x + 6 * f, y - 1, WOOD[1])
      break
    case 'spear':
      front = [3, -8]
      tool = () => {
        p.line(x + 4 * f, y - 22, x + 4 * f, y - 1, WOOD[2])
        at(4, -24, metal)
        at(4, -23, metal)
        at(3, -22, STONE[2])
        at(5, -22, STONE[2])
      }
      break
    case 'scythe':
      back = [1, -9]
      front = [3, -12]
      tool = () => {
        p.line(x - 2 * f, y - 2, x + 5 * f, y - 17, wood)
        p.line(x + 5 * f, y - 17, x + 11 * f, y - 15, metal)
        p.line(x + 6 * f, y - 16, x + 10 * f, y - 15, STONE[5])
      }
      break
    case 'lute':
      back = [1, -8]
      front = [3, -9]
      tool = () => {
        p.disc(x + 2 * f, y - 8, 2.5, 2, (px, py) => tone(WOOD, 3.6 - (py - y + 9) * 0.4, px, py))
        at(2, -8, WOOD[0])
        p.line(x + 3 * f, y - 10, x + 7 * f, y - 13, WOOD[1])
      }
      break
    case 'drum':
      back = sw ? [1, -13] : [2, -10]
      front = sw ? [5, -10] : [4, -13]
      tool = () => {
        p.box(Math.min(x + 2 * f, x + 7 * f), y - 9, Math.max(x + 2 * f, x + 7 * f) + 1, y - 4, (px, py) => (py === y - 9 ? C(0xe8dcc0) : (px + py) % 3 === 0 ? C(0xe8c060) : C(0xb03028)))
      }
      break
    case 'pipe':
      back = [3, -12]
      front = [5, -12]
      tool = () => p.line(x + 2 * f, y - 13, x + 7 * f, y - 11, WOOD[3])
      break
    case 'dance':
      back = sw ? [-4, -15] : [-4, -9]
      front = sw ? [4, -9] : [4, -15]
      break
    case 'pan':
      back = [2, -6]
      front = [4, -6]
      tool = () => {
        p.line(x + 1 * f, y - 5, x + 6 * f, y - 5, STONE[3])
        at(3, -6, GOLD[3])
      }
      break
  }
  const legs = w.legs ?? C(0x3a2a22)
  const shoe = C(0x24160e)
  if (!w.kneel) {
    const stride = (pose === 'walk' || pose === 'lead' || pose === 'staff' || pose === 'dance') && sw
    const [l, r] = stride ? [-2, 2] : [-1, 1]
    at(l, -2, legs)
    at(r, -2, legs)
    at(l, -1, shoe)
    at(r, -1, shoe)
    at(r + 1, -1, shoe)
    if (pose === 'dance' && sw) {
      // The kicking leg raised.
      at(r + 1, -3, legs)
      at(r + 2, -3, shoe)
    }
  }
  const arm = (hand: [number, number], sx: number, darker: number) => {
    const [hx, hy] = hand
    const x0 = x + sx * f
    const y0 = y - 11 + k
    const x1 = x + hx * f
    const y1 = y + hy + k
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps)
      p.set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), R[Math.max(0, 1 - darker)])
    }
    p.set(x1, y1, S[darker ? 1 : 2])
  }
  arm(back, -2, 1)
  // Robe: skirt, body, shoulders.
  if (w.kneel) {
    for (let dx = -3; dx <= 4; dx++) cloth(dx, -1, 1)
    for (let dx = -3; dx <= 3; dx++) cloth(dx, -2)
    at(5, -1, shoe)
  } else {
    for (let dx = -2; dx <= 2; dx++) cloth(dx, -4)
    for (let dx = -3; dx <= 3; dx++) cloth(dx, -3, 1)
  }
  for (let dy = -11; dy <= -5; dy++) for (let dx = -2; dx <= 2; dx++) cloth(dx, dy + k)
  for (let dx = -1; dx <= 1; dx++) cloth(dx, -12 + k)
  for (let dx = -2; dx <= 2; dx++) at(dx, -7 + k, C(0x3a2416))
  // Head.
  const hair = w.hair ?? HAIR[0]
  for (let dy = -16; dy <= -13; dy++) for (let dx = -1; dx <= 1; dx++) at(dx, dy + k, dx * f < 0 ? S[2] : S[1])
  at(1, -15 + k, C(0x24160e))
  at(-1, -13 + k, S[0])
  for (let dx = -1; dx <= 1; dx++) at(dx, -16 + k, hair)
  at(-1, -15 + k, hair)
  at(-2, -15 + k, hair)
  const hc = w.hatColor ?? R[1]
  switch (w.hat ?? 'none') {
    case 'hood':
      for (let dx = -2; dx <= 1; dx++) at(dx, -17 + k, hc)
      for (let dy = -16; dy <= -12; dy++) {
        at(-2, dy + k, hc)
        at(-1, dy + k, dy < -14 ? hc : R[0])
      }
      at(0, -16 + k, hc)
      at(1, -16 + k, hc)
      break
    case 'straw':
      for (let dx = -3; dx <= 3; dx++) at(dx, -16 + k, dx === 3 ? C(0xa88a40) : C(0xe0c470))
      for (let dx = -1; dx <= 1; dx++) at(dx, -17 + k, C(0xc8a450))
      at(-1, -18 + k, C(0xd8b860))
      at(0, -18 + k, C(0xd8b860))
      break
    case 'cap':
      for (let dx = -1; dx <= 2; dx++) at(dx, -17 + k, hc)
      at(-1, -16 + k, hc)
      at(0, -16 + k, hc)
      break
    case 'beak':
      for (let dy = -16; dy <= -13; dy++) for (let dx = -1; dx <= 1; dx++) at(dx, dy + k, dx * f < 0 ? C(0xe6dcc4) : C(0xc4b89a))
      at(2, -14 + k, C(0xc4b89a))
      at(3, -14 + k, C(0xb0a284))
      at(4, -13 + k, C(0x9c8e70))
      at(2, -13 + k, C(0xb0a284))
      at(3, -13 + k, C(0x9c8e70))
      at(1, -15 + k, C(0x50e0c0))
      for (let dx = -4; dx <= 3; dx++) at(dx, -17 + k, ROBE.black[1])
      for (let dy = -20; dy <= -18; dy++) for (let dx = -2; dx <= 1; dx++) at(dx, dy + k, ROBE.black[dx === -2 ? 2 : 1])
      at(-2, -16 + k, ROBE.black[0])
      at(-2, -15 + k, ROBE.black[0])
      break
    case 'turban':
      for (let dx = -2; dx <= 1; dx++) {
        at(dx, -17 + k, hc)
        at(dx, -16 + k, dx === 0 ? C(0xe8e0d0) : hc)
      }
      at(-1, -18 + k, hc)
      at(0, -18 + k, hc)
      break
    case 'scarf':
    case 'veil':
      for (let dx = -2; dx <= 1; dx++) at(dx, -17 + k, hc)
      for (let dy = -16; dy <= (w.hat === 'veil' ? -9 : -13); dy++) at(-2, dy + k, hc)
      at(-1, -16 + k, hc)
      at(-1, -15 + k, hc)
      at(0, -16 + k, hc)
      at(1, -16 + k, hc)
      break
    case 'helm':
      for (let dx = -1; dx <= 1; dx++) {
        at(dx, -17 + k, STONE[dx === -1 ? 5 : 3])
        at(dx, -16 + k, STONE[dx === -1 ? 4 : 2])
      }
      at(0, -18 + k, STONE[4])
      at(1, -15 + k, STONE[2])
      break
  }
  arm(front, 2, 0)
  tool?.()
}

// Someone sick, lying on a cot under a blanket.
function cot(p: Paint, x: number, y: number, blanket: ArrayLike<number>, skin = 0) {
  shadow(p, x + 9, y, 11, 2, 0.45)
  p.line(x, y - 4, x + 17, y - 4, WOOD[2])
  p.line(x, y - 3, x + 17, y - 3, WOOD[1])
  for (const lx of [x + 1, x + 16]) p.line(lx, y - 3, lx, y - 1, WOOD[1])
  p.box(x, y - 6, x + 18, y - 4, (px, py) => tone(THATCH, 3 - (py - y + 6), px, py))
  p.rect(x + 1, y - 8, 4, 2, PLASTER[4])
  const S = SKINS[skin]
  p.rect(x + 2, y - 10, 3, 3, S[1])
  p.set(x + 2, y - 10, HAIR[1])
  p.set(x + 3, y - 10, HAIR[1])
  p.set(x + 4, y - 9, S[0])
  ball(p, x + 11, y - 7, 7, 2.6, blanket, { rough: 0.1, seed: x })
  p.set(x + 5, y - 7, S[2])
}

// A camel facing right, with packs on its hump.
function camel(p: Paint, x: number, y: number, fr: number, packs: ArrayLike<number>[], flip = false) {
  const f = flip ? -1 : 1
  const hide = ramp(0x5e3e22, 0x8a6236, 0xb08450, 0xd0a670, 0xe6c48e)
  shadow(p, x + 3, y, 11, 2, 0.4)
  const legX = [-6, -4, 4, 6]
  const swing = fr % 2 === 0 ? [1, -1, -1, 1] : [-1, 1, 1, -1]
  legX.forEach((lx, i) => {
    const far = i === 1 || i === 3
    const c = far ? hide[0] : hide[1]
    p.line(x + lx * f, y - 9, x + (lx + swing[i]) * f, y - 4, c)
    p.line(x + (lx + swing[i]) * f, y - 4, x + (lx + swing[i] * 0.5) * f, y - 1, c)
    p.set(x + (lx + swing[i] * 0.5) * f, y - 1, hide[0])
    p.set(x + (lx + swing[i] * 0.5 + 1) * f, y - 1, hide[0])
  })
  ball(p, x, y - 12, 8, 4, hide, { seed: 2 })
  ball(p, x - 1 * f, y - 16, 5, 4, hide, { seed: 3 })
  // Neck and head.
  for (let i = 0; i <= 7; i++) {
    const nx = x + (7 + i * 0.7) * f
    const ny = y - 12 - i * 1.1 + (i > 4 ? (i - 4) * 0.6 : 0)
    p.set(nx, ny, hide[2])
    p.set(nx, ny + 1, hide[1])
    p.set(nx + f, ny + 1, hide[1])
  }
  p.box(Math.min(x + 11 * f, x + 15 * f), y - 21, Math.max(x + 11 * f, x + 15 * f) + 1, y - 18, (_, py) => (py === y - 21 ? hide[3] : hide[2]))
  p.set(x + 15 * f, y - 19, hide[1])
  p.set(x + 12 * f, y - 20, INK)
  p.set(x + 12 * f, y - 22, hide[1])
  p.set(x - 8 * f, y - 12, hide[1])
  p.set(x - 9 * f, y - 11, hide[0])
  // Packs and a striped blanket.
  packs.forEach((pk, i) => {
    const bx = x + (-6 + i * 5) * f
    ball(p, bx + 2 * f, y - 15, 3, 3, pk, { seed: 10 + i })
  })
  for (let dx = -4; dx <= 3; dx++) p.set(x + dx * f, y - 19 + (Math.abs(dx) > 2 ? 1 : 0), (dx & 1) === 0 ? C(0xc03030) : C(0xe8c050))
}

// A horse facing right.
function horse(p: Paint, x: number, y: number, fr: number, coat: ArrayLike<number>, flip = false) {
  const f = flip ? -1 : 1
  shadow(p, x + 3, y, 10, 2, 0.4)
  const swing = fr % 2 === 0 ? [1, -1, -1, 1] : [0, 0, 0, 0]
  ;[-5, -3, 4, 6].forEach((lx, i) => {
    const c = i === 1 || i === 3 ? coat[0] : coat[1]
    p.line(x + lx * f, y - 8, x + (lx + swing[i]) * f, y - 2, c)
    p.set(x + (lx + swing[i]) * f, y - 1, INK)
  })
  ball(p, x, y - 10, 8, 3.5, coat, { seed: 4 })
  for (let i = 0; i < 6; i++) {
    p.set(x + (6 + i * 0.6) * f, y - 11 - i, coat[2])
    p.set(x + (7 + i * 0.6) * f, y - 11 - i, coat[1])
    p.set(x + (5 + i * 0.6) * f, y - 12 - i, C(0x2a1a12))
  }
  p.box(Math.min(x + 9 * f, x + 13 * f), y - 18, Math.max(x + 9 * f, x + 13 * f) + 1, y - 15, coat[2])
  p.set(x + 13 * f, y - 15, coat[1])
  p.set(x + 10 * f, y - 17, INK)
  p.set(x + 9 * f, y - 19, coat[1])
  p.line(x - 8 * f, y - 11, x - 10 * f, y - 5, C(0x2a1a12))
}

// A cart wheel with spokes.
function wheel(p: Paint, cx: number, cy: number, r: number, turn = 0) {
  p.disc(cx, cy, r, r, WOOD[1])
  p.disc(cx, cy, r - 1.2, r - 1.2, (px, py) => p.get(px, py))
  for (let a = 0; a < 6; a++) {
    const ang = (a / 6) * Math.PI * 2 + turn
    p.line(cx, cy, cx + Math.cos(ang) * (r - 1), cy + Math.sin(ang) * (r - 1), WOOD[2])
  }
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2
    p.set(cx + Math.cos(ang) * (r - 0.5), cy + Math.sin(ang) * (r - 0.5), a < 20 ? WOOD[0] : WOOD[2])
  }
  p.set(cx, cy, STONE[3])
}

// A travelling wagon with an arched, striped canopy.
function wagon(p: Paint, x: number, y: number, stripes: [number, number], goods = true) {
  shadow(p, x + 18, y, 20, 2.5, 0.45)
  p.box(x, y - 12, x + 32, y - 6, (px, py) => tone(WOOD, 3 - (py - y + 12) * 0.25 - ((px - x) % 6 === 0 ? 1 : 0), px, py))
  p.line(x, y - 12, x + 31, y - 12, WOOD[4])
  p.poly([x + 1, y - 12, x + 1, y - 22, x + 5, y - 27, x + 27, y - 27, x + 31, y - 22, x + 31, y - 12], (px, py) => {
    const u = (px - x) / 32
    const v = (py - (y - 27)) / 15
    const c = Math.floor((px - x) / 4) % 2 === 0 ? stripes[0] : stripes[1]
    return mix(c, INK, clamp(u * 0.35 + v * 0.25 - 0.05 + (u < 0.1 ? 0.1 : 0)) * (0.5 + bay(px, py) * 0.5))
  })
  p.line(x + 5, y - 27, x + 27, y - 27, C(0xf4ecd8))
  if (goods) {
    p.box(x - 1, y - 21, x + 2, y - 13, C(0x1a1210))
    p.disc(x, y - 15, 2, 2, (px, py) => tone(GOLD, 2.5 + (px - x) * 0.3, px, py))
  }
  wheel(p, x + 7, y - 5, 5)
  wheel(p, x + 26, y - 5, 5)
  p.line(x + 32, y - 9, x + 44, y - 7, WOOD[2])
}

// A little fire on stacked logs; flames move with t.
function campfire(p: Paint, x: number, y: number, t: number, size = 1) {
  p.line(x - 4 * size, y - 1, x + 4 * size, y - 2, WOOD[1])
  p.line(x - 4 * size, y - 2, x + 4 * size, y - 1, WOOD[2])
  flames(p, x - 3 * size, x + 3 * size, y - 1, 9 * size, t, 5)
}

// Flames between x0 and x1 rising from row `base`, up to hmax tall; their tongues move with t.
function flames(p: Paint, x0: number, x1: number, base: number, hmax: number, t: number, seed: number) {
  const span = x1 - x0
  for (let x = Math.floor(x0); x <= x1; x++) {
    const u = (x - x0) / Math.max(1, span)
    const env = Math.sin(Math.PI * clamp(u)) ** 0.6
    const h = hmax * env * (0.45 + 0.55 * noise(x * 0.35, t * 2.5, seed))
    for (let y = Math.floor(base - h * 1.2); y <= base; y++) {
      const v = (base - y) / Math.max(1, h)
      const n = noise(x * 0.45, y * 0.3 + t * 7, seed + 1)
      const heat = 1.15 - v - (n - 0.5) * 0.7 - Math.abs(u - 0.5) * 0.5
      if (heat <= 0.05) continue
      p.set(x, y, tone(FIRE, heat * 5.4, x, y))
    }
  }
}

// Puffs of smoke rising from (x, y) and drifting.
function smoke(p: Paint, x: number, y: number, t: number, o: { n?: number; rise?: number; drift?: number; size?: number; c?: ArrayLike<number>; seed?: number; k?: number } = {}) {
  const n = o.n ?? 6
  const r = o.c ?? ramp(0x2a2628, 0x3e383a, 0x56504e, 0x726a66)
  for (let i = n - 1; i >= 0; i--) {
    const a = (t * 0.18 + i / n + rnd(i, 1, o.seed ?? 0) * 0.1) % 1
    const px = x + (o.drift ?? 20) * a + Math.sin(a * 6 + i) * 2
    const py = y - (o.rise ?? 40) * a
    const rad = (o.size ?? 3) + a * (o.size ?? 3) * 2.2
    for (let yy = Math.floor(py - rad); yy <= py + rad; yy++) {
      for (let xx = Math.floor(px - rad); xx <= px + rad; xx++) {
        const nx = (xx + 0.5 - px) / rad
        const ny = (yy + 0.5 - py) / rad
        const d = nx * nx + ny * ny + (noise(xx * 0.3, yy * 0.3 + t, i) - 0.5) * 0.9
        if (d > 1) continue
        const l = (-nx * 0.6 - ny * 0.7 + 0.6) * (r.length - 1) * 0.7
        p.tint(xx, yy, tone(r, l, xx, yy), (o.k ?? 0.9) * (1 - a * 0.8))
      }
    }
  }
}

// Falling streaks of rain across the picture.
function rain(p: Paint, t: number, n: number, c: number, slant = 0.35, len = 5, speed = 140, seed = 1, k = 0.7) {
  for (let i = 0; i < n; i++) {
    const sx = rnd(i, 0, seed) * (W + 60)
    const sy = rnd(i, 1, seed) * H
    const y = (sy + t * speed * (0.8 + rnd(i, 2, seed) * 0.4)) % (H + len)
    const x = (sx - y * slant + W) % (W + 60) - 30
    for (let j = 0; j < len; j++) p.tint(x - j * slant, y - j, c, k * (1 - j / len))
  }
}

function snowfall(p: Paint, t: number, n: number, seed = 3) {
  for (let i = 0; i < n; i++) {
    const near = rnd(i, 5, seed) > 0.7
    const y = (rnd(i, 1, seed) * H + t * (near ? 14 : 8)) % H
    const x = (rnd(i, 0, seed) * W + Math.sin(t * 1.5 + i) * 3 + t * 4) % W
    p.set(x, y, near ? SNOW[5] : SNOW[4])
    if (near) {
      p.set(x + 1, y, SNOW[4])
      p.set(x, y + 1, SNOW[3])
    }
  }
}

function stars(p: Paint, n: number, yMax: number, t: number, seed = 5) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd(i, 0, seed) * W)
    const y = Math.floor(rnd(i, 1, seed) ** 1.4 * yMax)
    const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + rnd(i, 2, seed) * 2) + i)
    const big = rnd(i, 3, seed) > 0.9
    const c = mix(C(0x8a9ad0), C(0xffffff), tw)
    p.set(x, y, c)
    if (big && tw > 0.6) {
      p.tint(x - 1, y, c, 0.5)
      p.tint(x + 1, y, c, 0.5)
      p.tint(x, y - 1, c, 0.5)
      p.tint(x, y + 1, c, 0.5)
    }
  }
}

// A four-pointed glint.
function glint(p: Paint, x: number, y: number, s: number, c = C(0xffffff)) {
  if (s <= 0) return
  p.set(x, y, c)
  for (let i = 1; i <= s; i++) {
    const k = 1 - i / (s + 1)
    p.tint(x - i, y, c, k)
    p.tint(x + i, y, c, k)
    p.tint(x, y - i, c, k)
    p.tint(x, y + i, c, k)
  }
}

// Birds in flight: two-pixel wings flapping.
function birds(p: Paint, t: number, n: number, x0: number, y0: number, c: number, seed = 1) {
  for (let i = 0; i < n; i++) {
    const x = (x0 + rnd(i, 0, seed) * 40 + t * 9) % (W + 20) - 10
    const y = y0 + rnd(i, 1, seed) * 16 + Math.sin(t + i) * 1.5
    const up = Math.floor(t * 4 + i) % 2 === 0
    p.set(x, y, c)
    p.set(x - 1, y + (up ? -1 : 0), c)
    p.set(x + 1, y + (up ? -1 : 0), c)
    p.set(x - 2, y + (up ? -1 : 1), c)
    p.set(x + 2, y + (up ? -1 : 1), c)
  }
}

// A sack of grain.
function sack(p: Paint, x: number, y: number, seed: number) {
  ball(p, x, y - 4, 4, 4, ramp(0x4f3b26, 0x6f5638, 0x917650, 0xb09669, 0xcab48a), { seed, rough: 0.1 })
  p.set(x - 1, y - 8, C(0x4f3b26))
  p.set(x, y - 9, C(0x917650))
  p.set(x + 1, y - 8, C(0x4f3b26))
}

// A woven basket heaped with fruit.
function basket(p: Paint, x: number, y: number, fruit: ArrayLike<number>, seed: number) {
  shadow(p, x + 2, y, 7, 1.5)
  for (let i = 0; i < 6; i++) ball(p, x - 4 + (i % 3) * 4 + (i > 2 ? 2 : 0), y - 7 - (i > 2 ? 2 : 0), 2.2, 2.2, fruit, { seed: seed + i })
  p.box(x - 6, y - 6, x + 7, y, (px, py) => tone(THATCH, 3.2 - (px - x + 6) * 0.15 - ((px + py) % 2 === 0 ? 0.8 : 0), px, py))
  p.line(x - 6, y - 6, x + 6, y - 6, THATCH[1])
}

// ---- Scenes ----------------------------------------------------------------------------------------------------------

interface Scene {
  draw: (p: Paint) => void
  // Drawn over the still layer each frame; t in seconds.
  fx?: (p: Paint, t: number) => void
}

const fields = (h: number) => (x: number) => h + Math.sin(x * 0.03) * 2 + Math.sin(x * 0.09 + 1) * 1

const drought: Scene = {
  draw(p) {
    sky(p, ramp(0xb8502a, 0xd4703a, 0xe8944a, 0xf2b866, 0xf8d890, 0xfbe8b8), 0, 66)
    glow(p, 192, 24, 90, C(0xfff0b0), 0.55)
    // Sun rays turning slowly round the disc.
    for (let y = 0; y < 66; y++) {
      for (let x = 120; x < W; x++) {
        const a = Math.atan2(y - 24, x - 192)
        const d = Math.hypot(x - 192, y - 24)
        if (d > 16 && d < 70 && Math.sin(a * 12) > 0.6) p.tint(x, y, C(0xfff4c8), 0.35 * (1 - d / 70))
      }
    }
    p.disc(192, 24, 14, 14, C(0xffe28a))
    p.disc(192, 24, 12, 12, C(0xfff6d0))
    p.disc(191, 23, 9, 9, C(0xffffff))
    // Hazy mesas.
    land(p, (x) => 60 - (noise(x * 0.025, 0, 3) > 0.55 ? 9 : 0) - noise(x * 0.1, 1, 3) * 2, (x, y, dd) => tone(ramp(0xb8784a, 0xcc8c58, 0xdca46a), 2 - dd * 0.15 - (noise(x * 0.025 + 0.04, 0, 3) > 0.55 && noise(x * 0.025 - 0.04, 0, 3) < 0.55 ? 1 : 0), x, y), 70)
    land(p, fields(66), (x, y, dd) => tone(SAND, 4.4 - dd * 0.08 + (noise(x * 0.2, y * 0.6, 5) - 0.5) * 0.8, x, y))
    // Cracked earth: plates in perspective.
    for (let y = 76; y < H; y++) {
      const depth = y - 62
      for (let x = 0; x < W; x++) {
        const zx = ((x - 128) / depth) * 9
        const zy = 160 / depth
        const xi = Math.floor(zx)
        const yi = Math.floor(zy)
        let d1 = 9
        let d2 = 9
        let id = 0
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const cx = xi + i + rnd(xi + i, yi + j, 11)
            const cy = yi + j + rnd(xi + i, yi + j, 12)
            const d = Math.hypot(zx - cx, (zy - cy) * 1.2)
            if (d < d1) {
              d2 = d1
              d1 = d
              id = rnd(xi + i, yi + j, 13)
            } else if (d < d2) d2 = d
          }
        }
        const gap = d2 - d1
        const blend = clamp((y - 76) / 14)
        let c: number
        if (gap < 0.09 * blend) c = DIRT[1]
        else if (gap < 0.16 * blend) c = SAND[1]
        else c = tone(SAND, 3.6 - id * 1.2 - d1 * 0.6 + (y - 76) * -0.01, x, y)
        p.set(x, y, blend > 0 ? c : p.get(x, y))
      }
    }
    // Wilted crops in rows.
    for (let r = 0; r < 3; r++) {
      const ry = 76 + r * 5
      for (let i = 0; i < 14 - r * 2; i++) {
        const sx = 4 + i * (7 + r) + (r & 1) * 3
        const h = 5 + r * 2 + Math.floor(rnd(i, r, 2) * 3)
        const c1 = rnd(i, r, 6) > 0.5 ? C(0x8a6a2a) : C(0x6e5020)
        p.line(sx, ry, sx, ry - h, c1)
        p.line(sx, ry - h, sx + 2, ry - h + 2, C(0xa88438))
        p.set(sx + 3, ry - h + 4, C(0x8a6a2a))
        p.line(sx - 1, ry - h + 3, sx - 2, ry - h + 5, C(0x7a5a24))
      }
    }
    p.sprite(SPRITES.dead[1], 222, 92)
    p.sprite(SPRITES.dead[3], 112, 74, { scale: 0.6 })
    // A dry well.
    shadow(p, 100, 108, 12, 2.5)
    p.box(88, 96, 108, 108, (x, y) => ((x + (y % 4 < 2 ? 0 : 2)) % 4 === 0 || y % 4 === 0 ? STONE[1] : tone(STONE, 4 - (x - 88) * 0.12, x, y)))
    p.disc(98, 96, 10, 3, STONE[3])
    p.disc(98, 96, 8, 2, C(0x14100c))
    p.line(89, 96, 89, 80, WOOD[2])
    p.line(107, 96, 107, 80, WOOD[1])
    p.line(87, 80, 109, 80, WOOD[3])
    p.line(98, 81, 98, 88, C(0x8a6a40))
    p.rect(96, 88, 4, 3, WOOD[2])
    // A cow's skull bleaching in the sun.
    p.rect(176, 112, 5, 3, C(0xeee6d0))
    p.set(175, 111, C(0xd8ccb0))
    p.set(181, 111, C(0xd8ccb0))
    p.set(174, 110, C(0xc8bca0))
    p.set(182, 110, C(0xc8bca0))
    p.set(177, 113, INK)
    p.set(179, 113, INK)
    p.rect(177, 115, 3, 1, C(0xc8bca0))
    person(p, 140, 108, { robe: ROBE.ochre, hat: 'straw', pose: 'brow', skin: 1 })
    person(p, 60, 112, { robe: ROBE.brown, hat: 'scarf', hatColor: C(0x9c3a2a), pose: 'carry', flip: true })
  },
  fx(p, t) {
    // Heat shimmer above the ground.
    for (let y = 54; y < 78; y++) {
      const s = Math.round(Math.sin(y * 0.9 + t * 5) * (y > 64 ? 1 : 0.6))
      if (!s) continue
      const row = p.px.slice(y * W, y * W + W)
      for (let x = 0; x < W; x++) p.px[y * W + x] = row[clamp(x + s, 0, W - 1)]
    }
  },
}

const rainScene: Scene = {
  draw(p) {
    sky(p, ramp(0x3a4456, 0x4c586c, 0x667388, 0x8592a6, 0xa6b2c0, 0xc2cad2), 0, 70)
    const cl = ramp(0x2e3442, 0x434b5c, 0x5c6678, 0x7a8496, 0x98a2b2)
    cloud(p, 40, 12, 100, 28, cl, 1)
    cloud(p, 150, 8, 120, 26, cl, 2)
    cloud(p, 240, 16, 80, 26, cl, 3)
    // A faint rainbow where the light breaks through.
    const bands = [0xd04040, 0xe89040, 0xf0d860, 0x70b858, 0x5080c8, 0x8060b0]
    for (let y = 20; y < 70; y++) {
      for (let x = 150; x < W; x++) {
        const d = Math.hypot(x - 214, (y - 84) * 1.1)
        const b = Math.floor((d - 46) / 2)
        if (b >= 0 && b < 6) p.tint(x, y, C(bands[b]), 0.32 * clamp((70 - y) / 20) * clamp((y - 20) / 10))
      }
    }
    land(p, (x) => 62 - noise(x * 0.02, 0, 4) * 10, (x, y, dd) => tone(ramp(0x3e5a52, 0x4c6c5c, 0x5a7c64), 2 - dd * 0.1, x, y), 74)
    for (let i = 0; i < 14; i++) p.veil(C(0x7a8a94), 0.45, () => roundTree(p, 8 + i * 19 + rnd(i, 0, 9) * 8, 68 + rnd(i, 1, 9) * 3, 4 + rnd(i, 2, 9) * 2, LEAF[i % 2], i))
    // Lush crop rows running off to the horizon.
    for (let y = 70; y < H; y++) {
      const depth = y - 66
      for (let x = 0; x < W; x++) {
        const u = ((x - 150) / depth) * 1.6
        const s = u - Math.floor(u)
        const row = s < 0.45
        const c = row ? tone(GRASS, 4.2 - (s > 0.3 ? 1 : 0) + (rnd(x, y, 2) - 0.5) * 0.6, x, y) : tone(DIRT, 2.6 + (noise(x * 0.3, y, 1) - 0.5), x, y)
        p.set(x, y, c)
      }
    }
    // A muddy path with puddles mirroring the sky.
    p.poly([60, H, 128, H, 112, 70, 108, 70], (x, y) => tone(DIRT, 2.8 + (noise(x * 0.3, y * 0.3, 8) - 0.5) * 1.2, x, y))
    for (const [px, py, rx] of [[96, 112, 12], [113, 92, 6], [76, 122, 8], [108, 80, 3]] as const) {
      p.disc(px, py, rx, rx * 0.28, (x, y) => (y < py - rx * 0.15 ? DIRT[1] : tone(ramp(0x667388, 0x8592a6, 0xa6b2c0, 0xd0d8e0), 2.4 - (x - px + rx) / rx, x, y)))
    }
    house(p, 14, 82, { w: 20, d: 28, h: 12, roof: THATCH, chimney: false, lit: true })
    roundTree(p, 210, 92, 10, LEAF[0], 4)
    roundTree(p, 236, 98, 7, LEAF[1], 6)
    person(p, 152, 116, { robe: ROBE.green, hat: 'hood', hatColor: ROBE.brown[1], pose: 'up', skin: 0 })
    person(p, 176, 112, { robe: ROBE.red, hat: 'scarf', hatColor: C(0xe8dcc0), pose: 'hold', flip: true })
    basket(p, 168, 120, ramp(0x5a1a1a, 0xa83030, 0xe05a40, 0xf8a070), 3)
  },
  fx(p, t) {
    // Rings spreading in the puddles.
    for (let i = 0; i < 6; i++) {
      const [px, py, rx] = ([[96, 112, 12], [113, 92, 6], [76, 122, 8]] as const)[i % 3]
      const a = (t * 0.8 + i * 0.37) % 1
      const cx = px + (rnd(i, Math.floor(t * 0.8 + i * 0.37), 4) - 0.5) * rx
      const r = a * 4
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2
        p.tint(cx + Math.cos(ang) * r, py + Math.sin(ang) * r * 0.3, C(0xe8eef4), 0.6 * (1 - a))
      }
    }
    rain(p, t, 140, C(0xc8d4e0), 0.25, 6, 150, 1, 0.55)
  },
}

// Trees bent by the wind: a leaning trunk and a canopy streaming off downwind.
function bentTree(p: Paint, x: number, y: number, h: number, sway: number, seed: number) {
  const lean = 5 + sway * 3
  for (let i = 0; i < h; i++) {
    const u = i / h
    const tx = x + lean * u * u
    p.set(tx, y - i, WOOD[1])
    p.set(tx + 1, y - i, WOOD[0])
  }
  const cx = x + lean + 6
  const cy = y - h - 2
  const dark = ramp(0x0c1a16, 0x14281e, 0x1e3a26, 0x2c4e30, 0x3e6438)
  for (let i = 0; i < 6; i++) {
    const k = i / 5
    ball(p, cx - 6 + k * (16 + sway * 3), cy + rnd(i, 0, seed) * 4 - 2 + k * 2, 6 - k * 3, 4 - k * 1.5, dark, { rough: 0.5, seed: seed + i })
  }
}

const storm: Scene = {
  draw(p) {
    sky(p, ramp(0x0a0c14, 0x12141f, 0x1c1f2e, 0x282c3e, 0x363b4e), 0, 74)
    // Rolling cloud masses, their bellies dark, their tops catching light.
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < W; x++) {
        const v = fbm(x * 0.025 + y * 0.012, y * 0.07, 21, 4)
        const above = fbm(x * 0.025 + (y - 2) * 0.012, (y - 2) * 0.07, 21, 4)
        if (v < 0.45) continue
        const lit = above < v - 0.015 ? 1.2 : 0
        p.set(x, y, tone(ramp(0x0c0e18, 0x181b28, 0x262a3a, 0x3a3f52, 0x5a6074), (v - 0.45) * 7 + lit - y * 0.02, x, y))
      }
    }
    // A wild lake with whitecaps.
    land(p, () => 74, (x, y, dd) => {
      const wave = Math.sin(x * (0.12 - dd * 0.001) + dd * 0.9 + noise(x * 0.05, y * 0.1, 3) * 6)
      return tone(ramp(0x081418, 0x10242a, 0x1a3a40, 0x2a5458, 0x4a7a78, 0xa8c8c0), 1.6 + wave * 0.9 + dd * 0.02 + (wave > 0.85 && dd > 4 ? 3 : 0), x, y)
    })
    // The shore and a cottage on the left.
    land(p, (x) => 70 + x * 0.18 + noise(x * 0.08, 0, 5) * 4 + (x > 96 ? (x - 96) * 2 : 0), (x, y, dd) => tone(ramp(0x0e1a12, 0x16281a, 0x203822, 0x2e4a2c), 2.4 - dd * 0.05 + (rnd(x, y, 3) - 0.5) * 0.5, x, y))
    house(p, 18, 92, { w: 16, d: 22, h: 10, roof: SLATE, wall: ramp(0x3a3832, 0x55514a, 0x726c62, 0x8a8478, 0xa09888), lit: true, chimney: true, door: 'shut' })
  },
  fx(p, t) {
    const gust = Math.sin(t * 1.3) * 0.5 + 0.5
    bentTree(p, 60, 100, 20, gust, 3)
    bentTree(p, 76, 106, 16, gust * 0.8, 4)
    bentTree(p, 4, 96, 18, gust, 5)
    // A small boat tossed on the waves.
    const bob = Math.sin(t * 2.2)
    const bx = 180
    const by = 96 + bob * 1.5
    const tilt = bob * 0.15
    for (let i = -9; i <= 9; i++) {
      const yy = by + i * tilt
      p.set(bx + i, yy, WOOD[3])
      p.set(bx + i, yy + 1, WOOD[2])
      if (Math.abs(i) < 8) p.set(bx + i, yy + 2, WOOD[1])
    }
    p.line(bx, by - 1, bx + tilt * 14, by - 16, WOOD[1])
    p.poly([bx + tilt * 14 + 1, by - 15, bx + 9, by - 4, bx + 1, by - 3], (x, y) => tone(PLASTER, 3 - (x - bx) * 0.15, x, y))
    for (let i = -10; i <= 10; i += 2) p.tint(bx + i, by + 3, C(0xc8e0d8), 0.7)
    rain(p, t, 200, C(0x8a9ab0), 0.6, 7, 220, 2, 0.5)
    // A flash and a bolt every few seconds.
    const cycle = t % 3.6
    if (cycle < 0.35) {
      const flash = cycle < 0.12 ? 0.35 : 0.15
      for (let i = 0; i < W * H; i++) p.px[i] = mix(p.px[i], C(0xc8d0ff), flash)
      const seed = Math.floor(t / 3.6)
      let x = 120 + rnd(seed, 0, 7) * 60
      let y = 0
      const branch: [number, number][] = []
      while (y < 76) {
        const nx = x + (rnd(seed, y, 8) - 0.5) * 10
        const ny = y + 3 + rnd(seed, y, 9) * 5
        p.line(x, y, nx, ny, C(0xffffff))
        p.line(x + 1, y, nx + 1, ny, C(0xb8c4ff))
        if (rnd(seed, y, 10) > 0.8) branch.push([nx, ny])
        x = nx
        y = ny
      }
      for (const [bx0, by0] of branch) {
        let xx = bx0
        let yy = by0
        for (let s = 0; s < 4; s++) {
          const nx = xx + 3 + rnd(s, yy, 11) * 3
          const ny = yy + 3
          p.line(xx, yy, nx, ny, C(0x9aa8ff))
          xx = nx
          yy = ny
        }
      }
      glow(p, x, 74, 30, C(0xe0e8ff), 0.5, 0.4)
    }
  },
}

const fog: Scene = {
  draw(p) {
    const mist = C(0xb6bec2)
    sky(p, ramp(0x8c969e, 0x9ca6ac, 0xaab2b6, 0xb6bec2), 0, 64)
    land(p, () => 62, (x, y, dd) => tone(ramp(0x5e6c62, 0x6e7c70, 0x80907e, 0x93a08e), 1.5 + dd * 0.05 + (noise(x * 0.2, y * 0.5, 2) - 0.5), x, y))
    // The road narrowing to nothing.
    for (let y = 62; y < H; y++) {
      const depth = (y - 61) / (H - 61)
      const cx = 128 + Math.sin(depth * 3.2) * 16 * depth
      const half = 2 + depth * 46
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const edge = Math.abs(x - cx) > half - 2 - depth * 3
        const rut = Math.abs(Math.abs(x - cx) - half * 0.45) < 0.6 + depth
        p.set(x, y, tone(ramp(0x4e4232, 0x6a5a44, 0x86745a, 0x9c8a6c), (edge ? 1 : rut ? 1.2 : 2.6) + (noise(x * 0.25, y * 0.25, 3) - 0.5), x, y))
      }
    }
    // Trees along the road, dissolving into the mist with distance.
    const rows: [number, number, number][] = []
    for (let i = 0; i < 7; i++) {
      const depth = 1 - i / 7
      const y = 62 + depth * depth * 60
      const off = 18 + depth * 86
      const cx = 128 + Math.sin(((y - 61) / (H - 61)) * 3.2) * 16 * ((y - 61) / (H - 61))
      rows.push([cx - off, y, depth], [cx + off, y + 2, depth])
    }
    rows.sort((a, b) => a[1] - b[1])
    rows.forEach(([x, y, depth], i) => {
      const s = 0.3 + depth * 0.9
      p.veil(mist, clamp(1 - depth * 1.15, 0.1, 0.92), () => p.sprite(i % 3 === 0 ? SPRITES.poplar[i % 3] : SPRITES.leaf[i % 4], x, y, { scale: s }))
    })
    // The fog itself: thick near the horizon, in drifting layers.
    for (let y = 0; y < H; y++) {
      const base = clamp(1 - Math.abs(y - 64) / 52) * 0.75
      for (let x = 0; x < W; x++) p.tint(x, y, mist, base * (0.7 + fbm(x * 0.02, y * 0.08, 4) * 0.6))
    }
    // A lost merchant and his mule, a lantern held up.
    p.veil(mist, 0.35, () => {
      person(p, 150, 90, { robe: ROBE.brown, hat: 'hood', pose: 'hold' })
      horse(p, 132, 91, 0, ramp(0x3a2e26, 0x5a4a3c, 0x7a6a58, 0x988a76), false)
      ball(p, 130, 79, 4, 3, ramp(0x4a3a24, 0x6a5434, 0x8a7448), { seed: 2 })
    })
    glow(p, 154, 82, 16, C(0xffc860), 0.6)
    p.rect(153, 81, 2, 2, C(0xfff0b0))
    // A crooked signpost up close.
    p.line(46, 126, 46, 92, WOOD[1])
    p.line(47, 126, 47, 92, WOOD[2])
    p.poly([30, 94, 56, 96, 60, 99, 56, 102, 30, 100], (x, y) => tone(WOOD, 3.4 - (y - 94) * 0.25 - ((x - 30) % 9 === 0 ? 1 : 0), x, y))
    p.poly([62, 104, 38, 106, 34, 109, 38, 112, 62, 110], (x, y) => tone(WOOD, 3 - (y - 104) * 0.25, x, y))
    for (const [x, y] of [[36, 97], [44, 97], [50, 108], [42, 108]]) p.set(x, y, WOOD[0])
    p.sprite(SPRITES.bush[0], 24, 124)
    p.sprite(SPRITES.bush[2], 226, 126)
  },
  fx(p, t) {
    for (let y = 40; y < 110; y += 1) {
      for (let x = 0; x < W; x++) {
        const v = fbm(x * 0.018 - t * 0.12, y * 0.12, 9, 2)
        if (v > 0.55) p.tint(x, y, C(0xc4cacc), (v - 0.55) * 1.6)
      }
    }
  },
}

const flood: Scene = {
  draw(p) {
    sky(p, ramp(0x3e4654, 0x4e5866, 0x626c7a, 0x7a8490, 0x9098a2), 0, 66)
    const cl = ramp(0x2a303a, 0x3c4450, 0x525a66, 0x6a727c)
    cloud(p, 60, 10, 130, 22, cl, 7)
    cloud(p, 200, 14, 110, 24, cl, 8)
    land(p, (x) => 58 - noise(x * 0.02, 0, 6) * 10, (x, y, dd) => tone(ramp(0x3e4c48, 0x4e5e56, 0x5e6e62), 2 - dd * 0.1, x, y), 72)
    for (let i = 0; i < 9; i++) p.veil(C(0x6a7480), 0.4, () => roundTree(p, 20 + i * 28, 70, 5, LEAF[1], i + 30))
    land(p, () => 70, (x, y) => tone(GRASS, 2.6 + (noise(x * 0.2, y * 0.3, 2) - 0.5), x, y), 90)
    house(p, 20, 102, { w: 22, d: 30, h: 14, roof: THATCH, door: 'shut' })
    house(p, 150, 96, { w: 18, d: 24, h: 12, roof: TILE, door: 'shut', chimney: true })
    p.veil(C(0x6a7480), 0.25, () => house(p, 104, 86, { w: 14, d: 18, h: 10, roof: TILE }))
    roundTree(p, 226, 102, 9, LEAF[0], 9)
    roundTree(p, 92, 100, 6, LEAF[2], 10)
    // Muddy water over everything below the line, mirroring what stands above it.
    const level = 86
    const muddy = ramp(0x2e2c1c, 0x46432a, 0x5e5a3a, 0x77724c, 0x938c62)
    for (let y = level; y < H; y++) {
      const d = y - level
      for (let x = 0; x < W; x++) {
        const wob = Math.round(Math.sin(y * 0.8 + x * 0.05) * (1 + d * 0.05))
        const mirrorY = level - 1 - d
        const water = tone(muddy, 2.2 - d * 0.015 + (noise(x * 0.06, y * 0.4, 5) - 0.5) * 1.4, x, y)
        p.px[y * W + x] = mirrorY > 40 && d < 30 ? mix(water, p.get(x + wob, mirrorY), 0.35 * (1 - d / 30)) : water
      }
    }
    // Fence posts and a cart wheel poking out; a man calling from the roof.
    for (let i = 0; i < 8; i++) {
      const fx = 70 + i * 9
      p.rect(fx, 98 + (i & 1), 2, 4, WOOD[2])
      p.set(fx, 98 + (i & 1), WOOD[3])
    }
  },
  fx(p, t) {
    // The current: light streaks sliding by.
    for (let i = 0; i < 40; i++) {
      const y = 88 + Math.floor(rnd(i, 0, 3) * 38)
      const len = 3 + Math.floor((y - 86) / 6)
      const x = (rnd(i, 1, 3) * W + t * (8 + (y - 86) * 0.5)) % (W + 20) - 10
      for (let k = 0; k < len; k++) p.tint(x + k, y, C(0xb8b08a), 0.6)
    }
    // A barrel drifting past.
    const bx = ((t * 6) % (W + 30)) - 15
    const by = 112 + Math.sin(t * 2) * 1
    p.disc(bx, by, 4, 3, (x, y) => tone(WOOD, 3 - (x - bx + 4) * 0.3, x, y))
    p.line(bx - 3, by - 1, bx + 3, by - 1, STONE[2])
    for (let k = -5; k <= 5; k++) p.tint(bx + k, by + 3, C(0xc8c0a0), 0.6)
    person(p, 52, 82, { robe: ROBE.blue, hat: 'none', pose: 'wave', skin: 1, frame: Math.floor(t * 3) })
  },
}

// Golden wheat, a row of sheaves, baskets and a cart of hay.
function sheaf(p: Paint, x: number, y: number, seed: number) {
  shadow(p, x + 4, y, 6, 1.5, 0.5)
  for (let i = -5; i <= 5; i++) {
    const top = y - 16 + Math.abs(i) * 0.6 + rnd(i, 0, seed) * 2
    const tx = x + i * 0.9
    p.line(x + i * 0.4, y - 1, tx, top, tone(GOLD, 2.4 - i * 0.12, x + i, y))
    p.set(tx, top, GOLD[4])
    p.set(tx, top - 1, GOLD[3])
  }
  p.line(x - 2, y - 7, x + 2, y - 7, C(0x8a5a1a))
}

const bountiful: Scene = {
  draw(p) {
    sky(p, ramp(0x5a80b8, 0x7a9cc4, 0xb0bcbc, 0xe4cc94, 0xf6dc9c, 0xfbecc0), 0, 66)
    glow(p, 44, 56, 70, C(0xfff0b0), 0.6, 0.7)
    p.disc(44, 54, 9, 9, C(0xfff4c8))
    const cl = ramp(0xc89a74, 0xe0b48a, 0xf4d0a4, 0xfbe8c8)
    cloud(p, 150, 18, 70, 12, cl, 2)
    cloud(p, 220, 30, 50, 10, cl, 3)
    land(p, (x) => 58 - noise(x * 0.02, 0, 7) * 8, (x, y, dd) => tone(ramp(0x7a8a5a, 0x8c9a62, 0xa4a66a), 2 - dd * 0.15, x, y), 70)
    for (let i = 0; i < 6; i++) p.veil(C(0xd8c090), 0.35, () => p.sprite(SPRITES.fruit[i % SPRITES.fruit.length], 150 + i * 18, 66 + (i & 1) * 2, { scale: 0.5 }))
    // A sea of ripe wheat: stalks in rows, heads catching the low sun.
    for (let y = 64; y < H; y++) {
      const depth = y - 60
      for (let x = 0; x < W; x++) {
        const sway = noise(x * 0.04, y * 0.02, 4) * 6
        const stalk = noise((x + sway) * (0.9 - depth * 0.004), y * 0.08 * (60 / depth), 5)
        const head = (y + Math.floor(rnd(x, 0, 6) * 4)) % Math.max(2, Math.round(depth / 6)) === 0
        p.set(x, y, tone(GOLD, 2.3 + stalk * 1.4 - depth * 0.006 + (head && depth > 12 ? 0.9 : 0), x, y))
      }
    }
    for (let i = 0; i < 6; i++) sheaf(p, 20 + i * 34 + (i & 1) * 6, 86 + (i & 1) * 4, i)
    sheaf(p, 30, 118, 9)
    // A hay cart.
    shadow(p, 214, 112, 22, 2.5)
    p.box(194, 98, 234, 106, (x, y) => tone(WOOD, 3 - (y - 98) * 0.3 - ((x - 194) % 8 === 0 ? 1 : 0), x, y))
    cluster(p, 214, 90, 40, 18, THATCH, 5, 9, { rough: 0.6 })
    wheel(p, 202, 106, 6)
    wheel(p, 226, 106, 6)
    p.line(194, 102, 180, 106, WOOD[2])
    const apples = ramp(0x5a1a1a, 0xa83030, 0xe05a40, 0xf8a070)
    const pears = ramp(0x4a5a1a, 0x7a9430, 0xb0c450, 0xe0e690)
    basket(p, 120, 124, apples, 1)
    basket(p, 138, 122, pears, 2)
    // Pumpkins.
    for (const [x, y] of [[160, 122], [170, 125], [152, 126]]) {
      ball(p, x, y - 3, 4, 3, ramp(0x7a3410, 0xb85a18, 0xe8862a, 0xf8b050), { seed: x })
      p.set(x, y - 7, C(0x3a5a20))
    }
    person(p, 92, 112, { robe: ROBE.white, hat: 'straw', pose: 'scythe', skin: 0 })
    person(p, 70, 116, { robe: ROBE.red, hat: 'scarf', hatColor: C(0xf0e4c8), pose: 'hold', flip: false, skin: 1 })
    sheaf(p, 76, 108, 12)
  },
  fx(p, t) {
    birds(p, t, 4, 0, 18, C(0x4a3a30), 3)
  },
}

// A walled desert city on the horizon: towers, domes and a minaret, hazed by distance.
function desertCity(p: Paint, x: number, y: number) {
  const wall = ramp(0x9c7a5c, 0xb89474, 0xd0ae8a, 0xe4c8a4)
  p.box(x, y - 10, x + 70, y, (px, py) => tone(wall, 2.4 - ((px - x) % 9 === 0 ? 1 : 0) - (py - y + 10) * 0.05, px, py))
  for (let i = 0; i < 70; i += 3) p.rect(x + i, y - 12, 2, 2, wall[2])
  for (const tx of [x - 2, x + 22, x + 46, x + 68]) {
    p.box(tx, y - 18, tx + 6, y, (px, py) => tone(wall, px === tx ? 3.4 : 2, px, py))
    p.rect(tx - 1, y - 19, 8, 1, wall[3])
  }
  p.box(x + 30, y - 22, x + 42, y - 10, (px, py) => tone(wall, px < x + 33 ? 3.2 : 2, px, py))
  ball(p, x + 36, y - 24, 8, 7, ramp(0x3a6a7a, 0x4a8a98, 0x6aaab4, 0x9ccad0), { seed: 4 })
  p.line(x + 36, y - 32, x + 36, y - 35, GOLD[3])
  ball(p, x + 14, y - 13, 5, 5, ramp(0xa87c58, 0xc89a74, 0xe0b890, 0xf0d4b0), { seed: 5 })
  p.box(x + 56, y - 34, x + 60, y - 10, (px, py) => tone(wall, px === x + 56 ? 3.4 : 2, px, py))
  p.rect(x + 55, y - 28, 6, 1, wall[3])
  ball(p, x + 58, y - 35, 2.5, 3, ramp(0x3a6a7a, 0x4a8a98, 0x6aaab4, 0x9ccad0), { seed: 6 })
  p.rect(x + 31, y - 7, 6, 7, C(0x3a2618))
}

function palm(p: Paint, x: number, y: number, h: number, seed: number) {
  for (let i = 0; i < h; i++) {
    const tx = x + Math.sin((i / h) * 1.4) * 4
    p.set(tx, y - i, i % 3 === 0 ? WOOD[1] : WOOD[2])
    p.set(tx + 1, y - i, WOOD[1])
  }
  const top = [x + Math.sin(1.4) * 4, y - h] as const
  for (let k = 0; k < 7; k++) {
    const ang = -Math.PI + (k / 6) * Math.PI + (rnd(k, 0, seed) - 0.5) * 0.3
    for (let s = 0; s < 10; s++) {
      const u = s / 10
      const fx = top[0] + Math.cos(ang) * s * 1.1
      const fy = top[1] + Math.sin(ang) * s * 0.7 + u * u * 6
      p.set(fx, fy, tone(LEAF[2], 3.5 - u * 2 - (Math.cos(ang) > 0 ? 1 : 0), Math.round(fx), Math.round(fy)))
      p.set(fx, fy + 1, LEAF[2][1])
    }
  }
}

const caravan: Scene = {
  draw(p) {
    sky(p, ramp(0x2c6aac, 0x3e80c0, 0x5e9ccc, 0x8ab8d4, 0xc0d4d4, 0xecdcb8), 0, 66)
    const cl = ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff)
    cloud(p, 60, 16, 60, 10, cl, 4)
    cloud(p, 120, 8, 40, 8, cl, 5)
    p.veil(C(0xc8c8c0), 0.35, () => desertCity(p, 168, 66))
    p.veil(C(0xc8c8c0), 0.3, () => {
      palm(p, 156, 66, 14, 1)
      palm(p, 246, 66, 12, 2)
    })
    // Dunes: lit windward slopes, shaded lee sides.
    const dune = (x: number, s: number, base: number, amp: number) => base - amp * (0.5 + 0.5 * Math.sin(x * 0.035 + s)) - noise(x * 0.05, 0, s) * amp * 0.5
    // Slope of a dune line: windward (rising to the right) faces lit, lee faces in shade, deepening down the face.
    const slope = (x: number, s: number, base: number, amp: number) => clamp((dune(x - 2, s, base, amp) - dune(x + 2, s, base, amp)) * 0.6, -1, 1)
    land(p, (x) => dune(x, 1, 68, 6), (x, y, dd) => tone(SAND, 3.4 - dd * 0.04 - slope(x, 1, 68, 6) * 1.2 * clamp(1 - dd / 12) + (dd < 1 ? 0.8 : 0), x, y))
    land(p, (x) => dune(x, 3, 86, 10), (x, y, dd) => tone(SAND, 3.7 - dd * 0.03 - slope(x, 3, 86, 10) * 1.6 * clamp(1 - dd / 18) + (dd < 1 ? 0.8 : 0) + (noise(x * 0.3, y * 1.5, 2) - 0.5) * 0.4, x, y))
    // The worn road towards the gate.
    for (let y = 70; y < H; y++) {
      const u = (y - 70) / (H - 70)
      const cx = 202 - (1 - (1 - u) * (1 - u)) * 150
      const half = 1 + u * 14
      for (let x = Math.floor(cx - half); x <= cx + half; x++) p.set(x, y, tone(ramp(0x8a6a44, 0xa4825a, 0xbc9a70, 0xd0b088), 2 - (Math.abs(x - cx) > half - 1.5 ? 1 : 0) + (noise(x * 0.4, y * 0.4, 7) - 0.5), x, y))
    }
    for (const [x, y] of [[16, 104], [236, 112], [120, 82]]) p.sprite(SPRITES.boulder[x % 6], x, y, { scale: 0.6 })
  },
  fx(p, t) {
    const fr = Math.floor(t * 3)
    const packs = [ramp(0x4a2a3a, 0x7a3a5a, 0xa85a7a, 0xd08aa0), ramp(0x2a3a5a, 0x3a5a8a, 0x5a7aaa, 0x8aa8d0), ramp(0x5a4a1a, 0x8a7428, 0xb89a40, 0xe0c870)]
    person(p, 128, 104, { robe: ROBE.blue, hat: 'turban', hatColor: C(0xe8e0d0), pose: 'lead', frame: fr, skin: 1 })
    camel(p, 110, 108, fr, [packs[0], packs[1]])
    camel(p, 82, 112, fr + 1, [packs[2], packs[0]])
    camel(p, 54, 116, fr, [packs[1], packs[2]])
    person(p, 34, 120, { robe: ROBE.red, hat: 'helm', pose: 'spear', frame: fr, skin: 2 })
    // Dust kicked up behind.
    for (let i = 0; i < 18; i++) {
      const a = (t * 0.6 + i / 18) % 1
      p.tint(30 + i * 6 - a * 10, 120 - a * 6 + (i % 3), C(0xe8d4a8), 0.5 * (1 - a))
    }
  },
}

const comet: Scene = {
  draw(p) {
    sky(p, ramp(0x04061a, 0x08102c, 0x0e1a3e, 0x182852, 0x243866, 0x34487a), 0, 82)
    // The Milky Way: a faint dusty band.
    for (let y = 0; y < 70; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.abs(y - (60 - x * 0.22))
        const v = fbm(x * 0.05, y * 0.05, 3) * (1 - d / 22)
        if (v > 0.25) p.tint(x, y, C(0x5a6aa0), (v - 0.25) * 0.8)
      }
    }
    // The comet: a bright head and two tails, the dust tail curving.
    const hx = 78
    const hy = 30
    for (let i = 0; i < 160; i++) {
      const u = i / 160
      const x = hx + u * 150
      const yIon = hy - u * 34
      const yDust = hy - u * 26 + u * u * 14
      const wIon = 1 + u * 6
      const wDust = 1 + u * 12
      for (let dy = -wDust; dy <= wDust; dy++) p.tint(x, yDust + dy, C(0xf0e0b0), 0.7 * (1 - u) * (1 - Math.abs(dy) / (wDust + 1)))
      for (let dy = -wIon; dy <= wIon; dy++) p.tint(x, yIon + dy, C(0x9ad0ff), 0.9 * (1 - u) * (1 - Math.abs(dy) / (wIon + 1)))
    }
    glow(p, hx, hy, 18, C(0xd0e8ff), 0.8)
    p.disc(hx, hy, 2.5, 2.5, C(0xffffff))
    // Dark hills and the village.
    land(p, (x) => 78 - noise(x * 0.015, 0, 2) * 14, (x, y, dd) => tone(ramp(0x080a14, 0x0e1222, 0x161c30), 2 - dd * 0.1, x, y))
    p.veil(C(0x0e1428), 0.6, () => {
      house(p, 150, 84, { w: 14, d: 18, h: 10, lit: true, chimney: true })
      house(p, 186, 88, { w: 18, d: 22, h: 12, lit: true, roof: THATCH })
      house(p, 222, 82, { w: 12, d: 16, h: 9, lit: true })
      // A chapel's spire.
      p.box(130, 64, 138, 86, (x, y) => tone(STONE, x < 133 ? 3 : 1.5, x, y))
      p.poly([129, 64, 134, 50, 139, 64], (x, y) => tone(SLATE, x < 134 ? 3 : 1.5, x, y))
    })
    for (const [x, y] of [[133, 70], [134, 76]]) p.rect(x, y, 2, 2, C(0xffd070))
    land(p, (x) => 102 + Math.sin(x * 0.02) * 4, (x, y, dd) => tone(ramp(0x0a0e18, 0x121a2a, 0x1c2638, 0x26344a), 2.6 - dd * 0.08 + (rnd(x, y, 5) - 0.5) * 0.4, x, y))
    // The comet's light on the near grass.
    for (let x = 0; x < W; x++) p.tint(x, 102 + Math.sin(x * 0.02) * 4, C(0x7a8ab0), 0.6)
    p.veil(C(0x101a34), 0.45, () => {
      person(p, 40, 116, { robe: ROBE.brown, hat: 'hood', pose: 'point' })
      person(p, 58, 118, { robe: ROBE.red, hat: 'scarf', hatColor: C(0xe8dcc0), pose: 'pray', kneel: true, skin: 1 })
      person(p, 78, 115, { robe: ROBE.blue, pose: 'up', skin: 2 })
      person(p, 24, 119, { robe: ROBE.green, hat: 'cap', pose: 'stand', flip: false })
    })
    // Rim light from the comet on their heads.
    for (const x of [40, 78, 24]) p.set(x - 1, 100 + (x === 40 ? 0 : x === 78 ? -1 : 3), C(0x9ab0e0))
  },
  fx(p, t) {
    stars(p, 70, 74, t, 8)
    const s = 1 + Math.round(1 + Math.sin(t * 3))
    glint(p, 78, 30, s + 1)
  },
}

const fullMoon: Scene = {
  draw(p) {
    sky(p, ramp(0x080a24, 0x10163a, 0x1a2250, 0x262e62, 0x343c72), 0, 86)
    glow(p, 196, 34, 60, C(0x9aa8e0), 0.45)
    ball(p, 196, 34, 22, 22, ramp(0x8a8ea8, 0xa8acc0, 0xc6c8d4, 0xe2e2e8, 0xf8f6f0), { flat: 0.9 })
    // Seas and craters on the moon.
    for (const [cx, cy, r] of [[188, 28, 6], [204, 40, 5], [198, 24, 3], [184, 42, 3], [208, 28, 2]]) p.disc(cx, cy, r, r * 0.9, (x, y) => tone(ramp(0x8a8ea8, 0xa8acc0, 0xc6c8d4), 1.4 + (x - cx) * 0.1 + (rnd(x, y, 1) - 0.5) * 0.6, x, y))
    land(p, (x) => 76 - noise(x * 0.02, 0, 9) * 12, (x, y, dd) => tone(ramp(0x0a0e1c, 0x101628, 0x182034), 2 - dd * 0.1, x, y))
    p.veil(C(0x101836), 0.5, () => {
      house(p, 8, 90, { w: 16, d: 22, h: 12, lit: true, roof: THATCH, chimney: true })
      house(p, 200, 88, { w: 16, d: 30, h: 12, lit: true })
      conifer(p, 60, 84, 22, LEAF[1], { seed: 1 })
      conifer(p, 182, 84, 18, LEAF[1], { seed: 2 })
    })
    // The village green, lit by the bonfire in its middle.
    land(p, () => 92, (x, y) => tone(ramp(0x0e1a18, 0x162820, 0x20362a, 0x2c4632, 0x3c5a3a), 1.8 + (rnd(x, y, 4) - 0.5) * 0.5, x, y))
    for (let y = 80; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 128, (y - 108) * 2.2)
      if (d < 120) p.tint(x, y, C(0xd08030), 0.55 * (1 - d / 120) ** 1.5)
    }
    // Strings of lanterns between poles.
    for (const px of [40, 128, 216]) {
      p.line(px, 98, px, 52, WOOD[1])
      p.line(px + 1, 98, px + 1, 52, WOOD[2])
    }
    const lanterns: [number, number, number][] = []
    for (const [a, b] of [[40, 128], [128, 216]]) {
      for (let x = a; x <= b; x++) {
        const u = (x - a) / (b - a)
        const y = 53 + Math.sin(u * Math.PI) * 14
        p.set(x, y, C(0x2a2018))
        if ((x - a) % 11 === 5) lanterns.push([x, y + 2, lanterns.length])
      }
    }
    for (const [x, y, i] of lanterns) {
      const c = [0xe84a30, 0xf0a030, 0xf8d860, 0xe86080][i % 4]
      glow(p, x, y + 1, 9, C(c), 0.5)
      ball(p, x, y + 1, 2, 2.5, ramp(c & 0x7f7f7f, c, 0xfff0c0), { flat: 1 })
    }
  },
  fx(p, t) {
    stars(p, 50, 70, t, 2)
    campfire(p, 128, 110, t, 2)
    glow(p, 128, 100, 26, C(0xffb040), 0.25 + Math.sin(t * 9) * 0.05)
    const fr = Math.floor(t * 3)
    const ring: [Who['robe'], number, number][] = [[ROBE.red, 0, 0], [ROBE.blue, 1, 1], [ROBE.ochre, 2, 0], [ROBE.green, 0, 1], [ROBE.rose, 1, 0], [ROBE.white, 2, 1]]
    ring.forEach(([robe, skin, off], i) => {
      const a = (i / ring.length) * Math.PI * 2 + t * 0.35
      const x = 128 + Math.cos(a) * 34
      const y = 112 + Math.sin(a) * 8
      if (Math.sin(a) < 0) person(p, x, y, { robe, skin, pose: 'dance', frame: fr + off, flip: Math.cos(a) < 0 })
    })
    campfire(p, 128, 110, t, 2)
    ring.forEach(([robe, skin, off], i) => {
      const a = (i / ring.length) * Math.PI * 2 + t * 0.35
      const x = 128 + Math.cos(a) * 34
      const y = 112 + Math.sin(a) * 8
      if (Math.sin(a) >= 0) person(p, x, y, { robe, skin, pose: 'dance', frame: fr + off, flip: Math.cos(a) < 0, hat: i % 2 ? 'scarf' : 'none', hatColor: C(0xe8dcc0) })
    })
    person(p, 30, 120, { robe: ROBE.purple, pose: 'lute', frame: fr, skin: 1 })
    person(p, 226, 122, { robe: ROBE.brown, pose: 'drum', frame: fr, flip: true, hat: 'cap', hatColor: C(0xa83030) })
  },
}

const sickly = ramp(0x2a3220, 0x3e4a28, 0x58642e, 0x78803a, 0x9a9a4a, 0xb4ae62)

const epidemic: Scene = {
  draw(p) {
    sky(p, sickly, 0, 74)
    p.disc(70, 22, 8, 8, C(0xd8d8a0))
    glow(p, 70, 22, 30, C(0xd8d8a0), 0.3)
    land(p, (x) => 64 - noise(x * 0.02, 0, 3) * 8, (x, y, dd) => tone(ramp(0x323a24, 0x404a2c, 0x4e5832), 2 - dd * 0.1, x, y), 76)
    p.veil(C(0x6a7040), 0.45, () => {
      house(p, 140, 72, { w: 12, d: 16, h: 9, shutters: true, roof: THATCH })
      house(p, 176, 74, { w: 14, d: 20, h: 10, shutters: true })
      house(p, 216, 72, { w: 10, d: 14, h: 8, shutters: true })
    })
    land(p, () => 76, (x, y, dd) => tone(ramp(0x2e3420, 0x3e4628, 0x4e5830, 0x606a38, 0x747c44), 2.4 - dd * 0.01 + (noise(x * 0.2, y * 0.4, 6) - 0.5) * 1.2, x, y))
    p.poly([90, H, 170, H, 130, 76, 122, 76], (x, y) => tone(DIRT, 2.2 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
    house(p, 6, 104, { w: 22, d: 36, h: 15, shutters: true, roof: THATCH, door: 'cross' })
    house(p, 188, 108, { w: 18, d: 30, h: 13, shutters: true, roof: TILE, door: 'cross', chimney: true })
    p.sprite(SPRITES.dead[0], 172, 86)
    // A cart with the sick, a plague doctor beside it.
    cot(p, 96, 116, ROBE.grey, 1)
    person(p, 136, 118, { robe: ROBE.black, hat: 'beak', pose: 'cane', flip: true })
    person(p, 160, 104, { robe: ROBE.brown, hat: 'hood', pose: 'cane', flip: true, skin: 2 })
    // Crows on a fence.
    for (let i = 0; i < 6; i++) {
      const fx = 64 + i * 6
      p.rect(fx, 94, 1, 8, WOOD[1])
    }
    p.line(62, 96, 98, 96, WOOD[2])
    for (const cx of [70, 82]) {
      p.rect(cx, 92, 3, 3, INK)
      p.set(cx + 3, 92, C(0x5a5a2a))
      p.set(cx - 1, 94, INK)
    }
  },
  fx(p, t) {
    // The miasma: green vapour curling over the village.
    for (let y = 40; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = fbm(x * 0.03 + t * 0.15, y * 0.06 - t * 0.05, 31, 3)
        if (v > 0.5) p.tint(x, y, v > 0.62 ? C(0xb0d860) : C(0x7ab040), (v - 0.5) * 2.4)
      }
    }
    birds(p, t * 0.6, 3, 120, 14, INK, 9)
  },
}

const goldRush: Scene = {
  draw(p) {
    sky(p, ramp(0x2a5c9c, 0x3a74b4, 0x5a92c8, 0x86b2d6, 0xb6d0e0), 0, 70)
    cloud(p, 200, 14, 60, 12, ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff), 6)
    // Far peaks with snow.
    land(p, (x) => 30 + Math.abs(((x * 0.9) % 70) - 35) * 0.9 + noise(x * 0.08, 0, 2) * 6, (x, y, dd) => (dd < 8 - noise(x * 0.3, 0, 3) * 5 ? tone(SNOW, 4 - ((x * 0.9) % 70 > 35 ? 1.5 : 0), x, y) : tone(ramp(0x3a4a66, 0x4c5e7a, 0x627490, 0x7a8ca6), 2.6 - ((x * 0.9) % 70 > 35 ? 1.2 : 0) - dd * 0.02, x, y)), 76)
    // The mine's mountain, its face in rock strata.
    const rock = ramp(0x2e2622, 0x463a32, 0x624e42, 0x7e6654, 0x9a806a, 0xb89c82)
    land(p, (x) => (x < 140 ? 36 + (x / 140) ** 2 * 30 + noise(x * 0.1, 0, 7) * 6 : 72 + noise(x * 0.05, 0, 8) * 4), (x, y, dd) => {
      const strata = Math.sin(y * 0.5 + noise(x * 0.05, y * 0.05, 4) * 4)
      return tone(rock, 3.2 - (strata > 0.7 ? 1 : 0) - dd * 0.015 + (noise(x * 0.25, y * 0.25, 9) - 0.5) * 1.2 - (x > 100 ? (x - 100) * 0.01 : 0), x, y)
    })
    land(p, (x) => 96 + Math.sin(x * 0.03) * 2, (x, y, dd) => tone(DIRT, 3 - dd * 0.02 + (noise(x * 0.3, y * 0.4, 3) - 0.5) * 1.2, x, y))
    // Gold seams in the rock.
    for (let i = 0; i < 24; i++) {
      const x = 10 + rnd(i, 0, 2) * 110
      const y = 50 + rnd(i, 1, 2) * 40
      if (y < 36 + (x / 140) ** 2 * 30 + 8) continue
      p.set(x, y, GOLD[3])
      p.set(x + 1, y, GOLD[2])
      p.set(x + 1, y + 1, GOLD[1])
    }
    // The mine mouth framed in timber.
    p.poly([44, 96, 44, 74, 50, 68, 66, 68, 72, 74, 72, 96], (x, y) => tone(ramp(0x050404, 0x0e0a08, 0x1a1410), 1.2 - (y - 68) * 0.04, x, y))
    for (const x of [42, 72]) p.box(x, 70, x + 3, 96, (px, py) => tone(WOOD, px === x ? 3.4 : 2, px, py))
    p.box(40, 66, 77, 70, (x, y) => tone(WOOD, 3.4 - (y - 66) * 0.5, x, y))
    glow(p, 58, 84, 10, C(0xffb040), 0.4)
    p.rect(57, 82, 2, 3, C(0xffe080))
    // Rails and a cart of ore.
    p.line(56, 96, 100, 128, WOOD[1])
    p.line(62, 96, 118, 128, WOOD[1])
    for (let i = 0; i < 9; i++) {
      const u = i / 8
      p.line(55 + u * 46, 96 + u * 32, 63 + u * 56, 96 + u * 32, WOOD[2])
    }
    p.line(57, 96, 101, 128, STONE[4])
    p.line(63, 96, 119, 128, STONE[4])
    p.box(76, 100, 100, 110, (x, y) => tone(STONE, 2.8 - (x - 76) * 0.06 - (y === 104 ? 1 : 0), x, y))
    cluster(p, 88, 98, 22, 8, GOLD, 4, 8, { rough: 0.8 })
    wheel(p, 81, 111, 3)
    wheel(p, 95, 111, 3)
    // Tents of the prospectors.
    for (const [x, y, c] of [[176, 82, 0xd8c8a0], [206, 86, 0xc8b890], [234, 80, 0xd8c8a0]]) {
      p.poly([x - 10, y, x, y - 14, x + 12, y], (px, py) => tone(ramp(0x6a5a40, 0x9a8a68, c, 0xf0e4c8), px < x ? 3 : 1.6, px, py))
      p.poly([x - 2, y, x, y - 7, x + 2, y], C(0x2a2018))
    }
    smoke(p, 196, 84, 2, { n: 4, size: 2, rise: 20, c: ramp(0x8a8a90, 0xa8a8b0, 0xc8c8d0, 0xe8e8f0), k: 0.5 })
    p.sprite(SPRITES.pine[0], 150, 92)
    p.sprite(SPRITES.pine[2], 250, 98)
  },
  fx(p, t) {
    const fr = Math.floor(t * 2.5)
    person(p, 30, 110, { robe: ROBE.blue, hat: 'cap', hatColor: C(0xa83030), pose: 'pick', frame: fr })
    person(p, 140, 118, { robe: ROBE.ochre, hat: 'straw', pose: 'pick', frame: fr + 1, flip: true, skin: 1 })
    person(p, 190, 116, { robe: ROBE.brown, hat: 'none', pose: 'pan', kneel: true, skin: 2 })
    // Glints dancing over the gold.
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.2 + i * 0.41) % 1
      const x = [84, 92, 88, 24, 96, 110][i]
      const y = [96, 95, 92, 74, 58, 80][i]
      glint(p, x, y, Math.round(Math.sin(ph * Math.PI) * 3), C(0xfff8d0))
    }
  },
}

const plague: Scene = {
  draw(p) {
    sky(p, ramp(0x2a2440, 0x463252, 0x6a4058, 0x9a5a5a, 0xc87a5a, 0xe0a070), 0, 76)
    land(p, (x) => 66 - noise(x * 0.02, 0, 5) * 6, (x, y, dd) => tone(ramp(0x2a2630, 0x34303a, 0x3e3a42), 2 - dd * 0.1, x, y), 78)
    land(p, () => 78, (x, y, dd) => tone(ramp(0x22281e, 0x2e3626, 0x3e4830, 0x50603a), 2.2 - dd * 0.01 + (noise(x * 0.2, y * 0.4, 2) - 0.5), x, y))
    // The one stricken house, a healer's cross on its door and flag.
    const chimney = house(p, 30, 106, { w: 30, d: 52, h: 22, roof: THATCH, door: 'cross', chimney: true, lit: true })
    if (chimney) smoke(p, chimney[0], chimney[1], 3, { n: 4, size: 2, rise: 24, drift: 10, c: ramp(0x4a4250, 0x625a66, 0x7a7280), k: 0.5 })
    p.line(130, 112, 130, 62, WOOD[1])
    p.line(131, 112, 131, 62, WOOD[2])
    p.box(132, 63, 150, 75, (x, y) => tone(PLASTER, 4 - (x - 132) * 0.08, x, y))
    p.box(139, 64, 143, 74, C(0xc8261a))
    p.box(134, 67, 148, 71, C(0xc8261a))
    // Outside, the sick on cots and a healer kneeling with a bowl.
    cot(p, 150, 118, ROBE.white, 0)
    cot(p, 182, 124, ROBE.grey, 2)
    person(p, 172, 116, { robe: ROBE.white, hat: 'veil', hatColor: C(0xf0ece0), pose: 'bowl', kneel: true, flip: true })
    person(p, 216, 116, { robe: ROBE.brown, hat: 'hood', pose: 'carry', flip: true, skin: 1 })
    // A lantern by the door.
    p.line(100, 108, 100, 92, WOOD[1])
    p.rect(98, 88, 5, 5, C(0x2a2018))
    p.rect(99, 89, 3, 3, C(0xffd070))
  },
  fx(p, t) {
    glow(p, 100, 90, 18 + Math.sin(t * 6) * 1.5, C(0xffb040), 0.45)
    p.rect(99, 89, 3, 3, C(0xfff0b0))
  },
}

// A maypole with ribbons wound round it and a flower crown.
function maypole(p: Paint, x: number, y: number, h: number, t: number) {
  p.box(x - 1, y - h, x + 2, y, (px) => (px === x - 1 ? C(0xf0e4c8) : C(0xc8b490)))
  const cols = [0xe84a40, 0xf0c040, 0x4a8ad0, 0x60b060, 0xe880b0]
  for (let i = 0; i < h - 6; i++) {
    const c = cols[Math.floor((i + t * 6) / 3) % cols.length]
    p.set(x - 1 + (i % 3), y - h + 4 + i, C(c))
  }
  cluster(p, x, y - h + 1, 10, 4, ramp(0x2a5a2a, 0x4a8a3a, 0x7aba50), 2, 6, { rough: 0.5 })
  for (let i = 0; i < 6; i++) p.set(x - 4 + i * 1.6, y - h + (i & 1), C(cols[i % 5]))
}

const festival: Scene = {
  draw(p) {
    sky(p, ramp(0x3a7cc8, 0x4c90d4, 0x6aaadc, 0x96c6e4, 0xc4dcec), 0, 70)
    const cl = ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff)
    cloud(p, 40, 18, 56, 14, cl, 9)
    cloud(p, 200, 12, 70, 14, cl, 10)
    land(p, (x) => 60 - noise(x * 0.02, 0, 11) * 8, (x, y, dd) => (dd > 8 ? tone(GRASS, 3.4 + (noise(x * 0.2, y * 0.4, 3) - 0.5), x, y) : tone(ramp(0x4a7a5a, 0x5a8c62, 0x6c9e6a), 2 - dd * 0.1, x, y)))
    // Houses round the square.
    house(p, 2, 84, { w: 20, d: 26, h: 14, roof: TILE, chimney: true })
    house(p, 192, 82, { w: 18, d: 36, h: 13, roof: THATCH })
    p.veil(C(0x9ab8c8), 0.3, () => {
      house(p, 64, 70, { w: 14, d: 22, h: 10, roof: TILE })
      house(p, 140, 70, { w: 12, d: 20, h: 10, roof: SLATE })
    })
    // Cobbled square in perspective.
    for (let y = 72; y < H; y++) {
      const depth = y - 60
      const row = Math.floor(160 / depth)
      for (let x = 0; x < W; x++) {
        if (y < 84 && (x < 52 || x > 188)) continue
        const u = ((x - 128) / depth) * 6 + (row & 1) * 0.5
        const su = u - Math.floor(u)
        const sv = 160 / depth - row
        const seam = su < 0.12 || sv < 0.15
        p.set(x, y, seam ? tone(ramp(0x5a5046, 0x6e6458), y > 100 ? 0 : 1, x, y) : tone(ramp(0x6a6054, 0x857a6a, 0xa09482, 0xbab09c), 2.6 - sv * 0.9 + rnd(Math.floor(u), row, 3) * 0.6, x, y))
      }
    }
    // Trestle table with food and barrels.
    p.box(176, 108, 212, 111, (x, y) => tone(WOOD, 3.6 - (y - 108) * 0.8, x, y))
    for (const lx of [178, 209]) p.line(lx, 111, lx, 118, WOOD[1])
    for (let i = 0; i < 5; i++) ball(p, 181 + i * 7, 106, 2.5, 2, i % 2 ? ramp(0x7a3410, 0xb86018, 0xe0a050) : ramp(0x5a1a1a, 0xa83030, 0xe05a40), { seed: i })
    for (const [x, y] of [[226, 118], [238, 122]]) {
      shadow(p, x + 2, y, 6, 1.5)
      p.box(x - 4, y - 10, x + 5, y, (px, py) => tone(WOOD, 3.4 - (px - x + 4) * 0.3 - ((py - y) % 4 === 0 ? 1 : 0), px, py))
      p.line(x - 4, y - 8, x + 4, y - 8, STONE[2])
      p.line(x - 4, y - 3, x + 4, y - 3, STONE[2])
    }
  },
  fx(p, t) {
    // Bunting zigzagging across, fluttering.
    const cols = [0xe84a40, 0xf0c040, 0x4a8ad0, 0x60b060, 0xf4f0e8]
    for (const [a, ay, b, by, sag] of [[22, 66, 128, 52, 10], [128, 52, 228, 66, 10], [22, 74, 128, 60, 8], [128, 60, 228, 74, 8]] as const) {
      for (let i = 0; i <= 40; i++) {
        const u = i / 40
        const x = a + (b - a) * u
        const y = ay + (by - ay) * u + Math.sin(u * Math.PI) * sag
        p.set(x, y, C(0x3a2a20))
        if (i % 4 === 2) {
          const flap = Math.round(Math.sin(t * 6 + i) * 0.8)
          p.poly([x - 2, y + 1, x + 2, y + 1, x + flap, y + 5], C(cols[(i / 4) % cols.length | 0]))
        }
      }
    }
    maypole(p, 128, 102, 50, t)
    const fr = Math.floor(t * 3)
    const dancers: [number, number, Who['robe'], number][] = [[104, 108, ROBE.red, 0], [150, 108, ROBE.blue, 1], [116, 116, ROBE.ochre, 1], [142, 118, ROBE.rose, 0]]
    for (const [x, y, robe, off] of dancers) {
      p.line(128, 58, x + (x < 128 ? 4 : -4), y - 12, C([0xe84a40, 0xf0c040, 0x4a8ad0, 0xe880b0][off + (x > 128 ? 2 : 0)]))
      person(p, x, y, { robe, pose: 'dance', frame: fr + off, flip: x > 128, hat: off ? 'scarf' : 'none', hatColor: C(0xf0e4c8), skin: off })
    }
    person(p, 36, 116, { robe: ROBE.purple, pose: 'lute', frame: fr, hat: 'cap', hatColor: C(0x3a7a3a) })
    person(p, 54, 120, { robe: ROBE.green, pose: 'drum', frame: fr, skin: 1 })
    person(p, 72, 114, { robe: ROBE.red, pose: 'pipe', frame: fr, skin: 2, hat: 'cap', hatColor: C(0xf0c040) })
    person(p, 196, 120, { robe: ROBE.brown, pose: 'up', frame: fr, flip: true })
  },
}

const forestFire: Scene = {
  draw(p) {
    sky(p, ramp(0x140808, 0x2a0e0a, 0x4a160e, 0x7a2612, 0xb04018, 0xd86a22), 0, 84)
    // Heavy smoke banks in the sky.
    for (let y = 0; y < 70; y++) for (let x = 0; x < W; x++) {
      const v = fbm(x * 0.02, y * 0.05, 17, 4)
      if (v > 0.5) p.tint(x, y, tone(ramp(0x1a1010, 0x2a1a16, 0x40282a), (v - 0.5) * 8, x, y), 0.8)
    }
    // Ridges of burning forest, back to front.
    land(p, (x) => 70 - noise(x * 0.03, 0, 2) * 8, (x, y) => tone(ramp(0x1a0a08, 0x2a100a, 0x3a160c), 1, x, y))
    for (let i = 0; i < 26; i++) conifer(p, i * 10 + rnd(i, 0, 1) * 6, 74 + rnd(i, 1, 1) * 4, 14 + rnd(i, 2, 1) * 8, ramp(0x0a0606, 0x140a08, 0x20100a, 0x2c160c), { seed: i })
    land(p, (x) => 92 + Math.sin(x * 0.04) * 3, (x, y, dd) => tone(ramp(0x120a08, 0x22140e, 0x382218, 0x4e3220), 1.6 + dd * 0.02 + (noise(x * 0.3, y * 0.3, 5) - 0.5) * 1.2, x, y))
    for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) p.tint(x, y, C(0xf07a20), 0.35 * clamp(1 - Math.abs(y - 80) / 40))
    // Charred trunks up front.
    for (const [x, h] of [[24, 40], [214, 46], [236, 30]]) {
      p.box(x, 128 - h, x + 3, 128, (px, py) => (rnd(px, py, 2) > 0.85 ? C(0xe86a20) : px === x ? C(0x3a2014) : C(0x140a08)))
      p.line(x + 1, 128 - h + 10, x + 7, 128 - h + 4, C(0x140a08))
      p.line(x + 1, 128 - h + 18, x - 5, 128 - h + 12, C(0x140a08))
    }
  },
  fx(p, t) {
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 28 + rnd(i, 0, 3) * 10
      smoke(p, x, 62, t + i * 1.7, { n: 5, size: 5, rise: 64, drift: 26, seed: i, k: 0.7 })
    }
    for (let i = 0; i < 15; i++) {
      const x = i * 18 + rnd(i, 0, 4) * 12
      const w = 5 + rnd(i, 3, 4) * 10
      flames(p, x - w, x + w, 74 + rnd(i, 1, 4) * 8, 8 + rnd(i, 2, 4) ** 2 * 26, t, i)
    }
    flames(p, 60, 120, 96, 18, t, 40)
    flames(p, 150, 190, 98, 12, t, 41)
    // Embers rising.
    for (let i = 0; i < 40; i++) {
      const a = (t * (0.15 + rnd(i, 0, 6) * 0.2) + rnd(i, 1, 6)) % 1
      const x = rnd(i, 2, 6) * W + Math.sin(a * 8 + i) * 4 + a * 20
      const y = 100 - a * 100
      p.set(x, y, a < 0.5 ? C(0xffe070) : C(0xe86a20))
    }
    // A deer fleeing.
    const fr = Math.floor(t * 6) % 2
    const dx = 150
    const dy = 116
    const hide = ramp(0x4a2a14, 0x7a4a24, 0xa86a34, 0xd0904a)
    ball(p, dx, dy - 9, 7, 3, hide, { seed: 1 })
    p.line(dx + 6, dy - 10, dx + 9, dy - 16, hide[1])
    p.rect(dx + 8, dy - 18, 4, 3, hide[2])
    p.line(dx + 9, dy - 18, dx + 8, dy - 22, hide[0])
    p.line(dx + 8, dy - 21, dx + 6, dy - 23, hide[0])
    for (const [lx, sw] of [[-5, 1], [-3, -1], [4, -1], [6, 1]]) p.line(dx + lx, dy - 7, dx + lx + (fr ? sw * 3 : -sw * 2), dy - 1, hide[1])
    p.set(dx - 7, dy - 11, C(0xf0e0d0))
  },
}

const oreVein: Scene = {
  draw(p) {
    // A mine tunnel running away into the dark, lit by one lantern.
    const vx = 156
    const vy = 58
    const rock = ramp(0x1a1614, 0x2c2622, 0x423832, 0x5a4c42, 0x766254, 0x92806c)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - vx
      const dy = y - vy
      const r = Math.max(Math.abs(dx) / 1.6, Math.abs(dy) * 1.1)
      const tun = 1 / Math.max(0.3, r)
      const v = fbm(Math.atan2(dy, dx) * 3, tun * 60, 5, 3)
      const crack = noise(x * 0.2, y * 0.2, 9) > 0.72 ? -1 : 0
      p.px[y * W + x] = tone(rock, 1.6 + v * 3 + crack + (y > vy + 20 && Math.abs(dx) < r * 1.4 ? -0.6 : 0), x, y)
    }
    // Timber frames receding.
    for (let i = 0; i < 6; i++) {
      const s = 1 / (1 + i * 0.75)
      const half = 110 * s
      const top = vy - 56 * s
      const bottom = vy + 66 * s
      const th = Math.max(1, Math.round(6 * s))
      p.box(vx - half, top, vx - half + th, bottom, (x, y) => tone(WOOD, x < vx - half + th / 2 ? 3.4 : 2.2, x, y))
      p.box(vx + half - th, top, vx + half, bottom, (x, y) => tone(WOOD, 2, x, y))
      p.box(vx - half - th, top - th, vx + half + th, top, (x, y) => tone(WOOD, 3.2 - (y - top + th) / th, x, y))
    }
    // The rails.
    for (let y = vy + 4; y < H; y++) {
      const s = (y - vy) / 66
      for (const off of [-20, 20]) p.set(vx + off * s, y, STONE[4])
      if (Math.floor(Math.log(s + 0.1) * 9) % 2 === 0) p.box(vx - 26 * s, y, vx + 26 * s, y + 1, WOOD[1])
    }
    // The vein: a seam of shining blue-white crystal in the right wall.
    const vein = ramp(0x1a3a5a, 0x2a6a90, 0x4aa0c8, 0x8ad8f0, 0xd8faff)
    for (let x = 176; x < 252; x++) {
      const c = 50 + (x - 176) * 0.35 + Math.sin(x * 0.15) * 6
      const h = 4 + noise(x * 0.12, 0, 4) * 8
      for (let y = Math.floor(c - h); y < c + h; y++) {
        const v = 1 - Math.abs(y - c) / h + (rnd(x, y, 3) - 0.5) * 0.6
        if (v > 0.15) p.set(x, y, tone(vein, v * 4.5, x, y))
      }
    }
    // Darkness: everything falls off away from the lantern and the vein.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dl = Math.hypot(x - 74, (y - 44) * 1.2)
      const dv = Math.hypot((x - 210) * 0.6, (y - 74) * 0.8)
      const tun = Math.hypot((x - vx) / 1.6, y - vy)
      const light = Math.max(clamp(1 - dl / 130), clamp(1 - dv / 46) * 0.7)
      p.tint(x, y, C(0x060408), clamp(1 - light * 1.1 + (tun < 26 ? 0.4 : 0)))
      if (dl < 70) p.tint(x, y, C(0xf0a040), 0.25 * (1 - dl / 70))
      if (dv < 40) p.tint(x, y, C(0x60c0f0), 0.25 * (1 - dv / 40))
    }
    // Mine cart.
    shadow(p, 46, 122, 22, 2.5)
    p.poly([24, 98, 68, 98, 64, 118, 28, 118], (x, y) => tone(STONE, 3.2 - (x - 24) * 0.05 - (y === 108 ? 1 : 0), x, y))
    cluster(p, 46, 96, 40, 9, vein, 3, 8, { rough: 0.8 })
    wheel(p, 34, 120, 4)
    wheel(p, 58, 120, 4)
    // The hanging lantern.
    p.line(74, 30, 74, 38, C(0x2a2018))
    p.rect(71, 38, 7, 8, C(0x2a2018))
    p.rect(72, 39, 5, 6, C(0xffd070))
    p.rect(73, 40, 2, 3, C(0xfff8e0))
  },
  fx(p, t) {
    glow(p, 74, 42, 22 + Math.sin(t * 7) * 1.5, C(0xffc060), 0.35)
    const fr = Math.floor(t * 2)
    person(p, 194, 104, { robe: ROBE.brown, hat: 'cap', hatColor: C(0x6a4a2e), pose: 'pick', frame: fr, skin: 1 })
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.9 + i * 0.29) % 1
      glint(p, 186 + i * 10, 52 + ((i * 7) % 11) + (i * 3.5), Math.round(Math.sin(ph * Math.PI) * 3), C(0xe8ffff))
    }
    // Chips flying off where the pick bites.
    if (fr % 2 === 1) for (let i = 0; i < 4; i++) p.set(206 + i * 2, 100 - i * 3 + (i & 1), C(0xa8e8ff))
  },
}

const merchants: Scene = {
  draw(p) {
    sky(p, ramp(0x3c80c4, 0x529ad0, 0x78b4d8, 0xa8cedc, 0xd4e2dc), 0, 66)
    const cl = ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff)
    cloud(p, 80, 14, 70, 14, cl, 11)
    cloud(p, 210, 22, 50, 10, cl, 12)
    land(p, (x) => 58 - noise(x * 0.02, 0, 12) * 10, (x, y, dd) => tone(ramp(0x4a7458, 0x5a8460, 0x6a9668), 2 - dd * 0.1, x, y), 70)
    for (let i = 0; i < 10; i++) p.veil(C(0xa8c4c8), 0.35, () => roundTree(p, 10 + i * 26, 66 + (i & 1) * 2, 4, LEAF[i % 3], 40 + i))
    land(p, fields(66), (x, y, dd) => tone(GRASS, 3.8 - dd * 0.012 + (noise(x * 0.2, y * 0.4, 3) - 0.5) * 1.1, x, y))
    for (let i = 0; i < 80; i++) {
      const x = rnd(i, 0, 7) * W
      const y = 70 + rnd(i, 1, 7) ** 0.7 * 56
      p.set(x, y, C([0xf0e070, 0xf8f4f0, 0xe07090][i % 3]))
    }
    roundTree(p, 22, 98, 12, LEAF[0], 2)
    wagon(p, 50, 100, [C(0xc83a2a), C(0xf0e4c8)])
    horse(p, 98, 99, 0, ramp(0x3a2214, 0x6a4026, 0x8e5a34, 0xb07a48))
    wagon(p, 150, 92, [C(0x2a5aa8), C(0xf0c840)], false)
    // A rug laid out with wares: pots, cloth, a chest.
    p.poly([108, 112, 168, 112, 176, 124, 100, 124], (x, y) => ((x + y) % 6 < 2 ? C(0xe8c050) : (Math.floor(x / 3) + y) % 4 === 0 ? C(0x2a4a8a) : C(0x9a2a2a)))
    p.line(100, 124, 176, 124, C(0x5a1a1a))
    for (const [x, c] of [[112, ramp(0x6a2e1a, 0xa04a2a, 0xc87040, 0xe8a070)], [120, ramp(0x2a4a5a, 0x3a6a7a, 0x5a9aa0, 0x8acac8)], [127, ramp(0x6a2e1a, 0xa04a2a, 0xc87040, 0xe8a070)]] as const) {
      ball(p, x, 114, 3.5, 4, c, { seed: x })
      p.rect(x - 1, 109, 3, 2, c[1])
    }
    for (const [x, c] of [[140, 0x8a3a9a], [146, 0x3a9a6a], [152, 0xe0a030]] as const) {
      p.box(x, 114, x + 5, 120, (px, py) => mix(C(c), INK, ((px - x) / 5) * 0.4 + (py === 114 ? -0.2 : 0)))
      p.line(x, 114, x + 4, 114, mix(C(c), C(0xffffff), 0.35))
    }
    p.box(158, 112, 170, 120, (x, y) => tone(WOOD, 3 - (x - 158) * 0.15, x, y))
    p.rect(158, 111, 12, 2, GOLD[2])
    p.rect(163, 114, 2, 2, GOLD[3])
  },
  fx(p, t) {
    const fr = Math.floor(t * 1.5)
    person(p, 188, 118, { robe: ROBE.purple, hat: 'turban', hatColor: C(0xe8c050), pose: fr % 2 ? 'point' : 'hold', flip: true, skin: 1 })
    person(p, 214, 122, { robe: ROBE.green, hat: 'hood', pose: 'stand', flip: true, skin: 0 })
    person(p, 228, 118, { robe: ROBE.red, hat: 'scarf', hatColor: C(0xf0e4c8), pose: 'hold', flip: true, skin: 2 })
    // A pennant on the wagon.
    const wv = Math.round(Math.sin(t * 5))
    p.line(176, 66, 176, 52, WOOD[1])
    p.poly([177, 52, 186, 54 + wv, 177, 57], C(0xf0c840))
  },
}

const granaryFire: Scene = {
  draw(p) {
    sky(p, ramp(0x0e0a1e, 0x1c1030, 0x3a1838, 0x6a2a32, 0xa04a2a, 0xd07a30), 0, 80)
    land(p, (x) => 70 - noise(x * 0.02, 0, 14) * 8, (x, y, dd) => tone(ramp(0x140c14, 0x1e121a, 0x2a1a20), 2 - dd * 0.1, x, y), 80)
    land(p, () => 80, (x, y, dd) => tone(ramp(0x1a120e, 0x2a1c14, 0x3e2a1a, 0x543a22, 0x6e4e2e), 2 + dd * 0.02 + (noise(x * 0.25, y * 0.4, 4) - 0.5), x, y))
    // The firelight over the yard.
    for (let y = 30; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 110, (y - 80) * 1.4)
      if (d < 150) p.tint(x, y, C(0xf08a30), 0.6 * (1 - d / 150) ** 1.4)
    }
    // The burning barn.
    house(p, 64, 98, { w: 34, d: 54, h: 24, roof: THATCH, wall: ramp(0x3a1410, 0x5a2016, 0x7e2e1e, 0xa04028, 0xb85a38), door: 'barn', timber: true, windows: 2 })
    // Its door glowing from inside.
    p.box(68, 78, 94, 98, (x, y) => (x === 68 || x === 93 || y === 78 ? WOOD[0] : tone(FIRE, 0.6 + (y - 78) * 0.09 + (noise(x * 0.4, y * 0.3, 2) - 0.5), x, y)))
    // Sacks of grain saved from it, and a well.
    for (const [x, y, s] of [[24, 124, 1], [34, 126, 2], [29, 117, 3], [200, 124, 4], [210, 122, 5]]) sack(p, x, y, s)
    shadow(p, 236, 106, 10, 2)
    p.box(226, 96, 246, 106, (x, y) => ((x + (y % 4 < 2 ? 0 : 2)) % 4 === 0 || y % 4 === 0 ? STONE[1] : tone(STONE, 4 - (x - 226) * 0.15, x, y)))
    p.disc(236, 96, 10, 3, STONE[3])
    p.disc(236, 96, 8, 2, C(0x14100c))
  },
  fx(p, t) {
    smoke(p, 100, 52, t, { n: 7, size: 6, rise: 60, drift: 40, k: 0.9 })
    smoke(p, 130, 62, t + 2, { n: 5, size: 5, rise: 60, drift: 30, k: 0.8, seed: 2 })
    flames(p, 70, 130, 72, 30, t, 3)
    flames(p, 110, 150, 76, 22, t, 4)
    flames(p, 96, 116, 92, 10, t, 5)
    for (let i = 0; i < 30; i++) {
      const a = (t * (0.2 + rnd(i, 0, 3) * 0.2) + rnd(i, 1, 3)) % 1
      p.set(70 + rnd(i, 2, 3) * 80 + a * 30 + Math.sin(a * 9 + i) * 3, 72 - a * 70, a < 0.5 ? C(0xffe070) : C(0xe86a20))
    }
    // The bucket chain from the well.
    const fr = Math.floor(t * 3)
    person(p, 222, 110, { robe: ROBE.brown, pose: 'carry', flip: true, frame: fr, skin: 1 })
    person(p, 196, 114, { robe: ROBE.blue, pose: 'carry', flip: true, frame: fr + 1, hat: 'cap', hatColor: C(0x6a3a2a) })
    person(p, 170, 112, { robe: ROBE.red, pose: 'carry', flip: true, frame: fr, hat: 'scarf', hatColor: C(0xe8dcc0), skin: 2 })
    person(p, 150, 118, { robe: ROBE.green, pose: fr % 2 ? 'up' : 'carry', flip: true, frame: fr })
    // Water flung at the flames.
    if (fr % 2 === 0) for (let i = 0; i < 6; i++) p.set(142 - i * 2, 108 - i + (i * i) * 0.2, C(0x8ac8f0))
  },
}

const treasure: Scene = {
  draw(p) {
    sky(p, ramp(0x3a7cc0, 0x5092cc, 0x74acd6, 0xa2c8dc, 0xd0e0dc), 0, 64)
    const cl = ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff)
    cloud(p, 180, 16, 80, 14, cl, 13)
    land(p, (x) => 56 - noise(x * 0.02, 0, 13) * 10, (x, y, dd) => tone(ramp(0x4a7458, 0x5a8460, 0x6a9668), 2 - dd * 0.1, x, y), 70)
    p.veil(C(0xa8c4c8), 0.3, () => {
      roundTree(p, 30, 66, 6, LEAF[0], 1)
      house(p, 200, 66, { w: 12, d: 18, h: 9, roof: TILE, chimney: true })
    })
    // A meadow, and an old oak.
    land(p, fields(64), (x, y, dd) => tone(GRASS, 3.6 - dd * 0.01 + (noise(x * 0.2, y * 0.4, 3) - 0.5) * 1.1, x, y))
    p.sprite(SPRITES.oak[0], 34, 104)
    // The pit and its spoil heap.
    p.disc(126, 108, 26, 9, (x, y) => tone(DIRT, 2.4 + (noise(x * 0.3, y * 0.3, 2) - 0.5) - (y - 108) * 0.05, x, y))
    p.disc(126, 109, 20, 6, (x, y) => tone(DIRT, 0.6 + (y - 103) * 0.15, x, y))
    for (let x = 146; x < 196; x++) {
      const u = (x - 146) / 50
      const top = 106 - Math.sin(u * Math.PI) ** 0.7 * 9 - noise(x * 0.3, 0, 4) * 2
      for (let y = Math.floor(top); y < 108; y++) p.set(x, y, tone(DIRT, 3.4 - (y - top) * 0.2 - u * 1.2 + (rnd(x, y, 6) - 0.5) * 0.8, x, y))
    }
    // The chest, lid thrown open, gold heaped and spilling.
    const iron = STONE[1]
    p.box(112, 100, 140, 112, (x, y) => tone(WOOD, 3 - (x - 112) * 0.05 - ((y - 100) % 4 === 0 ? 0.8 : 0), x, y))
    for (const x of [112, 125, 139]) p.line(x, 100, x, 111, iron)
    p.poly([111, 100, 141, 100, 139, 88, 113, 88], (x, y) => tone(WOOD, 1.6 + (y - 88) * 0.06, x, y))
    p.line(113, 88, 139, 88, iron)
    p.rect(124, 104, 3, 3, GOLD[3])
    cluster(p, 126, 100, 26, 6, GOLD, 8, 9, { rough: 0.6, bias: 0.4 })
    for (let i = 0; i < 16; i++) {
      const x = 100 + rnd(i, 0, 5) * 56
      const y = 108 + rnd(i, 1, 5) * 12
      p.rect(x, y, 2, 1, GOLD[3])
      p.set(x, y + 1, GOLD[1])
    }
    for (const [x, y, c] of [[118, 96, 0xe03050], [132, 95, 0x30c070], [128, 93, 0x4080f0]]) {
      p.set(x, y, C(c))
      p.set(x + 1, y, mix(C(c), INK, 0.4))
      p.set(x, y - 1, C(0xffffff))
    }
    glow(p, 126, 96, 30, C(0xfff0a0), 0.35)
  },
  fx(p, t) {
    const fr = Math.floor(t * 2)
    person(p, 92, 112, { robe: ROBE.brown, hat: 'straw', pose: 'dig', frame: fr })
    person(p, 160, 116, { robe: ROBE.green, hat: 'cap', hatColor: C(0x8a3030), pose: 'up', frame: fr, flip: true, skin: 1 })
    person(p, 182, 120, { robe: ROBE.red, hat: 'scarf', hatColor: C(0xf0e4c8), pose: 'point', flip: true, skin: 2 })
    for (let i = 0; i < 7; i++) {
      const ph = (t * 1.1 + i * 0.37) % 1
      glint(p, 112 + ((i * 37) % 30), 92 + ((i * 13) % 12), Math.round(Math.sin(ph * Math.PI) * 3), C(0xfffbe0))
    }
  },
}

const coldSnap: Scene = {
  draw(p) {
    sky(p, ramp(0x6a86a8, 0x7e98b6, 0x96aec6, 0xb0c4d4, 0xccdae4, 0xe2eaf0), 0, 66)
    p.disc(60, 24, 7, 7, C(0xf4f6f8))
    glow(p, 60, 24, 26, C(0xf8fafc), 0.4)
    land(p, (x) => 40 + Math.abs(((x * 0.7 + 20) % 90) - 45) * 0.5 + noise(x * 0.08, 0, 2) * 5, (x, y, dd) => tone(SNOW, 4 - ((x * 0.7 + 20) % 90 > 45 ? 1.4 : 0) - dd * 0.03, x, y), 70)
    land(p, (x) => 64 - noise(x * 0.03, 0, 5) * 6, (x, y, dd) => tone(SNOW, 4.2 - dd * 0.02 + (noise(x * 0.15, y * 0.3, 6) - 0.5) * 0.8, x, y))
    for (let i = 0; i < 16; i++) p.veil(C(0xb0c0d0), 0.4, () => conifer(p, 6 + i * 16 + rnd(i, 0, 2) * 6, 70 + rnd(i, 1, 2) * 4, 14 + rnd(i, 2, 2) * 8, ramp(0x0e2228, 0x163430, 0x204638, 0x2c5844), { snow: true, seed: i }))
    // A frozen pond with cracks and glints.
    p.disc(176, 102, 54, 12, (x, y) => tone(ramp(0x5a7c98, 0x7a9cb6, 0x9ebcd0, 0xc4dce8, 0xe8f4fa), 2.4 + (y - 102) * 0.06 + (noise(x * 0.08, y * 0.3, 4) - 0.5) * 1.4, x, y))
    for (let i = 0; i < 5; i++) {
      let x = 150 + i * 12
      let y = 96 + (i % 3) * 4
      for (let s = 0; s < 5; s++) {
        const nx = x + 3 + rnd(i, s, 3) * 4
        const ny = y + (rnd(i, s, 4) - 0.5) * 4
        p.line(x, y, nx, ny, C(0xf8fcff))
        x = nx
        y = ny
      }
    }
    // The snowed-in cottage with icicles.
    const chimney = house(p, 8, 100, { w: 22, d: 34, h: 14, snow: true, icicles: true, lit: true, chimney: true, roof: SLATE })
    if (chimney) smoke(p, chimney[0], chimney[1], 1, { n: 4, size: 2, rise: 24, drift: 14, c: ramp(0x8a96a6, 0xa6b0bc, 0xc6ced8, 0xe4eaf0), k: 0.6 })
    // Snowbanks, a woodpile.
    for (let x = 0; x < W; x++) {
      const top = 116 + Math.sin(x * 0.05) * 3 + noise(x * 0.1, 0, 7) * 3
      for (let y = Math.floor(top); y < H; y++) p.set(x, y, tone(SNOW, 4.6 - (y - top) * 0.06 + clamp((noise(x * 0.1 + 0.3, 0, 7) - noise(x * 0.1 - 0.3, 0, 7)) * 3, -1, 1) * clamp(1 - (y - top) / 6), x, y))
    }
    for (let i = 0; i < 9; i++) {
      const x = 74 + (i % 3) * 5 + (i >= 3 ? 2 : 0) + (i >= 6 ? 2 : 0)
      const y = 112 - Math.floor(i / 3) * 4
      p.disc(x, y, 2.5, 2, WOOD[2])
      p.set(x - 1, y - 1, WOOD[4])
    }
    for (let x = 72; x < 90; x++) p.set(x, 103, SNOW[5])
  },
  fx(p, t) {
    const jit = Math.floor(t * 12) % 2
    campfire(p, 128, 120, t, 1)
    glow(p, 128, 114, 22, C(0xffa040), 0.35 + Math.sin(t * 8) * 0.05)
    person(p, 112 + jit, 122, { robe: ROBE.grey, hat: 'hood', hatColor: ROBE.brown[1], pose: 'shiver', skin: 0 })
    person(p, 146, 120, { robe: ROBE.blue, hat: 'scarf', hatColor: C(0x9a2a2a), pose: 'hold', flip: true, skin: 1 })
    // Breath steaming in the cold.
    const a = (t * 0.7) % 1
    p.tint(116 + a * 6, 106 - a * 4, C(0xffffff), 0.7 * (1 - a))
    p.tint(117 + a * 6, 106 - a * 4, C(0xffffff), 0.5 * (1 - a))
    snowfall(p, t, 90)
  },
}

// The pilgrims' road winding up to the temple: its middle at row y.
const pilgrimRoad = (y: number) => {
  const u = (y - 56) / (H - 56)
  return 168 - Math.sin(u * 5) * 30 * u - u * 50
}

const pilgrims: Scene = {
  draw(p) {
    sky(p, ramp(0x2a2a5a, 0x4a3a6a, 0x7a4a72, 0xb86a6e, 0xe89a6a, 0xf8c88a, 0xfbe4b0), 0, 76)
    // Dawn rays fanning out from behind the temple.
    for (let y = 0; y < 76; y++) for (let x = 0; x < W; x++) {
      const a = Math.atan2(y - 44, x - 170)
      if (Math.sin(a * 18) > 0.55 && y < 44) p.tint(x, y, C(0xfff0c0), 0.3 * clamp(1 - Math.hypot(x - 170, y - 44) / 140))
    }
    glow(p, 170, 44, 50, C(0xfff0c0), 0.55)
    land(p, (x) => 66 - noise(x * 0.02, 0, 16) * 10, (x, y, dd) => (dd > 12 ? tone(ramp(0x2e3a26, 0x3a4a2e, 0x4a5a36), 1.4 - dd * 0.02 + (noise(x * 0.2, y * 0.3, 5) - 0.5) * 0.8, x, y) : tone(ramp(0x4a3a5a, 0x5a4664, 0x6c5470), 2 - dd * 0.1, x, y)))
    // The temple's hill.
    land(p, (x) => 52 + ((x - 170) / 60) ** 2 * 26 + noise(x * 0.1, 0, 2) * 2, (x, y, dd) => tone(ramp(0x3a4a2e, 0x4a5c36, 0x5e7040, 0x76884c), 2.6 - dd * 0.03 - (x > 170 ? 0.8 : 0) + (noise(x * 0.2, y * 0.3, 5) - 0.5) * 0.8, x, y))
    // The temple: steps, columns, a gilded dome.
    const marble = ramp(0x8a7e74, 0xaea294, 0xcec2b0, 0xe8dcc8, 0xfaf2e2)
    p.box(146, 50, 196, 54, (x, y) => tone(marble, 3.2 - (y - 50) * 0.3 - (x > 186 ? 1 : 0), x, y))
    p.box(150, 46, 192, 50, (x, y) => tone(marble, 3.6 - (y - 46) * 0.3 - (x > 184 ? 1 : 0), x, y))
    for (let i = 0; i < 7; i++) {
      const cx = 153 + i * 6
      p.box(cx, 30, cx + 3, 46, (x, y) => tone(marble, x === cx ? 4 : x === cx + 2 ? 2 : 3, x, y))
    }
    p.box(150, 26, 192, 30, (x, y) => tone(marble, 3.6 - (y - 26) * 0.3, x, y))
    p.poly([148, 26, 171, 16, 194, 26], (x, y) => tone(marble, x < 171 ? 3.6 : 2.4, x, y))
    ball(p, 171, 14, 9, 8, GOLD, { seed: 3 })
    p.line(171, 6, 171, 2, GOLD[3])
    p.set(171, 1, C(0xffffff))
    // The winding road up to it.
    for (let y = 56; y < H; y++) {
      const u = (y - 56) / (H - 56)
      const cx = pilgrimRoad(y)
      const half = 1 + u * 10
      for (let x = Math.floor(cx - half); x <= cx + half; x++) p.set(x, y, tone(ramp(0x7a6248, 0x947a5a, 0xae946e, 0xc8ae86), 2.4 - (Math.abs(x - cx) > half - 1.2 ? 1 : 0) + (noise(x * 0.4, y * 0.4, 9) - 0.5), x, y))
    }
    for (let i = 0; i < 8; i++) p.sprite(SPRITES.poplar[i % 3], [30, 46, 224, 240, 70, 210, 100, 250][i], [96, 100, 90, 96, 84, 76, 76, 110][i], { scale: 0.7 + (i % 3) * 0.1 })
  },
  fx(p, t) {
    glint(p, 168, 10, 2 + Math.round(Math.sin(t * 2) + 1), C(0xffffff))
    const fr = Math.floor(t * 2.5)
    const walkers: [number, number, Who['robe'], Hat, number][] = [
      [136, 82, ROBE.white, 'hood', 0],
      [120, 92, ROBE.brown, 'hood', 1],
      [110, 104, ROBE.white, 'veil', 0],
      [104, 116, ROBE.grey, 'hood', 1],
      [104, 128, ROBE.ochre, 'hood', 0],
    ]
    walkers.forEach(([, y, robe, hat, off], i) => {
      person(p, pilgrimRoad(y) - 1, y, { robe, hat, hatColor: robe[2], pose: 'staff', frame: fr + off, skin: i % 3 })
    })
    // A banner carried at the head of the line.
    const wv = Math.round(Math.sin(t * 3))
    const bx = pilgrimRoad(82) + 4
    p.line(bx, 82, bx, 58, WOOD[2])
    p.poly([bx + 1, 58, bx + 11, 59 + wv, bx + 11, 66 + wv, bx + 1, 66], C(0xf0ece0))
    p.rect(bx + 5, 60 + wv, 2, 5, GOLD[2])
  },
}

// Anything else: a quiet valley with a herald on the road.
const fallback: Scene = {
  draw(p) {
    sky(p, ramp(0x4a7cb8, 0x6896c4, 0x8eb0cc, 0xbccad0, 0xe4dcc4), 0, 66)
    cloud(p, 70, 18, 60, 12, ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff), 14)
    land(p, (x) => 58 - noise(x * 0.02, 0, 3) * 10, (x, y, dd) => tone(ramp(0x4a7458, 0x5a8460, 0x6a9668), 2 - dd * 0.1, x, y), 70)
    land(p, fields(64), (x, y, dd) => tone(GRASS, 3.6 - dd * 0.012 + (noise(x * 0.2, y * 0.4, 3) - 0.5) * 1.1, x, y))
    p.veil(C(0xa8c4c8), 0.25, () => {
      house(p, 150, 78, { w: 16, d: 24, h: 11, chimney: true })
      house(p, 196, 82, { w: 18, d: 28, h: 12, roof: THATCH })
    })
    p.poly([60, H, 120, H, 108, 64, 104, 64], (x, y) => tone(DIRT, 3 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
    roundTree(p, 30, 104, 12, LEAF[0], 5)
  },
  fx(p, t) {
    person(p, 96, 112, { robe: ROBE.red, hat: 'cap', hatColor: C(0xf0c040), pose: 'hold', frame: Math.floor(t * 2) })
    p.rect(98, 103, 4, 3, PLASTER[4])
    birds(p, t, 3, 0, 20, C(0x3a3040), 5)
  },
}

const SCENES: Record<string, Scene> = {
  drought,
  rain: rainScene,
  storm,
  fog,
  flood,
  bountifulSeason: bountiful,
  caravanSeason: caravan,
  comet,
  fullMoon,
  epidemic,
  goldRush,
  plague,
  festival,
  forestFire,
  oreVein,
  merchants,
  granaryFire,
  treasure,
  coldSnap,
  pilgrims,
}

// The still layers, painted once per kind.
const stills = new Map<string, Uint32Array>()
function still(kind: string, scene: Scene) {
  let px = stills.get(kind)
  if (!px) {
    px = new Uint32Array(W * H).fill(C(0x000000))
    scene.draw(new Paint(px))
    stills.set(kind, px)
  }
  return px
}

// The picture for a day's event: 256 × 128 art pixels, scaled up crisply to the width it is given (2 : 1).
export function EventArt({ kind }: { kind: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const scene = SCENES[kind] ?? fallback
    const base = still(kind in SCENES ? kind : '', scene)
    const image = ctx.createImageData(W, H)
    const out = new Uint32Array(image.data.buffer)
    const p = new Paint(out)
    const draw = (t: number) => {
      out.set(base)
      scene.fx?.(p, t)
      ctx.putImageData(image, 0, 0)
    }
    draw(0)
    if (!scene.fx || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // About ten frames a second: enough for flames and rain, and in keeping with pixel art.
    let raf = 0
    let last = -1
    const start = performance.now()
    const loop = (now: number) => {
      const frame = Math.floor((now - start) / 100)
      if (frame !== last) {
        last = frame
        draw(frame / 10)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind])
  return <canvas ref={ref} width={W} height={H} aria-hidden style={{ display: 'block', width: '100%', aspectRatio: '2 / 1', imageRendering: 'pixelated' }} />
}
