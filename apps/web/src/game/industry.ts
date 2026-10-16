import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BASALT, BOARDS, CLAY_TILE, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_RED, CUT_END, FIRE, FRONT, GOLD, GRANITE, GREY_BOARDS, IRON,
  LIME, LOGWOOD, OAK, PLASTER, SHINGLE_ROOF, SIDE, SKIN, SLATE_TILE, STEEL, THATCH_ROOF, TOP, WATER,
  animate, ashlar, barrel, cart, chimney, crate, dith, figure, flagpole, log, logPile, paveArea, planks, plot, sack, smoky, toneOf,
} from './buildingKit'
import type { Model, Top } from './buildingKit'
import { block, mat, openShed, post, stoneBox, woodBox } from './lordBuildings'

const LEATHER = Uint32Array.from([0xff10182a, 0xff182640, 0xff22385a, 0xff2e4c74, 0xff3e6290, 0xff5078a8])

// A chopping block (a broad stump) at (u, v) with a split log on it.
function choppingBlock(m: Model, u: number, v: number) {
  m.cylinder(u, v, 2.6, 0, 3, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l), x, y), false)
  m.disc(u, v, 2.6, 3, (a, b, x, y) => (Math.hypot(a, b) > 2 ? LOGWOOD[2] : dith(CUT_END, 1.4 + (Math.round(Math.hypot(a, b) * 2) % 2), x, y)))
}
// A heap of split firewood.
function firewood(m: Model, u: number, v: number, seed: number) {
  for (let i = 0; i < 14; i++) {
    const a = u + (hash(i, 1, seed) - 0.5) * 7
    const b = v + (hash(i, 2, seed) - 0.5) * 5
    const z = Math.max(0, 2.5 - Math.hypot(a - u, b - v) * 0.6) + hash(i, 3, seed)
    m.line([a, b, z], [a + 2.5, b - 0.5, z + 0.6], (f) => (f > 0.8 ? CUT_END[2] : LOGWOOD[3]))
  }
}
// A woodcutter at a block, chopping: frame f of 6 (raised, raised, swinging, struck with chips flying, struck, lifting).
function chopper(m: Model, u: number, v: number, f: number, tunic = CLOTH_GREEN) {
  choppingBlock(m, u + 3, v - 3)
  if (f < 0) return
  const pose = [2, 2, 1, 0, 0, 1][f % 6]
  figure(m, u, v, 0, { tunic, tool: 'axe', arm: pose, hat: f % 2 ? undefined : undefined })
  if (f % 6 === 3 || f % 6 === 4) {
    // Chips flying off the block.
    const k = f % 6 === 3 ? 1 : 2
    for (const [du, dz] of [[1.5, 1], [-1, 1.5], [0.5, 2]]) m.put(u + 3 + du * k, v - 3 - du * k * 0.5, 3.5 + dz * k, CUT_END[2], 2)
  }
}
// A sawhorse along u with a log on it, and two sawyers at a long saw going to and fro (frame f of 6).
function sawpit(m: Model, u: number, v: number, f: number) {
  for (const a of [u + 2, u + 12]) {
    m.line([a - 1.5, v, 0], [a + 1.5, v, 6], OAK[3])
    m.line([a + 1.5, v, 0], [a - 1.5, v, 6], OAK[2])
  }
  log(m, u - 1, v, 5.5, 16, 1.6)
  if (f < 0) return
  const d = [0, 1.2, 2.2, 2.2, 1.2, 0][f % 6]
  // The saw across the log (along v), its handles at the two men.
  m.line([u + 7, v - 6 + d, 8.5], [u + 7, v + 6 + d, 8.5], (k) => (k < 0.08 || k > 0.92 ? OAK[3] : STEEL[k * 12 % 2 < 1 ? 4 : 2]), 1)
  figure(m, u + 7, v - 8 + d * 0.4, 0, { tunic: CLOTH_BLUE, arm: 1, flip: true, back: true, hood: CLOTH_BLUE })
  figure(m, u + 7, v + 8 + d * 0.4, 0, { tunic: CLOTH_RED, arm: 1 })
}

