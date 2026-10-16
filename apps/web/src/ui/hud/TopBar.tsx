import { BUILDINGS, balance, buildingOutput, constructing, maxConstructions, fishCatch, gameTime, goldCap, growthTerms, idleFactor, ledger, population, timeToFill, roundOutcome, sailorsOf, storageCap, townYield } from '@game/shared'
import type { BuildingKind, Kingdom, Market, Resource, Stock } from '@game/shared'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { PHASE_NAMES, dayPhase, isNight } from '../../game/daylight'
import { Icon } from '../icons'
import { BUILDING_NAMES, RESOURCE_ICONS, RESOURCE_NAMES } from '../names'
import type { TabId } from './Hud'
import { History, Meter, fmt, short, signed } from './primitives'
import { RESOURCES, flows } from './tabs'

// Stores along the top. Each one shows a small card on hover (or keyboard focus): where it comes from, where it goes,
// its recent course. The clock at the end tells the game time; one game day passes in one real hour. On touch screens,
// with no hover, a tap opens the card (and its button leads on to the tab), and a tap anywhere else closes it.

// Asked at each tap, so it follows the device (or a browser switched to a phone view after loading).
const touchOnly = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches

interface Props {
  kingdom: Kingdom
  now: number
  // When the lobby's season began; game days count from here.
  seasonStart: number
  history: Stock[]
  onOpen: (tab: TabId) => void
  // The lobby's prices, so the merchant's takings are counted as he is paid.
  market?: Market | null
  // The last chip of the bar on phones: the menu with the settings and the way back to the main menu.
  menu?: React.ReactNode
}

export function TopBar({ kingdom, now, seasonStart, history, onOpen, market, menu }: Props) {
  const flow = flows(kingdom, now, market)
  const { villagers, soldiers, cap } = population(kingdom, now)
  const people = villagers + soldiers
  const [open, setOpen] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open === null) return
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  // On touch screens a tap shows the card; elsewhere it goes straight to the tab.
  const tap = (key: string, tab: TabId) => () => (touchOnly() ? setOpen((o) => (o === key ? null : key)) : onOpen(tab))
  const go = (tab: TabId) => () => {
    setOpen(null)
    onOpen(tab)
  }
  return (
    <div ref={bar} className="topbar frame" role="group" aria-label="Kaynaklar">
      {RESOURCES.map((r) => {
        const net = flow[r].net
        return (
          <Chip
            key={r}
            label={`${RESOURCE_NAMES[r]} ${fmt(kingdom.stock[r])}, tur başına ${signed(net)}`}
            open={open === r}
            onClick={tap(r, 'store')}
            card={<ResourceCard resource={r} kingdom={kingdom} now={now} history={history} market={market} />}
            go={{ label: 'Depoya git', onClick: go('store') }}
          >
            <Icon name={RESOURCE_ICONS[r]} size={24} />
            <span className="res-value">
              <b>{short(kingdom.stock[r])}</b>
              {Math.abs(net) > 0.05 && <small className={net < 0 ? 'down' : 'up'}>{signed(net)}</small>}
            </span>
          </Chip>
        )
      })}
      <Chip
        label={`Nüfus ${people}, sınır ${cap}`}
        open={open === 'people'}
        onClick={tap('people', 'people')}
        card={<PeopleCard kingdom={kingdom} now={now} />}
        go={{ label: 'Halka git', onClick: go('people') }}
      >
        <Icon name="villager" size={24} />
        <span className="res-value">
          <b>{people}</b>
          <small className={people >= cap ? 'down' : ''}>/{cap}</small>
        </span>
      </Chip>
      <Clock now={now} seasonStart={seasonStart} nextRound={kingdom.nextProductionAt} open={open === 'clock'} onTap={() => setOpen((o) => (o === 'clock' ? null : 'clock'))} />
      {menu}
    </div>
  )
}

// A store button with its hover card below it (opened by a tap on touch screens, with a button on to the tab).
function Chip({
  label,
  open,
  onClick,
  card,
  go,
  children,
}: {
  label: string
  open: boolean
  onClick: () => void
  card: React.ReactNode
  go: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <div className={open ? 'res-wrap open' : 'res-wrap'}>
      <button className="res" onClick={onClick} aria-label={label} aria-expanded={touchOnly() ? open : undefined}>
        {children}
      </button>
      <div className="pop frame" role="tooltip">
        {card}
        {open && (
          <button className="btn small pop-go" onClick={go.onClick}>
            {go.label}
          </button>
        )}
      </div>
    </div>
  )
}

