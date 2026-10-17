import { BUDGET_PER_WINDOW, MAX_SCORE, MINI_GAMES, balance, budgetBackAt, budgetLeft, gameError, gameReadyAt, gameReward, gameStars } from '@game/shared'
import type { ArcadeGame, MiniGame, Resource, Stock } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { supabase } from '../../lib/supabase'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { anvilScene } from './minigames/anvil'
import { archeryScene } from './minigames/archery'
import { box, oval } from './minigames/art'
import { caravanScene } from './minigames/caravan'
import { harvestScene } from './minigames/harvest'
import { netScene } from './minigames/net'
import { Stage } from './minigames/Stage'
import type { Scene } from './minigames/Stage'
import { woodsplitScene } from './minigames/woodsplit'
import { Section } from './primitives'
import type { HudData } from './tabs'
import './minigames.css'
import { usePlayingFlag } from './minigames/playing'

// The mini-games (CLAUDE.md §6.5): the archery butts at the barracks, the anvil at the forge, the caravan road at the
// trade post, the chopping block at the lumber camp, the harvest at the farm, the net at the dock (and the fisher's
// hut, in Fishing.tsx). The window opens at once and waits for the server's seed; the run is played in fixed steps on
// a stage (minigames/Stage.tsx), and only the steps at which the button went down or up go back. The server plays it
// again and its score is the one that counts, for the reward and for the leaderboards.

const MG = balance.minigames

export const GAME_NAMES: Record<MiniGame, string> = {
  fishing: 'Balık tutma',
  archery: 'Okçuluk',
  anvil: 'Örs başında',
  caravan: 'Kervan yolu',
  woodsplit: 'Odun yarma',
  harvest: 'Hasat',
  net: 'Ağ çekme',
}
export const GAME_ICONS: Record<MiniGame, IconName> = { fishing: 'food', archery: 'bow', anvil: 'arms', caravan: 'trade', woodsplit: 'materials', harvest: 'sun', net: 'anchor' }
const GAME_PLACES: Record<MiniGame, string> = {
  fishing: 'Esrarengiz balıkçı kulübesi',
  archery: 'Kışladaki atış meydanı',
  anvil: 'Silah atölyesindeki örs',
  caravan: 'Ticaret noktasındaki kervan yolu',
  woodsplit: 'Oduncu kampındaki kütük',
  harvest: 'Tarladaki hasat',
  net: 'İskeledeki balık ağı',
}
const GAME_RULES: Record<ArcadeGame, string> = {
  archery:
    'Yay nişangâhı hedefin üstünde gezinir. Basılı tut: yay gerilir ve nişan bir süre sakinleşir, sonra kol titremeye başlar. Bırakınca ok çıkar. Her okun rüzgârı onu yana taşır; rüzgâra karşı nişan al. Altı ok, ortaya ne kadar yakınsa o kadar puan.',
  anvil:
    'Demircinin işaretleri kızgın demirin üstünde çekice doğru kayar. Her işaret çekicin altına geldiği an vur (bas). Tam zamanında vuruş 5, biraz erken ya da geç 3, daha uzak 1 puan; boşa vuruş bir puan götürür. Art arda vuruşlar her vuruşa ek puan katar.',
  caravan:
    'Tüccarın devesi kayan yolda yürür. Basılı tutunca deve yolun yukarısına çıkar, bırakınca aşağı süzülür. Altınları ve ara sıra çıkan mücevherleri topla, kayalardan kaç: kayaya takılan deve topladığından kaybeder.',
  woodsplit:
    'Kütüğün yanında güç göstergesi iner çıkar. Gösterge kütüğün yeşil bandına gelince bas, balta iner: bandın altın ortası temiz yarar (5), yeşili iyi yarar (3); bandın üstü fazla serttir (1), altında balta sıkışır (0). Sert kütüklerin bandı yüksek ve dardır, budaklılar iki kat puan getirir. Art arda iyi vuruşlar ek puan katar. On iki kütük.',
  harvest:
    'Orakçı tarlada yürür, başaklar önünden geçer. Basılı tut: tırpan biçer; altından geçen her başağı keser. Olgun başak 1, altın demet 5 puan; ham (yeşil) başak 2, üstüne karga konmuş başak 5 puan götürür. Biçmek yorar: güç biterse orakçı biraz dinlenmeden biçemez. Kaçırılan olgun başak seriyi bozar.',
  net:
    'Balıkçılar dolu ağı sudan çeker. Basılı tut: ip gerilir, bırak: gevşer. Ağ yalnızca gerginlik yeşil banttayken çekilince yükselir; çok gevşekse balıklar kaçmaya başlar, kırmızıya taşarsa ağ yırtılır ve iki balık kaçar. Balıklar ara sıra çırpınıp ipi sertçe çeker. Çıkan her ağ balık başına 2 puan, hiç yırtılmadıysa 4 puan daha getirir. Beş ağ ya da 30 saniye.',
}

