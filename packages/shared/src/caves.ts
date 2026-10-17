import { balance } from './balance'
import type { Point } from './iso'
import { Feature, Terrain, hash } from './worldgen'
import type { World } from './worldgen'

// The bandits' caves and clans (CLAUDE.md §7.9.1). Many caves open in the foothills of the mountains, drawn from the
// lobby's seed (the same on every screen and the server; nothing of them is stored). A few bandit clans live in them
// at a time, each in one cave, and the bands on the roads belong to them (band idx % clans). Which cave a clan holds
// is kept by the server alone (lobby_outlaws, kind 'clan': its `cave` column is not readable by the lords); a lord
// finds it by beating the clan's bands a few times (the trail, kept in the lord's own state), and can then lay siege
// to the cave. A clan wiped out gives way at once to a new one in another cave, whose bands take the roads a little
// later.

const C = () => balance.outlaws.caves
const K = () => balance.outlaws.clans

type Ground = Pick<World, 'size' | 'terrain' | 'feature'>

export interface CaveSpot {
  idx: number
  // The mountain tile the cave opens into.
  x: number
  y: number
  // The land tile in front of its mouth (where an army stands to besiege it), as a tile centre.
  mouth: Point
  // Unit step from the mountain tile toward the mouth.
  dx: number
  dy: number
}

const dry = (t: number) => t === Terrain.Grass || t === Terrain.Forest || t === Terrain.Desert || t === Terrain.Swamp

const cityCentres = (world: Ground) => {
  const size = balance.cities.size
  const out: Point[] = []
  for (let i = 0; i < world.size * world.size; i++) {
    if (world.feature[i] !== Feature.City) continue
    const x = i % world.size
    const y = Math.floor(i / world.size)
    if ((x > 0 && world.feature[i - 1] === Feature.City) || (y > 0 && world.feature[i - world.size] === Feature.City)) continue
    out.push({ x: x + size / 2, y: y + size / 2 })
  }
  return out
}

// The size of the walkable land each tile belongs to (4-connected; land and bridges), so a cave's mouth opens onto the
// wide land armies walk and not onto a pocket cut off by water and rock.
function landSizes(world: Ground) {
  const { size } = world
  const label = new Int32Array(size * size).fill(-1)
  const sizes: number[] = []
  const walk = (i: number) => world.feature[i] === Feature.Bridge || dry(world.terrain[i])
  for (let i = 0; i < size * size; i++) {
    if (label[i] >= 0 || !walk(i)) continue
    const id = sizes.length
    let count = 0
    const stack = [i]
    label[i] = id
    while (stack.length > 0) {
      const j = stack.pop()!
      count++
      const x = j % size
      const y = (j - x) / size
      if (x > 0 && label[j - 1] < 0 && walk(j - 1)) (label[j - 1] = id), stack.push(j - 1)
      if (x < size - 1 && label[j + 1] < 0 && walk(j + 1)) (label[j + 1] = id), stack.push(j + 1)
      if (y > 0 && label[j - size] < 0 && walk(j - size)) (label[j - size] = id), stack.push(j - size)
      if (y < size - 1 && label[j + size] < 0 && walk(j + size)) (label[j + size] = id), stack.push(j + size)
    }
    sizes.push(count)
  }
  return { label, sizes }
}

const caveCache = new WeakMap<object, Map<number, CaveSpot[]>>()

// The lobby's caves: mountain tiles at the foot of the slopes (a free land tile in front, below the snow), opening
// onto the wide land, apart from one another, away from the crowns' capitals and the edge of the world.
export function caveSpots(world: Ground, seed: number): CaveSpot[] {
  let bySeed = caveCache.get(world)
  if (!bySeed) caveCache.set(world, (bySeed = new Map()))
  const known = bySeed.get(seed)
  if (known) return known
  const spec = C()
  const { size } = world
  const { label, sizes } = landSizes(world)
  const cities = cityCentres(world)
  const candidates: { i: number; m: number; dx: number; dy: number }[] = []
  for (let y = spec.edgeClear; y < size - spec.edgeClear; y++) {
    for (let x = spec.edgeClear; x < size - spec.edgeClear; x++) {
      const i = y * size + x
      // Terrain and features only (the server's world has no heights): a mountain tile with open land right in front of it
      // is a foothill, never a snowy peak.
      if (world.terrain[i] !== Terrain.Mountain) continue
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const m = (y + dy) * size + x + dx
        if (!dry(world.terrain[m]) || world.feature[m] !== Feature.None || sizes[label[m]] < spec.minLand) continue
        // The tile beyond the mouth is open land too (the army has room to stand).
        const m2 = (y + dy * 2) * size + x + dx * 2
        if (!dry(world.terrain[m2]) || world.feature[m2] === Feature.City || world.feature[m2] === Feature.Inn) continue
        candidates.push({ i, m, dx, dy })
        break
      }
    }
  }
  const spots: CaveSpot[] = []
  for (let attempt = 0; attempt < 4000 && spots.length < spec.count && candidates.length > 0; attempt++) {
    const c = candidates[Math.floor(hash(attempt, 61, seed + 6101) * candidates.length) % candidates.length]
    const x = c.i % size
    const y = (c.i - x) / size
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < spec.minSpacing)) continue
    if (cities.some((p) => Math.hypot(p.x - x, p.y - y) < spec.cityClear)) continue
    spots.push({ idx: spots.length, x, y, mouth: { x: x + c.dx + 0.5, y: y + c.dy + 0.5 }, dx: c.dx, dy: c.dy })
  }
  bySeed.set(seed, spots)
  return spots
}

