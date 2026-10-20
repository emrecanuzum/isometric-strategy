import { BUILDINGS, PROJECT_IDS, RESEARCH, balance, projectStageMs, shipSpec, siegeShieldMs, unitSpec, voyageMs } from '@game/shared'
import type { Building, Kingdom } from '@game/shared'
import { useRef, useState } from 'react'
import type React from 'react'
import type { TabId } from './Hud'
import { Icon } from '../icons'
import { L, locale } from '../../lib/i18n'
import type { IconName } from '../icons'
import { BUILDING_NAMES, RESEARCH_NAMES, UNIT_NAMES } from '../names'
import { ENVOY_NAMES } from './diplomacy'
import { EXPEDITION_TEXTS } from '../expeditionNames'
import type { Online } from './online'
import { Meter } from './primitives'
import { itemName, liveRequest } from './RoyalRequests'
import { PROJECT_TEXTS } from './projects'

// Everything that takes a while, as timers above the menu in the bottom-left corner: buildings going up, research,
// soldiers in training, the player's envoys and armies on the road, a sermon. A finished one flashes green for a few
// seconds before it goes.

const FLASH_MS = 6000

// Where a tap on a timer leads: a building's menu, or a tab (at one of its parts; diplomacy at a lord).
export type TimerGo = { building: number } | { tab: TabId; part?: [string, string]; focus?: number }

interface Timer {
  key: string
  icon: IconName
  label: string
  start: number
  end: number
  go?: TimerGo
}

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : L(`${s} sn`, `${s} s`)
}

// How long a building's works take (its level's build time).
export const buildSeconds = (b: Pick<Building, 'kind' | 'level'>) => {
  const level = b.level ?? 1
  return (level > 1 ? BUILDINGS[b.kind].levels?.[level - 2]?.buildSeconds : BUILDINGS[b.kind].buildSeconds) ?? 1
}

