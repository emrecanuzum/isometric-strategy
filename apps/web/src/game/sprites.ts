import { hash, mulberry32, valueNoise } from '@game/shared'

// Pixel art is generated in code for now: every sprite is a small buffer of palette colors, drawn pixel by pixel.
// Colors are packed the way an RGBA byte buffer reads them as 32-bit words (alpha in the top byte).

export interface Sprite {
  width: number
  height: number
  // The pixel that sits on the ground point the sprite is placed at.
  anchorX: number
  anchorY: number
  pixels: Uint32Array
  // Radius of the shadow cast on the ground, in pixels; 0 for none.
  shadow: number
}

export const rgb = (hex: number) => (0xff000000 | ((hex & 0xff) << 16) | (hex & 0xff00) | (hex >> 16)) >>> 0
export const ramp = (...colors: number[]) => Uint32Array.from(colors, rgb)

export const BAYER = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16)

export const LEAF = [
  ramp(0x173d2c, 0x235a33, 0x35793a, 0x529a42, 0x7fba50, 0xa9d266),
  ramp(0x143630, 0x1d4f38, 0x2b6c40, 0x44894a, 0x69a658, 0x93c06a),
  ramp(0x2b3f20, 0x425a27, 0x5f7a2e, 0x82993a, 0xa9b54c, 0xcbcd68),
]
const PINE = ramp(0x0f2b2a, 0x163d31, 0x1f5239, 0x2c6941, 0x41824c, 0x5c9a58)
export const BARK = ramp(0x2e2119, 0x4a3424, 0x6b4c31, 0x8a6841)
const DEAD = ramp(0x2b2823, 0x464037, 0x655c4d, 0x857a65)
export const STONE = ramp(0x2e2c3d, 0x474454, 0x64606c, 0x858088, 0xa7a2a1, 0xc6c1b6)
const REED = ramp(0x34452a, 0x516634, 0x748a42, 0x5a3d26)
export const WALL = ramp(0x6f5a47, 0x8f775c, 0xb39a76, 0xd2bc94, 0xe9d8b4)
export const ROOF = ramp(0x4f1f24, 0x6f2a2a, 0x933a30, 0xb5503a, 0xd06f4a, 0xe39062)
export const TIMBER = ramp(0x2a1c16, 0x432c1f, 0x5e4029)
export const GLASS = ramp(0x2b3a5a, 0xf2c14e, 0xffe38a)
const CAMEL = ramp(0x4a301c, 0x6e4a2b, 0x93683d, 0xb78a52, 0xd3aa6e, 0xe6c58e)
export const CLOTH = [
  ramp(0x4a1a20, 0x7a2a2c, 0xa8423a, 0xcc6a4c),
  ramp(0x1c2c4a, 0x2c4672, 0x44679c, 0x6c8fc0),
  ramp(0x2a3f22, 0x41612f, 0x5f8442, 0x86a85c),
  ramp(0x5a3a12, 0x8a5e1c, 0xb98a2c, 0xdcb24a),
]
export const SACK = ramp(0x4f3b26, 0x6f5638, 0x917650, 0xb09669)
const SKIN = ramp(0x6b4630, 0x93633f, 0xb88458)
const STEEL = ramp(0x3c4048, 0x8a909a, 0xd6dae0)
// A soft shadow under walkers: black at partial alpha.
const SHADE = 0x50000000
const DEER = ramp(0x3a2416, 0x5c3a22, 0x7f5432, 0xa26f45, 0xc08d5c)
const HARE = ramp(0x4a4038, 0x6e6052, 0x92826e, 0xb3a48c)
const GOAT = ramp(0x6c6a66, 0x9a9690, 0xc6c2ba, 0xe6e2d8)
const DUCK = ramp(0x3a2a1e, 0x6a4a30, 0x8f6a46)
const MALLARD = ramp(0x173a2a, 0x2a6a44)
const HERON = ramp(0x4a5058, 0x7a828c, 0xaab2ba, 0xd4d8dc)
const WOLF = ramp(0x2c2c32, 0x4a4a52, 0x6c6c74, 0x908e94, 0xb4b2b4)
const FOX = ramp(0x5a2412, 0x8a3a18, 0xb85a22, 0xd8803a, 0xecc8a0)
const BOAR = ramp(0x231a16, 0x3a2c24, 0x534034, 0x6c5646, 0x86705c)
const BEAR = ramp(0x1e140e, 0x34241a, 0x4c3626, 0x664a34, 0x82623f)
const HORSE = [ramp(0x3a1e12, 0x5c321c, 0x80472a, 0xa2603a, 0xbe7c4e), ramp(0x6a6660, 0x9a958c, 0xc4beb2, 0xe2ddd2, 0xf6f2ea)]
const GAZELLE = ramp(0x5c3e22, 0x8a6236, 0xb58a50, 0xd4ac6e, 0xf0e2c8)
const AUROCHS = ramp(0x1c120c, 0x2e1e14, 0x44301e, 0x5c422a, 0x7a5a3a)
const SHEEP = ramp(0x6a6052, 0x9a8e7a, 0xc4b89e, 0xe2d8c2, 0xf4eee0)
const SWAN = ramp(0x9aa4ae, 0xc8d0d6, 0xe8ecef, 0xffffff)
const BILL = rgb(0xe0a030)
const BIRD = rgb(0x262830)
const CLOUD = ramp(0xb4c0d0, 0xcdd6e2, 0xe2e8f0, 0xf2f5f8, 0xffffff)
const RIPPLE = rgb(0xcfeaf2)
const MOSS = ramp(0x2c4a2e, 0x41663a, 0x5b8446, 0x7ea256)
const LICHEN = rgb(0xa8b06a)

