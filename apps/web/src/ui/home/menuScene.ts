import { ramp } from '../../game/sprites'
import { C, FIRE, PLASTER, Paint, THATCH, TILE, WOOD, ball, bay, clamp, cluster, conifer, fbm, glow, house, mix, noise, rnd, tone } from '../artKit'

// The main menu's panorama (CLAUDE.md §11): a dusk turning to night over a kingdom, painted once pixel by pixel in the
// hi-bit dress of the map and the reports' pictures (ramps met in ordered dither, light from the upper left, no blur).
// A violet sky with an afterglow on the horizon, stars and a milky band, the moon and its halo; two snowy ranges, a
// pine forest, a lake mirroring all of it, a river down the meadows; a walled castle on a hill with lit windows and
// banners, a village and a windmill below it, a road climbing to the gate between torches; dark hills and great pines
// in front. The painting is the size of the screen in art pixels (it is cropped, never stretched) and is the same for
// one size every time (one seed). What moves (stars, clouds, smoke, torches, banners, sails, birds, fireflies, the
// moon's road on the water) is drawn over a copy of it a dozen times a second (`frame`).

const SEED = 1182

const SKY = ramp(0x070a1a, 0x0b1027, 0x111936, 0x192246, 0x232b58, 0x313468, 0x443c76, 0x5c447f, 0x7a4c84, 0x9c5680, 0xbe6476, 0xdc7c6c, 0xf0a06a)
const ROCK_FAR = ramp(0x1a1a34, 0x262645, 0x343556, 0x46486a, 0x5c5f82, 0x787b9c)
const ROCK_NEAR = ramp(0x10121f, 0x181b2c, 0x22263a, 0x2f344b, 0x40465e, 0x565d76)
const SNOW_N = ramp(0x343c62, 0x4e5884, 0x7480a8, 0x9ea8c8, 0xc6cee2, 0xeaeef8)
const PINE_N = ramp(0x060f12, 0x0a1719, 0x0f2120, 0x152c28, 0x1d3a31, 0x284a3c)
const GRASS_N = ramp(0x080f14, 0x0d1819, 0x13221f, 0x1a2e25, 0x233b2b, 0x2e4a33)
const FG = ramp(0x030508, 0x05090c, 0x080e12, 0x0d1618, 0x14201f, 0x1e2e2a)
const WATER = ramp(0x070b1c, 0x0c1229, 0x121a38, 0x1b2448, 0x283058, 0x3c406c)
const DIRT_N = ramp(0x141010, 0x201a17, 0x2e241e, 0x3e3226, 0x504130, 0x64533c)
const STONE_N = ramp(0x14141f, 0x1f2030, 0x2c2e42, 0x3c3f56, 0x50546c, 0x6a6e86, 0x8a8ea4)
const ROOF_N = ramp(0x1c0c18, 0x2e1220, 0x441a2a, 0x5e2432, 0x7c303a, 0x9a4044)
const MOON = ramp(0x5c5c78, 0x8a8aa2, 0xb4b2c2, 0xd8d4d6, 0xf2eee0, 0xfffcf0)
const CLOUD = ramp(0x10132a, 0x181c38, 0x222646, 0x2e3054, 0x4a3e66, 0x5e4a6e, 0x7a5a76)
const LIT = [C(0xffe9a0), C(0xffd870), C(0xf0b050), C(0xc88a3a)]
const BANNER = [ramp(0x4a0e14, 0x7a1820, 0xb02a2a), ramp(0x14204a, 0x22367a, 0x3a5aa8)]
const NIGHT = C(0x0c1026)

type Box = { x: number; y: number; w: number; h: number }
type Star = { x: number; y: number; c: number; phase: number; speed: number }
type Cloud = { px: Uint32Array; w: number; h: number; x: number; y: number; speed: number }

export interface Scene {
  w: number
  h: number
  base: Uint32Array
  // Where the sky still shows (clouds and shooting stars stay behind the land), and where the water is.
  sky: Uint8Array
  water: Uint8Array
  stars: Star[]
  windows: Box[]
  torches: { x: number; y: number }[]
  chimneys: [number, number][]
  banners: { x: number; y: number; r: ArrayLike<number> }[]
  clouds: Cloud[]
  moon: { x: number; y: number }
  lakeTop: number
  lakeBottom: (x: number) => number
  mill: { x: number; y: number } | null
  fireflies: { x: number; y: number }[]
}

