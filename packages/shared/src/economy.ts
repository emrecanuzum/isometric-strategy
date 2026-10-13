import { balance } from './balance'
import type { Point } from './iso'
import { TileRule, findPlot, territoryRect, tileRule } from './territory'
import type { Rect } from './territory'
import { Terrain } from './worldgen'
import type { World } from './worldgen'

// A kingdom's economy: gold plus three goods, produced by buildings and sold by the merchant of its trade post.
// Everything that takes time is stored as the moment it ends, and `advance` settles whatever has come due, so the
// same code can run on a server that only wakes up when asked.

export const GOODS = ['food', 'materials', 'arms'] as const
export type Good = (typeof GOODS)[number]
export type Resource = 'gold' | Good
export type Stock = Record<Resource, number>
export type Cost = Partial<Stock>

export const BUILDABLE = ['house', 'farm', 'lumberCamp', 'forge', 'dock'] as const
export type BuildingKind = 'palace' | 'tradePost' | (typeof BUILDABLE)[number]

// Weapons are worked from raw goods in the forge and kept in the armory, apart from the tradeable stores.
export const WEAPONS = ['sword', 'shield', 'bow'] as const
export type Weapon = (typeof WEAPONS)[number]
export type Armory = Record<Weapon, number>

// What a building can be set to make: `rate` units per unit of its amount, worked from `uses` per unit made.
export interface Product {
  makes: Good | Weapon
  rate: number
  uses?: Cost
}

// The parts of a building that change with its level.
export interface LevelSpec {
  cost?: Cost
  buildSeconds?: number
  villagers?: number
  workers?: number
  amount?: number
}

export interface BuildingSpec extends LevelSpec {
  size: number
  produces?: Good
  // Choices of what to make; the first is the default.
  products?: Record<string, Product>
  // Levels 2 and up: what changes from the level below (the cost and time are for the upgrade).
  levels?: LevelSpec[]
}

export const BUILDINGS = balance.economy.buildings as Record<BuildingKind, BuildingSpec>

export const maxLevel = (kind: BuildingKind) => 1 + (BUILDINGS[kind].levels?.length ?? 0)

// The spec of a building at `level`, with every level up to it applied.
export function levelSpec(kind: BuildingKind, level = 1): BuildingSpec {
  let spec = BUILDINGS[kind]
  for (const up of (BUILDINGS[kind].levels ?? []).slice(0, level - 1)) spec = { ...spec, ...up }
  return spec
}

// The cost and time of raising a building to the next level, or null at the top.
export const upgradeSpec = (b: Building): LevelSpec | null => BUILDINGS[b.kind].levels?.[(b.level ?? 1) - 1] ?? null

export const productOf = (b: Building): string | null => {
  const products = BUILDINGS[b.kind].products
  if (!products) return null
  return b.product && products[b.product] ? b.product : Object.keys(products)[0]
}

// Hands a building can take at its level, and how many are set to work there.
export const workerSlots = (b: Building) => levelSpec(b.kind, b.level).workers ?? 0
export const staffOf = (b: Building) => Math.min(workerSlots(b), Math.max(0, b.workers ?? workerSlots(b)))

export interface Building {
  id: number
  kind: BuildingKind
  x: number
  y: number
  size: number
  // When construction (or the last upgrade) ends; 0 for buildings that came with the kingdom.
  doneAt: number
  // 1 when absent (saves from before levels).
  level?: number
  // Villagers set to work here; a full crew when absent.
  workers?: number
  // The chosen product (see BuildingSpec.products); the first one when absent.
  product?: string
}

export interface Kingdom {
  // Given by the player at founding; absent in older saves.
  name?: string
  // When it was founded; the season's days count from here until lobbies have a season start. Absent in older saves.
  foundedAt?: number
  // The kingdom's colour (an id the client draws the palace roofs in); absent in older saves.
  color?: string
  site: Point
  // The predetermined plot on the shore where this kingdom may build its dock.
  dockPlot: Rect | null
  stock: Stock
  // Absent in saves from before weapons.
  armory?: Armory
  yields: Record<Good, number>
  buildings: Building[]
  nextId: number
  trade: {
    // Chosen by the player once the trade post stands; the merchant waits until then.
    good: Good | null
    level: number
    // The current trip started here and ends one trip length later.
    departedAt: number
  }
  nextProductionAt: number
  // Everything up to here has been settled by `advance`.
  settledAt: number
}

