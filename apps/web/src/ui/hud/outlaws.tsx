import {
  armyAt,
  balance,
  bandAt,
  bandLoot,
  bandsOf,
  boatAt,
  boatLoot,
  boatMight,
  boatsOf,
  chaseBoatError,
  fleetAt,
  navyOf,
  outlawEffects,
  outlawUp,
  roadHeld,
  seaHeld,
  shipMight,
  territoryRect,
  territoryStage,
} from '@game/shared'
import type { Band, Boat, ChaseError, Kingdom, OutlawRow, Point, World } from '@game/shared'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { Online } from './online'
import { Section, Stat, fmt } from './primitives'
import { ShipRow } from './navy'

// Bandits on the roads and pirates on the water (CLAUDE.md §7.9, §8.5): the sheet that opens when one is clicked on
// the map (what it is, what it holds of the player's trade, what beating it brings, and "Takip et": send an army or a
// fleet after it), and the panel lines that say how much they cost the player.

const B = balance.outlaws
const pct = (v: number) => `%${Math.round(v * 100)}`
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('tr-TR')
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000))
const centre = (b: { x: number; y: number; size: number }): Point => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 })

export type OutlawPick = { kind: 'band' | 'boat'; idx: number }

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
  if (pick.kind === 'band') {
    const band = lobbyBands(world, online.outlaws).find((b) => b.idx === pick.idx)
    return band ? <BandSheet world={world} band={band} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
  }
  const boat = lobbyBoats(world, online.outlaws).find((b) => b.idx === pick.idx)
  return boat ? <BoatSheet world={world} boat={boat} online={online} kingdom={kingdom} now={now} onShow={onShow} onClose={onClose} /> : null
}

function Head({ icon, title, sub, onShow, onClose }: { icon: 'swords' | 'ship'; title: string; sub: string; onShow(): void; onClose(): void }) {
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
  const armies = online.armies.filter((a) => a.kingdom_id === online.me)
  const land = territoryRect(kingdom.site, territoryStage(kingdom, now))
  const inside = (p: Point) => p.x >= land.x && p.y >= land.y && p.x < land.x + land.size && p.y < land.y + land.size
  const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
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
                : `Ticaret yolunun yaklaşık ${Math.round(band.length)} karoluk bir kesimini tutuyor, gelip geçen kervanları soyuyor. Ordulardan yavaş yürür (saniyede ${dec(B.bands.speedTilesPerSecond)} karo; ordular ${dec(balance.military.speedTilesPerSecond)}): yakalamak zor değil.`}
          </p>
          {up && <Stat label="Senin ticaretine etkisi" value={mine ? pct(mine.share) : '—'} note={mine ? `ticaret noktanın çevresindeki yolun bu kadarını bu çete tutuyor` : 'ticaret noktan yok'} />}
          <Stat label="Yendiğinde ganimet" value={lootText(bandLoot(band.soldiers))} note="savaş malzemesi, altın ve yapı malzemesi; çete bir süre sonra biraz daha kalabalık geri gelir" />
        </Section>
        {up && (
          <Section title="Takip et" icon="swords" aside={`${armies.length} ordu`}>
            <p className="hint">
              Bir ordu seç ve peşine düş: ordu çetenin önünü keser, yakaladığı an savaş başlar. Hududun dışındaki orduya emir elçiyle gider ({delay} sn); peşindeki ordu çeteyi
              {` ${Math.round(B.bands.chase.maxSeconds / 60)}`} dakikada yakalayamazsa takibi bırakır. Yenilen ordu eve çekilir.
            </p>
            {armies.length === 0 ? (
              <p className="hint">Sahada ordun yok. Ordu sekmesinden garnizondan bir ordu çıkar.</p>
            ) : (
              <ul className="list">
                {armies.map((a) => {
                  const at = armyAt(a, now)
                  const chasing = a.goal.kind === 'chase' && a.goal.band === band.idx
                  const far = Math.round(Math.hypot(at.x - here.x, at.y - here.y))
                  const envoy = !inside(at) && !(a.contact_until && Date.parse(a.contact_until) > now)
                  return (
                    <li key={a.id} className="row">
                      <span>
                        <b>{fmt(a.soldiers ?? 0)} asker</b>
                        <small className="hint"> · {far} karo uzakta{envoy ? ' · emir elçiyle' : ''}</small>
                      </span>
                      {chasing ? (
                        <span className="chip">Peşinde</span>
                      ) : (
                        <button className="btn small" disabled={a.status === 'battle' || !!fighting} onClick={() => online.act({ type: 'army', army: a.id, order: { kind: 'chase', band: band.idx } })}>
                          <Icon name="swords" size={16} /> Takip et
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
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
              Bir filo seç ve peşine düş: filo teknenin önünü keser, yakaladığı an deniz savaşı olur. Savaşta iki tarafın gücü gemilerinin toplam gücüdür (kadırga{' '}
              {dec(balance.navy.ships.galley.might)}, koka {dec(balance.navy.ships.cog.might)}, çektiri {dec(balance.navy.ships.corsair.might)}); korsanlar çektiri gibidir:
              kokaları yener, kadırgalara yenilir. Filoda en az bir savaş gemisi olmalı.
            </p>
            {fleets.length === 0 ? (
              <p className="hint">Filon yok. Tersanede gemi yap, limandan filo çıkar.</p>
            ) : (
              <ul className="list">
                {fleets.map((f, i) => {
                  const chasing = f.chase?.boat === boat.idx
                  const why = chasing ? null : chaseBoatError(world, kingdom, f.id, boat, now)
                  const at = fleetAt(world, kingdom, f, now)
                  const far = at ? Math.round(Math.hypot(at.x - here.x, at.y - here.y)) : null
                  const mightF = shipMight(f.ships)
                  return (
                    <li key={f.id} className="row">
                      <span>
                        <b>{i + 1}. filo</b> <ShipRow ships={f.ships} />
                        <small className="hint">
                          {' '}
                          · güç {dec(mightF)} / {dec(might)}
                          {far !== null && ` · ${far} karo`}
                        </small>
                      </span>
                      {chasing ? (
                        <button className="btn small" onClick={() => online.act({ type: 'fleet', action: 'unchase', fleet: f.id })}>
                          Takibi bırak
                        </button>
                      ) : (
                        <button className="btn small" disabled={!!why} title={why ? CHASE_ERRORS[why] : undefined} onClick={() => online.act({ type: 'fleet', action: 'chase', fleet: f.id, boat: boat.idx })}>
                          <Icon name="ship" size={16} /> {why ? CHASE_ERRORS[why] ?? 'olmaz' : 'Takip et'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
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
