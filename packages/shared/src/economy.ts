import { balance } from './balance'
import { calendarAt, seasonEffect } from './clock'
import type { Season } from './clock'
import type { Point } from './iso'
import { priceAt } from './market'
import type { Market } from './market'
import { happinessStep, happinessTarget, isNightAt, popCapFor, recruitTerms, taxSpec } from './society'
import { overreachFor, townUpkeep, townYield, townsRound } from './towns'
import type { HeldTown, LostTown } from './towns'
import { addUnits, countOf, garrisonOf, unitSpec } from './units'
import { perSpan } from './span'
import type { SpanCache } from './span'
import { cutOff, imprisoned } from './walls'
import { dynastyEffects, dynastyStep, townKinBonus } from './dynasty'
import type { Dynasty, DynastyEvent } from './dynasty'
import type { Pretender } from './intrigue'
import { changeCrownRelation, driftCrownRelations, fealtyOpen, settleOrderTrips, stewardFactor } from './crowns'
import type { OrderTrip, QuestTaken, RoyalAnswer } from './crowns'
import { crisisDecideMs, crisisKey, crisisWarded, isCrisis, isDilemma, fortuneEffects, fortunesBegun, hasResearch, hospitalHeal, levelOf, researchEffects, sermonTaxFactor, templeHappiness } from './institutions'
import type { FortuneKind, FortuneScope } from './institutions'
import type { Unit, Units } from './units'
import type { TaxLevel } from './society'
import { TileRule, findPlot, territoryRect, tileRule } from './territory'
import type { Rect } from './territory'
import { Terrain, cityCenter } from './worldgen'
import { cargoOf, fishCatch, huntRound, launchShips, navyOf, navyUpkeep, nextVoyage, sailorsOf, takeFleetLosses, voyagePirates } from './navy'
import type { Blockade, Navy, Ship } from './navy'
import type { World } from './worldgen'
import { escortAway, expeditionHappiness, settleExpeditions, villagersAway } from './expeditions'
import type { Expedition } from './expeditions'
import { checkGoals } from './goals'
import { guildOf, memorialHappiness } from './landmarks'
import type { GoalsReached } from './goals'
import { outlawEffects } from './outlawPressure'
import type { OutlawPressure } from './outlawPressure'

// A kingdom's economy: gold plus three goods, produced by buildings and sold by the merchant of its trade post.
// Everything that takes time is stored as the moment it ends, and `advance` settles whatever has come due, so the
// same code can run on a server that only wakes up when asked.

export const GOODS = ['food', 'materials', 'arms'] as const
export type Good = (typeof GOODS)[number]
export type Resource = 'gold' | Good
export type Stock = Record<Resource, number>
export type Cost = Partial<Stock>

export const BUILDABLE = ['house', 'farm', 'lumberCamp', 'forge', 'dock', 'market', 'barracks', 'spyHouse', 'watchtower', 'wall', 'gate', 'road', 'university', 'hospital', 'temple', 'warehouse', 'treasury', 'fisherHut', 'prison', 'tavern', 'shipyard', 'citadel', 'memorial', 'guildHall'] as const
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
  // The research it waits for (institutions.ts).
  research?: string
}

// The parts of a building that change with its level.
export interface LevelSpec {
  cost?: Cost
  buildSeconds?: number
  villagers?: number
  workers?: number
  amount?: number
  // Room it adds to the stores of each good (warehouses), and to the treasury's gold (treasuries).
  storage?: number
  gold?: number
}

export interface BuildingSpec extends LevelSpec {
  size: number
  // The palace level it waits for (CLAUDE.md §9.7).
  requiresPalace?: number
  // Built without taking one of the construction slots (wall segments).
  outsideQueue?: boolean
  // Only one may stand.
  unique?: boolean
  // Goes on a shore tile (beside the water), where nothing else but a dock may stand.
  shoreOnly?: boolean
  // Stands at the water's edge: on free land and shore tiles, with at least one shore tile (the shipyard).
  coastal?: boolean
  // Gold it brings in every round on its own (the fisher's finds in the river).
  goldPerRound?: number
  // How many may stand at each palace level (houses), so growing the town means raising them too.
  maxByPalaceLevel?: number[]
  produces?: Good
  // Choices of what to make; the first is the default.
  products?: Record<string, Product>
  // Levels 2 and up: what changes from the level below (the cost and time are for the upgrade).
  levels?: LevelSpec[]
}

export const BUILDINGS = balance.economy.buildings as Record<BuildingKind, BuildingSpec>

export const maxLevel = (kind: BuildingKind) => 1 + (BUILDINGS[kind].levels?.length ?? 0)

// The spec of a building at `level`, with every level up to it applied. Worked out once per kind and level: it is
// read for every building in every production round.
const specs = new Map<BuildingKind, BuildingSpec[]>()
export function levelSpec(kind: BuildingKind, level = 1): BuildingSpec {
  let byLevel = specs.get(kind)
  if (!byLevel) specs.set(kind, (byLevel = []))
  let spec = byLevel[level]
  if (spec) return spec
  spec = BUILDINGS[kind]
  for (const up of (BUILDINGS[kind].levels ?? []).slice(0, level - 1)) spec = { ...spec, ...up }
  byLevel[level] = spec
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
  // Walls only: knocked down in a siege, standing again once repaired.
  broken?: boolean
  // Walls only: a tower beside a gate (taller).
  tower?: boolean
  // Gates only: the direction of the wall it stands in.
  along?: Along
  // Built free as the kingdom's first of its kind (its building cost is not refunded on demolition).
  free?: boolean
  // Being moved (until doneAt): unlike an upgrade, its level stands as it was.
  moving?: boolean
}

// Gold that changes hands every production round under an accepted tribute (CLAUDE.md §9.7).
export interface Tribute {
  // The other kingdom (its id and name as it was when agreed).
  other: number
  name: string
  gold: number
  // 'in': the other kingdom pays us; 'out': we pay it.
  dir: 'in' | 'out'
  // The pact on the server.
  pact?: number
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
    // The player chose to sell nothing for now (the merchant stays home without asking again).
    idle?: boolean
    // Wrecked by raiders: the merchant cannot trade until it is repaired.
    damaged?: boolean
    level: number
    // Units the player sends on each trip (a multiple of balance.economy.trade.amountStep, at most what the level
    // allows); absent: as many as the level allows.
    amount?: number
    // When the amount was last changed; it can be changed again amountCooldownSeconds later.
    amountAt?: number
    // The current trip started here and ends one trip length later.
    departedAt: number
    // Everything the merchant has sold this season, per good, and the gold it brought (absent in older saves). Others
    // see it rounded (the lobby's trade shares).
    ledger?: TradeLedger
    // Sent to a free city instead of the lobby's market (CLAUDE.md §7.6): which one (its index in world.cities) and how
    // long a trip there and back takes; when the destination was last changed.
    city?: { index: number; tripMs: number }
    cityAt?: number
  }
  nextProductionAt: number
  // Everything up to here has been settled by `advance`.
  settledAt: number
  // The people (absent in older saves: normal tax, starting happiness, no queen).
  tax?: TaxLevel
  happiness?: number
  queen?: boolean
  // The villagers (soldiers and crews apart): homes give room, and the people grow into it a little every round
  // (growthTerms). Absent in older saves: as many as there is room for.
  people?: number
  // At war with another lord, and a siege at the palace until then (set by the server; they slow the people's growth
  // or drive them away, CLAUDE.md §5.2).
  atWar?: boolean
  besiegedUntil?: number
  // Soldiers at the palace (how many, and of which kinds), soldiers out in armies (their rows are on the server), and
  // batches still training. The pool of people ready to take up arms refills a little every round.
  soldiers?: number
  units?: Units
  fielded?: number
  training?: { count: number; doneAt: number; unit?: Unit }[]
  manpower?: number
  // Working through the night: full output after dark, at the cost of the people's mood and a growing tiredness.
  nightShift?: boolean
  fatigue?: number
  // A queen carried off by another kingdom's spies, the queens this kingdom holds, and a revolt incited until then.
  // A queen's ransom is set when she is taken (see ransomFor).
  queenHeldBy?: { id: number; name: string; ransom?: number } | null
  hostages?: { of: number; name: string; ransom?: number }[]
  revoltUntil?: number
  // Kinds whose free first building has been used (see balance.economy.freeFirst).
  freeUsed?: BuildingKind[]
  // When this kingdom's spies last tried an operation (they pause between tries).
  lastOperationAt?: number
  // When its soldiers last raided another kingdom's trade route.
  lastRaidAt?: number
  // Spies at home (idle or on counter-espionage) and out on missions; the next one the spy house trains.
  spies?: number
  spiesAway?: number
  nextSpyAt?: number
  tributes?: Tribute[]
  // Studies at the university (finished once doneAt has passed; one at a time), the share of the villagers lying
  // sick, and the temple's sermon on taxes.
  researches?: { id: string; doneAt: number }[]
  sickness?: number
  sermonUntil?: number
  lastSermonAt?: number
  // When the player last gave a command or had the game open (an absent ruler's lands give less, see idleFactor).
  lastSeenAt?: number
  // The crown kingdom this lord has sworn fealty to (its capital's index in world.cities; CLAUDE.md §7.8), for the
  // whole season.
  liege?: number
  // When fealty was sworn: no patrol or collectors call for a visit that came before it (absent in older saves).
  liegeAt?: number
  // The lord's house: ruler, lady and children (CLAUDE.md §9.1; dynasty.ts).
  dynasty?: Dynasty
  // The lord's standing with each crown kingdom, −100 to 100 (by capital index; crowns.ts). Missing: at rest.
  crownRelations?: number[]
  // A brother of the ruler risen against him, camped near the realm (CLAUDE.md §9.1.1; intrigue.ts).
  pretender?: Pretender
  // Answers to the crises of the day (CLAUDE.md §9.8): by the fortune's key (see crisisKey), what was done and when.
  // A choice's answer is 'a' or 'b' (institutions.ts, dilemmaError).
  responses?: Record<string, { choice: 'villagers' | 'army' | 'none' | 'a' | 'b'; at: number }>
  // The garrison is out fighting a fire or a flood until then: no army may be led out.
  armyLockUntil?: number
  // The lobby's number, which seeds the fortunes the whole lobby shares (set by the server; institutions.ts).
  lobbyKey?: number
  // When the lobby's season began (set by the server): the calendar and its seasons count from it (clock.ts).
  seasonStart?: number
  // Taken in a siege: no army may lay siege to the palace again until then (CLAUDE.md §8.3).
  shieldUntil?: number
  // An enemy army camped at the border frightens the people until then (CLAUDE.md §9.7).
  fearUntil?: number
  // The mysterious fisher's last cast and what the fishing brought (newest first; kept by the server).
  lastFishAt?: number
  // The cast under way: the seed the server drew for its game, and when the line went in.
  fishCast?: { seed: number; at: number }
  fisherLog?: FisherEntry[]
  // The mini-games at the barracks, the forge, the trade post, the lumber camp, the farm and the dock (minigames.ts;
  // kept by the server): when each was last played, the run under way (its seed and when it began) and the best score.
  minigames?: Partial<
    Record<'archery' | 'anvil' | 'caravan' | 'woodsplit' | 'harvest' | 'net', { lastAt: number; run?: { seed: number; at: number } | null; best?: number }>
  >
  // What the mini-games brought within the last hour, at its worth in gold (their shared budget; minigames.ts).
  minigameEarned?: { at: number; worth: number }[]
  // Battles and sieges won (kept by the server, for the lobby's ranking).
  // Expeditions back (not called home early) are counted here too (CLAUDE.md §9.9).
  record?: { battlesWon?: number; siegesWon?: number; expeditions?: number }
  // The towns it holds and what each sends (kept by the server as towns are taken; CLAUDE.md §8.4).
  towns?: HeldTown[]
  // Towns that broke free of the lord in a revolt, for the server to set free (CLAUDE.md §8.4; the latest few).
  townsLost?: LostTown[]
  // The season's accounts: every gold piece that came in or went out and why, the soldiers lost and to what (see
  // Books). Absent in older saves.
  books?: Books
  // When the lord last gave a real command (not the open game's "still here"; see presenceAt).
  lastActedAt?: number
  // When the people last fled a siege (they flee at most once in a while; CLAUDE.md §5.2).
  fledAt?: number
  // The crowns' commissions delivered: by crown, the window last delivered in (crowns.ts, crownOrder).
  ordersDone?: number[]
  // The crowns' tasks taken this window (CLAUDE.md §7.8; crowns.ts → takeQuest), by crown.
  crownQuests?: (QuestTaken | null)[]
  // Caravans on their way to a crown with its order, paid when they are back (crowns.ts).
  orderTrips?: OrderTrip[]
  // The liege's royal requests answered (CLAUDE.md §7.8; crowns.ts → royalRequest): taken on, turned down or
  // delivered, the latest day's worth.
  royal?: RoyalAnswer[]
  // The lord's ships: the harbour, the fleets and the slipways (navy.ts; CLAUDE.md §8.5).
  navy?: Navy
  // Another lord's fleet blockading this lord's dock (set and cleared by the server).
  blockade?: Blockade | null
  // How things stood when the player was last seen (kept by the server with lastSeenAt): the "while you were away"
  // report reads what changed since from it.
  seen?: SeenSnapshot
  // Parties of villagers on the road, and the latest ones back (expeditions.ts; CLAUDE.md §9.9).
  expeditions?: Expedition[]
  nextExpeditionId?: number
  // The season's goals reached: by track, the tier and when (goals.ts).
  goals?: GoalsReached
  // A steward who turns the villagers out against a crisis nobody answered in time, for a small fee (CLAUDE.md §9.8).
  steward?: boolean
  // How much of the road by the trade post bandits hold and how hard pirates press the water by the dock (set by the
  // server; CLAUDE.md §7.9, §8.5; outlawPressure.ts). Absent: none.
  outlaws?: OutlawPressure | null
}

