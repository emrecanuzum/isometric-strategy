import { balance, bandsOf, basePrice, boatsOf, canTradeAt, hash, innPrice, innPulls, innSaturation, innShareFactor, innSpec, innStats, outlawUp, priceAt, roadHeld, stewardFactor, tradeCityReadyAt, tradeInnError } from '@game/shared'
import type { Good, Kingdom, Market, Point, World } from '@game/shared'
import { useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { INN_KIND_NAMES, INN_KIND_TEXT, innInfo } from '../../game/innInfo'
import type { InnKind } from '../../game/innInfo'
import { innLook, isCaravanserai } from '../../game/innSprites'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { KingdomInfo, Online } from './online'
import { Meter, Placeholder, Section, SpriteView, Stat } from './primitives'

// The inns of the trade routes (CLAUDE.md §7.6): the talk of travellers about the lobby's trade, drawn from what every
// player can know (prices, the rounded trade shares, wars, raided trade posts, armies on the road), and the trade
// shares as a pie.

const GOODS: Good[] = ['food', 'materials', 'arms']
const GOOD_WORDS: Record<Good, string> = { food: 'yemek', materials: 'yapı malzemesi', arms: 'savaş malzemesi' }

export const swatchOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'

// What the trade shares are counted in: the gold the merchants brought home, or the units of one good.
type Measure = 'gold' | Good

const shareOf = (k: KingdomInfo, measure: Measure) => k.tradeLedger?.[measure] ?? 0

// Others' totals come rounded (the heading says so); no mark of their own, as the digits' font draws ~ like a minus.
const amount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')}K` : `${Math.round(n)}`)

export interface Rumour {
  text: string
  // Who tells it.
  teller: string
}

const TELLERS = ['Bir deveci', 'Yorgun bir tüccar', 'Hancı', 'Bir ulak', 'Kervanbaşı', 'Bir hacı', 'Gezgin bir çalgıcı', 'Muhafızlardan biri', 'Bir kumaşçı', 'Yaşlı bir yolcu']

// How much of the trade road round an inn the bandits hold (CLAUDE.md §7.9), and by which bands.
export function innBandits(world: World, index: number, online: Online, now: number) {
  const inn = world.inns[index]
  const bands = bandsOf(world, world.seed, online.outlaws)
  const held = roadHeld(world, world.seed, bands, { x: inn.x + 1, y: inn.y + 1 }, now)
  const near = bands.filter((b) => outlawUp(b, now) && b.path.some((p) => Math.hypot(p.x - inn.x, p.y - inn.y) <= balance.outlaws.road.radiusTiles))
  return { share: held.share, names: near.map((b) => b.name), roads: held.roadTiles }
}

// Where a lord's palace stands (its site until the palace is placed).
function palaceOf(k: KingdomInfo): Point {
  if (k.palaceAt) return k.palaceAt
  const p = k.buildings?.find((b) => b.kind === 'palace')
  return p ? { x: p.x + p.size / 2, y: p.y + p.size / 2 } : k.site
}

// Who trades at an inn (CLAUDE.md §7.6): each lord's pull from its palace and the towns it holds, nearer pulling more.
export function innReach(world: World, index: number, online: Online) {
  const half = balance.towns.size / 2
  const pulls = innPulls(
    world.inns[index],
    online.kingdoms.map((k) => ({ id: k.id, palace: palaceOf(k) })),
    online.towns.map((t) => ({ owner: t.owner, at: { x: t.x + half, y: t.y + half } })),
  )
  return pulls.flatMap((p) => {
    const k = online.kingdoms.find((x) => x.id === p.id)
    return k ? [{ ...p, k }] : []
  })
}

// The player's slice of an inn's pie.
export const myInnShare = (world: World, index: number, online: Online) => innReach(world, index, online).find((p) => p.k.id === online.me)?.share ?? 0

// The index in world.inns of the inn the merchant sells at, if any.
export const tradeInnIndex = (world: World, kingdom: Kingdom) => {
  const at = kingdom.trade.inn
  return at ? world.inns.findIndex((p) => p.x === at.x && p.y === at.y) : -1
}

// What the inn would pay the player for one unit of a good now.
export const innUnitPrice = (world: World, index: number, kingdom: Kingdom, share: number, good: Good, market: Market | null | undefined, now: number) => {
  const inn = world.inns[index]
  return innPrice({ x: inn.x, y: inn.y, stats: innStats(world.seed, inn), share }, good, market, now) * stewardFactor(kingdom, good, now)
}

// The talk at an inn now: a few things true of the lobby, chosen by the inn's trade and changing with the game hour.
export function rumoursAt(world: World, index: number, kind: InnKind, online: Online, now: number): Rumour[] {
  const market: Market | null = online.market
  const inn = world.inns[index]
  const kingdoms = online.kingdoms
  const named = (id: number) => kingdoms.find((k) => k.id === id)?.name ?? 'bilinmeyen bir lord'
  const prices: string[] = []
  for (const good of GOODS) {
    const ratio = priceAt(market, good, now) / basePrice(good, market)
    if (ratio < 0.85) prices.push(`Pazarlarda ${GOOD_WORDS[good]} bolluğu var; fiyatı düştü, satan az kazanıyor.`)
    else if (ratio > 1.15) prices.push(`${RESOURCE_NAMES[good]} kıt; alıcılar fiyatı yükseltti, elinde olan şimdi satmalı.`)
    else if (kind === 'market') prices.push(`${RESOURCE_NAMES[good]} fiyatı yerinde sayıyor.`)
  }
  const sellers: string[] = []
  for (const good of GOODS) {
    const top = kingdoms.filter((k) => shareOf(k, good) > 0).sort((a, b) => shareOf(b, good) - shareOf(a, good))[0]
    if (top) sellers.push(`En çok ${GOOD_WORDS[good]} satan ${top.name}; bu mevsim ${amount(shareOf(top, good))} birim.`)
  }
  const richest = kingdoms.filter((k) => shareOf(k, 'gold') > 0).sort((a, b) => shareOf(b, 'gold') - shareOf(a, 'gold'))[0]
  if (richest) sellers.push(`Ticaretten en çok altını ${richest.name} topladı, ${amount(shareOf(richest, 'gold'))} kadar.`)
  const carrying = kingdoms
    .filter((k) => k.id !== online.me && k.tradeGood && !k.tradeDamaged)
    .map((k) => `${k.name} kervanları şu sıralar ${GOOD_WORDS[k.tradeGood!]} taşıyor.`)
  const idle = kingdoms.filter((k) => k.id !== online.me && k.tradeGood === null && !k.tradeDamaged).map((k) => `${k.name} tüccarı evde oturuyor; yollarda görünmüyor.`)
  const trouble = [
    ...kingdoms.filter((k) => k.tradeDamaged).map((k) => `${k.name} ticaret noktası yağmalandı; onarılana dek tüccarı satış yapamaz.`),
    ...online.pacts
      .filter((p) => p.kind === 'war' && !p.ended_at)
      .map((p) => `${named(p.from_id)} ile ${named(p.to_id)} savaşta; o yollarda kervanlar tedirgin.`),
  ]
  const marching = new Map<number, number>()
  for (const a of online.armies) if (a.status !== 'idle') marching.set(a.kingdom_id, (marching.get(a.kingdom_id) ?? 0) + 1)
  const roads = [...marching].filter(([id]) => id !== online.me).map(([id, n]) => `${named(id)} lordunun ${n > 1 ? `${n} ordusu` : 'bir ordusu'} yolda.`)
  const near = kingdoms
    .map((k) => ({ k, d: Math.round(Math.hypot(palaceOf(k).x - inn.x, palaceOf(k).y - inn.y)) }))
    .sort((a, b) => a.d - b.d)[0]
  const local = near
    ? [near.k.id === online.me ? `Buraya en yakın saray senin sarayın, ${near.d} karo ötede.` : `Buraya en yakın saray ${near.k.name} sarayı, ${near.d} karo ötede; ${near.k.palace}. seviye.`]
    : []
  // The bandits on the roads round the inn, and on the player's own road; the pirates on the water.
  const robbers = innBandits(world, index, online, now)
  const mine = kingdoms.find((k) => k.id === online.me)
  const myRoad = online.kingdoms.length && mine ? Math.hypot(mine.site.x - inn.x, mine.site.y - inn.y) : Infinity
  const pirates = boatsOf(world, world.seed, online.outlaws).filter((b) => outlawUp(b, now)).length
  const bandits = [
    robbers.share > 0
      ? `Bu handan çıkan yolların %${Math.round(robbers.share * 100)}'i yağmacıların elinde; ${robbers.names.join(', ')} kervanları soyuyor.`
      : robbers.roads > 0
        ? 'Buralarda yağmacı duyulmadı; yollar temiz, kervanlar rahat.'
        : '',
    ...(myRoad < 160 && robbers.share > 0 ? [`${mine!.name} tüccarı da bu yollardan geçiyor; yağmacılar onun kazancından da pay alıyor.`] : []),
    ...(pirates > 0 ? [`Göllerde ve nehirlerde ${pirates} korsan teknesi dolaşıyor; kara yelkeni gören iskeleye kaçıyor.`] : []),
  ].filter(Boolean)
  // Each inn hears most about its own trade.
  const pools: Record<InnKind, string[][]> = {
    market: [bandits, prices, sellers, carrying, local],
    toll: [bandits, carrying, idle, sellers, local],
    post: [bandits, roads, trouble, carrying, local],
    inn: [bandits, local, trouble, sellers, prices, roads],
  }
  // A game hour is two and a half real minutes (a game day is a real hour).
  const hour = Math.floor(now / 150_000)
  const told: Rumour[] = []
  for (const pool of pools[kind]) {
    if (pool.length === 0) continue
    const pickIndex = Math.floor(hash(index, hour + told.length, world.seed + 1951) * pool.length)
    for (let i = 0; i < Math.min(2, pool.length) && told.length < 5; i++) {
      const text = pool[(pickIndex + i) % pool.length]
      if (told.some((r) => r.text === text)) continue
      told.push({ text, teller: TELLERS[Math.floor(hash(index, told.length + hour * 7, world.seed + 1953) * TELLERS.length)] })
    }
  }
  return told
}

// A pie of shares in the kingdoms' colours.
function Pie({ slices, label }: { slices: { id: number; color: string | null; value: number }[]; label: string }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let turn = -0.25
  return (
    <svg viewBox="-1.1 -1.1 2.2 2.2" className="pie" role="img" aria-label={label}>
      {slices.length === 1 ? (
        <circle r="1" fill={swatchOf(slices[0].color)} />
      ) : (
        slices.map(({ id, color, value }) => {
          const from = turn
          turn += value / total
          const a0 = from * Math.PI * 2
          const a1 = turn * Math.PI * 2
          const large = a1 - a0 > Math.PI ? 1 : 0
          const d = `M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`
          return <path key={id} d={d} fill={swatchOf(color)} stroke="var(--ink)" strokeWidth="0.03" />
        })
      )}
    </svg>
  )
}

const times = (f: number) => `×${f.toFixed(2).replace('.', ',')}`

// What the inn pays for each good, how full its market is, and sending the merchant there (CLAUDE.md §7.6).
function InnMarket({ world, index, online, kingdom, now, onInn }: { world: World; index: number; online: Online; kingdom: Kingdom | null; now: number; onInn(inn: Point | null): void }) {
  const inn = world.inns[index]
  const stats = innStats(world.seed, inn)
  const market = online.market
  const share = myInnShare(world, index, online)
  const here = !!kingdom && tradeInnIndex(world, kingdom) === index
  const error = kingdom ? tradeInnError(kingdom, share, now) : 'innPost'
  const wait = kingdom ? Math.max(0, Math.ceil((tradeCityReadyAt(kingdom) - now) / 1000)) : 0
  const s = innSpec()
  const why: Record<string, string> = {
    innPost: 'Önce bir ticaret noktası kur',
    innLevel: `Ticaret noktan ${s.minLevel + 1}. seviye olmalı`,
    innWait: `Tüccarın yolu az önce değişti; ${wait} sn sonra`,
    innFar: `Bu hanın pastasında payın %${Math.round(s.minShare * 100)}'ten az; yakınında bir kasaba al`,
  }
  const rich = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0) / 3
  return (
    <Section title="Hanın fiyatları" icon="gold" aside={rich >= 1.15 ? 'cömert han' : rich <= 0.85 ? 'ölü han' : 'olağan han'}>
      <ul className="inn-prices">
        {GOODS.map((good) => {
          const sat = innSaturation(market, inn, good, now)
          return (
            <li key={good}>
              <Icon name={good} size={16} />
              <span>{RESOURCE_NAMES[good]}</span>
              <b className={stats[good] >= 1.1 ? 'up' : stats[good] <= 0.9 ? 'down' : undefined}>{times(stats[good])}</b>
              <small>
                {sat < 0.98 ? `satıldıkça düştü ${times(sat)}` : 'pazarı taze'}
                {kingdom && canTradeAt(share) && ` · sana birimi ${innUnitPrice(world, index, kingdom, share, good, market, now).toFixed(2).replace('.', ',')} altın`}
              </small>
            </li>
          )
        })}
      </ul>
      <Stat
        label="Senin payın"
        value={`%${Math.round(share * 100)}`}
        tone={canTradeAt(share) ? 'up' : 'down'}
        note={canTradeAt(share) ? `fiyata ${times(innShareFactor(share))}` : `en az %${Math.round(s.minShare * 100)} gerekir`}
      />
      {here ? (
        <button className="btn" disabled={wait > 0} data-why={why.innWait} onClick={() => onInn(null)}>
          Tüccar burada · lobi pazarına döndür
        </button>
      ) : (
        <button className="btn" disabled={!!error} data-why={error ? why[error] : undefined} onClick={() => onInn({ x: inn.x, y: inn.y })}>
          Tüccarı bu hana gönder
        </button>
      )}
      <p className="hint">
        Hancı anlatıyor: her han her mala kendi fiyatını verir (lobi fiyatı × hanın çarpanı). Payın büyüdükçe sana daha iyi davranır
        ({times(s.shareLow)} ile {times(s.shareHigh)} arası). Çok satılan malın burada fiyatı düşer, zamanla toparlanır. Sefer lobi pazarınınki kadar sürer.
      </p>
    </Section>
  )
}

