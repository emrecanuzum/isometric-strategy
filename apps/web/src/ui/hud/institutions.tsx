import {
  RESEARCH,
  RESEARCH_IDS,
  balance,
  battleSpirit,
  fortuneAt,
  hospitalHeal,
  levelOf,
  population,
  preaching,
  researchError,
  researching,
  sermonError,
  sermonReadyAt,
  sermonTaxFactor,
  staffOf,
  templeHappiness,
  workerSlots,
} from '@game/shared'
import type { Building, Kingdom } from '@game/shared'
import { Icon } from '../icons'
import { FORTUNE_TEXTS, RESEARCH_NAMES } from '../names'
import { CostList } from '../panels'
import { Meter, Section, Stat } from './primitives'
import type { HudData } from './tabs'

// The menus of the university, the hospital and the temple (CLAUDE.md §9.8), and the day's fortune.

const pct = (v: number) => `%${Math.round(v * 100)}`
const secs = (ms: number) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} dk` : `${Math.ceil(ms / 1000)} sn`)

const RESEARCH_BLOCKED: Record<string, string> = {
  building: 'Üniversite inşa ediliyor',
  have: 'Öğrenildi',
  locked: 'Daha yüksek seviye üniversite gerekir',
  busy: 'Başka bir araştırma sürüyor',
  cost: 'Kaynak yetersiz',
}

export function UniversityPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const level = levelOf(kingdom, 'university', now)
  const current = researching(kingdom, now)
  return (
    <Section title="Araştırmalar" icon="book" aside={`üniversite ${level}. seviye`}>
      {current && (
        <div className="sign">
          <span>{RESEARCH_NAMES[current.id]?.name ?? current.id}</span>
          <Meter value={1 - (current.doneAt - now) / (RESEARCH[current.id].seconds * 1000)} label="Araştırma" segments={10} />
          <small>{secs(current.doneAt - now)}</small>
        </div>
      )}
      <ul className="research-list">
        {RESEARCH_IDS.map((id) => {
          const spec = RESEARCH[id]
          const r = RESEARCH_NAMES[id]
          const error = researchError(kingdom, id, now)
          const done = (kingdom.researches ?? []).some((x) => x.id === id && x.doneAt <= now)
          return (
            <li key={id} className={done ? 'done' : error === 'locked' ? 'locked' : ''}>
              <Icon name={r?.icon ?? 'book'} size={16} />
              <div>
                <b>{r?.name ?? id}</b>
                <small>
                  {r?.note} · {spec.level}. seviye · {spec.seconds} sn
                </small>
              </div>
              {done ? (
                <span className="chip up">Öğrenildi</span>
              ) : (
                <button className="btn small" disabled={error !== null} title={error ? RESEARCH_BLOCKED[error] : undefined} onClick={() => online?.act({ type: 'research', id })}>
                  <CostList cost={spec.cost} stock={kingdom.stock} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="hint">Aynı anda bir araştırma yürür. Üniversiteyi yükseltmek daha ileri araştırmaları açar.</p>
    </Section>
  )
}

export function HospitalPanel({ building: b, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const level = levelOf(kingdom, 'hospital', now)
  const slots = workerSlots(b)
  const crew = slots === 0 ? 1 : staffOf(b) / slots
  return (
    <Section title="Şifahane" icon="heal" aside={`${pct(hospitalHeal(level) * crew)} / tur`}>
      <Sickness kingdom={kingdom} now={now} />
      <p className="hint">
        Doktorlar her tur hastaların {pct(hospitalHeal(level))} kadarını iyileştirir (tam kadroyla); halk kendiliğinden de yavaşça iyileşir. Hasta köylüler
        çalışmaz ve vergi vermez.
      </p>
    </Section>
  )
}

// How many lie sick and where it is heading; shown by the hospital and on the people's tab.
export function Sickness({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const { sick, villagers } = population(kingdom, now)
  const share = kingdom.sickness ?? 0
  return (
    <div className="sign">
      <span>Hasta</span>
      <Meter value={share / balance.institutions.sickness.max} tone={share > 0.15 ? 'down' : share > 0.05 ? 'gold' : 'up'} label="Hastalık" segments={10} />
      <small>
        {Math.round(sick)} / {villagers} köylü ({pct(share)})
      </small>
    </div>
  )
}

export function TemplePanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const level = Math.max(1, levelOf(kingdom, 'temple', now))
  const sermon = balance.institutions.temple.sermon
  const error = sermonError(kingdom, now)
  const ready = sermonReadyAt(kingdom)
  return (
    <>
      <Section title="İnanç" icon="temple">
        <Stat label="Mutluluğa etkisi" value={`+${templeHappiness(kingdom, now)}`} />
        <Stat label="Askerlerin zarına" value={`+${battleSpirit(kingdom, now).toFixed(1).replace('.', ',')}`} note="iman gücü (taktik araştırması dahil)" />
      </Section>
      <Section title="Vaaz" icon="scroll" aside={preaching(kingdom, now) ? `${secs((kingdom.sermonUntil ?? 0) - now)} sürüyor` : undefined}>
        <p className="hint">
          Rahipler halka vergilerin iyi olduğunu anlatır: {secs(sermon.seconds * 1000)} boyunca verginin mutluluğa olumsuz etkisinin yalnızca{' '}
          {pct(sermon.taxFactorByLevel[Math.min(sermon.taxFactorByLevel.length, level) - 1])} kadarı hissedilir.
        </p>
        <div className="row">
          <CostList cost={sermon.cost} stock={kingdom.stock} />
          <button className="btn small" disabled={error !== null} onClick={() => online?.act({ type: 'sermon' })}>
            Vaaz ver
          </button>
        </div>
        {error === 'busy' && <small className="hint">Yeni vaaz {secs(ready - now)} sonra.</small>}
        {preaching(kingdom, now) && <small className="up">Vergi etkisi şu an ×{sermonTaxFactor(kingdom, now).toFixed(2).replace('.', ',')}</small>}
      </Section>
    </>
  )
}

// The fortune of the moment, if any, as a strip on the people's tab.
export function FortuneNote({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const f = fortuneAt(kingdom, now)
  if (!f) return null
  const t = FORTUNE_TEXTS[f.kind]
  return (
    <p className={`fortune-note tone-${t?.tone ?? 'good'}`}>
      <Icon name={t?.icon ?? 'star'} size={16} />
      <span>
        <b>{t?.title}</b> {t?.text} <small>({secs(f.end - now)} kaldı)</small>
      </span>
    </p>
  )
}
