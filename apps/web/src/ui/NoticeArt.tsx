import { LEAF } from '../game/sprites'
import { CROWN_COLORS } from '../game/cities'
import { KINGDOM_COLORS } from '../game/buildingSprites'
import type { KingdomColor } from '../game/buildingSprites'
import type { Notice } from '../net/online'
import type { Online } from './hud/online'
import {
  C, DIRT, FIRE, GOLD, GRASS, H, INK, PLASTER, ROBE, SAND, SKINS, STONE, THATCH, TILE, W, WOOD,
  ball, basket, birds, camel, clamp, cloud, conifer, fields, flames, glint, glow, horse, house, land, mix, noise, note,
  person, rnd, roundTree, sack, shadow, sky, smoke, stars, tone, wheel,
} from './artKit'
import type { Paint, Scene, Who } from './artKit'
import { SceneCanvas } from './EventArt'
import { ramp } from '../game/sprites'

// Pictures for the envoy's news (CLAUDE.md §9.8): a hi-bit scene per family of notices, drawn in code in the style of
// the day's events (EventArt.tsx; the tools are artKit.ts). A family's scene takes the colours of the kingdoms or crowns
// involved and a variant (paid or refused, won or lost), so one picture serves several kinds of news.

type Ramp = ArrayLike<number>

// A banner ramp (deep, dark, base, light) from an interface colour.
function dye(hex: string | null | undefined, fallback = 0xb23a26): Uint32Array {
  const n = hex && /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : fallback
  const base = C(n)
  return Uint32Array.from([mix(base, INK, 0.55), mix(base, INK, 0.25), base, mix(base, C(0xffffff), 0.3)])
}

const SKY_DAY = ramp(0x4a7cb8, 0x6896c4, 0x8eb0cc, 0xbccad0, 0xe4dcc4)
const SKY_DUSK = ramp(0x2a1e3a, 0x5a2a3e, 0x9a3a32, 0xd0602e, 0xf0a048, 0xf8d080)
const SKY_NIGHT = ramp(0x060814, 0x0c1226, 0x141e3a, 0x22304e, 0x34465e)
const CLOUD_DAY = ramp(0xb8c8d8, 0xd4dee6, 0xeef2f4, 0xffffff)
const HILLS = ramp(0x4a7458, 0x5a8460, 0x6a9668)
const SEA = ramp(0x0e2236, 0x16344e, 0x214a66, 0x2e6280, 0x3e7c98, 0x5a9cb2)
const IRON = ramp(0x1a1a20, 0x2e2e36, 0x4a4a54, 0x6e6e78, 0x9a9aa2)
const CANVAS = ramp(0x6a5a44, 0x9a8868, 0xc4b28c, 0xe2d4b0, 0xf4ead0)
const VELVET = ramp(0x2a0a10, 0x4a1420, 0x6e2030, 0x983040)

const meadow = (p: Paint, y: number) => land(p, fields(y), (x, yy, dd) => tone(GRASS, 3.6 - dd * 0.012 + (noise(x * 0.2, yy * 0.4, 3) - 0.5) * 1.1, x, yy))
const farHills = (p: Paint, y: number, r: Ramp = HILLS, seed = 3) => land(p, (x) => y - noise(x * 0.02, 0, seed) * 10, (x, yy, dd) => tone(r, 2 - dd * 0.1, x, yy), y + 12)

// ---- Pieces --------------------------------------------------------------------------------------------------------

// A cloth on a pole, its fly rippling with t; swallow-tailed.
function banner(p: Paint, x: number, y: number, h: number, R: Ramp, t: number, o: { w?: number; fh?: number; flip?: boolean } = {}) {
  const w = o.w ?? 12
  const fh = o.fh ?? 8
  const f = o.flip ? -1 : 1
  p.line(x, y, x, y - h, WOOD[1])
  p.set(x, y - h - 1, GOLD[3])
  for (let i = 0; i < w; i++) {
    const u = i / w
    const off = Math.round(Math.sin(u * 4 - t * 5) * 1.5 * u)
    for (let j = 0; j < fh; j++) {
      // The swallow tail: a notch at the fly end.
      if (i >= w - 3 && Math.abs(j - (fh - 1) / 2) < (i - (w - 4)) * 0.9) continue
      const l = 1.8 + Math.sin(u * 4 - t * 5 + 0.9) * 0.9 - (j / fh) * 0.5
      p.set(x + (i + 1) * f, y - h + j + off, tone(R, l, x + i, y - h + j))
    }
  }
}

// A banner hanging down a wall.
function drape(p: Paint, x: number, y: number, w: number, h: number, R: Ramp) {
  p.box(x, y, x + w, y + h, (px, py) => {
    const tip = py - (y + h - 4)
    if (tip > 0 && Math.abs(px - (x + w / 2 - 0.5)) < 4 - tip) return undefined
    return tone(R, 2.2 - ((px - x) / w) * 1.2 + (px === x ? 0.6 : 0), px, py)
  })
  p.line(x - 1, y, x + w, y, GOLD[2])
  // A gold device in the middle.
  const cx = Math.round(x + w / 2 - 1)
  const cy = Math.round(y + h * 0.4)
  p.rect(cx, cy - 2, 2, 5, GOLD[3])
  p.rect(cx - 2, cy, 6, 1, GOLD[3])
}

// A stretch of ashlar wall with merlons along its top.
function wall(p: Paint, x0: number, x1: number, top: number, base: number, seed = 1, merlons = true) {
  p.box(x0, top, x1, base, (x, y) => {
    const row = Math.floor((y - top) / 4)
    const sx = x - x0 + (row & 1) * 4
    if ((y - top) % 4 === 3 || sx % 8 === 7) return STONE[1]
    return tone(STONE, 3.4 - ((y - top) / Math.max(1, base - top)) * 1.1 + (rnd(Math.floor(sx / 8), row, seed) - 0.5) * 0.9 - (x === x1 - 1 ? 1 : 0), x, y)
  })
  p.line(x0, top, x1 - 1, top, STONE[4])
  if (merlons) for (let x = x0; x < x1 - 2; x += 6) p.box(x, top - 3, Math.min(x1, x + 4), top, (xx, yy) => tone(STONE, xx === x ? 4.3 : 3.2, xx, yy))
}

// A square tower; a cone roof if given.
function tower(p: Paint, x: number, w: number, top: number, base: number, roof?: Ramp, seed = 2) {
  wall(p, x, x + w, top, base, seed, !roof)
  for (const sy of [top + 6, top + 16]) if (sy < base - 6) p.rect(x + Math.floor(w / 2) - 1, sy, 2, 4, INK)
  if (roof) p.poly([x - 2, top, x + w + 2, top, x + w / 2, top - w * 1.1], (px, py) => tone(roof, 3.2 - ((px - x) / w) * 2 - ((py - top) % 3 === 0 ? 0.5 : 0), px, py))
}

// An arched gateway: a dark passage, or a shut oak door with iron bands.
function gateway(p: Paint, cx: number, base: number, hw: number, h: number, open = false) {
  const spring = base - h + hw
  for (let y = base - h - 2; y < base; y++) {
    for (let x = cx - hw - 2; x <= cx + hw + 1; x++) {
      const dx = x + 0.5 - cx
      const inner = y >= spring ? hw : hw * Math.sqrt(Math.max(0, 1 - ((spring - y) / hw) ** 2))
      const outer = y >= spring ? hw + 2 : (hw + 2) * Math.sqrt(Math.max(0, 1 - ((spring - y) / (hw + 2)) ** 2))
      if (Math.abs(dx) < inner) {
        if (open) p.set(x, y, tone(ramp(0x06040a, 0x120c10, 0x1e1614), 2 - (base - y) / h * 1.5, x, y))
        else p.set(x, y, (x - cx + 99) % 4 === 0 ? WOOD[0] : Math.abs(y - (base - 4)) < 1 || Math.abs(y - (spring + 1)) < 1 ? IRON[2] : tone(WOOD, 2.6 - dx * 0.08, x, y))
      } else if (Math.abs(dx) < outer) p.set(x, y, tone(STONE, dx < 0 ? 4.4 : 2.6, x, y))
    }
  }
}

// A treasure chest, open and heaped with coins or shut.
function chest(p: Paint, x: number, y: number, open: boolean) {
  shadow(p, x + 9, y, 12, 2, 0.5)
  if (open) {
    p.box(x + 1, y - 17, x + 17, y - 11, (px, py) => tone(WOOD, 1.6 - (py - y + 17) * 0.1, px, py))
    p.line(x + 1, y - 17, x + 16, y - 17, IRON[3])
  }
  p.box(x, y - 10, x + 18, y, (px, py) => tone(WOOD, 3.2 - ((px - x) / 18) * 1.4 - (py === y - 1 ? 1 : 0), px, py))
  for (const bx of [x + 3, x + 14]) p.line(bx, y - 10, bx, y - 1, IRON[2])
  if (open) {
    ball(p, x + 9, y - 10, 8, 3.5, GOLD, { seed: x, rough: 0.4 })
    for (let i = 0; i < 6; i++) p.rect(x + 2 + Math.floor(rnd(i, x, 3) * 14), y - 12 - Math.floor(rnd(i, x, 4) * 3), 2, 1, GOLD[4])
  } else {
    p.box(x, y - 14, x + 18, y - 10, (px, py) => tone(WOOD, 3.6 - ((px - x) / 18) * 1.4 - (py - y + 14) * 0.2, px, py))
    for (const bx of [x + 3, x + 14]) p.line(bx, y - 14, bx, y - 11, IRON[2])
  }
  p.rect(x + 8, y - 11, 2, 3, GOLD[3])
}

