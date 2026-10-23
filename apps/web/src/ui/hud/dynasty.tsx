import { EnvoyPortrait } from '../advisor/EnvoyPortrait'
import {
  SKILLS,
  aidError,
  ageOf,
  balance,
  birthsLeft,
  campSoldiers,
  crownRelation,
  dowryOf,
  dynastyEffects,
  giftError,
  hasOpinion,
  heirOf,
  houseNames,
  kinOf,
  marriedOf,
  marryError,
  ofAge,
  opinionOf,
  randomName,
  roleError,
  roleLapsed,
  rulerSkills,
  siblingsOf,
  yearMs,
} from '@game/shared'
import type { Dynasty, KinRoleKind, Kingdom, Kinship, OpinionPart, Person, Point, Skill } from '@game/shared'
import { useEffect, useState } from 'react'
import { playOnce } from '../../audio/sfx'
import { L } from '../../lib/i18n'
import { DynastyArt, Portrait } from '../DynastyArt'
import { DialogFoot } from '../DialogQueue'
import { Icon } from '../icons'
import type { Online } from './online'
import { Meter, Section } from './primitives'
import { PixelSelect } from './PixelSelect'

// The lord's house on the palace's tab (CLAUDE.md §9.1, §9.1.1), seen from the ruler: his parents, himself and his
// lady, his brothers and sisters, his children, the kin, the daughters and sisters married off, the ladies married in,
// and the house's dead. The grown men's feelings for the ruler (and the crown's for them), their posts and gifts, the
// princesses' marriages, and a pretender's camp if a brother has risen. And the news of the house.

export const SKILL_NAMES: Record<Skill, string> = { finance: L('Maliye', 'Finance'), people: L('Halk', 'People'), military: L('Askerlik', 'Military') }
const SKILL_NOTES: Record<Skill, string> = {
  finance: L('vergi ve ticaret geliri', 'tax and trade income'),
  people: L('halkın mutluluğu ve iş gücü', "the people's happiness and workforce"),
  military: L('askerlerin zarı ve maaşı', "the soldiers' dice and pay"),
}
export const ROLE_NAMES: Record<KinRoleKind, string> = { governor: L('Vali', 'Governor'), commander: L('Devriye komutanı', 'Patrol commander'), treasurer: L('Hazinedar', 'Treasurer') }
const PART_NAMES: Record<OpinionPart['key'], string> = {
  base: L('Yakınlık', 'Kinship'),
  ruler: L('Hükümdarın yetenekleri', "The ruler's skills"),
  happiness: L('Halkın mutluluğu', "The people's happiness"),
  role: L('Görevi var', 'Holds a post'),
  elder: L('Büyük kardeş: tahtta gözü var', 'Elder brother: has his eye on the throne'),
  council: L('Naipler yönetiyor', 'The regents rule'),
  mother: L('Kraliçe ana yatıştırıyor', 'The queen mother soothes him'),
  ambition: L('Hırsı', 'Ambition'),
  neglect: L('Görevsiz bırakıldı: kırgın', 'Left without a post: resentful'),
  commander: L('Tacın devriyesini yönetiyor', "Leads the crown's patrol"),
  military: L('Askerlik yeteneği', 'Military skill'),
  marriage: L('Hanedanla akrabalık', 'Kin by marriage'),
  recent: L('Son olaylar', 'Recent events'),
}