function timersOf(kingdom: Kingdom, online: Online | undefined, now: number): Timer[] {
  const out: Timer[] = []
  for (const b of kingdom.buildings) {
    if (b.doneAt <= now - FLASH_MS || b.doneAt === 0) continue
    const level = b.level ?? 1
    const seconds = buildSeconds(b)
    out.push({ key: `b:${b.id}:${level}`, icon: 'build', label: level > 1 ? L(`${BUILDING_NAMES[b.kind]} → ${level}. sv.`, `${BUILDING_NAMES[b.kind]} → lv. ${level}`) : BUILDING_NAMES[b.kind], start: b.doneAt - seconds * 1000, end: b.doneAt, go: { building: b.id } })
  }
  const university = kingdom.buildings.find((b) => b.kind === 'university')
  const temple = kingdom.buildings.find((b) => b.kind === 'temple')
  const ARMY = { tab: 'army', part: ['army', 'land'] } as const satisfies TimerGo
  const SEA = { tab: 'army', part: ['army', 'sea'] } as const satisfies TimerGo
  for (const r of kingdom.researches ?? []) {
    if (r.doneAt <= now - FLASH_MS) continue
    out.push({ key: `r:${r.id}`, icon: 'book', label: RESEARCH_NAMES[r.id]?.name ?? r.id, start: r.doneAt - (RESEARCH[r.id]?.seconds ?? 1) * 1000, end: r.doneAt, ...(university && { go: { building: university.id } }) })
  }
  for (const t of kingdom.training ?? []) {
    const unit = t.unit ?? 'spear'
    out.push({ key: `t:${t.doneAt}`, icon: 'people', label: `${t.count} ${UNIT_NAMES[unit].toLocaleLowerCase(locale())}`, start: t.doneAt - t.count * unitSpec(unit).trainSeconds * 1000, end: t.doneAt, go: { tab: 'army', part: ['army', 'barracks'] } })
  }
  // Parties on their journeys (CLAUDE.md §9.9).
  for (const e of kingdom.expeditions ?? []) {
    if (e.result && e.endAt <= now - FLASH_MS) continue
    if (e.result?.recalled) continue
    out.push({ key: `x:${e.id}`, icon: EXPEDITION_TEXTS[e.kind]?.icon ?? 'pin', label: EXPEDITION_TEXTS[e.kind]?.short ?? L('Sefer', 'Expedition'), start: e.startAt, end: e.endAt, go: { tab: 'kingdom', part: ['palace', 'expeditions'] } })
  }
  // A stage of a great work being built (CLAUDE.md §9.10).
  for (const id of PROJECT_IDS) {
    const p = kingdom.projects?.[id]
    if (p?.until === undefined) continue
    out.push({ key: `w:${id}:${p.stage}`, icon: PROJECT_TEXTS[id].icon, label: L(`${PROJECT_TEXTS[id].name} · ${p.stage + 1}. aşama`, `${PROJECT_TEXTS[id].name} · stage ${p.stage + 1}`), start: p.until - projectStageMs(p.stage), end: p.until, go: { tab: 'kingdom', part: ['palace', 'projects'] } })
  }
  // Caravans taking a crown its order (CLAUDE.md §7.8).
  for (const t of kingdom.orderTrips ?? []) out.push({ key: `o:${t.crown}:${t.leftAt}`, icon: 'scroll', label: L('Taç siparişi kervanı', 'Crown order caravan'), start: t.leftAt, end: t.arriveAt, go: { tab: 'trade', part: ['trade', 'orders'] } })
  // Ships on the slipways and fleets at sea (CLAUDE.md §8.5).
  const SHIP = { galley: L('kadırga', 'galley'), cog: L('koka', 'cog'), corsair: L('çektiri', 'raider') }
  for (const b of kingdom.navy?.building ?? []) {
    out.push({ key: `y:${b.doneAt}:${b.ship}`, icon: 'ship', label: L(`${b.count} ${SHIP[b.ship]}`, `${b.count} ${SHIP[b.ship]}${b.count === 1 ? '' : 's'}`), start: b.doneAt - b.count * shipSpec(b.ship).buildSeconds * 1000, end: b.doneAt, go: SEA })
  }
  for (const f of kingdom.navy?.fleets ?? []) {
    const m = f.mission
    if (m.kind === 'blockade' && !m.resolved) out.push({ key: `f:${f.id}:${m.arriveAt}`, icon: 'ship', label: L(`Abluka → ${m.name}`, `Blockade → ${m.name}`), start: m.arriveAt - voyageMs(kingdom.dockPlot, null), end: m.arriveAt, go: SEA })
    else if (m.kind === 'raid') out.push({ key: `f:${f.id}:${m.arriveAt}`, icon: 'ship', label: L(`Akın → ${m.name}`, `Raid → ${m.name}`), start: m.arriveAt - voyageMs(kingdom.dockPlot, null), end: m.arriveAt, go: SEA })
    else if (m.kind === 'return' || m.kind === 'sortie') out.push({ key: `f:${f.id}:${m.arriveAt}`, icon: 'ship', label: m.kind === 'return' ? L('Filo dönüyor', 'Fleet returning') : L('Ablukayı yarma', 'Breaking the blockade'), start: m.arriveAt - balance.navy.sortieSeconds * 1000, end: m.arriveAt, go: SEA })
  }
  if ((kingdom.sermonUntil ?? 0) > now - FLASH_MS && kingdom.lastSermonAt) {
    out.push({ key: `s:${kingdom.lastSermonAt}`, icon: 'temple', label: L('Vaaz', 'Sermon'), start: kingdom.lastSermonAt, end: kingdom.sermonUntil!, go: temple ? { building: temple.id } : { tab: 'people', part: ['people', 'health'] } })
  }
  if ((kingdom.shieldUntil ?? 0) > now - FLASH_MS) {
    const span = siegeShieldMs(kingdom, now)
    out.push({ key: `k:${kingdom.shieldUntil}`, icon: 'shield', label: L('Kuşatma kalkanı', 'Siege shield'), start: kingdom.shieldUntil! - span, end: kingdom.shieldUntil!, go: { tab: 'army', part: ['army', 'battles'] } })
  }
  if (online) {
    // The liege's royal request taken on, until it runs out (CLAUDE.md §7.8).
    const royal = liveRequest(kingdom, online.market, now)
    if (royal?.accepted) out.push({ key: `q:${royal.req.n}`, icon: 'crown', label: L(`Kraliyet isteği: ${royal.req.units} ${itemName(royal.req.item)}`, `Royal request: ${royal.req.units} ${itemName(royal.req.item)}`), start: royal.req.arriveAt, end: royal.req.endsAt, go: { tab: 'diplomacy', part: ['diplomacy', 'crowns'] } })
    for (const e of online.envoys) {
      if (e.from_id !== online.me || e.status !== 'traveling') continue
      const to = online.kingdoms.find((k) => k.id === e.to_id)?.name ?? 'lord'
      out.push({ key: `e:${e.id}`, icon: 'scroll', label: `${ENVOY_NAMES[e.kind]} → ${to}`, start: Date.parse(e.sent_at), end: Date.parse(e.arrive_at), go: { tab: 'diplomacy', part: ['diplomacy', 'kingdoms'], focus: e.to_id } })
    }
    // Envoys riding to the player's armies with orders.
    const ORDER_NAMES = { move: L('yürü', 'march'), home: L('eve dön', 'return home'), split: L('bölün', 'split'), merge: L('birleş', 'merge'), chase: L('yağmacıların peşine düş', 'chase the bandits'), cave: L('yağmacı mağarasını kuşat', 'besiege the bandit cave') }
    for (const o of online.orders) {
      if (o.applied_at || !online.armies.some((a) => a.id === o.army_id && a.kingdom_id === online.me)) continue
      out.push({ key: `o:${o.id}`, icon: 'scroll', label: L(`Elçi orduya: ${ORDER_NAMES[o.payload.kind as keyof typeof ORDER_NAMES] ?? 'emir'}`, `Envoy to the army: ${ORDER_NAMES[o.payload.kind as keyof typeof ORDER_NAMES] ?? 'order'}`), start: Date.parse(o.issued_at), end: Date.parse(o.effective_at), go: ARMY })
    }
    // The window in which a commander hears new orders at once.
    for (const a of online.armies) {
      if (a.kingdom_id !== online.me || !a.contact_until || Date.parse(a.contact_until) <= now) continue
      const end = Date.parse(a.contact_until)
      out.push({ key: `c:${a.id}:${end}`, icon: 'scroll', label: L('Komutanla iletişim', 'In touch with the commander'), start: end - balance.time.contactSeconds * 1000, end, go: ARMY })
    }
    for (const a of online.armies) {
      if (a.kingdom_id !== online.me || a.status !== 'moving') continue
      // Waiting at the gates of a shielded palace.
      const shield = a.goal.kind === 'siege' ? (online.kingdoms.find((k) => k.id === (a.goal as { kingdom: number }).kingdom)?.shieldUntil ?? 0) : 0
      if (shield > now && Date.parse(a.arrive_at) <= now) {
        out.push({ key: `w:${a.id}:${shield}`, icon: 'crown', label: L('Kuşatma bekliyor', 'Waiting to besiege'), start: shield - balance.military.siege.shieldSeconds * 1000, end: shield, go: ARMY })
        continue
      }
      out.push({
        key: `a:${a.id}:${a.arrive_at}`,
        icon: 'swords',
        label: a.goal.kind === 'home' ? L('Ordu eve dönüyor', 'Army returning home') : a.goal.kind === 'siege' ? L('Ordu kuşatmaya', 'Army off to a siege') : L('Ordu yolda', 'Army on the march'),
        start: Date.parse(a.depart_at),
        end: Date.parse(a.arrive_at),
        go: ARMY,
      })
    }
  }
  return out
}