export type EconomyEvent =
  | { kind: 'trade'; good: Good; sold: number; gold: number }
  | { kind: 'built'; building: Building }
  | { kind: 'produced'; delta: Partial<Stock>; weapons?: Partial<Armory> }

const tripMs = () => balance.economy.trade.tripSeconds * 1000
const productionMs = () => balance.economy.productionSeconds * 1000

// ---- Survey: what the land around a site is good for -------------------------------------------------------------

export interface Survey {
  // Share of each kind of land in the area around the fully grown territory.
  water: number
  grass: number
  forest: number
  mountain: number
  swamp: number
  desert: number
  yields: Record<Good, number>
}

// Rivers and lakes mean fish and grassland means fields (food), mountains mean ore (arms), woods mean timber
// (materials); swamp drags everything down a little.
export function surveySite(world: World, site: Point): Survey {
  const { stageParcels } = balance.territory
  const { surveyMargin, yield: y } = balance.economy
  const rect = territoryRect(site, stageParcels.length - 1)
  const counts = { water: 0, grass: 0, forest: 0, mountain: 0, swamp: 0, desert: 0 }
  let total = 0
  for (let ty = rect.y - surveyMargin; ty < rect.y + rect.size + surveyMargin; ty++) {
    for (let tx = rect.x - surveyMargin; tx < rect.x + rect.size + surveyMargin; tx++) {
      if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) continue
      total++
      const t = world.terrain[ty * world.size + tx]
      if (t === Terrain.Lake || t === Terrain.River) counts.water++
      else if (t === Terrain.Grass) counts.grass++
      else if (t === Terrain.Forest) counts.forest++
      else if (t === Terrain.Mountain) counts.mountain++
      else if (t === Terrain.Swamp) counts.swamp++
      else if (t === Terrain.Desert) counts.desert++
    }
  }
  const share = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, n / Math.max(1, total)])) as typeof counts
  const clamp = (v: number) => Math.round(Math.min(y.max, Math.max(y.min, v)) * 100) / 100
  const swamp = share.swamp * y.swampPenalty
  return {
    ...share,
    yields: {
      food: clamp(y.base + share.water * y.foodPerWater + share.grass * y.foodPerGrass + share.desert * y.foodPerDesert + swamp),
      materials: clamp(y.base + share.forest * y.materialsPerForest + swamp),
      arms: clamp(y.base + share.mountain * y.armsPerMountain + swamp),
    },
  }
}

// ---- Placement ----------------------------------------------------------------------------------------------------

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.size + gap && b.x < a.x + a.size + gap && a.y < b.y + b.size + gap && b.y < a.y + a.size + gap

// Inside the territory, on free land, clear of other buildings by `gap` tiles.
export function canPlace(world: World, kingdom: Pick<Kingdom, 'site' | 'buildings'>, stage: number, spot: Rect, gap = 0) {
  const t = territoryRect(kingdom.site, stage)
  if (spot.x < t.x || spot.y < t.y || spot.x + spot.size > t.x + t.size || spot.y + spot.size > t.y + t.size) return false
  for (let y = spot.y; y < spot.y + spot.size; y++) {
    for (let x = spot.x; x < spot.x + spot.size; x++) if (tileRule(world, x, y) !== TileRule.Free) return false
  }
  return !kingdom.buildings.some((b) => overlaps(b, spot, gap))
}

// ---- Founding -----------------------------------------------------------------------------------------------------

// A new kingdom owns only its free level 1 trade post on the trade plot. The player lays out everything else,
// starting with the palace; the merchant waits until a good to sell is picked.
export function foundKingdom(world: World, site: Point, now: number, name?: string, color?: string): Kingdom {
  const kingdom: Kingdom = {
    name,
    color,
    foundedAt: now,
    site,
    dockPlot: findPlot(world, territoryRect(site, 0), TileRule.DockOnly)?.plot ?? null,
    stock: { ...balance.economy.startStock },
    yields: surveySite(world, site).yields,
    buildings: [],
    nextId: 1,
    trade: { good: null, level: 0, departedAt: now },
    nextProductionAt: now + productionMs(),
    settledAt: now,
  }
  const plot = findPlot(world, territoryRect(site, 0), TileRule.TradePostOnly)
  if (plot) kingdom.buildings.push({ id: kingdom.nextId++, kind: 'tradePost', ...plot.plot, doneAt: 0 })
  return kingdom
}

