import { Feature, Terrain } from '@game/shared'
import type { HavenSpot, World } from '@game/shared'
import type { Structure } from './buildingSprites'

// A pirate haven on the map (CLAUDE.md §8.5): a huddle of fishers' huts and shacks on the shore round its tile, a
// lookout tower behind them; the corsairs riding at anchor before it are drawn with the ships (App.tsx).

const dry = (world: World, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const i = y * world.size + x
  const t = world.terrain[i]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain && world.feature[i] === Feature.None
}

export function havenStructures(world: World, h: HavenSpot): Structure[] {
  const cx = Math.floor(h.at.x)
  const cy = Math.floor(h.at.y)
  const out: Structure[] = []
  let n = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (!dry(world, x, y)) continue
      // The tile furthest from the water carries the lookout; the others huts and shacks, a yard left here and there.
      const r = ((x * 73856093) ^ (y * 19349663) ^ (h.idx * 83492791)) >>> 0
      if (n > 0 && r % 5 === 0) continue
      const look = n === 0 ? 'watchtower' : r % 3 === 0 ? 'house' : 'fisherHut'
      out.push({ x, y, size: 1, look, level: 1, variant: r % 4 })
      n++
    }
  }
  // The lookout stands at the back (the first spot found, top left); nothing more to sort.
  return out
}

// Whether a tile is part of the haven (its huts' ring).
export const inHaven = (h: HavenSpot, tile: { x: number; y: number }) => Math.abs(Math.floor(h.at.x) - Math.floor(tile.x)) <= 1 && Math.abs(Math.floor(h.at.y) - Math.floor(tile.y)) <= 1
