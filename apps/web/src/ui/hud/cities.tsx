import { useState } from 'react'
import { GOODS, balance, goldCap, crownDemand, questError, questProgress, crownOrder, crownOrderError, orderPay, palaceLevel, byPower, cityCenter, cityPrice, cityTripMs, crownAgeOf, crownGoods, crownHouseAt, crownPower, crownRelation, crownRest, crownRivalryAt, doneBuildings, fealtyOpen, giftAt, lobbyTripMs, priceAt, stewardFactor, tradeCityReadyAt, tradeUnits } from '@game/shared'
import type { Kingdom, Market, Point, QuestKind, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { serverNow } from '../../net/clock'
import { Icon } from '../icons'
import { L, getLang, locale } from '../../lib/i18n'
import { RESOURCE_ICONS, RESOURCE_NAMES } from '../names'
import { Meter, Section, Stat, fmt } from './primitives'
import type { Online } from './online'
import { usePart } from './Subtabs'
import { BetrayalCard, CrownCourt, CrownRivalryPanel, RoyalFamily, STANCE_NAMES, crownKeyOf, pctText, rivalPurse, tipPreview, tributeShareNow, waysText } from './crownHouse'
import { Portrait } from '../DynastyArt'
import { innReach, innUnitPrice, tradeInnIndex } from './inns'
import { innInfo } from '../../game/innInfo'
import { isCaravanserai } from '../../game/innSprites'
import { NameNote } from '../NameNote'

// The free cities (CLAUDE.md §4.2, §7.6): what they are, and the merchant's choice between the lobby's market and a
// free city's.

const seconds = (ms: number) => Math.round(ms / 1000)
const price = (n: number) => (getLang() === 'en' ? n.toFixed(2) : n.toFixed(2).replace('.', ','))

// Where the merchant takes the goods: the lobby's market from the trade post, or one of the free cities.
export function TradeDestination({ world, kingdom, market, now, online, onCity, onInn }: {
  world: World
  kingdom: Kingdom
  market?: Market | null
  now: number
  online?: Online | null
  onCity(city: number | null): void
  onInn?(inn: Point): void
}) {
  if (world.cities.length === 0) return null
  const innAt = tradeInnIndex(world, kingdom)
  const current = innAt >= 0 ? -1 : (kingdom.trade.city?.index ?? null)
  const wait = Math.max(0, Math.ceil((tradeCityReadyAt(kingdom) - now) / 1000))
  const { loadFactor, changeCooldownSeconds } = balance.cities.trade
  const premium = Math.round((balance.cities.trade.priceFactor - 1) * 100)
  // The city's price beside the lobby's: "lobi fiyatı", "lobi fiyatı +%5" or "lobi fiyatı −%5".
  const pricing = premium === 0 ? L('lobi fiyatı', 'lobby price') : L(`lobi fiyatı ${premium > 0 ? '+' : '−'}%${Math.abs(premium)}`, `lobby price ${premium > 0 ? '+' : '−'}${Math.abs(premium)}%`)
  const impact = Math.round(balance.cities.trade.marketImpact * 100)
  const good = kingdom.trade.good
  return (
    <Section title={L('Tüccar nereye gitsin', 'Where the merchant should go')} icon="trade" aside={wait > 0 ? L(`${wait} sn sonra değişir`, `can change in ${wait}s`) : undefined}>
      <div className="goods choices" role="radiogroup" aria-label={L('Tüccarın gideceği yer', 'The merchant\'s destination')}>
        <button role="radio" aria-checked={current === null} className={current === null ? 'good active' : 'good'} disabled={wait > 0 && current !== null} data-why={L(`Hedef az önce değişti; ${wait} sn sonra yeniden değişir`, `The destination just changed; it can change again in ${wait}s`)} onClick={() => onCity(null)}>
          <Icon name="gold" size={24} />
          <b>{L('Lobi pazarı', 'Lobby market')}</b>
          <small>{L(`${seconds(lobbyTripMs(kingdom.buildings))} sn sefer`, `${seconds(lobbyTripMs(kingdom.buildings))}s trip`)}</small>
          <small>{L(`${tradeUnits(kingdom)} birim, lobi fiyatı`, `${tradeUnits(kingdom)} units, lobby price`)}</small>
          {good && <small>{L(`birimi ${price(priceAt(market, good, now))} altın`, `${price(priceAt(market, good, now))} gold a unit`)}</small>}
        </button>
        {world.cities.map((city, index) => {
          const trip = cityTripMs(kingdom, city)
          return (
            <button key={index} role="radio" aria-checked={current === index} className={current === index ? 'good active' : 'good'} disabled={!trip || (wait > 0 && current !== index)} data-why={!trip ? L('Ticaret noktandan oraya yol yok', 'There is no road there from your trading post') : L(`Hedef az önce değişti; ${wait} sn sonra yeniden değişir`, `The destination just changed; it can change again in ${wait}s`)} onClick={() => onCity(index)}>
              <Icon name="crown" size={24} />
              <b>{cityInfo(world, index).name}</b>
              <small>{trip ? L(`${seconds(trip)} sn sefer`, `${seconds(trip)}s trip`) : L('yol yok', 'no road')}</small>
              <small>{L(`${tradeUnits(kingdom) * loadFactor} birim, ${pricing}`, `${tradeUnits(kingdom) * loadFactor} units, ${pricing}`)}</small>
              {good && <small>{L(`birimi ${price(cityPrice(good, market, now))} altın`, `${price(cityPrice(good, market, now))} gold a unit`)}</small>}
            </button>
          )
        })}
      </div>
      {online && <InnChoices world={world} kingdom={kingdom} market={market} now={now} online={online} current={innAt} wait={wait} onInn={onInn} />}
      <p className="hint">
        {L(
          `Taç başkenti ${loadFactor} kat yük alır ve ${premium === 0 ? 'lobinin o anki fiyatından öder' : `lobinin o anki fiyatının %${Math.abs(premium)} ${premium > 0 ? 'fazlasını' : 'eksiğini'} öder`}; bu satış lobi fiyatlarını da düşürür (lobi pazarındaki etkinin %${impact} kadarı). Ama yol uzundur: sefer başkentin uzaklığıyla uzar. Değiştirince tüccar yeni sefere başlar; ${Math.round(changeCooldownSeconds / 60)} dakika yeniden değiştiremezsin.`,
          `A crown capital takes ${loadFactor}× the load and ${premium === 0 ? 'pays the lobby\'s current price' : `pays ${Math.abs(premium)}% ${premium > 0 ? 'above' : 'below'} the lobby's current price`}; these sales also lower lobby prices (${impact}% of the lobby market's effect). But the road is long: the trip grows with the capital's distance. Change it and the merchant starts a new trip; you cannot change it again for ${Math.round(changeCooldownSeconds / 60)} minutes.`,
        )}
      </p>
    </Section>
  )
}

