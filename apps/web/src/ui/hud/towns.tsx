import { useState } from 'react'
import {
  atWar,
  balance,
  dynastyEffects,
  happinessOf,
  heldTown,
  overreachOf,
  townCenter,
  townFactor,
  townLoyalty,
  townLoyaltyParts,
  townRevoltIn,
  townRevolting,
  townScore,
  townSends,
  townSiegeMs,
  townUpkeepGold,
  townUpkeepLevel,
} from '@game/shared'
import type { Army, HeldTown, Kingdom, LoyaltyParts, Pact, Point, Town, TownGood, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { TOWN_KIND_NAMES, townGift } from '../../game/towns'
import { Icon } from '../icons'
import { Meter, Section, Stat, fmt, signed, times } from './primitives'

// A town's sheet (CLAUDE.md §8.4): what it sends its holder, who holds it, the siege under way, and sending an army
// to lay siege to it. A town of the player's own also shows what it has sent so far, how loyal it is and why, the
// upkeep paid for that loyalty (set here), and what it adds to the lord's strength and to his crown's.

// The upkeep levels by name (balance.towns.upkeep.goldPerRound).
const UPKEEP_NAMES = ['Yok', 'Az', 'Orta', 'Cömert']
const upkeepName = (i: number) => UPKEEP_NAMES[i] ?? `${i}. kademe`

const GOOD_NAMES: Record<TownGood, string> = { gold: 'Altın', food: 'Yemek', materials: 'Yapı malzemesi', arms: 'Savaş malzemesi', villagers: 'Köylü' }
const amount = (v: number) => (v >= 100 ? fmt(v) : (Math.round(v * 10) / 10).toLocaleString('tr-TR'))
const span = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return m < 60 ? `${m} dakika` : m < 1440 ? `${Math.floor(m / 60)} saat ${m % 60} dakika` : `${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} saat`
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function TownSheet({ world, town, walled, kingdom, me, names, armies, pacts, now, onSend, onShow, onWatch, onUpkeep, onRelease, onClose }: {
  world: World
  town: Town
  // Behind a wooden palisade (see townWalled).
  walled: boolean
  kingdom: Kingdom
  me: number
  // Kingdoms' names by id.
  names: Map<number, string>
  armies: Army[]
  pacts: Pact[]
  now: number
  onSend(army: number, tile: Point): void
  onShow(tile: Point): void
  onWatch(): void
  // Sets the upkeep paid to a town of the player's (an index into balance.towns.upkeep.goldPerRound).
  onUpkeep(level: number): void
  // Lets a town of the player's go (it goes back to no one).
  onRelease(): void
  onClose(): void
}) {
  const middle = townCenter(town)
  const distance = Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))
  const mine = town.owner === me
  const holder = town.owner === null ? null : (names.get(town.owner) ?? '?')
  const lawful = town.owner === null || atWar(pacts, me, town.owner)
  const siege = town.siege
  const own = armies.filter((a) => a.kingdom_id === me && a.status !== 'battle')
  const minutes = Math.round(townSiegeMs(walled) / 60_000)
  const p = balance.towns.palisade
  return (
    <section className="sheet frame" aria-labelledby="town-title">
      <header className="sheet-head">
        <Icon name="banner" size={32} />
        <div>
          <h2 id="town-title">{town.name}</h2>
          <small>
            {TOWN_KIND_NAMES[town.kind]}
            {walled && ' · tahta surlu'} · {distance} karo uzakta
          </small>
        </div>
        <button className="btn icon-only" onClick={() => onShow(middle)} aria-label="Haritada göster" title="Haritada göster">
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <div className="feature">
          <Icon name="crown" size={32} />
          <div>
            <b>{mine ? 'Bu kasaba senin' : holder ? `${holder} elinde` : 'Kimseye bağlı değil'}</b>
            <small className="hint">
              Sahibine {townGift(town.kind)} gönderir.
              {town.owner === null && ` Kendi garnizonu var: ${town.garrison} asker; kuşatma bitince ordun onlar kadar kayıp verir.`}
              {town.owner !== null && !mine && ' Sahibiyle savaştaysan kuşatıp alabilirsin.'}
              {mine && ' Savaşta olduğun biri kuşatırsa ordunla gelip kuşatmayı kırabilirsin.'}
              {walled &&
                ` Tahta bir çitle çevrili: taş surdan zayıftır ama kuşatma %${Math.round((p.siegeFactor - 1) * 100)} uzun sürer ve garnizon %${Math.round((p.lossFactor - 1) * 100)} daha çok kayıp verdirir.`}
            </small>
          </div>
        </div>
        {mine && <Holding world={world} kingdom={kingdom} held={kingdom.towns?.find((h) => h.id === town.id) ?? heldTown(town, now)} now={now} onUpkeep={onUpkeep} besieged={!!siege} onRelease={onRelease} />}
        {siege && (
          <Section title="Kuşatma" icon="swords" aside={`${clock(siege.endsAt - now)} kaldı`}>
            <p className="hint">{siege.kingdom === me ? 'Ordun kasabayı kuşatıyor.' : `${names.get(siege.kingdom) ?? '?'} ordusu kasabayı kuşatıyor.`}</p>
            <Meter value={(now - siege.startedAt) / (siege.endsAt - siege.startedAt)} tone={siege.kingdom === me ? 'up' : 'down'} label="Kuşatma ilerlemesi" segments={12} />
            <button className="btn small" onClick={onWatch}>
              İzle
            </button>
          </Section>
        )}
        {!mine && <Overreach held={kingdom.towns?.length ?? 0} taking />}
        {!mine && (
          <Section title="Kuşat" icon="shield">
            {!lawful ? (
              <p className="hint">Bu kasaba {holder} elinde ve onunla savaşta değilsin. Kuşatmak için önce savaş ilan etmelisin.</p>
            ) : own.length === 0 ? (
              <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <>
                <p className="hint">Gönderdiğin ordu kasabanın kapısına varınca kuşatma başlar ve {minutes} dakika sürer. Ordu orada kalmalı; giderse ya da yenilirse kuşatma kalkar.</p>
                <ul className="town-armies">
                  {own.map((a) => (
                    <li key={a.id}>
                      <span>
                        Ordu #{a.id} · {a.soldiers ?? '?'} asker
                      </span>
                      <button className="btn small" disabled={!!siege && siege.army === a.id} onClick={() => onSend(a.id, middle)}>
                        {siege && siege.army === a.id ? 'Kuşatıyor' : 'Gönder'}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}
      </div>
    </section>
  )
}

// A town of the player's: its loyalty and what moves it, the upkeep, what it has sent, and the strength it lends.
function Holding({ world, kingdom, held, now, onUpkeep, besieged, onRelease }: { world: World; kingdom: Kingdom; held: HeldTown; now: number; onUpkeep(level: number): void; besieged: boolean; onRelease(): void }) {
  const [sure, setSure] = useState(false)
  const t = balance.towns
  const loyalty = townLoyalty(held)
  // How many towns the lord holds (this one among them): over-expansion weighs on all of them.
  const count = Math.max(1, kingdom.towns?.length ?? 1)
  const over = overreachOf(count)
  const mood = { happiness: happinessOf(kingdom), ruler: dynastyEffects(kingdom).happiness, towns: count }
  const parts = townLoyaltyParts(held, mood)
  const target = parts.target
  const trend = target - loyalty
  const revolting = townRevolting(held, now)
  const level = townUpkeepLevel(held)
  const roundsPerHour = 3600 / balance.economy.productionSeconds
  const cost = townUpkeepGold(held, count)
  const sends = townSends(held, now, count)
  const factor = townFactor(held, now) * over.yieldFactor
  const delivered = held.delivered ?? {}
  const goods = (Object.keys(GOOD_NAMES) as TownGood[]).filter((g) => (delivered[g] ?? 0) > 0 || sends[g] > 0)
  const points = Math.round(townScore(held, now))
  const liege = kingdom.liege !== undefined && world.cities[kingdom.liege] ? cityInfo(world, kingdom.liege) : null
  const r = t.revolt
  return (
    <>
      <Section title="Sadakat" icon={loyalty >= 50 ? 'happy' : loyalty >= r.below ? 'content' : 'unhappy'} aside={`%${Math.round(loyalty)} · ${Math.abs(trend) < 0.5 ? 'durgun' : trend > 0 ? 'yükseliyor' : 'düşüyor'}`}>
        <Meter value={loyalty / 100} tone={loyalty >= 50 ? 'up' : loyalty >= r.below ? 'gold' : 'down'} label="Sadakat" segments={20} />
        {revolting ? (
          <p className="alert">
            Kasaba ayaklandı: {span(held.revoltUntil! - now)} daha hiçbir şey göndermeyecek. Ayaklanma bittiğinde sadakat %{r.breakAwayBelow}'nin altındaysa kasaba senden kopar.
          </p>
        ) : loyalty < r.below + 10 ? (
          <p className="alert">Sadakat %{r.below}'in altına inerse kasaba ayaklanır. Bakımı artırmak sadakati yükseltir.</p>
        ) : null}
        <Stat label="Gittiği yer" value={`%${Math.round(target)}`} tone={trend >= 0 ? 'up' : 'down'} note={`yaklaşık ${Math.round(t.loyalty.tauSeconds / 60)} dakikada yolun üçte ikisini alır`} />
        <p className="hint">
          Sadakat ne kadar yüksekse kasaba o kadar çok gönderir (%0'da ×{t.loyalty.yieldMin}, %100'de ×{t.loyalty.yieldMax}
          {over.yieldFactor < 1 && `, aşırı büyüme ×${String(over.yieldFactor).replace('.', ',')}`}; şu an ×{factor.toFixed(2).replace('.', ',')}).
        </p>
      </Section>
      <Unrest held={held} parts={parts} level={level} loyalty={loyalty} now={now} />
      {count > 1 && <Overreach held={count} />}
      <Section title="Bakım" icon="gold" aside={cost > 0 ? `tur başına ${amount(cost)} altın` : 'ödeme yok'}>
        <p className="hint">Kasabayı elinde tutmak için her üretim turunda hazineden ödenir. Hazine yetmezse ödenmez ve sadakat bakımsızmış gibi düşer.</p>
        <div className="segmented" role="radiogroup" aria-label="Bakım">
          {t.upkeep.goldPerRound.map((gold, i) => (
            <button key={i} className="btn small" role="radio" aria-checked={level === i} onClick={() => level !== i && onUpkeep(i)}>
              {upkeepName(i)}
              <small> {gold > 0 ? `${amount(gold * over.upkeepFactor)}` : '0'}</small>
            </button>
          ))}
        </div>
        <Stat
          label="Saatte"
          value={`${amount(cost * roundsPerHour)} altın`}
          note={`sadakat tabanı %${t.loyalty.upkeepTargets[level]} (+ halk ve hükümdar${over.loyalty < 0 ? ', − aşırı büyüme' : ''})${over.upkeepFactor > 1 ? ` · aşırı büyüme bakımı ${times(over.upkeepFactor)} yapıyor` : ''}`}
        />
      </Section>
      <Section title="Sana getirdikleri" icon="chest" aside={held.takenAt ? `alınalı ${span(now - held.takenAt)}` : undefined}>
        {goods.length === 0 && <p className="hint">Henüz bir şey göndermedi.</p>}
        {goods.map((g) => (
          <Stat
            key={g}
            label={
              <>
                <Icon name={g === 'villagers' ? 'villager' : g} size={16} /> {GOOD_NAMES[g]}
              </>
            }
            value={g === 'villagers' ? `${fmt(sends.villagers)} köylü` : `${amount(delivered[g] ?? 0)} toplam`}
            note={g === 'villagers' ? 'şu an barındırdığı' : `şu an tur başına ${amount(sends[g])}`}
          />
        ))}
        {cost > 0 && <Stat label="Bakıma giden" value={`tur başına −${amount(cost)} altın`} tone="down" />}
      </Section>
      <Section title="Serbest bırak" icon="banner">
        <p className="hint">
          Kasabayı bırakırsan sahipsiz kalır ve {t.revolt.garrison[0]}–{t.revolt.garrison[1]} askerlik küçük bir garnizonla kendini korur. Bakımı, katkısı ve kattığı
          puan biter; {count > 1 ? `elindeki kasaba ${count - 1}'e iner ve aşırı büyüme cezası hemen hafifler` : 'sonra yeniden kuşatıp alabilirsin'}.
        </p>
        <button
          className={sure ? 'btn small danger' : 'btn small'}
          disabled={besieged}
          title={besieged ? 'Kuşatma altındaki kasaba bırakılamaz' : undefined}
          onClick={() => (sure ? (setSure(false), onRelease()) : setSure(true))}
          onBlur={() => setSure(false)}
        >
          {besieged ? 'Kuşatma sürerken bırakılamaz' : sure ? `Emin misin? ${held.name ?? 'Kasabayı'} serbest bırak` : 'Serbest bırak'}
        </button>
      </Section>
      <Section title="Sana kattığı güç" icon="crown" aside={`+${points} puan`}>
        <p className="hint">
          Kasaba lordluğunun puanına +{points} katar (sadakatle artar, ayaklanmada yarıya iner).{' '}
          {liege ? (
            <>
              Bağlı olduğun <b style={{ color: liege.color }}>{liege.name}</b>nın gücüne +{points}.
            </>
          ) : (
            'Henüz bir taç krallığına biat etmedin; ettiğinde bu puan onun gücüne de eklenir.'
          )}
        </p>
      </Section>
    </>
  )
}

// ---- Unrest and over-expansion (CLAUDE.md §8.4) ----------------------------------------------------------------------

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`
const minutesOf = (ms: number) => Math.max(1, Math.round(ms / 60_000))

// How bad over-expansion is at each tier of balance.towns.overreach.tiers, by name.
const OVERREACH_NAMES = ['Hafif', 'Ağır', 'İsyan']
const overreachName = (tier: number) => OVERREACH_NAMES[Math.min(tier, OVERREACH_NAMES.length - 1)]

// What over-expansion does at a tier, in one line.
function overreachText(towns: number) {
  const o = overreachOf(towns)
  if (o.tier < 0) return 'Ceza yok.'
  return [
    `her kasabanın sadakati ${signed(o.loyalty)}`,
    ...(o.loyaltyCap < 100 ? [`sadakat en fazla %${o.loyaltyCap} (ayaklanma çizgisi %${balance.towns.revolt.below})`] : []),
    `halkın mutluluğu ${signed(o.happiness)}`,
    `bakım ${times(o.upkeepFactor)}`,
    `katkı ${times(o.yieldFactor)}`,
  ].join(', ')
}

// What moves a town's loyalty, drawn as a waterfall on the 0–100 scale: the upkeep's base, the lord's people and ruler,
// over-expansion (and its cap), and where it all leads; the revolt and break-away lines run through every row. Below:
// the spies' last incitement, how soon the town will rise, and its loyalty over the next hour.
function Unrest({ held, parts, level, loyalty, now }: { held: HeldTown; parts: LoyaltyParts; level: number; loyalty: number; now: number }) {
  const t = balance.towns
  const r = t.revolt
  const rows: { label: string; from: number; to: number; note?: string }[] = []
  let sum = 0
  const step = (label: string, v: number, note?: string) => {
    const from = Math.max(0, Math.min(100, sum))
    sum += v
    rows.push({ label, from, to: Math.max(0, Math.min(100, sum)), note })
  }
  step(`Bakım (${upkeepName(held.unpaid ? 0 : level).toLocaleLowerCase('tr-TR')})`, parts.upkeep, held.unpaid ? 'ödenmedi' : undefined)
  step('Halkının mutluluğu', parts.happiness)
  step('Hükümdarın halk yeteneği', parts.ruler)
  if (parts.overreach !== 0) step('Aşırı büyüme', parts.overreach)
  if (sum > parts.cap) {
    rows.push({ label: 'Aşırı büyüme tavanı', from: Math.min(100, sum), to: parts.cap, note: `en fazla %${parts.cap}` })
    sum = parts.cap
  }
  const tau = t.loyalty.tauSeconds * 1000
  const incited = held.incitedAt !== undefined && now - held.incitedAt < tau * 2 ? held : null
  const revolting = townRevolting(held, now)
  const revoltIn = townRevoltIn(loyalty, parts.target)
  const spy = balance.espionage.operations.townRevolt.loyalty
  // How likely a revolt is, from certain to low.
  const risk = revolting
    ? { value: 1, label: 'Ayaklanmada', text: `Kasaba şu an ayaklanmada. Sadakat %${r.below}'i geçmeden ayaklanma bitmez.` }
    : revoltIn !== null
      ? { value: 1, label: 'Kesin', text: `Sadakat %${Math.round(parts.target)}'e gidiyor, ayaklanma çizgisinin altına: yaklaşık ${minutesOf(revoltIn)} dakika içinde ayaklanır.` }
      : loyalty < r.below + 10 || parts.target < r.below + 10
        ? { value: 0.75, label: 'Yüksek', text: `Sadakat ayaklanma çizgisine çok yakın; küçük bir sarsıntı (hazinenin boşalması, casuslar) yeter.` }
        : loyalty + spy < r.below || parts.target + spy < r.below
          ? { value: 0.45, label: 'Orta', text: `Bir casus kışkırtması (${signed(spy)}) kasabayı ayaklandırabilir.` }
          : { value: 0.15, label: 'Düşük', text: `Bir casus kışkırtması bile kasabayı ayaklandırmaya yetmez.` }
  // The next hour of loyalty, drifting toward its target.
  const W = 120
  const H = 40
  const points = Array.from({ length: 31 }, (_, i) => {
    const m = i * 2
    const v = parts.target + (loyalty - parts.target) * Math.exp((-m * 60_000) / tau)
    return `${(m / 60) * W},${H - (v / 100) * H}`
  }).join(' ')
  const line = (v: number) => H - (v / 100) * H
  return (
    <Section title="Huzursuzluğun kaynakları" icon="unhappy" aside={`ayaklanma riski: ${risk.label.toLocaleLowerCase('tr-TR')}`}>
      <div className="unrest-chart" role="img" aria-label="Sadakat hedefini oluşturanlar">
        {rows.map((row) => {
          const down = row.to < row.from
          return (
            <div className="unrest-row" key={row.label}>
              <span>{row.label}</span>
              <span className="unrest-track">
                <i className="line revolt" style={{ left: pct(r.below) }} />
                <i className="line free" style={{ left: pct(r.breakAwayBelow) }} />
                <i className={`bar ${down ? 'down' : 'up'}`} style={{ left: pct(Math.min(row.from, row.to)), width: pct(Math.abs(row.to - row.from)) }} />
              </span>
              <b className={down ? 'down' : 'up'}>{row.note && row.label.endsWith('tavanı') ? `%${parts.cap}` : signed(row.to - row.from)}</b>
              {row.note && <small>{row.note}</small>}
            </div>
          )
        })}
        <div className="unrest-row total">
          <span>Gittiği yer</span>
          <span className="unrest-track">
            <i className="line revolt" style={{ left: pct(r.below) }} />
            <i className="line free" style={{ left: pct(r.breakAwayBelow) }} />
            <i className={`bar ${parts.target < r.below ? 'down' : 'gold'}`} style={{ left: 0, width: pct(parts.target) }} />
          </span>
          <b className={parts.target < r.below ? 'down' : undefined}>%{Math.round(parts.target)}</b>
        </div>
        <div className="unrest-row total">
          <span>Şu an</span>
          <span className="unrest-track">
            <i className="line revolt" style={{ left: pct(r.below) }} />
            <i className="line free" style={{ left: pct(r.breakAwayBelow) }} />
            <i className={`bar ${loyalty < r.below ? 'down' : 'up'}`} style={{ left: 0, width: pct(loyalty) }} />
          </span>
          <b className={loyalty < r.below ? 'down' : undefined}>%{Math.round(loyalty)}</b>
        </div>
        <small className="unrest-legend">
          <i className="line revolt" /> %{r.below} ayaklanma · <i className="line free" /> %{r.breakAwayBelow} kopma
        </small>
      </div>
      {incited && (
        <div className="unrest-row spy">
          <span>Casus kışkırtması</span>
          <span className="unrest-track">
            <i className="bar down" style={{ left: 0, width: pct(Math.abs(incited.incitedBy ?? spy)) }} />
          </span>
          <b className="down">{signed(incited.incitedBy ?? spy)}</b>
          <small>{minutesOf(now - incited.incitedAt!)} dakika önce, bir kerelik; hedefi değiştirmez, sadakat zamanla toparlanır</small>
        </div>
      )}
      <div className="unrest-risk">
        <span>Ayaklanma riski</span>
        <Meter value={risk.value} tone={risk.value >= 0.75 ? 'down' : risk.value >= 0.4 ? 'gold' : 'up'} label="Ayaklanma riski" segments={10} />
        <b className={risk.value >= 0.75 ? 'down' : undefined}>{risk.label}</b>
      </div>
      <p className="hint">{risk.text}</p>
      <figure className="unrest-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-label="Önümüzdeki saatte sadakat" role="img">
          <rect x={0} y={line(r.below)} width={W} height={H - line(r.below)} className="zone" />
          <line x1={0} x2={W} y1={line(r.below)} y2={line(r.below)} className="revolt" />
          <line x1={0} x2={W} y1={line(r.breakAwayBelow)} y2={line(r.breakAwayBelow)} className="free" />
          <polyline points={points} className="path" />
        </svg>
        <figcaption>
          <span>şimdi</span>
          <span>önümüzdeki saatte sadakat</span>
          <span>+60 dk</span>
        </figcaption>
      </figure>
    </Section>
  )
}

// Over-expansion: what holding `held` towns costs, tier by tier, with the lord's own tier marked (and, `taking`, the
// one he would reach with one more).
function Overreach({ held, taking = false }: { held: number; taking?: boolean }) {
  const tiers = balance.towns.overreach.tiers
  const now = overreachOf(held)
  const next = taking ? overreachOf(held + 1) : null
  const counts = [1, ...tiers.map((t) => t.towns)]
  const worst = Math.max(1, ...tiers.map((t) => -t.loyalty + (100 - t.loyaltyCap)))
  const last = tiers[tiers.length - 1]
  const at = (n: number) => (n >= last.towns ? last.towns : n)
  return (
    <Section title="Aşırı büyüme" icon="warn" aside={now.tier < 0 ? (taking ? `${held} kasaban var` : 'yok') : `${held} kasaba · ${overreachName(now.tier).toLocaleLowerCase('tr-TR')}`}>
      {taking ? (
        next!.tier < 0 ? (
          <p className="hint">Bu ilk kasaban olur: tek kasabanın aşırı büyüme cezası yoktur.</p>
        ) : (
          <p className={next!.tier >= tiers.length - 1 ? 'alert' : 'hint'}>
            Bu kasabayı alırsan elinde {held + 1} kasaba olur ve aşırı büyüme {now.tier < 0 ? 'başlar' : next!.tier > now.tier ? 'artar' : 'sürer'} ({overreachName(next!.tier).toLocaleLowerCase('tr-TR')}): {overreachText(held + 1)}.
            {next!.tier >= tiers.length - 1 && ' Kasabaların hepsi ayaklanır.'}
          </p>
        )
      ) : (
        <p className={now.tier >= tiers.length - 1 ? 'alert' : 'hint'}>
          Bir lord aynı anda ancak bu kadar kasabaya söz geçirebilir. {held} kasaba elinde: {overreachText(held)}.
          {now.tier >= tiers.length - 1 && ' Kasabaların sadakati kopma çizgisinin altında kalır: hepsi ayaklanıp kopacak. Birini paneldeki "Serbest bırak" ile bırakırsan ötekiler rahatlar.'}
        </p>
      )}
      <div className="overreach-ladder" role="table" aria-label="Kasaba sayısına göre aşırı büyüme">
        {counts.map((n, i) => {
          const o = overreachOf(n)
          const weight = -o.loyalty + (100 - o.loyaltyCap)
          const mark = at(held) === n ? 'now' : next && at(held + 1) === n ? 'next' : ''
          return (
            <div key={n} className={`overreach-row ${mark}`} role="row">
              <span role="cell">
                {n === last.towns ? `${n}+` : n} kasaba
                {mark === 'now' && <small> · sen</small>}
                {mark === 'next' && <small> · alırsan</small>}
              </span>
              <span className="overreach-bar" role="cell">
                <i className={i === counts.length - 1 ? 'down' : i === 0 ? 'up' : 'gold'} style={{ width: pct(i === 0 ? 2 : (weight / worst) * 100) }} />
              </span>
              <small role="cell">
                {o.tier < 0
                  ? 'ceza yok'
                  : `sadakat ${signed(o.loyalty)}${o.loyaltyCap < 100 ? `, en fazla %${o.loyaltyCap}` : ''} · mutluluk ${signed(o.happiness)} · bakım ${times(o.upkeepFactor)} · katkı ${times(o.yieldFactor)}`}
              </small>
            </div>
          )
        })}
      </div>
      <p className="hint">Cezalar elindeki bütün kasabalara (ve lordluğunun halkına) birlikte işler; bir kasaba kopunca ya da elden çıkınca hemen hafifler.</p>
    </Section>
  )
}
