// Connects pg_cron to the `tick` function (CLAUDE.md §11.1): a fresh shared secret goes to the function's
// environment and, with the function's address, to private.tick_config. Nothing of it is written to the repo.
//
//   bun run tick:setup

import { readFileSync } from 'node:fs'

const ref = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim()
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const run = (args: string[]) => {
  const out = Bun.spawnSync(['bunx', 'supabase', ...args], { stdout: 'pipe', stderr: 'pipe' })
  if (out.exitCode !== 0) throw new Error(`supabase ${args[0]} ${args[1]} failed: ${out.stderr.toString().slice(0, 300)}`)
}
run(['secrets', 'set', `TICK_SECRET=${secret}`, '--project-ref', ref])
const url = `https://${ref}.supabase.co/functions/v1/tick`
run([
  'db',
  'query',
  '--linked',
  `insert into private.tick_config (id, url, secret) values (true, '${url}', '${secret}') on conflict (id) do update set url = excluded.url, secret = excluded.secret`,
])
console.log('Tick connected:', url)