export const hasPalace = (kingdom: Kingdom) => kingdom.buildings.some((b) => b.kind === 'palace')

// The territory grows with the palace: palace level 1 holds the first stage, each finished level the next one. A
// palace still being raised holds the stage of the level below.
export function territoryStage(kingdom: Kingdom, now: number) {
  const palace = kingdom.buildings.find((b) => b.kind === 'palace')
  if (!palace) return 0
  const level = (palace.level ?? 1) - (palace.doneAt > now ? 1 : 0)
  return Math.min(balance.territory.stageParcels.length - 1, Math.max(0, level - 1))
}

// ---- Population ---------------------------------------------------------------------------------------------------

const done = (b: Building, at: number) => b.doneAt <= at

export const armoryOf = (kingdom: Kingdom): Armory => kingdom.armory ?? { sword: 0, shield: 0, bow: 0 }

export function population(kingdom: Kingdom, at: number) {
  let villagers = 0
  let jobs = 0
  for (const b of kingdom.buildings) {
    if (!done(b, at)) continue
    villagers += levelSpec(b.kind, b.level).villagers ?? 0
    jobs += staffOf(b)
  }
  // When more hands are set to work than there are villagers, every building works at a matching fraction.
  return { villagers, jobs, efficiency: jobs === 0 ? 1 : Math.min(1, villagers / jobs) }
}

const isGood = (v: string): v is Good => (GOODS as readonly string[]).includes(v)

// What one building makes in a round, before raw goods run short: the product, how many units, and what they use.
export function buildingOutput(kingdom: Kingdom, b: Building, at: number) {
  const spec = levelSpec(b.kind, b.level)
  if (!done(b, at) || !spec.amount) return null
  const slots = workerSlots(b)
  const crew = slots === 0 ? 1 : staffOf(b) / slots
  const choice = productOf(b)
  const product: Product = choice ? spec.products![choice] : { makes: spec.produces!, rate: 1 }
  // The land's yield only helps raw goods; worked goods depend on the hands alone.
  const land = isGood(product.makes) && !product.uses ? kingdom.yields[product.makes] : 1
  return { makes: product.makes, units: spec.amount * product.rate * land * crew * population(kingdom, at).efficiency, uses: product.uses }
}

// One production round: what it adds to and takes from the stores, and the weapons it works. Worked goods only use
// what is in `stock`; a forge short of raw goods works as many units as they allow.
export function roundOutcome(kingdom: Kingdom, at: number, stock: Stock = kingdom.stock) {
  const { villagers } = population(kingdom, at)
  const delta: Partial<Stock> = {}
  const weapons: Partial<Armory> = {}
  const left = { ...stock }
  for (const b of kingdom.buildings) {
    const out = buildingOutput(kingdom, b, at)
    if (!out) continue
    let units = out.units
    for (const [r, per] of Object.entries(out.uses ?? {})) units = Math.min(units, left[r as Resource] / (per ?? 1))
    units = Math.max(0, units)
    for (const [r, per] of Object.entries(out.uses ?? {})) {
      left[r as Resource] -= units * (per ?? 0)
      delta[r as Resource] = (delta[r as Resource] ?? 0) - units * (per ?? 0)
    }
    if (isGood(out.makes)) delta[out.makes] = (delta[out.makes] ?? 0) + units
    else weapons[out.makes] = (weapons[out.makes] ?? 0) + units
  }
  delta.food = (delta.food ?? 0) - villagers * balance.economy.foodPerVillager
  return { delta, weapons }
}

// What one production round adds to (and eats from) the stores.
export const productionRound = (kingdom: Kingdom, at: number): Partial<Stock> => roundOutcome(kingdom, at).delta

export const tradeUnits = (kingdom: Kingdom) => balance.economy.trade.levels[kingdom.trade.level].units

export const hasTradePost = (kingdom: Kingdom) => kingdom.buildings.some((b) => b.kind === 'tradePost')

