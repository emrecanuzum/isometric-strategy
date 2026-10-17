import { gameTime } from '@game/shared'
import type { EconomyEvent, Good, Kingdom, Resource, Stock } from '@game/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IconName } from '../icons'
import { BUILDING_NAMES, FORTUNE_TEXTS, HOARD_TEXTS, RESEARCH_NAMES, RESOURCE_NAMES, SCOPE_NAMES } from '../names'
import { PROJECT_TEXTS } from './projects'
import { EXPEDITION_TEXTS, FIND_TEXTS, GOAL_TEXTS, INCIDENT_TEXTS } from '../expeditionNames'

// The envoy's journal: what happened in the kingdom, told as short dispatches. Single events (a building done, the
// merchant coming back empty) are written at once; everything else is gathered into one report per day.
// A prototype "day" is REPORT_ROUNDS production rounds, so reports come at a readable pace.

export const REPORT_ROUNDS = 6
const HUNGER_EVERY_MS = 10 * 60_000
const SHIP_WORDS = { galley: 'kadırga', cog: 'koka', corsair: 'çektiri' } as const
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
  tally: { rounds: number; produced: Partial<Stock>; tradeGold: number; trips: number; emptyTrip: boolean; wasted?: Partial<Stock>; seaGold?: number; voyages?: number }
  // Stores after each production round, oldest first, for the storehouse charts.
  history: Stock[]
  // The envoy's notices already written down.
  notices?: number[]
  // The newest important entry the player has looked at under "Önemli" (entries after it count as unread there).
  importantSeen?: number
  // The stores that have been overflowing since it was last reported: told once, again only after they have had room.
  overflowing?: string[]
  // When the granary was last said to be running low (said again only after a while).
  hungerToldAt?: number
  // The merchant's empty trips have been told: again only after he has sold something (or another good is chosen).
  emptyTold?: string
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
// Goods lost, in words: "786 yapı malzemesi ve 40 altın" (empty when nothing).
const lostText = (lost: Partial<Stock> | undefined) =>
  Object.entries(lost ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([r, v]) => `${fmt(v ?? 0)} ${r === 'gold' ? 'altın' : RESOURCE_NAMES[r as Good].toLowerCase()}`)
    .join(' ve ')
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
    // Road tiles are laid by the dozen: they need no word each.
    if (event.kind === 'built' && event.building.kind === 'road') continue
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
      // An empty trip is told once, not every time the merchant comes back: again only after a trip that sold something,
      // or for another good or another cause. A merchant waiting on a full treasury is not an empty trip: the treasury
      // card says so.
      const why = `${event.damaged ? 'damaged' : event.walledIn ? 'walled' : 'empty'}:${event.good}`
      if (event.sold > 0 && j.emptyTold) j = { ...j, emptyTold: undefined }
      if (event.sold === 0 && !event.full && !j.tally.emptyTrip && j.emptyTold !== why) {
        j = write({ ...j, emptyTold: why, tally: { ...tally, emptyTrip: true } }, seasonStart, at, {
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
    } else if (event.kind === 'crisis' && (event.steward || event.choice)) {
      // Met by the villagers or the army (or the steward): the harm warded off, but goods lost all the same.
      const f = FORTUNE_TEXTS[event.fortune]
      const lost = lostText(event.lost)
      j = write(j, seasonStart, at, {
        tone: lost ? 'bad' : 'info',
        icon: 'scroll',
        title: event.steward ? `${f?.title ?? 'Olay'}: kâhya köylüleri seferber etti` : `${f?.title ?? 'Olay'}: ${event.choice === 'army' ? 'ordu' : 'köylüler'} müdahale etti`,
        text: `${event.steward ? 'Sen karar veremeden kâhyan köylüleri topladı; asıl zarar önlendi.' : 'Asıl zarar önlendi.'}${lost ? ` Yine de ${lost} gitti.` : ''}`,
      })
    } else if (event.kind === 'spoiled') {
      const h = HOARD_TEXTS[event.hoard]
      j = write(j, seasonStart, at, {
        important: true,
        tone: 'bad',
        icon: 'warn',
        title: h?.title ?? 'Ambarda bozulma',
        text: `${h?.text ?? ''} ${fmt(event.lost)} ${RESOURCE_NAMES[event.good].toLowerCase()} gitti. Ağzına kadar dolu ambar belayı çeker: malı harca (Saray → Projeler) ya da sat.`,
      })
    } else if (event.kind === 'project') {
      const p = PROJECT_TEXTS[event.id]
      j = write(j, seasonStart, at, {
        tone: 'good',
        icon: p?.icon ?? 'build',
        title: event.finished ? `${p?.name ?? 'Büyük iş'} tamamlandı!` : `${p?.name ?? 'Büyük iş'}: ${event.stage}. aşama bitti`,
        text: event.finished ? 'Ustalar son taşı da koydu; adın bu işle anılacak. Tacın seni övüyor.' : `Şimdi: ${p?.bonus(event.stage) ?? ''}. Sonraki aşamanın teslimatı Saray → Projeler'de.`,
      })
    } else if (event.kind === 'expedition') {
      const e = event.expedition
      const r = e.result
      const t = EXPEDITION_TEXTS[e.kind]
      if (r && !r.recalled) {
        const bad = r.incidents.filter((i) => i.bad).length
        const story = r.incidents.map((i) => INCIDENT_TEXTS[e.kind]?.[i.id]).filter(Boolean).join(' ')
        const got = Object.entries(r.gains).filter(([, v]) => (v ?? 0) > 0).map(([g, v]) => `${fmt(v ?? 0)} ${g === 'gold' ? 'altın' : RESOURCE_NAMES[g as Good].toLowerCase()}`)
        const losses = [...(r.villagersLost ? [`${r.villagersLost} köylü dönmedi`] : []), ...(r.soldiersLost ? [`${r.soldiersLost} muhafız düştü`] : [])]
        j = write(j, seasonStart, at, {
          tone: bad > r.incidents.length / 2 || losses.length > 0 ? 'bad' : 'good',
          important: losses.length > 0,
          icon: t?.icon ?? 'pin',
          title: `${t?.short ?? 'Sefer'} döndü${r.find ? `: ${FIND_TEXTS[r.find]?.name}!` : ''}`,
          text: [story, got.length ? `Getirdikleri: ${got.join(', ')}.` : 'Eli boş döndüler.', losses.length ? `${losses.join(', ')}.` : ''].filter(Boolean).join(' '),
        })
      }
    } else if (event.kind === 'goal') {
      const g = GOAL_TEXTS[event.track]
      j = write(j, seasonStart, at, { tone: 'good', icon: 'star', title: `Hedef: ${g?.name ?? event.track} · ${g?.badges[event.tier - 1] ?? `${event.tier}. basamak`}`, text: `Bir yıldız kazandın${event.gold ? `; hazineye +${fmt(event.gold)} altın` : ''}.` })
    } else if (event.kind === 'crisis') {
      const f = FORTUNE_TEXTS[event.fortune]
      const extra = [
        ...Object.entries(event.lost ?? {}).filter(([, v]) => (v ?? 0) > 0).map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()} kayboldu`),
        ...(event.sick ? [`halkın %${Math.round(event.sick * 100)} kadarı hastalandı`] : []),
      ]
      j = write(j, seasonStart, at, {
        important: true,
        tone: 'bad',
        icon: f?.icon ?? 'warn',
        title: `${f?.title ?? 'Olay'}: kimse bir şey yapmadı`,
        text: extra.length > 0 ? `${extra.join(', ')}.` : 'Olay etkisini tam olarak gösterdi.',
      })
    } else if (event.kind === 'orderPaid') {
      j = write(j, seasonStart, at, { tone: 'good', icon: 'scroll', title: 'Taç siparişinin kervanı döndü', text: `${fmt(event.units)} ${RESOURCE_NAMES[event.good].toLowerCase()} teslim edildi; kervan ${fmt(event.gold)} altınla döndü ve taçla ilişkin iyileşti.` })
    } else if (event.kind === 'launched') {
      j = write(j, seasonStart, at, { tone: 'good', icon: 'ship', title: `Tersane ${event.count} ${SHIP_WORDS[event.ship]} denize indirdi`, text: 'Gemiler limanda; Ordu sekmesinin Donanma bölümünden filo çıkarabilirsin.' })
    } else if (event.kind === 'voyage') {
      const tally = { ...j.tally, seaGold: (j.tally.seaGold ?? 0) + event.gold, voyages: (j.tally.voyages ?? 0) + 1 }
      j = { ...j, tally }
      const p = event.pirates
      if (p && !p.won) {
        j = write(j, seasonStart, at, {
          tone: 'bad',
          icon: 'warn',
          title: 'Korsanlar ticaret gemilerine saldırdı!',
          text: `Korsanlar ${p.lost ? `${fmt(p.lost)} ${RESOURCE_NAMES[event.good].toLowerCase()} yükünü` : 'yükü'} ele geçirdi${p.sunk ? ` ve bir ${SHIP_WORDS[p.sunk]} batırdı` : ''}. Filoya kadırga ya da çektiri kat, ya da başka bir filoyu korsan avına gönder.`,
        })
      } else if (p?.won) {
        j = write(j, seasonStart, at, { tone: 'good', icon: 'shield', title: 'Eskort korsanları püskürttü', text: `Savaş gemilerin korsanları geri püskürttü; yük güvende.${p.bounty ? ` Ödül: +${fmt(p.bounty)} altın.` : ''}` })
      } else if (event.blocked && !j.tally.emptyTrip) {
        j = write({ ...j, tally: { ...j.tally, emptyTrip: true } }, seasonStart, at, { tone: 'bad', icon: 'lock', title: 'Gemiler limandan çıkamıyor', text: 'İskelen abluka altında; deniz ticareti durdu.' })
      }
    } else if (event.kind === 'hunt') {
      j = write(j, seasonStart, at, {
        tone: event.sunk ? 'bad' : 'good',
        icon: event.sunk ? 'warn' : 'eye',
        important: false,
        title: event.sunk ? `Korsan avında bir ${SHIP_WORDS[event.sunk]} battı` : 'Korsan tayfası yakalandı',
        text: `Ödül: +${fmt(event.bounty)} altın.${event.sunk ? ' Çarpışmada bir gemi kaybedildi.' : ''}`,
      })
    } else if (event.kind === 'fleetHome') {
      const cargo = Object.entries(event.cargo ?? {}).filter(([, v]) => (v ?? 0) > 0)
      j = write(j, seasonStart, at, { tone: 'info', icon: 'anchor', title: 'Filo limana döndü', text: cargo.length ? `Getirdiği ganimet depolara kondu: ${cargo.map(([g, v]) => `${fmt(v ?? 0)} ${RESOURCE_NAMES[g as Good].toLowerCase()}`).join(', ')}.` : 'Gemiler limanda bekliyor.' })
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
  if (j.tally.voyages) lines.push(`Gemiler ${j.tally.voyages} sefer, ${signed(j.tally.seaGold ?? 0)} altın`)
  const hungry = (produced.food ?? 0) < 0
  j = write(j, seasonStart, at, {
    tone: hungry ? 'bad' : 'info',
    // Every report of a hungry spell would fill "Önemli"; the throttled "Ambar azalıyor" below stands for it there.
    important: false,
    icon: 'scroll',
    title: 'Elçi raporu',
    text: lines.length > 0 ? lines.join(' · ') : 'Sakin bir gün; ne üretim ne ticaret.',
  })
  // Running low is said once in a while, not every report (CLAUDE.md §9.8).
  if (hungry && at - (j.hungerToldAt ?? -Infinity) >= HUNGER_EVERY_MS) {
    j = { ...j, hungerToldAt: at }
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
