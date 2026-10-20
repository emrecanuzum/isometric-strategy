// A page left open while the game is updated reloads itself: every couple of minutes, and whenever the tab comes back
// into view, it reads the id of the build now served (version.json, written at build time) and, when that is newer
// than its own, says so for a moment and reloads.

import { L } from './i18n'

const CHECK_MS = 90_000
const NOTICE_MS = 2500

async function served(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const { build } = (await response.json()) as { build?: string }
    return build ?? null
  } catch {
    return null
  }
}

function announce() {
  const note = document.createElement('div')
  note.className = 'update-note'
  note.textContent = L('Oyun güncellendi, sayfa yenileniyor…', 'The game has been updated, reloading the page…')
  document.body.appendChild(note)
}

export function watchForUpdates() {
  if (import.meta.env.DEV) return
  let reloading = false
  const check = async () => {
    if (reloading) return
    const build = await served()
    if (!build || build === __BUILD_ID__) return
    reloading = true
    announce()
    window.setTimeout(() => window.location.reload(), NOTICE_MS)
  }
  window.setInterval(check, CHECK_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
