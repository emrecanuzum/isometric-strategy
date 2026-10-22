import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../icons'
import { babble } from '../../audio/sfx'
import { EnvoyPortrait } from './EnvoyPortrait'
import { L } from '../../lib/i18n'
import {
  ADVISOR_EVERY_MINUTES, IDLE_LINES, LATER, LATER_ANSWERS, SKIP_ANSWERS, SHOWN_MINUTES, SMALL_TALK, SNOOZE_MINUTES, STEPS, TIPS, TOPICS, TOPICS_ASK, TUTORIAL_DONE,
  TOPIC_GROUPS, TUTORIAL_OFF_ANSWERS, wealthAdvice, wellStocked,
} from './lines'
import type { AdvisorAction, AdvisorCtx, Reply, Step, Tip, Topic } from './lines'
import { GOSSIP, tipKind } from './gossip'

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
  // When he last brought up each tip (ms), so that he changes the subject.
  heard?: Record<string, number>
  // When he last reminded the lord of each tutorial step on his own (ms).
  stepAt?: Record<string, number>
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
  const done = memory.tutorial === 'done'
  return (
    <div className="settings-list">
      <div className="settings-row">
        <div>
          <b>
            <Icon name="scroll" size={16} /> {L('Elçinin öğütleri', "The envoy's counsel")}
          </b>
          <small>{L('Açıkken elçi birkaç dakikada bir gelip eksiklerine göre öğüt verir; kapalıyken yalnızca elçi düğmesiyle çağırınca gelir.', 'When on, the envoy drops by every few minutes with advice on what you lack; when off, he comes only when called with the envoy button.')}</small>
        </div>
        <button className="btn small" aria-pressed={!memory.muted} onClick={() => update({ muted: !memory.muted })}>
          {memory.muted ? L('Kapalı', 'Off') : L('Açık', 'On')}
        </button>
      </div>
      <div className="settings-row">
        <div>
          <b>
            <Icon name="book" size={16} /> {L('Öğretici', 'Tutorial')}
          </b>
          <small>{L('Yeni bir lordu adım adım kuruluştan 5. seviye saraya götürür; bütün adımları zaten geçtiysen açılınca hemen tamamlanır.', 'Walks a new lord step by step from founding to a level 5 palace; if you have already passed every step, it completes as soon as it is turned on.')}</small>
        </div>
        <button
          className="btn small"
          aria-pressed={memory.tutorial === 'on'}
          disabled={done}
          data-why={L('Öğretici tamamlandı', 'Tutorial completed')}
          onClick={() => update(memory.tutorial === 'on' ? { tutorial: 'off' } : { tutorial: 'on', cheered: [], skipped: [] })}
        >
          {memory.tutorial === 'on' ? L('Açık', 'On') : done ? L('Tamamlandı', 'Completed') : L('Kapalı', 'Off')}
        </button>
      </div>
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

export function useTyping(text: string) {
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
export function useBabble(text: string, shown: number, pitch = 1) {
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
        babble(chars.slice(Math.max(0, i - 2), i + 1).join(''), question, pitch)
        m.letters = 0
        m.at = now
        m.every = 2 + ((i * 7) % 2)
      }
    }
  }, [text, shown, pitch])
}

// ---- What he says -----------------------------------------------------------------------------------------------------

interface Speech {
  text: string
  replies: Reply[]
  // Shown under the text: a step of the tutorial, or the list of topics.
  step?: { index: number; of: number; title: string }
  topics?: boolean
  // A topic told page by page: all its pages (worked out once, so the count holds while paging) and the one shown,
  // which is `text`.
  page?: { topic: Topic; pages: string[]; index: number }
}

const safe = <T,>(f: () => T, fallback: T): T => {
  try {
    return f()
  } catch {
    return fallback
  }
}

// A tip said this recently is not said again (unless nothing else is true), and an urgent one comes back sooner.
const HEARD_MINUTES = 20
const URGENT_MINUTES = 5
// A tutorial step under way is brought up on his own at most this often; in between he talks of other things (he
// used to say the same step every few minutes, and a lord waiting on a palace upgrade heard of nothing else).
const STEP_MINUTES = 12
// Tips that only repeat a tutorial step: not brought up while that step is under way.
const STEP_TIPS: Record<string, string[]> = {
  fealty: ['liege'], palace2: ['palaceUp'], palace3: ['palaceUp'], palace4: ['palaceUp'], palace5: ['palaceUp'],
  barracks: ['barracks'], queen: ['queen'], spy: ['spyHouse'], lumber: ['noLumber'], house: ['noHouse'], farm: ['noFarm'], trade: ['noGood'],
}

