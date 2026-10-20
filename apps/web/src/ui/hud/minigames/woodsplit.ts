import { WOODSPLIT_LIMIT, balance, woodsplitGame } from '@game/shared'
import { L } from '../../../lib/i18n'
import type { WoodsplitState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, birds, box, checker, cloudLayer, hash, hudCombo, joint, limb, oval, pineRow, pline, ramp, rgb, ridge, scroll, smoke, text, tone } from './art'
import type { Scene } from './Stage'

// Splitting logs at the lumber camp: a clearing in the pines at morning, the woodsman at his chopping block, the power
// gauge at his side with the log's sweet band on it.

const WS = balance.minigames.woodsplit
const BLOCK_X = 124
const BLOCK_Y = 116
const GAUGE = { x: 226, y: 32, w: 12, h: 96 }

function backdrop() {
  return bake('woodsplit-back', W, H, (b) => {
    b.sky(ramp(...PAL.skyDay), 0, 78)
    // The far mountains, then the near ridge.
    b.hills((x) => 42 + ridge(x, 3, 40, W) * 22, ramp(0x2c3a5a, 0x3e5070, 0x566a8a, 0x7088a6), 30, 90, 0.6)
    b.hills((x) => 58 + ridge(x, 7, 26, W) * 14, ramp(0x1d3a3a, 0x2a4e48, 0x3a6656, 0x548066), 26, 96, 0.5)
    pineRow(b, 86, ramp(...PAL.pine), 11, 6, 1)
    pineRow(b, 94, ramp(0x0a221f, 0x123329, 0x1a4632, 0x245a3a, 0x357346), 23, 9, 1.3)
    // The clearing: grass, with trodden earth round the block.
    for (let y = 92; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - BLOCK_X) / 70
        const dy = (y - BLOCK_Y) / 22
        const worn = 1 - Math.sqrt(dx * dx + dy * dy) + (hash(x, y, 3) - 0.5) * 0.25
        b.set(x, y, worn > 0.25 ? tone(ramp(...PAL.dirt), 2.2 + worn + ((x * 3 + y) % 7 === 0 ? -0.8 : 0), x, y) : tone(ramp(...PAL.grass), 2.5 + (y - 92) / 30 + (hash(x, y, 5) > 0.92 ? 1.2 : 0), x, y))
      }
    // Tufts and pebbles.
    for (let i = 0; i < 70; i++) {
      const x = hash(i, 1, 9) * W
      const y = 96 + hash(i, 2, 9) * 46
      if (Math.abs(x - BLOCK_X) < 50 && Math.abs(y - BLOCK_Y) < 16) continue
      b.set(x, y, rgb(PAL.grass[5]))
      b.set(x - 1, y + 1, rgb(PAL.grass[4]))
      b.set(x + 1, y + 1, rgb(PAL.grass[4]))
    }
    // The woodsman's cabin among the trees, with its chimney.
    const hx = 22
    const hy = 98
    b.rect(hx, hy - 14, 34, 14, (x, y) => tone(ramp(...PAL.wood), 1.5 + ((y - hy) % 3 === 0 ? -1 : 0.6) + (x - hx) / 60, x, y))
    for (let j = 0; j < 12; j++) b.rect(hx - 3 + j, hy - 15 - j, 40 - j * 2, 1, (x, y) => tone(ramp(...PAL.wood), 0.7 + (x % 5 === 0 ? 0.6 : 0) + j / 12, x, y))
    b.rect(hx + 24, hy - 30, 5, 10, (x, y) => tone(ramp(...PAL.stone), 2 + (y % 2), x, y))
    b.rect(hx + 13, hy - 9, 6, 9, rgb(PAL.wood[0]))
    b.rect(hx + 4, hy - 10, 5, 4, rgb(0x3a3010))
    b.rect(hx + 5, hy - 9, 3, 2, rgb(0x6a5a20))
    // A sawhorse and an axe stuck in a round, by the cabin.
    b.rect(hx + 40, hy - 5, 14, 2, rgb(PAL.wood[3]))
    b.line(hx + 41, hy - 3, hx + 39, hy + 3, rgb(PAL.wood[1]))
    b.line(hx + 52, hy - 3, hx + 54, hy + 3, rgb(PAL.wood[1]))
  })
}

