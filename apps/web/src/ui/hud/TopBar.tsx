import { BUILDINGS, balance, buildingOutput, gameTime, population, tradeUnits } from '@game/shared'
import type { BuildingKind, Kingdom, Resource, Stock } from '@game/shared'
import type React from 'react'
import { PHASE_NAMES, dayPhase, isNight } from '../../game/daylight'
import { Icon } from '../icons'
import { BUILDING_NAMES, RESOURCE_ICONS, RESOURCE_NAMES } from '../names'
import type { TabId } from './Hud'
import { History, Meter, fmt, short, signed } from './primitives'
import { RESOURCES, flows } from './tabs'

// Stores along the top. Each one shows a small card on hover (or keyboard focus): where it comes from, where it goes,
// its recent course. The clock at the end tells the game time; one game day passes in one real hour.

interface Props {
  kingdom: Kingdom
  now: number
  // When the lobby's season began; game days count from here.
  seasonStart: number
  history: Stock[]
  onOpen: (tab: TabId) => void
}

export function TopBar({ kingdom, now, seasonStart, history, onOpen }: Props) {
  const flow = flows(kingdom, now)
  const { villagers, jobs } = population(kingdom, now)
  return (
    <div className="topbar frame" role="group" aria-label="Kaynaklar">
      {RESOURCES.map((r) => {
        const net = flow[r].net
        return (
          <Chip
            key={r}
            label={`${RESOURCE_NAMES[r]} ${fmt(kingdom.stock[r])}, tur başına ${signed(net)}`}
            onClick={() => onOpen('store')}
            card={<ResourceCard resource={r} kingdom={kingdom} now={now} history={history} />}
          >
            <Icon name={RESOURCE_ICONS[r]} size={24} />
            <span className="res-value">
              <b>{short(kingdom.stock[r])}</b>
              {Math.abs(net) > 0.05 && <small className={net < 0 ? 'down' : 'up'}>{signed(net)}</small>}
            </span>
          </Chip>
        )
      })}
      <Chip label={`Köylü ${villagers}, iş gücü ihtiyacı ${jobs}`} onClick={() => onOpen('people')} card={<PeopleCard kingdom={kingdom} now={now} />}>
        <Icon name="villager" size={24} />
        <span className="res-value">
          <b>{villagers}</b>
          <small className={villagers < jobs ? 'down' : ''}>/{jobs}</small>
        </span>
      </Chip>
      <Clock now={now} seasonStart={seasonStart} />
    </div>
  )
}

// A store button with its hover card below it.
function Chip({ label, onClick, card, children }: { label: string; onClick: () => void; card: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="res-wrap">
      <button className="res" onClick={onClick} aria-label={label}>
        {children}
      </button>
      <div className="pop frame" role="tooltip">
        {card}
      </div>
    </div>
  )
}

const num = (v: number) => v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ',')

// Each building kind's share of what comes in, and what goes out where.
function ResourceCard({ resource: r, kingdom, now, history }: { resource: Resource; kingdom: Kingdom; now: number; history: Stock[] }) {
  const { made, used, net } = flows(kingdom, now)[r]
  const sources = new Map<BuildingKind, { count: number; units: number }>()
  for (const b of kingdom.buildings) {
    const out = buildingOutput(kingdom, b, now)
    if (!out || out.makes !== r) continue
    const entry = sources.get(b.kind) ?? { count: 0, units: 0 }
    sources.set(b.kind, { count: entry.count + 1, units: entry.units + out.units })
  }
  const lines: { name: string; value: number }[] = [...sources].map(([kind, s]) => ({ name: `${BUILDING_NAMES[kind]} ×${s.count}`, value: s.units }))
  const { villagers } = population(kingdom, now)
  const trips = balance.economy.productionSeconds / balance.economy.trade.tripSeconds
  if (r === 'gold' && kingdom.trade.good) lines.push({ name: 'Tüccar', value: made })
  if (r === 'food' && villagers > 0) lines.push({ name: `Köylüler (${villagers})`, value: -villagers * balance.economy.foodPerVillager })
  if (r === kingdom.trade.good) lines.push({ name: 'Tüccar satıyor', value: -tradeUnits(kingdom) * trips })
  // Raw goods worked into weapons in the forges.
  const worked = used - (r === 'food' ? villagers * balance.economy.foodPerVillager : 0) - (r === kingdom.trade.good ? tradeUnits(kingdom) * trips : 0)
  if (worked > 0.05) lines.push({ name: 'Atölyede işleniyor', value: -worked })
  const scale = Math.max(made, used, 0.01)
  const runsOut = net < -0.01 ? Math.floor(kingdom.stock[r] / -net) : null
  const series = history.map((s) => s[r])
  return (
    <>
      <header className="pop-head">
        <Icon name={RESOURCE_ICONS[r]} size={24} />
        <b>{RESOURCE_NAMES[r]}</b>
        <strong>{fmt(kingdom.stock[r])}</strong>
      </header>
      <div className="flowbars" aria-label="Tur başına gelen ve giden">
        <span>Gelen</span>
        <i className="up" style={{ width: `${(made / scale) * 100}%` }} />
        <small className="up">{signed(made)}</small>
        <span>Giden</span>
        <i className="down" style={{ width: `${(used / scale) * 100}%` }} />
        <small className="down">{signed(-used)}</small>
      </div>
      {lines.length > 0 && (
        <ul className="pop-lines">
          {lines.map((l) => (
            <li key={l.name}>
              <span>{l.name}</span>
              <b className={l.value < 0 ? 'down' : 'up'}>{l.value < 0 ? '−' : '+'}{num(Math.abs(l.value))}</b>
            </li>
          ))}
        </ul>
      )}
      {series.length > 1 && <History values={series} label={`Son ${series.length} tur`} />}
      <p className="pop-foot">
        {runsOut !== null ? (
          <span className="down">
            <Icon name="warn" size={8} /> ~{runsOut} tur sonra tükenir
          </span>
        ) : (
          <span>Net {signed(net)} / tur ({balance.economy.productionSeconds} sn)</span>
        )}
      </p>
    </>
  )
}

