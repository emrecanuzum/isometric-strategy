import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BASALT, BOARDS, CLAY_TILE, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_PURPLE, CLOTH_RED, COPPER, FIRE, FRONT, GOLD, GRANITE,
  GREY_BOARDS, IRON, LEAD, LEAVES, LIME, OAK, PLASTER, SANDSTONE, SHINGLE_ROOF, SIDE, SLATE_TILE, STRAW, THATCH_ROOF, TOP, WATER,
  WHITEWASH, animate, barrel, cart, crate, dith, figure, flagpole, logPile, paveArea, plot, sack, smoky, toneOf,
} from './buildingKit'
import type { Model, RoofStyle, Top } from './buildingKit'
import { drape, roundTower } from './castle'
import { block, mat, openShed, post, stoneBox, woodBox } from './lordBuildings'
import { shrub } from './houses'

const FRUITS = [0xff3a4ad8, 0xff30a0e8, 0xff55bf8f, 0xffb05a9a, 0xff3ac8f0].map((c) => c >>> 0)

// A striped cloth awning on posts sloping down toward +v from a wall (or from a ridge of its own) at height `high`.
export function awning(m: Model, u0: number, v0: number, u1: number, v1: number, high: number, low: number, cloth: Uint32Array, cloth2: Uint32Array = CLOTH_CREAM) {
  for (const a of [u0 + 0.5, u1 - 0.5]) post(m, a, v1, 0, low, OAK, 1)
  const span = v1 - v0
  m.surface(u0, v0, u1, v1, (_, v) => high - ((v - v0) / span) * (high - low), (u, v, _z, x, y) => {
    const stripe = Math.floor(u / 3) & 1
    const l = 0.85
    // A scalloped edge at the front.
    if (v > v1 - 1.2 && Math.floor(u / 1.5) % 2 === 0) return 0
    const r = stripe ? cloth : cloth2
    return dith(r, toneOf(6, l) - (v > v1 - 1.6 ? 0.8 : 0), x, y)
  })
  // The valance hanging below the front edge.
  m.front(u0, u1, v1, low - 1.5, low, (s, _z, x, y) => dith(Math.floor((u0 + s) / 3) & 1 ? cloth : cloth2, toneOf(6, FRONT) - 0.2, x, y), 0.3)
}
// A counter along u with goods heaped on it.
export function counter(m: Model, u0: number, u1: number, v: number, goods: 'food' | 'cloth' | 'pots' | 'ore', seed = 1) {
  woodBox(m, u0, v, u1, v + 3, 0, 4.5, BOARDS, false)
  for (let u = u0 + 0.5; u < u1 - 0.5; u += 1) {
    const k = hash(Math.round(u), 1, seed)
    if (goods === 'food') {
      m.put(u, v + 1.5, 5, FRUITS[Math.floor(k * FRUITS.length)], 0.5)
      if (k > 0.5) m.put(u + 0.5, v + 1, 5.6, FRUITS[Math.floor(hash(u, 2, seed) * FRUITS.length)], 0.6)
    } else if (goods === 'cloth') {
      const c = [CLOTH_RED, CLOTH_BLUE, CLOTH_GREEN, CLOTH_PURPLE, CLOTH_CREAM][Math.floor((u - u0) / 2.5) % 5]
      for (let z = 4.5; z < 6.5; z += 0.5) m.put(u, v + 1.5, z, c[z > 6 ? 5 : 3], 0.5)
    } else if (goods === 'pots') {
      if (Math.round(u - u0) % 3 === 0) m.ball(u, v + 1.5, 6, 1.3, (l, x, y) => dith(CLAY_TILE, toneOf(6, l) + 0.6, x, y))
    } else {
      m.put(u, v + 1.5, 5, BASALT[2 + Math.floor(k * 3)], 0.5)
      if (k > 0.6) m.put(u, v + 1.5, 5.5, GOLD[3], 0.6)
    }
  }
}
// A basket of produce on the ground.
function basket(m: Model, u: number, v: number, fill: number) {
  m.cylinder(u, v, 2, 0, 2.5, (a, z, l, x, y) => dith(STRAW, toneOf(6, l) - ((Math.round(a * 4) + Math.round(z * 2)) % 2 ? 0.8 : 0), x, y), false)
  m.disc(u, v, 1.6, 2.6, (a, b) => (hash(Math.round(a * 2), Math.round(b * 2), fill) > 0.5 ? fill : STRAW[1]))
}
// A hanging sign on a bracket from a wall facing +v.
function sign(m: Model, u: number, v: number, z: number, color: Uint32Array, emblem: number) {
  m.line([u, v, z], [u, v + 4, z], IRON[3], 0.5)
  for (let a = -1.5; a <= 1.5; a += 0.5) for (let dz = -4.5; dz <= -1; dz += 0.5) m.put(u + a, v + 3, z + dz, Math.abs(a) < 0.6 && dz > -3.5 && dz < -1.8 ? emblem : dith(color, 3 + (dz > -1.5 ? 1 : 0), a, dz), 0.7)
}
// A lantern on a post, lit at night.
export function lamp(m: Model, u: number, v: number, tall = 10) {
  post(m, u, v, 0, tall, OAK, 0.8)
  m.card(u, v, tall, (set) => {
    for (let dz = 0; dz < 3; dz++) for (let dx = -1; dx <= 1; dx++) set(dx, dz, Math.abs(dx) === 1 ? IRON[2] : FIRE[3])
    set(0, 3, IRON[3])
  }, 0.5)
}

