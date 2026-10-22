// The same dispatch over and over (CLAUDE.md §9.8): the news the server works out every minute from the state of
// things, the fortunes the client replays, and the backlog a lord away for a day comes back to.
// bun scripts/notice-repeat-check.ts [seeds…]
import { Feature, Terrain, advance, balance, bandsOf, boatsOf, foundKingdom, generateWorld, hash, outlawNews, pressureOf, revoltNews, townsRound } from '../packages/shared/src/index'
import type { HeldTown, OutlawPressure } from '../packages/shared/src/index'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const start = 1_800_000_000_000
let failed = 0
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`)
  if (!ok) failed++
}

// ---- 1. Bandits and pirates: a day of minute ticks, the old rule (every rise of a step) against outlawNews ----
const seeds = process.argv.slice(2).map(Number)
for (const seed of seeds.length > 0 ? seeds : [12345, 777]) {
  const world = generateWorld(seed)
  const { size } = world
  const roadSide: number[] = []
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    if (x < 80 || y < 80 || x > size - 80 || y > size - 80) continue
    if (world.feature[i] !== Feature.None || world.terrain[i] === Terrain.Lake || world.terrain[i] === Terrain.River || world.terrain[i] === Terrain.Mountain) continue
    if (world.feature[i + 1] === Feature.Road || world.feature[i - 1] === Feature.Road) roadSide.push(i)
  }
  const lords: { id: number; at: { x: number; y: number } }[] = []
  for (let n = 0; lords.length < 9 && n < 5000; n++) {
    const i = roadSide[Math.floor(hash(n, 3, seed) * roadSide.length)]
    const p = { x: (i % size) + 1, y: Math.floor(i / size) + 1 }
    if (lords.some((t) => Math.hypot(t.at.x - p.x, t.at.y - p.y) < 120)) continue
    lords.push({ id: lords.length + 1, at: p })
  }
  const bands = bandsOf(world, seed, [], lords)
  const boats = boatsOf(world, seed, [])
  // A palace at level 2 (not a newcomer) and a trade post by the road; a dock where there is one near.
  const kingdomOf = (at: { x: number; y: number }) => ({
    buildings: [
      { id: 1, kind: 'palace', x: at.x + 6, y: at.y + 6, size: 3, level: 2, doneAt: 0 },
      { id: 2, kind: 'tradePost', x: at.x - 1, y: at.y - 1, size: 2, level: 1, doneAt: 0 },
      { id: 3, kind: 'dock', x: at.x - 1, y: at.y - 1, size: 2, level: 1, doneAt: 0 },
    ],
    dockPlot: { x: at.x - 1, y: at.y - 1 },
  }) as never
  let oldMost = 0
  let newMost = 0
  let gapLeast = Infinity
  for (const lord of lords) {
    const k = kingdomOf(lord.at)
    let before: OutlawPressure | undefined
    let oldBefore: OutlawPressure | undefined
    let oldCount = 0
    const told: number[] = []
    for (let at = start; at < start + DAY; at += 60_000) {
      const fresh = pressureOf(world, seed, bands, boats, k, at)
      const O = balance.outlaws
      // The rule before: every rise of a step told, every clearing told.
      const ob = oldBefore ?? { road: 0, sea: 0 }
      if (fresh.road >= ob.road + O.road.noticeStep || (ob.road > 0 && fresh.road === 0)) oldCount++
      if (fresh.sea >= ob.sea + O.sea.noticeStep || (ob.sea > 0 && fresh.sea === 0)) oldCount++
      oldBefore = fresh
      const { pressure, news } = outlawNews(before, fresh, at)
      for (const _ of news) told.push(at)
      before = pressure
    }
    oldMost = Math.max(oldMost, oldCount)
    newMost = Math.max(newMost, told.length)
    // The same kind never twice within its quiet time (rise and clearing share it).
    for (let i = 1; i < told.length; i++) gapLeast = Math.min(gapLeast, told[i] - told[i - 1])
  }
  console.log(`seed ${seed}: bandits/pirates over a day, most dispatches for one lord: before ${oldMost}, now ${newMost}`)
  const allowed = 2 * Math.ceil(DAY / (balance.outlaws.road.noticeEveryMinutes * 60_000)) * 2
  check(newMost <= allowed, `at most ${allowed} a day (road and sea, rise and clearing)`)
  check(told2ok(gapLeast), `two road/sea dispatches never within a minute of each other (least gap ${gapLeast === Infinity ? '—' : `${Math.round(gapLeast / 60_000)} min`})`)
}
function told2ok(gap: number) {
  return gap >= 60_000
}

// ---- 2. A town that stays disloyal: the server's minute-by-minute word, before and with revoltNews ----
{
  const roundMs = balance.economy.productionSeconds * 1000
  const loyalties = [14, 18, 22, 24]
  for (const target of loyalties) {
    let held: HeldTown[] = [{ id: 1, name: 'Akova', kind: 'gold', loyalty: target, upkeep: 0, takenAt: start - DAY } as unknown as HeldTown]
    let oldCount = 0
    let newCount = 0
    let revolts = 0
    let lost = false
    let nextServer = start
    for (let at = start; at < start + DAY && !lost; at += roundMs) {
      // The loyalty held where it is (a lord's mood keeping its target there).
      held = held.map((h) => ({ ...h, loyalty: target }))
      const r = townsRound(held, at, roundMs, new Set(), { happiness: 50, ruler: 0, towns: 1 }, 1)
      revolts += r.events.filter((e) => e.kind === 'townRevolt').length
      if (r.lost.length > 0) lost = true
      held = r.towns
      if (at >= nextServer) {
        nextServer += 60_000
        held = held.map((h) => {
          const before = h.revoltUntil !== undefined && h.revoltUntil > at && (h as { revoltTold?: number }).revoltTold !== h.revoltUntil
          if (before) oldCount++
          const news = revoltNews(h as never, at)
          if (news === 'new') newCount++
          return news ? { ...h, revoltTold: h.revoltUntil } : h
        })
      }
    }
    console.log(`town at loyalty ${target}: ${revolts} revolt(s) began in a day${lost ? ' (broke free)' : ''}; dispatches before ${oldCount}, now ${newCount}`)
    check(newCount === revolts, `one dispatch per revolt (${revolts})`)
  }
}

// ---- 3. Fortunes replayed: the server's state comes back behind the local one ----
{
  const world = generateWorld(4242)
  const site = { x: world.size / 2, y: world.size / 2 }
  let k = foundKingdom(world, site, start, 'Deneme')
  k = { ...k, lobbyKey: 7, buildings: [...k.buildings, { id: 900, kind: 'palace', x: site.x, y: site.y, level: 2, doneAt: start } as never] }
  // The client's guard (App.tsx → tellFortune), as it stands.
  const told: Record<string, number> = {}
  const tell = (f: { scope?: string; start: number; fortune: string; until: number }) => {
    const key = `${f.scope ?? 'kingdom'}:${f.start}:${f.fortune}`
    if (told[key] !== undefined) return false
    told[key] = f.until
    return true
  }
  let raw = 0
  let shown = 0
  const run = (from: typeof k, to: number) => {
    let cur = from
    for (let at = (cur.nextProductionAt ?? start) - 1; at <= to; at += 10_000) {
      const r = advance(cur, at, null)
      cur = r.kingdom
      for (const e of r.events) {
        if (e.kind !== 'fortune' || e.until <= at) continue
        raw++
        if (tell(e as never)) shown++
      }
    }
    return cur
  }
  // Six hours on the client; the server's copy (two hours in) comes back and the last four hours are advanced again.
  const atTwo = run(k, start + 2 * HOUR)
  run(atTwo, start + 6 * HOUR)
  const once = shown
  run(atTwo, start + 6 * HOUR)
  console.log(`fortunes over 6 hours: ${once} popped up; replaying the last 4 hours from the server's copy began ${raw - once} again, ${shown - once} shown again`)
  check(once > 0, 'fortunes do begin in the run')
  check(shown === once, 'a replayed fortune does not pop up again')
}

