import { HARVEST_LIMIT, HARVEST_REAPER, balance, harvestGame } from '@game/shared'
import { L } from '../../../lib/i18n'
import type { HarvestState, Stalk } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, birds, box, checker, cloudLayer, hash, hudCombo, oval, pline, ramp, rgb, ridge, scroll, text, tone } from './art'
import type { Scene } from './Stage'

// The harvest at the farm: a late-summer afternoon, the reaper walking his field with the scythe, the wheat coming
// past; far off the farmstead and its windmill, hedgerows scrolling by.

const HV = balance.minigames.harvest
const GROUND = 120

function sky() {
  return bake('harvest-sky', W, 96, (b) => {
    b.sky(ramp(0x5a8ac4, 0x7aa2d0, 0x9cbcdc, 0xc4d8e4, 0xeee6c8), 0, 92)
    b.glow(206, 30, 26, rgb(0xfff4c0), 0.7)
    b.disc(206, 30, 7, 7, rgb(0xfffbe0))
  })
}

// The far hills with the farmstead (not scrolling).
function farHills() {
  return bake('harvest-far', W, 96, (b) => {
    b.hills((x) => 62 + ridge(x, 13, 50, W) * 16, ramp(0x4a6a6a, 0x5c7e70, 0x72947a, 0x8aa882), 30, 96, 0.5)
    // Fields in strips on the hillside.
    for (let y = 70; y < 96; y++)
      for (let x = 0; x < W; x++) {
        if (b.get(x, y) >>> 24 === 0) continue
        const strip = Math.floor((x + y * 2.2) / 18) % 3
        if (strip === 1 && y > 72) b.tint(x, y, rgb(0xc8a848), 0.4)
      }
    // The farmhouse and barn.
    const fx = 70
    const fy = 74
    b.rect(fx, fy - 7, 14, 7, rgb(0xe6dcc4))
    b.rect(fx + 1, fy - 6, 1, 6, rgb(0xb8ae98))
    for (let j = 0; j < 6; j++) b.rect(fx - 1 + j, fy - 8 - j, 16 - j * 2, 1, rgb(j % 2 ? 0x8a3630 : 0xae4a38))
    b.rect(fx + 5, fy - 4, 3, 4, rgb(0x4a3020))
    b.rect(fx + 18, fy - 6, 12, 6, rgb(0x8a2a24))
    for (let j = 0; j < 4; j++) b.rect(fx + 17 + j, fy - 7 - j, 14 - j * 2, 1, rgb(0x3a2a2a))
  })
}

// Hedgerows and trees on the field's far edge, scrolling slowly (repeats every 512).
function hedges() {
  return bake('harvest-hedge', 512, 40, (b) => {
    for (let x = 0; x < 512; x++) {
      const top = 22 + ridge(x, 21, 9, 512) * 8
      for (let y = Math.round(top); y < 40; y++) b.set(x, y, tone(ramp(...PAL.leaf), 3.6 - (y - top) / 4 + (hash(x, y, 2) > 0.85 ? 0.8 : 0), x, y))
    }
    for (let i = 0; i < 9; i++) {
      const cx = (i * 57 + hash(i, 0, 4) * 30) % 512
      const r = 7 + hash(i, 1, 4) * 5
      for (const wrap of [0, 512, -512]) {
        b.rect(cx + wrap, 26 - r, 2, r + 4, rgb(PAL.wood[1]))
        b.disc(cx + wrap + 1, 22 - r, r, r * 0.8, (x, y, d) => tone(ramp(...PAL.leaf), 4.2 - d * 2.6 - (y - (22 - r)) / r + (hash(x, y, 8) > 0.8 ? 0.7 : 0), x, y))
      }
    }
  })
}

// The field: stubble rows of earth and straw, scrolling at the wheat's pace (repeats every 256).
function field() {
  return bake('harvest-field', W, H - 96, (b) => {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < W; x++) {
        const row = (y + Math.floor(x / 64)) % 4
        const straw = hash(x, y, 1) > 0.75
        b.set(x, y, straw ? tone(ramp(...PAL.wheat), 1.5 + y / 30, x, y) : tone(ramp(...PAL.dirt), 1.6 + y / 20 + (row === 0 ? 0.8 : 0), x, y))
      }
  })
}

