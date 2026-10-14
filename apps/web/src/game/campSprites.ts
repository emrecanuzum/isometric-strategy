import { KINGDOM_COLORS } from './buildingSprites'
import type { KingdomColor } from './buildingSprites'
import { Canvas, TIMBER, pick, ramp, rgb } from './sprites'
import type { Sprite } from './sprites'

// The crown kingdoms' war camps (CLAUDE.md §7.8): canvas tents in the crown's colour, a great striped pavilion for its
// commander, banners on tall poles and racks of spears. Drawn once per colour.

const CANVAS = ramp(0x8a8270, 0xb4ac98, 0xd4ccb6, 0xe8e2cc, 0xf6f2e2)
const GOLD = ramp(0x7a5a18, 0xb08a2a, 0xe2c058, 0xfff0a0)
const STEEL = rgb(0xd6dae0)

const cloth = (color: KingdomColor) => KINGDOM_COLORS[color].roofs

// A ridge tent on one tile: two sloping canvas sides, the lit one pale, the shaded one in the crown's colour, a dark
// opening at the front and a pennant on the ridge pole.
export function tent(color: KingdomColor, variant = 0): Sprite {
  const c = cloth(color)
  const canvas = new Canvas(64, 52)
  const cx = 32
  const base = 46
  const tall = 30 + (variant % 2) * 4
  // The tent spans the tile's diamond, its ridge running from back to front corner.
  for (let y = 0; y <= tall; y++) {
    const half = Math.round((1 - y / tall) * 30)
    for (let x = -half; x <= half; x++) {
      const lit = x < 0
      const g = base - y - Math.abs(x) * 0.25
      const stripe = Math.floor((x + 40) / 6) % 2 === 0
      canvas.set(cx + x, Math.round(g), lit ? pick(CANVAS, 3 - y / tall + (stripe ? 0.6 : 0)) : pick(c, 2.4 + (stripe ? 0.8 : 0) - y / tall))
    }
  }
  // The opening.
  for (let y = 0; y < tall * 0.5; y++) for (let x = -Math.round(4 - y / 3); x <= 0; x++) canvas.set(cx + 6 + x, base - y, rgb(0x2a1c10))
  // Ridge pole and pennant.
  for (let z = 0; z < 8; z++) canvas.set(cx, base - tall - z, TIMBER[1])
  for (let d = 0; d < 6; d++) canvas.set(cx + 1 + d, base - tall - 7 + Math.floor(d / 3), c[4])
  return canvas.sprite(cx, base, 0)
}

// The commander's pavilion on two tiles: a round tent striped in the crown's colour and white, its scalloped edge,
// a gilded finial and a great banner.
export function pavilion(color: KingdomColor): Sprite {
  const c = cloth(color)
  const canvas = new Canvas(130, 140)
  const cx = 65
  const base = 120
  const r = 44
  const wall = 30
  // The wall of the tent, striped.
  for (let x = -r; x <= r; x++) {
    const f = x / r
    const curve = Math.sqrt(1 - f * f) * r * 0.5
    const stripe = Math.floor((x + r) / 7) % 2 === 0
    for (let z = -curve; z <= wall; z++) {
      const lit = 3 - (f + 1) * 1.2
      canvas.set(cx + x, Math.round(base - 22 - z), stripe ? pick(c, 1.5 + lit * 0.7) : pick(CANVAS, lit + 0.6))
    }
    // Scallops under the roof's edge.
    if ((x + r) % 6 < 3) canvas.set(cx + x, Math.round(base - 22 - wall + 2 - curve), c[1])
  }
  // The open door at the front, curtains drawn back.
  for (let z = 0; z < 22; z++) for (let x = -5; x <= 5; x++) canvas.set(cx + x, base - 22 + Math.round(Math.sqrt(1 - (x / r) ** 2) * r * 0.5) - z, Math.abs(x) > 3 ? c[3] : rgb(0x24180e))
  // The conical roof.
  const cone = 46
  for (let y = 0; y <= cone; y++) {
    const half = (y / cone) * (r + 4)
    for (let x = Math.ceil(-half); x <= half; x++) {
      const f = x / (half + 0.01)
      const stripe = Math.floor((f + 1) * 6) % 2 === 0
      canvas.set(cx + x, base - 22 - wall - cone + y - Math.round(Math.sqrt(Math.max(0, 1 - f * f)) * (y / cone) * 6), stripe ? pick(c, 3 - (f + 1) * 1.1) : pick(CANVAS, 3.6 - (f + 1) * 1.2))
    }
  }
  // Gilded finial and the great banner.
  const top = base - 22 - wall - cone
  for (let z = 0; z < 6; z++) for (let d = -1; d <= 1; d++) canvas.set(cx + d, top - z, GOLD[d < 0 ? 3 : 2])
  for (let z = 0; z < 24; z++) canvas.set(cx, top - 6 - z, TIMBER[1])
  for (let y = 0; y < 10; y++) for (let d = 1; d < 18 - (y > 6 ? (y - 6) * 3 : 0); d++) canvas.set(cx + d, top - 28 + y + Math.round(Math.sin(d / 3) * 1), y === 0 || y === 9 ? GOLD[2] : c[3])
  return canvas.sprite(cx, base, 0)
}

// A stretch of palisade on one tile: sharpened stakes across the tile's middle, running along x or y, with two rails.
export function palisade(along: 'x' | 'y'): Sprite {
  const canvas = new Canvas(68, 52)
  const cx = 34
  const base = 46
  // The tile's middle is 16 pixels up from its front corner; a step along x goes right and down, along y left and down.
  const dx = along === 'x' ? 32 : -32
  const point = (t: number) => ({ x: Math.round(cx + t * dx), y: Math.round(base - 16 + t * 16) })
  for (let t = -0.5; t <= 0.5; t += 0.1) {
    const p = point(t)
    for (let z = 0; z < 22; z++) {
      canvas.set(p.x, p.y - z, TIMBER[z > 19 ? 2 : 1])
      canvas.set(p.x + 1, p.y - z, TIMBER[0])
    }
  }
  for (let t = -0.5; t <= 0.5; t += 1 / 64) {
    const p = point(t)
    for (const z of [6, 15]) canvas.set(p.x, p.y - z, TIMBER[2])
  }
  return canvas.sprite(cx, base, 0)
}

// A rack of spears and a tall banner pole, on one tile.
export function rack(color: KingdomColor): Sprite {
  const c = cloth(color)
  const canvas = new Canvas(40, 80)
  const cx = 20
  const base = 72
  for (let t = -10; t <= 10; t++) canvas.set(cx + t, base - 8 + t / 2, TIMBER[2])
  for (let t = -9; t <= 9; t += 3) {
    for (let z = 0; z < 20; z++) canvas.set(cx + t, base - 6 + t / 2 - z, TIMBER[1])
    canvas.set(cx + t, base - 27 + t / 2, STEEL)
    canvas.set(cx + t, base - 28 + t / 2, STEEL)
  }
  for (let z = 0; z < 60; z++) canvas.set(cx + 12, base - z, TIMBER[z > 56 ? 2 : 1])
  for (let y = 0; y < 14; y++) for (let d = 1; d < 13; d++) if (!(y > 9 && Math.abs(d - 6) < y - 9)) canvas.set(cx + 12 - d, base - 58 + y, d === 1 ? GOLD[1] : c[3 - (d & 1)])
  return canvas.sprite(cx, base, 0)
}
