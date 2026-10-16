import { hash } from '@game/shared'
import { ramp } from './sprites'
import type { Sprite } from './sprites'
import {
  BOARDS, CLAY_TILE, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_RED, FIRE, GOLD, GRANITE, GREY_BOARDS, IRON, LEAVES, LIME,
  LOGWOOD, MOSS_ROOF, OAK, SHINGLE_ROOF, SLATE_TILE, STEEL, THATCH_ROOF, WHITEWASH,
  barrel, crate, dith, figure, flagpole, paveArea, plot, smoky, toneOf,
} from './buildingKit'
import type { Model, Top } from './buildingKit'
import { roundTower } from './castle'
import { awning, counter, lamp } from './civic'
import { block, mat, post, woodBox } from './lordBuildings'

const REED = ramp(0x2a3a20, 0x3e5228, 0x566e30, 0x728a3c, 0x92a64c, 0xb0bc66)
const ARCANE = ramp(0x2a1240, 0x4a1e78, 0x6a2aa0, 0x9a4ae0, 0xc488ff, 0xe8c8ff)
const FISH = ramp(0x3a4450, 0x5a6672, 0x8a96a2, 0xb8c4cc, 0xdce4ea)

// A rowboat pulled up along u with its oars in it.
export function rowboat(m: Model, u: number, v: number, length = 14, axis: 'u' | 'v' = 'u') {
  for (let a = 0; a <= length; a += 0.5) {
    const f = a / length
    const half = Math.sin(f * Math.PI) * 3 + 0.3
    for (let c = -half; c <= half; c += 0.5) {
      const rim = Math.abs(c) > half - 0.6
      const z = 2.5 - Math.sqrt(Math.max(0, 1 - (c / (half + 0.01)) ** 2)) * 2 + (rim ? 0.5 : 0)
      const color = rim ? BOARDS[c > 0 ? 4 : 2] : Math.round(a) % 3 === 0 ? BOARDS[1] : BOARDS[2]
      if (axis === 'u') m.put(u + a, v + c, z, color)
      else m.put(u + c, v + a, z, color)
    }
  }
  const at = (a: number, c: number, z: number): [number, number, number] => (axis === 'u' ? [u + a, v + c, z] : [u + c, v + a, z])
  m.line(at(length * 0.3, -2, 2.6), at(length * 0.8, 1.5, 2.8), OAK[3], 0.5)
  m.line(at(length * 0.5, 0, 2.2), at(length * 0.5, 2.6, 2.2), BOARDS[4], 0.4)
}
// A drying rack of fish along u.
export function fishRack(m: Model, u: number, v: number, length = 12) {
  for (const a of [u, u + length]) post(m, a, v, 0, 9, GREY_BOARDS, 1)
  m.line([u, v, 8.5], [u + length, v, 8.5], OAK[3])
  for (let a = u + 1; a < u + length; a += 1.5) for (let dz = 0; dz < 3.5; dz += 0.5) m.put(a, v + 0.3, 8 - dz, FISH[dz < 1 ? 3 : dz > 2.5 ? 1 : 2], 0.5)
}
// A net hung up to dry between two poles.
function netLine(m: Model, u: number, v: number, length = 10, axis: 'u' | 'v' = 'v') {
  const at = (a: number, z: number): [number, number, number] => (axis === 'u' ? [u + a, v, z] : [u, v + a, z])
  post(m, ...(at(0, 0).slice(0, 2) as [number, number]), 0, 9, GREY_BOARDS, 1)
  post(m, ...(at(length, 0).slice(0, 2) as [number, number]), 0, 9, GREY_BOARDS, 1)
  for (let a = 0.5; a < length; a += 0.5) {
    const sag = Math.sin((a / length) * Math.PI) * 1.5
    for (let z = 2; z < 8.5 - sag; z += 0.5) if ((Math.round(a * 2) + Math.round(z * 2)) % 3 === 0) m.put(...at(a, z), CLOTH_CREAM[2], 0.4)
  }
}
// Reeds in a clump.
function reeds(m: Model, u: number, v: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const a = u + (hash(i, 1, seed) - 0.5) * 8
    const b = v + (hash(i, 2, seed) - 0.5) * 8
    const tall = 4 + hash(i, 3, seed) * 4
    m.line([a, b, 0], [a + 0.3, b - 0.3, tall], (f) => REED[f > 0.8 ? 5 : f > 0.4 ? 3 : 2])
    if (hash(i, 4, seed) > 0.6) m.put(a + 0.3, b - 0.3, tall, LOGWOOD[2], 0.5)
  }
}

