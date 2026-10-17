import { useEffect, useRef } from 'react'
import { gameTime } from '@game/shared'
import type { Unit } from '@game/shared'
import { serverNow } from '../../net/clock'
import { Buf, Fx, PAL, bake, bay, birds, box, checker, cloudLayer, halo, hash, mixWord, pineRow, pline, ramp, rgb, ridge, smoke, tone } from './minigames/art'

// The moving picture over the battle view (CLAUDE.md §9.7), painted like the mini games (§6.5): a hi-bit scene of
// 256×104 art pixels scaled up nearest-neighbour. The still layers (the sky for the hour of the game day, far
// mountains and hills, the trampled field, the castle wall, palisade, town or camp on the defenders' side) are painted
// once with short colour ramps and ordered dither and kept; the soldiers come from sprite sheets drawn once per
// kingdom colour (outlined, three tones of the colour, helmets, spears, shields, bows, horses, pitchforks).
//
// What happens follows the battle's data only: as many figures as the soldiers (with the army's mix of spearmen,
// archers, shieldmen and cavalry), the round's losses fall and stay down, the living close up the ranks; the lines
// march in when the first round begins, the front ranks thrust and swing (sparks and dust), archers loose arcing
// volleys, catapults hurl stones at the wall (debris, cracks), the defenders shoot from the battlements, fires and
// smoke rise behind the wall as a siege wears on. When it is over the winners raise their weapons and the beaten fall
// back. The little particles and timings are for the eye only.

export interface SceneSide {
  soldiers: number
  start: number
  color: string
  archers: boolean
  catapults: boolean
  // The lord leads it himself: he stands beside his golden royal banner, crowned.
  king?: boolean
  // The mix of kinds (when known); otherwise spearmen, with a third archers if `archers`.
  units?: Partial<Record<Unit, number>>
  // Townsfolk, rebels or outlaws: no helmets or shields, pitchforks and clubs.
  rabble?: boolean
}

// Where it is fought: an open field, a palace's stone walls, a town's palisade, a town without walls, a camp.
export type SceneSetting = 'field' | 'castle' | 'palisade' | 'town' | 'camp'

const W = 256
const H = 104
const HORIZON = 56
const BASE = 70 // where the walls, houses and tents meet the ground; every soldier stands in front of it
const MAX_FIGURES = 18
const INK = 0x14101a

type Kind = 'spear' | 'archer' | 'shield' | 'cavalry' | 'rabble' | 'king' | 'bearer'
const KINDS: Kind[] = ['spear', 'archer', 'shield', 'cavalry', 'rabble', 'king', 'bearer']
// Frames: 0–3 walking, 4 standing, 5 drawing back, 6 striking, 7 cheering, 8 falling, 9 lying dead.
const FRAMES = 10
const CW = 26
const CH = 24
const FX = 12
const FY = 21

const hexOf = (css: string) => parseInt(css.replace('#', '').slice(0, 6), 16) || 0xa8a4ac
// A canvas word (ABGR) back to CSS.
const cssOf = (c: number) => `#${[c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`

// ---- Sprite sheets -----------------------------------------------------------------------------------------------------

const IRON = ramp(...PAL.iron)
const WOOD = ramp(...PAL.wood)
const SKIN = ramp(...PAL.skin)
const LEATHER = ramp(0x2a1a12, 0x4a3020, 0x6e4a2e, 0x8a6040)
const CLOTH = ramp(...PAL.cloth)
const GOLD = ramp(...PAL.gold)
const HORSE = ramp(0x2e1c12, 0x5a3420, 0x84522e, 0xa8743e)
const PURPLE = ramp(0x2a1638, 0x4a2a64, 0x6a3a8c, 0x9060b4)
const HAIR = ramp(0x2a1a10, 0x4a2e18, 0x6a4422)

function teamRamp(hex: number) {
  const c = rgb(hex)
  return [mixWord(c, rgb(INK), 0.55), mixWord(c, rgb(INK), 0.25), c, mixWord(c, rgb(0xffffff), 0.35)]
}

class Painter {
  b: Buf
  ox = 0
  oy = 0
  constructor(b: Buf) {
    this.b = b
  }
  p(x: number, y: number, c: number) {
    if (x < -FX || x >= CW - FX || y < -FY || y >= CH - FY) return
    this.b.set(this.ox + FX + x, this.oy + FY + y, c)
  }
  r(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.p(x + i, y + j, c)
  }
  l(x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) this.p(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
  }
  // A dark line round everything painted so far in this cell (thin details are painted after it, unoutlined).
  outline() {
    const { b, ox, oy } = this
    const add: number[] = []
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++) {
        if (b.get(x, y) >>> 24) continue
        const n = (xx: number, yy: number) => xx >= ox && xx < ox + CW && yy >= oy && yy < oy + CH && b.get(xx, yy) >>> 24
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) add.push(x, y)
      }
    for (let i = 0; i < add.length; i += 2) b.set(add[i], add[i + 1], rgb(INK))
  }
}

// Legs from the hip (0, -5 + dy) to the feet for a frame.
function legs(P: Painter, frame: number, dy: number, T: ArrayLike<number>) {
  const strides: [number, number, number, number][] = [
    [-2, 0, 2, 0],
    [0, -1, 1, 0],
    [2, 0, -2, 0],
    [1, 0, 0, -1],
  ]
  const [bx, by, fx, fy] = frame < 4 ? strides[frame] : frame === 6 ? [-2, 0, 3, 0] : [-1, 0, 1, 0]
  P.l(0, -5 + dy, bx, -2 + by, CLOTH[1])
  P.p(bx, -1 + by, LEATHER[0])
  P.p(bx + 1, -1 + by, LEATHER[0])
  P.l(0, -5 + dy, fx, -2 + fy, T.length ? CLOTH[2] : CLOTH[3])
  P.p(fx, -1 + fy, LEATHER[1])
  P.p(fx + 1, -1 + fy, LEATHER[1])
}

// The body of a soldier on foot: torso in the kingdom's colours with a belt, a head, `dy` lower when falling.
function torso(P: Painter, T: ArrayLike<number>, dy: number, lean: number, rabble: boolean) {
  for (let y = -9; y <= -5; y++) {
    const s = y <= -7 ? lean : 0
    P.p(-2 + s, y + dy, T[1])
    P.p(-1 + s, y + dy, T[2])
    P.p(0 + s, y + dy, y === -9 ? T[3] : T[2])
    P.p(1 + s, y + dy, T[3])
  }
  // Skirt and belt.
  P.r(-2, -4 + dy, 5, 1, T[1])
  P.r(-2, -6 + dy, 4, 1, rabble ? CLOTH[0] : LEATHER[0])
  if (!rabble) P.p(1, -6 + dy, GOLD[3])
  else P.p(-1, -8 + dy, CLOTH[2]) // a patch
  // Head.
  P.r(-1 + lean, -12 + dy, 3, 3, SKIN[2])
  P.p(-1 + lean, -12 + dy, SKIN[3])
  P.p(-1 + lean, -10 + dy, SKIN[1])
  P.p(1 + lean, -11 + dy, rgb(INK))
}

function headgear(P: Painter, kind: Kind, T: ArrayLike<number>, dy: number, lean: number) {
  const x = lean
  if (kind === 'spear' || kind === 'bearer') {
    P.r(-2 + x, -12 + dy, 5, 1, IRON[2])
    P.r(-1 + x, -13 + dy, 3, 1, IRON[3])
    P.p(0 + x, -14 + dy, IRON[4])
    P.p(-1 + x, -13 + dy, IRON[4])
  } else if (kind === 'shield') {
    P.r(-1 + x, -13 + dy, 3, 4, IRON[3])
    P.p(-1 + x, -13 + dy, IRON[4])
    P.p(-1 + x, -12 + dy, IRON[4])
    P.r(0 + x, -11 + dy, 2, 1, rgb(INK))
    P.p(0 + x, -14 + dy, T[2])
    P.p(-1 + x, -14 + dy, T[3])
  } else if (kind === 'archer') {
    P.r(-2 + x, -13 + dy, 4, 1, T[1])
    P.r(-2 + x, -12 + dy, 2, 3, T[1])
    P.p(-1 + x, -13 + dy, T[2])
    P.p(1 + x, -12 + dy, T[1])
  } else if (kind === 'rabble') {
    P.r(-1 + x, -13 + dy, 3, 1, HAIR[1])
    P.p(-1 + x, -12 + dy, HAIR[0])
    P.p(1 + x, -13 + dy, HAIR[2])
  } else if (kind === 'king') {
    P.r(-1 + x, -13 + dy, 3, 1, GOLD[3])
    P.p(-1 + x, -14 + dy, GOLD[4])
    P.p(1 + x, -14 + dy, GOLD[4])
    P.p(0 + x, -13 + dy, rgb(0xd0503c))
  }
}