// Coins on the ground.
function coins(p: Paint, x: number, y: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const cx = x + Math.floor((rnd(i, seed, 1) - 0.5) * 18)
    const cy = y - Math.floor(rnd(i, seed, 2) * 3)
    p.set(cx, cy, GOLD[3])
    p.set(cx + 1, cy, GOLD[2])
  }
}

// Twinkles over gold.
function sparkle(p: Paint, t: number, pts: [number, number][], seed = 1) {
  pts.forEach(([x, y], i) => {
    const s = Math.sin(t * 2.2 + rnd(i, seed, 9) * 6.28)
    if (s > 0.55) glint(p, x, y, Math.round((s - 0.55) * 7), C(0xfff6c8))
  })
}

// A soldier in a tabard of `R`: helm and spear (or a shield).
function soldier(p: Paint, x: number, y: number, R: Ramp, o: { frame?: number; flip?: boolean; pose?: Who['pose']; shield?: boolean } = {}) {
  person(p, x, y, { robe: R, hat: 'helm', pose: o.pose ?? 'spear', frame: o.frame, flip: o.flip, legs: C(0x2a2228) })
  if (o.shield) {
    const f = o.flip ? -1 : 1
    p.box(Math.min(x + 2 * f, x + 6 * f), y - 11, Math.max(x + 2 * f, x + 6 * f) + 1, y - 4, (px, py) => (py === y - 11 ? GOLD[2] : tone(R, px === x + 2 * f ? 3.4 : 2.2, px, py)))
    p.set(x + 4 * f, y - 8, GOLD[3])
  }
}

// A lord: robe of `R`, a gold circlet.
function lord(p: Paint, x: number, y: number, R: Ramp, o: Partial<Who> = {}) {
  person(p, x, y, { robe: R, hair: C(0x3a2618), ...o })
  const k = o.kneel ? 4 : 0
  for (let dx = -1; dx <= 1; dx++) p.set(x + dx, y - 17 + k, GOLD[3])
  p.set(x - 1, y - 18 + k, GOLD[4])
  p.set(x + 1, y - 18 + k, GOLD[2])
}

// A hooded figure in black.
const hooded = (p: Paint, x: number, y: number, o: Partial<Who> = {}) => person(p, x, y, { robe: ROBE.black, hat: 'hood', hatColor: C(0x16161c), skin: 2, ...o })

// A torch held up at a hand, flickering.
function torch(p: Paint, x: number, y: number, t: number, seed: number) {
  p.line(x, y, x, y + 5, WOOD[2])
  flames(p, x - 2, x + 2, y, 5, t + seed, seed)
  glow(p, x, y - 2, 14, C(0xffa040), 0.28)
}

// A wooden ship with a square sail in `R`, its waterline on y.
function ship(p: Paint, x: number, y: number, R: Ramp, o: { flip?: boolean; scale?: number; fire?: number; t?: number } = {}) {
  const f = o.flip ? -1 : 1
  const k = o.scale ?? 1
  const L = 22 * k
  // The hull: a long curve, high at the stern.
  p.poly([x - L, y - 7 * k, x + L * 0.85, y - 6 * k, x + L * 1.05, y - 10 * k, x + L * 0.7, y + 1, x - L * 0.75, y + 1, x - L * 1.05, y - 11 * k].map((v, i) => (i % 2 === 0 ? x + (v - x) * f : v)), (px, py) => {
    const v = (py - (y - 10 * k)) / (11 * k)
    if (Math.abs(py - (y - 4 * k)) < 0.6) return R[2]
    return tone(WOOD, 3.2 - v * 2 - ((px + py) % 5 === 0 ? 0.4 : 0), px, py)
  })
  for (let i = -3; i <= 3; i++) p.set(x + i * 5 * k, y - 3 * k, INK)
  const mx = x
  p.line(mx, y - 7 * k, mx, y - 42 * k, WOOD[1])
  p.line(mx - 13 * k, y - 37 * k, mx + 13 * k, y - 37 * k, WOOD[2])
  // The sail bellying out, striped.
  p.box(mx - 12 * k, y - 37 * k, mx + 13 * k, y - 15 * k, (px, py) => {
    const u = (px - (mx - 12 * k)) / (25 * k)
    const v = (py - (y - 37 * k)) / (22 * k)
    const belly = Math.sin(u * Math.PI)
    const stripe = Math.floor(u * 5) % 2 === 0
    const c = stripe ? R : CANVAS
    return tone(c, (stripe ? 2.4 : 3.2) - Math.abs(u - 0.35) * 1.4 + belly * 0.6 - v * 0.4, px, py)
  })
  p.line(mx - 12 * k, y - 15 * k, mx + 12 * k, y - 15 * k, WOOD[1])
  // A pennant at the masthead.
  for (let i = 0; i < 6 * k; i++) p.set(mx + (i + 1) * f, y - 42 * k + Math.round(Math.sin(i * 0.8 + (o.t ?? 0) * 6)), R[2])
  if (o.fire) {
    flames(p, mx - 8 * k, mx + 6 * k, y - 8 * k, 12 * k * o.fire, o.t ?? 0, x)
    smoke(p, mx, y - 20 * k, o.t ?? 0, { n: 5, rise: 50, drift: 30, size: 3, seed: x })
  }
}

// Open water from y0 down, darkening with depth, with streaks of light.
function sea(p: Paint, y0: number, r: Ramp = SEA) {
  for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, tone(r, 4.6 - ((y - y0) / (H - y0)) * 3.2 + (noise(x * 0.06, y * 0.5, 4) - 0.5) * 1.2, x, y))
}
function waves(p: Paint, t: number, y0: number, n = 40, seed = 1) {
  for (let i = 0; i < n; i++) {
    const y = y0 + 2 + Math.floor(rnd(i, 1, seed) ** 1.3 * (H - y0 - 2))
    const len = 2 + Math.floor(((y - y0) / (H - y0)) * 6)
    const x = Math.floor((rnd(i, 0, seed) * W + t * (4 + rnd(i, 2, seed) * 6)) % W)
    const a = 0.5 + 0.5 * Math.sin(t * 2 + i)
    for (let j = 0; j < len; j++) p.tint(x + j, y, C(0xd8eef4), 0.55 * a)
  }
}

// A siege engine: its arm at angle `ang` (0 back on the frame, 1 thrown forward).
function catapult(p: Paint, x: number, y: number, ang: number, flip = false) {
  const f = flip ? -1 : 1
  shadow(p, x, y, 14, 2)
  p.box(x - 12, y - 6, x + 12, y - 3, (px, py) => tone(WOOD, 3 - (py - y + 6) * 0.4, px, py))
  wheel(p, x - 8, y - 3, 3)
  wheel(p, x + 8, y - 3, 3)
  p.line(x - 2, y - 6, x + 1 * f, y - 16, WOOD[2])
  p.line(x + 3, y - 6, x + 1 * f, y - 16, WOOD[1])
  const a = Math.PI * (1 - ang * 0.62)
  const ex = x + Math.cos(a) * 18 * f
  const ey = y - 14 - Math.sin(a) * 18
  p.line(x + 1 * f, y - 14, ex, ey, WOOD[3])
  p.line(x + 1 * f, y - 13, ex, ey + 1, WOOD[1])
  p.disc(ex, ey - 1, 2.2, 1.6, WOOD[0])
}

// A pointed tent striped in `R`.
function tent(p: Paint, x: number, y: number, s: number, R: Ramp) {
  shadow(p, x + s * 0.3, y, s + 3, 2.5)
  p.poly([x, y - s * 1.1, x + s, y, x - s, y], (px, py) => {
    const u = (px - x) / s
    const stripe = Math.floor((u + 1) * 3) % 2 === 0
    return tone(stripe ? R : CANVAS, (stripe ? 2.6 : 3.4) - (u + 1) * 0.9 + (py === y - 1 ? -0.8 : 0), px, py)
  })
  p.poly([x, y - s * 0.55, x + s * 0.3, y, x - s * 0.3, y], C(0x1a1210))
  p.line(x, y - s * 1.1, x, y - s * 1.1 - 4, WOOD[1])
  p.set(x + 1, y - s * 1.1 - 4, R[2])
  p.set(x + 2, y - s * 1.1 - 4, R[2])
}

// A trestle table seen from the front.
function table(p: Paint, x0: number, x1: number, y: number) {
  p.box(x0, y - 9, x1, y - 6, (px, py) => tone(WOOD, py === y - 9 ? 4.2 : 2.6 - ((px - x0) / (x1 - x0)) * 0.8, px, py))
  for (const lx of [x0 + 2, x1 - 4]) p.box(lx, y - 6, lx + 2, y, WOOD[1])
}

// A clay mug with foam.
function mug(p: Paint, x: number, y: number) {
  p.rect(x, y - 3, 3, 3, WOOD[3])
  p.set(x + 3, y - 2, WOOD[2])
  p.rect(x, y - 4, 3, 1, C(0xf4ead0))
}

// The day's ground: a blue sky, a cloud, low hills, a meadow.
function countryside(p: Paint, y: number, seed = 1) {
  sky(p, SKY_DAY, 0, y + 2)
  cloud(p, 60 + seed * 13, 16, 60, 12, CLOUD_DAY, seed + 14)
  cloud(p, 200 - seed * 7, 10, 44, 10, CLOUD_DAY, seed + 15)
  farHills(p, y - 6, HILLS, seed)
  meadow(p, y)
}

