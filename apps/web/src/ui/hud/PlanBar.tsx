import { balance } from '@game/shared'
import type { Building, Cost, Kingdom, PlanStep, Resource } from '@game/shared'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
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
  const list = (m: Map<string, number>) => [...m].map(([name, n]) => L(`${n} ${name.toLocaleLowerCase(locale())}`, `${n} × ${name.toLocaleLowerCase(locale())}`)).join(', ')
  return [
    built.size > 0 && L(`${list(built)} kurulacak`, `build ${list(built)}`),
    moved.size > 0 && L(`${list(moved)} taşınacak`, `move ${list(moved)}`),
    torn > 0 && L(`${torn} yapı yıkılacak`, `demolish ${torn} building${torn === 1 ? '' : 's'}`),
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
          {/* One line: in the column below, a bare "· text" was left hanging on a line of its own. */}
          <span>
            <b>{L('Plan', 'Plan')}</b> · {text}
          </span>
          <small className={steps.length >= balance.economy.maxPlan ? 'plan-count down' : 'plan-count'} title={L('Bir planda en fazla bu kadar adım olur', 'A plan holds at most this many steps')}>
            {steps.length} / {balance.economy.maxPlan} {L('adım', 'steps')}{steps.length >= balance.economy.maxPlan ? L(' · plan dolu, önce onayla', ' · plan full, confirm it first') : ''}
          </small>
          {skipped > 0 && (
            <small className="plan-count down" title={L('Malzeme, yer ya da sınır yetmediği için bu adımlar onayda atlanır', 'These steps will be skipped on confirming, for lack of materials, room or limit')}>
              {L(`${skipped} adım şu an yapılamıyor (malzeme ya da sınır yetmiyor)`, `${skipped} step${skipped === 1 ? '' : 's'} cannot be done right now (not enough materials, or a limit is reached)`)}
            </small>
          )}
          <span className="card-meta">
            {Object.keys(spent).length > 0 && <CostList cost={spent} stock={kingdom.stock} />}
            {Object.keys(back).length > 0 && (
              <span className="plan-back">
                {L('iade', 'refund')} <CostList cost={back} />
              </span>
            )}
          </span>
        </span>
        <button className="btn small" onClick={onUndo} title={L('Son adımı geri al', 'Undo the last step')}>
          {L('Geri al', 'Undo')}
        </button>
        <button className="btn small" onClick={onClear}>
          {L('Temizle', 'Clear')}
        </button>
        <button className="btn small primary" onClick={() => setAsking(true)}>
          {L('Onayla', 'Confirm')}
        </button>
      </div>}
      {asking && (
        <section className="confirm frame" role="alertdialog" aria-labelledby="plan-title" aria-describedby="plan-text">
          <div className="confirm-body">
            <h2 id="plan-title">{L('Emin misin?', 'Are you sure?')}</h2>
            <p id="plan-text" className="hint">
              {text}. {L('Kaynaklar harcanır, inşaatlar yer boşaldıkça sırayla başlar.', 'The goods are spent, and the works start in turn as building slots free up.')}
              {skipped > 0 ? L(` ${skipped} adım şu an yapılamıyor ve atlanacak.`, ` ${skipped} step${skipped === 1 ? '' : 's'} cannot be done right now and will be skipped.`) : ''}
            </p>
            <span className="card-meta">
              {Object.keys(spent).length > 0 ? <CostList cost={spent} stock={kingdom.stock} /> : null}
              {Object.keys(back).length > 0 && (
                <span className="plan-back">
                  {L('iade', 'refund')} <CostList cost={back} />
                </span>
              )}
            </span>
            <div className="row">
              <button ref={yes} className="btn primary" onClick={onConfirm}>
                <Icon name="build" size={16} /> {L('Evet, uygula', 'Yes, carry it out')}
              </button>
              <button className="btn" onClick={() => setAsking(false)}>
                {L('Vazgeç', 'Cancel')}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
