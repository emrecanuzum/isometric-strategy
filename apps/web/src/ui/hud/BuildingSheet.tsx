import { NavyTab } from './navy'
import { BUILDINGS, armoryCap, balance, clogsOf, forestFactor, movable, moveCost, moveSeconds, buildingOutput, cutOff, goldCap, storageCap, demolishRefund, productAllowed, levelSpec, maxLevel, population, productOf, staffOf, upgradeError, upgradeSpec, workerSlots } from '@game/shared'
import type { Building, BuildingKind, Good, Product, Resource } from '@game/shared'
import { looksOf } from '../../game/buildingSprites'
import { L, locale } from '../../lib/i18n'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { BUILDING_NAMES, BUILDING_NOTES, PRODUCT_NAMES, RESEARCH_NAMES, RESOURCE_ICONS, RESOURCE_NAMES, WEAPON_ICONS, WEAPON_NAMES } from '../names'
import { CostList, Missing } from '../panels'
import { buildWhy } from '../why'
import { FisherPanel } from './Fishing'
import { GamePanel } from './MiniGames'
import { HospitalPanel, TemplePanel, UniversityPanel } from './institutions'
import { Meter, Section, SpriteView } from './primitives'
import { PrisonPanel, SpyHousePanel, TavernPanel } from './buildingPanels'
import { TreasuryPanel } from './treasury'
import { CitadelPanel, GuildHallPanel, MemorialPanel } from './landmarks'
import { KingdomTab, TradeTab } from './tabs'
import type { HudData } from './tabs'
import { PirateSection } from './outlaws'

// The menu of one building, opened by clicking it on the map: what it makes, who works there and its level.

export interface BuildingCommands {
  onUpgrade(id: number): void
  onWorkers(id: number, workers: number): void
  onProduct(id: number, product: string): void
  // Adds tearing it down (for half of what it cost) to the plan.
  onDemolish(id: number): void
  // Picks it up to be set down elsewhere; the move joins the plan.
  onMove(id: number): void
  onClose(): void
}

const UPGRADE_BLOCKED: Record<string, string> = {
  top: L('En yüksek seviyede', 'At the highest level'),
  busy: L('İnşaat sürüyor', 'Construction under way'),
  cost: L('Kaynak yetersiz', 'Not enough resources'),
  queue: L('İnşaat kuyruğu dolu', 'Construction queue full'),
  limit: L('Evler nüfus sınırını dolduruyor: önce sarayı yükselt', 'The houses fill the population limit: upgrade the palace first'),
  liege: L('Önce bir taç krallığına biat et (Saray sekmesi → Bağlılık)', 'Swear fealty to a crown kingdom first (Palace tab → Allegiance)'),
  queen: L('Sarayı 3. seviyeye yükseltmek için sarayda bir kraliçe olmalı (Halk sekmesi → Kraliçe)', 'Raising the palace to level 3 needs a queen in the palace (People tab → Queen)'),
}

const isGood = (v: string): v is Good => v === 'food' || v === 'materials' || v === 'arms'
const iconOf = (makes: Product['makes']): IconName => (isGood(makes) ? RESOURCE_ICONS[makes] : WEAPON_ICONS[makes])
const nameOf = (makes: Product['makes']) => (isGood(makes) ? RESOURCE_NAMES[makes] : WEAPON_NAMES[makes])
const num = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace('.', L(',', '.'))
const scaleFor = (kind: BuildingKind) => (BUILDINGS[kind].size > 1 ? 0.5 : 1)

