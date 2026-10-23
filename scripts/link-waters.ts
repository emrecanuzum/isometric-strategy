// Moves the running lobbies of world revision 6 to revision 7 (all the water joined, CLAUDE.md §4.2): channels are
// worked out once from each lake or river cut off from the rest to the nearest joined water, round its lords'
// buildings, plots and lands, its towns, inns and cities; they are stored on the lobby (water_links), its world is made
// again with them and the server's tiles are replaced. Nothing a lord built or owns turns to water, and no land is
// cut off from the rest (each channel gets a stone bridge).
//
//   bun scripts/link-waters.ts          dry run: checks every lobby and writes a picture of each one's new channels
//   bun scripts/link-waters.ts --apply  writes the tiles, the channels and the revision
//   --local                             against the local Supabase instead of the linked project
//   --seed <n> [--keep file.json]       no database: plans one world of revision 6 (for trying it out)
//
// The secret key is read from the Supabase CLI (logged in and linked), never written to disk.

import { gunzipSync, gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { Feature, Terrain, balance, bandSpots, boatSpots, carveLinks, caveSpots, havenSpots, generateWorld, territoryRect, valueNoise, type Point, type Polyline, type RiverKeep, type World } from '../packages/shared/src/index.ts'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const apply = process.argv.includes('--apply')
const wet = (t: number) => t === Terrain.River || t === Terrain.Lake
const LINK_WIDTH = 3
// How near the channel may come to what must stay as it is: far enough that its lowered banks do not reach it, or if
// no way is found so, near enough that only the bank's last slope does.
const GAPS = [balance.world.riverWiden.slopeTiles + LINK_WIDTH, 4]
const STEP = 4

// The water bodies (4-way, as a fleet sails), each tile labelled with its body, and each body's size.
function bodies(size: number, terrain: Uint8Array) {
  const label = new Int32Array(size * size).fill(-1)
  const sizes: number[] = []
  for (let i = 0; i < size * size; i++) {
    if (label[i] >= 0 || !wet(terrain[i])) continue
    const id = sizes.length
    label[i] = id
    const stack = [i]
    let n = 0
    while (stack.length) {
      const j = stack.pop()!
      n++
      const x = j % size
      const y = (j - x) / size
      for (const k of [x > 0 ? j - 1 : -1, x < size - 1 ? j + 1 : -1, y > 0 ? j - size : -1, y < size - 1 ? j + size : -1]) {
        if (k < 0 || label[k] >= 0 || !wet(terrain[k])) continue
        label[k] = id
        stack.push(k)
      }
    }
    sizes.push(n)
  }
  return { label, sizes }
}

// The walkable land's parts (water is walkable only on a bridge), for checking no land is cut off.
function landParts(world: World) {
  const { size, terrain, feature } = world
  const ok = (i: number) => !wet(terrain[i]) || feature[i] === Feature.Bridge
  const label = new Int32Array(size * size).fill(-1)
  let id = 0
  for (let i = 0; i < size * size; i++) {
    if (label[i] >= 0 || !ok(i)) continue
    label[i] = id
    const stack = [i]
    while (stack.length) {
      const j = stack.pop()!
      const x = j % size
      const y = (j - x) / size
      for (const k of [x > 0 ? j - 1 : -1, x < size - 1 ? j + 1 : -1, y > 0 ? j - size : -1, y < size - 1 ? j + size : -1]) {
        if (k < 0 || label[k] >= 0 || !ok(k)) continue
        label[k] = id
        stack.push(k)
      }
    }
    id++
  }
  return label
}

class Heap {
  keys: number[] = []
  nodes: number[] = []
  push(p: number, n: number) {
    const { keys, nodes } = this
    let i = keys.length
    keys.push(p)
    nodes.push(n)
    while (i > 0) {
      const j = (i - 1) >> 1
      if (keys[j] <= p) break
      keys[i] = keys[j]
      nodes[i] = nodes[j]
      i = j
    }
    keys[i] = p
    nodes[i] = n
  }
  pop(): [number, number] {
    const { keys, nodes } = this
    const top: [number, number] = [keys[0], nodes[0]]
    const p = keys.pop()!
    const n = nodes.pop()!
    const len = keys.length
    if (len > 0) {
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        if (l >= len) break
        const m = l + 1 < len && keys[l + 1] < keys[l] ? l + 1 : l
        if (keys[m] >= p) break
        keys[i] = keys[m]
        nodes[i] = nodes[m]
        i = m
      }
      keys[i] = p
      nodes[i] = n
    }
    return top
  }
  get size() {
    return this.keys.length
  }
}

interface Plan {
  links: Polyline[]
  // The bodies left cut off (no way found), by size.
  left: number[]
}

