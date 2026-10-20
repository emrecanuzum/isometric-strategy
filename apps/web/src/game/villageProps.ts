import { Feature, Terrain, hash, mulberry32, valueNoise } from '@game/shared'
import type { World } from '@game/shared'
import { BAYER, Canvas, LEAF, NO_SHADOW, SACK, STONE, ramp, rgb, shadeBlobs } from './sprites'
import { BOARDS, CLOTH_CREAM, CLOTH_RED, CUT_END as CUT_END_KIT, FRONT, IRON as IRON_KIT, LEAVES, LOGWOOD as LOGWOOD_KIT, Model, SIDE, SOIL as SOIL_KIT, STRAW as STRAW_KIT, TOP, barrel, dith, logPile, sack, toneOf } from './buildingKit'
import type { Sprite } from './sprites'
import type { Structure } from './buildingSprites'
import { WALL_KINDS } from './wallSprites'

// The small things a lordship's people leave about between its buildings (CLAUDE.md §6.4, "Köy süsleri"): kitchen
// gardens and washing lines by the houses, hay by the barns, wood stacked by the lumber camps, a well here and there,
// carts and barrels by the market, hedges along the fields, a fruit tree in a yard. Purely for the eye: they are painted
// into the ground chunks (chunkPainter.ts), never drawn on their own.

// A prop is drawn from a tiny model: points in tile space (u along x, v along y, z up in pixels) from the prop's
// origin, its front-most ground point, which is the sprite's anchor. Everything lies behind and above it, so the
// painter's depth test keeps all of it. Each pixel remembers how high it stands, so the shadow falls from where the
// prop really stands (a cart's wheel, a hedge's whole length) rather than from one point.
class PropModel {
  width: number
  height: number
  pixels: Uint32Array
  lift: Uint8Array
  depth: Float32Array
  ox: number
  oy: number
  constructor(width: number, height: number, ox: number, oy: number) {
    this.ox = ox
    this.oy = oy
    this.width = width
    this.height = height
    this.pixels = new Uint32Array(width * height)
    this.lift = new Uint8Array(width * height)
    this.depth = new Float32Array(width * height).fill(-Infinity)
  }
  sx = (u: number, v: number) => this.ox + (u - v) * 32
  sy = (u: number, v: number, z: number) => this.oy + (u + v) * 16 - z
  // Nearer the viewer: further toward the screen's bottom along the ground, and higher.
  put(u: number, v: number, z: number, colors: Uint32Array, tone: number, flat = false) {
    const x = Math.round(this.sx(u, v))
    const y = Math.round(this.sy(u, v, z))
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const o = y * this.width + x
    const d = (u + v) * 32 + z
    if (d < this.depth[o]) return
    this.depth[o] = d
    const t = Math.round(tone + (BAYER[(x & 3) | ((y & 3) << 2)] - 0.5) * 0.8)
    this.pixels[o] = colors[t < 0 ? 0 : t >= colors.length ? colors.length - 1 : t]
    this.lift[o] = flat ? NO_SHADOW : Math.max(0, Math.min(254, Math.round(z)))
  }
  // A box, lit from the upper left: its top brightest, the face toward the left (+v) lit, the one toward the right (+u)
  // in shade. `tone` is the top's; texture(u, v, z) nudges each point.
  box(u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, colors: Uint32Array, tone: number, texture: (u: number, v: number, z: number) => number = () => 0) {
    const s = 1 / 64
    for (let z = z0; z <= z1; z += 0.5) {
      for (let u = u0; u <= u1; u += s) this.put(u, v1, z, colors, tone - 1 + texture(u, v1, z))
      for (let v = v0; v <= v1; v += s) this.put(u1, v, z, colors, tone - 2.2 + texture(u1, v, z))
    }
    for (let u = u0; u <= u1; u += s) for (let v = v0; v <= v1; v += s) this.put(u, v, z1, colors, tone + texture(u, v, z1))
  }
  // An upright cylinder on (u, v), radius r tiles, lit on the left; its top a lid.
  drum(u: number, v: number, r: number, z0: number, z1: number, colors: Uint32Array, tone: number, band?: (z: number) => number) {
    for (let z = z0; z <= z1; z += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const du = Math.cos(a) * r
        const dv = Math.sin(a) * r
        // Toward the lit left (+v, -u) brighter.
        const lit = (dv - du) / (r * 1.4)
        this.put(u + du, v + dv, z, colors, tone - 1 + lit * 1.4 + (band?.(z) ?? 0))
      }
    }
    for (let du = -r; du <= r; du += 1 / 64) for (let dv = -r; dv <= r; dv += 1 / 64) if (du * du + dv * dv <= r * r) this.put(u + du, v + dv, z1, colors, tone + 0.6)
  }
  sprite(shadow = 1): Sprite {
    return { width: this.width, height: this.height, anchorX: this.ox, anchorY: this.oy, pixels: this.pixels, shadow, lift: this.lift }
  }
}

const STRAW = ramp(0x5a4318, 0x7d5f22, 0xa3812e, 0xc4a142, 0xdcbf5c, 0xeed880)
const BARK = ramp(0x3a2818, 0x54392a, 0x6e4e34, 0x8a6844, 0xa07c52)
const OAK = ramp(0x2a1c12, 0x45301e, 0x644629, 0x83603a, 0xa07a4c)
const DEEP = ramp(0x0e1a24, 0x16283a, 0x223c52)
const CABBAGE_KIT = ramp(0x14302e, 0x1e4a40, 0x2c6650, 0x40845e, 0x5ea474, 0x86c290)
const LETTUCE = ramp(0x1e3a14, 0x2e561c, 0x467a26, 0x64a032, 0x8cc044, 0xb8dc66)
const WICKER_KIT = ramp(0x2a1c10, 0x46301a, 0x664826, 0x866236, 0xa47e48, 0xbe9a5e)
const SACK_KIT = ramp(0x3e2c1a, 0x5a4228, 0x76583a, 0x92724c, 0xac8c62, 0xc4a67a)
const LINEN = ramp(0x8c8676, 0xbcb6a4, 0xe2dccb, 0xf6f2e6)
// Washing gone pale in the sun.
const FADED = ramp(0x4a5a6e, 0x6e8096, 0x93a4b6, 0xb8c6d2)
const SHINGLE = ramp(0x2c1a14, 0x4a2a1e, 0x6a3c28, 0x8a5234)

// ---- Hi-bit props drawn with the buildings' own model kit (buildingKit.ts), so they share its light and materials ----

