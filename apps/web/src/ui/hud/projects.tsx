import { useState } from 'react'
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
import { L } from '../../lib/i18n'
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
    name: L('Ulu Katedral', 'Grand Cathedral'),
    icon: 'temple',
    text: L('Taştan bir ibadet evi; her aşamada çan kulesi biraz daha yükselir. En çok yapı malzemesi ister.', 'A house of worship in stone; with every stage the bell tower rises a little higher. Asks mostly for building materials.'),
    bonus: (n) => L(`mutluluk +${n * (W.kinds.cathedral.happinessPerStage ?? 0)}`, `happiness +${n * (W.kinds.cathedral.happinessPerStage ?? 0)}`),
  },
  bazaar: {
    name: L('Büyük Çarşı', 'Grand Bazaar'),
    icon: 'trade',
    text: L('Kubbeli, kapalı bir çarşı; tüccarlar ondan söz ederek mal satar. En çok yemek ister.', 'A domed, covered bazaar; merchants sell their wares by its name. Asks mostly for food.'),
    bonus: (n) => L(`tüccar ve deniz ticareti +%${Math.round(n * (W.kinds.bazaar.tradePerStage ?? 0) * 100)}`, `merchant and sea trade +${Math.round(n * (W.kinds.bazaar.tradePerStage ?? 0) * 100)}%`),
  },
  knights: {
    name: L('Şövalye Tarikatı', 'Order of Knights'),
    icon: 'swords',
    text: L('Bir tarikat konağı ve talim meydanı; şövalyeler askerlerine yol gösterir. En çok savaş malzemesi ister.', 'A chapter house and drill yard; the knights guide your soldiers. Asks mostly for war materials.'),
    bonus: (n) => L(`askerlerin zarı +${(n * (W.kinds.knights.battlePerStage ?? 0)).toFixed(1).replace('.', ',')}`, `soldiers' dice +${(n * (W.kinds.knights.battlePerStage ?? 0)).toFixed(1)}`),
  },
}

const span = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(m / 60)
  return h > 0 ? L(`${h} sa${m % 60 ? ` ${m % 60} dk` : ''}`, `${h} h${m % 60 ? ` ${m % 60} min` : ''}`) : L(`${m} dk`, `${m} min`)
}
const name = (r: Resource) => (r === 'gold' ? L('Altın', 'Gold') : RESOURCE_NAMES[r])

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
    <li className={finished ? 'project done' : 'project'}>
      <div className="project-head">
        <Icon name={t.icon} size={24} />
        <b>
          {t.name} <small>· {L(`${done} / ${stages} aşama`, `${done} / ${stages} stages`)}</small>
        </b>
        <span className="medals" aria-label={L(`${done} / ${stages} aşama`, `${done} / ${stages} stages`)}>
          {Array.from({ length: stages }, (_, i) => (
            <i key={i} className={i < done ? 'on t2' : ''} />
          ))}
        </span>
      </div>
      <div className="project-body">
        <small>{t.text}</small>
        <small className="up">
          {done > 0 ? L(`Şu an: ${t.bonus(done)}`, `Now: ${t.bonus(done)}`) : L('Henüz bir aşaması yok.', 'No stage built yet.')}
          {!finished && L(` · her aşama: ${t.bonus(1)}, +${W.growthPerStage} puan`, ` · each stage: ${t.bonus(1)}, +${W.growthPerStage} score`)}
        </small>
        {finished ? (
          <small className="up">{L(`Tamamlandı: +${W.completeGrowth} puan ve tacınla ilişki +${W.completeCrownRelation}.`, `Completed: +${W.completeGrowth} score and relations with your crown +${W.completeCrownRelation}.`)}</small>
        ) : building ? (
          <>
            <small>
              {L(`${p.stage + 1}. aşama yapılıyor · ${span(p.until! - now)} kaldı`, `Stage ${p.stage + 1} under construction · ${span(p.until! - now)} left`)}
            </small>
            <Meter value={1 - (p.until! - now) / projectStageMs(p.stage)} label={L('Aşamanın yapımı', 'Stage construction')} segments={12} tone="up" />
          </>
        ) : (
          <>
            <small>
              {L(`${p.stage + 1}. aşamanın teslimatı (sonra ${span(projectStageMs(p.stage))} sürer):`, `Delivery for stage ${p.stage + 1} (then it takes ${span(projectStageMs(p.stage))}):`)}
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
            <button className="btn small primary project-give" disabled={error !== null} data-why={error === 'palace' ? L(`${W.minPalace}. seviye saray gerekir`, `Requires a level ${W.minPalace} palace`) : error === 'done' ? L('Bütün aşamalar tamam', 'All stages complete') : error === 'building' ? L('Ustalar bu aşamayı yapıyor; bitmesini bekle', 'The builders are working on this stage; wait for it to finish') : L('Aktaracak fazlan yok: ambarların ve hazinenin bir payı yedekte kalır', 'Nothing spare to deliver: a share of the storehouses and treasury is kept in reserve')} onClick={() => online?.act({ type: 'project', action: 'give', id })}>
              <span>{L('Depodan aktar', 'Deliver from stores')}</span>
              {error === null && <CostList cost={gift} />}
            </button>
            {error === 'palace' && <small className="down">{L(`${W.minPalace}. seviye saray gerekir.`, `Requires a level ${W.minPalace} palace.`)}</small>}
            {error === 'nothing' && (
              <small>
                {L(
                  `Aktaracak fazlan yok: her ambarın %${Math.round(W.keep.goods * 100)}'i ve hazinenin %${Math.round(W.keep.gold * 100)}'i yedekte kalır.`,
                  `Nothing spare to deliver: ${Math.round(W.keep.goods * 100)}% of every storehouse and ${Math.round(W.keep.gold * 100)}% of the treasury are kept in reserve.`,
                )}
              </small>
            )}
          </>
        )}
      </div>
    </li>
  )
}

