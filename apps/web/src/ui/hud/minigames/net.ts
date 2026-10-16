import { NET_BAND, NET_LIMIT, balance, netGame } from '@game/shared'
import type { NetState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, birds, box, checker, cloudLayer, halo, hash, oval, pline, ramp, rgb, ridge, scroll, text, tone } from './art'
import type { Scene } from './Stage'

// Hauling the net at the dock: evening on the lake, two fishermen on the jetty heaving a rope, the net coming up out of
// the water full of fish, and the catch piling up on the planks.

const NT = balance.minigames.net
const WATER = 74
const NET_X = 172
const GAUGE = { x: 234, y: 30, w: 10, h: 90 }

function backdrop() {
  return bake('net-back', W, H, (b) => {
    b.sky(ramp(...PAL.skyDusk), 0, WATER)
    b.glow(120, WATER - 6, 40, rgb(0xfadc96), 0.55, 0.5)
    b.disc(120, WATER - 4, 9, 9, (_x, y) => (y < WATER - 1 ? rgb(0xffe8a8) : undefined))
    b.hills((x) => WATER - 16 + ridge(x, 31, 30, W) * 10, ramp(0x2a2040, 0x3a2c50, 0x4c3a5e, 0x5e486a), 20, WATER, 0.4)
    b.hills((x) => WATER - 6 + ridge(x, 41, 14, W) * 5, ramp(0x1a1830, 0x262340, 0x332e4c), 10, WATER, 0.3)
    // The lake, darkening with depth, with the sun's road on it.
    for (let y = WATER; y < H; y++)
      for (let x = 0; x < W; x++) {
        const deep = (y - WATER) / (H - WATER)
        let c = tone(ramp(0x1a2a4a, 0x26406a, 0x34567e, 0x4a6e8e, 0x7a8aa0), 3.6 - deep * 3.2, x, y)
        const road = Math.abs(x - 120) < 30 - deep * 10 && hash(Math.floor(x / 3), y, 7) > 0.55 && (y & 1) === 0
        if (road) c = rgb(deep < 0.3 ? 0xfadc96 : 0xd8825a)
        b.set(x, y, c)
      }
    // The jetty: planks on posts, from the left.
    for (let y = 98; y < H; y++)
      for (let x = 0; x < 112 - (y - 98) * 0.2; x++) {
        const plank = Math.floor(x / 9)
        const seam = x % 9 === 0
        b.set(x, y, seam ? rgb(PAL.wood[0]) : tone(ramp(...PAL.wood), 2.6 + (hash(plank, Math.floor(y / 3), 3) - 0.5) + (y === 98 ? 1.5 : 0) - (y - 98) / 40, x, y))
      }
    for (const px of [10, 46, 82, 104]) b.rect(px, 92, 4, 8, (x, y) => tone(ramp(...PAL.wood), 1 + (x - px), x, y))
    // A bollard with rope coils and a basket.
    b.disc(30, 118, 7, 3, rgb(0x8a6640))
    b.disc(30, 117, 5, 2, rgb(0xa8845a))
    b.rect(6, 104, 12, 9, (x, y) => tone(ramp(...PAL.cloth), 1.5 + ((x + y) % 3 === 0 ? 1 : 0), x, y))
  })
}

// A fisherman leaning back on the rope; `lean` 0 … 1 how hard he heaves.
function fisherman(ctx: CanvasRenderingContext2D, x: number, y: number, lean: number, coat: readonly number[], t: number) {
  const back = Math.round(lean * 4)
  checker(ctx, C(0x2a1a12), x - 8, y - 1, 16, 2)
  box(ctx, C(0x2a2a3a), x - 4 - back, y - 10, 3, 9)
  box(ctx, C(0x2a2a3a), x + 2, y - 10, 3, 9)
  box(ctx, C(0x1c120c), x - 5 - back, y - 2, 4, 2)
  box(ctx, C(0x1c120c), x + 2, y - 2, 4, 2)
  const top = y - 23 + Math.round(lean)
  for (let j = 0; j < 13; j++) box(ctx, C(coat[j < 2 ? 2 : 1]), x - 4 - Math.round((back * (13 - j)) / 13), top + j, 9, 1)
  box(ctx, C(PAL.skin[2]), x - 3 - back, top - 7, 6, 7)
  box(ctx, C(PAL.ink), x + 1 - back, top - 5, 1, 1)
  box(ctx, C(0xc8a040), x - 4 - back, top - 9, 8, 3)
  box(ctx, C(0xe6c050), x - 4 - back, top - 9, 8, 1)
  const hand: [number, number] = [x + 6 - back, top + 6 + Math.round(Math.sin(t * 8) * lean)]
  pline(ctx, C(coat[1]), x - back, top + 3, hand[0], hand[1], 2)
  box(ctx, C(PAL.skin[2]), hand[0], hand[1] - 1, 2, 2)
  return hand
}