// A palace gate across the right of the picture: wall, two towers and the lord's banners.
function palaceGate(p: Paint, cx: number, base: number, open = true) {
  wall(p, cx - 60, cx + 60, base - 30, base, 3)
  tower(p, cx - 34, 16, base - 44, base, TILE, 4)
  tower(p, cx + 18, 16, base - 44, base, TILE, 5)
  gateway(p, cx, base, 9, 24, open)
}

// ---- Scenes --------------------------------------------------------------------------------------------------------

export type Family =
  | 'tribute' | 'tavern' | 'gift' | 'envoy' | 'alliance' | 'peace' | 'war' | 'insult' | 'spy' | 'sabotage' | 'revolt'
  | 'kidnap' | 'raid' | 'naval' | 'siege' | 'battle'

interface Look {
  family: Family
  variant: string
  // The other party's colour (the crown, the sender, the attacker) and the player's own.
  a: Uint32Array
  b: Uint32Array
}

// Rival crown's collectors at the palace gate, a chest of coins before them (paid: they carry it away; refused: shut,
// a finger wagged at the gate).
function tributeScene({ a, b, variant }: Look): Scene {
  const paid = variant === 'paid'
  const refused = variant === 'refused'
  return {
    draw(p) {
      countryside(p, 72, 2)
      palaceGate(p, 186, 98, !refused)
      p.poly([150, H, 222, H, 194, 98, 178, 98], (x, y) => tone(DIRT, 3 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
      roundTree(p, 22, 102, 11, LEAF[0], 3)
      if (!paid) {
        chest(p, 106, 114, !refused)
        coins(p, 115, 117, refused ? 0 : 7, 3)
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 3)
      banner(p, 160, 52, 14, b, t)
      banner(p, 212, 52, 14, b, t + 1)
      if (paid) {
        // Two of them carry the chest off down the road, the herald leading.
        const x = 120 - ((t * 8) % 40)
        person(p, x - 10, 116, { robe: a, hat: 'cap', hatColor: GOLD[2], pose: 'walk', frame: fr, flip: true })
        soldier(p, x + 8, 116, a, { pose: 'carry', frame: fr, flip: true })
        soldier(p, x + 22, 116, a, { pose: 'carry', frame: fr + 1, flip: true })
        chest(p, x + 6, 110, false)
        banner(p, x + 34, 116, 26, a, t, { flip: false })
      } else {
        person(p, 90, 118, { robe: a, hat: 'cap', hatColor: GOLD[2], pose: refused ? 'point' : 'hold', frame: fr })
        p.rect(92, 109, 4, 3, PLASTER[4])
        soldier(p, 70, 116, a, { frame: fr })
        soldier(p, 56, 120, a, { frame: fr + 1, shield: true })
        banner(p, 44, 120, 30, a, t)
        if (!refused) sparkle(p, t, [[109, 104], [116, 102], [121, 105], [113, 107]], 2)
        // The gate's warden answers.
        soldier(p, 168, 112, b, { flip: true, frame: fr })
      }
      birds(p, t, 3, 0, 18, C(0x3a3040), 5)
    },
  }
}

// The crown's patrol drinking in the tavern before a little stage, a minstrel playing, coins on the table.
function tavernScene({ a }: Look): Scene {
  const lamps: [number, number][] = [[40, 30], [128, 26], [212, 30]]
  return {
    draw(p) {
      // Plank walls, beams, a floor.
      p.box(0, 0, W, 96, (x, y) => (x % 14 === 0 ? WOOD[0] : tone(WOOD, rnd(Math.floor(x / 14), 0, 2) > 0.5 ? 1.5 : 1, x, y)))
      for (const by of [10, 60]) p.box(0, by, W, by + 4, (x, y) => tone(WOOD, y === by ? 3.4 : 2.2, x, y))
      p.box(0, 96, W, H, (x, y) => ((x + (y >> 2) * 7) % 22 === 0 || y % 6 === 0 ? WOOD[0] : tone(WOOD, 2.4 + (y - 96) * 0.03, x, y)))
      // The stage on the right, a red curtain behind.
      p.box(168, 26, 256, 82, (x, y) => tone(VELVET, 2 + Math.sin(x * 0.7) * 0.9, x, y))
      p.box(164, 82, 256, 92, (x, y) => tone(WOOD, y === 82 ? 4.4 : 3 - (y - 82) * 0.15, x, y))
      p.line(164, 26, 256, 26, GOLD[2])
      // Barrels on the left.
      for (const [bx, by] of [[14, 96], [32, 96], [23, 82]] as const) {
        p.disc(bx, by - 7, 8, 8, (x, y) => (Math.abs(y - (by - 7)) === 4 ? IRON[2] : tone(WOOD, 3.4 - (x - bx + 8) * 0.18, x, y)))
        p.disc(bx, by - 7, 2, 2, WOOD[0])
      }
      // A notice board of the crown's colour.
      p.rect(96, 36, 14, 18, a[1])
      p.rect(98, 38, 10, 14, CANVAS[3])
      for (let i = 0; i < 4; i++) p.line(99, 40 + i * 3, 106, 40 + i * 3, CANVAS[1])
      for (const [x, y] of lamps) p.line(x, 0, x, y - 4, IRON[1])
    },
    fx(p, t) {
      const fr = Math.floor(t * 3)
      for (const [x, y] of lamps) {
        const fl = 0.3 + 0.08 * Math.sin(t * 9 + x)
        glow(p, x, y, 26, C(0xffa040), fl)
        p.rect(x - 2, y - 4, 5, 6, IRON[2])
        p.rect(x - 1, y - 3, 3, 4, C(0xffd870))
      }
      // The minstrel on the stage and the notes rising.
      person(p, 206, 82, { robe: ROBE.green, hat: 'cap', hatColor: C(0xe0a030), pose: 'lute', frame: fr, flip: true })
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.5 + i / 4) % 1
        note(p, 196 - k * 30 + Math.sin(k * 9 + i) * 3, 64 - k * 40, GOLD[4], 1 - k)
      }
      // The patrol round the table, mugs raised in turn.
      const seats: [number, boolean][] = [[62, false], [82, false], [104, true], [126, true], [148, false]]
      seats.forEach(([x, flip], i) => {
        const up = (fr + i) % 4 === 0
        soldier(p, x, 112, a, { pose: up ? 'up' : 'hold', frame: fr + i, flip })
        mug(p, x + (flip ? -4 : 2), up ? 96 : 104)
      })
      table(p, 52, 160, 120)
      for (let i = 0; i < 5; i++) mug(p, 60 + i * 21, 111)
      coins(p, 108, 111, 9, 4)
      sparkle(p, t, [[100, 109], [112, 110], [118, 109]], 4)
    },
  }
}

// A chest of gold and gifts carried into the hall under the giver's banner.
function giftScene({ a, b, variant }: Look): Scene {
  return {
    draw(p) {
      // Stone hall: back wall, pillars, a chequered floor.
      p.box(0, 0, W, 84, (x, y) => tone(STONE, 2.2 + (rnd(Math.floor(x / 10) + (Math.floor(y / 5) & 1) * 5, Math.floor(y / 5), 6) - 0.5) * 0.6 - ((y % 5 === 4 || (x + (Math.floor(y / 5) & 1) * 5) % 10 === 9) ? 0.8 : 0), x, y))
      for (let y = 84; y < H; y++) {
        const depth = y - 70
        for (let x = 0; x < W; x++) {
          const u = Math.floor(((x - 128) / depth) * 6)
          const v = Math.floor(200 / depth)
          p.set(x, y, tone((u + v) % 2 === 0 ? PLASTER : STONE, 2.4 + (y - 84) * 0.02, x, y))
        }
      }
      for (const px of [24, 216]) {
        p.box(px, 0, px + 16, 86, (x, y) => tone(STONE, 4 - ((x - px) / 16) * 2.4, x, y))
        p.box(px - 2, 82, px + 18, 88, STONE[2])
      }
      drape(p, 74, 8, 18, 50, a)
      drape(p, 164, 8, 18, 50, b)
      chest(p, 118, 108, true)
      sack(p, 102, 108, 2)
      sack(p, 150, 108, 4)
      basket(p, 166, 110, ramp(0x5a1a1a, 0xa83030, 0xe05a40, 0xf8a070), 7)
      if (variant === 'ransom') {
        // A queen's crown on a cushion beside the gold.
        p.rect(84, 104, 12, 4, VELVET[2])
        for (let dx = 0; dx < 8; dx++) p.set(86 + dx, 102, GOLD[3])
        for (const dx of [0, 3, 7]) p.set(86 + dx, 101, GOLD[4])
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 2)
      person(p, 96, 118, { robe: a, hat: 'cap', hatColor: GOLD[2], pose: 'hold', kneel: true, frame: fr })
      lord(p, 160, 120, b, { pose: fr % 4 === 0 ? 'wave' : 'stand', flip: true, frame: fr })
      sparkle(p, t, [[121, 95], [127, 93], [133, 96], [125, 98], [130, 99]], 7)
      // Motes in the light.
      for (let i = 0; i < 14; i++) {
        const k = (t * 0.06 + rnd(i, 0, 3)) % 1
        p.tint(90 + rnd(i, 1, 3) * 80 + Math.sin(t + i) * 4, 90 - k * 80, C(0xfff0c0), 0.5 * Math.sin(k * Math.PI))
      }
    },
  }
}

