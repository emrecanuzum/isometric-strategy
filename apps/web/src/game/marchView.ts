import { Terrain, routeLength } from '@game/shared'
import type { Point, World } from '@game/shared'
import type { Decks } from './chunkPainter'

// The point `d` tiles along a path (clamped to its ends).
export function along(path: Point[], d: number): Point {
  if (d <= 0 || path.length < 2) return path[0]
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (d <= l) {
      const f = l ? d / l : 0
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * f, y: path[i - 1].y + (path[i].y - path[i - 1].y) * f }
    }
    d -= l
  }
  return path[path.length - 1]
}

// A march as it is drawn (CLAUDE.md §4.2.1 "Köprüler"): the route the server keeps, except where it crosses water. The
// server's way over a river runs over its bridge tiles, which zigzag and may lie a tile or a few beside the deck drawn
// (the drawn roads are mended, the server's tiles are not); there the march is drawn up the ramp onto the nearest deck,
// along the deck's middle line and down the far ramp, from a tile before the water to a tile after it. The stretch is
// walked in the same time as the route's own, so it starts and ends where the army really is: nothing jumps.
interface Crossing {
  // The stretch of the route (tiles along it) drawn over the deck, and the line drawn there.
  s0: number
  s1: number
  line: Point[]
  length: number
  // The water it spans and the deck drawn over it.
  sIn: number
  sOut: number
  deck: { a: Point; b: Point }
}
export interface MarchView {
  total: number
  // Where the army drawn stands `s` tiles along its route.
  at(s: number): Point
}
const CROSS_STEP = 0.25
const CROSS_MARGIN = 1
const CROSS_REACH = 12
const CROSS_MARGIN_MAX = 10
const CROSS_HURRY = 1.35
// How far out from a deck's end the march lines up with it.
const DECK_LEAD = 0.8

// The line drawn for the stretch s0..s1 of `path` whose water lies between sIn and sOut: up onto `deck` by its nearer end,
// along it and off it, or from (to) the deck's line abreast of the army where the route begins (ends) on the bridge.
function deckLine(path: Point[], total: number, s0: number, s1: number, sIn: number, sOut: number, deck: { a: Point; b: Point }): Point[] {
  const p0 = along(path, s0)
  const p1 = along(path, s1)
  const d = (u: Point, v: Point) => Math.hypot(u.x - v.x, u.y - v.y)
  const [e0, e1] = d(p0, deck.a) + d(p1, deck.b) <= d(p0, deck.b) + d(p1, deck.a) ? [deck.a, deck.b] : [deck.b, deck.a]
  const onLine = (p: Point) => {
    const dx = e1.x - e0.x
    const dy = e1.y - e0.y
    const l2 = dx * dx + dy * dy || 1
    const t = Math.min(1, Math.max(0, ((p.x - e0.x) * dx + (p.y - e0.y) * dy) / l2))
    return { x: e0.x + dx * t, y: e0.y + dy * t }
  }
  // A little way out from each end on the deck's line, so the march comes up the ramp head on, not onto its side.
  const l = d(e0, e1) || 1
  const lead = (e: Point, sign: number) => ({ x: e.x + ((e1.x - e0.x) / l) * DECK_LEAD * sign, y: e.y + ((e1.y - e0.y) / l) * DECK_LEAD * sign })
  const in0 = lead(e0, -1)
  const out1 = lead(e1, 1)
  const startsOn = sIn <= 1e-6
  const endsOn = sOut >= total - 1e-6
  return startsOn && endsOn
    ? [onLine(p0), onLine(p1)]
    : startsOn
      ? [onLine(p0), e1, out1, p1]
      : endsOn
        ? [p0, in0, e0, onLine(p1)]
        : [p0, in0, e0, e1, out1, p1]
}
export function marchView(world: World, decks: Decks, path: Point[]): MarchView {
  const total = routeLength(path)
  const wet = (p: Point) => {
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
    const t = world.terrain[y * world.size + x]
    return t === Terrain.River || t === Terrain.Lake
  }
  const crossings: Crossing[] = []
  if (path.length > 1 && total > 0) {
    const steps = Math.ceil(total / CROSS_STEP)
    const sAt = (i: number) => Math.min(total, i * CROSS_STEP)
    for (let i = 0; i <= steps; i++) {
      if (!wet(along(path, sAt(i)))) continue
      let j = i
      while (j + 1 <= steps && wet(along(path, sAt(j + 1)))) j++
      let sIn = sAt(i)
      const sOut = sAt(j)
      i = j
      const deck = decks.nearest(along(path, (sIn + sOut) / 2), CROSS_REACH)
      if (!deck) continue
      let last = crossings[crossings.length - 1]
      // More water by the same deck (the route dips back onto land halfway over): one crossing, the deck walked once.
      if (last && last.deck.a.x === deck.a.x && last.deck.a.y === deck.a.y && sIn - last.sOut < CROSS_MARGIN_MAX) {
        crossings.pop()
        sIn = last.sIn
        last = crossings[crossings.length - 1]
      }
      const lo = last ? last.s1 : 0
      if (sOut <= lo) continue
      // From a tile before the water to a tile after it, or further out where the deck lies well off the route, so the
      // drawn march never has to hurry much over it.
      let crossing: Crossing | null = null
      for (let margin = CROSS_MARGIN; margin <= CROSS_MARGIN_MAX; margin++) {
        const s0 = Math.max(lo, sIn - margin)
        const s1 = Math.min(total, sOut + margin)
        if (s1 <= s0) break
        const line = deckLine(path, total, s0, s1, sIn, sOut, deck)
        crossing = { s0, s1, line, length: routeLength(line), sIn, sOut, deck }
        if (crossing.length <= (s1 - s0) * CROSS_HURRY) break
      }
      if (crossing) crossings.push(crossing)
    }
  }
  return {
    total,
    at(s) {
      for (const c of crossings) {
        if (s < c.s0 || s > c.s1) continue
        return along(c.line, ((s - c.s0) / Math.max(1e-9, c.s1 - c.s0)) * c.length)
      }
      return along(path, s)
    },
  }
}
