import { balance } from './balance'
import { book, goldCap, palaceLevel, population } from './economy'
import type { Cost, Kingdom } from './economy'
import { levelOf } from './institutions'
import { countShips, navyOf } from './navy'

// The season's goals (CLAUDE.md §9.9): tracks of three tiers each (build ten buildings, then twenty-five, then fifty;
// raise the palace; have children; win battles…), read off the kingdom as it stands. A tier reached is kept with the
// moment it was reached, earns a star and a small purse; the stars together make the lord's title. Nothing here gives
// an edge worth chasing: the purses are a token.

const G = balance.goals

export type GoalTrack = keyof typeof G.tracks
export const GOAL_TRACKS = Object.keys(G.tracks) as GoalTrack[]
export type GoalsReached = Partial<Record<string, { tier: number; at: number }>>

const TRACKS = G.tracks as Record<string, { measure: string; tiers: number[] }>

export const goalTiers = (track: string) => TRACKS[track]?.tiers ?? []

// Where the kingdom stands on a track's measure now.
export function goalMeasure(k: Kingdom, track: string, at: number): number {
  switch (TRACKS[track]?.measure) {
    case 'buildings':
      return k.buildings.filter((b) => b.doneAt <= at && b.kind !== 'wall' && b.kind !== 'gate').length
    case 'houses':
      return k.buildings.filter((b) => b.kind === 'house' && b.doneAt <= at).length
    case 'palace':
      return palaceLevel(k, at)
    case 'villagers':
      return population(k, at).villagers
    case 'children':
      return k.dynasty?.children.length ?? 0
    case 'battlesWon':
      return k.record?.battlesWon ?? 0
    case 'towns':
      return k.towns?.length ?? 0
    case 'researches':
      return (k.researches ?? []).filter((r) => r.doneAt <= at).length
    case 'expeditions':
      return k.record?.expeditions ?? 0
    case 'tradeGold':
      return k.trade.ledger?.gold ?? 0
    case 'gold':
      return Math.floor(k.stock.gold)
    case 'temple':
      return levelOf(k, 'temple', at)
    case 'ships': {
      const n = navyOf(k)
      return countShips(n.harbour) + n.fleets.reduce((s, f) => s + countShips(f.ships), 0)
    }
    default:
      return 0
  }
}

// The tier a track's measure has reached now (0 below the first).
export function tierFor(k: Kingdom, track: string, at: number) {
  const v = goalMeasure(k, track, at)
  return goalTiers(track).filter((t) => v >= t).length
}

export const goalTier = (k: Pick<Kingdom, 'goals'>, track: string) => k.goals?.[track]?.tier ?? 0
export const goalReward = (tier: number): Cost => (G.rewardByTier[tier - 1] ?? {}) as Cost

// Stars: every tier reached on every track.
export const goalStars = (k: Pick<Kingdom, 'goals'>) => Object.values(k.goals ?? {}).reduce((n, g) => n + (g?.tier ?? 0), 0)
export const goalStarsMax = () => GOAL_TRACKS.reduce((n, t) => n + goalTiers(t).length, 0)

// The lord's title from the stars, and the next one up.
export function goalRank(k: Pick<Kingdom, 'goals'>) {
  const stars = goalStars(k)
  const ranks = G.ranks
  let i = 0
  for (let j = 0; j < ranks.length; j++) if (stars >= ranks[j].stars) i = j
  return { stars, title: ranks[i].title, next: ranks[i + 1] ?? null }
}

// Tiers reached since they were last looked at: kept, and their purses paid (as far as the treasury has room).
export function checkGoals(k: Kingdom, at: number): { kingdom: Kingdom; reached: { track: string; tier: number; gold: number }[] } {
  if (!k.buildings.some((b) => b.kind === 'palace')) return { kingdom: k, reached: [] }
  const reached: { track: string; tier: number; gold: number }[] = []
  let goals: GoalsReached | undefined
  for (const track of GOAL_TRACKS) {
    const had = goalTier(k, track)
    if (had >= goalTiers(track).length) continue
    const now = tierFor(k, track, at)
    if (now <= had) continue
    goals = { ...(goals ?? k.goals), [track]: { tier: now, at } }
    for (let t = had + 1; t <= now; t++) reached.push({ track, tier: t, gold: goalReward(t).gold ?? 0 })
  }
  if (!goals) return { kingdom: k, reached }
  const want = reached.reduce((n, r) => n + r.gold, 0)
  const gold = Math.max(0, Math.min(want, Math.floor(goldCap(k, at) - k.stock.gold)))
  let next: Kingdom = { ...k, goals, stock: { ...k.stock, gold: k.stock.gold + gold } }
  if (gold > 0) next = book(next, { other: gold })
  return { kingdom: next, reached }
}
