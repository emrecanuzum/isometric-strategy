import { balance, findRoute, routeLength } from '@game/shared'
import type { Blocked, Point, World } from '@game/shared'
import { ROUTE_STEP, drawnRoads, findBridges, resampleRoute, roundRoute } from './chunkPainter'
import { cityStructures } from './cities'

// The crowns' patrols ride the trade routes (CLAUDE.md §7.8): out of the capital by a road's gate (so through the
// gates of both walls), along the roads to the point nearest the lord, and across country only for the last stretch.

interface Graph {
  points: Point[]
  edges: { to: number; length: number }[][]
  // Points by tile bucket, for finding the nearest.
  buckets: Map<number, number[]>
}

const BUCKET = 16
// How far the capitals' outer wall stands outside their own tiles (see cities.ts).
const OUTER = 10
// Points of different roads closer than this are joined (where roads meet at an inn or a city).
const JOIN = 1.5

const graphs = new WeakMap<World, Graph>()

function graphOf(world: World): Graph {
  let graph = graphs.get(world)
  if (graph) return graph
  const points: Point[] = []
  const edges: { to: number; length: number }[][] = []
  const buckets = new Map<number, number[]>()
  const bucketOf = (p: Point) => Math.floor(p.y / BUCKET) * 4096 + Math.floor(p.x / BUCKET)
  const link = (a: number, b: number) => {
    const length = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y)
    edges[a].push({ to: b, length })
    edges[b].push({ to: a, length })
  }
  // Inside a capital's outer wall the roads run close by its towers and houses: patrols find their own way there.
  const S = balance.cities.size
  const walledIn = (p: Point) => world.cities.some((c) => p.x > c.x - OUTER - 1 && p.y > c.y - OUTER - 1 && p.x < c.x + S + OUTER + 1 && p.y < c.y + S + OUTER + 1)
  for (const road of drawnRoads(world)) {
    // Over water the road is a straight bridge deck (as the caravans walk it), not the road's curve beside it; a point
    // every tile or so elsewhere.
    const fine = resampleRoute(roundRoute(road.points))
    const onDeck = new Uint8Array(fine.length)
    for (const bridge of findBridges(world, fine)) {
      for (let i = bridge.from; i <= bridge.to; i++) {
        const t = (i - bridge.from) / Math.max(1, bridge.to - bridge.from)
        fine[i] = { x: bridge.ax + (bridge.bx - bridge.ax) * t, y: bridge.ay + (bridge.by - bridge.ay) * t }
        onDeck[i] = 1
      }
    }
    const every = Math.round(1 / ROUTE_STEP)
    const line = fine.filter((_, i) => i % every === 0 || i === fine.length - 1 || (onDeck[i] && (!onDeck[i - 1] || !onDeck[i + 1])))
    const first = points.length
    let last = -1
    for (const p of line) {
      // A road through a capital is cut there, so nothing joins its two sides across the walls.
      if (walledIn(p)) {
        last = -1
        continue
      }
      const i = points.length
      points.push(p)
      edges.push([])
      // Joined to the points of roads already in that lie close by.
      for (let by = Math.floor(p.y / BUCKET) - 1; by <= Math.floor(p.y / BUCKET) + 1; by++) {
        for (let bx = Math.floor(p.x / BUCKET) - 1; bx <= Math.floor(p.x / BUCKET) + 1; bx++) {
          for (const j of buckets.get(by * 4096 + bx) ?? []) {
            if (j >= first) continue
            if (Math.hypot(points[j].x - p.x, points[j].y - p.y) < JOIN) link(i, j)
          }
        }
      }
      if (last >= 0) link(last, i)
      const key = bucketOf(p)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(i)
      last = i
    }
  }
  graph = { points, edges, buckets }
  graphs.set(world, graph)
  return graph
}

