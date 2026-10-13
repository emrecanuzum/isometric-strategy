import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt, mulberry32 } from '@game/shared'
import type { BuildingKind, KingdomColorId, Point, World } from '@game/shared'
import { BARK, Canvas, CLOTH, GLASS, ROOF, SACK, STONE, TIMBER, WALL, pick, ramp, rgb, shadeBlobs, shadow } from './sprites'
import type { Sprite } from './sprites'

// Buildings of the player's town, made the same way as the inn: every sprite stands on the front corner of its
// footprint (the anchor), its walls run back along the two front edges and a hip roof covers the top.

const THATCH = ramp(0x4a3518, 0x6b4f22, 0x8f6c2e, 0xb08a3c, 0xcda852, 0xe2c26c)
const SLATE = ramp(0x1c2230, 0x283246, 0x37445c, 0x4a5a74, 0x60728c, 0x7a8ca4)
const ROYAL = ramp(0x14204a, 0x1c2e66, 0x284285, 0x3758a4, 0x4a72bf, 0x6a92d6)

// A roof ramp from one base colour: darker steps below it and two lighter ones above, like the hand-made ramps.
function tones(name: string, base: number) {
  const channel = (shift: number) => (base >> shift) & 0xff
  const at = (f: number) => {
    const mix = (c: number) => Math.round(f <= 1 ? c * f : c + (255 - c) * (f - 1))
    return (mix(channel(16)) << 16) | (mix(channel(8)) << 8) | mix(channel(0))
  }
  return { name, roofs: ramp(at(0.3), at(0.45), at(0.62), at(0.8), at(1), at(1.25)), swatch: `#${base.toString(16).padStart(6, '0')}` }
}

// The kingdom's colour, chosen at founding: the palace's roofs are tiled in it. `swatch` is for the interface.
export const KINGDOM_COLORS = {
  royal: { name: 'Lacivert', roofs: ROYAL, swatch: '#3758a4' },
  crimson: { name: 'Kızıl', roofs: ramp(0x3a0c12, 0x5a1420, 0x7e1e2a, 0xa42c34, 0xc8463e, 0xe0684e), swatch: '#a42c34' },
  emerald: { name: 'Zümrüt', roofs: ramp(0x0c2a1e, 0x123e2a, 0x1c5a38, 0x2a7a48, 0x3e9a58, 0x62b86c), swatch: '#2a7a48' },
  violet: { name: 'Mor', roofs: ramp(0x2a1240, 0x3c1c5a, 0x542a7a, 0x6e3c9a, 0x8a56b8, 0xa878d0), swatch: '#6e3c9a' },
  amber: { name: 'Kehribar', roofs: ramp(0x4a2408, 0x6e3a0c, 0x965214, 0xbc7020, 0xd89032, 0xecb04e), swatch: '#bc7020' },
  teal: { name: 'Turkuaz', roofs: ramp(0x0a2e36, 0x10444e, 0x186068, 0x22808a, 0x34a0a8, 0x5cc0c4), swatch: '#22808a' },
  coal: { name: 'Kömür', roofs: ramp(0x1a1a20, 0x26262e, 0x34343e, 0x464652, 0x5c5c6a, 0x7a7a88), swatch: '#464652' },
  gold: tones('Altın', 0xd4ac2a),
  rose: tones('Gül', 0xd0688a),
  sky: tones('Gök', 0x4a9ed6),
  olive: tones('Zeytin', 0x7c7a2c),
  rust: tones('Pas', 0x9a4622),
  plum: tones('Erik', 0x7a2a5c),
  lime: tones('Fıstık', 0x8cc23a),
  ivory: tones('Fildişi', 0xd8ceac),
  cocoa: tones('Kahve', 0x6a4830),
  orange: tones('Turuncu', 0xf0862a),
  pine: tones('Çam', 0x1e4c3c),
} satisfies Record<KingdomColorId, { name: string; roofs: Uint32Array; swatch: string }>
export type KingdomColor = KingdomColorId
const KEEP = ramp(0x6a6672, 0x868290, 0xa8a4ac, 0xc8c4c4, 0xdedad2)
const DARK_STONE = ramp(0x34323c, 0x46444e, 0x5a5862, 0x6e6c74, 0x84828a)
const LOGS = ramp(0x3a2616, 0x5a3c22, 0x7a5432, 0x9a7044)
const CUT = ramp(0x8a6a40, 0xc8a46a, 0xe2c48a)
const SOIL = ramp(0x3a2818, 0x4e3620, 0x64472a, 0x7a5834)
const WHEAT = ramp(0x6a5a1c, 0x9a8228, 0xc4a63a, 0xe2c858)
const GREENS = ramp(0x23502a, 0x356e34, 0x4f8c40, 0x76ac52)
const STRIPE = ramp(0xa8423a, 0xe9dcc0)
const EMBER = ramp(0x8a2a10, 0xe0641c, 0xffb040)
const PLANK = ramp(0x3a2818, 0x5a3e24, 0x7a5834, 0x9a7444, 0xb08a54)
const WATER_FOAM = rgb(0xd8eef4)
const BRASS = ramp(0x7a5a18, 0xb08a2a, 0xe2c058, 0xfff0a0)
const CRIMSON = ramp(0x4a0e14, 0x7a1822, 0xa82430, 0xcc3a40)
const FRUIT = [rgb(0xd84a3a), rgb(0xe8a030), rgb(0x8fbf55), rgb(0x9a5ab0)]
const FLAG = ramp(0x7a1c1c, 0xb02a24, 0xd84a3a)
const BLADE = ramp(0x4a505a, 0xa8b0bc, 0xe6ebf0)

interface HallStyle {
  // Half the footprint's width on screen; its height is half of that.
  w: number
  wall: number
  roof: number
  walls: Uint32Array
  roofs: Uint32Array
  // Stone courses instead of a timber frame.
  masonry?: boolean
  // Spacing of window bays along each wall; 0 for none.
  bay?: number
  glow?: boolean
  door?: boolean
  // Where a chimney rises out of the right roof face, as a fraction of the way from the apex to the corner.
  chimney?: number
  // Open on the front (a market stall): only corner posts and a counter, the roof is striped cloth.
  open?: boolean
  // Colour of the hips and the eave edge (gilded on the palace).
  trim?: number
}

// Draws a hall standing on the screen point (cx, base), its front corner.
function hall(canvas: Canvas, cx: number, base: number, s: HallStyle) {
  const { w, wall, roof } = s
  const h = w / 2
  const eave = Math.max(2, Math.round(w / 16))
  for (const side of [-1, 1]) {
    const lit = side < 0
    for (let t = 0; t <= w; t++) {
      const x = cx + side * (w - t)
      const ground = base - h + t / 2
      for (let z = 0; z <= wall; z++) {
        let color: number
        if (s.open) {
          const post = t <= 1 || t >= w - 1
          if (post) color = TIMBER[lit ? 2 : 1]
          else if (z <= 5) color = z === 5 ? TIMBER[2] : pick(TIMBER, lit ? 2 : 1)
          else if (z === 6 && hash(t >> 1, side, 3) > 0.45) color = pick(lit ? CLOTH[3] : CLOTH[2], 2 + hash(t, 1, 5) * 2)
          // Shade under the awning.
          else color = TIMBER[0]
        } else if (s.masonry) {
          const course = Math.floor(z / 4)
          const mortar = z % 4 === 0 || (t + (course & 1) * 3) % 7 === 0
          color = s.walls[(lit ? 3 : 1) - (mortar ? 1 : 0) + (hash(t >> 2, course, 11 + side) > 0.8 ? 1 : 0)]
          if (z < 3) color = s.walls[lit ? 1 : 0]
        } else {
          color = s.walls[lit ? 3 : 1]
          if (hash(t >> 2, z >> 2, 7 + side) > 0.8) color = s.walls[lit ? 4 : 2]
          if (z < 3) color = lit ? STONE[3] : STONE[1]
          if (t % 21 === 0 || z === wall || t === w) color = TIMBER[lit ? 2 : 1]
        }
        if (!s.open && s.bay) {
          const bay = (t + (s.bay >> 1)) % s.bay
          const lo = Math.round(wall * 0.45)
          const hi = wall - 3
          if (z >= lo && z <= hi && bay >= 3 && bay <= 6 && t > 4 && t < w - 4) {
            const glass = s.glow ? EMBER[lit ? 2 : 1] : GLASS[lit ? 2 : 1]
            color = z === lo || z === hi || bay === 3 || bay === 6 ? TIMBER[0] : glass
          }
        }
        if (s.door && lit) {
          const from = Math.round(w * 0.62)
          const to = from + Math.max(5, Math.round(w * 0.2))
          if (t >= from && t <= to && z < Math.min(wall - 2, 13)) color = t === from || t === to ? TIMBER[0] : TIMBER[1]
        }
        canvas.set(x, ground - z, color)
      }
    }
  }
  // Hip roof: a pyramid over the footprint, its two front faces bounded below by the eaves and above by the hips.
  const apexY = base - h - wall - roof
  const cornerY = base - wall + eave - (w + eave) / 2
  const ridgeAt = (dx: number) => apexY + dx * ((cornerY - apexY) / (w + eave))
  for (let y = apexY; y <= base - wall + eave; y++) {
    for (let x = cx - w - eave; x <= cx + w + eave; x++) {
      const side = x < cx ? -1 : 1
      const dx = Math.abs(x - cx)
      const eaveY = base - wall + eave - dx / 2
      const ridgeY = ridgeAt(dx) - 0.01
      if (y > eaveY || y < ridgeY) continue
      const f = (y - ridgeY) / (eaveY - ridgeY + 0.01)
      const course = Math.floor((y + dx / 2) / 4)
      let tone: number
      if (s.open) {
        // Cloth canopy in stripes running down from the apex.
        const stripe = Math.floor(dx / 6) & 1
        canvas.set(x, y, f > 0.9 ? TIMBER[1] : stripe ? STRIPE[side < 0 ? 1 : 0] : side < 0 ? STRIPE[0] : rgb(0x7a2a26))
        continue
      }
      const shingle = Math.floor(y + dx / 2) % 4 === 0 || (x + course * 3) % 7 === 0
      tone = (side < 0 ? 4 : 2) - (shingle ? 1 : 0) + (hash(x >> 1, course, 9) > 0.75 ? 0.6 : 0)
      if (f > 0.93) tone = side < 0 ? 1 : 0
      canvas.set(x, y, s.trim !== undefined && (f > 0.95 || y - ridgeY < 1.2) ? s.trim : pick(s.roofs, tone))
    }
  }
  for (let y = apexY; y <= base - wall + eave; y++) canvas.set(cx, y, s.open ? STRIPE[1] : (s.trim ?? s.roofs[5]))
  if (s.chimney !== undefined) {
    const dx = Math.round((w + eave) * s.chimney)
    const foot = Math.round(ridgeAt(dx)) + Math.round(roof * 0.25)
    const tall = Math.round(roof * 0.5) + 4
    const width = Math.max(4, Math.round(w / 10))
    for (let z = 0; z < tall; z++) {
      for (let x = 0; x < width; x++) {
        canvas.set(cx + dx + x, foot - z, z > tall - 3 ? STONE[1] : x < width / 2 ? STONE[4] : STONE[2])
      }
    }
    return { x: cx + dx + width / 2, y: foot - tall, chimney: true }
  }
  return { x: cx, y: apexY, chimney: false }
}

