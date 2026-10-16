import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BOARDS, CLOTH_RED, FRONT, GOLD, PANE, GRANITE, IRON, LEAVES, LIME, OAK, SIDE, TOP,
  animate, ashlar, covering, dith, flagpole, paveArea, plot, smoky, toneOf,
} from './buildingKit'
import type { Model, RoofStyle, Top } from './buildingKit'
import { block, mat, stoneBox, woodBox } from './lordBuildings'

// Stone of a round tower at angle a and height z, lit l: courses of blocks with mortar.
export function towerStone(r: Uint32Array, a: number, z: number, l: number, radius: number, x: number, y: number, seed = 1) {
  const s = a * radius
  const k = Math.floor(z / 3.5)
  const j = Math.floor((s + (k & 1) * 3) / 6)
  const zi = z - k * 3.5
  const si = (s + (k & 1) * 3) - j * 6
  let t = toneOf(r.length, l) + (hash(j, k, seed) - 0.5) * 0.8
  if (zi < 0.6 || si < 0.6) t -= 1.2
  else if (zi > 2.6) t += 0.5
  if (z < 1.5) t -= 0.4
  return dith(r, t, x, y)
}

// A round tower on (u, v): stone up to `tall`, then battlements, and a conical roof when given (open-topped and
// paved inside the battlements when not). Arrow slits up its face. Returns its tip.
export function roundTower(m: Model, u: number, v: number, r: number, tall: number, stone: Uint32Array, roof: RoofStyle | null, o: { slits?: boolean; lit?: boolean; corbel?: boolean; seed?: number } = {}) {
  const seed = o.seed ?? 3
  m.cylinder(u, v, r, 0, tall, (a, z, l, x, y) => towerStone(stone, a, z, l, r, x, y, seed))
  // A corbelled ring under the battlements.
  if (o.corbel !== false) m.cylinder(u, v, r + 0.8, tall - 1.5, tall, (a, z, l, x, y) => dith(stone, toneOf(stone.length, l) + (Math.round(a * r) % 2 ? 0.6 : -0.8) + (z < tall - 1 ? -0.6 : 0.3), x, y), false)
  // Battlements: merlons round the top.
  const n = Math.max(6, Math.round((Math.PI * 2 * r) / 3))
  m.cylinder(u, v, r + 0.8, tall, tall + 2.2, (a, z, l, x, y) => {
    const merlon = Math.floor(((a / (Math.PI * 2)) * n * 2) % 2) === 0
    return merlon ? dith(stone, toneOf(stone.length, l) + (z > tall + 1.6 ? 0.7 : 0), x, y) : 0
  }, false)
  // Slits (lit windows on a palace).
  if (o.slits !== false) {
    for (const a of [Math.PI * 0.5, Math.PI * 0.12, Math.PI * 0.85]) {
      for (let z = tall * 0.3; z < tall * 0.85; z += tall * 0.32) {
        for (let dz = 0; dz < 3.5; dz += 0.5) for (const da of [-0.5, 0]) m.put(u + Math.cos(a + da / r) * (r + 0.1), v + Math.sin(a + da / r) * (r + 0.1), z + dz, o.lit ? (dz > 2.5 ? PANE[3] : dz > 1.5 ? PANE[2] : PANE[1]) : IRON[0], 0.5)
      }
    }
  }
  if (!roof) {
    m.disc(u, v, r, tall + 0.2, (a, b, x, y) => dith(LIME, 2.2 + (hash(Math.round(a), Math.round(b), 4) - 0.5), x, y))
    return { x: m.sx(u, v), y: m.sy(u, v, tall + 2), z: tall + 2 }
  }
  const cone = r * 2.6
  m.cone(u, v, r + 1.6, tall + 1.2, cone, (a, f, l, x, y) => {
    if (f < 0.06) return dith(roof.r, toneOf(roof.r.length, l) - 1.4, x, y)
    return covering(roof.kind, roof.r, l, a * (r + 1.6) * (1 - f) * 1.4, f * cone, x, y, seed)
  })
  return { x: m.sx(u, v), y: m.sy(u, v, tall + 1.2 + cone), z: tall + 1.2 + cone }
}