function PeopleCard({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const { villagers, jobs, efficiency, cap, soldiers, housing } = population(kingdom, now)
  const homes = kingdom.buildings.filter((b) => b.doneAt <= now && (BUILDINGS[b.kind].villagers ?? 0) > 0).length
  const most = Math.max(villagers, jobs, 1)
  return (
    <>
      <header className="pop-head">
        <Icon name="people" size={24} />
        <b>Halk</b>
        <strong>{villagers}</strong>
      </header>
      <div className="flowbars">
        <span>Köylü</span>
        <i className="up" style={{ width: `${(villagers / most) * 100}%` }} />
        <small>{villagers}</small>
        <span>İş</span>
        <i style={{ width: `${(jobs / most) * 100}%` }} />
        <small>{jobs}</small>
      </div>
      <ul className="pop-lines">
        <li>
          <span>Nüfus / sınır</span>
          <b className={villagers + soldiers >= cap ? 'down' : undefined}>
            {villagers + soldiers} / {cap}
          </b>
        </li>
        {soldiers > 0 && (
          <li>
            <span>Asker</span>
            <b>{soldiers}</b>
          </li>
        )}
        <li>
          <span>Barınak (ev, saray)</span>
          <b>
            {homes} · {housing} kişilik
          </b>
        </li>
        <li>
          <span>Üretim verimi</span>
          <b className={efficiency < 1 ? 'down' : 'up'}>%{Math.round(efficiency * 100)}</b>
        </li>
        <li>
          <span>Boşta köylü</span>
          <b>{Math.max(0, villagers - jobs)}</b>
        </li>
      </ul>
    </>
  )
}

// Game date and time, with a card showing the day as a 24-hour strip.
function Clock({ now, seasonStart }: { now: number; seasonStart: number }) {
  const t = gameTime(now, seasonStart)
  const night = isNight(t.hour)
  const time = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`
  const phase = PHASE_NAMES[dayPhase(t.hour)]
  return (
    <div className="res-wrap">
      <span className="res clock" tabIndex={0} aria-label={`${t.day}. gün, saat ${time}, ${phase}`}>
        <Icon name={night ? 'moon' : 'sun'} size={24} />
        <span className="res-value">
          <b>{time}</b>
          <small>{t.day}. gün</small>
        </span>
      </span>
      <div className="pop frame right" role="tooltip">
        <header className="pop-head">
          <Icon name={night ? 'moon' : 'sun'} size={24} />
          <b>{phase}</b>
          <strong>{time}</strong>
        </header>
        <div className="daystrip" aria-hidden>
          {Array.from({ length: 24 }, (_, h) => (
            <i key={h} className={dayPhase(h + 0.5)} />
          ))}
          <em style={{ left: `${(t.hour / 24) * 100}%` }} />
        </div>
        <div className="daystrip-hours" aria-hidden>
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>
        <ul className="pop-lines">
          <li>
            <span>Tarih</span>
            <b>
              {t.month}. ay, {t.dayOfMonth}. gün
            </b>
          </li>
          <li>
            <span>Sezon</span>
            <b>
              {t.day} / {balance.time.seasonGameDays} gün
            </b>
          </li>
          <li>
            <span>Yeni gün</span>
            <b>{Math.ceil(t.untilNextDay / 60000)} dk sonra</b>
          </li>
        </ul>
        <Meter value={t.day / balance.time.seasonGameDays} label="Sezon ilerlemesi" segments={16} />
        <p className="pop-foot">Oyunda 1 gün = gerçekte 1 saat.</p>
      </div>
    </div>
  )
}
