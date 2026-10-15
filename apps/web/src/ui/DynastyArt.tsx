import { useEffect, useRef } from 'react'
import { BAYER, rgb, ramp } from '../game/sprites'

// Court pictures for the dynasty: a painted bust per royal (Portrait) and a small hi-bit scene per dynastic event
// (DynastyArt: birth, funeral, coronation, regency council, coming of age, wedding). Everything is drawn in code pixel
// by pixel from a seed, so the same royal always looks the same. Colours come in short ramps, tones meet in ordered
// dither, never blur (see EventArt.tsx, whose tools are copied here in small).

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
  w: number
  h: number
  constructor(px: Uint32Array, w: number, h: number) {
    this.px = px
    this.w = w
    this.h = h
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = c
  }
  get(x: number, y: number) {
    x = Math.round(x)
    y = Math.round(y)
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]
  }
  // Blends towards a colour by t, in quarter steps picked by the dither matrix (light, shadow, haze).
  tint(x: number, y: number, c: number, t: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (t <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const q = Math.min(1, Math.floor(t * 4 + bay(x, y)) / 4)
    if (q <= 0) return
    const i = y * this.w + x
    this.px[i] = q >= 1 ? c : mix(this.px[i], c, q)
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

// Shadow on the floor: an ellipse darkened by k.
function shadow(p: Paint, cx: number, cy: number, rx: number, ry = 2, k = 0.45, c = C(0x0c0a10)) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
      if (d < 1) p.tint(x, y, c, k * (d < 0.5 ? 1 : 0.6))
    }
  }
}

// ---- Palettes --------------------------------------------------------------------------------------------------------

const C = rgb
const INK = C(0x120e14)
// Five-tone skin ramps: deep shadow, shadow, mid, light, highlight.
const SKIN = [
  ramp(0x7a4a3c, 0xb27a62, 0xd8a284, 0xf0c4a2, 0xfadcc0),
  ramp(0x6e4030, 0xa66c50, 0xcc9070, 0xe6b48e, 0xf4ceaa),
  ramp(0x5a3626, 0x8e5c3c, 0xb47e56, 0xd0a074, 0xe4bc90),
  ramp(0x4a2a1c, 0x7a4a30, 0x9e6a46, 0xbe8a5e, 0xd8a87a),
  ramp(0x2e1a12, 0x52301e, 0x74482c, 0x94643e, 0xb08054),
]
const HAIRS = [
  ramp(0x0c0a0e, 0x1c181e, 0x2e2830, 0x4a4250),
  ramp(0x1e120c, 0x34200f, 0x4e3218, 0x6e4a28),
  ramp(0x2e160c, 0x4e2614, 0x763c1e, 0x9e5c30),
  ramp(0x3a120a, 0x6a2410, 0x983a18, 0xc45c2a),
  ramp(0x6a4e1e, 0x9a7a34, 0xc8a44e, 0xeccf7c),
  ramp(0x7e6e46, 0xb0a06a, 0xd6c48e, 0xf2e4b8),
]
const GREY = ramp(0x4a484c, 0x6e6c70, 0x949296, 0xbab8ba)
const WHITE_HAIR = ramp(0x7a7a82, 0xa6a6ac, 0xcacace, 0xf0f0f2)
const EYES = [0x4a2c18, 0x2e1c12, 0x6a5424, 0x3e6a3a, 0x3a64a4, 0x5a6a7a].map(C)
const ROYAL = [
  ramp(0x3a0e14, 0x6a1a22, 0x9a2a2e, 0xc44a40),
  ramp(0x141c40, 0x22346e, 0x34509e, 0x5274c4),
  ramp(0x24123a, 0x40205e, 0x5e3484, 0x8452aa),
  ramp(0x0e2a1c, 0x1a4a2c, 0x2a6a3a, 0x46904e),
  ramp(0x4a1424, 0x7a2a40, 0xa8445a, 0xd06a7c),
  ramp(0x0e2a2e, 0x1a4a50, 0x2a6c70, 0x46948e),
]
const DARK = [
  ramp(0x0c0c10, 0x18181e, 0x262630, 0x3c3c48),
  ramp(0x0c1a14, 0x16281e, 0x223a2a, 0x325038),
  ramp(0x1a100c, 0x2a1c14, 0x3e2a1c, 0x56402a),
  ramp(0x0c1020, 0x161c34, 0x222c4a, 0x34405e),
]
const BACKS = [
  ramp(0x1e0a10, 0x341418, 0x4e1e22, 0x6a2c2c, 0x84403a),
  ramp(0x0a1610, 0x12241a, 0x1c3626, 0x284a32, 0x386040),
  ramp(0x0a0e1c, 0x121a30, 0x1c2846, 0x2a3a5e, 0x3c5076),
  ramp(0x161008, 0x261c10, 0x3a2c1a, 0x524028, 0x6c5838),
  ramp(0x140a1c, 0x22122e, 0x341e44, 0x482c5a, 0x5e3e70),
  ramp(0x081618, 0x0e2428, 0x16363a, 0x22484c, 0x325e60),
]
const GOLD = ramp(0x3a2408, 0x6a4610, 0x9e7020, 0xd0a03a, 0xf2d878, 0xfff4c8)
const ERMINE = ramp(0x8e8a84, 0xbcb8b0, 0xe2ded6, 0xfaf8f2)
const LINEN = ramp(0x8e8a7e, 0xbcb8aa, 0xdedacc, 0xf6f2e6)
const FUR = ramp(0x2a1a10, 0x46301e, 0x664a2e, 0x8a6a44)
const WOOD = ramp(0x1e120c, 0x341f14, 0x4e301e, 0x6e4a2e, 0x936a40, 0xb48a58)
const STONE = ramp(0x16141c, 0x24222c, 0x36343e, 0x4a4852, 0x625e66, 0x7e7a7e)
const WARM_STONE = ramp(0x241a16, 0x382a22, 0x4e3c30, 0x665040, 0x806650, 0x9c8064)
const FIRE = ramp(0x6a160c, 0xb0300e, 0xe8661a, 0xfaa630, 0xffe070, 0xfffbe0)
const WAX = ramp(0x8a7a5a, 0xc8b88e, 0xeee2bc, 0xfff8e4)
const RUBY = C(0xc81c34)
const SAPPHIRE = C(0x2a5ad0)
const EMERALD = C(0x1e9a5a)
const PEARL = C(0xf6f2ea)

const pickOf = <T,>(arr: readonly T[], seed: number, salt: number) => arr[Math.floor(rnd(seed, salt, 0x51) * arr.length)]

// ---- Portrait ---------------------------------------------------------------------------------------------------------

const PW = 48
const PH = 60

type Sex = 'm' | 'f'
type Role = 'king' | 'queen' | 'prince' | 'princess' | 'regent'
type Band = 'baby' | 'child' | 'teen' | 'adult' | 'mature' | 'old'

const bandOf = (age: number): Band => (age <= 3 ? 'baby' : age <= 12 ? 'child' : age <= 17 ? 'teen' : age < 50 ? 'adult' : age < 65 ? 'mature' : 'old')

// Where the head and shoulders sit: face top (fy), height (fh), half-width (hw), how much the jaw narrows,
// eye row, mouth row, chin row, shoulder row (sy), shoulder half-width (sh) and neck half-width.
interface Geo { c: number; fy: number; fh: number; hw: number; jaw: number; ey: number; my: number; chin: number; sy: number; sh: number; neck: number }

function geoOf(b: Band, sex: Sex): Geo {
  const f = sex === 'f'
  switch (b) {
    case 'baby':
      return { c: 24, fy: 22, fh: 14, hw: 7.8, jaw: 0.3, ey: 29, my: 33, chin: 35, sy: 38, sh: 18, neck: 3 }
    case 'child':
      return { c: 24, fy: 18, fh: 16, hw: 7.6, jaw: 0.4, ey: 27, my: 31, chin: 33, sy: 37, sh: 13, neck: 2.6 }
    case 'teen':
      return { c: 24, fy: 15, fh: 18, hw: 7.6, jaw: f ? 0.58 : 0.5, ey: 24, my: 29, chin: 32, sy: 36, sh: f ? 14 : 16, neck: f ? 2.6 : 3 }
    default:
      return { c: 24, fy: 14, fh: f ? 18 : 19, hw: f ? 7.6 : 8, jaw: f ? 0.6 : 0.5, ey: 23, my: f ? 28 : 29, chin: f ? 31 : 32, sy: f ? 35 : 36, sh: f ? 16 : 19, neck: f ? 2.6 : 3.4 }
  }
}

// Half-width of the face at a fraction v (0 top … 1 chin) of its height.
function faceHalf(g: Geo, v: number) {
  if (v < 0 || v > 1) return -1
  if (v < 0.42) return g.hw * Math.sqrt(Math.max(0, 1 - ((0.42 - v) / 0.5) ** 2))
  if (v < 0.6) return g.hw
  return g.hw * (1 - g.jaw * ((v - 0.6) / 0.4) ** 1.6)
}
const inFace = (g: Geo, x: number, y: number) => Math.abs(x + 0.5 - g.c) <= faceHalf(g, (y + 0.5 - g.fy) / g.fh)

type HairStyle = 'crop' | 'bob' | 'long' | 'curly' | 'braids' | 'updo' | 'bald'

// Hair as a mask: `front` frames the face (crown, fringe, side locks over the shoulders), `back` is what shows behind
// the neck and shoulders of long hair.
function hairMask(g: Geo, style: HairStyle, len: number) {
  const { c, fy, hw, ey, chin, sy } = g
  const domeCy = fy + g.fh * 0.42
  const domeRx = hw + (style === 'curly' ? 2.2 : 1.4)
  const domeRy = g.fh * 0.42 + (style === 'updo' ? 2.6 : 2.2)
  const longish = style === 'long' || style === 'braids'
  const hairline = (dx: number) => {
    const ax = Math.abs(dx)
    switch (style) {
      case 'bob':
        return ey - 4 + (ax > hw - 2.5 ? 2 : 0)
      case 'long':
      case 'braids':
      case 'updo':
        return fy + 3 + ax * 0.25 + (ax > hw - 2.2 ? 3 : 0)
      case 'bald':
        return ax > hw - 1.5 ? ey - 1 : fy - 9
      default:
        return fy + 3.5 + ax * 0.12 + (ax > hw - 2 ? 2.5 : 0)
    }
  }
  // How far down the side locks go, and their inner and outer edges at a row.
  const sideBottom = style === 'bob' ? chin - 2 : style === 'long' ? sy + len : style === 'braids' ? chin : style === 'bald' || style === 'crop' || style === 'curly' ? ey - 1 : ey - 2
  const inner = (y: number) => {
    if (y <= chin - 1) return hw - (longish || style === 'bob' ? 1.3 : 0.6)
    return hw - 1.3 - clamp((y - chin + 1) * 0.55, 0, 3.2)
  }
  const outer = (y: number) => {
    const base = hw + (style === 'bob' ? 1.8 : 1.4)
    // A bob curls in at its ends.
    if (style === 'bob') return base - clamp((y - (chin - 6)) * 0.45, 0, 1.8)
    if (!longish) return base
    const fall = clamp((y - chin + 2) * 0.45, 0, 3.5)
    const tip = style === 'long' ? clamp((y - (sy + len - 4)) * 0.8, 0, 4) : 0
    return base + fall - tip
  }
  const front = (x: number, y: number) => {
    const dx = x + 0.5 - c
    const ax = Math.abs(dx)
    const dome = (dx / domeRx) ** 2 + ((y + 0.5 - domeCy) / domeRy) ** 2 <= 1 && y + 0.5 < domeCy + 1
    if (dome && y + 0.5 < hairline(dx)) return true
    if (y >= fy && y <= sideBottom && ax >= inner(y) && ax <= outer(y)) return true
    // The bun of an updo, high at the back.
    if (style === 'updo' && Math.hypot(dx + 2.5, y + 0.5 - (fy - 2.5)) < 4.2) return true
    return false
  }
  const back = (x: number, y: number) => {
    if (style !== 'long') return false
    const ax = Math.abs(x + 0.5 - c)
    return y >= ey && y <= sy + len - 2 && ax <= outer(y) - 0.5
  }
  return { front, back, domeCy }
}