// The cave whose mouth or rock is at (or right by) a tile, if any.
export function caveAt(caves: CaveSpot[], tile: Point, reach = C().pickTiles) {
  let best: CaveSpot | undefined
  let bestD = reach
  for (const c of caves) {
    const d = Math.min(Math.hypot(c.x + 0.5 - (tile.x + 0.5), c.y + 0.5 - (tile.y + 0.5)), Math.hypot(c.mouth.x - (tile.x + 0.5), c.mouth.y - (tile.y + 0.5)))
    if (d <= bestD) [best, bestD] = [c, d]
  }
  return best
}

// ---- Clans --------------------------------------------------------------------------------------------------------

// A cave a clan was driven out of: which, when, by whom (a lord's id and name) and the clan's name.
export interface FallenCave {
  cave: number
  at: number
  by: number
  byName?: string
  name: string
}

// What the lobby keeps of a clan (lobby_outlaws, kind 'clan', idx = its slot); the server alone sees `cave`.
export interface ClanRowFields {
  gen?: number | null
  born_at?: number | null
  battle?: number | null
  // Defenders of the cave lost in sieges they held.
  losses?: number | null
  fallen?: FallenCave[] | null
  cave?: number | null
}

export interface Clan {
  slot: number
  // How many clans have held this slot before (a new one each time a cave falls).
  gen: number
  name: string
  // Its banner's colour.
  color: number
  // When it settled in its cave (ms); null: the lobby's first clans, there from the start.
  bornAt: number | null
  battle: number | null
  lost: number
  fallen: FallenCave[]
  // Only on the server.
  cave: number | null
}

const CLAN_FIRST = ['Kurt', 'Kara', 'Demir', 'Kızıl', 'Kanlı', 'Boz', 'Yırtıcı', 'Taş', 'Gece', 'Sırtlan', 'Akbaba', 'Kuzgun', 'Yılan', 'Çakal']
const CLAN_SECOND = ['pençe', 'diş', 'yele', 'kaya', 'kemik', 'balta', 'mağara', 'pusu', 'gölge', 'tırnak', 'boyun', 'yürek']
const CLAN_COLORS = [0x6b2a1e, 0x3b3f2a, 0x4a2a4a, 0x2a3a4a, 0x5a4a1e, 0x3a1e1e]
const pick = <T>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length]

export const clanName = (seed: number, slot: number, gen: number) => {
  const first = pick(CLAN_FIRST, hash(slot, 71 + gen * 3, seed + 6201))
  const second = pick(CLAN_SECOND, hash(slot, 72 + gen * 5, seed + 6203))
  return `${first}${second} klanı`
}
export const clanColor = (seed: number, slot: number, gen: number) => pick(CLAN_COLORS, hash(slot, 73 + gen, seed + 6207))

// The clan a band belongs to.
export const clanOfBand = (idx: number) => idx % K().count

type Rowish = { kind: string; idx: number } & ClanRowFields

export function clansOf(seed: number, rows?: Rowish[] | null): Clan[] {
  return Array.from({ length: K().count }, (_, slot) => {
    const row = rows?.find((r) => r.kind === 'clan' && r.idx === slot)
    const gen = row?.gen ?? 0
    return {
      slot,
      gen,
      name: clanName(seed, slot, gen),
      color: clanColor(seed, slot, gen),
      bornAt: row?.born_at === null || row?.born_at === undefined ? null : Number(row.born_at),
      battle: row?.battle === null || row?.battle === undefined ? null : Number(row.battle),
      lost: row?.losses ?? 0,
      fallen: row?.fallen ?? [],
      cave: row?.cave ?? null,
    }
  })
}

// Until when a new clan's bands have not yet taken the roads (the old clan's bands scattered as its cave fell).
export const clanBandsUntil = (clan: Pick<Clan, 'gen' | 'bornAt'>) => (clan.gen > 0 && clan.bornAt !== null ? clan.bornAt + K().bandDelaySeconds * 1000 : null)

// Hours the clan has been settled at `at` (the first clans count from the season's start: from their row's born_at,
// or none).
const ageHours = (clan: Pick<Clan, 'bornAt'>, at: number) => (clan.bornAt === null ? 0 : Math.max(0, at - clan.bornAt) / 3_600_000)