// The lumber camp (CLAUDE.md §6.4) in two looks per level, picked by the building:
//   0 a woodcutter's homestead: a log hut under thatch (1), a bigger house under red tiles with a saw pit (2), a stone
//     sawmill hall under slate with a cart of logs (3);
//   1 open sheds on posts with logs stacked under them, longer and fuller with each level.
// Log piles with their cut ends showing, split firewood, a stump with an axe, stacked planks; a woodcutter chops at
// his block (6 frames), and from level 2 two sawyers work a long saw over a sawhorse.
export function lumberCamp(variant = 0, level = 1): Sprite {
  return animate((f) => lumberFrame(variant % 2, level, f), 6, 7)
}
function lumberFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m } = plot(2, 46 + level * 12)
  const tops: Top[] = []
  paveArea(m, 26, 28, 61, 61, 'dirt', 21 + v)
  // Sawdust and chips round the work.
  canvas.paving = true
  for (let i = 0; i < 40; i++) {
    const a = 32 + hash(i, 1, 23) * 24
    const b = 34 + hash(i, 2, 23) * 22
    m.put(a, b, 0, CUT_END[hash(i, 3, 23) > 0.5 ? 2 : 1], -40)
  }
  canvas.paving = false
  if (v === 0) {
    if (level === 1) {
      const r = block(m, { u0: 6, v0: 6, u1: 28, v1: 24, wall: 11, walls: mat.logs(LOGWOOD, 3), roof: { form: 'gable-u', rise: 10, oh: 2, style: { kind: 'thatch', r: THATCH_ROOF, seed: 70 } }, door: { face: 'front', s: 4, w: 4.5, h: 7.5, style: { step: GRANITE } }, rows: { z: [4], every: 8, w: 3, h: 3, style: { frame: OAK, shutters: BOARDS } }, chimneys: [{ u: 0.85, v: 0.3, tall: 4 }] })
      tops.push(...r.tops)
      logPile(m, 44, 4, 18, [4, 3, 2], 1.9, 'v')
    } else if (level === 2) {
      const r = block(m, { u0: 4, v0: 4, u1: 30, v1: 26, wall: 14, walls: mat.framed(PLASTER, OAK, 9), socle: { r: GRANITE, tall: 3 }, roof: { form: 'gable-u', rise: 11, oh: 1.6, style: { kind: 'tile', r: CLAY_TILE, seed: 71 } }, door: { face: 'front', s: 5, w: 5, h: 8.5, style: { step: GRANITE } }, rows: { z: [4.5], every: 7, w: 3, h: 3.5, style: { frame: OAK, cross: true } }, chimneys: [{ u: 0.8, v: 0.3, tall: 5 }] })
      tops.push(...r.tops)
      logPile(m, 46, 3, 20, [4, 3, 2, 1], 1.9, 'v')
      planks(m, 6, 34, 16, 5, 4)
    } else {
      const r = block(m, { u0: 3, v0: 3, u1: 34, v1: 26, wall: 17, walls: mat.ashlar(LIME, 3.5, 7), roof: { form: 'gable-u', rise: 12, oh: 1.6, style: { kind: 'slate', r: SLATE_TILE, seed: 72 } }, door: { face: 'front', s: 8, w: 8, h: 11, style: { arch: true, open: true, step: GRANITE } }, rows: { z: [5, 11], every: 7, w: 3, h: 3.5, style: { frame: LIME, cross: true } }, chimneys: [{ u: 0.85, v: 0.3, tall: 5 }] })
      tops.push(...r.tops)
      logPile(m, 48, 3, 22, [4, 3, 2, 1], 2, 'v')
      planks(m, 5, 32, 18, 5, 5)
      planks(m, 5, 40, 14, 4, 3, GREY_BOARDS)
      cart(m, 46, 30, 'logs')
    }
  } else {
    const roofs = [
      { kind: 'thatch' as const, r: THATCH_ROOF },
      { kind: 'shingle' as const, r: SHINGLE_ROOF },
      { kind: 'slate' as const, r: SLATE_TILE },
    ][level - 1]
    const u1 = level === 3 ? 56 : level === 2 ? 44 : 34
    openShed(m, 5, 5, u1, 18, 11 + level, { form: 'gable-u', rise: 7 + level, oh: 1.5, style: { ...roofs, seed: 73 } })
    // Logs stacked under it and spilling out before it.
    logPile(m, 7, 16, u1 - 10, level === 1 ? [3, 2, 1] : [4, 3, 2, 1], 1.8)
    if (level >= 2) planks(m, 6, 30, 18, 5, level + 1)
    if (level === 3) {
      barrel(m, 52, 30)
      cart(m, 8, 46, 'logs')
    }
  }
  // A stump with its axe and the firewood heap.
  m.cylinder(24, 52, 2, 0, 2.5, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l), x, y), false)
  m.disc(24, 52, 2, 2.5, (_, __, x, y) => dith(CUT_END, 1.5, x, y))
  m.line([24, 52, 2.5], [25.5, 51.5, 6.5], BOARDS[4])
  m.line([25, 51.5, 6.3], [26.5, 52, 6.6], STEEL[4])
  firewood(m, 52, 40, 5 + v)
  chopper(m, 40, 48, f, v ? CLOTH_RED : CLOTH_GREEN)
  if (level >= 2) sawpit(m, 30, 34, f)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// ---- The forge ----------------------------------------------------------------------------------------------------