// The season's running accounts (CLAUDE.md §6.4): kept as things happen, so the report of a long absence says what
// really came and went instead of guessing from the rates of the moment. Gold is counted as it was earned; what a full
// treasury could not hold is counted again under wastedGold.
export interface Books {
  tax: number
  wages: number
  trade: number
  // Merchant trips that came back without selling because the treasury was full.
  tradeHeld: number
  // What other lords paid in tribute, and what was paid to them.
  tributeIn: number
  tributeOut: number
  // What the crowns' patrols took (tribute) and left (tips and gifts).
  crownPaid: number
  crownGot: number
  // The upkeep paid to the towns held (CLAUDE.md §8.4); absent in older books.
  townUpkeep?: number
  // Merchant trips made with a lighter load while the lord was away.
  tradeSlack?: number
  // The navy: the crews' pay, what sea trade brought, the pirates' bounties (absent in older books).
  navy?: number
  sea?: number
  bounty?: number
  // Gold the lord's towns took from other lords buying at their markets (CLAUDE.md §8.4); absent in older books.
  townSales?: number
  // Gold the expeditions brought home.
  expedition?: number
  // What bandits took off the merchant's gold, and the loot and bounties won off bandits and pirates (CLAUDE.md §7.9).
  outlaws?: number
  outlawLoot?: number
  // Towns, the fisher's river finds, fortunes of the day.
  other: number
  wastedGold: number
  wastedGoods: number
  // Soldiers lost, by what took them.
  lost: Partial<Record<SoldierLoss, number>>
}
export type SoldierLoss = 'battle' | 'siege' | 'town' | 'towers' | 'raid' | 'crisis' | 'disband' | 'expedition'

export interface SeenSnapshot {
  at: number
  stock: Stock
  books: Books
  ledger?: TradeLedger
  soldiers: number
  villagers: number
  happiness: number
}

const NO_BOOKS: Books = { tax: 0, wages: 0, trade: 0, tradeHeld: 0, tributeIn: 0, tributeOut: 0, crownPaid: 0, crownGot: 0, other: 0, wastedGold: 0, wastedGoods: 0, townUpkeep: 0, expedition: 0, outlaws: 0, outlawLoot: 0, lost: {} }
export const booksOf = (kingdom: Pick<Kingdom, 'books'>): Books => ({ ...NO_BOOKS, ...kingdom.books, lost: { ...kingdom.books?.lost } })

// Adds to the accounts (a new kingdom object; the state is never edited in place outside advance).
export function book<K extends Pick<Kingdom, 'books'>>(kingdom: K, add: Partial<Omit<Books, 'lost'>>, lost?: Partial<Record<SoldierLoss, number>>): K {
  const b = booksOf(kingdom)
  // (A key older books lack starts at nothing rather than turning the sum into NaN.)
  for (const [key, v] of Object.entries(add)) (b as unknown as Record<string, number>)[key] = ((b as unknown as Record<string, number>)[key] ?? 0) + (v ?? 0)
  for (const [key, v] of Object.entries(lost ?? {})) b.lost[key as SoldierLoss] = (b.lost[key as SoldierLoss] ?? 0) + (v ?? 0)
  return { ...kingdom, books: b }
}

// How things stand now, for the next "while you were away" report.
export const seenSnapshot = (kingdom: Kingdom, at: number): SeenSnapshot => ({
  at,
  stock: { ...kingdom.stock },
  books: booksOf(kingdom),
  ...(kingdom.trade.ledger && { ledger: kingdom.trade.ledger }),
  soldiers: soldiersOf(kingdom),
  villagers: population(kingdom, at).villagers,
  happiness: happinessOf(kingdom),
})

// What a cast brought: a bag of goods, a bottle with word of another kingdom, or nothing.
export type FisherEntry =
  | { at: number; kind: 'bag'; goods: Partial<Stock> }
  | { at: number; kind: 'bottle'; about: string; color: string | null; metric: 'gold' | 'food' | 'materials' | 'arms' | 'soldiers'; atLeast: number }
  | { at: number; kind: 'miss' }

export type EconomyEvent =
  | DynastyEvent
  | { kind: 'trade'; good: Good; sold: number; gold: number; walledIn?: boolean; damaged?: boolean; city?: number; full?: boolean; robbed?: number }
  | { kind: 'built'; building: Building }
  | { kind: 'produced'; delta: Partial<Stock>; weapons?: Partial<Armory> }
  | { kind: 'trained'; count: number }
  | { kind: 'spy' }
  | { kind: 'wasted'; lost: Partial<Record<Resource, number>> }
  | { kind: 'researched'; id: string }
  | { kind: 'fortune'; fortune: FortuneKind; scope: FortuneScope; start: number; until: number; lost?: Partial<Stock>; gold?: number; crisis?: boolean; dilemma?: boolean }
  // A crisis nobody answered in time: its harm done (CLAUDE.md §9.8), or the steward turned the villagers out.
  | { kind: 'crisis'; fortune: FortuneKind; lost?: Partial<Stock>; sick?: number; steward?: boolean }
  // A party back from its journey (CLAUDE.md §9.9), and a goal of the season reached.
  | { kind: 'expedition'; expedition: Expedition }
  | { kind: 'goal'; track: string; tier: number; gold: number }
  // A held town rose against its lord, or broke free of him (CLAUDE.md §8.4).
  | { kind: 'townRevolt' | 'townFree'; town: number; name?: string }
  // The navy (CLAUDE.md §8.5): ships launched, a sea-trade voyage back (perhaps met by pirates), a pirate hunt's
  // catch, a fleet home.
  | { kind: 'launched'; ship: Ship; count: number }
  // A caravan back from a crown with the pay for its order (CLAUDE.md §7.8).
  | { kind: 'orderPaid'; crown: number; good: Good; units: number; gold: number }
  | { kind: 'voyage'; fleet: number; good: Good; sold: number; gold: number; city: number; blocked?: boolean; full?: boolean; pirates?: { won: boolean; sunk?: Ship; bounty?: number; lost?: number } }
  | { kind: 'hunt'; fleet: number; bounty: number; sunk?: Ship }
  | { kind: 'fleetHome'; fleet: number; cargo?: Partial<Stock> }

// The merchant's trip to the lobby's market: the base trip, and longer the farther the trade post lies from the
// palace he sets out from (beyond a short walk that the base covers). Straight-line tiles between the two.
export function lobbyTripMs(buildings: readonly Pick<Building, 'kind' | 'x' | 'y' | 'size'>[]) {
  const { tripSeconds, walkFreeTiles, walkSecondsPerTile } = balance.economy.trade
  const palace = buildings.find((b) => b.kind === 'palace')
  const post = buildings.find((b) => b.kind === 'tradePost')
  if (!palace || !post) return tripSeconds * 1000
  const tiles = Math.hypot(post.x + post.size / 2 - (palace.x + palace.size / 2), post.y + post.size / 2 - (palace.y + palace.size / 2))
  return Math.round((tripSeconds + Math.max(0, tiles - walkFreeTiles) * walkSecondsPerTile) * 1000)
}
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

// Walls and gates keep clear of every other building (and other buildings of them), so a tall wall never stands
// against a house or cuts through a yard on screen. A wall in front of a building (toward the bottom of the screen,
// past its far x or y edge) rises over the ground between, so it keeps further off there than behind.
const wallish = (kind: BuildingKind) => kind === 'wall' || kind === 'gate'

function tooClose(building: Rect, wall: Rect) {
  const { behind, front } = balance.economy.wallClearance
  return (
    wall.x < building.x + building.size + front &&
    building.x - behind < wall.x + wall.size &&
    wall.y < building.y + building.size + front &&
    building.y - behind < wall.y + wall.size
  )
}

// Roads lie flat on the ground: they only take their own tile, and keep no clearance from walls (nor walls from them).
const clash = (b: Building, spot: Rect, gap: number, kind?: BuildingKind) => {
  if (!kind || kind === 'road' || b.kind === 'road' || wallish(kind) === wallish(b.kind)) return overlaps(b, spot, gap)
  return wallish(kind) ? tooClose(b, spot) : tooClose(spot, b)
}

// A dock plot granted outside the territory brings a little ground around it (balance.territory.dockAnnexTiles on
// every side) where shore buildings may stand too, so a kingdom with no shore of its own can still have its fisher.
export function dockAnnex(kingdom: Pick<Kingdom, 'site'> & { dockPlot?: Rect | null }, stage: number): Rect | null {
  const plot = kingdom.dockPlot
  if (!plot || within(plot, territoryRect(kingdom.site, stage))) return null
  const m = balance.territory.dockAnnexTiles
  return { x: plot.x - m, y: plot.y - m, size: plot.size + 2 * m }
}

const within = (spot: Rect, area: Rect) =>
  spot.x >= area.x && spot.y >= area.y && spot.x + spot.size <= area.x + area.size && spot.y + spot.size <= area.y + area.size

// Inside the territory (shore buildings also beside a granted dock plot), on free land, clear of other buildings by
// `gap` tiles (one tile between a wall or gate and anything else when `kind` is given).
export function canPlace(world: World, kingdom: Pick<Kingdom, 'site' | 'buildings'> & { dockPlot?: Rect | null }, stage: number, spot: Rect, gap = 0, kind?: BuildingKind) {
  const annex = kind && (BUILDINGS[kind].shoreOnly || BUILDINGS[kind].coastal) ? dockAnnex(kingdom, stage) : null
  if (!within(spot, territoryRect(kingdom.site, stage)) && !(annex && within(spot, annex))) return false
  const coastal = !!kind && !!BUILDINGS[kind].coastal
  // Walls (and gates) may stand on the shore as well, so a wall line runs right up to the water and leaves no gap to
  // slip round its end (CLAUDE.md §5.1.1); they keep off the dock plot while the dock is unbuilt, which must still fit.
  const walled = !!kind && wallish(kind)
  if (walled && kingdom.dockPlot && !kingdom.buildings.some((b) => b.kind === 'dock') && tooClose(kingdom.dockPlot, spot)) return false
  let shore = false
  for (let y = spot.y; y < spot.y + spot.size; y++) {
    // Shore buildings stand on shore tiles, coastal ones on land with a foot on the shore, walls on either, everything
    // else on free land.
    for (let x = spot.x; x < spot.x + spot.size; x++) {
      const rule = tileRule(world, x, y)
      if (walled) {
        if (rule !== TileRule.Free && rule !== TileRule.DockOnly) return false
      } else if (coastal) {
        if (rule === TileRule.DockOnly) shore = true
        else if (rule !== TileRule.Free) return false
      } else if (rule !== (kind && BUILDINGS[kind].shoreOnly ? TileRule.DockOnly : TileRule.Free)) return false
    }
  }
  if (coastal && !shore) return false
  return !kingdom.buildings.some((b) => clash(b, spot, gap, kind))
}

// ---- Gates --------------------------------------------------------------------------------------------------------