// The trade post (CLAUDE.md §6.4) grows with the post's level, in two looks per level picked by the building:
//   1A a grain stall under thatch with a red-and-white awning, fruit on the counter, sacks and baskets;
//   1B a cloth stall under shingles with a blue awning, bolts of cloth and pots;
//   2A a two-storey caravanserai of timber and plaster with a market awning, a hanging sign and a loaded cart;
//   2B an ore trader's stone house with an open shed of ore and ingots;
//   3A a great guild inn with a bell turret, banners and a stall; 3B a depot: a long shed of barrels and crates.
export function tradePost(variant: number, level: number): Sprite {
  const b = variant % 2 === 1
  const { canvas, cx, base, m } = plot(2, 48 + level * 22)
  const tops: Top[] = []
  paveArea(m, 4, 4, 60, 60, level === 1 ? 'dirt' : 'cobble', 41 + level + (b ? 3 : 0))
  if (level === 1) {
    openShed(m, 10, 10, 44, 30, 12, { form: 'gable-u', rise: 8, oh: 2, style: { kind: b ? 'shingle' : 'thatch', r: b ? SHINGLE_ROOF : THATCH_ROOF, seed: 44 } })
    awning(m, 12, 30, 42, 38, 11, 8, b ? CLOTH_BLUE : CLOTH_RED)
    counter(m, 13, 41, 33, b ? 'cloth' : 'food', 3)
    if (b) {
      for (const [u, v] of [[48, 20], [52, 24], [47, 27]]) m.ball(u, v, 1.6, 2.2, (l, x, y) => dith(CLAY_TILE, toneOf(6, l) + 0.4, x, y))
      for (let k = 0; k < 3; k++) woodBox(m, 46, 34 + k * 0.2, 54, 38, k * 1.6, k * 1.6 + 1.5, [CLOTH_RED, CLOTH_GREEN, CLOTH_PURPLE][k], false)
    } else {
      for (const [u, v] of [[48, 22], [51, 26], [47, 27]]) sack(m, u, v, 0, 2.6)
      basket(m, 48, 36, WHEAT_GRAIN)
      basket(m, 52, 40, FRUITS[0])
      crate(m, 18, 44, 0, 5)
    }
    figure(m, 26, 24, 0, { tunic: b ? CLOTH_BLUE : CLOTH_GREEN, apron: CLOTH_CREAM, arm: 1 })
    return canvas.sprite(cx, base, 0)
  }
  if (level === 2 && !b) {
    const r = block(m, {
      u0: 6, v0: 6, u1: 46, v1: 30, wall: 22, walls: mat.framed(PLASTER, OAK, 8), socle: { r: GRANITE, tall: 3 },
      roof: { form: 'gable-u', rise: 12, oh: 1.8, style: { kind: 'tile', r: CLAY_TILE, seed: 45 } },
      rows: { z: [13], every: 6, w: 3, h: 4, style: { frame: OAK, flowers: true, cross: true } },
      door: { face: 'side', s: 9, w: 6, h: 9, style: { step: GRANITE, arch: true } },
      chimneys: [{ u: 0.8, v: 0.3, tall: 6 }],
    })
    tops.push(...r.tops)
    awning(m, 8, 30, 44, 39, 11, 7.5, CLOTH_RED)
    counter(m, 10, 42, 34, 'food', 7)
    sign(m, 46, 18, 18, BOARDS, GOLD[4])
    cart(m, 30, 48, 'sacks')
    barrel(m, 54, 34)
    barrel(m, 56, 39)
    sack(m, 52, 46)
    figure(m, 16, 42, 0, { tunic: CLOTH_BLUE, arm: 1 })
    flagpole(m, 56, 8, 0, 26, CLOTH_RED, 0)
    return smoky(canvas.sprite(cx, base, 0), tops)
  }
  if (level === 2) {
    const r = block(m, {
      u0: 18, v0: 6, u1: 54, v1: 28, wall: 18, walls: mat.ashlar(LIME, 3.5, 7),
      roof: { form: 'gable-v', rise: 12, oh: 1.6, style: { kind: 'shingle', r: SHINGLE_ROOF, seed: 46 } },
      rows: { z: [5, 12], every: 8, w: 3, h: 4, style: { frame: OAK, shutters: CLOTH_GREEN } },
      door: { face: 'front', s: 14, w: 6, h: 9, style: { step: GRANITE, iron: true } },
      chimneys: [{ u: 0.3, v: 0.75, tall: 6 }],
    })
    tops.push(...r.tops)
    openShed(m, 4, 24, 22, 40, 10, { form: 'shed-v', rise: 4, oh: 1, style: { kind: 'shingle', r: SHINGLE_ROOF, seed: 47 } })
    for (const [u, v, rr] of [[10, 34, 4], [16, 30, 3.5], [9, 28, 3]]) m.ball(u, v, 0, rr, (l, x, y) => dith(BASALT, toneOf(6, l) + (hash(Math.round(x), Math.round(y), 5) > 0.85 ? 2 : 0), x, y), 0.7, true)
    counter(m, 26, 50, 34, 'ore', 9)
    for (let k = 0; k < 3; k++) woodBox(m, 46, 44 + k * 1.3, 54, 45 + k * 1.3, 0, 1, GOLD, false)
    crate(m, 34, 46, 0, 5)
    crate(m, 40, 47, 0, 4.5)
    figure(m, 36, 40, 0, { tunic: CLOTH_CREAM, apron: CLOTH_BLUE, arm: 1 })
    return smoky(canvas.sprite(cx, base, 0), tops)
  }
  if (!b) {
    const wing = block(m, { u0: 34, v0: 4, u1: 58, v1: 22, wall: 20, walls: mat.framed(PLASTER, OAK, 8), roof: { form: 'gable-v', rise: 10, oh: 1.5, style: { kind: 'tile', r: CLAY_TILE, seed: 48 } }, rows: { z: [5, 13], every: 6, w: 3, h: 4, style: { frame: OAK, cross: true } }, chimneys: [{ u: 0.5, v: 0.3, tall: 6 }] })
    const hallTop = block(m, {
      u0: 4, v0: 6, u1: 36, v1: 34, wall: 28, walls: mat.framed(WHITEWASH, OAK, 8), socle: { r: LIME, tall: 4 },
      roof: { form: 'gable-u', rise: 14, oh: 1.8, style: { kind: 'tile', r: CLAY_TILE, seed: 49 } },
      rows: { z: [6, 17], every: 6, w: 3, h: 5, style: { frame: OAK, flowers: true, cross: true } },
      door: { face: 'front', s: 12, w: 7, h: 10, style: { step: LIME, arch: true } },
    })
    tops.push(...wing.tops)
    // The bell turret on the ridge.
    roundTower(m, 20, 20, 3, hallTop.ridge + 6, WHITEWASH, { kind: 'tile', r: CLAY_TILE }, { slits: false, corbel: false })
    drape(m, 'front', 34, 6, 25, 4, 12, CLOTH_BLUE)
    drape(m, 'front', 34, 26, 25, 4, 12, CLOTH_BLUE)
    awning(m, 38, 34, 58, 42, 10, 7, CLOTH_BLUE)
    counter(m, 40, 56, 37, 'cloth', 11)
    barrel(m, 8, 44)
    barrel(m, 13, 46)
    cart(m, 22, 48, 'barrels')
    lamp(m, 30, 40)
    return smoky(canvas.sprite(cx, base, 0), tops)
  }
  openShed(m, 6, 6, 58, 24, 16, { form: 'gable-u', rise: 10, oh: 2, style: { kind: 'tile', r: CLAY_TILE, seed: 50 } })
  for (let i = 0; i < 7; i++) barrel(m, 10 + i * 6, 29, 0, 7, 2.6)
  for (let i = 0; i < 5; i++) barrel(m, 13 + i * 6, 29, 7, 6, 2.4)
  for (let i = 0; i < 3; i++) barrel(m, 16 + i * 6, 29, 13, 6, 2.2)
  for (const [u, v, z, s] of [[44, 40, 0, 6], [50, 40, 0, 6], [46, 40, 6, 5], [52, 46, 0, 5]]) crate(m, u, v, z, s)
  cart(m, 20, 46, 'sacks')
  for (const [u, v] of [[8, 46], [10, 52]]) sack(m, u, v, 0, 2.8)
  flagpole(m, 58, 52, 0, 26, CLOTH_BLUE, 0)
  return canvas.sprite(cx, base, 0)
}
const WHEAT_GRAIN = 0xff4ab4dc >>> 0

