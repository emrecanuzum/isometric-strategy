import { useEffect, useRef } from 'react'

// A small moving picture of a battle over the battle view (CLAUDE.md §9.7): the two sides in their colours, as many
// figures as their soldiers allow, clashing in the middle; a wall and a gate on the defenders' side in a siege, arrows
// when there are archers, stones when there are catapults. Each round's dead fall and stay down; when it is over the
// winners raise their arms and the beaten fall back. Drawn on a small canvas at pixel scale.

export interface SceneSide {
  soldiers: number
  start: number
  color: string
  archers: boolean
  catapults: boolean
  // The lord leads it himself: he stands behind the line under his banner, crowned.
  king?: boolean
}

const W = 160
const H = 52
const GROUND = 40
const MAX_FIGURES = 12

const figuresOf = (n: number) => (n <= 0 ? 0 : Math.min(MAX_FIGURES, Math.max(1, Math.ceil(n / 3))))

export function BattleScene({ attackers, defenders, siege, round, over, winner }: { attackers: SceneSide; defenders: SceneSide; siege: boolean; round: number; over: boolean; winner: 'attackers' | 'defenders' }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ attackers, defenders, siege, round, over, winner })
  state.current = { attackers, defenders, siege, round, over, winner }
  // When each round began, for its burst of sparks.
  const roundAt = useRef<{ round: number; at: number }>({ round, at: performance.now() })
  if (roundAt.current.round !== round) roundAt.current = { round, at: performance.now() }

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), w, h)
    }
    // A soldier facing `dir` (1 right, -1 left) at its feet, its weapon at `swing` (0 up … 1 down); `down` lies dead.
    const soldier = (x: number, y: number, dir: number, color: string, swing: number, down = false) => {
      if (down) {
        px(x - 3, y - 2, 6, 2, '#3a3036')
        px(x + 3 * dir - 1, y - 2, 2, 2, '#c8a07a')
        return
      }
      px(x - 1, y - 1, 1, 1, '#1c1612')
      px(x + 1, y - 1, 1, 1, '#1c1612')
      px(x - 1, y - 6, 3, 5, color)
      px(x, y - 7, 1, 1, '#c8a07a')
      px(x - 1, y - 9, 3, 2, '#a8b0bc')
      // The spear, swinging forward as it strikes.
      const tip = { x: x + dir * (2 + Math.round(swing * 4)), y: y - 12 + Math.round(swing * 7) }
      px(x + dir, y - 6, 1, 1, '#7a5834')
      px(tip.x, tip.y, 1, 1, '#e6ebf0')
      px((x + dir + tip.x) / 2, (y - 6 + tip.y) / 2, 1, 1, '#7a5834')
    }
    const draw = (now: number) => {
      const s = state.current
      const t = still ? 0 : now / 1000
      // Sky and ground.
      px(0, 0, W, GROUND, '#1e2638')
      px(0, GROUND, W, H - GROUND, '#3f5a2c')
      for (let x = 0; x < W; x += 6) px(x + ((x * 7) % 4), GROUND + 3 + ((x * 13) % 6), 2, 1, '#4f6a34')
      // The wall and gate on the defenders' side.
      const wallX = W - 40
      if (s.siege) {
        px(wallX, GROUND - 26, 10, 26, '#868290')
        for (let y = GROUND - 26; y < GROUND; y += 4) px(wallX, y, 10, 1, '#6a6672')
        for (let x = wallX; x < wallX + 10; x += 4) px(x, GROUND - 29, 2, 3, '#868290')
        px(wallX + 3, GROUND - 12, 4, 12, '#5a3e24')
      }
      const sides = [
        { side: s.attackers, dir: 1, home: 12, front: s.siege ? wallX - 14 : W / 2 - 8, won: s.over && s.winner === 'attackers' },
        { side: s.defenders, dir: -1, home: W - 12, front: s.siege ? wallX + 16 : W / 2 + 8, won: s.over && s.winner === 'defenders' },
      ]
      for (const { side, dir, home, front, won } of sides) {
        const total = figuresOf(side.start)
        const alive = figuresOf(side.soldiers)
        const lost = s.over && !won
        for (let i = 0; i < total; i++) {
          const rank = Math.floor(i / 3)
          const file = i % 3
          // Ranks stand back from the front line, files staggered down the field; the living step in and out as they
          // fight.
          const sway = still || s.over ? 0 : Math.sin(t * 3 + i * 1.7) * 2
          const retreat = lost ? Math.min(20, (now / 60) % 40) : 0
          const x = front - dir * (rank * 7 + file * 2) + dir * sway - dir * retreat
          const y = GROUND + file * 4
          const dead = i >= alive
          if (dead) {
            soldier(home + dir * (6 + ((i * 13) % 30)), GROUND + 10 + (i % 2) * 2, dir, side.color, 0, true)
            continue
          }
          const swing = won ? 0 : (Math.sin(t * 6 + i * 2.1) + 1) / 2
          soldier(x, y, dir, side.color, still ? 0.5 : swing)
          // Winners raise their spears.
          if (won && Math.floor(t * 2 + i) % 2 === 0) px(x, y - 14, 1, 2, '#e6ebf0')
        }
        // The lord behind his line: a crowned figure in a purple cloak beside a tall banner (gone if he lost and fled).
        if (side.king) {
          const kx = front - dir * 26 - dir * (lost ? Math.min(20, (now / 60) % 40) : 0)
          const ky = GROUND + 4
          px(kx - 1, ky - 1, 1, 1, '#1c1612')
          px(kx + 1, ky - 1, 1, 1, '#1c1612')
          px(kx - 2, ky - 7, 5, 6, '#6a3a8c')
          px(kx - 1, ky - 7, 3, 2, '#e8c44a')
          px(kx, ky - 9, 1, 2, '#c8a07a')
          px(kx - 1, ky - 11, 3, 2, '#e8c44a')
          px(kx - 1, ky - 12, 1, 1, '#ffe27a')
          px(kx + 1, ky - 12, 1, 1, '#ffe27a')
          const pole = kx - dir * 4
          px(pole, ky - 20, 1, 20, '#7a5834')
          const wave = still ? 0 : Math.round(Math.sin(t * 4))
          px(dir > 0 ? pole - 6 : pole + 1, ky - 20 + wave, 6, 4, side.color)
          px(dir > 0 ? pole - 4 : pole + 2, ky - 19 + wave, 2, 2, '#e8c44a')
          if (won && Math.floor(t * 2) % 2 === 0) px(kx + dir * 2, ky - 14, 1, 3, '#e6ebf0')
        }
        // Arrows arcing over the line.
        if (side.archers && !s.over && !still) {
          for (let k = 0; k < 3; k++) {
            const p = (t * 0.8 + k / 3) % 1
            const ax = front - dir * 22 + dir * p * 44
            const ay = GROUND - 12 - Math.sin(p * Math.PI) * 18
            px(ax, ay, 2, 1, '#e2c48a')
          }
        }
        // Catapult stones flying at the wall.
        if (side.catapults && s.siege && !s.over && !still && dir > 0) {
          const p = (t * 0.5) % 1
          const sx = 12 + p * (wallX - 12)
          const sy = GROUND - 8 - Math.sin(p * Math.PI) * 28
          px(sx, sy, 3, 3, '#a8a4ac')
          if (p > 0.92) px(wallX - 3, GROUND - 22 + Math.round(Math.random() * 6), 4, 4, '#e0641c')
          px(6, GROUND - 3, 9, 3, '#5a3e24')
          px(8, GROUND - 9, 1, 6, '#7a5834')
        }
      }
      // A burst of sparks where the lines meet at the start of each round.
      const since = (now - roundAt.current.at) / 1000
      if (!s.over && since < 0.8 && !still) {
        const mid = s.siege ? wallX - 4 : W / 2
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2
          const r = since * 20
          px(mid + Math.cos(a) * r, GROUND - 10 + Math.sin(a) * r * 0.6, 1, 1, k % 2 ? '#ffb040' : '#e05a4a')
        }
      }
      if (!still) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvas} className="battle-scene" width={W} height={H} aria-hidden />
}
