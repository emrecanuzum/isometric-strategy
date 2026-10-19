import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
// The game (the map, Pixi, every panel and picture) is its own chunk (CLAUDE.md §12): the sign-in screen and the menu
// load without it, and it is fetched in the background as soon as the menu is up.
const loadApp = () => import('./App')
const App = lazy(loadApp)

// The game's chunk could not be fetched (a new version went live and the old file is gone): reload once to get the new
// one, else offer to try again, instead of a blank page.
class ChunkGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    const chunk = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(String((error as Error)?.message ?? error))
    try {
      if (chunk && !sessionStorage.getItem('chunk-reload')) {
        sessionStorage.setItem('chunk-reload', '1')
        location.reload()
      }
    } catch {
      // Without storage the retry button is enough.
    }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="home-screen">
        <p>Oyun yüklenemedi; büyük ihtimalle yeni bir sürüm yayında.</p>
        <button className="btn" onClick={() => location.reload()}>
          Yeniden dene
        </button>
      </main>
    )
  }
}
import { supabase } from './lib/supabase'
import { keepClockSynced, syncClock } from './net/clock'
import { CommandError, createLobby, currentUser, getLobby, loadMine, lobbyRiverKeep, send, signOut } from './net/online'
import type { Lobby, LobbyListing, Mine } from './net/online'
import { play as sound } from './audio/sfx'
import { loadProfile, useMusic, useSettings } from './net/settings'
import type { Profile } from './net/settings'
import { Icon } from './ui/icons'
import { AuthScreen } from './ui/home/AuthScreen'
import { Lobbies } from './ui/home/Lobbies'
import { SettingsPanel } from './ui/home/SettingsPanel'
import { Tutorial } from './ui/home/Tutorial'
import { MenuBackdrop, MenuCrown } from './ui/home/MenuBackdrop'

// Before the map: signing in, then the main menu (lobbies, how to play, settings). The lobby being played goes into
// the address (?lobby=<id>) so a reload comes back to it.

type Phase =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'home' }
  | { kind: 'game'; lobby: Lobby; mine: Mine }

type Tab = 'lobbies' | 'tutorial' | 'settings'
const TABS: { id: Tab; label: string; icon: 'banner' | 'book' | 'gear' }[] = [
  { id: 'lobbies', label: 'Lobiler', icon: 'banner' },
  { id: 'tutorial', label: 'Nasıl oynanır', icon: 'book' },
  { id: 'settings', label: 'Ayarlar', icon: 'gear' },
]

const ERRORS: Record<string, string> = {
  full: 'Bu lobi dolu.',
  lobby: 'Bu lobi bulunamadı ya da sezonu bitti.',
  password: 'Şifre yanlış.',
  tries: 'Çok fazla yanlış şifre denendi; 10 dakika sonra tekrar dene.',
  lobbies: 'Aynı anda en fazla 3 açık lobin olabilir.',
  rejected: 'Lobi bilgileri geçersiz.',
  auth: 'Oturumun sona erdi; yeniden giriş yap.',
}
const explain = (e: unknown) => ERRORS[e instanceof CommandError ? e.message : ''] ?? 'Sunucuya ulaşılamadı; tekrar dene.'

const setLobbyParam = (id: string | null) => {
  const url = new URL(location.href)
  if (id) url.searchParams.set('lobby', id)
  else url.searchParams.delete('lobby')
  history.replaceState(null, '', url)
}

/** The menu's subtitle: the envoy, as ever, with news nobody asked for. One per visit. */
const ENVOY_QUIPS = [
  'Lordum, haberler var. Çoğu kötü.',
  'Lordum, mühürü ben kırmadım. Kendiliğinden kırıldı.',
  'Lordum, rakip taç yine haraç istiyor. Ben "lordum evde yok" dedim, inanmadılar.',
  'Lordum, ambar fareleri sendika kurmuş. Talepleri var.',
  'Lordum, savaş ilan edildi. Ama iyi tarafından bakın: artık sıkılmayacağız.',
  'Lordum, kardeşiniz size bakıyor. Pek sevgiyle değil.',
  'Lordum, yağmacılar tüccarımızı soydu. Tüccar da onlara indirim yaptı.',
  'Lordum, ben sadece haberi getiririm. Haberin kendisinden sorumlu değilim.',
  'Lordum, size iki haberim var: biri kötü, öbürü daha kötü.',
  'Lordum, tahtınız sağlam. Şimdilik. Muhtemelen.',
  'Lordum, kraliçe nerede diye sormayın. Ben de bilmiyorum, casuslar biliyor.',
  'Lordum, halk vergileri sevdiğini söyledi. Ben yazdım, onlar imzaladı.',
]
const envoyQuip = ENVOY_QUIPS[Math.floor(Math.random() * ENVOY_QUIPS.length)]

