import { hash, mulberry32, valueNoise } from '@game/shared'

// A `lift` value for pixels that throw no shadow.
export const NO_SHADOW = 255

// Pixel art is generated in code for now: every sprite is a small buffer of palette colors, drawn pixel by pixel.
// Colors are packed the way an RGBA byte buffer reads them as 32-bit words (alpha in the top byte).

export interface Sprite {
  width: number
  height: number
  // The pixel that sits on the ground point the sprite is placed at.
  anchorX: number
  anchorY: number
  pixels: Uint32Array
  // Whether it casts a shadow on the ground where it is painted into it (nonzero: yes; see castShadow).
  shadow: number
  // Per pixel, how high it stands above the ground right under it (screen pixels), when the sprite knows (a model).
  lift?: Uint8Array
  // Per pixel, whether it lies flat on the ground (a paved yard); buildings only.
  flat?: Uint8Array
  // The building's shape as a few solids, when it was drawn from them (see Solid): its shadow is cast from these.
  solids?: Solid[]
}

// A solid of a building's shape, in the sprite's own pixels: a prism standing on a convex base, or a pyramid tapering
// from that base to `apex`. A point of the base is (x, g): its column and the row of the ground under it; the solid
// rises from height z0 to z1 (pixels), so a point at height z is drawn z rows above its ground.
export interface Solid {
  base: number[]
  z0: number
  z1: number
  apex?: [number, number]
}

// The base of a footprint diamond centred on (x, g) with half-width w (and half-height w / 2).
export const diamondAt = (x: number, g: number, w: number) => [x - w, g, x, g - w / 2, x + w, g, x, g + w / 2]
// The base of a round tower centred on (x, g), radius r across (r / 2 deep).
export const ellipseAt = (x: number, g: number, r: number, n = 14) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [x + Math.cos(a) * r, g + Math.sin(a) * r * 0.5]
  }).flat()

// Whether (x, g) lies inside a convex polygon given as flat [x, g, …] points (either winding).
function insidePolygon(points: number[], x: number, g: number) {
  let sign = 0
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length
    const cross = (points[j] - points[i]) * (g - points[i + 1]) - (points[j + 1] - points[i + 1]) * (x - points[i])
    if (cross === 0) continue
    if (sign === 0) sign = Math.sign(cross)
    else if (Math.sign(cross) !== sign) return false
  }
  return true
}

// Whether the point (x, g, z) is inside a solid.
export function insideSolid(solid: Solid, x: number, g: number, z: number) {
  if (z < solid.z0 || z > solid.z1) return false
  if (!solid.apex) return insidePolygon(solid.base, x, g)
  // A pyramid: at height z the base has shrunk toward the apex.
  const f = (z - solid.z0) / (solid.z1 - solid.z0 || 1)
  if (f >= 1) return false
  const [ax, ag] = solid.apex
  return insidePolygon(solid.base, ax + (x - ax) / (1 - f), ag + (g - ag) / (1 - f))
}

// Convex hull of flat [x, g, …] points (monotone chain), as flat points.
function hull(points: number[]) {
  const pts: [number, number][] = []
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts.flat()
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: [number, number][] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat()
}

// The shadow of a building drawn from solids: each solid's outline on the ground, swept from its foot to its top
// along the sun, filled. Crisp and true to the building's shape.
function solidShadow(sprite: Sprite, sun: { x: number; y: number }): Sprite {
  const shapes = sprite.solids!.map((solid) => {
    const at = (x: number, g: number, z: number) => [x + z * sun.x, g + z * sun.y]
    const points: number[] = []
    for (let i = 0; i < solid.base.length; i += 2) points.push(...at(solid.base[i], solid.base[i + 1], solid.z0))
    if (solid.apex) points.push(...at(solid.apex[0], solid.apex[1], solid.z1))
    else for (let i = 0; i < solid.base.length; i += 2) points.push(...at(solid.base[i], solid.base[i + 1], solid.z1))
    return hull(points)
  })
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const shape of shapes) {
    for (let i = 0; i < shape.length; i += 2) {
      minX = Math.min(minX, Math.floor(shape[i]))
      maxX = Math.max(maxX, Math.ceil(shape[i]))
      minY = Math.min(minY, Math.floor(shape[i + 1]))
      maxY = Math.max(maxY, Math.ceil(shape[i + 1]))
    }
  }
  if (!isFinite(minX)) return new Canvas(1, 1).sprite(0, 0, 0)
  const canvas = new Canvas(maxX - minX + 1, maxY - minY + 1)
  for (const shape of shapes) {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 0; i < shape.length; i += 2) {
      x0 = Math.min(x0, shape[i])
      x1 = Math.max(x1, shape[i])
      y0 = Math.min(y0, shape[i + 1])
      y1 = Math.max(y1, shape[i + 1])
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        if (insidePolygon(shape, x + 0.5, y + 0.5)) canvas.pixels[(y - minY) * canvas.width + x - minX] = 0xffffffff
      }
    }
  }
  return canvas.sprite(sprite.anchorX - minX, sprite.anchorY - minY, 0)
}

