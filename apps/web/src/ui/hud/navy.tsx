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
  dockFleetError,
} from '@game/shared'
import type { Fleet, Good, MissionOrder, NavyError, NavyLook, Ship, Ships } from '@game/shared'
import { useState } from 'react'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import type { IconName } from '../icons'
import { RESOURCE_NAMES } from '../names'
import { lackWhy } from '../why'
import type { HudData } from './tabs'
import type { Online } from './online'
import type { IntelReport } from '../../net/online'
import { Meter, Placeholder, Section, Stat, fmt, percentOf } from './primitives'
import { Subtabs, usePart } from './Subtabs'
import type { Part } from './Subtabs'
import { PirateSection } from './outlaws'

// The navy (CLAUDE.md §8.5): the shipyard's slipways, the ships in the harbour, and up to two fleets with their
// missions — sea trade to a crown's harbour, fishing, pirate hunting, and at war blockades, raids and sorties.

export const SHIP_NAMES: Record<Ship, string> = { galley: L('Kadırga', 'Galley'), cog: L('Koka', 'Cog'), corsair: L('Çektiri', 'Raider') }
export const SHIP_NOTES: Record<Ship, string> = {
  galley: L('Ağır savaş gemisi: güçlü, ticareti iyi korur, çektirileri yener', 'Heavy warship: strong, guards trade well, beats raiders'),
  cog: L('Yük gemisi: çok yük taşır, balıkta iyidir; savaşta zayıf', 'Cargo ship: carries a lot, good at fishing; weak in battle'),
  corsair: L('Hızlı akıncı: kokaları yener, korsan avında iyidir (2. seviye tersane)', 'Fast raider: beats cogs, good at hunting pirates (level 2 shipyard)'),
}
const SHIP_ICONS: Record<Ship, IconName> = { galley: 'swords', cog: 'chest', corsair: 'ship' }
// "3 kadırga" / "3 galleys": the ship's name after a count, plural in English.
const shipWord = (n: number, x: Ship) => L(SHIP_NAMES[x].toLowerCase(), `${SHIP_NAMES[x].toLowerCase()}${n === 1 ? '' : 's'}`)

export const MISSION_NAMES: Record<Fleet['mission']['kind'], string> = {
  port: L('Limanda bekliyor', 'Waiting in harbour'),
  trade: L('Deniz ticareti', 'Sea trade'),
  fish: L('Balık avı', 'Fishing'),
  hunt: L('Korsan avı', 'Pirate hunt'),
  blockade: L('Abluka', 'Blockade'),
  raid: L('Kıyı akını', 'Coastal raid'),
  sortie: L('Ablukayı yarma', 'Breaking the blockade'),
  haven: L('Korsan limanı ablukası', 'Blockading a pirate haven'),
  return: L('Dönüyor', 'Returning'),
}

export const WHY: Partial<Record<NavyError, string>> = {
  locked: L('Tersane seviyesi yetmiyor', 'Shipyard level too low'),
  count: L('Geçersiz sayı', 'Invalid number'),
  cap: L('Limanda yer yok', 'No room in the harbour'),
  cost: L('Kaynak yetmiyor', 'Not enough resources'),
  crew: L('Tayfa yok (asker havuzu)', 'No crew (manpower)'),
  queue: L('Kızaklar dolu', 'The slipways are full'),
  fleets: L('En fazla 2 filo', '2 fleets at most'),
  ships: L('Gemi seç', 'Choose ships'),
  away: L('Filo uzakta', 'The fleet is away'),
  offDock: L('Filo iskeleden uzakta; önce iskeleye yüzdür', 'The fleet is far from the dock; sail it back first'),
  dock: L('Önce iskele kur', 'Build a dock first'),
  cargo: L('Yük taşıyan gemi yok', 'No ship that carries cargo'),
  warships: L('Savaş gemisi (kadırga ya da çektiri) gerekir', 'Needs a warship (galley or raider)'),
  blockaded: L('İskelen abluka altında', 'Your dock is blockaded'),
  notBlockaded: L('Abluka yok', 'No blockade'),
  target: L('Hedef uygun değil (savaşta olmalısın, iskelesi olmalı)', 'Unsuitable target (you must be at war, and it must have a dock)'),
  cooldown: L('Yeni akın için beklemelisin', 'You must wait before another raid'),
  city: L('Liman seç', 'Choose a harbour'),
  good: L('Mal seç', 'Choose a good'),
  held: L('Bu limanı başka bir lordun filosu abluka ediyor', "Another lord's fleet is blockading this haven"),
  nopath: L('Oraya su yolu yok', 'No waterway leads there'),
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 3600 ? L(`${Math.floor(s / 3600)} sa ${Math.floor((s % 3600) / 60)} dk`, `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`) : s >= 60 ? L(`${Math.floor(s / 60)} dk ${s % 60} sn`, `${Math.floor(s / 60)} min ${s % 60} s`) : L(`${s} sn`, `${s} s`)
}
const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
const dec = (v: number) => String(v).replace('.', L(',', '.'))

