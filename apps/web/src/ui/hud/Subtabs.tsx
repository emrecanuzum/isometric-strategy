import { useEffect, useState } from 'react'
import { Icon } from '../icons'
import type { IconName } from '../icons'

// A tab split into parts (Saray: Seviye / Hanedan / Yapılar, and the like): a row of buttons over the part shown, the
// part last looked at remembered in this browser (by the tab's key) and openable from elsewhere (showPart).

export interface Part<P extends string> {
  id: P
  name: string
  icon: IconName
  // A red dot: something there waits on the player.
  dot?: boolean
  // A short count after the name.
  count?: number | string
}

const storeKey = (key: string) => `${key}:part`
const eventName = (key: string) => `subtab:${key}`

// Opens a tab at a part next time (or now, if it is open): for whatever sends the player there.
export function showPart(key: string, part: string) {
  try {
    localStorage.setItem(storeKey(key), part)
  } catch {
    // Not remembered: the tab opens where it did.
  }
  window.dispatchEvent(new CustomEvent(eventName(key), { detail: part }))
}

// The part shown: `initial` when given (a building's menu opening the tab at its own part), else the one last looked at.
export function usePart<P extends string>(key: string, ids: readonly P[], first: P, initial?: P): [P, (part: P) => void] {
  const [part, setPart] = useState<P>(() => {
    if (initial) return initial
    try {
      const saved = localStorage.getItem(storeKey(key))
      return ids.includes(saved as P) ? (saved as P) : first
    } catch {
      return first
    }
  })
  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<P>).detail
      if (ids.includes(next)) setPart(next)
    }
    window.addEventListener(eventName(key), on)
    return () => window.removeEventListener(eventName(key), on)
    // The ids are a fixed list per tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return [ids.includes(part) ? part : first, (p: P) => showPart(key, p)]
}

export function Subtabs<P extends string>({ label, parts, part, onPart }: { label: string; parts: Part<P>[]; part: P; onPart: (part: P) => void }) {
  return (
    <div className={parts.length > 5 ? 'palace-tabs many wide' : parts.length > 3 ? 'palace-tabs many' : 'palace-tabs'} role="tablist" aria-label={label} style={{ ['--parts' as string]: parts.length }}>
      {parts.map((p) => (
        <button key={p.id} className="btn small" role="tab" aria-selected={part === p.id} aria-pressed={part === p.id} onClick={() => onPart(p.id)}>
          <Icon name={p.icon} size={16} />
          <span>
            {p.name}
            {p.count !== undefined && p.count !== 0 && <small> · {p.count}</small>}
          </span>
          {p.dot && <span className="dot" aria-label="Bekleyen bir şey var" />}
        </button>
      ))}
    </div>
  )
}
