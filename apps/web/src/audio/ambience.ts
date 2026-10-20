// The world's ambience (ortam sesleri): what the land sounds like where the camera looks, synthesised like every other
// sound. A few looping beds of the shared noise (wind, water, leaves, a village's murmur) crossfade with the view, and
// sparse one-shots (birds by day, crickets and owls by night, a smith's hammer, an axe, a dog, a rooster, the hour's
// bell, a duck) fall now and then. Quiet and sparse on purpose: atmosphere, not noise.
//
// Cheap (CLAUDE.md §12): the view is sampled a few times a second, not every frame, on a 10×10 grid of tiles and a
// coarse grid of buildings; one-shots make short-lived nodes only. The effects' context is held awake only while the
// beds play: with ambience off or turned down, the tab hidden or the map gone (no update for a moment), every bed fades
// and stops and the context sleeps again (sfx.ts → rest).

import { Terrain, TILE_WIDTH, calendarAt, gameTime, screenToGround } from '@game/shared'
import type { Weather, World } from '@game/shared'
import type { Structure } from '../game/buildingSprites'
import { dayPhase } from '../game/daylight'
import { ambienceAudio, holdAwake } from './sfx'

// How often the view is sampled and the one-shots drawn, in ms.
const SAMPLE_MS = 330
// With no update for this long (the map stopped drawing, or went away) the beds fade out.
const STALE_MS = 1500
// Buildings are counted on a grid of cells this many tiles wide.
const CELL = 16
const GRID = 10

type BedKind = 'wind' | 'water' | 'forest' | 'village'
interface Bed {
  src: AudioBufferSourceNode
  filter: BiquadFilterNode
  shape: BiquadFilterNode
  gain: GainNode
  // When the bed went quiet (0 while it sounds): it is stopped a little after.
  quietAt: number
}

// Building kinds that make a sound of their own, as bits on the grid of cells.
const SMITH = 1
const AXE = 2
const BELL = 4
const FARM = 8
const QUIET_LOOKS = new Set(['wall', 'gate', 'gateY', 'towerWall', 'brokenWall', 'road', 'scaffold', 'jetty'])

// What the sampler found around the camera; one object, reused.
interface Mix {
  wind: number
  water: number
  forest: number
  village: number
  // 0 far out … 1 at 1× and closer.
  near: number
  open: number
  wild: number
  winter: boolean
  wet: boolean
  phase: ReturnType<typeof dayPhase>
  sounds: number
}

