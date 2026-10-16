import { ANVIL_LIMIT, ANVIL_TRAVEL, ANVIL_WINDOW, anvilGame } from '@game/shared'
import type { AnvilState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, box, checker, halo, hash, hudCombo, joint, limb, pline, ramp, rgb, text, tone } from './art'
import type { Scene } from './Stage'

// The anvil at the forge: inside the smithy at night, the furnace roaring at the back, tools on the wall, the smith's
// hammer over a bar of glowing iron; the marks slide along the bar to the hammer.

const HIT_X = 74
const BAR_Y = 98

function backdrop() {
  return bake('anvil-back', W, H, (b) => {
    // Stone walls in courses, lit warm from the furnace on the left.
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const course = Math.floor(y / 7)
        const off = course % 2 ? 6 : 0
        const joint = y % 7 === 0 || (x + off) % 13 === 0
        const lightness = Math.max(0, 1 - Math.hypot(x - 36, y - 70) / 150)
        const c = joint ? rgb(0x18121a) : tone(ramp(0x221a22, 0x302430, 0x40303a, 0x5a3e3a, 0x7a5040), 0.6 + lightness * 3.2 + (hash(Math.floor((x + off) / 13), course, 1) - 0.5) * 0.8, x, y)
        b.set(x, y, c)
      }
    // A window with the night outside.
    b.rect(170, 22, 22, 26, rgb(0x14101a))
    b.rect(172, 24, 18, 22, (x, y) => tone(ramp(0x0e1430, 0x1a2450, 0x2a3a6a), 2 - (y - 24) / 14, x, y))
    b.rect(180, 24, 2, 22, rgb(0x2a1a12))
    b.rect(172, 34, 18, 2, rgb(0x2a1a12))
    b.set(175, 27, rgb(0xfff4c0))
    b.set(186, 30, rgb(0xd8ecf2))
    // Tools hanging on pegs: tongs, hammers, a horseshoe.
    for (const [tx, len] of [
      [204, 22],
      [214, 18],
      [224, 24],
    ] as const) {
      b.rect(tx, 26, 2, 2, rgb(PAL.wood[3]))
      b.rect(tx, 28, 1, len, rgb(PAL.iron[3]))
      b.rect(tx - 2, 28 + len, 5, 3, rgb(PAL.iron[2]))
    }
    b.disc(240, 34, 5, 5, (_x, _y, d) => (d > 0.55 ? rgb(PAL.iron[3]) : undefined))
    // The furnace: a brick arch with the fire inside (the flames move, drawn each frame).
    b.rect(8, 40, 56, 66, (x, y) => tone(ramp(0x3a1a14, 0x5a2a1e, 0x7a3a24, 0x9a4a2a), 1.4 + ((Math.floor(y / 4) + Math.floor(x / 8)) % 2) * 0.6 + (y % 4 === 0 ? -1 : 0), x, y))
    b.disc(36, 80, 18, 22, rgb(0x14080a))
    b.rect(18, 80, 36, 22, rgb(0x14080a))
    b.rect(4, 36, 64, 5, (x, y) => tone(ramp(...PAL.stone), 3 - (y - 36) / 3, x, y))
    // The floor.
    for (let y = 112; y < H; y++)
      for (let x = 0; x < W; x++) b.set(x, y, tone(ramp(0x1a1418, 0x2a2026, 0x3a2c30, 0x4a3634), 2.6 - (y - 112) / 16 + (hash(x >> 3, y >> 2, 4) - 0.5), x, y))
    // A water barrel for quenching.
    b.rect(214, 92, 22, 24, (x, y) => tone(ramp(...PAL.wood), 1.5 + (x - 214) / 12 + ((y - 92) % 8 < 2 ? -1 : 0), x, y))
    b.rect(214, 92, 22, 3, rgb(0x2c6688))
    // The anvil on its stump.
    b.rect(102, 116, 34, 20, (x, y) => tone(ramp(...PAL.wood), 1.2 + (x - 102) / 20, x, y))
    b.rect(84, 100, 80, 7, (x, y) => tone(ramp(...PAL.iron), 3.6 - (y - 100) / 2, x, y))
    b.rect(164, 101, 14, 4, (x, y) => tone(ramp(...PAL.iron), 3 - (x - 164) / 7, x, y))
    b.rect(98, 107, 52, 5, rgb(PAL.iron[1]))
    b.rect(92, 112, 64, 5, (x, y) => tone(ramp(...PAL.iron), 2 - (y - 112) / 3, x, y))
  })
}

