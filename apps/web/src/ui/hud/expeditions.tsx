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
import { useEffect, useState } from 'react'
import { playOnce } from '../../audio/sfx'
import { EXPEDITION_TEXTS, FIND_TEXTS, GOAL_TEXTS, INCIDENT_TEXTS, TIER_NAMES } from '../expeditionNames'
import { L } from '../../lib/i18n'
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
  return h > 0 ? L(`${h} sa${m % 60 ? ` ${m % 60} dk` : ''}`, `${h} h${m % 60 ? ` ${m % 60} min` : ''}`) : L(`${m} dk`, `${m} min`)
}
const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)

const ERRORS: Record<string, string> = {
  locked: L('Saray seviyesi yetmiyor', 'Palace level too low'),
  tradePost: L('Ticaret noktası gerekir', 'Requires a trading post'),
  busy: L('Şu an daha fazla sefer çıkamaz', 'No more expeditions can set out now'),
  villagers: L('Yeterli köylü yok', 'Not enough villagers'),
  soldiers: L('Garnizonda yeterli asker yok', 'Not enough soldiers in the garrison'),
  cost: L('Kaynak yetersiz', 'Not enough resources'),
  rejected: L('Bu sefer şu an çıkamaz', 'This expedition cannot set out now'),
}

// Goods of a haul in a line: "+120 yemek, +40 yapı malzemesi".
export const haulText = (c: Partial<Record<Resource, number>>, sign = '+') =>
  (Object.entries(c) as [Resource, number][])
    .filter(([, v]) => v > 0)
    .map(([r, v]) => `${sign}${fmt(v)} ${r === 'gold' ? L('altın', 'gold') : RESOURCE_NAMES[r].toLowerCase()}`)
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
      <Section title={L('Seferler', 'Expeditions')} icon="pin" aside={L(`${out.length} / ${cap} yolda`, `${out.length} / ${cap} on the road`)}>
        <p className="hint">
          {L(
            'Köylülerden küçük bir kafile kur ve yola çıkar; sen yokken de yol alırlar, dönünce ganimetleri ve hikâyeleriyle gelirler. Yoldaki köylüler çalışmaz ve vergi vermez: ',
            'Form a small party of villagers and send it off; they travel even while you are away and come back with their spoils and stories. Villagers on the road neither work nor pay taxes: ',
          )}
          <b>{L('boşta köylüleri', 'idle villagers')}</b>
          {L(' göndermek en akıllıcasıdır.', ' are the wisest to send.')}
        </p>
        <div className="row spread">
          <small>
            {L('Gönderilebilir köylü:', 'Villagers available:')} <b>{free}</b>{' '}
            {L(`(halkın en çok ${pct(balance.expeditions.maxVillagerShare)}'i)`, `(at most ${pct(balance.expeditions.maxVillagerShare)} of the people)`)}
          </small>
          <small className={idle > 0 ? 'up' : 'down'}>{idle > 0 ? L(`${idle} köylü boşta`, `${idle} villager${idle === 1 ? '' : 's'} idle`) : L('Boşta köylü yok: gidenler üretimi düşürür', 'No idle villagers: those who go will cut production')}</small>
        </div>
      </Section>
      {out.map((e) => (
        <OnTheRoad key={e.id} e={e} kingdom={kingdom} now={now} online={online} />
      ))}
      {EXPEDITION_KINDS.map((kind) => (
        <KindCard key={kind} kind={kind} kingdom={kingdom} now={now} online={online} idle={idle} />
      ))}
      {back.length > 0 && (
        <Section title={L('Dönenler', 'Returned')} icon="scroll">
          <ul className="expedition-log">
            {back.map((e) => (
              <li key={e.id}>
                <Icon name={EXPEDITION_TEXTS[e.kind]?.icon ?? 'pin'} size={16} />
                <span>
                  <b>{EXPEDITION_TEXTS[e.kind]?.short}</b> · {e.result!.recalled ? L('geri çağrıldı', 'recalled') : haulText(e.result!.gains) || L('eli boş döndü', 'came back empty-handed')}
                  {e.result!.find && <span className="up"> · {FIND_TEXTS[e.result!.find]?.name}</span>}
                </span>
                {!e.result!.recalled && (
                  <button className="btn small" onClick={() => onReport(e)}>
                    {L('Rapor', 'Report')}
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
    <Section title={t?.name ?? L('Sefer', 'Expedition')} icon={t?.icon ?? 'pin'} aside={L(`${span(e.endAt - now)} kaldı`, `${span(e.endAt - now)} left`)}>
      <StoryScene story={expeditionStory(e.kind, [], kingdom.color)} id={`road:${e.kind}:${kingdom.color}`} />
      <p className="hint">{t?.road}</p>
      <Meter value={(now - e.startAt) / total} label={L('Yolculuk', 'Journey')} segments={16} />
      <div className="row spread">
        <small>
          {L(`${e.villagers} köylü`, `${e.villagers} villager${e.villagers === 1 ? '' : 's'}`)}
          {countOf(e.escort) > 0 ? L(` · ${countOf(e.escort)} muhafız`, ` · ${countOf(e.escort)} guard${countOf(e.escort) === 1 ? '' : 's'}`) : ''}
        </small>
        <button className={sure ? 'btn small danger' : 'btn small'} onClick={() => (sure ? online?.act({ type: 'expedition', action: 'recall', id: e.id }) : setSure(true))}>
          {sure ? L('Emin misin? Erzak geri gelmez', 'Are you sure? The provisions are not refunded') : L('Geri çağır', 'Recall')}
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
    <Section title={t?.name ?? kind} icon={t?.icon ?? 'pin'} aside={locked ? L(`Saray ${spec.palace}. sv.`, `Palace lv. ${spec.palace}`) : span(expeditionMs(kind))}>
      <p className="hint">{t?.text}</p>
      {!locked && (
        <>
          <div className="stepper">
            <button className="btn icon-only" disabled={n <= spec.villagers[0]} data-why={L(`Bu sefere en az ${spec.villagers[0]} köylü gider`, `At least ${spec.villagers[0]} villagers go on this expedition`)} onClick={() => setN(n - 1)} aria-label={L('Bir köylü azalt', 'One villager fewer')}>
              <Icon name="minus" size={16} />
            </button>
            <span className="stepper-value">
              <b>{n}</b> {L('köylü', n === 1 ? 'villager' : 'villagers')}
            </span>
            <button className="btn icon-only" disabled={n >= spec.villagers[1]} data-why={L(`Bu sefere en fazla ${spec.villagers[1]} köylü gider`, `At most ${spec.villagers[1]} villagers go on this expedition`)} onClick={() => setN(n + 1)} aria-label={L('Bir köylü ekle', 'One more villager')}>
              <Icon name="plus" size={16} />
            </button>
            {spec.escort > 0 && (
              <>
                <button className="btn icon-only" disabled={guards <= 0} data-why={L('Muhafız seçilmedi', 'No guards chosen')} onClick={() => setGuards(guards - 1)} aria-label={L('Bir muhafız azalt', 'One guard fewer')}>
                  <Icon name="minus" size={16} />
                </button>
                <span className="stepper-value">
                  <b>{Math.min(guards, soldiers)}</b> {L('muhafız', Math.min(guards, soldiers) === 1 ? 'guard' : 'guards')}
                </span>
                <button className="btn icon-only" disabled={guards >= Math.min(spec.escort, soldiers)} data-why={soldiers <= guards ? L(`Garnizonda ${soldiers} asker var`, `The garrison has ${soldiers} soldier${soldiers === 1 ? '' : 's'}`) : L(`Bu sefere en fazla ${spec.escort} muhafız gider`, `At most ${spec.escort} guards go on this expedition`)} onClick={() => setGuards(guards + 1)} aria-label={L('Bir muhafız ekle', 'One more guard')}>
                  <Icon name="plus" size={16} />
                </button>
              </>
            )}
          </div>
          <ul className="expedition-facts">
            {haulText(haul) && <li>{L(`Olağan bir yolculukta: ${haulText(haul)}`, `On an ordinary journey: ${haulText(haul)}`)}</li>}
            {spec.find && (
              <li>
                {L(
                  `Hazine şansı: büyük hazine ${pct(spec.find.hoard.chance + spec.find.hoard.perVillager * n)}, küçük zula ${pct(spec.find.cache.chance + spec.find.cache.perVillager * n)}`,
                  `Treasure chance: great treasure ${pct(spec.find.hoard.chance + spec.find.hoard.perVillager * n)}, small cache ${pct(spec.find.cache.chance + spec.find.cache.perVillager * n)}`,
                )}
              </li>
            )}
            {blessing > 0 && <li>{L(`Dönünce halkın mutluluğu +${fmt(blessing)} (${spec.boon!.minutes} dk)`, `On return, the people's happiness +${fmt(blessing)} (${spec.boon!.minutes} min)`)}</li>}
            <li className={expeditionDanger(kind, Math.min(guards, soldiers)) > 0.25 ? 'down' : undefined}>
              {L(
                `Yolda kötü bir şeyle karşılaşma ihtimali: her olayda ${pct(expeditionDanger(kind, Math.min(guards, soldiers)))}`,
                `Chance of trouble on the road: ${pct(expeditionDanger(kind, Math.min(guards, soldiers)))} per incident`,
              )}
              {spec.escort > 0 ? L(' (muhafız katınca azalır)', ' (lower with guards)') : ''}
            </li>
            <li>
              {L(`Yokken ödenmeyecek vergi: ~${fmt(taxLost)} altın`, `Taxes not paid while away: ~${fmt(taxLost)} gold`)}
              {n > idle ? L(` · ${n - idle} köylü işinden ayrılır, üretim düşer`, ` · ${n - idle} villager${n - idle === 1 ? ' leaves his' : 's leave their'} work, production falls`) : ''}
            </li>
          </ul>
          <div className="row spread">
            <CostList cost={cost} stock={kingdom.stock} />
            <button className="btn small primary" disabled={error !== null} data-why={error === 'cost' ? missingText(cost, kingdom.stock) : error ? (ERRORS[error] ?? L('Şu an çıkamaz', 'Cannot set out now')) : undefined} onClick={() => online?.act({ type: 'expedition', action: 'start', kind, villagers: n, escort })}>
              {L('Yola çıkar', 'Send off')}
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
    if (t.owner === null) facts.push(L(`${t.name} kasabasını yalnızca ${t.garrison} asker koruyormuş.`, `They say the town of ${t.name} is guarded by only ${t.garrison} soldiers.`))
    else {
      const owner = online?.kingdoms.find((k) => k.id === t.owner)?.name
      if (owner) facts.push(L(`${t.name} kasabası ${owner} lordunun elindeymiş; halkı pek hoşnut değilmiş.`, `They say the town of ${t.name} is held by ${owner}, and its people are none too pleased.`))
    }
  }
  for (const k of online?.kingdoms ?? []) if (k.id !== online?.me) facts.push(L(`${k.name} lordunun sarayı ${k.palace}. seviyeye varmış.`, `They say ${k.name}'s palace has reached level ${k.palace}.`))
  return facts.length > 0 ? facts[seed % facts.length] : L('Uzak diyarlarda büyük savaşların konuşulduğunu duydular.', 'They heard talk of great wars in distant lands.')
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
  if (r.recalled) return [{ icon: 'home', text: L(`${t?.short ?? 'Sefer'} geri çağrıldı; kafile eli boş döndü.`, `${t?.short ?? 'Expedition'} recalled; the party came back empty-handed.`) }]
  const lines: ReportLine[] = [
    {
      icon: t?.icon ?? 'pin',
      text: L(
        `${e.villagers} köylü${countOf(e.escort) > 0 ? ` ve ${countOf(e.escort)} muhafız` : ''} ${span(e.endAt - e.startAt)} süren yolculuktan döndü.`,
        `${e.villagers} villager${e.villagers === 1 ? '' : 's'}${countOf(e.escort) > 0 ? ` and ${countOf(e.escort)} guard${countOf(e.escort) === 1 ? '' : 's'}` : ''} returned from a journey of ${span(e.endAt - e.startAt)}.`,
      ),
    },
  ]
  for (const i of r.incidents) lines.push({ icon: i.bad ? 'warn' : 'star', text: INCIDENT_TEXTS[e.kind]?.[i.id] ?? i.id, tone: i.bad ? 'down' : 'up' })
  if (r.find) lines.push({ icon: 'chest', text: `${FIND_TEXTS[r.find]?.name}: ${FIND_TEXTS[r.find]?.text}`, tone: 'up' })
  if (r.rumour !== undefined) lines.push({ icon: 'eye', text: L(`Duydukları: ${rumourText(r.rumour, online)}`, `What they heard: ${rumourText(r.rumour, online)}`) })
  const got = haulText(r.gains)
  lines.push(got ? { icon: 'chest', text: L(`Getirdikleri: ${got}.`, `They brought: ${got}.`), tone: 'up' } : { icon: 'chest', text: L('Depolara bir şey getirmediler.', 'They brought nothing for the stores.') })
  if (r.wasted && haulText(r.wasted)) lines.push({ icon: 'warn', text: L(`Depolarda yer olmadığı için ${haulText(r.wasted, '')} boşa gitti.`, `With no room in the stores, ${haulText(r.wasted, '')} went to waste.`), tone: 'down' })
  if (r.boon) lines.push({ icon: r.boon.happiness > 0 ? 'happy' : 'unhappy', text: L(
        `Anlattıkları halkı ${r.boon.happiness > 0 ? 'sevindirdi' : 'korkuttu'}: mutluluk ${r.boon.happiness > 0 ? '+' : '−'}${Math.abs(r.boon.happiness)} (${span(r.boon.until - r.at)}).`,
        `Their tales ${r.boon.happiness > 0 ? 'delighted' : 'frightened'} the people: happiness ${r.boon.happiness > 0 ? '+' : '−'}${Math.abs(r.boon.happiness)} (${span(r.boon.until - r.at)}).`,
      ), tone: r.boon.happiness > 0 ? 'up' : 'down' })
  if (r.villagersLost > 0) lines.push({ icon: 'unhappy', text: L(`${r.villagersLost} köylü geri dönmedi.`, `${r.villagersLost} villager${r.villagersLost === 1 ? '' : 's'} did not come back.`), tone: 'down' })
  if (r.soldiersLost > 0) lines.push({ icon: 'swords', text: L(`${r.soldiersLost} muhafız yolda düştü.`, `${r.soldiersLost} guard${r.soldiersLost === 1 ? '' : 's'} fell on the road.`), tone: 'down' })
  return lines
}

export function ExpeditionReport({ expedition: e, kingdom, online, onClose }: { expedition: Expedition; kingdom: Kingdom; online?: Online; onClose: () => void }) {
  const t = EXPEDITION_TEXTS[e.kind]
  const lines = expeditionLines(e, online)
  // Hoofbeats and a horn: the expedition is home.
  useEffect(() => playOnce(`expedition:${e.id}`, 'expedition'), [e.id])
  return (
    <div className="modal" role="dialog" aria-labelledby="expedition-title" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <section className="dialog frame away">
        <header className="sheet-head">
          <Icon name={t?.icon ?? 'pin'} size={32} />
          <div>
            <h2 id="expedition-title">{t?.name ?? L('Sefer', 'Expedition')}</h2>
            <small>{L('Kafile döndü', 'The party is back')}</small>
          </div>
          <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat', 'Close')}>
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
            {L('Tamam', 'OK')}
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
      <Section title={L('Hanedan hedefleri', 'Dynasty goals')} icon="star" aside={`★ ${rank.stars} / ${max}`}>
        <div className="feature">
          <Icon name="crown" size={48} />
          <div>
            <b>{rank.title}</b>
            <p className="hint">
              {rank.next ? L(`${rank.next.stars - rank.stars} yıldız daha: ${rank.next.title}`, `${rank.next.stars - rank.stars} more star${rank.next.stars - rank.stars === 1 ? '' : 's'}: ${rank.next.title}`) : L('En yüce unvana ulaştın.', 'You have reached the highest title.')}{' '}
              {L(`Her basamak bir yıldız ve küçük bir kese (${rewards.join(' / ')} altın) getirir.`, `Every tier brings a star and a small purse (${rewards.join(' / ')} gold).`)}
            </p>
          </div>
        </div>
        <Meter value={rank.next ? rank.stars / rank.next.stars : 1} label={L('Sonraki unvan', 'Next title')} segments={16} />
      </Section>
      <Section title={L('Hedefler', 'Goals')} icon="banner">
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
                        {L('Sonraki:', 'Next:')} {g?.what(next)} ({fmt(Math.min(value, next))} / {fmt(next)})
                      </small>
                      <Meter value={(value - prev) / (next - prev)} label={g?.name ?? track} segments={10} />
                    </>
                  ) : (
                    <small className="up">{L('Bütün basamaklar tamam.', 'All tiers complete.')}</small>
                  )}
                </div>
                <span className="medals" aria-label={L(`${tier} / ${tiers.length} basamak`, `${tier} / ${tiers.length} tiers`)}>
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
    <Section title={L('Kâhya', 'Steward')} icon="scroll" aside={on ? L('görevde', 'on duty') : L('izinde', 'on leave')}>
      <p className="hint">
        {L(
          `Bir afet geldiğinde ${Math.round(balance.institutions.events.crisis.decideSeconds / 60)} dakika içinde karar vermezsen kâhyan köylüleri seferber eder: zarar önlenir, kısa bir süre iş gücü düşer. Her seferinde ${fmt(fee.gold ?? 0)} altın alır; hazinede yoksa bir şey yapamaz. Sen yokken işe yarar.`,
          `When a disaster strikes and you do not decide within ${Math.round(balance.institutions.events.crisis.decideSeconds / 60)} minutes, your steward turns out the villagers: the harm is averted and the workforce drops for a short while. He charges ${fmt(fee.gold ?? 0)} gold each time; with an empty treasury he can do nothing. Handy while you are away.`,
        )}
      </p>
      <button className={on ? 'btn small' : 'btn small primary'} onClick={() => online?.act({ type: 'steward', on: !on })}>
        {on ? L('Kâhyayı izne çıkar', 'Send the steward on leave') : L('Kâhyayı göreve al', 'Put the steward on duty')}
      </button>
    </Section>
  )
}
