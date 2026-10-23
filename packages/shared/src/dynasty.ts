import { balance } from './balance'
import { yearMs } from './clock'
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
  // How a dead member of the house died: of old age, of grief, in battle, put down as a rebel (CLAUDE.md §9.1.1),
  // thrown off the throne by a pretender, or of sickness (set ahead on the living: a brother or sister who will not
  // reign, or one the plague strikes).
  cause?: 'age' | 'grief' | 'battle' | 'rebel' | 'deposed' | 'sickness'
  diedAt?: number
  // Whether a dead member of the house ruled it (older saves kept only rulers among the dead: absent means yes).
  ruled?: boolean
  // The parents' ids (absent for those born before they were kept, and for the first lord and the ladies).
  father?: number
  mother?: number
  // A post the lord has given the grown member of the house (CLAUDE.md §9.1.1): governor of a held town, commander of
  // the liege crown's patrol, or treasurer.
  role?: KinRole
  // What he thinks of the ruler (and how the liege crown thinks of him): an offset from where it rests, fading with
  // time (see intrigue.ts opinionOf). Absent: at rest.
  op?: Opinion
  // A daughter or sister married off: to whom (she has left the house).
  married?: Marriage
  // Warned of as unhappy (told once, until he is content again), and when he was last given a gift.
  warned?: boolean
  giftAt?: number
  // A brother or sister of the ruler since then (the last succession): a brother left without a post grows sour.
  kinSince?: number
}

export type KinRole = { kind: 'governor'; town: number; since: number } | { kind: 'commander'; since: number } | { kind: 'treasurer'; since: number }
export type KinRoleKind = KinRole['kind']
export const KIN_ROLES: KinRoleKind[] = ['governor', 'commander', 'treasurer']

// An opinion's offsets from its resting value (`off` the ruler, `crown` the liege crown's of him), as they were at `at`.
export interface Opinion {
  off: number
  crown: number
  at: number
}

export interface Marriage {
  kind: 'crown' | 'town' | 'lord'
  // The town's or the lord's id (none for the crown: the liege at the time, `crown`).
  id?: number
  crown?: number
  name: string
  at: number
}

// A lady of another lord's house married into this one.
export interface Bride {
  name: string
  from: string
  fromId: number
  at: number
}

export interface Dynasty {
  seq: number
  king: Person | null
  queen: Person | null
  // The ruler's own children.
  children: Person[]
  // The ruler's brothers and sisters (his father's other children), the house's other kin (uncles, cousins, the
  // children of a lord thrown off the throne), the ruler's mother (the dowager), the daughters and sisters married off,
  // and the ladies of other houses married into this one (CLAUDE.md §9.1.1). Absent in older saves.
  siblings?: Person[]
  kin?: Person[]
  mother?: Person | null
  married?: Person[]
  brides?: Bride[]
  // Sons and daughters the ruler and his lady have had, and the family they will have (drawn when she comes to court
  // from balance.dynasty.births.plans: two sons, one son, or a son and a daughter).
  sons?: number
  daughters?: number
  plan?: { sons: number; daughters: number }
  // The widowed lady rules alone (no lord, no heir, no brother): she must be married, by the lord's word or, when
  // `kinsmanAt` comes, by the council's (CLAUDE.md §9.1).
  regnant?: boolean
  // The layout of the house (2: siblings apart from children); older saves are brought to it once.
  rev?: number
  // No pretender rises before then (a revolt just put down), and the last revolt check (its slot) that found someone
  // unhappy enough (see intrigue.ts).
  quietUntil?: number
  revoltSlot?: number
  // The house's dead, the latest first (a few).
  dead: Person[]
  // A council of regents rules: no heir, or the heir is not of age yet (`regentFor`: the young ruler's id).
  council?: boolean
  regentFor?: number
  // A council ruling for no heir at all: a kinsman of the house is called to the throne then (absent in older saves:
  // counted from the last lord's death).
  kinsmanAt?: number
  nextBirthAt?: number | null
  // Children the lord and his lady have had (the births stop at a few).
  born?: number
  // Rulers so far, the first lord counting as one.
  generation: number
  // The length of a year (ms) the house's dates were made with; missing: the old six-hour years
  // (balance.dynasty.legacyYear), which dynastyStep turns into today's years.
  yearMs?: number
}

