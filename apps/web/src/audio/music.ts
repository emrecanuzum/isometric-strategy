// Background music, synthesised in the browser (CLAUDE.md §11 Ayarlar): five pieces that take turns, each a few
// minutes long, with a breath of silence between them. Nothing is stored; every piece is generated as it plays from
// its key, its chords and its instruments, so every loop is slightly different.
//
// - Han: the slow, soft tavern tune in D dorian, 6/8, a lute over a quiet drone (the first piece, always).
// - Kudüs yolu: crusader roads in D hijaz, an oud and a ney over a strong drone, a frame drum in 3+3+2.
// - Kralın yolu: medieval England in G mixolydian, 3/4, recorder and lute, a soft tabor.
// - Ufuk: a slow campaign mood in A aeolian, string pads, a distant horn, a harp and a far timpani.
// - Sarhoş Ejder: a fantasy tavern jig in E dorian, a fiddle, a strummed lute and a bodhrán.
//
// Cost (CLAUDE.md §12): one shared reverb (mono impulse), one shared noise buffer for the drums, a handful of short-lived
// oscillators per bar scheduled 0.6 s ahead from a 150 ms timer; hidden tabs and muted music suspend the audio.

const VOLUME = 0.1
const FADE_IN_S = 5
const LOOKAHEAD_S = 0.6
const TICK_MS = 150
const GAP_S = 3 // silence between two pieces

type Voice = 'lute' | 'oud' | 'flute' | 'ney' | 'fiddle' | 'horn' | 'harp'
type Hit = 'low' | 'high' | 'timpani' | null

interface Piece {
  name: string
  tonic: number // MIDI note of the scale's degree 0 (the melody's middle)
  scale: number[] // semitones above the tonic
  stepS: number // one step of the bar, in seconds
  bar: number // steps per bar
  progression: number[] // chord roots as scale degrees, one per bar
  rhythms: number[][] // melody rhythms for one bar, in steps
  /** The melody's voices for a section (one pass of the progression), with weights and levels. */
  voices: [Voice, number, number][]
  /** The accompaniment of one bar. */
  accompany: (chord: number[], at: number, step: number) => void
  drone: number[] // scale degrees (well below the tonic) held under the piece
  droneLevel: number
  drums?: Hit[] // one per step; repeated every bar
  drumLevel?: number
  range: [number, number] // the melody's lowest and highest degree
  moves: number[] // the melody's steps between notes
  seconds: number // how long the piece plays before it ends at the end of a pass
  loud?: number // the piece's gain (1 when left out)
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)]
const weighted = <T>(items: [T, number, number][]) => {
  let r = Math.random() * items.reduce((sum, i) => sum + i[1], 0)
  for (const item of items) if ((r -= item[1]) <= 0) return item
  return items[0]
}

// The reverb's impulse: one channel (a stereo impulse makes the convolver do four convolutions instead of two, and
// it runs for as long as the music plays; CLAUDE.md §12).
function impulse(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  return buffer
}

export interface Music {
  /** Resumes playback; must be called from a user gesture. Returns whether audio is running. */
  unlock(): boolean
  setMuted(muted: boolean): void
  /** Loudness from 0 to 1 of the full level. */
  setVolume(volume: number): void
  destroy(): void
}