// The pixels of a building (placed with its anchor at x, y on screen) in the shade of other buildings: where the line
// from the pixel toward the sun passes through another building's solids. Each other building comes with its shadow
// (castShadow, same sun) for a quick test first. Parts standing on the same spot belong to the building itself, and
// walls do not shade walls (a run of wall is lit as one model already). Null when nothing falls on it.
interface Placed {
  look: Sprite
  x: number
  y: number
}
export interface ShadeJob {
  // Works on until the clock passes `deadline` (performance.now()); true once finished.
  step(deadline: number): boolean
  // What fell on the building, once finished.
  result(): Sprite | null
}
const NOTHING: ShadeJob = { step: () => true, result: () => null }
export function shadeOn(target: Placed, others: (Placed & { shadow: Sprite })[], sun: { x: number; y: number }): ShadeJob {
  const { look } = target
  const lift = solidLiftOf(look)
  if (!lift) return NOTHING
  const left = target.x - look.anchorX
  const top = target.y - look.anchorY
  // Only buildings up and to the left of it on screen can stand between it and the sun.
  const reach = 260
  const near = others.flatMap((o) => {
    if (o.x === target.x && o.y === target.y) return []
    const solids = o.look.solids
    if (!solids || (o.look.lift && look.lift)) return []
    const ol = o.x - o.look.anchorX
    const ot = o.y - o.look.anchorY
    if (ol > left + look.width || ol + o.look.width < left - reach || ot > top + look.height || ot + o.look.height < top - reach) return []
    const boxed = solids.map((solid) => {
      const xs = solid.base.filter((_, i) => i % 2 === 0)
      const gs = solid.base.filter((_, i) => i % 2 === 1)
      return { solid, x0: Math.min(...xs), x1: Math.max(...xs), g0: Math.min(...gs), g1: Math.max(...gs) }
    })
    return [{ ...o, boxed, ol, ot, z: Math.max(...solids.map((s) => s.z1)) }]
  })
  if (near.length === 0) return NOTHING
  const canvas = new Canvas(look.width, look.height)
  let any = false
  let row = 0
  const shadeRow = (y: number) => {
    for (let x = 0; x < look.width; x++) {
      const i = y * look.width + x
      if (look.pixels[i] >>> 24 !== 0xff) continue
      const h = lift[i]
      // The point on screen, and the ground under it.
      const px = left + x + 0.5
      const pg = top + y + 0.5 + h
      for (const o of near) {
        // The line toward the sun runs up and to the left on screen: a building right of or below the point is no use.
        if (o.ol > px || o.ot > top + y + 0.5) continue
        // Quick test: the point's own shadow would land inside the other building's shadow.
        const qx = Math.floor(px + h * sun.x) - (o.x - o.shadow.anchorX)
        const qy = Math.floor(pg + h * sun.y) - (o.y - o.shadow.anchorY)
        if (qx < 0 || qy < 0 || qx >= o.shadow.width || qy >= o.shadow.height || !o.shadow.pixels[qy * o.shadow.width + qx]) continue
        let hit = false
        for (let t = 1; t <= o.z - h && !hit; t += 1.5) {
          const sx = px - t * sun.x - o.ol
          const sg = pg - t * sun.y - o.ot
          const z = h + t
          for (const b of o.boxed) {
            if (z < b.solid.z0 || z > b.solid.z1 || sx < b.x0 || sx > b.x1 || sg < b.g0 || sg > b.g1) continue
            if (insideSolid(b.solid, sx, sg, z)) {
              hit = true
              break
            }
          }
        }
        if (hit) {
          canvas.pixels[i] = 0xffffffff
          any = true
          break
        }
      }
    }
  }
  return {
    step(deadline) {
      while (row < look.height) {
        shadeRow(row++)
        if (performance.now() > deadline) break
      }
      return row >= look.height
    },
    result: () => (any ? canvas.sprite(look.anchorX, look.anchorY, 0) : null),
  }
}

// Per pixel of a building drawn from solids, how high the surface seen there stands over its ground: the point of
// the solids nearest the viewer along the pixel's line of sight. 0 where no solid is seen (props, yards).
const solidLifts = new WeakMap<Sprite, Uint8Array>()
export function solidLiftOf(sprite: Sprite): Uint8Array | null {
  if (!sprite.solids) return sprite.lift ?? null
  let lift = solidLifts.get(sprite)
  if (lift) return lift
  const { width, height, pixels, solids } = sprite
  lift = new Uint8Array(pixels.length)
  for (let x = 0; x < width; x++) {
    const cx = x + 0.5
    // Per solid, the span of ground rows its base covers in this column (a prism is seen there from z0 to z1).
    const spans = solids.map((solid) => {
      let g0 = Infinity
      let g1 = -Infinity
      const b = solid.base
      for (let i = 0; i < b.length; i += 2) {
        const j = (i + 2) % b.length
        const [xa, ga, xb, gb] = [b[i], b[i + 1], b[j], b[j + 1]]
        if ((cx < Math.min(xa, xb)) || cx > Math.max(xa, xb)) continue
        const g = xa === xb ? Math.min(ga, gb) : ga + ((cx - xa) / (xb - xa)) * (gb - ga)
        const g2 = xa === xb ? Math.max(ga, gb) : g
        g0 = Math.min(g0, g)
        g1 = Math.max(g1, g2)
      }
      return { solid, g0, g1 }
    })
    for (let y = 0; y < height; y++) {
      const i = y * width + x
      if (pixels[i] >>> 24 !== 0xff) continue
      const cy = y + 0.5
      let best = -1
      for (const { solid, g0, g1 } of spans) {
        if (!isFinite(g0)) continue
        if (!solid.apex) {
          // Seen at height z where the ground row cy + z lies on the base: the highest such z.
          const z = Math.min(solid.z1, g1 - cy)
          if (z >= Math.max(solid.z0, g0 - cy) && z > best) best = z
          continue
        }
        for (let z = Math.floor(Math.min(solid.z1, g1 - cy)); z >= Math.max(solid.z0, best + 1, 0); z--) {
          if (insideSolid(solid, cx, cy + z, z)) {
            best = z
            break
          }
        }
      }
      if (best > 0) lift[i] = Math.min(NO_SHADOW - 1, Math.round(best))
    }
  }
  solidLifts.set(sprite, lift)
  return lift
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
// Spruce and fir: darker and bluer than the pines.
const FIR = ramp(0x0b2026, 0x113430, 0x18473d, 0x22594a, 0x317058, 0x468668)
const BIRCH_LEAF = ramp(0x2f4a22, 0x46682b, 0x678e38, 0x8cae48, 0xb2cb62, 0xd6e286)
const BIRCH_BARK = ramp(0x3a3632, 0xa8a296, 0xd2ccbe, 0xeeebe2)
// Trees turning early: rust and gold, a patch here and there in the woods.
const AUTUMN = [
  ramp(0x48200f, 0x6e3014, 0x984a1c, 0xbe6a26, 0xd98e36, 0xecb658),
  ramp(0x4a3812, 0x6e5618, 0x957a22, 0xb89a30, 0xd4ba46, 0xeada74),
]
const BLOSSOM = ramp(0xb0506e, 0xd77a96, 0xf2a8bc, 0xffd8e2)
export const BARK = ramp(0x2e2119, 0x4a3424, 0x6b4c31, 0x8a6841)
const DEAD = ramp(0x2b2823, 0x464037, 0x655c4d, 0x857a65)
export const STONE = ramp(0x2e2c3d, 0x474454, 0x64606c, 0x858088, 0xa7a2a1, 0xc6c1b6)
const REED = ramp(0x34452a, 0x516634, 0x748a42, 0x5a3d26)
const RUSH = ramp(0x27401f, 0x3e622a, 0x5b8636, 0x82a84a, 0xaac668)
const CATTAIL = ramp(0x3a2414, 0x5e3a20, 0x7e5430)
// Fruit: red and yellow apples, pears, plums, apricots (shaded, base, lit).
const FRUIT = {
  apple: ramp(0x8a1c1c, 0xc8342a, 0xf07a5a),
  goldApple: ramp(0x8a7a1a, 0xc8b832, 0xf0e27a),
  pear: ramp(0x6e7a22, 0xa8b43a, 0xdce07a),
  plum: ramp(0x2e1a4a, 0x553078, 0x8a62b0),
  apricot: ramp(0x9a4a14, 0xe0802a, 0xf8b462),
}
// Meadow flowers: poppy, daisy (white with a yellow eye), cornflower, buttercup, clover and lavender.
const MEADOW = [
  ramp(0x8a1c18, 0xd8302a, 0xf06a50),
  ramp(0xb8b4a8, 0xf4f2ea, 0xffffff, 0xf2cf4a),
  ramp(0x23347a, 0x3e5ed0, 0x7a96ea),
  ramp(0xa07a10, 0xf2cf2a, 0xfff08a),
  ramp(0x8a3a6a, 0xd06aa0, 0xf0a8cc),
  ramp(0x4a3a7a, 0x8a72c8, 0xb8a8ea),
]
const GRASS_TALL = [ramp(0x2f5a2a, 0x4f8a3a, 0x6aa246, 0xc8c07a), ramp(0x4a5a26, 0x7a8a36, 0x9caa4a, 0xe0d08a)]
const BERRY = [ramp(0x6a0e1a, 0xc0202e), ramp(0x1a1630, 0x3a3270)]
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
  // The solids the building is drawn from (see Solid), for its shadow.
  solids: Solid[] = []
  // While set, what is drawn lies flat on the ground (see Sprite.flat); drawing anything else over it lifts it again.
  paving = false
  flat: Uint8Array | null = null
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.pixels = new Uint32Array(width * height)
  }
  set(x: number, y: number, color: number) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = y * this.width + x
    this.pixels[i] = color
    if (this.paving) (this.flat ??= new Uint8Array(this.pixels.length))[i] = 1
    else if (this.flat) this.flat[i] = 0
  }
  // Records a solid of the shape being drawn (see Solid).
  solid(base: number[], z0: number, z1: number, apex?: [number, number]) {
    this.solids.push({ base, z0, z1, ...(apex && { apex }) })
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
    return { width: this.width, height: this.height, anchorX, anchorY, pixels: this.pixels, shadow, ...(this.flat && { flat: this.flat }), ...(this.solids.length > 0 && { solids: this.solids }) }
  }
}

