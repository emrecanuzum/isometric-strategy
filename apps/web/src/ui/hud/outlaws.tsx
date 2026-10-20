import {
  armyAt,
  balance,
  bandAt,
  bandRaid,
  bandLoot,
  bandsOf,
  boatAt,
  boatLoot,
  boatMight,
  boatsOf,
  chaseBoatError,
  fleetAt,
  havenGuards,
  havenLoot,
  havenPop,
  havenStrength,
  havensOf,
  leadsArmy,
  missionError,
  sailError,
  shipyardLevel,
  navyOf,
  outlawEffects,
  outlawUp,
  roadHeld,
  seaHeld,
  shipMight,
  territoryRect,
  territoryStage,
} from '@game/shared'
import type { Band, Boat, ChaseError, Clan, Haven, Kingdom, OutlawRow, Point, World } from '@game/shared'
import { caveSpots, clanBandsUntil, clanGarrison, clanHoard, clansOf, hash, trailOf, winsToFind } from '@game/shared'
import { useState } from 'react'
import { Icon } from '../icons'
import { L, locale, localName } from '../../lib/i18n'
import { RESOURCE_NAMES } from '../names'
import type { Online } from './online'
import { Section, Stat, fmt } from './primitives'
import { ShipRow, WHY as NAVY_WHY } from './navy'
import { trailHint } from '../../game/caveHints'

// Bandits on the roads and pirates on the water (CLAUDE.md §7.9, §8.5): the sheet that opens when one is clicked on
// the map (what it is, what it holds of the player's trade, what beating it brings, and "Takip et": send an army or a
// fleet after it), and the panel lines that say how much they cost the player.

const B = balance.outlaws
const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString(locale())
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
const centre = (b: { x: number; y: number; size: number }): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })

// 'clan': a clan by its slot (its cave, when found); 'cave': a cave of the mountains by its number (CLAUDE.md §7.9.1).
export type OutlawPick = { kind: 'band' | 'boat' | 'clan' | 'cave' | 'haven'; idx: number }

// The lobby's bands and boats as the layer has them.
export const lobbyBands = (world: World, rows: OutlawRow[]) => bandsOf(world, world.seed, rows)
export const lobbyBoats = (world: World, rows: OutlawRow[]) => boatsOf(world, world.seed, rows)

// The bandits' cut and the pirates' toll on the player, for the trade, navy, dock and people panels.
export function OutlawToll({ kingdom, sea = false, road = false, mood = false }: { kingdom: Kingdom; sea?: boolean; road?: boolean; mood?: boolean }) {
  const e = outlawEffects(kingdom)
  const o = kingdom.outlaws
  const lines: React.ReactNode[] = []
  if (road)
    lines.push(
      <Stat
        key="road"
        label={L('Yağmacıların tuttuğu yol', 'Road held by bandits')}
        value={pct(e.road)}
        tone={e.road > 0 ? 'down' : undefined}
        note={e.road > 0 ? L(`ticaret noktanın ${B.road.radiusTiles} karo çevresindeki yolun ${pct(e.road)}'i ${o?.bands ?? 0} çetenin elinde: tüccarın altınının ${pct(e.merchantCut)}'ini kesiyorlar`, `${o?.bands ?? 0} band${(o?.bands ?? 0) === 1 ? '' : 's'} hold ${pct(e.road)} of the road within ${B.road.radiusTiles} tiles of your trading post: they cut ${pct(e.merchantCut)} of your merchant's gold`) : L('ticaret noktanın çevresindeki yollar temiz', 'the roads round your trading post are clear')}
      />,
    )
  if (sea)
    lines.push(
      <Stat
        key="sea"
        label={L('Korsanların ticarete etkisi', 'Pirates\' effect on trade')}
        value={pct(e.sea)}
        tone={e.sea > 0 ? 'down' : undefined}
        note={e.sea > 0 ? L(`iskelenin ${B.boats.reachTiles} karo yakınında ${o?.boats ?? 0} korsan teknesi dolaşıyor: deniz ticaretine saldırı olasılığı ×${dec(e.pirateFactor)}, iskelenin ve balıkçı filolarının avı −%${Math.round((1 - e.fishFactor) * 100)}`, `${o?.boats ?? 0} pirate boat${(o?.boats ?? 0) === 1 ? '' : 's'} prowl within ${B.boats.reachTiles} tiles of your dock: chance of attack on sea trade ×${dec(e.pirateFactor)}, the catch of your dock and fishing fleets −${Math.round((1 - e.fishFactor) * 100)}%`) : L('iskelenin önündeki sular temiz', 'the waters off your dock are clear')}
      />,
    )
  if (mood && e.happiness < 0) lines.push(<Stat key="mood" label={L('Yağmacılar ve korsanlar', 'Bandits and pirates')} value={`${Math.round(e.happiness)}`} tone="down" note={L(`halk yollarda ve sularda tedirgin (en fazla −${B.happinessCap})`, `the people are uneasy on the roads and waters (at most −${B.happinessCap})`)} />)
  return <>{lines}</>
}

// The sheet of a band or a boat clicked on the map.
export function OutlawSheet({ world, pick, online, kingdom, now, onShow, onClose }: {
  world: World
  pick: OutlawPick
  online: Online
  kingdom: Kingdom
  now: number
  onShow(at: Point): void
  onClose(): void
}) {
  if (pick.kind === 'clan' || pick.kind === 'cave') return <CaveSheet key={`${pick.kind}${pick.idx}`} world={world} pick={pick} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} />
  if (pick.kind === 'haven') {
    const haven = havensOf(world, world.seed, online.outlaws).find((h) => h.idx === pick.idx)
    return haven ? <HavenSheet key={`h${haven.idx}`} world={world} haven={haven} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
  }
  if (pick.kind === 'band') {
    const band = lobbyBands(world, online.outlaws).find((b) => b.idx === pick.idx)
    return band ? <BandSheet key={`b${band.idx}`} world={world} band={band} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
  }
  const boat = lobbyBoats(world, online.outlaws).find((b) => b.idx === pick.idx)
  return boat ? <BoatSheet key={`s${boat.idx}`} world={world} boat={boat} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
}

function Head({ icon, title, sub, onShow, onClose }: { icon: 'swords' | 'ship' | 'pin' | 'anchor'; title: string; sub: string; onShow(): void; onClose(): void }) {
  return (
    <header className="sheet-head">
      <Icon name={icon} size={32} />
      <div>
        <h2 id="outlaw-title">{title}</h2>
        <small>{sub}</small>
      </div>
      <button className="btn icon-only" onClick={onShow} aria-label={L('Haritada göster', 'Show on the map')} title={L('Haritada göster', 'Show on the map')}>
        <Icon name="pin" size={16} />
      </button>
      <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
        <Icon name="close" size={16} />
      </button>
    </header>
  )
}

