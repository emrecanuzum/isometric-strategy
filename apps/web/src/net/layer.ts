import type { Army, Claim, Envoy, Market, Pact, Relation, SpyMission } from '@game/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadArmies, loadBattles, loadDiplomacy, loadNotices } from './online'
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
  market: Market | null
}

type Part = 'diplomacy' | 'armies' | 'battles' | 'notices'

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
    market: initialMarket,
  })
  const timers = useRef(new Map<Part, number>())

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
    for (const part of ['diplomacy', 'armies', 'battles', 'notices'] as Part[]) refresh(part, 0)
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
  const onMarket = useCallback((market: Market) => setLayer((l) => ({ ...l, market })), [])
  const dropNotices = useCallback((ids: number[]) => setLayer((l) => ({ ...l, notices: l.notices.filter((n) => !ids.includes(n.id)) })), [])

  return { layer, refreshAll, onChange, onMarket, dropNotices }
}