// The road point nearest `p`, searching outward bucket by bucket.
function nearest(graph: Graph, p: Point, reach = 6): number {
  let best = -1
  let bestD = Infinity
  const cx = Math.floor(p.x / BUCKET)
  const cy = Math.floor(p.y / BUCKET)
  for (let r = 0; r <= reach; r++) {
    for (let by = cy - r; by <= cy + r; by++) {
      for (let bx = cx - r; bx <= cx + r; bx++) {
        if (Math.max(Math.abs(bx - cx), Math.abs(by - cy)) !== r) continue
        for (const i of graph.buckets.get(by * 4096 + bx) ?? []) {
          const d = Math.hypot(graph.points[i].x - p.x, graph.points[i].y - p.y)
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
      }
    }
    // Anything in a further ring is at least r buckets away.
    if (best >= 0 && bestD <= r * BUCKET) break
  }
  return best
}

// What a patrol rides round: the crown capitals' walls and buildings (the outer town is drawn only, so the ground knows
// nothing of it) and the lords' buildings and standing walls; it goes through any gate, the crowns' and the lords'.
type Holding = { buildings: { kind: string; x: number; y: number; size: number; broken?: boolean }[] }
const cityBlocks = new WeakMap<World, Set<number>>()
export function patrolBlocker(world: World, lords: Holding[]): Blocked {
  let city = cityBlocks.get(world)
  if (!city) {
    city = new Set()
    for (const st of cityStructures(world)) {
      if (st.look === 'gate' || st.look === 'gateY' || st.pier) continue
      for (let y = st.y; y < st.y + st.size; y++) for (let x = st.x; x < st.x + st.size; x++) city.add(y * 65536 + x)
    }
    cityBlocks.set(world, city)
  }
  const taken = new Set(city)
  for (const lord of lords) {
    for (const b of lord.buildings) {
      if (b.kind === 'farm' || b.kind === 'gate' || (b.kind === 'wall' && b.broken)) continue
      for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) taken.add(y * 65536 + x)
    }
  }
  return (x, y) => taken.has(y * 65536 + x)
}

// A patrol's ride from crown capital `city` (its corner tile) to `door`: by the roads where they lead the way, or
// straight across country from the capital's front gate when there are none.
export function patrolRoute(world: World, city: Point, gate: Point, door: Point, blocked?: Blocked): Point[] | null {
  const graph = graphOf(world)
  const S = balance.cities.size
  // The roads just outside the capital's outer wall: inside it the patrol finds its own way, round the houses and out
  // through a gate, since the roads there run close by the towers.
  const lo = -OUTER - 4
  const hi = S + OUTER + 4
  const sources: number[] = []
  graph.points.forEach((p, i) => {
    const x = p.x - city.x
    const y = p.y - city.y
    const outside = x < -OUTER - 1 || y < -OUTER - 1 || x > S + OUTER + 1 || y > S + OUTER + 1
    if (outside && x > lo && y > lo && x < hi && y < hi) sources.push(i)
  })
  const end = nearest(graph, door)
  if (sources.length === 0 || end < 0) return findRoute(world, gate, door, blocked)
  // Shortest way along the roads (Dijkstra; the graph is small).
  const dist = new Float64Array(graph.points.length).fill(Infinity)
  const came = new Int32Array(graph.points.length).fill(-1)
  const done = new Uint8Array(graph.points.length)
  const open: number[] = []
  for (const s of sources) {
    dist[s] = 0
    open.push(s)
  }
  while (open.length > 0) {
    let k = 0
    for (let q = 1; q < open.length; q++) if (dist[open[q]] < dist[open[k]]) k = q
    const i = open[k]
    open[k] = open[open.length - 1]
    open.pop()
    if (done[i]) continue
    done[i] = 1
    if (i === end) break
    for (const { to, length } of graph.edges[i]) {
      if (done[to] || dist[i] + length >= dist[to]) continue
      dist[to] = dist[i] + length
      came[to] = i
      open.push(to)
    }
  }
  if (!Number.isFinite(dist[end])) return findRoute(world, gate, door, blocked)
  const road: Point[] = []
  for (let i = end; i >= 0; i = came[i]) road.push(graph.points[i])
  road.reverse()
  const out = findRoute(world, gate, road[0], blocked)
  const last = findRoute(world, road[road.length - 1], door, blocked)
  if (!out || !last) return findRoute(world, gate, door, blocked)
  const route = [...out, ...road.slice(1), ...last.slice(1)]
  // The roads only when they do not lead far out of the way.
  const direct = findRoute(world, gate, door, blocked)
  if (direct && routeLength(route) > routeLength(direct) * 2) return direct
  return route
}
