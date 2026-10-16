import {
  BUILDABLE,
  BUILDINGS,
  WEAPONS,
  affordable,
  TAX_LEVELS,
  armoryOf,
  armoryCap,
  balance,
  capOf,
  storageCap,
  goldCap,
  tradeReserve,
  atFloor,
  basePrice,
  crownAppetite,
  crownDemand,
  crownOrderError,
  idleFactor,
  plannedHousing,
  palaceLevel,
  ofAge,
  buildingCount,
  cutOff,
  imprisoned,
  isFree,
  buyCost,
  buyError,
  fortuneEffects,
  happinessFor,
  isNightAt,
  maxConstructions,
  researchEffects,
  sermonTaxFactor,
  ledger,
  workRate,
  priceAt,
  queenError,
  queenOwed,
  repairCost,
  buildError,
  constructing,
  population,
  roundOutcome,
  tradeRepairCost,
  tradeLoad,
  tradePrice,
  tradeTripMs,
  tradeTripsPerRound,
  tradeUnits,
  tradeCapacity,
  tradeAmountReadyAt,
  tradeUpgradeCost,
  upgradeError,
  upgradeSpec,
  calendarAt,
  seasonOf,
  seasonFactor,
  expeditionsOut,
} from '@game/shared'
import { TradeShares } from './inns'
import { CrownBanner, Fealty, TradeDestination, CrownOrders } from './cities'
import { cityInfo } from '../../game/cities'
import type { BuildingKind, Expedition, Good, Kingdom, Market, Plot, Point, Resource, Stock, TaxLevel, Town, World } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import { STRUCTURE_SPRITES, palaceIn } from '../../game/buildingSprites'
import { Icon } from '../icons'
import { BUILDING_NAMES, BUILDING_NOTES, RESOURCE_ICONS, RESOURCE_NAMES, SEASON_NAMES, WEAPON_ICONS, WEAPON_NAMES, dateText } from '../names'
import { CostList, GoodChoice, Missing } from '../panels'
import type { Journal } from './journal'
import { DynastySection } from './dynasty'
import type { Online } from './online'
import { REPORT_ROUNDS, isImportant, unreadImportant } from './journal'
import { FortuneNote, HospitalPanel, Sickness, TemplePanel } from './institutions'
import { PopulationPanel } from './population'
import { ExpeditionReport, ExpeditionsPanel, GoalTitle, GoalsPanel, StewardSection } from './expeditions'
import { IncomeSection, SeasonBooks } from './treasury'
import { History, Meter, Placeholder, Section, SpriteView, Stat, fmt, signed, times } from './primitives'
import { Subtabs, showPart, usePart } from './Subtabs'

export const RESOURCES: Resource[] = ['gold', 'food', 'materials', 'arms']

// Everything the tabs read and the commands they can give.
export interface HudData {
  world: World
  kingdom: Kingdom
  now: number
  journal: Journal
  stage: number
  plots: { dock: Plot | null; trade: Plot | null } | null
  muted: boolean
  confirmReset: boolean
  onPlace(kind: BuildingKind): void
  onGood(good: Good | null): void
  // Units the merchant takes on each trip (see TradeAmount).
  onTradeAmount(units: number): void
  onUpgrade(): void
  // Raises a building a level (the palace's level sets the territory's size).
  onUpgradeBuilding(id: number): void
  onMute(): void
  onReset(): void
  // Back to the main menu.
  onExit(): void
  onShow(tile: Point): void
  // The journal's important entries were looked at.
  onImportantRead?(): void
  // The lobby: other kingdoms, diplomacy, spies, armies (absent before the lobby has loaded).
  online?: Online
  // The lobby's towns and who holds them (CLAUDE.md §8.4).
  towns?: Town[]
}

const center = (b: { x: number; y: number; size: number }): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
const thumb = (kind: BuildingKind, color?: string) => (kind === 'palace' ? palaceIn(color) : STRUCTURE_SPRITES[kind][0])

// Per production round: what buildings add, what villagers eat and what the merchant takes away.
export function flows(kingdom: Kingdom, now: number, market?: Market | null) {
  const { delta: round, worked } = roundOutcome(kingdom, now)
  const { villagers } = population(kingdom, now)
  const l = ledger(kingdom, now)
  const eaten = villagers * balance.economy.foodPerVillager + l.soldiersFood
  const trips = tradeTripsPerRound(kingdom)
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost')
  const walledIn = !!post && cutOff(kingdom.buildings, kingdom.site, now).has(post.id)
  // The merchant sells what the stores hold: a full load each trip, or less when the good runs short (then about what
  // is made of it each round).
  const good = kingdom.trade.good
  // A full treasury keeps the merchant home (economy.ts, advance).
  const full = goldCap(kingdom, now) - kingdom.stock.gold < 1
  const sold = good && !walledIn && !kingdom.trade.damaged && !full ? Math.max(0, Math.min(tradeLoad(kingdom) * trips, Math.floor(kingdom.stock[good] - tradeReserve(kingdom, good, now)) + Math.max(0, round[good] ?? 0))) : 0
  const bonus = 1 + researchEffects(kingdom, now).trade + fortuneEffects(kingdom, now).trade
  // At the lobby's price as it stands (or the free city's), and less for a ruler long away, as the merchant is paid.
  const tradeGold = good ? sold * tradePrice(kingdom, good, market, now) * bonus * idleFactor(kingdom, now) : 0
  const tributesOut = -l.tributes.filter((t) => t.gold < 0).reduce((a, t) => a + t.gold, 0)
  const result = {} as Record<Resource, { made: number; used: number; net: number; wasted: number }> & { tradeGold: number; sold: number; tax: number; worked: Partial<Stock> }
  for (const r of RESOURCES) {
    // The forges' raw goods are shown going out, not taken off what comes in.
    const made = r === 'gold' ? (round.gold ?? 0) + l.soldiersGold + tributesOut + tradeGold : (round[r] ?? 0) + (r === 'food' ? eaten : 0) + (worked[r] ?? 0)
    const used = (worked[r] ?? 0) + (r === 'food' ? eaten : 0) + (r === kingdom.trade.good ? sold : 0) + (r === 'gold' ? l.soldiersGold + tributesOut : 0)
    // What does not fit in the stores (or the treasury) is lost, so a full store gains nothing.
    const room = Math.max(0, (r === 'gold' ? goldCap(kingdom, now) : storageCap(kingdom, now)) - kingdom.stock[r])
    const net = made - used
    result[r] = { made, used, net: Math.min(net, room), wasted: Math.max(0, net - room) }
  }
  result.tradeGold = tradeGold
  result.sold = sold
  result.tax = l.tax
  result.worked = worked
  return result
}

// ---- İnşa -----------------------------------------------------------------------------------------------------------

// Why a building cannot be started right now, in a few words.
const BLOCKED: Record<string, string> = {
  palace: 'Önce saray',
  cost: 'Kaynak yetersiz',
  queue: 'Kuyruk dolu',
  unique: 'Zaten var ya da arsa yok',
  spot: 'Yer yok',
  locked: '2. seviye saray',
  limit: 'Sınır dolu: sarayı yükselt',
}

