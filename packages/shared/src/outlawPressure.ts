import { balance } from './balance'

// What the bandits on the roads and the pirates on the water do to a lord (CLAUDE.md §7.9, §8.5): the server works
// out how much of the road round the lord's trade post the bandits hold, and how many pirate boats roam the water by
// the lord's dock, and writes it into the lord's state (`outlaws`); `advance` reads it from there. Kept apart from
// outlaws.ts (the bands and boats themselves) so the economy needs nothing but the numbers.

export interface OutlawPressure {
  // The share (0–1) of the road within reach of the trade post held by bandits.
  road: number
  // The pirates' hold on the water by the dock (0–1).
  sea: number
  // How many bands and boats that is (for the panels), and when the server last worked it out (ms).
  bands?: number
  boats?: number
  at?: number
  // When the envoy last told of the road's or the water's hold (rising or clearing; ms): the raids come and go every
  // half hour, so the news is told at most once per `noticeEveryMinutes`.
  roadTold?: number
  seaTold?: number
}

const O = () => balance.outlaws

export const outlawsOf = (k: { outlaws?: OutlawPressure | null }): OutlawPressure => ({ road: k.outlaws?.road ?? 0, sea: k.outlaws?.sea ?? 0, bands: k.outlaws?.bands ?? 0, boats: k.outlaws?.boats ?? 0, at: k.outlaws?.at })

// The cut the bandits take of the merchant's gold, the factor on the pirates' odds against sea trade, the factor on
// what the dock and the fishing fleets land, and what it all does to the people's mood (capped).
export function outlawEffects(k: { outlaws?: OutlawPressure | null }) {
  const o = outlawsOf(k)
  const road = Math.max(0, Math.min(1, o.road))
  const sea = Math.max(0, Math.min(1, o.sea))
  const roadMood = road * O().road.happiness
  const seaMood = sea * O().sea.happiness
  const total = Math.min(O().happinessCap, roadMood + seaMood)
  return {
    road,
    sea,
    merchantCut: road * O().road.merchantCut,
    pirateFactor: 1 + sea * O().sea.pirateChance,
    fishFactor: Math.max(0, 1 - sea * O().sea.fishCut),
    // Negative (or 0): what the bandits and the pirates take off the people's mood, and the two parts of it.
    happiness: -total,
    roadHappiness: -(roadMood + seaMood > 0 ? (total * roadMood) / (roadMood + seaMood) : 0),
    seaHappiness: -(roadMood + seaMood > 0 ? (total * seaMood) / (roadMood + seaMood) : 0),
  }
}