// The market (CLAUDE.md §9.7) in two looks per level, picked by the building (red or blue canopies): striped stalls
// round a well with fruit, cloth and pots on their counters (1); a covered market hall on stone arches beside them (2);
// the hall with a clock tower, a fountain and more stalls (3). Merchants at their counters.
export function market(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, m } = plot(2, 46 + level * 18)
  const tops: Top[] = []
  const c1 = v ? CLOTH_BLUE : CLOTH_RED
  const c2 = v ? CLOTH_GREEN : CLOTH_BLUE
  paveArea(m, 3, 3, 61, 61, level === 1 ? 'gravel' : 'cobble', 61 + v)
  const stall = (u: number, vv: number, cloth: Uint32Array, goods: 'food' | 'cloth' | 'pots', tunic: Uint32Array) => {
    openShed(m, u, vv, u + 14, vv + 10, 9, { form: 'gable-u', rise: 5, oh: 1, style: { kind: 'cloth', r: cloth, r2: CLOTH_CREAM, seed: u } }, GREY_BOARDS)
    counter(m, u + 1, u + 13, vv + 10.5, goods, u + vv)
    figure(m, u + 7, vv + 6, 0, { tunic, apron: CLOTH_CREAM, arm: 1 })
  }
  if (level >= 2) {
    // The market hall: an upper floor of timber on stone arches, open below.
    const u0 = 4
    const v0 = 4
    const u1 = level === 3 ? 38 : 34
    const v1 = 26
    for (const [a, b] of [[u1, v1], [u0 + 1, v1], [(u0 + u1) / 2, v1], [u1, v0 + 1], [u1, (v0 + v1) / 2]]) stoneBox(m, a - 1.5, b - 1.5, a + 1.5, b + 1.5, 0, 10, LIME, false, 2.5)
    // Goods inside the arcade.
    for (let i = 0; i < 4; i++) sack(m, 10 + i * 5, 16, 0, 2.4)
    const r = block(m, { u0, v0, u1, v1, z0: 10, wall: 12, walls: mat.framed(PLASTER, OAK, 7), roof: { form: 'hip', rise: 11, oh: 1.6, style: { kind: 'tile', r: CLAY_TILE, seed: 63 } }, rows: { z: [4], every: 6, w: 3, h: 4, style: { frame: OAK, cross: true } } })
    m.solidBox(u0, v0, u1, v1, 0, 10)
    tops.push(...r.tops)
    if (level === 3) {
      // A clock tower over the hall.
      const t = block(m, { u0: 14, v0: 10, u1: 24, v1: 20, z0: 22, wall: 16, walls: mat.ashlar(LIME, 3.5, 6), roof: { form: 'hip', rise: 10, oh: 1, style: { kind: 'slate', r: SLATE_TILE, seed: 64 } } })
      for (const [face, at, a0] of [['front', 20, 14], ['side', 24, 10]] as const) {
        for (let a = 0; a < Math.PI * 2; a += 0.1) for (let rr = 0; rr <= 3; rr += 0.5) {
          const s = 5 + Math.cos(a) * rr
          const z = 35 + Math.sin(a) * rr
          const c = rr > 2.5 ? GOLD[2] : WHITEWASH[face === 'front' ? 5 : 3]
          if (face === 'front') m.put(a0 + s, at, z, c, 0.6)
          else m.put(at, a0 + s, z, c, 0.6)
        }
        // The hands.
        if (face === 'front') { m.line([a0 + 5, at, 35], [a0 + 5, at, 37], IRON[0], 0.8); m.line([a0 + 5, at, 35], [a0 + 6.5, at, 35], IRON[0], 0.8) }
        else { m.line([at, a0 + 5, 35], [at, a0 + 5, 37.5], IRON[0], 0.8); m.line([at, a0 + 5, 35], [at, a0 + 6.2, 34.4], IRON[0], 0.8) }
      }
      void t
    }
  } else {
    stall(6, 6, c1, 'food', CLOTH_GREEN)
    stall(26, 6, c2, 'pots', CLOTH_PURPLE)
  }
  stall(6, 36, c2, 'cloth', CLOTH_RED)
  stall(42, 18, c1, 'food', CLOTH_BLUE)
  if (level === 3) stall(40, 44, CLOTH_GREEN, 'pots', CLOTH_CREAM)
  // A well (a fountain at level 3) in the middle.
  const wu = 30
  const wv = 38
  if (level === 3) {
    m.cylinder(wu, wv, 5, 0, 2.5, (a, _z, l, x, y) => dith(LIME, toneOf(6, l) + (Math.round(a * 5) % 2 ? 0.3 : -0.3), x, y))
    m.disc(wu, wv, 4.4, 2.2, (a, b, x, y) => dith(WATER, 2.6 + Math.sin(a + b) * 0.6, x, y))
    m.cylinder(wu, wv, 1, 2, 8, (_, __, l, x, y) => dith(LIME, toneOf(6, l), x, y), false)
    m.ball(wu, wv, 8.5, 2, (l, x, y) => dith(LIME, toneOf(6, l), x, y), 0.5, true)
  } else {
    m.cylinder(wu, wv, 3, 0, 4, (a, z, l, x, y) => dith(GRANITE, toneOf(6, l) + (Math.floor(z / 1.5 + a * 2) % 2 ? -0.5 : 0.2), x, y))
    m.disc(wu, wv, 2.2, 4, () => WATER[0])
    post(m, wu - 2.4, wv, 0, 9, OAK, 1)
    post(m, wu + 2.4, wv, 0, 9, OAK, 1)
    m.line([wu - 2.4, wv, 8.5], [wu + 2.4, wv, 8.5], OAK[3])
  }
  barrel(m, 54, 40)
  basket(m, 22, 52, FRUITS[1])
  basket(m, 26, 54, FRUITS[2])
  crate(m, 50, 52, 0, 4.5)
  figure(m, 36, 48, 0, { tunic: CLOTH_GREEN, hood: CLOTH_CREAM })
  // The guild's scales on a post.
  post(m, 58, 30, 0, 14, OAK, 1)
  m.card(58, 30, 13, (set) => {
    for (let dx = -5; dx <= 5; dx++) set(dx, 0, GOLD[3])
    for (const sx of [-5, 5]) { for (let dz = -4; dz < 0; dz++) set(sx, dz, GOLD[1]); for (let dx = -2; dx <= 2; dx++) set(sx + dx, -5, GOLD[dx < 0 ? 4 : 2]) }
  }, 0.5)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The house of entertainment (CLAUDE.md §7.8): a tall half-timbered inn, its upper floor jutting over a stone ground
