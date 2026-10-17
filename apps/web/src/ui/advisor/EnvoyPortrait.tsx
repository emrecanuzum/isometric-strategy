import { useEffect, useRef } from 'react'
import { ramp } from '../../game/sprites'
import { C, GOLD, INK, Paint, mix, noise, rnd, tone } from '../artKit'

// The lord's own envoy (Elçi), who brings the news and gives advice (CLAUDE.md §9.8): an old courtier in a plumed hat
// and a ruff, a pointed grey beard, one brow raised, a scroll in hand. Painted once in code, 48 × 60 art pixels in a
// gilt frame like the dynasty's portraits; he blinks now and then and moves his mouth while he speaks.

const PW = 48
const PH = 60
const c = 24

const SKIN = ramp(0x6e4030, 0xa66c50, 0xcc9070, 0xe6b48e, 0xf4ceaa)
const BEARD = ramp(0x4a484e, 0x76747a, 0xa6a4a8, 0xcecccf, 0xf0eff0)
const BACK = ramp(0x081618, 0x0e2428, 0x16363a, 0x22484c, 0x325e60)
const HAT = ramp(0x2a0a14, 0x4a1424, 0x702034, 0x983048, 0xb84a60)
const COAT = ramp(0x0c1a14, 0x16281e, 0x223a2a, 0x325038, 0x46684a)
const LINEN = ramp(0x8e8a7e, 0xbcb8aa, 0xdedacc, 0xf6f2e6)
const PLUME = ramp(0x9a8e80, 0xc8beb0, 0xe8e2d6, 0xfffaf0)
const PARCH = ramp(0x8a6a3a, 0xb8945a, 0xdcc08a, 0xf2e2b8)
const IRIS = C(0x3a5a2a)
const SEAL = C(0xb02020)

// Half the width of the face at row y.
function faceHalf(y: number) {
  const fy = 18
  const v = (y + 0.5 - fy) / 20
  if (v < 0 || v > 1) return -1
  if (v < 0.4) return 8 * Math.sqrt(Math.max(0, 1 - ((0.4 - v) / 0.48) ** 2))
  if (v < 0.62) return 8
  return 8 * (1 - 0.45 * ((v - 0.62) / 0.38) ** 1.4)
}

