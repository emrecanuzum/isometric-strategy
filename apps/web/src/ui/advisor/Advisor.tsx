import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../icons'
import { babble } from '../../audio/sfx'
import { EnvoyPortrait } from './EnvoyPortrait'
import {
  ADVISOR_EVERY_MINUTES, IDLE_LINES, LATER, LATER_ANSWERS, SKIP_ANSWERS, SMALL_TALK, SNOOZE_MINUTES, STEPS, TIPS, TOPICS, TOPICS_ASK, TUTORIAL_DONE,
  TUTORIAL_OFF_ANSWERS,
} from './lines'
import type { AdvisorAction, AdvisorCtx, Reply, Step, Tip, Topic } from './lines'

// The envoy as the lord's advisor (CLAUDE.md §9.8): a small speech panel, not a dialog, with his portrait, what he says
// typed out letter by letter and one to three answers. He comes on his own every few minutes of play (never over
// another dialog, never twice at once) with advice picked from what the lord lacks, walks a new lord through the
// tutorial, and explains any part of the game when asked. What he remembers (muted, the tutorial, topics put off) is
// kept in this browser per lobby and lord.

// ---- Memory ---------------------------------------------------------------------------------------------------------

export interface AdvisorMemory {
  muted?: boolean
  tutorial?: 'on' | 'off' | 'done'
  // Topics put off until then (ms).
  snoozed?: Record<string, number>
  // Tutorial steps already congratulated, and those the lord chose to skip.
  cheered?: string[]
  skipped?: string[]
  // The next wording to use for each thing he says (they are taken in turn).
  turns?: Record<string, number>
}

const EVENT = 'advisor:memory'

function readMemory(key: string): AdvisorMemory {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as AdvisorMemory
  } catch {
    return {}
  }
}