function portrait(seed: number, sex: Sex, b: Band, role: Role, dead: boolean) {
  const px = new Uint32Array(PW * PH)
  const p = new Paint(px, PW, PH)
  const g = geoOf(b, sex)
  const { c } = g
  const r = (salt: number) => rnd(seed, salt, 0x7a)
  const S = SKIN[Math.floor(r(1) ** 1.6 * SKIN.length)]
  const eye = pickOf(EYES, seed, 2)
  let hairR: ArrayLike<number> = pickOf(HAIRS, seed, 3)
  if (b === 'mature') hairR = Array.from(hairR, (h, i) => mix(h, GREY[i], 0.5))
  if (b === 'old') hairR = WHITE_HAIR
  const back = pickOf(BACKS, seed, 4)
  const ri = Math.floor(r(5) * ROYAL.length)
  const robe = role === 'regent' ? pickOf(DARK, seed, 5) : ROYAL[ri]
  const second = ROYAL[(ri + 1 + Math.floor(r(6) * (ROYAL.length - 1))) % ROYAL.length]
  const male = sex === 'm'
  const young = b === 'baby' || b === 'child'

  // Background: a painted ground, lighter behind the head, with a faint damask lattice.
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const d = Math.hypot(x - c + 5, (y - g.fy - 4) * 0.8) / 30
      let l = 3.2 - d * 2.6 + (noise(x * 0.2, y * 0.2, seed) - 0.5) * 0.5
      const lattice = (x + y + 2) % 8 === 0 || (x - y + 66) % 8 === 0
      if (lattice) l += 0.35
      if ((x + y + 2) % 8 === 4 && (x - y + 66) % 8 === 4) l += 0.6
      px[y * PW + x] = tone(back, l, x, y)
    }
  }

  // Hair style and beard.
  let style: HairStyle
  if (male) style = b === 'old' && r(7) < 0.45 ? 'bald' : young ? pickOf(['crop', 'bob', 'curly'] as const, seed, 8) : pickOf(['crop', 'bob', 'curly', 'bob', 'long'] as const, seed, 8)
  else style = b === 'child' ? pickOf(['long', 'braids', 'long'] as const, seed, 8) : pickOf(['long', 'braids', 'updo', 'long'] as const, seed, 8)
  const hairLen = 6 + Math.floor(r(9) * 8)
  const beardKind = !male || young || b === 'teen' || role === 'regent' && r(10) < 0.3 ? 0 : Math.floor(r(10) * 4) + (b === 'old' ? 1 : 0)
  const mask = b === 'baby' ? null : hairMask(g, style, hairLen)
  const wimple = role === 'regent' && !male
  const hairShade = (x: number, y: number, deep: number) => {
    const dx = x + 0.5 - c
    let l = 2.0 - (dx / (g.hw + 4)) * 1.2 + (noise(x * 0.9, y * 0.16, seed + 5) - 0.5) * 1.4 - deep
    if (style === 'curly') l += (noise(x * 0.7, y * 0.7, seed + 9) - 0.5) * 1.6
    // A sheen across the crown, on the lit side.
    const sheen = Math.abs(Math.hypot(dx + 2, (y + 0.5 - g.fy) * 1.3) - g.hw * 0.75)
    if (y < g.ey && dx < 1 && sheen < 1.2) l += 0.9
    return tone(hairR, l, x, y)
  }

  // Long hair behind the neck and shoulders.
  if (mask && !wimple) for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (mask.back(x, y)) p.set(x, y, hairShade(x, y, 1))

  // Ears, then the neck.
  if (b !== 'baby') {
    for (const side of [-1, 1]) {
      const ex = side < 0 ? c - 9 : c + 8
      for (let y = g.ey; y <= g.ey + 3; y++) p.set(ex, y, S[side < 0 ? (y === g.ey + 1 ? 1 : 2) : y === g.ey + 1 ? 0 : 1])
    }
    for (let y = g.chin - 3; y <= g.sy + 3; y++) {
      for (let x = Math.floor(c - g.neck - 1); x <= c + g.neck; x++) {
        const dx = x + 0.5 - c
        if (Math.abs(dx) > g.neck) continue
        let l = 2.4 - (dx / g.neck) * 0.9
        if (y <= g.chin + 2) l -= 1.2
        p.set(x, y, tone(S, l, x, y))
      }
    }
  }

  // The bust: shoulders widening below the neck; role decides the dress over it.
  const bodyHalf = (y: number) => (y < g.sy - 1 ? -1 : g.neck + 0.5 + (g.sh - g.neck) * Math.sqrt(clamp((y - g.sy + 2) / 9)))
  const inBody = (x: number, y: number) => Math.abs(x + 0.5 - c) <= bodyHalf(y)
  const cloth = (R: ArrayLike<number>, x: number, y: number, bias = 0) => {
    const dx = x + 0.5 - c
    const nx = dx / Math.max(1, bodyHalf(y))
    let l = 2.0 - nx * 1.1 + bias
    if (y > g.sy + 6) l += Math.sin(dx * 0.9 + y * 0.05 + seed) * 0.3
    if (Math.abs(nx) > 0.9) l -= 0.7
    return tone(R, l, x, y)
  }

  if (b === 'baby') {
    babyBust(p, g, S, seed, sex, role, robe)
  } else {
    for (let y = g.sy - 1; y < PH; y++) for (let x = 0; x < PW; x++) if (inBody(x, y)) p.set(x, y, cloth(robe, x, y))
    if (role === 'king') kingDress(p, g, inBody, cloth, robe)
    else if (role === 'queen') queenDress(p, g, S, inBody, cloth, second, true)
    else if (role === 'princess') queenDress(p, g, S, inBody, cloth, second, false)
    else if (role === 'prince') princeDress(p, g, inBody, cloth, second)
    else regentDress(p, g, inBody, seed)
  }

  // The face, lit from the upper left.
  for (let y = g.fy; y <= g.chin; y++) {
    for (let x = c - 9; x <= c + 9; x++) {
      const v = (y + 0.5 - g.fy) / g.fh
      const half = faceHalf(g, v)
      const dx = x + 0.5 - c
      if (Math.abs(dx) > half) continue
      const nx = dx / g.hw
      let l = 3.0 - nx * 0.9 - Math.max(0, Math.abs(nx) - 0.6) * 1.6
      if (nx > 0) l -= nx * 0.5
      if (Math.abs(y - g.ey) <= 1 && Math.abs(Math.abs(dx) - 3.5) < 2.5) l -= 0.35
      if (Math.hypot(dx + 4.5, y - g.ey - 3) < 2.2) l += 0.45
      if (v > 0.88) l -= 0.5
      if (Math.abs(dx) > half - 1) l = Math.min(l, dx > 0 ? 0.8 : 1.6)
      p.set(x, y, tone(S, l, x, y))
    }
  }
  face(p, g, S, eye, hairR, sex, b, seed)

  // Beard over the jaw.
  if (beardKind > 0 && mask) beard(p, g, S, hairShade, beardKind, b)

  // Hair or headdress over the head.
  if (wimple) wimpleHood(p, g)
  else if (mask) {
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) if (mask.front(x, y)) p.set(x, y, hairShade(x, y, 0))
    if (style === 'long' || style === 'braids' || style === 'updo') for (let y = g.fy - 1; y < g.fy + 3; y++) p.set(c - 1, y, hairR[0])
    if (style === 'braids') braids(p, g, hairR)
    if (style === 'bald') {
      // The bare crown, shining.
      for (let y = g.fy - 3; y < g.fy + 2; y++) {
        for (let x = c - 7; x <= c + 7; x++) {
          const dx = x + 0.5 - c
          if ((dx / (g.hw + 0.6)) ** 2 + ((y + 0.5 - g.fy - 3) / 5.5) ** 2 > 1 || inFace(g, x, y)) continue
          p.set(x, y, tone(S, 2.6 - dx * 0.25 + (Math.hypot(dx + 2, y - g.fy + 1) < 1.6 ? 1.4 : 0), x, y))
        }
      }
    }
  }
  if (role === 'regent' && male) regentCap(p, g, robe)

  // Crowns and circlets.
  const crowned = role === 'king' || role === 'queen'
  if (b !== 'baby') {
    if (crowned) crown(p, g, role === 'king', seed)
    else if ((role === 'prince' || role === 'princess') && b !== 'child') circlet(p, g, role === 'princess')
    else if ((role === 'prince' || role === 'princess') && b === 'child') circlet(p, g, false)
  }

  if (dead) mourn(p)
  frame(p)
  return px
}

// Eyes, brows, nose, mouth, cheeks and the lines age brings.
function face(p: Paint, g: Geo, S: ArrayLike<number>, iris: number, hair: ArrayLike<number>, sex: Sex, b: Band, seed: number) {
  const { c, ey, my } = g
  const male = sex === 'm'
  const lash = mix(hair[0], C(0x1a0e0a), 0.5)
  const white = C(0xeae2d8)
  const whiteShade = C(0xc4b8ac)
  if (b === 'baby') {
    const asleep = rnd(seed, 30) < 0.45
    for (const [o, m, i] of [[c - 5, c - 4, c - 3], [c + 4, c + 3, c + 2]]) {
      if (asleep) {
        p.set(o, ey, mix(S[0], lash, 0.5))
        p.set(m, ey + 1, mix(S[0], lash, 0.5))
        p.set(i, ey, mix(S[0], lash, 0.5))
      } else {
        p.set(m, ey, mix(iris, INK, 0.3))
        p.set(i, ey, mix(iris, INK, 0.3))
        p.set(m, ey + 1, iris)
        p.set(i, ey + 1, mix(iris, INK, 0.5))
        p.set(o < c ? m : i, ey, white)
      }
    }
    p.set(c - 1, my - 2, S[1])
    p.set(c - 1, my, C(0xc0606a))
    p.set(c, my, C(0xa04a58))
    for (const cx of [c - 5, c + 4]) for (let dy = 2; dy <= 3; dy++) for (let dx = 0; dx <= 1; dx++) p.tint(cx + dx, ey + dy, C(0xe86a72), 0.5)
    return
  }
  const child = b === 'child'
  // Eyes: lash line above, white – iris – white below; children's irises run two rows.
  for (const [o, m, i, side] of [[c - 5, c - 4, c - 3, -1], [c + 4, c + 3, c + 2, 1]] as const) {
    p.set(o, ey - 1, lash)
    p.set(m, ey - 1, lash)
    p.set(i, ey - 1, S[1])
    if (!male) p.set(o + side, ey - 2, lash)
    p.set(o, ey, side < 0 ? white : whiteShade)
    p.set(m, ey, iris)
    p.set(i, ey, side < 0 ? whiteShade : mix(whiteShade, S[1], 0.4))
    if (child) p.set(m, ey + 1, mix(iris, INK, 0.35))
    p.set(o, ey + 1, S[side < 0 ? 2 : 1])
    // Brows: heavier and straight for men, arched and fine for women.
    const browC = mix(hair[1], S[1], male ? 0.15 : 0.4)
    if (male && !child) {
      p.set(o, g.ey - 3, browC)
      p.set(m, g.ey - 3, browC)
      p.set(i, g.ey - 3, browC)
      p.set(i - side, g.ey - 3, mix(browC, S[2], 0.5))
    } else {
      p.set(o, g.ey - 2, browC)
      p.set(m, g.ey - 3, browC)
      p.set(i, g.ey - 3, mix(browC, S[2], 0.4))
    }
  }
  // Nose: a shadowed right side, a lit tip, nostrils and the shade beneath.
  const tip = child ? ey + 3 : ey + 4
  for (let y = ey; y < tip; y++) p.set(c, y, tone(S, male ? 1.6 : 2.0, c, y))
  p.set(c - 1, tip, S[4])
  p.set(c, tip, S[2])
  p.set(c - 2, tip, S[1])
  p.set(c + 1, tip, S[1])
  if (!child) {
    p.set(c - 1, tip + 1, S[1])
    p.set(c, tip + 1, S[1])
  }
  // Mouth.
  if (male && !child) {
    for (let x = c - 2; x <= c + 1; x++) p.set(x, my, mix(S[0], C(0x5a1a1c), 0.5))
    p.set(c - 3, my, S[1])
    p.set(c + 2, my, S[1])
    p.set(c - 1, my + 1, mix(S[3], C(0xc06058), 0.35))
    p.set(c, my + 1, mix(S[2], C(0xa04848), 0.35))
  } else {
    const w = child ? 1 : 2
    for (let x = c - w; x <= c + w - 1; x++) p.set(x, my, x === c - 1 || x === c ? C(0x7a2230) : C(0xb04450))
    p.set(c - 1, my + 1, C(0xd06a6a))
    p.set(c, my + 1, C(0xb45458))
    if (!child) {
      p.set(c - 3, my, S[1])
      p.set(c + 2, my, S[1])
    }
  }
  // A blush on the cheeks.
  const blush = male ? (child ? 0.35 : 0.12) : child ? 0.45 : 0.32
  for (const cx of [c - 6, c + 3]) for (let dy = 2; dy <= 3; dy++) for (let dx = 0; dx <= 2; dx++) p.tint(cx + dx, ey + dy, C(0xd85a5a), blush)
  // Age: crow's feet and the lines from nose to mouth; the old also get a lined brow and heavy lids.
  if (b === 'mature' || b === 'old') {
    const k = b === 'old' ? 0.85 : 0.55
    const line = (x: number, y: number) => p.tint(x, y, S[1], k)
    for (const s of [-1, 1]) {
      const ox = s < 0 ? c - 6 : c + 5
      line(ox, ey)
      line(ox + s, ey + 1)
      line(s < 0 ? c - 3 : c + 2, tip)
      line(s < 0 ? c - 4 : c + 3, tip + 1)
      line(s < 0 ? c - 4 : c + 3, my)
    }
    if (b === 'old') {
      for (let x = c - 4; x <= c + 3; x++) {
        if (x % 3 !== 0) line(x, g.fy + 4)
        if ((x + 1) % 3 !== 0) line(x, g.fy + 6)
      }
      for (const [o, i] of [[c - 5, c - 3], [c + 2, c + 4]]) for (let x = o; x <= i; x++) line(x, ey + 1)
      line(c - 2, g.chin - 1)
      line(c + 1, g.chin - 1)
    }
  }
}

function beard(p: Paint, g: Geo, S: ArrayLike<number>, shade: (x: number, y: number, deep: number) => number, kind: number, b: Band) {
  const { c, ey, my, chin } = g
  const len = kind === 1 ? 0 : kind === 2 ? 2 : kind === 3 ? 4 : 7
  const tipY = chin + len
  for (let y = ey + 1; y <= tipY; y++) {
    for (let x = c - 9; x <= c + 9; x++) {
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      const v = (y + 0.5 - g.fy) / g.fh
      const half = y <= chin ? faceHalf(g, v) + 0.4 : (faceHalf(g, 1) + 1) * (1 - (y - chin) / (len + 1.5)) + 0.6
      if (ax > half) continue
      const side = ax >= g.hw * 0.68
      const mous = y === my - 1 && ax <= 3.5
      const below = y >= my + 1
      if (!(side || mous || below)) continue
      // The mouth and lower lip stay bare.
      if (y === my + 1 && ax <= 1.2 && kind < 4) continue
      // Short beards thin out on the cheeks.
      if (kind === 1 && side && y < my && bay(x, y) > 0.5) continue
      p.set(x, y, shade(x, y, y > chin ? 0.3 : 0))
    }
  }
  for (let x = c - 2; x <= c + 1; x++) p.set(x, my, mix(S[0], C(0x401010), 0.6))
  if (b !== 'old') p.set(c - 1, my + 1, mix(S[2], C(0xa04848), 0.3))
}

function braids(p: Paint, g: Geo, hair: ArrayLike<number>) {
  for (const s of [-1, 1]) {
    const bx = g.c + s * (g.hw - 0.5)
    for (let y = g.chin - 2; y <= g.sy + 13; y++) {
      const sway = Math.round(Math.sin((y - g.chin) * 0.25) * 0.6) + s * Math.round(clamp((y - g.chin) * 0.15, 0, 2))
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.round(bx + dx + sway)
        // A plait: diagonal bands, lit on the left.
        const band = (y + (s < 0 ? dx : -dx) + 99) % 3
        p.set(x, y, hair[Math.max(0, Math.min(3, (band === 0 ? 0 : 2) - (dx > 0 ? 1 : 0) + (dx < 0 ? 1 : 0)))])
      }
    }
    // A ribbon at the end.
    const ex = Math.round(bx + s * 2)
    p.set(ex - 1, g.sy + 14, RUBY)
    p.set(ex, g.sy + 14, RUBY)
    p.set(ex + 1, g.sy + 14, C(0x8a1020))
  }
}