function paintFigure(P: Painter, kind: Kind, frame: number, T: ArrayLike<number>) {
  if (kind === 'cavalry') return paintRider(P, frame, T)
  const rabble = kind === 'rabble'
  if (frame === 9) {
    // Lying on his back, head to the front, the weapon dropped beside him.
    P.r(-7, -2, 3, 1, CLOTH[1])
    P.r(-7, -1, 3, 1, CLOTH[2])
    P.r(-4, -2, 5, 2, T[2])
    P.r(-4, -2, 5, 1, T[3])
    P.p(-4, -1, T[1])
    P.r(1, -2, 1, 2, rabble ? CLOTH[0] : LEATHER[0])
    P.r(2, -3, 3, 3, SKIN[2])
    P.p(2, -3, SKIN[3])
    if (kind === 'spear' || kind === 'bearer') P.r(2, -4, 3, 1, IRON[3])
    if (kind === 'shield') P.r(2, -4, 3, 2, IRON[3])
    if (kind === 'archer') P.r(2, -4, 3, 1, T[1])
    if (kind === 'king') P.r(2, -4, 3, 1, PURPLE[2])
    P.p(-1, -3, SKIN[2])
    if (kind === 'spear') {
      P.r(-8, -3, 3, 2, T[2])
      P.p(-8, -3, T[3])
    }
    if (kind === 'shield') {
      P.r(-9, -2, 4, 2, T[2])
      P.r(-9, -2, 4, 1, T[3])
    }
    P.outline()
    P.p(-2, 0, rgb(0x4a1418))
    P.p(-1, 0, rgb(0x6a1c1c))
    P.p(0, 0, rgb(0x4a1418))
    if (kind === 'spear' || kind === 'rabble' || kind === 'bearer') P.l(-6, 1, 7, -1, WOOD[4])
    if (kind === 'archer') P.l(-3, 1, 3, 0, WOOD[2])
    if (kind === 'shield' || kind === 'king') P.l(-3, 1, 2, 0, IRON[4])
    return
  }
  const fall = frame === 8
  const dy = fall ? 3 : 0
  const lean = frame === 6 ? 1 : 0
  if (kind === 'king') {
    // The cloak behind him.
    P.r(-3, -10 + dy, 2, 7, PURPLE[2])
    P.p(-3, -10 + dy, PURPLE[3])
    P.r(-4, -5 + dy, 2, 2, PURPLE[1])
  }
  if (kind === 'archer') {
    P.r(-4, -11 + dy, 2, 6, LEATHER[1])
    P.p(-4, -11 + dy, LEATHER[2])
  }
  if (fall) {
    P.l(-1, -2, 2, -2, CLOTH[2])
    P.p(2, -1, LEATHER[1])
    P.p(-2, -1, LEATHER[0])
  } else legs(P, frame, 0, T)
  torso(P, T, dy, lean, rabble)
  headgear(P, kind, T, dy, lean)
  // Shields on the arm.
  if (kind === 'spear' && !fall) {
    const sx = frame === 5 || frame === 6 ? 3 : 2
    const sy = -7
    for (let y = -2; y <= 2; y++)
      for (let x = -2; x <= 2; x++) {
        if (x * x + y * y > 5) continue
        P.p(sx + x, sy + y, x + y < -1 ? T[3] : x + y > 1 ? T[1] : T[2])
      }
    P.p(sx, sy, IRON[4])
  }
  if (kind === 'shield' && !fall) {
    const sx = frame === 6 ? 2 : 1
    for (let y = -11; y <= -3; y++) {
      const w = y <= -5 ? 3 : y === -4 ? 2 : 1
      const x0 = sx + (y <= -5 ? 0 : y === -4 ? 1 : 1)
      for (let i = 0; i < w; i++) P.p(x0 + i, y, i === 0 ? T[3] : i === w - 1 && w > 1 ? T[1] : T[2])
    }
    P.p(sx + 1, -9, GOLD[3])
    P.p(sx + 1, -8, GOLD[2])
    P.p(sx + 1, -7, GOLD[2])
  }
  // Front arm.
  const hand: [number, number] = fall
    ? [1, -4]
    : frame === 7
      ? [1, -13]
      : frame === 5
        ? kind === 'archer'
          ? [4, -9]
          : [-1, -8]
        : frame === 6
          ? kind === 'archer'
            ? [4, -9]
            : [3, -8]
          : [2, -7]
  if (!(kind === 'shield' && !fall && frame !== 7)) {
    P.l(0 + lean, -8 + dy, hand[0], hand[1] + (fall ? 0 : 0), T[2])
    P.p(hand[0], hand[1], SKIN[2])
  }
  P.outline()
  // Weapons, thin and unoutlined.
  const tip = (x: number, y: number, dx: number, dy2: number) => {
    P.p(x, y, IRON[5])
    P.p(x + dx, y + dy2, IRON[4])
  }
  if (fall) {
    if (kind !== 'archer') P.l(-6, 0, 6, -2, kind === 'shield' || kind === 'king' ? IRON[4] : WOOD[4])
    else P.l(-3, 0, 3, -1, WOOD[2])
    return
  }
  if (kind === 'spear' || kind === 'rabble') {
    let a: [number, number, number, number]
    if (frame === 5) a = [-7, -9, 6, -8]
    else if (frame === 6) a = [-3, -9, 10, -8]
    else if (frame === 7) a = [1, -6, 1, -19]
    else a = [2, -2, 4, -18]
    P.l(a[0], a[1], a[2], a[3], WOOD[4])
    const horiz = frame === 5 || frame === 6
    if (kind === 'spear') {
      if (horiz) tip(a[2] + 1, a[3], 1, 0)
      else tip(a[2], a[3] - 1, 0, -1)
    } else {
      // The prongs of a pitchfork.
      if (horiz) {
        P.r(a[2] + 1, a[3] - 1, 1, 3, IRON[3])
        P.p(a[2] + 2, a[3] - 1, IRON[4])
        P.p(a[2] + 2, a[3] + 1, IRON[4])
        P.p(a[2] + 2, a[3], IRON[4])
      } else {
        P.r(a[2] - 1, a[3] - 1, 3, 1, IRON[3])
        P.p(a[2] - 1, a[3] - 2, IRON[4])
        P.p(a[2] + 1, a[3] - 2, IRON[4])
        P.p(a[2], a[3] - 2, IRON[4])
      }
    }
  } else if (kind === 'shield' || kind === 'king') {
    let a: [number, number, number, number]
    if (frame === 5) a = [0, -12, -2, -17]
    else if (frame === 6) a = [3, -11, 9, -12]
    else if (frame === 7) a = [1, -14, 1, -20]
    else a = kind === 'king' ? [2, -7, 5, -3] : [-1, -10, -3, -15]
    P.l(a[0], a[1], a[2], a[3], IRON[5])
    P.p(a[0], a[1], GOLD[3])
  } else if (kind === 'archer') {
    if (frame === 5 || frame === 6) {
      // Bow raised: the stave, the string drawn back with an arrow nocked (5) or loosed (6).
      for (let y = -14; y <= -4; y++) P.p(5 + (y > -12 && y < -6 ? 1 : 0), y, WOOD[2])
      if (frame === 5) {
        P.l(5, -14, -1, -9, rgb(0xe8e0d0))
        P.l(5, -4, -1, -9, rgb(0xe8e0d0))
        P.l(-1, -9, 7, -9, WOOD[5])
        P.p(8, -9, IRON[5])
        P.p(-2, -9, rgb(0xfffaf0))
      } else P.l(5, -14, 5, -4, rgb(0xe8e0d0))
    } else if (frame === 7) {
      for (let x = -2; x <= 4; x++) P.p(x, -16 - (x > -1 && x < 3 ? 1 : 0), WOOD[2])
      P.l(-2, -16, 4, -16, rgb(0xe8e0d0))
    } else {
      for (let y = -12; y <= -3; y++) P.p(3 + (y > -10 && y < -5 ? 1 : 0), y, WOOD[2])
      P.l(3, -12, 3, -3, rgb(0xe8e0d0))
    }
    // Fletchings out of the quiver.
    P.p(-4, -12, rgb(0xfffaf0))
    P.p(-3, -13, rgb(0xd0503c))
  } else if (kind === 'bearer') {
    // The pole and flag are drawn each frame (they wave).
  }
}

function paintRider(P: Painter, frame: number, T: ArrayLike<number>) {
  if (frame === 9) {
    // The horse down on its side, legs out; the rider thrown behind it.
    for (let y = -5; y <= -1; y++)
      for (let x = -7; x <= 4; x++) {
        const dx = (x + 1.5) / 6
        const dy = (y + 3) / 2.6
        if (dx * dx + dy * dy > 1) continue
        P.p(x, y, y <= -4 ? HORSE[3] : y <= -2 ? HORSE[2] : HORSE[1])
      }
    P.r(-5, -4, 8, 2, T[2])
    P.r(-5, -4, 8, 1, T[3])
    P.r(5, -3, 3, 2, HORSE[2])
    P.p(8, -2, HORSE[1])
    P.r(-11, -2, 3, 2, T[2])
    P.r(-12, -2, 1, 2, SKIN[2])
    P.outline()
    P.l(1, -5, 4, -8, HORSE[1])
    P.l(-1, -5, 1, -8, HORSE[0])
    P.l(-5, -5, -6, -8, HORSE[1])
    P.l(-9, 1, 6, 0, WOOD[4])
    P.p(-2, 0, rgb(0x4a1418))
    P.p(0, 0, rgb(0x4a1418))
    return
  }
  const fall = frame === 8
  const dy = fall ? 3 : 0
  // Horse legs (behind the body): far legs darker.
  const L: [number, number][][] = [
    [
      [5, -1],
      [4, -2],
      [-7, -1],
      [-6, -2],
    ],
    [
      [2, -1],
      [1, -1],
      [-3, -1],
      [-3, -2],
    ],
    [
      [4, -2],
      [2, -1],
      [-6, -2],
      [-4, -1],
    ],
    [
      [3, -1],
      [1, -2],
      [-5, -1],
      [-5, -2],
    ],
  ]
  const feet = frame < 4 ? L[frame] : frame === 6 ? L[0] : [[3, -1], [2, -1], [-5, -1], [-4, -1]]
  const hips: [number, number][] = [
    [3, -6],
    [2, -6],
    [-5, -6],
    [-4, -6],
  ]
  if (!fall)
    feet.forEach(([x, y], i) => {
      P.l(hips[i][0], hips[i][1], x, y - 1, i % 2 ? HORSE[0] : HORSE[1])
      P.p(x, y, rgb(0x1c1410))
    })
  else {
    P.l(3, -3, 5, -1, HORSE[1])
    P.l(-5, -3, -7, -1, HORSE[1])
  }
  // Barrel, quarters, chest.
  for (let y = -10; y <= -6; y++) for (let x = -6; x <= 3; x++) P.p(x, y + dy, y === -10 ? HORSE[3] : y <= -8 ? HORSE[2] : HORSE[1])
  P.r(-7, -9 + dy, 1, 3, HORSE[2])
  P.r(4, -9 + dy, 1, 3, HORSE[2])
  // Neck and head.
  P.r(3, -12 + dy, 2, 3, HORSE[2])
  P.r(4, -14 + dy, 2, 3, HORSE[2])
  P.r(5, -15 + dy, 3, 3, HORSE[2])
  P.p(5, -15 + dy, HORSE[3])
  P.r(8, -14 + dy, 1, 2, HORSE[1])
  P.p(5, -16 + dy, HORSE[1])
  P.l(2, -10 + dy, 4, -14 + dy, HORSE[0])
  // Tail.
  P.l(-8, -9 + dy, -9, -6 + dy, HORSE[0])
  // The caparison in the kingdom's colours, the saddle.
  P.r(-6, -8 + dy, 10, 3, T[2])
  P.r(-6, -8 + dy, 10, 1, T[3])
  P.r(-6, -6 + dy, 10, 1, T[1])
  for (let x = -5; x <= 3; x += 3) P.p(x, -6 + dy, GOLD[3])
  P.r(-2, -10 + dy, 3, 1, LEATHER[1])
  // Rider.
  const lean = frame === 6 ? 1 : 0
  P.l(0, -9 + dy, 1, -6 + dy, CLOTH[2])
  P.p(1, -6 + dy, LEATHER[0])
  for (let y = -15; y <= -11; y++) {
    const s = y <= -13 ? lean : 0
    P.p(-1 + s, y + dy, T[1])
    P.p(0 + s, y + dy, T[2])
    P.p(1 + s, y + dy, T[3])
  }
  P.r(-1 + lean, -18 + dy, 3, 3, SKIN[2])
  P.p(1 + lean, -17 + dy, rgb(INK))
  P.r(-1 + lean, -19 + dy, 3, 1, IRON[3])
  P.r(-2 + lean, -18 + dy, 1, 1, IRON[2])
  P.p(0 + lean, -20 + dy, IRON[4])
  // A small shield at his side.
  P.r(-2, -14 + dy, 2, 4, T[2])
  P.p(-2, -14 + dy, T[3])
  P.outline()
  P.p(6, -14 + dy, rgb(INK))
  // The lance.
  let a: [number, number, number, number]
  if (fall) a = [-6, 0, 8, -2]
  else if (frame === 5) a = [-4, -12, 10, -16]
  else if (frame === 6) a = [-3, -13, 12, -13]
  else if (frame === 7) a = [1, -10, 1, -21]
  else a = [0, -10, 6, -21]
  P.l(a[0], a[1] + (fall ? 0 : dy), a[2], a[3] + (fall ? 0 : dy), WOOD[4])
  P.p(a[2], a[3] + (fall ? 0 : dy), IRON[5])
  if (!fall && frame !== 6) {
    const px = a[2] - Math.sign(a[2] - a[0])
    P.p(px, a[3] + 2 + dy, T[3])
    P.p(px - 1, a[3] + 3 + dy, T[2])
  }
}