export type DynastyEvent =
  | { kind: 'dynasty'; what: 'birth'; person: Person }
  | { kind: 'dynasty'; what: 'passing'; person: Person }
  | { kind: 'dynasty'; what: 'death'; person: Person; heir: Person | null; council: boolean }
  | { kind: 'dynasty'; what: 'ofAge'; person: Person }
  | { kind: 'dynasty'; what: 'coronation'; person: Person }
  | { kind: 'dynasty'; what: 'wedding'; person: Person }
  // The widowed lady rules alone and must be wed; then the lord she is wed to.
  | { kind: 'dynasty'; what: 'regnant'; person: Person }
  | { kind: 'dynasty'; what: 'consort'; person: Person }

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
// The same draw for the house's intrigues (intrigue.ts).
export const houseRoll = roll
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

const byAge = (list: Person[]) => [...list].sort((a, b) => a.bornAt - b.bornAt)

// Everyone of the house still at court (the living), and every list of it brought through `fn`.
export const siblingsOf = (d: Dynasty) => d.siblings ?? []
export const kinOf = (d: Dynasty) => d.kin ?? []
export const marriedOf = (d: Dynasty) => d.married ?? []
export const courtOf = (d: Dynasty): Person[] => [d.king, d.queen, d.mother, ...d.children, ...siblingsOf(d), ...kinOf(d)].filter((p): p is Person => !!p)
export function mapHouse(d: Dynasty, fn: (p: Person) => Person): Dynasty {
  return {
    ...d,
    king: d.king && fn(d.king),
    queen: d.queen && fn(d.queen),
    mother: d.mother ? fn(d.mother) : d.mother,
    children: d.children.map(fn),
    siblings: siblingsOf(d).map(fn),
    kin: kinOf(d).map(fn),
  }
}
// A member of the house at court by id.
export const memberOf = (d: Dynasty | undefined, id: number) => (d ? courtOf(d).find((p) => p.id === id) : undefined)
const names = (d: Dynasty) => [...courtOf(d), ...marriedOf(d), ...d.dead].map((p) => p.name)

// The house as it begins: a lord in his prime (and his lady, if the realm already has one).
export function foundDynasty(k: Pick<Kingdom, 'site' | 'foundedAt' | 'queen'>, at: number): Dynasty {
  const born = (k.foundedAt ?? at) - between(roll(k, 1, 1), D().king.age) * yearMs()
  const dynasty: Dynasty = { seq: 2, king: person(k, 1, 'm', born, drawnSkills(k, 1)), queen: null, children: [], siblings: [], kin: [], dead: [], generation: 1, yearMs: yearMs(), rev: HOUSE_REV }
  return k.queen ? wed(k, dynasty, k.foundedAt ?? at) : dynasty
}

// A lady comes to court: the first child follows within a year or so. A new couple: their sons and daughters count
// from none.
function wed(k: Pick<Kingdom, 'site' | 'foundedAt'>, d: Dynasty, at: number): Dynasty {
  const id = d.seq
  const queen = person(k, id, 'f', at - between(roll(k, id, 2), D().queen.age) * yearMs(), drawnSkills(k, id), names(d))
  return { ...d, seq: id + 1, queen, born: 0, sons: 0, daughters: 0, plan: familyPlan(k, id), nextBirthAt: at + between(roll(k, id, 3), D().births.firstYears) * yearMs() }
}

// The family a couple will have (CLAUDE.md §9.1): at most two children, a son always among them; most often two sons,
// else one son, or a son and a daughter. Drawn from the lady (her id).
function familyPlan(k: Pick<Kingdom, 'site' | 'foundedAt'>, lady: number) {
  const plans = D().births.plans
  let r = roll(k, lady, 6) * plans.reduce((n, p) => n + p.weight, 0)
  for (const p of plans) {
    if ((r -= p.weight) < 0) return { sons: p.sons, daughters: p.daughters }
  }
  return { sons: plans[0].sons, daughters: plans[0].daughters }
}

// How many more sons and daughters the ruler and his lady may still have.
export function birthsLeft(d: Dynasty) {
  const plan = d.plan ?? { sons: D().births.maxSons, daughters: D().births.maxDaughters }
  return { sons: Math.max(0, plan.sons - (d.sons ?? 0)), daughters: Math.max(0, plan.daughters - (d.daughters ?? 0)) }
}

// A brother or sister of the ruler who will not reign dies young, of a sickness (CLAUDE.md §9.1): at the age drawn for
// it, or soon after now if older already. A sibling who comes to the throne gets back the life drawn at birth.
function fadeYoung(k: Pick<Kingdom, 'site' | 'foundedAt'>, p: Person, at: number): Person {
  const f = D().siblingFate
  const Y = yearMs()
  const young = Math.max(at + between(roll(k, p.id, 91), f.soonestYears) * Y, p.bornAt + between(roll(k, p.id, 92), f.age) * Y)
  return young < p.deathAt ? { ...p, deathAt: young, cause: 'sickness' } : p
}
function fullLife(k: Pick<Kingdom, 'site' | 'foundedAt'>, p: Person): Person {
  if (p.cause !== 'sickness') return p
  const { cause: _cause, ...rest } = p
  return { ...rest, deathAt: p.bornAt + between(roll(k, p.id, 13) ** 0.8, D().death.atAge) * yearMs() }
}