// The woodpile behind the block: it grows with every split log.
function woodpile(ctx: CanvasRenderingContext2D, n: number) {
  const x0 = 160
  const y0 = 120
  for (let i = 0; i < n * 2; i++) {
    const row = Math.floor(i / 7)
    const col = i % 7
    const x = x0 + col * 5 + (row % 2) * 2
    const y = y0 - row * 4
    // A split half, its pale cut face out, bark round the edge.
    box(ctx, C(PAL.wood[0]), x, y, 5, 4)
    box(ctx, C(PAL.wood[1]), x, y, 5, 1)
    box(ctx, C(PAL.wood[4]), x + 1, y + 1, 3, 2)
    box(ctx, C(PAL.wood[5]), x + 1, y + 1, 1, 1)
    box(ctx, C(PAL.wood[3]), x + 3, y + 2, 1, 1)
  }
}

// A log standing on the block: bark by its hardness, a dark knot on the knotty ones; `split` opens a crack.
function log(ctx: CanvasRenderingContext2D, x: number, y: number, hard: number, knotty: boolean, split = 0, stuck = false) {
  const bark = hard > 0.6 ? [0x2a1c14, 0x45301e, 0x5e4228] : hard > 0.3 ? [0x3a2616, 0x5a3c22, 0x7a5532] : [0x4a3220, 0x6e4a2e, 0x936a40]
  const w = 18
  const h = 22
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const shade = i < 4 ? 2 : i > w - 5 ? 0 : 1
      const stripe = (i * 7 + j * 3) % 11 === 0 ? -1 : 0
      box(ctx, C(bark[Math.max(0, shade + stripe)]), x - w / 2 + i, y - h + j)
    }
  // The cut top.
  oval(ctx, C(PAL.wood[4]), x, y - h, w / 2, 3)
  oval(ctx, C(PAL.wood[3]), x, y - h, w / 2 - 3, 2)
  box(ctx, C(PAL.wood[2]), x - 1, y - h, 2, 1)
  if (knotty) {
    oval(ctx, C(0x1c120c), x + 3, y - 10, 2.5, 2)
    box(ctx, C(bark[2]), x + 2, y - 11, 1, 1)
  }
  if (split > 0) for (let j = 0; j < Math.round(h * split); j++) box(ctx, C(PAL.ink), x - (j & 1), y - h + j, 1, 1)
  if (stuck) box(ctx, C(0x1c120c), x - 2, y - h, 4, 2)
}

