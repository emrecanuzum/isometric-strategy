import { Terrain, dockPier } from '@game/shared'
import type { Blockade, MissionKind, Point, Rect, World } from '@game/shared'
import type { FleetShip } from './ambient'

// Where the lords' ships show on the map (CLAUDE.md §8.5): a few moored along each dock's jetty for the harbour and the
// fleets waiting, fishing or hunting near home; a trade fleet's ship sailing out from the jetty and back each voyage;
// a blockading fleet's galleys riding off the enemy's jetty. Others' fleets come rough (see lobby_kingdoms).

export interface NavyOnMap {
  id: number
  dock: Rect
  harbour: number
  fleets: { id: number; ships: number; mission: MissionKind; departedAt?: number; tripMs?: number }[]
  blockade?: Blockade | null
}

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

const SHIP = 2.6

export function fleetShips(world: World, lords: NavyOnMap[]): FleetShip[] {
  const out: FleetShip[] = []
  for (const lord of lords) {
    const l = lane(world, lord.dock)
    if (!l) continue
    const { pier, dir, tip, reach } = l
    const along = pier.along
    const across = along === 'x' ? { x: 0, y: 1 } : { x: 1, y: 0 }
    const reverse = (along === 'x' ? dir.x : dir.y) < 0
    // The harbour's ships, moored alongside the jetty, both sides in turn, further out each pair.
    const moored = Math.min(4, Math.ceil(lord.harbour / 2))
    for (let i = 0; i < moored; i++) {
      const side = i % 2 === 0 ? 0.9 : -0.9
      const out1 = Math.min(Math.max(0, reach - 1), Math.floor(i / 2) * 1.2)
      out.push({
        key: `m${lord.id}:${i}`,
        at: { x: tip.x - dir.x * 0.6 + dir.x * out1 + across.x * side, y: tip.y - dir.y * 0.6 + dir.y * out1 + across.y * side },
        along,
        reverse,
        seed: lord.id * 7 + i,
        length: SHIP,
      })
    }
    // A fleet waiting in port rides at anchor off the jetty's tip, apart from the harbour, a few ships in a knot.
    for (const [n, f] of lord.fleets.filter((f) => f.mission === 'port').entries()) {
      const d = Math.min(Math.max(1.5, reach - 1), 3 + n * 2.5)
      const side = n % 2 === 0 ? 2.2 : -2.2
      for (let i = 0; i < Math.min(3, Math.ceil(f.ships / 2)); i++) {
        const e = d + (i === 1 ? 1.4 : 0)
        const c = side + (i === 2 ? 1.3 : 0) * Math.sign(side)
        out.push({ key: `p${lord.id}:${f.id}:${i}`, at: { x: tip.x + dir.x * e + across.x * c, y: tip.y + dir.y * e + across.y * c }, along, reverse, seed: lord.id * 7 + f.id * 3 + i, length: SHIP })
      }
    }
    if (reach < 4) continue
    const far: Point = { x: tip.x + dir.x * reach, y: tip.y + dir.y * reach }
    for (const f of lord.fleets) {
      if (f.mission === 'trade' && f.tripMs) {
        out.push({ key: `t${lord.id}:${f.id}`, at: { x: tip.x + dir.x * 1.5, y: tip.y + dir.y * 1.5 }, to: far, start: f.departedAt, period: f.tripMs, away: 0.7, along, reverse, seed: lord.id * 7 + f.id + 3, length: SHIP + 0.4 })
      } else if (f.mission === 'hunt') {
        out.push({ key: `h${lord.id}:${f.id}`, at: { x: tip.x + dir.x * 1.5, y: tip.y + dir.y * 1.5 }, to: far, start: lord.id * 9973, period: 150_000, away: 0.5, along, reverse, seed: lord.id * 7 + f.id + 5, length: SHIP })
      } else if (f.mission === 'fish') {
        const near: Point = { x: tip.x + dir.x * Math.min(reach, 6) + across.x * 1.5, y: tip.y + dir.y * Math.min(reach, 6) + across.y * 1.5 }
        out.push({ key: `f${lord.id}:${f.id}`, at: { x: tip.x + dir.x * 1.5, y: tip.y + dir.y * 1.5 }, to: near, start: lord.id * 7919, period: 90_000, away: 0, along, reverse, seed: lord.id * 7 + f.id + 1, length: SHIP - 0.4 })
      }
    }
    // An enemy fleet riding off this dock.
    if (lord.blockade) {
      for (let i = 0; i < 3; i++) {
        const d = Math.min(reach, 3 + i * 1.6)
        const side = (i - 1) * 2.2
        out.push({ key: `b${lord.id}:${i}`, at: { x: tip.x + dir.x * d + across.x * side, y: tip.y + dir.y * d + across.y * side }, along: along === 'x' ? 'y' : 'x', reverse: false, seed: lord.blockade.by * 13 + i, length: SHIP + 0.4 })
      }
    }
  }
  return out
}
