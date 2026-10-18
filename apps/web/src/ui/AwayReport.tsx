import { PROJECT_IDS, balance, booksOf, crisisDecideMs, crisisKey, fortunesBegun, goalRank, idleFactor, isCrisis, isDilemma, palaceLevel, population, projectBuilding, projectStage, projectStages, soldiersOf, yearMs } from '@game/shared'
import type { Kingdom, Pact, Resource, SeenSnapshot, SoldierLoss } from '@game/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { playOnce } from '../audio/sfx'
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
import { FORTUNE_TEXTS, RESOURCE_NAMES } from './names'
import { EXPEDITION_TEXTS, FIND_TEXTS, GOAL_TEXTS } from './expeditionNames'
import { haulText } from './hud/expeditions'
import { PROJECT_TEXTS } from './hud/projects'
import { StoryScene, expeditionStory, villageStory } from './storyScenes'
import type { Story } from './storyScenes'
import type { Online } from './hud/online'
import { kingdomName } from './hud/online'
import { fmt } from './hud/primitives'
import { crownKeyOf, crownTimeline } from './hud/crownHouse'

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
// The meadow is a true isometric ground, seen as the map sees it at ½× (CLAUDE.md §4.2.1): a tile is 32 × 16 pixels
// and the map's sprites are drawn at half their size, so a 3 × 3 palace, its 2 × 2 market and a field sit side by side
// on it without running into each other. Tile (0, 0) lies at the meadow's far edge in the middle of the picture; x
// runs to the lower right, y to the lower left; the front row (x + y = 7) is the picture's bottom.
const ISO_X = W / 2
const ISO_Y = 72
const HALF_W = 16
const HALF_H = 8

// A sprite placed on the picture's ground: `x`, `y` are the tile point its anchor stands on (a building's front
// corner, i.e. its footprint's origin plus its size; a walker's or a tree's feet).
export interface Placed {
  sprite: Sprite
  x: number
  y: number
}

const toScreen = (x: number, y: number) => ({ x: ISO_X + (x - y) * HALF_W, y: ISO_Y + (x + y) * HALF_H })
const toTile = (sx: number, sy: number) => {
  const u = (sx - ISO_X) / HALF_W
  const v = (sy - ISO_Y) / HALF_H
  return { x: (u + v) / 2, y: (v - u) / 2 }
}

// A sprite at half size, as the map draws it at ½×: each 2 × 2 block keeps its commonest solid colour (the darker on a
// tie, so outlines hold), or its shade when it is mostly shade.
const halves = new WeakMap<Sprite, Sprite>()
function halfOf(sprite: Sprite): Sprite {
  const kept = halves.get(sprite)
  if (kept) return kept
  const w = Math.ceil(sprite.width / 2)
  const h = Math.ceil(sprite.height / 2)
  const pixels = new Uint32Array(w * h)
  const luma = (c: number) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const solid: number[] = []
      const shade: number[] = []
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx
          const sy = y * 2 + dy
          if (sx >= sprite.width || sy >= sprite.height) continue
          const c = sprite.pixels[sy * sprite.width + sx]
          const a = c >>> 24
          if (a >= 128) solid.push(c)
          else if (a > 0) shade.push(c)
        }
      let c = 0
      if (solid.length >= 2) {
        let best = solid[0]
        let most = 0
        for (const s of solid) {
          const n = solid.filter((t) => t === s).length
          if (n > most || (n === most && luma(s) < luma(best))) {
            best = s
            most = n
          }
        }
        c = best
      } else if (shade.length + solid.length >= 2) c = shade[0] ?? solid[0]
      pixels[y * w + x] = c
    }
  }
  const half: Sprite = { ...sprite, width: w, height: h, anchorX: Math.round(sprite.anchorX / 2), anchorY: Math.round(sprite.anchorY / 2), pixels }
  halves.set(sprite, half)
  return half
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

