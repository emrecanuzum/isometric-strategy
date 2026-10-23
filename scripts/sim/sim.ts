// A whole lobby on a virtual clock: the real `command` and `tick` edge functions run under bun against the local
// Supabase (bun run db:start), with Date moved forward by this script. For play-testing everything the server does
// (crown patrols and tribute, outlaws, caves, pirates, the house's intrigue, battles) in minutes instead of days.
//
//   SIM_DIR=<dir> bun --preload ./scripts/sim/runtime.ts scripts/sim/sim.ts <command> [args]   (see `help`)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const URL = 'http://127.0.0.1:54321'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.SUPABASE_URL = URL
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE

const DIR = process.env.SIM_DIR
if (!DIR) throw new Error('SIM_DIR is not set')
mkdirSync(DIR, { recursive: true })

type User = { email: string; password: string; id: string; kingdom?: number }
type State = { now: number; start: number; lobby?: string; users: Record<string, User>; read: Record<string, number>; active: string[]; stamped: number; logged?: number; battles?: number; snapAt?: number }
const file = join(DIR, 'state.json')
const clock = (globalThis as unknown as { simClock: { now: number } }).simClock
const st: State = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { now: clock.now, start: clock.now, users: {}, read: {}, active: ['player'], stamped: 0 }
const keep = () => writeFileSync(file, JSON.stringify({ ...st, now: clock.now }, null, 1))

// Everything that happens is written down as it happens: events.md (commands, notices, battles) and snapshots.csv (each
// lord every game hour), so a test can be read back afterwards without trusting anyone's notes.
const minute = () => Math.round((clock.now - st.start) / 60000)
const ev = (line: string) => appendFileSync(join(DIR, 'events.md'), `[t=${minute()}dk] ${line}\n`)
const nameOfKingdom = (id: number) => Object.entries(st.users).find(([, u]) => u.kingdom === id)?.[0] ?? `#${id}`

// The server's own modules, after the environment above is in place.
const server = await import('../../supabase/functions/_shared/server.ts')
const { tickLobby } = await import('../../supabase/functions/_shared/tick.ts')
await import('../../supabase/functions/command/index.ts')
const handler = (globalThis as unknown as { simHandlers: ((r: Request) => Promise<Response>)[] }).simHandlers[0]
const g = await import('../../packages/shared/src/index.ts')
const admin = server.admin

const [cmd, ...args] = process.argv.slice(2)
const mins = (ms: number) => `${Math.round(ms / 60000)} dk`
const gameTime = () => `t=${Math.round((clock.now - st.start) / 60000)}dk`
const n = (v: number | undefined) => Math.round(v ?? 0)

async function tokenOf(name: string) {
  const u = st.users[name]
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: u.email, password: u.password })
  if (error) throw error
  return data.session!.access_token
}

