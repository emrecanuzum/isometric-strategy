import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BASALT, BLOOM, BOARDS, CLAY_TILE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_RED, COPPER, FIRE, GOLD, GRANITE, IRON, LEAD, LEAVES, LIME,
  MOSS_ROOF, OAK, PLASTER, SLATE_TILE, STEEL, WHITEWASH,
  animate, barrel, cart, dith, figure, flagpole, paveArea, plot, smoky, toneOf,
} from './buildingKit'
import type { Model, RoofStyle, Top } from './buildingKit'
import { curtain, drape, roundTower } from './castle'
import { awning, counter, lamp } from './civic'
import { shrub } from './houses'
import { dome } from './learning'
import { block, mat, stoneBox, woodBox } from './lordBuildings'

const BRONZE = Uint32Array.from([0xff2a3a1a, 0xff3a5228, 0xff4e6c36, 0xff648a46, 0xff80a85a, 0xffa0c47a].map((c) => c >>> 0))
// A brazier with a flame flickering with frame f.
function brazier(m: Model, u: number, v: number, f: number, tall = 6) {
  m.cylinder(u, v, 0.8, 0, tall, (_, __, l, x, y) => dith(IRON, toneOf(6, l), x, y), false)
  m.cylinder(u, v, 2, tall, tall + 1.5, (_, __, l, x, y) => dith(GOLD, toneOf(6, l) - 1, x, y), false)
  const k = f < 0 ? 0 : f
  m.card(u, v, tall + 1.5, (set) => { for (let dx = -1; dx <= 1; dx++) for (let dz = 0; dz < 2 + ((dx + k) % 2 === 0 ? 1 : 0); dz++) set(dx, dz, FIRE[dz === 0 ? 3 : hash(dx, dz, k) > 0.5 ? 4 : 5]) }, 1)
}

