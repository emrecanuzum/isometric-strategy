import { balance, findRoute, routeLength } from '@game/shared'
import type { Point, World } from '@game/shared'
import { roundRoute } from './chunkPainter'

// The crowns' patrols ride the trade routes (CLAUDE.md §7.8): out of the capital by a road's gate (so through the
// gates of both walls), along the roads to the point nearest the lord, and across country only for the last stretch.

interface Graph {
  points: Point[]
  edges: { to: number; length: number }[][]
  // Points by tile bucket, for finding the nearest.
  buckets: Map<number, number[]>
}

const BUCKET = 16
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
  for (const road of world.roads) {
    const line = roundRoute(road.points)
    const first = points.length
    let last = -1
    for (const p of line) {
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

// A patrol's ride from crown capital `city` (its corner tile) to `door`: by the roads where they lead the way, or
// straight across country from the capital's front gate when there are none.
export function patrolRoute(world: World, city: Point, gate: Point, door: Point): Point[] | null {
  const graph = graphOf(world)
  const S = balance.cities.size
  // The roads' ends at the capital's walls.
  const sources: number[] = []
  graph.points.forEach((p, i) => {
    if (p.x > city.x - 2 && p.y > city.y - 2 && p.x < city.x + S + 2 && p.y < city.y + S + 2) sources.push(i)
  })
  const end = nearest(graph, door)
  if (sources.length === 0 || end < 0) return findRoute(world, gate, door)
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
  if (!Number.isFinite(dist[end])) return findRoute(world, gate, door)
  const road: Point[] = []
  for (let i = end; i >= 0; i = came[i]) road.push(graph.points[i])
  road.reverse()
  const last = findRoute(world, road[road.length - 1], door)
  if (!last) return findRoute(world, gate, door)
  const route = [...road, ...last.slice(1)]
  // The roads only when they do not lead far out of the way.
  const direct = findRoute(world, gate, door)
  if (direct && routeLength(route) > routeLength(direct) * 2) return direct
  return route
}
