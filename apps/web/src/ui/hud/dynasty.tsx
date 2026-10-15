import { SKILLS, ageOf, balance, dynastyEffects, ofAge, randomName, rulerSkills } from '@game/shared'
import type { Dynasty, Kingdom, Person, Skill } from '@game/shared'
import { useState } from 'react'
import { DynastyArt, Portrait } from '../DynastyArt'
import { Icon } from '../icons'
import type { Online } from './online'
import { Meter, Section } from './primitives'

// The lord's house on the palace's tab (CLAUDE.md §9.1): the ruler and the lady with their portraits and gifts, what
// those gifts do for the realm, the children (named, brought up), and the house's dead. And the news of the house:
// births, deaths, successions, children coming of age.

export const SKILL_NAMES: Record<Skill, string> = { finance: 'Maliye', people: 'Halk', military: 'Askerlik' }
const SKILL_NOTES: Record<Skill, string> = {
  finance: 'vergi ve ticaret geliri',
  people: 'halkın mutluluğu ve iş gücü',
  military: 'askerlerin zarı ve maaşı',
}

const years = (p: Pick<Person, 'bornAt'>, at: number) => Math.floor(ageOf(p, at))
const stage = (p: Person, at: number) => {
  const age = ageOf(p, at)
  return age < 3 ? 'bebek' : age < 12 ? 'çocuk' : age < balance.dynasty.comingOfAge ? 'genç' : 'reşit'
}
const pct = (v: number) => `${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 100))}`
const num = (v: number, digits = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits).replace('.', ',')}`

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

// A name typed in, or rolled when none comes to mind.
function NameField({ person, label, wide, onSave }: { person: Person; label: string; wide?: boolean; onSave(name: string): void }) {
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
      <button type="button" className="btn small" title="Rastgele bir ad" onClick={() => setName(randomName(person.sex, Math.random()))}>
        <Icon name="dice" size={16} /> Rastgele
      </button>
      <button className={wide ? 'btn primary' : 'btn small'} disabled={name.trim().length < 2}>
        Koy
      </button>
    </form>
  )
}

// The eldest son, who would follow the lord.
export const heirOf = (d: Dynasty) => [...d.children].filter((c) => c.sex === 'm').sort((a, b) => a.bornAt - b.bornAt)[0] ?? null

export function DynastySection({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online | null }) {
  const d = kingdom.dynasty
  const [naming, setNaming] = useState<number | null>(null)
  if (!d) return null
  const ruler = rulerSkills(kingdom)
  const fx = dynastyEffects(kingdom)
  const heir = heirOf(d)
  const council = !!d.council
  const young = council && d.king ? d.king : null
  const act = online?.act
  // A child is named once: until the lord names it, it bears the name drawn for it. The ruler and the lady keep theirs.
  const nameOnce = (p: Person) =>
    p.named ? null : naming === p.id ? (
      <NameField
        person={p}
        label="Ad"
        onSave={(name) => {
          act?.({ type: 'nameChild', id: p.id, name })
          setNaming(null)
        }}
      />
    ) : (
      <button className="btn small" onClick={() => setNaming(p.id)}>
        Adını koy
      </button>
    )
  return (
    <Section title="Hanedan" icon="crown" aside={`${d.generation}. kuşak`}>
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
            Kraliçe yok. Halk sekmesinden bir kraliçe al: hanedanın çocukları onunla doğar ve sarayı {balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için
            şarttır.
          </p>
        )}
      </div>
      <p className="hint">
        {council ? 'Konseyin' : 'Hükümdarın'} etkisi (kraliçenin yeteneklerinin yarısı da sayılır): vergi {pct(fx.tax - 1)}, ticaret geliri {pct(fx.trade)}, mutluluk{' '}
        {num(fx.happiness)}, iş gücü {pct(fx.work)}, savaş zarı {num(fx.dice, 2)}, asker maaşı {pct(fx.upkeep - 1)}.
      </p>
      <h4 className="house-title">Çocuklar</h4>
      {d.children.length === 0 ? (
        <p className="hint">{d.queen && !council ? 'Henüz çocuk yok; kraliçe saraydayken çocuklar doğar.' : 'Çocuk yok.'}</p>
      ) : (
        <ul className="children">
          {[...d.children]
            .sort((a, b) => a.bornAt - b.bornAt)
            .map((c) => {
              const minor = !ofAge(c, now)
              const canTeach = minor && !council
              return (
                <li key={c.id}>
                  <Portrait seed={c.id * 977 + kingdom.site.x} sex={c.sex} age={ageOf(c, now)} role={c.sex === 'm' ? 'prince' : 'princess'} size={60} />
                  <div>
                    <b>
                      {c.sex === 'm' ? 'Prens' : 'Prenses'} {c.name}
                      {heir?.id === c.id && <span className="chip">varis</span>}
                    </b>
                    <small>
                      {years(c, now)} yaşında · {stage(c, now)}
                      {c.education && ` · ${SKILL_NAMES[c.education].toLowerCase()} eğitimi${minor ? ` (reşit olunca +${balance.dynasty.skills.education})` : ''}`}
                    </small>
                    <SkillBars skills={c.skills} />
                    {canTeach && (
                      <small className={c.education ? 'education-note' : 'education-note todo'}>{c.education ? `Eğitimi: ${SKILL_NAMES[c.education]}` : 'Eğitim seçilmedi: hocalarına bir yetenek seç'}</small>
                    )}
                    {canTeach && (
                      <div className="segmented three education" role="radiogroup" aria-label="Eğitim">
                        {SKILLS.map((s) => (
                          <button key={s} role="radio" aria-checked={c.education === s} className={c.education === s ? 'btn small active' : 'btn small'} onClick={() => act?.({ type: 'educate', id: c.id, focus: s })}>
                            {SKILL_NAMES[s]}
                          </button>
                        ))}
                      </div>
                    )}
                    {nameOnce(c)}
                  </div>
                </li>
              )
            })}
        </ul>
      )}
      <p className="hint">
        Çocuklar yeteneklerinin bir kısmını anne babadan alır. Hükümdar yaşarken her çocuğun eğitimini seçebilirsin: seçilen yetenek çocuk {balance.dynasty.comingOfAge}{' '}
        yaşına gelince +{balance.dynasty.skills.education} artar. Hükümdar yaşlanınca ya da kaybedilen bir savaşın kahrıyla ölür; yerine en büyük oğlu geçer. Oğlu yoksa
        ya da oğlu reşit değilse lordluğu naipler konseyi yönetir.
      </p>
      {d.dead.length > 0 && (
        <>
          <h4 className="house-title">Atalar</h4>
          <ul className="ancestors">
            {d.dead.map((p) => (
              <li key={p.id}>
                <Portrait seed={p.id * 977 + kingdom.site.x} sex={p.sex} age={ageOf(p, p.diedAt ?? now)} role={p.sex === 'm' ? 'king' : 'queen'} dead size={40} />
                <span>
                  {p.name} · {Math.floor(ageOf(p, p.diedAt ?? now))} yaşında {p.cause === 'grief' ? 'kahrından' : 'yaşlılıktan'} öldü
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

// ---- The house's news ----------------------------------------------------------------------------------------------

export interface HouseNews {
  key: string
  kind: 'birth' | 'death' | 'coronation' | 'council' | 'ofAge' | 'wedding'
  person: Person
  heir?: Person | null
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
// told too): births, children come of age, deaths and who followed, a lady come to court.
export function houseNews(d: Dynasty, known: Set<string>, at: number): HouseNews[] {
  const news: HouseNews[] = []
  const recent = (t: number | undefined) => t !== undefined && at - t < 3 * 24 * 3_600_000
  if (d.queen && !known.has(`wed:${d.queen.id}`)) news.push({ key: `wed:${d.queen.id}`, kind: 'wedding', person: d.queen })
  for (const c of d.children) {
    if (!known.has(`birth:${c.id}`) && recent(c.bornAt)) news.push({ key: `birth:${c.id}`, kind: 'birth', person: c })
    if (c.grown && !known.has(`age:${c.id}`)) news.push({ key: `age:${c.id}`, kind: 'ofAge', person: c })
  }
  for (const p of d.dead) {
    if (!known.has(`death:${p.id}`) && recent(p.diedAt)) news.push({ key: `death:${p.id}`, kind: 'death', person: p, heir: d.king })
  }
  if (d.king && !d.council && d.generation > 1 && !known.has(`crown:${d.king.id}`)) news.push({ key: `crown:${d.king.id}`, kind: 'coronation', person: d.king })
  if (d.council && !known.has(`council:${d.dead[0]?.id ?? 0}`)) news.push({ key: `council:${d.dead[0]?.id ?? 0}`, kind: 'council', person: d.king ?? d.dead[0] })
  return news.filter((n) => n.person)
}

// Everything the house holds now, as told (for a first visit: the past is not news).
export function allKnown(d: Dynasty) {
  const known = new Set<string>()
  if (d.queen) known.add(`wed:${d.queen.id}`)
  for (const c of d.children) {
    known.add(`birth:${c.id}`)
    if (c.grown) known.add(`age:${c.id}`)
  }
  for (const p of d.dead) known.add(`death:${p.id}`)
  if (d.king) known.add(`crown:${d.king.id}`)
  if (d.council) known.add(`council:${d.dead[0]?.id ?? 0}`)
  return known
}

const TITLES: Record<HouseNews['kind'], string> = {
  birth: 'Hanedanda bir doğum!',
  death: 'Hükümdar öldü',
  coronation: 'Yeni hükümdar',
  council: 'Naipler konseyi',
  ofAge: 'Reşit oldu',
  wedding: 'Kraliçe saraya geldi',
}

export function HouseDialog({ news, kingdom, now, online, onClose }: { news: HouseNews; kingdom: Kingdom; now: number; online?: Online | null; onClose(): void }) {
  const p = news.person
  const role = news.kind === 'wedding' ? 'queen' : news.kind === 'death' || news.kind === 'coronation' ? 'king' : p.sex === 'm' ? 'prince' : 'princess'
  const text =
    news.kind === 'birth'
      ? `Kraliçe ${kingdom.dynasty?.queen?.name ?? ''} bir ${p.sex === 'm' ? 'oğlan' : 'kız'} doğurdu! Halk sevinçle kutluyor. Ona bir ad koy; hükümdar yaşadıkça eğitimini Saray sekmesinin Hanedan bölümünden seçebilirsin.`
      : news.kind === 'death'
        ? `Hükümdar ${p.name}, ${Math.floor(ageOf(p, p.diedAt ?? now))} yaşında ${p.cause === 'grief' ? 'kaybedilen savaşın kahrından' : 'yaşlılıktan'} öldü. ${
            news.heir && !kingdom.dynasty?.council ? `Yerine oğlu ${news.heir.name} geçti.` : news.heir ? `Oğlu ${news.heir.name} reşit olana kadar naipler konseyi yönetecek.` : 'Oğlu olmadığı için lordluğu naipler konseyi yönetecek.'
          } Kraliçe artık kraliçe ana; yeni hükümdarın kendi kraliçesini alması gerekecek.`
        : news.kind === 'coronation'
          ? `${p.name} tahta çıktı. Hanedanın ${kingdom.dynasty?.generation ?? 1}. hükümdarı o.`
          : news.kind === 'council'
            ? 'Hükümdarın yerine geçecek reşit bir oğul olmadığı için lordluğu naipler konseyi yönetiyor. Konseyin yetenekleri vasattır.'
            : news.kind === 'ofAge'
              ? `${p.sex === 'm' ? 'Prens' : 'Prenses'} ${p.name} ${balance.dynasty.comingOfAge} yaşına girdi ve reşit oldu.${p.education ? ` Hocalarının emeği karşılığını verdi: ${SKILL_NAMES[p.education].toLowerCase()} yeteneği arttı.` : ''}`
              : `Kraliçe ${p.name} saraya geldi. Halk düğünü günlerce kutladı; hanedanın çocukları onunla doğacak.`
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
        <DynastyArt kind={news.kind} seed={p.id} />
        <div className="person">
          <Portrait seed={p.id * 977 + (role === 'queen' ? kingdom.site.y : kingdom.site.x)} sex={p.sex} age={ageOf(p, news.kind === 'death' ? (p.diedAt ?? now) : now)} role={news.kind === 'council' ? 'regent' : role} dead={news.kind === 'death'} size={84} />
          <div>
            <p>{text}</p>
            <SkillBars skills={p.skills} />
          </div>
        </div>
        {news.kind === 'birth' && !p.named ? (
          <NameField
            person={p}
            label="Çocuğun adı"
            wide
            onSave={(name) => {
              online?.act({ type: 'nameChild', id: p.id, name })
              onClose()
            }}
          />
        ) : (
          <div className="row spread">
            <span />
            <button className="btn small" onClick={onClose}>
              Tamam
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
