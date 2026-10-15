import {
  ANVIL_TRAVEL,
  ANVIL_LIMIT,
  ARCHERY_FIELD,
  ARCHERY_LIMIT,
  CARAVAN_H,
  CARAVAN_LIMIT,
  CARAVAN_W,
  MAX_SCORE,
  MINI_GAMES,
  MINI_STEP,
  anvilGame,
  archeryGame,
  balance,
  caravanGame,
  gameError,
  gameReadyAt,
  gameReward,
} from '@game/shared'
import type { AnvilState, ArcadeGame, ArcheryState, CaravanState, MiniGame, Playable, Resource, Run, Stock } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { supabase } from '../../lib/supabase'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { Section } from './primitives'
import type { HudData } from './tabs'
import './minigames.css'

// The mini-games (CLAUDE.md §6.5): the archery butts at the barracks, the anvil at the forge, the caravan road at the
// trade post (and the fisher's hut, in Fishing.tsx). The window opens at once and waits for the server's seed; the run
// is played in fixed steps, and only the steps at which the button went down or up go back. The server plays it again
// and its score is the one that counts, for the reward and for the leaderboards.

const MG = balance.minigames

export const GAME_NAMES: Record<MiniGame, string> = { fishing: 'Balık tutma', archery: 'Okçuluk', anvil: 'Örs başında', caravan: 'Kervan yolu' }
export const GAME_ICONS: Record<MiniGame, IconName> = { fishing: 'food', archery: 'bow', anvil: 'arms', caravan: 'trade' }
const GAME_PLACES: Record<MiniGame, string> = {
  fishing: 'Esrarengiz balıkçı kulübesi',
  archery: 'Kışladaki atış meydanı',
  anvil: 'Silah atölyesindeki örs',
  caravan: 'Ticaret noktasındaki kervan yolu',
}
const GAME_RULES: Record<ArcadeGame, string> = {
  archery:
    'Yay nişangâhı hedefin üstünde gezinir. Basılı tut: yay gerilir ve nişan bir süre sakinleşir, sonra kol titremeye başlar. Bırakınca ok çıkar. Her okun rüzgârı onu yana taşır; rüzgâra karşı nişan al. Altı ok, ortaya ne kadar yakınsa o kadar puan.',
  anvil:
    'Demircinin işaretleri kızgın demirin üstünde çekice doğru kayar. Her işaret çekicin altına geldiği an vur (bas). Tam zamanında vuruş 5, biraz erken ya da geç 3, daha uzak 1 puan; boşa vuruş bir puan götürür. Art arda vuruşlar her vuruşa ek puan katar.',
  caravan:
    'Tüccarın devesi kayan yolda yürür. Basılı tutunca deve yolun yukarısına çıkar, bırakınca aşağı süzülür. Altınları ve ara sıra çıkan mücevherleri topla, kayalardan kaç: kayaya takılan deve topladığından kaybeder.',
}
const GAME_CONTROLS: Record<ArcadeGame, string> = {
  archery: 'Basılı tut: yayı ger · bırak: oku at',
  anvil: 'İşaret çekicin altına gelince bas',
  caravan: 'Basılı tut: yukarı · bırak: aşağı',
}

