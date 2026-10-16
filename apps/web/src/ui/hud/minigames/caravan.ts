import { CARAVAN_H, CARAVAN_LIMIT, CARAVAN_W, balance, caravanGame } from '@game/shared'
import type { CaravanState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { H, PAL, W, bake, box, checker, halo, hash, oval, pline, ramp, rgb, ridge, scroll, text, tone } from './art'
import type { Scene } from './Stage'

// The caravan road at the trade post: a desert road under a hot sky, dunes and a far domed city sliding by slowly, palms
// nearer; the merchant's camel plods along picking up coins and gems and minding the rocks.

const CV = balance.minigames.caravan
const ROAD_Y = 38
const KX = W / CARAVAN_W

function sky() {
  return bake('caravan-sky', W, ROAD_Y + 4, (b) => {
    b.sky(ramp(0x4a86c0, 0x6a9ec8, 0x9ab8c8, 0xd8c8a0, 0xf2dca0), 0, ROAD_Y + 4)
    b.glow(40, 12, 22, rgb(0xfff4c0), 0.6)
    b.disc(40, 12, 6, 6, rgb(0xfffbe0))
  })
}
// The far dunes and the city (repeats every 512).
function far() {
  return bake('caravan-far', 512, ROAD_Y + 4, (b) => {
    b.hills((x) => 22 + ridge(x, 71, 40, 512) * 10, ramp(0xa87c56, 0xc09468, 0xd4ac7c), 14, ROAD_Y + 4, 0.5)
    // A domed city with minarets.
    const cx = 300
    const base = 28
    b.rect(cx - 30, base - 8, 60, 8, rgb(0xd8c0a0))
    b.disc(cx, base - 10, 9, 8, (x, y) => (y < base - 8 ? rgb(x < cx ? 0xf2dcb8 : 0xc8ac88) : undefined))
    b.disc(cx - 18, base - 8, 5, 5, (_x, y) => (y < base - 7 ? rgb(0xe8d0ac) : undefined))
    b.disc(cx + 18, base - 8, 5, 5, (_x, y) => (y < base - 7 ? rgb(0xc8ac88) : undefined))
    b.rect(cx - 26, base - 22, 3, 14, rgb(0xe8d0ac))
    b.rect(cx + 24, base - 20, 3, 12, rgb(0xc8ac88))
    b.rect(cx, base - 21, 1, 3, rgb(0xc8952e))
  })
}
// Near dunes with palms (repeats every 512).
function near() {
  return bake('caravan-near', 512, ROAD_Y + 4, (b) => {
    b.hills((x) => 30 + ridge(x, 81, 26, 512) * 8, ramp(...PAL.sand), 14, ROAD_Y + 4, 0.8)
    for (let i = 0; i < 5; i++) {
      const px = 40 + i * 104 + hash(i, 0, 3) * 30
      const top = 12 + hash(i, 1, 3) * 6
      for (let y = top; y < 34; y++) b.set(px + Math.round(((y - top) * (y - top)) / 120), y, rgb(y % 3 ? 0x7a5430 : 0x5a3a20))
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        for (let r = 0; r < 9; r++) b.set(px + Math.cos(a) * r, top + Math.sin(a) * r * 0.5 + (r * r) / 18, tone(ramp(...PAL.leaf), 4 - r / 3, px + r, top))
      }
    }
  })
}
// The road's sand with ruts and pebbles (repeats every 256).
function road() {
  return bake('caravan-road', W, H - ROAD_Y, (b) => {
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < W; x++) {
        const rut = Math.abs(y - 30) < 2 || Math.abs(y - 70) < 2
        const verge = y > CARAVAN_H
        b.set(x, y, verge ? tone(ramp(0x6a7a3a, 0x8a9a48, 0xaab45a), 1 + (hash(x, y, 2) > 0.7 ? 1 : 0), x, y) : tone(ramp(...PAL.sand), 3.2 + (rut ? -1.2 : 0) + (hash(x >> 1, y, 3) - 0.5) * 0.9 - y / 140, x, y))
      }
    // Wind ripples in the sand, a shade lighter on their crests.
    for (let y = 2; y < CARAVAN_H; y += 5)
      for (let x = 0; x < W; x++) {
        const wy = y + Math.round(Math.sin((x + y * 7) / 9) * 1.2)
        if (hash(x >> 3, y, 9) > 0.55) b.set(x, wy, rgb(PAL.sand[4]))
      }
    // The dunes' shadow along the road's top edge.
    for (let y = 0; y < 6; y++) for (let x = 0; x < W; x++) b.tint(x, y, rgb(PAL.sand[0]), 0.5 - y / 12)
    // Pebbles, dry tufts and a bleached skull now and then.
    for (let i = 0; i < 40; i++) {
      const x = hash(i, 0, 5) * W
      const y = hash(i, 1, 5) * CARAVAN_H
      b.set(x, y, rgb(PAL.sand[1]))
      b.set(x + 1, y, rgb(PAL.sand[0]))
    }
    for (let i = 0; i < 9; i++) {
      const x = 8 + hash(i, 2, 5) * (W - 16)
      const y = 10 + hash(i, 3, 5) * (CARAVAN_H - 20)
      for (let k = -3; k <= 3; k++) b.line(x, y, x + k, y - 4 + Math.abs(k), rgb(k % 2 ? 0x8a8a3a : 0x6a6a2a))
      b.rect(x - 3, y + 1, 7, 1, rgb(PAL.sand[1]))
    }
    for (const [x, y] of [
      [70, 84],
      [200, 18],
    ] as const) {
      b.rect(x, y, 5, 3, rgb(0xeee6d2))
      b.set(x + 1, y + 1, rgb(0x4a3a2a))
      b.set(x + 3, y + 1, rgb(0x4a3a2a))
      b.rect(x + 1, y + 3, 3, 1, rgb(0xc8c0ae))
      b.rect(x, y + 4, 5, 1, rgb(PAL.sand[1]))
    }
  })
}

