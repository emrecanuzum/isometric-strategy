import type { Point, Score } from '@game/shared'
import type { Layer } from '../../net/layer'
import type { Command, IntelReport, Lobby } from '../../net/online'

// What the tabs know of the lobby and how they act on it: the other kingdoms, the layer between them, the player's
// focus (a kingdom looked at in the diplomacy tab, an army picked on the map), and the commands.

export interface KingdomInfo {
  id: number
  name: string
  color: string | null
  username: string | null
  site: Point
  queen: boolean
  // Palace level as seen from outside.
  palace: number
  // When its player was last seen (ms; null when unknown).
  seenAt?: number | null
  // Shielded from sieges until then (taken in one a short while ago).
  shieldUntil?: number | null
  // Its place in the lobby's ranking (the player's own worked out live).
  score?: Score | null
  // Its buildings as seen on the map.
  buildings?: { kind: string; x: number; y: number; size: number; doneAt: number; broken?: boolean }[]
}

// "çevrimiçi" within a few minutes, otherwise how long ago.
export function lastSeen(seenAt: number | null | undefined, now: number) {
  if (!seenAt) return 'son görülme bilinmiyor'
  const min = Math.max(0, Math.floor((now - seenAt) / 60_000))
  if (min < 6) return 'çevrimiçi'
  if (min < 60) return `${min} dk önce görüldü`
  const h = Math.floor(min / 60)
  return h < 48 ? `${h} sa önce görüldü` : `${Math.floor(h / 24)} gün önce görüldü`
}

export interface Online extends Layer {
  lobby: Lobby
  me: number
  kingdoms: KingdomInfo[]
  // The kingdom shown in the diplomacy tab, and the army picked.
  focus: number | null
  setFocus(id: number | null): void
  army: number | null
  setArmy(id: number | null): void
  intel: Record<number, IntelReport | null | undefined>
  loadIntel(target: number): void
  // Sends a command; resolves to its result, or undefined when it was refused (the refusal is shown).
  act<T = unknown>(command: Command): Promise<T | undefined>
  // Picks a destination on the map for an army.
  target(army: number): void
  // Opens the battle view.
  watch(battle: number): void
  // The army the camera is locked onto, if any.
  following: number | null
  follow(army: number | null): void
}

export const kingdomName = (online: Online, id: number) => online.kingdoms.find((k) => k.id === id)?.name ?? '?'