const secs = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} dk ${Math.ceil((ms % 60_000) / 1000)} sn` : `${Math.ceil(ms / 1000)} sn`)
const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'
const rewardText = (reward: Partial<Stock>) =>
  Object.entries(reward)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([r, v]) => `${v} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`)
    .join(', ')

// ---- The panel in the building's menu ------------------------------------------------------------------------------

interface Outcome {
  score: number
  reward: Partial<Stock>
  best: number
}

export function GamePanel({ game, data }: { game: ArcadeGame; data: HudData }) {
  const { kingdom, now, online } = data
  const [seed, setSeed] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [open, setOpen] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [board, setBoard] = useState(false)
  const why = gameError(kingdom, game, now)
  const best = kingdom.minigames?.[game]?.best ?? 0
  const close = () => {
    setOpen(false)
    setSeed(null)
    setOutcome(null)
    setScoring(false)
  }
  const start = async () => {
    setOutcome(null)
    setSeed(null)
    setScoring(false)
    setOpen(true)
    const answer = await online?.act<{ seed: number }>({ type: 'play', game })
    if (answer) setSeed(answer.seed)
    else setOpen(false)
  }
  const finish = async (toggles: number[]) => {
    setScoring(true)
    const result = await online?.act<Outcome>({ type: 'played', game, toggles })
    setScoring(false)
    setOutcome(result ?? { score: 0, reward: {}, best })
  }
  // What the best possible score would bring, for the description.
  const top = MAX_SCORE[game]
  const most = rewardText(gameReward(game, top ?? 1000))
  return (
    <>
      <Section title={GAME_NAMES[game]} icon={GAME_ICONS[game]} aside={best > 0 ? `en iyin ${best}` : undefined}>
        <p className="hint">{GAME_RULES[game]}</p>
        <p className="hint">
          Puana göre ödül: en fazla {most}. {Math.round(MG.cooldownSeconds / 60)} dakikada bir oynanır.
        </p>
        <div className="minigame-actions">
          <button className="btn wide" disabled={why !== null || open || !online} onClick={start}>
            <span>
              <Icon name={GAME_ICONS[game]} size={16} /> Oyna
            </span>
            {why === 'busy' && <small>{secs(gameReadyAt(kingdom, game) - now)} sonra</small>}
          </button>
          {online && (
            <button className="btn" onClick={() => setBoard(true)}>
              <Icon name="star" size={16} /> Sıralama
            </button>
          )}
        </div>
      </Section>
      {open && (
        <div className="modal" role="dialog" aria-labelledby="minigame-title">
          <section className="dialog frame minigame">
            <header className="sheet-head">
              <Icon name={GAME_ICONS[game]} size={32} />
              <div>
                <h2 id="minigame-title">{GAME_NAMES[game]}</h2>
                <small>{GAME_CONTROLS[game]}</small>
              </div>
            </header>
            {outcome ? (
              <div className="fishing-result">
                <p className="minigame-score">
                  Puan <b>{outcome.score}</b>
                  {top ? <small> / {top}</small> : null}
                </p>
                <p className={outcome.score > 0 ? 'up' : 'down'}>
                  {outcome.score > 0 ? `Kazandın: ${rewardText(outcome.reward) || 'bir şey çıkmadı'}.` : 'Bu sefer bir şey kazanamadın.'}
                  {outcome.score > 0 && outcome.score >= outcome.best && ' Yeni rekorun!'}
                </p>
                {online && <MiniBoard lobby={online.lobby.id} game={game} compact />}
                <button className="btn small" onClick={close}>
                  Tamam
                </button>
              </div>
            ) : seed === null || scoring ? (
              <p className="hint fishing-wait">{seed === null ? 'Hazırlanıyor…' : 'Puan hesaplanıyor…'}</p>
            ) : game === 'archery' ? (
              <GameCanvas seed={seed} make={archeryGame} draw={drawArchery} size={ARCHERY_FIELD} onDone={finish} />
            ) : game === 'anvil' ? (
              <GameCanvas seed={seed} make={anvilGame} draw={drawAnvil} size={[200, 100]} onDone={finish} />
            ) : (
              <GameCanvas seed={seed} make={caravanGame} draw={drawCaravan} size={[CARAVAN_W, CARAVAN_H]} onDone={finish} />
            )}
          </section>
        </div>
      )}
      {board && online && <BoardDialog lobby={online.lobby.id} first={game} onClose={() => setBoard(false)} />}
    </>
  )
}

// ---- The game loop -------------------------------------------------------------------------------------------------

// Plays a run in fixed steps on a small canvas (scaled up, pixels kept sharp): the button is the pointer on the canvas
// or the space bar; the steps at which it went down or up are what is sent when the run is over.
function GameCanvas<S extends Run>({
  seed,
  make,
  draw,
  size,
  onDone,
}: {
  seed: number
  make: (seed: number) => Playable<S>
  draw: (ctx: CanvasRenderingContext2D, s: S, w: number, h: number) => void
  size: [number, number]
  onDone: (toggles: number[]) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const held = useRef(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const [w, h] = size
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === 'Space' && ((held.current = true), e.preventDefault())
    const up = (e: KeyboardEvent) => e.code === 'Space' && (held.current = false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    const ctx = canvas.current!.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const run = make(seed)
    const toggles: number[] = []
    let pressed = false
    let last = performance.now()
    let carry = 0
    let frame = 0
    const tick = (now: number) => {
      carry += Math.min(0.25, (now - last) / 1000)
      last = now
      while (carry >= MINI_STEP && !run.state.over) {
        if (held.current !== pressed) {
          pressed = held.current
          toggles.push(run.state.step)
        }
        run.advance(pressed)
        carry -= MINI_STEP
      }
      draw(ctx, run.state, w, h)
      if (run.state.over) {
        doneRef.current(toggles)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [seed, make, draw, w, h])
  return (
    <div
      className="minigame-play"
      onPointerDown={(e) => ((held.current = true), e.currentTarget.setPointerCapture(e.pointerId))}
      onPointerUp={() => (held.current = false)}
      onPointerCancel={() => (held.current = false)}
    >
      <canvas ref={canvas} width={w} height={h} style={{ aspectRatio: `${w} / ${h}` }} />
      <small className="hint">Fare, dokunma ya da boşluk tuşu.</small>
    </div>
  )
}

// ---- Drawing (plain rectangles, a pixel at a time) ------------------------------------------------------------------

const px = (ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}
const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#f3e6c8', align: CanvasTextAlign = 'left') => {
  // Numbers in Tiny5, words in Pixelify Sans (it has the Turkish letters; see fonts.ts).
  ctx.font = /^[\dx]+$/.test(text) ? '8px Tiny5, monospace' : '9px "Pixelify Sans", monospace'
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#1c1612'
  ctx.fillText(text, x + 1, y + 1)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}
// A bar of time left along the top.
const timeBar = (ctx: CanvasRenderingContext2D, w: number, left: number) => {
  px(ctx, '#1c1612', 0, 0, w, 3)
  px(ctx, '#c8952e', 0, 0, Math.round(w * Math.max(0, left)), 2)
}

// The butts: a straw target in rings on a stand, in a meadow; the wandering aim, the wind flag, the arrows stuck.
const RINGS = ['#f2f0e6', '#2a2420', '#3d6fb8', '#c8402e', '#f2d16b']
let targetArt: HTMLCanvasElement | null = null
function target() {
  if (targetArt) return targetArt
  const R = Math.ceil(balance.minigames.archery.pointsPerArrow * balance.minigames.archery.pixelsPerPoint) + 3
  const c = document.createElement('canvas')
  c.width = c.height = R * 2 + 1
  const g = c.getContext('2d')!
  const ring = (balance.minigames.archery.pointsPerArrow * balance.minigames.archery.pixelsPerPoint) / RINGS.length
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = Math.sqrt(x * x + y * y)
      if (d > R) continue
      // The straw rim outside the rings, dithered.
      const color = d > R - 3 ? ((x + y) & 1 ? '#c9a45a' : '#a8843e') : RINGS[Math.min(RINGS.length - 1, Math.floor((R - 3 - d) / ring))]
      g.fillStyle = color
      g.fillRect(x + R, y + R, 1, 1)
    }
  targetArt = c
  return c
}

function drawArchery(ctx: CanvasRenderingContext2D, s: ArcheryState, w: number, h: number) {
  const cx = Math.round(w / 2)
  const cy = Math.round(h / 2) + 4
  // Meadow and the far hedge.
  px(ctx, '#5f8f3e', 0, 0, w, h)
  for (let y = 0; y < h; y += 2) for (let x = (y / 2) % 4; x < w; x += 4) px(ctx, '#6c9c47', x, y)
  px(ctx, '#3e6a2c', 0, 10, w, 6)
  for (let x = 0; x < w; x += 3) px(ctx, '#4d7a35', x, 9 + (x % 2))
  // The stand and the target.
  px(ctx, '#6b4a2a', cx - 18, cy + 10, 3, h - cy - 10)
  px(ctx, '#6b4a2a', cx + 15, cy + 10, 3, h - cy - 10)
  const t = target()
  ctx.drawImage(t, cx - (t.width >> 1), cy - (t.height >> 1))
  // The arrows that landed.
  for (const hit of s.hits) {
    const x = cx + Math.round(hit.x)
    const y = cy + Math.round(hit.y)
    px(ctx, '#1c1612', x, y, 1, 1)
    px(ctx, '#8a6a3e', x + 1, y + 1, 1, 1)
    px(ctx, '#8a6a3e', x + 2, y + 2, 1, 1)
    px(ctx, '#e8e2d0', x + 3, y + 2, 1, 2)
    px(ctx, '#e8e2d0', x + 2, y + 3, 2, 1)
  }
  // The arrow in flight, shrinking towards the target.
  if (s.arrow) {
    const k = s.arrow.t / balance.minigames.archery.flightSeconds
    const x = cx + s.arrow.x
    const y = cy + s.arrow.y + k * 30
    const size = 1 + Math.round(k * 4)
    px(ctx, '#e8e2d0', x - (size >> 1), y - (size >> 1), size, size)
  }
  // The aim: a cross, white while steady, red as the arm trembles.
  const ax = cx + Math.round(s.x)
  const ay = cy + Math.round(s.y)
  const trembling = s.drawing && s.drawn >= balance.minigames.archery.steadySeconds
  const aim = !s.drawing ? '#f3e6c8' : trembling ? '#e05a4a' : '#7cd65a'
  px(ctx, '#1c1612', ax - 5, ay - 1, 11, 3)
  px(ctx, '#1c1612', ax - 1, ay - 5, 3, 11)
  px(ctx, aim, ax - 4, ay, 3, 1)
  px(ctx, aim, ax + 2, ay, 3, 1)
  px(ctx, aim, ax, ay - 4, 1, 3)
  px(ctx, aim, ax, ay + 2, 1, 3)
  // The wind: a pennant on a pole, its length the strength.
  px(ctx, '#3a2a1a', 6, 18, 1, 16)
  const len = Math.round(Math.abs(s.wind) / 2)
  const dir = Math.sign(s.wind) || 1
  for (let i = 0; i < len; i++) px(ctx, i % 4 < 2 ? '#c8402e' : '#f2f0e6', 7 + (dir > 0 ? i : -i + 12), 18 + (i >> 3), 1, Math.max(1, 4 - (i >> 2)))
  label(ctx, `Rüzgâr ${s.wind > 0 ? '→' : s.wind < 0 ? '←' : ''} ${Math.abs(s.wind)}`, 6, 36)
  // Arrows left and the score.
  const left = balance.minigames.archery.arrows - s.shot
  for (let i = 0; i < left; i++) px(ctx, '#e8e2d0', w - 8 - i * 4, h - 12, 1, 8)
  label(ctx, `${s.score}`, w - 6, 6, '#f2d16b', 'right')
  // How long the bow is drawn.
  if (s.drawing) {
    const steadyFor = balance.minigames.archery.steadySeconds
    px(ctx, '#1c1612', 6, h - 8, 40, 4)
    px(ctx, trembling ? '#e05a4a' : '#7cd65a', 7, h - 7, Math.min(38, Math.round((s.drawn / steadyFor) * 38)), 2)
  }
  timeBar(ctx, w, 1 - s.step / ARCHERY_LIMIT)
}

// The anvil: a glowing bar of iron across the anvil, the marks sliding to the hammer, sparks on a good blow.
const GRADE_NAMES = ['Boşa', 'Kusursuz!', 'İyi', 'Zayıf', 'Kaçtı']
const GRADE_COLORS = ['#a89a88', '#f2d16b', '#7cd65a', '#e0a050', '#e05a4a']
function drawAnvil(ctx: CanvasRenderingContext2D, s: AnvilState, w: number, h: number) {
  const hitX = 44
  const lineY = 58
  px(ctx, '#1a1210', 0, 0, w, h)
  // The forge's glow behind.
  for (let y = 0; y < h; y += 2) for (let x = (y >> 1) % 3; x < 40; x += 3) px(ctx, y > 50 ? '#5a2a14' : '#2a1a14', x, y)
  px(ctx, '#e0702e', 6, 70, 22, 6)
  px(ctx, '#f2d16b', 10 + ((s.step >> 3) % 3), 71, 10, 3)
  // The anvil.
  px(ctx, '#4a4a52', 30, lineY + 3, 150, 8)
  px(ctx, '#6a6a74', 30, lineY + 3, 150, 2)
  px(ctx, '#3a3a40', 60, lineY + 11, 90, 8)
  px(ctx, '#4a4a52', 50, lineY + 19, 110, 6)
  // The hot iron.
  px(ctx, '#8a2a14', 30, lineY - 1, 170, 4)
  px(ctx, '#e0702e', 30, lineY, 170, 2)
  // The marks coming in.
  s.notes.forEach((n, i) => {
    const x = hitX + ((n - s.step) / ANVIL_TRAVEL) * (w - hitX)
    if (x < 26 || x > w + 2) return
    const g = s.grades[i]
    if (g > 0 && s.step - n > 12) return
    const color = g === 0 ? '#fff2a8' : g === -1 ? '#5a3a30' : GRADE_COLORS[g]
    px(ctx, '#1c1612', x - 2, lineY - 6, 5, 11)
    px(ctx, color, x - 1, lineY - 5, 3, 9)
  })
  // The hammer: down for a few steps after a blow.
  const struck = s.last && s.step - s.last.step < 8
  const hy = struck ? lineY - 22 : lineY - 34
  px(ctx, '#6b4a2a', hitX + 6, hy + 2, 18, 3)
  px(ctx, '#2a2a30', hitX - 4, hy - 4, 10, 14)
  px(ctx, '#5a5a64', hitX - 4, hy - 4, 10, 3)
  // The strike line.
  px(ctx, '#f3e6c8', hitX, lineY - 9, 1, 3)
  // Sparks and the word on the last blow.
  if (s.last && s.step - s.last.step < 24) {
    const age = s.step - s.last.step
    const g = s.last.grade
    if (g === 1 || g === 2)
      for (let i = 0; i < 9; i++) {
        const dx = ((i * 37) % 17) - 8
        const dy = -((i * 23) % 11) - 2
        px(ctx, i % 2 ? '#f2d16b' : '#fff2a8', hitX + dx * (age / 6), lineY + dy * (age / 7) + age * age * 0.02)
      }
    label(ctx, GRADE_NAMES[g === -1 ? 4 : g], hitX + 16, 14, GRADE_COLORS[g === -1 ? 4 : g])
  }
  label(ctx, `${s.score}`, w - 6, 6, '#f2d16b', 'right')
  if (s.combo >= 2) label(ctx, `x${s.combo}`, w - 6, 16, '#e0a050', 'right')
  timeBar(ctx, w, 1 - s.step / ANVIL_LIMIT)
}

// The caravan road: sand scrolling by between grassy verges, the camel and its merchant, coins, gems and rocks.
function drawCaravan(ctx: CanvasRenderingContext2D, s: CaravanState, w: number, h: number) {
  const speed = balance.minigames.caravan.speed
  const shift = Math.floor((s.step * MINI_STEP * speed) % 8)
  px(ctx, '#d8b878', 0, 0, w, h)
  for (let y = 4; y < h - 4; y += 3) for (let x = ((y * 5) % 8) - shift; x < w; x += 8) px(ctx, '#c9a464', x, y, 2, 1)
  px(ctx, '#6c9c47', 0, 0, w, 4)
  px(ctx, '#6c9c47', 0, h - 4, w, 4)
  for (let x = -shift; x < w; x += 4) {
    px(ctx, '#5f8f3e', x, 4, 2, 1)
    px(ctx, '#5f8f3e', x + 2, h - 5, 2, 1)
  }
  for (const t of s.things) {
    if (t.taken && t.kind !== 'rock') continue
    const x = Math.round(t.x)
    const y = Math.round(t.y)
    if (t.kind === 'coin') {
      px(ctx, '#8a6420', x - 2, y - 2, 5, 5)
      px(ctx, '#f2d16b', x - 1, y - 2, 3, 5)
      px(ctx, '#f2d16b', x - 2, y - 1, 5, 3)
      px(ctx, '#fff2a8', x - 1, y - 1, 1, 1)
    } else if (t.kind === 'gem') {
      px(ctx, '#2a6a8a', x - 1, y - 3, 3, 7)
      px(ctx, '#2a6a8a', x - 3, y - 1, 7, 3)
      px(ctx, '#7ad0e8', x - 1, y - 2, 3, 5)
      px(ctx, '#7ad0e8', x - 2, y - 1, 5, 3)
      px(ctx, '#f2fbff', x - 1, y - 1, 1, 1)
    } else {
      px(ctx, '#4a4440', x - 5, y - 2, 10, 6)
      px(ctx, '#6a625a', x - 4, y - 4, 7, 6)
      px(ctx, '#8a827a', x - 3, y - 4, 3, 2)
    }
  }
  // The camel (bobbing as it walks), its load and the merchant leading it.
  const cx = balance.minigames.caravan.camelX
  const cy = Math.round(s.y)
  const bob = (s.step >> 3) & 1
  const blink = s.stumble > 0 && (s.step >> 2) & 1
  if (!blink) {
    const body = '#b08048'
    const dark = '#7a5430'
    px(ctx, dark, cx - 7, cy + 2, 2, 5 - bob)
    px(ctx, dark, cx + 3, cy + 2, 2, 4 + bob)
    px(ctx, body, cx - 8, cy - 3, 14, 6)
    px(ctx, body, cx - 4, cy - 6, 6, 3)
    px(ctx, '#c8402e', cx - 5, cy - 5, 4, 3)
    px(ctx, '#3d6fb8', cx + 1, cy - 5, 3, 3)
    px(ctx, body, cx + 6, cy - 8, 2, 7)
    px(ctx, body, cx + 6, cy - 9, 5, 3)
    px(ctx, '#1c1612', cx + 9, cy - 8, 1, 1)
    px(ctx, '#1c1612', cx + 6, cy - 1, 1, 1)
  }
  label(ctx, `${s.score}`, w - 6, 7, '#5a3a10', 'right')
  timeBar(ctx, w, 1 - s.step / CARAVAN_LIMIT)
}

// ---- Leaderboards --------------------------------------------------------------------------------------------------

export interface BoardRow {
  rank: number
  name: string | null
  color: string | null
  username: string | null
  lobby_name: string | null
  score: number
  at: string
  mine: boolean
}

export type BoardScope = 'lobby' | 'all'

export async function loadBoard(lobby: string, game: MiniGame, scope: BoardScope): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc('minigame_board', { lobby, which: game, scope, size: MG.boardSize })
  if (error) throw error
  return (data ?? []) as BoardRow[]
}

// One game's board: this lobby's lords by their best run (the season), or every player's best in any lobby (all time).
// The player's own row is set apart, and shown below the top ten when it is not among them.
export function MiniBoard({ lobby, game, compact = false }: { lobby: string; game: MiniGame; compact?: boolean }) {
  const [scope, setScope] = useState<BoardScope>('lobby')
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setRows(null)
    setFailed(false)
    loadBoard(lobby, game, scope)
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [lobby, game, scope])
  const top = rows?.filter((r) => r.rank <= MG.boardSize) ?? []
  const own = rows?.find((r) => r.mine && r.rank > MG.boardSize)
  return (
    <div className={compact ? 'minigame-board compact' : 'minigame-board'}>
      <div className="minigame-scopes" role="tablist">
        <button role="tab" aria-selected={scope === 'lobby'} className="btn small" onClick={() => setScope('lobby')}>
          Bu sezon
        </button>
        <button role="tab" aria-selected={scope === 'all'} className="btn small" onClick={() => setScope('all')}>
          Tüm zamanlar
        </button>
      </div>
      {failed ? (
        <p className="hint">Sıralama yüklenemedi.</p>
      ) : rows === null ? (
        <p className="hint">Yükleniyor…</p>
      ) : top.length === 0 ? (
        <p className="hint">Henüz kimse puan almadı. İlk sen ol!</p>
      ) : (
        <ol className="chat-ranking minigame-ranks">
          {[...top, ...(own ? [own] : [])].map((r) => (
            <li key={`${r.rank}-${r.name}-${r.at}`} className={r.mine ? 'own' : undefined}>
              <div className="row">
                <span className="rank">{r.rank}.</span>
                <i style={{ background: swatch(r.color) }} />
                <span className="who">
                  <b style={{ color: `color-mix(in srgb, ${swatch(r.color)} 45%, #f3e6c8)` }}>{r.name ?? '?'}</b>
                  <small>
                    {r.mine ? 'sen' : (r.username ?? '—')}
                    {scope === 'all' && r.lobby_name ? ` · ${r.lobby_name}` : ''}
                  </small>
                </span>
                <strong>{r.score.toLocaleString('tr-TR')}</strong>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// Every game's board, one at a time (the chat's ranking tab and the game windows).
export function MiniBoards({ lobby, first = 'fishing' }: { lobby: string; first?: MiniGame }) {
  const [game, setGame] = useState<MiniGame>(first)
  return (
    <div className="minigame-boards">
      <div className="minigame-games" role="tablist" aria-label="Mini oyunlar">
        {MINI_GAMES.map((g) => (
          <button key={g} role="tab" aria-selected={game === g} className="btn small" onClick={() => setGame(g)} title={GAME_PLACES[g]}>
            <Icon name={GAME_ICONS[g]} size={16} /> {GAME_NAMES[g]}
          </button>
        ))}
      </div>
      <small className="hint">{GAME_PLACES[game]}</small>
      <MiniBoard lobby={lobby} game={game} />
    </div>
  )
}

export function BoardDialog({ lobby, first, onClose }: { lobby: string; first: MiniGame; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-labelledby="board-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog frame minigame">
        <header className="sheet-head">
          <Icon name="star" size={32} />
          <div>
            <h2 id="board-title">Mini oyun sıralaması</h2>
            <small>Her lordun en iyi puanı</small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        <MiniBoards lobby={lobby} first={first} />
      </section>
    </div>
  )
}