function camel(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, step: number) {
  const bob = Math.floor(step / 8) % 2
  const body = '#b08048'
  const dark = '#7a5430'
  const light = '#c89a5e'
  oval(ctx, '#8a6236', x, y + 7, 12, 2)
  // Four legs walking.
  const legs = [-7, -4, 4, 7]
  legs.forEach((lx, i) => {
    const phase = (Math.floor(step / 6) + i * 2) % 4
    const h = 8 - (phase === 1 ? 2 : 0)
    box(ctx, i % 2 ? dark : body, x + lx + (phase === 2 ? 1 : phase === 0 ? -1 : 0), y + 7 - h, 2, h)
  })
  // Body with its hump and blanket, the load on top.
  box(ctx, body, x - 10, y - 4 + bob, 20, 7)
  box(ctx, light, x - 10, y - 4 + bob, 20, 1)
  box(ctx, body, x - 5, y - 8 + bob, 10, 4)
  box(ctx, '#a8342e', x - 7, y - 7 + bob, 6, 5)
  box(ctx, '#f2d16b', x - 7, y - 3 + bob, 6, 1)
  box(ctx, '#3c5a96', x + 1, y - 7 + bob, 5, 5)
  box(ctx, '#d8c0a0', x - 4, y - 12 + bob, 8, 4)
  box(ctx, '#a89a78', x - 4, y - 9 + bob, 8, 1)
  // Neck and head.
  box(ctx, body, x + 9, y - 10 + bob, 3, 9)
  box(ctx, body, x + 10, y - 12 + bob, 6, 4)
  box(ctx, dark, x + 15, y - 11 + bob, 1, 2)
  box(ctx, '#14101a', x + 13, y - 11 + bob, 1, 1)
  box(ctx, light, x + 10, y - 12 + bob, 5, 1)
  // The tail swishing.
  box(ctx, dark, x - 11, y - 3 + bob + (Math.floor(t * 4) % 2), 1, 4)
  // The merchant riding between the bundles: turban, beard, a striped robe, the reins in hand.
  const rx = x - 1
  const ry = y - 13 + bob
  box(ctx, '#14101a', rx - 3, ry - 10, 8, 11)
  box(ctx, '#3c5a96', rx - 2, ry - 4, 6, 5)
  box(ctx, '#f2d16b', rx - 2, ry - 2, 6, 1)
  box(ctx, '#c48a5e', rx - 2, ry - 8, 5, 4)
  box(ctx, '#14101a', rx + 2, ry - 7, 1, 1)
  box(ctx, '#2a1a12', rx - 2, ry - 5, 4, 1)
  box(ctx, '#eee6d2', rx - 3, ry - 11, 7, 3)
  box(ctx, '#c8c0ae', rx + 1, ry - 10, 3, 2)
  box(ctx, '#a8342e', rx + 3, ry - 9, 1, 1)
  pline(ctx, '#5a3a20', rx + 4, ry - 2, x + 14, y - 10 + bob)
  box(ctx, '#c48a5e', rx + 3, ry - 3, 2, 2)
}