export function ProjectsPanel({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  const [asking, setAsking] = useState<Good | null>(null)
  const fx = projectEffects(kingdom, now)
  const f = balance.projects.festival
  const d = balance.projects.donation
  const whyNot = (g: Good) => {
    const e = donationError(kingdom, g, now)
    return e === 'liege' ? L('Önce bir taç krallığına biat et', 'Swear fealty to a crown kingdom first') : e === 'palace' ? L(`${d.minPalace}. seviye saray gerekir`, `Requires a level ${d.minPalace} palace`) : e === 'max' ? L('Tacınla ilişkin zaten en yüksekte', 'Your relations with your crown are already at their peak') : e === 'wait' ? L(`Sonraki bağış ${span(donationReadyAt(kingdom) - now)} sonra`, `Next donation in ${span(donationReadyAt(kingdom) - now)}`) : L(`Depoda en az ${fmt(donationUnits())} ${RESOURCE_NAMES[g].toLowerCase()} olmalı`, `You need at least ${fmt(donationUnits())} ${RESOURCE_NAMES[g].toLowerCase()} in store`)
  }
  const fe = festivalError(kingdom, now)
  const locked = palaceLevel(kingdom, now) < W.minPalace
  return (
    <>
      <Section title={L('Büyük işler', 'Great works')} icon="build" aside={L(`${fx.done} / ${PROJECT_IDS.length} tamam`, `${fx.done} / ${PROJECT_IDS.length} done`)}>
        <p className="hint">
          {L(
            'Ambarların dolu mu? Büyük işler aşama aşama yapılır: her aşama ambarın alabileceğinden çok mal ister, istediğin kadar seferde aktarırsın. Teslimat tamamlanınca ustalar aşamayı yapar. Her aşama kalıcı bir katkı ve puan getirir.',
            'Storehouses full? Great works are built stage by stage: each stage asks for more goods than a storehouse holds, so you deliver in as many loads as you like. Once a delivery is complete, the builders raise the stage. Every stage brings a lasting bonus and score.',
          )}
          {locked ? L(` ${W.minPalace}. seviye sarayla açılır.`, ` Unlocks with a level ${W.minPalace} palace.`) : ''}
        </p>
        <ul className="goals projects">
          {PROJECT_IDS.map((id) => (
            <Work key={id} kingdom={kingdom} id={id} now={now} online={online} />
          ))}
        </ul>
      </Section>
      <Section title={L('Halk şenliği', 'People\'s festival')} icon="music" aside={festivalOn(kingdom, now) ? L(`sürüyor · ${span((kingdom.festivalUntil ?? 0) - now)}`, `under way · ${span((kingdom.festivalUntil ?? 0) - now)}`) : undefined}>
        <p className="hint">
          {L(
            `Meydanda sofralar kurulur: ${span(f.seconds * 1000)} boyunca mutluluk +${f.happiness}. Sonraki şenlik için ${span(f.cooldownSeconds * 1000)} beklenir.`,
            `Tables are laid in the square: happiness +${f.happiness} for ${span(f.seconds * 1000)}. The next festival must wait ${span(f.cooldownSeconds * 1000)}.`,
          )}
        </p>
        <button className="btn small primary" disabled={fe !== null} data-why={fe === 'palace' ? L(`${f.minPalace}. seviye saray gerekir`, `Requires a level ${f.minPalace} palace`) : fe === 'wait' ? L(`Sonraki şenlik ${span(festivalReadyAt(kingdom) - now)} sonra`, `Next festival in ${span(festivalReadyAt(kingdom) - now)}`) : (lackWhy(kingdom.stock, festivalCost()) ?? L('Kaynak yetmiyor', 'Not enough resources'))} onClick={() => online?.act({ type: 'project', action: 'festival' })}>
          <span>{L('Şenlik düzenle', 'Hold a festival')}</span>
          <CostList cost={festivalCost()} stock={kingdom.stock} />
        </button>
        {fe === 'palace' && <small className="down"> {L(`${f.minPalace}. seviye saray gerekir.`, `Requires a level ${f.minPalace} palace.`)}</small>}
        {fe === 'wait' && <small> {L(`Sonraki şenlik: ${span(festivalReadyAt(kingdom) - now)}`, `Next festival: ${span(festivalReadyAt(kingdom) - now)}`)}</small>}
      </Section>
      <Section title={L('Taca bağış', 'Gift to the crown')} icon="crown">
        <p className="hint">
          {L(
            `Bağlı olduğun taca ${fmt(donationUnits())} birim mal gönder: tacınla ilişki +${d.relation}. Bir sonrakine kadar ${span(d.cooldownSeconds * 1000)} beklenir.`,
            `Send ${fmt(donationUnits())} units of goods to your liege crown: relations with your crown +${d.relation}. The next one must wait ${span(d.cooldownSeconds * 1000)}.`,
          )}
        </p>
        {kingdom.liege === undefined ? (
          <small className="down">{L('Önce bir taç krallığına biat et.', 'Swear fealty to a crown kingdom first.')}</small>
        ) : asking ? (
          // A gift this big is asked about first.
          <div className="donate-ask">
            <p>
              <Icon name={asking} size={16} />{' '}
              {L(
                `${fmt(donationUnits())} ${RESOURCE_NAMES[asking].toLowerCase()} tacına gidecek (depoda ${fmt(kingdom.stock[asking])}). Emin misin?`,
                `${fmt(donationUnits())} ${RESOURCE_NAMES[asking].toLowerCase()} will go to your crown (${fmt(kingdom.stock[asking])} in store). Are you sure?`,
              )}
            </p>
            <div className="row">
              <button className="btn small" onClick={() => setAsking(null)}>
                {L('Vazgeç', 'Cancel')}
              </button>
              <button
                className="btn small primary"
                disabled={donationError(kingdom, asking, now) !== null}
                data-why={whyNot(asking)}
                onClick={() => {
                  online?.act({ type: 'project', action: 'donate', good: asking })
                  setAsking(null)
                }}
              >
                <Icon name="crown" size={16} /> {L('Evet, gönder', 'Yes, send it')}
              </button>
            </div>
          </div>
        ) : (
          <ul className="donate-list">
            {GOODS.map((g: Good) => {
              const e = donationError(kingdom, g, now)
              return (
                <li key={g}>
                  <span>
                    <Icon name={g} size={16} /> {fmt(donationUnits())} {RESOURCE_NAMES[g].toLowerCase()}
                    <small> · {L(`depoda ${fmt(kingdom.stock[g])}`, `${fmt(kingdom.stock[g])} in store`)}</small>
                  </span>
                  <button className="btn small" disabled={e !== null} data-why={whyNot(g)} onClick={() => setAsking(g)}>
                    {L('Bağışla', 'Donate')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {donationReadyAt(kingdom) > now && <Stat label={L('Sonraki bağış', 'Next donation')} value={span(donationReadyAt(kingdom) - now)} />}
        {kingdom.liege !== undefined && donationError(kingdom, 'food', now) === 'max' && <small className="up">{L('Tacınla ilişkin zaten en üstte.', 'Your relations with your crown are already at their peak.')}</small>}
      </Section>
    </>
  )
}
