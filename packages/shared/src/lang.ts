// The language the player reads the game in (CLAUDE.md §11 Dil). Turkish is the source language; every
// player-facing string is written as `L('Türkçe', 'English')`, picked when it is evaluated. The language is set once
// when the page loads (the client switches it by reloading), so module-level constants may call `L` too.
// The server never sets it and stays Turkish.

export type Lang = 'tr' | 'en'

let current: Lang = 'tr'

export const setLang = (lang: Lang) => {
  current = lang
}

export const getLang = (): Lang => current

export const L = (tr: string, en: string): string => (current === 'en' ? en : tr)

// The locale for numbers, dates and case changes.
export const locale = () => (current === 'en' ? 'en-US' : 'tr-TR')

// Names the server builds and stores (it stays Turkish): a clan, a band, a pirate haven or rebels, read in English.
export const localName = <T>(s: T): T =>
  current === 'en' && typeof s === 'string'
    ? (s
        .replace(/^(.+) klanı$/, '$1 clan')
        .replace(/^(.+) çetesi$/, "$1's band")
        .replace(/^(.+) korsan limanı$/, '$1 pirate haven')
        .replace(/^(.+) asileri$/, "$1's rebels")
        .replace(/^Asiler$/, 'Rebels')
        .replace(/^Yağmacılar$/, 'Bandits') as T)
    : s

// A notice's payload (or a battle report) with those names read in the player's language, keys included.
export const localPayload = <T>(p: T): T => {
  if (current !== 'en' || p == null) return p
  if (typeof p === 'string') return localName(p)
  if (Array.isArray(p)) return p.map(localPayload) as T
  if (typeof p === 'object') return Object.fromEntries(Object.entries(p as Record<string, unknown>).map(([k, v]) => [localName(k), localPayload(v)])) as T
  return p
}