// A gate is three tiles in a row: the gate itself between two wall towers. It runs along the wall it is set into
// (the walls beside the chosen tile), and may be built over standing wall, which it replaces.
export type Along = 'x' | 'y'

// The way a gate at `spot` runs: as the player turned it, else along the wall around it (the side with more wall
// within two tiles), else along x.
export function gateAlong(kingdom: Pick<Kingdom, 'buildings'>, spot: Point, turned?: Along | null): Along {
  if (turned === 'x' || turned === 'y') return turned
  const wallAt = (x: number, y: number) => kingdom.buildings.some((b) => (b.kind === 'wall' || b.kind === 'gate') && b.x === x && b.y === y)
  const count = (dx: number, dy: number) => [1, 2, -1, -2].filter((d) => wallAt(spot.x + dx * d, spot.y + dy * d)).length
  return count(0, 1) > count(1, 0) ? 'y' : 'x'
}

export const gateTiles = (spot: Point, along: Along): Point[] =>
  along === 'x'
    ? [{ x: spot.x - 1, y: spot.y }, spot, { x: spot.x + 1, y: spot.y }]
    : [{ x: spot.x, y: spot.y - 1 }, spot, { x: spot.x, y: spot.y + 1 }]

const onTiles = (b: Building, tiles: Point[]) => b.size === 1 && tiles.some((t) => t.x === b.x && t.y === b.y)

export function canPlaceGate(world: World, kingdom: Pick<Kingdom, 'site' | 'buildings'> & { dockPlot?: Rect | null }, stage: number, spot: Point, turned?: Along | null) {
  const tiles = gateTiles(spot, gateAlong(kingdom, spot, turned))
  const rest = { ...kingdom, buildings: kingdom.buildings.filter((b) => !(b.kind === 'wall' && onTiles(b, tiles))) }
  return tiles.every((t) => canPlace(world, rest, stage, { ...t, size: 1 }, 0, 'wall'))
}

// Whether a building of `kind` fits at `spot` (gates by their three tiles).
export const fits = (world: World, kingdom: Pick<Kingdom, 'site' | 'buildings'> & { dockPlot?: Rect | null }, stage: number, kind: BuildingKind, spot: Point, turned?: Along | null) =>
  kind === 'gate' ? canPlaceGate(world, kingdom, stage, spot, turned) : canPlace(world, kingdom, stage, { ...spot, size: BUILDINGS[kind].size }, 0, kind)

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

// How many of each weapon the armory holds: a palace-level amount and more for every warehouse level (CLAUDE.md §6.4).
export function armoryCap(kingdom: Kingdom, at: number) {
  const a = balance.economy.armory
  const base = a.baseByPalaceLevel[Math.max(0, Math.min(a.baseByPalaceLevel.length - 1, palaceLevel(kingdom, at) - 1))]
  let extra = 0
  for (const b of kingdom.buildings) {
    if (b.kind !== 'warehouse') continue
    const level = b.doneAt <= at || b.moving ? (b.level ?? 1) : (b.level ?? 1) - 1
    extra += Math.max(0, level) * a.perWarehouseLevel
  }
  return base + extra
}

const isWeapon = (v: string): v is Weapon => (WEAPONS as readonly string[]).includes(v)

// What a producer is set to make now (its product, or a product still to be learnt falling back to the first).
export function productMakes(kingdom: Kingdom, b: Building, at: number): Good | Weapon | null {
  const spec = levelSpec(b.kind, b.level)
  if (!spec.amount) return null
  let choice = productOf(b)
  if (choice && spec.products![choice].research && !hasResearch(kingdom, spec.products![choice].research!, at)) choice = Object.keys(spec.products!)[0]
  return choice ? spec.products![choice].makes : (spec.produces ?? null)
}

// Producers whose work goes nowhere (CLAUDE.md §6.4, "üretim ağı tıkandı"): a forge set to a weapon the armory has
// no room for stands idle; a building whose good's store is full makes what is thrown away. Only finished, staffed
// buildings the workers can reach.
export interface Clog {
  id: number
  kind: BuildingKind
  makes: Good | Weapon
  reason: 'armory' | 'store'
}
export function clogsOf(kingdom: Kingdom, at: number): Clog[] {
  const out: Clog[] = []
  const cut = cutOff(kingdom.buildings, kingdom.site, at)
  const room = storageCap(kingdom, at)
  const arms = armoryCap(kingdom, at)
  const armory = armoryOf(kingdom)
  for (const b of kingdom.buildings) {
    if (!done(b, at) || cut.has(b.id) || (workerSlots(b) > 0 && staffOf(b) === 0)) continue
    const makes = productMakes(kingdom, b, at)
    if (!makes) continue
    if (isWeapon(makes) && armory[makes] >= arms) out.push({ id: b.id, kind: b.kind, makes, reason: 'armory' })
    else if (isGood(makes) && kingdom.stock[makes] >= room - 0.5) out.push({ id: b.id, kind: b.kind, makes, reason: 'store' })
  }
  return out
}

// How much of each good the stores hold (CLAUDE.md §6.1): a little more with each palace level, and as much again as
// the warehouses give; whatever is made beyond it is lost. Gold is not capped.
const stores: SpanCache<{ goods: number; gold: number }> = new WeakMap()
// The stores' and the treasury's room from the palace level and the finished buildings (see perSpan).
const storesOf = (kingdom: Kingdom, at: number) =>
  perSpan(stores, kingdom.buildings, at, () => {
    const level = palaceLevel(kingdom, at)
    const { baseByPalaceLevel: base, goldByPalaceLevel: gold } = balance.economy.storage
    const room = { goods: base[Math.max(0, Math.min(base.length - 1, level - 1))], gold: gold[Math.max(0, Math.min(gold.length - 1, level - 1))] }
    for (const b of kingdom.buildings) {
      // A store being raised keeps the room of the level below until the work is done, and one being moved keeps all
      // of it: nothing is lost to the builders (a new one holds nothing yet).
      const level = b.doneAt <= at || b.moving ? (b.level ?? 1) : (b.level ?? 1) - 1
      if (level < 1) continue
      const spec = levelSpec(b.kind, level)
      room.goods += spec.storage ?? 0
      room.gold += spec.gold ?? 0
    }
    return room
  })

export function storageCap(kingdom: Kingdom, at: number) {
  return Math.round(storesOf(kingdom, at).goods * (1 + researchEffects(kingdom, at).storage))
}

// How much gold the treasury holds: a palace-level amount and what treasuries add. Gold beyond it is lost.
export const goldCap = (kingdom: Kingdom, at: number) => storesOf(kingdom, at).gold

// The palace's finished level (0 without a palace); a palace being raised counts at the level below.
export function palaceLevel(kingdom: Kingdom, at: number) {
  const palace = kingdom.buildings.find((b) => b.kind === 'palace')
  if (!palace) return 0
  return Math.max(1, (palace.level ?? 1) - (palace.doneAt > at ? 1 : 0))
}

// Everyone in arms or training for it.
export const soldiersOf = (kingdom: Kingdom) =>
  (kingdom.soldiers ?? 0) + (kingdom.fielded ?? 0) + (kingdom.training ?? []).reduce((n, t) => n + t.count, 0) + escortAway(kingdom)

// What the finished buildings give the people: homes, places of work and the palace's cap (see perSpan).
const housed: SpanCache<{ housing: number; jobs: number; cap: number }> = new WeakMap()

// Homes hold villagers up to the palace's population cap; soldiers come out of that number.
export function population(kingdom: Kingdom, at: number) {
  const { housing, jobs, cap } = perSpan(housed, kingdom.buildings, at, () => {
    let housing = 0
    let jobs = 0
    for (const b of kingdom.buildings) {
      // Homes being raised keep their folk at the level below (and ones being moved all of them); they work nowhere
      // until the builders are done.
      const level = done(b, at) || b.moving ? (b.level ?? 1) : (b.level ?? 1) - 1
      if (level >= 1) housing += levelSpec(b.kind, level).villagers ?? 0
      if (!done(b, at)) continue
      jobs += staffOf(b)
    }
    return { housing, jobs, cap: popCapFor(palaceLevel(kingdom, at)) }
  })
  const soldiers = soldiersOf(kingdom)
  // The ships' crews are not villagers either (CLAUDE.md §8.5).
  const sailors = sailorsOf(kingdom)
  // Towns that send people add both the room and the folk to fill it.
  const sent = townYield(kingdom.towns, at).villagers
  // The room for villagers, and the people living in it: they grow into new room round by round, and leave at once
  // when the room shrinks (a home torn down, soldiers raised; CLAUDE.md §5.2).
  const room = Math.max(0, Math.min(housing + sent, cap + sent) - soldiers - sailors)
  const people = Math.min(room, Math.max(0, kingdom.people ?? room))
  const villagers = Math.floor(people + 1e-9)
  // The sick neither work nor pay taxes, nor do those away on an expedition (CLAUDE.md §9.9).
  const away = Math.min(villagers, villagersAway(kingdom, at))
  const healthy = (villagers - away) * (1 - (kingdom.sickness ?? 0))
  // When more hands are set to work than there are healthy villagers, every building works at a matching fraction.
  return { villagers, people, room, healthy, away, sick: (villagers - away) - healthy, housing: housing + sent, cap: cap + sent, soldiers, sailors, jobs, efficiency: jobs === 0 ? 1 : Math.min(1, healthy / jobs) }
}

// ---- Growth of the people (CLAUDE.md §5.2) --------------------------------------------------------------------------

// The villagers the palace houses at its finished level (its servants).
export function palaceServants(kingdom: Kingdom, at: number) {
  const level = palaceLevel(kingdom, at)
  return level > 0 ? (levelSpec('palace', level).villagers ?? 0) : 0
}

// Hands for the food producers first when the granary is empty (CLAUDE.md §5.2): the share of a full crew the food
// makers and the other buildings get. Otherwise everyone works at the same share.
function staffing(kingdom: Kingdom, at: number) {
  const p = population(kingdom, at)
  if (kingdom.stock.food > 0 || p.jobs === 0) return { food: p.efficiency, other: p.efficiency }
  let foodJobs = 0
  for (const b of kingdom.buildings) if (done(b, at) && makesFood(b)) foodJobs += staffOf(b)
  const food = foodJobs === 0 ? 1 : Math.min(1, p.healthy / foodJobs)
  const otherJobs = p.jobs - foodJobs
  const other = otherJobs <= 0 ? 1 : Math.min(1, Math.max(0, p.healthy - foodJobs) / otherJobs)
  return { food, other }
}
const makesFood = (b: Building) => {
  const spec = BUILDINGS[b.kind]
  if (!spec.amount && !spec.levels?.some((l) => l.amount)) return false
  const choice = productOf(b)
  return (choice ? spec.products![choice].makes : spec.produces) === 'food'
}

export type GrowthPart = 'happiness' | 'food' | 'siege' | 'war' | 'sickness' | 'queen' | 'temple'

// The share of the full growth a mood of `happiness` gives: below the curve's zero the people leave.
export function happinessGrowth(happiness: number) {
  const curve = balance.society.growth.happiness
  if (happiness <= curve[0].at) return curve[0].factor
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]
    const b = curve[i]
    if (happiness <= b.at) return a.factor + ((b.factor - a.factor) * (happiness - a.at)) / (b.at - a.at)
  }
  return curve[curve.length - 1].factor
}