// Plans the channels for a world of revision 6. `hard`: rectangles no channel may come near; `soft`: rectangles it
// should keep out of (a lord's lands), crossed only when there is no other way.
function planLinks(world: World, hard: RiverKeep[], soft: RiverKeep[]): Plan {
  const { size } = world
  const terrain = world.terrain.slice()
  const feature = world.feature.slice()
  const height = world.height.slice()
  const elevation = world.elevation.slice()
  const S = balance.cities.size
  const rects: RiverKeep[] = [
    ...hard,
    ...world.inns.map((p): RiverKeep => [p.x - 2, p.y - 2, 6, 6]),
    ...world.cities.map((c): RiverKeep => [c.x - 30, c.y - 30, S + 60, S + 60]),
  ]
  const mark = (into: Uint8Array, [x, y, w, h]: RiverKeep, gap: number) => {
    for (let ty = Math.max(0, y - gap); ty < Math.min(size, y + h + gap); ty++) {
      for (let tx = Math.max(0, x - gap); tx < Math.min(size, x + w + gap); tx++) into[ty * size + tx] = 1
    }
  }
  const softAt = new Uint8Array(size * size)
  for (const r of soft) mark(softAt, r, 2)
  // Tried in turn: off the roads (a road cut by a channel moves the bandits who walk it), then over them.
  const blocked = [false, true].flatMap((overRoads) =>
    GAPS.map((gap) => {
      const out = new Uint8Array(size * size)
      for (const r of rects) mark(out, r, gap)
      for (let i = 0; i < size * size; i++) {
        const f = world.feature[i]
        if (f === Feature.Inn || f === Feature.City) out[i] = 1
        // (Three tiles off: the channel's own width, and a tile beside a road the bands step by.)
        if (!overRoads && (f === Feature.Road || f === Feature.Bridge)) mark(out, [i % size, Math.floor(i / size), 1, 1], 3)
      }
      return out
    }),
  )
  const border = balance.world.borderTiles
  const landCost = (i: number) => {
    const x = i % size
    const y = (i - x) / size
    let c = 1 + height[i] / 60
    if (terrain[i] === Terrain.Mountain) c += 6
    if (terrain[i] === Terrain.Swamp) c += 0.5
    if (feature[i] === Feature.Road) c += 15
    if (softAt[i]) c += 40
    if (Math.min(x, y, size - 1 - x, size - 1 - y) < border) c += 4
    // Broad patches of cheaper and dearer ground, so the channel winds.
    return c * (0.6 + 0.8 * valueNoise(x / 23, y / 23, world.seed + 977))
  }

  const links: Polyline[] = []
  const left: number[] = []
  const tried = new Set<number>()
  for (;;) {
    const { label, sizes } = bodies(size, terrain)
    const main = sizes.indexOf(Math.max(...sizes))
    // The biggest body still cut off that has not been given up on (by one of its tiles, stable across passes).
    let pick = -1
    for (let id = 0; id < sizes.length; id++) {
      if (id === main || sizes[id] < balance.territory.shoreMinWater) continue
      if (pick < 0 || sizes[id] > sizes[pick]) {
        const first = label.indexOf(id)
        if (!tried.has(first)) pick = id
      }
    }
    if (pick < 0) break
    const firstTile = label.indexOf(pick)
    let path: number[] | null = null
    for (const block of blocked) {
      // Dijkstra from every tile of the body to the nearest tile of the main water.
      const cost = new Float64Array(size * size).fill(Infinity)
      const came = new Int32Array(size * size).fill(-1)
      const heap = new Heap()
      for (let i = 0; i < size * size; i++) {
        if (label[i] !== pick) continue
        cost[i] = 0
        heap.push(0, i)
      }
      let goal = -1
      while (heap.size > 0) {
        const [p, n] = heap.pop()
        if (p > cost[n]) continue
        if (label[n] === main) {
          goal = n
          break
        }
        const x = n % size
        const y = (n - x) / size
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue
          const m = ny * size + nx
          const w = wet(terrain[m])
          if (!w && block[m]) continue
          const step = w ? (label[m] === pick ? 0.05 : 0.3) : landCost(m)
          const c = p + step * (dx && dy ? Math.SQRT2 : 1)
          if (c >= cost[m]) continue
          cost[m] = c
          came[m] = n
          heap.push(c, m)
        }
      }
      if (goal < 0) continue
      const tiles: number[] = []
      for (let n = goal; n !== -1; n = came[n]) tiles.push(n)
      tiles.reverse()
      path = tiles
      break
    }
    if (!path) {
      tried.add(firstTile)
      left.push(sizes[pick])
      continue
    }
    // From the last tile of the body to the first of the main water: the land between is the channel.
    let a = 0
    while (a + 1 < path.length && label[path[a + 1]] === pick) a++
    let b = path.length - 1
    while (b - 1 > a && wet(terrain[path[b - 1]])) b--
    const run = path.slice(a, b + 1)
    const centre = (i: number): Point => ({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 })
    let line = run.filter((_, k) => k % STEP === 0 || k === run.length - 1).map(centre)
    for (let pass = 0; pass < 2 && line.length > 2; pass++) {
      const smooth = [line[0]]
      for (let i = 0; i < line.length - 1; i++) {
        const p = line[i]
        const q = line[i + 1]
        smooth.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 })
        smooth.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 })
      }
      smooth.push(line[line.length - 1])
      line = smooth
    }
    const link = { points: line.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })), width: LINK_WIDTH }
    carveLinks({ seed: world.seed, size, terrain, feature, elevation, height, lake: world.levels.lake }, [link])
    if (bodies(size, terrain).label[firstTile] !== bodies(size, terrain).label[path[path.length - 1]]) {
      // (Should not happen: the channel is wider than a tile all along.)
      tried.add(firstTile)
      left.push(sizes[pick])
    }
    links.push(link)
  }
  return { links, left }
}

