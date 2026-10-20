import { BUILDINGS, isFree } from '@game/shared'
import type { BuildingKind, Kingdom } from '@game/shared'
import { useEffect, useRef } from 'react'
import { STRUCTURE_SPRITES, palaceIn } from '../../game/buildingSprites'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import { BUILDING_NAMES } from '../names'
import { CostList } from '../panels'
import { SpriteView } from './primitives'

// Asked once a spot is picked: building there spends the goods and starts the work, so the player confirms it.
export function ConfirmBuild({
  kind,
  kingdom,
  onConfirm,
  onCancel,
  count = 1,
}: {
  kind: BuildingKind
  kingdom: Kingdom
  // A dragged row of this many.
  count?: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const spec = BUILDINGS[kind]
  // The first lumber camp, house and field are free; in a row only the first one is.
  const paid = count - (isFree(kingdom, kind) ? 1 : 0)
  const cost = Object.fromEntries(Object.entries(spec.cost ?? {}).map(([r, v]) => [r, (v ?? 0) * paid]))
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => yes.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])
  const sprite = kind === 'palace' ? palaceIn(kingdom.color) : STRUCTURE_SPRITES[kind][0]
  return (
    <section className="confirm frame" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <span className="slot confirm-art">
        <SpriteView sprite={sprite} scale={spec.size > 1 ? 0.5 : 1} />
      </span>
      <div className="confirm-body">
        <h2 id="confirm-title">{count > 1 ? L(`${count} ${BUILDING_NAMES[kind].toLocaleLowerCase(locale())} kurulsun mu?`, `Build ${count} × ${BUILDING_NAMES[kind].toLocaleLowerCase(locale())}?`) : L(`${BUILDING_NAMES[kind]} buraya kurulsun mu?`, `Build the ${BUILDING_NAMES[kind].toLocaleLowerCase(locale())} here?`)}</h2>
        <p id="confirm-text" className="hint">
          {kind === 'palace'
            ? L('Sarayın yeri sonradan değiştirilemez.', 'The palace cannot be moved later.')
            : count > 1
              ? L('Kaynak yettiği kadarı kurulur; inşaat yeri boşaldıkça sırayla başlar.', 'As many as the goods allow are built; they start in turn as building slots free up.')
              : L('Kaynaklar harcanır ve inşaat başlar.', 'The goods are spent and construction begins.')}
        </p>
        <span className="card-meta">
          <CostList cost={cost} stock={kingdom.stock} />
          {spec.buildSeconds ? (
            <span className="chip">
              <Icon name="time" size={8} /> {spec.buildSeconds} {L('sn', 's')}
            </span>
          ) : null}
          <span className="chip">
            {kind === 'gate' ? '3×1' : `${spec.size}×${spec.size}`}
          </span>
        </span>
        <div className="row">
          <button ref={yes} className="btn primary" onClick={onConfirm}>
            <Icon name="build" size={16} /> {L('Evet, inşa et', 'Yes, build it')}
          </button>
          <button className="btn" onClick={onCancel}>
            {L('Vazgeç', 'Cancel')}
          </button>
        </div>
      </div>
    </section>
  )
}