export class Canvas {
  width: number
  height: number
  pixels: Uint32Array
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.pixels = new Uint32Array(width * height)
  }
  set(x: number, y: number, color: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.pixels[y * this.width + x] = color
  }
  get(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.pixels[y * this.width + x] : 0
  }
  // Darkens the shape's own border where it faces away from the light (lower right).
  rim(color: number) {
    const edge: number[] = []
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) && (!this.get(x + 1, y) || !this.get(x, y + 1))) edge.push(y * this.width + x)
      }
    }
    for (const i of edge) this.pixels[i] = color
  }
  sprite(anchorX: number, anchorY: number, shadow: number): Sprite {
    return { width: this.width, height: this.height, anchorX, anchorY, pixels: this.pixels, shadow }
  }
}

// A ring two pixels wide around a sprite's silhouette, in white (tint it), anchored like the sprite.
const outlines = new WeakMap<Sprite, Sprite>()
export function outlineOf(sprite: Sprite): Sprite {
  const cached = outlines.get(sprite)
  if (cached) return cached
  const pad = 2
  const canvas = new Canvas(sprite.width + pad * 2, sprite.height + pad * 2)
  // Only solid pixels count, not soft shadows under walkers.
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < sprite.width && y < sprite.height && sprite.pixels[y * sprite.width + x] >>> 24 === 0xff
  for (let y = -pad; y < sprite.height + pad; y++) {
    for (let x = -pad; x < sprite.width + pad; x++) {
      if (solid(x, y)) continue
      let near = false
      for (let dy = -pad; dy <= pad && !near; dy++) for (let dx = -pad; dx <= pad && !near; dx++) near = Math.abs(dx) + Math.abs(dy) <= pad && solid(x + dx, y + dy)
      if (near) canvas.set(x + pad, y + pad, 0xffffffff)
    }
  }
  const ring = canvas.sprite(sprite.anchorX + pad, sprite.anchorY + pad, 0)
  outlines.set(sprite, ring)
  return ring
}

// The lit windows of a building as a sprite of their own, drawn over the night so they glow: the window panes (and
// forge fires) brightened, with a faint warm halo around them. Anchored like the building.
const LIT = new Set([GLASS[1], GLASS[2], rgb(0xe0641c), rgb(0xffb040)])
const lights = new WeakMap<Sprite, Sprite | null>()
export function lightsOf(sprite: Sprite): Sprite | null {
  if (lights.has(sprite)) return lights.get(sprite)!
  const canvas = new Canvas(sprite.width, sprite.height)
  const halo = 0x5060c8ff
  let any = false
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      if (!LIT.has(sprite.pixels[y * sprite.width + x])) continue
      any = true
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!canvas.get(x + dx, y + dy)) canvas.set(x + dx, y + dy, halo)
    }
  }
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const p = sprite.pixels[y * sprite.width + x]
      if (LIT.has(p)) canvas.set(x, y, p === GLASS[1] ? rgb(0xffd870) : rgb(0xfff2b8))
    }
  }
  const lit = any ? canvas.sprite(sprite.anchorX, sprite.anchorY, 0) : null
  lights.set(sprite, lit)
  return lit
}

export const pick = (colors: Uint32Array, tone: number) => colors[Math.min(colors.length - 1, Math.max(0, Math.round(tone)))]

export interface Blob {
  x: number
  y: number
  r: number
}

// Shades a union of spheres lit from the upper left; `squash` flattens them vertically.
export function shadeBlobs(canvas: Canvas, blobs: Blob[], colors: Uint32Array, seed: number, squash = 1) {
  const { width, height } = canvas
  const best = new Float32Array(width * height).fill(-Infinity)
  const lit = new Float32Array(width * height)
  // Each blob only visits the pixels it covers.
  for (const b of blobs) {
    const ry = b.r * squash
    for (let y = Math.max(0, Math.floor(b.y - ry)); y <= Math.min(height - 1, Math.ceil(b.y + ry)); y++) {
      for (let x = Math.max(0, Math.floor(b.x - b.r)); x <= Math.min(width - 1, Math.ceil(b.x + b.r)); x++) {
        const dx = (x - b.x) / b.r
        const dy = (y - b.y) / ry
        const d = dx * dx + dy * dy
        if (d >= 1) continue
        const nz = Math.sqrt(1 - d)
        // Lower blobs sit in front of higher ones.
        const z = nz * b.r + b.y * 0.6
        const o = y * width + x
        if (z <= best[o]) continue
        best[o] = z
        lit[o] = -dx * 0.55 - dy * 0.62 + nz * 0.3
      }
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * width + x
      if (best[o] === -Infinity) continue
      const clump = valueNoise(x * 0.42, y * 0.42, seed) - 0.5
      const tone = (colors.length - 1) * (0.42 + lit[o] * 0.5) + clump * 2 + (BAYER[(x & 3) | ((y & 3) << 2)] - 0.5) * 0.7
      canvas.set(x, y, pick(colors, tone))
    }
  }
}

function trunk(canvas: Canvas, x: number, base: number, top: number, colors: Uint32Array) {
  for (let y = top; y <= base; y++) {
    const flare = y >= base - 1 ? 1 : 0
    canvas.set(x - 1 - flare, y, colors[2])
    canvas.set(x, y, colors[1])
    canvas.set(x + 1, y, colors[0])
    if (flare) canvas.set(x + 2, y, colors[0])
  }
}

