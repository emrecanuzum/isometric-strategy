import { FISH_H, FISH_LIMIT, FISH_ZONE, fishGame } from '@game/shared'
import { L } from '../../../lib/i18n'
import type { FishState } from '@game/shared'
import { play } from '../../../audio/sfx'
import { C, H, PAL, W, bake, birds, box, checker, halo, hash, oval, pline, ramp, rgb, ridge, text, tone } from './art'
import type { Scene } from './Stage'

// The mysterious fisher's hut: a still pond at dusk, the strange fisher on his little jetty with the rod bent, and a
// window into the deep water on the right where the fish darts and the green catch zone follows it.

const PANEL = { x: 158, y: 24, w: 50, h: 116 }
const BAR = { x: 216, y: 24, w: 9, h: 116 }
const POND = 84
const toY = (v: number) => PANEL.y + (v * PANEL.h) / FISH_H

function backdrop() {
  return bake('fishing-back', W, H, (b) => {
    b.sky(ramp(0x1e2450, 0x3a3466, 0x6a4a72, 0xb06a6a, 0xe89a6a, 0xf6c88a), 0, POND)
    b.glow(70, POND - 4, 30, rgb(0xfadc96), 0.6, 0.6)
    b.hills((x) => POND - 20 + ridge(x, 91, 22, W) * 10, ramp(0x1a1830, 0x262240, 0x34304e), 16, POND, 0.3)
    // Trees on the far bank.
    for (let i = 0; i < 18; i++) {
      const x = hash(i, 0, 2) * 150
      const r = 4 + hash(i, 1, 2) * 4
      b.disc(x, POND - 6 - r, r, r * 1.2, (px, py, d) => tone(ramp(0x121428, 0x1a1e34, 0x262a44), 2 - d * 1.5 - (px > x ? 0.6 : 0), px, py))
    }
    // The pond with the sunset in it.
    for (let y = POND; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = (y - POND) / (H - POND)
        let c = tone(ramp(0x141c38, 0x1e2c50, 0x2c406a, 0x4a5a80, 0x8a6a7a), 3.6 - k * 3.4, x, y)
        if (Math.abs(x - 70) < 22 - k * 12 && (y & 1) === 0 && hash(x >> 2, y, 4) > 0.5) c = rgb(k < 0.25 ? 0xf6c88a : 0xb06a6a)
        b.set(x, y, c)
      }
    // Reeds by the bank.
    for (let i = 0; i < 26; i++) {
      const x = 100 + hash(i, 0, 6) * 54
      const h = 8 + hash(i, 1, 6) * 12
      b.line(x, POND + 6, x + (hash(i, 2, 6) - 0.5) * 3, POND + 6 - h, rgb(i % 3 ? 0x2a3a24 : 0x3a4a2c))
      if (i % 4 === 0) b.rect(x - 1, POND + 6 - h, 2, 4, rgb(0x5a3a20))
    }
    // The jetty and the hut's corner.
    for (let y = POND + 18; y < H; y++)
      for (let x = 0; x < 78 - (y - POND - 18) * 0.3; x++) b.set(x, y, x % 8 === 0 ? rgb(PAL.wood[0]) : tone(ramp(...PAL.wood), 2.2 - (y - POND - 18) / 30 + (y === POND + 18 ? 1.4 : 0), x, y))
    for (const px of [12, 44, 70]) b.rect(px, POND + 12, 3, 8, rgb(PAL.wood[1]))
    b.rect(0, 40, 24, POND - 22, (x, y) => tone(ramp(...PAL.wood), 1 + (y % 5 === 0 ? -0.8 : 0.4), x, y))
    for (let j = 0; j < 10; j++) b.rect(0, 40 - j, 30 - j * 2, 1, rgb(j % 2 ? 0x4a3418 : 0x6e5024))
    b.rect(10, 52, 6, 6, rgb(0xe6a040))
    b.rect(11, 53, 4, 4, rgb(0xfadc96))
  })
}

