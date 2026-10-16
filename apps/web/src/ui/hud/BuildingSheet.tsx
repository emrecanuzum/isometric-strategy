import { NavyTab } from './navy'
import { BUILDINGS, armoryCap, balance, clogsOf, movable, moveCost, moveSeconds, buildingOutput, cutOff, goldCap, storageCap, demolishRefund, productAllowed, levelSpec, maxLevel, population, productOf, staffOf, upgradeError, upgradeSpec, workerSlots } from '@game/shared'
import type { Building, BuildingKind, Good, Product, Resource } from '@game/shared'
import { looksOf } from '../../game/buildingSprites'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { BUILDING_NAMES, BUILDING_NOTES, PRODUCT_NAMES, RESEARCH_NAMES, RESOURCE_ICONS, RESOURCE_NAMES, WEAPON_ICONS, WEAPON_NAMES } from '../names'
import { CostList, Missing } from '../panels'
import { FisherPanel } from './Fishing'
import { GamePanel } from './MiniGames'
import { HospitalPanel, TemplePanel, UniversityPanel } from './institutions'
import { Meter, Section, SpriteView } from './primitives'
import { PrisonPanel, SpyHousePanel, TavernPanel } from './buildingPanels'
import { TreasuryPanel } from './treasury'
import { KingdomTab, TradeTab } from './tabs'
import type { HudData } from './tabs'

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
  top: 'En yüksek seviyede',
  busy: 'İnşaat sürüyor',
  cost: 'Kaynak yetersiz',
  queue: 'İnşaat kuyruğu dolu',
  limit: 'Evler nüfus sınırını dolduruyor: önce sarayı yükselt',
  liege: 'Önce bir taç krallığına biat et (Saray sekmesi → Bağlılık)',
  queen: 'Sarayı 3. seviyeye yükseltmek için sarayda bir kraliçe olmalı (Halk sekmesi → Kraliçe)',
}

