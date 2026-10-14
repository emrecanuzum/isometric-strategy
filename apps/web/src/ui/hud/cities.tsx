import { useState } from 'react'
import { GOODS, balance, cityCenter, cityPrice, cityTripMs, lobbyTripMs, priceAt, tradeCityReadyAt, tradeUnits } from '@game/shared'
import type { Kingdom, Market, Point, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { RESOURCE_ICONS, RESOURCE_NAMES } from '../names'
import { Section } from './primitives'

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
        Serbest şehir {loadFactor} kat yük alır ve lobinin o anki fiyatının %{premium} fazlasını öder; lobinin fiyatlarını düşürmez. Ama yol uzundur: sefer şehrin uzaklığıyla uzar.
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
export function CitySheet({ world, index, kingdom, market, now, onCity, onSwear, onShow, onClose }: {
  world: World
  index: number
  kingdom: Kingdom | null
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
        {kingdom && <Fealty world={world} kingdom={kingdom} only={index} onSwear={onSwear} />}
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
export function Fealty({ world, kingdom, only, onSwear }: { world: World; kingdom: Kingdom; only?: number; onSwear(city: number): void }) {
  const [asking, setAsking] = useState<number | null>(null)
  if (world.cities.length === 0) return null
  const level = balance.cities.crown.requiredForPalaceLevel
  if (kingdom.liege !== undefined && world.cities[kingdom.liege]) {
    const liege = cityInfo(world, kingdom.liege)
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