function writeMemory(key: string, memory: AdvisorMemory) {
  try {
    localStorage.setItem(key, JSON.stringify(memory))
  } catch {
    // Not remembered: he will repeat himself, as envoys do.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
}

export function useAdvisorMemory(key: string): [AdvisorMemory, (change: Partial<AdvisorMemory>) => void] {
  const [memory, setMemory] = useState(() => readMemory(key))
  useEffect(() => {
    setMemory(readMemory(key))
    const on = (e: Event) => (e as CustomEvent<string>).detail === key && setMemory(readMemory(key))
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [key])
  const update = useCallback((change: Partial<AdvisorMemory>) => writeMemory(key, { ...readMemory(key), ...change }), [key])
  return [memory, update]
}

// One of the wordings of something he says: they come in turn (starting anywhere), so the same advice twice in a
// row never sounds the same.
type Pick = <T>(key: string, options: readonly T[]) => T

function pickLine<T>(store: string, key: string, options: readonly T[]): T {
  if (options.length < 2) return options[0]
  const m = readMemory(store)
  const turns = m.turns ?? {}
  const at = (turns[key] ?? Math.floor(Math.random() * options.length)) % options.length
  writeMemory(store, { ...m, turns: { ...turns, [key]: (at + 1) % options.length } })
  return options[at]
}

// The envoy's switches in the settings window.
export function AdvisorSettings({ storeKey }: { storeKey: string }) {
  const [memory, update] = useAdvisorMemory(storeKey)
  return (
    <div className="sound-row">
      <div className="row spread">
        <span>Elçinin öğütleri</span>
        <button className="btn small" aria-pressed={!memory.muted} onClick={() => update({ muted: !memory.muted })}>
          <Icon name="scroll" size={16} slash={!!memory.muted} /> {memory.muted ? 'Kapalı' : 'Açık'}
        </button>
      </div>
      <div className="row spread">
        <span>Öğretici</span>
        <button className="btn small" aria-pressed={memory.tutorial === 'on'} onClick={() => update(memory.tutorial === 'on' ? { tutorial: 'off' } : { tutorial: 'on', cheered: [], skipped: [] })}>
          <Icon name="book" size={16} slash={memory.tutorial !== 'on'} /> {memory.tutorial === 'on' ? 'Açık' : memory.tutorial === 'done' ? 'Tamamlandı' : 'Kapalı'}
        </button>
      </div>
      <small className="hint">
        Öğütler açıkken elçi birkaç dakikada bir gelip eksiklerine göre öğüt verir; kapalıyken yalnızca elçi düğmesiyle çağırınca gelir. Öğretici yeni bir
        lordu adım adım kuruluştan 3. seviye saraya götürür; bütün adımları zaten geçtiysen açılınca hemen "Tamamlandı" olur.
      </small>
    </div>
  )
}

// ---- Typing ---------------------------------------------------------------------------------------------------------

const CHARS_PER_SECOND = 55
// He catches his breath at punctuation (ms after the mark).
const PAUSES: Record<string, number> = { '.': 260, '!': 260, '?': 280, '…': 320, ',': 120, ';': 140, ':': 140, '\n': 180 }

// When each letter appears (ms from the start): an even pace, with a pause after punctuation (once after a run of
// marks such as "..." or "?!").
function typingTimes(text: string) {
  const chars = [...text]
  const times: number[] = []
  let at = 0
  for (let i = 0; i < chars.length; i++) {
    at += 1000 / CHARS_PER_SECOND
    times.push(at)
    const pause = PAUSES[chars[i]]
    if (pause && !(chars[i + 1] in PAUSES)) at += pause
  }
  return times
}

function useTyping(text: string) {
  const length = [...text].length
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(length)
    const times = typingTimes(text)
    const start = performance.now()
    let raf = 0
    let n = 0
    const step = (now: number) => {
      while (n < length && times[n] <= now - start) n++
      setShown(n)
      if (n < length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, length])
  return { shown, done: shown >= length, finish: () => setShown(length) }
}

// His mumbling voice under the typing (CLAUDE.md §11): a syllable every two or three letters, at most one every
// 70 ms, silent at punctuation and spaces, and nothing at all when the lord skips to the end.
const LETTER = /\p{L}/u
function useBabble(text: string, shown: number) {
  const last = useRef({ text: '', shown: 0, letters: 0, at: 0, every: 3 })
  useEffect(() => {
    const m = last.current
    if (m.text !== text) Object.assign(m, { text, shown: 0, letters: 0, at: 0 })
    const from = m.shown
    m.shown = shown
    // Skipped (or a whole page at once): no burst of syllables.
    if (shown <= from || shown - from > 6) return
    const chars = [...text]
    for (let i = from; i < shown; i++) {
      const ch = chars[i]
      if (!LETTER.test(ch)) {
        if (ch in PAUSES || ch === ' ') m.letters = Math.min(m.letters, 1)
        continue
      }
      m.letters++
      const now = performance.now()
      if (m.letters >= m.every && now - m.at >= 70) {
        const rest = chars.slice(i, i + 12).join('')
        const question = /^[^.!?]*\?/.test(rest) && /\?/.test(rest.slice(0, 6))
        babble(chars.slice(Math.max(0, i - 2), i + 1).join(''), question)
        m.letters = 0
        m.at = now
        m.every = 2 + ((i * 7) % 2)
      }
    }
  }, [text, shown])
}

// ---- What he says -----------------------------------------------------------------------------------------------------

interface Speech {
  text: string
  replies: Reply[]
  // Shown under the text: a step of the tutorial, or the list of topics.
  step?: { index: number; of: number; title: string }
  topics?: boolean
}

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f()
  } catch {
    return fallback
  }
}

const tipFor = (c: AdvisorCtx, snoozed: Record<string, number>) => TIPS.find((t) => (snoozed[t.id] ?? 0) <= c.now && safe(() => t.when(c), false)) ?? null
const stepFor = (c: AdvisorCtx, skipped: string[] = []) => STEPS.findIndex((s) => !skipped.includes(s.id) && !safe(() => s.done(c), true))

function tipSpeech(t: Tip, c: AdvisorCtx, pick: Pick): Speech {
  const snooze = t.snooze ?? SNOOZE_MINUTES
  const joke = t.jokes?.length ? pick(`joke:${t.id}`, t.jokes) : null
  return {
    text: pick(`tip:${t.id}`, safe(() => t.say(c), [''])),
    replies: [
      ...(t.go ? [{ label: t.go.label, act: t.go.act }] : []),
      { label: pick('laterLabel', LATER), answer: pick('later', LATER_ANSWERS), snooze, id: t.id },
      ...(joke ? [{ label: joke[0], answer: joke[1], snooze, id: t.id }] : []),
    ],
  }
}