function paint(): Uint32Array {
  const px = new Uint32Array(PW * PH)
  const p = new Paint(px, PW, PH)
  // A damask ground, lit behind the head.
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const d = Math.hypot(x - c + 6, (y - 20) * 0.8) / 30
      let l = 3.1 - d * 2.6 + (noise(x * 0.2, y * 0.2, 7) - 0.5) * 0.5
      if ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) l += 0.35
      px[y * PW + x] = tone(BACK, l, x, y)
    }
  }
  // The plume, sweeping up and back over the hat to the right.
  for (let i = 0; i <= 40; i++) {
    const u = i / 40
    const x = c + 6 + u * 13 - u * u * 3
    const y = 16 - Math.sin(u * Math.PI * 0.9) * 10 + u * 6
    const w = 2.6 - u * 1.4
    for (let dy = -w; dy <= w; dy += 0.5) {
      const l = 2.6 - dy * 0.5 - u * 0.6
      p.set(x, y + dy, tone(u > 0.82 ? ramp(0xa04060, 0xc86080, 0xe890a8) : PLUME, l, Math.round(x), Math.round(y + dy)))
    }
    // Barbs combed back.
    if (i % 3 === 0) p.set(x + 1, y + w + 1, PLUME[1])
  }
  // The coat over the shoulders, gold buttons down the front.
  for (let y = 40; y < PH; y++) {
    const half = Math.min(22, 7 + (y - 40) * 1.6)
    for (let x = Math.floor(c - half); x <= c + half; x++) {
      const nx = (x + 0.5 - c) / half
      let l = 2.4 - nx * 1.3 + Math.sin(x * 0.9 + y * 0.1) * 0.15
      if (Math.abs(nx) > 0.9) l -= 0.8
      p.set(x, y, tone(COAT, l, x, y))
    }
  }
  for (let y = 46; y < PH - 4; y += 3) {
    p.set(c - 1, y, GOLD[4])
    p.set(c, y, GOLD[2])
  }
  // A gold chain of office.
  for (let x = c - 13; x <= c + 12; x++) {
    const y = Math.round(44 + ((x + 0.5 - c) ** 2) / 22)
    if (y < PH) p.set(x, y, x % 2 ? GOLD[4] : GOLD[2])
  }
  // The neck and the ruff round it, pleated.
  p.box(c - 3, 36, c + 3, 41, (x, y) => tone(SKIN, 1.6 - (x - c) * 0.2, x, y))
  for (let y = 37; y <= 44; y++) {
    for (let x = c - 13; x <= c + 13; x++) {
      const dx = (x + 0.5 - c) / 13
      const dy = (y + 0.5 - 40.5) / 3.6
      if (dx * dx + dy * dy > 1) continue
      if ((x + 0.5 - c) ** 2 / 25 + (y + 0.5 - 38) ** 2 / 4 < 1 && y < 39) continue
      const pleat = (x + 99) % 2 === 0
      p.set(x, y, tone(LINEN, 2.4 - dx * 1.1 - (pleat ? 0.9 : 0) - (y === 44 ? 0.8 : 0), x, y))
    }
  }
  // The face, lit from the upper left.
  for (let y = 18; y <= 38; y++) {
    const half = faceHalf(y)
    for (let x = c - 9; x <= c + 9; x++) {
      const dx = x + 0.5 - c
      if (Math.abs(dx) > half) continue
      const nx = dx / 8
      let l = 3.0 - nx * 1.1 - Math.max(0, Math.abs(nx) - 0.6) * 1.6
      if (Math.abs(y - 26) <= 1 && Math.abs(Math.abs(dx) - 3.5) < 2.5) l -= 0.4
      if (Math.hypot(dx + 4.5, y - 29) < 2) l += 0.4
      if (Math.abs(dx) > half - 1) l = Math.min(l, dx > 0 ? 0.8 : 1.6)
      p.set(x, y, tone(SKIN, l, x, y))
    }
  }
  // Ears.
  for (let y = 25; y <= 29; y++) {
    p.set(c - 9, y, SKIN[y === 27 ? 1 : 2])
    p.set(c + 8, y, SKIN[y === 27 ? 0 : 1])
  }
  // Grey hair at the temples, under the brim.
  for (let y = 19; y <= 28; y++) {
    for (const [x0, x1] of [[c - 10, c - 7], [c + 6, c + 9]] as const) {
      for (let x = x0; x <= x1; x++) if (rnd(x, y, 4) < 0.85 - (y - 19) * 0.06) p.set(x, y, tone(BEARD, 2.6 - (x - c) * 0.12 + (rnd(x, y, 5) - 0.5), x, y))
    }
  }
  // Brows: the left even, the right arched high (he has heard it all before).
  for (const [x, y] of [[c - 6, 24], [c - 5, 23], [c - 4, 23], [c - 3, 23]] as const) p.set(x, y, BEARD[1])
  for (const [x, y] of [[c + 2, 22], [c + 3, 21], [c + 4, 21], [c + 5, 22]] as const) p.set(x, y, BEARD[1])
  // Eyes, lidded.
  for (const [o, m, i, s] of [[c - 6, c - 5, c - 4, -1], [c + 5, c + 4, c + 3, 1]] as const) {
    p.set(o, 25, SKIN[0])
    p.set(m, 25, mix(SKIN[0], INK, 0.4))
    p.set(i, 25, SKIN[0])
    p.set(o, 26, s < 0 ? C(0xe6ded2) : C(0xc4b8ac))
    p.set(m, 26, IRIS)
    p.set(i, 26, C(0xc4b8ac))
    p.set(m, 27, SKIN[1])
  }
  // Crow's feet and a lined brow.
  for (const s of [-1, 1]) {
    p.tint(s < 0 ? c - 8 : c + 7, 26, SKIN[0], 0.7)
    p.tint(s < 0 ? c - 8 : c + 7, 27, SKIN[0], 0.5)
  }
  for (let x = c - 4; x <= c + 3; x++) if (x % 3) p.tint(x, 20, SKIN[1], 0.6)
  // The long nose.
  for (let y = 26; y < 31; y++) p.set(c, y, tone(SKIN, 1.8, c, y))
  p.set(c - 1, 31, SKIN[4])
  p.set(c, 31, SKIN[2])
  p.set(c - 2, 31, SKIN[1])
  p.set(c + 1, 31, SKIN[1])
  p.set(c, 32, SKIN[0])
  // The beard: cheeks and chin, drawn down to a point.
  for (let y = 31; y <= 47; y++) {
    for (let x = c - 9; x <= c + 9; x++) {
      const dx = x + 0.5 - c
      const ax = Math.abs(dx)
      const half = y <= 38 ? faceHalf(y) + 0.4 : 4.6 * (1 - (y - 38) / 10) + 0.4
      if (ax > half) continue
      const side = y <= 35 ? ax >= 5.6 : true
      if (!side) continue
      if (y >= 33 && y <= 35 && ax < 3) continue
      const l = 2.6 - dx * 0.14 + (noise(x * 0.8, y * 0.3, 6) - 0.5) * 1.2 - (y > 42 ? 0.4 : 0)
      p.set(x, y, tone(BEARD, l, x, y))
    }
  }
  // The moustache, its ends waxed up.
  for (let x = c - 5; x <= c + 4; x++) p.set(x, 33, tone(BEARD, 2.8 - (x - c) * 0.2, x, 33))
  p.set(c - 6, 32, BEARD[2])
  p.set(c - 7, 31, BEARD[3])
  p.set(c + 5, 32, BEARD[1])
  p.set(c + 6, 31, BEARD[2])
  mouth(p, 0)
  // The hat: a wide brim tilted down to the left, a soft crown, a gold band.
  for (let y = 4; y <= 22; y++) {
    for (let x = 4; x < 44; x++) {
      const tilt = (x - c) * 0.12
      const bdx = (x + 0.5 - c - 1) / 17
      const bdy = (y + 0.5 - 19.5 + tilt) / 3.2
      const brim = bdx * bdx + bdy * bdy <= 1
      const cdx = (x + 0.5 - c) / 9.5
      const cdy = (y + 0.5 - 15 + tilt) / 9
      const crown = cdx * cdx + cdy * cdy <= 1 && y + tilt <= 18
      if (!brim && !crown) continue
      let l = brim && !crown ? 2.4 - bdx * 1.2 - (bdy > 0.3 ? 1 : 0) : 3.0 - cdx * 1.4 - cdy * 0.4
      if (crown && Math.abs(y + tilt - 16.5) < 1) {
        p.set(x, y, tone(GOLD, 3.6 - cdx * 1.6, x, y))
        continue
      }
      if (brim && !crown && bdy < -0.2) l += 0.5
      p.set(x, y, tone(HAT, l, x, y))
    }
  }
  // A jewel pinning the plume.
  p.set(c + 7, 15, C(0x2a5ad0))
  p.set(c + 8, 15, GOLD[4])
  // The scroll in his hand, sealed in red.
  for (let i = 0; i < 18; i++) {
    const x = 5 + i
    const y = 51 + i * 0.25
    for (let dy = -2; dy <= 2; dy++) p.set(x, y + dy, tone(PARCH, 2.6 - dy * 0.6 - (i === 0 || i === 17 ? 0.8 : 0), x, Math.round(y + dy)))
  }
  p.disc(5, 51, 1.6, 2.4, PARCH[1])
  p.rect(12, 50, 2, 6, SEAL)
  p.set(12, 56, mix(SEAL, INK, 0.4))
  p.set(13, 57, SEAL)
  for (const [x, y, l] of [[18, 52, 3], [19, 52, 3], [20, 52, 2], [18, 53, 2], [19, 53, 2], [20, 53, 1], [19, 54, 1]] as const) p.set(x, y, SKIN[l])
  frame(p)
  return px
}

