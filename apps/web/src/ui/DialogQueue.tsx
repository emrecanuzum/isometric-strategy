import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons'

// Dialogs coming one after another (the envoy's news, the house's news, the day's events; CLAUDE.md §9.8): each one
// says where it stands in the line ("2 / 5"), offers to close them all at once, and keeps its forward button in the
// same place, the right end of the same footer, so the next one is a tap on the same spot.

export interface QueueInfo {
  // This dialog's place in the line, and how many have come and are still waiting.
  pos: number
  total: number
  // Closes every dialog that only tells something (those still waiting for an answer stay).
  closeAll?: () => void
}

export const QueueContext = createContext<QueueInfo>({ pos: 1, total: 1 })
export const useQueue = () => useContext(QueueContext)

// The standard footer: the dialog's own buttons on the left, the place in the line in the middle, the forward button
// on the right ("İleri" while more are waiting, "Tamam" on the last).
export function DialogFoot({ children, onNext, label, disabled }: { children?: ReactNode; onNext: () => void; label?: string; disabled?: boolean }) {
  const { pos, total, closeAll } = useQueue()
  const more = total > pos
  return (
    <div className="dialog-foot">
      <div className="dialog-foot-left">
        {children}
        {more && closeAll && (
          <button className="btn small" onClick={closeAll}>
            Tümünü kapat
          </button>
        )}
      </div>
      {total > 1 ? (
        <span className="dialog-step" aria-label={`${total} haberden ${pos}.`}>
          {pos} / {total}
        </span>
      ) : (
        <span />
      )}
      <button className="btn small primary dialog-next" disabled={disabled} onClick={onNext}>
        {label ?? (more ? 'İleri' : 'Tamam')}
      </button>
    </div>
  )
}

// What "Tümünü kapat" closed, told in a few lines; also the news that waited past its shelf life (or came in a flood)
// and was folded away instead of popping up one by one (CLAUDE.md §9.8: `folded`).
export function ClosedSummary({ titles, onClose, folded, onJournal }: { titles: string[]; onClose: () => void; folded?: boolean; onJournal?: () => void }) {
  const counts = new Map<string, number>()
  for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1)
  return (
    <div className="modal" role="dialog" aria-labelledby="closed-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog frame closed-summary">
        <header className="sheet-head">
          <Icon name="scroll" size={32} />
          <div>
            <small>{folded ? 'Sen bakmazken' : 'Tümünü kapattın'}</small>
            <h2 id="closed-title">{folded ? `${titles.length} haber geldi` : `${titles.length} haber okundu sayıldı`}</h2>
          </div>
        </header>
        <ul className="away-lines">
          {[...counts].map(([t, n]) => (
            <li key={t}>
              <Icon name="scroll" size={16} />
              <span>{n > 1 ? `${t} (${n} kez)` : t}</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          {folded
            ? 'Bunlar bekleyip bayatladığı ya da hepsi birden geldiği için tek tek açılmadı. Hepsi günlükte duruyor; cevap bekleyen haberler (haraç, teklif, kriz, seçim) yine açılır.'
            : 'Hepsi günlükte duruyor; cevap bekleyen haberler (haraç, kriz, seçim) kapatılmadı.'}
        </p>
        <div className="dialog-foot">
          <div className="dialog-foot-left">
            {onJournal && (
              <button className="btn small" onClick={onJournal}>
                Günlüğü aç
              </button>
            )}
          </div>
          <span />
          <button className="btn small primary dialog-next" onClick={onClose}>
            Tamam
          </button>
        </div>
      </section>
    </div>
  )
}
