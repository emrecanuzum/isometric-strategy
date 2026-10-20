import { useEffect, useRef } from 'react'
import type React from 'react'
import { Icon } from '../icons'
import { L } from '../../lib/i18n'
import type { IconName } from '../icons'
import { DiplomacyTab } from './diplomacy'
import { BuildTab, JournalTab, KingdomTab, PeopleTab, StoreTab, TradeTab } from './tabs'
import { ArmyTab } from './war'
import type { HudData } from './tabs'

// The kingdom's interface: stores along the top, a dock of tabs along the bottom and the open tab in a sheet
// (a drawer on the left on wide screens, a bottom sheet on phones). Tabs are grouped by where they look:
// the economy, the realm itself, and the world outside.

export type TabId = 'build' | 'store' | 'trade' | 'kingdom' | 'people' | 'army' | 'diplomacy' | 'journal'

interface Tab {
  id: TabId
  name: string
  icon: IconName
  // What the tab is for, under its title.
  blurb: string
  group: 'economy' | 'realm' | 'world'
  view: (data: HudData) => React.ReactNode
}

export const TABS: Tab[] = [
  { id: 'build', name: L('İnşa', 'Build'), icon: 'build', blurb: L('Yapı seç, hududuna yerleştir', 'Pick a building, place it within your border'), group: 'economy', view: BuildTab },
  { id: 'store', name: L('Depo', 'Stores'), icon: 'chest', blurb: L('Hammadde stoku ve akışı', 'Stock and flow of goods'), group: 'economy', view: StoreTab },
  { id: 'trade', name: L('Ticaret', 'Trade'), icon: 'trade', blurb: L('Tüccar ve ticaret noktası', 'Merchant and trading post'), group: 'economy', view: TradeTab },
  { id: 'kingdom', name: L('Saray', 'Palace'), icon: 'crown', blurb: L('Seviye, hanedan, yapılar', 'Level, dynasty, buildings'), group: 'realm', view: KingdomTab },
  { id: 'people', name: L('Halk', 'People'), icon: 'people', blurb: L('Vergi, mutluluk, kraliçe', 'Tax, happiness, queen'), group: 'realm', view: PeopleTab },
  { id: 'army', name: L('Ordu', 'Army'), icon: 'swords', blurb: L('Kışla, garnizon, ordular, savaşlar', 'Barracks, garrison, armies, wars'), group: 'world', view: ArmyTab },
  { id: 'diplomacy', name: L('Diplomasi', 'Diplomacy'), icon: 'banner', blurb: L('Lordlar, ilişkiler, casusluk', 'Lords, relations, espionage'), group: 'world', view: DiplomacyTab },
  { id: 'journal', name: L('Günlük', 'Journal'), icon: 'scroll', blurb: L('Elçinin günlük raporları', 'The envoy\'s daily reports'), group: 'world', view: JournalTab },
]

export { TopBar } from './TopBar'

// ---- Dock and sheet -------------------------------------------------------------------------------------------------

export function Dock({ open, unread, onToggle }: { open: TabId | null; unread: number; onToggle: (tab: TabId) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  // Arrow keys move along the tabs (one tab stop for the whole dock).
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    refs.current[(i + step + TABS.length) % TABS.length]?.focus()
  }
  const focusable = open ? TABS.findIndex((t) => t.id === open) : 0
  return (
    <nav className="dock frame" aria-label={L('Lordluk menüsü', 'Lordship menu')}>
      <div role="tablist" aria-orientation="horizontal">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={open === tab.id}
            aria-controls="hud-sheet"
            tabIndex={i === focusable ? 0 : -1}
            className={`tab ${tab.group}${i > 0 && TABS[i - 1].group !== tab.group ? ' gap' : ''}`}
            onClick={() => onToggle(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            title={`${tab.name} (${i + 1})`}
          >
            <Icon name={tab.icon} size={24} />
            <span>{tab.name}</span>
            {tab.id === 'journal' && unread > 0 && (
              <em className="badge" aria-label={L(`${unread} yeni`, `${unread} new`)}>
                {unread > 9 ? '9+' : unread}
              </em>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}

export function Sheet({ tab, data, onClose }: { tab: TabId; data: HudData; onClose: () => void }) {
  const spec = TABS.find((t) => t.id === tab)!
  const body = useRef<HTMLDivElement>(null)
  // A new tab starts at its top. (scrollTo returns a promise in newer browsers, so the effect must not return it.)
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [tab])
  return (
    <section id="hud-sheet" className="sheet frame" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      <header className="sheet-head">
        <Icon name={spec.icon} size={32} />
        <div>
          <h2>{spec.name}</h2>
          <small>{spec.blurb}</small>
        </div>
        <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat (Esc)', 'Close (Esc)')} title={L('Kapat (Esc)', 'Close (Esc)')}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <div className="sheet-body" ref={body}>
        {/* Rendered as a component (keyed by tab) so a tab may keep its own state. */}
        <spec.view key={tab} {...data} />
      </div>
    </section>
  )
}

// Number keys 1–8 open the tabs, Escape closes the open one; ignored while typing.
export function useTabKeys(onToggle: (tab: TabId) => void, onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, select')) return
      if (e.key === 'Escape') return onClose()
      const i = Number(e.key) - 1
      if (Number.isInteger(i) && i >= 0 && i < TABS.length) onToggle(TABS[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onToggle, onClose])
}
