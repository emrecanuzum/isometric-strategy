// A night away, worked out with the real rules (`advance`): a typical lordship at each palace level is laid out on a
// real world, its treasury and stores a third full, and left alone for ten hours while the rival crown's collectors
// and the own crown's patrol come as the balance says (the demand paid in full, the lord asleep). Prints what the
// treasury and the stores did, and what an hour online brings for comparison. For tuning CLAUDE.md §6.4 / §7.8.
//
//   bun scripts/offline-balance.ts [hours=10] [seed=777]
//   BAL='{"economy.trade.price.food":0.4}' bun scripts/offline-balance.ts   (what-if: balance values overridden by path)
import * as g from '../packages/shared/src'
import type { BuildingKind, Kingdom, Point, World } from '../packages/shared/src'

for (const [path, value] of Object.entries(JSON.parse(process.env.BAL ?? '{}') as Record<string, unknown>)) {
  const keys = path.split('.')
  let node = g.balance as unknown as Record<string, unknown>
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>
  node[keys[keys.length - 1]] = value
}

const hours = Number(process.argv[2] ?? 10)
const seed = Number(process.argv[3] ?? 777)
const world: World = g.generateWorld(seed)
const spec = g.balance.cities.crown.patrol

// What a lord who plays sensibly has standing at each palace level: [kind, how many, level].
const LAYOUT: Record<number, [BuildingKind, number, number][]> = {
  1: [['farm', 3, 1], ['lumberCamp', 2, 1], ['forge', 1, 1], ['house', 5, 1]],
  2: [['farm', 4, 2], ['lumberCamp', 3, 2], ['forge', 2, 1], ['house', 9, 2], ['warehouse', 1, 1], ['market', 1, 1], ['barracks', 1, 1]],
  3: [['farm', 6, 2], ['lumberCamp', 4, 2], ['forge', 3, 2], ['house', 13, 2], ['warehouse', 1, 2], ['market', 1, 1], ['barracks', 1, 1], ['temple', 1, 1], ['hospital', 1, 1]],
  4: [['farm', 8, 3], ['lumberCamp', 5, 3], ['forge', 3, 3], ['house', 16, 3], ['warehouse', 1, 3], ['treasury', 1, 1], ['tavern', 1, 1], ['market', 1, 1], ['barracks', 1, 1], ['temple', 1, 2], ['hospital', 1, 1]],
  5: [['farm', 10, 3], ['lumberCamp', 6, 3], ['forge', 4, 3], ['house', 20, 3], ['warehouse', 1, 3], ['treasury', 1, 3], ['tavern', 1, 1], ['guildHall', 1, 1], ['market', 1, 1], ['barracks', 1, 1], ['temple', 1, 3], ['hospital', 1, 2]],
}
const SOLDIERS = [0, 0, 6, 10, 15, 20]
const TRADE_LEVEL = [0, 0, 1, 2, 2, 2]

function spot(k: Kingdom, kind: BuildingKind, at: number): Point | null {
  const stage = g.territoryStage(k, at)
  const r = g.territoryRect(k.site, stage)
  const palace = k.buildings.find((b) => b.kind === 'palace') ?? k.site
  let best: Point | null = null
  let bestD = Infinity
  for (let y = r.y; y < r.y + r.size; y++)
    for (let x = r.x; x < r.x + r.size; x++) {
      const d = Math.hypot(x - palace.x, y - palace.y)
      if (d < bestD && g.canPlace(world, k, stage, { x, y, size: g.BUILDINGS[kind].size }, 1, kind)) {
        best = { x, y }
        bestD = d
      }
    }
  return best
}

function lordship(level: number): Kingdom {
  const at = Date.UTC(2026, 9, 1)
  const site = g.assignStartSite(world, () => 0.37)!
  let k = g.foundKingdom(world, site, at - 1, 'Örnek', 'red')
  k = g.build(world, k, 0, 'palace', spot(k, 'palace', at)!, at - 1)
  k = { ...k, buildings: k.buildings.map((b) => (b.kind === 'palace' ? { ...b, level, doneAt: 0 } : { ...b, doneAt: 0 })) }
  for (const [kind, count, lv] of LAYOUT[level]) {
    for (let i = 0; i < count; i++) {
      const p = spot(k, kind, at)
      if (!p) break
      k = { ...k, buildings: [...k.buildings, { id: k.nextId, kind, x: p.x, y: p.y, size: g.BUILDINGS[kind].size, doneAt: 0, level: lv }], nextId: k.nextId + 1 }
    }
  }
  const units = { spear: SOLDIERS[level] }
  k = { ...k, units, soldiers: SOLDIERS[level], queen: level >= 2, liege: 0, liegeAt: 0, trade: { ...k.trade, good: 'materials', level: TRADE_LEVEL[level], departedAt: at }, settledAt: at, nextProductionAt: at + 10_000 }
  // Settled in: the people grown into their homes, the mood where a normal tax leaves it.
  const room = g.population(k, at).room
  return { ...k, people: room, happiness: 65 }
}