export default function Root() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  // Fetch the game's chunk while the player looks at the menu, so entering a lobby does not wait for it.
  useEffect(() => {
    if (phase.kind === 'home') void loadApp().catch(() => {})
  }, [phase.kind])
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [profile, setProfile] = useState<Profile | null>(null)
  const { settings, update: updateSettings, load: loadSettings } = useSettings()
  const [tab, setTab] = useState<Tab>('lobbies')
  // The menu opens on the scene alone: one button, so the landscape can be watched before the lobbies cover it.
  const [splash, setSplash] = useState(true)
  const opening = splash && phase.kind === 'home'
  useEffect(() => {
    if (!opening) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') setSplash(false)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [opening])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Softer in the menus than on the map.
  useMusic(settings, phase.kind === 'game' ? 1 : 0.45)
  // Every button answers with a soft tick (except those that make a sound of their own).
  useEffect(() => {
    const tick = (e: MouseEvent) => {
      const button = (e.target as Element | null)?.closest?.('button')
      if (button && !button.disabled && !button.hasAttribute('data-silent')) sound('click')
    }
    document.addEventListener('click', tick, true)
    return () => document.removeEventListener('click', tick, true)
  }, [])

  // In the lobby now: what its widened rivers leave dry can be read (its own players only), then the map opens.
  const play = useCallback(async (lobby: Lobby, mine: Mine) => {
    const keep = (lobby.world_rev ?? 1) >= 6 ? await lobbyRiverKeep(lobby.id) : null
    sound('enter')
    setLobbyParam(lobby.id)
    setPhase({ kind: 'game', lobby: { ...lobby, river_keep: keep }, mine })
  }, [])

  // Signed in: the profile, then the lobby in the address if there is one, else the menu.
  const arrive = useCallback(async () => {
    const found = await loadProfile()
    if (!found) return setPhase({ kind: 'auth' })
    setProfile(found)
    loadSettings(found.settings)
    const id = new URLSearchParams(location.search).get('lobby')
    const lobby = id ? await getLobby(id) : null
    const mine = lobby ? await loadMine(lobby.id) : null
    if (lobby && mine) return play(lobby, mine)
    setLobbyParam(null)
    setPhase({ kind: 'home' })
  }, [loadSettings, play])

  useEffect(() => {
    let live = true
    syncClock()
    currentUser().then((user) => live && (user ? arrive() : setPhase({ kind: 'auth' })))
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Also sent when the tab regains focus; only a sign-in from the form moves on.
      if (event === 'SIGNED_IN' && phaseRef.current.kind === 'auth') {
        setPhase({ kind: 'loading' })
        // Supabase calls made inside this callback would wait on the auth lock; run them after it.
        setTimeout(arrive, 0)
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setLobbyParam(null)
        setPhase({ kind: 'auth' })
      }
    })
    const stop = keepClockSynced()
    return () => {
      live = false
      data.subscription.unsubscribe()
      stop()
    }
  }, [arrive])

  const enter = async (listing: LobbyListing, password: string) => {
    setBusy(listing.id)
    setError(null)
    try {
      const lobby = await getLobby(listing.id)
      if (!lobby) throw new CommandError('lobby')
      await play(lobby, (await loadMine(lobby.id)) ?? (await send(lobby.id, { type: 'join', password })))
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }

  const create = async (name: string, maxPlayers: number, password: string) => {
    setBusy('create')
    setError(null)
    try {
      const { lobby: id, kingdom } = await createLobby(name, maxPlayers, password)
      const lobby = await getLobby(id)
      if (!lobby) throw new CommandError('lobby')
      await play(lobby, kingdom)
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }

  if (phase.kind === 'game') {
    return (
      <ChunkGuard>
      <Suspense
        fallback={
          <main className="home-screen">
            <div className="spinner big" role="status" aria-label="Yükleniyor">
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
          </main>
        }
      >
      <App
        key={phase.lobby.id}
        lobby={phase.lobby}
        initial={phase.mine}
        username={profile?.username ?? ''}
        settings={settings}
        onSettings={updateSettings}
        onExit={() => {
          sound('leave')
          setLobbyParam(null)
          setTab('lobbies')
          setSplash(false)
          setPhase({ kind: 'home' })
        }}
      />
      </Suspense>
      </ChunkGuard>
    )
  }
  return (
    <main className="home-screen">
      <MenuBackdrop />
      <header className="home-title">
        <MenuCrown />
        <h1>Crownherald</h1>
        <i className="home-rule" aria-hidden />
        <p>{envoyQuip}</p>
      </header>
      {phase.kind === 'loading' && (
        <div className="spinner big" role="status" aria-label="Yükleniyor">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      )}
      {phase.kind === 'auth' && <AuthScreen />}
      {phase.kind === 'home' && profile && splash && (
        <div className="home-continue">
          <button className="btn" onClick={() => setSplash(false)}>
            Devam et
          </button>
        </div>
      )}
      {phase.kind === 'home' && profile && !splash && (
        <section className="home-card frame">
          <div className="home-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="btn small" onClick={() => (setTab(t.id), setError(null))}>
                <Icon name={t.icon} size={16} /> {t.label}
              </button>
            ))}
          </div>
          {tab === 'lobbies' && <Lobbies busy={busy} error={error} onEnter={enter} onCreate={create} admin={profile.admin} />}
          {tab === 'tutorial' && <Tutorial />}
          {tab === 'settings' && <SettingsPanel profile={profile} settings={settings} onChange={updateSettings} onSignOut={signOut} />}
          <footer className="home-foot">
            <small>
              <Icon name="villager" size={16} /> {profile.username}
            </small>
          </footer>
        </section>
      )}
    </main>
  )
}
