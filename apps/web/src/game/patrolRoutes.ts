import { Terrain, balance, findRoute, routeHints, routeLength } from '@game/shared'
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
// nothing of it) and the lords' buildings (their fields too) and standing walls; it goes through any gate, the crowns'
// and the lords'.
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
  // The lords' gates it rides through by the middle, and their laid roads it keeps beside (see findRoute).
  const gates = new Set<number>()
  const roads = new Set<number>()
  for (const lord of lords) {
    for (const b of lord.buildings) {
      if (b.kind === 'gate') gates.add(b.y * 65536 + b.x)
      if (b.kind === 'road') roads.add(b.y * 65536 + b.x)
      if (b.kind === 'gate' || (b.kind === 'wall' && b.broken)) continue
      for (let y = b.y; y < b.y + b.size; y++) for (let x = b.x; x < b.x + b.size; x++) taken.add(y * 65536 + x)
    }
  }
  return routeHints((x, y) => taken.has(y * 65536 + x), { roads, gates })
}

// Where a crown's column halts at a lord's building (CLAUDE.md §7.8): its head on the free tile that best faces the
// building's front, close by it, and the squads behind gathered on the free tiles around that one (each a little apart
// from the others, all within a few tiles and reachable from it without crossing a wall or a building), not strung out
// along the road. `count`: the squads behind the head.
const HALT_REACH = 5
const HALT_GATHER = 3.6
const HALT_APART = 1.3
export function haltSpots(world: World, blocked: Blocked, stop: { x: number; y: number; size: number }, count: number): { door: Point; gather: Point[] } {
  const free = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
    const t = world.terrain[y * world.size + x]
    return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain && !blocked(x, y)
  }
  // How far a tile's middle lies from the building, and how good a place it is: close, in front of it (toward the
  // viewer, so the squads are not hidden behind it) and with open ground round it (the squads are drawn large).
  const cx = stop.x + stop.size / 2
  const cy = stop.y + stop.size / 2
  const score = (x: number, y: number) => {
    const px = x + 0.5
    const py = y + 0.5
    const dx = Math.max(stop.x - px, 0, px - (stop.x + stop.size))
    const dy = Math.max(stop.y - py, 0, py - (stop.y + stop.size))
    const behind = px + py < cx + cy ? 1.2 : 0
    let crowd = 0
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && !free(x + ox, y + oy)) crowd++
    return Math.hypot(dx, dy) + behind + crowd * 0.18
  }
  const fallback = { x: stop.x + stop.size + 1.6, y: stop.y + stop.size + 1.6 }
  let door: { x: number; y: number } | null = null
  let best = Infinity
  for (let y = stop.y - HALT_REACH; y < stop.y + stop.size + HALT_REACH; y++) {
    for (let x = stop.x - HALT_REACH; x < stop.x + stop.size + HALT_REACH; x++) {
      if (!free(x, y)) continue
      const v = score(x, y)
      if (v < best) [best, door] = [v, { x, y }]
    }
  }
  if (!door) return { door: fallback, gather: [] }
  // The free tiles reachable from the head's within a few tiles (8 ways, no cutting a corner past a blocked tile).
  const reach: { x: number; y: number; v: number }[] = []
  const seen = new Set<number>([door.y * 65536 + door.x])
  const queue = [door]
  for (let q = 0; q < queue.length; q++) {
    const t = queue[q]
    if (q > 0) reach.push({ ...t, v: score(t.x, t.y) + Math.hypot(t.x - door.x, t.y - door.y) * 0.35 })
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = t.x + dx
        const ny = t.y + dy
        const key = ny * 65536 + nx
        if ((!dx && !dy) || seen.has(key) || Math.hypot(nx - door.x, ny - door.y) > HALT_GATHER || !free(nx, ny)) continue
        if (dx && dy && (!free(t.x + dx, t.y) || !free(t.x, t.y + dy))) continue
        seen.add(key)
        queue.push({ x: nx, y: ny })
      }
    }
  }
  reach.sort((a, b) => a.v - b.v)
  const head = { x: door.x + 0.5, y: door.y + 0.5 }
  const gather: Point[] = []
  // Each squad a little apart from the rest; with too little room, closer.
  for (const apart of [HALT_APART, 0.95, 0]) {
    for (const t of reach) {
      if (gather.length >= count) break
      const p = { x: t.x + 0.5, y: t.y + 0.5 }
      if ([head, ...gather].some((o) => Math.hypot(o.x - p.x, o.y - p.y) < apart || (o.x === p.x && o.y === p.y))) continue
      gather.push(p)
    }
  }
  // Nearest the head first: the first squad behind it takes the closest place.
  gather.sort((a, b) => Math.hypot(a.x - head.x, a.y - head.y) - Math.hypot(b.x - head.x, b.y - head.y))
  return { door: head, gather }
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
