import { useEffect, useRef } from 'react'
import { ramp } from '../../game/sprites'
import { C, Paint, tone } from '../artKit'
import { frame, paintScene } from './menuScene'
import type { Scene } from './menuScene'
import './home.css'

// The main menu's backdrop (CLAUDE.md §11): the panorama of menuScene.ts on a canvas as large as the screen in art
// pixels, shown nearest-neighbour at a whole number of device pixels per art pixel. The painting is made once (again
// only when the screen's size in art pixels changes); what moves is redrawn twelve times a second, never while the
// tab is hidden, and not at all for those who asked for less motion.

const FPS = 12

// Device pixels per art pixel: the painting is ~290 art pixels tall (and at least ~240 wide on a phone).
function measure() {
  const dpr = window.devicePixelRatio || 1
  const vw = Math.max(1, window.innerWidth) * dpr
  const vh = Math.max(1, window.innerHeight) * dpr
  const scale = Math.max(2, Math.round(Math.min(vh / 290, vw / 240)))
  return { dpr, scale, w: Math.ceil(vw / scale), h: Math.ceil(vh / scale) }
}

export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let scene: Scene | null = null
    let image: ImageData | null = null
    let raf = 0
    let last = 0
    let resizeTimer = 0
    let paintTimer = 0
    const start = performance.now()

    const draw = (now: number) => {
      if (!scene || !image) return
      frame(scene, still.matches ? 0 : (now - start) / 1000, new Uint32Array(image.data.buffer))
      ctx.putImageData(image, 0, 0)
    }
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / FPS - 2) return
      last = now
      draw(now)
    }
    const run = () => {
      cancelAnimationFrame(raf)
      raf = 0
      if (!scene) return
      draw(performance.now())
      if (!still.matches && !document.hidden) raf = requestAnimationFrame(loop)
    }
    const build = () => {
      const m = measure()
      canvas.style.width = `${(m.w * m.scale) / m.dpr}px`
      canvas.style.height = `${(m.h * m.scale) / m.dpr}px`
      if (scene && scene.w === m.w && scene.h === m.h) return
      canvas.width = m.w
      canvas.height = m.h
      scene = paintScene(m.w, m.h)
      image = ctx.createImageData(m.w, m.h)
      canvas.classList.add('ready')
      run()
    }
    // Painting takes a moment: let the menu come up first.
    paintTimer = window.setTimeout(build, 0)
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(build, 200)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', run)
    still.addEventListener('change', run)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(paintTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', run)
      still.removeEventListener('change', run)
    }
  }, [])
  return (
    <div className="menu-backdrop" aria-hidden>
      <canvas ref={ref} />
    </div>
  )
}

// The title's crown: gold lit from the upper left, a velvet cap, pearls on its points, a ruby and two sapphires on its
// band, an ink outline; painted once.
const CW = 34
const CH = 25
const GOLDS = ramp(0x4a2c08, 0x7a5014, 0xa8781f, 0xd9aa3e, 0xf2d16b, 0xfff4c0)
const VELVET = ramp(0x2a0610, 0x48101c, 0x6a1a28, 0x8e2834)
const PEARL = ramp(0x8a8496, 0xc8c2c8, 0xf4f0ea, 0xffffff)
const RUBY = ramp(0x4a0410, 0x9a1020, 0xe0303a, 0xff9a90)
const SAPPHIRE = ramp(0x0a1440, 0x1c3a8a, 0x3c70d0, 0xa8d0ff)

function paintCrown(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(CW, CH)
  const px = new Uint32Array(img.data.buffer)
  const p = new Paint(px, CW, CH)
  const gold = (x: number, y: number, lift = 0) => tone(GOLDS, 4.2 - (x / CW) * 2.4 + lift, x, y)
  // The velvet cap behind the points.
  p.disc(17, 13, 11, 8, (x, y) => tone(VELVET, 3 - (x / CW) * 2 - (y < 8 ? -0.4 : 0), x, y))
  // Five points, the middle one tallest, each crowned with a pearl.
  const points: [number, number, number][] = [[5, 9, 4], [11, 7, 4], [17, 4, 5], [23, 7, 4], [29, 9, 4]]
  for (const [x, tip, half] of points) {
    p.poly([x - half, 16, x + half, 16, x, tip], (px2, py2) => gold(px2, py2, px2 < x ? 0.5 : -0.6))
    p.set(x, tip + 1, GOLDS[5])
  }
  for (const [x, tip] of points) {
    p.disc(x, tip - 1, 1.6, 1.6, (px2, py2) => tone(PEARL, 3 - (px2 - x + py2 - tip + 2) * 0.8, px2, py2))
  }
  p.rect(16, 0, 2, 4, GOLDS[4])
  p.rect(15, 1, 4, 1, GOLDS[4])
  p.set(16, 0, GOLDS[5])
  // The band: a bright upper lip, a dark lower one, jewels set in it.
  p.box(3, 15, 32, 22, (x, y) => (y === 15 ? tone(GOLDS, 5, x, y) : y === 21 ? GOLDS[1] : gold(x, y, y === 16 ? 0.4 : 0)))
  const jewel = (cx: number, cy: number, rx: number, ry: number, r: ArrayLike<number>) => {
    p.disc(cx, cy, rx + 0.8, ry + 0.8, GOLDS[1])
    p.disc(cx, cy, rx, ry, (x, y) => tone(r, 2.6 - (x - cx + y - cy + 1) * 0.9, x, y))
    p.set(Math.floor(cx - rx * 0.4), Math.floor(cy - ry * 0.4), r[3])
  }
  jewel(17, 18.5, 2.4, 1.8, RUBY)
  jewel(9.5, 18.5, 1.5, 1.5, SAPPHIRE)
  jewel(24.5, 18.5, 1.5, 1.5, SAPPHIRE)
  for (const x of [5, 13, 21, 29]) p.set(x, 18, PEARL[2])
  // The ink outline round everything.
  const ink = C(0x120d0b)
  const solid = px.slice()
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (solid[y * CW + x]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx
        const yy = y + dy
        return xx >= 0 && yy >= 0 && xx < CW && yy < CH && solid[yy * CW + xx]
      })
      if (near) px[y * CW + x] = ink
    }
  }
  ctx.putImageData(img, 0, 0)
}

export function MenuCrown() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) paintCrown(ref.current)
  }, [])
  return (
    <span className="menu-crown" aria-hidden>
      <canvas ref={ref} width={CW} height={CH} />
      <i className="menu-glint" />
    </span>
  )
}