function leafTree(seed: number, colors: Uint32Array): Sprite {
  const random = mulberry32(seed)
  const r = 9 + Math.floor(random() * 4)
  const canvas = new Canvas(r * 2 + 14, r * 2 + 24)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  const cy = base - 11 - r * 0.75
  trunk(canvas, cx, base, Math.round(cy), BARK)
  const blobs: Blob[] = [{ x: cx, y: cy, r }]
  const lumps = 4 + Math.floor(random() * 3)
  for (let i = 0; i < lumps; i++) {
    const angle = (i / lumps) * Math.PI * 2 + random()
    blobs.push({
      x: cx + Math.cos(angle) * r * 0.62,
      y: cy + Math.sin(angle) * r * 0.5,
      r: r * (0.45 + random() * 0.25),
    })
  }
  const leaves = new Canvas(canvas.width, canvas.height)
  shadeBlobs(leaves, blobs, colors, seed)
  leaves.rim(colors[0])
  for (let i = 0; i < leaves.pixels.length; i++) if (leaves.pixels[i]) canvas.pixels[i] = leaves.pixels[i]
  return canvas.sprite(cx, base, r * 0.95)
}

function pine(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 34 + Math.floor(random() * 14)
  const half = 8 + Math.floor(random() * 3)
  const canvas = new Canvas(half * 2 + 5, tall + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  trunk(canvas, cx, base, base - 7, BARK)
  const tiers = 4
  const crown = new Canvas(canvas.width, canvas.height)
  // Tiers are drawn bottom to top so each one overlaps the tier below it.
  for (let t = 0; t < tiers; t++) {
    const top = base - 6 - ((tiers - t) / tiers) * (tall - 6)
    const bottom = top + (tall - 6) * (0.42 - t * 0.02) + 4
    const w = half * (0.5 + (0.5 * (t + 1)) / tiers)
    for (let y = Math.floor(top); y <= bottom; y++) {
      const f = (y - top) / (bottom - top)
      const reach = w * f + 0.6
      for (let x = Math.ceil(cx - reach); x <= cx + reach; x++) {
        // Ragged lower edge.
        if (f > 0.82 && hash(x, t, seed) < (f - 0.82) * 4) continue
        const side = (x - cx) / (reach + 0.01)
        const tone = 3.1 - side * 2 - (f > 0.8 ? 1.2 : 0) + (f < 0.25 ? 0.7 : 0) + (hash(x, y, seed + 1) - 0.5) * 1.4
        crown.set(x, y, pick(PINE, tone))
      }
    }
  }
  crown.rim(PINE[0])
  for (let i = 0; i < crown.pixels.length; i++) if (crown.pixels[i]) canvas.pixels[i] = crown.pixels[i]
  return canvas.sprite(cx, base, half * 0.9)
}

function deadTree(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 20 + Math.floor(random() * 8)
  const canvas = new Canvas(23, tall + 2)
  const cx = 11
  const base = canvas.height - 1
  trunk(canvas, cx, base, base - tall + 6, DEAD)
  for (let i = 0; i < 4; i++) {
    const dir = i % 2 === 0 ? -1 : 1
    const from = base - tall * (0.45 + i * 0.13)
    const length = 4 + Math.floor(random() * 5)
    for (let s = 1; s <= length; s++) {
      canvas.set(cx + dir * s, from - s * 0.7, dir < 0 ? DEAD[2] : DEAD[1])
      canvas.set(cx + dir * s, from - s * 0.7 + 1, DEAD[0])
    }
  }
  return canvas.sprite(cx, base, 4)
}

function bush(seed: number, colors: Uint32Array): Sprite {
  const random = mulberry32(seed)
  const r = 4 + Math.floor(random() * 3)
  const canvas = new Canvas(r * 3 + 4, r * 2 + 3)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  shadeBlobs(
    canvas,
    [
      { x: cx - r * 0.5, y: base - r * 0.7, r: r * 0.8 },
      { x: cx + r * 0.5, y: base - r * 0.65, r: r * 0.75 },
      { x: cx, y: base - r, r },
    ],
    colors,
    seed,
  )
  canvas.rim(colors[0])
  return canvas.sprite(cx, base, r * 0.8)
}

function boulder(seed: number): Sprite {
  const random = mulberry32(seed)
  const r = 4 + Math.floor(random() * 6)
  const canvas = new Canvas(r * 3 + 4, r * 2 + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  shadeBlobs(
    canvas,
    [
      { x: cx - r * 0.45, y: base - r * 0.55, r: r * 0.8 },
      { x: cx + r * 0.5, y: base - r * 0.45, r: r * 0.65 },
      { x: cx + r * 0.05, y: base - r * 0.8, r: r * 0.9 },
    ],
    STONE,
    seed,
    0.85,
  )
  canvas.rim(STONE[0])
  return canvas.sprite(cx, base, r * 0.9)
}

function reeds(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(13, 13)
  const base = canvas.height - 1
  for (let x = 1; x < canvas.width - 1; x += 2) {
    const tall = 5 + Math.floor(random() * 7)
    const lean = random() < 0.5 ? -1 : 1
    for (let s = 0; s < tall; s++) {
      canvas.set(x + (s > tall * 0.6 ? lean : 0), base - s, s >= tall - 2 && tall > 8 ? REED[3] : REED[1 + (s & 1)])
    }
  }
  return canvas.sprite(6, base, 0)
}

// Walkers face screen right (they are mirrored to face left) and come in two stride frames.
export function shadow(canvas: Canvas, cx: number, base: number, rx: number) {
  for (let x = -rx; x <= rx; x++) {
    for (let y = -1; y <= 1; y++) {
      if ((x / rx) ** 2 + y * y * 0.5 <= 1 && !canvas.get(cx + x, base + y)) canvas.set(cx + x, base + y, SHADE)
    }
  }
}

function leg(canvas: Canvas, x: number, top: number, base: number, lean: number, colors: Uint32Array, tone: number) {
  for (let y = top; y <= base; y++) {
    const f = (y - top) / (base - top)
    canvas.set(x + lean * f, y, colors[y === base ? Math.max(0, tone - 1) : tone])
  }
}

function camel(frame: number, cloth: Uint32Array, load: number): Sprite {
  const canvas = new Canvas(30, 26)
  const base = 24
  const stride = frame === 0 ? 1 : -1
  // Far legs first, in a darker tone.
  leg(canvas, 9, base - 9, base, -stride, CAMEL, 1)
  leg(canvas, 19, base - 9, base, stride, CAMEL, 1)
  const body = new Canvas(canvas.width, canvas.height)
  shadeBlobs(
    body,
    [
      { x: 14, y: base - 11, r: 6 },
      { x: 9, y: base - 11, r: 4.5 },
      { x: 19, y: base - 11, r: 4.5 },
      { x: 13, y: base - 14, r: 4.2 },
      { x: 22, y: base - 13, r: 2 },
      { x: 23.5, y: base - 15.5, r: 1.7 },
      { x: 24.5, y: base - 18, r: 1.6 },
      { x: 25.5, y: base - 19.5, r: 2 },
      { x: 27.5, y: base - 19, r: 1.4 },
    ],
    CAMEL,
    17,
    0.85,
  )
  body.rim(CAMEL[0])
  for (let i = 0; i < body.pixels.length; i++) if (body.pixels[i]) canvas.pixels[i] = body.pixels[i]
  canvas.set(26, base - 21, CAMEL[0])
  canvas.set(26, base - 20, CAMEL[1])
  // Near legs.
  leg(canvas, 11, base - 8, base, stride, CAMEL, 3)
  leg(canvas, 21, base - 8, base, -stride, CAMEL, 3)
  // A saddle blanket over the hump, striped at its hem.
  for (let x = 8; x <= 18; x++) {
    for (let y = base - 18; y <= base - 9; y++) {
      if (!body.get(x, y)) continue
      const hem = y >= base - 10 || y === base - 13
      if (y >= base - 16 || hem) canvas.set(x, y, cloth[hem ? 3 : x < 12 ? 2 : 1])
    }
  }
  // Bundles of goods slung on the near side.
  if (load > 0) {
    for (let x = 9; x <= 13; x++) for (let y = base - 15; y <= base - 9; y++) canvas.set(x, y, SACK[x === 9 ? 3 : y === base - 9 || x === 13 ? 0 : 2])
    for (let y = base - 15; y <= base - 9; y++) canvas.set(11, y, SACK[1])
  }
  if (load > 1) {
    for (let x = 15; x <= 18; x++) for (let y = base - 19; y <= base - 15; y++) canvas.set(x, y, SACK[y === base - 19 ? 3 : x === 18 ? 0 : 2])
  }
  shadow(canvas, 15, base, 11)
  return canvas.sprite(15, base, 0)
}

export function walker(frame: number, robe: Uint32Array, guard: boolean): Sprite {
  const canvas = new Canvas(14, 22)
  const cx = 6
  const base = 20
  const stride = frame === 0 ? 1 : -1
  canvas.set(cx - 1 - stride, base, TIMBER[0])
  canvas.set(cx + 1 + stride, base, TIMBER[0])
  // Robe, widening toward the hem, lit from the left.
  for (let y = base - 10; y < base; y++) {
    const half = 1 + (y - (base - 10)) / 5
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      canvas.set(x, y, robe[x < cx ? 2 : x === cx ? 1 : 0])
    }
  }
  for (let x = cx - 2; x <= cx + 2; x++) canvas.set(x, base - 6, robe[3])
  // Head with a turban (a helmet for guards).
  canvas.set(cx, base - 11, SKIN[1])
  canvas.set(cx + 1, base - 11, SKIN[0])
  for (let x = cx - 1; x <= cx + 1; x++) {
    canvas.set(x, base - 12, guard ? STEEL[x < cx ? 2 : 1] : rgb(0xf0e8d8))
    canvas.set(x, base - 13, guard ? STEEL[1] : rgb(x < cx ? 0xf0e8d8 : 0xc8bca8))
  }
  if (guard) {
    // A spear held upright.
    for (let y = base - 17; y <= base; y++) canvas.set(cx + 3, y, y < base - 15 ? STEEL[2] : TIMBER[2])
  } else {
    // A walking staff.
    for (let y = base - 13; y <= base; y++) canvas.set(cx + 3, y, TIMBER[2])
  }
  shadow(canvas, cx, base, 4)
  return canvas.sprite(cx, base, 0)
}

// Four-legged grazers, facing screen right. Frames: two strides, then grazing with the head down.
interface BeastShape {
  colors: Uint32Array
  // Scale of the deer-sized body plan.
  size: number
  tail: number
  // Draws horns or antlers from the top of the head.
  crown?: (canvas: Canvas, x: number, y: number) => void
  // A hanging tail this many pixels long in this color, tipped with the lightest tone when `tip` is set.
  brush?: { length: number; color: number; tip?: boolean }
  // Shorter legs (boars, bears) as a share of the deer's.
  legs?: number
}

function beast(shape: BeastShape, frame: number): Sprite {
  const { colors, size, brush } = shape
  const canvas = new Canvas(Math.ceil(22 * size) + 2, Math.ceil(20 * size) + 3)
  const base = canvas.height - 2
  const at = (v: number) => v * size
  // Shorter legs lower the whole body.
  const low = base + Math.round((1 - (shape.legs ?? 1)) * at(6))
  const hip = Math.round(low - at(6))
  const stride = frame === 0 ? 1 : frame === 1 ? -1 : 0
  const graze = frame === 2
  leg(canvas, Math.round(at(6)), hip, base, -stride, colors, 0)
  leg(canvas, Math.round(at(13)), hip, base, stride, colors, 0)
  const head = graze ? { x: at(17), y: Math.min(base - at(2), low - at(3)) } : { x: at(17.5), y: low - at(14) }
  const neck = graze ? { x: at(15.5), y: low - at(6) } : { x: at(15), y: low - at(11) }
  const body = new Canvas(canvas.width, canvas.height)
  shadeBlobs(
    body,
    [
      { x: at(8), y: low - at(8.5), r: at(4.2) },
      { x: at(12), y: low - at(8.5), r: at(3.8) },
      { x: neck.x, y: neck.y, r: at(1.8) },
      { x: head.x, y: head.y, r: at(2) },
      { x: head.x + at(1.8), y: head.y + at(0.8), r: at(1.2) },
    ],
    colors,
    23,
    0.8,
  )
  body.rim(colors[0])
  for (let i = 0; i < body.pixels.length; i++) if (body.pixels[i]) canvas.pixels[i] = body.pixels[i]
  const tailX = Math.round(at(4))
  const tailY = Math.round(low - at(10))
  canvas.set(tailX, tailY, colors[shape.tail])
  canvas.set(tailX, tailY + 1, colors[shape.tail])
  if (brush) {
    // Hangs down and back from the rump, swaying a little with the stride.
    for (let i = 0; i < brush.length; i++) {
      const x = tailX - 1 - Math.floor(i / 2) + (i > brush.length / 2 ? stride : 0)
      const color = brush.tip && i >= brush.length - 2 ? colors[colors.length - 1] : brush.color
      canvas.set(x, tailY + 1 + Math.ceil(i * 0.7), color)
      if (i < brush.length - 1) canvas.set(x, tailY + Math.ceil(i * 0.7), color)
    }
  }
  leg(canvas, Math.round(at(8)), hip, base, stride, colors, 2)
  leg(canvas, Math.round(at(15)), hip, base, -stride, colors, 2)
  canvas.set(Math.round(head.x + at(0.5)), Math.round(head.y - at(0.5)), colors[0])
  shape.crown?.(canvas, Math.round(head.x - at(0.5)), Math.round(head.y - at(1.8)))
  shadow(canvas, Math.round(at(11)), base, Math.round(at(8)))
  return canvas.sprite(Math.round(at(11)), base, 0)
}

const antlers = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [0, -1], [-1, -2], [1, -2], [-2, -3], [0, -3], [2, -3], [-1, -4], [2, -4]]) {
    canvas.set(x + dx, y + dy, rgb(0xd8c49a))
  }
}
const horns = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [-1, -1], [-2, -1], [-3, 0]]) canvas.set(x + dx, y + dy, rgb(0x4a4038))
}

