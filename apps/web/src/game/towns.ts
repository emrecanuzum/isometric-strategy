import { balance, hash } from '@game/shared'
import type { Point, Town, TownKind } from '@game/shared'
import type { Structure, StructureLook } from './buildingSprites'
import { palisade } from './campSprites'

// The towns on the map (CLAUDE.md §8.4), drawn with the kingdoms' own buildings: a cluster of houses round a building
// that shows what the town sends (a market for gold, a granary for food, a sawmill, a forge, a temple where people
// gather), and a watchtower at its corner. The layout follows from the town's place, so everyone sees the same town.

const CENTER: Record<TownKind, StructureLook> = {
  gold: 'market',
  food: 'warehouse',
  materials: 'lumberCamp',
  arms: 'forge',
  people: 'temple',
}

export const TOWN_KIND_NAMES: Record<TownKind, string> = {
  gold: 'Vergi kasabası',
  food: 'Tarım kasabası',
  materials: 'Kereste kasabası',
  arms: 'Demirci kasabası',
  people: 'Kalabalık kasaba',
}

// What a town sends its lord, in words.
export function townGift(kind: TownKind) {
  const spec = balance.towns.kinds[kind] as { perRound?: number; villagers?: number }
  const n = (v = 0) => v.toLocaleString('tr-TR')
  if (kind === 'people') return `${n(spec.villagers)} köylülük yer (halk o yeri zamanla doldurur)`
  const what = { gold: 'altın', food: 'yemek', materials: 'yapı malzemesi', arms: 'savaş malzemesi' }[kind]
  return `tur başına +${n(spec.perRound)} ${what}`
}

// The wooden palisade some towns stand behind (see townWalled): stakes on the tiles round the town, open where the
// lane leaves at the front.
const fences = { x: palisade('x'), y: palisade('y') }
function townPalisade(town: Town): Structure[] {
  const S = balance.towns.size
  const out: Structure[] = []
  const stake = (x: number, y: number, along: 'x' | 'y') =>
    out.push({ x: town.x + x, y: town.y + y, size: 1, look: 'house', variant: 0, sprite: fences[along] })
  for (let t = -1; t <= S; t++) {
    stake(t, -1, 'x')
    if (t < 3 || t > 4) stake(t, S, 'x')
  }
  for (let t = 0; t < S; t++) stake(-1, t, 'y'), stake(S, t, 'y')
  return out
}

export function townStructures(town: Town, walled = false): Structure[] {
  const S = balance.towns.size
  const out: Structure[] = walled ? townPalisade(town) : []
  const roll = (n: number, m = 0) => hash(town.x * 31 + n, town.y * 17 + m, 7717)
  const taken = new Uint8Array(S * S)
  const take = (x: number, y: number, size: number) => {
    for (let yy = y; yy < y + size; yy++) for (let xx = x; xx < x + size; xx++) taken[yy * S + xx] = 1
  }
  const add = (x: number, y: number, size: number, look: StructureLook, level = 1, variant = 0) => {
    out.push({ x: town.x + x, y: town.y + y, size, look, level, variant })
    take(x, y, size)
  }
  // The building in the middle, with a little square round it.
  add(3, 3, 2, CENTER[town.kind], 2, Math.floor(roll(1) * 4))
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) taken[y * S + x] = 1
  // A lane from the square out the front, left open.
  for (let y = 6; y < S; y++) taken[y * S + 3] = taken[y * S + 4] = 1
  add(0, 0, 1, 'watchtower', 1, Math.floor(roll(2) * 2))
  // Houses in the rest, most spots taken, a few left as yards.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (taken[y * S + x] || roll(x + 10, y) < 0.45) continue
      const r = roll(x + 40, y + 40)
      add(x, y, 1, 'house', r < 0.25 ? 3 : r < 0.6 ? 2 : 1, Math.floor(r * 97))
    }
  }
  return out
}

// The lanes worn in a town: from the gate in front up to the square.
export function townTrails(town: Town): Point[][] {
  const S = balance.towns.size
  return [[{ x: town.x + S / 2, y: town.y + S + 0.5 }, { x: town.x + S / 2, y: town.y + S / 2 + 1 }]]
}
