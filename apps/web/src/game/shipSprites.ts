import { TILE_HEIGHT, TILE_WIDTH, hash } from '@game/shared'
import { Canvas, ramp } from './sprites'
import type { Sprite } from './sprites'

// The big ships of the free cities' harbours (CLAUDE.md §7.7): war galleys, long and low, a bronze ram at the bow, a
// row of oars along each side, shields hung on the rails, one mast with a great square sail and an awning over the
// raised stern. They lie along one of the tile axes, are modelled in tile space (along the keel, across it, height in
// pixels) and drawn with a depth buffer, so the near side of the hull, the oars, the deck, the mast and the sail cover
// one another properly.

const HULL = ramp(0x2a1a10, 0x3e2716, 0x56381f, 0x6e4a2a, 0x8a6038)
const DECK = ramp(0x6e5232, 0x8a6a42, 0xa78452, 0xc09c62)
const STRIPE = [ramp(0x5a1a14, 0x8a2a1e, 0xb23a26), ramp(0x1a2e52, 0x2a4a7a, 0x3e66a0), ramp(0x6a5214, 0x9a7a22, 0xc8a234)]
const SAIL = ramp(0x9a8e72, 0xc4b896, 0xe2d8b8, 0xf6f0dc)
const MAST = ramp(0x2e1e12, 0x4a321e, 0x664628)
const OAR = ramp(0x3a2614, 0x5a3e22, 0x7a5a34)
const BRONZE = ramp(0x4a2e14, 0x7a5222, 0xa8782e, 0xd2a446)
const SHIELD = [ramp(0x6a1a14, 0xa02a1e, 0xd04a30), ramp(0x1a2e52, 0x2a4a7a, 0x4a70b0), ramp(0x6a5214, 0xa07e22, 0xd0aa38)]
const FLAG = ramp(0x8a1c18, 0xd0402a)
const FOAM = 0xffeaf8fa >>> 0
const LANTERN = 0xff5ad0ff >>> 0

// How long a galley is, in tiles (the harbour moors them where this much water lies along the jetty).
export const SHIP_LENGTH = 6.6