// How the people grow in the round at `at`: the mood sets the pace (or drives them away), hunger and a siege drive
// them away, and war, sickness, a queen and a temple speed or slow what growth there is. Newcomers come at a steady
// trickle and faster the more room stands empty; those leaving go as a share of the people.
export function growthTerms(kingdom: Kingdom, at: number) {
  const g = balance.society.growth
  const { people, room } = population(kingdom, at)
  const gap = Math.max(0, room - people)
  const happy = happinessGrowth(happinessOf(kingdom))
  const starving = kingdom.stock.food <= 0
  const besieged = (kingdom.besiegedUntil ?? 0) > at
  const war = !!kingdom.atWar
  const sick = kingdom.sickness ?? 0
  const queen = !!kingdom.queen && !kingdom.queenHeldBy
  const temple = levelOf(kingdom, 'temple', at)
  // Each part: its multiplier on growth (or, for hunger and a siege, the floor it sets on the pace) and whether it holds.
  const parts: { part: GrowthPart; value: number; active: boolean }[] = [
    { part: 'happiness', value: happy, active: true },
    { part: 'food', value: g.starving, active: starving },
    { part: 'siege', value: g.besieged, active: besieged },
    { part: 'war', value: g.war, active: war },
    { part: 'sickness', value: Math.max(0, 1 - sick * g.sicknessWeight), active: sick > 0.001 },
    { part: 'queen', value: 1 + g.queen, active: queen },
    { part: 'temple', value: 1 + temple * g.templePerLevel, active: temple > 0 },
  ]
  let factor = happy
  if (starving) factor = Math.min(factor, g.starving)
  if (besieged) factor = Math.min(factor, g.besieged)
  if (factor > 0) for (const p of parts) if (p.active && ['war', 'sickness', 'queen', 'temple'].includes(p.part)) factor *= p.value
  let perRound = factor > 0 ? Math.min(gap, factor * (g.inflowPerRound + g.gapSharePerRound * gap)) : factor * g.leaveSharePerRound * people
  // The palace's own servants never leave, and come back even to a hungry court: no lordship empties for good.
  const floor = g.palaceFloor ? Math.min(room, palaceServants(kingdom, at)) : 0
  if (people < floor) perRound = Math.max(perRound, Math.min(floor - people, g.inflowPerRound))
  else if (perRound < 0) perRound = Math.max(perRound, floor - people)
  return { people, room, gap, factor, perRound, parts, floor }
}

// How long until the room is full at today's pace (null when the people are not growing).
export function timeToFill(kingdom: Kingdom, at: number) {
  const g = balance.society.growth
  const { people, room, factor } = growthTerms(kingdom, at)
  if (room - people < 0.5) return 0
  if (factor <= 0) return null
  let p = people
  let rounds = 0
  while (room - p >= 0.5 && rounds < 20_000) {
    p += Math.min(room - p, factor * (g.inflowPerRound + g.gapSharePerRound * (room - p)))
    rounds++
  }
  return rounds * productionMs()
}

// The people after some of them were raised as soldiers or crews (negative `n`: sent home again).
export const withPeople = (kingdom: Kingdom, at: number, n: number): Kingdom => ({ ...kingdom, people: Math.max(0, population(kingdom, at).people + n) })

export const happinessOf = (kingdom: Kingdom) => kingdom.happiness ?? balance.society.happiness.start

// Lands without their ruler give less (CLAUDE.md §6.4): after a grace period, every hour since the player was last
// seen takes a share off what buildings make, the taxes and the merchant's gold, down to a floor.
// The lord counts as away a little while after last being seen (the open game reports every few minutes).
// When the lord counts as last seen after a command at `now` (CLAUDE.md §6.4): a real command marks the ruler present;
// the open game's periodic "still here" ('seen') only keeps that up for a while after the last real one, so a tab left
// open (or a script pinging) does not keep an absent lord's lands at full work.
export function presenceAt(kingdom: Pick<Kingdom, 'lastSeenAt' | 'lastActedAt'>, now: number, real: boolean) {
  if (real) return { lastSeenAt: now, lastActedAt: now }
  const acted = kingdom.lastActedAt ?? kingdom.lastSeenAt ?? now
  return { lastSeenAt: Math.max(kingdom.lastSeenAt ?? 0, Math.min(now, acted + balance.economy.away.seenGraceMinutes * 60_000)), lastActedAt: acted }
}

export const isAway = (kingdom: Kingdom, at: number) => at - (kingdom.lastSeenAt ?? at) > balance.economy.away.afterMinutes * 60_000

// How much of what is made goes into a store while the lord is away: all of it up to the knee, then less and less,
// none at the top (shares of the store's room).
export function awayStoreFactor(stock: number, room: number) {
  const { storesKnee, storesTop } = balance.economy.away
  const knee = room * storesKnee
  const top = room * storesTop
  return Math.max(0, Math.min(1, (top - stock) / (top - knee)))
}

export function idleFactor(kingdom: Kingdom, at: number) {
  const i = balance.economy.idle
  const hours = (at - (kingdom.lastSeenAt ?? at)) / 3_600_000 - i.graceHours
  return hours <= 0 ? 1 : Math.max(i.min, 1 - hours * i.perHour)
}

// The season of the year at `at` (CLAUDE.md §2), or null before the server has told the realm when its season began.
export function seasonOf(kingdom: Pick<Kingdom, 'seasonStart'>, at: number): Season | null {
  return kingdom.seasonStart === undefined ? null : calendarAt(at, kingdom.seasonStart).season
}

// What the season does to the harvest of the fields and docks, and to the spread of sickness (1 out of season).
export function seasonFactor(kingdom: Pick<Kingdom, 'seasonStart'>, at: number, effect: 'food' | 'sickness') {
  const season = seasonOf(kingdom, at)
  return season ? seasonEffect(effect, season) : 1
}

// The share of a full day's work the people put in at `at`: a fifth at night unless on a night shift, less when
// tired from night shifts, half during an incited revolt.
export function workRate(kingdom: Kingdom, at: number) {
  const n = balance.society.night
  const night = isNightAt(at) && !kingdom.nightShift ? n.workRate : 1
  const revolt = (kingdom.revoltUntil ?? 0) > at ? balance.espionage.operations.revolt.workRate : 1
  const fortune = 1 + fortuneEffects(kingdom, at).work
  // A ruler with a way with the people gets more out of them (CLAUDE.md §9.1).
  const ruler = 1 + dynastyEffects(kingdom).work
  return night * (1 - (kingdom.fatigue ?? 0)) * revolt * fortune * ruler
}

// The most people that would take up arms: a share of the population that grows with its happiness.
export function manpowerCap(kingdom: Kingdom, at: number) {
  const { villagers, soldiers, sailors } = population(kingdom, at)
  return Math.max(0, Math.floor((villagers + soldiers + sailors) * recruitTerms(happinessOf(kingdom)).share) - soldiers - sailors)
}

// How many more villagers would become soldiers of a kind now (the manpower pool, the villagers there are), and what
// each one asks: mood makes the gold dearer, and some kinds take weapons from the armory.
export function recruitment(kingdom: Kingdom, at: number, unit: Unit = 'spear') {
  const { villagers } = population(kingdom, at)
  const { costMultiplier } = recruitTerms(happinessOf(kingdom))
  const cap = manpowerCap(kingdom, at)
  const pool = Math.min(cap, Math.floor(kingdom.manpower ?? cap))
  const spec = unitSpec(unit)
  const cost = { ...spec.cost, gold: Math.round((spec.cost.gold ?? 0) * costMultiplier) } as Cost
  return { willing: Math.max(0, Math.min(villagers, pool)), cap, pool, cost, weapons: spec.weapons ?? {} }
}

// The gold side of a round apart from the buildings: taxes, soldiers' pay and tributes (for the ledger as well).
export function ledger(kingdom: Kingdom, at: number) {
  const { healthy } = population(kingdom, at)
  const upkeep = balance.military.warrior.upkeep
  // The ruler's gifts: a head for finance raises the taxes, a soldier's eye keeps the pay down (CLAUDE.md §9.1).
  const ruler = dynastyEffects(kingdom)
  const paid = ((kingdom.soldiers ?? 0) + (kingdom.fielded ?? 0) + escortAway(kingdom)) * (1 - researchEffects(kingdom, at).upkeep) * ruler.upkeep
  return {
    tax: healthy * taxSpec(kingdom.tax).goldPerVillager * (1 + researchEffects(kingdom, at).tax) * ruler.tax * idleFactor(kingdom, at),
    soldiersGold: paid * upkeep.gold,
    soldiersFood: paid * upkeep.food,
    tributes: (kingdom.tributes ?? []).map((t) => ({ ...t, gold: t.dir === 'in' ? t.gold : -t.gold })),
  }
}

const isGood = (v: string): v is Good => (GOODS as readonly string[]).includes(v)

// What holds for every building of a kingdom in a round at `at`; worked out once per round, not once per building.
export function roundContext(kingdom: Kingdom, at: number) {
  return {
    cut: cutOff(kingdom.buildings, kingdom.site, at),
    output: fortuneEffects(kingdom, at).output,
    learnt: researchEffects(kingdom, at).output,
    // The season's harvest (CLAUDE.md §2).
    season: seasonFactor(kingdom, at, 'food'),
    // The share of the work done: hands to spare (the food makers first when the granary is empty), the hour of the
    // day, the ruler's absence.
    ...(() => {
      const s = staffing(kingdom, at)
      const rate = workRate(kingdom, at)
      return { pace: s.other * rate, foodPace: s.food * rate }
    })(),
    // The ruler's absence slows everything but the food the people grow for themselves (an absent lord's people do
    // not starve for it).
    idle: idleFactor(kingdom, at),
  }
}

// What one building makes in a round, before raw goods run short: the product, how many units, and what they use.
export function buildingOutput(kingdom: Kingdom, b: Building, at: number, round?: ReturnType<typeof roundContext>) {
  const spec = levelSpec(b.kind, b.level)
  if (!done(b, at) || !spec.amount) return null
  const r = round ?? roundContext(kingdom, at)
  // Behind a wall with no gate the workers cannot get there; a blockaded dock lands no fish.
  if (r.cut.has(b.id)) return null
  if (b.kind === 'dock' && kingdom.blockade) return null
  const slots = workerSlots(b)
  const crew = slots === 0 ? 1 : staffOf(b) / slots
  let choice = productOf(b)
  // A product still to be learnt at the university falls back to the first one.
  if (choice && spec.products![choice].research && !hasResearch(kingdom, spec.products![choice].research!, at)) choice = Object.keys(spec.products!)[0]
  const product: Product = choice ? spec.products![choice] : { makes: spec.produces!, rate: 1 }
  // An armory with no room for the weapon: the forge stands idle and uses nothing.
  if (isWeapon(product.makes) && armoryOf(kingdom)[product.makes] >= armoryCap(kingdom, at)) return null
  // The land's yield and the fortunes of the day only touch raw goods; worked goods depend on the hands alone.
  const raw = isGood(product.makes) && !product.uses
  const land = raw ? kingdom.yields[product.makes as Good] : 1
  const fortune = raw ? Math.max(0, 1 + (r.output[product.makes as Good] ?? 0)) : 1
  const learnt = 1 + (r.learnt[b.kind] ?? 0)
  // Pirates roaming the water by the dock scare off some of the catch (CLAUDE.md §8.5).
  const pirates = b.kind === 'dock' ? outlawEffects(kingdom).fishFactor : 1
  return {
    makes: product.makes,
    units: spec.amount * product.rate * land * fortune * learnt * crew * pirates * (product.makes === 'food' ? r.foodPace * r.season : r.pace * r.idle),
    uses: product.uses,
  }
}

// One production round: what it adds to and takes from the stores, and the weapons it works. Worked goods only use
// what is in `stock`; a forge short of raw goods works as many units as they allow.
export function roundOutcome(kingdom: Kingdom, at: number, stock: Stock = kingdom.stock) {
  const { villagers } = population(kingdom, at)
  const delta: Partial<Stock> = {}
  const weapons: Partial<Armory> = {}
  // What the forges take from the stores to work it.
  const worked: Partial<Stock> = {}
  const left = { ...stock }
  const round = roundContext(kingdom, at)
  for (const b of kingdom.buildings) {
    const out = buildingOutput(kingdom, b, at, round)
    if (!out) continue
    let units = out.units
    for (const [r, per] of Object.entries(out.uses ?? {})) units = Math.min(units, left[r as Resource] / (per ?? 1))
    units = Math.max(0, units)
    for (const [r, per] of Object.entries(out.uses ?? {})) {
      left[r as Resource] -= units * (per ?? 0)
      delta[r as Resource] = (delta[r as Resource] ?? 0) - units * (per ?? 0)
      worked[r as Resource] = (worked[r as Resource] ?? 0) + units * (per ?? 0)
    }
    if (isGood(out.makes)) delta[out.makes] = (delta[out.makes] ?? 0) + units
    else weapons[out.makes] = (weapons[out.makes] ?? 0) + units
  }
  const l = ledger(kingdom, at)
  delta.food = (delta.food ?? 0) - villagers * balance.economy.foodPerVillager - l.soldiersFood
  // The ships: the crews' pay and bread, the fishing fleets' catch.
  const navy = navyUpkeep(kingdom)
  delta.food += fishCatch(kingdom) - navy.food
  delta.gold = (delta.gold ?? 0) - navy.gold
  // Gold some buildings bring in on their own (the fisher's river finds).
  for (const b of kingdom.buildings) {
    const per = BUILDINGS[b.kind].goldPerRound
    if (per && done(b, at) && !round.cut.has(b.id) && !(b.kind === 'fisherHut' && kingdom.blockade)) delta.gold = (delta.gold ?? 0) + per * idleFactor(kingdom, at)
  }
  // Tributes between lords are not in the round: the server moves what the payer really pays (CLAUDE.md §9.7).
  delta.gold = (delta.gold ?? 0) + l.tax - l.soldiersGold
  // What the held towns send, and the upkeep paid them while the treasury has it (CLAUDE.md §8.4).
  const sends = townYield(kingdom.towns, at)
  const idle = idleFactor(kingdom, at)
  for (const r of ['gold', 'food', 'materials', 'arms'] as const) if (sends[r]) delta[r] = (delta[r] ?? 0) + sends[r] * idle
  const towns = townUpkeep(kingdom.towns, stock.gold + (delta.gold ?? 0), at)
  if (towns.cost > 0) delta.gold = (delta.gold ?? 0) - towns.cost
  return { delta, weapons, worked, towns, navy }
}

