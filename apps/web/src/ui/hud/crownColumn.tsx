import { balance, crownRelation, crownTraitAt, crownWays, palaceLevel, tributeDemand } from '@game/shared'
import type { Kingdom, World } from '@game/shared'
import { cityInfo } from '../../game/cities'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import { crownKeyOf, pctText, rivalPurse, tipPreview, tributeShareNow, waysText } from './crownHouse'
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
  const title = column.kind === 'patrol' ? L(`${info.capital} devriyesi`, `${info.capital} patrol`) : L(`${info.capital} haraççıları`, `${info.capital} tribute collectors`)
  // A lord still on a level 1 palace: tipped without a hall, courted with a purse instead of taxed.
  const purse = rivalPurse(kingdom, column.crown, now)
  const heading = column.kind === 'tribute' && toMe && purse !== null ? L(`${info.capital} elçileri`, `${info.capital} envoys`) : title
  return (
    <section className="sheet frame" aria-labelledby="column-title">
      <header className="sheet-head">
        <Icon name={column.kind === 'patrol' ? 'banner' : 'gold'} size={32} />
        <div>
          <h2 id="column-title" style={{ color: info.ink }}>{heading}</h2>
          <small>
            {info.name} · {info.ruler} ({L(trait.name, trait.nameEn ?? trait.name).toLocaleLowerCase(locale())})
          </small>
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body">
        <Section title={L('Kimin adamları', 'Whose men')} icon="crown">
          <p className="hint">
            {column.kind === 'patrol'
              ? L(`${info.name}'nın tek büyük devriyesi: her ${Math.round(balance.cities.crown.patrol.slotSeconds / 60)} dakikada bir, tacın lordlarından birinin sarayına uğrar, orada biraz kalıp başkente döner.`, `The one great patrol of the ${info.name}: every ${Math.round(balance.cities.crown.patrol.slotSeconds / 60)} minutes it calls at the palace of one of the crown's lords, lingers a while and rides back to the capital.`)
              : L(`${info.name}'nın haraççıları: öbür taca bağlı lordların kapısına ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelir, hazineden ${pctText(tributeShareNow(key, column.crown, now))} pay (en az saray seviyesi × ${balance.cities.crown.patrol.tribute.minPerPalaceLevel} altın) ister.`, `The tribute collectors of the ${info.name}: every ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} minutes they knock at the door of a lord sworn to the other crown and ask for ${pctText(tributeShareNow(key, column.crown, now))} of the treasury (at least ${balance.cities.crown.patrol.tribute.minPerPalaceLevel} × palace level gold).`)}
          </p>
          <Stat label={L('Tahtta', 'On the throne')} value={`${info.ruler} · ${L(trait.name, trait.nameEn ?? trait.name).toLocaleLowerCase(locale())}`} />
          <Stat label={L('Seninle ilişkisi', 'Relations with you')} value={`${relation > 0 ? '+' : ''}${relation}`} />
          <Stat label={L('Senin için', 'To you')} value={mine ? L('biat ettiğin taç', 'the crown you are sworn to') : kingdom.liege === undefined ? L('henüz biat etmedin', 'not sworn yet') : L('rakip taç', 'the rival crown')} />
        </Section>
        <Section title={L('Şimdi nereye', 'Where now')} icon="map">
          {column.lordName ? (
            <p className="hint">
              {toMe ? L('Senin sarayına gidiyorlar.', 'They are riding to your palace.') : L(`${column.lordName} sarayına gidiyorlar.`, `They are riding to ${column.lordName}'s palace.`)}{' '}
              {column.kind === 'patrol'
                ? toMe && purse !== null
                  ? L(`Sarayın henüz 1. seviyede: yeni lordlarına yaklaşık ${fmt(tipPreview(kingdom, column.crown, online, now))} altın bırakırlar.`, `Your palace is still at level 1: they leave their new lord about ${fmt(tipPreview(kingdom, column.crown, online, now))} gold.`)
                  : toMe
                  ? L(`Eğlence merkezin varsa içip eğlenir, yaklaşık ${fmt(tipPreview(kingdom, column.crown, online, now))} altın bahşiş bırakırlar${waysText(key, column.crown, now, 'tip') ? ` (${waysText(key, column.crown, now, 'tip')})` : ''}.`, `If you have an entertainment hall they drink, make merry and leave a tip of about ${fmt(tipPreview(kingdom, column.crown, online, now))} gold${waysText(key, column.crown, now, 'tip') ? ` (${waysText(key, column.crown, now, 'tip')})` : ''}.`)
                  : L('Orada içer, eğlenir, lorda bahşiş bırakırlar.', 'There they drink, make merry and leave the lord a tip.')
                : toMe && purse !== null
                  ? L(`Sarayın henüz 1. seviyede, haraç istemezler: seni kendi taraflarına çekmek için yaklaşık ${fmt(purse)} altın kese bırakırlar. Saray 2. seviyeye çıkınca haraç başlar.`, `Your palace is still at level 1, so they ask no tribute: to win you over they leave a purse of about ${fmt(purse)} gold. Once the palace reaches level 2 the tribute begins.`)
                  : toMe
                  ? L(`Kapına gelince hazinenin payını isteyecekler: şimdiki hazinenle yaklaşık ${fmt(tributeDemand(kingdom.stock.gold, ways.tribute, palaceLevel(kingdom, now)))} altın. Öde, reddet ya da konuş.`, `At your door they will ask for their share of the treasury: about ${fmt(tributeDemand(kingdom.stock.gold, ways.tribute, palaceLevel(kingdom, now)))} gold with what you hold now. Pay, refuse or talk.`)
                  : L('Kapıda haraç isteyecek, cevabı bekleyecekler.', 'They will demand tribute at the door and wait for an answer.')}
            </p>
          ) : (
            <p className="hint">{L('Başkente dönüyorlar.', 'They are riding back to the capital.')}</p>
          )}
        </Section>
        <button className="btn primary wide" onClick={() => onCrown(column.crown)}>
          <Icon name="crown" size={16} /> {L(`${info.name} sayfasını aç`, `Open the page of the ${info.name}`)}
        </button>
      </div>
    </section>
  )
}