export function BuildingSheet({ building: b, data, commands }: { building: Building; data: HudData; commands: BuildingCommands }) {
  const { now } = data
  const level = b.level ?? 1
  const top = maxLevel(b.kind)
  const building = b.doneAt > now
  // The running construction: the upgrade into this level, or the first build.
  const buildMs = ((level > 1 ? BUILDINGS[b.kind].levels?.[level - 2]?.buildSeconds : BUILDINGS[b.kind].buildSeconds) ?? 1) * 1000
  return (
    <section className="sheet frame" aria-labelledby="building-title">
      <header className="sheet-head">
        <Icon name="build" size={32} />
        <div>
          <h2 id="building-title">{BUILDING_NAMES[b.kind]}</h2>
          <small>{top > 1 ? L(`Seviye ${level} / ${top}`, `Level ${level} / ${top}`) : L('Lordluk yapısı', 'Lordship building')}</small>
        </div>
        <button className="btn icon-only" onClick={commands.onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        {b.kind === 'tradePost' || (b.kind === 'market' && b.doneAt <= now) ? (
          <>
            <TradeTab {...data} part={b.kind === 'market' ? 'market' : 'merchant'} />
            {b.kind === 'tradePost' && <GamePanel game="caravan" data={data} />}
          </>
        ) : b.kind === 'palace' ? (
          <KingdomTab {...data} />
        ) : (
          <>
            <div className="feature">
              <span className="slot">
                <SpriteView sprite={looksOf(b.kind, level)[b.id % looksOf(b.kind, level).length]} scale={scaleFor(b.kind)} />
              </span>
              <div>
                {building ? (
                  <>
                    <b>{level > 1 ? L(`${level}. seviyeye yükseltiliyor`, `Upgrading to level ${level}`) : L('İnşa ediliyor', 'Under construction')}</b>
                    <Meter value={1 - (b.doneAt - now) / buildMs} label={L('İnşaat ilerlemesi', 'Construction progress')} segments={10} />
                    <small className="hint">{L(`${Math.ceil((b.doneAt - now) / 1000)} sn kaldı`, `${Math.ceil((b.doneAt - now) / 1000)} s left`)}</small>
                  </>
                ) : (
                  <Output building={b} data={data} />
                )}
              </div>
            </div>
            {!building && <Clogged building={b} data={data} />}
            {!building && b.kind === 'university' && <UniversityPanel data={data} />}
            {!building && b.kind === 'hospital' && <HospitalPanel building={b} data={data} />}
            {!building && b.kind === 'temple' && <TemplePanel data={data} />}
            {!building && b.kind === 'prison' && <PrisonPanel data={data} />}
            {!building && b.kind === 'tavern' && <TavernPanel data={data} />}
            {!building && b.kind === 'spyHouse' && <SpyHousePanel data={data} />}
            {!building && b.kind === 'treasury' && <TreasuryPanel building={b} data={data} />}
            {!building && b.kind === 'citadel' && <CitadelPanel building={b} data={data} />}
            {!building && b.kind === 'memorial' && <MemorialPanel building={b} data={data} />}
            {!building && b.kind === 'guildHall' && <GuildHallPanel building={b} data={data} />}
            {!building && b.kind === 'fisherHut' && <FisherPanel data={data} />}
            {!building && b.kind === 'barracks' && <GamePanel game="archery" data={data} />}
            {!building && b.kind === 'forge' && <GamePanel game="anvil" data={data} />}
            {!building && b.kind === 'lumberCamp' && <ForestNote data={data} />}
            {!building && b.kind === 'lumberCamp' && <GamePanel game="woodsplit" data={data} />}
            {!building && b.kind === 'farm' && <GamePanel game="harvest" data={data} />}
            {!building && b.kind === 'dock' && <GamePanel game="net" data={data} />}
            {!building && b.kind === 'dock' && <PirateSection kingdom={data.kingdom} />}
            {!building && b.kind === 'shipyard' && <NavyTab {...data} />}
            {BUILDINGS[b.kind].products && <Products building={b} data={data} onProduct={commands.onProduct} />}
            {workerSlots(b) > 0 && <Workers building={b} data={data} onWorkers={commands.onWorkers} />}
            {top > 1 && <Levels building={b} data={data} onUpgrade={commands.onUpgrade} />}
            {movable(b) && <Move building={b} data={data} onMove={commands.onMove} />}
            <Demolish building={b} data={data} onDemolish={commands.onDemolish} />
          </>
        )}
      </div>
    </section>
  )
}


// The woods round the lordship (CLAUDE.md §6.4): how much of their yield the lumber camps still get, and what to do.
function ForestNote({ data }: { data: HudData }) {
  const { kingdom, now } = data
  const share = forestFactor(kingdom, now)
  if (share > 0.97) return null
  return (
    <p className={share < 0.6 ? 'alert' : 'hint'}>
      <Icon name="axe" size={16} />{' '}
      {L(
        `Çevredeki orman seyreldi: kamplar ${Math.round(share * 100)}% verimle kesiyor (en az %${Math.round(balance.economy.forest.floor * 100)}). Ağaçlar zamanla geri gelir; daha az kesmek ormanı çabuk toparlar. Yapı malzemesi için keten tarlası ek.`,
        `The woods round about have thinned: the camps cut at ${Math.round(share * 100)}% (never below ${Math.round(balance.economy.forest.floor * 100)}%). The trees grow back in time, faster if you cut less. Sow flax fields for building materials.`,
      )}
    </p>
  )
}

// "Üretim ağı tıkandı" (CLAUDE.md §6.4): the store or the armory this building fills has no room, so its work is
// thrown away (a full store) or stands still (a full armory). What is full, what it costs and what to do about it.
function Clogged({ building: b, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const clog = clogsOf(kingdom, now).find((c) => c.id === b.id)
  if (!clog) return null
  const weapon = clog.reason === 'armory'
  const name = nameOf(clog.makes).toLowerCase()
  const out = buildingOutput(kingdom, { ...b }, now)
  const lost = !weapon && out ? out.units : 0
  const cap = weapon ? armoryCap(kingdom, now) : storageCap(kingdom, now, clog.makes as Good)
  const others = Object.keys(BUILDINGS[b.kind].products ?? {}).filter((p) => p !== productOf(b) && productAllowed(kingdom, b.kind, p, now))
  return (
    <div className="clog-box" role="alert">
      <header>
        <Icon name="warn" size={24} />
        <b>{L('Üretim ağı tıkandı', 'Production chain clogged')}</b>
      </header>
      <p>
        {weapon
          ? L(
              `Cephanelikte ${name} yeri doldu (${cap} / ${cap}). Atölye ${name} işleyemiyor: hammadde harcamıyor, ${staffOf(b)} işçisi boşta bekliyor.`,
              `The armoury has no more room for ${name} (${cap} / ${cap}). The workshop cannot make ${name}: it uses no raw materials and its ${staffOf(b)} worker${staffOf(b) === 1 ? ' stands' : 's stand'} idle.`,
            )
          : L(
              `Ambarda ${name} yeri doldu (${Math.floor(kingdom.stock[clog.makes as Good])} / ${cap}). Bu yapının ürettiği ${lost > 0 ? `tur başına ~${num(lost)} ` : ''}${name} sığmıyor ve boşa gidiyor; ${staffOf(b)} işçi boşuna çalışıyor.`,
              `The storehouse has no more room for ${name} (${Math.floor(kingdom.stock[clog.makes as Good])} / ${cap}). The ${lost > 0 ? `~${num(lost)} per round of ` : ''}${name} this building makes does not fit and goes to waste; ${staffOf(b)} worker${staffOf(b) === 1 ? ' toils' : 's toil'} for nothing.`,
            )}
      </p>
      <ul>
        {others.length > 0 && <li>{L(`Ürünü değiştir: ${others.map((p) => PRODUCT_NAMES[p] ?? p).join(', ')} (aşağıda).`, `Change the product: ${others.map((p) => PRODUCT_NAMES[p] ?? p).join(', ')} (below).`)}</li>}
        {weapon ? (
          <li>{L('Kışlada okçu ya da kalkanlı piyade eğit: silah cephanelikten çıkar, yer açılır.', 'Train archers or shield infantry at the barracks: the weapons leave the armoury and make room.')}</li>
        ) : (
          <li>{L(`Tüccarla ${name} sat, taç siparişine gönder ya da inşaatta harca.`, `Sell ${name} through the merchant, send it to a crown order or spend it on building.`)}</li>
        )}
        <li>
          {L(
            `Ambar kur ya da yükselt: ${weapon ? `her ambar seviyesi cephaneliğe +${balance.economy.armory.perWarehouseLevel} yer açar` : 'depoya yer açar'}; sarayı yükseltmek de sınırı büyütür.`,
            `Build or upgrade a storehouse: ${weapon ? `every storehouse level adds +${balance.economy.armory.perWarehouseLevel} room to the armoury` : 'it adds room to the stores'}; upgrading the palace raises the limit too.`,
          )}
        </li>
        <li>{L('İşçilerini başka bir yapıya ver (aşağıdaki işçi sayısını azalt).', 'Give its workers to another building (lower the worker count below).')}</li>
      </ul>
    </div>
  )
}

function Output({ building: b, data }: { building: Building; data: HudData }) {
  const { kingdom, now } = data
  const spec = levelSpec(b.kind, b.level)
  if (!spec.villagers && cutOff(kingdom.buildings, kingdom.site, now).has(b.id)) {
    return (
      <>
        <b className="down">{L('Sur arkasında kaldı', 'Cut off behind the walls')}</b>
        <small className="hint">{L('Köylüler buraya yürüyerek ulaşamıyor, üretim durdu. Sura bir kapı yap ya da bir parçasını yık.', 'Villagers cannot walk here, so production has stopped. Build a gate in the wall or tear down a section.')}</small>
      </>
    )
  }
  if (spec.villagers) {
    return (
      <>
        <b>{L(`${spec.villagers} köylü barındırıyor`, `Houses ${spec.villagers} villager${spec.villagers === 1 ? '' : 's'}`)}</b>
        <small className="hint">{L('Her köylü tur başına yemek yer.', 'Every villager eats food each round.')}</small>
      </>
    )
  }
  if (b.kind === 'university' || b.kind === 'hospital' || b.kind === 'temple' || b.kind === 'prison' || b.kind === 'tavern' || b.kind === 'spyHouse' || b.kind === 'citadel' || b.kind === 'memorial' || b.kind === 'guildHall') return <b>{BUILDING_NOTES[b.kind]}</b>
  if (spec.gold) {
    return (
      <>
        <b className="output">
          <Icon name="gold" size={24} /> {L(`+${spec.gold} altın yeri`, `+${spec.gold} gold capacity`)}
        </b>
        <small className="hint">{L(`Hazinede toplam ${goldCap(kingdom, now)} altın tutulabilir.`, `The treasury can hold ${goldCap(kingdom, now)} gold in all.`)}</small>
      </>
    )
  }
  if (spec.storage) {
    return (
      <>
        <b className="output">
          <Icon name="chest" size={24} /> {L(`+${spec.storage} depo yeri`, `+${spec.storage} storage space`)}
        </b>
        <small className="hint">{L(`Yemek, yapı malzemesi ve savaş malzemesinin her biri için. Toplam depo: ${storageCap(kingdom, now)}; savaş malzemesi bunun yalnızca %${Math.round(balance.economy.storage.armsShare * 100)}'ini tutar (${storageCap(kingdom, now, 'arms')}).`, `For each of food, building materials and war materials. Total storage: ${storageCap(kingdom, now)}; war materials hold only ${Math.round(balance.economy.storage.armsShare * 100)}% of it (${storageCap(kingdom, now, 'arms')}).`)}</small>
      </>
    )
  }
  const out = buildingOutput(kingdom, b, now)
  if (!out) return <b>{L('Üretim yok', 'No production')}</b>
  return (
    <>
      <b className="output">
        <Icon name={iconOf(out.makes)} size={24} /> +{num(out.units)} {nameOf(out.makes).toLowerCase()} {L('/ tur', '/ round')}
      </b>
      {out.uses && (
        <small className="hint">
          {L('Tüketir:', 'Uses:')}{' '}
          {Object.entries(out.uses)
            .map(([r, per]) => `${num(out.units * (per ?? 0))} ${RESOURCE_NAMES[r as Resource].toLowerCase()}`)
            .join(', ')}
        </small>
      )}
    </>
  )
}

function Products({ building: b, data, onProduct }: { building: Building; data: HudData; onProduct: BuildingCommands['onProduct'] }) {
  const products = BUILDINGS[b.kind].products!
  const chosen = productAllowed(data.kingdom, b.kind, productOf(b)!, data.now) ? productOf(b) : Object.keys(products)[0]
  return (
    <Section title={L('Ne üretsin?', 'What should it make?')} icon="chest">
      <div className="goods choices" role="radiogroup" aria-label={L('Ürün', 'Product')}>
        {Object.entries(products).map(([id, p]) => (
          <button
            key={id}
            role="radio"
            aria-checked={id === chosen}
            className={id === chosen ? 'good active' : 'good'}
            disabled={!productAllowed(data.kingdom, b.kind, id, data.now)}
            title={p.research && !productAllowed(data.kingdom, b.kind, id, data.now) ? L(`Üniversitede ${RESEARCH_NAMES[p.research]?.name ?? p.research} araştırılmalı`, `Research ${RESEARCH_NAMES[p.research]?.name ?? p.research} at the university`) : undefined}
            data-why={p.research ? L(`Üniversitede ${RESEARCH_NAMES[p.research]?.name ?? p.research} araştırılmalı`, `Research ${RESEARCH_NAMES[p.research]?.name ?? p.research} at the university`) : L('Bu ürün şu an seçilemez', 'This product cannot be chosen now')}
            onClick={() => onProduct(b.id, id)}
          >
            <Icon name={iconOf(p.makes)} size={24} />
            <b>{PRODUCT_NAMES[id] ?? id}</b>
            {nameOf(p.makes) !== PRODUCT_NAMES[id] && <small>{nameOf(p.makes)}</small>}
            {!productAllowed(data.kingdom, b.kind, id, data.now) ? (
              <small>
                <Icon name="lock" size={8} /> {RESEARCH_NAMES[p.research!]?.name}
              </small>
            ) : p.uses ? (
              <span className="cost">
                {Object.entries(p.uses).map(([r, per]) => (
                  <span key={r}>
                    <Icon name={RESOURCE_ICONS[r as Resource]} size={8} />
                    {per}
                  </span>
                ))}
              </span>
            ) : (
              <small>{p.rate === 1 ? L('tam verim', 'full yield') : L(`%${Math.round(p.rate * 100)} verim`, `${Math.round(p.rate * 100)}% yield`)}</small>
            )}
          </button>
        ))}
      </div>
    </Section>
  )
}

function Workers({ building: b, data, onWorkers }: { building: Building; data: HudData; onWorkers: BuildingCommands['onWorkers'] }) {
  const slots = workerSlots(b)
  const staff = staffOf(b)
  const { villagers, healthy, jobs } = population(data.kingdom, data.now)
  return (
    <Section title={L('İşçiler', 'Workers')} icon="villager" aside={L(`${Math.floor(healthy)} sağlıklı / ${villagers} köylü · ${jobs} iş`, `${Math.floor(healthy)} healthy / ${villagers} villagers · ${jobs} jobs`)}>
      <div className="stepper">
        <button className="btn icon-only" disabled={staff === 0} data-why={L('Yapıda çalışan işçi yok', 'No workers in this building')} onClick={() => onWorkers(b.id, staff - 1)} aria-label={L('Bir işçi azalt', 'Remove a worker')}>
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value" aria-live="polite">
          <b>{staff}</b> / {slots}
        </span>
        <button className="btn icon-only" disabled={staff >= slots} data-why={L(`Kadro dolu (${staff}/${slots}); daha çok işçi için yapıyı yükselt`, `Fully staffed (${staff}/${slots}); upgrade the building for more workers`)} onClick={() => onWorkers(b.id, staff + 1)} aria-label={L('Bir işçi ekle', 'Add a worker')}>
          <Icon name="plus" size={16} />
        </button>
        <Meter value={slots ? staff / slots : 0} tone={staff === slots ? 'up' : 'gold'} label={L('Kadro', 'Staff')} segments={slots * 2} />
      </div>
      {healthy < jobs && <p className="alert">{L(`Sağlıklı köylü yetmiyor: bütün yapılar %${Math.round((healthy / jobs) * 100)} hızla çalışıyor.`, `Not enough healthy villagers: every building works at ${Math.round((healthy / jobs) * 100)}% speed.`)}</p>}
    </Section>
  )
}

function Levels({ building: b, data, onUpgrade }: { building: Building; data: HudData; onUpgrade: BuildingCommands['onUpgrade'] }) {
  const level = b.level ?? 1
  const top = maxLevel(b.kind)
  const up = upgradeSpec(b)
  const error = upgradeError(data.kingdom, b.id, data.now)
  const now = levelSpec(b.kind, level)
  const next = up ? levelSpec(b.kind, level + 1) : null
  const tr = (v: number | undefined) => (v ?? 0).toLocaleString(locale(), { maximumFractionDigits: 2 })
  const gains = next
    ? [
        next.amount !== now.amount && L(`Üretim ${tr(now.amount)} → ${tr(next.amount)}`, `Output ${tr(now.amount)} → ${tr(next.amount)}`),
        next.workers !== now.workers && L(`İşçi ${now.workers} → ${next.workers}`, `Workers ${now.workers} → ${next.workers}`),
        next.villagers !== now.villagers && L(`Köylü ${now.villagers} → ${next.villagers}`, `Villagers ${now.villagers} → ${next.villagers}`),
        next.storage !== now.storage && L(`Depo yeri ${tr(now.storage)} → ${tr(next.storage)}`, `Storage space ${tr(now.storage)} → ${tr(next.storage)}`),
        next.gold !== now.gold && L(`Altın yeri ${tr(now.gold)} → ${tr(next.gold)}`, `Gold capacity ${tr(now.gold)} → ${tr(next.gold)}`),
      ].filter(Boolean)
    : []
  return (
    <Section title={L('Seviye', 'Level')} icon="crown" aside={`${level} / ${top}`}>
      <ol className="levels">
        {Array.from({ length: top }, (_, i) => (
          <li key={i} className={i + 1 === level ? 'now' : i + 1 < level ? 'past' : ''} aria-current={i + 1 === level ? 'step' : undefined}>
            <SpriteView sprite={looksOf(b.kind, i + 1)[b.id % looksOf(b.kind, i + 1).length]} scale={0.25 * (BUILDINGS[b.kind].size > 1 ? 1 : 2)} />
            <small>{L('Sv.', 'Lv.')} {i + 1}</small>
          </li>
        ))}
      </ol>
      {up && (
        <>
          {gains.length > 0 && <p className="hint">{gains.join(' · ')}</p>}
          <button className="btn wide" disabled={error !== null} data-why={buildWhy(error, data.kingdom, data.now, up.cost)} onClick={() => onUpgrade(b.id)}>
            <span>
              {L(`${level + 1}. seviyeye yükselt`, `Upgrade to level ${level + 1}`)} <small>({L(`${up.buildSeconds} sn`, `${up.buildSeconds} s`)})</small>
            </span>
            <CostList cost={up.cost} stock={data.kingdom.stock} />
          </button>
          {error === 'cost' ? <Missing cost={up.cost} stock={data.kingdom.stock} /> : error && <small className="down">{UPGRADE_BLOCKED[error] ?? L('Şu an olmaz', 'Not now')}</small>}
        </>
      )}
    </Section>
  )
}

// Moving keeps the building's level and hands, for a share of what was spent on it and a little longer than building it
// anew; it joins the plan.
function Move({ building: b, data, onMove }: { building: Building; data: HudData; onMove: (id: number) => void }) {
  const done = b.doneAt <= data.now
  return (
    <Section title={L('Taşı', 'Move')} icon="build">
      <p className="hint">{L('Yapı seviyesini ve işçilerini korur; taşınırken iskeleye döner ve üretmez. Yıkıp yeniden yapmaktan biraz ucuz, ama daha uzun sürer.', 'The building keeps its level and workers; while moving it turns back into scaffolding and makes nothing. A little cheaper than tearing down and rebuilding, but slower.')}</p>
      <div className="row">
        <CostList cost={moveCost(b)} stock={data.kingdom.stock} />
        <span className="chip">
          <Icon name="time" size={8} /> {L(`${moveSeconds(b)} sn`, `${moveSeconds(b)} s`)}
        </span>
        <button className="btn small" disabled={!done} data-why={L('İnşaat sürüyor; bitince taşınabilir', 'Construction under way; it can be moved once finished')} onClick={() => onMove(b.id)}>
          {done ? L('Taşı', 'Move') : L('İnşaat sürüyor', 'Construction under way')}
        </button>
      </div>
    </Section>
  )
}

// Tearing a building down gives back half of what was spent on it; it joins the plan, which asks before it is done.
function Demolish({ building: b, data, onDemolish }: { building: Building; data: HudData; onDemolish: (id: number) => void }) {
  const refund = demolishRefund(b)
  return (
    <Section title={L('Yık', 'Demolish')} icon="warn">
      <p className="hint">
        {L('Yıkılan yapının inşa ve yükseltme maliyetinin yarısı geri döner', 'Half of a demolished building\'s construction and upgrade cost is refunded')}
        {b.free ? L(' (ücretsiz kurulan ilk yapının inşa maliyeti dönmez)', ' (the free first building\'s construction cost is not refunded)') : ''}.
      </p>
      <div className="row">
        <CostList cost={refund} stock={data.kingdom.stock} />
        <button className="btn small danger" onClick={() => onDemolish(b.id)}>
          {L('Yık', 'Demolish')}
        </button>
      </div>
    </Section>
  )
}
