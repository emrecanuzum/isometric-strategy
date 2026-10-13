import type { Point } from '@game/shared'
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
}

export const kingdomName = (online: Online, id: number) => online.kingdoms.find((k) => k.id === id)?.name ?? '?'
