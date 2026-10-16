import { balance } from './balance'
import type { BuildingKind, Kingdom, Stock } from './economy'
import { FISH_LIMIT } from './fishing'

// The mini-games (CLAUDE.md §6.5): the archery butts at the barracks, the anvil at the forge, the caravan road at the
// trade post, the chopping block at the lumber camp, the harvest at the farm and the net at the dock, besides the
// fisher's hut. Like fishing, each run is a short game with fixed steps (60 a second) and a
// seed the server hands out when it begins. The player's screen sends back only the steps at which the button went
// down or up; the server plays the same game again from the seed and those presses, and the score it gets is the one
// that counts (for the reward and the leaderboards).
//
// Only plain arithmetic is used in the games (no Math.sin and the like), so every browser and the server play them
// to the same last bit.

const M = balance.minigames

export type ArcadeGame = 'archery' | 'anvil' | 'caravan' | 'woodsplit' | 'harvest' | 'net'
export type MiniGame = 'fishing' | ArcadeGame
// The games of the lordship's first buildings first (lumber camp, farm, dock, forge, trade post), then the barracks'.
export const ARCADE_GAMES: readonly ArcadeGame[] = ['woodsplit', 'harvest', 'net', 'anvil', 'caravan', 'archery']
export const MINI_GAMES: readonly MiniGame[] = ['fishing', ...ARCADE_GAMES]
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

// ---- Splitting logs at the lumber camp -------------------------------------------------------------------------------
//
// A power gauge swings up and down beside the chopping block. Press to bring the axe down: every log has its sweet
// band on the gauge (harder logs higher, narrower and with a quicker gauge). In the band's heart the log splits clean,
// elsewhere in it fairly; under it the axe sticks in the wood, over it the log splits but flies apart. Knotty logs are
// worth double, and a run of good blows adds to every blow.

const WS = M.woodsplit
export const WOODSPLIT_LIMIT = WS.limitSeconds * 60

// How a blow went: 1 clean, 2 good, 3 too hard (over the band), 4 stuck (under it).
export type SplitGrade = 1 | 2 | 3 | 4

export interface WoodLog {
  // The heart of the sweet band and half its width, on the gauge (0 … 1).
  core: number
  half: number
  // How fast the gauge runs for this log (whole sweeps a second).
  speed: number
  knotty: boolean
}

export interface WoodsplitState extends Run {
  meter: number
  dir: 1 | -1
  logs: WoodLog[]
  // The log on the block (logs.length once all are done).
  index: number
  blows: { grade: SplitGrade; points: number; step: number; log: number }[]
  combo: number
  bestCombo: number
  // Seconds until the next log is on the block.
  pause: number
  wasHeld: boolean
}