// A stalk of wheat; `lean` tips its head, `crow` sits on top of it.
function stalk(ctx: CanvasRenderingContext2D, t: Stalk, x: number, time: number) {
  const base = GROUND + (t.id % 3) - 1
  const tall = 20 + (t.id % 5)
  const sway = Math.round(Math.sin(time * 2.4 + t.id * 0.7) * 1.2)
  const greenish = t.kind === 'green'
  const stem = greenish ? C(PAL.green[2]) : C(PAL.wheat[2])
  const ear = greenish ? [C(PAL.green[1]), C(PAL.green[3])] : t.kind === 'golden' ? [C(PAL.gold[3]), C(PAL.gold[4])] : [C(PAL.wheat[3]), C(PAL.wheat[4])]
  for (const dx of [-2, 0, 2]) {
    const top = base - tall + Math.abs(dx)
    pline(ctx, stem, x + dx, base, x + dx + sway, top)
    for (let k = 0; k < 4; k++) {
      box(ctx, ear[0], x + dx + sway - 1, top - k * 2, 1, 2)
      box(ctx, ear[1], x + dx + sway + 1, top - k * 2 - 1, 1, 2)
    }
    box(ctx, ear[1], x + dx + sway, top - 9, 1, 2)
  }
  if (t.kind === 'golden') {
    // A sheaf tied with a red band, glinting.
    box(ctx, C(PAL.red[3]), x - 3, base - 9, 7, 2)
    if (Math.floor(time * 4 + t.id) % 4 === 0) {
      box(ctx, '#fffbe0', x + 3, base - tall - 6, 1, 3)
      box(ctx, '#fffbe0', x + 2, base - tall - 5, 3, 1)
    }
  }
  if (t.kind === 'crow') {
    const cx = x + sway
    const cy = base - tall - 6
    const hop = Math.floor(time * 3 + t.id) % 5 === 0 ? -1 : 0
    box(ctx, C(PAL.crow[1]), cx - 3, cy + hop, 7, 4)
    box(ctx, C(PAL.crow[2]), cx - 2, cy + hop, 4, 1)
    box(ctx, C(PAL.crow[1]), cx + 2, cy - 3 + hop, 4, 4)
    box(ctx, C(0xe6c050), cx + 6, cy - 2 + hop, 2, 1)
    box(ctx, '#f3e6c8', cx + 4, cy - 2 + hop, 1, 1)
    box(ctx, C(PAL.crow[0]), cx - 5, cy + 1 + hop, 3, 2)
    box(ctx, C(0x2a2a2a), cx, cy + 4 + hop, 1, 2)
  }
}

// The reaper walking with his scythe: `sweep` 0 … 1 through a swing, `tired` hunched and slow.
function reaper(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, swinging: boolean, tired: boolean) {
  const step = Math.floor(t * (tired ? 3 : 6)) % 2
  checker(ctx, C(0x3a2a14), x - 10, y - 1, 20, 3)
  // Legs walking.
  box(ctx, C(0x5a4a36), x - 4, y - 11, 3, 10 - step)
  box(ctx, C(0x5a4a36), x + 1, y - 11, 3, 9 + step)
  box(ctx, C(0x2a1a12), x - 5, y - 2 + (step ? -1 : 0), 4, 2)
  box(ctx, C(0x2a1a12), x + 1, y - 2 + (step ? 0 : -1), 4, 2)
  // The smock.
  const hunch = tired ? 2 : 0
  const top = y - 25 + hunch
  box(ctx, C(0xe6dcc4), x - 5, top, 11, 15)
  box(ctx, C(0xc8bea4), x + 3, top, 3, 15)
  box(ctx, C(0x8a6a3a), x - 5, top + 10, 11, 2)
  // Head and straw hat.
  box(ctx, C(PAL.skin[2]), x - 2 + hunch, top - 7, 6, 7)
  box(ctx, C(PAL.ink), x + 2 + hunch, top - 5, 1, 1)
  box(ctx, C(PAL.wheat[3]), x - 6 + hunch, top - 8, 14, 2)
  box(ctx, C(PAL.wheat[4]), x - 3 + hunch, top - 11, 8, 3)
  box(ctx, C(PAL.red[2]), x - 3 + hunch, top - 9, 8, 1)
  if (tired && Math.floor(t * 2) % 2 === 0) box(ctx, '#8ab4dc', x + 6 + hunch, top - 6, 1, 2)
  // The scythe: a long snath held across the body, the blade sweeping low through the wheat while swinging.
  const sweep = swinging ? (Math.sin(t * 16) + 1) / 2 : 0.15
  const hx = x + 4
  const hy = top + 6
  const ax = hx + 6 + sweep * 10
  const ay = hy + 10 - sweep * 4
  const ex = hx - 14 + sweep * 30
  const ey = y - 4 + Math.round((1 - sweep) * 2)
  pline(ctx, C(PAL.wood[3]), hx - 6, hy - 6, ex, ey)
  pline(ctx, C(PAL.skin[2]), x - 2, top + 4, hx, hy, 2)
  box(ctx, C(PAL.skin[2]), ax - 1, ay - 1, 2, 2)
  // The blade curves forward from the snath's foot.
  for (let i = 0; i < 12; i++) {
    const bx = ex + i
    const by = ey - Math.round((i * i) / 40)
    box(ctx, C(PAL.iron[4]), bx, by, 1, 1)
    box(ctx, C(PAL.iron[2]), bx, by + 1, 1, 1)
  }
  if (swinging) for (let i = 0; i < 3; i++) checker(ctx, '#fff4c0', ex + 2 + i * 4, ey - 4 - i, 4, 1, i)
}