// A child: its gifts drawn half from its parents, half anew; a son or a daughter as the draw falls, unless the couple
// has had all the sons (or daughters) it may.
function bear(k: Pick<Kingdom, 'site' | 'foundedAt'>, d: Dynasty, at: number): Person {
  const id = d.seq
  const left = birthsLeft(d)
  // A son or a daughter as the draw falls, as long as the plan still has one of that kind (never two daughters).
  const drawn = roll(k, id, 4) < D().births.son ? 'm' : 'f'
  const sex = drawn === 'm' && left.sons <= 0 ? 'f' : drawn === 'f' && left.daughters <= 0 ? 'm' : drawn
  const fresh = drawnSkills(k, id)
  const w = D().skills.inherit
  const parent = (s: Skill) => ((d.king?.skills[s] ?? 5) + (d.queen?.skills[s] ?? 5)) / 2
  const skills = Object.fromEntries(SKILLS.map((s) => [s, clampSkill(parent(s) * w + fresh[s] * (1 - w))])) as Skills
  return { ...person(k, id, sex, at, skills, names(d)), ...(d.king && { father: d.king.id }), ...(d.queen && { mother: d.queen.id }) }
}

// The house's layout as it is now kept: older saves kept the late lord's children with the ruler's own after a
// succession. Those born before the ruler could have had children of his own (before he came of age) are his brothers
// and sisters.
const HOUSE_REV = 3
function normalizeHouse(k: Pick<Kingdom, 'site' | 'foundedAt'>, d: Dynasty, at: number): Dynasty {
  // 3: a couple has a family plan (no third child), and the ruler's brothers and sisters fade young.
  if (d.rev === 2) return { ...d, rev: HOUSE_REV, ...(d.queen && !d.plan && { plan: familyPlan(k, d.queen.id) }), siblings: siblingsOf(d).map((p) => fadeYoung(k, p, at)) }
  if ((d.rev ?? 1) >= HOUSE_REV) return d
  const king = d.king
  const cut = king && d.generation > 1 ? king.bornAt + D().comingOfAge * yearMs() : -Infinity
  const siblings = d.children.filter((c) => c.bornAt < cut)
  const children = d.children.filter((c) => c.bornAt >= cut)
  return {
    ...d,
    rev: HOUSE_REV,
    children,
    siblings: [...siblingsOf(d), ...siblings].map((p) => fadeYoung(k, p, at)),
    kin: kinOf(d),
    sons: children.filter((c) => c.sex === 'm').length,
    daughters: children.filter((c) => c.sex === 'f').length,
    ...(d.queen && !d.plan && { plan: familyPlan(k, d.queen.id) }),
  }
}

// Who would follow the ruler: his eldest son; with none, his eldest grown brother (CLAUDE.md §9.1).
export function heirOf(d: Dynasty, at: number): Person | null {
  if (d.regnant) return null
  const son = byAge(d.children.filter((c) => c.sex === 'm'))[0]
  if (son) return son
  if (!D().succession.brotherInherits) return null
  return byAge(siblingsOf(d).filter((c) => c.sex === 'm' && ofAge(c, at)))[0] ?? null
}

// What the realm's ruler brings: the lord's gifts (with half the lady's above or below the middle), or the council's.
export function rulerSkills(k: Pick<Kingdom, 'dynasty'>): Skills & { council: boolean } {
  const d = k.dynasty
  // A widowed lady ruling alone rules with her own gifts.
  if (d?.regnant && d.queen) return { ...d.queen.skills, council: false }
  if (!d || d.council || !d.king) return { finance: D().council.finance, people: D().council.people, military: D().council.military, council: true }
  const c = D().skills.center
  const w = D().skills.queenWeight
  const out = { ...d.king.skills }
  if (d.queen) for (const s of SKILLS) out[s] = out[s] + (d.queen.skills[s] - c) * w
  return { ...out, council: false }
}

// The member of the house holding a post (CLAUDE.md §9.1.1), if any.
export const holderOf = (d: Dynasty | undefined, kind: KinRoleKind, town?: number) =>
  d ? courtOf(d).find((p) => p.role?.kind === kind && (kind !== 'governor' || (p.role as { town: number }).town === town)) : undefined

const R = () => D().intrigue.roles

// The treasurer's gift for finance in the tax.
export function treasurerTax(d: Dynasty | undefined) {
  const t = holderOf(d, 'treasurer')
  return t ? Math.max(0, t.skills.finance - R().treasurer.from) * R().treasurer.taxPerFinance : 0
}

