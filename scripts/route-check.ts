// Route sanity check (CLAUDE.md §9.7): routes between random points of a real world stay on passable ground, and an
// army's position over time never jumps. bun scripts/route-check.ts [seed] [pairs]
import { Feature, balance, Terrain, findRoute, generateWorld, positionOn, routeLength, travelMs, walkTiles } from '../packages/shared/src/index'
import type { Point } from '../packages/shared/src/index'

const seed = Number(process.argv[2] ?? 12345)
const pairs = Number(process.argv[3] ?? 40)
const t0 = performance.now()
const world = generateWorld(seed)
console.log(`world ${world.size} in ${Math.round(performance.now() - t0)} ms`)
const ok = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= world.size || y >= world.size) return false
  const i = y * world.size + x
  if (world.feature[i] === Feature.Bridge) return true
  const t = world.terrain[i]
  return t !== Terrain.Lake && t !== Terrain.River && t !== Terrain.Mountain
}
let rnd = seed
const random = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const land = (): Point => {
  for (;;) {
    const x = Math.floor(100 + random() * (world.size - 200))
    const y = Math.floor(100 + random() * (world.size - 200))
    if (ok(x, y)) return { x: x + 0.5, y: y + 0.5 }
  }
}
let total = 0
let bridged = 0
let bad = 0
let points = 0
let worstJump = 0
let found = 0
let roadShare = 0
let worstDetour = 1
const roadNear = (p: Point) => {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.floor(p.x) + dx
    const y = Math.floor(p.y) + dy
    if (x >= 0 && y >= 0 && x < world.size && y < world.size && world.feature[y * world.size + x] === Feature.Road) return true
  }
  return false
}
for (let n = 0; n < pairs; n++) {
  const a = land()
  let b = land()
  while (Math.hypot(b.x - a.x, b.y - a.y) > 220 || Math.hypot(b.x - a.x, b.y - a.y) < 60) b = land()
  const s = performance.now()
  const route = findRoute(world, a, b)
  total += performance.now() - s
  if (!route) continue
  found++
  points += route.length
  for (let i = 1; i < route.length; i++) if (!walkTiles(route[i - 1], route[i], ok)) bad++
  let crosses = false
  for (let i = 1; i < route.length; i++) walkTiles(route[i - 1], route[i], (x, y) => ((crosses ||= world.feature[y * world.size + x] === Feature.Bridge), true))
  if (crosses) bridged++
  const ms = travelMs(route)
  let last = route[0]
  let near = 0
  let samples = 0
  for (let t = 0; t <= ms; t += 100) {
    const p = positionOn(route, 0, ms, t)
    worstJump = Math.max(worstJump, Math.hypot(p.x - last.x, p.y - last.y))
    last = p
    samples++
    if (roadNear(p)) near++
  }
  roadShare += near / Math.max(1, samples)
  // Against the same walk with no pull toward the roads: how much longer the roads make it.
  const R = balance.military.route as { roadOn: number; roadBeside: number; roadNear: number }
  const keep = { ...R }
  Object.assign(R, { roadOn: 1, roadBeside: 1, roadNear: 1 })
  const plain = findRoute(world, a, b)
  Object.assign(R, keep)
  if (plain) worstDetour = Math.max(worstDetour, routeLength(route) / routeLength(plain))
  if (n < 3) console.log(`route ${n}: ${route.length} points, ${routeLength(route).toFixed(1)} tiles (straight ${Math.hypot(b.x - a.x, b.y - a.y).toFixed(1)})`)
}
console.log(`${found}/${pairs} found, ${bridged} over a bridge, ${(total / pairs).toFixed(1)} ms each, ${(points / Math.max(1, found)).toFixed(1)} points each`)
console.log(`legs off the ground: ${bad}; worst 100 ms jump: ${worstJump.toFixed(3)} tiles; time near a road: ${((roadShare / Math.max(1, found)) * 100).toFixed(0)}%; longest detour for a road: +${((worstDetour - 1) * 100).toFixed(0)}%`)
if (bad > 0 || worstJump > 1.5) process.exit(1)