const I = balance.dynasty.intrigue
const years = (p: Pick<Person, 'bornAt'>, at: number) => Math.floor(ageOf(p, at))
const stage = (p: Person, at: number) => {
  const age = ageOf(p, at)
  return age < 3 ? L('bebek', 'baby') : age < 12 ? L('çocuk', 'child') : age < balance.dynasty.comingOfAge ? L('genç', 'youth') : L('reşit', 'of age')
}
const pct = (v: number) => L(`${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 100))}`, `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`)
const num = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${L(Math.abs(v).toFixed(digits).replace('.', ','), Math.abs(v).toFixed(digits))}`
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A prince or a princess by sex (never "Prens" for a daughter).
/** How someone died, as the house's pages say it (in English it reads after "died": "died of illness"). Old records carry no cause (or "age") for anyone; nobody dies of old age before the
 * youngest death age, so those early deaths read as an illness. `long` is the fuller phrasing of the news windows. */
export function deathOf(p: Person, at: number, long = false): string {
  switch (p.cause) {
    case 'battle':
      return long ? L('ordusunun başında savaşırken', `fighting at the head of ${p.sex === 'm' ? 'his' : 'her'} army`) : L('savaşta düşerek', 'in battle')
    case 'grief':
      return long ? L('kaybedilen savaşın kahrından', 'of grief over a lost battle') : L('kahrından', 'of grief')
    case 'rebel':
      return L('isyanı bastırılırken', `as ${p.sex === 'm' ? 'his' : 'her'} revolt was crushed`)
    case 'deposed':
      return L('tahttan indirilerek', 'after being cast from the throne')
    case 'sickness':
      return long ? L('salgına yakalanıp hastalıktan', 'of illness, struck by the plague') : L('hastalıktan', 'of illness')
  }
  return ageOf(p, p.diedAt ?? at) < balance.dynasty.death.atAge[0] ? (long ? L('ansızın gelen bir hastalıktan', 'of a sudden illness') : L('hastalıktan', 'of illness')) : L('yaşlılıktan', 'of old age')
}

export const titleOf = (p: Pick<Person, 'sex'>) => (p.sex === 'm' ? L('Prens', 'Prince') : L('Prenses', 'Princess'))
const roleOfPortrait = (p: Pick<Person, 'sex'>) => (p.sex === 'm' ? 'prince' : 'princess')

// How a man of the house feels, in a word.
export const moodWord = (v: number) => (v >= 40 ? L('sadık', 'loyal') : v >= 10 ? L('iyi', 'friendly') : v >= I.opinion.warn ? L('mesafeli', 'distant') : v >= I.revolt.below ? L('hoşnutsuz', 'resentful') : L('düşman', 'hostile'))

export function SkillBars({ skills }: { skills: Record<Skill, number> }) {
  return (
    <div className="skills">
      {SKILLS.map((s) => (
        <span key={s} className="skill" title={`${SKILL_NAMES[s]}: ${SKILL_NOTES[s]}`}>
          <small>{SKILL_NAMES[s]}</small>
          <Meter value={skills[s] / balance.dynasty.skills.max} tone={skills[s] >= 6 ? 'up' : skills[s] <= 3 ? 'down' : 'gold'} label={SKILL_NAMES[s]} segments={10} />
          <b>{Math.round(skills[s] * 10) / 10}</b>
        </span>
      ))}
    </div>
  )
}

// Why a post, a marriage or the crown's aid is refused (the disabled buttons' reasons, CLAUDE.md §11).
const ROLE_WHY: Record<string, string> = {
  none: L('Bu hanedan üyesine görev verilemez', 'This member of the house cannot be given a post'),
  age: L('Görev için yaşı yetmiyor', 'Too young for a post'),
  sex: L('Devriyenin başına yalnızca bir prens geçebilir', 'Only a prince can lead the patrol'),
  liege: L('Önce bir taç krallığına biat et', 'First swear fealty to a crown kingdom'),
  town: L('Elinde kasaba yok (ya da kasaba seçilmedi)', 'You hold no town (or none is chosen)'),
  taken: L('Bu görevde zaten başka biri var', 'Someone else already holds this post'),
  rejected: L('Bu görev zaten onda', 'This post is already theirs'),
}
const MARRY_WHY: Record<string, string> = {
  none: L('Prenses sarayda değil', 'The princess is not at court'),
  sex: L('Yalnızca prensesler evlendirilebilir', 'Only princesses can be married off'),
  age: L('Prenses henüz reşit değil', 'The princess is not yet of age'),
  liege: L('Önce bir taç krallığına biat et', 'First swear fealty to a crown kingdom'),
  cost: L('Çeyiz için yeterli altın yok', 'Not enough gold for the dowry'),
  town: L('Bu kasaba senin elinde değil', 'You do not hold this town'),
}
const AID_WHY: Record<string, string> = {
  none: L('Ortada bir taht davacısı yok', 'There is no pretender'),
  liege: L('Bağlı olduğun bir taç yok', 'You are sworn to no crown'),
  asked: L('Bunu taçtan zaten istedin', 'You already asked the crown for this'),
}

// A name typed in, or rolled when none comes to mind: one of the person's own sex, passed over if borne in the house.
function NameField({ person, label, wide, taken, onSave }: { person: Person; label: string; wide?: boolean; taken: string[]; onSave(name: string): void }) {
  const [name, setName] = useState(person.name)
  return (
    <form
      className="row name-edit"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim().length >= 2) onSave(name.trim())
      }}
    >
      <input className="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoFocus aria-label={label} />
      <button type="button" className="btn small" title={L('Rastgele bir ad', 'A random name')} onClick={() => setName(randomName(person.sex, Math.random(), taken.filter((n) => n !== person.name)))}>
        <Icon name="dice" size={16} /> {L('Rastgele', 'Random')}
      </button>
      <button className={wide ? 'btn primary' : 'btn small'} disabled={name.trim().length < 2} data-why={L('Ad en az 2 harf olmalı', 'The name needs at least 2 letters')}>
        {L('Koy', 'Set')}
      </button>
    </form>
  )
}

// What a man of the house thinks of the ruler (a meter and a word, the parts on hover), and how the liege crown thinks
// of him beside how it thinks of the lord.
function OpinionLine({ kingdom, p, now }: { kingdom: Kingdom; p: Person; now: number }) {
  const op = opinionOf(kingdom, p, now)
  const parts = [...op.parts.ruler, ...(op.recent ? [{ key: 'recent' as const, value: op.recent }] : [])]
  const sworn = kingdom.liege !== undefined && kingdom.liege !== null
  const lord = sworn ? Math.round(crownRelation(kingdom, kingdom.liege!)) : 0
  return (
    <div className="kin-opinion">
      <span className="skill" title={parts.map((x) => `${PART_NAMES[x.key]} ${signed(x.value)}`).join(' · ')}>
        <small>{L('Seninle ilişkisi', 'Relations with you')}</small>
        <Meter value={(op.ruler + 100) / 200} tone={op.ruler >= 10 ? 'up' : op.ruler < I.opinion.warn ? 'down' : 'gold'} label={L('Hükümdara bakışı', 'Opinion of the ruler')} segments={10} />
        <b>{signed(op.ruler)}</b>
      </span>
      <small className={op.ruler < I.opinion.warn ? 'down' : ''}>
        {moodWord(op.ruler)}: {parts.map((x) => `${PART_NAMES[x.key].toLowerCase()} ${signed(x.value)}`).join(', ')}
      </small>
      {sworn && (
        <small className={op.crown > lord ? 'down' : ''} title={op.parts.crown.map((x) => `${PART_NAMES[x.key]} ${signed(x.value)}`).join(' · ')}>
          {L(`Taç onu ${signed(op.crown)} seviyor, seni ${signed(lord)}.`, `The crown's regard: ${signed(op.crown)} for him, ${signed(lord)} for you.`)}
          {op.crown > lord ? L(' İsyan ederse taç onu destekler!', ' If he revolts, the crown will back him!') : ''}
        </small>
      )}
    </div>
  )
}

// A post for a grown son, daughter, brother or sister: governor of a held town, the crown patrol's commander, treasurer.
function RolePicker({ kingdom, p, now, online, onDone }: { kingdom: Kingdom; p: Person; now: number; online?: Online | null; onDone(): void }) {
  const held = kingdom.towns ?? []
  const [town, setTown] = useState<number | undefined>(held[0]?.id)
  const give = (role: KinRoleKind | null, at?: number) => {
    online?.act({ type: 'house', action: 'role', id: p.id, role, ...(at !== undefined && { town: at }) })
    onDone()
  }
  const governor = roleError(kingdom, p.id, 'governor', now, town)
  const gov = I.roles.governor
  const loyalty = Math.max(0, gov.loyalty + (p.skills.people - balance.dynasty.skills.center) * gov.perPeople)
  const cmd = I.roles.commander
  const tip = Math.round((cmd.tip + Math.max(0, p.skills.military - balance.dynasty.skills.center) * cmd.tipPerMilitary) * 100)
  const tax = Math.max(0, p.skills.finance - I.roles.treasurer.from) * I.roles.treasurer.taxPerFinance
  return (
    <div className="kin-picker">
      <div className="row">
        <PixelSelect value={town} onChange={setTown} options={held.map((t) => ({ value: t.id, label: t.name ?? L(`Kasaba ${t.id}`, `Town ${t.id}`) }))} placeholder={L('Elinde kasaba yok', 'You hold no town')} aria-label={L('Kasaba', 'Town')} />
        <button className="btn small" disabled={governor !== null} data-why={governor ? ROLE_WHY[governor] : undefined} onClick={() => give('governor', town)}>
          {L('Vali yap', 'Make governor')}
        </button>
      </div>
      <small>{L(`Vali: kasabanın sadakat hedefi +${Math.round(loyalty)} (halk yeteneğiyle artar).`, `Governor: the town's loyalty target +${Math.round(loyalty)} (rises with the People skill).`)}</small>
      <button className="btn small" disabled={roleError(kingdom, p.id, 'commander', now) !== null} data-why={ROLE_WHY[roleError(kingdom, p.id, 'commander', now) ?? ''] ?? undefined} onClick={() => give('commander')}>
        {L('Tacın devriyesinin başına geçir', "Put at the head of the crown's patrol")}
      </button>
      <small>
        {L(
          `Devriye komutanı: devriyenin bahşişi +%${tip}, her uğrayışta taçla ilişki +${cmd.visitRelation} fazla, taçla ilişkin +${cmd.crownRest} daha yüksekte dinlenir. Ama taç onu da çok sever (+${I.crownBond.commander}): isyan ederse onu destekleyebilir.`,
          `Patrol commander: the patrol's tip +${tip}%, +${cmd.visitRelation} more relations with the crown on every visit, and your relations with the crown rest ${cmd.crownRest} higher. But the crown grows very fond of him too (+${I.crownBond.commander}): if he revolts, it may back him.`,
        )}
        {p.sex === 'f' ? L(' (Yalnızca prensler.)', ' (Princes only.)') : ''}
      </small>
      <button className="btn small" disabled={roleError(kingdom, p.id, 'treasurer', now) !== null} data-why={ROLE_WHY[roleError(kingdom, p.id, 'treasurer', now) ?? '']} onClick={() => give('treasurer')}>
        {L('Hazinedar yap', 'Make treasurer')}
      </button>
      <small>{L(`Hazinedar: vergi ${pct(tax)} (maliye yeteneğiyle artar).`, `Treasurer: tax ${pct(tax)} (rises with the Finance skill).`)}</small>
      {p.role && (
        <button className="btn small danger" onClick={() => give(null)}>
          {L('Görevden al', 'Remove from post')}
          {p.sex === 'm' ? L(` (gücenir: ${I.opinion.roleRemoved})`, ` (he takes offence: ${I.opinion.roleRemoved})`) : ''}
        </button>
      )}
    </div>
  )
}