export function BuildTab({ world, kingdom, now, stage, onPlace }: HudData) {
  const list = constructing(kingdom, now)
  const slots = maxConstructions(kingdom, now)
  // Buildings by the palace level that opens them; the tab of the palace's own level first.
  const level = Math.max(1, palaceLevel(kingdom, now))
  const tiers = balance.territory.stageParcels.length
  const [tier, setTier] = useState(Math.min(tiers, level))
  const shown = BUILDABLE.filter((kind) => (BUILDINGS[kind].requiresPalace ?? 1) === tier)
  // What a level raises besides: the caps of buildings already open.
  const raised = BUILDABLE.flatMap((kind) => {
    const caps = BUILDINGS[kind].maxByPalaceLevel
    return caps && tier > 1 && caps[tier - 1] > caps[tier - 2] ? [`${BUILDING_NAMES[kind]} ${caps[tier - 2]} → ${caps[tier - 1]}`] : []
  })
  return (
    <>
      <Section title="İnşaat kuyruğu" icon="time" aside={`${list.length}/${slots} usta`}>
        {list.length === 0 ? (
          <p className="hint">Ustalar boşta. Aşağıdan bir yapı seç, sonra haritada hududun içine yerleştir.</p>
        ) : (
          <ul className="queue-list">
            {list.map((b) => {
              const total = (BUILDINGS[b.kind].buildSeconds ?? 1) * 1000
              const left = b.doneAt - now
              return (
                <li key={b.id}>
                  <span>{BUILDING_NAMES[b.kind]}</span>
                  <Meter value={1 - left / total} label={`${BUILDING_NAMES[b.kind]} ilerleme`} segments={10} />
                  <small>{Math.ceil(left / 1000)} sn</small>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Section title="Yapılar" icon="build">
        <div className="tier-tabs" role="tablist" aria-label="Saray seviyesi">
          {Array.from({ length: tiers }, (_, i) => i + 1).map((t) => (
            <button key={t} className="btn small" role="tab" aria-selected={tier === t} aria-pressed={tier === t} onClick={() => setTier(t)} title={t > level ? `${t}. seviye saray gerekir` : undefined}>
              {t > level && <Icon name="lock" size={8} />}
              {t}. sv.
            </button>
          ))}
        </div>
        {tier > level && <p className="hint">Bu yapılar için sarayı {tier}. seviyeye yükselt.</p>}
        {raised.length > 0 && <p className="hint">Bu seviyede sınırı artanlar: {raised.join(' · ')}.</p>}
        {shown.length === 0 && <p className="hint">Bu seviyede açılan yeni yapı yok.</p>}
        <ul className="cards">
          {shown.map((kind) => {
            const spec = BUILDINGS[kind]
            const error = buildError(world, kingdom, stage, kind, null, now)
            const effect = spec.produces
              ? `+${(spec.amount! * kingdom.yields[spec.produces]).toFixed(1).replace('.', ',')} ${RESOURCE_NAMES[spec.produces].toLowerCase()} / tur`
              : spec.villagers
                ? `+${spec.villagers} köylü`
                : spec.workers
                  ? `${spec.workers} işçi çalıştırır`
                  : null
            const why = error === 'locked' ? `${spec.requiresPalace ?? 1}. seviye saray` : error ? (BLOCKED[error] ?? 'Şu an olmaz') : null
            return (
              <li key={kind}>
                <button className="card" disabled={why !== null} onClick={() => onPlace(kind)} aria-describedby={`why-${kind}`}>
                  <span className="card-art">
                    <SpriteView sprite={thumb(kind)} scale={spec.size > 1 ? 0.5 : 1} />
                  </span>
                  <span className="card-body">
                    <b>{BUILDING_NAMES[kind] ?? kind}</b>
                    {BUILDING_NOTES[kind] && <small>{BUILDING_NOTES[kind]}</small>}
                    {effect && <small className="up">{effect}</small>}
                    {spec.villagers ? (
                      <small>
                        Barınak {plannedHousing(kingdom)} / {population(kingdom, now).cap} (nüfus sınırı saray seviyesiyle artar)
                      </small>
                    ) : (
                      capOf(kingdom, kind, now) !== null && (
                        <small className={buildingCount(kingdom, kind) >= capOf(kingdom, kind, now)! ? 'down' : undefined}>
                          {buildingCount(kingdom, kind)} / {capOf(kingdom, kind, now)} kurulu
                          {BUILDINGS[kind].maxByPalaceLevel ? ' (sınır saray seviyesiyle artar)' : ''}
                        </small>
                      )
                    )}
                    <span className="card-meta">
                      {isFree(kingdom, kind) ? <span className="chip up">İlki ücretsiz</span> : <CostList cost={spec.cost} stock={kingdom.stock} />}
                      <span className="chip">
                        <Icon name="time" size={8} /> {spec.buildSeconds} sn
                      </span>
                      <span className="chip">
                        {spec.size}×{spec.size}
                      </span>
                    </span>
                    {why && (
                      <small id={`why-${kind}`} className="down">
                        {why}
                      </small>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Section>
    </>
  )
}

// ---- Depo -----------------------------------------------------------------------------------------------------------

// The storehouse tab in parts: the goods and how they flow, the gold's books, the armoury.
type StorePart = 'goods' | 'books' | 'armory'
const STORE_PARTS: StorePart[] = ['goods', 'books', 'armory']

export function StoreTab({ kingdom, now, journal, online }: HudData) {
  const [part, setPart] = usePart('store', STORE_PARTS, 'goods')
  const flow = flows(kingdom, now, online?.market)
  const armory = armoryOf(kingdom)
  const { weapons } = roundOutcome(kingdom, now)
  const cap = storageCap(kingdom, now)
  const room = (r: Resource) => (r === 'gold' ? goldCap(kingdom, now) : cap)
  const full = RESOURCES.some((r) => kingdom.stock[r] >= room(r))
  const armsRoom = armoryCap(kingdom, now)
  const armsFull = WEAPONS.some((w) => armory[w] >= armsRoom)
  return (
    <>
      <Subtabs
        label="Depo"
        part={part}
        onPart={setPart}
        parts={[
          { id: 'goods', name: 'Mallar', icon: 'chest', dot: full },
          { id: 'books', name: 'Hazine', icon: 'gold' },
          { id: 'armory', name: 'Cephanelik', icon: 'arms', dot: armsFull },
        ]}
      />
      {part === 'books' && (
        <>
          <IncomeSection kingdom={kingdom} now={now} online={online} />
          <SeasonBooks kingdom={kingdom} />
        </>
      )}
      {part === 'armory' && (
        <Section title="Cephanelik" icon="arms" aside={`her silahtan en çok ${fmt(armsRoom)}`}>
          <div className="armory">
            {WEAPONS.map((w) => (
              <div key={w} className={armory[w] >= armsRoom ? 'slot full' : 'slot'}>
                <Icon name={WEAPON_ICONS[w]} size={24} />
                <b className={armory[w] >= armsRoom ? 'down' : undefined}>
                  {fmt(armory[w])} / {fmt(armsRoom)}
                </b>
                <small>{WEAPON_NAMES[w]}</small>
                <Meter value={Math.min(1, armory[w] / armsRoom)} tone={armory[w] >= armsRoom ? 'down' : 'gold'} label={`${WEAPON_NAMES[w]} yeri`} segments={8} />
                {armory[w] >= armsRoom ? <small className="down">Dolu: atölye durdu</small> : (weapons[w] ?? 0) > 0.05 && <small className="up">{signed(weapons[w]!)} / tur</small>}
              </div>
            ))}
          </div>
          <p className="hint">
            Silah atölyesi işledikçe silahlar burada birikir; kışlada okçu ve kalkanlı piyade eğitmek için harcanır. Her silahın yeri saray seviyesiyle ve her
            ambar seviyesiyle (+{balance.economy.armory.perWarehouseLevel}) artar. Yeri dolan silahı işleyen atölye durur: hammadde harcamaz, işçileri boşta kalır.
          </p>
        </Section>
      )}
      {part === 'goods' && (
        <>
      <p className="hint">
        Her mal için depo yeri {fmt(cap)} (saray seviyesi ve ambarlarla artar); hazinede {fmt(goldCap(kingdom, now))} altın yeri var (saray seviyesi ve
        hazine binasıyla artar). Sığmayan boşa gider. Her {balance.economy.productionSeconds} saniyede bir üretim turu işler; rakamlar tur başınadır.
      </p>
      {RESOURCES.map((r) => {
        const { made, used, net } = flow[r]
        const stock = kingdom.stock[r]
        const runsOut = net < -0.01 ? Math.floor(stock / -net) : null
        const series = journal.history.map((s) => s[r])
        return (
          <article key={r} className="store-row">
            <header>
              <Icon name={RESOURCE_ICONS[r]} size={24} />
              <span>
                <b>{RESOURCE_NAMES[r]}</b>
                {r !== 'gold' && (
                  <small>
                    Arazi çarpanı {times(kingdom.yields[r as Good])}
                    {r === 'food' && seasonOf(kingdom, now) && ` · Mevsim: ${SEASON_NAMES[seasonOf(kingdom, now)!]} ${times(seasonFactor(kingdom, now, 'food'))}`}
                  </small>
                )}
              </span>
              <strong className={stock >= room(r) ? 'down' : undefined}>
                {fmt(stock)}
                <small> / {fmt(room(r))}</small>
              </strong>
            </header>
            <Meter value={stock / room(r)} tone={stock >= room(r) ? 'down' : stock >= room(r) * 0.85 ? 'gold' : 'up'} label={`${RESOURCE_NAMES[r]} deposu`} segments={20} />
            {stock >= room(r) && (
              <p className="alert">
                <Icon name="warn" size={16} />{' '}
                {r === 'gold'
                  ? 'Hazine dolu: gelen altın boşa gidiyor. Harca, hazine binası kur (4. seviye saray) ya da yükselt.'
                  : 'Depo dolu: üretilen fazlası boşa gidiyor. Ambar kur ya da yükselt, fazlasını sat.'}
              </p>
            )}
            <div className="store-flow">
              <Stat label="Gelen" value={signed(made)} tone={made > 0 ? 'up' : undefined} />
              <Stat label="Giden" value={signed(-used)} tone={used > 0 ? 'down' : undefined} />
              <Stat label="Net" value={signed(net)} tone={net > 0.01 ? 'up' : net < -0.01 ? 'down' : undefined} />
            </div>
            {series.length > 1 && <History values={series} label={`${RESOURCE_NAMES[r]} son ${series.length} tur`} />}
            {runsOut !== null && (
              <p className="alert">
                <Icon name="warn" size={16} /> Bu gidişle yaklaşık {runsOut} tur sonra tükenir.
              </p>
            )}
          </article>
        )
      })}
        </>
      )}
    </>
  )
}

// ---- Ticaret --------------------------------------------------------------------------------------------------------

// The trade tab in parts: the merchant and the post, the lobby's market, the crowns' commissions and who leads the trade.
export type TradePart = 'merchant' | 'market' | 'orders' | 'shares'
const TRADE_PARTS: TradePart[] = ['merchant', 'market', 'orders', 'shares']

export function TradeTab(data: HudData & { part?: TradePart }) {
  const [part, setPart] = usePart('trade', TRADE_PARTS, 'merchant', data.part)
  const { kingdom, now, world, online } = data
  const ordersOpen = world.cities.some((_, crown) => crownOrderError(kingdom, crown, now, world.cities.length, palaceLevel(kingdom, now)) === null)
  return (
    <>
      <Subtabs
        label="Ticaret"
        part={part}
        onPart={setPart}
        parts={[
          { id: 'merchant', name: 'Tüccar', icon: 'trade', dot: !!kingdom.trade.damaged },
          { id: 'market', name: 'Pazar', icon: 'gold' },
          ...(world.cities.length > 0 ? [{ id: 'orders' as const, name: 'Siparişler', icon: 'scroll' as const, dot: ordersOpen }] : []),
          { id: 'shares', name: 'Hâkimler', icon: 'star' },
        ]}
      />
      {part === 'merchant' && <TradePost {...data} />}
      {part === 'market' && <MarketSection {...data} />}
      {part === 'orders' && <CrownOrders world={world} kingdom={kingdom} now={now} online={online} />}
      {part === 'shares' && (online ? <TradeShares online={online} /> : <Placeholder icon="trade" title="Lobi yükleniyor" />)}
    </>
  )
}

const MARKET_GOODS: Good[] = ['food', 'materials', 'arms']

// The lobby's prices and, with a market building, buying with gold. Clicks on "buy" gather in a basket (up to
// balance.market.maxBuy units) that goes to the server as one purchase once the clicks stop or the basket is full.
const BASKET_WAIT_MS = 900

function MarketSection({ world, kingdom, now, online }: HudData) {
  const [good, setGood] = useState<Good>('food')
  const [units, setUnits] = useState(50)
  const [basket, setBasket] = useState<{ good: Good; units: number } | null>(null)
  const [sending, setSending] = useState(false)
  const basketRef = useRef(basket)
  basketRef.current = basket
  const timer = useRef(0)
  const actRef = useRef(online?.act)
  actRef.current = online?.act
  const send = async () => {
    clearTimeout(timer.current)
    const order = basketRef.current
    if (!order) return
    basketRef.current = null
    setBasket(null)
    setSending(true)
    await actRef.current?.({ type: 'buy', good: order.good, units: order.units })
    setSending(false)
  }
  // Leaving the tab sends what is in the basket.
  useEffect(() => () => void send(), [])
  if (!online) return null
  const market = online.market
  const has = kingdom.buildings.some((b) => b.kind === 'market' && b.doneAt <= now)
  const { maxBuy, buyPerClick } = balance.market
  const inBasket = basket?.good === good ? basket.units : 0
  const adding = Math.min(units, maxBuy - inBasket)
  const cost = buyCost(market, good, inBasket + adding, now) - (inBasket > 0 ? buyCost(market, good, inBasket, now) : 0)
  const why = sending || adding <= 0 ? 'busy' : buyError(kingdom, market, good, inBasket + adding, now)
  const add = () => {
    if (why) return
    // Another good in the basket goes first.
    if (basketRef.current && basketRef.current.good !== good) void send()
    const next = { good, units: inBasket + adding }
    basketRef.current = next
    setBasket(next)
    clearTimeout(timer.current)
    if (next.units >= maxBuy) void send()
    else timer.current = window.setTimeout(() => void send(), BASKET_WAIT_MS)
  }
  return (
    <Section title="Lobi fiyatları" icon="gold" aside="satış düşürür, alış artırır">
      <div className="price-row">
        {MARKET_GOODS.map((g) => {
          const price = priceAt(market, g, now)
          const base = Math.round(basePrice(g, market) * 100) / 100
          const floor = atFloor(price, g, market)
          return (
            <span key={g} className="price" title={`${RESOURCE_NAMES[g]} · olağan fiyatı ${base}${floor ? ' · en dipte' : ''}`}>
              <Icon name={RESOURCE_ICONS[g]} size={16} />
              <b className={price > base * 1.02 ? 'up' : price < base * 0.98 ? 'down' : undefined}>{price.toFixed(2).replace('.', ',')}</b>
              <small>{floor ? 'en dipte' : `olağan ${String(base).replace('.', ',')}`}</small>
            </span>
          )
        })}
      </div>
      {(market?.foodDemand ?? 1) > 1.001 && (
        <p className="hint">Dünya nüfusu yemeği pahalandırıyor: olağan fiyatı +%{Math.round(((market?.foodDemand ?? 1) - 1) * 100)}.</p>
      )}
      {MARKET_GOODS.some((g) => atFloor(priceAt(market, g, now), g, market)) && (
        <p className="hint">En dipteki malın fiyatını satış daha fazla düşürmez; zamanla ve taç krallıkları aldıkça olağan fiyatına doğru toparlanır.</p>
      )}
      <CrownBuyers world={world} market={market} now={now} />
      {has ? (
        <>
          <div className="segmented three" role="radiogroup" aria-label="Alınacak mal">
            {MARKET_GOODS.map((g) => (
              <button key={g} className="btn small" role="radio" aria-checked={good === g} onClick={() => setGood(g)}>
                <Icon name={RESOURCE_ICONS[g]} size={16} /> {RESOURCE_NAMES[g].split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="stepper">
            <button className="btn icon-only" disabled={units <= 50} onClick={() => setUnits(units - 50)} aria-label="Azalt">
              <Icon name="minus" size={16} />
            </button>
            <span className="stepper-value">
              <b>{units}</b> birim
            </span>
            <button className="btn icon-only" disabled={units >= buyPerClick} onClick={() => setUnits(Math.min(buyPerClick, units + 50))} aria-label="Artır">
              <Icon name="plus" size={16} />
            </button>
            <button className="btn small" disabled={!!why} onClick={add}>
              {cost} altına al
            </button>
          </div>
          {(basket || sending) && (
            <p className="hint">
              {basket
                ? `Sepette ${basket.units} ${RESOURCE_NAMES[basket.good].toLocaleLowerCase('tr')} (${buyCost(market, basket.good, basket.units, now)} altın, en fazla ${maxBuy}). `
                : ''}
              Fiyat güncelleniyor, lütfen bekle…
            </p>
          )}
        </>
      ) : (
        <p className="hint">Pazar binası kurarsan (2. seviye saray) altınla hammadde alabilirsin.</p>
      )}
    </Section>
  )
}

// How much the merchant takes on each trip: chosen in steps up to what the post's level allows, and changed only once in
// a while.
function TradeAmount({ kingdom, now, onTradeAmount }: HudData) {
  const { amountStep, amountCooldownSeconds } = balance.economy.trade
  const cap = tradeCapacity(kingdom)
  const current = tradeUnits(kingdom)
  const [units, setUnits] = useState(current)
  const wait = Math.max(0, Math.ceil((tradeAmountReadyAt(kingdom) - now) / 1000))
  const shown = Math.min(cap, units)
  return (
    <Section title="Sefer başına satış" icon="trade" aside={`${current} / ${cap} birim`}>
      <div className="stepper">
        <button className="btn icon-only" disabled={shown <= amountStep} onClick={() => setUnits(Math.max(amountStep, shown - amountStep))} aria-label="Azalt">
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{shown}</b> birim
        </span>
        <button className="btn icon-only" disabled={shown >= cap} onClick={() => setUnits(Math.min(cap, shown + amountStep))} aria-label="Artır">
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={shown === current || wait > 0} onClick={() => onTradeAmount(shown)}>
          {wait > 0 ? `${wait} sn sonra` : 'Uygula'}
        </button>
      </div>
      <p className="hint">
        Tüccar her seferde bu kadar götürür ({amountStep}'er birim, en fazla seviyenin sınırı {cap}). Değiştirdikten sonra {Math.round(amountCooldownSeconds / 60)} dakika
        yeniden değiştiremezsin.
      </p>
    </Section>
  )
}

function TradePost(data: HudData) {
  const { world, kingdom, now, onGood, onUpgrade, onShow, online } = data
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost')
  if (!post) return <Placeholder icon="trade" title="Ticaret noktan yok">Ticaret arsası bulunamadı.</Placeholder>
  const { trade } = kingdom
  const tripMs = tradeTripMs(kingdom)
  const progress = trade.good ? Math.min(1, (now - trade.departedAt) / tripMs) : 0
  const next = tradeUpgradeCost(kingdom)
  const nextUnits = balance.economy.trade.levels[trade.level + 1]?.units
  return (
    <>
      {trade.damaged && (
        <div className="alert">
          <p>
            <Icon name="warn" size={16} /> Ticaret noktan yağmacılarca harap edildi: onarılana kadar tüccar satış yapamaz.
          </p>
          <div className="row">
            <CostList cost={tradeRepairCost()} stock={kingdom.stock} />
            <button className="btn small" disabled={!affordable(kingdom.stock, tradeRepairCost())} onClick={() => online?.act({ type: 'repairTrade' })}>
              Onar
            </button>
          </div>
        </div>
      )}
      <Section title="Satılacak mal" icon="chest">
        <GoodChoice kingdom={kingdom} selected={trade.good} onGood={onGood} market={online?.market} now={now} />
      </Section>
      <TradeDestination world={world} kingdom={kingdom} market={online?.market} now={now} onCity={(city) => online?.act({ type: 'tradeCity', city })} />
      <div className="feature">
        <SpriteView sprite={thumb('tradePost')} scale={0.5} />
        <div>
          <b>Ticaret noktası · Seviye {trade.level + 1}</b>
          <p className="hint">
            Tüccar her {Math.round(tripMs / 1000)} saniyede {tradeLoad(kingdom)} birim mal götürüp{' '}
            {trade.city ? 'serbest şehirde lobi fiyatının biraz üstünden' : 'lobinin o anki fiyatından'} altına çevirir
            {kingdom.trade.good ? ` (şu an birimi ${tradePrice(kingdom, kingdom.trade.good, online?.market, now).toFixed(2).replace('.', ',')} altın)` : ''}.
          </p>
          <button className="btn small" onClick={() => onShow(center(post))}>
            <Icon name="pin" size={16} /> Haritada göster
          </button>
        </div>
      </div>
      {cutOff(kingdom.buildings, kingdom.site, now).has(post.id) && (
        <p className="alert">
          <Icon name="warn" size={16} /> Tüccar surların içinde kaldı: saraydan ticaret noktasına yol yok. Sura bir kapı yap.
        </p>
      )}
      {trade.good && goldCap(kingdom, now) - kingdom.stock.gold < 1 && (
        <p className="alert">
          <Icon name="gold" size={16} /> Hazine dolu: tüccar mal götürmüyor, bekliyor. Haraç, harcama ya da yeni bir hazine yer açınca yeniden satmaya başlar.
        </p>
      )}
      {trade.good && <TradeAmount {...data} />}
      {trade.good && (
        <Section title="Tüccar yolda" icon="time" aside={`${Math.max(0, Math.ceil((tripMs - (now - trade.departedAt)) / 1000))} sn`}>
          <Meter value={progress} label="Tüccarın yolculuğu" segments={16} />
        </Section>
      )}
      <Section title="Geliştir" icon="plus">
        {next ? (
          <button className="btn wide" disabled={!affordable(kingdom.stock, next)} onClick={onUpgrade}>
            <span>
              Seviye {trade.level + 2}: sefer başına {nextUnits} birim
            </span>
            <CostList cost={next} stock={kingdom.stock} />
          </button>
        ) : (
          <p className="hint">En yüksek seviyede.</p>
        )}
      </Section>
    </>
  )
}

// ---- Krallık --------------------------------------------------------------------------------------------------------

const describe = (plot: Plot | null | undefined) =>
  !plot ? 'yok' : plot.granted ? `hudut dışında, ${plot.distance} karo` : 'hudut içinde'

// The palace tab in three parts, the one last looked at remembered (in this browser).
type PalacePart = 'level' | 'house' | 'expeditions' | 'goals' | 'buildings'
const PALACE_PARTS: PalacePart[] = ['level', 'house', 'expeditions', 'goals', 'buildings']

// Opens the palace tab at a part next time (or now, if it is open): for whatever sends the player there.
export const showPalacePart = (part: PalacePart) => showPart('palace', part)

export function KingdomTab(data: HudData) {
  const { kingdom, now, stage, plots, confirmReset, onUpgradeBuilding, onMute, onReset, onExit, onShow } = data
  const palace = kingdom.buildings.find((b) => b.kind === 'palace')
  const size = balance.territory.stageParcels[stage]
  const nextSize = palace && upgradeSpec(palace) ? balance.territory.stageParcels[stage + 1] : undefined
  // Before founding the plot comes from the site; afterwards the kingdom keeps it, until a dock stands on it.
  const dock = kingdom.buildings.find((b) => b.kind === 'dock')
  const dockState = dock
    ? dock.doneAt > now
      ? 'inşa ediliyor'
      : `kuruldu (Sv. ${dock.level ?? 1})`
    : kingdom.dockPlot
      ? 'arsa hazır, kurulmadı'
      : describe(plots?.dock)
  const counts = new Map<BuildingKind, number>()
  for (const b of kingdom.buildings) if (b.doneAt <= now) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1)
  const [part, setPart] = usePart('palace', PALACE_PARTS, 'level')
  const d = kingdom.dynasty
  // The house waits on the lord: a young child still to be named, or one with no upbringing chosen.
  const houseWaits = !!d && d.children.some((c) => !ofAge(c, now) && (!c.named || (!d.council && !c.education)))
  // A party's report opened from the expeditions part (CLAUDE.md §9.9).
  const [report, setReport] = useState<Expedition | null>(null)
  const away = expeditionsOut(kingdom, now).length
  return (
    <>
      <Subtabs
        label="Saray"
        part={part}
        onPart={setPart}
        parts={[
          { id: 'level', name: 'Seviye', icon: 'home' },
          { id: 'house', name: 'Hanedan', icon: 'crown', dot: houseWaits },
          { id: 'expeditions', name: 'Seferler', icon: 'pin', count: away },
          { id: 'goals', name: 'Hedefler', icon: 'star' },
          { id: 'buildings', name: 'Yapılar', icon: 'build' },
        ]}
      />
      {part === 'level' && (
        <>
          <div className="feature">
            <SpriteView sprite={thumb('palace', kingdom.color)} scale={0.5} />
            <div>
              <b>Saray</b>
              <GoalTitle kingdom={kingdom} />
              <p className="hint">{palace ? 'Lordluğun kalbi. Lord ve kraliçe burada yaşar.' : 'Sarayın henüz yerleştirilmedi.'}</p>
              {palace && (
                <button className="btn small" onClick={() => onShow(center(palace))}>
                  <Icon name="home" size={16} /> Saraya git
                </button>
              )}
            </div>
          </div>
          <Section title="Hudut" icon="pin" aside={`${size}×${size} parsel`}>
            <ol className="stages-track" aria-label="Hudut aşamaları">
              {balance.territory.stageParcels.map((parcels, i) => (
                <li key={parcels} className={i === stage ? 'now' : i < stage ? 'past' : ''} aria-current={i === stage ? 'step' : undefined}>
                  <b>
                    {parcels}×{parcels}
                  </b>
                  <small>Saray Sv. {i + 1}</small>
                </li>
              ))}
            </ol>
            {palace && nextSize ? (
              <>
                <p className="hint">
                  Hudut sarayla büyür. Sarayı {(palace.level ?? 1) + 1}. seviyeye yükseltince hudut {nextSize}×{nextSize} parsel olur.
                </p>
                {palace.doneAt > now ? (
                  <p className="hint up">Saray yükseltiliyor: {Math.ceil((palace.doneAt - now) / 1000)} sn</p>
                ) : (
                  <>
                  <button className="btn wide" disabled={upgradeError(kingdom, palace.id, now) !== null} onClick={() => onUpgradeBuilding(palace.id)}>
                    <span>Sarayı yükselt <small>({upgradeSpec(palace)?.buildSeconds} sn)</small></span>
                    <CostList cost={upgradeSpec(palace)?.cost} stock={kingdom.stock} />
                  </button>
                  <Missing cost={upgradeSpec(palace)?.cost} stock={kingdom.stock} />
                  {upgradeError(kingdom, palace.id, now) === 'liege' && <p className="hint down">Önce aşağıdaki Bağlılık bölümünden bir taç krallığına biat et.</p>}
                  {upgradeError(kingdom, palace.id, now) === 'queen' && <QueenNeeded kingdom={kingdom} now={now} online={data.online} />}
                  </>
                )}
              </>
            ) : (
              palace && <p className="hint">Hudut en geniş hâlinde.</p>
            )}
            <Stat label="İskele" value={dockState} />
            {dock ? (
              <button className="btn small" onClick={() => onShow(center(dock))}>
                <Icon name="pin" size={16} /> İskeleye git
              </button>
            ) : kingdom.dockPlot ? (
              <button className="btn small" onClick={() => onShow(center(kingdom.dockPlot!))}>
                <Icon name="pin" size={16} /> Arsayı göster
              </button>
            ) : null}
            <p className="hint">Hudut başarımlarla büyüyecek; şimdilik yalnızca görünüm için seçilebilir.</p>
          </Section>
          <Fealty world={data.world} kingdom={kingdom} now={data.now} onSwear={(city) => data.online?.act({ type: 'swear', city })} onOpen={(city) => data.online?.openCrown(city)} />
        </>
      )}
      {part === 'house' && <DynastySection kingdom={kingdom} now={data.now} online={data.online} />}
      {part === 'expeditions' && <ExpeditionsPanel kingdom={kingdom} now={now} online={data.online} onReport={setReport} />}
      {part === 'goals' && <GoalsPanel kingdom={kingdom} now={now} />}
      {report && <ExpeditionReport expedition={report} kingdom={kingdom} online={data.online} onClose={() => setReport(null)} />}
      {part === 'buildings' && (
        <Section title="Yapılar" icon="build" aside={`${kingdom.buildings.length} toplam`}>
          <ul className="tally">
            {[...counts].map(([kind, n]) => (
              <li key={kind}>
                <SpriteView sprite={thumb(kind, kingdom.color)} scale={kind === 'house' ? 0.5 : 0.25} label={BUILDING_NAMES[kind]} />
                <span>{BUILDING_NAMES[kind]}</span>
                <b className={capOf(kingdom, kind, now) !== null && n >= capOf(kingdom, kind, now)! ? 'down' : undefined}>
                  {n}
                  {capOf(kingdom, kind, now) !== null ? ` / ${capOf(kingdom, kind, now)}` : kind === 'house' ? ` · ${plannedHousing(kingdom)} / ${population(kingdom, now).cap} barınak` : ''}
                </b>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Ayarlar" icon="music">
        <div className="row">
          <button className="btn small" onClick={onMute}>
            <Icon name="gear" size={16} /> Ses ayarları
          </button>
          <button className={confirmReset ? 'btn small danger' : 'btn small'} onClick={onReset}>
            {confirmReset ? 'Emin misin? Tekrar bas' : 'Lordluğu sıfırla'}
          </button>
          <button className="btn small" onClick={onExit}>
            <Icon name="home" size={16} /> Ana menü
          </button>
        </div>
      </Section>
    </>
  )
}

// ---- Halk -----------------------------------------------------------------------------------------------------------

// The people's tab in parts: how many and how they fare, their mood (tax, night work), health and faith, and the queen.
type PeoplePart = 'people' | 'mood' | 'health' | 'queen'
const PEOPLE_PARTS: PeoplePart[] = ['people', 'mood', 'health', 'queen']
export const showPeoplePart = (part: PeoplePart) => showPart('people', part)

export function PeopleTab(data: HudData) {
  const { kingdom, now, online } = data
  const [part, setPart] = usePart('people', PEOPLE_PARTS, 'people')
  const { villagers, soldiers, cap, housing, jobs, efficiency, away } = population(kingdom, now)
  const food = flows(kingdom, now).food
  const houses = kingdom.buildings.filter((b) => b.kind === 'house' && b.doneAt <= now).length
  // How the people are doing, read off the state of the kingdom: fed and put to work. A shrinking granary only
  // worries them once it holds less than about 20 rounds of food.
  const fed = food.net >= 0 ? 1 : Math.max(0, Math.min(1, kingdom.stock.food / (-food.net * 20)))
  const working = jobs === 0 ? 1 : Math.min(1, villagers / jobs)
  const idle = Math.max(0, villagers - jobs)
  const signs = [
    { name: 'Gıda', value: fed, note: food.net >= 0 ? 'Ambar doluyor' : `Ambar ~${Math.floor(kingdom.stock.food / -food.net)} tur yeter` },
    { name: 'İş gücü', value: working, note: villagers < jobs ? `${jobs - villagers} işçi eksik` : idle > 0 ? `${idle} köylü boşta` : 'Herkes işinde' },
  ]
  const worst = Math.min(...signs.map((s) => s.value))
  const mood = worst >= 0.9 ? 'happy' : worst >= 0.5 ? 'content' : 'unhappy'
  const moodName = { happy: 'Memnun', content: 'İdare ediyor', unhappy: 'Huzursuz' }[mood]
  const happiness = kingdom.happiness ?? balance.society.happiness.start
  // The queen's part waits on the lord when she is held, or when one can be had.
  const queenWaits = !!kingdom.queenHeldBy || (!kingdom.queen && queenError(kingdom, now) === null)
  return (
    <>
      <PeopleAlerts kingdom={kingdom} now={now} online={online} />
      <Subtabs
        label="Halk"
        part={part}
        onPart={setPart}
        parts={[
          { id: 'people', name: 'Nüfus', icon: 'villager' },
          { id: 'mood', name: 'Mutluluk', icon: happiness >= 60 ? 'happy' : happiness >= 35 ? 'content' : 'unhappy' },
          { id: 'health', name: 'Sağlık ve din', icon: 'heal' },
          { id: 'queen', name: 'Kraliçe', icon: 'crown', dot: queenWaits },
        ]}
      />
      {part === 'people' && (
        <>
          <div className="feature mood">
            <Icon name={mood} size={48} />
            <div>
              <b>Halk {moodName.toLowerCase()}</b>
              <p className="hint">Halkın hâli karnının tokluğuna ve işine bağlı.</p>
            </div>
          </div>
          <Section title="Halkın durumu" icon="people">
            {signs.map((s) => (
              <div key={s.name} className="sign">
                <span>{s.name}</span>
                <Meter value={s.value} tone={s.value >= 0.9 ? 'up' : s.value >= 0.5 ? 'gold' : 'down'} label={s.name} segments={10} />
                <small>{s.note}</small>
              </div>
            ))}
          </Section>
          <Section title="İş gücü" icon="villager">
            <Stat label="Köylü" value={villagers} note={`${houses} ev`} />
            <Stat label="İş gücü ihtiyacı" value={jobs} tone={villagers < jobs ? 'down' : undefined} />
            {away > 0 && <Stat label="Seferde" value={away} note="çalışmaz, vergi vermez" />}
            <Stat label="Üretim verimi" value={`%${Math.round(efficiency * 100)}`} tone={efficiency < 1 ? 'down' : 'up'} />
            <Stat label="Yemek tüketimi" value={`${signed(-food.used)} / tur`} />
          </Section>
          <PopulationPanel kingdom={kingdom} now={now} online={online} />
          <Section title="Nüfus sınırı" icon="villager" aside={`${villagers + soldiers} / ${cap}`}>
            <Meter value={cap ? (villagers + soldiers) / cap : 0} tone={villagers + soldiers >= cap ? 'down' : 'gold'} label="Nüfus" segments={16} />
            <p className="hint">
              Sarayın her seviyesi {balance.society.popCapPerPalaceLevel} kişilik yer açar. Evlerin {housing} kişilik yeri var
              {housing > cap ? `; ${housing - cap} kişi sığmıyor, sarayı yükselt` : ''}. Askerler de bu sınırdan sayılır.
            </p>
          </Section>
        </>
      )}
      {part === 'mood' && (
        <>
          <Mood kingdom={kingdom} now={now} online={online} />
          <StewardSection kingdom={kingdom} online={online} />
        </>
      )}
      {part === 'health' && <Health data={data} />}
      {part === 'queen' && <Queen kingdom={kingdom} now={now} online={online} />}
    </>
  )
}

// ---- İç işler ----------------------------------------------------------------------------------------------------

const TAX_NAMES: Record<TaxLevel, string> = { low: 'Düşük', normal: 'Normal', high: 'Yüksek', heavy: 'Ağır' }
const QUEEN_WHY: Record<string, string> = {
  locked: 'Sarayı 2. seviyeye yükselt',
  people: `En az ${balance.society.queen.minPopulation} nüfus gerekir`,
  cost: 'Altın yetmiyor',
  busy: 'Kraliçen rehin',
}

// What is wrong with the people now, over whichever part is shown: an enemy at the border, walls with no gate, a revolt
// and walls to mend.
function PeopleAlerts({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  const walls = repairCost(kingdom)
  const broken = kingdom.buildings.filter((b) => b.kind === 'wall' && b.broken).length
  return (
    <>
      <FortuneNote kingdom={kingdom} now={now} />
      {(kingdom.fearUntil ?? 0) > now && (
        <p className="alert">
          <Icon name="warn" size={16} /> Sınırında düşman ordusu bekliyor: halk korkuyor (mutluluk {balance.military.fear.happiness}).
        </p>
      )}
      {imprisoned(kingdom.buildings, kingdom.site, now) && (
        <p className="alert">
          <Icon name="warn" size={16} /> Surlarında kapı yok, halk dışarı çıkamıyor: lordluğun bir hapishane (mutluluk {balance.society.happiness.imprisoned}).
          Sura bir kapı koy.
        </p>
      )}
      {(kingdom.revoltUntil ?? 0) > now && (
        <p className="alert">
          <Icon name="warn" size={16} /> Halk ayaklandı: {Math.ceil(((kingdom.revoltUntil ?? 0) - now) / 60000)} dakika daha üretim yarıda ve mutluluk düşük.
        </p>
      )}
      {broken > 0 && (
        <Section title="Yıkık surlar" icon="warn" aside={`${broken}`}>
          <button className="btn small" onClick={() => online?.act({ type: 'repairWalls' })}>
            Onar · {Object.entries(walls).map(([r, v]) => `${v} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`).join(', ')}
          </button>
        </Section>
      )}
    </>
  )
}

function Mood({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  const happiness = kingdom.happiness ?? balance.society.happiness.start
  const target = happinessFor(kingdom, now)
  const night = isNightAt(now)
  const rate = workRate(kingdom, now)
  const fatigue = kingdom.fatigue ?? 0
  const n = balance.society.night
  const tax = kingdom.tax ?? 'normal'
  return (
    <>
      <Section title="Mutluluk" icon={happiness >= 60 ? 'happy' : happiness >= 35 ? 'content' : 'unhappy'} aside={`%${Math.round(happiness)} → %${Math.round(target)}`}>
        <Meter value={happiness / 100} tone={happiness >= 60 ? 'up' : happiness >= 35 ? 'gold' : 'down'} label="Mutluluk" segments={20} />
        <p className="hint">
          Mutluluk her tur hedefe doğru kayar. Vergi, kraliçe, tapınak, hastalık, günün olayları ve aç kalmak hedefi belirler; mutlu halk daha çok ve daha
          ucuza asker olur.
        </p>
      </Section>
      <Section title="Vergi" icon="gold" aside={`köylü başına ${balance.society.tax.levels[tax].goldPerVillager} altın`}>
        <div className="segmented" role="radiogroup" aria-label="Vergi oranı">
          {TAX_LEVELS.map((t) => (
            <button key={t} className="btn small" role="radio" aria-checked={tax === t} onClick={() => online?.act({ type: 'tax', tax: t })}>
              {TAX_NAMES[t]}
            </button>
          ))}
        </div>
        <Stat
          label="Mutluluğa etkisi"
          value={`${balance.society.tax.levels[tax].happiness >= 0 ? '+' : ''}${Math.round(balance.society.tax.levels[tax].happiness * (balance.society.tax.levels[tax].happiness < 0 ? sermonTaxFactor(kingdom, now) : 1))}`}
          note={sermonTaxFactor(kingdom, now) < 1 ? 'tapınakta vaaz sürüyor' : undefined}
        />
      </Section>
      <Section title="Gece mesaisi" icon={night ? 'moon' : 'sun'} aside={`şu an ${night ? 'gece' : 'gündüz'} · iş %${Math.round(rate * 100)}`}>
        <p className="hint">
          Geceleri halk dinlenir ve yalnızca %{Math.round(n.workRate * 100)} çalışır. Gece mesaisinde tam çalışır ama mutluluk {n.shiftHappiness} düşer ve
          biriken yorgunluk gündüz verimini de azaltır.
        </p>
        <div className="segmented" role="radiogroup" aria-label="Gece mesaisi">
          <button className="btn small" role="radio" aria-checked={!kingdom.nightShift} onClick={() => online?.act({ type: 'nightShift', on: false })}>
            <Icon name="moon" size={16} /> Geceleri dinlensinler
          </button>
          <button className="btn small" role="radio" aria-checked={!!kingdom.nightShift} onClick={() => online?.act({ type: 'nightShift', on: true })}>
            <Icon name="sun" size={16} /> Gece de çalışsınlar
          </button>
        </div>
        <div className="sign">
          <span>Yorgunluk</span>
          <Meter value={fatigue / n.maxFatigue} tone={fatigue > n.maxFatigue / 2 ? 'down' : 'gold'} label="Yorgunluk" segments={10} />
          <small>verim −%{Math.round(fatigue * 100)}</small>
        </div>
      </Section>
    </>
  )
}

// The people's health and faith: the sick and the hospital, the temple and its sermons.
function Health({ data }: { data: HudData }) {
  const { kingdom, now } = data
  const hospital = kingdom.buildings.find((b) => b.kind === 'hospital' && b.doneAt <= now)
  const temple = kingdom.buildings.some((b) => b.kind === 'temple' && b.doneAt <= now)
  return (
    <>
      {hospital ? (
        <HospitalPanel building={hospital} data={data} />
      ) : (
        <Section title="Sağlık" icon="heal">
          <Sickness kingdom={kingdom} now={now} />
          <p className="hint">
            Köylüler zaman zaman hastalanır; hasta köylü çalışmaz, vergi vermez ve halkın keyfini kaçırır. Kendiliğinden yavaşça iyileşirler; hastane (3.
            seviye saray) iyileşmeyi hızlandırır.
          </p>
        </Section>
      )}
      {temple ? (
        <TemplePanel data={data} />
      ) : (
        <Section title="İnanç" icon="temple">
          <p className="hint">
            Tapınak (3. seviye saray) halkın mutluluğunu artırır, askerlerine iman gücü verir; rahipleri vaaz verince vergiler halka daha az ağır gelir.
          </p>
        </Section>
      )}
    </>
  )
}

// The palace will not rise past this level without a queen: say so where the upgrade is, and fetch one from there.
function QueenNeeded({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  const why = queenError(kingdom, now)
  return (
    <>
      <p className="hint down">
        Sarayı {balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için sarayda bir kraliçe olmalı.
        {kingdom.queenHeldBy && ` Kraliçen ${kingdom.queenHeldBy.name} lordunun elinde: Halk sekmesi → Kraliçe'den fidyesini öde.`}
      </p>
      {!kingdom.queenHeldBy && (
        <button className="btn small" disabled={!!why} onClick={() => online?.act({ type: 'queen' })}>
          <Icon name="crown" size={16} /> Kraliçe bul · {queenOwed(kingdom, now) ? 'hemen, bedelsiz' : `${balance.society.queen.cost.gold} altın`} {why ? `(${QUEEN_WHY[why] ?? ''})` : ''}
        </button>
      )}
    </>
  )
}

function Queen({ kingdom, now, online }: { kingdom: Kingdom; now: number; online?: Online }) {
  // Set when she was taken (older captures: the plain ransom).
  const ransom = kingdom.queenHeldBy?.ransom ?? balance.espionage.operations.kidnap.ransom
  const queen = queenError(kingdom, now)
  return (
    <>
      <Section title="Kraliçe" icon="crown">
        {kingdom.queenHeldBy ? (
          <>
            <p className="alert">
              <Icon name="warn" size={16} /> Kraliçen {kingdom.queenHeldBy.name} lordunun elinde! Halk yas tutuyor (mutluluk{' '}
              {balance.espionage.operations.kidnap.happiness}).
            </p>
            <button className="btn small" disabled={kingdom.stock.gold < ransom} onClick={() => online?.act({ type: 'ransom' })}>
              Fidye öde · {ransom} altın
            </button>
            <p className="hint">Ya da {kingdom.queenHeldBy.name} ile savaş: kaçırılan kraliçe sana savaş gerekçesi verir.</p>
          </>
        ) : kingdom.queen ? (
          <p className="hint">
            Sarayında Kraliçe {kingdom.dynasty?.queen?.name ?? ''} var: halkın mutluluğu +{balance.society.happiness.queen}; hanedanın çocukları onunla doğar.
          </p>
        ) : (
          <>
            <p className="hint">
              Kraliçe halkın mutluluğunu +{balance.society.happiness.queen} artırır; hanedanın çocukları onunla doğar ve sarayı {balance.dynasty.queenForPalaceLevel}. seviyeye
              yükseltmek için şarttır.
            </p>
            <button className="btn small" disabled={!!queen} onClick={() => online?.act({ type: 'queen' })}>
              <Icon name="crown" size={16} /> Kraliçe edin · {queenOwed(kingdom, now) ? 'hemen, bedelsiz' : `${balance.society.queen.cost.gold} altın`} {queen ? `(${QUEEN_WHY[queen] ?? ''})` : ''}
            </button>
          </>
        )}
      </Section>
      {(kingdom.hostages ?? []).length > 0 && (
        <Section title="Elindeki kraliçeler" icon="crown">
          <ul className="places">
            {kingdom.hostages!.map((h) => (
              <li key={h.of}>
                <Icon name="crown" size={24} />
                <span>
                  <b>{h.name} kraliçesi</b>
                  <small>Fidyesini ödeyene kadar senin elinde.</small>
                </span>
                <button className="btn small" onClick={() => online?.act({ type: 'release', target: h.of })}>
                  Serbest bırak (+{balance.espionage.operations.kidnap.release})
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

// ---- Günlük ---------------------------------------------------------------------------------------------------------

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.floor(s / 60)} dk önce` : `${Math.floor(s / 3600)} sa önce`
}

export function JournalTab({ journal, now, onImportantRead }: HudData) {
  // Everything, or only the bad news that touched the kingdom.
  const [only, setOnly] = useState(false)
  const important = journal.entries.filter(isImportant)
  const unread = unreadImportant(journal)
  // Looking at the important entries reads them, new ones too while the tab stays open.
  useEffect(() => {
    if (only && unread > 0) onImportantRead?.()
  }, [only, unread, onImportantRead])
  const shown = only ? important : journal.entries
  const days = new Map<number, typeof journal.entries>()
  for (const e of shown) days.set(e.day, [...(days.get(e.day) ?? []), e])
  return (
    <>
      <div className="segmented journal-filter" role="tablist" aria-label="Günlük">
        <button className="btn small" role="tab" aria-selected={!only} aria-pressed={!only} onClick={() => setOnly(false)}>
          <Icon name="scroll" size={16} /> Tümü
        </button>
        <button className="btn small" role="tab" aria-selected={only} aria-pressed={only} onClick={() => setOnly(true)}>
          <Icon name="warn" size={16} /> Önemli {unread > 0 && <span className="count">{unread}</span>}
        </button>
      </div>
      {shown.length === 0 ? (
        only ? (
          <Placeholder icon="happy" title="Kötü bir haber yok">
            Lordluğunu etkileyen olumsuz olaylar (yağma, savaş ilanı, kayıplar, sabotaj, kötü olaylar) burada toplanır.
          </Placeholder>
        ) : (
          <Placeholder icon="scroll" title="Elçiden haber yok">
            Her {REPORT_ROUNDS} üretim turunda bir gün kapanır ve elçin raporunu yazar.
          </Placeholder>
        )
      ) : (
        <div className="letters">
          {[...days].map(([day, entries]) => (
            // A journal day is a day/night cycle of the season, which is also a calendar year (CLAUDE.md §2).
            <section key={day} aria-label={`${balance.time.calendar.startYear + day - 1} yılı`}>
              <h3 className="day-head">{balance.time.calendar.startYear + day - 1} yılı</h3>
              {entries.map((e) => (
                <article key={e.id} className={`letter tone-${e.tone}${isImportant(e) ? ' important' : ''}`}>
                  <Icon name={e.icon} size={16} />
                  <div>
                    <b>{e.title}</b>
                    {e.text && <p>{e.text}</p>}
                    <small>
                      {dateText(calendarAt(e.at, e.at), 'day')} · {ago(now - e.at)}
                    </small>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )
}

// What the crown kingdoms buy off the lobby's market now (CLAUDE.md §7.8): each wants one good in each window of the
// clock and buys less of it as its price nears the usual.
function CrownBuyers({ world, market, now }: { world: World; market?: Market | null; now: number }) {
  const buyers = crownDemand(now).filter((d) => world.cities[d.crown])
  if (buyers.length === 0) return null
  return (
    <ul className="pop-lines">
      {buyers.map((d) => {
        const info = cityInfo(world, d.crown)
        const rate = Math.round(d.perMinute * crownAppetite(d.good, priceAt(market, d.good, now), market))
        return (
          <li key={d.crown}>
            <span>
              <CrownBanner world={world} liege={d.crown} /> {info.name} {RESOURCE_NAMES[d.good].toLocaleLowerCase('tr')} alıyor
            </span>
            <b className={rate > 0 ? 'up' : undefined}>
              {rate > 0 ? `dakikada ${rate}` : 'fiyat yüksek, almıyor'} · {Math.max(1, Math.ceil((d.until - now) / 60000))} dk
            </b>
          </li>
        )
      })}
    </ul>
  )
}