const lootText = (loot: Record<string, number>) =>
  Object.entries(loot)
    .filter(([, v]) => v > 0)
    .map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? g}`)
    .join(', ')

function BandSheet({ world, band, online, kingdom, now, onShow, onClose }: { world: World; band: Band; online: Online; kingdom: Kingdom; now: number; onShow(at: Point): void; onClose(): void }) {
  const up = outlawUp(band, now)
  const fighting = band.battle !== null ? online.battles.find((b) => b.id === band.battle && !b.resolved) : undefined
  const here = fighting ? { x: fighting.x, y: fighting.y } : bandAt(band, now)
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost' && b.doneAt <= now)
  const mine = post ? roadHeld(world, world.seed, [band], centre(post), now) : null
  const rough = `${Math.max(1, band.soldiers - 2)}–${band.soldiers + 2}`
  // Out on a raid (CLAUDE.md §7.9): whose trade post it is going for, lurking by or coming back from.
  const raid = up && !fighting ? bandRaid(world, band, now) : null
  const mineRaid = raid?.target === online.me
  const raidName = raid && !mineRaid ? (online.kingdoms.find((k) => k.id === raid.target)?.name ?? L('bir lord', 'a lord')) : ''
  const raidText = !raid
    ? ''
    : raid.leg === 'go'
      ? mineRaid
        ? L('Yoldan ayrıldı, senin ticaret noktana baskına iniyor!', 'It has left the road and is coming down on your trading post!')
        : L(`Yoldan ayrıldı, ${raidName} ticaret noktasına baskına iniyor.`, `It has left the road to raid ${raidName}'s trading post.`)
      : raid.leg === 'lurk'
        ? mineRaid
          ? L('Ticaret noktanın yakınında pusuda; tüccarın yolu ondan sakınıyor.', 'Lying in wait near your trading post; your merchant gives it a wide berth.')
          : L(`${raidName} ticaret noktasının yakınında pusuda bekliyor.`, `Lying in wait near ${raidName}'s trading post.`)
        : mineRaid
          ? L('Ticaret noktandan çekiliyor, kendi yoluna dönüyor.', 'Pulling back from your trading post to its own road.')
          : L(`${raidName} ticaret noktasından dönüyor.`, `Coming back from ${raidName}'s trading post.`)
  const armies = online.armies.filter((a) => a.kingdom_id === online.me)
  const land = territoryRect(kingdom.site, territoryStage(kingdom, now))
  const inside = (p: Point) => p.x >= land.x && p.y >= land.y && p.x < land.x + land.size && p.y < land.y + land.size
  const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
  // Which army goes: always picked by the player, even when there is only one.
  const [picked, setPicked] = useState<number | null>(null)
  const pick = armies.find((a) => a.id === picked)
  const far = (a: (typeof armies)[number]) => {
    const at = armyAt(a, now)
    return Math.round(Math.hypot(at.x - here.x, at.y - here.y))
  }
  const envoy = (a: (typeof armies)[number]) => !inside(armyAt(a, now)) && !(a.contact_until && Date.parse(a.contact_until) > now) && !leadsArmy(kingdom, a.led_by, now)
  // After this band already, or the order to go after it still on its way with the envoy.
  const waitingOf = (a: (typeof armies)[number]) => online.orders.find((o) => o.army_id === a.id && !o.applied_at && o.payload.kind === 'chase' && o.payload.band === band.idx && Date.parse(o.effective_at) > now)
  const chasing = (a: (typeof armies)[number]) => (a.goal.kind === 'chase' && a.goal.band === band.idx) || !!waitingOf(a)
  const chasers = armies.flatMap((a, i) => (chasing(a) ? [{ a, n: i + 1, waiting: waitingOf(a) }] : []))
  // Giving up the chase: the army halts where it stands (by envoy outside its lands).
  const halt = (a: (typeof armies)[number]) => {
    const at = armyAt(a, now)
    void online.act({ type: 'army', army: a.id, order: { kind: 'move', x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 } })
  }
  return (
    <section className="sheet frame" aria-labelledby="outlaw-title">
      <Head icon="swords" title={band.name} sub={up ? L(`Yağmacılar · yaklaşık ${rough} kişi`, `Bandits · about ${rough} strong`) : L('Dağıtıldı', 'Scattered')} onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title={L('Ne yapıyor', 'What it is doing')} icon="scroll">
          <p className="hint">
            {!up
              ? L(`Çete dağıtıldı; ${minutes((band.downUntil ?? now) - now)} dakika sonra yeniden toplanıp yolu tutar.`, `The band is scattered; in ${minutes((band.downUntil ?? now) - now)} min it regroups and takes the road again.`)
              : fighting
                ? L('Şu an bir orduyla çarpışıyor.', 'Fighting an army right now.')
                : L(
                    `${raidText ? raidText + ' ' : ''}Ticaret yolunun yaklaşık ${Math.round(band.length)} karoluk bir kesimini tutuyor, gelip geçen kervanları soyuyor; ara sıra yoldan ayrılıp menzilindeki bir lordun ticaret noktasına baskına iner. Ordulardan yavaş yürür (saniyede ${dec(B.bands.speedTilesPerSecond)} karo, baskında ${dec(B.bands.raid.speedTilesPerSecond)}; ordular ${dec(balance.military.speedTilesPerSecond)}): yakalamak zor değil.`,
                    `${raidText ? raidText + ' ' : ''}It holds a stretch of about ${Math.round(band.length)} tiles of the trade road and robs the caravans passing by; now and then it leaves the road to raid the trading post of a lord in reach. It marches slower than armies (${dec(B.bands.speedTilesPerSecond)} tiles a second, ${dec(B.bands.raid.speedTilesPerSecond)} on a raid; armies ${dec(balance.military.speedTilesPerSecond)}): not hard to catch.`,
                  )}
          </p>
          {up && <Stat label={L('Senin ticaretine etkisi', 'Effect on your trade')} value={mine ? pct(mine.share) : '—'} note={mine ? L(`ticaret noktanın çevresindeki yolu tutuşu ve yakınlığı (baskında artar)`, `how much of the road round your trading post it holds and how near it is (rises on a raid)`) : L('ticaret noktan yok', 'you have no trading post')} />}
          <Stat label={L('Yendiğinde ganimet', 'Plunder if beaten')} value={lootText(bandLoot(band.soldiers))} note={L('savaş malzemesi, altın ve yapı malzemesi; çete bir süre sonra biraz daha kalabalık geri gelir', 'war materials, gold and building materials; after a while the band comes back a little bigger')} />
        </Section>
        <ClanTrail world={world} slot={band.clan} online={online} kingdom={kingdom} now={now} />
        {up && (
          <Section title={L('Takip et', 'Chase')} icon="swords" aside={L(`${armies.length} ordu`, `${armies.length} arm${armies.length === 1 ? 'y' : 'ies'}`)}>
            <p className="hint">
              {L(
                `Hangi orduyla gideceğini seç, sonra "Takip et": ordu çetenin önünü keser, yakaladığı an savaş başlar. Hududun dışındaki orduya emir elçiyle gider (${delay} sn); peşindeki ordu çeteyi ${Math.round(B.bands.chase.maxSeconds / 60)} dakikada yakalayamazsa takibi bırakır. Yenilen ordu eve çekilir.`,
                `Choose which army goes, then "Chase": the army cuts the band off, and battle begins the moment it catches it. Orders to an army outside your borders go by envoy (${delay} s); if the army cannot catch the band within ${Math.round(B.bands.chase.maxSeconds / 60)} min it gives up. A beaten army falls back home.`,
              )}
            </p>
            {chasers.map(({ a, n, waiting }) => (
              <div key={a.id} className="chase-on">
                <Icon name="swords" size={16} />
                <span>
                  <b>{waiting ? L(`${n}. ordu yola çıkacak`, `Army ${n} will set out`) : L(`${n}. ordu peşinde`, `Army ${n} in pursuit`)}</b>
                  <small className="hint">{waiting ? L(` · elçi ${Math.max(1, Math.ceil((Date.parse(waiting.effective_at) - now) / 1000))} sn'de ulaşır`, ` · the envoy arrives in ${Math.max(1, Math.ceil((Date.parse(waiting.effective_at) - now) / 1000))} s`) : L(` · ${far(a)} karo geride`, ` · ${far(a)} tiles behind`)}</small>
                </span>
                {!waiting && (
                  <button className="btn small" disabled={a.status === 'battle'} data-why={L('Ordu savaşta; emir alamaz', 'The army is in battle; it cannot take orders')} onClick={() => halt(a)}>
                    {L('Takibi bırak', 'Stop chasing')}
                  </button>
                )}
              </div>
            ))}
            {armies.length === 0 ? (
              <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison in the Army tab.')}</p>
            ) : (
              <>
                <div className="chase-picks" role="radiogroup" aria-label={L('Takip edecek ordu', 'Army to chase with')}>
                  {armies.map((a, i) => {
                    const busy = chasing(a) || a.status === 'battle'
                    const soldiers = a.soldiers ?? 0
                    return (
                      <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={busy} data-why={chasing(a) ? L('Bu ordu zaten peşinde', 'This army is already in pursuit') : L('Ordu savaşta', 'The army is in battle')} onClick={() => setPicked(a.id)}>
                        <b>
                          {L(`${i + 1}. ordu · ${fmt(soldiers)} asker`, `Army ${i + 1} · ${fmt(soldiers)} soldier${(soldiers) === 1 ? '' : 's'}`)}
                        </b>
                        <small>
                          {L(`${far(a)} karo uzakta`, `${far(a)} tiles away`)} · {envoy(a) ? L(`emir elçiyle (${delay} sn)`, `order by envoy (${delay} s)`) : L('emir hemen', 'order at once')}
                        </small>
                        <small className={soldiers >= band.soldiers + 2 ? 'up' : soldiers < band.soldiers - 2 ? 'down' : undefined}>
                          {L('güç', 'strength')} {fmt(soldiers)} / ~{rough}
                          {chasing(a) ? L(' · zaten peşinde', ' · already in pursuit') : a.status === 'battle' ? L(' · savaşta', ' · in battle') : ''}
                        </small>
                      </button>
                    )
                  })}
                </div>
                <button className="btn primary wide" disabled={!pick || chasing(pick) || pick.status === 'battle' || !!fighting} data-why={!pick ? L('Önce bir ordu seç', 'Choose an army first') : chasing(pick) ? L('Bu ordu zaten peşinde', 'This army is already in pursuit') : pick.status === 'battle' ? L('Ordu savaşta', 'The army is in battle') : L('Çeteyle çarpışma sürüyor', 'A clash with the band is under way')} onClick={() => pick && online.act({ type: 'army', army: pick.id, order: { kind: 'chase', band: band.idx } })}>
                  <Icon name="swords" size={16} /> {pick ? L(`${armies.indexOf(pick) + 1}. orduyla takip et`, `Chase with army ${armies.indexOf(pick) + 1}`) : L('Önce bir ordu seç', 'Choose an army first')}
                </button>
              </>
            )}
          </Section>
        )}
      </div>
    </section>
  )
}

