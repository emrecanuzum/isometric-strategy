import {
  BUILDABLE,
  BUILDINGS,
  WEAPONS,
  affordable,
  armoryOf,
  balance,
  buildError,
  constructing,
  population,
  productionRound,
  roundOutcome,
  tradeUnits,
  tradeUpgradeCost,
  upgradeError,
  upgradeSpec,
} from '@game/shared'
import type { BuildingKind, Good, Kingdom, Plot, Point, Resource, World } from '@game/shared'
import { STRUCTURE_SPRITES, palaceIn } from '../../game/buildingSprites'
import { INN_LOOKS, innLook } from '../../game/innSprites'
import { Icon } from '../icons'
import { BUILDING_NAMES, BUILDING_NOTES, RESOURCE_ICONS, RESOURCE_NAMES, WEAPON_ICONS, WEAPON_NAMES } from '../names'
import { CostList, GoodChoice } from '../panels'
import type { Journal } from './journal'
import { REPORT_ROUNDS } from './journal'
import { History, Meter, Placeholder, Section, SpriteView, Stat, fmt, signed, times } from './primitives'

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
  onGood(good: Good): void
  onUpgrade(): void
  // Raises a building a level (the palace's level sets the territory's size).
  onUpgradeBuilding(id: number): void
  onMute(): void
  onReset(): void
  // Back to the main menu.
  onExit(): void
  onShow(tile: Point): void
}

const center = (b: { x: number; y: number; size: number }): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })
const thumb = (kind: BuildingKind, color?: string) => (kind === 'palace' ? palaceIn(color) : STRUCTURE_SPRITES[kind][0])

// Per production round: what buildings add, what villagers eat and what the merchant takes away.
export function flows(kingdom: Kingdom, now: number) {
  const round = productionRound(kingdom, now)
  const { villagers } = population(kingdom, now)
  const eaten = villagers * balance.economy.foodPerVillager
  const trips = balance.economy.productionSeconds / balance.economy.trade.tripSeconds
  const sold = kingdom.trade.good ? tradeUnits(kingdom) * trips : 0
  const result = {} as Record<Resource, { made: number; used: number; net: number }>
  for (const r of RESOURCES) {
    const made = r === 'gold' ? (kingdom.trade.good ? sold * balance.economy.trade.price[kingdom.trade.good] : 0) : (round[r] ?? 0) + (r === 'food' ? eaten : 0)
    const used = (r === 'food' ? eaten : 0) + (r === kingdom.trade.good ? sold : 0)
    result[r] = { made, used, net: made - used }
  }
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
}

