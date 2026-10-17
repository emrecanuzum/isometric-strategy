import { balance } from './balance'
import { changeCrownRelation, crownRelation } from './crowns'
import { ageOf, holderOf, houseRoll, kinOf, mapHouse, marriedOf, ofAge, rulerSkills, siblingsOf } from './dynasty'
import type { Bride, Dynasty, KinRoleKind, Person } from './dynasty'
import { happinessOf, palaceLevel } from './economy'
import type { Kingdom } from './economy'
import type { Point } from './iso'
import { territoryRect } from './territory'
import type { HeldTown } from './towns'
import { countOf, garrisonOf, takeShare } from './units'
import { Feature, Terrain } from './worldgen'

// Intrigue in the lord's house (CLAUDE.md §9.1.1): every grown man of the house thinks something of the ruler (and the
// liege crown of him); the lord gives his kin posts and gifts, marries off his daughters and sisters, and a brother who
// hates him enough may rise as a pretender, raise a camp near the realm and in the end march on the palace. Opinions
// are kept as an offset from where they rest, fading with time, so they follow from the kingdom and the clock; what the
// server decides (a revolt, a battle) it decides from seeded draws, once.

const I = () => balance.dynasty.intrigue
const O = () => I().opinion
const clamp = (v: number) => Math.max(-100, Math.min(100, v))
const round1 = (v: number) => Math.round(v * 10) / 10

export type Kinship = 'child' | 'sibling' | 'kin'

// How a member of the house at court stands to the ruler.
export function kinshipOf(d: Dynasty | undefined, id: number): Kinship | null {
  if (!d) return null
  if (d.children.some((c) => c.id === id)) return 'child'
  if (siblingsOf(d).some((c) => c.id === id)) return 'sibling'
  if (kinOf(d).some((c) => c.id === id)) return 'kin'
  return null
}

// The ruler's children and brothers and sisters: the ones the lord gives posts and marries off.
const closeOf = (d: Dynasty, id: number) => d.children.find((c) => c.id === id) ?? siblingsOf(d).find((c) => c.id === id)

// Who has a say: the grown men of the house (sons, brothers, kin).
export const hasOpinion = (p: Person, at: number) => p.sex === 'm' && ofAge(p, at)

export interface OpinionPart {
  key: 'base' | 'ruler' | 'happiness' | 'role' | 'elder' | 'council' | 'mother' | 'ambition' | 'commander' | 'military' | 'marriage' | 'recent'
  value: number
}

type HouseKingdom = Pick<Kingdom, 'dynasty' | 'happiness' | 'liege' | 'site' | 'foundedAt'>

// What a man of the house thinks of the ruler, part by part (where it rests), and the liege crown of him.
export function opinionParts(k: HouseKingdom, p: Person): { ruler: OpinionPart[]; crown: OpinionPart[] } {
  const d = k.dynasty
  const o = O()
  const kin = kinshipOf(d, p.id) ?? 'kin'
  const r = rulerSkills(k)
  const avg = (r.finance + r.people + r.military) / 3
  const ruler: OpinionPart[] = [
    { key: 'base', value: o.base[kin] },
    { key: 'ruler', value: round1((avg - balance.dynasty.skills.center) * o.rulerSkillWeight) },
    { key: 'happiness', value: round1((happinessOf(k as Kingdom) - 50) * o.happinessWeight) },
    { key: 'ambition', value: round1((houseRoll(k, p.id, 91) * 2 - 1) * o.ambition - Math.max(0, p.skills.military - 6) * o.ambitionPerMilitary) },
  ]
  if (p.role) ruler.push({ key: 'role', value: o.role })
  if (kin === 'sibling' && d?.king && p.bornAt < d.king.bornAt) ruler.push({ key: 'elder', value: o.elder })
  if (kin === 'sibling' && d?.council) ruler.push({ key: 'council', value: o.council })
  if (kin === 'sibling' && d?.mother) ruler.push({ key: 'mother', value: o.mother })
  const crown: OpinionPart[] = []
  if (k.liege !== undefined && k.liege !== null) {
    const b = I().crownBond
    crown.push({ key: 'military', value: (p.skills.military - balance.dynasty.skills.center) * b.militaryWeight })
    if (p.role?.kind === 'commander') crown.push({ key: 'commander', value: b.commander })
    const wed = d ? marriedOf(d).filter((m) => m.married?.kind === 'crown' && m.married.crown === k.liege).length : 0
    if (wed) crown.push({ key: 'marriage', value: wed * b.marriage })
  }
  return { ruler, crown }
}

