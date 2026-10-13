// Opens a lobby on the linked Supabase project: generates its world from the seed and stores the tiles the server
// checks commands against (CLAUDE.md §11.1).
//
//   bun run lobby:create "Lobi adı" [seed] [--private] [--players 10]
//
// The secret key is read from the Supabase CLI (logged in and linked), never written to disk.

import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { generateWorld } from '../packages/shared/src/index.ts'

const args = process.argv.slice(2)
const flag = (name: string) => args.indexOf(name)
const name = args[0]
if (!name || name.startsWith('--')) throw new Error('Usage: bun run lobby:create "Lobby name" [seed] [--private] [--players n]')
const seed = args[1] && !args[1].startsWith('--') ? Number(args[1]) : Math.floor(Math.random() * 2 ** 31)
const players = flag('--players') >= 0 ? Number(args[flag('--players') + 1]) : 9

const ref = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim()
const keys = JSON.parse(Bun.spawnSync(['bunx', 'supabase', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '-o', 'json']).stdout.toString())
const secret = keys.find((k: { type: string }) => k.type === 'secret')?.api_key
if (!secret) throw new Error('No secret key: run `bunx supabase login` and `bunx supabase link` first')
const db = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false } })

const world = generateWorld(seed)
const tiles = new Uint8Array(world.size * world.size * 2)
tiles.set(world.terrain, 0)
tiles.set(world.feature, world.size * world.size)
const packed = gzipSync(tiles, { level: 9 })

const { data: lobby, error } = await db
  .from('lobbies')
  .insert({ name, seed, is_public: flag('--private') < 0, max_players: players })
  .select()
  .single()
if (error) throw error
const { error: worldError } = await db
  .from('lobby_worlds')
  .insert({ lobby_id: lobby.id, size: world.size, tiles: `\\x${Buffer.from(packed).toString('hex')}` })
if (worldError) {
  await db.from('lobbies').delete().eq('id', lobby.id)
  throw worldError
}
console.log(`Lobby "${name}" (seed ${seed}, ${Math.round(packed.length / 1024)} KB of tiles): ${lobby.id}`)
