// Crown patrols and a lord's walls (CLAUDE.md §7.8): the column rides round a walled palace and in by its gate, never
// through the wall. bun scripts/patrol-wall-check.ts [seeds…]
import { Feature, Terrain, capitalGate, generateWorld, hash } from '../packages/shared/src/index'
import { haltSpots, patrolBlocker, patrolRoute } from '../apps/web/src/game/patrolRoutes'

const seeds = process.argv.slice(2).map(Number)
let bad = 0
// The squads behind the head as armies.ts places them (TRAIN_GAP, GATHER_RUN, GATHER_LEAVE): `old` is the rule before
// (the offset to its place added all along the last stretch).
const smooth = (v: number) => {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}
const along = (route: { x: number; y: number }[], d: number) => {
  let left = Math.max(0, d)
  for (let i = 1; i < route.length; i++) {
    const l = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
    if (left <= l) return { x: route[i - 1].x + ((route[i].x - route[i - 1].x) * left) / Math.max(l, 1e-9), y: route[i - 1].y + ((route[i].y - route[i - 1].y) * left) / Math.max(l, 1e-9) }
    left -= l
  }
  return route[route.length - 1]
}
function followers(route: { x: number; y: number }[], gather: { x: number; y: number }[], old: boolean) {
  const total = route.slice(1).reduce((s0, p, i) => s0 + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0)
  const end = route[route.length - 1]
  const out: { x: number; y: number }[] = []
  for (let progress = Math.max(0, total - 12); progress <= total; progress += 0.05) {
    const closing = smooth((total - progress) / 8)
    gather.forEach((place, i) => {
      const d = progress - (i + 1) * 1.7 * closing
      let at = along(route, d)
      if (old) at = { x: at.x + (place.x - end.x) * (1 - closing), y: at.y + (place.y - end.y) * (1 - closing) }
      else {
        const blend = Math.max(0, 1 - Math.max(0, total - d) / 1.5) * (1 - closing)
        at = { x: at.x + (place.x - at.x) * blend, y: at.y + (place.y - at.y) * blend }
      }
      out.push(at)
    })
  }
  return out
}
for (const seed of seeds.length > 0 ? seeds : [12345, 777, 4242]) {
  const world = generateWorld(seed)
  const { size } = world
  const free = (x: number, y: number) => {
    const i = y * size + x
    const t = world.terrain[i]
    return world.feature[i] === Feature.None && t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
  }
  let tried = 0
  let through = 0
  let fellBack = 0
  let squadsOld = 0
  let squadsNew = 0
  for (let n = 0; tried < 12 && n < 4000; n++) {
    const cx = 120 + Math.floor(hash(n, 9, seed) * (size - 240))
    const cy = 120 + Math.floor(hash(n, 10, seed) * (size - 240))
    const R = 8
    let ok = true
    for (let y = cy - R - 2; y <= cy + R + 2 && ok; y++) for (let x = cx - R - 2; x <= cx + R + 2 && ok; x++) if (!free(x, y)) ok = false
    if (!ok || world.cities.some((c) => Math.hypot(c.x - cx, c.y - cy) < 80)) continue
    tried++
    // A square of walls round the palace, a gate (with its two tower walls) in the middle of each side in turn.
    const side = tried % 4
    const buildings: { kind: string; x: number; y: number; size: number }[] = [{ kind: 'palace', x: cx - 1, y: cy - 1, size: 3 }]
    const wallTiles = new Set<number>()
    for (let i = -R; i <= R; i++) {
      for (const [x, y, s] of [[cx + i, cy - R, 0], [cx + R, cy + i, 1], [cx + i, cy + R, 2], [cx - R, cy + i, 3]] as const) {
        if (s === side && i === 0) buildings.push({ kind: 'gate', x, y, size: 1 })
        else {
          buildings.push({ kind: 'wall', x, y, size: 1 })
          wallTiles.add(y * 65536 + x)
        }
      }
    }
    const blocked = patrolBlocker(world, [{ buildings }])
    const palace = buildings[0]
    const { door, gather } = haltSpots(world, blocked, palace, 4)
    for (const [ci, city] of world.cities.entries()) {
      const with_ = patrolRoute(world, city, capitalGate(city), door, blocked)
      const route = with_ ?? patrolRoute(world, city, capitalGate(city), door)
      if (!with_) fellBack++
      if (!route) continue
      // Every point along the route, a tenth of a tile apart: on a wall tile?
      let hit = false
      for (let i = 1; i < route.length && !hit; i++) {
        const a = route[i - 1]
        const b = route[i]
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 10)
        for (let s = 0; s <= steps; s++) {
          const x = Math.floor(a.x + ((b.x - a.x) * s) / Math.max(1, steps))
          const y = Math.floor(a.y + ((b.y - a.y) * s) / Math.max(1, steps))
          if (wallTiles.has(y * 65536 + x)) hit = true
        }
      }
      const onWall = (p: { x: number; y: number }) => wallTiles.has(Math.floor(p.y) * 65536 + Math.floor(p.x))
      if (followers(route, gather, true).some(onWall)) squadsOld++
      if (followers(route, gather, false).some(onWall)) squadsNew++
      if (hit) {
        through++
        console.log(`  seed ${seed} lord at ${cx},${cy} gate side ${side}, crown ${ci}: through the wall${with_ ? '' : ' (no route with the walls: fell back to none)'}`)
      }
    }
  }
  console.log(`seed ${seed}: ${tried} walled lords × ${world.cities.length} crowns, ${through} routes through a wall, ${fellBack} fell back to the unblocked route; squads behind the head over a wall: before ${squadsOld}, now ${squadsNew}`)
  bad += through + squadsNew
}
process.exit(bad > 0 ? 1 : 0)