// A sprite's silhouette: every solid pixel in white (tint it), anchored like the sprite.
const silhouettes = new WeakMap<Sprite, Sprite>()
export function silhouetteOf(sprite: Sprite): Sprite {
  const cached = silhouettes.get(sprite)
  if (cached) return cached
  const pixels = new Uint32Array(sprite.pixels.length)
  for (let i = 0; i < pixels.length; i++) if (sprite.pixels[i] >>> 24 === 0xff) pixels[i] = 0xffffffff
  const shape = { ...sprite, pixels, shadow: 0 }
  silhouettes.set(sprite, shape)
  return shape
}

// How high each pixel of a building stands above the ground under it, guessed from the picture: a column of the
// building rises from its lowest pixel (the foot of its front walls), and paved yard lies flat.
const lifts = new WeakMap<Sprite, Uint8Array>()
function liftOf(sprite: Sprite): Uint8Array {
  let lift = lifts.get(sprite)
  if (lift) return lift
  const { width, height, pixels, flat } = sprite
  lift = new Uint8Array(pixels.length)
  for (let x = 0; x < width; x++) {
    let foot = -1
    for (let y = height - 1; y >= 0 && foot < 0; y--) {
      const i = y * width + x
      if (pixels[i] >>> 24 === 0xff && !flat?.[i]) foot = y
    }
    for (let y = 0; y < foot; y++) lift[y * width + x] = Math.min(255, foot - y)
  }
  lifts.set(sprite, lift)
  return lift
}

// The shadow a sprite throws on flat ground, in white (tint it), anchored like the sprite: each solid pixel lands its
// height times `sun` away from the ground under it. A building (`building`) knows each pixel's height (a model's
// lift) or has it guessed (liftOf); anything else stands on one point, its anchor. `flip` casts the sprite as drawn
// mirrored; the shadow itself is never mirrored, the sun does not move.
export function castShadow(sprite: Sprite, sun: { x: number; y: number }, building = false, flip = false): Sprite {
  if (sprite.solids && !flip) return solidShadow(sprite, sun)
  const { width, height, anchorY, pixels } = sprite
  const anchorX = flip ? width - sprite.anchorX : sprite.anchorX
  const lift = sprite.lift ?? (building ? liftOf(sprite) : null)
  const steps = Math.ceil(Math.max(sun.x, sun.y, 1) * 2) + 1
  const points: number[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (px: number, py: number) => {
    points.push(px, py)
    if (px < minX) minX = px
    if (px > maxX) maxX = px
    if (py < minY) minY = py
    if (py > maxY) maxY = py
  }
  for (let x = 0; x < width; x++) {
    const from = flip ? width - 1 - x : x
    for (let y = 0; y < height; y++) {
      const i = y * width + from
      if (pixels[i] >>> 24 !== 0xff) continue
      // Marked as throwing no shadow at all (a banner's cloth and pole).
      if (lift && lift[i] === NO_SHADOW) continue
      const rise = lift ? lift[i] : anchorY - y
      if (rise <= 0) {
        if (lift) add(x, y)
        continue
      }
      const ground = y + rise
      for (let s = 0; s < steps; s++) {
        const h = rise - s / steps
        add(Math.floor(x + h * sun.x), Math.floor(ground + h * sun.y))
      }
    }
  }
  if (points.length === 0) return new Canvas(1, 1).sprite(0, 0, 0)
  const canvas = new Canvas(maxX - minX + 1, maxY - minY + 1)
  for (let i = 0; i < points.length; i += 2) canvas.pixels[(points[i + 1] - minY) * canvas.width + points[i] - minX] = 0xffffffff
  // Pixels the slanting columns stepped over, between two shadowed neighbours, are shadow too: one solid shape.
  for (let pass = 0; pass < 2; pass++) {
    const { width: cw, height: ch, pixels: px } = canvas
    const fill: number[] = []
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const o = y * cw + x
        if (px[o]) continue
        const across = x > 0 && x < cw - 1 && px[o - 1] && px[o + 1]
        const down = y > 0 && y < ch - 1 && px[o - cw] && px[o + cw]
        if (across || down) fill.push(o)
      }
    }
    for (const o of fill) px[o] = 0xffffffff
  }
  return canvas.sprite(anchorX - minX, anchorY - minY, 0)
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

