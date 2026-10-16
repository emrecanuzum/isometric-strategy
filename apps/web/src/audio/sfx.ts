// Sound effects, synthesised in the browser like the music: short cues for what the envoy brings and what happens in
// the kingdom. One shared audio context, made on the first user gesture (browsers allow audio only after one).

export type Cue = 'chat' | 'mention' | 'click' | 'enter' | 'leave' | 'start' | 'battle' | 'war' | 'envoy' | 'good' | 'bad' | 'build' | 'fortune' | 'omen' | 'coin' | 'tick' | 'go' | 'hit' | 'miss' | 'chop' | 'splash'
  // Every popup of its own (CLAUDE.md §11): what the envoy brings, the house's news, the crown's requests.
  | NewsCue

export type NewsCue =
  | 'crown' | 'royal' | 'greeting' | 'tribute' | 'tavern' | 'gift' | 'courtesy' | 'refused' | 'alliance' | 'allianceBroken'
  | 'peace' | 'warHorn' | 'threat' | 'insult' | 'spy' | 'spyLost' | 'sabotage' | 'revolt' | 'kidnap' | 'raid' | 'naval'
  | 'calm' | 'blockade' | 'siege' | 'triumph' | 'victory' | 'sorrow' | 'birth' | 'death' | 'coronation' | 'wedding'
  | 'council' | 'ofAge' | 'expedition' | 'sale' | 'cargo' | 'king' | 'kingFell' | 'lost' | 'tower' | 'report'

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
    // A gentle compressor evens the cues out: a drum roll and a music-box chime come out about as loud.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 10
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.2
    out.connect(comp).connect(ctx.destination)
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

// Two seconds of white noise, made once and read from a random place by every noisy cue.
let noiseBuffer: AudioBuffer | null = null
function noiseSource() {
  const c = ctx!
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  return src
}

// Filtered noise: wind, waves, crowds, fire, paper. `to` sweeps the filter over the length.
function noise(at: number, length: number, o: { type?: BiquadFilterType; hz?: number; q?: number; gain?: number; to?: number; attack?: number } = {}) {
  const c = ctx!
  const src = noiseSource()
  const filter = c.createBiquadFilter()
  filter.type = o.type ?? 'bandpass'
  filter.frequency.setValueAtTime(o.hz ?? 1000, at)
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, at + length)
  filter.Q.value = o.q ?? 1
  const g = c.createGain()
  const attack = Math.min(length * 0.8, o.attack ?? 0.005)
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(filter).connect(g).connect(out!)
  src.start(at, Math.random() * 1.5)
  src.stop(at + length + 0.05)
}

// A brass voice: two slightly detuned saws through a lowpass that opens as the note is blown.
function brass(hz: number, at: number, length: number, gain = 0.12, bright = 2200, slide = 0) {
  const c = ctx!
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 1.5
  filter.frequency.setValueAtTime(bright * 0.25, at)
  filter.frequency.exponentialRampToValueAtTime(bright, at + Math.min(0.06, length * 0.4))
  filter.frequency.exponentialRampToValueAtTime(bright * 0.5, at + length)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.035, length * 0.3))
  g.gain.setValueAtTime(gain * 0.85, at + length * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, at + length)
  filter.connect(g).connect(out!)
  for (const detune of [-6, 6]) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.detune.value = detune
    osc.frequency.setValueAtTime(hz, at)
    if (slide) osc.frequency.exponentialRampToValueAtTime(hz * slide, at + length)
    osc.connect(filter)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

// A struck bell: inharmonic partials, the high ones dying first.
function bell(hz: number, at: number, length: number, gain = 0.3) {
  const parts: [number, number][] = [[1, 1], [2, 0.5], [2.76, 0.35], [4.07, 0.18], [5.4, 0.1]]
  parts.forEach(([ratio, share], i) => tone(hz * ratio, at, length / (1 + i * 0.6), 'sine', gain * share))
}

// A plucked string (lute, pizzicato): a soft square click on a quickly dying triangle.
function pluck(hz: number, at: number, length = 0.25, gain = 0.2) {
  tone(hz, at, length, 'triangle', gain)
  tone(hz * 2, at, 0.03, 'square', gain * 0.15)
}

