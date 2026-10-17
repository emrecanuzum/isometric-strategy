import { useState } from 'react'
import { Subtabs, usePart } from './Subtabs'
import type { Part } from './Subtabs'
import {
  armyAt,
  townGate,
  atWar,
  balance,
  dynastyEffects,
  townKinBonus,
  happinessOf,
  heldTown,
  overreachOf,
  townCenter,
  townFactor,
  townLoyalty,
  townLoyaltyParts,
  townLosses,
  townRevoltIn,
  townRevolting,
  townScore,
  townSends,
  townSiegeMs,
  townUpkeepGold,
  townUpkeepLevel,
  cargoRoom,
  priceAt,
  townMarketGood,
  townQuiet,
  townRelationFactor,
  townStock,
  townUnitPrice,
} from '@game/shared'
import type { Army, HeldTown, Kingdom, LoyaltyParts, Market, Pact, Point, Town, TownGood, World } from '@game/shared'
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

// Armies named as on the army tab: "1. Ordu", "2. Ordu" (the lord's armies in the order they were raised).
const armyLabel = (a: Army, all: Army[]) => `${all.filter((b) => b.kingdom_id === a.kingdom_id).sort((x, y) => x.id - y.id).findIndex((b) => b.id === a.id) + 1}. Ordu`