const sheets = new Map<string, [HTMLCanvasElement, HTMLCanvasElement]>()
// A side's sheet (and its mirror): a row per kind, a column per frame.
function sheetOf(color: string) {
  let s = sheets.get(color)
  if (s) return s
  const T = teamRamp(hexOf(color))
  const b = new Buf(CW * FRAMES, CH * KINDS.length)
  const P = new Painter(b)
  KINDS.forEach((kind, k) =>
    Array.from({ length: FRAMES }, (_, f) => {
      P.ox = f * CW
      P.oy = k * CH
      paintFigure(P, kind, f, T)
    }),
  )
  const right = b.canvas()
  const left = document.createElement('canvas')
  left.width = right.width
  left.height = right.height
  const g = left.getContext('2d')!
  // Mirror each cell in place, so the cells keep their positions.
  for (let f = 0; f < FRAMES; f++) {
    g.save()
    g.translate(f * CW + CW, 0)
    g.scale(-1, 1)
    g.drawImage(right, f * CW, 0, CW, right.height, 0, 0, CW, right.height)
    g.restore()
  }
  s = [right, left]
  if (sheets.size > 24) sheets.clear()
  sheets.set(color, s)
  return s
}

// ---- The still layers --------------------------------------------------------------------------------------------------

type Phase = 'dawn' | 'day' | 'dusk' | 'night'
function phaseNow(): Phase {
  const h = gameTime(serverNow(), 0).hour
  return h < 3 || h >= 23 ? 'night' : h < 7 ? 'dawn' : h < 18.5 ? 'day' : 'dusk'
}
const SKY: Record<Phase, readonly number[]> = {
  day: PAL.skyDay,
  dawn: PAL.skyDawn,
  dusk: PAL.skyDusk,
  // Painted light: the night veil darkens it.
  night: [0x18244a, 0x223458, 0x2e4468, 0x3c5478, 0x506888],
}
const hazeOf = (p: Phase) => rgb(SKY[p][SKY[p].length - 1])

function noise2(x: number, y: number, s: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy, s)
  const b = hash(ix + 1, iy, s)
  const c = hash(ix, iy + 1, s)
  const d = hash(ix + 1, iy + 1, s)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

function skyLayer(phase: Phase) {
  return bake(`battle-sky-${phase}`, W, H, (b) => {
    b.sky(ramp(...SKY[phase]), 0, HORIZON + 6)
    if (phase === 'day') {
      b.glow(44, 16, 22, rgb(0xfff4c0), 0.6)
      b.disc(44, 16, 5, 5, rgb(0xfffbe0))
    } else if (phase === 'dusk') {
      b.glow(62, HORIZON - 14, 34, rgb(0xffb060), 0.7)
      b.disc(62, HORIZON - 14, 8, 8, (_x, y) => (y > HORIZON - 16 ? rgb(0xf27a3a) : rgb(0xffd080)))
    } else if (phase === 'dawn') {
      b.glow(206, HORIZON - 10, 30, rgb(0xffe0b0), 0.6)
      b.disc(206, HORIZON - 10, 6, 6, rgb(0xfff0c8))
    } else {
      for (let i = 0; i < 60; i++) {
        const x = Math.floor(hash(i, 1, 77) * W)
        const y = Math.floor(hash(i, 2, 77) * (HORIZON - 12))
        b.set(x, y, hash(i, 3, 77) > 0.8 ? rgb(0xffffff) : rgb(0xc8d4ec))
      }
      b.glow(206, 16, 18, rgb(0xd8e4f4), 0.5)
      b.disc(206, 16, 6, 6, (x, y) => (Math.hypot(x - 209, y - 14) < 5 ? undefined : rgb(0xf4f2e4)))
    }
  })
}

function mountainLayer(phase: Phase) {
  const haze = hazeOf(phase)
  const m = (hex: number, k: number) => mixWord(rgb(hex), haze, k)
  return bake(`battle-mountains-${phase}`, W + 8, H, (b) => {
    const top = (x: number) => 24 + ridge(x, 3, 30, 512) * 22 - Math.max(0, Math.sin(x / 41) * 6)
    const far = Uint32Array.from([m(0x3e4c66, 0.5), m(0x56647e, 0.5), m(0x707e98, 0.5), m(0x8e9ab0, 0.5)])
    b.hills(top, far, 26, HORIZON + 4, 0.7)
    // Snow on the high peaks.
    for (let x = 0; x < b.w; x++) {
      const t0 = Math.round(top(x))
      if (t0 > 33) continue
      for (let y = t0; y < t0 + (34 - t0) * 0.6 + 2; y++) b.dot(x, y, m(top(x + 1) > top(x - 1) ? 0xf2f4f8 : 0xc4ccdc, 0.25), 1 - (y - t0) / ((34 - t0) * 0.6 + 3))
    }
  })
}

function hillLayer(phase: Phase) {
  const haze = hazeOf(phase)
  const m = (hex: number, k: number) => mixWord(rgb(hex), haze, k)
  return bake(`battle-hills-${phase}`, W + 8, H, (b) => {
    const r = Uint32Array.from([m(0x1f3a30, 0.4), m(0x2c4e38, 0.4), m(0x3e6442, 0.4), m(0x52784c, 0.4)])
    b.hills((x) => HORIZON - 12 + ridge(x, 17, 22, 512) * 9, r, 14, HORIZON + 4, 0.6)
  })
}

const clashX = (setting: SceneSetting) => (setting === 'field' ? 128 : setting === 'castle' ? 188 : setting === 'palisade' ? 190 : 178)

