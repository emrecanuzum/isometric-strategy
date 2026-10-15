import { balance, cutOff, imprisoned, palaceLevel } from '@game/shared'
import type { Kingdom } from '@game/shared'
import { Icon } from '../icons'
import type { TabId } from './Hud'
import type { WarNote } from './war'

// Standing trouble in the kingdom, kept on the right edge of the map between the top bar and the map buttons until it
// is put right. Tapping one opens the tab where it is dealt with.
export function MapAlerts({ kingdom, now, war = [], onOpen, onQueen }: { kingdom: Kingdom; now: number; war?: WarNote[]; onOpen: (tab: TabId) => void; onQueen?: () => void }) {
  // The fighting first: war is what matters most (see warNotes).
  const alerts: { key: string; tab: TabId; text: string }[] = war.map((n) => ({ key: n.key, tab: 'army', text: n.text }))
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
  if ((kingdom.revoltUntil ?? 0) > now) alerts.push({ key: 'revolt', tab: 'people', text: 'Halk ayaklandı: üretim yarıda, mutluluk düşük.' })
  // A palace past its second level and no lady at court (raised before the rule): the house needs a queen, at once.
  const needsQueen = palaceLevel(kingdom, now) >= balance.dynasty.queenForPalaceLevel && !kingdom.queen && !kingdom.queenHeldBy
  if (alerts.length === 0 && !needsQueen) return null
  return (
    <div className="map-alerts" role="status">
      {needsQueen && (
        <div className="map-alert frame urgent">
          <Icon name="crown" size={16} />
          <span>Kraliçeye ihtiyacımız var! Sarayın bu büyüklükte bir hanedan ister: kraliçe olmadan çocuk doğmaz, varis olmaz.</span>
          <button className="btn small primary" onClick={onQueen}>
            Kraliçe getir
          </button>
        </div>
      )}
      {alerts.map((a) => (
        <button key={a.key} className="map-alert frame" onClick={() => onOpen(a.tab)}>
          <Icon name="warn" size={16} />
          <span>{a.text}</span>
        </button>
      ))}
    </div>
  )
}
