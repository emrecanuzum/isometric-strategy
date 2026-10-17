import {
  GOODS,
  PROJECT_IDS,
  balance,
  donationError,
  donationReadyAt,
  donationUnits,
  festivalCost,
  festivalError,
  festivalOn,
  festivalReadyAt,
  palaceLevel,
  projectEffects,
  projectError,
  projectGift,
  projectOf,
  projectStage,
  projectStageCost,
  projectStageMs,
  projectStages,
} from '@game/shared'
import type { Good, Kingdom, ProjectId, Resource } from '@game/shared'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { CostList } from '../panels'
import { lackWhy } from '../why'
import type { Online } from './online'
import { Meter, Section, Stat, fmt } from './primitives'

// The realm's great works, the festival and gifts of goods to the liege (CLAUDE.md §9.10): the Saray tab's "Projeler"
// part, where a lord with full stores has something big to spend them on.

const W = balance.projects.works

export const PROJECT_TEXTS: Record<ProjectId, { name: string; icon: IconName; text: string; bonus: (stages: number) => string }> = {
  cathedral: {
    name: 'Ulu Katedral',
    icon: 'temple',
    text: 'Taştan bir ibadet evi; her aşamada çan kulesi biraz daha yükselir. En çok yapı malzemesi ister.',
    bonus: (n) => `mutluluk +${n * (W.kinds.cathedral.happinessPerStage ?? 0)}`,
  },
  bazaar: {
    name: 'Büyük Çarşı',
    icon: 'trade',
    text: 'Kubbeli, kapalı bir çarşı; tüccarlar ondan söz ederek mal satar. En çok yemek ister.',
    bonus: (n) => `tüccar ve deniz ticareti +%${Math.round(n * (W.kinds.bazaar.tradePerStage ?? 0) * 100)}`,
  },
  knights: {
    name: 'Şövalye Tarikatı',
    icon: 'swords',
    text: 'Bir tarikat konağı ve talim meydanı; şövalyeler askerlerine yol gösterir. En çok savaş malzemesi ister.',
    bonus: (n) => `askerlerin zarı +${(n * (W.kinds.knights.battlePerStage ?? 0)).toFixed(1).replace('.', ',')}`,
  },
}

