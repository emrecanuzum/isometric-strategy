import { useCallback, useEffect, useRef, useState } from 'react'
import { startMusic, TRACKS } from '../audio/music'
import { setAmbience, setBattleMusicLevel, setRain, setSfx, setVoice, unlockSfx } from '../audio/sfx'
import type { Music, TrackId } from '../audio/music'
import type { PowerMode } from '../lib/power'
import { supabase } from '../lib/supabase'

// The player's settings, kept in their profile so they follow the account to any device.

// How the weather is drawn: everything, a lighter rain (no cloud shadows or splashes, fewer drops), or not at all.
export type WeatherMode = 'full' | 'lite' | 'off'
// How often the map is drawn (CLAUDE.md §12): smooth, balanced or kind to the battery.
export type Pace = 'smooth' | 'balanced' | 'saver'
// What power saving turns down while it is on; each can be left alone.
export type Cut = 'pace' | 'detail' | 'birds' | 'clouds' | 'glow' | 'shadows' | 'weather' | 'sharp'

export interface Settings {
  // Sound (volumes 0..100), each kind with its own switch: the tavern music, the battle music while a battle is
  // watched, the cues (the envoy's news, the day's events), the buttons' clicks, the rain and thunder, the envoy's voice, the world's ambience (wind, water, birds, the village).
  // The general volume over all of them (and its switch): every kind's level is multiplied by it.
  master: boolean
  masterVolume: number
  music: boolean
  musicVolume: number
  // Which of the music's pieces take turns (at least one).
  tracks: Record<TrackId, boolean>
  battle: boolean
  battleVolume: number
  sfx: boolean
  sfxVolume: number
  clicks: boolean
  rain: boolean
  rainVolume: number
  voice: boolean
  voiceVolume: number
  ambience: boolean
  ambienceVolume: number
  // Picture: swaying trees and moving buildings, birds, clouds, the glow round lit windows at night, live shadows (of
  // buildings, walkers and armies), the weather, and the screen's full density when zoomed out.
  detail: boolean
  birds: boolean
  clouds: boolean
  glow: boolean
  shadows: boolean
  weather: WeatherMode
  sharp: boolean
  // Performance: how often the map is drawn; power saving ('auto' turns it on for phones, tablets and laptops on
  // battery) and what it turns down.
  pace: Pace
  power: PowerMode
  cuts: Record<Cut, boolean>
}

export const DEFAULT_CUTS: Record<Cut, boolean> = { pace: true, detail: true, birds: true, clouds: true, glow: true, shadows: false, weather: true, sharp: true }

export const DEFAULT_SETTINGS: Settings = {
  master: true,
  masterVolume: 100,
  music: true,
  musicVolume: 70,
  tracks: { hearth: true, crusade: true, england: true, horizon: true, jig: true },
  battle: true,
  battleVolume: 70,
  sfx: true,
  sfxVolume: 70,
  clicks: true,
  rain: true,
  rainVolume: 70,
  voice: true,
  voiceVolume: 70,
  ambience: true,
  ambienceVolume: 60,
  detail: true,
  birds: true,
  clouds: true,
  glow: true,
  shadows: true,
  weather: 'full',
  sharp: true,
  pace: 'balanced',
  power: 'auto',
  cuts: DEFAULT_CUTS,
}

// What the map draws, from the settings and whether power saving is on now.
export interface Video {
  detail: boolean
  birds: boolean
  clouds: boolean
  glow: boolean
  shadows: boolean
  weather: WeatherMode
  sharp: boolean
  pace: Pace
}

// On a phone's screen these are always off, whatever was chosen (CLAUDE.md §11 Ayarlar): they cost the most battery and
// memory for the least on a small screen. The weather is drawn plain there. The frame rate is not among them.
export const PHONE_OFF: readonly Cut[] = ['detail', 'birds', 'clouds', 'glow', 'sharp']

