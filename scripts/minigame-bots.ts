// Plays every arcade mini-game with simple bots (a sharp one and a sloppy one) to see what scores and rewards a run
// brings (CLAUDE.md §6.5). `bun scripts/minigame-bots.ts [runs]`.
import {
  ARCADE_GAMES,
  ANVIL_WINDOW,
  BUDGET_PER_WINDOW,
  NET_BAND,
  anvilGame,
  archeryGame,
  balance,
  caravanGame,
  gameReward,
  gameStars,
  harvestGame,
  netGame,
  rewardWorth,
  woodsplitGame,
} from '../packages/shared/src'
import type { ArcadeGame } from '../packages/shared/src'

const M = balance.minigames
const runs = Number(process.argv[2] ?? 200)

// A bot decides each step whether the button is held; `slop` is how sloppy it is (0 sharp … 1 poor).
function play(game: ArcadeGame, seed: number, slop: number): number {
  let r = seed * 7919
  const noise = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 2
  // Reaction: a sloppy bot acts on what it saw a few steps ago.
  const lag = Math.round(slop * 14)
  if (game === 'woodsplit') {
    const g = woodsplitGame(seed)
    let aim = noise() * slop * 0.12
    while (!g.state.over) {
      const s = g.state
      const log = s.logs[Math.min(s.index, s.logs.length - 1)]
      const near = s.pause <= 0 && Math.abs(s.meter - (log.core + aim)) < 0.035
      g.advance(near && !s.wasHeld)
      if (near) aim = noise() * slop * 0.12
    }
    return g.state.score
  }
  if (game === 'harvest') {
    const g = harvestGame(seed)
    while (!g.state.over) {
      const s = g.state
      const ahead = s.stalks.find((t) => !t.cut && Math.abs(t.x - lag * (M.harvest.speed / 60) - M.harvest.reaperX) <= M.harvest.reach)
      const want = !!ahead && (ahead.kind === 'ripe' || ahead.kind === 'golden') && !(noise() < slop - 0.6)
      g.advance(want || (slop > 0.5 && noise() > 0.9))
    }
    return g.state.score
  }
  if (game === 'net') {
    const g = netGame(seed)
    const mid = (NET_BAND[0] + NET_BAND[1]) / 2 + slop * 0.05
    while (!g.state.over) g.advance(g.state.tension < mid + noise() * slop * 0.15)
    return g.state.score
  }
  if (game === 'anvil') {
    const g = anvilGame(seed)
    let off = Math.round(noise() * slop * 9)
    while (!g.state.over) {
      const s = g.state
      const hit = s.notes.some((n, i) => s.grades[i] === 0 && s.step === n + off)
      if (hit) off = Math.round(noise() * slop * 9)
      g.advance(hit && Math.abs(off) <= ANVIL_WINDOW + 4)
    }
    return g.state.score
  }
  if (game === 'caravan') {
    const g = caravanGame(seed)
    while (!g.state.over) {
      const s = g.state
      const next = s.things.filter((t) => !t.taken && t.kind !== 'rock' && t.x > M.caravan.camelX - 4).sort((a, b) => a.x - b.x)[0]
      const goal = next ? next.y : M.caravan.road / 2
      g.advance(s.y > goal + noise() * slop * 25 + s.vy * 0.15)
    }
    return g.state.score
  }
  const g = archeryGame(seed)
  while (!g.state.over) {
    const s = g.state
    const aimX = s.x + s.wind
    const good = Math.sqrt(aimX * aimX + s.y * s.y) < 4 + slop * 20
    const release = s.drawing && s.drawn > 0.4 && (good || s.drawn > 1.5)
    g.advance(s.drawing ? !release : true)
  }
  return g.state.score
}

let total = { sharp: 0, sloppy: 0 }
for (const game of ARCADE_GAMES) {
  for (const [name, slop] of [
    ['sharp', 0.15],
    ['sloppy', 0.7],
  ] as const) {
    const scores: number[] = []
    for (let i = 1; i <= runs; i++) scores.push(play(game, i * 2654435761, slop))
    scores.sort((a, b) => a - b)
    const avg = scores.reduce((a, b) => a + b, 0) / runs
    const worth = scores.reduce((a, s) => a + rewardWorth(gameReward(game, s)), 0) / runs
    const stars = scores.reduce((a, s) => a + gameStars(game, s), 0) / runs
    total[name] += worth
    console.log(
      `${game.padEnd(9)} ${name.padEnd(6)} avg ${avg.toFixed(1).padStart(6)}  p10 ${scores[Math.floor(runs * 0.1)]}  p90 ${scores[Math.floor(runs * 0.9)]}  stars ${stars.toFixed(2)}  reward ≈ ${worth.toFixed(1)} gold`,
    )
  }
}
const plays = 3600 / M.cooldownSeconds
console.log(`\nEvery game every ${M.cooldownSeconds / 60} min, uncapped: sharp ${(total.sharp * plays).toFixed(0)}, sloppy ${(total.sloppy * plays).toFixed(0)} gold-worth an hour; the shared budget caps it at ${BUDGET_PER_WINDOW}.`)