// ---- 4. The backlog: hundreds of unseen notices, the client's page and fold (App.tsx, net/layer.ts) ----
{
  const S = balance.dialogs
  type N = { id: number; at: number; important: boolean; answer: boolean }
  const runs = (newestFirst: boolean, sweep: boolean) => {
    const now = start + DAY
    let unseen: N[] = []
    // A day of news: a tribute every 30 min (the last one still to answer), a revolt and a raid every 10 min.
    let id = 0
    for (let at = start; at <= now; at += 10 * 60_000) unseen.push({ id: ++id, at, important: true, answer: false })
    for (let at = start; at <= now; at += 30 * 60_000) unseen.push({ id: ++id, at, important: true, answer: now - at < 5 * 60_000 })
    unseen.sort((a, b) => a.at - b.at)
    let popups = 0
    let fetches = 0
    for (; fetches < 200 && unseen.length > 0; fetches++) {
      const page = newestFirst ? unseen.slice(-30) : unseen.slice(0, 30)
      const stale = page.filter((n) => !n.answer && now - n.at > (n.important ? S.shelfSeconds.important : S.shelfSeconds.news) * 1000)
      let left = page.filter((n) => !stale.includes(n))
      if (left.length > S.maxWaiting) {
        const keep = new Set([...left].sort((a, b) => Number(b.important) - Number(a.important) || b.at - a.at).slice(0, S.keepWhenFlooded))
        for (const n of left) if (!keep.has(n) && !n.answer) stale.push(n)
        left = left.filter((n) => keep.has(n) || n.answer)
      }
      popups += left.length
      const gone = new Set([...stale, ...left].map((n) => n.id))
      if (sweep && page.length >= 30 && stale.length > 0) {
        const upto = Math.max(...stale.map((n) => n.at))
        unseen = unseen.filter((n) => !gone.has(n.id) && !(n.at <= upto && !n.answer))
      } else unseen = unseen.filter((n) => !gone.has(n.id))
    }
    return { popups, fetches }
  }
  const before = runs(false, false)
  const now = runs(true, true)
  console.log(`a day's backlog (${Math.round(DAY / 600_000) + Math.round(DAY / 1_800_000) + 2} notices): before ${before.popups} popups over ${before.fetches} fetches, now ${now.popups} over ${now.fetches}`)
  check(now.fetches <= 2 && now.popups <= S.keepWhenFlooded + 1, `the backlog is told in one go (at most ${S.keepWhenFlooded} news + the live demand)`)
}

if (failed > 0) {
  console.log(`${failed} check(s) failed`)
  process.exit(1)
}
