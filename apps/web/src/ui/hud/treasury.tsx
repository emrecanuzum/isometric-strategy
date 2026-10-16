import { balance, booksOf, goldCap, ledger, levelSpec, maxLevel, palaceLevel } from '@game/shared'
import type { Building, Kingdom } from '@game/shared'
import { useMemo } from 'react'
import { Scene, picture } from '../AwayReport'
import { Icon } from '../icons'
import { Meter, Section, Stat, fmt, signed } from './primitives'

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
    <Section title="Gelir ve gider" icon="gold" aside="altın / tur">
      <Stat label="Vergi" value={signed(l.tax)} tone="up" />
      {flow.tradeGold > 0 && <Stat label="Ticaret" value={signed(flow.tradeGold)} tone="up" />}
      {l.tributes.map((t) => (
        <Stat key={t.other} label={t.dir === 'in' ? `Haraç · ${t.name}` : `Haraç → ${t.name}`} value={signed(t.gold)} tone={t.gold > 0 ? 'up' : 'down'} />
      ))}
      {l.soldiersGold > 0 && <Stat label="Asker maaşı" value={signed(-l.soldiersGold)} tone="down" note={`ve ${fmt(l.soldiersFood)} yemek`} />}
      <Stat label="Net" value={signed(flow.gold.net)} tone={flow.gold.net >= 0 ? 'up' : 'down'} />
    </Section>
  )
}

// The season's accounts so far, as they were kept: every source of gold and every outgoing, and what a full treasury
// let go to waste.
export function SeasonBooks({ kingdom }: { kingdom: Kingdom }) {
  const b = booksOf(kingdom)
  const rows: { label: string; value: number; note?: string }[] = [
    { label: 'Vergi', value: b.tax },
    { label: 'Tüccar', value: b.trade },
    { label: 'Deniz ticareti', value: b.sea ?? 0 },
    { label: 'Korsan ödülleri', value: b.bounty ?? 0 },
    { label: 'Haraç alınan', value: b.tributeIn },
    { label: 'Taç devriyelerinden', value: b.crownGot, note: 'bahşiş ve armağan' },
    { label: 'Kasaba satışı', value: b.townSales ?? 0, note: 'başka lordlar kasabalarının pazarından aldı' },
    { label: 'Kasaba, olay, hedef, balıkçı', value: b.other },
    { label: 'Seferler', value: b.expedition ?? 0 },
    { label: 'Asker maaşı', value: -b.wages },
    { label: 'Tayfa maaşı', value: -(b.navy ?? 0) },
    { label: 'Kasaba bakımı', value: -(b.townUpkeep ?? 0) },
    { label: 'Haraç ödenen', value: -b.tributeOut },
    { label: 'Taç devriyelerine', value: -b.crownPaid, note: 'haraç' },
  ].filter((r) => Math.abs(r.value) >= 1)
  const net = rows.reduce((n, r) => n + r.value, 0)
  return (
    <Section title="Sezonun defteri" icon="scroll" aside="sezon başından beri">
      {rows.length === 0 ? (
        <p className="hint">Defter henüz boş: ilk vergiler toplanınca burada birikir.</p>
      ) : (
        <>
          {rows.map((r) => (
            <Stat key={r.label} label={r.label} value={sum(r.value)} tone={r.value > 0 ? 'up' : 'down'} note={r.note} />
          ))}
          <Stat label="Net" value={sum(net)} tone={net >= 0 ? 'up' : 'down'} note="inşaat, eğitim ve alımlar hariç" />
        </>
      )}
      {b.wastedGold >= 1 && (
        <p className="alert">
          <Icon name="warn" size={16} /> Hazine dolu olduğu için bu sezon {fmt(b.wastedGold)} altın sığmadı, boşa gitti.
        </p>
      )}
      {b.tradeHeld >= 1 && <p className="hint">Tüccar hazine dolu diye {fmt(b.tradeHeld)} sefer mal götürmeden bekledi.</p>}
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
  return (
    <>
      <div className="sheet-scene">
        <Scene items={scene} mood="treasury" />
      </div>
      <Section title="Hazine" icon="gold" aside={`${fmt(gold)} / ${fmt(cap)}`}>
        <Meter value={cap ? gold / cap : 0} tone={full ? 'down' : gold >= cap * 0.85 ? 'gold' : 'up'} label="Hazinenin doluluğu" segments={20} />
        {full && (
          <p className="alert">
            <Icon name="warn" size={16} /> Hazine dolu: gelen altın boşa gidiyor ve tüccar mal götürmeden bekliyor. Harca, haraç öde ya da bu hazineyi yükselt.
          </p>
        )}
        <Stat label={`Saray (${palace}. seviye)`} value={`+${fmt(fromPalace)}`} />
        {treasuries.map((t) => {
          // A treasury being raised keeps the room of the level below until the work is done.
          const lv = t.doneAt <= now || t.moving ? (t.level ?? 1) : (t.level ?? 1) - 1
          return (
            <Stat
              key={t.id}
              label={`${t.id === building.id ? 'Bu hazine' : 'Hazine'} (${t.level ?? 1}. seviye)`}
              value={lv >= 1 ? `+${fmt(levelSpec('treasury', lv).gold ?? 0)}` : 'inşaatta'}
              note={t.doneAt > now ? 'yükseltiliyor' : undefined}
            />
          )
        })}
        <Stat label="Toplam altın yeri" value={fmt(cap)} />
      </Section>
      <Section title="Seviyelere göre" icon="crown" aside={`${level} / ${maxLevel('treasury')}`}>
        <ul className="pop-lines">
          {Array.from({ length: maxLevel('treasury') }, (_, i) => (
            <li key={i}>
              <span className={i + 1 === level ? 'up' : undefined}>
                {i + 1}. seviye{i + 1 === level ? ' (şimdi)' : ''}
              </span>
              <b>+{fmt(levelSpec('treasury', i + 1).gold ?? 0)} altın yeri</b>
            </li>
          ))}
        </ul>
      </Section>
      <IncomeSection kingdom={kingdom} now={now} online={online} />
      <SeasonBooks kingdom={kingdom} />
    </>
  )
}
