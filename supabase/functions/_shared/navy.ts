// The lords' fleets meeting each other (CLAUDE.md §8.5): a blockade or a raid reaching an enemy's dock fights the ships
// moored there; a sortie from a blockaded dock fights the blockading fleet; a blockade whose fleet is gone, or whose
// war is over, is lifted. Everything else a fleet does (trade, fishing, pirates, coming home) is the owner's own
// `advance`. Each meeting is claimed on the attacker's row first (its mission marked settled under the row's version),
// so a meeting is fought once even when two runs of the tick overlap.

import * as game from './game.js'
import { mutateKingdom, notify } from './server.ts'
import type { Kingdom, Row } from './server.ts'

// deno-lint-ignore no-explicit-any
type Pact = any
// deno-lint-ignore no-explicit-any
type Fleet = any

const seedOf = (...values: number[]) => values.reduce((h, v) => (Math.imul(h ^ (Math.floor(v) | 0), 0x01000193) >>> 0), 0x811c9dc5)
const shipsText = (s: Record<string, number>) => s

export async function settleNavy(lobby: string, rows: Row[], pacts: Pact[], now: number) {
  const byId = new Map(rows.filter((r) => r.state).map((r) => [r.id, r]))

  for (const row of byId.values()) {
    for (const f of (row.state.navy?.fleets ?? []) as Fleet[]) {
      const m = f.mission
      if ((m.kind === 'blockade' && !m.resolved) || m.kind === 'raid') {
        if (m.arriveAt <= now) await strike(lobby, row, f, byId.get(m.target), pacts, now)
      } else if (m.kind === 'sortie' && m.arriveAt <= now) {
        await sortie(lobby, row, f, byId, now)
      }
    }
  }

  // Blockades whose fleet has gone home, been beaten or whose war is over are lifted.
  for (const row of byId.values()) {
    const b = row.state.blockade
    if (!b) continue
    const by = byId.get(b.by)
    const fleet = by?.state.navy?.fleets?.find((f: Fleet) => f.id === b.fleet)
    const holding = fleet && fleet.mission.kind === 'blockade' && fleet.mission.target === row.id && fleet.mission.resolved
    const war = game.atWar(pacts, row.id, b.by)
    if (holding && war) continue
    await mutateKingdom(row.id, now, (k) => (k.blockade?.by === b.by ? { ...k, blockade: null } : null))
    // The war is over: the blockading fleet sails home.
    if (holding && !war) {
      await mutateKingdom(b.by, now, (k) => {
        const f = game.fleetOf(k, b.fleet)
        if (!f || f.mission.kind !== 'blockade') return null
        return game.recallFleet(k, b.fleet, now, game.voyageMs(k.dockPlot, row.state.dockPlot))
      })
    }
    await notify(lobby, [row.id], 'blockade_lifted', { by: b.name, why: war ? 'gone' : 'peace' }, now)
  }
}