function backdrop(mood: Mood, items: Placed[], road?: number, scale: 0.5 | 1 = 0.5): Backdrop {
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
  // flowers, and stands of trees along its far edge. The ground is isometric like the map's, not a landscape seen
  // from the side: the path runs along a tile axis (to the upper right) and keeps its width all the way, tufts and
  // flowers are the same size near and far.
  const column = road ?? 0.5 + Math.floor(rand() * 3)
  const pathOff = (sx: number, sy: number) => {
    const t = toTile(sx, sy)
    return Math.abs(t.x - column - Math.sin(t.y * 0.7 + seed) * 0.22) * 2 * HALF_W
  }
  for (let x = 0; x < W; x++) {
    const top = horizon(x)
    for (let y = top; y < H; y++) {
      const d = bayer(x, y)
      const v = noise2(x * 0.06, y * 0.16, seed + 500) * 1.4 + noise2(x * 0.3, y * 0.5, seed + 501) * 0.6 - 0.2
      let c = look.grass[Math.max(0, Math.min(2, Math.floor(v + d - 0.5)))]
      const fade = (y - top) / 7
      if (fade < 1 && d > fade) c = lerp(c, look.haze, 0.25)
      const off = pathOff(x, y)
      if (y > top + 1 && off < 5 + (d - 0.5) * 1.5) c = off < 2.2 ? look.path[1] : look.path[0]
      near[y * W + x] = pix(c)
    }
  }
  for (let k = 0; k < 170; k++) {
    const x = Math.floor(rand() * W)
    const y = horizon(x) + 4 + Math.floor(Math.pow(rand(), 0.7) * (H - horizon(x) - 4))
    if (pathOff(x, y) < 6) continue
    put(near, x, y, look.grass[0])
    put(near, x - 1, y - 1, look.grass[2])
    put(near, x + 1, y - 1, look.grass[2])
  }
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(rand() * W)
    const y = horizon(x) + 6 + Math.floor(rand() * (H - horizon(x) - 6))
    if (pathOff(x, y) < 6) continue
    const c = look.flowers[Math.floor(rand() * look.flowers.length)]
    put(near, x, y, c)
    put(near, x, y + 1, look.grass[0])
  }
  const treeDark = lerp(look.tree[0], look.haze, 0.1)
  const treeLit = lerp(look.tree[1], look.haze, 0.1)
  for (let s = 0; s < 5; s++) {
    const x0 = Math.floor(rand() * W)
    const len = 14 + Math.floor(rand() * 40)
    for (let x = x0; x < x0 + len; x += 2 + Math.floor(rand() * 2)) {
      if (pathOff(x, horizon(x) + 1) < 8) continue
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

  // The sprites (at half size unless the picture has no buildings), back to front by their front corner as on the
  // map; their translucent shade pixels darken what is under them.
  for (const placed of [...items].sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x)) {
    const sprite = scale === 1 ? placed.sprite : halfOf(placed.sprite)
    const at = toScreen(placed.x, placed.y)
    const ox = Math.round(at.x - sprite.anchorX)
    const oy = Math.round(at.y - sprite.anchorY)
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
// `scale` 1 draws the sprites at full size: only for pictures without buildings (a party, beasts, trees), where no
// footprint has to fit the tile grid and half-size figures would be specks.
export function Scene({ items, mood = 'day', road, scale = 0.5 }: { items: Placed[]; mood?: Mood; road?: number; scale?: 0.5 | 1 }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const b = backdrop(mood, items, road, scale)
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
  }, [items, mood, road, scale])
  return <canvas ref={canvas} className="away-scene" width={W} height={H} aria-hidden />
}

