import { BUILDINGS, GOODS, atFloor, balance, basePrice, constructing, fortuneEffects, guildOf, idleFactor, lobbyTripMs, priceAt, projectEffects, researchEffects, tradeLoad, tradePrice } from '@game/shared'
import type { Cost, Good, Kingdom, Market, Resource, Survey } from '@game/shared'
import { useState } from 'react'
import type React from 'react'
import { KINGDOM_COLORS, palaceIn } from '../game/buildingSprites'
import type { KingdomColor } from '../game/buildingSprites'
import { Icon } from './icons'
import type { IconName } from './icons'
import { BUILDING_NAMES, RESOURCE_ICONS, RESOURCE_NAMES } from './names'
import { Meter, SpriteView, fmt, times } from './hud/primitives'
import { L, locale } from '../lib/i18n'

export function CostList({ cost, stock }: { cost?: Cost; stock?: Kingdom['stock'] }) {
  const entries = Object.entries(cost ?? {}) as [Resource, number][]
  if (entries.length === 0) return <span className="cost free">{L('Ücretsiz', 'Free')}</span>
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
  const list = short.map(([r, v]) => L(`${fmt(Math.ceil(v - stock[r]))} ${RESOURCE_NAMES[r].toLowerCase()} (sende ${fmt(Math.floor(stock[r]))})`, `${fmt(Math.ceil(v - stock[r]))} ${RESOURCE_NAMES[r].toLowerCase()} (you have ${fmt(Math.floor(stock[r]))})`)).join(', ')
  return L(`Eksik: ${list}`, `Missing: ${list}`)
}

export function Missing({ cost, stock }: { cost?: Cost; stock: Kingdom['stock'] }) {
  const text = missingText(cost, stock)
  return text ? <small className="down missing">{text}</small> : null
}

