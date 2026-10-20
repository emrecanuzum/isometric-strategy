import { setLang, type Lang } from '@game/shared/lang'

// Picks the language before anything else is evaluated (main.tsx imports this first): the player's choice if they
// made one, else the browser's (Turkish for a Turkish browser, English for everyone else). Changing it reloads the
// page, so the map's labels and every module-level string are rebuilt in the new language.

const KEY = 'lang'

const stored = (): Lang | null => {
  if (typeof document === 'undefined') return 'tr'
  try {
    const v = localStorage.getItem(KEY)
    return v === 'tr' || v === 'en' ? v : null
  } catch {
    return null
  }
}

const browser = (): Lang => {
  if (typeof navigator === 'undefined') return 'tr'
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => l?.toLowerCase().startsWith('tr')) ? 'tr' : 'en'
}

const lang = stored() ?? browser()
setLang(lang)
// Also safe inside the paint worker (no document there; it never shows text and stays Turkish).
if (typeof document !== 'undefined') document.documentElement.lang = lang

export const chooseLang = (next: Lang) => {
  if (next === lang) return
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // private mode: the choice lasts this page only
  }
  location.reload()
}

export { getLang, L, locale, localName, localPayload } from '@game/shared/lang'
export type { Lang }