function wimpleHood(p: Paint, g: Geo) {
  const { c, fy, chin, sy } = g
  for (let y = fy - 4; y <= sy + 4; y++) {
    for (let x = c - 12; x <= c + 12; x++) {
      const dx = x + 0.5 - c
      const head = (dx / (g.hw + 2.5)) ** 2 + ((y + 0.5 - fy - 6) / 11) ** 2 <= 1
      const throat = y >= chin - 2 && Math.abs(dx) <= g.neck + 4 - (y - chin) * 0.1
      const veil = y >= fy + 4 && Math.abs(dx) <= g.hw + 3 + clamp((y - g.ey) * 0.3, 0, 4) && y < sy + 3
      if (!(head || throat || veil)) continue
      const v = (y + 0.5 - fy) / g.fh
      if (Math.abs(dx) <= faceHalf(g, v) - 0.6 && y > fy + 1 && y < chin) continue
      let l = 2.2 - (dx / 12) * 1.2 + Math.sin(dx * 1.1 + y * 0.2) * 0.25
      if (Math.abs(dx) > faceHalf(g, v) - 0.6 && Math.abs(dx) < faceHalf(g, v) + 1 && y > fy + 1 && y < chin) l -= 0.6
      p.set(x, y, tone(LINEN, l, x, y))
    }
  }
}

function regentCap(p: Paint, g: Geo, R: ArrayLike<number>) {
  const { c, fy } = g
  for (let y = fy - 5; y <= fy + 2; y++) {
    for (let x = c - 11; x <= c + 11; x++) {
      const dx = x + 0.5 - c
      if ((dx / (g.hw + 2.4)) ** 2 + ((y + 0.5 - fy + 0.5) / 4.6) ** 2 > 1) continue
      let l = 2.2 - dx * 0.12 - (y === fy + 2 ? 1 : 0)
      if (y < fy - 3) l += 0.3
      p.set(x, y, tone(R, l, x, y))
    }
  }
}

function kingDress(p: Paint, g: Geo, inBody: (x: number, y: number) => boolean, cloth: (R: ArrayLike<number>, x: number, y: number, bias?: number) => number, robe: ArrayLike<number>) {
  const { c, sy } = g
  void robe
  for (let y = g.sy - 1; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (!inBody(x, y)) continue
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      // The tunic in the opening of the mantle: cloth of gold with a woven lozenge.
      const open = 2.2 + (y - sy - 6) * 0.3
      if (y > sy + 5 && ax < open) {
        p.set(x, y, (x + y) % 4 === 0 || (x - y + 64) % 4 === 0 ? GOLD[1] : tone(GOLD, 2.6 - dx * 0.2, x, y))
        continue
      }
      if (y > sy + 5 && ax < open + 1.2) {
        p.set(x, y, tone(ERMINE, 2.5 - dx * 0.2, x, y))
        continue
      }
      // The ermine capelet over the shoulders, scalloped at the hem; black tails dotted on it.
      const hem = sy + 5 + ((Math.floor(ax) % 5) < 3 ? 1 : 0)
      if (y <= hem) {
        const spot = rnd(x, y, 11) < 0.1 && y < hem && y > sy - 1
        p.set(x, y, spot ? INK : tone(ERMINE, 2.6 - (dx / g.sh) * 1.3 - (y === hem ? 0.8 : 0), x, y))
        if (spot) p.set(x, y + 1, C(0x3a3840))
      }
    }
  }
  // The collar of gold links with a jewelled brooch.
  for (let x = c - 11; x <= c + 10; x++) {
    const dx = x + 0.5 - c
    const y = Math.round(sy + 2 + (dx * dx) / 26)
    if (inBody(x, y)) p.set(x, y, x % 2 ? GOLD[3] : GOLD[2])
  }
  p.rect(c - 2, sy + 4, 4, 3, GOLD[3])
  p.set(c - 2, sy + 6, GOLD[1])
  p.set(c + 1, sy + 6, GOLD[1])
  p.set(c - 1, sy + 5, RUBY)
  p.set(c, sy + 5, mix(RUBY, INK, 0.4))
  void cloth
}

function queenDress(p: Paint, g: Geo, S: ArrayLike<number>, inBody: (x: number, y: number) => boolean, cloth: (R: ArrayLike<number>, x: number, y: number, bias?: number) => number, mantle: ArrayLike<number>, queen: boolean) {
  const { c, sy } = g
  const depth = queen ? 5 : 4
  const width = queen ? 6.5 : 5
  for (let y = g.sy - 1; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (!inBody(x, y)) continue
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      // A scooped neckline showing the collarbones, edged in gold.
      const neck = sy + depth - (dx * dx) / (width * 1.3)
      if (ax < width && y < neck) {
        let l = 2.8 - dx * 0.12
        if (y === sy && Math.abs(ax - 2.5) < 1.5) l -= 0.7
        p.set(x, y, tone(S, l, x, y))
        continue
      }
      if (ax < width + 0.5 && y < neck + 1.2) {
        p.set(x, y, GOLD[ax < width - 1 ? 3 : 2])
        continue
      }
      // A queen's mantle over the outer shoulders, lined with ermine.
      if (queen) {
        const edge = g.sh - 4.5 - (y - sy) * 0.25
        if (ax > edge + 1) p.set(x, y, cloth(mantle, x, y, -0.2))
        else if (ax > edge) p.set(x, y, tone(ERMINE, 2.4, x, y))
      } else if (Math.abs(ax - (g.sh - 4)) < 0.6 && y < sy + 6) p.set(x, y, GOLD[2])
      // A stomacher of gold lacing down the bodice.
      if (ax < 1.5 && y > neck + 2 && (y - sy) % 3 === 0) p.set(x, y, GOLD[3])
    }
  }
  // Necklace: pearls and a ruby pendant for a queen, a fine chain and drop for a princess.
  for (let x = c - 5; x <= c + 4; x++) {
    const dx = x + 0.5 - c
    const y = Math.round(sy + 1 + (dx * dx) / 9)
    if (queen) p.set(x, y, x % 2 ? PEARL : C(0xb4aca4))
    else p.set(x, y, GOLD[3])
  }
  if (queen) {
    p.set(c - 1, sy + 3, GOLD[3])
    p.set(c, sy + 3, GOLD[2])
    p.rect(c - 1, sy + 4, 2, 2, RUBY)
    p.set(c, sy + 5, mix(RUBY, INK, 0.5))
  } else {
    p.set(c - 1, sy + 3, SAPPHIRE)
  }
}

function princeDress(p: Paint, g: Geo, inBody: (x: number, y: number) => boolean, cloth: (R: ArrayLike<number>, x: number, y: number, bias?: number) => number, sash: ArrayLike<number>) {
  const { c, sy } = g
  for (let y = g.sy - 1; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (!inBody(x, y)) continue
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      // An embroidered collar round the neck.
      if (y <= sy + 1 && ax < g.neck + 2.5) {
        p.set(x, y, (x + y) % 2 ? GOLD[3] : GOLD[2])
        continue
      }
      // A sash from the right shoulder down across the chest.
      const d = (y - sy - 1) - (dx + g.sh * 0.55) * 0.95
      if (Math.abs(d) < 1.8 && dx > -g.sh + 2) {
        p.set(x, y, Math.abs(d) > 1.2 ? GOLD[2] : cloth(sash, x, y, 0.4))
        continue
      }
      // Gold buttons down the front.
      if (ax < 0.6 && y > sy + 2 && (y - sy) % 3 === 0) p.set(x, y, GOLD[4])
    }
  }
}

function regentDress(p: Paint, g: Geo, inBody: (x: number, y: number) => boolean, seed: number) {
  const { c, sy } = g
  // Fur over the shoulders and down the edges of the open gown.
  for (let y = g.sy - 1; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (!inBody(x, y)) continue
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      const collar = y <= sy + 3 + ((Math.floor(ax) * 7) % 3 === 0 ? 1 : 0)
      const lapel = ax > 1.5 && ax < 4.5 && y > sy
      if (collar || lapel) p.set(x, y, tone(FUR, 2.0 - dx * 0.1 + (rnd(x, y, seed) - 0.5) * 1.2, x, y))
      else if (ax <= 1.5 && y > sy) p.set(x, y, tone(DARK[0], 1.5, x, y))
    }
  }
  // The chain of office: heavy gold links and a medallion.
  for (let x = c - 12; x <= c + 11; x++) {
    const dx = x + 0.5 - c
    const y = Math.round(sy + 4 + (dx * dx) / 20)
    if (y < PH - 8 && inBody(x, y)) {
      p.set(x, y, x % 2 ? GOLD[4] : GOLD[2])
      if (x % 2) p.set(x, y + 1, GOLD[1])
    }
  }
  p.disc(c, sy + 12, 2.6, 2.6, (x, y) => tone(GOLD, 3.4 - (x - c) * 0.4 - (y - sy - 12) * 0.4, x, y))
  p.set(c - 1, sy + 12, EMERALD)
}

function crown(p: Paint, g: Geo, king: boolean, seed: number) {
  const { c, fy } = g
  const band = fy - 1
  const half = g.hw + 0.8
  // A velvet cap inside a king's crown.
  if (king) p.disc(c, band - 2, half - 1, 4, (x, y) => tone(ROYAL[0], 2.2 - (x - c) * 0.15 - (y - band + 4) * 0.1, x, y))
  // The points: fleurons on a king's crown, pearl-tipped spikes on a queen's.
  const pts = king ? [-6, -3, 0, 3, 6] : [-6, -3, 0, 3, 6]
  for (const at of pts) {
    const x0 = c + at
    const tall = at === 0 ? 5 : Math.abs(at) === 6 ? 4 : 3
    for (let k = 1; k <= tall; k++) {
      const w = k < tall - 1 ? 1 : 0
      for (let dx = -w; dx <= w - 1 + 1; dx++) {
        const x = x0 + dx - (w ? 0 : 0)
        if (dx > w) continue
        p.set(x - 1 + 1, band - k, tone(GOLD, 3.4 - dx * 0.8 - (at > 0 ? 0.5 : 0), x, band - k))
      }
    }
    if (king) {
      p.set(x0 - 1, band - tall + 1, GOLD[3])
      p.set(x0 + 1, band - tall + 1, GOLD[2])
      p.set(x0, band - tall, GOLD[4])
    } else p.set(x0, band - tall - 1, PEARL)
  }
  // The band, curved round the head, set with stones.
  for (let x = Math.floor(c - half); x <= c + half; x++) {
    const dx = x + 0.5 - c
    const sag = Math.round((dx * dx) / 60)
    for (let k = 0; k < 3; k++) p.set(x, band + k + sag, tone(GOLD, (k === 0 ? 4 : k === 1 ? 3 : 1.6) - (dx / half) * 1.3, x, band + k))
  }
  const gems = [RUBY, SAPPHIRE, EMERALD]
  p.set(c - 1, band + 1, gems[seed % 3])
  p.set(c, band + 1, mix(gems[seed % 3], INK, 0.3))
  p.set(c - 5, band + 1, gems[(seed + 1) % 3])
  p.set(c + 4, band + 1, mix(gems[(seed + 1) % 3], INK, 0.3))
}

function circlet(p: Paint, g: Geo, peak: boolean) {
  const { c, fy } = g
  const y = fy + 2
  for (let x = c - 8; x <= c + 7; x++) p.set(x, y + Math.round(((x + 0.5 - c) ** 2) / 70), tone(GOLD, 3.6 - (x - c) * 0.15, x, y))
  if (peak) {
    p.set(c - 1, y - 1, GOLD[3])
    p.set(c, y - 1, GOLD[2])
    p.set(c - 1, y - 2, GOLD[4])
  }
  p.set(c - 1, y, SAPPHIRE)
}

// A swaddled baby: a bonnet round the face, a bundle of linen wrapped in a royal blanket.
function babyBust(p: Paint, g: Geo, S: ArrayLike<number>, seed: number, sex: Sex, role: Role, blanket: ArrayLike<number>) {
  const { c } = g
  void S
  void seed
  // The bundle.
  p.disc(c, 51, 19, 15, (x, y) => {
    const dx = x + 0.5 - c
    const dy = y + 0.5 - 51
    const l = 2.4 - dx * 0.06 - dy * 0.05 + Math.sin(dx * 0.7 - dy * 0.4) * 0.3
    // The blanket wraps over the linen on a slant, edged in gold.
    const fold = dy - 2 + dx * 0.45
    if (fold > 1) return tone(blanket, 2.2 - dx * 0.06 + Math.sin(dx * 0.8) * 0.25, x, y)
    if (fold > 0) return GOLD[(x & 1) ? 3 : 2]
    return tone(LINEN, l, x, y)
  })
  // The bonnet, a frill of lace round its edge, and a ribbon under the chin.
  const by = g.fy + g.fh * 0.5
  p.disc(c, by - 1, g.hw + 3.5, g.fh * 0.5 + 3.5, (x, y) => {
    const dx = x + 0.5 - c
    const dy = y + 0.5 - by + 1
    const edge = (dx / (g.hw + 3.5)) ** 2 + (dy / (g.fh * 0.5 + 3.5)) ** 2 > 0.78
    if (edge && (x + y) % 2 === 0) return LINEN[3]
    return tone(LINEN, 2.3 - dx * 0.12 - dy * 0.05, x, y)
  })
  const ribbon = sex === 'f' ? ramp(0x8a2a44, 0xc84a6a, 0xf08aa0) : ramp(0x2a4a8a, 0x4a7ac8, 0x8ab4f0)
  for (const [x, y, t] of [[c - 3, g.chin + 1, 1], [c - 2, g.chin + 1, 2], [c - 1, g.chin + 2, 1], [c, g.chin + 2, 0], [c + 1, g.chin + 1, 1], [c + 2, g.chin + 1, 0], [c - 1, g.chin + 3, 1], [c, g.chin + 4, 0]] as const) p.set(x, y, ribbon[t])
  // An infant monarch wears a tiny crown on the bonnet.
  if (role === 'king' || role === 'queen') {
    const top = g.fy - 4
    for (let x = c - 4; x <= c + 3; x++) {
      p.set(x, top, tone(GOLD, 3.4 - (x - c) * 0.3, x, top))
      p.set(x, top + 1, tone(GOLD, 2.4 - (x - c) * 0.3, x, top))
    }
    for (const x of [c - 4, c - 1, c, c + 3]) p.set(x, top - 1, GOLD[3])
    p.set(c - 1, top - 2, GOLD[4])
    p.set(c - 1, top, RUBY)
  } else if (role === 'prince' || role === 'princess') {
    p.set(c - 1, g.fy - 3, GOLD[4])
    p.set(c, g.fy - 3, GOLD[3])
  }
}