export interface Soundscape {
  update(time: number, camera: { x: number; y: number; scale: number }, width: number, height: number, weather: Weather): void
  setStructures(structures: readonly Structure[]): void
  destroy(): void
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

export function createSoundscape(world: World): Soundscape {
  const cells = Math.ceil(world.size / CELL)
  const count = new Uint16Array(cells * cells)
  const kinds = new Uint8Array(cells * cells)
  const beds: Partial<Record<BedKind, Bed>> = {}
  const mix: Mix = { wind: 0, water: 0, forest: 0, village: 0, near: 0, open: 0, wild: 0, winter: false, wet: false, phase: 'noon', sounds: 0 }
  let lastUpdate = 0
  let lastSample = 0
  let lastHour = -1
  let gust = 0.6
  let active = false
  let timer = 0

  // The view around the camera's centre: terrain shares from a grid of tiles, buildings from the cells in reach.
  const sample = (time: number, cam: { x: number; y: number; scale: number }, width: number, height: number, weather: Weather) => {
    const s = cam.scale
    const centre = screenToGround(world, { x: (width / 2 - cam.x) / s, y: (height / 2 - cam.y) / s })
    const cx = Math.floor(centre.x)
    const cy = Math.floor(centre.y)
    const r = Math.max(6, Math.min(90, (width / s / TILE_WIDTH) * 0.6))
    let water = 0
    let forest = 0
    let mountain = 0
    let open = 0
    let land = 0
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const x = Math.floor(cx + ((i + 0.5) / GRID - 0.5) * 2 * r)
        const y = Math.floor(cy + ((j + 0.5) / GRID - 0.5) * 2 * r)
        if (x < 0 || y < 0 || x >= world.size || y >= world.size) continue
        const t = world.terrain[y * world.size + x]
        if (t === Terrain.Lake || t === Terrain.River) water++
        else {
          land++
          if (t === Terrain.Forest) forest++
          else if (t === Terrain.Mountain) mountain++
          else if (t === Terrain.Grass || t === Terrain.Swamp) open++
        }
      }
    }
    const n = GRID * GRID
    let buildings = 0
    let sounds = 0
    const c0x = Math.max(0, Math.floor((cx - r) / CELL))
    const c1x = Math.min(cells - 1, Math.floor((cx + r) / CELL))
    const c0y = Math.max(0, Math.floor((cy - r) / CELL))
    const c1y = Math.min(cells - 1, Math.floor((cy + r) / CELL))
    for (let y = c0y; y <= c1y; y++) {
      for (let x = c0x; x <= c1x; x++) {
        buildings += count[y * cells + x]
        sounds |= kinds[y * cells + x]
      }
    }
    // ⅛× → 0, 1× → 1; the village is heard only from ½× in.
    const near = clamp((Math.log2(s) + 3) / 3)
    const village = s >= 0.5 ? clamp(buildings / 14) * (s >= 1 ? 1 : 0.55) : 0
    const winter = calendarAt(time, 0).season === 'winter'
    mix.near = near
    mix.wind = (0.35 + 0.35 * (1 - near) + 0.5 * (mountain / n)) * (winter ? 1.15 : 1)
    mix.water = clamp((water / n) * 2.5) * (0.35 + 0.65 * near)
    mix.forest = clamp((forest / n - 0.15) / 0.5) * (0.35 + 0.65 * near) * (winter ? 0.5 : 1)
    mix.village = village
    mix.open = land ? open / land : 0
    mix.wild = land ? (forest + open) / land : 0
    mix.winter = winter
    // Birds and crickets hush under rain, sleet or falling snow (the rain has its own sound).
    mix.wet = weather.rain > 0.15 || (weather.snow && weather.grey > 0.3)
    mix.phase = dayPhase(gameTime(time, 0).hour)
    mix.sounds = village > 0 ? sounds : 0
  }

  const startBed = (kind: BedKind) => {
    const a = ambienceAudio()
    if (!a) return undefined
    const { c } = a
    const src = a.noise()
    src.loop = true
    const filter = c.createBiquadFilter()
    const shape = c.createBiquadFilter()
    // Each bed is the same noise through its own colour.
    if (kind === 'wind') {
      filter.type = 'lowpass'
      filter.frequency.value = 380
      filter.Q.value = 0.8
      shape.type = 'highpass'
      shape.frequency.value = 60
    } else if (kind === 'water') {
      filter.type = 'bandpass'
      filter.frequency.value = 700
      filter.Q.value = 0.7
      shape.type = 'lowpass'
      shape.frequency.value = 2400
    } else if (kind === 'forest') {
      filter.type = 'highpass'
      filter.frequency.value = 2600
      shape.type = 'lowpass'
      shape.frequency.value = 7000
    } else {
      filter.type = 'bandpass'
      filter.frequency.value = 420
      filter.Q.value = 1.3
      shape.type = 'lowpass'
      shape.frequency.value = 1100
    }
    const gain = c.createGain()
    gain.gain.value = 0.0001
    src.connect(filter).connect(shape).connect(gain).connect(a.out)
    src.start(c.currentTime, Math.random() * 1.5)
    return (beds[kind] = { src, filter, shape, gain, quietAt: 0 })
  }

  const stopBed = (kind: BedKind) => {
    const bed = beds[kind]
    if (!bed) return
    bed.src.stop()
    // The whole chain comes off the output, or every bed started as the view moves would stay wired to it.
    for (const node of [bed.src, bed.filter, bed.shape, bed.gain]) node.disconnect()
    delete beds[kind]
  }

  // Each bed eased toward its level; a bed quiet for a few seconds is stopped (made again when it is wanted).
  const setBed = (kind: BedKind, level: number, now: number, at: number, filterHz?: number) => {
    let bed = beds[kind]
    if (level <= 0.005) {
      if (!bed) return
      if (!bed.quietAt) {
        bed.quietAt = now
        bed.gain.gain.setTargetAtTime(0.0001, at, 0.6)
      } else if (now - bed.quietAt > 3000) stopBed(kind)
      return
    }
    bed ??= startBed(kind)
    if (!bed) return
    bed.quietAt = 0
    bed.gain.gain.setTargetAtTime(level, at, kind === 'wind' ? 1.4 : 0.9)
    if (filterHz) bed.filter.frequency.setTargetAtTime(filterHz, at, 1.2)
  }

  const silence = () => {
    active = false
    // An hour turned while silent rings no bell on coming back.
    lastHour = -1
    // Faded on the beds' own context, without waking it (ambience may just have been turned off).
    for (const bed of Object.values(beds)) bed.gain.gain.setTargetAtTime(0.0001, bed.gain.context.currentTime, 0.3)
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      for (const kind of Object.keys(beds) as BedKind[]) stopBed(kind)
      holdAwake(false)
    }, 1200)
  }

  // ---- One-shots ---------------------------------------------------------------------------------------------------

  // Every one-shot goes through a panner somewhere left or right, and a lowpass for distance.
  const shot = (c: AudioContext, out: GainNode, far: number, lasts = 2.5) => {
    const pan = c.createStereoPanner()
    pan.pan.value = (Math.random() * 2 - 1) * 0.7
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 9000 - far * 6500
    lp.connect(pan).connect(out)
    // Off the output once the sound (`lasts` seconds at most) is over: nodes left wired to it are never freed.
    window.setTimeout(() => {
      lp.disconnect()
      pan.disconnect()
    }, (lasts + 0.5) * 1000)
    return lp
  }
  const blip = (c: AudioContext, to: AudioNode, hz: number, at: number, length: number, gain: number, slide = 1, type: OscillatorType = 'sine') => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(hz, at)
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(hz * slide, at + length)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, length * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(g).connect(to)
    osc.onended = () => g.disconnect()
    osc.start(at)
    osc.stop(at + length + 0.03)
  }
  const hiss = (a: NonNullable<ReturnType<typeof ambienceAudio>>, to: AudioNode, at: number, length: number, type: BiquadFilterType, hz: number, gain: number, q = 1) => {
    const src = a.noise()
    const f = a.c.createBiquadFilter()
    f.type = type
    f.frequency.value = hz
    f.Q.value = q
    const g = a.c.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.006, length * 0.3))
    g.gain.exponentialRampToValueAtTime(0.0001, at + length)
    src.connect(f).connect(g).connect(to)
    src.onended = () => {
      f.disconnect()
      g.disconnect()
    }
    src.start(at, Math.random() * 1.5)
    src.stop(at + length + 0.03)
  }

  type Shot = 'bird' | 'cuckoo' | 'crow' | 'crickets' | 'owl' | 'wolf' | 'smith' | 'axe' | 'dog' | 'rooster' | 'duck' | 'splash'
  const playShot = (kind: Shot) => {
    const a = ambienceAudio()
    if (!a) return
    const { c } = a
    const t = c.currentTime + 0.03 + Math.random() * 0.25
    switch (kind) {
      case 'bird': {
        // A chirp or a little trill, pitched anew each time.
        const to = shot(c, a.out, 0.2)
        const base = 2600 + Math.random() * 2200
        const notes = 1 + Math.floor(Math.random() * 5)
        for (let i = 0; i < notes; i++) {
          const hz = base * (1 + (Math.random() - 0.5) * 0.25)
          blip(c, to, hz, t + i * (0.07 + Math.random() * 0.05), 0.05 + Math.random() * 0.05, 0.06, Math.random() < 0.5 ? 1.25 : 0.8)
        }
        break
      }
      case 'cuckoo': {
        const to = shot(c, a.out, 0.6)
        blip(c, to, 740, t, 0.22, 0.04, 0.97)
        blip(c, to, 588, t + 0.3, 0.32, 0.04, 0.97)
        break
      }
      case 'crow': {
        const to = shot(c, a.out, 0.5)
        for (let i = 0; i < 2; i++) blip(c, to, 520 - i * 30, t + i * 0.32, 0.2, 0.025, 0.8, 'sawtooth')
        break
      }
      case 'crickets': {
        // One burst of three or four pulses on a high, thin tone.
        const to = shot(c, a.out, 0.4)
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.frequency.value = 4300 + Math.random() * 600
        const pulses = 3 + Math.floor(Math.random() * 2)
        // Short ramps on each pulse's edges: hard steps would click at the tone's pitch.
        g.gain.setValueAtTime(0, t)
        for (let i = 0; i < pulses; i++) {
          const p = t + i * 0.045
          g.gain.linearRampToValueAtTime(0, p)
          g.gain.linearRampToValueAtTime(0.02, p + 0.005)
          g.gain.setValueAtTime(0.02, p + 0.017)
          g.gain.linearRampToValueAtTime(0, p + 0.022)
        }
        osc.connect(g).connect(to)
        osc.onended = () => g.disconnect()
        osc.start(t)
        osc.stop(t + pulses * 0.045 + 0.05)
        break
      }
      case 'owl': {
        const to = shot(c, a.out, 0.6)
        blip(c, to, 380, t, 0.28, 0.04, 0.92)
        blip(c, to, 360, t + 0.45, 0.5, 0.035, 0.9)
        break
      }
      case 'wolf': {
        // Far off: a rising, then falling howl.
        const to = shot(c, a.out, 0.85)
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(330, t)
        osc.frequency.exponentialRampToValueAtTime(520, t + 0.6)
        osc.frequency.exponentialRampToValueAtTime(380, t + 1.8)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.03, t + 0.4)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9)
        osc.connect(g).connect(to)
        osc.onended = () => g.disconnect()
        osc.start(t)
        osc.stop(t + 2)
        break
      }
      case 'smith': {
        // Two or three strikes on an anvil, a street away: a bright ring over a click.
        const to = shot(c, a.out, 0.55)
        const strikes = 2 + Math.floor(Math.random() * 2)
        for (let i = 0; i < strikes; i++) {
          const at = t + i * 0.42
          blip(c, to, 1760, at, 0.35, 0.05)
          blip(c, to, 2650, at, 0.2, 0.025)
          hiss(a, to, at, 0.03, 'highpass', 2500, 0.04)
        }
        break
      }
      case 'axe': {
        const to = shot(c, a.out, 0.5)
        for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
          const at = t + i * 0.7
          hiss(a, to, at, 0.09, 'bandpass', 900, 0.08, 1.5)
          blip(c, to, 190, at, 0.1, 0.05, 0.6)
        }
        break
      }
      case 'dog': {
        const to = shot(c, a.out, 0.6)
        for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) blip(c, to, 560 + Math.random() * 120, t + i * 0.22, 0.09, 0.03, 0.6, 'sawtooth')
        break
      }
      case 'rooster': {
        const to = shot(c, a.out, 0.6)
        blip(c, to, 620, t, 0.14, 0.025, 1.3, 'sawtooth')
        blip(c, to, 820, t + 0.16, 0.18, 0.025, 1.05, 'sawtooth')
        blip(c, to, 860, t + 0.36, 0.42, 0.022, 0.7, 'sawtooth')
        break
      }
      case 'duck': {
        const to = shot(c, a.out, 0.4)
        for (let i = 0; i < 2; i++) blip(c, to, 340, t + i * 0.18, 0.11, 0.025, 0.75, 'sawtooth')
        break
      }
      case 'splash': {
        const to = shot(c, a.out, 0.3)
        hiss(a, to, t, 0.25, 'bandpass', 1500, 0.04, 0.8)
        break
      }
    }
  }

  // The hour's bell, from a temple or the cathedral in view: three slow strokes of a far, inharmonic bell.
  const bell = () => {
    const a = ambienceAudio()
    if (!a) return
    const { c } = a
    const to = shot(c, a.out, 0.7, 5.2)
    for (let i = 0; i < 3; i++) {
      const at = c.currentTime + 0.05 + i * 1.6
      for (const [ratio, g] of [[1, 0.04], [2.0, 0.018], [2.4, 0.012], [3.0, 0.008]] as const) blip(c, to, 330 * ratio, at, 1.8, g)
    }
  }

  // How many of each one-shot a second, by the view.
  const roll = (rate: number, dt: number) => Math.random() < rate * dt
  const shots = (dt: number) => {
    const m = mix
    const night = m.phase === 'night'
    const day = !night && m.phase !== 'dusk'
    if (!m.wet) {
      if (day) {
        const birds = (0.15 + 0.6 * m.wild) * (m.winter ? 0.2 : 1) * (0.4 + 0.6 * m.near)
        if (roll(0.5 * birds, dt)) playShot('bird')
        if (!m.winter && roll(0.012 * m.forest, dt)) playShot('cuckoo')
        if (roll(0.012 * (0.3 + m.open), dt)) playShot('crow')
      }
      if ((night || m.phase === 'dusk') && !m.winter && roll(0.22 * m.wild * (0.3 + 0.7 * m.near), dt)) playShot('crickets')
    }
    if (night) {
      if (roll(0.02 * (m.forest + 0.2), dt)) playShot('owl')
      if (roll(0.004 * (m.forest + m.wind * 0.5), dt)) playShot('wolf')
    }
    if (m.village > 0) {
      if (m.sounds & SMITH && !night && roll(0.12, dt)) playShot('smith')
      if (m.sounds & AXE && !night && roll(0.1, dt)) playShot('axe')
      if (roll(0.02 * m.village, dt)) playShot('dog')
      if (m.phase === 'dawn' && roll(m.sounds & FARM ? 0.05 : 0.015, dt)) playShot('rooster')
    }
    if (m.water > 0.1 && day && !m.wet && roll(0.03 * m.water, dt)) playShot('duck')
    if (m.water > 0.1 && roll(0.04 * m.water, dt)) playShot('splash')
  }

  return {
    update(time, cam, width, height, weather) {
      const now = performance.now()
      lastUpdate = now
      if (now - lastSample < SAMPLE_MS) return
      const dt = Math.min(1, (now - lastSample) / 1000)
      lastSample = now
      if (document.hidden) {
        if (active) silence()
        return
      }
      const a = ambienceAudio()
      if (!a) {
        if (active) silence()
        return
      }
      if (!active) {
        active = true
        clearTimeout(timer)
        holdAwake(true)
      }
      // If the map stops calling (it stops drawing when the tab hides, and goes away with the lobby), fade out.
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (performance.now() - lastUpdate >= STALE_MS) silence()
      }, STALE_MS)
      sample(time, cam, width, height, weather)
      const at = a.c.currentTime
      // Gusts: the wind's target wanders each sample, eased slowly by setBed. The gains are worked out for the beds'
      // filtered noise (a narrow band of white noise is far quieter than the noise): the wind about −53 dB, more out
      // far and in the mountains; the water up to about −41 dB; the leaves and the village's murmur in the −48s.
      gust = Math.min(1.2, Math.max(0.35, gust + (Math.random() - 0.5) * 0.3))
      setBed('wind', 0.5 * mix.wind * gust, now, at, (mix.winter ? 900 : 380) * (0.8 + gust * 0.35))
      setBed('water', 0.4 * mix.water, now, at, 600 + Math.random() * 300)
      setBed('forest', 0.09 * mix.forest * (0.5 + gust * 0.6), now, at)
      // A crowd's murmur rises and falls from moment to moment.
      setBed('village', 0.3 * mix.village * (0.6 + Math.random() * 0.6), now, at)
      if (beds.wind && mix.winter !== (beds.wind.filter.type === 'bandpass')) beds.wind.filter.type = mix.winter ? 'bandpass' : 'lowpass'
      shots(dt)
      // The bell at the top of every game hour, if a temple or a cathedral is in view.
      const hour = Math.floor(gameTime(time, 0).hour)
      if (lastHour >= 0 && hour !== lastHour && mix.sounds & BELL) bell()
      lastHour = hour
    },
    setStructures(structures) {
      count.fill(0)
      kinds.fill(0)
      for (const s of structures) {
        if (QUIET_LOOKS.has(s.look)) continue
        const i = Math.floor(s.y / CELL) * cells + Math.floor(s.x / CELL)
        if (i < 0 || i >= count.length) continue
        count[i]++
        const look = s.look as string
        if (look === 'forge') kinds[i] |= SMITH
        else if (look === 'lumberCamp') kinds[i] |= AXE
        else if (look === 'temple' || look === 'cathedral') kinds[i] |= BELL
        else if (look === 'farm') kinds[i] |= FARM
      }
    },
    destroy() {
      if (active) silence()
      else clearTimeout(timer)
    },
  }
}
