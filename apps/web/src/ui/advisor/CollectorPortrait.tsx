import { useEffect, useRef } from 'react'
import { ramp } from '../../game/sprites'
import { C, GOLD, Paint, mix, noise, rnd, tone } from '../artKit'
import { frame } from './EnvoyPortrait'

// The captain of a rival crown's tribute collectors (CLAUDE.md §7.8), as he talks at the gate: a weathered soldier
// in a steel nasal helm with a crest in his crown's colour, a mail hood, a heavy black moustache and a scar, a tabard
// of the crown over his mail. Painted once per colour in code, 48 × 60 art pixels in the same gilt frame as the
// envoy's portrait; he blinks and moves his mouth while he speaks.

const PW = 48
const PH = 60
const c = 24

const SKIN = ramp(0x5a3020, 0x8a5434, 0xb47650, 0xd49a72, 0xe8b890)
const HAIR = ramp(0x0e0a0a, 0x1e1614, 0x30241e, 0x4a3a30)
const STEEL = ramp(0x1e2228, 0x3a4048, 0x5a626c, 0x848c96, 0xb2bac2, 0xe2e8ee)
const BACK = ramp(0x140e0c, 0x221812, 0x32241a, 0x443222, 0x5a442e)
const LEATHER = ramp(0x2a160c, 0x4a2a16, 0x6a4022, 0x8a5a32)

// A five-tone ramp from an interface hex colour (the crown's).
function rampOf(hex: string) {
  const v = parseInt(hex.slice(1), 16)
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  const at = (k: number) => {
    const f = (x: number) => Math.round(k < 1 ? x * k : x + (255 - x) * (k - 1))
    return (f(r) << 16) | (f(g) << 8) | f(b)
  }
  return ramp(at(0.35), at(0.6), at(0.85), at(1.18), at(1.4))
}

// Half the width of the face at row y (a broad, square jaw).
function faceHalf(y: number) {
  const v = (y + 0.5 - 20) / 18
  if (v < 0 || v > 1) return -1
  if (v < 0.7) return 8
  return 8 * (1 - 0.35 * ((v - 0.7) / 0.3) ** 1.3)
}

