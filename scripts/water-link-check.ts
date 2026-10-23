// Every water body a dock or a haven can stand on is joined to every other by water (CLAUDE.md §4.2): a fleet can sail
// from any lord's dock to any pirate haven, the long way round if need be. bun scripts/water-link-check.ts [seeds…]
import { Terrain, balance, generateWorld } from '../packages/shared/src/index'

const seeds = process.argv.slice(2).map(Number)
const list = seeds.length > 0 ? seeds : [12345, 777, 4242, 99001, 1, 2, 3, 31337]
const min = balance.territory.shoreMinWater
let failed = 0
for (const seed of list) {
  const t0 = performance.now()
  const world = generateWorld(seed)
  const ms = performance.now() - t0
  const { size, terrain } = world
  const label = new Int32Array(size * size).fill(-1)
  const sizes: number[] = []
  const wet = (i: number) => terrain[i] === Terrain.Lake || terrain[i] === Terrain.River
  for (let i = 0; i < size * size; i++) {
    if (label[i] >= 0 || !wet(i)) continue
    const id = sizes.length
    let n = 0
    const stack = [i]
    label[i] = id
    while (stack.length) {
      const j = stack.pop()!
      n++
      const x = j % size
      const y = (j / size) | 0
      for (const k of [x > 0 ? j - 1 : -1, x < size - 1 ? j + 1 : -1, y > 0 ? j - size : -1, y < size - 1 ? j + size : -1]) {
        if (k < 0 || label[k] >= 0 || !wet(k)) continue
        label[k] = id
        stack.push(k)
      }
    }
    sizes.push(n)
  }
  const big = sizes.map((n, id) => ({ n, id })).filter((b) => b.n >= min).sort((a, b) => b.n - a.n)
  const rest = big.slice(1)
  console.log(`seed ${seed}: ${big.length} bodies ≥${min} tiles; largest ${big[0]?.n}; cut off ${rest.length} (${rest.map((b) => b.n).join(', ')}) · ${ms.toFixed(0)} ms`)
  failed += rest.length
}
if (failed > 0) {
  console.error(`FAILED: ${failed} water bodies cut off`)
  process.exit(1)
}
console.log('ok')
