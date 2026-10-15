import { balance, booksOf, idleFactor, population, soldiersOf, storageCap, yearMs } from '@game/shared'
import type { Kingdom, Pact, Resource, SeenSnapshot, SoldierLoss } from '@game/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { squad } from '../game/armies'
import { STRUCTURE_SPRITES, palaceIn } from '../game/buildingSprites'
import { tent } from '../game/campSprites'
import type { KingdomColor } from '../game/buildingSprites'
import type { Sprite } from '../game/sprites'
import { supabase } from '../lib/supabase'
import type { Battle, Notice } from '../net/online'
import { describe } from './Envoy'
import { Icon } from './icons'
import type { IconName } from './icons'
import { RESOURCE_ICONS, RESOURCE_NAMES } from './names'
import type { Online } from './hud/online'
import { kingdomName } from './hud/online'
import { fmt } from './hud/primitives'

// "While you were away" (CLAUDE.md §11): a ruler back after a while is told, page by page, what happened meanwhile:
// the treasury and stores, the fighting, the tribute taken and paid, the envoys' and spies' doings, and the lobby's
// wars and towns changing hands. Each page has a small picture drawn from the map's own sprites.

// Away at least this long before the report is shown.
const AWAY_MS = 20 * 60_000

// When the ruler was last here and how things stood then (both kept by the server with every command, from before
// this visit). Null when they were not away long.
export function awaySince(state: Kingdom | null | undefined, now: number): { since: number; before: SeenSnapshot | null } | null {
  const lastSeenAt = state?.lastSeenAt
  if (!lastSeenAt || now - lastSeenAt < AWAY_MS) return null
  return { since: lastSeenAt, before: state?.seen ?? null }
}

// ---- Pictures --------------------------------------------------------------------------------------------------------

const W = 320
const H = 128
const GROUND = 84
// The pictures are laid out on a 240 × 96 plan and spread over the wider canvas, so the sprites stand smaller in it.
const SPREAD = W / 240

export interface Placed {
  sprite: Sprite
  x: number
  y: number
}

// The weather and hour a picture is painted in: each report page has its own, the crowns' pages a plain bright day.
export type Mood = Picture | 'day'

// A mood's palette and furniture. Colours are 0xRRGGBB; every surface has a short ramp, blended by ordered dither
// (the map's pixel style: no smooth gradients).
interface Look {
  sky: number[] // top → horizon
  body: { moon: boolean; x: number; y: number; r: number } | null
  glow: [number, number] // the sun's rim and core (the moon's shade and lit side)
  stars: boolean
  cloud: [number, number, number] // shade, body, lit top
  clouds: number
  rock: [number, number, number] // shaded face, lit face, crest
  snow: [number, number] // shaded, lit
  haze: number // the air between here and the far ranges
  hill: [number, number]
  tree: [number, number]
  grass: [number, number, number]
  path: [number, number]
  flowers: number[]
  roof: number
  birds: boolean
  smoke: boolean
  windows: boolean
  castles: { x: number; flag: number | null }[]
  village: number | null // where a far village sits
}

const DAY: Look = {
  sky: [0x4a78c0, 0x6890d0, 0x8cb0dc, 0xb4cce4, 0xd8e4ea],
  body: { moon: false, x: 266, y: 20, r: 6 },
  glow: [0xffe08a, 0xfff8d8],
  stars: false,
  cloud: [0xa4b6cc, 0xdce6f0, 0xffffff],
  clouds: 7,
  rock: [0x5a6488, 0x8a92ae, 0xb8bed0],
  snow: [0xb4c2da, 0xf4f8fc],
  haze: 0xc4d6e4,
  hill: [0x4c7c62, 0x6a9a6c],
  tree: [0x22442c, 0x3a6a40],
  grass: [0x3a7a3e, 0x4c9042, 0x66a84c],
  path: [0x8a6c46, 0xa8885a],
  flowers: [0xf0dc4a, 0xf4f4f0, 0xd85048, 0x9a84e0],
  roof: 0xa04a34,
  birds: true,
  smoke: false,
  windows: false,
  castles: [{ x: 214, flag: 0xd8b040 }],
  village: 72,
}

const LOOKS: Record<Mood, Look> = {
  day: { ...DAY, village: null, castles: [] },
  treasury: { ...DAY, body: { moon: false, x: 40, y: 18, r: 7 }, castles: [{ x: 300, flag: 0xd8b040 }], village: 150 },
  tribute: {
    ...DAY,
    body: { moon: false, x: 160, y: 14, r: 6 },
    castles: [
      { x: 196, flag: 0xc0302c },
      { x: 292, flag: 0x2c50b8 },
    ],
    village: null,
  },
  world: {
    ...DAY,
    sky: [0x5a84c8, 0x7aa0d4, 0xa4bede, 0xcad6e0, 0xf0e2c4],
    body: { moon: false, x: 34, y: 36, r: 6 },
    clouds: 9,
    haze: 0xd8dcd8,
    castles: [{ x: 238, flag: 0xd8b040 }],
    village: 4,
  },
  battle: {
    sky: [0x34283a, 0x5a3440, 0x8a443c, 0xb8603c, 0xd8885a],
    body: { moon: false, x: 204, y: 42, r: 9 },
    glow: [0xe86a3a, 0xffc880],
    stars: false,
    cloud: [0x3a2e36, 0x5a4246, 0x8a5c50],
    clouds: 6,
    rock: [0x382e40, 0x564452, 0x7a5c5c],
    snow: [0x8a7684, 0xd8b4a4],
    haze: 0xc87c5c,
    hill: [0x48463a, 0x5c5840],
    tree: [0x22281f, 0x343e2c],
    grass: [0x485830, 0x586834, 0x6c783a],
    path: [0x664c36, 0x806248],
    flowers: [0xb0402e, 0xa88c3c],
    roof: 0x5a3a2e,
    birds: true,
    smoke: true,
    windows: false,
    castles: [],
    village: null,
  },
  intrigue: {
    sky: [0x0a0e24, 0x111834, 0x18224a, 0x222e5c, 0x2e3c68],
    body: { moon: true, x: 294, y: 18, r: 7 },
    glow: [0x8a94b0, 0xf0ecd8],
    stars: true,
    cloud: [0x161e3a, 0x26304e, 0x56648a],
    clouds: 5,
    rock: [0x121830, 0x202a48, 0x3a4668],
    snow: [0x46567c, 0x8c9cc4],
    haze: 0x2e3c68,
    hill: [0x16223a, 0x1e2e48],
    tree: [0x0a141e, 0x142232],
    grass: [0x14261f, 0x1a3024, 0x223c2a],
    path: [0x2c2e36, 0x383a44],
    flowers: [0x6a6a9c, 0x8a8aa8],
    roof: 0x2a2234,
    birds: false,
    smoke: false,
    windows: true,
    castles: [{ x: 28, flag: null }],
    village: null,
  },
  house: {
    sky: [0x34386e, 0x6a4678, 0xb45c78, 0xe2865a, 0xf6c070],
    body: { moon: false, x: 40, y: 40, r: 10 },
    glow: [0xf89a4a, 0xfff0b0],
    stars: false,
    cloud: [0x6a4868, 0xc07478, 0xfac890],
    clouds: 7,
    rock: [0x46385a, 0x84586a, 0xb8786e],
    snow: [0xc49aa4, 0xffd8b4],
    haze: 0xe6a070,
    hill: [0x56564e, 0x7a6a4e],
    tree: [0x2a2a26, 0x463a28],
    grass: [0x46663a, 0x5a7a3c, 0x768a40],
    path: [0x7a5a3c, 0x96744c],
    flowers: [0xf0c84a, 0xe8705a, 0xf4e8d8],
    roof: 0x8a3c30,
    birds: true,
    smoke: false,
    windows: true,
    castles: [],
    village: null,
  },
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

// 0xRRGGBB → the canvas's pixel (alpha, blue, green, red from the high byte down).
const pix = (c: number) => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0
const lerp = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s
  return ch(16) | ch(8) | ch(0)
}

