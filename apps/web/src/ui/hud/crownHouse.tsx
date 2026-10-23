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
  isNewcomer,
  liegeSwitchError,
  palaceLevel,
  relationBetween,
} from '@game/shared'
import type { CrownKey, CrownReign, CrownRivalry, CrownRoyal, CrownStance, Kingdom, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import type { Notice } from '../../net/online'
import { Portrait } from '../DynastyArt'
import { Icon } from '../icons'
import { L, getLang, locale } from '../../lib/i18n'
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

const traitName = (p: CrownRoyal) => {
  const t = crownTraitSpec(p.trait)
  return L(t.name, t.nameEn ?? t.name)
}
// What a trait does, in a few words.
function traitNote(p: CrownRoyal) {
  const t = crownTraitSpec(p.trait)
  const parts: string[] = []
  if (t.tribute !== 1)
    parts.push(
      L(
        `haraççıları hazinenin %${(balance.cities.crown.patrol.tribute.share * t.tribute * 100).toFixed(1).replace('.', ',').replace(',0', '')}'ini ister`,
        `the tribute collectors ask for ${(balance.cities.crown.patrol.tribute.share * t.tribute * 100).toFixed(1).replace('.0', '')}% of the treasury`,
      ),
    )
  if (t.tip !== 1)
    parts.push(
      L(`devriyesi ${t.tip > 1 ? 'daha çok' : 'daha az'} bahşiş bırakır (×${t.tip.toFixed(2).replace('.', ',')})`, `the patrol leaves ${t.tip > 1 ? 'bigger' : 'smaller'} tips (×${t.tip.toFixed(2)})`),
    )
  return parts.length > 0 ? parts.join(', ') : L('tacın işlerine dokunmaz', 'leaves the crown\'s affairs as they are')
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
    <Section title={L('Hanedan', 'Dynasty')} icon="crown" aside={L(`${year(h.reign.from)}'den beri hüküm sürüyor`, `reigning since ${year(h.reign.from)}`)}>
      <div className="house">
        <div className="person">
          <Portrait seed={seedOf(key, crown, h.ruler)} sex={h.ruler.sex} age={crownAgeOf(h.ruler, now)} role={roleOf(h.ruler, true)} size={84} />
          <div>
            <b style={{ color: info.ink }}>{h.title}</b>
            <small>
              {L(`${years(h.ruler, now)} yaşında · huyu ${traitName(h.ruler).toLocaleLowerCase(locale())}`, `aged ${years(h.ruler, now)} · ${traitName(h.ruler).toLocaleLowerCase(locale())} by nature`)}
              {h.reign.kinsman ? L(' · akrabalıktan tahta çağrıldı', ' · called to the throne as a kinsman') : ''}
            </small>
            <SkillBars skills={h.ruler.skills} />
            <small className="hint">{L('Huyu', 'Nature')}: {traitNote(h.ruler)}.</small>
          </div>
        </div>
        {h.consort ? (
          <div className="person">
            <Portrait seed={seedOf(key, crown, h.consort)} sex={h.consort.sex} age={crownAgeOf(h.consort, now)} role={h.consort.sex === 'f' ? 'queen' : 'prince'} size={84} />
            <div>
              <b>
                {h.consort.sex === 'f' ? L('Kraliçe', 'Queen') : L('Prens', 'Prince')} {h.consort.name}
              </b>
              <small>
                {L(`${years(h.consort, now)} yaşında`, `aged ${years(h.consort, now)}`)} · {h.ruler.sex === 'm' ? L('kralın eşi', 'the king\'s consort') : L('kraliçenin eşi', 'the queen\'s consort')}
              </small>
              <SkillBars skills={h.consort.skills} />
            </div>
          </div>
        ) : (
          <p className="hint">{h.widowed ? L(`${crownTitleOf(h.ruler)} dul; eşini kaybetti.`, `The ${crownTitleOf(h.ruler).toLocaleLowerCase(locale())} is widowed; the consort has died.`) : L('Hükümdarın eşi yok.', 'The ruler has no consort.')}</p>
        )}
      </div>
      {h.regent && (
        <p className="hint">
          {L(
            `${crownTitleOf(h.ruler)} henüz reşit değil: ${h.regent.name ? `naip ${h.regent.name}` : 'naipler meclisi'} ${nextOfAge} yıl daha onun adına yönetiyor.`,
            `The ${crownTitleOf(h.ruler).toLocaleLowerCase(locale())} is not yet of age: ${h.regent.name ? `the regent ${h.regent.name}` : 'a council of regents'} rules in their stead for ${nextOfAge} more year${nextOfAge === 1 ? '' : 's'}.`,
          )}
        </p>
      )}
      <h4 className="house-title">{L('Çocuklar', 'Children')}</h4>
      {h.children.length === 0 ? (
        <p className="hint">{L('Hükümdarın henüz çocuğu yok. Varisi yoksa taç hanedandan bir akrabaya geçer.', 'The ruler has no children yet. Without an heir the crown passes to a kinsman of the house.')}</p>
      ) : (
        <ul className="ancestors">
          {h.children.map((c) => {
            const dead = c.deathAt <= now
            const place = h.line.findIndex((x) => x.id === c.id)
            return (
              <li key={c.id}>
                <Portrait seed={seedOf(key, crown, c)} sex={c.sex} age={crownAgeOf(c, dead ? c.deathAt : now)} role={c.sex === 'm' ? 'prince' : 'princess'} dead={dead} size={40} />
                <span>
                  {c.sex === 'm' ? L('Prens', 'Prince') : L('Prenses', 'Princess')} {c.name} · {dead ? L(`${years(c, c.deathAt)} yaşında öldü`, `died aged ${years(c, c.deathAt)}`) : L(`${years(c, now)} yaşında`, `aged ${years(c, now)}`)}
                  {place === 0 ? L(' · veliaht', ' · heir') : place > 0 ? L(` · tahtta ${place + 1}. sırada`, ` · ${ordinal(place + 1)} in line to the throne`) : ''}
                  {!dead && crownAgeOf(c, now) < balance.cities.crown.house.comingOfAge ? L(' · reşit değil', ' · under age') : ''} · {traitName(c).toLocaleLowerCase(locale())}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <h4 className="house-title">{L('Önceki hükümdarlar', 'Earlier rulers')}</h4>
      <ul className="ancestors scroll3">
        {h.past.map((r) => (
          <li key={r.n}>
            <Portrait seed={seedOf(key, crown, r.ruler)} sex={r.ruler.sex} age={crownAgeOf(r.ruler, r.to)} role={r.ruler.sex === 'm' ? 'king' : 'queen'} dead size={40} />
            <span>
              {crownRulerTitle(r)} · {year(r.from)}–{year(r.to)} · {L(`${Math.floor(crownAgeOf(r.ruler, r.to))} yaşında öldü`, `died aged ${Math.floor(crownAgeOf(r.ruler, r.to))}`)}{r.regent ? L(' · naiple başladı', ' · began under a regent') : ''}
              {r.kinsman ? L(' · akrabalıktan geldi', ' · came as a kinsman') : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        {L(
          `Taç hanedanları da senin hanedanın gibi yaşlanır (bir gerçek saat bir yıl). Hükümdar ölünce en büyük oğlu, oğlu yoksa en büyük kızı tahta geçer; çocuğu yoksa hanedandan bir akraba çağrılır. Varis ${balance.cities.crown.house.comingOfAge} yaşından küçükse reşit olana dek naip yönetir. Her hükümdarın bir huyu vardır; tacın haraççılarını ve devriyesini biraz değiştirir.`,
          `The crowns' houses age just as yours does (one real hour, one year). When a ruler dies the eldest son takes the throne, or failing a son the eldest daughter; with no children a kinsman of the house is called. An heir under ${balance.cities.crown.house.comingOfAge} rules through a regent until coming of age. Every ruler has a nature that nudges the crown's tribute collectors and patrol a little.`,
        )}
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
  const word = relation >= 60 ? L('gözdesi', 'favourite') : relation >= 30 ? L('dostu', 'friend') : relation >= 0 ? L('tarafsız', 'neutral') : relation >= -30 ? L('soğuk', 'cool') : relation >= -50 ? L('kuşkulu', 'wary') : L('düşmanı', 'enemy')
  const lords = online.kingdoms.filter((k) => k.liege === crown).sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
  const rival = online.kingdoms.filter((k) => k.liege !== undefined && k.liege !== null && k.liege !== crown)
  // Wars between this crown's lords and the rival crown's.
  const wars = online.pacts.filter((p) => p.kind === 'war' && !p.ended_at && ((lords.some((l) => l.id === p.from_id) && rival.some((l) => l.id === p.to_id)) || (lords.some((l) => l.id === p.to_id) && rival.some((l) => l.id === p.from_id))))
  const top = Math.max(1, ...lords.map((l) => l.score?.total ?? 0))
  return (
    <>
      <Section title={L('Sarayın sana bakışı', 'How the court sees you')} icon="crown" aside={`${signed(relation)} · ${word}`}>
        <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={L(`${info.name} ile ilişki`, `Relations with the ${info.name}`)} segments={20} />
        <Stat label={L('Bağlılık', 'Allegiance')} value={signed(fealty)} note={unsworn ? L('henüz biat etmedin', 'not sworn yet') : sworn ? L('bu tacın lordusun', 'you are this crown\'s lord') : L('rakip tacın lordusun', 'you are the rival crown\'s lord')} />
        {house !== 0 && <Stat label={L('Hanedan bağları', 'Family ties')} value={signed(house)} note={L('devriyeyi yöneten kardeş, taca gelin giden prensesler', 'a brother leading the patrol, princesses wed into the crown')} tone="up" />}
        <Stat label={L('Dinlenme değeri', 'Resting value')} value={signed(rest)} note={L(`ilişki zamanla buraya döner (saatte ~${Math.round(perHour)} puan)`, `relations drift back here over time (~${Math.round(perHour)} points an hour)`)} />
        <Stat label={L('Şu anki sapma', 'Current swing')} value={signed(off)} note={off >= 0 ? L('siparişler, görevler, ticaret ve armağanlarla kazandın', 'earned with orders, tasks, trade and gifts') : L('reddedilen haraç ve istekler, kırgınlıklar', 'refused tribute and requests, grudges')} tone={off >= 0 ? 'up' : 'down'} />
        <p className="hint">
          {L(
            `Artıranlar: tüccarı başkente göndermek (sefer başına +${r.cityTrip}), taç siparişleri, görevler ve kraliyet istekleri, kendi tacının devriyesini ağırlamak (+${r.visit}), rakip tacın haracını ödemek (+${r.tributePaid}). Azaltanlar: haracı reddetmek (${r.tributeRefused}), kraliyet isteğini geri çevirmek.`,
            `Raised by: sending your merchant to the capital (+${r.cityTrip} a trip), crown orders, tasks and royal requests, hosting your own crown's patrol (+${r.visit}), paying the rival crown's tribute (+${r.tributePaid}). Lowered by: refusing tribute (${r.tributeRefused}), turning down a royal request.`,
          )}
        </p>
      </Section>
      <Section title={L('Lordları', 'Its lords')} icon="banner" aside={L(`${lords.length} lord`, `${lords.length} lord${lords.length === 1 ? '' : 's'}`)}>
        {lords.length === 0 ? (
          <p className="hint">{L('Bu tacın henüz lordu yok.', 'This crown has no lords yet.')}</p>
        ) : (
          <ul className="crown-lords">
            {lords.map((l) => {
              const me = l.id === online.me
              const rel = me ? null : relationBetween(online.relations, online.me, l.id, now, relationTermsIn(online, online.me, l.id))
              return (
                <li key={l.id} className={me ? 'me' : undefined}>
                  <button className="link" onClick={() => !me && online.setFocus(l.id)} disabled={me} data-why={L('Bu senin lordluğun', 'This is your lordship')}>
                    {l.name}
                    {me ? L(' (sen)', ' (you)') : ''}
                  </button>
                  <i style={{ width: `${((l.score?.total ?? 0) / top) * 100}%`, background: info.color }} />
                  <small>
                    {L(`${fmt(l.score?.total ?? 0)} puan`, `${fmt(l.score?.total ?? 0)} points`)}{rel !== null ? L(` · seninle ${signed(rel)}`, ` · with you ${signed(rel)}`) : ''}
                  </small>
                </li>
              )
            })}
          </ul>
        )}
        <p className="hint">
          {wars.length > 0
            ? L(`Bu tacın lordlarıyla rakip tacın lordları arasında ${wars.length} savaş sürüyor.`, `${wars.length} war${wars.length === 1 ? ' is' : 's are'} under way between this crown's lords and the rival crown's.`)
            : L('İki tacın lordları arasında şu an savaş yok.', 'There is no war between the two crowns\' lords right now.')}{' '}
          {L(
            `İki taç şu an: ${STANCE_NAMES[crownRivalryAt(crownKeyOf(kingdom), now).stance].toLocaleLowerCase(locale())} (ayrıntısı Krallıklar sayfasında). Taçlar birbirinin lordlarından haraç ister, lordları rakip tacın lordlarıyla ittifak kuramaz.`,
            `The two crowns now: ${STANCE_NAMES[crownRivalryAt(crownKeyOf(kingdom), now).stance].toLocaleLowerCase(locale())} (details on the Kingdoms page). The crowns demand tribute from each other's lords, and their lords cannot ally with the rival crown's.`,
          )}
        </p>
      </Section>
    </>
  )
}

// ---- The crowns' ways and their rivalry (CLAUDE.md §7.8) --------------------------------------------------------

export const STANCE_NAMES: Record<CrownStance, string> = { peace: L('Barış', 'Peace'), tension: L('Gerginlik', 'Tension'), war: L('Taç savaşı', 'Crown war') }
const STANCE_ICONS = { peace: 'flower', tension: 'warn', war: 'swords' } as const
const times = (v: number) => `×${(Math.round(v * 100) / 100).toString().replace('.', getLang() === 'en' ? '.' : ',')}`
// "2nd", "3rd" (English only).
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

// Why a crown asks more or less tribute, or tips more or less ("huyu açgözlü ×1,2 · taç savaşı ×1,25"); empty when
// nothing tilts it.
export function waysText(key: CrownKey, crown: number, at: number, what: 'tribute' | 'tip') {
  const w = crownWays(key, crown, at)
  const e = balance.cities.crown.rivalry.effects[w.rivalry.stance][what]
  const parts: string[] = []
  if (w.trait[what] !== 1) parts.push(L(`hükümdarı ${w.trait.name.toLocaleLowerCase('tr-TR')} ${times(w.trait[what])}`, `${(w.trait.nameEn ?? w.trait.name).toLocaleLowerCase(locale())} ruler ${times(w.trait[what])}`))
  if (e !== 1) parts.push(`${STANCE_NAMES[w.rivalry.stance].toLocaleLowerCase(locale())} ${times(e)}`)
  return parts.join(' · ')
}

// The share of the treasury a crown's collectors ask now.
export const tributeShareNow = (key: CrownKey, crown: number, at: number) => balance.cities.crown.patrol.tribute.share * crownWays(key, crown, at).tribute
export const pctText = (v: number) => L(`%${(Math.round(v * 1000) / 10).toString().replace('.', ',')}`, `${Math.round(v * 1000) / 10}%`)

// About what the crown's patrol tips at the house of entertainment now: the base, the crown's power, a brother at the
// patrol's head, the ruler's ways and the rivalry (the server's sum, patrols.ts).
export function tipPreview(kingdom: Kingdom, crown: number, online: Pick<Online, 'kingdoms'>, now: number) {
  const { share } = crownPower(online.kingdoms.map((k) => ({ liege: k.liege ?? null, score: k.score?.total ?? 0 })), 2)
  const favour = byPower(share[crown] ?? 0.5, balance.cities.crown.power.favour)
  const patrol = balance.cities.crown.patrol
  const tavern = kingdom.buildings.some((b) => b.kind === 'tavern' && b.doneAt <= now)
  const base = isNewcomer(palaceLevel(kingdom, now)) ? patrol.newcomer.tip : tavern ? patrol.tip : patrol.plainTip
  return Math.round(base * favour * patrolFavour(kingdom).tip * crownWays(crownKeyOf(kingdom), crown, now).tip)
}

// A lord still on a level 1 palace (CLAUDE.md §7.8): the rival crown's collectors leave a purse instead of asking
// tribute. Null once he has grown out of it.
export const rivalPurse = (kingdom: Kingdom, crown: number, now: number) =>
  isNewcomer(palaceLevel(kingdom, now)) ? Math.round(balance.cities.crown.patrol.newcomer.rivalGift * crownWays(crownKeyOf(kingdom), crown, now).tip) : null

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
    <Section title={L('Taçların rekabeti', 'The crowns\' rivalry')} icon={STANCE_ICONS[r.stance]} aside={L(`${STANCE_NAMES[r.stance]} · ${left} dk daha`, `${STANCE_NAMES[r.stance]} · ${left} min more`)}>
      <p className={r.stance === 'war' ? 'hint down' : 'hint'}>
        {r.stance === 'war'
          ? L(`${names[0].name} ile ${names[1].name} savaşta. Haraççılar daha çok ister, taçlar kendi lordlarını kollar.`, `The ${names[0].name} and the ${names[1].name} are at war. Tribute collectors ask for more, and each crown looks after its own lords.`)
          : r.stance === 'tension'
            ? L(`${names[0].name} ile ${names[1].name} arasında gerginlik var: sınırlarda kılıçlar bileniyor.`, `There is tension between the ${names[0].name} and the ${names[1].name}: swords are being sharpened on the borders.`)
            : L(`${names[0].name} ile ${names[1].name} şimdilik barış içinde.`, `The ${names[0].name} and the ${names[1].name} are at peace, for now.`)}
        {r.winner !== null && L(` Son taç savaşını ${names[r.winner].name} kazandı.`, ` The ${names[r.winner].name} won the last crown war.`)}
      </p>
      <Stat label={L('Haraççıların istediği', 'Tribute asked')} value={times(e.tribute)} note={e.tribute === 1 ? L('olağan pay', 'the usual share') : L('iki tacın haraççıları için', 'for both crowns\' collectors')} tone={e.tribute > 1 ? 'down' : undefined} />
      <Stat label={L('Devriyenin bahşişi', 'Patrol\'s tip')} value={times(e.tip)} note={e.tip === 1 ? L('olağan bahşiş', 'the usual tip') : L('taç kendi lordlarını kollar', 'each crown looks after its lords')} tone={e.tip > 1 ? 'up' : undefined} />
      {sworn && (
        <Stat label={L('Senden istenen haraç', 'Tribute asked of you')} value={pctText(tributeShareNow(key, kingdom.liege === 0 ? 1 : 0, now))} note={`${L('rakip taç', 'rival crown')} ${names[kingdom.liege === 0 ? 1 : 0].capital}: ${waysText(key, kingdom.liege === 0 ? 1 : 0, now, 'tribute') || L('olağan', 'usual')}`} />
      )}
      <h4 className="house-title">{L('Önceki dönemler', 'Earlier periods')}</h4>
      <ul className="ancestors">
        {history.map((h) => (
          <li key={h.window}>
            <Icon name={STANCE_ICONS[h.stance]} size={16} />
            <span>
              {crownYearOf(key, h.from)} · {STANCE_NAMES[h.stance]}
              {winnerOf(h) ? L(` (bitişinde ${winnerOf(h)} kazandı)`, ` (won by the ${winnerOf(h)})`) : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        {L(
          `İki taç ${Math.round(v.windowSeconds / 3600)} saatlik dönemlerde barış, gerginlik ya da savaş hâlindedir; hâl bir öncekine bağlıdır ve hükümdarların huyu savaş olasılığını kaydırır. Gerginlikte haraççılar hazinenin ${times(v.effects.tension.tribute)}'i, savaşta ${times(v.effects.war.tribute)}'i kadarını ister; savaşta devriyenin bahşişi ${times(v.effects.war.tip)}. Savaş bitince hükümdarlarının askerlik yeteneği şansı kaydırır; kazanan tacın lordlarının o taçla ilişkisi +${v.victoryRelation} artar.`,
          `The two crowns spend ${Math.round(v.windowSeconds / 3600)}-hour periods at peace, in tension or at war; each period follows from the one before, and the rulers' natures shift the odds of war. In tension the tribute collectors ask ${times(v.effects.tension.tribute)} the usual share of the treasury, at war ${times(v.effects.war.tribute)}; at war the patrol's tip is ${times(v.effects.war.tip)}. When a war ends, the rulers' military skill tilts the odds; the winning crown's lords gain +${v.victoryRelation} relations with it.`,
        )}
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
      trait: L(crownTraitSpec(reign.ruler.trait).name, crownTraitSpec(reign.ruler.trait).nameEn ?? crownTraitSpec(reign.ruler.trait).name),
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
              <Icon name="banner" size={16} /> {L(`Elçi haber getirdi · ${minutes} dk içinde karar ver`, `The envoy brings news · decide within ${minutes} min`)}
            </small>
            <h2 id="betrayal-title">{L('Krallığın sana karşı savaştı', 'Your own crown fought against you')}</h2>
          </div>
        </header>
        <div className="fortune-art">
          <NoticeArt look={{ family: 'alliance', other: to.color, own: from.color, tone: 'bad' }} />
        </div>
        <div className="fortune-body">
          <p>
            {L(`Lordum, kardeşin ${offer.name} tahtına göz diktiğinde `, `My lord, when your brother ${offer.name} set his eyes on your throne, the `)}
            <b style={{ color: from.ink }}>{from.name}</b>
            {L(
              ` ve hükümdarı ${from.ruler} onun tarafını tuttu. İsyan bastırıldı, ama bu ihanet unutulur mu? Onlara bir tepki göstermek için `,
              ` and its ruler ${from.ruler} took his side. The revolt is crushed, but can such treachery be forgotten? Would you go over to the `,
            )}
            <b style={{ color: to.ink }}>{to.name}</b>
            {L(' tarafına geçmek ister misin?', ' to show them what you think of it? I, naturally, saw it coming.')}
          </p>
          <ul className="away-lines">
            <li>
              <Icon name="banner" size={16} />
              <span>
                {L(
                  `Geçersen: ${to.name} lordu olursun; onunla ilişkin en az +${s.newRelation} olur, ${from.name} ile en çok ${s.oldRelation}. Devriyeler ve haraççılar yeni bağlılığına göre gelir.`,
                  `If you go over: you become a lord of the ${to.name}; your relations with it rise to at least +${s.newRelation}, and with the ${from.name} fall to at most ${s.oldRelation}. Patrols and tribute collectors follow your new allegiance.`,
                )}
              </span>
            </li>
            <li>
              <Icon name="gold" size={16} />
              <span>
                {L(
                  `Kalırsan: ${from.name} özür diler; ilişkin +${s.declineRelation} artar ve hazinene ${s.declineGold} altın gönderir.`,
                  `If you stay: the ${from.name} apologises; your relations rise by +${s.declineRelation} and it sends ${s.declineGold} gold to your treasury.`,
                )}
              </span>
            </li>
          </ul>
          <DialogFoot label={L(`${to.capital} tarafına geç`, `Go over to ${to.capital}`)} onNext={() => void online.act({ type: 'switchLiege', accept: true })}>
            <button className="btn small" onClick={() => void online.act({ type: 'switchLiege', accept: false })}>
              {L('Sadık kal', 'Stay loyal')}
            </button>
            <button className="btn small" onClick={onLater}>
              {L('Sonra', 'Later')}
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
    <Section title={L('İhanetin bedeli', 'The price of treachery')} icon="banner" aside={L(`${Math.max(1, Math.ceil((offer.until - now) / 60_000))} dk kaldı`, `${Math.max(1, Math.ceil((offer.until - now) / 60_000))} min left`)}>
      <p className="hint down">
        {L(
          `${from.name} kardeşin ${offer.name}'i sana karşı destekledi. ${to.name} tarafına geçebilir ya da sadık kalıp tacın özrünü kabul edebilirsin.`,
          `The ${from.name} backed your brother ${offer.name} against you. You may go over to the ${to.name}, or stay loyal and accept the crown's apology.`,
        )}
      </p>
      <div className="row">
        <button className="btn small primary" onClick={() => void online.act({ type: 'switchLiege', accept: true })}>
          <Icon name="banner" size={16} /> {L(`${to.capital} tarafına geç`, `Go over to ${to.capital}`)}
        </button>
        <button className="btn small" onClick={() => void online.act({ type: 'switchLiege', accept: false })}>
          {L('Sadık kal', 'Stay loyal')}
        </button>
      </div>
    </Section>
  )
}