export const caravanScene: Scene<CaravanState> = {
  make: caravanGame,
  controls: 'Basılı tut: yukarı · bırak: aşağı',
  score: (s) => s.score,
  left: (s) => 1 - s.step / CARAVAN_LIMIT,
  create() {
    const top = sky()
    const farLayer = far()
    const nearLayer = near()
    const ground = road()
    const taken = new Set<CaravanState['things'][number]>()
    let dust = 0
    return (ctx, s, f) => {
      const { t, fx } = f
      const run = s.step * (CV.speed / 60) * KX
      ctx.drawImage(top, 0, 0)
      scroll(ctx, farLayer, run * 0.08, 0)
      scroll(ctx, nearLayer, run * 0.25, 0)
      scroll(ctx, ground, run, ROAD_Y)
      // Heat shimmer over the far dunes.
      for (let i = 0; i < 8; i++) checker(ctx, '#f8e8b8', (i * 37 + t * 20) % W, 30 + (i % 3), 10, 1, i)
      const cx = CV.camelX * KX
      const cy = ROAD_Y + s.y
      for (const th of s.things) {
        const x = Math.round(th.x * KX)
        const y = Math.round(ROAD_Y + th.y)
        if (th.taken && !taken.has(th)) {
          taken.add(th)
          if (th.kind === 'coin') {
            play('coin')
            fx.burst(x, y, 8, { colors: ['#fff4c0', '#f2d16b', '#c8952e'], speed: [20, 50], gravity: 40, life: [0.3, 0.6] })
            fx.float(`+${CV.coin}`, x, y - 12, '#f2d16b', 10, 0.7)
          } else if (th.kind === 'gem') {
            play('good')
            fx.burst(x, y, 18, { colors: ['#f2fbff', '#7ad0e8', '#2a6a8a'], speed: [30, 80], gravity: 20, life: [0.4, 0.9] })
            fx.float(`+${CV.gem}`, x, y - 14, '#7ad0e8', 13)
            fx.float('Mücevher!', x, y - 28, '#f2fbff', 9)
            fx.flash('#a6e4f2', 0.08)
          } else {
            play('miss')
            fx.shake(4, 0.3)
            fx.flash('#a8342e', 0.15)
            fx.float(`-${CV.rock}`, x, y - 14, '#ec7a5a', 12)
            fx.float('Tökezledi!', cx, cy - 30, '#ec7a5a', 9)
            fx.burst(x, y, 10, { colors: ['#8a827a', '#6a625a', '#c49a5a'], speed: [20, 60], angle: [-Math.PI, 0], gravity: 200 })
          }
        }
        if (th.taken && th.kind !== 'rock') continue
        if (th.kind === 'coin') {
          // A coin turning.
          const turn = Math.abs(Math.sin(t * 6 + th.x * 0.1))
          const w = Math.max(1, Math.round(turn * 3))
          oval(ctx, '#a87c46', x, y + 5, 3, 1)
          oval(ctx, '#14101a', x, y, w + 1.5, 4)
          oval(ctx, '#8a6420', x, y, w + 0.5, 3.5)
          if (w > 1) oval(ctx, '#f2d16b', x - 0.5, y - 0.5, w - 0.5, 2.5)
          if (w > 2) box(ctx, '#c8952e', x, y - 1, 1, 3)
          box(ctx, '#fff4c0', x - w + 1, y - 2, 1, 1)
        } else if (th.kind === 'gem') {
          halo(ctx, '#a6e4f2', x, y, 7, 0.4)
          oval(ctx, '#8a6236', x, y + 5, 3, 1)
          box(ctx, '#2a6a8a', x - 1, y - 4, 3, 8)
          box(ctx, '#2a6a8a', x - 3, y - 1, 7, 3)
          box(ctx, '#7ad0e8', x - 1, y - 3, 3, 6)
          box(ctx, '#7ad0e8', x - 2, y - 1, 5, 2)
          if (Math.floor(t * 5 + th.y) % 4 === 0) {
            box(ctx, '#ffffff', x + 3, y - 6, 1, 3)
            box(ctx, '#ffffff', x + 2, y - 5, 3, 1)
          }
        } else {
          oval(ctx, '#8a6236', x + 1, y + 4, 7, 2)
          box(ctx, '#4a4440', x - 6, y - 2, 12, 6)
          box(ctx, '#6a625a', x - 5, y - 5, 9, 7)
          box(ctx, '#8a827a', x - 4, y - 5, 4, 2)
          box(ctx, '#a8a098', x - 3, y - 5, 1, 1)
          box(ctx, '#3a3430', x + 2, y, 3, 3)
        }
      }
      // The camel, blinking while it stumbles, kicking up dust.
      const blink = s.stumble > 0 && Math.floor(s.step / 4) % 2 === 1
      if (!blink) camel(ctx, cx, cy, t, s.step)
      if (t - dust > 0.12 && f.phase === 'play') {
        dust = t
        fx.burst(cx - 8, cy + 7, 2, { colors: ['#eed294', '#dcb874', '#c49a5a'], speed: [10, 25], angle: [Math.PI * 0.9, Math.PI * 1.1], gravity: -10, life: [0.4, 0.7] })
      }
      text(ctx, `${s.coins}`, 18, 22, { size: 9, color: '#f2d16b' })
      oval(ctx, '#f2d16b', 11, 27, 3, 3)
      text(ctx, `${s.gems}`, 40, 22, { size: 9, color: '#7ad0e8' })
      box(ctx, '#7ad0e8', 32, 24, 3, 6)
    }
  },
}
