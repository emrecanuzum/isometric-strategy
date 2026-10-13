import { supabase } from '../lib/supabase'

// The server's clock (CLAUDE.md §11.1): every player sees the same day and hour, whatever their device's clock says.
// The offset is measured on entry, every few minutes and whenever the tab comes back, taking half the round trip
// as the time the answer spent on the way back.

const RESYNC_MS = 5 * 60_000
let offset = 0

export const serverNow = () => Date.now() + offset

export async function syncClock() {
  // The quickest of a few round trips is the most accurate.
  let best: { rtt: number; offset: number } | null = null
  for (let i = 0; i < 3; i++) {
    const sent = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    const received = Date.now()
    if (error || typeof data !== 'number') continue
    const rtt = received - sent
    if (!best || rtt < best.rtt) best = { rtt, offset: data + rtt / 2 - received }
  }
  if (best) offset = best.offset
}

export function keepClockSynced() {
  const id = setInterval(syncClock, RESYNC_MS)
  const onVisible = () => document.visibilityState === 'visible' && syncClock()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