const ears = (canvas: Canvas, x: number, y: number) => {
  canvas.set(x, y + 1, FOX[1])
  canvas.set(x + 2, y + 1, FOX[1])
}
const pointedEars = (colors: Uint32Array) => (canvas: Canvas, x: number, y: number) => {
  canvas.set(x, y + 1, colors[1])
  canvas.set(x + 1, y, colors[0])
}
const tusks = (canvas: Canvas, x: number, y: number) => {
  canvas.set(x + 2, y + 3, rgb(0xeee6d4))
  canvas.set(x, y + 1, BOAR[0])
}
const roundEars = (canvas: Canvas, x: number, y: number) => {
  canvas.set(x - 1, y + 1, BEAR[1])
  canvas.set(x + 1, y + 1, BEAR[1])
}
const mane = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 1], [-1, 2], [-1, 3], [-2, 4], [-2, 5], [-3, 6]]) canvas.set(x + dx, y + dy, rgb(0x241610))
}
// Wide horns curving forward (aurochs) and horns curled round the ear (wild sheep).
const bullHorns = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [1, -1], [2, -1], [3, -2], [-1, -1], [-2, -2]]) canvas.set(x + dx, y + dy, rgb(0xd8ccb0))
}
const curls = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [-1, 0], [-2, 1], [-2, 2], [-1, 3], [0, 2]]) canvas.set(x + dx, y + dy, rgb(0x8a7a5c))
}
const lyre = (canvas: Canvas, x: number, y: number) => {
  for (const [dx, dy] of [[0, 0], [-1, -1], [-1, -2], [0, -3]]) canvas.set(x + dx, y + dy, rgb(0x2a2018))
}

