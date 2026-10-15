import { FISH_H, FISH_LIMIT, FISH_STEP, FISH_ZONE, balance, castReadyAt, fishError, fishGame } from '@game/shared'
import type { FisherEntry, Resource } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { Section } from './primitives'
import type { HudData } from './tabs'

// The mysterious fisher's hut (CLAUDE.md §6.4): a cast of the line is a hard little game (keep the green catch zone on
// a darting fish until the bar fills), and what it brings up goes into the fisher's log.

const METRIC_NAMES = { gold: 'altını', food: 'yemeği', materials: 'yapı malzemesi', arms: 'savaş malzemesi', soldiers: 'askeri' } as const

export function describeCatch(e: FisherEntry) {
  if (e.kind === 'miss') return 'Balık kaçtı; olta boş döndü.'
  if (e.kind === 'bag') {
    const goods = Object.entries(e.goods)
      .map(([r, v]) => `${v} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`)
      .join(', ')
    return `Oltaya bir kese takıldı: ${goods}.`
  }
  return `Şişeden bir not çıktı: «${e.about} lordunun ${e.atLeast.toLocaleString('tr-TR')}'den fazla ${METRIC_NAMES[e.metric]} var gibi görünüyor.»`
}

const secs = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} dk ${Math.ceil((ms % 60_000) / 1000)} sn` : `${Math.ceil(ms / 1000)} sn`)

export function FisherPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  // The seed the server drew for this cast (the game is played from it), while the cast is on.
  const [seed, setSeed] = useState<number | null>(null)
  const [result, setResult] = useState<FisherEntry | null>(null)
  // The dialog opens at once on a cast; it waits there for the server's seed, and again for its verdict.
  const [open, setOpen] = useState(false)
  const [reeling, setReeling] = useState(false)
  const why = fishError(kingdom, now)
  const log = kingdom.fisherLog ?? []
  const close = () => {
    setOpen(false)
    setSeed(null)
    setResult(null)
    setReeling(false)
  }
  const cast = async () => {
    setResult(null)
    setSeed(null)
    setReeling(false)
    setOpen(true)
    const answer = await online?.act<{ seed: number }>({ type: 'cast' })
    // Refused (or no answer): nothing to play.
    if (answer) setSeed(answer.seed)
    else setOpen(false)
  }
  // The presses go to the server, which plays the cast again to decide the catch.
  const finish = async (toggles: number[]) => {
    setReeling(true)
    const entry = await online?.act<FisherEntry>({ type: 'fish', toggles })
    setReeling(false)
    setResult(entry ?? { at: Date.now(), kind: 'miss' })
  }
  return (
    <>
      <Section title="Balık tut" icon="food">
        <p className="hint">
          Kulübedeki tuhaf balıkçı oltasını sana veriyor. Basılı tut (fare, dokunma ya da boşluk tuşu) ve yeşil alanı kaçan balığın üstünde tut;
          çubuk dolarsa tutarsın. Bazen bir kese mal, bazen de bir şişe içinde başka bir lord hakkında bir not çıkar.
        </p>
        <button className="btn wide" disabled={why !== null || open} onClick={cast}>
          <span>
            <Icon name="food" size={16} /> Oltayı at
          </span>
          {why === 'busy' && <small>{secs(castReadyAt(kingdom) - now)} sonra</small>}
        </button>
      </Section>
      <Section title="Balıkçı günlüğü" icon="scroll" aside={`${log.length} kayıt`}>
        {log.length === 0 ? (
          <p className="hint">Henüz bir şey tutulmadı.</p>
        ) : (
          <ul className="fisher-log">
            {log.map((e) => (
              <li key={e.at} className={e.kind}>
                {e.kind === 'bottle' && <i style={{ background: KINGDOM_COLORS[e.color as KingdomColor]?.swatch ?? '#8a7a60' }} />}
                <span>{describeCatch(e)}</span>
                <small>{new Date(e.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {open && (
        <div className="modal" role="dialog" aria-labelledby="fishing-title">
          <section className="dialog frame fishing">
            <header className="sheet-head">
              <Icon name="food" size={32} />
              <div>
                <h2 id="fishing-title">Balık tut</h2>
                <small>Basılı tut: yeşil alan yükselir; bırak: düşer</small>
              </div>
            </header>
            {result ? (
              <div className="fishing-result">
                <p className={result.kind === 'miss' ? 'down' : 'up'}>{describeCatch(result)}</p>
                <button className="btn small" onClick={close}>
                  Tamam
                </button>
              </div>
            ) : seed === null || reeling ? (
              <p className="hint fishing-wait">{seed === null ? 'Olta suya atılıyor…' : 'Olta çekiliyor…'}</p>
            ) : (
              <FishingGame seed={seed} onDone={finish} />
            )}
          </section>
        </div>
      )}
    </>
  )
}

// The game (shared with the server, see fishGame): a tall water column, a fish darting up and down, the green catch
// zone that rises while held and sinks when let go, and a bar that fills while the fish is in the zone and drains
// while it is not. Played in fixed steps; the steps at which the button went down or up are what is sent.
function FishingGame({ seed, onDone }: { seed: number; onDone: (toggles: number[]) => void }) {
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
    const game = fishGame(seed)
    const toggles: number[] = []
    let pressed = false
    let last = performance.now()
    let carry = 0
    let frame = 0
    const H = FISH_H
    const draw = () => {
      const s = game.state
      ctx.fillStyle = '#1c3550'
      ctx.fillRect(0, 0, 40, H)
      for (let y = 6; y < H; y += 14) {
        ctx.fillStyle = '#25466a'
        ctx.fillRect(4 + ((y * 7) % 20), y, 8, 1)
      }
      ctx.fillStyle = s.inside ? '#7cd65a' : '#4f8c40'
      ctx.fillRect(2, Math.round(s.zone), 36, FISH_ZONE)
      ctx.fillStyle = '#e2c48a'
      ctx.fillRect(14, Math.round(s.fish) - 4, 12, 8)
      ctx.fillRect(10, Math.round(s.fish) - 2, 4, 4)
      ctx.fillStyle = '#1c1612'
      ctx.fillRect(22, Math.round(s.fish) - 2, 2, 2)
      ctx.fillStyle = '#120d0b'
      ctx.fillRect(48, 0, 12, H)
      ctx.fillStyle = s.progress > 0.66 ? '#7cd65a' : s.progress > 0.33 ? '#f2d16b' : '#e05a4a'
      const fill = Math.round(s.progress * H)
      ctx.fillRect(48, H - fill, 12, fill)
      ctx.fillStyle = '#5a5450'
      ctx.fillRect(66, 0, 4, H)
      ctx.fillStyle = '#c8952e'
      const left = Math.max(0, 1 - s.step / FISH_LIMIT)
      ctx.fillRect(66, H - Math.round(left * H), 4, Math.round(left * H))
    }
    const tick = (now: number) => {
      carry += Math.min(0.25, (now - last) / 1000)
      last = now
      while (carry >= FISH_STEP && !game.state.over) {
        if (held.current !== pressed) {
          pressed = held.current
          toggles.push(game.state.step)
        }
        game.advance(pressed)
        carry -= FISH_STEP
      }
      draw()
      if (game.state.over) {
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
  }, [seed])
  return (
    <div
      className="fishing-game"
      onPointerDown={(e) => ((held.current = true), e.currentTarget.setPointerCapture(e.pointerId))}
      onPointerUp={() => (held.current = false)}
      onPointerCancel={() => (held.current = false)}
    >
      <canvas ref={canvas} width={72} height={FISH_H} />
      <small className="hint">Bar dolarsa tutarsın, boşalırsa ya da süre biterse balık kaçar. {balance.economy.fishing.cooldownSeconds} sn'de bir olta atılabilir.</small>
    </div>
  )
}
