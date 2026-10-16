import { TILE_HEIGHT, TILE_WIDTH, hash } from '@game/shared'
import type { Point } from '@game/shared'
import { BAYER, Canvas, ramp, rgb } from './sprites'
import type { Sprite } from './sprites'

// A small kit for drawing buildings as models (CLAUDE.md §4.2.1): a depth-tested painter over a footprint, its faces
// lit from the upper left and dithered between the tones of each material, with the solids for the building's shadow
// recorded as it goes. Model space: u runs along the tile x axis (toward the lower right on screen), v along the tile
// y axis (toward the lower left), z up; one unit is one screen pixel across (a tile is 32 units a side), and the
// origin is the footprint's back corner.

// ---- Materials -----------------------------------------------------------------------------------------------------

export const LIME = ramp(0x4a4038, 0x6a5e52, 0x8c8072, 0xaea292, 0xccc2b0, 0xe4dccb)
export const GRANITE = ramp(0x2e2e38, 0x44444f, 0x5c5c68, 0x777782, 0x92929c, 0xb2b2ba)
export const BASALT = ramp(0x1a1820, 0x26242e, 0x34323e, 0x46434f, 0x5a5664, 0x726e7c)
export const SANDSTONE = ramp(0x5a3e26, 0x7e5a38, 0xa07a4c, 0xbe9a64, 0xd6b47e, 0xe8cc9c)
export const PLASTER = ramp(0x7c6c56, 0x9a8a70, 0xb8a88a, 0xd2c4a4, 0xe6dabe, 0xf4ecd8)
export const WHITEWASH = ramp(0x8a8a86, 0xaaa8a0, 0xc8c4b8, 0xdedad0, 0xeeebe2, 0xfaf8f0)
export const OAK = ramp(0x1e140e, 0x2e1e14, 0x422c1c, 0x583c26, 0x6e4e32, 0x86643e)
export const BOARDS = ramp(0x2e2014, 0x4a321e, 0x664628, 0x825c34, 0x9c7442, 0xb48c56)
export const GREY_BOARDS = ramp(0x2a2826, 0x403c38, 0x58524a, 0x706858, 0x8a806c, 0xa49a84)
export const LOGWOOD = ramp(0x2a1a10, 0x40281a, 0x5a3c24, 0x765030, 0x92683e, 0xa8804e)
export const CLAY_TILE = ramp(0x40140e, 0x641e16, 0x8a2e1e, 0xae4228, 0xc85c36, 0xe07e4e)
export const SLATE_TILE = ramp(0x161a24, 0x222a38, 0x313b4e, 0x435066, 0x5a6880, 0x76869c)
export const THATCH_ROOF = ramp(0x3e2c14, 0x5c4420, 0x7e602c, 0xa07e3a, 0xc29c4c, 0xdcb864)
export const SHINGLE_ROOF = ramp(0x2a2018, 0x3e3024, 0x564434, 0x6e5a44, 0x887258, 0xa08a6c)
export const MOSS_ROOF = ramp(0x1e2a14, 0x2e3e1c, 0x425626, 0x587030, 0x70883c, 0x8aa04c)
export const LEAD = ramp(0x2a2e34, 0x3c4048, 0x50565e, 0x666e76, 0x80888e, 0x9aa2a6)
export const COPPER = ramp(0x173832, 0x22504a, 0x30685e, 0x448876, 0x5ea88e, 0x84c6aa)
export const GOLD = ramp(0x5a3e10, 0x86601a, 0xb08a2a, 0xd6b040, 0xf0d266, 0xfff0a8)
export const IRON = ramp(0x121418, 0x1e2228, 0x2e333a, 0x464c56, 0x666e7a, 0x9aa2ae)
export const STEEL = ramp(0x30343c, 0x50565e, 0x767c86, 0x9aa2ac, 0xc4cad2, 0xeef2f6)
export const SOIL = ramp(0x2c1e12, 0x3e2a18, 0x52381f, 0x664828, 0x7a5a34, 0x8e6c42)
export const GRASS = ramp(0x1e3a18, 0x2c5020, 0x3e6a2a, 0x528434, 0x6a9c40, 0x88b452)
export const STRAW = ramp(0x5a4416, 0x7e6220, 0xa0822e, 0xc2a23e, 0xdcc056, 0xf0da7a)
export const CLOTH_RED = ramp(0x3e0c10, 0x621418, 0x8a1e22, 0xb02c2c, 0xd0463a, 0xe8705a)
export const CLOTH_BLUE = ramp(0x101a3a, 0x1a2a5a, 0x263c7c, 0x34529e, 0x4a6cbc, 0x6e8ed6)
export const CLOTH_GREEN = ramp(0x0e2616, 0x163a20, 0x22522c, 0x2e6c38, 0x428a48, 0x62a65e)
export const CLOTH_CREAM = ramp(0x6a604c, 0x8a806a, 0xaaa088, 0xc8bea4, 0xe0d8c0, 0xf2ecda)
export const CLOTH_PURPLE = ramp(0x1e0e2a, 0x30163e, 0x462058, 0x5e2c74, 0x7a3e90, 0x9a5aac)
export const CLOTH_BLACK = ramp(0x0c0c10, 0x16161c, 0x22222a, 0x30303a, 0x40404c, 0x55556a)
export const SKIN = ramp(0x4a2e1e, 0x6b4630, 0x93633f, 0xb88458, 0xd8a678, 0xecc49a)
export const FIRE = ramp(0x5a140a, 0x9a2a10, 0xe0641c, 0xffb040, 0xffe080, 0xfff6c8)
export const WATER = ramp(0x163a5a, 0x1e4e74, 0x2a6a92, 0x4a8cb0, 0x8ac4dc, 0xd8eef4)
export const LEAVES = ramp(0x10261a, 0x1a3a22, 0x285430, 0x3a6e3a, 0x528a46, 0x74a656)
export const CUT_END = ramp(0xa47e4a, 0xc8a46a, 0xe2c48a)
export const BLOOM =[rgb(0xd84a5a), rgb(0xf0c040), rgb(0xe8e8f0), rgb(0xb070d0), rgb(0xf08a3a)]
// Window glass: dark by day with a glint of sky, lit at night (sprites.ts → lightsOf turns these to lamplight).
export const PANE = ramp(0x151b2a, 0x222e48, 0x34466a, 0x8aa6c4)
export const NIGHT_LIT = new Set<number>(PANE)

// ---- Shading -------------------------------------------------------------------------------------------------------

const L = [-0.35, 1, 1.25]
const LN = Math.hypot(L[0], L[1], L[2])
// How lit a surface with normal (u, v, z) is: about 0.6 for a wall facing the lower left, -0.2 for one facing the
// lower right, 0.76 for a flat top.
export function lum(nu: number, nv: number, nz: number) {
  const n = Math.hypot(nu, nv, nz) || 1
  return (L[0] * nu + L[1] * nv + L[2] * nz) / (LN * n)
}
export const FRONT = lum(0, 1, 0)
export const SIDE = lum(1, 0, 0)
export const TOP = lum(0, 0, 1)

const clampI = (r: Uint32Array, i: number) => r[Math.max(0, Math.min(r.length - 1, i))]
// A tone of a ramp, dithered between its two neighbouring colours (ordered dither on the screen pixel).
export function dith(r: Uint32Array, tone: number, x: number, y: number) {
  const i = Math.floor(tone)
  const f = tone - i
  return clampI(r, f > BAYER[(Math.round(x) & 3) + ((Math.round(y) & 3) << 2)] ? i + 1 : i)
}
// The tone a lit amount maps to on a ramp of `n` colours: shade at the bottom, light at the top.
export const toneOf = (n: number, l: number, spread = 2.7) => ((n - 1) / 5) * (1.75 + l * spread)

export type Paint = (s: number, t: number, x: number, y: number) => number

// ---- The model -----------------------------------------------------------------------------------------------------

