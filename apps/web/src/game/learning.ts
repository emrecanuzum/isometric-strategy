import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BLOOM, BOARDS, CLAY_TILE, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_PURPLE, CLOTH_RED, COPPER, FIRE, FRONT, GOLD, GRANITE,
  IRON, LEAVES, LIME, OAK, PANE, PLASTER, SANDSTONE, SIDE, SLATE_TILE, SOIL, WATER, WHITEWASH,
  animate, crate, dith, figure, paveArea, plot, smoky, toneOf,
} from './buildingKit'
import type { Model, Top } from './buildingKit'
import { drape, roundTower } from './castle'
import { lamp } from './civic'
import { shrub, washing } from './houses'
import { block, mat, post, stoneBox, woodBox } from './lordBuildings'

// A dome on a drum at (u, v) from z: copper (or gold) over a ring of stone, a lantern on top.
export function dome(m: Model, u: number, v: number, z: number, r: number, skin: Uint32Array, stone: Uint32Array = LIME) {
  m.cylinder(u, v, r, z, z + 4, (a, zz, l, x, y) => dith(stone, toneOf(6, l) + (Math.round(a * r / 2.5) % 2 ? 0.3 : -0.4) + (zz > z + 3.4 ? 0.8 : 0), x, y))
  m.ball(u, v, z + 4, r, (l, x, y, nz) => dith(skin, toneOf(6, l) + (nz > 0.92 ? 0.8 : 0) + (Math.round(x) % 4 === 0 && nz < 0.9 ? -0.6 : 0), x, y), 0.9, true)
  m.solidRound(u, v, r, z, z + 4 + r * 0.9, true)
  m.line([u, v, z + 4 + r * 0.9], [u, v, z + 4 + r * 0.9 + 4], GOLD[4])
  return z + 4 + r * 0.9 + 4
}
// A spire: a tall pointed roof on a square tower top.
function spire(m: Model, u: number, v: number, z: number, half: number, tall: number, roof: Uint32Array) {
  m.cone(u, v, half * 1.3, z, tall, (_a, f, l, x, y) => dith(roof, toneOf(6, l) + (Math.round(f * tall / 2.5) % 2 ? -0.4 : 0.2), x, y), true)
  m.line([u, v, z + tall], [u, v, z + tall + 4], GOLD[4])
  m.card(u, v, z + tall + 3, (set) => { set(-1, 0, GOLD[4]); set(1, 0, GOLD[4]) }, 2)
}
// Beds of herbs in rows over a rectangle: each row its own colour of leaves and flowers.
function herbs(m: Model, u0: number, v0: number, u1: number, v1: number, seed: number) {
  m.canvas.paving = true
  for (let u = u0; u <= u1; u += 0.5) for (let v = v0; v <= v1; v += 0.5) m.put(u, v, 0, dith(SOIL, 2.6 + (hash(Math.round(u * 2), Math.round(v * 2), seed) - 0.5), m.sx(u, v), m.sy(u, v, 0)), -40)
  m.canvas.paving = false
  let row = 0
  for (let v = v0 + 1.5; v < v1; v += 3, row++) {
    const bloom = BLOOM[(row + seed) % BLOOM.length]
    for (let u = u0 + 1; u < u1; u += 1) {
      const k = hash(Math.round(u), row, seed)
      m.card(u, v, 0, (set) => {
        set(0, 0, LEAVES[2])
        set(0, 1, LEAVES[3 + (k > 0.6 ? 1 : 0)])
        if (k > 0.5) set(0, 2, row % 2 ? bloom : LEAVES[5])
      })
    }
  }
}
// A bench along u.
function bench(m: Model, u: number, v: number) {
  woodBox(m, u, v, u + 7, v + 2, 2, 2.8, BOARDS, false)
  for (const a of [u + 0.5, u + 6.5]) post(m, a, v + 1, 0, 2, OAK, 0.8)
}

