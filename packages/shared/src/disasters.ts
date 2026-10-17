import { balance } from './balance'
import { goldCap, storageCap } from './economy'
import type { Good, Kingdom, Resource, Stock } from './economy'
import type { CrisisChoice } from './institutions'

// What disasters take from full stores (CLAUDE.md §9.8): every crisis burns a share of some goods however it is met
// (the villagers or the army only make the loss smaller), more when the stores are near the top of their room; and
// stores left brimming draw rats, rot and rust. Both are worked out from the kingdom's stores at the moment they strike,
// inside `advance`, so they fall alike whether the lord is there or not.

const C = () => balance.institutions.events.crisis.toll
const H = () => balance.institutions.events.hoard

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// The goods a crisis of `kind` takes when its time to answer runs out, met with `choice` (nothing done counts as
// 'none'). Only what lies above a small floor is touched, and never more than a set share of it.
export function crisisToll(k: Kingdom, kind: string, choice: CrisisChoice, at: number): Partial<Stock> {
  const t = C()
  const shares = (t.kinds as Record<string, Partial<Record<Resource, number>>>)[kind]
  if (!shares) return {}
  const factor = (t.choice as Record<CrisisChoice, number>)[choice] ?? 1
  const room = storageCap(k, at)
  const vault = goldCap(k, at)
  const out: Partial<Stock> = {}
  for (const [r, share] of Object.entries(shares) as [Resource, number][]) {
    const cap = r === 'gold' ? vault : room
    const stock = k.stock[r] ?? 0
    const fill = cap > 0 ? stock / cap : 0
    // Brimming stores feed a fire better: up to twice the share once a store is full.
    const boost = 1 + t.fullBoost * clamp01((fill - t.fullAt) / (1 - t.fullAt))
    const lost = Math.floor(Math.max(0, stock - t.floor) * Math.min(t.maxShare, share * factor * boost))
    if (lost > 0) out[r] = lost
  }
  return out
}

export type HoardKind = keyof typeof balance.institutions.events.hoard.kinds
export const HOARD_GOOD = H().kinds as Record<HoardKind, Good>

function hash(...values: number[]) {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  return h >>> 0
}

// The moment of window `index` when a store left brimming may be struck, if it may (from the kingdom and the window
// alone, like the fortunes), and a roll that picks which of the brimming stores.
export function hoardIn(k: Pick<Kingdom, 'site' | 'foundedAt'>, index: number): { at: number; roll: number } | null {
  const h = H()
  const ms = h.windowSeconds * 1000
  const seed = hash(k.site.x, k.site.y, Math.floor((k.foundedAt ?? 0) / 1000), index, 0x5eed)
  if ((seed % 10_000) / 10_000 >= h.chance) return null
  const at = index * ms + (hash(seed, 1) % ms)
  if (at < (k.foundedAt ?? 0)) return null
  return { at, roll: (hash(seed, 2) % 10_000) / 10_000 }
}

// The moments in (from, to] a brimming store may be struck.
export function hoardsBetween(k: Pick<Kingdom, 'site' | 'foundedAt'>, from: number, to: number) {
  const ms = H().windowSeconds * 1000
  const out: { at: number; roll: number }[] = []
  for (let i = Math.floor(from / ms); i <= Math.floor(to / ms); i++) {
    const h = hoardIn(k, i)
    if (h && h.at > from && h.at <= to) out.push(h)
  }
  return out
}

// What strikes now: one of the stores above the line (picked by the roll), and how much of it is lost (a bigger share
// the fuller it is). Nothing if no store is that full.
export function hoardStrike(k: Kingdom, roll: number, at: number): { kind: HoardKind; good: Good; lost: number } | null {
  const h = H()
  const room = storageCap(k, at)
  if (room <= 0) return null
  const full = (Object.entries(HOARD_GOOD) as [HoardKind, Good][]).filter(([, g]) => k.stock[g] >= room * h.fullAt)
  if (full.length === 0) return null
  const [kind, good] = full[Math.min(full.length - 1, Math.floor(roll * full.length))]
  const fill = clamp01((k.stock[good] / room - h.fullAt) / (1 - h.fullAt))
  const lost = Math.floor(k.stock[good] * (h.minShare + (h.maxShare - h.minShare) * fill))
  return lost > 0 ? { kind, good, lost } : null
}