// What he brings up: anything urgent first; otherwise the subject he has talked about least lately (the economy, the
// court, the crowns, the lords, spies, the army, the wilds…), and within it the first true tip in order of weight.
// He does not harp on one thing: a tip heard in the last minutes waits while there is anything else to say.
function chooseTip(c: AdvisorCtx, snoozed: Record<string, number>, heard: Record<string, number>, step?: Step | null): Tip | null {
  const except = step ? STEP_TIPS[step.id] ?? [] : []
  const all = [...TIPS, ...GOSSIP].filter((t) => !except.includes(t.id) && (snoozed[t.id] ?? 0) <= c.now && safe(() => t.when(c), false))
  if (all.length === 0) return null
  const urgent = all.find((t) => tipKind(t.id) === 'urgent' && (heard[t.id] ?? 0) < c.now - URGENT_MINUTES * 60_000)
  if (urgent) return urgent
  const fresh = all.filter((t) => (heard[t.id] ?? 0) < c.now - HEARD_MINUTES * 60_000)
  const pool = fresh.length > 0 ? fresh : [...all].sort((a, b) => (heard[a.id] ?? 0) - (heard[b.id] ?? 0))
  const kindAt: Record<string, number> = {}
  for (const [id, at] of Object.entries(heard)) kindAt[tipKind(id)] = Math.max(kindAt[tipKind(id)] ?? 0, at)
  return [...pool].sort((a, b) => (kindAt[tipKind(a.id)] ?? 0) - (kindAt[tipKind(b.id)] ?? 0))[0]
}

// Heard now (older entries are dropped, the memory stays small).
const hear = (heard: Record<string, number> | undefined, id: string, now: number) => ({
  ...Object.fromEntries(Object.entries(heard ?? {}).filter(([, at]) => at > now - 2 * 3_600_000)),
  [id]: now,
})
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
      { label: L('Nasıl yapılır?', 'How do I do it?'), topic: 'build' },
      { label: L('Bu adımı geç', 'Skip this step'), answer: pick('skip', SKIP_ANSWERS), skip: s.id },
      { label: L('Öğreticiyi kapat', 'Turn off the tutorial'), answer: pick('tutorialOff', TUTORIAL_OFF_ANSWERS), tutorial: 'off' },
    ],
  }
}

function topicSpeech(t: Topic, c: AdvisorCtx): Speech {
  const pages = safe(() => t.pages(c), []).filter((p) => p)
  return turnPage({ text: '', replies: [], page: { topic: t, pages: pages.length ? pages : ['…'], index: 0 } }, 0)
}

// The same talk at another page. The topic's own button and "ask something else" stay on every page (the lord may
// act or leave at any point); the thanks that closes it waits for the last page.
function turnPage(s: Speech, index: number): Speech {
  if (!s.page) return s
  const { topic: t, pages } = s.page
  const i = Math.max(0, Math.min(pages.length - 1, index))
  return {
    text: pages[i],
    page: { ...s.page, index: i },
    replies: [
      ...(t.go ? [{ label: t.go.label, act: t.go.act }] : []),
      { label: L('Başka bir şey sor', 'Ask something else'), topic: '' },
      ...(i === pages.length - 1 ? [{ label: L('Teşekkürler', 'Thank you'), answer: '' }] : []),
    ],
  }
}

