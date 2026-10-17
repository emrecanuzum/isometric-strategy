import { balance } from './balance'
import type { Point } from './iso'
import { priceAt } from './market'
import type { Market, MarketGood } from './market'
import { territoryRect } from './territory'
import { Feature, Terrain, citiesOf, hash, mulberry32 } from './worldgen'

// Small towns scattered over the map (CLAUDE.md §8.4): each belongs to no one until a kingdom's army takes it in a
// siege, and from then on sends its lord something every round, until another lord at war with him takes it in turn.
// Where they stand is drawn once per lobby from its seed (around the kingdoms already there) and kept by the server.

export type TownKind = 'gold' | 'food' | 'materials' | 'arms' | 'people'
export const TOWN_KINDS: TownKind[] = ['gold', 'food', 'materials', 'arms', 'people']

// A town as the server keeps it (the `lobby_towns` table).
export interface Town {
  id: number
  idx: number
  // The back corner of its square of balance.towns.size tiles.
  x: number
  y: number
  kind: TownKind
  name: string
  // The kingdom that holds it; null while it is free.
  owner: number | null
  // Soldiers of its own defending it while it is free.
  garrison: number
  siege: TownSiege | null
  // Risen against its lord: the rebels camped at its gate (CLAUDE.md §8.4); null or absent when none.
  rebels?: TownRebels | null
  // Its market: the stock left after the last sale and when that was (ms); absent while nothing was ever sold.
  marketStock?: number | null
  marketAt?: number | null
}

export interface TownSiege {
  army: number
  kingdom: number
  // Milliseconds.
  startedAt: number
  endsAt: number
  // The soldiers the besiegers have lost so far (sieges laid before it was kept lack it). Their strength itself is not
  // kept here, as everyone in the lobby reads the towns.
  lost?: number
}

// What a kingdom holds, kept on its state for the round's sums: each town's id and what it sends, and how it stands
// with its lord (CLAUDE.md §8.4). Towns taken before loyalty was kept lack the rest: they count as just taken.
export interface HeldTown {
  id: number
  kind: TownKind
  name?: string
  // When it was taken (ms).
  takenAt?: number
  // 0..100: drifts toward what the upkeep paid (and the lord's people) make of it, round by round.
  loyalty?: number
  // The upkeep the lord pays it every round: an index into balance.towns.upkeep.goldPerRound.
  upkeep?: number
  // Whether the last round's upkeep was paid (not, when the treasury could not).
  unpaid?: boolean
  // All it has sent so far.
  delivered?: Partial<Record<TownGood, number>>
  // In revolt until then: it sends nothing.
  revoltUntil?: number
  // The revolt the server has told its lord of (its revoltUntil).
  revoltTold?: number
  // When spies last stirred it up, and by how much its loyalty fell then (see inciteTown).
  incitedAt?: number
  incitedBy?: number
  // A revolt just put down: no new one starts before then (ms), however low its loyalty.
  quietUntil?: number
}

export type TownGood = 'gold' | 'food' | 'materials' | 'arms' | 'villagers'

// A town that broke free of its lord in a revolt: kept on the lord's state until the server sets it free.
export interface LostTown {
  id: number
  name?: string
  at: number
}

const NAME_HEADS = ['Ak', 'Kara', 'Gök', 'Sarı', 'Kızıl', 'Yeşil', 'Uzun', 'Eski', 'Yeni', 'Çam', 'Söğüt', 'Kavak', 'Taş', 'Değirmen', 'Kuyu', 'Bakır', 'Ceviz', 'Elma', 'Pınar', 'Kırk']
const NAME_TAILS = ['köy', 'ören', 'yurt', 'oba', 'pınar', 'dere', 'tepe', 'alan', 'bük', 'çay', 'yayla', 'kuyu', 'hisar', 'ova']

// A town's name: its own draw from the lobby seed, so neighbouring towns do not share their first word.
export function townName(seed: number, idx: number) {
  const draw = mulberry32((seed ^ 0x9e3779b1) + idx * 7919)
  draw()
  return `${NAME_HEADS[Math.floor(draw() * NAME_HEADS.length)]}${NAME_TAILS[Math.floor(draw() * NAME_TAILS.length)]}`
}

