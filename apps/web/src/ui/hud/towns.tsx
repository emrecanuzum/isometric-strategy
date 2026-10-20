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
import { L, getLang, locale } from '../../lib/i18n'
import { Meter, Section, Stat, fmt, signed, times } from './primitives'
import { NameNote } from '../NameNote'

// A town's sheet (CLAUDE.md §8.4): what it sends its holder, who holds it, the siege under way, and sending an army
// to lay siege to it. A town of the player's own also shows what it has sent so far, how loyal it is and why, the
// upkeep paid for that loyalty (set here), and what it adds to the lord's strength and to his crown's.

// The upkeep levels by name (balance.towns.upkeep.goldPerRound).
const UPKEEP_NAMES = [L('Yok', 'None'), L('Az', 'Low'), L('Orta', 'Medium'), L('Cömert', 'Generous')]
const upkeepName = (i: number) => UPKEEP_NAMES[i] ?? L(`${i}. kademe`, `tier ${i}`)
// Decimals with the language's separator.
const dec = (v: number | string) => (getLang() === 'en' ? String(v) : String(v).replace('.', ','))

const GOOD_NAMES: Record<TownGood, string> = { gold: L('Altın', 'Gold'), food: L('Yemek', 'Food'), materials: L('Yapı malzemesi', 'Building materials'), arms: L('Savaş malzemesi', 'War materials'), villagers: L('Köylü', 'Villagers') }
const amount = (v: number) => (v >= 100 ? fmt(v) : (Math.round(v * 10) / 10).toLocaleString(locale()))
const span = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  return m < 60
    ? L(`${m} dakika`, `${m} min`)
    : m < 1440
      ? L(`${Math.floor(m / 60)} saat ${m % 60} dakika`, `${Math.floor(m / 60)} h ${m % 60} min`)
      : L(`${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} saat`, `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`)
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Armies named as on the army tab: "1. Ordu", "2. Ordu" (the lord's armies in the order they were raised).
const armyLabel = (a: Army, all: Army[]) => {
  const n = all.filter((b) => b.kingdom_id === a.kingdom_id).sort((x, y) => x.id - y.id).findIndex((b) => b.id === a.id) + 1
  return L(`${n}. Ordu`, `Army ${n}`)
}

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
        { id: 'state', name: L('Durum', 'State'), icon: 'happy', dot: restless },
        { id: 'upkeep', name: L('Bakım', 'Upkeep'), icon: 'gold', dot: (kingdom.towns?.length ?? 0) > 1 },
        { id: 'yield', name: L('Getiri', 'Yield'), icon: 'chest' },
        { id: 'market', name: L('Pazar', 'Market'), icon: 'trade' },
        { id: 'siege', name: L('Kuşatma', 'Siege'), icon: 'swords', dot: !!siege },
        { id: 'release', name: L('Bırak', 'Release'), icon: 'banner' },
      ]
    : [
        { id: 'info', name: L('Bilgi', 'Info'), icon: 'scroll' },
        { id: 'market', name: L('Pazar', 'Market'), icon: 'trade' },
        { id: 'siege', name: L('Kuşat', 'Besiege'), icon: 'swords', dot: !!siege },
      ]
  const marketPart = part === 'market' && (
    <TownMarket town={town} kingdom={kingdom} mine={mine} holder={holder} armies={own} atGate={atGate} market={market} relation={relation} now={now} onMove={(a) => onMove(a, middle)} onBuy={onBuy} />
  )
  const siegeSection = siege && (
    <Section title={L('Kuşatma', 'Siege')} icon="swords" aside={L(`${clock(siege.endsAt - now)} kaldı`, `${clock(siege.endsAt - now)} left`)}>
      <p className="hint">{siege.kingdom === me ? L('Ordun kasabayı kuşatıyor.', 'Your army is besieging the town.') : L(`${names.get(siege.kingdom) ?? '?'} ordusu kasabayı kuşatıyor.`, `${names.get(siege.kingdom) ?? '?'}'s army is besieging the town.`)}</p>
      <Meter value={(now - siege.startedAt) / (siege.endsAt - siege.startedAt)} tone={siege.kingdom === me ? 'up' : 'down'} label={L('Kuşatma ilerlemesi', 'Siege progress')} segments={12} />
      <button className="btn small" onClick={onWatch}>
        {L('İzle', 'Watch')}
      </button>
    </Section>
  )
  return (
    <section className="sheet frame" aria-labelledby="town-title">
      <header className="sheet-head">
        <Icon name="banner" size={32} />
        <div>
          <h2 id="town-title">{town.name}</h2>
          <NameNote name={town.name} />
          <small>
            {TOWN_KIND_NAMES[town.kind]}
            {walled && L(' · tahta surlu', ' · palisaded')} · {L(`${distance} karo uzakta`, `${distance} tiles away`)}
          </small>
        </div>
        <button className="btn icon-only" onClick={() => onShow(middle)} aria-label={L('Haritada göster', 'Show on map')} title={L('Haritada göster', 'Show on map')}>
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <div className="feature">
          <Icon name="crown" size={32} />
          <div>
            <b>{mine ? L('Bu kasaba senin', 'This town is yours') : holder ? L(`${holder} elinde`, `Held by ${holder}`) : L('Kimseye bağlı değil', 'Belongs to no one')}</b>
            <small className="hint">
              {L(`Sahibine ${townGift(town.kind)} gönderir.`, `Sends its holder ${townGift(town.kind)}.`)}
              {town.owner === null && L(` Kendi garnizonu var: ${town.garrison} asker; kuşatma boyunca ordun yaklaşık ${townLosses(town.garrison, walled)} asker kaybeder.`, ` It has its own garrison of ${town.garrison} soldiers; your army will lose about ${townLosses(town.garrison, walled)} soldier${townLosses(town.garrison, walled) === 1 ? '' : 's'} over the siege.`)}
              {town.owner !== null && !mine && L(' Sahibiyle savaştaysan kuşatıp alabilirsin.', ' If you are at war with its holder you can besiege and take it.')}
              {mine && L(' Savaşta olduğun biri kuşatırsa ordunla gelip kuşatmayı kırabilirsin.', ' If an enemy you are at war with besieges it, you can come with your army and break the siege.')}
              {walled &&
                L(
                  ` Tahta bir çitle çevrili: taş surdan zayıftır ama kuşatma %${Math.round((p.siegeFactor - 1) * 100)} uzun sürer ve garnizon %${Math.round((p.lossFactor - 1) * 100)} daha çok kayıp verdirir.`,
                  ` Ringed by a wooden palisade: weaker than a stone wall, but the siege takes ${Math.round((p.siegeFactor - 1) * 100)}% longer and the garrison inflicts ${Math.round((p.lossFactor - 1) * 100)}% more losses.`,
                )}
            </small>
          </div>
        </div>
        <Subtabs label={L('Kasaba', 'Town')} parts={parts} part={part} onPart={setPart} />
        {mine && part === 'state' && town.rebels && (
          <Rebels town={town} armies={own} atGate={atGate} now={now} onSend={(a) => onSend(a, middle)} onWatchBattle={onWatchBattle} />
        )}
        {held && part !== 'siege' && part !== 'market' && <Holding world={world} kingdom={kingdom} held={held} now={now} onUpkeep={onUpkeep} besieged={!!siege} onRelease={onRelease} part={part} />}
        {marketPart}
        {mine && part === 'siege' && (
          <>
            {siegeSection || (
              <Section title={L('Kuşatma', 'Siege')} icon="shield">
                <p className="hint">{L('Kasaban şu an kuşatma altında değil.', 'Your town is not under siege.')}</p>
              </Section>
            )}
            <p className="hint">
              {L(
                `Savaşta olduğun bir lord ordusunu kasabanın kapısına getirirse kuşatma başlar ve ${minutes} dakika sürer; bitince kasaba onun olur. Ordunla gelip kuşatanla meydan muharebesine girersen kuşatmayı kırarsın.`,
                `If a lord you are at war with brings an army to the town's gate, a siege begins and lasts ${minutes} minutes; when it ends the town is theirs. Come with your army and meet the besiegers in battle to break the siege.`,
              )}
              {walled ? L(' Tahta çit kuşatmayı uzatır.', ' The palisade makes the siege longer.') : ''}
            </p>
          </>
        )}
        {!mine && part === 'info' && <Overreach held={kingdom.towns?.length ?? 0} taking />}
        {!mine && part === 'siege' && siegeSection}
        {!mine && part === 'siege' && (
          <Section title={L('Kuşat', 'Besiege')} icon="shield">
            {!lawful ? (
              <p className="hint">{L(`Bu kasaba ${holder} elinde ve onunla savaşta değilsin. Kuşatmak için önce savaş ilan etmelisin.`, `This town is held by ${holder} and you are not at war with them. Declare war first to besiege it.`)}</p>
            ) : own.length === 0 ? (
              <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison on the Army tab.')}</p>
            ) : (
              <>
                <p className="hint">
                  {L(
                    `Kuşatma yalnız buradan başlar: kapıdaki ordu hemen kuşatır, uzaktaki ordu kapıya varınca. Haritadan "Hareket" ile gelen ordu kapıda bekler. Kuşatma ${minutes} dakika sürer; ordu orada kalmalı, giderse ya da yenilirse kuşatma kalkar.`,
                    `A siege starts only from here: an army at the gate besieges at once, one further off when it reaches the gate. An army sent with "Move" from the map just waits at the gate. The siege lasts ${minutes} minutes; the army must stay, and if it leaves or is beaten the siege is lifted.`,
                  )}
                </p>
                <ul className="town-armies">
                  {own.map((a) => (
                    <li key={a.id}>
                      <span>
                        {armyLabel(a, armies)} · {L(`${a.soldiers ?? '?'} asker`, `${a.soldiers ?? '?'} soldiers`)}
                      </span>
                      {(() => {
                        // Already on its way here to lay siege: say so rather than offer to send it again.
                        const going = !siege && a.goal.kind === 'town' && a.goal.town === town.id && Date.parse(a.arrive_at) > now
                        return (
                          <button className="btn small" disabled={!!siege || going} data-why={siege ? (siege.army === a.id ? L('Bu ordu zaten kuşatıyor', 'This army is already besieging') : L('Kasabayı başka bir ordu kuşatıyor; aynı anda tek ordu kuşatabilir', 'Another army is besieging the town; only one army can besiege at a time')) : L('Ordu zaten kuşatmak için yolda', 'The army is already on its way to besiege')} onClick={() => onSend(a.id, middle)}>
                            {siege && siege.army === a.id
                              ? L('Kuşatıyor', 'Besieging')
                              : going
                                ? L(`Yolda · ${Math.ceil((Date.parse(a.arrive_at) - now) / 60_000)} dk`, `On the way · ${Math.ceil((Date.parse(a.arrive_at) - now) / 60_000)} min`)
                                : atGate(a)
                                  ? L('Kuşatmayı başlat', 'Start the siege')
                                  : L('Gönder ve kuşat', 'Send and besiege')}
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
          <Section title={L('Sadakat', 'Loyalty')} icon={loyalty >= 50 ? 'happy' : loyalty >= r.below ? 'content' : 'unhappy'} aside={L(`%${Math.round(loyalty)} · ${Math.abs(trend) < 0.5 ? 'durgun' : trend > 0 ? 'yükseliyor' : 'düşüyor'}`, `${Math.round(loyalty)}% · ${Math.abs(trend) < 0.5 ? 'steady' : trend > 0 ? 'rising' : 'falling'}`)}>
            <Meter value={loyalty / 100} tone={loyalty >= 50 ? 'up' : loyalty >= r.below ? 'gold' : 'down'} label={L('Sadakat', 'Loyalty')} segments={20} />
            {revolting ? (
              <p className="alert">
                {L(
                  `Kasaba ayaklandı: ${span(held.revoltUntil! - now)} daha hiçbir şey göndermeyecek. Asileri yenersen ayaklanma hemen biter; yoksa ayaklanma bittiğinde sadakat %${r.breakAwayBelow}'nin altındaysa kasaba senden kopar.`,
                  `The town has revolted: it will send nothing for another ${span(held.revoltUntil! - now)}. Beat the rebels and the revolt ends at once; otherwise, if loyalty is below ${r.breakAwayBelow}% when the revolt ends, the town breaks away from you.`,
                )}
              </p>
            ) : townQuiet(held, now) ? (
              <p className="hint">{L(`Ayaklanma bastırıldı: kasaba ${span(held.quietUntil! - now)} daha ayaklanmaz, sadakati düşük olsa bile. Bu sürede bakımı artırıp sadakati toparla.`, `The revolt was put down: the town will not rise again for ${span(held.quietUntil! - now)}, even with low loyalty. Raise the upkeep meanwhile and win its loyalty back.`)}</p>
            ) : loyalty < r.below + 10 ? (
              <p className="alert">{L(`Sadakat %${r.below}'in altına inerse kasaba ayaklanır. Bakımı artırmak sadakati yükseltir.`, `If loyalty falls below ${r.below}% the town will revolt. Raising the upkeep raises loyalty.`)}</p>
            ) : null}
            <Stat label={L('Gittiği yer', 'Heading for')} value={L(`%${Math.round(target)}`, `${Math.round(target)}%`)} tone={trend >= 0 ? 'up' : 'down'} note={L(`yaklaşık ${Math.round(t.loyalty.tauSeconds / 60)} dakikada yolun üçte ikisini alır`, `covers two thirds of the way in about ${Math.round(t.loyalty.tauSeconds / 60)} minutes`)} />
            <p className="hint">
              {L(
                `Sadakat ne kadar yüksekse kasaba o kadar çok gönderir (%0'da ×${t.loyalty.yieldMin.toLocaleString(locale())}, %100'de ×${t.loyalty.yieldMax.toLocaleString(locale())}`,
                `The more loyal the town, the more it sends (×${t.loyalty.yieldMin.toLocaleString(locale())} at 0%, ×${t.loyalty.yieldMax.toLocaleString(locale())} at 100%`,
              )}
              {over.yieldFactor < 1 && L(`, aşırı büyüme ×${dec(over.yieldFactor)}`, `, over-expansion ×${dec(over.yieldFactor)}`)}
              {L(`; şu an ×${dec(factor.toFixed(2))}).`, `; now ×${dec(factor.toFixed(2))}).`)}
            </p>
          </Section>
          <Unrest held={held} parts={parts} level={level} loyalty={loyalty} now={now} />
        </>
      )}
      {part === 'upkeep' && (
        <>
          {count > 1 && <Overreach held={count} />}
          <Section title={L('Bakım', 'Upkeep')} icon="gold" aside={cost > 0 ? L(`tur başına ${amount(cost)} altın`, `${amount(cost)} gold per round`) : L('ödeme yok', 'nothing paid')}>
            <p className="hint">{L('Kasabayı elinde tutmak için her üretim turunda hazineden ödenir. Hazine yetmezse ödenmez ve sadakat bakımsızmış gibi düşer.', 'Paid from the treasury every production round to keep the town. If the treasury runs short it goes unpaid and loyalty falls as if there were no upkeep.')}</p>
            <div className="segmented choices" role="radiogroup" aria-label={L('Bakım', 'Upkeep')}>
              {t.upkeep.goldPerRound.map((gold, i) => (
                <button key={i} className="btn small" role="radio" aria-checked={level === i} onClick={() => level !== i && onUpkeep(i)}>
                  {upkeepName(i)}
                  <small> {gold > 0 ? `${amount(gold * over.upkeepFactor)}` : '0'}</small>
                </button>
              ))}
            </div>
            <Stat
              label={L('Saatte', 'Per hour')}
              value={L(`${amount(cost * roundsPerHour)} altın`, `${amount(cost * roundsPerHour)} gold`)}
              note={L(
                `sadakat tabanı %${t.loyalty.upkeepTargets[level]} (+ halk ve hükümdar${over.loyalty < 0 ? ', − aşırı büyüme' : ''})${over.upkeepFactor > 1 ? ` · aşırı büyüme bakımı ${times(over.upkeepFactor)} yapıyor` : ''}`,
                `loyalty base ${t.loyalty.upkeepTargets[level]}% (+ people and ruler${over.loyalty < 0 ? ', − over-expansion' : ''})${over.upkeepFactor > 1 ? ` · over-expansion makes upkeep ${times(over.upkeepFactor)}` : ''}`,
              )}
            />
          </Section>
        </>
      )}
      {part === 'yield' && (
        <>
          <Section title={L('Sana getirdikleri', 'What it has sent you')} icon="chest" aside={held.takenAt ? L(`${span(now - held.takenAt)} önce alındı`, `taken ${span(now - held.takenAt)} ago`) : undefined}>
            {goods.length === 0 && <p className="hint">{L('Henüz bir şey göndermedi.', 'It has sent nothing yet.')}</p>}
            {goods.map((g) => (
              <Stat
                key={g}
                label={
                  <>
                    <Icon name={g === 'villagers' ? 'villager' : g} size={16} /> {GOOD_NAMES[g]}
                  </>
                }
                value={g === 'villagers' ? L(`${fmt(sends.villagers)} köylü`, `${fmt(sends.villagers)} villagers`) : L(`${amount(delivered[g] ?? 0)} toplam`, `${amount(delivered[g] ?? 0)} in all`)}
                note={g === 'villagers' ? L('şu an barındırdığı', 'housed there now') : L(`şu an tur başına ${amount(sends[g])}`, `now ${amount(sends[g])} per round`)}
              />
            ))}
            {cost > 0 && <Stat label={L('Bakıma giden', 'Spent on upkeep')} value={L(`tur başına −${amount(cost)} altın`, `−${amount(cost)} gold per round`)} tone="down" />}
          </Section>
          <Section title={L('Sana kattığı güç', 'Strength it lends you')} icon="crown" aside={L(`+${points} puan`, `+${points} points`)}>
            <p className="hint">
              {L(`Kasaba lordluğunun puanına +${points} katar (sadakatle artar, ayaklanmada yarıya iner).`, `The town adds +${points} to your lordship's score (more with loyalty, halved during a revolt).`)}{' '}
              {liege ? (
                <>
                  {L('Bağlı olduğun ', 'And +' + points + ' to the power of your liege, the ')}<b style={{ color: liege.color }}>{liege.name}</b>{L(`nın gücüne +${points}.`, '.')}
                </>
              ) : (
                L('Henüz bir taç krallığına biat etmedin; ettiğinde bu puan onun gücüne de eklenir.', 'You have not sworn to a crown kingdom yet; once you do, these points add to its power too.')
              )}
            </p>
          </Section>
        </>
      )}
      {part === 'release' && (
        <>
          <Section title={L('Serbest bırak', 'Release')} icon="banner">
            <p className="hint">
              {L(
                `Kasabayı bırakırsan sahipsiz kalır ve ${t.revolt.garrison[0]}–${t.revolt.garrison[1]} askerlik küçük bir garnizonla kendini korur. Bakımı, katkısı ve kattığı puan biter; ${count > 1 ? `elindeki kasaba ${count - 1}'e iner ve aşırı büyüme cezası hemen hafifler` : 'sonra yeniden kuşatıp alabilirsin'}.`,
                `Let the town go and it belongs to no one, guarding itself with a small garrison of ${t.revolt.garrison[0]}–${t.revolt.garrison[1]} soldiers. Its upkeep, yield and points end; ${count > 1 ? `you drop to ${count - 1} town${count - 1 === 1 ? '' : 's'} and the over-expansion penalty eases at once` : 'you can besiege and take it again later'}.`,
              )}
            </p>
            <button
              className={sure ? 'btn small danger' : 'btn small'}
              disabled={besieged}
              data-why={L('Kuşatma altındaki kasaba bırakılamaz', 'A town under siege cannot be released')}
              onClick={() => (sure ? (setSure(false), onRelease()) : setSure(true))}
              onBlur={() => setSure(false)}
            >
              {besieged ? L('Kuşatma sürerken bırakılamaz', 'Cannot release during a siege') : sure ? L('Emin misin? Kasabayı serbest bırak', 'Are you sure? Release the town') : L('Serbest bırak', 'Release')}
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
    <Section title={L('Asiler kasabayı kuşatıyor', 'Rebels besiege the town')} icon="swords" aside={L(`${rebels.count} asi · ${span(now - rebels.since)}dır`, `${rebels.count} rebel${rebels.count === 1 ? '' : 's'} · for ${span(now - rebels.since)}`)}>
      <p className="alert">
        {L(
          `${rebels.count} asi kasabanın kapısını tuttu; ayaklanma sürdükçe kasaba hiçbir şey göndermez. Ordunu gönderip asileri yenersen ayaklanma biter, sadakat +${q.quellLoyalty} artar ve kasaba ${Math.round(q.quietSeconds / 60)} dakika yeniden ayaklanmaz. Yenilirsen ordun eve çekilir, asiler kalır.`,
          `${rebels.count} rebel${rebels.count === 1 ? ' holds' : 's hold'} the town's gate; while the revolt lasts the town sends nothing. Send your army and beat the rebels and the revolt ends, loyalty rises by +${q.quellLoyalty} and the town will not rise again for ${Math.round(q.quietSeconds / 60)} minutes. Lose, and your army falls back home while the rebels stay.`,
        )}
      </p>
      {rebels.battle ? (
        <div className="row spread">
          <span className="hint">{L('Ordun asilerle çarpışıyor.', 'Your army is fighting the rebels.')}</span>
          <button className="btn small" onClick={() => onWatchBattle(rebels.battle!)}>
            {L('İzle', 'Watch')}
          </button>
        </div>
      ) : armies.length === 0 ? (
        <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison on the Army tab.')}</p>
      ) : (
        <>
          <p className="hint">{L(`Asiler kendi topraklarını iyi bilir; en az ${Math.ceil(rebels.count * 1.5)} askerle gitmek akıllıcadır.`, `The rebels know their own ground well; it is wise to go with at least ${Math.ceil(rebels.count * 1.5)} soldiers.`)}</p>
          <ul className="town-armies">
            {armies.map((a) => (
              <li key={a.id}>
                <span>
                  {armyLabel(a, armies)} · {L(`${a.soldiers ?? '?'} asker`, `${a.soldiers ?? '?'} soldiers`)}
                </span>
                <button className="btn small" onClick={() => onSend(a.id)}>
                  {atGate(a) ? L('Ayaklanmayı bastır', 'Put down the revolt') : L('Gönder ve bastır', 'Send and put it down')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

const MARKET_GOOD_NAMES = { food: L('yemek', 'food'), materials: L('yapı malzemesi', 'building materials'), arms: L('savaş malzemesi', 'war materials') }

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
  const closed = town.rebels ? L('Kasabada ayaklanma var; asiler bastırılana kadar pazar kapalı.', 'The town is in revolt; the market is closed until the rebels are put down.') : town.siege ? L('Kasaba kuşatma altında; pazar kapalı.', 'The town is under siege; the market is closed.') : null
  const price = (v: number) => v.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const gold = kingdom.stock.gold
  const ready = armies.filter(atGate)
  return (
    <Section title={L('Kasaba pazarı', 'Town market')} icon="trade" aside={`${fmt(stock)} / ${fmt(m.stock)} ${name}`}>
      <p className="hint">
        {L(
          `Kasabanın pazarı ${name} satar: stoğu sınırlıdır, saatte yaklaşık ${fmt(perHour)} birim yenilenir. Almak için bir ordun kasabanın kapısında olmalı; altın hemen ödenir, mallar orduyla gider ve ordu saraya dönünce ambara girer (asker başına ${m.carryPerSoldier} birim taşır; yenilen ordu yükünü kaybeder).`,
          `The town's market sells ${name}: stock is limited and refills by about ${fmt(perHour)} units an hour. To buy, one of your armies must stand at the town's gate; the gold is paid at once, the goods travel with the army and go into the storehouse when it returns to the palace (each soldier carries ${m.carryPerSoldier} units; a beaten army loses its load).`,
        )}
      </p>
      <Meter value={stock / m.stock} tone="gold" label={L('Kasabanın stoğu', 'The town\'s stock')} segments={12} />
      <Stat label={L(`Birim fiyatı (${name})`, `Unit price (${name})`)} value={L(`${price(unit)} altın`, `${price(unit)} gold`)} note={L(`lobi fiyatı ${price(lobby)}, pazar binası ${price(lobby * balance.market.buyMarkup)}`, `lobby price ${price(lobby)}, market building ${price(lobby * balance.market.buyMarkup)}`)} />
      <p className="hint">
        {mine
          ? L('Kendi kasaban: ödediğin altın kimseye gitmez.', 'Your own town: the gold you pay goes to no one.')
          : holder
            ? L(
                `Ödediğin altın kasabanın sahibi ${holder}'e gider. Onunla ilişkine göre fiyat ×${factor.toFixed(2).replace('.', ',')}${relation !== null ? ` (ilişki ${Math.round(relation)})` : ''}: kötü ilişkide pahalı, iyi ilişkide biraz ucuz.`,
                `The gold you pay goes to the town's holder, ${holder}. By your relations with them the price is ×${factor.toFixed(2)}${relation !== null ? ` (relations ${Math.round(relation)})` : ''}: dear when relations are bad, a little cheaper when good.`,
              )
            : L('Kasaba kimseye bağlı değil: ödediğin altın kimseye gitmez.', 'The town belongs to no one: the gold you pay goes to no one.')}{' '}
        {L(
          `Fiyat lobi fiyatının ×${String(m.floorFactor).replace('.', ',')} altına inmez; buradan alınan mal lobi pazarında kârla satılamaz.`,
          `The price never drops below ×${m.floorFactor} the lobby price; goods bought here cannot be sold at a profit on the lobby market.`,
        )}
      </p>
      {closed ? (
        <p className="alert">{closed}</p>
      ) : armies.length === 0 ? (
        <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison on the Army tab.')}</p>
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
                    {armyLabel(a, armies)} · {L(`${soldiers} asker · ${fmt(room)} birim taşıyabilir`, `${soldiers} soldiers · can carry ${fmt(room)} units`)}
                  </span>
                  <button className="btn small" onClick={() => onMove(a.id)}>
                    {L('Kapıya gönder', 'Send to the gate')}
                  </button>
                </li>
              )
            }
            return (
              <li key={a.id} className="town-buy">
                <span>
                  {armyLabel(a, armies)} {L(`kapıda · ${fmt(room)} birim daha taşıyabilir`, `at the gate · can carry ${fmt(room)} more units`)}
                </span>
                {most > 0 ? (
                  <>
                    <div className="segmented choices" role="radiogroup" aria-label={L('Miktar', 'Amount')}>
                      {steps.map((n) => (
                        <button key={n} className="btn small" role="radio" aria-checked={picked === n} onClick={() => setAmount({ ...amount, [a.id]: n })}>
                          {n === most ? L(`Hepsi (${fmt(n)})`, `All (${fmt(n)})`) : fmt(n)}
                        </button>
                      ))}
                    </div>
                    <button className="btn small" disabled={picked < 1} data-why={L('Önce bir miktar seç', 'Pick an amount first')} onClick={() => onBuy(a.id, picked)}>
                      <Icon name="gold" size={16} /> {L(`${fmt(picked)} ${name} satın al · ${fmt(Math.ceil(picked * unit))} altın`, `Buy ${fmt(picked)} ${name} · ${fmt(Math.ceil(picked * unit))} gold`)}
                    </button>
                  </>
                ) : (
                  <small className="hint">{room < 1 ? L('Ordu daha fazla taşıyamaz.', 'The army cannot carry any more.') : stock < 1 ? L('Kasabanın stoğu bitti; biraz bekle.', 'The town is out of stock; wait a little.') : L('Hazinende yeterli altın yok.', 'Not enough gold in your treasury.')}</small>
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
const OVERREACH_NAMES = [L('Hafif', 'Mild'), L('Ağır', 'Heavy'), L('İsyan', 'Revolt')]
const CAP_LABEL = L('Aşırı büyüme tavanı', 'Over-expansion cap')
const overreachName = (tier: number) => OVERREACH_NAMES[Math.min(tier, OVERREACH_NAMES.length - 1)]

// What over-expansion does at a tier, in one line.
function overreachText(towns: number) {
  const o = overreachOf(towns)
  if (o.tier < 0) return L('Ceza yok.', 'No penalty.')
  return [
    L(`her kasabanın sadakati ${signed(o.loyalty)}`, `every town's loyalty ${signed(o.loyalty)}`),
    ...(o.loyaltyCap < 100 ? [L(`sadakat en fazla %${o.loyaltyCap} (ayaklanma çizgisi %${balance.towns.revolt.below})`, `loyalty at most ${o.loyaltyCap}% (revolt line ${balance.towns.revolt.below}%)`)] : []),
    L(`halkın mutluluğu ${signed(o.happiness)}`, `your people's happiness ${signed(o.happiness)}`),
    L(`bakım ${times(o.upkeepFactor)}`, `upkeep ${times(o.upkeepFactor)}`),
    L(`katkı ${times(o.yieldFactor)}`, `yield ${times(o.yieldFactor)}`),
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
  step(L(`Bakım (${upkeepName(held.unpaid ? 0 : level).toLocaleLowerCase(locale())})`, `Upkeep (${upkeepName(held.unpaid ? 0 : level).toLocaleLowerCase(locale())})`), parts.upkeep, held.unpaid ? L('ödenmedi', 'unpaid') : undefined)
  step(L('Halkının mutluluğu', 'Your people\'s happiness'), parts.happiness)
  step(L('Hükümdarın halk yeteneği', 'The ruler\'s People skill'), parts.ruler)
  // Its governor of the lord's house, a princess married into its first family (CLAUDE.md §9.1.1).
  if (parts.kin) step(L('Hanedan: vali ya da gelin', 'Dynasty: governor or bride'), parts.kin)
  if (parts.overreach !== 0) step(L('Aşırı büyüme', 'Over-expansion'), parts.overreach)
  if (sum > parts.cap) {
    rows.push({ label: CAP_LABEL, from: Math.min(100, sum), to: parts.cap, note: L(`en fazla %${parts.cap}`, `at most ${parts.cap}%`) })
    sum = parts.cap
  }
  const tau = t.loyalty.tauSeconds * 1000
  const incited = held.incitedAt !== undefined && now - held.incitedAt < tau * 2 ? held : null
  const revolting = townRevolting(held, now)
  const revoltIn = townRevoltIn(loyalty, parts.target)
  const spy = balance.espionage.operations.townRevolt.loyalty
  // How likely a revolt is, from certain to low.
  const risk = revolting
    ? { value: 1, label: L('Ayaklanmada', 'In revolt'), text: L(`Kasaba şu an ayaklanmada. Sadakat %${r.below}'i geçmeden ayaklanma bitmez.`, `The town is in revolt now. The revolt will not end until loyalty passes ${r.below}%.`) }
    : revoltIn !== null
      ? { value: 1, label: L('Kesin', 'Certain'), text: L(`Sadakat %${Math.round(parts.target)}'e gidiyor, ayaklanma çizgisinin altına: yaklaşık ${minutesOf(revoltIn)} dakika içinde ayaklanır.`, `Loyalty is heading for ${Math.round(parts.target)}%, below the revolt line: the town will rise in about ${minutesOf(revoltIn)} minutes.`) }
      : loyalty < r.below + 10 || parts.target < r.below + 10
        ? { value: 0.75, label: L('Yüksek', 'High'), text: L(`Sadakat ayaklanma çizgisine çok yakın; küçük bir sarsıntı (hazinenin boşalması, casuslar) yeter.`, `Loyalty is very close to the revolt line; a small shock (an empty treasury, spies) would do it.`) }
        : loyalty + spy < r.below || parts.target + spy < r.below
          ? { value: 0.45, label: L('Orta', 'Medium'), text: L(`Bir casus kışkırtması (${signed(spy)}) kasabayı ayaklandırabilir.`, `A spy's incitement (${signed(spy)}) could set the town off.`) }
          : { value: 0.15, label: L('Düşük', 'Low'), text: L(`Bir casus kışkırtması bile kasabayı ayaklandırmaya yetmez.`, `Not even a spy's incitement would be enough to make the town rise.`) }
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
    <Section title={L('Huzursuzluğun kaynakları', 'Sources of unrest')} icon="unhappy" aside={L(`ayaklanma riski: ${risk.label.toLocaleLowerCase(locale())}`, `revolt risk: ${risk.label.toLocaleLowerCase(locale())}`)}>
      <div className="unrest-chart" role="img" aria-label={L('Sadakat hedefini oluşturanlar', 'What makes up the loyalty target')}>
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
              <b className={down ? 'down' : 'up'}>{row.note && row.label === CAP_LABEL ? L(`%${parts.cap}`, `${parts.cap}%`) : signed(row.to - row.from)}</b>
              {row.note && <small>{row.note}</small>}
            </div>
          )
        })}
        <div className="unrest-row total">
          <span>{L('Gittiği yer', 'Heading for')}</span>
          <span className="unrest-track">
            <i className="line revolt" style={{ left: pct(r.below) }} />
            <i className="line free" style={{ left: pct(r.breakAwayBelow) }} />
            <i className={`bar ${parts.target < r.below ? 'down' : 'gold'}`} style={{ left: 0, width: pct(parts.target) }} />
          </span>
          <b className={parts.target < r.below ? 'down' : undefined}>{L(`%${Math.round(parts.target)}`, `${Math.round(parts.target)}%`)}</b>
        </div>
        <div className="unrest-row total">
          <span>{L('Şu an', 'Now')}</span>
          <span className="unrest-track">
            <i className="line revolt" style={{ left: pct(r.below) }} />
            <i className="line free" style={{ left: pct(r.breakAwayBelow) }} />
            <i className={`bar ${loyalty < r.below ? 'down' : 'up'}`} style={{ left: 0, width: pct(loyalty) }} />
          </span>
          <b className={loyalty < r.below ? 'down' : undefined}>{L(`%${Math.round(loyalty)}`, `${Math.round(loyalty)}%`)}</b>
        </div>
        <small className="unrest-legend">
          <i className="line revolt" /> {L(`%${r.below} ayaklanma`, `${r.below}% revolt`)} · <i className="line free" /> {L(`%${r.breakAwayBelow} kopma`, `${r.breakAwayBelow}% break-away`)}
        </small>
      </div>
      {incited && (
        <div className="unrest-row spy">
          <span>{L('Casus kışkırtması', 'Spy incitement')}</span>
          <span className="unrest-track">
            <i className="bar down" style={{ left: 0, width: pct(Math.abs(incited.incitedBy ?? spy)) }} />
          </span>
          <b className="down">{signed(incited.incitedBy ?? spy)}</b>
          <small>{L(`${minutesOf(now - incited.incitedAt!)} dakika önce, bir kerelik; hedefi değiştirmez, sadakat zamanla toparlanır`, `${minutesOf(now - incited.incitedAt!)} minutes ago, a one-off; it does not move the target, and loyalty recovers in time`)}</small>
        </div>
      )}
      <div className="unrest-risk">
        <span>{L('Ayaklanma riski', 'Revolt risk')}</span>
        <Meter value={risk.value} tone={risk.value >= 0.75 ? 'down' : risk.value >= 0.4 ? 'gold' : 'up'} label={L('Ayaklanma riski', 'Revolt risk')} segments={10} />
        <b className={risk.value >= 0.75 ? 'down' : undefined}>{risk.label}</b>
      </div>
      <p className="hint">{risk.text}</p>
      <figure className="unrest-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-label={L('Önümüzdeki saatte sadakat', 'Loyalty over the next hour')} role="img">
          <rect x={0} y={line(r.below)} width={W} height={H - line(r.below)} className="zone" />
          <line x1={0} x2={W} y1={line(r.below)} y2={line(r.below)} className="revolt" />
          <line x1={0} x2={W} y1={line(r.breakAwayBelow)} y2={line(r.breakAwayBelow)} className="free" />
          <polyline points={points} className="path" />
        </svg>
        <figcaption>
          <span>{L('şimdi', 'now')}</span>
          <span>{L('önümüzdeki saatte sadakat', 'loyalty over the next hour')}</span>
          <span>{L('+60 dk', '+60 min')}</span>
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
    <Section title={L('Aşırı büyüme', 'Over-expansion')} icon="warn" aside={now.tier < 0 ? (taking ? L(`${held} kasaban var`, `you hold ${held} town${held === 1 ? '' : 's'}`) : L('yok', 'none')) : L(`${held} kasaba · ${overreachName(now.tier).toLocaleLowerCase(locale())}`, `${held} town${held === 1 ? '' : 's'} · ${overreachName(now.tier).toLocaleLowerCase(locale())}`)}>
      {taking ? (
        next!.tier < 0 ? (
          <p className="hint">{L('Bu ilk kasaban olur: tek kasabanın aşırı büyüme cezası yoktur.', 'This would be your first town: a single town carries no over-expansion penalty.')}</p>
        ) : (
          <p className={next!.tier >= tiers.length - 1 ? 'alert' : 'hint'}>
            {L(
              `Bu kasabayı alırsan elinde ${held + 1} kasaba olur ve aşırı büyüme ${now.tier < 0 ? 'başlar' : next!.tier > now.tier ? 'artar' : 'sürer'} (${overreachName(next!.tier).toLocaleLowerCase(locale())}): ${overreachText(held + 1)}.`,
              `Take this town and you hold ${held + 1} towns, and over-expansion ${now.tier < 0 ? 'begins' : next!.tier > now.tier ? 'worsens' : 'continues'} (${overreachName(next!.tier).toLocaleLowerCase(locale())}): ${overreachText(held + 1)}.`,
            )}
            {next!.tier >= tiers.length - 1 && L(' Kasabaların hepsi ayaklanır.', ' Every one of your towns will revolt.')}
          </p>
        )
      ) : (
        <p className={now.tier >= tiers.length - 1 ? 'alert' : 'hint'}>
          {L(`Bir lord aynı anda ancak bu kadar kasabaya söz geçirebilir. ${held} kasaba elinde: ${overreachText(held)}.`, `A lord can only hold sway over so many towns at once. You hold ${held}: ${overreachText(held)}.`)}
          {now.tier >= tiers.length - 1 &&
            L(
              ' Kasabaların sadakati kopma çizgisinin altında kalır: hepsi ayaklanıp kopacak. Birini paneldeki "Serbest bırak" ile bırakırsan ötekiler rahatlar.',
              ' Your towns\' loyalty stays below the break-away line: they will all revolt and break away. Let one go with "Release" on its panel and the others breathe easier.',
            )}
        </p>
      )}
      <div className="overreach-ladder" role="table" aria-label={L('Kasaba sayısına göre aşırı büyüme', 'Over-expansion by number of towns')}>
        {counts.map((n, i) => {
          const o = overreachOf(n)
          const weight = -o.loyalty + (100 - o.loyaltyCap)
          const mark = at(held) === n ? 'now' : next && at(held + 1) === n ? 'next' : ''
          return (
            <div key={n} className={`overreach-row ${mark}`} role="row">
              <span role="cell">
                {n === last.towns ? `${n}+` : n} {L('kasaba', n === 1 ? 'town' : 'towns')}
                {mark === 'now' && <small>{L(' · sen', ' · you')}</small>}
                {mark === 'next' && <small>{L(' · alırsan', ' · if you take it')}</small>}
              </span>
              <span className="overreach-bar" role="cell">
                <i className={i === counts.length - 1 ? 'down' : i === 0 ? 'up' : 'gold'} style={{ width: pct(i === 0 ? 2 : (weight / worst) * 100) }} />
              </span>
              <small role="cell">
                {o.tier < 0
                  ? L('ceza yok', 'no penalty')
                  : L(
                      `sadakat ${signed(o.loyalty)}${o.loyaltyCap < 100 ? `, en fazla %${o.loyaltyCap}` : ''} · mutluluk ${signed(o.happiness)} · bakım ${times(o.upkeepFactor)} · katkı ${times(o.yieldFactor)}`,
                      `loyalty ${signed(o.loyalty)}${o.loyaltyCap < 100 ? `, at most ${o.loyaltyCap}%` : ''} · happiness ${signed(o.happiness)} · upkeep ${times(o.upkeepFactor)} · yield ${times(o.yieldFactor)}`,
                    )}
              </small>
            </div>
          )
        })}
      </div>
      <p className="hint">{L('Cezalar elindeki bütün kasabalara (ve lordluğunun halkına) birlikte işler; bir kasaba kopunca ya da elden çıkınca hemen hafifler.', 'The penalties fall on all your towns (and on your lordship\'s people) together; they ease at once when a town breaks away or is lost.')}</p>
    </Section>
  )
}
