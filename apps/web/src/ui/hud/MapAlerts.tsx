import { balance, cutOff, imprisoned } from '@game/shared'
import type { Kingdom } from '@game/shared'
import { Icon } from '../icons'
import type { TabId } from './Hud'

// Standing trouble in the kingdom, kept on the right edge of the map between the top bar and the map buttons until it
// is put right. Tapping one opens the tab where it is dealt with.
export function MapAlerts({ kingdom, now, onOpen }: { kingdom: Kingdom; now: number; onOpen: (tab: TabId) => void }) {
  const alerts: { key: string; tab: TabId; text: string }[] = []
  if (imprisoned(kingdom.buildings, kingdom.site, now)) {
    alerts.push({
      key: 'prison',
      tab: 'build',
      text: `Krallığın bir hapishane! Sura bir kapı koy, halk dışarı çıkamıyor (mutluluk ${balance.society.happiness.imprisoned}).`,
    })
  }
  const cut = cutOff(kingdom.buildings, kingdom.site, now).size
  if (cut > 0) alerts.push({ key: 'cut', tab: 'build', text: `${cut} yapı sur arkasında kaldı: köylüler ulaşamıyor, çalışmıyor.` })
  if ((kingdom.fearUntil ?? 0) > now) {
    alerts.push({ key: 'fear', tab: 'people', text: `Sınırında düşman ordusu bekliyor: halk korkuyor (mutluluk ${balance.military.fear.happiness}).` })
  }
  if ((kingdom.revoltUntil ?? 0) > now) alerts.push({ key: 'revolt', tab: 'people', text: 'Halk ayaklandı: üretim yarıda, mutluluk düşük.' })
  if (alerts.length === 0) return null
  return (
    <div className="map-alerts" role="status">
      {alerts.map((a) => (
        <button key={a.key} className="map-alert frame" onClick={() => onOpen(a.tab)}>
          <Icon name="warn" size={16} />
          <span>{a.text}</span>
        </button>
      ))}
    </div>
  )
}
