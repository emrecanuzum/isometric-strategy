// Bandits and pirates stay where they belong (CLAUDE.md §7.9, §8.5): every point of every band's walk lies on dry land
// (no water tile, not even a raw bridge tile: the client redraws roads along creeks, so a band never walks a deck the
// screen may not show), and every point of every pirate boat's loop on water. bun scripts/outlaw-water-check.ts [seeds…]
import { Feature, Terrain, bandSpots, boatAt, boatSpots, alongPath, generateWorld } from '../packages/shared/src/index'

const seeds = process.argv.slice(2).map(Number)
const list = seeds.length > 0 ? seeds : [12345, 777, 4242, 99001]
let failed = 0
for (const seed of list) {
  const world = generateWorld(seed)
  const wet = (x: number, y: number) => {
    const i = Math.floor(y) * world.size + Math.floor(x)
    const t = world.terrain[i]
    return t === Terrain.Lake || t === Terrain.River
  }
  let bad = 0
  let samples = 0
  const bands = bandSpots(world, seed)
  for (const b of bands) {
    for (let d = 0; d <= b.length; d += 0.1) {
      const p = alongPath(b.path, d).at
      samples++
      if (wet(p.x, p.y) || world.feature[Math.floor(p.y) * world.size + Math.floor(p.x)] === Feature.Bridge) {
        bad++
        if (bad <= 5) console.log(`  seed ${seed} band ${b.idx} on water at ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      }
    }
  }
  let dry = 0
  const boats = boatSpots(world, seed)
  for (const b of boats) {
    for (let t = 0; t < (b.length / 1.1) * 1000; t += 500) {
      const p = boatAt(b, t).at
      if (!wet(p.x, p.y)) dry++
    }
  }
  console.log(`seed ${seed}: ${bands.length} bands, ${samples} samples, ${bad} on water; ${boats.length} boats, ${dry} points off water`)
  failed += bad + dry
}
if (failed > 0) {
  console.error(`FAILED: ${failed} bad points`)
  process.exit(1)
}
console.log('ok')