function groundLayer(setting: SceneSetting, phase: Phase, seed: number) {
  const haze = hazeOf(phase)
  return bake(`battle-ground-${setting}-${phase}-${seed % 7}`, W, H, (b) => {
    const s = seed % 7
    // Far woods along the horizon.
    pineRow(b, HORIZON + 3, Uint32Array.from(ramp(...PAL.pine).map((c) => mixWord(c, haze, 0.35))), 11 + s, 6, 0.55)
    const grass = ramp(...PAL.grass)
    const dirt = ramp(...PAL.dirt)
    const cx = clashX(setting)
    const road = setting !== 'field'
    for (let y = HORIZON + 2; y < H; y++) {
      const d = (y - HORIZON) / (H - HORIZON)
      for (let x = 0; x < W; x++) {
        if (y < HORIZON + 4 && b.get(x, y) >>> 24) continue
        const n = noise2(x / 14, y / 5, s) - 0.5
        let c = tone(grass, 3.6 - d * 1.4 + n * 1.2 + (hash(x, y, s) > 0.94 ? 0.8 : 0), x, y)
        // Trampled ground where the lines meet, and bare patches.
        const m = noise2(x / 20, y / 6, s + 7)
        const tramp = y > HORIZON + 10 ? Math.exp(-(((x - cx) / 34) ** 2)) * Math.min(1, (y - HORIZON - 10) / 10) : 0
        let v = m * 0.55 + tramp * 0.6
        // The road to the gate.
        if (road) {
          const ry = BASE + 1 + (226 - x) * 0.13
          const rw = 3 + (ry - BASE) * 0.18
          if (x < 236 && Math.abs(y - ry) < rw) v = Math.max(v, 1 - Math.abs(y - ry) / (rw * 1.4))
          if (x < 236 && Math.abs(Math.abs(y - ry) - rw * 0.45) < 0.5 && hash(x, y, 3) > 0.3) v = 2
        }
        if (v + (bay(x, y) - 0.5) * 0.18 > 0.62) c = tone(dirt, v > 1.5 ? 1 : 2.6 + n * 1.4 + d * 0.4, x, y)
        if (y < HORIZON + 10) c = mixWord(c, haze, (1 - (y - HORIZON) / 10) * 0.35)
        b.set(x, y, c)
      }
    }
    // Tufts, flowers, stones.
    for (let i = 0; i < 170; i++) {
      const x = Math.floor(hash(i, 1, s + 20) * W)
      const y = Math.floor(HORIZON + 6 + hash(i, 2, s + 20) * (H - HORIZON - 6))
      const base = b.get(x, y)
      if (base === dirt[1] || base === dirt[2] || base === dirt[3]) continue
      const tall = 1 + Math.round(((y - HORIZON) / (H - HORIZON)) * 2)
      b.set(x, y, grass[1])
      for (let k = 0; k < tall; k++) {
        b.set(x, y - 1 - k, grass[5 - (k & 1)])
        if (k < tall - 1) b.set(x - 1, y - k, grass[4])
        if (k < tall - 1) b.set(x + 1, y - k, grass[3])
      }
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(hash(i, 4, s + 30) * W)
      const y = Math.floor(HORIZON + 8 + hash(i, 5, s + 30) * (H - HORIZON - 8))
      if (Math.abs(x - cx) < 34) continue
      b.set(x, y, [rgb(0xfffaf0), rgb(0xf2d16b), rgb(0xd0503c), rgb(0x8aaee0)][i % 4])
    }
    const stone = ramp(...PAL.stone)
    for (let i = 0; i < 12; i++) {
      const x = hash(i, 6, s + 40) * W
      const y = HORIZON + 10 + hash(i, 7, s + 40) * (H - HORIZON - 12)
      const rx = 1.5 + hash(i, 8, s + 40) * 2.5
      b.disc(x + 1, y + 1, rx + 1, rx * 0.45, (xx, yy) => (bay(xx, yy) > 0.4 ? grass[0] : undefined))
      b.disc(x, y, rx, rx * 0.7, (xx, yy) => tone(stone, 3.4 - (xx - x + yy - y + rx) / rx, xx, yy))
    }
    // A few trees at mid depth on an open field or by the camp.
    if (setting === 'field' || setting === 'camp') {
      const leaf = ramp(...PAL.leaf)
      for (const [tx, ty, sz] of setting === 'field'
        ? ([
            [20, 64, 1],
            [238, 63, 0.9],
            [70, 61, 0.7],
          ] as const)
        : ([[28, 64, 1]] as const)) {
        b.rect(tx - 1, ty - 8 * sz, 2, 8 * sz, (x) => (x === tx - 1 ? WOOD[2] : WOOD[1]))
        for (let k = 0; k < 5; k++) {
          const ox = (hash(k, 1, tx) - 0.5) * 10 * sz
          const oy = -10 * sz - hash(k, 2, tx) * 8 * sz
          const r = (4 + hash(k, 3, tx) * 3) * sz
          b.disc(tx + ox, ty + oy, r, r * 0.85, (x, y) => tone(leaf, 3.4 - ((x - tx - ox) + (y - ty - oy)) / r - (k === 0 ? 0.6 : 0), x, y))
        }
        b.disc(tx + 1, ty + 1, 7 * sz, 1.5, (x, y) => (bay(x, y) > 0.4 ? grass[0] : undefined))
      }
    }
  })
}

// The palace wall on the defenders' side: a round tower, a crenellated curtain, a gate with oak doors.
const GATE = { x0: 222, x1: 238, top: 48 }
function castleLayer() {
  return bake('battle-castle', W, H, (b) => {
    const stone = ramp(...PAL.stone)
    const block = (x: number, y: number, base: number) => {
      const r = Math.floor(y / 4)
      const jx = (x + r * 3) % 7 === 0
      const jy = y % 4 === 0
      if (jx || jy) return stone[Math.max(0, Math.round(base) - 2)]
      return tone(stone, base + (hash(Math.floor((x + r * 3) / 7), r, 5) - 0.5) * 0.9, x, y)
    }
    // Curtain wall.
    for (let y = 25; y < BASE; y++)
      for (let x = 212; x < W; x++) {
        if (y < 30 && (x - 212) % 7 >= 4) continue
        let base = 2.6 + noise2(x / 9, y / 9, 3) * 0.6
        if (y >= 30 && y <= 31) base = 4.2
        if (y >= 32 && y <= 33) base = (x - 212) % 7 < 2 ? 1.2 : 2.1
        if (y < 30) base = (x - 212) % 7 === 0 ? 3.8 : 3
        b.set(x, y, block(x, y, base))
      }
    // The gate: a stone arch with oak doors and iron bands.
    for (let y = GATE.top - 2; y < BASE; y++)
      for (let x = GATE.x0 - 2; x < GATE.x1 + 2; x++) {
        const cx = (GATE.x0 + GATE.x1) / 2
        const r = (GATE.x1 - GATE.x0) / 2
        const ay = GATE.top + r
        const inside = y >= ay ? Math.abs(x + 0.5 - cx) < r : Math.hypot(x + 0.5 - cx, (y + 0.5 - ay) * 1.6) < r
        const ring = y >= ay ? Math.abs(x + 0.5 - cx) < r + 2 : Math.hypot(x + 0.5 - cx, (y + 0.5 - ay) * 1.6) < r + 2.5
        if (inside) {
          const plank = Math.floor((x - GATE.x0) / 3)
          let c = tone(WOOD, 2.6 + (hash(plank, 0, 9) - 0.5) * 0.8 - ((x - GATE.x0) % 3 === 2 ? 0.8 : 0) - (y - GATE.top) / 60, x, y)
          if ((x - GATE.x0) % 3 === 0) c = WOOD[1]
          if (y === 56 || y === 64) c = (x - GATE.x0) % 4 === 1 ? IRON[4] : IRON[1]
          if (Math.abs(x + 0.5 - cx) < 0.6) c = rgb(INK)
          b.set(x, y, c)
        } else if (ring) b.set(x, y, tone(stone, 4 - (Math.floor(Math.atan2(y - ay, x - cx) * 3) & 1) * 0.8, x, y))
      }
    // The round tower.
    const t0 = 188
    const t1 = 212
    for (let y = 9; y < BASE; y++) {
      const batter = y > BASE - 7 ? Math.round((y - (BASE - 7)) / 2) : 0
      for (let x = t0 - batter; x < t1 + batter; x++) {
        if (y < 14 && (x - t0) % 7 >= 4) continue
        const u = (x - t0) / (t1 - t0)
        const light = 1 - Math.min(1, Math.abs(u - 0.3) * 1.7)
        const base = y < 14 ? 2 + light * 2.2 : y <= 15 ? 4.4 * (0.5 + light * 0.5) : 1 + light * 3.2 + noise2(x / 6, y / 8, 4) * 0.5
        b.set(x, y, block(x, y, base))
      }
    }
    for (const sy of [26, 44]) {
      b.rect(199, sy, 1, 5, rgb(INK))
      b.set(199, sy + 5, stone[4])
    }
    // Moss and grime at the foot; the shadow on the ground.
    for (let y = BASE - 7; y < BASE; y++)
      for (let x = 186; x < W; x++) {
        if (!(b.get(x, y) >>> 24)) continue
        if (noise2(x / 5, y / 3, 8) * ((y - BASE + 8) / 7) > 0.45) b.dot(x, y, rgb(PAL.grass[1]), 0.7)
      }
    for (let y = BASE; y < BASE + 3; y++) for (let x = 184; x < W; x++) b.dot(x, y, rgb(PAL.grass[0]), 0.6 - (y - BASE) * 0.2)
  })
}

const merlonGaps = [217, 224, 231, 238, 245, 252]

function palisadeLayer() {
  return bake('battle-palisade', W, H, (b) => {
    const gate = { x0: 216, x1: 232 }
    for (let sx = 198; sx < W; sx += 3) {
      if (sx + 2 >= gate.x0 && sx <= gate.x1) continue
      const h = 21 + Math.floor(hash(sx, 1, 4) * 5)
      const top = BASE - h
      for (let y = top; y < BASE; y++)
        for (let i = 0; i < 3; i++) {
          if (y === top && i !== 1) continue
          let c = WOOD[i === 0 ? 4 : i === 1 ? 3 : 2]
          if (hash(sx + i, y, 6) > 0.9) c = WOOD[1]
          if (y > BASE - 4) c = mixWord(c, rgb(PAL.dirt[1]), 0.5)
          b.set(sx + i, y, c)
        }
    }
    for (const by of [BASE - 8, BASE - 17]) for (let x = 198; x < W; x++) if (x < gate.x0 || x > gate.x1) b.set(x, by, x % 3 === 0 ? WOOD[3] : WOOD[1])
    // The gate: posts, a lintel, plank doors with a brace.
    for (const px of [gate.x0 - 2, gate.x1]) b.rect(px, BASE - 28, 3, 28, (x) => WOOD[x === px ? 4 : x === px + 1 ? 3 : 1])
    b.rect(gate.x0 - 3, BASE - 22, gate.x1 - gate.x0 + 7, 2, (_x, y) => (y === BASE - 22 ? WOOD[4] : WOOD[2]))
    for (let y = BASE - 18; y < BASE; y++)
      for (let x = gate.x0 + 1; x < gate.x1; x++) b.set(x, y, (x - gate.x0) % 3 === 0 ? WOOD[1] : WOOD[(x - gate.x0) % 3 === 1 ? 3 : 2])
    b.line(gate.x0 + 1, BASE - 2, gate.x1 - 1, BASE - 16, WOOD[4])
    b.rect(gate.x0 + 1, BASE - 15, gate.x1 - gate.x0 - 1, 1, WOOD[0])
    b.rect(gate.x0 + 1, BASE - 5, gate.x1 - gate.x0 - 1, 1, WOOD[0])
    for (let y = BASE; y < BASE + 3; y++) for (let x = 196; x < W; x++) b.dot(x, y, rgb(PAL.grass[0]), 0.6 - (y - BASE) * 0.2)
  })
}

// Houses of a town without walls: half-timbered fronts, tiled and thatched roofs. Windows and chimneys for the frame.
const HOUSES = [
  { x: 190, base: 64, w: 18, h: 13, roof: 'thatch' },
  { x: 232, base: 63, w: 22, h: 15, roof: 'tile' },
  { x: 208, base: 70, w: 22, h: 14, roof: 'tile' },
  { x: 238, base: 72, w: 18, h: 11, roof: 'thatch' },
] as const
const houseWindows = HOUSES.flatMap((h) => [
  [h.x + 3, h.base - h.h + 4],
  [h.x + h.w - 5, h.base - h.h + 4],
])
const chimneys = HOUSES.filter((h) => h.roof === 'tile').map((h) => [h.x + h.w - 6, h.base - h.h - 8] as const)

