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
  buildingCount,
  buildLimit,
  buildCost,
  cutOff,
  imprisoned,
  isFree,
  buyCost,
  buyError,
  fortuneEffects,
  guildOf,
  projectEffects,
  festivalHappiness,
  memorialHappiness,
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
import { L, locale } from '../../lib/i18n'
import { BUILDING_NAMES, BUILDING_NOTES, RESOURCE_ICONS, RESOURCE_NAMES, SEASON_NAMES, WEAPON_ICONS, WEAPON_NAMES, dateText } from '../names'
import { CostList, GoodChoice, Missing } from '../panels'
import { buildWhy, lackWhy, sentence, waitWhy } from '../why'
import type { Journal } from './journal'
import { DynastySection, houseWaiting } from './dynasty'
import type { Online } from './online'
import { REPORT_ROUNDS, isImportant, unreadImportant } from './journal'
import { FortuneNote, HospitalPanel, Sickness, TemplePanel } from './institutions'
import { PopulationPanel } from './population'
import { ExpeditionReport, ExpeditionsPanel, GoalTitle, GoalsPanel, StewardSection } from './expeditions'
import { ProjectsPanel } from './projects'
import { IncomeSection, SeasonBooks } from './treasury'
import { History, Meter, Placeholder, Section, SpriteView, Stat, fmt, signed, times } from './primitives'
import { Subtabs, showPart, usePart } from './Subtabs'
import { BanditSection, OutlawToll } from './outlaws'

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
  const bonus = 1 + researchEffects(kingdom, now).trade + fortuneEffects(kingdom, now).trade + guildOf(kingdom, now).trade + projectEffects(kingdom, now).trade
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
  palace: L('Önce saray', 'Palace first'),
  cost: L('Kaynak yetersiz', 'Not enough resources'),
  queue: L('Kuyruk dolu', 'Queue full'),
  unique: L('Zaten var ya da arsa yok', 'Already built, or no plot'),
  spot: L('Yer yok', 'No room'),
  locked: L('2. seviye saray', 'Needs a level 2 palace'),
  limit: L('Sınır dolu: sarayı yükselt', 'Limit reached: upgrade the palace'),
}