const span = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}` : `${m} dk`
}
const name = (r: Resource) => (r === 'gold' ? 'Altın' : RESOURCE_NAMES[r])

function Work({ kingdom, id, now, online }: { kingdom: Kingdom; id: ProjectId; now: number; online?: Online }) {
  const t = PROJECT_TEXTS[id]
  const stages = projectStages()
  const done = projectStage(kingdom, id, now)
  const p = projectOf(kingdom, id)
  const finished = done >= stages
  const building = p.until !== undefined && p.until > now
  const cost = projectStageCost(id, p.stage)
  const gift = projectGift(kingdom, id, now)
  const error = projectError(kingdom, id, now)
  return (
    <li className={finished ? 'done' : undefined}>
      <Icon name={t.icon} size={24} />
      <div>
        <b>
          {t.name} <small>· {done} / {stages} aşama</small>
        </b>
        <small>{t.text}</small>
        <small className="up">
          {done > 0 ? `Şu an: ${t.bonus(done)}` : 'Henüz bir aşaması yok.'}
          {!finished && ` · her aşama: ${t.bonus(1)}, +${W.growthPerStage} puan`}
        </small>
        {finished ? (
          <small className="up">Tamamlandı: +{W.completeGrowth} puan ve tacınla ilişki +{W.completeCrownRelation}.</small>
        ) : building ? (
          <>
            <small>
              {p.stage + 1}. aşama yapılıyor · {span(p.until! - now)} kaldı
            </small>
            <Meter value={1 - (p.until! - now) / projectStageMs(p.stage)} label="Aşamanın yapımı" segments={12} tone="up" />
          </>
        ) : (
          <>
            <small>
              {p.stage + 1}. aşamanın teslimatı (sonra {span(projectStageMs(p.stage))} sürer):
            </small>
            <div className="project-goods">
              {(Object.entries(cost) as [Resource, number][]).map(([r, need]) => {
                const paid = Math.min(need, p.paid[r] ?? 0)
                return (
                  <span key={r}>
                    <Icon name={r} size={16} />
                    <Meter value={need > 0 ? paid / need : 1} label={name(r)} segments={8} tone={paid >= need ? 'up' : 'gold'} />
                    <small>
                      {fmt(paid)} / {fmt(need)}
                    </small>
                  </span>
                )
              })}
            </div>
            <button className="btn small primary" disabled={error !== null} data-why={error === 'palace' ? `${W.minPalace}. seviye saray gerekir` : error === 'done' ? 'Bütün aşamalar tamam' : error === 'building' ? 'Ustalar bu aşamayı yapıyor; bitmesini bekle' : 'Aktaracak fazlan yok: ambarların ve hazinenin bir payı yedekte kalır'} onClick={() => online?.act({ type: 'project', action: 'give', id })}>
              <span>Depodan aktar</span>
              {error === null && <CostList cost={gift} />}
            </button>
            {error === 'palace' && <small className="down">{W.minPalace}. seviye saray gerekir.</small>}
            {error === 'nothing' && (
              <small>
                Aktaracak fazlan yok: her ambarın %{Math.round(W.keep.goods * 100)}'i ve hazinenin %{Math.round(W.keep.gold * 100)}'i yedekte kalır.
              </small>
            )}
          </>
        )}
      </div>
      <span className="medals" aria-label={`${done} / ${stages} aşama`}>
        {Array.from({ length: stages }, (_, i) => (
          <i key={i} className={i < done ? 'on t2' : ''} />
        ))}
      </span>
    </li>
  )
}

export function ProjectsPanel({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  const fx = projectEffects(kingdom, now)
  const f = balance.projects.festival
  const d = balance.projects.donation
  const fe = festivalError(kingdom, now)
  const locked = palaceLevel(kingdom, now) < W.minPalace
  return (
    <>
      <Section title="Büyük işler" icon="build" aside={`${fx.done} / ${PROJECT_IDS.length} tamam`}>
        <p className="hint">
          Ambarların dolu mu? Büyük işler aşama aşama yapılır: her aşama ambarın alabileceğinden çok mal ister, istediğin kadar seferde aktarırsın. Teslimat tamamlanınca
          ustalar aşamayı yapar. Her aşama kalıcı bir katkı ve puan getirir.{locked ? ` ${W.minPalace}. seviye sarayla açılır.` : ''}
        </p>
        <ul className="goals projects">
          {PROJECT_IDS.map((id) => (
            <Work key={id} kingdom={kingdom} id={id} now={now} online={online} />
          ))}
        </ul>
      </Section>
      <Section title="Halk şenliği" icon="music" aside={festivalOn(kingdom, now) ? `sürüyor · ${span((kingdom.festivalUntil ?? 0) - now)}` : undefined}>
        <p className="hint">
          Meydanda sofralar kurulur: {span(f.seconds * 1000)} boyunca mutluluk +{f.happiness}. {span(f.cooldownSeconds * 1000)}de bir düzenlenir.
        </p>
        <button className="btn small primary" disabled={fe !== null} data-why={fe === 'palace' ? `${f.minPalace}. seviye saray gerekir` : fe === 'wait' ? `Sonraki şenlik ${span(festivalReadyAt(kingdom) - now)} sonra` : (lackWhy(kingdom.stock, festivalCost()) ?? 'Kaynak yetmiyor')} onClick={() => online?.act({ type: 'project', action: 'festival' })}>
          <span>Şenlik düzenle</span>
          <CostList cost={festivalCost()} stock={kingdom.stock} />
        </button>
        {fe === 'palace' && <small className="down"> {f.minPalace}. seviye saray gerekir.</small>}
        {fe === 'wait' && <small> Sonraki şenlik: {span(festivalReadyAt(kingdom) - now)}</small>}
      </Section>
      <Section title="Taca bağış" icon="crown">
        <p className="hint">
          Bağlı olduğun taca {fmt(donationUnits())} birim mal gönder: tacınla ilişki +{d.relation}. {span(d.cooldownSeconds * 1000)}da bir gönderilir.
        </p>
        {kingdom.liege === undefined ? (
          <small className="down">Önce bir taç krallığına biat et.</small>
        ) : (
          <div className="choices">
            {GOODS.map((g: Good) => {
              const e = donationError(kingdom, g, now)
              return (
                <button key={g} className="btn small" disabled={e !== null} data-why={e === 'liege' ? 'Önce bir taç krallığına biat et' : e === 'palace' ? `${d.minPalace}. seviye saray gerekir` : e === 'max' ? 'Tacınla ilişkin zaten en yüksekte' : e === 'wait' ? `Sonraki bağış ${span(donationReadyAt(kingdom) - now)} sonra` : `Depoda en az ${fmt(donationUnits())} ${RESOURCE_NAMES[g].toLowerCase()} olmalı`} onClick={() => online?.act({ type: 'project', action: 'donate', good: g })}>
                  <Icon name={g} size={16} /> {RESOURCE_NAMES[g]}
                </button>
              )
            })}
          </div>
        )}
        {donationReadyAt(kingdom) > now && <Stat label="Sonraki bağış" value={span(donationReadyAt(kingdom) - now)} />}
        {kingdom.liege !== undefined && donationError(kingdom, 'food', now) === 'max' && <small className="up">Tacınla ilişkin zaten en üstte.</small>}
      </Section>
    </>
  )
}