const sum = (parts: OpinionPart[]) => parts.reduce((n, x) => n + x.value, 0)
const fade = (op: Person['op'], at: number) => (op ? 0.5 ** (Math.max(0, at - op.at) / (O().halfLifeMinutes * 60_000)) : 0)

// What a man of the house thinks of the ruler now (−100…100), and how the liege crown thinks of him; `recent`: what
// gifts, slights and the like still add (fading).
export function opinionOf(k: HouseKingdom, p: Person, at: number) {
  const parts = opinionParts(k, p)
  const f = fade(p.op, at)
  const recent = (p.op?.off ?? 0) * f
  const crownRecent = (p.op?.crown ?? 0) * f
  return { ruler: Math.round(clamp(sum(parts.ruler) + recent)), crown: Math.round(clamp(sum(parts.crown) + crownRecent)), recent: Math.round(recent), parts }
}

// A member of the house with his feelings moved by `ruler` (and the crown's of him by `crown`), from where they stand now.
function nudge(p: Person, at: number, ruler: number, crown = 0): Person {
  const f = fade(p.op, at)
  return { ...p, op: { off: (p.op?.off ?? 0) * f + ruler, crown: (p.op?.crown ?? 0) * f + crown, at } }
}

const withMember = (k: Kingdom, id: number, fn: (p: Person) => Person): Kingdom => (k.dynasty ? { ...k, dynasty: mapHouse(k.dynasty, (p) => (p.id === id ? fn(p) : p)) } : k)

// ---- Posts --------------------------------------------------------------------------------------------------------

export type RoleError = 'none' | 'age' | 'sex' | 'liege' | 'town' | 'taken' | 'rejected'

// A grown son, daughter, brother or sister of the ruler may hold one post: governor of a town the lord holds (one each),
// commander of the liege crown's patrol (a man; one), treasurer (one). `role` null takes a post away.
export function roleError(k: Pick<Kingdom, 'dynasty' | 'liege' | 'towns'>, id: number, role: KinRoleKind | null, at: number, town?: number): RoleError | null {
  const d = k.dynasty
  const p = d && closeOf(d, id)
  if (!d || !p) return 'none'
  if (role === null) return p.role ? null : 'rejected'
  if (!['governor', 'commander', 'treasurer'].includes(role)) return 'rejected'
  if (ageOf(p, at) < I().roles.minAge) return 'age'
  if (role === 'commander' && p.sex !== 'm') return 'sex'
  if (role === 'commander' && (k.liege === undefined || k.liege === null)) return 'liege'
  if (role === 'governor' && !(k.towns ?? []).some((t) => t.id === town)) return 'town'
  const holder = holderOf(d, role, town)
  if (holder && holder.id !== id) return 'taken'
  if (holder?.id === id) return 'rejected'
  return null
}

export function assignRole(k: Kingdom, id: number, role: KinRoleKind | null, at: number, town?: number): Kingdom {
  if (roleError(k, id, role, at, town)) return k
  return withMember(k, id, (p) => {
    if (role === null) {
      const { role: _gone, ...rest } = p
      // Stripped of his post, he takes it ill.
      return p.sex === 'm' ? nudge(rest, at, O().roleRemoved) : rest
    }
    return { ...p, role: role === 'governor' ? { kind: 'governor', town: town!, since: at } : { kind: role, since: at } }
  })
}

// A governor whose town has been lost: his post lapses (kept until the lord gives him another or takes it away).
export const roleLapsed = (k: Pick<Kingdom, 'towns'>, p: Person) => p.role?.kind === 'governor' && !(k.towns ?? []).some((t) => t.id === (p.role as { town: number }).town)

// ---- Gifts --------------------------------------------------------------------------------------------------------

export type GiftError = 'none' | 'cost' | 'cooldown'

export function giftError(k: Kingdom, id: number, at: number): GiftError | null {
  const d = k.dynasty
  const p = d && [...d.children, ...siblingsOf(d), ...kinOf(d)].find((c) => c.id === id)
  if (!p || !hasOpinion(p, at)) return 'none'
  if (k.stock.gold < I().gift.gold) return 'cost'
  if (p.giftAt !== undefined && at - p.giftAt < I().gift.cooldownSeconds * 1000) return 'cooldown'
  return null
}

