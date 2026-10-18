import { hash } from '@game/shared'
import { dith, lum, plot } from './buildingKit'
import { ramp } from './sprites'
import type { Sprite } from './sprites'

// The bandits' cave mouths (CLAUDE.md §7.9.1), built like the buildings (buildingKit.ts): a model lit from the upper
// left and depth-tested pixel by pixel. It is meant to look like a piece of the mountain, not a thing set on it: a
// low outcrop of the slope's own rock, coloured and shaded the way the map paints bare rock (the same ramp, the same
// tone for flat ground, slopes lighter toward the light and darker away from it, dark strata along its height
// contours, no outline). Its end breaks off in a rough face; low in it a hollow goes in under an overhang, black
// toward the back. A few boulders lie on the ledge above and at the foot, the ground before it is trodden darker and
// strewn with gravel. Every cave looks alike: nothing tells a clan's den from an empty hole.
//
// The sprite covers two tiles a side: the mouth's land tile at the front, the mountain tile behind it. Its anchor is
// the mouth tile's front corner. A cave opens toward the lower right (along +u) or the lower left (along +v); the
// model is made in its own frame, `a` running out of the mouth and `b` across it, and turned onto the footprint.

// The map's bare rock (chunkPainter.ts → ROCK) and how it shades it: flat ground at 3.4, light adds 5.5 a step.
const ROCK = ramp(0x2e2c3d, 0x423f50, 0x595563, 0x726d78, 0x8c878c, 0xa6a19f, 0xbfbab1, 0xd8d3c5)
const FLAT = 3.4
const DARK = ramp(0x08070b, 0x110f15, 0x1b181f, 0x26222a, 0x332e36)
const TOP_LIGHT = lum(0, 0, 1)

const CLIFF = 42
const SIDE_LO = 20
const SIDE_HI = 63