const CHASE_ERRORS: Partial<Record<ChaseError, string>> = {
  away: L('görevde', 'on a mission'),
  warships: L('savaş gemisi yok', 'no warships'),
  route: L('su yolu yok', 'no waterway'),
  boat: L('tekne yok', 'no boat'),
  fleet: L('filo yok', 'no fleet'),
}

function BoatSheet({ world, boat, online, kingdom, now, onShow, onClose }: { world: World; boat: Boat; online: Online; kingdom: Kingdom; now: number; onShow(at: Point): void; onClose(): void }) {
  const up = outlawUp(boat, now)
  const here = boatAt(boat, now).at
  const dock = kingdom.buildings.find((b) => b.kind === 'dock' && b.doneAt <= now)
  const mine = dock ? seaHeld([boat], centre(dock), now, havenStrength(havensOf(world, world.seed, online.outlaws), now)) : null
  const fleets = navyOf(kingdom).fleets
  const might = boatMight(boat)
  // Which fleet goes: always picked by the player, even when there is only one.
  const [picked, setPicked] = useState<number | null>(null)
  const pick = fleets.find((f) => f.id === picked)
  const farOf = (f: (typeof fleets)[number]) => {
    const at = fleetAt(world, kingdom, f, now)
    return at ? Math.round(Math.hypot(at.x - here.x, at.y - here.y)) : null
  }
  return (
    <section className="sheet frame" aria-labelledby="outlaw-title">
      <Head icon="ship" title={boat.name} sub={up ? L(`Korsanlar · ${boat.ships} tekne · güç ${dec(might)}`, `Pirates · ${boat.ships} boat${boat.ships === 1 ? '' : 's'} · might ${dec(might)}`) : L('Batırıldı', 'Sunk')} onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title={L('Ne yapıyor', 'What it is doing')} icon="scroll">
          <p className="hint">
            {up
              ? L(`Kara yelkenli korsan tekneleri bu suları dolaşıyor; yakınındaki iskelelerin balığını ve deniz ticaretini bozuyor. Filolardan yavaştır (saniyede ${dec(B.boats.speedTilesPerSecond)} karo; filolar ${dec(1 / balance.navy.sail.secondsPerTile)}).`, `Black-sailed pirate boats prowl these waters, spoiling the fishing and sea trade of the docks nearby. They are slower than fleets (${dec(B.boats.speedTilesPerSecond)} tiles a second; fleets ${dec(1 / balance.navy.sail.secondsPerTile)}).`)
              : L(`Tekne batırıldı; ${minutes((boat.downUntil ?? now) - now)} dakika sonra yeni bir korsan teknesi bu sulara gelir.`, `The boat was sunk; in ${minutes((boat.downUntil ?? now) - now)} min a new pirate boat comes to these waters.`)}
          </p>
          {up && <Stat label={L('İskelene etkisi', 'Effect on your dock')} value={mine ? pct(mine.share) : '—'} note={mine ? (mine.share > 0 ? L('iskelenin önündeki sularda dolaşıyor', 'prowling the waters off your dock') : L('iskelenden uzakta dolaşıyor', 'prowling far from your dock')) : L('iskelen yok', 'you have no dock')} />}
          <Stat label={L('Batırınca', 'If sunk')} value={lootText(boatLoot(boat))} note={L('ödül altını ve ambarındaki mallar', 'reward gold and the goods in its hold')} />
        </Section>
        {up && (
          <Section title={L('Takip et', 'Chase')} icon="ship" aside={L(`${fleets.length} filo`, `${fleets.length} fleet${fleets.length === 1 ? '' : 's'}`)}>
            <p className="hint">
              {L(
                `Hangi filoyla gideceğini seç, sonra "Takip et": filo teknenin önünü keser, yakaladığı an deniz savaşı olur. Savaşta iki tarafın gücü gemilerinin toplam gücüdür (kadırga ${dec(balance.navy.ships.galley.might)}, koka ${dec(balance.navy.ships.cog.might)}, çektiri ${dec(balance.navy.ships.corsair.might)}); korsanlar çektiri gibidir: kokaları yener, kadırgalara yenilir. Filoda en az bir savaş gemisi olmalı.`,
                `Choose which fleet goes, then "Chase": the fleet cuts the boat off, and a sea battle begins the moment it catches it. In battle each side's might is the sum of its ships' (galley ${dec(balance.navy.ships.galley.might)}, cog ${dec(balance.navy.ships.cog.might)}, raider ${dec(balance.navy.ships.corsair.might)}); pirates fight like raiders: they beat cogs and lose to galleys. The fleet needs at least one warship.`,
              )}
            </p>
            {fleets.map((f, i) =>
              f.chase?.boat === boat.idx ? (
                <div key={f.id} className="chase-on">
                  <Icon name="ship" size={16} />
                  <span>
                    <b>{L(`${i + 1}. filo peşinde`, `Fleet ${i + 1} in pursuit`)}</b>
                    <small className="hint">{farOf(f) !== null && L(` · ${farOf(f)} karo geride`, ` · ${farOf(f)} tiles behind`)} · {L('emirler elçisiz, hemen', 'orders at once, no envoy')}</small>
                  </span>
                  <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'unchase', fleet: f.id })}>
                    {L('Takibi bırak', 'Stop chasing')}
                  </button>
                </div>
              ) : null,
            )}
            {fleets.length === 0 ? (
              <p className="hint">{L('Filon yok. Tersanede gemi yap, limandan filo çıkar.', 'You have no fleet. Build ships at the shipyard and form a fleet in the harbour.')}</p>
            ) : (
              <>
                <div className="chase-picks" role="radiogroup" aria-label={L('Takip edecek filo', 'Fleet to chase with')}>
                  {fleets.map((f, i) => {
                    const chasing = f.chase?.boat === boat.idx
                    const why = chasing ? null : chaseBoatError(world, kingdom, f.id, boat, now)
                    const mightF = shipMight(f.ships)
                    const far = farOf(f)
                    return (
                      <button key={f.id} role="radio" aria-checked={picked === f.id} className={picked === f.id ? 'chase-pick active' : 'chase-pick'} disabled={chasing || !!why} data-why={chasing ? L('Bu filo zaten peşinde', 'This fleet is already in pursuit') : why ? (CHASE_ERRORS[why] ?? L('Bu filo takip edemez', 'This fleet cannot give chase')) : undefined} onClick={() => setPicked(f.id)}>
                        <b>
                          {L(`${i + 1}. filo`, `Fleet ${i + 1}`)} <ShipRow ships={f.ships} />
                        </b>
                        <small>
                          {far !== null ? L(`${far} karo uzakta`, `${far} tiles away`) : L('yeri bilinmiyor', 'whereabouts unknown')} · {L('emir hemen', 'order at once')}
                        </small>
                        <small className={mightF > might ? 'up' : 'down'}>
                          {L('güç', 'might')} {dec(mightF)} / {dec(might)}
                          {chasing ? L(' · zaten peşinde', ' · already in pursuit') : why ? ` · ${CHASE_ERRORS[why] ?? L('olmaz', 'no')}` : ''}
                        </small>
                      </button>
                    )
                  })}
                </div>
                <button className="btn primary wide" disabled={!pick || pick.chase?.boat === boat.idx || !!chaseBoatError(world, kingdom, pick.id, boat, now)} data-why={!pick ? L('Önce bir filo seç', 'Choose a fleet first') : pick.chase?.boat === boat.idx ? L('Bu filo zaten peşinde', 'This fleet is already in pursuit') : (CHASE_ERRORS[chaseBoatError(world, kingdom, pick.id, boat, now) as ChaseError] ?? L('Bu filo takip edemez', 'This fleet cannot give chase'))} onClick={() => pick && online.act({ type: 'fleet', action: 'chase', fleet: pick.id, boat: boat.idx })}>
                  <Icon name="ship" size={16} /> {pick ? L(`${fleets.indexOf(pick) + 1}. filoyla takip et`, `Chase with fleet ${fleets.indexOf(pick) + 1}`) : L('Önce bir filo seç', 'Choose a fleet first')}
                </button>
              </>
            )}
          </Section>
        )}
      </div>
    </section>
  )
}