function paint(hex: string): Uint32Array {
  const CREST = rampOf(hex)
  const px = new Uint32Array(PW * PH)
  const p = new Paint(px, PW, PH)
  // A stone gateway behind him, lit from the upper left.
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const row = Math.floor(y / 6)
      const joint = y % 6 === 0 || (x + (row % 2) * 5) % 10 === 0
      let l = 3 - Math.hypot(x - c + 8, (y - 18) * 0.8) / 14 + (noise(x * 0.3, y * 0.3, 11) - 0.5) * 0.6
      if (joint) l -= 0.9
      px[y * PW + x] = tone(BACK, l, x, y)
    }
  }
  // Mail over the shoulders, a tabard of the crown down the front, a leather baldric across it.
  for (let y = 39; y < PH; y++) {
    const half = Math.min(23, 8 + (y - 39) * 1.7)
    for (let x = Math.floor(c - half); x <= c + half; x++) {
      const nx = (x + 0.5 - c) / half
      const ring = (x + (y % 2)) % 2 === 0
      let l = 3 - nx * 1.4 - (ring ? 0.7 : 0) - (Math.abs(nx) > 0.9 ? 0.8 : 0)
      p.set(x, y, tone(STEEL, l, x, y))
      if (y >= 45 && Math.abs(x + 0.5 - c) < 7 + (y - 45) * 0.2) {
        l = 3 - nx * 1.2 + (noise(x * 0.4, y * 0.2, 3) - 0.5) * 0.4
        p.set(x, y, tone(CREST, l, x, y))
      }
    }
  }
  // The tabard's edge stitched in gold, and a gold crown on its breast.
  for (let y = 45; y < PH; y++) {
    const w = 7 + (y - 45) * 0.2
    p.set(c - w, y, GOLD[2])
    p.set(c + w - 1, y, GOLD[1])
  }
  for (const [x, y] of [[c - 3, 51], [c - 1, 50], [c + 1, 50], [c + 3, 51]] as const) p.set(x, y, GOLD[4])
  p.rect(c - 3, 52, 7, 2, GOLD[3])
  p.rect(c - 3, 53, 7, 1, GOLD[1])
  for (let i = 0; i < 26; i++) {
    const x = c - 15 + i
    const y = 42 + i * 0.7
    p.set(x, y, tone(LEATHER, 2.4 - (i % 5 === 0 ? 1 : 0), x, Math.round(y)))
    p.set(x, y + 1, LEATHER[0])
  }
  p.rect(c + 4, 50, 3, 3, GOLD[3])
  p.set(c + 5, 51, LEATHER[0])
  // The mail hood falling from the helm round the face to the shoulders.
  for (let y = 18; y <= 44; y++) {
    for (let x = c - 13; x <= c + 13; x++) {
      const dx = (x + 0.5 - c) / 13
      const dy = (y + 0.5 - 30) / 15
      if (dx * dx + dy * dy > 1) continue
      const ring = (x + (y % 2)) % 2 === 0
      p.set(x, y, tone(STEEL, 2.6 - dx * 1.4 - (ring ? 0.8 : 0) - Math.max(0, dy) * 0.6, x, y))
    }
  }
  // The face, lit from the upper left.
  for (let y = 20; y <= 38; y++) {
    const half = faceHalf(y)
    for (let x = c - 9; x <= c + 9; x++) {
      const dx = x + 0.5 - c
      if (Math.abs(dx) > half) continue
      const nx = dx / 8
      let l = 2.8 - nx * 1.2 - Math.max(0, Math.abs(nx) - 0.6) * 1.6
      if (Math.abs(y - 26) <= 1 && Math.abs(Math.abs(dx) - 3.5) < 2.5) l -= 0.5
      if (Math.hypot(dx + 4.5, y - 29) < 2) l += 0.3
      if (Math.abs(dx) > half - 1) l = Math.min(l, dx > 0 ? 0.7 : 1.5)
      p.set(x, y, tone(SKIN, l, x, y))
    }
  }
  // Stubble on the jaw.
  for (let y = 31; y <= 38; y++) {
    for (let x = c - 8; x <= c + 8; x++) if (Math.abs(x + 0.5 - c) <= faceHalf(y) - 0.5 && rnd(x, y, 9) < 0.35) p.tint(x, y, HAIR[1], 0.5)
  }
  // Thick, low brows, knitted.
  for (let x = c - 7; x <= c - 2; x++) p.set(x, x === c - 2 ? 25 : 24, HAIR[1])
  for (let x = c + 1; x <= c + 6; x++) p.set(x, x === c + 1 ? 25 : 24, HAIR[1])
  // Eyes, narrowed.
  for (const [o, m, i] of [[c - 6, c - 5, c - 4], [c + 5, c + 4, c + 3]] as const) {
    p.set(o, 26, SKIN[0])
    p.set(m, 26, C(0x201410))
    p.set(i, 26, C(0xb8a898))
    p.set(m, 27, SKIN[1])
  }
  // A scar down the left cheek, across the eye's corner.
  for (let i = 0; i < 7; i++) {
    p.set(c - 7 + i * 0.3, 24 + i, mix(SKIN[3], C(0xd07070), 0.4))
    if (i % 2) p.set(c - 8 + i * 0.3, 24 + i, SKIN[1])
  }
  // A broad, once-broken nose.
  for (let y = 27; y < 31; y++) p.set(c, y, tone(SKIN, 1.9, c, y))
  p.set(c - 1, 29, SKIN[3])
  p.set(c - 2, 31, SKIN[1])
  p.set(c - 1, 31, SKIN[3])
  p.set(c, 31, SKIN[2])
  p.set(c + 1, 31, SKIN[0])
  p.set(c, 32, SKIN[0])
  mouth(p, 0)
  // The moustache: heavy and black, drooping past the corners of the mouth.
  for (let x = c - 6; x <= c + 5; x++) {
    p.set(x, 32, tone(HAIR, 2 - (x - c) * 0.15, x, 32))
    if (Math.abs(x + 0.5 - c) > 1.5) p.set(x, 33, tone(HAIR, 1.6 - (x - c) * 0.15, x, 33))
  }
  for (const s of [-1, 1]) {
    const x = s < 0 ? c - 6 : c + 5
    for (let y = 34; y <= 37; y++) p.set(x + (y > 35 ? s : 0), y, HAIR[y > 36 ? 0 : 1])
  }
  // The helm: a pointed steel cap riveted in bands, a brim band, a nasal down over the nose.
  for (let y = 3; y <= 22; y++) {
    for (let x = c - 12; x <= c + 12; x++) {
      const dx = x + 0.5 - c
      const v = (y + 0.5 - 3) / 19
      const half = 11.5 * Math.min(1, Math.sqrt(v * 1.25))
      if (Math.abs(dx) > half) continue
      const nx = dx / 11.5
      let l = 3.6 - nx * 2 - (1 - v) * 0.4
      if (Math.abs(dx + 3.5) < 0.8 && v > 0.15) l += 1
      if (Math.abs(dx) < 0.7 || Math.abs(Math.abs(dx) - 6) < 0.6) l -= 0.8
      p.set(x, y, tone(STEEL, l, x, y))
    }
  }
  for (let x = c - 12; x <= c + 12; x++) {
    for (let y = 19; y <= 21; y++) p.set(x, y, tone(STEEL, (y === 19 ? 3.4 : y === 21 ? 1 : 2.4) - ((x - c) / 12) * 1.6, x, y))
    if ((x - c + 12) % 4 === 1) p.set(x, 20, GOLD[3])
  }
  for (let y = 22; y <= 30; y++) {
    p.set(c - 1, y, STEEL[4])
    p.set(c, y, STEEL[2])
  }
  p.set(c - 1, 31, STEEL[3])
  p.set(c, 31, STEEL[1])
  // A horsehair crest in the crown's colour, swept back from the top of the helm.
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    const x = c + u * 15
    const y = 3 - Math.sin(u * Math.PI * 0.8) * 3 + u * u * 14
    const w = 2.2 - u * 1.2
    for (let dy = -w; dy <= w; dy += 0.5) p.set(x, y + dy, tone(CREST, 3 - dy * 0.7 - u * 0.8 + (rnd(i, dy * 2, 4) - 0.5) * 0.6, Math.round(x), Math.round(y + dy)))
    if (i % 4 === 0) p.set(x + 1, y + w + 1, CREST[1])
  }
  p.rect(c - 1, 1, 3, 3, GOLD[3])
  p.set(c - 1, 1, GOLD[4])
  // A tally stick in his gloved hand: so much owed.
  for (let i = 0; i < 16; i++) {
    const x = 6 + i
    const y = 54 - i * 0.2
    p.set(x, y, tone(LEATHER, 3 - (i % 3 === 0 ? 1.2 : 0), x, Math.round(y)))
    p.set(x, y + 1, LEATHER[1])
  }
  for (const [x, y, l] of [[10, 53, 2], [11, 53, 2], [10, 54, 1], [11, 54, 1], [12, 54, 1]] as const) p.set(x, y, LEATHER[l])
  frame(p)
  return px
}

