import { balance } from './balance'
import type { Building } from './economy'
import type { Point } from './iso'
import { perSpan } from './span'
import { territoryRect } from './territory'

// Walls keep people in as well as out (CLAUDE.md §6.4): villagers and the merchant walk out of the palace and cannot
// cross a standing wall, only a gate or a broken stretch. A building nobody can walk to does not work; a trade post
// the merchant cannot reach sells nothing. Worked out by flooding the ground from the palace over every tile that is
// not a standing wall, in a box around the territory and the buildings; armies are not held back by this.

const blocks = (b: Building, at: number) => b.kind === 'wall' && !b.broken && b.doneAt <= at

// What the flood found: the buildings it never reached, and whether it stayed inside the walls (no way out of town).
interface Flood {
  out: Set<number>
  enclosed: boolean
}

const OPEN: Flood = { out: new Set(), enclosed: false }
const memo = new WeakMap<Building[], Map<string, Flood>>()
// The answer for each list of buildings, until one of them is completed (see perSpan): settling a kingdom asks the
// same question every round.
const last = new WeakMap<Building[], { from: number; until: number; value: Flood }>()

const flood = (buildings: Building[], site: Point, at: number): Flood => perSpan(last, buildings, at, () => floodAt(buildings, site, at))

// The ids of the buildings that cannot be reached from the palace at `at`.
export const cutOff = (buildings: Building[], site: Point, at: number): Set<number> => flood(buildings, site, at).out

// Walls ring the palace with no gate (nor a broken stretch) to leave by: the town is a prison and the people sulk.
export const imprisoned = (buildings: Building[], site: Point, at: number): boolean => flood(buildings, site, at).enclosed

function floodAt(buildings: Building[], site: Point, at: number): Flood {
  const walls = buildings.filter((b) => blocks(b, at))
  if (walls.length === 0) return OPEN
  const key = walls.map((w) => w.id).join(',')
  let byWalls = memo.get(buildings)
  if (!byWalls) memo.set(buildings, (byWalls = new Map()))
  const known = byWalls.get(key)
  if (known) return known

  const palace = buildings.find((b) => b.kind === 'palace')
  const out = new Set<number>()
  if (!palace) return OPEN
  // The box: the fully grown territory and every building, with a margin to walk round the outside.
  const t = territoryRect(site, balance.territory.stageParcels.length - 1)
  let x0 = t.x
  let y0 = t.y
  let x1 = t.x + t.size
  let y1 = t.y + t.size
  for (const b of buildings) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.size)
    y1 = Math.max(y1, b.y + b.size)
  }
  x0 -= 2
  y0 -= 2
  x1 += 2
  y1 += 2
  const w = x1 - x0
  const h = y1 - y0
  const wall = new Uint8Array(w * h)
  for (const b of walls) wall[(b.y - y0) * w + (b.x - x0)] = 1
  const seen = new Uint8Array(w * h)
  const queue: number[] = []
  // The box reaches past the territory; a flood that touches its edge has found the way out.
  let enclosed = true
  for (let y = palace.y; y < palace.y + palace.size; y++) {
    for (let x = palace.x; x < palace.x + palace.size; x++) {
      const i = (y - y0) * w + (x - x0)
      seen[i] = 1
      queue.push(i)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    const x = i % w
    const y = (i - x) / w
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        enclosed = false
        continue
      }
      const n = ny * w + nx
      if (seen[n] || wall[n]) continue
      seen[n] = 1
      queue.push(n)
    }
  }
  // A building is reached when the flood touches its footprint or a tile beside it.
  for (const b of buildings) {
    if (b.kind === 'wall' || b.kind === 'palace') continue
    let reached = false
    for (let y = b.y - 1; y <= b.y + b.size && !reached; y++) {
      for (let x = b.x - 1; x <= b.x + b.size && !reached; x++) {
        const lx = x - x0
        const ly = y - y0
        if (lx >= 0 && ly >= 0 && lx < w && ly < h && seen[ly * w + lx]) reached = true
      }
    }
    if (!reached) out.add(b.id)
  }
  const result = { out, enclosed }
  byWalls.set(key, result)
  return result
}