// A slender tree with a white, black-marked trunk and a small, airy crown in loose clumps.
function birch(seed: number): Sprite {
  const random = mulberry32(seed)
  const r = 6 + Math.floor(random() * 3)
  const tall = 30 + Math.floor(random() * 10)
  const canvas = new Canvas(r * 2 + 12, tall + 6)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  const lean = (random() - 0.5) * 3
  for (let y = base - tall + r; y <= base; y++) {
    const f = (base - y) / tall
    const x = cx + lean * f
    const mark = hash(Math.round(y / 2), 0, seed) < 0.22
    canvas.set(x - 1, y, mark ? BIRCH_BARK[0] : BIRCH_BARK[3])
    canvas.set(x, y, mark && hash(y, 1, seed) < 0.6 ? BIRCH_BARK[0] : BIRCH_BARK[2])
    if (y >= base - 1) canvas.set(x + 1, y, BIRCH_BARK[1])
  }
  const blobs: Blob[] = []
  const clumps = 7 + Math.floor(random() * 3)
  for (let i = 0; i < clumps; i++) {
    const f = 0.5 + (i / clumps) * 0.42
    // Wider in the middle of the crown, narrow at its top.
    const spread = Math.sin(((i + 0.5) / clumps) * Math.PI) * r * 0.9 + 1
    blobs.push({
      x: cx + lean * f + (random() - 0.5) * spread * 2,
      y: base - tall * f - r * 0.1,
      r: r * (0.42 + random() * 0.25),
    })
  }
  // Thin twigs from the trunk out to the clumps.
  for (const b of blobs) if (Math.abs(b.x - cx) > 2) limb(canvas, cx + lean * 0.6, b.y + 4, b.x, b.y, 0, BIRCH_BARK)
  const leaves = new Canvas(canvas.width, canvas.height)
  shadeBlobs(leaves, blobs, BIRCH_LEAF, seed)
  leaves.rim(BIRCH_LEAF[0])
  // Gaps in the crown let the trunk show through.
  for (let i = 0; i < leaves.pixels.length; i++) {
    if (leaves.pixels[i] && valueNoise((i % canvas.width) * 0.6, Math.floor(i / canvas.width) * 0.6, seed) > 0.12) canvas.pixels[i] = leaves.pixels[i]
  }
  return canvas.sprite(cx, base, r * 0.8)
}

