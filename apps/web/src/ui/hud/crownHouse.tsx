import { useEffect } from 'react'
import {
  balance,
  byPower,
  crownAgeOf,
  crownPower,
  crownRivalryAt,
  crownRivalryChanges,
  crownRivalryHistory,
  crownSuccessions,
  crownWays,
  patrolFavour,
  crownHouseAt,
  crownReigns,
  crownRelation,
  crownRest,
  crownRulerTitle,
  crownTitleOf,
  crownTraitSpec,
  crownYearOf,
  houseCrownRest,
  liegeSwitchError,
  relationBetween,
} from '@game/shared'
import type { CrownKey, CrownReign, CrownRivalry, CrownRoyal, CrownStance, Kingdom, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import type { Notice } from '../../net/online'
import { Portrait } from '../DynastyArt'
import { Icon } from '../icons'
import { NoticeArt } from '../NoticeArt'
import { EnvoyPortrait } from '../advisor/EnvoyPortrait'
import { playOnce } from '../../audio/sfx'
import { DialogFoot } from '../DialogQueue'
import { SkillBars } from './dynasty'
import { Meter, Section, Stat, fmt } from './primitives'
import { relationTermsIn } from './online'
import type { Online } from './online'

// The crowns' royal houses and the lord's standing at their courts (CLAUDE.md §7.8): the reigning ruler, the consort,
// the children and the line of succession, the rulers before; the crown's view of the lord and why; its lords. The
// houses follow from the lobby's number and the clock (crownHouse.ts), so nothing here is fetched. Also the news of a
// succession (told from the browser, once per reign) and the offer to go over to the rival crown after a betrayal
// (CLAUDE.md §9.1.1).

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`
const years = (p: Pick<CrownRoyal, 'bornAt'>, at: number) => Math.floor(crownAgeOf(p, at))
export const crownKeyOf = (k: Pick<Kingdom, 'lobbyKey' | 'seasonStart'>): CrownKey => ({ lobbyKey: k.lobbyKey, seasonStart: k.seasonStart })
const seedOf = (key: CrownKey, crown: number, p: CrownRoyal) => ((key.lobbyKey ?? 0) % 100_000) * 7 + crown * 104_729 + p.id * 977

const traitName = (p: CrownRoyal) => crownTraitSpec(p.trait).name
// What a trait does, in a few words.
function traitNote(p: CrownRoyal) {
  const t = crownTraitSpec(p.trait)
  const parts: string[] = []
  if (t.tribute !== 1) parts.push(`haraççıları hazinenin %${(balance.cities.crown.patrol.tribute.share * t.tribute * 100).toFixed(1).replace('.', ',').replace(',0', '')}'ini ister`)
  if (t.tip !== 1) parts.push(`devriyesi ${t.tip > 1 ? 'daha çok' : 'daha az'} bahşiş bırakır (×${t.tip.toFixed(2).replace('.', ',')})`)
  return parts.length > 0 ? parts.join(', ') : 'tacın işlerine dokunmaz'
}

const roleOf = (p: CrownRoyal, ruler = false): 'king' | 'queen' | 'prince' | 'princess' => (ruler ? (p.sex === 'm' ? 'king' : 'queen') : p.sex === 'm' ? 'prince' : 'princess')