// What a member of the house brings to a held town's loyalty: a governor (with his way with people), and a princess
// married into its first family. By town id.
export function townKinBonus(k: Pick<Kingdom, 'dynasty' | 'towns'>): Record<number, number> {
  const out: Record<number, number> = {}
  const d = k.dynasty
  if (!d) return out
  const held = new Set((k.towns ?? []).map((t) => t.id))
  for (const p of courtOf(d)) {
    if (p.role?.kind !== 'governor' || !held.has(p.role.town)) continue
    const g = R().governor
    out[p.role.town] = (out[p.role.town] ?? 0) + Math.max(0, g.loyalty + (p.skills.people - D().skills.center) * g.perPeople)
  }
  for (const p of marriedOf(d)) {
    if (p.married?.kind !== 'town' || p.married.id === undefined || !held.has(p.married.id)) continue
    out[p.married.id] = (out[p.married.id] ?? 0) + D().intrigue.marriage.town.loyalty
  }
  return out
}

// Where the lord's standing with a crown rests a little higher: his brother leads its patrol, his sister is wed into
// its house.
export function houseCrownRest(d: Dynasty | undefined, crown: number, liege: number | null | undefined) {
  if (!d || liege !== crown) return 0
  const commander = holderOf(d, 'commander') ? R().commander.crownRest : 0
  const wed = marriedOf(d).filter((p) => p.married?.kind === 'crown' && p.married.crown === crown).length * D().intrigue.marriage.crown.crownRest
  return commander + wed
}

// The liege crown's patrol led by a brother of the lord: it tips more and warms the crown a little more as it calls.
export function patrolFavour(k: Pick<Kingdom, 'dynasty'>) {
  const c = holderOf(k.dynasty, 'commander')
  if (!c) return { tip: 1, relation: 0 }
  return { tip: 1 + R().commander.tip + Math.max(0, c.skills.military - D().skills.center) * R().commander.tipPerMilitary, relation: R().commander.visitRelation }
}

// The gains and losses the ruler's gifts give: tax and trade gold, the people's mood and work, the soldiers' dice and
// pay. The treasurer adds to the tax.
export function dynastyEffects(k: Pick<Kingdom, 'dynasty'>) {
  const s = D().skills
  const r = rulerSkills(k)
  return {
    tax: 1 + (r.finance - s.center) * s.finance.tax + treasurerTax(k.dynasty),
    trade: (r.finance - s.center) * s.finance.trade,
    happiness: (r.people - s.center) * s.people.happiness,
    work: (r.people - s.center) * s.people.work,
    dice: (r.military - s.center) * s.military.dice,
    upkeep: 1 + (r.military - s.center) * s.military.upkeep,
  }
}

// A new ruler's brothers are a little sour at first: they too were born to the throne.
const soured = (p: Person, at: number): Person => (p.sex === 'm' ? { ...p, kinSince: at, op: { off: (p.op?.off ?? 0) + D().intrigue.opinion.succession, crown: p.op?.crown ?? 0, at } } : p)
// The new ruler (or one who dies) leaves his post and his grudges behind.
const crowned = (p: Person): Person => {
  const { role: _role, op: _op, warned: _warned, ...rest } = p
  return rest
}