// The woodsman beside the block; `swing` 0 raised overhead … 1 down on the log. Returns where the axe head is.
function woodsman(ctx: CanvasRenderingContext2D, x: number, y: number, swing: number, t: number, stuck: boolean) {
  const breathe = Math.round(Math.sin(t * 2.2) * 0.6)
  // Shadow.
  checker(ctx, C(0x1a2a14), x - 9, y - 1, 20, 3)
  // Boots and legs.
  box(ctx, C(0x1c120c), x - 6, y - 3, 5, 3)
  box(ctx, C(0x1c120c), x + 2, y - 3, 5, 3)
  box(ctx, C(0x3a3a50), x - 5, y - 12, 4, 9)
  box(ctx, C(0x3a3a50), x + 2, y - 12, 4, 9)
  box(ctx, C(0x4e4e6a), x - 5, y - 12, 1, 9)
  // The red check shirt.
  const top = y - 26 + breathe + Math.round(swing * 2)
  for (let j = 0; j < 14; j++)
    for (let i = 0; i < 12; i++) box(ctx, C((Math.floor(i / 2) + Math.floor(j / 2)) % 2 ? PAL.red[2] : PAL.red[1]), x - 5 + i, top + j)
  box(ctx, C(PAL.cloth[1]), x - 5, top + 12, 12, 2)
  box(ctx, C(PAL.gold[2]), x, top + 12, 2, 2)
  // Head: face, beard, woollen cap.
  const hx = x - 3
  const hy = top - 9
  box(ctx, C(PAL.skin[2]), hx, hy, 8, 8)
  box(ctx, C(PAL.skin[1]), hx, hy + 5, 8, 1)
  box(ctx, C(0x5a3a1e), hx, hy + 5, 8, 4)
  box(ctx, C(0x7a5430), hx + 1, hy + 5, 6, 2)
  box(ctx, C(PAL.ink), hx + 5, hy + 3, 1, 1)
  box(ctx, C(PAL.blue[2]), hx - 1, hy - 3, 10, 4)
  box(ctx, C(PAL.blue[3]), hx - 1, hy - 3, 10, 1)
  box(ctx, C(PAL.white[2]), hx + 3, hy - 4, 2, 1)
  // The arms and the axe: hands go from over the head to out in front.
  const sx = x + 1
  const sy = top + 2
  const hand: [number, number] = [sx - 2 + swing * 13, sy - 14 + swing * 18]
  const reach = 17
  // The handle points back over the shoulder when raised, down onto the block when swung.
  const ang = -2.2 + swing * 2.7
  const head: [number, number] = [hand[0] + Math.cos(ang) * reach, hand[1] + Math.sin(ang) * reach]
  const elbow: [number, number] = [(sx + hand[0]) / 2 - 3 + swing * 4, (sy + hand[1]) / 2 + 2]
  limb(ctx, sx, sy, elbow[0], elbow[1], 4, [C(PAL.red[0]), C(PAL.red[2]), C(PAL.red[3])])
  limb(ctx, elbow[0], elbow[1], hand[0], hand[1], 3, [C(PAL.skin[0]), C(PAL.skin[2]), C(PAL.skin[3])])
  pline(ctx, C(PAL.wood[4]), hand[0], hand[1], head[0], head[1], 1)
  pline(ctx, C(PAL.wood[2]), hand[0] + 1, hand[1], head[0] + 1, head[1], 1)
  joint(ctx, hand[0], hand[1], 2, [C(PAL.skin[0]), C(PAL.skin[2]), C(PAL.skin[3])])
  // The axe head, blade forward.
  const bx = Math.round(head[0])
  const by = Math.round(head[1])
  box(ctx, C(PAL.iron[2]), bx - 2, by - 2, 5, 5)
  box(ctx, C(PAL.iron[4]), bx + 2, by - 3, 2, 7)
  box(ctx, C(PAL.iron[5]), bx + 3, by - 3, 1, 7)
  if (stuck) box(ctx, C(PAL.ink), bx + 4, by - 2, 1, 5)
  return head
}

