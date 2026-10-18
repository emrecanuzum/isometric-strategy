import { balance } from './balance'
import { fortuneIn } from './institutions'
import { MONTH_DAYS, calendarAt, yearMs } from './clock'
import type { Season } from './clock'

// The weather over the map (CLAUDE.md §4.2.1), only to be seen: rain falls while the lobby's rain, storm, flood, hail
// or cold snap is under way (§9.8), and now and then a passing shower besides, as often as the season brings them (few
// in summer, most in autumn), some of them thunderstorms. In winter it snows instead. It follows from the lobby's key and the
// time alone, so every screen shows the same sky and nothing is stored. Values in config/balance/weather.json.

const W = balance.weather

export interface Weather {
  // How hard it rains, 0 (dry) to 1 (a storm), with the fade in and out.
  rain: number
  // How grey the map is, 0 to 1: the clouds gather before the rain and break up after it.
  grey: number
  // How far the rain leans across the screen per pixel it falls (signed: + to the right).
  wind: number
  // Sleet and hail: pale, slower drops.
  sleet: boolean
  // A storm: lightning flashes now and then.
  lightning: boolean
  // Snow (in winter): white flakes drifting down instead of rain.
  snow: boolean
}

export const CLEAR_WEATHER: Weather = { rain: 0, grey: 0, wind: 0, sleet: false, lightning: false, snow: false }

interface FortuneWeather {
  rain: number
  grey: number
  wind: number
  sleet?: boolean
  lightning?: boolean
}
const FORTUNE_WEATHER = W.fortunes as Record<string, FortuneWeather>

function mix(...values: number[]) {
  let h = 0x9e3779b9
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
  }
  return (h >>> 0) / 4294967296
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// How far into a spell of weather from `start` to `end` the clouds (grey) and the rain have come at `at`: the clouds
// gather for gatherSeconds before it starts, the rain fades in and out over fadeSeconds.
function envelope(start: number, end: number, at: number) {
  const gather = W.gatherSeconds * 1000
  const fade = W.fadeSeconds * 1000
  const grey = clamp01(Math.min((at - (start - gather)) / gather, (end + gather - at) / gather))
  const rain = clamp01(Math.min((at - start) / fade, (end - at) / fade))
  return { grey, rain }
}

// The lobby's fortune that makes weather near `at` (the one under way, or the next one while its clouds gather).
function fortuneWeather(lobbyKey: number, at: number) {
  const seeded = { site: { x: 0, y: 0 }, foundedAt: 0, lobbyKey }
  const windowMs = balance.institutions.events.lobby.windowSeconds * 1000
  const index = Math.floor(at / windowMs)
  let clear = false
  let best: { w: FortuneWeather; grey: number; rain: number } | null = null
  for (const i of [index - 1, index, index + 1]) {
    const f = fortuneIn(seeded, i, 'lobby')
    if (!f) continue
    if (f.start <= at && at < f.end && (W.clearKinds as string[]).includes(f.kind)) clear = true
    const w = FORTUNE_WEATHER[f.kind]
    if (!w) continue
    const e = envelope(f.start, f.end, at)
    if (e.grey > 0 && (!best || e.grey > best.grey)) best = { w, ...e }
  }
  return { clear, best }
}

// The season (from the calendar: the hour of the year it is) at `at`.
export const weatherSeason = (at: number): Season => calendarAt(at, 0).season
const snowsIn = (season: Season) => (W.snowSeasons as string[]).includes(season)

const FIRST_MONTH: Record<Season, number> = { spring: 2, summer: 5, autumn: 8, winter: 11 }
// How far into its season `at` is, 0..1.
export function seasonProgress(at: number): number {
  const { season, seasonEndsAt } = calendarAt(at, 0)
  const days = [0, 1, 2].reduce((n, i) => n + MONTH_DAYS[(FIRST_MONTH[season] + i) % 12], 0)
  const length = (days / 365) * yearMs()
  return Math.min(1, Math.max(0, 1 - (seasonEndsAt - at) / length))
}

// How deep the snow lies on the ground, roofs and trees (CLAUDE.md §4.2.1): 0 none, 1 a dusting, 2 patchy, 3 a white
// blanket. It comes from the calendar alone (balance.weather.snowCover: steps through winter, melting early in
// spring), so every screen shows the same and nothing is stored; the map repaints its ground when it changes.
export function snowCover(at: number): number {
  const steps = (W.snowCover as Record<string, number[][]>)[calendarAt(at, 0).season]
  if (!steps) return 0
  const p = seasonProgress(at)
  let level = 0
  for (const [from, to] of steps) if (p >= from) level = to
  return level
}