export function TownSheet({ world, town, walled, kingdom, me, names, armies, pacts, now, market, relation, onSend, onMove, onBuy, onWatchBattle, onShow, onWatch, onUpkeep, onRelease, onClose }: {
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
  // The lobby's prices, and how the player stands with the town's lord (null: his own town, or a free one).
  market: Market | null | undefined
  relation: number | null
  // Sends an army to lay siege (or, at a town of the player's, to put down its rebels).
  onSend(army: number, tile: Point): void
  // Sends an army just to stand at the gate (to buy at the market).
  onMove(army: number, tile: Point): void
  // Buys at the town's market with an army at its gate.
  onBuy(army: number, units: number): void
  onWatchBattle(battle: number): void
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
  // Standing at the town's gate already (it besieges at once).
  const gate = townGate(town)
  const atGate = (a: Army) => {
    const here = armyAt(a, now)
    return Date.parse(a.arrive_at) <= now && Math.hypot(here.x - gate.x, here.y - gate.y) <= balance.towns.market.gateTiles
  }
  const minutes = Math.round(townSiegeMs(walled) / 60_000)
  const p = balance.towns.palisade
  const held = mine ? (kingdom.towns?.find((h) => h.id === town.id) ?? heldTown(town, now)) : null
  // In parts, like the other menus (the last one looked at remembered): one's own town and another's have their own.
  const [part, setPart] = usePart<TownPart>(mine ? 'town:own' : 'town:other', mine ? OWN_PARTS : OTHER_PARTS, mine ? 'state' : 'info')
  const restless = !!held && (townRevolting(held, now) || townLoyalty(held) < balance.towns.revolt.below + 5 || !!town.rebels)
  const parts: Part<TownPart>[] = mine
    ? [
        { id: 'state', name: 'Durum', icon: 'happy', dot: restless },
        { id: 'upkeep', name: 'Bakım', icon: 'gold', dot: (kingdom.towns?.length ?? 0) > 1 },
        { id: 'yield', name: 'Getiri', icon: 'chest' },
        { id: 'market', name: 'Pazar', icon: 'trade' },
        { id: 'siege', name: 'Kuşatma', icon: 'swords', dot: !!siege },
        { id: 'release', name: 'Bırak', icon: 'banner' },
      ]
    : [
        { id: 'info', name: 'Bilgi', icon: 'scroll' },
        { id: 'market', name: 'Pazar', icon: 'trade' },
        { id: 'siege', name: 'Kuşat', icon: 'swords', dot: !!siege },
      ]
  const marketPart = part === 'market' && (
    <TownMarket town={town} kingdom={kingdom} mine={mine} holder={holder} armies={own} atGate={atGate} market={market} relation={relation} now={now} onMove={(a) => onMove(a, middle)} onBuy={onBuy} />
  )
  const siegeSection = siege && (
    <Section title="Kuşatma" icon="swords" aside={`${clock(siege.endsAt - now)} kaldı`}>
      <p className="hint">{siege.kingdom === me ? 'Ordun kasabayı kuşatıyor.' : `${names.get(siege.kingdom) ?? '?'} ordusu kasabayı kuşatıyor.`}</p>
      <Meter value={(now - siege.startedAt) / (siege.endsAt - siege.startedAt)} tone={siege.kingdom === me ? 'up' : 'down'} label="Kuşatma ilerlemesi" segments={12} />
      <button className="btn small" onClick={onWatch}>
        İzle
      </button>
    </Section>
  )
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
              {town.owner === null && ` Kendi garnizonu var: ${town.garrison} asker; kuşatma boyunca ordun yaklaşık ${townLosses(town.garrison, walled)} asker kaybeder.`}
              {town.owner !== null && !mine && ' Sahibiyle savaştaysan kuşatıp alabilirsin.'}
              {mine && ' Savaşta olduğun biri kuşatırsa ordunla gelip kuşatmayı kırabilirsin.'}
              {walled &&
                ` Tahta bir çitle çevrili: taş surdan zayıftır ama kuşatma %${Math.round((p.siegeFactor - 1) * 100)} uzun sürer ve garnizon %${Math.round((p.lossFactor - 1) * 100)} daha çok kayıp verdirir.`}
            </small>
          </div>
        </div>
        <Subtabs label="Kasaba" parts={parts} part={part} onPart={setPart} />
        {mine && part === 'state' && town.rebels && (
          <Rebels town={town} armies={own} atGate={atGate} now={now} onSend={(a) => onSend(a, middle)} onWatchBattle={onWatchBattle} />
        )}
        {held && part !== 'siege' && part !== 'market' && <Holding world={world} kingdom={kingdom} held={held} now={now} onUpkeep={onUpkeep} besieged={!!siege} onRelease={onRelease} part={part} />}
        {marketPart}
        {mine && part === 'siege' && (
          <>
            {siegeSection || (
              <Section title="Kuşatma" icon="shield">
                <p className="hint">Kasaban şu an kuşatma altında değil.</p>
              </Section>
            )}
            <p className="hint">
              Savaşta olduğun bir lord ordusunu kasabanın kapısına getirirse kuşatma başlar ve {minutes} dakika sürer; bitince kasaba onun olur. Ordunla gelip
              kuşatanla meydan muharebesine girersen kuşatmayı kırarsın.{walled ? ' Tahta çit kuşatmayı uzatır.' : ''}
            </p>
          </>
        )}
        {!mine && part === 'info' && <Overreach held={kingdom.towns?.length ?? 0} taking />}
        {!mine && part === 'siege' && siegeSection}
        {!mine && part === 'siege' && (
          <Section title="Kuşat" icon="shield">
            {!lawful ? (
              <p className="hint">Bu kasaba {holder} elinde ve onunla savaşta değilsin. Kuşatmak için önce savaş ilan etmelisin.</p>
            ) : own.length === 0 ? (
              <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <>
                <p className="hint">
                  Kuşatma yalnız buradan başlar: kapıdaki ordu hemen kuşatır, uzaktaki ordu kapıya varınca. Haritadan "Hareket" ile gelen ordu kapıda bekler. Kuşatma {minutes} dakika sürer; ordu orada
                  kalmalı, giderse ya da yenilirse kuşatma kalkar.
                </p>
                <ul className="town-armies">
                  {own.map((a) => (
                    <li key={a.id}>
                      <span>
                        {armyLabel(a, armies)} · {a.soldiers ?? '?'} asker
                      </span>
                      {(() => {
                        // Already on its way here to lay siege: say so rather than offer to send it again.
                        const going = !siege && a.goal.kind === 'town' && a.goal.town === town.id && Date.parse(a.arrive_at) > now
                        return (
                          <button className="btn small" disabled={!!siege || going} onClick={() => onSend(a.id, middle)}>
                            {siege && siege.army === a.id
                              ? 'Kuşatıyor'
                              : going
                                ? `Yolda · ${Math.ceil((Date.parse(a.arrive_at) - now) / 60_000)} dk`
                                : atGate(a)
                                  ? 'Kuşatmayı başlat'
                                  : 'Gönder ve kuşat'}
                          </button>
                        )
                      })()}
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
type TownPart = 'state' | 'upkeep' | 'yield' | 'market' | 'siege' | 'release' | 'info'
const OWN_PARTS: TownPart[] = ['state', 'upkeep', 'yield', 'market', 'siege', 'release']
const OTHER_PARTS: TownPart[] = ['info', 'market', 'siege']

function Holding({ world, kingdom, held, now, onUpkeep, besieged, onRelease, part }: { world: World; kingdom: Kingdom; held: HeldTown; now: number; onUpkeep(level: number): void; besieged: boolean; onRelease(): void; part: TownPart }) {
  const [sure, setSure] = useState(false)
  const t = balance.towns
  const loyalty = townLoyalty(held)
  // How many towns the lord holds (this one among them): over-expansion weighs on all of them.
  const count = Math.max(1, kingdom.towns?.length ?? 1)
  const over = overreachOf(count)
  const mood = { happiness: happinessOf(kingdom), ruler: dynastyEffects(kingdom).happiness, towns: count, kin: townKinBonus(kingdom) }
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
      {part === 'state' && (
        <>
          <Section title="Sadakat" icon={loyalty >= 50 ? 'happy' : loyalty >= r.below ? 'content' : 'unhappy'} aside={`%${Math.round(loyalty)} · ${Math.abs(trend) < 0.5 ? 'durgun' : trend > 0 ? 'yükseliyor' : 'düşüyor'}`}>
            <Meter value={loyalty / 100} tone={loyalty >= 50 ? 'up' : loyalty >= r.below ? 'gold' : 'down'} label="Sadakat" segments={20} />
            {revolting ? (
              <p className="alert">
                Kasaba ayaklandı: {span(held.revoltUntil! - now)} daha hiçbir şey göndermeyecek. Asileri yenersen ayaklanma hemen biter; yoksa ayaklanma bittiğinde sadakat %{r.breakAwayBelow}'nin altındaysa kasaba senden kopar.
              </p>
            ) : townQuiet(held, now) ? (
              <p className="hint">Ayaklanma bastırıldı: kasaba {span(held.quietUntil! - now)} daha ayaklanmaz, sadakati düşük olsa bile. Bu sürede bakımı artırıp sadakati toparla.</p>
            ) : loyalty < r.below + 10 ? (
              <p className="alert">Sadakat %{r.below}'in altına inerse kasaba ayaklanır. Bakımı artırmak sadakati yükseltir.</p>
            ) : null}
            <Stat label="Gittiği yer" value={`%${Math.round(target)}`} tone={trend >= 0 ? 'up' : 'down'} note={`yaklaşık ${Math.round(t.loyalty.tauSeconds / 60)} dakikada yolun üçte ikisini alır`} />
            <p className="hint">
              Sadakat ne kadar yüksekse kasaba o kadar çok gönderir (%0'da ×{t.loyalty.yieldMin.toLocaleString('tr-TR')}, %100'de ×{t.loyalty.yieldMax.toLocaleString('tr-TR')}
              {over.yieldFactor < 1 && `, aşırı büyüme ×${String(over.yieldFactor).replace('.', ',')}`}; şu an ×{factor.toFixed(2).replace('.', ',')}).
            </p>
          </Section>
          <Unrest held={held} parts={parts} level={level} loyalty={loyalty} now={now} />
        </>
      )}
      {part === 'upkeep' && (
        <>
          {count > 1 && <Overreach held={count} />}
          <Section title="Bakım" icon="gold" aside={cost > 0 ? `tur başına ${amount(cost)} altın` : 'ödeme yok'}>
            <p className="hint">Kasabayı elinde tutmak için her üretim turunda hazineden ödenir. Hazine yetmezse ödenmez ve sadakat bakımsızmış gibi düşer.</p>
            <div className="segmented choices" role="radiogroup" aria-label="Bakım">
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
        </>
      )}
      {part === 'yield' && (
        <>
          <Section title="Sana getirdikleri" icon="chest" aside={held.takenAt ? `${span(now - held.takenAt)} önce alındı` : undefined}>
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
      )}
      {part === 'release' && (
        <>
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
              {besieged ? 'Kuşatma sürerken bırakılamaz' : sure ? 'Emin misin? Kasabayı serbest bırak' : 'Serbest bırak'}
            </button>
          </Section>
        </>
      )}
    </>
  )
}

// ---- Rebels and the town's market (CLAUDE.md §8.4) -------------------------------------------------------------------

// The rebels at the gate of the player's town: how many, since when, and sending an army to put them down.
function Rebels({ town, armies, atGate, now, onSend, onWatchBattle }: { town: Town; armies: Army[]; atGate(a: Army): boolean; now: number; onSend(army: number): void; onWatchBattle(battle: number): void }) {
  const rebels = town.rebels!
  const q = balance.towns.rebels
  return (
    <Section title="Asiler kasabayı kuşatıyor" icon="swords" aside={`${rebels.count} asi · ${span(now - rebels.since)}dır`}>
      <p className="alert">
        {rebels.count} asi kasabanın kapısını tuttu; ayaklanma sürdükçe kasaba hiçbir şey göndermez. Ordunu gönderip asileri yenersen ayaklanma biter, sadakat +{q.quellLoyalty} artar ve kasaba{' '}
        {Math.round(q.quietSeconds / 60)} dakika yeniden ayaklanmaz. Yenilirsen ordun eve çekilir, asiler kalır.
      </p>
      {rebels.battle ? (
        <div className="row spread">
          <span className="hint">Ordun asilerle çarpışıyor.</span>
          <button className="btn small" onClick={() => onWatchBattle(rebels.battle!)}>
            İzle
          </button>
        </div>
      ) : armies.length === 0 ? (
        <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
      ) : (
        <>
          <p className="hint">Asiler kendi topraklarını iyi bilir; en az {Math.ceil(rebels.count * 1.5)} askerle gitmek akıllıcadır.</p>
          <ul className="town-armies">
            {armies.map((a) => (
              <li key={a.id}>
                <span>
                  {armyLabel(a, armies)} · {a.soldiers ?? '?'} asker
                </span>
                <button className="btn small" onClick={() => onSend(a.id)}>
                  {atGate(a) ? 'Ayaklanmayı bastır' : 'Gönder ve bastır'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

const MARKET_GOOD_NAMES = { food: 'yemek', materials: 'yapı malzemesi', arms: 'savaş malzemesi' } as const

// The town's market: the good it sells, its stock, its price for the player, and buying with an army at the gate.
function TownMarket({ town, kingdom, mine, holder, armies, atGate, market, relation, now, onMove, onBuy }: {
  town: Town
  kingdom: Kingdom
  mine: boolean
  holder: string | null
  armies: Army[]
  atGate(a: Army): boolean
  market: Market | null | undefined
  relation: number | null
  now: number
  onMove(army: number): void
  onBuy(army: number, units: number): void
}) {
  const m = balance.towns.market
  const [amount, setAmount] = useState<Record<number, number>>({})
  const good = townMarketGood(town.kind)
  const name = MARKET_GOOD_NAMES[good]
  const stock = Math.floor(townStock(town, now))
  const unit = townUnitPrice(market, town.kind, now, relation)
  const lobby = priceAt(market, good, now)
  const factor = townRelationFactor(relation)
  const perHour = Math.round(m.refillPerRound * (3600 / balance.economy.productionSeconds))
  const closed = town.rebels ? 'Kasabada ayaklanma var; asiler bastırılana kadar pazar kapalı.' : town.siege ? 'Kasaba kuşatma altında; pazar kapalı.' : null
  const price = (v: number) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const gold = kingdom.stock.gold
  const ready = armies.filter(atGate)
  return (
    <Section title="Kasaba pazarı" icon="trade" aside={`${fmt(stock)} / ${fmt(m.stock)} ${name}`}>
      <p className="hint">
        Kasabanın pazarı {name} satar: stoğu sınırlıdır, saatte yaklaşık {fmt(perHour)} birim yenilenir. Almak için bir ordun kasabanın kapısında olmalı; altın hemen ödenir,
        mallar orduyla gider ve ordu saraya dönünce ambara girer (asker başına {m.carryPerSoldier} birim taşır; yenilen ordu yükünü kaybeder).
      </p>
      <Meter value={stock / m.stock} tone="gold" label="Kasabanın stoğu" segments={12} />
      <Stat label={`Birim fiyatı (${name})`} value={`${price(unit)} altın`} note={`lobi fiyatı ${price(lobby)}, pazar binası ${price(lobby * balance.market.buyMarkup)}`} />
      <p className="hint">
        {mine
          ? 'Kendi kasaban: ödediğin altın kimseye gitmez.'
          : holder
            ? `Ödediğin altın kasabanın sahibi ${holder}'e gider. Onunla ilişkine göre fiyat ×${factor.toFixed(2).replace('.', ',')}${relation !== null ? ` (ilişki ${Math.round(relation)})` : ''}: kötü ilişkide pahalı, iyi ilişkide biraz ucuz.`
            : 'Kasaba kimseye bağlı değil: ödediğin altın kimseye gitmez.'}{' '}
        Fiyat lobi fiyatının ×{String(m.floorFactor).replace('.', ',')} altına inmez; buradan alınan mal lobi pazarında kârla satılamaz.
      </p>
      {closed ? (
        <p className="alert">{closed}</p>
      ) : armies.length === 0 ? (
        <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
      ) : (
        <ul className="town-armies">
          {armies.map((a) => {
            const soldiers = a.soldiers ?? 0
            const room = cargoRoom(soldiers, a.cargo)
            const most = Math.max(0, Math.min(stock, room, Math.floor(gold / Math.max(0.0001, unit))))
            const picked = Math.min(most, amount[a.id] ?? most)
            const steps = [...new Set([25, 50, 100, 200, most].filter((n) => n > 0 && n <= most))].sort((x, y) => x - y)
            if (!ready.includes(a)) {
              return (
                <li key={a.id}>
                  <span>
                    {armyLabel(a, armies)} · {soldiers} asker · {fmt(room)} birim taşıyabilir
                  </span>
                  <button className="btn small" onClick={() => onMove(a.id)}>
                    Kapıya gönder
                  </button>
                </li>
              )
            }
            return (
              <li key={a.id} className="town-buy">
                <span>
                  {armyLabel(a, armies)} kapıda · {fmt(room)} birim daha taşıyabilir
                </span>
                {most > 0 ? (
                  <>
                    <div className="segmented choices" role="radiogroup" aria-label="Miktar">
                      {steps.map((n) => (
                        <button key={n} className="btn small" role="radio" aria-checked={picked === n} onClick={() => setAmount({ ...amount, [a.id]: n })}>
                          {n === most ? `Hepsi (${fmt(n)})` : fmt(n)}
                        </button>
                      ))}
                    </div>
                    <button className="btn small" disabled={picked < 1} onClick={() => onBuy(a.id, picked)}>
                      <Icon name="gold" size={16} /> {fmt(picked)} {name} satın al · {fmt(Math.ceil(picked * unit))} altın
                    </button>
                  </>
                ) : (
                  <small className="hint">{room < 1 ? 'Ordu daha fazla taşıyamaz.' : stock < 1 ? 'Kasabanın stoğu bitti; biraz bekle.' : 'Hazinende yeterli altın yok.'}</small>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
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
  // Its governor of the lord's house, a princess married into its first family (CLAUDE.md §9.1.1).
  if (parts.kin) step('Hanedan: vali ya da gelin', parts.kin)
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