function townLayer() {
  return bake('battle-town', W, H, (b) => {
    const plaster = ramp(...PAL.white)
    const red = ramp(...PAL.red)
    const wheat = ramp(...PAL.wheat)
    for (const h of HOUSES) {
      const top = h.base - h.h
      for (let y = top; y < h.base; y++)
        for (let x = h.x; x < h.x + h.w; x++) {
          const rel = x - h.x
          let c = tone(plaster, 2.4 - (rel / h.w) * 0.8 + (hash(x, y, 2) > 0.9 ? -0.6 : 0), x, y)
          if (rel % 6 === 0 || rel === h.w - 1 || y === top || y === h.base - 1 || y === top + Math.floor(h.h / 2)) c = WOOD[1]
          const half = Math.floor(h.h / 2)
          if (rel % 6 !== 0 && y - top < half && Math.abs((rel % 6) - ((y - top) / half) * 6) < 0.7) c = WOOD[1]
          b.set(x, y, c)
        }
      // Door and windows.
      const dx = h.x + Math.floor(h.w / 2) - 2
      b.rect(dx, h.base - 6, 4, 6, (x) => (x === dx ? WOOD[1] : WOOD[2]))
      for (const [wx, wy] of [
        [h.x + 3, top + 4],
        [h.x + h.w - 5, top + 4],
      ]) {
        b.rect(wx - 1, wy - 1, 4, 4, WOOD[1])
        b.rect(wx, wy, 2, 2, rgb(0x1c2030))
      }
      // The roof.
      for (let k = 0; k < 9; k++) {
        const y = top - 1 - k
        const x0 = Math.round(h.x - 2 + k * 1.1)
        const x1 = Math.round(h.x + h.w + 1 - k * 1.1)
        for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1
          const c =
            h.roof === 'tile'
              ? tone(red, (k % 2 === 0 ? 2.6 : 1.8) + ((x + (k >> 1) * 2) % 4 === 0 ? -0.8 : 0) - (edge ? 1 : 0) + (x - x0 < (x1 - x0) / 2 ? 0.4 : -0.2), x, y)
              : tone(wheat, 2.4 + ((x * 3 + k) % 4 === 0 ? -1 : 0) - (edge ? 1 : 0) + (x - x0 < (x1 - x0) / 2 ? 0.4 : -0.4) - (k === 0 ? 1 : 0), x, y)
          b.set(x, y, c)
        }
      }
      if (h.roof === 'tile') b.rect(h.x + h.w - 7, top - 9, 3, 5, (x) => (x === h.x + h.w - 7 ? rgb(PAL.stone[4]) : rgb(PAL.stone[2])))
      for (let x = h.x - 2; x < h.x + h.w + 3; x++) b.dot(x, h.base, rgb(PAL.grass[0]), 0.6)
    }
  })
}

function campLayer() {
  return bake('battle-camp', W, H, (b) => {
    const canvas = ramp(...PAL.white)
    const red = ramp(...PAL.red)
    // The pavilion.
    const cx = 228
    for (let y = BASE - 24; y < BASE; y++) {
      const half = Math.round(((y - (BASE - 24)) / 24) * 14 + (y > BASE - 8 ? 1 : 0))
      for (let x = cx - half; x <= cx + half; x++) {
        const stripe = Math.floor((x - cx + 40) / 4) % 2 === 0
        const lit = x < cx ? 0.5 : -0.4
        let c = stripe ? tone(red, 2.2 + lit, x, y) : tone(canvas, 2.2 + lit, x, y)
        if (y > BASE - 10 && Math.abs(x - cx) < (y - (BASE - 10)) * 0.4) c = rgb(0x1c1418)
        b.set(x, y, c)
      }
    }
    b.rect(cx - 15, BASE - 9, 31, 1, rgb(PAL.gold[2]))
    // Small tents.
    for (const [tx, base, w] of [
      [198, 66, 9],
      [250, 65, 8],
    ] as const)
      for (let y = base - w; y < base; y++) {
        const half = y - (base - w)
        for (let x = tx - half; x <= tx + half; x++) b.set(x, y, tone(canvas, x < tx ? 2.6 : 1.4, x, y))
        b.set(tx, y, y > base - 4 ? rgb(0x1c1418) : canvas[0])
      }
    for (let y = BASE; y < BASE + 3; y++) for (let x = 190; x < W; x++) b.dot(x, y, rgb(PAL.grass[0]), 0.5 - (y - BASE) * 0.2)
  })
}

// ---- The scene ---------------------------------------------------------------------------------------------------------

interface Fig {
  kind: Kind
  order: number // dies when the side's living count drops to it or below
  x: number
  y: number
  alive: boolean
  diedAt: number
  fromY: number
  toY: number
  phase: number
  wall: boolean
  moving: boolean
  gone: boolean
  rank: number
}
interface SideState {
  key: string
  figs: Fig[]
  machines: { x: number; y: number; last: number }[]
}
interface Shot {
  kind: 'arrow' | 'stone'
  x0: number
  y0: number
  x1: number
  y1: number
  at: number
  dur: number
  peak: number
  wall: boolean
}

// Figures for a side, and which kind each is (largest remainder over the army's mix; catapults are machines).
function figuresFor(side: SceneSide, seed: number, s: number): Kind[] {
  const n = side.start <= 0 ? 0 : Math.min(MAX_FIGURES, Math.max(1, Math.ceil(side.start / 2)))
  if (side.rabble) return Array.from({ length: n }, () => 'rabble')
  const mix: [Kind, number][] = side.units
    ? [
        ['spear', side.units.spear ?? 0],
        ['archer', side.units.archer ?? 0],
        ['shield', side.units.shield ?? 0],
        ['cavalry', side.units.cavalry ?? 0],
      ]
    : [
        ['spear', side.archers ? 2 : 1],
        ['archer', side.archers ? 1 : 0],
      ]
  const total = mix.reduce((a, [, v]) => a + v, 0) || 1
  const counts = mix.map(([k, v]) => ({ k, c: Math.floor((v / total) * n), r: ((v / total) * n) % 1 }))
  let left = n - counts.reduce((a, c) => a + c.c, 0)
  for (const c of [...counts].sort((a, b) => b.r - a.r)) {
    if (left <= 0) break
    c.c++
    left--
  }
  const kinds = counts.flatMap(({ k, c }) => Array.from({ length: c }, () => k))
  if (kinds.length === 0) return Array.from({ length: n }, () => 'spear')
  // A stable shuffle so the dying are spread over the kinds.
  return kinds.map((k, i) => ({ k, h: hash(i, seed, s) })).sort((a, b) => a.h - b.h).map((e) => e.k)
}

const GROUP: Record<Kind, number> = { cavalry: 0, spear: 1, shield: 1, rabble: 1, king: 1, bearer: 1, archer: 2 }