export const fishingScene: Scene<FishState> = {
  make: fishGame,
  controls: L('Basılı tut: yeşil alan yükselir · bırak: düşer', 'Hold: the green zone rises · release: it falls'),
  left: (s) => 1 - s.step / FISH_LIMIT,
  create() {
    const back = backdrop()
    let wasInside = false
    let lastFish = 0
    let ripple = 0
    return (ctx, s, f) => {
      const { t, fx } = f
      ctx.drawImage(back, 0, 0)
      birds(ctx, t, 21, '#1a1830', 2, 30)
      // Fireflies over the reeds.
      for (let i = 0; i < 7; i++) {
        const x = 104 + hash(i, 0, 8) * 50 + Math.sin(t * 0.8 + i) * 5
        const y = POND - 10 + Math.cos(t * 1.1 + i * 2) * 6
        if (Math.floor(t * 3 + i) % 3 !== 0) box(ctx, '#f6f0a0', x, y, 1, 1)
      }
      // The fisher: a hooded figure on a stool, the rod bent the harder the fish fights.
      const fx0 = 52
      const fy = POND + 18
      box(ctx, C(PAL.wood[1]), fx0 - 4, fy - 6, 9, 2)
      box(ctx, C(PAL.wood[1]), fx0 - 3, fy - 4, 1, 4)
      box(ctx, C(PAL.wood[1]), fx0 + 3, fy - 4, 1, 4)
      box(ctx, '#2a2a40', fx0 - 4, fy - 20, 9, 14)
      box(ctx, '#3a3a5a', fx0 - 4, fy - 20, 2, 14)
      box(ctx, '#2a2a40', fx0 - 3, fy - 27, 7, 7)
      box(ctx, '#14101a', fx0 - 1, fy - 25, 4, 4)
      box(ctx, '#f6f0a0', fx0 + 1, fy - 24, 1, 1)
      const tug = s.inside ? 1 : 0.3
      const bend = (s.progress * 6 + tug * 4) * (1 + Math.sin(t * 14) * 0.08)
      const hand: [number, number] = [fx0 + 5, fy - 14]
      const tip: [number, number] = [hand[0] + 44, hand[1] - 30 + bend]
      const rodAt = (k: number): [number, number] => [hand[0] + (tip[0] - hand[0]) * k, hand[1] + (tip[1] - hand[1]) * k + Math.sin(k * Math.PI) * -6 + k * k * bend]
      for (let i = 0; i < 12; i++) {
        const [x0, y0] = rodAt(i / 12)
        const [x1, y1] = rodAt((i + 1) / 12)
        pline(ctx, '#14101a', x0, y0 + 1, x1, y1 + 1)
        pline(ctx, i < 4 ? C(PAL.wood[2]) : C(PAL.wood[4]), x0, y0, x1, y1)
      }
      tip[1] = rodAt(1)[1]
      box(ctx, C(PAL.skin[1]), hand[0] - 1, hand[1] - 1, 3, 3)
      // The line down to the float in the pond.
      const flx = 118
      const fly = POND + 10 + Math.round(Math.sin(t * 3) + (s.inside ? Math.sin(t * 18) : 0))
      pline(ctx, '#c8c0ae', tip[0], tip[1], flx, fly)
      box(ctx, '#d0503c', flx - 1, fly - 2, 3, 2)
      box(ctx, '#f3e6c8', flx - 1, fly, 3, 1)
      if (t - ripple > 0.6) ripple = t
      const rr = (t - ripple) * 14
      checker(ctx, '#8aa0c0', flx - rr, fly + 2, rr * 2, 1)
      // The window into the deep: water, reeds, rays of light, bubbles.
      const p = PANEL
      box(ctx, C(PAL.ink), p.x - 3, p.y - 3, p.w + 6, p.h + 6)
      box(ctx, C(PAL.wood[2]), p.x - 2, p.y - 2, p.w + 4, p.h + 4)
      box(ctx, C(PAL.wood[3]), p.x - 2, p.y - 2, p.w + 4, 1)
      for (let y = 0; y < p.h; y++) {
        const k = y / p.h
        box(ctx, C(k < 0.25 ? 0x2c5a7a : k < 0.5 ? 0x22486a : k < 0.75 ? 0x1a3a5a : 0x142c48), p.x, p.y + y, p.w, 1)
      }
      for (let i = 0; i < 3; i++) {
        const rx = p.x + 6 + i * 16 + Math.sin(t * 0.7 + i) * 3
        for (let y = 0; y < p.h * 0.7; y += 2) box(ctx, '#3a6a8a', rx + y * 0.2, p.y + y, 2, 1)
      }
      for (let i = 0; i < 5; i++) {
        const rx = p.x + 4 + i * 10
        const sway = Math.round(Math.sin(t * 1.5 + i) * 2)
        pline(ctx, '#1e4a30', rx, p.y + p.h, rx + sway, p.y + p.h - 18 - (i % 3) * 6)
      }
      for (let i = 0; i < 6; i++) {
        const age = (t * 0.4 + hash(i, 0, 9)) % 1
        box(ctx, '#8ac0d8', p.x + 4 + hash(i, 1, 9) * (p.w - 8) + Math.sin(t * 3 + i), p.y + p.h - age * p.h, 1, 1)
      }
      // The catch zone: a glowing net band.
      const zy = Math.round(toY(s.zone))
      const zh = Math.round((FISH_ZONE * p.h) / FISH_H)
      checker(ctx, s.inside ? '#9cc464' : '#4f8c40', p.x + 1, zy, p.w - 2, zh)
      box(ctx, s.inside ? '#c8f080' : '#74a852', p.x, zy, p.w, 2)
      box(ctx, s.inside ? '#c8f080' : '#74a852', p.x, zy + zh - 2, p.w, 2)
      box(ctx, s.inside ? '#c8f080' : '#74a852', p.x, zy, 2, zh)
      box(ctx, s.inside ? '#c8f080' : '#74a852', p.x + p.w - 2, zy, 2, zh)
      // The fish, turning as it darts.
      const fyy = Math.round(toY(s.fish))
      const fxx = p.x + p.w / 2 + Math.round(Math.sin(t * 2.5) * 8)
      const up = s.fishV < 0
      const wag = Math.floor(t * 12) % 2
      oval(ctx, '#e2c48a', fxx, fyy, 7, 3)
      oval(ctx, '#f6deaa', fxx, fyy - 1, 5, 1.5)
      box(ctx, '#c8a060', fxx - 10, fyy - 2 + wag, 4, 5 - wag * 2)
      box(ctx, '#14101a', fxx + 4, fyy - 1, 1, 1)
      box(ctx, '#c8a060', fxx - 1, fyy - 5 + (up ? 0 : 1), 3, 2)
      if (s.inside) halo(ctx, '#fff4c0', fxx, fyy, 9, 0.35)
      if (Math.abs(s.fishV) > 120 && t - lastFish > 0.2) {
        lastFish = t
        fx.burst(fxx, fyy, 4, { colors: ['#a6d4e0', '#6aa8c2'], speed: [10, 30], gravity: -40, life: [0.3, 0.6] })
      }
      if (s.inside !== wasInside) {
        wasInside = s.inside
        if (s.inside) {
          play('click')
          fx.burst(flx, fly, 8, { colors: ['#eef6fa', '#a6d4e0'], speed: [20, 50], angle: [-Math.PI, 0], gravity: 200 })
        }
      }
      // The bar filling while the fish is in the zone.
      const b = BAR
      box(ctx, C(PAL.ink), b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      box(ctx, '#2a2030', b.x, b.y, b.w, b.h)
      const fill = Math.round(s.progress * b.h)
      const col = s.progress > 0.66 ? '#9cc464' : s.progress > 0.33 ? '#f2d16b' : '#ec7a5a'
      box(ctx, col, b.x + 1, b.y + b.h - fill, b.w - 2, fill)
      box(ctx, '#ffffff', b.x + 1, b.y + b.h - fill, 1, fill)
      oval(ctx, '#e2c48a', b.x + b.w / 2, b.y - 8, 4, 2)
      text(ctx, s.inside ? L('Tuttun!', 'Hooked!') : L('Kaçıyor!', 'Getting away!'), 104, 28, { align: 'center', size: 10, color: s.inside ? '#c8f080' : '#ec7a5a' })
      if (s.over) text(ctx, s.caught ? L('Yakaladın!', 'Caught it!') : L('Balık kaçtı', 'It got away'), 104, 42, { align: 'center', size: 12, color: s.caught ? '#f2d16b' : '#ec7a5a' })
    }
  },
}