// The lords this inn trades with, by how near their palaces and towns are (CLAUDE.md §7.6).
function InnReach({ world, index, online }: { world: World; index: number; online: Online }) {
  const slices = innReach(world, index, online)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  return (
    <Section title="Han kiminle ticarette" icon="trade" aside={`${innSpec().reachTiles} karo çevre`}>
      {total === 0 ? (
        <p className="hint">Hiçbir lordun sarayı ya da kasabası bu hana yakın değil; kervanlar yalnızca gelip geçiyor. Yakınında bir kasaba alan lord burada ticaret yapabilir.</p>
      ) : (
        <>
          <div className="shares">
            <Pie slices={slices.map(({ k, value }) => ({ id: k.id, color: k.color, value }))} label="Hana yakınlık payları" />
            <ul className="legend">
              {slices.map(({ k, value, towns, distance: d }) => (
                <li key={k.id}>
                  <i style={{ background: swatchOf(k.color) }} />
                  <span>{k.id === online.me ? `${k.name} (sen)` : k.name}</span>
                  <b>%{Math.round((value / total) * 100)}</b>
                  <small>
                    saray {d} karo{towns > 0 && ` · ${towns} kasaba`}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          <p className="hint">Hancı anlatıyor: buraya kimin sarayı ve kasabaları yakınsa kervanları onunla alışveriş eder. Yakın kasabalar da lordun payına katılır; payı küçük olan lordun tüccarı burada iş yapamaz.</p>
        </>
      )}
    </Section>
  )
}

// A pie of who rules the lobby's trade: each kingdom's share of the gold its merchant brought home (or of the units of
// one good it sold), with a legend.
export function TradeShares({ online }: { online: Online }) {
  const [measure, setMeasure] = useState<Measure>('gold')
  const slices = online.kingdoms
    .map((k) => ({ k, value: shareOf(k, measure) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  return (
    <Section title="Ticaretin hâkimleri" icon="trade" aside="başkalarınınki yaklaşık">
      <div className="measure-row" role="radiogroup" aria-label="Neye göre">
        {(['gold', ...GOODS] as Measure[]).map((m) => (
          <button key={m} role="radio" aria-checked={measure === m} className={`btn small ${measure === m ? 'active' : ''}`} onClick={() => setMeasure(m)}>
            <Icon name={m} size={16} />
            {m === 'gold' ? 'Kazanç' : RESOURCE_NAMES[m].split(' ')[0]}
          </button>
        ))}
      </div>
      {total === 0 ? (
        <Placeholder icon="trade" title="Henüz satış yok">
          Tüccarlar sattıkça burada kimin ne kadar sattığı görünür.
        </Placeholder>
      ) : (
        <div className="shares">
          <Pie slices={slices.map(({ k, value }) => ({ id: k.id, color: k.color, value }))} label="Ticaret payları" />
          <ul className="legend">
            {slices.map(({ k, value }) => (
              <li key={k.id}>
                <i style={{ background: swatchOf(k.color) }} />
                <span>{k.id === online.me ? `${k.name} (sen)` : k.name}</span>
                <b>%{Math.round((value / total) * 100)}</b>
                <small>
                  {/* The pixel font draws "~" like a minus sign, so the estimate is written out. */}
                  {k.id === online.me ? amount(value) : `yaklaşık ${amount(value)}`} {measure === 'gold' ? 'altın' : 'birim'}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

export function InnSheet({ world, index, online, kingdom, now, home, onShow, onInn, onClose }: {
  world: World
  index: number
  online: Online
  kingdom: Kingdom | null
  now: number
  onInn(inn: Point | null): void
  // The player's palace, for how far the inn is.
  home: Point | null
  onShow(tile: Point): void
  onClose(): void
}) {
  const inn = world.inns[index]
  const info = innInfo(world, index, isCaravanserai(world, inn))
  const rumours = rumoursAt(world, index, info.kind, online, now)
  const distance = home ? Math.round(Math.hypot(inn.x - home.x, inn.y - home.y)) : null
  return (
    <section className="sheet frame" aria-labelledby="inn-title">
      <header className="sheet-head">
        <Icon name="inn" size={32} />
        <div>
          <h2 id="inn-title">{info.name}</h2>
          <small>
            {INN_KIND_NAMES[info.kind]} · tarafsız{distance !== null && ` · ${distance} karo uzakta`}
          </small>
        </div>
        <button className="btn icon-only" onClick={() => onShow({ x: inn.x + 1, y: inn.y + 1 })} aria-label="Haritada göster" title="Haritada göster">
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <div className="feature">
          <span className="slot">
            <SpriteView sprite={innLook(world, inn).sprite} scale={0.5} />
          </span>
          <div>
            <b>{info.keeper}</b>
            <small className="hint">{INN_KIND_TEXT[info.kind]} Ordular yakınında moral toplar.</small>
          </div>
        </div>
        <Section title="Ticaret söylentileri" icon="scroll" aside="her oyun saati değişir">
          {rumours.length === 0 ? (
            <p className="hint">Yollar sessiz; anlatılacak bir şey yok.</p>
          ) : (
            <ul className="rumours">
              {rumours.map((r) => (
                <li key={r.text}>
                  <small>{r.teller}:</small> “{r.text}”
                </li>
              ))}
            </ul>
          )}
        </Section>
        <InnMarket world={world} index={index} online={online} kingdom={kingdom} now={now} onInn={onInn} />
        <InnReach world={world} index={index} online={online} />
        <InnBandits world={world} index={index} online={online} now={now} />
        <TradeShares online={online} />
      </div>
    </section>
  )
}

// What the innkeeper knows of the bandits on the roads round the inn (CLAUDE.md §7.9).
function InnBandits({ world, index, online, now }: { world: World; index: number; online: Online; now: number }) {
  const robbers = innBandits(world, index, online, now)
  if (robbers.roads === 0) return null
  return (
    <Section title="Yollardaki yağmacılar" icon="swords" aside={`${balance.outlaws.road.radiusTiles} karo çevre`}>
      <Stat
        label="Yağmacıların tuttuğu yol"
        value={`%${Math.round(robbers.share * 100)}`}
        tone={robbers.share > 0 ? 'down' : undefined}
        note={robbers.share > 0 ? `${robbers.names.length} çete bu yolları tutuyor` : 'yollar temiz'}
      />
      <Meter value={robbers.share} tone={robbers.share > 0 ? 'down' : 'up'} label="Yağmacıların tuttuğu yol" />
      <p className="hint">
        {robbers.share > 0
          ? `Hancı anlatıyor: buradan geçen ticaret yollarının %${Math.round(robbers.share * 100)}'ini ${robbers.names.join(', ')} tutuyor. Bu yollardan geçen tüccarlar kazancının bir kısmını kaptırıyor. Çeteye tıkla, bir orduyla takip et.`
          : 'Hancı anlatıyor: bu yollarda şimdilik yağmacı yok.'}
      </p>
    </Section>
  )
}