// A pirate haven (CLAUDE.md §8.5): its people and how they set the pirates' strength, who blockades it, and "Ablukaya
// al": a fleet picked by the player sails there, fights the haven's guard and holds it while the people dwindle.
function HavenSheet({ world, haven, online, kingdom, now, onShow, onClose }: { world: World; haven: Haven; online: Online; kingdom: Kingdom; now: number; onShow(at: Point): void; onClose(): void }) {
  const H = B.havens
  const pop = havenPop(haven, now)
  const all = havensOf(world, world.seed, online.outlaws)
  const strength = havenStrength(all, now)
  const guards = havenGuards(haven, now).corsair ?? 1
  const might = guards * balance.navy.ships.corsair.might
  const fleets = navyOf(kingdom).fleets
  const yard = shipyardLevel(kingdom, now) > 0
  const mineHolds = haven.held?.kingdom === online.me
  const [picked, setPicked] = useState<number | null>(null)
  const pick = fleets.find((f) => f.id === picked)
  const ctxFor = (id: number) => ({
    cities: [],
    haven: { idx: haven.idx, name: haven.name, heldBy: haven.held?.kingdom ?? null, arriveAt: sailError(world, kingdom, id, haven.mooring, now) ? null : now + 1 },
  })
  const whyOf = (id: number) => missionError(kingdom, id, { kind: 'haven', haven: haven.idx }, now, ctxFor(id))
  const going = fleets.filter((f) => f.mission.kind === 'haven' && f.mission.haven === haven.idx)
  const farOf = (f: (typeof fleets)[number]) => {
    const at = fleetAt(world, kingdom, f, now)
    return at ? Math.round(Math.hypot(at.x - haven.mooring.x, at.y - haven.mooring.y)) : null
  }
  const perHour = haven.held ? -H.pop.blockadePerHour : pop >= H.pop.max ? 0 : H.pop.regrowPerHour
  return (
    <section className="sheet frame" aria-labelledby="outlaw-title">
      <Head icon="anchor" title={haven.name} sub={haven.held ? L(`${haven.held.name} abluka ediyor`, `Blockaded by ${haven.held.name}`) : L(`Korsan limanı · ${Math.round(pop)} korsan`, `Pirate haven · ${Math.round(pop)} pirates`)} onShow={() => onShow(haven.at)} onClose={onClose} />
      <div className="sheet-body">
        <Section title={L('Liman', 'Haven')} icon="anchor">
          <p className="hint">
            {L(
              `Göllerdeki korsan teknelerinin yuvası. Limanın nüfusu korsanların gücünü belirler: dolu liman tekneleri tam güçle salar, boşalan liman zayıf düşer. Bir filo limanı ablukaya alırsa nüfus saatte ${H.pop.blockadePerHour} kişi azalır; abluka kalkınca saatte ${H.pop.regrowPerHour} kişi geri gelir.`,
              `The nest of the pirate boats on the lakes. The haven's people set the pirates' strength: a full haven sends its boats out at full strength, an emptying one grows weak. If a fleet blockades the haven, its people dwindle by ${H.pop.blockadePerHour} an hour; once the blockade lifts, ${H.pop.regrowPerHour} an hour come back.`,
            )}
          </p>
          <Stat label={L('Nüfus', 'People')} value={`${Math.round(pop)} / ${H.pop.max}`} tone={haven.held ? 'up' : undefined} note={perHour === 0 ? L('dolu', 'full') : perHour > 0 ? L(`saatte +${perHour}, büyüyor`, `+${perHour} an hour, growing`) : L(`saatte ${perHour}, abluka eritiyor`, `${perHour} an hour, the blockade is wearing it down`)} />
          <div className="bar" aria-hidden>
            <i style={{ width: `${(pop / H.pop.max) * 100}%` }} />
          </div>
          <Stat label={L('Korsanların gücü', "Pirates' strength")} value={pct(strength)} note={L(`bütün limanların nüfusuna göre; en az ${pct(H.effect.floor)} (korsanlar limansız da dolaşır). İskelelerin önündeki sulara etkisi bununla çarpılır`, `by the people of all havens; at least ${pct(H.effect.floor)} (pirates roam even without a haven). Their effect on the waters off the docks is multiplied by this`)} />
          <Stat label={L('Limanı koruyan', 'Guarding the haven')} value={L(`${guards} çektiri`, `${guards} raider${guards === 1 ? '' : 's'}`)} note={L(`güç ${dec(might)}; nüfusla artar`, `might ${dec(might)}; grows with its people`)} />
          <Stat label={L('Muhafızları yenince', 'If the guard is beaten')} value={lootText(havenLoot(guards))} note={L('ödül altını ve korsanların ambarı', "reward gold and the pirates' store")} />
        </Section>
        <Section title={L('Ablukaya al', 'Blockade')} icon="ship" aside={yard ? L(`${fleets.length} filo`, `${fleets.length} fleet${fleets.length === 1 ? '' : 's'}`) : L('tersane gerekir', 'needs a shipyard')}>
          {!yard ? (
            <p className="hint">{L('Korsan limanını ablukaya almak için önce bir tersane kur ve savaş gemisi yap.', 'To blockade a pirate haven, first build a shipyard and some warships.')}</p>
          ) : (
            <>
              <p className="hint">
                {L(
                  'Bir filo seç, sonra "Ablukaya al": filo limanın önüne seyreder, varınca limanı koruyan çektirilerle deniz savaşı olur. Kazanırsa limanın önünde demirler ve geri çağırana dek ablukayı sürdürür; kaybederse kalanlarıyla eve döner. Aynı anda limanı tek filo abluka edebilir.',
                  'Choose a fleet, then "Blockade": the fleet sails before the haven, and on arrival there is a sea battle with the raiders guarding it. If it wins, it anchors off the haven and holds the blockade until you recall it; if it loses, it sails home with what is left. Only one fleet can blockade a haven at a time.',
                )}
              </p>
              {going.map((f) => {
                const m = f.mission as Extract<typeof f.mission, { kind: 'haven' }>
                return (
                  <div key={f.id} className="chase-on">
                    <Icon name="ship" size={16} />
                    <span>
                      <b>
                        {m.resolved ? L(`${fleets.indexOf(f) + 1}. filo limanı abluka ediyor`, `Fleet ${fleets.indexOf(f) + 1} is blockading the haven`) : L(`${fleets.indexOf(f) + 1}. filo yolda`, `Fleet ${fleets.indexOf(f) + 1} on the way`)}
                      </b>
                      <small className="hint">{m.resolved ? L(` · nüfus saatte −${H.pop.blockadePerHour}`, ` · people −${H.pop.blockadePerHour} an hour`) : L(` · ${Math.max(0, Math.ceil((m.arriveAt - now) / 1000))} sn sonra varır`, ` · arrives in ${Math.max(0, Math.ceil((m.arriveAt - now) / 1000))} s`)}</small>
                    </span>
                    <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'recall', fleet: f.id })} disabled={!m.resolved && m.arriveAt <= now} data-why={L('Savaş sürüyor', 'Battle under way')}>
                      {m.resolved ? L('Ablukayı kaldır', 'Lift the blockade') : L('Geri çağır', 'Recall')}
                    </button>
                  </div>
                )
              })}
              {haven.held && !mineHolds && <p className="hint">{L(`Bu limanı şu an ${haven.held.name} abluka ediyor.`, `${haven.held.name} is blockading this haven right now.`)}</p>}
              {fleets.length === 0 ? (
                <p className="hint">{L('Filon yok. Tersanede gemi yap, limandan filo çıkar.', 'You have no fleet. Build ships at the shipyard and form a fleet in the harbour.')}</p>
              ) : (
                <>
                  <div className="chase-picks" role="radiogroup" aria-label={L('Abluka edecek filo', 'Fleet to blockade with')}>
                    {fleets.map((f, i) => {
                      const why = whyOf(f.id)
                      const mightF = shipMight(f.ships)
                      const far = farOf(f)
                      return (
                        <button key={f.id} role="radio" aria-checked={picked === f.id} className={picked === f.id ? 'chase-pick active' : 'chase-pick'} disabled={!!why} data-why={why ? (NAVY_WHY[why] ?? L('Bu filo gidemez', 'This fleet cannot go')) : undefined} onClick={() => setPicked(f.id)}>
                          <b>
                            {L(`${i + 1}. filo`, `Fleet ${i + 1}`)} <ShipRow ships={f.ships} />
                          </b>
                          <small>{far !== null ? L(`${far} karo uzakta`, `${far} tiles away`) : L('yeri bilinmiyor', 'whereabouts unknown')} · {L('emir hemen', 'order at once')}</small>
                          <small className={mightF > might ? 'up' : 'down'}>
                            {L('güç', 'might')} {dec(mightF)} / {dec(might)}
                            {why ? ` · ${NAVY_WHY[why] ?? L('olmaz', 'no')}` : ''}
                          </small>
                        </button>
                      )
                    })}
                  </div>
                  <button
                    className="btn primary wide"
                    disabled={!pick || !!whyOf(pick.id)}
                    data-why={!pick ? L('Önce bir filo seç', 'Choose a fleet first') : (NAVY_WHY[whyOf(pick.id)!] ?? L('Bu filo gidemez', 'This fleet cannot go'))}
                    onClick={() => pick && online.act({ type: 'fleet', action: 'mission', fleet: pick.id, order: { kind: 'haven', haven: haven.idx } })}
                  >
                    <Icon name="ship" size={16} /> {pick ? L(`${fleets.indexOf(pick) + 1}. filoyla ablukaya al`, `Blockade with fleet ${fleets.indexOf(pick) + 1}`) : L('Önce bir filo seç', 'Choose a fleet first')}
                  </button>
                </>
              )}
            </>
          )}
        </Section>
      </div>
    </section>
  )
}

