import { hash, valueNoise } from '@game/shared'
import { BAYER, Canvas, ramp } from './sprites'
import type { Sprite } from './sprites'

// Town walls, gates and gate towers, built as a small model of stone boxes and lit like one: each pixel is shaded by
// how its face meets the light, by the shadows the model throws on itself (battlements on the walkway, a tower on the
// wall beside it), by how closed in it is (corners, the foot of the wall), and by the masonry of its face. Shades land
// on short colour ramps, dithered between steps, so it stays pixel art.
//
// Model units: a tile is 32 by 32 (u along the tile's x, v along its y), heights in screen pixels. A point (u, v, z)
// is drawn at (cx + u - v, back + (u + v) / 2 - z), so the view looks along (1, 1, 1).

// Hue-shifted ramps: cool in the shade, warm in the light.
const STONE = ramp(0x1c1924, 0x29252f, 0x38333e, 0x4a4450, 0x5e5764, 0x746c78, 0x8b838c, 0xa29b9f, 0xb9b2b1, 0xcec8c0, 0xe2dccd)
const MOSS = ramp(0x1b2616, 0x26361b, 0x344a22, 0x45602a, 0x587534, 0x6c8a3e)
const WOOD = ramp(0x1e130d, 0x2d1d13, 0x3f2919, 0x543620, 0x6b4529, 0x835634, 0x9a6a40)
const IRON = ramp(0x121218, 0x1e1e26, 0x2e2e38, 0x44444f, 0x5e5e6a, 0x7c7c88)
const CLOTH = ramp(0x2e0e14, 0x48141c, 0x661c22, 0x84282a, 0xa23a32, 0xbc5040)
const GOLD = ramp(0x4a3410, 0x7a5a1c, 0xa8822c, 0xd2aa44, 0xf0d070)
const DARK = ramp(0x0b0a0f, 0x121017, 0x1a1720, 0x231f2a)

// Toward the light: upper left of the screen, a little behind (matches the painted ground and the cast shadows).
const L = (() => {
  const [x, y, z] = [-0.65, 0.45, 1]
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n] as const
})()
const AMBIENT = 0.42
const DIFFUSE = 0.75

type Material = 'stone' | 'cap' | 'walk' | 'wood' | 'iron' | 'rubble'
interface Box {
  u0: number
  u1: number
  v0: number
  v1: number
  z0: number
  z1: number
  m: Material
}
// What a face shows at a point instead of its material (a door, a banner, an arrow slit), and how bright it is.
type Decal = (face: Face, s: number, t: number) => { colors: Uint32Array; albedo: number; flat?: boolean } | null
// Faces seen from the view: the top, the face toward +u (screen lower right) and the face toward +v (lower left).
type Face = 0 | 1 | 2
const NORMALS: [number, number, number][] = [
  [0, 0, 1],
  [1, 0, 0],
  [0, 1, 0],
]

// Wall body: its thickness across the run, the walkway height, and the battlements above it.
const A = 10
const B = 22
const H = 26
const PARAPET = 3
const MERLON = 5
// Merlons repeat every 8 units (5 stone, 3 gap), so a run of tiles keeps one rhythm.
const PERIOD = 8
const SOLID = 5

interface Model {
  boxes: Box[]
  decal?: Decal
  // Mossiness, 0..1, and a seed for the masonry.
  moss: number
  seed: number
}

const inside = (b: Box, x: number, y: number, z: number) =>
  x > b.u0 && x < b.u1 && y > b.v0 && y < b.v1 && z > b.z0 && z < b.z1

// Whether a ray from a point toward the light meets any box (slab test).
function shaded(boxes: Box[], p: [number, number, number]) {
  for (const b of boxes) {
    let near = 0
    let far = Infinity
    const lo = [b.u0, b.v0, b.z0]
    const hi = [b.u1, b.v1, b.z1]
    let miss = false
    for (let k = 0; k < 3; k++) {
      if (Math.abs(L[k]) < 1e-6) {
        if (p[k] <= lo[k] || p[k] >= hi[k]) miss = true
        continue
      }
      let t0 = (lo[k] - p[k]) / L[k]
      let t1 = (hi[k] - p[k]) / L[k]
      if (t0 > t1) [t0, t1] = [t1, t0]
      near = Math.max(near, t0)
      far = Math.min(far, t1)
    }
    if (!miss && near < far && far > 0) return true
  }
  return false
}