// A tall, narrow column of leaves (a poplar), standing alone or in rows along open ground.
function poplar(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 40 + Math.floor(random() * 12)
  const half = 5 + Math.floor(random() * 2)
  const canvas = new Canvas(half * 2 + 8, tall + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  trunk(canvas, cx, base, base - 8, BARK)
  const blobs: Blob[] = []
  for (let y = base - 8; y > base - tall + half; y -= 3) {
    const f = (base - y) / tall
    const w = half * Math.sin(Math.min(1, f * 1.15) * Math.PI) ** 0.6 + 1.5
    blobs.push({ x: cx + (random() - 0.5) * 2, y, r: w })
  }
  const leaves = new Canvas(canvas.width, canvas.height)
  shadeBlobs(leaves, blobs, LEAF[1], seed, 1)
  leaves.rim(LEAF[1][0])
  for (let i = 0; i < leaves.pixels.length; i++) if (leaves.pixels[i]) canvas.pixels[i] = leaves.pixels[i]
  return canvas.sprite(cx, base, half * 0.9)
}

// A broadleaf tree in flower: the leafy crown dusted with blossom.
function blossomTree(seed: number): Sprite {
  const tree = leafTree(seed, LEAF[0])
  const pixels = tree.pixels.slice()
  const { width } = tree
  for (let i = 0; i < pixels.length; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    // Only on the crown (the leaf colours), more on its lit side.
    if (!LEAF[0].includes(pixels[i]) || pixels[i] === LEAF[0][0]) continue
    const lit = LEAF[0].indexOf(pixels[i])
    if (hash(x, y, seed + 3) < 0.18 + lit * 0.07) pixels[i] = BLOSSOM[Math.min(3, Math.max(0, lit - 2 + (hash(x, y, seed + 5) < 0.5 ? 0 : 1)))]
  }
  return { ...tree, pixels }
}

// Trees in flower, each kind its own blossom: cherry, apple, almond, lilac and the yellow chains of laburnum.
const PETALS = {
  cherry: ramp(0x8a3050, 0xc85a80, 0xec94b2, 0xffcadb),
  apple: ramp(0xa8a29c, 0xd4d0c8, 0xf0eee6, 0xffffff),
  almond: ramp(0xb4808e, 0xdcaab8, 0xf4d6de, 0xfff0f2),
  lilac: ramp(0x46366e, 0x6a54a0, 0x9682c8, 0xc2b2e6),
  laburnum: ramp(0x86640e, 0xc49c1e, 0xeac63e, 0xfff07a),
}
const CHERRY_BARK = ramp(0x241212, 0x40201e, 0x5e342e, 0x7c4c40)

interface Bloom {
  petals: Uint32Array
  leaves: Uint32Array
  // How much of the crown is in flower, 0..1.
  cover: number
  bark?: Uint32Array
  // A great old tree, about twice the size, on a thick trunk.
  big?: boolean
  // Flowers hanging in chains under the crown.
  hanging?: boolean
}

// A tree in flower: a leafy crown dusted (or smothered) in blossom, more on its lit side, and fallen petals on the
// ground round its foot. The petals lie flat: drawn a hair short of opaque, they throw no shadow and are never picked.
function flowering(seed: number, b: Bloom): Sprite {
  const random = mulberry32(seed)
  const s = b.big ? 1.9 : 1
  const r = Math.round((8 + random() * 3) * s)
  const canvas = new Canvas(Math.round(r * 2.7) + 16, Math.round(r * 2 + 26 * s) + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 4
  const cy = Math.round(base - 11 * s - r * 0.7)
  const bark = b.bark ?? BARK
  if (b.big) {
    thickTrunk(canvas, cx, base, cy, 2, bark, seed)
    // Limbs spreading up into the crown.
    for (const dir of [-1, 1]) for (let t = 0; t < r * 0.7; t++) canvas.set(cx + dir * (2 + t * 0.8), cy + r * 0.25 - t * 0.6, bark[dir < 0 ? 2 : 1])
  } else trunk(canvas, cx, base, cy, bark)
  // A wide, rounded crown of a few lumps.
  const blobs: Blob[] = [{ x: cx, y: cy, r }]
  const lumps = 5 + Math.floor(random() * 3)
  for (let i = 0; i < lumps; i++) {
    const angle = (i / lumps) * Math.PI * 2 + random()
    blobs.push({ x: cx + Math.cos(angle) * r * 0.78, y: cy + Math.sin(angle) * r * 0.45, r: r * (0.42 + random() * 0.22) })
  }
  const crown = new Canvas(canvas.width, canvas.height)
  shadeBlobs(crown, blobs, b.leaves, seed)
  crown.rim(b.leaves[0])
  for (let i = 0; i < crown.pixels.length; i++) {
    const c = crown.pixels[i]
    if (!c) continue
    const x = i % canvas.width
    const y = Math.floor(i / canvas.width)
    const lit = b.leaves.indexOf(c)
    let color = c
    if (lit > 0 && hash(x, y, seed + 3) < b.cover * (0.55 + lit * 0.11)) color = b.petals[Math.min(3, Math.max(0, lit - 2 + (hash(x, y, seed + 5) < 0.5 ? 0 : 1)))]
    canvas.pixels[i] = color
  }
  if (b.hanging) {
    // Chains of flowers hanging from the underside of the crown.
    for (let x = 1; x < canvas.width - 1; x++) {
      let bottom = -1
      for (let y = canvas.height - 1; y >= 0 && bottom < 0; y--) if (crown.pixels[y * canvas.width + x]) bottom = y
      if (bottom < 0 || hash(x, 7, seed) > 0.55) continue
      const length = 2 + Math.floor(hash(x, 9, seed) * 4 * s)
      for (let d = 1; d <= length; d++) canvas.set(x, bottom + d, b.petals[d === length ? 1 : 3 - (d & 1)])
    }
  }
  // Fallen petals scattered round the foot, thicker toward the trunk.
  const fallen = Math.round(r * 2.2)
  for (let n = 0; n < fallen; n++) {
    const a = random() * Math.PI * 2
    const d = Math.sqrt(random()) * r * 0.95
    const x = Math.round(cx + Math.cos(a) * d)
    const y = Math.round(base - 1 + Math.sin(a) * d * 0.45)
    if (canvas.get(x, y)) continue
    canvas.set(x, y, ((b.petals[2 + (n & 1)] & 0x00ffffff) | 0xfe000000) >>> 0)
  }
  return canvas.sprite(cx, base, r * 0.95)
}

// A trunk several pixels thick, lit from the left, with roots spreading over the ground at its foot.
function thickTrunk(canvas: Canvas, cx: number, base: number, top: number, half: number, colors: Uint32Array, seed: number) {
  for (let y = top; y <= base; y++) {
    const f = (y - top) / (base - top)
    const w = half + (f > 0.8 ? (f - 0.8) * 5 * half * 0.9 : 0)
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
      const side = (x - cx) / (w + 0.01)
      const groove = hash(x, y >> 2, seed) < 0.18 ? -1 : 0
      canvas.set(x, y, pick(colors, 2.2 - side * 1.6 + groove))
    }
  }
  // Roots: short runs out from the foot.
  for (const dir of [-1, 1]) {
    for (let s = 0; s < half + 3; s++) canvas.set(cx + dir * (half + 1 + s), base - (s < 2 ? 1 : 0), colors[dir < 0 ? 2 : 0])
  }
}

// A branch from (x0, y0) to (x1, y1), thinning toward its end.
function limb(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, width: number, colors: Uint32Array) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    const w = Math.max(0, Math.round(width * (1 - t * 0.7)))
    for (let d = -w; d <= w; d++) canvas.set(x + d, y, colors[d < 0 ? 2 : d === 0 ? 1 : 0])
  }
}

// A great old oak, rare: a broad, thick trunk forking into limbs that hold up several heavy clumps of leaves.
function oak(seed: number, colors: Uint32Array): Sprite {
  const random = mulberry32(seed)
  const r = 17 + Math.floor(random() * 4)
  const canvas = new Canvas(r * 3 + 16, Math.round(r * 2.6) + 30)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  const fork = base - 16 - Math.floor(random() * 4)
  thickTrunk(canvas, cx, base, fork, 3, BARK, seed)
  const clusters = 3 + Math.floor(random() * 2)
  const blobs: Blob[] = []
  for (let c = 0; c < clusters; c++) {
    const angle = Math.PI * (0.15 + (0.7 * (c + 0.5)) / clusters) + (random() - 0.5) * 0.3
    const hx = cx - Math.cos(angle) * r * 0.95
    const hy = fork - Math.sin(angle) * r * 0.9 - 4
    limb(canvas, cx + (hx > cx ? 1 : -1), fork + 2, hx, hy + 4, 2, BARK)
    const lumps = 3 + Math.floor(random() * 3)
    blobs.push({ x: hx, y: hy, r: r * 0.55 })
    for (let i = 0; i < lumps; i++) {
      const a = random() * Math.PI * 2
      blobs.push({ x: hx + Math.cos(a) * r * 0.42, y: hy + Math.sin(a) * r * 0.3, r: r * (0.3 + random() * 0.18) })
    }
  }
  blobs.push({ x: cx, y: fork - r * 1.05, r: r * 0.62 })
  const leaves = new Canvas(canvas.width, canvas.height)
  shadeBlobs(leaves, blobs, colors, seed)
  leaves.rim(colors[0])
  // The underside of the crown, between the clumps, opens onto the limbs.
  for (let i = 0; i < leaves.pixels.length; i++) {
    if (!leaves.pixels[i]) continue
    const x = i % canvas.width
    const y = Math.floor(i / canvas.width)
    if (y > fork - 6 && valueNoise(x * 0.3, y * 0.3, seed) < 0.38) continue
    canvas.pixels[i] = leaves.pixels[i]
  }
  return canvas.sprite(cx, base, r * 1.1)
}

