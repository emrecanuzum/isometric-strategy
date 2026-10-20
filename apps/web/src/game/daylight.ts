import { balance } from '@game/shared'
import { L } from '../lib/i18n'

// The light over the map through the day: a colour the scene is multiplied by, white at noon, warm at dawn and dusk,
// dim blue at night (never so dark that the map cannot be read), and the name of that part of the day.

// [hour, colour] keyframes around the clock; colours are blended between them. Full night runs from the night's start
// to its end on the game clock (balance.society.night), with dawn running on to dawnEndHour and dusk setting in from
// duskStartHour.
const { startHour, endHour, dawnEndHour, duskStartHour } = balance.society.night
const KEYS: [number, number][] = [
  [0, 0x6a78b8],
  [endHour - 0.5, 0x6a78b8],
  [endHour + 0.5, 0xb898b8],
  [endHour + 1.5, 0xffc8a0],
  [dawnEndHour, 0xffffff],
  [duskStartHour, 0xffffff],
  [startHour - 2, 0xffb488],
  [startHour - 1, 0xa890c0],
  [startHour, 0x6a78b8],
  [24, 0x6a78b8],
]

const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export function daylight(hour: number): number {
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, c1] = KEYS[i]
    const [h0, c0] = KEYS[i - 1]
    if (hour <= h1) return mix(c0, c1, (hour - h0) / (h1 - h0 || 1))
  }
  return KEYS[KEYS.length - 1][1]
}

export type DayPhase = 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk'

export function dayPhase(hour: number): DayPhase {
  if (hour < endHour || hour >= startHour) return 'night'
  if (hour < endHour + 2) return 'dawn'
  if (hour < 11) return 'morning'
  if (hour < 14) return 'noon'
  if (hour < 18) return 'afternoon'
  return 'dusk'
}

export const PHASE_NAMES: Record<DayPhase, string> = {
  night: L('Gece', 'Night'),
  dawn: L('Şafak', 'Dawn'),
  morning: L('Sabah', 'Morning'),
  noon: L('Öğle', 'Noon'),
  afternoon: L('İkindi', 'Afternoon'),
  dusk: L('Akşam', 'Evening'),
}

export const isNight = (hour: number) => dayPhase(hour) === 'night'

// The sun's shadows through the day: how far a shadow reaches across (x) and down (y) the screen per pixel of height,
// and how dark it is. Light comes from the upper left, so shadows fall to the right and down: long and nearly level at
// sunrise, short and dark at noon, long toward the lower right at sunset. At night only a short faint shadow stays at
// the foot of things.
export interface SunShadow {
  x: number
  y: number
  alpha: number
}
const NIGHT_SHADOW: SunShadow = { x: 0.2, y: 0.12, alpha: 0.16 }
const SUN: [number, SunShadow][] = [
  [0, NIGHT_SHADOW],
  [endHour + 0.5, NIGHT_SHADOW],
  [endHour + 1.25, { x: 1.7, y: 0.18, alpha: 0.22 }],
  [8, { x: 1, y: 0.28, alpha: 0.3 }],
  [12.5, { x: 0.45, y: 0.32, alpha: 0.36 }],
  [17, { x: 0.75, y: 0.65, alpha: 0.32 }],
  [startHour - 1.25, { x: 1.2, y: 1.15, alpha: 0.24 }],
  [startHour - 0.5, NIGHT_SHADOW],
  [24, NIGHT_SHADOW],
]

export function sunShadow(hour: number): SunShadow {
  for (let i = 1; i < SUN.length; i++) {
    const [h1, b] = SUN[i]
    const [h0, a] = SUN[i - 1]
    if (hour > h1) continue
    const t = (hour - h0) / (h1 - h0 || 1)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, alpha: a.alpha + (b.alpha - a.alpha) * t }
  }
  return NIGHT_SHADOW
}

// How dark it is, 0 by day to 1 in the depth of night: lit windows fade in with it from dusk.
const luma = (c: number) => (((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11) / 255
const NIGHT_LUMA = luma(KEYS[0][1])
export const nightness = (hour: number) => Math.min(1, Math.max(0, (1 - luma(daylight(hour))) / (1 - NIGHT_LUMA)))