const topicsSpeech = (pick: Pick): Speech => ({ text: pick('topics', TOPICS_ASK), replies: [{ label: L('Vazgeçtim', 'Never mind'), answer: '' }], topics: true })

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
      if (!blocked) setSpeech({ text: pick('tutorialDone', TUTORIAL_DONE), replies: [{ label: L('Bana oyunu anlat', 'Tell me about the game'), topic: '' }, { label: L('Sağ ol, elçi efendi', 'Thank you, master envoy'), answer: '' }] })
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
      // Not again on every reload: only if he has not brought this step up lately.
      if (stepIndex >= 0 && (memory.stepAt?.[STEPS[stepIndex].id] ?? 0) < ctxRef.current.now - STEP_MINUTES * 60_000) {
        update({ stepAt: { ...(memory.stepAt ?? {}), [STEPS[stepIndex].id]: ctxRef.current.now } })
        setSpeech(stepSpeech(STEPS[stepIndex], stepIndex, ctxRef.current, pick))
      }
      return
    }
    if (stepIndex !== prev && prev >= 0 && stepIndex >= 0) {
      const finished = STEPS[prev]
      const cheered = memory.cheered ?? []
      // A skipped step is not cheered.
      const cheer = cheered.includes(finished.id) || (memory.skipped ?? []).includes(finished.id) ? undefined : pick(`cheer:${finished.id}`, finished.cheers)
      update({ cheered: [...cheered, finished.id], stepAt: { ...(memory.stepAt ?? {}), [STEPS[stepIndex].id]: ctxRef.current.now } })
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
    // Called, he keeps to what "later" put off only for advice he would repeat; and changes the subject each time.
    const tip = chooseTip(c, memory.snoozed ?? {}, memory.heard ?? {}) ?? chooseTip(c, {}, memory.heard ?? {})
    if (tip) update({ heard: hear(memory.heard, tip.id, c.now) })
    // With stores filling up, the lord may ask what to do with them.
    const wealth: Reply | null = wellStocked(c) ? { label: L('Dolu ambarları ve hazineyi ne yapalım?', 'What shall we do with the full storehouses and treasury?'), say: wealthAdvice(c, pick), quiet: true } : null
    if (tip) {
      const said = tipSpeech(tip, c, pick)
      return setSpeech({ ...said, replies: [...said.replies.slice(0, 2), ...(wealth ? [wealth] : []), { label: L('Bana oyunu anlat', 'Tell me about the game'), topic: '' }] })
    }
    const talk = pick('smallTalk', SMALL_TALK)
    setSpeech({
      text: pick('idle', IDLE_LINES),
      replies: [...(wealth ? [wealth] : []), { label: L('Bana oyunu anlat', 'Tell me about the game'), topic: '' }, { label: talk.label, answer: pick(`talk:${talk.label}`, talk.answers), quiet: true }, { label: L('Bir şey yok, sağ ol', 'Nothing, thank you'), answer: '' }],
    })
    // Only the button calls him.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summon])

  // Coming on his own: every few minutes of play. The minutes count while a tab or a dialog is open too (players spend
  // much of their time in the tabs, and he never came); he only waits for them to close before he speaks.
  const played = useRef(0)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || speech || memory.muted) return
      played.current += 5
      if (played.current < ADVISOR_EVERY_MINUTES * 60 || blocked || busy) return
      const c = ctxRef.current
      if (step && (memory.stepAt?.[step.id] ?? 0) < c.now - STEP_MINUTES * 60_000) {
        played.current = 0
        update({ stepAt: { ...(memory.stepAt ?? {}), [step.id]: c.now } })
        return setSpeech(stepSpeech(step, stepIndex, c, pick))
      }
      const tip = chooseTip(c, memory.snoozed ?? {}, memory.heard ?? {}, step)
      if (tip) {
        played.current = 0
        update({ snoozed: { ...(memory.snoozed ?? {}), [tip.id]: Math.max(memory.snoozed?.[tip.id] ?? 0, c.now + SHOWN_MINUTES * 60_000) }, heard: hear(memory.heard, tip.id, c.now) })
        setSpeech(tipSpeech(tip, c, pick))
      } else played.current = ADVISOR_EVERY_MINUTES * 60 * 0.75
    }, 5000)
    return () => clearInterval(id)
  }, [blocked, busy, speech, memory.muted, memory.snoozed, memory.heard, memory.stepAt, step, stepIndex, pick, update])

  const reply = (r: Reply) => {
    if (r.snooze && r.id) update({ snoozed: { ...(memory.snoozed ?? {}), [r.id]: ctxRef.current.now + r.snooze * 60_000 } })
    if (r.tutorial) update({ tutorial: r.tutorial })
    if (r.skip) update({ skipped: [...(memory.skipped ?? []), r.skip] })
    if (r.act) {
      setSpeech(null)
      onAct(r.act)
      return
    }
    if (r.say) {
      setSpeech(r.say)
      return
    }
    if (r.topic !== undefined) {
      const topic = TOPICS.find((t) => t.id === r.topic)
      setSpeech(topic ? topicSpeech(topic, ctxRef.current) : topicsSpeech(pick))
      return
    }
    if (r.answer) setSpeech({ text: r.answer, replies: [{ label: L('Tamam', 'Very well'), answer: '' }] })
    else setSpeech(null)
  }

  if (!speech || blocked || aside) return null
  return (
    <Panel
      speech={speech}
      onReply={reply}
      onTopic={(t) => setSpeech(topicSpeech(t, ctxRef.current))}
      onPage={(i) => setSpeech((s) => (s ? turnPage(s, i) : s))}
      onClose={() => setSpeech(null)}
    />
  )
}

