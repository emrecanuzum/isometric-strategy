import { balance, castReadyAt, fishError } from '@game/shared'
import type { FisherEntry, Resource } from '@game/shared'
import { useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { BoardDialog, MiniBoard, RunResult } from './MiniGames'
import { fishingScene } from './minigames/fishing'
import { Stage } from './minigames/Stage'
import { Section } from './primitives'
import type { HudData } from './tabs'
import { usePlayingFlag } from './minigames/playing'

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

// `hall`: shown in the entertainment hall, which keeps a pond and the same strange fisher (CLAUDE.md §6.5).
export function FisherPanel({ data, hall = false }: { data: HudData; hall?: boolean }) {
  const { kingdom, now, online } = data
  // The seed the server drew for this cast (the game is played from it), while the cast is on.
  const [seed, setSeed] = useState<number | null>(null)
  // What the catch brought, with its score on the fishing leaderboard (CLAUDE.md §6.5).
  const [result, setResult] = useState<(FisherEntry & { score?: number }) | null>(null)
  const [board, setBoard] = useState(false)
  // The dialog opens at once on a cast; it waits there for the server's seed, and again for its verdict.
  const [open, setOpen] = useState(false)
  usePlayingFlag(open)
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
    const entry = await online?.act<FisherEntry & { score?: number }>({ type: 'fish', toggles })
    setReeling(false)
    setResult(entry ?? { at: Date.now(), kind: 'miss' })
  }
  return (
    <>
      <Section title="Balık tut" icon="food">
        <p className="hint">
          {hall ? 'Eğlence merkezinin havuz başındaki tuhaf balıkçı' : 'Kulübedeki tuhaf balıkçı'} oltasını sana veriyor. Basılı tut (fare, dokunma ya da boşluk tuşu) ve yeşil alanı kaçan balığın üstünde tut;
          çubuk dolarsa tutarsın. Bazen bir kese mal, bazen de bir şişe içinde başka bir lord hakkında bir not çıkar.
        </p>
        <div className="minigame-actions">
          <button className="btn wide" disabled={why !== null || open} onClick={cast}>
            <span>
              <Icon name="food" size={16} /> Oltayı at
            </span>
            {why === 'busy' && <small>{secs(castReadyAt(kingdom) - now)} sonra</small>}
          </button>
          {online && (
            <button className="btn" onClick={() => setBoard(true)}>
              <Icon name="star" size={16} /> Sıralama
            </button>
          )}
        </div>
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
          <section className="dialog frame minigame">
            <header className="sheet-head">
              <Icon name="food" size={32} />
              <div>
                <h2 id="fishing-title">Balık tut</h2>
                <small>Basılı tut: yeşil alan yükselir; bırak: düşer</small>
              </div>
            </header>
            {result ? (
              <RunResult game="fishing" score={result.score ?? 0}>
                <p className={result.kind === 'miss' ? 'down' : 'up'}>{describeCatch(result)}</p>
                {online && result.kind !== 'miss' && <MiniBoard lobby={online.lobby.id} game="fishing" compact />}
                <button className="btn small" onClick={close}>
                  Tamam
                </button>
              </RunResult>
            ) : seed === null || reeling ? (
              <p className="hint fishing-wait">{seed === null ? 'Olta suya atılıyor…' : 'Olta çekiliyor…'}</p>
            ) : (
              <>
                <Stage seed={seed} scene={fishingScene} onDone={finish} />
                <small className="hint">
                  Bar dolarsa tutarsın, boşalırsa ya da süre biterse balık kaçar. {balance.economy.fishing.cooldownSeconds} sn'de bir olta atılabilir.
                </small>
              </>
            )}
          </section>
        </div>
      )}
      {board && online && <BoardDialog lobby={online.lobby.id} first="fishing" onClose={() => setBoard(false)} />}
    </>
  )
}