// A canvas for a prop and the kit's model over it, its origin (the prop's front-most ground point) at (ox, oy).
function kitModel(width: number, height: number, ox: number, oy: number) {
  const canvas = new Canvas(width, height)
  return { canvas, m: new Model(canvas, ox, oy) }
}
// A one-pixel dark line round the prop where it meets the ground below and to the right, so it reads against the grass
// like the buildings do.
const OUTLINE = rgb(0x1a140e)
function outline(canvas: Canvas) {
  const { width, height, pixels } = canvas
  const add: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) continue
      const left = x > 0 && pixels[y * width + x - 1]
      const up = y > 0 && pixels[(y - 1) * width + x]
      const right = x < width - 1 && pixels[y * width + x + 1]
      if (left || up || right) add.push(y * width + x)
    }
  }
  for (const i of add) pixels[i] = OUTLINE
}

// A cottage garden against a house wall (CLAUDE.md §6.4, "Köy süsleri"): a small, not quite square plot running out
// from the wall, rows of greens in two or three tones (cabbages, lettuces, leeks, carrot tops), a bean tepee in its far
// corner, a wattle fence on posts that catch the light round its open sides with a gap toward the door, and a trodden
// path out through it. Drawn in the space of the tile beside the house, origin at that tile's front corner: `side`
// says which edge of the tile is the house wall — 0 the tile's back-left edge (the garden lies to the house's right),
// 1 its front-right edge (the garden behind the house, to its left), 2 its front-left edge (behind it, to its right).
function cottageGarden(seed: number, side: number): Sprite {
  const { canvas, m } = kitModel(76, 54, 38, 50)
  const random = mulberry32(seed)
  // (a, b): a out from the wall, b along it; to model space for each side.
  const at = (a: number, b: number): [number, number] => (side === 0 ? [-32 + a, b] : side === 1 ? [-a, b] : [b, -a])
  const deep = 17 + Math.floor(random() * 5)
  const b0 = -28 + Math.floor(random() * 4)
  const b1 = -5 - Math.floor(random() * 3)
  // The far side bulges and dips a little: the plot is dug by hand, not ruled.
  const far = (b: number) => deep + Math.round(Math.sin((b - b0) * 0.35 + seed) * 1.2 - (b - b0 < 4 ? 2 : 0))
  const gate = 3 + Math.floor(random() * 4)
  const soil = (a: number, b: number) => {
    const ridge = (a + 1) % 4.5 < 2.6
    return dith(SOIL_KIT, (ridge ? 3.1 : 1.6) + (hash(Math.round(a), Math.round(b), seed) - 0.5) * 0.9, a * 2, b)
  }
  canvas.paving = true
  for (let b = b0; b <= b1; b += 0.5) for (let a = 1; a <= far(b); a += 0.5) { const [u, v] = at(a, b); m.put(u, v, 0, soil(a, b)) }
  // The path: from the gate out to the end of the tile, toward the door.
  for (let b = b1; b <= -0.5; b += 0.5) for (let a = gate; a <= gate + 2.5; a += 0.5) {
    if (b > b1 + 2 && hash(Math.round(a), Math.round(b), seed + 2) < (b - b1) / 9) continue
    const [u, v] = at(a, b)
    m.put(u, v, 0, dith(SOIL_KIT, 3.6 + (hash(Math.round(a * 2), Math.round(b), seed + 3) - 0.5) * 1.2, u, v))
  }
  canvas.paving = false
  // The crops, row by row from the wall out: each row its own kind.
  const kinds = [0, 1, 2, 3].sort(() => random() - 0.5)
  let row = 0
  for (let a = 4.8; a < deep - 1; a += 4.5, row++) {
    const kind = kinds[row % kinds.length]
    for (let b = b0 + 1.5; b <= b1 - 1; b += kind === 2 ? 2 : 3) {
      if (a > far(b) - 1.5 || random() < 0.1) continue
      const [u, v] = at(a, b + (random() - 0.5))
      if (kind === 0) {
        // A cabbage: a round head, blue-green, its outer leaves darker.
        m.ball(u, v, 1.5, 2.3, (l, x, y) => dith(CABBAGE_KIT, toneOf(6, l) + (hash(Math.round(x), Math.round(y), seed) - 0.5) * 0.8, x, y), 0.75, true)
      } else if (kind === 1) {
        // A lettuce: smaller, bright, frilled.
        m.ball(u, v, 1, 1.8, (l, x, y) => dith(LETTUCE, toneOf(6, l) + (hash(Math.round(x), Math.round(y), seed + 1) > 0.7 ? 0.8 : 0), x, y), 0.7, true)
      } else if (kind === 2) {
        // Leeks or onions: upright blades, lighter at their tips.
        const tall = 3 + Math.floor(random() * 2)
        for (let z = 0.5; z <= tall; z += 0.5) m.put(u, v, z, z > tall - 1 ? LEAVES[5] : z < 1.5 ? CLOTH_CREAM[3] : LEAVES[3])
        m.put(u + 0.5, v, tall - 1, LEAVES[4])
      } else {
        // Carrot tops: a feathery tuft.
        for (const [du, dv, z, t] of [[0, 0, 1, 4], [0.5, -0.5, 1.5, 5], [-0.5, 0.5, 1.5, 3], [0, 0, 2, 5]] as const) m.put(u + du, v + dv, z, LEAVES[t])
      }
    }
  }
  // A bean tepee in the far corner: three canes leaning together, the vine climbing them, a few red flowers.
  {
    const [cu, cv] = at(far(b0 + 3) - 2.5, b0 + 3)
    const tip: [number, number, number] = [cu, cv, 13]
    for (const [du, dv] of [[-2, -1], [2, -1], [0, 2]]) {
      m.line([cu + du, cv + dv, 0], tip, (f) => (f > 0.9 ? BOARDS[5] : BOARDS[du > 0 ? 2 : 4]))
      for (let f = 0.1; f < 0.85; f += 0.08) {
        const z = f * 13
        m.put(cu + du * (1 - f) + 0.5, cv + dv * (1 - f), z, hash(Math.round(z), du, seed) < 0.15 ? CLOTH_RED[4] : LEAVES[2 + Math.floor(hash(Math.round(z), dv, seed + 1) * 3)], 0.5)
      }
    }
  }
  // The fence: posts every few steps, their lit sides and caps bright, wattle woven between them.
  const fenceAlong = (points: [number, number][], gap?: [number, number]) => {
    let walked = 0
    for (let i = 1; i < points.length; i++) {
      const [a0, b0_] = points[i - 1]
      const [a1, b1_] = points[i]
      const length = Math.hypot(a1 - a0, b1_ - b0_)
      for (let s = 0; s <= length; s += 0.5, walked += 0.5) {
        const a = a0 + ((a1 - a0) * s) / length
        const b = b0_ + ((b1_ - b0_) * s) / length
        if (gap && a > gap[0] && a < gap[1]) continue
        const [u, v] = at(a, b)
        if (walked % 4 < 0.5) {
          // A post: shade, lit face, a bright cap.
          for (let z = 0; z <= 4.5; z += 0.5) m.put(u, v, z, z >= 4.5 ? BOARDS[5] : BOARDS[z > 2.5 ? 4 : 3])
          m.put(u + 0.5, v, 2, BOARDS[1])
        } else {
          // Two woven bands with the soil showing between them.
          for (const z of [1.5, 2, 3, 3.5]) {
            const weave = (Math.round(walked * 2) + Math.round(z * 2)) % 3 === 0
            m.put(u, v, z, weave ? WICKER_KIT[2] : WICKER_KIT[z > 3 ? 5 : 4])
          }
        }
      }
    }
  }
  const outer: [number, number][] = []
  for (let b = b0; b <= b1; b += 1) outer.push([far(b) + 1, b])
  fenceAlong([[1, b0 - 1], [far(b0) + 1, b0 - 1], ...outer])
  fenceAlong([[far(b1) + 1, b1 + 1], [1, b1 + 1]], [gate - 0.5, gate + 3])
  // A basket by the gate, now and then.
  if (random() < 0.5) {
    const [u, v] = at(gate + 3.5, b1 + 2.5)
    m.cylinder(u, v, 1.2, 0, 2.5, (_a, z, l, x, y) => dith(WICKER_KIT, toneOf(6, l) + 0.4 - (Math.round(z * 2) % 2 ? 0.6 : 0), x, y), false)
  }
  return canvas.sprite(38, 50, 0)
}

