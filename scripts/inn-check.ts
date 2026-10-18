// Checks the inns as markets on the live lobbies (CLAUDE.md §7.6), reading only:
// - the server finds the same inns as the players' world (its list from the stored tiles, the players' from the seed),
// - every inn's stats, and each lord's slice of each inn's pie (from palaces and held towns),
// - merchants sent to inns: their stored slice and stats against what they work out to now.
//
//   bun scripts/inn-check.ts            all lobbies
//   bun scripts/inn-check.ts --local    against the local Supabase
//
// The secret key is read from the Supabase CLI (logged in and linked), never written to disk.

import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { Feature, balance, canTradeAt, generateWorld, innPulls, innSaturation, innStats } from '../packages/shared/src/index.ts'
import type { Point } from '../packages/shared/src/index.ts'

const connect = () => {
  if (process.argv.includes('--local')) {
    const status = JSON.parse(Bun.spawnSync(['bunx', 'supabase', 'status', '-o', 'json']).stdout.toString())
    return createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false } })
  }
  const ref = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim()
  const keys = JSON.parse(Bun.spawnSync(['bunx', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json']).stdout.toString())
  const secret = keys.find((k: { type: string }) => k.type === 'secret')?.api_key
  if (!secret) throw new Error('No secret key: run `bunx supabase login` and `bunx supabase link` first')
  return createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false } })
}
const db = connect()
const now = Date.now()
const f2 = (n: number) => n.toFixed(2)
const key = (p: Point) => `${p.x},${p.y}`

const { data: lobbies, error } = await db.from('lobbies').select('id, name, seed, world_rev, river_keep, market')
if (error) throw error
let problems = 0
for (const lobby of lobbies ?? []) {
  const world = generateWorld(lobby.seed, lobby.world_rev ?? undefined, lobby.river_keep ?? [])
  // The server's inns, as server.ts → makeWorld finds them in the stored tiles.
  const { data: stored } = await db.from('lobby_worlds').select('size, tiles').eq('lobby_id', lobby.id).single()
  if (!stored) continue
  const tiles = gunzipSync(Buffer.from((stored.tiles as string).replace(/^\\x/, ''), 'hex'))
  const size = stored.size as number
  const feature = tiles.subarray(size * size)
  const server: Point[] = []
  for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) if (feature[y * size + x] === Feature.Inn) server.push({ x, y })
  const client = new Set(world.inns.map(key))
  const serverSet = new Set(server.map(key))
  const onlyServer = server.filter((p) => !client.has(key(p)))
  const onlyClient = world.inns.filter((p) => !serverSet.has(key(p)))

  const { data: kingdoms } = await db.from('kingdoms').select('id, name, state').eq('lobby_id', lobby.id)
  const { data: towns } = await db.from('lobby_towns').select('name, x, y, owner_id').eq('lobby_id', lobby.id)
  const lords = (kingdoms ?? [])
    .filter((k) => k.state)
    .map((k) => {
      const p = k.state.buildings?.find((b: { kind: string }) => b.kind === 'palace')
      return { id: k.id, name: k.name ?? `#${k.id}`, palace: p ? { x: p.x + p.size / 2, y: p.y + p.size / 2 } : k.state.site, state: k.state }
    })
  const half = balance.towns.size / 2
  const held = (towns ?? []).map((t) => ({ owner: t.owner_id, at: { x: t.x + half, y: t.y + half } }))
  const name = (id: number) => lords.find((l) => l.id === id)?.name ?? `#${id}`

  console.log(`\n== ${lobby.name} (rev ${lobby.world_rev}, seed ${lobby.seed}) · ${lords.length} lord, ${towns?.length ?? 0} kasaba (${held.filter((t) => t.owner !== null).length} sahipli)`)
  console.log(`   hanlar: istemci ${world.inns.length}, sunucu ${server.length}` + (onlyServer.length || onlyClient.length ? `  !! yalnız sunucuda ${onlyServer.map(key).join(' ')} · yalnız istemcide ${onlyClient.map(key).join(' ')}` : '  ✓ aynı yerler'))
  problems += onlyServer.length + onlyClient.length

  let reachable = 0
  for (const inn of world.inns) {
    const s = innStats(lobby.seed, inn)
    const pulls = innPulls(inn, lords, held)
    const open = pulls.filter((p) => canTradeAt(p.share))
    if (open.length) reachable++
    const avg = (s.food + s.materials + s.arms) / 3
    const tag = avg >= 1.15 ? 'cömert' : avg <= 0.85 ? 'ölü' : 'olağan'
    const sat = (['food', 'materials', 'arms'] as const).map((g) => innSaturation(lobby.market, inn, g, now)).map(f2).join('/')
    const pie = pulls.map((p) => `${name(p.id)} %${Math.round(p.share * 100)}${p.towns ? ` (+${p.towns} kasaba)` : ''}${canTradeAt(p.share) ? '' : ' [yetmez]'}`).join(', ')
    console.log(`   ${key(inn).padEnd(9)} ${tag.padEnd(6)} yemek ×${f2(s.food)} yapı ×${f2(s.materials)} savaş ×${f2(s.arms)}  doygunluk ${sat}  pasta: ${pie || '— kimse yakın değil'}`)
  }
  console.log(`   ${reachable}/${world.inns.length} han en az bir lorda açık`)

  // Merchants at inns: what they keep against what it works out to now.
  for (const l of lords) {
    const at = l.state.trade?.inn
    if (!at) continue
    const real = innPulls(at, lords, held).find((p) => p.id === l.id)?.share ?? 0
    const stats = innStats(lobby.seed, at)
    const statsOk = (['food', 'materials', 'arms'] as const).every((g) => Math.abs(stats[g] - at.stats[g]) < 1e-9)
    const exists = world.inns.some((p) => p.x === at.x && p.y === at.y)
    const ok = exists && statsOk && Math.abs(real - at.share) < 0.02
    if (!ok) problems++
    console.log(`   tüccar ${l.name} → ${key(at)}: saklı pay %${Math.round(at.share * 100)}, şimdi %${Math.round(real * 100)}, statlar ${statsOk ? 'aynı' : 'FARKLI'}${exists ? '' : ', HAN YOK'} ${ok ? '✓' : '!!'}`)
  }
}
console.log(problems ? `\n${problems} sorun` : '\nsorun yok')
