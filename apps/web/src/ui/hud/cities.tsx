import { useState } from 'react'
import { GOODS, balance, goldCap, crownDemand, questError, questProgress, crownOrder, crownOrderError, orderPay, palaceLevel, byPower, cityCenter, cityPrice, cityTripMs, crownGoods, crownPower, crownRelation, crownRest, doneBuildings, fealtyOpen, giftAt, lobbyTripMs, priceAt, stewardFactor, tradeCityReadyAt, tradeUnits } from '@game/shared'
import type { Kingdom, Market, Point, QuestKind, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { RESOURCE_ICONS, RESOURCE_NAMES } from '../names'
import { Meter, Section, Stat, fmt } from './primitives'
import type { Online } from './online'

// The free cities (CLAUDE.md §4.2, §7.6): what they are, and the merchant's choice between the lobby's market and a
// free city's.

const seconds = (ms: number) => Math.round(ms / 1000)
const price = (n: number) => n.toFixed(2).replace('.', ',')

// Where the merchant takes the goods: the lobby's market from the trade post, or one of the free cities.
export function TradeDestination({ world, kingdom, market, now, onCity }: {
  world: World
  kingdom: Kingdom
  market?: Market | null
  now: number
  onCity(city: number | null): void
}) {
  if (world.cities.length === 0) return null
  const current = kingdom.trade.city?.index ?? null
  const wait = Math.max(0, Math.ceil((tradeCityReadyAt(kingdom) - now) / 1000))
  const { loadFactor, changeCooldownSeconds } = balance.cities.trade
  const premium = Math.round((balance.cities.trade.priceFactor - 1) * 100)
  const good = kingdom.trade.good
  return (
    <Section title="Tüccar nereye gitsin" icon="trade" aside={wait > 0 ? `${wait} sn sonra değişir` : undefined}>
      <div className={world.cities.length === 1 ? 'goods two' : 'goods'} role="radiogroup" aria-label="Tüccarın gideceği yer">
        <button role="radio" aria-checked={current === null} className={current === null ? 'good active' : 'good'} disabled={wait > 0 && current !== null} onClick={() => onCity(null)}>
          <Icon name="gold" size={24} />
          <b>Lobi pazarı</b>
          <small>{seconds(lobbyTripMs(kingdom.buildings))} sn sefer</small>
          <small>{tradeUnits(kingdom)} birim, lobi fiyatı</small>
          {good && <small>birimi {price(priceAt(market, good, now))} altın</small>}
        </button>
        {world.cities.map((city, index) => {
          const trip = cityTripMs(kingdom, city)
          return (
            <button key={index} role="radio" aria-checked={current === index} className={current === index ? 'good active' : 'good'} disabled={!trip || (wait > 0 && current !== index)} onClick={() => onCity(index)}>
              <Icon name="crown" size={24} />
              <b>{cityInfo(world, index).name}</b>
              <small>{trip ? `${seconds(trip)} sn sefer` : 'yol yok'}</small>
              <small>{tradeUnits(kingdom) * loadFactor} birim, lobi fiyatı +%{premium}</small>
              {good && <small>birimi {price(cityPrice(good, market, now))} altın</small>}
            </button>
          )
        })}
      </div>
      <p className="hint">
        Serbest şehir {loadFactor} kat yük alır ve lobinin o anki fiyatının %{premium} fazlasını öder; lobinin fiyatlarını lobi pazarının yarısı kadar düşürür. Ama yol uzundur: sefer şehrin uzaklığıyla uzar.
        Değiştirince tüccar yeni sefere başlar; {Math.round(changeCooldownSeconds / 60)} dakika yeniden değiştiremezsin.
      </p>
    </Section>
  )
}

// The label over a free city under the pointer.
export function CityTip({ world, index, at }: { world: World; index: number; at: Point }) {
  return (
    <div className="map-tip frame" style={{ left: at.x, top: at.y }} role="tooltip">
      <b style={{ color: cityInfo(world, index).color }}>{cityInfo(world, index).name}</b>
      <small>Taç krallığı, başkent {cityInfo(world, index).capital} · güvenli bölge</small>
      <em>tıkla</em>
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
          <small>
            Başkent {info.capital} · taç krallığı{distance !== null && ` · ${distance} karo uzakta`}
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
            <b>{info.ruler}</b>
            <small className="hint">
              {info.capital} şehrinden hüküm sürer; lordlar ona biat eder. Surlarının çevresi güvenli bölgedir: {balance.cities.safeTiles} karo içinde muharebe olmaz. Ordular
              yakınında handaki gibi moral toplar.
            </small>
          </div>
        </div>
        <Section title="Şehrin ödediği fiyat" icon="gold" aside={`lobi fiyatı +%${Math.round((balance.cities.trade.priceFactor - 1) * 100)}`}>
          <div className="price-row">
            {GOODS.map((g) => (
              <span key={g} className="price" title={RESOURCE_NAMES[g]}>
                <Icon name={RESOURCE_ICONS[g]} size={16} />
                <b>{price(cityPrice(g, market, now))}</b>
                <small>lobide {price(priceAt(market, g, now))}</small>
              </span>
            ))}
          </div>
          <p className="hint">Tüccarın buraya seferde {loadFactor} kat yük getirir; satış lobinin fiyatlarını etkilemez.</p>
        </Section>
        {kingdom && <CrownStanding world={world} index={index} kingdom={kingdom} />}
        <CrownRivalry world={world} online={online} />
        {kingdom && <Stewardship world={world} kingdom={kingdom} now={now} />}
        {kingdom && <Fealty world={world} kingdom={kingdom} now={now} only={index} onSwear={onSwear} />}
        {kingdom && (
          <Section title="Tüccarın" icon="trade">
            {here ? (
              <>
                <p className="hint">Tüccarın şu an bu şehre gidip geliyor ({trip ? seconds(trip) : '?'} sn sefer).</p>
                <button className="btn small" disabled={wait > 0} onClick={() => onCity(null)}>
                  {wait > 0 ? `${wait} sn sonra` : 'Lobi pazarına dön'}
                </button>
              </>
            ) : trip ? (
              <>
                <p className="hint">Ticaret noktandan sefer {seconds(trip)} sn sürer.</p>
                <button className="btn small" disabled={wait > 0} onClick={() => onCity(index)}>
                  {wait > 0 ? `${wait} sn sonra` : 'Tüccarı buraya gönder'}
                </button>
              </>
            ) : (
              <p className="hint">Önce bir ticaret noktan olmalı.</p>
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
      <Section title="Bağlılık" icon="crown" aside="sezon boyunca">
        <button className="liege-button" style={{ borderColor: liege.color }} onClick={() => onOpen(kingdom.liege!)}>
          <CrownBanner world={world} liege={kingdom.liege} size={28} />
          <span>
            <b style={{ color: liege.color }}>{liege.name.toLocaleUpperCase('tr-TR')}</b>
            <small>
              Lordu olduğun taç · hükümdar {liege.ruler} · ilişkin {Math.round(crownRelation(kingdom, kingdom.liege))}
            </small>
          </span>
          <Icon name="pin" size={16} />
        </button>
      </Section>
    )
    if (only !== undefined && only !== kingdom.liege) return (
      <Section title="Bağlılık" icon="crown">
        <p className="hint">
          Sen <b style={{ color: liege.color }}>{liege.name}</b> lordusun; bu tacın lordu değilsin.
        </p>
      </Section>
    )
    return (
      <Section title="Bağlılık" icon="crown" aside="sezon boyunca">
        <p className="hint">
          <b style={{ color: liege.color }}>{liege.name}</b> lordusun. Hükümdarın {liege.ruler}, başkentin {liege.capital}.
        </p>
      </Section>
    )
  }
  const crowns = world.cities.map((_, index) => index).filter((index) => only === undefined || index === only)
  // The crowns take notice of a lord once it has grown a little (they are introduced then).
  if (!fealtyOpen(kingdom, now)) return (
    <Section title="Bağlılık" icon="crown" aside="şu an uygun değil">
      <p className="hint">
        Taç krallıkları henüz seninle ilgilenmiyor. Lordluğunu biraz büyüt: {doneBuildings(kingdom, now)} / {balance.cities.crown.intro.buildings} yapı. O zaman iki taç sana
        kendini tanıtacak ve tarafını seçeceksin.
      </p>
    </Section>
  )
  return (
    <Section title="Bağlılık" icon="crown" aside="henüz biat etmedin">
      <p className="hint">
        Haritadaki iki şehir, iki taç krallığının başkentidir. Birine biat edip lordu olursun; biat sezon boyunca değişmez. Başlamak için gerekmez, ama sarayı{' '}
        {level}. seviyeye yükseltmek için biat şarttır.
      </p>
      <div className={crowns.length === 1 ? 'goods two' : 'goods'} role="group" aria-label="Taç krallıkları">
        {crowns.map((index) => {
          const info = cityInfo(world, index)
          const middle = cityCenter(world.cities[index])
          const distance = Math.round(Math.hypot(middle.x - kingdom.site.x, middle.y - kingdom.site.y))
          return (
            <div key={index} className="good">
              <Icon name="crown" size={24} />
              <b style={{ color: info.color }}>{info.name}</b>
              <small>{info.ruler}</small>
              <small>başkent {info.capital} · {distance} karo</small>
              {asking === index ? (
                <span className="row">
                  <button className="btn small" onClick={() => onSwear(index)}>
                    Eminim, biat et
                  </button>
                  <button className="btn small" onClick={() => setAsking(null)}>
                    Vazgeç
                  </button>
                </span>
              ) : (
                <button className="btn small" onClick={() => setAsking(index)}>
                  Biat et
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
    <svg className="crown-banner" width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={`${info.name} lordu`}>
      <title>{`${info.name} lordu`}</title>
      <rect x="1" y="1" width="1.6" height="13" fill="#2a1c10" />
      <path d="M2.6 1.5 H13 L10.4 4.5 L13 7.5 H2.6 Z" fill={info.color} stroke="#120d0b" strokeWidth="0.8" />
    </svg>
  )
}

// ---- The crowns' politics (CLAUDE.md §7.8) -------------------------------------------------------------------------

const signedInt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))}`
const signedDec = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`

// How a crown stands with the lord: the relation, where it drifts back to, what moves it, and the gifts its patrols
// bring at each step.
function CrownStanding({ world, index, kingdom }: { world: World; index: number; kingdom: Kingdom }) {
  const info = cityInfo(world, index)
  const relation = crownRelation(kingdom, index)
  const rest = crownRest(kingdom, index)
  const r = balance.cities.crown.relation
  const sworn = kingdom.liege === index
  const gift = giftAt(relation)
  return (
    <Section title="Seninle ilişkisi" icon="happy" aside={signedInt(relation)}>
      <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={`${info.name} ile ilişki`} segments={20} />
      <p className="hint">
        Zamanla {signedInt(rest)} düzeyine döner ({sworn ? 'kendi tacın sana sıcak bakar' : kingdom.liege !== undefined ? 'rakip taç sana soğuk bakar' : 'henüz kimseye biat etmedin'}).
        İlişkiyi artıranlar: tüccarını {info.capital} şehrine göndermek (her sefer {signedDec(r.cityTrip)}), devriyesini ağırlamak ({signedInt(r.visit)}), istediği haracı
        ödemek ({signedInt(r.tributePaid)}). Azaltanlar: haracı reddetmek ({signedInt(r.tributeRefused)}). Cevapsız kalan haraç kendiliğinden ödenir (oyundaysan fazlasıyla); ilişkiyi bozmaz.
      </p>
      <ul className="tiers">
        {balance.cities.crown.gifts.map((g) => (
          <li key={g.at} className={relation >= g.at ? 'on' : undefined}>
            <Icon name="chest" size={16} />
            <span>
              <b>{g.name}</b> · ilişki {g.at}+
            </span>
            <small>
              {fmt(g.gold)} altın{Object.entries(g.goods).map(([good, v]) => `, ${fmt(v as number)} ${RESOURCE_NAMES[good as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join('')}
            </small>
          </li>
        ))}
      </ul>
      <p className="hint">
        {sworn
          ? gift
            ? `Devriyesi sana her uğradığında «${gift.name}» getirir (tacın gücüyle artar ya da azalır).`
            : `İlişkin ${balance.cities.crown.gifts[0].at}'a ulaşınca devriyesi sana armağan getirmeye başlar.`
          : `Rakip tacın haraççıları ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelip hazinenin %${Math.round(balance.cities.crown.patrol.tribute.share * 100)}'ini ister; armağan getirmezler.`}
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
    <Section title="Taçların gücü" icon="banner" aside={share.map((v) => `%${Math.round(v * 100)}`).join(' · ')}>
      <div className="rivalry">
        <svg viewBox="0 0 100 100" className="pie" role="img" aria-label={infos.map((info, i) => `${info.name} %${Math.round(share[i] * 100)}`).join(', ')}>
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
                  güç {fmt(power[i])} · {mine.length} lord
                </small>
                <ul>
                  {mine.map((l) => (
                    <li key={l.id}>
                      <span>{l.name}</span>
                      <i style={{ width: `${(l.score / top) * 100}%`, background: info.color }} />
                      <small>{fmt(l.score)}</small>
                    </li>
                  ))}
                  {mine.length === 0 && <li className="hint">Henüz lordu yok</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
      <p className="hint">
        Bir tacın gücü kendi {fmt(p.base)} puanı ile ona bağlı lordların puanlarının toplamıdır; lordları geliştikçe tacı güçlenir. Güçlü taç kendi lordlarına daha
        cömerttir (bahşiş ve armağanlar ×{byPower(1, p.favour).toFixed(1).replace('.', ',')}'e kadar). {unsworn > 0 && `${unsworn} lord henüz taraf seçmedi.`}
      </p>
      <p className="hint">
        Şimdi:{' '}
        {infos.map((info, i) => `${info.name} bahşiş/armağan ×${byPower(share[i], p.favour).toFixed(2).replace('.', ',')}`).join(' · ')}
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
    <Section title="Taçların pazarı" icon="trade" aside={`${minutes} dk sonra değişir`}>
      <ul className="tiers">
        {goods.map((good, i) => {
          const info = cityInfo(world, i)
          const f = stewardFactor(kingdom, good, now)
          const relation = crownRelation(kingdom, i)
          return (
            <li key={i} className={f >= 1 ? 'on' : 'off'}>
              <Icon name={RESOURCE_ICONS[good]} size={16} />
              <span>
                <b style={{ color: info.color }}>{info.name}</b> {RESOURCE_NAMES[good].toLowerCase()} ticaretini yönetiyor
              </span>
              <small>
                {relation <= s.refuseBelow
                  ? `tüccarları senden almıyor: fiyatın %${Math.round((1 - f) * 100)} düşük`
                  : `ilişkin ${signedInt(relation)} → satış fiyatın ${f >= 1 ? '+' : '−'}%${Math.round(Math.abs(f - 1) * 100)}`}
              </small>
            </li>
          )
        })}
      </ul>
      <p className="hint">
        Her taç dönem dönem bir malın ticaretini yönetir. O malı sattığında (lobi pazarında da, şehirde de) fiyatın taçla ilişkine göre değişir: en çok %
        {Math.round(s.bonus * 100)} fazla ya da %{Math.round(s.penalty * 100)} az; ilişkin {s.refuseBelow}'nin altındaysa o tacın tüccarları seninle alışveriş etmez ve
        fiyatın yarıya düşer.
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
    <Section title="Taç siparişleri" icon="scroll" aside="saatte bir yenilenir">
      <ul className="order-cards">
        {world.cities.map((city, crown) => {
          const info = cityInfo(world, crown)
          const order = crownOrder(kingdom.lobbyKey, crown, now)
          const why = crownOrderError(kingdom, crown, now, world.cities.length, palace)
          const pay = orderPay(kingdom, order, online?.market, now)
          const trip = cityTripMs(kingdom, city)
          const have = Math.floor(kingdom.stock[order.good])
          const text =
            why === 'done' ? 'Bu saatin siparişi gönderildi' : why === 'have' ? `Depoda ${fmt(have)} / ${fmt(order.units)} var` : why === 'relation' ? 'Taç seninle alışveriş etmiyor' : why === 'locked' ? `${o.minPalace}. seviye saray gerekir` : !trip ? 'Ticaret noktası yok' : 'Kervanla gönder'
          return (
            <li key={crown} className="order-card">
              <Icon name={RESOURCE_ICONS[order.good]} size={24} />
              <div className="order-body">
                <b style={{ color: info.color }}>{info.name}</b>
                <span>
                  {fmt(order.units)} {RESOURCE_NAMES[order.good].toLowerCase()} istiyor
                </span>
                <span className="order-meta">
                  <span>
                    <Icon name="gold" size={16} /> {fmt(pay)} altın
                  </span>
                  <span>
                    <Icon name="time" size={16} /> sefer {trip ? `${seconds(trip)} sn` : '—'}
                  </span>
                  <span>{Math.ceil((order.endsAt - now) / 60_000)} dk kaldı</span>
                </span>
              </div>
              <button className="btn small order-send" disabled={!!why || !trip || !online} onClick={() => online?.act({ type: 'order', crown })}>
                {text}
              </button>
            </li>
          )
        })}
      </ul>
      {trips.length > 0 && (
        <ul className="order-trips" aria-label="Yoldaki kervanlar">
          {trips.map((t) => (
            <li key={`${t.crown}:${t.leftAt}`}>
              <Icon name="trade" size={16} />
              <span>
                {fmt(t.units)} {RESOURCE_NAMES[t.good].toLowerCase()} → {cityInfo(world, t.crown).capital} · {fmt(t.gold)} altın
              </span>
              <Meter value={Math.max(0, Math.min(1, (now - t.leftAt) / (t.arriveAt - t.leftAt)))} label="Kervan" segments={10} />
              <small>{seconds(t.arriveAt - now)} sn</small>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Mallar depondan hemen çıkar ve kervanla tacın başkentine gider; ödeme kervan dönünce gelir (sefer, tüccarın o şehre gidip dönmesi kadar sürer). Taç malı gönderdiğin andaki lobi fiyatının %
        {Math.round((o.payFactor - 1) * 100)} fazlasına alır (biat ettiğin taç %{Math.round(o.swornBonus * 100)} daha fazla öder), ilişkiniz iyileşir. Satış lobi fiyatlarına dokunmaz. Kervan dönerken hazine doluysa sığmayan altın boşa gider.
      </p>
    </Section>
  )
}

// The crowns as the diplomacy tab shows them (Diplomasi → Krallık; CLAUDE.md §7.8): each crown's ruler and its
// standing with the lord, its policies of the moment (what it buys at the lobby's market, the good it watches over,
// its order of the hour, its patrols and tribute), the task it asks of the lord this hour, and the struggle for power
// between the two.
export const QUEST_TITLES: Record<QuestKind, string> = { trade: 'Ticari üstünlük', town: 'Kasaba ele geçir', order: 'Siparişimizi gönder', army: 'Ordunu büyüt' }

function questText(kind: QuestKind, units: number | undefined, good: string | undefined, need: number) {
  switch (kind) {
    case 'trade':
      return `Bu saat tüccarın ${fmt(units ?? 0)} birim ${good} satsın: pazarda sözümüz geçsin.`
    case 'town':
      return 'Bu saat bir kasabayı ele geçir ya da kuşatıp al.'
    case 'order':
      return 'Bu saatin siparişini (yukarıda; Ticaret → Siparişler) kervanla başkente gönder.'
    case 'army':
      return `Garnizonun ve sahadaki ordularınla en az ${fmt(need)} askere ulaş.`
  }
}

const QUEST_WHY: Record<string, string> = {
  locked: `${balance.cities.crown.quests.minPalace}. seviye saray gerekir`,
  relation: 'İlişkiniz çok kötü: bu taç senden bir şey istemez',
  notYet: 'Henüz tamamlanmadı',
  done: 'Ödülü aldın',
}

export function CrownsPanel({ world, kingdom, online, market, now }: { world: World; kingdom: Kingdom; online: Online; market?: Market | null; now: number }) {
  if (world.cities.length === 0) return <p className="hint">Bu lobide taç krallığı yok.</p>
  const demand = crownDemand(now)
  const { goods, endsAt } = crownGoods(kingdom.lobbyKey, now)
  const crowns = world.cities.length
  const palace = palaceLevel(kingdom, now)
  const q = balance.cities.crown.quests
  const tribute = balance.cities.crown.patrol.tribute
  const minutes = (ms: number) => `${Math.max(1, Math.ceil(ms / 60_000))} dk`
  const goldRoom = goldCap(kingdom, now) - kingdom.stock.gold
  return (
    <>
      {world.cities.map((_, i) => {
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
          <Section key={i} title={info.name} icon="crown" aside={sworn ? 'biat ettiğin taç' : `ilişki ${signedInt(Math.round(relation))}`}>
            <div className="feature">
              <Icon name="crown" size={32} />
              <div>
                <b style={{ color: info.color }}>{info.ruler}</b>
                <small className="hint">
                  {info.capital} şehrinden hüküm sürer. {sworn ? 'Sen onun lordusun.' : kingdom.liege !== undefined && kingdom.liege !== null ? 'Rakip tacın lordusun; sana soğuk bakar.' : 'Henüz kimseye biat etmedin.'}
                </small>
              </div>
            </div>
            <Meter value={(relation + 100) / 200} tone={relation >= 30 ? 'up' : relation <= -30 ? 'down' : 'gold'} label={`${info.name} ile ilişki`} segments={20} />
            <b className="crown-sub">Politikaları</b>
            <Stat label="Pazardan alıyor" value={goodName(buys.good)} note={`dakikada ${fmt(buys.perMinute)} birim, ucuzken · ${minutes(buys.until - now)} daha`} />
            <Stat label="Yönettiği mal" value={goodName(goods[i])} note={`satarken senin fiyatın ×${price(stewardFactor(kingdom, goods[i], now))} · ${minutes(endsAt - now)} daha`} />
            <Stat
              label="Siparişi"
              value={`${fmt(order.units)} ${goodName(order.good)}`}
              note={`${fmt(orderPay(kingdom, order, market, now))} altın öder${orderSent ? ' · gönderdin' : ''} · Ticaret → Siparişler · ${minutes(order.endsAt - now)} daha`}
            />
            <Stat
              label="Devriye ve haraç"
              value={sworn ? 'devriye' : kingdom.liege !== undefined && kingdom.liege !== null ? 'haraççı' : 'gelmez'}
              note={
                sworn
                  ? 'devriyesi eğlence merkezine uğrar, bahşiş bırakır'
                  : kingdom.liege !== undefined && kingdom.liege !== null
                    ? `${Math.round(tribute.everySeconds / 60)} dakikada bir hazinenin %${Math.round(tribute.share * 100)}'ini ister`
                    : 'biat etmediğin için ne devriye ne haraççı gönderir'
              }
            />
            <b className="crown-sub">Senden istediği · {QUEST_TITLES[quest.kind]}</b>
            <p className="hint">{questText(quest.kind, quest.units, quest.good && goodName(quest.good), need)}</p>
            {taken && <Meter value={need ? Math.min(1, have / need) : 1} tone={have >= need ? 'up' : 'gold'} label="Görevin ilerlemesi" segments={10} />}
            <p className="hint">
              {taken ? `${fmt(Math.min(have, need))} / ${fmt(need)} · ` : ''}Ödül: {fmt(quest.gold)} altın ve ilişki +{sworn ? q.relation.own : q.relation.other} · {minutes(quest.endsAt - now)} kaldı
            </p>
            {taken && !claim && goldRoom < quest.gold && (
              <p className="hint down">Hazinende {fmt(Math.max(0, goldRoom))} altınlık yer var: ödülün kalanı boşa gider. Önce biraz harca.</p>
            )}
            {!taken ? (
              <button className="btn small" disabled={!!take} title={take ? QUEST_WHY[take] : undefined} onClick={() => online.act({ type: 'quest', crown: i, action: 'take' })}>
                <Icon name="scroll" size={16} /> {take ? QUEST_WHY[take] ?? 'Alınamaz' : 'Görevi al'}
              </button>
            ) : (
              <button className={claim ? 'btn small' : 'btn small primary'} disabled={!!claim} onClick={() => online.act({ type: 'quest', crown: i, action: 'claim' })}>
                <Icon name="chest" size={16} /> {claim ? QUEST_WHY[claim] ?? 'Alınamaz' : 'Ödülü al'}
              </button>
            )}
          </Section>
        )
      })}
      <CrownRivalry world={world} online={online} />
      <Stewardship world={world} kingdom={kingdom} now={now} />
    </>
  )
}
