import { balance } from './balance'
import { GOODS, soldiersOf } from './economy'
import type { FisherEntry, Kingdom, Stock } from './economy'

// The mysterious fisher's hut (CLAUDE.md §6.4): besides a little food and the gold it finds in the river, a cast of
// the line (a hard little game on the player's screen) may bring up a bag of goods or a bottle holding word of
// another kingdom: vaguer than a spy's report, "it seems to have more than 1500 gold". The server draws the catch.

const F = balance.economy.fishing

export type FishError = 'building' | 'busy'

export const castReadyAt = (k: Kingdom) => (k.lastFishAt ?? -Infinity) + F.cooldownSeconds * 1000

export function fishError(k: Kingdom, at: number): FishError | null {
  // At the hut, or at the entertainment hall, which has every mini-game (CLAUDE.md §6.5).
  if (!k.buildings.some((b) => (b.kind === 'fisherHut' || b.kind === balance.minigames.hall) && b.doneAt <= at)) return 'building'
  if (castReadyAt(k) > at) return 'busy'
  return null
}

// A round number not above `v`: 1, 1.5, 2, 2.5, … times a power of ten.
function roundDown(v: number) {
  if (v < 10) return Math.max(0, Math.floor(v))
  const mag = 10 ** Math.floor(Math.log10(v))
  const step = mag / 2
  return Math.floor(v / step) * step
}

export interface Rival {
  name: string
  color: string | null
  kingdom: Kingdom
}

// What a successful cast brings up (`random` gives numbers in [0, 1)).
export function castReward(random: () => number, rivals: Rival[], at: number): FisherEntry {
  if (rivals.length === 0 || random() < F.bagChance) {
    const goods: Partial<Stock> = {}
    // Two of the goods, sometimes some gold.
    const picks = [...GOODS].sort(() => random() - 0.5).slice(0, 2)
    for (const g of picks) goods[g] = Math.round(F.bag.min + random() * (F.bag.max - F.bag.min))
    if (random() < F.bag.goldChance) goods.gold = Math.round(F.bag.min + random() * (F.bag.max - F.bag.min))
    return { at, kind: 'bag', goods }
  }
  const rival = rivals[Math.floor(random() * rivals.length)]
  const metrics = ['gold', 'food', 'materials', 'arms', 'soldiers'] as const
  const metric = metrics[Math.floor(random() * metrics.length)]
  const value = metric === 'soldiers' ? soldiersOf(rival.kingdom) : rival.kingdom.stock[metric]
  // Somewhat under the truth, rounded: "more than …".
  return { at, kind: 'bottle', about: rival.name, color: rival.color, metric, atLeast: roundDown(value * F.bottleShare) }
}

// The fisher's log with a new entry on top.
export const logCast = (k: Kingdom, entry: FisherEntry) => [entry, ...(k.fisherLog ?? [])].slice(0, F.logSize)

// ---- The fishing game, played the same on the player's screen and on the server ----------------------------------
//
// A cast is a short game with fixed steps (60 a second) and a seed the server hands out when the line is cast. The
// player's screen sends back only when the button was pressed and released (as step numbers); the server plays the
// same game again with the same seed and presses and so decides the catch itself.

// How the game plays (economy.json → fishing.game): the green zone's height, how long a cast lasts, how the bar fills
// and drains, how restless the fish is and how the zone answers the button.
const G = F.game
export const FISH_STEP = 1 / 60
export const FISH_H = 220
export const FISH_ZONE = G.zone
export const FISH_LIMIT = G.limitSeconds * 60
// The most presses and releases a cast may report.
export const FISH_MAX_TOGGLES = 3000

export interface FishState {
  fish: number
  fishV: number
  target: number
  retarget: number
  zone: number
  zoneV: number
  progress: number
  step: number
  inside: boolean
  over: boolean
  caught: boolean
}

function seeded(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function fishGame(seed: number) {
  const random = seeded(seed)
  const s: FishState = { fish: FISH_H / 2, fishV: 0, target: FISH_H / 2, retarget: 0, zone: FISH_H - FISH_ZONE, zoneV: 0, progress: G.startProgress, step: 0, inside: false, over: false, caught: false }
  // One fixed step with the button held or not.
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = FISH_STEP
    // The fish picks a new spot every so often, sometimes with a sudden dart.
    s.retarget -= dt
    if (s.retarget <= 0) {
      s.target = 10 + random() * (FISH_H - 20)
      s.retarget = G.retargetSeconds[0] + random() * (G.retargetSeconds[1] - G.retargetSeconds[0])
    }
    const dart = random() < G.dartChance ? 6 : 1
    s.fishV += ((s.target - s.fish) * G.pull - s.fishV * G.damping) * dt * dart
    s.fish = Math.max(6, Math.min(FISH_H - 6, s.fish + s.fishV * dt))
    // The zone: lifted while held, pulled down by its weight, bouncing off the ends.
    s.zoneV += (held ? -G.lift : G.sink) * dt
    s.zone += s.zoneV * dt
    if (s.zone < 0) {
      s.zone = 0
      s.zoneV *= -0.3
    }
    if (s.zone > FISH_H - FISH_ZONE) {
      s.zone = FISH_H - FISH_ZONE
      s.zoneV *= -0.3
    }
    s.inside = s.fish >= s.zone && s.fish <= s.zone + FISH_ZONE
    s.progress = Math.max(0, Math.min(1, s.progress + (s.inside ? G.fillPerSecond : -G.drainPerSecond) * dt))
    s.step++
    if (s.progress >= 1 || s.progress <= 0 || s.step >= FISH_LIMIT) {
      s.over = true
      s.caught = s.progress >= 1
    }
    return s
  }
  return { state: s, advance }
}

// Plays a whole cast from the steps at which the button was pressed or released (in order): whether it was caught,
// and how many steps it lasted.
export function replayCast(seed: number, toggles: number[]) {
  const game = fishGame(seed)
  let held = false
  let next = 0
  while (!game.state.over) {
    while (next < toggles.length && toggles[next] <= game.state.step) {
      held = !held
      next++
    }
    game.advance(held)
  }
  return { caught: game.state.caught, steps: game.state.step }
}