// Hares: two hop frames (the second in the air) and a still one.
function hare(frame: number): Sprite {
  const canvas = new Canvas(10, 9)
  const base = 7
  const lift = frame === 1 ? 1 : 0
  shadeBlobs(
    canvas,
    [
      { x: 4, y: base - 2 - lift, r: 2.4 },
      { x: 6.5, y: base - 3.5 - lift, r: 1.5 },
    ],
    HARE,
    31,
    0.8,
  )
  canvas.rim(HARE[0])
  canvas.set(6, base - 6 - lift, HARE[2])
  canvas.set(6, base - 5 - lift, HARE[1])
  canvas.set(7, base - 6 - lift, HARE[1])
  canvas.set(2, base - 3 - lift, rgb(0xf0ece4))
  shadow(canvas, 4, base + 1, 3)
  return canvas.sprite(4, base + 1, 0)
}

// Ducks float on the water; the two frames bob.
function duck(frame: number): Sprite {
  const canvas = new Canvas(10, 7)
  const base = 5
  const bob = frame
  shadeBlobs(canvas, [{ x: 4, y: base - 1.5 + bob, r: 2.6 }], DUCK, 41, 0.6)
  canvas.rim(DUCK[0])
  canvas.set(6, base - 3 + bob, MALLARD[1])
  canvas.set(7, base - 3 + bob, MALLARD[1])
  canvas.set(6, base - 4 + bob, MALLARD[0])
  canvas.set(7, base - 4 + bob, MALLARD[1])
  canvas.set(8, base - 3 + bob, BILL)
  for (let x = 1; x <= 7; x++) if (!canvas.get(x, base + 1)) canvas.set(x, base + 1, RIPPLE)
  return canvas.sprite(4, base + 1, 0)
}