// A washing line strung between two posts, linen and coloured cloth pegged on it.
function washingLine(seed: number): Sprite {
  const m = new PropModel(56, 34, 28, 31)
  const random = mulberry32(seed)
  const a = { u: -0.55, v: -0.12 }
  const b = { u: -0.08, v: -0.12 }
  const tall = 11
  for (const p of [a, b]) for (let z = 0; z <= tall; z += 0.5) m.put(p.u, p.v, z, OAK, z > tall - 1 ? 3.6 : 2.2)
  const cloths = [LINEN, LINEN, SACK, LINEN, FADED, LINEN]
  const at = (t: number) => tall - 1 - Math.sin(t * Math.PI) * 2.2
  for (let t = 0; t <= 1; t += 1 / 60) m.put(a.u + (b.u - a.u) * t, a.v, at(t), LINEN, 0)
  let t = 0.1 + random() * 0.06
  while (t < 0.86) {
    const width = 0.07 + random() * 0.06
    const cloth = cloths[Math.floor(random() * cloths.length)]
    const drop = 3 + Math.floor(random() * 2)
    for (let s = 0; s < width; s += 1 / 120) {
      const u = a.u + (b.u - a.u) * (t + s)
      const z0 = at(t + s)
      for (let dz = 0; dz <= drop; dz += 0.5) m.put(u, a.v + 0.002, z0 - dz, cloth, (cloth === LINEN ? 2.4 : 2.2) - dz * 0.12 + (s < 0.02 ? 0.6 : 0))
    }
    t += width + 0.04 + random() * 0.05
  }
  return m.sprite(1)
}

// A round haystack, combed down its sides, a pole through its top; or a few square bales.
function haystack(seed: number): Sprite {
  const random = mulberry32(seed)
  const r = 6 + Math.floor(random() * 2)
  const w = r * 2 + 8
  const h = r * 2 + 12
  const cx = w >> 1
  const base = h - 2
  // shadeBlobs wants a Canvas; give it one through a tiny adapter that writes into our buffer.
  const pixels = new Uint32Array(w * h)
  const sink = {
    width: w,
    height: h,
    set(x: number, y: number, color: number) {
      x = Math.round(x)
      y = Math.round(y)
      if (x >= 0 && y >= 0 && x < w && y < h) pixels[y * w + x] = color
    },
  }
  shadeBlobs(sink as never, [{ x: cx, y: base - r * 0.9, r: r }, { x: cx, y: base - r * 1.5, r: r * 0.75 }, { x: cx, y: base - r * 0.45, r: r * 1.05 }], STRAW, seed, 1)
  // Combed strands: darker streaks running down.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = y * w + x
      if (!pixels[o]) continue
      if (y > base) pixels[o] = 0
      else if (hash(x, y >> 2, seed + 3) < 0.18) pixels[o] = STRAW[Math.max(0, STRAW.indexOf(pixels[o]) - 1)]
    }
  }
  // The pole.
  for (let y = base - r * 2 - 3; y < base - r * 2 + 2; y++) if (y >= 0) pixels[y * w + cx] = OAK[2]
  const lift = new Uint8Array(w * h)
  for (let i = 0; i < pixels.length; i++) if (pixels[i]) lift[i] = Math.max(0, base - Math.floor(i / w))
  // Loose straw on the ground round its foot.
  for (let n = 0; n < 8; n++) {
    const x = Math.round(cx + (random() - 0.5) * r * 2.6)
    const y = base - 1 + Math.round(random() * 2)
    if (!pixels[y * w + x]) {
      pixels[y * w + x] = STRAW[3 + (n & 1)]
      lift[y * w + x] = NO_SHADOW
    }
  }
  return { width: w, height: h, anchorX: cx, anchorY: base, pixels, shadow: 1, lift }
}

function bales(seed: number): Sprite {
  const m = new PropModel(48, 30, 24, 27)
  const straw = (u: number, v: number, z: number) => (hash(Math.floor(u * 50), Math.floor(z), seed) - 0.5) * 0.8 + (Math.abs(((u + v) * 22) % 1) < 0.15 ? -0.8 : 0)
  m.box(-0.36, -0.06, -0.28, -0.08, 0, 5, STRAW, 4, straw)
  m.box(-0.36, -0.06, -0.06, 0, 0, 5, STRAW, 4, straw)
  if (seed % 2 === 0) m.box(-0.3, -0.08, -0.22, -0.04, 5.5, 10, STRAW, 4.4, straw)
  return m.sprite(1)
}