// A round tower standing on (cx, base) with battlements and a pointed roof.
function tower(canvas: Canvas, cx: number, base: number, r: number, tall: number, walls: Uint32Array, roofs: Uint32Array, lit = false) {
  for (let x = -r; x <= r; x++) {
    const f = x / r
    const curve = Math.sqrt(1 - f * f) * r * 0.5
    const tone = 3.4 - (f + 1) * 1.5
    for (let z = -curve; z <= tall; z++) {
      const course = Math.floor(z / 4)
      const mortar = Math.round(z) % 4 === 0 || (x + (course & 1) * 2) % 5 === 0
      canvas.set(cx + x, base - z, pick(walls, tone - (mortar ? 0.8 : 0)))
    }
    // Battlements.
    if ((x + r) % 4 < 2) for (let z = tall; z < tall + 3; z++) canvas.set(cx + x, base - z - curve, pick(walls, tone + 0.5))
    // Arrow slits, or a lit window on palace towers.
    if (x === -1 || (lit && x === 0)) {
      for (let z = tall * 0.45; z < tall * 0.7; z++) canvas.set(cx + x, base - z, lit ? GLASS[x === 0 ? 2 : 1] : TIMBER[0])
    }
    if (lit && (x === -2 || x === 1)) for (let z = tall * 0.45; z < tall * 0.7; z++) canvas.set(cx + x, base - z, TIMBER[0])
  }
  const cone = Math.round(r * 2.2)
  const top = base - tall - 2 - cone
  for (let y = 0; y <= cone; y++) {
    const half = (y / cone) * (r + 1)
    for (let x = Math.ceil(-half); x <= half; x++) {
      const f = x / (half + 0.01)
      canvas.set(cx + x, top + y, pick(roofs, 4 - (f + 1) * 1.8 + (y % 4 === 0 ? -0.6 : 0)))
    }
  }
  return { x: cx, y: top }
}

// Canvas for a footprint of `tiles`, with room above for walls, roof and whatever rises out of it.
function footprint(tiles: number, above: number) {
  const w = (tiles * TILE_WIDTH) / 2
  const h = (tiles * TILE_HEIGHT) / 2
  const canvas = new Canvas(w * 2 + 8, h * 2 + above + 4)
  return { canvas, cx: canvas.width >> 1, base: canvas.height - 2, w, h }
}

// Smoke rises from these points of a sprite (relative to its anchor); the map animates it.
export const CHIMNEYS = new Map<Sprite, Point[]>()
function smoky(sprite: Sprite, tops: { x: number; y: number; chimney: boolean }[]) {
  const points = tops.filter((t) => t.chimney).map((t) => ({ x: t.x - sprite.anchorX, y: t.y - sprite.anchorY - 1 }))
  if (points.length > 0) CHIMNEYS.set(sprite, points)
  return sprite
}

// A gilded spike on a roof point.
function finial(canvas: Canvas, x: number, y: number, tall: number) {
  for (let z = 0; z < tall; z++) canvas.set(x, y - z, BRASS[z < tall - 2 ? 1 : 3])
  canvas.set(x - 1, y - 2, BRASS[2])
  canvas.set(x + 1, y - 2, BRASS[0])
}

// A long pennant hanging from a pole, in the kingdom's crimson with a gold edge.
function banner(canvas: Canvas, x: number, y: number, length: number) {
  for (let z = 0; z < length + 6; z++) canvas.set(x, y - z, TIMBER[1])
  for (let fy = 0; fy < 5; fy++) {
    for (let fx = 1; fx <= length; fx++) {
      const wave = Math.round(Math.sin(fx * 0.55) * 1.2)
      const taper = fx > length - 4 && (fy === 0 || fy === 4)
      if (taper) continue
      canvas.set(x + fx, y - length - 4 + fy + wave + Math.floor(fx / 6), fy === 0 ? BRASS[2] : FLAG[fy === 4 ? 0 : fy === 1 ? 2 : 1])
    }
  }
}

// A cloth hanging down a wall at distance `t` along it, from height `top`.
function drape(canvas: Canvas, cx: number, base: number, w: number, side: number, t: number, top: number, length: number) {
  const h = w / 2
  for (let dt = 0; dt < 7; dt++) {
    const x = cx + side * (w - t - dt)
    const ground = base - h + (t + dt) / 2
    for (let z = top - length; z <= top; z++) {
      const point = z < top - length + 4 && Math.abs(dt - 3) > top - length + 4 - z - 1
      if (point) continue
      const edge = dt === 0 || dt === 6
      const emblem = Math.abs(dt - 3) <= 1 && z > top - length * 0.6 && z < top - length * 0.35
      canvas.set(x, ground - z, emblem ? BRASS[2] : edge ? BRASS[1] : CRIMSON[side < 0 ? 2 : 1])
    }
  }
}

// A crenellated wall running from (x0, y0) to (x1, y1) on the ground; `lit` for walls facing the light.
function rampart(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, tall: number, walls: Uint32Array, lit: boolean) {
  const n = Math.abs(x1 - x0)
  for (let i = 0; i <= n; i++) {
    const x = x0 + Math.sign(x1 - x0) * i
    const ground = y0 + ((y1 - y0) * i) / n
    for (let z = 0; z <= tall + 3; z++) {
      if (z > tall && i % 6 >= 3) continue
      const course = Math.floor(z / 3)
      const mortar = z % 3 === 0 || (i + (course & 1) * 2) % 5 === 0
      canvas.set(x, ground - z, walls[(lit ? 3 : 1) - (mortar ? 1 : 0) + (z > tall ? 1 : 0)])
    }
  }
}

