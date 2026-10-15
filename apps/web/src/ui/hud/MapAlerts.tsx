import { balance, clogsOf, cutOff, imprisoned, navyOf, overreachFor, palaceLevel, townLoyalty, townRevolting } from '@game/shared'
import { useState } from 'react'
import { showArmyPart } from './war'
import type { Kingdom } from '@game/shared'
import { Icon } from '../icons'
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
  // The fighting first: war is what matters most (see warNotes).
  const alerts: { key: string; tab: TabId; text: string; sea?: boolean; town?: number; mild?: boolean }[] = war.map((n) => ({ key: n.key, tab: 'army', text: n.text }))
  if (imprisoned(kingdom.buildings, kingdom.site, now)) {
    alerts.push({
      key: 'prison',
      tab: 'build',
      text: `Lordluğun bir hapishane! Sura bir kapı koy, halk dışarı çıkamıyor (mutluluk ${balance.society.happiness.imprisoned}).`,
    })
  }
  const cut = cutOff(kingdom.buildings, kingdom.site, now).size
  if (cut > 0) alerts.push({ key: 'cut', tab: 'build', text: `${cut} yapı sur arkasında kaldı: köylüler ulaşamıyor, çalışmıyor.` })
  if ((kingdom.fearUntil ?? 0) > now) {
    alerts.push({ key: 'fear', tab: 'people', text: `Sınırında düşman ordusu bekliyor: halk korkuyor (mutluluk ${balance.military.fear.happiness}).` })
  }
  // The navy at war (CLAUDE.md §8.5): a blockade of our dock, our fleets out against an enemy.
  if (kingdom.blockade) alerts.push({ key: 'blockade', tab: 'army', sea: true, text: `${kingdom.blockade.name} filosu iskeleni abluka ediyor: balık ve deniz ticareti durdu.` })
  for (const f of navyOf(kingdom).fleets) {
    const m = f.mission
    if (m.kind === 'blockade') alerts.push({ key: `fleet${f.id}`, tab: 'army', sea: true, text: m.arriveAt > now ? `Filon ${m.name} iskelesine yol alıyor.` : `Filon ${m.name} iskelesini abluka ediyor.` })
    if (m.kind === 'raid') alerts.push({ key: `fleet${f.id}`, tab: 'army', sea: true, text: `Filon ${m.name} kıyısına akına gidiyor.` })
  }
  // Production going nowhere (CLAUDE.md §6.4, "üretim ağı tıkandı"): one card per good or weapon with no room.
  const clogs = clogsOf(kingdom, now)
  for (const makes of [...new Set(clogs.map((c) => c.makes))]) {
    const these = clogs.filter((c) => c.makes === makes)
    const kinds = [...new Set(these.map((c) => c.kind))].map((k) => `${these.filter((c) => c.kind === k).length} ${BUILDING_NAMES[k].toLowerCase()}`).join(', ')
    const weapon = these[0].reason === 'armory'
    const name = weapon ? WEAPON_NAMES[makes as keyof typeof WEAPON_NAMES].toLowerCase() : RESOURCE_NAMES[makes as keyof typeof RESOURCE_NAMES].toLowerCase()
    alerts.push({
      key: `clog:${makes}`,
      tab: 'store',
      mild: !weapon,
      text: weapon ? `Cephanelik dolu: ${name}. ${kinds} boşta duruyor; üretim ağı tıkandı.` : `Ambar dolu: ${name}. ${kinds} boşa üretiyor.`,
    })
  }
  if ((kingdom.revoltUntil ?? 0) > now) alerts.push({ key: 'revolt', tab: 'people', text: 'Halk ayaklandı: üretim yarıda, mutluluk düşük.' })
  // Holding too many towns at once (CLAUDE.md §8.4): the card opens the most restless of them.
  const held = kingdom.towns ?? []
  const over = overreachFor(held)
  if (over.tier >= 0) {
    const restless = [...held].sort((a, b) => townLoyalty(a) - townLoyalty(b))[0]
    const rising = held.filter((h) => townRevolting(h, now)).length
    const last = over.tier >= balance.towns.overreach.tiers.length - 1
    const effects = `sadakat ${over.loyalty}${over.loyaltyCap < 100 ? ` (en fazla %${over.loyaltyCap})` : ''}, mutluluk ${over.happiness}, bakım ×${String(over.upkeepFactor).replace('.', ',')}`
    alerts.push({
      key: 'overreach',
      tab: 'army',
      town: restless.id,
      mild: over.tier === 0,
      text: last
        ? `Aşırı büyüme! ${held.length} kasaba elinde: hepsi ayaklanıyor${rising > 0 ? ` (${rising} kasaba ayaklanmada)` : ''}; ${effects}. Birini serbest bırak (kasaba paneli).`
        : `Aşırı büyüme: ${held.length} kasaba elinde; ${effects}.${rising > 0 ? ` ${rising} kasaba ayaklanmada.` : ''} Bir kasaba daha alırsan ceza ağırlaşır.`,
    })
  }
  // A palace past its second level and no lady at court (raised before the rule): the house needs a queen, at once.
  const needsQueen = palaceLevel(kingdom, now) >= balance.dynasty.queenForPalaceLevel && !kingdom.queen && !kingdom.queenHeldBy
  if (alerts.length === 0 && !needsQueen) return null
  const count = alerts.length + (needsQueen ? 1 : 0)
  return (
    <div className={folded ? 'map-alerts folded' : 'map-alerts'} role="status">
      <button className="map-alerts-head frame" onClick={fold} aria-expanded={!folded}>
        <Icon name={folded ? 'plus' : 'minus'} size={8} />
        <span>Uyarılar</span>
        <b>{count}</b>
      </button>
      {!folded && needsQueen && (
        <div className="map-alert frame urgent">
          <Icon name="crown" size={16} />
          <span>Kraliçeye ihtiyacımız var! Sarayın bu büyüklükte bir hanedan ister: kraliçe olmadan çocuk doğmaz, varis olmaz.</span>
          <button className="btn small primary" onClick={onQueen}>
            Kraliçe getir
          </button>
        </div>
      )}
      {!folded &&
        alerts.map((a) => (
          <button
            key={a.key}
            className={`map-alert frame${a.mild ? ' mild' : ''}`}
            onClick={() => (a.town !== undefined && onTown ? onTown(a.town) : (a.sea && showArmyPart('sea'), onOpen(a.tab)))}
          >
            <Icon name="warn" size={16} />
            <span>{a.text}</span>
          </button>
        ))}
    </div>
  )
}

const FOLD_KEY = 'alerts-folded'