// A gilt frame: a dark outer edge, a bevelled moulding lit from the top left, beading, and a shadowed inner lip.
function frame(p: Paint) {
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const d = Math.min(x, y, PW - 1 - x, PH - 1 - y)
      if (d > 3) {
        if (d === 4) p.tint(x, y, INK, x === 4 || y === 4 ? 0.55 : 0.3)
        continue
      }
      const litSide = x <= y && x < PW - 1 - y ? true : y < x && y < PH - 1 - x
      const farSide = !litSide
      let col: number
      if (d === 0) col = GOLD[0]
      else if (d === 1) col = farSide ? GOLD[1] : GOLD[4]
      else if (d === 2) col = ((x + y) & 1) ? GOLD[3] : farSide ? GOLD[1] : GOLD[2]
      else col = farSide ? GOLD[1] : GOLD[0]
      p.set(x, y, col)
    }
  }
  // Rosettes at the corners.
  for (const [x, y] of [[2, 2], [PW - 3, 2], [2, PH - 3], [PW - 3, PH - 3]]) {
    p.set(x, y, GOLD[5])
    p.set(x - 1, y, GOLD[3])
    p.set(x + 1, y, GOLD[3])
    p.set(x, y - 1, GOLD[3])
    p.set(x, y + 1, GOLD[3])
  }
}

// A dead royal's portrait: faded to sepia, a black ribbon tied across the top right corner.
function mourn(p: Paint) {
  for (let i = 0; i < p.px.length; i++) {
    const v = p.px[i]
    const r = v & 255
    const g = (v >>> 8) & 255
    const b = (v >>> 16) & 255
    // Luminance, its contrast raised a little, so the faded picture still reads.
    const l = clamp(((0.3 * r + 0.59 * g + 0.11 * b) / 255 - 0.42) * 1.25 + 0.36) * 255
    const sr = Math.min(255, Math.round(l * 1.0 + 12))
    const sg = Math.min(255, Math.round(l * 0.88 + 6))
    const sb = Math.min(255, Math.round(l * 0.72 + 2))
    p.px[i] = mix((0xff000000 | (sb << 16) | (sg << 8) | sr) >>> 0, v, 0.12)
  }
}

function ribbon(p: Paint) {
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const u = PW - 1 - x + y
      if (u >= 10 && u <= 16) p.set(x, y, u === 10 ? C(0x4a4652) : u === 16 ? C(0x060608) : (x + y) % 5 === 0 ? C(0x24222a) : C(0x141218))
    }
  }
  // The knot where it meets the frame.
  for (const [x, y, c] of [[PW - 9, 4, 0x2a2830], [PW - 8, 5, 0x141218], [PW - 10, 5, 0x141218], [PW - 9, 5, 0x3a3842], [PW - 9, 6, 0x141218]] as const) p.set(x, y, C(c))
}

const portraits = new Map<string, Uint32Array>()

// A royal's painted bust, 48 × 60 art pixels in a gilt frame, scaled crisply to `size` pixels wide (default 96).
export function Portrait({ seed, sex, age, role, dead, size }: { seed: number; sex: 'm' | 'f'; age: number; role: Role; dead?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const b = bandOf(age)
  const key = `${seed}|${sex}|${b}|${role}|${dead ? 1 : 0}`
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    let px = portraits.get(key)
    if (!px) {
      px = portrait(seed >>> 0, sex, b, role, !!dead)
      if (dead) ribbon(new Paint(px, PW, PH))
      portraits.set(key, px)
    }
    const image = ctx.createImageData(PW, PH)
    new Uint32Array(image.data.buffer).set(px)
    ctx.putImageData(image, 0, 0)
  }, [key])
  const w = size ?? 96
  return <canvas ref={ref} width={PW} height={PH} aria-hidden style={{ display: 'block', width: w, height: (w * PH) / PW, imageRendering: 'pixelated' }} />
}

// ---- Scenes: tools ----------------------------------------------------------------------------------------------------

const W = 256
const H = 128

// Ashlar: courses of dressed stone, each block a little different, mortar between; `light` brightens by place.
function ashlar(p: Paint, x0: number, y0: number, x1: number, y1: number, r: ArrayLike<number>, seed: number, light: (x: number, y: number) => number, bw = 14, bh = 7) {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
    const row = Math.floor((y - y0) / bh)
    const off = (row & 1) * (bw >> 1)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const bx = Math.floor((x - x0 + off) / bw)
      const mortar = (y - y0) % bh === 0 || (x - x0 + off) % bw === 0
      let l = light(x, y) + (rnd(bx, row, seed) - 0.5) * 0.4
      if (mortar) l -= 0.9
      else if ((y - y0) % bh === 1) l += 0.3
      p.set(x, y, tone(r, l, x, y))
    }
  }
}

// A floor of square tiles in one-point perspective towards (vx, vy).
function tiles(p: Paint, y0: number, vx: number, vy: number, a: ArrayLike<number>, b: ArrayLike<number>, light: (x: number, y: number) => number) {
  for (let y = y0; y < H; y++) {
    const z = y - vy
    const v = 900 / z
    for (let x = 0; x < W; x++) {
      const u = ((x - vx) * 6) / z
      const cell = (Math.floor(u) + Math.floor(v)) & 1
      const r = cell ? a : b
      // Joints a pixel wide whatever the distance.
      const seam = (u - Math.floor(u)) * (z / 6) < 1 || (v - Math.floor(v)) < 900 / (z * z)
      let l = light(x, y) + (rnd(Math.floor(u), Math.floor(v), 3) - 0.5) * 0.4
      if (seam) l -= 0.7
      p.set(x, y, tone(r, l, x, y))
    }
  }
}

// Is (x, y) inside a pointed (equilateral) arch opening of half-width hw, apex at `top`, down to `bottom`?
function inArch(x: number, y: number, cx: number, top: number, hw: number, bottom: number) {
  const X = x + 0.5
  const Y = y + 0.5
  if (Y > bottom || Math.abs(X - cx) > hw) return false
  const spring = top + hw * Math.sqrt(3)
  if (Y >= spring) return true
  return Math.hypot(X - (cx - hw), Y - spring) <= 2 * hw && Math.hypot(X - (cx + hw), Y - spring) <= 2 * hw
}

const GLASS = [0x2a4aa8, 0xa82a2a, 0xd8a83a, 0x2a8a5a, 0x6a3aa8, 0x3a8ac8].map(C)

// A lancet window of stained glass in a stone splay; `k` dims it for a dark nave.
function lancet(p: Paint, cx: number, top: number, hw: number, bottom: number, seed: number, k = 1, mullion = false) {
  for (let y = top - 3; y <= bottom + 2; y++) {
    for (let x = Math.floor(cx - hw - 3); x <= cx + hw + 3; x++) {
      if (inArch(x, y, cx, top, hw, bottom)) {
        const lead = (x + y) % 5 === 0 || (x - y + 300) % 5 === 0
        const a = Math.floor((x + y) / 5)
        const b = Math.floor((x - y + 300) / 5)
        let c = GLASS[Math.floor(rnd(a, b, seed) * GLASS.length)]
        const up = 1 - (y - top) / (bottom - top)
        c = mix(c, C(0xfff4d8), 0.12 + up * 0.25)
        c = mix(C(0x0a0a14), c, k)
        if (mullion && Math.abs(x + 0.5 - cx) < 1) p.set(x, y, STONE[3])
        else p.set(x, y, lead ? C(0x100c14) : c)
      } else if (inArch(x, y, cx, top - 2, hw + 2, bottom + 2)) {
        const dx = x + 0.5 - cx
        p.set(x, y, tone(STONE, (dx < 0 ? 3.2 : 1.6) * (0.5 + k * 0.5), x, y))
      }
    }
  }
}

// A rose window: rings of petals round a boss, lead between.
function rose(p: Paint, cx: number, cy: number, r: number, seed: number) {
  p.disc(cx, cy, r + 3, r + 3, (x, y) => tone(STONE, 3.6 - (x - cx) * 0.06 - (y - cy) * 0.04, x, y))
  p.disc(cx, cy, r, r, (x, y) => {
    const dx = x + 0.5 - cx
    const dy = y + 0.5 - cy
    const d = Math.hypot(dx, dy)
    const a = Math.atan2(dy, dx)
    const ring = d < r * 0.25 ? 0 : d < r * 0.6 ? 1 : 2
    const n = ring === 0 ? 1 : ring === 1 ? 8 : 16
    const sec = (((a / (Math.PI * 2)) * n + 100) % 1)
    if (ring > 0 && (sec < 0.12 || Math.abs(d - r * 0.25) < 0.7 || Math.abs(d - r * 0.6) < 0.7)) return C(0x18141c)
    const c = ring === 0 ? GLASS[2] : GLASS[Math.floor(rnd(ring, Math.floor(((a / (Math.PI * 2)) * n + 100)) % n, seed) * GLASS.length)]
    return mix(c, C(0xfff4d8), 0.25 - d / r * 0.15)
  })
}

// A shaft of light: a polygon tinted towards c, fading towards its far end (y1).
function shaft(p: Paint, pts: number[], c: number, k: number, y0: number, y1: number) {
  p.poly(pts, (x, y) => {
    p.tint(x, y, c, k * (1 - clamp((y - y0) / (y1 - y0)) * 0.7))
    return undefined
  })
}

// Small devices for banners, 7 × 7.
const DEVICES = [
  ['...#...', '.#.#.#.', '.#####.', '.#####.', '.#####.', '.......', '.#####.'], // crown
  ['...#...', '...#...', '#######', '...#...', '...#...', '...#...', '...#...'], // cross
  ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'], // saltire
  ['.#.#.#.', '.#####.', '..###..', '..###..', '..###..', '.#####.', '.#####.'], // tower
  ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'], // lozenge
]
const BANNERS = [ROYAL[0], ROYAL[1], ROYAL[2], ROYAL[3], ramp(0x0e0e14, 0x1e1e28, 0x30303e, 0x484858)]

// A banner on a gilt rod, swallowtailed, swaying a little with t, its device in gold.
function banner(p: Paint, x: number, y: number, w: number, h: number, R: ArrayLike<number>, device: number, t: number, phase = 0) {
  p.line(x - 2, y, x + w + 1, y, GOLD[2])
  p.set(x - 3, y, GOLD[4])
  p.set(x + w + 2, y, GOLD[4])
  const tail = Math.floor(w / 2)
  for (let row = 1; row <= h + tail; row++) {
    const sway = Math.round(Math.sin(t * 1.4 + phase + row * 0.12) * (row / (h + tail)) * 1.4)
    for (let col = 0; col < w; col++) {
      // The swallowtail: a notch opening up from the middle.
      if (row > h && Math.abs(col + 0.5 - w / 2) < ((row - h) * (w / 2)) / tail) continue
      const border = col === 0 || col === w - 1
      let l = 2.3 - (col / w) * 1.1 + Math.sin(col * 0.9 + phase) * 0.35 - (row / (h + tail)) * 0.3
      if (row === 1) l -= 0.6
      p.set(x + col + sway, y + row, border ? GOLD[col === 0 ? 3 : 1] : tone(R, l, x + col, y + row))
    }
  }
  const dev = DEVICES[device % DEVICES.length]
  const ox = x + Math.floor((w - 7) / 2)
  const oy = y + Math.floor(h * 0.3)
  for (let dy = 0; dy < 7; dy++) {
    const sway = Math.round(Math.sin(t * 1.4 + phase + (oy + dy - y) * 0.12) * ((oy + dy - y) / (h + tail)) * 1.4)
    for (let dx = 0; dx < 7; dx++) if (dev[dy][dx] === '#') p.set(ox + dx + sway, oy + dy, dx < 3 ? GOLD[4] : GOLD[3])
  }
}

// A round pillar with a moulded capital and base.
function pillar(p: Paint, x: number, w: number, y0: number, y1: number, r: ArrayLike<number>, k = 1) {
  for (let y = y0; y < y1; y++) {
    const cap = y < y0 + 4
    const base = y > y1 - 5
    const ww = cap || base ? w + 4 : w
    const x0 = x - ww / 2
    for (let i = 0; i < ww; i++) {
      const u = i / ww
      let l = (3.6 - Math.abs(u - 0.3) * 4.4) * k
      if (cap && (y - y0) % 2 === 1) l -= 0.6
      if (base && (y1 - y) % 2 === 0) l -= 0.5
      p.set(x0 + i, y, tone(r, l, x0 + i, y))
    }
  }
}

// A wax candle (no flame) of height h standing on row y.
function candle(p: Paint, x: number, y: number, h: number) {
  for (let yy = y - h; yy < y; yy++) {
    p.set(x, yy, WAX[2])
    p.set(x + 1, yy, WAX[1])
  }
  p.set(x, y - h, WAX[3])
  // A drip of wax down the side.
  p.set(x - 1, y - h + 2, WAX[2])
}

// A flickering flame with its glow; its base on (x, y).
function flame(p: Paint, x: number, y: number, t: number, seed: number, size = 1, glowK = 0.35) {
  const f = noise(t * 7, seed, 4)
  glow(p, x + 0.5, y - 2, 14 * size, C(0xffb848), glowK * (0.8 + f * 0.35))
  const lean = f > 0.66 ? 1 : f < 0.25 ? -1 : 0
  const h = Math.round((3 + f * 1.6) * size)
  for (let k = 0; k < h; k++) {
    const u = k / h
    const x0 = x + (u > 0.5 ? lean : 0)
    p.set(x0, y - 1 - k, u < 0.3 ? FIRE[4] : u < 0.7 ? FIRE[5] : FIRE[3])
    if (size > 1 && u < 0.6) p.set(x0 + 1, y - 1 - k, FIRE[3])
  }
  p.set(x, y, FIRE[2])
}