// An anvil on a block at (u, v).
function anvil(m: Model, u: number, v: number) {
  m.cylinder(u, v, 1.6, 0, 3, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l), x, y), false)
  m.box(u - 1, v - 2.5, u + 1, v + 2.5, 3, 4, { front: (_, __, x, y) => dith(IRON, 3, x, y), side: (_, __, x, y) => dith(IRON, 1.6, x, y) }, false)
  m.box(u - 1.6, v - 3.5, u + 1.6, v + 3, 4, 5.5, { front: (_, __, x, y) => dith(IRON, 3.2, x, y), side: (_, __, x, y) => dith(IRON, 2, x, y), top: (_, b, x, y) => dith(STEEL, b > 2 ? 4.5 : 3.6, x, y) }, false)
}
// A hearth of stone against a wall, its fire mouth facing the lower left, the fire flickering with frame f.
function hearth(m: Model, u0: number, v0: number, u1: number, v1: number, tall: number, f: number) {
  stoneBox(m, u0, v0, u1, v1, 0, tall, GRANITE, true, 2.5)
  // The fire mouth in the front face.
  const mu = (u0 + u1) / 2
  const k = f < 0 ? 0 : f
  for (let s = -3; s <= 3; s += 0.5) {
    for (let z = 2; z <= tall - 2; z += 0.5) {
      const arch = z > tall - 3 - (Math.abs(s) > 2 ? 1 : 0)
      if (arch) continue
      const flame = hash(Math.round(s * 2), Math.round(z * 2), 77 + k) * 2.5 - (z - 2) * 0.7 + (3 - Math.abs(s)) * 0.35
      const c = Math.abs(s) > 2.6 || z < 2.4 ? BASALT[0] : flame > 1.6 ? FIRE[4] : flame > 0.9 ? FIRE[3] : flame > 0.2 ? FIRE[2] : BASALT[1]
      m.put(mu + s, v1, z, c, 0.6)
    }
  }
  // Coals on its top.
  m.flat(u0 + 1, v0 + 1, u1 - 1, v1 - 1, tall, (u, v, x, y) => (hash(Math.round(u), Math.round(v), 79 + k) > 0.6 ? FIRE[2] : dith(BASALT, 1.5, x, y)), 0.2)
}
// The bellows beside a hearth: a leather wedge between boards, pumped by frame f (free: left out of the still look).
function bellows(m: Model, u: number, v: number, f: number) {
  if (f < 0) return
  const open = [3, 2, 1, 1, 2, 3][f % 6]
  for (let a = 0; a <= 6; a += 0.5) {
    const h = (a / 6) * open + 0.5
    for (let z = 3; z <= 3 + h; z += 0.5) m.put(u + a, v, z, dith(LEATHER, z > 3 + h - 0.6 ? 4 : 2.5, a, z))
    m.put(u + a, v, 3 + h + 0.5, BOARDS[4])
  }
  m.line([u, v, 3], [u - 2, v, 3.5], IRON[3])
  m.line([u + 6, v, 3 + open + 1], [u + 8, v, 3 + open + 3], OAK[3])
}
// A rack of weapons along v at u: swords and spears leaning on a rail, a shield hung on its end.
export function weaponRack(m: Model, u: number, v: number, length = 10) {
  post(m, u, v, 0, 7, OAK, 1)
  post(m, u, v + length, 0, 7, OAK, 1)
  m.line([u, v, 6.5], [u, v + length, 6.5], OAK[3])
  for (let b = v + 1.5; b < v + length - 1; b += 2) {
    const spear = Math.round(b) % 3 === 0
    m.line([u + 1.5, b, 0], [u - 0.3, b, spear ? 13 : 9], (k) => (k < 0.3 ? OAK[2] : spear ? (k > 0.88 ? STEEL[5] : BOARDS[3]) : k < 0.38 ? GOLD[3] : STEEL[k > 0.9 ? 5 : 4]), 0.3)
  }
  // A round shield.
  for (let a = 0; a < Math.PI * 2; a += 0.15) for (let r = 0; r <= 2.6; r += 0.5) m.put(u + 0.6, v + length + 0.5 + Math.cos(a) * r * 0.6, 4.5 + Math.sin(a) * r, r > 2.1 ? IRON[3] : r < 0.6 ? GOLD[4] : CLOTH_RED[3 + (Math.cos(a) > 0 ? 1 : 0)], 0.8)
}
// A suit of armour on a stand.
function armour(m: Model, u: number, v: number) {
  m.card(u, v, 0, (set) => {
    for (let z = 0; z < 4; z++) set(0, z, OAK[2])
    for (let z = 4; z < 10; z++) for (let dx = -2; dx <= 2; dx++) set(dx, z, STEEL[dx < 0 ? 4 : z % 3 === 0 ? 2 : 3])
    for (let z = 10; z < 13; z++) for (let dx = -1; dx <= 1; dx++) set(dx, z, STEEL[dx < 0 ? 5 : 2])
    set(0, 11, IRON[0])
    set(0, 13, CLOTH_RED[4])
  })
}
// A water wheel against a wall facing +u at (u, v), centre z, turning with frame f (cover: the wall is behind it).
function waterWheel(m: Model, u: number, v: number, cz: number, r: number, f: number) {
  const turn = (f < 0 ? 0 : f / 6) * (Math.PI / 4)
  for (let a = 0; a < Math.PI * 2; a += 0.06) {
    for (const rr of [r, r - 0.6]) m.put(u, v + Math.cos(a) * rr, cz + Math.sin(a) * rr, rr === r ? OAK[2] : BOARDS[4], 1)
  }
  for (let k = 0; k < 8; k++) {
    const a = turn + (k / 8) * Math.PI * 2
    m.line([u, v, cz], [u, v + Math.cos(a) * r, cz + Math.sin(a) * r], BOARDS[3], 1.1)
    // Paddles.
    m.line([u, v + Math.cos(a) * r, cz + Math.sin(a) * r], [u + 1.5, v + Math.cos(a) * r, cz + Math.sin(a) * r], OAK[3], 1.2)
  }
  m.put(u + 0.5, v, cz, IRON[4], 1.3)
  // The race below it.
  for (let b = v - r - 2; b <= v + r + 2; b += 0.5) for (let a = u; a <= u + 3; a += 0.5) m.put(a, b, 0.2, dith(WATER, 2.5 + Math.sin(b + (f < 0 ? 0 : f)) * 0.8, a * 2, b), 0)
}
// A smith at the anvil, hammering (frame f of 6), sparks flying at the blow.
function smith(m: Model, u: number, v: number, f: number) {
  if (f < 0) return
  const pose = [2, 2, 1, 0, 1, 2][f % 6]
  figure(m, u, v, 0, { tunic: CLOTH_CREAM, apron: LEATHER, tool: 'hammer', arm: pose, skin: SKIN })
  if (f % 6 === 3) for (const [a, b, z] of [[3, -2, 7], [4.5, -3, 8.5], [2, -4, 9], [5, -1.5, 6.5]]) m.put(u + a, v + b, z, FIRE[hash(a, b, 3) > 0.5 ? 4 : 5], 3)
}

