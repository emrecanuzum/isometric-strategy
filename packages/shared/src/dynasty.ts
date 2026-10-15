import { balance } from './balance'
import type { Kingdom } from './economy'

// The lord's house (CLAUDE.md §9.1): the ruling lord, the lady, their children. They age (a dynasty year is a few
// real hours), have children while the lady is at court, and die: of old age at an age drawn when they are born, or
// (now and then) of grief after a lost battle. The eldest son follows his father; with no son, or one too young, a
// council of regents rules. The ruler's and the lady's gifts for finance, the people and war turn into small gains or
// losses across the realm. Everything follows from the kingdom and the clock; the server and the client agree.

const D = () => balance.dynasty

export type Skill = 'finance' | 'people' | 'military'
export const SKILLS: Skill[] = ['finance', 'people', 'military']
export type Skills = Record<Skill, number>

export interface Person {
  id: number
  name: string
  sex: 'm' | 'f'
  // When born (ms), so a person's age follows from the clock.
  bornAt: number
  skills: Skills
  // When old age takes them (drawn at birth); sooner if grief does.
  deathAt: number
  // A child's upbringing: the gift its tutors work on (added when it comes of age).
  education?: Skill
  // Whether the lord has named the child (a name is drawn until then), and whether its coming of age was told.
  named?: boolean
  grown?: boolean
  // How a dead member of the house died.
  cause?: 'age' | 'grief'
  diedAt?: number
}

export interface Dynasty {
  seq: number
  king: Person | null
  queen: Person | null
  children: Person[]
  // The house's dead, the latest first (a few).
  dead: Person[]
  // A council of regents rules: no heir, or the heir is not of age yet (`regentFor`: the young ruler's id).
  council?: boolean
  regentFor?: number
  nextBirthAt?: number | null
  // Children the lord and his lady have had (the births stop at a few).
  born?: number
  // Rulers so far, the first lord counting as one.
  generation: number
}

export type DynastyEvent =
  | { kind: 'dynasty'; what: 'birth'; person: Person }
  | { kind: 'dynasty'; what: 'death'; person: Person; heir: Person | null; council: boolean }
  | { kind: 'dynasty'; what: 'ofAge'; person: Person }
  | { kind: 'dynasty'; what: 'coronation'; person: Person }
  | { kind: 'dynasty'; what: 'wedding'; person: Person }

export const yearMs = () => D().yearHours * 3_600_000
export const ageOf = (p: Pick<Person, 'bornAt'>, at: number) => Math.max(0, (at - p.bornAt) / yearMs())
export const ofAge = (p: Pick<Person, 'bornAt'>, at: number) => ageOf(p, at) >= D().comingOfAge

