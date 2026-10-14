import type { PlanStep, Good, TradeLedger, Army, BattlePlan, Building, Claim, Envoy, Fighter, Kingdom, Market, Operation, Pact, PeaceTerms, Point, Relation, Score, SpyMission, SpyTopic, TaxLevel, Unit, Units } from '@game/shared'
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
  market: Market | null
  // How its world was made from the seed (worldgen WORLD_REV; absent before the column existed: 1).
  world_rev?: number
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
  username: string | null
  site: Point
  buildings: Pick<Building, 'id' | 'kind' | 'x' | 'y' | 'size' | 'doneAt' | 'level' | 'broken' | 'tower' | 'along'>[]
  queen: boolean
  version: number
  // When its player was last seen (ms).
  seen_at: number | null
  // Its trade post was wrecked by raiders and not yet repaired.
  trade_damaged?: boolean
  // Shielded from sieges until then (ms; null when not).
  shield_until?: number | null
  // The lobby ranking's breakdown, as the server last worked it out.
  score?: Score | null
  // What its merchant sells now, and all it has sold this season (rounded for others).
  trade_good?: Good | null
  trade_ledger?: TradeLedger | null
}

export interface ChatMessage {
  id: number
  kingdom_id: number
  name: string
  color: string | null
  username: string | null
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

const LOBBY_COLUMNS = 'id, name, seed, is_public, max_players, season_start, season_end, has_password, market, world_rev'

export async function getLobby(id: string): Promise<Lobby | null> {
  const { data } = await supabase.from('lobbies').select(LOBBY_COLUMNS).eq('id', id).maybeSingle()
  return data as Lobby | null
}

export async function loadMine(lobby: string): Promise<Mine | null> {
  const { data, error } = await supabase.from('kingdoms').select('id, version, sites, state').eq('lobby_id', lobby).maybeSingle()
  if (error) throw error
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
    .select('id, kingdom_id, name, color, username, body, created_at')
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
  | { type: 'build'; kind: string; x: number; y: number; along?: 'x' | 'y' }
  | { type: 'buildMany'; kind: string; spots: Point[] }
  | { type: 'demolish'; id: number }
  | { type: 'disband'; units: Units }
  | { type: 'upgrade'; id: number }
  | { type: 'upgradeTrade' }
  | { type: 'tradeGood'; good: string }
  | { type: 'workers'; id: number; workers: number }
  | { type: 'product'; id: number; product: string }
  | { type: 'reset' }
  | { type: 'tax'; tax: TaxLevel }
  | { type: 'queen' }
  | { type: 'train'; count: number; unit: Unit }
  | { type: 'nightShift'; on: boolean }
  | { type: 'research'; id: string }
  | { type: 'sermon' }
  | { type: 'seen' }
  | { type: 'operation'; target: number; op: Operation }
  | { type: 'raid'; target: number }
  | { type: 'cast' }
  | { type: 'fish'; toggles: number[] }
  | { type: 'repairTrade' }
  | { type: 'ransom' }
  | { type: 'release'; target: number }
  | { type: 'buy'; good: string; units: number }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'tradeAmount'; units: number }
  | { type: 'tradeCity'; city: number | null }
  | { type: 'repairWalls' }
  | { type: 'envoy'; to: number; kind: Envoy['kind']; gold?: number; terms?: PeaceTerms }
  | { type: 'respond'; envoy: number; accept: boolean }
  | { type: 'endTribute'; pact: number }
  | { type: 'breakAlliance'; pact: number }
  | { type: 'declareWar'; to: number }
  | { type: 'spy'; target: number; topic: SpyTopic }
  | { type: 'recall'; mission: number }
  | { type: 'intel'; target: number }
  | { type: 'raise'; units: Units }
  | { type: 'army'; army: number; order: ArmyOrderPayload }

export class CommandError extends Error {}

async function invoke(body: object) {
  const { data, error } = await supabase.functions.invoke('command', { body })
  if (error) {
    const answer = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new CommandError(answer?.error ?? 'server')
  }
  return data as { lobby: string; kingdom: Mine; result?: unknown }
}

export async function send(lobby: string, command: Command): Promise<Mine> {
  return (await invoke({ lobby, ...command })).kingdom
}

// A command with what it answers besides the kingdom (an envoy's answer, a spy report, when an order arrives).
export async function sendFor<T>(lobby: string, command: Command): Promise<{ kingdom: Mine; result: T }> {
  const { kingdom, result } = (await invoke({ lobby, ...command })) as { kingdom: Mine; result: T }
  return { kingdom, result }
}

// Asks the server to settle what has come due in the lobby now (a battle over, an envoy arrived) instead of at the
// next minute's tick. Quiet: a refusal only means someone else just did it.
export async function settle(lobby: string) {
  await supabase.functions.invoke('command', { body: { type: 'settle', lobby } }).catch(() => null)
}

// Deletes a lobby and everything in it (admins only).
export async function deleteLobby(lobby: string) {
  await invoke({ type: 'deleteLobby', lobby })
}

// Opens a lobby (the server makes its world) and joins it.
export async function createLobby(name: string, maxPlayers: number, password: string) {
  return invoke({ type: 'createLobby', name, maxPlayers, password })
}

export interface LobbyFeed {
  onKingdom(id: number, version: number): void
  onChat(message: ChatMessage): void
  // A table of the layer between kingdoms changed (for notices: whose).
  onChange(table: string, kingdom?: number): void
  onMarket(market: Market): void
  // The lobby was closed (deleted).
  onClosed(): void
}

// The lobby's private broadcast topic: only members may join it (see the migrations).
export function subscribe(lobby: string, feed: LobbyFeed) {
  const channel = supabase
    .channel(`lobby:${lobby}`, { config: { private: true } })
    .on('broadcast', { event: 'kingdom' }, ({ payload }) => feed.onKingdom(payload.id, payload.version))
    .on('broadcast', { event: 'chat' }, ({ payload }) => feed.onChat(payload as ChatMessage))
    .on('broadcast', { event: 'change' }, ({ payload }) => feed.onChange(payload.table, payload.kingdom))
    .on('broadcast', { event: 'market' }, ({ payload }) => feed.onMarket(payload.market as Market))
    .on('broadcast', { event: 'closed' }, () => feed.onClosed())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}

// ---- The layer between kingdoms --------------------------------------------------------------------------------

export type ArmyOrderPayload = { kind: 'move'; x: number; y: number } | { kind: 'home' } | { kind: 'split'; soldiers: number } | { kind: 'merge'; with: number }

export interface ArmyOrder {
  id: number
  army_id: number
  issued_at: string
  effective_at: string
  payload: ArmyOrderPayload
  applied_at: string | null
}

export interface Battle {
  id: number
  kind: 'field' | 'siege'
  x: number
  y: number
  started_at: string
  ends_at: string
  attackers: Fighter[]
  defenders: Fighter[]
  besieged: number | null
  plan: BattlePlan & { defense?: { towers: number; walls: number; attackerTowers?: number } }
  resolved: boolean
  report: { winner: 'attackers' | 'defenders'; losses: Record<string, number>; loot?: Record<string, number> } | null
}

export interface Notice {
  id: number
  kingdom_id: number
  kind: string
  // deno-style loose payload: each kind has its own fields.
  payload: Record<string, unknown>
  show_at: string
  seen: boolean
}

export interface Estimate {
  lo: number
  hi: number
}

export interface IntelReport {
  strength: Record<SpyTopic, number>
  stores: Record<'gold' | 'food' | 'materials' | 'arms', Estimate | null>
  army: Record<'garrison' | 'field' | 'might' | 'happiness', Estimate | null> & { units: Record<Unit, Estimate | null> | null }
  diplomacy?: { envoys: { to: string; kind: string; status: string }[]; spies: { target: string; topic: string }[] | null; spyCount: number }
}

export async function loadDiplomacy(lobby: string) {
  const [relations, pacts, envoys, missions, orders, claims] = await Promise.all([
    supabase.from('relations').select('a, b, value, at, improved_at').eq('lobby_id', lobby),
    supabase.from('pacts').select('*').eq('lobby_id', lobby).is('ended_at', null),
    supabase.from('envoys').select('*').eq('lobby_id', lobby).order('id', { ascending: false }).limit(60),
    supabase.from('spy_missions').select('*').eq('lobby_id', lobby).order('id', { ascending: false }).limit(40),
    supabase.from('army_orders').select('*').eq('lobby_id', lobby).is('applied_at', null),
    supabase.from('claims').select('holder_id, target_id, reason, expires_at').eq('lobby_id', lobby).gt('expires_at', new Date().toISOString()),
  ])
  return {
    relations: (relations.data ?? []) as Relation[],
    pacts: (pacts.data ?? []) as Pact[],
    envoys: (envoys.data ?? []) as Envoy[],
    missions: (missions.data ?? []) as SpyMission[],
    orders: (orders.data ?? []) as ArmyOrder[],
    claims: (claims.data ?? []) as Claim[],
  }
}

export async function loadArmies(lobby: string): Promise<Army[]> {
  const { data } = await supabase.rpc('lobby_armies', { lobby })
  return (data ?? []) as Army[]
}

// Battles under way and the latest ones fought.
export async function loadBattles(lobby: string): Promise<Battle[]> {
  const { data } = await supabase.from('battles').select('*').eq('lobby_id', lobby).order('started_at', { ascending: false }).limit(20)
  return (data ?? []) as Battle[]
}

export async function loadNotices(lobby: string): Promise<Notice[]> {
  const { data } = await supabase.from('notices').select('*').eq('lobby_id', lobby).eq('seen', false).order('show_at').limit(30)
  return (data ?? []) as Notice[]
}

// Query builders only run when awaited.
export async function markSeen(ids: number[]) {
  await supabase.from('notices').update({ seen: true }).in('id', ids)
}