// Firewood stacked against the weather: split logs in a neat pile, their pale cut ends toward the viewer's right, a
// chopping block with an axe in it beside them.
function woodpile(seed: number): Sprite {
  const { canvas, m } = kitModel(56, 36, 28, 32)
  const random = mulberry32(seed)
  const rows = random() < 0.5 ? [4, 3, 2] : [5, 4, 3]
  logPile(m, -16, -12, 14, rows, 1.7, 'u')
  // The chopping block and its axe.
  m.cylinder(-3, -3, 2.2, 0, 3.5, (_a, _z, l, x, y) => dith(LOGWOOD_KIT, toneOf(6, l), x, y), false)
  m.disc(-3, -3, 2, 3.5, (a, b, x, y) => dith(CUT_END_KIT, 1.4 + (Math.hypot(a, b) > 1.2 ? -0.8 : 0.3), x, y))
  m.line([-3.5, -3, 3.5], [-4.5, -3.5, 9], BOARDS[4])
  for (const dz of [0, 0.5, 1]) m.put(-3.5, -3, 3.5 + dz, IRON_KIT[4], 1)
  m.solidBox(-16, -18, -2, -6, 0, rows.length * 2.9)
  outline(canvas)
  return canvas.sprite(28, 32, 1)
}

// A well: a round wall of fieldstone with dark water in it, two posts carrying a little shingled roof and a winch.
function well(seed: number): Sprite {
  const m = new PropModel(44, 44, 22, 40)
  const c = { u: -0.22, v: -0.22 }
  const r = 0.17
  const stone = (z: number) => (Math.floor(z / 2) % 2 === 0 ? 0 : -0.5)
  m.drum(c.u, c.v, r, 0, 5, STONE, 3.4, stone)
  // The water inside the ring.
  for (let du = -r + 0.04; du <= r - 0.04; du += 1 / 64) for (let dv = -r + 0.04; dv <= r - 0.04; dv += 1 / 64) if (du * du + dv * dv < (r - 0.04) ** 2) m.put(c.u + du, c.v + dv, 5.2, DEEP, 1 + (dv - du) * 4)
  // Posts, the beam and the roof.
  for (const s of [-1, 1]) for (let z = 5; z <= 15; z += 0.5) m.put(c.u + s * (r - 0.02), c.v, z, OAK, 2.4)
  for (let u = c.u - r - 0.04; u <= c.u + r + 0.04; u += 1 / 64) {
    m.put(u, c.v, 12, OAK, 1.8)
    for (let dv = -0.14; dv <= 0.14; dv += 1 / 64) {
      const z = 18 - Math.abs(dv) * 32
      m.put(u, c.v + dv, z, SHINGLE, (dv > 0 ? 2.6 : 1.2) + ((Math.floor(z) & 1) === 0 ? 0.3 : -0.3) + (hash(Math.floor(u * 60), Math.floor(z), seed) - 0.5) * 0.6)
    }
  }
  // The bucket on its rope.
  for (let z = 7; z <= 12; z += 0.5) m.put(c.u, c.v + 0.01, z, LINEN, 1)
  m.drum(c.u + 0.05, c.v + 0.12, 0.035, 5, 8, OAK, 2.4, (z) => (Math.abs(z - 6.5) < 0.6 ? -1.8 : 0))
  return m.sprite(1)
}

// A two-wheeled farm cart: two big spoked wheels with dark iron tyres and lit spokes, a plank bed with its boards and
// a lit edge, side rails on stakes, the shafts resting on the ground, and a load in its own colours (sacks, hay or
// barrels).
function cart(seed: number): Sprite {
  const { canvas, m } = kitModel(60, 44, 30, 40)
  const random = mulberry32(seed)
  const u0 = -27
  const u1 = -9
  const v0 = -15
  const v1 = -5
  const bed = 6
  // The far wheel first: mostly hidden under the bed, its lower rim showing.
  const wheel = (v: number, near: boolean) => {
    const cu = -18
    const R = 6
    for (let a = 0; a < Math.PI * 2; a += 0.03) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      for (let r = R - 1; r <= R; r += 0.5) m.put(cu + c * r, v, R + s * r, r > R - 0.5 ? IRON_KIT[1] : IRON_KIT[s > 0.3 ? 4 : 2], near ? 2 : 0)
      // The wooden felloe inside the tyre, lit on its upper left.
      m.put(cu + c * (R - 1.5), v, R + s * (R - 1.5), BOARDS[s - c > 0.4 ? 5 : s - c < -0.6 ? 2 : 4], near ? 2 : 0)
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3
      m.line([cu + Math.cos(a) * 1.2, v, R + Math.sin(a) * 1.2], [cu + Math.cos(a) * (R - 1.8), v, R + Math.sin(a) * (R - 1.8)], Math.sin(a) > -0.2 ? BOARDS[5] : BOARDS[3], near ? 2.1 : 0)
    }
    for (const [du, dz, c] of [[0, 0, IRON_KIT[5]], [0.5, 0, IRON_KIT[3]], [0, 0.5, IRON_KIT[4]], [0.5, 0.5, IRON_KIT[2]]] as const) m.put(cu + du, v + 0.3, R + dz, c, near ? 2.2 : 0)
  }
  wheel(v0 - 0.5, false)
  // The shafts, from under the front of the bed down to the ground ahead of it.
  for (const v of [v0 + 2, v1 - 2]) m.line([u1 - 2, v, bed], [-1, v + (v < -10 ? -0.5 : 0.5), 0.5], (f) => (f > 0.92 ? BOARDS[1] : BOARDS[v > -10 ? 4 : 3]))
  // The bed: thick planks, their seams dark, the lit edge bright.
  m.box(u0, v0, u1, v1, bed - 1.5, bed, {
    front: (s, _z, x, y) => dith(BOARDS, toneOf(6, FRONT) - (Math.round(s) % 6 === 0 ? 1 : 0), x, y),
    side: (_s, _z, x, y) => dith(BOARDS, toneOf(6, SIDE), x, y),
    top: (a, _b, x, y) => dith(BOARDS, toneOf(6, TOP) - (Math.round(a) % 3 === 0 ? 1.3 : 0) + (hash(Math.floor(a / 3), 1, seed) - 0.5) * 0.6, x, y),
  }, false)
  // The load.
  const load = random()
  if (load < 0.4) {
    for (const [a, b, c] of [[-24, -12, CLOTH_CREAM], [-19.5, -12.5, SACK_KIT], [-14.5, -11.5, CLOTH_CREAM], [-22, -7.5, SACK_KIT], [-16.5, -7.5, CLOTH_CREAM]] as const) sack(m, a, b, bed, 2.6, c)
    sack(m, -19, -10, bed + 3, 2.4, CLOTH_CREAM)
  } else if (load < 0.7) {
    m.ball(-18, -10, bed + 1.5, 6.5, (l, x, y) => dith(STRAW_KIT, toneOf(6, l) + (hash(Math.round(x), Math.round(y) >> 1, seed) - 0.5) * 0.9, x, y), 0.6, true)
    m.line([-23, -11, bed + 4], [-13, -9, bed + 5], STRAW_KIT[1])
  } else {
    barrel(m, -23, -10, bed, 7, 2.6)
    barrel(m, -15.5, -10, bed, 7, 2.6)
  }
  // Side rails on stakes along both long sides; the near one over the load's foot.
  for (const v of [v0, v1]) {
    for (let u = u0; u <= u1; u += 0.5) {
      const stake = (u - u0) % 6 < 0.5
      for (let z = bed; z <= bed + 4; z += 0.5) if (stake || z >= bed + 3.5) m.put(u, v, z, z >= bed + 3.5 ? BOARDS[v === v1 ? 5 : 3] : BOARDS[v === v1 ? 4 : 2], v === v1 ? 1.5 : 0)
    }
  }
  wheel(v1 + 0.8, true)
  m.solidBox(u0, v0, u1, v1, 0, bed + 4)
  outline(canvas)
  return canvas.sprite(30, 40, 1)
}

