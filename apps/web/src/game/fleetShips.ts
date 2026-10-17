import { Terrain, alongPath, balance, dockPier, dockWater, hash, isWaterTile, pathLength, waterPath } from '@game/shared'
import type { Blockade, MissionKind, Point, Rect, Sail, World } from '@game/shared'
import type { FleetShip } from './ambient'
import { worldDecks } from './chunkPainter'
import type { ShipKind } from './shipSprites'

// Where the lords' ships show on the map (CLAUDE.md §8.5): the harbour's ships moored by each dock's jetty; a fleet at
// home riding at anchor off it, or sailing where it was sent and riding at anchor there, its ships in a line behind
// the first; a fishing fleet cruising close about where it lies, a pirate-hunting one further, a trading one out over
// the water and back each voyage (never out of sight); a blockading fleet's galleys off the enemy's jetty. Each ship is drawn as its type
// and only where open water holds its whole hull (a narrow river takes it along its own run, or not at all). Others'
// fleets come rough (see lobby_kingdoms).

export interface NavyOnMap {
  id: number
  // The lord's colour, for the fleets' tags and ways.
  color: number
  dock: Rect
  // The harbour's ships by type, as many as are drawn.
  harbour: ShipKind[]
  // Each fleet with how many ships it has (rough for others).
  // (`rough`: another lord's, sized only as a few, middling or big.)
  fleets: { id: number; ships: number; rough?: boolean; kinds: ShipKind[]; mission: MissionKind; departedAt?: number; tripMs?: number; sail?: Sail | null }[]
  blockade?: Blockade | null
}

// How long each type is drawn, in tiles.
export const SHIP_LENGTHS: Record<ShipKind, number> = { galley: 2.4, cog: 2, corsair: 2 }
const BEAM = 0.45

const water = (world: World, x: number, y: number) => {
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) return false
  const t = world.terrain[ty * world.size + tx]
  return t === Terrain.Lake || t === Terrain.River
}

// The jetty of a dock and the way out from its tip over open water.
function lane(world: World, dock: Rect) {
  const pier = dockPier(world, dock)
  if (!pier) return null
  const mid = { x: pier.x + pier.w / 2, y: pier.y + pier.h / 2 }
  const c = { x: dock.x + dock.size / 2, y: dock.y + dock.size / 2 }
  const dir = pier.along === 'x' ? { x: Math.sign(mid.x - c.x) || 1, y: 0 } : { x: 0, y: Math.sign(mid.y - c.y) || 1 }
  const tip = pier.along === 'x' ? { x: dir.x > 0 ? pier.x + pier.w : pier.x, y: mid.y } : { x: mid.x, y: dir.y > 0 ? pier.y + pier.h : pier.y }
  let reach = 0
  for (let d = 1; d <= 16; d++) {
    if (!water(world, tip.x + dir.x * d, tip.y + dir.y * d)) break
    reach = d
  }
  return { pier, mid, dir, tip, reach }
}

type Berth = { at: Point; along: 'x' | 'y'; length: number }

