import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BASALT, BOARDS, CLAY_TILE, CLOTH_BLACK, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_PURPLE, CLOTH_RED, FIRE, GOLD, GRANITE,
  GREY_BOARDS, IRON, LIME, LOGWOOD, OAK, PLASTER, SHINGLE_ROOF, SLATE_TILE, STEEL, STRAW, THATCH_ROOF,
  animate, barrel, crate, dith, fence, figure, flagpole, paveArea, plot, sack, smoky, toneOf,
} from './buildingKit'
import type { Model, Top } from './buildingKit'
import { roundTower } from './castle'
import { lamp } from './civic'
import { weaponRack } from './industry'
import { block, mat, openShed, post, stoneBox, woodBox } from './lordBuildings'
import { shrub } from './houses'

// A straw training dummy on a post at (u, v); `hit` leans it a little.
function dummy(m: Model, u: number, v: number, hit = 0) {
  m.card(u, v, 0, (set) => {
    for (let z = 0; z < 6; z++) set(0, z, OAK[2])
    for (let z = 6; z < 12; z++) for (let dx = -2; dx <= 2; dx++) set(dx + (z > 9 ? hit : 0), z, STRAW[dx < 0 ? 4 : z % 3 === 0 ? 2 : 3])
    for (let dx = -4; dx <= 4; dx++) set(dx, 9, OAK[3])
    for (let z = 12; z < 14; z++) for (let dx = -1; dx <= 1; dx++) set(dx + hit, z, CLOTH_CREAM[dx < 0 ? 4 : 3])
  })
}
// An archery target: a straw boss on a trestle.
function target(m: Model, u: number, v: number) {
  m.line([u, v - 2, 0], [u, v, 9], OAK[2])
  m.line([u, v + 2, 0], [u, v, 9], OAK[3])
  for (let a = 0; a < Math.PI * 2; a += 0.12) for (let r = 0; r <= 3.5; r += 0.5) {
    const ring = r < 1 ? GOLD[4] : r < 2 ? CLOTH_RED[3] : r < 3 ? WHITE[4] : STRAW[2]
    m.put(u + 0.5, v + Math.cos(a) * r, 7 + Math.sin(a) * r, ring, 0.5)
  }
}
const WHITE = CLOTH_CREAM
// A palisade of sharpened stakes from (u0, v0) to (u1, v1).
function palisade(m: Model, u0: number, v0: number, u1: number, v1: number, tall = 6) {
  const len = Math.hypot(u1 - u0, v1 - v0)
  for (let k = 0; k <= len; k += 1.6) {
    const u = u0 + ((u1 - u0) * k) / len
    const v = v0 + ((v1 - v0) * k) / len
    const t = tall - (hash(Math.round(k), 1, 9) > 0.6 ? 1 : 0)
    m.cylinder(u, v, 0.8, 0, t, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l), x, y), false)
    m.put(u, v, t + 0.5, LOGWOOD[4])
    m.put(u, v, t + 1, LOGWOOD[3])
  }
  m.line([u0, v0, tall * 0.6], [u1, v1, tall * 0.6], OAK[1])
}
// A catapult at (u, v) along u.
function catapult(m: Model, u: number, v: number) {
  for (const dv of [0, 6]) woodBox(m, u, v + dv, u + 12, v + dv + 1.2, 1, 2.5, OAK, false)
  for (const du of [1, 10]) woodBox(m, u + du, v, u + du + 1.2, v + 7, 1, 2.5, OAK, false)
  for (const du of [2, 10]) for (const dv of [-0.5, 7.5]) for (let a = 0; a < Math.PI * 2; a += 0.3) m.put(u + du + Math.cos(a) * 1.4, v + dv, 1.4 + Math.sin(a) * 1.4, OAK[1], 0.5)
  m.line([u + 4, v + 1, 2.5], [u + 6, v + 1, 9], OAK[3])
  m.line([u + 4, v + 6, 2.5], [u + 6, v + 6, 9], OAK[3])
  m.line([u + 6, v + 1, 9], [u + 6, v + 6, 9], OAK[2])
  m.line([u + 3, v + 3.5, 3], [u + 11, v + 3.5, 12], OAK[4])
  m.ball(u + 11, v + 3.5, 12.5, 1.3, (l, x, y) => dith(GRANITE, toneOf(6, l), x, y))
}
// Two soldiers sparring: swords up and down in turn (frame f of 4).
function sparring(m: Model, u: number, v: number, f: number) {
  if (f < 0) return
  const k = f % 4
  figure(m, u, v, 0, { tunic: CLOTH_RED, hat: IRON, tool: 'hammer', arm: k < 2 ? 2 : 1, legs: IRON })
  figure(m, u + 4, v - 4, 0, { tunic: CLOTH_BLUE, hat: IRON, tool: 'hammer', arm: k < 2 ? 1 : 2, flip: true, legs: IRON })
}

