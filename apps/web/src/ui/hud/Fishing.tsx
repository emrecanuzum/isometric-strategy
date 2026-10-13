import { balance, castReadyAt, fishError } from '@game/shared'
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
  return `Şişeden bir not çıktı: «${e.about} krallığının ${e.atLeast.toLocaleString('tr-TR')}'den fazla ${METRIC_NAMES[e.metric]} var gibi görünüyor.»`
}

const secs = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} dk ${Math.ceil((ms % 60_000) / 1000)} sn` : `${Math.ceil(ms / 1000)} sn`)

export function FisherPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<FisherEntry | null>(null)
  const why = fishError(kingdom, now)
  const log = kingdom.fisherLog ?? []
  const finish = async (caught: boolean) => {
    const entry = await online?.act<FisherEntry>({ type: 'fish', caught })
    setResult(entry ?? null)
  }
  return (
    <>
      <Section title="Balık tut" icon="food">
        <p className="hint">
          Kulübedeki tuhaf balıkçı oltasını sana veriyor. Basılı tut (fare, dokunma ya da boşluk tuşu) ve yeşil alanı kaçan balığın üstünde tut;
          çubuk dolarsa tutarsın. Bazen bir kese mal, bazen de bir şişe içinde başka bir krallık hakkında bir not çıkar.
        </p>
        <button className="btn wide" disabled={why !== null} onClick={() => (setResult(null), setPlaying(true))}>
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
      {playing && (
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
                <button className="btn small" onClick={() => (setPlaying(false), setResult(null))}>
                  Tamam
                </button>
              </div>
            ) : (
              <FishingGame onDone={finish} />
            )}
          </section>
        </div>
      )}
    </>
  )
}

// The game: a tall water column, a fish darting up and down, the green catch zone that rises while held and sinks
// when let go, and a bar that fills while the fish is in the zone and drains while it is not.
const H = 220
const ZONE = 44
const LIMIT_S = 25

function FishingGame({ onDone }: { onDone: (caught: boolean) => void }) {
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
    const s = { fish: H / 2, fishV: 0, target: H / 2, retarget: 0, zone: H - ZONE, zoneV: 0, progress: 0.3, start: performance.now(), last: performance.now(), over: false }
    let frame = 0
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000)
      s.last = now
      // The fish picks a new spot every so often, sometimes with a sudden dart.
      s.retarget -= dt
      if (s.retarget <= 0) {
        s.target = 10 + Math.random() * (H - 20)
        s.retarget = 0.4 + Math.random() * 0.9
      }
      const pull = (s.target - s.fish) * 9
      s.fishV += (pull - s.fishV * 2.5) * dt * (Math.random() < 0.02 ? 6 : 1)
      s.fish = Math.max(6, Math.min(H - 6, s.fish + s.fishV * dt))
      // The zone: lifted while held, pulled down by its weight, bouncing off the ends.
      s.zoneV += (held.current ? -560 : 420) * dt
      s.zone += s.zoneV * dt
      if (s.zone < 0) (s.zone = 0), (s.zoneV *= -0.3)
      if (s.zone > H - ZONE) (s.zone = H - ZONE), (s.zoneV *= -0.3)
      const inside = s.fish >= s.zone && s.fish <= s.zone + ZONE
      s.progress = Math.max(0, Math.min(1, s.progress + (inside ? 0.32 : -0.26) * dt))
      const elapsed = (now - s.start) / 1000
      // Draw: water, zone, fish, and the bar beside.
      ctx.fillStyle = '#1c3550'
      ctx.fillRect(0, 0, 40, H)
      for (let y = 6; y < H; y += 14) {
        ctx.fillStyle = '#25466a'
        ctx.fillRect(4 + ((y * 7) % 20), y, 8, 1)
      }
      ctx.fillStyle = inside ? '#7cd65a' : '#4f8c40'
      ctx.fillRect(2, Math.round(s.zone), 36, ZONE)
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
      const left = Math.max(0, 1 - elapsed / LIMIT_S)
      ctx.fillRect(66, H - Math.round(left * H), 4, Math.round(left * H))
      if (!s.over && (s.progress >= 1 || s.progress <= 0 || elapsed >= LIMIT_S)) {
        s.over = true
        doneRef.current(s.progress >= 1)
        return
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return (
    <div
      className="fishing-game"
      onPointerDown={(e) => ((held.current = true), e.currentTarget.setPointerCapture(e.pointerId))}
      onPointerUp={() => (held.current = false)}
      onPointerCancel={() => (held.current = false)}
    >
      <canvas ref={canvas} width={72} height={H} />
      <small className="hint">Bar dolarsa tutarsın, boşalırsa ya da süre biterse balık kaçar. {balance.economy.fishing.cooldownSeconds} sn'de bir olta atılabilir.</small>
    </div>
  )
}
