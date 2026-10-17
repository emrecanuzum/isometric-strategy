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
import { DynastyArt, Portrait } from '../DynastyArt'
import { DialogFoot } from '../DialogQueue'
import { Icon } from '../icons'
import type { Online } from './online'
import { Meter, Section } from './primitives'

// The lord's house on the palace's tab (CLAUDE.md §9.1, §9.1.1), seen from the ruler: his parents, himself and his
// lady, his brothers and sisters, his children, the kin, the daughters and sisters married off, the ladies married in,
// and the house's dead. The grown men's feelings for the ruler (and the crown's for them), their posts and gifts, the
// princesses' marriages, and a pretender's camp if a brother has risen. And the news of the house.

export const SKILL_NAMES: Record<Skill, string> = { finance: 'Maliye', people: 'Halk', military: 'Askerlik' }
const SKILL_NOTES: Record<Skill, string> = {
  finance: 'vergi ve ticaret geliri',
  people: 'halkın mutluluğu ve iş gücü',
  military: 'askerlerin zarı ve maaşı',
}
export const ROLE_NAMES: Record<KinRoleKind, string> = { governor: 'Vali', commander: 'Devriye komutanı', treasurer: 'Hazinedar' }
const PART_NAMES: Record<OpinionPart['key'], string> = {
  base: 'Yakınlık',
  ruler: 'Hükümdarın yetenekleri',
  happiness: 'Halkın mutluluğu',
  role: 'Görevi var',
  elder: 'Büyük kardeş: tahtta gözü var',
  council: 'Naipler yönetiyor',
  mother: 'Kraliçe ana yatıştırıyor',
  ambition: 'Hırsı',
  commander: 'Tacın devriyesini yönetiyor',
  military: 'Askerlik yeteneği',
  marriage: 'Hanedanla akrabalık',
  recent: 'Son olaylar',
}