// Seeded noise, so a mood paints the same picture every time.
const hash = (n: number, seed: number) => {
  let h = Math.imul(n ^ seed, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}
const smooth = (t: number) => t * t * (3 - 2 * t)
const noise1 = (x: number, seed: number) => {
  const i = Math.floor(x)
  return hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * smooth(x - i)
}
const noise2 = (x: number, y: number, seed: number) => {
  const j = Math.floor(y)
  const t = smooth(y - j)
  return noise1(x, seed + j * 7919) * (1 - t) + noise1(x, seed + (j + 1) * 7919) * t
}
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Where the near meadow meets the far country.
const horizon = (x: number) => GROUND - 14 + Math.round(Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 2)

interface Cloud {
  w: number
  h: number
  tone: Uint8Array // 0 empty, 1 shade, 2 body, 3 lit
  x: number
  y: number
  speed: number
}

// A cloud: a heap of round puffs on a flat base (or a long thin bank), lit on top, shaded underneath and to the right.
function cloud(rand: () => number, bank: boolean): Cloud {
  const w = bank ? 40 + Math.floor(rand() * 44) : 18 + Math.floor(rand() * 34)
  const h = bank ? 4 + Math.floor(rand() * 3) : 8 + Math.floor(rand() * 8)
  const tone = new Uint8Array(w * h)
  const puffs: [number, number, number][] = []
  if (bank) {
    for (let k = 0; k < 5; k++) puffs.push([w * (0.15 + 0.7 * rand()), h - 2, 2 + rand() * (h - 2)])
  } else {
    const n = 3 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      const cx = w * (0.18 + (0.64 * k) / (n - 1)) + (rand() - 0.5) * 3
      const r = (h - 1) * (0.45 + 0.55 * (1 - Math.abs(k / (n - 1) - 0.45) * 1.4) * (0.7 + rand() * 0.3))
      puffs.push([cx, h - 1, Math.max(2.5, r)])
    }
  }
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    for (const [cx, cy, r] of puffs) {
      const dx = (x + 0.5 - cx) / (bank ? r * 3.2 : r)
      const dy = (y + 0.5 - cy) / r
      if (dx * dx + dy * dy <= 1) return true
    }
    return false
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      const d = bayer(x, y)
      let t = 2
      if (!inside(x, y - 1) || (!inside(x, y - 2) && d < 0.6) || (!inside(x - 1, y - 1) && d < 0.4)) t = 3
      else if (y >= h - 2 || (y >= h - 3 && d < 0.5) || (!inside(x + 1, y) && d < 0.7) || (x > w * 0.72 && y > h * 0.55 && d < 0.5)) t = 1
      tone[y * w + x] = t
    }
  }
  return { w, h, tone, x: 0, y: 0, speed: 0 }
}

// The still layers of a picture, painted once: the sky, the far country (behind which the clouds pass) and the
// meadow with the sprites stood on it.
interface Backdrop {
  look: Look
  seed: number
  sky: Uint32Array
  far: Uint32Array
  near: Uint32Array
  clouds: Cloud[]
  stars: { x: number; y: number; c: number }[]
  smoke: { x: number; y: number; dir: number }[]
}

