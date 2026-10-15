import { balance } from './balance'
import type { BuildingKind, Kingdom, Stock } from './economy'
import { FISH_LIMIT } from './fishing'

// The mini-games (CLAUDE.md §6.5): the archery butts at the barracks, the anvil at the forge and the caravan road at the
// trade post, besides the fisher's hut. Like fishing, each run is a short game with fixed steps (60 a second) and a
// seed the server hands out when it begins. The player's screen sends back only the steps at which the button went
// down or up; the server plays the same game again from the seed and those presses, and the score it gets is the one
// that counts (for the reward and the leaderboards).
//
// Only plain arithmetic is used in the games (no Math.sin and the like), so every browser and the server play them
// to the same last bit.

const M = balance.minigames

export type ArcadeGame = 'archery' | 'anvil' | 'caravan'
export type MiniGame = 'fishing' | ArcadeGame
export const ARCADE_GAMES: readonly ArcadeGame[] = ['archery', 'anvil', 'caravan']
export const MINI_GAMES: readonly MiniGame[] = ['fishing', 'archery', 'anvil', 'caravan']
export const MINI_STEP = 1 / 60
export const MINI_MAX_TOGGLES = M.maxToggles

export interface Run {
  step: number
  over: boolean
  score: number
}

export interface Playable<S extends Run> {
  state: S
  // One fixed step with the button held or not.
  advance(held: boolean): S
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const between = (random: () => number, [lo, hi]: readonly number[]) => lo + random() * (hi - lo)

// ---- Archery: the butts at the barracks ------------------------------------------------------------------------------
//
// The bow's aim wanders over the target. Hold to draw: the aim steadies for a moment, then the arm begins to tremble;
// let go to loose (a bow drawn too briefly is only lowered). Every arrow has its wind, which carries it sideways: aim
// off the centre against it. An arrow scores 10 in the gold, one less for every few pixels out.

const A = M.archery
export const ARCHERY_LIMIT = A.limitSeconds * 60
export const ARCHERY_FIELD = A.field as [number, number]

export interface ArcheryHit {
  x: number
  y: number
  points: number
}

export interface ArcheryState extends Run {
  // The aim, from the target's centre (pixels), its speed and the spot it wanders to.
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  retarget: number
  drawing: boolean
  // Seconds the bow has been held drawn.
  drawn: number
  // The arrow in flight: where it lands and how long until it does.
  arrow: { x: number; y: number; t: number } | null
  hits: ArcheryHit[]
  // The wind on the arrow to come (pixels it carries the arrow sideways).
  wind: number
  // Seconds until the next arrow may be drawn.
  pause: number
  shot: number
}

export function archeryGame(seed: number): Playable<ArcheryState> {
  const random = seeded(seed)
  const [sx, sy] = A.sway
  const s: ArcheryState = {
    step: 0,
    over: false,
    score: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    retarget: 0,
    drawing: false,
    drawn: 0,
    arrow: null,
    hits: [],
    wind: Math.round((random() * 2 - 1) * A.wind),
    pause: A.pauseSeconds,
    shot: 0,
  }
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = MINI_STEP
    s.retarget -= dt
    if (s.retarget <= 0) {
      s.tx = (random() * 2 - 1) * sx
      s.ty = (random() * 2 - 1) * sy
      s.retarget = between(random, A.retargetSeconds)
    }
    // Drawn the bow is steady for a while, then trembles more and more.
    const jx = random() - 0.5
    const jy = random() - 0.5
    const steady = s.drawing && s.drawn < A.steadySeconds
    const tremble = s.drawing && s.drawn >= A.steadySeconds ? A.tremble * Math.min(3, 1 + s.drawn - A.steadySeconds) : 0
    s.vx += ((s.tx - s.x) * A.pull - s.vx * A.damping) * dt + jx * tremble
    s.vy += ((s.ty - s.y) * A.pull - s.vy * A.damping) * dt + jy * tremble
    const pace = steady ? A.steady : 1
    s.x = clamp(s.x + s.vx * dt * pace, -sx - 10, sx + 10)
    s.y = clamp(s.y + s.vy * dt * pace, -sy - 10, sy + 10)
    // The bow.
    if (s.pause > 0) s.pause -= dt
    if (s.drawing) {
      if (held) s.drawn += dt
      else {
        s.drawing = false
        if (s.drawn >= A.minDrawSeconds) {
          s.arrow = { x: s.x + s.wind, y: s.y, t: A.flightSeconds }
          s.shot++
        }
      }
    } else if (held && s.pause <= 0 && !s.arrow && s.shot < A.arrows) {
      s.drawing = true
      s.drawn = 0
    }
    // The arrow lands.
    if (s.arrow) {
      s.arrow.t -= dt
      if (s.arrow.t <= 0) {
        const { x, y } = s.arrow
        const points = Math.max(0, A.pointsPerArrow - Math.floor(Math.sqrt(x * x + y * y) / A.pixelsPerPoint))
        s.hits.push({ x, y, points })
        s.score += points
        s.arrow = null
        s.pause = A.pauseSeconds
        s.wind = Math.round((random() * 2 - 1) * A.wind)
      }
    }
    s.step++
    if ((s.shot >= A.arrows && !s.arrow) || s.step >= ARCHERY_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- The anvil at the forge ------------------------------------------------------------------------------------------
//
// The smith's marks slide along the blade towards the hammer: press as each one reaches it. Right on it is a fine blow,
// a little off a fair one, more a poor one; a blow with no mark under it costs a point and breaks the run of blows, as
// a mark let pass does. A long run adds to every blow.

const N = M.anvil
export const ANVIL_LIMIT = N.limitSeconds * 60
export const ANVIL_TRAVEL = N.travelSeconds * 60
export const ANVIL_WINDOW = N.window[N.window.length - 1]

// 0: still to come, 1 fine, 2 fair, 3 poor, -1 let pass.
export type AnvilGrade = 0 | 1 | 2 | 3 | -1

export interface AnvilState extends Run {
  // The step each mark reaches the hammer, and how it was struck.
  notes: number[]
  grades: AnvilGrade[]
  combo: number
  bestCombo: number
  // The last blow: its grade (0 for a blow at nothing) and step, for the screen.
  last: { grade: AnvilGrade; step: number } | null
  wasHeld: boolean
}

export function anvilGame(seed: number): Playable<AnvilState> {
  const random = seeded(seed)
  const notes: number[] = []
  let t = N.leadSeconds * 60
  for (let i = 0; i < N.strikes; i++) {
    notes.push(Math.round(t))
    t += N.gaps[Math.floor(random() * N.gaps.length)] * 60
  }
  const s: AnvilState = { step: 0, over: false, score: 0, notes, grades: notes.map(() => 0), combo: 0, bestCombo: 0, last: null, wasHeld: false }
  const advance = (held: boolean) => {
    if (s.over) return s
    if (held && !s.wasHeld) {
      // The nearest mark not yet struck within reach of the hammer.
      let pick = -1
      for (let i = 0; i < s.notes.length; i++) {
        if (s.grades[i] !== 0) continue
        const d = Math.abs(s.notes[i] - s.step)
        if (d <= ANVIL_WINDOW && (pick < 0 || d < Math.abs(s.notes[pick] - s.step))) pick = i
      }
      if (pick < 0) {
        s.score = Math.max(0, s.score - N.emptySwing)
        s.combo = 0
        s.last = { grade: 0, step: s.step }
      } else {
        const d = Math.abs(s.notes[pick] - s.step)
        const g = N.window.findIndex((w) => d <= w)
        s.grades[pick] = (g + 1) as AnvilGrade
        s.combo++
        s.bestCombo = Math.max(s.bestCombo, s.combo)
        s.score += N.points[g] + Math.floor(s.combo / N.comboEvery)
        s.last = { grade: (g + 1) as AnvilGrade, step: s.step }
      }
    }
    s.wasHeld = held
    for (let i = 0; i < s.notes.length; i++) {
      if (s.grades[i] === 0 && s.step - s.notes[i] > ANVIL_WINDOW) {
        s.grades[i] = -1
        s.combo = 0
      }
    }
    s.step++
    if (s.step > s.notes[s.notes.length - 1] + ANVIL_WINDOW + 30 || s.step >= ANVIL_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- The caravan road at the trade post ------------------------------------------------------------------------------
//
// The merchant's camel walks a road that scrolls by. Hold to lead it up the road, let go and it drifts down. Coins and
// now and then a gem lie on the road; rocks trip the camel and lose it some of what it gathered.

const C = M.caravan
export const CARAVAN_LIMIT = C.limitSeconds * 60
export const CARAVAN_W = 200
export const CARAVAN_H = C.road

export interface CaravanThing {
  x: number
  y: number
  kind: 'coin' | 'gem' | 'rock'
  taken: boolean
}

export interface CaravanState extends Run {
  y: number
  vy: number
  things: CaravanThing[]
  spawn: number
  // Seconds the camel still stumbles after a rock (no more rocks count meanwhile).
  stumble: number
  coins: number
  gems: number
  rocks: number
}

export function caravanGame(seed: number): Playable<CaravanState> {
  const random = seeded(seed)
  const s: CaravanState = { step: 0, over: false, score: 0, y: C.road / 2, vy: 0, things: [], spawn: 0.8, stumble: 0, coins: 0, gems: 0, rocks: 0 }
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = MINI_STEP
    s.vy = clamp(s.vy + (held ? -C.lift : C.sink) * dt, -C.maxSpeed, C.maxSpeed)
    s.y += s.vy * dt
    if (s.y < 8 || s.y > C.road - 8) {
      s.y = clamp(s.y, 8, C.road - 8)
      s.vy = 0
    }
    s.spawn -= dt
    if (s.spawn <= 0) {
      const roll = random()
      const kind = roll < C.gemChance ? 'gem' : roll < C.gemChance + C.coinChance ? 'coin' : 'rock'
      s.things.push({ x: CARAVAN_W + 8, y: 10 + random() * (C.road - 20), kind, taken: false })
      s.spawn = between(random, C.spawnSeconds)
    }
    if (s.stumble > 0) s.stumble -= dt
    for (const t of s.things) {
      t.x -= C.speed * dt
      if (t.taken || Math.abs(t.x - C.camelX) >= C.reach || Math.abs(t.y - s.y) >= C.reach) continue
      if (t.kind === 'rock') {
        if (s.stumble > 0) continue
        t.taken = true
        s.rocks++
        s.score = Math.max(0, s.score - C.rock)
        s.stumble = C.stumbleSeconds
      } else {
        t.taken = true
        if (t.kind === 'gem') s.gems++
        else s.coins++
        s.score += t.kind === 'gem' ? C.gem : C.coin
      }
    }
    if (s.things.length > 0 && s.things[0].x < -12) s.things = s.things.filter((t) => t.x >= -12)
    s.step++
    if (s.step >= CARAVAN_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- Shared by all of them ---------------------------------------------------------------------------------------------

export function makeGame(game: ArcadeGame, seed: number): Playable<Run> {
  return game === 'archery' ? archeryGame(seed) : game === 'anvil' ? anvilGame(seed) : caravanGame(seed)
}

// Plays a whole run from the steps at which the button went down or up (in order): its score and how many steps it
// lasted.
export function replayGame(game: ArcadeGame, seed: number, toggles: number[]) {
  const run = makeGame(game, seed)
  let held = false
  let next = 0
  while (!run.state.over) {
    while (next < toggles.length && toggles[next] <= run.state.step) {
      held = !held
      next++
    }
    run.advance(held)
  }
  return { score: run.state.score, steps: run.state.step }
}

// What the player's screen sends: whole step numbers, never going back, not too many.
export const validToggles = (toggles: unknown): toggles is number[] =>
  Array.isArray(toggles) &&
  toggles.length <= MINI_MAX_TOGGLES &&
  toggles.every((t: unknown, n: number) => Number.isInteger(t) && (t as number) >= 0 && (t as number) <= 100_000 && (n === 0 || (t as number) >= toggles[n - 1]))

// A run cannot be over sooner than it takes to play (a little slack for the network).
export const playedInTime = (startedAt: number, steps: number, at: number) => at - startedAt >= (steps / 60) * 1000 - M.slackMs

export const isArcadeGame = (v: unknown): v is ArcadeGame => (ARCADE_GAMES as readonly unknown[]).includes(v)

export const gameBuilding = (game: ArcadeGame) => M[game].building as 'barracks' | 'forge' | 'tradePost'

// The entertainment hall (CLAUDE.md §7.8) has every game: each one is played there too, as well as at its own building.
export const GAME_HALL = M.hall as 'tavern'
export const gameBuildings = (game: MiniGame): BuildingKind[] => [game === 'fishing' ? 'fisherHut' : gameBuilding(game), GAME_HALL]

export const gameReadyAt = (k: Kingdom, game: ArcadeGame) => (k.minigames?.[game]?.lastAt ?? -Infinity) + M.cooldownSeconds * 1000

export type GameError = 'building' | 'busy'

export function gameError(k: Kingdom, game: ArcadeGame, at: number): GameError | null {
  const kinds = gameBuildings(game)
  if (!k.buildings.some((b) => kinds.includes(b.kind) && b.doneAt <= at)) return 'building'
  if (gameReadyAt(k, game) > at) return 'busy'
  return null
}

// What a score brings: so much per point of each good, up to a cap.
export function gameReward(game: ArcadeGame, score: number): Partial<Stock> {
  const spec = M[game] as { reward: Record<string, number>; cap: Record<string, number> }
  const out: Partial<Stock> = {}
  for (const [r, per] of Object.entries(spec.reward)) {
    const v = Math.min(spec.cap[r] ?? Infinity, Math.round(Math.max(0, score) * per))
    if (v > 0) out[r as keyof Stock] = v
  }
  return out
}

// The most a game's score can be (for the screens).
export const MAX_SCORE: Partial<Record<MiniGame, number>> = {
  fishing: M.fishing.caughtBase + M.fishing.speedBonus,
  archery: A.arrows * A.pointsPerArrow,
  anvil: N.strikes * N.points[0] + Array.from({ length: N.strikes }, (_, i) => Math.floor((i + 1) / N.comboEvery)).reduce((a, b) => a + b, 0),
}

// A cast's score: nothing for a fish that got away, more the sooner it was caught.
export const fishScore = (caught: boolean, steps: number) => (caught ? Math.round(M.fishing.caughtBase + M.fishing.speedBonus * Math.max(0, 1 - steps / FISH_LIMIT)) : 0)