// Gold for a brother (or son, or kinsman): he warms to the ruler for a while.
export function giftKin(k: Kingdom, id: number, at: number): Kingdom {
  if (giftError(k, id, at)) return k
  const paid = { ...k, stock: { ...k.stock, gold: k.stock.gold - I().gift.gold } }
  return withMember(paid, id, (p) => ({ ...nudge(p, at, I().gift.opinion), giftAt: at }))
}

// ---- Marriages ----------------------------------------------------------------------------------------------------

export type MarryTarget = { kind: 'crown' } | { kind: 'town'; town: number; name: string; free: boolean } | { kind: 'lord'; id: number; name: string }
export type MarryError = 'none' | 'sex' | 'age' | 'liege' | 'cost' | 'town'

// A daughter or sister of the ruler, grown, still at court.
export function brideError(k: Pick<Kingdom, 'dynasty'>, id: number, at: number): 'none' | 'sex' | 'age' | null {
  const d = k.dynasty
  const p = d && closeOf(d, id)
  if (!p) return 'none'
  if (p.sex !== 'f') return 'sex'
  if (!ofAge(p, at)) return 'age'
  return null
}

export const dowryOf = (target: MarryTarget['kind']) => (target === 'crown' ? I().marriage.crown.dowry : target === 'town' ? I().marriage.town.dowry : 0)

export function marryError(k: Kingdom, id: number, target: MarryTarget, at: number): MarryError | null {
  const bride = brideError(k, id, at)
  if (bride) return bride
  if (target.kind === 'crown' && (k.liege === undefined || k.liege === null)) return 'liege'
  if (target.kind === 'town' && !target.free && !(k.towns ?? []).some((t) => t.id === target.town)) return 'town'
  if (k.stock.gold < dowryOf(target.kind)) return 'cost'
  return null
}

// The bride leaves the house for her husband's: to the liege crown's (the crown warms to the lord), to a town's first
// family (the town is the more loyal; a free town comes over to the lord, `held` its new holding), or to another lord's
// house (the server does that one once he says yes; see diplomacy).
export function marry(k: Kingdom, id: number, target: MarryTarget, at: number, held?: HeldTown): Kingdom {
  if (marryError(k, id, target, at) || !k.dynasty) return k
  const d = k.dynasty
  const bride = closeOf(d, id)!
  const { role: _role, ...rest } = bride
  const married: Person = {
    ...rest,
    married: target.kind === 'crown' ? { kind: 'crown', crown: k.liege!, name: '', at } : target.kind === 'town' ? { kind: 'town', id: target.town, name: target.name, at } : { kind: 'lord', id: target.id, name: target.name, at },
  }
  const dynasty: Dynasty = {
    ...d,
    children: d.children.filter((c) => c.id !== id),
    siblings: siblingsOf(d).filter((c) => c.id !== id),
    married: [married, ...marriedOf(d)].slice(0, 8),
  }
  let next: Kingdom = { ...k, dynasty, stock: { ...k.stock, gold: k.stock.gold - dowryOf(target.kind) } }
  if (target.kind === 'crown') next = changeCrownRelation(next, k.liege!, I().marriage.crown.relation)
  if (target.kind === 'town' && target.free && held) next = { ...next, towns: [...(next.towns ?? []).filter((t) => t.id !== held.id), { ...held, loyalty: I().marriage.town.freeLoyalty }] }
  return next
}

// A lady of another house married into this one (she joins the lord's court as his kin by marriage).
export function receiveBride(k: Kingdom, bride: Bride): Kingdom {
  if (!k.dynasty) return k
  return { ...k, dynasty: { ...k.dynasty, brides: [bride, ...(k.dynasty.brides ?? [])].slice(0, 8) } }
}

// ---- Pretenders ---------------------------------------------------------------------------------------------------

export interface Pretender {
  // The brother who rose.
  person: Person
  // His camp: the middle tile of its square.
  at: Point
  since: number
  // Soldiers he rose with (rebels and the garrison's deserters), and those he has lost since (battles, the crown's
  // troops).
  start: number
  lost: number
  deserters?: number
  // When he marches on the palace if the camp still stands.
  marchAt: number
  // The liege crown backs him (it thinks more of him than of the lord), and which crown that was.
  backed: boolean
  crown?: number
  // The battle fought at the camp or the palace now (its id), and whether he is besieging the palace.
  battle?: number | null
  marching?: boolean
  // Growth warnings told (how many of balance.dynasty.intrigue.revolt.warnShares), and the help asked of the crown.
  told?: number
  asked?: { troops?: number; gold?: number }
}