function backdrop(mood: Mood, items: Placed[]): Backdrop {
  const look = LOOKS[mood]
  let seed = 0x9e3779b9
  for (let i = 0; i < mood.length; i++) seed = Math.imul(seed ^ mood.charCodeAt(i), 0x01000193) >>> 0
  const rand = random(seed)
  const sky = new Uint32Array(W * H)
  const far = new Uint32Array(W * H)
  const near = new Uint32Array(W * H)
  const put = (layer: Uint32Array, x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) layer[y * W + x] = pix(c)
  }

  // Sky: the ramp in dithered bands, a little bowed so the horizon is not a ruler line.
  const ramp = look.sky
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.max(0, (y + Math.sin(x * 0.02 + 1) * 2) / 74)) * (ramp.length - 1)
      // Each band solid, dithered into the next only near their edge.
      const i = Math.floor(t) + (t - Math.floor(t) > 0.5 + (bayer(x, y) - 0.5) * 0.7 ? 1 : 0)
      sky[y * W + x] = pix(ramp[Math.min(ramp.length - 1, i)])
    }
  }
  // Sun or moon, with dithered rings of glow round it.
  const body = look.body
  if (body) {
    const halo = lerp(look.sky[Math.min(look.sky.length - 1, Math.floor((body.y / 74) * (look.sky.length - 1)))], look.glow[1], body.moon ? 0.18 : 0.35)
    for (let y = body.y - body.r * 3; y <= body.y + body.r * 3; y++) {
      for (let x = body.x - body.r * 3; x <= body.x + body.r * 3; x++) {
        const d = Math.hypot(x - body.x, y - body.y) / body.r
        if (d > 3) continue
        if (d <= 1) {
          let c = look.glow[1]
          if (body.moon) {
            // A gibbous moon: shaded on the right, a few dark seas.
            if (Math.hypot(x - body.x - body.r * 0.9, y - body.y + 1) < body.r * 0.85) c = look.glow[0]
            else if (hash(x * 31 + y, seed) < 0.12) c = lerp(look.glow[1], look.glow[0], 0.5)
          } else if (d > 0.72) c = look.glow[0]
          put(sky, x, y, c)
        } else if (bayer(x, y) < (3 - d) / 2.4 - (d > 1.6 ? 0.25 : 0)) put(sky, x, y, halo)
      }
    }
  }
  const stars: Backdrop['stars'] = []
  if (look.stars)
    for (let k = 0; k < 70; k++) {
      const x = Math.floor(rand() * W)
      const y = Math.floor(Math.pow(rand(), 1.4) * 58)
      stars.push({ x, y, c: rand() < 0.2 ? 0xfff4d0 : rand() < 0.5 ? 0xc8d0f0 : 0x8890b8 })
    }

  // Three mountain ranges, far to near: peaks lit on the left, shaded on the right, streaked with gullies, snow on
  // the high ones, and the far ones paler in the haze; mist gathers at their feet.
  const ranges = [
    { base: 66, peaks: 6, lo: 26, hi: 46, haze: 0.55, snow: 24 },
    { base: 68, peaks: 5, lo: 18, hi: 32, haze: 0.33, snow: 22 },
    { base: 72, peaks: 5, lo: 8, hi: 18, haze: 0.14, snow: 99 },
  ]
  ranges.forEach((range, r) => {
    const peaks = Array.from({ length: range.peaks }, (_, k) => ({
      x: -30 + ((k + 0.2 + rand() * 0.6) * (W + 60)) / range.peaks,
      h: range.lo + rand() * (range.hi - range.lo),
      l: 0.6 + rand() * 0.7,
      r: 0.7 + rand() * 0.7,
    }))
    const tone = (c: number, mist: number) => lerp(c, look.haze, Math.min(1, range.haze + mist))
    const nseed = seed + r * 101
    for (let x = 0; x < W; x++) {
      let best = peaks[0]
      let top = -Infinity
      for (const p of peaks) {
        const e = p.h - Math.abs(x - p.x) * (x < p.x ? p.l : p.r)
        if (e > top) {
          top = e
          best = p
        }
      }
      const elev = Math.max(2, top + (noise1(x * 0.12, nseed) - 0.5) * 4 + (noise1(x * 0.5, nseed + 7) - 0.5) * 1.6)
      const crest = Math.round(range.base - elev)
      const lit = x < best.x
      for (let y = crest; y < H; y++) {
        const e = range.base - y
        const gully = noise1((x + (y - crest) * (lit ? 0.9 : -0.9)) * 0.28, nseed + 13)
        let c = lit ? (gully > 0.74 ? look.rock[0] : look.rock[1]) : gully > 0.8 ? lerp(look.rock[0], look.rock[1], 0.5) : look.rock[0]
        if (y === crest && lit) c = look.rock[2]
        const snowline = range.snow + (noise1(x * 0.3, nseed + 21) - 0.5) * 6
        if (e + (bayer(x, y) - 0.5) * 3 > snowline) c = lit || (gully > 0.7 && bayer(x, y) < 0.5) ? look.snow[1] : look.snow[0]
        const mist = e < 10 ? (bayer(x, y) * 10 > e ? 0.22 : 0.1) : 0
        far[y * W + x] = pix(tone(c, mist))
      }
    }
  })

  // Rolling hills before the mountains, dotted with copses; a castle and a village on them.
  const hillTop = (x: number) => Math.round(70 - noise1(x * 0.03, seed + 300) * 10 - noise1(x * 0.09, seed + 301) * 4)
  for (let x = 0; x < W; x++) {
    const top = hillTop(x)
    const slope = hillTop(x + 2) - hillTop(x - 2)
    for (let y = top; y < H; y++) {
      const lit = slope + (bayer(x, y) - 0.5) * 2 < 0 ? 1 : 0
      const c = lerp(look.hill[lit], look.haze, y < top + 2 ? 0.08 : 0.15)
      far[y * W + x] = pix(y === top && lit ? lerp(c, 0xffffff, 0.12) : c)
    }
  }
  for (let k = 0; k < 26; k++) {
    const cx = Math.floor(rand() * W)
    const n = 2 + Math.floor(rand() * 5)
    for (let j = 0; j < n; j++) {
      const x = cx + j * 2 + Math.floor(rand() * 2)
      const y = hillTop(x) + 2 + Math.floor(rand() * 3)
      const c = lerp(look.tree[0], look.haze, 0.2)
      put(far, x, y - 1, lerp(look.tree[1], look.haze, 0.2))
      put(far, x + 1, y - 1, c)
      put(far, x, y, c)
      put(far, x + 1, y, c)
    }
  }
  const stone: [number, number] = [lerp(look.rock[0], look.haze, 0.18), lerp(look.rock[2], look.haze, 0.18)]
  const lamp = 0xffd468
  const block = (x0: number, y0: number, w: number, h: number, crenel: boolean) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (crenel && y === y0 && (x - x0) % 2 === 1) continue
        put(far, x, y, x - x0 < Math.ceil(w / 2) ? stone[1] : stone[0])
      }
  }
  const pane = (x: number, y: number) => put(far, x, y, look.windows ? lamp : lerp(stone[0], 0x000000, 0.35))
  for (const castle of look.castles) {
    const cx = castle.x
    const base = Math.max(hillTop(cx - 10), hillTop(cx + 10), hillTop(cx)) + 2
    block(cx - 10, base - 6, 21, 6, true)
    block(cx - 12, base - 11, 4, 11, true)
    block(cx + 9, base - 11, 4, 11, true)
    block(cx - 3, base - 15, 7, 15, true)
    pane(cx - 1, base - 11)
    pane(cx + 1, base - 11)
    pane(cx - 11, base - 7)
    pane(cx + 10, base - 7)
    for (let y = base - 3; y < base; y++) put(far, cx, y, lerp(stone[0], 0x000000, 0.4))
    if (castle.flag !== null) {
      for (let y = base - 21; y < base - 15; y++) put(far, cx, y, 0x3a3030)
      for (let y = 0; y < 3; y++) for (let x = 1; x < 6 - y; x++) put(far, cx + x, base - 21 + y, y === 0 ? lerp(castle.flag, 0xffffff, 0.2) : castle.flag)
      for (const tx of [cx - 11, cx + 10]) {
        for (let y = base - 15; y < base - 11; y++) put(far, tx, y, 0x3a3030)
        put(far, tx + 1, base - 15, castle.flag)
        put(far, tx + 2, base - 15, castle.flag)
        put(far, tx + 1, base - 14, castle.flag)
      }
    }
  }
  if (look.village !== null) {
    const roof = lerp(look.roof, look.haze, 0.2)
    const wall = lerp(0xd8c8a0, look.haze, 0.35)
    const wallShade = lerp(0xa89878, look.haze, 0.35)
    for (let k = 0; k < 6; k++) {
      const x0 = look.village + k * 7 + Math.floor(rand() * 3)
      const base = hillTop(x0 + 2) + 3 + (k % 2)
      const tall = k === 2
      const wh = tall ? 7 : 3
      for (let y = base - wh; y < base; y++) for (let x = x0; x < x0 + 5; x++) put(far, x, y, x < x0 + 3 ? wall : wallShade)
      if (tall) {
        // A little church: a spire.
        for (let y = 0; y < 5; y++) for (let x = x0 + 2 - Math.floor(y / 2); x <= x0 + 2 + Math.floor(y / 2); x++) put(far, x, base - wh - 5 + y, roof)
      } else for (let y = 0; y < 2; y++) for (let x = x0 - 1 + y; x < x0 + 6 - y; x++) put(far, x, base - wh - 2 + y, roof)
      pane(x0 + 1, base - 2)
      if (look.windows && k % 2 === 0) pane(x0 + 3, base - 2)
    }
  }

  // The meadow: patches of light and dark grass, hazy where it meets the far country, a path winding off, tufts and
  // flowers, and stands of trees along its far edge.
  const pathEnd = 90 + rand() * 140
  const pathStart = pathEnd + (rand() < 0.5 ? -1 : 1) * (40 + rand() * 50)
  const pathAt = (y: number) => {
    const t = Math.max(0, (y - 66) / (H - 66))
    return { x: pathEnd + (pathStart - pathEnd) * t + Math.sin(t * 5 + seed) * 10 * t, half: 0.6 + t * 6.5 }
  }
  for (let x = 0; x < W; x++) {
    const top = horizon(x)
    for (let y = top; y < H; y++) {
      const d = bayer(x, y)
      const v = noise2(x * 0.06, y * 0.16, seed + 500) * 1.4 + noise2(x * 0.3, y * 0.5, seed + 501) * 0.6 - 0.2
      let c = look.grass[Math.max(0, Math.min(2, Math.floor(v + d - 0.5)))]
      const fade = (y - top) / 7
      if (fade < 1 && d > fade) c = lerp(c, look.haze, 0.25)
      const p = pathAt(y)
      const off = Math.abs(x - p.x)
      if (y > top + 1 && off < p.half + (d - 0.5)) c = off < p.half * 0.45 ? look.path[1] : look.path[0]
      near[y * W + x] = pix(c)
    }
  }
  for (let k = 0; k < 170; k++) {
    const x = Math.floor(rand() * W)
    const y = horizon(x) + 4 + Math.floor(Math.pow(rand(), 0.7) * (H - horizon(x) - 4))
    const p = pathAt(y)
    if (Math.abs(x - p.x) < p.half + 1) continue
    put(near, x, y, look.grass[0])
    put(near, x - 1, y - 1, look.grass[2])
    put(near, x + 1, y - 1, look.grass[2])
    if (y > 100) put(near, x, y - 2, look.grass[2])
  }
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(rand() * W)
    const y = horizon(x) + 6 + Math.floor(rand() * (H - horizon(x) - 6))
    const p = pathAt(y)
    if (Math.abs(x - p.x) < p.half + 1) continue
    const c = look.flowers[Math.floor(rand() * look.flowers.length)]
    put(near, x, y, c)
    if (y > 104) {
      put(near, x + 1, y, c)
      put(near, x, y + 1, look.grass[0])
    }
  }
  const treeDark = lerp(look.tree[0], look.haze, 0.1)
  const treeLit = lerp(look.tree[1], look.haze, 0.1)
  for (let s = 0; s < 5; s++) {
    const x0 = Math.floor(rand() * W)
    const len = 14 + Math.floor(rand() * 40)
    for (let x = x0; x < x0 + len; x += 2 + Math.floor(rand() * 2)) {
      const p = pathAt(horizon(x) + 1)
      if (Math.abs(x - p.x) < 4) continue
      const base = horizon(x) + 1
      const h = 4 + Math.floor(rand() * 5)
      const round = rand() < 0.35
      for (let j = 0; j < h; j++) {
        const half = round ? Math.round(Math.sqrt(Math.max(0, (h / 2) ** 2 - (j - h / 2) ** 2))) : Math.floor(j / 2)
        for (let dx = -half; dx <= half; dx++) put(near, x + dx, base - h + j, dx < 0 || (dx === 0 && j % 2 === 0) ? treeLit : treeDark)
      }
      put(near, x, base, look.tree[0])
    }
  }

  // The sprites, back to front; their translucent shade pixels darken what is under them.
  for (const { sprite, x, y } of [...items].sort((a, b) => a.y - b.y)) {
    const ox = Math.round(x * SPREAD - sprite.anchorX)
    const oy = Math.round(GROUND + (y - 64) * SPREAD + 8 - sprite.anchorY)
    for (let sy = 0; sy < sprite.height; sy++) {
      for (let sx = 0; sx < sprite.width; sx++) {
        const c = sprite.pixels[sy * sprite.width + sx]
        if (c >>> 24 === 0) continue
        const tx = ox + sx
        const ty = oy + sy
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
        const i = ty * W + tx
        near[i] = c >>> 24 === 255 || near[i] === 0 ? c : over(near[i], c)
      }
    }
  }

  const clouds: Cloud[] = []
  for (let k = 0; k < look.clouds; k++) {
    const c = cloud(rand, k % 3 === 2)
    c.y = 3 + Math.floor(rand() * 40)
    c.x = rand() * (W + c.w)
    c.speed = 0.6 + (c.w / 80) * 1.6 + rand() * 0.6
    clouds.push(c)
  }
  // Nearer (lower) clouds pass in front of the higher ones.
  clouds.sort((a, b) => a.y + a.h - (b.y + b.h))
  const smoke = look.smoke
    ? [
        { x: 40 + rand() * 40, y: horizon(60) - 1, dir: 1 },
        { x: 150 + rand() * 40, y: horizon(170) - 1, dir: 1 },
        { x: 250 + rand() * 40, y: horizon(270) - 1, dir: -1 },
      ]
    : []
  return { look, seed, sky, far, near, clouds, stars, smoke }
}