// A tall iron candle stand: a tripod foot, a shaft, a drip pan and a thick candle.
function stand(p: Paint, x: number, y: number, h: number, gold = false) {
  const R = gold ? GOLD : STONE
  shadow(p, x + 2, y, 5, 1.5, 0.4)
  p.line(x - 3, y - 1, x, y - 4, R[2])
  p.line(x + 4, y - 1, x + 1, y - 4, R[1])
  for (let yy = y - h; yy < y - 3; yy++) {
    p.set(x, yy, R[3])
    p.set(x + 1, yy, R[1])
  }
  p.rect(x - 2, y - h, 6, 1, R[3])
  p.rect(x - 1, y - h + 1, 4, 1, R[1])
  for (let yy = y - h - 5; yy < y - h; yy++) {
    p.set(x, yy, WAX[2])
    p.set(x + 1, yy, WAX[1])
  }
  p.set(x, y - h - 5, WAX[3])
}

// ---- Scenes: people ---------------------------------------------------------------------------------------------------

type Pose = 'stand' | 'pray' | 'raise' | 'hold' | 'baby' | 'reach' | 'crosier' | 'gesture' | 'trumpet'
type Headwear = 'none' | 'crown' | 'tiara' | 'circlet' | 'mitre' | 'veil' | 'hood' | 'cap' | 'wimple'

interface Fig {
  robe: ArrayLike<number>
  skin?: number
  hair?: ArrayLike<number>
  f?: -1 | 0 | 1
  h?: number
  pose?: Pose
  hand?: [number, number]
  kneel?: boolean
  sit?: boolean
  bow?: boolean
  back?: boolean
  head?: Headwear
  veil?: ArrayLike<number>
  mantle?: ArrayLike<number>
  dress?: boolean
  beard?: boolean
  long?: boolean
  bald?: boolean
  chain?: boolean
  frame?: number
}

// A courtier about 30 pixels tall, feet on row y, facing right (f 1), left (-1) or out of the picture (0); lit from
// the left. Returns where the head's top is, for things held above it.
function fig(p: Paint, x: number, y: number, o: Fig): { top: number; sy: number } {
  const H = o.h ?? 30
  const f = o.f ?? 0
  const s = f === 0 ? 1 : f
  const k = H / 30
  const S = SKIN[o.skin ?? 0]
  const R = o.robe
  const hair = o.hair ?? HAIRS[1]
  const hh = Math.round(H * (H < 24 ? 0.27 : 0.23))
  const drop = o.kneel ? Math.round(H * 0.28) : o.sit ? Math.round(H * 0.16) : o.bow ? 2 : 0
  const top = y - H + drop
  const hx = x + (o.bow ? f : 0)
  const sy = top + hh + 1
  const sw = Math.max(3, Math.round(H * 0.15))
  const bw = Math.round(H * (o.dress ? 0.3 : o.sit ? 0.26 : 0.2))
  const pose = o.pose ?? 'stand'
  shadow(p, x + 2, y, bw + 3, 2, 0.45)

  // Hands for the pose.
  let back: [number, number] = [x - s * sw, sy + Math.round(11 * k)]
  let front: [number, number] = [x + s * sw, sy + Math.round(11 * k)]
  if (pose === 'pray') back = front = [x + f * 3, sy + Math.round(6 * k)]
  else if (pose === 'hold' || pose === 'baby') {
    back = [x + f * 2 - (f === 0 ? 2 : 0), sy + Math.round(7 * k)]
    front = [x + f * 4 + (f === 0 ? 2 : 0), sy + Math.round(7 * k)]
  } else if (pose === 'raise') {
    back = [x + s * Math.round(4 * k), sy - Math.round(5 * k)]
    front = [x + s * Math.round(7 * k), sy - Math.round(4 * k)]
  } else if (pose === 'reach' && o.hand) front = [x + s * o.hand[0], sy + o.hand[1]]
  else if (pose === 'crosier') front = [x + s * Math.round(5 * k), sy + Math.round(8 * k)]
  else if (pose === 'gesture') front = [x + s * Math.round(7 * k), sy + Math.round(3 * k) - ((o.frame ?? 0) % 2)]
  else if (pose === 'trumpet') back = front = [x + s * Math.round(5 * k), sy + 1]
  const frontArms = pose !== 'stand' && pose !== 'reach' && pose !== 'gesture' && pose !== 'crosier'
  const arm = (hand: [number, number], from: number, dark: number) => {
    const x0 = x + from
    const y0 = sy + 1
    const n = Math.max(Math.abs(hand[0] - x0), Math.abs(hand[1] - y0), 1)
    for (let i = 0; i <= n; i++) {
      const ax = Math.round(x0 + ((hand[0] - x0) * i) / n)
      const ay = Math.round(y0 + ((hand[1] - y0) * i) / n)
      p.set(ax, ay, R[Math.max(0, 2 - dark)])
      p.set(ax + 1, ay, R[Math.max(0, 1 - dark)])
    }
    p.set(hand[0], hand[1], S[dark ? 2 : 3])
    p.set(hand[0] + 1, hand[1], S[1])
  }

  // Long hair down the back.
  const hairR = hair
  if (o.long && !o.head?.match(/veil|hood|wimple/)) {
    for (let yy = top + 2; yy < sy + 6; yy++) {
      for (const c of f === 0 ? [-4, 3] : [s < 0 ? 2 : -4, s < 0 ? 3 : -3]) p.set(hx + c, yy, hairR[c < 0 ? 2 : 1])
    }
  }
  if (!frontArms) arm(back, -s * (sw - 1), 1)

  // The robe: narrow at the shoulders, flaring to the hem; a kneeling figure's skirt pools behind.
  const hemL = o.kneel ? x - s * (bw + 6) : x - bw
  const hemR = o.kneel ? x + s * (sw + 3) : x + bw
  const pts = [x - sw + 1, sy, x + sw - 1, sy, x + sw, sy + 2, Math.max(hemL, hemR), y, Math.min(hemL, hemR), y, x - sw, sy + 2]
  const span = Math.max(4, bw)
  p.poly(pts, (px, py) => {
    const u = (px - x) / span
    let l = 2.2 - u * 1.1 - ((py - sy) / Math.max(1, y - sy)) * 0.35
    if (py > sy + 6 * k) l += Math.sin((px - x) * 1.3 + 0.5) * 0.35
    if (py === y - 1) l -= 0.5
    return tone(R, l, px, py)
  })
  // A belt, or a priest's stole.
  if (!o.mantle && !o.dress) p.line(x - sw + 1, sy + Math.round(9 * k), x + sw - 1, sy + Math.round(9 * k), mix(R[0], GOLD[2], 0.4))
  // The royal mantle: open in front, a train behind, an ermine collar.
  if (o.mantle) {
    const M = o.mantle
    const trail = f === 0 ? 0 : 8
    p.poly([x - sw - 1, sy + 1, x + sw + 1, sy + 1, x + bw + 2 + (s < 0 ? trail : 0), y, x - bw - 2 - (s > 0 ? trail : 0), y], (px, py) => {
      const open = 1 + (py - sy) * 0.18
      if (py > sy + 3 && Math.abs(px - x - f * 1.5) < open) return undefined
      if (py > sy + 3 && Math.abs(px - x - f * 1.5) < open + 1) return ERMINE[2]
      const u = (px - x) / (bw + 2)
      return tone(M, 2.1 - u * 1.2 + Math.sin((px - x) * 1.1) * 0.3, px, py)
    })
    for (let yy = sy; yy <= sy + 2; yy++) for (let xx = x - sw - 1; xx <= x + sw + 1; xx++) p.set(xx, yy, (xx + yy * 2) % 4 === 0 && yy === sy + 1 ? INK : tone(ERMINE, 2.6 - (xx - x) * 0.25, xx, yy))
  }
  if (o.chain) for (let xx = x - sw + 1; xx <= x + sw - 1; xx++) p.set(xx, sy + 2 + (Math.abs(xx - x) < 2 ? 1 : 0), xx % 2 ? GOLD[4] : GOLD[2])
  if (frontArms) arm(back, -s * (sw - 1), 1)
  arm(front, s * (sw - 1), 0)
  if (pose === 'baby') {
    p.disc(x + f * 3 + 0.5, sy + Math.round(6 * k), 3.5, 2.2, (px, py) => tone(LINEN, 3 - (px - x) * 0.2, px, py))
    p.set(x + f * 3 + (f < 0 ? -2 : 2), sy + Math.round(6 * k) - 1, SKIN[0][3])
  }
  if (pose === 'trumpet') {
    p.line(x + s * 3, sy, x + s * 12, sy - 2, GOLD[3])
    p.set(x + s * 13, sy - 3, GOLD[4])
    p.set(x + s * 13, sy - 2, GOLD[2])
    p.set(x + s * 13, sy - 1, GOLD[3])
    p.rect(Math.min(x + s * 7, x + s * 9), sy - 1, 3, 3, BANNERS[0][2])
  }
  if (pose === 'crosier') {
    const cx = x + s * Math.round(6 * k)
    p.line(cx, sy - Math.round(9 * k), cx, y - 1, GOLD[2])
    for (const [dx, dy] of [[0, -1], [s, -2], [2 * s, -2], [3 * s, -1], [3 * s, 0], [2 * s, 1]]) p.set(cx + dx, sy - Math.round(9 * k) + dy, GOLD[4])
  }

  // The head: six pixels wide, shaded from the left; features on the facing side.
  for (let r = 0; r < hh; r++) {
    for (let c = -3; c <= 2; c++) {
      if ((r === 0 || r === hh - 1) && (c === -3 || c === 2)) continue
      let l = 3.3 - (c + 3) * 0.38 - (r === hh - 1 ? 0.6 : 0)
      if (c === 2) l -= 0.7
      p.set(hx + c, top + r, o.back ? tone(hairR, 2 - (c + 3) * 0.3, hx + c, top + r) : tone(S, l, hx + c, top + r))
    }
  }
  const er = top + Math.round(hh * 0.45)
  if (!o.back) {
    const eyes = f === 0 ? [-2, 1] : f > 0 ? [-1, 1] : [-2, 0]
    for (const e of eyes) p.set(hx + e, er, C(0x241612))
    if (f !== 0) p.set(f > 0 ? hx + 3 : hx - 4, er + 1, S[2])
    const m = f === 0 ? [-1, 0] : f > 0 ? [0, 1] : [-2, -1]
    if (hh >= 6) for (const e of m) p.set(hx + e, er + 2 + (hh > 6 ? 1 : 0), mix(S[0], C(0x8a2a2a), 0.4))
  }
  // Hair: the crown of the head, and down the back side.
  if (!o.bald) {
    for (let c = -2; c <= 1; c++) p.set(hx + c, top - 1, hairR[c < 0 ? 2 : 1])
    for (let c = -3; c <= 2; c++) p.set(hx + c, top, hairR[c < 0 ? 3 : 2])
    const sides = f === 0 ? [-3, 2] : f > 0 ? [-3, -2] : [1, 2]
    for (const c of sides) for (let r = 1; r <= 3; r++) p.set(hx + c, top + r, hairR[c < 0 ? 2 : 1])
    if (f === 0) for (const c of [-2, 1]) p.set(hx + c, top + 1, hairR[2])
  } else {
    for (const c of f > 0 ? [-3] : f < 0 ? [2] : [-3, 2]) for (let r = 2; r <= 3; r++) p.set(hx + c, top + r, hairR[2])
  }
  if (o.beard && !o.back) {
    for (let r = er + 1; r <= top + hh; r++) {
      for (let c = -3; c <= 2; c++) {
        if (r === top + hh && (c === -3 || c === 2)) continue
        if (r === er + 1 && c > -3 && c < 2) continue
        if (r === er + 2 + (hh > 6 ? 1 : 0) && (f === 0 ? c === -1 || c === 0 : f > 0 ? c === 0 || c === 1 : c === -2 || c === -1)) continue
        p.set(hx + c, r, hairR[c < 0 ? 2 : 1])
      }
    }
  }

  // Headwear.
  const hw = o.head ?? 'none'
  const gold = (xx: number, yy: number, lit: number) => p.set(xx, yy, GOLD[Math.max(0, Math.min(5, lit))])
  if (hw === 'crown') {
    for (let c = -3; c <= 2; c++) gold(hx + c, top - 1, c < 0 ? 4 : 3)
    for (const c of [-3, -1, 0, 2]) gold(hx + c, top - 2, c < 0 ? 4 : 3)
    gold(hx - 1, top - 3, 4)
    gold(hx, top - 3, 3)
    p.set(hx - 1, top - 1, RUBY)
  } else if (hw === 'tiara') {
    for (let c = -2; c <= 1; c++) gold(hx + c, top - 1, c < 0 ? 4 : 3)
    gold(hx - 1, top - 2, 4)
    p.set(hx - 1, top - 3, PEARL)
  } else if (hw === 'circlet') {
    for (let c = -3; c <= 2; c++) gold(hx + c, top, c < 0 ? 4 : 2)
  } else if (hw === 'mitre') {
    for (let r = 1; r <= 7; r++) {
      const half = r > 5 ? 1 : r > 4 ? 2 : 3
      for (let c = -half; c <= half - 1; c++) {
        const band = c === -1 || r === 1
        const split = r > 4 && c === 0
        p.set(hx + c, top - r, split ? STONE[2] : band ? GOLD[c < 0 ? 4 : 3] : tone(LINEN, 3 - (c + 3) * 0.4, hx + c, top - r))
      }
    }
  } else if (hw === 'veil' || hw === 'hood' || hw === 'wimple') {
    const V = o.veil ?? (hw === 'hood' ? R : LINEN)
    for (let yy = top - 1; yy <= sy + 4; yy++) {
      for (let c = -4; c <= 3; c++) {
        const r = yy - top
        if (yy === top - 1 && (c === -4 || c === 3)) continue
        const faceCol = f === 0 ? c >= -2 && c <= 1 : f > 0 ? c >= -1 && c <= 2 : c >= -3 && c <= 0
        const inFaceArea = !o.back && faceCol && r >= 1 && r < hh - (hw === 'wimple' ? 1 : 0)
        if (inFaceArea) continue
        if (yy > top + hh && (f === 0 ? c > -4 && c < 3 : f > 0 ? c > -3 : c < 2) && hw !== 'wimple') continue
        if (hw === 'wimple' && yy > sy && c > -3 && c < 2) continue
        p.set(hx + c, yy, tone(V, 2.4 - (c + 4) * 0.3 + (yy === top - 1 ? 0.4 : 0), hx + c, yy))
      }
    }
    if (hw === 'hood' && !o.back) for (let r = 1; r < hh; r++) for (let c = -3; c <= 2; c++) p.tint(hx + c, top + r, C(0x0a0810), r < 3 ? 0.55 : 0.3)
  } else if (hw === 'cap') {
    for (let c = -4; c <= 3; c++) p.set(hx + c, top - 1, R[c < 0 ? 1 : 0])
    for (let c = -3; c <= 2; c++) p.set(hx + c, top - 2, R[c < 0 ? 2 : 1])
  }
  return { top: top - 1, sy }
}

