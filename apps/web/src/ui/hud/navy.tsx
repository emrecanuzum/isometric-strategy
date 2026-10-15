import {
  SHIPS,
  atHome,
  atWar,
  balance,
  cargoOf,
  countShips,
  escortOf,
  formFleetError,
  harbourCap,
  mergeFleetsError,
  missionError,
  navyOf,
  pirateChance,
  pirateSeason,
  priceAt,
  sailorsOf,
  seaTripMs,
  shipMight,
  shipSpec,
  shipsError,
  shipyardLevel,
  splitFleetError,
  stewardFactor,
  voyageMs,
  yardSlots,
  recruitment,
  allShips,
  PIRATE_SEASON_FACTOR,
  recallError,
} from '@game/shared'
import type { Fleet, Good, MissionOrder, NavyError, Ship, Ships } from '@game/shared'
import { useState } from 'react'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { HudData } from './tabs'
import type { Online } from './online'
import { Meter, Placeholder, Section, Stat, fmt } from './primitives'
import { Subtabs, usePart } from './Subtabs'
import type { Part } from './Subtabs'

// The navy (CLAUDE.md §8.5): the shipyard's slipways, the ships in the harbour, and up to two fleets with their
// missions — sea trade to a crown's harbour, fishing, pirate hunting, and at war blockades, raids and sorties.

export const SHIP_NAMES: Record<Ship, string> = { galley: 'Kadırga', cog: 'Koka', corsair: 'Çektiri' }
export const SHIP_NOTES: Record<Ship, string> = {
  galley: 'Ağır savaş gemisi: güçlü, ticareti iyi korur, çektirileri yener',
  cog: 'Yük gemisi: çok yük taşır, balıkta iyidir; savaşta zayıf',
  corsair: 'Hızlı akıncı: kokaları yener, korsan avında iyidir (2. seviye tersane)',
}
const SHIP_ICONS: Record<Ship, IconName> = { galley: 'swords', cog: 'chest', corsair: 'ship' }

export const MISSION_NAMES: Record<Fleet['mission']['kind'], string> = {
  port: 'Limanda bekliyor',
  trade: 'Deniz ticareti',
  fish: 'Balık avı',
  hunt: 'Korsan avı',
  blockade: 'Abluka',
  raid: 'Kıyı akını',
  sortie: 'Ablukayı yarma',
  return: 'Dönüyor',
}