// The bandits' toll on the merchant (Ticaret → Tüccar): how much of the road they hold, what they took this season and
// what was won back off them.
export function BanditSection({ kingdom }: { kingdom: Kingdom }) {
  const books = kingdom.books
  const e = outlawEffects(kingdom)
  return (
    <Section title={L('Yağmacılar', 'Bandits')} icon="swords" aside={e.road > 0 ? L(`tüccar −%${Math.round(e.merchantCut * 100)}`, `merchant −${Math.round(e.merchantCut * 100)}%`) : L('yollar temiz', 'roads clear')}>
      <OutlawToll kingdom={kingdom} road />
      {(books?.outlaws ?? 0) > 0 && <Stat label={L('Bu sezon yağmacıların aldığı', 'Taken by bandits this season')} value={L(`${fmt(books!.outlaws!)} altın`, `${fmt(books!.outlaws!)} gold`)} tone="down" />}
      {(books?.outlawLoot ?? 0) > 0 && <Stat label={L('Yağmacılardan ve korsanlardan geri alınan', 'Won back from bandits and pirates')} value={L(`${fmt(books!.outlawLoot!)} altın`, `${fmt(books!.outlawLoot!)} gold`)} tone="up" note={L('ganimet ve ödüllerin altını (mallar ayrıca ambara girdi)', 'the gold of plunder and rewards (the goods went into the storehouse besides)')} />}
      <p className="hint">
        {L(
          'Yağmacı çeteleri ticaret yollarında küçük ordular hâlinde dolaşır. Haritada bir çeteye tıkla, bir ordu seç ve "Takip et": yakaladığın an savaş başlar, kazanırsan çetenin savaş malzemesi ve altını senin olur. Hanlarda yolların ne kadarının yağmacıların elinde olduğu konuşulur.',
          'Bandit bands roam the trade roads like little armies. Click a band on the map, choose an army and "Chase": battle begins the moment you catch it, and if you win, the band\'s war materials and gold are yours. At the inns they talk of how much of the roads the bandits hold.',
        )}
      </p>
    </Section>
  )
}

