import { balance } from './balance'
import { armoryOf, population, soldiersOf } from './economy'
import type { Kingdom } from './economy'
import { RESEARCH } from './institutions'
import { townScore } from './towns'

// The lobby's ranking (CLAUDE.md §10): a kingdom's score from its wealth, what it has built, its people, its army, the
// battles it has won and what it has learnt. Worked out by the server whenever it writes a kingdom, so every member
// sees the same table without seeing anyone's stores.

export interface Score {
  total: number
  economy: number
  growth: number
  people: number
  army: number
  glory: number
  learning: number
}

const INSTITUTIONS = new Set(['university', 'hospital', 'temple', 'barracks', 'spyHouse', 'market', 'warehouse'])

export function scoreOf(k: Kingdom, at: number): Score {
  const s = balance.society.score
  const economy = k.stock.gold / s.goldPer + (k.stock.food + k.stock.materials + k.stock.arms) / s.goodsPer
  let growth = 0
  for (const b of k.buildings) {
    if (b.doneAt > at) continue
    const level = b.level ?? 1
    growth +=
      b.kind === 'palace'
        ? level * s.palacePerLevel
        : b.kind === 'wall' || b.kind === 'gate'
          ? s.wallPer
          : level * (INSTITUTIONS.has(b.kind) ? s.institutionPerLevel : s.buildingPerLevel)
  }
  const { villagers } = population(k, at)
  const people = (villagers + soldiersOf(k)) * s.perPerson
  const armory = armoryOf(k)
  const army = soldiersOf(k) * s.perSoldier + (armory.sword + armory.shield + armory.bow) / s.weaponsPer
  const glory =
    (k.record?.battlesWon ?? 0) * s.battleWon + (k.record?.siegesWon ?? 0) * s.siegeWon + (k.queen ? s.queen : 0) + (k.hostages?.length ?? 0) * s.hostage +
    // Towns held: known to all, more for the loyal ones (CLAUDE.md §8.4).
    (k.towns ?? []).reduce((sum, h) => sum + townScore(h, at), 0)
  const learning = (k.researches ?? []).filter((r) => r.doneAt <= at && RESEARCH[r.id]).reduce((sum, r) => sum + RESEARCH[r.id].tier * s.researchPerTier, 0)
  const parts = { economy, growth, people, army, glory, learning }
  const rounded = Object.fromEntries(Object.entries(parts).map(([key, v]) => [key, Math.round(v)])) as Omit<Score, 'total'>
  return { ...rounded, total: Object.values(rounded).reduce((a, b) => a + b, 0) }
}