// The citadel: a great square donjon of dark stone behind a crenellated parapet, lit slits up its walls, with a curtain
// wall along the front edges and open towers at its ends (level 1); the curtain wall all round with a gatehouse between
// two towers, crimson drapes on the donjon and braziers at the gate (level 2); a taller donjon with a roofed upper
// tier, roofed towers with banners, a gilded portcullis and guards in armour at the gate (level 3). The second look
// roofs the towers in moss-grown slate. Banners wave and the braziers flicker.
export function citadel(variant = 0, level = 1): Sprite {
  return animate((f) => citadelFrame(variant % 2, level, f), 4, 5)
}
function citadelFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(3, 120 + level * 22)
  const tops: Top[] = []
  paveArea(m, 6, 6, N - 6, N - 6, 'cobble', 201 + v, false)
  const roof: RoofStyle | null = level >= 3 ? (v ? { kind: 'slate', r: MOSS_ROOF, moss: 0.3, seed: 202 } : { kind: 'slate', r: SLATE_TILE, seed: 202 }) : null
  const k0 = 30
  const k1 = 64
  const tall = 34 + level * 6
  block(m, { u0: k0, v0: k0, u1: k1, v1: k1, wall: tall, walls: mat.ashlar(BASALT, 4, 7), roof: { form: 'flat', rise: 0, oh: 0, style: { kind: 'lead', r: LEAD } }, rows: { z: [8, 18, 28, ...(level === 3 ? [38] : [])], every: 6, w: 2, h: 4.5, style: { frame: BASALT } }, door: { face: 'front', s: 14, w: 6, h: 10, style: { arch: true, wood: IRON, frame: GRANITE } } })
  for (let s = 0; s < k1 - k0; s += 3) {
    if (Math.floor(s / 3) % 2) continue
    stoneBox(m, k0 + s, k1 - 1, k0 + s + 1.8, k1, tall, tall + 3, BASALT, false, 3)
    stoneBox(m, k1 - 1, k0 + s, k1, k0 + s + 1.8, tall, tall + 3, BASALT, false, 3)
  }
  if (level >= 2) for (const s of [6, 24]) { drape(m, 'front', k1, k0 + s, tall - 4, 5, 16, CLOTH_RED); drape(m, 'side', k1, k0 + s, tall - 4, 5, 16, CLOTH_RED) }
  if (level === 3) {
    const up = block(m, { u0: 38, v0: 38, u1: 58, v1: 58, z0: tall, wall: 14, walls: mat.ashlar(BASALT, 4, 7), roof: { form: 'hip', rise: 12, oh: 1.2, style: roof! }, rows: { z: [4], every: 6, w: 2, h: 4, style: { frame: BASALT } }, chimneys: [{ u: 0.8, v: 0.3, tall: 5 }], chimneyStone: BASALT })
    tops.push(...up.tops)
  }
  // The curtain wall: along the front edges (all round from level 2), towers at its corners.
  const e = 6
  const w = 12 + level * 2
  if (level >= 2) {
    curtain(m, e, e, N - e, e + 3, w, BASALT)
    curtain(m, e, e, e + 3, N - e, w, BASALT)
  }
  curtain(m, N - e - 3, e, N - e, N - e, w, BASALT)
  const gate = N / 2
  curtain(m, e, N - e - 3, gate - 9, N - e, w, BASALT)
  curtain(m, gate + 9, N - e - 3, N - e, N - e, w, BASALT)
  stoneBox(m, gate - 9, N - e - 4, gate + 9, N - e + 0.5, 0, w + (level >= 2 ? 8 : 2), BASALT, true, 3.5)
  m.front(gate - 4, gate + 4, N - e + 0.5, 0, (s) => 8 + Math.sqrt(Math.max(0, 16 - (s - 4) ** 2)) * 0.8, (s, z) => (level === 3 ? (Math.round(s * 2) % 3 === 0 ? GOLD[3] : Math.round(z * 2) % 5 === 0 ? GOLD[2] : OAK[0]) : Math.round(s * 2) % 3 === 0 ? IRON[4] : OAK[0]), 0.6)
  const corners = level >= 2 ? [[e + 1, e + 1], [N - e - 1, e + 1], [e + 1, N - e - 1], [N - e - 1, N - e - 1]] : [[N - e - 1, e + 1], [e + 1, N - e - 1], [N - e - 1, N - e - 1]]
  const flags: [number, number, number][] = []
  for (const [a, b] of corners) {
    const tip = roundTower(m, a, b, 7, w + 14, BASALT, roof, { lit: true, seed: a + b })
    if (roof) flags.push([a, b, tip.z])
  }
  if (level >= 2) for (const side of [-1, 1]) roundTower(m, gate + side * 11, N - e - 2, 4.5, w + 12, BASALT, roof, { lit: true, seed: 203 + side })
  if (level >= 2) { brazier(m, gate - 14, N - 2, f); brazier(m, gate + 14, N - 2, f < 0 ? -1 : (f + 2) % 4) }
  if (level === 3) for (const s of [-6, 6]) figure(m, gate + s, N - 3, 0, { tunic: STEEL, hat: STEEL, tool: 'spear', legs: STEEL })
  if (f >= 0) {
    flagpole(m, 47, 47, level === 3 ? tall + 26 : tall + 1, 12, CLOTH_RED, f / 4, 10, 5)
    for (const [a, b, z] of flags) flagpole(m, a, b, z - 1, 8, CLOTH_RED, (f / 4 + a * 0.01) % 1, 7, 4)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The founder in bronze (gilded at level 3) on a pedestal: a crowned figure in a long cloak, his sword raised from
// level 2, a gilded plaque on the pedestal.
function founder(m: Model, u: number, v: number, level: number) {
  const ped = 10 + level * 3
  stoneBox(m, u - 5, v - 5, u + 5, v + 5, 0, 2, LIME, true, 2)
  stoneBox(m, u - 3.5, v - 3.5, u + 3.5, v + 3.5, 2, ped, LIME, true, 3)
  m.front(u - 2, u + 2, v + 3.5, ped * 0.4, ped * 0.7, (_, z) => GOLD[Math.round(z) % 2 ? 3 : 4], 0.5)
  const metal = level >= 3 ? GOLD : BRONZE
  m.card(u, v, ped, (set) => {
    for (let z = 0; z < 22; z++) {
      const half = z < 4 ? 2 : z < 15 ? Math.round(4 - (z - 4) / 5) : z < 17 ? 4 : z < 18 ? 1 : z === 18 || z === 21 ? 1 : 2
      for (let d = -half; d <= half; d++) {
        if (z < 4 && d === 0) continue
        const cloak = level >= 2 && z >= 4 && z < 17 && (d === -half || d === half)
        set(d, z, cloak ? CLOTH_RED[d < 0 ? 4 : 2] : metal[d < 0 ? 4 : d < half / 2 ? 3 : 2])
      }
    }
    for (let d = -2; d <= 2; d++) set(d, 22, GOLD[d < 0 ? 5 : 3])
    for (const d of [-2, 0, 2]) set(d, 23, GOLD[5])
    if (level >= 2) {
      for (let z = 0; z < 14; z++) set(5, 14 + z, z < 2 ? GOLD[3] : STEEL[z < 13 ? 3 : 5])
      for (const d of [4, 6]) set(d, 16, GOLD[3])
      set(4, 14, metal[3])
    }
  }, 0.5)
  m.solidBox(u - 2, v - 2, u + 2, v + 2, ped, ped + 24)
}
function obelisk(m: Model, u: number, v: number, tall = 30) {
  stoneBox(m, u - 3, v - 3, u + 3, v + 3, 0, 2.5, LIME, true, 2.5)
  for (let z = 2.5; z < tall; z += 0.5) {
    const half = 2 - ((z - 2.5) / tall) * 1
    m.front(u - half, u + half, v + half, z, z, (_, __, x, y) => (Math.round(z) % 8 === 0 ? GOLD[3] : dith(BASALT, 3.4, x, y)))
    m.side(v - half, v + half, u + half, z, z, (_, __, x, y) => (Math.round(z) % 8 === 0 ? GOLD[2] : dith(BASALT, 1.6, x, y)))
  }
  m.cone(u, v, 1.4, tall, 3, (_, __, l, x, y) => dith(GOLD, toneOf(6, l) + 0.5, x, y))
  m.solidBox(u - 2, v - 2, u + 2, v + 2, 0, tall + 3)
}

// The dynasty's memorial: the founder's statue on a pedestal in a paved square between flower beds and two braziers
// (level 1); a colonnade with a gilded architrave round behind it, crimson drapes and clipped hedges (level 2); a
// triumphal arch with a gilded attic and the dynasty's crown behind a gilded statue, black obelisks at its sides and an
// eternal flame before it (level 3). The second look plants roses in the beds. The flames flicker.
export function memorial(variant = 0, level = 1): Sprite {
  return animate((f) => memorialFrame(variant % 2, level, f), 4, 6)
}
function memorialFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(2, 80 + level * 22)
  paveArea(m, 3, 3, N - 3, N - 3, 'flagstone', 211)
  const blooms = v ? [CLOTH_RED[4], WHITEWASH[5]] : [GOLD[4], BLOOM[3]]
  const bed = (u: number, vv: number) => {
    for (let a = -5; a <= 5; a += 1) for (let b = -3; b <= 3; b += 1) {
      const k = hash(Math.round(u + a), Math.round(vv + b), 212)
      m.card(u + a, vv + b, 0, (set) => { set(0, 0, LEAVES[3]); set(0, 1, k > 0.55 ? blooms[k > 0.8 ? 1 : 0] : LEAVES[4]) })
    }
    stoneBox(m, u - 6, vv + 3.5, u + 6, vv + 4.5, 0, 1, LIME, false, 1)
  }
  if (level === 2) {
    // The colonnade along the two back edges.
    const cols: [number, number][] = []
    for (let a = 6; a <= 58; a += 7) cols.push([a, 6])
    for (let b = 13; b <= 58; b += 7) cols.push([6, b])
    for (const [a, b] of cols) m.cylinder(a, b, 1.3, 0, 22, (_, z, l, x, y) => dith(WHITEWASH, toneOf(6, l) + (z > 21 || z < 1 ? 0.8 : 0), x, y))
    stoneBox(m, 4.5, 4.5, 59.5, 7.5, 22, 25, LIME, true, 1.5)
    stoneBox(m, 4.5, 7.5, 7.5, 59.5, 22, 25, LIME, true, 1.5)
    m.front(4.5, 59.5, 7.5, 23, 24.5, () => GOLD[3], 0.5)
    m.side(7.5, 59.5, 7.5, 23, 24.5, () => GOLD[2], 0.5)
    drape(m, 'front', 7.6, 20, 21, 4, 10, CLOTH_RED)
    drape(m, 'front', 7.6, 40, 21, 4, 10, CLOTH_RED)
    for (const [a, b] of [[14, 40], [40, 14]]) m.box(a - 3, b - 3, a + 3, b + 3, 0, 5, { front: (_, __, x, y) => dith(LEAVES, 3, x, y), side: (_, __, x, y) => dith(LEAVES, 1.6, x, y), top: (_, __, x, y) => dith(LEAVES, 3.8, x, y) })
  }
  if (level === 3) {
    // The triumphal arch behind the statue.
    stoneBox(m, 10, 14, 22, 26, 0, 32, LIME, true, 4)
    stoneBox(m, 10, 38, 22, 50, 0, 32, LIME, true, 4)
    stoneBox(m, 10, 14, 22, 50, 32, 42, LIME, true, 4)
    m.side(14, 50, 22, 33, 41, (s, z) => (Math.abs(s - 18) < 6 && z > 35 && z < 39 ? CLOTH_RED[3] : GOLD[Math.round(s + z) % 3 === 0 ? 2 : 3]), 0.5)
    // The arch's opening: dark under a round head.
    m.side(26, 38, 22, 0, (s) => 22 + Math.sqrt(Math.max(0, 36 - (s - 6) ** 2)), () => BASALT[1], 0.4)
    m.card(16, 32, 42, (set) => { for (let dx = -3; dx <= 3; dx++) set(dx, 0, GOLD[4]); for (const dx of [-3, 0, 3]) { set(dx, 1, GOLD[5]); set(dx, 2, GOLD[4]) } }, 1)
    obelisk(m, 30, 8, 30)
    obelisk(m, 8, 30, 30)
    brazier(m, 50, 50, f, 3)
  }
  founder(m, 34, 34, level)
  bed(46, 20)
  bed(20, 46)
  brazier(m, 50, 36, f < 0 ? -1 : (f + 1) % 4)
  brazier(m, 36, 50, f < 0 ? -1 : (f + 3) % 4)
  if (level === 1) { shrub(m, 8, 8, 3, 0.2, 3); shrub(m, 56, 8, 2.5, 0.3, 4) }
  return canvas.sprite(cx, base, 0)
}