export const constructing = (kingdom: Kingdom, at: number) => kingdom.buildings.filter((b) => !done(b, at))

// ---- Commands -----------------------------------------------------------------------------------------------------

export const affordable = (stock: Stock, cost: Cost = {}) =>
  Object.entries(cost).every(([k, v]) => stock[k as Resource] >= (v ?? 0))

const pay = (stock: Stock, cost: Cost = {}): Stock => {
  const next = { ...stock }
  for (const [k, v] of Object.entries(cost)) next[k as Resource] -= v ?? 0
  return next
}

export type BuildError = 'palace' | 'unique' | 'cost' | 'queue' | 'spot' | 'top' | 'busy'

export function buildError(world: World, kingdom: Kingdom, stage: number, kind: BuildingKind, spot: Point | null, now: number): BuildError | null {
  const spec = BUILDINGS[kind]
  // One palace, placed first; it stands at once and takes no construction slot.
  if ((kind === 'palace') === hasPalace(kingdom)) return 'palace'
  if (kind === 'dock' && (!kingdom.dockPlot || kingdom.buildings.some((b) => b.kind === 'dock'))) return 'unique'
  if (!affordable(kingdom.stock, spec.cost)) return 'cost'
  if (kind !== 'palace' && constructing(kingdom, now).length >= balance.economy.maxConstructions) return 'queue'
  // The dock goes on its plot, which may lie outside the territory; everything else where the player puts it.
  if (spot && kind !== 'dock' && !canPlace(world, kingdom, stage, { ...spot, size: spec.size })) return 'spot'
  return null
}

export function build(world: World, kingdom: Kingdom, stage: number, kind: BuildingKind, spot: Point, now: number): Kingdom {
  if (buildError(world, kingdom, stage, kind, spot, now)) return kingdom
  const spec = BUILDINGS[kind]
  if (kind === 'dock') spot = kingdom.dockPlot!
  const building: Building = { id: kingdom.nextId, kind, x: spot.x, y: spot.y, size: spec.size, doneAt: now + (spec.buildSeconds ?? 0) * 1000 }
  return { ...kingdom, stock: pay(kingdom.stock, spec.cost), buildings: [...kingdom.buildings, building], nextId: kingdom.nextId + 1 }
}

// Why a building cannot be raised a level now, if it cannot.
export function upgradeError(kingdom: Kingdom, id: number, now: number): BuildError | null {
  const b = kingdom.buildings.find((x) => x.id === id)
  const up = b && upgradeSpec(b)
  if (!b || !up) return 'top'
  if (!done(b, now)) return 'busy'
  if (!affordable(kingdom.stock, up.cost)) return 'cost'
  if (constructing(kingdom, now).length >= balance.economy.maxConstructions) return 'queue'
  return null
}

// An upgrade takes a construction slot; the building stands as a building site (and makes nothing) until it ends.
export function upgradeBuilding(kingdom: Kingdom, id: number, now: number): Kingdom {
  if (upgradeError(kingdom, id, now)) return kingdom
  const b = kingdom.buildings.find((x) => x.id === id)!
  const up = upgradeSpec(b)!
  const next: Building = { ...b, level: (b.level ?? 1) + 1, doneAt: now + (up.buildSeconds ?? 0) * 1000 }
  return { ...kingdom, stock: pay(kingdom.stock, up.cost), buildings: kingdom.buildings.map((x) => (x.id === id ? next : x)) }
}

const editBuilding = (kingdom: Kingdom, id: number, change: (b: Building) => Building): Kingdom => ({
  ...kingdom,
  buildings: kingdom.buildings.map((b) => (b.id === id ? change(b) : b)),
})

export const setWorkers = (kingdom: Kingdom, id: number, workers: number): Kingdom =>
  editBuilding(kingdom, id, (b) => ({ ...b, workers: Math.min(workerSlots(b), Math.max(0, Math.round(workers))) }))

export const setProduct = (kingdom: Kingdom, id: number, product: string): Kingdom =>
  editBuilding(kingdom, id, (b) => (BUILDINGS[b.kind].products?.[product] ? { ...b, product } : b))

