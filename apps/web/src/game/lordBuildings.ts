import { hash } from '@game/shared'
import type { Sprite } from './sprites'
import {
  BOARDS, FRONT, GOLD, GRANITE, IRON, LIME, Model, OAK, SIDE, TOP,
  ashlar, boards, chimney, dith, door, framed, gable, hip, logs, plaster, rubble, shed, toneOf, window,
} from './buildingKit'
import type { DoorStyle, Face, Paint, RoofStyle, Top, WallLight, WindowStyle } from './buildingKit'

// The lords' buildings drawn as models (CLAUDE.md §4.2.1): walls, roofs, windows and doors from buildingKit.

export type Material = (o: WallLight, face: Face, length: number, wall: number) => Paint
export const mat = {
  plaster: (r: Uint32Array): Material => (o) => plaster(r, o),
  framed: (r: Uint32Array, timber: Uint32Array, bay = 10, braces = true): Material => (o, _face, length, wall) => framed(r, timber, o, length, wall, bay, braces),
  ashlar: (r: Uint32Array, course = 4, block = 7): Material => (o) => ashlar(r, o, course, block),
  rubble: (r: Uint32Array): Material => (o) => rubble(r, o),
  logs: (r: Uint32Array, size = 4): Material => (o) => logs(r, o, size),
  boards: (r: Uint32Array, width = 3): Material => (o) => boards(r, o, width),
}

export interface Opening {
  face: Face
  s: number
  z: number
  w: number
  h: number
  style?: WindowStyle
}
export interface Block {
  u0: number
  v0: number
  u1: number
  v1: number
  z0?: number
  wall: number
  walls: Material
  // A course of rough stone at its foot.
  socle?: { r: Uint32Array; tall: number }
  roof?: { form: 'gable-u' | 'gable-v' | 'hip' | 'flat' | 'shed-v' | 'shed-u'; rise: number; oh: number; style: RoofStyle; end?: Material }
  windows?: Opening[]
  // Windows spaced along both walls: rows at these heights, `every` apart, w×h, keeping clear of the door.
  rows?: { z: number[]; every: number; w: number; h: number; style?: WindowStyle; faces?: Face[] }
  door?: { face: Face; s: number; w: number; h: number; style?: DoorStyle }
  // Chimneys through the roof: as a share across (0…1 along u and v of the block), standing `tall` above the ridge's foot.
  chimneys?: { u: number; v: number; tall: number }[]
  chimneyStone?: Uint32Array
  seed?: number
}