export class Model {
  readonly canvas: Canvas
  readonly ox: number
  readonly oy: number
  near: Float32Array
  constructor(canvas: Canvas, ox: number, oy: number) {
    this.canvas = canvas
    this.ox = ox
    this.oy = oy
    this.near = new Float32Array(canvas.width * canvas.height).fill(-1e9)
  }
  sx(u: number, v: number) {
    return this.ox + u - v
  }
  sy(u: number, v: number, z: number) {
    return this.oy + (u + v) / 2 - z
  }
  // The ground row under (u, v), for solids.
  g(u: number, v: number) {
    return this.oy + (u + v) / 2
  }
  put(u: number, v: number, z: number, color: number, bias = 0) {
    if (color === 0) return
    const x = Math.round(this.ox + u - v)
    const y = Math.round(this.oy + (u + v) / 2 - z)
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return
    const i = y * this.canvas.width + x
    const d = u + v + z + bias
    if (d < this.near[i]) return
    this.near[i] = d
    this.canvas.set(x, y, color)
  }
  // Whether something of the model already covers (x, y) nearer than depth d.
  covered(x: number, y: number, d: number) {
    return this.near[y * this.canvas.width + x] > d
  }
  // A solid of the shape (for the shadow) over a rectangle of the ground.
  solidBox(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number) {
    const p = (u: number, v: number) => [this.sx(u, v), this.g(u, v)]
    this.canvas.solid([...p(u0, v0), ...p(u1, v0), ...p(u1, v1), ...p(u0, v1)], z0, z1)
  }
  solidPyramid(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number) {
    const p = (u: number, v: number) => [this.sx(u, v), this.g(u, v)]
    const cu = (u0 + u1) / 2
    const cv = (v0 + v1) / 2
    this.canvas.solid([...p(u0, v0), ...p(u1, v0), ...p(u1, v1), ...p(u0, v1)], z0, z1, [this.sx(cu, cv), this.g(cu, cv)])
  }
  solidRound(cu: number, cv: number, r: number, z0: number, z1: number, cone = false) {
    const pts: number[] = []
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      pts.push(this.sx(cu + Math.cos(a) * r, cv + Math.sin(a) * r), this.g(cu + Math.cos(a) * r, cv + Math.sin(a) * r))
    }
    this.canvas.solid(pts, z0, z1, cone ? [this.sx(cu, cv), this.g(cu, cv)] : undefined)
  }

  // A vertical face facing the lower left (+v), at v, from u0 to u1; s = u - u0. Its top may vary along it.
  front(u0: number, u1: number, v: number, z0: number, top: number | ((s: number) => number), paint: Paint, bias = 0) {
    for (let s = 0; s <= u1 - u0 + 1e-6; s += 0.5) {
      const zt = typeof top === 'number' ? top : top(s)
      for (let z = z0; z <= zt + 1e-6; z += 0.5) {
        const u = u0 + s
        this.put(u, v, z, paint(s, z, this.sx(u, v), this.sy(u, v, z)), bias)
      }
    }
  }
  // A vertical face facing the lower right (+u), at u, from v0 to v1; s = v - v0.
  side(v0: number, v1: number, u: number, z0: number, top: number | ((s: number) => number), paint: Paint, bias = 0) {
    for (let s = 0; s <= v1 - v0 + 1e-6; s += 0.5) {
      const zt = typeof top === 'number' ? top : top(s)
      for (let z = z0; z <= zt + 1e-6; z += 0.5) {
        const v = v0 + s
        this.put(u, v, z, paint(s, z, this.sx(u, v), this.sy(u, v, z)), bias)
      }
    }
  }
  // A flat top at height z over a rectangle; paint(u, v).
  flat(u0: number, v0: number, u1: number, v1: number, z: number, paint: Paint, bias = 0) {
    for (let u = u0; u <= u1 + 1e-6; u += 0.5) for (let v = v0; v <= v1 + 1e-6; v += 0.5) this.put(u, v, z, paint(u, v, this.sx(u, v), this.sy(u, v, z)), bias)
  }
  // A box: its lit front (+v), its shaded side (+u) and its top, each with its own paint.
  box(u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, p: { front: Paint; side: Paint; top?: Paint }, solid = true) {
    this.front(u0, u1, v1, z0, z1, p.front)
    this.side(v0, v1, u1, z0, z1, p.side)
    if (p.top) this.flat(u0, v0, u1, v1, z1, p.top)
    if (solid) this.solidBox(u0, v0, u1, v1, z0, z1)
  }
  // A surface given by its height over a rectangle (a roof): z(u, v) and the paint for each point, with its normal.
  // Steep parts are drawn down to their neighbours' height, so they leave no holes on screen.
  surface(u0: number, v0: number, u1: number, v1: number, height: (u: number, v: number) => number | null, paint: (u: number, v: number, z: number, x: number, y: number) => number, bias = 0) {
    for (let u = u0; u <= u1 + 1e-6; u += 0.5) {
      for (let v = v0; v <= v1 + 1e-6; v += 0.5) {
        const z = height(u, v)
        if (z === null) continue
        const zu = height(u + 0.5, v) ?? z
        const zv = height(u, v + 0.5) ?? z
        const low = Math.min(z, zu, zv)
        const c = paint(u, v, z, this.sx(u, v), this.sy(u, v, z))
        for (let zz = z; zz >= low - 0.01; zz -= 0.5) this.put(u, v, zz, c, bias)
      }
    }
  }
  // A cylinder standing on (cu, cv); paint(angle, z, lit, x, y). Only its near half is drawn.
  cylinder(cu: number, cv: number, r: number, z0: number, z1: number, paint: (a: number, z: number, l: number, x: number, y: number) => number, solid = true) {
    const n = Math.max(16, Math.ceil(Math.PI * 2 * r * 2.2))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      if (c + s < -0.5) continue
      const l = lum(c, s, 0)
      for (let z = z0; z <= z1 + 1e-6; z += 0.5) {
        const u = cu + c * r
        const v = cv + s * r
        this.put(u, v, z, paint(a, z, l, this.sx(u, v), this.sy(u, v, z)))
      }
    }
    if (solid) this.solidRound(cu, cv, r, z0, z1)
  }
  // A disc at height z (the top of a tower, a barrel's lid).
  disc(cu: number, cv: number, r: number, z: number, paint: (u: number, v: number, x: number, y: number) => number) {
    for (let u = -r; u <= r; u += 0.5) for (let v = -r; v <= r; v += 0.5) if (u * u + v * v <= r * r) this.put(cu + u, cv + v, z, paint(u, v, this.sx(cu + u, cv + v), this.sy(cu + u, cv + v, z)))
  }
  // A cone (a tower's roof): from radius r at z0 to its tip `tall` above.
  cone(cu: number, cv: number, r: number, z0: number, tall: number, paint: (a: number, f: number, l: number, x: number, y: number) => number, solid = true, bulge = 0) {
    const n = Math.max(16, Math.ceil(Math.PI * 2 * r * 2.2))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      if (c + s < -0.9) continue
      const steps = Math.ceil(Math.max(r, tall) * 2.2)
      for (let k = 0; k <= steps; k++) {
        const f = k / steps
        // A bulge for an onion or a bell-shaped roof.
        const rr = r * (1 - f) * (1 + bulge * Math.sin(f * Math.PI))
        const l = lum(c * tall, s * tall, r * (1 + bulge))
        const u = cu + c * rr
        const v = cv + s * rr
        const z = z0 + f * tall
        this.put(u, v, z, paint(a, f, l, this.sx(u, v), this.sy(u, v, z)))
      }
    }
    if (solid) this.solidRound(cu, cv, r, z0, z0 + tall, true)
  }
  // A ball (a dome's half, a haystack, a heap of sacks); `squash` flattens it.
  ball(cu: number, cv: number, cz: number, r: number, paint: (l: number, x: number, y: number, nz: number) => number, squash = 1, upper = false) {
    for (let a = -r; a <= r; a += 0.5) {
      for (let b = -r; b <= r; b += 0.5) {
        const d = a * a + b * b
        if (d > r * r) continue
        const h = Math.sqrt(r * r - d)
        for (const sign of upper ? [1] : [1, -1]) {
          const nz = (sign * h) / r
          const z = cz + sign * h * squash
          const l = lum(a / r, b / r, nz)
          this.put(cu + a, cv + b, z, paint(l, this.sx(cu + a, cv + b), this.sy(cu + a, cv + b, z), nz))
        }
      }
    }
  }
  // A line between two model points.
  line(a: [number, number, number], b: [number, number, number], color: number | ((f: number) => number), bias = 0) {
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2) + 1
    for (let i = 0; i <= n; i++) {
      const f = i / n
      this.put(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, typeof color === 'number' ? color : color(f), bias)
    }
  }
  // A picture standing upright, facing the viewer, its foot at (u, v, z): pixel (dx, dz) of it is drawn dx pixels
  // across and dz up from there. For figures, flags and signs.
  card(u: number, v: number, z: number, draw: (set: (dx: number, dz: number, color: number) => void) => void, bias = 0) {
    draw((dx, dz, color) => this.put(u + dx / 2, v - dx / 2, z + dz, color, bias))
  }
}

