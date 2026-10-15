import { basePrice, hash, priceAt } from '@game/shared'
import type { Good, Market, Point, World } from '@game/shared'
import { useState } from 'react'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import { INN_KIND_NAMES, INN_KIND_TEXT, innInfo } from '../../game/innInfo'
import type { InnKind } from '../../game/innInfo'
import { innLook, isCaravanserai } from '../../game/innSprites'
import { Icon } from '../icons'
import { RESOURCE_NAMES } from '../names'
import type { KingdomInfo, Online } from './online'
import { Placeholder, Section, SpriteView } from './primitives'

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

// The talk at an inn now: a few things true of the lobby, chosen by the inn's trade and changing with the game hour.
export function rumoursAt(world: World, index: number, kind: InnKind, online: Online, now: number): Rumour[] {
  const market: Market | null = online.market
  const inn = world.inns[index]
  const kingdoms = online.kingdoms
  const named = (id: number) => kingdoms.find((k) => k.id === id)?.name ?? 'bilinmeyen bir lord'
  const prices: string[] = []
  for (const good of GOODS) {
    const ratio = priceAt(market, good, now) / basePrice(good)
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
    .filter((k) => k.id !== online.me)
    .map((k) => ({ k, d: Math.round(Math.hypot(k.site.x - inn.x, k.site.y - inn.y)) }))
    .sort((a, b) => a.d - b.d)[0]
  const local = near ? [`Buraya en yakın saray ${near.k.name} sarayı, ${near.d} karo ötede; ${near.k.palace}. seviye.`] : []
  // Each inn hears most about its own trade.
  const pools: Record<InnKind, string[][]> = {
    market: [prices, sellers, carrying, local],
    toll: [carrying, idle, sellers, local],
    post: [roads, trouble, carrying, local],
    inn: [local, trouble, sellers, prices, roads],
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

// A pie of who rules the lobby's trade: each kingdom's share of the gold its merchant brought home (or of the units of
// one good it sold), with a legend.
export function TradeShares({ online }: { online: Online }) {
  const [measure, setMeasure] = useState<Measure>('gold')
  const slices = online.kingdoms
    .map((k) => ({ k, value: shareOf(k, measure) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  let turn = -0.25
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
          <svg viewBox="-1.1 -1.1 2.2 2.2" className="pie" role="img" aria-label="Ticaret payları">
            {slices.length === 1 ? (
              <circle r="1" fill={swatchOf(slices[0].k.color)} />
            ) : (
              slices.map(({ k, value }) => {
                const from = turn
                turn += value / total
                const a0 = from * Math.PI * 2
                const a1 = turn * Math.PI * 2
                const large = a1 - a0 > Math.PI ? 1 : 0
                const d = `M0 0 L${Math.cos(a0)} ${Math.sin(a0)} A1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`
                return <path key={k.id} d={d} fill={swatchOf(k.color)} stroke="var(--ink)" strokeWidth="0.03" />
              })
            )}
          </svg>
          <ul className="legend">
            {slices.map(({ k, value }) => (
              <li key={k.id}>
                <i style={{ background: swatchOf(k.color) }} />
                <span>{k.id === online.me ? `${k.name} (sen)` : k.name}</span>
                <b>%{Math.round((value / total) * 100)}</b>
                <small>
                  {k.id === online.me ? Math.round(value) : amount(value)} {measure === 'gold' ? 'altın' : 'birim'}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

export function InnSheet({ world, index, online, now, home, onShow, onClose }: {
  world: World
  index: number
  online: Online
  now: number
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
        <TradeShares online={online} />
      </div>
    </section>
  )
}