// floor with lit windows, a sign hanging by the door, a little stage under a striped canopy where a minstrel plays,
// strings of bunting across the yard to poles with lanterns, tables with benches and barrels. A flag waves over it.
const BUNTING = [CLOTH_RED, GOLD, CLOTH_BLUE, CLOTH_GREEN, WHITEWASH]
export function tavern(variant = 0): Sprite {
  return animate((f) => tavernFrame(variant % 2, f), 4, 4)
}
function tavernFrame(v: number, f: number): Sprite {
  const { canvas, cx, base, m } = plot(2, 96)
  const tops: Top[] = []
  paveArea(m, 3, 3, 61, 61, 'flagstone', 71 + v)
  const roof: RoofStyle = v ? { kind: 'tile', r: CLAY_TILE, seed: 72 } : { kind: 'slate', r: SLATE_TILE, seed: 72 }
  block(m, { u0: 6, v0: 6, u1: 38, v1: 30, wall: 11, walls: mat.ashlar(LIME, 3.5, 7), rows: { z: [3], every: 6, w: 3.5, h: 5, style: { frame: OAK, cross: true } }, door: { face: 'front', s: 12, w: 6, h: 9, style: { step: LIME, arch: true } } })
  woodBox(m, 5, 5, 39.5, 31.5, 11, 12.3, OAK, false)
  const r = block(m, {
    u0: 5, v0: 5, u1: 39.5, v1: 31.5, z0: 12.3, wall: 12, walls: mat.framed(v ? PLASTER : WHITEWASH, OAK, 7),
    roof: { form: 'gable-v', rise: 15, oh: 1.8, style: roof },
    rows: { z: [3.5], every: 6, w: 3, h: 4.5, style: { frame: OAK, flowers: true, cross: true } },
    chimneys: [{ u: 0.25, v: 0.3, tall: 6 }, { u: 0.75, v: 0.7, tall: 6 }],
  })
  tops.push(...r.tops)
  sign(m, 20, 31.5, 10, BOARDS, GOLD[4])
  // The stage, front right, with its minstrel.
  woodBox(m, 42, 8, 58, 22, 0, 2, BOARDS, true)
  openShed(m, 42, 8, 58, 22, 12, { form: 'gable-u', rise: 6, oh: 1, style: { kind: 'cloth', r: v ? CLOTH_RED : CLOTH_BLUE, r2: CLOTH_CREAM, seed: 73 } }, GREY_BOARDS)
  if (f >= 0) figure(m, 50, 17, 2, { tunic: v ? GOLD : CLOTH_RED, tool: 'lute', hat: CLOTH_GREEN, arm: f % 2 })
  else figure(m, 50, 17, 2, { tunic: v ? GOLD : CLOTH_RED, tool: 'lute', hat: CLOTH_GREEN, arm: 0 })
  // Tables with benches, barrels, lanterns.
  for (const [u, vv] of [[14, 42], [32, 46]]) {
    woodBox(m, u, vv, u + 10, vv + 4, 3, 4, BOARDS, false)
    for (const a of [u + 1, u + 9]) post(m, a, vv + 2, 0, 3, OAK, 1)
    for (const dv of [-2.5, 6.5]) woodBox(m, u, vv + dv, u + 10, vv + dv + 1.5, 1.8, 2.5, OAK, false)
    m.put(u + 3, vv + 2, 4.6, GOLD[3], 0.5)
    m.put(u + 6, vv + 1.5, 4.6, GOLD[4], 0.5)
    m.put(u + 7, vv + 2.5, 4.6, CLOTH_CREAM[4], 0.5)
  }
  barrel(m, 46, 36)
  barrel(m, 51, 38)
  barrel(m, 48, 33, 7, 6, 2.3)
  figure(m, 20, 50, 0, { tunic: CLOTH_GREEN, arm: 1 })
  figure(m, 38, 40, 0, { tunic: CLOTH_PURPLE, hood: CLOTH_PURPLE, back: true, flip: true })
  // Bunting from the house to poles with lanterns at the yard's edge.
  const poles = [[58, 40], [30, 58], [8, 52]] as const
  for (const [u, vv] of poles) lamp(m, u, vv, 18)
  const strings: [number, number, number, number, number, number][] = [[39, 20, 22, 58, 40, 18], [30, 31, 22, 30, 58, 18], [14, 31, 22, 8, 52, 18]]
  strings.forEach(([u0, v0, z0, u1, v1, z1], i) => {
    for (let k = 0; k <= 1; k += 0.02) {
      const sag = Math.sin(k * Math.PI) * 4
      const u = u0 + (u1 - u0) * k
      const vv = v0 + (v1 - v0) * k
      const z = z0 + (z1 - z0) * k - sag
      m.put(u, vv, z, OAK[1], 0.5)
      const n = Math.round(k * 50)
      if (n % 3 !== 0 || k < 0.05 || k > 0.95) continue
      const c = BUNTING[(n / 3 + i) % BUNTING.length]
      m.card(u, vv, z, (set) => { set(0, -1, c[3]); set(-1, -1, c[4]); set(1, -1, c[2]); set(0, -2, c[3]) }, 1)
    }
  })
  if (f >= 0) flagpole(m, 22, 18, r.ridge - 2, 10, BUNTING[(v ? 0 : 2)], f / 4, 9, 5)
  shrub(m, 4, 40, 2.5, 0.3, 5)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The treasury (CLAUDE.md §6.4): a strong vault of thick dressed stone, barred slits and an iron-studded door, guarded
// by a spearman; two looks per level picked by the building (pale limestone, warm sandstone): a vault under a lead roof
// with chests of gold by its door (1); a gilded dome over it and a guard tower (2); two domes, gilded ridges, banners
// and a counting house beside it (3).
export function treasury(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, m } = plot(2, 70 + level * 20)
  const tops: Top[] = []
  const stone = v ? SANDSTONE : LIME
  paveArea(m, 3, 3, 61, 61, 'flagstone', 81 + v)
  const r = block(m, {
    u0: 8, v0: 8, u1: 46, v1: 38, wall: 20, walls: mat.ashlar(stone, 4, 9), socle: { r: GRANITE, tall: 3 },
    roof: { form: level === 1 ? 'hip' : 'flat', rise: 9, oh: 1, style: { kind: 'lead', r: LEAD, seed: 82, cap: level === 3 ? GOLD[3] : undefined } },
    rows: { z: [10], every: 8, w: 2, h: 5, style: { frame: stone, bars: true } },
    door: { face: 'front', s: 15, w: 8, h: 11, style: { arch: true, wood: IRON, frame: GRANITE, step: GRANITE, iron: true } },
  })
  tops.push(...r.tops)
  if (level >= 2) {
    // A parapet round the flat roof, a gilded dome in its middle.
    for (let s = 0; s < 38; s += 3) if (Math.floor(s / 3) % 2 === 0) { stoneBox(m, 8 + s, 37, 8 + s + 1.8, 38, 20, 22.5, stone, false, 2.5) }
    for (let s = 0; s < 30; s += 3) if (Math.floor(s / 3) % 2 === 0) { stoneBox(m, 45, 8 + s, 46, 8 + s + 1.8, 20, 22.5, stone, false, 2.5) }
    const dome = (u: number, vv: number, rr: number) => {
      m.cylinder(u, vv, rr, 20, 24, (a, _z, l, x, y) => dith(stone, toneOf(6, l) + (Math.round(a * rr / 3) % 2 ? 0.4 : -0.3), x, y))
      m.ball(u, vv, 24, rr, (l, x, y, nz) => dith(GOLD, toneOf(6, l) + (nz > 0.9 ? 1 : 0), x, y), 1, true)
      m.solidRound(u, vv, rr, 24, 24 + rr, true)
      m.line([u, vv, 24 + rr], [u, vv, 24 + rr + 4], GOLD[4])
    }
    dome(27, 23, 8)
    if (level === 3) dome(14, 32, 5)
    roundTower(m, 50, 12, 4.5, 26, stone, { kind: 'lead', r: LEAD }, { lit: true, seed: 83 })
  }
  if (level === 3) {
    drape(m, 'front', 38, 10, 18, 4, 12, CLOTH_RED)
    drape(m, 'front', 38, 34, 18, 4, 12, CLOTH_RED)
    const ch = block(m, { u0: 48, v0: 22, u1: 60, v1: 40, wall: 12, walls: mat.ashlar(stone, 3.5, 6), roof: { form: 'gable-v', rise: 8, oh: 1, style: { kind: 'tile', r: CLAY_TILE, seed: 84 } }, rows: { z: [4], every: 6, w: 2.5, h: 3.5, style: { frame: OAK, cross: true } }, chimneys: [{ u: 0.5, v: 0.3, tall: 5 }] })
    tops.push(...ch.tops)
  }
  // Chests of gold by the door, and the guard.
  for (const [u, vv] of [[12, 44], [17, 46]]) {
    woodBox(m, u, vv, u + 5, vv + 3.5, 0, 3, BOARDS, false)
    m.surface(u, vv, u + 5, vv + 3.5, (_, b) => 3 + Math.sin(((b - vv) / 3.5) * Math.PI) * 1.2, (_, __, ___, x, y) => dith(BOARDS, 3.6, x, y))
    m.front(u, u + 5, vv + 3.5, 0, 3, (s) => (Math.round(s) % 2 ? IRON[3] : GOLD[3]), 0.5)
  }
  for (let i = 0; i < 9; i++) m.put(20 + hash(i, 1, 85) * 4, 51 + hash(i, 2, 85) * 3, 0.3, GOLD[3 + Math.floor(hash(i, 3, 85) * 3)])
  figure(m, 33, 44, 0, { tunic: CLOTH_RED, tool: 'spear', hat: IRON })
  figure(m, 52, 46, 0, { tunic: CLOTH_RED, tool: 'spear', hat: IRON, flip: true })
  return smoky(canvas.sprite(cx, base, 0), tops)
}

export { COPPER, FRONT, LEAVES, SIDE, TOP, logPile }
