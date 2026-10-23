// Preloaded before the server code runs under bun (see sim.ts): a virtual clock, the bits of Deno the edge functions
// use, and their `npm:` imports mapped to the packages installed here.
import { plugin } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.env.SIM_DIR
const saved = dir && existsSync(join(dir, 'state.json')) ? JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) : null

// The virtual clock: every Date.now() and `new Date()` in this process reads it; sim.ts moves it forward.
const RealDate = Date
const clock = { now: saved?.now ?? RealDate.now() }
;(globalThis as Record<string, unknown>).simClock = clock
;(globalThis as Record<string, unknown>).simRealNow = () => RealDate.now()
class SimDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(clock.now)
    else super(...(args as [string]))
  }
  static now() {
    return clock.now
  }
}
globalThis.Date = SimDate as DateConstructor

// Deno.serve keeps the handler for sim.ts to call; Deno.env reads the process's.
const handlers: ((req: Request) => Promise<Response>)[] = []
;(globalThis as Record<string, unknown>).simHandlers = handlers
;(globalThis as Record<string, unknown>).Deno = {
  env: { get: (key: string) => process.env[key] },
  serve: (handler: (req: Request) => Promise<Response>) => handlers.push(handler),
}

// The edge functions import `npm:` specifiers bun does not know: rewritten to the packages installed here.
const supabaseJs = Bun.resolveSync('@supabase/supabase-js', process.cwd())
plugin({
  name: 'npm-specifiers',
  setup(build) {
    build.onLoad({ filter: /supabase\/functions\/.*\.ts$/ }, async (args) => ({
      contents: (await Bun.file(args.path).text()).replace(/['"]npm:@supabase\/supabase-js@2['"]/g, JSON.stringify(supabaseJs)),
      loader: 'ts',
    }))
  },
})