// How much sooner than its end a timer may leave its list and still flash as done (clock drift, a round's settling).
const EARLY_MS = 15_000

export function Timers({ kingdom, online, now, onGo }: { kingdom: Kingdom; online?: Online; now: number; onGo?: (go: TimerGo) => void }) {
  // Timers that left the lists when they ended (soldiers join the garrison, envoys arrive) are kept to flash.
  const seen = useRef(new Map<string, Timer>())
  const live = new Set<string>()
  for (const t of timersOf(kingdom, online, now)) (seen.current.set(t.key, t), live.add(t.key))
  // One gone well before its end was cut short (a royal request delivered, a party called home): it does not linger.
  for (const [key, t] of seen.current) if (t.end <= now - FLASH_MS || (!live.has(key) && t.end > now + EARLY_MS)) seen.current.delete(key)
  const list = [...seen.current.values()].sort((a, b) => a.end - b.end)
  // Folded away to its header (remembered in the browser): the count and the soonest to end.
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1'
    } catch {
      return false
    }
  })
  const fold = () => {
    setFolded(!folded)
    try {
      localStorage.setItem(FOLD_KEY, folded ? '0' : '1')
    } catch {
      // Without storage it is only folded for now.
    }
  }
  if (list.length === 0) return null
  const next = list.find((t) => t.end > now)
  return (
    <section className={folded ? 'timers frame folded' : 'timers frame'} aria-label={L('Süren işler', 'In progress')}>
      <button className="timers-head" onClick={fold} aria-expanded={!folded}>
        <Icon name={folded ? 'plus' : 'minus'} size={8} />
        <span>{L('Süren işler', 'In progress')} · {list.length}</span>
        {folded && next && <small>{left(next.end - now)}</small>}
      </button>
      {!folded && (
    <ul className="timers-list">
      {list.map((t) => {
        const done = t.end <= now
        return (
          <li
            key={t.key}
            className={`${done ? 'timer done' : 'timer'}${t.go && onGo ? ' go' : ''}`}
            {...(t.go && onGo && { role: 'button', tabIndex: 0, title: L('Aç', 'Open'), onClick: () => onGo(t.go!), onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && onGo(t.go!) })}
          >
            <Icon name={done ? 'happy' : t.icon} size={16} />
            <span>{t.label}</span>
            {!done && <Meter value={(now - t.start) / Math.max(1, t.end - t.start)} label={L(`${t.label} ilerleme`, `${t.label} progress`)} segments={6} />}
            <small>{done ? L('Bitti', 'Done') : left(t.end - now)}</small>
          </li>
        )
      })}
    </ul>
      )}
    </section>
  )
}

const FOLD_KEY = 'timers-folded'