export function woodsplitGame(seed: number): Playable<WoodsplitState> {
  const random = seeded(seed)
  const logs: WoodLog[] = []
  for (let i = 0; i < WS.logs; i++) {
    const hard = random()
    logs.push({
      core: WS.core[0] + hard * (WS.core[1] - WS.core[0]),
      half: WS.halfWidth[1] - hard * (WS.halfWidth[1] - WS.halfWidth[0]),
      speed: WS.speed[0] + hard * (WS.speed[1] - WS.speed[0]),
      knotty: random() < WS.knotChance,
    })
  }
  const s: WoodsplitState = { step: 0, over: false, score: 0, meter: 0, dir: 1, logs, index: 0, blows: [], combo: 0, bestCombo: 0, pause: WS.leadSeconds, wasHeld: false }
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = MINI_STEP
    const log = s.logs[Math.min(s.index, s.logs.length - 1)]
    // The gauge runs up and down, bouncing off its ends.
    s.meter += s.dir * log.speed * 2 * dt
    if (s.meter > 1) {
      s.meter = 2 - s.meter
      s.dir = -1
    } else if (s.meter < 0) {
      s.meter = -s.meter
      s.dir = 1
    }
    if (s.pause > 0) s.pause -= dt
    else if (held && !s.wasHeld && s.index < s.logs.length) {
      const d = s.meter - log.core
      const grade: SplitGrade = Math.abs(d) <= log.half * WS.innerShare ? 1 : Math.abs(d) <= log.half ? 2 : d > 0 ? 3 : 4
      let points = grade === 4 ? 0 : WS.points[grade - 1]
      if (grade <= 2) {
        s.combo++
        s.bestCombo = Math.max(s.bestCombo, s.combo)
      } else s.combo = 0
      if (log.knotty) points *= WS.knotFactor
      if (grade <= 2) points += Math.floor(s.combo / WS.comboEvery)
      s.score += points
      s.blows.push({ grade, points, step: s.step, log: s.index })
      s.index++
      s.pause = grade === 4 ? WS.stuckSeconds : WS.pauseSeconds
    }
    s.wasHeld = held
    s.step++
    if ((s.index >= s.logs.length && s.pause <= 0) || s.step >= WOODSPLIT_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- The harvest at the farm -----------------------------------------------------------------------------------------
//
// The wheat comes past the reaper as he walks the field. Hold to swing the scythe: it cuts whatever stalks pass under
// it. Ripe wheat is worth a little, a golden sheaf more; green wheat cut too early costs a point, and a crow sitting on
// a stalk costs more (it flies off with grain). Swinging tires the reaper: when his strength runs out he must rest a
// while before the scythe cuts again.

const HV = M.harvest
export const HARVEST_LIMIT = HV.limitSeconds * 60
export const HARVEST_W = 256
export const HARVEST_REAPER = HV.reaperX

export type StalkKind = 'ripe' | 'golden' | 'green' | 'crow'

export interface Stalk {
  x: number
  kind: StalkKind
  // The step it was cut (0 while standing).
  cut: number
  id: number
}

export interface HarvestState extends Run {
  stalks: Stalk[]
  // Pixels of field until the next stalk, and the run of one kind being laid out.
  next: number
  run: { kind: StalkKind; left: number }
  // The reaper's strength (0 … 1) and whether he is resting.
  stamina: number
  tired: boolean
  swinging: boolean
  combo: number
  bestCombo: number
  cuts: number
  crows: number
  greens: number
  missed: number
  made: number
}

export function harvestGame(seed: number): Playable<HarvestState> {
  const random = seeded(seed)
  const pick = (): StalkKind => {
    const r = random()
    const c = HV.chances
    return r < c.golden ? 'golden' : r < c.golden + c.crow ? 'crow' : r < c.golden + c.crow + c.green ? 'green' : 'ripe'
  }
  const s: HarvestState = {
    step: 0,
    over: false,
    score: 0,
    stalks: [],
    next: 0,
    run: { kind: 'ripe', left: 4 },
    stamina: 1,
    tired: false,
    swinging: false,
    combo: 0,
    bestCombo: 0,
    cuts: 0,
    crows: 0,
    greens: 0,
    missed: 0,
    made: 0,
  }
  // Lays the next stalk at x; returns the room before the one after it.
  const lay = (x: number) => {
    s.stalks.push({ x, kind: s.run.kind, cut: 0, id: s.made++ })
    s.run.left--
    let room = HV.spacing
    if (s.run.left <= 0) {
      const kind = pick()
      const [lo, hi] = HV.runs[kind]
      s.run = { kind, left: lo + Math.floor(random() * (hi - lo + 1)) }
      room += between(random, HV.gap)
    }
    return room
  }
  // The field already has wheat standing a little way ahead of the reaper.
  let x = HV.reaperX + HV.lead
  while (x < HARVEST_W + 8) x += lay(x)
  s.next = x - (HARVEST_W + 8)
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = MINI_STEP
    const move = HV.speed * dt
    s.next -= move
    while (s.next <= 0) s.next += lay(HARVEST_W + 8 + s.next)
    // The scythe swings while held, as long as the reaper has the strength.
    s.swinging = held && !s.tired
    if (s.swinging) {
      s.stamina -= HV.stamina.drain * dt
      if (s.stamina <= 0) {
        s.stamina = 0
        s.tired = true
      }
    } else {
      s.stamina = Math.min(1, s.stamina + HV.stamina.regen * dt)
      if (s.tired && s.stamina >= HV.stamina.recover) s.tired = false
    }
    for (const t of s.stalks) {
      t.x -= move
      if (t.cut) continue
      if (s.swinging && Math.abs(t.x - HV.reaperX) <= HV.reach) {
        t.cut = s.step + 1
        const pts = HV.points[t.kind]
        if (t.kind === 'ripe' || t.kind === 'golden') {
          s.cuts++
          s.combo++
          s.bestCombo = Math.max(s.bestCombo, s.combo)
          s.score += pts + Math.min(HV.comboMax, Math.floor(s.combo / HV.comboEvery))
        } else {
          if (t.kind === 'crow') s.crows++
          else s.greens++
          s.combo = 0
          s.score = Math.max(0, s.score + pts)
        }
      } else if (t.x < HV.reaperX - HV.reach && t.cut === 0 && (t.kind === 'ripe' || t.kind === 'golden')) {
        // Ripe wheat let past is lost, and the run of cuts with it.
        t.cut = -1
        s.missed++
        s.combo = 0
      }
    }
    if (s.stalks.length > 0 && s.stalks[0].x < -16) s.stalks = s.stalks.filter((t) => t.x >= -16)
    s.step++
    if (s.step >= HARVEST_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- Hauling the net at the dock --------------------------------------------------------------------------------------
//
// The fishermen haul a full net up out of the water. Hold to pull: the rope's tension rises, let go and it eases. The
// net comes up only while it is pulled with the tension in the safe band; too slack and the fish slip it, too taut and
// the net tears (some fish get away). Now and then the catch surges and jerks the rope. Every net brought up is worth
// its fish, and more if it came up without a tear.

const NT = M.net
export const NET_LIMIT = NT.limitSeconds * 60
export const NET_BAND = NT.band as [number, number]

export interface NetState extends Run {
  tension: number
  progress: number
  // The fish in the net coming up, and whether it has torn yet.
  fish: number
  torn: number
  // Seconds of the fish's surge left, its pull, and seconds until the next one.
  surge: number
  force: number
  nextSurge: number
  pause: number
  hauls: { fish: number; points: number; perfect: boolean; step: number }[]
  tears: { step: number; lost: number }[]
  netNo: number
  pulling: boolean
}

export function netGame(seed: number): Playable<NetState> {
  const random = seeded(seed)
  const fishFor = () => NT.fish[0] + Math.floor(random() * (NT.fish[1] - NT.fish[0] + 1))
  const s: NetState = {
    step: 0,
    over: false,
    score: 0,
    tension: 0.2,
    progress: 0,
    fish: fishFor(),
    torn: 0,
    surge: 0,
    force: 0,
    nextSurge: between(random, NT.surgeGapSeconds) + 0.6,
    pause: 0.8,
    hauls: [],
    tears: [],
    netNo: 0,
    pulling: false,
  }
  const freshNet = () => {
    s.netNo++
    s.fish = fishFor()
    s.torn = 0
    s.progress = 0
    s.tension = 0.2
  }
  const advance = (held: boolean) => {
    if (s.over) return s
    const dt = MINI_STEP
    const jitter = (random() - 0.5) * NT.jitter
    // The fish surge every so often, pulling the rope tighter.
    s.nextSurge -= dt
    if (s.nextSurge <= 0) {
      s.surge = between(random, NT.surgeSeconds)
      s.force = between(random, NT.surgeForce)
      s.nextSurge = s.surge + between(random, NT.surgeGapSeconds)
    }
    if (s.surge > 0) s.surge -= dt
    if (s.pause > 0) {
      s.pause -= dt
      s.pulling = false
      s.tension = Math.max(0, s.tension - NT.slack * dt)
    } else {
      s.pulling = held
      s.tension += ((held ? NT.pull : -NT.slack) + (s.surge > 0 ? s.force : 0) + jitter) * dt
      if (s.tension < 0) s.tension = 0
      if (s.tension > 1) {
        // The net tears: some fish get away.
        const lost = Math.min(s.fish, NT.tearLoss)
        s.fish -= lost
        s.torn++
        s.tears.push({ step: s.step, lost })
        s.tension = NT.afterTear
        s.pause = NT.tearPauseSeconds
        if (s.fish <= 0) {
          s.pause = NT.betweenNetsSeconds
          freshNet()
        }
      } else if (s.tension >= NT.band[0] && s.tension <= NT.band[1]) {
        if (held) s.progress += NT.haulPerSecond * dt
      } else if (s.tension < NT.band[0]) s.progress = Math.max(0, s.progress - NT.slipPerSecond * dt)
      if (s.progress >= 1) {
        const perfect = s.torn === 0
        const points = s.fish * NT.perFish + (perfect ? NT.perfectBonus : 0)
        s.score += points
        s.hauls.push({ fish: s.fish, points, perfect, step: s.step })
        s.pause = NT.betweenNetsSeconds
        freshNet()
      }
    }
    s.step++
    if (s.hauls.length >= NT.nets || s.step >= NET_LIMIT) s.over = true
    return s
  }
  return { state: s, advance }
}

// ---- Shared by all of them ---------------------------------------------------------------------------------------------

export function makeGame(game: ArcadeGame, seed: number): Playable<Run> {
  switch (game) {
    case 'archery':
      return archeryGame(seed)
    case 'anvil':
      return anvilGame(seed)
    case 'caravan':
      return caravanGame(seed)
    case 'woodsplit':
      return woodsplitGame(seed)
    case 'harvest':
      return harvestGame(seed)
    case 'net':
      return netGame(seed)
  }
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

export const gameBuilding = (game: ArcadeGame) => M[game].building as BuildingKind

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

// ---- The shared reward budget ----------------------------------------------------------------------------------------
//
// However many games a lord has, together they bring no more than so much in any hour (minigames.json → budget): the
// rewards are counted at their worth in gold (goods at their usual price) and, once the hour's budget is spent, a run
// still counts for the leaderboards but brings nothing until older rewards drop out of the hour.

const B = M.budget
const PRICE = balance.economy.trade.price as Record<string, number>
export const BUDGET_PER_WINDOW = B.goldPerWindow
export const BUDGET_WINDOW_MS = B.windowSeconds * 1000

export const rewardWorth = (reward: Partial<Stock>) =>
  Object.entries(reward).reduce((sum, [r, v]) => sum + (v ?? 0) * (r === 'gold' ? 1 : (PRICE[r] ?? 0)), 0)

// What the lord's games brought within the window, newest last.
export const recentEarnings = (k: Kingdom, at: number) => (k.minigameEarned ?? []).filter((e) => at - e.at < BUDGET_WINDOW_MS)

export const budgetLeft = (k: Kingdom, at: number) =>
  Math.max(0, BUDGET_PER_WINDOW - recentEarnings(k, at).reduce((sum, e) => sum + e.worth, 0))

// When the oldest reward in the window drops out of it (so some budget comes back), or null.
export const budgetBackAt = (k: Kingdom, at: number) => {
  const recent = recentEarnings(k, at)
  return recent.length ? recent[0].at + BUDGET_WINDOW_MS : null
}

// A run's reward cut to what the budget has left (every good in the same share, rounded down).
export function budgetedReward(k: Kingdom, reward: Partial<Stock>, at: number): Partial<Stock> {
  const worth = rewardWorth(reward)
  if (worth <= 0) return {}
  const share = Math.min(1, budgetLeft(k, at) / worth)
  const out: Partial<Stock> = {}
  for (const [r, v] of Object.entries(reward)) {
    const cut = Math.floor((v ?? 0) * share + 1e-9)
    if (cut > 0) out[r as keyof Stock] = cut
  }
  return out
}

// The window's entries with a new reward (what was actually given) on the end.
export const noteEarning = (k: Kingdom, given: Partial<Stock>, at: number) => {
  const worth = Math.round(rewardWorth(given) * 100) / 100
  const recent = recentEarnings(k, at)
  return worth > 0 ? [...recent, { at, worth }] : recent
}

// How well a run went: 0 to 3 stars (minigames.json → <game>.stars, the scores for each).
export const gameStars = (game: MiniGame, score: number) => (M[game].stars as number[]).filter((t) => score >= t).length

// The most a game's score can be (for the screens).
export const MAX_SCORE: Partial<Record<MiniGame, number>> = {
  fishing: M.fishing.caughtBase + M.fishing.speedBonus,
  archery: A.arrows * A.pointsPerArrow,
  anvil: N.strikes * N.points[0] + Array.from({ length: N.strikes }, (_, i) => Math.floor((i + 1) / N.comboEvery)).reduce((a, b) => a + b, 0),
  net: NT.nets * (NT.fish[1] * NT.perFish + NT.perfectBonus),
}

// A cast's score: nothing for a fish that got away, more the sooner it was caught.
export const fishScore = (caught: boolean, steps: number) => (caught ? Math.round(M.fishing.caughtBase + M.fishing.speedBonus * Math.max(0, 1 - steps / FISH_LIMIT)) : 0)