// Herons wade in swamps: two strides, then standing still with the neck drawn in.
function heron(frame: number): Sprite {
  const canvas = new Canvas(12, 18)
  const base = 16
  const stride = frame === 0 ? 1 : frame === 1 ? -1 : 0
  leg(canvas, 4, base - 6, base, stride, HERON, 0)
  leg(canvas, 5, base - 6, base, -stride, HERON, 1)
  shadeBlobs(canvas, [{ x: 4.5, y: base - 8, r: 2.6 }], HERON, 47, 0.75)
  const neck = frame === 2 ? [[6, 10], [7, 11], [7, 12]] : [[6, 10], [7, 11], [7, 12], [6, 13], [7, 14]]
  for (const [x, z] of neck) canvas.set(x, base - z, HERON[3])
  const top = frame === 2 ? 12 : 14
  canvas.set(8, base - top, HERON[2])
  canvas.set(9, base - top, BILL)
  canvas.set(10, base - top, BILL)
  canvas.set(2, base - 9, HERON[0])
  shadow(canvas, 5, base, 3)
  return canvas.sprite(5, base, 0)
}

// Swans glide on lakes with the neck raised in an S.
function swan(frame: number): Sprite {
  const canvas = new Canvas(13, 12)
  const base = 10
  const bob = frame
  shadeBlobs(canvas, [{ x: 5, y: base - 2 + bob, r: 3.4 }, { x: 3, y: base - 3 + bob, r: 2.4 }], SWAN, 43, 0.6)
  canvas.rim(SWAN[0])
  for (const [x, z] of [[8, 3], [9, 4], [9, 5], [8, 6], [8, 7], [9, 8]]) canvas.set(x, base - z + bob, SWAN[3])
  canvas.set(10, base - 8 + bob, BILL)
  canvas.set(11, base - 7 + bob, BILL)
  canvas.set(9, base - 9 + bob, SWAN[2])
  for (let x = 1; x <= 9; x++) if (!canvas.get(x, base + 1)) canvas.set(x, base + 1, RIPPLE)
  return canvas.sprite(5, base + 1, 0)
}

// A bird seen from below as a small V; the frames beat its wings.
function bird(frame: number): Sprite {
  const canvas = new Canvas(7, 4)
  const up = ['x.....x', '.x...x.', '..xxx..']
  const down = ['..xxx..', '.x...x.', 'x.....x']
  ;(frame === 0 ? up : down).forEach((row, y) => [...row].forEach((c, x) => c === 'x' && canvas.set(x, y, BIRD)))
  return canvas.sprite(3, 2, 0)
}

// Clouds are drawn at an eighth of world scale and shown magnified. Every type has a flat underside.
function puffs(width: number, height: number, blobs: Blob[], seed: number, squash: number, floor: number): Sprite {
  const canvas = new Canvas(width, height)
  shadeBlobs(canvas, blobs, CLOUD, seed, squash)
  for (let y = floor; y < height; y++) for (let x = 0; x < width; x++) canvas.set(x, y, 0)
  return canvas.sprite(width >> 1, height >> 1, 0)
}

// Towering heaps: big puffs in the middle, smaller ones trailing off to the sides.
function cumulus(seed: number): Sprite {
  const random = mulberry32(seed)
  const blobs: Blob[] = []
  const count = 22 + Math.floor(random() * 10)
  for (let i = 0; i < count; i++) {
    const spread = (random() + random() + random() - 1.5) / 1.5
    const r = 46 - Math.abs(spread) * 28 + random() * 14
    blobs.push({ x: 260 + spread * 200, y: 150 - r * 0.6 - random() * 20, r })
  }
  return puffs(520, 220, blobs, seed, 0.6, 156)
}

