import { balance } from './balance'

// Game time. One game day is one real hour (balance.time.gameDayMs) and a day begins at the top of the real hour
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
  // 1-based day of the season, and of its month.
  day: number
  month: number
  dayOfMonth: number
  // Time of day, 0..24, and its whole hours and minutes.
  hour: number
  hh: number
  mm: number
  // Real milliseconds until the next day begins (the economic day tick).
  untilNextDay: number
}

export function gameTime(now: number, seasonStart: number): GameTime {
  const { gameDayMs, monthGameDays } = balance.time
  const day = Math.max(1, Math.floor(now / gameDayMs) - Math.floor(seasonStart / gameDayMs) + 1)
  const into = ((now % gameDayMs) + gameDayMs) % gameDayMs
  const hour = hourAt(into / gameDayMs)
  return {
    day,
    month: Math.floor((day - 1) / monthGameDays) + 1,
    dayOfMonth: ((day - 1) % monthGameDays) + 1,
    hour,
    hh: Math.floor(hour),
    mm: Math.floor((hour % 1) * 60),
    untilNextDay: gameDayMs - into,
  }
}
