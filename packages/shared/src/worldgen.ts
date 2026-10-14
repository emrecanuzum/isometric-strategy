import { balance } from './balance'
import type { Point } from './iso'

export const Terrain = {
  Grass: 0,
  Forest: 1,
  Mountain: 2,
  Swamp: 3,
  Desert: 4,
  Lake: 5,
  River: 6,
} as const

export const Feature = {
  None: 0,
  Road: 1,
  Bridge: 2,
  Inn: 3,
  City: 4,
} as const

// Worlds are made the same way from the same seed for as long as a lobby lives; a lobby keeps the revision its world
// was made with. 1: before the free cities.
export const WORLD_REV = 2

export interface Polyline {
  points: Point[]
  width: number
}

export interface World {
  seed: number
  size: number
  terrain: Uint8Array
  feature: Uint8Array
  inns: Point[]
  // The free cities (CLAUDE.md §4.2): the back corner of each one's square of balance.cities.size tiles.
  cities: Point[]
  // Continuous fields and thresholds the terrain was classified from; the client shades the ground with them.
  // River beds are cut into the elevation, so rivers are the same water as lakes.
  elevation: Float32Array
  moisture: Float32Array
  // Ground height of each tile center above the water surface, in screen pixels (see height.ts).
  height: Float32Array
  levels: {
    lake: number
    mountain: number
    snow: number
    swampMaxElevation: number
    desert: number
    forest: number
    swamp: number
  }
  // Center lines of trade routes in tile coordinates, for drawing them as smooth curves.
  roads: Polyline[]
  // Rounded center lines of rivers in tile coordinates, in the direction the water flows.
  rivers: Polyline[]
  // Stone bridges over rivers away from the trade routes, from a land point on one bank to one on the other.
  crossings: Crossing[]
}

export interface Crossing {
  a: Point
  b: Point
}

// Rivers and roads are routed on a grid this many times coarser than the tile grid.
const COARSE = 4

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const top = hash(xi, yi, seed) * (1 - u) + hash(xi + 1, yi, seed) * u
  const bottom = hash(xi, yi + 1, seed) * (1 - u) + hash(xi + 1, yi + 1, seed) * u
  return top * (1 - v) + bottom * v
}

function fbm(x: number, y: number, seed: number) {
  let sum = 0
  let amplitude = 1
  let frequency = 1
  let norm = 0
  for (let octave = 0; octave < 5; octave++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 101)
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / norm
}

// Mountain shape, 0..1: creased ridge lines, broken up into separate massifs with low saddles between them.
function ridged(x: number, y: number, seed: number) {
  const crease = (n: number) => 1 - Math.abs(2 * n - 1)
  const ridge = crease(valueNoise(x, y, seed)) * 0.75 + crease(valueNoise(x * 2.3, y * 2.3, seed + 57)) * 0.25
  const massif = Math.min(1, Math.max(0, (valueNoise(x * 0.6, y * 0.6, seed + 113) - 0.3) / 0.4))
  return ridge ** 1.6 * (0.2 + 0.8 * massif * massif * (3 - 2 * massif))
}

function quantiles(values: Float32Array) {
  const sample = new Float32Array(Math.ceil(values.length / 16))
  for (let i = 0; i < sample.length; i++) sample[i] = values[i * 16]
  sample.sort()
  return (q: number) => sample[Math.min(sample.length - 1, Math.max(0, Math.floor(q * sample.length)))]
}

// Dijkstra over an 8-connected square grid; returns the cell indices from start to the first goal reached.
function findPath(
  side: number,
  start: number,
  isGoal: (cell: number) => boolean,
  cost: (cell: number) => number,
): number[] {
  const dist = new Float32Array(side * side).fill(Infinity)
  const prev = new Int32Array(side * side).fill(-1)
  const heap: number[] = []
  const push = (cell: number) => {
    let i = heap.push(cell) - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (dist[heap[parent]] <= dist[heap[i]]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l
        if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }

  dist[start] = 0
  push(start)
  while (heap.length > 0) {
    const cell = pop()
    if (isGoal(cell)) {
      const path = []
      for (let c = cell; c !== -1; c = prev[c]) path.push(c)
      return path.reverse()
    }
    const cx = cell % side
    const cy = (cell - cx) / side
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue
        const next = ny * side + nx
        const d = dist[cell] + cost(next) * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1)
        if (d < dist[next]) {
          dist[next] = d
          prev[next] = cell
          push(next)
        }
      }
    }
  }
  return []
}