// A long, low sheet.
function stratus(seed: number): Sprite {
  const random = mulberry32(seed)
  const blobs: Blob[] = []
  for (let x = 40; x < 600; x += 12 + random() * 14) {
    blobs.push({ x, y: 70 + Math.sin(x * 0.012 + seed) * 8 + random() * 6, r: 18 + random() * 16 })
  }
  return puffs(640, 140, blobs, seed, 0.38, 96)
}

// Thin wisps drawn out by high wind.
function cirrus(seed: number): Sprite {
  const random = mulberry32(seed)
  const blobs: Blob[] = []
  const strands = 4 + Math.floor(random() * 3)
  for (let s = 0; s < strands; s++) {
    let x = 40 + random() * 120
    let y = 50 + s * 22 + random() * 12
    const lean = (random() - 0.5) * 0.4
    const length = 220 + random() * 220
    for (let t = 0; t < length; t += 6) {
      blobs.push({ x, y, r: 8 + Math.sin((t / length) * Math.PI) * 10 + random() * 3 })
      x += 6
      y += lean * 6 + Math.sin(t * 0.03 + s) * 1.5
    }
  }
  return puffs(560, 220, blobs, seed, 0.32, 220)
}

// Fair-weather clouds: small separate heaps scattered across the sky.
function scattered(seed: number): Sprite {
  const random = mulberry32(seed)
  const blobs: Blob[] = []
  const heaps = 5 + Math.floor(random() * 4)
  for (let h = 0; h < heaps; h++) {
    const cx = 60 + random() * 440
    const cy = 60 + random() * 110
    const size = 22 + random() * 14
    for (let i = 0; i < 4 + Math.floor(random() * 3); i++) {
      blobs.push({ x: cx + (random() - 0.5) * size * 2.4, y: cy - random() * size * 0.6, r: size * (0.6 + random() * 0.5) })
    }
  }
  return puffs(560, 220, blobs, seed, 0.6, 220)
}

// Rock formations for bare mountain ground. Faces are lit from the upper left, strata run across them.
function facets(canvas: Canvas, shape: (x: number, y: number) => number, snow: boolean, seed: number) {
  // `shape` returns the surface height above the base at a column, or < 0 outside; the left half faces the light.
  const base = canvas.height - 2
  for (let x = 0; x < canvas.width; x++) {
    const top = shape(x, 0)
    if (top < 0) continue
    const slope = shape(x + 1, 0) - shape(x - 1, 0)
    for (let z = 0; z <= top; z++) {
      let tone = 2.5 + Math.max(-1.6, Math.min(1.6, slope * 0.3)) + (z / (top + 1)) * 0.7 + (hash(x >> 1, z >> 1, seed) - 0.5) * 0.8
      if (Math.sin(z * 0.9 + x * 0.12 + seed) > 0.8) tone -= 1.1
      if (snow && z > top - 3 - hash(x, 1, seed) * 3) {
        canvas.set(x, base - z, CLOUD[slope > 0 ? 4 : 2])
        continue
      }
      canvas.set(x, base - z, pick(STONE, tone))
    }
  }
  canvas.rim(STONE[0])
}

// A jagged spire.
function crag(seed: number, snow: boolean): Sprite {
  const random = mulberry32(seed)
  const width = 16 + Math.floor(random() * 8)
  const tall = 24 + Math.floor(random() * 14)
  const canvas = new Canvas(width + 2, tall + 4)
  // Several uneven points with steep, broken flanks.
  const count = 3 + Math.floor(random() * 2)
  const peaks = Array.from({ length: count }, (_, i) => ({
    at: (i + 0.3 + random() * 0.4) / count,
    height: tall * (i === 1 ? 1 : 0.45 + random() * 0.4),
    steep: 1.4 + random() * 1.4,
  }))
  facets(
    canvas,
    (x) => {
      const u = (x - 1) / width
      if (u < 0 || u > 1) return -1
      const edge = Math.min(u, 1 - u) * 20
      let top = 0
      for (const p of peaks) top = Math.max(top, p.height * (1 - Math.abs(u - p.at) * p.steep))
      return Math.max(0, Math.round(Math.min(top, tall * edge * 0.3 + 2) + (hash(x >> 1, 0, seed) - 0.5) * 3))
    },
    snow,
    seed,
  )
  shadow(canvas, canvas.width >> 1, canvas.height - 2, width >> 1)
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 0)
}

// A flat, layered slab tilted out of the ground.
function slab(seed: number): Sprite {
  const random = mulberry32(seed)
  const width = 22 + Math.floor(random() * 10)
  const canvas = new Canvas(width + 2, 16)
  const lean = (random() - 0.5) * 0.3
  facets(
    canvas,
    (x) => {
      const u = (x - 1) / width
      if (u < 0 || u > 1) return -1
      return Math.round(4 + lean * x + Math.min(u, 1 - u) * 10 + (hash(x >> 2, 3, seed) > 0.7 ? 1 : 0))
    },
    false,
    seed,
  )
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 0)
}

// Rounded stones piled on one another.
function tor(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(22, 30)
  const base = canvas.height - 2
  const blobs: Blob[] = []
  let y = base - 5
  let x = 11
  for (let i = 0; i < 3 + Math.floor(random() * 2); i++) {
    const r = 6 - i + random() * 2
    blobs.push({ x, y, r })
    y -= r * 1.3
    x += (random() - 0.5) * 4
  }
  shadeBlobs(canvas, blobs, STONE, seed, 0.85)
  canvas.rim(STONE[0])
  shadow(canvas, 11, base, 8)
  return canvas.sprite(11, base, 0)
}

