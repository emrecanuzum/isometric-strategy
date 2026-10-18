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
  leadsArmy,
  navyOf,
  outlawEffects,
  outlawUp,
  roadHeld,
  seaHeld,
  shipMight,
  territoryRect,
  territoryStage,
} from '@game/shared'
import type { Band, Boat, ChaseError, Clan, Kingdom, OutlawRow, Point, World } from '@game/shared'
import { caveSpots, clanBandsUntil, clanGarrison, clanHoard, clansOf, hash, trailOf, winsToFind } from '@game/shared'
import { useState } from 'react'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { Online } from './online'
import { Section, Stat, fmt } from './primitives'
import { ShipRow } from './navy'
import { trailHint } from '../../game/caveHints'

// Bandits on the roads and pirates on the water (CLAUDE.md §7.9, §8.5): the sheet that opens when one is clicked on
// the map (what it is, what it holds of the player's trade, what beating it brings, and "Takip et": send an army or a
// fleet after it), and the panel lines that say how much they cost the player.

const B = balance.outlaws
const pct = (v: number) => `%${Math.round(v * 100)}`
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('tr-TR')
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
const centre = (b: { x: number; y: number; size: number }): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })

// 'clan': a clan by its slot (its cave, when found); 'cave': a cave of the mountains by its number (CLAUDE.md §7.9.1).
export type OutlawPick = { kind: 'band' | 'boat' | 'clan' | 'cave'; idx: number }

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
        label="Yağmacıların tuttuğu yol"
        value={pct(e.road)}
        tone={e.road > 0 ? 'down' : undefined}
        note={e.road > 0 ? `ticaret noktanın ${B.road.radiusTiles} karo çevresindeki yolun ${pct(e.road)}'i ${o?.bands ?? 0} çetenin elinde: tüccarın altınının ${pct(e.merchantCut)}'ini kesiyorlar` : 'ticaret noktanın çevresindeki yollar temiz'}
      />,
    )
  if (sea)
    lines.push(
      <Stat
        key="sea"
        label="Korsanların ticarete etkisi"
        value={pct(e.sea)}
        tone={e.sea > 0 ? 'down' : undefined}
        note={e.sea > 0 ? `iskelenin ${B.boats.reachTiles} karo yakınında ${o?.boats ?? 0} korsan teknesi dolaşıyor: deniz ticaretine saldırı olasılığı ×${dec(e.pirateFactor)}, iskelenin ve balıkçı filolarının avı −%${Math.round((1 - e.fishFactor) * 100)}` : 'iskelenin önündeki sular temiz'}
      />,
    )
  if (mood && e.happiness < 0) lines.push(<Stat key="mood" label="Yağmacılar ve korsanlar" value={`${Math.round(e.happiness)}`} tone="down" note={`halk yollarda ve sularda tedirgin (en fazla −${B.happinessCap})`} />)
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
  if (pick.kind === 'band') {
    const band = lobbyBands(world, online.outlaws).find((b) => b.idx === pick.idx)
    return band ? <BandSheet key={`b${band.idx}`} world={world} band={band} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
  }
  const boat = lobbyBoats(world, online.outlaws).find((b) => b.idx === pick.idx)
  return boat ? <BoatSheet key={`s${boat.idx}`} world={world} boat={boat} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
}

