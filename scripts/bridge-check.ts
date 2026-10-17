// Armies crossing bridges are drawn without a jump (CLAUDE.md §4.2.1 "Köprüler"): routes over a river between random
// points of a real world, drawn as the map draws them (apps/web/src/game/marchView.ts), sampled every 100 ms.
// bun scripts/bridge-check.ts [seed] [routes]
import { Feature, findRoute, generateWorld, positionOn, tileToScreen, travelMs, walkTiles } from '../packages/shared/src/index'
import type { Point } from '../packages/shared/src/index'
import { surfaceHeight, worldDecks } from '../apps/web/src/game/chunkPainter'
import { marchView } from '../apps/web/src/game/marchView'

const seed = Number(process.argv[2] ?? 12345)
const wanted = Number(process.argv[3] ?? 25)
const world = generateWorld(seed)
const decks = worldDecks(world)
const S = world.size
const bridges: Point[] = []
for (let i = 0; i < S * S; i++) if (world.feature[i] === Feature.Bridge) bridges.push({ x: (i % S) + 0.5, y: Math.floor(i / S) + 0.5 })
let rnd = seed
const random = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
let tested = 0
let worstTile = 0
let worstScreen = 0
let failed = 0
let oldScreen = 0
for (let n = 0; tested < wanted && n < wanted * 20; n++) {
  // From one side of a bridge tile to the other, some way off.
  const b = bridges[Math.floor(random() * bridges.length)]
  const angle = random() * Math.PI * 2
  const r = 10 + random() * 20
  const a = { x: Math.floor(b.x + Math.cos(angle) * r) + 0.5, y: Math.floor(b.y + Math.sin(angle) * r) + 0.5 }
  const c = { x: Math.floor(b.x - Math.cos(angle) * r) + 0.5, y: Math.floor(b.y - Math.sin(angle) * r) + 0.5 }
  const route = findRoute(world, a, c)
  if (!route) continue
  let crosses = false
  for (let i = 1; i < route.length; i++) walkTiles(route[i - 1], route[i], (x, y) => ((crosses ||= world.feature[y * S + x] === Feature.Bridge), true))
  if (!crosses) continue
  tested++
  const ms = travelMs(route)
  const view = marchView(world, decks, route)
  let last: Point | null = null
  let lastScreen: { x: number; y: number } | null = null
  let lastOld: { x: number; y: number } | null = null
  let worst = 0
  for (let t = 0; t <= ms + 100; t += 100) {
    const truth = positionOn(route, 0, ms, Math.min(t, ms))
    const s = view.total * Math.min(1, t / ms)
    const p = view.at(s)
    const sc = tileToScreen(p)
    const screen = { x: sc.x, y: sc.y - surfaceHeight(world, p) }
    // The old way, for comparison: the server's place carried onto the deck's line when close to it.
    const snapped = decks.snap(truth)
    const so = tileToScreen(snapped)
    const old = { x: so.x, y: so.y - surfaceHeight(world, snapped) }
    if (lastOld) oldScreen = Math.max(oldScreen, Math.hypot(old.x - lastOld.x, old.y - lastOld.y))
    lastOld = old
    if (last && lastScreen) {
      worst = Math.max(worst, Math.hypot(p.x - last.x, p.y - last.y))
      worstScreen = Math.max(worstScreen, Math.hypot(screen.x - lastScreen.x, screen.y - lastScreen.y))
    }
    // Drawn never far from where the server has it.
    if (Math.hypot(p.x - truth.x, p.y - truth.y) > 14) failed++
    last = p
    lastScreen = screen
  }
  worstTile = Math.max(worstTile, worst)
}
console.log(`${tested} bridge crossings; worst 100 ms step drawn: ${worstTile.toFixed(3)} tiles, ${worstScreen.toFixed(1)} screen px (snapping onto the deck as before: ${oldScreen.toFixed(1)} px); far from the server's place: ${failed}`)
if (worstTile > 1.5 || worstScreen > 16 || failed > 0) process.exit(1)
