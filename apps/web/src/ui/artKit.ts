import { BAYER, rgb, ramp, type Sprite } from '../game/sprites'

// The painter's kit for the hi-bit scenes drawn in code (the day's events in EventArt.tsx, the envoy's news in
// NoticeArt.tsx, the envoy's portrait): a pixel canvas with dithered tones, palettes, scenery, people and beasts.
// Colours come in short ramps, tones meet in ordered dither, never blur.


export const W = 256
export const H = 128

// ---- Tools -----------------------------------------------------------------------------------------------------------

export const bay = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)]
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

// A small integer hash in [0, 1): the pictures are the same every time.
export function rnd(x: number, y = 0, s = 0) {
  let n = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1)) >>> 0
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}
export const ease = (t: number) => t * t * (3 - 2 * t)
export function noise(x: number, y = 0, s = 0) {
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
export function fbm(x: number, y: number, s: number, octaves = 3) {
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
export function mix(a: number, b: number, t: number) {
  const ar = a & 255
  const ag = (a >>> 8) & 255
  const ab = (a >>> 16) & 255
  const r = Math.round(ar + ((b & 255) - ar) * t)
  const g = Math.round(ag + (((b >>> 8) & 255) - ag) * t)
  const bl = Math.round(ab + (((b >>> 16) & 255) - ab) * t)
  return (0xff000000 | (bl << 16) | (g << 8) | r) >>> 0
}

// A tone of a ramp (0 … length-1), dithered in a narrow band where two tones meet.
export function tone(r: ArrayLike<number>, t: number, x: number, y: number) {
  const n = r.length - 1
  const v = clamp(t, 0, n)
  const i = Math.floor(v)
  const f = clamp((v - i - 0.5) * 2 + 0.5)
  return r[Math.min(n, f > bay(x, y) ? i + 1 : i)]
}

type Shade = number | ((x: number, y: number) => number | undefined)

export class Paint {
  px: Uint32Array
  // While set, everything drawn is veiled towards a colour (night, fog, distance).
  veilColor = 0
  veilK = 0
  w: number
  h: number
  constructor(px: Uint32Array, w = W, h = H) {
    this.px = px
    this.w = w
    this.h = h
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = this.veilK > 0 ? mix(c, this.veilColor, this.veilK) : c
  }
  get(x: number, y: number) {
    x = Math.round(x)
    y = Math.round(y)
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]
  }
  // Blends towards a colour by t, in quarter steps picked by the dither matrix (light, fog, shadow).
  tint(x: number, y: number, c: number, t: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (t <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const q = Math.min(1, Math.floor(t * 4 + bay(x, y)) / 4)
    if (q <= 0) return
    const i = y * this.w + x
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
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
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
    for (let y = Math.max(0, Math.floor(top)); y <= Math.min(this.h - 1, Math.ceil(bottom)); y++) {
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
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5)); x++) {
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

export const C = rgb
export const INK = C(0x14101a)
export const SKINS = [ramp(0x8a5236, 0xc58a62, 0xecba90), ramp(0x6a3c26, 0xa06a46, 0xcc9466), ramp(0x47291b, 0x75482e, 0x9e6c48)]
export const HAIR = [C(0x2a1c14), C(0x5a3a1e), C(0x8a6a3a), C(0x1a1a1e), C(0xa8a090)]
export const ROBE = {
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
export const WOOD = ramp(0x2a1a12, 0x4a3020, 0x6e4a2e, 0x936a40, 0xb48a58)
export const STONE = ramp(0x2a2834, 0x44424e, 0x63606a, 0x85818a, 0xa8a4a6, 0xcac6c0)
export const PLASTER = ramp(0x6e5e4a, 0x9a8670, 0xc2ae90, 0xdcccac, 0xeee2c6)
export const TILE = ramp(0x3e1a1a, 0x62262a, 0x8a3630, 0xae4a38, 0xcc6a48)
export const THATCH = ramp(0x4a3418, 0x6e5024, 0x967030, 0xbc9440, 0xdcb85c)
export const SLATE = ramp(0x1e2230, 0x2e3446, 0x434a5e, 0x5c6478, 0x7a8294)
export const GOLD = ramp(0x5a3a0e, 0x8e6216, 0xc8952e, 0xf2d16b, 0xfff4c0)
export const GRASS = ramp(0x1c3a28, 0x2a5232, 0x3d6e3a, 0x548c44, 0x74a852, 0x9cc464)
export const SAND = ramp(0x8a6236, 0xa87c46, 0xc49a5a, 0xdcb874, 0xeed294, 0xf8e8b8)
export const DIRT = ramp(0x2e1e14, 0x4a3220, 0x6a4a2e, 0x8a6640, 0xa8845a)
export const FIRE = ramp(0x6a160c, 0xb0300e, 0xe8661a, 0xfaa630, 0xffe070, 0xfffbe0)
export const SNOW = ramp(0x5a6a8a, 0x7e90ae, 0xa6b6cc, 0xccd8e6, 0xeef4fa, 0xffffff)

// ---- Scenery ---------------------------------------------------------------------------------------------------------

// A dithered vertical gradient through the stops, between rows y0 and y1; `bend` shifts the gradient per pixel.
export function sky(p: Paint, stops: ArrayLike<number>, y0 = 0, y1 = H, bend?: (x: number, y: number) => number) {
  const n = stops.length - 1
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    for (let x = 0; x < W; x++) {
      const t = (y - y0) / (y1 - y0) + (bend ? bend(x, y) : 0)
      p.px[y * W + x] = tone(stops, t * n, x, y)
    }
  }
}

// A soft round glow, stepped in dithered rings.
export function glow(p: Paint, cx: number, cy: number, r: number, c: number, max: number, squash = 1) {
  for (let y = Math.floor(cy - r * squash); y <= cy + r * squash; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash) / r
      if (d < 1) p.tint(x, y, c, max * (1 - d) * (1 - d))
    }
  }
}

// Land under a ridge line: shaded by depth below the ridge.
export function land(p: Paint, ridge: (x: number) => number, shade: (x: number, y: number, depth: number) => number | undefined, bottom = H) {
  for (let x = 0; x < W; x++) {
    const top = Math.round(ridge(x))
    for (let y = Math.max(0, top); y < bottom; y++) {
      const c = shade(x, y, y - top)
      if (c !== undefined) p.set(x, y, c)
    }
  }
}

// A lit ball (canopy, cloud, sack, moon): light from the upper left; `rough` frays its edge and grains it.
export function ball(p: Paint, cx: number, cy: number, rx: number, ry: number, r: ArrayLike<number>, o: { rough?: number; seed?: number; bias?: number; flat?: number } = {}) {
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
export function cluster(p: Paint, cx: number, cy: number, w: number, h: number, r: ArrayLike<number>, seed: number, n = 7, o: { rough?: number; bias?: number } = {}) {
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

export function cloud(p: Paint, cx: number, cy: number, w: number, h: number, r: ArrayLike<number>, seed: number) {
  cluster(p, cx, cy, w, h, r, seed, Math.max(5, Math.round(w / 6)), { rough: 0.15 })
}

// Shadow on the ground: an ellipse darkened by k.
export function shadow(p: Paint, cx: number, cy: number, rx: number, ry = 2, k = 0.45, c = C(0x101018)) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
      if (d < 1) p.tint(x, y, c, k * (d < 0.5 ? 1 : 0.6))
    }
  }
}