// The house brought up to `to`: births, children coming of age, deaths and successions in the order they fall. The
// realm's `queen` flag is the lady at court (away when carried off).
export function dynastyStep(k: Kingdom, to: number): { kingdom: Kingdom; events: DynastyEvent[] } {
  const events: DynastyEvent[] = []
  let d = normalizeHouse(k, rescaleYears(k.dynasty ?? foundDynasty(k, to), to), to)
  let queen = !!k.queen
  // A lady newly come to court (the realm took a queen): she joins the house.
  if (queen && !d.queen && !k.queenHeldBy) {
    d = wed(k, d, to)
    events.push({ kind: 'dynasty', what: 'wedding', person: d.queen! })
  }
  const Y = yearMs()
  for (let guard = 0; guard < 60; guard++) {
    const left = birthsLeft(d)
    const fertile = !!d.king && !d.council && !!d.queen && queen && d.nextBirthAt != null && left.sons + left.daughters > 0
    const births = fertile && ageOf(d.queen!, d.nextBirthAt!) <= D().births.queenMaxAge ? d.nextBirthAt! : Infinity
    const death = d.king ? d.king.deathAt : Infinity
    const growing = [...d.children, ...siblingsOf(d), ...kinOf(d)].filter((c) => !c.grown)
    const comingOfAge = Math.min(...growing.map((c) => c.bornAt + D().comingOfAge * Y), Infinity)
    // The rest of the house dies too, in its time (the lady excepted: she stays the ruler's).
    const elders = [...d.children, ...siblingsOf(d), ...kinOf(d), ...(d.mother ? [d.mother] : [])]
    const passing = Math.min(...elders.map((p) => p.deathAt), Infinity)
    const young = d.council && d.regentFor !== undefined && d.king?.id === d.regentFor ? d.king : null
    const regentEnds = young ? young.bornAt + D().comingOfAge * Y : Infinity
    // With no heir at all, the council rules for a few years and then crowns a kinsman (the house does not end).
    // A widowed lady ruling alone is wed by then (sooner if the lord says so); she may die before it.
    const kinsman = (d.council && !d.king) || d.regnant ? (d.kinsmanAt ?? (d.dead[0]?.diedAt ?? to) + D().council.kinsmanYears * Y) : Infinity
    const ladyDies = d.regnant && d.queen ? d.queen.deathAt : Infinity
    const next = Math.min(births, death, regentEnds, comingOfAge, kinsman, passing, ladyDies)
    if (next > to) break
    if (next === death && d.king) {
      // The lord dies: the eldest son follows (a council rules until he is of age); with no son, his eldest grown
      // brother; with neither, a council rules on.
      const dead: Person = { ...crowned(d.king), diedAt: next, cause: d.king.cause ?? 'age', ruled: true }
      const sons = byAge(d.children.filter((c) => c.sex === 'm'))
      const brother = sons.length === 0 && D().succession.brotherInherits ? byAge(siblingsOf(d).filter((c) => c.sex === 'm' && ofAge(c, next)))[0] : undefined
      const heir = sons[0] ?? brother ?? null
      const council = !heir || !ofAge(heir, next)
      const base = { ...d, dead: [dead, ...d.dead].slice(0, D().keepDead), nextBirthAt: null, queen: null, sons: 0, daughters: 0, born: 0 }
      if (heir && !brother) {
        // His brothers and sisters are the late lord's other children; the late lord's own are kin now (uncles and
        // aunts); his mother the dowager.
        d = {
          ...base,
          king: crowned(heir),
          children: [],
          siblings: d.children.filter((c) => c.id !== heir.id).map((c) => fadeYoung(k, soured(c, next), next)),
          kin: [...kinOf(d), ...siblingsOf(d)],
          mother: d.queen ?? null,
          council,
          regentFor: council ? heir.id : undefined,
          kinsmanAt: undefined,
          generation: d.generation + 1,
        }
      } else if (heir) {
        // A brother takes the throne: the late lord's children are his nephews and nieces; the late lord's lady leaves.
        d = {
          ...base,
          king: crowned(fullLife(k, heir)),
          children: [],
          siblings: siblingsOf(d).filter((c) => c.id !== heir.id).map((c) => soured(c, next)),
          kin: [...kinOf(d), ...d.children],
          council: false,
          regentFor: undefined,
          kinsmanAt: undefined,
          generation: d.generation + 1,
        }
      } else if (d.queen && queen) {
        // No heir, but his lady at court: she rules alone until she is wed (CLAUDE.md §9.1); she keeps the realm's queen.
        d = { ...base, king: null, queen: d.queen, regnant: true, council: false, regentFor: undefined, kinsmanAt: next + D().council.kinsmanYears * Y }
        events.push({ kind: 'dynasty', what: 'death', person: dead, heir: null, council: false })
        events.push({ kind: 'dynasty', what: 'regnant', person: d.queen! })
        continue
      } else {
        // No heir: the late lord's children stay with the council until a kinsman is called; his lady is the dowager.
        d = { ...base, king: null, mother: d.queen ?? d.mother ?? null, council: true, regentFor: undefined, kinsmanAt: next + D().council.kinsmanYears * Y }
      }
      // The lady becomes the dowager: the new lord takes a queen of his own.
      queen = false
      events.push({ kind: 'dynasty', what: 'death', person: dead, heir, council })
      continue
    }
    if (next === ladyDies && d.queen) {
      // The lady ruling alone dies unwed: the council rules until a kinsman is called.
      const dead: Person = { ...crowned(d.queen), diedAt: next, cause: d.queen.cause ?? 'age', ruled: true }
      d = { ...d, queen: null, regnant: false, council: true, dead: [dead, ...d.dead].slice(0, D().keepDead), kinsmanAt: next + D().council.kinsmanYears * Y }
      queen = false
      events.push({ kind: 'dynasty', what: 'death', person: dead, heir: null, council: true })
      continue
    }
    if (next === regentEnds && young) {
      // The young lord comes of age: the regents step down.
      d = { ...d, council: false, regentFor: undefined, king: grow(young) }
      events.push({ kind: 'dynasty', what: 'coronation', person: d.king! })
      continue
    }
    if (next === kinsman && d.regnant && d.queen) {
      // The lady ruling alone is wed to a lord of the house's choosing (or the lord's word brought the day forward): he
      // reigns, she is his queen, and their children count from none.
      const lord = person(k, d.seq, 'm', next - between(roll(k, d.seq, 1), D().king.age) * Y, drawnSkills(k, d.seq), names(d))
      d = {
        ...d,
        seq: d.seq + 1,
        king: lord,
        regnant: false,
        council: false,
        kinsmanAt: undefined,
        generation: d.generation + 1,
        born: 0,
        sons: 0,
        daughters: 0,
        plan: familyPlan(k, d.queen.id * 31 + d.seq),
        nextBirthAt: next + between(roll(k, d.seq, 3), D().births.firstYears) * Y,
      }
      events.push({ kind: 'dynasty', what: 'consort', person: lord })
      continue
    }
    if (next === kinsman) {
      // A cousin of the dead lord, in his prime, takes the throne; he will take a lady of his own. Everyone else of the
      // house is his kin.
      const lord = person(k, d.seq, 'm', next - between(roll(k, d.seq, 1), D().king.age) * Y, drawnSkills(k, d.seq), names(d))
      d = {
        ...d,
        seq: d.seq + 1,
        king: lord,
        council: false,
        regentFor: undefined,
        kinsmanAt: undefined,
        generation: d.generation + 1,
        kin: [...kinOf(d), ...siblingsOf(d), ...d.children, ...(d.mother ? [d.mother] : [])],
        siblings: [],
        children: [],
        mother: null,
      }
      events.push({ kind: 'dynasty', what: 'coronation', person: lord })
      continue
    }
    if (next === comingOfAge) {
      const child = growing.find((c) => c.bornAt + D().comingOfAge * Y === next)!
      const grownUp = grow(child)
      d = mapHouse(d, (p) => (p.id === child.id ? grownUp : p))
      events.push({ kind: 'dynasty', what: 'ofAge', person: grownUp })
      continue
    }
    if (next === passing) {
      const gone = elders.find((p) => p.deathAt === next)!
      const dead: Person = { ...crowned(gone), diedAt: next, cause: gone.cause ?? 'age', ruled: false }
      const drop = (list: Person[]) => list.filter((p) => p.id !== gone.id)
      d = {
        ...d,
        children: drop(d.children),
        siblings: drop(siblingsOf(d)),
        kin: drop(kinOf(d)),
        mother: d.mother?.id === gone.id ? null : d.mother,
        dead: [dead, ...d.dead].slice(0, D().keepDead),
      }
      events.push({ kind: 'dynasty', what: 'passing', person: dead })
      continue
    }
    if (next === births) {
      const child = bear(k, d, next)
      d = {
        ...d,
        seq: d.seq + 1,
        born: (d.born ?? 0) + 1,
        sons: (d.sons ?? 0) + (child.sex === 'm' ? 1 : 0),
        daughters: (d.daughters ?? 0) + (child.sex === 'f' ? 1 : 0),
        children: [...d.children, child],
        nextBirthAt: next + between(roll(k, child.id, 5), D().births.everyYears) * Y,
      }
      events.push({ kind: 'dynasty', what: 'birth', person: child })
      continue
    }
    break
  }
  return { kingdom: { ...k, dynasty: d, queen }, events }
}