// The barracks (CLAUDE.md §9.7) on three tiles, in two looks per level picked by the building: 0 a timber hall under
// thatch, then red tiles, then a stone hall; 1 a stone hall under slate behind a palisade. A training yard of beaten
// earth with straw dummies, archery targets and weapon racks, soldiers sparring (4 frames) and flags flying; level 2
// adds a stable shed and a drill sergeant, level 3 a stone tower, a catapult and banners.
export function barracks(variant = 0, level = 1): Sprite {
  return animate((f) => barracksFrame(variant % 2, level, f), 4, 5)
}
function barracksFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(3, 70 + level * 16)
  const tops: Top[] = []
  paveArea(m, 4, 40, N - 4, N - 4, 'dirt', 91 + v)
  paveArea(m, 4, 4, N - 4, 40, 'gravel', 93 + v)
  const roof = v
    ? { kind: 'slate' as const, r: SLATE_TILE }
    : [{ kind: 'thatch' as const, r: THATCH_ROOF }, { kind: 'tile' as const, r: CLAY_TILE }, { kind: 'slate' as const, r: SLATE_TILE }][level - 1]
  const walls = v || level === 3 ? mat.ashlar(GRANITE, 3.5, 7) : mat.framed(PLASTER, OAK, 8)
  const r = block(m, {
    u0: 6, v0: 6, u1: level === 1 ? 62 : 70, v1: 32, wall: 15 + level * 2, walls,
    socle: v || level === 3 ? undefined : { r: GRANITE, tall: 3 },
    roof: { form: 'gable-u', rise: 12, oh: 1.8, style: { ...roof, seed: 95 } },
    rows: { z: [6], every: 8, w: 3, h: 4, style: { frame: OAK, shutters: v ? CLOTH_RED : CLOTH_BLUE } },
    door: { face: 'front', s: 22, w: 7, h: 10, style: { step: GRANITE, arch: v === 1, iron: true } },
    chimneys: [{ u: 0.2, v: 0.3, tall: 6 }, { u: 0.8, v: 0.3, tall: 6 }],
  })
  tops.push(...r.tops)
  // A second, shorter wing along the right side.
  const w2 = block(m, { u0: 74, v0: 6, u1: 90, v1: 40, wall: 13, walls, roof: { form: 'gable-v', rise: 10, oh: 1.6, style: { ...roof, seed: 96 } }, rows: { z: [5], every: 8, w: 3, h: 4, style: { frame: OAK } }, door: { face: 'front', s: 5, w: 5, h: 8, style: { step: GRANITE } } })
  tops.push(...w2.tops)
  // The yard: dummies, targets, racks.
  for (const [a, b] of [[16, 52], [24, 50], [32, 48]]) dummy(m, a, b, 0)
  for (const [a, b] of [[14, 76], [22, 84]]) target(m, a, b)
  weaponRack(m, 44, 42, 12)
  weaponRack(m, 58, 42, 10)
  sparring(m, 48, 70, f)
  barrel(m, 66, 46)
  barrel(m, 70, 48)
  crate(m, 64, 52, 0, 5)
  // Arrows stuck in the targets' straw, and a quiver rack.
  if (level >= 2) {
    // A stable shed with hay.
    openShed(m, 76, 50, 92, 74, 10, { form: 'shed-u', rise: 4, oh: 1, style: { ...roof, seed: 97 } })
    for (const b of [56, 64]) woodBox(m, 77, b, 91, b + 1, 0, 6, OAK, false)
    m.ball(84, 62, 0, 3.5, (l, x, y) => dith(STRAW, toneOf(6, l) + (hash(Math.round(x), Math.round(y), 1) - 0.5), x, y), 0.8, true)
    // The drill sergeant.
    figure(m, 40, 60, 0, { tunic: CLOTH_RED, hat: GOLD, tool: 'spear', legs: IRON })
  }
  if (level === 3) {
    roundTower(m, 8, 38, 6, 34, GRANITE, { kind: 'slate', r: SLATE_TILE }, { seed: 98 })
    catapult(m, 56, 78)
    for (const [a, b] of [[30, 60], [34, 64]]) figure(m, a, b, 0, { tunic: CLOTH_BLUE, hat: IRON, tool: 'spear', legs: IRON })
  }
  if (v === 1) {
    palisade(m, 3, N - 3, N - 3, N - 3)
    palisade(m, N - 3, 44, N - 3, N - 6)
  } else {
    fence(m, 3, N - 3, N - 30, N - 3, GREY_BOARDS, 5, 6)
  }
  // Flags (left out of the still look: they wave over the sky).
  if (f >= 0) {
    flagpole(m, 40, 38, 0, 30, CLOTH_RED, f / 4, 10, 5)
    if (level >= 2) flagpole(m, 72, 44, 0, 26, CLOTH_BLUE, (f / 4 + 0.5) % 1, 9, 5)
    if (level === 3) flagpole(m, 8, 38, 44, 8, CLOTH_RED, (f / 4 + 0.25) % 1, 8, 4)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The watchtower (CLAUDE.md §9.7): a tall round stone tower with a timber gallery round its top under a roof; the two
// looks picked by the building differ only in stone and roof (grey granite under slate, black basalt under shingles),
// so the build menu shows what the map will. Level 2 is taller with a brazier lit on the gallery, level 3 the
// tallest with a guard on watch and a pennant on the roof. The brazier's fire flickers.
export function watchtower(variant = 0, level = 1): Sprite {
  return animate((f) => towerFrame(variant % 2, level, f), 4, 6)
}
function towerFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m } = plot(1, 112 + level * 20)
  const tall = 44 + level * 12
  const stone = v ? BASALT : GRANITE
  roundTower(m, 16, 16, 9, tall, stone, null, { seed: 102 + v, lit: level >= 2 })
  // A door at its foot.
  for (let s = -2; s <= 2; s += 0.5) for (let z = 0; z < 7 + (Math.abs(s) < 1.5 ? 1 : 0); z += 0.5) m.put(16 + 6.6 + s * 0.5, 16 + 6.6 - s * 0.5, z, Math.abs(s) > 1.6 ? stone[1] : BOARDS[Math.round(s * 2) % 2 ? 2 : 3], 0.6)
  // The gallery: a plank floor on corbels, a railing, corner posts and the roof over it.
  for (const [a, b] of [[8, 24], [24, 24], [24, 8], [8, 8]] as const) m.line([a + (16 - a) * 0.35, b + (16 - b) * 0.35, tall - 5], [a, b, tall], OAK[2])
  woodBox(m, 5, 5, 27, 27, tall, tall + 1.5, BOARDS)
  m.front(5, 27, 27, tall + 1.5, tall + 6, (s, z, x, y) => (Math.round(s * 2) % 5 === 0 || z > tall + 5 ? dith(BOARDS, 3.4, x, y) : 0))
  m.side(5, 27, 27, tall + 1.5, tall + 6, (s, z, x, y) => (Math.round(s * 2) % 5 === 0 || z > tall + 5 ? dith(BOARDS, 2, x, y) : 0))
  for (const [a, b] of [[6, 26], [26, 26], [26, 6], [6, 6]]) post(m, a, b, tall, tall + 15, OAK, 1)
  block(m, { u0: 4, v0: 4, u1: 28, v1: 28, z0: tall + 15, wall: 0.1, walls: mat.boards(BOARDS), roof: { form: 'hip', rise: 11, oh: 1.5, style: { kind: v ? 'shingle' : 'slate', r: v ? SHINGLE_ROOF : SLATE_TILE, seed: 101 + v } } })
  m.solidBox(5, 5, 27, 27, tall, tall + 6)
  // The brazier on the gallery and a guard (from level 2).
  if (level >= 2) {
    const z = tall + 1.5
    m.cylinder(21, 21, 1.6, z, z + 3, (_, __, l, x, y) => dith(IRON, toneOf(6, l), x, y), false)
    const k = f < 0 ? 0 : f
    m.card(21, 21, z + 3, (set) => {
      for (let dx = -1; dx <= 1; dx++) for (let dz = 0; dz < 3 + ((dx + k) % 2 === 0 ? 1 : 0); dz++) set(dx, dz, FIRE[dz === 0 ? 3 : dz === 1 ? 4 : hash(dx, k, 3) > 0.5 ? 5 : 2])
    }, 1)
    if (level === 3) figure(m, 11, 23, z, { tunic: CLOTH_GREEN, hat: IRON, tool: 'spear' })
  }
  if (level === 3 && f >= 0) flagpole(m, 16, 16, tall + 26, 8, CLOTH_RED, f / 4, 7, 4)
  return canvas.sprite(cx, base, 0)
}

