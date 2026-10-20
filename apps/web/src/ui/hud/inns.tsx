import { balance, bandsOf, basePrice, boatsOf, canTradeAt, hash, innPrice, innPulls, innSaturation, innShareFactor, innSpec, innStats, outlawUp, priceAt, roadHeld, stewardFactor, tradeCityReadyAt, tradeInnError } from '@game/shared'
import type { Good, Kingdom, Market, Point, World } from '@game/shared'
import { useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { INN_KIND_NAMES, INN_KIND_TEXT, innInfo } from '../../game/innInfo'
import type { InnKind } from '../../game/innInfo'
import { innLook, isCaravanserai } from '../../game/innSprites'
import { L } from '../../lib/i18n'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { KingdomInfo, Online } from './online'
import { Meter, Placeholder, Section, SpriteView, Stat } from './primitives'
import { NameNote } from '../NameNote'

// The inns of the trade routes (CLAUDE.md §7.6): the talk of travellers about the lobby's trade, drawn from what every
// player can know (prices, the rounded trade shares, wars, raided trade posts, armies on the road), and the trade
// shares as a pie.

const GOODS: Good[] = ['food', 'materials', 'arms']
const GOOD_WORDS: Record<Good, string> = { food: L('yemek', 'food'), materials: L('yapı malzemesi', 'building materials'), arms: L('savaş malzemesi', 'war materials') }

export const swatchOf = (color: string | null | undefined) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'

// What the trade shares are counted in: the gold the merchants brought home, or the units of one good.
type Measure = 'gold' | Good

const shareOf = (k: KingdomInfo, measure: Measure) => k.tradeLedger?.[measure] ?? 0

// Others' totals come rounded (the heading says so); no mark of their own, as the digits' font draws ~ like a minus.
const amount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', L(',', '.'))}K` : `${Math.round(n)}`)

export interface Rumour {
  text: string
  // Who tells it.
  teller: string
}

const TELLERS = [
  L('Bir deveci', 'A camel driver'),
  L('Yorgun bir tüccar', 'A weary merchant'),
  L('Hancı', 'The innkeeper'),
  L('Bir ulak', 'A courier'),
  L('Kervanbaşı', 'The caravan master'),
  L('Bir hacı', 'A pilgrim'),
  L('Gezgin bir çalgıcı', 'A wandering minstrel'),
  L('Muhafızlardan biri', 'One of the guards'),
  L('Bir kumaşçı', 'A cloth merchant'),
  L('Yaşlı bir yolcu', 'An old traveller'),
]

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
  const named = (id: number) => kingdoms.find((k) => k.id === id)?.name ?? L('bilinmeyen bir lord', 'an unknown lord')
  const prices: string[] = []
  for (const good of GOODS) {
    const ratio = priceAt(market, good, now) / basePrice(good, market)
    if (ratio < 0.85) prices.push(L(`Pazarlarda ${GOOD_WORDS[good]} bolluğu var; fiyatı düştü, satan az kazanıyor.`, `The markets are awash with ${GOOD_WORDS[good]}; the price has fallen and sellers earn little.`))
    else if (ratio > 1.15) prices.push(L(`${RESOURCE_NAMES[good]} kıt; alıcılar fiyatı yükseltti, elinde olan şimdi satmalı.`, `${RESOURCE_NAMES[good]} ${good === 'food' ? 'is' : 'are'} scarce; buyers have driven the price up, so whoever has some should sell now.`))
    else if (kind === 'market') prices.push(L(`${RESOURCE_NAMES[good]} fiyatı yerinde sayıyor.`, `The price of ${GOOD_WORDS[good]} is holding steady.`))
  }
  const sellers: string[] = []
  for (const good of GOODS) {
    const top = kingdoms.filter((k) => shareOf(k, good) > 0).sort((a, b) => shareOf(b, good) - shareOf(a, good))[0]
    if (top) sellers.push(L(`En çok ${GOOD_WORDS[good]} satan ${top.name}; bu mevsim ${amount(shareOf(top, good))} birim.`, `${top.name} sells the most ${GOOD_WORDS[good]}; ${amount(shareOf(top, good))} units this season.`))
  }
  const richest = kingdoms.filter((k) => shareOf(k, 'gold') > 0).sort((a, b) => shareOf(b, 'gold') - shareOf(a, 'gold'))[0]
  if (richest) sellers.push(L(`Ticaretten en çok altını ${richest.name} topladı, ${amount(shareOf(richest, 'gold'))} kadar.`, `${richest.name} has made the most gold from trade, some ${amount(shareOf(richest, 'gold'))}.`))
  const carrying = kingdoms
    .filter((k) => k.id !== online.me && k.tradeGood && !k.tradeDamaged)
    .map((k) => L(`${k.name} kervanları şu sıralar ${GOOD_WORDS[k.tradeGood!]} taşıyor.`, `${k.name}'s caravans are carrying ${GOOD_WORDS[k.tradeGood!]} these days.`))
  const idle = kingdoms.filter((k) => k.id !== online.me && k.tradeGood === null && !k.tradeDamaged).map((k) => L(`${k.name} tüccarı evde oturuyor; yollarda görünmüyor.`, `${k.name}'s merchant is sitting at home; not seen on the roads.`))
  const trouble = [
    ...kingdoms.filter((k) => k.tradeDamaged).map((k) => L(`${k.name} ticaret noktası yağmalandı; onarılana dek tüccarı satış yapamaz.`, `${k.name}'s trading post was raided; its merchant cannot sell until it is repaired.`)),
    ...online.pacts
      .filter((p) => p.kind === 'war' && !p.ended_at)
      .map((p) => L(`${named(p.from_id)} ile ${named(p.to_id)} savaşta; o yollarda kervanlar tedirgin.`, `${named(p.from_id)} and ${named(p.to_id)} are at war; caravans on those roads are uneasy.`)),
  ]
  const marching = new Map<number, number>()
  for (const a of online.armies) if (a.status !== 'idle') marching.set(a.kingdom_id, (marching.get(a.kingdom_id) ?? 0) + 1)
  const roads = [...marching].filter(([id]) => id !== online.me).map(([id, n]) => L(`${named(id)} lordunun ${n > 1 ? `${n} ordusu` : 'bir ordusu'} yolda.`, `${n > 1 ? `${n} armies` : 'An army'} of ${named(id)} ${n > 1 ? 'are' : 'is'} on the road.`))
  const near = kingdoms
    .map((k) => ({ k, d: Math.round(Math.hypot(palaceOf(k).x - inn.x, palaceOf(k).y - inn.y)) }))
    .sort((a, b) => a.d - b.d)[0]
  const local = near
    ? [
        near.k.id === online.me
          ? L(`Buraya en yakın saray senin sarayın, ${near.d} karo ötede.`, `The nearest palace to here is yours, ${near.d} tiles away.`)
          : L(`Buraya en yakın saray ${near.k.name} sarayı, ${near.d} karo ötede; ${near.k.palace}. seviye.`, `The nearest palace to here is ${near.k.name}'s, ${near.d} tiles away; level ${near.k.palace}.`),
      ]
    : []
  // The bandits on the roads round the inn, and on the player's own road; the pirates on the water.
  const robbers = innBandits(world, index, online, now)
  const mine = kingdoms.find((k) => k.id === online.me)
  const myRoad = online.kingdoms.length && mine ? Math.hypot(mine.site.x - inn.x, mine.site.y - inn.y) : Infinity
  const pirates = boatsOf(world, world.seed, online.outlaws).filter((b) => outlawUp(b, now)).length
  const bandits = [
    robbers.share > 0
      ? L(`Bu handan çıkan yolların %${Math.round(robbers.share * 100)}'i yağmacıların elinde; ${robbers.names.join(', ')} kervanları soyuyor.`, `${Math.round(robbers.share * 100)}% of the roads out of this inn are in bandit hands; ${robbers.names.join(', ')} rob the caravans.`)
      : robbers.roads > 0
        ? L('Buralarda yağmacı duyulmadı; yollar temiz, kervanlar rahat.', 'No bandits heard of round here; the roads are clear and the caravans at ease.')
        : '',
    ...(myRoad < 160 && robbers.share > 0 ? [L(`${mine!.name} tüccarı da bu yollardan geçiyor; yağmacılar onun kazancından da pay alıyor.`, `${mine!.name}'s merchant uses these roads too; the bandits take a cut of his earnings as well.`)] : []),
    ...(pirates > 0 ? [L(`Göllerde ve nehirlerde ${pirates} korsan teknesi dolaşıyor; kara yelkeni gören iskeleye kaçıyor.`, `${pirates} pirate boat${pirates === 1 ? '' : 's'} roam the lakes and rivers; whoever spots a black sail runs for the dock.`)] : []),
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

const times = (f: number) => `×${f.toFixed(2).replace('.', L(',', '.'))}`

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
    innPost: L('Önce bir ticaret noktası kur', 'Build a trading post first'),
    innLevel: L(`Ticaret noktan ${s.minLevel + 1}. seviye olmalı`, `Your trading post must be level ${s.minLevel + 1}`),
    innWait: L(`Tüccarın yolu az önce değişti; ${wait} sn sonra`, `The merchant's route just changed; in ${wait} s`),
    innFar: L(`Bu hanın pastasında payın %${Math.round(s.minShare * 100)}'ten az; yakınında bir kasaba al`, `Your share of this inn's pie is under ${Math.round(s.minShare * 100)}%; take a town near it`),
  }
  const rich = (Object.values(stats) as number[]).reduce((a, b) => a + b, 0) / 3
  return (
    <Section title={L('Hanın fiyatları', 'The inn\'s prices')} icon="gold" aside={rich >= 1.15 ? L('cömert han', 'generous inn') : rich <= 0.85 ? L('ölü han', 'stingy inn') : L('olağan han', 'ordinary inn')}>
      <ul className="inn-prices">
        {GOODS.map((good) => {
          const sat = innSaturation(market, inn, good, now)
          return (
            <li key={good}>
              <Icon name={good} size={16} />
              <span>{RESOURCE_NAMES[good]}</span>
              <b className={stats[good] >= 1.1 ? 'up' : stats[good] <= 0.9 ? 'down' : undefined}>{times(stats[good])}</b>
              <small>
                {sat < 0.98 ? L(`satıldıkça düştü ${times(sat)}`, `worn down by sales ${times(sat)}`) : L('pazarı taze', 'fresh market')}
                {kingdom && canTradeAt(share) && L(` · sana birimi ${innUnitPrice(world, index, kingdom, share, good, market, now).toFixed(2).replace('.', ',')} altın`, ` · ${innUnitPrice(world, index, kingdom, share, good, market, now).toFixed(2)} gold a unit to you`)}
              </small>
            </li>
          )
        })}
      </ul>
      <Stat
        label={L('Senin payın', 'Your share')}
        value={L(`%${Math.round(share * 100)}`, `${Math.round(share * 100)}%`)}
        tone={canTradeAt(share) ? 'up' : 'down'}
        note={canTradeAt(share) ? L(`fiyata ${times(innShareFactor(share))}`, `price ${times(innShareFactor(share))}`) : L(`en az %${Math.round(s.minShare * 100)} gerekir`, `at least ${Math.round(s.minShare * 100)}% needed`)}
      />
      {here ? (
        <button className="btn" disabled={wait > 0} data-why={why.innWait} onClick={() => onInn(null)}>
          {L('Tüccar burada · lobi pazarına döndür', 'Your merchant trades here · send him back to the lobby market')}
        </button>
      ) : (
        <button className="btn" disabled={!!error} data-why={error ? why[error] : undefined} onClick={() => onInn({ x: inn.x, y: inn.y })}>
          {L('Tüccarı bu hana gönder', 'Send the merchant to this inn')}
        </button>
      )}
      <p className="hint">
        {L(
          `Hancı anlatıyor: her han her mala kendi fiyatını verir (lobi fiyatı × hanın çarpanı). Payın büyüdükçe sana daha iyi davranır (${times(s.shareLow)} ile ${times(s.shareHigh)} arası). Çok satılan malın burada fiyatı düşer, zamanla toparlanır. Sefer lobi pazarınınki kadar sürer.`,
          `The innkeeper explains: every inn sets its own price for each good (lobby price × the inn's factor). The bigger your share, the better it treats you (between ${times(s.shareLow)} and ${times(s.shareHigh)}). A good sold heavily drops in price here and recovers over time. A trip takes as long as one to the lobby market.`,
        )}
      </p>
    </Section>
  )
}

