// Kingdom colours. No two kingdoms of a lobby share one, and a lobby offers as many colours as it has places, so there
// is always one free for every player (CLAUDE.md §5.1). The client draws them (apps/web/src/game/buildingSprites.ts).

// Lobbies come in these sizes; the colour picker shows rows of nine.
export const LOBBY_SIZES = [9, 18] as const
export const KINGDOM_COLOR_IDS = [
  'royal',
  'crimson',
  'emerald',
  'violet',
  'amber',
  'teal',
  'coal',
  'gold',
  'rose',
  'sky',
  'olive',
  'rust',
  'plum',
  'lime',
  'ivory',
  'cocoa',
  'orange',
  'pine',
] as const
export type KingdomColorId = (typeof KINGDOM_COLOR_IDS)[number]

export const lobbyColors = (maxPlayers: number): KingdomColorId[] =>
  KINGDOM_COLOR_IDS.slice(0, Math.max(1, Math.min(KINGDOM_COLOR_IDS.length, maxPlayers)))