// What one production round adds to (and eats from) the stores.
export const productionRound = (kingdom: Kingdom, at: number): Partial<Stock> => roundOutcome(kingdom, at).delta

// What the merchant can carry at the post's level, and what he takes on each trip: as much as the player set, up to that.
export type TradeLedger = Record<Good, number> & { gold: number }

export const tradeCapacity = (kingdom: Kingdom) => balance.economy.trade.levels[kingdom.trade.level].units
export const tradeUnits = (kingdom: Kingdom) => Math.min(tradeCapacity(kingdom), kingdom.trade.amount ?? tradeCapacity(kingdom))

// The amount may be changed in steps, once in a while (CLAUDE.md §6.4).
export const tradeAmountReadyAt = (kingdom: Kingdom) => (kingdom.trade.amountAt ?? -Infinity) + balance.economy.trade.amountCooldownSeconds * 1000
export function tradeAmountError(kingdom: Kingdom, units: number, now: number): 'step' | 'tradeWait' | null {
  const step = balance.economy.trade.amountStep
  if (!Number.isInteger(units) || units < step || units > tradeCapacity(kingdom) || units % step !== 0) return 'step'
  if (now < tradeAmountReadyAt(kingdom)) return 'tradeWait'
  return null
}
export function setTradeAmount(kingdom: Kingdom, units: number, now: number): Kingdom {
  if (tradeAmountError(kingdom, units, now) || units === tradeUnits(kingdom)) return kingdom
  // The whole load is kept as "as many as the level allows", so it grows with the post.
  const amount = units === tradeCapacity(kingdom) ? undefined : units
  return { ...kingdom, trade: { ...kingdom.trade, amount, amountAt: now } }
}

// What the merchant leaves in the stores: of food, what the people and the soldiers eat in a few minutes, so selling
// it never starves the lordship (CLAUDE.md §6.4).
export function tradeReserve(kingdom: Kingdom, good: Good, at: number) {
  if (good !== 'food') return 0
  const eaten = population(kingdom, at).villagers * balance.economy.foodPerVillager + ledger(kingdom, at).soldiersFood
  return Math.max(0, eaten * balance.economy.trade.foodReserveRounds)
}

export const hasTradePost = (kingdom: Kingdom) => kingdom.buildings.some((b) => b.kind === 'tradePost')

export const constructing = (kingdom: Kingdom, at: number) => kingdom.buildings.filter((b) => !done(b, at))

// The building sites that hold one of the construction slots.
export const queued = (kingdom: Kingdom, at: number) => constructing(kingdom, at).filter((b) => !BUILDINGS[b.kind].outsideQueue)

// How many buildings may go up at once (one more with architecture learnt).
export const maxConstructions = (kingdom: Kingdom, at: number) => balance.economy.maxConstructions + researchEffects(kingdom, at).queue

// ---- Commands -----------------------------------------------------------------------------------------------------

export const affordable = (stock: Stock, cost: Cost = {}) =>
  Object.entries(cost).every(([k, v]) => stock[k as Resource] >= (v ?? 0))

const pay = (stock: Stock, cost: Cost = {}): Stock => {
  const next = { ...stock }
  for (const [k, v] of Object.entries(cost)) next[k as Resource] -= v ?? 0
  return next
}

// The first lumber camp, house and field cost nothing, so a kingdom that has spent all its goods can always start
// over (balance.economy.freeFirst). Only once each: demolishing the free one does not make the next one free.
export const isFree = (kingdom: Kingdom, kind: BuildingKind) =>
  (balance.economy.freeFirst as string[]).includes(kind) && !(kingdom.freeUsed ?? []).includes(kind) && !kingdom.buildings.some((b) => b.kind === kind)

export const buildCost = (kingdom: Kingdom, kind: BuildingKind): Cost => (isFree(kingdom, kind) ? {} : (BUILDINGS[kind].cost ?? {}))

// What demolishing gives back: half of what was spent on building and raising it (nothing of a free first one's
// building cost). The palace and the trade post stay.
export function demolishRefund(b: Building): Cost {
  const spec = BUILDINGS[b.kind]
  const spent: Cost = {}
  const add = (cost: Cost = {}) => {
    for (const [r, v] of Object.entries(cost)) spent[r as Resource] = (spent[r as Resource] ?? 0) + (v ?? 0)
  }
  if (!b.free) add(spec.cost)
  for (const up of (spec.levels ?? []).slice(0, (b.level ?? 1) - 1)) add(up.cost)
  return Object.fromEntries(Object.entries(spent).map(([r, v]) => [r, Math.floor((v ?? 0) * balance.economy.demolishRefund)]).filter(([, v]) => (v as number) > 0))
}

// ---- Moving -------------------------------------------------------------------------------------------------------

// Everything but the palace, the trade post and the dock (each on its own spot), walls, gates and roads may be moved. The
// building keeps its level, hands and product; it stands as a building site (making nothing) until it is up again.
// Moving costs a share of all that was spent on it, a little less than tearing it down and building it again
// (balance.economy.move), and takes longer than building it to its level anew.
const FIXED: BuildingKind[] = ['palace', 'tradePost', 'dock', 'wall', 'gate', 'shipyard', 'road']
export const movable = (b: Building) => !FIXED.includes(b.kind)

export function moveCost(b: Building): Cost {
  const spec = BUILDINGS[b.kind]
  const spent: Cost = {}
  for (const cost of [spec.cost, ...(spec.levels ?? []).slice(0, (b.level ?? 1) - 1).map((up) => up.cost)]) {
    for (const [r, v] of Object.entries(cost ?? {})) spent[r as Resource] = (spent[r as Resource] ?? 0) + (v ?? 0)
  }
  return Object.fromEntries(Object.entries(spent).map(([r, v]) => [r, Math.ceil((v ?? 0) * balance.economy.move.costShare)]).filter(([, v]) => (v as number) > 0))
}

export function moveSeconds(b: Building) {
  const spec = BUILDINGS[b.kind]
  const rebuild = (spec.buildSeconds ?? 0) + (spec.levels ?? []).slice(0, (b.level ?? 1) - 1).reduce((n, up) => n + (up.buildSeconds ?? 0), 0)
  return Math.ceil(rebuild * balance.economy.move.timeFactor)
}

// Why building `id` cannot be moved to `spot` now, if it cannot.
export function moveError(world: World, kingdom: Kingdom, stage: number, id: number, spot: Point, now: number): BuildError | null {
  const b = kingdom.buildings.find((x) => x.id === id)
  if (!b || !movable(b)) return 'unique'
  if (!done(b, now)) return 'busy'
  if (!affordable(kingdom.stock, moveCost(b))) return 'cost'
  if (queued(kingdom, now).length >= maxConstructions(kingdom, now)) return 'queue'
  const rest = { site: kingdom.site, buildings: kingdom.buildings.filter((x) => x.id !== id) }
  if (!canPlace(world, rest, stage, { ...spot, size: b.size }, 0, b.kind)) return 'spot'
  return null
}

export function moveBuilding(world: World, kingdom: Kingdom, stage: number, id: number, spot: Point, now: number): Kingdom {
  if (moveError(world, kingdom, stage, id, spot, now)) return kingdom
  const b = kingdom.buildings.find((x) => x.id === id)!
  const moved: Building = { ...b, x: spot.x, y: spot.y, doneAt: now + moveSeconds(b) * 1000, moving: true }
  return { ...kingdom, stock: pay(kingdom.stock, moveCost(b)), buildings: kingdom.buildings.map((x) => (x.id === id ? moved : x)) }
}

export const canDemolish = (kingdom: Kingdom, id: number) => {
  const b = kingdom.buildings.find((x) => x.id === id)
  return !!b && b.kind !== 'palace' && b.kind !== 'tradePost'
}

export function demolish(kingdom: Kingdom, id: number): Kingdom {
  if (!canDemolish(kingdom, id)) return kingdom
  const b = kingdom.buildings.find((x) => x.id === id)!
  const stock = { ...kingdom.stock }
  for (const [r, v] of Object.entries(demolishRefund(b))) stock[r as Resource] += v ?? 0
  return { ...kingdom, stock, buildings: kingdom.buildings.filter((x) => x.id !== id) }
}

export type BuildError = 'palace' | 'unique' | 'cost' | 'queue' | 'spot' | 'top' | 'busy' | 'locked' | 'limit' | 'liege' | 'queen'

// The homes of every building at the level it is (or is being raised to): what the town will house once built.
export const plannedHousing = (kingdom: Kingdom) => kingdom.buildings.reduce((n, b) => n + (levelSpec(b.kind, b.level).villagers ?? 0), 0)

// Homes beyond the palace's population cap would stand empty, so none is built (nor raised) when the homes it adds
// would take the planned homes past the cap; raising the palace makes room.
export const housingRoom = (kingdom: Kingdom, at: number) => popCapFor(palaceLevel(kingdom, at)) - plannedHousing(kingdom)
export const housingFull = (kingdom: Kingdom, at: number, adding = 1) => adding > 0 && housingRoom(kingdom, at) < adding

// How many of a kind may stand now, or Infinity without a limit.
export function buildLimit(kingdom: Kingdom, kind: BuildingKind, at: number) {
  const homes = BUILDINGS[kind].villagers ?? 0
  if (homes > 0 && kind !== 'palace' && housingFull(kingdom, at, homes)) return buildingCount(kingdom, kind)
  const caps = BUILDINGS[kind].maxByPalaceLevel
  if (!caps) return Infinity
  return caps[Math.max(0, Math.min(caps.length - 1, palaceLevel(kingdom, at) - 1))]
}
export const buildingCount = (kingdom: Kingdom, kind: BuildingKind) => kingdom.buildings.filter((b) => b.kind === kind).length

// The most of a kind the kingdom may have at its palace level, for showing: 1 for the one-only kinds, the palace
// level's cap for the capped ones (fields, camps, forges, towers, gates), null where only room limits it (houses
// follow the population cap, see housingFull).
export function capOf(kingdom: Kingdom, kind: BuildingKind, at: number): number | null {
  const spec = BUILDINGS[kind]
  if (kind === 'palace' || kind === 'tradePost' || kind === 'dock' || spec.unique) return 1
  const caps = spec.maxByPalaceLevel
  return caps ? caps[Math.max(0, Math.min(caps.length - 1, palaceLevel(kingdom, at) - 1))] : null
}

export function buildError(world: World, kingdom: Kingdom, stage: number, kind: BuildingKind, spot: Point | null, now: number, turned?: Along | null): BuildError | null {
  const spec = BUILDINGS[kind]
  // One palace, placed first; it stands at once and takes no construction slot.
  if ((kind === 'palace') === hasPalace(kingdom)) return 'palace'
  if (kind === 'dock' && (!kingdom.dockPlot || kingdom.buildings.some((b) => b.kind === 'dock'))) return 'unique'
  if ((spec.requiresPalace ?? 0) > palaceLevel(kingdom, now)) return 'locked'
  if (buildingCount(kingdom, kind) >= buildLimit(kingdom, kind, now)) return 'limit'
  if (spec.unique && kingdom.buildings.some((b) => b.kind === kind)) return 'unique'
  if (!affordable(kingdom.stock, buildCost(kingdom, kind))) return 'cost'
  if (kind !== 'palace' && !spec.outsideQueue && queued(kingdom, now).length >= maxConstructions(kingdom, now)) return 'queue'
  // The dock goes on its plot, which may lie outside the territory; everything else where the player puts it.
  if (spot && kind !== 'dock' && !fits(world, kingdom, stage, kind, spot, turned)) return 'spot'
  return null
}