// A towering old pine, rare: twice the height of the others, bare low down, its crown in ragged layers.
function giantPine(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 72 + Math.floor(random() * 14)
  const half = 13 + Math.floor(random() * 3)
  const canvas = new Canvas(half * 2 + 8, tall + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  thickTrunk(canvas, cx, base, base - tall + 10, 1.6, BARK, seed)
  // Dead stubs of lower branches on the bare trunk.
  for (let y = base - 10; y > base - tall * 0.42; y -= 5 + Math.floor(random() * 3)) {
    const dir = random() < 0.5 ? -1 : 1
    for (let s = 2; s < 5; s++) canvas.set(cx + dir * s, y - s * 0.4, BARK[dir < 0 ? 2 : 0])
  }
  const crown = new Canvas(canvas.width, canvas.height)
  const tiers = 6
  for (let t = 0; t < tiers; t++) {
    const top = base - tall + (t / tiers) * tall * 0.62
    const bottom = top + tall * 0.17 + 3
    const w = half * (0.35 + (0.65 * (t + 1)) / tiers) * (0.85 + random() * 0.3)
    const off = (random() - 0.5) * 3
    for (let y = Math.floor(top); y <= bottom; y++) {
      const f = (y - top) / (bottom - top)
      const reach = w * f + 0.6
      for (let x = Math.ceil(cx + off - reach); x <= cx + off + reach; x++) {
        if (f > 0.7 && hash(x, t, seed) < (f - 0.7) * 3) continue
        const side = (x - cx - off) / (reach + 0.01)
        const tone = 3.1 - side * 2 - (f > 0.75 ? 1.3 : 0) + (f < 0.3 ? 0.7 : 0) + (hash(x, y, seed + 1) - 0.5) * 1.4
        crown.set(x, y, pick(FIR, tone))
      }
    }
  }
  crown.rim(FIR[0])
  for (let i = 0; i < crown.pixels.length; i++) if (crown.pixels[i]) canvas.pixels[i] = crown.pixels[i]
  return canvas.sprite(cx, base, half * 0.9)
}

// A spruce: a narrow, dense cone of many short tiers, darker than the pines.
function fir(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 38 + Math.floor(random() * 12)
  const half = 7 + Math.floor(random() * 2)
  const canvas = new Canvas(half * 2 + 5, tall + 4)
  const cx = canvas.width >> 1
  const base = canvas.height - 1
  trunk(canvas, cx, base, base - 5, BARK)
  const crown = new Canvas(canvas.width, canvas.height)
  const tiers = 7
  for (let t = 0; t < tiers; t++) {
    const top = base - 4 - ((tiers - t) / tiers) * (tall - 4)
    const bottom = top + (tall - 4) / tiers + 3
    const w = half * ((t + 1) / tiers) ** 0.8
    for (let y = Math.floor(top); y <= bottom; y++) {
      const f = (y - top) / (bottom - top)
      const reach = w * (0.15 + f * 0.85) + 0.5
      for (let x = Math.ceil(cx - reach); x <= cx + reach; x++) {
        // Drooping, toothed tips at the bottom of each tier.
        if (f > 0.6 && Math.abs(x - cx) > reach - 2.5 && hash(x, t, seed + 2) < (f - 0.6) * 2.5) continue
        const side = (x - cx) / (reach + 0.01)
        const tone = 3.2 - side * 2.1 - (f > 0.65 ? 1.6 : 0) + (f < 0.3 ? 0.8 : 0) + (hash(x, y, seed + 1) - 0.5) * 1.2
        crown.set(x, y, pick(FIR, tone))
      }
    }
  }
  // A light tip.
  crown.set(cx, base - tall, FIR[4])
  crown.rim(FIR[0])
  for (let i = 0; i < crown.pixels.length; i++) if (crown.pixels[i]) canvas.pixels[i] = crown.pixels[i]
  return canvas.sprite(cx, base, half * 0.85)
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

// A thick stand of rushes at the water's edge: blades of several greens, bent at the top, some carrying the brown
// heads of bulrushes.
function rushes(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(19, 18)
  const base = canvas.height - 1
  const blades = 13 + Math.floor(random() * 5)
  for (let n = 0; n < blades; n++) {
    // Taller in the middle of the stand; the blades further back are in shade.
    const x = 2 + random() * 14
    const tall = Math.round(5 + random() * 6 + (1 - Math.abs(x - 9) / 9) * 5)
    const lean = (random() - 0.5) * 0.6
    const head = tall > 11 && random() < 0.3
    const tone = 1 + Math.floor(random() * 3)
    for (let s = 0; s < tall; s++) {
      const bend = s > tall * 0.6 ? (s - tall * 0.6) * lean * 1.6 : 0
      // Lit toward the tip, dark at the foot.
      canvas.set(x + s * lean * 0.3 + bend, base - s, RUSH[s < 2 ? 0 : Math.min(4, tone + (s > tall * 0.7 ? 1 : 0))])
    }
    // A bulrush head: a short brown cigar, lit on its left, just under the tip.
    if (head) {
      for (let s = tall - 4; s < tall - 1; s++) {
        canvas.set(x + s * lean * 0.3, base - s, CATTAIL[2])
        canvas.set(x + s * lean * 0.3 + 1, base - s, CATTAIL[s === tall - 4 ? 0 : 1])
      }
    }
  }
  return canvas.sprite(9, base, 0)
}

// A broadleaf tree hung with fruit: apples, pears, plums, apricots. More fruit on the lit side, and a few windfalls
// in the grass at its foot (a hair short of opaque, so they throw no shadow).
function fruitTree(seed: number, fruit: Uint32Array, leaves: Uint32Array): Sprite {
  const tree = leafTree(seed, leaves)
  const canvas = new Canvas(tree.width, tree.height + 3)
  canvas.pixels.set(tree.pixels)
  const crown = (x: number, y: number) => {
    const c = canvas.get(x, y)
    return c !== 0 && leaves.includes(c)
  }
  const random = mulberry32(seed + 1)
  const count = 18 + Math.floor(random() * 10)
  for (let n = 0, tries = 0; n < count && tries < 400; tries++) {
    const x = Math.floor(random() * canvas.width)
    const y = Math.floor(random() * tree.height)
    if (!crown(x, y) || !crown(x + 1, y + 1) || !crown(x - 1, y - 1)) continue
    const lit = leaves.indexOf(canvas.get(x, y))
    if (lit < 2 && random() < 0.5) continue
    // Fruit apart from one another.
    if (!leaves.includes(canvas.get(x + 2, y)) || !leaves.includes(canvas.get(x - 1, y))) continue
    canvas.set(x, y, fruit[1])
    canvas.set(x + 1, y, fruit[0])
    canvas.set(x, y - 1, lit > 2 ? fruit[2] : fruit[1])
    canvas.set(x + 1, y - 1, fruit[1])
    n++
  }
  const base = tree.anchorY
  for (let n = 0; n < 4; n++) {
    const x = Math.round(tree.anchorX + (random() - 0.5) * tree.shadow * 2.2)
    const y = Math.round(base + 1 + random() * 2)
    if (!canvas.get(x, y)) canvas.set(x, y, ((fruit[1] & 0x00ffffff) | 0xfe000000) >>> 0)
  }
  return canvas.sprite(tree.anchorX, base, tree.shadow)
}

// A patch of wildflowers in the meadow grass: short stems and bright heads, mostly of one kind.
function wildflowers(seed: number, petals: Uint32Array): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(28, 13)
  const base = canvas.height - 1
  const count = 22 + Math.floor(random() * 12)
  // Back to front, so nearer flowers stand over the ones behind.
  const spots: [number, number][] = []
  for (let n = 0; n < count; n++) {
    // Scattered over a flat ellipse on the ground, thicker in the middle.
    const a = random() * Math.PI * 2
    const d = random() ** 0.7
    spots.push([Math.round(14 + Math.cos(a) * d * 12), Math.round(base - 3 + Math.sin(a) * d * 3.5)])
  }
  spots.sort((p, q) => p[1] - q[1])
  for (const [x, y] of spots) {
    const stem = 1 + Math.floor(random() * 3)
    for (let s = 0; s < stem; s++) canvas.set(x, y - s, LEAF[0][s === 0 ? 2 : 3])
    if (random() < 0.4) canvas.set(x + 1, y, LEAF[0][4])
    // A head of two or three pixels, lit on its upper left, some with a bright eye.
    const top = y - stem
    canvas.set(x, top, petals[1])
    canvas.set(x + 1, top, petals[0])
    canvas.set(x, top - 1, petals[2])
    if (random() < 0.5) canvas.set(x - 1, top, petals[2])
    if (petals.length > 3 && random() < 0.7) canvas.set(x, top, petals[3])
  }
  return canvas.sprite(14, base, 0)
}

// A clump of tall meadow grass, some of it gone to seed.
function tallGrass(seed: number, colors: Uint32Array): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(14, 11)
  const base = canvas.height - 1
  const blades = 8 + Math.floor(random() * 5)
  for (let n = 0; n < blades; n++) {
    const x = 2 + random() * 10
    const tall = Math.round(4 + random() * 5 + (1 - Math.abs(x - 7) / 7) * 2)
    const lean = (x - 7) * 0.12 + (random() - 0.5) * 0.4
    for (let s = 0; s < tall; s++) canvas.set(x + s * lean * 0.35, base - s, colors[s === tall - 1 && random() < 0.5 ? 3 : s < 2 ? 0 : 1 + (n & 1)])
  }
  return canvas.sprite(7, base, 0)
}