function Head({ icon, title, sub, onShow, onClose }: { icon: 'swords' | 'ship' | 'pin'; title: string; sub: string; onShow(): void; onClose(): void }) {
  return (
    <header className="sheet-head">
      <Icon name={icon} size={32} />
      <div>
        <h2 id="outlaw-title">{title}</h2>
        <small>{sub}</small>
      </div>
      <button className="btn icon-only" onClick={onShow} aria-label="Haritada göster" title="Haritada göster">
        <Icon name="pin" size={16} />
      </button>
      <button className="btn icon-only" onClick={onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
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
  const raidName = raid && !mineRaid ? (online.kingdoms.find((k) => k.id === raid.target)?.name ?? 'bir lord') : ''
  const raidText = !raid
    ? ''
    : raid.leg === 'go'
      ? mineRaid
        ? 'Yoldan ayrıldı, senin ticaret noktana baskına iniyor!'
        : `Yoldan ayrıldı, ${raidName} ticaret noktasına baskına iniyor.`
      : raid.leg === 'lurk'
        ? mineRaid
          ? 'Ticaret noktanın yakınında pusuda; tüccarın yolu ondan sakınıyor.'
          : `${raidName} ticaret noktasının yakınında pusuda bekliyor.`
        : mineRaid
          ? 'Ticaret noktandan çekiliyor, kendi yoluna dönüyor.'
          : `${raidName} ticaret noktasından dönüyor.`
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
      <Head icon="swords" title={band.name} sub={up ? `Yağmacılar · yaklaşık ${rough} kişi` : 'Dağıtıldı'} onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title="Ne yapıyor" icon="scroll">
          <p className="hint">
            {!up
              ? `Çete dağıtıldı; ${minutes((band.downUntil ?? now) - now)} dakika sonra yeniden toplanıp yolu tutar.`
              : fighting
                ? 'Şu an bir orduyla çarpışıyor.'
                : `${raidText ? raidText + ' ' : ''}Ticaret yolunun yaklaşık ${Math.round(band.length)} karoluk bir kesimini tutuyor, gelip geçen kervanları soyuyor; ara sıra yoldan ayrılıp menzilindeki bir lordun ticaret noktasına baskına iner. Ordulardan yavaş yürür (saniyede ${dec(B.bands.speedTilesPerSecond)} karo, baskında ${dec(B.bands.raid.speedTilesPerSecond)}; ordular ${dec(balance.military.speedTilesPerSecond)}): yakalamak zor değil.`}
          </p>
          {up && <Stat label="Senin ticaretine etkisi" value={mine ? pct(mine.share) : '—'} note={mine ? `ticaret noktanın çevresindeki yolu tutuşu ve yakınlığı (baskında artar)` : 'ticaret noktan yok'} />}
          <Stat label="Yendiğinde ganimet" value={lootText(bandLoot(band.soldiers))} note="savaş malzemesi, altın ve yapı malzemesi; çete bir süre sonra biraz daha kalabalık geri gelir" />
        </Section>
        <ClanTrail world={world} slot={band.clan} online={online} kingdom={kingdom} now={now} />
        {up && (
          <Section title="Takip et" icon="swords" aside={`${armies.length} ordu`}>
            <p className="hint">
              Hangi orduyla gideceğini seç, sonra "Takip et": ordu çetenin önünü keser, yakaladığı an savaş başlar. Hududun dışındaki orduya emir elçiyle gider ({delay} sn); peşindeki ordu çeteyi
              {` ${Math.round(B.bands.chase.maxSeconds / 60)}`} dakikada yakalayamazsa takibi bırakır. Yenilen ordu eve çekilir.
            </p>
            {chasers.map(({ a, n, waiting }) => (
              <div key={a.id} className="chase-on">
                <Icon name="swords" size={16} />
                <span>
                  <b>{n}. ordu {waiting ? 'yola çıkacak' : 'peşinde'}</b>
                  <small className="hint">{waiting ? ` · elçi ${Math.max(1, Math.ceil((Date.parse(waiting.effective_at) - now) / 1000))} sn'de ulaşır` : ` · ${far(a)} karo geride`}</small>
                </span>
                {!waiting && (
                  <button className="btn small" disabled={a.status === 'battle'} data-why="Ordu savaşta; emir alamaz" onClick={() => halt(a)}>
                    Takibi bırak
                  </button>
                )}
              </div>
            ))}
            {armies.length === 0 ? (
              <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <>
                <div className="chase-picks" role="radiogroup" aria-label="Takip edecek ordu">
                  {armies.map((a, i) => {
                    const busy = chasing(a) || a.status === 'battle'
                    const soldiers = a.soldiers ?? 0
                    return (
                      <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={busy} data-why={chasing(a) ? 'Bu ordu zaten peşinde' : 'Ordu savaşta'} onClick={() => setPicked(a.id)}>
                        <b>
                          {i + 1}. ordu · {fmt(soldiers)} asker
                        </b>
                        <small>
                          {far(a)} karo uzakta · {envoy(a) ? `emir elçiyle (${delay} sn)` : 'emir hemen'}
                        </small>
                        <small className={soldiers >= band.soldiers + 2 ? 'up' : soldiers < band.soldiers - 2 ? 'down' : undefined}>
                          güç {fmt(soldiers)} / ~{rough}
                          {chasing(a) ? ' · zaten peşinde' : a.status === 'battle' ? ' · savaşta' : ''}
                        </small>
                      </button>
                    )
                  })}
                </div>
                <button className="btn primary wide" disabled={!pick || chasing(pick) || pick.status === 'battle' || !!fighting} data-why={!pick ? 'Önce bir ordu seç' : chasing(pick) ? 'Bu ordu zaten peşinde' : pick.status === 'battle' ? 'Ordu savaşta' : 'Çeteyle çarpışma sürüyor'} onClick={() => pick && online.act({ type: 'army', army: pick.id, order: { kind: 'chase', band: band.idx } })}>
                  <Icon name="swords" size={16} /> {pick ? `${armies.indexOf(pick) + 1}. orduyla takip et` : 'Önce bir ordu seç'}
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
  away: 'görevde',
  warships: 'savaş gemisi yok',
  route: 'su yolu yok',
  boat: 'tekne yok',
  fleet: 'filo yok',
}

function BoatSheet({ world, boat, online, kingdom, now, onShow, onClose }: { world: World; boat: Boat; online: Online; kingdom: Kingdom; now: number; onShow(at: Point): void; onClose(): void }) {
  const up = outlawUp(boat, now)
  const here = boatAt(boat, now).at
  const dock = kingdom.buildings.find((b) => b.kind === 'dock' && b.doneAt <= now)
  const mine = dock ? seaHeld([boat], centre(dock), now) : null
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
      <Head icon="ship" title={boat.name} sub={up ? `Korsanlar · ${boat.ships} tekne · güç ${dec(might)}` : 'Batırıldı'} onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title="Ne yapıyor" icon="scroll">
          <p className="hint">
            {up
              ? `Kara yelkenli korsan tekneleri bu suları dolaşıyor; yakınındaki iskelelerin balığını ve deniz ticaretini bozuyor. Filolardan yavaştır (saniyede ${dec(B.boats.speedTilesPerSecond)} karo; filolar ${dec(1 / balance.navy.sail.secondsPerTile)}).`
              : `Tekne batırıldı; ${minutes((boat.downUntil ?? now) - now)} dakika sonra yeni bir korsan teknesi bu sulara gelir.`}
          </p>
          {up && <Stat label="İskelene etkisi" value={mine ? pct(mine.share) : '—'} note={mine ? (mine.share > 0 ? 'iskelenin önündeki sularda dolaşıyor' : 'iskelenden uzakta dolaşıyor') : 'iskelen yok'} />}
          <Stat label="Batırınca" value={lootText(boatLoot(boat))} note="ödül altını ve ambarındaki mallar" />
        </Section>
        {up && (
          <Section title="Takip et" icon="ship" aside={`${fleets.length} filo`}>
            <p className="hint">
              Hangi filoyla gideceğini seç, sonra "Takip et": filo teknenin önünü keser, yakaladığı an deniz savaşı olur. Savaşta iki tarafın gücü gemilerinin toplam gücüdür (kadırga{' '}
              {dec(balance.navy.ships.galley.might)}, koka {dec(balance.navy.ships.cog.might)}, çektiri {dec(balance.navy.ships.corsair.might)}); korsanlar çektiri gibidir:
              kokaları yener, kadırgalara yenilir. Filoda en az bir savaş gemisi olmalı.
            </p>
            {fleets.map((f, i) =>
              f.chase?.boat === boat.idx ? (
                <div key={f.id} className="chase-on">
                  <Icon name="ship" size={16} />
                  <span>
                    <b>{i + 1}. filo peşinde</b>
                    <small className="hint">{farOf(f) !== null && ` · ${farOf(f)} karo geride`} · emirler elçisiz, hemen</small>
                  </span>
                  <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'unchase', fleet: f.id })}>
                    Takibi bırak
                  </button>
                </div>
              ) : null,
            )}
            {fleets.length === 0 ? (
              <p className="hint">Filon yok. Tersanede gemi yap, limandan filo çıkar.</p>
            ) : (
              <>
                <div className="chase-picks" role="radiogroup" aria-label="Takip edecek filo">
                  {fleets.map((f, i) => {
                    const chasing = f.chase?.boat === boat.idx
                    const why = chasing ? null : chaseBoatError(world, kingdom, f.id, boat, now)
                    const mightF = shipMight(f.ships)
                    const far = farOf(f)
                    return (
                      <button key={f.id} role="radio" aria-checked={picked === f.id} className={picked === f.id ? 'chase-pick active' : 'chase-pick'} disabled={chasing || !!why} data-why={chasing ? 'Bu filo zaten peşinde' : why ? (CHASE_ERRORS[why] ?? 'Bu filo takip edemez') : undefined} onClick={() => setPicked(f.id)}>
                        <b>
                          {i + 1}. filo <ShipRow ships={f.ships} />
                        </b>
                        <small>
                          {far !== null ? `${far} karo uzakta` : 'yeri bilinmiyor'} · emir hemen
                        </small>
                        <small className={mightF > might ? 'up' : 'down'}>
                          güç {dec(mightF)} / {dec(might)}
                          {chasing ? ' · zaten peşinde' : why ? ` · ${CHASE_ERRORS[why] ?? 'olmaz'}` : ''}
                        </small>
                      </button>
                    )
                  })}
                </div>
                <button className="btn primary wide" disabled={!pick || pick.chase?.boat === boat.idx || !!chaseBoatError(world, kingdom, pick.id, boat, now)} data-why={!pick ? 'Önce bir filo seç' : pick.chase?.boat === boat.idx ? 'Bu filo zaten peşinde' : (CHASE_ERRORS[chaseBoatError(world, kingdom, pick.id, boat, now) as ChaseError] ?? 'Bu filo takip edemez')} onClick={() => pick && online.act({ type: 'fleet', action: 'chase', fleet: pick.id, boat: boat.idx })}>
                  <Icon name="ship" size={16} /> {pick ? `${fleets.indexOf(pick) + 1}. filoyla takip et` : 'Önce bir filo seç'}
                </button>
              </>
            )}
          </Section>
        )}
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
    <Section title="Yağmacılar" icon="swords" aside={e.road > 0 ? `tüccar −%${Math.round(e.merchantCut * 100)}` : 'yollar temiz'}>
      <OutlawToll kingdom={kingdom} road />
      {(books?.outlaws ?? 0) > 0 && <Stat label="Bu sezon yağmacıların aldığı" value={`${fmt(books!.outlaws!)} altın`} tone="down" />}
      {(books?.outlawLoot ?? 0) > 0 && <Stat label="Yağmacılardan ve korsanlardan geri alınan" value={`${fmt(books!.outlawLoot!)} altın`} tone="up" note="ganimet ve ödüllerin altını (mallar ayrıca ambara girdi)" />}
      <p className="hint">
        Yağmacı çeteleri ticaret yollarında küçük ordular hâlinde dolaşır. Haritada bir çeteye tıkla, bir ordu seç ve "Takip et": yakaladığın an savaş başlar, kazanırsan
        çetenin savaş malzemesi ve altını senin olur. Hanlarda yolların ne kadarının yağmacıların elinde olduğu konuşulur.
      </p>
    </Section>
  )
}

// The pirates' toll on the water by the dock (Donanma, the dock's and the shipyard's menus).
export function PirateSection({ kingdom }: { kingdom: Kingdom }) {
  const e = outlawEffects(kingdom)
  return (
    <Section title="Korsanlar" icon="ship" aside={e.sea > 0 ? `etki %${Math.round(e.sea * 100)}` : 'sular temiz'}>
      <OutlawToll kingdom={kingdom} sea />
      <p className="hint">
        Kara yelkenli korsan tekneleri göllerde ve nehirlerde dolaşır. Haritada bir tekneye tıkla, savaş gemili bir filo seç ve "Takip et": yakaladığın an deniz savaşı
        olur. Savaşta güç, filodaki gemilerin toplam gücüdür (kadırga {dec(balance.navy.ships.galley.might)}, koka {dec(balance.navy.ships.cog.might)}, çektiri{' '}
        {dec(balance.navy.ships.corsair.might)}).
      </p>
    </Section>
  )
}

// ---- The bandit clans and their caves (CLAUDE.md §7.9.1) ------------------------------------------------------------

const C = balance.outlaws.clans
const CAVE_FLAVOUR = [
  'Kayaların arasında karanlık bir ağız. İçeriden yalnızca rüzgârın uğultusu ve damlayan suyun sesi geliyor.',
  'Girişi yarı yarıya taşlarla örtülü, eski bir mağara. Yerde kurumuş yapraklar ve bir tilkinin izleri var.',
  'Serin, nemli bir mağara. Duvarlarında yosun, tavanında yarasalar; kimin uğradığını söylemek zor.',
  'Çobanların yağmurdan kaçtığı türden sığ bir mağara. Kül izleri var ama ne kadar eski olduğu belli değil.',
  'Dar bir yarıktan içeri giden derin bir mağara. Sesin yankısı uzun sürüyor; içerisi göründüğünden büyük olabilir.',
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
      <Section title={clan.name} icon="scroll" aside={found ? 'mağara bulundu' : `${trail?.wins ?? 0} / ${need} iz`}>
        <p className="hint">
          Bu çete dağlarda, bir mağarada yaşayan {clan.name}na bağlı. Klanın çetelerini yendikçe yakalananlar konuşur ve izler mağaraya çıkar: {need} zaferde mağarayı bulursun
          {need < C.discovery.wins ? ' (casus evin izleri çabuk sürüyor)' : ' (casus evin olursa daha çabuk)'}.
        </p>
        {!found && !trail && <Stat label="İzler" value="henüz yok" note="klanın bir çetesini yen" />}
        {!found && trail && (
          <>
            <p className="hint">
              <b>Bildiklerin:</b> yağmacıların izi {trailHint(trail).to} gidiyor.
            </p>
            <Stat label="İzler" value={`${trail.wins} / ${need}`} note={`${Math.max(1, need - trail.wins)} zafer daha${trail.far ? '' : '; bir sonraki zafer uzaklığı da söyletir'}`} />
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
    <Section title="Mağarayı kuşat" icon="swords" aside={`~${rough} yağmacı`}>
      <p className="hint">
        Ordun mağaranın ağzına yürür ve vardığında kuşatma başlar. Yağmacılar kendi mağaralarında savaşır: zarlarına +{dec(C.caveBonus)} eklenir, morali ve saha bilgisi yüksektir.
        Kazanırsan klan yok olur, çeteleri yollardan dağılır ve mağaradaki ganimet senin olur; ama dağlarda hemen yeni bir klan türer.
      </p>
      <Stat label="Mağarayı koruyanlar" value={`~${rough}`} note="klan mağarasına yerleştikçe kalabalıklaşır" />
      <Stat label="Mağaradaki ganimet" value={lootText(clanHoard(clan, now))} note="klan yağmaladıkça büyür (ambar ve hazine sınırına kadar alınır)" />
      {fighting && <p className="hint">Mağara şu an kuşatılıyor.</p>}
      {armies.length === 0 ? (
        <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
      ) : (
        <>
          <div className="chase-picks" role="radiogroup" aria-label="Kuşatacak ordu">
            {armies.map((a, i) => {
              const at = armyAt(a, now)
              const far = Math.round(Math.hypot(at.x - cave.mouth.x, at.y - cave.mouth.y))
              const soldiers = a.soldiers ?? 0
              const busy = going(a) || a.status === 'battle'
              return (
                <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={busy} onClick={() => setPicked(a.id)}>
                  <b>
                    {i + 1}. ordu · {fmt(soldiers)} asker
                  </b>
                  <small>
                    {far} karo uzakta · {envoy(a) ? `emir elçiyle (${delay} sn)` : 'emir hemen'}
                  </small>
                  <small className={soldiers >= guards + 4 ? 'up' : soldiers < guards ? 'down' : undefined}>
                    güç {fmt(soldiers)} / ~{rough}
                    {going(a) ? ' · yolda' : a.status === 'battle' ? ' · savaşta' : ''}
                  </small>
                </button>
              )
            })}
          </div>
          <button className="btn primary wide" disabled={!pick || going(pick) || pick.status === 'battle'} onClick={() => pick && online.act({ type: 'army', army: pick.id, order: { kind: 'cave', slot: clan.slot } })}>
            <Icon name="swords" size={16} /> {pick ? `${armies.indexOf(pick) + 1}. orduyla mağarayı kuşat` : 'Önce bir ordu seç'}
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
        <Head icon="swords" title={`${clan.name} mağarası`} sub="Yağmacı klanının yuvası · yalnız sen biliyorsun" onShow={() => onShow(here)} onClose={onClose} />
        <div className="sheet-body">
          <Section title="Klan" icon="scroll">
            <p className="hint">
              {clan.name} dağların eteğindeki bu mağarada yaşıyor; ticaret yollarındaki {bandsOfClan.length} çete ona bağlı ({bandsOfClan.map((b) => b.name).join(', ')}).
              {until !== null && until > now ? ` Klan buraya yeni yerleşti; çeteleri ${minutes(until - now)} dakika sonra yollara çıkar.` : ''}
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
      <Head icon="pin" title={razed ? 'Yağmacıların eski mağarası' : 'Mağara'} sub="Dağ eteğinde bir mağara" onShow={() => onShow(here)} onClose={onClose} />
      <div className="sheet-body">
        <Section title="Ne var" icon="scroll">
          <p className="hint">
            {razed
              ? `Bir zamanlar ${razed.name} burada yaşardı; ${razed.byName ?? 'bir lordun'} ordusu mağarayı aldı ve klanı yok etti. İçeride kırık mızraklar, sönmüş ocaklar ve boşaltılmış sandıklar kaldı.`
              : CAVE_FLAVOUR[Math.floor(hash(cave.idx, 3, world.seed + 6301) * CAVE_FLAVOUR.length) % CAVE_FLAVOUR.length]}
          </p>
          {!razed && (
            <p className="hint">
              Dağlarda pek çok mağara var; yağmacı klanları bunlardan birkaçında yaşar ve dışarıdan hepsi birbirine benzer. Bir klanın mağarasını bulmak için çetelerinden birkaçını
              yen: yakalananlar konuşur, izler mağaraya çıkar.
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
    <Section title="Bildiklerin" icon="scroll">
      {lines.length === 0 ? (
        <p className="hint">Henüz hiçbir klanın izini sürmedin.</p>
      ) : (
        lines.map(({ clan, trail }) => (
          <p key={clan.slot} className="hint">
            <b>{clan.name}:</b> izi {trailHint(trail!).to} gidiyor.
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
    <Section title="Orduyu gönder" icon="pin">
      <p className="hint">
        Bir ordu mağaranın ağzına gidip içine bakabilir; ama bir klanın izini sürmeden orada bir şey bulması pek olası değil (yollar bozuk, mağaralar derin ve karanlık). Klanın
        mağarasını izleri sürerek bulursan doğrudan kuşatırsın.
      </p>
      {armies.length === 0 ? (
        <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
      ) : (
        <>
          <div className="chase-picks" role="radiogroup" aria-label="Gönderilecek ordu">
            {armies.map((a, i) => {
              const at = armyAt(a, now)
              const far = Math.round(Math.hypot(at.x - cave.mouth.x, at.y - cave.mouth.y))
              return (
                <button key={a.id} role="radio" aria-checked={picked === a.id} className={picked === a.id ? 'chase-pick active' : 'chase-pick'} disabled={a.status === 'battle'} onClick={() => setPicked(a.id)}>
                  <b>
                    {i + 1}. ordu · {fmt(a.soldiers ?? 0)} asker
                  </b>
                  <small>
                    {far} karo uzakta · {envoy(a) ? `emir elçiyle (${delay} sn)` : 'emir hemen'}
                    {a.status === 'battle' ? ' · savaşta' : ''}
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
            <Icon name="pin" size={16} /> {pick ? `${armies.indexOf(pick) + 1}. orduyu mağaraya gönder` : 'Önce bir ordu seç'}
          </button>
        </>
      )}
    </Section>
  )
}