// ---- Footprints ----------------------------------------------------------------------------------------------------

// A canvas for a footprint of `tiles` with room above, and the model over it (origin at the back corner).
export function plot(tiles: number, above: number) {
  const w = (tiles * TILE_WIDTH) / 2
  const h = (tiles * TILE_HEIGHT) / 2
  const canvas = new Canvas(w * 2 + 8, h * 2 + above + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 2
  const m = new Model(canvas, cx, base - h * 2)
  return { canvas, cx, base, w, h, m, N: tiles * 32 }
}

// ---- Wall and roof paints ------------------------------------------------------------------------------------------

export interface WallLight {
  // How lit the face is (FRONT, SIDE…).
  l: number
  // Height of the eaves above it: the strip just below is in the roof's shade.
  eave?: number
  seed?: number
}
const lit = (o: WallLight, z: number) => o.l - (o.eave !== undefined && z > o.eave - 2.5 ? 0.45 : 0) - (z < 1.5 ? 0.3 : 0)

// Dressed stone in courses of blocks of uneven length, each block a little lighter or darker, light on its top edge.
export function ashlar(r: Uint32Array, o: WallLight, course = 4, block = 7): Paint {
  const seed = o.seed ?? 1
  return (s, z, x, y) => {
    const k = Math.floor(z / course)
    const shift = hash(k, 3, seed) * block
    const j = Math.floor((s + shift) / block)
    const inBlock = (s + shift) - j * block
    const zIn = z - k * course
    let t = toneOf(r.length, lit(o, z)) + (hash(j, k, seed) - 0.5) * 0.9
    if (zIn < 0.6 || inBlock < 0.6) t -= 1.3
    else if (zIn > course - 1.1) t += 0.6
    return dith(r, t, x, y)
  }
}
// Rough fieldstone: rounded stones of many sizes in dark mortar.
export function rubble(r: Uint32Array, o: WallLight): Paint {
  const seed = o.seed ?? 2
  return (s, z, x, y) => {
    const k = Math.floor(z / 3.2)
    const shift = hash(k, 1, seed) * 5
    const j = Math.floor((s + shift) / (4 + hash(k, 2, seed) * 3))
    const fs = ((s + shift) / (4 + hash(k, 2, seed) * 3)) % 1
    const fz = (z / 3.2) % 1
    let t = toneOf(r.length, lit(o, z)) + (hash(j, k, seed + 5) - 0.5) * 1.2 + (0.5 - fz) * 0.8
    if (fz < 0.18 || fs < 0.1) t -= 1.6
    return dith(r, t, x, y)
  }
}
// Smooth plaster with a little mottling.
export function plaster(r: Uint32Array, o: WallLight): Paint {
  const seed = o.seed ?? 3
  return (s, z, x, y) => dith(r, toneOf(r.length, lit(o, z)) + (hash(Math.floor(s / 3), Math.floor(z / 3), seed) - 0.5) * 0.5 + (z < 4 ? -0.4 : 0), x, y)
}
// Upright boards.
export function boards(r: Uint32Array, o: WallLight, width = 3): Paint {
  const seed = o.seed ?? 4
  return (s, z, x, y) => {
    const j = Math.floor(s / width)
    let t = toneOf(r.length, lit(o, z)) + (hash(j, 1, seed) - 0.5) * 0.9
    if (s - j * width < 0.6) t -= 1.4
    if (hash(j, Math.floor(z / 5), seed + 2) > 0.93) t -= 0.7
    return dith(r, t, x, y)
  }
}
// Horizontal logs, each rounded (light on top, dark below) with chinking between.
export function logs(r: Uint32Array, o: WallLight, size = 4): Paint {
  const seed = o.seed ?? 5
  return (s, z, x, y) => {
    const k = Math.floor(z / size)
    const f = (z - k * size) / size
    let t = toneOf(r.length, lit(o, z)) + (f - 0.4) * 1.8 + (hash(k, Math.floor(s / 9), seed) - 0.5) * 0.5
    if (f < 0.12) t -= 1.2
    return dith(r, t, x, y)
  }
}
// A timber frame over plaster: posts every `bay`, a sill, a rail at mid-height and a beam at the top, with braces in
// some bays. `wall` is its height.
export function framed(plasterR: Uint32Array, timber: Uint32Array, o: WallLight, length: number, wall: number, bay = 10, braces = true): Paint {
  const fill = plaster(plasterR, o)
  const seed = o.seed ?? 6
  const bays = Math.max(1, Math.round(length / bay))
  const b = length / bays
  return (s, z, x, y) => {
    const j = Math.min(bays - 1, Math.floor(s / b))
    const fs = s - j * b
    const post = fs < 1.5 || s > length - 1.5
    const rail = Math.abs(z - wall * 0.5) < 0.8
    const sill = z < 1.6 || z > wall - 1.6
    let brace = false
    if (braces && hash(j, 1, seed) > 0.45) {
      const dir = hash(j, 2, seed) > 0.5
      const fz = z < wall * 0.5 ? z / (wall * 0.5) : (z - wall * 0.5) / (wall * 0.5)
      const fx = fs / b
      brace = Math.abs((dir ? fx : 1 - fx) - fz) < 1.4 / b
    }
    if (post || rail || sill || brace) return dith(timber, toneOf(timber.length, lit(o, z)) + (hash(j, Math.floor(z), seed) - 0.5) * 0.4, x, y)
    return fill(s, z, x, y)
  }
}

export type RoofKind = 'tile' | 'slate' | 'thatch' | 'shingle' | 'lead' | 'cloth'
// A roof's covering at a point: `along` runs with the eaves, `down` is the distance down the slope from the ridge.
export function covering(kind: RoofKind, r: Uint32Array, l: number, along: number, down: number, x: number, y: number, seed = 7) {
  const t0 = toneOf(r.length, l, 2.8)
  switch (kind) {
    case 'tile': {
      // Clay tiles: rows of half-round channels, each row's lower edge in shade.
      const row = Math.floor(down / 3)
      const f = down / 3 - row
      const ch = ((along + (row & 1) * 1.5) % 3) / 3
      return dith(r, t0 + (ch < 0.34 ? 0.7 : ch > 0.75 ? -0.6 : 0) + (f > 0.72 ? -0.9 : 0) + (hash(Math.floor(along / 3), row, seed) - 0.5) * 0.5, x, y)
    }
    case 'slate': {
      const row = Math.floor(down / 2.5)
      const f = down / 2.5 - row
      const j = Math.floor((along + (row & 1) * 2.5) / 5)
      return dith(r, t0 + (f > 0.7 ? -0.8 : f < 0.25 ? 0.3 : 0) + (hash(j, row, seed) - 0.5) * 0.9 + ((along + (row & 1) * 2.5) % 5 < 0.6 ? -0.7 : 0), x, y)
    }
    case 'shingle': {
      const row = Math.floor(down / 3)
      const f = down / 3 - row
      const j = Math.floor((along + hash(row, 1, seed) * 4) / 3.5)
      return dith(r, t0 + (f > 0.75 ? -0.9 : 0) + (hash(j, row, seed) - 0.5) * 1.1, x, y)
    }
    case 'thatch': {
      // Straw in streaks running down the slope, in thick layers.
      const streak = hash(Math.floor(along * 1.5), Math.floor(down / 6), seed) - 0.5
      const layer = (down % 6) / 6
      return dith(r, t0 + streak * 1.4 + (layer > 0.85 ? -0.8 : 0) + (hash(Math.floor(along), Math.floor(down * 2), seed + 1) > 0.9 ? 0.8 : 0), x, y)
    }
    case 'lead': {
      const seam = along % 6 < 0.7
      return dith(r, t0 + (seam ? 0.8 : 0) + (hash(Math.floor(along / 6), Math.floor(down / 8), seed) - 0.5) * 0.3, x, y)
    }
    case 'cloth': {
      const stripe = Math.floor(along / 5) & 1
      return dith(r, t0 + (stripe ? 0.9 : -0.3), x, y)
    }
  }
}

export interface RoofStyle {
  kind: RoofKind
  r: Uint32Array
  // A second colour for alternate stripes of a cloth roof.
  r2?: Uint32Array
  seed?: number
  // Ridge and hip capping.
  cap?: number
  // Moss patches over it.
  moss?: number
}

// A gable roof over a rectangle at eave height z, its ridge `rise` above, along `axis`; `oh` overhang past the walls.
// `end` paints the gable wall at the visible end (+u for a ridge along u, +v for one along v).
export function gable(m: Model, u0: number, v0: number, u1: number, v1: number, z: number, rise: number, axis: 'u' | 'v', oh: number, roof: RoofStyle, end?: Paint) {
  const across0 = axis === 'u' ? v0 : u0
  const across1 = axis === 'u' ? v1 : u1
  const mid = (across0 + across1) / 2
  const half = (across1 - across0) / 2
  const slope = rise / half
  const heightAt = (u: number, v: number) => {
    const c = axis === 'u' ? v : u
    return z + rise - Math.abs(c - mid) * slope
  }
  // The gable wall at the visible end, up to the roof.
  if (end) {
    if (axis === 'u') m.side(v0, v1, u1, z, (s) => z + rise - Math.abs(v0 + s - mid) * slope - 0.5, end)
    else m.front(u0, u1, v1, z, (s) => z + rise - Math.abs(u0 + s - mid) * slope - 0.5, end)
  }
  const nl = (c: number) => (axis === 'u' ? lum(0, Math.sign(c - mid) * slope, 1) : lum(Math.sign(c - mid) * slope, 0, 1))
  const moss = roof.moss ?? 0
  m.surface(u0 - oh, v0 - oh, u1 + oh, v1 + oh, heightAt, (u, v, _zz, x, y) => {
    const c = axis === 'u' ? v : u
    const along = axis === 'u' ? u : v
    const down = Math.abs(c - mid) * Math.hypot(1, slope)
    const l = nl(c)
    // The verge (barge boards) at the two ends and the eave's edge.
    const a0 = (axis === 'u' ? u0 : v0) - oh
    const a1 = (axis === 'u' ? u1 : v1) + oh
    if (along > a1 - 0.6 || along < a0 + 0.6) return dith(roof.r, toneOf(roof.r.length, l) - 1.4, x, y)
    if (Math.abs(c - mid) > half + oh - 0.6) return dith(roof.r, toneOf(roof.r.length, l) - 1.6, x, y)
    if (down < 1.2 && roof.cap !== undefined) return roof.cap
    if (moss > 0 && hash(Math.floor(along / 2), Math.floor(down / 2), (roof.seed ?? 1) + 40) < moss) return dith(MOSS_ROOF, toneOf(6, l) - 0.4, x, y)
    if (roof.kind === 'cloth' && roof.r2 && Math.floor(along / 5) & 1) return dith(roof.r2, toneOf(roof.r2.length, l, 2.8), x, y)
    return covering(roof.kind, roof.r, l, along, down, x, y, roof.seed)
  })
  // The verge boards' thickness under the visible end.
  const vl = axis === 'u' ? SIDE : FRONT
  for (let c = across0 - oh; c <= across1 + oh; c += 0.5) {
    const zz = z + rise - Math.abs(c - mid) * slope
    const color = dith(roof.r, toneOf(roof.r.length, vl) - 1.5, 0, 0)
    if (axis === 'u') { m.put(u1 + oh, c, zz - 0.5, color); m.put(u1 + oh, c, zz - 1, color) }
    else { m.put(c, v1 + oh, zz - 0.5, color); m.put(c, v1 + oh, zz - 1, color) }
  }
  if (axis === 'u') {
    m.solidBox(u0 - oh, v0 - oh, u1 + oh, v1 + oh, z - 1, z + rise * 0.5)
    m.solidBox(u0 - oh, mid - half * 0.45, u1 + oh, mid + half * 0.45, z + rise * 0.5, z + rise * 0.95)
  } else {
    m.solidBox(u0 - oh, v0 - oh, u1 + oh, v1 + oh, z - 1, z + rise * 0.5)
    m.solidBox(mid - half * 0.45, v0 - oh, mid + half * 0.45, v1 + oh, z + rise * 0.5, z + rise * 0.95)
  }
  return { mid, ridge: z + rise, heightAt }
}

// A hip roof: four slopes rising to a ridge (or a point over a square).
export function hip(m: Model, u0: number, v0: number, u1: number, v1: number, z: number, rise: number, oh: number, roof: RoofStyle) {
  const cu = (u0 + u1) / 2
  const cv = (v0 + v1) / 2
  const hu = (u1 - u0) / 2
  const hv = (v1 - v0) / 2
  const short = Math.min(hu, hv)
  const slope = rise / short
  const heightAt = (u: number, v: number) => z + slope * Math.min(hu - Math.abs(u - cu), hv - Math.abs(v - cv))
  const moss = roof.moss ?? 0
  m.surface(u0 - oh, v0 - oh, u1 + oh, v1 + oh, heightAt, (u, v, zz, x, y) => {
    const du = hu - Math.abs(u - cu)
    const dv = hv - Math.abs(v - cv)
    const onU = du < dv
    const l = onU ? lum(Math.sign(u - cu) * slope, 0, 1) : lum(0, Math.sign(v - cv) * slope, 1)
    const along = onU ? v : u
    const down = (rise - (zz - z)) * Math.hypot(1, 1 / slope)
    if (Math.min(du, dv) < -oh + 0.6) return dith(roof.r, toneOf(roof.r.length, l) - 1.6, x, y)
    // The hips: where two slopes meet.
    if (Math.abs(du - dv) < 0.7 || down < 1) return roof.cap ?? dith(roof.r, toneOf(roof.r.length, l) + 0.9, x, y)
    if (moss > 0 && hash(Math.floor(along / 2), Math.floor(down / 2), (roof.seed ?? 1) + 40) < moss) return dith(MOSS_ROOF, toneOf(6, l) - 0.4, x, y)
    return covering(roof.kind, roof.r, l, along, down, x, y, roof.seed)
  })
  if (Math.abs(hu - hv) < 1) m.solidPyramid(u0 - oh, v0 - oh, u1 + oh, v1 + oh, z - 1, z + rise)
  else {
    m.solidBox(u0 - oh, v0 - oh, u1 + oh, v1 + oh, z - 1, z + rise * 0.5)
    const k = short * 0.5
    m.solidPyramid(u0 + k - oh, v0 + k - oh, u1 - k + oh, v1 - k + oh, z + rise * 0.5, z + rise)
  }
  return { cu, cv, ridge: z + rise, heightAt }
}

// A lean-to: one slope from `high` at its back edge down to `low` at its front, facing +v or +u.
export function shed(m: Model, u0: number, v0: number, u1: number, v1: number, low: number, high: number, facing: 'u' | 'v', oh: number, roof: RoofStyle) {
  const span = facing === 'v' ? v1 - v0 : u1 - u0
  const heightAt = (u: number, v: number) => high - ((facing === 'v' ? v - v0 : u - u0) / span) * (high - low)
  const slope = (high - low) / span
  const l = facing === 'v' ? lum(0, slope, 1) : lum(slope, 0, 1)
  m.surface(u0 - (facing === 'v' ? oh : 0), v0 - (facing === 'u' ? oh : 0), u1 + oh, v1 + oh, heightAt, (u, v, _zz, x, y) => {
    const along = facing === 'v' ? u : v
    const down = (facing === 'v' ? v - v0 : u - u0) * Math.hypot(1, slope)
    if ((facing === 'v' ? v : u) > (facing === 'v' ? v1 : u1) + oh - 0.6) return dith(roof.r, toneOf(roof.r.length, l) - 1.6, x, y)
    return covering(roof.kind, roof.r, l, along, down + 1, x, y, roof.seed)
  })
  m.solidBox(u0, v0, u1, v1, low, (low + high) / 2)
  return heightAt
}

// ---- Openings ------------------------------------------------------------------------------------------------------

export type Face = 'front' | 'side'
// Where a point of a wall lies: `at` is the wall's fixed coordinate (v of a front wall, u of a side wall), `a0` its
// start along it.
export function onWall(face: Face, at: number, a0: number) {
  return (s: number, z: number): [number, number, number] => (face === 'front' ? [a0 + s, at, z] : [at, a0 + s, z])
}

export interface WindowStyle {
  frame?: Uint32Array
  shutters?: Uint32Array
  arch?: boolean
  // Panes divided by a cross.
  cross?: boolean
  sill?: Uint32Array
  flowers?: boolean
  // Iron bars over it.
  bars?: boolean
  // Lit warm from inside even by day (a forge).
  glow?: boolean
}
// A window of w×h on a wall, its lower left at s along and z up.
export function window(m: Model, face: Face, at: number, a0: number, s0: number, z0: number, w: number, h: number, o: WindowStyle = {}) {
  const p = onWall(face, at, a0)
  const l = face === 'front' ? FRONT : SIDE
  const frame = o.frame ?? OAK
  const put = (s: number, z: number, c: number, bias = 0.6) => {
    const [u, v, zz] = p(s, z)
    m.put(u, v, zz, c, bias)
  }
  const top = (s: number) => (o.arch ? z0 + h - 1.5 + Math.sqrt(Math.max(0, 1 - ((s - s0 - w / 2) / (w / 2)) ** 2)) * 1.5 : z0 + h)
  for (let s = s0 - 1; s <= s0 + w + 1; s += 0.5) {
    for (let z = z0 - 1; z <= top(s) + 1; z += 0.5) {
      const edge = s < s0 || s > s0 + w || z < z0 || z > top(s)
      if (edge) {
        put(s, z, dith(frame, toneOf(frame.length, l) - 0.3 + (z < z0 ? 0.6 : 0), 0, 0))
        continue
      }
      const fs = (s - s0) / w
      const fz = (z - z0) / h
      if (o.cross && (Math.abs(fs - 0.5) < 0.5 / w * 1.2 || Math.abs(fz - 0.55) < 0.5 / h * 1.2)) {
        put(s, z, frame[Math.max(0, Math.round(toneOf(frame.length, l)) - 1)])
        continue
      }
      if (o.bars && Math.round((s - s0) * 2) % 3 === 1) {
        put(s, z, IRON[face === 'front' ? 3 : 2])
        continue
      }
      // Glass: dark, a glint of sky at its upper left.
      const glint = fs < 0.4 && fz > 0.6 && (fs + (1 - fz)) < 0.5
      put(s, z, o.glow ? FIRE[fz > 0.5 ? 3 : 2] : glint ? PANE[3] : PANE[fz > 0.5 ? 1 : face === 'front' ? 2 : 0])
    }
  }
  if (o.sill || o.flowers) {
    const sill = o.sill ?? frame
    for (let s = s0 - 1.5; s <= s0 + w + 1.5; s += 0.5) put(s, z0 - 1.5, dith(sill, toneOf(sill.length, TOP), 0, 0), 1.2)
  }
  if (o.flowers) {
    for (let s = s0 - 1; s <= s0 + w + 1; s += 0.5) {
      put(s, z0 - 2.5, BOARDS[2], 1.4)
      put(s, z0 - 3, BOARDS[3], 1.4)
      if (hash(Math.floor(s * 2), Math.floor(z0), at) > 0.35) put(s, z0 - 0.5, hash(Math.floor(s * 2), 1, at) > 0.5 ? BLOOM[Math.floor(hash(Math.floor(s), 3, at) * BLOOM.length)] : LEAVES[3], 1.6)
      if (hash(Math.floor(s * 2), 4, at) > 0.6) put(s, z0, LEAVES[4], 1.6)
    }
  }
  if (o.shutters) {
    const sh = o.shutters
    for (const side of [-1, 1]) {
      const sa = side < 0 ? s0 - 1 - w / 2 - 0.5 : s0 + w + 1.5
      for (let s = sa; s <= sa + w / 2; s += 0.5) {
        for (let z = z0; z <= z0 + h; z += 0.5) {
          const plank = Math.round((s - sa) * 2) % 3 === 0
          put(s, z, dith(sh, toneOf(sh.length, l) - (plank ? 0.8 : 0) + (Math.abs(z - z0 - h / 2) < 0.5 ? -0.8 : 0), 0, 0), 0.8)
        }
      }
    }
  }
}

export interface DoorStyle {
  wood?: Uint32Array
  frame?: Uint32Array
  arch?: boolean
  // Steps before it.
  step?: Uint32Array
  // Open: dark inside.
  open?: boolean
  iron?: boolean
}
export function door(m: Model, face: Face, at: number, a0: number, s0: number, w: number, h: number, o: DoorStyle = {}) {
  const p = onWall(face, at, a0)
  const l = face === 'front' ? FRONT : SIDE
  const wood = o.wood ?? BOARDS
  const frame = o.frame ?? OAK
  const put = (s: number, z: number, c: number, bias = 0.6) => {
    const [u, v, zz] = p(s, z)
    m.put(u, v, zz, c, bias)
  }
  const top = (s: number) => (o.arch ? h - w / 2 + Math.sqrt(Math.max(0, (w / 2) ** 2 - (s - s0 - w / 2) ** 2)) : h)
  for (let s = s0 - 1; s <= s0 + w + 1; s += 0.5) {
    for (let z = 0; z <= top(s) + 1; z += 0.5) {
      if (s < s0 || s > s0 + w || z > top(s)) {
        put(s, z, dith(frame, toneOf(frame.length, l) + 0.2, 0, 0))
        continue
      }
      if (o.open) {
        put(s, z, z > top(s) - 1 || s < s0 + 1 ? OAK[0] : OAK[1])
        continue
      }
      const plank = Math.round((s - s0) * 2) % 4 === 0
      const band = o.iron !== false && (Math.abs(z - h * 0.25) < 0.5 || Math.abs(z - h * 0.72) < 0.5) && (s - s0) < w * 0.75
      let c = dith(wood, toneOf(wood.length, l) - (plank ? 1 : 0), 0, 0)
      if (band) c = IRON[2]
      if (Math.abs(s - s0 - w * 0.78) < 0.5 && Math.abs(z - h * 0.48) < 0.6) c = GOLD[3]
      put(s, z, c)
    }
  }
  if (o.step) {
    const [u, v] = p(s0 + w / 2, 0)
    const d = 2.5
    if (face === 'front') m.box(u - w / 2 - 1.5, v, u + w / 2 + 1.5, v + d, 0, 1.5, { front: (_, __, x, y) => dith(o.step!, 1.5, x, y), side: (_, __, x, y) => dith(o.step!, 1, x, y), top: (_, __, x, y) => dith(o.step!, 3.5, x, y) }, false)
    else m.box(u, v - w / 2 - 1.5, u + d, v + w / 2 + 1.5, 0, 1.5, { front: (_, __, x, y) => dith(o.step!, 2.5, x, y), side: (_, __, x, y) => dith(o.step!, 1, x, y), top: (_, __, x, y) => dith(o.step!, 3.5, x, y) }, false)
  }
}

// A chimney of stone standing through a roof: its foot on (u, v) at z0, `tall` high; returns its top on screen.
export function chimney(m: Model, u: number, v: number, z0: number, tall: number, r: Uint32Array = LIME, size = 3) {
  m.box(u - size / 2, v - size / 2, u + size / 2, v + size / 2, z0, z0 + tall, {
    front: ashlar(r, { l: FRONT, seed: 91 }, 2.5, 3),
    side: ashlar(r, { l: SIDE, seed: 92 }, 2.5, 3),
    top: () => OAK[0],
  })
  // A capping course.
  m.box(u - size / 2 - 0.5, v - size / 2 - 0.5, u + size / 2 + 0.5, v + size / 2 + 0.5, z0 + tall - 1, z0 + tall, { front: (_, __, x, y) => dith(r, 3.5, x, y), side: (_, __, x, y) => dith(r, 1.6, x, y) }, false)
  return { x: m.sx(u, v), y: m.sy(u, v, z0 + tall), chimney: true }
}

// ---- Props ---------------------------------------------------------------------------------------------------------

export function barrel(m: Model, u: number, v: number, z = 0, tall = 7, r = 2.6) {
  m.cylinder(u, v, r, z, z + tall, (a, zz, l, x, y) => {
    const bulge = Math.sin(((zz - z) / tall) * Math.PI) * 0.6
    const hoop = Math.abs(zz - z - 1.5) < 0.6 || Math.abs(zz - z - tall + 1.5) < 0.6
    const stave = Math.round(a * 5) % 2 === 0
    return hoop ? dith(IRON, toneOf(6, l) + 0.5, x, y) : dith(BOARDS, toneOf(6, l) + bulge - (stave ? 0.4 : 0), x, y)
  }, false)
  m.disc(u, v, r - 0.3, z + tall, (a, b, x, y) => (a * a + b * b > (r - 1.2) ** 2 ? BOARDS[2] : dith(BOARDS, 3.6 + (Math.round(a) % 2 ? 0.4 : 0), x, y)))
}
export function crate(m: Model, u: number, v: number, z = 0, size = 5, wood = BOARDS) {
  const face = (l: number): Paint => (s, zz, x, y) => {
    const edge = s < 0.8 || s > size - 0.8 || zz - z < 0.8 || zz - z > size - 0.8 || Math.abs(s - (zz - z)) < 0.6
    return dith(wood, toneOf(6, l) + (edge ? -1 : 0), x, y)
  }
  m.box(u, v, u + size, v + size, z, z + size, { front: face(FRONT), side: face(SIDE), top: (a, _b, x, y) => dith(wood, toneOf(6, TOP) + ((Math.round(a * 2) % 4 === 0) ? -0.8 : 0), x, y) }, false)
}
export function sack(m: Model, u: number, v: number, z = 0, r = 2.5, cloth = CLOTH_CREAM) {
  m.ball(u, v, z + r * 0.8, r, (l, x, y) => dith(cloth, toneOf(6, l) - 0.4, x, y), 0.8)
}
// A log lying along u (or v), its cut ends showing rings.
export function log(m: Model, u: number, v: number, z: number, length: number, r: number, axis: 'u' | 'v' = 'u', bark = LOGWOOD) {
  const n = Math.ceil(Math.PI * 2 * r * 2)
  for (let a = 0; a <= length; a += 0.5) {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2
      const c = Math.cos(t) * r
      const s = Math.sin(t) * r
      const l = axis === 'u' ? lum(0, Math.cos(t), Math.sin(t)) : lum(Math.cos(t), 0, Math.sin(t))
      const color = dith(bark, toneOf(6, l) + (hash(Math.floor(a / 2), i, 13) - 0.5) * 0.8 - (Math.sin(t) < -0.4 || Math.abs(Math.cos(t)) > 0.92 ? 1.2 : 0), 0, 0)
      if (axis === 'u') m.put(u + a, v + c, z + r + s, color)
      else m.put(u + c, v + a, z + r + s, color)
    }
  }
  // The cut end facing the viewer.
  for (let a = -r; a <= r; a += 0.5) {
    for (let b = -r; b <= r; b += 0.5) {
      const d = Math.hypot(a, b) / r
      if (d > 1) continue
      const ring = Math.floor(d * 3) % 2
      // The end facing +u is in shade, the one facing +v lit.
      const color = d > 0.85 ? bark[1] : axis === 'u' ? (ring ? CUT_END[0] : CUT_END[1]) : ring ? CUT_END[1] : CUT_END[2]
      if (axis === 'u') m.put(u + length, v + a, z + r + b, color, 0.3)
      else m.put(u + a, v + length, z + r + b, color, 0.3)
    }
  }
}
// A pile of logs along u: rows from the ground up.
export function logPile(m: Model, u: number, v: number, length: number, rows: number[], r = 1.8, axis: 'u' | 'v' = 'u') {
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const off = (i + row * 0.5) * r * 2 - (rows[0] - 1) * r
      const z = row * r * 1.7
      if (axis === 'u') log(m, u, v + off, z, length, r, 'u')
      else log(m, u + off, v, z, length, r, 'v')
    }
  })
}
// A stack of sawn planks along u.
export function planks(m: Model, u: number, v: number, length: number, width: number, layers: number, wood = BOARDS) {
  for (let k = 0; k < layers; k++) {
    const z = k * 1.5
    const shift = (k % 2) * 1.5
    m.box(u + shift, v, u + shift + length, v + width, z, z + 1.2, {
      front: (s, zz, x, y) => dith(wood, toneOf(6, FRONT) + (zz - z < 0.5 ? -1 : 0) + (Math.round(s) % 7 === 0 ? -0.6 : 0), x, y),
      side: (s, _, x, y) => dith(wood, toneOf(6, SIDE) + (Math.round(s * 2) % 3 === 0 ? -1 : 0.3), x, y),
      top: (_a, b, x, y) => dith(wood, toneOf(6, TOP) - (Math.round(b * 2) % 4 === 0 ? 0.9 : 0), x, y),
    }, false)
  }
}
// A fence of posts and two rails from (u0, v0) to (u1, v1).
export function fence(m: Model, u0: number, v0: number, u1: number, v1: number, wood = GREY_BOARDS, tall = 5, every = 5) {
  const len = Math.hypot(u1 - u0, v1 - v0)
  const n = Math.max(1, Math.round(len / every))
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n
    const v = v0 + ((v1 - v0) * i) / n
    m.line([u, v, 0], [u, v, tall], (f) => wood[f > 0.9 ? 4 : 2])
    m.put(u + 0.5, v, tall * 0.5, wood[1])
  }
  for (const z of [tall * 0.45, tall * 0.85]) m.line([u0, v0, z], [u1, v1, z], wood[3])
}
export function haystack(m: Model, u: number, v: number, r = 5) {
  m.ball(u, v, 0, r, (l, x, y, nz) => dith(STRAW, toneOf(6, l) + (hash(Math.round(x), Math.round(y), 5) - 0.5) * 0.8 - (nz < 0.25 ? 0.6 : 0), x, y), 1.3, true)
  m.solidRound(u, v, r * 0.8, 0, r * 1.2, true)
}
// A bale of straw.
export function bale(m: Model, u: number, v: number, z = 0) {
  m.box(u, v, u + 6, v + 4, z, z + 3.5, {
    front: (s, _zz, x, y) => dith(STRAW, toneOf(6, FRONT) - (Math.abs(s - 1.5) < 0.4 || Math.abs(s - 4.5) < 0.4 ? 1 : 0) + (hash(Math.round(x), Math.round(y), 7) - 0.5) * 0.6, x, y),
    side: (_s, _zz, x, y) => dith(STRAW, toneOf(6, SIDE) + (hash(Math.round(x), Math.round(y), 8) - 0.5) * 0.6, x, y),
    top: (_a, _b, x, y) => dith(STRAW, toneOf(6, TOP) + (hash(Math.round(x), Math.round(y), 9) - 0.5) * 0.6, x, y),
  }, false)
}
// A two-wheeled cart along u, its shafts toward -u.
export function cart(m: Model, u: number, v: number, load: 'sacks' | 'logs' | 'hay' | 'barrels' | 'none' = 'sacks') {
  m.box(u, v, u + 12, v + 7, 3, 4.5, {
    front: (_s, _z, x, y) => dith(BOARDS, toneOf(6, FRONT) - 0.4, x, y),
    side: (_s, _z, x, y) => dith(BOARDS, toneOf(6, SIDE), x, y),
    top: (a, _b, x, y) => dith(BOARDS, toneOf(6, TOP) - (Math.round(a * 2) % 5 === 0 ? 1 : 0), x, y),
  }, false)
  // Side boards.
  m.front(u, u + 12, v + 7, 4.5, 7, (s, _z, x, y) => dith(BOARDS, toneOf(6, FRONT) - (Math.round(s) % 4 === 0 ? 1 : 0), x, y))
  m.side(v, v + 7, u + 12, 4.5, 7, (_s, _z, x, y) => dith(BOARDS, toneOf(6, SIDE), x, y))
  // The near wheel.
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    m.put(u + 6 + Math.cos(a) * 3.5, v + 7.8, 3.5 + Math.sin(a) * 3.5, OAK[1], 1)
    m.put(u + 6 + Math.cos(a) * 3, v + 7.8, 3.5 + Math.sin(a) * 3, OAK[3], 1)
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI
    m.line([u + 6 - Math.cos(a) * 3, v + 7.8, 3.5 - Math.sin(a) * 3], [u + 6 + Math.cos(a) * 3, v + 7.8, 3.5 + Math.sin(a) * 3], OAK[2], 1)
  }
  m.put(u + 6, v + 7.9, 3.5, IRON[4], 1.2)
  // Shafts resting on the ground.
  for (const dv of [1.5, 5.5]) m.line([u, v + dv, 3.5], [u - 9, v + dv, 0.5], OAK[2])
  if (load === 'sacks') for (const [a, b] of [[3, 2.5], [7, 3], [5, 5], [9.5, 4.5]]) sack(m, u + a, v + b, 5.5, 2.2)
  if (load === 'logs') for (const dv of [2, 4.5]) log(m, u - 1, v + dv, 5.5, 14, 1.4)
  if (load === 'hay') m.ball(u + 6, v + 3.5, 6, 5, (l, x, y) => dith(STRAW, toneOf(6, l) + (hash(Math.round(x), Math.round(y), 3) - 0.5), x, y), 0.7, true)
  if (load === 'barrels') for (const a of [3, 8.5]) barrel(m, u + a, v + 3.5, 5, 5, 2)
}
// A small person standing on (u, v, z) facing the viewer, `pose` for a few gestures.
export interface Figure {
  tunic: Uint32Array
  legs?: Uint32Array
  hood?: Uint32Array
  hat?: Uint32Array
  skin?: Uint32Array
  // Arm raised (0 down, 1 forward, 2 up).
  arm?: number
  // Held in the raised hand.
  tool?: 'axe' | 'hammer' | 'spear' | 'broom' | 'lute' | 'saw' | 'book' | 'none'
  apron?: Uint32Array
  crown?: boolean
  gown?: boolean
  // Seen from the back.
  back?: boolean
  // Mirrored.
  flip?: boolean
}
export function figure(m: Model, u: number, v: number, z: number, f: Figure, bias = 0.4) {
  const skin = f.skin ?? SKIN
  const legs = f.legs ?? OAK
  const sx = f.flip ? -1 : 1
  m.card(u, v, z, (set) => {
    const p = (dx: number, dz: number, c: number) => set(dx * sx, dz, c)
    // Legs (or a gown to the ground).
    for (let dz = 0; dz < 4; dz++) {
      if (f.gown) for (let dx = -2; dx <= 2; dx++) p(dx, dz, f.tunic[dx < 0 ? 4 : dx === 0 ? 3 : 2])
      else for (const dx of [-1, 1]) p(dx, dz, legs[dx < 0 ? 3 : 2])
    }
    // Body.
    for (let dz = 4; dz < 9; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && dz === 8) continue
      let c = f.tunic[dx < 0 ? 4 : dx === 0 ? 3 : 2]
      if (dz === 4 && !f.gown) c = OAK[2]
      if (f.apron && Math.abs(dx) <= 1 && dz < 8) c = f.apron[dx < 0 ? 4 : 3]
      p(dx, dz, c)
    }
    // Head.
    for (let dz = 9; dz < 12; dz++) for (let dx = -1; dx <= 1; dx++) p(dx, dz, f.back ? (f.hood ?? OAK)[2] : skin[dx < 0 ? 4 : 3])
    if (!f.back && !f.hood) p(0, 10, skin[2])
    if (f.hood) { for (let dx = -2; dx <= 2; dx++) p(dx, 12, f.hood[3]); for (const dx of [-2, 2]) for (let dz = 8; dz < 12; dz++) p(dx, dz, f.hood[dx < 0 ? 3 : 1]); p(0, 13, f.hood[2]) }
    if (f.hat) { for (let dx = -2; dx <= 2; dx++) p(dx, 12, f.hat[3]); for (let dx = -1; dx <= 1; dx++) p(dx, 13, f.hat[4]) }
    if (f.crown) { for (let dx = -1; dx <= 1; dx++) p(dx, 12, GOLD[4]); p(-1, 13, GOLD[5]); p(1, 13, GOLD[5]) }
    // The working arm, on the right.
    const arm = f.arm ?? 0
    if (arm === 0) for (let dz = 5; dz < 8; dz++) p(3, dz, f.tunic[1])
    if (arm === 1) { p(3, 7, f.tunic[1]); p(4, 7, skin[3]); p(5, 7, skin[3]) }
    if (arm === 2) { p(3, 8, f.tunic[1]); p(3, 9, f.tunic[1]); p(3, 10, skin[3]); p(3, 11, skin[3]) }
    p(-3, 6, f.tunic[3])
    p(-3, 5, skin[3])
    const hand = arm === 0 ? [3, 4] : arm === 1 ? [5, 7] : [3, 11]
    if (f.tool === 'axe') {
      const [hx, hz] = hand
      const dir = arm === 2 ? [0, 1] : arm === 1 ? [1, 0] : [0, -1]
      for (let k = 0; k < 5; k++) p(hx + dir[0] * k, hz + dir[1] * k, BOARDS[4])
      const ex = hx + dir[0] * 5
      const ez = hz + dir[1] * 5
      for (let k = -1; k <= 1; k++) { p(ex + (dir[1] ? 1 : 0) + (dir[0] ? 0 : 0), ez + (dir[0] ? k : 0), STEEL[4]); if (dir[1]) p(ex + 1, ez - 1 + k, STEEL[k === 1 ? 5 : 3]) }
    }
    if (f.tool === 'hammer') {
      const [hx, hz] = hand
      const dir = arm === 2 ? [0, 1] : arm === 1 ? [1, 0] : [0, -1]
      for (let k = 0; k < 3; k++) p(hx + dir[0] * k, hz + dir[1] * k, BOARDS[3])
      const ex = hx + dir[0] * 3
      const ez = hz + dir[1] * 3
      for (let k = -1; k <= 1; k++) p(ex + (dir[1] ? k : 0), ez + (dir[0] ? k : 0), IRON[4])
    }
    if (f.tool === 'spear') {
      for (let dz = 0; dz < 16; dz++) p(3, dz, dz > 13 ? STEEL[5] : BOARDS[3])
    }
    if (f.tool === 'lute') {
      for (let k = 0; k < 4; k++) p(1 + k, 6 + Math.round(k / 2), BOARDS[4])
      p(0, 5, BOARDS[3]); p(-1, 5, BOARDS[2]); p(0, 6, BOARDS[3])
    }
    if (f.tool === 'book') { p(2, 6, CLOTH_RED[3]); p(3, 6, CLOTH_RED[4]); p(2, 7, CLOTH_CREAM[5]) }
    if (f.tool === 'broom') for (let dz = 0; dz < 10; dz++) p(-3 - Math.floor(dz / 4), dz, dz < 3 ? STRAW[3] : BOARDS[3])
  }, bias)
}
// A pole with a flag at its top, waving with `phase` (0…1 round a cycle; the cloth ripples).
export function flagpole(m: Model, u: number, v: number, z: number, tall: number, cloth: Uint32Array, phase = 0, length = 9, high = 5, trim: number | null = GOLD[3]) {
  m.line([u, v, z], [u, v, z + tall], (f) => (f > 0.97 ? GOLD[4] : OAK[f > 0.5 ? 3 : 2]))
  m.card(u, v, z + tall - 1, (set) => {
    for (let dx = 1; dx <= length; dx++) {
      const wave = Math.sin(dx * 0.7 - phase * Math.PI * 2) * (dx / length) * 1.4
      const droop = Math.round(wave - dx * 0.08)
      for (let dz = 0; dz < high; dz++) {
        if (dx > length - 2 && (dz === 0 || dz === high - 1)) continue
        const shade = Math.cos(dx * 0.7 - phase * Math.PI * 2) > 0.3 ? 1 : Math.cos(dx * 0.7 - phase * Math.PI * 2) < -0.4 ? -1 : 0
        const c = trim !== null && dz === high - 1 ? trim : cloth[3 + shade]
        set(dx, -dz + droop, c)
      }
    }
  }, 2)
}
// Smoke points of a sprite, as `smoky` in buildingSprites records them.
export type Top = { x: number; y: number; chimney: boolean }

