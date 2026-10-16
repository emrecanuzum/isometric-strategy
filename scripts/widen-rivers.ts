// Moves the running lobbies of world revision 5 to revision 6 (wider rivers, CLAUDE.md §4.2): the rectangles to keep
// dry (every kingdom's buildings and dock plot, the towns) are stored on the lobby, its world is made again with them
// and the server's tiles are replaced. Nothing a kingdom built or owns turns to water.
//
//   bun scripts/widen-rivers.ts          dry run: checks every lobby and writes a preview of each dock
//   bun scripts/widen-rivers.ts --apply  writes the tiles and the revision
//   --local                              against the local Supabase instead of the linked project
//   --redo                               makes the tiles again for lobbies already moved (with their stored rectangles)
//
// The secret key is read from the Supabase CLI (logged in and linked), never written to disk.

import { gunzipSync, gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { Terrain, generateWorld, type RiverKeep } from '../packages/shared/src/index.ts'

const apply = process.argv.includes('--apply')
const redo = process.argv.includes('--redo')
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

const wet = (t: number) => t === Terrain.River || t === Terrain.Lake
const { data: lobbies, error } = await db.from('lobbies').select(redo ? 'id, name, seed, world_rev, river_keep' : 'id, name, seed, world_rev').eq('world_rev', redo ? 6 : 5)
if (error) throw error
for (const lobby of lobbies ?? []) {
  const { data: kingdoms } = await db.from('kingdoms').select('id, name, state').eq('lobby_id', lobby.id)
  const { data: towns } = await db.from('lobby_towns').select('x, y').eq('lobby_id', lobby.id)
  const keep: RiverKeep[] = []
  const docks: { name: string; x: number; y: number }[] = []
  for (const k of kingdoms ?? []) {
    const s = k.state
    if (!s) continue
    for (const b of s.buildings ?? []) keep.push([b.x, b.y, b.size, b.size])
    if (s.dockPlot) {
      keep.push([s.dockPlot.x, s.dockPlot.y, s.dockPlot.size, s.dockPlot.size])
      docks.push({ name: k.name, x: s.dockPlot.x, y: s.dockPlot.y })
    }
  }
  for (const t of towns ?? []) keep.push([t.x, t.y, 8, 8])
  if (redo) {
    if (!lobby.river_keep) continue
    keep.splice(0, keep.length, ...lobby.river_keep)
  }

  // The stored tiles must be those of revision 5, or the lobby's world is not what this script thinks it is.
  const { data: stored } = await db.from('lobby_worlds').select('size, tiles').eq('lobby_id', lobby.id).single()
  const old = gunzipSync(Buffer.from((stored!.tiles as string).replace(/^\\x/, ''), 'hex'))
  const before = generateWorld(lobby.seed, 5)
  const n = before.size * before.size
  let mismatch = 0
  if (!redo) for (let i = 0; i < n; i++) if (old[i] !== before.terrain[i] || old[n + i] !== before.feature[i]) mismatch++
  const world = generateWorld(lobby.seed, 6, keep)
  let drowned = 0
  for (const [x, y, w, h] of keep) {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      const i = ty * world.size + tx
      if (wet(world.terrain[i]) && !wet(before.terrain[i])) drowned++
    }
  }
  let widened = 0
  for (let i = 0; i < n; i++) if (world.terrain[i] !== before.terrain[i]) widened++
  console.log(`${lobby.name}: ${kingdoms?.length} kingdoms, ${keep.length} kept rects, ${widened} tiles widened, stored≠rev5: ${mismatch}, kept tiles drowned: ${drowned}`)

  // A small picture round each dock: before | after (water blue, new water light blue, kept tiles red).
  mkdirSync('scripts/tmp/preview', { recursive: true })
  for (const dock of docks) {
    const R = 40
    const W = (R * 2) * 2 + 4
    const H = R * 2
    const px = new Uint8Array(W * H * 3)
    const keptAt = (x: number, y: number) => keep.some(([kx, ky, kw, kh]) => x >= kx && y >= ky && x < kx + kw && y < ky + kh)
    for (let dy = 0; dy < H; dy++) for (let dx = 0; dx < R * 2; dx++) {
      const x = dock.x - R + dx
      const y = dock.y - R + dy
      if (x < 0 || y < 0 || x >= world.size || y >= world.size) continue
      const i = y * world.size + x
      for (const [side, w] of [[0, before], [1, world]] as const) {
        const o = (dy * W + dx + side * (R * 2 + 4)) * 3
        const t = w.terrain[i]
        const c = keptAt(x, y) ? [220, 40, 40] : wet(t) ? (side && !wet(before.terrain[i]) ? [120, 190, 255] : [30, 80, 200]) : t === Terrain.Mountain ? [120, 110, 100] : [70, 140, 60]
        px.set(c, o)
      }
    }
    const file = `scripts/tmp/preview/${lobby.name.replace(/\W+/g, '_')}-${dock.name.replace(/\W+/g, '_')}.ppm`
    writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), Buffer.from(px)]))
  }

  if (!apply) continue
  if (mismatch > 0 || drowned > 0) {
    console.log('  skipped: the checks above failed')
    continue
  }
  const tiles = new Uint8Array(n * 2)
  tiles.set(world.terrain, 0)
  tiles.set(world.feature, n)
  const packed = gzipSync(tiles, { level: 9 })
  const { error: tilesError } = await db.from('lobby_worlds').update({ tiles: `\\x${Buffer.from(packed).toString('hex')}` }).eq('lobby_id', lobby.id)
  if (tilesError) throw tilesError
  const { error: revError } = await db.from('lobbies').update({ world_rev: 6, river_keep: keep }).eq('id', lobby.id)
  if (revError) throw revError
  console.log('  moved to revision 6')
}