const V = () => I().revolt

export const revoltSlotMs = () => V().checkMinutes * 60_000

// The men of the house of age who are unhappy enough to be warned of, and those content again (warned before).
export function unhappyKin(k: HouseKingdom, at: number) {
  const d = k.dynasty
  if (!d) return { unhappy: [] as { person: Person; opinion: number; kinship: Kinship }[], calm: [] as number[] }
  const unhappy: { person: Person; opinion: number; kinship: Kinship }[] = []
  const calm: number[] = []
  for (const p of [...d.children, ...siblingsOf(d)]) {
    if (!hasOpinion(p, at)) continue
    const op = opinionOf(k, p, at).ruler
    if (op < O().warn && !p.warned) unhappy.push({ person: p, opinion: op, kinship: kinshipOf(d, p.id)! })
    else if (op >= O().calm && p.warned) calm.push(p.id)
  }
  return { unhappy, calm }
}

export function markWarned(k: Kingdom, warned: number[], calm: number[]): Kingdom {
  if (!k.dynasty || (warned.length === 0 && calm.length === 0)) return k
  return { ...k, dynasty: mapHouse(k.dynasty, (p) => (warned.includes(p.id) ? { ...p, warned: true } : calm.includes(p.id) ? { ...p, warned: undefined } : p)) }
}

// Whether a brother rises in this revolt check (one every few minutes): brothers of age who think little enough of the
// ruler, each with a chance the deeper his grudge; none while a pretender is out, the house is quiet after one, or the
// palace is young. `checked`: someone was unhappy enough to roll for (the slot is then kept, so it is rolled once).
export function revoltCandidate(k: Kingdom, at: number): { person: Person | null; slot: number; checked: boolean } {
  const slot = Math.floor(at / revoltSlotMs())
  const d = k.dynasty
  const none = { person: null, slot, checked: false }
  if (!d?.king || k.pretender || (d.quietUntil ?? 0) > at || d.revoltSlot === slot) return none
  if (palaceLevel(k, at) < V().minPalaceLevel) return none
  const brothers = siblingsOf(d)
    .filter((p) => hasOpinion(p, at))
    .map((p) => ({ p, op: opinionOf(k, p, at).ruler }))
    .filter((x) => x.op < V().below)
    .sort((a, b) => a.op - b.op)
  if (brothers.length === 0) return none
  for (const { p, op } of brothers) {
    const chance = Math.min(V().maxChance, V().baseChance + (V().below - op) * V().chancePerPoint)
    if (houseRoll(k, p.id, slot % 1_000_000, 97) < chance) return { person: p, slot, checked: true }
  }
  return { person: null, slot, checked: true }
}

export const keepRevoltSlot = (k: Kingdom, slot: number): Kingdom => (k.dynasty ? { ...k, dynasty: { ...k.dynasty, revoltSlot: slot } } : k)

// Whether the liege crown would back the pretender: it thinks more of him than of the lord.
export function crownBacks(k: Kingdom, p: Person, at: number) {
  if (k.liege === undefined || k.liege === null) return false
  return opinionOf(k, p, at).crown > crownRelation(k, k.liege) + V().backMargin
}

// The pretender's soldiers at `at`: those he rose with, more every minute the camp stands (faster with the crown behind
// him, and the crown's own men), less those he has lost.
export function campSoldiers(p: Pick<Pretender, 'start' | 'since' | 'marchAt' | 'backed' | 'lost'>, at: number) {
  const v = V()
  const minutes = Math.max(0, Math.min(at, p.marchAt) - p.since) / 60_000
  const grown = Math.floor(minutes * v.growthPerMinute * (p.backed ? v.backedGrowth : 1)) + (p.backed ? v.backedTroops : 0)
  return Math.max(0, Math.min(v.max, p.start + grown) - (p.lost ?? 0))
}