// How much of the space just off a point is filled (other boxes, the ground): 0 open .. 1 closed in.
function occlusion(boxes: Box[], p: [number, number, number], face: Face) {
  const n = NORMALS[face]
  // Two directions along the face.
  const a = face === 0 ? [1, 0, 0] : [0, 0, 1]
  const b = face === 0 ? [0, 1, 0] : face === 1 ? [0, 1, 0] : [1, 0, 0]
  let closed = 0
  let count = 0
  for (const [da, db, dn] of [[-3, 0, 1.5], [3, 0, 1.5], [0, -3, 1.5], [0, 3, 1.5], [-2, -2, 3], [2, 2, 3], [0, 0, 4]]) {
    const x = p[0] + n[0] * dn + a[0] * da + b[0] * db
    const y = p[1] + n[1] * dn + a[1] * da + b[1] * db
    const z = p[2] + n[2] * dn + a[2] * da + b[2] * db
    count++
    if (z < 0 || boxes.some((box) => inside(box, x, y, z))) closed++
  }
  return closed / count
}

// Coursed ashlar on a wall face: courses of 5, blocks of about 8 staggered by course, mortar between, each block its
// own tone and its upper edge catching the light.
function ashlar(s: number, t: number, seed: number, lit: boolean) {
  const course = Math.floor(t / 5)
  const y = t - course * 5
  const shift = hash(course, 3, seed) * 8
  const along = s + shift
  const block = Math.floor(along / 8)
  const x = along - block * 8
  if (y < 0.75 || x < 0.75) return -0.2
  let tone = (hash(block, course, seed + 1) - 0.5) * 0.16
  if (y > 4.1 && lit) tone += 0.06
  if (x > 7.1 || y < 1.5) tone -= 0.05
  // A chipped corner now and then.
  if (hash(block, course, seed + 2) > 0.86 && y > 3 && x < 2.5) tone -= 0.09
  return tone
}

// Flagstones on the walkway.
function flags(s: number, t: number, seed: number) {
  const row = Math.floor(t / 6)
  const along = s + hash(row, 7, seed) * 6
  const stone = Math.floor(along / 6)
  if (t - row * 6 < 0.7 || along - stone * 6 < 0.7) return -0.12
  return (hash(stone, row, seed + 5) - 0.5) * 0.1
}