// ---- Scenes ---------------------------------------------------------------------------------------------------------

interface Scene {
  draw(p: Paint, seed: number): void
  fx?(p: Paint, t: number, seed: number): void
}

// The darkening towards the corners of a candle-lit room.
function vignette(p: Paint, k: number, c = C(0x08060a)) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W / 2) / (W / 2), (y - H * 0.55) / (H * 0.7))
    // Stepped in bands rather than dithered, so the walls don't turn to a screen of dots.
    if (d > 0.6) p.px[y * W + x] = mix(p.px[y * W + x], c, Math.min(0.9, Math.floor((d - 0.6) * k * 10) / 10))
  }
}

const COURT = [ROYAL[0], ROYAL[1], ROYAL[2], ROYAL[3], ROYAL[4], ROYAL[5], ramp(0x3a2a14, 0x5e4422, 0x866232, 0xae8448)]
const courtier = (i: number, seed: number) => COURT[Math.floor(rnd(i, seed, 21) * COURT.length)]
const hairOf = (i: number, seed: number) => HAIRS[Math.floor(rnd(i, seed, 22) * HAIRS.length)]
const skinOf = (i: number, seed: number) => Math.floor(rnd(i, seed, 23) ** 1.5 * 4)

// A royal bedchamber at night: the queen sitting up in a canopied bed with her newborn, a cradle by the fire.
const birth: Scene = {
  draw(p, seed) {
    const bed = BANNERS[seed % 4]
    // Panelled walls below, a warm plaster wall with a hanging above.
    ashlar(p, 0, 0, W, 74, WARM_STONE, 7, (x, y) => 2.2 - y * 0.012 + (x < 128 ? 0 : 0) - Math.abs(x - 128) * 0.004)
    for (let y = 74; y < 98; y++) for (let x = 0; x < W; x++) {
      const panel = x % 24
      const edge = panel === 0 || y === 74 || y === 97 || panel === 23
      p.set(x, y, tone(WOOD, edge ? 1.4 : 2.6 - (panel === 1 || y === 75 ? -0.6 : 0) + Math.sin(x * 0.6) * 0.2, x, y))
    }
    // A rug on wooden boards.
    for (let y = 98; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, tone(WOOD, 2.2 + ((x + (y >> 2) * 7) % 20 === 0 ? -1 : 0) + (y - 98) * 0.03, x, y))
    p.poly([60, 104, 196, 104, 222, 127, 34, 127], (x, y) => {
      const edge = y < 106 || y > 125 || Math.abs((x - 128) / ((y - 104) * 1.17 + 68)) > 0.94
      if (edge) return (x + y) % 2 ? GOLD[2] : C(0x5a1a1a)
      return tone(ramp(0x3a0e14, 0x6a1a22, 0x8a2a2a), 1.4 + Math.sin(x * 0.4) * Math.sin(y * 0.8) * 0.6, x, y)
    })
    // The window: a night sky and the moon.
    p.rect(14, 14, 32, 46, STONE[3])
    for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
      if (inArch(x, y, 30, 16, 12, 58)) p.set(x, y, tone(ramp(0x070a1e, 0x0e1430, 0x18204a, 0x26306a), (y - 16) / 42 * 3, x, y))
    }
    p.disc(36, 28, 4, 4, (x, y) => tone(ramp(0xa8acc0, 0xd8d8e0, 0xf6f4ec), 2 - (x - 36) * 0.3, x, y))
    for (let y = 16; y < 59; y++) p.set(30, y, STONE[2])
    for (let x = 18; x < 43; x++) p.set(x, 40, STONE[2])
    p.rect(14, 58, 34, 3, STONE[4])
    // The fireplace.
    p.rect(194, 46, 50, 6, STONE[4])
    p.rect(196, 52, 46, 46, (x, y) => tone(STONE, 3 - (x - 196) * 0.03 + ((y - 52) % 7 === 0 ? -0.8 : 0), x, y))
    for (let y = 60; y < 98; y++) for (let x = 204; x < 234; x++) {
      if (y > 64 || Math.hypot(x + 0.5 - 219, (y - 66) * 1.6) < 15) p.set(x, y, tone(ramp(0x080608, 0x140c0a, 0x24140c), 1 + (y - 60) * 0.02, x, y))
    }
    p.rect(206, 92, 26, 3, WOOD[2])
    // The bed: four posts, a canopy with a gold fringe, curtains drawn back.
    const bx0 = 56
    const bx1 = 150
    p.rect(bx0, 14, bx1 - bx0, 8, (x, y) => tone(bed, 2.4 - (y - 14) * 0.15 + Math.sin(x * 0.5) * 0.3, x, y))
    for (let x = bx0; x < bx1; x++) if (x % 2 === 0) p.set(x, 22, GOLD[3]), p.set(x, 23, GOLD[1])
    for (const px of [bx0, bx1 - 3]) p.rect(px, 22, 3, 82, (x, y) => tone(WOOD, x === px ? 4 : x === px + 1 ? 3 : 1.6, x, y))
    // Curtains hanging at the posts, tied back.
    for (const [cx, side] of [[bx0 + 3, 1], [bx1 - 3, -1]] as const) {
      p.poly([cx, 22, cx + side * 14, 22, cx + side * 3, 60, cx + side * 8, 98, cx, 98], (x, y) => tone(bed, 1.8 + Math.sin((x - cx) * 1.2 + y * 0.03) * 0.6, x, y))
      p.rect(Math.min(cx, cx + side * 6), 58, 6, 2, GOLD[3])
    }
    // Headboard, pillows, coverlet.
    p.rect(bx0 + 3, 50, 18, 46, (x, y) => tone(WOOD, 2.6 - (y - 50) * 0.01 + (x === bx0 + 3 ? 1 : 0), x, y))
    p.rect(bx0 + 3, 48, 18, 3, GOLD[3])
    for (const [px0, py0] of [[bx0 + 22, 68], [bx0 + 25, 75]]) {
      p.poly([px0, py0, px0 + 12, py0 + 1, px0 + 13, py0 + 6, px0 + 1, py0 + 7], (x, y) => tone(LINEN, 3 - (x - px0) * 0.08 - (y - py0) * 0.25, x, y))
    }
    // The queen sits up against the pillows, her baby in her arms.
    fig(p, bx0 + 36, 95, { robe: ROYAL[(seed + 4) % 6], f: 1, pose: 'baby', head: 'tiara', long: true, hair: HAIRS[(seed + 2) % 6], skin: seed % 2, sit: true, h: 36 })
    p.poly([bx0 + 21, 82, bx1 - 3, 80, bx1 + 1, 102, bx0 + 21, 102], (x, y) => {
      const edge = y > 99
      return edge ? GOLD[(x & 1) ? 3 : 2] : tone(bed, 2.4 - (y - 80) * 0.03 + Math.sin(x * 0.3 + y * 0.2) * 0.4 + (y < 83 ? 0.8 : 0), x, y)
    })
    p.rect(bx0 + 21, 82, bx1 - bx0 - 24, 2, LINEN[3])
    // A side table with candles.
    p.rect(164, 84, 18, 3, WOOD[3])
    p.rect(166, 87, 2, 14, WOOD[1])
    p.rect(178, 87, 2, 14, WOOD[1])
    candle(p, 168, 84, 6)
    candle(p, 175, 84, 8)
    // The nursemaid by the cradle.
    fig(p, 236, 116, { robe: ramp(0x2a2a44, 0x3e3e62, 0x565882, 0x7274a0), f: -1, pose: 'hold', head: 'wimple', skin: 1, dress: true })
    p.rect(232, 98, 7, 12, LINEN[2])
    vignette(p, 0.9)
    // Warm light over the whole room.
    for (let i = 0; i < p.px.length; i++) p.px[i] = mix(p.px[i], C(0xffa040), 0.07)
  },
  fx(p, t) {
    // Stars at the window.
    for (let i = 0; i < 6; i++) {
      const x = 20 + Math.floor(rnd(i, 1, 9) * 20)
      const y = 18 + Math.floor(rnd(i, 2, 9) * 16)
      if (inArch(x, y, 30, 16, 12, 58) && x !== 30 && noise(t * 2, i, 5) > 0.45) p.set(x, y, C(0xf0f0ff))
    }
    // The hearth fire.
    for (let x = 208; x < 231; x++) {
      const h = 6 + noise(x * 0.4, t * 5, 3) * 14 * (1 - Math.abs(x - 219.5) / 13)
      for (let k = 0; k < h; k++) p.set(x, 91 - k, tone(FIRE, 5 - (k / h) * 4 + noise(x, t * 8 + k, 2) * 0.8, x, 91 - k))
    }
    glow(p, 219, 82, 46, C(0xff9030), 0.28 + noise(t * 4, 2) * 0.08)
    // The cradle, rocking gently.
    const tilt = Math.sin(t * 1.6) * 0.08
    const cx = 198
    const cy = 112
    shadow(p, cx + 2, 121, 20, 2, 0.4)
    for (let x = cx - 18; x <= cx + 18; x++) {
      const dy = (x - cx) * tilt
      // Rockers.
      const ry = Math.round(cy + 8 + ((x - cx) / 18) ** 2 * -3 + dy)
      p.set(x, ry, WOOD[2])
      p.set(x, ry + 1, WOOD[1])
    }
    for (let x = cx - 15; x <= cx + 15; x++) {
      const dy = Math.round((x - cx) * tilt)
      for (let y = cy - 6; y <= cy + 5; y++) {
        const edge = y === cy - 6
        p.set(x, y + dy, edge ? GOLD[(x & 1) ? 4 : 2] : tone(WOOD, 3.4 - (y - cy + 6) * 0.15 - (x === cx + 15 ? 1.4 : 0) + ((x - cx) % 6 === 0 ? -0.7 : 0), x, y))
      }
    }
    // Its hood and the blanket inside, a tiny face peeping out.
    for (let x = cx + 5; x <= cx + 16; x++) {
      const dy = Math.round((x - cx) * tilt)
      const top = Math.round(cy - 6 - Math.sqrt(Math.max(0, 1 - ((x - cx - 16) / 11) ** 2)) * 10)
      for (let y = top; y < cy - 6; y++) p.set(x, y + dy, tone(BANNERS[1], 2.6 - (x - cx - 5) * 0.12 - (y - top) * 0.05, x, y))
    }
    for (let x = cx - 13; x <= cx + 5; x++) {
      const dy = Math.round((x - cx) * tilt)
      p.set(x, cy - 7 + dy, LINEN[x < cx - 6 ? 3 : 2])
      p.set(x, cy - 8 + dy, x > cx - 4 ? LINEN[3] : BANNERS[1][2])
    }
    const fdy = Math.round(3 * tilt)
    p.rect(cx + 2, cy - 10 + fdy, 3, 2, SKIN[0][3])
    // Candlelight.
    flame(p, 168, 77, t, 1)
    flame(p, 175, 75, t, 2)
  },
}