export function ShipRow({ ships }: { ships: Ships | null | undefined }) {
  const shown = SHIPS.filter((x) => (ships?.[x] ?? 0) > 0)
  if (shown.length === 0) return <span className="hint">{L('gemi yok', 'no ships')}</span>
  return (
    <span className="unit-row">
      {shown.map((x) => (
        <span key={x} className="chip" title={SHIP_NAMES[x]}>
          <Icon name={SHIP_ICONS[x]} size={16} /> {ships![x]} {shipWord(ships![x] ?? 0, x)}
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
          <button className="btn icon-only" disabled={(picked[x] ?? 0) <= 0} data-why={L('Bu türden seçili gemi yok', 'No ships of this type chosen')} onClick={() => onPick({ ...picked, [x]: (picked[x] ?? 0) - 1 })} aria-label={L('Azalt', 'Fewer')}>
            <Icon name="minus" size={16} />
          </button>
          <span className="stepper-value">
            <b>{picked[x] ?? 0}</b> / {from[x]}
          </span>
          <button className="btn icon-only" disabled={(picked[x] ?? 0) >= (from[x] ?? 0)} data-why={L('Bu türün bütün gemileri seçili', 'All ships of this type are chosen')} onClick={() => onPick({ ...picked, [x]: (picked[x] ?? 0) + 1 })} aria-label={L('Artır', 'More')}>
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
    { id: 'fleets', name: L('Filolar', 'Fleets'), icon: 'ship', count: navy.fleets.length },
    { id: 'harbour', name: L('Liman', 'Harbour'), icon: 'anchor', count: countShips(navy.harbour) },
    { id: 'yard', name: L('Tersane', 'Shipyard'), icon: 'build', count: navy.building.filter((b) => b.doneAt > now).length },
    { id: 'ledger', name: L('Defter', 'Ledger'), icon: 'trade' },
  ]
  if (yard === 0 && countShips(allShips(kingdom)) === 0) {
    return (
      <Section title={L('Donanma', 'Navy')} icon="ship">
        <Placeholder icon="lock" title={L('Tersanen yok', 'You have no shipyard')}>
          {L(
            'Sarayı 4. seviyeye yükselt, sonra İnşa sekmesinden suyun kıyısına bir tersane kur (en az bir karosu kıyıda olmalı). Tersane kadırga, koka ve çektiri yapar. Gemiler filolar halinde deniz ticaretine, balığa, korsan avına çıkar; savaşta düşmanın iskelesini abluka altına alır ya da kıyısına akın eder.',
            "Upgrade your palace to level 4, then build a shipyard on the waterside from the Build tab (at least one of its tiles must be on the shore). The shipyard builds galleys, cogs and raiders. Ships go out in fleets to trade by sea, to fish and to hunt pirates; at war they blockade the enemy's dock or raid his coast.",
          )}
        </Placeholder>
      </Section>
    )
  }
  return (
    <>
      {kingdom.blockade && (
        <p className="hint down alert-line">
          <Icon name="warn" size={16} /> {L('', 'The fleet of ')}<b>{kingdom.blockade.name}</b>
          {L(
            ` filosu iskeleni abluka altında tutuyor: iskele balık tutamıyor, deniz ticareti ve balık avı durdu, halkın mutluluğu ${balance.navy.blockade.happiness} düştü. Bir filoyu "Ablukayı yar" görevine gönderebilirsin.`,
            ` is blockading your dock: the dock cannot fish, sea trade and fishing have stopped, and your people's happiness has dropped by ${balance.navy.blockade.happiness}. You can send a fleet to "Break the blockade".`,
          )}
        </p>
      )}
      {season && (
        <p className="hint down alert-line">
          <Icon name="warn" size={16} /> {L(`Korsan mevsimi: denizler korsan kaynıyor (${clock(season.end - now)} daha). Korsan saldırısı olasılığı ×${PIRATE_SEASON_FACTOR}.`, `Pirate season: the waters are teeming with pirates (${clock(season.end - now)} more). Chance of a pirate attack ×${PIRATE_SEASON_FACTOR}.`)}
        </p>
      )}
      {kingdom.outlaws && kingdom.outlaws.sea > 0 && (
        <p className="hint down alert-line">
          <Icon name="warn" size={16} /> {L(`Korsanlar iskelenin önünde: korsanların ticarete etkisi %${Math.round(kingdom.outlaws.sea * 100)} (ayrıntısı Filolar bölümünde).`, `Pirates off your dock: their effect on trade is ${Math.round(kingdom.outlaws.sea * 100)}% (details under Fleets).`)}
        </p>
      )}
      <Subtabs label={L('Donanma', 'Navy')} parts={parts} part={part} onPart={setPart} />
      {part === 'fleets' && <Fleets data={data} online={online} />}
      {part === 'fleets' && <PirateSection kingdom={kingdom} />}
      {part === 'harbour' && <Harbour data={data} online={online} />}
      {part === 'yard' && <Shipyard data={data} online={online} />}
      {part === 'ledger' && <SeaLedger data={data} />}
      {part !== 'yard' && navy.fleets.length === 0 && countShips(navy.harbour) === 0 && navy.building.length === 0 && <p className="hint">{L('Henüz gemin yok. Tersane bölümünden gemi yaptır.', 'You have no ships yet. Have some built in the Shipyard section.')}</p>}
    </>
  )
}

function Fleets({ data, online }: { data: HudData; online: Online }) {
  const navy = navyOf(data.kingdom)
  return (
    <Section title={L('Filolarım', 'My fleets')} icon="ship" aside={`${navy.fleets.length} / ${balance.navy.maxFleets}`}>
      {navy.fleets.length === 0 && <p className="hint">{L('Filon yok. Liman bölümünde limandaki gemilerden bir filo çıkar.', 'You have no fleet. Form one from the ships in the Harbour section.')}</p>}
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
      return L(`${cityInfo(world, m.city).capital} limanına ${RESOURCE_NAMES[m.good].toLowerCase()} taşıyor · sefer dönüşü ${clock(left)}`, `Carrying ${RESOURCE_NAMES[m.good].toLowerCase()} to the harbour of ${cityInfo(world, m.city).capital} · back in ${clock(left)}`)
    }
    case 'blockade':
      return m.arriveAt > now ? L(`${m.name} iskelesine yol alıyor · varış ${clock(m.arriveAt - now)}`, `Sailing for ${m.name}'s dock · arrives in ${clock(m.arriveAt - now)}`) : m.resolved ? L(`${m.name} iskelesini abluka altında tutuyor`, `Blockading ${m.name}'s dock`) : L(`${m.name} iskelesinde çarpışma bekleniyor`, `A clash is expected at ${m.name}'s dock`)
    case 'raid':
      return m.arriveAt > now ? L(`${m.name} kıyısına akına gidiyor · varış ${clock(m.arriveAt - now)}`, `Off to raid ${m.name}'s coast · arrives in ${clock(m.arriveAt - now)}`) : L(`${m.name} kıyısında`, `Off ${m.name}'s coast`)
    case 'sortie':
      return L(`Ablukacı filoya saldırıyor · ${clock(m.arriveAt - now)}`, `Attacking the blockading fleet · ${clock(m.arriveAt - now)}`)
    case 'return': {
      const cargo = Object.entries(m.cargo ?? {}).filter(([, v]) => (v ?? 0) > 0)
      return `${L('Eve dönüyor', 'Returning home')} · ${clock(m.arriveAt - now)}${cargo.length ? ` · ${L('ganimet', 'plunder')}: ${cargo.map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()}`).join(', ')}` : ''}`
    }
    case 'fish':
      {
      const catch_ = (balance.navy.ships.cog.fish * (f.ships.cog ?? 0) + balance.navy.ships.galley.fish * (f.ships.galley ?? 0) + balance.navy.ships.corsair.fish * (f.ships.corsair ?? 0)).toFixed(1)
      return L(`${f.sail ? 'Durduğu yerin çevresinde' : 'İskele önünde'} balık tutuyor · tur başına +${catch_.replace('.', ',')} yemek (arazi çarpanından önce)`, `Fishing ${f.sail ? 'round where it lies' : 'off the dock'} · +${catch_} food per round (before the land multiplier)`)
    }
    case 'hunt':
      return L('Korsanların peşinde · yakalanan her korsan için ödül (haritadaki korsan teknelerini "Takip et" ile kovalayabilirsin)', 'After pirates · a reward for every pirate caught (you can chase the pirate boats on the map with "Chase")')
    default:
      return f.sail ? L('gönderildiği yerde demirli', 'at anchor where it was sent') : L('iskeleyi savunur; iskelenin açığında demirli', 'guards the dock; at anchor off it')
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
  // The mission the fleet is on shows lit and is not sent again (trade still opens its goods and harbours).
  const on = (kind: Fleet['mission']['kind']) => (fleet.mission.kind === kind ? 'btn small active current' : 'btn small')
  return (
    <li className={online.fleet === fleet.id ? 'army-card selected' : 'army-card'}>
      <div className="army-body">
        <div className="army-head fleet-head">
          <b>
            <Icon name="ship" size={16} /> {L(`${index}. filo`, `Fleet ${index}`)}
          </b>
          <button className="btn small" aria-pressed={online.fleet === fleet.id} onClick={() => online.showFleet(fleet.id)} title={L('Haritada seç ve göster', 'Select and show on the map')}>
            <Icon name="pin" size={16} /> {L('Göster', 'Show')}
          </button>
          <small>
            {L(`${countShips(fleet.ships)} gemi · güç ${shipMight(fleet.ships).toFixed(1).replace('.', ',')} · yük ${cargoOf(fleet.ships)} · eskort ${escortOf(fleet.ships).toFixed(1).replace('.', ',')}`, `${countShips(fleet.ships)} ship${countShips(fleet.ships) === 1 ? '' : 's'} · might ${shipMight(fleet.ships).toFixed(1)} · cargo ${cargoOf(fleet.ships)} · escort ${escortOf(fleet.ships).toFixed(1)}`)}
          </small>
        </div>
        <ShipRow ships={fleet.ships} />
        <p className="hint">
          <b>{MISSION_NAMES[fleet.mission.kind]}</b> · {missionStatus(data, fleet)}
        </p>
        {fleet.sail && fleet.sail.arriveAt > now && <p className="hint">{L(`Suda yol alıyor · varış ${clock(fleet.sail.arriveAt - now)}`, `Under sail · arrives in ${clock(fleet.sail.arriveAt - now)}`)}</p>}
        {fleet.chase && (
          <p className="hint">
            <Icon name="swords" size={16} /> {L(`Korsan teknesinin peşinde: yakaladığı an deniz savaşı olur; filonun gücü ${shipMight(fleet.ships).toFixed(1).replace('.', ',')}.`, `Chasing a pirate boat: a sea battle the moment it catches up; the fleet's might is ${shipMight(fleet.ships).toFixed(1)}.`)}{' '}
            <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'unchase', fleet: fleet.id })}>
              {L('Takibi bırak', 'Stop chasing')}
            </button>
          </p>
        )}
        {fleet.mission.kind === 'trade' && (
          <p className="hint">{L(`Korsan saldırısı olasılığı her seferde ${pct(pirateChance(kingdom, fleet, now))}. Savaş gemileri eskort eder; başka bir filo korsan avındaysa olasılık yarıya iner.`, `Chance of a pirate attack each voyage: ${pct(pirateChance(kingdom, fleet, now))}. Warships escort; if another fleet is hunting pirates the chance halves.`)}</p>
        )}
        {home && (
          <div className="army-actions">
            <button className="btn small" disabled={fleet.mission.kind === 'trade'} title={fleet.mission.kind === 'trade' ? L('Ticaretteki filo yerinden oynamaz', 'A trading fleet does not move') : L('Haritada bir nehre ya da göle tıkla', 'Click a river or lake on the map')} onClick={() => online.sail(fleet.id)}>
              <Icon name="ship" size={16} /> {L('Hareket et', 'Move')}
            </button>
            <button className={on('port')} aria-pressed={fleet.mission.kind === 'port'} disabled={!!simple('port')} data-why={WHY[simple('port') as NavyError] ?? L('Şu an olmaz', 'Not now')} onClick={() => fleet.mission.kind !== 'port' && mission({ kind: 'port' })}>
              <Icon name="anchor" size={16} /> {L('Limanda bekle', 'Wait in harbour')}
            </button>
            <button className={on('trade')} aria-pressed={picking === 'trade' || fleet.mission.kind === 'trade'} onClick={() => setPicking(picking === 'trade' ? null : 'trade')}>
              <Icon name="trade" size={16} /> {L('Deniz ticareti', 'Sea trade')}
            </button>
            <button className={on('fish')} aria-pressed={fleet.mission.kind === 'fish'} disabled={!!simple('fish')} data-why={WHY[simple('fish') as NavyError] ?? L('Şu an olmaz', 'Not now')} title={WHY[simple('fish') as NavyError]} onClick={() => fleet.mission.kind !== 'fish' && mission({ kind: 'fish' })}>
              <Icon name="food" size={16} /> {L('Balık avı', 'Fishing')}
            </button>
            <button className={on('hunt')} aria-pressed={fleet.mission.kind === 'hunt'} disabled={!!simple('hunt')} data-why={WHY[simple('hunt') as NavyError] ?? L('Şu an olmaz', 'Not now')} title={WHY[simple('hunt') as NavyError]} onClick={() => fleet.mission.kind !== 'hunt' && mission({ kind: 'hunt' })}>
              <Icon name="eye" size={16} /> {L('Korsan avı', 'Pirate hunt')}
            </button>
            <button className="btn small" aria-pressed={picking === 'blockade'} disabled={enemies.length === 0} title={enemies.length === 0 ? L('Savaşta olduğun, iskelesi olan bir lord yok', 'No lord you are at war with has a dock') : undefined} onClick={() => setPicking(picking === 'blockade' ? null : 'blockade')}>
              <Icon name="lock" size={16} /> {L('Abluka', 'Blockade')}
            </button>
            <button className="btn small" aria-pressed={picking === 'raid'} disabled={enemies.length === 0} title={enemies.length === 0 ? L('Savaşta olduğun, iskelesi olan bir lord yok', 'No lord you are at war with has a dock') : undefined} onClick={() => setPicking(picking === 'raid' ? null : 'raid')}>
              <Icon name="swords" size={16} /> {L('Kıyı akını', 'Coastal raid')}
            </button>
            {kingdom.blockade && (
              <button className="btn small danger" disabled={!!simple('sortie')} data-why={WHY[simple('sortie') as NavyError] ?? L('Şu an olmaz', 'Not now')} title={WHY[simple('sortie') as NavyError]} onClick={() => mission({ kind: 'sortie' })}>
                <Icon name="swords" size={16} /> {L('Ablukayı yar', 'Break the blockade')}
              </button>
            )}
            <button className="btn small" disabled={countShips(fleet.ships) < 2 || others.length + 1 >= balance.navy.maxFleets} data-why={countShips(fleet.ships) < 2 ? L('Bölmek için en az 2 gemi gerekir', 'Splitting needs at least 2 ships') : L(`En fazla ${balance.navy.maxFleets} filon olabilir`, `You can have at most ${balance.navy.maxFleets} fleets`)} onClick={() => setPicking(picking === 'split' ? null : 'split')} aria-pressed={picking === 'split'}>
              <Icon name="ship" size={16} /> {L('Böl', 'Split')}
            </button>
            {merge && (
              <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'merge', fleet: fleet.id, other: merge.id })}>
                {L('Diğer filoyla birleş', 'Merge with the other fleet')}
              </button>
            )}
            <button
              className="btn small"
              disabled={!!dockFleetError(kingdom, fleet.id, now)}
              data-why={WHY[dockFleetError(kingdom, fleet.id, now) ?? 'fleet']}
              onClick={() => online.act({ type: 'fleet', action: 'dock', fleet: fleet.id })}
            >
              <Icon name="anchor" size={16} /> {L('Limana bağla', 'Dock in harbour')}
            </button>
          </div>
        )}
        {!home && fleet.mission.kind !== 'return' && (
          <div className="army-actions">
            <button className="btn small" disabled={!!recallError(kingdom, fleet.id, now)} data-why={recallError(kingdom, fleet.id, now) === 'engaged' ? L('Filo vardı, çarpışma başlamak üzere; şimdi geri çağrılamaz', 'The fleet has arrived and a clash is about to begin; it cannot be recalled now') : (WHY[recallError(kingdom, fleet.id, now) as NavyError] ?? L('Şu an geri çağrılamaz', 'Cannot be recalled right now'))} title={recallError(kingdom, fleet.id, now) === 'engaged' ? L('Çarpışma başlamak üzere', 'A clash is about to begin') : undefined} onClick={() => online.act({ type: 'fleet', action: 'recall', fleet: fleet.id })}>
              <Icon name="home" size={16} /> {L('Geri çağır', 'Recall')}
            </button>
          </div>
        )}
        {picking === 'trade' && (
          <div className="fleet-pick">
            <div className="unit-pick choices" role="radiogroup" aria-label={L('Taşınacak mal', 'Goods to carry')}>
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
                  <li key={i} className="port-item">
                    <b style={{ color: info.color }}>{L(`${info.capital} limanı`, `Harbour of ${info.capital}`)}</b>
                    <small>
                      {L(`sefer ${trip ? clock(trip) : '—'} · birimi ${price.toFixed(2).replace('.', ',')} · saatte yaklaşık ${fmt(per)} altın`, `voyage ${trip ? clock(trip) : '—'} · ${price.toFixed(2)} a unit · about ${fmt(per)} gold an hour`)}
                    </small>
                    <button className="btn small" disabled={!!why} data-why={why ? (WHY[why] ?? L('Şu an olmaz', 'Not now')) : undefined} onClick={() => mission({ kind: 'trade', good, city: i })}>
                      <Icon name="ship" size={16} /> {fleet.mission.kind === 'trade' && fleet.mission.city === i && fleet.mission.good === good ? L('Bu sefer sürüyor', 'This voyage is under way') : L('Yelken aç', 'Set sail')}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="hint">
              {L(`Deniz ticareti lobi pazarından tüccarına göre az etkilenir (fiyatı yarı oranda düşürür); limandaki aracılar fiyatın ${percentOf((1 - balance.navy.trade.priceFactor) * 100)} alır. Satış yaptığın tacın gözünde değerin artar.`, `Sea trade moves the lobby market less than your merchant does (it lowers the price half as much); the harbour's middlemen take ${percentOf((1 - balance.navy.trade.priceFactor) * 100)} of the price. Your worth rises in the eyes of the crown you sell to.`)}
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
                    {L('yol', 'voyage')} {clock(voyageMs(kingdom.dockPlot, ctx.target.dockPlot))}
                    {k.navy && L(` · limanı ${roughShips(k.navy.harbour)}`, ` · harbour: ${roughShips(k.navy.harbour)}`)}
                    {k.blockade && L(' · zaten abluka altında', ' · already blockaded')}
                  </small>
                  <button className="btn small danger" disabled={!!why} data-why={why ? (WHY[why] ?? L('Şu an olmaz', 'Not now')) : undefined} onClick={() => mission({ kind: picking, target: k.id })}>
                    {picking === 'blockade' ? L('Abluka et', 'Blockade') : L('Akın et', 'Raid')}
                  </button>
                </li>
              )
            })}
            <li className="hint">
              {picking === 'blockade'
                ? L('Filo iskeleye varınca oradaki gemilerle çarpışır; kazanırsa iskeleyi abluka altına alır: hedefin balığı, deniz ticareti ve balık avı durur, halkı huzursuzlanır. Savaş bitince ya da geri çağırınca abluka kalkar.', "When the fleet reaches the dock it clashes with the ships there; if it wins it blockades the dock: the target's fishing, sea trade and fishing fleets stop, and its people grow restless. The blockade lifts when the war ends or when you recall the fleet.")
                : L(`Filo kıyıya varınca oradaki gemilerle çarpışır; kazanırsa depolardan her malın ${percentOf(balance.navy.raid.stealShare * 100)} gemilerin taşıyabildiği kadar alıp döner. Yük gemileri (koka) daha çok taşır.`, `When the fleet reaches the coast it clashes with the ships there; if it wins it carries off ${percentOf(balance.navy.raid.stealShare * 100)} of every good in the stores, as much as the ships can hold. Cargo ships (cogs) carry more.`)}
            </li>
          </ul>
        )}
        {picking === 'split' && (
          <div className="fleet-pick">
            <ShipPicker from={fleet.ships} picked={split} onPick={setSplit} />
            <button
              className="btn small"
              disabled={!!splitFleetError(kingdom, fleet.id, split)}
              data-why={WHY[splitFleetError(kingdom, fleet.id, split) as NavyError] ?? L('Yeni filoya gidecek gemileri seç (hepsi değil)', 'Choose the ships for the new fleet (not all of them)')}
              onClick={() => online.act({ type: 'fleet', action: 'split', fleet: fleet.id, ships: split }).then(() => (setSplit({}), setPicking(null)))}
            >
              {L(`${countShips(split)} gemiyle yeni filo`, `New fleet of ${countShips(split)} ship${countShips(split) === 1 ? '' : 's'}`)}
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
    <Section title={L('Liman', 'Harbour')} icon="anchor" aside={L(`${total} / ${harbourCap(kingdom, now)} gemi · ${sailorsOf(kingdom)} denizci`, `${total} / ${harbourCap(kingdom, now)} ships · ${sailorsOf(kingdom)} sailor${sailorsOf(kingdom) === 1 ? '' : 's'}`)}>
      {countShips(navy.harbour) === 0 ? (
        <p className="hint">{L('Limanda bağlı gemi yok.', 'No ships moored in the harbour.')}</p>
      ) : (
        <>
          <p className="hint">{L('Limandaki gemiler ve limanda bekleyen filolar iskeleyi savunur.', 'Ships in the harbour and fleets waiting there defend the dock.')}</p>
          <ShipPicker from={navy.harbour} picked={ships} onPick={setPicked} />
          <button className="btn small" disabled={!!why} data-why={why ? (WHY[why] ?? L('Şu an olmaz', 'Not now')) : undefined} onClick={() => online.act({ type: 'fleet', action: 'form', ships }).then(() => setPicked(null))}>
            {L(`${countShips(ships)} gemiyle filo çıkar`, `Form a fleet of ${countShips(ships)} ship${countShips(ships) === 1 ? '' : 's'}`)}
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
    <Section title={L('Tersane', 'Shipyard')} icon="build" aside={yard ? L(`Sv. ${yard} · kızak ${queue.length} / ${yardSlots(kingdom, now)}`, `Lv. ${yard} · slipways ${queue.length} / ${yardSlots(kingdom, now)}`) : L('yok', 'none')}>
      <div className="unit-pick choices" role="radiogroup" aria-label={L('Gemi türü', 'Ship type')}>
        {SHIPS.map((x) => (
          <button key={x} className="btn small" role="radio" aria-checked={ship === x} onClick={() => setShip(x)} title={SHIP_NOTES[x]}>
            <Icon name={SHIP_ICONS[x]} size={16} /> {SHIP_NAMES[x]}
          </button>
        ))}
      </div>
      <p className="hint">{SHIP_NOTES[ship]}.</p>
      <Stat label={L('Savaş gücü', 'Might')} value={dec(spec.might)} note={L(`${spec.crew} denizci`, `${spec.crew} sailors`)} />
      <Stat label={L('Eskort gücü', 'Escort')} value={spec.escort > 0 ? dec(spec.escort) : L('yok', 'none')} note={L('ticaret seferini korsanlardan korur', 'guards trade voyages from pirates')} />
      <Stat label={L('Yük', 'Cargo')} value={L(`${spec.cargo} birim`, `${spec.cargo} units`)} />
      <Stat
        label={L('Gemi başı', 'Per ship')}
        value={Object.entries(spec.cost)
          .map(([r, v]) => `${v} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`)
          .join(' · ')}
        note={L(`${spec.buildSeconds} sn · tur başı ${spec.upkeep.toLocaleString(locale())} altın bakım`, `${spec.buildSeconds} s · ${spec.upkeep.toLocaleString(locale())} gold upkeep a round`)}
      />
      <div className="stepper">
        <button className="btn icon-only" disabled={count <= 1} data-why={L('En az 1 gemi', 'At least 1 ship')} onClick={() => setCount(count - 1)} aria-label={L('Bir gemi azalt', 'One ship fewer')}>
          <Icon name="minus" size={16} />
        </button>
        <span className="stepper-value">
          <b>{count}</b> {shipWord(count, ship)}
        </span>
        <button className="btn icon-only" disabled={count >= 20} data-why={L('Bir seferde en fazla 20 gemi', '20 ships at a time at most')} onClick={() => setCount(count + 1)} aria-label={L('Bir gemi ekle', 'One ship more')}>
          <Icon name="plus" size={16} />
        </button>
        <button className="btn small" disabled={!!why} data-why={why === 'cost' ? (lackWhy(kingdom.stock, Object.fromEntries(Object.entries(spec.cost).map(([r, v]) => [r, (v ?? 0) * count]))) ?? WHY.cost) : why ? WHY[why] : undefined} onClick={() => online.act({ type: 'ships', ship, count })}>
          {L('Kızağa koy', 'Lay down')} {why ? `(${WHY[why]})` : ''}
        </button>
      </div>
      <p className="hint">{L(`Tayfalar asker havuzundan gelir (şu an ${willing} gönüllü); denizciler köylü sayılmaz.`, `Crews come from manpower (${willing} willing right now); sailors do not count as villagers.`)}</p>
      {queue.length > 0 && (
        <ul className="queue-list">
          {queue.map((b, i) => (
            <li key={i} className="queue-item">
              <Icon name={SHIP_ICONS[b.ship]} size={16} /> {b.count} {shipWord(b.count, b.ship)} <small>{clock(b.doneAt - now)}</small>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SeaLedger({ data }: { data: HudData }) {
  const l = navyOf(data.kingdom).ledger
  if (!l || l.voyages === 0) return <p className="hint">{L('Henüz deniz ticareti seferi yapılmadı. Bir filoyu Deniz ticareti görevine gönder.', 'No sea trade voyages yet. Send a fleet on a Sea trade mission.')}</p>
  return (
    <Section title={L('Deniz ticareti', 'Sea trade')} icon="trade" aside={L(`${l.voyages} sefer`, `${l.voyages} voyage${l.voyages === 1 ? '' : 's'}`)}>
      <Stat label={L('Satılan', 'Sold')} value={L(`${fmt(l.units)} birim`, `${fmt(l.units)} units`)} note={L(`${fmt(l.gold)} altın`, `${fmt(l.gold)} gold`)} />
      <Stat label={L('Korsan saldırısı', 'Pirate attacks')} value={`${l.pirates}`} note={L(`${fmt(l.lostUnits)} birim yük, ${l.sunk} gemi kaybı`, `${fmt(l.lostUnits)} units of cargo, ${l.sunk} ship${l.sunk === 1 ? '' : 's'} lost`)} tone={l.pirates ? 'down' : undefined} />
      <Meter value={l.voyages ? 1 - l.pirates / l.voyages : 1} label={L('Güvenli sefer oranı', 'Safe voyage rate')} segments={12} />
    </Section>
  )
}

// How big another lord's fleet or harbour looks to the lobby (rough_ships: 3, 8 or 16; CLAUDE.md §8.5).
export const roughShips = (n: number) => (n <= 0 ? L('gemisiz', 'no ships') : n <= 3 ? L('birkaç gemi', 'a few ships') : n <= 8 ? L('orta boy', 'medium') : L('büyük', 'large'))

// Another lord's fleet, picked on the map: whose, roughly how big, what it is doing, and — through the spies' army
// network — how many of which ships.
export function RivalFleetSheet({ lord, color, index, fleet, intel, now, onSpy, onLord, onShow, onClose }: {
  lord: string
  color: string
  index: number
  fleet: NavyLook['fleets'][number]
  // The latest spy report on that lord (undefined: not asked yet).
  intel: IntelReport | null | undefined
  now: number
  onSpy(): void
  onLord(): void
  onShow(): void
  onClose(): void
}) {
  const sailing = fleet.sail && fleet.sail.arriveAt > now
  const spied = intel?.navy?.fleets.find((f) => f.id === fleet.id) ?? null
  const network = intel?.strength.army ?? 0
  const range = (e: { lo: number; hi: number }) => (e.lo === e.hi ? `${e.lo}` : `${e.lo}–${e.hi}`)
  return (
    <section className="sheet frame" aria-labelledby="fleet-title">
      <header className="sheet-head">
        <Icon name="ship" size={32} />
        <div>
          <h2 id="fleet-title">
            <span style={{ color }}>{lord}</span> · {L(`${index}. filo`, `Fleet ${index}`)}
          </h2>
          <small>
            {roughShips(fleet.ships)} · {MISSION_NAMES[fleet.mission]}
          </small>
        </div>
        <button className="btn icon-only" onClick={onShow} aria-label={L('Haritada göster', 'Show on the map')} title={L('Haritada göster', 'Show on the map')}>
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <Section title={L('Gemiler', 'Ships')} icon="ship" aside={spied ? L(`casus ağı %${network}`, `spy network ${network}%`) : L('uzaktan', 'from afar')}>
          {spied ? (
            <>
              {SHIPS.filter((x) => spied.ships[x].hi > 0).map((x) => (
                <Stat key={x} label={SHIP_NAMES[x]} value={range(spied.ships[x])} note={L(`güç ${dec(shipSpec(x).might)} · eskort ${dec(shipSpec(x).escort)} · yük ${shipSpec(x).cargo}`, `might ${dec(shipSpec(x).might)} · escort ${dec(shipSpec(x).escort)} · cargo ${shipSpec(x).cargo}`)} />
              ))}
              <p className="hint">{L('Casusların tahmini; ağ güçlendikçe aralık daralır.', "Your spies' estimate; the range narrows as the network grows.")}</p>
            </>
          ) : (
            <>
              <p className="hint">
                {L('Uzaktan yalnız filonun ne kadar büyük olduğu görünür: ', 'From afar only the fleet\'s size shows: ')}<b>{roughShips(fleet.ships)}</b>
                {fleet.galleys && L(', aralarında kadırga var', ', galleys among them')}
                {L('. Hangi gemiden kaç tane olduğunu casusların söyler: bu lordda ', '. How many of which ships, your spies will tell: you need at least a 30% network on this lord\'s ')}<b>{L('Ordu', 'Army')}</b>
                {L(' konusunda en az %30 ağın olmalı', ' topic')}
                {intel ? L(` (şu an %${network})`, ` (now ${network}%)`) : ''}.
              </p>
              <button className="btn small" onClick={onSpy}>
                <Icon name="eye" size={16} /> {L('Casus raporunu getir', 'Fetch the spy report')}
              </button>
            </>
          )}
        </Section>
        <Section title={L('Ne yapıyor', 'What it is doing')} icon="scroll">
          <p className="hint">
            <b>{MISSION_NAMES[fleet.mission]}</b>
            {sailing && L(` · suda yol alıyor, varış ${clock(fleet.sail!.arriveAt - now)}`, ` · under sail, arrives in ${clock(fleet.sail!.arriveAt - now)}`)}
            {fleet.arriveAt && fleet.arriveAt > now && L(` · hedefe varış ${clock(fleet.arriveAt - now)}`, ` · reaches its target in ${clock(fleet.arriveAt - now)}`)}
          </p>
          <button className="btn small" onClick={onLord}>
            <Icon name="crown" size={16} /> {L('Lordu aç', "Open the lord's page")}
          </button>
        </Section>
      </div>
    </section>
  )
}
