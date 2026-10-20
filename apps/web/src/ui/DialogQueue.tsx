import { Children, createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import { L } from '../lib/i18n'

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
export function DialogFoot({ children, onNext, label, disabled, why }: { children?: ReactNode; onNext: () => void; label?: string; disabled?: boolean; why?: string }) {
  const { pos, total, closeAll } = useQueue()
  const more = total > pos
  // Nothing but the closing button: it takes the whole width, so a short dialog does not end on an empty bar.
  const alone = Children.toArray(children).length === 0 && !(more && closeAll) && total <= 1
  return (
    <div className={alone ? 'dialog-foot alone' : 'dialog-foot'}>
      <div className="dialog-foot-left">
        {children}
        {more && closeAll && (
          <button className="btn small" onClick={closeAll}>
            {L('Tümünü kapat', 'Close all')}
          </button>
        )}
      </div>
      {total > 1 ? (
        <span className="dialog-step" aria-label={L(`${total} haberden ${pos}.`, `${pos} of ${total} dispatches.`)}>
          {pos} / {total}
        </span>
      ) : (
        <span />
      )}
      <button className="btn small primary dialog-next" disabled={disabled} data-why={why ?? L('Cevap bekleniyor', 'Awaiting an answer')} onClick={onNext}>
        {label ?? (more ? L('İleri', 'Next') : L('Tamam', 'OK'))}
      </button>
    </div>
  )
}

// One piece of news in a summary: enough to read it again when tapped.
export interface SummaryItem {
  icon: IconName
  title: string
  text: string
}

// What "Tümünü kapat" closed, told in a few lines; also the news that waited past its shelf life (or came in a flood)
// and was folded away instead of popping up one by one (CLAUDE.md §9.8: `folded`). Each line can be tapped to read the
// news in full (every one of them when it came more than once), with "Geri dön" back to the list.
export function ClosedSummary({ items, onClose, folded, onJournal }: { items: SummaryItem[]; onClose: () => void; folded?: boolean; onJournal?: () => void }) {
  const groups = new Map<string, SummaryItem[]>()
  for (const i of items) groups.set(i.title, [...(groups.get(i.title) ?? []), i])
  const [open, setOpen] = useState<string | null>(null)
  const shown = open !== null ? groups.get(open) : undefined
  return (
    <div className="modal" role="dialog" aria-labelledby="closed-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="dialog frame closed-summary">
        <header className="sheet-head">
          <Icon name={shown ? shown[0].icon : 'scroll'} size={32} />
          <div>
            <small>{folded ? L('Sen bakmazken', "While you weren't looking") : L('Tümünü kapattın', 'You closed them all')}</small>
            <h2 id="closed-title">{shown ? open : folded ? L(`${items.length} haber geldi`, `${items.length} ${items.length === 1 ? 'dispatch' : 'dispatches'} arrived`) : L(`${items.length} haber okundu sayıldı`, `${items.length} ${items.length === 1 ? 'dispatch' : 'dispatches'} marked as read`)}</h2>
          </div>
        </header>
        {shown ? (
          <ul className="away-lines">
            {shown.map((i, n) => (
              <li key={n}>
                <Icon name={i.icon} size={16} />
                <span>{i.text || i.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="away-lines summary-lines">
              {[...groups].map(([t, list]) => (
                <li key={t}>
                  <button className="summary-line" onClick={() => setOpen(t)}>
                    <Icon name={list[0].icon} size={16} />
                    <span>{list.length > 1 ? L(`${t} (${list.length} kez)`, `${t} (${list.length} times)`) : t}</span>
                    <span className="summary-more" aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">
              {folded
                ? L('Bunlar bekleyip bayatladığı ya da hepsi birden geldiği için tek tek açılmadı; okumak için birine dokun. Hepsi günlükte duruyor; cevap bekleyen haberler (haraç, teklif, kriz, seçim) yine açılır.', 'These went stale waiting, or all came at once, so they were not opened one by one; tap one to read it. They are all in the journal; news awaiting an answer (tribute, offers, crises, choices) still opens.')
                : L('Okumak için birine dokun. Hepsi günlükte duruyor; cevap bekleyen haberler (haraç, teklif, kriz, seçim) kapatılmadı.', 'Tap one to read it. They are all in the journal; news awaiting an answer (tribute, offers, crises, choices) was not closed.')}
            </p>
          </>
        )}
        <div className="dialog-foot">
          <div className="dialog-foot-left">
            {shown ? (
              <button className="btn small" onClick={() => setOpen(null)}>
                {L('Geri dön', 'Back')}
              </button>
            ) : (
              onJournal && (
                <button className="btn small" onClick={onJournal}>
                  {L('Günlüğü aç', 'Open the journal')}
                </button>
              )
            )}
          </div>
          <span />
          <button className="btn small primary dialog-next" onClick={onClose}>
            {L('Tamam', 'OK')}
          </button>
        </div>
      </section>
    </div>
  )
}
