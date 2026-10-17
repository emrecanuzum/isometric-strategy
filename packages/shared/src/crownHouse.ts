import { balance } from './balance'
import { calendarAt, yearMs } from './clock'
import type { Kingdom } from './economy'
import type { Skills } from './dynasty'

// The royal houses of the two crown kingdoms (CLAUDE.md §7.8): each crown has a reigning king or queen, a consort,
// children and a line of rulers before them. Nothing is stored: the whole house follows from the lobby's number, the
// crown and the clock, so the server and every player see the same family. Rulers age with the calendar (one year a
// real hour, as the lords' houses do), die at an age drawn at birth, and the eldest living son (then daughter, then a
// kinsman) succeeds; an heir under age rules under a regent. A ruler's trait tilts the crown's ways a little (the
// share of the treasury its tribute collectors ask, its patrol's tip).

const H = () => balance.cities.crown.house

export type CrownTrait = keyof typeof balance.cities.crown.house.traits
export const CROWN_TRAITS = Object.keys(balance.cities.crown.house.traits) as CrownTrait[]

// What the house is drawn from: the lobby's number and the season's start (the calendar's year 1 January).
export type CrownKey = Pick<Kingdom, 'lobbyKey' | 'seasonStart'>

export interface CrownRoyal {
  id: number
  name: string
  sex: 'm' | 'f'
  bornAt: number
  deathAt: number
  skills: Skills
  trait: CrownTrait
}

export interface CrownReign {
  // The reign's number in the crown's history (the ancestors before the season are numbered below zero).
  n: number
  ruler: CrownRoyal
  // "II" for the second of that name (1 for the first, not written).
  regnal: number
  from: number
  // When the ruler dies (the reign ends).
  to: number
  consort: CrownRoyal | null
  children: CrownRoyal[]
  // A ruler under age at the succession rules under a regent until then: the widowed consort, or a council.
  regent?: { name: string | null; until: number }
  // A kinsman called to the throne (no child of the last ruler lived).
  kinsman?: boolean
}

// ---- Draws ------------------------------------------------------------------------------------------------------------