// A grown princess married off: into the liege crown's house, a town's first family (one held, or a free one that comes
// over), or another lord's house (an envoy carries the proposal).
function MarryPicker({ kingdom, p, now, online, onDone }: { kingdom: Kingdom; p: Person; now: number; online?: Online | null; onDone(): void }) {
  const held = (kingdom.towns ?? []).map((t) => ({ id: t.id, name: t.name ?? L(`Kasaba ${t.id}`, `Town ${t.id}`), free: false }))
  const free = (online?.towns ?? []).filter((t) => t.owner === null && !t.siege && !t.rebels).map((t) => ({ id: t.id, name: t.name, free: true }))
  const towns = [...held, ...free]
  const lords = (online?.kingdoms ?? []).filter((k) => k.id !== online?.me)
  const [town, setTown] = useState<number | undefined>(towns[0]?.id)
  const [lord, setLord] = useState<number | undefined>(lords[0]?.id)
  const m = I.marriage
  const crownName = kingdom.liege !== undefined && kingdom.liege !== null ? (online?.crowns[kingdom.liege] ?? L('Taç', 'crown')) : null
  const chosen = towns.find((t) => t.id === town)
  const marry = (to: { kind: 'crown' } | { kind: 'town'; town: number } | { kind: 'lord'; id: number }) => {
    online?.act({ type: 'house', action: 'marry', id: p.id, to })
    onDone()
  }
  return (
    <div className="kin-picker">
      <button className="btn small" disabled={marryError(kingdom, p.id, { kind: 'crown' }, now) !== null} data-why={MARRY_WHY[marryError(kingdom, p.id, { kind: 'crown' }, now) ?? '']} onClick={() => marry({ kind: 'crown' })}>
        {crownName ? L(`${crownName} sarayına gelin ver`, `Wed into the court of the ${crownName}`) : L('Taca gelin ver (önce biat et)', 'Wed into the crown (swear fealty first)')} ·{' '}
        {L(`${dowryOf('crown')} altın çeyiz`, `${dowryOf('crown')} gold dowry`)}
      </button>
      <small>
        {L(
          `Taçla ilişkin hemen +${m.crown.relation}, sonra hep +${m.crown.crownRest} daha yüksekte dinlenir; taç hanedanının erkeklerini de biraz daha sever.`,
          `Your relations with the crown rise by +${m.crown.relation} at once, then always rests ${m.crown.crownRest} higher; the crown also grows a little fonder of the men of your house.`,
        )}
      </small>
      <div className="row">
        <PixelSelect value={town} onChange={setTown} options={towns.map((t) => ({ value: t.id, label: t.name, note: t.free ? L('kimsenin değil', 'nobody’s') : undefined }))} placeholder={L('Uygun kasaba yok', 'No suitable town')} aria-label={L('Kasaba', 'Town')} />
        <button className="btn small" disabled={!chosen || marryError(kingdom, p.id, { kind: 'town', town: chosen.id, name: chosen.name, free: chosen.free }, now) !== null} data-why={!chosen ? L('Uygun kasaba yok', 'No suitable town') : MARRY_WHY[marryError(kingdom, p.id, { kind: 'town', town: chosen.id, name: chosen.name, free: chosen.free }, now) ?? '']} onClick={() => chosen && marry({ kind: 'town', town: chosen.id })}>
          {L(`Kasabaya gelin ver · ${dowryOf('town')} altın`, `Wed into the town · ${dowryOf('town')} gold`)}
        </button>
      </div>
      <small>
        {L(
          `Kasabanın ileri gelen ailesine gelin gider: elindeki kasabanın sadakat hedefi kalıcı olarak +${m.town.loyalty}; kimsenin olmayan bir kasaba ise kuşatmasız sana bağlanır (sadakat %${m.town.freeLoyalty} ile başlar; aşırı büyümeye dikkat).`,
          `She weds into the town's leading family: a town you hold gets +${m.town.loyalty} loyalty target for good; a town nobody holds comes over to you without a siege (loyalty starts at ${m.town.freeLoyalty}%; mind overreach).`,
        )}
      </small>
      <div className="row">
        <PixelSelect value={lord} onChange={setLord} options={lords.map((k) => ({ value: k.id, label: k.name }))} placeholder={L('Lobide başka lord yok', 'No other lord in the lobby')} aria-label="Lord" />
        <button className="btn small" disabled={lord === undefined} data-why={L('Lobide başka lord yok', 'No other lord in the lobby')} onClick={() => lord !== undefined && marry({ kind: 'lord', id: lord })}>
          {L('Elçiyle teklif et', 'Propose by envoy')}
        </button>
      </div>
      <small>
        {L(
          `Kabul ederse prenses onun hanedanına gelin gider ve ilişkiniz +${m.lord.relation} artar. Savaştayken teklif edilemez.`,
          `If he accepts, the princess weds into his house and your relations rise by +${m.lord.relation}. Cannot be proposed while at war.`,
        )}
      </small>
    </div>
  )
}

