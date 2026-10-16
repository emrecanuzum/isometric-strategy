import { hash } from '@game/shared'
import { ramp } from './sprites'
import type { Sprite } from './sprites'
import {
  BOARDS, CLOTH_BLUE, CLOTH_CREAM, CLOTH_RED, GRANITE, GREY_BOARDS, LEAVES, LIME, OAK, SHINGLE_ROOF, SOIL, STRAW, THATCH_ROOF,
  WATER, animate, barrel, bale, cart, dith, fence, haystack, plot, toneOf,
} from './buildingKit'
import type { Model } from './buildingKit'
import { block, mat, post, stoneBox } from './lordBuildings'

const WHEAT = ramp(0x5a4614, 0x7e6420, 0xa48630, 0xc6a640, 0xdcc058, 0xf0dc84)
const FLAX = ramp(0x1a3a1c, 0x285428, 0x3a6e30, 0x52883a, 0x6aa046, 0x8ab85a)
const FLAX_BLOOM = ramp(0x3a4a9a, 0x5a72c8, 0x8aa2e8)
const PUMPKIN = ramp(0x6a2a0c, 0x9a4410, 0xc8601a, 0xe8862a, 0xf4ac4a, 0xfcd07a)
const VINE = ramp(0x163018, 0x22461e, 0x325e28, 0x467832, 0x5e923e, 0x7aac4e)

// How far the head of a plant at (u, v) leans in frame f (8 frames to a gust): a wave running across the field.
const sway = (u: number, v: number, f: number) => (f < 0 ? 0 : Math.round(Math.sin((f / 8) * Math.PI * 2 - (u * 0.7 + v * 0.35) * 0.18) * 1.2 + 0.2))

