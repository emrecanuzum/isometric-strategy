import { useEffect, useRef, useState } from 'react'
import { babble } from '../../audio/sfx'
import { onCommandDone } from '../../net/online'
import { EnvoyPortrait } from './EnvoyPortrait'
import { narrate } from './narration'

// The envoy's word on what the lord has just done (CLAUDE.md §9.8): a small parchment with his face that rises over
// the map for a few seconds after the server takes the command, never a window to close. A tap sends it away; the
// next act replaces it.
const SHOWN_MS = 9000

export function EnvoyNote({ quiet }: { quiet: boolean }) {
  const [note, setNote] = useState<{ text: string; n: number } | null>(null)
  const quietRef = useRef(quiet)
  quietRef.current = quiet
  useEffect(
    () =>
      onCommandDone((command, answer) => {
        if (quietRef.current) return
        const text = narrate(command, answer.kingdom?.state)
        if (!text) return
        setNote((old) => ({ text, n: (old?.n ?? 0) + 1 }))
        babble('lor', false)
      }),
    [],
  )
  useEffect(() => {
    if (!note) return
    const id = window.setTimeout(() => setNote(null), SHOWN_MS)
    return () => clearTimeout(id)
  }, [note])
  if (!note) return null
  return (
    <button key={note.n} className="envoy-note frame" onClick={() => setNote(null)} aria-live="polite" title="Kapat">
      <EnvoyPortrait size={34} talking />
      <span>{note.text}</span>
    </button>
  )
}