// A son, daughter, brother or sister of the ruler.
function KinCard({
  kingdom,
  p,
  kinship,
  now,
  online,
  heir,
  taken,
}: {
  kingdom: Kingdom
  p: Person
  kinship: Kinship
  now: number
  online?: Online | null
  heir: boolean
  taken: string[]
}) {
  const d = kingdom.dynasty!
  const [open, setOpen] = useState<null | 'name' | 'role' | 'marry'>(null)
  const minor = !ofAge(p, now)
  const canTeach = minor && !d.council
  const grownForRole = ageOf(p, now) >= I.roles.minAge
  const lapsed = roleLapsed(kingdom, p)
  const town = p.role?.kind === 'governor' ? (kingdom.towns ?? []).find((t) => t.id === (p.role as { town: number }).town)?.name : null
  const gift = giftError(kingdom, p.id, now)
  const toggle = (what: 'name' | 'role' | 'marry') => setOpen((o) => (o === what ? null : what))
  return (
    <li>
      <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, now)} role={roleOfPortrait(p)} size={60} />
      <div>
        <b>
          {titleOf(p)} {p.name}
          {heir && <span className="chip">{L('varis', 'heir')}</span>}
          {p.role && <span className="chip">{ROLE_NAMES[p.role.kind]}{town ? ` · ${town}` : ''}</span>}
        </b>
        <small>
          {kinship === 'sibling' ? (p.sex === 'm' ? L('Kardeşin', 'Your brother') : L('Kız kardeşin', 'Your sister')) : p.sex === 'm' ? L('Oğlun', 'Your son') : L('Kızın', 'Your daughter')} ·{' '}
          {L(`${years(p, now)} yaşında`, `aged ${years(p, now)}`)} · {stage(p, now)}
          {p.education &&
            L(
              ` · ${SKILL_NAMES[p.education].toLowerCase()} eğitimi${minor ? ` (reşit olunca +${balance.dynasty.skills.education})` : ''}`,
              ` · ${SKILL_NAMES[p.education].toLowerCase()} education${minor ? ` (+${balance.dynasty.skills.education} when of age)` : ''}`,
            )}
        </small>
        {lapsed && <small className="down">{L('Valisi olduğu kasaba elden çıktı; yeni bir görev ver ya da görevden al.', 'The town they governed has been lost; give a new post or relieve them of this one.')}</small>}
        <SkillBars skills={p.skills} />
        {hasOpinion(p, now) && <OpinionLine kingdom={kingdom} p={p} now={now} />}
        {canTeach && <small className={p.education ? 'education-note' : 'education-note todo'}>{p.education ? L(`Eğitimi: ${SKILL_NAMES[p.education]}`, `Education: ${SKILL_NAMES[p.education]}`) : L('Eğitim seçilmedi: hocalarına bir yetenek seç', 'No education chosen: pick a skill for the tutors')}</small>}
        {canTeach && (
          <div className="segmented choices education" role="radiogroup" aria-label={L('Eğitim', 'Education')}>
            {SKILLS.map((s) => (
              <button key={s} role="radio" aria-checked={p.education === s} className={p.education === s ? 'btn small active' : 'btn small'} onClick={() => online?.act({ type: 'educate', id: p.id, focus: s })}>
                {SKILL_NAMES[s]}
              </button>
            ))}
          </div>
        )}
        <div className="row wrap">
          {!p.named && (
            <button className="btn small" onClick={() => toggle('name')}>
              {L('Adını koy', 'Name them')}
            </button>
          )}
          {grownForRole && (
            <button className={open === 'role' ? 'btn small active' : 'btn small'} onClick={() => toggle('role')}>
              <Icon name="scroll" size={16} /> {L('Görev', 'Post')}
            </button>
          )}
          {hasOpinion(p, now) && (
            <button className="btn small" disabled={gift !== null} data-why={gift === 'cooldown' ? L('Az önce hediye verdin; biraz bekle', 'You just gave a gift; wait a while') : gift === 'cost' ? L(`Yeterli altın yok (eksik: ${Math.ceil(I.gift.gold - kingdom.stock.gold)})`, `Not enough gold (short: ${Math.ceil(I.gift.gold - kingdom.stock.gold)})`) : L('Hediye verilemez', 'No gift can be given')} onClick={() => online?.act({ type: 'house', action: 'gift', id: p.id })}>
              <Icon name="gold" size={16} /> {L(`Hediye (${I.gift.gold} altın, +${I.gift.opinion})`, `Gift (${I.gift.gold} gold, +${I.gift.opinion})`)}
            </button>
          )}
          {p.sex === 'f' && !minor && (
            <button className={open === 'marry' ? 'btn small active' : 'btn small'} onClick={() => toggle('marry')}>
              <Icon name="flower" size={16} /> {L('Evlendir', 'Marry off')}
            </button>
          )}
        </div>
        {open === 'name' && !p.named && (
          <NameField
            key={p.id}
            person={p}
            label={L('Ad', 'Name')}
            taken={taken}
            onSave={(name) => {
              online?.act({ type: 'nameChild', id: p.id, name })
              setOpen(null)
            }}
          />
        )}
        {open === 'role' && <RolePicker kingdom={kingdom} p={p} now={now} online={online} onDone={() => setOpen(null)} />}
        {open === 'marry' && <MarryPicker kingdom={kingdom} p={p} now={now} online={online} onDone={() => setOpen(null)} />}
      </div>
    </li>
  )
}

