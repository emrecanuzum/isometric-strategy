import { ARCHERY_LIMIT, archeryGame, balance } from '@game/shared'
import { L } from '../../../lib/i18n'
import type { ArcheryState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, birds, box, checker, cloudLayer, hash, oval, pennant, pline, ramp, rgb, ridge, scroll, text, tone } from './art'
import type { Scene } from './Stage'

// The butts at the barracks: a meadow below the castle on a bright day, a straw target on its trestle, the wind
// pennant, and the archer's bow in the foreground.

const A = balance.minigames.archery
const CX = 128
const CY = 70
const RINGS = [0xf2f0e6, 0x2a2420, 0x3d6fb8, 0xc8402e, 0xf2d16b]
const RADIUS = A.pointsPerArrow * A.pixelsPerPoint

function backdrop() {
  return bake('archery-back', W, H, (b) => {
    b.sky(ramp(...PAL.skyDay), 0, 70)
    // The castle on its hill, far off.
    b.hills((x) => 50 + ridge(x, 51, 44, W) * 14, ramp(0x56708a, 0x6a849c, 0x8098ac), 20, 80, 0.4)
    const kx = 196
    const ky = 46
    b.rect(kx - 14, ky - 10, 28, 12, rgb(0x8a94a4))
    b.rect(kx - 18, ky - 18, 6, 20, rgb(0x9aa4b2))
    b.rect(kx + 12, ky - 18, 6, 20, rgb(0x7a8494))
    b.rect(kx - 4, ky - 24, 8, 26, rgb(0x9aa4b2))
    for (const tx of [kx - 18, kx + 12, kx - 4]) for (let i = 0; i < 3; i++) b.set(tx + i * 3, tx === kx - 4 ? ky - 25 : ky - 19, rgb(0x9aa4b2))
    b.rect(kx - 1, ky - 32, 1, 8, rgb(0x3a3a44))
    b.rect(kx, ky - 32, 5, 3, rgb(0xa8342e))
    // Woods and the meadow.
    b.hills((x) => 64 + ridge(x, 61, 18, W) * 8, ramp(0x1f4a30, 0x2a5e36, 0x3a7440, 0x4e8a48), 14, 84, 0.5)
    for (let y = 76; y < H; y++)
      for (let x = 0; x < W; x++) {
        const mow = Math.floor((x + (y - 76) * 1.6) / 22) % 2
        b.set(x, y, tone(ramp(...PAL.grass), 2.6 + (y - 76) / 26 + mow * 0.5 + (hash(x, y, 6) > 0.93 ? 1 : 0), x, y))
      }
    // Hay bales either side.
    for (const [hx, hy] of [
      [40, 104],
      [212, 108],
    ] as const) {
      b.disc(hx, hy, 16, 10, (x, y) => tone(ramp(...PAL.wheat), 3.4 - (y - hy + 10) / 8 + ((x * 2 + y) % 5 === 0 ? -1 : 0), x, y))
      b.rect(hx - 16, hy, 32, 6, (x, y) => tone(ramp(...PAL.wheat), 1.6 + ((x + y) % 4 === 0 ? -0.8 : 0), x, y))
    }
    // The trestle for the target.
    b.line(CX - 20, CY + 30, CX - 10, CY - 5, rgb(PAL.wood[1]))
    b.line(CX - 19, CY + 30, CX - 9, CY - 5, rgb(PAL.wood[2]))
    b.line(CX + 20, CY + 30, CX + 10, CY - 5, rgb(PAL.wood[1]))
    b.line(CX + 19, CY + 30, CX + 9, CY - 5, rgb(PAL.wood[2]))
    b.disc(CX, CY + 31, 26, 4, (x, y) => (bay2(x, y) ? rgb(0x2a4a24) : undefined))
  })
}
const bay2 = (x: number, y: number) => (x + y) % 2 === 0

let targetArt: HTMLCanvasElement | null = null
function target() {
  if (targetArt) return targetArt
  const R = Math.ceil(RADIUS) + 3
  targetArt = bake('archery-target', R * 2 + 1, R * 2 + 3, (b) => {
    const ring = RADIUS / RINGS.length
    for (let y = -R; y <= R + 2; y++)
      for (let x = -R; x <= R; x++) {
        const d = Math.sqrt(x * x + y * y)
        if (y > R) {
          if (Math.sqrt(x * x + (y - 2) * (y - 2)) <= R) b.set(x + R, y + R, rgb(0x6a4a1a))
          continue
        }
        if (d > R) continue
        const lit = x + y < 0 ? 0.25 : -0.15
        const c = d > R - 3 ? tone(ramp(0x8a6a2e, 0xa8843e, 0xc9a45a), 1 + lit * 3 + ((x * 3 + y * 7) % 5 === 0 ? -1 : 0), x, y) : rgb(RINGS[Math.min(RINGS.length - 1, Math.floor((R - 3 - d) / ring))])
        b.set(x + R, y + R, c)
        if (d <= R - 3 && lit < 0 && (x + y * 3) % 7 === 0) b.tint(x + R, y + R, rgb(0x14101a), 0.25)
      }
  })
  return targetArt
}