// The pirates' toll on the water by the dock (Donanma, the dock's and the shipyard's menus).
export function PirateSection({ kingdom }: { kingdom: Kingdom }) {
  const e = outlawEffects(kingdom)
  return (
    <Section title={L('Korsanlar', 'Pirates')} icon="ship" aside={e.sea > 0 ? L(`etki %${Math.round(e.sea * 100)}`, `effect ${Math.round(e.sea * 100)}%`) : L('sular temiz', 'waters clear')}>
      <OutlawToll kingdom={kingdom} sea />
      <p className="hint">
        {L(
          `Kara yelkenli korsan tekneleri göllerde ve nehirlerde dolaşır. Haritada bir tekneye tıkla, savaş gemili bir filo seç ve "Takip et": yakaladığın an deniz savaşı olur. Savaşta güç, filodaki gemilerin toplam gücüdür (kadırga ${dec(balance.navy.ships.galley.might)}, koka ${dec(balance.navy.ships.cog.might)}, çektiri ${dec(balance.navy.ships.corsair.might)}).`,
          `Black-sailed pirate boats roam the lakes and rivers. Click a boat on the map, choose a fleet with warships and "Chase": a sea battle begins the moment you catch it. In battle, might is the sum of the fleet's ships (galley ${dec(balance.navy.ships.galley.might)}, cog ${dec(balance.navy.ships.cog.might)}, raider ${dec(balance.navy.ships.corsair.might)}).`,
        )}
      </p>
    </Section>
  )
}

// ---- The bandit clans and their caves (CLAUDE.md §7.9.1) ------------------------------------------------------------

const C = balance.outlaws.clans
const CAVE_FLAVOUR = [
  L('Kayaların arasında karanlık bir ağız. İçeriden yalnızca rüzgârın uğultusu ve damlayan suyun sesi geliyor.', 'A dark mouth among the rocks. Nothing comes from within but the moan of the wind and the drip of water.'),
  L('Girişi yarı yarıya taşlarla örtülü, eski bir mağara. Yerde kurumuş yapraklar ve bir tilkinin izleri var.', 'An old cave, its entrance half covered with stones. Dry leaves and the tracks of a fox on the ground.'),
  L('Serin, nemli bir mağara. Duvarlarında yosun, tavanında yarasalar; kimin uğradığını söylemek zor.', 'A cool, damp cave. Moss on its walls, bats on its ceiling; hard to say who has been by.'),
  L('Çobanların yağmurdan kaçtığı türden sığ bir mağara. Kül izleri var ama ne kadar eski olduğu belli değil.', 'A shallow cave of the kind shepherds shelter in from the rain. There are traces of ash, but who knows how old.'),
  L('Dar bir yarıktan içeri giden derin bir mağara. Sesin yankısı uzun sürüyor; içerisi göründüğünden büyük olabilir.', 'A deep cave reached through a narrow cleft. Echoes linger a long while; it may be bigger inside than it looks.'),
]

// The lord's trail to a clan's cave (on a band's sheet and the clan's): the hints won so far, the cave once found, and
// "Mağarayı kuşat".
function ClanTrail({ world, slot, online, kingdom, now }: { world: World; slot: number; online: Online; kingdom: Kingdom; now: number }) {
  const clan = clansOf(world.seed, online.outlaws)[slot]
  if (!clan) return null
  const trail = trailOf(kingdom.caveTrail, clan)
  const need = winsToFind(kingdom, now)
  const found = trail?.cave !== undefined ? caveSpots(world, world.seed)[trail.cave] : undefined
  return (
    <>
      <Section title={clan.name} icon="scroll" aside={found ? L('mağara bulundu', 'cave found') : L(`${trail?.wins ?? 0} / ${need} iz`, `${trail?.wins ?? 0} / ${need} clues`)}>
        <p className="hint">
          {L(
            `Bu çete dağlarda, bir mağarada yaşayan ${clan.name}na bağlı. Klanın çetelerini yendikçe yakalananlar konuşur ve izler mağaraya çıkar: ${need} zaferde mağarayı bulursun`,
            `This band belongs to the ${clan.name}, who live in a cave in the mountains. Each time you beat the clan's bands, the captives talk and the trail leads closer to the cave: you find it in ${need} victories`,
          )}
          {need < C.discovery.wins ? L(' (casus evin izleri çabuk sürüyor)', ' (your spy house follows the trail quickly)') : L(' (casus evin olursa daha çabuk)', ' (sooner with a spy house)')}.
        </p>
        {!found && !trail && <Stat label={L('İzler', 'Clues')} value={L('henüz yok', 'none yet')} note={L('klanın bir çetesini yen', "beat one of the clan's bands")} />}
        {!found && trail && (
          <>
            <p className="hint">
              <b>{L('Bildiklerin:', 'What you know:')}</b> {L(`yağmacıların izi ${trailHint(trail).to} gidiyor.`, `the bandits' trail leads to ${trailHint(trail).to}.`)}
            </p>
            <Stat label={L('İzler', 'Clues')} value={`${trail.wins} / ${need}`} note={L(`${Math.max(1, need - trail.wins)} zafer daha${trail.far ? '' : '; bir sonraki zafer uzaklığı da söyletir'}`, `${Math.max(1, need - trail.wins)} more victor${Math.max(1, need - trail.wins) === 1 ? 'y' : 'ies'}${trail.far ? '' : '; the next one will get the distance out of them too'}`)} />
          </>
        )}
      </Section>
      {found && <CaveSiege world={world} clan={clan} cave={found} online={online} kingdom={kingdom} now={now} />}
    </>
  )
}