// The mouth under the moustache: 0 a hard line, 1 a little open, 2 open wide.
function mouth(p: Paint, k: number) {
  const y = 34
  if (k === 0) {
    for (let x = c - 2; x <= c + 2; x++) p.set(x, y, mix(SKIN[0], C(0x300c0c), 0.6))
    p.set(c, y + 1, SKIN[1])
    return
  }
  p.box(c - 2, y, c + 3, y + 1 + k, (x, yy) => (yy === y && k === 2 && x > c - 2 && x < c + 2 ? C(0xd8ccb8) : C(0x200808)))
  p.set(c, y + 1 + k, SKIN[1])
}

// Eyes shut.
function blink(p: Paint) {
  for (const [o, i] of [[c - 6, c - 4], [c + 3, c + 5]] as const) {
    for (let x = o; x <= i; x++) {
      p.set(x, 26, SKIN[1])
      p.set(x, 27, SKIN[2])
    }
  }
}

const painted = new Map<string, Uint32Array>()

// The captain's portrait in the colour `color` (interface hex), scaled crisply to `size` pixels wide. While `talking`
// his mouth moves; he blinks unless `still`.
export function CollectorPortrait({ color, size = 72, talking = false, still = false }: { color: string; size?: number; talking?: boolean; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const talk = useRef(talking)
  talk.current = talking
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    let base = painted.get(color)
    if (!base) painted.set(color, (base = paint(color)))
    const image = ctx.createImageData(PW, PH)
    const out = new Uint32Array(image.data.buffer)
    const p = new Paint(out, PW, PH)
    const draw = (t: number) => {
      out.set(base!)
      const b = t % 5.2
      if (b < 0.14) blink(p)
      if (talk.current) mouth(p, [1, 2, 0, 1, 2, 1, 0][Math.floor(t * 8) % 7])
      ctx.putImageData(image, 0, 0)
    }
    draw(0)
    if (still || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let last = -1
    const start = performance.now()
    const loop = (now: number) => {
      const f = Math.floor((now - start) / 70)
      if (f !== last) {
        last = f
        draw(f * 0.07)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [color, still])
  return <canvas ref={ref} width={PW} height={PH} aria-hidden style={{ display: 'block', width: size, height: (size * PH) / PW, imageRendering: 'pixelated', flex: 'none' }} />
}