// The palace: a two-tier keep with gilded hips rising behind a crenellated curtain wall, four round towers with
// lit windows and banners, and a gatehouse on the front corner.
function palace(roofs: Uint32Array = ROYAL): Sprite {
  const { canvas, cx, base, w, h } = footprint(3, 210)
  // Paved courtyard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / (w - 6)
      const b = (y - (base - h)) / (h - 3)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(KEEP, 1.2 + ((x >> 2) + (y >> 1)) % 2 * 0.8 + (hash(x, y, 61) - 0.5)))
    }
  }
  const ring = w - 10
  const corner = (dx: number, dy: number) => ({ x: cx + dx * ring, y: base - h + dy * (ring / 2) })
  const back = corner(0, -1)
  const left = corner(-1, 0)
  const right = corner(1, 0)
  const tops: { x: number; y: number }[] = []
  tops.push(tower(canvas, back.x, back.y, 10, 74, KEEP, roofs, true))
  // Main hall and the upper keep standing on it.
  const keepBase = base - 20
  hall(canvas, cx, keepBase, { w: 58, wall: 46, roof: 24, walls: KEEP, roofs, masonry: true, bay: 12, trim: BRASS[2] })
  for (const side of [-1, 1]) for (const t of [12, 40]) drape(canvas, cx, keepBase, 58, side, t, 42, 22)
  const upperBase = keepBase - 29 - 40
  const crown = hall(canvas, cx, upperBase, { w: 30, wall: 30, roof: 40, walls: KEEP, roofs, masonry: true, bay: 10, trim: BRASS[2] })
  finial(canvas, crown.x, crown.y, 6)
  banner(canvas, crown.x, crown.y - 6, 14)
  // Side towers, then the curtain wall along the two front edges, then the gatehouse.
  tops.push(tower(canvas, left.x, left.y, 11, 62, KEEP, roofs, true))
  tops.push(tower(canvas, right.x, right.y, 11, 62, KEEP, roofs, true))
  const gate = { x: cx, y: base - 6 }
  rampart(canvas, left.x + 10, left.y + 5, gate.x - 14, gate.y - 7, 14, KEEP, true)
  rampart(canvas, right.x - 10, right.y + 5, gate.x + 14, gate.y - 7, 14, KEEP, false)
  // Gatehouse: a block with an arch and a gilded portcullis between two towers.
  for (let x = -12; x <= 12; x++) {
    const ground = gate.y - 6 + Math.abs(x) * 0.15
    for (let z = 0; z <= 26; z++) {
      const arch = Math.abs(x) <= 5 && z < 14 + Math.sqrt(Math.max(0, 25 - x * x)) * 0.8
      let color = pick(KEEP, (x < 0 ? 3 : 1.6) - ((z % 3 === 0 || (x + (Math.floor(z / 3) & 1) * 2) % 5 === 0) ? 0.8 : 0))
      if (arch) color = Math.abs(x) % 3 === 0 && z > 2 ? BRASS[1] : z % 4 === 0 && z > 2 ? BRASS[0] : TIMBER[0]
      if (z > 26 - 3 && (x + 12) % 5 >= 3) continue
      canvas.set(cx + x, ground - z, color)
    }
  }
  for (const side of [-1, 1]) tops.push(tower(canvas, gate.x + side * 15, gate.y, 7, 38, KEEP, roofs))
  // Crest over the gate.
  for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(y) <= 3) canvas.set(cx + x, gate.y - 26 + y, Math.abs(x) + Math.abs(y) === 3 ? BRASS[0] : y < 0 ? BRASS[3] : BRASS[2])
  for (const [i, top] of tops.entries()) {
    finial(canvas, top.x, top.y, 4)
    // Banners on the side towers; the one behind would tangle with the keep's own.
    if (i === 1 || i === 2) banner(canvas, top.x, top.y - 4, 9)
  }
  return canvas.sprite(cx, base, 0)
}

const HOUSE_ROOFS = [ROOF, THATCH, SLATE]

// Level 1 is a cottage, level 2 a two-storey house, level 3 a stone manor with a slate roof.
function house(variant: number, level = 1): Sprite {
  const { canvas, cx, base } = footprint(1, 50 + (level - 1) * 14)
  const random = mulberry32(variant + 5)
  const w = 24 + Math.floor(random() * 4) + (level - 1) * 2
  const chimney = random() < 0.6 || level > 1 ? 0.45 : undefined
  const roof = 18 + Math.floor(random() * 5)
  const top =
    level === 1
      ? hall(canvas, cx, base - 3, { w, wall: 15, roof, walls: WALL, roofs: HOUSE_ROOFS[variant % 3], bay: 14, door: true, chimney })
      : level === 2
        ? hall(canvas, cx, base - 3, { w, wall: 26, roof: roof + 2, walls: WALL, roofs: HOUSE_ROOFS[variant % 3], bay: 10, door: true, chimney })
        : hall(canvas, cx, base - 3, { w, wall: 30, roof: roof + 4, walls: KEEP, roofs: SLATE, masonry: true, bay: 10, door: true, chimney, trim: BRASS[1] })
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// Ploughed ground in rows, with a low fence along the two front edges.
function farm(variant: number, level = 1): Sprite {
  const { canvas, cx, base, w, h } = footprint(2, level === 3 ? 44 : level === 2 ? 22 : 12)
  const crop = variant % 2 === 0 ? WHEAT : GREENS
  const top = base - h * 2
  const rows = 8
  const inset = 3
  for (let y = top; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / (w - inset)
      const b = (y - (base - h)) / (h - inset / 2)
      if (Math.abs(a) + Math.abs(b) > 1) continue
      // Rows run along one tile axis.
      const phase = (((b - a) / 2 + 1) * rows) % 1
      const furrow = phase > 0.55
      canvas.set(x, y, pick(SOIL, (furrow ? 0.6 : 2) + (hash(x, y, 31) - 0.5) * 1.2))
    }
  }
  // Plants on the ridges, drawn back to front so nearer ones overlap.
  for (let y = top; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / (w - inset - 2)
      const b = (y - (base - h)) / (h - inset / 2 - 1)
      if (Math.abs(a) + Math.abs(b) > 1) continue
      const phase = (((b - a) / 2 + 1) * rows) % 1
      if (phase < 0.15 || phase > 0.4 || (x & 1) === 1 || hash(x, y, 37 + variant) < 0.35) continue
      const tall = crop === WHEAT ? 3 + Math.floor(hash(x, y, 41) * 2) : 2
      for (let z = 0; z < tall; z++) canvas.set(x, y - z, crop[Math.min(3, z + (x < cx ? 1 : 0))])
    }
  }
  // Fence posts and a rail.
  for (const side of [-1, 1]) {
    for (let t = 0; t <= w; t++) {
      const x = cx + side * (w - t)
      const ground = base - h + t / 2
      if (t % 8 === 0) for (let z = 0; z < 5; z++) canvas.set(x, ground - z, TIMBER[side < 0 ? 2 : 1])
      canvas.set(x, ground - 3, TIMBER[side < 0 ? 2 : 1])
    }
  }
  // Haystacks and a scarecrow from level 2, and a small granary in the back corner at level 3.
  if (level >= 2) {
    for (const [dx, dy] of [[-30, -6], [-20, -11]]) haystack(canvas, cx + dx, base - h + dy)
    scarecrow(canvas, cx + 14, base - h + 6)
  }
  if (level === 3) hall(canvas, cx + 28, base - h - 6, { w: 16, wall: 10, roof: 12, walls: ramp(0x3a2616, 0x4e3420, 0x6a4a2c, 0x8a6440, 0xa07a50), roofs: THATCH, door: true })
  return canvas.sprite(cx, base, 0)
}

function haystack(canvas: Canvas, x: number, base: number) {
  shadeBlobs(canvas, [{ x, y: base - 4, r: 6 }, { x: x + 2, y: base - 7, r: 4 }], WHEAT, 71, 0.8)
}

function scarecrow(canvas: Canvas, x: number, base: number) {
  for (let z = 0; z < 14; z++) canvas.set(x, base - z, TIMBER[1])
  for (let dx = -4; dx <= 4; dx++) canvas.set(x + dx, base - 10, TIMBER[2])
  for (let z = 4; z < 10; z++) for (let dx = -2; dx <= 2; dx++) canvas.set(x + dx, base - z, CLOTH[0][dx < 0 ? 2 : 1])
  for (let dx = -2; dx <= 2; dx++) canvas.set(x + dx, base - 14, WHEAT[3])
  canvas.set(x, base - 12, SACK[3])
  canvas.set(x, base - 13, SACK[2])
}

// A log lying along the screen's down-right diagonal, its cut end facing the viewer.
function log(canvas: Canvas, x: number, y: number, length: number) {
  for (let t = 0; t <= length; t++) {
    for (let d = -2; d <= 2; d++) canvas.set(x + t, y + t / 2 + d, LOGS[d < -1 ? 3 : d < 1 ? 2 : d < 2 ? 1 : 0])
  }
  const ex = x + length
  const ey = y + length / 2
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -1; dx <= 1; dx++) canvas.set(ex + dx, ey + dy, dx === 0 && dy === 0 ? CUT[0] : Math.abs(dy) === 2 ? BARK[1] : CUT[dx < 0 ? 2 : 1])
  }
}