// Barrels, two or three, one maybe on its side; or crates and sacks.
function barrels(seed: number): Sprite {
  const m = new PropModel(44, 30, 22, 27)
  const random = mulberry32(seed)
  const hoops = (z: number) => (Math.abs(z - 1.5) < 0.6 || Math.abs(z - 6) < 0.6 ? -1.8 : z > 2 && z < 5.5 ? 0.3 : 0)
  m.drum(-0.3, -0.2, 0.075, 0, 7.5, OAK, 3, hoops)
  m.drum(-0.12, -0.3, 0.075, 0, 7.5, OAK, 3, hoops)
  if (random() < 0.6) m.drum(-0.1, -0.1, 0.07, 0, 7, OAK, 3.2, hoops)
  else m.box(-0.18, -0.04, -0.16, -0.04, 0, 5, SACK, 3)
  return m.sprite(1)
}

function crates(seed: number): Sprite {
  const m = new PropModel(44, 30, 22, 27)
  const random = mulberry32(seed)
  const planks = (u: number, v: number, z: number) => (Math.abs(z % 2.5) < 0.5 ? -0.9 : 0) + (hash(Math.floor((u + v) * 40), 1, seed) - 0.5) * 0.4
  m.box(-0.4, -0.2, -0.3, -0.1, 0, 7, OAK, 3.4, planks)
  m.box(-0.18, -0.04, -0.34, -0.2, 0, 5, OAK, 3.2, planks)
  if (random() < 0.7) m.box(-0.36, -0.24, -0.26, -0.14, 7.5, 12, OAK, 3.6, planks)
  m.box(-0.16, -0.02, -0.14, -0.02, 0, 4, SACK, 3)
  return m.sprite(1)
}

// A low run of hedge or of dry-stone wall along one edge of a tile, from its origin (the lower end) back one tile
// along u (`along` 'u') or along v. A field's back edges carry them.
function hedge(seed: number, along: 'u' | 'v', stone: boolean): Sprite {
  const m = new PropModel(72, 30, along === 'u' ? 66 : 6, 26)
  const random = mulberry32(seed)
  const at = (t: number) => (along === 'u' ? { u: -t, v: 0 } : { u: 0, v: -t })
  if (stone) {
    // Fieldstones laid dry, two courses, lit on top, a tuft of grass here and there.
    for (let t = 0.02; t < 0.98; t += 1 / 128) {
      const p = at(t)
      const block = Math.floor(t * 9 + (random() < 0.02 ? 1 : 0))
      const tall = 3 + (hash(block, 1, seed) < 0.5 ? 0 : 1)
      for (let z = 0; z <= tall; z += 0.5) {
        const seam = Math.abs(z - 2) < 0.4 || Math.abs((t * 9) % 1) < 0.08
        m.put(p.u, p.v, z, STONE, seam ? 1.4 : z >= tall - 0.5 ? 4.2 : 3 + (hash(block, Math.floor(z), seed) - 0.5) * 0.8)
      }
      if (hash(Math.floor(t * 40), 2, seed) < 0.12) m.put(p.u, p.v, tall + 1, LEAF[0], 3)
    }
    return m.sprite(1)
  }
  // A hedge: a row of round bushes merged into one, trimmed low.
  const w = m.width
  const h = m.height
  const sink = {
    width: w,
    height: h,
    set(x: number, y: number, color: number) {
      x = Math.round(x)
      y = Math.round(y)
      if (x < 0 || y < 0 || x >= w || y >= h) return
      m.pixels[y * w + x] = color
      m.lift[y * w + x] = 0
    },
  }
  const blobs = []
  for (let t = 0.06; t <= 0.94; t += 0.1) {
    const p = at(t)
    const r = 3.4 + random() * 1.2
    blobs.push({ x: m.sx(p.u, p.v), y: m.sy(p.u, p.v, 0) - r * 0.75, r })
  }
  shadeBlobs(sink as never, blobs, LEAF[1], seed, 0.8)
  // How high each hedge pixel stands: from the hedge's own foot below it.
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = y * w + x
      if (!m.pixels[o]) continue
      // The foot under this column: where the run's ground line passes.
      const t = along === 'u' ? (m.ox - x) / 32 : (x - m.ox) / 32
      const ground = m.oy - Math.max(0, Math.min(1, t)) * 16
      m.lift[o] = Math.max(0, Math.round(ground - y))
    }
  }
  return m.sprite(1)
}

