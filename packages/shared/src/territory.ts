import { balance } from './balance'
import type { Point } from './iso'
import { Feature, Terrain } from './worldgen'
import type { World } from './worldgen'

export interface Rect {
  x: number
  y: number
  size: number
}

// A kingdom's buildable area is a square of parcels around its center; it keeps its center as it grows.
export function territoryRect(center: Point, stage: number): Rect {
  const { parcelTiles, stageParcels } = balance.territory
  const size = stageParcels[stage] * parcelTiles
  const snap = (v: number) => Math.round(v / parcelTiles) * parcelTiles
  return { x: snap(center.x) - size / 2, y: snap(center.y) - size / 2, size }
}

export const TileRule = {
  Free: 0,
  Blocked: 1,
  DockOnly: 2,
  TunnelOnly: 3,
  TradePostOnly: 4,
} as const

const isWater = (terrain: number) => terrain === Terrain.Lake || terrain === Terrain.River

// How many tiles the body of water each water tile belongs to holds (0 on land), worked out once per world. A shore
// takes a dock only on real water: a pond of a few tiles lost among the trees has no room for a jetty.
const bodies = new WeakMap<Uint8Array, Int32Array>()
function waterBodies(world: Pick<World, 'size' | 'terrain'>) {
  let out = bodies.get(world.terrain)
  if (out) return out
  const N = world.size
  out = new Int32Array(N * N)
  const members: number[] = []
  for (let start = 0; start < N * N; start++) {
    if (out[start] || !isWater(world.terrain[start])) continue
    members.length = 0
    out[start] = -1
    for (let q = [start]; q.length > 0; ) {
      const c = q.pop()!
      members.push(c)
      const x = c % N
      const y = (c - x) / N
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue
        const n = ny * N + nx
        if (!out[n] && isWater(world.terrain[n])) {
          out[n] = -1
          q.push(n)
        }
      }
    }
    for (const m of members) out[m] = members.length
  }
  bodies.set(world.terrain, out)
  return out
}

// Shore tiles take only a dock, roadside tiles only a trade post and mountain-foot tiles only a tunnel;
// water, mountains, roads and inns take nothing.
export function tileRule(world: World, x: number, y: number): number {
  const i = y * world.size + x
  const terrain = world.terrain[i]
  if (world.feature[i] !== Feature.None || isWater(terrain)) return TileRule.Blocked
  const touches = (match: (terrain: number, feature: number, n: number) => boolean) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= world.size || ny >= world.size) return false
      const n = ny * world.size + nx
      return match(world.terrain[n], world.feature[n], n)
    })
  if (terrain === Terrain.Mountain) {
    return touches((t) => t !== Terrain.Mountain && !isWater(t)) ? TileRule.TunnelOnly : TileRule.Blocked
  }
  if (touches((t, _, n) => isWater(t) && waterBodies(world)[n] >= balance.territory.shoreMinWater)) return TileRule.DockOnly
  return touches((_, f) => f === Feature.Road) ? TileRule.TradePostOnly : TileRule.Free
}

// A plot is a square of free land with at least one tile of the anchor rule (shore for docks, roadside for trade posts).
function isPlot(world: World, x: number, y: number, anchor: number) {
  const side = balance.territory.plotTiles
  if (x < 0 || y < 0 || x + side > world.size || y + side > world.size) return false
  let anchored = false
  for (let oy = 0; oy < side; oy++) {
    for (let ox = 0; ox < side; ox++) {
      const rule = tileRule(world, x + ox, y + oy)
      if (rule === anchor) anchored = true
      else if (rule !== TileRule.Free) return false
    }
  }
  return anchored
}

export interface Plot {
  plot: Rect
  // True when the territory has no such spot of its own and the plot lies outside it.
  granted: boolean
  distance: number
}

