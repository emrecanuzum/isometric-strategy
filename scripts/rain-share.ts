// How much of each season it rains or snows (CLAUDE.md §4.2.1): `bun scripts/rain-share.ts`.
import { weatherAt, weatherSeason } from '../packages/shared/src/weather'

const tally: Record<string, [number, number]> = {}
const step = 20_000
for (let key = 1; key <= 20; key++) {
  const from = Date.UTC(2026, 0, 1) + key * 7_919_000
  for (let at = from; at < from + 72 * 3_600_000; at += step) {
    const s = weatherSeason(at)
    const w = weatherAt(key * 104_729, at)
    tally[s] ??= [0, 0]
    tally[s][0]++
    if (w.rain > 0.05 || w.snow) tally[s][1]++
  }
}
for (const [s, [n, wet]] of Object.entries(tally)) console.log(s.padEnd(7), `${((wet / n) * 100).toFixed(1)}%`)