// A royal funeral in a dim nave: the crowned dead on a bier under a banner, candles, mourners.
const death: Scene = {
  draw(p, seed) {
    // Deep stone, lit faintly from the windows of the apse.
    ashlar(p, 0, 0, W, 92, STONE, 3, (x, y) => 1.4 - Math.abs(x - 128) * 0.006 - y * 0.004, 16, 8)
    for (let i = 0; i < 3; i++) lancet(p, 104 + i * 24, 10, 7, 66, seed + i, 0.55, false)
    // The vault ribs above.
    for (let x = 0; x < W; x++) {
      const y = Math.round(10 - Math.cos((x / W) * Math.PI * 2) * 6)
      for (let k = 0; k < y; k++) p.set(x, k, tone(STONE, 0.6 + k * 0.05, x, k))
    }
    // The floor.
    tiles(p, 92, 128, 40, STONE, ramp(0x101014, 0x1a1a20, 0x26262e, 0x34343e, 0x46464e), (x, y) => 1.8 - Math.abs(x - 128) * 0.008 + (y - 92) * 0.01)
    // Columns marching down the nave.
    for (const [x, w] of [[24, 14], [232, 14], [70, 9], [186, 9]] as const) pillar(p, x, w, 0, 96 + (w > 10 ? 18 : 6), STONE, w > 10 ? 0.75 : 0.6)
    // The cold light from the apse.
    shaft(p, [100, 20, 156, 20, 176, 104, 80, 104], C(0x8aa0d8), 0.18, 20, 104)
    // The bier: a stepped platform under a black pall with a gold border.
    p.rect(66, 96, 124, 6, (x, y) => tone(STONE, 3 - (y - 96) * 0.2, x, y))
    p.rect(74, 82, 108, 14, (x, y) => {
      const border = y === 83 || y === 93
      return border ? GOLD[(x & 1) ? 3 : 2] : tone(ramp(0x060608, 0x101016, 0x1c1c24, 0x2a2a34), 1.8 - (x - 128) * 0.008 + Math.sin(x * 0.5) * 0.3, x, y)
    })
    // A gold cross embroidered on the pall.
    p.rect(126, 85, 3, 8, GOLD[3])
    p.rect(122, 87, 11, 2, GOLD[3])
    // The dead king under his own banner, crowned, hands folded.
    const R = BANNERS[seed % 4]
    // The pillow, then his head in profile, face up: brow, nose and grey beard along the top, the crown at its crown.
    p.disc(91, 79, 9, 3.5, (x, y) => tone(GOLD, 2.6 - (x - 91) * 0.08 - (y - 79) * 0.35, x, y))
    for (const x of [82, 100]) p.set(x, 81, GOLD[3])
    const pale = ramp(0x6a5a54, 0x9a8a80, 0xc0b2a6, 0xdcd0c4)
    for (const [x, y] of [[93, 75], [93, 76], [94, 77], [93, 77], [94, 78]]) p.set(x, y, GREY[2])
    p.disc(97, 76, 4.5, 4, (x, y) => tone(pale, 2.8 - (y - 76) * 0.45 - (x - 97) * 0.1, x, y))
    p.set(98, 71, pale[3])
    p.set(99, 71, pale[2])
    p.set(96, 74, pale[0])
    p.set(97, 74, pale[0])
    for (const [x, y] of [[100, 73], [101, 73], [101, 74], [102, 74], [102, 75], [103, 75], [100, 74], [101, 75]]) p.set(x, y, GREY[(x + y) % 2 ? 3 : 2])
    for (let y = 71; y <= 79; y++) {
      p.set(92, y, GOLD[3])
      p.set(93, y, GOLD[2])
    }
    for (const y of [71, 75, 79]) {
      p.set(91, y, GOLD[4])
      p.set(90, y, GOLD[3])
    }
    p.set(92, 75, RUBY)
    // The body under the banner of his house, the shoulders and feet rising under it.
    p.poly([102, 74, 110, 71, 168, 72, 176, 78, 176, 82, 102, 82], (x, y) => {
      const edge = y >= 81
      return edge ? GOLD[(x & 1) ? 3 : 2] : tone(R, 2.8 - (y - 71) * 0.22 + Math.sin(x * 0.4) * 0.25, x, y)
    })
    p.disc(170, 72, 3, 3, (x, y) => tone(R, 3 - (y - 70) * 0.3, x, y))
    // His sword laid on him, the hands folded on the hilt.
    p.line(120, 72, 160, 72, STONE[5])
    p.line(120, 73, 160, 73, STONE[3])
    p.rect(118, 70, 1, 5, GOLD[3])
    p.rect(113, 72, 5, 1, GOLD[2])
    p.rect(114, 71, 3, 1, pale[3])
    p.rect(114, 70, 2, 1, pale[2])
    banner(p, 128 - 9, 30, 18, 0, R, seed + 1, 0, 0)
    // Mourners in black: heads bowed, some kneeling.
    const people: [number, number, -1 | 1, boolean, Headwear][] = [
      [20, 120, 1, false, 'hood'], [38, 118, 1, false, 'veil'], [52, 122, 1, true, 'hood'],
      [206, 122, -1, true, 'veil'], [222, 118, -1, false, 'hood'], [240, 121, -1, false, 'veil'],
    ]
    people.forEach(([x, y, f, kneel, head], i) => fig(p, x, y, { robe: ramp(0x101014, 0x1c1c24, 0x2c2c38, 0x40404e), f, kneel, bow: true, pose: 'pray', head, veil: ramp(0x101014, 0x1e1e26, 0x30303c, 0x464654), skin: skinOf(i, seed), hair: hairOf(i, seed), h: 30 + (i % 3) }))
    vignette(p, 1.1)
  },
  fx(p, t, seed) {
    // The banner hanging over the bier.
    banner(p, 128 - 9, 30, 18, 26, BANNERS[seed % 4], seed + 1, t * 0.5, 0)
    // Four tall candles at the corners of the bier.
    for (const [x, y, h, i] of [[70, 106, 30, 0], [184, 106, 30, 1], [84, 96, 26, 2], [170, 96, 26, 3]] as const) {
      stand(p, x, y, h, true)
      flame(p, x, y - h - 5, t, i + 3, 1, 0.42)
    }
    // Dust drifting down through the light.
    for (let i = 0; i < 14; i++) {
      const x = 100 + rnd(i, 1, 4) * 60 + Math.sin(t * 0.6 + i) * 3
      const y = 20 + (((t * 3 + rnd(i, 2, 4) * 80) % 80))
      if (noise(t * 2, i, 7) > 0.4) p.tint(x + (y - 20) * 0.2, y, C(0xc8d0f0), 0.6)
    }
  },
}

// A throne hall: light through the rose window, banners, a young ruler crowned by a bishop before the court.
const coronation: Scene = {
  draw(p, seed) {
    ashlar(p, 0, 0, W, 78, WARM_STONE, 5, (x, y) => 2.6 - Math.abs(x - 128) * 0.008 - y * 0.006)
    rose(p, 128, 24, 17, seed)
    for (const cx of [60, 196]) lancet(p, cx, 16, 6, 60, seed + cx, 0.9)
    // The floor and the red carpet to the dais.
    tiles(p, 78, 128, 30, WARM_STONE, ramp(0x1a1410, 0x2a2018, 0x3e3024, 0x564432, 0x6e5a44), (_, y) => 2.2 + (y - 78) * 0.015)
    p.poly([116, 86, 140, 86, 176, 128, 80, 128], (x, y) => {
      const half = 12 + (y - 86) * 0.86
      const edge = Math.abs(x + 0.5 - 128) > half - 2
      return edge ? GOLD[(y & 1) ? 3 : 2] : tone(ROYAL[0], 2.4 - Math.abs(x - 128) * 0.02 + (y - 86) * 0.01, x, y)
    })
    // The dais steps.
    for (let i = 0; i < 3; i++) p.rect(92 - i * 6, 80 + i * 3, 72 + i * 12, 3, (x, y) => tone(WARM_STONE, (y === 80 + i * 3 ? 4.2 : 2.6) - Math.abs(x - 128) * 0.01, x, y))
    // The throne: a tall gilt back with a red cushion.
    p.rect(116, 42, 24, 38, (x, y) => tone(GOLD, 3.2 - (x - 116) * 0.08 - (y - 42) * 0.01, x, y))
    p.rect(119, 46, 18, 30, (x, y) => tone(ROYAL[0], 2.4 - (x - 119) * 0.06, x, y))
    for (const [x, y] of [[116, 40], [128, 37], [139, 40]] as const) p.disc(x, y, 2, 2, (xx, yy) => tone(GOLD, 4 - (xx - x) * 0.6, xx, yy))
    p.rect(112, 62, 4, 18, GOLD[2])
    p.rect(140, 62, 4, 18, GOLD[1])
    // The young ruler, seated, in a mantle.
    const crowned = fig(p, 128, 82, { robe: ramp(0x8a8478, 0xc8c0ae, 0xeee6d2, 0xfff8ec), mantle: BANNERS[(seed + 1) % 4], f: 0, sit: true, h: 28, pose: 'hold', hair: HAIRS[(seed + 3) % 6], skin: seed % 3 })
    void crowned
    // The bishop beside the throne, lifting the crown.
    fig(p, 108, 84, { robe: ramp(0x9a9488, 0xd0c8b6, 0xf0e8d4, 0xfffaee), f: 1, pose: 'raise', head: 'mitre', beard: true, hair: WHITE_HAIR, skin: 0, chain: true, h: 32 })
    // A cardinal with the sceptre on the other side.
    fig(p, 152, 83, { robe: ROYAL[0], f: -1, pose: 'hold', head: 'cap', hair: GREY, h: 30 })
    p.line(150, 60, 147, 70, GOLD[3])
    p.set(150, 59, GOLD[4])
    // Courtiers lining the carpet; guards by the dais.
    const left: [number, number][] = [[18, 120], [40, 116], [62, 112], [10, 108], [30, 104]]
    const right: [number, number][] = [[238, 120], [216, 116], [194, 112], [246, 108], [226, 104]]
    const all = [...left.map(([x, y]) => [x, y, 1] as const), ...right.map(([x, y]) => [x, y, -1] as const)].sort((a, b) => a[1] - b[1])
    all.forEach(([x, y, f], i) => {
      const female = rnd(i, seed, 30) < 0.45
      fig(p, x, y, { robe: courtier(i, seed), f, dress: female, head: female ? (i % 2 ? 'veil' : 'circlet') : i % 3 === 0 ? 'cap' : 'none', long: female, hair: hairOf(i, seed), skin: skinOf(i, seed), beard: !female && rnd(i, seed, 31) < 0.5, h: 28 + (y > 112 ? 3 : 0) })
    })
    vignette(p, 0.7)
  },
  fx(p, t, seed) {
    // Coloured light from the rose window falling on the throne.
    shaft(p, [114, 30, 142, 30, 160, 92, 96, 92], C(0xffe0a0), 0.14 + Math.sin(t * 0.8) * 0.03, 30, 92)
    for (const [x, i] of [[40, 0], [80, 1], [176, 2], [216, 3]] as const) banner(p, x - 7, 8, 14, 30, BANNERS[(seed + i) % BANNERS.length], seed + i, t, i)
    // The crown, held above the ruler's head, glinting.
    const cx = 127
    const cy = 52 + Math.round(Math.sin(t * 1.2) * 0.6)
    for (let x = cx - 4; x <= cx + 4; x++) {
      p.set(x, cy, GOLD[x < cx ? 4 : 3])
      p.set(x, cy + 1, GOLD[x < cx ? 3 : 2])
    }
    for (const x of [cx - 4, cx - 2, cx, cx + 2, cx + 4]) p.set(x, cy - 1, GOLD[4])
    for (const x of [cx - 4, cx, cx + 4]) p.set(x, cy - 2, GOLD[x === cx ? 5 : 3])
    p.set(cx, cy, RUBY)
    p.set(cx - 3, cy, SAPPHIRE)
    p.set(cx + 3, cy, EMERALD)
    const g = (t * 0.7) % 3
    if (g < 0.5) {
      const gx = cx - 4 + Math.round(g * 16)
      p.set(gx, cy - 3, C(0xffffff))
      p.set(gx - 1, cy - 2, C(0xfff4c8))
      p.set(gx + 1, cy - 2, C(0xfff4c8))
    }
    // Motes in the sunbeam.
    for (let i = 0; i < 12; i++) {
      const y = 34 + ((t * 4 + rnd(i, 1, 6) * 56) % 56)
      const x = 108 + rnd(i, 2, 6) * 36 + (y - 34) * 0.2 + Math.sin(t + i) * 2
      p.tint(x, y, C(0xfff0c0), 0.7)
    }
  },
}

// A regency council: robed councillors round a table of maps; the crown rests on a cushion; the throne stands empty.
const council: Scene = {
  draw(p, seed) {
    // Dark oak panelling all round, a tapestry map on the wall.
    for (let y = 0; y < 90; y++) for (let x = 0; x < W; x++) {
      const panel = x % 32
      const rail = y % 30
      const edge = panel < 2 || rail < 2
      p.set(x, y, tone(WOOD, (edge ? 3.2 : 2.0) + (panel === 2 || rail === 2 ? -0.8 : 0) + Math.sin(x * 0.7 + y * 0.05) * 0.2 - y * 0.004, x, y))
    }
    // The empty throne under a cloth of estate.
    p.rect(108, 6, 40, 4, GOLD[3])
    p.rect(110, 10, 36, 60, (x, y) => tone(BANNERS[seed % 4], 2 + Math.sin((x - 110) * 0.7) * 0.4, x, y))
    for (let x = 110; x < 146; x += 2) p.set(x, 10, GOLD[4])
    p.rect(118, 34, 20, 40, (x, y) => tone(GOLD, 3 - (x - 118) * 0.08, x, y))
    p.rect(121, 38, 14, 28, (x, y) => tone(ROYAL[0], 2 - (x - 121) * 0.05, x, y))
    p.rect(115, 58, 3, 16, GOLD[2])
    p.rect(138, 58, 3, 16, GOLD[1])
    for (let i = 0; i < 2; i++) p.rect(104 - i * 6, 74 + i * 3, 48 + i * 12, 3, (x, y) => tone(STONE, y % 3 === 2 ? 4 : 2.6, x, y))
    // A map of the realm hung on the left wall, a window on the right.
    p.rect(20, 14, 52, 38, GOLD[1])
    p.rect(22, 16, 48, 34, (x, y) => {
      const coast = noise(x * 0.12, y * 0.12, seed + 4)
      const river = Math.abs(noise(x * 0.06, y * 0.2, seed + 5) - 0.5) < 0.03
      if (river) return C(0x5a7a9a)
      return coast > 0.48 ? tone(ramp(0x8a7a50, 0xb8a874, 0xd8c896), 1.6 + coast, x, y) : tone(ramp(0x4a6a7a, 0x6a8a96), 1, x, y)
    })
    lancet(p, 214, 12, 10, 64, seed, 0.7, true)
    // The floor.
    tiles(p, 90, 128, 50, STONE, WARM_STONE, (_, y) => 1.6 + (y - 90) * 0.02)
    // Councillors standing behind the table, in dark robes with chains.
    const behind: [number, -1 | 0 | 1][] = [[66, 1], [92, 0], [164, 0], [190, -1]]
    behind.forEach(([x, f], i) => {
      const female = rnd(i, seed, 40) < 0.3
      fig(p, x, 97, { robe: DARK[(i + seed) % 4], f, pose: i === 1 ? 'gesture' : 'stand', head: female ? 'wimple' : i % 2 ? 'cap' : 'none', hair: i === 2 ? WHITE_HAIR : hairOf(i, seed), beard: !female && i !== 0, chain: true, skin: skinOf(i, seed), dress: female, h: 32, bald: i === 3 })
    })
    // The table: a long top in perspective, a green cloth, maps and a candle.
    p.poly([46, 84, 210, 84, 224, 98, 32, 98], (x, y) => tone(ramp(0x0e2a1c, 0x1a3e28, 0x285a36, 0x3a7244), 2.2 - Math.abs(x - 128) * 0.008 + (y - 84) * 0.04, x, y))
    p.rect(32, 98, 192, 4, (x, y) => tone(WOOD, y === 98 ? 4 : 2, x, y))
    for (const lx of [40, 214]) p.rect(lx, 102, 4, 20, (x, y) => tone(WOOD, x === lx ? 3.5 : 2, x, y))
    for (const [x, y, w, h, a] of [[58, 87, 26, 9, 0], [92, 89, 18, 7, 1], [160, 86, 24, 10, 2], [190, 89, 16, 7, 3]] as const) {
      p.rect(x, y, w, h, (xx, yy) => tone(ramp(0x8a7448, 0xb8a06c, 0xd8c48e, 0xf0e0b0), 2.4 - (yy - y) * 0.1 + (noise(xx * 0.4, yy * 0.4, a) - 0.5), xx, yy))
      // Inked rivers and roads.
      for (let i = 0; i < w - 4; i++) p.set(x + 2 + i, y + 2 + Math.round(noise(i * 0.3, a, 9) * (h - 4)), C(0x5a4630))
    }
    // The crown on a red cushion, gold tassels at its corners.
    p.disc(128, 90, 11, 4, (x, y) => tone(ROYAL[0], 2.8 - (x - 128) * 0.08 - (y - 90) * 0.3, x, y))
    for (const x of [117, 139]) p.set(x, 92, GOLD[4]), p.set(x, 93, GOLD[2])
    for (let x = 122; x <= 133; x++) {
      p.set(x, 86, GOLD[x < 128 ? 4 : 3])
      p.set(x, 87, GOLD[x < 128 ? 3 : 2])
    }
    for (const x of [122, 125, 128, 131, 133]) p.set(x, 85, GOLD[4])
    for (const x of [122, 128, 133]) p.set(x, 84, GOLD[x === 128 ? 5 : 3])
    p.set(127, 86, RUBY)
    p.set(124, 87, SAPPHIRE)
    p.set(131, 87, EMERALD)
    candle(p, 106, 90, 7)
    candle(p, 150, 89, 6)
    // A councillor at each end of the table, seated, facing in.
    fig(p, 20, 120, { robe: DARK[(seed + 2) % 4], f: 1, sit: true, pose: 'hold', head: 'cap', chain: true, beard: true, hair: GREY, h: 32 })
    fig(p, 236, 120, { robe: DARK[(seed + 1) % 4], f: -1, sit: true, pose: 'hold', head: rnd(seed, 41) < 0.5 ? 'wimple' : 'none', chain: true, hair: hairOf(9, seed), dress: true, h: 32 })
    vignette(p, 1)
  },
  fx(p, t) {
    flame(p, 106, 83, t, 1, 1, 0.4)
    flame(p, 150, 83, t, 2, 1, 0.4)
    // The councillor speaking points at the map.
    const fr = Math.floor(t * 1.5) % 2
    void fr
  },
}