// The dock's shore building (CLAUDE.md §6.4; its jetty is drawn apart, over the water) in three looks per level,
// picked by the building:
//   level 1: a thatched log shed with a rack of fish; a mossy shed with a rowboat drawn up; a stone hut in the reeds;
//   level 2: a fishing yard each: a red-roofed boathouse with barrels, a boat, a fish rack, nets and crates; a timber
//     crane over crates beside the harbour-master's shed; a little lighthouse with its lamp lit by the fishers' shed;
//   level 3: a great slate hall with a sailboat's mast behind it; a fish market under an awning with pennants; a
//     smokehouse with a tall chimney.
export function dock(variant = 0, level = 1): Sprite {
  const v = variant % 3
  const { canvas, cx, base, m } = plot(2, 56 + level * 20)
  const tops: Top[] = []
  paveArea(m, 6, 6, 58, 58, level === 1 ? 'dirt' : 'planks', 161 + v + level * 3)
  if (level === 1) {
    const r = block(m, {
      u0: 22, v0: 12, u1: 50, v1: 32, wall: 11, walls: v === 2 ? mat.rubble(GRANITE) : mat.logs(LOGWOOD, 3),
      roof: { form: 'gable-u', rise: 9, oh: 1.8, style: { kind: v === 0 ? 'thatch' : 'shingle', r: v === 0 ? THATCH_ROOF : MOSS_ROOF, seed: 162, moss: v === 1 ? 0.3 : 0 } },
      door: { face: 'front', s: 6, w: 4.5, h: 7.5, style: { step: GRANITE } },
      rows: { z: [4], every: 9, w: 3, h: 3, style: { frame: OAK } },
      chimneys: [{ u: 0.8, v: 0.3, tall: 4 }],
    })
    tops.push(...r.tops)
    if (v === 0) fishRack(m, 10, 42, 14)
    if (v === 1) rowboat(m, 8, 40, 16)
    if (v === 2) { reeds(m, 12, 44, 30, 7); reeds(m, 50, 46, 20, 8) }
    netLine(m, 52, 36, 12)
    barrel(m, 34, 40)
  } else if (level === 2) {
    if (v === 0) {
      const r = block(m, { u0: 18, v0: 8, u1: 52, v1: 30, wall: 15, walls: mat.boards(BOARDS), socle: { r: GRANITE, tall: 2 }, roof: { form: 'gable-u', rise: 11, oh: 1.6, style: { kind: 'tile', r: CLAY_TILE, seed: 163 } }, door: { face: 'front', s: 8, w: 9, h: 10, style: { open: true } }, rows: { z: [6], every: 8, w: 3, h: 3.5, style: { frame: WHITEWASH } }, chimneys: [{ u: 0.85, v: 0.3, tall: 5 }] })
      tops.push(...r.tops)
      for (const [a, b] of [[44, 36], [49, 38]]) barrel(m, a, b)
      rowboat(m, 8, 34, 16)
      fishRack(m, 6, 50, 14)
      netLine(m, 56, 30, 14)
      crate(m, 26, 40, 0, 5)
      crate(m, 31, 42, 0, 4.5)
      figure(m, 36, 44, 0, { tunic: CLOTH_BLUE, hat: CLOTH_CREAM })
    } else if (v === 1) {
      const r = block(m, { u0: 30, v0: 6, u1: 56, v1: 24, wall: 12, walls: mat.logs(LOGWOOD, 3), roof: { form: 'gable-v', rise: 9, oh: 1.4, style: { kind: 'shingle', r: SHINGLE_ROOF, seed: 164 } }, door: { face: 'front', s: 10, w: 5, h: 8, style: { step: GRANITE } }, rows: { z: [4], every: 8, w: 3, h: 3, style: { frame: OAK } }, chimneys: [{ u: 0.3, v: 0.7, tall: 5 }] })
      tops.push(...r.tops)
      // The crane: a post, a jib and a rope with a hook over a net of goods.
      woodBox(m, 18, 30, 21, 33, 0, 30, OAK)
      m.line([19.5, 31.5, 29], [6, 40, 33], OAK[3])
      m.line([19.5, 31.5, 20], [8, 39, 32], OAK[2])
      m.line([7, 39.5, 32.5], [7, 39.5, 14], CLOTH_CREAM[2])
      m.ball(7, 39.5, 12, 2.5, (l, x, y) => dith(CLOTH_CREAM, toneOf(6, l) - ((Math.round(x) + Math.round(y)) % 2 ? 1.2 : 0), x, y))
      for (const [a, b, z, s] of [[26, 34, 0, 5.5], [31.5, 34, 0, 5], [28, 34.5, 5.5, 4.5], [40, 40, 0, 5]]) crate(m, a, b, z, s)
      barrel(m, 46, 34)
      rowboat(m, 6, 48, 14)
      figure(m, 22, 42, 0, { tunic: CLOTH_RED, hat: CLOTH_CREAM, arm: 1 })
    } else {
      // The little lighthouse with its lamp lit.
      roundTower(m, 14, 14, 6, 36, WHITEWASH, { kind: 'tile', r: CLAY_TILE }, { slits: false, seed: 165 })
      m.cylinder(14, 14, 6.6, 31, 33, (a, _z, l, x, y) => (Math.round(a * 4) % 2 ? FIRE[3] : dith(IRON, toneOf(6, l), x, y)), false)
      for (let k = 0; k < 4; k++) m.cylinder(14, 14, 6.05, 8 + k * 6, 10 + k * 6, (_, __, l, x, y) => dith(CLOTH_RED, toneOf(6, l), x, y), false)
      const r = block(m, { u0: 28, v0: 12, u1: 54, v1: 30, wall: 12, walls: mat.logs(LOGWOOD, 3), roof: { form: 'gable-u', rise: 9, oh: 1.6, style: { kind: 'tile', r: CLAY_TILE, seed: 166 } }, door: { face: 'front', s: 6, w: 4.5, h: 8, style: { step: GRANITE } }, rows: { z: [4], every: 8, w: 3, h: 3, style: { frame: OAK } }, chimneys: [{ u: 0.8, v: 0.3, tall: 5 }] })
      tops.push(...r.tops)
      fishRack(m, 8, 46, 12)
      rowboat(m, 26, 40, 14)
      netLine(m, 56, 36, 12)
      crate(m, 46, 40, 0, 4.5)
      crate(m, 50, 42, 0, 4.5)
      barrel(m, 42, 46)
    }
  } else {
    if (v === 0) {
      // A sailboat's mast and furled sail rising behind the hall.
      m.line([8, 8, 0], [8, 8, 62], OAK[3])
      m.line([8, 2, 50], [8, 16, 50], OAK[2])
      for (let z = 30; z < 58; z += 0.5) for (let b = 9; b < 9 + (z - 30) * 0.4; b += 0.5) m.put(8, b, z, dith(WHITEWASH, 3.6 - (Math.round(b) % 4 === 0 ? 0.8 : 0), b, z), -1)
      const r = block(m, { u0: 16, v0: 6, u1: 56, v1: 30, wall: 18, walls: mat.boards(GREY_BOARDS), socle: { r: GRANITE, tall: 3 }, roof: { form: 'gable-u', rise: 13, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 167 } }, door: { face: 'front', s: 10, w: 10, h: 12, style: { open: true } }, rows: { z: [6], every: 8, w: 3, h: 4, style: { frame: WHITEWASH } }, chimneys: [{ u: 0.8, v: 0.3, tall: 6 }] })
      tops.push(...r.tops)
      for (const [a, b] of [[44, 36], [49, 38], [54, 36]]) barrel(m, a, b)
      rowboat(m, 10, 40, 16)
      netLine(m, 58, 30, 14)
    } else if (v === 1) {
      const r = block(m, { u0: 14, v0: 6, u1: 54, v1: 28, wall: 16, walls: mat.framed(WHITEWASH, OAK, 8), roof: { form: 'gable-u', rise: 12, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 168 } }, rows: { z: [9], every: 7, w: 3, h: 4, style: { frame: OAK } }, chimneys: [{ u: 0.8, v: 0.3, tall: 5 }] })
      tops.push(...r.tops)
      awning(m, 16, 28, 52, 37, 10, 7, CLOTH_BLUE)
      counter(m, 18, 50, 32, 'food', 13)
      // Fish laid out on the counter.
      for (let a = 19; a < 49; a += 2) m.put(a, 33.5, 5.2, FISH[3], 1)
      for (const [a, c] of [[6, CLOTH_RED], [58, CLOTH_BLUE]] as const) flagpole(m, a, 44, 0, 24, c, 0, 8, 4)
      rowboat(m, 30, 46, 14)
      figure(m, 34, 30, 0, { tunic: CLOTH_GREEN, apron: CLOTH_CREAM, arm: 1 })
    } else {
      const r = block(m, { u0: 16, v0: 8, u1: 52, v1: 30, wall: 16, walls: mat.ashlar(GRANITE, 3.5, 6), roof: { form: 'gable-u', rise: 12, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 169 } }, door: { face: 'front', s: 8, w: 5, h: 8, style: { iron: true, step: GRANITE } }, rows: { z: [5], every: 8, w: 3, h: 4, style: { frame: GRANITE, glow: true } }, chimneys: [{ u: 0.85, v: 0.3, tall: 22 }, { u: 0.3, v: 0.3, tall: 6 }] })
      tops.push(...r.tops)
      fishRack(m, 6, 44, 14)
      fishRack(m, 26, 44, 14)
      for (const [a, b] of [[48, 38], [53, 40]]) barrel(m, a, b)
      netLine(m, 58, 30, 12)
      logPile(m)
    }
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}
function logPile(m: Model) {
  for (let k = 0; k < 4; k++) woodBox(m, 40, 40 + k * 0.4, 46, 42 + k * 0.4, k * 1.6, k * 1.6 + 1.4, LOGWOOD, false)
}