function cave(seed: number, along: 'u' | 'v'): { sprite: Sprite; body: Sprite } {
  const { canvas, cx, base, m } = plot(2, 64)
  const r = (k: number) => hash(k, 17, seed)
  const at = (a: number, b: number): [number, number] => (along === 'u' ? [a, b] : [b, a])
  const norm = (na: number, nb: number, nz: number) => (along === 'u' ? lum(na, nb, nz) : lum(nb, na, nz))
  const put = (a: number, b: number, z: number, c: number, bias = 0) => {
    const [u, v] = at(a, b)
    m.put(u, v, z, c, bias)
  }
  const screen = (a: number, b: number, z: number) => {
    const [u, v] = at(a, b)
    return [m.sx(u, v), m.sy(u, v, z)] as const
  }
  // A rock pixel shaded as the map shades rock: `l` is how lit its surface is, `z` its height (for the strata).
  // Weathered rock stands a little paler than the ground's grit, so the outcrop reads as a body of stone.
  const rock = (l: number, z: number, k1: number, k2: number, x: number, y: number, extra = 0) => {
    const light = (l - TOP_LIGHT) * 0.9
    const grain = hash(Math.round(x), Math.round(y), seed + 3)
    const strata = Math.abs(light) > 0.05 && Math.sin(z * 0.8 + (hash(Math.floor(k1 / 5), Math.floor(k2 / 5), seed + 5) - 0.5) * 3) > 0.72 ? -1 : 0
    const tone = Math.max(1.2, FLAT + 0.9 + Math.max(-0.42, light) * 5.5 + strata + (grain > 0.92 ? -0.8 : grain < 0.07 ? 0.8 : 0) + extra)
    return dith(ROCK, tone, x, y)
  }

  const mid = 43 + (r(1) - 0.5) * 4
  const half = 9.5 + r(2) * 1.5
  const tall = 15 + r(3) * 2.5
  const lumps = Array.from({ length: 5 }, (_, i) => ({ a: 4 + r(10 + i) * 34, b: SIDE_LO + 6 + r(20 + i) * 32, h: 3 + r(30 + i) * 6, w: 9 + r(40 + i) * 8 }))
  const wave = (a: number, k: number) => Math.sin(a * 0.19 + k + seed) * 0.6 + Math.sin(a * 0.47 + k * 3 + seed * 0.7) * 0.4
  const across = (a: number, b: number) => {
    const lo = SIDE_LO + 3 + wave(a, 1) * 3
    const hi = SIDE_HI - 4 + wave(a, 2) * 3.5
    const t = (b - lo) / (hi - lo)
    return t <= 0 || t >= 1 ? 0 : Math.pow(Math.sin(t * Math.PI), 0.7)
  }
  // The outcrop: low at its end, rising into the slope behind, its top stepped into ledges like the terraces of the
  // hillside around it.
  const ridge = (a: number, b: number) => {
    if (a < 0 || a > CLIFF || b < SIDE_LO || b > SIDE_HI) return null
    let z = 22 + (CLIFF - a) * 0.38
    for (const l of lumps) z += l.h * Math.max(0, 1 - Math.hypot(a - l.a, b - l.b) / l.w)
    // Ledges: each step of 7 half flattened.
    const step = 7
    z = z - (z % step) * 0.45
    z += (hash(Math.floor(a / 3), Math.floor(b / 3), seed + 9) - 0.5) * 1.4
    const h = Math.min(40, z) * across(a, b)
    return h < 0.6 ? null : h
  }
  const mouthTop = (b: number) => {
    const f = (b - mid) / half
    if (Math.abs(f) > 1) return -1
    return tall * Math.pow(1 - f * f, 0.55) + (hash(Math.round(b), 3, seed) - 0.5) * 1.4
  }
  const inMouth = (b: number, z: number) => z >= 0 && z <= mouthTop(b)

  // The outcrop's top and slopes.
  const [u0, v0, u1, v1] = along === 'u' ? [0, SIDE_LO, CLIFF, SIDE_HI] : [SIDE_LO, 0, SIDE_HI, CLIFF]
  m.surface(u0, v0, u1, v1, (u, v) => {
    const [a, b] = along === 'u' ? [u, v] : [v, u]
    return ridge(a, b)
  }, (u, v, z, x, y) => {
    const [a, b] = along === 'u' ? [u, v] : [v, u]
    const ga = ((ridge(a + 1, b) ?? z) - (ridge(a - 1, b) ?? z)) / 2
    const gb = ((ridge(a, b + 1) ?? 0) - (ridge(a, b - 1) ?? 0)) / 2
    // Each ledge's lip catches the light, the riser under it falls into shade; where it meets the ground, a soft
    // contact shade.
    const steep = Math.hypot(ga, gb)
    const lip = steep < 0.6 && ((ridge(a + 1.5, b) ?? 0) < z - 1.5 || (ridge(a, b + 1.5) ?? 0) < z - 1.5) ? 0.9 : 0
    const riser = steep > 1.4 ? -0.5 : 0
    return rock(norm(-ga, -gb, 1), z, a, b, x, y, lip + riser + (z < 2 ? -0.8 : 0))
  })

  // The face at the outcrop's end, rough and a little leaning back, the hollow low in it.
  const faceLit = along === 'u' ? lum(1, 0, 0.25) : lum(0, 1, 0.25)
  for (let b = SIDE_LO; b <= SIDE_HI; b += 0.5) {
    const top = ridge(CLIFF, b)
    if (top === null) continue
    const jut = (hash(Math.floor(b / 5), 1, seed + 31) - 0.5) * 2
    const mt = mouthTop(b)
    for (let z = 0; z <= top + 0.01; z += 0.5) {
      const a = CLIFF + jut * Math.min(1, z / 6) - z * 0.08
      const [x, y] = screen(a, b, z)
      if (inMouth(b, z)) continue
      // The overhang above the hollow throws it into shade; the face darkens toward its foot.
      const over = mt >= 0 && z > mt && z < mt + 3 ? -1.1 : 0
      put(a, b, z, rock(faceLit, z, b, z, x, y, over + (z < 2 ? -0.7 : 0)))
    }
  }
  // The hollow: its walls and roof go back into the dark, its floor too; nothing of it is lit.
  for (let b = mid - half; b <= mid + half; b += 0.5) {
    const mt = mouthTop(b)
    if (mt < 0) continue
    for (let d = 0; d <= 9; d += 0.5) {
      const a = CLIFF - d
      // The roof and the side walls narrow as it goes in.
      const shrink = 1 - d / 22
      if (Math.abs(b - mid) > half * shrink) continue
      const roof = mt * shrink
      for (let z = 0; z <= roof; z += 0.5) {
        const [x, y] = screen(a, b, z)
        const edge = Math.min(1, (roof - z) / 3, (half * shrink - Math.abs(b - mid)) / 2.5)
        const t = 2.6 - d * 0.28 - edge * 1.1 + (hash(Math.round(x), Math.round(y), seed + 41) - 0.5) * 0.5
        put(a, b, z, dith(DARK, t, x, y), -d)
      }
    }
  }

  // Boulders broken off the face: on the ledge above the hollow and fallen at its foot.
  const boulder = (a: number, b: number, z: number, radius: number, squash = 0.75) => {
    const [u, v] = at(a, b)
    m.ball(u, v, z + radius * squash * 0.5, radius, (l, x, y) => {
      const grain = hash(Math.round(x), Math.round(y), seed + 63)
      return dith(ROCK, Math.max(1.2, FLAT + 0.9 + (l - 0.4) * 4.2 + (grain > 0.9 ? -0.7 : 0)), x, y)
    }, squash, true)
  }
  const ledge = (a: number, b: number) => ridge(a, b) ?? 0
  boulder(CLIFF - 5, mid - 3, ledge(CLIFF - 5, mid - 3) - 3, 5 + r(70) * 1.5)
  boulder(CLIFF - 8, mid + 6, ledge(CLIFF - 8, mid + 6) - 3, 4 + r(71) * 1.5)
  boulder(CLIFF + 3, mid - half - 3.5, 0, 3.6 + r(72))
  boulder(CLIFF + 2, mid + half + 3.5, 0, 2.8 + r(73))
  boulder(CLIFF + 7, mid + half + 1, 0, 1.8)
  boulder(CLIFF + 9, mid - half + 1, 0, 1.4)

  // The rock alone, without the earth and gravel spilling before it: what the pointer outlines (a ring round loose
  // gravel would be a dotted mess).
  const body = canvas.sprite(cx, base, 1)
  const bodyPixels = body.pixels.slice()

  // Before the hollow: the ground trodden a shade darker, fading out, gravel and a few stones on it.
  for (let a = CLIFF; a <= 64; a += 0.5) {
    for (let b = mid - 20; b <= mid + 20; b += 0.5) {
      const da = (a - CLIFF) / 16
      const db = (b - mid) / (half + 3 + da * 6)
      const d = da * da + db * db
      const [x, y] = screen(a, b, 0)
      const g = hash(Math.round(x), Math.round(y), seed + 81)
      if (d > 1 || g < d * 0.9) continue
      const pebble = hash(Math.round(x), Math.round(y), seed + 85)
      if (pebble > 0.96) put(a, b, 0.4, dith(ROCK, 5 + (pebble > 0.985 ? 1 : 0), x, y), -1)
      else if (pebble < 0.05) put(a, b, 0.2, dith(ROCK, 1.6, x, y), -1)
      else put(a, b, 0, dith(ROCK, FLAT - 0.9 + d * 0.6 + (g - 0.5) * 0.6, x, y), -1)
    }
  }
  return { sprite: canvas.sprite(cx, base, 1), body: { ...body, pixels: bodyPixels, shadow: 0 } }
}

// Mouths opening toward the lower right (along +u) and toward the lower left (along +v), a few of each.
const variants = (along: 'u' | 'v') => Array.from({ length: 3 }, (_, i) => cave(i * 7919 + 101 + (along === 'u' ? 0 : 13), along))
let made: { u: { sprite: Sprite; body: Sprite }[]; v: { sprite: Sprite; body: Sprite }[] } | undefined
export const caveSprites = () => (made ??= { u: variants('u'), v: variants('v') })

// The look of a cave on the map, and where it stands: the tile point its anchor sits on (the mouth tile's front corner).
// The chunk painter draws it there and the map's pointer outlines the same sprite (createWorld.ts).
export function caveLook(seed: number, cave: { x: number; y: number; dx: number; dy: number }) {
  const looks = cave.dx > 0 ? caveSprites().u : caveSprites().v
  const look = looks[Math.floor(hash(cave.x, cave.y, seed + 45) * looks.length)]
  return { sprite: look.sprite, body: look.body, at: { x: cave.x + cave.dx + 1, y: cave.y + cave.dy + 1 } }
}