// The mouth under the moustache: 0 the wry smile, 1 a little open, 2 open wide.
function mouth(p: Paint, k: number) {
  const y = 34
  if (k === 0) {
    for (let x = c - 2; x <= c + 1; x++) p.set(x, y, mix(SKIN[0], C(0x401010), 0.55))
    p.set(c + 2, y - 1, mix(SKIN[0], C(0x401010), 0.5))
    p.set(c - 1, y + 1, SKIN[2])
    p.set(c, y + 1, SKIN[1])
    return
  }
  p.box(c - 2, y, c + 2, y + 1 + k, (x, yy) => (yy === y && k === 2 && x > c - 2 && x < c + 1 ? C(0xe8e0d0) : C(0x2a0c0c)))
  p.set(c + 2, y - 1, mix(SKIN[0], C(0x401010), 0.5))
  p.set(c - 1, y + 1 + k, SKIN[2])
}

// Eyes shut: the lids down.
function blink(p: Paint) {
  for (const [o, i] of [[c - 6, c - 4], [c + 3, c + 5]] as const) {
    for (let x = o; x <= i; x++) {
      p.set(x, 25, SKIN[2])
      p.set(x, 26, mix(SKIN[0], INK, 0.3))
    }
  }
}

// The right brow raised a little higher still.
function arch(p: Paint) {
  for (const [x, y] of [[c + 2, 22], [c + 3, 21], [c + 4, 21], [c + 5, 22]] as const) p.set(x, y, SKIN[3])
  for (const [x, y] of [[c + 2, 21], [c + 3, 20], [c + 4, 20], [c + 5, 21]] as const) p.set(x, y, BEARD[1])
}