function mix(...values: number[]) {
  let h = 0x811c9dc5
  for (const v of values) {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
    h ^= h >>> 13
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

const between = (r: number, [lo, hi]: readonly number[]) => lo + (hi - lo) * r

// A lobby whose season start is not known yet counts from a fixed day, so the house is still the same for everyone.
const FALLBACK_EPOCH = Date.UTC(2026, 9, 1)

const anchorOf = (key: CrownKey) => {
  const Y = yearMs()
  return Math.floor((key.seasonStart ?? FALLBACK_EPOCH) / Y) * Y
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
export const regnalOf = (n: number) => (n <= 1 ? '' : ROMAN[n] ?? String(n))

// ---- Building the house ---------------------------------------------------------------------------------------------

interface Built {
  reigns: CrownReign[]
  // The next reign to draw: its ruler and when it begins, and whether a regent rules for him.
  next: { ruler: CrownRoyal; from: number; regent?: CrownReign['regent']; kinsman?: boolean }
  ids: number
}

const cache = new Map<string, Built>()

function build(key: CrownKey, crown: number): Built {
  const id = `${key.lobbyKey ?? 0}|${anchorOf(key)}|${crown}`
  const hit = cache.get(id)
  if (hit) return hit
  const h = H()
  const Y = yearMs()
  const lk = key.lobbyKey ?? 0
  const r = (...salt: number[]) => mix(lk, crown, 7717, ...salt) / 4294967296
  const anchor = anchorOf(key)
  const built: Built = { reigns: [], next: null as unknown as Built['next'], ids: 1 }
  const royal = (sex: 'm' | 'f', bornAt: number, avoid: string[] = []): CrownRoyal => {
    const pid = built.ids++
    const names = balance.dynasty.names[sex]
    const at0 = Math.floor(r(pid, 1) * names.length) % names.length
    let name = names[at0]
    for (let i = 1; i < names.length && avoid.includes(name); i++) name = names[(at0 + i) % names.length]
    const skill = (s: number) => Math.max(0, Math.min(10, Math.round(1 + r(pid, s) * 9)))
    const deathAt = bornAt + between(r(pid, 3) ** 0.8, h.death.atAge) * Y
    return { id: pid, name, sex, bornAt, deathAt, skills: { finance: skill(4), people: skill(5), military: skill(6) }, trait: CROWN_TRAITS[Math.floor(r(pid, 7) * CROWN_TRAITS.length) % CROWN_TRAITS.length] }
  }
  // The ruler at the season's start, and the ancestors before (only their names and reigns are told).
  const first = h.firstRuler
  const age0 = between(r(1, 11), first.age)
  const ruler0 = royal(r(1, 12) < first.queenChance ? 'f' : 'm', anchor - age0 * Y)
  const from0 = Math.max(ruler0.bornAt + h.comingOfAge * Y, anchor - between(r(1, 13), first.reignYears) * Y)
  let to = from0
  const ancestors: CrownReign[] = []
  for (let j = 1; j <= h.ancestors; j++) {
    const len = between(r(2, j), h.ancestorReignYears) * Y
    const ruler = royal(r(3, j) < first.queenChance ? 'f' : 'm', to - (len + between(r(4, j), [24, 40]) * Y))
    ruler.deathAt = to
    ancestors.unshift({ n: -j, ruler, regnal: 1, from: to - len, to, consort: null, children: [] })
    to -= len
  }
  ancestors.forEach((a, i) => (a.regnal = ancestors.slice(0, i).filter((x) => x.ruler.name === a.ruler.name).length + 1))
  built.reigns = ancestors
  built.next = { ruler: ruler0, from: from0 }
  cache.set(id, built)
  return built
}

// Draws reigns until one runs past `at`.
function extend(key: CrownKey, crown: number, at: number): Built {
  const built = build(key, crown)
  const h = H()
  const Y = yearMs()
  const lk = key.lobbyKey ?? 0
  const r = (...salt: number[]) => mix(lk, crown, 9133, ...salt) / 4294967296
  const royal = (sex: 'm' | 'f', bornAt: number, avoid: string[] = []): CrownRoyal => {
    const pid = built.ids++
    const names = balance.dynasty.names[sex]
    const at0 = Math.floor(r(pid, 1) * names.length) % names.length
    let name = names[at0]
    for (let i = 1; i < names.length && avoid.includes(name); i++) name = names[(at0 + i) % names.length]
    const skill = (s: number) => Math.max(0, Math.min(10, Math.round(1 + r(pid, s) * 9)))
    const deathAt = bornAt + between(r(pid, 3) ** 0.8, h.death.atAge) * Y
    return { id: pid, name, sex, bornAt, deathAt, skills: { finance: skill(4), people: skill(5), military: skill(6) }, trait: CROWN_TRAITS[Math.floor(r(pid, 7) * CROWN_TRAITS.length) % CROWN_TRAITS.length] }
  }
  let guard = 0
  while ((built.reigns.length === 0 || built.reigns[built.reigns.length - 1].to <= at) && guard++ < 2000) {
    const { ruler, from, regent, kinsman } = built.next
    const n = built.reigns.filter((x) => x.n >= 0).length
    // The consort: a wife a few years younger, or a husband a few years older, wed young.
    const wedAt = ruler.bornAt + between(r(ruler.id, 21), h.marriageAge) * Y
    const gap = between(r(ruler.id, 22), h.consortGap) * Y
    const consort = royal(ruler.sex === 'm' ? 'f' : 'm', ruler.sex === 'm' ? ruler.bornAt + gap : ruler.bornAt - gap, [ruler.name])
    if (consort.deathAt < wedAt) consort.deathAt = wedAt + between(r(ruler.id, 23), [6, 20]) * Y
    // Their children, while both live and the mother is young enough.
    const mother = ruler.sex === 'f' ? ruler : consort
    const b = h.births
    const children: CrownRoyal[] = []
    let t = wedAt + between(r(ruler.id, 24), b.firstYears) * Y
    const most = 1 + (Math.floor(r(ruler.id, 25) * b.max) % b.max)
    for (let c = 0; c < most; c++) {
      if (t >= ruler.deathAt || t >= consort.deathAt || (t - mother.bornAt) / Y > b.motherMaxAge) break
      children.push(royal(r(ruler.id, 30 + c) < b.son ? 'm' : 'f', t, [ruler.name, consort.name, ...children.map((x) => x.name)]))
      t += between(r(ruler.id, 40 + c), b.everyYears) * Y
    }
    const end = Math.max(from + Y * 0.25, ruler.deathAt)
    ruler.deathAt = end
    const same = built.reigns.filter((x) => x.ruler.name === ruler.name).length
    built.reigns.push({ n, ruler, regnal: same + 1, from, to: end, consort, children, ...(regent && { regent }), ...(kinsman && { kinsman }) })
    // The heir: the eldest living son, else the eldest living daughter, else a kinsman of age.
    const living = children.filter((c) => c.deathAt > end)
    const heir = living.find((c) => c.sex === 'm') ?? living[0] ?? null
    if (heir) {
      const of = heir.bornAt + h.comingOfAge * Y
      const nextRegent = of > end ? { name: consort.deathAt > end ? consort.name : null, until: of } : undefined
      if (heir.deathAt <= end) heir.deathAt = end + Y
      built.next = { ruler: heir, from: end, ...(nextRegent && { regent: nextRegent }) }
    } else {
      const k = royal('m', end - between(r(ruler.id, 50), h.kinsmanAge) * Y)
      if (k.deathAt <= end) k.deathAt = end + between(r(ruler.id, 51), [8, 24]) * Y
      built.next = { ruler: k, from: end, kinsman: true }
    }
  }
  return built
}

// Every reign begun by `at` (the ancestors first), the reigning one last.
export function crownReigns(key: CrownKey, crown: number, at: number): CrownReign[] {
  const built = extend(key, crown, at)
  return built.reigns.filter((x) => x.from <= at)
}

export function crownReignAt(key: CrownKey, crown: number, at: number): CrownReign {
  const list = crownReigns(key, crown, at)
  return list[list.length - 1]
}

export const crownAgeOf = (p: Pick<CrownRoyal, 'bornAt'>, at: number) => Math.max(0, (at - p.bornAt) / yearMs())
export const crownTitleOf = (p: Pick<CrownRoyal, 'sex'>) => (p.sex === 'm' ? 'Kral' : 'Kraliçe')

// "Kral Orhan II" / "Kraliçe Selcan".
export function crownRulerTitle(reign: Pick<CrownReign, 'ruler' | 'regnal'>) {
  const roman = regnalOf(reign.regnal)
  return `${crownTitleOf(reign.ruler)} ${reign.ruler.name}${roman ? ` ${roman}` : ''}`
}

export const crownRulerName = (key: CrownKey, crown: number, at: number) => crownRulerTitle(crownReignAt(key, crown, at))

// The house as it stands at `at`: the ruler and the reign, the consort (if alive), the children living and dead, the
// line of succession (the living children, sons first, by age), the regent while one rules, and the rulers before.
export function crownHouseAt(key: CrownKey, crown: number, at: number) {
  const list = crownReigns(key, crown, at)
  const reign = list[list.length - 1]
  const consort = reign.consort && reign.consort.deathAt > at ? reign.consort : null
  const born = reign.children.filter((c) => c.bornAt <= at)
  const living = born.filter((c) => c.deathAt > at)
  const line = [...living.filter((c) => c.sex === 'm'), ...living.filter((c) => c.sex === 'f')]
  const regent = reign.regent && reign.regent.until > at ? reign.regent : null
  return {
    reign,
    ruler: reign.ruler,
    title: crownRulerTitle(reign),
    consort,
    widowed: !!reign.consort && !consort && reign.consort.bornAt <= at,
    children: born,
    line,
    heir: line[0] ?? null,
    regent,
    past: list.slice(0, -1).reverse().slice(0, H().history),
  }
}

// The reigns begun after `from` up to `to` (successions in between; the newest last).
export const crownSuccessions = (key: CrownKey, crown: number, from: number, to: number) => crownReigns(key, crown, to).filter((x) => x.from > from && x.n > 0)

export const crownTraitSpec = (trait: CrownTrait) => H().traits[trait]

// What the reigning ruler's trait does: the share of the treasury the crown's collectors ask (×) and its patrol's tip (×).
export function crownTraitAt(key: CrownKey, crown: number, at: number) {
  const reign = crownReignAt(key, crown, at)
  return { trait: reign.ruler.trait, ...crownTraitSpec(reign.ruler.trait) }
}

// The calendar year of a moment (for the reigns' dates).
export const crownYearOf = (key: CrownKey, at: number) => calendarAt(at, key.seasonStart ?? FALLBACK_EPOCH).year