// A house whose dates were made with years of another length, brought to today's years at `at`: everyone keeps the
// age they have at `at` and ages by the new years from then on; a death or a birth still to come is that many new
// years away. Whoever would already be past the age death was drawn for is given balance.dynasty.legacyYear
// .graceHours more (no house loses its lord the moment the years change). A death of grief keeps its time.
function rescaleYears(d: Dynasty, at: number): Dynasty {
  const now = yearMs()
  const was = d.yearMs ?? D().legacyYear.ms
  if (was === now) return d
  const q = now / was
  const grace = at + D().legacyYear.graceHours * 3_600_000
  const time = (t: number) => at - (at - t) * q
  const living = (p: Person): Person => {
    const bornAt = time(p.bornAt)
    const deathAt = p.cause === 'grief' ? p.deathAt : p.deathAt > at ? time(p.deathAt) : grace
    return { ...p, bornAt, deathAt }
  }
  const dead = (p: Person): Person => ({ ...p, bornAt: time(p.bornAt), deathAt: time(p.deathAt), diedAt: p.diedAt === undefined ? undefined : time(p.diedAt) })
  return {
    ...mapHouse(d, living),
    married: marriedOf(d).map(dead),
    dead: d.dead.map(dead),
    nextBirthAt: d.nextBirthAt == null ? d.nextBirthAt : d.nextBirthAt > at ? at + (d.nextBirthAt - at) * q : d.nextBirthAt,
    yearMs: now,
  }
}