// The pretender's men as a side of a battle: no one's (kingdom 0), spearmen and bowmen who know their camp.
export function pretenderFighter(p: Pretender, at: number) {
  const soldiers = campSoldiers(p, at)
  const archers = Math.floor(soldiers * 0.35)
  return {
    kingdom: 0,
    army: null,
    soldiers,
    morale: V().morale,
    familiarity: V().familiarity,
    units: { spear: soldiers - archers, archer: archers },
    rebels: true,
    pretender: p.person.name,
  }
}

// A brother rises: he leaves the house with some of the garrison and raises his camp at `camp`. The draws are the
// kingdom's and the brother's, so the server decides it once.
export function raisePretender(k: Kingdom, id: number, at: number, camp: Point): { kingdom: Kingdom; pretender: Pretender } | null {
  const d = k.dynasty
  const p = d && siblingsOf(d).find((c) => c.id === id)
  if (!d || !p || k.pretender) return null
  const v = V()
  const garrison = garrisonOf(k)
  const deserters = Math.min(v.maxDeserters, Math.floor(countOf(garrison) * v.deserterShare))
  const { left } = takeShare(garrison, deserters)
  const [lo, hi] = v.rebels
  const raised = lo + Math.floor(houseRoll(k, p.id, 101) * (hi - lo + 1)) + v.perPalaceLevel * palaceLevel(k, at)
  const backed = crownBacks(k, p, at)
  const { role: _role, warned: _warned, ...person } = p
  const pretender: Pretender = {
    person,
    at: camp,
    since: at,
    start: raised + deserters,
    lost: 0,
    deserters,
    marchAt: at + v.growMinutes * 60_000,
    backed,
    ...(k.liege !== undefined && k.liege !== null && { crown: k.liege }),
    battle: null,
    told: 0,
  }
  const units = left
  return {
    kingdom: { ...k, units, soldiers: countOf(units), pretender, dynasty: { ...d, siblings: siblingsOf(d).filter((c) => c.id !== id) } },
    pretender,
  }
}

// The pretender beaten (at his camp or before the palace): he dies, his men scatter, the house is quiet for a while.
export function crushPretender(k: Kingdom, at: number): Kingdom {
  const p = k.pretender
  if (!p || !k.dynasty) return { ...k, pretender: undefined }
  const dead: Person = { ...p.person, diedAt: at, deathAt: Math.min(p.person.deathAt, at), cause: 'rebel', ruled: false }
  return {
    ...k,
    pretender: undefined,
    dynasty: { ...k.dynasty, dead: [dead, ...k.dynasty.dead].slice(0, balance.dynasty.keepDead), quietUntil: at + V().quietMinutes * 60_000 },
  }
}

// A battle against the pretender lost by the lord: he keeps his camp, fewer by those who fell.
export const pretenderLosses = (k: Kingdom, lost: number): Kingdom =>
  k.pretender ? { ...k, pretender: { ...k.pretender, lost: (k.pretender.lost ?? 0) + Math.max(0, lost), battle: null, marching: k.pretender.marching } } : k

// The pretender takes the palace: he is the ruler now. The lord he threw down is among the dead; his lady leaves court;
// his children are the new ruler's nephews and nieces. The house goes on under the pretender (his line from now on).
// `survivors`: the pretender's men left standing, who become the garrison.
export function usurp(k: Kingdom, at: number, survivors: number): Kingdom {
  const p = k.pretender
  const d = k.dynasty
  if (!p || !d) return { ...k, pretender: undefined }
  const old = d.king
  const dead = old ? [{ ...old, diedAt: at, deathAt: Math.min(old.deathAt, at), cause: 'deposed' as const, ruled: true }] : []
  const garrison = garrisonOf(k)
  const units = { ...garrison, spear: (garrison.spear ?? 0) + Math.max(0, survivors) }
  return {
    ...k,
    pretender: undefined,
    queen: false,
    units,
    soldiers: countOf(units),
    dynasty: {
      ...d,
      king: { ...p.person, grown: true },
      queen: null,
      children: [],
      kin: [...kinOf(d), ...d.children],
      dead: [...dead, ...d.dead].slice(0, balance.dynasty.keepDead),
      council: false,
      regentFor: undefined,
      kinsmanAt: undefined,
      nextBirthAt: null,
      sons: 0,
      daughters: 0,
      born: 0,
      generation: d.generation + 1,
      quietUntil: at + V().quietMinutes * 60_000,
    },
  }
}