// Lay siege to a clan's cave the lord has found: pick an army, send it (march there; the siege begins at the mouth).
function CaveSiege({ world, clan, cave, online, kingdom, now }: { world: World; clan: Clan; cave: { mouth: Point }; online: Online; kingdom: Kingdom; now: number }) {
  const armies = online.armies.filter((a) => a.kingdom_id === online.me)
  const [picked, setPicked] = useState<number | null>(null)
  const pick = armies.find((a) => a.id === picked)
  const guards = clanGarrison(world.seed, clan, now)
  const rough = `${Math.max(1, guards - 3)}–${guards + 3}`
  const land = territoryRect(kingdom.site, territoryStage(kingdom, now))
  const inside = (p: Point) => p.x >= land.x && p.y >= land.y && p.x < land.x + land.size && p.y < land.y + land.size
  const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
  const envoy = (a: (typeof armies)[number]) => !inside(armyAt(a, now)) && !(a.contact_until && Date.parse(a.contact_until) > now) && !leadsArmy(kingdom, a.led_by, now)
  const going = (a: (typeof armies)[number]) =>
    (a.goal.kind === 'cave' && a.goal.slot === clan.slot) || online.orders.some((o) => o.army_id === a.id && !o.applied_at && o.payload.kind === 'cave' && o.payload.slot === clan.slot)
  const fighting = clan.battle !== null ? online.battles.find((b) => b.id === clan.battle && !b.resolved) : undefined
  return (
    <Section title={L('Mağarayı kuşat', 'Besiege the cave')} icon="swords" aside={L(`~${rough} yağmacı`, `~${rough} bandits`)}>
      <p className="hint">
        {L(
          `Ordun mağaranın ağzına yürür ve vardığında kuşatma başlar. Yağmacılar kendi mağaralarında savaşır: zarlarına +${dec(C.caveBonus)} eklenir, morali ve saha bilgisi yüksektir. Kazanırsan klan yok olur, çeteleri yollardan dağılır ve mağaradaki ganimet senin olur; ama dağlarda hemen yeni bir klan türer.`,
          `Your army marches to the cave mouth and the siege begins when it arrives. The bandits fight in their own cave: +${dec(C.caveBonus)} on their dice, high morale and terrain knowledge. If you win, the clan is wiped out, its bands scatter from the roads and the plunder in the cave is yours; but a new clan springs up in the mountains at once.`,
        )}
      </p>
      <Stat label={L('Mağarayı koruyanlar', 'Guarding the cave')} value={`~${rough}`} note={L('klan mağarasına yerleştikçe kalabalıklaşır', 'grows as the clan settles into its cave')} />
      <Stat label={L('Mağaradaki ganimet', 'Plunder in the cave')} value={lootText(clanHoard(clan, now))} note={L('klan yağmaladıkça büyür (ambar ve hazine sınırına kadar alınır)', 'grows as the clan plunders (taken up to your storehouse and treasury limits)')} />
      {fighting && <p className="hint">{L('Mağara şu an kuşatılıyor.', 'The cave is under siege right now.')}</p>}
      {armies.length === 0 ? (
        <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison in the Army tab.')}</p>
      ) : (
        <>
          <div className="chase-picks" role="radiogroup" aria-label={L('Kuşatacak ordu', 'Army to besiege with')}>
            {armies.map((a, i) => {
              const at = armyAt(a, now)
              const far = Math.round(Math.hypot(at.x - cave.mouth.x, at.y - cave.mouth.y))
              const soldiers = a.soldiers ?? 0
              const busy = going(a) || a.status === 'battle'
              return (
                <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={busy} onClick={() => setPicked(a.id)}>
                  <b>
                    {L(`${i + 1}. ordu · ${fmt(soldiers)} asker`, `Army ${i + 1} · ${fmt(soldiers)} soldier${(soldiers) === 1 ? '' : 's'}`)}
                  </b>
                  <small>
                    {L(`${far} karo uzakta`, `${far} tiles away`)} · {envoy(a) ? L(`emir elçiyle (${delay} sn)`, `order by envoy (${delay} s)`) : L('emir hemen', 'order at once')}
                  </small>
                  <small className={soldiers >= guards + 4 ? 'up' : soldiers < guards ? 'down' : undefined}>
                    {L('güç', 'strength')} {fmt(soldiers)} / ~{rough}
                    {going(a) ? L(' · yolda', ' · on the way') : a.status === 'battle' ? L(' · savaşta', ' · in battle') : ''}
                  </small>
                </button>
              )
            })}
          </div>
          <button className="btn primary wide" disabled={!pick || going(pick) || pick.status === 'battle'} onClick={() => pick && online.act({ type: 'army', army: pick.id, order: { kind: 'cave', slot: clan.slot } })}>
            <Icon name="swords" size={16} /> {pick ? L(`${armies.indexOf(pick) + 1}. orduyla mağarayı kuşat`, `Besiege the cave with army ${armies.indexOf(pick) + 1}`) : L('Önce bir ordu seç', 'Choose an army first')}
          </button>
        </>
      )}
    </Section>
  )
}