// Level 2 adds a second log pile, level 3 turns the hut into a sawmill hall with a slate roof.
function lumberCamp(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 50 + (level - 1) * 10)
  const logWalls = ramp(0x3a2616, 0x4e3420, 0x6a4a2c, 0x8a6440, 0xa07a50)
  const hut =
    level < 3
      ? hall(canvas, cx + 6, base - h - 2, { w: 30 + (level - 1) * 4, wall: 14, roof: 16, walls: logWalls, roofs: THATCH, bay: 0, door: true, chimney: 0.35 })
      : hall(canvas, cx + 6, base - h - 2, { w: 40, wall: 20, roof: 22, walls: logWalls, roofs: SLATE, bay: 14, door: true, chimney: 0.35 })
  // Log piles, bottom row first.
  const piles = level === 1 ? [[cx - 44, base - h - 6]] : [[cx - 44, base - h - 6], [cx - 30, base - h + 6]]
  for (const [px, py] of piles) {
    for (const [row, count] of [[0, 3], [1, 2], [2, 1]] as const) {
      for (let i = 0; i < count; i++) log(canvas, px + i * 5 + row * 2.5, py + i * 2.5 - row * 4 + row * 1.25, 18)
    }
  }
  // A chopping stump with an axe in it.
  const sx = cx + 16
  const sy = base - 10
  for (let x = -3; x <= 3; x++) for (let z = 0; z < 4; z++) canvas.set(sx + x, sy - z, z === 3 ? CUT[1] : BARK[x < 0 ? 2 : 1])
  for (let z = 0; z < 7; z++) canvas.set(sx + 1 + z * 0.4, sy - 4 - z, TIMBER[2])
  for (let d = 0; d < 3; d++) canvas.set(sx + 3 + d * 0.3, sy - 11 + d, STONE[4])
  return smoky(canvas.sprite(cx, base, 0), [hut])
}

// Level 2 adds a weapon rack and a quenching barrel, level 3 a taller hall with a gilded trim.
function forge(level = 1): Sprite {
  const { canvas, cx, base } = footprint(2, 80 + (level - 1) * 12)
  const tall = (level - 1) * 5
  const smoke = hall(canvas, cx, base - 4, { w: 56, wall: 24 + tall, roof: 26 + tall, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 18, glow: true, door: true, chimney: 0.4, trim: level === 3 ? BRASS[1] : undefined })
  if (level >= 2) {
    rack(canvas, cx + 26, base - 6)
    barrel(canvas, cx - 36, base - 12)
  }
  // An anvil by the door.
  const ax = cx - 22
  const ay = base - 6
  for (let x = -2; x <= 2; x++) for (let z = 0; z < 3; z++) canvas.set(ax + x, ay - z, STONE[1])
  for (let x = -4; x <= 3; x++) canvas.set(ax + x, ay - 3, STONE[3])
  for (let x = -3; x <= 3; x++) canvas.set(ax + x, ay - 4, STONE[4])
  return smoky(canvas.sprite(cx, base, 0), [smoke])
}

// Swords and a shield leaning on a wooden rack, standing on (x, base).
function rack(canvas: Canvas, x: number, base: number) {
  for (let dx = 0; dx <= 12; dx++) canvas.set(x + dx, base - 9 - dx / 2, TIMBER[1])
  for (const dx of [2, 5, 8]) {
    for (let z = 0; z < 11; z++) canvas.set(x + dx, base - dx / 2 - z, z < 3 ? TIMBER[0] : BLADE[z > 8 ? 2 : 1])
    canvas.set(x + dx - 1, base - dx / 2 - 3, BRASS[2])
    canvas.set(x + dx + 1, base - dx / 2 - 3, BRASS[2])
  }
  for (let y = -3; y <= 3; y++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + y * y <= 9) canvas.set(x + 13 + dx, base - 8 + y, Math.abs(dx) + Math.abs(y) <= 1 ? BRASS[3] : CRIMSON[dx < 0 ? 3 : 2])
}

// A barrel standing on (x, base).
function barrel(canvas: Canvas, x: number, base: number) {
  for (let dx = -3; dx <= 3; dx++) {
    const bulge = Math.abs(dx) < 3 ? 0 : 1
    for (let z = bulge; z < 9 - bulge; z++) {
      const hoop = z === 2 || z === 6
      canvas.set(x + dx, base - z, hoop ? STONE[dx < 0 ? 3 : 1] : PLANK[dx < -1 ? 4 : dx < 2 ? 3 : 1])
    }
  }
  for (let dx = -2; dx <= 2; dx++) canvas.set(x + dx, base - 9, PLANK[2])
}

function crate(canvas: Canvas, x: number, base: number, size: number) {
  for (let dx = 0; dx < size; dx++) {
    for (let z = 0; z < size - 2; z++) {
      const rim = dx === 0 || dx === size - 1 || z === 0 || z === size - 3 || dx === z
      canvas.set(x + dx, base - z, rim ? PLANK[1] : PLANK[3])
    }
    canvas.set(x + dx, base - size + 2, PLANK[4])
  }
}

// The trade house: a timber hall with a striped awning over a stall full of goods, barrels and crates out front,
// a gilded sign and a pennant on the roof.
const CHAR = ramp(0x120c0a, 0x1e1410, 0x2c1e16, 0x3a2a1e)

// `ruined`: wrecked by raiders (until repaired): scorched walls, a hole burnt in the roof with smoke rising from it,
// the awning in tatters, the goods gone and the crates broken.
function tradePost(ruined = false): Sprite {
  const { canvas, cx, base } = footprint(2, 90)
  const hb = base - 14
  const hw = 44
  const top = hall(canvas, cx, hb, { w: hw, wall: 26, roof: 26, walls: WALL, roofs: ROOF, bay: 13, door: true, chimney: ruined ? undefined : 0.42 })
  if (ruined) return ruins(canvas, cx, base, hb, hw, top)
  banner(canvas, top.x, top.y, 10)
  // Awning along the left wall, sloping out and down, with a scalloped edge.
  const awning = { from: 6, to: hw - 4, z: 20, out: 13 }
  for (let t = awning.from; t <= awning.to; t += 0.5) {
    for (let d = 0; d <= awning.out; d += 0.5) {
      const wx = cx - (hw - t)
      const wy = hb - hw / 2 + t / 2
      const x = wx - d * 0.9
      const y = wy - awning.z + d * 0.45 + d * 0.4
      const scallop = d > awning.out - 2 && Math.floor(t / 3) % 2 === 0
      if (d > awning.out - 1 && !scallop) continue
      canvas.set(x, y, Math.floor(t / 5) % 2 === 0 ? STRIPE[1] : STRIPE[0])
    }
  }
  // Stall counter under the awning, heaped with goods.
  for (let t = awning.from + 2; t <= awning.to - 2; t++) {
    const x = cx - (hw - t) - 6
    const y = hb - hw / 2 + t / 2 + 3
    for (let z = 0; z < 7; z++) canvas.set(x, y - z, z === 6 ? PLANK[4] : PLANK[z < 2 ? 1 : 2])
    if (hash(t, 1, 71) > 0.35) canvas.set(x, y - 7, FRUIT[Math.floor(hash(t, 2, 71) * FRUIT.length)])
    if (hash(t, 3, 71) > 0.6) canvas.set(x, y - 8, FRUIT[Math.floor(hash(t, 4, 71) * FRUIT.length)])
  }
  // Barrels, crates and sacks by the front corner.
  barrel(canvas, cx + 12, base - 6)
  barrel(canvas, cx + 20, base - 10)
  crate(canvas, cx + 26, base - 12, 9)
  crate(canvas, cx + 28, base - 20, 7)
  shadeBlobs(canvas, [{ x: cx - 8, y: base - 6, r: 4 }, { x: cx - 2, y: base - 5, r: 3.5 }, { x: cx - 5, y: base - 10, r: 3 }], SACK, 3)
  // A hanging sign with a gold coin.
  const px = cx - 40
  const py = base - 14
  for (let z = 0; z < 26; z++) canvas.set(px, py - z, TIMBER[1])
  for (let x = 0; x < 9; x++) canvas.set(px + x, py - 25, TIMBER[1])
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) canvas.set(px + 1 + x, py - 22 + y, y === 0 || y === 7 || x === 0 || x === 8 ? TIMBER[0] : PLANK[3])
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) canvas.set(px + 5 + x, py - 18 + y, x + y < 0 ? BRASS[3] : BRASS[2])
  return smoky(canvas.sprite(cx, base, 0), [top])
}