// `src` (a canvas pixel with alpha) laid over the opaque `dst`.
function over(dst: number, src: number) {
  const k = (src >>> 24) / 255
  const ch = (s: number) => Math.round(((dst >>> s) & 255) + (((src >>> s) & 255) - ((dst >>> s) & 255)) * k) << s
  return (0xff000000 | ch(16) | ch(8) | ch(0)) >>> 0
}

// One frame of the picture at `t` seconds: the sky, the clouds drifting across it, the far country, smoke and
// birds, then the meadow and the sprites.
function paint(b: Backdrop, t: number, out: Uint32Array) {
  const { look } = b
  out.set(b.sky)
  for (const s of b.stars) {
    const twinkle = hash(s.x * 131 + s.y + Math.floor(t * 1.5) * 977, b.seed) < 0.15
    out[s.y * W + s.x] = pix(twinkle ? lerp(s.c, look.sky[1], 0.6) : s.c)
  }
  const cloudTones = look.cloud.map(pix)
  for (const c of b.clouds) {
    const ox = Math.round(((c.x + c.speed * t) % (W + c.w)) - c.w)
    for (let y = 0; y < c.h; y++) {
      const ty = c.y + y
      for (let x = 0; x < c.w; x++) {
        const tone = c.tone[y * c.w + x]
        const tx = ox + x
        if (tone && tx >= 0 && tx < W) out[ty * W + tx] = cloudTones[tone - 1]
      }
    }
  }
  for (let i = 0; i < out.length; i++) if (b.far[i]) out[i] = b.far[i]
  // Smoke from fires beyond the hills: puffs that rise, swell, lean with the wind and thin out.
  for (const s of b.smoke) {
    for (let k = 0; k < 12; k++) {
      const age = (t * 0.05 + k / 12 + s.x * 0.01) % 1
      const cx = s.x + s.dir * age * age * 26 + Math.sin(age * 7 + k) * 1.5
      const cy = s.y - age * 58
      const r = 2 + age * 9
      const dense = (1 - age) * 1.1
      const shade = lerp(0x1e1a1c, 0x6a5e5c, age)
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const d = Math.hypot(x - cx, y - cy) / r
          if (d > 1 || bayer(x, y) > dense * (1.2 - d * 0.6)) continue
          out[y * W + x] = pix(d < 0.7 && x < cx && y < cy ? lerp(shade, look.glow[1], 0.18) : shade)
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      const x = Math.round(s.x + (hash(k + Math.floor(t * 6), b.seed) - 0.5) * 4)
      const y = Math.round(s.y + 1 - hash(k * 7 + Math.floor(t * 6), b.seed) * 3)
      if (x >= 0 && x < W) out[y * W + x] = pix(k % 2 ? 0xffc040 : 0xe85a2a)
    }
  }
  // A flock in a V, wings beating.
  if (look.birds) {
    const bird = pix(lerp(look.tree[0], look.sky[0], 0.25))
    const fx = ((b.seed % 200) + t * 7) % (W + 60) - 30
    const fy = 26 + (b.seed % 14) + Math.sin(t * 0.4) * 3
    for (let k = 0; k < 7; k++) {
      const side = k === 0 ? 0 : k % 2 ? 1 : -1
      const rank = Math.ceil(k / 2)
      const x = Math.round(fx - rank * 5)
      const y = Math.round(fy + side * rank * 3)
      const up = Math.floor(t * 5 + k * 1.7) % 2 === 0
      const shape = up ? [[-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1]] : [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]]
      for (const [dx, dy] of shape) {
        const tx = x + dx
        const ty = y + dy
        if (tx >= 0 && tx < W && ty >= 0 && ty < H && !b.far[ty * W + tx]) out[ty * W + tx] = bird
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    const c = b.near[i]
    if (c === 0) continue
    out[i] = c >>> 24 === 255 ? c : over(out[i], c)
  }
}

// A little picture: mountains, hills and a meadow under a sky with weather of the mood's own, the sprites stood on
// the meadow. The clouds, birds, smoke and stars move a little, unless the player asks for less motion.
export function Scene({ items, mood = 'day' }: { items: Placed[]; mood?: Mood }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const b = backdrop(mood, items)
    const image = ctx.createImageData(W, H)
    const out = new Uint32Array(image.data.buffer)
    const draw = (t: number) => {
      paint(b, t, out)
      ctx.putImageData(image, 0, 0)
    }
    draw(0)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    let last = -1
    const start = performance.now()
    const tick = (now: number) => {
      // Ten frames a second is plenty for drifting clouds.
      const step = Math.floor((now - start) / 100)
      if (step !== last) {
        last = step
        draw(step / 10)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [items, mood])
  return <canvas ref={canvas} className="away-scene" width={W} height={H} aria-hidden />
}

// A heap of gold coins (and a chest), drawn pixel by pixel.
function coins(n: number): Sprite {
  const w = 34
  const h = 20
  const pixels = new Uint32Array(w * h)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) pixels[y * w + x] = (255 << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)
  }
  const GOLD = [0x7a5a18, 0xc8952e, 0xf2d16b, 0xfff0b0]
  for (let k = 0; k < n; k++) {
    const r = Math.sin(k * 12.9898) * 43758.5453
    const f = r - Math.floor(r)
    const cx = 4 + Math.floor(f * 26)
    const cy = 17 - Math.floor(((k * 7) % 11) * (1 - Math.abs(cx - 17) / 17))
    for (let dx = -2; dx <= 2; dx++) {
      set(cx + dx, cy, GOLD[Math.abs(dx) === 2 ? 1 : 2])
      set(cx + dx, cy + 1, GOLD[0])
    }
    set(cx - 1, cy - 1, GOLD[3])
    set(cx, cy - 1, GOLD[2])
  }
  return { width: w, height: h, anchorX: 17, anchorY: 19, pixels, shadow: 0 }
}