export function videoOf(s: Settings, saving: boolean, phone = false): Video {
  const cut = (k: Cut) => (phone && PHONE_OFF.includes(k)) || (saving && s.cuts[k])
  return {
    detail: s.detail && !cut('detail'),
    birds: s.birds && !cut('birds'),
    clouds: s.clouds && !cut('clouds'),
    glow: s.glow && !cut('glow'),
    shadows: s.shadows && !cut('shadows'),
    weather: (phone || cut('weather')) && s.weather === 'full' ? 'lite' : s.weather,
    sharp: s.sharp && !cut('sharp'),
    // On a phone the frame rate is the player's own choice: power saving does not turn it down there.
    pace: !phone && cut('pace') ? 'saver' : s.pace,
  }
}

// Settings saved before the sounds were split up: the envoy's voice and the rain followed the effects, the battle
// music followed the music.
function fromSaved(saved: Partial<Settings> | undefined): Settings {
  const s = { ...saved }
  s.voice ??= s.sfx
  s.voiceVolume ??= s.sfxVolume
  s.rain ??= s.sfx
  s.rainVolume ??= s.sfxVolume
  s.battle ??= s.music
  s.battleVolume ??= s.musicVolume
  return { ...DEFAULT_SETTINGS, ...s, cuts: { ...DEFAULT_CUTS, ...s.cuts }, tracks: { ...DEFAULT_SETTINGS.tracks, ...s.tracks } } as Settings
}

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
    settings: fromSaved(data?.settings as Partial<Settings> | undefined),
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

const chosen = (s: Settings) => TRACKS.map((t) => t.id).filter((id) => s.tracks[id])

// The music playing now, for the settings' list of pieces: which is on, and "play this one now".
let playing: Music | null = null
const playingListeners = new Set<() => void>()
const setPlaying = (m: Music | null) => {
  playing = m
  for (const listen of playingListeners) listen()
}
export const playTrack = (track: TrackId) => playing?.play(track)
export function useNowPlaying(): TrackId | null {
  const [now, setNow] = useState<TrackId | null>(() => playing?.current() ?? null)
  useEffect(() => {
    let off = () => {}
    const follow = () => {
      off()
      setNow(playing?.current() ?? null)
      off = playing ? (playing.onTrack(setNow) as () => void) : () => {}
    }
    playingListeners.add(follow)
    follow()
    return () => {
      off()
      playingListeners.delete(follow)
    }
  }, [])
  return now
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
      if (!music.current) {
        const c = current.current
        music.current = startMusic(!(c.master && c.music), (c.musicVolume / 100) * (c.masterVolume / 100) * quietRef.current, chosen(c))
        setPlaying(music.current)
      }
      const sfx = unlockSfx()
      if (music.current.unlock() && sfx) for (const type of events) window.removeEventListener(type, unlock)
    }
    for (const type of events) window.addEventListener(type, unlock)
    return () => {
      for (const type of events) window.removeEventListener(type, unlock)
      music.current?.destroy()
      if (playing === music.current) setPlaying(null)
      music.current = null
    }
  }, [])
  // Each kind as heard: its own switch and level under the general ones.
  const on = (kind: boolean) => settings.master && kind
  const level = (volume: number) => (volume / 100) * (settings.masterVolume / 100)
  useEffect(() => {
    music.current?.setMuted(!on(settings.music))
    music.current?.setVolume(level(settings.musicVolume) * quiet * ducked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.master, settings.masterVolume, settings.music, settings.musicVolume, quiet, ducked])
  const tracksKey = chosen(settings).join()
  useEffect(() => music.current?.setTracks(chosen(current.current)), [tracksKey])
  const m = [settings.master, settings.masterVolume]
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => setBattleMusicLevel(on(settings.battle), level(settings.battleVolume)), [...m, settings.battle, settings.battleVolume])
  useEffect(() => setSfx(on(settings.sfx), level(settings.sfxVolume), settings.clicks), [...m, settings.sfx, settings.sfxVolume, settings.clicks])
  useEffect(() => setVoice(on(settings.voice), level(settings.voiceVolume)), [...m, settings.voice, settings.voiceVolume])
  useEffect(() => setRain(on(settings.rain), level(settings.rainVolume)), [...m, settings.rain, settings.rainVolume])
  useEffect(() => setAmbience(on(settings.ambience), level(settings.ambienceVolume)), [...m, settings.ambience, settings.ambienceVolume])
  /* eslint-enable react-hooks/exhaustive-deps */
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
