import { balance } from './balance'
import type { Kingdom } from './economy'

// The great works of a 5th-level palace (CLAUDE.md §9.8): the citadel that hardens the palace against a siege, the
// dynasty's memorial that the people are proud of, and the guild hall where the merchants sell dearer and buy cheaper.
// One of each, three levels each; what a level does is in balance.institutions.landmarks.

const L = () => balance.institutions.landmarks

// The finished level of the kingdom's building of `kind` (0 without one; one being raised counts at the level below).
function levelIn(k: Pick<Kingdom, 'buildings'>, kind: string, at: number) {
  const b = k.buildings.find((x) => x.kind === kind)
  if (!b) return 0
  const level = b.level ?? 1
  return b.doneAt <= at || b.moving ? level : level - 1
}

const byLevel = (values: readonly number[], level: number) => (level <= 0 ? 0 : values[Math.min(values.length - 1, level - 1)])

// The citadel in a siege of the palace: added to the defenders' roll (walls and catapults do not touch it), to the
// garrison's morale, and to the shield after the palace falls.
export function citadelOf(k: Pick<Kingdom, 'buildings'>, at: number) {
  const level = levelIn(k, 'citadel', at)
  const c = L().citadel
  return { level, dice: byLevel(c.keepDiceByLevel, level), morale: byLevel(c.moraleByLevel, level), shieldSeconds: byLevel(c.shieldSecondsByLevel, level) }
}

// The shield a palace taken now gets against the next siege (CLAUDE.md §8.3), longer behind a citadel.
export const siegeShieldMs = (k: Pick<Kingdom, 'buildings'>, at: number) => (balance.military.siege.shieldSeconds + citadelOf(k, at).shieldSeconds) * 1000

// The dynasty's memorial: the people's pride (added to the happiness target).
export const memorialHappiness = (k: Pick<Kingdom, 'buildings'>, at: number) => byLevel(L().memorial.happinessByLevel, levelIn(k, 'memorial', at))

// The guild hall: a share more for every unit the merchant sells, and a share off what the market building asks.
export function guildOf(k: Pick<Kingdom, 'buildings'>, at: number) {
  const level = levelIn(k, 'guildHall', at)
  const g = L().guildHall
  return { level, trade: byLevel(g.tradeByLevel, level), discount: byLevel(g.marketDiscountByLevel, level) }
}