// ---- Ground --------------------------------------------------------------------------------------------------------

export type Ground = 'flagstone' | 'cobble' | 'dirt' | 'gravel' | 'planks' | 'grass' | 'sand'
// The ground of a plot (flat, see Canvas.paving) over a rectangle of model space, with its edge broken into the grass
// around it.
export function paveArea(m: Model, u0: number, v0: number, u1: number, v1: number, kind: Ground, seed = 1, ragged = true) {
  const c = m.canvas
  c.paving = true
  for (let u = u0; u <= u1; u += 0.5) {
    for (let v = v0; v <= v1; v += 0.5) {
      const edge = Math.min(u - u0, u1 - u, v - v0, v1 - v)
      if (ragged && edge < 2.5 && hash(Math.floor(u), Math.floor(v), seed + 9) > edge / 2.5) continue
      const x = m.sx(u, v)
      const y = m.sy(u, v, 0)
      let color: number
      switch (kind) {
        case 'flagstone': {
          const row = Math.floor(v / 5)
          const j = Math.floor((u + hash(row, 1, seed) * 6) / (5 + hash(row, 2, seed) * 3))
          const fu = ((u + hash(row, 1, seed) * 6) / (5 + hash(row, 2, seed) * 3)) % 1
          const fv = (v / 5) % 1
          const seam = fu < 0.12 || fv < 0.12
          color = dith(LIME, (seam ? 1.4 : 3) + (hash(j, row, seed) - 0.5) * 1.1, x, y)
          break
        }
        case 'cobble': {
          const fu = (u / 2.5 + (Math.floor(v / 2.5) & 1) * 0.5) % 1
          const fv = (v / 2.5) % 1
          const seam = fu < 0.2 || fv < 0.2
          color = dith(GRANITE, (seam ? 1.2 : 3.2 - fv) + (hash(Math.floor(u / 2.5), Math.floor(v / 2.5), seed) - 0.5) * 0.9, x, y)
          break
        }
        case 'gravel':
          color = dith(LIME, 2.2 + (hash(Math.round(u * 2), Math.round(v * 2), seed) - 0.5) * 2.2, x, y)
          break
        case 'planks': {
          const j = Math.floor(v / 3)
          const seam = v % 3 < 0.5 || (u + hash(j, 1, seed) * 20) % 16 < 0.5
          color = dith(BOARDS, (seam ? 1.2 : 3) + (hash(j, Math.floor(u / 16), seed) - 0.5), x, y)
          break
        }
        case 'grass':
          color = dith(GRASS, 2.6 + (hash(Math.round(u), Math.round(v), seed) - 0.5) * 1.8, x, y)
          break
        case 'sand':
          color = dith(SANDSTONE, 3 + (hash(Math.round(u), Math.round(v), seed) - 0.5) * 1.2, x, y)
          break
        default:
          color = dith(SOIL, 3.2 + (hash(Math.round(u), Math.round(v), seed) - 0.5) * 1.6 + (hash(Math.floor(u / 4), Math.floor(v / 4), seed + 1) > 0.85 ? 1.4 : 0), x, y)
      }
      m.put(u, v, 0, color, -50)
    }
  }
  c.paving = false
}