// The lords this inn trades with, by how near their palaces and towns are (CLAUDE.md §7.6).
function InnReach({ world, index, online }: { world: World; index: number; online: Online }) {
  const slices = innReach(world, index, online)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  return (
    <Section title={L('Han kiminle ticarette', 'Who the inn trades with')} icon="trade" aside={L(`${innSpec().reachTiles} karo çevre`, `${innSpec().reachTiles} tile radius`)}>
      {total === 0 ? (
        <p className="hint">{L('Hiçbir lordun sarayı ya da kasabası bu hana yakın değil; kervanlar yalnızca gelip geçiyor. Yakınında bir kasaba alan lord burada ticaret yapabilir.', 'No lord\'s palace or town is near this inn; caravans just pass through. A lord who takes a town nearby can trade here.')}</p>
      ) : (
        <>
          <div className="shares">
            <Pie slices={slices.map(({ k, value }) => ({ id: k.id, color: k.color, value }))} label={L('Hana yakınlık payları', 'Shares by nearness to the inn')} />
            <ul className="legend">
              {slices.map(({ k, value, towns, distance: d }) => (
                <li key={k.id}>
                  <i style={{ background: swatchOf(k.color) }} />
                  <span>{k.id === online.me ? L(`${k.name} (sen)`, `${k.name} (you)`) : k.name}</span>
                  <b>{L(`%${Math.round((value / total) * 100)}`, `${Math.round((value / total) * 100)}%`)}</b>
                  <small>
                    {L(`saray ${d} karo`, `palace ${d} tiles`)}
                    {towns > 0 && L(` · ${towns} kasaba`, ` · ${towns} town${towns === 1 ? '' : 's'}`)}
                  </small>
                </li>
              ))}
            </ul>
          </div>
          <p className="hint">{L('Hancı anlatıyor: buraya kimin sarayı ve kasabaları yakınsa kervanları onunla alışveriş eder. Yakın kasabalar da lordun payına katılır; payı küçük olan lordun tüccarı burada iş yapamaz.', 'The innkeeper explains: the caravans deal with whoever\'s palace and towns are near. Nearby towns add to a lord\'s share; a lord with too small a share cannot trade here.')}</p>
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
    <Section title={L('Ticaretin hâkimleri', 'Masters of trade')} icon="trade" aside={L('başkalarınınki yaklaşık', 'others\' are approximate')}>
      <div className="measure-row" role="radiogroup" aria-label={L('Neye göre', 'Measured by')}>
        {(['gold', ...GOODS] as Measure[]).map((m) => (
          <button key={m} role="radio" aria-checked={measure === m} className={`btn small ${measure === m ? 'active' : ''}`} onClick={() => setMeasure(m)}>
            <Icon name={m} size={16} />
            {m === 'gold' ? L('Kazanç', 'Earnings') : L(RESOURCE_NAMES[m].split(' ')[0], RESOURCE_NAMES[m].replace(' materials', ''))}
          </button>
        ))}
      </div>
      {total === 0 ? (
        <Placeholder icon="trade" title={L('Henüz satış yok', 'No sales yet')}>
          {L('Tüccarlar sattıkça burada kimin ne kadar sattığı görünür.', 'As merchants sell, who sold how much shows up here.')}
        </Placeholder>
      ) : (
        <div className="shares">
          <Pie slices={slices.map(({ k, value }) => ({ id: k.id, color: k.color, value }))} label={L('Ticaret payları', 'Trade shares')} />
          <ul className="legend">
            {slices.map(({ k, value }) => (
              <li key={k.id}>
                <i style={{ background: swatchOf(k.color) }} />
                <span>{k.id === online.me ? L(`${k.name} (sen)`, `${k.name} (you)`) : k.name}</span>
                <b>{L(`%${Math.round((value / total) * 100)}`, `${Math.round((value / total) * 100)}%`)}</b>
                <small>
                  {/* The pixel font draws "~" like a minus sign, so the estimate is written out. */}
                  {k.id === online.me ? amount(value) : L(`yaklaşık ${amount(value)}`, `about ${amount(value)}`)} {measure === 'gold' ? L('altın', 'gold') : L('birim', 'units')}
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
          <NameNote name={info.name} />
          <small>
            {INN_KIND_NAMES[info.kind]} · {L('tarafsız', 'neutral')}
            {distance !== null && L(` · ${distance} karo uzakta`, ` · ${distance} tiles away`)}
          </small>
        </div>
        <button className="btn icon-only" onClick={() => onShow({ x: inn.x + 1, y: inn.y + 1 })} aria-label={L('Haritada göster', 'Show on map')} title={L('Haritada göster', 'Show on map')}>
          <Icon name="pin" size={16} />
        </button>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
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
            <small className="hint">
              {INN_KIND_TEXT[info.kind]} {L('Ordular yakınında moral toplar.', 'Armies nearby regain morale.')}
            </small>
          </div>
        </div>
        <Section title={L('Ticaret söylentileri', 'Trade rumours')} icon="scroll" aside={L('her oyun saati değişir', 'changes every game hour')}>
          {rumours.length === 0 ? (
            <p className="hint">{L('Yollar sessiz; anlatılacak bir şey yok.', 'The roads are quiet; nothing to tell.')}</p>
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
    <Section title={L('Yollardaki yağmacılar', 'Bandits on the roads')} icon="swords" aside={L(`${balance.outlaws.road.radiusTiles} karo çevre`, `${balance.outlaws.road.radiusTiles} tile radius`)}>
      <Stat
        label={L('Yağmacıların tuttuğu yol', 'Road held by bandits')}
        value={L(`%${Math.round(robbers.share * 100)}`, `${Math.round(robbers.share * 100)}%`)}
        tone={robbers.share > 0 ? 'down' : undefined}
        note={robbers.share > 0 ? L(`${robbers.names.length} çete bu yolları tutuyor`, `${robbers.names.length} band${robbers.names.length === 1 ? '' : 's'} hold these roads`) : L('yollar temiz', 'roads clear')}
      />
      <Meter value={robbers.share} tone={robbers.share > 0 ? 'down' : 'up'} label={L('Yağmacıların tuttuğu yol', 'Road held by bandits')} />
      <p className="hint">
        {robbers.share > 0
          ? L(
              `Hancı anlatıyor: buradan geçen ticaret yollarının %${Math.round(robbers.share * 100)}'ini ${robbers.names.join(', ')} tutuyor. Bu yollardan geçen tüccarlar kazancının bir kısmını kaptırıyor. Çeteye tıkla, bir orduyla takip et.`,
              `The innkeeper explains: ${robbers.names.join(', ')} hold ${Math.round(robbers.share * 100)}% of the trade roads through here. Merchants on these roads lose part of their earnings. Click a band and chase it with an army.`,
            )
          : L('Hancı anlatıyor: bu yollarda şimdilik yağmacı yok.', 'The innkeeper explains: no bandits on these roads for now.')}
      </p>
    </Section>
  )
}