// A child grown up: its tutors' work added to its gifts.
function grow(p: Person): Person {
  if (p.grown) return p
  if (!p.education) return { ...p, grown: true }
  return { ...p, grown: true, skills: { ...p.skills, [p.education]: clampSkill(p.skills[p.education] + D().skills.education) } }
}

// A name for a man or a woman of the house, when the lord cannot think of one: from the old names, or put together
// from two halves the way old names were. `r` is a number from 0 to 1 (the client rolls it). `avoid`: names already
// borne in the house, passed over when another comes to hand.
export function randomName(sex: 'm' | 'f', r: number, avoid: string[] = []): string {
  const names = D().names[sex]
  const parts = D().nameParts[sex]
  const pick = <T,>(list: T[], v: number) => list[Math.floor(v * list.length) % list.length]
  const make = (x: number) => {
    if (x < 0.5) return pick(names, x * 2)
    const v = (x - 0.5) * 2
    return pick(parts.first, v) + pick(parts.last, (v * 97) % 1)
  }
  let name = make(r)
  for (let i = 1; i < 12 && avoid.includes(name); i++) name = make((r + i * 0.6180339887) % 1)
  return name
}

// The names borne in the house, living, married off and dead (the name roller passes them over).
export const houseNames = (d: Dynasty | undefined) => (d ? names(d) : [])

// ---- The lord's say over the children ------------------------------------------------------------------------------

// A child is named once, by the lord: in the news of its birth or later, while it still bears only the name drawn for
// it. The ruler and the lady keep the names they came with, and a name given is not taken back. (A young lord ruling
// under the regents may still be named, if he was never named as a child.)
export function nameError(k: Pick<Kingdom, 'dynasty'>, id: number, name: string): 'none' | 'named' | 'rejected' | null {
  const d = k.dynasty
  // The ruler's children, and his young brothers and sisters (the late lord's, never named).
  const child = d?.children.find((c) => c.id === id) ?? (d ? siblingsOf(d).find((c) => c.id === id) : undefined) ?? (d?.regentFor === id && d.king?.id === id ? d.king : undefined)
  if (!child) return 'none'
  if (child.named) return 'named'
  const n = name.trim()
  return n.length < 2 || n.length > 20 ? 'rejected' : null
}

export function nameChild(k: Kingdom, id: number, name: string): Kingdom {
  if (nameError(k, id, name) || !k.dynasty) return k
  const give = (p: Person) => (p.id === id ? { ...p, name: name.trim(), named: true } : p)
  return { ...k, dynasty: mapHouse(k.dynasty, give) }
}

// The upbringing is chosen while the lord lives and the child (or a young brother or sister) is not yet of age.
export function educateError(k: Pick<Kingdom, 'dynasty'>, id: number, focus: string, at: number): 'none' | 'rejected' | 'grown' | 'council' | null {
  const d = k.dynasty
  const child = d?.children.find((c) => c.id === id) ?? (d ? siblingsOf(d).find((c) => c.id === id) : undefined) ?? (d?.regentFor === id ? d.king ?? undefined : undefined)
  if (!d || !child) return 'none'
  if (!SKILLS.includes(focus as Skill)) return 'rejected'
  if (ofAge(child, at)) return 'grown'
  if (d.council && d.regentFor !== id) return 'council'
  return null
}

export function educate(k: Kingdom, id: number, focus: Skill, at: number): Kingdom {
  if (educateError(k, id, focus, at) || !k.dynasty) return k
  const set = (p: Person) => (p.id === id ? { ...p, education: focus } : p)
  return { ...k, dynasty: mapHouse(k.dynasty, set) }
}