function render(model: Model, above: number): Sprite {
  const W = 72
  const canvas = new Canvas(W, 32 + above + 4)
  const cx = W >> 1
  const base = canvas.height - 2
  const back = base - 32
  const size = canvas.width * canvas.height
  const depth = new Float32Array(size).fill(-Infinity)
  const faceOf = new Int8Array(size).fill(-1)
  const boxOf = new Int16Array(size)
  const pu = new Float32Array(size)
  const pv = new Float32Array(size)
  const pz = new Float32Array(size)
  const plot = (u: number, v: number, z: number, face: Face, i: number) => {
    const x = Math.floor(cx + u - v)
    const y = Math.floor(back + (u + v) / 2 - z)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
    const o = y * canvas.width + x
    // Ties go to the face drawn first: tops over the walls under their edge.
    const d = u + v + z
    if (d <= depth[o] + 1e-4) return
    depth[o] = d
    faceOf[o] = face
    boxOf[o] = i
    pu[o] = u
    pv[o] = v
    pz[o] = z
  }
  const STEP = 0.3
  model.boxes.forEach((b, i) => {
    for (let u = b.u0; u <= b.u1 + 1e-6; u += STEP) for (let v = b.v0; v <= b.v1 + 1e-6; v += STEP) plot(u, v, b.z1, 0, i)
    for (let v = b.v0; v <= b.v1 + 1e-6; v += STEP) for (let z = b.z0; z <= b.z1 + 1e-6; z += STEP) plot(b.u1, v, z, 1, i)
    for (let u = b.u0; u <= b.u1 + 1e-6; u += STEP) for (let z = b.z0; z <= b.z1 + 1e-6; z += STEP) plot(u, b.v1, z, 2, i)
  })

  const lum = new Float32Array(size)
  const ramps: (Uint32Array | null)[] = new Array(size).fill(null)
  for (let o = 0; o < size; o++) {
    if (faceOf[o] < 0) continue
    const face = faceOf[o] as Face
    const box = model.boxes[boxOf[o]]
    const p: [number, number, number] = [pu[o], pv[o], pz[o]]
    const n = NORMALS[face]
    const s = face === 1 ? p[1] : p[0]
    const t = face === 0 ? p[1] : p[2]
    const decal = model.decal?.(face, s, t)
    let colors: Uint32Array = STONE
    let albedo = 0.62
    if (decal) {
      colors = decal.colors
      albedo = decal.albedo
    } else if (box.m === 'cap') {
      albedo = 0.72 + (hash(Math.floor(s / 3), Math.floor(t / 3), model.seed + 9) - 0.5) * 0.06
    } else if (box.m === 'walk') {
      albedo = 0.6 + (face === 0 ? flags(s, t, model.seed) : ashlar(s, t, model.seed, face === 2))
    } else if (box.m === 'rubble') {
      albedo = 0.5 + (hash(box.u0 * 7, box.v0 * 13, model.seed) - 0.5) * 0.2
    } else if (box.m === 'wood') {
      colors = WOOD
      albedo = 0.6
    } else if (box.m === 'iron') {
      colors = IRON
      albedo = 0.55
    } else {
      albedo = 0.62 + ashlar(s, t, model.seed, face === 2)
      // Grime washed down the wall below the gaps in the battlements.
      if (face !== 0 && (s % PERIOD) > SOLID + 0.5 && t > H - 10 && t < H) albedo -= ((t - (H - 10)) / 10) * 0.07
    }
    // Moss: at the foot of the walls and in the corners of the walkway, more on an old wall.
    if (!decal && box.m !== 'iron' && box.m !== 'wood') {
      const patch = valueNoise(s * 0.22 + face * 17, t * 0.22, model.seed + 31)
      const low = face === 0 ? 0.25 : Math.max(0, 1 - p[2] / 9)
      if (patch + low * 0.55 + model.moss * 0.25 > 1.05) colors = MOSS
    }
    let light = AMBIENT
    const facing = n[0] * L[0] + n[1] * L[1] + n[2] * L[2]
    if (facing > 0 && !shaded(model.boxes, [p[0] + n[0] * 0.4, p[1] + n[1] * 0.4, p[2] + n[2] * 0.4])) light += DIFFUSE * facing
    const ao = decal?.flat ? 0 : occlusion(model.boxes, p, face)
    lum[o] = albedo * light * (1 - ao * 0.55)
    ramps[o] = colors
  }
  // Edges: a top edge catching the light, a dark line where the shape meets the ground or the empty air on its shaded
  // lower right.
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && faceOf[y * canvas.width + x] >= 0
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const o = y * canvas.width + x
      const colors = ramps[o]
      if (!colors) continue
      let l = lum[o]
      const up = y > 0 ? faceOf[o - canvas.width] : -1
      if (faceOf[o] === 0 && up !== 0) l += 0.07
      if (!solid(x + 1, y) || !solid(x, y + 1)) l -= 0.1
      const f = Math.max(0, Math.min(1, l * 1.25)) * (colors.length - 1)
      // Dithered only near the middle of a step, so flat stone reads as flat and gradients still blend.
      const index = Math.max(0, Math.min(colors.length - 1, Math.floor(f + 0.5 + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.55)))
      canvas.pixels[o] = colors[index]
    }
  }
  // Each pixel's height over the ground under it, for the shadow it throws.
  const lift = new Uint8Array(size)
  for (let o = 0; o < size; o++) if (faceOf[o] >= 0) lift[o] = Math.max(0, Math.min(255, Math.round(pz[o])))
  return { ...canvas.sprite(cx, base, 0), lift }
}

