// Background music, synthesised in the browser: a slow, soft tavern tune in D dorian, 6/8.
// A lute-like pluck plays the chords and melody over a quiet drone, all sent through a long reverb.
// Nothing is stored; the tune is generated as it plays, so every loop is slightly different.

const VOLUME = 0.1
const FADE_IN_S = 5
const TEMPO_BPM = 66 // dotted-quarter beats; two per 6/8 bar
const EIGHTH_S = 60 / TEMPO_BPM / 3
const BAR_EIGHTHS = 6
const LOOKAHEAD_S = 0.6
const TICK_MS = 150

// D dorian, as semitones above the tonic.
const SCALE = [0, 2, 3, 5, 7, 9, 10]
const TONIC_MIDI = 62 // D4

// Chords as scale-degree roots (triads built inside the scale): Dm C Dm Am | F C G Dm.
const PROGRESSION = [0, 6, 0, 4, 2, 6, 3, 0]

// Melody rhythms for one bar, in eighths.
const RHYTHMS = [
  [2, 1, 2, 1],
  [3, 3],
  [2, 1, 3],
  [1, 1, 1, 2, 1],
  [3, 2, 1],
  [2, 1, 1, 1, 1],
]

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
// Scale degree (may be negative or above 6) to MIDI note.
const degreeToMidi = (degree: number) => {
  const octave = Math.floor(degree / 7)
  return TONIC_MIDI + octave * 12 + SCALE[((degree % 7) + 7) % 7]
}
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]

function impulse(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  return buffer
}

export interface Music {
  /** Resumes playback; must be called from a user gesture. Returns whether audio is running. */
  unlock(): boolean
  setMuted(muted: boolean): void
  destroy(): void
}