export function BuildTab({ world, kingdom, now, stage, onPlace }: HudData) {
  const list = constructing(kingdom, now).filter((b) => b.kind !== 'road')
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
      <Section title={L('İnşaat kuyruğu', 'Construction queue')} icon="time" aside={L(`${list.length}/${slots} usta`, `${list.length}/${slots} builders`)}>
        {list.length === 0 ? (
          <p className="hint">{L('Ustalar boşta. Aşağıdan bir yapı seç, sonra haritada hududun içine yerleştir.', 'The builders are idle. Pick a building below, then place it inside your border on the map.')}</p>
        ) : (
          <ul className="queue-list">
            {list.map((b) => {
              const total = (BUILDINGS[b.kind].buildSeconds ?? 1) * 1000
              const left = b.doneAt - now
              return (
                <li key={b.id}>
                  <span>{BUILDING_NAMES[b.kind]}</span>
                  <Meter value={1 - left / total} label={L(`${BUILDING_NAMES[b.kind]} ilerleme`, `${BUILDING_NAMES[b.kind]} progress`)} segments={10} />
                  <small>{L(`${Math.ceil(left / 1000)} sn`, `${Math.ceil(left / 1000)} s`)}</small>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      <Section title={L('Yapılar', 'Buildings')} icon="build">
        <div className="tier-tabs" role="tablist" aria-label={L('Saray seviyesi', 'Palace level')}>
          {Array.from({ length: tiers }, (_, i) => i + 1).map((t) => (
            <button key={t} className="btn small" role="tab" aria-selected={tier === t} aria-pressed={tier === t} onClick={() => setTier(t)} title={t > level ? L(`${t}. seviye saray gerekir`, `Requires a level ${t} palace`) : undefined}>
              {t > level && <Icon name="lock" size={8} />}
              {L(`${t}. sv.`, `Lv. ${t}`)}
            </button>
          ))}
        </div>
        {tier > level && <p className="hint">{L(`Bu yapılar için sarayı ${tier}. seviyeye yükselt.`, `Raise the palace to level ${tier} for these buildings.`)}</p>}
        {raised.length > 0 && <p className="hint">{L(`Bu seviyede sınırı artanlar: ${raised.join(' · ')}.`, `Limits raised at this level: ${raised.join(' · ')}.`)}</p>}
        {shown.length === 0 && <p className="hint">{L('Bu seviyede açılan yeni yapı yok.', 'No new buildings open at this level.')}</p>}
        <ul className="cards">
          {shown.map((kind) => {
            const spec = BUILDINGS[kind]
            const error = buildError(world, kingdom, stage, kind, null, now)
            const effect = spec.produces
              ? L(
                  `+${(spec.amount! * kingdom.yields[spec.produces]).toFixed(1).replace('.', ',')} ${RESOURCE_NAMES[spec.produces].toLowerCase()} / tur`,
                  `+${(spec.amount! * kingdom.yields[spec.produces]).toFixed(1)} ${RESOURCE_NAMES[spec.produces].toLowerCase()} / round`,
                )
              : spec.villagers
                ? L(`+${spec.villagers} köylü`, `+${spec.villagers} villager${spec.villagers === 1 ? '' : 's'}`)
                : spec.workers
                  ? L(`${spec.workers} işçi çalıştırır`, `employs ${spec.workers} worker${spec.workers === 1 ? '' : 's'}`)
                  : null
            const why =
              error === 'locked'
                ? L(`${spec.requiresPalace ?? 1}. seviye saray`, `Level ${spec.requiresPalace ?? 1} palace`)
                : error === 'unique'
                  ? kingdom.buildings.some((b) => b.kind === kind)
                    ? L('Zaten kurulu (bir tane olur)', 'Already built (only one allowed)')
                    : L('Arsası yok', 'No plot for it')
                  : error
                    ? (BLOCKED[error] ?? L('Şu an olmaz', 'Not right now'))
                    : null
            return (
              <li key={kind}>
                <button
                  className="card"
                  disabled={why !== null}
                  data-why={
                    error === 'locked'
                      ? L(`${spec.requiresPalace ?? 1}. seviye saray gerekir`, `Requires a level ${spec.requiresPalace ?? 1} palace`)
                      : error === 'unique'
                        ? (why ?? undefined)
                        : error === 'limit'
                          ? L(
                              `Sınır dolu (${buildingCount(kingdom, kind)}/${buildLimit(kingdom, kind, now)}); daha fazlası için sarayı yükselt`,
                              `Limit reached (${buildingCount(kingdom, kind)}/${buildLimit(kingdom, kind, now)}); upgrade the palace for more`,
                            )
                          : buildWhy(error, kingdom, now, buildCost(kingdom, kind))
                  }
                  onClick={() => onPlace(kind)}
                  aria-describedby={`why-${kind}`}
                >
                  <span className="card-art">
                    <SpriteView sprite={thumb(kind)} scale={spec.size > 1 ? 0.5 : 1} />
                  </span>
                  <span className="card-body">
                    <b>{BUILDING_NAMES[kind] ?? kind}</b>
                    {BUILDING_NOTES[kind] && <small>{BUILDING_NOTES[kind]}</small>}
                    {effect && <small className="up">{effect}</small>}
                    {spec.villagers ? (
                      <small>
                        {L(
                          `Barınak ${plannedHousing(kingdom)} / ${population(kingdom, now).cap} (nüfus sınırı saray seviyesiyle artar)`,
                          `Housing ${plannedHousing(kingdom)} / ${population(kingdom, now).cap} (the population limit rises with the palace level)`,
                        )}
                      </small>
                    ) : (
                      capOf(kingdom, kind, now) !== null && (
                        <small className={buildingCount(kingdom, kind) >= capOf(kingdom, kind, now)! ? 'down' : undefined}>
                          {L(`${buildingCount(kingdom, kind)} / ${capOf(kingdom, kind, now)} kurulu`, `${buildingCount(kingdom, kind)} / ${capOf(kingdom, kind, now)} built`)}
                          {BUILDINGS[kind].maxByPalaceLevel ? L(' (sınır saray seviyesiyle artar)', ' (the limit rises with the palace level)') : ''}
                        </small>
                      )
                    )}
                    <span className="card-meta">
                      {isFree(kingdom, kind) ? <span className="chip up">{L('İlki ücretsiz', 'First one free')}</span> : <CostList cost={spec.cost} stock={kingdom.stock} />}
                      <span className="chip">
                        <Icon name="time" size={8} /> {L(`${spec.buildSeconds} sn`, `${spec.buildSeconds} s`)}
                      </span>
                      <span className="chip">
                        {/* A gate stands on three tiles in a row: tower, gate, tower. */}
                        {kind === 'gate' ? '3×1' : `${spec.size}×${spec.size}`}
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
        label={L('Depo', 'Storehouse')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'goods', name: L('Mallar', 'Goods'), icon: 'chest', dot: full },
          { id: 'books', name: L('Hazine', 'Treasury'), icon: 'gold' },
          { id: 'armory', name: L('Cephanelik', 'Armoury'), icon: 'arms', dot: armsFull },
        ]}
      />
      {part === 'books' && (
        <>
          <IncomeSection kingdom={kingdom} now={now} online={online} />
          <SeasonBooks kingdom={kingdom} />
        </>
      )}
      {part === 'armory' && (
        <Section title={L('Cephanelik', 'Armoury')} icon="arms" aside={L(`her silahtan en çok ${fmt(armsRoom)}`, `at most ${fmt(armsRoom)} of each weapon`)}>
          <div className="armory">
            {WEAPONS.map((w) => (
              <div key={w} className={armory[w] >= armsRoom ? 'slot full' : 'slot'}>
                <Icon name={WEAPON_ICONS[w]} size={24} />
                <b className={armory[w] >= armsRoom ? 'down' : undefined}>
                  {fmt(armory[w])} / {fmt(armsRoom)}
                </b>
                <small>{WEAPON_NAMES[w]}</small>
                <Meter value={Math.min(1, armory[w] / armsRoom)} tone={armory[w] >= armsRoom ? 'down' : 'gold'} label={L(`${WEAPON_NAMES[w]} yeri`, `${WEAPON_NAMES[w]} space`)} segments={8} />
                {armory[w] >= armsRoom ? (
                  <small className="down">{L('Dolu: atölye durdu', 'Full: the forge has stopped')}</small>
                ) : (
                  (weapons[w] ?? 0) > 0.05 && <small className="up">{signed(weapons[w]!)} {L('/ tur', '/ round')}</small>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            {L(
              `Silah atölyesi işledikçe silahlar burada birikir; kışlada okçu ve kalkanlı piyade eğitmek için harcanır. Her silahın yeri saray seviyesiyle ve her ambar seviyesiyle (+${balance.economy.armory.perWarehouseLevel}) artar. Yeri dolan silahı işleyen atölye durur: hammadde harcamaz, işçileri boşta kalır.`,
              `Weapons pile up here as the forges work; the barracks spend them to train archers and shield infantry. Each weapon's space grows with the palace level and every storehouse level (+${balance.economy.armory.perWarehouseLevel}). A forge making a weapon whose space is full stops: it uses no raw goods and its workers stand idle.`,
            )}
          </p>
        </Section>
      )}
      {part === 'goods' && (
        <>
      <p className="hint">
        {L(
          `Her mal için depo yeri ${fmt(cap)} (saray seviyesi ve ambarlarla artar); hazinede ${fmt(goldCap(kingdom, now))} altın yeri var (saray seviyesi ve hazine binasıyla artar). Sığmayan boşa gider. Her ${balance.economy.productionSeconds} saniyede bir üretim turu işler; rakamlar tur başınadır.`,
          `Storage for each good: ${fmt(cap)} (rises with the palace level and storehouses); the treasury holds ${fmt(goldCap(kingdom, now))} gold (rises with the palace level and the treasury building). Whatever does not fit is lost. A production round runs every ${balance.economy.productionSeconds} seconds; figures are per round.`,
        )}
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
                    {L('Arazi çarpanı', 'Land multiplier')} {times(kingdom.yields[r as Good])}
                    {r === 'food' && seasonOf(kingdom, now) && L(` · Mevsim: ${SEASON_NAMES[seasonOf(kingdom, now)!]} ${times(seasonFactor(kingdom, now, 'food'))}`, ` · Season: ${SEASON_NAMES[seasonOf(kingdom, now)!]} ${times(seasonFactor(kingdom, now, 'food'))}`)}
                  </small>
                )}
              </span>
              <strong className={stock >= room(r) ? 'down' : undefined}>
                {fmt(stock)}
                <small> / {fmt(room(r))}</small>
              </strong>
            </header>
            <Meter value={stock / room(r)} tone={stock >= room(r) ? 'down' : stock >= room(r) * 0.85 ? 'gold' : 'up'} label={L(`${RESOURCE_NAMES[r]} deposu`, `${RESOURCE_NAMES[r]} store`)} segments={20} />
            {stock >= room(r) && (
              <p className="alert">
                <Icon name="warn" size={16} />{' '}
                {r === 'gold'
                  ? L('Hazine dolu: gelen altın boşa gidiyor. Harca, hazine binası kur (4. seviye saray) ya da yükselt.', 'Treasury full: incoming gold is going to waste. Spend it, or build a treasury (level 4 palace) or upgrade one.')
                  : L('Depo dolu: üretilen fazlası boşa gidiyor. Ambar kur ya da yükselt, fazlasını sat.', 'Stores full: the surplus is going to waste. Build or upgrade a storehouse, or sell the excess.')}
              </p>
            )}
            <div className="store-flow">
              <Stat label={L('Gelen', 'In')} value={signed(made)} tone={made > 0 ? 'up' : undefined} />
              <Stat label={L('Giden', 'Out')} value={signed(-used)} tone={used > 0 ? 'down' : undefined} />
              <Stat label="Net" value={signed(net)} tone={net > 0.01 ? 'up' : net < -0.01 ? 'down' : undefined} />
            </div>
            {series.length > 1 && <History values={series} label={L(`${RESOURCE_NAMES[r]} son ${series.length} tur`, `${RESOURCE_NAMES[r]}, last ${series.length} rounds`)} />}
            {runsOut !== null && (
              <p className="alert">
                <Icon name="warn" size={16} /> {runsOut < 1 ? L('Tükendi: depoda hiç kalmadı.', 'Run out: none left in store.') : L(`Bu gidişle yaklaşık ${runsOut} tur sonra tükenir.`, `At this rate it runs out in about ${runsOut} round${runsOut === 1 ? '' : 's'}.`)}
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
        label={L('Ticaret', 'Trade')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'merchant', name: L('Tüccar', 'Merchant'), icon: 'trade', dot: !!kingdom.trade.damaged },
          { id: 'market', name: L('Pazar', 'Market'), icon: 'gold' },
          ...(world.cities.length > 0 ? [{ id: 'orders' as const, name: L('Siparişler', 'Orders'), icon: 'scroll' as const, dot: ordersOpen }] : []),
          { id: 'shares', name: L('Hâkimler', 'Masters'), icon: 'star' },
        ]}
      />
      {part === 'merchant' && <TradePost {...data} />}
      {part === 'merchant' && <BanditSection kingdom={kingdom} />}
      {part === 'market' && <MarketSection {...data} />}
      {part === 'orders' && <CrownOrders world={world} kingdom={kingdom} now={now} online={online} />}
      {part === 'shares' && (online ? <TradeShares online={online} /> : <Placeholder icon="trade" title={L('Lobi yükleniyor', 'Loading the lobby')} />)}
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
  // The guild hall bargains a share off (CLAUDE.md §9.8).
  const discount = guildOf(kingdom, now).discount
  const cost = buyCost(market, good, inBasket + adding, now, discount) - (inBasket > 0 ? buyCost(market, good, inBasket, now, discount) : 0)
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
    <Section title={L('Lobi fiyatları', 'Lobby prices')} icon="gold" aside={L('satış düşürür, alış artırır', 'selling lowers, buying raises')}>
      <div className="price-row">
        {MARKET_GOODS.map((g) => {
          const price = priceAt(market, g, now)
          const base = Math.round(basePrice(g, market) * 100) / 100
          const floor = atFloor(price, g, market)
          return (
            <span key={g} className="price" title={L(`${RESOURCE_NAMES[g]} · olağan fiyatı ${base}${floor ? ' · en dipte' : ''}`, `${RESOURCE_NAMES[g]} · usual price ${base}${floor ? ' · at rock bottom' : ''}`)}>
              <Icon name={RESOURCE_ICONS[g]} size={16} />
              <b className={price > base * 1.02 ? 'up' : price < base * 0.98 ? 'down' : undefined}>{L(price.toFixed(2).replace('.', ','), price.toFixed(2))}</b>
              <small>{floor ? L('en dipte', 'rock bottom') : L(`olağan ${String(base).replace('.', ',')}`, `usual ${base}`)}</small>
            </span>
          )
        })}
      </div>
      {(market?.foodDemand ?? 1) > 1.001 && (
        <p className="hint">
          {L(
            `Dünya nüfusu yemeği pahalandırıyor: olağan fiyatı +%${Math.round(((market?.foodDemand ?? 1) - 1) * 100)}.`,
            `The world's population is driving food up: usual price +${Math.round(((market?.foodDemand ?? 1) - 1) * 100)}%.`,
          )}
        </p>
      )}
      {MARKET_GOODS.some((g) => atFloor(priceAt(market, g, now), g, market)) && (
        <p className="hint">
          {L(
            'En dipteki malın fiyatını satış daha fazla düşürmez; zamanla ve taç krallıkları aldıkça olağan fiyatına doğru toparlanır.',
            'Selling cannot push a good at rock bottom any lower; it recovers towards its usual price over time and as the crown kingdoms buy.',
          )}
        </p>
      )}
      <CrownBuyers world={world} market={market} now={now} />
      {has ? (
        <>
          <div className="segmented choices" role="radiogroup" aria-label={L('Alınacak mal', 'Good to buy')}>
            {MARKET_GOODS.map((g) => (
              <button key={g} className="btn small" role="radio" aria-checked={good === g} onClick={() => setGood(g)}>
                <Icon name={RESOURCE_ICONS[g]} size={16} /> {L(RESOURCE_NAMES[g].split(' ')[0], RESOURCE_NAMES[g].replace(' materials', ''))}
              </button>
            ))}
          </div>
          <div className="stepper">
            <button className="btn icon-only" disabled={units <= 50} data-why={L('En az 50 birim alınır', 'At least 50 units')} onClick={() => setUnits(units - 50)} aria-label={L('Azalt', 'Decrease')}>
              <Icon name="minus" size={16} />
            </button>
            <span className="stepper-value">
              <b>{units}</b> {L('birim', 'units')}
            </span>
            <button className="btn icon-only" disabled={units >= buyPerClick} data-why={L(`Bir tıkta en fazla ${buyPerClick} birim`, `At most ${buyPerClick} units per click`)} onClick={() => setUnits(Math.min(buyPerClick, units + 50))} aria-label={L('Artır', 'Increase')}>
              <Icon name="plus" size={16} />
            </button>
            <button
              className="btn small"
              disabled={!!why}
              data-why={
                sending
                  ? L('Fiyat güncelleniyor, lütfen bekle', 'Updating the price, please wait')
                  : adding <= 0
                    ? L(`Sepet dolu (en fazla ${maxBuy} birim); gönderilmesini bekle`, `Basket full (at most ${maxBuy} units); wait for it to be sent`)
                    : why === 'cost'
                      ? L(`Yeterli altın yok (eksik: ${Math.ceil(cost - kingdom.stock.gold)})`, `Not enough gold (short by ${Math.ceil(cost - kingdom.stock.gold)})`)
                      : why === 'building'
                        ? L('Pazar binası henüz bitmedi', 'The market building is not finished yet')
                        : L('Şu an alınamaz', 'Cannot buy right now')
              }
              onClick={add}
            >
              {L(`${cost} altına al`, `Buy for ${cost} gold`)}
            </button>
          </div>
          {discount > 0 && <p className="hint up">{L(`Lonca konağı pazarlık ediyor: pazar binasının fiyatı −%${Math.round(discount * 100)}.`, `The guild hall drives a hard bargain: market prices −${Math.round(discount * 100)}%.`)}</p>}
          {(basket || sending) && (
            <p className="hint">
              {basket
                ? L(
                    `Sepette ${basket.units} ${RESOURCE_NAMES[basket.good].toLocaleLowerCase(locale())} (${buyCost(market, basket.good, basket.units, now, discount)} altın, en fazla ${maxBuy}). `,
                    `In the basket: ${basket.units} ${RESOURCE_NAMES[basket.good].toLocaleLowerCase(locale())} (${buyCost(market, basket.good, basket.units, now, discount)} gold, at most ${maxBuy}). `,
                  )
                : ''}
              {L('Fiyat güncelleniyor, lütfen bekle…', 'Updating the price, please wait…')}
            </p>
          )}
        </>
      ) : (
        <p className="hint">{L('Pazar binası kurarsan (2. seviye saray) altınla hammadde alabilirsin.', 'Build a market (level 2 palace) and you can buy raw goods with gold.')}</p>
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
    <Section title={L('Sefer başına satış', 'Sold per trip')} icon="trade" aside={L(`${current} / ${cap} birim`, `${current} / ${cap} units`)}>
      <div className="stepper">
        <button className="btn icon-only" disabled={shown <= amountStep} data-why={L(`En az ${amountStep} birim`, `At least ${amountStep} units`)} onClick={() => setUnits(Math.max(amountStep, shown - amountStep))} aria-label={L('Azalt', 'Decrease')}>
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{shown}</b> {L('birim', 'units')}
        </span>
        <button className="btn icon-only" disabled={shown >= cap} data-why={L(`Bu seviyenin sınırı ${cap} birim; ticaret noktasını geliştir`, `This level's limit is ${cap} units; upgrade the trading post`)} onClick={() => setUnits(Math.min(cap, shown + amountStep))} aria-label={L('Artır', 'Increase')}>
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={shown === current || wait > 0} data-why={wait > 0 ? waitWhy(wait * 1000, L('Satış miktarı az önce değişti; ', 'The amount was just changed; ')) : L('Seçili miktar zaten uygulanıyor', 'The chosen amount is already in effect')} onClick={() => onTradeAmount(shown)}>
          {wait > 0 ? L(`${wait} sn sonra`, `in ${wait} s`) : L('Uygula', 'Apply')}
        </button>
      </div>
      <p className="hint">
        {L(
          `Tüccar her seferde bu kadar götürür (${amountStep}'er birim, en fazla seviyenin sınırı ${cap}). Değiştirdikten sonra ${Math.round(amountCooldownSeconds / 60)} dakika yeniden değiştiremezsin.`,
          `The merchant takes this much each trip (in steps of ${amountStep}, up to the level's limit of ${cap}). Once changed, it cannot be changed again for ${Math.round(amountCooldownSeconds / 60)} minutes.`,
        )}
      </p>
    </Section>
  )
}

function TradePost(data: HudData) {
  const { world, kingdom, now, onGood, onUpgrade, onShow, online } = data
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost')
  if (!post) return (
      <Placeholder icon="trade" title={L('Ticaret noktan yok', 'You have no trading post')}>
        {L('Ticaret arsası bulunamadı.', 'No trading plot was found.')}
      </Placeholder>
    )
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
            <Icon name="warn" size={16} /> {L('Ticaret noktan yağmacılarca harap edildi: onarılana kadar tüccar satış yapamaz.', 'Raiders have wrecked your trading post: the merchant cannot sell until it is repaired.')}
          </p>
          <div className="row">
            <CostList cost={tradeRepairCost()} stock={kingdom.stock} />
            <button className="btn small" disabled={!affordable(kingdom.stock, tradeRepairCost())} data-why={lackWhy(kingdom.stock, tradeRepairCost()) ?? undefined} onClick={() => online?.act({ type: 'repairTrade' })}>
              {L('Onar', 'Repair')}
            </button>
          </div>
        </div>
      )}
      <Section title={L('Satılacak mal', 'Good to sell')} icon="chest">
        <GoodChoice kingdom={kingdom} selected={trade.good} onGood={onGood} market={online?.market} now={now} />
      </Section>
      <TradeDestination world={world} kingdom={kingdom} market={online?.market} now={now} online={online} onCity={(city) => online?.act({ type: 'tradeCity', city })} onInn={(inn) => online?.act({ type: 'tradeInn', x: inn.x, y: inn.y })} />
      <div className="feature">
        <SpriteView sprite={thumb('tradePost')} scale={0.5} />
        <div>
          <b>{L(`Ticaret noktası · Seviye ${trade.level + 1}`, `Trading post · Level ${trade.level + 1}`)}</b>
          <p className="hint">
            {L(
              `Tüccar her ${Math.round(tripMs / 1000)} saniyede ${tradeLoad(kingdom)} birim mal götürüp ${trade.city ? 'taç başkentinde lobinin o anki fiyatından' : trade.inn ? 'handa, hancının verdiği fiyattan' : 'lobinin o anki fiyatından'} altına çevirir${kingdom.trade.good ? ` (şu an birimi ${tradePrice(kingdom, kingdom.trade.good, online?.market, now).toFixed(2).replace('.', ',')} altın)` : ''}.`,
              `Every ${Math.round(tripMs / 1000)} seconds the merchant takes ${tradeLoad(kingdom)} units of goods and turns them into gold ${trade.city ? "in the crown's capital at the lobby's going price" : trade.inn ? "at the inn, at the innkeeper's price" : "at the lobby's going price"}${kingdom.trade.good ? ` (currently ${tradePrice(kingdom, kingdom.trade.good, online?.market, now).toFixed(2)} gold a unit)` : ''}.`,
            )}
          </p>
          <button className="btn small" onClick={() => onShow(center(post))}>
            <Icon name="pin" size={16} /> {L('Haritada göster', 'Show on map')}
          </button>
        </div>
      </div>
      {cutOff(kingdom.buildings, kingdom.site, now).has(post.id) && (
        <p className="alert">
          <Icon name="warn" size={16} /> {L('Tüccar surların içinde kaldı: saraydan ticaret noktasına yol yok. Sura bir kapı yap.', 'The merchant is walled in: there is no way from the palace to the trading post. Put a gate in the wall.')}
        </p>
      )}
      {trade.good && goldCap(kingdom, now) - kingdom.stock.gold < 1 && (
        <p className="alert">
          <Icon name="gold" size={16} />{' '}
          {L(
            'Hazine dolu: tüccar mal götürmüyor, bekliyor. Haraç, harcama ya da yeni bir hazine yer açınca yeniden satmaya başlar.',
            'Treasury full: the merchant takes no goods and waits. He starts selling again once tribute, spending or a new treasury makes room.',
          )}
        </p>
      )}
      {trade.good && kingdom.stock[trade.good] - tradeReserve(kingdom, trade.good, now) < 1 && (roundOutcome(kingdom, now).delta[trade.good] ?? 0) <= 0 && (
        <p className="alert">
          <Icon name="warn" size={16} />{' '}
          {L(
            `Ambarda satılacak ${RESOURCE_NAMES[trade.good].toLocaleLowerCase(locale())} kalmadı: tüccar eli boş bekliyor. Başka bir mal seç ya da bu malın üretimini artır.`,
            `No ${RESOURCE_NAMES[trade.good].toLocaleLowerCase(locale())} left in store to sell: the merchant waits empty-handed. Pick another good or make more of this one.`,
          )}
        </p>
      )}
      {trade.good && <TradeAmount {...data} />}
      {trade.good && (
        <Section title={L('Tüccar yolda', 'Merchant on the road')} icon="time" aside={L(`${Math.max(0, Math.ceil((tripMs - (now - trade.departedAt)) / 1000))} sn`, `${Math.max(0, Math.ceil((tripMs - (now - trade.departedAt)) / 1000))} s`)}>
          <Meter value={progress} label={L('Tüccarın yolculuğu', "The merchant's journey")} segments={16} />
        </Section>
      )}
      <Section title={L('Geliştir', 'Upgrade')} icon="plus">
        {next ? (
          <button className="btn wide" disabled={!affordable(kingdom.stock, next)} data-why={lackWhy(kingdom.stock, next) ?? undefined} onClick={onUpgrade}>
            <span>
              {L(`Seviye ${trade.level + 2}: sefer başına ${nextUnits} birim`, `Level ${trade.level + 2}: ${nextUnits} units per trip`)}
            </span>
            <CostList cost={next} stock={kingdom.stock} />
          </button>
        ) : (
          <p className="hint">{L('En yüksek seviyede.', 'At the highest level.')}</p>
        )}
      </Section>
    </>
  )
}

// ---- Krallık --------------------------------------------------------------------------------------------------------

const describe = (plot: Plot | null | undefined) =>
  !plot ? L('yok', 'none') : plot.granted ? L(`hudut dışında, ${plot.distance} karo`, `outside the border, ${plot.distance} tiles`) : L('hudut içinde', 'inside the border')

// The palace tab in three parts, the one last looked at remembered (in this browser).
type PalacePart = 'level' | 'house' | 'expeditions' | 'goals' | 'projects' | 'buildings'
const PALACE_PARTS: PalacePart[] = ['level', 'house', 'expeditions', 'goals', 'projects', 'buildings']

// Opens the palace tab at a part next time (or now, if it is open): for whatever sends the player there.
export const showPalacePart = (part: PalacePart) => showPart('palace', part)

export function KingdomTab(data: HudData) {
  const { kingdom, now, stage, plots, confirmReset, onUpgradeBuilding, onReset, onShow } = data
  const palace = kingdom.buildings.find((b) => b.kind === 'palace')
  const size = balance.territory.stageParcels[stage]
  // While the palace is being raised its level already reads the new one, but the border grows only when the work is done.
  const nextSize = palace && (upgradeSpec(palace) || palace.doneAt > now) ? balance.territory.stageParcels[stage + 1] : undefined
  // Before founding the plot comes from the site; afterwards the kingdom keeps it, until a dock stands on it.
  const dock = kingdom.buildings.find((b) => b.kind === 'dock')
  const dockState = dock
    ? dock.doneAt > now
      ? L('inşa ediliyor', 'under construction')
      : L(`kuruldu (Sv. ${dock.level ?? 1})`, `built (Lv. ${dock.level ?? 1})`)
    : kingdom.dockPlot
      ? L('arsa hazır, kurulmadı', 'plot ready, not built')
      : describe(plots?.dock)
  // How many buildings can go up a level (CLAUDE.md §5.5): not at the top, finished, not held back by the house limit
  // or a missing queen/fealty; of those, how many could start right now (goods in store, a construction slot free).
  const upgradable = (() => {
    const byKind = new Map<BuildingKind, { total: number; now: number }>()
    let total = 0
    let ready = 0
    for (const b of kingdom.buildings) {
      const why = upgradeError(kingdom, b.id, now)
      if (why !== null && why !== 'cost' && why !== 'queue') continue
      const e = byKind.get(b.kind) ?? { total: 0, now: 0 }
      e.total++
      total++
      if (why === null) (e.now++, ready++)
      byKind.set(b.kind, e)
    }
    return { byKind, total, now: ready }
  })()
  const counts = new Map<BuildingKind, number>()
  for (const b of kingdom.buildings) if (b.doneAt <= now) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1)
  const [part, setPart] = usePart('palace', PALACE_PARTS, 'level')
  const d = kingdom.dynasty
  // The house waits on the lord: a young child still to be named, or one with no upbringing chosen.
  const houseWaits = houseWaiting(d, now, !!kingdom.pretender)
  // A party's report opened from the expeditions part (CLAUDE.md §9.9).
  const [report, setReport] = useState<Expedition | null>(null)
  const away = expeditionsOut(kingdom, now).length
  return (
    <>
      <Subtabs
        label={L('Saray', 'Palace')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'level', name: L('Seviye', 'Level'), icon: 'home' },
          { id: 'house', name: L('Hanedan', 'Dynasty'), icon: 'crown', dot: houseWaits },
          { id: 'expeditions', name: L('Seferler', 'Expeditions'), icon: 'pin', count: away },
          { id: 'goals', name: L('Hedefler', 'Goals'), icon: 'star' },
          { id: 'projects', name: L('Projeler', 'Projects'), icon: 'build' },
          { id: 'buildings', name: L('Yapılar', 'Buildings'), icon: 'build' },
        ]}
      />
      {part === 'level' && (
        <>
          <div className="feature">
            <SpriteView sprite={thumb('palace', kingdom.color)} scale={0.5} />
            <div>
              <b>{L('Saray', 'Palace')}</b>
              <GoalTitle kingdom={kingdom} />
              <p className="hint">{palace ? L('Lordluğun kalbi. Lord ve kraliçe burada yaşar.', 'The heart of the lordship. The lord and the queen live here.') : L('Sarayın henüz yerleştirilmedi.', 'Your palace has not been placed yet.')}</p>
              {palace && (
                <button className="btn small" onClick={() => onShow(center(palace))}>
                  <Icon name="home" size={16} /> {L('Saraya git', 'Go to the palace')}
                </button>
              )}
            </div>
          </div>
          <Section title={L('Hudut', 'Border')} icon="pin" aside={L(`${size}×${size} parsel`, `${size}×${size} parcels`)}>
            <ol className="stages-track" aria-label={L('Hudut aşamaları', 'Border stages')}>
              {balance.territory.stageParcels.map((parcels, i) => (
                <li key={parcels} className={i === stage ? 'now' : i < stage ? 'past' : ''} aria-current={i === stage ? 'step' : undefined}>
                  <b>
                    {parcels}×{parcels}
                  </b>
                  <small>{L(`Saray Sv. ${i + 1}`, `Palace Lv. ${i + 1}`)}</small>
                </li>
              ))}
            </ol>
            {palace && nextSize ? (
              <>
                <p className="hint">
                  {L(
                    `Hudut sarayla büyür. Sarayı ${stage + 2}. seviyeye yükseltince hudut ${nextSize}×${nextSize} parsel olur.`,
                    `The border grows with the palace. Raise the palace to level ${stage + 2} and the border becomes ${nextSize}×${nextSize} parcels.`,
                  )}
                </p>
                {palace.doneAt > now ? (
                  <p className="hint up">{L(`Saray yükseltiliyor: ${Math.ceil((palace.doneAt - now) / 1000)} sn`, `Palace upgrading: ${Math.ceil((palace.doneAt - now) / 1000)} s`)}</p>
                ) : (
                  <>
                  <button className="btn wide" disabled={upgradeError(kingdom, palace.id, now) !== null} data-why={buildWhy(upgradeError(kingdom, palace.id, now), kingdom, now, upgradeSpec(palace)?.cost)} onClick={() => onUpgradeBuilding(palace.id)}>
                    <span>
                      {L('Sarayı yükselt', 'Upgrade the palace')} <small>{L(`(${upgradeSpec(palace)?.buildSeconds} sn)`, `(${upgradeSpec(palace)?.buildSeconds} s)`)}</small>
                    </span>
                    <CostList cost={upgradeSpec(palace)?.cost} stock={kingdom.stock} />
                  </button>
                  <Missing cost={upgradeSpec(palace)?.cost} stock={kingdom.stock} />
                  {upgradeError(kingdom, palace.id, now) === 'liege' && <p className="hint down">{L('Önce aşağıdaki Bağlılık bölümünden bir taç krallığına biat et.', 'First swear fealty to a crown kingdom in the Allegiance section below.')}</p>}
                  {upgradeError(kingdom, palace.id, now) === 'queen' && <QueenNeeded kingdom={kingdom} now={now} online={data.online} />}
                  </>
                )}
              </>
            ) : (
              palace && <p className="hint">{L('Hudut en geniş hâlinde.', 'The border is at its widest.')}</p>
            )}
            <Stat label={L('İskele', 'Dock')} value={dockState} />
            {dock ? (
              <button className="btn small" onClick={() => onShow(center(dock))}>
                <Icon name="pin" size={16} /> {L('İskeleye git', 'Go to the dock')}
              </button>
            ) : kingdom.dockPlot ? (
              <button className="btn small" onClick={() => onShow(center(kingdom.dockPlot!))}>
                <Icon name="pin" size={16} /> {L('Arsayı göster', 'Show the plot')}
              </button>
            ) : null}
          </Section>
          <Fealty world={data.world} kingdom={kingdom} now={data.now} onSwear={(city) => data.online?.act({ type: 'swear', city })} onOpen={(city) => data.online?.openCrown(city)} />
        </>
      )}
      {part === 'house' && <DynastySection kingdom={kingdom} now={data.now} online={data.online} onShow={onShow} />}
      {part === 'expeditions' && <ExpeditionsPanel kingdom={kingdom} now={now} online={data.online} onReport={setReport} />}
      {part === 'goals' && <GoalsPanel kingdom={kingdom} now={now} />}
      {part === 'projects' && <ProjectsPanel kingdom={kingdom} now={now} online={data.online} />}
      {report && <ExpeditionReport expedition={report} kingdom={kingdom} online={data.online} onClose={() => setReport(null)} />}
      {part === 'buildings' && (
        <Section
          title={L('Yapılar', 'Buildings')}
          icon="build"
          aside={L(`${kingdom.buildings.length} toplam${upgradable.total > 0 ? ` · ${upgradable.total} yükseltilebilir` : ''}`, `${kingdom.buildings.length} total${upgradable.total > 0 ? ` · ${upgradable.total} upgradable` : ''}`)}
        >
          {upgradable.total > 0 && (
            <p className="hint">
              {L(
                `${upgradable.total} yapı bir üst seviyeye çıkabilir${upgradable.now > 0 ? `; ${upgradable.now} tanesi şu an hemen yükseltilebilir` : '; şu an malzeme ya da inşaat yeri bekliyorlar'}.`,
                `${upgradable.total} building${upgradable.total === 1 ? '' : 's'} can go up a level${upgradable.now > 0 ? `; ${upgradable.now} can be upgraded right now` : '; for now they wait on materials or a construction slot'}.`,
              )}
            </p>
          )}
          <ul className="tally">
            {[...counts].map(([kind, n]) => (
              <li key={kind}>
                <SpriteView sprite={thumb(kind, kingdom.color)} scale={kind === 'house' ? 0.5 : 0.25} label={BUILDING_NAMES[kind]} />
                <span>
                  {BUILDING_NAMES[kind]}
                  {(upgradable.byKind.get(kind)?.total ?? 0) > 0 && (
                    <small className={(upgradable.byKind.get(kind)?.now ?? 0) > 0 ? 'up' : 'muted'}>
                      {L(`${upgradable.byKind.get(kind)!.total} yükseltilebilir`, `${upgradable.byKind.get(kind)!.total} upgradable`)}
                      {(upgradable.byKind.get(kind)?.now ?? 0) > 0 ? L(` · ${upgradable.byKind.get(kind)!.now} hemen`, ` · ${upgradable.byKind.get(kind)!.now} now`) : ''}
                    </small>
                  )}
                </span>
                <b className={capOf(kingdom, kind, now) !== null && n >= capOf(kingdom, kind, now)! ? 'down' : undefined}>
                  {n}
                  {capOf(kingdom, kind, now) !== null ? ` / ${capOf(kingdom, kind, now)}` : kind === 'house' ? L(` · ${plannedHousing(kingdom)} / ${population(kingdom, now).cap} barınak`, ` · ${plannedHousing(kingdom)} / ${population(kingdom, now).cap} housing`) : ''}
                </b>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={L('Lordluğu sıfırla', 'Reset the lordship')} icon="warn">
        <p className="hint">
          {L(
            'Her şey en baştan başlar: saray, yapılar, hazine ve depolar, ordular ve gemiler, hanedan ve kasabalar silinir; lobide yeni bir yer seçip lordluğunu yeniden kurarsın. Geri alınamaz.',
            'Everything starts over: the palace, buildings, treasury and stores, armies and ships, the dynasty and towns are wiped; you choose a new site in the lobby and found your lordship again. This cannot be undone.',
          )}
        </p>
        <button className={confirmReset ? 'btn small danger' : 'btn small'} onClick={onReset}>
          {confirmReset ? L('Emin misin? Her şey silinecek', 'Are you sure? Everything will be wiped') : L('Lordluğu sıfırla', 'Reset the lordship')}
        </button>
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
  const { villagers, soldiers, sailors, cap, housing, jobs, efficiency, away } = population(kingdom, now)
  const food = flows(kingdom, now).food
  const houses = kingdom.buildings.filter((b) => b.kind === 'house' && b.doneAt <= now).length
  // How the people are doing, read off the state of the kingdom: fed and put to work. A shrinking granary only
  // worries them once it holds less than about 20 rounds of food.
  const fed = food.net >= 0 ? 1 : Math.max(0, Math.min(1, kingdom.stock.food / (-food.net * 20)))
  const working = jobs === 0 ? 1 : Math.min(1, villagers / jobs)
  const idle = Math.max(0, villagers - jobs)
  const signs = [
    {
      name: L('Gıda', 'Food'),
      value: fed,
      note: food.net >= 0 ? L('Ambar doluyor', 'Food stores are filling') : L(`Ambar ~${Math.floor(kingdom.stock.food / -food.net)} tur yeter`, `Food lasts ~${Math.floor(kingdom.stock.food / -food.net)} rounds`),
    },
    {
      name: L('İş gücü', 'Workforce'),
      value: working,
      note: villagers < jobs ? L(`${jobs - villagers} işçi eksik`, `${jobs - villagers} worker${jobs - villagers === 1 ? '' : 's'} short`) : idle > 0 ? L(`${idle} köylü boşta`, `${idle} villager${idle === 1 ? '' : 's'} idle`) : L('Herkes işinde', 'Everyone is at work'),
    },
  ]
  const worst = Math.min(...signs.map((s) => s.value))
  const mood = worst >= 0.9 ? 'happy' : worst >= 0.5 ? 'content' : 'unhappy'
  const moodName = { happy: L('Memnun', 'Content'), content: L('İdare ediyor', 'Getting by'), unhappy: L('Huzursuz', 'Restless') }[mood]
  const happiness = kingdom.happiness ?? balance.society.happiness.start
  // The queen's part waits on the lord when she is held, or when one can be had.
  const queenWaits = !!kingdom.queenHeldBy || (!kingdom.queen && queenError(kingdom, now) === null)
  return (
    <>
      <PeopleAlerts kingdom={kingdom} now={now} online={online} />
      <Subtabs
        label={L('Halk', 'People')}
        part={part}
        onPart={setPart}
        parts={[
          { id: 'people', name: L('Nüfus', 'Population'), icon: 'villager' },
          { id: 'mood', name: L('Mutluluk', 'Happiness'), icon: happiness >= 60 ? 'happy' : happiness >= 35 ? 'content' : 'unhappy' },
          { id: 'health', name: L('Sağlık ve din', 'Health and faith'), icon: 'heal' },
          { id: 'queen', name: L('Kraliçe', 'Queen'), icon: 'crown', dot: queenWaits },
        ]}
      />
      {part === 'people' && (
        <>
          <div className="feature mood">
            <Icon name={mood} size={48} />
            <div>
              <b>{L(`Halk ${moodName.toLowerCase()}`, `The people: ${moodName.toLowerCase()}`)}</b>
              <p className="hint">{L('Halkın hâli karnının tokluğuna ve işine bağlı.', 'How the people fare depends on full bellies and work.')}</p>
            </div>
          </div>
          <Section title={L('Halkın durumu', 'State of the people')} icon="people">
            {signs.map((s) => (
              <div key={s.name} className="sign">
                <span>{s.name}</span>
                <Meter value={s.value} tone={s.value >= 0.9 ? 'up' : s.value >= 0.5 ? 'gold' : 'down'} label={s.name} segments={10} />
                <small>{s.note}</small>
              </div>
            ))}
          </Section>
          <Section title={L('İş gücü', 'Workforce')} icon="villager">
            <Stat label={L('Köylü', 'Villagers')} value={villagers} note={L(`${houses} ev`, `${houses} house${houses === 1 ? '' : 's'}`)} />
            <Stat label={L('İş gücü ihtiyacı', 'Workers needed')} value={jobs} tone={villagers < jobs ? 'down' : undefined} />
            {away > 0 && <Stat label={L('Seferde', 'On expedition')} value={away} note={L('çalışmaz, vergi vermez', 'they neither work nor pay tax')} />}
            <Stat label={L('Üretim verimi', 'Production efficiency')} value={L(`%${Math.round(efficiency * 100)}`, `${Math.round(efficiency * 100)}%`)} tone={efficiency < 1 ? 'down' : 'up'} />
            <Stat label={L('Yemek tüketimi', 'Food eaten')} value={L(`${signed(-food.used)} / tur`, `${signed(-food.used)} / round`)} />
          </Section>
          <PopulationPanel kingdom={kingdom} now={now} online={online} />
          <Section title={L('Nüfus sınırı', 'Population limit')} icon="villager" aside={`${villagers + soldiers + sailors} / ${cap}`}>
            <Meter value={cap ? (villagers + soldiers + sailors) / cap : 0} tone={villagers + soldiers + sailors >= cap ? 'down' : 'gold'} label={L('Nüfus', 'Population')} segments={16} />
            <p className="hint">
              {L(
                `Sarayın her seviyesi ${balance.society.popCapPerPalaceLevel} kişilik yer açar. Evlerin ${housing} kişilik yeri var${housing > cap ? `; ${housing - cap} kişi sığmıyor, sarayı yükselt` : ''}. Askerler de bu sınırdan sayılır.`,
                `Each palace level makes room for ${balance.society.popCapPerPalaceLevel} people. Your houses hold ${housing}${housing > cap ? `; ${housing - cap} do not fit, upgrade the palace` : ''}. Soldiers count against this limit too.`,
              )}
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

const TAX_NAMES: Record<TaxLevel, string> = { low: L('Düşük', 'Low'), normal: L('Normal', 'Normal'), high: L('Yüksek', 'High'), heavy: L('Ağır', 'Heavy') }
const QUEEN_WHY: Record<string, string> = {
  locked: L('sarayı 2. seviyeye yükselt', 'raise the palace to level 2'),
  people: L(`en az ${balance.society.queen.minPopulation} nüfus gerekir`, `needs a population of at least ${balance.society.queen.minPopulation}`),
  cost: L('altın yetmiyor', 'not enough gold'),
  busy: L('kraliçen rehin', 'your queen is held hostage'),
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
          <Icon name="warn" size={16} />{' '}
          {L(
            `Sınırında düşman ordusu bekliyor: halk korkuyor (mutluluk −${Math.abs(balance.military.fear.happiness)}).`,
            `An enemy army waits at your border: the people are afraid (happiness −${Math.abs(balance.military.fear.happiness)}).`,
          )}
        </p>
      )}
      {imprisoned(kingdom.buildings, kingdom.site, now) && (
        <p className="alert">
          <Icon name="warn" size={16} />{' '}
          {L(
            `Surlarında kapı yok, halk dışarı çıkamıyor: lordluğun bir hapishane (mutluluk −${Math.abs(balance.society.happiness.imprisoned)}). Sura bir kapı koy.`,
            `Your walls have no gate and the people cannot get out: your lordship is a prison (happiness −${Math.abs(balance.society.happiness.imprisoned)}). Put a gate in the wall.`,
          )}
        </p>
      )}
      {(kingdom.revoltUntil ?? 0) > now && (
        <p className="alert">
          <Icon name="warn" size={16} />{' '}
          {L(
            `Halk ayaklandı: ${Math.ceil(((kingdom.revoltUntil ?? 0) - now) / 60000)} dakika daha üretim yarıda ve mutluluk düşük.`,
            `The people have risen: for ${Math.ceil(((kingdom.revoltUntil ?? 0) - now) / 60000)} more minutes production is halved and happiness low.`,
          )}
        </p>
      )}
      {broken > 0 && (
        <Section title={L('Yıkık surlar', 'Broken walls')} icon="warn" aside={`${broken}`}>
          <button className="btn small" onClick={() => online?.act({ type: 'repairWalls' })}>
            {L('Onar', 'Repair')} · {Object.entries(walls).map(([r, v]) => `${v} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`).join(', ')}
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
      <Section
        title={L('Mutluluk', 'Happiness')}
        icon={happiness >= 60 ? 'happy' : happiness >= 35 ? 'content' : 'unhappy'}
        aside={L(`%${Math.round(happiness)} → %${Math.round(target)}`, `${Math.round(happiness)}% → ${Math.round(target)}%`)}
      >
        <Meter value={happiness / 100} tone={happiness >= 60 ? 'up' : happiness >= 35 ? 'gold' : 'down'} label={L('Mutluluk', 'Happiness')} segments={20} />
        <p className="hint">
          {L(
            'Mutluluk her tur hedefe doğru kayar. Vergi, kraliçe, tapınak, hastalık, günün olayları ve aç kalmak hedefi belirler; mutlu halk daha çok ve daha ucuza asker olur.',
            "Happiness drifts towards its target every round. Tax, the queen, the temple, sickness, the day's events and hunger set the target; a happy people yields more soldiers, and cheaper.",
          )}
        </p>
        {memorialHappiness(kingdom, now) > 0 && <Stat label={L('Hanedan anıtı', 'Dynasty monument')} value={`+${memorialHappiness(kingdom, now)}`} note={L('hanedanın şanı mutluluk hedefine eklenir', "the house's glory adds to the happiness target")} />}
        {projectEffects(kingdom, now).happiness > 0 && (
          <Stat label={L('Ulu Katedral', 'Great Cathedral')} value={`+${projectEffects(kingdom, now).happiness}`} note={L('büyük işin aşamaları mutluluk hedefine eklenir', "the great work's stages add to the happiness target")} />
        )}
        {festivalHappiness(kingdom, now) > 0 && <Stat label={L('Halk şenliği', 'Folk festival')} value={`+${festivalHappiness(kingdom, now)}`} note={L('şenlik sürdükçe', 'while the festival lasts')} />}
        <OutlawToll kingdom={kingdom} mood />
      </Section>
      <Section
        title={L('Vergi', 'Tax')}
        icon="gold"
        aside={L(
          `köylü başına ${balance.society.tax.levels[tax].goldPerVillager.toLocaleString(locale(), { maximumFractionDigits: 3 })} altın / tur`,
          `${balance.society.tax.levels[tax].goldPerVillager.toLocaleString(locale(), { maximumFractionDigits: 3 })} gold per villager / round`,
        )}
      >
        <div className="segmented choices" role="radiogroup" aria-label={L('Vergi oranı', 'Tax rate')}>
          {TAX_LEVELS.map((t) => (
            <button key={t} className="btn small" role="radio" aria-checked={tax === t} onClick={() => online?.act({ type: 'tax', tax: t })}>
              {TAX_NAMES[t]}
            </button>
          ))}
        </div>
        <Stat
          label={L('Mutluluğa etkisi', 'Effect on happiness')}
          value={`${balance.society.tax.levels[tax].happiness >= 0 ? '+' : ''}${Math.round(balance.society.tax.levels[tax].happiness * (balance.society.tax.levels[tax].happiness < 0 ? sermonTaxFactor(kingdom, now) : 1))}`}
          note={sermonTaxFactor(kingdom, now) < 1 ? L('tapınakta vaaz sürüyor', 'a sermon is under way at the temple') : undefined}
        />
      </Section>
      <Section
        title={L('Gece mesaisi', 'Night shift')}
        icon={night ? 'moon' : 'sun'}
        aside={L(`şu an ${night ? 'gece' : 'gündüz'} · iş %${Math.round(rate * 100)}`, `now ${night ? 'night' : 'day'} · work ${Math.round(rate * 100)}%`)}
      >
        <p className="hint">
          {L(
            `Geceleri halk dinlenir ve yalnızca %${Math.round(n.workRate * 100)} çalışır. Gece mesaisinde tam çalışır ama mutluluk ${Math.abs(n.shiftHappiness)} puan düşer ve biriken yorgunluk gündüz verimini de azaltır.`,
            `At night the people rest and work at only ${Math.round(n.workRate * 100)}%. On the night shift they work fully, but happiness drops ${Math.abs(n.shiftHappiness)} points and the fatigue that builds up lowers daytime output too.`,
          )}
        </p>
        <div className="segmented choices" role="radiogroup" aria-label={L('Gece mesaisi', 'Night shift')}>
          <button className="btn small" role="radio" aria-checked={!kingdom.nightShift} onClick={() => online?.act({ type: 'nightShift', on: false })}>
            <Icon name="moon" size={16} /> {L('Geceleri dinlensinler', 'Let them rest at night')}
          </button>
          <button className="btn small" role="radio" aria-checked={!!kingdom.nightShift} onClick={() => online?.act({ type: 'nightShift', on: true })}>
            <Icon name="sun" size={16} /> {L('Gece de çalışsınlar', 'Work through the night')}
          </button>
        </div>
        <div className="sign">
          <span>{L('Yorgunluk', 'Fatigue')}</span>
          <Meter value={fatigue / n.maxFatigue} tone={fatigue > n.maxFatigue / 2 ? 'down' : 'gold'} label={L('Yorgunluk', 'Fatigue')} segments={10} />
          <small>{L(`verim −%${Math.round(fatigue * 100)}`, `output −${Math.round(fatigue * 100)}%`)}</small>
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
        <Section title={L('Sağlık', 'Health')} icon="heal">
          <Sickness kingdom={kingdom} now={now} />
          <p className="hint">
            {L(
              'Köylüler zaman zaman hastalanır; hasta köylü çalışmaz, vergi vermez ve halkın keyfini kaçırır. Kendiliğinden yavaşça iyileşirler; hastane (3. seviye saray) iyileşmeyi hızlandırır.',
              "Villagers fall ill from time to time; a sick villager neither works nor pays tax, and spoils the people's mood. They slowly recover on their own; a hospital (level 3 palace) speeds recovery.",
            )}
          </p>
        </Section>
      )}
      {temple ? (
        <TemplePanel data={data} />
      ) : (
        <Section title={L('İnanç', 'Faith')} icon="temple">
          <p className="hint">
            {L(
              'Tapınak (3. seviye saray) halkın mutluluğunu artırır, askerlerine iman gücü verir; rahipleri vaaz verince vergiler halka daha az ağır gelir.',
              'A temple (level 3 palace) raises the people’s happiness and gives your soldiers the strength of faith; when its priests preach, taxes weigh less on the people.',
            )}
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
        {L(`Sarayı ${balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için sarayda bir kraliçe olmalı.`, `To raise the palace to level ${balance.dynasty.queenForPalaceLevel} there must be a queen at court.`)}
        {kingdom.queenHeldBy &&
          L(` Kraliçen ${kingdom.queenHeldBy.name} lordunun elinde: Halk sekmesi → Kraliçe'den fidyesini öde.`, ` Your queen is held by ${kingdom.queenHeldBy.name}: pay her ransom under People → Queen.`)}
      </p>
      {!kingdom.queenHeldBy && (
        <button className="btn small" disabled={!!why} data-why={why === 'cost' ? L(`Yeterli altın yok (eksik: ${Math.ceil(balance.society.queen.cost.gold - kingdom.stock.gold)})`, `Not enough gold (short by ${Math.ceil(balance.society.queen.cost.gold - kingdom.stock.gold)})`) : sentence(why ? QUEEN_WHY[why] : undefined)} onClick={() => online?.act({ type: 'queen' })}>
          <Icon name="crown" size={16} /> {L('Kraliçe bul', 'Find a queen')} ·{' '}
          {queenOwed(kingdom, now) ? L('hemen, bedelsiz', 'at once, free of charge') : L(`${balance.society.queen.cost.gold} altın`, `${balance.society.queen.cost.gold} gold`)} {why ? `(${QUEEN_WHY[why] ?? ''})` : ''}
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
      <Section title={L('Kraliçe', 'Queen')} icon="crown">
        {kingdom.queenHeldBy ? (
          <>
            <p className="alert">
              <Icon name="warn" size={16} />{' '}
              {L(
                `Kraliçen ${kingdom.queenHeldBy.name} lordunun elinde! Halk yas tutuyor (mutluluk ${balance.espionage.operations.kidnap.happiness}).`,
                `Your queen is held by ${kingdom.queenHeldBy.name}! The people are in mourning (happiness ${balance.espionage.operations.kidnap.happiness}).`,
              )}
            </p>
            <button className="btn small" disabled={kingdom.stock.gold < ransom} data-why={L(`Yeterli altın yok (eksik: ${Math.ceil(ransom - kingdom.stock.gold)})`, `Not enough gold (short by ${Math.ceil(ransom - kingdom.stock.gold)})`)} onClick={() => online?.act({ type: 'ransom' })}>
              {L(`Fidye öde · ${ransom} altın`, `Pay the ransom · ${ransom} gold`)}
            </button>
            <p className="hint">{L(`Ya da ${kingdom.queenHeldBy.name} ile savaş: kaçırılan kraliçe sana savaş gerekçesi verir.`, `Or go to war with ${kingdom.queenHeldBy.name}: a kidnapped queen gives you a casus belli.`)}</p>
          </>
        ) : kingdom.queen ? (
          <p className="hint">
            {L(
              `Sarayında Kraliçe ${kingdom.dynasty?.queen?.name ?? ''} var: halkın mutluluğu +${balance.society.happiness.queen}; hanedanın çocukları onunla doğar.`,
              `Queen ${kingdom.dynasty?.queen?.name ?? ''} is at your court: the people's happiness +${balance.society.happiness.queen}; the house's children are born of her.`,
            )}
          </p>
        ) : (
          <>
            <p className="hint">
              {L(
                `Kraliçe halkın mutluluğunu +${balance.society.happiness.queen} artırır; hanedanın çocukları onunla doğar ve sarayı ${balance.dynasty.queenForPalaceLevel}. seviyeye yükseltmek için şarttır.`,
                `A queen raises the people's happiness by +${balance.society.happiness.queen}; the house's children are born of her, and she is required to raise the palace to level ${balance.dynasty.queenForPalaceLevel}.`,
              )}
            </p>
            <button className="btn small" disabled={!!queen} data-why={queen === 'cost' ? L(`Yeterli altın yok (eksik: ${Math.ceil(balance.society.queen.cost.gold - kingdom.stock.gold)})`, `Not enough gold (short by ${Math.ceil(balance.society.queen.cost.gold - kingdom.stock.gold)})`) : sentence(queen ? QUEEN_WHY[queen] : undefined)} onClick={() => online?.act({ type: 'queen' })}>
              <Icon name="crown" size={16} /> {L('Kraliçe edin', 'Take a queen')} ·{' '}
              {queenOwed(kingdom, now) ? L('hemen, bedelsiz', 'at once, free of charge') : L(`${balance.society.queen.cost.gold} altın`, `${balance.society.queen.cost.gold} gold`)} {queen ? `(${QUEEN_WHY[queen] ?? ''})` : ''}
            </button>
          </>
        )}
      </Section>
      {(kingdom.hostages ?? []).length > 0 && (
        <Section title={L('Elindeki kraliçeler', 'Queens you hold')} icon="crown">
          <ul className="places">
            {kingdom.hostages!.map((h) => (
              <li key={h.of}>
                <Icon name="crown" size={24} />
                <span>
                  <b>{L(`${h.name} kraliçesi`, `Queen of ${h.name}`)}</b>
                  <small>{L('Fidyesini ödeyene kadar senin elinde.', 'Yours until her ransom is paid.')}</small>
                </span>
                <button className="btn small" onClick={() => online?.act({ type: 'release', target: h.of })}>
                  {L(`Serbest bırak (+${balance.espionage.operations.kidnap.release})`, `Release (+${balance.espionage.operations.kidnap.release})`)}
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
  return s < 60 ? L(`${s} sn önce`, `${s} s ago`) : s < 3600 ? L(`${Math.floor(s / 60)} dk önce`, `${Math.floor(s / 60)} min ago`) : L(`${Math.floor(s / 3600)} sa önce`, `${Math.floor(s / 3600)} h ago`)
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
      <div className="segmented journal-filter" role="tablist" aria-label={L('Günlük', 'Journal')}>
        <button className="btn small" role="tab" aria-selected={!only} aria-pressed={!only} onClick={() => setOnly(false)}>
          <Icon name="scroll" size={16} /> {L('Tümü', 'All')}
        </button>
        <button className="btn small" role="tab" aria-selected={only} aria-pressed={only} onClick={() => setOnly(true)}>
          <Icon name="warn" size={16} /> {L('Önemli', 'Important')} {unread > 0 && <span className="count">{unread}</span>}
        </button>
      </div>
      {shown.length === 0 ? (
        only ? (
          <Placeholder icon="happy" title={L('Kötü bir haber yok', 'No bad news')}>
            {L(
              'Lordluğunu etkileyen olumsuz olaylar (yağma, savaş ilanı, kayıplar, sabotaj, kötü olaylar) burada toplanır.',
              'Ill tidings that touch your lordship (raids, declarations of war, losses, sabotage, bad events) gather here.',
            )}
          </Placeholder>
        ) : (
          <Placeholder icon="scroll" title={L('Elçiden haber yok', 'No word from the envoy')}>
            {L(`Her ${REPORT_ROUNDS} üretim turunda bir gün kapanır ve elçin raporunu yazar.`, `Every ${REPORT_ROUNDS} production rounds a day closes and your envoy writes his report.`)}
          </Placeholder>
        )
      ) : (
        <div className="letters">
          {[...days].map(([day, entries]) => (
            // A journal day is a day/night cycle of the season, which is also a calendar year (CLAUDE.md §2).
            <section key={day} aria-label={L(`${balance.time.calendar.startYear + day - 1} yılı`, `The year ${balance.time.calendar.startYear + day - 1}`)}>
              <h3 className="day-head">{L(`${balance.time.calendar.startYear + day - 1} yılı`, `The year ${balance.time.calendar.startYear + day - 1}`)}</h3>
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
              <CrownBanner world={world} liege={d.crown} />{' '}
              {L(`${info.name} ${RESOURCE_NAMES[d.good].toLocaleLowerCase(locale())} alıyor`, `${info.name} is buying ${RESOURCE_NAMES[d.good].toLocaleLowerCase(locale())}`)}
            </span>
            <b className={rate > 0 ? 'up' : undefined}>
              {rate > 0 ? L(`dakikada ${rate}`, `${rate} a minute`) : L('fiyat yüksek, almıyor', 'price too high, not buying')} ·{' '}
              {L(`${Math.max(1, Math.ceil((d.until - now) / 60000))} dk`, `${Math.max(1, Math.ceil((d.until - now) / 60000))} min`)}
            </b>
          </li>
        )
      })}
    </ul>
  )
}