export function build(world: World, kingdom: Kingdom, stage: number, kind: BuildingKind, spot: Point, now: number, turned?: Along | null): Kingdom {
  if (buildError(world, kingdom, stage, kind, spot, now, turned)) return kingdom
  const spec = BUILDINGS[kind]
  if (kind === 'dock') spot = kingdom.dockPlot!
  const free = isFree(kingdom, kind)
  const doneAt = now + (spec.buildSeconds ?? 0) * 1000
  if (kind === 'gate') {
    // The gate and its two towers, in place of any wall on those tiles.
    const along = gateAlong(kingdom, spot, turned)
    const tiles = gateTiles(spot, along)
    const kept = kingdom.buildings.filter((b) => !(b.kind === 'wall' && onTiles(b, tiles)))
    const id = kingdom.nextId
    return {
      ...kingdom,
      stock: pay(kingdom.stock, buildCost(kingdom, kind)),
      buildings: [
        ...kept,
        { id, kind: 'gate', x: spot.x, y: spot.y, size: 1, doneAt, along },
        { id: id + 1, kind: 'wall', ...tiles[0], size: 1, doneAt, tower: true, free: true },
        { id: id + 2, kind: 'wall', ...tiles[2], size: 1, doneAt, tower: true, free: true },
      ],
      nextId: id + 3,
    }
  }
  const building: Building = { id: kingdom.nextId, kind, x: spot.x, y: spot.y, size: spec.size, doneAt, ...(free && { free }) }
  return {
    ...kingdom,
    // The palace comes with its servants; everyone after them grows into the homes built (CLAUDE.md §5.2).
    ...(kind === 'palace' && kingdom.people === undefined && { people: spec.villagers ?? 0 }),
    stock: pay(kingdom.stock, buildCost(kingdom, kind)),
    buildings: [...kingdom.buildings, building],
    nextId: kingdom.nextId + 1,
    ...(free && { freeUsed: [...(kingdom.freeUsed ?? []), kind] }),
  }
}

// A row of buildings laid by dragging (walls, houses, roads): each one that fits and can be paid for is placed. They wait
// their turn for a construction slot, so a long row of houses goes up one pair at a time; walls need no slot.
export const STROKE_KINDS: BuildingKind[] = ['wall', 'house', 'road']

export function buildMany(world: World, kingdom: Kingdom, stage: number, kind: BuildingKind, spots: Point[], now: number) {
  const spec = BUILDINGS[kind]
  let k = kingdom
  let placed = 0
  if (!STROKE_KINDS.includes(kind) || !hasPalace(kingdom)) return { kingdom: k, placed }
  if ((spec.requiresPalace ?? 0) > palaceLevel(kingdom, now)) return { kingdom: k, placed }
  for (const spot of spots.slice(0, balance.economy.maxBatch)) {
    if (!affordable(k.stock, buildCost(k, kind)) || buildingCount(k, kind) >= buildLimit(k, kind, now)) break
    if (!canPlace(world, k, stage, { ...spot, size: spec.size }, 0, kind)) continue
    const free = isFree(k, kind)
    const start = spec.outsideQueue ? now : slotFreeAt(k, now)
    const building: Building = { id: k.nextId, kind, x: spot.x, y: spot.y, size: spec.size, doneAt: start + (spec.buildSeconds ?? 0) * 1000, ...(free && { free }) }
    k = {
      ...k,
      stock: pay(k.stock, buildCost(k, kind)),
      buildings: [...k.buildings, building],
      nextId: k.nextId + 1,
      ...(free && { freeUsed: [...(k.freeUsed ?? []), kind] }),
    }
    placed++
  }
  return { kingdom: k, placed }
}

// The moment a construction slot frees up: once fewer than the slot count are still being built.
export function slotFreeAt(kingdom: Kingdom, now: number) {
  const ends = queued(kingdom, now).map((b) => b.doneAt).sort((a, b) => b - a)
  const slots = maxConstructions(kingdom, now)
  return ends.length >= slots ? Math.max(now, ends[slots - 1]) : now
}

// Builds, moves and demolitions laid out together on the map and sent at once (CLAUDE.md §6.4). Demolitions go
// first, so their ground and refunds are there for the rest, then moves, then builds. A move or build with no free
// construction slot waits for one, as a dragged row does; steps that cannot be done are skipped.
export type PlanStep =
  | { type: 'build'; kind: BuildingKind; x: number; y: number; along?: Along }
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'demolish'; id: number }

export function applyPlan(world: World, kingdom: Kingdom, stage: number, steps: PlanStep[], now: number) {
  let k = kingdom
  let done = 0
  const step = (next: Kingdom) => {
    if (next !== k) done++
    k = next
  }
  for (const s of steps) if (s.type === 'demolish') step(demolish(k, s.id))
  for (const s of steps) {
    if (s.type !== 'move') continue
    const error = moveError(world, k, stage, s.id, s, now)
    if (!error || error === 'queue') step(moveBuilding(world, k, stage, s.id, s, error ? slotFreeAt(k, now) : now))
  }
  for (const s of steps) {
    if (s.type !== 'build' || s.kind === 'palace') continue
    const error = buildError(world, k, stage, s.kind, s, now, s.along)
    if (!error || error === 'queue') step(build(world, k, stage, s.kind, { x: s.x, y: s.y }, error ? slotFreeAt(k, now) : now, s.along))
  }
  return { kingdom: k, done, skipped: steps.length - done }
}

// Why a building cannot be raised a level now, if it cannot.
export function upgradeError(kingdom: Kingdom, id: number, now: number): BuildError | null {
  const b = kingdom.buildings.find((x) => x.id === id)
  const up = b && upgradeSpec(b)
  if (!b || !up) return 'top'
  if (!done(b, now)) return 'busy'
  // A lord swears fealty to a crown kingdom before the palace rises past its first level (CLAUDE.md §7.8).
  if (b.kind === 'palace' && (b.level ?? 1) + 1 >= balance.cities.crown.requiredForPalaceLevel && kingdom.liege === undefined) return 'liege'
  // A lady at court before the palace's third level: the house must have a future (CLAUDE.md §9.1).
  if (b.kind === 'palace' && (b.level ?? 1) + 1 >= balance.dynasty.queenForPalaceLevel && !kingdom.queen) return 'queen'
  if (b.kind !== 'palace' && housingFull(kingdom, now, (up.villagers ?? 0) - (levelSpec(b.kind, b.level).villagers ?? 0))) return 'limit'
  if (!affordable(kingdom.stock, up.cost)) return 'cost'
  if (queued(kingdom, now).length >= maxConstructions(kingdom, now)) return 'queue'
  return null
}

// Fealty to a crown kingdom (CLAUDE.md §7.8): to one of the `crowns` capitals, once for the season.
// Not offered before the lord has a few buildings standing (`early`; the crowns are introduced then).
export const fealtyError = (kingdom: Kingdom, index: number, crowns: number, now = Infinity): 'sworn' | 'rejected' | 'early' | null =>
  kingdom.liege !== undefined ? 'sworn' : !(Number.isInteger(index) && index >= 0 && index < crowns) ? 'rejected' : !fealtyOpen(kingdom, now) ? 'early' : null

// Sworn, the lord starts in its crown's good graces.
export const swearFealty = (kingdom: Kingdom, index: number, crowns: number, now = Infinity): Kingdom =>
  fealtyError(kingdom, index, crowns, now)
    ? kingdom
    : changeCrownRelation({ ...kingdom, liege: index, ...(Number.isFinite(now) && { liegeAt: now }) }, index, balance.cities.crown.relation.swear)

// An upgrade takes a construction slot; the building stands as a building site (and makes nothing) until it ends.
export function upgradeBuilding(kingdom: Kingdom, id: number, now: number): Kingdom {
  if (upgradeError(kingdom, id, now)) return kingdom
  const b = kingdom.buildings.find((x) => x.id === id)!
  const up = upgradeSpec(b)!
  const next: Building = { ...b, level: (b.level ?? 1) + 1, doneAt: now + (up.buildSeconds ?? 0) * 1000, moving: undefined }
  return { ...kingdom, stock: pay(kingdom.stock, up.cost), buildings: kingdom.buildings.map((x) => (x.id === id ? next : x)) }
}

const editBuilding = (kingdom: Kingdom, id: number, change: (b: Building) => Building): Kingdom => ({
  ...kingdom,
  buildings: kingdom.buildings.map((b) => (b.id === id ? change(b) : b)),
})

export const setWorkers = (kingdom: Kingdom, id: number, workers: number): Kingdom =>
  editBuilding(kingdom, id, (b) => ({ ...b, workers: Math.min(workerSlots(b), Math.max(0, Math.round(workers))) }))

// A product that waits for research can be chosen once it is learnt.
export const productAllowed = (kingdom: Kingdom, kind: BuildingKind, product: string, at: number) => {
  const p = BUILDINGS[kind].products?.[product]
  return !!p && (!p.research || hasResearch(kingdom, p.research, at))
}

export const setProduct = (kingdom: Kingdom, id: number, product: string, at = Infinity): Kingdom =>
  editBuilding(kingdom, id, (b) => (productAllowed(kingdom, b.kind, product, at) ? { ...b, product } : b))

// Choosing (or changing) the good sends the merchant off on a fresh trip; null keeps him home.
export function setTradeGood(kingdom: Kingdom, good: Good | null, now: number): Kingdom {
  if (!hasTradePost(kingdom) || (kingdom.trade.good === good && (good !== null || kingdom.trade.idle))) return kingdom
  return { ...kingdom, trade: { ...kingdom.trade, good, idle: good === null, departedAt: now } }
}

// ---- Free cities (CLAUDE.md §7.6) ----------------------------------------------------------------------------------

// What a free city pays for one unit: a little over the lobby's price of the moment (its own sales leave that price
// untouched).
export const cityPrice = (good: Good, market: Market | null | undefined, at: number) =>
  priceAt(market, good, at) * balance.cities.trade.priceFactor

// How long the merchant's trip takes: to the lobby's market from the trade post, or to a free city and back.
export const tradeTripMs = (kingdom: Kingdom) => kingdom.trade.city?.tripMs ?? lobbyTripMs(kingdom.buildings)

// What the merchant takes on one trip, and what a unit fetches before bonuses: a free city takes a bigger load at its
// price, a little over the lobby's.
export const tradeLoad = (kingdom: Kingdom) => tradeUnits(kingdom) * (kingdom.trade.city ? balance.cities.trade.loadFactor : 1)
// The crown watching over the good pays more to a lord it favours, less to one it does not (crowns.ts).
export const tradePrice = (kingdom: Kingdom, good: Good, market: Market | null | undefined, at: number) =>
  (kingdom.trade.city ? cityPrice(good, market, at) : priceAt(market, good, at)) * stewardFactor(kingdom, good, at)

// Trips the merchant makes in one production round.
export const tradeTripsPerRound = (kingdom: Kingdom) => (balance.economy.productionSeconds * 1000) / tradeTripMs(kingdom)

// The trip from the trade post to a free city and back, longer the farther the city is.
export function cityTripMs(kingdom: Kingdom, city: Point) {
  const post = kingdom.buildings.find((b) => b.kind === 'tradePost')
  if (!post) return null
  const m = cityCenter(city)
  const tiles = Math.hypot(post.x + post.size / 2 - m.x, post.y + post.size / 2 - m.y)
  const { baseSeconds, secondsPerTile } = balance.cities.trade
  return Math.round((baseSeconds + tiles * secondsPerTile) * 1000)
}

export const tradeCityReadyAt = (kingdom: Kingdom) => (kingdom.trade.cityAt ?? -Infinity) + balance.cities.trade.changeCooldownSeconds * 1000

// Sends the merchant to a free city (its index in world.cities), or back to the lobby's market with null. A changed
// destination starts a fresh trip.
export function setTradeCity(kingdom: Kingdom, cities: Point[], index: number | null, now: number): Kingdom {
  if (!hasTradePost(kingdom) || now < tradeCityReadyAt(kingdom) || (kingdom.trade.city?.index ?? null) === index) return kingdom
  if (index === null) {
    const { city: _, ...trade } = kingdom.trade
    return { ...kingdom, trade: { ...trade, cityAt: now, departedAt: now } }
  }
  const city = cities[index]
  const tripMs = city && cityTripMs(kingdom, city)
  if (!tripMs) return kingdom
  return { ...kingdom, trade: { ...kingdom.trade, city: { index, tripMs }, cityAt: now, departedAt: now } }
}

