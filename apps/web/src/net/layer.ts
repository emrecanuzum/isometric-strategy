import type { Army, Claim, Envoy, Market, Pact, Relation, SpyMission, Town } from '@game/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { serverNow } from './clock'
import { loadArmies, loadBattles, loadDiplomacy, loadNotices, loadTowns, settle } from './online'
import type { ArmyOrder, Battle, Notice } from './online'

// The layer between kingdoms as the client holds it: relations, pacts, envoys and spies, armies, battles, the
// player's notices and the lobby's prices. Each part is fetched again when the lobby's broadcast says its table
// changed (a little later, so a burst of changes costs one fetch), and every minute just in case.

export interface Layer {
  relations: Relation[]
  pacts: Pact[]
  envoys: Envoy[]
  missions: SpyMission[]
  orders: ArmyOrder[]
  claims: Claim[]
  armies: Army[]
  battles: Battle[]
  notices: Notice[]
  towns: Town[]
  market: Market | null
}

type Part = 'diplomacy' | 'armies' | 'battles' | 'notices' | 'towns'

const PART_OF: Record<string, Part> = {
  relations: 'diplomacy',
  pacts: 'diplomacy',
  envoys: 'diplomacy',
  spy_missions: 'diplomacy',
  army_orders: 'diplomacy',
  claims: 'diplomacy',
  armies: 'armies',
  battles: 'battles',
  notices: 'notices',
  lobby_towns: 'towns',
}

export function useLayer(lobby: string, initialMarket: Market | null) {
  const [layer, setLayer] = useState<Layer>({
    relations: [],
    pacts: [],
    envoys: [],
    missions: [],
    orders: [],
    claims: [],
    armies: [],
    battles: [],
    notices: [],
    towns: [],
    market: initialMarket,
  })
  const timers = useRef(new Map<Part, number>())
  const lastNudge = useRef(0)

  const fetchPart = useCallback(
    async (part: Part) => {
      if (part === 'diplomacy') {
        const d = await loadDiplomacy(lobby)
        setLayer((l) => ({ ...l, ...d }))
      } else if (part === 'armies') {
        const armies = await loadArmies(lobby)
        setLayer((l) => ({ ...l, armies }))
      } else if (part === 'battles') {
        const battles = await loadBattles(lobby)
        setLayer((l) => ({ ...l, battles }))
      } else if (part === 'towns') {
        const towns = await loadTowns(lobby)
        setLayer((l) => ({ ...l, towns }))
      } else {
        const notices = await loadNotices(lobby)
        setLayer((l) => ({ ...l, notices }))
      }
    },
    [lobby],
  )

  const refresh = useCallback(
    (part: Part, delay = 250) => {
      clearTimeout(timers.current.get(part))
      timers.current.set(part, window.setTimeout(() => fetchPart(part), delay))
    },
    [fetchPart],
  )
  const refreshAll = useCallback(() => {
    for (const part of ['diplomacy', 'armies', 'battles', 'notices', 'towns'] as Part[]) refresh(part, 0)
  }, [refresh])

  useEffect(() => {
    refreshAll()
    const id = setInterval(refreshAll, 60_000)
    const current = timers.current
    return () => {
      clearInterval(id)
      for (const t of current.values()) clearTimeout(t)
    }
  }, [refreshAll])

  // For the lobby's broadcast: a table changed (notices only matter when they are the player's).
  const onChange = useCallback(
    (table: string, kingdom: number | undefined, me: number) => {
      const part = PART_OF[table]
      if (!part || (part === 'notices' && kingdom !== me)) return
      refresh(part)
      // Orders reaching armies show up as army changes.
      if (part === 'armies') refresh('diplomacy')
    },
    [refresh],
  )
  // When anything this player can see comes due, nudge the server at that moment so its outcome (and the envoy's
  // dialog) arrives within seconds rather than at the next minute's tick.
  useEffect(() => {
    const now = serverNow()
    const due = [
      ...layer.battles.filter((b) => !b.resolved).map((b) => Date.parse(b.ends_at)),
      ...layer.envoys.filter((e) => e.status === 'traveling').map((e) => Date.parse(e.arrive_at)),
      ...layer.envoys.filter((e) => e.status === 'pending' && e.expires_at).map((e) => Date.parse(e.expires_at!)),
      ...layer.orders.map((o) => Date.parse(o.effective_at)),
      ...layer.armies.filter((a) => a.status === 'moving' && a.goal.kind !== 'move').map((a) => Date.parse(a.arrive_at)),
      // A town's siege running its course.
      ...layer.towns.flatMap((t) => (t.siege ? [t.siege.endsAt] : [])),
    ]
    if (due.length === 0) return
    // Something already past due is nudged again every few seconds until the server has settled it.
    const next = Math.max(Math.min(...due) + 1000, lastNudge.current + 5000)
    const id = window.setTimeout(() => {
      lastNudge.current = serverNow()
      settle(lobby).then(() => refreshAll())
    }, Math.max(0, next - now))
    return () => clearTimeout(id)
  }, [lobby, layer.battles, layer.envoys, layer.orders, layer.armies, layer.towns, refreshAll])

  const onMarket = useCallback((market: Market) => setLayer((l) => ({ ...l, market })), [])
  const dropNotices = useCallback((ids: number[]) => setLayer((l) => ({ ...l, notices: l.notices.filter((n) => !ids.includes(n.id)) })), [])

  return { layer, refreshAll, onChange, onMarket, dropNotices }
}
