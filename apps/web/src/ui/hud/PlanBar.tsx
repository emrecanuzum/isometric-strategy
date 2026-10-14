import type { Building, Cost, Kingdom, PlanStep, Resource } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { BUILDING_NAMES } from '../names'
import { CostList } from '../panels'

// What the plan comes to, read off the kingdom before and after it: goods spent, and goods given back by demolitions.
function balanceOf(before: Kingdom, after: Kingdom) {
  const spent: Cost = {}
  const back: Cost = {}
  for (const r of Object.keys(before.stock) as Resource[]) {
    const d = Math.round(after.stock[r] - before.stock[r])
    if (d < 0) spent[r] = -d
    if (d > 0) back[r] = d
  }
  return { spent, back }
}

// "3 tarla kurulacak, 1 ev taşınacak, 2 yapı yıkılacak"
function describe(steps: PlanStep[], buildings: Building[]) {
  const built = new Map<string, number>()
  const moved = new Map<string, number>()
  let torn = 0
  for (const s of steps) {
    if (s.type === 'build') built.set(BUILDING_NAMES[s.kind], (built.get(BUILDING_NAMES[s.kind]) ?? 0) + 1)
    else if (s.type === 'move') {
      const b = buildings.find((x) => x.id === s.id)
      if (b) moved.set(BUILDING_NAMES[b.kind], (moved.get(BUILDING_NAMES[b.kind]) ?? 0) + 1)
    } else torn++
  }
  const list = (m: Map<string, number>) => [...m].map(([name, n]) => `${n} ${name.toLocaleLowerCase('tr')}`).join(', ')
  return [
    built.size > 0 && `${list(built)} kurulacak`,
    moved.size > 0 && `${list(moved)} taşınacak`,
    torn > 0 && `${torn} yapı yıkılacak`,
  ]
    .filter(Boolean)
    .join('; ')
}

// Builds, moves and demolitions wait here until the player confirms them all at once (CLAUDE.md §6.4).
export function PlanBar({
  steps,
  kingdom,
  planned,
  skipped,
  onUndo,
  onClear,
  onConfirm,
}: {
  steps: PlanStep[]
  kingdom: Kingdom
  // The kingdom as it would be with the plan carried out.
  planned: Kingdom
  // Steps that could not be carried out as things stand.
  skipped: number
  onUndo: () => void
  onClear: () => void
  onConfirm: () => void
}) {
  const [asking, setAsking] = useState(false)
  const { spent, back } = balanceOf(kingdom, planned)
  const text = describe(steps, kingdom.buildings)
  const yes = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!asking) return
    yes.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAsking(false)
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asking, onConfirm])
  return (
    <>
      {!asking && <div className="plan-bar frame" role="status">
        <Icon name="build" size={24} />
        <span className="plan-text">
          <b>Plan</b> · {text}
          <span className="card-meta">
            {Object.keys(spent).length > 0 && <CostList cost={spent} stock={kingdom.stock} />}
            {Object.keys(back).length > 0 && (
              <span className="plan-back">
                iade <CostList cost={back} />
              </span>
            )}
          </span>
        </span>
        <button className="btn small" onClick={onUndo} title="Son adımı geri al">
          Geri al
        </button>
        <button className="btn small" onClick={onClear}>
          Temizle
        </button>
        <button className="btn small primary" onClick={() => setAsking(true)}>
          Onayla
        </button>
      </div>}
      {asking && (
        <section className="confirm frame" role="alertdialog" aria-labelledby="plan-title" aria-describedby="plan-text">
          <div className="confirm-body">
            <h2 id="plan-title">Emin misin?</h2>
            <p id="plan-text" className="hint">
              {text}. Kaynaklar harcanır, inşaatlar yer boşaldıkça sırayla başlar.
              {skipped > 0 ? ` ${skipped} adım şu an yapılamıyor ve atlanacak.` : ''}
            </p>
            <span className="card-meta">
              {Object.keys(spent).length > 0 ? <CostList cost={spent} stock={kingdom.stock} /> : null}
              {Object.keys(back).length > 0 && (
                <span className="plan-back">
                  iade <CostList cost={back} />
                </span>
              )}
            </span>
            <div className="row">
              <button ref={yes} className="btn primary" onClick={onConfirm}>
                <Icon name="build" size={16} /> Evet, uygula
              </button>
              <button className="btn" onClick={() => setAsking(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