const box = (u0: number, u1: number, v0: number, v1: number, z0: number, z1: number, m: Material = 'stone'): Box => ({ u0, u1, v0, v1, z0, z1, m })

// Merlons along a run of parapet from `from` to `to` on one axis; the stone parts of the global 8-unit rhythm.
function merlons(along: 'u' | 'v', from: number, to: number, a: number, b: number, z: number, out: Box[]) {
  for (let start = Math.floor(from / PERIOD) * PERIOD; start < to; start += PERIOD) {
    const s0 = Math.max(from, start)
    const s1 = Math.min(to, start + SOLID)
    if (s1 - s0 < 1) continue
    out.push(along === 'u' ? box(s0, s1, a, b, z, z + MERLON, 'cap') : box(a, b, s0, s1, z, z + MERLON, 'cap'))
  }
}

// Links: bit 1 a wall at -u (tile x - 1), 2 at +u, 4 at -v (tile y - 1), 8 at +v.
const L_U0 = 1
const L_U1 = 2
const L_V0 = 4
const L_V1 = 8

// The curtain wall through a tile: a run along each axis that has a neighbour, meeting at the middle, with a parapet
// and battlements on each side of the walkway except where another run leaves it.
function curtain(links: number, top: number, a = A, b = B, broken = false, seed = 0): Box[] {
  const boxes: Box[] = []
  const runU = links & (L_U0 | L_U1) || !(links & (L_V0 | L_V1))
  const runV = links & (L_V0 | L_V1)
  const uS = links & L_U0 ? 0 : a
  const uE = links & L_U1 ? 32 : b
  const vS = links & L_V0 ? 0 : a
  const vE = links & L_V1 ? 32 : b
  const runs: { along: 'u' | 'v'; from: number; to: number }[] = []
  if (runU) runs.push({ along: 'u', from: uS, to: uE })
  if (runV) runs.push({ along: 'v', from: vS, to: vE })
  for (const run of runs) {
    const body = (s0: number, s1: number, z0: number, z1: number, m: Material, pad = 0) =>
      run.along === 'u' ? box(s0, s1, a - pad, b + pad, z0, z1, m) : box(a - pad, b + pad, s0, s1, z0, z1, m)
    if (broken) {
      // A ragged stump, higher here and lower there, its top in steps.
      for (let s = run.from; s < run.to; s += 2) {
        const z = 5 + Math.round(hash(s >> 1, run.along === 'u' ? 1 : 2, seed + 61) * 9 + Math.sin(s * 0.3) * 3)
        boxes.push(body(s, Math.min(run.to, s + 2), 0, z, 'stone'))
      }
      continue
    }
    // A battered footing a little wider than the wall, then the wall up to the walkway.
    boxes.push(body(run.from, run.to, 0, 4, 'stone', 1.5))
    boxes.push(body(run.from, run.to, 0, top, 'walk'))
  }
  if (broken) return boxes
  // Parapets on the long edges of each run, broken where a crossing run passes through.
  const edge = (along: 'u' | 'v', from: number, to: number, c0: number, c1: number, gap: boolean) => {
    const pieces = gap ? [[from, a], [b, to]] : [[from, to]]
    for (const [s0, s1] of pieces) {
      if (s1 - s0 < 0.5) continue
      boxes.push(along === 'u' ? box(s0, s1, c0, c1, top, top + PARAPET, 'cap') : box(c0, c1, s0, s1, top, top + PARAPET, 'cap'))
      merlons(along, s0, s1, c0, c1, top + PARAPET, boxes)
    }
  }
  for (const run of runs) {
    if (run.along === 'u') {
      edge('u', run.from, run.to, a, a + 2, !!(links & L_V0))
      edge('u', run.from, run.to, b - 2, b, !!(links & L_V1))
      // A dead end is closed by a parapet across it (where the runs cross, the other run's parapet closes it).
      if (!(links & L_U0) && !runV) edge('v', a, b, uS, uS + 2, false)
      if (!(links & L_U1) && !runV) edge('v', a, b, uE - 2, uE, false)
    } else {
      edge('v', run.from, run.to, a, a + 2, !!(links & L_U0))
      edge('v', run.from, run.to, b - 2, b, !!(links & L_U1))
      if (!(links & L_V0) && !runU) edge('u', a, b, vS, vS + 2, false)
      if (!(links & L_V1) && !runU) edge('u', a, b, vE - 2, vE, false)
    }
  }
  return boxes
}