// Checks the world of revision 7 against that of revision 6: what must stay dry stays dry, no land is cut off from
// land it was joined to, and the water bodies a dock could stand on are one.
function check(before: World, after: World, hard: RiverKeep[], places: Point[]) {
  const { size } = after
  let drowned = 0
  for (const [x, y, w, h] of hard) {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      const i = ty * size + tx
      if (wet(after.terrain[i]) && !wet(before.terrain[i])) drowned++
    }
  }
  const was = landParts(before)
  const now = landParts(after)
  let split = 0
  const at = (p: Point) => Math.floor(p.y) * size + Math.floor(p.x)
  for (let a = 0; a < places.length; a++) {
    for (let b = a + 1; b < places.length; b++) {
      if (was[at(places[a])] >= 0 && was[at(places[a])] === was[at(places[b])] && now[at(places[a])] !== now[at(places[b])]) split++
    }
  }
  // Land tiles that were part of the main land and are not any more (a piece cut off with no bridge over to it).
  const main = (parts: Int32Array) => {
    const count = new Map<number, number>()
    for (const id of parts) if (id >= 0) count.set(id, (count.get(id) ?? 0) + 1)
    return [...count].sort((p, q) => q[1] - p[1])[0][0]
  }
  const mainWas = main(was)
  const mainNow = main(now)
  let stranded = 0
  for (let i = 0; i < size * size; i++) if (was[i] === mainWas && now[i] >= 0 && now[i] !== mainNow) stranded++
  const { sizes } = bodies(size, after.terrain)
  const cut = sizes.filter((n) => n >= balance.territory.shoreMinWater).length - 1
  let changed = 0
  for (let i = 0; i < size * size; i++) if (after.terrain[i] !== before.terrain[i] || after.feature[i] !== before.feature[i]) changed++
  // What the outlaws are drawn from the world by: the havens, the boats' waters, the caves and the bands' roads.
  const same = (f: (w: World) => unknown[]) => {
    const p = f(before).map((x) => JSON.stringify(x))
    const q = new Set(f(after).map((x) => JSON.stringify(x)))
    return `${p.filter((x) => q.has(x)).length}/${p.length}`
  }
  const seed = before.seed
  const outlaws = {
    havens: same((w) => havenSpots(w, seed).map((h) => h.at)),
    boats: same((w) => boatSpots(w, seed).map((b) => b.loop[0])),
    caves: same((w) => caveSpots(w, seed).map((c) => c.at ?? c)),
    bands: same((w) => bandSpots(w, seed).map((b) => b.path[0])),
  }
  return { drowned, split, stranded, cut, changed, outlaws }
}

function picture(file: string, before: World, after: World, hard: RiverKeep[]) {
  const n = before.size / 2
  const px = new Uint8Array(n * n * 3)
  const kept = new Uint8Array(before.size * before.size)
  for (const [x, y, w, h] of hard) for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) kept[ty * before.size + tx] = 1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let old = 0
      let fresh = 0
      let k = 0
      let m = 0
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = (y * 2 + dy) * before.size + x * 2 + dx
        if (wet(before.terrain[i])) old++
        else if (wet(after.terrain[i])) fresh++
        if (kept[i]) k++
        if (before.terrain[i] === Terrain.Mountain) m++
      }
      const c = k ? [220, 40, 40] : fresh ? [255, 170, 0] : old ? [30, 80, 200] : m > 2 ? [120, 110, 100] : [150, 180, 110]
      px.set(c, (y * n + x) * 3)
    }
  }
  writeFileSync(file, Buffer.concat([Buffer.from(`P6 ${n} ${n} 255\n`), Buffer.from(px)]))
}

