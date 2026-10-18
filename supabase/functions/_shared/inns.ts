// The inns of the trade roads as markets on the server (CLAUDE.md §7.6): each lord's slice of an inn's pie, from its
// palace and the towns it holds, worked out when the merchant is sent there and kept fresh as palaces rise and towns
// change hands; too thin a slice sends the merchant home to the lobby's market.

import * as game from './game.js'
import { mutateKingdom, notify } from './server.ts'
import type { Kingdom, Point, Row } from './server.ts'
import type { TownRow } from './towns.ts'

// Where a lord's palace stands (its site before it is placed).
export function palaceOf(state: Kingdom): Point {
  const p = (state.buildings ?? []).find((b: { kind: string }) => b.kind === 'palace')
  return p ? { x: p.x + p.size / 2, y: p.y + p.size / 2 } : state.site
}

export const innLords = (rows: Row[]) => rows.filter((r) => r.state).map((r) => ({ id: r.id, palace: palaceOf(r.state!) }))

export function innTowns(towns: TownRow[]) {
  const half = game.balance.towns.size / 2
  return towns.map((t) => ({ owner: t.owner_id, at: { x: t.x + half, y: t.y + half } }))
}

// Every lord trading at an inn: its slice anew, written when it moved; one whose slice grew too thin is sent home.
export async function settleInnShares(lobby: string, rows: Row[], towns: TownRow[], now: number) {
  const trading = rows.filter((r) => r.state?.trade?.inn)
  if (trading.length === 0) return
  const lords = innLords(rows)
  const held = innTowns(towns)
  for (const row of trading) {
    const inn = row.state!.trade.inn!
    const share = Number(game.innShareOf(game.innPulls(inn, lords, held), row.id).toFixed(3))
    if (Math.abs(share - inn.share) < 0.01) continue
    let lost = false
    await mutateKingdom(row.id, now, (k) => {
      if (!k.trade.inn || k.trade.inn.x !== inn.x || k.trade.inn.y !== inn.y) return null
      lost = !game.canTradeAt(share)
      return game.refreshInnShare(k, share)
    }).catch(() => null)
    if (lost) await notify(lobby, [row.id], 'inn_lost', { inn: { x: inn.x, y: inn.y }, share }, now)
  }
}
