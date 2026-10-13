import { gameTime } from '@game/shared'
import type { EconomyEvent, Good, Kingdom, Resource, Stock } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IconName } from '../icons'
import { BUILDING_NAMES, FORTUNE_TEXTS, RESEARCH_NAMES, RESOURCE_NAMES, SCOPE_NAMES } from '../names'

// The envoy's journal: what happened in the kingdom, told as short dispatches. Single events (a building done, the
// merchant coming back empty) are written at once; everything else is gathered into one report per day.
// A prototype "day" is REPORT_ROUNDS production rounds, so reports come at a readable pace.

export const REPORT_ROUNDS = 6
const KEEP_ENTRIES = 60
const KEEP_HISTORY = 24

// 'fortune' and 'envoy' entries stand out on their own paper: the day's random events, and the envoy's news from
// other kingdoms.
export type Tone = 'good' | 'bad' | 'info' | 'fortune' | 'envoy'

export interface Entry {
  id: number
  at: number
  day: number
  tone: Tone
  icon: IconName
  title: string
  text?: string
  // Bad news that touches the kingdom (shown again under "Önemli"); entries from before the flag count when bad.
  important?: boolean
}

export const isImportant = (e: Entry) => e.important ?? e.tone === 'bad'

// Important entries are kept longer than the rest.
const KEEP_IMPORTANT = 80

export interface Journal {
  day: number
  entries: Entry[]
  // Entries written since the journal was last opened.
  unread: number
  nextId: number
  // What has come in during the current day.
  tally: { rounds: number; produced: Partial<Stock>; tradeGold: number; trips: number; emptyTrip: boolean; wasted?: Partial<Stock> }
  // Stores after each production round, oldest first, for the storehouse charts.
  history: Stock[]
  // The envoy's notices already written down.
  notices?: number[]
  // The newest important entry the player has looked at under "Önemli" (entries after it count as unread there).
  importantSeen?: number
  // The stores that have been overflowing since it was last reported: told once, again only after they have had room.
  overflowing?: string[]
}

export const unreadImportant = (j: Journal) => j.entries.filter((e) => isImportant(e) && e.id > (j.importantSeen ?? 0)).length

const fresh = (): Journal => ({
  day: 1,
  entries: [],
  unread: 0,
  nextId: 1,
  tally: { rounds: 0, produced: {}, tradeGold: 0, trips: 0, emptyTrip: false },
  history: [],
})

