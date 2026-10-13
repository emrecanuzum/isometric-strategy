// The light over the map through the day: a colour the scene is multiplied by, white at noon, warm at dawn and dusk,
// dim blue at night (never so dark that the map cannot be read), and the name of that part of the day.

// [hour, colour] keyframes around the clock; colours are blended between them.
const KEYS: [number, number][] = [
  [0, 0x6a78b8],
  [4.5, 0x6a78b8],
  [5.5, 0xb898b8],
  [6.5, 0xffc8a0],
  [8, 0xffffff],
  [17, 0xffffff],
  [18.5, 0xffb488],
  [19.5, 0xa890c0],
  [20.5, 0x6a78b8],
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
  if (hour < 5 || hour >= 20.5) return 'night'
  if (hour < 7) return 'dawn'
  if (hour < 11) return 'morning'
  if (hour < 14) return 'noon'
  if (hour < 18) return 'afternoon'
  return 'dusk'
}

export const PHASE_NAMES: Record<DayPhase, string> = {
  night: 'Gece',
  dawn: 'Şafak',
  morning: 'Sabah',
  noon: 'Öğle',
  afternoon: 'İkindi',
  dusk: 'Akşam',
}

export const isNight = (hour: number) => dayPhase(hour) === 'night'

// How dark it is, 0 by day to 1 in the depth of night: lit windows fade in with it from dusk.
const luma = (c: number) => (((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11) / 255
const NIGHT_LUMA = luma(KEYS[0][1])
export const nightness = (hour: number) => Math.min(1, Math.max(0, (1 - luma(daylight(hour))) / (1 - NIGHT_LUMA)))
