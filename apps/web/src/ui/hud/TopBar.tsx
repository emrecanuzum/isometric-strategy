import { BUILDINGS, balance, buildingOutput, calendarAt, constructing, maxConstructions, fishCatch, gameTime, goldCap, growthTerms, idleFactor, ledger, population, timeToFill, roundOutcome, sailorsOf, seasonEffect, seasonOf, seasonFactor, storageCap, townYield } from '@game/shared'
import type { BuildingKind, Kingdom, Market, Resource, Stock } from '@game/shared'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { PHASE_NAMES, dayPhase, isNight } from '../../game/daylight'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import { BUILDING_NAMES, RESOURCE_ICONS, RESOURCE_NAMES, SEASON_NAMES, dateText } from '../names'
import type { TabId } from './Hud'
import { History, Meter, fmt, short, signed, times } from './primitives'
import { RESOURCES, flows } from './tabs'

// Stores along the top. Each one shows a small card on hover (or keyboard focus): where it comes from, where it goes,
// its recent course. The clock at the end tells the game time and the date; one game day, which is also one calendar
// year, passes in one real hour. On touch screens,
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
  const { villagers, soldiers, sailors, cap } = population(kingdom, now)
  const people = villagers + soldiers + sailors
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
    <div ref={bar} className="topbar frame" role="group" aria-label={L('Kaynaklar', 'Resources')}>
      {RESOURCES.map((r) => {
        const net = flow[r].net
        return (
          <Chip
            key={r}
            label={L(`${RESOURCE_NAMES[r]} ${fmt(kingdom.stock[r])}, tur başına ${signed(net)}`, `${RESOURCE_NAMES[r]} ${fmt(kingdom.stock[r])}, ${signed(net)} per round`)}
            open={open === r}
            onClick={tap(r, 'store')}
            card={<ResourceCard resource={r} kingdom={kingdom} now={now} history={history} market={market} />}
            go={{ label: L('Depoya git', 'Go to storehouse'), onClick: go('store') }}
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
        label={L(`Nüfus ${people}, sınır ${cap}`, `Population ${people}, limit ${cap}`)}
        open={open === 'people'}
        onClick={tap('people', 'people')}
        card={<PeopleCard kingdom={kingdom} now={now} />}
        go={{ label: L('Halka git', 'Go to people'), onClick: go('people') }}
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

const num = (v: number) => v.toFixed(Math.abs(v) < 10 ? 1 : 0).replace('.', L(',', '.'))

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
  if (r === 'gold') lines.push({ name: L('Vergi', 'Tax'), value: flow.tax })
  if (r === 'gold' && kingdom.trade.good) lines.push({ name: L('Tüccar', 'Merchant'), value: flow.tradeGold })
  if (r === 'food' && villagers > 0) lines.push({ name: L(`Köylüler (${villagers})`, `Villagers (${villagers})`), value: -villagers * balance.economy.foodPerVillager })
  if (r === kingdom.trade.good) lines.push({ name: L('Tüccar satıyor', 'Merchant selling'), value: -flow.sold })
  // The soldiers' pay and bread, the ships (the fishing fleets' catch, the crews' bread, their upkeep) and the towns.
  const round = roundOutcome(kingdom, now)
  const pay = ledger(kingdom, now)
  const idle = idleFactor(kingdom, now)
  const sends = townYield(kingdom.towns, now)
  const fish = r === 'food' ? fishCatch(kingdom) : 0
  const sailors = sailorsOf(kingdom)
  if (fish > 0.01) lines.push({ name: L('Balık avındaki filolar', 'Fishing fleets'), value: fish })
  if (r === 'food' && pay.soldiersFood > 0.01) lines.push({ name: L('Askerler', 'Soldiers'), value: -pay.soldiersFood })
  if (r === 'gold' && pay.soldiersGold > 0.01) lines.push({ name: L('Asker maaşı', 'Soldiers\' pay'), value: -pay.soldiersGold })
  if (r === 'food' && round.navy.food > 0.01) lines.push({ name: L(`Denizciler (${sailors})`, `Sailors (${sailors})`), value: -round.navy.food })
  if (r === 'gold' && round.navy.gold > 0.01) lines.push({ name: L('Gemi bakımı', 'Ship upkeep'), value: -round.navy.gold })
  if ((sends[r] ?? 0) * idle > 0.01) lines.push({ name: L('Kasabalar', 'Towns'), value: (sends[r] ?? 0) * idle })
  if (r === 'gold' && round.towns.cost > 0.01) lines.push({ name: L('Kasaba bakımı', 'Town upkeep'), value: -round.towns.cost })
  // Raw goods worked into weapons in the forges.
  const worked = flow.worked[r] ?? 0
  if (worked > 0.05) lines.push({ name: L('Atölyede işleniyor', 'Used by the forges'), value: -worked })
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
      <div className="flowbars" aria-label={L('Tur başına gelen ve giden', 'In and out per round')}>
        <span>{L('Gelen', 'In')}</span>
        <i className="up" style={{ width: `${(made / scale) * 100}%` }} />
        <small className="up">{signed(made)}</small>
        <span>{L('Giden', 'Out')}</span>
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
      {r === 'food' && seasonOf(kingdom, now) && (
        <ul className="pop-lines">
          <li>
            <span>
              {L('Mevsim', 'Season')}: {SEASON_NAMES[seasonOf(kingdom, now)!]} {L('(tarla, iskele)', '(farms, dock)')}
            </span>
            <b className={seasonFactor(kingdom, now, 'food') < 1 ? 'down' : 'up'}>{times(seasonFactor(kingdom, now, 'food'))}</b>
          </li>
        </ul>
      )}
      {series.length > 1 && <History values={series} label={L(`Son ${series.length} tur`, `Last ${series.length} rounds`)} />}
      <p className="pop-foot">
        {runsOut !== null ? (
          <span className="down">
            <Icon name="warn" size={8} /> {runsOut < 1 ? L('Tükendi: ambar boş', 'Run out: the storehouse is empty of it') : L(`~${runsOut} tur sonra tükenir`, `Runs out in ~${runsOut} rounds`)}
          </span>
        ) : wasted > 0.05 ? (
          <span className="down">
            <Icon name="warn" size={8} /> {L(`${r === 'gold' ? 'Hazine' : 'Depo'} dolu: tur başına ~${num(wasted)} boşa gidiyor`, `${r === 'gold' ? 'Treasury' : 'Storehouse'} full: ~${num(wasted)} wasted per round`)}
          </span>
        ) : (
          <span>{L(`Net ${signed(net)} / tur (${balance.economy.productionSeconds} sn)`, `Net ${signed(net)} / round (${balance.economy.productionSeconds} s)`)}</span>
        )}
      </p>
    </>
  )
}

function PeopleCard({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const { villagers, jobs, efficiency, cap, soldiers, sailors, housing, sick, healthy } = population(kingdom, now)
  const homes = kingdom.buildings.filter((b) => b.doneAt <= now && (BUILDINGS[b.kind].villagers ?? 0) > 0).length
  // The beds the houses and the palace give, as far as the palace's limit lets them be used.
  const shelter = Math.min(housing, cap)
  // How fast the people grow into their room (CLAUDE.md §5.2).
  const grow = growthTerms(kingdom, now)
  const fill = timeToFill(kingdom, now)
  const most = Math.max(villagers, jobs, 1)
  // The builders: one per building site that may run at once (CLAUDE.md §5.3).
  const slots = maxConstructions(kingdom, now)
  const busy = constructing(kingdom, now).filter((b) => b.kind !== 'road').length
  return (
    <>
      <header className="pop-head">
        <Icon name="people" size={24} />
        <b>{L('Halk', 'People')}</b>
        <strong>{villagers}</strong>
      </header>
      <div className="flowbars">
        <span>{L('Köylü', 'Villagers')}</span>
        <i className="up" style={{ width: `${(villagers / most) * 100}%` }} />
        <small>{villagers}</small>
        <span>{L('İş', 'Jobs')}</span>
        <i style={{ width: `${(jobs / most) * 100}%` }} />
        <small>{jobs}</small>
      </div>
      <ul className="pop-lines">
        <li>
          <span>{L('Büyüme', 'Growth')}</span>
          <b className={grow.perRound > 0.001 ? 'up' : grow.perRound < -0.001 ? 'down' : undefined}>
            {grow.perRound >= 0 ? '+' : '−'}
            {num(Math.abs(grow.perRound * (3600 / balance.economy.productionSeconds)))} {L('/ saat', '/ hour')}
          </b>
        </li>
        <li>
          <span>{L('Yerleşim', 'Settled')}</span>
          <b>
            {Math.round(grow.people)} / {grow.room}
            {fill !== null && fill > 0 && L(` · dolmaya ${fill >= 3_600_000 ? `${Math.floor(fill / 3_600_000)} sa ${Math.round((fill % 3_600_000) / 60_000)} dk` : `${Math.ceil(fill / 60_000)} dk`}`, ` · full in ${fill >= 3_600_000 ? `${Math.floor(fill / 3_600_000)} h ${Math.round((fill % 3_600_000) / 60_000)} min` : `${Math.ceil(fill / 60_000)} min`}`)}
          </b>
        </li>
        <li>
          <span>{L('Nüfus / sınır', 'Population / limit')}</span>
          <b className={villagers + soldiers + sailors >= cap ? 'down' : undefined}>
            {villagers + soldiers + sailors} / {cap}
          </b>
        </li>
        <li>
          <span>{L('Barınak', 'Housing')}</span>
          <b>
            {L(`${shelter} yer · ${homes} yapı`, `${shelter} beds · ${homes} buildings`)}
          </b>
        </li>
        {soldiers > 0 && (
          <li>
            <span>{L('Asker', 'Soldiers')}</span>
            <b>{soldiers}</b>
          </li>
        )}
        {sailors > 0 && (
          <li>
            <span>{L('Denizci', 'Sailors')}</span>
            <b>{sailors}</b>
          </li>
        )}
        {soldiers + sailors > 0 && (
          <li className="pop-note">
            {L(
              `Askerler${sailors > 0 ? ' ve denizciler' : ''} de barınakta yatar: ${shelter} yerden köylülere ${grow.room} kalır.`,
              `Soldiers${sailors > 0 ? ' and sailors' : ''} sleep in the housing too: of ${shelter} beds, ${grow.room} are left for villagers.`,
            )}
          </li>
        )}
        {housing > cap && (
          <li className="pop-note">
            {L(
              `Evler ${housing} kişilik ama sarayın nüfus sınırı ${cap}: fazlası boş kalır.`,
              `The houses sleep ${housing}, but the palace's population limit is ${cap}: the rest stand empty.`,
            )}
          </li>
        )}
        {sick >= 0.5 && (
          <li>
            <span>{L('Hasta', 'Sick')}</span>
            <b className="down">{Math.round(sick)}</b>
          </li>
        )}
        <li>
          <span>{L('İnşaat ustası', 'Builders')}</span>
          <b>
            {slots} · {busy > 0 ? L(`${busy} çalışıyor`, `${busy} at work`) : L('boşta', 'idle')}
          </b>
        </li>
        <li>
          <span>{L('Üretim verimi', 'Work efficiency')}</span>
          <b className={efficiency < 1 ? 'down' : 'up'}>{L(`%${Math.round(efficiency * 100)}`, `${Math.round(efficiency * 100)}%`)}</b>
        </li>
        <li>
          <span>{L('Boşta köylü', 'Idle villagers')}</span>
          <b>{Math.max(0, Math.floor(healthy) - jobs)}</b>
        </li>
      </ul>
    </>
  )
}

// Game date and time, with a card showing the day as a 24-hour strip.
function Clock({ now, seasonStart, nextRound, open, onTap }: { now: number; seasonStart: number; nextRound?: number; open: boolean; onTap: () => void }) {
  const t = gameTime(now, seasonStart)
  const c = calendarAt(now, seasonStart)
  const harvest = seasonEffect('food', c.season)
  const sickness = seasonEffect('sickness', c.season)
  const night = isNight(t.hour)
  const time = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`
  const phase = PHASE_NAMES[dayPhase(t.hour)]
  return (
    <div className={open ? 'res-wrap open' : 'res-wrap'}>
      {/* A button, so a tap reaches it on every phone (iOS ignores taps on plain elements). */}
      <button
        className="res clock"
        aria-label={L(`${dateText(c)}, ${SEASON_NAMES[c.season]}, saat ${time}, ${phase}`, `${dateText(c)}, ${SEASON_NAMES[c.season]}, ${time}, ${phase}`)}
        aria-expanded={touchOnly() ? open : undefined}
        onClick={() => touchOnly() && onTap()}
      >
        <Icon name={night ? 'moon' : 'sun'} size={24} />
        <span className="res-value">
          <b>{time}</b>
          <small>{dateText(c, 'short')}</small>
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
            <span>{L('Tarih', 'Date')}</span>
            <b>{dateText(c)}</b>
          </li>
          <li>
            <span>{L('Mevsim', 'Season')}</span>
            <b title={L(`${Math.max(1, Math.ceil((c.seasonEndsAt - now) / 60000))} dk sonra ${SEASON_NAMES[c.nextSeason].toLocaleLowerCase(locale())}`, `${SEASON_NAMES[c.nextSeason]} in ${Math.max(1, Math.ceil((c.seasonEndsAt - now) / 60000))} min`)}>
              {SEASON_NAMES[c.season]} · {L(`${Math.max(1, Math.ceil((c.seasonEndsAt - now) / 60000))} dk kaldı`, `${Math.max(1, Math.ceil((c.seasonEndsAt - now) / 60000))} min left`)}
            </b>
          </li>
          <li>
            <span>{L('Hasat (tarla, iskele)', 'Harvest (farms, dock)')}</span>
            <b className={harvest < 0.995 ? 'down' : 'up'}>{times(harvest)}</b>
          </li>
          <li>
            <span>{L('Hastalığın yayılması', 'Spread of sickness')}</span>
            <b className={sickness > 1.005 ? 'down' : 'up'}>{times(sickness)}</b>
          </li>
          <li>
            <span>{L('Sezon', 'Season')}</span>
            <b>
              {t.day} / {balance.time.seasonGameDays} {L('yıl', 'years')}
            </b>
          </li>
          <li>
            <span>{L('Yeni yıl', 'New year')}</span>
            <b>{L(`${Math.ceil(t.untilNextDay / 60000)} dk sonra`, `in ${Math.ceil(t.untilNextDay / 60000)} min`)}</b>
          </li>
          {nextRound !== undefined && (
            <li>
              <span>{L('Sonraki üretim turu', 'Next production round')}</span>
              <b>{Math.max(0, Math.ceil((nextRound - now) / 1000))} {L('sn', 's')}</b>
            </li>
          )}
        </ul>
        <Meter value={t.day / balance.time.seasonGameDays} label={L('Sezon ilerlemesi', 'Season progress')} segments={16} />
        <p className="pop-foot">
          {L(
            `Oyunda 1 gün = 1 yıl = gerçekte 1 saat: yıl gece yarısı 1 Ocak'ta başlar, her ay ~${Math.round(balance.time.gameDayMs / 12 / 60000)} dk, her mevsim ~${Math.round(balance.time.gameDayMs / 4 / 60000)} dk sürer (kış gece yarısı, ilkbahar şafak, yaz öğle, sonbahar akşamüstü). Hanedan da bu yıllarla yaşlanır. Çubuktaki her kare 1 oyun saatidir (gerçekte ortalama ${(balance.time.gameDayMs / 24 / 60000).toString().replace('.', ',')} dk): gece daha hızlı, şafak ve gün batımı daha yavaş geçer.`,
            `In the game, 1 day = 1 year = 1 real hour: the year begins at midnight on 1 January, each month lasts ~${Math.round(balance.time.gameDayMs / 12 / 60000)} min and each season ~${Math.round(balance.time.gameDayMs / 4 / 60000)} min (winter at midnight, spring at dawn, summer at noon, autumn in the late afternoon). The dynasty ages by these years too. Each square of the strip is 1 game hour (on average ${(balance.time.gameDayMs / 24 / 60000).toString()} min in reality): night passes faster, dawn and dusk slower.`,
          )}
          <br />
          {L(
            `Tur, her ${balance.economy.productionSeconds} saniyede (oyunda ${Math.round((balance.economy.productionSeconds * 1000 * 24 * 60) / balance.time.gameDayMs)} dk) bir işleyen üretim turudur: binalar üretir, halk yer, vergi ve maaşlar ödenir. Bir oyun saatinde ortalama ${Math.round(balance.time.gameDayMs / 24 / (balance.economy.productionSeconds * 1000))} tur geçer.`,
            `A round is the production round run every ${balance.economy.productionSeconds} seconds (${Math.round((balance.economy.productionSeconds * 1000 * 24 * 60) / balance.time.gameDayMs)} min in the game): buildings produce, the people eat, taxes and wages are paid. On average ${Math.round(balance.time.gameDayMs / 24 / (balance.economy.productionSeconds * 1000))} rounds pass in a game hour.`,
          )}
        </p>
      </div>
    </div>
  )
}
