import { BUILDINGS, GOODS, atFloor, balance, constructing, fortuneEffects, idleFactor, lobbyTripMs, priceAt, researchEffects, tradeLoad, tradePrice } from '@game/shared'
import type { Cost, Good, Kingdom, Market, Resource, Survey } from '@game/shared'
import { useState } from 'react'
import type React from 'react'
import { KINGDOM_COLORS, palaceIn } from '../game/buildingSprites'
import type { KingdomColor } from '../game/buildingSprites'
import { Icon } from './icons'
import { BUILDING_NAMES, RESOURCE_ICONS, RESOURCE_NAMES } from './names'
import { Meter, SpriteView, fmt, times } from './hud/primitives'

export function CostList({ cost, stock }: { cost?: Cost; stock?: Kingdom['stock'] }) {
  const entries = Object.entries(cost ?? {}) as [Resource, number][]
  if (entries.length === 0) return <span className="cost free">Ücretsiz</span>
  return (
    <span className="cost">
      {entries.map(([r, v]) => (
        <span key={r} className={stock && stock[r] < v ? 'short' : ''} title={RESOURCE_NAMES[r]} aria-label={`${v} ${RESOURCE_NAMES[r]}`}>
          <Icon name={RESOURCE_ICONS[r]} size={16} />
          {v}
        </span>
      ))}
    </span>
  )
}

// What is missing for a cost, spelt out: "Eksik: 250 savaş malzemesi (sende 0)". Nothing when it can be paid.
export function missingText(cost: Cost | undefined, stock: Kingdom['stock']) {
  const short = (Object.entries(cost ?? {}) as [Resource, number][]).filter(([r, v]) => stock[r] < v)
  if (short.length === 0) return null
  return `Eksik: ${short.map(([r, v]) => `${fmt(Math.ceil(v - stock[r]))} ${RESOURCE_NAMES[r].toLowerCase()} (sende ${fmt(Math.floor(stock[r]))})`).join(', ')}`
}

export function Missing({ cost, stock }: { cost?: Cost; stock: Kingdom['stock'] }) {
  const text = missingText(cost, stock)
  return text ? <small className="down missing">{text}</small> : null
}