function ruins(canvas: Canvas, cx: number, base: number, hb: number, hw: number, top: { x: number; y: number }): Sprite {
  // Soot over the walls and roof: dithered patches on what is already drawn, thickest at their middle.
  for (const [bx, by, r] of [[cx - 24, hb - 18, 12], [cx + 20, hb - 22, 11], [cx - 6, hb - 40, 13], [cx + 6, hb - 6, 9]]) {
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        const d = Math.hypot(x - bx, (y - by) * 1.4) / r
        if (d > 1 || canvas.get(x, y) >>> 24 === 0) continue
        if (hash(x, y, 97) > 0.25 + d * 0.65) canvas.set(x, y, CHAR[(x + y) & 1 ? 2 : 3])
      }
    }
  }
  // A hole burnt through the roof, glowing at its edge.
  const hx = top.x + 6
  const hy = top.y + 18
  for (let y = -6; y <= 6; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = (x * x) / 81 + (y * y) / 36
      if (d <= 1) canvas.set(hx + x, hy + y, d > 0.7 ? EMBER[hash(x, y, 91) > 0.5 ? 1 : 0] : CHAR[0])
    }
  }
  // Charred rafters across the hole.
  for (let x = -8; x <= 8; x++) canvas.set(hx + x, hy - 1 + Math.round(x * 0.4), TIMBER[0])
  // Tatters of the awning hanging from the left wall.
  for (let t = 8; t <= hw - 6; t += 7) {
    const wx = cx - (hw - t)
    const wy = hb - hw / 2 + t / 2 - 20
    for (let d = 0; d < 4 + (t % 3) * 3; d++) canvas.set(wx - 1, wy + d, d % 2 ? STRIPE[0] : STRIPE[1])
  }
  // Broken crates and planks strewn by the front corner.
  for (const [dx, dy, len] of [[10, -6, 10], [18, -10, 8], [-6, -4, 9], [24, -14, 7]]) {
    for (let i = 0; i < len; i++) canvas.set(cx + dx + i, base + dy + Math.round(i * 0.4), PLANK[i % 3 === 0 ? 0 : 2])
  }
  // Embers among the rubble.
  for (let i = 0; i < 6; i++) canvas.set(cx - 10 + i * 6, base - 6 - (i % 2) * 3, EMBER[2])
  const sprite = canvas.sprite(cx, base, 0)
  // Smoke rises from the hole.
  return smoky(sprite, [{ x: hx, y: hy - 2, chimney: true }])
}

// A fishing shed on the shore: timber walls, a thatched roof, a rack of drying fish and a coil of net.
// Level 2 adds barrels, level 3 a larger shed with a slate roof.
function dock(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 60 + (level - 1) * 8)
  const shedWalls = ramp(0x3a2616, 0x4e3420, 0x6a4a2c, 0x8a6440, 0xa07a50)
  const shed =
    level < 3
      ? hall(canvas, cx + 10, base - h + 4, { w: 32, wall: 16, roof: 18, walls: shedWalls, roofs: THATCH, bay: 12, door: true, chimney: 0.4 })
      : hall(canvas, cx + 10, base - h + 4, { w: 38, wall: 20, roof: 22, walls: shedWalls, roofs: SLATE, bay: 12, door: true, chimney: 0.4 })
  if (level >= 2) for (const dx of [16, 24]) barrel(canvas, cx + dx, base - 9 + dx / 4)
  // Drying rack.
  const rx = cx - 34
  const ry = base - h + 6
  for (const x of [0, 18]) for (let z = 0; z < 14; z++) canvas.set(rx + x, ry + x / 2 - z, TIMBER[2])
  for (let x = 0; x <= 18; x++) {
    canvas.set(rx + x, ry + x / 2 - 13, TIMBER[1])
    if (x % 3 === 1) for (let z = 0; z < 4; z++) canvas.set(rx + x, ry + x / 2 - 12 + z, z === 3 ? STONE[2] : STONE[4])
  }
  // Net and a barrel.
  for (let y = -2; y <= 2; y++) for (let x = -5; x <= 5; x++) if ((x * x) / 25 + (y * y) / 4 <= 1) canvas.set(cx - 6 + x, base - 8 + y, (x + y) % 2 === 0 ? SACK[3] : SACK[1])
  barrel(canvas, cx + 6, base - 5)
  return smoky(canvas.sprite(cx, base, 0), [shed])
}

// Plank jetty `w`×`h` tiles over the water, its planks across direction `along`; the deck stands `lift` pixels above
// the water. Anchored at its front corner on the water surface.
function pier(w: number, h: number, along: 'x' | 'y', lift: number): Sprite {
  const width = Math.ceil((w + h) * (TILE_WIDTH / 2)) + 8
  const height = Math.ceil((w + h) * (TILE_HEIGHT / 2)) + lift + 8
  const canvas = new Canvas(width, height)
  const ax = Math.round(w * (TILE_WIDTH / 2)) + 4
  const ay = height - 3
  const at = (u: number, v: number, z: number) => ({
    x: ax + (u - v - (w - h)) * (TILE_WIDTH / 2),
    y: ay + (u + v - w - h) * (TILE_HEIGHT / 2) - z,
  })
  const long = along === 'x' ? w : h
  const across = along === 'x' ? h : w
  const uv = (a: number, c: number) => (along === 'x' ? [a, c] : [c, a]) as [number, number]
  // Piles in pairs, back ones first; foam where they meet the water.
  const piles: [number, number][] = []
  for (let a = 0.3; a < long; a += 0.75) for (const c of [0.08, across - 0.08]) piles.push(uv(a, c))
  piles.sort((p, q) => p[0] + p[1] - q[0] - q[1])
  const drawPile = ([u, v]: [number, number]) => {
    const p = at(u, v, 0)
    for (let z = 0; z <= lift; z++) {
      canvas.set(p.x, p.y - z, LOGS[1])
      canvas.set(p.x + 1, p.y - z, LOGS[0])
    }
    canvas.set(p.x - 1, p.y + 1, WATER_FOAM)
    canvas.set(p.x + 2, p.y + 1, WATER_FOAM)
  }
  piles.forEach(drawPile)
  // Deck: sample finely enough to cover every pixel; planks across the length, darker edges.
  for (let a = 0; a <= long; a += 1 / 48) {
    for (let c = 0; c <= across; c += 1 / 48) {
      const [u, v] = uv(a, c)
      const p = at(u, v, lift)
      const plank = Math.floor(a * 5)
      const edge = c < 0.06 || c > across - 0.06
      const gap = (a * 5) % 1 < 0.12
      canvas.set(p.x, p.y, edge ? PLANK[1] : gap ? PLANK[0] : PLANK[2 + Math.floor(hash(plank, 0, 81) * 2.99)])
    }
  }
  // The deck's thickness along its two front edges.
  for (let u = 0; u <= w; u += 1 / 48) {
    const p = at(u, h, lift)
    canvas.set(p.x, p.y + 1, PLANK[1])
    canvas.set(p.x, p.y + 2, PLANK[0])
  }
  for (let v = 0; v <= h; v += 1 / 48) {
    const p = at(w, v, lift)
    canvas.set(p.x, p.y + 1, PLANK[0])
    canvas.set(p.x, p.y + 2, PLANK[0])
  }
  // Bollards at the far end.
  for (const c of [0.12, across - 0.12]) {
    const [u, v] = uv(long - 0.12, c)
    const p = at(u, v, lift)
    for (let z = 0; z < 4; z++) for (const dx of [0, 1]) canvas.set(p.x + dx, p.y - z, z === 3 ? LOGS[3] : LOGS[dx === 0 ? 2 : 1])
  }
  return canvas.sprite(ax, ay, 0)
}

// A raised base levelling a building on sloping ground: two front faces from the ground up to `top`, and a paved
// top. Corner heights are the ground heights at the footprint's left, front and right corners.
function plinth(tiles: number, left: number, front: number, right: number, top: number, colors: Uint32Array, inset: number): Sprite {
  const w = (tiles * TILE_WIDTH) / 2
  const h = w / 2
  const rise = Math.ceil(top - Math.min(left, front, right))
  const canvas = new Canvas(w * 2 + 4, h * 2 + rise + 8)
  const cx = w + 2
  const base = canvas.height - 3 - Math.ceil(Math.max(0, front - Math.min(left, front, right)))
  // Height above the anchor (the ground at the front corner) maps to screen rows.
  const lift = (z: number) => z - front
  for (const side of [-1, 1]) {
    const far = side < 0 ? left : right
    for (let t = 0; t <= w; t++) {
      const x = cx + side * (w - t)
      const row = base - h + t / 2
      const ground = far + (front - far) * (t / w)
      for (let z = ground; z <= top; z++) {
        const course = Math.floor((top - z) / 4)
        const mortar = Math.round(top - z) % 4 === 0 || (t + (course & 1) * 3) % 8 === 0
        canvas.set(x, row - lift(z), colors[(side < 0 ? 3 : 1) - (mortar ? 1 : 0)])
      }
    }
  }
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / w
      const b = (y - (base - h)) / h
      const d = Math.abs(a) + Math.abs(b)
      if (d > 1) continue
      canvas.set(x, y - lift(top), d > 1 - inset / w ? colors[4] : colors[2 + (((x >> 2) + (y >> 1)) & 1)])
    }
  }
  return canvas.sprite(cx, base, 0)
}