export const harvestScene: Scene<HarvestState> = {
  make: harvestGame,
  controls: L('Basılı tut: biç · yeşilde ve kargada bırak', 'Hold: mow · let go for green stalks and crows'),
  score: (s) => s.score,
  left: (s) => 1 - s.step / HARVEST_LIMIT,
  create() {
    const top = sky()
    const far = farHills()
    const hedge = hedges()
    const ground = field()
    const clouds = cloudLayer('harvest-clouds', 512, 46, rgb(0xfaf6ea), rgb(0xd8d0c0), 17, 6)
    const seen = new Set<number>()
    let comboPulse = 0
    let lastCombo = 0
    let fleeing: { x: number; y: number; vx: number; vy: number; life: number }[] = []
    let fallen: { x: number; y: number; rot: number; life: number; kind: Stalk['kind'] }[] = []
    let wasTired = false
    return (ctx, s, f) => {
      const { t, fx, dt } = f
      const run = s.step * (HV.speed / 60)
      ctx.drawImage(top, 0, 0)
      scroll(ctx, clouds, t * 4 + run * 0.05, 4)
      birds(ctx, t, 9, '#3a3a4a', 3, 30)
      ctx.drawImage(far, 0, 0)
      // The windmill on the far hill, its sails turning.
      const mx = 150
      const my = 60
      box(ctx, C(0xd8ccb0), mx - 3, my, 6, 14)
      box(ctx, C(0xb0a488), mx + 1, my, 2, 14)
      box(ctx, C(0x8a3630), mx - 4, my - 3, 8, 3)
      for (let k = 0; k < 4; k++) {
        const a = t * 1.4 + (k * Math.PI) / 2
        pline(ctx, C(0x6e4a2e), mx, my, mx + Math.cos(a) * 11, my + Math.sin(a) * 11)
        pline(ctx, C(0xeee6d2), mx + Math.cos(a) * 4 + Math.cos(a + 1.57) * 2, my + Math.sin(a) * 4 + Math.sin(a + 1.57) * 2, mx + Math.cos(a) * 11 + Math.cos(a + 1.57) * 2, my + Math.sin(a) * 11 + Math.sin(a + 1.57) * 2)
      }
      scroll(ctx, hedge, run * 0.35, 66)
      scroll(ctx, ground, run, 96)
      // The standing wheat ahead of the reaper and its stubble behind.
      for (const st of s.stalks) {
        const x = Math.round(st.x)
        if (x < -10 || x > W + 10) continue
        if (st.cut > 0) {
          box(ctx, C(st.kind === 'green' ? PAL.green[1] : PAL.wheat[1]), x - 2, GROUND - 3, 5, 3)
          if (!seen.has(st.id)) {
            seen.add(st.id)
            if (st.kind === 'crow') {
              play('miss')
              fleeing.push({ x, y: GROUND - 28, vx: 30 + Math.random() * 20, vy: -50, life: 1.5 })
              fx.burst(x, GROUND - 26, 10, { colors: [C(PAL.crow[1]), C(PAL.crow[2]), C(PAL.wheat[3])], speed: [20, 50], gravity: 40, life: [0.6, 1.2] })
              fx.float(`${HV.points.crow}`, x, GROUND - 46, '#ec7a5a', 12)
              fx.float(L('Karga!', 'Crow!'), x, GROUND - 58, '#ec7a5a', 9)
              fx.shake(2, 0.2)
              fx.flash('#a8342e', 0.12)
            } else if (st.kind === 'green') {
              play('miss')
              fx.burst(x, GROUND - 12, 8, { colors: [C(PAL.green[3]), C(PAL.green[2])], speed: [20, 50], angle: [-Math.PI, 0], gravity: 160 })
              fx.float(`${HV.points.green}`, x, GROUND - 36, '#e0a050', 11)
              fx.float(L('Ham!', 'Unripe!'), x, GROUND - 48, '#e0a050', 9)
            } else {
              fallen.push({ x, y: GROUND - 2, rot: 0, life: 0.8, kind: st.kind })
              fx.burst(x, GROUND - 16, st.kind === 'golden' ? 16 : 5, { colors: [C(PAL.wheat[4]), C(PAL.wheat[3]), C(PAL.gold[3])], speed: [15, 45], angle: [-Math.PI * 0.9, -Math.PI * 0.4], gravity: 90, life: [0.4, 0.9] })
              if (st.kind === 'golden') {
                play('coin')
                fx.float(`+${HV.points.golden}`, x, GROUND - 40, '#f2d16b', 13)
                fx.float(L('Altın demet!', 'Golden sheaf!'), x, GROUND - 54, '#fff4c0', 9)
                fx.flash('#fff4c0', 0.06)
              } else if (seen.size % 3 === 0) fx.float(`+${HV.points.ripe}`, x, GROUND - 34, '#f6de86', 9, 0.6)
            }
          }
          continue
        }
        if (st.cut < 0 && !seen.has(st.id)) {
          seen.add(st.id)
          fx.float(L('kaçtı', 'missed'), x, GROUND - 36, '#a89a88', 8, 0.6)
        }
        stalk(ctx, st, x, t)
      }
      // Cut wheat falling over, and crows flying off.
      fallen = fallen.filter((p) => (p.life -= dt) > 0)
      for (const p of fallen) {
        p.x -= (HV.speed * dt)
        p.rot = Math.min(1, p.rot + dt * 4)
        const len = 18
        pline(ctx, C(PAL.wheat[2]), p.x, p.y, p.x - len * p.rot, p.y - len * (1 - p.rot))
        box(ctx, C(p.kind === 'golden' ? PAL.gold[3] : PAL.wheat[4]), p.x - len * p.rot - 2, p.y - len * (1 - p.rot) - 1, 3, 2)
      }
      fleeing = fleeing.filter((c) => (c.life -= dt) > 0)
      for (const c of fleeing) {
        c.x += c.vx * dt
        c.y += c.vy * dt
        const up = Math.floor(t * 12) % 2 === 0
        box(ctx, C(PAL.crow[1]), c.x - 2, c.y, 5, 3)
        box(ctx, C(PAL.crow[1]), c.x - 5, c.y + (up ? -2 : 1), 3, 2)
        box(ctx, C(PAL.crow[1]), c.x + 3, c.y + (up ? -2 : 1), 3, 2)
      }
      // The reaper and his strength.
      reaper(ctx, HARVEST_REAPER - 10, GROUND + 6, t, s.swinging, s.tired)
      if (s.tired && !wasTired) {
        fx.float(L('Yoruldu!', 'Worn out!'), HARVEST_REAPER - 8, GROUND - 52, '#ec7a5a', 10, 1.1)
        play('miss')
      }
      wasTired = s.tired
      // The swath the scythe reaches.
      if (s.swinging) checker(ctx, '#fff4c0', HARVEST_REAPER - HV.reach, GROUND + 2, HV.reach * 2, 1)
      const bw = 50
      const bx = 8
      const by = 26
      box(ctx, C(PAL.ink), bx - 1, by - 1, bw + 2, 7)
      box(ctx, C(0x2a2030), bx, by, bw, 5)
      const fill = Math.round(bw * s.stamina)
      box(ctx, s.tired ? (Math.floor(t * 6) % 2 ? '#d0503c' : '#7a2224') : s.stamina < 0.3 ? '#e0a050' : '#74a852', bx, by, fill, 5)
      box(ctx, s.tired ? '#ec7a5a' : '#9cc464', bx, by, fill, 1)
      box(ctx, '#f3e6c8', bx + Math.round(bw * HV.stamina.recover), by - 1, 1, 7)
      text(ctx, s.tired ? L('Dinleniyor', 'Resting') : L('Güç', 'Strength'), bx, by + 7, { size: 8, color: s.tired ? '#ec7a5a' : '#c8b8a0' })
      if (s.combo !== lastCombo) {
        if (s.combo > lastCombo && s.combo % HV.comboEvery === 0) comboPulse = 0.25
        lastCombo = s.combo
      }
      comboPulse = Math.max(0, comboPulse - dt)
      hudCombo(ctx, s.combo, W - 8, 24, comboPulse)
      oval(ctx, C(PAL.gold[3]), 66, by + 2, 2, 2)
      text(ctx, `${s.cuts}`, 71, by - 2, { size: 9, color: '#f6de86' })
    }
  },
}
