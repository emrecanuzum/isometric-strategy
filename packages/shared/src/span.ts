// What follows from which buildings (or studies) stand finished stays the same between one's completion and the next.
// Settling a kingdom that was away a day runs thousands of production rounds over the same buildings, so the sums
// that only change when one is done are worked out once per stretch instead of once per round. The lists are never
// changed in place (an edit makes a new list), so a list's answers hold for as long as it lives.

interface Timed {
  doneAt: number
}

const times = new WeakMap<Timed[], number[]>()

// The stretch [from, until) around `at` in which no building of the list is completed.
export function doneSpan(buildings: Timed[], at: number): { from: number; until: number } {
  let sorted = times.get(buildings)
  if (!sorted) {
    sorted = [...new Set(buildings.map((b) => b.doneAt))].sort((a, b) => a - b)
    times.set(buildings, sorted)
  }
  // The first completion after `at`.
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= at) lo = mid + 1
    else hi = mid
  }
  return { from: lo > 0 ? sorted[lo - 1] : -Infinity, until: lo < sorted.length ? sorted[lo] : Infinity }
}

// A value worked out from a list of buildings at `at`, kept for the stretch it holds over.
export type SpanCache<T> = WeakMap<Timed[], { from: number; until: number; value: T }>

export function perSpan<T>(cache: SpanCache<T>, buildings: Timed[], at: number, make: () => T): T {
  const known = cache.get(buildings)
  if (known && at >= known.from && at < known.until) return known.value
  const { from, until } = doneSpan(buildings, at)
  const value = make()
  cache.set(buildings, { from, until, value })
  return value
}