// The middle of a town and the spot in front of it where an army stands to lay siege.
export const townCenter = (t: Pick<Town, 'x' | 'y'>): Point => ({ x: t.x + balance.towns.size / 2, y: t.y + balance.towns.size / 2 })
export const townGate = (t: Pick<Town, 'x' | 'y'>): Point => ({ x: t.x + balance.towns.size / 2, y: t.y + balance.towns.size + 0.8 })
export const inTown = (t: Pick<Town, 'x' | 'y'>, p: Point) =>
  p.x >= t.x && p.y >= t.y && p.x < t.x + balance.towns.size && p.y < t.y + balance.towns.size

// How many towns a lobby of `players` gets.
export const townCount = (players: number) => Math.max(3, Math.round(players * balance.towns.perPlayers))

interface TileWorld {
  size: number
  terrain: Uint8Array
  feature: Uint8Array
}

// Where the lobby's towns go: open dry land inside the mountain ring, off the roads, away from the inns, the free
// cities, one another and the fully grown lands of the kingdoms (`sites`, every site given out so far). Only the tiles
// are read, so the server places them; the same seed and sites always give the same towns.
export function placeTowns(world: TileWorld, seed: number, count: number, sites: Point[]): { x: number; y: number; kind: TownKind }[] {
  const t = balance.towns
  const S = t.size
  const { size, terrain, feature } = world
  const draw = mulberry32(seed ^ 0x70a5e)
  const cities = citiesOf(world).map((c) => ({ x: c.x + balance.cities.size / 2, y: c.y + balance.cities.size / 2 }))
  const lands = sites.map((s) => territoryRect(s, balance.territory.stageParcels.length - 1))
  const inns: Point[] = []
  for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) if (feature[y * size + x] === Feature.Inn) inns.push({ x, y })
  const placed: { x: number; y: number; kind: TownKind }[] = []
  const fits = (p: Point) => {
    for (let y = p.y - t.roadGap; y < p.y + S + t.roadGap; y++) {
      for (let x = p.x - t.roadGap; x < p.x + S + t.roadGap; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        const i = y * size + x
        if (feature[i] !== Feature.None) return false
        const inside = x >= p.x && y >= p.y && x < p.x + S && y < p.y + S
        const k = terrain[i]
        if (inside && k !== Terrain.Grass && k !== Terrain.Forest && k !== Terrain.Desert) return false
        if (k === Terrain.Lake || k === Terrain.River || k === Terrain.Mountain) return false
      }
    }
    return true
  }
  const middle = (p: Point) => ({ x: p.x + S / 2, y: p.y + S / 2 })
  for (let attempt = 0; attempt < count * 400 && placed.length < count; attempt++) {
    const p = {
      x: t.edgeMargin + Math.floor(draw() * (size - t.edgeMargin * 2 - S)),
      y: t.edgeMargin + Math.floor(draw() * (size - t.edgeMargin * 2 - S)),
    }
    const m = middle(p)
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < t.minSpacing)) continue
    if (cities.some((c) => Math.hypot(c.x - m.x, c.y - m.y) < t.cityGap)) continue
    if (inns.some((n) => Math.hypot(n.x + 1 - m.x, n.y + 1 - m.y) < t.innGap)) continue
    const g = t.kingdomGap
    if (lands.some((r) => p.x < r.x + r.size + g && r.x < p.x + S + g && p.y < r.y + r.size + g && r.y < p.y + S + g)) continue
    if (!fits(p)) continue
    placed.push({ ...p, kind: TOWN_KINDS[placed.length % TOWN_KINDS.length] })
  }
  // The kinds are dealt in turn so every kind is there, then shuffled among the towns.
  for (let i = placed.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1))
    ;[placed[i].kind, placed[j].kind] = [placed[j].kind, placed[i].kind]
  }
  return placed
}

// A site that is clear of the towns: its fully grown lands keep balance.towns.kingdomGap tiles from every town.
export function siteClearOfTowns(site: Point, towns: Pick<Town, 'x' | 'y'>[]) {
  const r = territoryRect(site, balance.territory.stageParcels.length - 1)
  const S = balance.towns.size
  const g = balance.towns.kingdomGap
  return towns.every((p) => !(p.x < r.x + r.size + g && r.x < p.x + S + g && p.y < r.y + r.size + g && r.y < p.y + S + g))
}