// A crenellated curtain wall from (u0, v0) to (u1, v1), `thick` deep; its merlons along both faces seen.
export function curtain(m: Model, u0: number, v0: number, u1: number, v1: number, tall: number, stone: Uint32Array, seed = 5) {
  m.box(u0, v0, u1, v1, 0, tall, {
    front: ashlar(stone, { l: FRONT, seed }, 3.5, 7),
    side: ashlar(stone, { l: SIDE, seed: seed + 1 }, 3.5, 7),
    top: (u, v, x, y) => dith(stone, toneOf(stone.length, TOP) - 0.8 + (hash(Math.floor(u / 3), Math.floor(v / 3), seed) - 0.5) * 0.5, x, y),
  })
  const alongU = u1 - u0 > v1 - v0
  const len = alongU ? u1 - u0 : v1 - v0
  for (let s = 0; s < len - 0.5; s += 3) {
    if (Math.floor(s / 3) % 2 === 1) continue
    const a0 = (alongU ? u0 : v0) + s
    const a1 = Math.min(a0 + 1.8, alongU ? u1 : v1)
    for (const edge of [0, 1]) {
      const e0 = alongU ? (edge ? v1 - 1 : v0) : edge ? u1 - 1 : u0
      if (alongU) stoneBox(m, a0, e0, a1, e0 + 1, tall, tall + 2.2, stone, false, 2.2)
      else stoneBox(m, e0, a0, e0 + 1, a1, tall, tall + 2.2, stone, false, 2.2)
    }
  }
}

// A hanging banner on a wall facing +v (front) or +u (side): the kingdom's colour with a gold border and emblem.
export function drape(m: Model, face: 'front' | 'side', at: number, s0: number, top: number, w: number, length: number, cloth: Uint32Array) {
  const l = face === 'front' ? FRONT : SIDE
  for (let s = 0; s <= w; s += 0.5) {
    for (let z = top - length; z <= top; z += 0.5) {
      const point = z < top - length + w / 2 && Math.abs(s - w / 2) > z - (top - length)
      if (point) continue
      const edge = s < 0.8 || s > w - 0.8 || z > top - 0.8
      const emblem = Math.abs(s - w / 2) < 1.2 && Math.abs(z - (top - length * 0.45)) < 1.6
      const c = edge || emblem ? GOLD[edge ? 3 : 4] : dith(cloth, toneOf(cloth.length, l) + 0.4 + (Math.round(s) % 3 === 0 ? -0.5 : 0), s, z)
      if (face === 'front') m.put(s0 + s, at, z, c, 0.8)
      else m.put(at, s0 + s, z, c, 0.8)
    }
  }
}

// A gilded star with eight points over (u, v, z).
function star(m: Model, u: number, v: number, z: number) {
  m.card(u, v, z, (set) => {
    for (let k = 0; k < 6; k++) set(0, k, GOLD[2])
    for (let d = -5; d <= 5; d++) {
      const a = Math.abs(d)
      set(d, 10, GOLD[a < 2 ? 5 : 3])
      set(0, 10 + d, GOLD[a < 2 ? 5 : 3])
      if (a <= 3) { set(d, 10 + d, GOLD[a < 2 ? 5 : 2]); set(d, 10 - d, GOLD[a < 2 ? 5 : 2]) }
    }
  }, 3)
}

const PALACE = [
  { wall: 11, tower: [6, 20], keep: [26, 20, 14], upper: null, gatehouse: false, turrets: false },
  { wall: 13, tower: [7, 26], keep: [30, 24, 15], upper: null, gatehouse: true, turrets: false },
  { wall: 14, tower: [7.5, 32], keep: [32, 26, 10], upper: [20, 14, 14], gatehouse: true, turrets: false },
  { wall: 15, tower: [8, 38], keep: [36, 30, 10], upper: [24, 18, 16], gatehouse: true, turrets: true },
  { wall: 16, tower: [9, 44], keep: [40, 32, 10], upper: [26, 20, 18], gatehouse: true, turrets: true },
] as const