// A building site: posts, beams and braces over levelled ground.
function scaffold(tiles: number): Sprite {
  const { canvas, cx, base, w, h } = footprint(tiles, 50)
  const inset = 6
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / (w - inset)
      const b = (y - (base - h)) / (h - inset / 2)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(SOIL, 2.4 + (hash(x, y, 51) - 0.5) * 1.5))
    }
  }
  const tall = 10 + tiles * 6
  const iw = w - inset - 2
  const post = (x: number, y: number, tone: number) => {
    for (let z = 0; z <= tall; z++) {
      canvas.set(x, y - z, TIMBER[tone])
      canvas.set(x + 1, y - z, TIMBER[Math.max(0, tone - 1)])
    }
  }
  const beam = (x0: number, y0: number, x1: number, y1: number, tone: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) {
      canvas.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, TIMBER[tone])
      canvas.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n + 1, TIMBER[0])
    }
  }
  const front = base - inset / 2 - 1
  const left = { x: cx - iw, y: front - iw / 2 }
  const right = { x: cx + iw, y: front - iw / 2 }
  const back = { x: cx, y: front - iw }
  post(back.x, back.y, 0)
  beam(back.x, back.y - tall, left.x, left.y - tall, 1)
  beam(back.x, back.y - tall, right.x, right.y - tall, 0)
  for (const [corner, tone] of [[left, 2], [right, 1]] as const) {
    post(corner.x, corner.y, tone)
    beam(corner.x, corner.y - tall, cx, front - tall, tone)
    beam(corner.x, corner.y, cx, front - tall, tone)
  }
  post(cx, front, 2)
  // First course of the walls, laid along the two front edges.
  for (const side of [-1, 1]) {
    for (let t = 0; t <= iw; t++) {
      const x = cx + side * (iw - t)
      for (let z = 0; z < 4; z++) canvas.set(x, front - iw / 2 + t / 2 - z, pick(STONE, (side < 0 ? 4 : 2) - (z === 0 || (t + z) % 6 === 0 ? 1 : 0)))
    }
  }
  // A stack of planks.
  for (let i = 0; i < 3; i++) for (let t = 0; t < 12; t++) canvas.set(cx - 10 + t, front - 4 - i + t / 2, CUT[i === 2 ? 2 : 1])
  return canvas.sprite(cx, base, 0)
}

// Villagers in plain tunics and straw hats, facing screen right, two stride frames.
function peasant(frame: number, tunic: Uint32Array): Sprite {
  const canvas = new Canvas(12, 20)
  const cx = 5
  const base = 18
  const stride = frame === 0 ? 1 : -1
  canvas.set(cx - 1 - stride, base, TIMBER[0])
  canvas.set(cx + 1 + stride, base, TIMBER[0])
  for (let y = base - 8; y < base; y++) {
    const half = y > base - 3 ? 1.5 : 1
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) canvas.set(x, y, tunic[x < cx ? 2 : x === cx ? 1 : 0])
  }
  canvas.set(cx - 2, base - 6 + (frame === 0 ? 0 : 1), rgb(0xb88458))
  canvas.set(cx, base - 9, rgb(0xb88458))
  canvas.set(cx + 1, base - 9, rgb(0x93633f))
  for (let x = cx - 2; x <= cx + 2; x++) canvas.set(x, base - 10, THATCH[x < cx ? 5 : 3])
  canvas.set(cx, base - 11, THATCH[4])
  shadow(canvas, cx, base, 3)
  return canvas.sprite(cx, base, 0)
}

// The market: an open stall hall under a striped canopy, crates and barrels of goods, and a weighing scale.
function market(): Sprite {
  const { canvas, cx, base } = footprint(2, 70)
  hall(canvas, cx, base - 8, { w: 52, wall: 20, roof: 22, walls: WALL, roofs: ROOF, open: true })
  barrel(canvas, cx - 30, base - 8)
  barrel(canvas, cx - 22, base - 4)
  crate(canvas, cx + 18, base - 8, 9)
  crate(canvas, cx + 26, base - 12, 8)
  shadeBlobs(canvas, [{ x: cx + 4, y: base - 4, r: 3.5 }, { x: cx + 9, y: base - 3, r: 3 }], SACK, 3)
  // A scale on a post by the front corner.
  const sx = cx - 6
  const sy = base - 4
  for (let z = 0; z < 16; z++) canvas.set(sx, sy - z, TIMBER[1])
  for (let x = -6; x <= 6; x++) canvas.set(sx + x, sy - 16, BRASS[2])
  for (const side of [-6, 6]) for (let x = -2; x <= 2; x++) canvas.set(sx + side + x, sy - 11, BRASS[x < 0 ? 3 : 1])
  return canvas.sprite(cx, base, 0)
}

// The barracks: a long stone hall with a slate roof and a war banner, a palisade yard with straw training dummies and
// a rack of spears.
function barracks(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(3, 110 + (level - 1) * 10)
  // Trampled yard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 4); x <= cx + (h * 2 - 4); x++) {
      const a = (x - cx) / (h * 2 - 6)
      const b = (y - (base - h)) / (h - 3)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(SOIL, 1.5 + hash(x >> 1, y, 83) * 1.2))
    }
  }
  const top = hall(canvas, cx + 18, base - h + 4, { w: 60 + (level - 1) * 6, wall: 30, roof: 30, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 16, door: true, chimney: 0.6, trim: level > 1 ? BRASS[1] : undefined })
  banner(canvas, top.x, top.y, 14)
  // Straw dummies on posts.
  for (const [dx, dy] of [[-58, -6], [-40, 2], [-22, 8]]) {
    const x = cx + dx
    const y = base - h + dy + 10
    for (let z = 0; z < 14; z++) canvas.set(x, y - z, TIMBER[1])
    for (let x2 = -4; x2 <= 4; x2++) canvas.set(x + x2, y - 10, TIMBER[2])
    shadeBlobs(canvas, [{ x, y: y - 14, r: 3.5 }, { x, y: y - 8, r: 3 }], THATCH, 3)
  }
  rack(canvas, cx + 28, base - 10)
  // Palisade along the two front edges.
  for (const side of [-1, 1]) {
    for (let t = 6; t < h * 2 - 6; t += 2) {
      const x = cx + side * t
      const y = base - 2 - t / 2
      for (let z = 0; z < 10; z++) canvas.set(x, y - z, z > 7 ? LOGS[3] : LOGS[side < 0 ? 2 : 1])
    }
  }
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The spy house: a narrow dark townhouse with shuttered windows, a crow on the roof and a lantern by the door.
function spyHouse(level = 1): Sprite {
  const { canvas, cx, base } = footprint(2, 100 + (level - 1) * 12)
  const shadow = ramp(0x1e1a24, 0x2a2532, 0x37314a, 0x4a4260, 0x5e5478)
  const top = hall(canvas, cx, base - 6, { w: 40 + (level - 1) * 4, wall: 38 + (level - 1) * 8, roof: 34, walls: shadow, roofs: SLATE, masonry: true, bay: 12, door: true, chimney: 0.5 })
  // A crow on the ridge.
  const crow = [
    [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 1], [-2, 0],
  ]
  for (const [x, y] of crow) canvas.set(top.x - 4 + x, top.y + 4 + y, rgb(0x16141a))
  canvas.set(top.x - 6, top.y + 4, BRASS[3])
  // A lantern by the door.
  const lx = cx - 30
  const ly = base - 30
  for (let z = 0; z < 8; z++) canvas.set(lx, ly - z, TIMBER[0])
  for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) canvas.set(lx + x, ly + 1 + y, Math.abs(x) === 2 || y === 0 || y === 4 ? TIMBER[0] : EMBER[2])
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The watchtower: a timber tower on a stone footing with a roofed lookout platform and a beacon.
function watchtower(): Sprite {
  const { canvas, cx, base } = footprint(1, 120)
  const top = tower(canvas, cx, base - 6, 9, 70, DARK_STONE, SLATE)
  // Lookout ledge just under the roof.
  for (let x = -12; x <= 12; x++) for (let z = 0; z < 3; z++) canvas.set(cx + x, base - 6 - 70 + z, PLANK[x < 0 ? 4 : 2])
  for (let x = -12; x <= 12; x += 4) for (let z = 3; z < 8; z++) canvas.set(cx + x, base - 6 - 70 - z + 3, TIMBER[1])
  finial(canvas, top.x, top.y, 4)
  banner(canvas, top.x, top.y - 4, 8)
  return canvas.sprite(cx, base, 0)
}

const PLASTER = ramp(0x8a8270, 0xb4ac98, 0xd4ccb6, 0xe8e2cc, 0xf6f2e2)
const TERRACOTTA = ramp(0x5a2416, 0x7a3420, 0x9a4a2c, 0xb8603a, 0xd07a4c, 0xe49464)
const VERDIGRIS = ramp(0x1e4a44, 0x2a6a5e, 0x3a8a78, 0x52a690, 0x74c2aa, 0x9adcc4)