// An envoy riding up the road to the palace with a scroll and the sender's banner (queen: the queen comes home to
// cheers; lost: a messenger at a crossroads, scratching his head).
function envoyScene({ a, b, variant }: Look): Scene {
  const lost = variant === 'lost'
  const queen = variant === 'queen'
  return {
    draw(p) {
      countryside(p, 70, 4)
      if (!lost) palaceGate(p, 200, 96, true)
      else {
        conifer(p, 200, 96, 30, LEAF[2], { seed: 2 })
        conifer(p, 222, 100, 34, LEAF[2], { seed: 3 })
        roundTree(p, 180, 102, 10, LEAF[0], 4)
      }
      // The road winding in from the left.
      p.poly([0, 112, 0, 126, 140, 118, 200, 98, 186, 98, 120, 108], (x, y) => tone(DIRT, 3.2 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
      if (lost) {
        // A crossroads signpost, its arms pointing every way.
        p.line(118, 112, 118, 84, WOOD[1])
        p.line(119, 112, 119, 84, WOOD[2])
        for (const [dy, dx] of [[86, 1], [92, -1], [98, 1]] as const) {
          p.box(Math.min(119, 119 + dx * 16), dy, Math.max(119, 119 + dx * 16), dy + 4, (x, y) => tone(WOOD, 3.4 - (y - dy) * 0.4, x, y))
          p.set(119 + dx * 17, dy + 2, WOOD[3])
        }
        p.poly([118, 120, 256, 110, 256, 122, 118, 126], (x, y) => tone(DIRT, 3 + (noise(x * 0.3, y * 0.3, 9) - 0.5), x, y))
      }
      roundTree(p, 30, 100, 12, LEAF[1], 5)
    },
    fx(p, t) {
      const fr = Math.floor(t * 4)
      if (!lost) {
        banner(p, 174, 52, 14, b, t)
        banner(p, 226, 52, 14, b, t + 1)
      }
      if (lost) {
        person(p, 104, 118, { robe: ROBE.red, hat: 'cap', hatColor: C(0xf0c040), pose: 'brow', frame: fr })
        horse(p, 76, 116, Math.floor(t), ramp(0x3a2418, 0x6a4428, 0x8e6238, 0xb08454))
        p.rect(110, 108, 4, 3, PLASTER[4])
        // A question mark over his head, bobbing.
        const qy = 92 + Math.round(Math.sin(t * 3))
        for (const [dx, dy] of [[0, 0], [1, -1], [2, -1], [3, 0], [3, 1], [2, 2], [1, 3], [1, 5]] as const) p.set(103 + dx, qy + dy, C(0xfff4c0))
        birds(p, t, 3, 0, 20, C(0x3a3040), 2)
        return
      }
      const bob = fr % 2
      const x = 70 + Math.sin(t * 0.5) * 6
      // Dust kicked up behind.
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.8 + i / 6) % 1
        p.tint(x - 14 - k * 22, 114 - k * 6 - (i % 2) * 2, C(0xc8b490), 0.5 * (1 - k))
      }
      horse(p, x, 118, fr, queen ? ramp(0xa8a49a, 0xcac6bc, 0xe8e4da, 0xffffff) : ramp(0x3a2418, 0x6a4428, 0x8e6238, 0xb08454))
      if (queen) {
        person(p, x - 1, 112 - bob, { robe: ROBE.rose, hat: 'veil', hatColor: C(0xf0e6d6), kneel: true, pose: 'wave', frame: fr })
        for (let dx = -1; dx <= 1; dx++) p.set(x - 1 + dx, 108 - bob - 13, GOLD[4])
        soldier(p, x + 26, 118, b, { frame: fr, pose: 'walk' })
        soldier(p, x - 22, 118, b, { frame: fr + 1, pose: 'walk' })
        for (let i = 0; i < 4; i++) person(p, 150 + i * 12, 106 + (i % 2) * 4, { robe: [ROBE.green, ROBE.ochre, ROBE.blue, ROBE.brown][i], pose: (fr + i) % 2 ? 'up' : 'wave', frame: fr + i, flip: true, hat: i % 2 ? 'straw' : 'none' })
      } else {
        person(p, x - 1, 112 - bob, { robe: a, hat: 'cap', hatColor: GOLD[2], kneel: true, pose: 'hold', frame: fr })
        p.rect(x + 1, 102 - bob, 4, 3, PLASTER[4])
        banner(p, x - 6, 108 - bob, 22, a, t, { w: 10, fh: 7 })
      }
      birds(p, t, 3, 0, 20, C(0x3a3040), 5)
    },
  }
}

// Two lords clasp hands between their banners (broken: they turn their backs, a torn treaty between them).
function allianceScene({ a, b, variant }: Look): Scene {
  const broken = variant === 'broken'
  return {
    draw(p) {
      countryside(p, 74, 6)
      tent(p, 52, 108, 22, a)
      tent(p, 204, 108, 22, b)
      if (broken) {
        p.poly([118, 120, 126, 118, 125, 123, 117, 124], CANVAS[3])
        p.poly([130, 119, 139, 121, 137, 125, 129, 123], CANVAS[3])
        p.line(119, 121, 124, 120, CANVAS[1])
        p.line(131, 121, 136, 122, CANVAS[1])
        p.set(134, 123, C(0xb02020))
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 3)
      banner(p, 90, 118, 32, a, t)
      banner(p, 166, 118, 32, b, t + 0.7, { flip: true })
      if (broken) {
        lord(p, 110, 120, a, { flip: true, pose: 'stand' })
        lord(p, 146, 120, b, { pose: 'stand' })
      } else {
        const s = fr % 2
        lord(p, 121, 120, a, { pose: 'stand' })
        lord(p, 135, 120, b, { pose: 'stand', flip: true })
        p.line(123, 109, 127, 112 + s, a[1])
        p.line(133, 109, 129, 112 + s, b[1])
        p.set(128, 112 + s, SKINS[0][2])
        p.set(127, 112 + s, SKINS[0][1])
        // Cheering soldiers of both sides.
        soldier(p, 70, 122, a, { frame: fr })
        soldier(p, 186, 122, b, { frame: fr + 1, flip: true })
      }
      birds(p, t, 4, 0, 16, C(0x3a3040), 7)
    },
  }
}

// The treaty: a scroll on a table between two banners, a quill writing, candles burning (enforced: a sword beside it).
function peaceScene({ a, b, variant }: Look): Scene {
  return {
    draw(p) {
      // Inside a pavilion: canvas walls lit warm.
      p.box(0, 0, W, 92, (x, y) => tone(CANVAS, 2.2 + Math.sin(x * 0.2) * 0.25 - Math.round((Math.abs(x - 128) / 128) * 2) * 0.5, x, y))
      for (let x = 0; x < W; x += 32) p.line(x, 0, x, 92, CANVAS[1])
      p.box(0, 92, W, H, (x, y) => tone(ramp(0x2a2016, 0x3e3020, 0x564430), 2.2 - (y - 92) * 0.02 + (noise(x * 0.2, y * 0.5, 2) - 0.5), x, y))
      drape(p, 50, 10, 20, 54, a)
      drape(p, 186, 10, 20, 54, b)
      // The table, its cloth, the scroll.
      p.box(48, 86, 208, 112, (x, y) => tone(VELVET, 2.6 - (y - 86) * 0.05 - ((x - 48) / 160) * 0.6, x, y))
      p.line(48, 86, 207, 86, GOLD[3])
      for (const lx of [56, 196]) p.box(lx, 112, lx + 4, 124, WOOD[1])
      p.box(84, 78, 172, 92, (x, y) => tone(CANVAS, 3.6 - (y - 78) * 0.05, x, y))
      for (const rx of [82, 172]) p.disc(rx, 85, 3, 7, (x, y) => tone(CANVAS, 2.6 - (x - rx) * 0.2, x, y))
      for (let i = 0; i < 4; i++) p.line(92, 81 + i * 3, 160 - (i === 3 ? 40 : 0), 81 + i * 3, CANVAS[0])
      p.disc(156, 89, 3, 3, C(0xb02020))
      p.set(155, 88, C(0xe05050))
      // The inkwell.
      p.rect(176, 82, 6, 5, INK)
      if (variant === 'enforced') {
        p.line(60, 82, 100, 74, STONE[5])
        p.line(60, 83, 100, 75, STONE[3])
        p.line(66, 78, 66, 86, GOLD[2])
      }
    },
    fx(p, t) {
      for (const cx of [64, 192]) {
        p.rect(cx, 74, 3, 12, C(0xeee2bc))
        flames(p, cx - 1, cx + 3, 74, 6, t, cx)
        glow(p, cx + 1, 70, 22, C(0xffb050), 0.3 + 0.05 * Math.sin(t * 8 + cx))
      }
      // The quill writing along the last line.
      const k = (t * 0.25) % 1
      const qx = 120 + k * 30
      p.line(120, 90, Math.floor(qx), 90, CANVAS[0])
      p.line(qx, 90, qx + 8, 78 - Math.sin(t * 12) * 1.5, C(0xf4f0e6))
      p.line(qx + 1, 89, qx + 9, 78 - Math.sin(t * 12) * 1.5, C(0xc4b8a0))
    },
  }
}

