import {
  EXPEDITIONS,
  EXPEDITION_KINDS,
  GOAL_TRACKS,
  balance,
  countOf,
  expeditionCost,
  expeditionDanger,
  expeditionError,
  expeditionMs,
  expeditionsOf,
  expeditionsOut,
  garrisonOf,
  goalMeasure,
  goalRank,
  goalReward,
  goalStars,
  goalStarsMax,
  goalTier,
  goalTiers,
  maxExpeditions,
  palaceLevel,
  population,
  stewardFee,
  takeShare,
  villagersFree,
} from '@game/shared'
import type { Expedition, ExpeditionKind, Kingdom, Resource } from '@game/shared'
import { useState } from 'react'
import { EXPEDITION_TEXTS, FIND_TEXTS, GOAL_TEXTS, INCIDENT_TEXTS, TIER_NAMES } from '../expeditionNames'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { CostList, missingText } from '../panels'
import { StoryScene, expeditionStory } from '../storyScenes'
import type { Online } from './online'
import { Meter, Section, fmt } from './primitives'

// Expeditions, the season's goals and the steward (CLAUDE.md §9.9, §9.8): the Saray tab's "Seferler" and "Hedefler"
// parts, the report shown when a party is back, and the steward's switch on the people's tab.

const span = (ms: number) => {
  const m = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} sa${m % 60 ? ` ${m % 60} dk` : ''}` : `${m} dk`
}
const pct = (v: number) => `%${Math.round(v * 100)}`

const ERRORS: Record<string, string> = {
  locked: 'Saray seviyesi yetmiyor',
  tradePost: 'Ticaret noktası gerekir',
  busy: 'Şu an daha fazla sefer çıkamaz',
  villagers: 'Yeterli köylü yok',
  soldiers: 'Garnizonda yeterli asker yok',
  cost: 'Kaynak yetersiz',
  rejected: 'Bu sefer şu an çıkamaz',
}

// Goods of a haul in a line: "+120 yemek, +40 yapı malzemesi".
export const haulText = (c: Partial<Record<Resource, number>>, sign = '+') =>
  (Object.entries(c) as [Resource, number][])
    .filter(([, v]) => v > 0)
    .map(([r, v]) => `${sign}${fmt(v)} ${r === 'gold' ? 'altın' : RESOURCE_NAMES[r].toLowerCase()}`)
    .join(', ')

// ---- The expeditions part ------------------------------------------------------------------------------------------

export function ExpeditionsPanel({ kingdom, now, online, onReport }: { kingdom: Kingdom; now: number; online?: Online; onReport: (e: Expedition) => void }) {
  const out = expeditionsOut(kingdom, now)
  const cap = maxExpeditions(kingdom, now)
  const free = villagersFree(kingdom, now)
  const p = population(kingdom, now)
  const idle = Math.max(0, Math.floor(p.healthy - p.jobs))
  const back = expeditionsOf(kingdom)
    .filter((e) => e.result)
    .sort((a, b) => b.result!.at - a.result!.at)
  return (
    <>
      <Section title="Seferler" icon="pin" aside={`${out.length} / ${cap} yolda`}>
        <p className="hint">
          Köylülerden küçük bir kafile kur ve yola çıkar; sen yokken de yol alırlar, dönünce ganimetleri ve hikâyeleriyle gelirler. Yoldaki köylüler çalışmaz ve
          vergi vermez: <b>boşta köylüleri</b> göndermek en akıllıcasıdır.
        </p>
        <div className="row spread">
          <small>
            Gönderilebilir köylü: <b>{free}</b> (halkın en çok {pct(balance.expeditions.maxVillagerShare)}'i)
          </small>
          <small className={idle > 0 ? 'up' : 'down'}>{idle > 0 ? `${idle} köylü boşta` : 'Boşta köylü yok: gidenler üretimi düşürür'}</small>
        </div>
      </Section>
      {out.map((e) => (
        <OnTheRoad key={e.id} e={e} kingdom={kingdom} now={now} online={online} />
      ))}
      {EXPEDITION_KINDS.map((kind) => (
        <KindCard key={kind} kind={kind} kingdom={kingdom} now={now} online={online} idle={idle} />
      ))}
      {back.length > 0 && (
        <Section title="Dönenler" icon="scroll">
          <ul className="expedition-log">
            {back.map((e) => (
              <li key={e.id}>
                <Icon name={EXPEDITION_TEXTS[e.kind]?.icon ?? 'pin'} size={16} />
                <span>
                  <b>{EXPEDITION_TEXTS[e.kind]?.short}</b> · {e.result!.recalled ? 'geri çağrıldı' : haulText(e.result!.gains) || 'eli boş döndü'}
                  {e.result!.find && <span className="up"> · {FIND_TEXTS[e.result!.find]?.name}</span>}
                </span>
                {!e.result!.recalled && (
                  <button className="btn small" onClick={() => onReport(e)}>
                    Rapor
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function OnTheRoad({ e, kingdom, now, online }: { e: Expedition; kingdom: Kingdom; now: number; online?: Online }) {
  const [sure, setSure] = useState(false)
  const t = EXPEDITION_TEXTS[e.kind]
  const total = e.endAt - e.startAt
  return (
    <Section title={t?.name ?? 'Sefer'} icon={t?.icon ?? 'pin'} aside={`${span(e.endAt - now)} kaldı`}>
      <StoryScene story={expeditionStory(e.kind, [], kingdom.color)} id={`road:${e.kind}:${kingdom.color}`} />
      <p className="hint">{t?.road}</p>
      <Meter value={(now - e.startAt) / total} label="Yolculuk" segments={16} />
      <div className="row spread">
        <small>
          {e.villagers} köylü{countOf(e.escort) > 0 ? ` · ${countOf(e.escort)} muhafız` : ''}
        </small>
        <button className={sure ? 'btn small danger' : 'btn small'} onClick={() => (sure ? online?.act({ type: 'expedition', action: 'recall', id: e.id }) : setSure(true))}>
          {sure ? 'Emin misin? Erzak geri gelmez' : 'Geri çağır'}
        </button>
      </div>
    </Section>
  )
}

function KindCard({ kind, kingdom, now, online, idle }: { kind: ExpeditionKind; kingdom: Kingdom; now: number; online?: Online; idle: number }) {
  const spec = EXPEDITIONS[kind]
  const t = EXPEDITION_TEXTS[kind]
  const [n, setN] = useState(spec.villagers[0])
  const [guards, setGuards] = useState(0)
  const garrison = garrisonOf(kingdom)
  const soldiers = countOf(garrison)
  const escort = takeShare(garrison, Math.min(guards, soldiers)).taken
  const cost = expeditionCost(kind, n)
  const error = expeditionError(kingdom, kind, n, escort, now)
  const locked = palaceLevel(kingdom, now) < spec.palace
  const haul = Object.fromEntries(Object.entries(spec.haul).map(([r, v]) => [r, Math.round((v ?? 0) * n)]))
  const blessing = spec.boon ? Math.min(spec.boon.max, spec.boon.perVillager * n) : 0
  const rounds = expeditionMs(kind) / 1000 / balance.economy.productionSeconds
  // What the villagers would have paid at home: the taxes (and their work, if they had any).
  const taxLost = Math.round(n * rounds * balance.expeditions.valuation.taxPerRound)
  return (
    <Section title={t?.name ?? kind} icon={t?.icon ?? 'pin'} aside={locked ? `Saray ${spec.palace}. sv.` : span(expeditionMs(kind))}>
      <p className="hint">{t?.text}</p>
      {!locked && (
        <>
          <div className="stepper">
            <button className="btn icon-only" disabled={n <= spec.villagers[0]} onClick={() => setN(n - 1)} aria-label="Bir köylü azalt">
              <Icon name="minus" size={16} />
            </button>
            <span className="stepper-value">
              <b>{n}</b> köylü
            </span>
            <button className="btn icon-only" disabled={n >= spec.villagers[1]} onClick={() => setN(n + 1)} aria-label="Bir köylü ekle">
              <Icon name="plus" size={16} />
            </button>
            {spec.escort > 0 && (
              <>
                <button className="btn icon-only" disabled={guards <= 0} onClick={() => setGuards(guards - 1)} aria-label="Bir muhafız azalt">
                  <Icon name="minus" size={16} />
                </button>
                <span className="stepper-value">
                  <b>{Math.min(guards, soldiers)}</b> muhafız
                </span>
                <button className="btn icon-only" disabled={guards >= Math.min(spec.escort, soldiers)} onClick={() => setGuards(guards + 1)} aria-label="Bir muhafız ekle">
                  <Icon name="plus" size={16} />
                </button>
              </>
            )}
          </div>
          <ul className="expedition-facts">
            {haulText(haul) && <li>Olağan bir yolculukta: {haulText(haul)}</li>}
            {spec.find && <li>Hazine şansı: büyük hazine {pct(spec.find.hoard.chance + spec.find.hoard.perVillager * n)}, küçük zula {pct(spec.find.cache.chance + spec.find.cache.perVillager * n)}</li>}
            {blessing > 0 && <li>Dönünce halkın mutluluğu +{fmt(blessing)} ({spec.boon!.minutes} dk)</li>}
            <li className={expeditionDanger(kind, Math.min(guards, soldiers)) > 0.25 ? 'down' : undefined}>
              Yolda kötü bir şeyle karşılaşma ihtimali: her olayda {pct(expeditionDanger(kind, Math.min(guards, soldiers)))}
              {spec.escort > 0 ? ' (muhafız katınca azalır)' : ''}
            </li>
            <li>
              Yokken ödenmeyecek vergi: ~{fmt(taxLost)} altın{n > idle ? ` · ${n - idle} köylü işinden ayrılır, üretim düşer` : ''}
            </li>
          </ul>
          <div className="row spread">
            <CostList cost={cost} stock={kingdom.stock} />
            <button className="btn small primary" disabled={error !== null} onClick={() => online?.act({ type: 'expedition', action: 'start', kind, villagers: n, escort })}>
              Yola çıkar
            </button>
          </div>
          {error && error !== 'cost' && <small className="hint down">{ERRORS[error]}</small>}
          {error === 'cost' && <small className="hint down">{missingText(cost, kingdom.stock)}</small>}
        </>
      )}
    </Section>
  )
}

// ---- The report of a party back --------------------------------------------------------------------------------------

// What the party heard of the world, picked from what the map shows of it.
export function rumourText(seed: number, online: Online | undefined): string {
  const facts: string[] = []
  for (const t of online?.towns ?? []) {
    if (t.owner === null) facts.push(`${t.name} kasabasını yalnızca ${t.garrison} asker koruyormuş.`)
    else {
      const owner = online?.kingdoms.find((k) => k.id === t.owner)?.name
      if (owner) facts.push(`${t.name} kasabası ${owner} lordunun elindeymiş; halkı pek hoşnut değilmiş.`)
    }
  }
  for (const k of online?.kingdoms ?? []) if (k.id !== online?.me) facts.push(`${k.name} lordunun sarayı ${k.palace}. seviyeye varmış.`)
  return facts.length > 0 ? facts[seed % facts.length] : 'Uzak diyarlarda büyük savaşların konuşulduğunu duydular.'
}

export interface ReportLine {
  icon: IconName
  text: string
  tone?: 'up' | 'down'
}

// The story of a journey, line by line.
export function expeditionLines(e: Expedition, online?: Online): ReportLine[] {
  const r = e.result
  const t = EXPEDITION_TEXTS[e.kind]
  if (!r) return []
  if (r.recalled) return [{ icon: 'home', text: `${t?.short ?? 'Sefer'} geri çağrıldı; kafile eli boş döndü.` }]
  const lines: ReportLine[] = [{ icon: t?.icon ?? 'pin', text: `${e.villagers} köylü${countOf(e.escort) > 0 ? ` ve ${countOf(e.escort)} muhafız` : ''} ${span(e.endAt - e.startAt)} süren yolculuktan döndü.` }]
  for (const i of r.incidents) lines.push({ icon: i.bad ? 'warn' : 'star', text: INCIDENT_TEXTS[e.kind]?.[i.id] ?? i.id, tone: i.bad ? 'down' : 'up' })
  if (r.find) lines.push({ icon: 'chest', text: `${FIND_TEXTS[r.find]?.name}: ${FIND_TEXTS[r.find]?.text}`, tone: 'up' })
  if (r.rumour !== undefined) lines.push({ icon: 'eye', text: `Duydukları: ${rumourText(r.rumour, online)}` })
  const got = haulText(r.gains)
  lines.push(got ? { icon: 'chest', text: `Getirdikleri: ${got}.`, tone: 'up' } : { icon: 'chest', text: 'Depolara bir şey getirmediler.' })
  if (r.wasted && haulText(r.wasted)) lines.push({ icon: 'warn', text: `Depolarda yer olmadığı için ${haulText(r.wasted, '')} boşa gitti.`, tone: 'down' })
  if (r.boon) lines.push({ icon: r.boon.happiness > 0 ? 'happy' : 'unhappy', text: `Anlattıkları halkı ${r.boon.happiness > 0 ? 'sevindirdi' : 'korkuttu'}: mutluluk ${r.boon.happiness > 0 ? '+' : '−'}${Math.abs(r.boon.happiness)} (${span(r.boon.until - r.at)}).`, tone: r.boon.happiness > 0 ? 'up' : 'down' })
  if (r.villagersLost > 0) lines.push({ icon: 'unhappy', text: `${r.villagersLost} köylü geri dönmedi.`, tone: 'down' })
  if (r.soldiersLost > 0) lines.push({ icon: 'swords', text: `${r.soldiersLost} muhafız yolda düştü.`, tone: 'down' })
  return lines
}

export function ExpeditionReport({ expedition: e, kingdom, online, onClose }: { expedition: Expedition; kingdom: Kingdom; online?: Online; onClose: () => void }) {
  const t = EXPEDITION_TEXTS[e.kind]
  const lines = expeditionLines(e, online)
  return (
    <div className="modal" role="dialog" aria-labelledby="expedition-title" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <section className="dialog frame away">
        <header className="sheet-head">
          <Icon name={t?.icon ?? 'pin'} size={32} />
          <div>
            <h2 id="expedition-title">{t?.name ?? 'Sefer'}</h2>
            <small>Kafile döndü</small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        <StoryScene story={expeditionStory(e.kind, e.result?.incidents, kingdom.color, e.result?.find)} id={`back:${e.id}`} />
        <ul className="away-lines">
          {lines.map((line, i) => (
            <li key={i} className={line.tone}>
              <Icon name={line.icon} size={16} />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
        <div className="away-nav">
          <span />
          <button className="btn primary" onClick={onClose}>
            Tamam
          </button>
        </div>
      </section>
    </div>
  )
}

// ---- The season's goals ----------------------------------------------------------------------------------------------

export function GoalsPanel({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const rank = goalRank(kingdom)
  const max = goalStarsMax()
  const rewards = balance.goals.rewardByTier.map((_, i) => goalReward(i + 1).gold ?? 0)
  return (
    <>
      <Section title="Hanedan hedefleri" icon="star" aside={`★ ${rank.stars} / ${max}`}>
        <div className="feature">
          <Icon name="crown" size={48} />
          <div>
            <b>{rank.title}</b>
            <p className="hint">
              {rank.next ? `${rank.next.stars - rank.stars} yıldız daha: ${rank.next.title}` : 'En yüce unvana ulaştın.'} Her basamak bir yıldız ve küçük bir kese ({rewards.join(' / ')} altın)
              getirir.
            </p>
          </div>
        </div>
        <Meter value={rank.next ? rank.stars / rank.next.stars : 1} label="Sonraki unvan" segments={16} />
      </Section>
      <Section title="Hedefler" icon="banner">
        <ul className="goals">
          {GOAL_TRACKS.map((track) => {
            const g = GOAL_TEXTS[track]
            const tiers = goalTiers(track)
            const tier = goalTier(kingdom, track)
            const value = goalMeasure(kingdom, track, now)
            const next = tiers[tier]
            const prev = tier > 0 ? tiers[tier - 1] : 0
            return (
              <li key={track} className={tier >= tiers.length ? 'done' : undefined}>
                <Icon name={g?.icon ?? 'star'} size={24} />
                <div>
                  <b>
                    {g?.name ?? track}
                    {tier > 0 && <small className="goal-badge"> · {g?.badges[tier - 1]}</small>}
                  </b>
                  {next !== undefined ? (
                    <>
                      <small>
                        Sonraki: {g?.what(next)} ({fmt(Math.min(value, next))} / {fmt(next)})
                      </small>
                      <Meter value={(value - prev) / (next - prev)} label={g?.name ?? track} segments={10} />
                    </>
                  ) : (
                    <small className="up">Bütün basamaklar tamam.</small>
                  )}
                </div>
                <span className="medals" aria-label={`${tier} / ${tiers.length} basamak`}>
                  {tiers.map((_, i) => (
                    <i key={i} className={i < tier ? `on t${i}` : ''} title={TIER_NAMES[i]} />
                  ))}
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

// The lord's title and stars, in a line (the Saray tab's first part).
export function GoalTitle({ kingdom }: { kingdom: Kingdom }) {
  const rank = goalRank(kingdom)
  return (
    <small className="goal-title">
      <Icon name="star" size={16} /> {rank.title} · ★ {goalStars(kingdom)}
    </small>
  )
}

// ---- The steward ---------------------------------------------------------------------------------------------------

export function StewardSection({ kingdom, online }: { kingdom: Kingdom; online?: Online }) {
  const fee = stewardFee()
  const on = !!kingdom.steward
  return (
    <Section title="Kâhya" icon="scroll" aside={on ? 'görevde' : 'izinde'}>
      <p className="hint">
        Bir afet geldiğinde {Math.round(balance.institutions.events.crisis.decideSeconds / 60)} dakika içinde karar vermezsen kâhyan köylüleri seferber eder: zarar
        önlenir, kısa bir süre iş gücü düşer. Her seferinde {fmt(fee.gold ?? 0)} altın alır; hazinede yoksa bir şey yapamaz. Sen yokken işe yarar.
      </p>
      <button className={on ? 'btn small' : 'btn small primary'} onClick={() => online?.act({ type: 'steward', on: !on })}>
        {on ? 'Kâhyayı izne çıkar' : 'Kâhyayı göreve al'}
      </button>
    </Section>
  )
}