const num = (v: number) => v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', ',')

// Each building kind's share of what comes in, and what goes out where.
function ResourceCard({ resource: r, kingdom, now, history, market }: { resource: Resource; kingdom: Kingdom; now: number; history: Stock[]; market?: Market | null }) {
  const flow = flows(kingdom, now, market)
  const { made, used, net, wasted } = flow[r]
  const sources = new Map<BuildingKind, { count: number; units: number }>()
  for (const b of kingdom.buildings) {
    const out = buildingOutput(kingdom, b, now)
    if (!out || out.makes !== r) continue
    const entry = sources.get(b.kind) ?? { count: 0, units: 0 }
    sources.set(b.kind, { count: entry.count + 1, units: entry.units + out.units })
  }
  const lines: { name: string; value: number }[] = [...sources].map(([kind, s]) => ({ name: `${BUILDING_NAMES[kind]} ×${s.count}`, value: s.units }))
  const { villagers } = population(kingdom, now)
  if (r === 'gold') lines.push({ name: 'Vergi', value: flow.tax })
  if (r === 'gold' && kingdom.trade.good) lines.push({ name: 'Tüccar', value: flow.tradeGold })
  if (r === 'food' && villagers > 0) lines.push({ name: `Köylüler (${villagers})`, value: -villagers * balance.economy.foodPerVillager })
  if (r === kingdom.trade.good) lines.push({ name: 'Tüccar satıyor', value: -flow.sold })
  // The soldiers' pay and bread, the ships (the fishing fleets' catch, the crews' bread, their upkeep) and the towns.
  const round = roundOutcome(kingdom, now)
  const pay = ledger(kingdom, now)
  const idle = idleFactor(kingdom, now)
  const sends = townYield(kingdom.towns, now)
  const fish = r === 'food' ? fishCatch(kingdom) : 0
  const sailors = sailorsOf(kingdom)
  if (fish > 0.01) lines.push({ name: 'Balık avındaki filolar', value: fish })
  if (r === 'food' && pay.soldiersFood > 0.01) lines.push({ name: 'Askerler', value: -pay.soldiersFood })
  if (r === 'gold' && pay.soldiersGold > 0.01) lines.push({ name: 'Asker maaşı', value: -pay.soldiersGold })
  if (r === 'food' && round.navy.food > 0.01) lines.push({ name: `Denizciler (${sailors})`, value: -round.navy.food })
  if (r === 'gold' && round.navy.gold > 0.01) lines.push({ name: 'Gemi bakımı', value: -round.navy.gold })
  if ((sends[r] ?? 0) * idle > 0.01) lines.push({ name: 'Kasabalar', value: (sends[r] ?? 0) * idle })
  if (r === 'gold' && round.towns.cost > 0.01) lines.push({ name: 'Kasaba bakımı', value: -round.towns.cost })
  // Raw goods worked into weapons in the forges.
  const worked = flow.worked[r] ?? 0
  if (worked > 0.05) lines.push({ name: 'Atölyede işleniyor', value: -worked })
  const scale = Math.max(made, used, 0.01)
  const runsOut = net < -0.01 ? Math.floor(kingdom.stock[r] / -net) : null
  const series = history.map((s) => s[r])
  return (
    <>
      <header className="pop-head">
        <Icon name={RESOURCE_ICONS[r]} size={24} />
        <b>{RESOURCE_NAMES[r]}</b>
        <strong className={kingdom.stock[r] >= (r === 'gold' ? goldCap(kingdom, now) : storageCap(kingdom, now)) ? 'down' : undefined}>
          {fmt(kingdom.stock[r])}
          <small> / {fmt(r === 'gold' ? goldCap(kingdom, now) : storageCap(kingdom, now))}</small>
        </strong>
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
        ) : wasted > 0.05 ? (
          <span className="down">
            <Icon name="warn" size={8} /> {r === 'gold' ? 'Hazine' : 'Depo'} dolu: tur başına ~{num(wasted)} boşa gidiyor
          </span>
        ) : (
          <span>Net {signed(net)} / tur ({balance.economy.productionSeconds} sn)</span>
        )}
      </p>
    </>
  )
}