// Running constructions under the top bar, so progress shows with every tab closed.
export function Constructions({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const list = constructing(kingdom, now)
  if (list.length === 0) return null
  return (
    <div className="queue frame" aria-label="İnşaatlar">
      {list.map((b) => {
        const total = (BUILDINGS[b.kind].buildSeconds ?? 1) * 1000
        const left = b.doneAt - now
        return (
          <div key={b.id} className="queue-item">
            <Icon name="build" size={16} />
            <span>{BUILDING_NAMES[b.kind]}</span>
            <Meter value={1 - left / total} label={`${BUILDING_NAMES[b.kind]} ilerleme`} segments={8} />
            <small>{Math.ceil(left / 1000)} sn</small>
          </div>
        )
      })}
    </div>
  )
}

// The goods the merchant can sell, each at the lobby's price right now (CLAUDE.md §9.7).
export function GoodChoice({
  kingdom,
  selected,
  onGood,
  market,
  now,
}: {
  kingdom: Kingdom
  selected: Good | null
  onGood: (good: Good | null) => void
  market?: Market | null
  now: number
}) {
  // A trip's load (bigger to a free city), as much of it as the stores hold, at the price the merchant is paid.
  const load = tradeLoad(kingdom)
  const bonus = (1 + researchEffects(kingdom, now).trade + fortuneEffects(kingdom, now).trade) * idleFactor(kingdom, now)
  const idle = selected === null && !!kingdom.trade.idle
  return (
    <div className="goods" role="radiogroup" aria-label="Satılacak mal">
      {GOODS.map((good) => {
        const price = tradePrice(kingdom, good, market, now)
        const base = balance.economy.trade.price[good]
        const units = Math.min(load, Math.floor(kingdom.stock[good]))
        return (
          <button key={good} role="radio" aria-checked={good === selected} className={good === selected ? 'good active' : 'good'} onClick={() => onGood(good)}>
            <Icon name={RESOURCE_ICONS[good]} size={24} />
            <b>{RESOURCE_NAMES[good]}</b>
            <small>Stok {fmt(kingdom.stock[good])}</small>
            <small className={price < base * 0.98 ? 'down' : price > base * 1.02 ? 'up' : undefined}>
              Birimi {price.toFixed(2).replace('.', ',')} altın{atFloor(priceAt(market, good, now), good) ? ' · dipte' : ''}
            </small>
            <small className="up">
              +{Math.round(units * price * bonus)} <Icon name="gold" size={8} /> / sefer ({units} birim)
            </small>
          </button>
        )
      })}
      <button role="radio" aria-checked={idle} className={idle ? 'good none active' : 'good none'} onClick={() => onGood(null)}>
        <Icon name="close" size={16} />
        <b>Hiçbir şey satma</b>
        <small>Tüccar evde bekler, stoklar korunur</small>
      </button>
    </div>
  )
}

// Shown as soon as the trade post stands: the merchant waits until a good is chosen.
export function GoodPicker({ kingdom, onGood, market, now }: { kingdom: Kingdom; onGood: (good: Good | null) => void; market?: Market | null; now: number }) {
  return (
    <div className="modal">
      <div className="dialog frame" role="dialog" aria-modal="true" aria-labelledby="good-picker-title">
        <header className="sheet-head">
          <Icon name="trade" size={32} />
          <div>
            <h2 id="good-picker-title">Ticaret noktan kuruldu</h2>
            <small>Her şey parayla başlar</small>
          </div>
        </header>
        <p className="hint">
          Tüccarın hangi malı satsın? Her {Math.round(lobbyTripMs(kingdom.buildings) / 1000)} saniyede bir seçtiğin maldan götürüp altın
          getirir. Sonradan Ticaret sekmesinden değiştirebilirsin.
        </p>
        <GoodChoice kingdom={kingdom} selected={null} onGood={onGood} market={market} now={now} />
      </div>
    </div>
  )
}

const LAND: [keyof Omit<Survey, 'yields'>, string][] = [
  ['water', 'Nehir / göl'],
  ['grass', 'Çayır'],
  ['forest', 'Orman'],
  ['mountain', 'Dağ'],
  ['swamp', 'Bataklık'],
  ['desert', 'Kurak'],
]

const WHY: Record<Good, string> = {
  food: 'Balık ve tarla: nehir, göl ve çayır',
  materials: 'Kereste: orman',
  arms: 'Maden: dağ',
}

const NAME_MAX = 24
// Place names in the manner of Ulupınar, Gökova, Altınova: a first word (a colour, a metal, a beast, a quality) and a
// feature of the land. Any first word goes with any feature, so there are some thousands of names; a few that came
// out awkward are left out.
const NAME_HEADS = [
  'Ak', 'Kara', 'Gök', 'Demir', 'Ulu', 'Kızıl', 'Yeşil', 'Altın', 'Kartal', 'Sarı', 'Ay', 'Boz', 'Gümüş', 'Bakır', 'Mavi',
  'Kır', 'Al', 'Yıldız', 'Güneş', 'Şahin', 'Doğan', 'Ceylan', 'Geyik', 'Aslan', 'Kurt', 'Kaplan', 'Turna', 'Bülbül',
  'Elma', 'Çınar', 'Meşe', 'Söğüt', 'Kavak', 'Ardıç', 'Lale', 'Gül', 'Menekşe', 'Nergis', 'Sedef', 'Mercan', 'İnci',
  'Yakut', 'Zümrüt', 'Firuze', 'Tunç', 'Çelik', 'Kaya', 'Taş', 'Bulut', 'Rüzgar', 'Yel', 'Şimşek', 'Ilık', 'Serin',
  'Derin', 'Uzun', 'Yüce', 'Eski', 'Yeni', 'Bey', 'Han', 'Hatun', 'Tekin', 'Bayram', 'Sultan', 'Erguvan', 'Safran',
]
const NAME_TAILS = [
  'pınar', 'ova', 'dere', 'su', 'kaya', 'ırmak', 'yurt', 'tepe', 'çam', 'kale', 'köy', 'yaka', 'bel', 'göl', 'yazı',
  'bük', 'çay', 'dağ', 'kent', 'hisar', 'alan', 'yayla', 'koru', 'kum', 'kuyu', 'çeşme', 'bağ', 'bahçe', 'eli',
  'oba', 'kır', 'konak', 'burun', 'ada', 'pınarı', 'suyu', 'ırmağı', 'bayır', 'taş',
]
// Pairs that read badly as one word.
const NAME_SKIP = new Set(['Taştaş', 'Kayakaya', 'Kırkır', 'Kayataş', 'Taşkaya', 'Hanhan', 'Alalan', 'Akak'])
// A lord's lands, never a kingdom: the two crown kingdoms are the only kingdoms (CLAUDE.md §7.8).
const NAME_KINDS = ['Beyliği', 'Diyarı', 'Hanedanı', 'Sancağı', 'Yurdu', 'Malikânesi', 'Lordluğu', 'Hisarı']
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
// A name to start from, unlike any the lobby's other kingdoms already carry; the player may type their own.
const suggestName = (taken: ReadonlySet<string> = new Set()) => {
  const used = new Set([...taken].map((n) => n.split(' ')[0].toLocaleLowerCase('tr-TR')))
  for (let tries = 0; ; tries++) {
    const root = pick(NAME_HEADS) + pick(NAME_TAILS)
    if (NAME_SKIP.has(root) || (used.has(root.toLocaleLowerCase('tr-TR')) && tries < 50)) continue
    const name = `${root} ${pick(NAME_KINDS)}`
    if (name.length <= NAME_MAX) return name
  }
}

// Before founding: the sites the player was given, side by side, with what the land around each would yield; the
// player picks one of them.
export function SitePicker({
  surveys,
  selected,
  onSelect,
  onFound,
  colors,
  taken,
  names = [],
}: {
  surveys: Survey[]
  selected: number
  onSelect: (index: number) => void
  onFound: (name: string, color: KingdomColor) => void
  // The lobby's colours, and those other kingdoms already fly.
  colors: KingdomColor[]
  taken: ReadonlySet<string>
  // The names the lobby's other kingdoms carry: a suggested name is never one of them.
  names?: string[]
}) {
  const [name, setName] = useState(() => suggestName(new Set(names)))
  const [chosen, setColor] = useState<KingdomColor | null>(null)
  // The first free colour until the player picks one; a colour taken meanwhile falls back to a free one.
  const free = colors.filter((c) => !taken.has(c))
  const color = chosen && !taken.has(chosen) ? chosen : (free[0] ?? null)
  const trimmed = name.trim()
  const survey = surveys[selected] ?? null
  return (
    <section className="dialog site-picker frame" aria-labelledby="site-title">
      <header className="sheet-head">
        <Icon name="crown" size={32} />
        <div>
          <h2 id="site-title">Lordluğunu nereye kuracaksın?</h2>
          <small>Arazi, üretim çarpanlarını belirler</small>
        </div>
      </header>
      {surveys.length === 0 ? (
        <p className="hint">Uygun yerler aranıyor…</p>
      ) : (
        <>
          <p className="hint">Sana {surveys.length} yer gösterildi; birini seç. Seçtiğin yer haritada görünür.</p>
          <div className="site-cards" role="radiogroup" aria-label="Keşfedilen yerler">
            {surveys.map((s, i) => (
              <button key={i} role="radio" aria-checked={i === selected} className={i === selected ? 'site-card active' : 'site-card'} onClick={() => onSelect(i)}>
                <b>{i + 1}. yer</b>
                {GOODS.map((good) => (
                  <span key={good} className="site-yield" title={WHY[good]}>
                    <Icon name={RESOURCE_ICONS[good]} size={16} />
                    <Meter value={s.yields[good] / balance.economy.yield.max} tone={s.yields[good] >= 1 ? 'up' : 'down'} label={`${RESOURCE_NAMES[good]} çarpanı`} segments={6} />
                    <b className={s.yields[good] >= 1 ? 'up' : 'down'}>{times(s.yields[good])}</b>
                  </span>
                ))}
                <small>
                  {LAND.filter(([k]) => s[k] >= 0.05)
                    .map(([k, name]) => `${name} %${Math.round(s[k] * 100)}`)
                    .join(' · ')}
                </small>
              </button>
            ))}
          </div>
          <p className="hint site-why">Nehir ve çayır yemeği, orman yapı malzemesini, dağ savaş malzemesini artırır; bataklık hepsini biraz düşürür.</p>
        </>
      )}
      <label className="name-field">
        <span>Lordluğunun adı</span>
        <span className="name-row">
          <input
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && survey && trimmed && color && onFound(trimmed, color)}
            placeholder="Ör. Akdere Beyliği"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="btn icon-only" onClick={() => setName(suggestName(new Set(names)))} aria-label="Rastgele ad öner" title="Rastgele ad öner">
            <Icon name="crown" size={16} />
          </button>
        </span>
      </label>
      <div className="color-field">
        <span>Lordluğunun rengi</span>
        <div className="color-row">
          <div className="swatches" role="radiogroup" aria-label="Lordluk rengi">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={taken.has(c) ? `${KINGDOM_COLORS[c].name} (alınmış)` : KINGDOM_COLORS[c].name}
                title={taken.has(c) ? `${KINGDOM_COLORS[c].name} — başka bir lordun` : KINGDOM_COLORS[c].name}
                className={c === color ? 'swatch active' : 'swatch'}
                style={{ '--swatch': KINGDOM_COLORS[c].swatch } as React.CSSProperties}
                disabled={taken.has(c)}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <span className="slot palace-preview">
            {color && <SpriteView sprite={palaceIn(color)} scale={0.25} label={`${KINGDOM_COLORS[color].name} saray`} />}
          </span>
        </div>
      </div>
      <button className="btn primary wide" disabled={!survey || !trimmed || !color} onClick={() => color && onFound(trimmed, color)}>
        <Icon name="crown" size={16} /> Burada kur
      </button>
    </section>
  )
}