// A round broadleaf tree: trunk and a heap of lit puffs.
export function roundTree(p: Paint, x: number, y: number, r: number, leaves: ArrayLike<number>, seed: number) {
  shadow(p, x + r * 0.4, y, r * 0.9, 2)
  p.rect(x - 1, y - r - 2, 2, r + 2, (_, yy) => tone(WOOD, 1 + (yy % 3 === 0 ? 0 : 0.6), x, yy))
  p.set(x - 1, y - 1, WOOD[2])
  cluster(p, x, y - r * 1.5, r * 2.2, r * 1.8, leaves, seed, 8)
}

// A fir: tiers of drooping boughs, lit on the left, maybe snow on them.
export function conifer(p: Paint, x: number, y: number, h: number, leaves: ArrayLike<number>, o: { snow?: boolean; seed?: number; char?: boolean } = {}) {
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

export interface HouseLook {
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
export function house(p: Paint, x: number, y: number, o: HouseLook): [number, number] | null {
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

export type Pose =
  | 'stand' | 'walk' | 'up' | 'point' | 'pray' | 'brow' | 'carry' | 'pick' | 'dig' | 'staff' | 'wave' | 'lute' | 'drum'
  | 'pipe' | 'hold' | 'lead' | 'shiver' | 'dance' | 'spear' | 'scythe' | 'cane' | 'bowl' | 'pan'
export type Hat = 'none' | 'hood' | 'straw' | 'cap' | 'beak' | 'turban' | 'scarf' | 'helm' | 'veil'

export interface Who {
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
export function person(p: Paint, x: number, y: number, w: Who) {
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
export function cot(p: Paint, x: number, y: number, blanket: ArrayLike<number>, skin = 0) {
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
export function camel(p: Paint, x: number, y: number, fr: number, packs: ArrayLike<number>[], flip = false) {
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
export function horse(p: Paint, x: number, y: number, fr: number, coat: ArrayLike<number>, flip = false) {
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
export function wheel(p: Paint, cx: number, cy: number, r: number, turn = 0) {
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
export function wagon(p: Paint, x: number, y: number, stripes: [number, number], goods = true) {
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
export function campfire(p: Paint, x: number, y: number, t: number, size = 1) {
  p.line(x - 4 * size, y - 1, x + 4 * size, y - 2, WOOD[1])
  p.line(x - 4 * size, y - 2, x + 4 * size, y - 1, WOOD[2])
  flames(p, x - 3 * size, x + 3 * size, y - 1, 9 * size, t, 5)
}

// Flames between x0 and x1 rising from row `base`, up to hmax tall; their tongues move with t.
export function flames(p: Paint, x0: number, x1: number, base: number, hmax: number, t: number, seed: number) {
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
export function smoke(p: Paint, x: number, y: number, t: number, o: { n?: number; rise?: number; drift?: number; size?: number; c?: ArrayLike<number>; seed?: number; k?: number } = {}) {
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
export function rain(p: Paint, t: number, n: number, c: number, slant = 0.35, len = 5, speed = 140, seed = 1, k = 0.7) {
  for (let i = 0; i < n; i++) {
    const sx = rnd(i, 0, seed) * (W + 60)
    const sy = rnd(i, 1, seed) * H
    const y = (sy + t * speed * (0.8 + rnd(i, 2, seed) * 0.4)) % (H + len)
    const x = (sx - y * slant + W) % (W + 60) - 30
    for (let j = 0; j < len; j++) p.tint(x - j * slant, y - j, c, k * (1 - j / len))
  }
}

export function snowfall(p: Paint, t: number, n: number, seed = 3) {
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

export function stars(p: Paint, n: number, yMax: number, t: number, seed = 5) {
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
export function glint(p: Paint, x: number, y: number, s: number, c = C(0xffffff)) {
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
export function birds(p: Paint, t: number, n: number, x0: number, y0: number, c: number, seed = 1) {
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
export function sack(p: Paint, x: number, y: number, seed: number) {
  ball(p, x, y - 4, 4, 4, ramp(0x4f3b26, 0x6f5638, 0x917650, 0xb09669, 0xcab48a), { seed, rough: 0.1 })
  p.set(x - 1, y - 8, C(0x4f3b26))
  p.set(x, y - 9, C(0x917650))
  p.set(x + 1, y - 8, C(0x4f3b26))
}

// A woven basket heaped with fruit.
export function basket(p: Paint, x: number, y: number, fruit: ArrayLike<number>, seed: number) {
  shadow(p, x + 2, y, 7, 1.5)
  for (let i = 0; i < 6; i++) ball(p, x - 4 + (i % 3) * 4 + (i > 2 ? 2 : 0), y - 7 - (i > 2 ? 2 : 0), 2.2, 2.2, fruit, { seed: seed + i })
  p.box(x - 6, y - 6, x + 7, y, (px, py) => tone(THATCH, 3.2 - (px - x + 6) * 0.15 - ((px + py) % 2 === 0 ? 0.8 : 0), px, py))
  p.line(x - 6, y - 6, x + 6, y - 6, THATCH[1])
}


export interface Scene {
  draw: (p: Paint) => void
  // Drawn over the still layer each frame; t in seconds.
  fx?: (p: Paint, t: number) => void
}

export const fields = (h: number) => (x: number) => h + Math.sin(x * 0.03) * 2 + Math.sin(x * 0.09 + 1) * 1

// A quaver drifting up from a song.
export function note(p: Paint, x: number, y: number, c: number, k = 1) {
  p.tint(x, y, c, k)
  p.tint(x + 1, y, c, k)
  p.tint(x, y + 1, c, k)
  p.tint(x + 1, y + 1, c, k)
  for (let i = 1; i <= 4; i++) p.tint(x + 1, y - i, c, k)
  p.tint(x + 2, y - 4, c, k)
  p.tint(x + 3, y - 3, c, k)
}