// A brother risen against the ruler (CLAUDE.md §9.1.1): his camp, how strong it is, when it marches, and what the lord
// can do about it: send an army, ask the liege crown for soldiers or gold.
function PretenderPanel({ kingdom, now, online, onShow }: { kingdom: Kingdom; now: number; online?: Online | null; onShow?(p: Point): void }) {
  const p = kingdom.pretender!
  const soldiers = campSoldiers(p, now)
  const crown = kingdom.liege !== undefined && kingdom.liege !== null ? (online?.crowns[kingdom.liege] ?? L('Taç', 'crown')) : null
  const armies = (online?.armies ?? []).filter((a) => a.kingdom_id === online?.me && a.status !== 'battle')
  const relation = crown ? Math.round(crownRelation(kingdom, kingdom.liege!)) : 0
  const ask = (kind: 'troops' | 'gold') => online?.act({ type: 'house', action: 'aid', kind })
  const a = I.aid
  return (
    <Section title={L(`Taht davacısı ${p.person.name}`, `Pretender ${p.person.name}`)} icon="swords" aside={L(`${soldiers} asi`, `${soldiers} rebel${soldiers === 1 ? '' : 's'}`)}>
      <p className="hint down">
        {L(
          `Kardeşin ${p.person.name} sana isyan etti ve sınırının yakınında bir karargâh kurdu${p.deserters ? `; garnizonundan ${p.deserters} asker onunla gitti` : ''}. Karargâh her dakika büyüyor${p.backed ? ` ve ${crown ?? 'taç'} onu destekliyor (daha hızlı büyür, tacın askerleri yanında)` : ''}.`,
          `Your brother ${p.person.name} has risen against you and pitched a camp near your border${p.deserters ? `; ${p.deserters} soldier${p.deserters === 1 ? '' : 's'} of your garrison went with him` : ''}. The camp grows every minute${p.backed ? `, and the ${crown ?? 'crown'} backs him (it grows faster, with the crown's soldiers at his side)` : ''}.`,
        )}{' '}
        {p.marching
          ? L('Şimdi sarayını kuşatıyor! Kuşatmayı kaybedersen tahtı o alır.', 'He is besieging your palace now! Lose the siege and the throne is his.')
          : L(`${clock(p.marchAt - now)} sonra sarayını kuşatacak; kuşatmayı kaybedersen tahtı o alır.`, `He will besiege your palace in ${clock(p.marchAt - now)}; lose the siege and the throne is his.`)}
      </p>
      {p.battle ? (
        <button className="btn small" onClick={() => online?.watch(p.battle!)}>
          <Icon name="swords" size={16} /> {L('Savaşı izle', 'Watch the battle')}
        </button>
      ) : (
        !p.marching && (
          <>
            <p className="hint">
              {L(
                `Karargâha bir ordu gönder: varınca saldırır. Karargâhın çiti savunmasına katılır; en az ${Math.ceil(soldiers * 1.4)} askerle gitmek akıllıcadır.`,
                `Send an army to the camp: it attacks on arrival. The camp's palisade joins its defence; going with at least ${Math.ceil(soldiers * 1.4)} soldiers is wise.`,
              )}
            </p>
            {armies.length === 0 ? (
              <p className="hint">{L('Sahada ordun yok: Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field: raise one from the garrison on the Army tab.')}</p>
            ) : (
              <div className="row wrap">
                {armies.map((army) => (
                  <button key={army.id} className="btn small" onClick={() => online?.act({ type: 'army', army: army.id, order: { kind: 'move', x: p.at.x, y: p.at.y } })}>
                    <Icon name="swords" size={16} /> {L(`${army.soldiers ?? '?'} askerlik orduyu gönder`, `Send the army (${army.soldiers ?? '?'} soldiers)`)}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}
      {onShow && (
        <button className="btn small" onClick={() => onShow(p.at)}>
          <Icon name="pin" size={16} /> {L('Karargâhı göster', 'Show the camp')}
        </button>
      )}
      {crown && (
        <>
          <p className="hint">
            {L(
              `${crown} ile ilişkin ${signed(relation)}. Taç en az ${a.minRelation} ilişkide yardım eder (her yardım ilişkiyi ${a.relationCost} düşürür); kardeşini senden çok seviyorsa onu destekler.`,
              `Your relations with the ${crown}: ${signed(relation)}. The crown helps at ${a.minRelation} relations or more (each aid costs ${a.relationCost} relations); if it likes your brother more than you, it backs him.`,
            )}
          </p>
          <div className="row wrap">
            <button className="btn small" disabled={aidError(kingdom, 'troops') !== null} data-why={AID_WHY[aidError(kingdom, 'troops') ?? ''] ?? L('Taç şu an yardım etmez', 'The crown will not help just now')} onClick={() => ask('troops')}>
              <Icon name="shield" size={16} /> {L('Taçtan asker iste', 'Ask the crown for soldiers')}
            </button>
            <button className="btn small" disabled={aidError(kingdom, 'gold') !== null} data-why={AID_WHY[aidError(kingdom, 'gold') ?? ''] ?? L('Taç şu an yardım etmez', 'The crown will not help just now')} onClick={() => ask('gold')}>
              <Icon name="gold" size={16} /> {L('Taçtan altın iste', 'Ask the crown for gold')}
            </button>
          </div>
        </>
      )}
    </Section>
  )
}

export function DynastySection({ kingdom, now, online, onShow }: { kingdom: Kingdom; now: number; online?: Online | null; onShow?(p: Point): void }) {
  const d = kingdom.dynasty
  if (!d) return null
  const ruler = rulerSkills(kingdom)
  const fx = dynastyEffects(kingdom)
  const heir = heirOf(d, now)
  const council = !!d.council
  const young = council && d.king ? d.king : null
  const taken = houseNames(d)
  // His father among the dead (older saves did not keep it: the last ruler, if old enough to be his father).
  const lastRuler = d.dead.find((p) => p.ruled !== false && p.cause !== 'deposed')
  const father =
    d.king?.father !== undefined
      ? d.dead.find((p) => p.id === d.king!.father)
      : d.king && lastRuler && d.king.bornAt >= lastRuler.bornAt + balance.dynasty.comingOfAge * yearMs()
        ? lastRuler
        : undefined
  const siblings = [...siblingsOf(d)].sort((a, b) => a.bornAt - b.bornAt)
  const children = [...d.children].sort((a, b) => a.bornAt - b.bornAt)
  const left = birthsLeft(d)
  const card = (p: Person, kinship: Kinship) => <KinCard key={p.id} kingdom={kingdom} p={p} kinship={kinship} now={now} online={online} heir={heir?.id === p.id} taken={taken} />
  return (
    <>
      {kingdom.pretender && <PretenderPanel kingdom={kingdom} now={now} online={online} onShow={onShow} />}
      <Section title={L('Hanedan', 'Dynasty')} icon="crown" aside={L(`${d.generation}. kuşak`, `generation ${d.generation}`)}>
        {(father || d.mother) && (
          <>
            <h4 className="house-title">{L('Ebeveynler', 'Parents')}</h4>
            <ul className="ancestors">
              {father && (
                <li>
                  <Portrait seed={father.id * 977 + kingdom.site.x} sex="m" age={ageOf(father, father.diedAt ?? now)} role="king" dead size={40} />
                  <span>{L(`Babası Hükümdar ${father.name} · ${Math.floor(ageOf(father, father.diedAt ?? now))} yaşında öldü`, `His father, the late Ruler ${father.name} · died aged ${Math.floor(ageOf(father, father.diedAt ?? now))}`)}</span>
                </li>
              )}
              {d.mother && (
                <li>
                  <Portrait seed={d.mother.id * 977 + kingdom.site.y} sex="f" age={ageOf(d.mother, now)} role="queen" size={40} />
                  <span>{L(`Annesi Kraliçe ana ${d.mother.name} · ${years(d.mother, now)} yaşında; kardeşleri yatıştırır`, `His mother, Queen Mother ${d.mother.name} · aged ${years(d.mother, now)}; she soothes his brothers`)}</span>
                </li>
              )}
            </ul>
          </>
        )}
        {d.regnant && d.queen && (
          <div className="person regnant">
            <Portrait seed={d.queen.id * 977 + kingdom.site.y} sex="f" age={ageOf(d.queen, now)} role="queen" size={84} />
            <div>
              <b>{L(`Hükümdar Kraliçe ${d.queen.name}`, `Queen Regnant ${d.queen.name}`)}</b>
              <small>{regnantText(d.queen.name, d.kinsmanAt, now)}</small>
              <SkillBars skills={d.queen.skills} />
              <button className="btn small primary" onClick={() => online?.act({ type: 'house', action: 'wedQueen' })}>
                {L('Kraliçeyi evlendir', 'Marry the queen')}
              </button>
            </div>
          </div>
        )}
        <div className="house">
          {d.regnant ? null : council ? (
            <div className="person">
              <Portrait seed={kingdom.site.x * 31 + kingdom.site.y} sex="m" age={62} role="regent" size={84} />
              <div>
                <b>{L('Naipler konseyi', 'Council of regents')}</b>
                <small>
                  {young
                    ? L(
                        `${young.name} reşit olana kadar (${Math.max(0, balance.dynasty.comingOfAge - years(young, now))} yıl) lordluğu yönetir.`,
                        `Rules the lordship until ${young.name} comes of age (${Math.max(0, balance.dynasty.comingOfAge - years(young, now))} years).`,
                      )
                    : L('Varis yok; lordluğu konsey yönetir.', 'No heir; the council rules the lordship.')}
                </small>
                <SkillBars skills={ruler} />
              </div>
            </div>
          ) : (
            d.king && (
              <div className="person">
                <Portrait seed={d.king.id * 977 + kingdom.site.x} sex="m" age={ageOf(d.king, now)} role="king" size={84} />
                <div>
                  <b>{L(`Hükümdar ${d.king.name}`, `Ruler ${d.king.name}`)}</b>
                  <small>{L(`${years(d.king, now)} yaşında · ${d.generation}. kuşak`, `aged ${years(d.king, now)} · generation ${d.generation}`)}</small>
                  <SkillBars skills={d.king.skills} />
                </div>
              </div>
            )
          )}
          {d.regnant ? null : d.queen ? (
            <div className="person">
              <Portrait seed={d.queen.id * 977 + kingdom.site.y} sex="f" age={ageOf(d.queen, now)} role="queen" size={84} />
              <div>
                <b>{L(`Kraliçe ${d.queen.name}`, `Queen ${d.queen.name}`)}</b>
                <small>
                  {L(`${years(d.queen, now)} yaşında`, `aged ${years(d.queen, now)}`)}
                  {kingdom.queenHeldBy ? L(` · ${kingdom.queenHeldBy.name} elinde rehin`, ` · held hostage by ${kingdom.queenHeldBy.name}`) : ''}
                </small>
                <SkillBars skills={d.queen.skills} />
              </div>
            </div>
          ) : (
            <p className="hint">
              {L(
                `Kraliçe yok. Halk sekmesinden bir kraliçe al: hükümdarın çocukları onunla doğar ve sarayı ${balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için şarttır.`,
                `No queen. Take one from the People tab: the ruler's children are born of her, and she is required to raise the palace to level ${balance.dynasty.queenForPalaceLevel}.`,
              )}
            </p>
          )}
        </div>
        <p className="hint">
          {L(
            `${council ? 'Konseyin' : 'Hükümdarın'} etkisi (kraliçenin yeteneklerinin yarısı ve hazinedar da sayılır): vergi ${pct(fx.tax - 1)}, ticaret geliri ${pct(fx.trade)}, mutluluk ${num(fx.happiness)}, iş gücü ${pct(fx.work)}, savaş zarı ${num(fx.dice, 2)}, asker maaşı ${pct(fx.upkeep - 1)}.`,
            `${council ? "The council's" : "The ruler's"} effect (half the queen's skills and the treasurer count too): tax ${pct(fx.tax - 1)}, trade income ${pct(fx.trade)}, happiness ${num(fx.happiness)}, workforce ${pct(fx.work)}, battle dice ${num(fx.dice, 2)}, soldiers' pay ${pct(fx.upkeep - 1)}.`,
          )}
        </p>
        <h4 className="house-title">{L('Kardeşler', 'Siblings')}</h4>
        {siblings.length === 0 ? <p className="hint">{L('Hükümdarın kardeşi yok.', 'The ruler has no siblings.')}</p> : <ul className="children">{siblings.map((p) => card(p, 'sibling'))}</ul>}
        <h4 className="house-title">{L('Çocuklar', 'Children')}</h4>
        {children.length === 0 ? (
          <p className="hint">{d.queen && !council ? L('Henüz çocuk yok; kraliçe saraydayken çocuklar doğar.', 'No children yet; they are born while the queen is at court.') : L('Çocuk yok.', 'No children.')}</p>
        ) : (
          <ul className="children">{children.map((p) => card(p, 'child'))}</ul>
        )}
        <p className="hint">
          {L(
            `Hükümdar ile kraliçesinin en çok iki çocuğu olur: çoğu zaman iki oğul, ya da tek oğul, ya da bir oğul ve bir kız${d.queen && !d.regnant ? ` (daha ${left.sons} oğul, ${left.daughters} kız doğabilir)` : ''}. Tahta geçmeyen kardeşler genç yaşta hastalıktan ölür; salgın da arada bir hanedandan birini götürür (ardılı olmayan hükümdarı değil). Varis kalmazsa ve kraliçe saraydaysa kraliçe yönetir ve evlendirilmesi şarttır. Çocuklar yeteneklerinin bir kısmını anne babadan alır; reşit olmayan çocuk ve kardeşlerin eğitimini seçebilirsin (reşit olunca +${balance.dynasty.skills.education}). Hükümdar ölünce en büyük oğlu, oğlu yoksa en büyük reşit kardeşi geçer; ikisi de yoksa naipler konseyi yönetir. ${I.roles.minAge} yaşını geçen çocuk ve kardeşlere görev verebilir, prensesleri evlendirebilirsin. Reşit erkeklerin hükümdara bir bakışı vardır: kardeşlerden biri iyice hoşnutsuz olursa (${I.revolt.below} altı) isyan edip taht davacısı olabilir.`,
            `A ruler and his queen have at most two children: most often two sons, or a single son, or a son and a daughter${d.queen && !d.regnant ? ` (${left.sons} more son${left.sons === 1 ? '' : 's'}, ${left.daughters} more daughter${left.daughters === 1 ? '' : 's'} may be born)` : ''}. Siblings who do not take the throne die young of illness; now and then the plague also takes one of the house (never a ruler with no successor). If no heir is left and the queen is at court, the queen rules and must be wed. Children take part of their skills from their parents; you can choose the education of children and siblings not yet of age (+${balance.dynasty.skills.education} when of age). When the ruler dies his eldest son succeeds, or with no son his eldest brother of age; with neither, a council of regents rules. You can give posts to children and siblings over ${I.roles.minAge} and marry off the princesses. Grown men have an opinion of the ruler: if a brother grows truly resentful (below ${I.revolt.below}) he may revolt and become a pretender.`,
          )}
        </p>
        {kinOf(d).length > 0 && (
          <>
            <h4 className="house-title">{L('Akrabalar', 'Kin')}</h4>
            <ul className="ancestors">
              {kinOf(d).map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, now)} role={roleOfPortrait(p)} size={40} />
                  <span>
                    {p.sex === 'm' ? 'Lord' : L('Leydi', 'Lady')} {p.name} · {L(`${years(p, now)} yaşında`, `aged ${years(p, now)}`)}
                    {hasOpinion(p, now) ? L(` · sana ${moodWord(opinionOf(kingdom, p, now).ruler)}`, ` · ${moodWord(opinionOf(kingdom, p, now).ruler)} towards you`) : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {marriedOf(d).length > 0 && (
          <>
            <h4 className="house-title">{L('Evlendirilenler', 'Married off')}</h4>
            <ul className="ancestors">
              {marriedOf(d).map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex="f" age={ageOf(p, p.married?.at ?? now)} role="princess" size={40} />
                  <span>
                    {L('Prenses', 'Princess')} {p.name} ·{' '}
                    {p.married?.kind === 'crown'
                      ? L(`${online?.crowns[p.married.crown ?? 0] ?? 'taç'} sarayına gelin gitti`, `wed into the court of the ${online?.crowns[p.married.crown ?? 0] ?? 'crown'}`)
                      : p.married?.kind === 'town'
                        ? L(`${p.married.name} kasabasının ileri gelenlerine gelin gitti`, `wed into the leading family of ${p.married.name}`) +
                          ((kingdom.towns ?? []).some((t) => t.id === p.married?.id) ? L(` (sadakat +${I.marriage.town.loyalty})`, ` (loyalty +${I.marriage.town.loyalty})`) : '')
                        : L(`${p.married?.name ?? '?'} hanedanına gelin gitti`, `wed into the house of ${p.married?.name ?? '?'}`)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {(d.brides ?? []).length > 0 && (
          <>
            <h4 className="house-title">{L('Gelinler', 'Brides')}</h4>
            <ul className="ancestors">
              {(d.brides ?? []).map((b, i) => (
                <li key={i}>
                  <Icon name="flower" size={24} />
                  <span>
                    {b.name} · {L(`${b.from} hanedanından gelin geldi`, `came as a bride from the house of ${b.from}`)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {d.dead.length > 0 && (
          <>
            <h4 className="house-title">{L('Atalar ve ölenler', 'Ancestors and the dead')}</h4>
            <ul className="ancestors scroll3">
              {d.dead.map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, p.diedAt ?? now)} role={p.ruled === false ? roleOfPortrait(p) : p.sex === 'm' ? 'king' : 'queen'} dead size={40} />
                  <span>
                    {p.ruled === false ? `${titleOf(p)} ` : L('Hükümdar ', 'Ruler ')}
                    {p.name} ·{' '}
                    {L(`${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında ${deathOf(p, now)} öldü`, `died aged ${Math.floor(ageOf(p, p.diedAt ?? now))} ${deathOf(p, now)}`)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  )
}

// Whether the house waits on the lord: a young child or brother still to be named, or one with no upbringing chosen; a
// pretender out.
export function houseWaiting(d: Dynasty | undefined, now: number, pretender: boolean) {
  if (!d) return false
  return pretender || [...d.children, ...siblingsOf(d)].some((c) => !ofAge(c, now) && (!c.named || (!d.council && !c.education)))
}

// ---- The house's news ----------------------------------------------------------------------------------------------

export interface HouseNews {
  key: string
  kind: 'birth' | 'death' | 'coronation' | 'council' | 'ofAge' | 'wedding' | 'passing' | 'regnant'
  person: Person
  heir?: Person | null
  // When it happened (a birth, a death), or when this browser first heard of it: how old the news is, for its shelf
  // life as a popup (CLAUDE.md §9.8).
  at?: number
}

const knownKey = (lobby: string, id: number) => `house:${lobby}:${id}`

export function readKnown(lobby: string, id: number): Set<string> | null {
  try {
    const raw = localStorage.getItem(knownKey(lobby, id))
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

export function writeKnown(lobby: string, id: number, known: Set<string>) {
  try {
    localStorage.setItem(knownKey(lobby, id), JSON.stringify([...known].slice(-200)))
  } catch {
    // Told again next time: no harm.
  }
}

// What the house shows that the player has not been told yet (by what it holds now, so news reached on the server is
// told too): births, children and brothers come of age, deaths and who followed, a lady come to court. A pretender put
// down is told by the envoy.
export function houseNews(d: Dynasty, known: Set<string>, at: number): HouseNews[] {
  const news: HouseNews[] = []
  const recent = (t: number | undefined) => t !== undefined && at - t < 3 * 24 * 3_600_000
  if (d.queen && !known.has(`wed:${d.queen.id}`)) news.push({ key: `wed:${d.queen.id}`, kind: 'wedding', person: d.queen })
  for (const c of d.children) {
    if (!known.has(`birth:${c.id}`) && recent(c.bornAt)) news.push({ key: `birth:${c.id}`, kind: 'birth', person: c, at: c.bornAt })
  }
  for (const c of [...d.children, ...siblingsOf(d)]) {
    if (c.grown && !known.has(`age:${c.id}`)) news.push({ key: `age:${c.id}`, kind: 'ofAge', person: c })
  }
  for (const p of d.dead) {
    if (known.has(`death:${p.id}`) || !recent(p.diedAt) || p.cause === 'rebel' || p.cause === 'deposed') continue
    news.push(p.ruled === false ? { key: `death:${p.id}`, kind: 'passing', person: p, at: p.diedAt } : { key: `death:${p.id}`, kind: 'death', person: p, heir: d.king, at: p.diedAt })
  }
  if (d.king && !d.council && d.generation > 1 && !known.has(`crown:${d.king.id}`)) news.push({ key: `crown:${d.king.id}`, kind: 'coronation', person: d.king })
  if (d.council && !known.has(`council:${d.dead[0]?.id ?? 0}`)) news.push({ key: `council:${d.dead[0]?.id ?? 0}`, kind: 'council', person: d.king ?? d.dead[0] })
  // The widowed lady left to rule alone: the envoy tells the lord she must be wed (CLAUDE.md §9.1).
  if (d.regnant && d.queen && !known.has(`regnant:${d.queen.id}:${d.dead[0]?.id ?? 0}`)) news.push({ key: `regnant:${d.queen.id}:${d.dead[0]?.id ?? 0}`, kind: 'regnant', person: d.queen })
  return news.filter((n) => n.person)
}

// Everything the house holds now, as told (for a first visit: the past is not news).
export function allKnown(d: Dynasty) {
  const known = new Set<string>()
  if (d.queen) known.add(`wed:${d.queen.id}`)
  for (const c of [...d.children, ...siblingsOf(d)]) {
    known.add(`birth:${c.id}`)
    if (c.grown) known.add(`age:${c.id}`)
  }
  for (const p of d.dead) known.add(`death:${p.id}`)
  if (d.king) known.add(`crown:${d.king.id}`)
  if (d.council) known.add(`council:${d.dead[0]?.id ?? 0}`)
  if (d.regnant && d.queen) known.add(`regnant:${d.queen.id}:${d.dead[0]?.id ?? 0}`)
  return known
}

export const TITLES: Record<HouseNews['kind'], string> = {
  birth: L('Hanedanda bir doğum!', 'A birth in the house!'),
  death: L('Hükümdar öldü', 'The ruler is dead'),
  coronation: L('Yeni hükümdar', 'A new ruler'),
  council: L('Naipler konseyi', 'Council of regents'),
  ofAge: L('Reşit oldu', 'Come of age'),
  wedding: L('Kraliçe saraya geldi', 'The queen has come to court'),
  passing: L('Hanedandan bir ölüm', 'A death in the house'),
  regnant: L('Kraliçe tek başına', 'The queen rules alone'),
}

const HOUSE_CUES = { birth: 'birth', death: 'death', coronation: 'coronation', council: 'council', ofAge: 'ofAge', wedding: 'wedding', passing: 'death', regnant: 'council' } as const

export function HouseDialog({ news, kingdom, now, online, onClose }: { news: HouseNews; kingdom: Kingdom; now: number; online?: Online | null; onClose(): void }) {
  const p = news.person
  // The house's news, each with its own sound: a lullaby, the funeral bell, a coronation fanfare…
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => playOnce(`house:${news.key}`, HOUSE_CUES[news.kind]), [news.key])
  const role = news.kind === 'wedding' || news.kind === 'regnant' ? 'queen' : news.kind === 'death' || news.kind === 'coronation' ? 'king' : roleOfPortrait(p)
  const d = kingdom.dynasty
  const sibling = !!d && siblingsOf(d).some((c) => c.id === p.id)
  // Followed by his son (or, with none, his brother).
  const son = !!news.heir && (news.heir.father === p.id || news.heir.bornAt >= p.bornAt + balance.dynasty.comingOfAge * yearMs())
  const text =
    news.kind === 'birth'
      ? L(
          `Kraliçe ${d?.queen?.name ?? ''} bir ${p.sex === 'm' ? 'oğlan' : 'kız'} doğurdu! Halk sevinçle kutluyor. Ona bir ad koy; hükümdar yaşadıkça eğitimini Saray sekmesinin Hanedan bölümünden seçebilirsin.`,
          `Queen ${d?.queen?.name ?? ''} has given birth to a ${p.sex === 'm' ? 'boy' : 'girl'}! The people celebrate with joy. Give the child a name; while the ruler lives you can choose the child's education in the Dynasty section of the Palace tab.`,
        )
      : news.kind === 'death'
        ? L(`Hükümdar ${p.name}, ${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında ${deathOf(p, now, true)} öldü. `, `Ruler ${p.name} died aged ${Math.floor(ageOf(p, p.diedAt ?? now))}, ${deathOf(p, now, true)}. `) +
          (d?.regnant && d.queen
            ? L(`Ne oğlu ne kardeşi kaldı; lordluğu şimdilik Kraliçe ${d.queen.name} yönetiyor, ama evlenmesi şart.`, `He left neither son nor brother; Queen ${d.queen.name} rules the lordship for now, but she must be wed.`)
            : news.heir && !d?.council
              ? L(
                  `Yerine ${son ? 'oğlu' : 'kardeşi'} ${news.heir.name} geçti${son ? `; ${p.name} hükümdarın öbür çocukları artık yeni hükümdarın kardeşleri` : ''}.`,
                  `His ${son ? 'son' : 'brother'} ${news.heir.name} succeeds him${son ? `; Ruler ${p.name}'s other children are now the new ruler's siblings` : ''}.`,
                )
              : news.heir
                ? L(`Oğlu ${news.heir.name} reşit olana kadar naipler konseyi yönetecek.`, `A council of regents will rule until his son ${news.heir.name} comes of age.`)
                : L(
                    `Varisi olmadığı için lordluğu naipler konseyi yönetecek; ${balance.dynasty.council.kinsmanYears} yıl sonra hanedandan bir akraba tahta çağrılacak.`,
                    `With no heir, a council of regents will rule the lordship; in ${balance.dynasty.council.kinsmanYears} years a kinsman of the house will be called to the throne.`,
                  )) +
          (d?.regnant ? '' : L(' Kraliçe artık kraliçe ana; yeni hükümdarın kendi kraliçesini alması gerekecek.', ' The queen is now the queen mother; the new ruler will need to take a queen of his own.'))
        : news.kind === 'coronation'
          ? L(`${p.name} tahta çıktı. Hanedanın ${d?.generation ?? 1}. hükümdarı o.`, `${p.name} has taken the throne. He is ruler number ${d?.generation ?? 1} of the house.`)
          : news.kind === 'council'
            ? L(
                'Hükümdarın yerine geçecek reşit bir oğul ya da kardeş olmadığı için lordluğu naipler konseyi yönetiyor. Konseyin yetenekleri vasattır.',
                'With no son or brother of age to succeed the ruler, a council of regents rules the lordship. The council’s skills are middling.',
              )
            : news.kind === 'ofAge'
              ? L(
                  `${titleOf(p)} ${p.name}${sibling ? ', hükümdarın kardeşi,' : ''} ${balance.dynasty.comingOfAge} yaşına girdi ve reşit oldu.${p.education ? ` Hocalarının emeği karşılığını verdi: ${SKILL_NAMES[p.education].toLowerCase()} yeteneği arttı.` : ''}${p.sex === 'f' ? ' Artık evlendirilebilir.' : ''}`,
                  `${titleOf(p)} ${p.name}${sibling ? ", the ruler's sibling," : ''} has turned ${balance.dynasty.comingOfAge} and come of age.${p.education ? ` The tutors' labours paid off: ${SKILL_NAMES[p.education].toLowerCase()} skill has risen.` : ''}${p.sex === 'f' ? ' She can now be married off.' : ''}`,
                )
              : news.kind === 'passing'
                ? L(
                    `${titleOf(p)} ${p.name}, ${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında ${deathOf(p, now)} öldü. Hanedan yasta.`,
                    `${titleOf(p)} ${p.name} died aged ${Math.floor(ageOf(p, p.diedAt ?? now))}, ${deathOf(p, now)}. The house is in mourning.`,
                  )
                : news.kind === 'regnant'
                  ? regnantText(p.name, d?.kinsmanAt, now)
                  : L(
                      `Kraliçe ${p.name} saraya geldi. Halk düğünü günlerce kutladı; hükümdarın çocukları onunla doğacak.`,
                      `Queen ${p.name} has come to court. The people celebrated the wedding for days; the ruler's children will be born of her.`,
                    )
  return (
    <div className="modal" role="dialog" aria-labelledby="house-title">
      <section className="dialog frame away house-dialog">
        <header className="sheet-head">
          {news.kind === 'regnant' ? <EnvoyPortrait size={40} /> : <Icon name="crown" size={32} />}
          <div>
            <small>{news.kind === 'regnant' ? L('Elçi haber getirdi', 'The envoy brings news') : L('Hanedandan haber', 'News of the house')}</small>
            <h2 id="house-title">{TITLES[news.kind]}</h2>
          </div>
        </header>
        <DynastyArt kind={news.kind === 'passing' ? 'death' : news.kind === 'regnant' ? 'coronation' : news.kind} seed={p.id} />
        <div className="person">
          <Portrait
            seed={p.id * 977 + (role === 'queen' ? kingdom.site.y : kingdom.site.x)}
            sex={p.sex}
            age={ageOf(p, news.kind === 'death' || news.kind === 'passing' ? (p.diedAt ?? now) : now)}
            role={news.kind === 'council' ? 'regent' : role}
            dead={news.kind === 'death' || news.kind === 'passing'}
            size={84}
          />
          <div>
            <p>{text}</p>
            <SkillBars skills={p.skills} />
          </div>
        </div>
        {news.kind === 'birth' && !p.named ? (
          <NameField
            key={p.id}
            person={p}
            label={L('Çocuğun adı', "The child's name")}
            wide
            taken={houseNames(d)}
            onSave={(name) => {
              online?.act({ type: 'nameChild', id: p.id, name })
              onClose()
            }}
          />
        ) : news.kind === 'regnant' && d?.regnant ? (
          <DialogFoot label={L('Kraliçeyi evlendir', 'Marry the queen')} onNext={() => (online?.act({ type: 'house', action: 'wedQueen' }), onClose())}>
            <button className="btn small" onClick={onClose}>
              {L('Sonra', 'Later')}
            </button>
          </DialogFoot>
        ) : (
          <DialogFoot onNext={onClose} />
        )}
      </section>
    </div>
  )
}

// The envoy on the widowed lady left to rule alone (CLAUDE.md §9.1): she rules for now, but she must be wed, by the
// lord's word or, when the time runs out, by the council's.
export function regnantText(name: string, by: number | undefined, now: number) {
  const left = by === undefined ? null : Math.max(0, Math.ceil((by - now) / 60_000))
  return L(
    `Lordum, hanedanda tahta geçecek kimse kalmadı: ne bir oğul ne bir kardeş. Lordluğu şimdilik Kraliçe ${name} yönetiyor; kendi yetenekleriyle, naipsiz. Ama bir kraliçenin tek başına hüküm sürmesini ne halk ne taç uzun süre kabul eder. Onu evlendirmeliyiz; seçeceğimiz soylu bey tahta çıkar, çocukları hanedanı sürdürür.${left !== null ? ` Biz karar vermezsek ${left} dakika içinde konsey kendisi bir eş bulacak.` : ''}`,
    `My lord, there is no one left in the house to take the throne: not a son, not a brother. For now Queen ${name} rules the lordship on her own skills, without regents. Splendid woman. But neither the people nor the crown will long abide a queen reigning alone, so we must find her a husband; the noble lord we choose takes the throne, and his children carry on the house. I have a list. It is short.${left !== null ? ` Should we dither, the council will pick a husband for her itself within ${left} minute${left === 1 ? '' : 's'}.` : ''}`,
  )
}
