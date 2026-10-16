import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BOARDS, CLAY_TILE, CLOTH_BLUE, CLOTH_CREAM, CLOTH_GREEN, CLOTH_RED, GRANITE, GREY_BOARDS, LEAVES, LIME, LOGWOOD,
  MOSS_ROOF, OAK, PLASTER, SHINGLE_ROOF, SLATE_TILE, THATCH_ROOF, WHITEWASH, BLOOM,
  barrel, crate, dith, fence, logPile, paveArea, plot, sack, smoky, toneOf,
} from './buildingKit'
import type { Model, Top } from './buildingKit'
import { block, mat, post, stoneBox, woodBox } from './lordBuildings'
import type { Block } from './lordBuildings'

// A bush or a flower bed in the garden: a round clump of leaves with a few blossoms.
export function shrub(m: Model, u: number, v: number, r = 2.5, flowers = 0, seed = 1) {
  m.ball(u, v, r * 0.7, r, (l, x, y) => {
    const k = hash(Math.round(x), Math.round(y), seed)
    if (flowers > 0 && k > 1 - flowers) return BLOOM[Math.floor(hash(Math.round(x), 3, seed) * BLOOM.length)]
    return dith(LEAVES, toneOf(6, l) + (k - 0.5) * 1.2, x, y)
  }, 0.85, true)
}
// A clothes line between two posts with washing pegged on it.
export function washing(m: Model, u0: number, v0: number, u1: number, v1: number, seed = 1) {
  post(m, u0, v0, 0, 10, GREY_BOARDS, 1)
  post(m, u1, v1, 0, 10, GREY_BOARDS, 1)
  const cloths = [CLOTH_CREAM, CLOTH_RED, CLOTH_BLUE, WHITEWASH, CLOTH_GREEN]
  for (let f = 0; f <= 1; f += 0.02) {
    const sag = Math.sin(f * Math.PI) * 1.5
    const u = u0 + (u1 - u0) * f
    const v = v0 + (v1 - v0) * f
    m.put(u, v, 9.5 - sag, GREY_BOARDS[1], 0.5)
    const k = Math.floor(f * 6)
    if (k % 2 === 1) {
      const c = cloths[(k + seed) % cloths.length]
      for (let dz = 1; dz < 5; dz++) m.put(u, v, 9.5 - sag - dz, dith(c, 3.2 - dz * 0.2, u * 3, dz), 0.5)
    }
  }
}
// A woodpile under a little roof against a wall at (u, v) along u.
export function woodpile(m: Model, u: number, v: number, length = 8) {
  logPile(m, u, v, length, [3, 2], 1.2, 'u')
}