const WHY: Partial<Record<NavyError, string>> = {
  locked: 'Tersane seviyesi yetmiyor',
  count: 'Geçersiz sayı',
  cap: 'Limanda yer yok',
  cost: 'Kaynak yetmiyor',
  crew: 'Tayfa yok (asker havuzu)',
  queue: 'Kızaklar dolu',
  fleets: 'En fazla 2 filo',
  ships: 'Gemi seç',
  away: 'Filo uzakta',
  dock: 'Önce iskele kur',
  cargo: 'Yük taşıyan gemi yok',
  warships: 'Savaş gemisi (kadırga ya da çektiri) gerekir',
  blockaded: 'İskelen abluka altında',
  notBlockaded: 'Abluka yok',
  target: 'Hedef uygun değil (savaşta olmalısın, iskelesi olmalı)',
  cooldown: 'Yeni akın için beklemelisin',
  city: 'Liman seç',
  good: 'Mal seç',
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk` : s >= 60 ? `${Math.floor(s / 60)} dk ${s % 60} sn` : `${s} sn`
}
const pct = (v: number) => `%${Math.round(v * 100)}`

export function ShipRow({ ships }: { ships: Ships | null | undefined }) {
  const shown = SHIPS.filter((x) => (ships?.[x] ?? 0) > 0)
  if (shown.length === 0) return <span className="hint">gemi yok</span>
  return (
    <span className="unit-row">
      {shown.map((x) => (
        <span key={x} className="chip" title={SHIP_NAMES[x]}>
          <Icon name={SHIP_ICONS[x]} size={16} /> {ships![x]} {SHIP_NAMES[x].toLowerCase()}
        </span>
      ))}
    </span>
  )
}

// Steppers for picking ships out of `from`.
function ShipPicker({ from, picked, onPick }: { from: Ships; picked: Ships; onPick(s: Ships): void }) {
  return (
    <>
      {SHIPS.filter((x) => (from[x] ?? 0) > 0).map((x) => (
        <div key={x} className="stepper">
          <span className="unit-label">
            <Icon name={SHIP_ICONS[x]} size={16} /> {SHIP_NAMES[x]}
          </span>
          <button className="btn icon-only" disabled={(picked[x] ?? 0) <= 0} onClick={() => onPick({ ...picked, [x]: (picked[x] ?? 0) - 1 })} aria-label="Azalt">
            <Icon name="minus" size={16} />
          </button>
          <span className="stepper-value">
            <b>{picked[x] ?? 0}</b> / {from[x]}
          </span>
          <button className="btn icon-only" disabled={(picked[x] ?? 0) >= (from[x] ?? 0)} onClick={() => onPick({ ...picked, [x]: (picked[x] ?? 0) + 1 })} aria-label="Artır">
            <Icon name="plus" size={16} />
          </button>
        </div>
      ))}
    </>
  )
}

type NavyPart = 'fleets' | 'harbour' | 'yard' | 'ledger'
const NAVY_PARTS: NavyPart[] = ['fleets', 'harbour', 'yard', 'ledger']

export function NavyTab(data: HudData) {
  const { kingdom, now, online } = data
  const [part, setPart] = usePart<NavyPart>('navy', NAVY_PARTS, 'fleets')
  if (!online) return null
  const yard = shipyardLevel(kingdom, now)
  const navy = navyOf(kingdom)
  const season = pirateSeason(kingdom.lobbyKey, now)
  const parts: Part<NavyPart>[] = [
    { id: 'fleets', name: 'Filolar', icon: 'ship', count: navy.fleets.length },
    { id: 'harbour', name: 'Liman', icon: 'anchor', count: countShips(navy.harbour) },
    { id: 'yard', name: 'Tersane', icon: 'build', count: navy.building.filter((b) => b.doneAt > now).length },
    { id: 'ledger', name: 'Defter', icon: 'trade' },
  ]
  if (yard === 0 && countShips(allShips(kingdom)) === 0) {
    return (
      <Section title="Donanma" icon="ship">
        <Placeholder icon="lock" title="Tersanen yok">
          Sarayı 4. seviyeye yükselt, sonra İnşa sekmesinden suyun kıyısına bir tersane kur (en az bir karosu kıyıda olmalı). Tersane kadırga, koka ve çektiri yapar.
          Gemiler filolar halinde deniz ticaretine, balığa, korsan avına çıkar; savaşta düşmanın iskelesini abluka altına alır ya da kıyısına akın eder.
        </Placeholder>
      </Section>
    )
  }
  return (
    <>
      {kingdom.blockade && (
        <p className="hint down alert-line">
          <Icon name="warn" size={16} /> <b>{kingdom.blockade.name}</b> filosu iskeleni abluka altında tutuyor: iskele balık tutamıyor, deniz ticareti ve balık avı durdu,
          halkın mutluluğu {balance.navy.blockade.happiness} düştü. Bir filoyu "Ablukayı yar" görevine gönderebilirsin.
        </p>
      )}
      {season && (
        <p className="hint down alert-line">
          <Icon name="warn" size={16} /> Korsan mevsimi: denizler korsan kaynıyor ({clock(season.end - now)} daha). Korsan saldırısı olasılığı ×{PIRATE_SEASON_FACTOR}.
        </p>
      )}
      <Subtabs label="Donanma" parts={parts} part={part} onPart={setPart} />
      {part === 'fleets' && <Fleets data={data} online={online} />}
      {part === 'harbour' && <Harbour data={data} online={online} />}
      {part === 'yard' && <Shipyard data={data} online={online} />}
      {part === 'ledger' && <SeaLedger data={data} />}
      {part !== 'yard' && navy.fleets.length === 0 && countShips(navy.harbour) === 0 && navy.building.length === 0 && <p className="hint">Henüz gemin yok. Tersane bölümünden gemi yaptır.</p>}
    </>
  )
}

function Fleets({ data, online }: { data: HudData; online: Online }) {
  const navy = navyOf(data.kingdom)
  return (
    <Section title="Filolarım" icon="ship" aside={`${navy.fleets.length} / ${balance.navy.maxFleets}`}>
      {navy.fleets.length === 0 && <p className="hint">Filon yok. Liman bölümünde limandaki gemilerden bir filo çıkar.</p>}
      <ul className="armies">
        {navy.fleets.map((f, i) => (
          <FleetCard key={f.id} index={i + 1} fleet={f} others={navy.fleets.filter((x) => x.id !== f.id)} data={data} online={online} />
        ))}
      </ul>
    </Section>
  )
}

function missionStatus(data: HudData, f: Fleet) {
  const { now, world } = data
  const m = f.mission
  switch (m.kind) {
    case 'trade': {
      const left = m.departedAt + m.tripMs - now
      return `${cityInfo(world, m.city).capital} limanına ${RESOURCE_NAMES[m.good].toLowerCase()} taşıyor · sefer dönüşü ${clock(left)}`
    }
    case 'blockade':
      return m.arriveAt > now ? `${m.name} iskelesine yol alıyor · varış ${clock(m.arriveAt - now)}` : m.resolved ? `${m.name} iskelesini abluka altında tutuyor` : `${m.name} iskelesinde çarpışma bekleniyor`
    case 'raid':
      return m.arriveAt > now ? `${m.name} kıyısına akına gidiyor · varış ${clock(m.arriveAt - now)}` : `${m.name} kıyısında`
    case 'sortie':
      return `Ablukacı filoya saldırıyor · ${clock(m.arriveAt - now)}`
    case 'return': {
      const cargo = Object.entries(m.cargo ?? {}).filter(([, v]) => (v ?? 0) > 0)
      return `Eve dönüyor · ${clock(m.arriveAt - now)}${cargo.length ? ` · ganimet: ${cargo.map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()}`).join(', ')}` : ''}`
    }
    case 'fish':
      return `İskele önünde balık tutuyor · tur başına +${(balance.navy.ships.cog.fish * (f.ships.cog ?? 0) + balance.navy.ships.galley.fish * (f.ships.galley ?? 0) + balance.navy.ships.corsair.fish * (f.ships.corsair ?? 0)).toFixed(1)} yemek (arazi çarpanından önce)`
    case 'hunt':
      return 'Korsanların peşinde · yakalanan her korsan için ödül'
    default:
      return f.sail ? 'gönderildiği yerde demirli' : 'iskeleyi savunur; iskelenin açığında demirli'
  }
}

