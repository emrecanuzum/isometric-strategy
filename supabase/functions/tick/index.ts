// pg_cron calls this every minute while anything is under way (see maybe_tick in the migrations); the work itself
// is in _shared/tick.ts, which the players' `settle` nudges also run.

import { admin, iso } from '../_shared/server.ts'
import { tickLobby } from '../_shared/tick.ts'

Deno.serve(async (req) => {
  if (req.headers.get('x-tick-secret') !== Deno.env.get('TICK_SECRET')) return new Response('no', { status: 401 })
  const now = Date.now()
  const { data: lobbies } = await admin.from('lobbies').select('id').gt('season_end', iso(now))
  const done: string[] = []
  for (const lobby of lobbies ?? []) {
    try {
      if (await tickLobby(lobby.id, now, 0)) done.push(lobby.id)
    } catch (e) {
      console.error('tick', lobby.id, e)
    }
  }
  return new Response(JSON.stringify({ done }), { headers: { 'Content-Type': 'application/json' } })
})
