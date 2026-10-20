import { balance, booksOf, goldCap, ledger, levelSpec, maxLevel, palaceLevel } from '@game/shared'
import type { Building, Kingdom } from '@game/shared'
import { useMemo } from 'react'
import { Scene, picture } from '../AwayReport'
import { L } from '../../lib/i18n'
import { Icon } from '../icons'
import { Meter, Section, Stat, fmt, signed } from './primitives'
import { Subtabs, usePart } from './Subtabs'

// A whole number of gold with its sign, grouped (the books run into the thousands).
const sum = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`
import { flows } from './tabs'
import type { HudData } from './tabs'

// The treasury's books (CLAUDE.md §6.4): what comes in and goes out each round, and the season's running accounts.

// Gold per production round: taxes, the merchant, tributes and the soldiers' pay.
export function IncomeSection({ kingdom, now, online }: Pick<HudData, 'kingdom' | 'now' | 'online'>) {
  const flow = flows(kingdom, now, online?.market)
  const l = ledger(kingdom, now)
  return (
    <Section title={L('Gelir ve gider', 'Income and expenses')} icon="gold" aside={L('altın / tur', 'gold / round')}>
      <Stat label={L('Vergi', 'Tax')} value={signed(l.tax)} tone="up" />
      {flow.tradeGold > 0 && <Stat label={L('Ticaret', 'Trade')} value={signed(flow.tradeGold)} tone="up" />}
      {l.tributes.map((t) => (
        <Stat key={t.other} label={t.dir === 'in' ? L(`Haraç · ${t.name}`, `Tribute · ${t.name}`) : L(`Haraç → ${t.name}`, `Tribute → ${t.name}`)} value={signed(t.gold)} tone={t.gold > 0 ? 'up' : 'down'} />
      ))}
      {l.soldiersGold > 0 && <Stat label={L('Asker maaşı', 'Soldiers\' pay')} value={signed(-l.soldiersGold)} tone="down" note={L(`ve ${fmt(l.soldiersFood)} yemek`, `and ${fmt(l.soldiersFood)} food`)} />}
      <Stat label={L('Net', 'Net')} value={signed(flow.gold.net)} tone={flow.gold.net >= 0 ? 'up' : 'down'} />
    </Section>
  )
}

// The season's accounts so far, as they were kept: every source of gold and every outgoing, and what a full treasury
// let go to waste.
export function SeasonBooks({ kingdom }: { kingdom: Kingdom }) {
  const b = booksOf(kingdom)
  const rows: { label: string; value: number; note?: string }[] = [
    { label: L('Vergi', 'Tax'), value: b.tax },
    { label: L('Tüccar', 'Merchant'), value: b.trade },
    { label: L('Deniz ticareti', 'Sea trade'), value: b.sea ?? 0 },
    { label: L('Korsan ödülleri', 'Pirate bounties'), value: b.bounty ?? 0 },
    { label: L('Haraç alınan', 'Tribute received'), value: b.tributeIn },
    { label: L('Taç devriyelerinden', 'From crown patrols'), value: b.crownGot, note: L('bahşiş ve armağan', 'tips and gifts') },
    { label: L('Kasaba satışı', 'Town sales'), value: b.townSales ?? 0, note: L('başka lordlar kasabalarının pazarından aldı', 'other lords bought at your towns\' markets') },
    { label: L('Kasaba, olay, hedef, balıkçı', 'Towns, events, goals, fishing'), value: b.other },
    { label: L('Seferler', 'Expeditions'), value: b.expedition ?? 0 },
    { label: L('Asker maaşı', 'Soldiers\' pay'), value: -b.wages },
    { label: L('Tayfa maaşı', 'Crew pay'), value: -(b.navy ?? 0) },
    { label: L('Kasaba bakımı', 'Town upkeep'), value: -(b.townUpkeep ?? 0) },
    { label: L('Haraç ödenen', 'Tribute paid'), value: -b.tributeOut },
    { label: L('Taç devriyelerine', 'To crown tribute collectors'), value: -b.crownPaid, note: L('haraç', 'tribute') },
  ].filter((r) => Math.abs(r.value) >= 1)
  const net = rows.reduce((n, r) => n + r.value, 0)
  return (
    <Section title={L('Sezonun defteri', 'The season\'s books')} icon="scroll" aside={L('sezon başından beri', 'since the season began')}>
      {rows.length === 0 ? (
        <p className="hint">{L('Defter henüz boş: ilk vergiler toplanınca burada birikir.', 'The books are still empty: they fill up once the first taxes are collected.')}</p>
      ) : (
        <>
          {rows.map((r) => (
            <Stat key={r.label} label={r.label} value={sum(r.value)} tone={r.value > 0 ? 'up' : 'down'} note={r.note} />
          ))}
          <Stat label={L('Net', 'Net')} value={sum(net)} tone={net >= 0 ? 'up' : 'down'} note={L('inşaat, eğitim ve alımlar hariç', 'excluding building, training and purchases')} />
        </>
      )}
      {b.wastedGold >= 1 && (
        <p className="alert">
          <Icon name="warn" size={16} /> {L(`Hazine dolu olduğu için bu sezon ${fmt(b.wastedGold)} altın sığmadı, boşa gitti.`, `With the treasury full, ${fmt(b.wastedGold)} gold had no room this season and went to waste.`)}
        </p>
      )}
      {b.tradeHeld >= 1 && <p className="hint">{L(`Tüccar hazine dolu diye ${fmt(b.tradeHeld)} sefer mal götürmeden bekledi.`, `Because the treasury was full, the merchant skipped ${fmt(b.tradeHeld)} trip${b.tradeHeld === 1 ? '' : 's'} and took no goods.`)}</p>}
    </Section>
  )
}

// The treasury building's menu: how full the treasury is and what makes its room, what this building adds at each
// level, and the books.
export function TreasuryPanel({ building, data }: { building: Building; data: HudData }) {
  const { kingdom, now, online } = data
  const cap = goldCap(kingdom, now)
  const gold = kingdom.stock.gold
  const level = building.level ?? 1
  const palace = palaceLevel(kingdom, now)
  const byPalace = balance.economy.storage.goldByPalaceLevel
  const fromPalace = byPalace[Math.max(0, Math.min(byPalace.length - 1, palace - 1))]
  const treasuries = kingdom.buildings.filter((b) => b.kind === 'treasury')
  const scene = useMemo(() => picture('treasury', kingdom.color ?? undefined, undefined), [kingdom.color])
  const full = cap - gold < 1
  // Split in parts like the other long menus (CLAUDE.md §6.4): the room, the round's flows, the season's books.
  const [part, setPart] = usePart('treasury', ['room', 'flow', 'books'] as const, 'room')
  return (
    <>
      <div className="sheet-scene">
        <Scene items={scene} mood="treasury" />
      </div>
      <Subtabs
        label={L('Hazine', 'Treasury')}
        parts={[
          { id: 'room', name: L('Hazine', 'Treasury'), icon: 'chest', dot: full },
          { id: 'flow', name: L('Gelir-gider', 'Cash flow'), icon: 'gold' },
          { id: 'books', name: L('Defter', 'Books'), icon: 'scroll' },
        ]}
        part={part}
        onPart={setPart}
      />
      {part === 'room' && (
        <>
          <Section title={L('Hazine', 'Treasury')} icon="gold" aside={`${fmt(gold)} / ${fmt(cap)}`}>
            <Meter value={cap ? gold / cap : 0} tone={full ? 'down' : gold >= cap * 0.85 ? 'gold' : 'up'} label={L('Hazinenin doluluğu', 'Treasury fill')} segments={20} />
            {full && (
              <p className="alert">
                <Icon name="warn" size={16} />{' '}
                {L('Hazine dolu: gelen altın boşa gidiyor ve tüccar mal götürmeden bekliyor. Harca, haraç öde ya da bu hazineyi yükselt.', 'The treasury is full: incoming gold goes to waste and the merchant waits without taking goods. Spend, pay tribute or upgrade this treasury.')}
              </p>
            )}
            <Stat label={L(`Saray (${palace}. seviye)`, `Palace (level ${palace})`)} value={`+${fmt(fromPalace)}`} />
            {treasuries.map((t) => {
              // A treasury being raised keeps the room of the level below until the work is done.
              const lv = t.doneAt <= now || t.moving ? (t.level ?? 1) : (t.level ?? 1) - 1
              return (
                <Stat
                  key={t.id}
                  label={L(`${t.id === building.id ? 'Bu hazine' : 'Hazine'} (${t.level ?? 1}. seviye)`, `${t.id === building.id ? 'This treasury' : 'Treasury'} (level ${t.level ?? 1})`)}
                  value={lv >= 1 ? `+${fmt(levelSpec('treasury', lv).gold ?? 0)}` : L('inşaatta', 'under construction')}
                  note={t.doneAt > now ? L('yükseltiliyor', 'upgrading') : undefined}
                />
              )
            })}
            <Stat label={L('Toplam altın yeri', 'Total gold capacity')} value={fmt(cap)} />
          </Section>
          <Section title={L('Seviyelere göre', 'By level')} icon="crown" aside={`${level} / ${maxLevel('treasury')}`}>
            <ul className="pop-lines">
              {Array.from({ length: maxLevel('treasury') }, (_, i) => (
                <li key={i}>
                  <span className={i + 1 === level ? 'up' : undefined}>
                    {L(`${i + 1}. seviye`, `Level ${i + 1}`)}{i + 1 === level ? L(' (şimdi)', ' (now)') : ''}
                  </span>
                  <b>{L(`+${fmt(levelSpec('treasury', i + 1).gold ?? 0)} altın yeri`, `+${fmt(levelSpec('treasury', i + 1).gold ?? 0)} gold capacity`)}</b>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
      {part === 'flow' && <IncomeSection kingdom={kingdom} now={now} online={online} />}
      {part === 'books' && <SeasonBooks kingdom={kingdom} />}
    </>
  )
}