// ---- Loyalty (CLAUDE.md §8.4) ----------------------------------------------------------------------------------------

const T = () => balance.towns

export const townLoyalty = (h: Pick<HeldTown, 'loyalty'>) => h.loyalty ?? T().loyalty.start
export const townUpkeepLevel = (h: Pick<HeldTown, 'upkeep'>) => Math.max(0, Math.min(T().upkeep.goldPerRound.length - 1, h.upkeep ?? T().upkeep.default))
export const townRevolting = (h: Pick<HeldTown, 'revoltUntil'>, at: number) => (h.revoltUntil ?? 0) > at

// ---- Over-expansion (CLAUDE.md §8.4) ---------------------------------------------------------------------------------

// What holding `towns` towns at once costs a lord: every town's loyalty heads lower (and, at the last tier, never
// higher than a cap under the revolt line), his own people are less content, each town's upkeep costs more and each
// sends less. Nothing for a single town.
export interface Overreach {
  // The tier's index in balance.towns.overreach.tiers (-1: none).
  tier: number
  towns: number
  loyalty: number
  loyaltyCap: number
  happiness: number
  upkeepFactor: number
  yieldFactor: number
}

const NO_OVERREACH = { loyalty: 0, loyaltyCap: 100, happiness: 0, upkeepFactor: 1, yieldFactor: 1 }

export function overreachOf(towns: number): Overreach {
  const tiers = T().overreach.tiers
  let tier = -1
  for (let i = 0; i < tiers.length; i++) if (towns >= tiers[i].towns) tier = i
  const t = tier < 0 ? NO_OVERREACH : tiers[tier]
  return { tier, towns, loyalty: t.loyalty, loyaltyCap: t.loyaltyCap, happiness: t.happiness, upkeepFactor: t.upkeepFactor, yieldFactor: t.yieldFactor }
}

// The over-expansion of a lord's held towns.
export const overreachFor = (held: HeldTown[] | undefined) => overreachOf(held?.length ?? 0)

// Gold the town's upkeep costs every round, when its lord holds `towns` towns.
export const townUpkeepGold = (h: Pick<HeldTown, 'upkeep'>, towns = 1) => T().upkeep.goldPerRound[townUpkeepLevel(h)] * overreachOf(towns).upkeepFactor

// What a town's loyalty does to what it sends: from yieldMin at 0 to yieldMax at 100 (×1 at 50); nothing in revolt.
export function townFactor(h: Pick<HeldTown, 'loyalty' | 'revoltUntil'>, at: number) {
  if (townRevolting(h, at)) return 0
  const l = T().loyalty
  return l.yieldMin + ((l.yieldMax - l.yieldMin) * townLoyalty(h)) / 100
}

// What one town sends in one round (before the idle penalty), when its lord holds `towns` towns.
export function townSends(h: HeldTown, at: number, towns = 1) {
  const out = { gold: 0, food: 0, materials: 0, arms: 0, villagers: 0 }
  const spec = T().kinds[h.kind] as { perRound?: number; villagers?: number }
  const f = townFactor(h, at) * overreachOf(towns).yieldFactor
  if (h.kind === 'people') out.villagers = Math.round((spec.villagers ?? 0) * f)
  else out[h.kind] = (spec.perRound ?? 0) * f
  return out
}

// What the held towns send in one round (before the idle penalty), and the villagers the "people" towns add.
export function townYield(held: HeldTown[] | undefined, at: number) {
  const out = { gold: 0, food: 0, materials: 0, arms: 0, villagers: 0 }
  for (const h of held ?? []) {
    const s = townSends(h, at, held!.length)
    for (const k of Object.keys(out) as TownGood[]) out[k] += s[k]
  }
  return out
}

// What the lord's realm adds to every town's loyalty: a happy people and a ruler with a way with them; and how many
// towns he holds (over-expansion; 1 when not given).
export interface TownMood {
  happiness: number
  // The ruler's people skill as mood points (dynastyEffects().happiness).
  ruler: number
  towns?: number
  // What the lord's kin add to a town's loyalty, by town id: its governor, a princess married into its first family
  // (dynasty.ts townKinBonus).
  kin?: Record<number, number>
}