export function fleetShips(world: World, lords: NavyOnMap[]): FleetShip[] {
  const out: FleetShip[] = []
  // No ship rests on or under a bridge (they sail under them, see ambient.ts).
  const decks = worldDecks(world)
  // Ships already placed (and the jetties): no two hulls on top of each other, none on a jetty.
  const taken: Berth[] = []
  const piers: { x: number; y: number; w: number; h: number }[] = []
  const box = (b: Berth, pad: number) => {
    const half = b.length / 2 + pad
    return b.along === 'x' ? { x0: b.at.x - half, x1: b.at.x + half, y0: b.at.y - BEAM - pad, y1: b.at.y + BEAM + pad } : { x0: b.at.x - BEAM - pad, x1: b.at.x + BEAM + pad, y0: b.at.y - half, y1: b.at.y + half }
  }
  const overlaps = (a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  const fits = (b: Berth) => {
    const r = box(b, 0.15)
    for (let x = r.x0; x <= r.x1 + 1e-6; x += 0.35) for (let y = r.y0; y <= r.y1 + 1e-6; y += 0.35) if (!water(world, x, y)) return false
    if (decks.near(b.at.x, b.at.y, b.length / 2 + 0.3)) return false
    const me = box(b, 0.1)
    if (piers.some((p) => overlaps(me, { x0: p.x - 0.2, x1: p.x + p.w + 0.2, y0: p.y - 0.2, y1: p.y + p.h + 0.2 }))) return false
    return !taken.some((t) => overlaps(me, box(t, 0.1)))
  }
  // The nearest spot to `want` where the hull fits, lying along `along` if it can, else across; null if none near.
  const berth = (want: Point, along: 'x' | 'y', length: number, radius = 7): Berth | null => {
    for (let r = 0; r <= radius; r += 0.5) {
      const ring: Point[] = []
      if (r === 0) ring.push({ x: 0, y: 0 })
      else for (let i = -r; i <= r; i += 0.5) ring.push({ x: i, y: -r }, { x: i, y: r }, { x: -r, y: i }, { x: r, y: i })
      for (const way of [along, along === 'x' ? 'y' : 'x'] as const) {
        for (const d of ring) {
          const b = { at: { x: want.x + d.x, y: want.y + d.y }, along: way, length }
          if (fits(b)) {
            taken.push(b)
            return b
          }
        }
      }
    }
    return null
  }
  const lanes = lords.map((lord) => ({ lord, l: lane(world, lord.dock) }))
  for (const { l } of lanes) if (l) piers.push(l.pier)
  for (const { lord, l } of lanes) {
    if (!l) continue
    const { pier, dir, tip, reach } = l
    const along = pier.along
    const across = along === 'x' ? { x: 0, y: 1 } : { x: 1, y: 0 }
    const reverse = (along === 'x' ? dir.x : dir.y) < 0
    const off = (d: number, side = 0): Point => ({ x: tip.x + dir.x * d + across.x * side, y: tip.y + dir.y * d + across.y * side })
    const add = (ship: Omit<FleetShip, 'at' | 'along' | 'length' | 'lord'>, want: Point, radius?: number) => {
      const b = berth(want, along, SHIP_LENGTHS[ship.kind], radius)
      if (b) out.push({ ...ship, at: b.at, along: b.along, length: b.length, reverse: b.along === along ? ship.reverse : false, lord: lord.id })
    }
    // The harbour's ships, moored alongside the jetty, both sides in turn.
    for (const [i, kind] of lord.harbour.slice(0, 4).entries()) add({ key: `m${lord.id}:${i}`, reverse, seed: lord.id * 7 + i, kind }, off(-0.8 + Math.floor(i / 2) * 1.2, i % 2 === 0 ? 1 : -1))
    const home = dockWater(world, lord.dock)
    for (const [n, f] of lord.fleets.entries()) {
      // Off against another lord, or coming back: out of sight (a blockade shows at the enemy's jetty, below).
      if (!['port', 'fish', 'hunt', 'trade'].includes(f.mission)) continue
      const seed = lord.id * 7 + f.id * 3
      const kinds = f.kinds.slice(0, 3)
      const anchor = f.sail ? f.sail.path[f.sail.path.length - 1] : home
      const loop = !anchor
        ? null
        : f.mission === 'fish'
          ? cruise(world, anchor, 5, seed, 2.2, 0, decks.near)
          : f.mission === 'hunt'
            ? cruise(world, anchor, 12, seed, 1.3, 0, decks.near)
            : f.mission === 'trade'
              ? outAndBack(world, anchor, 26, seed, f.departedAt ?? 0, f.tripMs, decks.near)
              : null
      if (anchor && (f.sail || loop)) {
        // Where along its way each ship of a sailed fleet comes to rest: in a line behind the first, but never on or
        // under a bridge (a ship that would stops short of it, and those behind it keep their distance).
        const total = f.sail ? pathLength(f.sail.path) : 0
        let rest = total + 2.8
        for (const [i, kind] of kinds.entries()) {
          const length = SHIP_LENGTHS[kind]
          rest = Math.min(total - i * 2.8, rest - 2.8)
          if (f.sail && !loop) while (rest > 0 && decks.near(alongPath(f.sail.path, rest).at.x, alongPath(f.sail.path, rest).at.y, length / 2 + 0.3)) rest -= 0.25
          out.push({ key: `s${lord.id}:${f.id}:${i}`, at: anchor, along, reverse, seed: seed + i, length, kind, lord: lord.id, fleet: f.id, color: lord.color, ...(i === 0 && { tag: tag(n, f.ships, f.rough) }), ...(f.sail && { route: f.sail }), ...(loop && { loop }), behind: i * 2.8, ...(f.sail && !loop && { rest: Math.max(0, rest) }) })
        }
        continue
      }
      // Never sent anywhere: at anchor off the jetty's tip, apart from the harbour, a few ships in a knot.
      for (const [i, kind] of kinds.entries()) add({ key: `p${lord.id}:${f.id}:${i}`, reverse, seed: seed + i, kind, fleet: f.id, color: lord.color, ...(i === 0 && { tag: tag(n, f.ships, f.rough) }) }, off(2.5 + n * 2.5 + i * 0.8, (n % 2 === 0 ? 1.5 : -1.5) * (i % 2 === 0 ? 1 : -0.4)))
    }
    // An enemy fleet riding off this dock: its galleys, broadside on if the water lets them.
    if (lord.blockade) {
      for (let i = 0; i < 3; i++) {
        const b = berth(off(Math.min(reach, 3 + i * 1.6), (i - 1) * 2.2), along === 'x' ? 'y' : 'x', SHIP_LENGTHS.galley)
        if (b) out.push({ key: `b${lord.id}:${i}`, at: b.at, along: b.along, reverse: false, seed: lord.blockade.by * 13 + i, length: b.length, kind: 'galley', lord: lord.blockade.by })
      }
    }
  }
  return out
}

const tag = (index: number, ships: number, rough?: boolean) => `${index + 1}. filo · ${rough ? (ships <= 3 ? 'birkaç' : ships <= 8 ? 'orta' : 'büyük') : ships}`

const SECONDS_PER_TILE = balance.navy.sail.secondsPerTile

// A loop over the water about `anchor`: out to a few points within `radius` tiles that water joins to it, and back.
// `slow` stretches the time it takes (fishing boats dawdle).
// (`nearBridge`: no stop is made on or by a bridge.)
type NearBridge = (x: number, y: number, pad: number) => boolean

function cruise(world: World, anchor: Point, radius: number, seed: number, slow: number, start: number, nearBridge: NearBridge) {
  const stops: Point[] = []
  for (let j = 0; j < 12 && stops.length < 3; j++) {
    const angle = ((j * 5) % 12) / 12 * Math.PI * 2 + hash(seed, j, 77) * 0.5
    const r = radius * (0.45 + 0.55 * hash(seed, j, 78))
    const p = { x: Math.floor(anchor.x + Math.cos(angle) * r) + 0.5, y: Math.floor(anchor.y + Math.sin(angle) * r) + 0.5 }
    if (isWaterTile(world, p.x, p.y) && Math.hypot(p.x - anchor.x, p.y - anchor.y) > 1.5 && !nearBridge(p.x, p.y, 1.5)) stops.push(p)
  }
  return loopThrough(world, [anchor, ...stops, anchor], slow, start)
}

// Out to the furthest water within `radius` tiles that the water joins to `anchor`, and back: one trade voyage, taking
// `tripMs` (or as long as the sailing takes).
function outAndBack(world: World, anchor: Point, radius: number, seed: number, start: number, tripMs: number | undefined, nearBridge: NearBridge) {
  let best: { path: Point[]; length: number } | null = null
  for (let j = 0; j < 16; j++) {
    const angle = (j / 16) * Math.PI * 2 + hash(seed, j, 79) * 0.3
    for (const r of [radius, radius * 0.7, radius * 0.45]) {
      const p = { x: Math.floor(anchor.x + Math.cos(angle) * r) + 0.5, y: Math.floor(anchor.y + Math.sin(angle) * r) + 0.5 }
      if (!isWaterTile(world, p.x, p.y) || nearBridge(p.x, p.y, 1.5)) continue
      const path = waterPath(world, anchor, p, 8000)
      if (!path) continue
      const length = pathLength(path)
      if (!best || length > best.length) best = { path, length }
      break
    }
  }
  if (!best || best.length < 3) return null
  const path = [...best.path, ...best.path.slice(0, -1).reverse()]
  return { path, start, period: tripMs && tripMs > 0 ? tripMs : pathLength(path) * SECONDS_PER_TILE * 1000 }
}

function loopThrough(world: World, stops: Point[], slow: number, start: number) {
  const path: Point[] = [stops[0]]
  for (let i = 1; i < stops.length; i++) {
    const leg = waterPath(world, path[path.length - 1], stops[i], 6000)
    if (!leg) continue
    path.push(...leg.slice(1))
  }
  if (path.length < 3 || pathLength(path) < 3) return null
  return { path, start, period: pathLength(path) * SECONDS_PER_TILE * 1000 * slow }
}