// The weapon forge (CLAUDE.md §6.4) in three looks at each level, picked by the building: an open smithy where the
// hearth glows under a lean-to by the forge house, its fire flickering, the bellows pumping and the smith hammering at
// the anvil with sparks flying (6 frames); racks of swords and spears, a quench barrel, coal and iron bars.
//   0 a dark stone forge under slate; 1 a stone-and-timber forge under shingles, with a water wheel at level 3;
//   2 a timber workshop under red tiles. Level 2 adds a weapon rack and a second hearth, level 3 a bigger forge house,
//   armour on stands and a cart.
export function forge(variant = 0, level = 1): Sprite {
  return animate((f) => forgeFrame(variant % 3, level, f), 6, 8)
}
function forgeFrame(v: number, level: number, f: number): Sprite {
  const { canvas, cx, base, m } = plot(2, 62 + level * 12)
  const tops: Top[] = []
  paveArea(m, 3, 22, 61, 61, v === 2 ? 'dirt' : 'cobble', 31 + v)
  const walls = v === 0 ? mat.ashlar(BASALT, 3.5, 6) : v === 1 ? mat.rubble(GRANITE) : mat.framed(PLASTER, OAK, 9)
  const roof = [
    { kind: 'slate' as const, r: SLATE_TILE },
    { kind: 'shingle' as const, r: SHINGLE_ROOF },
    { kind: 'tile' as const, r: CLAY_TILE },
  ][v]
  const big = level === 3
  // The forge house at the back.
  const hu1 = big ? 46 : 40
  const r = block(m, {
    u0: 4, v0: 4, u1: hu1, v1: big ? 24 : 22, wall: big ? 18 : 15, walls,
    socle: v === 2 ? { r: GRANITE, tall: 3 } : undefined,
    roof: { form: 'gable-u', rise: big ? 12 : 10, oh: 1.6, style: { ...roof, seed: 80 + v } },
    door: { face: 'front', s: hu1 - 16, w: 6, h: 9, style: { step: GRANITE, iron: true } },
    rows: { z: [5], every: 9, w: 3, h: 4, style: { frame: v === 2 ? OAK : GRANITE, glow: true, bars: v === 0 }, faces: ['side'] },
    windows: [{ face: 'front', s: 6, z: 5, w: 3, h: 4, style: { frame: OAK, glow: true } }],
  })
  tops.push(...r.tops)
  // The open lean-to off the front, the hearth under it with its chimney rising through the house roof.
  openShed(m, 6, 24, 24, 33, 11, { form: 'shed-v', rise: 4, oh: 1, style: { ...roof, seed: 84 } })
  hearth(m, 9, 30, 17, 37, 7, f)
  tops.push(chimney(m, 13, 33, 7, (big ? 30 : 26) + 4, v === 0 ? BASALT : GRANITE, 4))
  bellows(m, 18, 38, f)
  // A quench barrel, the anvil and the smith.
  barrel(m, 23, 44, 0, 6, 2.4)
  m.disc(23, 44, 1.8, 6.1, (_, __, x, y) => dith(WATER, 1.6, x, y))
  anvil(m, 16, 48)
  smith(m, 13, 52, f)
  // Coal and iron bars.
  for (let i = 0; i < 18; i++) m.put(28 + hash(i, 1, 9) * 6, 30 + hash(i, 2, 9) * 6, hash(i, 3, 9) * 2, BASALT[1 + Math.floor(hash(i, 4, 9) * 2)])
  m.ball(30, 33, 0, 3.5, (l, x, y) => dith(BASALT, toneOf(6, l) - 0.6 + (hash(Math.round(x), Math.round(y), 8) > 0.8 ? 1.5 : 0), x, y), 0.6, true)
  for (let k = 0; k < 3; k++) woodBox(m, 36, 32 + k * 1.3, 44, 33 + k * 1.3, 0, 0.8, IRON, false)
  if (level >= 2) {
    weaponRack(m, 52, 30, 12)
    // A second hearth by the house's side.
    hearth(m, 48, 8, 54, 14, 6, f < 0 ? -1 : (f + 3) % 6)
    crate(m, 40, 46, 0, 5)
    crate(m, 41, 46, 5, 4)
  }
  if (level === 3) {
    armour(m, 54, 46)
    armour(m, 58, 42)
    cart(m, 30, 52, 'barrels')
    if (v === 1) waterWheel(m, hu1 + 0.5, 15, 8, 7, f)
    if (f >= 0) flagpole(m, 56, 56, 0, 22, CLOTH_RED, f / 6)
  }
  sack(m, 30, 44)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

export { FRONT, SIDE, TOP, ashlar }
