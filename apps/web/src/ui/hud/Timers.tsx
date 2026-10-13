import { BUILDINGS, RESEARCH, unitSpec } from '@game/shared'
import type { Kingdom } from '@game/shared'
import { useRef } from 'react'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { BUILDING_NAMES, RESEARCH_NAMES, UNIT_NAMES } from '../names'
import { ENVOY_NAMES } from './diplomacy'
import type { Online } from './online'
import { Meter } from './primitives'

// Everything that takes a while, as timers above the menu in the bottom-left corner: buildings going up, research,
// soldiers in training, the player's envoys and armies on the road, a sermon. A finished one flashes green for a few
// seconds before it goes.

const FLASH_MS = 6000

interface Timer {
  key: string
  icon: IconName
  label: string
  start: number
  end: number
}

const left = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} sn`
}

function timersOf(kingdom: Kingdom, online: Online | undefined, now: number): Timer[] {
  const out: Timer[] = []
  for (const b of kingdom.buildings) {
    if (b.doneAt <= now - FLASH_MS || b.doneAt === 0) continue
    const level = b.level ?? 1
    const seconds = (level > 1 ? BUILDINGS[b.kind].levels?.[level - 2]?.buildSeconds : BUILDINGS[b.kind].buildSeconds) ?? 1
    out.push({ key: `b:${b.id}:${level}`, icon: 'build', label: level > 1 ? `${BUILDING_NAMES[b.kind]} → ${level}. sv.` : BUILDING_NAMES[b.kind], start: b.doneAt - seconds * 1000, end: b.doneAt })
  }
  for (const r of kingdom.researches ?? []) {
    if (r.doneAt <= now - FLASH_MS) continue
    out.push({ key: `r:${r.id}`, icon: 'book', label: RESEARCH_NAMES[r.id]?.name ?? r.id, start: r.doneAt - (RESEARCH[r.id]?.seconds ?? 1) * 1000, end: r.doneAt })
  }
  for (const t of kingdom.training ?? []) {
    const unit = t.unit ?? 'spear'
    out.push({ key: `t:${t.doneAt}`, icon: 'people', label: `${t.count} ${UNIT_NAMES[unit].toLowerCase()}`, start: t.doneAt - t.count * unitSpec(unit).trainSeconds * 1000, end: t.doneAt })
  }
  if ((kingdom.sermonUntil ?? 0) > now - FLASH_MS && kingdom.lastSermonAt) {
    out.push({ key: `s:${kingdom.lastSermonAt}`, icon: 'temple', label: 'Vaaz', start: kingdom.lastSermonAt, end: kingdom.sermonUntil! })
  }
  if (online) {
    for (const e of online.envoys) {
      if (e.from_id !== online.me || e.status !== 'traveling') continue
      const to = online.kingdoms.find((k) => k.id === e.to_id)?.name ?? 'krallık'
      out.push({ key: `e:${e.id}`, icon: 'scroll', label: `${ENVOY_NAMES[e.kind]} → ${to}`, start: Date.parse(e.sent_at), end: Date.parse(e.arrive_at) })
    }
    for (const a of online.armies) {
      if (a.kingdom_id !== online.me || a.status !== 'moving') continue
      out.push({
        key: `a:${a.id}:${a.arrive_at}`,
        icon: 'swords',
        label: a.goal.kind === 'home' ? 'Ordu eve dönüyor' : a.goal.kind === 'siege' ? 'Ordu kuşatmaya' : 'Ordu yolda',
        start: Date.parse(a.depart_at),
        end: Date.parse(a.arrive_at),
      })
    }
  }
  return out
}

export function Timers({ kingdom, online, now }: { kingdom: Kingdom; online?: Online; now: number }) {
  // Timers that left the lists when they ended (soldiers join the garrison, envoys arrive) are kept to flash.
  const seen = useRef(new Map<string, Timer>())
  for (const t of timersOf(kingdom, online, now)) seen.current.set(t.key, t)
  for (const [key, t] of seen.current) if (t.end <= now - FLASH_MS) seen.current.delete(key)
  const list = [...seen.current.values()].sort((a, b) => a.end - b.end)
  if (list.length === 0) return null
  return (
    <ul className="timers frame" aria-label="Süren işler">
      {list.map((t) => {
        const done = t.end <= now
        return (
          <li key={t.key} className={done ? 'timer done' : 'timer'}>
            <Icon name={done ? 'happy' : t.icon} size={16} />
            <span>{t.label}</span>
            {!done && <Meter value={(now - t.start) / Math.max(1, t.end - t.start)} label={`${t.label} ilerleme`} segments={6} />}
            <small>{done ? 'Bitti' : left(t.end - now)}</small>
          </li>
        )
      })}
    </ul>
  )
}
