import { balance, growthTerms, happinessGrowth, happinessOf, levelOf, population, timeToFill } from '@game/shared'
import type { GrowthPart, Kingdom } from '@game/shared'
import { useState } from 'react'
import { L, getLang } from '../../lib/i18n'
import { Icon } from '../icons'
import { Meter, Section, Stat, fmt } from './primitives'
import type { Online } from './online'

// The people (CLAUDE.md §5.2): homes give room, and the people grow into it round by round, faster when happy and at
// peace, slower at war and when sick, and they leave when hungry, besieged or miserable.

const ROUNDS_PER_HOUR = 3600 / balance.economy.productionSeconds
const num = (v: number, digits = 1) => v.toFixed(digits).replace('.', L(',', '.'))
const signedNum = (v: number, digits = 2) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), digits)}`
const factorText = (v: number) => `×${num(v, 2)}`

function duration(ms: number) {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return L(`${minutes} dk`, `${minutes} min`)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? L(`${h} sa ${m} dk`, `${h} h ${m} min`) : L(`${h} sa`, `${h} h`)
}

function partLine(part: GrowthPart, value: number, kingdom: Kingdom, now: number): { name: string; note: string; meter: number; tone: 'up' | 'down' | 'gold' } {
  const g = balance.society.growth
  switch (part) {
    case 'happiness': {
      const h = Math.round(happinessOf(kingdom))
      return {
        name: L('Mutluluk', 'Happiness'),
        note: value > 0 ? L(`%${h} mutlu halk: büyüme ${factorText(value)}`, `${h}% happy people: growth ${factorText(value)}`) : value < 0 ? L(`%${h}: halk mutsuz, göç ediyor`, `${h}%: the people are unhappy and leaving`) : L(`%${h}: büyüme durdu`, `${h}%: growth has stopped`),
        meter: Math.max(0, value) / g.happiness[g.happiness.length - 1].factor,
        tone: value >= 1 ? 'up' : value > 0 ? 'gold' : 'down',
      }
    }
    case 'food':
      return { name: L('Yemek', 'Food'), note: L('Ambarda yemek yok: halk aç, göç ediyor', 'No food in the storehouse: the people are hungry and leaving'), meter: 0, tone: 'down' }
    case 'siege':
      return { name: L('Kuşatma', 'Siege'), note: L('Saray kuşatma altında: halk kaçıyor', 'The palace is under siege: the people are fleeing'), meter: 0, tone: 'down' }
    case 'war':
      return { name: L('Savaş', 'War'), note: L(`Savaştasın: büyüme ${factorText(value)}`, `You are at war: growth ${factorText(value)}`), meter: value, tone: 'down' }
    case 'sickness':
      return { name: L('Hastalık', 'Sickness'), note: L(`Köylülerin %${Math.round((kingdom.sickness ?? 0) * 100)} hasta: büyüme ${factorText(value)}`, `${Math.round((kingdom.sickness ?? 0) * 100)}% of the villagers are sick: growth ${factorText(value)}`), meter: value, tone: value < 0.9 ? 'down' : 'gold' }
    case 'queen':
      return { name: L('Kraliçe', 'Queen'), note: L(`Kraliçe sarayda, doğumlar artıyor: ${factorText(value)}`, `The queen is in the palace, births are up: ${factorText(value)}`), meter: value / 1.3, tone: 'up' }
    case 'temple':
      return { name: L('Tapınak', 'Temple'), note: L(`${levelOf(kingdom, 'temple', now)}. seviye tapınak halkı bağlıyor: ${factorText(value)}`, `A level ${levelOf(kingdom, 'temple', now)} temple binds the people: ${factorText(value)}`), meter: value / 1.3, tone: 'up' }
  }
}

export function PopulationPanel({ kingdom, now }: { kingdom: Kingdom; now: number; online?: Online }) {
  const { villagers, room, housing, cap, soldiers, sailors } = population(kingdom, now)
  const grow = growthTerms(kingdom, now)
  const fill = timeToFill(kingdom, now)
  const [explain, setExplain] = useState(false)
  const full = grow.gap < 0.5
  const perHour = grow.factor > 0 ? Math.min(grow.gap, grow.perRound * ROUNDS_PER_HOUR) : grow.perRound * ROUNDS_PER_HOUR
  const status = full
    ? grow.factor < 0
      ? L('Evler dolu ama halk göç ediyor', 'The homes are full, but the people are leaving')
      : L('Evler dolu: yeni ev ya da daha yüksek saray gerek', 'The homes are full: you need a new house or a higher palace')
    : grow.factor > 0
      ? L(`Doluma kalan: ${fill === null ? '—' : duration(fill)}`, `Until full: ${fill === null ? '—' : duration(fill)}`)
      : grow.factor < 0
        ? L('Halk azalıyor', 'The people are dwindling')
        : L('Büyüme durdu', 'Growth has stopped')
  return (
    <>
      <Section title={L('Nüfus', 'Population')} icon="villager" aside={`${fmt(villagers)} / ${fmt(room)}`}>
        <Meter value={room ? grow.people / room : 0} tone={grow.factor < 0 ? 'down' : full ? 'up' : 'gold'} label={L('Köylülerin yerleşimi', 'Villagers settled')} segments={20} />
        <Stat label={L('Köylü', 'Villagers')} value={fmt(villagers)} note={L(`${fmt(room)} kişilik yer`, `room for ${fmt(room)}`)} />
        <Stat label={L('Barınak', 'Housing')} value={fmt(housing)} note={L(`saray sınırı ${fmt(cap)}`, `palace limit ${fmt(cap)}`)} />
        {soldiers + sailors > 0 && <Stat label={L('Asker ve denizci', 'Soldiers and sailors')} value={fmt(soldiers + sailors)} note={L('köylülerin yerinden düşer', "take up villagers' room")} />}
        <Stat
          label={
            <>
              {L('Büyüme', 'Growth')}{' '}
              <button className="btn icon-only info-btn" aria-expanded={explain} aria-label={L('Nüfus büyümesi nasıl işler?', 'How does population growth work?')} title={L('Nüfus büyümesi nasıl işler?', 'How does population growth work?')} onClick={() => setExplain(!explain)}>
                <Icon name="info" size={16} />
              </button>
            </>
          }
          value={L(`${signedNum(grow.perRound)} / tur`, `${signedNum(grow.perRound)} / round`)}
          note={L(`yaklaşık ${signedNum(perHour, 1)} / saat`, `about ${signedNum(perHour, 1)} / hour`)}
          tone={grow.perRound > 0.001 ? 'up' : grow.perRound < -0.001 ? 'down' : undefined}
        />
        {explain && <GrowthExplained kingdom={kingdom} now={now} />}
        <p className="hint">{status}</p>
      </Section>
      <Section title={L('Büyümeyi belirleyenler', 'What drives growth')} icon="people" aside={grow.factor > 0 ? L(`toplam ${factorText(grow.factor)}`, `total ${factorText(grow.factor)}`) : grow.factor < 0 ? L('göç', 'leaving') : L('durgun', 'stagnant')}>
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
          {L(
            'Evler ve saray yalnızca yer verir; halk o yeri tur tur doldurur. Boş yer çoksa daha hızlı gelirler. Mutlu ve barış içindeki halk hızlı çoğalır; savaş ve hastalık büyümeyi yavaşlatır, kraliçe ve tapınak hızlandırır. Açlık, kuşatma ve çok mutsuz halk göç eder. Ev yıkılırsa ya da asker yazılırsa yeri kalmayan köylüler hemen gider; askerler terhis edilince köylüye döner.',
            'Houses and the palace only give room; the people fill it round by round, faster when there is plenty of room. Happy people at peace multiply quickly; war and sickness slow growth, a queen and a temple speed it up. Hunger, siege or deep unhappiness drive the people away. If a house is torn down or soldiers are enlisted, villagers left without room leave at once; disbanded soldiers become villagers again.',
          )}
        </p>
      </Section>
    </>
  )
}

// How the people grow, worked through with this lordship's own numbers (the (i) by Büyüme; CLAUDE.md §5.2).
export function GrowthExplained({ kingdom, now }: { kingdom: Kingdom; now: number }) {
  const g = balance.society.growth
  const grow = growthTerms(kingdom, now)
  const base = g.inflowPerRound + g.gapSharePerRound * grow.gap
  const h = Math.round(happinessOf(kingdom))
  return (
    <div className="explain frame">
      <b>{L('Nüfus nasıl büyür?', 'How does the population grow?')}</b>
      {getLang() === 'tr' ? (
        <>
          <p>
            Evler, saray ve kalabalık kasabalar yalnız <b>yer</b> verir; köylüler o yere her üretim turunda ({balance.economy.productionSeconds} saniyede bir) yavaş
            yavaş gelir. Askerler ve denizciler de bu yerden düşer. Şu an yer: <b>{fmt(grow.room)}</b>, yerleşmiş köylü: <b>{fmt(Math.round(grow.people))}</b>, boş yer:{' '}
            <b>{fmt(Math.round(grow.gap))}</b>.
          </p>
          <p>
            Tur başına gelen: (<b>{num(g.inflowPerRound, 2)}</b> + boş yerin <b>%{num(g.gapSharePerRound * 100, 1)}</b>'i) × büyüme çarpanı. Senin için bu{' '}
            {num(base, 2)} × {num(Math.max(0, grow.factor), 2)}
            {grow.gap < 0.5 ? ', ama boş yer olmadığı için kimse gelmez' : <>, yani tur başına <b>{num(Math.max(0, grow.perRound), 2)}</b> kişi</>}. Boş yer çoksa halk
            daha hızlı gelir, doldukça yavaşlar.
          </p>
          <p>
            <b>Çarpanı mutluluk belirler</b> (şu an %{h}, çarpan {num(happinessGrowth(h), 2)}): {g.happiness.map((p) => `%${p.at} → ${p.factor < 0 ? '−' : ''}${num(Math.abs(p.factor), 1)}`).join(', ')} (aradakiler doğrusal; 0'da büyüme durur). Savaş ×{num(g.war, 1)},
            hastalık hasta payı kadar düşürür; kraliçe ×{num(1 + g.queen, 1)}, tapınak her seviyede +%{Math.round(g.templePerLevel * 100)} artırır.
          </p>
          <p>
            <b>Çarpan sıfırın altına inerse halk göç eder:</b> tur başına halkın %{num(g.leaveSharePerRound * 100, 1)}'i × çarpan. Açlık (ambarda yemek yok)
            çarpanı en fazla {num(g.starving, 1)}, kuşatma {num(g.besieged, 0)} yapar. Ama sarayın hizmetlileri gitmez; nüfus onların altına inerse aç da olsalar
            geri gelirler.
          </p>
          <p>Ev yıkılır ya da asker yazılırsa yeri kalmayan köylüler hemen gider; terhis edilen asker köylüye döner. Yer dolunca büyümek için yeni ev ya da daha yüksek saray gerekir.</p>
        </>
      ) : (
        <>
          <p>
            Houses, the palace and populous towns only give <b>room</b>; villagers trickle into it every production round (every {balance.economy.productionSeconds}{' '}
            seconds). Soldiers and sailors take from this room too. Room now: <b>{fmt(grow.room)}</b>, villagers settled: <b>{fmt(Math.round(grow.people))}</b>, free room:{' '}
            <b>{fmt(Math.round(grow.gap))}</b>.
          </p>
          <p>
            Arrivals per round: (<b>{num(g.inflowPerRound, 2)}</b> + <b>{num(g.gapSharePerRound * 100, 1)}%</b> of the free room) × the growth factor. For you that is{' '}
            {num(base, 2)} × {num(Math.max(0, grow.factor), 2)}
            {grow.gap < 0.5 ? ', but with no free room nobody comes' : <>, i.e. <b>{num(Math.max(0, grow.perRound), 2)}</b> people per round</>}. With plenty of free room the
            people come faster, slowing as it fills.
          </p>
          <p>
            <b>Happiness sets the factor</b> (now {h}%, factor {num(happinessGrowth(h), 2)}): {g.happiness.map((p) => `${p.at}% → ${p.factor < 0 ? '−' : ''}${num(Math.abs(p.factor), 1)}`).join(', ')} (linear in between; at 0 growth stops). War ×{num(g.war, 1)},
            sickness lowers it by the share of the sick; a queen ×{num(1 + g.queen, 1)}, a temple +{Math.round(g.templePerLevel * 100)}% per level.
          </p>
          <p>
            <b>If the factor drops below zero, the people leave:</b> {num(g.leaveSharePerRound * 100, 1)}% of the people per round × the factor. Hunger (no food in the
            storehouse) drags the factor to {num(g.starving, 1)} at most, a siege to {num(g.besieged, 0)}. But the palace servants never leave; if the population falls
            below them they come back, hungry or not.
          </p>
          <p>If a house is torn down or soldiers are enlisted, villagers left without room leave at once; a disbanded soldier becomes a villager again. Once the room is full, growth needs a new house or a higher palace.</p>
        </>
      )}
    </div>
  )
}