const I = balance.dynasty.intrigue
const years = (p: Pick<Person, 'bornAt'>, at: number) => Math.floor(ageOf(p, at))
const stage = (p: Person, at: number) => {
  const age = ageOf(p, at)
  return age < 3 ? 'bebek' : age < 12 ? 'çocuk' : age < balance.dynasty.comingOfAge ? 'genç' : 'reşit'
}
const pct = (v: number) => `${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 100))}`
const num = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits).replace('.', ',')}`
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// A prince or a princess by sex (never "Prens" for a daughter).
export const titleOf = (p: Pick<Person, 'sex'>) => (p.sex === 'm' ? 'Prens' : 'Prenses')
const roleOfPortrait = (p: Pick<Person, 'sex'>) => (p.sex === 'm' ? 'prince' : 'princess')

// How a man of the house feels, in a word.
export const moodWord = (v: number) => (v >= 40 ? 'sadık' : v >= 10 ? 'iyi' : v >= I.opinion.warn ? 'mesafeli' : v >= I.revolt.below ? 'hoşnutsuz' : 'düşman')

function SkillBars({ skills }: { skills: Record<Skill, number> }) {
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
      <button type="button" className="btn small" title="Rastgele bir ad" onClick={() => setName(randomName(person.sex, Math.random(), taken.filter((n) => n !== person.name)))}>
        <Icon name="dice" size={16} /> Rastgele
      </button>
      <button className={wide ? 'btn primary' : 'btn small'} disabled={name.trim().length < 2}>
        Koy
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
        <small>Sana</small>
        <Meter value={(op.ruler + 100) / 200} tone={op.ruler >= 10 ? 'up' : op.ruler < I.opinion.warn ? 'down' : 'gold'} label="Hükümdara bakışı" segments={10} />
        <b>{signed(op.ruler)}</b>
      </span>
      <small className={op.ruler < I.opinion.warn ? 'down' : ''}>
        {moodWord(op.ruler)}: {parts.map((x) => `${PART_NAMES[x.key].toLowerCase()} ${signed(x.value)}`).join(', ')}
      </small>
      {sworn && (
        <small className={op.crown > lord ? 'down' : ''} title={op.parts.crown.map((x) => `${PART_NAMES[x.key]} ${signed(x.value)}`).join(' · ')}>
          Taç onu {signed(op.crown)} seviyor, seni {signed(lord)}.{op.crown > lord ? ' İsyan ederse taç onu destekler!' : ''}
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
        <select className="text" value={town ?? ''} onChange={(e) => setTown(Number(e.target.value))} disabled={held.length === 0} aria-label="Kasaba">
          {held.length === 0 ? <option value="">Elinde kasaba yok</option> : held.map((t) => <option key={t.id} value={t.id}>{t.name ?? `Kasaba ${t.id}`}</option>)}
        </select>
        <button className="btn small" disabled={governor !== null} onClick={() => give('governor', town)}>
          Vali yap
        </button>
      </div>
      <small>Vali: kasabanın sadakat hedefi +{Math.round(loyalty)} (halk yeteneğiyle artar).</small>
      <button className="btn small" disabled={roleError(kingdom, p.id, 'commander', now) !== null} onClick={() => give('commander')}>
        Tacın devriyesinin başına geçir
      </button>
      <small>
        Devriye komutanı: devriyenin bahşişi +%{tip}, her uğrayışta taçla ilişki +{cmd.visitRelation} fazla, taçla ilişkin +{cmd.crownRest} daha yüksekte dinlenir. Ama taç onu da çok
        sever (+{I.crownBond.commander}): isyan ederse onu destekleyebilir.{p.sex === 'f' ? ' (Yalnızca prensler.)' : ''}
      </small>
      <button className="btn small" disabled={roleError(kingdom, p.id, 'treasurer', now) !== null} onClick={() => give('treasurer')}>
        Hazinedar yap
      </button>
      <small>Hazinedar: vergi {pct(tax)} (maliye yeteneğiyle artar).</small>
      {p.role && (
        <button className="btn small danger" onClick={() => give(null)}>
          Görevden al{p.sex === 'm' ? ` (gücenir: ${I.opinion.roleRemoved})` : ''}
        </button>
      )}
    </div>
  )
}

// A grown princess married off: into the liege crown's house, a town's first family (one held, or a free one that comes
// over), or another lord's house (an envoy carries the proposal).
function MarryPicker({ kingdom, p, now, online, onDone }: { kingdom: Kingdom; p: Person; now: number; online?: Online | null; onDone(): void }) {
  const held = (kingdom.towns ?? []).map((t) => ({ id: t.id, name: t.name ?? `Kasaba ${t.id}`, free: false }))
  const free = (online?.towns ?? []).filter((t) => t.owner === null && !t.siege && !t.rebels).map((t) => ({ id: t.id, name: t.name, free: true }))
  const towns = [...held, ...free]
  const lords = (online?.kingdoms ?? []).filter((k) => k.id !== online?.me)
  const [town, setTown] = useState<number | undefined>(towns[0]?.id)
  const [lord, setLord] = useState<number | undefined>(lords[0]?.id)
  const m = I.marriage
  const crownName = kingdom.liege !== undefined && kingdom.liege !== null ? (online?.crowns[kingdom.liege] ?? 'Taç') : null
  const chosen = towns.find((t) => t.id === town)
  const marry = (to: { kind: 'crown' } | { kind: 'town'; town: number } | { kind: 'lord'; id: number }) => {
    online?.act({ type: 'house', action: 'marry', id: p.id, to })
    onDone()
  }
  return (
    <div className="kin-picker">
      <button className="btn small" disabled={marryError(kingdom, p.id, { kind: 'crown' }, now) !== null} onClick={() => marry({ kind: 'crown' })}>
        {crownName ? `${crownName} sarayına gelin ver` : 'Taca gelin ver (önce biat et)'} · {dowryOf('crown')} altın çeyiz
      </button>
      <small>Taçla ilişkin hemen +{m.crown.relation}, sonra hep +{m.crown.crownRest} daha yüksekte dinlenir; taç hanedanının erkeklerini de biraz daha sever.</small>
      <div className="row">
        <select className="text" value={town ?? ''} onChange={(e) => setTown(Number(e.target.value))} disabled={towns.length === 0} aria-label="Kasaba">
          {towns.length === 0 ? <option value="">Uygun kasaba yok</option> : towns.map((t) => <option key={t.id} value={t.id}>{t.name}{t.free ? ' (kimsenin değil)' : ''}</option>)}
        </select>
        <button className="btn small" disabled={!chosen || marryError(kingdom, p.id, { kind: 'town', town: chosen.id, name: chosen.name, free: chosen.free }, now) !== null} onClick={() => chosen && marry({ kind: 'town', town: chosen.id })}>
          Kasabaya gelin ver · {dowryOf('town')} altın
        </button>
      </div>
      <small>
        Kasabanın ileri gelen ailesine gelin gider: elindeki kasabanın sadakat hedefi kalıcı olarak +{m.town.loyalty}; kimsenin olmayan bir kasaba ise kuşatmasız sana bağlanır (sadakat
        %{m.town.freeLoyalty} ile başlar; aşırı büyümeye dikkat).
      </small>
      <div className="row">
        <select className="text" value={lord ?? ''} onChange={(e) => setLord(Number(e.target.value))} disabled={lords.length === 0} aria-label="Lord">
          {lords.length === 0 ? <option value="">Lobide başka lord yok</option> : lords.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <button className="btn small" disabled={lord === undefined} onClick={() => lord !== undefined && marry({ kind: 'lord', id: lord })}>
          Elçiyle teklif et
        </button>
      </div>
      <small>Kabul ederse prenses onun hanedanına gelin gider ve ilişkiniz +{m.lord.relation} artar. Savaştayken teklif edilemez.</small>
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
          {heir && <span className="chip">varis</span>}
          {p.role && <span className="chip">{ROLE_NAMES[p.role.kind]}{town ? ` · ${town}` : ''}</span>}
        </b>
        <small>
          {kinship === 'sibling' ? (p.sex === 'm' ? 'Kardeşin' : 'Kız kardeşin') : p.sex === 'm' ? 'Oğlun' : 'Kızın'} · {years(p, now)} yaşında · {stage(p, now)}
          {p.education && ` · ${SKILL_NAMES[p.education].toLowerCase()} eğitimi${minor ? ` (reşit olunca +${balance.dynasty.skills.education})` : ''}`}
        </small>
        {lapsed && <small className="down">Valisi olduğu kasaba elden çıktı; yeni bir görev ver ya da görevden al.</small>}
        <SkillBars skills={p.skills} />
        {hasOpinion(p, now) && <OpinionLine kingdom={kingdom} p={p} now={now} />}
        {canTeach && <small className={p.education ? 'education-note' : 'education-note todo'}>{p.education ? `Eğitimi: ${SKILL_NAMES[p.education]}` : 'Eğitim seçilmedi: hocalarına bir yetenek seç'}</small>}
        {canTeach && (
          <div className="segmented choices education" role="radiogroup" aria-label="Eğitim">
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
              Adını koy
            </button>
          )}
          {grownForRole && (
            <button className={open === 'role' ? 'btn small active' : 'btn small'} onClick={() => toggle('role')}>
              <Icon name="scroll" size={16} /> Görev
            </button>
          )}
          {hasOpinion(p, now) && (
            <button className="btn small" disabled={gift !== null} title={gift === 'cooldown' ? 'Az önce hediye verdin' : gift === 'cost' ? 'Yeterli altın yok' : ''} onClick={() => online?.act({ type: 'house', action: 'gift', id: p.id })}>
              <Icon name="gold" size={16} /> Hediye ({I.gift.gold} altın, +{I.gift.opinion})
            </button>
          )}
          {p.sex === 'f' && !minor && (
            <button className={open === 'marry' ? 'btn small active' : 'btn small'} onClick={() => toggle('marry')}>
              <Icon name="flower" size={16} /> Evlendir
            </button>
          )}
        </div>
        {open === 'name' && !p.named && (
          <NameField
            key={p.id}
            person={p}
            label="Ad"
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
  const crown = kingdom.liege !== undefined && kingdom.liege !== null ? (online?.crowns[kingdom.liege] ?? 'Taç') : null
  const armies = (online?.armies ?? []).filter((a) => a.kingdom_id === online?.me && a.status !== 'battle')
  const relation = crown ? Math.round(crownRelation(kingdom, kingdom.liege!)) : 0
  const ask = (kind: 'troops' | 'gold') => online?.act({ type: 'house', action: 'aid', kind })
  const a = I.aid
  return (
    <Section title={`Taht davacısı ${p.person.name}`} icon="swords" aside={`${soldiers} asi`}>
      <p className="hint down">
        Kardeşin {p.person.name} sana isyan etti ve sınırının yakınında bir karargâh kurdu
        {p.deserters ? `; garnizonundan ${p.deserters} asker onunla gitti` : ''}. Karargâh her dakika büyüyor
        {p.backed ? ` ve ${crown ?? 'taç'} onu destekliyor (daha hızlı büyür, tacın askerleri yanında)` : ''}.{' '}
        {p.marching ? 'Şimdi sarayını kuşatıyor! Kuşatmayı kaybedersen tahtı o alır.' : `${clock(p.marchAt - now)} sonra sarayını kuşatacak; kuşatmayı kaybedersen tahtı o alır.`}
      </p>
      {p.battle ? (
        <button className="btn small" onClick={() => online?.watch(p.battle!)}>
          <Icon name="swords" size={16} /> Savaşı izle
        </button>
      ) : (
        !p.marching && (
          <>
            <p className="hint">Karargâha bir ordu gönder: varınca saldırır. Karargâhın çiti savunmasına katılır; en az {Math.ceil(soldiers * 1.4)} askerle gitmek akıllıcadır.</p>
            {armies.length === 0 ? (
              <p className="hint">Sahada ordun yok: Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <div className="row wrap">
                {armies.map((army) => (
                  <button key={army.id} className="btn small" onClick={() => online?.act({ type: 'army', army: army.id, order: { kind: 'move', x: p.at.x, y: p.at.y } })}>
                    <Icon name="swords" size={16} /> {army.soldiers ?? '?'} askerlik orduyu gönder
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}
      {onShow && (
        <button className="btn small" onClick={() => onShow(p.at)}>
          <Icon name="pin" size={16} /> Karargâhı göster
        </button>
      )}
      {crown && (
        <>
          <p className="hint">
            {crown} ile ilişkin {signed(relation)}. Taç en az {a.minRelation} ilişkide yardım eder (her yardım ilişkiyi {a.relationCost} düşürür); kardeşini senden çok
            seviyorsa onu destekler.
          </p>
          <div className="row wrap">
            <button className="btn small" disabled={aidError(kingdom, 'troops') !== null} onClick={() => ask('troops')}>
              <Icon name="shield" size={16} /> Taçtan asker iste
            </button>
            <button className="btn small" disabled={aidError(kingdom, 'gold') !== null} onClick={() => ask('gold')}>
              <Icon name="gold" size={16} /> Taçtan altın iste
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
      <Section title="Hanedan" icon="crown" aside={`${d.generation}. kuşak`}>
        {(father || d.mother) && (
          <>
            <h4 className="house-title">Ebeveynler</h4>
            <ul className="ancestors">
              {father && (
                <li>
                  <Portrait seed={father.id * 977 + kingdom.site.x} sex="m" age={ageOf(father, father.diedAt ?? now)} role="king" dead size={40} />
                  <span>Babası Hükümdar {father.name} · {Math.floor(ageOf(father, father.diedAt ?? now))} yaşında öldü</span>
                </li>
              )}
              {d.mother && (
                <li>
                  <Portrait seed={d.mother.id * 977 + kingdom.site.y} sex="f" age={ageOf(d.mother, now)} role="queen" size={40} />
                  <span>Annesi Kraliçe ana {d.mother.name} · {years(d.mother, now)} yaşında; kardeşleri yatıştırır</span>
                </li>
              )}
            </ul>
          </>
        )}
        <div className="house">
          {council ? (
            <div className="person">
              <Portrait seed={kingdom.site.x * 31 + kingdom.site.y} sex="m" age={62} role="regent" size={84} />
              <div>
                <b>Naipler konseyi</b>
                <small>{young ? `${young.name} reşit olana kadar (${Math.max(0, balance.dynasty.comingOfAge - years(young, now))} yıl) lordluğu yönetir.` : 'Varis yok; lordluğu konsey yönetir.'}</small>
                <SkillBars skills={ruler} />
              </div>
            </div>
          ) : (
            d.king && (
              <div className="person">
                <Portrait seed={d.king.id * 977 + kingdom.site.x} sex="m" age={ageOf(d.king, now)} role="king" size={84} />
                <div>
                  <b>Hükümdar {d.king.name}</b>
                  <small>
                    {years(d.king, now)} yaşında · {d.generation}. kuşak
                  </small>
                  <SkillBars skills={d.king.skills} />
                </div>
              </div>
            )
          )}
          {d.queen ? (
            <div className="person">
              <Portrait seed={d.queen.id * 977 + kingdom.site.y} sex="f" age={ageOf(d.queen, now)} role="queen" size={84} />
              <div>
                <b>Kraliçe {d.queen.name}</b>
                <small>
                  {years(d.queen, now)} yaşında{kingdom.queenHeldBy ? ` · ${kingdom.queenHeldBy.name} elinde rehin` : ''}
                </small>
                <SkillBars skills={d.queen.skills} />
              </div>
            </div>
          ) : (
            <p className="hint">
              Kraliçe yok. Halk sekmesinden bir kraliçe al: hükümdarın çocukları onunla doğar ve sarayı {balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için şarttır.
            </p>
          )}
        </div>
        <p className="hint">
          {council ? 'Konseyin' : 'Hükümdarın'} etkisi (kraliçenin yeteneklerinin yarısı ve hazinedar da sayılır): vergi {pct(fx.tax - 1)}, ticaret geliri {pct(fx.trade)}, mutluluk{' '}
          {num(fx.happiness)}, iş gücü {pct(fx.work)}, savaş zarı {num(fx.dice, 2)}, asker maaşı {pct(fx.upkeep - 1)}.
        </p>
        <h4 className="house-title">Kardeşler</h4>
        {siblings.length === 0 ? <p className="hint">Hükümdarın kardeşi yok.</p> : <ul className="children">{siblings.map((p) => card(p, 'sibling'))}</ul>}
        <h4 className="house-title">Çocuklar</h4>
        {children.length === 0 ? (
          <p className="hint">{d.queen && !council ? 'Henüz çocuk yok; kraliçe saraydayken çocuklar doğar.' : 'Çocuk yok.'}</p>
        ) : (
          <ul className="children">{children.map((p) => card(p, 'child'))}</ul>
        )}
        <p className="hint">
          Hükümdar ile kraliçesinin en çok {balance.dynasty.births.maxSons} oğlu ve {balance.dynasty.births.maxDaughters} kızı olur
          {d.queen ? ` (daha ${left.sons} oğul, ${left.daughters} kız doğabilir)` : ''}. Çocuklar yeteneklerinin bir kısmını anne babadan alır; reşit olmayan çocuk ve kardeşlerin eğitimini
          seçebilirsin (reşit olunca +{balance.dynasty.skills.education}). Hükümdar ölünce en büyük oğlu, oğlu yoksa en büyük reşit kardeşi geçer; ikisi de yoksa naipler konseyi yönetir.{' '}
          {I.roles.minAge} yaşını geçen çocuk ve kardeşlere görev verebilir, prensesleri evlendirebilirsin. Reşit erkeklerin hükümdara bir bakışı vardır: kardeşlerden biri iyice
          hoşnutsuz olursa ({I.revolt.below} altı) isyan edip taht davacısı olabilir.
        </p>
        {kinOf(d).length > 0 && (
          <>
            <h4 className="house-title">Akrabalar</h4>
            <ul className="ancestors">
              {kinOf(d).map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, now)} role={roleOfPortrait(p)} size={40} />
                  <span>
                    {p.sex === 'm' ? 'Lord' : 'Leydi'} {p.name} · {years(p, now)} yaşında
                    {hasOpinion(p, now) ? ` · sana ${moodWord(opinionOf(kingdom, p, now).ruler)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {marriedOf(d).length > 0 && (
          <>
            <h4 className="house-title">Evlendirilenler</h4>
            <ul className="ancestors">
              {marriedOf(d).map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex="f" age={ageOf(p, p.married?.at ?? now)} role="princess" size={40} />
                  <span>
                    Prenses {p.name} ·{' '}
                    {p.married?.kind === 'crown'
                      ? `${online?.crowns[p.married.crown ?? 0] ?? 'taç'} sarayına gelin gitti`
                      : p.married?.kind === 'town'
                        ? `${p.married.name} kasabasının ileri gelenlerine gelin gitti${(kingdom.towns ?? []).some((t) => t.id === p.married?.id) ? ` (sadakat +${I.marriage.town.loyalty})` : ''}`
                        : `${p.married?.name ?? '?'} hanedanına gelin gitti`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {(d.brides ?? []).length > 0 && (
          <>
            <h4 className="house-title">Gelinler</h4>
            <ul className="ancestors">
              {(d.brides ?? []).map((b, i) => (
                <li key={i}>
                  <Icon name="flower" size={24} />
                  <span>
                    {b.name} · {b.from} hanedanından gelin geldi
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {d.dead.length > 0 && (
          <>
            <h4 className="house-title">Atalar ve ölenler</h4>
            <ul className="ancestors">
              {d.dead.map((p) => (
                <li key={p.id}>
                  <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, p.diedAt ?? now)} role={p.ruled === false ? roleOfPortrait(p) : p.sex === 'm' ? 'king' : 'queen'} dead size={40} />
                  <span>
                    {p.ruled === false ? `${p.sex === 'm' ? 'Prens' : 'Prenses'} ` : 'Hükümdar '}
                    {p.name} · {Math.floor(ageOf(p, p.diedAt ?? now))} yaşında{' '}
                    {p.cause === 'battle' ? 'savaşta düşerek' : p.cause === 'grief' ? 'kahrından' : p.cause === 'rebel' ? 'isyanı bastırılırken' : p.cause === 'deposed' ? 'tahttan indirilerek' : 'yaşlılıktan'} öldü
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
  kind: 'birth' | 'death' | 'coronation' | 'council' | 'ofAge' | 'wedding' | 'passing'
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
  return known
}

export const TITLES: Record<HouseNews['kind'], string> = {
  birth: 'Hanedanda bir doğum!',
  death: 'Hükümdar öldü',
  coronation: 'Yeni hükümdar',
  council: 'Naipler konseyi',
  ofAge: 'Reşit oldu',
  wedding: 'Kraliçe saraya geldi',
  passing: 'Hanedandan bir ölüm',
}

const HOUSE_CUES = { birth: 'birth', death: 'death', coronation: 'coronation', council: 'council', ofAge: 'ofAge', wedding: 'wedding', passing: 'death' } as const

export function HouseDialog({ news, kingdom, now, online, onClose }: { news: HouseNews; kingdom: Kingdom; now: number; online?: Online | null; onClose(): void }) {
  const p = news.person
  // The house's news, each with its own sound: a lullaby, the funeral bell, a coronation fanfare…
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => playOnce(`house:${news.key}`, HOUSE_CUES[news.kind]), [news.key])
  const role = news.kind === 'wedding' ? 'queen' : news.kind === 'death' || news.kind === 'coronation' ? 'king' : roleOfPortrait(p)
  const d = kingdom.dynasty
  const sibling = !!d && siblingsOf(d).some((c) => c.id === p.id)
  // Followed by his son (or, with none, his brother).
  const son = !!news.heir && (news.heir.father === p.id || news.heir.bornAt >= p.bornAt + balance.dynasty.comingOfAge * yearMs())
  const text =
    news.kind === 'birth'
      ? `Kraliçe ${d?.queen?.name ?? ''} bir ${p.sex === 'm' ? 'oğlan' : 'kız'} doğurdu! Halk sevinçle kutluyor. Ona bir ad koy; hükümdar yaşadıkça eğitimini Saray sekmesinin Hanedan bölümünden seçebilirsin.`
      : news.kind === 'death'
        ? `Hükümdar ${p.name}, ${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında ${p.cause === 'battle' ? 'ordusunun başında savaşırken' : p.cause === 'grief' ? 'kaybedilen savaşın kahrından' : 'yaşlılıktan'} öldü. ${
            news.heir && !d?.council
              ? `Yerine ${son ? 'oğlu' : 'kardeşi'} ${news.heir.name} geçti${son ? `; ${p.name} hükümdarın öbür çocukları artık yeni hükümdarın kardeşleri` : ''}.`
              : news.heir
                ? `Oğlu ${news.heir.name} reşit olana kadar naipler konseyi yönetecek.`
                : `Varisi olmadığı için lordluğu naipler konseyi yönetecek; ${balance.dynasty.council.kinsmanYears} yıl sonra hanedandan bir akraba tahta çağrılacak.`
          } Kraliçe artık kraliçe ana; yeni hükümdarın kendi kraliçesini alması gerekecek.`
        : news.kind === 'coronation'
          ? `${p.name} tahta çıktı. Hanedanın ${d?.generation ?? 1}. hükümdarı o.`
          : news.kind === 'council'
            ? 'Hükümdarın yerine geçecek reşit bir oğul ya da kardeş olmadığı için lordluğu naipler konseyi yönetiyor. Konseyin yetenekleri vasattır.'
            : news.kind === 'ofAge'
              ? `${titleOf(p)} ${p.name}${sibling ? ', hükümdarın kardeşi,' : ''} ${balance.dynasty.comingOfAge} yaşına girdi ve reşit oldu.${p.education ? ` Hocalarının emeği karşılığını verdi: ${SKILL_NAMES[p.education].toLowerCase()} yeteneği arttı.` : ''}${p.sex === 'f' ? ' Artık evlendirilebilir.' : ''}`
              : news.kind === 'passing'
                ? `${titleOf(p)} ${p.name}, ${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında yaşlılıktan öldü. Hanedan yasta.`
                : `Kraliçe ${p.name} saraya geldi. Halk düğünü günlerce kutladı; hükümdarın çocukları onunla doğacak.`
  return (
    <div className="modal" role="dialog" aria-labelledby="house-title">
      <section className="dialog frame away house-dialog">
        <header className="sheet-head">
          <Icon name="crown" size={32} />
          <div>
            <small>Hanedandan haber</small>
            <h2 id="house-title">{TITLES[news.kind]}</h2>
          </div>
        </header>
        <DynastyArt kind={news.kind === 'passing' ? 'death' : news.kind} seed={p.id} />
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
            label="Çocuğun adı"
            wide
            taken={houseNames(d)}
            onSave={(name) => {
              online?.act({ type: 'nameChild', id: p.id, name })
              onClose()
            }}
          />
        ) : (
          <DialogFoot onNext={onClose} />
        )}
      </section>
    </div>
  )
}