// How many guard the cave at `at`: drawn from the seed, growing as the clan settles in, less those lost in sieges.
export function clanGarrison(seed: number, clan: Pick<Clan, 'slot' | 'gen' | 'bornAt' | 'lost'>, at: number) {
  const [lo, hi] = K().garrison
  const base = lo + Math.floor(hash(clan.slot, 81 + clan.gen, seed + 6211) * (hi - lo + 1))
  const grown = Math.min(K().garrisonGrowCap, Math.floor((ageHours(clan, at) * 60) / K().garrisonGrowMinutes))
  return Math.max(1, base + grown - clan.lost)
}

// The hoard in the cave at `at`: a base, growing for some hours as the clan raids.
export function clanHoard(clan: Pick<Clan, 'bornAt'>, at: number) {
  const h = K().hoard
  const hours = Math.min(h.maxHours, ageHours(clan, at))
  return {
    gold: Math.round(h.gold + h.perHour.gold * hours),
    arms: Math.round(h.arms + h.perHour.arms * hours),
    materials: Math.round(h.materials + h.perHour.materials * hours),
    food: Math.round(h.food + h.perHour.food * hours),
  }
}

// The cave's defenders as a side of a battle (kingdom 0: no one's), at home in their own cave.
export function clanFighter(soldiers: number) {
  const archers = Math.round(soldiers * K().archerShare)
  return { kingdom: 0, army: null, soldiers, morale: K().morale, familiarity: K().familiarity, units: { spear: soldiers - archers, archer: archers }, outlaws: true }
}

// The cave a new clan settles in: drawn from the seed, the slot and its generation among the caves that are free (not
// held by another clan, never razed, and not too close to the lords' lands or the towns; `avoid`). With none free, any
// cave not held by another clan.
// `seed` here is a secret roll from the server (never the lobby seed, which every lord knows).
export function pickCave(caves: CaveSpot[], seed: number, slot: number, gen: number, held: number[], fallen: number[], avoid: (c: CaveSpot) => boolean) {
  const free = caves.filter((c) => !held.includes(c.idx) && !fallen.includes(c.idx) && !avoid(c))
  const pool = free.length > 0 ? free : caves.filter((c) => !held.includes(c.idx))
  if (pool.length === 0) return null
  return pool[Math.floor(hash(slot, 91 + gen, seed + 6221) * pool.length) % pool.length].idx
}

// ---- A lord on the trail ------------------------------------------------------------------------------------------

// What a lord knows of a clan's cave (in the lord's state, kept by the server): for which clan (its generation), how
// many of its bands the lord has beaten, and the hints won: the way to the mountains from the last fight (0–7, screen
// directions from north clockwise) after the first win, roughly how far after the second, the cave itself when found.
export interface CaveTrail {
  gen: number
  wins: number
  dir?: number
  far?: number
  from?: Point
  cave?: number
  foundAt?: number
}
export type CaveTrails = Record<number, CaveTrail>

// How many of a clan's bands a lord beats before finding its cave: fewer with a spy house.
export const winsToFind = (k: { buildings: { kind: string; doneAt: number }[] }, at: number) =>
  k.buildings.some((b) => b.kind === 'spyHouse' && b.doneAt <= at) ? K().discovery.spyHouseWins : K().discovery.wins

// The way from `from` to `to` on the screen (north is up), 0–7 clockwise from north.
export function screenDir(from: Point, to: Point) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const sx = dx - dy
  const sy = dx + dy
  const angle = Math.atan2(sx, -sy)
  return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
}
export const DIR_NAMES = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı']

// The trail after one more win over the clan's bands at `from`: the hint grows with each win, the cave is found at
// the last.
export function followTrail(trail: CaveTrail | undefined, gen: number, cave: CaveSpot, from: Point, need: number, at: number): CaveTrail {
  const t: CaveTrail = trail && trail.gen === gen ? { ...trail } : { gen, wins: 0 }
  if (t.cave !== undefined) return t
  t.wins += 1
  t.from = { x: Math.round(from.x), y: Math.round(from.y) }
  t.dir = screenDir(from, cave.mouth)
  if (t.wins >= 2 || t.wins >= need - 1) {
    const step = K().discovery.farStep
    t.far = Math.max(step, Math.round(Math.hypot(cave.mouth.x - from.x, cave.mouth.y - from.y) / step) * step)
  }
  if (t.wins >= need) {
    t.cave = cave.idx
    t.foundAt = at
  }
  return t
}

// The lord's trail for a clan as it stands now (one for an older clan of the slot counts for nothing).
export const trailOf = (trails: CaveTrails | null | undefined, clan: Pick<Clan, 'slot' | 'gen'>) => {
  const t = trails?.[clan.slot]
  return t && t.gen === clan.gen ? t : null
}
