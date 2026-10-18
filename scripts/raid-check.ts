// Bandit raids (CLAUDE.md §7.9): with lords' trade posts by the roads, how often each lord feels the bandits over an
// hour, and that every raid keeps to dry land. bun scripts/raid-check.ts [seeds…]
import { Feature, Terrain, bandAt, bandRaid, bandsOf, generateWorld, hash, roadHeld } from '../packages/shared/src/index'

const seeds = process.argv.slice(2).map(Number)
const list = seeds.length > 0 ? seeds : [12345, 777, 4242]
for (const seed of list) {
  const world = generateWorld(seed)
  const { size } = world
  // Nine trade posts on road-side tiles, spread over the map.
  const roadSide: number[] = []
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    if (x < 80 || y < 80 || x > size - 80 || y > size - 80) continue
    if (world.feature[i] !== Feature.None || world.terrain[i] === Terrain.Lake || world.terrain[i] === Terrain.River || world.terrain[i] === Terrain.Mountain) continue
    if (world.feature[i + 1] === Feature.Road || world.feature[i - 1] === Feature.Road) roadSide.push(i)
  }
  const targets: { id: number; at: { x: number; y: number } }[] = []
  for (let n = 0; targets.length < 9 && n < 5000; n++) {
    const i = roadSide[Math.floor(hash(n, 3, seed) * roadSide.length)]
    const p = { x: (i % size) + 1, y: Math.floor(i / size) + 1 }
    if (targets.some((t) => Math.hypot(t.at.x - p.x, t.at.y - p.y) < 120)) continue
    targets.push({ id: targets.length + 1, at: p })
  }
  const bands = bandsOf(world, seed, [], targets)
  const wet = (p: { x: number; y: number }) => {
    const t = world.terrain[Math.floor(p.y) * size + Math.floor(p.x)]
    return t === Terrain.Lake || t === Terrain.River || t === Terrain.Mountain
  }
  let wetPoints = 0
  const raids = new Map<number, number>()
  const shares = targets.map(() => ({ sum: 0, zero: 0, max: 0 }))
  const start = 1_800_000_000_000
  const samples = Number(process.env.SAMPLES ?? 360)
  for (let s = 0; s < samples; s++) {
    const at = start + s * Number(process.env.STEP ?? 10_000)
    for (const b of bands) {
      const r = bandRaid(world, b, at)
      if (r) {
        raids.set(r.target, (raids.get(r.target) ?? 0) + 1)
        if (wet(bandAt(b, at))) wetPoints++
      }
    }
    targets.forEach((t, i) => {
      const share = roadHeld(world, seed, bands, t.at, at).share
      shares[i].sum += share
      shares[i].max = Math.max(shares[i].max, share)
      if (share === 0) shares[i].zero++
    })
  }
  console.log(`seed ${seed}: ${bands.length} bands, ${targets.length} lords, raid samples per lord ${JSON.stringify(Object.fromEntries(raids))}, off-land raid points ${wetPoints}`)
  targets.forEach((t, i) => console.log(`  lord ${t.id}: mean ${(shares[i].sum / samples * 100).toFixed(0)}%  max ${(shares[i].max * 100).toFixed(0)}%  zero ${(shares[i].zero / samples * 100).toFixed(0)}% of the hour`))
}