export type Picture = 'treasury' | 'battle' | 'tribute' | 'intrigue' | 'world' | 'house'

export function picture(kind: Picture, own: string | undefined, foe: string | undefined): Placed[] {
  const color = (c: string | undefined) => (c ?? 'emerald') as KingdomColor
  const S = STRUCTURE_SPRITES
  switch (kind) {
    case 'treasury':
      return [
        { sprite: S.treasury[0], x: 64, y: 84 },
        { sprite: S.market[1], x: 176, y: 86 },
        { sprite: coins(26), x: 120, y: 82 },
        { sprite: S.warehouse[0], x: 214, y: 70 },
      ]
    case 'battle':
      return [
        { sprite: palaceIn(own, 2), x: 40, y: 82 },
        { sprite: squad(own ?? null, 0, 12), x: 104, y: 88 },
        { sprite: squad(own ?? null, 2, 8), x: 92, y: 74 },
        { sprite: squad(foe ?? 'coal', 1, 12), x: 168, y: 88 },
        { sprite: squad(foe ?? 'coal', 3, 8), x: 184, y: 74 },
        { sprite: tent(color(foe ?? 'coal'), 0), x: 222, y: 72 },
      ]
    case 'tribute':
      return [
        { sprite: palaceIn(own, 2), x: 60, y: 84 },
        { sprite: squad('crimson', 0, 6), x: 140, y: 88 },
        { sprite: squad('crimson', 2, 6), x: 166, y: 82 },
        { sprite: squad('royal', 1, 6), x: 196, y: 76 },
        { sprite: coins(14), x: 108, y: 84 },
      ]
    case 'intrigue':
      return [
        { sprite: S.spyHouse[0], x: 70, y: 84 },
        { sprite: S.prison[0], x: 170, y: 84 },
        { sprite: S.house[2], x: 120, y: 72 },
      ]
    case 'house':
      return [
        { sprite: palaceIn(own, 3), x: 120, y: 84 },
        { sprite: S.house[3], x: 40, y: 82 },
        { sprite: S.temple[0], x: 206, y: 82 },
      ]
    case 'world':
      return [
        { sprite: S.house[0], x: 40, y: 84 },
        { sprite: S.house[1], x: 66, y: 76 },
        { sprite: S.market[0], x: 96, y: 88 },
        { sprite: tent(color(foe ?? 'violet'), 0), x: 172, y: 76 },
        { sprite: tent(color(foe ?? 'violet'), 1), x: 196, y: 70 },
        { sprite: tent(color(own), 1), x: 206, y: 88 },
        { sprite: squad(own ?? null, 1, 8), x: 140, y: 92 },
      ]
  }
}