// ---- The crown's help against a pretender -------------------------------------------------------------------------

export type AidKind = 'troops' | 'gold'
export type AidError = 'none' | 'liege' | 'asked' | 'backed' | 'relation'

export function aidError(k: Kingdom, kind: AidKind): AidError | null {
  const p = k.pretender
  if (!p) return 'none'
  if (k.liege === undefined || k.liege === null) return 'liege'
  if (p.asked?.[kind] !== undefined) return 'asked'
  return null
}

// What the liege crown does when asked: refuses (it backs the pretender, or does not think enough of the lord), or
// sends soldiers against the camp or gold, more the better it thinks of the lord; either way the favour costs a little.
// Refusals are kept too (asked once each per pretender).
export function askAid(k: Kingdom, kind: AidKind, at: number): { kingdom: Kingdom; granted: boolean; why?: 'backed' | 'relation'; troops?: number; gold?: number } {
  if (aidError(k, kind)) return { kingdom: k, granted: false }
  const a = I().aid
  const p = k.pretender!
  const crown = k.liege!
  const relation = crownRelation(k, crown)
  const asked = { ...p.asked, [kind]: at }
  if (p.backed || crownBacks(k, p.person, at)) return { kingdom: { ...k, pretender: { ...p, asked, backed: true } }, granted: false, why: 'backed' }
  if (relation < a.minRelation) return { kingdom: { ...k, pretender: { ...p, asked } }, granted: false, why: 'relation' }
  const scale = 0.5 + relation / 100
  const charged = changeCrownRelation(k, crown, -a.relationCost)
  if (kind === 'troops') {
    const troops = Math.max(1, Math.round(a.troops * scale))
    return { kingdom: { ...charged, pretender: { ...p, asked, lost: (p.lost ?? 0) + troops } }, granted: true, troops }
  }
  const gold = Math.round(a.gold * scale)
  return { kingdom: { ...charged, stock: { ...charged.stock, gold: charged.stock.gold + gold }, pretender: { ...p, asked } }, granted: true, gold }
}

// ---- Where the camp goes ------------------------------------------------------------------------------------------

interface TileWorld {
  size: number
  terrain: Uint8Array
  feature: Uint8Array
}

// A spot for the pretender's camp: open dry land a fair way outside the realm's grown lands (5×5 tiles clear of water,
// mountains, roads, inns and cities, and of whatever `blocked` says: other lands, towns), tried round the realm from a
// seeded angle.
export function campSpot(world: TileWorld, k: Kingdom, at: number, blocked: (x: number, y: number) => boolean): Point | null {
  const { size, terrain, feature } = world
  const rect = territoryRect(k.site, balance.territory.stageParcels.length - 1)
  const cx = rect.x + rect.size / 2
  const cy = rect.y + rect.size / 2
  const [near, far] = V().campTiles
  const clear = (x0: number, y0: number) => {
    for (let y = y0 - 2; y <= y0 + 2; y++) {
      for (let x = x0 - 2; x <= x0 + 2; x++) {
        if (x < 4 || y < 4 || x >= size - 4 || y >= size - 4) return false
        const i = y * size + x
        const t = terrain[i]
        if (t !== Terrain.Grass && t !== Terrain.Forest && t !== Terrain.Desert) return false
        if (feature[i] !== Feature.None || blocked(x, y)) return false
      }
    }
    return true
  }
  const start = houseRoll(k, Math.floor(at / 60_000) % 1_000_000, 103) * Math.PI * 2
  for (let ring = near; ring <= far + 12; ring += 2) {
    const reach = rect.size / 2 + ring
    for (let step = 0; step < 24; step++) {
      const angle = start + (step * Math.PI * 2) / 24
      const x = Math.round(cx + Math.cos(angle) * reach)
      const y = Math.round(cy + Math.sin(angle) * reach)
      if (clear(x, y)) return { x, y }
    }
  }
  return null
}

// How big the camp looks (0–3): tents added as it grows.
export const campTier = (soldiers: number) => (soldiers >= 50 ? 3 : soldiers >= 32 ? 2 : soldiers >= 18 ? 1 : 0)

// Whether a point is at the camp (an army sent there attacks it).
export const atCamp = (p: Pick<Pretender, 'at'>, q: Point, tiles = V().attackTiles) => Math.hypot(q.x - p.at.x, q.y - p.at.y) <= tiles
