import { balance, campSoldiers, clogsOf, cutOff, imprisoned, navyOf, outlawEffects, overreachFor, palaceLevel, townLoyalty, townRevolting } from '@game/shared'
import { showPart } from './Subtabs'
import { useState } from 'react'
import { showArmyPart } from './war'
import type { Kingdom } from '@game/shared'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import { BUILDING_NAMES, RESOURCE_NAMES, WEAPON_NAMES } from '../names'
import type { TabId } from './Hud'
import type { WarNote } from './war'

// Standing trouble in the kingdom, kept on the right edge of the map between the top bar and the map buttons until it
// is put right. Tapping one opens the tab where it is dealt with.
export function MapAlerts({
  kingdom,
  now,
  war = [],
  onOpen,
  onQueen,
  onTown,
}: {
  kingdom: Kingdom
  now: number
  war?: WarNote[]
  onOpen: (tab: TabId) => void
  onQueen?: () => void
  // Opens a held town's sheet (the over-expansion card opens the most restless one).
  onTown?: (town: number) => void
}) {
  // Folded away to a header with the count (remembered in the browser), like the timers.
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1'
    } catch {
      return false
    }
  })
  const fold = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(FOLD_KEY, folded ? '0' : '1')
    } catch {
      // Without storage it is only folded for now.
    }
  }
  // Cards put aside with their ×: gone for this visit only, back when the game is opened again (kept in memory).
  const [, setShut] = useState(0)
  const shut = (key: string) => {
    dismissed.add(key)
    setShut((n) => n + 1)
  }
  // The fighting first: war is what matters most (see warNotes).
  const alerts: { key: string; tab: TabId; text: string; sea?: boolean; town?: number; mild?: boolean; house?: boolean }[] = war.map((n) => ({ key: n.key, tab: 'army', text: n.text }))
  // A brother risen against the ruler (CLAUDE.md §9.1.1): first of all, until his camp is put down.
  const pretender = kingdom.pretender
  if (pretender) {
    const left = Math.max(0, Math.ceil((pretender.marchAt - now) / 60_000))
    alerts.unshift({
      key: 'pretender',
      tab: 'kingdom',
      house: true,
      text: pretender.marching
        ? L(`Taht davacısı ${pretender.person.name} sarayını kuşatıyor!`, `The pretender ${pretender.person.name} is besieging your palace!`)
        : L(`Taht davacısı ${pretender.person.name} karargâh kurdu: ${campSoldiers(pretender, now)} asi · ${left} dk sonra sarayına yürür.`, `The pretender ${pretender.person.name} has made camp: ${campSoldiers(pretender, now)} rebels · marches on your palace in ${left} min.`),
    })
  }
  if (imprisoned(kingdom.buildings, kingdom.site, now)) {
    alerts.push({
      key: 'prison',
      tab: 'build',
      text: L(`Lordluğun bir hapishane! Sura bir kapı koy, halk dışarı çıkamıyor (mutluluk ${balance.society.happiness.imprisoned}).`, `Your lordship is a prison! Put a gate in the wall; the people cannot get out (happiness ${balance.society.happiness.imprisoned}).`),
    })
  }
  const cut = cutOff(kingdom.buildings, kingdom.site, now).size
  if (cut > 0) alerts.push({ key: 'cut', tab: 'build', text: L(`${cut} yapı sur arkasında kaldı: köylüler ulaşamıyor, çalışmıyor.`, `${cut} building${cut === 1 ? ' is' : 's are'} cut off behind the walls: the villagers cannot reach ${cut === 1 ? 'it' : 'them'}, so no work is done.`) })
  if ((kingdom.fearUntil ?? 0) > now) {
    alerts.push({ key: 'fear', tab: 'people', text: L(`Sınırında düşman ordusu bekliyor: halk korkuyor (mutluluk ${balance.military.fear.happiness}).`, `An enemy army waits at your border: the people are afraid (happiness ${balance.military.fear.happiness}).`) })
  }
  // The navy at war (CLAUDE.md §8.5): a blockade of our dock, our fleets out against an enemy.
  if (kingdom.blockade) alerts.push({ key: 'blockade', tab: 'army', sea: true, text: L(`${kingdom.blockade.name} filosu iskeleni abluka ediyor: balık ve deniz ticareti durdu.`, `${kingdom.blockade.name}'s fleet is blockading your dock: fishing and sea trade have stopped.`) })
  for (const f of navyOf(kingdom).fleets) {
    const m = f.mission
    if (m.kind === 'blockade') alerts.push({ key: `fleet${f.id}`, tab: 'army', sea: true, text: m.arriveAt > now ? L(`Filon ${m.name} iskelesine yol alıyor.`, `Your fleet is sailing to ${m.name}'s dock.`) : L(`Filon ${m.name} iskelesini abluka ediyor.`, `Your fleet is blockading ${m.name}'s dock.`) })
    if (m.kind === 'raid') alerts.push({ key: `fleet${f.id}`, tab: 'army', sea: true, text: L(`Filon ${m.name} kıyısına akına gidiyor.`, `Your fleet is off to raid ${m.name}'s coast.`) })
  }
  // Bandits on the road by the trade post, pirates by the dock (CLAUDE.md §7.9, §8.5): a nuisance, so a mild card.
  const outlaws = outlawEffects(kingdom)
  if (outlaws.road > 0)
    alerts.push({ key: 'bandits', tab: 'trade', mild: outlaws.road < 0.4, text: L(`Yağmacılar ticaret yolunun %${Math.round(outlaws.road * 100)}'ini tutuyor: tüccarın %${Math.round(outlaws.merchantCut * 100)} az kazanıyor. Çeteye tıkla, bir orduyla takip et.`, `Bandits hold ${Math.round(outlaws.road * 100)}% of the trade road: your merchant earns ${Math.round(outlaws.merchantCut * 100)}% less. Click the band and send an army after it.`) })
  if (outlaws.sea > 0)
    alerts.push({ key: 'pirates', tab: 'army', sea: true, mild: outlaws.sea < 0.6, text: L(`Korsanlar iskelenin önünde (etki %${Math.round(outlaws.sea * 100)}): deniz ticareti tehlikede, balık azaldı. Tekneye tıkla, bir filoyla takip et.`, `Pirates off your dock (effect ${Math.round(outlaws.sea * 100)}%): sea trade is in danger and the catch is down. Click the boat and send a fleet after it.`) })
  // Production going nowhere (CLAUDE.md §6.4, "üretim ağı tıkandı"): one card per good or weapon with no room.
  const clogs = clogsOf(kingdom, now)
  for (const makes of [...new Set(clogs.map((c) => c.makes))]) {
    const these = clogs.filter((c) => c.makes === makes)
    const kinds = [...new Set(these.map((c) => c.kind))].map((k) => L(`${these.filter((c) => c.kind === k).length} ${BUILDING_NAMES[k].toLocaleLowerCase(locale())}`, `${these.filter((c) => c.kind === k).length} × ${BUILDING_NAMES[k].toLocaleLowerCase(locale())}`)).join(', ')
    const weapon = these[0].reason === 'armory'
    const name = weapon ? WEAPON_NAMES[makes as keyof typeof WEAPON_NAMES].toLocaleLowerCase(locale()) : RESOURCE_NAMES[makes as keyof typeof RESOURCE_NAMES].toLocaleLowerCase(locale())
    alerts.push({
      key: `clog:${makes}`,
      tab: 'store',
      mild: !weapon,
      text: weapon ? L(`Cephanelik dolu: ${name}. ${kinds} boşta duruyor; üretim ağı tıkandı.`, `Armoury full: ${name}. ${kinds} standing idle; the production chain is clogged.`) : L(`Ambar dolu: ${name}. ${kinds} boşa üretiyor.`, `Storehouse full: ${name}. ${kinds} producing to waste.`),
    })
  }
  if ((kingdom.revoltUntil ?? 0) > now) alerts.push({ key: 'revolt', tab: 'people', text: L('Halk ayaklandı: üretim yarıda, mutluluk düşük.', 'The people have revolted: production is halved, happiness is low.') })
  // Holding too many towns at once (CLAUDE.md §8.4): the card opens the most restless of them.
  const held = kingdom.towns ?? []
  const over = overreachFor(held)
  if (over.tier >= 0) {
    const restless = [...held].sort((a, b) => townLoyalty(a) - townLoyalty(b))[0]
    const rising = held.filter((h) => townRevolting(h, now)).length
    const last = over.tier >= balance.towns.overreach.tiers.length - 1
    const effects = L(
      `sadakat ${over.loyalty}${over.loyaltyCap < 100 ? ` (en fazla %${over.loyaltyCap})` : ''}, mutluluk ${over.happiness}, bakım ×${String(over.upkeepFactor).replace('.', ',')}`,
      `loyalty ${over.loyalty}${over.loyaltyCap < 100 ? ` (at most ${over.loyaltyCap}%)` : ''}, happiness ${over.happiness}, upkeep ×${over.upkeepFactor}`,
    )
    alerts.push({
      key: 'overreach',
      tab: 'army',
      town: restless.id,
      mild: over.tier === 0,
      text: last
        ? L(`Aşırı büyüme! ${held.length} kasaba elinde: hepsi ayaklanıyor${rising > 0 ? ` (${rising} kasaba ayaklanmada)` : ''}; ${effects}. Birini serbest bırak (kasaba paneli).`, `Overreach! You hold ${held.length} towns: all of them are rising${rising > 0 ? ` (${rising} in revolt)` : ''}; ${effects}. Release one (town panel).`)
        : L(`Aşırı büyüme: ${held.length} kasaba elinde; ${effects}.${rising > 0 ? ` ${rising} kasaba ayaklanmada.` : ''} Bir kasaba daha alırsan ceza ağırlaşır.`, `Overreach: you hold ${held.length} towns; ${effects}.${rising > 0 ? ` ${rising} in revolt.` : ''} Take one more town and the penalty grows.`),
    })
  }
  // A palace past its second level and no lady at court (raised before the rule): the house needs a queen, at once.
  const needsQueen = palaceLevel(kingdom, now) >= balance.dynasty.queenForPalaceLevel && !kingdom.queen && !kingdom.queenHeldBy
  // A card comes back when it grows worse (a mild one turning grave) even after it was put aside.
  const keyOf = (a: { key: string; mild?: boolean }) => `${a.key}${a.mild ? ':mild' : ''}`
  const shown = alerts.filter((a) => !dismissed.has(keyOf(a)))
  const queen = needsQueen && !dismissed.has('queen')
  if (shown.length === 0 && !queen) return null
  const count = shown.length + (queen ? 1 : 0)
  return (
    <div className={folded ? 'map-alerts folded' : 'map-alerts'} role="status">
      <button className="map-alerts-head frame" onClick={fold} aria-expanded={!folded}>
        <Icon name={folded ? 'plus' : 'minus'} size={8} />
        <span>{L('Uyarılar', 'Alerts')}</span>
        <b>{count}</b>
      </button>
      {!folded && queen && (
        <div className="map-alert frame urgent">
          <Shut onClick={() => shut('queen')} />
          <Icon name="crown" size={16} />
          <span>{L('Kraliçeye ihtiyacımız var! Sarayın bu büyüklükte bir hanedan ister: kraliçe olmadan çocuk doğmaz, varis olmaz.', 'We need a queen! A palace this grand wants a dynasty: without a queen no children are born, and there is no heir.')}</span>
          <button className="btn small primary" onClick={onQueen}>
            {L('Kraliçe getir', 'Bring a queen')}
          </button>
        </div>
      )}
      {!folded &&
        shown.map((a) => (
          <div key={a.key} className={`map-alert frame${a.mild ? ' mild' : ''}`}>
            <button
              className="map-alert-open"
              onClick={() => (a.town !== undefined && onTown ? onTown(a.town) : (a.sea && showArmyPart('sea'), a.house && showPart('palace', 'house'), onOpen(a.tab)))}
            >
              <Icon name="warn" size={16} />
              <span>{a.text}</span>
            </button>
            <Shut onClick={() => shut(keyOf(a))} />
          </div>
        ))}
    </div>
  )
}

const FOLD_KEY = 'alerts-folded'

// The cards put aside in this visit (a reload brings them all back).
const dismissed = new Set<string>()

function Shut({ onClick }: { onClick: () => void }) {
  return (
    <button className="map-alert-x" onClick={onClick} aria-label={L('Uyarıyı kapat', 'Dismiss alert')} title={L('Kapat (oyunu yeniden açınca yine görünür)', 'Dismiss (it shows again when the game is reopened)')}>
      <Icon name="close" size={8} />
    </button>
  )
}