// What makes up where a town's loyalty is heading, part by part (the town sheet draws them).
export interface LoyaltyParts {
  // From the upkeep paid (the lowest when it was not).
  upkeep: number
  happiness: number
  ruler: number
  // The lord's kin: a governor, a princess married there.
  kin: number
  // Over-expansion: what holding many towns takes off, and the most the target may then be.
  overreach: number
  cap: number
  target: number
}

export function townLoyaltyParts(h: HeldTown, mood: TownMood, paid = !h.unpaid): LoyaltyParts {
  const l = T().loyalty
  const over = overreachOf(mood.towns ?? 1)
  const upkeep = l.upkeepTargets[paid ? townUpkeepLevel(h) : 0]
  const happiness = (mood.happiness - 50) * l.happinessWeight
  const ruler = mood.ruler * l.rulerWeight
  const kin = mood.kin?.[h.id] ?? 0
  const target = Math.max(0, Math.min(100, over.loyaltyCap, upkeep + happiness + ruler + kin + over.loyalty))
  return { upkeep, happiness, ruler, kin, overreach: over.loyalty, cap: over.loyaltyCap, target }
}

// Where a town's loyalty is heading: set by the upkeep paid (none when it was not), moved by the realm's mood, pulled
// down by over-expansion.
export const townLoyaltyTarget = (h: HeldTown, mood: TownMood, paid = !h.unpaid) => townLoyaltyParts(h, mood, paid).target

// How long until a town's loyalty, drifting from where it is toward `target`, falls under the revolt line (ms); null
// when it does not (it is already under it, or heading no lower).
export function townRevoltIn(loyalty: number, target: number) {
  const below = T().revolt.below
  if (loyalty < below || target >= below) return null
  return T().loyalty.tauSeconds * 1000 * Math.log((loyalty - target) / (below - target))
}

// One production round for the held towns at `at` (`roundMs` long): what they sent is added to their tally, loyalty
// drifts toward its target, revolts start when it falls too low and end, at their end, with the town broken free if it
// is lower still. `paid`: the towns whose upkeep was paid this round. `idle`: the absent lord's share.
export function townsRound(held: HeldTown[], at: number, roundMs: number, paid: Set<number>, mood: TownMood, idle: number) {
  const r = T().revolt
  const step = 1 - Math.exp(-roundMs / (T().loyalty.tauSeconds * 1000))
  const towns = held.length
  const mood1 = { ...mood, towns: mood.towns ?? towns }
  const kept: HeldTown[] = []
  const lost: LostTown[] = []
  const events: ({ kind: 'townRevolt'; town: number; name?: string } | { kind: 'townFree'; town: number; name?: string })[] = []
  for (const h0 of held) {
    const h: HeldTown = { ...h0, delivered: { ...h0.delivered } }
    const sends = townSends(h0, at, towns)
    for (const k of Object.keys(sends) as TownGood[]) {
      // Villagers are not sent and spent: the tally keeps the most it ever housed.
      if (k === 'villagers') h.delivered!.villagers = Math.max(h.delivered!.villagers ?? 0, sends.villagers)
      else if (sends[k]) h.delivered![k] = (h.delivered![k] ?? 0) + sends[k] * idle
    }
    h.unpaid = !paid.has(h.id) && townUpkeepGold(h, towns) > 0 ? true : undefined
    const loyalty = townLoyalty(h)
    h.loyalty = Math.round((loyalty + (townLoyaltyTarget(h, mood1) - loyalty) * step) * 1000) / 1000
    if (h.revoltUntil !== undefined && h.revoltUntil <= at) {
      if (h.loyalty < r.breakAwayBelow) {
        lost.push({ id: h.id, name: h.name, at: h.revoltUntil })
        events.push({ kind: 'townFree', town: h.id, name: h.name })
        continue
      }
      // Still too disloyal: the revolt goes on (the same revolt, told once).
      if (h.loyalty < r.below) h.revoltUntil += r.seconds * 1000
      else h.revoltUntil = undefined
    }
    if (h.revoltUntil === undefined && h.loyalty < r.below && !townQuiet(h, at)) {
      h.revoltUntil = at + r.seconds * 1000
      events.push({ kind: 'townRevolt', town: h.id, name: h.name })
    }
    kept.push(h)
  }
  return { towns: kept, lost, events }
}