function stepSpeech(s: Step, index: number, c: AdvisorCtx, pick: Pick, cheer?: string): Speech {
  const core = safe(() => s.say(c), '')
  const quip = pick(`step:${s.id}`, s.quips)
  return {
    text: `${cheer ? `${cheer}\n\n` : ''}${s.lead ? `${quip} ${core}` : `${core} ${quip}`}`,
    step: { index, of: STEPS.length, title: s.title },
    replies: [
      ...(s.go ? [{ label: s.go.label, act: s.go.act }] : []),
      { label: 'Nasıl yapılır?', topic: 'build' },
      { label: 'Bu adımı geç', answer: pick('skip', SKIP_ANSWERS), skip: s.id },
      { label: 'Öğreticiyi kapat', answer: pick('tutorialOff', TUTORIAL_OFF_ANSWERS), tutorial: 'off' },
    ],
  }
}

function topicSpeech(t: Topic, c: AdvisorCtx): Speech {
  return {
    text: safe(() => t.text(c), []).join('\n\n'),
    replies: [...(t.go ? [{ label: t.go.label, act: t.go.act }] : []), { label: 'Başka bir şey sor', topic: '' }, { label: 'Teşekkürler', answer: '' }],
  }
}

const topicsSpeech = (pick: Pick): Speech => ({ text: pick('topics', TOPICS_ASK), replies: [{ label: 'Vazgeçtim', answer: '' }], topics: true })

// ---- The panel ----------------------------------------------------------------------------------------------------------