// A fan of loose stones at the foot of a slope.
function scree(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(26, 12)
  const base = canvas.height - 2
  for (let i = 0; i < 26; i++) {
    const x = 13 + (random() - 0.5) * 22 * (0.4 + random() * 0.6)
    const y = base - random() * 6 * (1 - Math.abs(x - 13) / 13)
    canvas.set(x, y, STONE[2 + Math.floor(random() * 3)])
    canvas.set(x + 1, y, STONE[1])
    if (random() < 0.4) canvas.set(x, y - 1, STONE[4])
  }
  return canvas.sprite(13, base, 0)
}

// A cushion of moss and alpine grass, sometimes with lichen.
function tuft(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(14, 8)
  const base = canvas.height - 1
  shadeBlobs(canvas, [{ x: 7, y: base - 1, r: 4 + random() * 2 }, { x: 4 + random() * 6, y: base - 1, r: 3 }], MOSS, seed, 0.5)
  for (let i = 0; i < 3; i++) canvas.set(3 + random() * 8, base - 2 - random() * 2, random() < 0.5 ? LICHEN : MOSS[3])
  return canvas.sprite(7, base, 0)
}

// A glint carried by the current.
function ripple(length: number): Sprite {
  const canvas = new Canvas(length, 1)
  for (let x = 0; x < length; x++) canvas.set(x, 0, RIPPLE)
  return canvas.sprite(length >> 1, 0, 0)
}

const variants = <T>(count: number, make: (seed: number) => T) => Array.from({ length: count }, (_, i) => make(i * 7919 + 13))

// Cloud types (cumulus, stratus, cirrus, scattered), each with a few shapes. They are large, so they are made on
// first use rather than in every chunk-painting worker that loads this module.
let clouds: Sprite[][] | undefined
export const cloudShapes = () =>
  (clouds ??= [variants(3, cumulus), variants(3, stratus), variants(3, cirrus), variants(3, scattered)])

export const SPRITES = {
  leaf: [
    ...variants(4, (s) => leafTree(s, LEAF[0])),
    ...variants(4, (s) => leafTree(s + 1, LEAF[1])),
    ...variants(2, (s) => leafTree(s + 2, LEAF[2])),
  ],
  pine: variants(6, pine),
  dead: variants(4, deadTree),
  bush: [...variants(3, (s) => bush(s, LEAF[0])), ...variants(2, (s) => bush(s + 1, LEAF[2]))],
  boulder: variants(6, boulder),
  reeds: variants(4, reeds),
  // camel[cloth][load][frame]
  camel: CLOTH.map((cloth) => [0, 1, 2].map((load) => [camel(0, cloth, load), camel(1, cloth, load)])),
  // merchant[robe][frame]
  merchant: CLOTH.map((robe) => [walker(0, robe, false), walker(1, robe, false)]),
  guard: [walker(0, STONE, true), walker(1, STONE, true)],
  // Animals: [walk, walk, rest] frames.
  deer: [0, 1, 2].map((f) => beast({ colors: DEER, size: 0.75, tail: 4 }, f)),
  stag: [0, 1, 2].map((f) => beast({ colors: DEER, size: 0.8, tail: 4, crown: antlers }, f)),
  goat: [0, 1, 2].map((f) => beast({ colors: GOAT, size: 0.6, tail: 3, crown: horns }, f)),
  hare: [0, 1, 0].map(hare),
  wolf: [0, 1, 2].map((f) =>
    beast({ colors: WOLF, size: 0.62, tail: 2, crown: pointedEars(WOLF), brush: { length: 6, color: WOLF[2] } }, f),
  ),
  fox: [0, 1, 2].map((f) =>
    beast({ colors: FOX, size: 0.45, tail: 2, crown: ears, legs: 0.8, brush: { length: 6, color: FOX[3], tip: true } }, f),
  ),
  boar: [0, 1, 2].map((f) => beast({ colors: BOAR, size: 0.6, tail: 1, crown: tusks, legs: 0.6 }, f)),
  bear: [0, 1, 2].map((f) => beast({ colors: BEAR, size: 0.95, tail: 2, crown: roundEars, legs: 0.7 }, f)),
  horse: HORSE.map((colors) =>
    [0, 1, 2].map((f) => beast({ colors, size: 1.05, tail: 0, crown: mane, brush: { length: 8, color: rgb(0x241610) } }, f)),
  ),
  gazelle: [0, 1, 2].map((f) => beast({ colors: GAZELLE, size: 0.6, tail: 4, crown: lyre }, f)),
  aurochs: [0, 1, 2].map((f) => beast({ colors: AUROCHS, size: 1.1, tail: 1, crown: bullHorns, legs: 0.85, brush: { length: 5, color: AUROCHS[0] } }, f)),
  sheep: [0, 1, 2].map((f) => beast({ colors: SHEEP, size: 0.55, tail: 3, crown: curls, legs: 0.7 }, f)),
  swan: [0, 1, 0].map(swan),
  duck: [0, 1, 0].map(duck),
  heron: [0, 1, 2].map(heron),
  bird: [bird(0), bird(1)],
  crag: variants(5, (s) => crag(s, false)),
  snowCrag: variants(3, (s) => crag(s + 5, true)),
  slab: variants(4, slab),
  tor: variants(3, tor),
  scree: variants(4, scree),
  tuft: variants(4, tuft),
  ripple: [ripple(3), ripple(5)],
}
