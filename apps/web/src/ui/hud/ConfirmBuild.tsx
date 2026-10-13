import { BUILDINGS, isFree } from '@game/shared'
import type { BuildingKind, Kingdom } from '@game/shared'
import { useEffect, useRef } from 'react'
import { STRUCTURE_SPRITES, palaceIn } from '../../game/buildingSprites'
import { Icon } from '../icons'
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
        <h2 id="confirm-title">{count > 1 ? `${count} ${BUILDING_NAMES[kind].toLowerCase()} kurulsun mu?` : `${BUILDING_NAMES[kind]} buraya kurulsun mu?`}</h2>
        <p id="confirm-text" className="hint">
          {kind === 'palace'
            ? 'Sarayın yeri sonradan değiştirilemez.'
            : count > 1
              ? 'Kaynak yettiği kadarı kurulur; inşaat yeri boşaldıkça sırayla başlar.'
              : 'Kaynaklar harcanır ve inşaat başlar.'}
        </p>
        <span className="card-meta">
          <CostList cost={cost} stock={kingdom.stock} />
          {spec.buildSeconds ? (
            <span className="chip">
              <Icon name="time" size={8} /> {spec.buildSeconds} sn
            </span>
          ) : null}
          <span className="chip">
            {spec.size}×{spec.size}
          </span>
        </span>
        <div className="row">
          <button ref={yes} className="btn primary" onClick={onConfirm}>
            <Icon name="build" size={16} /> Evet, inşa et
          </button>
          <button className="btn" onClick={onCancel}>
            Vazgeç
          </button>
        </div>
      </div>
    </section>
  )
}