// War: drums and banners on a hill at dusk, the host lined up on the ridge, a beacon burning (camp: their tents and
// fires on the hills at night, the lord's folk peering out).
function warScene({ a, b, variant }: Look): Scene {
  const camp = variant === 'camp'
  return {
    draw(p) {
      if (camp) {
        sky(p, SKY_NIGHT, 0, 80)
        p.disc(200, 20, 8, 8, C(0xf0ecd8))
        glow(p, 200, 20, 30, C(0xc8d4f0), 0.25)
        land(p, (x) => 64 - noise(x * 0.015, 0, 9) * 14, (x, y, dd) => tone(ramp(0x0c1418, 0x14202a, 0x1c2c36), 2 - dd * 0.06, x, y), 96)
        for (let i = 0; i < 7; i++) tent(p, 20 + i * 34 + rnd(i, 0, 2) * 10, 70 + rnd(i, 1, 2) * 10, 7, a)
        land(p, fields(96), (x, y, dd) => tone(ramp(0x0e1a14, 0x16261c, 0x203424, 0x2c4630), 2.6 - dd * 0.03, x, y))
        house(p, 168, 116, { w: 18, d: 30, h: 13, roof: THATCH, lit: true })
      } else {
        sky(p, SKY_DUSK, 0, 70)
        p.disc(60, 50, 12, 12, C(0xffd890))
        glow(p, 60, 50, 50, C(0xffb060), 0.35)
        land(p, (x) => 62 - Math.sin(x * 0.012 + 1) * 10, (x, y, dd) => tone(ramp(0x1a1014, 0x2a1a1c, 0x3a2420), 2 - dd * 0.05, x, y), 90)
        // The host on the ridge: rows of spears against the sky.
        for (let i = 0; i < 46; i++) {
          const x = 70 + i * 4 + Math.floor(rnd(i, 0, 1) * 2)
          const y = Math.round(62 - Math.sin(x * 0.012 + 1) * 10)
          p.rect(x, y - 5, 2, 5, C(0x140c10))
          p.line(x + 1, y - 5, x + 1, y - 12, C(0x241418))
          if (i % 7 === 0) p.rect(x + 2, y - 12, 4, 3, a[1])
        }
        land(p, fields(92), (x, y, dd) => tone(ramp(0x2a2018, 0x3e2e1e, 0x544028, 0x6a5232), 3 - dd * 0.03 + (noise(x * 0.2, y * 0.4, 2) - 0.5), x, y))
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 4)
      if (camp) {
        stars(p, 30, 50, t, 3)
        for (let i = 0; i < 7; i++) {
          const x = 26 + i * 34 + rnd(i, 0, 2) * 10
          const y = 74 + rnd(i, 1, 2) * 10
          p.tint(x, y, C(0xffd060), 1)
          glow(p, x, y, 8, C(0xff9030), 0.35 + 0.1 * Math.sin(t * 7 + i))
        }
        person(p, 150, 120, { robe: ROBE.brown, hat: 'hood', pose: 'shiver', frame: fr })
        person(p, 138, 122, { robe: ROBE.rose, hat: 'scarf', hatColor: C(0xe0d4c0), pose: 'pray', frame: fr })
        banner(p, 40, 100, 30, a, t)
        return
      }
      banner(p, 30, 118, 40, a, t, { w: 16, fh: 11 })
      banner(p, 226, 118, 40, a, t + 1, { w: 16, fh: 11, flip: true })
      person(p, 104, 120, { robe: a, hat: 'helm', pose: 'drum', frame: fr })
      person(p, 128, 120, { robe: a, hat: 'helm', pose: 'drum', frame: fr + 1 })
      person(p, 152, 120, { robe: a, hat: 'cap', hatColor: GOLD[2], pose: 'pipe', frame: fr, flip: true })
      soldier(p, 70, 124, a, { frame: fr, shield: true })
      soldier(p, 186, 124, a, { frame: fr + 1, flip: true, shield: true })
      // The beacon.
      p.box(214, 70, 222, 78, WOOD[1])
      flames(p, 210, 226, 70, 16, t, 3)
      smoke(p, 218, 52, t, { n: 5, rise: 40, drift: 24, size: 3, seed: 2 })
      void b
    },
  }
}

// An envoy throws down his gauntlet before the throne; the court gasps (sent: the player's own envoy at another's).
function insultScene({ a, b }: Look): Scene {
  return {
    draw(p) {
      p.box(0, 0, W, 88, (x, y) => tone(STONE, 1.8 + (rnd(Math.floor(x / 12) + (Math.floor(y / 6) & 1) * 6, Math.floor(y / 6), 5) - 0.5) * 0.5 - ((y % 6 === 5) ? 0.7 : 0), x, y))
      p.box(0, 88, W, H, (x, y) => tone(STONE, 2.6 + (y - 88) * 0.03 - (((x + (y >> 3) * 9) % 24) === 0 ? 1 : 0), x, y))
      // The carpet up to the throne.
      p.poly([30, H, 120, H, 190, 92, 168, 92], (x, y) => tone(VELVET, 2.6 + (y - 92) * 0.01 - ((x + y) % 13 === 0 ? 0.6 : 0), x, y))
      drape(p, 150, 6, 22, 60, b)
      drape(p, 210, 6, 22, 60, b)
      // The throne on its dais.
      p.box(160, 86, 236, 94, (x, y) => tone(STONE, y === 86 ? 4.6 : 3 - (y - 86) * 0.2, x, y))
      p.box(184, 50, 206, 86, (x, y) => tone(GOLD, x === 184 ? 4 : 2.4 - (y - 50) * 0.02, x, y))
      p.box(187, 54, 203, 76, (x, y) => tone(VELVET, 2.6 - (x - 187) * 0.06, x, y))
      p.box(182, 76, 208, 80, GOLD[2])
      for (const tx of [20, 120]) p.line(tx, 40, tx, 52, WOOD[1])
    },
    fx(p, t) {
      const fr = Math.floor(t * 3)
      for (const tx of [20, 120]) {
        flames(p, tx - 2, tx + 2, 40, 7, t, tx)
        glow(p, tx, 36, 24, C(0xffa040), 0.3)
      }
      lord(p, 195, 82, b, { kneel: true, pose: fr % 3 === 0 ? 'point' : 'stand', flip: true })
      // The courtiers, appalled.
      person(p, 160, 102, { robe: ROBE.purple, hat: 'cap', pose: 'brow', flip: true, frame: fr })
      person(p, 228, 104, { robe: ROBE.teal, hat: 'veil', hatColor: C(0xe8dcc8), pose: 'pray', flip: true, frame: fr })
      soldier(p, 238, 112, b, { flip: true, frame: fr })
      // The envoy flings the glove; it arcs and lands, again and again.
      const k = (t * 0.45) % 1
      person(p, 92, 120, { robe: a, hat: 'cap', hatColor: GOLD[2], pose: k < 0.15 ? 'point' : 'stand', frame: fr })
      const fly = clamp((k - 0.1) / 0.5)
      const gx = 98 + fly * 48
      const gy = 104 - Math.sin(fly * Math.PI) * 30 + fly * 12
      p.rect(gx, gy, 4, 3, STONE[4])
      p.set(gx + 4, gy + 1, STONE[3])
      p.set(gx, gy + 3, STONE[2])
      if (k > 0.6) p.tint(gx - 3, gy + 4, C(0xe8dcc8), 0.5 * (1 - (k - 0.6) / 0.4))
    },
  }
}

// A spy in a cell: a barred window, a shaft of moonlight, a guard's torch beyond the bars.
function spyScene({ a }: Look): Scene {
  return {
    draw(p) {
      p.box(0, 0, W, 100, (x, y) => tone(STONE, 1.2 + (rnd(Math.floor(x / 12) + (Math.floor(y / 6) & 1) * 6, Math.floor(y / 6), 8) - 0.5) * 0.6 - ((y % 6 === 5 || (x + (Math.floor(y / 6) & 1) * 6) % 12 === 11) ? 0.6 : 0), x, y))
      p.box(0, 100, W, H, (x, y) => tone(ramp(0x14120e, 0x221e18, 0x332c22), 1.6 + (noise(x * 0.3, y * 0.6, 4) - 0.5) * 1.4, x, y))
      // The window and its bars.
      p.rect(60, 18, 20, 16, C(0x2a3a5a))
      for (let x = 62; x < 80; x += 5) p.line(x, 18, x, 33, IRON[1])
      // Moonlight falling across the floor.
      for (let y = 34; y < H; y++) for (let x = 0; x < W; x++) {
        const u = x - 60 - (y - 34) * 0.55
        if (u > 0 && u < 22 + (y - 34) * 0.15) p.tint(x, y, C(0x9ab4e0), 0.22)
      }
      // Straw, chains on the wall.
      for (let i = 0; i < 40; i++) p.line(90 + rnd(i, 0, 3) * 50, 118 + rnd(i, 1, 3) * 6, 92 + rnd(i, 0, 3) * 50, 116 + rnd(i, 1, 3) * 6, THATCH[2 + (i % 2)])
      for (let i = 0; i < 8; i++) p.set(130 + (i % 2), 60 + i * 2, IRON[3])
      p.disc(130, 77, 3, 3, IRON[2])
      // The bars of the cell in front.
      for (let x = 168; x < W; x += 9) {
        p.box(x, 0, x + 3, H, (xx, yy) => tone(IRON, xx === x ? 3.6 : 2, xx, yy))
      }
      p.box(168, 40, W, 44, IRON[2])
    },
    fx(p, t) {
      const fr = Math.floor(t * 2)
      hooded(p, 118, 120, { kneel: true, pose: fr % 6 === 0 ? 'brow' : 'pray', frame: fr })
      // His sender's token, dropped beside him.
      p.rect(132, 118, 3, 2, a[2])
      // The guard and his torch, flickering through the bars.
      glow(p, 222, 70, 40, C(0xffa040), 0.32 + 0.06 * Math.sin(t * 9))
      soldier(p, 214, 118, ROBE.grey, { flip: true, frame: fr })
      torch(p, 228, 74, t, 3)
      for (let x = 168; x < W; x += 9) p.box(x, 0, x + 3, H, (xx, yy) => tone(IRON, xx === x ? 3.6 : 2, xx, yy))
      // Dust in the moonbeam.
      for (let i = 0; i < 12; i++) {
        const k = (t * 0.05 + rnd(i, 0, 7)) % 1
        const y = 40 + k * 70
        p.tint(66 + (y - 34) * 0.55 + rnd(i, 1, 7) * 18, y, C(0xd8e4f8), 0.6 * Math.sin(k * Math.PI))
      }
    },
  }
}

