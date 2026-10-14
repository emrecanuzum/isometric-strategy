import { TILE_HEIGHT, TILE_WIDTH, hash } from '@game/shared'
import { Canvas, ramp } from './sprites'
import type { Sprite } from './sprites'

// The big ships of the free cities' harbours (CLAUDE.md §7.7): two-masted merchantmen with a raised stern, lying along
// one of the tile axes. They are modelled in tile space (along the keel, across it, height in pixels) and drawn with a
// depth buffer, so the near side of the hull, the deck, the masts and the sails cover one another properly.

const HULL = ramp(0x2a1a10, 0x3e2716, 0x56381f, 0x6e4a2a, 0x8a6038)
const DECK = ramp(0x6e5232, 0x8a6a42, 0xa78452, 0xc09c62)
const STRIPE = [ramp(0x5a1a14, 0x8a2a1e, 0xb23a26), ramp(0x1a2e52, 0x2a4a7a, 0x3e66a0), ramp(0x6a5214, 0x9a7a22, 0xc8a234)]
const SAIL = ramp(0x9a8e72, 0xc4b896, 0xe2d8b8, 0xf6f0dc)
const SAIL_BAND = ramp(0x7a2418, 0xa83424, 0xc84a32)
const MAST = ramp(0x2e1e12, 0x4a321e, 0x664628)
const FLAG = ramp(0x8a1c18, 0xd0402a)
const FOAM = 0xffeaf8fa >>> 0