// A bramble or wild currant bush dotted with berries.
function berryBush(seed: number, berry: Uint32Array): Sprite {
  const sprite = bush(seed, LEAF[1])
  const pixels = sprite.pixels.slice()
  const { width } = sprite
  for (let i = 0; i < pixels.length; i++) {
    const lit = LEAF[1].indexOf(pixels[i])
    if (lit < 1) continue
    if (hash(i % width, Math.floor(i / width), seed + 9) < 0.07 + lit * 0.02) pixels[i] = berry[lit > 3 ? 1 : 0]
  }
  return { ...sprite, pixels }
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
  if (!snow) weather(canvas, seed, 0.5)
  shadow(canvas, canvas.width >> 1, canvas.height - 2, width >> 1)
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 1)
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
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 1)
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
  return canvas.sprite(11, base, 1)
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
  return canvas.sprite(13, base, 1)
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

// Lichen and moss caught on a rock's lit faces and in the cracks at its foot.
function weather(canvas: Canvas, seed: number, amount: number) {
  const base = canvas.height - 2
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const p = canvas.get(x, y)
      if (!STONE.includes(p) || p === STONE[0]) continue
      const low = y >= base - 2 && hash(x, y, seed + 9) < 0.45 * amount
      if (low) canvas.set(x, y, MOSS[1 + (hash(x, y, seed + 10) < 0.5 ? 0 : 1)])
      else if (p >= STONE[3] && valueNoise(x * 0.5, y * 0.5, seed + 11) > 1 - amount * 0.32) canvas.set(x, y, hash(x, y, seed) < 0.5 ? LICHEN : MOSS[3])
    }
  }
}

// A broad outcrop: a cluster of rock heads of different heights, some pointed, some flat-topped, all banded.
function outcrop(seed: number): Sprite {
  const random = mulberry32(seed)
  const width = 40 + Math.floor(random() * 18)
  const tall = 20 + Math.floor(random() * 14)
  const canvas = new Canvas(width + 2, tall + 6)
  const heads = Array.from({ length: 4 + Math.floor(random() * 3) }, () => ({
    at: 0.12 + random() * 0.76,
    height: tall * (0.35 + random() * 0.65),
    steep: 2 + random() * 3,
    flat: random() < 0.4 ? 0.05 + random() * 0.06 : 0,
  }))
  facets(
    canvas,
    (x) => {
      const u = (x - 1) / width
      if (u < 0 || u > 1) return -1
      let top = 2 + Math.min(u, 1 - u) * 14
      for (const h of heads) top = Math.max(top, h.height * (1 - Math.max(0, Math.abs(u - h.at) - h.flat) * h.steep))
      return Math.max(0, Math.round(top + (hash(x >> 1, 2, seed) - 0.5) * 2.5))
    },
    false,
    seed,
  )
  weather(canvas, seed, 0.8)
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 1)
}