// A slit in a face: dark, with a lighter sill under it.
const slit = (s: number, t: number, at: number, bottom: number, tall: number) => {
  if (Math.abs(s - at) < 0.9 && t > bottom && t < bottom + tall) return { colors: DARK, albedo: 0.35, flat: true }
  if (Math.abs(s - at) < 1.6 && t > bottom - 1 && t <= bottom) return { colors: STONE, albedo: 0.82 }
  return null
}

function wallPiece(links: number, variant: number): Sprite {
  const seed = 101 + variant * 7
  const boxes = curtain(links, H)
  // Now and then an arrow slit in a face that runs across the view.
  const slits = hash(variant, links, 19) > 0.55
  const decal: Decal = (face, s, t) => {
    if (!slits || face === 0) return null
    const runs = face === 2 ? links & (L_U0 | L_U1) || !(links & (L_V0 | L_V1)) : links & (L_V0 | L_V1)
    return runs ? slit(s, t, 27, 11, 7) : null
  }
  return render({ boxes, decal, moss: hash(variant, 3, 5) * 0.8, seed }, 50)
}

function brokenPiece(links: number, variant: number): Sprite {
  const seed = 131 + variant * 7
  const boxes = curtain(links, H, A, B, true, seed)
  // Fallen blocks at the foot of the wall, in front of it.
  for (let k = 0; k < 7; k++) {
    const u = 4 + hash(k, variant, seed) * 24
    const v = B + 1 + hash(k, variant, seed + 1) * 7
    const r = 1.5 + hash(k, variant, seed + 2) * 2
    boxes.push(box(u - r, u + r, v - r, v + r, 0, r * 1.4, 'rubble'))
  }
  return render({ boxes, moss: 0.9, seed }, 40)
}

// The tower beside a gate: square and tall, its battlements carried out on corbels, arrow slits and a pennant.
function gateTower(links: number, variant: number): Sprite {
  const seed = 151 + variant * 7
  const tall = H + 16
  const boxes = curtain(links, H)
  const [t0, t1] = [6, 26]
  boxes.push(box(t0 - 1.5, t1 + 1.5, t0 - 1.5, t1 + 1.5, 0, 5))
  boxes.push(box(t0, t1, t0, t1, 0, tall, 'walk'))
  // Corbels under the projecting top.
  for (let s = t0 + 1; s < t1 - 1; s += 4) {
    boxes.push(box(t1, t1 + 1.5, s, s + 2, tall - 4, tall - 1, 'cap'))
    boxes.push(box(s, s + 2, t1, t1 + 1.5, tall - 4, tall - 1, 'cap'))
  }
  boxes.push(box(t0 - 1.5, t1 + 1.5, t0 - 1.5, t1 + 1.5, tall - 1, tall + 2, 'cap'))
  const top = tall + 2
  const [c0, c1] = [t0 - 1.5, t1 + 1.5]
  for (const [along, a, b] of [['u', c0, c0 + 2], ['u', c1 - 2, c1], ['v', c0, c0 + 2], ['v', c1 - 2, c1]] as const) {
    boxes.push(along === 'u' ? box(c0, c1, a, b, top, top + 2, 'cap') : box(a, b, c0, c1, top, top + 2, 'cap'))
    merlons(along, c0, c1, a, b, top + 2, boxes)
  }
  // The flagpole.
  boxes.push(box(15.4, 16.6, 15.4, 16.6, top, top + 16, 'wood'))
  const decal: Decal = (face, s, t) => {
    if (face === 0) return null
    return slit(s, t, 16, H - 2, 7) ?? slit(s, t, 16, 9, 6)
  }
  const sprite = render({ boxes, decal, moss: hash(variant, 4, 5) * 0.6, seed }, 80)
  pennant(sprite, top + 16)
  return sprite
}