const isGood = (v: string): v is Good => v === 'food' || v === 'materials' || v === 'arms'
const iconOf = (makes: Product['makes']): IconName => (isGood(makes) ? RESOURCE_ICONS[makes] : WEAPON_ICONS[makes])
const nameOf = (makes: Product['makes']) => (isGood(makes) ? RESOURCE_NAMES[makes] : WEAPON_NAMES[makes])
const num = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace('.', ',')
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
          <small>{top > 1 ? `Seviye ${level} / ${top}` : 'Lordluk yapısı'}</small>
        </div>
        <button className="btn icon-only" onClick={commands.onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
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
                    <b>{level > 1 ? `${level}. seviyeye yükseltiliyor` : 'İnşa ediliyor'}</b>
                    <Meter value={1 - (b.doneAt - now) / buildMs} label="İnşaat ilerlemesi" segments={10} />
                    <small className="hint">{Math.ceil((b.doneAt - now) / 1000)} sn kaldı</small>
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
            {!building && b.kind === 'fisherHut' && <FisherPanel data={data} />}
            {!building && b.kind === 'barracks' && <GamePanel game="archery" data={data} />}
            {!building && b.kind === 'forge' && <GamePanel game="anvil" data={data} />}
            {!building && b.kind === 'lumberCamp' && <GamePanel game="woodsplit" data={data} />}
            {!building && b.kind === 'farm' && <GamePanel game="harvest" data={data} />}
            {!building && b.kind === 'dock' && <GamePanel game="net" data={data} />}
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
  const cap = weapon ? armoryCap(kingdom, now) : storageCap(kingdom, now)
  const others = Object.keys(BUILDINGS[b.kind].products ?? {}).filter((p) => p !== productOf(b) && productAllowed(kingdom, b.kind, p, now))
  return (
    <div className="clog-box" role="alert">
      <header>
        <Icon name="warn" size={24} />
        <b>Üretim ağı tıkandı</b>
      </header>
      <p>
        {weapon
          ? `Cephanelikte ${name} yeri doldu (${cap} / ${cap}). Atölye ${name} işleyemiyor: hammadde harcamıyor, ${staffOf(b)} işçisi boşta bekliyor.`
          : `Ambarda ${name} yeri doldu (${Math.floor(kingdom.stock[clog.makes as Good])} / ${cap}). Bu yapının ürettiği ${lost > 0 ? `tur başına ~${num(lost)} ` : ''}${name} sığmıyor ve boşa gidiyor; ${staffOf(b)} işçi boşuna çalışıyor.`}
      </p>
      <ul>
        {others.length > 0 && <li>Ürünü değiştir: {others.map((p) => PRODUCT_NAMES[p] ?? p).join(', ')} (aşağıda).</li>}
        {weapon ? (
          <li>Kışlada okçu ya da kalkanlı piyade eğit: silah cephanelikten çıkar, yer açılır.</li>
        ) : (
          <li>Tüccarla {name} sat, taç siparişine gönder ya da inşaatta harca.</li>
        )}
        <li>Ambar kur ya da yükselt: {weapon ? `her ambar seviyesi cephaneliğe +${balance.economy.armory.perWarehouseLevel} yer açar` : 'depoya yer açar'}; sarayı yükseltmek de sınırı büyütür.</li>
        <li>İşçilerini başka bir yapıya ver (aşağıdaki işçi sayısını azalt).</li>
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
        <b className="down">Sur arkasında kaldı</b>
        <small className="hint">Köylüler buraya yürüyerek ulaşamıyor, üretim durdu. Sura bir kapı yap ya da bir parçasını yık.</small>
      </>
    )
  }
  if (spec.villagers) {
    return (
      <>
        <b>{spec.villagers} köylü barındırıyor</b>
        <small className="hint">Her köylü tur başına yemek yer.</small>
      </>
    )
  }
  if (b.kind === 'university' || b.kind === 'hospital' || b.kind === 'temple' || b.kind === 'prison' || b.kind === 'tavern' || b.kind === 'spyHouse') return <b>{BUILDING_NOTES[b.kind]}</b>
  if (spec.gold) {
    return (
      <>
        <b className="output">
          <Icon name="gold" size={24} /> +{spec.gold} altın yeri
        </b>
        <small className="hint">Hazinede toplam {goldCap(kingdom, now)} altın tutulabilir.</small>
      </>
    )
  }
  if (spec.storage) {
    return (
      <>
        <b className="output">
          <Icon name="chest" size={24} /> +{spec.storage} depo yeri
        </b>
        <small className="hint">Yemek, yapı malzemesi ve savaş malzemesinin her biri için. Toplam depo: {storageCap(kingdom, now)}.</small>
      </>
    )
  }
  const out = buildingOutput(kingdom, b, now)
  if (!out) return <b>Üretim yok</b>
  return (
    <>
      <b className="output">
        <Icon name={iconOf(out.makes)} size={24} /> +{num(out.units)} {nameOf(out.makes).toLowerCase()} / tur
      </b>
      {out.uses && (
        <small className="hint">
          Tüketir:{' '}
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
    <Section title="Ne üretsin?" icon="chest">
      <div className={Object.keys(products).length === 4 ? 'goods two' : 'goods'} role="radiogroup" aria-label="Ürün">
        {Object.entries(products).map(([id, p]) => (
          <button
            key={id}
            role="radio"
            aria-checked={id === chosen}
            className={id === chosen ? 'good active' : 'good'}
            disabled={!productAllowed(data.kingdom, b.kind, id, data.now)}
            title={p.research && !productAllowed(data.kingdom, b.kind, id, data.now) ? `Üniversitede ${RESEARCH_NAMES[p.research]?.name ?? p.research} araştırılmalı` : undefined}
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
              <small>{p.rate === 1 ? 'tam verim' : `%${Math.round(p.rate * 100)} verim`}</small>
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
    <Section title="İşçiler" icon="villager" aside={`${Math.floor(healthy)} sağlıklı / ${villagers} köylü · ${jobs} iş`}>
      <div className="stepper">
        <button className="btn icon-only" disabled={staff === 0} onClick={() => onWorkers(b.id, staff - 1)} aria-label="Bir işçi azalt">
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value" aria-live="polite">
          <b>{staff}</b> / {slots}
        </span>
        <button className="btn icon-only" disabled={staff >= slots} onClick={() => onWorkers(b.id, staff + 1)} aria-label="Bir işçi ekle">
          <Icon name="plus" size={16} />
        </button>
        <Meter value={slots ? staff / slots : 0} tone={staff === slots ? 'up' : 'gold'} label="Kadro" segments={slots * 2} />
      </div>
      {healthy < jobs && <p className="alert">Sağlıklı köylü yetmiyor: bütün yapılar %{Math.round((healthy / jobs) * 100)} hızla çalışıyor.</p>}
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
  const gains = next
    ? [
        next.amount !== now.amount && `Üretim ${now.amount} → ${next.amount}`,
        next.workers !== now.workers && `İşçi ${now.workers} → ${next.workers}`,
        next.villagers !== now.villagers && `Köylü ${now.villagers} → ${next.villagers}`,
        next.storage !== now.storage && `Depo yeri ${now.storage} → ${next.storage}`,
        next.gold !== now.gold && `Altın yeri ${now.gold} → ${next.gold}`,
      ].filter(Boolean)
    : []
  return (
    <Section title="Seviye" icon="crown" aside={`${level} / ${top}`}>
      <ol className="levels">
        {Array.from({ length: top }, (_, i) => (
          <li key={i} className={i + 1 === level ? 'now' : i + 1 < level ? 'past' : ''} aria-current={i + 1 === level ? 'step' : undefined}>
            <SpriteView sprite={looksOf(b.kind, i + 1)[b.id % looksOf(b.kind, i + 1).length]} scale={0.25 * (BUILDINGS[b.kind].size > 1 ? 1 : 2)} />
            <small>Sv. {i + 1}</small>
          </li>
        ))}
      </ol>
      {up && (
        <>
          {gains.length > 0 && <p className="hint">{gains.join(' · ')}</p>}
          <button className="btn wide" disabled={error !== null} onClick={() => onUpgrade(b.id)}>
            <span>
              {level + 1}. seviyeye yükselt <small>({up.buildSeconds} sn)</small>
            </span>
            <CostList cost={up.cost} stock={data.kingdom.stock} />
          </button>
          {error === 'cost' ? <Missing cost={up.cost} stock={data.kingdom.stock} /> : error && <small className="down">{UPGRADE_BLOCKED[error] ?? 'Şu an olmaz'}</small>}
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
    <Section title="Taşı" icon="build">
      <p className="hint">Yapı seviyesini ve işçilerini korur; taşınırken iskeleye döner ve üretmez. Yıkıp yeniden yapmaktan biraz ucuz, ama daha uzun sürer.</p>
      <div className="row">
        <CostList cost={moveCost(b)} stock={data.kingdom.stock} />
        <span className="chip">
          <Icon name="time" size={8} /> {moveSeconds(b)} sn
        </span>
        <button className="btn small" disabled={!done} onClick={() => onMove(b.id)}>
          {done ? 'Taşı' : 'İnşaat sürüyor'}
        </button>
      </div>
    </Section>
  )
}

// Tearing a building down gives back half of what was spent on it; it joins the plan, which asks before it is done.
function Demolish({ building: b, data, onDemolish }: { building: Building; data: HudData; onDemolish: (id: number) => void }) {
  const refund = demolishRefund(b)
  return (
    <Section title="Yık" icon="warn">
      <p className="hint">
        Yıkılan yapının inşa ve yükseltme maliyetinin yarısı geri döner{b.free ? ' (ücretsiz kurulan ilk yapının inşa maliyeti dönmez)' : ''}.
      </p>
      <div className="row">
        <CostList cost={refund} stock={data.kingdom.stock} />
        <button className="btn small danger" onClick={() => onDemolish(b.id)}>
          Yık
        </button>
      </div>
    </Section>
  )
}