// ---- The report ------------------------------------------------------------------------------------------------------

interface Line {
  icon: IconName
  text: string
  tone?: 'up' | 'down'
}

interface Page {
  title: string
  picture: Picture
  lines: Line[]
}

const MILITARY = new Set(['battle_start', 'battle_end', 'town_siege', 'town_taken', 'town_held', 'town_siege_lifted', 'town_revolt', 'town_lost_revolt', 'tower_losses', 'army_threat', 'trade_raided', 'raid_repelled', 'war_declared', 'peace_enforced', 'order_failed'])
const TRIBUTE = new Set(['patrol_tribute', 'patrol_taken', 'patrol_tip', 'patrol_ignored', 'tribute_ended', 'crown_gift'])

const duration = (ms: number) => {
  const minutes = Math.round(ms / 60_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} saat${m ? ` ${m} dakika` : ''}` : `${m} dakika`
}
// What took the soldiers, as the report names it.
const LOSSES: Record<SoldierLoss, string> = { battle: 'meydan muharebesi', siege: 'saray kuşatması', town: 'kasaba kuşatması', towers: 'gözcü kuleleri', raid: 'ticaret yağması', crisis: 'afette seferberlik', disband: 'terhis' }

const delta = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`

export function AwayReport({ lobby, me, since, before, kingdom, online, now, onClose }: {
  lobby: string
  me: number
  since: number
  before: SeenSnapshot | null
  kingdom: Kingdom
  online: Online
  now: number
  onClose: (notices: number[]) => void
}) {
  const [data, setData] = useState<{ notices: Notice[]; battles: Battle[]; wars: Pact[]; towns: { name: string; owner_id: number | null; taken_at: string }[] } | null>(null)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const iso = new Date(since).toISOString()
    Promise.all([
      supabase.from('notices').select('*').eq('lobby_id', lobby).eq('kingdom_id', me).gt('show_at', iso).lte('show_at', new Date().toISOString()).order('show_at').limit(120),
      supabase.from('battles').select('*').eq('lobby_id', lobby).gt('ends_at', iso).order('started_at').limit(40),
      supabase.from('pacts').select('*').eq('lobby_id', lobby).eq('kind', 'war').or(`started_at.gt.${iso},ended_at.gt.${iso}`).order('started_at'),
      supabase.from('lobby_towns').select('name, owner_id, taken_at').eq('lobby_id', lobby).gt('taken_at', iso).order('taken_at'),
    ]).then(([n, b, p, t]) =>
      setData({ notices: (n.data ?? []) as Notice[], battles: (b.data ?? []) as Battle[], wars: (p.data ?? []) as Pact[], towns: (t.data ?? []) as { name: string; owner_id: number | null; taken_at: string }[] }),
    )
  }, [lobby, me, since])

  const pages = useMemo((): Page[] => {
    if (!data) return []
    const away = now - since
    const name = (id: number | null) => (id === null ? 'Kimse' : kingdomName(online, id))
    const out: Page[] = []

    // The treasury and the stores, from the season's accounts: what really came in and went out while away.
    const books = booksOf(kingdom)
    const was = before ? { ...booksOf({ books: before.books }) } : null
    const since0 = (pick: (b: typeof books) => number) => (was ? pick(books) - pick(was) : 0)
    const money: Line[] = [{ icon: 'time', text: `${duration(away)} yoktun.` }]
    if (before && was) {
      for (const r of ['gold', 'food', 'materials', 'arms'] as Resource[]) {
        const d = kingdom.stock[r] - before.stock[r]
        if (Math.abs(d) < 1) continue
        money.push({ icon: RESOURCE_ICONS[r], text: `${RESOURCE_NAMES[r]}: ${fmt(before.stock[r])} → ${fmt(kingdom.stock[r])} (${delta(d)})`, tone: d >= 0 ? 'up' : 'down' })
      }
      const tax = since0((b) => b.tax)
      const wages = since0((b) => b.wages)
      const trade = since0((b) => b.trade)
      const other = since0((b) => b.other)
      const tributeIn = since0((b) => b.tributeIn)
      const tributeOut = since0((b) => b.tributeOut)
      const crownPaid = since0((b) => b.crownPaid)
      const crownGot = since0((b) => b.crownGot)
      const wasted = since0((b) => b.wastedGold)
      if (tax >= 1) money.push({ icon: 'gold', text: `Vergiden ${fmt(tax)} altın toplandı.`, tone: 'up' })
      const is = kingdom.trade.ledger
      const sold = is ? (['food', 'materials', 'arms'] as const).map((g) => [g, (is[g] ?? 0) - (before.ledger?.[g] ?? 0)] as const).filter(([, v]) => v > 0) : []
      if (trade >= 1) money.push({ icon: 'trade', text: `Tüccarın ${sold.map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g].toLowerCase()}`).join(', ')} sattı, ${fmt(trade)} altın getirdi.`, tone: 'up' })
      // Stores that came near the top while away: production slowed there instead of overflowing (economy.ts).
      const room = storageCap(kingdom, now)
      const slowed = (['food', 'materials', 'arms'] as const).filter((g) => kingdom.stock[g] >= room * balance.economy.away.storesKnee).map((g) => RESOURCE_NAMES[g].toLowerCase())
      if (slowed.length > 0) money.push({ icon: 'chest', text: `Sen yokken ambarcılar ${slowed.join(' ve ')} ambarını ağzına kadar doldurmadı: ambar dolmaya yaklaşınca üretim yavaşladı.` })
      const slack = since0((b) => b.tradeSlack ?? 0)
      if (slack > 0) money.push({ icon: 'trade', text: `Sen yokken tüccar biraz kaytardı: ${fmt(slack)} seferde yükün ancak %${Math.round(balance.economy.away.merchantLoad * 100)}'sini götürdü.`, tone: 'down' })
      const held = since0((b) => b.tradeHeld)
      if (held > 0) money.push({ icon: 'trade', text: `Hazine dolu olduğu için tüccar ${fmt(held)} sefer mal götürmeden bekledi; yer açılınca yeniden satmaya başladı.` })
      if (other >= 1) money.push({ icon: 'gold', text: `Kasabalardan, olaylardan ve balıkçıdan ${fmt(other)} altın geldi.`, tone: 'up' })
      const upkeep = since0((b) => b.townUpkeep ?? 0)
      if (upkeep >= 1) money.push({ icon: 'crown', text: `Kasabaların bakımına ${fmt(upkeep)} altın gitti.`, tone: 'down' })
      if (wages >= 1) money.push({ icon: 'swords', text: `Askerlerin maaşına ${fmt(wages)} altın gitti.`, tone: 'down' })
      if (wasted >= 1) money.push({ icon: 'warn', text: `Hazine dolu olduğu için ${fmt(wasted)} altın (çoğu vergi) sığmadı, boşa gitti. Hazine yaparak ya da harcayarak yer aç.`, tone: 'down' })
      const wastedGoods = since0((b) => b.wastedGoods)
      if (wastedGoods >= 1) {
        // Which goods stand at the cap now, and what would make room for them.
        const cap = storageCap(kingdom, now)
        const full = (['food', 'materials', 'arms'] as const).filter((g) => kingdom.stock[g] >= cap - 1).map((g) => RESOURCE_NAMES[g].toLowerCase())
        const which = full.length > 0 ? ` (${full.join(' ve ')} ${fmt(cap)} sınırında)` : ''
        money.push({ icon: 'warn', text: `Ambarlar dolu olduğu için ${fmt(wastedGoods)} birim mal boşa gitti${which}. Tüccarı dolu mala çevir, harca ya da ambar kur.`, tone: 'down' })
      }
      // What the accounts do not cover: buildings, training, envoys and purchases (or loot and gifts coming in).
      const rest = kingdom.stock.gold - before.stock.gold - (tax + trade + other + tributeIn + crownGot - wages - upkeep - tributeOut - crownPaid - wasted)
      if (rest <= -1) money.push({ icon: 'build', text: `İnşaat, eğitim, elçiler ve alımlara ${fmt(-rest)} altın harcandı.`, tone: 'down' })
      else if (rest >= 1) money.push({ icon: 'gold', text: `Başka yollardan (yağma, hediye, fidye…) ${fmt(rest)} altın geldi.`, tone: 'up' })
      const p1 = population(kingdom, now)
      if (before.villagers !== p1.villagers) money.push({ icon: 'people', text: `Köylüler: ${before.villagers} → ${p1.villagers}`, tone: p1.villagers >= before.villagers ? 'up' : 'down' })
      const h0 = Math.round(before.happiness)
      const h1 = Math.round(kingdom.happiness ?? 0)
      if (h0 !== h1) money.push({ icon: h1 >= h0 ? 'happy' : 'unhappy', text: `Mutluluk: %${h0} → %${h1}`, tone: h1 >= h0 ? 'up' : 'down' })
    } else {
      money.push({ icon: 'gold', text: `Hazinede ${fmt(kingdom.stock.gold)} altın var (gidişindeki hâli kayıtlı değil; bundan sonraki dönüşlerinde ayrıntılı rapor gelecek).` })
    }
    const idle = idleFactor({ ...kingdom, lastSeenAt: since }, now)
    if (idle < 1) money.push({ icon: 'warn', text: `Uzun süre yoktun: binaların üretimi (yemek hariç), vergi ve tüccarın kazancı %${Math.round(idle * 100)} düzeyine kadar düştü (yokluk cezası). Döndüğün için yeniden tam çalışıyorlar.`, tone: 'down' })
    out.push({ title: 'Mali rapor', picture: 'treasury', lines: money })

    // The fighting.
    const war: Line[] = data.notices.filter((n) => MILITARY.has(n.kind)).map((n) => {
      const { icon, title, text } = describe(n, online)
      return { icon, text: text ? `${title}: ${text}` : title, tone: n.kind === 'town_taken' && (n.payload as { by?: string }).by === kingdom.name ? 'up' : 'down' }
    })
    if (before && was) {
      const s1 = soldiersOf(kingdom)
      const lost = (Object.keys(LOSSES) as SoldierLoss[]).map((c) => [c, (books.lost[c] ?? 0) - (was.lost[c] ?? 0)] as const).filter(([, n]) => n > 0)
      if (before.soldiers !== s1 || lost.length > 0) {
        const why = lost.map(([c, n]) => `${LOSSES[c]} ${fmt(n)}`).join(', ')
        war.push({ icon: 'swords', text: `Askerlerin: ${before.soldiers} → ${s1}${why ? ` (${why})` : ''}`, tone: s1 >= before.soldiers ? 'up' : 'down' })
      }
    }
    const mine = data.battles.filter((b) => [...b.attackers, ...b.defenders].some((f) => f.kingdom === me))
    for (const b of mine) {
      if (!b.report) continue
      const won = (b.plan.winner === 'attackers' ? b.attackers : b.defenders).some((f) => f.kingdom === me)
      war.push({ icon: 'swords', text: `${b.kind === 'siege' ? 'Kuşatma' : 'Meydan muharebesi'} ${won ? 'kazanıldı' : 'kaybedildi'} (${Object.entries(b.report.losses).map(([who, n]) => `${who} −${fmt(n)}`).join(', ')})`, tone: won ? 'up' : 'down' })
    }
    if (war.length > 0) out.push({ title: 'Askeri rapor', picture: 'battle', lines: war })

    // Tribute: the crowns' patrols, and what was paid and received between lords.
    const tribute: Line[] = data.notices.filter((n) => TRIBUTE.has(n.kind)).map((n) => {
      const { icon, title, text } = describe(n, online)
      return { icon, text: text ? `${title}: ${text}` : title, tone: n.kind === 'patrol_tip' || n.kind === 'crown_gift' ? 'up' : 'down' }
    })
    if (was) {
      const paid = since0((b) => b.crownPaid)
      const got = since0((b) => b.crownGot)
      const out = since0((b) => b.tributeOut)
      const into = since0((b) => b.tributeIn)
      const sums: Line[] = []
      if (paid >= 1) sums.push({ icon: 'gold', text: `Rakip tacın haraççıları hazinenden toplam ${fmt(paid)} altın aldı.`, tone: 'down' })
      if (got >= 1) sums.push({ icon: 'gold', text: `Kendi tacının devriyesi bahşiş ve armağan olarak ${fmt(got)} altın bıraktı.`, tone: 'up' })
      if (out >= 1) sums.push({ icon: 'gold', text: `Başka lordlara ${fmt(out)} altın haraç ödedin.`, tone: 'down' })
      if (into >= 1) sums.push({ icon: 'gold', text: `Başka lordlardan ${fmt(into)} altın haraç aldın.`, tone: 'up' })
      tribute.unshift(...sums)
    }
    if (tribute.length > 0) out.push({ title: 'Haraçlar', picture: 'tribute', lines: tribute })

    // The lord's house: births, deaths and who followed, children come of age.
    const house: Line[] = []
    const d = kingdom.dynasty
    if (d) {
      for (const c of d.children) if (c.bornAt > since) house.push({ icon: 'happy', text: `${c.sex === 'm' ? 'Bir oğlun' : 'Bir kızın'} oldu: ${c.name}.`, tone: 'up' })
      for (const p of d.dead) if ((p.diedAt ?? 0) > since) house.push({ icon: 'unhappy', text: `Hükümdar ${p.name} ${p.cause === 'grief' ? 'kaybedilen savaşın kahrından' : 'yaşlılıktan'} öldü.`, tone: 'down' })
      for (const c of d.children) if (c.grown && c.bornAt + balance.dynasty.comingOfAge * yearMs() > since) house.push({ icon: 'crown', text: `${c.name} reşit oldu.` })
      if (house.length > 0) house.push({ icon: 'crown', text: d.council || !d.king ? 'Lordluğu şimdi naipler konseyi yönetiyor.' : `Şimdi hükümdar ${d.king.name}.` })
    }
    if (house.length > 0) out.push({ title: 'Hanedan', picture: 'house', lines: house })

    // Envoys and spies.
    const intrigue: Line[] = data.notices
      .filter((n) => !MILITARY.has(n.kind) && !TRIBUTE.has(n.kind))
      .map((n) => {
        const { icon, title, text } = describe(n, online)
        return { icon, text: text ? `${title}: ${text}` : title }
      })
    if (intrigue.length > 0) out.push({ title: 'Elçiler ve casuslar', picture: 'intrigue', lines: intrigue })

    // The lobby: wars begun and ended, battles fought, towns changing hands.
    const world: Line[] = []
    for (const p of data.wars) {
      if (Date.parse(p.started_at) > since) world.push({ icon: 'swords', text: `${name(p.from_id)}, ${name(p.to_id)} lordluğuna savaş açtı.`, tone: 'down' })
      if (p.ended_at && Date.parse(p.ended_at) > since) world.push({ icon: 'banner', text: `${name(p.from_id)} ile ${name(p.to_id)} arasındaki savaş bitti.`, tone: 'up' })
    }
    for (const b of data.battles) {
      if (mine.includes(b) || !b.report) continue
      const side = (fighters: Battle['attackers']) => [...new Set(fighters.map((f) => name(f.kingdom)))].join(', ')
      const winner = b.plan.winner === 'attackers' ? side(b.attackers) : side(b.defenders)
      world.push({
        icon: 'swords',
        text: b.kind === 'siege' && b.besieged !== null ? `${side(b.attackers)}, ${name(b.besieged)} sarayını kuşattı; ${winner} kazandı.` : `${side(b.attackers)} ile ${side(b.defenders)} meydanda çarpıştı; ${winner} kazandı.`,
      })
    }
    for (const t of data.towns) world.push({ icon: 'crown', text: `${name(t.owner_id)}, ${t.name} kasabasını fethetti.`, tone: t.owner_id === me ? 'up' : undefined })
    if (world.length === 0) world.push({ icon: 'banner', text: 'Lobide sakin bir dönem geçti: yeni savaş açılmadı, kasaba el değiştirmedi.' })
    out.push({ title: 'Dünyada olanlar', picture: 'world', lines: world })
    return out
  }, [data, before, kingdom, online, now, since, me])

  const foe = useMemo(() => {
    const war = data?.wars.find((p) => p.from_id === me || p.to_id === me)
    const other = war ? (war.from_id === me ? war.to_id : war.from_id) : online.kingdoms.find((k) => k.id !== me)?.id
    return online.kingdoms.find((k) => k.id === other)?.color ?? undefined
  }, [data, me, online.kingdoms])
  const items = useMemo(() => (pages[page] ? picture(pages[page].picture, kingdom.color, foe) : []), [pages, page, kingdom.color, foe])

  const close = () => onClose((data?.notices ?? []).map((n) => n.id))
  const current = pages[page]
  return (
    <div className="modal" role="dialog" aria-labelledby="away-title">
      <section className="dialog frame away">
        <header className="sheet-head">
          <Icon name="scroll" size={32} />
          <div>
            <h2 id="away-title">Sen yokken</h2>
            <small>{current ? `${current.title} · ${page + 1} / ${pages.length}` : 'Elçiler raporlarını topluyor…'}</small>
          </div>
          <button className="btn icon-only" onClick={close} aria-label="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        {current && (
          <>
            <Scene items={items} mood={current.picture} />
            <h3 className="away-title">{current.title}</h3>
            <ul className="away-lines">
              {current.lines.map((line, i) => (
                <li key={i} className={line.tone}>
                  <Icon name={line.icon} size={16} />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
            <div className="away-nav">
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Geri
              </button>
              <span className="away-dots" aria-hidden>
                {pages.map((_, i) => (
                  <i key={i} className={i === page ? 'on' : undefined} />
                ))}
              </span>
              {page < pages.length - 1 ? (
                <button className="btn primary" onClick={() => setPage(page + 1)}>
                  İleri
                </button>
              ) : (
                <button className="btn primary" onClick={close}>
                  Saraya dön
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
