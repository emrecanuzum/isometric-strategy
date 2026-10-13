import { armyAt, atWar } from '@game/shared'
import type { Point } from '@game/shared'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import type { Rival } from '../../net/online'
import { Icon } from '../icons'
import type { Online } from './online'

// While an army is being sent somewhere: the kingdoms the player is at war with, down the right side, each with the
// marches that make sense against it (lay siege to its palace, go for its trade post, fall on one of its armies), so
// they need not be found on the map.

const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'

export function WarTargets({
  online,
  rivals,
  now,
  onSend,
  onHome,
  onShow,
}: {
  online: Online
  rivals: Rival[]
  now: number
  onSend: (tile: Point) => void
  onHome: () => void
  onShow: (tile: Point) => void
}) {
  const enemies = online.kingdoms.filter((k) => k.id !== online.me && atWar(online.pacts, online.me, k.id))
  return (
    <aside className="war-targets frame" aria-label="Hedefler">
      <header>
        <Icon name="swords" size={16} /> Hızlı hedefler
      </header>
      <button className="btn small" onClick={onHome}>
        <Icon name="home" size={16} /> Eve dön
      </button>
      {enemies.length === 0 && <p className="hint">Savaşta olduğun krallık yok. Haritada bir yere tıkla.</p>}
      {enemies.map((k) => {
        const rival = rivals.find((r) => r.id === k.id)
        const post = rival?.buildings.find((b) => b.kind === 'tradePost')
        const armies = online.armies.filter((a) => a.kingdom_id === k.id && a.status !== 'battle')
        const shielded = (k.shieldUntil ?? 0) > now
        return (
          <section key={k.id} className="war-target">
            <b>
              <i style={{ background: swatch(k.color) }} /> {k.name}
              <button className="btn icon-only" onClick={() => onShow(k.site)} aria-label={`${k.name} haritada göster`} title="Haritada göster">
                <Icon name="pin" size={16} />
              </button>
            </b>
            <button className="btn small" onClick={() => onSend(k.site)} title={shielded ? 'Saray kalkanlı: ordu kapıda bekler' : undefined}>
              <Icon name="crown" size={16} /> Sarayını kuşat{shielded ? ` (kalkan ${Math.ceil(((k.shieldUntil ?? 0) - now) / 60000)} dk)` : ''}
            </button>
            {post && (
              <button className="btn small" onClick={() => onSend({ x: post.x + post.size + 0.5, y: post.y + post.size + 0.5 })}>
                <Icon name="trade" size={16} /> Ticaret noktasına git
              </button>
            )}
            {armies.map((a, i) => (
              <button key={a.id} className="btn small" onClick={() => onSend(armyAt(a, now))}>
                <Icon name="swords" size={16} /> {armies.length > 1 ? `${i + 1}. ordusuna` : 'Ordusuna'} saldır
              </button>
            ))}
          </section>
        )
      })}
    </aside>
  )
}