function run(source: Kingdom, minutes: number, away: boolean) {
  const t0 = source.settledAt
  const cap0 = g.goldCap(source, t0)
  const store0 = g.storageCap(source, t0)
  let k: Kingdom = { ...source, lastSeenAt: t0, lastActedAt: t0, stock: { gold: Math.round(cap0 / 3), food: Math.round(store0 / 3), materials: Math.round(store0 / 3), arms: Math.round(store0 / 3) } }
  const start = { ...k.stock }
  const level = g.palaceLevel(k, t0)
  const newcomer = level < spec.newcomer.belowPalace
  let tribute = 0
  let tips = 0
  const end = t0 + minutes * 60_000
  for (let t = t0 + 60_000; t <= end; t += 60_000) {
    k = g.advance(k, t, null).kingdom
    if (!away) k = { ...k, lastSeenAt: t, lastActedAt: t }
    const since = t - t0
    if (since % (spec.tribute.everySeconds * 1000) === 0) {
      if (newcomer) {
        tips += spec.newcomer.rivalGift
        k = { ...k, stock: { ...k.stock, gold: Math.min(g.goldCap(k, t), k.stock.gold + spec.newcomer.rivalGift) } }
      } else {
        const due = Math.min(Math.floor(k.stock.gold), g.tributeDemand(k.stock.gold, 1, level))
        tribute += due
        k = { ...k, stock: { ...k.stock, gold: k.stock.gold - due } }
      }
    }
    if (since % (spec.slotSeconds * 1000) === 0) {
      const tavern = k.buildings.some((b) => b.kind === 'tavern' && b.doneAt <= t)
      const tip = newcomer ? spec.newcomer.tip : tavern ? spec.tip : ((spec as { plainTip?: number }).plainTip ?? 0)
      tips += tip
      k = { ...k, stock: { ...k.stock, gold: Math.min(g.goldCap(k, t), k.stock.gold + tip) } }
    }
  }
  return { k, start, tribute, tips, level, end }
}

console.log(`${hours} saat çevrimdışı (tohum ${seed}); karşılaştırma için 1 saat çevrimiçi:`)
for (const level of [1, 2, 3, 4, 5]) {
  const lord = lordship(level)
  const off = run(lord, hours * 60, true)
  const on = run(lord, 60, false)
  const { k, start, end } = off
  const cap = g.goldCap(k, end)
  const goods = (['food', 'materials', 'arms'] as const).map((x) => `${x[0]} ${Math.round(start[x])}→${Math.round(k.stock[x])}`).join(' ')
  const pop = g.population(k, end)
  if (process.env.BOOKS) {
    const b0 = (lord.books ?? {}) as Record<string, number>
    const b1 = (k.books ?? {}) as Record<string, number>
    console.log('  defter:', Object.fromEntries(Object.entries(b1).filter(([, v]) => typeof v === 'number').map(([key, v]) => [key, Math.round(v - (b0[key] ?? 0))]).filter(([, v]) => v !== 0)))
  }
  const b0 = (on.start && (lord.books ?? {})) as Record<string, number>
  const b1 = (on.k.books ?? {}) as Record<string, number>
  const d = (key: string) => (b1[key] ?? 0) - (b0[key] ?? 0)
  const gross = d('tax') + d('trade') + d('other') + on.tips - d('wages')
  console.log(
    `sv${level} altın ${Math.round(start.gold)}→${Math.round(k.stock.gold)} / ${cap} (${Math.round((100 * k.stock.gold) / cap)}%)  haraç −${off.tribute} bahşiş +${off.tips}  ${goods} / ${g.storageCap(k, end)}  köylü ${pop.villagers}/${pop.cap}  · çevrimiçi saatte: vergi ${Math.round(d('tax'))} tüccar ${Math.round(d('trade'))} maaş −${Math.round(d('wages'))} haraç −${on.tribute} → net +${Math.round(gross - on.tribute)}`,
  )
}