// Which towns' upkeep the treasury can pay this round (in the order they are held), and the gold that takes.
// A town in revolt is paid nothing (it takes nothing from its lord and sends nothing).
export function townUpkeep(held: HeldTown[] | undefined, gold: number, at?: number) {
  const paid = new Set<number>()
  let cost = 0
  for (const h of held ?? []) {
    if (at !== undefined && townRevolting(h, at)) continue
    const g = townUpkeepGold(h, held!.length)
    if (g <= 0 || cost + g > gold) continue
    cost += g
    paid.add(h.id)
  }
  return { paid, cost }
}

// What a town adds to its lord's score (and so to the strength of the crown he is sworn to): more the more loyal it
// is, half as much in revolt.
export function townScore(h: HeldTown, at: number) {
  const f = townFactor(h, at)
  return T().score.perTown * (f > 0 ? f : T().loyalty.yieldMin / 2)
}

// A town as a lord's state keeps it when it is taken.
export const heldTown = (town: Pick<Town, 'id' | 'kind' | 'name'>, at: number): HeldTown => ({
  id: town.id,
  kind: town.kind,
  name: town.name,
  takenAt: at,
  loyalty: T().loyalty.start,
  upkeep: T().upkeep.default,
})

// Some towns stand behind a wooden palisade (drawn from the lobby seed): weaker than a kingdom's stone walls, it makes
// a siege last longer and costs the besiegers more soldiers.
export const townWalled = (seed: number, idx: number) => hash(idx, 9, seed + 3021) < balance.towns.palisade.share

// The soldiers an army loses taking a free town from its garrison (more behind a palisade).
export const townLosses = (garrison: number, walled = false) =>
  Math.ceil(garrison * balance.towns.lossPerDefender * (walled ? balance.towns.palisade.lossFactor : 1))

// How long a siege of the town lasts (ms).
export const townSiegeMs = (walled: boolean) => balance.towns.siegeSeconds * 1000 * (walled ? balance.towns.palisade.siegeFactor : 1)

// A siege of a town is fought in rounds (CLAUDE.md §8.4): every round the defenders bring down a few besiegers (at
// least one, even at a held town, whose townsfolk fight back) and a free town's garrison loses a few of its own, so the
// losses come over the whole siege, not all at its end. Drawn from the town and the
// siege's start, so the server and every screen work out the same rounds. Each round gives what has been lost so far.
export interface TownRound {
  // Besiegers and defenders left after the round, and how many each side has lost so far.
  attackers: number
  defenders: number
  lost: number
  killed: number
}

export const townRoundMs = () => balance.towns.siegeRoundSeconds * 1000

export function townSiegeRounds(town: Pick<Town, 'id' | 'owner' | 'garrison'>, siege: Pick<TownSiege, 'startedAt' | 'endsAt'>, soldiers: number, walled: boolean): TownRound[] {
  const count = Math.max(1, Math.ceil((siege.endsAt - siege.startedAt) / townRoundMs()))
  const garrison = town.owner === null ? town.garrison : 0
  const losses = Math.min(soldiers, town.owner === null ? townLosses(garrison, walled) : 0)
  const salt = siege.startedAt % 1_000_003
  const weights = (n: number) => Array.from({ length: count }, (_, r) => 0.4 + hash(town.id * 31 + n, r, salt))
  const share = (w: number[]) => {
    const total = w.reduce((a, b) => a + b, 0)
    let sum = 0
    return w.map((v) => (sum += v) / total)
  }
  const hurt = share(weights(1))
  const hit = share(weights(2))
  const rounds: TownRound[] = []
  let lost = 0
  for (let r = 0; r < count; r++) {
    lost = Math.min(soldiers, Math.max(lost + 1, Math.round(losses * hurt[r])))
    const killed = Math.round(garrison * hit[r])
    rounds.push({ attackers: soldiers - lost, defenders: garrison - killed, lost, killed })
  }
  return rounds
}

