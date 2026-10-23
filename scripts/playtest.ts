// A headless lordship for play-testing progression: the shared rules (`advance`, build, upgrade…) on a virtual clock,
// kept in a JSON file between calls. Server-only things (crown patrols and tribute, other lords, raids, the lobby
// market's movement) do not happen here; prices stay at their usual values.
//
//   bun scripts/playtest.ts <save.json> new [seed]
//   bun scripts/playtest.ts <save.json> status | costs | help
//   bun scripts/playtest.ts <save.json> build <kind> | upgrade <id|kind> | trade <good|none> | tax <level>
//   bun scripts/playtest.ts <save.json> swear <0|1> | queen | product <id> <product> | wait <minutes> [away]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import * as g from '../packages/shared/src'
import type { BuildingKind, Kingdom, Point, World } from '../packages/shared/src'

type Save = { seed: number; now: number; start: number; k: Kingdom | null; site: Point; log: string[] }

const [file, cmd, ...args] = process.argv.slice(2)
if (!file || !cmd) {
  console.log('usage: bun scripts/playtest.ts <save.json> <command> [args]  (try "help")')
  process.exit(1)
}
const save: Save | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
const keep = (s: Save) => writeFileSync(file, JSON.stringify(s))
const mins = (ms: number) => `${Math.round(ms / 60000)} dk`
const n = (v: number | undefined) => Math.round(v ?? 0)

let world: World | null = null
const worldOf = (seed: number) => (world ??= g.generateWorld(seed))

// `seen`: the lord is at the keyboard (a command, or an active wait); otherwise the realm runs on alone.
function settle(s: Save, to: number, seen: boolean) {
  if (!s.k) return
  s.k = g.advance(s.k, to, null).kingdom
  if (seen) s.k = { ...s.k, ...g.presenceAt(s.k, to, true) }
  s.now = to
}

function spotFor(s: Save, kind: BuildingKind): Point | null {
  const k = s.k!
  const w = worldOf(s.seed)
  const stage = g.territoryStage(k, s.now)
  if (kind === 'dock') return k.dockPlot
  const r = g.territoryRect(k.site, stage)
  const palace = k.buildings.find((b) => b.kind === 'palace') ?? { x: k.site.x, y: k.site.y }
  let best: Point | null = null
  let bestD = Infinity
  for (let y = r.y; y < r.y + r.size; y++)
    for (let x = r.x; x < r.x + r.size; x++) {
      const d = Math.hypot(x - palace.x, y - palace.y)
      if (d >= bestD) continue
      if (g.buildError(w, k, stage, kind, { x, y }, s.now) === null) {
        best = { x, y }
        bestD = d
      }
    }
  return best
}

function status(s: Save) {
  const k = s.k!
  const at = s.now
  const pop = g.population(k, at)
  const led = g.ledger(k, at)
  const lvl = g.palaceLevel(k, at)
  const cap = g.storageCap(k, at)
  const out = [
    `ZAMAN: oyunda ${mins(at - s.start)} geçti | saray seviyesi ${lvl} | hudut aşaması ${g.territoryStage(k, at)}`,
    `DEPO (sınır ${cap}): altın ${n(k.stock.gold)}/${g.goldCap(k, at)}  yemek ${n(k.stock.food)}  yapı ${n(k.stock.materials)}  savaş ${n(k.stock.arms)}`,
    `NÜFUS: köylü ${pop.villagers}/${pop.room} yer (barınak ${pop.housing}, sınır ${pop.cap}) | işler ${pop.jobs} | verim %${Math.round(pop.efficiency * 100)} | mutluluk ${n(k.happiness)} | vergi ${k.tax ?? 'normal'} | kraliçe ${k.queen ? 'var' : 'yok'} | biat ${k.liege ?? 'yok'}`,
    `VERGİ: tur başına ${led.tax.toFixed(2)} altın (saatte ~${Math.round(led.tax * 360)}) | tüccar malı ${k.trade.good ?? 'yok'} sv ${k.trade.level}`,
    `YAPILAR:`,
    ...k.buildings
      .filter((b) => b.kind !== 'wall' && b.kind !== 'road')
      .map((b) => `  #${b.id} ${b.kind} sv${b.level ?? 1}${b.doneAt > at ? ` (inşaatta, ${mins(b.doneAt - at)} kaldı)` : ''}${b.product ? ` ürün=${b.product}` : ''}`),
  ]
  const palace = k.buildings.find((b) => b.kind === 'palace')
  if (palace) {
    const up = g.upgradeSpec(palace)
    const err = g.upgradeError(k, palace.id, at)
    out.push(up ? `SARAY YÜKSELTME: maliyet ${JSON.stringify(up.cost)} süre ${up.buildSeconds}s → ${err ?? 'YAPILABİLİR'}` : 'SARAY: en üst seviye')
  }
  console.log(out.join('\n'))
}

function costs(s: Save) {
  const k = s.k!
  const w = worldOf(s.seed)
  const stage = g.territoryStage(k, s.now)
  for (const kind of g.BUILDABLE) {
    if (kind === 'wall' || kind === 'road' || kind === 'gate') continue
    const cap = g.capOf(k, kind, s.now)
    const have = k.buildings.filter((b) => b.kind === kind).length
    const err = g.buildError(w, k, stage, kind, null, s.now)
    console.log(`${kind.padEnd(11)} maliyet ${JSON.stringify(g.buildCost(k, kind))} süre ${g.BUILDINGS[kind].buildSeconds ?? 0}s  ${have}/${cap ?? '∞'}  ${err && err !== 'spot' ? `✗ ${err}` : '✓'}`)
  }
}

