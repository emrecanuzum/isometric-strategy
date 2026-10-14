import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { KINGDOM_COLORS } from '../game/buildingSprites'
import type { KingdomColor } from '../game/buildingSprites'
import type { ChatMessage } from '../net/online'
import type { KingdomInfo } from './hud/online'
import type { Score } from '@game/shared'
import { lastSeen } from './hud/online'
import { Icon } from './icons'
import { play } from '../audio/sfx'

// The lobby chat: kept for the season, every line under the kingdom's name in its colour and its player's name. A
// second tab lists the kingdoms of the lobby and who plays them; picking one opens it in the diplomacy tab. It folds
// into a button that counts what came in while it was closed.

const swatch = (color: string | null) => KINGDOM_COLORS[color as KingdomColor]?.swatch ?? '#8a7a60'

// Whether a message mentions `name` (@name, any case, as a whole word).
const mentions = (body: string, name: string) =>
  !!name && new RegExp(`(^|\\s)@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,!?:;])`, 'i').test(body)

// A message's text with every @mention set apart.
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[^\s.,!?:;]+)/g)
  return (
    <>
      {parts.map((part, i) => (part.startsWith('@') ? <b key={i} className="mention">{part}</b> : part))}
    </>
  )
}

// Chat notifications muted in this browser.
const MUTE_KEY = 'chat-muted'
const readMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

// The newest message read, kept per lobby in this browser so a reload does not bring old messages back as new.
const readSeen = (key: string) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}
const writeSeen = (key: string, id: number) => {
  try {
    localStorage.setItem(key, String(id))
  } catch {
    // Not remembered in private mode.
  }
}