// A kingdom with a fitting spot inside its territory builds there; otherwise it is granted the plot outside that is
// the shortest walk away: over land and bridges, around water and mountains.
export function findPlot(world: World, territory: Rect, anchor: number): Plot | null {
  const { plotTiles: side, plotSearchRadius } = balance.territory
  for (let y = territory.y; y + side <= territory.y + territory.size; y++) {
    for (let x = territory.x; x + side <= territory.x + territory.size; x++) {
      if (isPlot(world, x, y, anchor)) return { plot: { x, y, size: side }, granted: false, distance: 0 }
    }
  }

  // Dijkstra with chamfer costs (2 straight, 3 diagonal) from every tile of the territory.
  const { size } = world
  const walkable = (i: number) => {
    const t = world.terrain[i]
    return world.feature[i] === Feature.Bridge || (!isWater(t) && t !== Terrain.Mountain)
  }
  const cost = new Int32Array(size * size).fill(-1)
  const buckets: number[][] = [[]]
  for (let y = territory.y; y < territory.y + territory.size; y++) {
    for (let x = territory.x; x < territory.x + territory.size; x++) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      cost[y * size + x] = 0
      buckets[0].push(y * size + x)
    }
  }
  const limit = plotSearchRadius * 2
  for (let c = 0; c <= limit && c < buckets.length; c++) {
    for (const i of buckets[c] ?? []) {
      if (cost[i] !== c) continue
      const x = i % size
      const y = (i - x) / size
      if (c > 0) {
        for (let oy = 0; oy < side; oy++) {
          for (let ox = 0; ox < side; ox++) {
            if (isPlot(world, x - ox, y - oy, anchor)) {
              return { plot: { x: x - ox, y: y - oy, size: side }, granted: true, distance: Math.round(c / 2) }
            }
          }
        }
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= size || ny >= size) continue
          const n = ny * size + nx
          // No cutting diagonally between two blocked tiles.
          if (!walkable(n) || (dx !== 0 && dy !== 0 && !walkable(y * size + nx) && !walkable(ny * size + x))) continue
          const next = c + (dx !== 0 && dy !== 0 ? 3 : 2)
          if (cost[n] !== -1 && cost[n] <= next) continue
          cost[n] = next
          ;(buckets[next] ??= []).push(n)
        }
      }
    }
  }
  return null
}

function blockedFraction(world: World, rect: Rect) {
  // A kingdom keeps well away from a free city (a city is wider than the step, so the coarse look finds it).
  const gap = balance.cities.kingdomGapTiles
  for (let y = Math.max(0, rect.y - gap); y < Math.min(world.size, rect.y + rect.size + gap); y += 8) {
    for (let x = Math.max(0, rect.x - gap); x < Math.min(world.size, rect.x + rect.size + gap); x += 8) {
      if (world.feature[y * world.size + x] === Feature.City) return 1
    }
  }
  let blocked = 0
  for (let y = rect.y; y < rect.y + rect.size; y++) {
    for (let x = rect.x; x < rect.x + rect.size; x++) {
      const i = y * world.size + x
      if (world.feature[i] === Feature.Inn) return 1
      const t = world.terrain[i]
      if (isWater(t) || t === Terrain.Mountain) blocked++
    }
  }
  return blocked / (rect.size * rect.size)
}

// Nearest spot to `near` where the fully grown territory fits on the map and is almost all buildable land.
export function findStartSite(world: World, near: Point): Point | null {
  const { stageParcels, startMaxBlockedFraction, startSearchStep: step } = balance.territory
  const lastStage = stageParcels.length - 1
  for (let ring = 0; ring * step < world.size; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const center = { x: near.x + dx * step, y: near.y + dy * step }
        const rect = territoryRect(center, lastStage)
        const inside =
          rect.x >= 0 && rect.y >= 0 && rect.x + rect.size <= world.size && rect.y + rect.size <= world.size
        if (inside && blockedFraction(world, rect) <= startMaxBlockedFraction) return center
      }
    }
  }
  return null
}

// Kingdoms do not choose where they start: the lobby assigns each one a random site.
export function assignStartSite(world: World, random: () => number): Point | null {
  const margin = balance.territory.startEdgeMargin
  for (let attempt = 0; attempt < 64; attempt++) {
    const near = {
      x: margin + Math.floor(random() * (world.size - margin * 2)),
      y: margin + Math.floor(random() * (world.size - margin * 2)),
    }
    const site = findStartSite(world, near)
    if (site) return site
  }
  return null
}

// Fully grown territories of two kingdoms keep at least balance.territory.kingdomGapTiles apart, so borders never
// touch and there is neutral land between kingdoms.
export function siteIsClear(site: Point, others: Point[]) {
  const { stageParcels, kingdomGapTiles: gap } = balance.territory
  const a = territoryRect(site, stageParcels.length - 1)
  return others.every((other) => {
    const b = territoryRect(other, stageParcels.length - 1)
    return a.x >= b.x + b.size + gap || b.x >= a.x + a.size + gap || a.y >= b.y + b.size + gap || b.y >= a.y + a.size + gap
  })
}