// A trade post wrecked by raiders stands again for this.
export const tradeRepairCost = () => balance.economy.trade.repairCost as Cost

export function repairTrade(kingdom: Kingdom): Kingdom {
  if (!kingdom.trade.damaged || !affordable(kingdom.stock, tradeRepairCost())) return kingdom
  return { ...kingdom, stock: pay(kingdom.stock, tradeRepairCost()), trade: { ...kingdom.trade, damaged: false } }
}

export const tradeUpgradeCost = (kingdom: Kingdom): Cost | null =>
  balance.economy.trade.levels[kingdom.trade.level + 1]?.cost ?? null

export function upgradeTrade(kingdom: Kingdom): Kingdom {
  const cost = tradeUpgradeCost(kingdom)
  if (!cost || !affordable(kingdom.stock, cost)) return kingdom
  const level = kingdom.trade.level + 1
  // A load set below the whole is kept; the whole load (no amount set) grows with the post.
  // The post's own level follows, so other kingdoms see it grow on the map.
  const buildings = kingdom.buildings.map((b) => (b.kind === 'tradePost' ? { ...b, level: level + 1 } : b))
  return { ...kingdom, stock: pay(kingdom.stock, cost), buildings, trade: { ...kingdom.trade, level } }
}

// ---- Time ---------------------------------------------------------------------------------------------------------

// The spy house's capacity at its level, 0 without one.
export function spyCapacity(kingdom: Kingdom, at: number) {
  const house = kingdom.buildings.find((b) => b.kind === 'spyHouse' && done(b, at))
  if (!house) return 0
  const caps = balance.espionage.capacityByLevel
  return caps[Math.min(caps.length - 1, (house.level ?? 1) - 1)]
}

// Settles everything due by `now`, in the order it happened. Returns the same object when nothing was due. The
// merchant sells at the lobby's price (`market`); `sold` says how much went, for the lobby's prices.
export function advance(kingdom: Kingdom, now: number, market?: Market | null): { kingdom: Kingdom; events: EconomyEvent[]; sold: Partial<Record<Good, number>> } {
  const events: EconomyEvent[] = []
  const soldTotal: Partial<Record<Good, number>> = {}
  let k = kingdom
  const edit = () =>
    k === kingdom
      ? (k = { ...kingdom, stock: { ...kingdom.stock }, armory: { ...armoryOf(kingdom) }, trade: { ...kingdom.trade }, training: [...(kingdom.training ?? [])], books: booksOf(kingdom) })
      : k
  // Soldiers whose training ended join the garrison.
  const trained = (kingdom.training ?? []).filter((t) => t.doneAt <= now)
  if (trained.length > 0) {
    edit()
    k.training = k.training!.filter((t) => t.doneAt > now)
    const count = trained.reduce((n, t) => n + t.count, 0)
    k.units = trained.reduce((u, t) => addUnits(u, { [t.unit ?? 'spear']: t.count }), garrisonOf(k))
    k.soldiers = countOf(k.units)
    events.push({ kind: 'trained', count })
  }
  // Parties back from their journeys (CLAUDE.md §9.9).
  if ((kingdom.expeditions ?? []).some((e) => !e.result && e.endAt <= now)) {
    edit()
    const settled = settleExpeditions(k, now)
    k.stock = settled.kingdom.stock
    k.books = settled.kingdom.books
    k.units = settled.kingdom.units
    k.soldiers = settled.kingdom.soldiers
    k.people = settled.kingdom.people
    k.expeditions = settled.kingdom.expeditions
    k.record = settled.kingdom.record
    for (const e of settled.back) events.push({ kind: 'expedition', expedition: e })
  }
  // Caravans back from the crowns with the pay for their orders.
  if ((kingdom.orderTrips ?? []).some((t) => t.arriveAt <= now)) {
    edit()
    const paid = settleOrderTrips(k, now, (x) => goldCap(x, now) - x.stock.gold)
    k.orderTrips = paid.kingdom.orderTrips
    k.stock = paid.kingdom.stock
    k.books = paid.kingdom.books
    k.crownRelations = paid.kingdom.crownRelations
    for (const t of paid.back) events.push({ kind: 'orderPaid', crown: t.crown, good: t.good, units: t.units, gold: t.gold })
  }
  // Ships whose building ended moor in the harbour.
  if ((kingdom.navy?.building ?? []).some((b) => b.doneAt <= now)) {
    edit()
    const launched = launchShips(k, now)
    k.navy = launched.kingdom.navy
    for (const l of launched.launched) events.push({ kind: 'launched', ...l })
  }
  // Research that ended since the last settling (told once: settling moves settledAt past it).
  const learnt = (kingdom.researches ?? []).filter((r) => r.doneAt > kingdom.settledAt && r.doneAt <= now)
  for (const r of learnt) events.push({ kind: 'researched', id: r.id })
  if (learnt.length > 0) edit()
  // A building counts from the moment it is done, so production rounds after that use it.
  const finishing = kingdom.buildings.filter((b) => b.doneAt > kingdom.settledAt && b.doneAt <= now)
  for (;;) {
    const tripEnd = k.trade.good ? k.trade.departedAt + tradeTripMs(k) : Infinity
    const voyage = nextVoyage(k)
    const next = Math.min(tripEnd, k.nextProductionAt, voyage?.end ?? Infinity)
    if (next > now) break
    edit()
    if (voyage && next === voyage.end && next !== k.nextProductionAt && next !== tripEnd) {
      // A fleet back from sea: a trade voyage sells its cargo at the crown's harbour (or lost it to pirates) and sets
      // out again; a fleet coming home moors with what it carries (CLAUDE.md §8.5).
      const f = voyage.fleet
      const m = f.mission
      const navy = navyOf(k)
      if (m.kind === 'return') {
        for (const [r, v] of Object.entries(m.cargo ?? {})) k.stock[r as Resource] += v ?? 0
        k.navy = { ...navy, fleets: navy.fleets.map((x) => (x.id === f.id ? { ...x, mission: { kind: 'port' } } : x)) }
        events.push({ kind: 'fleetHome', fleet: f.id, ...(m.cargo && { cargo: m.cargo }) })
      } else if (m.kind === 'trade') {
        const good = m.good
        const blocked = !!k.blockade
        const strike = blocked ? null : voyagePirates(k, f, m.departedAt, next)
        const price = priceAt(market, good, next) * stewardFactor(k, good, next) * balance.navy.trade.priceFactor
        const perUnit = price * (1 + researchEffects(k, next).trade + fortuneEffects(k, next).trade + dynastyEffects(k).trade + guildOf(k, next).trade) * idleFactor(k, next)
        const room = Math.max(0, goldCap(k, next) - k.stock.gold)
        const full = room < 1
        const away = isAway(k, next)
        const load = Math.floor(cargoOf(f.ships) * (away ? balance.economy.away.merchantLoad : 1))
        const units = blocked || full ? 0 : Math.max(0, Math.min(load, Math.floor(k.stock[good] - tradeReserve(k, good, next)), perUnit > 0 ? Math.ceil(room / perUnit) : Infinity))
        const lostToPirates = strike && !strike.won ? units : 0
        const sold = units - lostToPirates
        const gold = Math.min(Math.round(sold * perUnit), Math.floor(room))
        k.stock[good] -= units
        const bounty = strike?.bounty ?? 0
        k.stock.gold = Math.min(goldCap(k, next), k.stock.gold + gold + bounty)
        k.books!.sea = (k.books!.sea ?? 0) + gold
        k.books!.bounty = (k.books!.bounty ?? 0) + bounty
        // Sea sales move the lobby's prices, less than the merchant's.
        if (sold > 0) soldTotal[good] = (soldTotal[good] ?? 0) + sold * balance.navy.trade.marketImpact
        if (sold > 0) k.crownRelations = changeCrownRelation(k, m.city, balance.navy.trade.crownRelation).crownRelations
        const l = navy.ledger ?? { voyages: 0, units: 0, gold: 0, pirates: 0, lostUnits: 0, sunk: 0, bounty: 0 }
        const ledger = { ...l, voyages: l.voyages + (units > 0 ? 1 : 0), units: l.units + sold, gold: l.gold + gold, pirates: l.pirates + (strike ? 1 : 0), lostUnits: l.lostUnits + lostToPirates, sunk: l.sunk + (strike?.sunk ? 1 : 0), bounty: l.bounty + bounty }
        let after: Kingdom = { ...k, navy: { ...navy, ledger, fleets: navy.fleets.map((x) => (x.id === f.id ? { ...x, mission: { ...m, departedAt: next } } : x)) } }
        if (strike?.sunk) after = takeFleetLosses(after, f.id, { [strike.sunk]: 1 })
        k.navy = after.navy
        events.push({ kind: 'voyage', fleet: f.id, good, sold, gold, city: m.city, ...(blocked && { blocked }), ...(full && { full }), ...(strike && { pirates: { won: strike.won, ...(strike.sunk && { sunk: strike.sunk }), ...(bounty && { bounty }), ...(lostToPirates && { lost: lostToPirates }) } }) })
      }
    } else if (next === k.nextProductionAt) {
      // A fortune that befell the kingdom since the last round: what it does at once.
      if (k.buildings.some((b) => b.kind === 'palace')) {
        const harm = (spec: (typeof begun)['spec']) => {
          const lost: Partial<Stock> = {}
          for (const [g, share] of Object.entries(spec.lose ?? {})) {
            lost[g as Good] = Math.floor(k.stock[g as Good] * (share ?? 0))
            k.stock[g as Good] -= lost[g as Good]!
          }
          if (spec.sicken) k.sickness = Math.min(balance.institutions.sickness.max, (k.sickness ?? 0) + spec.sicken)
          return lost
        }
        let begun: ReturnType<typeof fortunesBegun>[number]
        for (begun of fortunesBegun(k, next - productionMs(), next)) {
          // A crisis waits for the lord's answer: its harm falls only once the time to answer is over.
          const crisis = isCrisis(begun.kind)
          const lost = crisis ? {} : harm(begun.spec)
          if (begun.spec.gold) {
            k.stock.gold += begun.spec.gold
            k.books!.other += begun.spec.gold
          }
          events.push({ kind: 'fortune', fortune: begun.kind, scope: begun.scope, start: begun.start, until: begun.end, ...(Object.keys(lost).length > 0 && { lost }), ...(begun.spec.gold && { gold: begun.spec.gold }), ...(crisis && { crisis }), ...(isDilemma(begun.kind) && { dilemma: true }) })
        }
        // Crises whose time to answer ran out since the last round, unanswered or left alone: the harm is done.
        const wait = crisisDecideMs()
        for (const due of fortunesBegun(k, next - productionMs() - wait, next - wait)) {
          if (!isCrisis(due.kind) || crisisWarded(k, due)) continue
          // The steward turns the villagers out for the lord who did not answer, if the fee is there (and nobody
          // chose to do nothing).
          const fee = balance.institutions.events.crisis.steward.fee as Cost
          if (k.steward && !k.responses?.[crisisKey(due)] && affordable(k.stock, fee)) {
            k.stock = pay(k.stock, fee)
            const at = due.start + wait
            const keep = at - balance.institutions.events.crisis.keepHours * 3_600_000
            k.responses = { ...Object.fromEntries(Object.entries(k.responses ?? {}).filter(([, r]) => r.at > keep)), [crisisKey(due)]: { choice: 'villagers', at } }
            events.push({ kind: 'crisis', fortune: due.kind, steward: true })
            continue
          }
          const before = k.sickness ?? 0
          const lost = harm(due.spec)
          events.push({ kind: 'crisis', fortune: due.kind, ...(Object.keys(lost).length > 0 && { lost }), ...(due.spec.sicken && { sick: (k.sickness ?? 0) - before }) })
        }
      }
      const { delta, weapons, towns: upkept, navy: shipsKept } = roundOutcome(k, next)
      // Fleets hunting pirates: now and then a crew caught for its bounty, now and then a ship lost.
      let bounties = 0
      for (const f of navyOf(k).fleets) {
        if (f.mission.kind !== 'hunt' || k.blockade) continue
        const caught = huntRound(k, f, Math.floor(next / productionMs()))
        if (!caught) continue
        delta.gold = (delta.gold ?? 0) + caught.bounty
        bounties += caught.bounty
        k.books!.bounty = (k.books!.bounty ?? 0) + caught.bounty
        if (caught.sunk) k.navy = takeFleetLosses(k, f.id, { [caught.sunk]: 1 }).navy
        events.push({ kind: 'hunt', fleet: f.id, bounty: caught.bounty, ...(caught.sunk && { sunk: caught.sunk }) })
      }
      // The accounts: the taxes and the soldiers' pay as they were, the rest (towns, the fisher) together. Tributes
      // between lords are booked by the server as it moves them.
      const books = k.books!
      const l = ledger(k, next)
      books.tax += l.tax
      books.wages += l.soldiersGold
      books.townUpkeep = (books.townUpkeep ?? 0) + upkept.cost
      books.navy = (books.navy ?? 0) + shipsKept.gold
      books.other += (delta.gold ?? 0) - (l.tax - l.soldiersGold) + upkept.cost + shipsKept.gold - bounties
      // While the lord is away the storehouses are not filled to the brim: what is made slows as a store nears the
      // top of its room and stops short of it (CLAUDE.md §6.4).
      if (isAway(k, next)) {
        const room = storageCap(k, next)
        for (const g of GOODS) {
          const v = delta[g] ?? 0
          if (v > 0) delta[g] = v * awayStoreFactor(k.stock[g], room)
        }
      }
      for (const [r, v] of Object.entries(delta)) k.stock[r as Resource] = Math.max(0, k.stock[r as Resource] + (v ?? 0))
      // Full stores: what does not fit is lost.
      const space = storageCap(k, next)
      const lost: Partial<Record<Resource, number>> = {}
      for (const g of GOODS) {
        if (k.stock[g] <= space) continue
        lost[g] = k.stock[g] - space
        k.stock[g] = space
      }
      const vault = goldCap(k, next)
      if (k.stock.gold > vault) {
        lost.gold = k.stock.gold - vault
        k.stock.gold = vault
      }
      if (Object.keys(lost).length > 0) {
        books.wastedGold += lost.gold ?? 0
        for (const g of GOODS) books.wastedGoods += lost[g] ?? 0
        events.push({ kind: 'wasted', lost })
      }
      // The armory holds so much of each weapon; a forge's last batch stops at the top.
      const armsRoom = armoryCap(k, next)
      for (const [w, v] of Object.entries(weapons)) k.armory![w as Weapon] = Math.min(Math.max(armsRoom, k.armory![w as Weapon]), k.armory![w as Weapon] + (v ?? 0))
      // The people grow into the room there is, or leave (CLAUDE.md §5.2); older saves start full.
      if (k.buildings.some((b) => b.kind === 'palace')) {
        const grown = growthTerms(k, next)
        k.people = Math.max(0, Math.min(grown.room, grown.people + grown.perRound))
      }
      k.sickness = sicknessStep(k, next)
      // The people's mood drifts toward what the taxes, the queen, the granary, the temple and the day make of it.
      const n = balance.society.night
      k.happiness = happinessStep(happinessOf(k), happinessFor(k, next))
      // The crowns' feelings settle back toward where they rest.
      k.crownRelations = driftCrownRelations(k).crownRelations
      // The held towns: their tally, their loyalty, revolts (CLAUDE.md §8.4).
      if (k.towns?.length) {
        const t = townsRound(k.towns, next, productionMs(), upkept.paid, { happiness: happinessOf(k), ruler: dynastyEffects(k).happiness, kin: townKinBonus(k) }, idleFactor(k, next))
        k.towns = t.towns
        if (t.lost.length > 0) k.townsLost = [...(k.townsLost ?? []), ...t.lost].slice(-8)
        events.push(...t.events)
      }
      // Night shifts tire the people; rest brings them back.
      k.fatigue =
        k.nightShift && isNightAt(next)
          ? Math.min(n.maxFatigue, (k.fatigue ?? 0) + n.fatiguePerNightRound)
          : Math.max(0, (k.fatigue ?? 0) - n.recoveryPerRound)
      // The manpower pool refills toward its cap.
      const cap = manpowerCap(k, next)
      k.manpower = Math.min(cap, (k.manpower ?? cap) + balance.society.manpower.regenPerRoundPerPalaceLevel * palaceLevel(k, next))
      // The spy house trains a spy whenever it has room and the gold.
      const room = spyCapacity(k, next) - (k.spies ?? 0) - (k.spiesAway ?? 0)
      if (room > 0 && (k.nextSpyAt ?? 0) <= next && affordable(k.stock, balance.espionage.spyCost as Cost)) {
        k.stock = pay(k.stock, balance.espionage.spyCost as Cost)
        k.spies = (k.spies ?? 0) + 1
        k.nextSpyAt = next + balance.espionage.spySeconds * 1000
        events.push({ kind: 'spy' })
      }
      k.nextProductionAt += productionMs()
      events.push({ kind: 'produced', delta, weapons })
    } else {
      const good = k.trade.good!
      // Walled in without a gate, the merchant cannot reach the trade post.
      const post = k.buildings.find((b) => b.kind === 'tradePost')
      const walledIn = !!post && cutOff(k.buildings, k.site, next).has(post.id)
      const damaged = !!k.trade.damaged
      // A free city takes a bigger load at its own steady price, and its trade leaves the lobby's prices alone.
      const city = k.trade.city
      const fortune = fortuneEffects(k, next).trade
      const price = tradePrice(k, good, market, next)
      const perUnit = price * (1 + researchEffects(k, next).trade + fortune + dynastyEffects(k).trade + guildOf(k, next).trade) * idleFactor(k, next)
      // A full treasury has no room for the merchant's gold: he keeps the goods at home and sells only what fills it,
      // and sets out again once tribute or spending makes room (CLAUDE.md §6.4).
      const room = Math.max(0, goldCap(k, next) - k.stock.gold)
      const full = room < 1
      // Without the lord to keep an eye on him the merchant takes it easy and carries a lighter load.
      const away = isAway(k, next)
      const load = Math.floor(tradeLoad(k) * (away ? balance.economy.away.merchantLoad : 1))
      const sold = walledIn || damaged || full ? 0 : Math.max(0, Math.min(load, Math.floor(k.stock[good] - tradeReserve(k, good, next)), perUnit > 0 ? Math.ceil(room / perUnit) : Infinity))
      const earned = Math.min(Math.round(sold * perUnit), Math.floor(room))
      // Bandits on the road by the trade post take their cut of what the merchant brings home (CLAUDE.md §7.9).
      const robbed = Math.round(earned * outlawEffects(k).merchantCut)
      const gold = earned - robbed
      if (robbed > 0) k.books!.outlaws = (k.books!.outlaws ?? 0) + robbed
      // A crown city's trade moves the lobby's prices too, if less than the lobby's market (CLAUDE.md §7.7).
      if (sold > 0) soldTotal[good] = (soldTotal[good] ?? 0) + sold * (city ? balance.cities.trade.marketImpact : 1)
      k.stock[good] -= sold
      k.stock.gold += gold
      k.books!.trade += gold
      if (away && sold > 0) k.books!.tradeSlack = (k.books!.tradeSlack ?? 0) + 1
      if (full && !walledIn && !damaged) k.books!.tradeHeld += 1
      k.trade.departedAt = next
      // Trade at a crown's capital warms the crown to the lord.
      if (city && sold > 0) k.crownRelations = changeCrownRelation(k, city.index, balance.cities.crown.relation.cityTrip).crownRelations
      if (sold > 0) {
        const ledger = k.trade.ledger ?? { food: 0, materials: 0, arms: 0, gold: 0 }
        k.trade.ledger = { ...ledger, [good]: ledger[good] + sold, gold: ledger.gold + gold }
      }
      events.push({ kind: 'trade', good, sold, gold, ...(walledIn && { walledIn }), ...(damaged && { damaged }), ...(city && { city: city.index }), ...(full && { full }), ...(robbed > 0 && { robbed }) })
    }
  }
  for (const building of finishing) events.push({ kind: 'built', building })
  if (finishing.length > 0) edit()
  // The lord's house: births, deaths and successions up to now (only once the realm has its palace).
  if (k.buildings.some((b) => b.kind === 'palace')) {
    const step = dynastyStep(k, now)
    // A house kept with years of another length is saved once brought to today's (dynasty.ts rescaleYears): left
    // unsaved its old dates would be read with the new years (a lord of 34 shown as 234) and its births never come.
    const rescaled = step.kingdom.dynasty?.yearMs !== k.dynasty?.yearMs || step.kingdom.dynasty?.rev !== k.dynasty?.rev
    if (step.events.length > 0 || !k.dynasty || rescaled || step.kingdom.queen !== !!k.queen) {
      edit()
      k.dynasty = step.kingdom.dynasty
      k.queen = step.kingdom.queen
      events.push(...step.events)
    }
  }
  // Goals of the season reached since (CLAUDE.md §9.9): a badge and a small purse.
  const reached = checkGoals(k, now)
  if (reached.reached.length > 0) {
    edit()
    k.goals = reached.kingdom.goals
    k.stock = reached.kingdom.stock
    k.books = reached.kingdom.books
    for (const g of reached.reached) events.push({ kind: 'goal', ...g })
  }
  if (k !== kingdom) k.settledAt = now
  return { kingdom: k, events, sold: soldTotal }
}

