import { useEffect, useSyncExternalStore } from 'react'

// Whether a mini game's window is open (CLAUDE.md §6.5): the envoy's news, the day's events and the house's tidings
// wait until it is closed, so none of them opens over the game and takes the keys or the taps meant for it.
let open = 0
const listeners = new Set<() => void>()
const tell = () => listeners.forEach((l) => l())

// Marks a game window open for as long as `on` is true.
export function usePlayingFlag(on: boolean) {
  useEffect(() => {
    if (!on) return
    open++
    tell()
    return () => {
      open--
      tell()
    }
  }, [on])
}

export const usePlaying = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => open > 0,
  )