// A blockade or raid reaching the target's dock: no war (any more) or no dock, and it turns back; otherwise it fights
// the ships moored there.
async function strike(lobby: string, row: Row, f: Fleet, target: Row | undefined, pacts: Pact[], now: number) {
  const m = f.mission
  const at = m.arriveAt
  const back = (k: Kingdom) => game.voyageMs(k.dockPlot, target?.state?.dockPlot)
  const dock = target?.state?.buildings?.some((b: { kind: string; doneAt: number }) => b.kind === 'dock' && b.doneAt <= at)
  const taken = m.kind === 'blockade' && target?.state?.blockade && target.state.blockade.by !== row.id
  if (!target?.state || !dock || !game.atWar(pacts, row.id, target.id) || taken) {
    await mutateKingdom(row.id, now, (k) => {
      const x = game.fleetOf(k, f.id)
      if (!x || x.mission.kind !== m.kind || x.mission.arriveAt !== at) return null
      return game.recallFleet(k, f.id, now, back(k))
    })
    await notify(lobby, [row.id], 'fleet_turned', { target: m.name, kind: m.kind, why: !dock ? 'dock' : taken ? 'taken' : 'peace' }, now)
    return
  }

  const defenders = game.defendersOf(target.state)
  const fight = game.navalBattle(f.ships, defenders, seedOf(row.id, f.id, at / 1000), true)
  const won = fight.winner === 'attackers'
  const loot: Record<string, number> = won && m.kind === 'raid' ? game.raidLoot(target.state.stock, game.subShips(f.ships, fight.attackerLoss)) : {}

  // Claim the meeting on the attacker's row.
  let claimed = false
  await mutateKingdom(row.id, now, (k) => {
    const x = game.fleetOf(k, f.id)
    if (!x || x.mission.kind !== m.kind || x.mission.arriveAt !== at || x.mission.resolved) return null
    claimed = true
    let next = game.takeFleetLosses(k, f.id, fight.attackerLoss)
    if (!game.fleetOf(next, f.id)) return next
    if (won && m.kind === 'blockade') {
      const navy = game.navyOf(next)
      return { ...next, navy: { ...navy, fleets: navy.fleets.map((y: Fleet) => (y.id === f.id ? { ...y, mission: { ...y.mission, resolved: true } } : y)) } }
    }
    next = game.recallFleet(next, f.id, now, back(next))
    if (Object.keys(loot).length > 0) {
      const navy = game.navyOf(next)
      next = { ...next, navy: { ...navy, fleets: navy.fleets.map((y: Fleet) => (y.id === f.id ? { ...y, mission: { ...y.mission, cargo: loot } } : y)) } }
    }
    return next
  })
  if (!claimed) return

  await mutateKingdom(target.id, now, (k) => {
    let next = game.takeHomeLosses(k, fight.defenderLoss)
    if (won && m.kind === 'blockade') next = { ...next, blockade: { by: row.id, name: row.name ?? '?', color: row.color ?? undefined, fleet: f.id, since: at } }
    if (won && m.kind === 'raid') {
      const stock = { ...next.stock }
      for (const [g, n] of Object.entries(loot)) stock[g] = Math.max(0, stock[g] - n)
      next = { ...next, stock }
    }
    return next
  })

  const report = {
    kind: m.kind,
    attacker: row.name,
    defender: target.name,
    winner: fight.winner,
    rolls: fight.rolls,
    attackerShips: shipsText(f.ships),
    defenderShips: shipsText(defenders),
    attackerLoss: fight.attackerLoss,
    defenderLoss: fight.defenderLoss,
    ...(Object.keys(loot).length > 0 && { loot }),
  }
  await notify(lobby, [row.id, target.id], 'naval_battle', report, at)
}

// A sortie from a blockaded dock meets the blockading fleet.
async function sortie(lobby: string, row: Row, f: Fleet, byId: Map<number, Row>, now: number) {
  const at = f.mission.arriveAt
  const b = row.state.blockade
  const enemy = b ? byId.get(b.by) : undefined
  const theirs = enemy?.state.navy?.fleets?.find((x: Fleet) => x.id === b?.fleet)
  if (!b || !enemy || !theirs) {
    await mutateKingdom(row.id, now, (k) => {
      const x = game.fleetOf(k, f.id)
      if (!x || x.mission.kind !== 'sortie' || x.mission.arriveAt !== at) return null
      const navy = game.navyOf(k)
      return { ...k, navy: { ...navy, fleets: navy.fleets.map((y: Fleet) => (y.id === f.id ? { ...y, mission: { kind: 'port' } } : y)) } }
    })
    return
  }
  const fight = game.navalBattle(f.ships, theirs.ships, seedOf(row.id, f.id, at / 1000, 7), false)
  const won = fight.winner === 'attackers'
  let claimed = false
  await mutateKingdom(row.id, now, (k) => {
    const x = game.fleetOf(k, f.id)
    if (!x || x.mission.kind !== 'sortie' || x.mission.arriveAt !== at) return null
    claimed = true
    const next = game.takeFleetLosses(k, f.id, fight.attackerLoss)
    const navy = game.navyOf(next)
    return { ...next, ...(won && { blockade: null }), navy: { ...navy, fleets: navy.fleets.map((y: Fleet) => (y.id === f.id ? { ...y, mission: { kind: 'port' } } : y)) } }
  })
  if (!claimed) return
  await mutateKingdom(enemy.id, now, (k) => {
    let next = game.takeFleetLosses(k, theirs.id, fight.defenderLoss)
    // Beaten off the dock: what is left of the blockading fleet sails home.
    if (won && game.fleetOf(next, theirs.id)) next = game.recallFleet(next, theirs.id, now, game.voyageMs(k.dockPlot, row.state.dockPlot))
    return next
  })
  await notify(
    lobby,
    [row.id, enemy.id],
    'naval_battle',
    {
      kind: 'sortie',
      attacker: row.name,
      defender: enemy.name,
      winner: fight.winner,
      rolls: fight.rolls,
      attackerShips: f.ships,
      defenderShips: theirs.ships,
      attackerLoss: fight.attackerLoss,
      defenderLoss: fight.defenderLoss,
    },
    at,
  )
  if (won) await notify(lobby, [enemy.id], 'blockade_lifted', { by: row.name, why: 'sortie' }, at)
}