// A young fruit tree in a yard: a short trunk, a round crown, apples or pears among the leaves.
function smallFruitTree(seed: number): Sprite {
  const random = mulberry32(seed)
  const r = 6 + Math.floor(random() * 2)
  const w = r * 3 + 6
  const h = r * 2 + 14
  const pixels = new Uint32Array(w * h)
  const cx = w >> 1
  const base = h - 2
  const top = base - 8
  const sink = {
    width: w,
    height: h,
    set(x: number, y: number, color: number) {
      x = Math.round(x)
      y = Math.round(y)
      if (x >= 0 && y >= 0 && x < w && y < h) pixels[y * w + x] = color
    },
  }
  for (let y = top; y <= base; y++) {
    sink.set(cx - 1, y, BARK[2])
    sink.set(cx, y, BARK[1])
    if (y > base - 1) sink.set(cx + 1, y, BARK[0])
  }
  const leaves = LEAF[random() < 0.5 ? 0 : 2]
  shadeBlobs(sink as never, [{ x: cx, y: top - r * 0.5, r }, { x: cx - r * 0.55, y: top - r * 0.1, r: r * 0.7 }, { x: cx + r * 0.6, y: top - r * 0.15, r: r * 0.68 }], leaves, seed)
  const fruit = random() < 0.65 ? ramp(0x8a1c1c, 0xc8342a, 0xf07a5a) : ramp(0x6e7a22, 0xa8b43a, 0xdce07a)
  for (let n = 0, tries = 0; n < 9 && tries < 200; tries++) {
    const x = Math.floor(random() * w)
    const y = Math.floor(random() * (top + 2))
    const c = pixels[y * w + x]
    if (!c || !leaves.includes(c) || !leaves.includes(pixels[(y + 1) * w + x + 1] ?? 0)) continue
    pixels[y * w + x] = fruit[2]
    pixels[y * w + x + 1] = fruit[1]
    pixels[(y + 1) * w + x] = fruit[1]
    pixels[(y + 1) * w + x + 1] = fruit[0]
    n++
  }
  // Windfalls in the grass.
  const lift = new Uint8Array(w * h)
  for (let i = 0; i < pixels.length; i++) if (pixels[i]) lift[i] = Math.max(0, base - Math.floor(i / w))
  for (let n = 0; n < 3; n++) {
    const x = Math.round(cx + (random() - 0.5) * r * 2)
    const y = base + (n & 1)
    if (y < h && !pixels[y * w + x]) {
      pixels[y * w + x] = fruit[1]
      lift[y * w + x] = NO_SHADOW
    }
  }
  return { width: w, height: h, anchorX: cx, anchorY: base, pixels, shadow: 1, lift }
}

const variants = (count: number, make: (i: number) => Sprite) => Array.from({ length: count }, (_, i) => make(i))

// Made once, the first time a chunk with a lordship in it is painted.
let made: ReturnType<typeof makeProps> | null = null
function makeProps() {
  return {
    // Four of each side (see cottageGarden).
    garden: variants(12, (i) => cottageGarden(701 + i, Math.floor(i / 4))),
    washing: variants(3, (i) => washingLine(721 + i)),
    hay: [...variants(3, (i) => haystack(731 + i)), ...variants(2, (i) => bales(741 + i))],
    woodpile: variants(3, (i) => woodpile(751 + i)),
    well: variants(2, (i) => well(761 + i)),
    cart: variants(3, (i) => cart(771 + i)),
    barrels: variants(3, (i) => barrels(781 + i)),
    crates: variants(2, (i) => crates(791 + i)),
    hedgeU: variants(3, (i) => hedge(801 + i, 'u', false)),
    hedgeV: variants(3, (i) => hedge(811 + i, 'v', false)),
    stoneU: variants(2, (i) => hedge(821 + i, 'u', true)),
    stoneV: variants(2, (i) => hedge(831 + i, 'v', true)),
    fruitTree: variants(4, (i) => smallFruitTree(841 + i)),
  }
}
export type PropKind = keyof ReturnType<typeof makeProps>
export function villageProps() {
  return (made ??= makeProps())
}
// How tall each kind stands (pixels): what may stand in front of a building, a wall or a walker without covering it.
export const PROP_HEIGHT: Record<PropKind, number> = {
  garden: 5, washing: 12, hay: 16, woodpile: 8, well: 18, cart: 12, barrels: 8, crates: 12, hedgeU: 7, hedgeV: 7, stoneU: 5, stoneV: 5, fruitTree: 26,
}
// Buried under snow once it lies patchy (a garden's rows, a dry-stone wall), like the grass tufts.
export const PROP_BURIED: PropKind[] = ['garden', 'stoneU', 'stoneV']

// ---- Where they go ---------------------------------------------------------------------------------------------------

export interface PropAt {
  kind: PropKind
  index: number
  // The prop's origin (its front-most ground point), in tile coordinates.
  x: number
  y: number
}

export interface VillageInput {
  world: World
  structures: Structure[]
  footprint: Uint8Array
  trail: Float32Array
  road: Float32Array
  lane: Uint8Array
  // Below these distances (tiles) a trade route or a footpath is too close for anything to stand.
  roadClear: number
  trailClear: number
}

export interface Village {
  // Per tile, how worn the ground is by the lordship's comings and goings (0..255): near the palace and the houses,
  // along the footpaths. Null when no lord has built anything.
  heat: Uint8Array | null
  // Per tile, where the worn ground gives way to bare earth (0..255, bare from 128 up; null with no lordship).
  bare: Uint8Array | null
  // The props, keyed by the tile that paints them.
  props: Map<number, PropAt[]>
}

// How far each building wears the ground round it (tiles beyond its footprint) and how much at its foot.
const WEAR: Partial<Record<string, [number, number]>> = {
  palace: [10, 1],
  house: [4, 0.8],
  farm: [2.5, 0.3],
  gate: [3, 0.55],
  gateY: [3, 0.55],
  road: [2, 0.5],
  watchtower: [2, 0.4],
  scaffold: [3, 0.7],
  jetty: [0, 0],
  wall: [0, 0],
  towerWall: [0, 0],
  brokenWall: [0, 0],
}
// Footpaths wear the ground beside them this far (tiles), this much at their middle.
const TRAIL_WEAR = 2.6
const TRAIL_PEAK = 0.6
// Tall props keep this far (tiles) from wall pieces, so no wall hides them; and from each other.
const WALL_GAP = 3