// A coming of age: the young royal kneels; the king lays the flat of his sword on their shoulder before the court.
const ofAge: Scene = {
  draw(p, seed) {
    ashlar(p, 0, 0, W, 80, STONE, 9, (x, y) => 2.4 - y * 0.008 + (x < 128 ? 0.3 : 0))
    for (const cx of [36, 92, 164, 220]) lancet(p, cx, 10, 7, 56, seed + cx, 0.85)
    for (const x of [64, 192]) pillar(p, x, 10, 0, 84, STONE, 0.9)
    tiles(p, 80, 128, 26, STONE, ramp(0x2a221c, 0x3e3228, 0x544434, 0x6a5844, 0x847058), (_, y) => 2.4 + (y - 80) * 0.012)
    // The court looking on, behind and to either side.
    const back: [number, number, -1 | 1][] = [[24, 100, 1], [44, 98, 1], [212, 98, -1], [232, 100, -1], [12, 112, 1], [244, 112, -1]]
    back.forEach(([x, y, f], i) => {
      const female = rnd(i, seed, 50) < 0.45
      fig(p, x, y, { robe: courtier(i + 3, seed), f, dress: female, head: female ? 'veil' : i % 3 === 0 ? 'cap' : 'none', long: female, hair: hairOf(i + 3, seed), skin: skinOf(i, seed), beard: !female && i % 2 === 0, h: 30 })
    })
    // A herald with a trumpet.
    fig(p, 70, 112, { robe: BANNERS[(seed + 1) % 4], f: 1, pose: 'trumpet', head: 'cap', hair: hairOf(20, seed), h: 30 })
    // The queen beside the king.
    fig(p, 182, 112, { robe: BANNERS[(seed + 2) % 4], f: -1, dress: true, head: 'crown', long: true, hair: hairOf(21, seed), skin: skinOf(21, seed), mantle: BANNERS[(seed + 3) % 4], pose: 'hold', h: 31 })
    // The king, his sword reaching out.
    fig(p, 152, 118, { robe: ramp(0x8a8478, 0xc8c0ae, 0xeee6d2, 0xfff8ec), mantle: BANNERS[seed % 4], f: -1, head: 'crown', beard: true, hair: hairOf(22, seed), skin: skinOf(22, seed), pose: 'reach', hand: [9, 2], h: 34 })
    // The youth kneeling, facing the king.
    fig(p, 118, 120, { robe: BANNERS[(seed + 1) % 4], f: 1, kneel: true, pose: 'pray', head: 'circlet', hair: hairOf(23, seed), skin: skinOf(22, seed), long: rnd(seed, 51) < 0.4, h: 28 })
    vignette(p, 0.8)
  },
  fx(p, t, seed) {
    // Banners between the windows.
    for (const [x, i] of [[64, 0], [128, 1], [192, 2]] as const) banner(p, x - 6, 4, 12, 22, BANNERS[(seed + i) % 4], seed + i, t, i)
    // The sword: from the king's hand down to the youth's shoulder, a glint running along it.
    const hx = 142
    const hy = 94
    const tx = 123
    const ty = 106
    p.line(hx, hy, tx, ty, STONE[5])
    p.line(hx, hy + 1, tx, ty + 1, STONE[3])
    p.line(hx + 1, hy - 2, hx + 1, hy + 3, GOLD[3])
    p.set(hx + 2, hy, GOLD[4])
    const g = (t * 0.6) % 2
    if (g < 1) {
      const gx = Math.round(hx + (tx - hx) * g)
      const gy = Math.round(hy + (ty - hy) * g)
      p.set(gx, gy, C(0xffffff))
      p.tint(gx, gy - 1, C(0xffffff), 0.5)
      p.tint(gx, gy + 1, C(0xffffff), 0.5)
    }
  },
}

// A royal wedding in a chapel: the couple at the altar, a priest, guests in the pews, petals falling.
const wedding: Scene = {
  draw(p, seed) {
    ashlar(p, 0, 0, W, 84, WARM_STONE, 11, (x, y) => 2.8 - Math.abs(x - 128) * 0.01 - y * 0.006)
    for (let i = 0; i < 3; i++) lancet(p, 104 + i * 24, i === 1 ? 6 : 14, 8, 62, seed + i * 7, 1, i === 1)
    for (const x of [32, 224]) pillar(p, x, 12, 0, 92, WARM_STONE, 0.95)
    // Garlands draped between the pillars.
    for (let x = 38; x <= 218; x++) {
      const y = Math.round(18 + Math.sin(((x - 38) / 60) * Math.PI) ** 2 * 10 * (1 - 0) + 0)
      if ((x - 38) % 60 !== 0) {
        p.set(x, y, LEAF_G[(x % 3) + 1])
        if (x % 5 === 0) p.set(x, y + 1, x % 10 ? C(0xf0a0b8) : C(0xfff4f4))
      }
    }
    tiles(p, 84, 128, 30, WARM_STONE, ramp(0x2a221c, 0x3e3228, 0x544434, 0x6a5844, 0x847058), (_, y) => 2.4 + (y - 84) * 0.012)
    // The altar: a step, a white cloth, a gold cross and candlesticks.
    p.rect(98, 82, 60, 4, (x, y) => tone(WARM_STONE, y === 82 ? 4.4 : 2.8, x, y))
    p.rect(108, 66, 40, 16, (x, y) => tone(LINEN, 2.8 - (x - 108) * 0.03 + (y > 72 && (x - 108) % 8 === 0 ? -0.8 : 0), x, y))
    p.rect(108, 66, 40, 2, GOLD[3])
    p.rect(127, 52, 2, 14, GOLD[3])
    p.rect(123, 56, 10, 2, GOLD[3])
    p.set(127, 52, GOLD[5])
    for (const x of [112, 143]) {
      p.rect(x - 1, 64, 4, 2, GOLD[2])
      p.rect(x, 60, 2, 4, GOLD[3])
      candle(p, x, 60, 6)
    }
    // The priest behind the altar.
    fig(p, 128, 76, { robe: ramp(0x9a9488, 0xd0c8b6, 0xf0e8d4, 0xfffaee), f: 0, pose: 'raise', beard: true, hair: GREY, h: 26, chain: true })
    p.rect(108, 66, 40, 2, GOLD[3])
    p.rect(108, 68, 40, 14, (x, y) => tone(LINEN, 2.8 - (x - 108) * 0.03 + (y > 72 && (x - 108) % 8 === 0 ? -0.8 : 0), x, y))
    p.rect(125, 70, 6, 8, (x, y) => tone(ROYAL[0], 2.4 - (x - 125) * 0.2, x, y))
    p.rect(127, 72, 2, 4, GOLD[3])
    // The groom and the bride, hand in hand.
    fig(p, 116, 104, { robe: ROYAL[(seed + 1) % 4], mantle: BANNERS[seed % 4], f: 1, head: 'crown', hair: hairOf(1, seed), skin: skinOf(1, seed), beard: rnd(seed, 60) < 0.6, pose: 'reach', hand: [6, 8], h: 32 })
    fig(p, 140, 104, { robe: ramp(0xa8a49a, 0xd8d4ca, 0xf0ece2, 0xfffcf6), f: -1, dress: true, head: 'veil', veil: ramp(0xb8b4ac, 0xe0dcd4, 0xf4f0ea, 0xffffff), hair: hairOf(2, seed), skin: skinOf(2, seed), pose: 'reach', hand: [6, 8], h: 30 })
    p.disc(140, 98, 1.2, 1.2, GOLD[4])
    // The bride's train on the floor, and her circlet over the veil.
    p.poly([142, 100, 150, 104, 168, 108, 160, 110, 140, 106], (x, y) => tone(LINEN, 3.2 - (y - 100) * 0.1, x, y))
    for (let x = 137; x <= 142; x++) p.set(x, 73, GOLD[x < 140 ? 4 : 3])
    // Guests in the pews, seen from behind.
    for (const [x0, x1] of [[0, 104], [152, 256]] as const) {
      for (let row = 0; row < 3; row++) {
        const y = 104 + row * 9
        for (let x = x0 + 6 + row * 2; x < x1 - 6; x += 15) {
          const i = x * 3 + row
          fig(p, x + Math.round(rnd(i, seed, 61) * 4), y, { robe: courtier(i, seed), f: 0, back: true, hair: hairOf(i, seed), head: rnd(i, seed, 62) < 0.3 ? 'veil' : rnd(i, seed, 63) < 0.2 ? 'cap' : 'none', veil: courtier(i + 1, seed), h: 24, long: rnd(i, seed, 64) < 0.4 })
        }
        p.rect(x0 + 2, y - 4, x1 - x0 - 4, 4, (x, yy) => tone(WOOD, yy === y - 4 ? 4 : 2.2, x, yy))
        // A posy on the pew end by the aisle.
        const ex = x0 === 0 ? x1 - 6 : x0 + 4
        p.disc(ex, y - 6, 2, 2, (x, yy) => ((x + yy) % 2 ? C(0xf0a0b8) : C(0xfff4f4)))
      }
    }
    vignette(p, 0.6)
  },
  fx(p, t) {
    for (const x of [112, 143]) flame(p, x, 53, t, x, 1, 0.3)
    shaft(p, [118, 20, 138, 20, 150, 104, 106, 104], C(0xfff0d0), 0.12 + Math.sin(t * 0.6) * 0.03, 20, 104)
    // Petals drifting down, turning as they fall.
    const PETAL = [C(0xf6a8c0), C(0xfff2f4), C(0xe87a98), C(0xffd8e2)]
    for (let i = 0; i < 26; i++) {
      const speed = 6 + rnd(i, 3, 8) * 6
      const y = ((t * speed + rnd(i, 1, 8) * 140) % 140) - 10
      const x = 40 + rnd(i, 2, 8) * 176 + Math.sin(t * 1.3 + i * 1.7) * 5
      const c = PETAL[i % PETAL.length]
      p.set(x, y, c)
      if (Math.sin(t * 3 + i) > 0) p.set(x + 1, y, mix(c, C(0xa04060), 0.3))
      else p.set(x, y + 1, mix(c, C(0xa04060), 0.3))
    }
  },
}

const LEAF_G = ramp(0x173d2c, 0x235a33, 0x35793a, 0x529a42, 0x7fba50)

const SCENES = { birth, death, coronation, council, ofAge, wedding }

// The still layers, painted once per kind and seed.
const stills = new Map<string, Uint32Array>()
function still(kind: string, scene: Scene, seed: number) {
  const key = `${kind}|${seed}`
  let px = stills.get(key)
  if (!px) {
    px = new Uint32Array(W * H).fill(C(0x000000))
    scene.draw(new Paint(px, W, H), seed)
    stills.set(key, px)
  }
  return px
}

// The picture for a dynastic event: 256 × 128 art pixels, scaled up crisply to the width it is given (2 : 1).
export function DynastyArt({ kind, seed }: { kind: 'birth' | 'death' | 'coronation' | 'council' | 'ofAge' | 'wedding'; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const s = Math.abs(Math.floor(seed ?? 0))
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const scene: Scene = SCENES[kind] ?? birth
    const base = still(kind, scene, s)
    const image = ctx.createImageData(W, H)
    const out = new Uint32Array(image.data.buffer)
    const p = new Paint(out, W, H)
    const draw = (t: number) => {
      out.set(base)
      scene.fx?.(p, t, s)
      ctx.putImageData(image, 0, 0)
    }
    draw(0)
    if (!scene.fx || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // About ten frames a second, in keeping with pixel art.
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
  }, [kind, s])
  return <canvas ref={ref} width={W} height={H} aria-hidden style={{ display: 'block', width: '100%', aspectRatio: '2 / 1', imageRendering: 'pixelated' }} />
}