export function startMusic(muted: boolean): Music {
  // iOS 17+: play through the ringer/silent switch like a media player instead of being muted by it.
  const session = (navigator as { audioSession?: { type: string } }).audioSession
  if (session) session.type = 'playback'
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // Dull the whole mix so nothing is bright or sharp.
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2200
  tone.connect(master)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 3.2)
  const wet = ctx.createGain()
  wet.gain.value = 0.45
  reverb.connect(wet).connect(tone)
  const dry = ctx.createGain()
  dry.gain.value = 0.7
  dry.connect(tone)
  const bus = ctx.createGain()
  bus.connect(dry)
  bus.connect(reverb)

  const fadeTo = (value: number, seconds: number) => {
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(value, now + seconds)
  }

  // Lute-like pluck: a soft, quickly closing filter over two slightly detuned oscillators.
  const pluck = (midi: number, at: number, length: number, level: number) => {
    const hz = midiToHz(midi)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(level, at + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, at + length)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.setValueAtTime(Math.min(3200, hz * 6), at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(220, hz * 1.2), at + length * 0.6)
    filter.connect(env).connect(bus)
    for (const [type, detune, gain] of [
      ['triangle', -4, 0.8],
      ['sawtooth', 5, 0.18],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = hz
      osc.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gain
      osc.connect(g).connect(filter)
      osc.start(at)
      osc.stop(at + length + 0.05)
    }
  }

  // Recorder-like voice for some melody phrases: soft attack, gentle vibrato.
  const flute = (midi: number, at: number, length: number, level: number) => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(level, at + 0.08)
    env.gain.setValueAtTime(level, at + Math.max(0.09, length - 0.12))
    env.gain.linearRampToValueAtTime(0, at + length)
    env.connect(bus)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = midiToHz(midi)
    const vibrato = ctx.createOscillator()
    vibrato.frequency.value = 5
    const depth = ctx.createGain()
    depth.gain.value = 6
    vibrato.connect(depth).connect(osc.detune)
    osc.connect(env)
    for (const o of [osc, vibrato]) {
      o.start(at)
      o.stop(at + length + 0.05)
    }
  }

  // Quiet open-fifth drone on D under everything, breathing slowly.
  const drone = ctx.createGain()
  drone.gain.value = 0.05
  const droneFilter = ctx.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.value = 380
  droneFilter.connect(drone).connect(bus)
  const breath = ctx.createOscillator()
  breath.frequency.value = 0.07
  const breathDepth = ctx.createGain()
  breathDepth.gain.value = 0.02
  breath.connect(breathDepth).connect(drone.gain)
  breath.start()
  const droneOscs = [TONIC_MIDI - 24, TONIC_MIDI - 17].map((midi) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(midi)
    osc.connect(droneFilter)
    osc.start()
    return osc
  })

  let bar = 0
  let barStart = ctx.currentTime + 0.2
  let melodyDegree = 4 // A4
  let fluteSection = false

  const scheduleBar = (at: number) => {
    const step = bar % PROGRESSION.length
    if (step === 0) fluteSection = Math.random() < 0.35
    const root = PROGRESSION[step]
    const chord = [root, root + 2, root + 4]

    // Bass on both beats, an arpeggio of the chord on the eighths between.
    pluck(degreeToMidi(root - 14), at, 2.4, 0.32)
    pluck(degreeToMidi(root - 14 + 4), at + 3 * EIGHTH_S, 1.8, 0.2)
    const arp = [chord[0], chord[1], chord[2], chord[1], chord[2], chord[1]].map((d) => d - 7)
    arp.forEach((d, i) => {
      if (i === 0 || i === 3) return
      pluck(degreeToMidi(d), at + i * EIGHTH_S, 1.4, 0.11)
    })

    // Melody: a gentle random walk over the scale that lands on a chord tone at each bar.
    // The last bar of the loop rests on the tonic; every fourth bar breathes on a long note.
    const voice = fluteSection ? flute : pluck
    const level = fluteSection ? 0.08 : 0.2
    if (step === PROGRESSION.length - 1) {
      voice(degreeToMidi(0), at, BAR_EIGHTHS * EIGHTH_S * (fluteSection ? 0.9 : 1.6), level)
      melodyDegree = 0
      return
    }
    const rhythm = step % 4 === 3 ? [3, 3] : pick(RHYTHMS)
    let t = 0
    rhythm.forEach((eighths, i) => {
      if (i === 0) {
        // Nearest chord tone to where the melody is.
        melodyDegree = chord
          .flatMap((d) => [d, d + 7])
          .reduce((best, d) => (Math.abs(d - melodyDegree) < Math.abs(best - melodyDegree) ? d : best))
      } else {
        melodyDegree += pick([-2, -1, -1, 1, 1, 2, 0])
      }
      melodyDegree = Math.min(9, Math.max(-1, melodyDegree))
      const length = eighths * EIGHTH_S
      if (Math.random() > 0.08 || i === 0) {
        voice(degreeToMidi(melodyDegree), at + t * EIGHTH_S, fluteSection ? length * 0.95 : length * 2, level)
      }
      t += eighths
    })
  }

  const tick = () => {
    while (barStart < ctx.currentTime + LOOKAHEAD_S) {
      // After the tab was throttled, skip ahead instead of playing a pile of late bars at once.
      if (barStart < ctx.currentTime) barStart = ctx.currentTime + 0.05
      scheduleBar(barStart)
      barStart += BAR_EIGHTHS * EIGHTH_S
      bar++
    }
  }
  const timer = setInterval(tick, TICK_MS)
  tick()

  // Hidden tabs stay silent.
  const onVisibility = () => void (document.hidden ? ctx.suspend() : ctx.resume())
  document.addEventListener('visibilitychange', onVisibility)

  if (!muted) fadeTo(VOLUME, FADE_IN_S)

  let unlocked = false
  return {
    unlock() {
      if (!unlocked) {
        // Older iOS only starts audio once something is played inside the gesture itself.
        const silent = ctx.createBufferSource()
        silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
        silent.connect(ctx.destination)
        silent.start()
        unlocked = true
      }
      if (ctx.state !== 'running') void ctx.resume()
      return ctx.state === 'running'
    },
    setMuted(value) {
      fadeTo(value ? 0 : VOLUME, value ? 0.4 : 1.5)
    },
    destroy() {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const osc of [...droneOscs, breath]) osc.stop()
      ctx.close()
    },
  }
}