// A rock step: a low cliff band whose face shows the strata, its top edge broken in places.
function ledge(seed: number): Sprite {
  const random = mulberry32(seed)
  const width = 34 + Math.floor(random() * 16)
  const canvas = new Canvas(width + 2, 22)
  const step = 7 + random() * 4
  const lean = (random() - 0.5) * 0.25
  facets(
    canvas,
    (x) => {
      const u = (x - 1) / width
      if (u < 0 || u > 1) return -1
      const fall = Math.min(1, Math.min(u, 1 - u) * 7)
      const broken = hash(x >> 2, 4, seed) < 0.2 ? -3 : 0
      return Math.max(0, Math.round((step + lean * x + broken) * fall + 1))
    },
    false,
    seed,
  )
  weather(canvas, seed, 0.6)
  return canvas.sprite(canvas.width >> 1, canvas.height - 2, 1)
}

// A weathered stone pillar (a hoodoo): a knobbly neck worn thin, with a heavier boulder balanced on top.
function pillar(seed: number): Sprite {
  const random = mulberry32(seed)
  const tall = 22 + Math.floor(random() * 10)
  const canvas = new Canvas(18, tall + 10)
  const base = canvas.height - 2
  const blobs: Blob[] = []
  let x = 9
  for (let z = 2; z < tall; z += 2.5) {
    const f = z / tall
    x += (random() - 0.5) * 1.2
    blobs.push({ x, y: base - z, r: 4.8 - f * 2.2 + Math.sin(z * 0.7 + seed) * 0.6 })
  }
  blobs.push({ x: x + (random() - 0.5) * 2, y: base - tall - 2, r: 5.5 + random() })
  shadeBlobs(canvas, blobs, STONE, seed, 0.75)
  canvas.rim(STONE[0])
  weather(canvas, seed, 0.7)
  shadow(canvas, 9, base, 6)
  return canvas.sprite(9, base, 1)
}

// A scatter of small stones and gravel.
function pebbles(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(20, 9)
  const base = canvas.height - 2
  for (let i = 0; i < 6 + Math.floor(random() * 5); i++) {
    const x = 2 + random() * 15
    const y = base - random() * 5
    const big = random() < 0.35
    canvas.set(x, y, STONE[3])
    canvas.set(x + 1, y, STONE[1])
    if (big) {
      canvas.set(x, y - 1, STONE[4])
      canvas.set(x + 1, y - 1, STONE[2])
      canvas.set(x + 2, y, STONE[0])
    }
  }
  return canvas.sprite(10, base, 0)
}

// A dwarf mountain shrub, twisted and low, clinging between the rocks.
function scrub(seed: number): Sprite {
  const random = mulberry32(seed)
  const canvas = new Canvas(18, 11)
  const base = canvas.height - 1
  const blobs: Blob[] = []
  for (let i = 0; i < 4; i++) blobs.push({ x: 4 + random() * 10, y: base - 2 - random() * 3, r: 2.2 + random() * 1.8 })
  shadeBlobs(canvas, blobs, FIR, seed, 0.7)
  canvas.rim(FIR[0])
  canvas.set(9, base, BARK[1])
  canvas.set(8, base, BARK[2])
  return canvas.sprite(9, base, 3)
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
  fir: variants(5, fir),
  birch: variants(5, birch),
  poplar: variants(3, poplar),
  autumn: [...variants(3, (s) => leafTree(s + 3, AUTUMN[0])), ...variants(3, (s) => leafTree(s + 4, AUTUMN[1]))],
  blossom: [
    ...variants(3, (s) => blossomTree(s + 5)),
    ...variants(3, (s) => flowering(s + 21, { petals: PETALS.cherry, leaves: LEAF[1], cover: 0.85, bark: CHERRY_BARK })),
    ...variants(2, (s) => flowering(s + 22, { petals: PETALS.apple, leaves: LEAF[0], cover: 0.5 })),
    ...variants(2, (s) => flowering(s + 23, { petals: PETALS.almond, leaves: LEAF[2], cover: 0.7 })),
    ...variants(2, (s) => flowering(s + 24, { petals: PETALS.lilac, leaves: LEAF[1], cover: 0.65 })),
    ...variants(2, (s) => flowering(s + 25, { petals: PETALS.laburnum, leaves: LEAF[0], cover: 0.3, hanging: true })),
  ],
  // Great old trees in flower, about twice the size, much rarer.
  bigBlossom: [
    ...variants(2, (s) => flowering(s + 31, { petals: PETALS.cherry, leaves: LEAF[1], cover: 0.85, bark: CHERRY_BARK, big: true })),
    ...variants(2, (s) => flowering(s + 32, { petals: PETALS.apple, leaves: LEAF[0], cover: 0.6, big: true })),
  ],
  // Rare, much bigger trees.
  oak: [...variants(3, (s) => oak(s, LEAF[0])), oak(9001, LEAF[1])],
  giantPine: variants(3, giantPine),
  dead: variants(4, deadTree),
  bush: [...variants(3, (s) => bush(s, LEAF[0])), ...variants(2, (s) => bush(s + 1, LEAF[2]))],
  boulder: variants(6, boulder),
  reeds: variants(4, reeds),
  rushes: variants(5, rushes),
  // Fruit trees: wild apple, pear, plum and apricot in the woods' clearings and orchards.
  fruit: [
    ...variants(2, (s) => fruitTree(s + 61, FRUIT.apple, LEAF[0])),
    ...variants(2, (s) => fruitTree(s + 62, FRUIT.apple, LEAF[1])),
    fruitTree(63, FRUIT.goldApple, LEAF[0]),
    ...variants(2, (s) => fruitTree(s + 64, FRUIT.pear, LEAF[2])),
    ...variants(2, (s) => fruitTree(s + 65, FRUIT.plum, LEAF[1])),
    fruitTree(66, FRUIT.apricot, LEAF[0]),
  ],
  // wildflowers[kind][variant]
  wildflowers: MEADOW.map((petals, k) => variants(3, (s) => wildflowers(s + k * 101, petals))),
  tallGrass: [...variants(3, (s) => tallGrass(s, GRASS_TALL[0])), ...variants(2, (s) => tallGrass(s + 7, GRASS_TALL[1]))],
  berryBush: [...variants(2, (s) => berryBush(s + 3, BERRY[0])), berryBush(77, BERRY[1])],
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
  outcrop: variants(5, outcrop),
  ledge: variants(4, ledge),
  pillar: variants(3, pillar),
  pebbles: variants(4, pebbles),
  scrub: variants(4, scrub),
  ripple: [ripple(3), ripple(5)],
}
