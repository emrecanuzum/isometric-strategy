import type { Building, Kingdom, Point } from '@game/shared'
import { supabase } from '../lib/supabase'

// The lobby as the client sees it: the player's own kingdom in full, the others only as they show on the map, and the
// chat. Every change goes through the `command` Edge Function; the lobby's broadcast topic says when to look again.

export interface Lobby {
  id: string
  name: string
  seed: number
  is_public: boolean
  max_players: number
  season_start: string
  season_end: string
  has_password: boolean
}

// The player's row: the sites shown before founding, then the economy.
export interface Mine {
  id: number
  version: number
  sites: Point[]
  state: Kingdom | null
}

export interface Rival {
  id: number
  name: string
  color: string
  site: Point
  buildings: Pick<Building, 'id' | 'kind' | 'x' | 'y' | 'size' | 'doneAt' | 'level'>[]
  version: number
}

export interface ChatMessage {
  id: number
  kingdom_id: number
  name: string
  color: string | null
  body: string
  created_at: string
}

export const CHAT_KEEP = 100

// Accounts sign in with their email and password; the browser keeps the session.
export async function currentUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

// Returns whether the account still has to confirm its email before signing in.
export async function signUp(email: string, password: string, username: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } })
  if (error) throw error
  return !data.session
}

export const signOut = () => supabase.auth.signOut()

// The lobby browser's row (see list_lobbies in the migrations).
export interface LobbyListing {
  id: string
  name: string
  max_players: number
  season_start: string
  season_end: string
  has_password: boolean
  players: number
  owner: string | null
  joined: boolean
}

export async function listLobbies(): Promise<LobbyListing[]> {
  const { data, error } = await supabase.rpc('list_lobbies')
  if (error) throw error
  return data as LobbyListing[]
}

const LOBBY_COLUMNS = 'id, name, seed, is_public, max_players, season_start, season_end, has_password'

export async function getLobby(id: string): Promise<Lobby | null> {
  const { data } = await supabase.from('lobbies').select(LOBBY_COLUMNS).eq('id', id).maybeSingle()
  return data as Lobby | null
}

export async function loadMine(lobby: string): Promise<Mine | null> {
  const { data } = await supabase.from('kingdoms').select('id, version, sites, state').eq('lobby_id', lobby).maybeSingle()
  return data as Mine | null
}

export async function loadRivals(lobby: string): Promise<Rival[]> {
  const { data, error } = await supabase.rpc('lobby_kingdoms', { lobby })
  if (error) throw error
  return data as Rival[]
}

export async function loadChat(lobby: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, kingdom_id, name, color, body, created_at')
    .eq('lobby_id', lobby)
    .order('id', { ascending: false })
    .limit(CHAT_KEEP)
  if (error) throw error
  return (data as ChatMessage[]).reverse()
}

export async function postChat(lobby: string, kingdom: number, body: string) {
  const { error } = await supabase.from('chat_messages').insert({ lobby_id: lobby, kingdom_id: kingdom, body })
  if (error) throw error
}

export type Command =
  | { type: 'join'; password?: string }
  | { type: 'roll' }
  | { type: 'found'; site: number; name: string; color: string }
  | { type: 'build'; kind: string; x: number; y: number }
  | { type: 'upgrade'; id: number }
  | { type: 'upgradeTrade' }
  | { type: 'tradeGood'; good: string }
  | { type: 'workers'; id: number; workers: number }
  | { type: 'product'; id: number; product: string }
  | { type: 'reset' }

export class CommandError extends Error {}

async function invoke(body: object) {
  const { data, error } = await supabase.functions.invoke('command', { body })
  if (error) {
    const answer = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new CommandError(answer?.error ?? 'server')
  }
  return data as { lobby: string; kingdom: Mine }
}

export async function send(lobby: string, command: Command): Promise<Mine> {
  return (await invoke({ lobby, ...command })).kingdom
}

// Opens a lobby (the server makes its world) and joins it.
export async function createLobby(name: string, maxPlayers: number, password: string) {
  return invoke({ type: 'createLobby', name, maxPlayers, password })
}

export interface LobbyFeed {
  onKingdom(id: number, version: number): void
  onChat(message: ChatMessage): void
}

// The lobby's private broadcast topic: only members may join it (see the migrations).
export function subscribe(lobby: string, feed: LobbyFeed) {
  const channel = supabase
    .channel(`lobby:${lobby}`, { config: { private: true } })
    .on('broadcast', { event: 'kingdom' }, ({ payload }) => feed.onKingdom(payload.id, payload.version))
    .on('broadcast', { event: 'chat' }, ({ payload }) => feed.onChat(payload as ChatMessage))
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