export function startMusic(muted: boolean, volume = 1): Music {
  let level = VOLUME * Math.min(1, Math.max(0, volume))
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
  tone.frequency.value = 2400
  tone.connect(master)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 2.6)
  const wet = ctx.createGain()
  wet.gain.value = 0.45
  reverb.connect(wet).connect(tone)
  const dry = ctx.createGain()
  dry.gain.value = 0.7
  dry.connect(tone)
  const bus = ctx.createGain()
  bus.connect(dry)
  bus.connect(reverb)

  // The playing piece's own loudness, so the five sit level with each other; the notes go through it.
  let out = ctx.createGain()
  out.connect(bus)

  // One short noise buffer for every drum hit.
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate)
  const noiseData = noise.getChannelData(0)
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1

  const fadeTo = (value: number, seconds: number) => {
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(value, now + seconds)
  }

  const osc = (type: OscillatorType, hz: number, at: number, until: number, out: AudioNode, detune = 0) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = hz
    o.detune.value = detune
    o.connect(out)
    o.start(at)
    o.stop(until)
    return o
  }

  // Lute-like pluck: a soft, quickly closing filter over two slightly detuned oscillators. Brighter for the oud.
  const pluck = (midi: number, at: number, length: number, gain: number, bright = 6) => {
    const hz = midiToHz(midi)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, at + length)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.7
    filter.frequency.setValueAtTime(Math.min(3600, hz * bright), at)
    filter.frequency.exponentialRampToValueAtTime(Math.max(220, hz * 1.2), at + length * 0.6)
    filter.connect(env).connect(out)
    const tri = ctx.createGain()
    tri.gain.value = 0.8
    tri.connect(filter)
    const saw = ctx.createGain()
    saw.gain.value = bright > 6 ? 0.3 : 0.18
    saw.connect(filter)
    osc('triangle', hz, at, at + length + 0.05, tri, -4)
    osc('sawtooth', hz, at, at + length + 0.05, saw, 5)
  }

  // Recorder (and ney, which slides up into its note): soft attack, gentle vibrato.
  const flute = (midi: number, at: number, length: number, gain: number, slide = 0) => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + (slide ? 0.14 : 0.08))
    env.gain.setValueAtTime(gain, at + Math.max(0.15, length - 0.12))
    env.gain.linearRampToValueAtTime(0, at + length)
    env.connect(out)
    const o = osc('sine', midiToHz(midi), at, at + length + 0.05, env)
    if (slide) {
      o.detune.setValueAtTime(-slide, at)
      o.detune.linearRampToValueAtTime(0, at + 0.12)
    }
    const depth = ctx.createGain()
    depth.gain.value = slide ? 9 : 6
    depth.connect(o.detune)
    osc('sine', slide ? 4.5 : 5, at, at + length + 0.05, depth)
  }

  // Fiddle: a filtered saw whose vibrato swells in after the bow has caught the string.
  const fiddle = (midi: number, at: number, length: number, gain: number) => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + 0.04)
    env.gain.setValueAtTime(gain * 0.85, at + Math.max(0.06, length - 0.05))
    env.gain.linearRampToValueAtTime(0, at + length)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1900
    filter.Q.value = 1.4
    filter.connect(env).connect(out)
    const o = osc('sawtooth', midiToHz(midi), at, at + length + 0.05, filter)
    if (length > 0.25) {
      const depth = ctx.createGain()
      depth.gain.setValueAtTime(0, at)
      depth.gain.linearRampToValueAtTime(12, at + Math.min(0.4, length))
      depth.connect(o.detune)
      osc('sine', 5.5, at, at + length + 0.05, depth)
    }
  }

  // A distant horn: slow to speak, its brass opening and closing.
  const horn = (midi: number, at: number, length: number, gain: number) => {
    const hz = midiToHz(midi)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + 0.25)
    env.gain.setValueAtTime(gain, at + Math.max(0.3, length - 0.4))
    env.gain.linearRampToValueAtTime(0, at + length)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(hz * 1.5, at)
    filter.frequency.linearRampToValueAtTime(hz * 3.2, at + 0.3)
    filter.frequency.linearRampToValueAtTime(hz * 2.2, at + length)
    filter.connect(env).connect(out)
    osc('sawtooth', hz, at, at + length + 0.05, filter)
    osc('triangle', hz / 2, at, at + length + 0.05, filter)
  }

  // String pad: a chord of detuned saws behind a dark filter, rising and falling slowly.
  const pad = (midis: number[], at: number, length: number, gain: number) => {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, at)
    env.gain.linearRampToValueAtTime(gain, at + Math.min(1.2, length / 3))
    env.gain.setValueAtTime(gain, at + length * 0.75)
    env.gain.linearRampToValueAtTime(0, at + length + 0.8)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 850
    filter.connect(env).connect(out)
    for (const midi of midis) {
      osc('sawtooth', midiToHz(midi), at, at + length + 0.9, filter, -7)
      osc('sawtooth', midiToHz(midi), at, at + length + 0.9, filter, 7)
    }
  }

  // Drums from the one noise buffer and a falling sine: frame drum, tabor, bodhrán, a far timpani.
  const drum = (hit: Hit, at: number, gain: number) => {
    if (!hit) return
    const env = ctx.createGain()
    env.connect(out)
    if (hit === 'high') {
      env.gain.setValueAtTime(gain * 0.6, at)
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1500
      filter.Q.value = 1.1
      filter.connect(env)
      const src = ctx.createBufferSource()
      src.buffer = noise
      src.connect(filter)
      src.start(at, Math.random() * 0.25, 0.12)
      return
    }
    const timpani = hit === 'timpani'
    const length = timpani ? 1.6 : 0.32
    env.gain.setValueAtTime(gain, at)
    env.gain.exponentialRampToValueAtTime(0.0001, at + length)
    const o = osc('sine', timpani ? 92 : 120, at, at + length + 0.05, env)
    o.frequency.exponentialRampToValueAtTime(timpani ? 70 : 52, at + (timpani ? 0.4 : 0.14))
  }

  const play = (voice: Voice, midi: number, at: number, length: number, gain: number) => {
    if (voice === 'lute') pluck(midi, at, length * 2, gain)
    else if (voice === 'oud') pluck(midi, at, length * 1.6, gain, 9)
    else if (voice === 'harp') pluck(midi, at, length * 3, gain, 4)
    else if (voice === 'flute') flute(midi, at, length * 0.95, gain)
    else if (voice === 'ney') flute(midi, at, length * 0.95, gain, 40)
    else if (voice === 'fiddle') fiddle(midi, at, length * 0.92, gain)
    else horn(midi, at, length * 0.98, gain)
  }

  // A strummed chord: the strings a moment apart.
  const strum = (midis: number[], at: number, length: number, gain: number) =>
    midis.forEach((midi, i) => pluck(midi, at + i * 0.022, length, gain))

  const pieces: Piece[] = []
  // A piece's scale degree (may be negative or above 6) to a MIDI note.
  const note = (piece: Piece, degree: number) =>
    piece.tonic + Math.floor(degree / 7) * 12 + piece.scale[((degree % 7) + 7) % 7]

  // Han: the tavern tune the game began with.
  const tavern: Piece = {
    name: 'Han',
    tonic: 62,
    scale: [0, 2, 3, 5, 7, 9, 10],
    stepS: 60 / 66 / 3,
    bar: 6,
    progression: [0, 6, 0, 4, 2, 6, 3, 0],
    rhythms: [[2, 1, 2, 1], [3, 3], [2, 1, 3], [1, 1, 1, 2, 1], [3, 2, 1], [2, 1, 1, 1, 1]],
    voices: [['lute', 65, 0.2], ['flute', 35, 0.08]],
    accompany(chord, at) {
      const n = (d: number) => note(tavern, d)
      const e = tavern.stepS
      pluck(n(chord[0] - 14), at, 2.4, 0.32)
      pluck(n(chord[0] - 14 + 4), at + 3 * e, 1.8, 0.2)
      const arp = [chord[0], chord[1], chord[2], chord[1], chord[2], chord[1]].map((d) => d - 7)
      arp.forEach((d, i) => i % 3 && pluck(n(d), at + i * e, 1.4, 0.11))
    },
    drone: [-14, -10],
    droneLevel: 0.05,
    range: [-1, 9],
    moves: [-2, -1, -1, 1, 1, 2, 0],
    seconds: 200,
  }

  // Kudüs yolu: the crusaders' road through the east; the hijaz's augmented second on an oud, a ney above.
  const crusade: Piece = {
    name: 'Kudüs yolu',
    tonic: 62,
    scale: [0, 1, 4, 5, 7, 8, 10],
    stepS: 60 / 76 / 2,
    bar: 8,
    progression: [0, 0, 6, 0, 5, 6, 1, 0],
    rhythms: [[3, 3, 2], [2, 2, 4], [1, 1, 2, 4], [4, 4], [3, 1, 2, 2], [6, 2]],
    voices: [['ney', 55, 0.085], ['oud', 45, 0.19]],
    accompany(chord, at) {
      const n = (d: number) => note(crusade, d)
      const e = crusade.stepS
      pluck(n(chord[0] - 14), at, 1.8, 0.3, 9)
      pluck(n(chord[0] - 14), at + 3 * e, 1.2, 0.2, 9)
      pluck(n(chord[0] - 7), at + 6 * e, 1, 0.14, 9)
    },
    drone: [-14, -10],
    droneLevel: 0.075,
    drums: ['low', null, 'high', 'low', null, 'high', 'high', null],
    drumLevel: 0.22,
    range: [-1, 8],
    moves: [-1, -1, 1, 1, -2, 2, 0],
    seconds: 180,
  }

  // Kralın yolu: an English court and country dance, a recorder over lute and tabor.
  const england: Piece = {
    name: 'Kralın yolu',
    tonic: 67,
    scale: [0, 2, 4, 5, 7, 9, 10],
    stepS: 60 / 96 / 2,
    bar: 6,
    progression: [0, 6, 0, 4, 3, 0, 6, 0],
    rhythms: [[2, 2, 2], [4, 2], [2, 1, 1, 2], [1, 1, 2, 2], [3, 1, 2], [6]],
    voices: [['flute', 60, 0.085], ['lute', 25, 0.19], ['fiddle', 15, 0.05]],
    accompany(chord, at) {
      const n = (d: number) => note(england, d)
      const e = england.stepS
      pluck(n(chord[0] - 14), at, 1.6, 0.28)
      strum(chord.map((d) => n(d - 7)), at + 2 * e, 1, 0.07)
      strum(chord.map((d) => n(d - 7)), at + 4 * e, 1, 0.06)
    },
    drone: [-14],
    droneLevel: 0.03,
    drums: ['low', null, 'high', null, 'high', null],
    drumLevel: 0.16,
    range: [-3, 7],
    moves: [-1, -1, 1, 1, -2, 2, 0],
    seconds: 180,
    loud: 1.45,
  }

  // Ufuk: the long view over the realm, slow strings and a far horn.
  const horizon: Piece = {
    name: 'Ufuk',
    tonic: 57,
    scale: [0, 2, 3, 5, 7, 8, 10],
    stepS: 60 / 54,
    bar: 4,
    progression: [0, 5, 2, 6, 0, 3, 4, 0],
    rhythms: [[4], [2, 2], [3, 1], [2, 1, 1], [1, 1, 2]],
    voices: [['horn', 55, 0.07], ['harp', 25, 0.16], ['flute', 20, 0.07]],
    accompany(chord, at, step) {
      const n = (d: number) => note(horizon, d)
      const e = horizon.stepS
      pad(chord.map((d) => n(d - 7)), at, 4 * e, 0.03)
      pluck(n(chord[0] - 14), at, 4 * e, 0.18, 3)
      if (step % 2) [0, 1, 2, 1].forEach((i, k) => pluck(n(chord[i]), at + (k + 0.5) * e, 2.2, 0.07, 4))
    },
    drone: [-14],
    droneLevel: 0.045,
    drums: ['timpani', null, null, null],
    drumLevel: 0.16,
    range: [-2, 8],
    moves: [-2, -1, 1, 1, 2, 0],
    seconds: 200,
    loud: 1.45,
  }

  // Sarhoş Ejder: a fantasy tavern jig, a fiddle running over a strummed lute and a bodhrán.
  const jig: Piece = {
    name: 'Sarhoş Ejder',
    tonic: 64,
    scale: [0, 2, 3, 5, 7, 9, 10],
    stepS: 60 / 112 / 3,
    bar: 6,
    progression: [0, 0, 6, 6, 0, 0, 3, 4],
    rhythms: [[1, 1, 1, 1, 1, 1], [2, 1, 2, 1], [1, 1, 1, 3], [3, 1, 1, 1], [2, 1, 1, 1, 1]],
    voices: [['fiddle', 60, 0.055], ['flute', 25, 0.075], ['lute', 15, 0.17]],
    accompany(chord, at) {
      const n = (d: number) => note(jig, d)
      const e = jig.stepS
      pluck(n(chord[0] - 14), at, 0.7, 0.26)
      strum(chord.map((d) => n(d - 7)), at + 3 * e, 0.6, 0.07)
      pluck(n(chord[0] - 14 + 4), at + 3 * e, 0.5, 0.15)
    },
    drone: [-14],
    droneLevel: 0.025,
    drums: ['low', 'high', 'high', 'low', 'high', 'high'],
    drumLevel: 0.15,
    range: [-1, 9],
    moves: [-1, -1, 1, 1, -2, 2, 1, -1],
    seconds: 150,
    loud: 1.6,
  }

  pieces.push(tavern, crusade, england, horizon, jig)

  // The drone of the playing piece, faded in and out with it.
  const breath = ctx.createOscillator()
  breath.frequency.value = 0.07
  const breathDepth = ctx.createGain()
  breathDepth.gain.value = 0.02
  breath.connect(breathDepth)
  breath.start()
  let drone: { gain: GainNode; oscs: OscillatorNode[] } | null = null
  const startDrone = (piece: Piece, at: number) => {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(piece.droneLevel, at + 3)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 380
    filter.connect(gain).connect(bus)
    breathDepth.connect(gain.gain)
    const n = (d: number) => note(piece, d)
    const oscs = piece.drone.map((d) => osc('triangle', midiToHz(n(d)), at, at + 3600, filter))
    drone = { gain, oscs }
  }
  const stopDrone = (at: number) => {
    if (!drone) return
    const { gain, oscs } = drone
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(0, at + 2)
    for (const o of oscs) o.stop(at + 2.1)
    setTimeout(() => breathDepth.disconnect(gain.gain), (at + 2.2 - ctx.currentTime) * 1000)
    drone = null
  }

  // The pieces take turns, never the same one twice in a row; the tavern tune opens (`?music=0..4` picks the first in
  // development, to hear one).
  const asked = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('music') ?? NaN) : NaN
  let piece = pieces[asked] ?? tavern
  out.gain.value = piece.loud ?? 1
  let pieceStart = ctx.currentTime + 0.2
  let bar = 0
  let barStart = pieceStart
  let melodyDegree = 4
  let section: [Voice, number, number] = piece.voices[0]
  startDrone(piece, pieceStart)

  const nextPiece = () => {
    stopDrone(barStart)
    piece = pick(pieces.filter((p) => p !== piece))
    barStart += GAP_S
    // A fresh gain for the next piece; the last one's notes ring out through their own.
    const last = out
    setTimeout(() => last.disconnect(), 15_000)
    out = ctx.createGain()
    out.gain.value = piece.loud ?? 1
    out.connect(bus)
    pieceStart = barStart
    bar = 0
    melodyDegree = 4
    startDrone(piece, barStart)
  }

  const scheduleBar = (at: number) => {
    const p = piece
    const n = (d: number) => note(p, d)
    const step = bar % p.progression.length
    if (step === 0) section = weighted(p.voices)
    const root = p.progression[step]
    const chord = [root, root + 2, root + 4]
    p.accompany(chord, at, step)
    if (p.drums) p.drums.forEach((hit, i) => drum(hit, at + i * p.stepS, (p.drumLevel ?? 0.2) * (i ? 1 : 1.15)))

    // Melody: a gentle random walk over the scale that lands on a chord tone at each bar.
    // The last bar of the pass rests on the tonic; every fourth bar breathes on a long note.
    const [voice, , gain] = section
    if (step === p.progression.length - 1) {
      play(voice, n(0), at, p.bar * p.stepS * 0.9, gain)
      melodyDegree = 0
      return
    }
    const rhythm = step % 4 === 3 ? [p.bar] : pick(p.rhythms)
    let t = 0
    rhythm.forEach((steps, i) => {
      if (i === 0) {
        melodyDegree = chord
          .flatMap((d) => [d, d + 7])
          .reduce((best, d) => (Math.abs(d - melodyDegree) < Math.abs(best - melodyDegree) ? d : best))
      } else {
        melodyDegree += pick(p.moves)
      }
      melodyDegree = Math.min(p.range[1], Math.max(p.range[0], melodyDegree))
      if (Math.random() > 0.08 || i === 0) play(voice, n(melodyDegree), at + t * p.stepS, steps * p.stepS, gain)
      t += steps
    })
  }

  const tick = () => {
    while (barStart < ctx.currentTime + LOOKAHEAD_S) {
      // After the tab was throttled, skip ahead instead of playing a pile of late bars at once.
      if (barStart < ctx.currentTime) barStart = ctx.currentTime + 0.05
      if (bar > 0 && bar % piece.progression.length === 0 && barStart - pieceStart >= piece.seconds) {
        nextPiece()
        continue
      }
      scheduleBar(barStart)
      barStart += piece.bar * piece.stepS
      bar++
    }
  }
  const timer = setInterval(tick, TICK_MS)
  tick()

  // Hidden tabs stay silent. Muted music is not played at all (CLAUDE.md §12): the audio is held once it has faded out,
  // rather than playing on at no volume.
  let hold = 0
  const onVisibility = () => void (document.hidden || muted ? ctx.suspend() : ctx.resume())
  document.addEventListener('visibilitychange', onVisibility)

  if (!muted) fadeTo(level, FADE_IN_S)

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
      // Unlocked inside the gesture all the same, then held again while muted.
      if (muted) {
        clearTimeout(hold)
        hold = window.setTimeout(() => muted && void ctx.suspend(), 600)
        return true
      }
      return ctx.state === 'running'
    },
    setMuted(value) {
      muted = value
      clearTimeout(hold)
      if (!value && !document.hidden && ctx.state !== 'running') void ctx.resume()
      fadeTo(value ? 0 : level, value ? 0.4 : 1.5)
      if (value) hold = window.setTimeout(() => muted && void ctx.suspend(), 600)
    },
    setVolume(value) {
      level = VOLUME * Math.min(1, Math.max(0, value))
      if (!muted) fadeTo(level, 0.2)
    },
    destroy() {
      clearInterval(timer)
      clearTimeout(hold)
      document.removeEventListener('visibilitychange', onVisibility)
      breath.stop()
      for (const o of drone?.oscs ?? []) o.stop()
      ctx.close()
    },
  }
}