// Where the people's mood is heading at `at`.
export function happinessFor(k: Kingdom, at: number) {
  const fortune = fortuneEffects(k, at)
  const templeLevel = levelOf(k, 'temple', at)
  return happinessTarget(k.tax, !!k.queen, k.stock.food <= 0, {
    nightShift: k.nightShift,
    queenTaken: !!k.queenHeldBy,
    revolt: (k.revoltUntil ?? 0) > at,
    taxFactor: sermonTaxFactor(k, at),
    extra:
      ((k.fearUntil ?? 0) > at ? balance.military.fear.happiness : 0) +
      (imprisoned(k.buildings, k.site, at) ? balance.society.happiness.imprisoned : 0) +
      templeHappiness(k, at) +
      // The dynasty's memorial (CLAUDE.md §9.8).
      memorialHappiness(k, at) +
      researchEffects(k, at).happiness +
      dynastyEffects(k).happiness +
      (k.sickness ?? 0) * balance.institutions.sickness.happinessPerShare +
      (k.blockade ? balance.navy.blockade.happiness : 0) +
      // Bandits on the trade road and pirates on the water (CLAUDE.md §7.9, §8.5).
      outlawEffects(k).happiness +
      // What the parties back brought home (CLAUDE.md §9.9).
      expeditionHappiness(k, at) +
      // Holding too many towns at once (CLAUDE.md §8.4).
      overreachFor(k.towns).happiness +
      fortune.happiness +
      (templeLevel > 0 ? fortune.templeHappiness : 0),
  })
}

// One round of sickness: some fall ill (faster when many are already sick, when hungry and in the cold), some get
// well on their own, and the hospital's staff heal more.
export function sicknessStep(k: Kingdom, at: number) {
  const s = balance.institutions.sickness
  const share = k.sickness ?? 0
  const learnt = researchEffects(k, at)
  const spread = fortuneEffects(k, at).sickSpread * seasonFactor(k, at, 'sickness')
  const falling = (s.perRound + s.spread * share) * (1 - share) * (k.stock.food <= 0 ? s.starvingFactor : 1) * spread * learnt.sickness
  const hospital = k.buildings.find((b) => b.kind === 'hospital')
  const crew = hospital && done(hospital, at) ? (workerSlots(hospital) === 0 ? 1 : staffOf(hospital) / workerSlots(hospital)) * population(k, at).efficiency : 0
  const healing = share * (s.recoveryPerRound + hospitalHeal(levelOf(k, 'hospital', at)) * crew) * learnt.healing
  const next = Math.max(0, Math.min(s.max, share + falling - healing))
  return next < 1e-4 ? 0 : next
}

const isWater = (world: World, x: number, y: number) =>
  x >= 0 && y >= 0 && x < world.size && y < world.size &&
  (world.terrain[y * world.size + x] === Terrain.Lake || world.terrain[y * world.size + x] === Terrain.River)

// The jetty of a dock on `plot`: of the lanes leaving each side of the plot (one per edge tile), it takes the one
// running furthest over open water.
export function dockPier(world: World, plot: Rect, maxLength = 2) {
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