export function Chat({
  storeKey,
  username,
  messages,
  mine,
  canPost,
  onSend,
  kingdoms,
  onKingdom,
  onLocate,
  banner,
}: {
  // Where this lobby's read marker is kept.
  storeKey: string
  // The player's name: a message with @name in it calls for them.
  username: string
  messages: ChatMessage[]
  // The player's kingdom id, to set their own lines apart.
  mine: number | null
  canPost: boolean
  onSend: (body: string) => Promise<void>
  kingdoms: KingdomInfo[]
  onKingdom: (id: number) => void
  // The crown banner a kingdom's lord flies (CLAUDE.md §7.8), beside its name.
  banner?: (kingdom: number) => ReactNode
  // Moves the camera to a kingdom's palace.
  onLocate: (site: { x: number; y: number }) => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'chat' | 'kingdoms' | 'ranking'>('chat')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // The newest message read: as remembered, or (the first time in this lobby) everything already there.
  const [seen, setSeen] = useState<number | null>(() => readSeen(storeKey))
  const list = useRef<HTMLOListElement>(null)
  const last = messages.length ? messages[messages.length - 1].id : 0
  useEffect(() => {
    if (seen === null && messages.length > 0) setSeen(last)
  }, [seen, messages.length, last])
  useEffect(() => {
    if (seen !== null) writeSeen(storeKey, seen)
  }, [seen, storeKey])
  const fresh = open || seen === null ? [] : messages.filter((m) => m.id > seen && m.kingdom_id !== mine)
  const unread = fresh.length
  const called = fresh.filter((m) => mentions(m.body, username)).length
  const [muted, setMuted] = useState(readMuted)
  const toggleMute = () => {
    setMuted((on) => {
      try {
        localStorage.setItem(MUTE_KEY, on ? '0' : '1')
      } catch {
        // Not remembered in private mode.
      }
      return !on
    })
  }
  // A new line while the chat is folded away: a preview pops up for a few seconds with a chime (always for a mention,
  // otherwise unless muted).
  const [pop, setPop] = useState<ChatMessage | null>(null)
  // Messages loaded with the page are history, not news: only those that arrive afterwards pop up.
  const heard = useRef<number | null>(null)
  useEffect(() => {
    if (heard.current === null) {
      if (messages.length > 0) heard.current = last
      return
    }
    const since = heard.current
    if (last <= since) return
    const newest = messages.filter((m) => m.id > since && m.kingdom_id !== mine)
    heard.current = last
    const m = newest[newest.length - 1]
    if (!m || open) return
    const called = mentions(m.body, username)
    if (muted && !called) return
    play(called ? 'mention' : 'chat')
    setPop(m)
  }, [last, messages, mine, open, muted, username])
  useEffect(() => {
    if (!pop) return
    const id = window.setTimeout(() => setPop(null), 6000)
    return () => clearTimeout(id)
  }, [pop])
  // Names to tag: the word being typed after @ is completed from the lobby's players.
  const typing = /(^|\s)@([^\s@]*)$/.exec(draft)
  const tags = typing
    ? kingdoms
        .filter((k) => k.id !== mine && k.username)
        .map((k) => k.username!)
        .filter((n) => n.toLowerCase().startsWith(typing[2].toLowerCase()))
        .slice(0, 5)
    : []
  const tag = (name: string) => setDraft(draft.replace(/@([^\s@]*)$/, `@${name} `))

  useEffect(() => {
    if (open && last) setSeen(last)
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
      <>
        {pop && (
          <button className={mentions(pop.body, username) ? 'chat-pop frame called' : 'chat-pop frame'} onClick={() => (setPop(null), setOpen(true))} aria-live="polite">
            <i style={{ background: swatch(pop.color) }} />
            <span>
              <b style={{ color: `color-mix(in srgb, ${swatch(pop.color)} 45%, #f3e6c8)` }}>{pop.name}</b>
              {pop.username && <small> {pop.username}</small>}
              <br />
              <span className="preview">
                <Body text={pop.body.length > 90 ? `${pop.body.slice(0, 90)}…` : pop.body} />
              </span>
            </span>
          </button>
        )}
        <button className="btn chat-toggle" onClick={() => setOpen(true)} title="Lobi sohbeti">
          <Icon name="scroll" size={16} slash={muted} /> Sohbet
          {called > 0 ? <span className="badge mention-badge">@{called}</span> : unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </>
    )
  }
  return (
    <section className="chat frame" aria-label="Lobi sohbeti">
      <header>
        <span className="chat-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'chat'} className="btn small" onClick={() => setTab('chat')}>
            Sohbet
          </button>
          <button role="tab" aria-selected={tab === 'kingdoms'} className="btn small" onClick={() => setTab('kingdoms')}>
            Krallıklar ({kingdoms.length})
          </button>
          <button role="tab" aria-selected={tab === 'ranking'} className="btn small" onClick={() => setTab('ranking')}>
            Sıralama
          </button>
        </span>
        <button
          className="btn small icon-only"
          aria-pressed={muted}
          onClick={toggleMute}
          aria-label={muted ? 'Sohbet bildirimlerini aç' : 'Sohbet bildirimlerini sessize al'}
          title={muted ? 'Sessizde: yalnızca seni etiketleyenler bildirilir' : 'Sessize al'}
        >
          <Icon name="bell" size={16} slash={muted} />
        </button>
        <button className="btn small icon-only" onClick={() => setOpen(false)} aria-label="Sohbeti kapat">
          <Icon name="close" size={16} />
        </button>
      </header>
      {tab === 'ranking' ? (
        <Ranking kingdoms={kingdoms} mine={mine} onKingdom={onKingdom} banner={banner} />
      ) : tab === 'kingdoms' ? (
        <ol className="chat-kingdoms">
          {kingdoms.map((k) => (
            <li key={k.id}>
              <button className={k.id === mine ? 'own' : undefined} onClick={() => onKingdom(k.id)} disabled={k.id === mine}>
                <i style={{ background: swatch(k.color) }} />
                <span>
                  <b style={{ color: `color-mix(in srgb, ${swatch(k.color)} 45%, #f3e6c8)` }}>
                    {banner?.(k.id)} {k.name}
                  </b>
                  <small>{k.id === mine ? 'sen' : (k.username ?? '—')}</small>
                </span>
                {k.id !== mine && (
                  <span className={lastSeen(k.seenAt, Date.now()) === 'çevrimiçi' ? 'presence on' : 'presence'}>{lastSeen(k.seenAt, Date.now())}</span>
                )}
              </button>
              <button className="btn icon-only locate" onClick={() => onLocate(k.site)} aria-label={`${k.name} haritada göster`} title="Haritada göster">
                <Icon name="pin" size={16} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
      <ol ref={list}>
        {messages.length === 0 && <li className="empty">Henüz kimse yazmadı.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.kingdom_id === mine ? 'own' : undefined}>
            <i style={{ background: swatch(m.color) }} />
            <span>
              <b style={{ color: `color-mix(in srgb, ${swatch(m.color)} 45%, #f3e6c8)` }}>
                {banner?.(m.kingdom_id)} {m.name}
              </b>
              {m.username && <small className="who">{m.username}</small>}
              <small>{timeOf(m.created_at)}</small>
              <br />
              <Body text={m.body} />
            </span>
          </li>
        ))}
      </ol>
      )}
      {tags.length > 0 && (
        <div className="chat-tags" role="listbox" aria-label="Etiketle">
          {tags.map((n) => (
            <button key={n} type="button" className="btn small" onClick={() => tag(n)}>
              @{n}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={280}
          placeholder={canPost ? 'Mesaj yaz… (@ ile etiketle)' : 'Yazmak için krallığını kur'}
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

const PARTS: { key: keyof Omit<Score, 'total'>; name: string }[] = [
  { key: 'economy', name: 'Hazine' },
  { key: 'growth', name: 'Gelişim' },
  { key: 'people', name: 'Nüfus' },
  { key: 'army', name: 'Ordu' },
  { key: 'glory', name: 'Zafer' },
  { key: 'learning', name: 'Bilgi' },
]

// The lobby's ranking: kingdoms by score, each with what its score is made of.
function Ranking({ kingdoms, mine, onKingdom, banner }: { kingdoms: KingdomInfo[]; mine: number | null; onKingdom: (id: number) => void; banner?: (kingdom: number) => ReactNode }) {
  const ranked = [...kingdoms].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
  return (
    <ol className="chat-ranking">
      {ranked.map((k, i) => (
        <li key={k.id} className={k.id === mine ? 'own' : undefined}>
          <button onClick={() => k.id !== mine && onKingdom(k.id)} disabled={k.id === mine}>
            <span className="rank">{i + 1}.</span>
            <i style={{ background: swatch(k.color) }} />
            <span className="who">
              <b style={{ color: `color-mix(in srgb, ${swatch(k.color)} 45%, #f3e6c8)` }}>
                {banner?.(k.id)} {k.name}
              </b>
              <small>
                {k.score
                  ? PARTS.filter((p) => (k.score![p.key] ?? 0) > 0)
                      .map((p) => `${p.name} ${k.score![p.key].toLocaleString('tr-TR')}`)
                      .join(' · ')
                  : 'henüz puanlanmadı'}
              </small>
            </span>
            <strong>{(k.score?.total ?? 0).toLocaleString('tr-TR')}</strong>
          </button>
        </li>
      ))}
      <li className="ranking-note">
        Puan: hazine (altın ve depo), gelişim (saray ve bina seviyeleri), nüfus, ordu, zafer (kazanılan muharebe ve kuşatmalar, kraliçe, rehineler) ve
        bilgi (araştırmalar). Başkalarının yalnızca gelişim ve zafer puanı ile yuvarlanmış toplamı görünür; hazinesi ve ordusu casuslarla öğrenilir.
      </li>
    </ol>
  )
}
