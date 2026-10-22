import { balance } from './balance'
import type { OutlawPressure } from './outlawPressure'

// How often the server tells the same kind of news (CLAUDE.md §9.8): what it works out every minute from the state of
// things is told when it changes, not every minute it holds. Kept here so the rules can be checked away from the
// server (scripts/notice-repeat-check.ts).

// A town's revolt the server has not told yet: 'new' to be told, 'again' when it only goes on (it started as the told
// one ended, the loyalty still low), null when there is nothing to tell.
export function revoltNews(h: { revoltUntil?: number; revoltTold?: number }, at: number): 'new' | 'again' | null {
  if (h.revoltUntil === undefined || h.revoltUntil <= at || h.revoltTold === h.revoltUntil) return null
  const again = h.revoltTold !== undefined && h.revoltUntil - balance.towns.revolt.seconds * 1000 <= h.revoltTold + 120_000
  return again ? 'again' : 'new'
}

export type OutlawNews = 'outlaw_road' | 'outlaw_road_clear' | 'pirate_waters' | 'pirate_waters_clear'

// The bandits' and pirates' hold on a lord worked out anew (`next`, against `before`): the pressure to write (with when
// each was last told) and the news to tell. The raids come and go every half hour: a rise or a clearing is told at
// most once per `noticeEveryMinutes`, and a clearing only after a rise was told.
export function outlawNews(before: OutlawPressure | undefined, next: OutlawPressure, at: number) {
  const O = balance.outlaws
  const p: OutlawPressure = { ...next, roadTold: before?.roadTold, seaTold: before?.seaTold }
  const news: OutlawNews[] = []
  const quiet = (told: number | undefined, minutes: number) => told === undefined || at - told >= minutes * 60_000
  const road = before?.road ?? 0
  const sea = before?.sea ?? 0
  const roadNews = p.road >= road + O.road.noticeStep ? 'outlaw_road' : road > 0 && p.road === 0 ? 'outlaw_road_clear' : null
  const seaNews = p.sea >= sea + O.sea.noticeStep ? 'pirate_waters' : sea > 0 && p.sea === 0 ? 'pirate_waters_clear' : null
  if (roadNews && quiet(p.roadTold, O.road.noticeEveryMinutes) && (roadNews === 'outlaw_road' || p.roadTold !== undefined)) {
    p.roadTold = at
    news.push(roadNews)
  }
  if (seaNews && quiet(p.seaTold, O.sea.noticeEveryMinutes) && (seaNews === 'pirate_waters' || p.seaTold !== undefined)) {
    p.seaTold = at
    news.push(seaNews)
  }
  return { pressure: p, news }
}