// The royal family of a crown: the ruler, the consort, the children (the heir marked), the regent while one rules,
// the line of succession and the rulers before.
export function RoyalFamily({ world, kingdom, crown, now }: { world: World; kingdom: Kingdom; crown: number; now: number }) {
  const key = crownKeyOf(kingdom)
  const info = cityInfo(world, crown)
  const h = crownHouseAt(key, crown, now)
  const year = (at: number) => crownYearOf(key, at)
  const nextOfAge = h.regent ? Math.max(0, Math.ceil((h.regent.until - now) / 3_600_000)) : 0
  return (
    <Section title="Hanedan" icon="crown" aside={`${year(h.reign.from)}'den beri hüküm sürüyor`}>
      <div className="house">
        <div className="person">
          <Portrait seed={seedOf(key, crown, h.ruler)} sex={h.ruler.sex} age={crownAgeOf(h.ruler, now)} role={roleOf(h.ruler, true)} size={84} />
          <div>
            <b style={{ color: info.ink }}>{h.title}</b>
            <small>
              {years(h.ruler, now)} yaşında · huyu {traitName(h.ruler).toLocaleLowerCase('tr-TR')}
              {h.reign.kinsman ? ' · akrabalıktan tahta çağrıldı' : ''}
            </small>
            <SkillBars skills={h.ruler.skills} />
            <small className="hint">Huyu: {traitNote(h.ruler)}.</small>
          </div>
        </div>
        {h.consort ? (
          <div className="person">
            <Portrait seed={seedOf(key, crown, h.consort)} sex={h.consort.sex} age={crownAgeOf(h.consort, now)} role={h.consort.sex === 'f' ? 'queen' : 'prince'} size={84} />
            <div>
              <b>
                {h.consort.sex === 'f' ? 'Kraliçe' : 'Prens'} {h.consort.name}
              </b>
              <small>
                {years(h.consort, now)} yaşında · {h.ruler.sex === 'm' ? 'kralın eşi' : 'kraliçenin eşi'}
              </small>
              <SkillBars skills={h.consort.skills} />
            </div>
          </div>
        ) : (
          <p className="hint">{h.widowed ? `${crownTitleOf(h.ruler)} dul; eşini kaybetti.` : 'Hükümdarın eşi yok.'}</p>
        )}
      </div>
      {h.regent && (
        <p className="hint">
          {crownTitleOf(h.ruler)} henüz reşit değil: {h.regent.name ? `naip ${h.regent.name}` : 'naipler meclisi'} {nextOfAge} yıl daha onun adına yönetiyor.
        </p>
      )}
      <h4 className="house-title">Çocuklar</h4>
      {h.children.length === 0 ? (
        <p className="hint">Hükümdarın henüz çocuğu yok. Varisi yoksa taç hanedandan bir akrabaya geçer.</p>
      ) : (
        <ul className="ancestors">
          {h.children.map((c) => {
            const dead = c.deathAt <= now
            const place = h.line.findIndex((x) => x.id === c.id)
            return (
              <li key={c.id}>
                <Portrait seed={seedOf(key, crown, c)} sex={c.sex} age={crownAgeOf(c, dead ? c.deathAt : now)} role={c.sex === 'm' ? 'prince' : 'princess'} dead={dead} size={40} />
                <span>
                  {c.sex === 'm' ? 'Prens' : 'Prenses'} {c.name} · {dead ? `${years(c, c.deathAt)} yaşında öldü` : `${years(c, now)} yaşında`}
                  {place === 0 ? ' · veliaht' : place > 0 ? ` · tahtta ${place + 1}. sırada` : ''}
                  {!dead && crownAgeOf(c, now) < balance.cities.crown.house.comingOfAge ? ' · reşit değil' : ''} · {traitName(c).toLocaleLowerCase('tr-TR')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <h4 className="house-title">Önceki hükümdarlar</h4>
      <ul className="ancestors scroll3">
        {h.past.map((r) => (
          <li key={r.n}>
            <Portrait seed={seedOf(key, crown, r.ruler)} sex={r.ruler.sex} age={crownAgeOf(r.ruler, r.to)} role={r.ruler.sex === 'm' ? 'king' : 'queen'} dead size={40} />
            <span>
              {crownRulerTitle(r)} · {year(r.from)}–{year(r.to)} · {Math.floor(crownAgeOf(r.ruler, r.to))} yaşında öldü{r.regent ? ' · naiple başladı' : ''}
              {r.kinsman ? ' · akrabalıktan geldi' : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        Taç hanedanları da senin hanedanın gibi yaşlanır (bir gerçek saat bir yıl). Hükümdar ölünce en büyük oğlu, oğlu yoksa en büyük kızı tahta geçer; çocuğu yoksa hanedandan bir akraba
        çağrılır. Varis {balance.cities.crown.house.comingOfAge} yaşından küçükse reşit olana dek naip yönetir. Her hükümdarın bir huyu vardır; tacın haraççılarını ve devriyesini biraz değiştirir.
      </p>
    </Section>
  )
}

// What the crown thinks of the lord and why: where it rests (fealty, the house's ties) and how far it stands from it
// now (orders, quests, tribute, trade), drifting back each round; and the ruler's ways.
export function CrownCourt({ world, kingdom, crown, online, now }: { world: World; kingdom: Kingdom; crown: number; online: Online; now: number }) {
  const info = cityInfo(world, crown)
  const r = balance.cities.crown.relation
  const relation = crownRelation(kingdom, crown)
  const rest = crownRest(kingdom, crown)
  const house = houseCrownRest(kingdom.dynasty, crown, kingdom.liege)
  const sworn = kingdom.liege === crown
  const unsworn = kingdom.liege === undefined || kingdom.liege === null
  const fealty = unsworn ? 0 : sworn ? r.restSworn : r.restRival
  const off = relation - rest
  const perHour = r.driftPerRound * (3600 / balance.economy.productionSeconds)
  const word = relation >= 60 ? 'gözdesi' : relation >= 30 ? 'dostu' : relation >= 0 ? 'tarafsız' : relation >= -30 ? 'soğuk' : relation >= -50 ? 'kuşkulu' : 'düşmanı'
  const lords = online.kingdoms.filter((k) => k.liege === crown).sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
  const rival = online.kingdoms.filter((k) => k.liege !== undefined && k.liege !== null && k.liege !== crown)
  // Wars between this crown's lords and the rival crown's.
  const wars = online.pacts.filter((p) => p.kind === 'war' && !p.ended_at && ((lords.some((l) => l.id === p.from_id) && rival.some((l) => l.id === p.to_id)) || (lords.some((l) => l.id === p.to_id) && rival.some((l) => l.id === p.from_id))))
  const top = Math.max(1, ...lords.map((l) => l.score?.total ?? 0))
  return (
    <>
      <Section title="Sarayın sana bakışı" icon="crown" aside={`${signed(relation)} · ${word}`}>
        <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={`${info.name} ile ilişki`} segments={20} />
        <Stat label="Bağlılık" value={signed(fealty)} note={unsworn ? 'henüz biat etmedin' : sworn ? 'bu tacın lordusun' : 'rakip tacın lordusun'} />
        {house !== 0 && <Stat label="Hanedan bağları" value={signed(house)} note="devriyeyi yöneten kardeş, taca gelin giden prensesler" tone="up" />}
        <Stat label="Dinlenme değeri" value={signed(rest)} note={`ilişki zamanla buraya döner (saatte ~${Math.round(perHour)} puan)`} />
        <Stat label="Şu anki sapma" value={signed(off)} note={off >= 0 ? 'siparişler, görevler, ticaret ve armağanlarla kazandın' : 'reddedilen haraç ve istekler, kırgınlıklar'} tone={off >= 0 ? 'up' : 'down'} />
        <p className="hint">
          Artıranlar: tüccarı başkente göndermek (sefer başına +{r.cityTrip}), taç siparişleri, görevler ve kraliyet istekleri, kendi tacının devriyesini ağırlamak (+{r.visit}), rakip tacın
          haracını ödemek (+{r.tributePaid}). Azaltanlar: haracı reddetmek ({r.tributeRefused}), kraliyet isteğini geri çevirmek.
        </p>
      </Section>
      <Section title="Lordları" icon="banner" aside={`${lords.length} lord`}>
        {lords.length === 0 ? (
          <p className="hint">Bu tacın henüz lordu yok.</p>
        ) : (
          <ul className="crown-lords">
            {lords.map((l) => {
              const me = l.id === online.me
              const rel = me ? null : relationBetween(online.relations, online.me, l.id, now, relationTermsIn(online, online.me, l.id))
              return (
                <li key={l.id} className={me ? 'me' : undefined}>
                  <button className="link" onClick={() => !me && online.setFocus(l.id)} disabled={me} data-why="Bu senin lordluğun">
                    {l.name}
                    {me ? ' (sen)' : ''}
                  </button>
                  <i style={{ width: `${((l.score?.total ?? 0) / top) * 100}%`, background: info.color }} />
                  <small>
                    {fmt(l.score?.total ?? 0)} puan{rel !== null ? ` · seninle ${signed(rel)}` : ''}
                  </small>
                </li>
              )
            })}
          </ul>
        )}
        <p className="hint">
          {wars.length > 0
            ? `Bu tacın lordlarıyla rakip tacın lordları arasında ${wars.length} savaş sürüyor.`
            : 'İki tacın lordları arasında şu an savaş yok.'}{' '}
          İki taç şu an: {STANCE_NAMES[crownRivalryAt(crownKeyOf(kingdom), now).stance].toLocaleLowerCase('tr-TR')} (ayrıntısı Krallıklar sayfasında). Taçlar birbirinin lordlarından haraç ister, lordları rakip tacın lordlarıyla ittifak kuramaz.
        </p>
      </Section>
    </>
  )
}

// ---- The crowns' ways and their rivalry (CLAUDE.md §7.8) --------------------------------------------------------

export const STANCE_NAMES: Record<CrownStance, string> = { peace: 'Barış', tension: 'Gerginlik', war: 'Taç savaşı' }
const STANCE_ICONS = { peace: 'flower', tension: 'warn', war: 'swords' } as const
const times = (v: number) => `×${(Math.round(v * 100) / 100).toString().replace('.', ',')}`

// Why a crown asks more or less tribute, or tips more or less ("huyu açgözlü ×1,2 · taç savaşı ×1,25"); empty when
// nothing tilts it.
export function waysText(key: CrownKey, crown: number, at: number, what: 'tribute' | 'tip') {
  const w = crownWays(key, crown, at)
  const e = balance.cities.crown.rivalry.effects[w.rivalry.stance][what]
  const parts: string[] = []
  if (w.trait[what] !== 1) parts.push(`hükümdarı ${w.trait.name.toLocaleLowerCase('tr-TR')} ${times(w.trait[what])}`)
  if (e !== 1) parts.push(`${STANCE_NAMES[w.rivalry.stance].toLocaleLowerCase('tr-TR')} ${times(e)}`)
  return parts.join(' · ')
}

// The share of the treasury a crown's collectors ask now.
export const tributeShareNow = (key: CrownKey, crown: number, at: number) => balance.cities.crown.patrol.tribute.share * crownWays(key, crown, at).tribute
export const pctText = (v: number) => `%${(Math.round(v * 1000) / 10).toString().replace('.', ',')}`

// About what the crown's patrol tips at the house of entertainment now: the base, the crown's power, a brother at the
// patrol's head, the ruler's ways and the rivalry (the server's sum, patrols.ts).
export function tipPreview(kingdom: Kingdom, crown: number, online: Pick<Online, 'kingdoms'>, now: number) {
  const { share } = crownPower(online.kingdoms.map((k) => ({ liege: k.liege ?? null, score: k.score?.total ?? 0 })), 2)
  const favour = byPower(share[crown] ?? 0.5, balance.cities.crown.power.favour)
  return Math.round(balance.cities.crown.patrol.tip * favour * patrolFavour(kingdom).tip * crownWays(crownKeyOf(kingdom), crown, now).tip)
}

// The two crowns' stance now, how long it lasts, what it does, and the windows before.
export function CrownRivalryPanel({ world, kingdom, now }: { world: World; kingdom: Kingdom; now: number }) {
  if (world.cities.length < 2) return null
  const key = crownKeyOf(kingdom)
  const r = crownRivalryAt(key, now)
  const v = balance.cities.crown.rivalry
  const e = v.effects[r.stance]
  const names = [0, 1].map((i) => cityInfo(world, i))
  const left = Math.max(1, Math.ceil((r.until - now) / 60_000))
  const history = crownRivalryHistory(key, now, 6).slice(1)
  const winnerOf = (h: CrownRivalry) => (h.winner !== null ? names[h.winner].name : null)
  const sworn = kingdom.liege !== undefined && kingdom.liege !== null
  return (
    <Section title="Taçların rekabeti" icon={STANCE_ICONS[r.stance]} aside={`${STANCE_NAMES[r.stance]} · ${left} dk daha`}>
      <p className={r.stance === 'war' ? 'hint down' : 'hint'}>
        {r.stance === 'war'
          ? `${names[0].name} ile ${names[1].name} savaşta. Haraççılar daha çok ister, taçlar kendi lordlarını kollar.`
          : r.stance === 'tension'
            ? `${names[0].name} ile ${names[1].name} arasında gerginlik var: sınırlarda kılıçlar bileniyor.`
            : `${names[0].name} ile ${names[1].name} şimdilik barış içinde.`}
        {r.winner !== null && ` Son taç savaşını ${names[r.winner].name} kazandı.`}
      </p>
      <Stat label="Haraççıların istediği" value={times(e.tribute)} note={e.tribute === 1 ? 'olağan pay' : 'iki tacın haraççıları için'} tone={e.tribute > 1 ? 'down' : undefined} />
      <Stat label="Devriyenin bahşişi" value={times(e.tip)} note={e.tip === 1 ? 'olağan bahşiş' : 'taç kendi lordlarını kollar'} tone={e.tip > 1 ? 'up' : undefined} />
      {sworn && (
        <Stat label="Senden istenen haraç" value={pctText(tributeShareNow(key, kingdom.liege === 0 ? 1 : 0, now))} note={`rakip taç ${names[kingdom.liege === 0 ? 1 : 0].capital}: ${waysText(key, kingdom.liege === 0 ? 1 : 0, now, 'tribute') || 'olağan'}`} />
      )}
      <h4 className="house-title">Önceki dönemler</h4>
      <ul className="ancestors">
        {history.map((h) => (
          <li key={h.window}>
            <Icon name={STANCE_ICONS[h.stance]} size={16} />
            <span>
              {crownYearOf(key, h.from)} · {STANCE_NAMES[h.stance]}
              {winnerOf(h) ? ` (bitişinde ${winnerOf(h)} kazandı)` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        İki taç {Math.round(v.windowSeconds / 3600)} saatlik dönemlerde barış, gerginlik ya da savaş hâlindedir; hâl bir öncekine bağlıdır ve hükümdarların huyu savaş olasılığını
        kaydırır. Gerginlikte haraççılar hazinenin {times(v.effects.tension.tribute)}'i, savaşta {times(v.effects.war.tribute)}'i kadarını ister; savaşta devriyenin bahşişi{' '}
        {times(v.effects.war.tip)}. Savaş bitince hükümdarlarının askerlik yeteneği şansı kaydırır; kazanan tacın lordlarının o taçla ilişkisi +{v.victoryRelation} artar.
      </p>
    </Section>
  )
}

// ---- News of a succession ---------------------------------------------------------------------------------------------

const storeKey = (lobby: string, me: number) => `crown-told:${lobby}:${me}`
const readTold = (lobby: string, me: number): number => {
  try {
    return Number(localStorage.getItem(storeKey(lobby, me)) ?? 0) || 0
  } catch {
    return 0
  }
}
const writeTold = (lobby: string, me: number, at: number) => {
  try {
    localStorage.setItem(storeKey(lobby, me), String(Math.floor(at)))
  } catch {
    // Without storage the server's last-seen time still keeps the news from coming twice.
  }
}

// A notice for a succession, shown by the envoy like the server's news (its id below every journal id the app uses).
export function successionNotice(key: CrownKey, crown: number, reign: CrownReign, late: CrownReign, me: number): Notice {
  return {
    id: -(20_000_000 + crown * 100_000 + reign.n),
    kingdom_id: me,
    kind: 'crown_succession',
    payload: {
      crown,
      late: crownRulerTitle(late),
      lateAge: Math.floor(crownAgeOf(late.ruler, late.to)),
      ruler: crownRulerTitle(reign),
      trait: crownTraitSpec(reign.ruler.trait).name,
      welcome: crownTraitSpec(reign.ruler.trait).welcome,
      age: Math.floor(crownAgeOf(reign.ruler, reign.from)),
      regent: reign.regent ? reign.regent.name ?? true : null,
      kinsman: !!reign.kinsman,
      year: crownYearOf(key, reign.from),
    },
    show_at: new Date(reign.from).toISOString(),
    seen: false,
  }
}

// A change in the crowns' rivalry as a notice.
export function rivalryNotice(key: CrownKey, r: CrownRivalry, me: number): Notice {
  return {
    id: -(30_000_000 + (r.window % 1_000_000)),
    kingdom_id: me,
    kind: 'crown_rivalry',
    payload: { stance: r.stance, prev: r.prev, winner: r.winner, year: crownYearOf(key, r.from) },
    show_at: new Date(r.from).toISOString(),
    seen: false,
  }
}

// What befell the crowns after `from` up to `to`, oldest first: every succession and every change of their rivalry.
export function crownTimeline(key: CrownKey, crowns: number, from: number, to: number, me: number): Notice[] {
  const out: Notice[] = []
  for (let i = 0; i < crowns; i++) {
    const all = crownReigns(key, i, to)
    for (const r of crownSuccessions(key, i, from, to)) {
      const late = all[all.indexOf(r) - 1]
      if (late) out.push(successionNotice(key, i, r, late, me))
    }
  }
  if (crowns > 1) for (const r of crownRivalryChanges(key, from, to)) out.push(rivalryNotice(key, r, me))
  return out.sort((a, b) => Date.parse(a.show_at) - Date.parse(b.show_at))
}

// Whether a timeline notice pops up (a war begun or ended does; tension only goes in the journal).
const pops = (n: Notice) => n.kind === 'crown_succession' || (n.kind === 'crown_rivalry' && (n.payload.stance === 'war' || n.payload.prev === 'war'))

// The crowns' news not told yet. Nothing is stored on the server, yet every device agrees: what happened before the
// lord was last seen (the server's time, read as the game opened: `popFrom`) or before this browser last told it is
// not news; what happened while the lord was away is told by the away report instead (the app passes the report's
// close as `popFrom`). Of what is left only the latest succession of each crown and the latest war begun or ended pop
// up; everything after `journalFrom` goes in the journal.
export function crownNews(lobby: string, me: number, kingdom: Kingdom, crowns: number, journalFrom: number, popFrom: number, now: number): { show: Notice[]; journal: Notice[] } {
  const key = crownKeyOf(kingdom)
  const told = readTold(lobby, me)
  const from = Math.max(journalFrom, told)
  if (from >= now) return { show: [], journal: [] }
  const journal = crownTimeline(key, crowns, Math.max(from, now - 48 * 3_600_000), now, me)
  const fresh = journal.filter((n) => Date.parse(n.show_at) > Math.max(popFrom, told) && pops(n))
  const show: Notice[] = []
  for (let i = 0; i < crowns; i++) {
    const last = fresh.filter((n) => n.kind === 'crown_succession' && n.payload.crown === i).pop()
    if (last) show.push(last)
  }
  const war = fresh.filter((n) => n.kind === 'crown_rivalry').pop()
  if (war) show.push(war)
  writeTold(lobby, me, now)
  return { show: show.sort((a, b) => Date.parse(a.show_at) - Date.parse(b.show_at)), journal }
}

// ---- Going over to the rival crown (CLAUDE.md §9.1.1) ------------------------------------------------------------

// The offer still open (and answerable here): the liege crown backed the lord's pretender, who was beaten.
export const liveOffer = (kingdom: Kingdom, crowns: number, now: number) => (kingdom.liegeOffer && !liegeSwitchError(kingdom, now, crowns) ? kingdom.liegeOffer : null)

export function BetrayalDialog({ world, kingdom, online, now, onLater }: { world: World; kingdom: Kingdom; online: Online; now: number; onLater(): void }) {
  const offer = kingdom.liegeOffer!
  const from = cityInfo(world, offer.from)
  const to = cityInfo(world, offer.to)
  const s = balance.cities.crown.switch
  const minutes = Math.max(1, Math.ceil((offer.until - now) / 60_000))
  const key = `betrayal:${offer.at}`
  useEffect(() => playOnce(key, 'warHorn'), [key])
  return (
    <div className="modal" role="dialog" aria-labelledby="betrayal-title">
      <section className="dialog frame fortune-dialog envoy-dialog bad">
        <header className="fortune-banner">
          <span className="envoy-face">
            <EnvoyPortrait size={44} />
          </span>
          <div>
            <small>
              <Icon name="banner" size={16} /> Elçi haber getirdi · {minutes} dk içinde karar ver
            </small>
            <h2 id="betrayal-title">Krallığın sana karşı savaştı</h2>
          </div>
        </header>
        <div className="fortune-art">
          <NoticeArt look={{ family: 'alliance', other: to.color, own: from.color, tone: 'bad' }} />
        </div>
        <div className="fortune-body">
          <p>
            Lordum, kardeşin {offer.name} tahtına göz diktiğinde <b style={{ color: from.ink }}>{from.name}</b> ve hükümdarı {from.ruler} onun tarafını tuttu. İsyan bastırıldı, ama bu ihanet
            unutulur mu? Onlara bir tepki göstermek için <b style={{ color: to.ink }}>{to.name}</b> tarafına geçmek ister misin?
          </p>
          <ul className="away-lines">
            <li>
              <Icon name="banner" size={16} />
              <span>
                Geçersen: {to.name} lordu olursun; onunla ilişkin en az +{s.newRelation} olur, {from.name} ile en çok {s.oldRelation}. Devriyeler ve haraççılar yeni bağlılığına göre gelir.
              </span>
            </li>
            <li>
              <Icon name="gold" size={16} />
              <span>
                Kalırsan: {from.name} özür diler; ilişkin +{s.declineRelation} artar ve hazinene {s.declineGold} altın gönderir.
              </span>
            </li>
          </ul>
          <DialogFoot label={`${to.capital} tarafına geç`} onNext={() => void online.act({ type: 'switchLiege', accept: true })}>
            <button className="btn small" onClick={() => void online.act({ type: 'switchLiege', accept: false })}>
              Sadık kal
            </button>
            <button className="btn small" onClick={onLater}>
              Sonra
            </button>
          </DialogFoot>
        </div>
      </section>
    </div>
  )
}

// The same choice in the Krallık tab, while the offer stands (the dialog may have been put off).
export function BetrayalCard({ world, kingdom, online, now }: { world: World; kingdom: Kingdom; online: Online; now: number }) {
  const offer = liveOffer(kingdom, world.cities.length, now)
  if (!offer) return null
  const from = cityInfo(world, offer.from)
  const to = cityInfo(world, offer.to)
  return (
    <Section title="İhanetin bedeli" icon="banner" aside={`${Math.max(1, Math.ceil((offer.until - now) / 60_000))} dk kaldı`}>
      <p className="hint down">
        {from.name} kardeşin {offer.name}'i sana karşı destekledi. {to.name} tarafına geçebilir ya da sadık kalıp tacın özrünü kabul edebilirsin.
      </p>
      <div className="row">
        <button className="btn small primary" onClick={() => void online.act({ type: 'switchLiege', accept: true })}>
          <Icon name="banner" size={16} /> {to.capital} tarafına geç
        </button>
        <button className="btn small" onClick={() => void online.act({ type: 'switchLiege', accept: false })}>
          Sadık kal
        </button>
      </div>
    </Section>
  )
}