// A number from 0 to 1, from the kingdom and a few salts.
function roll(k: Pick<Kingdom, 'site' | 'foundedAt'>, ...salt: number[]) {
  let h = 0x811c9dc5
  for (const v of [k.site.x, k.site.y, Math.floor((k.foundedAt ?? 0) / 1000), ...salt]) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  // Mixed once more, so the last salt reaches every bit.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const between = (r: number, [lo, hi]: readonly number[]) => lo + (hi - lo) * r
const clampSkill = (v: number) => Math.max(0, Math.min(D().skills.max, Math.round(v)))

function person(k: Pick<Kingdom, 'site' | 'foundedAt'>, id: number, sex: 'm' | 'f', bornAt: number, skills: Skills, taken: string[] = []): Person {
  // A name none of the living family bears.
  const names = D().names[sex]
  const first = Math.floor(roll(k, id, 11) * names.length)
  let name = names[first]
  for (let i = 0; i < names.length && taken.includes(name); i++) name = names[(first + i + 1) % names.length]
  const deathAge = between(roll(k, id, 13) ** 0.8, D().death.atAge)
  return { id, name, sex, bornAt, skills, deathAt: bornAt + deathAge * yearMs() }
}

const drawnSkills = (k: Pick<Kingdom, 'site' | 'foundedAt'>, id: number): Skills => ({
  finance: clampSkill(1 + roll(k, id, 21) * 9),
  people: clampSkill(1 + roll(k, id, 22) * 9),
  military: clampSkill(1 + roll(k, id, 23) * 9),
})

// The house as it begins: a lord in his prime (and his lady, if the realm already has one).
export function foundDynasty(k: Pick<Kingdom, 'site' | 'foundedAt' | 'queen'>, at: number): Dynasty {
  const born = (k.foundedAt ?? at) - between(roll(k, 1, 1), D().king.age) * yearMs()
  const dynasty: Dynasty = { seq: 2, king: person(k, 1, 'm', born, drawnSkills(k, 1)), queen: null, children: [], dead: [], generation: 1 }
  return k.queen ? wed(k, dynasty, k.foundedAt ?? at) : dynasty
}

// A lady comes to court: the first child follows within a year or so.
function wed(k: Pick<Kingdom, 'site' | 'foundedAt'>, d: Dynasty, at: number): Dynasty {
  const id = d.seq
  const queen = person(k, id, 'f', at - between(roll(k, id, 2), D().queen.age) * yearMs(), drawnSkills(k, id), [d.king, ...d.children].filter((p): p is Person => !!p).map((p) => p.name))
  return { ...d, seq: id + 1, queen, born: 0, nextBirthAt: at + between(roll(k, id, 3), D().births.firstYears) * yearMs() }
}

// A child: its gifts drawn half from its parents, half anew.
function bear(k: Pick<Kingdom, 'site' | 'foundedAt'>, d: Dynasty, at: number): Person {
  const id = d.seq
  const sex = roll(k, id, 4) < D().births.son ? 'm' : 'f'
  const fresh = drawnSkills(k, id)
  const w = D().skills.inherit
  const parent = (s: Skill) => ((d.king?.skills[s] ?? 5) + (d.queen?.skills[s] ?? 5)) / 2
  const skills = Object.fromEntries(SKILLS.map((s) => [s, clampSkill(parent(s) * w + fresh[s] * (1 - w))])) as Skills
  const family = [d.king, d.queen, ...d.children].filter((p): p is Person => !!p).map((p) => p.name)
  return person(k, id, sex, at, skills, family)
}

// What the realm's ruler brings: the lord's gifts (with half the lady's above or below the middle), or the council's.
export function rulerSkills(k: Pick<Kingdom, 'dynasty'>): Skills & { council: boolean } {
  const d = k.dynasty
  if (!d || d.council || !d.king) return { ...(D().council as Skills), council: true }
  const c = D().skills.center
  const w = D().skills.queenWeight
  const out = { ...d.king.skills }
  if (d.queen) for (const s of SKILLS) out[s] = out[s] + (d.queen.skills[s] - c) * w
  return { ...out, council: false }
}

// The gains and losses the ruler's gifts give: tax and trade gold, the people's mood and work, the soldiers' dice and
// pay.
export function dynastyEffects(k: Pick<Kingdom, 'dynasty'>) {
  const s = D().skills
  const r = rulerSkills(k)
  return {
    tax: 1 + (r.finance - s.center) * s.finance.tax,
    trade: (r.finance - s.center) * s.finance.trade,
    happiness: (r.people - s.center) * s.people.happiness,
    work: (r.people - s.center) * s.people.work,
    dice: (r.military - s.center) * s.military.dice,
    upkeep: 1 + (r.military - s.center) * s.military.upkeep,
  }
}

// The house brought up to `to`: births, children coming of age, deaths and successions in the order they fall. The
// realm's `queen` flag is the lady at court (away when carried off).
export function dynastyStep(k: Kingdom, to: number): { kingdom: Kingdom; events: DynastyEvent[] } {
  const events: DynastyEvent[] = []
  let d = k.dynasty ?? foundDynasty(k, to)
  let queen = !!k.queen
  // A lady newly come to court (the realm took a queen): she joins the house.
  if (queen && !d.queen && !k.queenHeldBy) {
    d = wed(k, d, to)
    events.push({ kind: 'dynasty', what: 'wedding', person: d.queen! })
  }
  for (let guard = 0; guard < 50; guard++) {
    const fertile = !!d.king && !d.council && !!d.queen && queen && d.nextBirthAt != null && (d.born ?? 0) < D().births.max
    const births = fertile && ageOf(d.queen!, d.nextBirthAt!) <= D().births.queenMaxAge ? d.nextBirthAt! : Infinity
    const death = d.king ? d.king.deathAt : Infinity
    const growing = d.children.filter((c) => !c.grown)
    const comingOfAge = Math.min(...growing.map((c) => c.bornAt + D().comingOfAge * yearMs()), Infinity)
    const young = d.council && d.regentFor !== undefined && d.king?.id === d.regentFor ? d.king : null
    const regentEnds = young ? young.bornAt + D().comingOfAge * yearMs() : Infinity
    const next = Math.min(births, death, regentEnds, comingOfAge)
    if (next > to) break
    if (next === death && d.king) {
      // The lord dies: the eldest son follows (a council rules until he is of age); with no son, a council rules on.
      const dead: Person = { ...d.king, diedAt: next, cause: d.king.cause ?? 'age' }
      const heir = [...d.children].filter((c) => c.sex === 'm').sort((a, b) => a.bornAt - b.bornAt)[0] ?? null
      const council = !heir || !ofAge(heir, next)
      d = {
        ...d,
        king: heir,
        queen: null,
        children: heir ? d.children.filter((c) => c.id !== heir.id) : d.children,
        dead: [dead, ...d.dead].slice(0, D().keepDead),
        council,
        regentFor: heir && council ? heir.id : undefined,
        nextBirthAt: null,
        generation: d.generation + (heir ? 1 : 0),
      }
      // The lady becomes the dowager: the new lord takes a queen of his own.
      queen = false
      events.push({ kind: 'dynasty', what: 'death', person: dead, heir, council })
      continue
    }
    if (next === regentEnds && young) {
      // The young lord comes of age: the regents step down.
      d = { ...d, council: false, regentFor: undefined, king: grow(young) }
      events.push({ kind: 'dynasty', what: 'coronation', person: d.king! })
      continue
    }
    if (next === comingOfAge) {
      const child = growing.find((c) => c.bornAt + D().comingOfAge * yearMs() === next)!
      const grownUp = grow(child)
      d = { ...d, children: d.children.map((c) => (c.id === child.id ? grownUp : c)) }
      events.push({ kind: 'dynasty', what: 'ofAge', person: grownUp })
      continue
    }
    if (next === births) {
      const child = bear(k, d, next)
      d = { ...d, seq: d.seq + 1, born: (d.born ?? 0) + 1, children: [...d.children, child], nextBirthAt: next + between(roll(k, child.id, 5), D().births.everyYears) * yearMs() }
      events.push({ kind: 'dynasty', what: 'birth', person: child })
      continue
    }
    break
  }
  return { kingdom: { ...k, dynasty: d, queen }, events }
}

// A child grown up: its tutors' work added to its gifts.
function grow(p: Person): Person {
  if (p.grown) return p
  if (!p.education) return { ...p, grown: true }
  return { ...p, grown: true, skills: { ...p.skills, [p.education]: clampSkill(p.skills[p.education] + D().skills.education) } }
}

// A name for a man or a woman of the house, when the lord cannot think of one: from the old names, or put together
// from two halves the way old names were. `r` is a number from 0 to 1 (the client rolls it).
export function randomName(sex: 'm' | 'f', r: number): string {
  const names = D().names[sex]
  const parts = D().nameParts[sex]
  const pick = <T,>(list: T[], v: number) => list[Math.floor(v * list.length) % list.length]
  if (r < 0.5) return pick(names, r * 2)
  const v = (r - 0.5) * 2
  const first = pick(parts.first, v)
  const last = pick(parts.last, (v * 97) % 1)
  return first + last
}

// ---- The lord's say over the children ------------------------------------------------------------------------------

export function nameError(k: Pick<Kingdom, 'dynasty'>, id: number, name: string): 'none' | 'rejected' | null {
  const d = k.dynasty
  const child = d?.children.find((c) => c.id === id) ?? [d?.king, d?.queen].find((p) => p?.id === id)
  if (!child) return 'none'
  const n = name.trim()
  return n.length < 2 || n.length > 20 ? 'rejected' : null
}

export function nameChild(k: Kingdom, id: number, name: string): Kingdom {
  if (nameError(k, id, name) || !k.dynasty) return k
  const rename = (p: Person) => (p.id === id ? { ...p, name: name.trim(), named: true } : p)
  return { ...k, dynasty: { ...k.dynasty, children: k.dynasty.children.map(rename), king: k.dynasty.king && rename(k.dynasty.king), queen: k.dynasty.queen && rename(k.dynasty.queen) } }
}

// The upbringing is chosen while the lord lives and the child is not yet of age.
export function educateError(k: Pick<Kingdom, 'dynasty'>, id: number, focus: string, at: number): 'none' | 'rejected' | 'grown' | 'council' | null {
  const d = k.dynasty
  const child = d?.children.find((c) => c.id === id) ?? (d?.regentFor === id ? d.king ?? undefined : undefined)
  if (!d || !child) return 'none'
  if (!SKILLS.includes(focus as Skill)) return 'rejected'
  if (ofAge(child, at)) return 'grown'
  if (d.council && d.regentFor !== id) return 'council'
  return null
}

export function educate(k: Kingdom, id: number, focus: Skill, at: number): Kingdom {
  if (educateError(k, id, focus, at) || !k.dynasty) return k
  const set = (p: Person) => (p.id === id ? { ...p, education: focus } : p)
  return { ...k, dynasty: { ...k.dynasty, children: k.dynasty.children.map(set), king: k.dynasty.king && set(k.dynasty.king) } }
}

// A lord dies of grief after a lost battle, now and then (from the battle and the realm, so it is decided once).
export function griefStrikes(k: Pick<Kingdom, 'site' | 'foundedAt' | 'dynasty'>, battle: number) {
  return !!k.dynasty?.king && !k.dynasty.council && roll(k, battle, 77) < D().grief
}

export function dieOfGrief(k: Kingdom, at: number): Kingdom {
  const d = k.dynasty
  if (!d?.king || at >= d.king.deathAt) return k
  return { ...k, dynasty: { ...d, king: { ...d.king, deathAt: at, cause: 'grief' } } }
}