// Rounds of the siege fought by `at` (0 before the first is over, all of them once it has ended).
export const townRoundsDone = (siege: Pick<TownSiege, 'startedAt' | 'endsAt'>, at: number, count: number) =>
  at >= siege.endsAt ? count : Math.max(0, Math.min(count, Math.floor((at - siege.startedAt) / townRoundMs())))

// The lord sets a town's upkeep (CLAUDE.md §8.4): one of balance.towns.upkeep.goldPerRound. Unchanged when the town is
// not his or the level is not one.
export function setTownUpkeep<K extends { towns?: HeldTown[] }>(kingdom: K, town: number, level: number): K {
  if (!Number.isInteger(level) || level < 0 || level >= balance.towns.upkeep.goldPerRound.length) return kingdom
  const held = kingdom.towns ?? []
  const h = held.find((t) => t.id === town)
  if (!h || townUpkeepLevel(h) === level) return kingdom
  return { ...kingdom, towns: held.map((t) => (t.id === town ? { ...t, upkeep: level } : t)) }
}

// A lord lets a town go of his own accord (CLAUDE.md §8.4): it goes back to no one (the server frees it in the lobby,
// see releaseTown in the command). Not while it is besieged.
export const releaseTownError = (kingdom: { towns?: HeldTown[] }, town: number, besieged: boolean): 'town' | 'besieged' | null =>
  !(kingdom.towns ?? []).some((h) => h.id === town) ? 'town' : besieged ? 'besieged' : null

export function releaseTown<K extends { towns?: HeldTown[] }>(kingdom: K, town: number): K {
  if (!(kingdom.towns ?? []).some((h) => h.id === town)) return kingdom
  return { ...kingdom, towns: (kingdom.towns ?? []).filter((h) => h.id !== town) }
}

// Spies stir a town up against its lord (CLAUDE.md §8.4, §9.7): its loyalty falls at once. When (`at`) is kept so the
// town's sheet can tell its lord.
export function inciteTown<K extends { towns?: HeldTown[] }>(kingdom: K, town: number, at?: number): K {
  const drop = balance.espionage.operations.townRevolt.loyalty
  return {
    ...kingdom,
    towns: (kingdom.towns ?? []).map((t) => {
      if (t.id !== town) return t
      const loyalty = Math.max(0, townLoyalty(t) + drop)
      return { ...t, loyalty, ...(at !== undefined && { incitedAt: at, incitedBy: Math.round((loyalty - townLoyalty(t)) * 10) / 10 }) }
    }),
  }
}

// ---- Rebels (CLAUDE.md §8.4) ------------------------------------------------------------------------------------------

// A held town in revolt sends its rebels out: a band camped at its gate as if laying siege to it, kept on the town's
// row so everyone sees it. Its lord's army beats it at the gate to end the revolt (a battle of kind 'revolt').
export interface TownRebels {
  count: number
  // When they rose (ms).
  since: number
  // The battle being fought against them, if any.
  battle?: number | null
}

const R = () => balance.towns.rebels

// How many rise: more the lower the town's loyalty has sunk under the revolt line, a little more or less by the draw.
export function rebelCount(loyalty: number, idx: number, since: number) {
  const [lo, hi] = R().soldiers
  const below = balance.towns.revolt.below
  const depth = Math.max(0, Math.min(1, (below - loyalty) / below))
  const jitter = Math.floor(hash(idx, 13, Math.floor(since / 1000)) * (R().jitter * 2 + 1)) - R().jitter
  return Math.max(lo, Math.min(hi, lo + Math.round((hi - lo) * depth) + jitter))
}

// The rebels as a side of a battle: spearmen who know their ground (kingdom 0: no one's).
export const rebelFighter = (rebels: Pick<TownRebels, 'count'>) => ({
  kingdom: 0,
  army: null,
  soldiers: rebels.count,
  morale: R().morale,
  familiarity: R().familiarity,
  units: { spear: rebels.count },
  rebels: true,
})

// Whether a revolt may not start yet: just put down, the town stays quiet a while, however low its loyalty.
export const townQuiet = (h: Pick<HeldTown, 'quietUntil'>, at: number) => (h.quietUntil ?? 0) > at