// A galley `length` tiles long lying along `along` (its bow toward +along, or -along when `reverse`). Under way
// (`sailing`) its oars are out in the water and its sail is set; moored, the oars are shipped upright and the sail is
// furled on the yard. Anchored on the water at its middle.
export function ship(along: 'x' | 'y', sailing: boolean, seed: number, reverse = false, length = SHIP_LENGTH): Sprite {
  const beam = 1.15
  const deck = 11
  const mastHeight = 66
  const reach = 1.25
  const width = Math.ceil((length + (beam + reach) * 2) * (TILE_WIDTH / 2)) + 24
  const height = Math.ceil((length + (beam + reach) * 2) * (TILE_HEIGHT / 2)) + mastHeight + deck + 34
  const canvas = new Canvas(width, height)
  const depth = new Float32Array(width * height).fill(-Infinity)
  const ax = width >> 1
  const ay = height - Math.ceil((length / 2 + beam + reach) * (TILE_HEIGHT / 2)) - 6
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
  const shields = SHIELD[Math.floor(hash(seed, 2, 41) * SHIELD.length)]
  // Half the beam along the keel: a rounded stern, long straight sides, a fine bow.
  const half = (t: number) => (beam / 2) * (t < 0.1 ? 0.55 + t * 4.5 : t > 0.8 ? Math.sqrt(Math.max(0, 1 - ((t - 0.8) / 0.2) ** 2)) : 1)
  // The deck sweeps up into a tall curled sternpost and a little toward the bow.
  const top = (t: number) => deck + (t < 0.16 ? 7 * Math.min(1, (0.16 - t) / 0.05) : 0) + (t > 0.9 ? (t - 0.9) * 50 : 0)
  // Which way a side faces the light: from the upper left, so the side facing +y is lit and the side facing +x is not.
  const lit = (side: number) => ((along === 'x') === reverse ? side < 0 : side > 0)

  const step = 1 / 64
  // The hull's sides, with a painted band under the rail and a row of oar ports in it.
  const oars = 13
  const oarAt = (i: number) => length * (0.2 + (0.58 * i) / (oars - 1))
  for (let a = 0; a <= length; a += step) {
    const t = a / length
    const h = top(t)
    const port = Array.from({ length: oars }, (_, i) => Math.abs(a - oarAt(i)) < 0.07).some(Boolean)
    for (const side of [-1, 1]) {
      for (let z = 0; z <= h; z += 0.5) {
        const w = half(t) * (0.7 + 0.3 * Math.min(1, z / deck))
        const tone = (lit(side) ? 2 : 0.6) + (z < 2.5 ? -1 : 0) + (z > h - 1.5 ? 1.5 : 0) + (Math.floor(z) % 3 === 0 ? -0.7 : 0)
        const band = z > deck - 5 && z < deck - 1.5 && t > 0.12 && t < 0.86
        const color = band ? (port && z > deck - 4.2 && z < deck - 2.3 ? HULL[0] : stripe[lit(side) ? 2 : 0]) : HULL[Math.max(0, Math.min(4, Math.round(tone)))]
        put(a, side * w, z, color)
      }
    }
    // The stern and stem close the hull.
    if (a < step * 1.5 || a > length - step * 1.5) {
      for (let c = -half(t); c <= half(t); c += step) for (let z = 0; z <= h; z += 0.5) put(a, c, z, HULL[1])
    }
  }
  // The ram: a bronze beak at the waterline, reaching forward of the bow.
  for (let k = 0; k <= 0.8; k += step) {
    const r = 0.14 * (1 - k / 0.8) + 0.03
    for (let c = -r; c <= r; c += step) for (let z = 0.5; z <= 3.5 - k * 2; z += 0.5) put(length + k - 0.1, c, z, BRONZE[z > 2.5 ? 3 : (c > 0) === (along === 'x') ? 1 : 2])
  }
  // The deck planks, a rail along the edge, and the rowers' benches across it.
  for (let a = 0; a <= length; a += step) {
    const t = a / length
    const w = half(t)
    const h = top(t)
    for (let c = -w; c <= w; c += step) {
      const edge = Math.abs(c) > w - 0.07
      const seam = (a * 7) % 1 < 0.12
      put(a, c, h, edge ? HULL[3] : seam ? DECK[0] : DECK[1 + (Math.floor(c * 9 + 9) % 2)])
      if (edge) for (let z = 1; z <= 2; z++) put(a, c, h + z, HULL[z === 2 ? 4 : 3])
    }
  }
  for (let i = 0; i < oars; i++) {
    const a = oarAt(i)
    const w = half(a / length) * 0.85
    for (let c = -w; c <= w; c += step) put(a + 0.12, c, deck + 1, HULL[2])
  }
  // Shields hung along both rails, each a small round boss.
  for (let a = length * 0.2; a <= length * 0.8; a += 0.36) {
    for (const side of [-1, 1]) {
      const w = half(a / length) + 0.04
      for (let da = -0.13; da <= 0.13; da += step) {
        for (let dz = -2.5; dz <= 2.5; dz += 0.5) {
          const r = Math.hypot(da / 0.13, dz / 2.5)
          if (r > 1) continue
          put(a + da, side * w, deck + 0.5 + dz, r < 0.35 ? BRONZE[3] : r > 0.8 ? shields[0] : shields[lit(side) ? 2 : 1])
        }
      }
    }
  }
  // The oars: out over the water, blades dipped, when under way; shipped upright along the rails at the jetty.
  for (let i = 0; i < oars; i++) {
    const a0 = oarAt(i)
    for (const side of [-1, 1]) {
      const w = half(a0 / length)
      for (let k = 0; k <= 1; k += step / 2) {
        if (sailing) {
          const c = side * (w + k * reach)
          const z = deck - 3 - k * (deck - 3)
          const a = a0 - k * 0.28
          put(a, c, z, k > 0.82 ? OAR[2] : OAR[lit(side) ? 1 : 0])
        } else {
          put(a0, side * (w - 0.05), deck + k * 22, k > 0.85 ? OAR[2] : OAR[lit(side) ? 1 : 0])
        }
      }
    }
  }
  // The stern: a raised quarterdeck under a striped awning on four posts, a lantern on the sternpost.
  const aft = length * 0.16
  for (const [pa, pc] of [[0.25, -0.38], [0.25, 0.38], [aft, -0.4], [aft, 0.4]]) for (let z = top(pa / length); z <= deck + 20; z += 0.5) put(pa, pc, z, MAST[1])
  for (let a = 0.2; a <= aft + 0.05; a += step) {
    for (let c = -0.48; c <= 0.48; c += step) {
      const sag = 1.5 * (1 - (2 * c) ** 2)
      put(a, c, deck + 20 + sag, stripe[Math.floor((c + 0.48) * 6) % 2 === 0 ? 2 : 0])
    }
  }
  for (let z = 0; z <= 6; z += 0.5) put(0.02, 0, top(0) + z, MAST[2])
  for (let dc = -0.06; dc <= 0.06; dc += step) for (let z = 0; z <= 3; z += 0.5) put(0.02, dc, top(0) + 7 + z, z > 2.5 || z < 0.5 ? BRONZE[1] : LANTERN)
  // One mast amidships with a long yard; a great square sail, banded, bellying forward under way, or furled.
  const ma = length * 0.48
  const base = top(ma / length)
  for (let z = base; z <= base + mastHeight; z += 0.5) {
    put(ma, 0, z, MAST[1])
    put(ma + 0.03, along === 'x' ? 0.03 : -0.03, z, MAST[2])
    put(ma - 0.03, along === 'x' ? -0.03 : 0.03, z, MAST[0])
  }
  const yard = base + mastHeight - 6
  const span = beam * 1.25
  for (let c = -span; c <= span; c += step) put(ma + 0.02, c, yard, MAST[0])
  if (sailing) {
    const foot = base + 14
    for (let z = foot; z <= yard - 1; z += 0.5) {
      const f = (z - foot) / (yard - foot)
      const w = span * (0.9 + 0.1 * f)
      for (let c = -w; c <= w; c += step) {
        const belly = 0.32 * Math.sin(((c + w) / (2 * w)) * Math.PI) * Math.sin(f * Math.PI * 0.9 + 0.2)
        const shade = (c / w) * (along === 'x' ? 1 : -1) * 1.1 + belly * 3
        // Broad vertical stripes in the ship's colour.
        const band = Math.floor(((c + w) / (2 * w)) * 5) % 2 === 1
        const colors = band ? stripe : SAIL
        put(ma + belly, c, z, colors[Math.max(0, Math.min(colors.length - 1, Math.round((band ? 1 : 1.6) + shade)))])
      }
    }
  } else {
    for (let c = -span * 0.92; c <= span * 0.92; c += step) for (let dz = -3; dz <= 0; dz += 0.5) put(ma + 0.04, c, yard + dz, SAIL[dz < -2 ? 1 : 2])
  }
  // A long pennant at the masthead, streaming aft.
  for (let k = 0; k < 14; k++) for (let dz = 0; dz <= (k < 9 ? 1.5 : 0.5); dz += 0.5) put(ma - k * 0.07, 0, base + mastHeight - 1 - dz + k * 0.12, FLAG[k % 3 === 0 ? 0 : 1])
  // Foam where the hull meets the water, at the ram, and round the oar blades under way.
  const foam = (u: number, v: number, chance: number, key: number) => {
    const x = Math.round(ax + (u - v) * (TILE_WIDTH / 2))
    const y = Math.round(ay + (u + v) * (TILE_HEIGHT / 2)) + 1
    if (x >= 0 && y >= 0 && x < width && y < height && !canvas.pixels[y * width + x] && hash(key, 3, seed) < chance) canvas.pixels[y * width + x] = FOAM
  }
  const ground = (a: number, c: number): [number, number] => {
    if (reverse) {
      a = length - a
      c = -c
    }
    return along === 'x' ? [a - length / 2, c] : [c, a - length / 2]
  }
  for (let a = 0; a <= length + 0.7; a += step * 4) {
    const t = Math.min(1, a / length)
    for (const side of [-1, 1]) foam(...ground(a, side * (half(t) * 0.7 + 0.06)), 0.6, Math.round(a * 16) * 2 + side)
  }
  if (sailing) {
    for (let i = 0; i < oars; i++) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          const a = oarAt(i) - 0.28 + (hash(i, k, seed + side) - 0.5) * 0.3
          const c = side * (half(oarAt(i) / length) + reach + (hash(k, i, seed + side) - 0.5) * 0.2)
          foam(...ground(a, c), 0.8, i * 97 + k * 7 + side)
        }
      }
    }
  }
  return canvas.sprite(ax, ay, 0)
}