// Saboteurs: a storehouse on fire at night, a hooded figure slipping away (delay: a building site's scaffold cut down).
function sabotageScene({ variant }: Look): Scene {
  const delay = variant === 'delay'
  return {
    draw(p) {
      sky(p, delay ? SKY_DUSK : SKY_NIGHT, 0, 80)
      farHills(p, 76, ramp(0x10141c, 0x182030, 0x22283a), 4)
      land(p, fields(84), (x, y, dd) => tone(ramp(0x121a14, 0x1a261c, 0x243424, 0x30442c), 2.6 - dd * 0.03 + (noise(x * 0.2, y * 0.4, 2) - 0.5), x, y))
      if (delay) {
        // A half-built wall, its scaffold fallen, stones spilled.
        wall(p, 120, 196, 78, 110, 4)
        for (const sx of [116, 150, 184]) p.line(sx, 110, sx + 12, 70, WOOD[2])
        p.line(110, 108, 200, 96, WOOD[3])
        p.line(100, 116, 170, 120, WOOD[2])
        for (let i = 0; i < 10; i++) p.rect(130 + rnd(i, 0, 2) * 70, 112 + rnd(i, 1, 2) * 10, 4, 3, STONE[3 + (i % 2)])
      } else {
        house(p, 120, 110, { w: 26, d: 44, h: 18, roof: THATCH, door: 'barn' })
        sack(p, 100, 114, 2)
        sack(p, 90, 116, 3)
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 5)
      if (!delay) {
        stars(p, 24, 40, t, 6)
        flames(p, 134, 192, 92, 22, t, 1)
        flames(p, 120, 146, 108, 14, t + 3, 2)
        smoke(p, 160, 60, t, { n: 7, rise: 60, drift: 40, size: 5, seed: 3 })
        glow(p, 160, 90, 70, C(0xff7020), 0.25)
        for (let i = 0; i < 10; i++) {
          const k = (t * 0.6 + rnd(i, 0, 5)) % 1
          p.set(150 + rnd(i, 1, 5) * 40 + Math.sin(k * 8 + i) * 4, 90 - k * 60, FIRE[4])
        }
      }
      // The saboteur running off to the left, over and over.
      const x = 90 - ((t * 22) % 110)
      hooded(p, x, 122, { pose: 'walk', frame: fr, flip: true })
      if (delay) p.line(x + 3, 112, x + 9, 108, STONE[4])
      else torch(p, x - 5, 106, t, 2)
    },
  }
}

// The people risen: a mob with torches and pitchforks before the town gate (free: they hoist their own flag).
function revoltScene({ b, variant }: Look): Scene {
  const free = variant === 'free'
  return {
    draw(p) {
      sky(p, SKY_DUSK, 0, 70)
      farHills(p, 68, ramp(0x2a1a1c, 0x3a2420, 0x4a2e26), 6)
      land(p, fields(78), (x, y, dd) => tone(ramp(0x2a2a18, 0x3a3a20, 0x4c4a28, 0x605c32), 3 - dd * 0.03 + (noise(x * 0.2, y * 0.4, 2) - 0.5), x, y))
      house(p, 60, 56, { w: 14, d: 20, h: 12, roof: TILE })
      house(p, 160, 56, { w: 14, d: 22, h: 12, roof: THATCH })
      wall(p, 40, 216, 50, 84, 7)
      tower(p, 30, 18, 34, 84, TILE, 7)
      tower(p, 208, 18, 34, 84, TILE, 8)
      gateway(p, 128, 84, 10, 26, false)
    },
    fx(p, t) {
      const fr = Math.floor(t * 4)
      banner(p, 39, 18, 14, free ? ROBE.white : b, t)
      banner(p, 217, 18, 14, free ? ROBE.white : b, t + 1)
      const robes = [ROBE.brown, ROBE.ochre, ROBE.green, ROBE.grey, ROBE.red, ROBE.brown, ROBE.teal, ROBE.ochre, ROBE.purple]
      robes.forEach((r, i) => {
        const x = 40 + i * 22 + (i % 2) * 6
        const y = 110 + (i % 3) * 6
        const shout = (fr + i) % 2 === 0
        person(p, x, y, { robe: r, hat: i % 3 === 0 ? 'straw' : i % 3 === 1 ? 'hood' : 'none', pose: i % 2 ? 'point' : 'up', frame: fr + i, flip: i > 4 })
        if (i % 2) torch(p, x + (i > 4 ? -5 : 5), y - 20 + (shout ? -1 : 0), t, i)
        else {
          // A pitchfork shaken over the head.
          const fx = x + 4
          p.line(fx, y - 4, fx, y - 26 + (shout ? -2 : 0), WOOD[3])
          for (const dx of [-2, 0, 2]) p.line(fx + dx, y - 26 + (shout ? -2 : 0), fx + dx, y - 30 + (shout ? -2 : 0), IRON[3])
          p.line(fx - 2, y - 26 + (shout ? -2 : 0), fx + 2, y - 26 + (shout ? -2 : 0), IRON[3])
        }
      })
    },
  }
}

// By night two hooded men lead the queen from the tower to a waiting horse.
function kidnapScene({ b }: Look): Scene {
  return {
    draw(p) {
      sky(p, SKY_NIGHT, 0, 88)
      p.disc(196, 22, 10, 10, C(0xf4f0dc))
      p.disc(200, 19, 9, 9, (x, y) => p.get(x - 24, y))
      glow(p, 194, 22, 34, C(0xc8d4f0), 0.25)
      land(p, fields(90), (x, y, dd) => tone(ramp(0x0e1a16, 0x16261e, 0x203426, 0x2a4430), 2.4 - dd * 0.03 + (noise(x * 0.2, y * 0.4, 2) - 0.5), x, y))
      // The tower, a lit window high up, a rope hanging from it.
      tower(p, 20, 30, 14, 100, ramp(0x10141e, 0x1a2030, 0x262e44, 0x343e58, 0x44506a), 9)
      p.veil(C(0x0a1020), 0.45, () => wall(p, 50, 92, 60, 100, 9))
      p.rect(33, 34, 6, 9, C(0xffd870))
      for (let y = 43; y < 100; y++) p.set(38 + Math.round(Math.sin(y * 0.2) * 1), y, THATCH[2])
      conifer(p, 230, 104, 36, ramp(0x081410, 0x0e2018, 0x142c20, 0x1c3a28, 0x264a30, 0x30583a), { seed: 4 })
    },
    fx(p, t) {
      stars(p, 34, 60, t, 9)
      const fr = Math.floor(t * 3)
      glow(p, 36, 38, 16, C(0xffb040), 0.3 + 0.05 * Math.sin(t * 6))
      const x = 96 + ((t * 7) % 40)
      hooded(p, x, 118, { pose: 'lead', frame: fr })
      person(p, x - 12, 118, { robe: ROBE.rose, hat: 'veil', hatColor: C(0xf0e6d6), pose: 'pray', frame: fr })
      for (let dx = -1; dx <= 1; dx++) p.set(x - 12 + dx, 101, GOLD[4])
      hooded(p, x - 24, 118, { pose: 'walk', frame: fr + 1 })
      // A lantern held low, swinging.
      const lx = x - 20 + Math.round(Math.sin(t * 3) * 1.5)
      p.rect(lx, 108, 3, 4, C(0xffd060))
      glow(p, lx + 1, 110, 14, C(0xffa040), 0.3)
      horse(p, 176, 118, 0, ramp(0x161012, 0x2a1e1c, 0x3e2e28, 0x584238), true)
      void b
    },
  }
}