// A command as the client sends it.
// deno-lint-ignore no-explicit-any
async function call(name: string, body: Record<string, unknown>): Promise<any> {
  const res = await handler(
    new Request('http://sim/command', { method: 'POST', headers: { Authorization: `Bearer ${await tokenOf(name)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ lobby: st.lobby, ...body }) }),
  )
  const out = await res.json()
  if (body.type !== 'seen') ev(`CMD ${name} ${JSON.stringify(body).slice(0, 200)} → ${out.error ? `RED ${out.error}` : `OK${out.result ? ` ${JSON.stringify(out.result).slice(0, 160)}` : ''}`}`)
  return out
}

async function makeUser(name: string) {
  const email = `${name}.${Date.now() % 1e9}@sim.local`
  const password = 'sim-password-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `${name}${Date.now() % 1e5}` } })
  if (error) throw error
  st.users[name] = { email, password, id: data.user.id }
}

async function rowOf(name: string) {
  const { data } = await admin.from('kingdoms').select('*').eq('lobby_id', st.lobby!).eq('user_id', st.users[name].id).maybeSingle()
  return data
}

// The notices' show_at defaults to the database's clock (real time): moved to the virtual one as they come in.
async function stampNotices() {
  const { data } = await admin.from('notices').select('id, show_at').eq('lobby_id', st.lobby!).gt('id', st.stamped).order('id')
  const real = (globalThis as unknown as { simRealNow: () => number }).simRealNow()
  for (const row of data ?? []) {
    const at = Date.parse(row.show_at)
    // Written by the database default: near the wall clock, far from the virtual one.
    if (Math.abs(at - real) < 120_000 && Math.abs(at - clock.now) > 120_000) await admin.from('notices').update({ show_at: new Date(clock.now).toISOString() }).eq('id', row.id)
    st.stamped = row.id
  }
}

async function spotFor(name: string, kind: string) {
  const row = await rowOf(name)
  const k = g.advance(row.state, clock.now, null).kingdom
  const { world } = await server.worldOf(st.lobby!)
  const stage = g.territoryStage(k, clock.now)
  if (kind === 'dock') return k.dockPlot
  const r = g.territoryRect(k.site, stage)
  const palace = k.buildings.find((b: { kind: string }) => b.kind === 'palace') ?? k.site
  // Nearest the palace, but the ground before its door is left open (armies and walkers come out there).
  const door = kind === 'palace' ? null : g.palaceDoor(k.buildings)
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let y = r.y; y < r.y + r.size; y++)
    for (let x = r.x; x < r.x + r.size; x++) {
      const d = Math.hypot(x - palace.x, y - palace.y)
      if (door && Math.hypot(x - door.x, y - door.y) < 4) continue
      if (d < bestD && g.buildError(world, k, stage, kind as never, { x, y }, clock.now) === null) {
        best = { x, y }
        bestD = d
      }
    }
  return best
}

async function status(name: string) {
  const row = await rowOf(name)
  if (!row?.state) return console.log(`${name}: krallık yok`)
  const k = g.advance(row.state, clock.now, null).kingdom
  const at = clock.now
  const pop = g.population(k, at)
  const led = g.ledger(k, at)
  const palace = k.buildings.find((b: { kind: string }) => b.kind === 'palace')
  const d = k.dynasty
  const age = (p: { bornAt: number }) => Math.floor((at - p.bornAt) / g.yearMs())
  const person = (p: { name: string; bornAt: number; sex: string; deathAt: number }) => `${p.name}(${p.sex === 'f' ? 'K' : 'E'},${age(p)}y,ölüm@${Math.floor((p.deathAt - p.bornAt) / g.yearMs())})`
  const lines = [
    `[${name}] ${row.name} #${row.id} | ${gameTime()} | saray sv${g.palaceLevel(k, at)} | biat ${k.liege ?? 'yok'} | taç ilişkisi ${JSON.stringify((k.crownRelations ?? []).map(n))} | puan ${JSON.stringify(row.score)}`,
    `DEPO (sınır ${g.storageCap(k, at)}): altın ${n(k.stock.gold)}/${g.goldCap(k, at)} yemek ${n(k.stock.food)} yapı ${n(k.stock.materials)} savaş ${n(k.stock.arms)} | cephanelik ${JSON.stringify(k.armory ?? {})}`,
    `NÜFUS: köylü ${pop.villagers} (yer ${pop.room}, barınak ${pop.housing}, sınır ${pop.cap}) asker ${pop.soldiers} denizci ${pop.sailors} hasta ${pop.sick.toFixed(1)} işler ${pop.jobs} verim %${Math.round(pop.efficiency * 100)} | mutluluk ${n(k.happiness)} vergi ${k.tax ?? 'normal'} | kraliçe ${k.queen ? 'var' : k.queenHeldBy ? 'REHİN' : 'yok'}`,
    `GELİR/tur: vergi ${led.tax.toFixed(2)} maaş -${led.soldiersGold.toFixed(2)} | tüccar ${k.trade.good ?? 'yok'} sv${k.trade.level}${k.trade.city ? ` → taç ${k.trade.city.index}` : ''} | garnizon ${JSON.stringify(k.units ?? {})} sahada ${k.fielded ?? 0} | casus ${k.spies ?? 0}+${k.spiesAway ?? 0}`,
    `YAĞMACI ${JSON.stringify(k.outlaws ?? {})} | kasabalar ${JSON.stringify((k.towns ?? []).map((t: { id: number; loyalty?: number }) => [t.id, n(t.loyalty)]))} | savaşta ${k.atWar ? 'EVET' : 'hayır'}`,
    d
      ? `HANEDAN: hükümdar ${d.king ? person(d.king) : 'NAİPLER/yok'} | kraliçe ${d.queen ? person(d.queen) : '-'} | çocuklar ${(d.children ?? []).map(person).join(' ') || '-'} | kardeşler ${(d.siblings ?? []).map(person).join(' ') || '-'} | akraba ${(d.kin ?? []).length} | ölenler ${(d.dead ?? []).length}${k.pretender ? ` | DAVACI ${JSON.stringify(k.pretender).slice(0, 120)}` : ''}`
      : 'HANEDAN: yok',
    `YAPILAR: ${k.buildings
      .filter((b: { kind: string }) => b.kind !== 'wall' && b.kind !== 'road')
      .map((b: { id: number; kind: string; level?: number; doneAt: number }) => `#${b.id}${b.kind}${b.level ?? 1}${b.doneAt > at ? '*' : ''}`)
      .join(' ')}`,
  ]
  if (palace) {
    const up = g.upgradeSpec(palace)
    lines.push(up ? `SARAY → sv${(palace.level ?? 1) + 1}: ${JSON.stringify(up.cost)} → ${g.upgradeError(k, palace.id, at) ?? 'YAPILABİLİR'}` : 'SARAY: en üst')
  }
  for (const f of g.fortunesAt(k, at)) {
    const key = g.crisisKey(f)
    const kind = g.isCrisis(f.kind) ? 'KRİZ (crisis villagers|army|none)' : g.isDilemma(f.kind) ? `SEÇİM (choose a|b) ${JSON.stringify(g.dilemmaOptions(f.kind))}` : 'olay'
    lines.push(`OLAY: ${f.kind} [${f.scope}] key=${key} ${mins(f.end - at)} kaldı · ${kind}${k.responses?.[key] ? ` cevap=${k.responses[key]}` : ''}`)
  }
  console.log(lines.join('\n'))
}

async function news(name: string, all: boolean) {
  const row = await rowOf(name)
  const from = all ? 0 : (st.read[name] ?? 0)
  const { data } = await admin.from('notices').select('id, kind, payload, show_at').eq('kingdom_id', row.id).gt('id', from).order('id')
  for (const r of data ?? []) {
    const t = Math.round((Date.parse(r.show_at) - st.start) / 60000)
    console.log(`#${r.id} t=${t}dk ${r.kind} ${JSON.stringify(r.payload).slice(0, 260)}`)
    st.read[name] = Math.max(st.read[name] ?? 0, r.id)
  }
  if (!data?.length) console.log('(yeni haber yok)')
}

async function snapshot() {
  const path = join(DIR, 'snapshots.csv')
  if (!existsSync(path)) appendFileSync(path, 't_min,lord,palace,gold,goldCap,food,materials,arms,storeCap,villagers,room,housing,popCap,soldiers,sailors,happiness,sick,liege,crown0,crown1,towns,atWar,score\n')
  for (const name of Object.keys(st.users)) {
    const row = await rowOf(name)
    if (!row?.state) continue
    const k = g.advance(row.state, clock.now, null).kingdom
    const at = clock.now
    const p = g.population(k, at)
    const c = k.crownRelations ?? []
    appendFileSync(
      path,
      [minute(), name, g.palaceLevel(k, at), n(k.stock.gold), g.goldCap(k, at), n(k.stock.food), n(k.stock.materials), n(k.stock.arms), g.storageCap(k, at), p.villagers, p.room, p.housing, p.cap, p.soldiers, p.sailors, n(k.happiness), p.sick.toFixed(1), k.liege ?? '', n(c[0]), n(c[1]), (k.towns ?? []).length, k.atWar ? 1 : 0, JSON.stringify(row.score ?? '').replace(/,/g, ';')].join(',') + '\n',
    )
  }
}

// What came in since the last look, for every lord: notices and battles.
async function journal() {
  const { data } = await admin.from('notices').select('id, kingdom_id, kind, payload').eq('lobby_id', st.lobby!).gt('id', st.logged ?? 0).order('id')
  const kinds: string[] = []
  for (const r of data ?? []) {
    ev(`HABER ${nameOfKingdom(r.kingdom_id)} ${r.kind} ${JSON.stringify(r.payload).slice(0, 220)}`)
    st.logged = r.id
    if (r.kingdom_id === st.users.player?.kingdom) kinds.push(r.kind)
  }
  const { data: fights } = await admin.from('battles').select('id, kind, attackers, defenders, plan').eq('lobby_id', st.lobby!).gt('id', st.battles ?? 0).order('id')
  for (const b of fights ?? []) {
    const side = (f: { kingdom: number; soldiers: number; units?: object }[]) => f.map((x) => `${x.kingdom ? nameOfKingdom(x.kingdom) : 'NPC'}:${x.soldiers}${x.units ? JSON.stringify(x.units) : ''}`).join('+')
    ev(`MUHAREBE #${b.id} ${b.kind} ${side(b.attackers)} vs ${side(b.defenders)} → ${b.plan?.winner} kayıp ${JSON.stringify(b.plan?.attackerLosses)}/${JSON.stringify(b.plan?.defenderLosses)} tur ${b.plan?.rounds?.length}`)
    st.battles = b.id
  }
  return kinds
}

async function waitFor(minutes: number, stop: string[] = []) {
  const end = clock.now + minutes * 60000
  let lastSeen = clock.now
  ev(`BEKLE ${minutes} dk${stop.length ? ` (dur: ${stop.join(',')})` : ''} · başında: ${st.active.join(',') || 'kimse'}`)
  while (clock.now < end) {
    clock.now = Math.min(end, clock.now + 60000)
    await tickLobby(st.lobby!, clock.now, 0).catch((e: unknown) => console.log('tick hata', String(e)))
    await stampNotices()
    const kinds = await journal()
    if (clock.now - (st.snapAt ?? 0) >= 60 * 60000) {
      st.snapAt = clock.now
      await snapshot()
    }
    const hit = kinds.find((k) => stop.includes(k) || stop.includes('any'))
    if (hit) {
      console.log(`DURDU: ${hit} geldi`)
      break
    }
    // Those at their screen: the open client says so every few minutes.
    if (clock.now - lastSeen >= 5 * 60000) {
      lastSeen = clock.now
      for (const name of st.active) await call(name, { type: 'seen' }).catch(() => null)
    }
  }
  keep()
}

const HELP = `komutlar (SIM_DIR ortam değişkeni bir klasör):
  setup [botSayısı=2]           yerel lobi + 'player' ve bot1..N lordları kurar (saraylarını da)
  status [kim=player]           krallığın özeti (depo, nüfus, hanedan, olaylar ve kriz anahtarları)
  news [kim=player] [all]       yeni elçi haberleri (notices); 'all' hepsini
  wait <dakika> [stop=k1,k2]    sanal saati ilerletir (her dakika tick); oyuncuya bu türden haber gelince durur (stop=any: herhangi)
  grant <kim> '{"gold":500}'     YÖNETMEN: depoya ekler (events.md'ye yazılır)
  patch <kim> '<json>'          YÖNETMEN: durum üzerinde JSON merge patch
  note <metin>                  gözlemini events.md'ye yazar
  snapshot                      her lordun anlık sayıları snapshots.csv'ye
  Otomatik kayıt: SIM_DIR/events.md (her komut, her lordun her haberi, her muharebe) ve snapshots.csv (oyun saatinde bir)
  active <a,b,..>               başında olan (seen gönderen) lordlar; varsayılan player
  build <kind> [kim]            yeri kendisi bulur ve kurar
  cmd <kim> '<json>'            herhangi bir komut (type alanı; şekiller supabase/functions/command/index.ts'te)
  sql "<sorgu>"                 yerel veritabanında salt okuma sorgusu
  time                          sanal saat`

async function main() {
  switch (cmd) {
    case undefined:
    case 'help':
      return console.log(HELP)
    case 'time':
      return console.log(`${gameTime()} (${new Date(clock.now).toISOString()})`)
    case 'setup': {
      const bots = Number(args[0] ?? 2)
      await makeUser('player')
      for (let i = 1; i <= bots; i++) await makeUser(`bot${i}`)
      const made = await call('player', { type: 'createLobby', name: `Sim ${Date.now() % 1e5}`, maxPlayers: 9 })
      if (made.error) throw new Error(made.error)
      st.lobby = made.lobby
      const colors = g.lobbyColors(9)
      let c = 0
      for (const name of Object.keys(st.users)) {
        if (name !== 'player') await call(name, { type: 'join' })
        // The player takes the site with the best food of the three offered; the bots the first.
        const joined = await call(name, { type: 'roll' })
        const sites = (await rowOf(name)).sites as { x: number; y: number }[]
        void joined
        const { world } = await server.worldOf(st.lobby!)
        const site = name === 'player' ? sites.map((p, i) => [g.surveySite(world, p).yields.food, i]).sort((a, b) => b[0] - a[0])[0][1] : 0
        let res
        do res = await call(name, { type: 'found', site, name: `${name === 'player' ? 'Oyuncu' : name} Beyliği`, color: colors[c++] })
        while (res.error === 'color')
        if (res.error) console.log(name, 'found', res.error)
        st.users[name].kingdom = res.kingdom?.id
        const spot = await spotFor(name, 'palace')
        const built = await call(name, { type: 'build', kind: 'palace', ...spot })
        console.log(`${name}: krallık #${res.kingdom?.id} ${built.error ?? 'saray kuruldu'}`)
      }
      keep()
      return
    }
    case 'status':
      await status(args[0] ?? 'player')
      return keep()
    case 'news':
      await news(args[0] ?? 'player', args[1] === 'all')
      return keep()
    case 'wait': {
      const stop = (args.find((a) => a.startsWith('stop=')) ?? 'stop=').slice(5).split(',').filter(Boolean)
      await waitFor(Math.max(1, Math.min(24 * 60, Number(args[0] ?? 10))), stop)
      console.log(`${gameTime()}`)
      return keep()
    }
    case 'grant': {
      // Test director: goods added to a lord's stores (to reach a feature the economy would take hours to afford).
      const who = args[0]
      const add = JSON.parse(args[1]) as Record<string, number>
      const row = await rowOf(who)
      await server.mutateKingdom(row.id, clock.now, (k: { stock: Record<string, number> }) => ({ ...k, stock: Object.fromEntries(Object.entries(k.stock).map(([key, v]) => [key, v + (add[key] ?? 0)])) }))
      ev(`YÖNETMEN grant ${who} ${args[1]}`)
      console.log('OK')
      return keep()
    }
    case 'patch': {
      // Test director: a JSON merge patch on a lord's state (e.g. a sibling's opinion, to see a revolt).
      const who = args[0]
      const patch = JSON.parse(args[1])
      const merge = (a: unknown, b: unknown): unknown =>
        b && typeof b === 'object' && !Array.isArray(b) && a && typeof a === 'object' && !Array.isArray(a)
          ? Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => [key, key in (b as object) ? merge((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]) : (a as Record<string, unknown>)[key]]).filter(([, v]) => v !== null))
          : b
      const row = await rowOf(who)
      await server.mutateKingdom(row.id, clock.now, (k: object) => merge(k, patch) as object)
      ev(`YÖNETMEN patch ${who} ${args[1].slice(0, 200)}`)
      console.log('OK')
      return keep()
    }
    case 'note':
      // The tester's own observation, into the same journal.
      ev(`NOT ${args.join(' ')}`)
      return keep()
    case 'snapshot':
      await snapshot()
      return keep()
    case 'active':
      st.active = (args[0] ?? '').split(',').filter(Boolean)
      return keep()
    case 'build': {
      const who = args[1] ?? 'player'
      const row = await rowOf(who)
      const k = g.advance(row.state, clock.now, null).kingdom
      const { world } = await server.worldOf(st.lobby!)
      const err = g.buildError(world, k, g.territoryStage(k, clock.now), args[0] as never, null, clock.now)
      if (err && err !== 'spot') return console.log(`RED: ${err}`)
      const spot = await spotFor(who, args[0])
      if (!spot) return console.log('RED: spot (hududda yer yok)')
      const res = await call(who, { type: 'build', kind: args[0], ...spot })
      console.log(res.error ? `RED: ${res.error}` : `OK: ${args[0]} kuruluyor`)
      return keep()
    }
    case 'cmd': {
      const res = await call(args[0], JSON.parse(args[1]))
      console.log(res.error ? `RED: ${res.error}` : `OK${res.result ? ` ${JSON.stringify(res.result).slice(0, 300)}` : ''}`)
      return keep()
    }
    case 'sql': {
      const p = Bun.spawnSync(['docker', 'exec', 'supabase_db_isometric-strategy', 'psql', '-U', 'postgres', '-c', `begin read only; ${args[0]}; commit;`])
      return console.log(p.stdout.toString() + p.stderr.toString())
    }
    default:
      console.log(HELP)
  }
}

await main()
process.exit(0)