// The mysterious fisher's hut (CLAUDE.md §6.4) in four looks, picked by the building: a hut of logs under a mossy
// roof on a deck on stilts with a ladder down to the water: 0 an arcane lantern glowing violet and a net; 1 a smoking
// chimney, fish drying on a line and a little boat; 2 lanterns, barrels and a pennant on a pole; 3 old roots coiling
// down over the deck into the water and a dark crown of leaves over the roof, vines hanging from it.
export function fisherHut(variant = 0): Sprite {
  const v = variant % 4
  const { canvas, cx, base, m } = plot(1, v === 3 ? 70 : 56)
  const tops: Top[] = []
  // Stilts and the deck.
  for (const [a, b] of [[4, 4], [28, 4], [4, 28], [28, 28], [16, 28], [28, 16]]) m.cylinder(a, b, 0.8, 0, 6, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l) - 0.5, x, y), false)
  woodBox(m, 3, 3, 29, 29, 6, 7.2, GREY_BOARDS)
  const r = block(m, {
    u0: 7, v0: 6, u1: 25, v1: 22, z0: 7.2, wall: 10, walls: mat.logs(LOGWOOD, 2.5),
    roof: { form: 'gable-u', rise: 9, oh: 1.8, style: { kind: 'shingle', r: MOSS_ROOF, seed: 171, moss: 0.25 } },
    door: { face: 'front', s: 3, w: 4, h: 7, style: { wood: GREY_BOARDS } },
    windows: [{ face: 'side', s: 6, z: 4, w: 3, h: 3, style: { frame: OAK } }],
    chimneys: v === 1 ? [{ u: 0.8, v: 0.4, tall: 4 }] : [],
  })
  tops.push(...r.tops)
  // A ladder down to the water.
  for (const a of [12, 15]) m.line([a, 30, 0], [a, 29, 7], OAK[3])
  for (let z = 1; z < 7; z += 2) m.line([12, 30 - z / 7, z], [15, 30 - z / 7, z], BOARDS[4])
  const glow = (u: number, vv: number, z: number) => {
    post(m, u, vv, z, z + 9, OAK, 0.8)
    m.card(u, vv, z + 9, (set) => {
      for (let dz = 0; dz < 4; dz++) for (let dx = -1.5; dx <= 1.5; dx += 1) set(dx, dz, Math.abs(dx) > 1 || dz === 0 || dz === 3 ? OAK[0] : ARCANE[dz === 1 ? 4 : 5])
    }, 0.5)
  }
  if (v === 0) {
    glow(26, 26, 7.2)
    m.card(4, 26, 7.2, (set) => { for (let dx = -3; dx <= 3; dx++) for (let dz = 0; dz < 5; dz++) if ((dx + dz) % 2 === 0) set(dx, dz, CLOTH_CREAM[2]) })
  } else if (v === 1) {
    m.line([26, 4, 15], [26, 18, 15], OAK[2])
    post(m, 26, 4, 7.2, 15.5, OAK, 0.8)
    post(m, 26, 18, 7.2, 15.5, OAK, 0.8)
    for (let b = 6; b < 17; b += 2.5) for (let dz = 0; dz < 3; dz += 0.5) m.put(26, b, 14.5 - dz, FISH[dz < 1 ? 3 : 2], 0.5)
    rowboat(m, 18, 30, 12, 'v')
  } else if (v === 2) {
    glow(26, 26, 7.2)
    lamp(m, 4, 26, 16)
    barrel(m, 26, 8, 7.2, 5, 2)
    barrel(m, 26, 13, 7.2, 5, 2)
    crate(m, 4, 22, 7.2, 3.5)
    flagpole(m, 25, 24, 7.2 + 10, 14, CLOTH_GREEN, 0.3, 6, 3)
  } else {
    // Roots coiling down from the deck into the water.
    for (let k = 0; k < 9; k++) {
      const a = 3 + k * 3.2
      for (let z = 7; z > -2; z -= 0.5) m.put(a + Math.sin(z * 0.7 + k) * 1.2, 29 + Math.cos(z * 0.5 + k) * 0.6, z, LOGWOOD[(Math.round(z) + k) % 3 === 0 ? 3 : 1], 0.5)
    }
    for (const [a, b, z, rr] of [[10, 10, 30, 9], [20, 14, 32, 9], [14, 18, 38, 8], [6, 20, 27, 6], [24, 6, 28, 6]]) m.ball(a, b, z, rr, (l, x, y) => dith(LEAVES, toneOf(6, l) - 1 + (hash(Math.round(x), Math.round(y), 9) - 0.5), x, y), 0.8)
    m.solidRound(15, 14, 10, 22, 42)
    for (let k = 0; k < 7; k++) {
      const a = 5 + k * 3.5
      const len = 6 + (k % 3) * 3
      for (let dz = 0; dz < len; dz += 0.5) m.put(a, 25, 24 - dz, LEAVES[(Math.round(dz) + k) % 2 ? 3 : 4], 2)
    }
    glow(26, 26, 7.2)
  }
  void GOLD; void LIME; void STEEL; void CLOTH_RED; void CLOTH_BLUE; void IRON
  return smoky(canvas.sprite(cx, base, 0), tops)
}