// The university (CLAUDE.md §9.8): a college of dressed stone round a lawn with an observatory tower under a copper
// dome (1); a bigger college with a clock in a gable, a library wing with tall arched windows, banners and ivy (2); a
// grand hall with gilded ridges, a second dome, an arched gate under a crest, a telescope on the observatory and
// scholars with their books (3).
export function university(level = 1): Sprite {
  const { canvas, cx, base, m, N } = plot(3, 110 + level * 22)
  const tops: Top[] = []
  paveArea(m, 4, 4, N - 4, N - 4, 'grass', 131)
  paveArea(m, 40, 40, N - 6, N - 6, 'flagstone', 132)
  const stone = level === 3 ? SANDSTONE : LIME
  const roof = { kind: 'slate' as const, r: SLATE_TILE, seed: 133, cap: level === 3 ? GOLD[3] : undefined }
  const big = level >= 2
  const r = block(m, {
    u0: 6, v0: 6, u1: big ? 76 : 64, v1: 30, wall: big ? 26 : 20, walls: mat.ashlar(stone, 4, 8), socle: { r: GRANITE, tall: 3 },
    roof: { form: 'gable-u', rise: 14, oh: 1.8, style: roof },
    rows: { z: big ? [5, 15] : [5, 12], every: 7, w: 3, h: 6, style: { frame: stone, arch: true } },
    door: { face: 'front', s: big ? 30 : 24, w: 8, h: 12, style: { arch: true, step: stone, wood: OAK } },
    chimneys: [{ u: 0.15, v: 0.35, tall: 6 }],
  })
  tops.push(...r.tops)
  // The library wing along the right side.
  const lib = block(m, {
    u0: 64, v0: big ? 30 : 32, u1: 88, v1: big ? 76 : 66, wall: big ? 22 : 18, walls: mat.ashlar(stone, 4, 8),
    roof: { form: 'gable-v', rise: 12, oh: 1.6, style: roof },
    rows: { z: [5], every: 7, w: 3.5, h: big ? 12 : 9, style: { frame: stone, arch: true, cross: true } },
  })
  tops.push(...lib.tops)
  // The observatory tower at the front left with its dome.
  const tu = 14
  const tv = big ? 66 : 58
  roundTower(m, tu, tv, 8, big ? 44 : 36, stone, null, { lit: true, seed: 134 })
  dome(m, tu, tv, big ? 46 : 38, 7, COPPER, stone)
  if (level === 3) {
    // A telescope leaning out of the dome's slit.
    m.line([tu + 3, tv + 3, 52], [tu + 10, tv + 7, 58], GOLD[3], 2)
    m.line([tu + 3.5, tv + 3, 52.5], [tu + 10.5, tv + 7, 58.5], GOLD[5], 2)
    dome(m, 70, 52, 22, 7, GOLD, stone)
  }
  if (big) {
    // A clock in the main hall's gable end.
    for (let a = 0; a < Math.PI * 2; a += 0.08) for (let rr = 0; rr <= 3.5; rr += 0.5) m.put(76, 18 + Math.cos(a) * rr, 32 + Math.sin(a) * rr, rr > 3 ? GOLD[2] : WHITEWASH[3], 0.8)
    m.line([76, 18, 32], [76, 18, 34.5], IRON[0], 1)
    m.line([76, 18, 32], [76, 19.8, 32], IRON[0], 1)
    drape(m, 'front', 30, 12, 22, 4, 12, CLOTH_BLUE)
    drape(m, 'front', 30, 52, 22, 4, 12, CLOTH_BLUE)
    // Ivy over the old stone.
    const set = new Set<number>(stone)
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (!set.has(canvas.get(x, y)) || hash(x >> 1, y >> 1, 135) > 0.06 + Math.max(0, (y - (base - 40)) / 300)) continue
      canvas.set(x, y, LEAVES[2 + ((x + y) % 3)])
    }
  }
  // An armillary sphere on a plinth in the yard, hedges and scholars.
  stoneBox(m, 54, 54, 58, 58, 0, 4, stone, false, 2)
  for (let a = 0; a < Math.PI * 2; a += 0.15) {
    m.put(56 + Math.cos(a) * 2.5, 56, 7 + Math.sin(a) * 2.5, GOLD[4], 1)
    m.put(56 + Math.cos(a) * 1.8, 56 + Math.sin(a) * 1.8, 7, GOLD[2], 1)
  }
  for (const [a, b] of [[36, 46], [36, 56], [36, 66], [46, 84], [58, 84]]) shrub(m, a, b, 2.6, 0, a + b)
  figure(m, 48, 50, 0, { tunic: CLOTH_PURPLE, hat: CLOTH_PURPLE, tool: 'book' })
  figure(m, 62, 64, 0, { tunic: CLOTH_BLUE, hood: CLOTH_BLUE, tool: 'book', flip: true })
  if (level === 3) {
    // An arched gate under a crest at the yard's front.
    for (const s of [-7, 7]) stoneBox(m, 62 + s - 2, 86, 62 + s + 2, 90, 0, 16, stone, true, 3)
    stoneBox(m, 53, 86, 71, 90, 13, 18, stone, false, 3)
    m.card(62, 90.2, 15, (set) => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dz) <= 2) set(dx, dz, Math.abs(dx) + Math.abs(dz) === 2 ? GOLD[2] : CLOTH_BLUE[4]) }, 2)
    figure(m, 74, 50, 0, { tunic: CLOTH_RED, hat: CLOTH_RED, tool: 'book' })
    crate(m, 44, 72, 0, 4)
    crate(m, 44.5, 72.5, 4, 3.5)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The hospital (CLAUDE.md §9.8), an infirmary with a herb garden, in two looks per level picked by the building
