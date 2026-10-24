import { balance } from './balance'
import { changeCrownRelation, crownRelation } from './crowns'
import { GOODS, goldCap, palaceLevel, storageCap } from './economy'
import type { Cost, Good, Kingdom, Resource, Stock } from './economy'

// The realm's great works and what a rich lord spends his full stores on (CLAUDE.md §9.10): three works of five stages
// each, built by delivering great loads of gold and goods stage by stage (in as many deliveries as it takes: a stage
// asks more than the stores hold), each stage then built over a while; every stage adds a lasting, modest bonus and
// score, the last one the liege's favour. Besides them, a festival for the people and gifts of goods to the liege.
// Values in config/balance/projects.json.

const P = () => balance.projects
const W = () => balance.projects.works

export type ProjectId = keyof typeof balance.projects.works.kinds
export const PROJECT_IDS = Object.keys(W().kinds) as ProjectId[]
export interface ProjectState {
  // Stages finished (built), what has been delivered toward the next one, and when the stage being built is done.
  stage: number
  paid: Partial<Stock>
  until?: number
}
export type Projects = Partial<Record<ProjectId, ProjectState>>

interface WorkSpec {
  base: Cost
  happinessPerStage?: number
  tradePerStage?: number
  battlePerStage?: number
}
const spec = (id: string) => (W().kinds as Record<string, WorkSpec>)[id]

export const projectStages = () => W().stageFactors.length

// What stage `stage` (0-based) asks in all.
export function projectStageCost(id: ProjectId, stage: number): Cost {
  const s = spec(id)
  const f = W().stageFactors[stage]
  if (!s || f === undefined) return {}
  const step = W().roundTo
  return Object.fromEntries(Object.entries(s.base).map(([r, v]) => [r, Math.round(((v ?? 0) * f) / step) * step])) as Cost
}
export const projectStageMs = (stage: number) => (W().stageSeconds[stage] ?? 0) * 1000

const NONE: ProjectState = { stage: 0, paid: {} }
export const projectOf = (k: Pick<Kingdom, 'projects'>, id: ProjectId): ProjectState => k.projects?.[id] ?? NONE

// Stages finished at `at` (a stage being built counts once its time is up, before `advance` books it).
export function projectStage(k: Pick<Kingdom, 'projects'>, id: ProjectId, at: number) {
  const p = projectOf(k, id)
  return p.stage + (p.until !== undefined && p.until <= at ? 1 : 0)
}
export const projectBuilding = (k: Pick<Kingdom, 'projects'>, id: ProjectId, at: number) => {
  const p = projectOf(k, id)
  return p.until !== undefined && p.until > at
}

// What the works add up to now: to the people's happiness, the merchant's gold, the soldiers' rolls and the score.
export function projectEffects(k: Pick<Kingdom, 'projects'>, at: number) {
  const out = { happiness: 0, trade: 0, battle: 0, growth: 0, done: 0 }
  if (!k.projects) return out
  const stages = projectStages()
  for (const id of PROJECT_IDS) {
    const n = projectStage(k, id, at)
    if (n <= 0) continue
    const s = spec(id)
    out.happiness += n * (s.happinessPerStage ?? 0)
    out.trade += n * (s.tradePerStage ?? 0)
    out.battle += n * (s.battlePerStage ?? 0)
    out.growth += n * W().growthPerStage + (n >= stages ? W().completeGrowth : 0)
    if (n >= stages) out.done++
  }
  return out
}

// What remains to be delivered for the stage under way.
export function projectRemaining(k: Pick<Kingdom, 'projects'>, id: ProjectId): Cost {
  const p = projectOf(k, id)
  const cost = projectStageCost(id, p.stage)
  return Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, Math.max(0, (v ?? 0) - (p.paid[r as Resource] ?? 0))])) as Cost
}

// What a delivery would take from the stores now: as much of what remains as there is, keeping a share of each store's
// room back so that a delivery never leaves the people hungry or the treasury bare.
export function projectGift(k: Kingdom, id: ProjectId, at: number): Cost {
  const keep = W().keep
  const room = (r: Resource) => storageCap(k, at, r)
  const vault = goldCap(k, at)
  const out: Cost = {}
  for (const [r, need] of Object.entries(projectRemaining(k, id)) as [Resource, number][]) {
    const reserve = r === 'gold' ? vault * keep.gold : room(r) * keep.goods
    const v = Math.floor(Math.min(need, Math.max(0, k.stock[r] - reserve)))
    if (v > 0) out[r] = v
  }
  return out
}

