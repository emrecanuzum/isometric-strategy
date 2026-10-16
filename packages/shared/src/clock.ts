import { balance } from './balance'

// Game time. One game day is one real hour (balance.time.gameDayMs), and one calendar year (see the calendar below);
// a day begins at the top of the real hour
// (CLAUDE.md §2), so the hour of the day follows the wall clock and every player sees the same time of day. Days are
// counted from the start of the season.
//
// The hours do not all pass at the same pace (balance.time.pace): the night goes by quickly and the time it saves is
// given to dawn and dusk, which linger. A pace is a weight per game hour; the day as a whole still takes gameDayMs.

// The day in spans of game hours at one pace each, from midnight round to midnight.
const spans = (() => {
  const { night, twilight, day, dawnHours, duskHours } = balance.time.pace
  const { startHour, endHour } = balance.society.night
  const marks: [number, number][] = [
    [endHour + dawnHours[0], night],
    [endHour + dawnHours[1], twilight],
    [startHour + duskHours[0], day],
    [startHour + duskHours[1], twilight],
    [24, night],
  ]
  let from = 0
  let at = 0
  const list = marks.map(([to, weight]) => {
    const span = { from, to, weight, at }
    at += (to - from) * weight
    from = to
    return span
  })
  return list.map((span) => ({ ...span, at: span.at / at, share: ((span.to - span.from) * span.weight) / at }))
})()

// The game hour (0..24) when `f` of the real day (0..1) has gone by.
export function hourAt(f: number): number {
  for (const s of spans) if (f < s.at + s.share || s === spans[spans.length - 1]) return s.from + ((f - s.at) / s.share) * (s.to - s.from)
  return 0
}

// How much of the real day (0..1) has gone by at game hour `hour` (0..24).
export function dayFractionAt(hour: number): number {
  for (const s of spans) if (hour < s.to || s === spans[spans.length - 1]) return s.at + ((hour - s.from) / (s.to - s.from)) * s.share
  return 1
}

// The real time, after `at`, when the game clock next shows `hour`.
export function nextHourAt(at: number, hour: number): number {
  const { gameDayMs } = balance.time
  const dayStart = Math.floor(at / gameDayMs) * gameDayMs
  let next = dayStart + dayFractionAt(hour) * gameDayMs
  if (next <= at) next += gameDayMs
  return next
}

export interface GameTime {
  // 1-based day of the season (one day/night cycle, which is also one calendar year).
  day: number
  // Time of day, 0..24, and its whole hours and minutes.
  hour: number
  hh: number
  mm: number
  // Real milliseconds until the next day (and year) begins.
  untilNextDay: number
}

export function gameTime(now: number, seasonStart: number): GameTime {
  const { gameDayMs } = balance.time
  const day = Math.max(1, Math.floor(now / gameDayMs) - Math.floor(seasonStart / gameDayMs) + 1)
  const into = ((now % gameDayMs) + gameDayMs) % gameDayMs
  const hour = hourAt(into / gameDayMs)
  return {
    day,
    hour,
    hh: Math.floor(hour),
    mm: Math.floor((hour % 1) * 60),
    untilNextDay: gameDayMs - into,
  }
}

// ---- The calendar (CLAUDE.md §2) ----------------------------------------------------------------------------------
//
// One calendar year is one day/night cycle (gameDayMs, one real hour): the year begins on 1 January at the top of the
// real hour (midnight on the game clock) and its days pass at an even pace through the real hour (about five real
// minutes a month), not at the game clock's pace. The lobby's season starts in balance.time.calendar.startYear and the
// year goes up by one every hour. The house ages by the same years (dynasty.ts).

export const yearMs = () => balance.time.gameDayMs

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
const YEAR_DAYS = 365
// The day of the year (0-based) each month begins on.
const MONTH_START = MONTH_DAYS.map((_, m) => MONTH_DAYS.slice(0, m).reduce((n: number, d) => n + d, 0))

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
// March to May spring, June to August summer, September to November autumn, December to February winter.
export const seasonOfMonth = (month: number): Season => SEASONS[Math.floor((((month - 2) % 12) + 12) % 12 / 3)]
// The month (0-based) each season begins in.
const SEASON_FIRST_MONTH: Record<Season, number> = { spring: 2, summer: 5, autumn: 8, winter: 11 }

export interface CalendarDate {
  year: number
  // 0-based month (0 = January) and 1-based day of the month.
  month: number
  day: number
  season: Season
  // The next season, and the real time it begins.
  nextSeason: Season
  seasonEndsAt: number
}

export function calendarAt(now: number, seasonStart: number): CalendarDate {
  const ms = yearMs()
  const year = balance.time.calendar.startYear + Math.floor(now / ms) - Math.floor(seasonStart / ms)
  const yearStart = Math.floor(now / ms) * ms
  const dayOfYear = ((now - yearStart) / ms) * YEAR_DAYS
  let month = 11
  while (month > 0 && MONTH_START[month] > dayOfYear) month--
  const day = Math.min(MONTH_DAYS[month], Math.floor(dayOfYear - MONTH_START[month]) + 1)
  const season = seasonOfMonth(month)
  const nextSeason = SEASONS[(SEASONS.indexOf(season) + 1) % 4]
  let at = MONTH_START[SEASON_FIRST_MONTH[nextSeason]]
  if (at <= dayOfYear) at += YEAR_DAYS
  return { year, month, day, season, nextSeason, seasonEndsAt: yearStart + (at / YEAR_DAYS) * ms }
}

// The spans of the year (as shares of it, 0..1) a season covers.
function seasonSpans(season: Season): [number, number][] {
  const first = SEASON_FIRST_MONTH[season]
  const from = MONTH_START[first] / YEAR_DAYS
  const to = (first + 3 >= 12 ? YEAR_DAYS + MONTH_START[(first + 3) % 12] : MONTH_START[first + 3]) / YEAR_DAYS
  return to > 1 ? [[from, 1], [0, to - 1]] : [[from, to]]
}

const overlap = (a: [number, number], b: [number, number]) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]))

// How much each season weighs in a year: the share of the year it lasts, and the share of the year's work done in it
// (the people work at balance.society.night.workRate through the night, and the night falls in the year's winter).
const seasonWeights = (() => {
  const { startHour, endHour, workRate } = balance.society.night
  const nights: [number, number][] = [
    [0, dayFractionAt(endHour)],
    [dayFractionAt(startHour), 1],
  ]
  const out = {} as Record<Season, { time: number; work: number }>
  for (const s of SEASONS) {
    const spans = seasonSpans(s)
    const time = spans.reduce((n, sp) => n + sp[1] - sp[0], 0)
    const dark = spans.reduce((n, sp) => n + nights.reduce((m, ni) => m + overlap(sp, ni), 0), 0)
    out[s] = { time, work: time - dark + dark * workRate }
  }
  return out
})()

// What a season does (balance.time.seasons): the harvest of the fields and docks, and how fast sickness spreads.
// The configured values are relative; they are scaled so that a whole year comes out as before: the harvest weighed
// by the work done in each season (the nights are in winter), the sickness by the time each season lasts.
export function seasonEffect(effect: 'food' | 'sickness', season: Season): number {
  const table = balance.time.seasons[effect]
  const weight = (s: Season) => (effect === 'food' ? seasonWeights[s].work : seasonWeights[s].time)
  const total = SEASONS.reduce((n, s) => n + weight(s), 0)
  const mean = SEASONS.reduce((n, s) => n + table[s] * weight(s), 0) / total
  return table[season] / mean
}

// The share of the year each season lasts, and of the year's work done in it (for checks of the balance).
export const seasonShares = () => seasonWeights