if (cmd === 'help') {
  console.log(`komutlar: new [seed] | status | costs | build <kind> | upgrade <id|kind> | trade <food|materials|arms|none> | tax <low|normal|high|heavy> | swear <0|1> | queen | product <id> <product> | wait <dakika> [away]
mallar: food=yemek materials=yapı malzemesi arms=savaş malzemesi. Bir tur = 10 gerçek saniye. "wait 30" oyunda 30 gerçek dakika ilerletir (açık sekme gibi); "wait 120 away" oyuncu yokmuş gibi.
hata kodları: cost=para/malzeme yok, queue=inşaat yeri dolu, limit=sınır/barınak dolu, locked=saray seviyesi yetmez, liege=önce biat, queen=önce kraliçe, unique=zaten var, spot=yer yok, early=biat için en az 6 yapı.`)
  process.exit(0)
}

if (cmd === 'new') {
  const seed = Number(args[0] ?? Math.floor(Math.random() * 2 ** 31))
  const w = worldOf(seed)
  let r = seed
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648)
  const site = g.assignStartSite(w, rand)!
  const start = Date.UTC(2026, 9, 1, 8)
  const s: Save = { seed, now: start, start, site, k: g.foundKingdom(w, site, start, 'Test Beyliği', 'red'), log: [] }
  const palaceSpot = spotFor(s, 'palace')!
  s.k = g.build(w, s.k!, 0, 'palace', palaceSpot, start)
  keep(s)
  console.log(`Yeni lordluk (tohum ${seed}). Saray kuruldu.`)
  status(s)
  process.exit(0)
}

if (!save) {
  console.log('Kayıt yok: önce "new".')
  process.exit(1)
}
const s = save
const real = cmd !== 'status' && cmd !== 'costs'
if (real) settle(s, s.now, true)
const k = () => s.k!
const w = worldOf(s.seed)
const say = (ok: boolean, text: string) => console.log(`${ok ? 'OK' : 'RED'}: ${text}`)

switch (cmd) {
  case 'status':
    status(s)
    break
  case 'costs':
    costs(s)
    break
  case 'build': {
    const kind = args[0] as BuildingKind
    if (!g.BUILDABLE.includes(kind as never)) {
      say(false, `bilinmeyen yapı ${kind}`)
      break
    }
    const stage = g.territoryStage(k(), s.now)
    const err = g.buildError(w, k(), stage, kind, null, s.now)
    const spot = err && err !== 'spot' ? null : spotFor(s, kind)
    if (!spot) {
      say(false, `${kind}: ${err && err !== 'spot' ? err : 'spot (yer yok)'}`)
      break
    }
    s.k = g.build(w, k(), stage, kind, spot, s.now)
    say(true, `${kind} kuruluyor (${g.BUILDINGS[kind].buildSeconds ?? 0}s)`)
    break
  }
  case 'upgrade': {
    const b = k().buildings.find((b) => String(b.id) === args[0]) ?? k().buildings.find((b) => b.kind === args[0] && !g.upgradeError(k(), b.id, s.now)) ?? k().buildings.find((b) => b.kind === args[0])
    if (!b) {
      say(false, 'böyle yapı yok')
      break
    }
    const err = g.upgradeError(k(), b.id, s.now)
    if (err) {
      say(false, `#${b.id} ${b.kind}: ${err} (maliyet ${JSON.stringify(g.upgradeSpec(b)?.cost ?? {})})`)
      break
    }
    s.k = g.upgradeBuilding(k(), b.id, s.now)
    say(true, `#${b.id} ${b.kind} → sv${(b.level ?? 1) + 1} (${g.upgradeSpec(b)?.buildSeconds}s)`)
    break
  }
  case 'trade': {
    const good = args[0] === 'none' ? null : (args[0] as never)
    const next = g.setTradeGood(k(), good, s.now)
    say(next !== k(), `tüccar: ${args[0]}`)
    s.k = next
    break
  }
  case 'tax':
    s.k = g.setTax(k(), args[0] as never)
    say(true, `vergi ${args[0]}`)
    break
  case 'swear': {
    const err = g.fealtyError(k(), Number(args[0]), w.cities.length, s.now)
    if (err) say(false, `biat: ${err}`)
    else {
      s.k = g.swearFealty(k(), Number(args[0]), w.cities.length, s.now)
      say(true, `taç ${args[0]}'e biat edildi`)
    }
    break
  }
  case 'queen': {
    const err = g.queenError(k(), s.now)
    if (err) say(false, `kraliçe: ${err}`)
    else {
      s.k = g.takeQueen(k(), s.now)
      say(true, 'kraliçe geldi')
    }
    break
  }
  case 'product': {
    const next = g.setProduct(k(), Number(args[0]), args[1], s.now)
    say(next !== k(), `ürün #${args[0]} → ${args[1]}`)
    s.k = next
    break
  }
  case 'wait': {
    const minutes = Math.min(600, Math.max(1, Number(args[0] ?? 10)))
    const away = args[1] === 'away'
    const before = { ...k().stock }
    const end = s.now + minutes * 60000
    // In five-minute steps: an active lord is seen at each, an away one not at all.
    for (let t = s.now; t < end; ) {
      t = Math.min(end, t + 5 * 60000)
      settle(s, t, !away)
    }
    const d = (key: keyof typeof before) => `${key} ${n(k().stock[key]) - n(before[key]) >= 0 ? '+' : ''}${n(k().stock[key]) - n(before[key])}`
    console.log(`${minutes} dk geçti${away ? ' (yokken)' : ''}: ${['gold', 'food', 'materials', 'arms'].map((x) => d(x as never)).join(', ')}`)
    break
  }
  default:
    say(false, `bilinmeyen komut ${cmd} (help)`)
}
keep(s)
