import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { L } from './lib/i18n'
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
        <p>{L('Oyun yüklenemedi; büyük ihtimalle yeni bir sürüm yayında.', 'The game could not load; most likely a new version has gone live.')}</p>
        <button className="btn" onClick={() => location.reload()}>
          {L('Yeniden dene', 'Try again')}
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
import { LangFlags } from './ui/home/LangFlags'
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
  { id: 'lobbies', label: L('Lobiler', 'Lobbies'), icon: 'banner' },
  { id: 'tutorial', label: L('Nasıl oynanır', 'How to play'), icon: 'book' },
  { id: 'settings', label: L('Ayarlar', 'Settings'), icon: 'gear' },
]

const ERRORS: Record<string, string> = {
  full: L('Bu lobi dolu.', 'This lobby is full.'),
  lobby: L('Bu lobi bulunamadı ya da sezonu bitti.', 'This lobby was not found, or its season is over.'),
  password: L('Şifre yanlış.', 'Wrong password.'),
  tries: L('Çok fazla yanlış şifre denendi; 10 dakika sonra tekrar dene.', 'Too many wrong passwords; try again in 10 minutes.'),
  lobbies: L('Aynı anda en fazla 3 açık lobin olabilir.', 'You can have at most 3 open lobbies at a time.'),
  rejected: L('Lobi bilgileri geçersiz.', 'The lobby details are invalid.'),
  auth: L('Oturumun sona erdi; yeniden giriş yap.', 'Your session has expired; sign in again.'),
}
const explain = (e: unknown) => ERRORS[e instanceof CommandError ? e.message : ''] ?? L('Sunucuya ulaşılamadı; tekrar dene.', 'Could not reach the server; try again.')

const setLobbyParam = (id: string | null) => {
  const url = new URL(location.href)
  if (id) url.searchParams.set('lobby', id)
  else url.searchParams.delete('lobby')
  history.replaceState(null, '', url)
}

/** The menu's subtitle: the envoy, as ever, with news nobody asked for. One per visit. */
const ENVOY_QUIPS = [
  L('Lordum, haberler var. Çoğu kötü.', 'My lord, there is news. Most of it bad.'),
  L('Lordum, mühürü ben kırmadım. Kendiliğinden kırıldı.', 'My lord, I did not break the seal. It broke itself.'),
  L('Lordum, rakip taç yine haraç istiyor. Ben "lordum evde yok" dedim, inanmadılar.', 'My lord, the rival crown wants tribute again. I told them "his lordship is not at home". They did not believe me.'),
  L('Lordum, ambar fareleri sendika kurmuş. Talepleri var.', 'My lord, the storehouse rats have formed a guild. They have demands.'),
  L('Lordum, savaş ilan edildi. Ama iyi tarafından bakın: artık sıkılmayacağız.', 'My lord, war has been declared. But look on the bright side: we shan\'t be bored.'),
  L('Lordum, kardeşiniz size bakıyor. Pek sevgiyle değil.', 'My lord, your brother is looking at you. Not fondly.'),
  L('Lordum, yağmacılar tüccarımızı soydu. Tüccar da onlara indirim yaptı.', 'My lord, bandits robbed our merchant. He gave them a discount.'),
  L('Lordum, ben sadece haberi getiririm. Haberin kendisinden sorumlu değilim.', 'My lord, I merely bring the news. I accept no responsibility for it.'),
  L('Lordum, size iki haberim var: biri kötü, öbürü daha kötü.', 'My lord, I have two pieces of news: one bad, the other worse.'),
  L('Lordum, tahtınız sağlam. Şimdilik. Muhtemelen.', 'My lord, your throne is secure. For now. Probably.'),
  L('Lordum, kraliçe nerede diye sormayın. Ben de bilmiyorum, casuslar biliyor.', 'My lord, do not ask where the queen is. I do not know either; the spies do.'),
  L('Lordum, halk vergileri sevdiğini söyledi. Ben yazdım, onlar imzaladı.', 'My lord, the people say they love the taxes. I wrote it down; they signed.'),
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
            <div className="spinner big" role="status" aria-label={L('Yükleniyor', 'Loading')}>
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
        <div className="spinner big" role="status" aria-label={L('Yükleniyor', 'Loading')}>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      )}
      {phase.kind === 'auth' && <AuthScreen />}
      {phase.kind === 'home' && profile && splash && (
        <div className="home-continue">
          <button className="btn" onClick={() => setSplash(false)}>
            {L('Devam et', 'Continue')}
          </button>
          <LangFlags />
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
