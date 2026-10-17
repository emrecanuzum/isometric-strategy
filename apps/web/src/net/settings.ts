import { useCallback, useEffect, useRef, useState } from 'react'
import { startMusic } from '../audio/music'
import { setBattleMusicLevel, setSfx, unlockSfx } from '../audio/sfx'
import type { Music } from '../audio/music'
import { supabase } from '../lib/supabase'

// The player's settings, kept in their profile so they follow the account to any device.

export interface Settings {
  music: boolean
  // 0..100
  musicVolume: number
  // Sound effects (the envoy's news, battles, the day's events), and how loud, 0..100.
  sfx: boolean
  sfxVolume: number
  // Small motions on the map, such as trees swaying close up; off for slower machines or a calmer screen.
  detail: boolean
}

export const DEFAULT_SETTINGS: Settings = { music: true, musicVolume: 70, sfx: true, sfxVolume: 70, detail: true }

export interface Profile {
  username: string
  email: string
  // May delete any lobby.
  admin: boolean
  settings: Settings
}

export async function loadProfile(): Promise<Profile | null> {
  const { data: auth, error } = await supabase.auth.getUser()
  // A busy or unreachable server is not a signed-out player: the session's own user stands in until it answers.
  const refused = !!error && typeof error.status === 'number' && error.status >= 400 && error.status < 500
  const user = auth.user ?? (refused ? null : (await supabase.auth.getSession()).data.session?.user ?? null)
  if (!user) return null
  const { data } = await supabase.from('profiles').select('username, settings, is_admin').eq('user_id', user.id).maybeSingle()
  return {
    username: data?.username ?? user.email?.split('@')[0] ?? '',
    email: user.email ?? '',
    admin: data?.is_admin === true,
    settings: { ...DEFAULT_SETTINGS, ...(data?.settings as Partial<Settings> | undefined) },
  }
}

export async function saveSettings(settings: Settings) {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return
  await supabase.from('profiles').update({ settings }).eq('user_id', auth.user.id)
}

// The tavern music, for the menu and the map alike. Browsers only allow audio after a user gesture; on touch screens
// that is the finger lifting (touchend/click), not pointerdown, so every kind is tried until the audio is running.
// The tavern tune steps aside (fades low) while something else plays, such as the battle music.
let duck = 1
const duckers = new Set<(d: number) => void>()
export function duckMusic(on: boolean) {
  duck = on ? 0.08 : 1
  for (const listen of duckers) listen(duck)
}

// `quiet`: a share of the volume while away from the map (the main menu plays it softer).
export function useMusic(settings: Settings, quiet = 1) {
  const [ducked, setDucked] = useState(duck)
  useEffect(() => {
    duckers.add(setDucked)
    return () => {
      duckers.delete(setDucked)
    }
  }, [])
  const music = useRef<Music | null>(null)
  const current = useRef(settings)
  current.current = settings
  const quietRef = useRef(quiet)
  quietRef.current = quiet
  useEffect(() => {
    const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const
    const unlock = () => {
      music.current ??= startMusic(!current.current.music, (current.current.musicVolume / 100) * quietRef.current)
      const sfx = unlockSfx()
      if (music.current.unlock() && sfx) for (const type of events) window.removeEventListener(type, unlock)
    }
    for (const type of events) window.addEventListener(type, unlock)
    return () => {
      for (const type of events) window.removeEventListener(type, unlock)
      music.current?.destroy()
      music.current = null
    }
  }, [])
  useEffect(() => {
    music.current?.setMuted(!settings.music)
    music.current?.setVolume((settings.musicVolume / 100) * quiet * ducked)
    setBattleMusicLevel(settings.music, settings.musicVolume / 100)
  }, [settings.music, settings.musicVolume, quiet, ducked])
  useEffect(() => setSfx(settings.sfx, settings.sfxVolume / 100), [settings.sfx, settings.sfxVolume])
}

// Settings change at once on screen and are written to the profile a moment after the last change. `load` takes the
// profile's settings as they are, without writing them back.
export function useSettings() {
  const [settings, set] = useState(DEFAULT_SETTINGS)
  const timer = useRef(0)
  const update = useCallback((change: Partial<Settings>) => {
    set((s) => {
      const next = { ...s, ...change }
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => saveSettings(next), 600)
      return next
    })
  }, [])
  return { settings, update, load: set }
}