// Running constructions under the top bar, so progress shows with every tab closed.
export function Constructions({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const list = constructing(kingdom, now).filter((b) => b.kind !== 'road')
  if (list.length === 0) return null
  return (
    <div className="queue frame" aria-label={L('İnşaatlar', 'Constructions')}>
      {list.map((b) => {
        const total = (BUILDINGS[b.kind].buildSeconds ?? 1) * 1000
        const left = b.doneAt - now
        return (
          <div key={b.id} className="queue-item">
            <Icon name="build" size={16} />
            <span>{BUILDING_NAMES[b.kind]}</span>
            <Meter value={1 - left / total} label={L(`${BUILDING_NAMES[b.kind]} ilerleme`, `${BUILDING_NAMES[b.kind]} progress`)} segments={8} />
            <small>{Math.ceil(left / 1000)} {L('sn', 's')}</small>
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
  const bonus = (1 + researchEffects(kingdom, now).trade + fortuneEffects(kingdom, now).trade + guildOf(kingdom, now).trade + projectEffects(kingdom, now).trade) * idleFactor(kingdom, now)
  const idle = selected === null && !!kingdom.trade.idle
  return (
    <div className="goods choices" role="radiogroup" aria-label={L('Satılacak mal', 'Good to sell')}>
      {GOODS.map((good) => {
        const price = tradePrice(kingdom, good, market, now)
        const base = basePrice(good, market)
        const units = Math.min(load, Math.floor(kingdom.stock[good]))
        return (
          <button key={good} role="radio" aria-checked={good === selected} className={good === selected ? 'good active' : 'good'} onClick={() => onGood(good)}>
            <Icon name={RESOURCE_ICONS[good]} size={24} />
            <b>{RESOURCE_NAMES[good]}</b>
            <small>{L('Stok', 'Stock')} {fmt(kingdom.stock[good])}</small>
            <small className={price < base * 0.98 ? 'down' : price > base * 1.02 ? 'up' : undefined}>
              {L(`Birimi ${price.toFixed(2).replace('.', ',')} altın`, `${price.toFixed(2)} gold each`)}{atFloor(priceAt(market, good, now), good, market) ? L(' · dipte', ' · at the floor') : ''}
            </small>
            <small className="up">
              +{Math.round(units * price * bonus)} <Icon name="gold" size={8} /> {L(`/ sefer (${units} birim)`, `/ trip (${units} units)`)}
            </small>
          </button>
        )
      })}
      <button role="radio" aria-checked={idle} className={idle ? 'good none active' : 'good none'} onClick={() => onGood(null)}>
        <Icon name="close" size={16} />
        <b>{L('Hiçbir şey satma', 'Sell nothing')}</b>
        <small>{L('Tüccar evde bekler, stoklar korunur', 'The merchant waits at home, stocks are kept')}</small>
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
            <h2 id="good-picker-title">{L('Ticaret noktan kuruldu', 'Your trading post stands')}</h2>
            <small>{L('Her şey parayla başlar', 'Everything starts with money')}</small>
          </div>
        </header>
        <p className="hint">
          {L(
            `Tüccarın hangi malı satsın? Her ${Math.round(lobbyTripMs(kingdom.buildings) / 1000)} saniyede bir seçtiğin maldan götürüp altın getirir. Sonradan Ticaret sekmesinden değiştirebilirsin.`,
            `Which good should your merchant sell? Every ${Math.round(lobbyTripMs(kingdom.buildings) / 1000)} seconds he takes some of it away and brings back gold. You can change it later in the Trade tab.`,
          )}
        </p>
        <p className="hint">
          {L(
            'Dikkat: yapı malzemesi her inşaatta harcanır; onu satarsan tüccar birkaç seferde stoğu bitirir ve ilk binaların için malzeme kalmaz. Başlangıçta savaş malzemesi satmak en güvenlisidir.',
            'Careful: building materials go into every construction; sell them and the merchant empties the stock in a few trips, leaving nothing for your first buildings. At the start, selling war materials is safest.',
          )}
        </p>
        <GoodChoice kingdom={kingdom} selected={null} onGood={onGood} market={market} now={now} />
      </div>
    </div>
  )
}

const LAND: [keyof Omit<Survey, 'yields'>, string][] = [
  ['water', L('Nehir / göl', 'River / lake')],
  ['grass', L('Çayır', 'Meadow')],
  ['forest', L('Orman', 'Forest')],
  ['mountain', L('Dağ', 'Mountain')],
  ['swamp', L('Bataklık', 'Swamp')],
  ['desert', L('Kurak', 'Arid')],
]

const WHY: Record<Good, string> = {
  food: L('Balık ve tarla: nehir, göl ve çayır', 'Fish and fields: river, lake and meadow'),
  materials: L('Kereste: orman', 'Timber: forest'),
  arms: L('Maden: dağ', 'Ore: mountain'),
}

const NAME_MAX = 24
// Place names in the manner of Ulupınar, Gökova, Altınova: a first word (a colour, a metal, a beast, a quality) and a
// feature of the land. Any first word goes with any feature, so there are over ten thousand names; a few that came
// out awkward are left out.
const NAME_HEADS = [
  'Ak', 'Kara', 'Gök', 'Demir', 'Ulu', 'Kızıl', 'Yeşil', 'Altın', 'Kartal', 'Sarı', 'Ay', 'Boz', 'Gümüş', 'Bakır', 'Mavi',
  'Kır', 'Al', 'Yıldız', 'Güneş', 'Şahin', 'Doğan', 'Ceylan', 'Geyik', 'Aslan', 'Kurt', 'Kaplan', 'Turna', 'Bülbül',
  'Elma', 'Çınar', 'Meşe', 'Söğüt', 'Kavak', 'Ardıç', 'Lale', 'Gül', 'Menekşe', 'Nergis', 'Sedef', 'Mercan', 'İnci',
  'Yakut', 'Zümrüt', 'Firuze', 'Tunç', 'Çelik', 'Kaya', 'Taş', 'Bulut', 'Rüzgar', 'Yel', 'Şimşek', 'Ilık', 'Serin',
  'Derin', 'Uzun', 'Yüce', 'Eski', 'Yeni', 'Bey', 'Han', 'Hatun', 'Tekin', 'Bayram', 'Sultan', 'Erguvan', 'Safran',
  'Akça', 'Karaca', 'Gökçe', 'Alaca', 'Turaç', 'Kumral', 'Tatlı', 'Soğuk', 'Küçük', 'Büyük', 'Sisli', 'Karlı',
  'Atmaca', 'Sungur', 'Kumru', 'Keklik', 'Ceren', 'Pars', 'Balaban', 'Tay', 'Koç', 'Kuzu', 'Ceviz', 'Kestane',
  'Fındık', 'Badem', 'Nar', 'Ayva', 'Armut', 'İncir', 'Zeytin', 'Kiraz', 'Sedir', 'Ihlamur', 'Yonca', 'Sümbül',
  'Karanfil', 'Kurşun', 'Mermer', 'Kehribar', 'Elmas', 'Yeşim', 'Akik', 'Şafak', 'Seher', 'Tan', 'Yağmur',
  'Poyraz', 'Yıldırım', 'Ayaz', 'Duman', 'Paşa', 'Ağa', 'Emir', 'Kağan', 'Alp', 'Ata', 'Çoban', 'Kırk', 'Bin',
  'Yedi', 'Üç', 'Değirmen', 'Kervan', 'Pazar', 'Saray', 'Derviş',
]
const NAME_TAILS = [
  'pınar', 'ova', 'dere', 'su', 'kaya', 'ırmak', 'yurt', 'tepe', 'çam', 'kale', 'köy', 'yaka', 'bel', 'göl', 'yazı',
  'bük', 'çay', 'dağ', 'kent', 'hisar', 'alan', 'yayla', 'koru', 'kum', 'kuyu', 'çeşme', 'bağ', 'bahçe', 'eli',
  'oba', 'kır', 'konak', 'burun', 'ada', 'pınarı', 'suyu', 'ırmağı', 'bayır', 'taş',
  'ören', 'yamaç', 'deresi', 'ovası', 'gölü', 'tepesi', 'köprü', 'sırt', 'yolu', 'saray', 'çayır', 'orman',
  'çukur', 'gedik', 'boğaz', 'kıyı', 'korusu', 'yaylası', 'düz', 'otağ', 'ağıl', 'yatak', 'özü', 'pazar', 'ocak',
  'ili', 'kapı', 'kemer', 'bucak', 'kışla', 'derbent', 'meydan', 'kuyusu', 'tarla', 'çiftlik', 'seki', 'köprüsü',
  'bağı', 'çeşmesi',
]
// Pairs that read badly as one word.
const NAME_SKIP = new Set([
  'Taştaş', 'Kayakaya', 'Kırkır', 'Kayataş', 'Taşkaya', 'Hanhan', 'Alalan', 'Akak', 'Kırkkır', 'Saraysaray',
  'Pazarpazar', 'Ağaağıl', 'Ağaada', 'Ağaalan', 'Ataada', 'Ataalan', 'Ataağıl', 'Paşaağıl', 'Tanyatak',
])
// A lord's lands, never a kingdom: the two crown kingdoms are the only kingdoms (CLAUDE.md §7.8).
// In English the title follows the root too ("Ulupınar Barony"), so the root is always the name's first word.
const NAME_KINDS = [
  L('Beyliği', 'Barony'), L('Diyarı', 'Realm'), L('Hanedanı', 'House'), L('Sancağı', 'Banner'), L('Yurdu', 'Homeland'),
  L('Malikânesi', 'Manor'), L('Lordluğu', 'Lordship'), L('Hisarı', 'Keep'), L('Tımarı', 'Fief'), L('Zeameti', 'Holding'),
  L('Toprakları', 'Lands'), L('Vilayeti', 'Province'), L('Kalesi', 'Castle'), L('Obası', 'Steading'), L('Ocağı', 'Hearth'),
  L('Ağalığı', 'Domain'),
]
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
// A name to start from, unlike any the lobby's other kingdoms already carry; the player may type their own.
const suggestName = (taken: ReadonlySet<string> = new Set()) => {
  const used = new Set([...taken].map((n) => n.split(' ')[0].toLocaleLowerCase(locale())))
  for (let tries = 0; ; tries++) {
    const root = pick(NAME_HEADS) + pick(NAME_TAILS)
    if (NAME_SKIP.has(root) || (used.has(root.toLocaleLowerCase(locale())) && tries < 50)) continue
    const name = `${root} ${pick(NAME_KINDS)}`
    if (name.length <= NAME_MAX) return name
  }
}

// Before founding: the sites the player was given, side by side, with what the land around each would yield; the
// player picks one of them.

// How far a site's trade post and dock plots lie from the middle of its land, in tiles; outside: beyond the border.
export interface SiteAccess {
  trade: { tiles: number; outside: boolean; tripMs: number } | null
  dock: { tiles: number; outside: boolean } | null
}

// The trade post's and the dock's distance, with a bar that is full when the plot lies close.
function SiteDistances({ access }: { access: SiteAccess }) {
  const base = balance.economy.trade.tripSeconds * 1000
  const rows: { icon: IconName; label: string; value: number; text: string; note: string }[] = []
  if (access.trade) {
    const seconds = Math.round(access.trade.tripMs / 1000)
    rows.push({ icon: 'trade', label: L('Ticaret noktası', 'Trading post'), value: base / access.trade.tripMs, text: L(`${access.trade.tiles} karo`, `${access.trade.tiles} tiles`), note: L(`sefer ${seconds} sn${access.trade.outside ? ' · hudut dışı' : ''}`, `trip ${seconds} s${access.trade.outside ? ' · outside the border' : ''}`) })
  } else rows.push({ icon: 'trade', label: L('Ticaret noktası', 'Trading post'), value: 0, text: L('yok', 'none'), note: L('yakında yol yok', 'no road nearby') })
  if (access.dock) {
    rows.push({ icon: 'pin', label: L('İskele', 'Dock'), value: Math.max(0.05, 1 - access.dock.tiles / 60), text: L(`${access.dock.tiles} karo`, `${access.dock.tiles} tiles`), note: access.dock.outside ? L('hudut dışı, ek alanlı', 'outside the border, with an annex') : L('hudut içinde', 'inside the border') })
  } else rows.push({ icon: 'pin', label: L('İskele', 'Dock'), value: 0, text: L('yok', 'none'), note: L('yakında su yok', 'no water nearby') })
  return (
    <>
      {rows.map((r) => (
        <span key={r.label} className="site-distance" title={`${r.label}: ${r.text}, ${r.note}`}>
          <span className="site-yield">
            <Icon name={r.icon} size={16} />
            <Meter value={Math.max(0, Math.min(1, r.value))} tone={r.value >= 0.6 ? 'up' : 'down'} label={L(`${r.label} uzaklığı`, `${r.label} distance`)} segments={6} />
            <b className={r.value >= 0.6 ? 'up' : 'down'}>{r.text}</b>
          </span>
          <small className="site-note">
            {r.label} · {r.note}
          </small>
        </span>
      ))}
    </>
  )
}

export function SitePicker({
  surveys,
  access = [],
  selected,
  onSelect,
  onFound,
  colors,
  taken,
  names = [],
}: {
  surveys: Survey[]
  access?: SiteAccess[]
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
          <h2 id="site-title">{L('Lordluğunu nereye kuracaksın?', 'Where will you found your lordship?')}</h2>
          <small>{L('Arazi, üretim çarpanlarını belirler', 'The land sets the production multipliers')}</small>
        </div>
      </header>
      {surveys.length === 0 ? (
        <p className="hint">{L('Uygun yerler aranıyor…', 'Searching for suitable sites…')}</p>
      ) : (
        <>
          <p className="hint">{L(`Sana ${surveys.length} yer gösterildi; birini seç. Seçtiğin yer haritada görünür.`, `You have been shown ${surveys.length} sites; pick one. The chosen site shows on the map.`)}</p>
          <div className="site-cards" role="radiogroup" aria-label={L('Keşfedilen yerler', 'Discovered sites')}>
            {surveys.map((s, i) => (
              <button key={i} role="radio" aria-checked={i === selected} className={i === selected ? 'site-card active' : 'site-card'} onClick={() => onSelect(i)}>
                <b>{L(`${i + 1}. yer`, `Site ${i + 1}`)}</b>
                {GOODS.map((good) => (
                  <span key={good} className="site-yield" title={WHY[good]}>
                    <Icon name={RESOURCE_ICONS[good]} size={16} />
                    <Meter value={s.yields[good] / balance.economy.yield.max} tone={s.yields[good] >= 1 ? 'up' : 'down'} label={L(`${RESOURCE_NAMES[good]} çarpanı`, `${RESOURCE_NAMES[good]} multiplier`)} segments={6} />
                    <b className={s.yields[good] >= 1 ? 'up' : 'down'}>{times(s.yields[good])}</b>
                  </span>
                ))}
                {access[i] && <SiteDistances access={access[i]} />}
                <small>
                  {LAND.filter(([k]) => s[k] >= 0.05)
                    .map(([k, name]) => L(`${name} %${Math.round(s[k] * 100)}`, `${name} ${Math.round(s[k] * 100)}%`))
                    .join(' · ')}
                </small>
              </button>
            ))}
          </div>
          <p className="hint site-why">
            {L(
              'Nehir ve çayır yemeği, orman yapı malzemesini, dağ savaş malzemesini artırır; bataklık hepsini biraz düşürür. Ticaret noktası saraydan uzaksa tüccarın seferi uzar, daha az satar. İskele hududun dışındaysa çevresinde küçük bir ek alan verilir; köylüler oraya yürür.',
              'Rivers and meadows raise food, forests building materials, mountains war materials; swamps lower everything a little. If the trading post lies far from the palace, the merchant\'s trips are longer and he sells less. If the dock lies outside the border, a small annex is granted around it; villagers walk there.',
            )}
          </p>
        </>
      )}
      <label className="name-field">
        <span>{L('Lordluğunun adı', 'Your lordship\'s name')}</span>
        <span className="name-row">
          <input
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && survey && trimmed && color && onFound(trimmed, color)}
            placeholder={L('Ör. Akdere Beyliği', 'E.g. Akdere Barony')}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="btn icon-only" onClick={() => setName(suggestName(new Set(names)))} aria-label={L('Rastgele ad öner', 'Suggest a random name')} title={L('Rastgele ad öner', 'Suggest a random name')}>
            <Icon name="crown" size={16} />
          </button>
        </span>
      </label>
      <div className="color-field">
        <span>{L('Lordluğunun rengi', 'Your lordship\'s colour')}</span>
        <div className="color-row">
          <div className="swatches" role="radiogroup" aria-label={L('Lordluk rengi', 'Lordship colour')}>
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={taken.has(c) ? L(`${KINGDOM_COLORS[c].name} (alınmış)`, `${KINGDOM_COLORS[c].name} (taken)`) : KINGDOM_COLORS[c].name}
                title={taken.has(c) ? L(`${KINGDOM_COLORS[c].name} — başka bir lordun`, `${KINGDOM_COLORS[c].name} — another lord's`) : KINGDOM_COLORS[c].name}
                className={c === color ? 'swatch active' : 'swatch'}
                style={{ '--swatch': KINGDOM_COLORS[c].swatch } as React.CSSProperties}
                disabled={taken.has(c)}
                data-why={L(`${KINGDOM_COLORS[c].name} başka bir lordun; bir renk lobide yalnızca bir lordundur`, `${KINGDOM_COLORS[c].name} belongs to another lord; each colour belongs to one lord per lobby`)}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <span className="slot palace-preview">
            {color && <SpriteView sprite={palaceIn(color)} scale={0.25} label={L(`${KINGDOM_COLORS[color].name} saray`, `${KINGDOM_COLORS[color].name} palace`)} />}
          </span>
        </div>
      </div>
      <button className="btn primary wide" disabled={!survey || !trimmed || !color} data-why={!survey ? L('Önce bir yer seç', 'Pick a site first') : !trimmed ? L('Lordluğuna bir ad ver', 'Give your lordship a name') : L('Bir renk seç', 'Pick a colour')} onClick={() => color && onFound(trimmed, color)}>
        <Icon name="crown" size={16} /> {L('Burada kur', 'Found here')}
      </button>
    </section>
  )
}