// Fields (CLAUDE.md §6.4) in three crops, picked by the building: 0 wheat, 1 flax in blue flower, 2 pumpkins on vines.
// Ploughed soil in furrows along one tile axis with the crop on the ridges, a low fence on its two front edges; from
// level 2 a ditch of water runs along its back edge and the crop stands thicker; at level 3 a dry-stone wall replaces
// the fence. Wheat and flax sway in waves of wind (8 frames), the pumpkin leaves stir a little.
export function farm(variant: number, level = 1): Sprite {
  return animate((f) => farmFrame(variant % 3, level, f), 8, 6, true)
}
function farmFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(2, 14)
  const inset = 3
  // The soil: ridges and furrows along u.
  canvas.paving = true
  for (let u = inset; u <= N - inset; u += 0.5) {
    for (let vv = inset; vv <= N - inset; vv += 0.5) {
      const row = (vv - inset) % 5
      const furrow = row < 1.5
      const x = m.sx(u, vv)
      const y = m.sy(u, vv, 0)
      m.put(u, vv, 0, dith(SOIL, (furrow ? 1.6 : 3.4 - row * 0.15) + (hash(Math.round(u * 2), Math.round(vv * 2), 31) - 0.5) * 1.3, x, y), -50)
    }
  }
  // A ditch along the back edge from level 2.
  if (level >= 2) {
    for (let u = 1; u <= N - 1; u += 0.5) for (let vv = 0.5; vv <= 3; vv += 0.5) m.put(u, vv, 0, vv < 1 || vv > 2.5 ? SOIL[1] : dith(WATER, 2.4 + Math.sin(u * 0.5) * 0.6 + (vv < 1.5 ? 1 : 0), m.sx(u, vv), m.sy(u, vv, 0)), -49)
  }
  canvas.paving = false
  const thick = level >= 2 ? 0.55 : 0.75
  for (let vv = inset + 2.5; vv <= N - inset - 1; vv += 5) {
    for (let u = inset + 1; u <= N - inset - 1; u += 1) {
      const k = hash(Math.round(u), Math.round(vv), 37 + v)
      if (k < (v === 2 ? 0.55 : thick - 0.5)) continue
      const lean = sway(u, vv, v === 2 ? -1 : f)
      if (v === 0) {
        const tall = 4 + Math.floor(hash(u, vv, 41) * 2) + (level === 3 ? 1 : 0)
        m.card(u, vv, 0, (set) => {
          for (let z = 0; z < tall; z++) set(z >= tall - 2 ? lean : z >= tall - 4 && lean !== 0 ? Math.sign(lean) * 0.5 : 0, z, dith(WHEAT, 1.6 + z * 0.55 + (k > 0.8 ? 0.6 : 0), u * 2, z))
          // The ear.
          set(lean, tall, WHEAT[5])
          if (k > 0.6) set(lean + 1, tall - 1, WHEAT[4])
        })
      } else if (v === 1) {
        const tall = 4 + Math.floor(hash(u, vv, 43) * 2)
        m.card(u, vv, 0, (set) => {
          for (let z = 0; z < tall; z++) set(z >= tall - 2 ? lean : 0, z, FLAX[z < 2 ? 2 : 3 + (k > 0.7 ? 1 : 0)])
          if (k > 0.35) set(lean, tall, FLAX_BLOOM[k > 0.75 ? 2 : 1])
          if (k > 0.85) set(lean + 1, tall - 1, FLAX_BLOOM[0])
        })
      } else {
        // Vines along the ridge, with now and then a pumpkin.
        m.card(u, vv, 0, (set) => {
          const wob = f < 0 ? 0 : Math.round(Math.sin((f / 8) * Math.PI * 2 - u * 0.2) * 0.6)
          set(0, 0, VINE[2])
          set(0, 1, VINE[3 + (k > 0.8 ? 1 : 0)])
          set(wob, 2, VINE[k > 0.7 ? 5 : 4])
          if (k > 0.75) set(1, 1, VINE[2])
        })
        if (hash(Math.round(u), Math.round(vv), 47) > 0.86 && u % 2 === 0) {
          m.ball(u, vv + 1.2, 1.2, 1.7, (l, x, y) => dith(PUMPKIN, toneOf(6, l) + (Math.round(x) % 2 === 0 ? -0.4 : 0), x, y), 0.8)
          m.put(u - 0.5, vv + 1, 3.2, VINE[3], 0.5)
        }
      }
    }
  }
  // The edge: a low fence (a dry-stone wall at level 3) along the two front edges.
  if (level < 3) {
    fence(m, 1, N - 1, N - 1, N - 1, GREY_BOARDS, 4, 6)
    fence(m, N - 1, 1, N - 1, N - 1, GREY_BOARDS, 4, 6)
  } else {
    for (let u = 1; u < N - 1; u += 0.5) drystone(m, u, N - 1.5)
    for (let vv = 1; vv < N - 2; vv += 0.5) drystone(m, N - 1.5, vv)
  }
  return canvas.sprite(cx, base, 0)
}
// A stone of a dry-stone wall at (u, v), rounded.
function drystone(m: Model, u: number, v: number) {
  const k = hash(Math.round(u), Math.round(v), 51)
  const tall = 2 + Math.floor(k * 1.5)
  for (let z = 0; z <= tall; z += 0.5) {
    const top = z > tall - 0.6
    m.put(u, v, z, dith(GRANITE, (top ? 3.6 : 2.2) + (hash(Math.floor(u / 2), Math.floor(z), 52) - 0.5) * 1.4, m.sx(u, v), m.sy(u, v, z)))
  }
}

// What stands on a field from level 2 (drawn apart from the flat field so it sorts with the buildings around it):
// haystacks and a scarecrow whose sleeves flap in the wind; at level 3 a barn with a haystack by the wheat, a shed and
// a well by the flax, a vine pergola by the pumpkins.
export function farmProps(level: number, variant = 0): Sprite {
  return animate((f) => farmPropsFrame(level, variant % 3, f), 4, 4)
}
function farmPropsFrame(level: number, v: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(2, level === 3 ? 56 : 28)
  if (level === 3 && v === 0) {
    block(m, { u0: 6, v0: 6, u1: 22, v1: 18, wall: 10, walls: mat.boards(BOARDS), socle: { r: GRANITE, tall: 2 }, roof: { form: 'gable-u', rise: 8, oh: 1.2, style: { kind: 'thatch', r: THATCH_ROOF, seed: 61 } }, door: { face: 'side', s: 3.5, w: 5, h: 7, style: { open: true } } })
    haystack(m, 30, 9, 4.5)
    haystack(m, 37, 7, 3.5)
    cart(m, 26, 16, 'hay')
  } else if (level === 3 && v === 1) {
    block(m, { u0: 6, v0: 6, u1: 19, v1: 17, wall: 9, walls: mat.boards(GREY_BOARDS), roof: { form: 'gable-v', rise: 6, oh: 1, style: { kind: 'shingle', r: SHINGLE_ROOF, seed: 62 } }, door: { face: 'front', s: 4, w: 4.5, h: 6.5, style: { open: true } } })
    well(m, 28, 10)
    barrel(m, 22, 8)
  } else if (level === 3) {
    // A pergola of vines on posts.
    for (const [a, b] of [[24, 6], [36, 6], [24, 16], [36, 16]]) post(m, a, b, 0, 11, OAK, 1.2)
    for (let a = 23; a <= 37; a += 0.5) for (let b = 5; b <= 17; b += 0.5) {
      if (hash(Math.round(a), Math.round(b), 63) < 0.25) continue
      m.put(a, b, 11 + hash(Math.round(a), Math.round(b), 64) * 1.5, dith(LEAVES, 2.6 + hash(Math.round(a), Math.round(b), 65) * 2, m.sx(a, b), m.sy(a, b, 11)))
    }
    for (let i = 0; i < 6; i++) m.put(25 + i * 2, 16.5, 9.5, PUMPKIN[3], 1)
    haystack(m, 10, 9, 4)
    m.solidBox(23, 5, 37, 17, 10, 12.5)
  } else {
    haystack(m, 8, 8, 4)
    haystack(m, 14, 5, 3.2)
    if (v === 2) barrel(m, 20, 6)
    if (v === 1) bale(m, 18, 5)
  }
  // The scarecrow on the field, sleeves flapping.
  scarecrow(m, level === 3 ? 44 : 34, level === 3 ? 40 : 30, f)
  if (level === 3 && v === 0) stoneBox(m, 4, 4, 5, 5, 0, 0.1, LIME, false)
  void N
  return canvas.sprite(cx, base, 0)
}