type Picking = 'trade' | 'blockade' | 'raid' | 'split' | null

function FleetCard({ index, fleet, others, data, online }: { index: number; fleet: Fleet; others: Fleet[]; data: HudData; online: Online }) {
  const { kingdom, now, world } = data
  const [picking, setPicking] = useState<Picking>(null)
  const [good, setGood] = useState<Good>(fleet.mission.kind === 'trade' ? fleet.mission.good : 'materials')
  const [split, setSplit] = useState<Ships>({})
  const home = atHome(fleet)
  const mission = (order: MissionOrder) => online.act({ type: 'fleet', action: 'mission', fleet: fleet.id, order }).then(() => setPicking(null))
  const simple = (kind: 'port' | 'fish' | 'hunt' | 'sortie') => missionError(kingdom, fleet.id, { kind }, now, { cities: world.cities })
  // Lords at war with us that have a dock.
  const enemies = online.kingdoms.filter((k) => k.id !== online.me && atWar(online.pacts, online.me, k.id) && (k.buildings ?? []).some((b) => b.kind === 'dock' && b.doneAt <= now))
  const ctxFor = (id: number) => {
    const k = online.kingdoms.find((x) => x.id === id)!
    const dock = (k.buildings ?? []).find((b) => b.kind === 'dock')
    return { cities: world.cities, atWar: true, target: { id, name: k.name, dockPlot: dock ? { x: dock.x, y: dock.y, size: dock.size } : null, hasDock: !!dock, blockadedBy: k.blockade?.by ?? null } }
  }
  const merge = others.find((o) => !mergeFleetsError(kingdom, fleet.id, o.id))
  return (
    <li className="army-card">
      <div className="army-body">
        <div className="army-head">
          <b>
            <Icon name="ship" size={16} /> {index}. filo
          </b>
          <small>
            {countShips(fleet.ships)} gemi · güç {shipMight(fleet.ships).toFixed(1)} · yük {cargoOf(fleet.ships)} · eskort {escortOf(fleet.ships).toFixed(1)}
          </small>
        </div>
        <ShipRow ships={fleet.ships} />
        <p className="hint">
          <b>{MISSION_NAMES[fleet.mission.kind]}</b> · {missionStatus(data, fleet)}
        </p>
        {fleet.sail && fleet.sail.arriveAt > now && <p className="hint">Suda yol alıyor · varış {clock(fleet.sail.arriveAt - now)}</p>}
        {fleet.mission.kind === 'trade' && (
          <p className="hint">Korsan saldırısı olasılığı her seferde {pct(pirateChance(kingdom, fleet, now))}. Savaş gemileri eskort eder; başka bir filo korsan avındaysa olasılık yarıya iner.</p>
        )}
        {home && (
          <div className="army-actions">
            <button className="btn small" disabled={fleet.mission.kind === 'trade'} title={fleet.mission.kind === 'trade' ? 'Ticaretteki filo yerinden oynamaz' : 'Haritada bir nehre ya da göle tıkla'} onClick={() => online.sail(fleet.id)}>
              <Icon name="ship" size={16} /> Hareket et
            </button>
            <button className="btn small" aria-pressed={fleet.mission.kind === 'port'} disabled={!!simple('port')} onClick={() => mission({ kind: 'port' })}>
              <Icon name="anchor" size={16} /> Limanda bekle
            </button>
            <button className="btn small" aria-pressed={picking === 'trade' || fleet.mission.kind === 'trade'} onClick={() => setPicking(picking === 'trade' ? null : 'trade')}>
              <Icon name="trade" size={16} /> Deniz ticareti
            </button>
            <button className="btn small" aria-pressed={fleet.mission.kind === 'fish'} disabled={!!simple('fish')} title={WHY[simple('fish') as NavyError]} onClick={() => mission({ kind: 'fish' })}>
              <Icon name="food" size={16} /> Balık avı
            </button>
            <button className="btn small" aria-pressed={fleet.mission.kind === 'hunt'} disabled={!!simple('hunt')} title={WHY[simple('hunt') as NavyError]} onClick={() => mission({ kind: 'hunt' })}>
              <Icon name="eye" size={16} /> Korsan avı
            </button>
            <button className="btn small" aria-pressed={picking === 'blockade'} disabled={enemies.length === 0} title={enemies.length === 0 ? 'Savaşta olduğun, iskelesi olan bir lord yok' : undefined} onClick={() => setPicking(picking === 'blockade' ? null : 'blockade')}>
              <Icon name="lock" size={16} /> Abluka
            </button>
            <button className="btn small" aria-pressed={picking === 'raid'} disabled={enemies.length === 0} title={enemies.length === 0 ? 'Savaşta olduğun, iskelesi olan bir lord yok' : undefined} onClick={() => setPicking(picking === 'raid' ? null : 'raid')}>
              <Icon name="swords" size={16} /> Kıyı akını
            </button>
            {kingdom.blockade && (
              <button className="btn small danger" disabled={!!simple('sortie')} title={WHY[simple('sortie') as NavyError]} onClick={() => mission({ kind: 'sortie' })}>
                <Icon name="swords" size={16} /> Ablukayı yar
              </button>
            )}
            <button className="btn small" disabled={countShips(fleet.ships) < 2 || others.length + 1 >= balance.navy.maxFleets} onClick={() => setPicking(picking === 'split' ? null : 'split')} aria-pressed={picking === 'split'}>
              Böl
            </button>
            {merge && (
              <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'merge', fleet: fleet.id, other: merge.id })}>
                Diğer filoyla birleş
              </button>
            )}
            <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'dock', fleet: fleet.id })}>
              <Icon name="anchor" size={16} /> Limana bağla
            </button>
          </div>
        )}
        {!home && fleet.mission.kind !== 'return' && (
          <div className="army-actions">
            <button className="btn small" disabled={!!recallError(kingdom, fleet.id, now)} title={recallError(kingdom, fleet.id, now) === 'engaged' ? 'Çarpışma başlamak üzere' : undefined} onClick={() => online.act({ type: 'fleet', action: 'recall', fleet: fleet.id })}>
              <Icon name="home" size={16} /> Geri çağır
            </button>
          </div>
        )}
        {picking === 'trade' && (
          <div className="fleet-pick">
            <div className="unit-pick" role="radiogroup" aria-label="Taşınacak mal">
              {(['food', 'materials', 'arms'] as Good[]).map((g) => (
                <button key={g} className="btn small" role="radio" aria-checked={good === g} onClick={() => setGood(g)}>
                  <Icon name={g} size={16} /> {RESOURCE_NAMES[g]}
                </button>
              ))}
            </div>
            <ul className="queue-list">
              {world.cities.map((city, i) => {
                const trip = seaTripMs(kingdom, city)
                const info = cityInfo(world, i)
                const price = priceAt(online.market, good, now) * stewardFactor(kingdom, good, now) * balance.navy.trade.priceFactor
                const per = trip ? (cargoOf(fleet.ships) * price * 3_600_000) / trip : 0
                const why = missionError(kingdom, fleet.id, { kind: 'trade', good, city: i }, now, { cities: world.cities })
                return (
                  <li key={i} className="queue-item">
                    <b style={{ color: info.color }}>{info.capital} limanı</b>
                    <small>
                      sefer {trip ? clock(trip) : '—'} · birimi {price.toFixed(2)} · saatte ~{fmt(per)} altın
                    </small>
                    <button className="btn small" disabled={!!why} title={why ? WHY[why] : undefined} onClick={() => mission({ kind: 'trade', good, city: i })}>
                      Yelken aç
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="hint">
              Deniz ticareti lobi pazarından tüccarına göre az etkilenir (fiyatı yarı oranda düşürür); limandaki aracılar fiyatın {pct(1 - balance.navy.trade.priceFactor)}'ini alır. Satış yaptığın tacın gözünde değerin artar.
            </p>
          </div>
        )}
        {(picking === 'blockade' || picking === 'raid') && (
          <ul className="queue-list fleet-pick">
            {enemies.map((k) => {
              const ctx = ctxFor(k.id)
              const why = missionError(kingdom, fleet.id, { kind: picking, target: k.id }, now, ctx)
              return (
                <li key={k.id} className="queue-item">
                  <b>{k.name}</b>
                  <small>
                    yol {clock(voyageMs(kingdom.dockPlot, ctx.target.dockPlot))}
                    {k.navy && ` · limanında ~${k.navy.harbour} gemi`}
                    {k.blockade && ' · zaten abluka altında'}
                  </small>
                  <button className="btn small danger" disabled={!!why} title={why ? WHY[why] : undefined} onClick={() => mission({ kind: picking, target: k.id })}>
                    {picking === 'blockade' ? 'Abluka et' : 'Akın et'}
                  </button>
                </li>
              )
            })}
            <li className="hint">
              {picking === 'blockade'
                ? 'Filo iskeleye varınca oradaki gemilerle çarpışır; kazanırsa iskeleyi abluka altına alır: hedefin balığı, deniz ticareti ve balık avı durur, halkı huzursuzlanır. Savaş bitince ya da geri çağırınca abluka kalkar.'
                : `Filo kıyıya varınca oradaki gemilerle çarpışır; kazanırsa depolardan her malın %${Math.round(balance.navy.raid.stealShare * 100)}'ini gemilerin taşıyabildiği kadar alıp döner. Yük gemileri (koka) daha çok taşır.`}
            </li>
          </ul>
        )}
        {picking === 'split' && (
          <div className="fleet-pick">
            <ShipPicker from={fleet.ships} picked={split} onPick={setSplit} />
            <button
              className="btn small"
              disabled={!!splitFleetError(kingdom, fleet.id, split)}
              onClick={() => online.act({ type: 'fleet', action: 'split', fleet: fleet.id, ships: split }).then(() => (setSplit({}), setPicking(null)))}
            >
              {countShips(split)} gemiyle yeni filo
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function Harbour({ data, online }: { data: HudData; online: Online }) {
  const { kingdom, now } = data
  const navy = navyOf(kingdom)
  const [picked, setPicked] = useState<Ships | null>(null)
  const ships = picked ?? navy.harbour
  const why = formFleetError(kingdom, ships)
  const total = countShips(allShips(kingdom)) + navy.building.reduce((n, b) => n + b.count, 0)
  return (
    <Section title="Liman" icon="anchor" aside={`${total} / ${harbourCap(kingdom, now)} gemi · ${sailorsOf(kingdom)} denizci`}>
      {countShips(navy.harbour) === 0 ? (
        <p className="hint">Limanda bağlı gemi yok.</p>
      ) : (
        <>
          <p className="hint">Limandaki gemiler ve limanda bekleyen filolar iskeleyi savunur.</p>
          <ShipPicker from={navy.harbour} picked={ships} onPick={setPicked} />
          <button className="btn small" disabled={!!why} title={why ? WHY[why] : undefined} onClick={() => online.act({ type: 'fleet', action: 'form', ships }).then(() => setPicked(null))}>
            {countShips(ships)} gemiyle filo çıkar
          </button>
        </>
      )}
    </Section>
  )
}

function Shipyard({ data, online }: { data: HudData; online: Online }) {
  const { kingdom, now } = data
  const [ship, setShip] = useState<Ship>('cog')
  const [count, setCount] = useState(1)
  const yard = shipyardLevel(kingdom, now)
  const spec = shipSpec(ship)
  const why = shipsError(kingdom, ship, count, now)
  const queue = navyOf(kingdom).building.filter((b) => b.doneAt > now)
  const { willing } = recruitment(kingdom, now)
  return (
    <Section title="Tersane" icon="build" aside={yard ? `Sv. ${yard} · kızak ${queue.length} / ${yardSlots(kingdom, now)}` : 'yok'}>
      <div className="unit-pick" role="radiogroup" aria-label="Gemi türü">
        {SHIPS.map((x) => (
          <button key={x} className="btn small" role="radio" aria-checked={ship === x} onClick={() => setShip(x)} title={SHIP_NOTES[x]}>
            <Icon name={SHIP_ICONS[x]} size={16} /> {SHIP_NAMES[x]}
          </button>
        ))}
      </div>
      <p className="hint">{SHIP_NOTES[ship]}.</p>
      <Stat label="Güç · eskort · yük" value={`${spec.might} · ${spec.escort} · ${spec.cargo}`} note={`${spec.crew} denizci`} />
      <Stat
        label="Gemi başı"
        value={Object.entries(spec.cost)
          .map(([r, v]) => `${v} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`)
          .join(' · ')}
        note={`${spec.buildSeconds} sn · tur başı ${spec.upkeep} altın bakım`}
      />
      <div className="stepper">
        <button className="btn icon-only" disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label="Bir gemi azalt">
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{count}</b> {SHIP_NAMES[ship].toLowerCase()}
        </span>
        <button className="btn icon-only" disabled={count >= 20} onClick={() => setCount(count + 1)} aria-label="Bir gemi ekle">
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={!!why} title={why ? WHY[why] : undefined} onClick={() => online.act({ type: 'ships', ship, count })}>
          Kızağa koy {why ? `(${WHY[why]})` : ''}
        </button>
      </div>
      <p className="hint">Tayfalar asker havuzundan gelir (şu an {willing} gönüllü); denizciler köylü sayılmaz.</p>
      {queue.length > 0 && (
        <ul className="queue-list">
          {queue.map((b, i) => (
            <li key={i} className="queue-item">
              <Icon name={SHIP_ICONS[b.ship]} size={16} /> {b.count} {SHIP_NAMES[b.ship].toLowerCase()} <small>{clock(b.doneAt - now)}</small>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SeaLedger({ data }: { data: HudData }) {
  const l = navyOf(data.kingdom).ledger
  if (!l || l.voyages === 0) return <p className="hint">Henüz deniz ticareti seferi yapılmadı. Bir filoyu Deniz ticareti görevine gönder.</p>
  return (
    <Section title="Deniz ticareti" icon="trade" aside={`${l.voyages} sefer`}>
      <Stat label="Satılan" value={`${fmt(l.units)} birim`} note={`${fmt(l.gold)} altın`} />
      <Stat label="Korsan saldırısı" value={`${l.pirates}`} note={`${fmt(l.lostUnits)} birim yük, ${l.sunk} gemi kaybı`} tone={l.pirates ? 'down' : undefined} />
      <Meter value={l.voyages ? 1 - l.pirates / l.voyages : 1} label="Güvenli sefer oranı" segments={12} />
    </Section>
  )
}
