import { balance } from './balance'

// Game time. One game day is one real hour (balance.time.gameDayMs) and a day begins at the top of the real hour
// (CLAUDE.md §2), so the hour of the day follows the wall clock and every player sees the same time of day. Days are
// counted from the start of the season.

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
  const hour = (into / gameDayMs) * 24
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