const GRADE_NAMES = ['Boşa', 'Kusursuz!', 'İyi', 'Zayıf', 'Kaçtı']
const GRADE_COLORS = ['#a89a88', '#f2d16b', '#9cc464', '#e0a050', '#ec7a5a']

// The smith: a broad, bald, bearded man in a leather apron, standing behind the anvil and facing the strike spot on its
// left. His hammer arm turns at the shoulder and the elbow, from raised over his head (`down` 0) to the strike (1); his
// other hand holds the bar in tongs. Lit warm from the furnace on the left, in short ramps with a dark outline.
const SKIN = ['#8a5434', '#c48a5e', '#eab88a'] as const
const LEATHER = ['#2e1c12', '#5a3820', '#8a5a34'] as const
const RIM = '#ffb060'
const SHOULDER: [number, number] = [104, 66]
const UPPER = 12
const FORE = 11
const HANDLE = 17
const deg = Math.PI / 180

function smith(ctx: CanvasRenderingContext2D, down: number, t: number) {
  const breathe = Math.round(Math.sin(t * 2) * 0.7)
  const cx = 114
  // The torso: bare broad shoulders over a leather apron, lit on the left.
  const top = 60 + breathe
  box(ctx, '#14101a', cx - 13, top - 1, 27, 41)
  box(ctx, SKIN[1], cx - 12, top, 25, 12)
  box(ctx, SKIN[0], cx + 6, top, 7, 12)
  box(ctx, SKIN[2], cx - 12, top, 25, 1)
  box(ctx, RIM, cx - 12, top + 1, 1, 10)
  // Chest shading: two pectoral curves.
  box(ctx, SKIN[0], cx - 7, top + 8, 6, 1)
  box(ctx, SKIN[0], cx + 1, top + 8, 5, 1)
  // The apron, with its strap and a pocket of tools.
  box(ctx, LEATHER[1], cx - 10, top + 9, 21, 31)
  box(ctx, LEATHER[0], cx + 6, top + 9, 5, 31)
  box(ctx, LEATHER[2], cx - 10, top + 9, 1, 31)
  box(ctx, LEATHER[2], cx - 10, top + 9, 21, 1)
  pline(ctx, LEATHER[0], cx - 9, top + 1, cx - 4, top + 9, 2)
  pline(ctx, LEATHER[0], cx + 9, top + 1, cx + 5, top + 9, 2)
  box(ctx, LEATHER[0], cx - 5, top + 20, 9, 7)
  box(ctx, LEATHER[2], cx - 5, top + 20, 9, 1)
  box(ctx, C(PAL.iron[3]), cx - 3, top + 17, 1, 4)
  box(ctx, C(PAL.wood[3]), cx + 1, top + 18, 1, 3)
  for (let y = top + 12; y < top + 40; y += 6) box(ctx, LEATHER[0], cx - 9 + ((y >> 1) % 5), y, 2, 1)
  // Neck and head, facing left: bald crown with a shine, a red headband, a thick dark beard.
  box(ctx, '#14101a', cx - 6, top - 4, 10, 5)
  box(ctx, SKIN[1], cx - 5, top - 4, 8, 5)
  const hx = cx - 8
  const hy = top - 15
  box(ctx, '#14101a', hx - 1, hy - 1, 13, 14)
  box(ctx, SKIN[1], hx, hy, 11, 12)
  box(ctx, SKIN[0], hx + 8, hy, 3, 12)
  box(ctx, SKIN[2], hx + 2, hy + 1, 3, 1)
  box(ctx, RIM, hx, hy + 2, 1, 5)
  // A red headband across the brow, an eye under a heavy brow, the nose, the ear, the beard.
  box(ctx, C(PAL.red[3]), hx, hy + 2, 11, 2)
  box(ctx, C(PAL.red[1]), hx + 8, hy + 2, 3, 2)
  box(ctx, C(PAL.red[3]), hx + 10, hy + 4, 2, 2)
  box(ctx, SKIN[0], hx + 1, hy + 4, 4, 1)
  box(ctx, '#f3e6c8', hx + 2, hy + 5, 2, 1)
  box(ctx, '#14101a', hx + 2, hy + 5, 1, 1)
  box(ctx, '#14101a', hx - 2, hy + 5, 2, 3)
  box(ctx, SKIN[1], hx - 1, hy + 5, 1, 2)
  box(ctx, SKIN[0], hx + 7, hy + 5, 2, 3)
  box(ctx, SKIN[2], hx + 7, hy + 5, 1, 1)
  box(ctx, '#2a1a12', hx - 1, hy + 8, 10, 5)
  box(ctx, '#4a2e1c', hx, hy + 8, 7, 2)
  box(ctx, '#2a1a12', hx - 1, hy + 12, 6, 3)
  box(ctx, '#7a2a24', hx, hy + 9, 3, 1)
  // The far arm, holding the bar steady in tongs on the anvil's far side.
  const back: [number, number] = [124, 68 + breathe]
  const bElbow: [number, number] = [131, 80]
  const bHand: [number, number] = [129, 90]
  limb(ctx, back[0], back[1], bElbow[0], bElbow[1], 5, ['#5a3622', '#8a5a3c', '#b07a52'])
  joint(ctx, bElbow[0], bElbow[1], 2.5, ['#5a3622', '#8a5a3c', '#b07a52'])
  limb(ctx, bElbow[0], bElbow[1], bHand[0], bHand[1], 4, ['#5a3622', '#8a5a3c', '#b07a52'])
  pline(ctx, '#14101a', bHand[0], bHand[1], 141, BAR_Y - 1, 2)
  pline(ctx, C(PAL.iron[4]), bHand[0], bHand[1] - 1, 141, BAR_Y - 2, 1)
  pline(ctx, C(PAL.iron[2]), bHand[0] + 1, bHand[1] + 1, 142, BAR_Y, 1)
  joint(ctx, bHand[0], bHand[1], 2.5, ['#5a3622', '#8a5a3c', '#b07a52'])
  // The hammer arm, turning at the shoulder and the elbow (raised over the head → down on the strike spot).
  const ease = down * down * (3 - 2 * down)
  const a1 = (-105 + (-205 + 105) * ease) * deg
  const a2 = (-70 + (-228 + 70) * ease) * deg
  const sh: [number, number] = [SHOULDER[0], SHOULDER[1] + breathe]
  const el: [number, number] = [sh[0] + Math.cos(a1) * UPPER, sh[1] + Math.sin(a1) * UPPER]
  const fist: [number, number] = [el[0] + Math.cos(a2) * FORE, el[1] + Math.sin(a2) * FORE]
  const head: [number, number] = [fist[0] + Math.cos(a2) * HANDLE, fist[1] + Math.sin(a2) * HANDLE]
  joint(ctx, sh[0], sh[1], 4, SKIN)
  limb(ctx, sh[0], sh[1], el[0], el[1], 6, SKIN, RIM)
  joint(ctx, el[0], el[1], 3, SKIN)
  limb(ctx, el[0], el[1], fist[0], fist[1], 5, SKIN, RIM)
  // A leather bracer on the forearm.
  const bx = el[0] + (fist[0] - el[0]) * 0.6
  const by = el[1] + (fist[1] - el[1]) * 0.6
  joint(ctx, bx, by, 2.5, LEATHER)
  // The handle runs through the fist to the head at its end.
  const tail: [number, number] = [fist[0] - Math.cos(a2) * 3, fist[1] - Math.sin(a2) * 3]
  pline(ctx, '#14101a', tail[0] - 1, tail[1] - 1, head[0] - 1, head[1] - 1, 3)
  pline(ctx, C(PAL.wood[3]), tail[0], tail[1], head[0], head[1], 1)
  // The head, square to the handle: its face points along the swing.
  const nx = -Math.sin(a2)
  const ny = Math.cos(a2)
  const hw = 7
  for (let k = -hw; k <= hw; k++) {
    const px = head[0] + nx * k
    const py = head[1] + ny * k
    box(ctx, '#14101a', px - 3, py - 3, 6, 6)
  }
  for (let k = -hw + 1; k <= hw - 1; k++) {
    const px = head[0] + nx * k
    const py = head[1] + ny * k
    box(ctx, C(k < -hw + 3 || k > hw - 3 ? PAL.iron[4] : PAL.iron[2]), px - 2, py - 2, 4, 4)
    box(ctx, C(PAL.iron[3]), px - 2, py - 2, 1, 1)
  }
  box(ctx, RIM, head[0] + nx * (hw - 1) - 2, head[1] + ny * (hw - 1) - 2, 1, 1)
  // The fist, closed round the handle.
  joint(ctx, fist[0], fist[1], 3, SKIN)
  box(ctx, SKIN[0], fist[0] - 1, fist[1], 3, 1)
  if (down > 0.6) checker(ctx, '#ffffff', head[0] - 8, head[1] - 10, 16, 6)
  return head
}

