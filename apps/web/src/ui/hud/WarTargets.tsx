import { armyAt, atWar, balance, territoryRect } from '@game/shared'
import type { Point } from '@game/shared'
import { KINGDOM_COLORS } from '../../game/buildingSprites'
import type { KingdomColor } from '../../game/buildingSprites'
import type { Rival } from '../../net/online'
import { Icon } from '../icons'
import { L } from '../../lib/i18n'
import type { Online } from './online'

// While an army is being sent somewhere: the kingdoms the player is at war with, down the left side, each with the
// marches that make sense against it (lay siege to its palace, camp at its border to frighten it, go for its trade
// post, meet one of its armies in battle), so they need not be found on the map.

const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'

// Just outside a kingdom's border, on the side facing `from`: where an army camps to frighten its people.
function borderPoint(site: Point, palace: number, from: Point): Point {
  const stage = Math.max(0, Math.min(balance.territory.stageParcels.length - 1, palace - 1))
  const r = territoryRect(site, stage)
  const cx = r.x + r.size / 2
  const cy = r.y + r.size / 2
  const dx = from.x - cx
  const dy = from.y - cy
  const d = Math.hypot(dx, dy) || 1
  // From the middle toward the army, out past the edge by a few tiles.
  const reach = r.size / 2 / Math.max(Math.abs(dx / d), Math.abs(dy / d)) + 3
  return { x: cx + (dx / d) * reach, y: cy + (dy / d) * reach }
}

export function WarTargets({
  online,
  rivals,
  now,
  from,
  onSend,
  onHome,
  onShow,
}: {
  online: Online
  rivals: Rival[]
  now: number
  // Where the army being sent stands.
  from: Point | null
  onSend: (tile: Point) => void
  onHome: () => void
  onShow: (tile: Point) => void
}) {
  const enemies = online.kingdoms.filter((k) => k.id !== online.me && atWar(online.pacts, online.me, k.id))
  return (
    <aside className="war-targets frame" aria-label={L('Hedefler', 'Targets')}>
      <header>
        <Icon name="swords" size={16} /> {L('Hızlı hedefler', 'Quick targets')}
      </header>
      <button className="btn small" onClick={onHome}>
        <Icon name="home" size={16} /> {L('Eve dön', 'Return home')}
      </button>
      {enemies.length === 0 && <p className="hint">{L('Savaşta olduğun lord yok. Haritada bir yere tıkla.', 'You are at war with no lord. Click somewhere on the map.')}</p>}
      {enemies.map((k) => {
        const rival = rivals.find((r) => r.id === k.id)
        const post = rival?.buildings.find((b) => b.kind === 'tradePost')
        const armies = online.armies.filter((a) => a.kingdom_id === k.id && a.status !== 'battle')
        const shielded = (k.shieldUntil ?? 0) > now
        return (
          <section key={k.id} className="war-target">
            <b>
              <i style={{ background: swatch(k.color) }} /> {k.name}
              <button className="btn icon-only" onClick={() => onShow(k.site)} aria-label={L(`${k.name} haritada göster`, `Show ${k.name} on the map`)} title={L('Haritada göster', 'Show on the map')}>
                <Icon name="pin" size={16} />
              </button>
            </b>
            <button className="btn small" onClick={() => onSend(k.site)} title={shielded ? L('Saray kalkanlı: ordu kapıda bekler', 'The palace is shielded: the army waits at the gate') : undefined}>
              <Icon name="crown" size={16} /> {L('Sarayını kuşat', 'Besiege their palace')}{shielded ? L(` (kalkan ${Math.ceil(((k.shieldUntil ?? 0) - now) / 60000)} dk)`, ` (shield ${Math.ceil(((k.shieldUntil ?? 0) - now) / 60000)} min)`) : ''}
            </button>
            {from && (
              <button className="btn small" onClick={() => onSend(borderPoint(k.site, k.palace, from))} title={L('Sınırlarında bekleyen ordu halkını korkutur (mutluluk düşer)', 'An army waiting at their border frightens their people (happiness drops)')}>
                <Icon name="warn" size={16} /> {L('Gözdağı ver (sınırda bekle)', 'Intimidate (wait at the border)')}
              </button>
            )}
            {post && (
              <button className="btn small" onClick={() => onSend({ x: post.x + post.size + 0.5, y: post.y + post.size + 0.5 })}>
                <Icon name="trade" size={16} /> {L('Ticaret noktasına git', 'Go to their trading post')}
              </button>
            )}
            {armies.map((a, i) => (
              <button key={a.id} className="btn small" onClick={() => onSend(armyAt(a, now))}>
                <Icon name="swords" size={16} /> {L('Muharebeye git', 'Go to battle')}{armies.length > 1 ? L(` (${i + 1}. ordusu)`, ` (their army ${i + 1})`) : ''}
              </button>
            ))}
          </section>
        )
      })}
    </aside>
  )
}