// Coins falling on a table.
function coins(at: number, count = 3, gain = 0.06) {
  const notes = [88, 93, 91, 96, 90]
  for (let i = 0; i < count; i++) {
    tone(note(notes[i % notes.length]), at + i * 0.055, 0.09, 'square', gain)
    tone(note(notes[i % notes.length] + 7.3), at + i * 0.055, 0.05, 'sine', gain * 0.8)
  }
}

// Steel on steel.
function clash(at: number, gain = 0.25) {
  noise(at, 0.16, { type: 'highpass', hz: 2800, gain })
  tone(1530, at, 0.22, 'square', gain * 0.12, 0.98)
  tone(2290, at, 0.18, 'square', gain * 0.08, 0.97)
}

// Waves rolling in.
function waves(at: number, length = 0.8, gain = 0.25) {
  noise(at, length, { type: 'lowpass', hz: 900, to: 260, gain, attack: length * 0.35 })
}

// Hoofbeats at a gallop.
function hooves(at: number, beats = [0, 0.08, 0.13, 0.26, 0.34, 0.39]) {
  for (const d of beats) {
    drum(at + d, 0.22, 260)
    noise(at + d, 0.04, { type: 'lowpass', hz: 1200, gain: 0.12 })
  }
}

// Every cue is short (well under a second), so the screen's news never drones on.
export function play(cue: Cue) {
  if (!enabled || volume <= 0 || !ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.02
  switch (cue) {
    case 'chat':
      // A soft two-note chime.
      tone(note(81), t, 0.12, 'triangle', 0.14)
      tone(note(86), t + 0.08, 0.18, 'triangle', 0.12)
      break
    case 'mention':
      // A brighter three-note call: someone is talking to the player.
      ;[84, 88, 91].forEach((m, i) => tone(note(m), t + i * 0.07, 0.16, 'square', 0.07))
      break
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
    // ---- Each popup's own cue (CLAUDE.md §11) ----
    case 'crown':
      // The crown: a trumpet fanfare and a glint of gold.
      ;[72, 76, 79].forEach((m, i) => brass(note(m), t + i * 0.07, 0.1, 0.11, 2600))
      brass(note(84), t + 0.22, 0.42, 0.12, 2800)
      brass(note(60), t + 0.22, 0.42, 0.07, 1200)
      tone(note(96), t + 0.34, 0.2, 'sine', 0.06)
      tone(note(100), t + 0.42, 0.25, 'sine', 0.05)
      break
    case 'royal':
      // The court's herald: a dotted call, a drum on the long note.
      brass(note(67), t, 0.08, 0.1)
      brass(note(67), t + 0.1, 0.06, 0.1)
      brass(note(72), t + 0.18, 0.14, 0.11)
      brass(note(76), t + 0.34, 0.45, 0.12, 2600)
      brass(note(64), t + 0.34, 0.45, 0.07, 1400)
      drum(t + 0.34, 0.45, 110)
      break
    case 'greeting':
      // The crown's patrol riding by: hoofbeats and a short friendly horn.
      hooves(t, [0, 0.08, 0.13, 0.26, 0.34])
      brass(note(67), t + 0.4, 0.12, 0.09, 1500)
      brass(note(74), t + 0.52, 0.3, 0.1, 1700)
      break
    case 'tribute':
      // The collector: coins counted out, two stern drum beats.
      coins(t, 4)
      drum(t + 0.28, 0.75, 62)
      drum(t + 0.5, 0.75, 58)
      break
    case 'tavern':
      // A lute strummed twice and the patrol cheering.
      ;[55, 59, 62, 67].forEach((m, i) => pluck(note(m), t + i * 0.022, 0.3, 0.13))
      ;[57, 60, 64, 69].forEach((m, i) => pluck(note(m), t + 0.24 + i * 0.022, 0.4, 0.13))
      noise(t + 0.3, 0.45, { hz: 1100, to: 1600, q: 1.8, gain: 0.14, attack: 0.08 })
      noise(t + 0.32, 0.4, { hz: 2400, q: 3, gain: 0.05, attack: 0.08 })
      break
    case 'gift':
      // A sparkle running up, then coins.
      ;[91, 96, 100, 103].forEach((m, i) => tone(note(m), t + i * 0.045, 0.18, 'sine', 0.08))
      coins(t + 0.24, 3, 0.05)
      break
    case 'courtesy':
      // A soft horn, two mellow notes.
      brass(note(67), t, 0.22, 0.09, 900)
      brass(note(72), t + 0.2, 0.42, 0.09, 1000)
      break
    case 'refused':
      // A turned-down answer: two notes falling and a dry knock.
      tone(note(67), t, 0.18, 'triangle', 0.22)
      tone(note(62), t + 0.16, 0.3, 'triangle', 0.22)
      drum(t + 0.18, 0.25, 180)
      break
    case 'alliance':
      // Warm brass, two notes and their fifths.
      brass(note(62), t, 0.3, 0.09, 1500)
      brass(note(55), t, 0.3, 0.06, 1000)
      brass(note(67), t + 0.28, 0.5, 0.1, 1700)
      brass(note(60), t + 0.28, 0.5, 0.06, 1100)
      break
    case 'allianceBroken':
      // The same brass falling a tritone, a low bell under it.
      brass(note(67), t, 0.25, 0.1, 1600)
      brass(note(61), t + 0.24, 0.5, 0.1, 1300, 0.97)
      bell(note(43), t + 0.24, 0.6, 0.2)
      break
    case 'peace':
      // Bells ringing up.
      bell(note(76), t, 0.55, 0.2)
      bell(note(79), t + 0.16, 0.55, 0.2)
      bell(note(84), t + 0.32, 0.6, 0.22)
      break
    case 'warHorn':
      // The war horn and a drum roll swelling under it.
      brass(note(45), t, 0.55, 0.15, 1300, 1.02)
      brass(note(52), t, 0.55, 0.08, 1000, 1.02)
      for (let i = 0; i < 7; i++) drum(t + 0.36 + i * 0.065, 0.25 + i * 0.09, 120)
      break
    case 'threat':
      // An army at the border: low drums, slow, and a dark drone.
      drum(t, 0.9, 52)
      drum(t + 0.32, 0.9, 52)
      drum(t + 0.48, 0.6, 58)
      tone(note(33), t, 0.8, 'sine', 0.2)
      tone(note(40), t, 0.8, 'sawtooth', 0.025)
      break
    case 'insult':
      // A sharp brass stab, twice, out of tune.
      ;[63, 66, 69].forEach((m) => brass(note(m), t, 0.12, 0.08, 3200))
      ;[62, 65, 68.5].forEach((m) => brass(note(m), t + 0.17, 0.22, 0.08, 3000, 0.96))
      break
    case 'spy':
      // A sneaky pizzicato and a door shut on the spy.
      ;[52, 55, 58, 55].forEach((m, i) => pluck(note(m), t + i * 0.1, 0.08, 0.2))
      noise(t + 0.48, 0.12, { type: 'lowpass', hz: 500, gain: 0.35 })
      drum(t + 0.48, 0.6, 75)
      break
    case 'spyLost':
      // The same tiptoe, falling, and a heavier door.
      ;[64, 61, 58, 55].forEach((m, i) => pluck(note(m), t + i * 0.1, 0.09, 0.2))
      noise(t + 0.46, 0.18, { type: 'lowpass', hz: 380, gain: 0.45 })
      drum(t + 0.46, 0.9, 55)
      break
    case 'sabotage':
      // Fire: a rising roar and crackles.
      noise(t, 0.8, { type: 'lowpass', hz: 300, to: 900, gain: 0.25, attack: 0.3 })
      for (let i = 0; i < 9; i++) noise(t + 0.05 + Math.random() * 0.65, 0.025, { type: 'highpass', hz: 2200 + Math.random() * 2000, gain: 0.18 + Math.random() * 0.12 })
      break
    case 'revolt':
      // A crowd roaring, a drum to start it.
      drum(t, 0.6, 80)
      noise(t, 0.85, { hz: 480, to: 650, q: 0.9, gain: 0.3, attack: 0.25 })
      noise(t + 0.05, 0.75, { hz: 1150, to: 1400, q: 1.6, gain: 0.12, attack: 0.25 })
      break
    case 'kidnap':
      // Something eerie: two low tones beating against each other and a high, sinking whistle.
      tone(note(45), t, 0.85, 'sine', 0.25)
      tone(note(45.6), t, 0.85, 'sine', 0.2)
      tone(note(81), t + 0.12, 0.65, 'sine', 0.05, 0.9)
      noise(t, 0.7, { type: 'highpass', hz: 4000, gain: 0.03, attack: 0.3 })
      break
    case 'raid':
      // Swords clashing on the road.
      clash(t, 0.28)
      clash(t + 0.17, 0.22)
      drum(t + 0.36, 0.6, 90)
      break
    case 'naval':
      // Waves and the clash of boarding.
      waves(t, 0.85, 0.28)
      clash(t + 0.3, 0.22)
      drum(t + 0.3, 0.5, 70)
      break
    case 'calm':
      // Waves and a soft, relieved call.
      waves(t, 0.8, 0.22)
      tone(note(72), t + 0.15, 0.25, 'triangle', 0.16)
      tone(note(76), t + 0.32, 0.4, 'triangle', 0.16)
      break
    case 'blockade':
      // Waves and a low horn across the water.
      waves(t, 0.85, 0.24)
      brass(note(43), t + 0.12, 0.6, 0.12, 900)
      break
    case 'siege':
      // A catapult: the creak of the arm, the stone in the air, the thud and the rubble.
      tone(300, t, 0.14, 'sawtooth', 0.03, 0.55)
      noise(t + 0.12, 0.3, { hz: 900, to: 300, q: 2, gain: 0.12, attack: 0.15 })
      drum(t + 0.44, 1, 46)
      noise(t + 0.46, 0.3, { type: 'lowpass', hz: 1000, to: 300, gain: 0.25 })
      break
    case 'triumph':
      // A town taken: a fanfare and the people cheering.
      ;[60, 64, 67].forEach((m, i) => brass(note(m), t + i * 0.08, 0.09, 0.1))
      ;[72, 76, 79].forEach((m) => brass(note(m), t + 0.24, 0.45, 0.07, 2600))
      drum(t + 0.24, 0.6, 90)
      noise(t + 0.3, 0.45, { hz: 1200, to: 1700, q: 1.6, gain: 0.1, attack: 0.1 })
      break
    case 'victory':
      // A battle won: a horn climbing and a drum on its top note.
      ;[62, 66, 69].forEach((m, i) => brass(note(m), t + i * 0.1, 0.11, 0.1, 2000))
      brass(note(74), t + 0.3, 0.5, 0.12, 2400)
      brass(note(62), t + 0.3, 0.5, 0.07, 1300)
      drum(t + 0.3, 0.7, 85)
      break
    case 'sorrow':
      // A battle lost: a soft horn sinking in a minor key.
      ;[64, 62, 60].forEach((m, i) => brass(note(m), t + i * 0.18, 0.2, 0.08, 800))
      brass(note(59), t + 0.54, 0.4, 0.08, 700, 0.98)
      tone(note(40), t + 0.54, 0.4, 'sine', 0.15)
      break
    case 'birth':
      // A music box lullaby.
      ;[84, 88, 91, 88, 84].forEach((m, i) => {
        tone(note(m), t + i * 0.12, 0.3, 'triangle', 0.13)
        tone(note(m + 12), t + i * 0.12, 0.15, 'sine', 0.03)
      })
      break
    case 'death':
      // The funeral bell, struck twice.
      bell(note(43), t, 0.95, 0.35)
      bell(note(43), t + 0.48, 0.5, 0.18)
      break
    case 'coronation':
      // A new king: a fanfare up to a held chord and a bell.
      ;[67, 72, 76].forEach((m, i) => brass(note(m), t + i * 0.08, 0.1, 0.1, 2400))
      ;[79, 72].forEach((m) => brass(note(m), t + 0.26, 0.5, 0.08, 2600))
      bell(note(79), t + 0.26, 0.6, 0.12)
      break
    case 'wedding':
      // Wedding bells ringing up.
      ;[79, 83, 86, 91].forEach((m, i) => bell(note(m), t + i * 0.12, 0.45, 0.13))
      break
    case 'council':
      // The regents: a low, grave chord.
      ;[50, 53, 57].forEach((m) => brass(note(m), t, 0.6, 0.06, 700))
      drum(t, 0.3, 90)
      break
    case 'ofAge':
      // Coming of age: a chime climbing and a glint.
      ;[72, 79, 84].forEach((m, i) => tone(note(m), t + i * 0.1, 0.3, 'triangle', 0.18))
      tone(note(96), t + 0.3, 0.25, 'sine', 0.05)
      break
    case 'expedition':
      // Horses home at a gallop, and a horn.
      hooves(t)
      brass(note(72), t + 0.48, 0.14, 0.09, 1800)
      brass(note(79), t + 0.6, 0.32, 0.1, 2000)
      break
    case 'sale':
      // A cash drawer: the click, the ring and the coins.
      noise(t, 0.03, { type: 'highpass', hz: 2500, gain: 0.3 })
      bell(note(96), t + 0.05, 0.4, 0.1)
      bell(note(100), t + 0.1, 0.45, 0.08)
      coins(t + 0.18, 5, 0.05)
      break
    case 'cargo':
      // A cart rolling in, its load set down, a coin or two.
      drum(t, 0.4, 150)
      drum(t + 0.14, 0.35, 140)
      noise(t, 0.3, { type: 'lowpass', hz: 600, gain: 0.08 })
      coins(t + 0.3, 2)
      tone(note(76), t + 0.42, 0.3, 'triangle', 0.15)
      break
    case 'king':
      // The king takes the field: a regal horn climbing over a drum.
      brass(note(60), t, 0.14, 0.11)
      brass(note(67), t + 0.13, 0.14, 0.11)
      brass(note(72), t + 0.26, 0.5, 0.12, 2400)
      brass(note(48), t + 0.26, 0.5, 0.07, 900)
      drum(t + 0.26, 0.8, 70)
      break
    case 'kingFell':
      // The king fallen: a deep bell, a drum, a horn falling.
      bell(note(40), t, 0.9, 0.3)
      drum(t, 0.7, 50)
      brass(note(57), t + 0.2, 0.6, 0.09, 900, 0.88)
      break
    case 'lost':
      // An order that never got there: a falling whistle and a small thud.
      tone(1200, t, 0.4, 'sine', 0.08, 0.35)
      drum(t + 0.4, 0.4, 110)
      break
    case 'tower':
      // Arrows from the towers: whistles and thuds.
      for (const d of [0, 0.1, 0.2]) {
        noise(t + d, 0.18, { hz: 3200, to: 1200, q: 3, gain: 0.18, attack: 0.1 })
        drum(t + d + 0.18, 0.3, 200)
      }
      break
    case 'report':
      // The report while away: two pages turned and a soft chord.
      noise(t, 0.08, { hz: 2600, q: 0.8, gain: 0.12, attack: 0.03 })
      noise(t + 0.12, 0.08, { hz: 3000, q: 0.8, gain: 0.1, attack: 0.03 })
      ;[67, 71, 74].forEach((m) => tone(note(m), t + 0.22, 0.45, 'triangle', 0.1))
      break
    // The mini-games (CLAUDE.md §6.5): the countdown, a good blow, a miss, an axe or scythe, the water.
    case 'tick':
      tone(note(76), t, 0.08, 'square', 0.06)
      break
    case 'go':
      tone(note(83), t, 0.2, 'square', 0.08)
      tone(note(88), t + 0.06, 0.25, 'triangle', 0.12)
      break
    case 'hit':
      tone(note(91), t, 0.05, 'square', 0.07, 0.8)
      drum(t, 0.35, 160)
      break
    case 'miss':
      tone(note(52), t, 0.18, 'triangle', 0.18, 0.7)
      break
    case 'chop':
      drum(t, 0.55, 120)
      tone(note(70), t, 0.06, 'sawtooth', 0.05, 0.5)
      break
    case 'splash':
      drum(t, 0.25, 300)
      tone(note(84), t + 0.02, 0.12, 'sine', 0.06, 0.6)
      break
  }
}

// The same popup announced once only, however often it re-renders or comes back (by a key of its own).
const announced = new Set<string>()
export function playOnce(key: string, cue: Cue) {
  if (announced.has(key)) return
  announced.add(key)
  play(cue)
}

// ---- The envoy's voice ---------------------------------------------------------------------------------------------

// While the envoy's words are typed out he mumbles them (Animal Crossing's gibberish): one short syllable every few
// letters, a low old man's buzz shaped by two formant filters for the syllable's vowel, its pitch drifting from
// syllable to syllable (rising on a question). Quiet: it plays often.
const VOWELS: Record<string, [number, number]> = {
  a: [730, 1100], e: [520, 1750], i: [320, 2200], ı: [380, 1450], o: [470, 820], ö: [430, 1550], u: [350, 760], ü: [320, 1650],
}
const BABBLE_HZ = 98
export function babble(syllable: string, question = false) {
  if (!enabled || volume <= 0 || !ctx || ctx.state !== 'running') return
  const c = ctx
  const lower = syllable.toLocaleLowerCase('tr-TR')
  const vowel = [...lower].find((ch) => ch in VOWELS) ?? 'a'
  let hash = 7
  for (const ch of lower) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const at = c.currentTime + 0.005
  const length = 0.06 + (hash % 4) * 0.009
  const hz = BABBLE_HZ * 2 ** ((((hash % 9) - 4) / 12) * 0.8) * (question ? 1.18 : 1)
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(hz, at)
  osc.frequency.exponentialRampToValueAtTime(hz * (question ? 1.12 : 0.9), at + length)
  const shape = c.createGain()
  shape.gain.setValueAtTime(0.0001, at)
  shape.gain.exponentialRampToValueAtTime(0.55, at + 0.01)
  shape.gain.exponentialRampToValueAtTime(0.0001, at + length)
  const soft = c.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 2600
  soft.connect(out!)
  const [f1, f2] = VOWELS[vowel]
  for (const [f, q, share] of [[f1, 5, 1], [f2, 7, 0.6]] as const) {
    const band = c.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = f * (0.95 + (hash % 5) * 0.025)
    band.Q.value = q
    const g = c.createGain()
    g.gain.value = share
    shape.connect(band).connect(g).connect(soft)
  }
  osc.connect(shape)
  osc.start(at)
  osc.stop(at + length + 0.03)
  // A breath of a consonant at the front.
  if (!(lower[0] in VOWELS)) noise(at, 0.018, { hz: 3200, q: 1.5, gain: 0.025 })
}

// ---- Battle music --------------------------------------------------------------------------------------------------

// Played while a battle is watched: war drums under a low ostinato in D minor and a horn now and then, all on the
// music's volume (not the effects'). Returns a function that fades it out.
let musicOn = true
let musicLevel = 0.7
export function setBattleMusicLevel(on: boolean, level: number) {
  musicOn = on
  musicLevel = Math.min(1, Math.max(0, level))
}

export function startBattleMusic(): () => void {
  if (!ctx || !musicOn || musicLevel <= 0) return () => {}
  const c = ctx
  const bus = c.createGain()
  bus.gain.setValueAtTime(0.0001, c.currentTime)
  bus.gain.exponentialRampToValueAtTime(0.5 * musicLevel + 0.0001, c.currentTime + 1.5)
  bus.connect(c.destination)
  const beat = 0.42
  const BASS = [38, 38, 41, 38, 36, 36, 33, 36]
  let step = 0
  let next = c.currentTime + 0.1
  const voice = (hz: number, at: number, length: number, type: OscillatorType, gain: number) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(hz, at)
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(g).connect(bus)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
  const thump = (at: number, gain: number, hz: number) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.frequency.setValueAtTime(hz, at)
    osc.frequency.exponentialRampToValueAtTime(hz * 0.45, at + 0.25)
    g.gain.setValueAtTime(gain, at)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    osc.connect(g).connect(bus)
    osc.start(at)
    osc.stop(at + 0.35)
  }
  const timer = window.setInterval(() => {
    // Keep half a second scheduled ahead.
    while (next < c.currentTime + 0.5) {
      const bar = step % 16
      // Drums: a heavy beat on one and three, a run of light hits at the end of the bar.
      if (bar % 4 === 0) thump(next, 0.9, 80)
      if (bar === 6 || bar === 14) thump(next, 0.5, 120)
      if (bar >= 12 && bar % 1 === 0) thump(next, 0.25, 180)
      // A low, restless bass on every beat.
      voice(note(BASS[Math.floor(step / 2) % BASS.length]), next, beat * 0.9, 'sawtooth', 0.06)
      // A horn call every other bar.
      if (step % 32 === 0) {
        voice(note(62), next, beat * 2, 'sawtooth', 0.05)
        voice(note(65), next + beat * 2, beat * 2, 'sawtooth', 0.05)
      }
      next += beat / 2
      step++
    }
  }, 120)
  return () => {
    clearInterval(timer)
    const t = c.currentTime
    bus.gain.cancelScheduledValues(t)
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t)
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 1)
    window.setTimeout(() => bus.disconnect(), 1200)
  }
}