// Choosing (or changing) the good sends the merchant off on a fresh trip.
export function setTradeGood(kingdom: Kingdom, good: Good, now: number): Kingdom {
  if (!hasTradePost(kingdom) || kingdom.trade.good === good) return kingdom
  return { ...kingdom, trade: { ...kingdom.trade, good, departedAt: now } }
}

export const tradeUpgradeCost = (kingdom: Kingdom): Cost | null =>
  balance.economy.trade.levels[kingdom.trade.level + 1]?.cost ?? null

export function upgradeTrade(kingdom: Kingdom): Kingdom {
  const cost = tradeUpgradeCost(kingdom)
  if (!cost || !affordable(kingdom.stock, cost)) return kingdom
  return { ...kingdom, stock: pay(kingdom.stock, cost), trade: { ...kingdom.trade, level: kingdom.trade.level + 1 } }
}

// ---- Time ---------------------------------------------------------------------------------------------------------

// Settles everything due by `now`, in the order it happened. Returns the same object when nothing was due.
export function advance(kingdom: Kingdom, now: number): { kingdom: Kingdom; events: EconomyEvent[] } {
  const events: EconomyEvent[] = []
  let k = kingdom
  const edit = () =>
    k === kingdom ? (k = { ...kingdom, stock: { ...kingdom.stock }, armory: { ...armoryOf(kingdom) }, trade: { ...kingdom.trade } }) : k
  // A building counts from the moment it is done, so production rounds after that use it.
  const finishing = kingdom.buildings.filter((b) => b.doneAt > kingdom.settledAt && b.doneAt <= now)
  for (;;) {
    const tripEnd = k.trade.good ? k.trade.departedAt + tripMs() : Infinity
    const next = Math.min(tripEnd, k.nextProductionAt)
    if (next > now) break
    edit()
    if (next === k.nextProductionAt) {
      const { delta, weapons } = roundOutcome(k, next)
      for (const [r, v] of Object.entries(delta)) k.stock[r as Resource] = Math.max(0, k.stock[r as Resource] + (v ?? 0))
      for (const [w, v] of Object.entries(weapons)) k.armory![w as Weapon] += v ?? 0
      k.nextProductionAt += productionMs()
      events.push({ kind: 'produced', delta, weapons })
    } else {
      const good = k.trade.good!
      const sold = Math.min(tradeUnits(k), Math.floor(k.stock[good]))
      const gold = sold * balance.economy.trade.price[good]
      k.stock[good] -= sold
      k.stock.gold += gold
      k.trade.departedAt = next
      events.push({ kind: 'trade', good, sold, gold })
    }
  }
  for (const building of finishing) events.push({ kind: 'built', building })
  if (finishing.length > 0) edit()
  if (k !== kingdom) k.settledAt = now
  return { kingdom: k, events }
}

const isWater = (world: World, x: number, y: number) =>
  x >= 0 && y >= 0 && x < world.size && y < world.size &&
  (world.terrain[y * world.size + x] === Terrain.Lake || world.terrain[y * world.size + x] === Terrain.River)

// The jetty of a dock on `plot`: of the lanes leaving each side of the plot (one per edge tile), it takes the one
// running furthest over open water.
export function dockPier(world: World, plot: Rect, maxLength = 3) {
  const across = 0.8
  let best: { x: number; y: number; w: number; h: number; along: 'x' | 'y' } | null = null
  let bestLength = 0
  for (const { dx, dy } of [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]) {
    for (let lane = 0; lane < plot.size; lane++) {
      let length = 0
      for (let d = 1; d <= maxLength; d++) {
        const x = dx > 0 ? plot.x + plot.size - 1 + d : dx < 0 ? plot.x - d : plot.x + lane
        const y = dy > 0 ? plot.y + plot.size - 1 + d : dy < 0 ? plot.y - d : plot.y + lane
        if (!isWater(world, x, y)) break
        length = d
      }
      if (length <= bestLength) continue
      bestLength = length
      const side = lane + (1 - across) / 2
      best =
        dx !== 0
          ? { x: dx > 0 ? plot.x + plot.size : plot.x - length, y: plot.y + side, w: length, h: across, along: 'x' }
          : { x: plot.x + side, y: dy > 0 ? plot.y + plot.size : plot.y - length, w: across, h: length, along: 'y' }
    }
  }
  return best
}