// The rebels beaten: the revolt ends, loyalty rises a little and the town stays quiet for a while.
export function quellTown<K extends { towns?: HeldTown[] }>(kingdom: K, town: number, at: number): K {
  return {
    ...kingdom,
    towns: (kingdom.towns ?? []).map((t) =>
      t.id !== town ? t : { ...t, revoltUntil: undefined, loyalty: Math.min(100, townLoyalty(t) + R().quellLoyalty), quietUntil: at + R().quietSeconds * 1000 },
    ),
  }
}

// ---- The town's market (CLAUDE.md §8.4) -------------------------------------------------------------------------------

// Every town sells one good of its own, from a stock that refills slowly, to any lord whose army comes to its gate. Its
// price is the market building's (lobby price × buyMarkup) less a discount, moved by how the buyer stands with the
// town's lord, and never under floorFactor × the lobby price: bought here, a good cannot be sold back at a profit.
const M = () => balance.towns.market

export const townMarketGood = (kind: TownKind) => M().goods[kind] as MarketGood

// The stock for sale at `at`: what was left after the last sale, refilled round by round up to the cap (full when
// nothing was ever sold).
export function townStock(town: Pick<Town, 'marketStock' | 'marketAt'>, at: number) {
  if (town.marketStock === null || town.marketStock === undefined || !town.marketAt) return M().stock
  const rounds = Math.max(0, at - town.marketAt) / (balance.economy.productionSeconds * 1000)
  return Math.min(M().stock, town.marketStock + rounds * M().refillPerRound)
}

// What the buyer's standing with the town's lord does to the price: dearer for an enemy, a little cheaper for a friend.
// `relation` null: the lord himself, or a free town (no one's standing counts).
export function townRelationFactor(relation: number | null) {
  if (relation === null) return 1
  const r = Math.max(-100, Math.min(100, relation)) / 100
  return r < 0 ? 1 + (M().relation.worst - 1) * -r : 1 - (1 - M().relation.best) * r
}

// One unit's price at the town.
export function townUnitPrice(market: Market | null | undefined, kind: TownKind, at: number, relation: number | null) {
  const lobby = priceAt(market, townMarketGood(kind), at)
  return Math.max(lobby * balance.market.buyMarkup * M().discount * townRelationFactor(relation), lobby * M().floorFactor)
}

export const townBuyCost = (market: Market | null | undefined, kind: TownKind, units: number, at: number, relation: number | null) =>
  Math.ceil(units * townUnitPrice(market, kind, at, relation))

// What an army carries home (goods bought at a town), and how much more it can take.
export type Cargo = Partial<Record<MarketGood, number>>
export const cargoTotal = (cargo: Cargo | null | undefined) => Object.values(cargo ?? {}).reduce<number>((s, n) => s + (n ?? 0), 0)
export const cargoRoom = (soldiers: number, cargo: Cargo | null | undefined) => Math.max(0, soldiers * M().carryPerSoldier - cargoTotal(cargo))
export function addCargo(a: Cargo | null | undefined, b: Cargo | null | undefined): Cargo {
  const out: Cargo = { ...a }
  for (const [g, n] of Object.entries(b ?? {})) out[g as MarketGood] = (out[g as MarketGood] ?? 0) + (n ?? 0)
  return out
}

export type TownBuyError = 'rebels' | 'besieged' | 'stock' | 'carry' | 'cost' | 'none'

// Whether `units` can be bought at the town by an army of `soldiers` carrying `cargo`, with `gold` in the treasury.
export function townBuyError(
  town: Pick<Town, 'rebels' | 'siege' | 'marketStock' | 'marketAt'>,
  units: number,
  soldiers: number,
  cargo: Cargo | null | undefined,
  gold: number,
  cost: number,
  at: number,
): TownBuyError | null {
  if (!Number.isInteger(units) || units < 1) return 'none'
  if (town.rebels) return 'rebels'
  if (town.siege) return 'besieged'
  if (units > Math.floor(townStock(town, at))) return 'stock'
  if (units > cargoRoom(soldiers, cargo)) return 'carry'
  if (gold < cost) return 'cost'
  return null
}
