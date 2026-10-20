import {
  crisisWarded,
  isCrisis,
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
import type { Building, Cost, Kingdom } from '@game/shared'
import { Fragment, useState } from 'react'
import { L } from '../../lib/i18n'
import { Icon } from '../icons'
import { FORTUNE_TEXTS, RESEARCH_CATEGORY_NAMES, RESEARCH_NAMES, SCOPE_NAMES } from '../names'
import { CostList } from '../panels'
import { lackWhy } from '../why'
import { Meter, Section, Stat } from './primitives'
import type { HudData } from './tabs'

// The menus of the university, the hospital and the temple (CLAUDE.md §9.8), and the day's fortune.

const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
const secs = (ms: number) => (ms >= 60_000 ? L(`${Math.ceil(ms / 60_000)} dk`, `${Math.ceil(ms / 60_000)} min`) : L(`${Math.ceil(ms / 1000)} sn`, `${Math.ceil(ms / 1000)} s`))

const RESEARCH_BLOCKED: Record<string, string> = {
  building: L('Üniversite inşa ediliyor', 'The university is being built'),
  have: L('Öğrenildi', 'Learnt'),
  locked: L('Üniversiteyi yükselt', 'Upgrade the university'),
  prereq: L('Önce alt kademe', 'Lower tier first'),
  excluded: L('Kapandı', 'Closed'),
  busy: L('Başka araştırma sürüyor', 'Other research under way'),
  cost: L('Kaynak yetersiz', 'Not enough resources'),
}

export function UniversityPanel({ data }: { data: HudData }) {
  const { kingdom, now, online } = data
  const level = levelOf(kingdom, 'university', now)
  const current = researching(kingdom, now)
  const [branch, setBranch] = useState(RESEARCH_CATEGORIES[0])
  const tiers = [...new Set(RESEARCH_IDS.filter((id) => RESEARCH[id].category === branch).map((id) => RESEARCH[id].tier))].sort((a, b) => a - b)
  return (
    <Section title={L('Araştırma ağacı', 'Research tree')} icon="book" aside={L(`üniversite ${level}. seviye`, `university level ${level}`)}>
      {current && (
        <div className="sign">
          <span>{RESEARCH_NAMES[current.id]?.name ?? current.id}</span>
          <Meter value={1 - (current.doneAt - now) / (RESEARCH[current.id].seconds * 1000)} label={L('Araştırma', 'Research')} segments={10} />
          <small>{secs(current.doneAt - now)}</small>
        </div>
      )}
      <div className="branch-tabs" role="tablist" aria-label={L('Araştırma dalı', 'Research branch')}>
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
              <small className="tree-label">{L(`${tier}. kademe · üniversite ${RESEARCH[pair[0]].level}. seviye`, `Tier ${tier} · university level ${RESEARCH[pair[0]].level}`)}</small>
              <div className="tree-pair">
                {pair.map((id, k) => (
                  <Fragment key={id}>
                    {k > 0 && <span className="tree-or">{L('ya da', 'or')}</span>}
                    <ResearchNode id={id} other={pair.find((o) => o !== id)} data={data} onStart={() => online?.act({ type: 'research', id })} />
                  </Fragment>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="hint">
        {L(
          'Her kademede iki yoldan yalnızca biri seçilebilir; seçilmeyen yol sonsuza dek kapanır. Bir kademe, aynı daldaki bir alt kademe öğrenilince açılır. Aynı anda bir araştırma yürür.',
          'At each tier only one of two paths may be chosen; the other closes for good. A tier opens once a lower tier in the same branch is learnt. Only one piece of research runs at a time.',
        )}
      </p>
    </Section>
  )
}

// Choosing one path of a tier closes the other for good: the first tap asks, the second starts it.
function ResearchNode({ id, other, data, onStart }: { id: string; other?: string; data: HudData; onStart: () => void }) {
  const { kingdom, now } = data
  const [asking, setAsking] = useState(false)
  // The other path is still open (neither taken nor closed): starting this one shuts it.
  const closes = !!other && researchError(kingdom, other, now) !== 'excluded' && !(kingdom.researches ?? []).some((x) => x.id === other)
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
        <span className="chip up">{L('Öğrenildi', 'Learnt')}</span>
      ) : going ? (
        <span className="chip">{L('Araştırılıyor', 'Researching')}</span>
      ) : error === 'excluded' ? (
        <span className="chip down">{L('Kapandı', 'Closed')}</span>
      ) : (
        <>
          <CostList cost={spec.cost} stock={kingdom.stock} />
          <button
            className="btn small"
            disabled={error !== null}
            data-why={error === 'cost' ? (lackWhy(kingdom.stock, spec.cost) ?? RESEARCH_BLOCKED.cost) : error ? (RESEARCH_BLOCKED[error] ?? L('Şu an araştırılamaz', 'Cannot be researched now')) : undefined}
            onClick={() => {
              if (closes && !asking) return setAsking(true)
              setAsking(false)
              onStart()
            }}
            onBlur={() => setAsking(false)}
          >
            {error
              ? RESEARCH_BLOCKED[error] ?? L('Şu an olmaz', 'Not now')
              : asking
                ? L(`Emin misin? ${RESEARCH_NAMES[other!]?.name ?? 'Öbür yol'} kapanır`, `Are you sure? ${RESEARCH_NAMES[other!]?.name ?? 'The other path'} closes`)
                : L(`Araştır · ${secs(spec.seconds * 1000)}`, `Research · ${secs(spec.seconds * 1000)}`)}
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
    <Section title={L('Şifahane', 'Infirmary')} icon="heal" aside={L(`${pct(hospitalHeal(level) * crew)} / tur`, `${pct(hospitalHeal(level) * crew)} / round`)}>
      <Sickness kingdom={kingdom} now={now} />
      <p className="hint">
        {L(
          `Doktorlar her tur hastaların ${pct(hospitalHeal(level))} kadarını iyileştirir (tam kadroyla); halk kendiliğinden de yavaşça iyileşir. Hasta köylüler çalışmaz ve vergi vermez.`,
          `The doctors heal ${pct(hospitalHeal(level))} of the sick every round (fully staffed); the people also slowly recover on their own. Sick villagers neither work nor pay taxes.`,
        )}
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
      <span>{L('Hasta', 'Sick')}</span>
      <Meter value={share / balance.institutions.sickness.max} tone={share > 0.15 ? 'down' : share > 0.05 ? 'gold' : 'up'} label={L('Hastalık', 'Sickness')} segments={10} />
      <small>
        {L(`${Math.round(sick)} / ${villagers} köylü (${pct(share)})`, `${Math.round(sick)} / ${villagers} villagers (${pct(share)})`)}
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
      <Section title={L('İnanç', 'Faith')} icon="temple">
        <Stat label={L('Mutluluğa etkisi', 'Effect on happiness')} value={`+${templeHappiness(kingdom, now)}`} />
        <Stat label={L('Askerlerin zarına', "To the soldiers' dice")} value={`+${battleSpirit(kingdom, now).toFixed(1).replace('.', L(',', '.'))}`} note={L('iman gücü (taktik araştırması dahil)', 'strength of faith (tactics research included)')} />
      </Section>
      <Section title={L('Vaaz', 'Sermon')} icon="scroll" aside={preaching(kingdom, now) ? L(`${secs((kingdom.sermonUntil ?? 0) - now)} sürüyor`, `${secs((kingdom.sermonUntil ?? 0) - now)} left`) : undefined}>
        <p className="hint">
          {L(
            `Rahipler halka vergilerin iyi olduğunu anlatır: ${secs(sermon.seconds * 1000)} boyunca verginin mutluluğa olumsuz etkisinin yalnızca ${pct(sermon.taxFactorByLevel[Math.min(sermon.taxFactorByLevel.length, level) - 1])} kadarı hissedilir.`,
            `The priests tell the people that taxes are good: for ${secs(sermon.seconds * 1000)} only ${pct(sermon.taxFactorByLevel[Math.min(sermon.taxFactorByLevel.length, level) - 1])} of the tax's harm to happiness is felt.`,
          )}
        </p>
        <div className="row">
          <CostList cost={sermon.cost} stock={kingdom.stock} />
          <button className="btn small" disabled={error !== null} data-why={error === 'busy' ? L(`Rahipler dinleniyor; ${secs(ready - now)} sonra`, `The priests are resting; in ${secs(ready - now)}`) : error === 'cost' ? (lackWhy(kingdom.stock, sermon.cost as Cost) ?? L('Kaynak yetmiyor', 'Not enough resources')) : error === 'building' ? L('Tapınak henüz bitmedi', 'The temple is not finished yet') : L('Şu an vaaz verilemez', 'No sermon can be given now')} onClick={() => online?.act({ type: 'sermon' })}>
            {L('Vaaz ver', 'Preach')}
          </button>
        </div>
        {error === 'busy' && <small className="hint">{L(`Yeni vaaz ${secs(ready - now)} sonra.`, `Next sermon in ${secs(ready - now)}.`)}</small>}
        {preaching(kingdom, now) && <small className="up">{L('Vergi etkisi şu an', 'Tax effect now')} ×{sermonTaxFactor(kingdom, now).toFixed(2).replace('.', L(',', '.'))}</small>}
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
        // A crisis met by the villagers or the army does no harm: the strip says so instead of the harm.
        const warded = isCrisis(f.kind) && crisisWarded(kingdom, f)
        return (
          <p key={f.scope + f.start} className={`fortune-note tone-${warded ? 'good' : t?.tone ?? 'good'}`}>
            <Icon name={t?.icon ?? 'star'} size={16} />
            <span>
              <small className="scope">{SCOPE_NAMES[f.scope]}</small> <b>{t?.title}</b> {warded ? L('Zarar önlendi; olayın kötü etkisi işlemiyor.', 'Harm averted; the event\'s ill effects do not apply.') : t?.text} <small>({L(`${secs(f.end - now)} kaldı`, `${secs(f.end - now)} left`)})</small>
            </span>
          </p>
        )
      })}
    </>
  )
}