const fmt = (v: number) => Math.round(v).toLocaleString('tr-TR')
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`

// Entries are filed under the game day (1 day = 1 real hour, see gameTime) they were written on, counted from the
// start of the lobby's season.
function write(j: Journal, seasonStart: number, at: number, entry: Omit<Entry, 'id' | 'at' | 'day'>): Journal {
  const next: Entry = { id: j.nextId, at, day: gameTime(at, seasonStart).day, ...entry }
  if (next.important === undefined && next.tone === 'bad') next.important = true
  // The latest entries, and the important ones further back.
  let plain = 0
  let kept = 0
  const entries = [next, ...j.entries].filter((e) => (isImportant(e) ? ++kept <= KEEP_IMPORTANT : ++plain <= KEEP_ENTRIES))
  return { ...j, nextId: j.nextId + 1, unread: j.unread + 1, entries }
}

// Folds the events of one clock tick into the journal.
export function record(j: Journal, events: EconomyEvent[], kingdom: Kingdom, at: number, seasonStart: number): Journal {
  for (const event of events) {
    if (event.kind === 'built') {
      const level = event.building.level ?? 1
      j = write(j, seasonStart, at, {
        tone: 'good',
        icon: 'build',
        title: level > 1 ? `${BUILDING_NAMES[event.building.kind]} ${level}. seviyeye yükseldi` : `${BUILDING_NAMES[event.building.kind]} tamamlandı`,
        text: level > 1 ? 'Ustalar yükseltmeyi bitirdi; yapı daha çok üretiyor.' : 'Ustalar işini bitirdi, yapı hizmete girdi.',
      })
    } else if (event.kind === 'trade') {
      const tally = { ...j.tally, tradeGold: j.tally.tradeGold + event.gold, trips: j.tally.trips + 1 }
      // An empty trip is told once a day, not every time the merchant comes back.
      if (event.sold === 0 && !j.tally.emptyTrip) {
        j = write({ ...j, tally: { ...tally, emptyTrip: true } }, seasonStart, at, {
          tone: 'bad',
          icon: 'warn',
          title: event.damaged ? 'Ticaret noktası harap' : event.walledIn ? 'Tüccar surların içinde kaldı' : 'Tüccar eli boş döndü',
          text: event.damaged
            ? 'Yağmacılar ticaret noktasını harap etti; onarılana kadar tüccar satış yapamaz. Ticaret sekmesinden onar.'
            : event.walledIn
            ? 'Saraydan ticaret noktasına sur kapısı olmadan yol yok. Sura bir kapı yap ya da bir parçasını yık.'
            : `Depoda satacak ${RESOURCE_NAMES[event.good].toLowerCase()} kalmadı. Başka bir mal seç ya da üretimi artır.`,
        })
      } else j = { ...j, tally }
    } else if (event.kind === 'trained') {
      j = write(j, seasonStart, at, { tone: 'good', icon: 'people', title: `${event.count} savaşçı eğitimini bitirdi`, text: 'Askerler sarayda garnizonda bekliyor.' })
    } else if (event.kind === 'wasted') {
      const wasted = { ...(j.tally.wasted ?? {}) }
      for (const [g, v] of Object.entries(event.lost)) wasted[g as Resource] = (wasted[g as Resource] ?? 0) + (v ?? 0)
      j = { ...j, tally: { ...j.tally, wasted } }
    } else if (event.kind === 'researched') {
      const r = RESEARCH_NAMES[event.id]
      j = write(j, seasonStart, at, { tone: 'good', icon: r?.icon ?? 'book', title: `Üniversite: ${r?.name ?? event.id} öğrenildi`, text: r?.note })
    } else if (event.kind === 'fortune') {
      const f = FORTUNE_TEXTS[event.fortune]
      const extra = [
        ...Object.entries(event.lost ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} kayboldu`),
        ...(event.gold ? [`+${fmt(event.gold)} altın`] : []),
      ]
      const minutes = Math.max(1, Math.round((event.until - at) / 60_000))
      j = write(j, seasonStart, at, {
        important: f?.tone === 'bad',
        tone: 'fortune',
        icon: f?.icon ?? 'star',
        title: `${f?.title ?? 'Beklenmedik bir olay'} · ${SCOPE_NAMES[event.scope ?? 'kingdom']}`,
        text: [f?.text, ...extra, `Yaklaşık ${minutes} dk sürecek.`].filter(Boolean).join(' '),
      })
    } else if (event.kind === 'spy') {
      j = write(j, seasonStart, at, { tone: 'info', icon: 'lock', title: 'Casus evi yeni bir casus yetiştirdi' })
    } else {
      if (event.kind !== 'produced') continue
      const produced = { ...j.tally.produced }
      for (const [r, v] of Object.entries(event.delta)) produced[r as Resource] = (produced[r as Resource] ?? 0) + (v ?? 0)
      j = { ...j, tally: { ...j.tally, rounds: j.tally.rounds + 1, produced }, history: [...j.history, { ...kingdom.stock }].slice(-KEEP_HISTORY) }
      if (j.tally.rounds >= REPORT_ROUNDS) j = closeDay(j, kingdom, at, seasonStart)
    }
  }
  return j
}