// A pennant flying from the pole's top, toward the right.
function pennant(sprite: Sprite, z: number) {
  const x0 = (sprite.width >> 1) + 1
  const y0 = sprite.anchorY - 32 + 16 - z
  for (let x = 0; x < 9; x++) {
    const half = Math.max(0, 2.5 - x * 0.28)
    const wave = Math.round(Math.sin(x * 0.8) * 0.8)
    for (let y = -half; y <= half; y++) {
      const px = x0 + x
      const py = Math.round(y0 + 2 + y + wave)
      if (px >= sprite.width || py < 0) continue
      sprite.pixels[py * sprite.width + px] = CLOTH[y < 0 ? 4 : y < 1 ? 3 : 2]
      // Hung from the pole: as high over the ground as the pole's top, less how far down it hangs.
      if (sprite.lift) sprite.lift[py * sprite.width + px] = Math.max(0, z - (py - y0))
    }
  }
}

// A gate in a wall running along `along`: a gatehouse a little taller than the wall, its arch of dressed voussoirs
// over an oak door banded with iron, a banner above. Open, the doors are swung back against the sides of the passage
// and the way through shows dark under the arch, the light of the far side on its floor.
function gatePiece(along: 'u' | 'v', links: number, variant: number, open = false): Sprite {
  const seed = 171 + variant * 7
  const runLinks = along === 'u' ? links | L_U0 | L_U1 : links | L_V0 | L_V1
  const boxes = curtain(runLinks & (along === 'u' ? L_U0 | L_U1 : L_V0 | L_V1), H)
  const top = H + 8
  const [a, b] = [8, 24]
  boxes.push(along === 'u' ? box(1, 31, a, b, 0, top, 'walk') : box(a, b, 1, 31, 0, top, 'walk'))
  const edge = (c0: number, c1: number) => {
    boxes.push(along === 'u' ? box(1, 31, c0, c1, top, top + 2, 'cap') : box(c0, c1, 1, 31, top, top + 2, 'cap'))
    merlons(along, 1, 31, c0, c1, top + 2, boxes)
  }
  edge(a, a + 2)
  edge(b - 2, b)
  for (const s of [1, 29]) boxes.push(along === 'u' ? box(s, s + 2, a, b, top, top + 2, 'cap') : box(a, b, s, s + 2, top, top + 2, 'cap'))
  // The door is on the face across the run: +v for a gate along u, +u for one along v.
  const doorFace: Face = along === 'u' ? 2 : 1
  const R = 7
  const SPRING = 12
  const decal: Decal = (face, s, t) => {
    if (face !== doorFace) return null
    const d = s - 16
    const crown = SPRING + Math.sqrt(Math.max(0, R * R - d * d))
    if (Math.abs(d) < R && t < crown && open) {
      // The leaves, edge on against the jambs.
      if (Math.abs(d) > R - 1.8) return { colors: WOOD, albedo: Math.abs(t - 3.5) < 0.8 || Math.abs(t - 10) < 0.8 ? 0.25 : 0.42, flat: true }
      // Daylight from the far end on the floor of the passage, fading in toward the middle of the arch.
      if (t < 3.2 - Math.abs(d) * 0.25) return { colors: STONE, albedo: 0.32 + (3.2 - t) * 0.05, flat: true }
      return { colors: DARK, albedo: 0.25 + (t / crown) * 0.35, flat: true }
    }
    if (Math.abs(d) < R && t < crown) {
      // Iron bands across oak planks; studs on the bands.
      if (Math.abs(t - 3.5) < 0.8 || Math.abs(t - 10) < 0.8) return { colors: IRON, albedo: (Math.round(s) % 3 === 0 ? 0.75 : 0.5), flat: true }
      const plank = Math.floor((s + 16) / 3)
      const seam = (s + 16) % 3 < 0.6
      return { colors: WOOD, albedo: seam ? 0.3 : 0.55 + (hash(plank, 1, seed) - 0.5) * 0.12 }
    }
    // Voussoirs: a ring of dressed stone around the arch, its joints pointing at the centre.
    const r = Math.hypot(d, Math.max(0, t - SPRING))
    if (r < R + 2.4 && t > SPRING - 6 && (t > SPRING || Math.abs(d) >= R)) {
      const angle = Math.atan2(Math.max(0, t - SPRING), d)
      const joint = (angle / Math.PI) * 9
      const key = Math.abs(d) < 1.6 && t > SPRING + R - 1
      return { colors: STONE, albedo: key ? 0.86 : joint % 1 < 0.15 ? 0.5 : 0.76 }
    }
    // The banner between the arch and the battlements.
    const bt = t - (SPRING + R + 3)
    if (Math.abs(d) < 3.5 && bt > 0 && bt < top - (SPRING + R + 4) - Math.max(0, 1.5 - Math.abs(d))) {
      const tip = bt < 2.2 - Math.abs(d) * 0.6
      if (tip) return null
      if (Math.abs(d) > 2.6) return { colors: GOLD, albedo: 0.7 }
      return { colors: CLOTH, albedo: 0.62 + (Math.abs(d) < 0.8 && bt > 4 && bt < 7 ? 0.25 : 0) }
    }
    return null
  }
  return render({ boxes, decal, moss: hash(variant, 6, 5) * 0.5, seed }, 60)
}

