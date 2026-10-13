import { useEffect, useRef, useState } from 'react'
import { KINGDOM_COLORS } from '../game/buildingSprites'
import type { KingdomColor } from '../game/buildingSprites'
import type { ChatMessage } from '../net/online'
import { Icon } from './icons'

// The lobby chat: kept for the season, every line under the kingdom's name in its colour. It folds into a button
// that counts what came in while it was closed.

const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

export function Chat({
  messages,
  mine,
  canPost,
  onSend,
}: {
  messages: ChatMessage[]
  // The player's kingdom id, to set their own lines apart.
  mine: number | null
  canPost: boolean
  onSend: (body: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [seen, setSeen] = useState(messages.length ? messages[messages.length - 1].id : 0)
  const list = useRef<HTMLOListElement>(null)
  const last = messages.length ? messages[messages.length - 1].id : 0
  const unread = open ? 0 : messages.filter((m) => m.id > seen && m.kingdom_id !== mine).length

  useEffect(() => {
    if (open) setSeen(last)
  }, [open, last])
  useEffect(() => {
    if (open && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [open, last])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await onSend(body)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button className="btn chat-toggle" onClick={() => setOpen(true)} title="Lobi sohbeti">
        <Icon name="scroll" size={16} /> Sohbet
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
    )
  }
  return (
    <section className="chat frame" aria-label="Lobi sohbeti">
      <header>
        <b>Lobi sohbeti</b>
        <button className="btn small icon-only" onClick={() => setOpen(false)} aria-label="Sohbeti kapat">
          <Icon name="close" size={16} />
        </button>
      </header>
      <ol ref={list}>
        {messages.length === 0 && <li className="empty">Henüz kimse yazmadı.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.kingdom_id === mine ? 'own' : undefined}>
            <i style={{ background: swatch(m.color) }} />
            <span>
              <b style={{ color: `color-mix(in srgb, ${swatch(m.color)} 45%, #f3e6c8)` }}>{m.name}</b>
              <small>{timeOf(m.created_at)}</small>
              <br />
              {m.body}
            </span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={280}
          placeholder={canPost ? 'Mesaj yaz…' : 'Yazmak için krallığını kur'}
          disabled={!canPost}
          aria-label="Mesaj"
        />
        <button className="btn small" disabled={!canPost || sending || !draft.trim()}>
          Gönder
        </button>
      </form>
    </section>
  )
}