export function BuildTab({ world, kingdom, now, stage, onPlace }: HudData) {
  const list = constructing(kingdom, now)
  const slots = balance.economy.maxConstructions
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
        <ul className="cards">
          {BUILDABLE.map((kind) => {
            const spec = BUILDINGS[kind]
            const error = buildError(world, kingdom, stage, kind, null, now)
            const effect = spec.produces
              ? `+${(spec.amount! * kingdom.yields[spec.produces]).toFixed(1).replace('.', ',')} ${RESOURCE_NAMES[spec.produces].toLowerCase()} / tur`
              : `+${spec.villagers} köylü`
            const why = error ? (BLOCKED[error] ?? 'Şu an olmaz') : null
            return (
              <li key={kind}>
                <button className="card" disabled={why !== null} onClick={() => onPlace(kind)} aria-describedby={`why-${kind}`}>
                  <span className="card-art">
                    <SpriteView sprite={thumb(kind)} scale={spec.size > 1 ? 0.5 : 1} />
                  </span>
                  <span className="card-body">
                    <b>{BUILDING_NAMES[kind] ?? kind}</b>
                    {BUILDING_NOTES[kind] && <small>{BUILDING_NOTES[kind]}</small>}
                    <small className="up">{effect}</small>
                    <span className="card-meta">
                      <CostList cost={spec.cost} stock={kingdom.stock} />
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

export function StoreTab({ kingdom, now, journal }: HudData) {
  const flow = flows(kingdom, now)
  const armory = armoryOf(kingdom)
  const { weapons } = roundOutcome(kingdom, now)
  return (
    <>
      <Section title="Cephanelik" icon="arms" aside="silahlar">
        <div className="armory">
          {WEAPONS.map((w) => (
            <div key={w} className="slot">
              <Icon name={WEAPON_ICONS[w]} size={24} />
              <b>{fmt(armory[w])}</b>
              <small>{WEAPON_NAMES[w]}</small>
              {(weapons[w] ?? 0) > 0.05 && <small className="up">{signed(weapons[w]!)} / tur</small>}
            </div>
          ))}
        </div>
      </Section>
      <p className="hint">Her {balance.economy.productionSeconds} saniyede bir üretim turu işler. Rakamlar tur başınadır.</p>
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
                {r !== 'gold' && <small>Arazi çarpanı {times(kingdom.yields[r as Good])}</small>}
              </span>
              <strong>{fmt(stock)}</strong>
            </header>
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
  )
}

// ---- Ticaret --------------------------------------------------------------------------------------------------------

export function TradeTab({ kingdom, now, onGood, onUpgrade, onShow }: HudData) {
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost')
  if (!post) return <Placeholder icon="trade" title="Ticaret noktan yok">Ticaret arsası bulunamadı.</Placeholder>
  const { trade } = kingdom
  const tripMs = balance.economy.trade.tripSeconds * 1000
  const progress = trade.good ? Math.min(1, (now - trade.departedAt) / tripMs) : 0
  const next = tradeUpgradeCost(kingdom)
  const nextUnits = balance.economy.trade.levels[trade.level + 1]?.units
  return (
    <>
      <div className="feature">
        <SpriteView sprite={thumb('tradePost')} scale={0.5} />
        <div>
          <b>Ticaret noktası · Seviye {trade.level + 1}</b>
          <p className="hint">
            Tüccar her {balance.economy.trade.tripSeconds} saniyede {tradeUnits(kingdom)} birim mal götürüp altına çevirir.
          </p>
          <button className="btn small" onClick={() => onShow(center(post))}>
            <Icon name="pin" size={16} /> Haritada göster
          </button>
        </div>
      </div>
      <Section title="Satılacak mal" icon="chest">
        <GoodChoice kingdom={kingdom} selected={trade.good} onGood={onGood} />
      </Section>
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

export function KingdomTab(data: HudData) {
  const { kingdom, now, stage, plots, muted, confirmReset, onUpgradeBuilding, onMute, onReset, onExit, onShow } = data
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
  return (
    <>
      <div className="feature">
        <SpriteView sprite={thumb('palace', kingdom.color)} scale={0.5} />
        <div>
          <b>Saray</b>
          <p className="hint">{palace ? 'Krallığın kalbi. Hükümdar ve kraliçe burada yaşar.' : 'Sarayın henüz yerleştirilmedi.'}</p>
          {palace && (
            <button className="btn small" onClick={() => onShow(center(palace))}>
              <Icon name="home" size={16} /> Saraya git
            </button>
          )}
        </div>
      </div>
      <Section title="Yapılar" icon="build" aside={`${kingdom.buildings.length} toplam`}>
        <ul className="tally">
          {[...counts].map(([kind, n]) => (
            <li key={kind}>
              <SpriteView sprite={thumb(kind, kingdom.color)} scale={kind === 'house' ? 0.5 : 0.25} label={BUILDING_NAMES[kind]} />
              <span>{BUILDING_NAMES[kind]}</span>
              <b>×{n}</b>
            </li>
          ))}
        </ul>
      </Section>
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
              <button className="btn wide" disabled={upgradeError(kingdom, palace.id, now) !== null} onClick={() => onUpgradeBuilding(palace.id)}>
                <span>Sarayı yükselt <small>({upgradeSpec(palace)?.buildSeconds} sn)</small></span>
                <CostList cost={upgradeSpec(palace)?.cost} stock={kingdom.stock} />
              </button>
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
      <Section title="Ayarlar" icon="music">
        <div className="row">
          <button className="btn small" aria-pressed={!muted} onClick={onMute}>
            <Icon name="music" size={16} slash={muted} /> Müzik {muted ? 'kapalı' : 'açık'}
          </button>
          <button className={confirmReset ? 'btn small danger' : 'btn small'} onClick={onReset}>
            {confirmReset ? 'Emin misin? Tekrar bas' : 'Krallığı sıfırla'}
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

export function PeopleTab({ kingdom, now }: HudData) {
  const { villagers, jobs, efficiency } = population(kingdom, now)
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
  return (
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
      <Section title="Nüfus" icon="villager">
        <Stat label="Köylü" value={villagers} note={`${houses} ev`} />
        <Stat label="İş gücü ihtiyacı" value={jobs} tone={villagers < jobs ? 'down' : undefined} />
        <Stat label="Üretim verimi" value={`%${Math.round(efficiency * 100)}`} tone={efficiency < 1 ? 'down' : 'up'} />
        <Stat label="Yemek tüketimi" value={`${signed(-food.used)} / tur`} />
      </Section>
      <Section title="İç işler" icon="lock" aside="yakında">
        <ul className="locked">
          <li>
            <Icon name="lock" size={16} /> Vergi oranı · düşük / normal / yüksek / ağır
          </li>
          <li>
            <Icon name="lock" size={16} /> Moral (0–100) · kraliçe, festival, lüks mallar
          </li>
          <li>
            <Icon name="lock" size={16} /> Asker havuzu
          </li>
        </ul>
      </Section>
    </>
  )
}

// ---- Diplomasi ------------------------------------------------------------------------------------------------------

const INN_NAMES = ['Yarı ahşap han', 'Yarı ahşap han', 'Taş han', 'Kütük han', 'Kütük han', 'Kervansaray']

export function DiplomacyTab({ world, kingdom, onShow }: HudData) {
  const inns = world.inns
    .map((p) => ({ p, distance: Math.round(Math.hypot(p.x - kingdom.site.x, p.y - kingdom.site.y)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
  return (
    <>
      <Section title="Krallıklar" icon="banner">
        <Placeholder icon="banner" title="Henüz bilinen krallık yok">
          Çok oyunculu lobi gelince komşuların burada listelenecek: ilişki durumu, istihbarat ağı ve elçiler.
        </Placeholder>
        <div className="chips" aria-label="Diplomatik durumlar">
          {['Barış', 'Ticaret anlaşması', 'İttifak', 'Saldırmazlık', 'Savaş'].map((s) => (
            <span key={s} className="chip locked">
              {s}
            </span>
          ))}
        </div>
      </Section>
      <Section title="Tarafsız hanlar" icon="inn" aside="yakındakiler">
        <ul className="places">
          {inns.map(({ p, distance }) => (
            <li key={`${p.x},${p.y}`}>
              <SpriteView sprite={innLook(world, p).sprite} scale={0.25} />
              <span>
                <b>{INN_NAMES[INN_LOOKS.indexOf(innLook(world, p))]}</b>
                <small>{distance} karo uzakta</small>
              </span>
              <button className="btn icon-only" onClick={() => onShow({ x: p.x + 1, y: p.y + 1 })} aria-label="Haritada göster">
                <Icon name="pin" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}

// ---- Günlük ---------------------------------------------------------------------------------------------------------

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.floor(s / 60)} dk önce` : `${Math.floor(s / 3600)} sa önce`
}

export function JournalTab({ journal, now }: HudData) {
  if (journal.entries.length === 0) {
    return (
      <Placeholder icon="scroll" title="Elçiden haber yok">
        Her {REPORT_ROUNDS} üretim turunda bir gün kapanır ve elçin raporunu yazar.
      </Placeholder>
    )
  }
  const days = new Map<number, typeof journal.entries>()
  for (const e of journal.entries) days.set(e.day, [...(days.get(e.day) ?? []), e])
  return (
    <div className="letters">
      {[...days].map(([day, entries]) => (
        <section key={day} aria-label={`${day}. gün`}>
          <h3 className="day-head">{day}. gün</h3>
          {entries.map((e) => (
            <article key={e.id} className={`letter tone-${e.tone}`}>
              <Icon name={e.icon} size={16} />
              <div>
                <b>{e.title}</b>
                {e.text && <p>{e.text}</p>}
                <small>{ago(now - e.at)}</small>
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