// The inns the merchant may sell at: those where the lord's slice of the pie is big enough (or the one he sells at),
// best paying first for the good he sells (CLAUDE.md §7.6).
function InnChoices({ world, kingdom, market, now, online, current, wait, onInn }: {
  world: World
  kingdom: Kingdom
  market?: Market | null
  now: number
  online: Online
  current: number
  wait: number
  onInn?(inn: Point): void
}) {
  const spec = balance.economy.trade.inns
  const good = kingdom.trade.good
  const low = kingdom.trade.level < spec.minLevel
  const open = world.inns
    .map((inn, index) => ({ inn, index, share: innReach(world, index, online).find((p) => p.k.id === online.me)?.share ?? 0 }))
    .filter((x) => x.share >= spec.minShare || x.index === current)
    .map((x) => ({ ...x, unit: good ? innUnitPrice(world, x.index, kingdom, x.share, good, market, now) : 0 }))
    .sort((a, b) => b.unit - a.unit || b.share - a.share)
  return (
    <>
      <h4 className="sub-head">{L('Hanlar', 'Inns')}</h4>
      {open.length === 0 ? (
        <p className="hint">{L(`Hiçbir hanın pastasında yeterli payın yok (en az %${Math.round(spec.minShare * 100)}). Bir hanın ${spec.reachTiles} karo yakınında bir kasaba al; hana tıklayıp fiyatlarına bak.`, `You lack a big enough slice of any inn's pie (at least ${Math.round(spec.minShare * 100)}%). Take a town within ${spec.reachTiles} tiles of an inn; click an inn to see its prices.`)}</p>
      ) : (
        <div className="goods choices" role="radiogroup" aria-label={L('Tüccarın gideceği han', 'The inn the merchant goes to')}>
          {open.map(({ inn, index, share, unit }) => (
            <button
              key={index}
              role="radio"
              aria-checked={current === index}
              className={current === index ? 'good active' : 'good'}
              disabled={low || (wait > 0 && current !== index)}
              data-why={low ? L(`Ticaret noktan ${spec.minLevel + 1}. seviye olmalı`, `Your trading post must be level ${spec.minLevel + 1}`) : L(`Hedef az önce değişti; ${wait} sn sonra yeniden değişir`, `The destination just changed; it can change again in ${wait}s`)}
              onClick={() => onInn?.({ x: inn.x, y: inn.y })}
            >
              <Icon name="inn" size={24} />
              <b>{innInfo(world, index, isCaravanserai(world, inn)).name}</b>
              <small>{L(`payın %${Math.round(share * 100)}`, `your share ${Math.round(share * 100)}%`)}</small>
              <small>{L(`${seconds(lobbyTripMs(kingdom.buildings))} sn sefer`, `${seconds(lobbyTripMs(kingdom.buildings))}s trip`)}</small>
              {good && <small>{L(`birimi ${price(unit)} altın`, `${price(unit)} gold a unit`)}</small>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// The label over a free city under the pointer.
export function CityTip({ world, index, at }: { world: World; index: number; at: Point }) {
  return (
    <div className="map-tip frame" style={{ left: at.x, top: at.y }} role="tooltip">
      <b style={{ color: cityInfo(world, index).color }}>{cityInfo(world, index).name}</b>
      <NameNote name={cityInfo(world, index).capital} />
      <small>{L(`Taç krallığı, başkent ${cityInfo(world, index).capital} · güvenli bölge`, `Crown kingdom, capital ${cityInfo(world, index).capital} · safe zone`)}</small>
      <em>{L('tıkla', 'click')}</em>
    </div>
  )
}

// A crown kingdom's capital (CLAUDE.md §7.8): who rules it, fealty to it, what it buys, and sending the merchant there.
export function CitySheet({ world, index, kingdom, online, market, now, onCity, onSwear, onShow, onClose }: {
  world: World
  index: number
  kingdom: Kingdom | null
  online: Online
  market?: Market | null
  now: number
  onCity(city: number | null): void
  onSwear(city: number): void
  onShow(tile: Point): void
  onClose(): void
}) {
  const info = cityInfo(world, index)
  const city = world.cities[index]
  const middle = cityCenter(city)
  const distance = kingdom ? Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y)) : null
  const trip = kingdom ? cityTripMs(kingdom, city) : null
  const here = kingdom?.trade.city?.index === index
  const wait = kingdom ? Math.max(0, Math.ceil((tradeCityReadyAt(kingdom) - now) / 1000)) : 0
  const { loadFactor } = balance.cities.trade
  return (
    <section className="sheet frame" aria-labelledby="city-title">
      <header className="sheet-head">
        <Icon name="crown" size={32} />
        <div>
          <h2 id="city-title" style={{ color: info.color }}>
            {info.name}
          </h2>
          <NameNote name={info.capital} />
          <small>
            {L(`Başkent ${info.capital} · taç krallığı`, `Capital ${info.capital} · crown kingdom`)}{distance !== null && L(` · ${distance} karo uzakta`, ` · ${distance} tiles away`)}
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
            <b>{info.ruler}</b>
            <small className="hint">
              {L(
                `${info.capital} şehrinden hüküm sürer; lordlar ona biat eder. Surlarının çevresi güvenli bölgedir: ${balance.cities.safeTiles} karo içinde muharebe olmaz. Ordular yakınında handaki gibi moral toplar.`,
                `Rules from the city of ${info.capital}; lords swear fealty to this throne. The ground round its walls is a safe zone: no battles within ${balance.cities.safeTiles} tiles. Armies nearby regain morale as they would at an inn.`,
              )}
            </small>
          </div>
        </div>
        <Section title={L('Şehrin ödediği fiyat', 'What the city pays')} icon="gold" aside={(() => { const p = Math.round((balance.cities.trade.priceFactor - 1) * 100); return p === 0 ? L('lobi fiyatı', 'lobby price') : L(`lobi fiyatı ${p > 0 ? '+' : '−'}%${Math.abs(p)}`, `lobby price ${p > 0 ? '+' : '−'}${Math.abs(p)}%`) })()}>
          <div className="price-row">
            {GOODS.map((g) => (
              <span key={g} className="price" title={RESOURCE_NAMES[g]}>
                <Icon name={RESOURCE_ICONS[g]} size={16} />
                <b>{price(cityPrice(g, market, now))}</b>
                <small>{L(`lobide ${price(priceAt(market, g, now))}`, `lobby ${price(priceAt(market, g, now))}`)}</small>
              </span>
            ))}
          </div>
          <p className="hint">{L(`Tüccarın buraya seferde ${loadFactor} kat yük götürür; buradaki satış lobi fiyatlarını lobi pazarının %${Math.round(balance.cities.trade.marketImpact * 100)} kadar düşürür.`, `Your merchant carries ${loadFactor}× the load here each trip; sales here lower lobby prices by ${Math.round(balance.cities.trade.marketImpact * 100)}% of what the lobby market's would.`)}</p>
        </Section>
        {kingdom && <CrownStanding world={world} index={index} kingdom={kingdom} />}
        <CrownRivalry world={world} online={online} />
        {kingdom && <Stewardship world={world} kingdom={kingdom} now={now} />}
        {kingdom && <Fealty world={world} kingdom={kingdom} now={now} only={index} onSwear={onSwear} />}
        {kingdom && (
          <Section title={L('Tüccarın', 'Your merchant')} icon="trade">
            {here ? (
              <>
                <p className="hint">{L(`Tüccar şu an bu şehre gidip geliyor (${trip ? seconds(trip) : '?'} sn sefer).`, `Your merchant is trading with this city now (${trip ? seconds(trip) : '?'}s trip).`)}</p>
                <button className="btn small" disabled={wait > 0} data-why={L(`Hedef az önce değişti; ${wait} sn bekle`, `The destination just changed; wait ${wait}s`)} onClick={() => onCity(null)}>
                  {wait > 0 ? L(`Lobi pazarına dönmek için ${wait} sn bekle`, `Wait ${wait}s to return to the lobby market`) : L('Lobi pazarına dön', 'Back to the lobby market')}
                </button>
              </>
            ) : trip ? (
              <>
                <p className="hint">{L(`Ticaret noktandan sefer ${seconds(trip)} sn sürer.`, `From your trading post the trip takes ${seconds(trip)}s.`)}</p>
                <button className="btn small" disabled={wait > 0} data-why={L(`Hedef az önce değişti; ${wait} sn bekle`, `The destination just changed; wait ${wait}s`)} onClick={() => onCity(index)}>
                  {wait > 0 ? L(`Göndermek için ${wait} sn bekle`, `Wait ${wait}s to send`) : L('Tüccarı buraya gönder', 'Send the merchant here')}
                </button>
              </>
            ) : (
              <p className="hint">{L('Önce bir ticaret noktan olmalı.', 'You need a trading post first.')}</p>
            )}
          </Section>
        )}
      </div>
    </section>
  )
}

// Fealty to a crown kingdom (CLAUDE.md §7.8): to whom the lord is sworn, or the crowns to swear to. Not needed to
// begin with; the palace rises past its first level only once sworn. Swearing asks to be confirmed and holds for the
// season. `only` shows just that crown (on its capital's sheet).
export function Fealty({ world, kingdom, now, only, onSwear, onOpen }: { world: World; kingdom: Kingdom; now: number; only?: number; onSwear(city: number): void; onOpen?(city: number): void }) {
  const [asking, setAsking] = useState<number | null>(null)
  if (world.cities.length === 0) return null
  const level = balance.cities.crown.requiredForPalaceLevel
  if (kingdom.liege !== undefined && world.cities[kingdom.liege]) {
    const liege = cityInfo(world, kingdom.liege)
    // On the palace's tab: the liege as a large button that takes the lord to its court.
    if (onOpen) return (
      <Section title={L('Bağlılık', 'Fealty')} icon="crown" aside={L('sezon boyunca', 'for the season')}>
        <button className="liege-button" style={{ borderColor: liege.color }} onClick={() => onOpen(kingdom.liege!)}>
          <CrownBanner world={world} liege={kingdom.liege} size={28} />
          <span>
            <b style={{ color: liege.color }}>{liege.name.toLocaleUpperCase(locale())}</b>
            <small>
              {L(`Lordu olduğun taç · hükümdar ${liege.ruler} · ilişkin ${Math.round(crownRelation(kingdom, kingdom.liege))}`, `Your liege crown · ruler ${liege.ruler} · relations ${Math.round(crownRelation(kingdom, kingdom.liege))}`)}
            </small>
          </span>
          <Icon name="pin" size={16} />
        </button>
      </Section>
    )
    if (only !== undefined && only !== kingdom.liege) return (
      <Section title={L('Bağlılık', 'Fealty')} icon="crown">
        <p className="hint">
          {L('Sen ', 'You are a lord of the ')}<b style={{ color: liege.color }}>{liege.name}</b>{L(' lordusun; bu tacın lordu değilsin.', '; you are not this crown\'s lord.')}
        </p>
      </Section>
    )
    return (
      <Section title={L('Bağlılık', 'Fealty')} icon="crown" aside={L('sezon boyunca', 'for the season')}>
        <p className="hint">
          {L('', 'You are a lord of the ')}<b style={{ color: liege.color }}>{liege.name}</b>{L(` lordusun. Hükümdarın ${liege.ruler}, başkentin ${liege.capital}.`, `. Your ruler is ${liege.ruler}, your capital ${liege.capital}.`)}
        </p>
      </Section>
    )
  }
  const crowns = world.cities.map((_, index) => index).filter((index) => only === undefined || index === only)
  // The crowns take notice of a lord once it has grown a little (they are introduced then).
  if (!fealtyOpen(kingdom, now)) return (
    <Section title={L('Bağlılık', 'Fealty')} icon="crown" aside={L('şu an uygun değil', 'not available yet')}>
      <p className="hint">
        {L(
          `Taç krallıkları henüz seninle ilgilenmiyor. Lordluğunu biraz büyüt: ${doneBuildings(kingdom, now)} / ${balance.cities.crown.intro.buildings} yapı. O zaman iki taç sana kendini tanıtacak ve tarafını seçeceksin.`,
          `The crown kingdoms take no interest in you yet. Grow your lordship a little: ${doneBuildings(kingdom, now)} / ${balance.cities.crown.intro.buildings} buildings. Then the two crowns will introduce themselves and you will choose a side.`,
        )}
      </p>
    </Section>
  )
  return (
    <Section title={L('Bağlılık', 'Fealty')} icon="crown" aside={L('henüz biat etmedin', 'not sworn yet')}>
      <p className="hint">
        {L(
          `Haritadaki iki şehir, iki taç krallığının başkentidir. Birine biat edip lordu olursun; biat sezon boyunca değişmez. Başlamak için gerekmez, ama sarayı ${level}. seviyeye yükseltmek için biat şarttır.`,
          `The two cities on the map are the capitals of the two crown kingdoms. Swear fealty to one and you become its lord; fealty holds for the whole season. You need not do it to begin with, but you must to raise your palace to level ${level}.`,
        )}
      </p>
      <div className={crowns.length === 1 ? 'goods two' : 'goods'} role="group" aria-label={L('Taç krallıkları', 'The crown kingdoms')}>
        {crowns.map((index) => {
          const info = cityInfo(world, index)
          const middle = cityCenter(world.cities[index])
          const distance = Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))
          return (
            <div key={index} className="good">
              <Icon name="crown" size={24} />
              <b style={{ color: info.color }}>{info.name}</b>
              <small>{info.ruler}</small>
              <small>{L(`başkent ${info.capital} · ${distance} karo`, `capital ${info.capital} · ${distance} tiles`)}</small>
              {asking === index ? (
                <span className="row">
                  <button className="btn small" onClick={() => onSwear(index)}>
                    {L('Eminim, biat et', 'I am sure, swear fealty')}
                  </button>
                  <button className="btn small" onClick={() => setAsking(null)}>
                    {L('Vazgeç', 'Cancel')}
                  </button>
                </span>
              ) : (
                <button className="btn small" onClick={() => setAsking(index)}>
                  {L('Biat et', 'Swear fealty')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// A lord's crown banner (CLAUDE.md §7.8): a small swallow-tailed flag in the colour of the crown kingdom it is sworn to,
// beside its name; nothing for a lord not yet sworn.
export function CrownBanner({ world, liege, size = 14 }: { world: World; liege?: number | null; size?: number }) {
  if (liege == null || !world.cities[liege]) return null
  const info = cityInfo(world, liege)
  return (
    <svg className="crown-banner" width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={L(`${info.name} lordu`, `Lord of the ${info.name}`)}>
      <title>{L(`${info.name} lordu`, `Lord of the ${info.name}`)}</title>
      <rect x="1" y="1" width="1.6" height="13" fill="#2a1c10" />
      <path d="M2.6 1.5 H13 L10.4 4.5 L13 7.5 H2.6 Z" fill={info.color} stroke="#120d0b" strokeWidth="0.8" />
    </svg>
  )
}

// ---- The crowns' politics (CLAUDE.md §7.8) -------------------------------------------------------------------------

const signedInt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`
const signedDec = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString(locale(), { maximumFractionDigits: 1 })}`

// How a crown stands with the lord: the relation, where it drifts back to, what moves it, and the gifts its patrols
// bring at each step.
function CrownStanding({ world, index, kingdom }: { world: World; index: number; kingdom: Kingdom }) {
  const info = cityInfo(world, index)
  const relation = crownRelation(kingdom, index)
  const rest = crownRest(kingdom, index)
  const r = balance.cities.crown.relation
  const sworn = kingdom.liege === index
  const gift = giftAt(relation)
  const o = balance.cities.crown.orders
  const q = balance.cities.crown.quests
  const royal = balance.cities.crown.royal.relation
  return (
    <Section title={L('Seninle ilişkisi', 'Relations with you')} icon="happy" aside={signedInt(relation)}>
      <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={L(`${info.name} ile ilişki`, `Relations with the ${info.name}`)} segments={20} />
      <p className="hint">
        {L(
          `Zamanla ${signedInt(rest)} düzeyine döner (${sworn ? 'kendi tacın sana sıcak bakar' : kingdom.liege !== undefined ? 'rakip taç sana soğuk bakar' : 'henüz kimseye biat etmedin'}). İlişkiyi artıranlar: tüccarını ${info.capital} şehrine göndermek (her sefer ${signedDec(r.cityTrip)}), siparişlerini göndermek (${signedDec(sworn ? o.relation.own : o.relation.other)}), görevlerini bitirmek (${signedInt(sworn ? q.relation.own : q.relation.other)})`,
          `Drifts back to ${signedInt(rest)} over time (${sworn ? 'your own crown looks warmly on you' : kingdom.liege !== undefined ? 'the rival crown looks coldly on you' : 'you have sworn to no one yet'}). Raised by: sending your merchant to ${info.capital} (${signedDec(r.cityTrip)} a trip), sending its orders (${signedDec(sworn ? o.relation.own : o.relation.other)}), finishing its tasks (${signedInt(sworn ? q.relation.own : q.relation.other)})`,
        )}
        {sworn
          ? L(`, devriyesini ağırlamak (${signedInt(r.visit)}), kraliyet isteklerini teslim etmek (${signedInt(royal.deliver)}). Azaltanlar: kraliyet isteğini geri çevirmek (${signedInt(royal.decline)}).`, `, hosting its patrol (${signedInt(r.visit)}), delivering royal requests (${signedInt(royal.deliver)}). Lowered by: turning down a royal request (${signedInt(royal.decline)}).`)
          : L(`, istediği haracı ödemek (${signedInt(r.tributePaid)}). Azaltanlar: haracı reddetmek (${signedInt(r.tributeRefused)}). Cevapsız kalan haraç kendiliğinden ödenir (oyundaysan fazlasıyla); ilişkiyi bozmaz.`, `, paying the tribute it asks (${signedInt(r.tributePaid)}). Lowered by: refusing tribute (${signedInt(r.tributeRefused)}). Unanswered tribute is paid automatically (with a surcharge if you are in the game) and does not hurt relations.`)}
      </p>
      <ul className="tiers">
        {balance.cities.crown.gifts.map((g) => (
          <li key={g.at} className={relation >= g.at ? 'on' : undefined}>
            <Icon name="chest" size={16} />
            <span>
              <b>{L(g.name, g.nameEn ?? g.name)}</b> · {L('ilişki', 'relations')} {g.at}+
            </span>
            <small>
              {fmt(g.gold)} {L('altın', 'gold')}{Object.entries(g.goods).map(([good, v]) => `, ${fmt(v as number)} ${RESOURCE_NAMES[good as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join('')}
            </small>
          </li>
        ))}
      </ul>
      <p className="hint">
        {sworn
          ? gift
            ? L(`Devriyesi sana her uğradığında «${gift.name}» getirir (tacın gücüyle artar ya da azalır).`, `Each time its patrol calls on you it brings “${gift.nameEn ?? gift.name}” (more or less with the crown's power).`)
            : L(`İlişkin ${balance.cities.crown.gifts[0].at}'a ulaşınca devriyesi sana armağan getirmeye başlar.`, `Once your relations reach ${balance.cities.crown.gifts[0].at}, its patrol starts bringing you gifts.`)
          : L(
              `Rakip tacın haraççıları ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelip hazinenin ${pctText(tributeShareNow(crownKeyOf(kingdom), index, serverNow()))}'ini (en az ${balance.cities.crown.patrol.tribute.min} altın) ister${waysText(crownKeyOf(kingdom), index, serverNow(), 'tribute') ? ` (${waysText(crownKeyOf(kingdom), index, serverNow(), 'tribute')})` : ''}; armağan getirmezler.`,
              `The rival crown's tribute collectors come every ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} minutes and ask for ${pctText(tributeShareNow(crownKeyOf(kingdom), index, serverNow()))} of the treasury (at least ${balance.cities.crown.patrol.tribute.min} gold)${waysText(crownKeyOf(kingdom), index, serverNow(), 'tribute') ? ` (${waysText(crownKeyOf(kingdom), index, serverNow(), 'tribute')})` : ''}; they bring no gifts.`,
            )}
      </p>
    </Section>
  )
}

// The balance of power between the two crowns: a pie of their strength (a base of their own and their lords' scores),
// and their lords side by side.
export function CrownRivalry({ world, online }: { world: World; online: Online }) {
  if (world.cities.length < 2) return null
  const lords = online.kingdoms.map((k) => ({ id: k.id, name: k.name, liege: k.liege ?? null, score: k.score?.total ?? 0 }))
  const { power, share } = crownPower(lords, world.cities.length)
  const p = balance.cities.crown.power
  const infos = world.cities.map((_, i) => cityInfo(world, i))
  // The pie: one slice per crown, from the top, clockwise.
  let angle = -Math.PI / 2
  const slices = share.map((s, i) => {
    const from = angle
    angle += s * Math.PI * 2
    const large = s > 0.5 ? 1 : 0
    const at = (a: number) => `${50 + 46 * Math.cos(a)} ${50 + 46 * Math.sin(a)}`
    return <path key={i} d={s >= 0.999 ? 'M50 4 A46 46 0 1 1 49.99 4 Z' : `M50 50 L${at(from)} A46 46 0 ${large} 1 ${at(angle)} Z`} fill={infos[i].color} stroke="#120d0b" strokeWidth="2" />
  })
  const unsworn = lords.filter((l) => l.liege === null).length
  return (
    <Section title={L('Taçların gücü', 'The crowns\' power')} icon="banner" aside={share.map((v) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)).join(' · ')}>
      <div className="rivalry">
        <svg viewBox="0 0 100 100" className="pie" role="img" aria-label={infos.map((info, i) => L(`${info.name} %${Math.round(share[i] * 100)}`, `${info.name} ${Math.round(share[i] * 100)}%`)).join(', ')}>
          {slices}
        </svg>
        <div className="rivalry-sides">
          {infos.map((info, i) => {
            const mine = lords.filter((l) => l.liege === i).sort((a, b) => b.score - a.score)
            const top = Math.max(1, ...lords.map((l) => l.score))
            return (
              <div key={i} className="rivalry-side">
                <b style={{ color: info.color }}>{info.name}</b>
                <small>
                  {L(`güç ${fmt(power[i])} · ${mine.length} lord`, `power ${fmt(power[i])} · ${mine.length} lord${mine.length === 1 ? '' : 's'}`)}
                </small>
                <ul>
                  {mine.map((l) => (
                    <li key={l.id}>
                      <span>{l.name}</span>
                      <i style={{ width: `${(l.score / top) * 100}%`, background: info.color }} />
                      <small>{fmt(l.score)}</small>
                    </li>
                  ))}
                  {mine.length === 0 && <li className="hint">{L('Henüz lordu yok', 'No lords yet')}</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
      <p className="hint">
        {L(
          `Bir tacın gücü kendi ${fmt(p.base)} puanı ile ona bağlı lordların puanlarının toplamıdır; lordları geliştikçe tacı güçlenir. Güçlü taç kendi lordlarına daha cömerttir (bahşiş ve armağanlar ×${byPower(1, p.favour).toFixed(1).replace('.', ',')}'e kadar).`,
          `A crown's power is its own ${fmt(p.base)} points plus the points of the lords sworn to it; as its lords grow, so does the crown. A strong crown is more generous to its lords (tips and gifts up to ×${byPower(1, p.favour).toFixed(1)}).`,
        )}{' '}
        {unsworn > 0 && L(`${unsworn} lord henüz taraf seçmedi.`, `${unsworn} lord${unsworn === 1 ? ' has' : 's have'} not chosen a side yet.`)}
      </p>
      <p className="hint">
        {L('Şimdi:', 'Now:')}{' '}
        {infos.map((info, i) => L(`${info.name} bahşiş/armağan ×${byPower(share[i], p.favour).toFixed(2).replace('.', ',')}`, `${info.name} tips/gifts ×${byPower(share[i], p.favour).toFixed(2)}`)).join(' · ')}
      </p>
    </Section>
  )
}

// Each crown watches over the trade in one good for a while: the lord it favours sells that good dearer, the lord it
// dislikes cheaper (or its merchants will not deal with him).
function Stewardship({ world, kingdom, now }: { world: World; kingdom: Kingdom; now: number }) {
  if (world.cities.length < 2) return null
  const { goods, endsAt } = crownGoods(kingdom.lobbyKey, now)
  const s = balance.cities.crown.stewardship
  const minutes = Math.max(1, Math.ceil((endsAt - now) / 60_000))
  return (
    <Section title={L('Taçların pazarı', 'The crowns\' market')} icon="trade" aside={L(`${minutes} dk sonra değişir`, `changes in ${minutes} min`)}>
      <ul className="tiers">
        {goods.map((good, i) => {
          const info = cityInfo(world, i)
          const f = stewardFactor(kingdom, good, now)
          const relation = crownRelation(kingdom, i)
          return (
            <li key={i} className={f >= 1 ? 'on' : 'off'}>
              <Icon name={RESOURCE_ICONS[good]} size={16} />
              <span>
                {L('', 'The ')}<b style={{ color: info.color }}>{info.name}</b> {L(`${RESOURCE_NAMES[good].toLowerCase()} ticaretini yönetiyor`, `oversees the ${RESOURCE_NAMES[good].toLowerCase()} trade`)}
              </span>
              <small>
                {relation <= s.refuseBelow
                  ? L(`tüccarları senden almıyor: fiyatın %${Math.round((1 - f) * 100)} düşük`, `its merchants will not buy from you: your price is ${Math.round((1 - f) * 100)}% lower`)
                  : L(`ilişkin ${signedInt(relation)} → satış fiyatın ${f >= 1 ? '+' : '−'}%${Math.round(Math.abs(f - 1) * 100)}`, `relations ${signedInt(relation)} → your selling price ${f >= 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)}%`)}
              </small>
            </li>
          )
        })}
      </ul>
      <p className="hint">
        {L(
          `Her taç dönem dönem bir malın ticaretini yönetir. O malı sattığında (lobi pazarında da, şehirde de) fiyatın taçla ilişkine göre değişir: en çok %${Math.round(s.bonus * 100)} fazla ya da %${Math.round(s.penalty * 100)} az; ilişkin ${signedInt(s.refuseBelow)}'nin altındaysa o tacın tüccarları seninle alışveriş etmez ve fiyatın yarıya düşer.`,
          `Each crown in turn oversees the trade in one good. When you sell that good (at the lobby market or in a city) your price moves with your relations to that crown: up to ${Math.round(s.bonus * 100)}% more or ${Math.round(s.penalty * 100)}% less; below ${signedInt(s.refuseBelow)} that crown's merchants will not deal with you and your price is halved.`,
        )}
      </p>
    </Section>
  )
}

// The crowns' commissions (CLAUDE.md §7.8): each crown orders a lot of one good every hour; delivering it from the
// stores pays over the usual price (more from one's own crown) and warms the crown.
export function CrownOrders({ world, kingdom, now, online }: { world: World; kingdom: Kingdom; now: number; online?: Online }) {
  if (world.cities.length === 0) return null
  const palace = palaceLevel(kingdom, now)
  const trips = (kingdom.orderTrips ?? []).filter((t) => t.arriveAt > now)
  const o = balance.cities.crown.orders
  return (
    <Section title={L('Taç siparişleri', 'Crown orders')} icon="scroll" aside={L('saatte bir yenilenir', 'renewed every hour')}>
      <ul className="order-cards">
        {world.cities.map((city, crown) => {
          const info = cityInfo(world, crown)
          const order = crownOrder(kingdom.lobbyKey, crown, now)
          const why = crownOrderError(kingdom, crown, now, world.cities.length, palace)
          const pay = orderPay(kingdom, order, online?.market, now)
          const trip = cityTripMs(kingdom, city)
          const have = Math.floor(kingdom.stock[order.good])
          const text =
            why === 'done' ? L('Bu saatin siparişi gönderildi', 'This hour\'s order has been sent') : why === 'have' ? L(`Depoda ${fmt(have)} / ${fmt(order.units)} var`, `${fmt(have)} / ${fmt(order.units)} in store`) : why === 'relation' ? L('Taç seninle alışveriş etmiyor', 'The crown will not trade with you') : why === 'locked' ? L(`${o.minPalace}. seviye saray gerekir`, `Needs a level ${o.minPalace} palace`) : !trip ? L('Ticaret noktası yok', 'No trading post') : L('Kervanla gönder', 'Send by caravan')
          return (
            <li key={crown} className="order-card">
              <Icon name={RESOURCE_ICONS[order.good]} size={24} />
              <div className="order-body">
                <b style={{ color: info.color }}>{info.name}</b>
                <span>
                  {L(`${fmt(order.units)} ${RESOURCE_NAMES[order.good].toLowerCase()} istiyor`, `wants ${fmt(order.units)} ${RESOURCE_NAMES[order.good].toLowerCase()}`)}
                </span>
                <span className="order-meta">
                  <span>
                    <Icon name="gold" size={16} /> {fmt(pay)} {L('altın', 'gold')}
                  </span>
                  <span>
                    <Icon name="time" size={16} /> {L('sefer', 'trip')} {trip ? L(`${seconds(trip)} sn`, `${seconds(trip)}s`) : '—'}
                  </span>
                  <span>{L(`${Math.ceil((order.endsAt - now) / 60_000)} dk kaldı`, `${Math.ceil((order.endsAt - now) / 60_000)} min left`)}</span>
                </span>
              </div>
              <button className="btn small order-send" disabled={!!why || !trip || !online} data-why={!online ? L('Sunucuya bağlı değil', 'Not connected to the server') : why ? (text === L('Kervanla gönder', 'Send by caravan') ? L('Şu an gönderilemez', 'Cannot be sent right now') : text) : L('Önce bir ticaret noktan olmalı', 'You need a trading post first')} onClick={() => online?.act({ type: 'order', crown })}>
                {text}
              </button>
            </li>
          )
        })}
      </ul>
      {trips.length > 0 && (
        <ul className="order-trips" aria-label={L('Yoldaki kervanlar', 'Caravans on the road')}>
          {trips.map((t) => (
            <li key={`${t.crown}:${t.leftAt}`}>
              <Icon name="trade" size={16} />
              <span>
                {fmt(t.units)} {RESOURCE_NAMES[t.good].toLowerCase()} → {cityInfo(world, t.crown).capital} · {fmt(t.gold)} {L('altın', 'gold')}
              </span>
              <Meter value={Math.max(0, Math.min(1, (now - t.leftAt) / (t.arriveAt - t.leftAt)))} label={L('Kervan', 'Caravan')} segments={10} />
              <small>{L(`${seconds(t.arriveAt - now)} sn`, `${seconds(t.arriveAt - now)}s`)}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        {L(
          `Mallar depondan hemen çıkar ve kervanla tacın başkentine gider; ödeme kervan dönünce gelir (sefer, tüccarın o şehre gidip dönmesi kadar sürer). Taç malı gönderdiğin andaki lobi fiyatının %${Math.round((o.payFactor - 1) * 100)} fazlasına alır (biat ettiğin taç %${Math.round(o.swornBonus * 100)} daha fazla öder), ilişkiniz iyileşir. Satış lobi fiyatlarına dokunmaz. Kervan dönerken hazine doluysa sığmayan altın boşa gider.`,
          `The goods leave your stores at once and go by caravan to the crown's capital; payment comes when the caravan returns (the trip takes as long as the merchant's round trip to that city). The crown pays ${Math.round((o.payFactor - 1) * 100)}% over the lobby price at the moment you send (the crown you are sworn to pays ${Math.round(o.swornBonus * 100)}% more), and relations improve. The sale does not touch lobby prices. If the treasury is full when the caravan returns, the gold that does not fit is wasted.`,
        )}
      </p>
    </Section>
  )
}

// The crowns as the diplomacy tab shows them (Diplomasi → Krallık; CLAUDE.md §7.8): each crown's ruler and its
// standing with the lord, its policies of the moment (what it buys at the lobby's market, the good it watches over,
// its order of the hour, its patrols and tribute), the task it asks of the lord this hour, and the struggle for power
// between the two.
export const QUEST_TITLES: Record<QuestKind, string> = {
  trade: L('Ticari üstünlük', 'Trade supremacy'),
  town: L('Kasaba ele geçir', 'Take a town'),
  order: L('Siparişimizi gönder', 'Send our order'),
  army: L('Ordunu büyüt', 'Grow your army'),
  bandit: L('Yolları temizle', 'Clear the roads'),
  pirate: L('Korsan avı', 'Pirate hunt'),
  haven: L('Korsan limanını kuşat', 'Blockade a pirate haven'),
}

function questText(kind: QuestKind, units: number | undefined, good: string | undefined, need: number) {
  switch (kind) {
    case 'trade':
      return L(`Bu saat tüccarın ${fmt(units ?? 0)} birim ${good} satsın: pazarda sözümüz geçsin.`, `Have your merchant sell ${fmt(units ?? 0)} units of ${good} this hour: let our word carry weight in the market.`)
    case 'town':
      return L('Bu saat bir kasabayı ele geçir ya da kuşatıp al.', 'Take a town this hour, by siege or otherwise.')
    case 'order':
      return L('Bu saatin siparişini (yukarıda; Ticaret → Siparişler) kervanla başkente gönder.', 'Send this hour\'s order (above; Trade → Orders) to the capital by caravan.')
    case 'army':
      return L(`Garnizonun ve sahadaki ordularınla en az ${fmt(need)} askere ulaş.`, `Reach at least ${fmt(need)} soldiers across your garrison and armies in the field.`)
    case 'bandit':
      return L('Yollarda gezen yağmacı çetelerinden birini bu saat ortadan kaldır: haritada bir çeteye tıkla, bir orduyla takip et ve yen.', 'Wipe out one of the bandit bands roaming the roads this hour: click a band on the map, give chase with an army and beat it.')
    case 'pirate':
      return L('Göllerde dolaşan korsan teknelerinden birini bu saat batır: haritada bir korsan teknesine tıkla, savaş gemili bir filoyla takip et.', 'Sink one of the pirate boats prowling the lakes this hour: click a pirate boat on the map and chase it with a fleet of warships.')
    case 'haven':
      return L('Bir korsan limanını bu saat ablukaya al: limana tıkla, savaş gemili bir filoyla git ve limanı koruyan çektirileri yen.', 'Blockade a pirate haven this hour: click the haven, sail there with a fleet of warships and beat the raiders guarding it.')
  }
}

const QUEST_WHY: Record<string, string> = {
  locked: L(`${balance.cities.crown.quests.minPalace}. seviye saray gerekir`, `Needs a level ${balance.cities.crown.quests.minPalace} palace`),
  relation: L('İlişkiniz çok kötü: bu taç senden bir şey istemez', 'Relations are too poor: this crown asks nothing of you'),
  notYet: L('Henüz tamamlanmadı', 'Not finished yet'),
  done: L('Ödülü aldın', 'Reward claimed'),
}

export function CrownsPanel({ world, kingdom, online, market, now }: { world: World; kingdom: Kingdom; online: Online; market?: Market | null; now: number }) {
  const crowns = world.cities.length
  // The page: the two crowns side by side ('list'), or one crown's own page; and the section open there. Both are
  // remembered.
  const ids = ['list', ...world.cities.map((_, i) => `c${i}`)]
  const [page, setPage] = usePart<string>('crowns', ids, 'list')
  const [inner, setInner] = usePart<CrownPart>('crown-part', CROWN_PARTS, 'house')
  if (crowns === 0) return <p className="hint">{L('Bu lobide taç krallığı yok.', 'There are no crown kingdoms in this lobby.')}</p>
  const palace = palaceLevel(kingdom, now)
  const claimable = (i: number) => !!questProgress(kingdom, i, now).taken && !questError(kingdom, i, 'claim', now, crowns, palace)
  const crown = page === 'list' ? null : Number(page.slice(1))
  if (crown === null)
    return (
      <>
        <BetrayalCard world={world} kingdom={kingdom} online={online} now={now} />
        <CrownCards world={world} kingdom={kingdom} online={online} now={now} claimable={claimable} onOpen={(i) => setPage(`c${i}`)} />
        <CrownRivalryPanel world={world} kingdom={kingdom} now={now} />
        <CrownRivalry world={world} online={online} />
        <Stewardship world={world} kingdom={kingdom} now={now} />
      </>
    )
  const info = cityInfo(world, crown)
  const sections: { id: CrownPart; name: string; dot?: boolean }[] = [
    { id: 'house', name: L('Hanedan', 'Dynasty') },
    { id: 'court', name: L('Saray', 'Court') },
    { id: 'policy', name: L('Politika', 'Policy'), dot: claimable(crown) },
  ]
  return (
    <>
      <BetrayalCard world={world} kingdom={kingdom} online={online} now={now} />
      <header className="crown-page-head" style={{ ['--crown' as string]: info.color }}>
        <button className="btn small crown-back" onClick={() => setPage('list')} aria-label={L('Krallıklara dön', 'Back to the kingdoms')}>
          {L('← Krallıklar', '← Kingdoms')}
        </button>
        <CrownBanner world={world} liege={crown} size={24} />
        <div>
          <b style={{ color: info.ink }}>{info.name}</b>
          <small>
            {info.ruler}
            {kingdom.liege === crown ? L(' · biat ettiğin taç', ' · your liege crown') : ''}
          </small>
        </div>
      </header>
      <nav className="crown-pills" aria-label={L('Tacın bölümleri', 'The crown\'s sections')}>
        {sections.map((x) => (
          <button key={x.id} className={inner === x.id ? 'crown-pill on' : 'crown-pill'} aria-current={inner === x.id ? 'page' : undefined} onClick={() => setInner(x.id)}>
            {x.name}
            {x.dot && <span className="dot" aria-label={L('Bekleyen bir şey var', 'Something is waiting')} />}
          </button>
        ))}
      </nav>
      {inner === 'house' && <RoyalFamily world={world} kingdom={kingdom} crown={crown} now={now} />}
      {inner === 'court' && <CrownCourt world={world} kingdom={kingdom} crown={crown} online={online} now={now} />}
      {inner === 'policy' && <CrownPolicy world={world} kingdom={kingdom} crown={crown} online={online} market={market} now={now} />}
    </>
  )
}

// The crowns side by side: banner, ruler, the lord's standing, what waits there; a tap opens the crown's page.
function CrownCards({ world, kingdom, online, now, claimable, onOpen }: { world: World; kingdom: Kingdom; online: Online; now: number; claimable(i: number): boolean; onOpen(i: number): void }) {
  const lords = online.kingdoms.map((k) => ({ liege: k.liege ?? null, score: k.score?.total ?? 0 }))
  const { share } = crownPower(lords, world.cities.length)
  const key = crownKeyOf(kingdom)
  const stance = crownRivalryAt(key, now).stance
  return (
    <>
      <div className="crown-cards">
        {world.cities.map((_, i) => {
          const info = cityInfo(world, i)
          const h = crownHouseAt(key, i, now)
          const relation = crownRelation(kingdom, i)
          const sworn = kingdom.liege === i
          return (
            <button key={i} className={sworn ? 'crown-card sworn' : 'crown-card'} style={{ ['--crown' as string]: info.color }} onClick={() => onOpen(i)}>
              <span className="crown-card-head">
                <CrownBanner world={world} liege={i} size={20} />
                <b style={{ color: info.ink }}>{info.name}</b>
                {claimable(i) && <span className="dot" aria-label={L('Ödül bekliyor', 'A reward is waiting')} />}
              </span>
              <Portrait seed={((key.lobbyKey ?? 0) % 100_000) * 7 + i * 104_729 + h.ruler.id * 977} sex={h.ruler.sex} age={crownAgeOf(h.ruler, now)} role={h.ruler.sex === 'm' ? 'king' : 'queen'} size={64} />
              <span className="crown-card-ruler">
                {h.title}
                <small>
                  {L(`${Math.floor(crownAgeOf(h.ruler, now))} yaşında`, `aged ${Math.floor(crownAgeOf(h.ruler, now))}`)}{h.regent ? L(' · naip yönetiyor', ' · a regent rules') : ''}
                </small>
              </span>
              <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={L(`${info.name} ile ilişki`, `Relations with the ${info.name}`)} segments={10} />
              <small>{L('ilişki', 'relations')} {signedInt(Math.round(relation))}</small>
              {sworn ? <span className="crown-badge">{L('biat ettiğin taç', 'your liege crown')}</span> : kingdom.liege !== undefined && kingdom.liege !== null ? <span className="crown-badge rival">{L('rakip taç', 'rival crown')}</span> : null}
            </button>
          )
        })}
      </div>
      {world.cities.length > 1 && (
        <div className="crown-strip" role="img" aria-label={`${L('Güç', 'Power')}: ${world.cities.map((_, i) => L(`${cityInfo(world, i).name} %${Math.round(share[i] * 100)}`, `${cityInfo(world, i).name} ${Math.round(share[i] * 100)}%`)).join(', ')}`}>
          <div className="crown-strip-bar">
            {share.map((v, i) => (
              <i key={i} style={{ width: `${v * 100}%`, background: cityInfo(world, i).color }} />
            ))}
          </div>
          <small>
            {L(
              `Güç %${Math.round(share[0] * 100)} · %${Math.round(share[1] * 100)} · taçlar ${STANCE_NAMES[stance].toLocaleLowerCase(locale())}`,
              `Power ${Math.round(share[0] * 100)}% · ${Math.round(share[1] * 100)}% · the crowns: ${STANCE_NAMES[stance].toLocaleLowerCase(locale())}`,
            )}
          </small>
        </div>
      )}
    </>
  )
}

type CrownPart = 'house' | 'court' | 'policy'
const CROWN_PARTS: CrownPart[] = ['house', 'court', 'policy']

// A crown's policies of the moment and the task it asks of the lord this hour.
function CrownPolicy({ world, kingdom, crown: i, online, market, now }: { world: World; kingdom: Kingdom; crown: number; online: Online; market?: Market | null; now: number }) {
  const demand = crownDemand(now)
  const { goods, endsAt } = crownGoods(kingdom.lobbyKey, now)
  const crowns = world.cities.length
  const palace = palaceLevel(kingdom, now)
  const q = balance.cities.crown.quests
  const tribute = balance.cities.crown.patrol.tribute
  const minutes = (ms: number) => L(`${Math.max(1, Math.ceil(ms / 60_000))} dk`, `${Math.max(1, Math.ceil(ms / 60_000))} min`)
  const goldRoom = goldCap(kingdom, now) - kingdom.stock.gold
  const key = crownKeyOf(kingdom)
  const tipWhy = waysText(key, i, now, 'tip')
  const tributeWhy = waysText(key, i, now, 'tribute')
  return (
    <>
      {(() => {
        const info = cityInfo(world, i)
        const buys = demand[i]
        const order = crownOrder(kingdom.lobbyKey, i, now)
        const orderSent = (kingdom.ordersDone ?? [])[i] === order.window
        const { quest, taken, have, need } = questProgress(kingdom, i, now)
        const take = questError(kingdom, i, 'take', now, crowns, palace)
        const claim = questError(kingdom, i, 'claim', now, crowns, palace)
        const relation = crownRelation(kingdom, i)
        const sworn = kingdom.liege === i
        const goodName = (g: keyof typeof RESOURCE_NAMES) => RESOURCE_NAMES[g].toLowerCase()
        return (
          <Section title={info.name} icon="crown" aside={`${sworn ? L('biat ettiğin taç · ', 'your liege crown · ') : ''}${L('ilişki', 'relations')} ${signedInt(Math.round(relation))}`}>
            <div className="feature">
              <Icon name="crown" size={32} />
              <div>
                <b style={{ color: info.color }}>{info.ruler}</b>
                <small className="hint">
                  {L(`${info.capital} şehrinden hüküm sürer.`, `Rules from the city of ${info.capital}.`)} {sworn ? L('Sen onun lordusun.', 'You are its lord.') : kingdom.liege !== undefined && kingdom.liege !== null ? L('Rakip tacın lordusun; sana soğuk bakar.', 'You are the rival crown\'s lord; it looks coldly on you.') : L('Henüz kimseye biat etmedin.', 'You have not sworn to anyone yet.')}
                </small>
              </div>
            </div>
            <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={L(`${info.name} ile ilişki`, `Relations with the ${info.name}`)} segments={20} />
            <b className="crown-sub">{L('Politikaları', 'Its policies')}</b>
            <Stat label={L('Pazardan alıyor', 'Buying at market')} value={goodName(buys.good)} note={L(`dakikada ${fmt(buys.perMinute)} birim, ucuzken · ${minutes(buys.until - now)} daha`, `${fmt(buys.perMinute)} units a minute while cheap · ${minutes(buys.until - now)} more`)} />
            <Stat label={L('Yönettiği mal', 'Good it oversees')} value={goodName(goods[i])} note={L(`satarken senin fiyatın ×${price(stewardFactor(kingdom, goods[i], now))} · ${minutes(endsAt - now)} daha`, `your selling price ×${price(stewardFactor(kingdom, goods[i], now))} · ${minutes(endsAt - now)} more`)} />
            <Stat
              label={L('Siparişi', 'Its order')}
              value={`${fmt(order.units)} ${goodName(order.good)}`}
              note={L(`${fmt(orderPay(kingdom, order, market, now))} altın öder${orderSent ? ' · gönderdin' : ''} · Ticaret → Siparişler · ${minutes(order.endsAt - now)} daha`, `pays ${fmt(orderPay(kingdom, order, market, now))} gold${orderSent ? ' · sent' : ''} · Trade → Orders · ${minutes(order.endsAt - now)} more`)}
            />
            <Stat
              label={L('Devriye ve haraç', 'Patrol and tribute')}
              value={sworn ? L('devriye', 'patrol') : kingdom.liege !== undefined && kingdom.liege !== null ? L('haraççı', 'tribute collectors') : L('gelmez', 'none come')}
              note={
                sworn
                  ? rivalPurse(kingdom, i, now) !== null
                    ? L(`sarayın 1. seviyedeyken devriyesi kapına gelip ~${fmt(tipPreview(kingdom, i, online, now))} altın bırakır`, `while your palace is at level 1 its patrol comes to your gate and leaves ~${fmt(tipPreview(kingdom, i, online, now))} gold`)
                    : L(`devriyesi eğlence merkezine uğrar, ~${fmt(tipPreview(kingdom, i, online, now))} altın bahşiş bırakır${tipWhy ? ` (${tipWhy})` : ''}`, `its patrol calls at your entertainment hall and tips ~${fmt(tipPreview(kingdom, i, online, now))} gold${tipWhy ? ` (${tipWhy})` : ''}`)
                  : kingdom.liege !== undefined && kingdom.liege !== null && rivalPurse(kingdom, i, now) !== null
                    ? L(`sarayın 1. seviyedeyken haraç istemez, ${Math.round(tribute.everySeconds / 60)} dakikada bir ~${fmt(rivalPurse(kingdom, i, now)!)} altın kese bırakır`, `while your palace is at level 1 it asks no tribute and leaves a purse of ~${fmt(rivalPurse(kingdom, i, now)!)} gold every ${Math.round(tribute.everySeconds / 60)} minutes`)
                  : kingdom.liege !== undefined && kingdom.liege !== null
                    ? L(`${Math.round(tribute.everySeconds / 60)} dakikada bir hazinenin ${pctText(tributeShareNow(key, i, now))}'ini (en az ${tribute.min} altın) ister${tributeWhy ? ` (${tributeWhy})` : ''}`, `asks for ${pctText(tributeShareNow(key, i, now))} of the treasury every ${Math.round(tribute.everySeconds / 60)} minutes (at least ${tribute.min} gold)${tributeWhy ? ` (${tributeWhy})` : ''}`)
                    : L('biat etmediğin için ne devriye ne haraççı gönderir', 'sends neither patrol nor collectors, since you are not sworn')
              }
            />
            <b className="crown-sub">{L('Senden istediği', 'What it asks of you')} · {QUEST_TITLES[quest.kind]}</b>
            <p className="hint">{questText(quest.kind, quest.units, quest.good && goodName(quest.good), need)}</p>
            {taken && <Meter value={need ? Math.min(1, have / need) : 1} tone={have >= need ? 'up' : 'gold'} label={L('Görevin ilerlemesi', 'Task progress')} segments={10} />}
            <p className="hint">
              {taken ? `${fmt(Math.min(have, need))} / ${fmt(need)} · ` : ''}
              {L(
                `Ödül: ${fmt(quest.gold)} altın ve ilişki +${sworn ? q.relation.own : q.relation.other} · ${minutes(quest.endsAt - now)} kaldı`,
                `Reward: ${fmt(quest.gold)} gold and +${sworn ? q.relation.own : q.relation.other} relations · ${minutes(quest.endsAt - now)} left`,
              )}
            </p>
            {taken && !claim && goldRoom < quest.gold && (
              <p className="hint down">{L(`Hazinende ${fmt(Math.max(0, goldRoom))} altınlık yer var: ödülün kalanı boşa gider. Önce biraz harca.`, `Your treasury has room for ${fmt(Math.max(0, goldRoom))} gold: the rest of the reward would go to waste. Spend a little first.`)}</p>
            )}
            {!taken ? (
              <button className="btn small" disabled={!!take} data-why={take ? (QUEST_WHY[take] ?? L('Şu an alınamaz', 'Cannot be taken right now')) : undefined} onClick={() => online.act({ type: 'quest', crown: i, action: 'take' })}>
                <Icon name="scroll" size={16} /> {take ? QUEST_WHY[take] ?? L('Alınamaz', 'Unavailable') : L('Görevi al', 'Take the task')}
              </button>
            ) : (
              <button className={claim ? 'btn small' : 'btn small primary'} disabled={!!claim} data-why={claim ? (QUEST_WHY[claim] ?? L('Ödül şu an alınamaz', 'The reward cannot be claimed now')) : undefined} onClick={() => online.act({ type: 'quest', crown: i, action: 'claim' })}>
                <Icon name="chest" size={16} /> {claim ? QUEST_WHY[claim] ?? L('Alınamaz', 'Unavailable') : L('Ödülü al', 'Claim reward')}
              </button>
            )}
          </Section>
        )
      })()}
    </>
  )
}
