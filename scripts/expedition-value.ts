// The expected value of every expedition against what its villagers would have paid and made at home (CLAUDE.md §9.9):
// `bun scripts/expedition-value.ts`. "idle" counts the provisions and the taxes left unpaid (villagers with no work to
// leave), "busy" adds the work of villagers who had a place at a building.
import { EXPEDITIONS, EXPEDITION_KINDS, expeditionValue } from '../packages/shared/src/index'

for (const kind of EXPEDITION_KINDS) {
  const spec = EXPEDITIONS[kind]
  for (const n of [spec.villagers[0], spec.villagers[1]]) {
    for (const escort of spec.escort ? [0, spec.escort] : [0]) {
      const v = expeditionValue(kind, n, escort, 6000)
      const idle = v.provisions + v.tax
      const busy = idle + v.work
      console.log(
        kind.padEnd(10),
        `n=${n} escort=${escort}`.padEnd(16),
        `value=${v.value.toFixed(1)} provisions=${v.provisions.toFixed(1)} tax=${v.tax.toFixed(1)} work=${v.work.toFixed(1)}`,
        `EV/idle=${(v.value / idle).toFixed(2)} EV/busy=${(v.value / busy).toFixed(2)}`,
        `lostVillagers=${v.lostVillagers.toFixed(2)} lostSoldiers=${v.lostSoldiers.toFixed(2)} happiness=${v.boon.toFixed(1)}`,
      )
    }
  }
}