// Draws a block (walls, roof, openings) and returns its chimney tops and the roof's peak.
export function block(m: Model, b: Block): { tops: Top[]; ridge: number; peak: { x: number; y: number } } {
  const z0 = b.z0 ?? 0
  const lu = b.u1 - b.u0
  const lv = b.v1 - b.v0
  const eave = b.roof && b.roof.form !== 'flat' ? z0 + b.wall : undefined
  const seed = b.seed ?? Math.round(b.u0 * 7 + b.v0 * 13)
  const fp = b.walls({ l: FRONT, eave, seed }, 'front', lu, b.wall)
  const sp = b.walls({ l: SIDE, eave, seed: seed + 1 }, 'side', lv, b.wall)
  const socle = b.socle
  const sf = socle ? rubble(socle.r, { l: FRONT, seed }) : null
  const ss = socle ? rubble(socle.r, { l: SIDE, seed }) : null
  m.front(b.u0, b.u1, b.v1, z0, z0 + b.wall, (s, z, x, y) => (sf && z - z0 < socle!.tall ? sf(s, z - z0, x, y) : fp(s, z - z0, x, y)))
  m.side(b.v0, b.v1, b.u1, z0, z0 + b.wall, (s, z, x, y) => (ss && z - z0 < socle!.tall ? ss(s, z - z0, x, y) : sp(s, z - z0, x, y)))
  m.solidBox(b.u0, b.v0, b.u1, b.v1, z0, z0 + b.wall)
  // Corner quoins on stone and plaster: a light edge where the two walls meet.
  let ridge = z0 + b.wall
  const tops: Top[] = []
  let peak = { x: m.sx(b.u1, b.v1), y: m.sy(b.u1, b.v1, z0 + b.wall) }
  if (b.roof) {
    const r = b.roof
    const z = z0 + b.wall
    const end = r.end ?? b.walls
    if (r.form === 'gable-u') {
      const ep = end({ l: SIDE, seed: seed + 2 }, 'side', lv, b.wall + r.rise)
      const g = gable(m, b.u0, b.v0, b.u1, b.v1, z, r.rise, 'u', r.oh, r.style, (s, zz, x, y) => ep(s, zz - z0, x, y))
      ridge = g.ridge
      peak = { x: m.sx(b.u1, g.mid), y: m.sy(b.u1, g.mid, g.ridge) }
    } else if (r.form === 'gable-v') {
      const ep = end({ l: FRONT, seed: seed + 2 }, 'front', lu, b.wall + r.rise)
      const g = gable(m, b.u0, b.v0, b.u1, b.v1, z, r.rise, 'v', r.oh, r.style, (s, zz, x, y) => ep(s, zz - z0, x, y))
      ridge = g.ridge
      peak = { x: m.sx(g.mid, b.v1), y: m.sy(g.mid, b.v1, g.ridge) }
    } else if (r.form === 'hip') {
      const h = hip(m, b.u0, b.v0, b.u1, b.v1, z, r.rise, r.oh, r.style)
      ridge = h.ridge
      peak = { x: m.sx(h.cu, h.cv), y: m.sy(h.cu, h.cv, h.ridge) }
    } else if (r.form === 'shed-v' || r.form === 'shed-u') {
      shed(m, b.u0, b.v0, b.u1, b.v1, z, z + r.rise, r.form === 'shed-v' ? 'v' : 'u', r.oh, r.style)
      ridge = z + r.rise
    } else {
      // A flat top (lead or paving) behind a low parapet.
      m.flat(b.u0, b.v0, b.u1, b.v1, z, (u, v, x, y) => dith(r.style.r, toneOf(r.style.r.length, TOP) - 0.6 + (hash(Math.floor(u / 3), Math.floor(v / 3), seed) - 0.5) * 0.6, x, y))
    }
    for (const c of b.chimneys ?? []) {
      const u = b.u0 + lu * c.u
      const v = b.v0 + lv * c.v
      const foot = b.roof.form === 'flat' ? z : Math.max(z, roofHeight(b, u, v)) - 2
      tops.push(chimney(m, u, v, foot, c.tall + (ridge - foot) * 0.35, b.chimneyStone))
    }
  }
  const avoid = (face: Face, s: number, w: number) => b.door && b.door.face === face && s + w > b.door.s - 2 && s < b.door.s + b.door.w + 2
  if (b.rows) {
    const { z, every, w, h, style } = b.rows
    for (const face of b.rows.faces ?? ['front', 'side'] as Face[]) {
      const len = face === 'front' ? lu : lv
      const n = Math.max(1, Math.floor((len - 4) / every))
      const start = (len - (n - 1) * every - w) / 2
      for (let i = 0; i < n; i++) {
        const s = start + i * every
        for (const zz of z) if (!(zz < 8 && avoid(face, s, w))) openWindow(m, b, face, s, z0 + zz, w, h, style)
      }
    }
  }
  for (const o of b.windows ?? []) openWindow(m, b, o.face, o.s, z0 + o.z, o.w, o.h, o.style)
  if (b.door) {
    const d = b.door
    door(m, d.face, d.face === 'front' ? b.v1 : b.u1, d.face === 'front' ? b.u0 : b.v0, d.s, d.w, d.h, { ...d.style })
  }
  return { tops, ridge, peak }
}
const openWindow = (m: Model, b: Block, face: Face, s: number, z: number, w: number, h: number, style?: WindowStyle) =>
  window(m, face, face === 'front' ? b.v1 : b.u1, face === 'front' ? b.u0 : b.v0, s, z, w, h, style)