// Lays out the worn ground and the props of every lordship, once when the buildings change. Only a lord's own
// buildings count (they carry an id); the free cities, towns and camps have their own looks. Deterministic: from the
// world seed and where the buildings stand.
export function planVillage(input: VillageInput): Village {
  const { world, structures, footprint, trail, road, lane, roadClear, trailClear } = input
  const { size, seed } = world
  const lords = structures.filter((s) => s.id !== undefined && s.city === undefined)
  const props = new Map<number, PropAt[]>()
  if (lords.length === 0) return { heat: null, bare: null, props }
  const heat = new Uint8Array(size * size)
  // A building wears the ground round it, more the nearer; several near one another add up (but never past 1).
  for (const s of lords) {
    const [reach, peak] = WEAR[s.look] ?? [2.5 + s.size * 0.8, 0.75]
    if (reach <= 0) continue
    const r = Math.ceil(reach)
    for (let y = Math.max(0, s.y - r); y < Math.min(size, s.y + s.size + r); y++) {
      for (let x = Math.max(0, s.x - r); x < Math.min(size, s.x + s.size + r); x++) {
        const dx = Math.max(s.x - (x + 0.5), 0, x + 0.5 - (s.x + s.size))
        const dy = Math.max(s.y - (y + 0.5), 0, y + 0.5 - (s.y + s.size))
        const t = Math.hypot(dx, dy) / reach
        if (t >= 1) continue
        const v = peak * (1 - t) * (1 - t)
        const i = y * size + x
        heat[i] = 255 - Math.round((255 - heat[i]) * (1 - v))
      }
    }
  }
  // Footpaths wear the ground beside them, inside the lordship (the free cities' and the towns' paths stay as they are).
  let x0 = size
  let y0 = size
  let x1 = 0
  let y1 = 0
  for (const s of lords) {
    x0 = Math.min(x0, s.x - 8)
    y0 = Math.min(y0, s.y - 8)
    x1 = Math.max(x1, s.x + s.size + 8)
    y1 = Math.max(y1, s.y + s.size + 8)
  }
  x0 = Math.max(0, x0)
  y0 = Math.max(0, y0)
  x1 = Math.min(size, x1)
  y1 = Math.min(size, y1)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * size + x
      if (heat[i] === 0 || trail[i] >= TRAIL_WEAR) continue
      const t = trail[i] / TRAIL_WEAR
      const v = TRAIL_PEAK * (1 - t) ** 1.5
      heat[i] = 255 - Math.round((255 - heat[i]) * (1 - v))
    }
  }

  // The wear comes and goes in patches, so it reads as trampled ground rather than rings round each building; and the
  // most worn patches show bare earth, about a tile or two across. Worked out per tile here, so the painter only blends
  // them (no noise per pixel).
  const bare = new Uint8Array(size * size)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * size + x
      if (heat[i] === 0) continue
      const rx = x * 0.83 + y * 0.56
      const ry = y * 0.83 - x * 0.56
      const worn = Math.min(1, (heat[i] / 255) * (0.45 + valueNoise(rx * 0.3, ry * 0.3, seed + 161) * 1.1))
      heat[i] = Math.max(1, Math.round(worn * 255))
      const b = worn + (valueNoise(rx * 0.55, ry * 0.55, seed + 165) - 0.5) * 1.1
      bare[i] = Math.max(0, Math.min(255, Math.round(b * 128)))
    }
  }

  // Where things may stand: open, dry, level ground off the paths and roads, and not on a building.
  const at = (x: number, y: number) => y * size + x
  const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < size - 1 && y < size - 1
  const walls = new Uint8Array(size * size)
  for (const s of structures) {
    if (!WALL_KINDS.has(s.look) && !s.fence) continue
    for (let y = Math.max(0, s.y - WALL_GAP); y < Math.min(size, s.y + s.size + WALL_GAP); y++)
      for (let x = Math.max(0, s.x - WALL_GAP); x < Math.min(size, s.x + s.size + WALL_GAP); x++) walls[at(x, y)] = Math.max(walls[at(x, y)], Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= 1 ? 2 : 1)
  }
  const taken = new Uint8Array(size * size)
  const level = (x: number, y: number) => {
    const h = world.height
    const a = h[at(x, y)]
    return Math.abs(h[at(x + 1, y)] - a) < 5 && Math.abs(h[at(x, y + 1)] - a) < 5 && Math.abs(h[at(x - 1, y)] - a) < 5 && Math.abs(h[at(x, y - 1)] - a) < 5
  }
  const open = (x: number, y: number) => {
    if (!inside(x, y)) return false
    const i = at(x, y)
    const t = world.terrain[i]
    if (t !== Terrain.Grass && t !== Terrain.Forest) return false
    if (world.feature[i] !== Feature.None || footprint[i] || lane[i] || taken[i] || walls[i] === 2) return false
    if (road[i] < roadClear + 0.9 || trail[i] < trailClear) return false
    // Not on a bank: the water's edge has its rushes.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = world.terrain[at(x + dx, y + dy)]
      if (n === Terrain.Lake || n === Terrain.River || n === Terrain.Mountain) return false
    }
    return level(x, y)
  }
  // Painted into the ground, a prop sits under the buildings, walls and walkers: anything tall must not stand just in
  // front of one (it would be drawn over), so the tiles behind it (toward the top of the screen) stay clear of
  // buildings, wall and paths.
  const clearBehind = (x: number, y: number, tall: number) => {
    if (tall <= 8) return true
    if (walls[at(x, y)]) return false
    const reach = tall > 16 ? 3 : 2
    for (let dy = 0; dy <= reach; dy++) {
      for (let dx = 0; dx <= reach; dx++) {
        if (!dx && !dy) continue
        const nx = x - dx
        const ny = y - dy
        if (nx < 0 || ny < 0) continue
        const i = at(nx, ny)
        if (footprint[i] || lane[i] || road[i] < roadClear + 0.4 || trail[i] < trailClear + 0.4) return false
      }
    }
    return true
  }
  const kit = villageProps()
  const lay = (kind: PropKind, x: number, y: number, key: number, r: number, ox = 0.5 + 0.18, oy = 0.5 + 0.18, index?: number) => {
    const list = kit[kind]
    const prop: PropAt = { kind, index: index ?? Math.floor(r * list.length) % list.length, x: x + ox, y: y + oy }
    const there = props.get(key)
    if (there) there.push(prop)
    else props.set(key, [prop])
    taken[key] = 1
  }
  // Tries the tiles round a building (beyond its 1-tile ring, or in it for low things), nearest first, in an order of
  // its own; lays the prop on the first that suits.
  const near = (s: Structure, kind: PropKind, salt: number, ring = 1, far = 2) => {
    const tall = PROP_HEIGHT[kind]
    const spots: [number, number, number][] = []
    for (let y = s.y - far; y < s.y + s.size + far; y++) {
      for (let x = s.x - far; x < s.x + s.size + far; x++) {
        const d = Math.max(s.x - x, 0, x - (s.x + s.size - 1), s.y - y, y - (s.y + s.size - 1))
        if (d < ring || d > far) continue
        // Not on the doorstep and its way out (the walkers' paths start there), nor before the front of the building.
        if (y >= s.y + s.size && x >= s.x && x < s.x + s.size + 1) continue
        if (tall > 8 && (x >= s.x + s.size || y >= s.y + s.size) && d <= 1) continue
        spots.push([x, y, d + hash(x, y, seed + salt) * 0.9])
      }
    }
    spots.sort((a, b) => a[2] - b[2])
    for (const [x, y] of spots) {
      if (!open(x, y) || !clearBehind(x, y, tall)) continue
      // Room round it: props do not crowd one another.
      let crowded = false
      for (let dy = -1; dy <= 1 && !crowded; dy++) for (let dx = -1; dx <= 1; dx++) if (taken[at(x + dx, y + dy)]) crowded = true
      if (crowded) continue
      lay(kind, x, y, at(x, y), hash(x, y, seed + salt + 1))
      return true
    }
    return false
  }
  // A cottage garden lies against a house wall, on the tile beside it: to its right first (in plain view, clear of the
  // door on the house's left front), else behind it. Never on its own.
  const garden = (s: Structure) => {
    const sides: [number, number, number][] = [[s.x + s.size, s.y, 0], [s.x - 1, s.y, 1], [s.x, s.y - 1, 2]]
    for (const [x, y, side] of sides) {
      if (!open(x, y) || trail[at(x, y)] < trailClear + 0.35) continue
      let crowded = false
      for (let dy = -1; dy <= 1 && !crowded; dy++) for (let dx = -1; dx <= 1; dx++) if (taken[at(x + dx, y + dy)]) crowded = true
      if (crowded) continue
      lay('garden', x, y, at(x, y), 0, 1, 1, side * 4 + Math.floor(hash(x, y, seed + 619) * 4))
      return true
    }
    return false
  }
  const roll = (s: Structure, n: number) => hash(s.x * 7 + n, s.y * 13 + n, seed + 601)
  const sorted = [...lords].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const s of sorted) {
    switch (s.look) {
      case 'house': {
        const r = roll(s, 1)
        const dug = r < 0.5 && garden(s)
        if (!dug && r < 0.72) near(s, 'washing', 613, 1, 1)
        else if (!dug && r < 0.9) near(s, 'woodpile', 615)
        // Now and then a washing line by a house with a garden too.
        if (dug && roll(s, 4) < 0.3) near(s, 'washing', 617, 1, 1)
        break
      }
      case 'warehouse':
        near(s, 'hay', 621)
        if (roll(s, 2) < 0.6) near(s, roll(s, 3) < 0.5 ? 'hay' : 'cart', 623)
        break
      case 'lumberCamp':
        near(s, 'woodpile', 631)
        if (roll(s, 2) < 0.5) near(s, 'woodpile', 633)
        break
      case 'market':
      case 'tradePost':
        near(s, 'cart', 641, 1, 3)
        near(s, roll(s, 2) < 0.5 ? 'barrels' : 'crates', 643)
        break
      case 'forge':
      case 'tavern':
        if (roll(s, 2) < 0.7) near(s, 'barrels', 651)
        break
      case 'barracks':
        if (roll(s, 2) < 0.6) near(s, 'crates', 655)
        break
      case 'farm': {
        // Hedges or dry-stone walls along a field's back edges (its front edges would be drawn over by nothing, but a
        // run there would stand on the field itself). Not on a slope: the field sits on a bank there.
        const h = world.height
        const c = [h[at(s.x, s.y)], h[at(s.x + s.size, s.y)], h[at(s.x, s.y + s.size)], h[at(s.x + s.size, s.y + s.size)]]
        if (Math.max(...c) - Math.min(...c) > 4 || roll(s, 1) < 0.35) break
        const stone = roll(s, 2) < 0.4
        for (let k = 0; k < s.size; k++) {
          // The edge along x (the field's top-right edge) from the tile behind it, and the one along y (top-left).
          const ex = s.x + k
          const ey = s.y - 1
          if (inside(ex, ey) && open(ex, ey) && trail[at(ex, ey)] > trailClear + 0.6 && hash(ex, ey, seed + 661) < 0.85)
            lay(stone ? 'stoneU' : 'hedgeU', ex, ey, at(ex, ey), hash(ex, ey, seed + 663), 0.96, 0.9)
          const fx = s.x - 1
          const fy = s.y + k
          if (inside(fx, fy) && open(fx, fy) && trail[at(fx, fy)] > trailClear + 0.6 && hash(fx, fy, seed + 665) < 0.85)
            lay(stone ? 'stoneV' : 'hedgeV', fx, fy, at(fx, fy), hash(fx, fy, seed + 667), 0.9, 0.96)
        }
        break
      }
    }
  }
  // Wells: one for every few houses of a lordship, a good way from one another, on open ground near the houses.
  const houses = sorted.filter((s) => s.look === 'house')
  const wells: { x: number; y: number }[] = []
  for (const s of houses) {
    if (hash(s.x, s.y, seed + 671) > 0.3) continue
    if (wells.some((w) => Math.hypot(w.x - s.x, w.y - s.y) < 10)) continue
    if (near(s, 'well', 673, 2, 3)) wells.push({ x: s.x, y: s.y })
  }
  // Young fruit trees here and there in the yards, in loose clumps, where the ground is lived on but not trodden bare.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = at(x, y)
      const worn = heat[i] / 255
      if (worn < 0.08 || worn > 0.5) continue
      const clump = valueNoise(x * 0.18, y * 0.18, seed + 681)
      if (hash(x, y, seed + 683) > 0.03 * clump * clump * 2.2) continue
      if (!open(x, y) || walls[i] || !clearBehind(x, y, PROP_HEIGHT.fruitTree)) continue
      let roomy = true
      for (let dy = -2; dy <= 2 && roomy; dy++) for (let dx = -2; dx <= 2; dx++) if (footprint[at(x + dx, y + dy)] || taken[at(x + dx, y + dy)]) roomy = false
      if (!roomy) continue
      lay('fruitTree', x, y, i, hash(x, y, seed + 685), 0.3 + hash(x, y, seed + 687) * 0.4, 0.3 + hash(x, y, seed + 689) * 0.4)
    }
  }
  return { heat, bare, props }
}