export function paintScene(W: number, H: number): Scene {
  const px = new Uint32Array(W * H)
  const p = new Paint(px, W, H)
  const hy = Math.round(H * 0.6)
  const s = SEED

  // ---- Sky: deep blue overhead, warming through violet into the afterglow on the horizon (strongest right of middle).
  const n = SKY.length - 1
  for (let y = 0; y < hy; y++) {
    const t = y / hy
    for (let x = 0; x < W; x++) {
      const g = Math.exp(-(((x / W - 0.62) / 0.38) ** 2))
      const v = n * Math.pow(t, 1.35) - (1 - g) * 2.2 * t * t * t
      px[y * W + x] = tone(SKY, v, x, y)
    }
  }
  // A faint milky band across the upper sky, starred more thickly.
  const band = (x: number, y: number) => {
    const d = y - (H * 0.04 + (x / W) * H * 0.3)
    return Math.exp(-((d / (H * 0.07)) ** 2)) * fbm(x * 0.05, y * 0.07, s + 3)
  }
  const stars: Star[] = []
  for (let y = 0; y < hy * 0.82; y++) {
    for (let x = 0; x < W; x++) {
      const m = band(x, y)
      if (m > 0.2) p.tint(x, y, C(0x3c3a72), (m - 0.2) * 0.5)
      const fade = Math.pow(1 - y / (hy * 0.82), 1.4)
      const r = rnd(x, y, s)
      if (r > fade * 0.011 + m * 0.03) continue
      const k = rnd(x, y, s + 1)
      const c = k < 0.6 ? C(0xeef0ff) : k < 0.82 ? C(0xb6ccff) : C(0xffe4b0)
      if (rnd(x, y, s + 2) < 0.16 && stars.length < 90) {
        stars.push({ x, y, c, phase: rnd(x, y, s + 3) * 6.283, speed: 1.5 + rnd(x, y, s + 4) * 2.5 })
        continue
      }
      const dim = fade < 0.35 || rnd(x, y, s + 5) < 0.55
      p.set(x, y, dim ? mix(c, px[y * W + x], 0.55) : c)
      if (!dim && rnd(x, y, s + 6) < 0.12) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.tint(x + dx, y + dy, c, 0.4)
    }
  }
  // The moon and its halo, high on the left (the light of the whole picture comes from there).
  const moon = { x: Math.round(W * 0.17), y: Math.round(H * 0.15) }
  glow(p, moon.x, moon.y, 52, C(0x5a5e9c), 0.35)
  glow(p, moon.x, moon.y, 24, C(0xa4a8d4), 0.4)
  ball(p, moon.x, moon.y, 11, 11, MOON, { flat: 1.3, bias: 0.9 })
  for (let k = 0; k < 7; k++) {
    const a = rnd(k, 1, s) * 6.283
    const d = rnd(k, 2, s) * 7
    const cx = moon.x + Math.cos(a) * d
    const cy = moon.y + Math.sin(a) * d
    const r = 1 + rnd(k, 3, s) * 2
    p.disc(cx, cy, r, r, (x, y) => mix(p.get(x, y), MOON[1], 0.4))
    p.set(cx - r * 0.5, cy - r * 0.5, MOON[2])
  }
  const sky = new Uint8Array(W * H)
  const skyCopy = px.slice()

  // ---- Mountains: peaks of rough cones; the face toward the moon lit, gullies running down from the crest, snow on
  // the heights reaching lower down the gullies, mist at their feet.
  const range = (o: { seed: number; top: [number, number]; step: [number, number]; slope: [number, number]; snow: number; rock: ArrayLike<number>; haze: number; veil: number; veilTo: number }) => {
    const peaks: { x: number; top: number; sl: number; sr: number }[] = []
    for (let x = -60, i = 0; x < W + 60; i++) {
      peaks.push({
        x,
        top: o.top[0] + rnd(i, 1, o.seed) * (o.top[1] - o.top[0]),
        sl: o.slope[0] + rnd(i, 2, o.seed) * (o.slope[1] - o.slope[0]),
        sr: o.slope[0] + rnd(i, 3, o.seed) * (o.slope[1] - o.slope[0]),
      })
      x += o.step[0] + rnd(i, 4, o.seed) * (o.step[1] - o.step[0])
    }
    const heightOf = (pk: (typeof peaks)[number], i: number, x: number) => {
      const d = x - pk.x
      return pk.top + (d < 0 ? -d * pk.sl : d * pk.sr) + (fbm(x * 0.09, i, o.seed) - 0.5) * 7 * Math.min(1, Math.abs(d) / 12)
    }
    p.veil(o.veilTo, o.veil, () => {
      for (let x = 0; x < W; x++) {
        let best = Infinity
        let at = 0
        for (let i = 0; i < peaks.length; i++) {
          if (Math.abs(peaks[i].x - x) > 260) continue
          const h = heightOf(peaks[i], i, x)
          if (h < best) {
            best = h
            at = i
          }
        }
        const pk = peaks[at]
        const ridge = Math.round(best)
        const span = hy - pk.top
        for (let y = Math.max(0, ridge); y < hy; y++) {
          const rel = x - pk.x
          const lit = rel < 0
          const down = Math.max(2, y - pk.top)
          const g = noise((rel / down) * 6 + at * 7.3, down * 0.05, o.seed + 9)
          const crease = g > 0.62 ? (g - 0.62) * 3 : 0
          const depth = (y - pk.top) / span
          let l = (lit ? 3.1 : 1.5) - depth * 1.1 + (lit ? -crease * 1.4 : crease * 0.9) + (rnd(x, y, o.seed) - 0.5) * 0.35
          if (y - ridge < 1 && lit) l += 0.8
          const snowY = pk.top + span * o.snow * (0.5 + noise(x * 0.11, at, o.seed + 5) * 0.9) + crease * 22
          const c = y < snowY ? tone(SNOW_N, (lit ? 4.6 : 2.3) - crease * 1.2 - (y - pk.top) * 0.02 + (y - ridge < 1 ? 0.5 : 0), x, y) : tone(o.rock, l, x, y)
          p.set(x, y, c)
          const mist = clamp((depth - 0.55) / 0.45)
          if (mist > 0) p.tint(x, y, o.haze, mist * mist * 0.75)
        }
      }
    })
  }
  range({ seed: s + 11, top: [H * 0.2, H * 0.34], step: [46, 92], slope: [0.55, 0.95], snow: 0.45, rock: ROCK_FAR, haze: C(0x6a5288), veil: 0.38, veilTo: C(0x4a4078) })
  range({ seed: s + 23, top: [H * 0.37, H * 0.47], step: [34, 70], slope: [0.45, 0.8], snow: 0.2, rock: ROCK_NEAR, haze: C(0x3a3466), veil: 0.18, veilTo: C(0x262850) })

  // ---- The pine forest on the far shore.
  const forestY = (x: number) => hy - 3 - fbm(x * 0.02, 0, s + 31) * 16
  p.veil(C(0x1a1c3a), 0.32, () => {
    for (let x = 0; x < W; x++) for (let y = Math.round(forestY(x)); y < hy; y++) p.set(x, y, tone(PINE_N, 1.2 + (rnd(x, y, s) - 0.5) * 0.8, x, y))
    const trees: [number, number, number][] = []
    for (let x = -6, i = 0; x < W + 6; i++) {
      trees.push([x, forestY(x) + 2 + rnd(i, 1, s + 32) * 7, 8 + rnd(i, 2, s + 32) * 9])
      x += 2 + rnd(i, 3, s + 32) * 3
    }
    trees.sort((a, b) => a[1] - b[1])
    trees.forEach(([x, y, h], i) => conifer(p, x, y, h, PINE_N, { seed: i }))
  })
  for (let x = 0; x < W; x++) for (let y = hy - 5; y < hy; y++) p.tint(x, y, C(0x4a3e70), ((y - hy + 5) / 5) * 0.45)

  // ---- The lake: everything above mirrored, rippled and darkened; the near shore a pale line of shingle.
  const nearShore = (x: number) => hy + 12 + Math.round(fbm(x * 0.03, 3, s + 41) * 14)
  const water = new Uint8Array(W * H)
  for (let x = 0; x < W; x++) {
    const bottom = nearShore(x)
    for (let y = hy; y < bottom && y < H; y++) {
      const off = Math.round((noise(y * 0.9, x * 0.02, s + 42) - 0.5) * 3)
      const sy = hy - (y - hy) - 1
      const src = p.get(clamp(x + off, 0, W - 1), Math.max(0, sy))
      let c = mix(src, WATER[1], 0.38 + ((y - hy) / (bottom - hy)) * 0.25)
      const ripple = noise(x * 0.18, y * 1.7, s + 43)
      if ((y - hy) % 3 === 1 && ripple > 0.66) c = mix(c, C(0x9a96c8), 0.22)
      else if (ripple < 0.25) c = mix(c, WATER[0], 0.3)
      p.set(x, y, c)
      water[y * W + x] = 1
    }
    p.set(x, hy, mix(px[hy * W + x], C(0x0a0c1e), 0.5))
  }

  // ---- The meadows down to the front, the river winding through them.
  for (let x = 0; x < W; x++) {
    for (let y = nearShore(x); y < H; y++) {
      const lit = (1 - x / W) * 0.5
      const v = 2 + (fbm(x * 0.035, y * 0.09, s + 51) - 0.5) * 1.8 + lit - ((y - hy) / (H - hy)) * 1.2
      p.set(x, y, tone(GRASS_N, v, x, y))
    }
    const y0 = nearShore(x)
    p.set(x, y0, tone(DIRT_N, 4.2, x, y0))
    p.set(x, y0 + 1, tone(DIRT_N, 2.5, x, y0 + 1))
  }
  // Fields by the village: furrowed strips parted by hedges.
  for (let k = 0; k < 6; k++) {
    const fx = W * (0.08 + rnd(k, 1, s + 55) * 0.84)
    const fy = hy + 24 + rnd(k, 2, s + 55) * (H * 0.18)
    const fw = 26 + rnd(k, 3, s + 55) * 30
    const fh = 8 + rnd(k, 4, s + 55) * 8
    const sk = (rnd(k, 5, s + 55) - 0.5) * 0.6
    const crop = k % 3
    p.poly([fx, fy, fx + fw, fy + fw * sk * 0.3, fx + fw + fh * 0.8, fy + fh + fw * sk * 0.3, fx + fh * 0.8, fy + fh], (x, y) => {
      const row = Math.floor(y - (x - fx) * sk * 0.3) % 2 === 0
      return crop === 0 ? tone(DIRT_N, row ? 2.6 : 1.6, x, y) : crop === 1 ? tone(GRASS_N, row ? 3.6 : 2.4, x, y) : tone(ramp(0x1a1a10, 0x2a2816, 0x3c3820, 0x524c2a), row ? 2.6 : 1.5, x, y)
    })
    for (let i = 0; i < fw; i += 2) p.set(fx + i, fy + Math.round(i * sk * 0.3) - 1, tone(PINE_N, 2 + rnd(i, k, s) * 1.5, fx + i, fy))
  }
  // The river: from the lake's near shore, widening as it comes.
  const riverX = (y: number) => W * 0.44 + (y - hy) * 0.18 + Math.sin(y / 19) * 10 + Math.sin(y / 7.3) * 2
  for (let y = hy + 10; y < H; y++) {
    const wdt = 3 + ((y - hy) / (H - hy)) * 26
    const cx = riverX(y)
    for (let x = Math.floor(cx - wdt / 2 - 1); x <= Math.ceil(cx + wdt / 2 + 1); x++) {
      if (x < 0 || x >= W || y < nearShore(x) - 1) continue
      const d = Math.abs(x + 0.5 - cx) - wdt / 2
      if (d > 1) continue
      if (d > 0) {
        p.set(x, y, x < cx ? tone(DIRT_N, 4.3, x, y) : tone(GRASS_N, 0.6, x, y))
        continue
      }
      const sy = Math.max(0, Math.round(hy - (y - hy) * 0.35))
      let c = mix(SKY[Math.min(n, Math.round(n * (sy / hy) * 0.7))], WATER[1], 0.72)
      const ripple = noise(x * 0.3, y * 1.3, s + 61)
      if (ripple > 0.7) c = mix(c, C(0x8a88bc), 0.25)
      else if (ripple < 0.2) c = mix(c, WATER[0], 0.4)
      p.set(x, y, c)
      water[y * W + x] = 1
    }
  }

  // ---- The castle's hill on the right, its cliffs facing the moon.
  const cx = Math.round(Math.min(Math.max(W * 0.76, 150), W - 70))
  const top = hy - 16
  const hillY = (x: number) => {
    const d = Math.abs(x - cx)
    return top + Math.pow(Math.max(0, d - 50), 1.35) * 0.32 + (fbm(x * 0.07, 9, s + 71) - 0.5) * 5
  }
  for (let x = Math.max(0, cx - 190); x < Math.min(W, cx + 190); x++) {
    const ry = Math.round(hillY(x))
    for (let y = ry; y < H; y++) {
      if (y >= H * 0.98) break
      const d = y - ry
      const slope = clamp((hillY(x + 2) - hillY(x - 2)) / 4, -1.5, 1.5)
      const left = slope < 0
      const ad = Math.abs(x - cx)
      const steep = ad > 48 && ad < 82 && d < 3 + noise(x * 0.2, 0, s + 72) * 12 * (1 - (ad - 48) / 34)
      let c: number
      if (steep) {
        const crack = noise(x * 0.5, y * 0.12, s + 73) > 0.66
        c = tone(STONE_N, (left ? 3.6 : 1.6) - d * 0.04 - (crack ? 1.2 : 0) + (rnd(x, y, s) - 0.5) * 0.5, x, y)
      } else c = tone(GRASS_N, 2.2 - slope * 0.9 + (fbm(x * 0.06, y * 0.1, s + 74) - 0.5) * 1.2 - d * 0.015, x, y)
      if (d === 0) c = tone(GRASS_N, 4 - slope * 1.2, x, y)
      p.set(x, y, c)
    }
  }

  // ---- The road: from the front, across the meadows and up the hill to the gate, torches along it.
  const torches: { x: number; y: number }[] = []
  const bez = (t: number, a: number, b: number, c2: number, d: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c2 + t ** 3 * d
  const road: [number, number, number][] = []
  for (let i = 0; i <= 240; i++) {
    const t = i / 240
    road.push([bez(t, W * 0.62, W * 0.7, cx - 110, cx - 1), bez(t, H + 4, H * 0.8, top + 50, top + 1), 9 - t * 7])
  }
  for (const [x, y, r] of road) p.disc(x, y, r, Math.max(1, r * 0.45), (xx, yy) => tone(DIRT_N, 3.1 + (xx < x ? 0.6 : -0.3) + (rnd(xx, yy, s + 81) - 0.5) * 0.8, xx, yy))
  for (const k of [0.18, 0.34, 0.5, 0.64, 0.78]) {
    const [x, y, r] = road[Math.round(k * 240)]
    const side = Math.round(k * 10) % 2 ? 1 : -1
    const tx = Math.round(x + side * (r + 2))
    const ty = Math.round(y)
    p.rect(tx, ty - 5, 1, 5, WOOD[1])
    p.set(tx, ty - 6, WOOD[0])
    torches.push({ x: tx, y: ty - 7 })
  }

  // ---- The village under the castle and a hamlet with a windmill on the left: lit windows, smoking chimneys.
  const chimneys: [number, number][] = []
  const homes: { x: number; y: number; w: number; d: number; h: number; roof: ArrayLike<number> }[] = []
  const settle = (x0: number, x1: number, y0: number, y1: number, count: number, seed: number) => {
    for (let k = 0; k < count; k++) {
      const x = Math.round(x0 + rnd(k, 1, seed) * (x1 - x0))
      const y = Math.round(y0 + rnd(k, 2, seed) * (y1 - y0))
      if (homes.some((h) => Math.abs(h.x - x) < 18 && Math.abs(h.y - y) < 9)) continue
      homes.push({ x, y, w: 7 + Math.round(rnd(k, 3, seed) * 3), d: 9 + Math.round(rnd(k, 4, seed) * 8), h: 6 + Math.round(rnd(k, 5, seed) * 3), roof: rnd(k, 6, seed) < 0.55 ? TILE : THATCH })
    }
  }
  settle(cx - 175, cx - 70, nearShore(cx - 120) + 8, nearShore(cx - 120) + 34, 12, s + 91)
  settle(W * 0.03, W * 0.3, nearShore(W * 0.15) + 14, nearShore(W * 0.15) + 40, 8, s + 92)
  homes.sort((a, b) => a.y - b.y)
  p.veil(NIGHT, 0.42, () => {
    for (const h of homes) {
      const top2 = house(p, h.x, h.y, { w: h.w, d: h.d, h: h.h, roof: h.roof, wall: PLASTER, lit: true, chimney: rnd(h.x, h.y, s) < 0.7, windows: 1, door: 'shut' })
      if (top2) chimneys.push(top2)
    }
  })
  // The windmill: a stone tower on a knoll; its sails turn in `frame`.
  let mill: Scene['mill'] = null
  if (W > 240) {
    const mx = Math.round(W * 0.09)
    const my = nearShore(mx) + 10
    p.veil(NIGHT, 0.4, () => {
      p.poly([mx - 7, my, mx + 7, my, mx + 4, my - 22, mx - 4, my - 22], (x, y) => tone(STONE_N, 4.2 - ((x - (mx - 7)) / 14) * 2.6 + (y % 4 === 0 ? -0.6 : 0), x, y))
      p.poly([mx - 6, my - 22, mx + 6, my - 22, mx, my - 30], (x, y) => tone(THATCH, 3 - (x - mx + 6) / 6, x, y))
      p.rect(mx - 1, my - 5, 3, 5, WOOD[1])
      p.rect(mx, my - 15, 2, 2, LIT[1])
    })
    glow(p, mx + 1, my - 14, 5, C(0xffa040), 0.35)
    mill = { x: mx, y: my - 24 }
  }

  // ---- The castle: a curtain wall between round towers, a gatehouse over the road, a tall keep and a chapel spire.
  const windows: Box[] = []
  const banners: Scene['banners'] = []
  const gy = top + 1
  const masonry = (x: number, y: number, x0: number, x1: number, base: number) => {
    const u = (x - x0) / Math.max(1, x1 - x0)
    const course = Math.floor((gy - y) / 3)
    const mortar = (gy - y) % 3 === 0 || (x + course * 4) % 7 === 0
    return tone(STONE_N, base - u * 2.2 - (mortar ? 0.7 : 0) + (rnd(x, y, s + 101) - 0.5) * 0.4, x, y)
  }
  const crenels = (x0: number, x1: number, y: number, h = 3) => {
    for (let x = x0; x < x1; x++) {
      const merlon = (x - x0) % 5 < 3
      if (!merlon) continue
      for (let k = 1; k <= h; k++) p.set(x, y - k, masonry(x, y - k, x0, x1, 4.6))
    }
  }
  const lightWindow = (x: number, y: number, w: number, h: number) => {
    p.rect(x - 1, y - 1, w + 2, h + 1, STONE_N[0])
    p.rect(x, y, w, h, LIT[1])
    p.set(x, y, LIT[0])
    windows.push({ x, y, w, h })
    glow(p, x + w / 2, y + h / 2, 6, C(0xffa040), 0.3)
  }
  const cone = (x: number, y: number, half: number, h: number, flag: number) => {
    p.poly([x - half - 1, y, x + half + 1, y, x, y - h], (px2, py2) => {
      const u = (px2 - x) / (half + 1)
      const row = Math.floor((py2 - (y - h)) / 2)
      return tone(ROOF_N, 4 - (u + 1) * 1.6 - (row % 2 ? 0.4 : 0) + (rnd(px2, py2, s + 103) - 0.5) * 0.4, px2, py2)
    })
    p.set(x, y - h - 1, ROOF_N[1])
    p.rect(x, y - h - 7, 1, 6, WOOD[1])
    banners.push({ x: x + 1, y: y - h - 7, r: BANNER[flag % 2] })
  }
  const round = (x: number, yb: number, w: number, h: number, roofH: number, flag: number) => {
    const half = Math.floor(w / 2)
    for (let xx = x - half; xx < x + half; xx++) {
      const u = (xx - x + 0.5) / half
      for (let yy = yb - h; yy < yb; yy++) {
        const course = Math.floor((yb - yy) / 3)
        const mortar = (yb - yy) % 3 === 0 || (xx + course * 3) % 5 === 0
        p.set(xx, yy, tone(STONE_N, 4.4 - (u + 1) * 1.7 - Math.abs(u) ** 4 * 0.8 - (mortar ? 0.6 : 0), xx, yy))
      }
    }
    p.rect(x - half - 1, yb - h - 1, w + 2, 2, STONE_N[2])
    crenels(x - half - 1, x + half + 1, yb - h - 1, 2)
    if (roofH) cone(x, yb - h - 2, half, roofH, flag)
    lightWindow(x - 1, yb - Math.round(h * 0.6), 1, 3)
  }
  const square = (x0: number, x1: number, yb: number, h: number, base = 4.4) => {
    p.box(x0, yb - h, x1, yb, (x, y) => masonry(x, y, x0, x1, base))
    crenels(x0, x1, yb - h)
  }
  // Behind: the keep, its corner turrets, the chapel spire.
  square(cx - 4, cx + 24, gy - 10, 44)
  round(cx - 3, gy - 54, 7, 6, 10, 0)
  round(cx + 23, gy - 54, 7, 6, 10, 1)
  lightWindow(cx + 3, gy - 40, 2, 3)
  lightWindow(cx + 9, gy - 40, 2, 3)
  lightWindow(cx + 15, gy - 28, 2, 3)
  lightWindow(cx + 5, gy - 24, 2, 3)
  round(cx - 22, gy - 12, 8, 30, 18, 0)
  // The curtain wall, its corner towers and the gatehouse.
  square(cx - 50, cx + 50, gy, 15)
  for (let x = cx - 44; x < cx + 46; x += 13) if (Math.abs(x - cx) > 12) lightWindow(x, gy - 9, 1, 2)
  round(cx - 52, gy, 15, 26, 15, 1)
  round(cx + 52, gy, 15, 24, 14, 0)
  square(cx - 10, cx + 10, gy, 24, 4.8)
  round(cx - 10, gy - 24, 6, 4, 7, 1)
  round(cx + 10, gy - 24, 6, 4, 7, 0)
  // The gate: a dark arch, a raised portcullis, warm light from the yard.
  p.box(cx - 4, gy - 11, cx + 4, gy, (x, y) => (y < gy - 9 && Math.abs(x - cx + 0.5) > 2.5 ? undefined : y > gy - 6 ? tone(FIRE, 1.6 + (y - gy + 6) * 0.25, x, y) : STONE_N[0]))
  for (let x = cx - 3; x < cx + 4; x += 2) p.rect(x, gy - 10, 1, 4, C(0x1a1414))
  glow(p, cx, gy - 2, 12, C(0xffa040), 0.35)
  lightWindow(cx - 2, gy - 19, 1, 3)
  lightWindow(cx + 2, gy - 19, 1, 3)
  torches.push({ x: cx - 7, y: gy - 9 }, { x: cx + 7, y: gy - 9 })

  // ---- The front: dark hills rising to the corners, rimmed by moonlight, grass tufts and great pines on them.
  const fgY = (x: number) => {
    const l = H * 0.86 - Math.max(0, (W * 0.32 - x) / (W * 0.32)) ** 1.3 * H * 0.17
    const r = H * 0.9 - Math.max(0, (x - W * 0.7) / (W * 0.3)) ** 1.3 * H * 0.15
    return Math.round(Math.min(l, r, H * 0.94) + (fbm(x * 0.04, 2, s + 111) - 0.5) * 8)
  }
  for (let x = 0; x < W; x++) {
    const ry = fgY(x)
    const prev = fgY(x - 1)
    const facing = ry <= prev
    for (let y = ry; y < H; y++) {
      const d = y - ry
      p.set(x, y, d === 0 ? tone(FG, facing ? 4.6 : 3, x, y) : tone(FG, 2.2 - d * 0.05 + (fbm(x * 0.08, y * 0.1, s + 112) - 0.5) * 1.2, x, y))
    }
    if (rnd(x, 0, s + 113) < 0.45) {
      const len = 1 + Math.floor(rnd(x, 1, s + 113) * 3)
      for (let k = 1; k <= len; k++) p.set(x, ry - k, tone(FG, facing ? 4 : 2.6, x, ry - k))
    }
  }
  p.veil(C(0x02040a), 0.45, () => {
    const big: [number, number, number][] = []
    for (let k = 0; k < 16; k++) {
      const left = k % 2 === 0
      const x = left ? rnd(k, 1, s + 121) * W * 0.16 : W - rnd(k, 1, s + 121) * W * 0.14
      big.push([x, fgY(Math.round(x)) + 6 + rnd(k, 2, s + 121) * 10, 34 + rnd(k, 3, s + 121) * 44])
    }
    big.sort((a, b) => a[1] - b[1])
    big.forEach(([x, y, h], i) => conifer(p, x, y, h, PINE_N, { seed: i + 40 }))
    for (let k = 0; k < 10; k++) {
      const x = rnd(k, 4, s + 122) * W
      cluster(p, x, fgY(Math.round(x)) + 4, 14, 8, FG, s + k, 5)
    }
  })

  for (let i = 0; i < W * H; i++) sky[i] = px[i] === skyCopy[i] ? 1 : 0

  // ---- Drifting clouds, painted once each, moved in `frame`.
  const clouds: Cloud[] = []
  for (let k = 0; k < Math.max(3, Math.round(W / 140)); k++) {
    const w = 50 + Math.round(rnd(k, 1, s + 131) * 70)
    const h = 9 + Math.round(rnd(k, 2, s + 131) * 6)
    const cp = new Paint(new Uint32Array(w * h), w, h)
    cluster(cp, w / 2, h * 0.7, w * 0.9, h * 1.1, CLOUD, s + k * 13, Math.max(7, Math.round(w / 6)), { rough: 0.3, bias: -1.2 })
    // A thin lit rim along the underside, from the afterglow.
    for (let x = 0; x < w; x++) {
      for (let y = h - 1; y >= 0; y--) {
        if (!cp.px[y * w + x]) continue
        cp.px[y * w + x] = CLOUD[4]
        break
      }
    }
    clouds.push({ px: cp.px, w, h, x: rnd(k, 3, s + 131) * (W + w), y: H * 0.05 + rnd(k, 4, s + 131) * H * 0.3, speed: 0.6 + rnd(k, 5, s + 131) * 1.4 })
  }
  const fireflies: Scene['fireflies'] = []
  for (let k = 0; k < Math.round(W / 30); k++) fireflies.push({ x: rnd(k, 1, s + 141) * W, y: hy + 30 + rnd(k, 2, s + 141) * (H * 0.3) })

  return { w: W, h: H, base: px, sky, water, stars, windows, torches, chimneys, banners, clouds, moon, lakeTop: hy, lakeBottom: nearShore, mill, fireflies }
}

// One frame of what moves, over a copy of the painting into `out`; `t` in seconds.
export function frame(sc: Scene, t: number, out: Uint32Array) {
  out.set(sc.base)
  const { w: W, h: H } = sc
  const p = new Paint(out, W, H)
  const tick = Math.floor(t * 12)
  // Clouds, behind the land.
  for (const c of sc.clouds) {
    const x0 = Math.round(((c.x + t * c.speed) % (W + c.w)) - c.w)
    const y0 = Math.round(c.y)
    for (let y = 0; y < c.h; y++) {
      const yy = y0 + y
      if (yy < 0 || yy >= H) continue
      for (let x = 0; x < c.w; x++) {
        const v = c.px[y * c.w + x]
        const xx = x0 + x
        if (!v || xx < 0 || xx >= W || !sc.sky[yy * W + xx]) continue
        out[yy * W + xx] = v
      }
    }
  }
  // Twinkling stars.
  for (const st of sc.stars) {
    if (!sc.sky[st.y * W + st.x]) continue
    const b = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase)
    out[st.y * W + st.x] = mix(sc.base[st.y * W + st.x], st.c, 0.25 + b * 0.75)
    if (b > 0.92) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.tint(st.x + dx, st.y + dy, st.c, 0.35)
  }
  // Now and then a shooting star.
  const period = Math.floor(t / 9)
  const age = t - period * 9
  if (rnd(period, 1, 7) < 0.6 && age < 0.8) {
    const sx = W * (0.3 + rnd(period, 2, 7) * 0.6) + age * 90
    const sy = H * (0.05 + rnd(period, 3, 7) * 0.15) + age * 40
    for (let k = 0; k < 14; k++) {
      const x = Math.round(sx - k * 2.2)
      const y = Math.round(sy - k)
      if (x >= 0 && y >= 0 && x < W && y < H && sc.sky[y * W + x]) p.dot(x, y, C(0xf4f0ff), (1 - k / 14) * (1 - age / 0.8) * 1.4)
    }
  }
  // Birds crossing.
  const lap = 34
  const bt = (t % lap) / lap
  for (let k = 0; k < 5; k++) {
    const bx = Math.round(bt * (W + 120) - 60 - Math.abs(k - 2) * 6)
    const by = Math.round(H * 0.3 + (k - 2) * 2.5 + Math.abs(k - 2) * 2 + Math.sin(t * 0.7) * 3)
    const up = Math.floor(t * 6 + k) % 2 === 0
    const ink = C(0x0a0c1a)
    p.set(bx, by, ink)
    p.set(bx - 1, by - (up ? 1 : 0), ink)
    p.set(bx + 1, by - (up ? 1 : 0), ink)
    p.set(bx - 2, by - (up ? 2 : 0), ink)
    p.set(bx + 2, by - (up ? 2 : 0), ink)
  }
  // The moon's road on the lake.
  for (let y = sc.lakeTop + 1; y < H; y++) {
    if (!sc.water[y * W + sc.moon.x]) {
      if (y > sc.lakeBottom(sc.moon.x)) break
      continue
    }
    const depth = (y - sc.lakeTop) / Math.max(1, sc.lakeBottom(sc.moon.x) - sc.lakeTop)
    const shine = noise(y * 0.8, t * 1.6, 3)
    if (shine < 0.35) continue
    const half = Math.round((1 - depth) * 4 + shine * 3)
    const mid = Math.round(sc.moon.x + (noise(y * 0.5, t * 0.9, 4) - 0.5) * 4)
    for (let x = mid - half; x <= mid + half; x++) if (x >= 0 && x < W && sc.water[y * W + x]) out[y * W + x] = mix(out[y * W + x], MOON[4], (shine - 0.3) * (1 - Math.abs(x - mid) / (half + 1)) * 0.9)
  }
  // Glints on the river.
  for (let k = 0; k < 14; k++) {
    const y = sc.lakeTop + 14 + Math.round(((k * 37 + t * 6) % (H - sc.lakeTop)))
    const row = y * W
    for (let x = 0; x < W; x++) {
      if (y >= H || !sc.water[row + x] || rnd(x, y, k) > 0.12) continue
      if (Math.sin(t * 3 + x + k) > 0.6) out[row + x] = mix(out[row + x], C(0xb4b0dc), 0.5)
    }
  }
  // Castle windows: now and then one dims as someone passes the candle.
  sc.windows.forEach((wd, i) => {
    const r = rnd(i, tick >> 2, 11)
    const c = r < 0.08 ? LIT[3] : r < 0.25 ? LIT[2] : r > 0.94 ? LIT[0] : LIT[1]
    p.rect(wd.x, wd.y, wd.w, wd.h, c)
  })
  // Chimney smoke, rising and drifting right.
  sc.chimneys.forEach(([x, y], i) => {
    for (let k = 0; k < 6; k++) {
      const a = (t * 0.22 + k / 6 + i * 0.37) % 1
      const sx = x + a * 10 + Math.sin(t * 1.3 + k + i) * 1.2
      const sy = y - a * 24
      const r = 0.8 + a * 2.2
      p.disc(sx, sy, r, r, (xx, yy) => (bay(xx, yy) < (1 - a) * 0.75 ? tone(CLOUD, 3.6 - a * 1.5, xx, yy) : undefined))
    }
  })
  // Torches: a flickering flame and its glow.
  sc.torches.forEach((tc, i) => {
    const f = rnd(i, tick, 13)
    glow(p, tc.x, tc.y, 7 + f * 2, C(0xff9a30), 0.28 + f * 0.12)
    p.set(tc.x, tc.y, FIRE[3 + (f > 0.5 ? 1 : 0)])
    p.set(tc.x, tc.y - 1, FIRE[f > 0.3 ? 3 : 2])
    if (f > 0.4) p.set(tc.x + (f > 0.7 ? 1 : -1), tc.y - 2, FIRE[2])
    p.set(tc.x, tc.y + 1, FIRE[2])
  })
  // Banners waving.
  for (const b of sc.banners) {
    for (let i = 0; i < 6; i++) {
      const wave = Math.round(Math.sin(t * 5 - i * 0.9 + b.x) * (i / 5) * 1.2)
      for (let j = 0; j < 3; j++) p.set(b.x + i, b.y + j + wave, j === 0 ? b.r[2] : j === 2 && i > 3 ? b.r[0] : b.r[1])
    }
  }
  // The windmill's sails.
  if (sc.mill) {
    const a0 = t * 0.5
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      for (let r = 1; r < 15; r++) {
        const x = sc.mill.x + dx * r
        const y = sc.mill.y + dy * r
        p.set(x, y, WOOD[1])
        if (r > 4) p.set(x - dy * 2, y + dx * 2, r % 3 === 0 ? WOOD[1] : C(0x6a6478))
      }
    }
    p.set(sc.mill.x, sc.mill.y, WOOD[0])
  }
  // Fireflies over the meadows.
  sc.fireflies.forEach((f, i) => {
    const on = Math.sin(t * 1.7 + i * 2.1) > 0.3
    if (!on) return
    const x = f.x + Math.sin(t * 0.4 + i) * 6
    const y = f.y + Math.sin(t * 0.6 + i * 1.7) * 3
    p.tint(x, y, C(0xd8ff7a), 0.9)
    p.tint(x + 1, y, C(0x9ad050), 0.3)
    p.tint(x - 1, y, C(0x9ad050), 0.3)
  })
}