// Houses (CLAUDE.md §6.4) in four looks at each level, picked by the building:
//   0 timber frame under red tiles, its gable to the street, flower boxes and a garden;
//   1 whitewashed cottage under a deep thatch, a fenced garden and a clothes line;
//   2 stone house under slate with blue shutters and a woodpile;
//   3 log house under a mossy shingle roof with a porch and a woodpile.
// Level 1 is a cottage, level 2 a bigger house with a lean-to or a dormer, level 3 a two-storey house whose upper floor
// juts out over the lower (stone below, frame above), with two chimneys.
export function house(variant: number, level = 1): Sprite {
  const v = variant % 4
  const { canvas, cx, base, m } = plot(1, 46 + (level - 1) * 14)
  const tops: Top[] = []
  const roofs = [
    { kind: 'tile' as const, r: CLAY_TILE },
    { kind: 'thatch' as const, r: THATCH_ROOF },
    { kind: 'slate' as const, r: SLATE_TILE },
    { kind: 'shingle' as const, r: SHINGLE_ROOF, moss: 0.35 },
  ][v]
  const walls = [mat.framed(PLASTER, OAK, 8), mat.plaster(WHITEWASH), mat.ashlar(LIME, 3.5, 6), mat.logs(LOGWOOD, 3)][v]
  const form = v === 0 ? 'gable-v' : v === 1 ? 'hip' : 'gable-u'
  // The garden ground before the door.
  paveArea(m, level === 3 ? 9 : 8, 22, level === 3 ? 15 : 14, 31.5, v === 2 ? 'gravel' : 'dirt', 11 + v, true)
  const shutters = v === 2 ? CLOTH_BLUE : v === 0 ? CLOTH_GREEN : undefined
  const winStyle = { frame: v === 2 ? LIME : OAK, shutters, flowers: v === 0, sill: v === 2 ? LIME : undefined, cross: true }
  if (level < 3) {
    const big = level === 2
    const b: Block = {
      u0: big ? 3 : 5, v0: big ? 4 : 5, u1: big ? 25 : 24, v1: big ? 25 : 23,
      wall: big ? 13 : 11,
      walls,
      socle: v === 0 || v === 3 ? { r: GRANITE, tall: 2.5 } : undefined,
      roof: { form, rise: v === 1 ? (big ? 12 : 10) : big ? 12 : 10, oh: v === 1 ? 2.5 : 1.5, style: { ...roofs, seed: 30 + v } },
      door: { face: 'front', s: big ? 5.5 : 3.5, w: 4, h: 7, style: { step: LIME, wood: v === 2 ? CLOTH_RED : BOARDS } },
      rows: { z: [3.5], every: big ? 7 : 8, w: 3, h: 3.5, style: winStyle },
      chimneys: v === 3 && !big ? [] : [{ u: 0.75, v: 0.35, tall: 5 }],
    }
    const r = block(m, b)
    tops.push(...r.tops)
    if (big) {
      // Level 2: a lean-to at the side (tile, thatch) or a dormer in the roof (slate, logs).
      if (v === 0 || v === 1) {
        block(m, { u0: 25, v0: 8, u1: 30.5, v1: 22, wall: 7, walls: v === 0 ? mat.boards(BOARDS) : mat.plaster(WHITEWASH), roof: { form: 'shed-u', rise: 3, oh: 1, style: { ...roofs, seed: 50 } }, windows: [{ face: 'side', s: 5, z: 3, w: 3, h: 2.5, style: { frame: OAK } }] })
      } else {
        block(m, { u0: 12, v0: 19, u1: 18, v1: 25, z0: 10, wall: 7.5, walls: mat.plaster(PLASTER), roof: { form: 'gable-v', rise: 3.5, oh: 0.8, style: { ...roofs, seed: 52 } }, windows: [{ face: 'front', s: 1.5, z: 3.5, w: 3, h: 3, style: { frame: OAK } }] })
      }
    }
    if (v === 3) {
      // A porch on posts before the door.
      const pv = big ? 25 : 23
      for (const pu of [6.5, 13.5]) post(m, pu, pv + 4, 0, 8, OAK)
      woodBox(m, 5.5, pv, 14.5, pv + 5, 0, 0.8, BOARDS, false)
      block(m, { u0: 5.5, v0: pv, u1: 14.5, v1: pv + 5, z0: 8, wall: 0.1, walls: mat.boards(BOARDS), roof: { form: 'shed-v', rise: 2.5, oh: 0.8, style: { ...roofs, seed: 53 } } })
    }
  } else {
    // Level 3: a stone ground floor, the upper floor jutting out over it, a wing at the back.
    const lower = v === 3 ? mat.logs(LOGWOOD, 3) : v === 1 ? mat.plaster(WHITEWASH) : mat.ashlar(LIME, 3.5, 6)
    const upper = v === 2 ? mat.ashlar(LIME, 3.5, 6) : v === 3 ? mat.logs(LOGWOOD, 3) : v === 1 ? mat.framed(WHITEWASH, OAK, 7) : mat.framed(PLASTER, OAK, 7)
    block(m, { u0: 3, v0: 3, u1: 14, v1: 15, wall: 18, walls: v === 1 ? mat.plaster(WHITEWASH) : lower, roof: { form: v === 1 ? 'hip' : 'gable-u', rise: 8, oh: 1.2, style: { ...roofs, seed: 55 } }, rows: { z: [4, 12], every: 6, w: 2.5, h: 3, style: { frame: OAK } } })
    block(m, { u0: 6, v0: 6, u1: 25, v1: 23, wall: 9, walls: lower, rows: { z: [2.5], every: 7, w: 3, h: 3.5, style: winStyle }, door: { face: 'front', s: 3, w: 4, h: 7, style: { step: LIME, arch: v === 2 } } })
    // The jettied upper floor: a beam course, then the frame.
    woodBox(m, 5, 5, 26.5, 24.5, 9, 10.2, OAK, false)
    const r = block(m, {
      u0: 5, v0: 5, u1: 26.5, v1: 24.5, z0: 10.2, wall: 9, walls: upper,
      roof: { form, rise: 12, oh: 1.6, style: { ...roofs, seed: 56 } },
      rows: { z: [2.5], every: 6.5, w: 3, h: 4, style: { ...winStyle, flowers: v !== 2 } },
      chimneys: [{ u: 0.78, v: 0.3, tall: 6 }, { u: 0.2, v: 0.7, tall: 5 }],
    })
    tops.push(...r.tops)
  }
  // The garden: what each house keeps by its door.
  if (v === 0) {
    shrub(m, 28, 12, 2.6, 0.25, 3)
    shrub(m, 27, 18, 2.2, 0.3, 4)
    barrel(m, 27.5, 26.5, 0, 6, 2.2)
  } else if (v === 1) {
    fence(m, 30.5, 2, 30.5, 30.5, GREY_BOARDS, 4.5)
    fence(m, 2, 30.5, 30.5, 30.5, GREY_BOARDS, 4.5)
    if (level === 1) washing(m, 26, 5, 27, 18, variant)
    for (const [a, b] of [[27, 22], [24, 27], [28, 27]]) shrub(m, a, b, 1.6, 0.5, a + b)
  } else if (v === 2) {
    woodBox(m, 26.5, 8, 29, 18, 0, 0.5, OAK, false)
    logPile(m, 26.5, 8.5, 9, [3, 2, 1], 1.1, 'v')
    sack(m, 21, 28)
    crate(m, 26, 25, 0, 4)
  } else {
    logPile(m, 26, 6, 10, [3, 2], 1.3, 'v')
    // A chopping stump.
    m.cylinder(24, 28, 1.8, 0, 2.5, (_, __, l, x, y) => dith(LOGWOOD, toneOf(6, l), x, y), false)
    m.disc(24, 28, 1.8, 2.5, (_, __, x, y) => dith(LIME, 4, x, y))
  }
  if (level >= 2 && v !== 1) stoneBox(m, 19, 27.5, 22, 30.5, 0, 0.6, LIME, false)
  if (level === 3 && v === 1) washing(m, 27, 4, 28, 20, variant + 1)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

export { MOSS_ROOF, SLATE_TILE }
