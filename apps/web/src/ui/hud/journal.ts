import { gameTime } from '@game/shared'
import type { EconomyEvent, Good, Kingdom, Resource, Stock } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IconName } from '../icons'
import { BUILDING_NAMES, RESOURCE_NAMES } from '../names'

// The envoy's journal: what happened in the kingdom, told as short dispatches. Single events (a building done, the
// merchant coming back empty) are written at once; everything else is gathered into one report per day.
// A prototype "day" is REPORT_ROUNDS production rounds, so reports come at a readable pace.

export const REPORT_ROUNDS = 6
const KEEP_ENTRIES = 60
const KEEP_HISTORY = 24

export type Tone = 'good' | 'bad' | 'info'

export interface Entry {
  id: number
  at: number
  day: number
  tone: Tone
  icon: IconName
  title: string
  text?: string
}

export interface Journal {
  day: number
  entries: Entry[]
  // Entries written since the journal was last opened.
  unread: number
  nextId: number
  // What has come in during the current day.
  tally: { rounds: number; produced: Partial<Stock>; tradeGold: number; trips: number; emptyTrip: boolean }
  // Stores after each production round, oldest first, for the storehouse charts.
  history: Stock[]
}

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
  const next = { id: j.nextId, at, day: gameTime(at, seasonStart).day, ...entry }
  return { ...j, nextId: j.nextId + 1, unread: j.unread + 1, entries: [next, ...j.entries].slice(0, KEEP_ENTRIES) }
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
          title: 'Tüccar eli boş döndü',
          text: `Depoda satacak ${RESOURCE_NAMES[event.good].toLowerCase()} kalmadı. Başka bir mal seç ya da üretimi artır.`,
        })
      } else j = { ...j, tally }
    } else if (event.kind === 'trained') {
      j = write(j, seasonStart, at, { tone: 'good', icon: 'people', title: `${event.count} savaşçı eğitimini bitirdi`, text: 'Askerler sarayda garnizonda bekliyor.' })
    } else if (event.kind === 'spy') {
      j = write(j, seasonStart, at, { tone: 'info', icon: 'lock', title: 'Casus evi yeni bir casus yetiştirdi' })
    } else {
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
  return { ...j, day: j.day + 1, tally: { rounds: 0, produced: {}, tradeGold: 0, trips: 0, emptyTrip: false } }
}

// Kept in this browser per lobby; the kingdom itself is on the server.
export function useJournal(key: string, seasonStart: number) {
  const [journal, setJournal] = useState<Journal>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return { ...fresh(), ...(JSON.parse(raw) as Journal) }
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
    }),
    [update, seasonStart],
  )
  return { journal, ...api }
}