export const archeryScene: Scene<ArcheryState> = {
  make: archeryGame,
  controls: L('Basılı tut: yayı ger · bırak: oku at', 'Hold: draw the bow · release: loose the arrow'),
  score: (s) => s.score,
  left: (s) => 1 - s.step / ARCHERY_LIMIT,
  create() {
    const back = backdrop()
    const clouds = cloudLayer('archery-clouds', 512, 44, rgb(0xf6fafc), rgb(0xc8d8e8), 53, 6)
    let hits = 0
    let wobble = 0
    let shot = 0
    return (ctx, s, f) => {
      const { t, fx, dt } = f
      ctx.drawImage(back, 0, 0)
      scroll(ctx, clouds, t * 3 + s.wind * t * 0.1, 4)
      birds(ctx, t, 12, '#2a3040', 4, 22)
      // News: an arrow landed.
      while (hits < s.hits.length) {
        const h = s.hits[hits++]
        const x = CX + h.x
        const y = CY + h.y
        play(h.points >= 8 ? 'hit' : h.points > 0 ? 'chop' : 'miss')
        wobble = 0.3
        fx.burst(x, y, h.points > 0 ? 10 : 4, { colors: [C(PAL.wheat[4]), C(PAL.wheat[3]), C(PAL.wheat[2])], speed: [20, 60], gravity: 200, life: [0.3, 0.7] })
        fx.float(h.points > 0 ? `+${h.points}` : '0', x, y - 16, h.points >= 10 ? '#f2d16b' : h.points >= 6 ? '#9cc464' : '#c8b8a0', h.points >= 10 ? 14 : 11)
        if (h.points >= 10) {
          fx.float(L('Tam isabet!', 'Bullseye!'), CX, CY - 46, '#fff4c0', 12, 1.1)
          fx.flash('#fff4c0', 0.1)
          fx.shake(2, 0.15)
        } else if (h.points === 0) fx.float(L('Iska!', 'Miss!'), x, y - 28, '#ec7a5a', 10)
      }
      if (s.shot > shot) {
        shot = s.shot
        play('click')
      }
      // The wind pennant on the left.
      pennant(ctx, 22, 50, t, s.wind / A.wind, ['#c8402e', '#f2f0e6'], 18)
      text(ctx, L(`Rüzgâr ${s.wind > 0 ? '→' : s.wind < 0 ? '←' : '·'} ${Math.abs(s.wind)}`, `Wind ${s.wind > 0 ? '→' : s.wind < 0 ? '←' : '·'} ${Math.abs(s.wind)}`), 8, 76, { size: 9 })
      // Drifting leaves in the wind.
      for (let i = 0; i < 6; i++) {
        const x = (((hash(i, 0, 7) * W + t * (8 + s.wind)) % (W + 20)) + W + 20) % (W + 20) - 10
        const y = 40 + hash(i, 1, 7) * 60 + Math.sin(t * 2 + i) * 3
        box(ctx, i % 2 ? '#7fba50' : '#c8a040', x, y, 2, 1)
      }
      // The target, rocking a little after a hit, with the arrows in it.
      wobble = Math.max(0, wobble - dt)
      const rock = Math.round(Math.sin(t * 40) * wobble * 3)
      const tg = target()
      ctx.drawImage(tg, CX - (tg.width >> 1) + rock, CY - (tg.width >> 1))
      for (const h of s.hits) {
        const x = Math.round(CX + h.x) + rock
        const y = Math.round(CY + h.y)
        checker(ctx, '#14101a', x + 1, y + 1, 3, 2)
        box(ctx, '#14101a', x, y, 1, 1)
        pline(ctx, C(PAL.wood[3]), x + 1, y + 1, x + 4, y + 4)
        box(ctx, '#f2f0e6', x + 4, y + 3, 2, 3)
        box(ctx, '#c8402e', x + 3, y + 4, 2, 2)
      }
      // The arrow in flight: from the bow towards where it lands, shrinking.
      if (s.arrow) {
        const k = s.arrow.t / A.flightSeconds
        const x = CX + s.arrow.x * (1 - k) + 0 * k
        const y = CY + s.arrow.y * (1 - k) + 56 * k - Math.sin((1 - k) * Math.PI) * 10
        const size = 1 + Math.round(k * 4)
        pline(ctx, C(PAL.wood[4]), x, y, x, y + size * 2)
        box(ctx, '#f2f0e6', x - (size >> 1), y + size * 2, size, size)
      }
      // The aim: a ring and cross, steady green, red as the arm trembles.
      const ax = CX + Math.round(s.x)
      const ay = CY + Math.round(s.y)
      const trembling = s.drawing && s.drawn >= A.steadySeconds
      const aim = !s.drawing ? '#f3e6c8' : trembling ? '#ec7a5a' : '#9cc464'
      const r = s.drawing ? Math.max(3, 7 - Math.round(Math.min(1, s.drawn / A.steadySeconds) * 4)) : 7
      for (const [dx, dy] of [
        [-r - 3, 0],
        [r + 1, 0],
        [0, -r - 3],
        [0, r + 1],
      ]) {
        box(ctx, '#14101a', ax + dx - (dx ? 0 : 1), ay + dy - (dy ? 0 : 1), dx ? 3 : 3, dy ? 3 : 3)
        box(ctx, aim, ax + dx + (dx ? 0 : 0), ay + dy, dx ? 2 : 1, dy ? 2 : 1)
      }
      box(ctx, aim, ax, ay, 1, 1)
      // The sight's ring, closing in as the bow steadies.
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2
        const px = ax + Math.round(Math.cos(a) * (r + 1))
        const py = ay + Math.round(Math.sin(a) * (r + 1))
        box(ctx, '#14101a', px, py + 1, 1, 1)
        box(ctx, aim, px, py, 1, 1)
      }
      if (s.drawing) checker(ctx, aim, ax - r, ay - r, r * 2 + 1, 1)
      // The bow in the foreground: the string drawn back as it is held.
      const draw = s.drawing ? Math.min(1, s.drawn / 0.35) : 0
      const bx = CX + 54
      const by = 128
      const tremble = trembling ? Math.round(Math.sin(t * 50) * 1) : 0
      for (let i = -24; i <= 24; i++) {
        const bend = Math.round((1 - (i * i) / 576) * (8 + draw * 3))
        box(ctx, C(PAL.wood[2]), bx + bend + tremble, by + i, 2, 1)
        box(ctx, C(PAL.wood[4]), bx + bend + tremble, by + i, 1, 1)
      }
      const pull = Math.round(draw * 12)
      pline(ctx, '#e6dcc4', bx + tremble, by - 24, bx - pull + tremble, by)
      pline(ctx, '#e6dcc4', bx - pull + tremble, by, bx + tremble, by + 24)
      if (s.drawing || (!s.arrow && s.shot < A.arrows && s.pause <= 0)) {
        pline(ctx, C(PAL.wood[4]), bx - pull + tremble, by, bx + 22 + tremble, by - 6)
        box(ctx, '#c8402e', bx - pull - 2 + tremble, by - 1, 3, 2)
        box(ctx, C(PAL.iron[4]), bx + 22 + tremble, by - 7, 2, 2)
      }
      box(ctx, C(PAL.skin[2]), bx + 6 + tremble, by - 3, 5, 6)
      // The draw: steady, then trembling.
      if (s.drawing) {
        const k = Math.min(1, s.drawn / A.steadySeconds)
        box(ctx, '#14101a', 8, H - 14, 52, 6)
        box(ctx, trembling ? '#ec7a5a' : '#9cc464', 9, H - 13, Math.round(k * 50), 4)
        text(ctx, trembling ? L('Kol titriyor!', 'Arm trembling!') : L('Nişan sakin', 'Aim steady'), 8, H - 26, { size: 8, color: trembling ? '#ec7a5a' : '#c8e0a0' })
      }
      // Arrows left in the quiver.
      const left = A.arrows - s.shot
      for (let i = 0; i < left; i++) {
        box(ctx, C(PAL.wood[4]), W - 12 - i * 5, H - 22, 1, 12)
        box(ctx, '#c8402e', W - 13 - i * 5, H - 24, 3, 3)
      }
      oval(ctx, C(PAL.cloth[1]), W - 22, H - 8, 18, 3)
    }
  },
}
