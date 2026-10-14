import { balance } from './balance'
import { gameTime, nextHourAt } from './clock'

// The people (CLAUDE.md §9.7): the palace's level caps the population, taxes bring gold and cost happiness, and
// happiness decides how many would take up arms and at what price.

export type TaxLevel = 'low' | 'normal' | 'high' | 'heavy'
export const TAX_LEVELS: TaxLevel[] = ['low', 'normal', 'high', 'heavy']

export const taxSpec = (level: TaxLevel | undefined) => balance.society.tax.levels[level ?? (balance.society.tax.default as TaxLevel)]

export const popCapFor = (palaceLevel: number) => palaceLevel * balance.society.popCapPerPalaceLevel

// Night on the game clock (the same hours the map is dark): the people stop working unless made to.
export function isNightAt(at: number) {
  const { startHour, endHour } = balance.society.night
  const hour = gameTime(at, 0).hour
  return hour >= startHour || hour < endHour
}

// When the current part of the day (night or day) ends after `at`.
export function phaseEndsAt(at: number) {
  const { startHour, endHour } = balance.society.night
  return nextHourAt(at, isNightAt(at) ? endHour : startHour)
}

// What weighs on the people besides the tax: a night shift, a kidnapped queen, an incited revolt.
export interface Moods {
  nightShift?: boolean
  queenTaken?: boolean
  revolt?: boolean
  // How much of the tax's weight on the mood is felt (a temple's sermon lightens it), and everything else.
  taxFactor?: number
  extra?: number
}

// Where happiness is heading: the base, the tax, the queen and whether the granary is empty.
export function happinessTarget(tax: TaxLevel | undefined, queen: boolean, starving: boolean, moods: Moods = {}) {
  const h = balance.society.happiness
  const target =
    h.base +
    (taxSpec(tax).happiness < 0 ? taxSpec(tax).happiness * (moods.taxFactor ?? 1) : taxSpec(tax).happiness) +
    (queen ? h.queen : 0) +
    (starving ? h.starving : 0) +
    (moods.nightShift ? balance.society.night.shiftHappiness : 0) +
    (moods.queenTaken ? balance.espionage.operations.kidnap.happiness : 0) +
    (moods.revolt ? balance.espionage.operations.revolt.happiness : 0) +
    (moods.extra ?? 0)
  return Math.max(0, Math.min(100, target))
}

// One production round's step from `current` toward the target.
export const happinessStep = (current: number, target: number) => current + (target - current) * balance.society.happiness.approachPerRound

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t))

// The share of the people willing to be soldiers, and what each one costs relative to a content people.
export function recruitTerms(happiness: number) {
  const r = balance.society.recruits
  return {
    share: lerp(r.willingShareUnhappy, r.willingShareHappy, happiness / 100),
    costMultiplier: lerp(r.costMultiplierUnhappy, 1, happiness / 100),
  }
}
