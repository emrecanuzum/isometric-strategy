import { BUILDINGS, GOODS, balance, constructing, priceAt, tradeUnits } from '@game/shared'
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
  const units = tradeUnits(kingdom)
  const idle = selected === null && !!kingdom.trade.idle
  return (
    <div className="goods" role="radiogroup" aria-label="Satılacak mal">
      {GOODS.map((good) => {
        const price = priceAt(market, good, now)
        const base = balance.economy.trade.price[good]
        return (
          <button key={good} role="radio" aria-checked={good === selected} className={good === selected ? 'good active' : 'good'} onClick={() => onGood(good)}>
            <Icon name={RESOURCE_ICONS[good]} size={24} />
            <b>{RESOURCE_NAMES[good]}</b>
            <small>Stok {fmt(kingdom.stock[good])}</small>
            <small className={price < base * 0.98 ? 'down' : price > base * 1.02 ? 'up' : undefined}>
              Birimi {price.toFixed(2).replace('.', ',')} altın
            </small>
            <small className="up">
              +{Math.round(units * price)} <Icon name="gold" size={8} /> / sefer
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
          Tüccarın hangi malı satsın? Her {balance.economy.trade.tripSeconds} saniyede bir seçtiğin maldan götürüp altın
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
const NAME_ROOTS = ['Akdere', 'Karasu', 'Gökova', 'Demirkaya', 'Ulupınar', 'Kızılırmak', 'Yeşilyurt', 'Altınova', 'Kartaltepe', 'Sarıçam', 'Aydoğdu', 'Bozkurt']
const NAME_KINDS = ['Krallığı', 'Beyliği', 'Diyarı', 'Hanedanı']
// A name to start from; the player may type their own.
const suggestName = () =>
  `${NAME_ROOTS[Math.floor(Math.random() * NAME_ROOTS.length)]} ${NAME_KINDS[Math.floor(Math.random() * NAME_KINDS.length)]}`

// Before founding: the land around the assigned site and what it would yield; the player may look at a few sites.
export function SitePicker({
  survey,
  seen,
  selected,
  rollsLeft,
  onSelect,
  onRoll,
  onFound,
  colors,
  taken,
}: {
  survey: Survey | null
  seen: number
  selected: number
  rollsLeft: number
  onSelect: (index: number) => void
  onRoll: () => void
  onFound: (name: string, color: KingdomColor) => void
  // The lobby's colours, and those other kingdoms already fly.
  colors: KingdomColor[]
  taken: ReadonlySet<string>
}) {
  const [name, setName] = useState(suggestName)
  const [chosen, setColor] = useState<KingdomColor | null>(null)
  // The first free colour until the player picks one; a colour taken meanwhile falls back to a free one.
  const free = colors.filter((c) => !taken.has(c))
  const color = chosen && !taken.has(chosen) ? chosen : (free[0] ?? null)
  const trimmed = name.trim()
  return (
    <section className="dialog site-picker frame" aria-labelledby="site-title">
      <header className="sheet-head">
        <Icon name="crown" size={32} />
        <div>
          <h2 id="site-title">Krallığını nereye kuracaksın?</h2>
          <small>Arazi, üretim çarpanlarını belirler</small>
        </div>
      </header>
      <div className="segmented" role="radiogroup" aria-label="Keşfedilen yerler">
        {Array.from({ length: seen }, (_, i) => (
          <button key={i} role="radio" aria-checked={i === selected} className={i === selected ? 'btn small active' : 'btn small'} onClick={() => onSelect(i)}>
            Yer {i + 1}
          </button>
        ))}
        <button className="btn small" disabled={rollsLeft === 0} onClick={onRoll}>
          Yeni yer keşfet <small>({rollsLeft} hak)</small>
        </button>
      </div>
      {survey ? (
        <>
          <div className="yields">
            {GOODS.map((good) => (
              <div key={good} className="yield" title={WHY[good]}>
                <Icon name={RESOURCE_ICONS[good]} size={24} />
                <span>{RESOURCE_NAMES[good]}</span>
                <Meter
                  value={survey.yields[good] / balance.economy.yield.max}
                  tone={survey.yields[good] >= 1 ? 'up' : 'down'}
                  label={`${RESOURCE_NAMES[good]} çarpanı`}
                  segments={10}
                />
                <b className={survey.yields[good] >= 1 ? 'up' : 'down'}>{times(survey.yields[good])}</b>
              </div>
            ))}
          </div>
          <p className="hint">
            {LAND.filter(([k]) => survey[k] >= 0.01)
              .map(([k, name]) => `${name} %${Math.round(survey[k] * 100)}`)
              .join(' · ')}
          </p>
          <p className="hint">Nehir ve çayır yemeği, orman yapı malzemesini, dağ savaş malzemesini artırır; bataklık hepsini biraz düşürür.</p>
        </>
      ) : (
        <p className="hint">Uygun yer aranıyor…</p>
      )}
      <label className="name-field">
        <span>Krallığının adı</span>
        <span className="name-row">
          <input
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && survey && trimmed && color && onFound(trimmed, color)}
            placeholder="Ör. Akdere Krallığı"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="btn icon-only" onClick={() => setName(suggestName())} aria-label="Rastgele ad öner" title="Rastgele ad öner">
            <Icon name="crown" size={16} />
          </button>
        </span>
      </label>
      <div className="color-field">
        <span>Krallığının rengi</span>
        <div className="color-row">
          <div className="swatches" role="radiogroup" aria-label="Krallık rengi">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={taken.has(c) ? `${KINGDOM_COLORS[c].name} (alınmış)` : KINGDOM_COLORS[c].name}
                title={taken.has(c) ? `${KINGDOM_COLORS[c].name} — başka bir krallığın` : KINGDOM_COLORS[c].name}
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