export type WallKind = 'wall' | 'brokenWall' | 'towerWall' | 'gate' | 'gateY'
export const WALL_KINDS = new Set<string>(['wall', 'brokenWall', 'towerWall', 'gate', 'gateY'])

// Wall pieces are made when first seen: one per kind, links and look (variant).
const VARIANTS = 4
const pieces = new Map<string, Sprite>()
// Each closed gate's open look, made when first needed.
const gates = new WeakMap<Sprite, { along: 'u' | 'v'; links: number; variant: number; open?: Sprite }>()

// A gate as it stands open while someone walks through (null for anything not a gate).
export function openGate(closed: Sprite): Sprite | null {
  const gate = gates.get(closed)
  if (!gate) return null
  return (gate.open ??= gatePiece(gate.along, gate.links, gate.variant, true))
}
export function wallLook(kind: WallKind, links: number, variant: number): Sprite {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS
  const key = `${kind}:${links}:${v}`
  let sprite = pieces.get(key)
  if (!sprite) {
    sprite =
      kind === 'wall'
        ? wallPiece(links, v)
        : kind === 'brokenWall'
          ? brokenPiece(links, v)
          : kind === 'towerWall'
            ? gateTower(links, v)
            : gatePiece(kind === 'gate' ? 'u' : 'v', links, v)
    if (kind === 'gate' || kind === 'gateY') gates.set(sprite, { along: kind === 'gate' ? 'u' : 'v', links, variant: v })
    pieces.set(key, sprite)
  }
  return sprite
}

// Which neighbours each wall piece joins (bits as in curtain), from where the wall pieces stand.
export function wallLinks(pieces: { x: number; y: number }[]): Map<string, number> {
  const at = new Set(pieces.map((p) => `${p.x},${p.y}`))
  const links = new Map<string, number>()
  for (const p of pieces) {
    let bits = 0
    if (at.has(`${p.x - 1},${p.y}`)) bits |= L_U0
    if (at.has(`${p.x + 1},${p.y}`)) bits |= L_U1
    if (at.has(`${p.x},${p.y - 1}`)) bits |= L_V0
    if (at.has(`${p.x},${p.y + 1}`)) bits |= L_V1
    links.set(`${p.x},${p.y}`, bits)
  }
  return links
}
