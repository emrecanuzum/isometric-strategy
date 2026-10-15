import { relationTerms } from '@game/shared'
import type { Blockade, Good, NavyLook, Point, Score, TradeLedger } from '@game/shared'
import type { Layer } from '../../net/layer'
import type { Command, IntelReport, Lobby } from '../../net/online'

// What the tabs know of the lobby and how they act on it: the other kingdoms, the layer between them, the player's
// focus (a kingdom looked at in the diplomacy tab, an army picked on the map), and the commands.

// Where the relation of two kingdoms rests and how high it may go: lords of rival crowns stay cool (CLAUDE.md §7.8).
export const relationTermsIn = (online: { kingdoms: KingdomInfo[] }, x: number, y: number) =>
  relationTerms(online.kingdoms.find((k) => k.id === x)?.liege, online.kingdoms.find((k) => k.id === y)?.liege)

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
  // What its merchant sells now (null: nothing), all it has sold this season (others' rounded; see the trade shares)
  // and whether raiders wrecked its trade post.
  tradeGood?: Good | null
  tradeLedger?: TradeLedger | null
  tradeDamaged?: boolean
  // The crown kingdom its lord is sworn to (CLAUDE.md §7.8; null when not yet).
  liege?: number | null
  // Its fleets as the map shows them, and who blockades its dock (CLAUDE.md §8.5).
  navy?: NavyLook | null
  blockade?: Blockade | null
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
  // The player's fleet picked (outlined on the map), and picking one from the panel (the map goes to it).
  fleet: number | null
  showFleet(id: number): void
  intel: Record<number, IntelReport | null | undefined>
  loadIntel(target: number): void
  // Sends a command; resolves to its result, or undefined when it was refused (the refusal is shown).
  act<T = unknown>(command: Command): Promise<T | undefined>
  // Picks a destination on the map for an army.
  target(army: number): void
  // Picks a spot on the water for a fleet to sail to.
  sail(fleet: number): void
  // Opens the battle view.
  watch(battle: number): void
  // Opens the watch over a town's siege.
  watchTown(town: number): void
  // Takes the camera to a crown kingdom's capital and opens its court (CLAUDE.md §7.8).
  openCrown(index: number): void
  // The army the camera is locked onto, if any.
  following: number | null
  follow(army: number | null): void
  // The crown kingdoms' names, by their capital's index (CLAUDE.md §7.8).
  crowns: string[]
}

export const kingdomName = (online: Online, id: number) => online.kingdoms.find((k) => k.id === id)?.name ?? '?'
