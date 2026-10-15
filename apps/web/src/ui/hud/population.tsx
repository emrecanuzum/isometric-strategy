import { balance, growthTerms, happinessOf, levelOf, population, timeToFill } from '@game/shared'
import type { GrowthPart, Kingdom } from '@game/shared'
import { Meter, Section, Stat, fmt } from './primitives'
import type { Online } from './online'

// The people (CLAUDE.md §5.2): homes give room, and the people grow into it round by round, faster when happy and at
// peace, slower at war and when sick, and they leave when hungry, besieged or miserable.

const ROUNDS_PER_HOUR = 3600 / balance.economy.productionSeconds
const num = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',')
const signedNum = (v: number, digits = 2) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), digits)}`
const factorText = (v: number) => `×${num(v, 2)}`

function duration(ms: number) {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return `${minutes} dk`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

function partLine(part: GrowthPart, value: number, kingdom: Kingdom, now: number): { name: string; note: string; meter: number; tone: 'up' | 'down' | 'gold' } {
  const g = balance.society.growth
  switch (part) {
    case 'happiness': {
      const h = Math.round(happinessOf(kingdom))
      return {
        name: 'Mutluluk',
        note: value > 0 ? `%${h} mutlu halk: büyüme ${factorText(value)}` : value < 0 ? `%${h}: halk mutsuz, göç ediyor` : `%${h}: büyüme durdu`,
        meter: Math.max(0, value) / g.happiness[g.happiness.length - 1].factor,
        tone: value >= 1 ? 'up' : value > 0 ? 'gold' : 'down',
      }
    }
    case 'food':
      return { name: 'Yemek', note: 'Ambarda yemek yok: halk aç, göç ediyor', meter: 0, tone: 'down' }
    case 'siege':
      return { name: 'Kuşatma', note: 'Saray kuşatma altında: halk kaçıyor', meter: 0, tone: 'down' }
    case 'war':
      return { name: 'Savaş', note: `Savaştasın: büyüme ${factorText(value)}`, meter: value, tone: 'down' }
    case 'sickness':
      return { name: 'Hastalık', note: `Köylülerin %${Math.round((kingdom.sickness ?? 0) * 100)} hasta: büyüme ${factorText(value)}`, meter: value, tone: value < 0.9 ? 'down' : 'gold' }
    case 'queen':
      return { name: 'Kraliçe', note: `Kraliçe sarayda, doğumlar artıyor: ${factorText(value)}`, meter: value / 1.3, tone: 'up' }
    case 'temple':
      return { name: 'Tapınak', note: `${levelOf(kingdom, 'temple', now)}. seviye tapınak halkı bağlıyor: ${factorText(value)}`, meter: value / 1.3, tone: 'up' }
  }
}

export function PopulationPanel({ kingdom, now }: { kingdom: Kingdom; now: number; online?: Online }) {
  const { villagers, room, housing, cap, soldiers, sailors } = population(kingdom, now)
  const grow = growthTerms(kingdom, now)
  const fill = timeToFill(kingdom, now)
  const full = grow.gap < 0.5
  const perHour = grow.factor > 0 ? Math.min(grow.gap, grow.perRound * ROUNDS_PER_HOUR) : grow.perRound * ROUNDS_PER_HOUR
  const status = full
    ? grow.factor < 0
      ? 'Evler dolu ama halk göç ediyor'
      : 'Evler dolu: yeni ev ya da daha yüksek saray gerek'
    : grow.factor > 0
      ? `Doluma kalan: ${fill === null ? '—' : duration(fill)}`
      : grow.factor < 0
        ? 'Halk azalıyor'
        : 'Büyüme durdu'
  return (
    <>
      <Section title="Nüfus" icon="villager" aside={`${fmt(villagers)} / ${fmt(room)}`}>
        <Meter value={room ? grow.people / room : 0} tone={grow.factor < 0 ? 'down' : full ? 'up' : 'gold'} label="Köylülerin yerleşimi" segments={20} />
        <Stat label="Köylü" value={fmt(villagers)} note={`${fmt(room)} kişilik yer`} />
        <Stat label="Barınak" value={fmt(housing)} note={`saray sınırı ${fmt(cap)}`} />
        {soldiers + sailors > 0 && <Stat label="Asker ve denizci" value={fmt(soldiers + sailors)} note="köylülerin yerinden düşer" />}
        <Stat
          label="Büyüme"
          value={`${signedNum(grow.perRound)} / tur`}
          note={`≈ ${signedNum(perHour, 1)} / saat`}
          tone={grow.perRound > 0.001 ? 'up' : grow.perRound < -0.001 ? 'down' : undefined}
        />
        <p className="hint">{status}</p>
      </Section>
      <Section title="Büyümeyi belirleyenler" icon="people" aside={grow.factor > 0 ? `toplam ${factorText(grow.factor)}` : grow.factor < 0 ? 'göç' : 'durgun'}>
        {grow.parts
          .filter((p) => p.active)
          .map((p) => {
            const line = partLine(p.part, p.value, kingdom, now)
            return (
              <div key={p.part} className="sign">
                <span>{line.name}</span>
                <Meter value={line.meter} tone={line.tone} label={line.name} segments={10} />
                <small>{line.note}</small>
              </div>
            )
          })}
        <p className="hint">
          Evler ve saray yalnızca yer verir; halk o yeri tur tur doldurur. Boş yer çoksa daha hızlı gelirler. Mutlu ve barış içindeki halk hızlı çoğalır;
          savaş ve hastalık büyümeyi yavaşlatır, kraliçe ve tapınak hızlandırır. Açlık, kuşatma ve çok mutsuz halk göç eder. Ev yıkılırsa ya da asker
          yazılırsa yeri kalmayan köylüler hemen gider; askerler terhis edilince köylüye döner.
        </p>
      </Section>
    </>
  )
}
