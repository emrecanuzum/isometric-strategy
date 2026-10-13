import {
  RESEARCH,
  RESEARCH_CATEGORIES,
  RESEARCH_IDS,
  balance,
  battleSpirit,
  fortunesAt,
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
import { Fragment, useState } from 'react'
import { Icon } from '../icons'
import { FORTUNE_TEXTS, RESEARCH_CATEGORY_NAMES, RESEARCH_NAMES, SCOPE_NAMES } from '../names'
import { CostList } from '../panels'
import { Meter, Section, Stat } from './primitives'
import type { HudData } from './tabs'

// The menus of the university, the hospital and the temple (CLAUDE.md §9.8), and the day's fortune.

const pct = (v: number) => `%${Math.round(v * 100)}`
const secs = (ms: number) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} dk` : `${Math.ceil(ms / 1000)} sn`)

const RESEARCH_BLOCKED: Record<string, string> = {
  building: 'Üniversite inşa ediliyor',
  have: 'Öğrenildi',
  locked: 'Üniversiteyi yükselt',
  prereq: 'Önce alt kademe',
  excluded: 'Kapandı',
  busy: 'Başka araştırma sürüyor',
  cost: 'Kaynak yetersiz',
}

export function UniversityPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const level = levelOf(kingdom, 'university', now)
  const current = researching(kingdom, now)
  const [branch, setBranch] = useState(RESEARCH_CATEGORIES[0])
  const tiers = [...new Set(RESEARCH_IDS.filter((id) => RESEARCH[id].category === branch).map((id) => RESEARCH[id].tier))].sort((a, b) => a - b)
  return (
    <Section title="Araştırma ağacı" icon="book" aside={`üniversite ${level}. seviye`}>
      {current && (
        <div className="sign">
          <span>{RESEARCH_NAMES[current.id]?.name ?? current.id}</span>
          <Meter value={1 - (current.doneAt - now) / (RESEARCH[current.id].seconds * 1000)} label="Araştırma" segments={10} />
          <small>{secs(current.doneAt - now)}</small>
        </div>
      )}
      <div className="branch-tabs" role="tablist" aria-label="Araştırma dalı">
        {RESEARCH_CATEGORIES.map((c) => (
          <button key={c} className="btn small" role="tab" aria-selected={branch === c} aria-pressed={branch === c} onClick={() => setBranch(c)}>
            <Icon name={RESEARCH_CATEGORY_NAMES[c]?.icon ?? 'book'} size={16} />
            <span>{RESEARCH_CATEGORY_NAMES[c]?.name ?? c}</span>
          </button>
        ))}
      </div>
      <ol className="tree">
        {tiers.map((tier) => {
          const pair = RESEARCH_IDS.filter((id) => RESEARCH[id].category === branch && RESEARCH[id].tier === tier)
          return (
            <li key={tier} className="tree-tier">
              <small className="tree-label">{tier}. kademe · üniversite {RESEARCH[pair[0]].level}. seviye</small>
              <div className="tree-pair">
                {pair.map((id, k) => (
                  <Fragment key={id}>
                    {k > 0 && <span className="tree-or">ya da</span>}
                    <ResearchNode id={id} data={data} onStart={() => online?.act({ type: 'research', id })} />
                  </Fragment>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="hint">
        Her kademede iki yoldan yalnızca biri seçilebilir; seçilmeyen yol sonsuza dek kapanır. Bir kademe, aynı daldaki bir alt kademe öğrenilince
        açılır. Aynı anda bir araştırma yürür.
      </p>
    </Section>
  )
}

function ResearchNode({ id, data, onStart }: { id: string; data: HudData; onStart: () => void }) {
  const { kingdom, now } = data
  const spec = RESEARCH[id]
  const r = RESEARCH_NAMES[id]
  const error = researchError(kingdom, id, now)
  const done = (kingdom.researches ?? []).some((x) => x.id === id && x.doneAt <= now)
  const going = (kingdom.researches ?? []).some((x) => x.id === id && x.doneAt > now)
  const state = done ? 'done' : going ? 'going' : error === 'excluded' ? 'closed' : error === 'prereq' || error === 'locked' ? 'locked' : 'open'
  return (
    <div className={`tree-node ${state}`}>
      <span className="tree-head">
        <Icon name={r?.icon ?? 'book'} size={16} />
        <b>{r?.name ?? id}</b>
      </span>
      <small>{r?.note}</small>
      {done ? (
        <span className="chip up">Öğrenildi</span>
      ) : going ? (
        <span className="chip">Araştırılıyor</span>
      ) : error === 'excluded' ? (
        <span className="chip down">Kapandı</span>
      ) : (
        <>
          <CostList cost={spec.cost} stock={kingdom.stock} />
          <button className="btn small" disabled={error !== null} onClick={onStart}>
            {error ? RESEARCH_BLOCKED[error] ?? 'Şu an olmaz' : `Araştır · ${secs(spec.seconds * 1000)}`}
          </button>
        </>
      )}
    </div>
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

// The fortunes of the moment, as strips on the people's tab: whether the whole lobby shares it or it is the kingdom's
// own.
export function FortuneNote({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  return (
    <>
      {fortunesAt(kingdom, now).map((f) => {
        const t = FORTUNE_TEXTS[f.kind]
        return (
          <p key={f.scope + f.start} className={`fortune-note tone-${t?.tone ?? 'good'}`}>
            <Icon name={t?.icon ?? 'star'} size={16} />
            <span>
              <small className="scope">{SCOPE_NAMES[f.scope]}</small> <b>{t?.title}</b> {t?.text} <small>({secs(f.end - now)} kaldı)</small>
            </span>
          </p>
        )
      })}
    </>
  )
}