// The gilt frame (as the dynasty's portraits have), round a 48 × 60 picture (the tribute captain's uses it too).
export function frame(p: Paint) {
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const d = Math.min(x, y, PW - 1 - x, PH - 1 - y)
      if (d > 3) {
        if (d === 4) p.tint(x, y, INK, x === 4 || y === 4 ? 0.55 : 0.3)
        continue
      }
      const lit = (x <= y && x < PW - 1 - y) || (y < x && y < PH - 1 - x)
      p.set(x, y, d === 0 ? GOLD[0] : d === 1 ? (lit ? GOLD[4] : GOLD[1]) : d === 2 ? ((x + y) & 1 ? GOLD[3] : lit ? GOLD[2] : GOLD[1]) : lit ? GOLD[0] : GOLD[1])
    }
  }
  for (const [x, y] of [[2, 2], [PW - 3, 2], [2, PH - 3], [PW - 3, PH - 3]]) {
    p.set(x, y, GOLD[5])
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(x + dx, y + dy, GOLD[3])
  }
}

let painted: Uint32Array | null = null

// The envoy's portrait, scaled crisply to `size` pixels wide. While `talking` his mouth moves; he blinks unless `still`.
export function EnvoyPortrait({ size = 96, talking = false, still = false }: { size?: number; talking?: boolean; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const talk = useRef(talking)
  talk.current = talking
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    painted ??= paint()
    const image = ctx.createImageData(PW, PH)
    const out = new Uint32Array(image.data.buffer)
    const p = new Paint(out, PW, PH)
    const draw = (t: number) => {
      out.set(painted!)
      // A blink every few seconds, now and then a double one.
      const b = t % 4.6
      if (b < 0.14 || (Math.floor(t / 4.6) % 3 === 1 && b > 0.3 && b < 0.42)) blink(p)
      if (talk.current) {
        const syll = Math.floor(t * 9)
        mouth(p, [1, 2, 0, 2, 1, 0, 1][syll % 7])
        if (Math.floor(t * 1.3) % 4 === 1) arch(p)
      }
      ctx.putImageData(image, 0, 0)
    }
    draw(0)
    if (still || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = -1
    const start = performance.now()
    const loop = (now: number) => {
      const frame = Math.floor((now - start) / 70)
      if (frame !== last) {
        last = frame
        draw(frame * 0.07)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [still])
  return <canvas ref={ref} width={PW} height={PH} aria-hidden style={{ display: 'block', width: size, height: (size * PH) / PW, imageRendering: 'pixelated', flex: 'none' }} />
}