// A flat paved yard over a footprint's diamond.
function yard(canvas: Canvas, cx: number, base: number, h: number, colors: Uint32Array, seed: number) {
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 4); x <= cx + (h * 2 - 4); x++) {
      const a = (x - cx) / (h * 2 - 6)
      const b = (y - (base - h)) / (h - 3)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(colors, 1.2 + (((x >> 2) + (y >> 1)) % 2) * 0.8 + (hash(x, y, seed) - 0.5)))
    }
  }
}

// The university: a long stone college with a slate roof and rows of lit windows, an observatory tower with a copper
// dome behind it (taller with each level) and a gilded armillary on top.
function university(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(3, 130 + (level - 1) * 16)
  yard(canvas, cx, base, h, KEEP, 91)
  const tall = 54 + (level - 1) * 14
  const dome = tower(canvas, cx + 34, base - h - 10, 12, tall, KEEP, VERDIGRIS, true)
  const hallTop = hall(canvas, cx - 6, base - 10, { w: 62 + (level - 1) * 4, wall: 34 + (level - 1) * 6, roof: 26, walls: KEEP, roofs: SLATE, masonry: true, bay: 10, door: true, chimney: 0.55, trim: level > 2 ? BRASS[2] : undefined })
  // An armillary sphere on the dome: a ring and a cross of brass.
  const ax = dome.x
  const ay = dome.y - 6
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2
    canvas.set(ax + Math.round(Math.cos(t) * 4), ay + Math.round(Math.sin(t) * 4), BRASS[a < 12 ? 3 : 1])
  }
  for (let d = -4; d <= 4; d++) canvas.set(ax + d, ay, BRASS[2])
  for (let z = 0; z < 6; z++) canvas.set(ax, ay + 4 + z, BRASS[1])
  // Books stacked by the door: a few coloured spines.
  for (let i = 0; i < 4; i++) for (let x = 0; x < 6; x++) canvas.set(cx - 44 + x, base - 10 - i * 2, CLOTH[i % 4][x < 3 ? 2 : 1])
  if (level > 1) banner(canvas, cx - 40, base - 40, 8)
  return smoky(canvas.sprite(cx, base, 0), [hallTop])
}

// The hospital: a whitewashed hall with a terracotta roof and a red-cross banner over the door, a well and a walled
// herb garden in front; a second wing at level 3.
function hospital(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 90 + (level - 1) * 12)
  yard(canvas, cx, base, h, PLASTER, 47)
  if (level > 2) hall(canvas, cx + 22, base - h - 2, { w: 28, wall: 30, roof: 20, walls: PLASTER, roofs: TERRACOTTA, masonry: true, bay: 10 })
  const top = hall(canvas, cx - 2, base - 6, { w: 40 + (level - 1) * 4, wall: 28 + (level - 1) * 8, roof: 22, walls: PLASTER, roofs: TERRACOTTA, masonry: true, bay: 12, door: true, chimney: 0.5 })
  // The cross on a white cloth over the door (left wall).
  const fx = cx - 18
  const fy = base - 40 - (level - 1) * 6
  for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) canvas.set(fx + x, fy + y + Math.floor(x / 2), x === 0 || x === 8 || y === 10 ? CRIMSON[1] : PLASTER[4])
  for (let i = 2; i <= 8; i++) {
    for (const w of [0, 1]) {
      canvas.set(fx + 4 + w, fy + i + 2, CRIMSON[2])
      canvas.set(fx + i - 1, fy + 4 + w + Math.floor((i - 1) / 2), CRIMSON[2])
    }
  }
  // Herb beds in rows.
  for (let r = 0; r < 3; r++) {
    for (let t = 0; t < 14; t++) {
      const x = cx + 6 + t
      const y = base - 8 - r * 4 + Math.floor(t / 2)
      canvas.set(x, y, hash(t, r, 13) > 0.4 ? GREENS[1 + (t % 3)] : FRUIT[(t + r) % 4])
    }
  }
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The temple: a stone nave with a slate roof and a bell tower whose spire grows with each level, a gilded finial and a
// lit rose window.
function temple(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 130 + (level - 1) * 24)
  yard(canvas, cx, base, h, KEEP, 37)
  const spire = tower(canvas, cx + 18, base - h - 2, 9, 48 + (level - 1) * 16, KEEP, level > 2 ? VERDIGRIS : SLATE, true)
  finial(canvas, spire.x, spire.y, 6 + level)
  // A cross on the finial.
  for (let d = -2; d <= 2; d++) canvas.set(spire.x + d, spire.y - 4 - level, BRASS[3])
  hall(canvas, cx - 6, base - 6, { w: 40, wall: 30 + (level - 1) * 4, roof: 30, walls: KEEP, roofs: SLATE, masonry: true, bay: 0, door: true, trim: level > 1 ? BRASS[2] : undefined })
  // Rose window on the left wall.
  const rx = cx - 30
  const ry = base - 6 - 24 - (level - 1) * 2
  for (let y = -4; y <= 4; y++) {
    for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y)
      if (d > 4.3) continue
      canvas.set(rx + x, ry + y + Math.round(x / 2), d > 3.4 ? TIMBER[0] : (x + y) % 2 === 0 ? EMBER[2] : GLASS[2])
    }
  }
  return canvas.sprite(cx, base, 0)
}

// The warehouse: a long timber barn with wide doors, sacks and barrels stacked by it; bigger and stone-footed with
// each level.
function warehouse(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 80 + (level - 1) * 10)
  yard(canvas, cx, base, h, SOIL, 53)
  hall(canvas, cx - 4, base - 6, { w: 44 + (level - 1) * 3, wall: 22 + (level - 1) * 6, roof: 22, walls: level > 2 ? KEEP : WALL, roofs: level > 1 ? SLATE : THATCH, masonry: level > 2, bay: 0, door: true })
  // Big double doors on the right wall.
  for (let t = 14; t <= 30; t++) {
    const x = cx - 4 + (44 + (level - 1) * 3 - t)
    const ground = base - 6 - (44 + (level - 1) * 3) / 2 + t / 2
    for (let z = 0; z < 16; z++) canvas.set(x, ground - z, t === 22 ? TIMBER[0] : t % 3 === 0 ? PLANK[1] : PLANK[2])
  }
  // Goods stacked by the front corner.
  barrel(canvas, cx + 14, base - 6)
  barrel(canvas, cx + 22, base - 10)
  crate(canvas, cx + 6, base - 4, 8)
  if (level > 1) crate(canvas, cx + 28, base - 14, 8)
  shadeBlobs(canvas, [{ x: cx - 14, y: base - 6, r: 4 }, { x: cx - 8, y: base - 5, r: 3.5 }, { x: cx - 11, y: base - 10, r: 3 }], SACK, 3)
  return canvas.sprite(cx, base, 0)
}

// The treasury: a squat stone strong-house with a gilded roof edge, a brass-bound door between two guards' lanterns,
// and chests of coin by the front corner; a gilded dome rises on it at the higher levels.
function treasury(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(2, 100 + (level - 1) * 14)
  yard(canvas, cx, base, h, KEEP, 71)
  const top = hall(canvas, cx, base - 6, { w: 42, wall: 30 + (level - 1) * 4, roof: 18, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 0, door: true, trim: BRASS[2] })
  if (level > 1) {
    // A small gilded dome over the roof.
    for (let y = 0; y <= 8 + level * 2; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (y / (8 + level * 2)) ** 2)) * (6 + level))
      for (let x = -half; x <= half; x++) canvas.set(top.x + x, top.y + 4 - y, BRASS[x < 0 ? 3 : x < half / 2 ? 2 : 1])
    }
    finial(canvas, top.x, top.y - 6 - level * 2, 4)
  }
  // Brass studs on the door (left wall).
  for (let i = 0; i < 4; i++) canvas.set(cx - 14 + i * 2, base - 18 + i, BRASS[3])
  // Coin chests and a heap of gold.
  crate(canvas, cx + 14, base - 6, 8)
  crate(canvas, cx + 22, base - 10, 7)
  shadeBlobs(canvas, [{ x: cx + 4, y: base - 4, r: 3.5 }, { x: cx + 8, y: base - 3, r: 3 }], BRASS, 3)
  return canvas.sprite(cx, base, 0)
}