export function Advisor({
  storeKey,
  ctx,
  blocked,
  busy,
  aside = false,
  summon,
  onAct,
  onHint,
}: {
  storeKey: string
  ctx: AdvisorCtx
  // Another dialog is open: he waits (and steps aside if he is speaking).
  blocked: boolean
  // The lord is in the middle of something (placing buildings, aiming an army): he does not come on his own.
  busy: boolean
  // The lord is placing something on the map: what he is saying waits, so the map stays clear to click.
  aside?: boolean
  // Bumped when the lord calls him (the envoy button).
  summon: number
  onAct: (action: AdvisorAction) => void
  // The tab to make glow for the tutorial's step (null: none).
  onHint: (tab: string | null) => void
}) {
  const [memory, update] = useAdvisorMemory(storeKey)
  const [speech, setSpeech] = useState<Speech | null>(null)
  const pick = useCallback<Pick>((key, options) => pickLine(storeKey, key, options), [storeKey])
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  // A new lord starts with the tutorial on; a grown one with it off (he can turn it on in the settings).
  useEffect(() => {
    if (memory.tutorial === undefined) update({ tutorial: ctx.kingdom.buildings.length < 6 ? 'on' : 'off' })
    // Decided once per lord.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.tutorial])
  const tutorial = memory.tutorial === 'on'
  const stepIndex = tutorial ? stepFor(ctx, memory.skipped) : -1
  const step = stepIndex >= 0 ? STEPS[stepIndex] : null

  // The tutorial is done when every step is.
  useEffect(() => {
    if (tutorial && stepIndex < 0) {
      update({ tutorial: 'done' })
      if (!blocked) setSpeech({ text: pick('tutorialDone', TUTORIAL_DONE), replies: [{ label: 'Bana oyunu anlat', topic: '' }, { label: 'Sağ ol, elçi efendi', answer: '' }] })
    }
  }, [tutorial, stepIndex, blocked, update, pick])

  // The glowing tab for the step under way.
  useEffect(() => {
    onHint(step?.hint && !speech ? step.hint : null)
  }, [step, speech, onHint])
  useEffect(() => () => onHint(null), [onHint])

  // A step just done: he says so and goes on to the next (once the way is clear).
  const lastStep = useRef<number | null>(null)
  useEffect(() => {
    if (!tutorial) {
      lastStep.current = null
      return
    }
    if (blocked) return
    const prev = lastStep.current
    lastStep.current = stepIndex
    if (prev === null) {
      // First look (or the tutorial just turned on): the step under way, at once.
      if (stepIndex >= 0) setSpeech(stepSpeech(STEPS[stepIndex], stepIndex, ctxRef.current, pick))
      return
    }
    if (stepIndex !== prev && prev >= 0 && stepIndex >= 0) {
      const finished = STEPS[prev]
      const cheered = memory.cheered ?? []
      // A skipped step is not cheered.
      const cheer = cheered.includes(finished.id) || (memory.skipped ?? []).includes(finished.id) ? undefined : pick(`cheer:${finished.id}`, finished.cheers)
      update({ cheered: [...cheered, finished.id] })
      setSpeech(stepSpeech(STEPS[stepIndex], stepIndex, ctxRef.current, pick, cheer))
    }
    // memory.cheered and memory.skipped are read at the moment the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, stepIndex, blocked])

  // Called by the lord: the step under way, else his best advice, else a word or two.
  const lastSummon = useRef(summon)
  useEffect(() => {
    if (summon === lastSummon.current) return
    lastSummon.current = summon
    if (speech) return setSpeech(null)
    const c = ctxRef.current
    if (step) return setSpeech(stepSpeech(step, stepIndex, c, pick))
    const tip = tipFor(c, {})
    if (tip) {
      const said = tipSpeech(tip, c, pick)
      return setSpeech({ ...said, replies: [...said.replies.slice(0, 2), { label: 'Bana oyunu anlat', topic: '' }] })
    }
    const talk = pick('smallTalk', SMALL_TALK)
    setSpeech({
      text: pick('idle', IDLE_LINES),
      replies: [{ label: 'Bana oyunu anlat', topic: '' }, { label: talk.label, answer: pick(`talk:${talk.label}`, talk.answers) }, { label: 'Bir şey yok, sağ ol', answer: '' }],
    })
    // Only the button calls him.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summon])

  // Coming on his own: every few minutes of play while nothing else is open.
  const played = useRef(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || blocked || busy || speech || memory.muted) return
      played.current += 5
      if (played.current < ADVISOR_EVERY_MINUTES * 60) return
      const c = ctxRef.current
      if (step) {
        played.current = 0
        return setSpeech(stepSpeech(step, stepIndex, c, pick))
      }
      const tip = tipFor(c, memory.snoozed ?? {})
      if (tip) {
        played.current = 0
        setSpeech(tipSpeech(tip, c, pick))
      } else played.current = ADVISOR_EVERY_MINUTES * 60 * 0.75
    }, 5000)
    return () => clearInterval(id)
  }, [blocked, busy, speech, memory.muted, memory.snoozed, step, stepIndex, pick])

  const reply = (r: Reply) => {
    if (r.snooze && r.id) update({ snoozed: { ...(memory.snoozed ?? {}), [r.id]: ctxRef.current.now + r.snooze * 60_000 } })
    if (r.tutorial) update({ tutorial: r.tutorial })
    if (r.skip) update({ skipped: [...(memory.skipped ?? []), r.skip] })
    if (r.act) {
      setSpeech(null)
      onAct(r.act)
      return
    }
    if (r.topic !== undefined) {
      const topic = TOPICS.find((t) => t.id === r.topic)
      setSpeech(topic ? topicSpeech(topic, ctxRef.current) : topicsSpeech(pick))
      return
    }
    if (r.answer) setSpeech({ text: r.answer, replies: [{ label: 'Tamam', answer: '' }] })
    else setSpeech(null)
  }

  if (!speech || blocked || aside) return null
  return <Panel speech={speech} onReply={reply} onTopic={(t) => setSpeech(topicSpeech(t, ctxRef.current))} onClose={() => setSpeech(null)} />
}

function Panel({ speech, onReply, onTopic, onClose }: { speech: Speech; onReply: (r: Reply) => void; onTopic: (t: Topic) => void; onClose: () => void }) {
  const { shown, done, finish } = useTyping(speech.text)
  useBabble(speech.text, shown)
  const paragraphs = useMemo(() => [...speech.text].slice(0, shown).join('').split('\n\n'), [speech.text, shown])
  return (
    <section className="advisor frame" role="dialog" aria-label="Elçi" aria-live="polite">
      <div className="advisor-face">
        <EnvoyPortrait size={72} talking={!done} />
        <small>Elçi</small>
      </div>
      <div className="advisor-talk">
        <header>
          {speech.step ? (
            <small>
              <Icon name="book" size={16} /> Öğretici · {speech.step.index + 1}/{speech.step.of} · <b>{speech.step.title}</b>
            </small>
          ) : (
            <small>Elçinin sözü</small>
          )}
          <button className="btn icon-only" onClick={onClose} aria-label="Kapat" title="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="advisor-bubble" onClick={finish}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <span className="sr-only">{speech.text}</span>
        </div>
        {speech.topics && (
          <div className="advisor-topics">
            {TOPICS.map((t) => (
              <button key={t.id} className="btn small" onClick={() => onTopic(t)}>
                <Icon name={t.icon} size={16} /> {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="advisor-replies">
          {speech.replies.map((r, i) => (
            <button key={`${r.label}${i}`} className={i === 0 && (r.act || speech.replies.length === 1) ? 'btn small primary' : 'btn small'} onClick={() => onReply(r)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