// Every game's stage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SCENES: Record<ArcadeGame, Scene<any>> = {
  archery: archeryScene,
  anvil: anvilScene,
  caravan: caravanScene,
  woodsplit: woodsplitScene,
  harvest: harvestScene,
  net: netScene,
}

export const secs = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} dk ${Math.ceil((ms % 60_000) / 1000)} sn` : `${Math.ceil(ms / 1000)} sn`)
const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'
export const rewardText = (reward: Partial<Stock>) =>
  Object.entries(reward)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([r, v]) => `${v} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`)
    .join(', ')

// ---- The result of a run: the medal, the stars, the score -------------------------------------------------------------

const MEDALS = ['Madalyasız', 'Bronz madalya', 'Gümüş madalya', 'Altın madalya']
const MEDAL_RAMPS = [
  ['#3a3440', '#5a5260', '#7a7280', '#9a92a0'],
  ['#5a2e14', '#8a4a20', '#b86a34', '#e09a5a'],
  ['#4a4a56', '#7a7a88', '#a8a8b6', '#e0e0ea'],
  ['#6a4410', '#a8741c', '#e0a830', '#fff0a0'],
]

// A medal on its ribbon, drawn in pixels (the stars it was won with).
function Medal({ stars }: { stars: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!
    ctx.clearRect(0, 0, 32, 40)
    const r = MEDAL_RAMPS[stars]
    // The ribbon.
    for (let y = 0; y < 16; y++) {
      box(ctx, y % 4 < 2 ? '#a8342e' : '#7a2224', 9 + Math.round(y * 0.25), y, 5, 1)
      box(ctx, y % 4 < 2 ? '#3c5a96' : '#2a3c6a', 18 - Math.round(y * 0.25), y, 5, 1)
    }
    // The disc, lit from the top left, with a star struck in it.
    oval(ctx, '#14101a', 16, 26, 11, 11)
    oval(ctx, r[1], 16, 26, 10, 10)
    oval(ctx, r[2], 15, 25, 8, 8)
    oval(ctx, r[1], 16, 26, 6, 6)
    oval(ctx, r[2], 16, 26, 5, 5)
    for (const [x, y] of [
      [15, 21],
      [16, 21],
      [14, 23],
      [15, 23],
      [16, 23],
      [17, 23],
      [12, 24],
      [13, 24],
      [14, 24],
      [15, 24],
      [16, 24],
      [17, 24],
      [18, 24],
      [19, 24],
      [14, 25],
      [15, 25],
      [16, 25],
      [17, 25],
      [14, 26],
      [17, 26],
      [13, 27],
      [18, 27],
    ])
      box(ctx, r[3], x, y + 1, 1, 1)
    box(ctx, '#ffffff', 10, 21, 2, 1)
    box(ctx, '#ffffff', 10, 22, 1, 2)
  }, [stars])
  return <canvas ref={ref} width={32} height={40} className={stars > 0 ? 'minigame-medal' : 'minigame-medal none'} />
}

export function RunResult({ game, score, best, children }: { game: MiniGame; score: number; best?: number; children?: ReactNode }) {
  const stars = gameStars(game, score)
  const top = MAX_SCORE[game]
  return (
    <div className="minigame-result">
      <div className="minigame-award">
        <Medal stars={stars} />
        <div>
          <div className="minigame-stars" aria-label={`${stars} yıldız`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < stars ? 'lit' : undefined} style={{ animationDelay: `${0.15 + i * 0.25}s` }}>
                <Icon name="star" size={32} />
              </span>
            ))}
          </div>
          <small>{MEDALS[stars]}</small>
        </div>
      </div>
      <p className="minigame-score">
        Puan <b>{score}</b>
        {top ? <small> / {top}</small> : null}
      </p>
      {best !== undefined && score > 0 && score >= best && <p className="minigame-record">Yeni rekorun!</p>}
      {children}
    </div>
  )
}

// ---- The panel in the building's menu ------------------------------------------------------------------------------

interface Outcome {
  score: number
  reward: Partial<Stock>
  earned?: Partial<Stock>
  best: number
  budgetLeft?: number
}

export function GamePanel({ game, data }: { game: ArcadeGame; data: HudData }) {
  const { kingdom, now, online } = data
  const [seed, setSeed] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [open, setOpen] = useState(false)
  usePlayingFlag(open)
  const [scoring, setScoring] = useState(false)
  const [board, setBoard] = useState(false)
  const why = gameError(kingdom, game, now)
  const best = kingdom.minigames?.[game]?.best ?? 0
  const left = Math.floor(budgetLeft(kingdom, now))
  const back = budgetBackAt(kingdom, now)
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
  const most = rewardText(gameReward(game, MAX_SCORE[game] ?? 1000))
  const given = outcome ? rewardText(outcome.reward) : ''
  const cut = outcome?.earned && rewardText(outcome.earned) !== given
  return (
    <>
      <Section title={GAME_NAMES[game]} icon={GAME_ICONS[game]} aside={best > 0 ? `en iyin ${best}` : undefined}>
        <p className="hint">{GAME_RULES[game]}</p>
        <p className="hint">
          Puana göre ödül: en fazla {most}. {Math.round(MG.cooldownSeconds / 60)} dakikada bir oynanır. Bütün mini oyunlar birlikte saatte en fazla {BUDGET_PER_WINDOW} altın değerinde ödül verir
          (mallar olağan fiyatından sayılır); bu saat kalan: <b>{left}</b>
          {left <= 0 && back ? `, ${secs(back - now)} sonra yeniden ödül verir` : ''}.
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
                <small>{GAME_PLACES[game]}</small>
              </div>
            </header>
            {outcome ? (
              <RunResult game={game} score={outcome.score} best={outcome.best}>
                <p className={given ? 'up' : 'down'}>
                  {given ? `Kazandın: ${given}.` : outcome.score > 0 ? 'Bu saatin ödül hakkı dolmuş; puanın sıralamaya yazıldı.' : 'Bu sefer bir şey kazanamadın.'}
                </p>
                {cut && given && <p className="hint">Saatlik ödül hakkı yüzünden {rewardText(outcome.earned!)} yerine bu kadar.</p>}
                {online && <MiniBoard lobby={online.lobby.id} game={game} compact />}
                <button className="btn small" onClick={close}>
                  Tamam
                </button>
              </RunResult>
            ) : seed === null || scoring ? (
              <p className="hint fishing-wait">{seed === null ? 'Hazırlanıyor…' : 'Puan hesaplanıyor…'}</p>
            ) : (
              <Stage seed={seed} scene={SCENES[game]} onDone={finish} />
            )}
          </section>
        </div>
      )}
      {board && online && <BoardDialog lobby={online.lobby.id} first={game} onClose={() => setBoard(false)} />}
    </>
  )
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
