import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../icons'
import { EnvoyPortrait } from './EnvoyPortrait'
import {
  ADVISOR_EVERY_MINUTES, IDLE_LINES, LATER, LATER_ANSWERS, SMALL_TALK, SNOOZE_MINUTES, STEPS, TIPS, TOPICS, TUTORIAL_DONE,
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

function useTyping(text: string) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(text.length)
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const n = Math.min(text.length, Math.floor(((now - start) / 1000) * CHARS_PER_SECOND))
      setShown(n)
      if (n < text.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text])
  return { shown, done: shown >= text.length, finish: () => setShown(text.length) }
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

function tipSpeech(t: Tip, c: AdvisorCtx, seed: number): Speech {
  const later = seed % LATER.length
  return {
    text: safe(() => t.say(c), ''),
    replies: [
      ...(t.go ? [{ label: t.go.label, act: t.go.act }] : []),
      { label: LATER[later], answer: LATER_ANSWERS[seed % LATER_ANSWERS.length], snooze: t.snooze ?? SNOOZE_MINUTES, id: t.id },
      ...(t.joke ? [{ label: t.joke[0], answer: t.joke[1], snooze: t.snooze ?? SNOOZE_MINUTES, id: t.id }] : []),
    ],
  }
}

function stepSpeech(s: Step, index: number, c: AdvisorCtx, cheer?: string): Speech {
  return {
    text: `${cheer ? `${cheer}\n\n` : ''}${safe(() => s.say(c), '')}`,
    step: { index, of: STEPS.length, title: s.title },
    replies: [
      ...(s.go ? [{ label: s.go.label, act: s.go.act }] : []),
      { label: 'Nasıl yapılır?', topic: 'build' },
      { label: 'Bu adımı geç', answer: 'Peki lordum, o işi şimdilik bir kenara koyuyorum. Sıradakine geçelim.', skip: s.id },
      { label: 'Öğreticiyi kapat', answer: 'Peki lordum, artık kendi yolunuzu çiziyorsunuz. Bir şey sormak isterseniz sohbetin yanındaki Elçi düğmesi beni çağırır.', tutorial: 'off' },
    ],
  }
}

function topicSpeech(t: Topic, c: AdvisorCtx): Speech {
  return {
    text: safe(() => t.text(c), []).join('\n\n'),
    replies: [...(t.go ? [{ label: t.go.label, act: t.go.act }] : []), { label: 'Başka bir şey sor', topic: '' }, { label: 'Teşekkürler', answer: '' }],
  }
}

const topicsSpeech = (): Speech => ({ text: 'Ne öğrenmek istersiniz, lordum? Bilmediğim şey yok; olsa da söylemem.', replies: [{ label: 'Vazgeçtim', answer: '' }], topics: true })

// ---- The panel ----------------------------------------------------------------------------------------------------------

export function Advisor({
  storeKey,
  ctx,
  blocked,
  busy,
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
  // Bumped when the lord calls him (the envoy button).
  summon: number
  onAct: (action: AdvisorAction) => void
  // The tab to make glow for the tutorial's step (null: none).
  onHint: (tab: string | null) => void
}) {
  const [memory, update] = useAdvisorMemory(storeKey)
  const [speech, setSpeech] = useState<Speech | null>(null)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const said = useRef(0)
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
      if (!blocked) setSpeech({ text: TUTORIAL_DONE, replies: [{ label: 'Bana oyunu anlat', topic: '' }, { label: 'Sağ ol, elçi efendi', answer: '' }] })
    }
  }, [tutorial, stepIndex, blocked, update])

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
      if (stepIndex >= 0) setSpeech(stepSpeech(STEPS[stepIndex], stepIndex, ctxRef.current))
      return
    }
    if (stepIndex !== prev && prev >= 0 && stepIndex >= 0) {
      const finished = STEPS[prev]
      const cheered = memory.cheered ?? []
      // A skipped step is not cheered.
      const cheer = cheered.includes(finished.id) || (memory.skipped ?? []).includes(finished.id) ? undefined : finished.cheer
      update({ cheered: [...cheered, finished.id] })
      setSpeech(stepSpeech(STEPS[stepIndex], stepIndex, ctxRef.current, cheer))
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
    said.current++
    if (step) return setSpeech(stepSpeech(step, stepIndex, c))
    const tip = tipFor(c, {})
    if (tip) return setSpeech({ ...tipSpeech(tip, c, said.current), replies: [...tipSpeech(tip, c, said.current).replies.slice(0, 2), { label: 'Bana oyunu anlat', topic: '' }] })
    setSpeech({ text: IDLE_LINES[said.current % IDLE_LINES.length], replies: [{ label: 'Bana oyunu anlat', topic: '' }, SMALL_TALK[said.current % SMALL_TALK.length], { label: 'Bir şey yok, sağ ol', answer: '' }] })
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
      said.current++
      if (step) {
        played.current = 0
        return setSpeech(stepSpeech(step, stepIndex, c))
      }
      const tip = tipFor(c, memory.snoozed ?? {})
      if (tip) {
        played.current = 0
        setSpeech(tipSpeech(tip, c, said.current))
      } else played.current = ADVISOR_EVERY_MINUTES * 60 * 0.75
    }, 5000)
    return () => clearInterval(id)
  }, [blocked, busy, speech, memory.muted, memory.snoozed, step, stepIndex])

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
      setSpeech(topic ? topicSpeech(topic, ctxRef.current) : topicsSpeech())
      return
    }
    if (r.answer) setSpeech({ text: r.answer, replies: [{ label: 'Tamam', answer: '' }] })
    else setSpeech(null)
  }

  if (!speech || blocked) return null
  return <Panel speech={speech} onReply={reply} onTopic={(t) => setSpeech(topicSpeech(t, ctxRef.current))} onClose={() => setSpeech(null)} />
}

function Panel({ speech, onReply, onTopic, onClose }: { speech: Speech; onReply: (r: Reply) => void; onTopic: (t: Topic) => void; onClose: () => void }) {
  const { shown, done, finish } = useTyping(speech.text)
  const paragraphs = useMemo(() => speech.text.slice(0, shown).split('\n\n'), [speech.text, shown])
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