// A ship `length` tiles long lying along `along` (its bow toward +along, or -along when `reverse`), sails set when
// `sailing`, else furled. Anchored on the water at its middle.
export function ship(along: 'x' | 'y', sailing: boolean, seed: number, reverse = false, length = 4.2): Sprite {
  const beam = 1.25
  const deck = 15
  const mastHeight = 72
  const width = Math.ceil((length + beam * 2) * (TILE_WIDTH / 2)) + 24
  const height = Math.ceil((length + beam * 2) * (TILE_HEIGHT / 2)) + mastHeight + deck + 30
  const canvas = new Canvas(width, height)
  const depth = new Float32Array(width * height).fill(-Infinity)
  const ax = width >> 1
  const ay = height - Math.ceil((length + beam) * (TILE_HEIGHT / 4)) - 6
  // Ship space (a along the keel from the stern, c across, z up) to the sprite, and how near the viewer it is.
  const put = (a: number, c: number, z: number, color: number) => {
    if (reverse) {
      a = length - a
      c = -c
    }
    const u = along === 'x' ? a - length / 2 : c
    const v = along === 'x' ? c : a - length / 2
    const x = Math.round(ax + (u - v) * (TILE_WIDTH / 2))
    const y = Math.round(ay + (u + v) * (TILE_HEIGHT / 2) - z)
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const d = u + v + z * 0.002
    const o = y * width + x
    if (d < depth[o]) return
    depth[o] = d
    canvas.pixels[o] = color
  }
  const stripe = STRIPE[Math.floor(hash(seed, 1, 41) * STRIPE.length)]
  // Half the beam along the keel: a square stern, full amidships, a pointed bow.
  const half = (t: number) => (beam / 2) * (t < 0.12 ? 0.82 + t * 1.5 : t > 0.58 ? Math.sqrt(Math.max(0, 1 - ((t - 0.58) / 0.42) ** 2)) : 1)
  // The deck rises toward the stern castle and a little at the bow.
  const top = (t: number) => deck + (t < 0.24 ? 9 * Math.min(1, (0.24 - t) / 0.06) : 0) + (t > 0.84 ? (t - 0.84) * 40 : 0)
  // Which way a side faces the light: from the upper left, so the side facing +y is lit and the side facing +x is not.
  const lit = (side: number) => ((along === 'x') === reverse ? side < 0 : side > 0)

  const step = 1 / 64
  // The hull's sides, narrowing below the waterline curve, with a painted band under the rail.
  for (let a = 0; a <= length; a += step) {
    const t = a / length
    const h = top(t)
    for (const side of [-1, 1]) {
      for (let z = 0; z <= h; z += 0.5) {
        const w = half(t) * (0.72 + 0.28 * Math.min(1, z / deck))
        // Strakes of planking, a dark wale, and the lit side brighter.
        const tone = (lit(side) ? 2 : 0.6) + (z < 3 ? -1 : 0) + (z > h - 1.5 ? 1.5 : 0) + (Math.floor(z) % 3 === 0 ? -0.7 : 0) + (Math.abs(z - deck * 0.45) < 1 ? -1.5 : 0)
        const band = z > h - 4.5 && z < h - 2
        const color = band ? stripe[lit(side) ? 2 : 0] : HULL[Math.max(0, Math.min(4, Math.round(tone + (t < 0.22 ? 1 : 0))))]
        put(a, side * w, z, color)
      }
    }
    // The transom across the stern and the stem at the bow close the hull.
    if (a < step * 1.5 || a > length - step * 1.5) {
      for (let c = -half(t); c <= half(t); c += step) for (let z = 0; z <= h; z += 0.5) put(a, c, z, HULL[1])
    }
  }
  // The deck planks, and a rail along the edge.
  for (let a = 0; a <= length; a += step) {
    const t = a / length
    const w = half(t)
    const h = top(t)
    for (let c = -w; c <= w; c += step) {
      const edge = Math.abs(c) > w - 0.07
      const seam = (c + beam) * 9 % 1 < 0.18
      put(a, c, h, edge ? HULL[3] : seam ? DECK[0] : DECK[1 + (Math.floor((c + beam) * 9) % 2)])
      if (edge) for (let z = 1; z <= 2; z++) put(a, c, h + z, HULL[z === 2 ? 4 : 3])
    }
  }
  // The stern castle's cabin: a box with lit windows under the poop deck, facing forward.
  const castle = length * 0.24
  for (let c = -half(0.24) * 0.8; c <= half(0.24) * 0.8; c += step) {
    for (let z = deck; z <= deck + 9; z += 0.5) {
      const window = z > deck + 3 && z < deck + 6 && Math.abs(((c + beam) * 4) % 1 - 0.5) < 0.18
      put(castle, c, z, window ? 0xff4cc6f2 >>> 0 : HULL[(along === 'x') === c > 0 ? 3 : 2])
    }
  }
  // A bowsprit reaching forward and up from the stem.
  for (let k = 0; k <= 1; k += step) for (const dc of [0, 0.02]) put(length - 0.35 + k * 1.1, dc, top(0.9) + k * 9, MAST[dc ? 2 : 1])
  // Cargo on deck: a few crates and barrels amidships.
  for (let n = 0; n < 4; n++) {
    const a = length * (0.3 + hash(seed, n, 43) * 0.3)
    const c = (hash(seed, n, 47) - 0.5) * beam * 0.5
    const t = a / length
    for (let da = -0.12; da <= 0.12; da += step) for (let dc = -0.12; dc <= 0.12; dc += step) for (let z = 0; z <= 3; z += 0.5) put(a + da, c + dc, top(t) + z, DECK[z > 2.5 ? 3 : dc > 0 === (along === 'x') ? 0 : 1])
  }
  // Two masts with yards; the sails set and bellying forward, or furled along the yards.
  const masts = [0.38, 0.68].map((t, i) => ({ a: length * t, tall: mastHeight * (i === 0 ? 1 : 0.85) }))
  for (const { a, tall } of masts) {
    const base = top(a / length)
    for (let z = base; z <= base + tall; z += 0.5) {
      put(a, 0, z, MAST[1])
      put(a + 0.03, along === 'x' ? 0.03 : -0.03, z, MAST[2])
      put(a - 0.03, along === 'x' ? -0.03 : 0.03, z, MAST[0])
    }
    const yard = base + tall - 6
    const span = beam * 0.95
    for (let c = -span; c <= span; c += step) put(a + 0.02, c, yard, MAST[0])
    if (sailing) {
      const foot = base + 12
      for (let z = foot; z <= yard - 1; z += 0.5) {
        const f = (z - foot) / (yard - foot)
        const w = span * (0.85 + 0.15 * f)
        for (let c = -w; c <= w; c += step) {
          const belly = 0.28 * Math.sin(((c + w) / (2 * w)) * Math.PI) * Math.sin(f * Math.PI * 0.9 + 0.2)
          const shade = (c / w) * (along === 'x' ? 1 : -1) * 1.1 + belly * 3
          const band = Math.abs(f - 0.35) < 0.07 || Math.abs(f - 0.62) < 0.05
          const colors = band ? SAIL_BAND : SAIL
          put(a + belly, c, z, colors[Math.max(0, Math.min(colors.length - 1, Math.round(1.6 + shade)))])
        }
      }
    } else {
      // Furled: a roll of canvas lashed along the yard.
      for (let c = -span * 0.9; c <= span * 0.9; c += step) for (let dz = -2.5; dz <= 0; dz += 0.5) put(a + 0.04, c, yard + dz, SAIL[dz < -1.5 ? 1 : 2])
    }
    // A pennant at the masthead, streaming aft.
    for (let k = 0; k < 9; k++) for (let dz = 0; dz <= (k < 6 ? 1.5 : 0.5); dz += 0.5) put(a - k * 0.06, 0, base + tall - 1 - dz + k * 0.15, FLAG[k % 3 === 0 ? 0 : 1])
  }
  // Foam where the hull meets the water.
  for (let a = 0; a <= length; a += step * 4) {
    const t = a / length
    for (const side of [-1, 1]) {
      const u = along === 'x' ? (reverse ? length / 2 - a : a - length / 2) : side * (half(t) * 0.72 + 0.06)
      const v = along === 'x' ? side * (half(t) * 0.72 + 0.06) : reverse ? length / 2 - a : a - length / 2
      const x = Math.round(ax + (u - v) * (TILE_WIDTH / 2))
      const y = Math.round(ay + (u + v) * (TILE_HEIGHT / 2)) + 1
      if (x >= 0 && y >= 0 && x < width && y < height && !canvas.pixels[y * width + x] && hash(Math.round(a * 16), side, seed) < 0.6) canvas.pixels[y * width + x] = FOAM
    }
  }
  return canvas.sprite(ax, ay, 0)
}
