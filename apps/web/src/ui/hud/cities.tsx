import { GOODS, balance, cityCenter, cityPrice, cityTripMs, priceAt, tradeCityReadyAt, tradeUnits } from '@game/shared'
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
          <small>{balance.economy.trade.tripSeconds} sn sefer</small>
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
      <b>{cityInfo(world, index).name}</b>
      <small>Serbest şehir · güvenli bölge</small>
      <em>tıkla</em>
    </div>
  )
}

// A free city's sheet: who rules it, what it buys, and sending the merchant there.
export function CitySheet({ world, index, kingdom, market, now, onCity, onShow, onClose }: {
  world: World
  index: number
  kingdom: Kingdom | null
  market?: Market | null
  now: number
  onCity(city: number | null): void
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
          <h2 id="city-title">{info.name}</h2>
          <small>
            Serbest şehir · tarafsız{distance !== null && ` · ${distance} karo uzakta`}
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
              Hiçbir krallığa bağlı değildir. Surlarının çevresi güvenli bölgedir: {balance.cities.safeTiles} karo içinde muharebe olmaz. Ordular
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
