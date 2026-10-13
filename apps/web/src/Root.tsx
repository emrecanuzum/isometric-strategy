import { useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import { supabase } from './lib/supabase'
import { keepClockSynced, syncClock } from './net/clock'
import { CommandError, createLobby, currentUser, getLobby, loadMine, send, signOut } from './net/online'
import type { Lobby, LobbyListing, Mine } from './net/online'
import { loadProfile, useMusic, useSettings } from './net/settings'
import type { Profile } from './net/settings'
import { Icon } from './ui/icons'
import { AuthScreen } from './ui/home/AuthScreen'
import { Lobbies } from './ui/home/Lobbies'
import { SettingsPanel } from './ui/home/SettingsPanel'
import { Tutorial } from './ui/home/Tutorial'

// Before the map: signing in, then the main menu (lobbies, how to play, settings). The lobby being played goes into
// the address (?lobby=<id>) so a reload comes back to it.

type Phase =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'home' }
  | { kind: 'game'; lobby: Lobby; mine: Mine }

type Tab = 'lobbies' | 'tutorial' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'lobbies', label: 'Lobiler' },
  { id: 'tutorial', label: 'Nasıl oynanır' },
  { id: 'settings', label: 'Ayarlar' },
]

const ERRORS: Record<string, string> = {
  full: 'Bu lobi dolu.',
  lobby: 'Bu lobi bulunamadı ya da sezonu bitti.',
  password: 'Şifre yanlış.',
  tries: 'Çok fazla yanlış şifre denendi; 10 dakika sonra tekrar dene.',
  lobbies: 'Aynı anda en fazla 3 açık lobin olabilir.',
  rejected: 'Lobi bilgileri geçersiz.',
}
const explain = (e: unknown) => ERRORS[e instanceof CommandError ? e.message : ''] ?? 'Sunucuya ulaşılamadı; tekrar dene.'

const setLobbyParam = (id: string | null) => {
  const url = new URL(location.href)
  if (id) url.searchParams.set('lobby', id)
  else url.searchParams.delete('lobby')
  history.replaceState(null, '', url)
}

export default function Root() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [profile, setProfile] = useState<Profile | null>(null)
  const { settings, update: updateSettings, load: loadSettings } = useSettings()
  const [tab, setTab] = useState<Tab>('lobbies')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useMusic(settings)

  const play = useCallback((lobby: Lobby, mine: Mine) => {
    setLobbyParam(lobby.id)
    setPhase({ kind: 'game', lobby, mine })
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
      play(lobby, (await loadMine(lobby.id)) ?? (await send(lobby.id, { type: 'join', password })))
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
      play(lobby, kingdom)
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }

  if (phase.kind === 'game') {
    return (
      <App
        key={phase.lobby.id}
        lobby={phase.lobby}
        initial={phase.mine}
        settings={settings}
        onSettings={updateSettings}
        onExit={() => {
          setLobbyParam(null)
          setTab('lobbies')
          setPhase({ kind: 'home' })
        }}
      />
    )
  }
  return (
    <main className="home-screen">
      <header className="home-title">
        <Icon name="crown" size={48} />
        <h1>Krallıklar</h1>
        <p>İki haftalık sezonlarda şehrini kur, komşularınla yarış</p>
      </header>
      {phase.kind === 'loading' && (
        <div className="spinner big" role="status" aria-label="Yükleniyor">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
      )}
      {phase.kind === 'auth' && <AuthScreen />}
      {phase.kind === 'home' && profile && (
        <section className="home-card frame">
          <div className="home-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="btn small" onClick={() => (setTab(t.id), setError(null))}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'lobbies' && <Lobbies busy={busy} error={error} onEnter={enter} onCreate={create} />}
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