export const anvilScene: Scene<AnvilState> = {
  make: anvilGame,
  controls: 'İşaret çekicin altına gelince bas',
  score: (s) => s.score,
  left: (s) => 1 - s.step / ANVIL_LIMIT,
  create() {
    const back = backdrop()
    let lastBlow = -1
    let blowAt = -9
    let comboPulse = 0
    let passed = 0
    return (ctx, s, f) => {
      const { t, fx, dt } = f
      ctx.drawImage(back, 0, 0)
      // The furnace fire, flickering, and its glow on the room.
      for (let i = 0; i < 40; i++) {
        const age = (t * 1.4 + hash(i, 0, 3)) % 1
        const x = 22 + hash(i, 1, 3) * 28 + Math.sin(t * 5 + i) * 2
        const y = 100 - age * 30
        const c = age < 0.3 ? C(PAL.fire[4]) : age < 0.6 ? C(PAL.fire[3]) : age < 0.85 ? C(PAL.fire[2]) : C(PAL.fire[1])
        const s0 = age < 0.5 ? 3 : 2
        box(ctx, c, x, y, s0, s0)
      }
      box(ctx, C(PAL.fire[5]), 26, 98, 20, 3)
      halo(ctx, '#faa630', 36, 88, 30, 0.35 + Math.sin(t * 7) * 0.05)
      if (Math.random() < 0.3) fx.burst(36, 74, 1, { colors: [C(PAL.fire[4]), C(PAL.fire[2])], speed: [10, 30], angle: [-Math.PI * 0.7, -Math.PI * 0.3], gravity: -30, life: [0.6, 1.2] })
      // The smith behind the anvil; his hammer comes down on a blow and swings back up over his shoulder.
      const since = t - blowAt
      const down = since < 0.07 ? since / 0.07 : since < 0.16 ? 1 : since < 0.42 ? 1 - (since - 0.16) / 0.26 : 0
      smith(ctx, down, t)
      // The hot bar on the anvil, glowing more where it is hottest (by the hammer).
      for (let x = 60; x < W; x++) {
        const heat = Math.max(0, 1 - Math.abs(x - HIT_X) / 120)
        box(ctx, C(heat > 0.6 ? PAL.fire[4] : heat > 0.35 ? PAL.fire[3] : PAL.fire[2]), x, BAR_Y - 1, 1, 1)
        box(ctx, C(heat > 0.5 ? PAL.fire[3] : PAL.fire[2]), x, BAR_Y, 1, 2)
        box(ctx, C(PAL.fire[1]), x, BAR_Y + 2, 1, 1)
      }
      halo(ctx, '#e8661a', HIT_X + 20, BAR_Y, 16, 0.25)
      // The strike spot: a ring on the bar under the hammer.
      box(ctx, '#fff4c0', HIT_X - ANVIL_WINDOW / 2 - 1, BAR_Y - 6, 1, 3)
      box(ctx, '#fff4c0', HIT_X + ANVIL_WINDOW / 2 + 1, BAR_Y - 6, 1, 3)
      checker(ctx, '#fff4c0', HIT_X - ANVIL_WINDOW / 2, BAR_Y - 6, ANVIL_WINDOW + 1, 1)
      // The marks coming in: glowing runes of the smith's chalk.
      s.notes.forEach((n, i) => {
        const x = HIT_X + ((n - s.step) / ANVIL_TRAVEL) * (W - HIT_X)
        if (x < 50 || x > W + 4) return
        const g = s.grades[i]
        if (g > 0 && s.step - n > 10) return
        const near = Math.abs(n - s.step) <= ANVIL_WINDOW
        const color = g === 0 ? (near ? '#ffffff' : '#fff2a8') : g === -1 ? '#5a3a30' : GRADE_COLORS[g]
        box(ctx, C(PAL.ink), x - 2, BAR_Y - 9, 5, 14)
        box(ctx, color, x - 1, BAR_Y - 8, 3, 12)
        box(ctx, '#ffffff', x - 1, BAR_Y - 8, 1, 3)
        if (near && g === 0) halo(ctx, '#fff4c0', x, BAR_Y - 2, 6, 0.6)
      })
      // News: the last blow, and marks let pass.
      if (s.last && s.last.step !== lastBlow) {
        lastBlow = s.last.step
        blowAt = t
        const g = s.last.grade
        if (g === 1 || g === 2) {
          play('hit')
          fx.burst(HIT_X, BAR_Y - 2, g === 1 ? 34 : 18, { colors: ['#ffffff', C(PAL.fire[5]), C(PAL.fire[4]), C(PAL.fire[3]), C(PAL.fire[2])], speed: [60, g === 1 ? 170 : 110], angle: [-Math.PI, 0], gravity: 260, drag: 0.6, floor: 136, life: [0.4, 1] })
          fx.shake(g === 1 ? 3 : 2, 0.15)
          if (g === 1) fx.flash('#ffe070', 0.08)
          comboPulse = 0.2
        } else if (g === 3) {
          play('hit')
          fx.burst(HIT_X, BAR_Y - 2, 6, { colors: [C(PAL.fire[3]), C(PAL.fire[2])], speed: [30, 60], angle: [-Math.PI, 0], gravity: 260 })
        } else {
          play('miss')
          fx.shake(1, 0.1)
        }
        const k = g === -1 ? 4 : g
        fx.float(GRADE_NAMES[k], HIT_X + 4, BAR_Y - 54, GRADE_COLORS[k], g === 1 ? 13 : 10, 0.7)
      }
      const missed = s.grades.filter((g) => g === -1).length
      if (missed > passed) {
        passed = missed
        fx.float('Kaçtı', HIT_X - 20, BAR_Y - 30, GRADE_COLORS[4], 9, 0.6)
      }
      text(ctx, `${s.notes.filter((_, i) => s.grades[i] > 0).length}/${s.notes.length} vuruş`, 8, 22, { size: 9 })
      comboPulse = Math.max(0, comboPulse - dt)
      hudCombo(ctx, s.combo, W - 8, 24, comboPulse)
    }
  },
}
