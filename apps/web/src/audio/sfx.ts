// Sound effects, synthesised in the browser like the music: short cues for what the envoy brings and what happens in
// the kingdom. One shared audio context, made on the first user gesture (browsers allow audio only after one).

export type Cue = 'click' | 'enter' | 'leave' | 'start' | 'battle' | 'war' | 'envoy' | 'good' | 'bad' | 'build' | 'fortune' | 'omen' | 'coin'

const LEVEL = 0.35

let ctx: AudioContext | null = null
let out: GainNode | null = null
let enabled = true
let volume = 0.7

export function setSfx(on: boolean, level: number) {
  enabled = on
  volume = Math.min(1, Math.max(0, level))
  if (out) out.gain.value = LEVEL * volume
}

// Called from a user gesture; returns whether audio can play.
export function unlockSfx() {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return false
    ctx = new Ctx()
    out = ctx.createGain()
    out.gain.value = LEVEL * volume
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx.state === 'running'
}

// A plucked or blown tone: `type` waveform at `hz`, from `at` for `length` seconds.
function tone(hz: number, at: number, length: number, type: OscillatorType = 'triangle', gain = 0.5, slide = 0) {
  const c = ctx!
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(hz, at)
  if (slide) osc.frequency.exponentialRampToValueAtTime(hz * slide, at + length)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(g).connect(out!)
  osc.start(at)
  osc.stop(at + length + 0.05)
}

// A drum hit: filtered noise with a falling thump under it.
function drum(at: number, gain = 0.8, hz = 90) {
  const c = ctx!
  const length = 0.25
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * length), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 4
  const noise = c.createBufferSource()
  noise.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 700
  const g = c.createGain()
  g.gain.value = gain * 0.6
  noise.connect(filter).connect(g).connect(out!)
  noise.start(at)
  tone(hz, at, 0.2, 'sine', gain, 0.5)
}

const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

// Every cue is short (well under a second), so the screen's news never drones on.
export function play(cue: Cue) {
  if (!enabled || volume <= 0 || !ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.02
  switch (cue) {
    case 'click':
      // A soft wooden tick.
      tone(note(79), t, 0.04, 'triangle', 0.12, 0.7)
      break
    case 'enter':
      // Into a lobby: a horn call rising.
      ;[62, 67, 71, 74].forEach((m, i) => tone(note(m), t + i * 0.09, i === 3 ? 0.35 : 0.12, 'square', 0.07))
      break
    case 'leave':
      // Back to the menu: the same call falling.
      ;[74, 71, 67, 62].forEach((m, i) => tone(note(m), t + i * 0.08, i === 3 ? 0.3 : 0.1, 'triangle', 0.18))
      break
    case 'start':
      // Work begins: a saw stroke and two mallet knocks on timber.
      tone(note(64), t, 0.14, 'sawtooth', 0.05, 1.5)
      drum(t + 0.15, 0.35, 220)
      drum(t + 0.28, 0.3, 200)
      break
    case 'battle':
      // War drums and a short horn call.
      for (const d of [0, 0.14, 0.28]) drum(t + d, 0.7)
      tone(note(50), t + 0.3, 0.35, 'sawtooth', 0.12)
      tone(note(57), t + 0.3, 0.35, 'sawtooth', 0.08)
      break
    case 'war':
      // A low horn and a drum.
      tone(note(45), t, 0.45, 'sawtooth', 0.14, 0.94)
      tone(note(52), t, 0.45, 'sawtooth', 0.09, 0.94)
      drum(t + 0.4, 1, 70)
      break
    case 'envoy':
      // A short trumpet call.
      ;[67, 72, 76].forEach((m, i) => tone(note(m), t + i * 0.08, i === 2 ? 0.25 : 0.1, 'square', 0.08))
      break
    case 'good':
      ;[72, 76, 79].forEach((m, i) => tone(note(m), t + i * 0.05, 0.22, 'triangle', 0.25))
      break
    case 'bad':
      // A low bell.
      tone(note(45), t, 0.6, 'sine', 0.4)
      tone(note(57.3), t, 0.4, 'sine', 0.12)
      break
    case 'build':
      // Hammer taps.
      for (const d of [0, 0.12, 0.24]) tone(note(84), t + d, 0.05, 'square', 0.12, 0.6)
      break
    case 'fortune':
      // A harp running up.
      ;[62, 66, 69, 74].forEach((m, i) => tone(note(m), t + i * 0.05, 0.3, 'triangle', 0.2))
      break
    case 'omen':
      // A harp running down.
      ;[74, 70, 67, 62].forEach((m, i) => tone(note(m), t + i * 0.06, 0.35, 'triangle', 0.2))
      break
    case 'coin':
      tone(note(88), t, 0.06, 'square', 0.06)
      tone(note(93), t + 0.05, 0.12, 'square', 0.06)
      break
  }
}
