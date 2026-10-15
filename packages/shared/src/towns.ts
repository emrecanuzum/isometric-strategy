import { balance } from './balance'
import type { Point } from './iso'
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
// Gold the town's upkeep costs every round.
export const townUpkeepGold = (h: Pick<HeldTown, 'upkeep'>) => T().upkeep.goldPerRound[townUpkeepLevel(h)]
export const townRevolting = (h: Pick<HeldTown, 'revoltUntil'>, at: number) => (h.revoltUntil ?? 0) > at

// What a town's loyalty does to what it sends: from yieldMin at 0 to yieldMax at 100 (×1 at 50); nothing in revolt.
export function townFactor(h: Pick<HeldTown, 'loyalty' | 'revoltUntil'>, at: number) {
  if (townRevolting(h, at)) return 0
  const l = T().loyalty
  return l.yieldMin + ((l.yieldMax - l.yieldMin) * townLoyalty(h)) / 100
}

// What one town sends in one round (before the idle penalty).
export function townSends(h: HeldTown, at: number) {
  const out = { gold: 0, food: 0, materials: 0, arms: 0, villagers: 0 }
  const spec = T().kinds[h.kind] as { perRound?: number; villagers?: number }
  const f = townFactor(h, at)
  if (h.kind === 'people') out.villagers = Math.round((spec.villagers ?? 0) * f)
  else out[h.kind] = (spec.perRound ?? 0) * f
  return out
}

// What the held towns send in one round (before the idle penalty), and the villagers the "people" towns add.
export function townYield(held: HeldTown[] | undefined, at: number) {
  const out = { gold: 0, food: 0, materials: 0, arms: 0, villagers: 0 }
  for (const h of held ?? []) {
    const s = townSends(h, at)
    for (const k of Object.keys(out) as TownGood[]) out[k] += s[k]
  }
  return out
}

// What the lord's realm adds to every town's loyalty: a happy people and a ruler with a way with them.
export interface TownMood {
  happiness: number
  // The ruler's people skill as mood points (dynastyEffects().happiness).
  ruler: number
}

// Where a town's loyalty is heading: set by the upkeep paid (none when it was not), moved by the realm's mood.
export function townLoyaltyTarget(h: HeldTown, mood: TownMood, paid = !h.unpaid) {
  const l = T().loyalty
  const level = paid ? townUpkeepLevel(h) : 0
  const target = l.upkeepTargets[level] + (mood.happiness - 50) * l.happinessWeight + mood.ruler * l.rulerWeight
  return Math.max(0, Math.min(100, target))
}

// One production round for the held towns at `at` (`roundMs` long): what they sent is added to their tally, loyalty
// drifts toward its target, revolts start when it falls too low and end, at their end, with the town broken free if it
// is lower still. `paid`: the towns whose upkeep was paid this round. `idle`: the absent lord's share.
export function townsRound(held: HeldTown[], at: number, roundMs: number, paid: Set<number>, mood: TownMood, idle: number) {
  const r = T().revolt
  const step = 1 - Math.exp(-roundMs / (T().loyalty.tauSeconds * 1000))
  const kept: HeldTown[] = []
  const lost: LostTown[] = []
  const events: ({ kind: 'townRevolt'; town: number; name?: string } | { kind: 'townFree'; town: number; name?: string })[] = []
  for (const h0 of held) {
    const h: HeldTown = { ...h0, delivered: { ...h0.delivered } }
    const sends = townSends(h0, at)
    for (const k of Object.keys(sends) as TownGood[]) {
      // Villagers are not sent and spent: the tally keeps the most it ever housed.
      if (k === 'villagers') h.delivered!.villagers = Math.max(h.delivered!.villagers ?? 0, sends.villagers)
      else if (sends[k]) h.delivered![k] = (h.delivered![k] ?? 0) + sends[k] * idle
    }
    h.unpaid = !paid.has(h.id) && townUpkeepGold(h) > 0 ? true : undefined
    const loyalty = townLoyalty(h)
    h.loyalty = Math.round((loyalty + (townLoyaltyTarget(h, mood) - loyalty) * step) * 1000) / 1000
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
    if (h.revoltUntil === undefined && h.loyalty < r.below) {
      h.revoltUntil = at + r.seconds * 1000
      events.push({ kind: 'townRevolt', town: h.id, name: h.name })
    }
    kept.push(h)
  }
  return { towns: kept, lost, events }
}

// Which towns' upkeep the treasury can pay this round (in the order they are held), and the gold that takes.
export function townUpkeep(held: HeldTown[] | undefined, gold: number) {
  const paid = new Set<number>()
  let cost = 0
  for (const h of held ?? []) {
    const g = townUpkeepGold(h)
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

// Spies stir a town up against its lord (CLAUDE.md §8.4, §9.7): its loyalty falls at once.
export function inciteTown<K extends { towns?: HeldTown[] }>(kingdom: K, town: number): K {
  const drop = balance.espionage.operations.townRevolt.loyalty
  return { ...kingdom, towns: (kingdom.towns ?? []).map((t) => (t.id === town ? { ...t, loyalty: Math.max(0, townLoyalty(t) + drop) } : t)) }
}