export const netScene: Scene<NetState> = {
  make: netGame,
  controls: 'Basılı tut: ipi çek · gerginliği yeşilde tut',
  score: (s) => s.score,
  left: (s) => 1 - s.step / NET_LIMIT,
  create() {
    const back = backdrop()
    const clouds = cloudLayer('net-clouds', 512, 40, rgb(0xd88a7a), rgb(0x9a5a6a), 41, 5)
    let hauls = 0
    let tears = 0
    let pile = 0
    let lastSurge = 0
    let lifted: { y: number; fish: number; life: number } | null = null
    return (ctx, s, f) => {
      const { t, fx, dt } = f
      ctx.drawImage(back, 0, 0)
      scroll(ctx, clouds, t * 2, 4)
      birds(ctx, t, 31, '#2a1a30', 3, 26)
      // Glints on the water.
      for (let i = 0; i < 26; i++) {
        const x = (hash(i, 0, 5) * W + t * (4 + hash(i, 1, 5) * 6)) % W
        const y = WATER + 3 + hash(i, 2, 5) * 60
        if (Math.floor(t * 2 + i) % 3 === 0) continue
        box(ctx, Math.abs(x - 120) < 28 ? '#fae2be' : '#7a96b8', x, y, 2 + (i % 3), 1)
      }
      // Events: nets torn and nets landed.
      while (tears < s.tears.length) {
        const tear = s.tears[tears++]
        play('miss')
        fx.shake(4, 0.3)
        fx.flash('#a8342e', 0.15)
        fx.float('Ağ yırtıldı!', NET_X, WATER - 16, '#ec7a5a', 11)
        if (tear.lost) fx.float(`-${tear.lost} balık`, NET_X, WATER - 4, '#ec7a5a', 9)
        for (let i = 0; i < tear.lost; i++) fx.burst(NET_X, WATER + 2, 1, { colors: ['#c8d0d8', '#8aa0b0'], speed: [60, 90], angle: [-Math.PI * 0.7, -Math.PI * 0.3], gravity: 260, life: [0.5, 0.7], size: [2, 3] })
        fx.burst(NET_X, WATER, 14, { colors: ['#eef6fa', '#a6d4e0', '#6aa8c2'], speed: [30, 80], angle: [-Math.PI, 0], gravity: 220 })
      }
      while (hauls < s.hauls.length) {
        const h = s.hauls[hauls++]
        play('splash')
        play('coin')
        lifted = { y: WATER - 22, fish: h.fish, life: 0.9 }
        pile += h.fish
        fx.float(`+${h.points}`, NET_X - 30, WATER - 38, '#f2d16b', 14)
        if (h.perfect) fx.float('Kusursuz ağ!', NET_X - 30, WATER - 52, '#fff4c0', 10)
        fx.burst(NET_X, WATER, 20, { colors: ['#eef6fa', '#a6d4e0', '#6aa8c2'], speed: [40, 100], angle: [-Math.PI, 0], gravity: 240 })
        fx.shake(2, 0.2)
      }
      // The fish surging: the water boils round the net.
      const surging = s.surge > 0 && s.pause <= 0
      if (surging && t - lastSurge > 0.08) {
        lastSurge = t
        fx.burst(NET_X + (Math.random() - 0.5) * 24, WATER + 1, 3, { colors: ['#eef6fa', '#a6d4e0'], speed: [20, 50], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: 200, life: [0.3, 0.5] })
      }
      // The net, rising from the depths as it is hauled.
      const depth = 1 - Math.min(1, s.progress)
      const ny = WATER - 6 + Math.round(depth * 52)
      const nw = 34
      const wobble = surging ? Math.round(Math.sin(t * 40) * 2) : 0
      if (s.pause <= 0 || !lifted) {
        for (let j = 0; j < 22; j++)
          for (let i = 0; i < nw; i++) {
            const x = NET_X - nw / 2 + i + wobble
            const y = ny + j
            const curve = Math.round(((i - nw / 2) * (i - nw / 2)) / 60)
            if (j < curve) continue
            const mesh = (i + j) % 4 === 0 || (i - j + 400) % 4 === 0
            if (!mesh) continue
            const under = y > WATER
            box(ctx, under ? '#7a9ab8' : '#d8c89a', x, y, 1, 1)
          }
        // The fish in it.
        for (let k = 0; k < s.fish; k++) {
          const fx0 = NET_X - nw / 2 + 5 + ((k * 7) % (nw - 10)) + wobble + Math.round(Math.sin(t * 9 + k) * 1.5)
          const fy0 = ny + 9 + ((k * 5) % 10)
          const under = fy0 > WATER
          box(ctx, under ? '#9ab4c4' : '#d8e0e8', fx0, fy0, 5, 2)
          box(ctx, under ? '#4a6a80' : '#8aa0b0', fx0 - 2, fy0 - 1 + ((Math.floor(t * 10) + k) % 2), 2, 3)
        }
        // The water line over the sunken part.
        checker(ctx, '#7a96b8', NET_X - nw / 2 - 2 + wobble, WATER, nw + 4, 1)
      }
      // A landed net swinging up onto the jetty.
      if (lifted) {
        lifted.life -= dt
        const k = 1 - lifted.life / 0.9
        const lx = NET_X - k * 90
        const ly = lifted.y - Math.sin(k * Math.PI) * 26
        oval(ctx, '#c8b88a', lx, ly, 10, 6)
        for (let i = 0; i < Math.min(8, lifted.fish); i++) box(ctx, '#c8d0d8', lx - 7 + i * 2, ly - 2 + (i % 2), 3, 2)
        if (lifted.life <= 0) lifted = null
      }
      // The catch piling on the planks.
      for (let i = 0; i < Math.min(pile, 60); i++) {
        const px = 52 + (i % 10) * 4 + (Math.floor(i / 10) % 2) * 2
        const py = 116 - Math.floor(i / 10) * 2
        box(ctx, i % 5 === 0 ? '#d8a070' : '#b8c4cc', px, py, 4, 2)
        box(ctx, '#7a8a96', px + 3, py, 1, 2)
      }
      // The rope from the fishermen's hands to the net, taut as the tension.
      const lean = Math.min(1, s.tension) * (s.pulling ? 1 : 0.4)
      const h1 = fisherman(ctx, 74, 112, lean, PAL.blue, t)
      const h2 = fisherman(ctx, 92, 110, lean * 0.9, PAL.red, t + 0.3)
      const sag = Math.round((1 - Math.min(1, s.tension)) * 10)
      const ropeColor = s.tension > NET_BAND[1] ? (Math.floor(t * 10) % 2 ? '#ec7a5a' : '#d0a070') : '#d0b888'
      const mid = [(h2[0] + NET_X) / 2, (h2[1] + ny) / 2 + sag] as const
      pline(ctx, ropeColor, h1[0], h1[1], h2[0], h2[1])
      pline(ctx, ropeColor, h2[0], h2[1], mid[0], mid[1])
      pline(ctx, ropeColor, mid[0], mid[1], NET_X, ny - 2)
      if (s.tension > NET_BAND[1]) halo(ctx, '#ec7a5a', mid[0], mid[1], 3, 0.6)
      // The tension gauge: slack, the safe band, too taut.
      const g = GAUGE
      box(ctx, C(PAL.ink), g.x - 2, g.y - 2, g.w + 4, g.h + 4)
      box(ctx, C(PAL.wood[2]), g.x - 1, g.y - 1, g.w + 2, g.h + 2)
      box(ctx, C(0x1c1420), g.x, g.y, g.w, g.h)
      const toY = (v: number) => g.y + g.h - Math.round(Math.min(1, v) * g.h)
      box(ctx, C(0x7a2224), g.x, g.y, g.w, toY(NET_BAND[1]) - g.y)
      box(ctx, C(0x3e6a2c), g.x, toY(NET_BAND[1]), g.w, toY(NET_BAND[0]) - toY(NET_BAND[1]))
      box(ctx, C(0x5e9234), g.x, toY(NET_BAND[1]), 1, toY(NET_BAND[0]) - toY(NET_BAND[1]))
      const ty = toY(s.tension)
      const inBand = s.tension >= NET_BAND[0] && s.tension <= NET_BAND[1]
      box(ctx, inBand ? '#9cc464' : s.tension > NET_BAND[1] ? '#ec7a5a' : '#e0a050', g.x + 1, ty, g.w - 2, g.y + g.h - ty)
      box(ctx, '#f3e6c8', g.x - 4, ty - 1, g.w + 8, 2)
      text(ctx, 'Gerginlik', g.x + g.w / 2, g.y + g.h + 4, { align: 'center', size: 8, color: '#c8b8a0' })
      // The haul's progress, and the nets.
      const bx = 128
      const by = 26
      box(ctx, C(PAL.ink), bx - 1, by - 1, 82, 7)
      box(ctx, C(0x2a2030), bx, by, 80, 5)
      box(ctx, '#6aa8c2', bx, by, Math.round(80 * Math.min(1, s.progress)), 5)
      box(ctx, '#a6d4e0', bx, by, Math.round(80 * Math.min(1, s.progress)), 1)
      text(ctx, `Ağ ${Math.min(NT.nets, s.hauls.length + 1)}/${NT.nets}`, bx, by + 7, { size: 8 })
      text(ctx, `${s.fish} balık${s.torn ? ' · yırtık' : ''}`, bx + 80, by + 7, { size: 8, align: 'right', color: s.torn ? '#ec7a5a' : '#c8b8a0' })
      if (surging) text(ctx, 'Balıklar çırpınıyor!', NET_X, WATER + 34, { align: 'center', size: 9, color: '#a6d4e0' })
    }
  },
}