// A section of wall filling one tile: masonry on the two front faces, a walkway on top and battlements; a broken one
// is a heap of rubble with a stump of wall.
// `door`: a gate, with an arched wooden door through both front faces under a banner.
// `door`: the face the gate's door is on (-1 the left face, for a gate in a wall along x; 1 the right face, along y),
// 0 for none. `towerWall`: the taller tower beside a gate, with an arrow slit and wider battlements.
function wall(broken = false, door: -1 | 0 | 1 = 0, towerWall = false): Sprite {
  const { canvas, cx, base, w, h } = footprint(1, towerWall ? 84 : 50)
  const tall = broken ? 8 : towerWall ? 56 : door ? 30 : 26
  for (const side of [-1, 1]) {
    const lit = side < 0
    for (let t = 0; t <= w; t++) {
      const x = cx + side * (w - t)
      const ground = base - h + t / 2
      const height = broken ? tall + Math.round(hash(t >> 2, side, 41) * 10) : tall
      for (let z = 0; z <= height; z++) {
        const course = Math.floor(z / 4)
        const mortar = z % 4 === 0 || (t + (course & 1) * 3) % 8 === 0
        canvas.set(x, ground - z, pick(KEEP, (lit ? 3 : 1.3) - (mortar ? 0.8 : 0) + (hash(t >> 2, course, 17 + side) > 0.85 ? 0.6 : 0)))
        // The arch: planks with iron bands, rounded at the top.
        const mid = Math.abs(t - w / 2)
        if (door === side && mid < 10 && z < 18 + Math.sqrt(Math.max(0, 100 - mid * mid)) * 0.5) {
          canvas.set(x, ground - z, mid > 8.5 ? TIMBER[0] : z % 6 === 3 ? STONE[1] : PLANK[lit ? (Math.floor(t / 3) % 2 ? 3 : 2) : 1])
        }
        // An arrow slit in each face of a tower.
        if (towerWall && mid < 1.5 && z > tall * 0.45 && z < tall * 0.75) canvas.set(x, ground - z, TIMBER[0])
      }
      if (!broken && t % (towerWall ? 6 : 8) < (towerWall ? 3 : 4)) for (let z = height + 1; z <= height + (towerWall ? 7 : 5); z++) canvas.set(x, ground - z, pick(KEEP, lit ? 3.4 : 1.8))
    }
  }
  // The walkway on top.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / w
      const b = (y - (base - h)) / h
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y - tall, broken ? pick(STONE, 1 + hash(x, y, 43) * 3) : pick(KEEP, 2.2 + hash(x >> 1, y, 47) * 0.8))
    }
  }
  if (broken) shadeBlobs(canvas, [{ x: cx - 18, y: base - 6, r: 5 }, { x: cx + 14, y: base - 4, r: 4 }, { x: cx + 2, y: base - 2, r: 3.5 }], STONE, 4)
  if (door) banner(canvas, cx, base - h - tall + 2, 8)
  return canvas.sprite(cx, base, 0)
}

const variants = <T>(count: number, make: (i: number) => T) => Array.from({ length: count }, (_, i) => make(i))

export type StructureLook = BuildingKind | 'scaffold' | 'brokenWall' | 'gateY' | 'towerWall' | 'tradePostRuined'

// A building as the map draws it; docks carry their jetty (tile rectangle over the water).
export interface Structure {
  x: number
  y: number
  size: number
  look: StructureLook
  variant: number
  level?: number
  // The kingdom's colour (see KINGDOM_COLORS), for the palace roofs.
  color?: string
  // The building it shows, for picking it on the map.
  id?: number
  pier?: { x: number; y: number; w: number; h: number; along: 'x' | 'y' }
}

// Variants for each look; a building picks one by its id. Building sites come in one size per footprint tile count.
// Looks for levels 2 and 3 of the buildings that can be raised; level 1 is STRUCTURE_SPRITES.
export const LEVEL_SPRITES: Partial<Record<BuildingKind, Sprite[][]>> = {
  house: [2, 3].map((level) => variants(6, (v) => house(v, level))),
  farm: [2, 3].map((level) => variants(2, (v) => farm(v, level))),
  lumberCamp: [2, 3].map((level) => [lumberCamp(level)]),
  forge: [2, 3].map((level) => [forge(level)]),
  dock: [2, 3].map((level) => [dock(level)]),
  barracks: [[barracks(2)]],
  spyHouse: [2, 3].map((level) => [spyHouse(level)]),
  university: [2, 3].map((level) => [university(level)]),
  hospital: [2, 3].map((level) => [hospital(level)]),
  temple: [2, 3].map((level) => [temple(level)]),
  warehouse: [2, 3].map((level) => [warehouse(level)]),
  treasury: [2, 3].map((level) => [treasury(level)]),
}

// The palace in each kingdom colour, made when first seen.
const palaces = new Map<string, Sprite>()
export const palaceIn = (color: string | undefined): Sprite => {
  const key = color && color in KINGDOM_COLORS ? color : 'royal'
  if (!palaces.has(key)) palaces.set(key, key === 'royal' ? STRUCTURE_SPRITES.palace[0] : palace(KINGDOM_COLORS[key as KingdomColor].roofs))
  return palaces.get(key)!
}

// The variants a building shows at its level.
export const looksOf = (look: StructureLook, level = 1): Sprite[] =>
  look !== 'scaffold' && look !== 'brokenWall' && look !== 'gateY' && look !== 'towerWall' && look !== 'tradePostRuined' && level > 1 ? (LEVEL_SPRITES[look]?.[level - 2] ?? STRUCTURE_SPRITES[look]) : STRUCTURE_SPRITES[look]

export const STRUCTURE_SPRITES: Record<StructureLook, Sprite[]> = {
  palace: [palace()],
  house: variants(6, house),
  farm: variants(2, farm),
  lumberCamp: [lumberCamp()],
  forge: [forge()],
  tradePost: [tradePost()],
  tradePostRuined: [tradePost(true)],
  dock: [dock()],
  market: [market()],
  barracks: [barracks()],
  spyHouse: [spyHouse()],
  watchtower: [watchtower()],
  wall: [wall()],
  gate: [wall(false, -1)],
  gateY: [wall(false, 1)],
  towerWall: [wall(false, 0, true)],
  university: [university()],
  hospital: [hospital()],
  temple: [temple()],
  warehouse: [warehouse()],
  treasury: [treasury()],
  brokenWall: [wall(true)],
  scaffold: [scaffold(1), scaffold(2), scaffold(3)],
}

export const VILLAGER_SPRITES = [SACK, CLOTH[2], CLOTH[1], CLOTH[3]].map((tunic) => [peasant(0, tunic), peasant(1, tunic)])

const FOUNDATION = ramp(0x4a4650, 0x625e68, 0x7a7680, 0x928e96, 0xaaa6aa)
const BANK = ramp(0x3a2818, 0x4e3620, 0x64472a, 0x7a5834, 0x5f8c3a)
// Below this difference between its corners (pixels) a building just sits on the ground.
const LEVEL_TOLERANCE = 3

// One sprite of a structure and where it stands: the front corner (tile coordinates) and its height in pixels.
export interface Part {
  sprite: Sprite
  fx: number
  fy: number
  z: number
  // Whether walkers are hidden behind it (fields and jetties are flat).
  solid: boolean
}

const made = new Map<string, Sprite>()
const once = (key: string, make: () => Sprite) => made.get(key) ?? (made.set(key, make()), made.get(key)!)

// On a slope a building stands level at the height of its highest corner, on a stone base (an earth bank for
// fields) reaching down to the ground.
export function structureParts(world: World, s: Structure): Part[] {
  const at = (x: number, y: number) => Math.round(heightAt(world, x, y))
  const back = at(s.x, s.y)
  const left = at(s.x, s.y + s.size)
  const front = at(s.x + s.size, s.y + s.size)
  const right = at(s.x + s.size, s.y)
  const low = Math.min(back, left, front, right)
  const high = Math.max(back, left, front, right)
  const fx = s.x + s.size
  const fy = s.y + s.size
  const looks =
    s.look === 'scaffold' ? [STRUCTURE_SPRITES.scaffold[s.size - 1]] : s.look === 'palace' ? [palaceIn(s.color)] : looksOf(s.look, s.level)
  // Fields are walked over; gates are walked through but stand tall like the wall around them.
  const flat = s.look === 'farm'
  const parts: Part[] = []
  let z = at(s.x + s.size / 2, s.y + s.size / 2)
  if (high - low >= LEVEL_TOLERANCE) {
    z = high + 1
    const key = `plinth:${s.size}:${left}:${front}:${right}:${z}:${flat}`
    const base = once(key, () => plinth(s.size, left, front, right, z, flat ? BANK : FOUNDATION, flat ? 0 : 3))
    parts.push({ sprite: base, fx, fy, z: front, solid: !flat })
  }
  parts.push({ sprite: looks[s.variant % looks.length], fx, fy, z, solid: !flat })
  if (s.pier) {
    const p = s.pier
    // The deck starts level with the bank it leaves from.
    const shore = p.along === 'x' ? { x: p.x < s.x ? p.x + p.w : p.x, y: p.y + p.h / 2 } : { x: p.x + p.w / 2, y: p.y < s.y ? p.y + p.h : p.y }
    const lift = Math.max(5, Math.min(14, at(shore.x, shore.y) + 2))
    const sprite = once(`pier:${p.w}:${p.h}:${p.along}:${lift}`, () => pier(p.w, p.h, p.along, lift))
    parts.push({ sprite, fx: p.x + p.w, fy: p.y + p.h, z: 0, solid: false })
  }
  return parts
}