// ---- Animations ----------------------------------------------------------------------------------------------------

// Smoke rises from these points of a sprite (relative to its anchor); the map animates it.
export const CHIMNEYS = new Map<Sprite, Point[]>()
export function smoky(sprite: Sprite, tops: Top[]) {
  const points = tops.filter((t) => t.chimney).map((t) => ({ x: t.x - sprite.anchorX, y: t.y - sprite.anchorY - 1 }))
  if (points.length > 0) CHIMNEYS.set(sprite, points)
  return sprite
}

// A building that moves (crops in the wind, an axe at the block, a forge's fire): drawn by `render(frame)`, where
// frame -1 is its still look on the map (everything that moves over open sky left out, everything that moves over the
// building itself at rest) and frames 0… are the steps of its loop. The full look (frame 0) is what menus show; the
// map shows the still look with the frames laid over it, each frame only the pixels it changes.
export interface Anim {
  frames: Sprite[]
  fps: number
  // Laid on the ground under the shadows (a field's crops), not over the building.
  ground: boolean
}
interface Maker {
  render: (frame: number) => Sprite
  count: number
  fps: number
  ground: boolean
  made?: { still: Sprite; anim: Anim }
}
const makers = new WeakMap<Sprite, Maker>()
const anims = new WeakMap<Sprite, Anim>()
export function animate(render: (frame: number) => Sprite, count: number, fps: number, ground = false): Sprite {
  const full = render(0)
  makers.set(full, { render, count, fps, ground })
  return full
}
// Pixels of `frame` that differ from `still`, cropped to their box.
function diff(frame: Sprite, still: Sprite): Sprite {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  const { width, height } = frame
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const p = frame.pixels[i]
      if (p === still.pixels[i] || p >>> 24 === 0) continue
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return new Canvas(1, 1).sprite(0, 0, 0)
  const c = new Canvas(x1 - x0 + 1, y1 - y0 + 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x
      const p = frame.pixels[i]
      if (p !== still.pixels[i] && p >>> 24 !== 0) c.pixels[(y - y0) * c.width + x - x0] = p
    }
  }
  return c.sprite(frame.anchorX - x0, frame.anchorY - y0, 0)
}
// The look a building shows on the map: its still look when it moves (made when first asked for).
export function stillOf(sprite: Sprite): Sprite {
  const maker = makers.get(sprite)
  if (!maker) return sprite
  if (!maker.made) {
    const still = maker.render(-1)
    const chimneys = CHIMNEYS.get(sprite)
    if (chimneys) CHIMNEYS.set(still, chimneys)
    const frames = Array.from({ length: maker.count }, (_, k) => diff(maker.render(k), still))
    const anim = { frames, fps: maker.fps, ground: maker.ground }
    // A look whose frames change nothing (a stone tower with no fire to flicker) does not move.
    if (frames.some((f) => f.width > 1 || f.height > 1)) anims.set(still, anim)
    maker.made = { still, anim }
  }
  return maker.made.still
}
// The frames laid over a still look, if it moves.
export const animOf = (still: Sprite) => anims.get(still)