mkdirSync('scripts/tmp/links', { recursive: true })

// One world without the database, for trying the planner out.
const seedArg = arg('--seed')
if (seedArg) {
  const seed = Number(seedArg)
  const keepFile = arg('--keep')
  const keep: RiverKeep[] = keepFile ? JSON.parse(readFileSync(keepFile, 'utf8')) : []
  const before = generateWorld(seed, 6, keep)
  const t0 = performance.now()
  const plan = planLinks(before, keep, [])
  const after = generateWorld(seed, 7, keep, plan.links)
  const result = check(before, after, keep, [...before.inns, ...before.cities])
  console.log(`seed ${seed}: ${plan.links.length} channels (${after.crossings.length - before.crossings.length} stone bridges over them), left cut off: [${plan.left.join(', ')}], ${(performance.now() - t0).toFixed(0)} ms`, result)
  picture(`scripts/tmp/links/seed-${seed}.ppm`, before, after, keep)
  process.exit(0)
}

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

const { data: lobbies, error } = await db.from('lobbies').select('id, name, seed, world_rev, river_keep').eq('world_rev', 6)
if (error) throw error
for (const lobby of lobbies ?? []) {
  const { data: kingdoms } = await db.from('kingdoms').select('id, name, state').eq('lobby_id', lobby.id)
  const { data: towns } = await db.from('lobby_towns').select('x, y').eq('lobby_id', lobby.id)
  const keep: RiverKeep[] = lobby.river_keep ?? []
  const hard: RiverKeep[] = []
  const soft: RiverKeep[] = []
  const places: Point[] = []
  const lastStage = balance.territory.stageParcels.length - 1
  for (const k of kingdoms ?? []) {
    const s = k.state
    if (!s) continue
    for (const b of s.buildings ?? []) hard.push([b.x, b.y, b.size, b.size])
    if (s.dockPlot) hard.push([s.dockPlot.x - 2, s.dockPlot.y - 2, s.dockPlot.size + 4, s.dockPlot.size + 4])
    if (s.site) {
      const land = territoryRect(s.site, lastStage)
      soft.push([land.x, land.y, land.size, land.size])
      places.push(s.site)
    }
  }
  for (const t of towns ?? []) {
    hard.push([t.x, t.y, 8, 8])
    places.push({ x: t.x + 4, y: t.y + 9 })
  }

  // The stored tiles must be those of revision 6, or the lobby's world is not what this script thinks it is.
  const { data: stored } = await db.from('lobby_worlds').select('size, tiles').eq('lobby_id', lobby.id).single()
  const old = gunzipSync(Buffer.from((stored!.tiles as string).replace(/^\\x/, ''), 'hex'))
  const before = generateWorld(lobby.seed, 6, keep)
  const n = before.size * before.size
  let mismatch = 0
  for (let i = 0; i < n; i++) if (old[i] !== before.terrain[i] || old[n + i] !== before.feature[i]) mismatch++
  const plan = planLinks(before, hard, soft)
  const world = generateWorld(lobby.seed, 7, keep, plan.links)
  const result = check(before, world, hard, [...places, ...before.inns, ...before.cities])
  console.log(
    `${lobby.name}: ${kingdoms?.length} lords, ${plan.links.length} channels (${world.crossings.length - before.crossings.length} stone bridges, ${result.changed} tiles changed), left cut off [${plan.left.join(', ')}], ` +
      `water bodies still cut off: ${result.cut}, stored≠rev6: ${mismatch}, kept tiles drowned: ${result.drowned}, places cut off: ${result.split}, land tiles stranded: ${result.stranded}, unmoved ${JSON.stringify(result.outlaws)}`,
  )
  picture(`scripts/tmp/links/${lobby.name.replace(/\W+/g, '_')}.ppm`, before, world, hard)

  if (!apply) continue
  if (mismatch > 0 || result.drowned > 0 || result.split > 0 || result.stranded > 0) {
    console.log('  skipped: the checks above failed')
    continue
  }
  const tiles = new Uint8Array(n * 2)
  tiles.set(world.terrain, 0)
  tiles.set(world.feature, n)
  const packed = gzipSync(tiles, { level: 9 })
  // The channels first: a client that reads revision 7 must find them.
  const { error: linkError } = await db.from('lobbies').update({ water_links: plan.links }).eq('id', lobby.id)
  if (linkError) throw linkError
  const { error: tilesError } = await db.from('lobby_worlds').update({ tiles: `\\x${Buffer.from(packed).toString('hex')}` }).eq('lobby_id', lobby.id)
  if (tilesError) throw tilesError
  const { error: revError } = await db.from('lobbies').update({ world_rev: 7 }).eq('id', lobby.id)
  if (revError) throw revError
  console.log('  moved to revision 7')
}