// A cave of the mountains, or a clan by its slot: the clan's sheet when the lord has found its cave; else a razed den
// or just a cave (every cave looks alike until its clan is found).
function CaveSheet({ world, pick, online, kingdom, now, onShow, onClose }: { world: World; pick: OutlawPick; online: Online; kingdom: Kingdom; now: number; onShow(at: Point): void; onClose(): void }) {
  const caves = caveSpots(world, world.seed)
  const clans = clansOf(world.seed, online.outlaws)
  const foundClan = (c: Clan) => {
    const t = trailOf(kingdom.caveTrail, c)
    return t?.cave !== undefined ? t.cave : null
  }
  const clan = pick.kind === 'clan' ? clans[pick.idx] : clans.find((c) => foundClan(c) === pick.idx)
  const caveIdx = pick.kind === 'cave' ? pick.idx : clan ? foundClan(clan) : null
  const cave = caveIdx !== null && caveIdx !== undefined ? caves[caveIdx] : undefined
  if (!cave) return null
  const here = cave.mouth
  if (clan && foundClan(clan) === cave.idx) {
    const bandsOfClan = lobbyBands(world, online.outlaws).filter((b) => b.clan === clan.slot)
    const until = clanBandsUntil(clan)
    return (
      <section className="sheet frame" aria-labelledby="outlaw-title">
        <Head icon="swords" title={L(`${clan.name} mağarası`, `The ${clan.name}'s cave`)} sub={L('Yağmacı klanının yuvası · yalnız sen biliyorsun', "A bandit clan's den · only you know of it")} onShow={() => onShow(here)} onClose={onClose} />
        <div className="sheet-body">
          <Section title={L('Klan', 'Clan')} icon="scroll">
            <p className="hint">
              {L(
                `${clan.name} dağların eteğindeki bu mağarada yaşıyor; ticaret yollarındaki ${bandsOfClan.length} çete ona bağlı (${bandsOfClan.map((b) => b.name).join(', ')}).`,
                `The ${clan.name} live in this cave in the foothills; ${bandsOfClan.length} band${bandsOfClan.length === 1 ? '' : 's'} on the trade roads answer to it (${bandsOfClan.map((b) => b.name).join(', ')}).`,
              )}
              {until !== null && until > now ? L(` Klan buraya yeni yerleşti; çeteleri ${minutes(until - now)} dakika sonra yollara çıkar.`, ` The clan has only just settled here; its bands take to the roads in ${minutes(until - now)} min.`) : ''}
            </p>
          </Section>
          <ClanTrail world={world} slot={clan.slot} online={online} kingdom={kingdom} now={now} />
        </div>
      </section>
    )
  }
  const razed = clans.flatMap((c) => c.fallen).filter((f) => f.cave === cave.idx).sort((a, b) => b.at - a.at)[0]
  return (
    <section className="sheet frame" aria-labelledby="outlaw-title">
      <Head icon="pin" title={razed ? L('Yağmacıların eski mağarası', "The bandits' old cave") : L('Mağara', 'Cave')} sub={L('Dağ eteğinde bir mağara', 'A cave in the foothills')} onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title={L('Ne var', 'What is there')} icon="scroll">
          <p className="hint">
            {razed
              ? L(`Bir zamanlar ${razed.name} burada yaşardı; ${razed.byName ?? 'bir lordun'} ordusu mağarayı aldı ve klanı yok etti. İçeride kırık mızraklar, sönmüş ocaklar ve boşaltılmış sandıklar kaldı.`, `The ${localName(razed.name)} once lived here; ${razed.byName ? `${razed.byName}'s` : "a lord's"} army took the cave and wiped out the clan. Broken spears, dead hearths and emptied chests are all that is left inside.`)
              : CAVE_FLAVOUR[Math.floor(hash(cave.idx, 3, world.seed + 6301) * CAVE_FLAVOUR.length) % CAVE_FLAVOUR.length]}
          </p>
          {!razed && (
            <p className="hint">
              {L(
                'Dağlarda pek çok mağara var; yağmacı klanları bunlardan birkaçında yaşar ve dışarıdan hepsi birbirine benzer. Bir klanın mağarasını bulmak için çetelerinden birkaçını yen: yakalananlar konuşur, izler mağaraya çıkar.',
                "There are many caves in the mountains; the bandit clans live in a few of them, and from outside they all look alike. To find a clan's cave, beat a few of its bands: the captives talk, and the trail leads to the cave.",
              )}
            </p>
          )}
        </Section>
        {!razed && <Known world={world} online={online} kingdom={kingdom} />}
        <CaveLook cave={cave} online={online} kingdom={kingdom} now={now} />
      </div>
    </section>
  )
}

// What the lord has learnt of the clans' caves so far (the hints, not the caves): shown on any cave's sheet.
function Known({ world, online, kingdom }: { world: World; online: Online; kingdom: Kingdom }) {
  const lines = clansOf(world.seed, online.outlaws)
    .map((c) => ({ clan: c, trail: trailOf(kingdom.caveTrail, c) }))
    .filter((x) => x.trail && x.trail.cave === undefined)
  return (
    <Section title={L('Bildiklerin', 'What you know')} icon="scroll">
      {lines.length === 0 ? (
        <p className="hint">{L('Henüz hiçbir klanın izini sürmedin.', "You haven't followed any clan's trail yet.")}</p>
      ) : (
        lines.map(({ clan, trail }) => (
          <p key={clan.slot} className="hint">
            <b>{clan.name}:</b> {L(`izi ${trailHint(trail!).to} gidiyor.`, `the trail leads to ${trailHint(trail!).to}.`)}
          </p>
        ))
      )}
    </Section>
  )
}

// Send an army to a cave whose clan the lord has not found: it marches to the mouth and looks, but without the trail
// it will most likely find nothing (the envoy says why; CLAUDE.md §7.9.1).
function CaveLook({ cave, online, kingdom, now }: { cave: { mouth: Point; front: Point }; online: Online; kingdom: Kingdom; now: number }) {
  const armies = online.armies.filter((a) => a.kingdom_id === online.me)
  const [picked, setPicked] = useState<number | null>(null)
  const pick = armies.find((a) => a.id === picked)
  const land = territoryRect(kingdom.site, territoryStage(kingdom, now))
  const inside = (p: Point) => p.x >= land.x && p.y >= land.y && p.x < land.x + land.size && p.y < land.y + land.size
  const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
  const envoy = (a: (typeof armies)[number]) => !inside(armyAt(a, now)) && !(a.contact_until && Date.parse(a.contact_until) > now) && !leadsArmy(kingdom, a.led_by, now)
  return (
    <Section title={L('Orduyu gönder', 'Send an army')} icon="pin">
      <p className="hint">
        {L(
          'Bir ordu mağaranın ağzına gidip içine bakabilir; ama bir klanın izini sürmeden orada bir şey bulması pek olası değil (yollar bozuk, mağaralar derin ve karanlık). Klanın mağarasını izleri sürerek bulursan doğrudan kuşatırsın.',
          "An army can go to the cave mouth and look inside; but without following a clan's trail it is unlikely to find anything (the roads are bad, the caves deep and dark). Find a clan's cave by its trail and you can besiege it outright.",
        )}
      </p>
      {armies.length === 0 ? (
        <p className="hint">{L('Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.', 'You have no army in the field. Raise one from the garrison in the Army tab.')}</p>
      ) : (
        <>
          <div className="chase-picks" role="radiogroup" aria-label={L('Gönderilecek ordu', 'Army to send')}>
            {armies.map((a, i) => {
              const at = armyAt(a, now)
              const far = Math.round(Math.hypot(at.x - cave.mouth.x, at.y - cave.mouth.y))
              return (
                <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={a.status === 'battle'} onClick={() => setPicked(a.id)}>
                  <b>
                    {L(`${i + 1}. ordu · ${fmt(a.soldiers ?? 0)} asker`, `Army ${i + 1} · ${fmt(a.soldiers ?? 0)} soldier${(a.soldiers ?? 0) === 1 ? '' : 's'}`)}
                  </b>
                  <small>
                    {L(`${far} karo uzakta`, `${far} tiles away`)} · {envoy(a) ? L(`emir elçiyle (${delay} sn)`, `order by envoy (${delay} s)`) : L('emir hemen', 'order at once')}
                    {a.status === 'battle' ? L(' · savaşta', ' · in battle') : ''}
                  </small>
                </button>
              )
            })}
          </div>
          <button
            className="btn primary wide"
            disabled={!pick || pick.status === 'battle'}
            onClick={() => pick && online.act({ type: 'army', army: pick.id, order: { kind: 'move', x: Math.floor(cave.front.x), y: Math.floor(cave.front.y) } })}
          >
            <Icon name="pin" size={16} /> {pick ? L(`${armies.indexOf(pick) + 1}. orduyu mağaraya gönder`, `Send army ${armies.indexOf(pick) + 1} to the cave`) : L('Önce bir ordu seç', 'Choose an army first')}
          </button>
        </>
      )}
    </Section>
  )
}