// The prison (CLAUDE.md §9.7) in two looks picked by the building (grey granite, black basalt): a squat stone jail
// under slate with barred windows and an iron door, a yard behind iron railings with spikes, a lantern and a guard
// at the gate. Full ('prisonFull'), a crowned queen in a gown stands behind the bars of the yard and a second guard
// watches her.
export function prison(variant = 0, full = false): Sprite {
  const v = variant % 2
  const { canvas, cx, base, m, N } = plot(2, 80)
  const tops: Top[] = []
  const stone = v ? BASALT : GRANITE
  paveArea(m, 3, 3, N - 3, N - 3, 'flagstone', 111 + v)
  const r = block(m, {
    u0: 6, v0: 6, u1: 38, v1: 30, wall: 20, walls: mat.ashlar(stone, 3, 6), socle: { r: BASALT, tall: 3 },
    roof: { form: 'gable-u', rise: 10, oh: 1.4, style: { kind: 'slate', r: SLATE_TILE, seed: 112, moss: 0.08 } },
    rows: { z: [6, 13], every: 6, w: 2.5, h: 3.5, style: { frame: stone, bars: true } },
    door: { face: 'front', s: 13, w: 6, h: 9, style: { wood: IRON, frame: BASALT, arch: true, step: GRANITE } },
    chimneys: [{ u: 0.85, v: 0.3, tall: 5 }],
  })
  tops.push(...r.tops)
  // A watch turret at the corner.
  roundTower(m, 38, 8, 5, 28, stone, { kind: 'slate', r: SLATE_TILE }, { seed: 113 })
  // The yard behind iron railings.
  const rail = (u0: number, v0: number, u1: number, v1: number) => {
    const len = Math.hypot(u1 - u0, v1 - v0)
    for (let k = 0; k <= len; k += 1.5) {
      const u = u0 + ((u1 - u0) * k) / len
      const vv = v0 + ((v1 - v0) * k) / len
      m.line([u, vv, 0], [u, vv, 11], (f) => (f > 0.92 ? STEEL[4] : IRON[f > 0.5 ? 3 : 2]))
    }
    for (const z of [2, 9.5]) m.line([u0, v0, z], [u1, v1, z], IRON[3])
  }
  if (full) {
    // The queen in the yard, behind the bars.
    figure(m, 22, 44, 0, { tunic: CLOTH_PURPLE, gown: true, crown: true, skin: undefined })
    figure(m, 44, 50, 0, { tunic: CLOTH_RED, hat: IRON, tool: 'spear', legs: IRON, flip: true })
    m.put(18, 46, 0.2, STRAW[3])
    m.put(19, 47, 0.2, STRAW[2])
  }
  rail(6, 56, 40, 56)
  rail(40, 32, 40, 56)
  rail(6, 32, 6, 56)
  // The gate in the railing, a lantern by it, the gaoler.
  stoneBox(m, 39, 40, 42, 43, 0, 13, stone, true, 3)
  stoneBox(m, 39, 50, 42, 53, 0, 13, stone, true, 3)
  lamp(m, 46, 38, 12)
  figure(m, 46, 44, 0, { tunic: CLOTH_BLACK, hat: IRON, tool: 'spear', legs: IRON })
  barrel(m, 54, 20)
  crate(m, 50, 24, 0, 4.5)
  // A cart of straw for the cells.
  m.ball(54, 56, 0, 3, (l, x, y) => dith(STRAW, toneOf(6, l) + (hash(Math.round(x), Math.round(y), 2) - 0.5), x, y), 0.6, true)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// A raven perched on (u, v, z); in frame f it may lift its wings.
function raven(m: Model, u: number, v: number, z: number, f = -1) {
  m.card(u, v, z, (set) => {
    set(0, 0, CLOTH_BLACK[0]); set(1, 0, CLOTH_BLACK[0])
    for (let dx = -1; dx <= 2; dx++) set(dx, 1, CLOTH_BLACK[dx === 0 ? 3 : 1])
    set(2, 2, CLOTH_BLACK[2]); set(3, 2, GOLD[1])
    set(-1, 1, CLOTH_BLACK[1])
    if (f === 1 || f === 2) { set(-1, 2, CLOTH_BLACK[2]); set(-2, 3, CLOTH_BLACK[1]); set(1, 2, CLOTH_BLACK[2]); set(0, 3, CLOTH_BLACK[1]) }
  }, 2)
}

// The spy house (CLAUDE.md §9.7), a sinister narrow townhouse, in two looks per level picked by the building (dark
// timber and soot-stained plaster, or black stone): three storeys under a steep slate roof, its windows shuttered but
// one lit, a lantern at the door, a hooded figure in the alley, ravens on the ridge (one stirs its wings), a hidden
// cellar door at the back behind crates. Level 2 adds a lookout turret, level 3 a walled garden and a raven loft.
export function spyHouse(variant = 0, level = 1): Sprite {
  return animate((f) => spyFrame(variant % 2, level, f), 4, 3)
}
const SOOT = Uint32Array.from([0xff1c1a18, 0xff2a2624, 0xff3a3432, 0xff4c4542, 0xff5e5652, 0xff726964].map((c) => c >>> 0))
function spyFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m, N } = plot(2, 96 + level * 10)
  const tops: Top[] = []
  paveArea(m, 3, 3, N - 3, N - 3, 'cobble', 121 + v)
  const walls = v ? mat.ashlar(BASALT, 3, 5) : mat.framed(SOOT, CLOTH_BLACK, 6)
  const shut = { frame: CLOTH_BLACK, shutters: v ? CLOTH_PURPLE : CLOTH_GREEN }
  // Stone ground floor, the floors above jutting out one over the other.
  block(m, { u0: 14, v0: 10, u1: 34, v1: 32, wall: 11, walls: mat.ashlar(BASALT, 3, 5), rows: { z: [4], every: 7, w: 2.5, h: 3.5, style: { frame: BASALT, bars: true }, faces: ['side'] }, door: { face: 'front', s: 6, w: 5, h: 8, style: { wood: CLOTH_BLACK, frame: BASALT, arch: true, step: BASALT } } })
  woodBox(m, 13, 9, 35, 33, 11, 12, CLOTH_BLACK, false)
  block(m, { u0: 13, v0: 9, u1: 35, v1: 33, z0: 12, wall: 10, walls, windows: [{ face: 'front', s: 4, z: 3, w: 3, h: 4, style: shut }, { face: 'front', s: 14, z: 3, w: 3, h: 4, style: { frame: CLOTH_BLACK, glow: true } }, { face: 'side', s: 6, z: 3, w: 3, h: 4, style: shut }, { face: 'side', s: 15, z: 3, w: 3, h: 4, style: shut }] })
  woodBox(m, 12, 8, 36, 34, 22, 23, CLOTH_BLACK, false)
  const r = block(m, {
    u0: 12, v0: 8, u1: 36, v1: 34, z0: 23, wall: 9, walls,
    roof: { form: 'gable-v', rise: 18, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 123, moss: 0.06 } },
    windows: [{ face: 'front', s: 6, z: 3, w: 3, h: 3.5, style: shut }, { face: 'front', s: 15, z: 3, w: 3, h: 3.5, style: shut }, { face: 'side', s: 10, z: 3, w: 3, h: 3.5, style: shut }],
    chimneys: [{ u: 0.3, v: 0.3, tall: 6 }],
    chimneyStone: BASALT,
  })
  tops.push(...r.tops)
  // Ravens on the ridge; the middle one stirs.
  const ridgeZ = 23 + 9 + 18
  raven(m, 24, 14, ridgeZ - 0.5)
  raven(m, 24, 22, ridgeZ - 0.5, f < 0 ? 0 : f)
  raven(m, 24, 29, ridgeZ - 2)
  // The lantern by the door and the hooded figure in the alley.
  lamp(m, 26, 36, 11)
  figure(m, 40, 30, 0, { tunic: CLOTH_BLACK, hood: CLOTH_BLACK, back: false })
  // The hidden cellar door at the back, behind crates.
  m.surface(36, 12, 42, 18, (u) => 2.5 - (u - 36) * 0.4, (_u, vv, _, x, y) => dith(BOARDS, 2.2 - (Math.round(vv * 2) % 3 === 0 ? 0.9 : 0), x, y))
  crate(m, 40, 20, 0, 5, GREY_BOARDS)
  crate(m, 40.5, 20.5, 5, 4, GREY_BOARDS)
  barrel(m, 46, 26)
  sack(m, 44, 32, 0, 2.2, CLOTH_CREAM)
  if (level >= 2) {
    // A lookout turret on the side.
    roundTower(m, 11, 32, 4, 40, v ? BASALT : GRANITE, { kind: 'slate', r: SLATE_TILE }, { lit: true, corbel: false, seed: 124 })
  }
  if (level === 3) {
    // A walled garden with dark yews and a raven loft.
    const wall = (u0: number, v0: number, u1: number, v1: number) => stoneBox(m, u0, v0, u1, v1, 0, 7, BASALT, true, 2.5)
    wall(4, 54, 30, 56)
    wall(4, 38, 6, 56)
    for (const [a, b] of [[10, 44], [18, 48], [24, 44]]) {
      m.cone(a, b, 2.4, 0, 9, (_, __, l, x, y) => dith(CLOTH_GREEN, toneOf(6, l) - 1.2, x, y))
    }
    block(m, { u0: 46, v0: 44, u1: 56, v1: 54, wall: 14, walls: mat.boards(SOOT), roof: { form: 'hip', rise: 6, oh: 1, style: { kind: 'slate', r: SLATE_TILE, seed: 125 } }, windows: [{ face: 'front', s: 3, z: 9, w: 4, h: 3, style: { frame: CLOTH_BLACK } }, { face: 'side', s: 3, z: 9, w: 4, h: 3, style: { frame: CLOTH_BLACK } }] })
    raven(m, 51, 54, 15)
  } else {
    shrub(m, 8, 46, 3, 0, 9)
  }
  void LIME
  return smoky(canvas.sprite(cx, base, 0), tops)
}

export { CLOTH_BLACK, LIME, OAK }