function well(m: Model, u: number, v: number) {
  m.cylinder(u, v, 3.2, 0, 4, (a, z, l, x, y) => dith(GRANITE, toneOf(6, l) + (Math.floor(z / 1.5 + a * 2) % 2 ? -0.5 : 0.2), x, y))
  m.disc(u, v, 2.4, 4, () => WATER[0])
  post(m, u - 2.5, v, 0, 10, OAK, 1)
  post(m, u + 2.5, v, 0, 10, OAK, 1)
  m.line([u - 2.5, v, 8.5], [u + 2.5, v, 8.5], OAK[3])
  m.line([u, v, 8.5], [u, v, 5], GREY_BOARDS[3])
  block(m, { u0: u - 3.5, v0: v - 2, u1: u + 3.5, v1: v + 2, z0: 10, wall: 0.1, walls: mat.boards(BOARDS), roof: { form: 'gable-u', rise: 2.5, oh: 0.6, style: { kind: 'shingle', r: SHINGLE_ROOF } } })
}

// A scarecrow on a pole: a sack head under a straw hat, a ragged coat on a crossbar; frame f flaps its sleeves.
function scarecrow(m: Model, u: number, v: number, f: number) {
  const flap = f < 0 ? 0 : [0, 1, 0, -1][f % 4]
  m.card(u, v, 0, (set) => {
    for (let z = 0; z < 14; z++) set(0, z, OAK[z > 8 ? 3 : 2])
    for (let dx = -5; dx <= 5; dx++) set(dx, 10, OAK[3])
    // Coat.
    for (let z = 5; z < 11; z++) for (let dx = -2; dx <= 2; dx++) set(dx, z, (z + dx) % 3 === 0 ? CLOTH_RED[2] : CLOTH_BLUE[dx < 0 ? 4 : 2])
    // Sleeves hanging from the crossbar, swinging.
    // (The swinging ends are left out of the still look: they move over open ground.)
    for (const side of [-1, 1]) for (let k = 0; k < (f < 0 ? 2 : 3); k++) set(side * (4 + (k === 2 ? (side < 0 ? -flap : flap) : 0)), 9 - k, CLOTH_BLUE[3 - k])
    if (f >= 0) {
      set(-5 - (flap < 0 ? 1 : 0), 7, STRAW[4])
      set(5 + (flap > 0 ? 1 : 0), 7, STRAW[4])
    }
    // Head and hat.
    for (let z = 11; z < 14; z++) for (let dx = -1; dx <= 1; dx++) set(dx, z, CLOTH_CREAM[dx < 0 ? 4 : 3])
    set(-1, 12, OAK[0])
    set(1, 12, OAK[0])
    for (let dx = -3; dx <= 3; dx++) set(dx, 14, STRAW[3])
    for (let dx = -1; dx <= 1; dx++) set(dx, 15, STRAW[4])
    // A crow on the crossbar.
    set(4, 11, OAK[0])
    set(5, 11, OAK[0])
    set(4, 12, OAK[1])
  })
}