export function projectError(k: Kingdom, id: ProjectId, at: number): 'palace' | 'done' | 'building' | 'nothing' | null {
  if (!spec(id)) return 'done'
  if (palaceLevel(k, at) < W().minPalace) return 'palace'
  if (projectStage(k, id, at) >= projectStages()) return 'done'
  if (projectOf(k, id).until !== undefined) return 'building'
  if (Object.keys(projectGift(k, id, at)).length === 0) return 'nothing'
  return null
}

// A delivery: the goods go into the stage; once all it asks is in, the builders set to work on it.
export function giveToProject(k: Kingdom, id: ProjectId, at: number): Kingdom {
  if (projectError(k, id, at)) return k
  const gift = projectGift(k, id, at)
  const p = projectOf(k, id)
  const paid = { ...p.paid }
  const stock = { ...k.stock }
  for (const [r, v] of Object.entries(gift) as [Resource, number][]) {
    stock[r] -= v
    paid[r] = (paid[r] ?? 0) + v
  }
  const full = Object.entries(projectStageCost(id, p.stage)).every(([r, v]) => (paid[r as Resource] ?? 0) >= (v ?? 0))
  const next: ProjectState = full ? { stage: p.stage, paid, until: at + projectStageMs(p.stage) } : { stage: p.stage, paid }
  return { ...k, stock, projects: { ...k.projects, [id]: next } }
}

// Stages whose building is over by `now` (advance books them): the stage counted, and the liege's favour once a work
// is finished.
export function settleProjects(k: Kingdom, now: number): { kingdom: Kingdom; done: { id: ProjectId; stage: number; finished: boolean }[] } {
  const done: { id: ProjectId; stage: number; finished: boolean }[] = []
  if (!k.projects) return { kingdom: k, done }
  let projects: Projects | null = null
  let next = k
  for (const id of PROJECT_IDS) {
    const p = k.projects[id]
    if (!p || p.until === undefined || p.until > now) continue
    const stage = p.stage + 1
    projects = { ...(projects ?? k.projects), [id]: { stage, paid: {} } }
    const finished = stage >= projectStages()
    if (finished && next.liege !== undefined) next = changeCrownRelation(next, next.liege, W().completeCrownRelation)
    done.push({ id, stage, finished })
  }
  return projects ? { kingdom: { ...next, projects }, done } : { kingdom: k, done }
}

// ---- The festival ----------------------------------------------------------------------------------------------------

const F = () => P().festival
export const festivalCost = () => F().cost as Cost
export const festivalOn = (k: Pick<Kingdom, 'festivalUntil'>, at: number) => (k.festivalUntil ?? 0) > at
export const festivalHappiness = (k: Pick<Kingdom, 'festivalUntil'>, at: number) => (festivalOn(k, at) ? F().happiness : 0)
export const festivalReadyAt = (k: Pick<Kingdom, 'festivalAt'>) => (k.festivalAt ?? -Infinity) + F().cooldownSeconds * 1000

const affords = (stock: Stock, cost: Cost) => Object.entries(cost).every(([r, v]) => stock[r as Resource] >= (v ?? 0))

export function festivalError(k: Kingdom, at: number): 'palace' | 'wait' | 'cost' | null {
  if (palaceLevel(k, at) < F().minPalace) return 'palace'
  if (festivalReadyAt(k) > at) return 'wait'
  if (!affords(k.stock, festivalCost())) return 'cost'
  return null
}

export function holdFestival(k: Kingdom, at: number): Kingdom {
  if (festivalError(k, at)) return k
  const stock = { ...k.stock }
  for (const [r, v] of Object.entries(festivalCost()) as [Resource, number][]) stock[r] -= v
  return { ...k, stock, festivalAt: at, festivalUntil: at + F().seconds * 1000 }
}

// ---- Gifts of goods to the liege -------------------------------------------------------------------------------------

const D = () => P().donation
export const donationUnits = () => D().units
export const donationReadyAt = (k: Pick<Kingdom, 'donatedAt'>) => (k.donatedAt ?? -Infinity) + D().cooldownSeconds * 1000

export function donationError(k: Kingdom, good: Good, at: number): 'liege' | 'palace' | 'wait' | 'cost' | 'max' | null {
  if (!(GOODS as readonly string[]).includes(good)) return 'cost'
  if (k.liege === undefined) return 'liege'
  if (palaceLevel(k, at) < D().minPalace) return 'palace'
  if (crownRelation(k, k.liege) >= 100) return 'max'
  if (donationReadyAt(k) > at) return 'wait'
  if (k.stock[good] < D().units) return 'cost'
  return null
}

export function donate(k: Kingdom, good: Good, at: number): Kingdom {
  if (donationError(k, good, at)) return k
  const next = changeCrownRelation(k, k.liege!, D().relation)
  return { ...next, stock: { ...k.stock, [good]: k.stock[good] - D().units }, donatedAt: at }
}