// A passing shower in window `index`, if one falls then: as likely as the season of the window's middle makes it,
// and sometimes a thunderstorm.
function showerIn(lobbyKey: number, index: number) {
  const s = W.showers
  const windowMs = s.windowSeconds * 1000
  const season = weatherSeason(index * windowMs + windowMs / 2)
  const odds = s.seasons[season]
  if (mix(lobbyKey, index, 11) >= odds.chance) return null
  const length = (s.minSeconds + mix(lobbyKey, index, 12) * (s.maxSeconds - s.minSeconds)) * 1000
  const lead = W.gatherSeconds * 1000
  const start = index * windowMs + lead + Math.floor(mix(lobbyKey, index, 13) * (windowMs - length - 2 * lead))
  const storm = mix(lobbyKey, index, 15) < odds.storm
  const [min, max] = storm ? [s.storm.minRain, s.storm.maxRain] : [s.minRain, s.maxRain]
  const rain = min + mix(lobbyKey, index, 14) * (max - min)
  return { start, end: start + length, rain, storm }
}

// The wind's lean this quarter of an hour: the same way for everyone, changing now and then.
function windAt(lobbyKey: number, at: number) {
  const index = Math.floor(at / (W.windWindowSeconds * 1000))
  const strength = W.minWind + mix(lobbyKey, index, 21) * (W.maxWind - W.minWind)
  return mix(lobbyKey, Math.floor(index / 3), 22) < 0.5 ? -strength : strength
}

export function weatherAt(lobbyKey: number | undefined, at: number): Weather {
  if (lobbyKey === undefined) return CLEAR_WEATHER
  const { clear, best } = fortuneWeather(lobbyKey, at)
  const lean = windAt(lobbyKey, at)
  let out: Weather = CLEAR_WEATHER
  if (best) {
    out = {
      rain: best.w.rain * best.rain,
      grey: best.w.grey * best.grey,
      wind: Math.sign(lean) * Math.max(Math.abs(lean), best.w.wind),
      sleet: !!best.w.sleet,
      lightning: !!best.w.lightning && best.rain > 0.6,
      snow: false,
    }
  }
  if (clear) return winterize(out, at)
  const index = Math.floor(at / (W.showers.windowSeconds * 1000))
  for (const i of [index - 1, index, index + 1]) {
    const s = showerIn(lobbyKey, i)
    if (!s) continue
    const e = envelope(s.start, s.end, at)
    const rain = s.rain * e.rain
    const grey = (s.storm ? W.showers.storm.grey : Math.min(0.75, s.rain + 0.15)) * e.grey
    if (grey > out.grey || rain > out.rain) {
      const wind = s.storm ? Math.sign(lean || 1) * Math.max(Math.abs(lean), W.showers.storm.wind) : out.wind || lean
      out = { rain: Math.max(rain, out.rain), grey: Math.max(grey, out.grey), wind, sleet: out.sleet, lightning: out.lightning || (s.storm && e.rain > 0.6), snow: false }
    }
  }
  return winterize(out, at)
}

// In winter whatever falls is snow: no thunder, and it drifts more than it leans.
const winterize = (w: Weather, at: number): Weather => (w.grey > 0 && snowsIn(weatherSeason(at)) ? { ...w, snow: true, sleet: false, lightning: false, wind: w.wind * 0.6 } : w)

// Whether a lightning flash lights the sky at `at` during a storm, and how bright (1 at the strike, fading out).
export function lightningAt(lobbyKey: number, at: number): number {
  const { slotSeconds, chance, flashSeconds } = W.lightning
  const slotMs = slotSeconds * 1000
  const slot = Math.floor(at / slotMs)
  if (mix(lobbyKey, slot, 31) >= chance) return 0
  const strike = slot * slotMs + mix(lobbyKey, slot, 32) * (slotMs - 1000)
  const t = (at - strike) / 1000
  if (t < 0) return 0
  // A strike, a short dark gap and a second, weaker flicker.
  if (t < flashSeconds) return 1 - t / flashSeconds
  const second = t - flashSeconds - 0.08
  if (second >= 0 && second < flashSeconds * 0.6) return 0.55 * (1 - second / (flashSeconds * 0.6))
  return 0
}
