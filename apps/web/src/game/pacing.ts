import { Ticker } from 'pixi.js'

// Frame pacing for the map (CLAUDE.md §12). The map is drawn at the display's full rate only while the player is
// moving it (dragging, zooming, the wheel, a glide); otherwise a few times less often, since what moves by itself
// (walkers, animals, ships, clouds, swaying trees) moves slowly. A hidden tab draws nothing, and a window over the map
// (a `.modal`) lets it tick slowly behind. Power saving lowers every rate.

// Frames a second: [normal, power saving].
const RATES = {
  // Being dragged or zoomed, or just after.
  active: [60, 30],
  // Still, close enough that walkers and animals are drawn (½× and nearer).
  near: [30, 20],
  // Still and zoomed far out: clouds, ships and armies drift slowly.
  far: [20, 12],
  // No input for a long while.
  deep: [15, 10],
  // A window covers the map.
  covered: [10, 6],
} as const
// How long after the last input the map stays at the full rate.
const ACTIVE_MS = 1500
// How long without input before the map slows to the deep idle rate.
const DEEP_MS = 90_000
// Slack for the display's own frames: half a 120 Hz frame, so a 60 Hz screen steps every frame at 60 fps and every
// other one at 30.
const SLACK_MS = 4
// How often the page is looked over for a window covering the map.
const COVER_CHECK_MS = 750

export interface Pacer {
  // Something moved the map or is about to: draw at the full rate for a moment.
  wake(): void
  setSaver(on: boolean): void
  // Frames drawn in the last whole second (for measuring).
  fps(): number
  destroy(): void
}

export function createPacer(ticker: Ticker, near: () => boolean): Pacer {
  ticker.stop()
  // Pixi's own system ticker (texture clean-up, and the pointer-over checks that replay a still pointer's move) would
  // keep a frame loop of its own running at the display's rate: it steps with the map instead.
  const system = Ticker.system
  system.autoStart = false
  system.stop()
  let saver = false
  let lastInput = performance.now()
  let last = 0
  let raf = 0
  let covered = false
  let coverAt = 0
  let counted = 0
  let second = 0
  let shown = 0
  const rate = (now: number) => {
    const k = saver ? 1 : 0
    if (now - lastInput < ACTIVE_MS) return RATES.active[k]
    if (now - coverAt > COVER_CHECK_MS) {
      coverAt = now
      covered = document.querySelector('.modal') !== null
    }
    if (covered) return RATES.covered[k]
    const idle = near() ? RATES.near[k] : RATES.far[k]
    return now - lastInput > DEEP_MS ? Math.min(idle, RATES.deep[k]) : idle
  }
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (now - last < 1000 / rate(now) - SLACK_MS) return
    last = now
    counted++
    if (now - second >= 1000) {
      shown = counted
      counted = 0
      second = now
    }
    system.update(now)
    ticker.update(now)
  }
  const start = () => {
    if (raf) return
    last = 0
    raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }
  const onVisibility = () => {
    if (document.hidden) stop()
    else {
      lastInput = performance.now()
      start()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)
  if (!document.hidden) start()
  return {
    wake() {
      lastInput = performance.now()
    },
    setSaver(on) {
      saver = on
    },
    fps: () => shown,
    destroy() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