// Visits every tile on a 4-connected line, so the line has no diagonal gaps on the diamond grid.
function walkLine(from: Point, to: Point, visit: (x: number, y: number) => void) {
  let { x, y } = from
  const dx = Math.abs(to.x - x)
  const dy = Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1
  const sy = y < to.y ? 1 : -1
  let err = dx - dy
  visit(x, y)
  while (x !== to.x || y !== to.y) {
    const e2 = err * 2
    if (e2 > -dy) {
      err -= dy
      x += sx
      visit(x, y)
    }
    if (e2 < dx && (x !== to.x || y !== to.y)) {
      err += dx
      y += sy
      visit(x, y)
    }
  }
}

function pickSpaced(
  count: number,
  minSpacing: number,
  candidate: () => Point | null,
): Point[] {
  const picked: Point[] = []
  for (let attempt = 0; attempt < count * 400 && picked.length < count; attempt++) {
    const p = candidate()
    if (!p) continue
    if (picked.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minSpacing)) picked.push(p)
  }
  return picked
}

export function generateWorld(seed: number, rev = WORLD_REV): World {
  const cfg = balance.world
  const size = balance.map.chunkSize * balance.map.worldChunks
  const random = mulberry32(seed)
  const terrain = new Uint8Array(size * size)
  const feature = new Uint8Array(size * size)

  const elevation = new Float32Array(size * size)
  const moisture = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      elevation[i] = fbm(x / cfg.elevationScale, y / cfg.elevationScale, seed)
      moisture[i] = fbm(x / cfg.moistureScale, y / cfg.moistureScale, seed + 7919)
    }
  }

  const elevationAt = quantiles(elevation)
  const moistureAt = quantiles(moisture)
  const lakeLevel = elevationAt(cfg.lakeFraction)
  const mountainLevel = elevationAt(1 - cfg.mountainFraction)
  const swampMaxElevation = elevationAt(cfg.swampMaxElevationFraction)
  const desertLevel = moistureAt(cfg.desertFraction)
  const forestLevel = moistureAt(1 - cfg.forestFraction)
  const swampLevel = moistureAt(1 - cfg.swampMoistureFraction)
  const snowLevel = elevationAt(1 - cfg.snowFraction)

  // High mountains ring the map, so the world seems to go on past its edges. The levels above come from the
  // ground inside the ring; the ring's inner border wanders, and the ground climbs toward the edge.
  const peak = mountainLevel + (snowLevel - mountainLevel) * cfg.borderPeak
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y)
      const wander = valueNoise(x / 37, y / 37, seed + 211) * 0.7 + valueNoise(x / 9, y / 9, seed + 213) * 0.3
      const band = cfg.borderTiles * (1 - cfg.borderJitter + 2 * cfg.borderJitter * wander)
      if (edge >= band) continue
      const t = 1 - edge / band
      const i = y * size + x
      elevation[i] += Math.max(0, peak - elevation[i]) * t * t * (3 - 2 * t)
    }
  }

  const classify = (e: number, m: number) => {
    if (e <= lakeLevel) return Terrain.Lake
    if (e >= mountainLevel) return Terrain.Mountain
    if (m >= swampLevel && e <= swampMaxElevation) return Terrain.Swamp
    if (m >= forestLevel) return Terrain.Forest
    if (m <= desertLevel) return Terrain.Desert
    return Terrain.Grass
  }
  for (let i = 0; i < terrain.length; i++) terrain[i] = classify(elevation[i], moisture[i])

  const side = size / COARSE
  const center = (cell: number): Point => ({
    x: (cell % side) * COARSE + COARSE / 2,
    y: Math.floor(cell / side) * COARSE + COARSE / 2,
  })
  const tileIndex = (cell: number) => {
    const p = center(cell)
    return p.y * size + p.x
  }
  const toCell = (p: Point) => Math.floor(p.y / COARSE) * side + Math.floor(p.x / COARSE)
  const randomTile = (margin: number): Point => ({
    x: margin + Math.floor(random() * (size - margin * 2)),
    y: margin + Math.floor(random() * (size - margin * 2)),
  })
  // Route points are nudged off the coarse lattice (the same way for every route through a cell), and routing
  // cost varies in broad patches, so rivers and roads wind instead of running in long straight lines.
  const pinned = new Set<number>()
  const routePoint = (cell: number): Point => {
    const p = center(cell)
    if (pinned.has(cell)) return p
    const nudge = (salt: number) => Math.round((hash(cell, salt, seed + 51) - 0.5) * 2 * cfg.routeJitter)
    return {
      x: Math.min(size - 1, Math.max(0, p.x + nudge(1))),
      y: Math.min(size - 1, Math.max(0, p.y + nudge(2))),
    }
  }
  const meander = (cell: number) =>
    0.35 + 1.65 * valueNoise((cell % side) * 0.13, Math.floor(cell / side) * 0.13, seed + 61)
  const paint = (path: number[], visit: (x: number, y: number) => void) => {
    for (let i = 1; i < path.length; i++) walkLine(routePoint(path[i - 1]), routePoint(path[i]), visit)
  }

  const riverCells = new Uint8Array(side * side)
  const onEdge = (cell: number) => {
    const x = cell % side
    const y = Math.floor(cell / side)
    return x === 0 || y === 0 || x === side - 1 || y === side - 1
  }
  // Per-cell jitter keeps rivers from running in long straight lines.
  const groundCost = (cell: number) =>
    (0.2 + (elevation[tileIndex(cell)] * cfg.riverElevationCost) ** 2) * (0.5 + hash(cell, 0, seed + 31)) * meander(cell)
  const riverCost = (cell: number) => (riverCells[cell] ? 0.2 : groundCost(cell))
  const roads: Polyline[] = []
  const rivers: Polyline[] = []
  // Distance from each tile to the nearest river bank: negative inside the channel, positive on land.
  const riverDistance = new Float32Array(size * size).fill(Infinity)
  const carve = (path: number[], width: number, spring = false) => {
    for (const cell of path) riverCells[cell] = 1
    let line = path.map(routePoint).map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }))
    // Corner cutting rounds the bends of the route.
    for (let pass = 0; pass < 2 && line.length > 2; pass++) {
      const smooth = [line[0]]
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]
        const b = line[i + 1]
        smooth.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
        smooth.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
      }
      smooth.push(line[line.length - 1])
      line = smooth
    }
    rivers.push({ points: line, width })
    const reach = Math.ceil(width + cfg.riverBankTiles)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const lengthSq = dx * dx + dy * dy || 1
      const xEnd = Math.min(size - 1, Math.floor(Math.max(a.x, b.x)) + reach)
      const yEnd = Math.min(size - 1, Math.floor(Math.max(a.y, b.y)) + reach)
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y)) - reach); y <= yEnd; y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x)) - reach); x <= xEnd; x++) {
          const t = Math.min(1, Math.max(0, ((x + 0.5 - a.x) * dx + (y + 0.5 - a.y) * dy) / lengthSq))
          const d = Math.hypot(x + 0.5 - a.x - dx * t, y + 0.5 - a.y - dy * t)
          // The channel swells and narrows along its course, and a stream starts thin at its spring.
          const grown = spring ? Math.min(1, 0.55 + (i + t) / cfg.springTaperPoints) : 1
          const half = (width / 2) * (0.8 + 0.7 * valueNoise(x * 0.17, y * 0.17, seed + 81)) * grown
          const index = y * size + x
          if (d - half < riverDistance[index]) riverDistance[index] = d - half
        }
      }
    }
  }

  // The main river snakes through every region of the map, so no kingdom starts far from water.
  const grid = cfg.mainRiverGrid
  const region = size / grid
  const waypoints: Point[] = []
  for (let row = 0; row < grid; row++) {
    for (let i = 0; i < grid; i++) {
      const col = row % 2 === 0 ? i : grid - 1 - i
      waypoints.push({
        x: Math.floor((col + 0.25 + random() * 0.5) * region),
        y: Math.floor((row + 0.25 + random() * 0.5) * region),
      })
    }
  }
  waypoints.unshift({ x: 0, y: waypoints[0].y })
  waypoints.push({ x: grid % 2 === 1 ? size - 1 : 0, y: waypoints[waypoints.length - 1].y })
  // Each leg ends anywhere near its waypoint and the next leg continues from there, which avoids dead-end spurs.
  const reach = region / 4
  let head = toCell(waypoints[0])
  const mainRiver = [head]
  for (let i = 1; i < waypoints.length; i++) {
    const target = waypoints[i]
    const last = i === waypoints.length - 1
    const path = findPath(
      side,
      head,
      (cell) => {
        const p = center(cell)
        return last ? onEdge(cell) : Math.hypot(p.x - target.x, p.y - target.y) <= reach
      },
      groundCost,
    )
    if (path.length === 0) continue
    mainRiver.push(...path.slice(1))
    head = path[path.length - 1]
  }
  carve(mainRiver, cfg.mainRiverWidth)

  // Streams rise in the mountains and run downhill until they join a river or leave the map.
  const sources = pickSpaced(cfg.riverCount, cfg.riverMinSpacing, () => {
    const p = randomTile(cfg.innEdgeMargin)
    return terrain[p.y * size + p.x] === Terrain.Mountain ? p : null
  })
  for (const source of sources) {
    const isMouth = (cell: number) => {
      if (riverCells[cell]) return true
      const p = center(cell)
      return onEdge(cell) && Math.hypot(p.x - source.x, p.y - source.y) >= size * cfg.riverMinLengthFraction
    }
    carve(findPath(side, toCell(source), isMouth, riverCost), cfg.riverWidth, true)
  }

  // Spread the bank distance over the whole map (chamfer transform) so valleys can be as wide as they need.
  const spread = (i: number, j: number, step: number) => {
    if (riverDistance[j] + step < riverDistance[i]) riverDistance[i] = riverDistance[j] + step
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (x > 0) spread(i, i - 1, 1)
      if (y > 0) spread(i, i - size, 1)
      if (x > 0 && y > 0) spread(i, i - size - 1, Math.SQRT2)
      if (x < size - 1 && y > 0) spread(i, i - size + 1, Math.SQRT2)
    }
  }
  for (let y = size - 1; y >= 0; y--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x
      if (x < size - 1) spread(i, i + 1, 1)
      if (y < size - 1) spread(i, i + size, 1)
      if (x < size - 1 && y < size - 1) spread(i, i + size + 1, Math.SQRT2)
      if (x > 0 && y < size - 1) spread(i, i + size - 1, Math.SQRT2)
    }
  }

  // Cut the rivers into the elevation as valleys: all water sits at lake level, and the ground's rise above it
  // fades in with distance from the bank. A river crossing or rising in the mountains therefore runs along a
  // valley floor, with the ridges around it sloping down to the water. Lakes are left alone, so a river simply
  // flows into them.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const d = riverDistance[i]
      if (terrain[i] === Terrain.Lake) continue
      if (d <= 0) {
        elevation[i] = lakeLevel - 0.0015 - Math.min(0.012, -d * 0.01)
        terrain[i] = Terrain.River
        continue
      }
      // The valley widens and narrows along the river.
      const reach = cfg.valleyTiles * (0.6 + 0.8 * valueNoise(x * 0.04, y * 0.04, seed + 83))
      if (d >= reach) continue
      const rise = 1 - (1 - d / reach) ** 2
      elevation[i] = lakeLevel + 0.0008 + (elevation[i] - lakeLevel) * rise
      terrain[i] = classify(elevation[i], moisture[i])
    }
  }

  // Height in screen pixels: gently rolling lowlands, ridged mountains above the mountain line.
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const e = elevation[i]
      if (e <= lakeLevel) continue
      height[i] = cfg.lowlandHeight * Math.min(1, (e - lakeLevel) / (mountainLevel - lakeLevel))
      // Rolling hills over all land; they fade out toward the water, so banks and valley floors stay low.
      const shore = Math.min(1, (e - lakeLevel) / ((mountainLevel - lakeLevel) * cfg.hillFadeFraction))
      const hill = Math.min(1, Math.max(0, (fbm(x / cfg.hillScale, y / cfg.hillScale, seed + 131) - 0.42) / 0.25))
      height[i] += cfg.hillHeight * shore * hill * hill * (3 - 2 * hill)
      if (e <= mountainLevel) continue
      // Foothills rise quickly at the mountain line, so there is little flat rock.
      const climb = Math.min(cfg.mountainHeightCap, ((e - mountainLevel) / (snowLevel - mountainLevel)) ** 0.6)
      const crest = ridged(x / cfg.ridgeScale, y / cfg.ridgeScale, seed + 91)
      height[i] += cfg.mountainHeight * climb * (1 - cfg.ridgeShare + cfg.ridgeShare * crest)
    }
  }

  // Inns sit on buildable land, spread across the map.
  const inns = pickSpaced(cfg.innCount, cfg.innMinSpacing, () => {
    const p = randomTile(cfg.innEdgeMargin)
    const cell = toCell(p)
    const t = terrain[tileIndex(cell)]
    const buildable = t === Terrain.Grass || t === Terrain.Forest || t === Terrain.Desert
    return buildable && !riverCells[cell] ? center(cell) : null
  })

  for (const inn of inns) pinned.add(toCell(inn))

  // One or two free cities on wide, level, dry land well inside the mountain ring and away from the inns. They have a
  // random draw of their own, so the rest of the world comes out as it did before them.
  const cities: Point[] = []
  if (rev >= 2) {
    const town = balance.cities
    const S = town.size
    const draw = mulberry32(seed ^ 0x51c17e5)
    const wanted = town.count[0] + Math.floor(draw() * (town.count[1] - town.count[0] + 1))
    const fits = (p: Point) => {
      let low = Infinity
      let high = -Infinity
      for (let y = p.y; y < p.y + S; y++) {
        for (let x = p.x; x < p.x + S; x++) {
          const i = y * size + x
          const t = terrain[i]
          if (t !== Terrain.Grass && t !== Terrain.Forest && t !== Terrain.Desert) return false
          low = Math.min(low, height[i])
          high = Math.max(high, height[i])
        }
      }
      if (high - low > town.maxSlope) return false
      const cx = p.x + S / 2
      const cy = p.y + S / 2
      return inns.every((inn) => Math.hypot(inn.x + 1 - cx, inn.y + 1 - cy) >= S / 2 + town.innGap)
    }
    for (let attempt = 0; attempt < wanted * 600 && cities.length < wanted; attempt++) {
      const p = {
        x: town.edgeMargin + Math.floor(draw() * (size - town.edgeMargin * 2 - S)),
        y: town.edgeMargin + Math.floor(draw() * (size - town.edgeMargin * 2 - S)),
      }
      if (cities.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < town.minSpacing) || !fits(p)) continue
      cities.push(p)
    }
    // In the order the server finds them in the tiles (citiesOf), so both name a city by the same index.
    cities.sort((a, b) => a.y - b.y || a.x - b.x)
    // The ground under a city is levelled, and the land around it slopes gently up or down to meet it.
    for (const c of cities) {
      let sum = 0
      for (let y = c.y; y < c.y + S; y++) for (let x = c.x; x < c.x + S; x++) sum += height[y * size + x]
      const level = sum / (S * S)
      const reach = town.flatBlend
      for (let y = Math.max(0, c.y - reach); y < Math.min(size, c.y + S + reach); y++) {
        for (let x = Math.max(0, c.x - reach); x < Math.min(size, c.x + S + reach); x++) {
          const d = Math.hypot(Math.max(c.x - 1 - x, 0, x - (c.x + S)), Math.max(c.y - 1 - y, 0, y - (c.y + S)))
          const t = Math.min(1, d / reach)
          const w = 1 - t * t * (3 - 2 * t)
          const i = y * size + x
          if (terrain[i] === Terrain.River || terrain[i] === Terrain.Lake) continue
          height[i] += (level - height[i]) * w
        }
      }
    }
  }
  // The roads meet at the inns and run into the middle of each city.
  const hubs: Point[] = [...inns, ...cities.map((c) => ({ x: c.x + balance.cities.size / 2, y: c.y + balance.cities.size / 2 }))]
  for (const hub of hubs) pinned.add(toCell(hub))

  // Trade routes: a spanning tree over the inns plus a few extra links so the network has loops.
  const links: [number, number][] = []
  const linked = new Set<string>()
  const addLink = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (a !== b && !linked.has(key)) {
      linked.add(key)
      links.push([a, b])
    }
  }
  const gap = (a: number, b: number) => Math.hypot(hubs[a].x - hubs[b].x, hubs[a].y - hubs[b].y)
  const inTree = new Set(hubs.length > 0 ? [0] : [])
  while (inTree.size < hubs.length) {
    let best: [number, number] | null = null
    for (const a of inTree) {
      for (let b = 0; b < hubs.length; b++) {
        if (!inTree.has(b) && (!best || gap(a, b) < gap(best[0], best[1]))) best = [a, b]
      }
    }
    addLink(best![0], best![1])
    inTree.add(best![1])
  }
  for (let a = 0; a < hubs.length; a++) {
    const nearest = hubs
      .map((_, b) => b)
      .filter((b) => b !== a)
      .sort((p, q) => gap(a, p) - gap(a, q))
    for (const b of nearest.slice(1, 1 + cfg.roadExtraLinks)) addLink(a, b)
  }

  const roadCells = new Uint8Array(side * side)
  const roadCost = [1, 1.6, 9, 3, 1.2, 25, 6]
  // Roads go round a free city unless they lead into it.
  const cityCells = new Int16Array(side * side).fill(-1)
  cities.forEach((c, k) => {
    for (let y = Math.floor(c.y / COARSE) - 1; y <= Math.floor((c.y + balance.cities.size) / COARSE); y++) {
      for (let x = Math.floor(c.x / COARSE) - 1; x <= Math.floor((c.x + balance.cities.size) / COARSE); x++) cityCells[y * side + x] = k
    }
  })
  for (const [a, b] of links) {
    const goal = toCell(hubs[b])
    const ends = [a - inns.length, b - inns.length]
    const path = findPath(side, toCell(hubs[a]), (cell) => cell === goal, (cell) => {
      if (cityCells[cell] >= 0 && !ends.includes(cityCells[cell])) return 60
      if (roadCells[cell]) return 0.3
      const base = riverCells[cell] ? roadCost[Terrain.River] : roadCost[terrain[tileIndex(cell)]]
      return base * meander(cell) * (0.7 + hash(cell, 3, seed + 71) * 0.6)
    })
    for (const cell of path) roadCells[cell] = 1
    roads.push({ points: path.map(routePoint).map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })), width: 1 })
    paint(path, (x, y) => {
      const i = y * size + x
      const wet = terrain[i] === Terrain.River || terrain[i] === Terrain.Lake
      feature[i] = wet ? Feature.Bridge : Feature.Road
    })
  }

  // A road into a free city ends at its wall, where the city's gate stands; inside are the city's own streets.
  const S = balance.cities.size
  const within = (c: Point, p: Point) => p.x >= c.x && p.y >= c.y && p.x <= c.x + S && p.y <= c.y + S
  for (const road of roads) {
    for (const end of [0, 1]) {
      const line = end === 0 ? road.points : road.points.slice().reverse()
      const c = cities.find((city) => within(city, line[0]))
      if (!c) continue
      const out = line.findIndex((p) => !within(c, p))
      if (out <= 0) continue
      // Where the last stretch inside crosses the wall.
      const p = line[out - 1]
      const q = line[out]
      let t = 1
      for (const [from, to, lo, hi] of [[p.x, q.x, c.x, c.x + S], [p.y, q.y, c.y, c.y + S]]) {
        if (to < lo) t = Math.min(t, (lo - from) / (to - from))
        if (to > hi) t = Math.min(t, (hi - from) / (to - from))
      }
      const gate = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
      const kept = [gate, ...line.slice(out)]
      road.points = end === 0 ? kept : kept.reverse()
    }
  }

  // Stone bridges cross the rivers here and there away from the trade routes, so both banks can be walked to.
  const crossings: Crossing[] = []
  const spans: Point[] = []
  for (let i = 0; i < feature.length; i++) if (feature[i] === Feature.Bridge) spans.push({ x: i % size, y: Math.floor(i / size) })
  const wet = (p: Point) => {
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (x < 0 || y < 0 || x >= size || y >= size) return true
    const t = terrain[y * size + x]
    return t === Terrain.River || t === Terrain.Lake
  }
  const tryCrossing = (p: Point, dx: number, dy: number): Crossing | null => {
    if (terrain[Math.floor(p.y) * size + Math.floor(p.x)] !== Terrain.River) return null
    const length = Math.hypot(dx, dy) || 1
    const nx = -dy / length
    const ny = dx / length
    const reachBank = (side: number) => {
      for (let s = 0; s <= cfg.stoneBridgeMaxSpan / 2; s += 0.25) {
        const q = { x: p.x + nx * s * side, y: p.y + ny * s * side }
        if (!wet(q)) return s
      }
      return -1
    }
    const sa = reachBank(-1)
    const sb = reachBank(1)
    if (sa < 0 || sb < 0) return null
    const a = { x: p.x - nx * (sa + 0.75), y: p.y - ny * (sa + 0.75) }
    const b = { x: p.x + nx * (sb + 0.75), y: p.y + ny * (sb + 0.75) }
    for (const q of [a, b]) {
      // Not in the gorges where rivers leave through the mountain ring.
      if (Math.min(q.x, q.y, size - q.x, size - q.y) < cfg.borderTiles || wet(q)) return null
      const i = Math.floor(q.y) * size + Math.floor(q.x)
      if (terrain[i] === Terrain.Mountain || height[i] > cfg.stoneBridgeMaxRise * 2) return null
    }
    const ha = height[Math.floor(a.y) * size + Math.floor(a.x)]
    const hb = height[Math.floor(b.y) * size + Math.floor(b.x)]
    if (Math.abs(ha - hb) > cfg.stoneBridgeMaxRise) return null
    const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) < cfg.stoneBridgeClearance
    if (spans.some(near) || crossings.some((c) => near(c.a))) return null
    return { a, b }
  }
  const [gapMin, gapMax] = cfg.stoneBridgeGap
  for (const river of rivers) {
    const line = river.points
    let travelled = 0
    let next = gapMin * random()
    for (let i = 1; i < line.length - 1; i++) {
      travelled += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y)
      if (travelled < next) continue
      const crossing = tryCrossing(line[i], line[i + 1].x - line[i - 1].x, line[i + 1].y - line[i - 1].y)
      if (!crossing) {
        next = travelled + 2
        continue
      }
      crossings.push(crossing)
      next = travelled + gapMin + random() * (gapMax - gapMin)
      const tile = (q: Point) => ({ x: Math.floor(q.x), y: Math.floor(q.y) })
      walkLine(tile(crossing.a), tile(crossing.b), (x, y) => {
        const t = terrain[y * size + x]
        if (t === Terrain.River || t === Terrain.Lake) feature[y * size + x] = Feature.Bridge
      })
    }
  }

  for (const inn of inns) {
    for (let oy = 0; oy < 2; oy++) {
      for (let ox = 0; ox < 2; ox++) feature[(inn.y + oy) * size + inn.x + ox] = Feature.Inn
    }
  }

  for (const c of cities) {
    for (let y = c.y; y < c.y + balance.cities.size; y++) {
      for (let x = c.x; x < c.x + balance.cities.size; x++) feature[y * size + x] = Feature.City
    }
  }

  return {
    seed,
    size,
    terrain,
    feature,
    inns,
    cities,
    elevation,
    moisture,
    height,
    levels: {
      lake: lakeLevel,
      mountain: mountainLevel,
      snow: snowLevel,
      swampMaxElevation,
      desert: desertLevel,
      forest: forestLevel,
      swamp: swampLevel,
    },
    roads,
    rivers,
    crossings,
  }
}

// The free cities of a world known only by its tiles (the server's): the back corner of every square of city tiles.
export function citiesOf(world: Pick<World, 'size' | 'feature'>): Point[] {
  const { size, feature } = world
  const found: Point[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (feature[i] !== Feature.City) continue
      if ((x > 0 && feature[i - 1] === Feature.City) || (y > 0 && feature[i - size] === Feature.City)) continue
      found.push({ x, y })
    }
  }
  return found
}

// The middle of a free city, in tile coordinates.
export const cityCenter = (city: Point): Point => ({ x: city.x + balance.cities.size / 2, y: city.y + balance.cities.size / 2 })

// Within the peace of a free city: no battle is fought this close to it.
export const inCityPeace = (cities: Point[], p: Point) =>
  cities.some((c) => {
    const m = cityCenter(c)
    return Math.hypot(m.x - p.x, m.y - p.y) <= balance.cities.safeTiles
  })

// Close enough to a free city for an army to rest there as at an inn.
export const nearCity = (cities: Point[], p: Point) =>
  cities.some((c) => {
    const m = cityCenter(c)
    return Math.hypot(m.x - p.x, m.y - p.y) <= balance.cities.restTiles
  })