export function BattleScene({
  attackers,
  defenders,
  setting,
  round,
  over,
  winner,
  seed = 0,
}: {
  attackers: SceneSide
  defenders: SceneSide
  setting: SceneSetting
  round: number
  over: boolean
  winner: 'attackers' | 'defenders'
  seed?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const props = useRef({ attackers, defenders, setting, round, over, winner, seed })
  props.current = { attackers, defenders, setting, round, over, winner, seed }

  useEffect(() => {
    const found = canvas.current?.getContext('2d')
    if (!found) return
    const ctx: CanvasRenderingContext2D = found
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const phase = phaseNow()
    const fx = new Fx()
    const sides: [SideState, SideState] = [
      { key: '', figs: [], machines: [] },
      { key: '', figs: [], machines: [] },
    ]
    let shots: Shot[] = []
    let stuck: { x: number; y: number; dx: number }[] = []
    let cracks: { x: number; y: number }[] = []
    let lastRound = -1
    let overAt = 0
    let frame = 0
    let timer = 0
    let last = performance.now()
    let first = true
    let snap = true

    const draw = (nowMs: number) => {
      const p = props.current
      const dt = Math.min(0.05, (nowMs - last) / 1000)
      last = nowMs
      const t = still ? 0 : nowMs / 1000
      const fighting = p.round > 0 && !p.over
      const walls = p.setting === 'castle' || p.setting === 'palisade'
      const cx = clashX(p.setting)
      if (p.over && !overAt) overAt = t
      if (!p.over) overAt = 0
      const sinceOver = p.over ? t - overAt : 0

      // A new round: the lines crash together.
      if (p.round !== lastRound) {
        if (lastRound >= 0 && p.round > 0 && !still) {
          fx.burst(cx, 82, 24, { colors: ['#c8b08a', '#a8906a', '#8a7458'], speed: [10, 34], angle: [Math.PI, Math.PI * 2], gravity: 20, life: [0.6, 1.2], spread: 24, size: [1, 3] })
          fx.burst(cx, 78, 10, { colors: ['#fffbe0', '#faa630', '#e8661a'], speed: [30, 70], life: [0.2, 0.5], gravity: 160 })
          fx.shake(1.5, 0.3)
        }
        lastRound = p.round
      }

      // Build or rebuild each side's figures when its make-up changes.
      ;[p.attackers, p.defenders].forEach((side, si) => {
        const st = sides[si]
        const kinds = figuresFor(side, p.seed, si)
        const key = `${kinds.join(',')}|${side.king ? 1 : 0}|${side.color}|${p.setting}`
        if (st.key === key) return
        st.key = key
        st.figs = kinds.map((kind, i) => ({
          kind,
          order: Math.floor(hash(i, p.seed + 3, si) * 1e6),
          x: si === 0 ? -20 : W + 20,
          y: 72 + (i % 4) * 6,
          alive: true,
          diedAt: -1e9,
          fromY: 0,
          toY: 0,
          phase: hash(i, 9, si),
          wall: false,
          moving: false,
          gone: false,
          rank: 0,
        }))
        // Death order: rank by the hashed order (highest dies first).
        const ranks = [...st.figs].sort((a, b) => a.order - b.order)
        ranks.forEach((f, r) => (f.order = r))
        const machines = side.catapults ? Math.min(2, Math.max(1, Math.round((side.units?.catapult ?? 2) / 2))) : 0
        st.machines = Array.from({ length: machines }, (_, k) => ({ x: si === 0 ? 20 + k * 24 : W - 20 - k * 24, y: 76 + k * 12, last: -1 }))
        first = true
        snap = true
      })

      ctx.fillStyle = '#14101a'
      ctx.fillRect(0, 0, W, H)
      fx.update(still ? 0 : dt)
      const [ox, oy] = fx.offset()
      ctx.save()
      ctx.translate(ox, oy)

      // Sky, clouds, mountains and hills (swaying a little against the field), the ground.
      const sway = still ? 0 : Math.sin(t * 0.12) * 2
      ctx.drawImage(skyLayer(phase), 0, 0)
      const cloudLight = phase === 'night' ? 0x4a5a7a : phase === 'dusk' ? 0xf2b4a0 : phase === 'dawn' ? 0xf8dcd0 : 0xf4f6f8
      const cloudShade = phase === 'night' ? 0x34405a : phase === 'dusk' ? 0xb07890 : phase === 'dawn' ? 0xc8b0c0 : 0xc4d0dc
      const clouds = cloudLayer(`battle-clouds-${phase}`, 512, 40, rgb(cloudLight), rgb(cloudShade), 41, 5)
      const cx0 = -((t * 2) % 512)
      ctx.drawImage(clouds, Math.round(cx0), 2)
      ctx.drawImage(clouds, Math.round(cx0) + 512, 2)
      ctx.drawImage(mountainLayer(phase), Math.round(-4 + sway), 0)
      ctx.drawImage(hillLayer(phase), Math.round(-4 + sway * 2), 0)
      ctx.drawImage(groundLayer(p.setting, phase, p.seed), 0, 0)
      if (phase === 'day' || phase === 'dawn') birds(ctx, t, 5, '#2a2030', 3, 10)

      // Where each figure should be.
      const attackersWon = p.over && p.winner === 'attackers'
      const fronts = [cx - 8, p.setting === 'field' ? cx + 8 : walls ? 198 : cx + 10]
      const wallFeet = p.setting === 'castle' ? 35 : 56
      const wallSlots = p.setting === 'castle' ? merlonGaps.slice(0, 5) : [204, 210, 238, 244, 250]
      const bearers: { x: number; y: number; dir: number; color: string; king: boolean; won: boolean; lost: boolean }[] = []

      sides.forEach((st, si) => {
        const side = si === 0 ? p.attackers : p.defenders
        const dir = si === 0 ? 1 : -1
        const total = st.figs.length
        const aliveN = side.soldiers <= 0 || side.start <= 0 ? 0 : Math.min(total, Math.max(1, Math.round((total * side.soldiers) / side.start)))
        const won = p.over && (si === 0) === attackersWon
        const lost = p.over && !won
        // The fallen.
        for (const f of st.figs) {
          const alive = f.order < aliveN
          if (f.alive && !alive) {
            f.alive = false
            if (first) {
              // Already down when the view opened: lying where the lines met.
              f.x = fronts[si] - dir * (4 + hash(f.order, 1, si + p.seed) * 26)
              f.diedAt = -1e9
              f.fromY = f.toY = 72 + hash(f.order, 2, si) * 24
            } else {
              f.diedAt = t
              f.fromY = f.y
              f.toY = f.wall ? 72 + hash(f.order, 2, si) * 10 : f.y
              if (!still) {
                fx.burst(f.x, f.y - 6, 6, { colors: ['#fffbe0', '#ec7a5a', '#a8342e'], speed: [15, 40], life: [0.2, 0.5], gravity: 140 })
                fx.burst(f.x, f.toY, 5, { colors: ['#c8b08a', '#a8906a'], speed: [6, 18], angle: [Math.PI, Math.PI * 2], gravity: 10, life: [0.5, 0.9], size: [1, 2] })
              }
            }
          } else if (!f.alive && alive) f.alive = true
        }
        const living = st.figs.filter((f) => f.alive).sort((a, b) => GROUP[a.kind] - GROUP[b.kind] || a.order - b.order)
        // The defenders' best shots man the walls.
        const onWall = new Set<Fig>()
        if (si === 1 && walls) {
          const pick = [...living].sort((a, b) => (a.kind === 'archer' ? 0 : 1) - (b.kind === 'archer' ? 0 : 1)).slice(0, Math.min(wallSlots.length, Math.ceil(living.length / 2)))
          pick.forEach((f) => onWall.add(f))
        }
        const ground = living.filter((f) => !onWall.has(f))
        const back = p.round === 0 && !p.over ? 30 : 0
        let melee = 0
        ground.forEach((f, j) => {
          const archer = f.kind === 'archer'
          const rank = Math.floor(j / 4)
          const file = j % 4
          if (!archer) melee = rank + 1
          let tx = fronts[si] - dir * (back + rank * 10 + (file % 2) * 4 + (archer ? 8 : 0))
          const ty = 72 + file * 7 + (rank % 2) * 2
          if (lost) tx = fronts[si] - dir * (40 + sinceOver * 26 + rank * 10)
          f.wall = false
          step(f, tx, ty, f.kind === 'cavalry' ? 34 : 22)
          f.rank = rank
        })
        let k = 0
        for (const f of onWall) {
          f.wall = true
          f.x = wallSlots[k++]
          f.y = wallFeet
          f.moving = false
          f.gone = lost && sinceOver > 0.4
        }
        for (const f of ground) f.gone = lost && (f.x < -16 || f.x > W + 16)
        // The banner behind the line (the king's beside it).
        if (living.length > 0) {
          const bx = fronts[si] - dir * (back + melee * 10 + 2) - (lost ? dir * (40 + sinceOver * 26) : 0)
          bearers.push({ x: Math.round(bx), y: 70, dir, color: side.color, king: !!side.king, won, lost })
        }
      })
      first = false
      snap = false

      function step(f: Fig, tx: number, ty: number, speed: number) {
        const dx = tx - f.x
        const dy = ty - f.y
        const d = Math.hypot(dx, dy)
        const max = speed * (still || snap ? 1e6 : dt)
        if (d <= max || d < 0.3) {
          f.x = tx
          f.y = ty
          f.moving = false
        } else {
          f.x += (dx / d) * max
          f.y += (dy / d) * max
          f.moving = d > 1
          if (!still && Math.random() < dt * 4) fx.burst(f.x, f.y, 1, { colors: ['#a8906a', '#8a7458'], speed: [3, 8], angle: [Math.PI, Math.PI * 2], gravity: 0, life: [0.3, 0.6], size: [1, 2] })
        }
      }

      // Which frame each figure shows, and the strikes and volleys it starts.
      const frameOf = (f: Fig, si: number): { frame: number; lunge: number; jump: number; facing: number } => {
        const dir = si === 0 ? 1 : -1
        const won = p.over && (si === 0) === attackersWon
        const lost = p.over && !won
        if (lost && !f.wall) return { frame: Math.floor(t * 8 + f.phase * 4) % 4, lunge: 0, jump: 0, facing: -dir }
        if (won) {
          const up = Math.floor(t * 3 + f.phase * 3) % 2 === 0
          return { frame: up ? 7 : 4, lunge: 0, jump: up ? -1 : 0, facing: dir }
        }
        if (f.moving) return { frame: Math.floor(t * (f.kind === 'cavalry' ? 10 : 8) + f.phase * 4) % 4, lunge: 0, jump: 0, facing: dir }
        if (!fighting || still) return { frame: 4, lunge: 0, jump: 0, facing: dir }
        const rank = f.rank
        if (f.kind === 'archer' || f.wall) {
          const period = 2.2
          const c = (t / period + si * 0.37 + f.phase * 0.18) % 1
          const prev = ((t - dt) / period + si * 0.37 + f.phase * 0.18) % 1
          if (c >= 0.9 && prev < 0.9) loose(f, si)
          return { frame: c < 0.55 ? 4 : c < 0.9 ? 5 : 6, lunge: 0, jump: 0, facing: dir }
        }
        if (rank <= (f.kind === 'cavalry' ? 1 : 0) || (rank === 1 && f.phase > 0.6)) {
          const speed = f.kind === 'cavalry' ? 0.7 : 1.1
          const c = (t * speed + f.phase) % 1
          const prev = ((t - dt) * speed + f.phase) % 1
          if (c >= 0.62 && prev < 0.62) {
            const sx = f.x + dir * (f.kind === 'cavalry' ? 12 : 9)
            const sy = f.y - (f.kind === 'cavalry' ? 13 : 8)
            if (hash(Math.floor(t * 10), f.order, si) > 0.35) fx.burst(sx, sy, 4, { colors: ['#fffbe0', '#faa630', '#e8661a'], speed: [20, 50], life: [0.15, 0.35], gravity: 150 })
            fx.burst(f.x + dir * 4, f.y, 2, { colors: ['#c8b08a', '#a8906a'], speed: [4, 12], angle: [Math.PI, Math.PI * 2], gravity: 0, life: [0.4, 0.8], size: [1, 2] })
          }
          if (f.kind === 'cavalry') {
            const charge = Math.sin(c * Math.PI * 2) * 6
            return { frame: c > 0.5 && c < 0.75 ? 6 : Math.floor(t * 10 + f.phase * 4) % 4, lunge: charge, jump: 0, facing: dir }
          }
          return { frame: c < 0.45 ? 4 : c < 0.62 ? 5 : c < 0.8 ? 6 : 4, lunge: c >= 0.62 && c < 0.8 ? 2 : c >= 0.45 && c < 0.62 ? -1 : 0, jump: 0, facing: dir }
        }
        // Waiting ranks shift their feet now and then.
        const shuffle = hash(Math.floor(t * 0.8 + f.phase * 5), f.order, si) > 0.8
        return { frame: shuffle ? Math.floor(t * 6) % 4 : 4, lunge: 0, jump: 0, facing: dir }
      }

      function loose(f: Fig, si: number) {
        if (shots.length > 50) return
        const dir = si === 0 ? 1 : -1
        const foes = sides[1 - si].figs.filter((g) => g.alive && !g.gone)
        let x1: number
        let y1: number
        let wall = false
        if (si === 0 && walls && (foes.length === 0 || hash(Math.floor(t * 7), f.order, 3) > 0.45)) {
          x1 = 200 + hash(Math.floor(t * 13), f.order, 4) * 50
          y1 = p.setting === 'castle' ? 28 + hash(Math.floor(t * 11), f.order, 5) * 30 : 48 + hash(Math.floor(t * 11), f.order, 5) * 16
          wall = true
        } else if (foes.length) {
          const g = foes[Math.floor(hash(Math.floor(t * 17), f.order, 6) * foes.length)]
          x1 = g.x + (hash(Math.floor(t * 19), f.order, 7) - 0.5) * 14
          y1 = g.wall ? g.y - 6 : g.y + (hash(Math.floor(t * 23), f.order, 8) - 0.5) * 6
          wall = g.wall
        } else return
        const x0 = f.x + dir * 5
        const y0 = f.y - 10
        const dist = Math.abs(x1 - x0)
        shots.push({ kind: 'arrow', x0, y0, x1, y1, at: t, dur: 0.6 + dist / 160, peak: 10 + dist * 0.18, wall })
      }

      // Catapults hurl stones.
      sides.forEach((st, si) => {
        st.machines.forEach((m, k) => {
          if (!fighting || still) return
          const c = (t / 3.4 + k * 0.41 + si * 0.2) % 1
          const prev = ((t - dt) / 3.4 + k * 0.41 + si * 0.2) % 1
          if (c >= 0.1 && prev < 0.1) {
            let x1: number
            let y1: number
            let wall = false
            if (si === 0 && walls) {
              x1 = 196 + hash(Math.floor(t), k, 11) * 50
              y1 = p.setting === 'castle' ? 30 + hash(Math.floor(t), k, 12) * 32 : 50 + hash(Math.floor(t), k, 12) * 16
              wall = true
            } else {
              const foes = sides[1 - si].figs.filter((g) => g.alive && !g.wall)
              const g = foes[Math.floor(hash(Math.floor(t), k, 13) * foes.length)]
              x1 = g ? g.x : si === 0 ? cx + 30 : cx - 30
              y1 = g ? g.y : 84
            }
            const dir = si === 0 ? 1 : -1
            shots.push({ kind: 'stone', x0: m.x + dir * 6, y0: m.y - 16, x1, y1, at: t, dur: 1.3, peak: 34, wall })
          }
        })
      })

      // The wall and the men on it (behind the merlons), or the town or camp.
      const defenderSheet = sheetOf(p.defenders.color)
      const blit = (sheet: [HTMLCanvasElement, HTMLCanvasElement], kind: Kind, fr: number, x: number, y: number, facing: number) => {
        const row = KINDS.indexOf(kind)
        const img = facing > 0 ? sheet[0] : sheet[1]
        const dx = facing > 0 ? x - FX : x - (CW - 1 - FX)
        ctx.drawImage(img, fr * CW, row * CH, CW, CH, Math.round(dx), Math.round(y - FY), CW, CH)
      }
      if (walls) {
        for (const f of sides[1].figs) {
          if (!f.wall || !f.alive || f.gone) continue
          const { frame: fr, jump } = frameOf(f, 1)
          blit(defenderSheet, f.kind === 'cavalry' ? 'spear' : f.kind, fr, f.x, f.y + jump, -1)
        }
      }
      const fallenTo = attackersWon
      if (p.setting === 'castle') {
        ctx.drawImage(castleLayer(), 0, 0)
        for (const c of cracks) {
          box(ctx, '#2a2834', c.x, c.y, 2, 1)
          box(ctx, '#2a2834', c.x + 1, c.y + 1, 1, 2)
          box(ctx, '#44424e', c.x - 1, c.y + 1, 1, 1)
        }
        if (fallenTo && sinceOver > 0.5) {
          // The gate broken open.
          box(ctx, '#14101a', GATE.x0 + 1, GATE.top + 6, GATE.x1 - GATE.x0 - 2, BASE - GATE.top - 6)
          checker(ctx, '#2a1a12', GATE.x0 + 1, BASE - 8, GATE.x1 - GATE.x0 - 2, 8)
        }
        // Banners hanging from the wall, the flag on the tower (the victors' once it has fallen).
        for (const bx of [214, 246]) hanging(bx, 34, p.defenders.color)
        flag(200, 1, fallenTo && sinceOver > 0.8 ? p.attackers.color : p.defenders.color, false, 10, 9)
        torches([
          [219, 52],
          [241, 52],
        ])
      } else if (p.setting === 'palisade') {
        ctx.drawImage(palisadeLayer(), 0, 0)
        if (fallenTo && sinceOver > 0.5) box(ctx, '#1c1418', 217, BASE - 18, 15, 18)
        flag(249, 30, fallenTo && sinceOver > 0.8 ? p.attackers.color : p.defenders.color, false, 6, 16)
        torches([[213, BASE - 26]])
      } else if (p.setting === 'town') {
        ctx.drawImage(townLayer(), 0, 0)
        chimneys.forEach(([x, y], i) => !still && smoke(ctx, x + 1, y, t, 31 + i, '#b8b0a4', 4))
      } else if (p.setting === 'camp') {
        ctx.drawImage(campLayer(), 0, 0)
        flag(228, 37, p.defenders.color, false, 8, 9)
        campfire(206, 78)
      }

      // Fires and smoke behind the wall as the siege wears on.
      const fireSpots =
        p.setting === 'castle'
          ? [
              [248, 25],
              [216, 24],
              [228, 25],
            ]
          : p.setting === 'palisade'
            ? [
                [242, 48],
                [206, 49],
              ]
            : p.setting === 'town'
              ? [
                  [218, 50],
                  [240, 44],
                ]
              : []
      const fires = walls || p.setting === 'town' ? Math.min(fireSpots.length, Math.floor(p.round / 3) + (attackersWon ? 2 : 0)) : 0
      for (let i = 0; i < fires; i++) {
        const [fx0, fy0] = fireSpots[i]
        if (!still) smoke(ctx, fx0, fy0 - 4, t * 0.7, 61 + i, '#4a4448', 7)
        flames(fx0, fy0, 61 + i)
      }

      // Everyone on the ground, back to front: the fallen first, then the living, machines and banners.
      const sheetsOf = [sheetOf(p.attackers.color), defenderSheet]
      type Item = { y: number; draw: () => void }
      const items: Item[] = []
      sides.forEach((st, si) => {
        const dir = si === 0 ? 1 : -1
        for (const f of st.figs) {
          if (f.alive || f.gone) continue
          const age = t - f.diedAt
          const fall = Math.min(1, age / 0.45)
          const y = f.fromY + (f.toY - f.fromY) * fall * fall
          const kind = f.kind
          const lieY = Math.round(y)
          items.push({
            y: age > 0.3 ? lieY - 40 : lieY,
            draw: () => {
              if (age > 0.3) checker(ctx, '#14101a', f.x - 5, lieY - 1, 10, 2)
              blit(sheetsOf[si], kind, age < 0.3 ? 8 : 9, f.x + (f.wall ? dir * 6 * fall : 0), y, dir)
            },
          })
        }
        for (const f of st.figs) {
          if (!f.alive || f.gone || f.wall) continue
          const st2 = frameOf(f, si)
          const x = f.x + st2.lunge * dir
          items.push({
            y: f.y,
            draw: () => {
              checker(ctx, '#14101a', x - (f.kind === 'cavalry' ? 8 : 4), f.y - 1, f.kind === 'cavalry' ? 16 : 8, 2, Math.round(f.y) & 1)
              blit(sheetsOf[si], f.kind, st2.frame, x, f.y + st2.jump, st2.facing)
            },
          })
        }
        st.machines.forEach((m, k) => {
          items.push({ y: m.y, draw: () => catapult(m.x, m.y, si === 0 ? 1 : -1, k, si, si === 0 ? p.attackers.color : p.defenders.color) })
        })
      })
      for (const b of bearers) {
        items.push({
          y: b.y,
          draw: () => {
            const up = b.won && Math.floor(t * 3) % 2 === 0
            const walk = b.lost ? Math.floor(t * 8) % 4 : 4
            const facing = b.lost ? -b.dir : b.dir
            checker(ctx, '#14101a', b.x - 4, b.y - 1, 8, 2)
            blit(sheetsOf[b.dir > 0 ? 0 : 1], 'bearer', walk, b.x, b.y - (up ? 1 : 0), facing)
            flag(b.x + facing * 2, b.y - 26 - (up ? 1 : 0), b.king ? '#e8c44a' : b.color, b.king, 9)
            if (b.king) {
              const kx = b.x + b.dir * 6
              checker(ctx, '#14101a', kx - 4, b.y + 1, 8, 2)
              blit(sheetsOf[b.dir > 0 ? 0 : 1], 'king', b.won ? (up ? 7 : 4) : b.lost ? walk : 4, kx, b.y + 2 - (up ? 1 : 0), facing)
            }
          },
        })
      }
      items.sort((a, b) => a.y - b.y)
      for (const it of items) it.draw()

      // Arrows stuck in the ground, the shots in the air.
      for (const s of stuck) {
        box(ctx, '#6e4a2e', s.x, s.y - 1, 1, 1)
        box(ctx, '#936a40', s.x - s.dx, s.y - 2, 1, 1)
        box(ctx, '#eee6d2', s.x - s.dx * 2, s.y - 3, 1, 1)
      }
      const keep: Shot[] = []
      for (const s of shots) {
        const k = (t - s.at) / s.dur
        if (k >= 1) {
          land(s)
          continue
        }
        keep.push(s)
        const pos = (q: number) => [s.x0 + (s.x1 - s.x0) * q, s.y0 + (s.y1 - s.y0) * q - s.peak * 4 * q * (1 - q)] as const
        const [x, y] = pos(k)
        if (s.kind === 'arrow') {
          const [x2, y2] = pos(Math.min(1, k + 0.04))
          const len = Math.hypot(x2 - x, y2 - y) || 1
          const ux = (x2 - x) / len
          const uy = (y2 - y) / len
          box(ctx, '#d0d0dc', x + ux, y + uy)
          box(ctx, '#b48a58', x, y)
          box(ctx, '#b48a58', x - ux, y - uy)
          box(ctx, '#fffaf0', x - ux * 2, y - uy * 2)
        } else {
          checker(ctx, '#8a8478', x - 3 - (s.x1 > s.x0 ? 3 : -3), y - 1, 4, 3)
          box(ctx, '#14101a', x - 2, y - 1, 4, 3)
          box(ctx, '#14101a', x - 1, y - 2, 2, 5)
          box(ctx, '#85818a', x - 1, y - 1, 2, 3)
          box(ctx, '#63606a', x, y, 2, 1)
          box(ctx, '#cac6c0', x - 1, y - 1, 1, 1)
        }
      }
      shots = keep

      function land(s: Shot) {
        if (still) return
        if (s.kind === 'arrow') {
          if (!s.wall && s.y1 > HORIZON + 8) {
            stuck.push({ x: Math.round(s.x1), y: Math.round(s.y1), dx: s.x1 > s.x0 ? 1 : -1 })
            if (stuck.length > 60) stuck = stuck.slice(-60)
          }
          fx.burst(s.x1, s.y1, 2, { colors: s.wall ? ['#a8a4a6', '#63606a'] : ['#a8906a', '#8a7458'], speed: [6, 18], angle: [Math.PI, Math.PI * 2], gravity: 60, life: [0.2, 0.4] })
          return
        }
        fx.burst(s.x1, s.y1, 14, { colors: s.wall ? ['#cac6c0', '#a8a4a6', '#85818a', '#63606a'] : ['#a8906a', '#8a7458', '#6a4a2e'], speed: [20, 60], life: [0.4, 0.9], gravity: 180, size: [1, 3], floor: s.wall ? BASE + 4 : s.y1 + 2 })
        fx.burst(s.x1, s.y1, 10, { colors: ['#e8e0d0', '#c8b8a0', '#a8987e'], speed: [6, 20], gravity: -8, life: [0.6, 1.2], size: [2, 3], spread: 6 })
        fx.shake(s.wall ? 1.5 : 1, 0.2)
        if (s.wall && p.setting === 'castle') {
          cracks.push({ x: Math.round(s.x1), y: Math.round(s.y1) })
          if (cracks.length > 16) cracks = cracks.slice(-16)
        }
      }

      // Dust over the melee while it lasts.
      if (fighting && !still && Math.random() < dt * 6)
        fx.burst(cx + (Math.random() - 0.5) * 30, 76 + Math.random() * 18, 1, { colors: ['#d8c4a0', '#c8b08a', '#a8906a'], speed: [2, 6], angle: [-Math.PI * 0.9, -Math.PI * 0.1], gravity: -4, life: [1, 1.8], size: [2, 3], drag: 0.5 })

      fx.drawParticles(ctx)

      // The hour's light over everything, then what glows.
      if (phase !== 'day') {
        ctx.globalAlpha = phase === 'night' ? 0.42 : phase === 'dusk' ? 0.16 : 0.1
        ctx.fillStyle = phase === 'night' ? '#0a1030' : phase === 'dusk' ? '#4a1a3a' : '#3a3a6a'
        ctx.fillRect(-4, -4, W + 8, H + 8)
        ctx.globalAlpha = 1
      }
      if (phase === 'night' || phase === 'dusk') {
        const glowAt = (x: number, y: number, r: number) => halo(ctx, '#faa630', x, y, r, phase === 'night' ? 0.5 : 0.3)
        for (let i = 0; i < fires; i++) glowAt(fireSpots[i][0], fireSpots[i][1], 12)
        if (p.setting === 'castle') {
          glowAt(219, 52, 7)
          glowAt(241, 52, 7)
        }
        if (p.setting === 'palisade') glowAt(213, BASE - 26, 7)
        if (p.setting === 'camp') glowAt(206, 76, 10)
        if (p.setting === 'town')
          for (const [x, y] of houseWindows) {
            box(ctx, '#f2d16b', x, y, 2, 2)
            halo(ctx, '#faa630', x + 1, y + 1, 4, 0.4)
          }
      }
      ctx.restore()

      // ---- Little helpers for the frame ----
      function flag(x: number, y: number, color: string, royal: boolean, len: number, pole = 24) {
        const T = Array.from(teamRamp(hexOf(color)), cssOf)
        box(ctx, '#2a1a12', x, y, 1, pole)
        box(ctx, '#c8952e', x, y - 1, 1, 1)
        for (let i = 0; i < len; i++) {
          const wv = still ? 0 : Math.sin(t * 6 - i * 0.7) * (i / len) * 1.6
          const slope = still ? 0 : Math.cos(t * 6 - i * 0.7)
          const hgt = 6 - (i > len - 3 && i % 2 ? 1 : 0)
          const c = slope > 0.4 ? T[3] : slope < -0.4 ? T[1] : T[2]
          box(ctx, '#14101a', x + 1 + i, y + Math.round(wv) - 1, 1, hgt + 2)
          box(ctx, c, x + 1 + i, y + Math.round(wv), 1, hgt)
        }
        // A device on it: a gold stripe, or the king's crown.
        const mid = Math.floor(len / 2)
        const my = y + Math.round(still ? 0 : Math.sin(t * 6 - mid * 0.7) * (mid / len) * 1.6)
        if (royal) {
          box(ctx, '#8e6216', x + mid - 1, my + 2, 3, 2)
          box(ctx, '#8e6216', x + mid - 1, my + 1, 1, 1)
          box(ctx, '#8e6216', x + mid + 1, my + 1, 1, 1)
          box(ctx, '#d0503c', x + mid, my + 2, 1, 1)
        } else box(ctx, '#f2d16b', x + mid, my + 1, 1, 4)
      }
      function hanging(x: number, y: number, color: string) {
        const T = Array.from(teamRamp(hexOf(color)), cssOf)
        box(ctx, '#2a1a12', x - 1, y - 1, 7, 1)
        for (let j = 0; j < 13; j++) {
          const sw = still ? 0 : Math.round(Math.sin(t * 2 + j * 0.3) * (j / 13) * 1.2)
          box(ctx, '#14101a', x - 1 + sw, y + j, 7, 1)
          box(ctx, j === 0 ? T[3] : T[2], x + sw, y + j, 5, 1)
          box(ctx, T[1], x + 4 + sw, y + j, 1, 1)
          if (j === 4 || j === 5) box(ctx, '#f2d16b', x + 2 + sw, y + j, 1, 1)
        }
        const sw = still ? 0 : Math.round(Math.sin(t * 2 + 4) * 1.2)
        box(ctx, '#14101a', x + sw, y + 13, 2, 2)
        box(ctx, '#14101a', x + 3 + sw, y + 13, 2, 2)
        box(ctx, T[2], x + sw, y + 13, 1, 1)
        box(ctx, T[2], x + 4 + sw, y + 13, 1, 1)
      }
      function flames(x: number, y: number, s: number) {
        for (let i = 0; i < 6; i++) {
          const h = 3 + hash(i, Math.floor(t * 10), s) * 5
          const fx0 = x - 3 + i
          box(ctx, '#b0300e', fx0, y - h, 1, h)
          box(ctx, '#faa630', fx0, y - h * 0.7, 1, h * 0.7)
          if (i > 1 && i < 4) box(ctx, '#ffe070', fx0, y - h * 0.4, 1, h * 0.4)
        }
      }
      function torches(list: number[][]) {
        for (const [x, y] of list) {
          box(ctx, '#2a1a12', x, y, 1, 4)
          const h = 2 + (still ? 1 : Math.floor(hash(x, Math.floor(t * 9), 2) * 2))
          box(ctx, '#e8661a', x - 1, y - h, 3, h)
          box(ctx, '#ffe070', x, y - h + 1, 1, h - 1)
        }
      }
      function campfire(x: number, y: number) {
        box(ctx, '#4a3020', x - 4, y, 9, 2)
        box(ctx, '#6e4a2e', x - 3, y - 1, 2, 2)
        box(ctx, '#6e4a2e', x + 2, y - 1, 2, 2)
        flames(x + 1, y, 9)
        if (!still) smoke(ctx, x, y - 8, t, 12, '#8a8478', 4)
      }
      function catapult(x: number, y: number, dir: number, k: number, si: number, color: string) {
        const c = still || !fighting ? 0.5 : (t / 3.4 + k * 0.41 + si * 0.2) % 1
        // The arm: cocked back, whipping forward at 0.1, winding back slowly.
        const a = c < 0.1 ? -2.4 + (c / 0.1) * 2.9 : c < 0.35 ? 0.5 : 0.5 - ((c - 0.35) / 0.65) * 2.9
        checker(ctx, '#14101a', x - 10, y - 1, 20, 2)
        // Frame and wheels.
        box(ctx, '#14101a', x - 10, y - 5, 21, 4)
        box(ctx, '#6e4a2e', x - 9, y - 4, 19, 2)
        box(ctx, '#936a40', x - 9, y - 4, 19, 1)
        pline(ctx, '#14101a', x - 4, y - 4, x, y - 13, 2)
        pline(ctx, '#14101a', x + 4, y - 4, x, y - 13, 2)
        pline(ctx, '#936a40', x - 4, y - 4, x, y - 12)
        pline(ctx, '#6e4a2e', x + 4, y - 4, x, y - 12)
        for (const wx of [x - 6, x + 6]) {
          box(ctx, '#14101a', wx - 2, y - 3, 5, 5)
          box(ctx, '#4a3020', wx - 1, y - 2, 3, 3)
          const sp = Math.floor(t * 4) % 2
          box(ctx, '#936a40', wx - 1 + sp * 2, y - 2, 1, 1)
          box(ctx, '#c8952e', wx, y - 1, 1, 1)
        }
        const len = 12
        const ex = x + Math.sin(a) * len * dir
        const ey = y - 12 - Math.cos(a) * len
        pline(ctx, '#14101a', x, y - 12, ex, ey, 2)
        pline(ctx, '#b48a58', x, y - 12, ex, ey)
        box(ctx, '#14101a', ex - 2, ey - 2, 4, 3)
        box(ctx, '#4a3020', ex - 1, ey - 1, 2, 1)
        if (c > 0.6 || c < 0.1) box(ctx, '#85818a', ex - 1, ey - 2, 2, 1)
        // The crew's pennant.
        const css = cssOf(teamRamp(hexOf(color))[2])
        box(ctx, '#2a1a12', x - dir * 9, y - 12, 1, 8)
        box(ctx, css, x - dir * 9 + (dir > 0 ? -4 : 1), y - 12 + (still ? 0 : Math.round(Math.sin(t * 5))), 4, 2)
      }

      if (!still) frame = requestAnimationFrame(draw)
      // Without motion, still redrawn now and then so the rounds show.
      else timer = window.setTimeout(() => (frame = requestAnimationFrame(draw)), 1000)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [])

  return <canvas ref={canvas} className="battle-scene" width={W} height={H} aria-hidden />
}