// The palace (CLAUDE.md §6.4) grows with its level, roofed in the kingdom's colour: a walled keep with open corner
// towers (1); roofed towers, a gatehouse and banners on the towers (2); a second tier on the keep (3); a taller keep with
// turrets at its corners (4); at 5 a grand keep with a gilded star, turrets along the walls, gilded ridges and ivy.
// Paved courtyard, crenellated curtain walls, arched lit windows; the flags wave (4 frames).
export function palaceModel(roofs: Uint32Array, level = 1): Sprite {
  return animate((f) => palaceFrame(roofs, Math.max(1, Math.min(5, level)), f), 4, 5)
}
function palaceFrame(roofs: Uint32Array, level: number, f: number): Sprite {
  const p = PALACE[level - 1]
  const { canvas, cx, base, m, N } = plot(3, 110 + level * 22)
  const tops: Top[] = []
  const stone = level >= 4 ? LIME : GRANITE
  const roof: RoofStyle = { kind: 'slate', r: roofs, seed: 11, cap: level >= 5 ? GOLD[3] : undefined }
  const e = 9
  const t = 3
  paveArea(m, e, e, N - e, N - e, 'flagstone', 17, false)
  // The keep in the middle of the yard (before the walls: the depth test sorts them).
  const [kw, kwall, krise] = p.keep
  const k0 = (N - kw) / 2 - 2
  const k1 = k0 + kw
  const keep = block(m, {
    u0: k0, v0: k0, u1: k1, v1: k1, wall: kwall, walls: mat.ashlar(stone, 4, 8),
    roof: { form: p.upper ? 'flat' : 'hip', rise: krise, oh: 1.5, style: roof },
    rows: { z: kwall > 24 ? [5, 15, 23] : kwall > 20 ? [5, 14] : [5, 12], every: 7, w: 3, h: 5, style: { frame: LIME, arch: true } },
    door: { face: 'front', s: kw / 2 - 3, w: 6, h: 9, style: { arch: true, step: LIME, wood: OAK } },
    chimneys: p.upper ? [] : [{ u: 0.8, v: 0.25, tall: 6 }],
  })
  tops.push(...keep.tops)
  // The parapet of a keep with an upper tier.
  let crown = keep.peak
  let crownZ = keep.ridge
  if (p.upper) {
    for (let s = 0; s < kw; s += 3) {
      if (Math.floor(s / 3) % 2) continue
      stoneBox(m, k0 + s, k1 - 1, k0 + s + 1.8, k1, kwall, kwall + 2.5, stone, false, 2.5)
      stoneBox(m, k1 - 1, k0 + s, k1, k0 + s + 1.8, kwall, kwall + 2.5, stone, false, 2.5)
    }
    const [uw, uwall, urise] = p.upper
    const c0 = (N - uw) / 2 - 3
    const up = block(m, {
      u0: c0, v0: c0, u1: c0 + uw, v1: c0 + uw, z0: kwall, wall: uwall, walls: mat.ashlar(stone, 4, 8),
      roof: { form: 'hip', rise: urise, oh: 1.5, style: roof },
      rows: { z: [4, uwall - 7], every: 6, w: 2.5, h: 4.5, style: { frame: LIME, arch: true } },
      chimneys: [{ u: 0.8, v: 0.25, tall: 6 }],
    })
    tops.push(...up.tops)
    crown = up.peak
    crownZ = up.ridge
    if (p.turrets) {
      // Turrets at the keep's corners.
      for (const [a, b] of [[k1, k1], [k0, k1], [k1, k0]]) {
        roundTower(m, a - 1, b - 1, 3.5, kwall + uwall * 0.6, stone, roof, { lit: true, corbel: false, seed: 13 })
      }
    }
  }
  if (level >= 2) for (const s of level >= 4 ? [4, kw - 10] : [kw / 2 - 9]) drape(m, 'side', k1, k0 + s, kwall - 3, 5, 12, roofs)
  if (level >= 4) drape(m, 'front', k1, k0 + 4, kwall - 3, 5, 12, roofs)
  const mid = p.upper ? N / 2 - 3 : N / 2 - 2
  if (level >= 5) star(m, mid, mid, crownZ - 1)
  void crown
  // The curtain walls round the yard.
  const w = p.wall
  curtain(m, e, e, N - e, e + t, w, stone)
  curtain(m, e, e, e + t, N - e, w, stone)
  const gate = N / 2
  const gw = p.gatehouse ? 9 : 6
  curtain(m, N - e - t, e, N - e, N - e, w, stone)
  curtain(m, e, N - e - t, gate - gw, N - e, w, stone)
  curtain(m, gate + gw, N - e - t, N - e, N - e, w, stone)
  // The gate in the front wall: an arch over oak doors (a gatehouse with a portcullis from level 2).
  const gt = p.gatehouse ? w + 9 : w
  stoneBox(m, gate - gw, N - e - t - 1, gate + gw, N - e + 0.5, 0, gt, stone, true, 3.5)
  m.front(gate - 4, gate + 4, N - e + 0.5, 0, (s) => 8 + Math.sqrt(Math.max(0, 16 - (s - 4) ** 2)) * 0.8, (s, z, x, y) => {
    if (p.gatehouse) return Math.round(s * 2) % 3 === 0 && z > 0.5 ? IRON[4] : Math.round(z * 2) % 5 === 0 ? IRON[3] : OAK[0]
    return Math.abs(s - 4) < 0.5 ? OAK[1] : dith(BOARDS, 2.8 - (Math.round(s * 2) % 4 === 0 ? 1 : 0), x, y)
  }, 0.6)
  if (p.gatehouse) {
    for (let s = 0; s < gw * 2; s += 3) if (Math.floor(s / 3) % 2 === 0) stoneBox(m, gate - gw + s, N - e - 0.5, gate - gw + s + 1.8, N - e + 0.5, gt, gt + 2.2, stone, false, 2.2)
    for (const side of [-1, 1]) roundTower(m, gate + side * (gw + 1), N - e - 1, 4.5, gt + 4, stone, roof, { lit: true, seed: 19 })
    // A crest over the gate.
    if (level >= 3) m.card(gate, N - e + 0.6, gt - 6, (set) => {
      for (let dz = -3; dz <= 3; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dz) <= 3) set(dx, dz, Math.abs(dx) + Math.abs(dz) === 3 ? GOLD[1] : dz > 0 ? GOLD[5] : roofs[4])
    }, 2)
  }
  // The corner towers.
  const [tr, tt] = p.tower
  const towerRoof = level >= 2 ? roof : null
  const towerAt = [[e + 1, e + 1], [N - e - 1, e + 1], [e + 1, N - e - 1], [N - e - 1, N - e - 1]] as const
  const flags: { u: number; v: number; z: number }[] = []
  towerAt.forEach(([a, b], i) => {
    const tip = roundTower(m, a, b, i === 3 ? tr - 1 : tr, i === 0 ? tt + 6 : i === 3 ? tt * 0.8 : tt, stone, towerRoof, { lit: level >= 2, seed: 21 + i })
    if (level >= 2 && i > 0) flags.push({ u: a, v: b, z: tip.z })
  })
  // Turrets halfway along the front walls at level 5.
  if (level >= 5) {
    roundTower(m, N / 2 - 22, N - e - 1, 4, w + 12, stone, roof, { lit: true, seed: 31 })
    roundTower(m, N - e - 1, N / 2, 4, w + 12, stone, roof, { lit: true, seed: 32 })
  }
  // Ivy over the old stone of the grandest palace.
  if (level >= 5) {
    const set = new Set<number>(stone)
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const c = canvas.get(x, y)
      if (!set.has(c) || hash(x >> 1, y >> 1, 83) > 0.05 + Math.max(0, (y - (base - 60)) / 400)) continue
      canvas.set(x, y, LEAVES[2 + ((x + y) % 3)])
    }
  }
  // Flags on the towers and over the keep (left out of the still look: they wave over the sky).
  if (f >= 0) {
    for (const fl of flags) flagpole(m, fl.u, fl.v, fl.z - 1, 9, roofs, (f / 4 + fl.u * 0.01) % 1, 7, 4)
    if (level < 5) flagpole(m, mid, mid, crownZ - 1, 12, CLOTH_RED, f / 4, 10, 5)
  }
  if (level === 1) {
    // A well and a cart in the yard.
    woodBox(m, 20, 66, 26, 70, 0, 0.6, OAK, false)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}