function Panel({
  speech,
  onReply,
  onTopic,
  onPage,
  onClose,
}: {
  speech: Speech
  onReply: (r: Reply) => void
  onTopic: (t: Topic) => void
  onPage: (index: number) => void
  onClose: () => void
}) {
  const typing = useTyping(speech.text)
  // The typing hook resets after the render that brings a new text (a new page): until it has, that render would show
  // the old page's count of letters of the new one, so a new text starts from nothing here.
  const typed = useRef(speech.text)
  const fresh = typed.current !== speech.text
  useEffect(() => {
    typed.current = speech.text
  }, [speech.text])
  const shown = fresh ? 0 : typing.shown
  const done = !fresh && typing.done
  useBabble(speech.text, shown)
  const paragraphs = useMemo(() => [...speech.text].slice(0, shown).join('').split('\n\n'), [speech.text, shown])
  // A new page starts at the top of the parchment.
  const bubble = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bubble.current?.scrollTo?.({ top: 0 })
  }, [speech.text])
  const page = speech.page
  const last = !page || page.index >= page.pages.length - 1
  // A tap on the parchment shows the whole page, and once it is all there, turns to the next one.
  const tap = () => (!done ? typing.finish() : !last && page ? onPage(page.index + 1) : undefined)
  // Kept plain: the answers to what he said as buttons; "Bana oyunu anlat" a book by the close button; side questions
  // (what to do with full stores, a word of small talk) small links under the answers.
  const guide = speech.replies.find((r) => r.topic === '')
  const asides = speech.replies.filter((r) => r.quiet && r !== guide)
  const answers = speech.replies.filter((r) => !r.quiet && r !== guide)
  return (
    <section className="advisor frame" role="dialog" aria-label={L('Elçi', 'Envoy')} aria-live="polite">
      <div className="advisor-face">
        <EnvoyPortrait size={72} talking={!done} />
        <small>{L('Elçi', 'Envoy')}</small>
      </div>
      <div className="advisor-talk">
        <header>
          {speech.step ? (
            <small>
              <Icon name="book" size={16} /> {L('Öğretici', 'Tutorial')} · {speech.step.index + 1}/{speech.step.of} · <b>{speech.step.title}</b>
            </small>
          ) : page ? (
            <small>
              <Icon name={page.topic.icon} size={16} /> {L('Bana oyunu anlat', 'Tell me about the game')} · <b>{page.topic.name}</b>
            </small>
          ) : (
            <small>{L('Elçinin sözü', "The envoy's word")}</small>
          )}
          <span className="advisor-tools">
            {guide && (
              <button className="btn icon-only" onClick={() => onReply(guide)} aria-label={guide.label} title={guide.label}>
                <Icon name="book" size={16} />
              </button>
            )}
            <button className="btn icon-only" onClick={onClose} aria-label={L('Kapat', 'Close')} title={L('Kapat', 'Close')}>
              <Icon name="close" size={16} />
            </button>
          </span>
        </header>
        <div className="advisor-bubble" ref={bubble} onClick={tap}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <span className="sr-only">{speech.text}</span>
        </div>
        {speech.topics && (
          <div className="advisor-topics">
            {TOPIC_GROUPS.map((g) => {
              const list = TOPICS.filter((t) => t.group === g.id)
              return list.length ? (
                <section key={g.id}>
                  <h4>{g.name}</h4>
                  <div className="advisor-topic-grid">
                    {list.map((t) => (
                      <button key={t.id} className="btn small" onClick={() => onTopic(t)}>
                        <Icon name={t.icon} size={16} /> {t.name}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null
            })}
          </div>
        )}
        <div className="advisor-replies">
          {page && page.pages.length > 1 && (
            <div className="advisor-pager">
              <button className="btn small" onClick={() => onPage(page.index - 1)} disabled={page.index === 0} data-why={L('Bu ilk sayfa', 'This is the first page')}>
                ‹ {L('Geri', 'Back')}
              </button>
              <span>
                {page.index + 1} / {page.pages.length}
              </span>
              <button className={last ? 'btn small' : 'btn small primary'} onClick={() => onPage(page.index + 1)} disabled={last} data-why={L('Bu son sayfa', 'This is the last page')}>
                {L('İleri', 'Next')} ›
              </button>
            </div>
          )}
          {answers.map((r, i) => (
            <button
              key={`${r.label}${i}`}
              className={last && i === 0 && (r.act || answers.length === 1) ? 'btn small primary' : 'btn small'}
              onClick={() => onReply(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {asides.length > 0 && (
          <div className="advisor-asides">
            {asides.map((r, i) => (
              <button key={`${r.label}${i}`} className="advisor-aside" onClick={() => onReply(r)}>
                {r.label} ›
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