export const woodsplitScene: Scene<WoodsplitState> = {
  make: woodsplitGame,
  controls: L('Gösterge yeşile gelince bas', 'Press when the gauge reaches the green'),
  score: (s) => s.score,
  left: (s) => 1 - s.step / WOODSPLIT_LIMIT,
  create() {
    const back = backdrop()
    const clouds = cloudLayer('woodsplit-clouds', 512, 50, rgb(0xf2f6fa), rgb(0xc4d4e4), 4, 7)
    let seen = 0
    let swingAt = -1
    let comboPulse = 0
    // The halves of the last log, flying apart.
    let halves: { x: number; y: number; vx: number; vy: number; spin: number; life: number; hard: number }[] = []
    return (ctx, s, f) => {
      const { t, fx } = f
      ctx.drawImage(back, 0, 0)
      scroll(ctx, clouds, t * 3, 2)
      birds(ctx, t, 5, '#2a3040', 3, 24)
      smoke(ctx, 48, 66, t, 3)
      // What happened since the last frame.
      while (seen < s.blows.length) {
        const blow = s.blows[seen++]
        const l = s.logs[blow.log]
        const hard = (l.core - WS.core[0]) / (WS.core[1] - WS.core[0])
        swingAt = t
        const top = BLOCK_Y - 22
        if (blow.grade <= 2) {
          play('chop')
          halves.push({ x: BLOCK_X - 4, y: top + 8, vx: -40 - Math.random() * 20, vy: -60, spin: 0, life: 1.2, hard })
          halves.push({ x: BLOCK_X + 4, y: top + 8, vx: 40 + Math.random() * 20, vy: -64, spin: 0, life: 1.2, hard })
          fx.burst(BLOCK_X, top + 2, blow.grade === 1 ? 26 : 14, { colors: [C(PAL.wood[5]), C(PAL.wood[4]), C(PAL.wood[3])], speed: [30, 90], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 220, floor: BLOCK_Y + 6 })
          fx.shake(blow.grade === 1 ? 3 : 2, 0.2)
          fx.float(`+${blow.points}`, BLOCK_X, top - 14, blow.grade === 1 ? '#f2d16b' : '#9cc464', 13)
          fx.float(blow.grade === 1 ? (l.knotty ? L('Budaklı, temiz!', 'Knotty, and clean!') : L('Temiz!', 'Clean!')) : L('İyi', 'Good'), BLOCK_X, top - 28, blow.grade === 1 ? '#fff4c0' : '#c8e0a0', 10)
          if (blow.grade === 1) fx.flash('#fff4c0', 0.08)
          comboPulse = 0.2
        } else if (blow.grade === 3) {
          play('chop')
          halves.push({ x: BLOCK_X - 4, y: top + 8, vx: -110, vy: -90, spin: 0, life: 1.2, hard })
          halves.push({ x: BLOCK_X + 4, y: top + 8, vx: 120, vy: -96, spin: 0, life: 1.2, hard })
          fx.burst(BLOCK_X, top + 4, 30, { colors: [C(PAL.wood[5]), C(PAL.wood[3]), C(PAL.dirt[3])], speed: [60, 140], angle: [-Math.PI, 0], gravity: 260, floor: BLOCK_Y + 6 })
          fx.shake(4, 0.3)
          fx.float(`+${blow.points}`, BLOCK_X, top - 14, '#e0a050', 12)
          fx.float(L('Fazla sert!', 'Too hard!'), BLOCK_X, top - 28, '#e0a050', 10)
        } else {
          play('miss')
          fx.burst(BLOCK_X, top + 2, 6, { colors: [C(PAL.wood[3]), C(PAL.wood[2])], speed: [10, 30], angle: [-Math.PI, 0] })
          fx.shake(1, 0.15)
          fx.float(L('Balta sıkıştı', 'Axe stuck'), BLOCK_X, top - 20, '#ec7a5a', 10)
        }
      }
      // The woodpile and the block.
      woodpile(ctx, s.blows.filter((b) => b.grade <= 3).length)
      checker(ctx, C(0x1a2a14), BLOCK_X - 16, BLOCK_Y - 1, 34, 5)
      oval(ctx, C(PAL.wood[1]), BLOCK_X, BLOCK_Y, 15, 5)
      box(ctx, C(PAL.wood[1]), BLOCK_X - 15, BLOCK_Y - 8, 30, 8)
      box(ctx, C(PAL.wood[2]), BLOCK_X - 15, BLOCK_Y - 8, 6, 8)
      box(ctx, C(PAL.wood[0]), BLOCK_X + 10, BLOCK_Y - 8, 5, 8)
      oval(ctx, C(PAL.wood[3]), BLOCK_X, BLOCK_Y - 8, 15, 4)
      oval(ctx, C(PAL.wood[4]), BLOCK_X, BLOCK_Y - 8, 11, 3)
      oval(ctx, C(PAL.wood[3]), BLOCK_X, BLOCK_Y - 8, 6, 1.5)
      // The log on the block, or the next one dropping onto it.
      const last = s.blows[s.blows.length - 1]
      const cur = s.logs[Math.min(s.index, s.logs.length - 1)]
      const hardOf = (l: typeof cur) => (l.core - WS.core[0]) / (WS.core[1] - WS.core[0])
      const stuck = !!last && last.grade === 4 && s.pause > 0.25
      if (stuck) {
        const l = s.logs[last.log]
        const wob = Math.round(Math.sin(t * 30) * (s.pause > 0.8 ? 1 : 0))
        log(ctx, BLOCK_X + wob, BLOCK_Y - 8, hardOf(l), l.knotty, 0, true)
      } else if (s.index < s.logs.length) {
        const drop = s.pause > 0 ? Math.min(1, s.pause / 0.25) : 0
        if (drop < 1) log(ctx, BLOCK_X, BLOCK_Y - 8 - Math.round(drop * drop * 40), hardOf(cur), cur.knotty)
      }
      // Flying halves.
      halves = halves.filter((h) => (h.life -= f.dt) > 0)
      for (const h of halves) {
        h.vy += 300 * f.dt
        h.x += h.vx * f.dt
        h.y = Math.min(BLOCK_Y + 4, h.y + h.vy * f.dt)
        if (h.y >= BLOCK_Y + 4) h.vx *= 0.9
        h.spin += f.dt * 8
        const flat = h.y >= BLOCK_Y + 4
        const w = flat ? 12 : 6
        const hh = flat ? 5 : 12
        box(ctx, C(PAL.wood[1]), h.x - w / 2, h.y - hh, w, hh)
        box(ctx, C(PAL.wood[4]), h.x - w / 2 + (h.vx > 0 ? 0 : w - 2), h.y - hh, 2, hh)
      }
      // The woodsman: the axe comes down on a blow and goes back up.
      const since = swingAt < 0 ? 9 : t - swingAt
      const swing = stuck ? 0.92 + Math.sin(t * 25) * 0.03 : since < 0.08 ? since / 0.08 : since < 0.35 ? 1 : since < 0.6 ? 1 - (since - 0.35) / 0.25 : 0
      const ready = s.pause <= 0 && s.index < s.logs.length
      woodsman(ctx, BLOCK_X - 26, BLOCK_Y + 4, swing * (ready || since < 0.6 || stuck ? 1 : 0), t, stuck)
      // The power gauge: the log's band (good, and its clean heart) and the needle.
      const g = GAUGE
      box(ctx, C(PAL.ink), g.x - 3, g.y - 3, g.w + 6, g.h + 6)
      box(ctx, C(PAL.wood[2]), g.x - 2, g.y - 2, g.w + 4, g.h + 4)
      box(ctx, C(PAL.wood[3]), g.x - 2, g.y - 2, g.w + 4, 1)
      for (const ry of [g.y - 1, g.y + g.h]) for (const rx of [g.x - 1, g.x + g.w - 1]) box(ctx, C(PAL.iron[4]), rx, ry, 2, 1)
      box(ctx, C(0x1c1420), g.x, g.y, g.w, g.h)
      for (let j = 0; j < g.h; j += 8) box(ctx, C(0x2a2030), g.x, g.y + j, g.w, 1)
      const toY = (v: number) => g.y + g.h - Math.round(v * g.h)
      if (s.index < s.logs.length) {
        const lo = cur.core - cur.half
        const hi = cur.core + cur.half
        box(ctx, C(0x7a2a24), g.x + 1, g.y, g.w - 2, toY(hi) - g.y)
        box(ctx, C(0x3e6a2c), g.x + 1, toY(hi), g.w - 2, toY(lo) - toY(hi))
        box(ctx, C(0x5e9234), g.x + 1, toY(hi), 1, toY(lo) - toY(hi))
        const ilo = cur.core - cur.half * WS.innerShare
        const ihi = cur.core + cur.half * WS.innerShare
        box(ctx, C(PAL.gold[3]), g.x + 1, toY(ihi), g.w - 2, Math.max(1, toY(ilo) - toY(ihi)))
        box(ctx, C(PAL.gold[4]), g.x + 1, toY(ihi), g.w - 2, 1)
      }
      // The needle, with a short trail.
      const ny = toY(s.meter)
      for (let k = 1; k <= 3; k++) checker(ctx, '#f3e6c8', g.x + 2, ny + s.dir * k * 2, g.w - 4, 1, k)
      box(ctx, C(PAL.ink), g.x - 6, ny - 2, 6, 5)
      box(ctx, '#f3e6c8', g.x - 5, ny - 1, 4, 3)
      box(ctx, '#f3e6c8', g.x - 1, ny, g.w + 2, 1)
      text(ctx, L('Güç', 'Power'), g.x + g.w / 2, g.y + g.h + 4, { align: 'center', size: 8, color: '#c8b8a0' })
      // Logs left and the run of good blows.
      const left = s.logs.length - s.index
      text(ctx, L(`Kütük ${Math.min(s.logs.length, s.index + 1)}/${s.logs.length}`, `Log ${Math.min(s.logs.length, s.index + 1)}/${s.logs.length}`), 8, 22, { size: 9 })
      for (let i = 0; i < left; i++) {
        const lx = 9 + (i % 12) * 6
        oval(ctx, C(s.logs[s.index + i]?.knotty ? PAL.wood[2] : PAL.wood[4]), lx + 2, 38, 2.5, 2)
        box(ctx, C(PAL.wood[1]), lx + 2, 38, 1, 1)
      }
      comboPulse = Math.max(0, comboPulse - f.dt)
      hudCombo(ctx, s.combo, GAUGE.x - 12, 24, comboPulse)
    }
  },
}