// Raiders fall on the caravan (repelled: guards stand fast, the raiders run).
function raidScene({ a, b, variant }: Look): Scene {
  const held = variant === 'repelled'
  return {
    draw(p) {
      sky(p, ramp(0x6aa0c8, 0x8ab4cc, 0xb8c8c8, 0xe4d8b8, 0xf2e2c0), 0, 70)
      land(p, (x) => 64 - noise(x * 0.02, 0, 5) * 12, (x, y, dd) => tone(ramp(0xb8784a, 0xcc8c58, 0xdca46a), 2 - dd * 0.12, x, y), 76)
      land(p, fields(72), (x, y, dd) => tone(SAND, 4.2 - dd * 0.02 + (noise(x * 0.2, y * 0.6, 5) - 0.5) * 0.9, x, y))
      p.poly([0, 104, 0, 120, W, 108, W, 96], (x, y) => tone(SAND, 3 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
      if (!held) {
        sack(p, 140, 120, 5)
        sack(p, 152, 118, 6)
        coins(p, 146, 122, 6, 5)
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 4)
      camel(p, 60, 114, held ? 0 : fr, [ROBE.red, ROBE.ochre, ROBE.blue])
      camel(p, 98, 112, held ? 0 : fr + 1, [ROBE.teal, ROBE.brown, ROBE.red])
      person(p, 30, 116, { robe: ROBE.ochre, hat: 'turban', hatColor: C(0xe8e0d0), pose: held ? 'stand' : 'up', frame: fr })
      // Dust over the fight.
      for (let i = 0; i < 10; i++) {
        const k = (t * 0.4 + i / 10) % 1
        p.tint(150 + rnd(i, 0, 4) * 60, 112 - k * 20, C(0xe8d0a0), 0.45 * (1 - k))
      }
      if (held) {
        soldier(p, 128, 116, b, { frame: fr, shield: true })
        soldier(p, 142, 120, b, { frame: fr + 1, shield: true })
        banner(p, 116, 116, 28, b, t)
        const run = (t * 20) % 70
        for (let i = 0; i < 3; i++) soldier(p, 176 + i * 16 + run, 114 + i * 3, a, { pose: 'walk', frame: fr + i })
      } else {
        for (let i = 0; i < 4; i++) soldier(p, 166 + i * 18 - Math.sin(t * 2 + i) * 4, 112 + (i % 2) * 6, a, { flip: true, frame: fr + i, pose: i % 2 ? 'spear' : 'point' })
        banner(p, 236, 116, 30, a, t, { flip: true })
      }
    },
  }
}

// Ships at sea: a fight, fire and smoke (blockade: a line of ships before the lord's pier; calm: one sails off at sunset).
function navalScene({ a, b, variant }: Look): Scene {
  const calm = variant === 'calm'
  const blockade = variant === 'blockade'
  return {
    draw(p) {
      sky(p, calm ? SKY_DUSK : ramp(0x3a4456, 0x4c586c, 0x667388, 0x8592a6, 0xa6b2c0), 0, 64)
      if (calm) {
        p.disc(200, 56, 12, 12, C(0xffd890))
        glow(p, 200, 56, 50, C(0xffb060), 0.35)
      } else cloud(p, 80, 16, 110, 22, ramp(0x2e3442, 0x434b5c, 0x5c6678, 0x7a8496), 3)
      sea(p, 64)
      if (calm) for (let y = 66; y < H; y += 2) for (let x = 188; x < 212; x++) if (rnd(x, y, 3) > 0.6) p.tint(x + Math.round((y - 64) * 0.1), y, C(0xffd890), 0.6)
      if (blockade) {
        // The lord's pier on the left, a small shed on it.
        p.box(0, 84, 70, 90, (x, y) => (x % 6 === 0 ? WOOD[1] : tone(WOOD, 3.4 - (y - 84) * 0.3, x, y)))
        for (let x = 4; x < 70; x += 12) p.box(x, 90, x + 2, 104, WOOD[0])
        house(p, 10, 84, { w: 14, d: 22, h: 10, roof: THATCH })
      }
    },
    fx(p, t) {
      waves(p, t, 64, 50)
      const bob = (k: number) => Math.round(Math.sin(t * 1.6 + k) * 1.2)
      if (calm) {
        ship(p, 150 + ((t * 3) % 40), 84 + bob(0), b, { scale: 0.6, t })
        birds(p, t, 3, 60, 22, C(0x2a1a2a), 3)
        return
      }
      if (blockade) {
        for (let i = 0; i < 3; i++) ship(p, 120 + i * 50, 96 + bob(i) + (i % 2) * 6, a, { scale: 0.7, t, flip: true })
        banner(p, 64, 84, 20, b, t)
        return
      }
      ship(p, 72, 104 + bob(0), b, { t, fire: 0.6 + 0.3 * Math.sin(t * 3) })
      ship(p, 186, 100 + bob(2), a, { flip: true, t })
      // Arrows flying both ways.
      for (let i = 0; i < 8; i++) {
        const k = (t * 0.7 + i / 8) % 1
        const dir = i % 2 ? 1 : -1
        const x0 = dir > 0 ? 82 : 176
        const x = x0 + dir * k * 94
        const y = 70 - Math.sin(k * Math.PI) * 24 + (i % 3) * 3
        p.line(x, y, x - dir * 3, y + (k < 0.5 ? 1 : -1), C(0x2a1a12))
      }
    },
  }
}

// A walled town on a hill, a siege camp below with a catapult hurling stones (taken: the attacker's banner raised on
// the gatehouse; held: the besiegers march off; flee: the folk leave down the road with their bundles).
function siegeScene({ a, b, variant }: Look): Scene {
  const taken = variant === 'taken'
  const held = variant === 'held'
  const flee = variant === 'flee'
  return {
    draw(p) {
      sky(p, flee || held ? SKY_DAY : SKY_DUSK, 0, 70)
      land(p, (x) => 70 - Math.max(0, 40 - Math.abs(x - 176) * 0.4) * 0.8, (x, y, dd) => tone(ramp(0x3a4a2a, 0x4a5c32, 0x5c703a, 0x6c8444), 3 - dd * 0.03 + (noise(x * 0.2, y * 0.4, 4) - 0.5), x, y))
      house(p, 146, 52, { w: 10, d: 16, h: 8, roof: TILE })
      house(p, 196, 52, { w: 10, d: 18, h: 9, roof: THATCH })
      wall(p, 130, 232, 44, 70, 6)
      tower(p, 124, 14, 30, 70, TILE, 6)
      tower(p, 226, 14, 30, 70, TILE, 7)
      tower(p, 170, 16, 24, 70, undefined, 8)
      gateway(p, 178, 70, 6, 16, taken || flee)
      if (!flee && !held) {
        tent(p, 30, 110, 14, a)
        tent(p, 66, 116, 12, a)
      }
      if (flee) p.poly([0, 120, 0, 128, 180, 74, 172, 74], (x, y) => tone(DIRT, 3 + (noise(x * 0.3, y * 0.3, 8) - 0.5), x, y))
    },
    fx(p, t) {
      const fr = Math.floor(t * 4)
      banner(p, 131, 16, 12, b, t)
      banner(p, 233, 16, 12, b, t + 1)
      if (taken) {
        // The attacker's banner climbs the gatehouse pole.
        const k = Math.min(1, (t % 8) / 4)
        p.line(178, 24, 178, -2, WOOD[1])
        banner(p, 178, 22 - 0, Math.round(4 + k * 20), a, t, { w: 12, fh: 8 })
        for (let i = 0; i < 4; i++) soldier(p, 150 + i * 14, 92 + (i % 2) * 4, a, { pose: (fr + i) % 2 ? 'up' : 'spear', frame: fr + i })
        return
      }
      if (flee) {
        smoke(p, 200, 36, t, { n: 5, rise: 36, drift: 20, size: 3 })
        for (let i = 0; i < 5; i++) {
          const k = (t * 0.05 + i / 5) % 1
          const x = 168 - k * 160
          const y = Math.round(78 + k * 44)
          person(p, x, y, { robe: [ROBE.brown, ROBE.ochre, ROBE.rose, ROBE.green, ROBE.grey][i], hat: i % 2 ? 'hood' : 'scarf', pose: 'carry', frame: fr + i, flip: true })
        }
        return
      }
      if (held) {
        const x = 60 - ((t * 10) % 60)
        for (let i = 0; i < 4; i++) soldier(p, x + i * 14, 112 + (i % 2) * 6, a, { pose: 'walk', frame: fr + i, flip: true })
        catapult(p, 100, 120, 0.2)
        p.line(90, 112, 104, 118, WOOD[0])
        for (let i = 0; i < 3; i++) soldier(p, 160 + i * 14, 80, b, { pose: (fr + i) % 2 ? 'up' : 'spear', frame: fr + i })
        return
      }
      // The throw: the arm swings, a stone arcs to the wall and bursts in dust.
      const k = (t * 0.4) % 1
      const arm = k < 0.15 ? k / 0.15 : k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.5)
      catapult(p, 100, 120, arm)
      if (k > 0.1 && k < 0.6) {
        const f = (k - 0.1) / 0.5
        const sx = 112 + f * 60
        const sy = 96 - Math.sin(f * Math.PI) * 50 - f * 30
        p.disc(sx, sy, 2, 2, STONE[2])
      }
      if (k >= 0.6) {
        const d = (k - 0.6) / 0.4
        for (let i = 0; i < 8; i++) p.tint(172 + Math.cos(i) * d * 12, 58 - Math.sin(i * 1.7) * d * 8 - d * 4, C(0xc8bca2), 0.7 * (1 - d))
      }
      for (let i = 0; i < 4; i++) soldier(p, 120 + i * 10, 116 + (i % 2) * 4, a, { frame: fr + i, shield: i % 2 === 0 })
      banner(p, 46, 120, 28, a, t)
    },
  }
}

// Two lines clash on the field in a cloud of dust (tower: a watchtower's archers shoot down on marching soldiers).
function battleScene({ a, b, variant }: Look): Scene {
  const towerShot = variant === 'tower'
  return {
    draw(p) {
      countryside(p, 70, 9)
      if (towerShot) {
        tower(p, 30, 22, 20, 104, TILE, 3)
        p.box(26, 44, 56, 48, WOOD[2])
      }
    },
    fx(p, t) {
      const fr = Math.floor(t * 5)
      if (towerShot) {
        banner(p, 41, 2, 10, b, t)
        person(p, 36, 44, { robe: b, hat: 'helm', pose: 'point', frame: fr })
        person(p, 48, 44, { robe: b, hat: 'helm', pose: 'point', frame: fr + 1 })
        for (let i = 0; i < 6; i++) {
          const k = (t * 0.6 + i / 6) % 1
          const x = 56 + k * (110 + (i % 3) * 20)
          const y = 40 - Math.sin(k * Math.PI) * 14 + k * 70
          p.line(x, y, x - 3, y - 1 + k * 2, C(0x2a1a12))
        }
        for (let i = 0; i < 5; i++) soldier(p, 150 + i * 18, 110 + (i % 2) * 8, a, { flip: true, frame: fr + i, pose: i === 2 && fr % 6 === 0 ? 'brow' : 'walk', shield: i % 2 === 1 })
        return
      }
      banner(p, 30, 114, 34, a, t)
      banner(p, 226, 114, 34, b, t + 1, { flip: true })
      for (let i = 0; i < 5; i++) {
        const surge = Math.round(Math.sin(t * 3 + i) * 2)
        soldier(p, 70 + i * 10 + surge, 106 + i * 4, a, { frame: fr + i, shield: i % 2 === 0 })
        soldier(p, 186 - i * 10 - surge, 106 + i * 4, b, { frame: fr + i + 1, flip: true, shield: i % 2 === 1 })
      }
      for (let i = 0; i < 14; i++) {
        const k = (t * 0.5 + i / 14) % 1
        const x = 128 + (rnd(i, 0, 2) - 0.5) * 50
        p.tint(x, 116 - k * 30, C(0xd8c8a4), 0.5 * (1 - k))
        p.tint(x + 1, 116 - k * 30, C(0xd8c8a4), 0.4 * (1 - k))
      }
    },
  }
}

const FACTORIES: Record<Family, (look: Look) => Scene> = {
  tribute: tributeScene,
  tavern: tavernScene,
  gift: giftScene,
  envoy: envoyScene,
  alliance: allianceScene,
  peace: peaceScene,
  war: warScene,
  insult: insultScene,
  spy: spyScene,
  sabotage: sabotageScene,
  revolt: revoltScene,
  kidnap: kidnapScene,
  raid: raidScene,
  naval: navalScene,
  siege: siegeScene,
  battle: battleScene,
}

// ---- Which scene a notice gets ------------------------------------------------------------------------------------

const hexOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? null

export interface NoticeLook {
  family: Family
  variant?: string
  // The other side's colour and the player's own (interface hex).
  other?: string | null
  own?: string | null
  // A good piece of news (green banner) or a bad one (red).
  tone: 'good' | 'bad'
}

// The family, variant and colours for an envoy's notice (CLAUDE.md §9.8).
export function noticeLook(n: Notice, online: Online): NoticeLook {
  const p = n.payload as Record<string, unknown>
  const me = online.kingdoms.find((k) => k.id === online.me)
  const own = hexOf(me?.color)
  const byName = (name: unknown) => hexOf(online.kingdoms.find((k) => k.name === name)?.color)
  const crown = CROWN_COLORS[Number(p.crown ?? 0) % CROWN_COLORS.length]
  const mine = (name: unknown) => name === me?.name
  const L = (family: Family, other: string | null | undefined, tone: 'good' | 'bad', variant?: string): NoticeLook => ({ family, other, own, tone, variant })
  switch (n.kind) {
    case 'envoy_proposal':
      return p.kind === 'tribute' ? L('tribute', byName(p.from), 'bad') : p.kind === 'alliance' ? L('alliance', byName(p.from), 'good') : L('peace', byName(p.from), 'good')
    case 'envoy_courtesy':
      return p.kind === 'gift' ? L('gift', byName(p.from), 'good') : L('envoy', byName(p.from), 'good')
    case 'envoy_answer':
      if (p.kind === 'alliance') return L('alliance', byName(p.by), p.accepted ? 'good' : 'bad', p.accepted ? '' : 'broken')
      if (p.kind === 'peace') return p.accepted ? L('peace', byName(p.by), 'good') : L('war', byName(p.by), 'bad')
      if (p.kind === 'tribute') return L('tribute', byName(p.by), p.accepted ? 'good' : 'bad', p.accepted ? 'paid' : 'refused')
      return L('envoy', byName(p.by), p.accepted ? 'good' : 'bad')
    case 'war_declared':
      return L('war', byName(p.by), 'bad')
    case 'army_threat':
      return L('war', byName(p.by), 'bad', 'camp')
    case 'peace_enforced':
      return L('peace', byName(p.from), mine(p.from) ? 'good' : 'bad', 'enforced')
    case 'operation_foiled':
      return L('spy', byName(p.by), 'good')
    case 'spy_caught':
      return L('spy', byName(p.owner), 'good')
    case 'spy_lost':
      return L('spy', own, 'bad')
    case 'operation_struck':
      return p.op === 'kidnap' ? L('kidnap', byName(p.by), 'bad') : p.op === 'revolt' || p.op === 'townRevolt' ? L('revolt', byName(p.by), 'bad') : L('sabotage', byName(p.by), 'bad', p.op === 'delay' ? 'delay' : 'burn')
    case 'ransom_paid':
      return L('gift', byName(p.by), 'good', 'ransom')
    case 'queen_released':
      return L('envoy', byName(p.by), 'good', 'queen')
    case 'alliance_broken':
      return L('alliance', byName(p.by), 'bad', 'broken')
    case 'tribute_ended':
      return L('tribute', byName(p.by), p.renege ? 'bad' : 'good', p.renege ? 'refused' : 'paid')
    case 'envoy_insult':
      return L('insult', byName(p.from), 'bad')
    case 'insult_delivered':
      return { family: 'insult', other: own, own: byName(p.to), tone: 'bad' }
    case 'trade_raided':
      return L('raid', byName(p.by), 'bad')
    case 'raid_repelled':
      return L('raid', byName(p.by), 'good', 'repelled')
    case 'naval_battle': {
      const attacker = mine(p.attacker)
      const won = (p.winner === 'attackers') === attacker
      return L('naval', byName(attacker ? p.defender : p.attacker), won ? 'good' : 'bad', p.kind === 'blockade' && p.winner === 'attackers' && !attacker ? 'blockade' : '')
    }
    case 'blockade_lifted':
      return L('naval', byName(p.by), 'good', 'calm')
    case 'fleet_turned':
      return L('naval', own, 'bad', 'calm')
    case 'battle_start':
      if (p.kind === 'revolt') return L('revolt', null, 'bad')
      return p.kind === 'siege' ? L('siege', null, 'bad') : L('battle', null, 'bad')
    case 'battle_end': {
      const won = p.winner === 'attackers'
      if (p.kind === 'revolt') return L('revolt', null, won ? 'good' : 'bad', won ? 'free' : undefined)
      return p.kind === 'siege' ? L('siege', null, 'bad', won ? 'taken' : 'held') : L('battle', null, 'bad')
    }
    case 'siege_people':
      return L('siege', byName(p.by), 'bad', 'flee')
    case 'tower_losses':
      return { family: 'battle', variant: 'tower', other: own, own: null, tone: 'bad' }
    case 'order_failed':
      return L('envoy', own, 'bad', 'lost')
    case 'town_siege':
      return mine(p.by) ? { family: 'siege', other: own, own: null, tone: 'good' } : L('siege', byName(p.by), 'bad')
    case 'town_siege_lifted':
      return L('siege', null, 'good', 'held')
    case 'town_taken':
      return mine(p.by) ? { family: 'siege', variant: 'taken', other: own, own: null, tone: 'good' } : L('siege', byName(p.by), 'bad', 'taken')
    case 'town_held':
      return { family: 'siege', variant: 'held', other: own, own: null, tone: 'bad' }
    case 'patrol_tribute':
      return L('tribute', crown, 'bad')
    case 'patrol_taken':
      return L('tribute', crown, 'bad', 'paid')
    case 'patrol_ignored':
      return L('tribute', crown, 'bad', 'refused')
    case 'patrol_tip':
      return L('tavern', crown, 'good')
    case 'crown_gift':
      return L('gift', crown, 'good')
    case 'town_revolt':
      return L('revolt', null, 'bad')
    case 'town_lost_revolt':
      return L('revolt', null, 'bad', 'free')
    case 'king_command':
      return p.lead ? L('war', null, 'good') : L('envoy', own, 'good')
    case 'king_fell':
      return L('battle', null, 'bad')
    case 'town_sale':
      return L('gift', byName(p.by), 'good')
    case 'cargo_home':
      return L('gift', own, 'good')
    case 'cargo_lost':
      return L('battle', null, 'bad')
    default:
      return L('envoy', null, 'good')
  }
}

// A notice's picture across the top of the envoy's dialog.
export function NoticeArt({ look }: { look: NoticeLook }) {
  const id = `notice:${look.family}:${look.variant ?? ''}:${look.other ?? ''}:${look.own ?? ''}`
  return <SceneCanvas id={id} scene={noticeScene(look)} />
}

// The scene itself (for the dialog, and for previews).
export function noticeScene(look: Pick<NoticeLook, 'family' | 'variant' | 'other' | 'own'>): Scene {
  return FACTORIES[look.family]({ family: look.family, variant: look.variant ?? '', a: dye(look.other, 0x8a3a30), b: dye(look.own, 0xc8952e) })
}