// The daily report: what the land gave, what the merchant brought, and anything running low.
function closeDay(j: Journal, kingdom: Kingdom, at: number, seasonStart: number): Journal {
  const { produced, tradeGold, trips } = j.tally
  const goods: Good[] = ['food', 'materials', 'arms']
  const lines = goods
    .filter((g) => Math.abs(produced[g] ?? 0) >= 0.5)
    .map((g) => `${RESOURCE_NAMES[g]} ${signed(produced[g] ?? 0)}`)
  if (trips > 0) lines.push(`Tüccar ${trips} sefer, ${signed(tradeGold)} altın`)
  const hungry = (produced.food ?? 0) < 0
  j = write(j, seasonStart, at, {
    tone: hungry ? 'bad' : 'info',
    icon: 'scroll',
    title: 'Elçi raporu',
    text: lines.length > 0 ? lines.join(' · ') : 'Sakin bir gün; ne üretim ne ticaret.',
  })
  if (hungry) {
    const rounds = Math.floor(kingdom.stock.food / Math.max(0.01, -(produced.food ?? 0) / REPORT_ROUNDS))
    j = write(j, seasonStart, at, {
      tone: 'bad',
      icon: 'warn',
      title: 'Ambar azalıyor',
      text: `Halk ürettiğinden fazla yiyor. Bu gidişle yemek yaklaşık ${rounds} tur sonra biter; tarla kur.`,
    })
  }
  // Full stores: what was lost this day.
  const wasted = Object.entries(j.tally.wasted ?? {}).filter(([, v]) => (v ?? 0) >= 1)
  // Only stores that were not already overflowing are news; a store that had room all day is forgotten.
  const already = new Set(j.overflowing ?? [])
  const news = wasted.filter(([g]) => !already.has(g))
  j = { ...j, overflowing: wasted.map(([g]) => g) }
  if (news.length > 0) {
    j = write(j, seasonStart, at, {
      tone: 'bad',
      icon: 'chest',
      title: 'Ambar dolu',
      text: `Depoya sığmayan ${news.map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Resource].toLowerCase()}`).join(', ')} boşa gitti. Ambar ya da hazine kur, yükselt; fazlasını sat ya da harca.`,
    })
  }
  return { ...j, day: j.day + 1, tally: { rounds: 0, produced: {}, tradeGold: 0, trips: 0, emptyTrip: false } }
}

// Kept in this browser per lobby; the kingdom itself is on the server.
export function useJournal(key: string, seasonStart: number) {
  const [journal, setJournal] = useState<Journal>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const saved = { ...fresh(), ...(JSON.parse(raw) as Journal) }
        // Journals written before full stores were told only once: keep the newest of those reports.
        let kept = false
        const entries = saved.entries.filter((e) => e.title !== 'Ambar dolu' || (!kept && (kept = true)))
        return { ...saved, entries }
      }
    } catch {
      // Unreadable or unavailable storage: start a new journal.
    }
    return fresh()
  })
  const ref = useRef(journal)
  ref.current = journal
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(journal))
    } catch {
      // Not remembered in private mode.
    }
  }, [key, journal])
  const update = useCallback((change: (j: Journal) => Journal) => {
    ref.current = change(ref.current)
    setJournal(ref.current)
  }, [])
  const api = useMemo(
    () => ({
      record: (events: EconomyEvent[], kingdom: Kingdom, at: number) => {
        if (events.length > 0) update((j) => record(j, events, kingdom, at, seasonStart))
      },
      markRead: () => {
        if (ref.current.unread > 0) update((j) => ({ ...j, unread: 0 }))
      },
      reset: () => update(() => fresh()),
      markImportantRead: () => {
        const newest = ref.current.entries.find(isImportant)?.id ?? 0
        if (newest > (ref.current.importantSeen ?? 0)) update((j) => ({ ...j, importantSeen: newest }))
      },
      // News the envoy brought (from the lobby's notices), each written once.
      notice: (id: number, at: number, entry: Omit<Entry, 'id' | 'at' | 'day' | 'tone'>) => {
        if (ref.current.notices?.includes(id)) return
        update((j) => ({ ...write(j, seasonStart, at, { ...entry, tone: 'envoy' }), notices: [id, ...(j.notices ?? [])].slice(0, 200) }))
      },
    }),
    [update, seasonStart],
  )
  return { journal, ...api }
}