function roofHeight(b: Block, u: number, v: number) {
  const r = b.roof!
  const z = (b.z0 ?? 0) + b.wall
  if (r.form === 'gable-u') return z + r.rise - Math.abs(v - (b.v0 + b.v1) / 2) * (r.rise / ((b.v1 - b.v0) / 2))
  if (r.form === 'gable-v') return z + r.rise - Math.abs(u - (b.u0 + b.u1) / 2) * (r.rise / ((b.u1 - b.u0) / 2))
  if (r.form === 'hip') {
    const hu = (b.u1 - b.u0) / 2
    const hv = (b.v1 - b.v0) / 2
    return z + (r.rise / Math.min(hu, hv)) * Math.min(hu - Math.abs(u - (b.u0 + b.u1) / 2), hv - Math.abs(v - (b.v0 + b.v1) / 2))
  }
  return z
}

// A box with stone paint on both faces (a plinth, a wall, a step).
export function stoneBox(m: Model, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, r: Uint32Array = LIME, solid = true, course = 3) {
  const fp = ashlar(r, { l: FRONT }, course, 6)
  const sp = ashlar(r, { l: SIDE }, course, 6)
  m.box(u0, v0, u1, v1, z0, z1, {
    front: (s, z, x, y) => fp(s, z - z0, x, y),
    side: (s, z, x, y) => sp(s, z - z0, x, y),
    top: (u, v, x, y) => dith(r, toneOf(r.length, TOP) - 0.3 + (hash(Math.floor(u / 4), Math.floor(v / 4), 3) - 0.5) * 0.6, x, y),
  }, solid)
}
// A box of planks or timber.
export function woodBox(m: Model, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, r: Uint32Array = OAK, solid = true) {
  m.box(u0, v0, u1, v1, z0, z1, {
    front: (_, __, x, y) => dith(r, toneOf(r.length, FRONT), x, y),
    side: (_, __, x, y) => dith(r, toneOf(r.length, SIDE), x, y),
    top: (_, __, x, y) => dith(r, toneOf(r.length, TOP), x, y),
  }, solid)
}
// A post from the ground up.
export const post = (m: Model, u: number, v: number, z0: number, z1: number, r: Uint32Array = OAK, size = 1.5) => woodBox(m, u - size / 2, v - size / 2, u + size / 2, v + size / 2, z0, z1, r, false)

// An open shed: posts at the corners (and along the long sides) under a roof, no walls.
export function openShed(m: Model, u0: number, v0: number, u1: number, v1: number, tall: number, roof: NonNullable<Block['roof']>, wood: Uint32Array = OAK) {
  const every = 10
  for (const [a, b] of [[u0, v1], [u1, v1], [u1, v0]] as const) post(m, a, b, 0, tall, wood)
  for (let a = u0 + every; a < u1 - 3; a += every) post(m, a, v1, 0, tall, wood)
  for (let b = v0 + every; b < v1 - 3; b += every) post(m, u1, b, 0, tall, wood)
  // Beams along the top.
  woodBox(m, u0, v1 - 0.8, u1, v1 + 0.8, tall - 1.2, tall, wood, false)
  woodBox(m, u1 - 0.8, v0, u1 + 0.8, v1, tall - 1.2, tall, wood, false)
  m.solidBox(u0, v0, u1, v1, tall - 1, tall)
  const z = tall
  if (roof.form === 'gable-u') gable(m, u0, v0, u1, v1, z, roof.rise, 'u', roof.oh, roof.style)
  else if (roof.form === 'gable-v') gable(m, u0, v0, u1, v1, z, roof.rise, 'v', roof.oh, roof.style)
  else if (roof.form === 'hip') hip(m, u0, v0, u1, v1, z, roof.rise, roof.oh, roof.style)
  else shed(m, u0, v0, u1, v1, z, z + roof.rise, roof.form === 'shed-u' ? 'u' : 'v', roof.oh, roof.style)
}

export { BOARDS, GOLD, GRANITE, IRON }
export type { Sprite }