function PeopleCard({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const { villagers, jobs, efficiency, cap, soldiers, sailors, housing, sick, healthy } = population(kingdom, now)
  const homes = kingdom.buildings.filter((b) => b.doneAt <= now && (BUILDINGS[b.kind].villagers ?? 0) > 0).length
  // How fast the people grow into their room (CLAUDE.md §5.2).
  const grow = growthTerms(kingdom, now)
  const fill = timeToFill(kingdom, now)
  const most = Math.max(villagers, jobs, 1)
  // The builders: one per building site that may run at once (CLAUDE.md §5.3).
  const slots = maxConstructions(kingdom, now)
  const busy = constructing(kingdom, now).length
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
          <span>Büyüme</span>
          <b className={grow.perRound > 0.001 ? 'up' : grow.perRound < -0.001 ? 'down' : undefined}>
            {grow.perRound >= 0 ? '+' : '−'}
            {num(Math.abs(grow.perRound * (3600 / balance.economy.productionSeconds)))} / saat
          </b>
        </li>
        <li>
          <span>Yerleşim</span>
          <b>
            {Math.round(grow.people)} / {grow.room}
            {fill !== null && fill > 0 && ` · dolmaya ${fill >= 3_600_000 ? `${Math.floor(fill / 3_600_000)} sa ${Math.round((fill % 3_600_000) / 60_000)} dk` : `${Math.ceil(fill / 60_000)} dk`}`}
          </b>
        </li>
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
        {sailors > 0 && (
          <li>
            <span>Denizci (yerden düşer)</span>
            <b>{sailors}</b>
          </li>
        )}
        {sick >= 0.5 && (
          <li>
            <span>Hasta</span>
            <b className="down">{Math.round(sick)}</b>
          </li>
        )}
        <li>
          <span>Barınak (ev, saray)</span>
          <b>
            {homes} · {housing} kişilik
          </b>
        </li>
        <li>
          <span>İnşaat ustası</span>
          <b>
            {slots} · {busy > 0 ? `${busy} çalışıyor` : 'boşta'}
          </b>
        </li>
        <li>
          <span>Üretim verimi</span>
          <b className={efficiency < 1 ? 'down' : 'up'}>%{Math.round(efficiency * 100)}</b>
        </li>
        <li>
          <span>Boşta köylü</span>
          <b>{Math.max(0, Math.floor(healthy) - jobs)}</b>
        </li>
      </ul>
    </>
  )
}

// Game date and time, with a card showing the day as a 24-hour strip.
function Clock({ now, seasonStart, nextRound, open, onTap }: { now: number; seasonStart: number; nextRound?: number; open: boolean; onTap: () => void }) {
  const t = gameTime(now, seasonStart)
  const night = isNight(t.hour)
  const time = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`
  const phase = PHASE_NAMES[dayPhase(t.hour)]
  return (
    <div className={open ? 'res-wrap open' : 'res-wrap'}>
      {/* A button, so a tap reaches it on every phone (iOS ignores taps on plain elements). */}
      <button
        className="res clock"
        aria-label={`${t.day}. gün, saat ${time}, ${phase}`}
        aria-expanded={touchOnly() ? open : undefined}
        onClick={() => touchOnly() && onTap()}
      >
        <Icon name={night ? 'moon' : 'sun'} size={24} />
        <span className="res-value">
          <b>{time}</b>
          <small>{t.day}. gün</small>
        </span>
      </button>
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
          {nextRound !== undefined && (
            <li>
              <span>Sonraki üretim turu</span>
              <b>{Math.max(0, Math.ceil((nextRound - now) / 1000))} sn</b>
            </li>
          )}
        </ul>
        <Meter value={t.day / balance.time.seasonGameDays} label="Sezon ilerlemesi" segments={16} />
        <p className="pop-foot">
          Oyunda 1 gün = gerçekte 1 saat. Çubuktaki her kare 1 oyun saatidir (gerçekte ortalama {(balance.time.gameDayMs / 24 / 60000).toString().replace('.', ',')} dk): gece daha hızlı, şafak ve gün batımı daha yavaş geçer.
          <br />
          <b>Tur</b>, her {balance.economy.productionSeconds} saniyede (oyunda {Math.round((balance.economy.productionSeconds * 1000 * 24 * 60) / balance.time.gameDayMs)} dk) bir işleyen üretim turudur: binalar üretir, halk yer, vergi ve maaşlar ödenir. Bir oyun saatinde ortalama {Math.round(balance.time.gameDayMs / 24 / (balance.economy.productionSeconds * 1000))} tur geçer.
        </p>
      </div>
    </div>
  )
}