// A heap of gold coins (and a chest), drawn pixel by pixel.
export function coins(n: number): Sprite {
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

// The report's pictures, each laid on the meadow's tile grid (x, y: a building's front corner; see `Placed`).
export function picture(kind: Picture, own: string | undefined, foe: string | undefined): Placed[] {
  const color = (c: string | undefined) => (c ?? 'emerald') as KingdomColor
  const S = STRUCTURE_SPRITES
  switch (kind) {
    case 'treasury':
      return [
        { sprite: S.treasury[0], x: -1, y: 5 },
        { sprite: coins(26), x: 1, y: 5 },
        { sprite: S.market[1], x: 3, y: 4 },
        { sprite: S.warehouse[0], x: 6, y: 1 },
      ]
    case 'battle':
      return [
        { sprite: palaceIn(own, 2), x: 0, y: 4 },
        { sprite: squad(own ?? null, 2, 8), x: 1.2, y: 3.6 },
        { sprite: squad(own ?? null, 0, 12), x: 1.2, y: 5.4 },
        { sprite: squad(foe ?? 'coal', 3, 8), x: 3.6, y: 1.6 },
        { sprite: squad(foe ?? 'coal', 1, 12), x: 4, y: 2.6 },
        { sprite: tent(color(foe ?? 'coal'), 0), x: 6.4, y: 0 },
      ]
    case 'tribute':
      return [
        { sprite: palaceIn(own, 2), x: 0, y: 4 },
        { sprite: coins(14), x: 1, y: 5.2 },
        { sprite: squad('crimson', 0, 6), x: 2.4, y: 4 },
        { sprite: squad('crimson', 2, 6), x: 3.4, y: 2.8 },
        { sprite: squad('royal', 1, 6), x: 4.6, y: 1.6 },
      ]
    case 'intrigue':
      return [
        { sprite: S.house[2], x: 2, y: 1 },
        { sprite: S.spyHouse[0], x: 0, y: 5 },
        { sprite: S.prison[0], x: 6, y: 1 },
      ]
    case 'house':
      return [
        { sprite: S.house[3], x: -2, y: 5 },
        { sprite: palaceIn(own, 3), x: 4, y: 3 },
        { sprite: S.temple[0], x: 6, y: 0 },
      ]
    case 'world':
      return [
        { sprite: S.house[1], x: -1.5, y: 2.5 },
        { sprite: S.house[0], x: -3, y: 4 },
        { sprite: S.market[0], x: 0, y: 5 },
        { sprite: tent(color(foe ?? 'violet'), 0), x: 4, y: 1 },
        { sprite: tent(color(foe ?? 'violet'), 1), x: 6, y: -0.5 },
        { sprite: tent(color(own), 1), x: 4.8, y: 2 },
        { sprite: squad(own ?? null, 1, 8), x: 2.4, y: 4.2 },
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
  // A picture of its own instead of the report's (the village's story, the expeditions; storyScenes.tsx).
  story?: { story: Story; id: string }
}

const MILITARY = new Set(['king_fell', 'siege_people', 'naval_battle', 'blockade_lifted', 'fleet_turned', 'battle_start', 'battle_end', 'town_siege', 'town_taken', 'town_held', 'town_siege_lifted', 'town_revolt', 'town_lost_revolt', 'tower_losses', 'army_threat', 'trade_raided', 'raid_repelled', 'war_declared', 'peace_enforced', 'order_failed', 'cargo_lost', 'cargo_home', 'cave_trail', 'cave_found', 'cave_empty', 'cave_probe', 'clan_destroyed'])
const TRIBUTE = new Set(['patrol_tribute', 'patrol_taken', 'patrol_tip', 'patrol_visit', 'patrol_ignored', 'tribute_ended', 'crown_gift'])

const duration = (ms: number) => {
  const minutes = Math.round(ms / 60_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} saat${m ? ` ${m} dakika` : ''}` : `${m} dakika`
}
// What took the soldiers, as the report names it.
const LOSSES: Record<SoldierLoss, string> = { battle: 'meydan muharebesi', siege: 'saray kuşatması', town: 'kasaba kuşatması', towers: 'gözcü kuleleri', raid: 'ticaret yağması', crisis: 'afette seferberlik', disband: 'terhis', expedition: 'sefer muhafızlığı' }

// Notices with the same headline told once: the latest in full, with how many times it came.
function grouped(notices: Notice[], online: Online, tone: (n: Notice) => Line['tone']): Line[] {
  const by = new Map<string, { n: Notice; count: number }>()
  for (const n of notices) {
    const key = `${n.kind}|${describe(n, online).title}`
    const was = by.get(key)
    by.set(key, { n, count: (was?.count ?? 0) + 1 })
  }
  return [...by.values()].map(({ n, count }) => {
    const { icon, title, text } = describe(n, online)
    const head = count > 1 ? `${title} (${count} kez; sonuncusu)` : title
    return { icon, text: text ? `${head}: ${text}` : head, tone: tone(n) }
  })
}

// The most lines a page shows, so that none needs scrolling.
const PAGE_LINES = 7

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
  // Pages turned: the report of what happened while away.
  useEffect(() => playOnce(`away:${lobby}:${since}`, 'report'), [lobby, since])
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
    // What befell the village, told as a story in a few short lines (no scrolling): the day's events, the disasters
    // and what they took, the parties back, the goals reached and the great works (CLAUDE.md §9.8–9.10).
    const village: Line[] = []
    const hours = away / 3_600_000
    village.push({ icon: 'time', text: hours >= 1 ? `${duration(away)} boyunca köyde hayat kendi hâlinde sürdü. Kâhyanın defterinden:` : `${duration(away)} yoktun; kâhyanın defterinden:` })
    const fortunes = fortunesBegun(kingdom, since, now)
    const answer = (f: (typeof fortunes)[number]) => kingdom.responses?.[crisisKey(f)]?.choice
    if (fortunes.length > 0) {
      const bad = fortunes.filter((f) => FORTUNE_TEXTS[f.kind]?.tone === 'bad').length
      const good = fortunes.filter((f) => FORTUNE_TEXTS[f.kind]?.tone === 'good').length
      const names = [...new Set(fortunes.map((f) => FORTUNE_TEXTS[f.kind]?.title ?? 'bir olay'))]
      const choices = fortunes.filter((f) => isDilemma(f.kind))
      const chosen = choices.filter((f) => answer(f)).length
      village.push({
        icon: 'scroll',
        text: `${fortunes.length} olay (${bad} kötü, ${good} hayırlı): ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.${choices.length > 0 ? ` Seçimlerin ${chosen}/${choices.length}'inde yol seçildi.` : ''}`,
        tone: bad > good ? 'down' : good > bad ? 'up' : undefined,
      })
    }
    // The disasters in one line: how many, who met them, and what they took in all (from the season's accounts).
    const decided = fortunes.filter((f) => isCrisis(f.kind) && f.start + crisisDecideMs() <= now)
    const strikes = was ? since0((b) => b.disasters ?? 0) : decided.length
    if (strikes > 0 || decided.length > 0) {
      const steward = was ? since0((b) => b.stewarded ?? 0) : 0
      const met = decided.filter((f) => answer(f) === 'villagers' || answer(f) === 'army').length
      const byYou = Math.max(0, met - steward)
      const hit = Math.max(0, decided.length - met)
      const spoiled = Math.max(0, strikes - decided.length)
      const lost = (['food', 'materials', 'arms', 'gold'] as Resource[])
        .map((r) => [r, Math.round((books.disasterLost?.[r] ?? 0) - (was?.disasterLost?.[r] ?? 0))] as const)
        .filter(([, v]) => v > 0)
        .map(([r, v]) => `${fmt(v)} ${r === 'gold' ? 'altın' : RESOURCE_NAMES[r].toLowerCase()}`)
      const who = [...(steward ? [`${steward}'ini kâhya`] : []), ...(byYou ? [`${byYou}'ini sen`] : []), ...(hit ? [`${hit}'i karşılanmadı`] : [])]
      village.push({
        icon: 'warn',
        text: `${decided.length} afet${who.length ? ` (${who.join(', ')})` : ''}${spoiled ? `, ${spoiled} kez fare/çürük/pas` : ''}.${lost.length ? ` Giden: ${lost.join(', ')}.` : ' Kayıp olmadı.'}`,
        tone: lost.length ? 'down' : 'up',
      })
    }
    if (fortunes.length === 0 && strikes === 0) village.push({ icon: 'happy', text: 'Ne afet geldi ne bayram; köy sakin bir dönem geçirdi.' })
    const back = (kingdom.expeditions ?? []).filter((e) => e.result && !e.result.recalled && e.result.at > since)
    if (back.length > 0) {
      const gains: Partial<Record<Resource, number>> = {}
      for (const e of back) for (const [r, v] of Object.entries(e.result!.gains)) gains[r as Resource] = (gains[r as Resource] ?? 0) + (v ?? 0)
      const got = haulText(gains)
      village.push({ icon: 'pin', text: `${back.length} sefer döndü${got ? `: ${got}` : ', eli boş'}.`, tone: got ? 'up' : undefined })
    }
    const goals = Object.entries(kingdom.goals ?? {}).filter(([, g]) => (g?.at ?? 0) > since)
    if (goals.length > 0) village.push({ icon: 'star', text: `${goals.length} hedef tamamlandı (${goals.slice(0, 2).map(([track]) => GOAL_TEXTS[track]?.name ?? track).join(', ')}${goals.length > 2 ? '…' : ''}); unvanın: ${goalRank(kingdom).title}.`, tone: 'up' })
    // The great works in one line (CLAUDE.md §9.10).
    const works = PROJECT_IDS.filter((id) => projectStage(kingdom, id, now) > 0 || kingdom.projects?.[id])
    if (works.length > 0) {
      village.push({
        icon: 'build',
        text: `Büyük işler: ${works.map((id) => `${PROJECT_TEXTS[id].name} ${projectStage(kingdom, id, now)}/${projectStages()}${projectBuilding(kingdom, id, now) ? ' (yapılıyor)' : ''}`).join(' · ')}.`,
      })
    } else if (palaceLevel(kingdom, now) >= balance.projects.works.minPalace) village.push({ icon: 'build', text: 'Dolu ambarlar için Saray → Projeler\'de büyük işler bekliyor.' })
    out.push({ title: 'Sen yokken köyde neler oldu', picture: 'house', lines: village, story: { story: villageStory(kingdom.color), id: `village:${kingdom.color}` } })

    // The treasury and the stores in a few lines: the stores then and now, what came in, what went out, what was lost.
    const money: Line[] = []
    if (before && was) {
      const stores = (['gold', 'food', 'materials', 'arms'] as Resource[])
        .map((r) => [r, kingdom.stock[r] - before.stock[r]] as const)
        .filter(([, d]) => Math.abs(d) >= 1)
        .map(([r, d]) => `${RESOURCE_NAMES[r]} ${fmt(kingdom.stock[r])} (${delta(d)})`)
      money.push({ icon: 'chest', text: stores.length ? `Depo: ${stores.join(' · ')}` : 'Depo neredeyse aynı kaldı.' })
      const tax = since0((b) => b.tax)
      const wages = since0((b) => b.wages)
      const trade = since0((b) => b.trade)
      const other = since0((b) => b.other)
      const expedition = since0((b) => b.expedition ?? 0)
      const tributeIn = since0((b) => b.tributeIn)
      const tributeOut = since0((b) => b.tributeOut)
      const crownPaid = since0((b) => b.crownPaid)
      const crownGot = since0((b) => b.crownGot)
      const wasted = since0((b) => b.wastedGold)
      const robbed = since0((b) => b.outlaws ?? 0)
      const outlawLoot = since0((b) => b.outlawLoot ?? 0)
      const upkeep = since0((b) => b.townUpkeep ?? 0)
      // What the accounts do not cover: buildings, training, envoys and purchases (or loot and gifts coming in).
      const rest = kingdom.stock.gold - before.stock.gold - (tax + trade + other + expedition + outlawLoot + tributeIn + crownGot - wages - upkeep - tributeOut - crownPaid - wasted)
      const part = (v: number, what: string) => (v >= 1 ? [`${what} ${fmt(v)}`] : [])
      const income = [...part(tax, 'vergi'), ...part(trade, 'tüccar'), ...part(other, 'kasaba ve olaylar'), ...part(expedition, 'seferler'), ...part(outlawLoot, 'ganimet'), ...part(rest, 'diğer')]
      if (income.length) money.push({ icon: 'gold', text: `Gelen altın: ${income.join(', ')}.`, tone: 'up' })
      const spent = [...part(wages, 'maaşlar'), ...part(upkeep, 'kasaba bakımı'), ...part(robbed, 'yağmacılar'), ...part(-rest, 'inşaat ve alımlar')]
      if (spent.length) money.push({ icon: 'build', text: `Giden altın: ${spent.join(', ')}.`, tone: 'down' })
      // What full stores cost: gold and goods that did not fit, the merchant waiting or idling.
      const wastedGoods = since0((b) => b.wastedGoods)
      const held = since0((b) => b.tradeHeld)
      const slack = since0((b) => b.tradeSlack ?? 0)
      const waste = [...(wasted >= 1 ? [`${fmt(wasted)} altın`] : []), ...(wastedGoods >= 1 ? [`${fmt(wastedGoods)} mal`] : [])]
      const notes = [
        ...(waste.length ? [`dolu hazine ve ambarda ${waste.join(' ve ')} boşa gitti`] : []),
        ...(held > 0 ? [`tüccar ${fmt(held)} sefer bekledi`] : []),
        ...(slack > 0 ? [`${fmt(slack)} seferde yarım yük götürdü`] : []),
      ]
      if (notes.length) money.push({ icon: 'warn', text: `${notes.join('; ')}. Harca ya da sat (Saray → Projeler).`.replace(/^./, (c) => c.toUpperCase()), tone: 'down' })
      const p1 = population(kingdom, now)
      const h0 = Math.round(before.happiness)
      const h1 = Math.round(kingdom.happiness ?? 0)
      if (before.villagers !== p1.villagers || h0 !== h1) money.push({ icon: 'people', text: `Köylüler ${before.villagers} → ${p1.villagers} · mutluluk %${h0} → %${h1}`, tone: p1.villagers >= before.villagers && h1 >= h0 ? 'up' : 'down' })
    } else {
      money.push({ icon: 'gold', text: `Hazinede ${fmt(kingdom.stock.gold)} altın var (gidişindeki hâli kayıtlı değil; bundan sonraki dönüşlerinde ayrıntılı rapor gelecek).` })
    }
    const idle = idleFactor({ ...kingdom, lastSeenAt: since }, now)
    if (idle < 1) money.push({ icon: 'warn', text: `Uzun yokluk: üretim (yemek hariç), vergi ve tüccar %${Math.round(idle * 100)}'e düştü; şimdi yeniden tam.`, tone: 'down' })
    out.push({ title: 'Mali rapor', picture: 'treasury', lines: money })

    // The parties back while away, a line each (the full story is in each party's own report), and those on the road.
    const parties = (kingdom.expeditions ?? []).filter((e) => e.result && !e.result.recalled && e.result.at > since).sort((a, b) => a.result!.at - b.result!.at)
    const roads = (kingdom.expeditions ?? []).filter((e) => !e.result && e.endAt > now)
    if (parties.length > 0 || roads.length > 0) {
      const lines: Line[] = []
      for (const e of parties) {
        const r = e.result!
        const got = haulText(r.gains)
        const losses = [...(r.villagersLost ? [`${r.villagersLost} köylü`] : []), ...(r.soldiersLost ? [`${r.soldiersLost} muhafız`] : [])]
        lines.push({
          icon: EXPEDITION_TEXTS[e.kind]?.icon ?? 'pin',
          text: `${EXPEDITION_TEXTS[e.kind]?.short ?? 'Sefer'}${r.find ? ` (${FIND_TEXTS[r.find]?.name})` : ''}: ${got || 'eli boş'}${losses.length ? `; kayıp ${losses.join(', ')}` : ''}.`,
          tone: losses.length ? 'down' : got ? 'up' : undefined,
        })
      }
      for (const e of roads) lines.push({ icon: 'time', text: `${EXPEDITION_TEXTS[e.kind]?.short ?? 'Sefer'} hâlâ yolda; ${duration(e.endAt - now)} sonra dönecek.` })
      const last = parties[parties.length - 1] ?? roads[0]
      out.push({ title: 'Seferler', picture: 'world', lines, story: { story: expeditionStory(last.kind, last.result?.incidents, kingdom.color, last.result?.find), id: `away:${last.id}` } })
    }

    // The fighting.
    const war: Line[] = grouped(data.notices.filter((n) => MILITARY.has(n.kind)), online, (n) => ((n.kind === 'town_taken' && (n.payload as { by?: string }).by === kingdom.name) || n.kind === 'cave_found' || n.kind === 'cave_trail' ? 'up' : 'down'))
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
      war.push({ icon: 'swords', text: `${b.kind === 'siege' || b.kind === 'usurp' ? 'Kuşatma' : b.kind === 'revolt' || b.kind === 'pretender' ? 'Asilerle çarpışma' : 'Meydan muharebesi'} ${won ? 'kazanıldı' : 'kaybedildi'} (${Object.entries(b.report.losses).map(([who, n]) => `${who} −${fmt(n)}`).join(', ')})`, tone: won ? 'up' : 'down' })
    }
    if (war.length > 0) out.push({ title: 'Askeri rapor', picture: 'battle', lines: war })

    // Tribute: the crowns' patrols and what was paid and received between lords, as totals (a long absence brings
    // dozens of visits; one line each would bury the page).
    const tributeNotes = data.notices.filter((n) => TRIBUTE.has(n.kind))
    const of = (kind: string) => tributeNotes.filter((n) => n.kind === kind)
    const sum = (list: Notice[], key = 'amount') => list.reduce((t, n) => t + (Number((n.payload as Record<string, unknown>)[key]) || 0), 0)
    const tribute: Line[] = []
    const asked = of('patrol_tribute')
    const taken = of('patrol_taken')
    const ignored = of('patrol_ignored')
    const paid = was ? since0((b) => b.crownPaid) : sum(taken)
    const collectors = Math.max(asked.length, taken.length + ignored.length)
    if (collectors > 0 || paid >= 1) {
      const afk = taken.filter((n) => (n.payload as { afk?: boolean }).afk).length
      const how = taken.length > 0 ? ` (${taken.length} kez kendiliğinden${afk > 0 ? `, ${afk}'i fazlasıyla` : ''})` : ''
      tribute.push({ icon: 'banner', text: `Rakip tacın haraççıları ${collectors} kez kapına geldi; toplam ${fmt(paid)} altın haraç ödendi${how}.`, tone: 'down' })
    }
    if (ignored.length > 0) tribute.push({ icon: 'warn', text: `${ignored.length} haraç cevapsız kaldı ya da reddedildi; o tacın lordlarıyla ilişkin her seferinde ${-balance.cities.crown.patrol.refuseRelation} düştü.`, tone: 'down' })
    const tips = of('patrol_tip')
    const visits = of('patrol_visit')
    if (tips.length + visits.length > 0) {
      tribute.push({
        icon: 'crown',
        text: `Kendi tacının devriyesi ${tips.length + visits.length} kez uğradı${tips.length > 0 ? `; ${tips.length} kez eğlence merkezinde içip toplam ${fmt(sum(tips))} altın bahşiş bıraktı` : ''}.`,
        tone: 'up',
      })
    }
    const gifts = of('crown_gift')
    if (gifts.length > 0) {
      const goods: Record<string, number> = {}
      for (const n of gifts) for (const [g, v] of Object.entries(((n.payload as { goods?: Record<string, number> }).goods ?? {}))) goods[g] = (goods[g] ?? 0) + v
      const all = [...(sum(gifts, 'gold') > 0 ? [`${fmt(sum(gifts, 'gold'))} altın`] : []), ...Object.entries(goods).map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as Resource]?.toLowerCase() ?? g}`)]
      tribute.push({ icon: 'chest', text: `Tacın ${gifts.length} kez armağan gönderdi; toplam ${all.join(', ')}.`, tone: 'up' })
    }
    if (was) {
      const got = since0((b) => b.crownGot)
      const out = since0((b) => b.tributeOut)
      const into = since0((b) => b.tributeIn)
      if (got >= 1) tribute.push({ icon: 'gold', text: `Bahşiş ve armağanlarla tacından toplam ${fmt(got)} altın geldi.`, tone: 'up' })
      if (out >= 1) tribute.push({ icon: 'gold', text: `Başka lordlara ${fmt(out)} altın haraç ödedin.`, tone: 'down' })
      if (into >= 1) tribute.push({ icon: 'gold', text: `Başka lordlardan ${fmt(into)} altın haraç aldın.`, tone: 'up' })
    }
    for (const n of of('tribute_ended')) {
      const { icon, title, text } = describe(n, online)
      tribute.push({ icon, text: text ? `${title}: ${text}` : title })
    }
    if (tribute.length > 0) out.push({ title: 'Haraçlar', picture: 'tribute', lines: tribute })

    // The lord's house: births, deaths and who followed, children come of age.
    const house: Line[] = []
    const d = kingdom.dynasty
    if (d) {
      for (const c of d.children) if (c.bornAt > since) house.push({ icon: 'happy', text: `${c.sex === 'm' ? 'Bir oğlun' : 'Bir kızın'} oldu: ${c.name}.`, tone: 'up' })
      for (const p of d.dead) if ((p.diedAt ?? 0) > since) house.push({ icon: 'unhappy', text: `${p.ruled === false ? (p.sex === 'm' ? 'Prens' : 'Prenses') : 'Hükümdar'} ${p.name} ${p.cause === 'battle' ? 'ordusunun başında savaşırken' : p.cause === 'grief' ? 'kaybedilen savaşın kahrından' : p.cause === 'rebel' ? 'isyanı bastırılırken' : p.cause === 'deposed' ? 'tahttan indirilerek' : 'yaşlılıktan'} öldü.`, tone: 'down' })
      for (const c of d.children) if (c.grown && c.bornAt + balance.dynasty.comingOfAge * yearMs() > since) house.push({ icon: 'crown', text: `${c.name} reşit oldu.` })
      if (house.length > 0) house.push({ icon: 'crown', text: d.council || !d.king ? 'Lordluğu şimdi naipler konseyi yönetiyor.' : `Şimdi hükümdar ${d.king.name}.` })
    }
    if (house.length > 0) out.push({ title: 'Hanedan', picture: 'house', lines: house })

    // Envoys and spies.
    const intrigue: Line[] = grouped(data.notices.filter((n) => !MILITARY.has(n.kind) && !TRIBUTE.has(n.kind)), online, () => undefined)
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
        text: b.kind === 'pretender' || b.kind === 'usurp' ? `${side(b.kind === 'usurp' ? b.defenders : b.attackers)} bir taht davacısıyla çarpıştı; ${b.plan.winner === (b.kind === 'pretender' ? 'attackers' : 'defenders') ? 'isyan bastırıldı' : 'davacı kazandı'}.` : b.kind === 'revolt' ? `${side(b.attackers)} bir kasabasındaki asilerle çarpıştı; ${b.plan.winner === 'attackers' ? 'ayaklanmayı bastırdı' : 'asiler direndi'}.` : b.kind === 'siege' && b.besieged !== null ? `${side(b.attackers)}, ${name(b.besieged)} sarayını kuşattı; ${winner} kazandı.` : `${side(b.attackers)} ile ${side(b.defenders)} meydanda çarpıştı; ${winner} kazandı.`,
      })
    }
    for (const t of data.towns) world.push({ icon: 'crown', text: `${name(t.owner_id)}, ${t.name} kasabasını fethetti.`, tone: t.owner_id === me ? 'up' : undefined })
    // The crowns: rulers dead and crowned, wars between them begun and ended (computed from the clock; CLAUDE.md §7.8).
    if (kingdom.lobbyKey !== undefined && online.crowns.length > 0) {
      for (const n of crownTimeline(crownKeyOf(kingdom), online.crowns.length, since, now, me).slice(-12)) {
        const d = describe(n, online)
        world.push({ icon: d.icon, text: d.title, tone: n.kind === 'crown_rivalry' && n.payload.stance === 'war' ? 'down' : undefined })
      }
    }
    if (world.length === 0) world.push({ icon: 'banner', text: 'Lobide sakin bir dönem geçti: yeni savaş açılmadı, kasaba el değiştirmedi.' })
    out.push({ title: 'Dünyada olanlar', picture: 'world', lines: world })
    // Every page fits without scrolling: a long page keeps its first lines and says how many more the journal has.
    return out.map((p) => (p.lines.length <= PAGE_LINES ? p : { ...p, lines: [...p.lines.slice(0, PAGE_LINES - 1), { icon: 'scroll', text: `… ve ${p.lines.length - PAGE_LINES + 1} haber daha (ayrıntısı günlükte).` }] }))
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
            {current.story ? <StoryScene story={current.story.story} id={current.story.id} /> : <Scene items={items} mood={current.picture} />}
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
              <button className="btn" disabled={page === 0} data-why="İlk sayfadasın" onClick={() => setPage(page - 1)}>
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