// A lord dies of grief after a lost battle, now and then (from the battle and the realm, so it is decided once).
// Sickness in the realm (CLAUDE.md §9.1): each round a member of the house may catch it and die, as likely as the
// share of the people who are sick (balance.dynasty.sickness.royalPerShare a round per share sick). The lady is
// spared (she is the ruler's), and so is a ruler with nobody to follow him. One at a time; dynastyStep then lays the
// dead to rest and crowns the heir at that moment.
// An outbreak reaching the lord's house (CLAUDE.md §9.1): once per outbreak, a chance that grows with how hard it struck
// (royalPerOutbreak at typicalShare) and shrinks with the hospital, that one of the house dies of it. Never the last of
// the blood: someone of the house (the ruler, his children, brothers and sisters, kin) always lives on, and a ruler
// with no heir is spared.
export function sicknessStrikes(k: Kingdom, at: number, round: number, share = k.sickness ?? 0): Kingdom {
  const d = k.dynasty
  if (!d || share <= 0) return k
  const s = D().sickness
  const hospital = k.buildings.filter((b) => b.kind === 'hospital' && b.doneAt <= at).reduce((n, b) => Math.max(n, b.level ?? 1), 0)
  const chance = s.royalPerOutbreak * (share / s.typicalShare) * Math.max(0, 1 - s.hospitalCutPerLevel * hospital)
  if (roll(k, round, 94) >= chance) return k
  const living = (p: Person) => p.deathAt > at
  const blood = [...(d.king ? [d.king] : []), ...d.children, ...siblingsOf(d), ...kinOf(d)].filter(living)
  const ruler = d.king && !d.council && heirOf(d, at) ? [d.king] : []
  const exposed = [...ruler, ...d.children, ...siblingsOf(d), ...kinOf(d), ...(d.mother ? [d.mother] : [])].filter(living)
  // Whoever it takes, at least one of the blood must be left.
  const spared = exposed.filter((p) => blood.some((b) => b.id !== p.id))
  if (spared.length === 0) return k
  const struck = spared[Math.floor(roll(k, round, 95) * spared.length) % spared.length]
  return { ...k, dynasty: mapHouse(d, (p) => (p.id === struck.id ? { ...p, deathAt: at, cause: 'sickness' } : p)) }
}

// The lord marries off the widowed lady who rules alone (CLAUDE.md §9.1): the council's day is brought to now.
export function wedQueenError(k: Pick<Kingdom, 'dynasty'>): 'none' | null {
  return k.dynasty?.regnant && k.dynasty.queen ? null : 'none'
}
export function wedQueen(k: Kingdom, at: number): Kingdom {
  if (wedQueenError(k)) return k
  return dynastyStep({ ...k, dynasty: { ...k.dynasty!, kinsmanAt: at } }, at).kingdom
}

export function griefStrikes(k: Pick<Kingdom, 'site' | 'foundedAt' | 'dynasty'>, battle: number) {
  return !!k.dynasty?.king && !k.dynasty.council && roll(k, battle, 77) < D().grief
}

export function dieOfGrief(k: Kingdom, at: number, cause: 'grief' | 'battle' = 'grief'): Kingdom {
  const d = k.dynasty
  if (!d?.king || at >= d.king.deathAt) return k
  return { ...k, dynasty: { ...d, king: { ...d.king, deathAt: at, cause } } }
}

// ---- The lord at the head of his army (CLAUDE.md §8.2.1) -----------------------------------------------------------

// Whether the army marked as led by `ledBy` (a person's id) has the living ruler at its head: the mark lapses when he
// dies or the regents rule.
export function leadsArmy(k: Pick<Kingdom, 'dynasty'>, ledBy: number | null | undefined, at: number) {
  const d = k.dynasty
  return ledBy != null && !!d?.king && !d.council && d.king.id === ledBy && d.king.deathAt > at
}

export type LeadError = 'council' | 'queen' | 'son' | 'leading' | 'palace' | 'battle'

// The lord rides out at the head of an army only with his house secured: a lady at court and a son to follow him. He
// leads one army at a time, and takes it over in front of his palace.
export function leadError(
  k: Pick<Kingdom, 'dynasty' | 'queen' | 'queenHeldBy'>,
  at: number,
  army: { atPalace: boolean; battle: boolean; leadingAnother: boolean },
): LeadError | null {
  const d = k.dynasty
  if (!d?.king || d.council || d.king.deathAt <= at) return 'council'
  if (!d.queen || !k.queen || k.queenHeldBy != null) return 'queen'
  if (!d.children.some((c) => c.sex === 'm')) return 'son'
  if (army.leadingAnother) return 'leading'
  if (army.battle) return 'battle'
  if (!army.atPalace) return 'palace'
  return null
}

// The dice of an army the lord leads: his presence, and his own gift for war counted in full (in place of the general
// one, dynastyEffects().dice).
export function leadDice(k: Pick<Kingdom, 'dynasty'>) {
  const c = D().command
  const skill = k.dynasty?.king?.skills.military ?? D().skills.center
  return c.presence + (skill - D().skills.center) * c.dicePerPoint
}

// A lord leading an army that loses falls in battle more often than one who grieves at home.
export function fallStrikes(k: Pick<Kingdom, 'site' | 'foundedAt' | 'dynasty'>, battle: number) {
  return !!k.dynasty?.king && !k.dynasty.council && roll(k, battle, 79) < D().command.fall
}
