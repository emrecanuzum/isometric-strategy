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
}

// What a kingdom holds, kept on its state for the round's sums: each town's id and what it sends.
export interface HeldTown {
  id: number
  kind: TownKind
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

// What the held towns send in one round (before the idle penalty), and the villagers the "people" towns add.
export function townYield(held: HeldTown[] | undefined) {
  const out = { gold: 0, food: 0, materials: 0, arms: 0, villagers: 0 }
  for (const h of held ?? []) {
    const spec = balance.towns.kinds[h.kind] as { perRound?: number; villagers?: number }
    if (h.kind === 'people') out.villagers += spec.villagers ?? 0
    else out[h.kind] += spec.perRound ?? 0
  }
  return out
}

// Some towns stand behind a wooden palisade (drawn from the lobby seed): weaker than a kingdom's stone walls, it makes
// a siege last longer and costs the besiegers more soldiers.
export const townWalled = (seed: number, idx: number) => hash(idx, 9, seed + 3021) < balance.towns.palisade.share

// The soldiers an army loses taking a free town from its garrison (more behind a palisade).
export const townLosses = (garrison: number, walled = false) =>
  Math.ceil(garrison * balance.towns.lossPerDefender * (walled ? balance.towns.palisade.lossFactor : 1))

// How long a siege of the town lasts (ms).
export const townSiegeMs = (walled: boolean) => balance.towns.siegeSeconds * 1000 * (walled ? balance.towns.palisade.siegeFactor : 1)
