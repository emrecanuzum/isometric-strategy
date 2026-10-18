import { balance, crownRelation, crownTraitAt, crownWays, tributeDemand } from '@game/shared'
import type { Kingdom, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { crownKeyOf, pctText, tipPreview, tributeShareNow, waysText } from './crownHouse'
import type { Online } from './online'
import { Section, Stat, fmt } from './primitives'

// What a crown's column on the map is (CLAUDE.md §7.8): its patrol riding to one of its lords, or its tribute
// collectors riding to a lord sworn to the other crown. Tapping one tells whose men they are, under which ruler, where
// they are going and what they will want or leave there.
export interface CrownColumn {
  kind: 'patrol' | 'tribute'
  crown: number
  // The lord they are riding to (its kingdom id) and its name as the map shows it.
  lord: number | null
  lordName: string | null
}

export function CrownColumnSheet({ world, kingdom, column, online, now, onCrown, onClose }: {
  world: World
  kingdom: Kingdom
  column: CrownColumn
  online: Online
  now: number
  onCrown(crown: number): void
  onClose(): void
}) {
  const info = cityInfo(world, column.crown)
  const key = crownKeyOf(kingdom)
  const trait = crownTraitAt(key, column.crown, now)
  const mine = kingdom.liege === column.crown
  const toMe = column.lord === online.me
  const relation = Math.round(crownRelation(kingdom, column.crown))
  const ways = crownWays(key, column.crown, now)
  const title = column.kind === 'patrol' ? `${info.capital} devriyesi` : `${info.capital} haraççıları`
  return (
    <section className="sheet frame" aria-labelledby="column-title">
      <header className="sheet-head">
        <Icon name={column.kind === 'patrol' ? 'banner' : 'gold'} size={32} />
        <div>
          <h2 id="column-title" style={{ color: info.ink }}>{title}</h2>
          <small>
            {info.name} · {info.ruler} ({trait.name.toLocaleLowerCase('tr-TR')})
          </small>
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label="Kapat (Esc)" title="Kapat (Esc)">
          <Icon name="close" size={16} />
        </button>
      </header>
      <Section title="Kimin adamları" icon="crown">
        <p className="hint">
          {column.kind === 'patrol'
            ? `${info.name}'nın tek büyük devriyesi: her ${Math.round(balance.cities.crown.patrol.slotSeconds / 60)} dakikada bir, tacın lordlarından birinin sarayına uğrar, orada biraz kalıp başkente döner.`
            : `${info.name}'nın haraççıları: öbür taca bağlı lordların kapısına ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelir, hazineden ${pctText(tributeShareNow(key, column.crown, now))} pay (en az ${balance.cities.crown.patrol.tribute.min} altın) ister.`}
        </p>
        <Stat label="Tahtta" value={`${info.ruler} · ${trait.name.toLocaleLowerCase('tr-TR')}`} />
        <Stat label="Seninle ilişkisi" value={`${relation > 0 ? '+' : ''}${relation}`} />
        <Stat label="Senin için" value={mine ? 'biat ettiğin taç' : kingdom.liege === undefined ? 'henüz biat etmedin' : 'rakip taç'} />
      </Section>
      <Section title="Şimdi nereye" icon="map">
        {column.lordName ? (
          <p className="hint">
            {toMe ? 'Senin sarayına' : `${column.lordName} sarayına`} gidiyorlar.{' '}
            {column.kind === 'patrol'
              ? toMe
                ? `Eğlence merkezin varsa içip eğlenir, yaklaşık ${fmt(tipPreview(kingdom, column.crown, online, now))} altın bahşiş bırakırlar${waysText(key, column.crown, now, 'tip') ? ` (${waysText(key, column.crown, now, 'tip')})` : ''}.`
                : 'Orada içer, eğlenir, lorda bahşiş bırakırlar.'
              : toMe
                ? `Kapına gelince hazinenin payını isteyecekler: şimdiki hazinenle yaklaşık ${fmt(tributeDemand(kingdom.stock.gold, ways.tribute))} altın. Öde, reddet ya da konuş.`
                : 'Kapıda haraç isteyecek, cevabı bekleyecekler.'}
          </p>
        ) : (
          <p className="hint">Başkente dönüyorlar.</p>
        )}
      </Section>
      <button className="btn small primary" onClick={() => onCrown(column.crown)}>
        <Icon name="crown" size={16} /> {info.name} sayfasını aç
      </button>
    </section>
  )
}