// The guild hall: a tall timber-framed hall with a chimney, a striped awning over a counter of cloth and a sign of
// gilded scales out front (level 1); a stone ground floor with a jettied timber storey over it, a belfry beside it,
// guild drapes and a cart of goods (level 2); a grand hall of stone and gilded trim with a golden-domed belfry, an
// arcade of stalls under a gold canopy, chests of coin and the guild's scales (level 3). The second look roofs it in
// slate.
export function guildHall(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, m } = plot(2, 80 + level * 20)
  const tops: Top[] = []
  paveArea(m, 3, 3, 61, 61, 'cobble', 221 + v)
  const roof: RoofStyle = v ? { kind: 'slate', r: SLATE_TILE, seed: 222, cap: level === 3 ? GOLD[3] : undefined } : { kind: 'tile', r: CLAY_TILE, seed: 222, cap: level === 3 ? GOLD[3] : undefined }
  if (level === 1) {
    const r = block(m, { u0: 8, v0: 8, u1: 44, v1: 34, wall: 22, walls: mat.framed(PLASTER, OAK, 8), socle: { r: GRANITE, tall: 3 }, roof: { form: 'gable-v', rise: 14, oh: 1.8, style: roof }, rows: { z: [5, 13], every: 6, w: 3, h: 4, style: { frame: OAK, cross: true, flowers: true } }, door: { face: 'front', s: 15, w: 6, h: 9, style: { step: GRANITE, arch: true } }, chimneys: [{ u: 0.3, v: 0.3, tall: 6 }] })
    tops.push(...r.tops)
    awning(m, 10, 34, 42, 42, 10, 7, CLOTH_GREEN)
    counter(m, 12, 40, 37, 'cloth', 5)
  } else {
    const stone = level === 3 ? WHITEWASH : LIME
    block(m, { u0: 8, v0: 8, u1: 44, v1: 34, wall: 13, walls: mat.ashlar(stone, 4, 8), rows: { z: [4], every: 7, w: 3.5, h: 5, style: { frame: stone, arch: true } }, door: { face: 'front', s: 15, w: 7, h: 10, style: { step: GRANITE, arch: true } } })
    woodBox(m, 7, 7, 45.5, 35.5, 13, 14.2, OAK, false)
    const r = block(m, { u0: 7, v0: 7, u1: 45.5, v1: 35.5, z0: 14.2, wall: 13, walls: level === 3 ? mat.ashlar(stone, 4, 8) : mat.framed(PLASTER, OAK, 7), roof: { form: 'gable-v', rise: 15, oh: 1.8, style: roof }, rows: { z: [3.5], every: 6, w: 3, h: 5, style: { frame: level === 3 ? GOLD : OAK, cross: true, flowers: level === 2 } }, chimneys: [{ u: 0.3, v: 0.3, tall: 6 }] })
    tops.push(...r.tops)
    drape(m, 'front', 35.5, 10, 24, 4, 12, CLOTH_GREEN)
    drape(m, 'front', 35.5, 30, 24, 4, 12, CLOTH_GREEN)
    // The belfry beside it.
    roundTower(m, 52, 12, 5, level === 3 ? 34 : 40, stone, level === 3 ? null : roof, { lit: true, corbel: false, seed: 223 })
    if (level === 3) dome(m, 52, 12, 34, 5, GOLD, stone)
    if (level === 2) cart(m, 46, 44, 'sacks')
    else {
      awning(m, 10, 36, 44, 44, 9, 6.5, GOLD, CLOTH_CREAM)
      counter(m, 12, 42, 39, 'cloth', 7)
      for (const [a, b] of [[50, 40], [54, 44]]) {
        woodBox(m, a, b, a + 5, b + 3.5, 0, 3, BOARDS, false)
        m.flat(a + 0.5, b + 0.5, a + 4.5, b + 3, 3.2, (_, __, x, y) => dith(GOLD, 3.6 + (hash(Math.round(x), Math.round(y), 2) > 0.6 ? 1.4 : 0), x, y))
      }
    }
  }
  barrel(m, 50, 26)
  lamp(m, 4, 40, 12)
  // The guild's sign: gilded scales on a post at the front left.
  m.line([6, 50, 0], [6, 50, 15], OAK[3])
  m.card(6, 50, 14, (set) => {
    for (let dx = -5; dx <= 5; dx++) set(dx, 0, GOLD[3])
    for (const sx of [-5, 5]) { for (let dz = -4; dz < 0; dz++) set(sx, dz, GOLD[1]); for (let dx = -2; dx <= 2; dx++) set(sx + dx, -5, GOLD[dx < 0 ? 4 : 2]) }
  }, 0.5)
  figure(m, 30, 50, 0, { tunic: CLOTH_GREEN, hat: CLOTH_CREAM, tool: 'book' })
  void COPPER
  return smoky(canvas.sprite(cx, base, 0), tops)
}
