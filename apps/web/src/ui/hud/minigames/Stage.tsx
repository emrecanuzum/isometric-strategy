import { MINI_STEP } from '@game/shared'
import { useEffect, useRef } from 'react'
import { play } from '../../../audio/sfx'
import { Fx, H, W, box, checker, hudScore, hudTime, text } from './art'

// The stage every mini-game is played on (CLAUDE.md §6.5): a short countdown, the run in fixed steps (60 a second, the
// same as on the server), a moment for the last blow to land, then the presses go back. The scene draws the picture
// from the run's state; its effects (sparks, shakes, floating numbers) never touch the run.

export interface Frame {
  // Seconds since the stage opened, and since the last frame.
  t: number
  dt: number
  fx: Fx
  phase: 'intro' | 'play' | 'outro'
}

export interface Scene<S extends { step: number; over: boolean }> {
  make: (seed: number) => { state: S; advance: (held: boolean) => S }
  // A fresh drawer for a run (it may keep what it saw last frame, to spark effects off what changed).
  create: () => (ctx: CanvasRenderingContext2D, s: S, f: Frame) => void
  // For the standard heads-up display: the score so far and the share of time left.
  score?: (s: S) => number
  left: (s: S) => number
  // What the button does, shown under the countdown.
  controls: string
}

const INTRO = 2.4
const OUTRO = 1.1

export function Stage<S extends { step: number; over: boolean }>({ seed, scene, onDone }: { seed: number; scene: Scene<S>; onDone: (toggles: number[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const held = useRef(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && ((held.current = true), e.preventDefault())
    const up = (e: KeyboardEvent) => e.code === 'Space' && (held.current = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    const ctx = canvas.current!.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const run = scene.make(seed)
    const draw = scene.create()
    const fx = new Fx()
    const toggles: number[] = []
    let pressed = false
    let phase: Frame['phase'] = 'intro'
    let phaseT = 0
    let t = 0
    let last = performance.now()
    let carry = 0
    let frame = 0
    let shown = 0
    let pulse = 0
    let lastScore = 0
    let beat = -1
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      t += dt
      phaseT += dt
      if (phase === 'intro') {
        const n = Math.floor(phaseT / (INTRO / 3))
        if (n !== beat && n < 3) {
          beat = n
          play('tick')
        }
        if (phaseT >= INTRO) {
          phase = 'play'
          phaseT = 0
          play('go')
        }
      } else if (phase === 'play') {
        carry += Math.min(0.25, dt)
        while (carry >= MINI_STEP && !run.state.over) {
          if (held.current !== pressed) {
            pressed = held.current
            toggles.push(run.state.step)
          }
          run.advance(pressed)
          carry -= MINI_STEP
        }
        if (run.state.over) {
          phase = 'outro'
          phaseT = 0
          play('good')
        }
      } else if (phaseT >= OUTRO) {
        doneRef.current(toggles)
        return
      }
      fx.update(dt)
      const f: Frame = { t, dt, fx, phase }
      const [ox, oy] = fx.offset()
      ctx.save()
      ctx.translate(ox, oy)
      draw(ctx, run.state, f)
      fx.drawParticles(ctx)
      ctx.restore()
      fx.drawFloats(ctx)
      // The heads-up display: time left and the score ticking up to the run's.
      hudTime(ctx, phase === 'intro' ? 1 : scene.left(run.state), t)
      if (scene.score) {
        const score = scene.score(run.state)
        if (score !== lastScore) {
          pulse = 0.18
          lastScore = score
        }
        shown += (score - shown) * Math.min(1, dt * 10)
        if (Math.abs(score - shown) < 0.5) shown = score
        pulse = Math.max(0, pulse - dt)
        hudScore(ctx, shown, pulse)
      }
      fx.drawFlash(ctx)
      if (phase === 'intro') {
        checker(ctx, '#14101a', 0, 0, W, H)
        const n = 3 - Math.floor(phaseT / (INTRO / 3))
        const k = (phaseT % (INTRO / 3)) / (INTRO / 3)
        text(ctx, n > 0 ? `${n}` : 'Başla!', W / 2, H / 2 - 22 - Math.round((1 - k) * 4), { align: 'center', size: k < 0.15 ? 36 : 30, color: '#f2d16b' })
        box(ctx, '#14101a', 40, H / 2 + 14, W - 80, 16)
        box(ctx, '#3a2a1c', 41, H / 2 + 15, W - 82, 14)
        text(ctx, scene.controls, W / 2, H / 2 + 17, { align: 'center', size: 9 })
      } else if (phase === 'play' && phaseT < 0.5) {
        text(ctx, 'Başla!', W / 2, H / 2 - 22 - Math.round(phaseT * 20), { align: 'center', size: 30, color: '#f2d16b', alpha: 1 - phaseT * 2 })
      } else if (phase === 'outro') {
        const k = Math.min(1, phaseT * 5)
        checker(ctx, '#14101a', 0, Math.round(H / 2 - 18), W, 34)
        text(ctx, 'Bitti!', W / 2 - Math.round((1 - k) * 60), H / 2 - 16, { align: 'center', size: 26, color: '#fff4c0' })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [seed, scene])
  return (
    <div
      className="minigame-play"
      onPointerDown={(e) => ((held.current = true), e.currentTarget.setPointerCapture(e.pointerId))}
      onPointerUp={() => (held.current = false)}
      onPointerCancel={() => (held.current = false)}
    >
      <canvas ref={canvas} width={W} height={H} style={{ aspectRatio: `${W} / ${H}` }} />
      <small className="hint">Fare, dokunma ya da boşluk tuşu.</small>
    </div>
  )
}