// (whitewash under red tiles, grey stone under slate): its sign a gilded bowl of the healers, rows of herbs in flower,
// white linen drying on a line, a well and benches where the sick sit in the sun, a healer in white; a second ward at
// level 2, a cloister walk and a chapel turret at level 3.
export function hospital(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, m, N } = plot(2, 70 + level * 18)
  const tops: Top[] = []
  paveArea(m, 3, 3, N - 3, N - 3, 'grass', 141 + v)
  paveArea(m, 18, 30, 34, N - 3, 'gravel', 143)
  const walls = v ? mat.ashlar(LIME, 3.5, 7) : mat.plaster(WHITEWASH)
  const roof = v ? { kind: 'slate' as const, r: SLATE_TILE, seed: 144 } : { kind: 'tile' as const, r: CLAY_TILE, seed: 144 }
  const r = block(m, {
    u0: 5, v0: 5, u1: 44, v1: 26, wall: 16, walls, socle: { r: GRANITE, tall: 2.5 },
    roof: { form: 'gable-u', rise: 11, oh: 1.6, style: roof },
    rows: { z: [5], every: 6, w: 3, h: 5, style: { frame: OAK, shutters: CLOTH_GREEN, cross: true } },
    door: { face: 'front', s: 16, w: 6, h: 9, style: { step: LIME, arch: true, wood: CLOTH_GREEN } },
    chimneys: [{ u: 0.2, v: 0.3, tall: 5 }, { u: 0.8, v: 0.3, tall: 5 }],
  })
  tops.push(...r.tops)
  // The healers' sign: a gilded bowl hanging from a bracket.
  m.line([28, 26, 13], [28, 30, 13], IRON[3], 0.5)
  m.card(28, 29.5, 8, (set) => {
    for (let dx = -2; dx <= 2; dx++) set(dx, 2, GOLD[4])
    for (let dx = -1; dx <= 1; dx++) set(dx, 1, GOLD[3])
    set(0, 0, GOLD[2])
    for (let dz = 3; dz < 5; dz++) { set(-2, dz, IRON[2]); set(2, dz, IRON[2]) }
    set(-1, 3, LEAVES[4]); set(1, 3, LEAVES[3])
  }, 1)
  if (level >= 2) {
    const w = block(m, { u0: 44, v0: 5, u1: 60, v1: 40, wall: 14, walls, socle: { r: GRANITE, tall: 2.5 }, roof: { form: 'gable-v', rise: 10, oh: 1.5, style: roof }, rows: { z: [4.5], every: 6, w: 3, h: 4.5, style: { frame: OAK, cross: true } } })
    tops.push(...w.tops)
  }
  if (level === 3) {
    // A cloister walk along the front of the main ward, and a chapel turret.
    for (let a = 7; a <= 43; a += 6) stoneBox(m, a - 0.8, 31, a + 0.8, 32.6, 0, 8, LIME, false, 2)
    block(m, { u0: 5, v0: 26, u1: 44, v1: 32.6, z0: 8, wall: 0.1, walls: walls, roof: { form: 'shed-v', rise: 3, oh: 0.8, style: roof } })
    roundTower(m, 8, 8, 4, 30, v ? LIME : WHITEWASH, { kind: v ? 'slate' : 'tile', r: v ? SLATE_TILE : CLAY_TILE }, { slits: false, corbel: false })
  }
  herbs(m, 38, 44, 60, 60, 145 + v)
  herbs(m, 5, 38, 16, 60, 146 + v)
  washing(m, 40, 42, 58, 42, 0)
  // A well, benches, the sick and their healer.
  m.cylinder(26, 48, 3, 0, 4, (a, z, l, x, y) => dith(GRANITE, toneOf(6, l) + (Math.floor(z / 1.5 + a * 2) % 2 ? -0.5 : 0.2), x, y))
  m.disc(26, 48, 2.2, 4, () => WATER[0])
  bench(m, 20, 34)
  figure(m, 22, 35, 1.5, { tunic: CLOTH_CREAM, hood: CLOTH_CREAM })
  figure(m, 25, 35, 1.5, { tunic: CLOTH_BLUE })
  figure(m, 30, 40, 0, { tunic: WHITEWASH, hood: WHITEWASH, apron: CLOTH_GREEN })
  void FRONT; void SIDE; void PANE
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The temple (CLAUDE.md §9.8) in two looks per level, picked by the building: 0 a stone church whose bell tower stands
// at the front under a spire; 1 a round temple under a dome ringed by columns. A chapel at level 1; bigger with a
// rose window and braziers at the door at level 2; at level 3 a grand church with gilded spires, a statue and banners.
// The braziers' flames flicker.
export function temple(variant = 0, level = 1): Sprite {
  return animate((f) => templeFrame(variant % 2, level, f), 4, 6)
}
function brazier(m: Model, u: number, v: number, f: number) {
  m.cylinder(u, v, 0.8, 0, 5, (_, __, l, x, y) => dith(IRON, toneOf(6, l), x, y), false)
  m.cylinder(u, v, 1.8, 5, 6.5, (_, __, l, x, y) => dith(GOLD, toneOf(6, l) - 1, x, y), false)
  const k = f < 0 ? 0 : f
  m.card(u, v, 6.5, (set) => { for (let dx = -1; dx <= 1; dx++) for (let dz = 0; dz < 2 + ((dx + k) % 2 === 0 ? 1 : 0); dz++) set(dx, dz, FIRE[dz === 0 ? 3 : hash(dx, dz, k) > 0.5 ? 4 : 5]) }, 1)
}
function templeFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(2, 96 + level * 22)
  const tops: Top[] = []
  paveArea(m, 3, 3, N - 3, N - 3, 'flagstone', 151 + v)
  const stone = level === 3 ? WHITEWASH : LIME
  if (v === 0) {
    const r = block(m, {
      u0: 6, v0: 8, u1: 50, v1: 30, wall: 16 + level * 3, walls: mat.ashlar(stone, 4, 8), socle: { r: GRANITE, tall: 2.5 },
      roof: { form: 'gable-u', rise: 13, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 152, cap: level === 3 ? GOLD[3] : undefined } },
      rows: { z: [5], every: 7, w: 3, h: 9, style: { frame: stone, arch: true, cross: true }, faces: ['front'] },
    })
    tops.push(...r.tops)
    // The bell tower at the front end, its belfry open, a spire over it.
    const tz = 26 + level * 8
    block(m, { u0: 46, v0: 10, u1: 58, v1: 28, wall: tz, walls: mat.ashlar(stone, 4, 8), socle: { r: GRANITE, tall: 2.5 }, door: { face: 'side', s: 5, w: 8, h: 12, style: { arch: true, step: GRANITE, wood: OAK } } })
    // The belfry's arches and bell.
    for (const [face, at, a0, len] of [['front', 28, 46, 12], ['side', 58, 10, 18]] as const) {
      for (let s = 2; s < len - 2; s += len / 2) {
        for (let ds = 0; ds <= 3.5; ds += 0.5) for (let z = tz - 9; z < tz - 2 + Math.sqrt(Math.max(0, 3 - (ds - 1.75) ** 2)); z += 0.5) {
          const c = OAK[0]
          if (face === 'front') m.put(a0 + s + ds, at, z, c, 0.6)
          else m.put(at, a0 + s + ds, z, c, 0.6)
        }
      }
    }
    m.ball(52, 19, tz - 6, 2, (l, x, y) => dith(GOLD, toneOf(6, l), x, y), 1.2)
    // A rose window on the bell tower's face from level 2.
    if (level >= 2) for (let a = 0; a < Math.PI * 2; a += 0.08) for (let rr = 0; rr <= 3.5; rr += 0.5) m.put(58, 19 + Math.cos(a) * rr, tz - 16 + Math.sin(a) * rr, rr > 3 ? stone[2] : [CLOTH_RED[4], CLOTH_BLUE[4], GOLD[4], CLOTH_GREEN[4]][Math.floor((a / (Math.PI * 2)) * 8) % 4], 0.6)
    spire(m, 52, 19, tz, 6, 14 + level * 4, SLATE_TILE)
  } else {
    // The round temple: a drum of stone ringed by columns under a dome.
    const cu = 30
    const cvv = 28
    const rr = 15 + level
    const wall = 14 + level * 3
    m.cylinder(cu, cvv, rr - 4, 0, wall, (a, z, l, x, y) => {
      const win = Math.round(a * 6) % 3 === 0 && z > 4 && z < wall - 4
      return win ? (z > wall - 6 ? PANE[3] : PANE[1]) : dith(stone, toneOf(6, l) + ((Math.round(z) % 4 === 0) ? -0.8 : 0), x, y)
    })
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      if (Math.cos(a) + Math.sin(a) < -0.6) continue
      m.cylinder(cu + Math.cos(a) * rr, cvv + Math.sin(a) * rr, 1, 0, wall, (_, z, l, x, y) => dith(WHITEWASH, toneOf(6, l) + (z > wall - 1.5 || z < 1 ? 0.8 : 0), x, y), false)
    }
    m.cylinder(cu, cvv, rr + 1, wall, wall + 2.5, (_a, z, l, x, y) => dith(stone, toneOf(6, l) + (z > wall + 2 ? 0.8 : 0), x, y))
    m.disc(cu, cvv, rr + 1, wall + 2.5, (_a, _b, x, y) => dith(stone, 3.6, x, y))
    const top = dome(m, cu, cvv, wall + 2, rr - 3, level === 3 ? GOLD : COPPER, stone)
    void top
    stoneBox(m, cu - 6, cvv + rr - 1, cu + 6, cvv + rr + 3, 0, 1.5, stone, false, 1.5)
  }
  if (level >= 2) {
    brazier(m, v ? 22 : 54, v ? 50 : 34, f)
    brazier(m, v ? 38 : 62, v ? 50 : 28, f < 0 ? -1 : (f + 2) % 4)
  }
  if (level === 3) {
    // A statue on a plinth before it, banners on its face.
    stoneBox(m, 22, 44, 28, 50, 0, 5, GRANITE, true, 2.5)
    figure(m, 25, 47, 5, { tunic: WHITEWASH, hood: WHITEWASH, skin: WHITEWASH, arm: 2 })
    m.solidBox(23, 45, 27, 49, 5, 18)
    if (v === 0) {
      drape(m, 'front', 30, 12, 20, 4, 12, CLOTH_PURPLE)
      drape(m, 'front', 30, 34, 20, 4, 12, CLOTH_PURPLE)
    }
  }
  lamp(m, 40, 54, 10)
  shrub(m, 8, 52, 3, 0.2, 7)
  shrub(m, 56, 54, 2.4, 0.3, 8)
  figure(m, 32, 52, 0, { tunic: CLOTH_CREAM, hood: CLOTH_CREAM })
  void BOARDS; void PLASTER; void CLOTH_GREEN
  return smoky(canvas.sprite(cx, base, 0), tops)
}
