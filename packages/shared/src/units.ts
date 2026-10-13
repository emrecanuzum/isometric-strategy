import { balance } from './balance'

// Kinds of soldier (CLAUDE.md §9.7, AoE-like): spearmen beat cavalry, cavalry beats archers and shieldmen, archers beat
// spearmen, shieldmen beat archers; catapults are poor in the field but take walls apart. Every unit is one person of
// the population. Shieldmen and catapults are learnt at the university first.

export const UNITS = ['spear', 'archer', 'shield', 'cavalry', 'catapult'] as const
export type Unit = (typeof UNITS)[number]
export type Units = Partial<Record<Unit, number>>

export interface UnitSpec {
  cost: Partial<Record<'gold' | 'food' | 'materials' | 'arms', number>>
  // Weapons taken from the armory for each one.
  weapons?: Partial<Record<'sword' | 'shield' | 'bow', number>>
  trainSeconds: number
  might: number
  // The barracks level it needs (1 when absent), and the university research.
  barracksLevel?: number
  research?: string
}

export const unitSpec = (unit: Unit) => balance.military.units[unit] as UnitSpec

export const countOf = (units: Units | null | undefined) => UNITS.reduce((n, u) => n + (units?.[u] ?? 0), 0)

export const mightOf = (units: Units | null | undefined) => UNITS.reduce((n, u) => n + (units?.[u] ?? 0) * unitSpec(u).might, 0)

export const addUnits = (a: Units | null | undefined, b: Units | null | undefined): Units =>
  Object.fromEntries(UNITS.map((u) => [u, (a?.[u] ?? 0) + (b?.[u] ?? 0)]).filter(([, n]) => (n as number) > 0))

// `take` units out of `units`, shared over the kinds in proportion (largest remainders get the odd ones).
export function takeShare(units: Units | null | undefined, take: number): { taken: Units; left: Units } {
  const total = countOf(units)
  take = Math.max(0, Math.min(total, Math.round(take)))
  const exact = UNITS.map((u) => (total ? ((units?.[u] ?? 0) * take) / total : 0))
  const taken = exact.map(Math.floor)
  let rest = take - taken.reduce((a, b) => a + b, 0)
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (rest <= 0) break
    if (taken[i] < (units?.[UNITS[i]] ?? 0)) {
      taken[i]++
      rest--
    }
  }
  const out: Units = {}
  const left: Units = {}
  UNITS.forEach((u, i) => {
    if (taken[i]) out[u] = taken[i]
    const l = (units?.[u] ?? 0) - taken[i]
    if (l) left[u] = l
  })
  return { taken: out, left }
}

// Whether every count in `want` is there in `have`.
export const hasUnits = (have: Units | null | undefined, want: Units) => UNITS.every((u) => (want[u] ?? 0) <= (have?.[u] ?? 0))

export const subtractUnits = (a: Units | null | undefined, b: Units): Units =>
  Object.fromEntries(UNITS.map((u) => [u, Math.max(0, (a?.[u] ?? 0) - (b[u] ?? 0))]).filter(([, n]) => (n as number) > 0))

const beats = (a: Unit, b: Unit) => {
  const c = (balance.military.counters as Record<string, string | string[]>)[a]
  return Array.isArray(c) ? c.includes(b) : c === b
}

// The roll bonus one side's mix of soldiers gives it against the other's (negative when outmatched).
export function counterBonus(mine: Units | null | undefined, theirs: Units | null | undefined) {
  const field = (units: Units | null | undefined) => {
    const n = UNITS.filter((u) => u !== 'catapult').reduce((s, u) => s + (units?.[u] ?? 0), 0)
    return (u: Unit) => (n ? (units?.[u] ?? 0) / n : 0)
  }
  const a = field(mine)
  const b = field(theirs)
  let edge = 0
  for (const x of UNITS) for (const y of UNITS) edge += a(x) * b(y) * (beats(x, y) ? 1 : beats(y, x) ? -1 : 0)
  return edge * balance.military.counterBonus
}

// Garrisons from before unit kinds were all spearmen.
export const garrisonOf = (kingdom: { units?: Units; soldiers?: number }): Units => kingdom.units ?? (kingdom.soldiers ? { spear: kingdom.soldiers } : {})
