import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt } from '@game/shared'
import type { BuildingKind, KingdomColorId, Point, World } from '@game/shared'
import { BARK, Canvas, CLOTH, GLASS, ROOF, SACK, STONE, TIMBER, WALL, diamondAt, ellipseAt, pick, ramp, rgb, shadeBlobs, shadow } from './sprites'
import type { Sprite } from './sprites'
import { WALL_KINDS, wallLinks, wallLook } from './wallSprites'
import type { WallKind } from './wallSprites'

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
  mint: tones('Nane', 0x7ed6b0),
  peach: tones('Şeftali', 0xf2a07a),
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
// Canopy cloths: shade, colour, light stripe.
const CANOPY = ramp(0x7a2a26, 0xa8423a, 0xe9dcc0)
const CANOPY_BLUE = ramp(0x1e3466, 0x2a4a8a, 0xe9dcc0)
const CANOPY_GOLD = ramp(0x8a6418, 0xd8a832, 0xf0dc9a)
const CANOPY_BROWN = ramp(0x4a3220, 0x6e4c30, 0x9a7a58)
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
  // An open stall under a real roof (thatch, shingles) instead of cloth.
  roofed?: boolean
  // The cloth of an open stall's canopy: shade, colour and the light stripe (red and white when not given).
  cloth?: Uint32Array
  // A canopy of one colour, without stripes.
  plain?: boolean
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
  // Its shape for the shadow: the walls (an open stall has only posts) and the roof over them.
  if (!s.open) canvas.solid(diamondAt(cx, base - h, w), 0, wall)
  canvas.solid(diamondAt(cx, base - h, w + eave), Math.max(0, wall - eave / 2), wall + roof, [cx, base - h])
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
      if (s.open && !s.roofed) {
        // Cloth canopy in stripes running down from the apex.
        const stripe = !s.plain && Math.floor(dx / 6) & 1
        const c = s.cloth ?? CANOPY
        canvas.set(x, y, f > 0.9 ? TIMBER[1] : stripe ? (side < 0 ? c[2] : c[1]) : side < 0 ? c[1] : c[0])
        continue
      }
      const shingle = Math.floor(y + dx / 2) % 4 === 0 || (x + course * 3) % 7 === 0
      tone = (side < 0 ? 4 : 2) - (shingle ? 1 : 0) + (hash(x >> 1, course, 9) > 0.75 ? 0.6 : 0)
      if (f > 0.93) tone = side < 0 ? 1 : 0
      canvas.set(x, y, s.trim !== undefined && (f > 0.95 || y - ridgeY < 1.2) ? s.trim : pick(s.roofs, tone))
    }
  }
  for (let y = apexY; y <= base - wall + eave; y++) canvas.set(cx, y, s.open && !s.roofed ? (s.cloth ?? CANOPY)[s.plain ? 1 : 2] : (s.trim ?? s.roofs[s.roofs.length - 1]))
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
    canvas.solid(diamondAt(cx + dx + width / 2, base - h, width / 2), wall, base - h - (foot - tall))
    return { x: cx + dx + width / 2, y: foot - tall, chimney: true }
  }
  return { x: cx, y: apexY, chimney: false }
}

// A round tower standing on (cx, base) with battlements and a pointed roof (none when `roofs` is null: an open
// crenellated top).
function tower(canvas: Canvas, cx: number, base: number, r: number, tall: number, walls: Uint32Array, roofs: Uint32Array | null, lit = false) {
  canvas.solid(ellipseAt(cx, base, r), 0, tall + 3)
  if (roofs) canvas.solid(ellipseAt(cx, base, r + 1), tall + 2, tall + 2 + Math.round(r * 2.2), [cx, base])
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
  if (!roofs) {
    // The tower's top seen from above: a paved ring inside the battlements.
    for (let x = -r + 1; x <= r - 1; x++) {
      const curve = Math.sqrt(Math.max(0, 1 - (x / r) ** 2)) * r * 0.5
      for (let y = -curve; y <= curve - 1; y++) canvas.set(cx + x, Math.round(base - tall + y), pick(walls, 2.6 - (x / r) * 0.8))
    }
    return { x: cx, y: base - tall - 3 }
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
  canvas.solid([x0, y0 - 1.5, x1, y1 - 1.5, x1, y1 + 1.5, x0, y0 + 1.5], 0, tall + 3)
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

// The palace grows with its level (CLAUDE.md §6.4): a walled keep with open corner turrets at level 1; roofed towers
// and a gatehouse at 2; a second tier on the keep at 3; a taller keep and towers at 4; at 5 a grand keep with turrets
// along the walls, a gilded star on top and ivy on the stone. Roofs in the kingdom's colour.
const PALACE_LEVELS = [
  { wall: 12, tower: [7, 24], roofed: false, keep: [34, 30, 28], upper: null, gatehouse: false },
  { wall: 14, tower: [8, 34], roofed: true, keep: [40, 34, 30], upper: null, gatehouse: true },
  { wall: 16, tower: [9, 46], roofed: true, keep: [48, 38, 22], upper: [24, 22, 30], gatehouse: true },
  { wall: 16, tower: [10, 58], roofed: true, keep: [56, 44, 24], upper: [30, 30, 40], gatehouse: true },
  { wall: 18, tower: [11, 66], roofed: true, keep: [62, 50, 26], upper: [32, 34, 44], gatehouse: true },
  // Level 6 is no lord's: the royal keep of a crown kingdom's capital, on four tiles (CLAUDE.md §7.8).
  { wall: 22, tower: [13, 82], roofed: true, keep: [84, 60, 30], upper: [48, 46, 50], gatehouse: true },
] as const
const IVY = ramp(0x1f3a1c, 0x2e5a26, 0x447a32)

function palace(roofs: Uint32Array = ROYAL, level = 1): Sprite {
  const p = PALACE_LEVELS[Math.max(0, Math.min(PALACE_LEVELS.length - 1, level - 1))]
  const royal = level >= 6
  const { canvas, cx, base, w, h } = footprint(royal ? 4 : 3, 150 + level * 24 + (royal ? 90 : 0))
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
  const [r, tall] = p.tower
  const turretRoofs = p.roofed ? roofs : null
  // The back walls first, their inner faces seen over the courtyard.
  rampart(canvas, left.x + r, left.y - r / 2, back.x - r, back.y + r / 2, p.wall, KEEP, false)
  rampart(canvas, back.x + r, back.y + r / 2, right.x - r, right.y - r / 2, p.wall, KEEP, true)
  const tops: { x: number; y: number }[] = []
  tops.push(tower(canvas, back.x, back.y, r, tall + 6, KEEP, turretRoofs, true))
  // The keep, centred in the yard, and the upper keep rising out of its roof.
  const [kw, kwall, kroof] = p.keep
  const keepBase = base - h + Math.round(kw / 2) - 1
  let crown = hall(canvas, cx, keepBase, { w: kw, wall: kwall, roof: kroof, walls: KEEP, roofs, masonry: true, bay: kw > 44 ? 12 : 10, trim: BRASS[2] })
  const drapes = level === 1 ? [] : level === 2 ? [Math.round(kw * 0.45)] : [12, kw - 18]
  for (const side of [-1, 1]) for (const t of drapes) drape(canvas, cx, keepBase, kw, side, t, kwall - 4, Math.min(22, kwall - 10))
  if (p.upper) {
    const [uw, uwall, uroof] = p.upper
    crown = hall(canvas, cx, keepBase - kwall - Math.round(kroof * 0.95), { w: uw, wall: uwall, roof: uroof, walls: KEEP, roofs, masonry: true, bay: 10, trim: BRASS[2] })
    if (royal) {
      // A third tier: the crown tower, with gilded turrets at its sides.
      const upperBase = keepBase - kwall - Math.round(kroof * 0.95)
      for (const side of [-1, 1]) tower(canvas, cx + side * (uw - 6), upperBase - uwall + 4, 6, 26, KEEP, roofs, true)
      crown = hall(canvas, cx, upperBase - uwall - Math.round(uroof * 0.9), { w: 22, wall: 34, roof: 40, walls: KEEP, roofs, masonry: true, bay: 8, trim: BRASS[2] })
    }
  }
  if (level >= 5) star(canvas, crown.x, crown.y - 9)
  else finial(canvas, crown.x, crown.y, 6)
  banner(canvas, crown.x, crown.y - (level >= 5 ? 20 : 6), 14)
  // Side towers, then the curtain wall along the two front edges, then the gate.
  tops.push(tower(canvas, left.x, left.y, r + 1, tall, KEEP, turretRoofs, true))
  tops.push(tower(canvas, right.x, right.y, r + 1, tall, KEEP, turretRoofs, true))
  const gate = { x: cx, y: base - 6 }
  const gw = p.gatehouse ? 14 : 9
  rampart(canvas, left.x + r, left.y + r / 2, gate.x - gw, gate.y - gw / 2, p.wall, KEEP, true)
  rampart(canvas, right.x - r, right.y + r / 2, gate.x + gw, gate.y - gw / 2, p.wall, KEEP, false)
  // At level 5, a roofed turret halfway along each front wall.
  if (level >= 5) {
    for (const side of [-1, 1]) {
      const end = side < 0 ? left : right
      tops.push(tower(canvas, Math.round((end.x + gate.x) / 2), Math.round((end.y + gate.y) / 2) - 2, 6, p.wall + 16, KEEP, roofs, true))
    }
  }
  // The gate: an arched gateway in the wall, or a gatehouse between two turrets with a gilded portcullis.
  const gateTall = p.gatehouse ? 18 + level * 2 : p.wall + 6
  const half = p.gatehouse ? 12 : 7
  for (let x = -half; x <= half; x++) {
    const ground = gate.y - 6 + Math.abs(x) * 0.15
    for (let z = 0; z <= gateTall; z++) {
      const arch = Math.abs(x) <= 5 && z < 12 + Math.sqrt(Math.max(0, 25 - x * x)) * 0.8
      let color = pick(KEEP, (x < 0 ? 3 : 1.6) - ((z % 3 === 0 || (x + (Math.floor(z / 3) & 1) * 2) % 5 === 0) ? 0.8 : 0))
      if (arch) color = p.gatehouse ? (Math.abs(x) % 3 === 0 && z > 2 ? BRASS[1] : z % 4 === 0 && z > 2 ? BRASS[0] : TIMBER[0]) : z > 1 && Math.abs(x) < 5 ? PLANK[x < 0 ? 3 : 1] : TIMBER[0]
      if (z > gateTall - 3 && (x + half) % 5 >= 3) continue
      canvas.set(cx + x, ground - z, color)
    }
  }
  if (p.gatehouse) {
    for (const side of [-1, 1]) tops.push(tower(canvas, gate.x + side * 15, gate.y, 7, gateTall + 10, KEEP, roofs))
    // Crest over the gate.
    if (level >= 4) for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(y) <= 3) canvas.set(cx + x, gate.y - gateTall + y, Math.abs(x) + Math.abs(y) === 3 ? BRASS[0] : y < 0 ? BRASS[3] : BRASS[2])
  }
  for (const [i, top] of tops.entries()) {
    if (p.roofed || i > 2) finial(canvas, top.x, top.y, 4)
    // Banners on the side towers; the one behind would tangle with the keep's own.
    if (p.roofed && (i === 1 || i === 2)) banner(canvas, top.x, top.y - 4, 9)
  }
  // Ivy climbing the old stone of the grandest palace.
  if (level >= 5) {
    const stone = new Set<number>(KEEP)
    for (let y = base - 120; y <= base; y++) {
      for (let x = cx - w; x <= cx + w; x++) {
        if (!stone.has(canvas.get(x, y)) || hash(x >> 1, y >> 1, 83) > 0.025 + Math.max(0, (y - (base - 50)) / 600)) continue
        canvas.set(x, y, IVY[(x + y) % 3])
        if (stone.has(canvas.get(x, y + 1))) canvas.set(x, y + 1, IVY[0])
      }
    }
  }
  return canvas.sprite(cx, base, 0)
}

// A gilded star with eight points on a spire.
function star(canvas: Canvas, x: number, y: number) {
  for (let z = 0; z < 8; z++) canvas.set(x, y + 4 + z, BRASS[1])
  for (let d = -5; d <= 5; d++) {
    const a = Math.abs(d)
    canvas.set(x + d, y, BRASS[a < 2 ? 3 : 2])
    canvas.set(x, y + d, BRASS[a < 2 ? 3 : 2])
    if (a <= 3) {
      canvas.set(x + d, y + d, BRASS[a < 2 ? 3 : 1])
      canvas.set(x + d, y - d, BRASS[a < 2 ? 3 : 1])
    }
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) canvas.set(x + dx, y + dy, BRASS[3])
}

const MOSSY = ramp(0x2a3a1c, 0x3e5226, 0x56682e, 0x6e7e38, 0x889444, 0xa0aa52)
const LOG_WALLS = ramp(0x3a2616, 0x4e3420, 0x6a4a2c, 0x8a6440, 0xa07a50)
const IVY_LEAF = ramp(0x1f3a1c, 0x2e5a26, 0x447a32)

// A low fence of posts and a rail along the front right edge of a 1×1 tile.
function picket(canvas: Canvas, cx: number, base: number, from = 4, to = 30) {
  for (let t = from; t <= to; t++) {
    const x = cx + t
    const ground = base - t / 2
    if (t % 4 === 0) for (let z = 0; z < 7; z++) canvas.set(x, ground - z, z === 6 ? PLANK[4] : PLANK[2])
    canvas.set(x, ground - 4, PLANK[3])
    canvas.set(x, ground - 2, PLANK[1])
  }
}

// Moss and ivy grown over what is drawn in a box: a few greens on roofs and walls.
// `on`: only over these colours (the stone of the walls, not the roofs).
function overgrow(canvas: Canvas, x0: number, y0: number, x1: number, y1: number, share: number, seed: number, on?: Uint32Array) {
  const only = on ? new Set<number>(on) : null
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = canvas.get(x, y)
      if (c >>> 24 === 0 || (only && !only.has(c)) || hash(x >> 1, y >> 1, seed) > share) continue
      canvas.set(x, y, IVY_LEAF[(x + y) % 3])
    }
  }
}

// Houses come in four looks at each level (CLAUDE.md §6.4), picked by the building:
//   0 plaster under red tiles, 1 timber and thatch with a fence, 2 stone under slate, 3 logs under a mossy roof.
// Level 1 is a cottage, level 2 a bigger house (a bread oven, a dormer), level 3 a two-storey house or a manor
// (a wing, a cupola, ivy).
function house(variant: number, level = 1): Sprite {
  const v = variant % 4
  const { canvas, cx, base } = footprint(1, 54 + (level - 1) * 18)
  const roofs = [ROOF, THATCH, SLATE, MOSSY][v]
  const walls = v === 2 || (level === 3 && v === 0) ? KEEP : v === 3 && level === 1 ? LOG_WALLS : WALL
  const masonry = walls === KEEP
  const size = [[22, 14, 16], [26, 22, 20], [27, 30, 22]][level - 1]
  const [w, wall, roof] = size
  const hb = base - 4
  const tops: { x: number; y: number; chimney: boolean }[] = []
  // A stone turret behind the stone manor (level 3, look 2), drawn before the house.
  if (level === 3 && v === 2) finial(canvas, cx - 14, tower(canvas, cx - 14, hb - 22, 6, 44, KEEP, SLATE, true).y, 3)
  if (v === 1 && level >= 1) picket(canvas, cx, base)
  const chimney = v === 3 && level === 1 ? undefined : v === 1 && level === 3 ? 0.5 : 0.42
  const top = hall(canvas, cx, hb, { w, wall, roof, walls, roofs, masonry, bay: level === 1 ? 14 : 10, door: true, chimney, trim: level === 3 && v !== 3 ? BRASS[1] : undefined })
  tops.push(top)
  // A porch on posts by the door of the log cottage.
  if (v === 3 && level === 1) {
    const px = cx - 18
    const py = hb - 4
    for (const dx of [0, 10]) for (let z = 0; z < 10; z++) canvas.set(px + dx, py + dx / 2 - z, TIMBER[1])
    for (let t = -2; t <= 12; t++) for (let d = 0; d < 4; d++) canvas.set(px + t, py + t / 2 - 10 - d, MOSSY[2 - (d === 0 ? 1 : 0)])
  }
  // A domed bread oven by the thatched house.
  if (v === 1 && level === 2) {
    shadeBlobs(canvas, [{ x: cx - 24, y: base - 9, r: 5 }], STONE, 4)
    for (let x = -1; x <= 1; x++) for (let z = 0; z < 3; z++) canvas.set(cx - 24 + x, base - 7 - z, EMBER[1])
  }
  // A dormer on the roof and a garden fence.
  if (v === 3 && level === 2) {
    hall(canvas, cx - 11, hb - wall - 1, { w: 9, wall: 9, roof: 7, walls: WALL, roofs: SLATE, bay: 6 })
    picket(canvas, cx, base, 2, 26)
  }
  // A cupola on the manor's roof, ivy over its walls and a fence round the garden.
  if (v === 3 && level === 3) {
    const cupola = hall(canvas, top.x, top.y + 10, { w: 6, wall: 7, roof: 9, walls: WALL, roofs: SLATE, bay: 0 })
    finial(canvas, cupola.x, cupola.y, 3)
    picket(canvas, cx, base)
  }
  if (v === 3) overgrow(canvas, cx - 30, base - 70 - level * 10, cx + 30, base, level === 1 ? 0.12 : 0.06, 71 + level)
  if (v === 2 && level === 2) picket(canvas, cx, base, 14, 30)
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// Ploughed ground in rows, with a low fence along the two front edges.
// Fields come in three crops (CLAUDE.md §6.4), picked by the building: 0 wheat, 1 flax in blue flower, 2 pumpkins.
// From level 2 the flax field is watered by a ditch across it.
const FLAX = ramp(0x23502a, 0x356e34, 0x4f8c40, 0x6a8ad8)
const PUMPKIN = ramp(0x8a3a10, 0xc8601a, 0xe8862a, 0xf4ac4a)
function farm(variant: number, level = 1): Sprite {
  const { canvas, cx, base, w, h } = footprint(2, 12)
  const v = variant % 3
  const crop = v === 0 ? WHEAT : v === 1 ? FLAX : GREENS
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
      const tall = crop === WHEAT ? 3 + Math.floor(hash(x, y, 41) * 2) : crop === FLAX ? 3 : 2
      for (let z = 0; z < tall; z++) canvas.set(x, y - z, crop[Math.min(crop === FLAX && z < tall - 1 ? 2 : 3, z + (x < cx ? 1 : 0))])
    }
  }
  // Pumpkins lying among the leaves.
  if (v === 2) {
    for (let i = 0; i < 14; i++) {
      const a = (hash(i, 1, 43) - 0.5) * 1.5
      const b = (hash(i, 2, 43) - 0.5) * 1.5
      if (Math.abs(a) + Math.abs(b) > 0.8) continue
      const px = Math.round(cx + a * (w - 8))
      const py = Math.round(base - h + b * (h - 4))
      shadeBlobs(canvas, [{ x: px, y: py - 2, r: 2.5 }], PUMPKIN, i)
      canvas.set(px, py - 5, GREENS[1])
    }
  }
  // A ditch of water across the flax field.
  if (v === 1 && level >= 2) {
    for (let t = -w / 2 + 6; t <= w / 2 - 6; t++) for (let d = 0; d < 3; d++) canvas.set(cx + t, base - h - t / 2 + d - 1, d === 0 ? rgb(0x9ad0e8) : rgb(0x3a7ab8))
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
  return canvas.sprite(cx, base, 0)
}

// What stands on a field from level 2: haystacks and a scarecrow; at level 3 a barn with a haystack by the wheat, a
// shed and a well by the flax, a vine pergola by the pumpkins. Drawn apart from the flat field so it sorts with the
// buildings around it (see structureParts).
function farmProps(level: number, variant = 0): Sprite {
  const v = variant % 3
  const { canvas, cx, base, h } = footprint(2, level === 3 ? 50 : 22)
  if (level === 3 && v === 0) {
    hall(canvas, cx + 26, base - h - 4, { w: 18, wall: 12, roof: 14, walls: LOG_WALLS, roofs: THATCH, door: true })
    haystack(canvas, cx - 26, base - h - 6)
    haystack(canvas, cx - 18, base - h - 2)
  } else if (level === 3 && v === 1) {
    hall(canvas, cx + 24, base - h - 4, { w: 16, wall: 12, roof: 12, walls: LOG_WALLS, roofs: SHINGLE, door: true })
    // A stone well with a little roof.
    const wx = cx - 22
    const wy = base - h - 2
    shadeBlobs(canvas, [{ x: wx, y: wy - 3, r: 4 }], STONE, 9)
    for (const dx of [-3, 3]) for (let z = 4; z < 13; z++) canvas.set(wx + dx, wy - z, TIMBER[1])
    for (let dx = -5; dx <= 5; dx++) for (let d = 0; d < 2; d++) canvas.set(wx + dx, wy - 13 - d + Math.abs(dx) * 0.4, SHINGLE[3 - d])
  } else if (level === 3) {
    // A pergola of vines on posts.
    const px = cx + 12
    const py = base - h - 6
    for (const [dx, dy] of [[0, 0], [16, -8], [-8, -4], [8, -12]]) for (let z = 0; z < 14; z++) canvas.set(px + dx, py + dy - z, TIMBER[1])
    shadeBlobs(canvas, [{ x: px + 4, y: py - 18, r: 6 }, { x: px + 12, y: py - 22, r: 5 }, { x: px - 2, y: py - 20, r: 4 }], GREENS, 13)
    for (let i = 0; i < 6; i++) canvas.set(px - 2 + i * 3, py - 14 + (i % 2), FRUIT[3])
    haystack(canvas, cx - 24, base - h - 4)
  } else {
    for (const [dx, dy] of [[-30, -6], [-20, -11]]) haystack(canvas, cx + dx, base - h + dy)
    scarecrow(canvas, cx + 14, base - h + 6)
    if (v === 2) barrel(canvas, cx + 26, base - h - 4)
  }
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
// Lumber camps come in two looks at each level (CLAUDE.md §6.4), picked by the building: 0 a woodcutter's house
// (thatch, then a red-roofed sawmill, then a stone hall), 1 open sheds on posts with saws and stacked logs.
function logPile(canvas: Canvas, px: number, py: number, rows: readonly (readonly [number, number])[]) {
  for (const [row, count] of rows) for (let i = 0; i < count; i++) log(canvas, px + i * 5 + row * 2.5, py + i * 2.5 - row * 4 + row * 1.25, 18)
}
function sawhorse(canvas: Canvas, x: number, base: number) {
  for (const dx of [0, 10]) for (let z = 0; z < 7; z++) { canvas.set(x + dx - z * 0.3, base + dx / 2 - z, TIMBER[1]); canvas.set(x + dx + z * 0.3, base + dx / 2 - z, TIMBER[1]) }
  log(canvas, x - 4, base - 9, 16)
}
function stump(canvas: Canvas, sx: number, sy: number) {
  for (let x = -3; x <= 3; x++) for (let z = 0; z < 4; z++) canvas.set(sx + x, sy - z, z === 3 ? CUT[1] : BARK[x < 0 ? 2 : 1])
  for (let z = 0; z < 7; z++) canvas.set(sx + 1 + z * 0.4, sy - 4 - z, TIMBER[2])
  for (let d = 0; d < 3; d++) canvas.set(sx + 3 + d * 0.3, sy - 11 + d, STONE[4])
}
function bigSaw(canvas: Canvas, x: number, y: number) {
  for (let t = 0; t < 22; t++) {
    canvas.set(x + t, y + t / 2, STEEL_GREY[2])
    canvas.set(x + t, y + t / 2 + 1, t % 2 ? STEEL_GREY[1] : STEEL_GREY[3])
  }
  for (const t of [0, 21]) for (let z = 0; z < 4; z++) canvas.set(x + t, y + t / 2 - z, TIMBER[2])
}

function lumberCamp(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 56 + (level - 1) * 14)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  if (v === 0) {
    const style =
      level === 1
        ? { w: 30, wall: 14, roof: 16, walls: LOG_WALLS, roofs: THATCH, bay: 0 }
        : level === 2
          ? { w: 36, wall: 20, roof: 20, walls: LOG_WALLS, roofs: ROOF, bay: 12 }
          : { w: 40, wall: 24, roof: 22, walls: KEEP, roofs: SLATE, masonry: true, bay: 12 }
    tops.push(hall(canvas, cx + 6, base - h - 2, { ...style, door: true, chimney: 0.35 }))
    logPile(canvas, cx - 44, base - h - 6, [[0, 3], [1, 2], [2, 1]])
    if (level >= 2) logPile(canvas, cx - 30, base - h + 6, [[0, 3], [1, 2]])
    stump(canvas, cx + 16, base - 10)
    if (level >= 2) bigSaw(canvas, cx - 8, base - 12)
    if (level === 3) cart(canvas, cx + 18, base - 4)
  } else {
    // Open sheds on posts: a small one at level 1, a shelter with saws hung up at 2, a long shed full of logs at 3.
    const shed =
      level === 1
        ? { w: 24, wall: 16, roof: 12, roofs: THATCH }
        : level === 2
          ? { w: 32, wall: 20, roof: 14, roofs: SHINGLE }
          : { w: 44, wall: 22, roof: 16, roofs: SLATE }
    hall(canvas, cx + 4, base - h + 2, { ...shed, walls: WALL, open: true, roofed: true })
    // Logs stacked under the roof.
    logPile(canvas, cx - 16 - (level - 1) * 4, base - h - 4 - (level - 1) * 2, level === 3 ? [[0, 5], [1, 4], [2, 3]] : level === 2 ? [[0, 4], [1, 3], [2, 1]] : [[0, 3], [1, 2]])
    sawhorse(canvas, cx - 34, base - 14)
    if (level >= 2) bigSaw(canvas, cx - 18, base - 8)
    if (level === 3) {
      barrel(canvas, cx + 24, base - 10)
      // A fire pit.
      shadeBlobs(canvas, [{ x: cx + 10, y: base - 5, r: 4 }], STONE, 3)
      for (let x = -2; x <= 2; x++) for (let z = 0; z < 4 - Math.abs(x); z++) canvas.set(cx + 10 + x, base - 6 - z, EMBER[z > 1 ? 2 : 1])
    }
    stump(canvas, cx + 20, base - 6)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// A chimney of stone standing on (x, foot), `tall` pixels; returns its top for the smoke.
function stack(canvas: Canvas, x: number, foot: number, tall: number, width = 5) {
  for (let z = 0; z < tall; z++) for (let dx = 0; dx < width; dx++) canvas.set(x + dx, foot - z, z > tall - 3 ? STONE[1] : dx < width / 2 ? STONE[4] : STONE[2])
  return { x: x + width / 2, y: foot - tall, chimney: true }
}

// An anvil standing on (x, base).
function anvil(canvas: Canvas, ax: number, ay: number) {
  for (let x = -4; x <= 4; x++) canvas.set(ax + x, ay - 5, STEEL_GREY[3])
  for (let x = -3; x <= 3; x++) canvas.set(ax + x, ay - 4, STEEL_GREY[2])
  for (let z = 0; z < 4; z++) for (let x = -1; x <= 1; x++) canvas.set(ax + x, ay - z, STEEL_GREY[z === 0 ? 0 : 1])
}

// A suit of armour on a stand, on (x, base).
function armour(canvas: Canvas, x: number, base: number) {
  for (let z = 0; z < 3; z++) canvas.set(x, base - z, TIMBER[1])
  for (let z = 3; z < 11; z++) for (let dx = -2; dx <= 2; dx++) canvas.set(x + dx, base - z, STEEL_GREY[dx < 0 ? 3 : z % 3 === 0 ? 1 : 2])
  for (let dx = -1; dx <= 1; dx++) for (let z = 11; z < 14; z++) canvas.set(x + dx, base - z, STEEL_GREY[dx < 0 ? 3 : 1])
}

// A water wheel turning by the wall, its centre at (x, y).
function waterWheel(canvas: Canvas, x: number, y: number, r = 11) {
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2
    for (const rr of [r, r - 1]) canvas.set(x + Math.round(Math.cos(t) * rr * 0.5), y + Math.round(Math.sin(t) * rr), PLANK[rr === r ? 1 : 3])
  }
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2
    for (let d = 0; d < r; d++) canvas.set(x + Math.round(Math.cos(t) * d * 0.5), y + Math.round(Math.sin(t) * d), TIMBER[1])
  }
  for (let dx = -8; dx <= 8; dx++) for (let d = 0; d < 3; d++) canvas.set(x + dx, y + r + d, d === 0 ? rgb(0x9ad0e8) : rgb(0x3a7ab8))
}

// The weapon forge (CLAUDE.md §6.4) in three looks at each level, picked by the building:
//   0 a dark stone smithy under slate (two chimneys and a glowing door at 2, gilded trim, racks and a cart at 3),
//   1 a stone-and-timber forge with an anvil out front (a lean-to at 2, a water wheel and armour at 3),
//   2 a timber workshop (an open forge under its roof at 2, a gilded hall with banners at 3).
function forge(variant = 0, level = 1): Sprite {
  const v = variant % 3
  const { canvas, cx, base } = footprint(2, 82 + (level - 1) * 16)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  const tall = (level - 1) * 5
  if (v === 0) {
    const top = hall(canvas, cx, base - 4, { w: 52 + (level - 1) * 2, wall: 24 + tall, roof: 26 + tall, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 16, glow: true, door: true, chimney: 0.35, trim: level === 3 ? BRASS[1] : undefined })
    tops.push(top)
    if (level >= 2) tops.push(stack(canvas, cx + 14, base - 4 - 24 - tall - 18, 20))
    anvil(canvas, cx - 22, base - 6)
    if (level >= 2) rack(canvas, cx + 24, base - 6)
    if (level === 3) {
      cart(canvas, cx - 40, base - 8)
      drape(canvas, cx, base - 4, 54, 1, 10, 24 + tall - 2, 14)
    }
  } else if (v === 1) {
    const walls = level === 1 ? DARK_STONE : KEEP
    const top = hall(canvas, cx + 6, base - 10, { w: 44, wall: 22 + tall, roof: 22 + tall, walls, roofs: SHINGLE, masonry: true, bay: 14, glow: true, door: true, chimney: 0.4 })
    tops.push(top)
    if (level >= 2) {
      // A lean-to over the anvil and a grindstone.
      hall(canvas, cx - 24, base - 6, { w: 16, wall: 14, roof: 8, walls: WALL, roofs: SHINGLE, open: true, roofed: true })
      shadeBlobs(canvas, [{ x: cx - 6, y: base - 8, r: 3.5 }], STONE, 11)
    }
    anvil(canvas, cx - 16, base - 3)
    barrel(canvas, cx + 22, base - 8)
    if (level === 3) {
      waterWheel(canvas, cx + 46, base - 30)
      tops.push(stack(canvas, cx + 20, base - 10 - 22 - tall - 20, 22))
      for (const dx of [-30, -38]) armour(canvas, cx + dx, base - 10 - (dx + 38) / 4)
    }
  } else {
    const roofs = level === 3 ? SLATE : SHINGLE
    const walls = level === 3 ? KEEP : WALL
    const top = hall(canvas, cx + 4, base - 8, { w: 46, wall: 24 + tall * 2, roof: 22, walls, roofs, masonry: level === 3, bay: 12, glow: level >= 2, door: true, chimney: 0.45, trim: level === 3 ? BRASS[2] : undefined })
    tops.push(top)
    if (level >= 2) {
      // An open forge under a lean-to at the front, its hearth glowing.
      hall(canvas, cx - 22, base - 4, { w: 18, wall: 14, roof: 10, walls: WALL, roofs, open: true, roofed: true })
      for (let x = 0; x < 9; x++) for (let z = 0; z < 7; z++) canvas.set(cx - 28 + x, base - 12 - z, z > 4 ? STONE[2] : x > 1 && x < 7 && z > 1 ? EMBER[z > 3 ? 2 : 1] : STONE[1])
    }
    if (level === 3) {
      for (const side of [-1, 1]) drape(canvas, cx + 4, base - 8, 46, side, 8, 24 + tall * 2 - 2, 16)
      cart(canvas, cx + 18, base - 4)
    }
    crate(canvas, cx + 24, base - 12, 9)
    anvil(canvas, cx - 10, base - 2)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
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

const CHAR = ramp(0x120c0a, 0x1e1410, 0x2c1e16, 0x3a2a1e)

// The trade post grows with the post's level (CLAUDE.md §6.4), in two looks per level picked by the building:
//   1A a grain stall under thatch with a red awning; 1B a cloth stall under shingles with a blue awning;
//   2A a two-storey caravanserai with a market awning and a cart; 2B a smithy and ore trader with an open forge;
//   3A a great inn and guild hall with a bell tower and banners; 3B a depot: a long open shed full of barrels.
const SHINGLE = ramp(0x3a3026, 0x52463a, 0x6a5c4c, 0x82735f, 0x9a8a74, 0xb2a28a)
const BLUE_STRIPE = ramp(0x2a4a8a, 0xe9dcc0)
const CLAY = ramp(0x6a3418, 0x9a5228, 0xc0743c, 0xd8966a)
const STEEL_GREY = ramp(0x3c4048, 0x6a707a, 0xa8b0bc, 0xd6dae0)

// An awning sloping out from the left wall of a hall on (cx, hb), striped in `stripes` (two colours).
function awning(canvas: Canvas, cx: number, hb: number, hw: number, stripes: Uint32Array, from: number, to: number, z = 20, out = 13) {
  for (let t = from; t <= to; t += 0.5) {
    for (let d = 0; d <= out; d += 0.5) {
      const x = cx - (hw - t) - d * 0.9
      const y = hb - hw / 2 + t / 2 - z + d * 0.85
      const scallop = d > out - 2 && Math.floor(t / 3) % 2 === 0
      if (d > out - 1 && !scallop) continue
      canvas.set(x, y, Math.floor(t / 5) % 2 === 0 ? stripes[1] : stripes[0])
    }
  }
}

// A counter along the left wall under an awning, heaped with fruit and grain or with bolts of cloth.
function counter(canvas: Canvas, cx: number, hb: number, hw: number, from: number, to: number, goods: 'food' | 'cloth') {
  for (let t = from; t <= to; t++) {
    const x = cx - (hw - t) - 6
    const y = hb - hw / 2 + t / 2 + 3
    for (let z = 0; z < 7; z++) canvas.set(x, y - z, z === 6 ? PLANK[4] : PLANK[z < 2 ? 1 : 2])
    if (goods === 'food') {
      if (hash(t, 1, 71) > 0.3) canvas.set(x, y - 7, FRUIT[Math.floor(hash(t, 2, 71) * FRUIT.length)])
      if (hash(t, 3, 71) > 0.55) canvas.set(x, y - 8, FRUIT[Math.floor(hash(t, 4, 71) * FRUIT.length)])
    } else {
      const bolt = CLOTH[Math.floor(t / 4) % CLOTH.length]
      for (let z = 7; z < 10; z++) canvas.set(x, y - z, bolt[z === 9 ? 3 : 2])
    }
  }
}

// A two-wheeled cart standing on (x, base), loaded with sacks.
function cart(canvas: Canvas, x: number, base: number) {
  for (let i = 0; i < 18; i++) for (let z = 4; z < 9; z++) canvas.set(x + i, base - z - Math.round(i * 0.3), z === 8 || i === 0 || i === 17 ? PLANK[1] : PLANK[3])
  for (let i = 0; i < 10; i++) canvas.set(x - 10 + i, base - 6 + Math.round(i * 0.2), TIMBER[1])
  for (let a = 0; a < 28; a++) {
    const t = (a / 28) * Math.PI * 2
    canvas.set(x + 8 + Math.round(Math.cos(t) * 4), base - 3 + Math.round(Math.sin(t) * 4), TIMBER[0])
  }
  canvas.set(x + 8, base - 3, TIMBER[2])
  shadeBlobs(canvas, [{ x: x + 5, y: base - 11, r: 3 }, { x: x + 11, y: base - 13, r: 3.5 }], SACK, 5)
}

function tradePostLevel(variant: number, level: number): Sprite {
  const b = variant % 2 === 1
  const { canvas, cx, base, h } = footprint(2, 60 + level * 26)
  if (level === 1) {
    // A stall: corner posts under a pyramid roof, an awning off its side, goods on the counter and on the ground.
    yard(canvas, cx, base, h, b ? KEEP : SACK, b ? 33 : 34)
    const hb = base - 12
    const hw = 34
    hall(canvas, cx, hb, { w: hw, wall: 20, roof: 24, walls: WALL, roofs: b ? SHINGLE : THATCH, open: true, roofed: true })
    awning(canvas, cx, hb, hw, b ? BLUE_STRIPE : STRIPE, 4, hw - 4, 16, 12)
    counter(canvas, cx, hb, hw, 6, hw - 6, b ? 'cloth' : 'food')
    if (b) {
      // Pots and jars by the corner.
      for (const [dx, dy] of [[10, -6], [16, -9], [4, -4]]) shadeBlobs(canvas, [{ x: cx + dx, y: base + dy - 3, r: 3 }], CLAY, dx)
      for (let i = 0; i < 3; i++) for (let z = 0; z < 4; z++) for (let x = 0; x < 6; x++) canvas.set(cx + 20 + x, base - 12 - i * 4 - z, CLOTH[i % CLOTH.length][x < 3 ? 3 : 1])
    } else {
      shadeBlobs(canvas, [{ x: cx + 8, y: base - 6, r: 4 }, { x: cx + 14, y: base - 9, r: 4 }, { x: cx + 11, y: base - 12, r: 3.5 }], SACK, 3)
      // A basket of grain.
      for (let dx = -4; dx <= 4; dx++) for (let z = 0; z < 5; z++) canvas.set(cx + 22 + dx, base - 10 - z, z === 4 ? WHEAT[3] : PLANK[Math.abs(dx) === 4 ? 1 : 2])
    }
    return canvas.sprite(cx, base, 0)
  }
  if (level === 2 && !b) {
    // The caravanserai: a two-storey timber hall with a market awning, a cart before it.
    yard(canvas, cx, base, h, KEEP, 35)
    const hb = base - 12
    const hw = 42
    const top = hall(canvas, cx, hb, { w: hw, wall: 34, roof: 24, walls: WALL, roofs: ROOF, bay: 11, door: true, chimney: 0.42 })
    awning(canvas, cx, hb, hw, STRIPE, 6, hw - 6, 18, 13)
    counter(canvas, cx, hb, hw, 8, hw - 8, 'food')
    cart(canvas, cx + 12, base - 4)
    barrel(canvas, cx + 30, base - 14)
    banner(canvas, top.x, top.y, 10)
    return smoky(canvas.sprite(cx, base, 0), [top])
  }
  if (level === 2) {
    // The smithy and ore trader: a stone forge house with an open lean-to over the anvil, ore heaped by the door.
    yard(canvas, cx, base, h, KEEP, 36)
    const hb = base - 18
    const hw = 34
    const top = hall(canvas, cx + 10, hb, { w: hw, wall: 26, roof: 22, walls: KEEP, roofs: SHINGLE, masonry: true, bay: 12, door: true, chimney: 0.35 })
    // An open smithy shed off the front left, the hearth glowing inside and the anvil before it.
    hall(canvas, cx - 22, base - 8, { w: 18, wall: 16, roof: 12, walls: WALL, roofs: SHINGLE, open: true, roofed: true })
    const fx = cx - 26
    const fy = base - 16
    for (let x = 0; x < 9; x++) for (let z = 0; z < 8; z++) canvas.set(fx + x, fy - z, z > 5 ? STONE[2] : x > 1 && x < 7 && z > 1 ? EMBER[z > 3 ? 2 : 1] : STONE[1])
    const ax = cx - 12
    const ay = base - 4
    for (let x = -4; x <= 4; x++) canvas.set(ax + x, ay - 5, STEEL_GREY[3])
    for (let x = -3; x <= 3; x++) canvas.set(ax + x, ay - 4, STEEL_GREY[2])
    for (let z = 0; z < 4; z++) for (let x = -1; x <= 1; x++) canvas.set(ax + x, ay - z, STEEL_GREY[z === 0 ? 0 : 1])
    // Ore heaps and a crate of ingots.
    shadeBlobs(canvas, [{ x: cx + 6, y: base - 6, r: 5 }, { x: cx + 13, y: base - 9, r: 4 }], DARK_STONE, 7)
    crate(canvas, cx + 22, base - 14, 9)
    for (let x = 0; x < 6; x++) canvas.set(cx + 23 + x, base - 22, BRASS[2])
    return smoky(canvas.sprite(cx, base, 0), [top])
  }
  if (!b) {
    // The great inn and guild hall: a tall timber hall, a wing, a bell turret, guild banners and a stall.
    yard(canvas, cx, base, h, KEEP, 37)
    const wing = hall(canvas, cx + 26, base - 30, { w: 24, wall: 26, roof: 18, walls: WALL, roofs: ROOF, bay: 10, chimney: 0.4 })
    const hb = base - 10
    const hw = 40
    const top = hall(canvas, cx - 4, hb, { w: hw, wall: 38, roof: 26, walls: WALL, roofs: ROOF, bay: 10, door: true })
    const bell = tower(canvas, top.x, top.y + 2, 5, 14, WALL, ROOF)
    finial(canvas, bell.x, bell.y, 3)
    for (const side of [-1, 1]) drape(canvas, cx - 4, hb, hw, side, 10, 34, 16)
    awning(canvas, cx - 4, hb, hw, BLUE_STRIPE, 18, hw - 4, 16, 11)
    counter(canvas, cx - 4, hb, hw, 20, hw - 6, 'cloth')
    barrel(canvas, cx + 18, base - 6)
    barrel(canvas, cx + 25, base - 9)
    banner(canvas, wing.x, wing.y, 9)
    return smoky(canvas.sprite(cx, base, 0), [wing])
  }
  // The depot: a long open shed on posts under a red roof, barrels and crates stacked under it and around it.
  yard(canvas, cx, base, h, SACK, 38)
  const hb = base - 8
  const hw = 46
  hall(canvas, cx, hb, { w: hw, wall: 26, roof: 22, walls: WALL, roofs: ROOF, open: true, roofed: true })
  for (let i = 0; i < 5; i++) barrel(canvas, cx - 30 + i * 7, base - 22 + i * 3)
  for (let i = 0; i < 3; i++) barrel(canvas, cx - 27 + i * 7, base - 30 + i * 3)
  crate(canvas, cx + 6, base - 12, 10)
  crate(canvas, cx + 14, base - 16, 10)
  crate(canvas, cx + 9, base - 22, 8)
  cart(canvas, cx + 22, base - 4)
  shadeBlobs(canvas, [{ x: cx - 6, y: base - 6, r: 4 }, { x: cx - 1, y: base - 8, r: 3.5 }], SACK, 9)
  banner(canvas, cx, hb - hw / 2 - 26 - 18, 10)
  return canvas.sprite(cx, base, 0)
}

// Any building wrecked by raiders, made from its sound look so the two always match: soot over walls and roof, a hole
// burnt through the roof near its peak with smoke rising from it, broken planks and embers strewn at its foot.
function ruinOf(sound: Sprite, seed: number): Sprite {
  const canvas = new Canvas(sound.width, sound.height)
  canvas.pixels.set(sound.pixels)
  const solid = (x: number, y: number) => canvas.get(x, y) >>> 24 === 0xff
  // The peak: the highest solid pixel near the middle.
  let peak = { x: sound.anchorX, y: sound.height }
  for (let y = 0; y < sound.height && peak.y === sound.height; y++) for (let x = sound.anchorX - 12; x <= sound.anchorX + 12; x++) if (solid(x, y)) peak = { x, y }
  const bottom = sound.anchorY
  const span = bottom - peak.y
  // Soot in dithered patches, thickest at their middle.
  for (let i = 0; i < 8; i++) {
    const bx = sound.anchorX + Math.round((hash(i, 1, seed) - 0.5) * sound.width * 0.7)
    const by = peak.y + Math.round(span * (0.2 + hash(i, 2, seed) * 0.5))
    const r = Math.round(9 + hash(i, 3, seed) * 10)
    for (let y = by - r; y <= by + r; y++) {
      for (let x = bx - r; x <= bx + r; x++) {
        const d = Math.hypot(x - bx, (y - by) * 1.4) / r
        if (d > 1 || !solid(x, y)) continue
        if (hash(x, y, 97 + seed) > 0.35 + d * 0.55) canvas.set(x, y, CHAR[(x + y) & 1 ? 1 : 3])
      }
    }
  }
  // A hole burnt through the roof, glowing at its edge, charred rafters across it.
  const hx = peak.x + 5
  const hy = peak.y + Math.max(10, Math.round(span * 0.22))
  for (let y = -5; y <= 5; y++) {
    for (let x = -8; x <= 8; x++) {
      const d = (x * x) / 64 + (y * y) / 25
      if (d <= 1 && solid(hx + x, hy + y)) canvas.set(hx + x, hy + y, d > 0.7 ? EMBER[hash(x, y, 91) > 0.5 ? 1 : 0] : CHAR[0])
    }
  }
  for (let x = -7; x <= 7; x++) if (solid(hx + x, hy - 1 + Math.round(x * 0.4))) canvas.set(hx + x, hy - 1 + Math.round(x * 0.4), TIMBER[0])
  // Broken planks and embers at the foot.
  for (let i = 0; i < 5; i++) {
    const dx = Math.round((hash(i, 5, seed) - 0.5) * sound.width * 0.5)
    const dy = -2 - Math.round(hash(i, 6, seed) * 10)
    for (let t = 0; t < 7 + (i % 3) * 2; t++) canvas.set(sound.anchorX + dx + t, bottom + dy + Math.round(t * 0.4), PLANK[t % 3 === 0 ? 0 : 2])
    canvas.set(sound.anchorX + dx + 3, bottom + dy - 2, EMBER[2])
  }
  const sprite = canvas.sprite(sound.anchorX, sound.anchorY, sound.shadow)
  return smoky(sprite, [{ x: hx, y: hy - 2, chimney: true }])
}

// The wrecked trade post at each level, in both its looks.
const ruinedTrade = new Map<number, Sprite[]>()
const ruinedTradeAt = (level: number) => {
  if (!ruinedTrade.has(level)) ruinedTrade.set(level, [0, 1].map((v) => ruinOf(level > 1 ? LEVEL_SPRITES.tradePost![level - 2][v] : STRUCTURE_SPRITES.tradePost[v], 40 + level * 2 + v)))
  return ruinedTrade.get(level)!
}


const REEDS = ramp(0x34452a, 0x516634, 0x748a42, 0x5a3d26)

// A rowboat pulled up on the shore, its bow towards (x, y).
function rowboat(canvas: Canvas, x: number, y: number, length = 18) {
  for (let t = 0; t < length; t++) {
    const half = Math.round(Math.sin((t / (length - 1)) * Math.PI) * 4)
    for (let d = -half; d <= half; d++) {
      const rim = Math.abs(d) === half
      canvas.set(x + t, y + t / 2 + d * 0.5 + Math.abs(d) * 0.4, rim ? PLANK[1] : d < 0 ? PLANK[3] : TIMBER[0])
    }
  }
  for (let d = -3; d <= 3; d++) canvas.set(x + 9, y + 4 + d * 0.5, PLANK[2])
}

// A drying rack of fish standing on (rx, ry).
function fishRack(canvas: Canvas, rx: number, ry: number) {
  for (const x of [0, 18]) for (let z = 0; z < 14; z++) canvas.set(rx + x, ry + x / 2 - z, TIMBER[2])
  for (let x = 0; x <= 18; x++) {
    canvas.set(rx + x, ry + x / 2 - 13, TIMBER[1])
    if (x % 3 === 1) for (let z = 0; z < 4; z++) canvas.set(rx + x, ry + x / 2 - 12 + z, z === 3 ? STONE[2] : STONE[4])
  }
}

function net(canvas: Canvas, x: number, y: number) {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) if ((dx * dx) / 25 + (dy * dy) / 4 <= 1) canvas.set(x + dx, y + dy, (dx + dy) % 2 === 0 ? SACK[3] : SACK[1])
}

// The dock's shore building (CLAUDE.md §6.4; its jetty is drawn apart, over the water) in three looks per level,
// picked by the building:
//   level 1: a thatched fishing shed with a rack of fish; a mossy shed with a rowboat on the shore; a stone hut in
//     the reeds;
//   level 2: a red-roofed boathouse with barrels; a timber crane over stacked crates; a little lighthouse;
//   level 3: a great slate hall with a moored sailboat's mast; a fish market under an awning with pennants; a
//     smokehouse with a tall chimney.
function dock(variant = 0, level = 1): Sprite {
  const v = variant % 3
  const { canvas, cx, base, h } = footprint(2, 66 + (level - 1) * 22)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  const hx = cx + 10
  const hy = base - h + 4
  if (level === 1) {
    const roofs = v === 0 ? THATCH : v === 1 ? MOSSY : MOSSY
    const walls = v === 2 ? DARK_STONE : LOG_WALLS
    tops.push(hall(canvas, hx, hy, { w: 30, wall: 16, roof: 18, walls, roofs, masonry: v === 2, bay: 12, door: true, chimney: 0.4 }))
    if (v === 0) fishRack(canvas, cx - 34, base - h + 6)
    if (v === 1) rowboat(canvas, cx - 36, base - h + 2)
    if (v === 2) for (let i = 0; i < 14; i++) for (let z = 0; z < 6 + (i % 3) * 2; z++) canvas.set(cx - 34 + i * 2, base - h + 8 + i - z, REEDS[z > 5 ? 2 : 1])
    net(canvas, cx - 6, base - 8)
    if (v === 1) overgrow(canvas, hx - 34, hy - 50, hx + 34, hy, 0.06, 31)
  } else if (level === 2) {
    if (v === 0) {
      tops.push(hall(canvas, hx, hy, { w: 34, wall: 22, roof: 20, walls: LOG_WALLS, roofs: ROOF, bay: 12, door: true, chimney: 0.4 }))
      for (const dx of [16, 24]) barrel(canvas, cx + dx, base - 9 + dx / 4)
      rowboat(canvas, cx - 36, base - h + 4)
    } else if (v === 1) {
      // A crane: a post and a jib with a rope and hook, crates stacked by it.
      const px = cx - 6
      const py = base - h + 10
      for (let z = 0; z < 40; z++) for (const dx of [-1, 0, 1, 2]) canvas.set(px + dx, py - z, TIMBER[dx < 1 ? 2 : 1])
      for (let t = 0; t < 24; t++) for (const d of [0, 1]) canvas.set(px - t, py - 38 + d + Math.round(t * 0.2), TIMBER[1 + d])
      for (let z = 0; z < 22; z++) canvas.set(px - 22, py - 33 + z, SACK[2])
      for (let d = 0; d < 3; d++) canvas.set(px - 22 + d - 1, py - 11 + Math.abs(d - 1), STEEL_GREY[2])
      for (let t = 0; t < 12; t++) canvas.set(px + t * 0.6, py - 38 + t * 2.6, TIMBER[0])
      crate(canvas, cx + 6, base - 12, 10)
      crate(canvas, cx + 14, base - 16, 10)
      crate(canvas, cx + 10, base - 24, 8)
      barrel(canvas, cx - 30, base - 10)
    } else {
      // A little lighthouse with a lit lantern, nets and barrels at its foot.
      const tw = tower(canvas, hx + 6, hy - 6, 10, 46, KEEP, ROOF, true)
      for (let y = 0; y < 4; y++) for (let x = -3; x <= 3; x++) canvas.set(tw.x + x, tw.y + 20 + y, EMBER[y < 2 ? 2 : 1])
      finial(canvas, tw.x, tw.y, 3)
      net(canvas, cx - 18, base - 10)
      barrel(canvas, cx - 4, base - 8)
      barrel(canvas, cx + 4, base - 12)
    }
  } else {
    if (v === 0) {
      // A sailboat's mast and sail rising behind the hall.
      const mx = cx - 30
      const my = base - h - 6
      for (let z = 0; z < 62; z++) canvas.set(mx, my - z, TIMBER[1])
      for (let z = 0; z < 50; z++) for (let d = 0; d < Math.round((z / 50) * 20); d++) canvas.set(mx + 1 + d, my - 60 + z, d === 0 ? WALL[2] : WALL[4 - (d % 5 === 0 ? 1 : 0)])
      tops.push(hall(canvas, hx, hy, { w: 40, wall: 26, roof: 24, walls: LOG_WALLS, roofs: SLATE, bay: 12, door: true, chimney: 0.45 }))
      for (const dx of [14, 22, 30]) barrel(canvas, cx + dx, base - 9 + dx / 4)
    } else if (v === 1) {
      tops.push(hall(canvas, hx, hy, { w: 38, wall: 24, roof: 22, walls: LOG_WALLS, roofs: SLATE, bay: 12, door: true }))
      awning(canvas, hx, hy, 38, BLUE_STRIPE, 6, 34, 18, 12)
      counter(canvas, hx, hy, 38, 8, 32, 'food')
      for (const [dx, c] of [[-40, FLAG], [-22, BLUE_STRIPE]] as const) {
        for (let z = 0; z < 26; z++) canvas.set(cx + dx, base - 8 - z, TIMBER[1])
        for (let y = 0; y < 5; y++) for (let x = 1; x <= 8 - y; x++) canvas.set(cx + dx + x, base - 34 + y, c[y < 2 ? 1 : 0])
      }
      rowboat(canvas, cx + 4, base - 12)
    } else {
      tops.push(hall(canvas, hx, hy, { w: 38, wall: 26, roof: 22, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 12, glow: true, door: true }))
      tops.push(stack(canvas, hx + 16, hy - 26 - 14, 26, 6))
      fishRack(canvas, cx - 36, base - h + 6)
      for (const dx of [14, 22]) barrel(canvas, cx + dx, base - 9 + dx / 4)
      net(canvas, cx - 6, base - 8)
    }
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// Plank jetty `w`×`h` tiles over the water, its planks across direction `along`; the deck stands `lift` pixels above
// the water; `outward` when it leaves the bank at its low end (toward +x or +y). Anchored at its front corner on the
// water surface.
const ROPE = rgb(0xc8b07a)
function pier(w: number, h: number, along: 'x' | 'y', lift: number, outward = true): Sprite {
  // Room round the deck for what stands on a big jetty (its crane reaches out past the end), or above a small one.
  const room = w * h >= 6 ? 72 : 0
  const width = Math.ceil((w + h) * (TILE_WIDTH / 2)) + 8 + room * 2
  const height = Math.ceil((w + h) * (TILE_HEIGHT / 2)) + lift + 8 + room + (room ? 0 : 18)
  const canvas = new Canvas(width, height)
  const ax = Math.round(w * (TILE_WIDTH / 2)) + 4 + room
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
  // Mooring bollards along both edges and at the far end.
  const bollard = (a: number, c: number) => {
    const [u, v] = uv(a, c)
    const p = at(u, v, lift)
    for (let z = 0; z < 4; z++) for (const dx of [0, 1]) canvas.set(p.x + dx, p.y - z, z === 3 ? LOGS[3] : LOGS[dx === 0 ? 2 : 1])
  }
  for (const c of [0.12, across - 0.12]) {
    bollard(long - 0.12, c)
    for (let a = 1.2; a < long - 0.6; a += 1.6) bollard(a, c)
  }
  // Crates (`size` tiles from the middle to a side, `tall` pixels) and barrels standing on the deck.
  const box = (a: number, c: number, size: number, tall: number, z0 = 0) => {
    const step = Math.min(1 / 40, size / 6)
    for (let z = 0; z < tall; z++) {
      for (let da = -size; da <= size; da += step) {
        for (let dc = -size; dc <= size; dc += step) {
          const [u, v] = uv(a + da, c + dc)
          const p = at(u, v, lift + z0 + z)
          const edge = Math.abs(da) > size - 0.03 || Math.abs(dc) > size - 0.03 || z === tall - 1
          canvas.set(p.x, p.y, z === tall - 1 ? PLANK[edge ? 2 : 4] : edge ? PLANK[0] : (along === 'x') === (dc > 0) ? PLANK[3] : PLANK[2])
        }
      }
    }
  }
  const keg = (a: number, c: number, tall = 9, half = 3) => {
    const [u, v] = uv(a, c)
    const p = at(u, v, lift)
    for (let z = 0; z < tall; z++) for (let dx = -half; dx <= half; dx++) canvas.set(p.x + dx, p.y - z, z === tall - 1 ? PLANK[4] : z % 3 === 1 ? LOGS[0] : PLANK[dx < 0 ? 3 : 1])
  }
  // A small jetty (a lord's dock) is a fisher's landing: a crate or two and a barrel by the bank, a coil of rope, a
  // basket of the catch and nets drying, a lantern on a post at the far end.
  if (long * across < 6) {
    const things: [number, () => void][] = []
    // Measured from the bank.
    const from = (a: number) => (outward ? a : long - a)
    const put = (a: number, c: number, draw: () => void) => {
      const [u, v] = uv(a, c)
      things.push([u + v, draw])
    }
    put(from(0.35), across * 0.3, () => {
      box(from(0.35), across * 0.3, 0.13, 7)
      box(from(0.35), across * 0.3, 0.1, 5, 7)
    })
    put(from(0.38), across * 0.72, () => keg(from(0.38), across * 0.72, 8, 3))
    // Rope coiled in rings on the planks.
    put(from(long * 0.55), across * 0.28, () => {
      const [u, v] = uv(from(long * 0.55), across * 0.28)
      const p = at(u, v, lift)
      for (let ring = 0; ring < 2; ring++) {
        for (let k = 0; k < 24; k++) {
          const t = (k / 24) * Math.PI * 2
          canvas.set(p.x + Math.round(Math.cos(t) * (5 - ring * 2)), p.y - ring + Math.round(Math.sin(t) * (2.5 - ring)), ring ? ROPE : PLANK[1])
        }
      }
      canvas.set(p.x, p.y - 1, ROPE)
    })
    // A wicker basket of silver fish.
    put(from(long * 0.62), across * 0.7, () => {
      const [u, v] = uv(from(long * 0.62), across * 0.7)
      const p = at(u, v, lift)
      for (let z = 0; z < 5; z++) for (let dx = -4; dx <= 4; dx++) canvas.set(p.x + dx, p.y - z, (dx + z) % 2 === 0 ? LOGS[2] : LOGS[1])
      for (let dx = -3; dx <= 3; dx++) canvas.set(p.x + dx, p.y - 5, dx % 2 === 0 ? STEEL_GREY[3] : STEEL_GREY[2])
      canvas.set(p.x - 1, p.y - 6, STEEL_GREY[2])
      canvas.set(p.x + 2, p.y - 6, STEEL_GREY[3])
    })
    // A net hung over the deck's edge to dry.
    put(from(long * 0.8), across - 0.04, () => {
      for (let a = Math.min(from(long * 0.7), from(long * 0.9)); a < Math.min(from(long * 0.7), from(long * 0.9)) + long * 0.2; a += 1 / 48) {
        const [u, v] = uv(a, across)
        const p = at(u, v, lift)
        for (let z = 0; z < 5; z++) if ((Math.floor(a * 48) + z) % 2 === 0) canvas.set(p.x, p.y + 2 + z, z === 0 ? ROPE : PLANK[1])
      }
    })
    // The lantern on its post at the far end.
    put(from(long - 0.3), 0.14, () => {
      const [u, v] = uv(from(long - 0.3), 0.14)
      const p = at(u, v, lift)
      for (let z = 0; z < 15; z++) for (const dx of [0, 1]) canvas.set(p.x + dx, p.y - z, LOGS[dx ? 1 : 2])
      for (let dx = 1; dx <= 4; dx++) canvas.set(p.x + dx, p.y - 15, LOGS[2])
      for (let z = 0; z < 4; z++) for (const dx of [3, 4, 5]) canvas.set(p.x + dx, p.y - 13 + z, z === 0 || z === 3 ? LOGS[0] : EMBER[dx === 4 ? 2 : 1])
    })
    things.sort((p, q) => p[0] - q[0]).forEach(([, draw]) => draw())
  }
  // A big jetty (a city's harbour) is a working quay: worn planks, a rope rail along one side, stacks of crates and
  // barrels, lamp posts and a cargo crane at its end.
  if (long * across >= 6) {
    // Darker, worn planks here and there.
    for (let a = 0; a <= long; a += 1 / 48) {
      const plank = Math.floor(a * 5)
      if (hash(plank, 3, 83) > 0.08) continue
      for (let c = 0.1; c <= across - 0.1; c += 1 / 48) {
        if (hash(plank, Math.floor(c * 3), 85) > 0.5) continue
        const [u, v] = uv(a, c)
        const p = at(u, v, lift)
        canvas.set(p.x, p.y, PLANK[2])
      }
    }
    // The rope rail on posts along the far side.
    const rail = across - 0.06
    for (let a = 0.3; a < long - 0.3; a += 0.8) {
      const [u, v] = uv(a, rail)
      const p = at(u, v, lift)
      for (let z = 0; z < 10; z++) for (const dx of [0, 1]) canvas.set(p.x + dx, p.y - z, LOGS[z === 9 ? 3 : dx ? 1 : 2])
    }
    for (let a = 0.3; a < long - 0.3; a += 1 / 32) {
      const [u, v] = uv(a, rail)
      const p = at(u, v, lift)
      const sag = Math.round(Math.sin((((a - 0.3) % 0.8) / 0.8) * Math.PI) * 1.5)
      canvas.set(p.x, p.y - 8 + sag, ROPE)
      canvas.set(p.x, p.y - 7 + sag, ROPE)
    }
    // Stacks of crates and barrels.
    for (let k = 0; k < Math.floor(long / 2.5); k++) {
      const a = 1 + k * 2.5 + hash(k, 1, 91) * 0.6
      const c = across * (0.25 + hash(k, 2, 91) * 0.25)
      box(a, c, 0.28, 12)
      if (hash(k, 3, 91) < 0.7) box(a + 0.62, c + 0.05, 0.24, 10)
      if (hash(k, 4, 91) < 0.5) box(a + 0.2, c, 0.2, 22)
      // A barrel or two beside the stack.
      const [bu, bv] = uv(a - 0.45, c + 0.2)
      const bp = at(bu, bv, lift)
      for (let z = 0; z < 9; z++) for (let dx = -3; dx <= 3; dx++) canvas.set(bp.x + dx, bp.y - z, z === 8 ? PLANK[4] : z % 3 === 1 ? LOGS[0] : PLANK[dx < 0 ? 3 : 1])
    }
    // Lamp posts at the corners near the bank.
    for (const c of [0.2, across - 0.2]) {
      const [u, v] = uv(0.4, c)
      const p = at(u, v, lift)
      for (let z = 0; z < 14; z++) canvas.set(p.x, p.y - z, STONE[1])
      canvas.set(p.x - 1, p.y - 15, EMBER[1])
      canvas.set(p.x, p.y - 15, EMBER[2])
      canvas.set(p.x + 1, p.y - 15, EMBER[1])
      canvas.set(p.x, p.y - 16, EMBER[0])
    }
    // A timber crane at the far end, its jib out over the water and a rope with a hook.
    {
      const [u, v] = uv(long - 0.5, across / 2)
      const p = at(u, v, lift)
      for (let z = 0; z < 46; z++) for (const dx of [-2, -1, 0, 1, 2]) canvas.set(p.x + dx, p.y - z, LOGS[dx < 0 ? 3 : dx === 0 ? 2 : 1])
      // Its foot: a heavy timber frame on the deck.
      for (let dz = 0; dz < 8; dz++) for (let dx = -6; dx <= 6; dx++) if (Math.abs(dx) > 4 - dz / 2) canvas.set(p.x + dx, p.y - dz, LOGS[1])
      const [u2, v2] = uv(long + 1, across / 2)
      const q = at(u2, v2, lift + 44)
      const steps = 40
      for (let k = 0; k <= steps; k++) {
        const x = p.x + ((q.x - p.x) * k) / steps
        const y = p.y - 44 + ((q.y - (p.y - 44)) * k) / steps
        canvas.set(x, y, LOGS[2])
        canvas.set(x, y + 1, LOGS[0])
      }
      for (let z = 0; z < 24; z++) canvas.set(q.x, q.y + 1 + z, ROPE)
      // A net of goods hanging from the hook.
      for (let y = 0; y < 7; y++) for (let x = -4; x <= 4; x++) if (Math.abs(x) + y * 0.4 < 5) canvas.set(q.x + x, q.y + 26 + y, (x + y) % 2 ? SACK[1] : SACK[2])
      canvas.set(q.x - 1, q.y + 17, STONE[1])
      canvas.set(q.x, q.y + 18, STONE[1])
      canvas.set(q.x + 1, q.y + 17, STONE[1])
    }
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
  canvas.solid(diamondAt(cx, base - h, w), Math.min(left, front, right) - front, top - front)
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
  const { canvas, cx, base, w, h } = footprint(tiles, 30 + tiles * 18)
  const inset = 4
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const a = (x - cx) / (w - inset)
      const b = (y - (base - h)) / (h - inset / 2)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(SOIL, 2.2 + (hash(x >> 1, y, 51) - 0.5) * 1.6))
    }
  }
  const tall = 14 + tiles * 8
  const iw = w - inset - 2
  const front = base - inset / 2 - 1
  // A point on the ground along the footprint's edges: u, v from 0 to 1 from the back corner to the left / right.
  const at = (u: number, v: number) => ({ x: cx + Math.round((v - u) * iw), y: front - iw + Math.round(((u + v) * iw) / 2) })
  const post = (p: { x: number; y: number }, tone: number, high = tall) => {
    for (let z = 0; z <= high; z++) {
      canvas.set(p.x, p.y - z, TIMBER[tone])
      canvas.set(p.x + 1, p.y - z, TIMBER[Math.max(0, tone - 1)])
    }
    canvas.set(p.x, p.y - high - 1, PLANK[3])
  }
  const line = (p: { x: number; y: number }, q: { x: number; y: number }, z: number, color: number, sag = 0) => {
    const n = Math.max(1, Math.abs(q.x - p.x))
    for (let i = 0; i <= n; i++) {
      const f = i / n
      const y = p.y + (q.y - p.y) * f - z + Math.sin(f * Math.PI) * sag
      canvas.set(p.x + (q.x - p.x) * f, y, color)
      if (!sag) canvas.set(p.x + (q.x - p.x) * f, y + 1, TIMBER[0])
    }
  }
  const back = at(0, 0)
  const left = at(1, 0)
  const right = at(0, 1)
  const fore = at(1, 1)
  // Rails (rope at 1×1, timber above) on the given levels between the given corners.
  const rails = (p: { x: number; y: number }, q: { x: number; y: number }, tone: number) => {
    if (tiles === 1) line(p, q, tall - 3, SACK[2], 3)
    else for (const z of tiles === 3 ? [tall, Math.round(tall * 0.55), Math.round(tall * 0.55) - 6] : [tall, tall - 7]) line(p, q, z, TIMBER[tone])
  }
  // Behind: the back posts and rails.
  const mids = tiles === 1 ? [] : tiles === 2 ? [0.5] : [1 / 3, 2 / 3]
  post(back, 0)
  for (const m of mids) {
    post(at(m, 0), 1)
    post(at(0, m), 0)
  }
  rails(back, left, 1)
  rails(back, right, 0)
  if (tiles === 3) {
    // A plank floor half-way up along the back edges, with ladders up to it.
    const deck = Math.round(tall * 0.55)
    for (const [p, q] of [[back, left], [back, right]] as const) {
      const n = Math.abs(q.x - p.x)
      for (let i = 0; i <= n; i++) for (let d = 0; d < 7; d++) {
        const f = i / n
        canvas.set(p.x + (q.x - p.x) * f + (q.x < p.x ? d : -d) * 0.9, p.y + (q.y - p.y) * f - deck + d * 0.45, PLANK[d === 0 ? 1 : (i + d) % 5 === 0 ? 2 : 3])
      }
    }
    for (const [x, y] of [[cx - 30, front - 40], [cx + 22, front - 44]]) {
      for (let z = 0; z < deck; z++) for (const dx of [0, 5]) canvas.set(x + dx + z * 0.25, y - deck + z + 6, TIMBER[1])
      for (let z = 2; z < deck; z += 4) for (let dx = 0; dx <= 5; dx++) canvas.set(x + dx + z * 0.25, y - deck + z + 6, TIMBER[2])
    }
  }
  // On the ground: the first course of the walls, a stack of planks, and crates and a barrel on the big sites.
  for (const side of [-1, 1]) {
    for (let t = 0; t <= iw; t++) {
      const x = cx + side * (iw - t)
      for (let z = 0; z < 3; z++) canvas.set(x, front - iw / 2 + t / 2 - z, pick(STONE, (side < 0 ? 4 : 2) - (z === 0 || (t + z) % 6 === 0 ? 1 : 0)))
    }
  }
  for (let i = 0; i < 3; i++) for (let t = 0; t < 8 + tiles * 4; t++) canvas.set(cx - 6 + t, front - 10 - i * 2 + t / 2, PLANK[i === 2 ? 4 : 2])
  if (tiles >= 2) {
    // A coil of rope.
    for (let a = 0; a < 20; a++) for (const r of [3, 2]) canvas.set(cx + 12 + Math.round(Math.cos(a) * r), front - 14 + Math.round(Math.sin(a) * r * 0.5), SACK[r === 3 ? 2 : 1])
  }
  if (tiles === 3) {
    crate(canvas, cx + 20, front - 16, 10)
    crate(canvas, cx + 28, front - 20, 9)
    crate(canvas, cx - 30, front - 16, 9)
    barrel(canvas, cx + 2, front - 36)
  }
  // In front: the side and front posts and the front rails.
  post(left, 2)
  post(right, 1)
  for (const m of mids) {
    post(at(1, m), 2)
    post(at(m, 1), 1)
  }
  rails(left, fore, 2)
  rails(right, fore, 1)
  post(fore, 2)
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

// A small tent on four posts under a canopy of `cloth`, standing on (x, base), with goods under it.
function tent(canvas: Canvas, x: number, base: number, w: number, cloth: Uint32Array, plain = false) {
  hall(canvas, x, base, { w, wall: 14, roof: Math.round(w * 0.7), walls: WALL, roofs: ROOF, open: true, cloth, plain })
}

// A weighing scale on a post standing on (sx, sy).
function scale(canvas: Canvas, sx: number, sy: number) {
  for (let z = 0; z < 16; z++) canvas.set(sx, sy - z, TIMBER[1])
  for (let x = -6; x <= 6; x++) canvas.set(sx + x, sy - 16, BRASS[2])
  for (const side of [-6, 6]) for (let x = -2; x <= 2; x++) canvas.set(sx + side + x, sy - 11, BRASS[x < 0 ? 3 : 1])
}

// The market (CLAUDE.md §9.7). Level 1 comes in two looks picked by the building: a stall under a red-and-white
// canopy heaped with produce, or under blue-and-white with crates. Levels 2 and 3 (tents of many colours round a
// scale; a timber stall with a sign; a market square round a fountain) are drawn ahead for when the market grows.
function market(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 70 + (level - 1) * 18)
  if (level === 1) {
    hall(canvas, cx, base - 8, { w: 50, wall: 20, roof: 22, walls: WALL, roofs: ROOF, open: true, cloth: v ? CANOPY_BLUE : CANOPY })
    counter(canvas, cx, base - 8, 50, 8, 44, v ? 'cloth' : 'food')
    if (v) {
      crate(canvas, cx + 18, base - 8, 9)
      crate(canvas, cx + 26, base - 12, 8)
    } else {
      barrel(canvas, cx + 20, base - 8)
      shadeBlobs(canvas, [{ x: cx + 28, y: base - 10, r: 4 }, { x: cx + 32, y: base - 13, r: 3.5 }], SACK, 3)
    }
    return canvas.sprite(cx, base, 0)
  }
  if (level === 2) {
    if (!v) {
      tent(canvas, cx - 22, base - h + 2, 20, CANOPY_GOLD, true)
      tent(canvas, cx + 22, base - h + 2, 20, CANOPY_BROWN, true)
      tent(canvas, cx, base - 6, 24, CANOPY, false)
      scale(canvas, cx - 30, base - 6)
      // A rug laid out with goods.
      for (let y = 0; y < 6; y++) for (let x = 0; x < 14; x++) canvas.set(cx + 18 + x, base - 10 + y - Math.round(x * 0.5), (x + y) % 4 === 0 ? BRASS[2] : rgb(0x5a3a7a))
    } else {
      hall(canvas, cx + 4, base - 10, { w: 40, wall: 22, roof: 20, walls: LOG_WALLS, roofs: SHINGLE, bay: 0, door: true })
      awning(canvas, cx + 4, base - 10, 40, STRIPE, 6, 34, 16, 12)
      counter(canvas, cx + 4, base - 10, 40, 8, 32, 'food')
      // A signboard on a post.
      for (let z = 0; z < 20; z++) canvas.set(cx - 40, base - 10 - z, TIMBER[1])
      for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) canvas.set(cx - 39 + x, base - 30 + y, y === 0 || y === 7 || x === 0 || x === 9 ? TIMBER[0] : PLANK[3])
      barrel(canvas, cx + 24, base - 8)
    }
    return canvas.sprite(cx, base, 0)
  }
  // A market square: tents round a fountain, a cart of goods.
  tent(canvas, cx, base - h - 14, 18, CANOPY_GOLD, false)
  tent(canvas, cx - 28, base - h, 18, CANOPY, false)
  tent(canvas, cx + 28, base - h, 18, CANOPY_BLUE, false)
  const fx = cx
  const fy = base - h + 6
  shadeBlobs(canvas, [{ x: fx, y: fy - 2, r: 8 }], STONE, 17, 0.5)
  for (let z = 0; z < 12; z++) canvas.set(fx, fy - 4 - z, STONE[4])
  for (let dx = -3; dx <= 3; dx++) canvas.set(fx + dx, fy - 16, rgb(0x9ad0e8))
  tent(canvas, cx - 16, base - 4, 16, CANOPY_BROWN, true)
  tent(canvas, cx + 16, base - 4, 16, CANOPY_GOLD, true)
  cart(canvas, cx + 20, base - 4)
  banner(canvas, cx, base - h - 14 - 26, 9)
  return canvas.sprite(cx, base, 0)
}

// A straw training dummy on a post standing on (x, y).
function dummy(canvas: Canvas, x: number, y: number) {
  for (let z = 0; z < 14; z++) canvas.set(x, y - z, TIMBER[1])
  for (let x2 = -4; x2 <= 4; x2++) canvas.set(x + x2, y - 10, TIMBER[2])
  shadeBlobs(canvas, [{ x, y: y - 14, r: 3.5 }, { x, y: y - 8, r: 3 }], THATCH, 3)
}

// An archery target on legs standing on (x, y).
function target(canvas: Canvas, x: number, y: number) {
  for (const d of [-3, 3]) for (let z = 0; z < 8; z++) canvas.set(x + d, y - z, TIMBER[1])
  for (let dy = -5; dy <= 5; dy++) for (let dx = -4; dx <= 4; dx++) {
    const r = Math.hypot(dx * 1.2, dy)
    if (r <= 5) canvas.set(x + dx, y - 12 + dy, r < 1.5 ? CRIMSON[3] : r < 3 ? PLASTER[4] : r < 4.2 ? CRIMSON[2] : THATCH[3])
  }
}

// A pennant on a pole standing on (x, y).
function pennant(canvas: Canvas, x: number, y: number, tall = 22) {
  for (let z = 0; z < tall; z++) canvas.set(x, y - z, TIMBER[1])
  for (let fy = 0; fy < 5; fy++) for (let fx = 1; fx <= 8 - fy; fx++) canvas.set(x + fx, y - tall + 1 + fy, FLAG[fy < 2 ? 2 : 1])
}

// A palisade of sharpened stakes along the two front edges of a footprint (cx, base, h), with a gap at the front
// corner for the way in.
function palisade(canvas: Canvas, cx: number, base: number, h: number, gap = 8) {
  for (const side of [-1, 1]) {
    for (let t = gap; t < h * 2 - 6; t += 2) {
      const x = cx + side * t
      const y = base - 2 - t / 2
      for (let z = 0; z < 10; z++) canvas.set(x, y - z, z > 7 ? LOGS[3] : LOGS[side < 0 ? 2 : 1])
    }
  }
}

// A catapult standing on (x, base).
function catapult(canvas: Canvas, x: number, base: number) {
  for (let t = 0; t < 16; t++) for (const d of [0, 6]) canvas.set(x + t, base - 3 + t / 2 - d * 0.5 + d, TIMBER[1])
  for (const [dx, dy] of [[2, 1], [14, 7]]) for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2
    canvas.set(x + dx + Math.round(Math.cos(t) * 2), base + dy + Math.round(Math.sin(t) * 3), TIMBER[0])
  }
  for (let z = 0; z < 16; z++) canvas.set(x + 6 - Math.round(z * 0.5), base - 2 - z, TIMBER[2])
  shadeBlobs(canvas, [{ x: x - 2, y: base - 19, r: 2.5 }], STONE, 5)
}

// The barracks (CLAUDE.md §9.7), two looks per level picked by the building:
//   level 1: a stone hall under red tiles in a fenced yard of dummies and targets; the same, ivy-grown, with a lean-to;
//   level 2: a gilded hall between two roofed towers over a training yard; a hall with stables and banners;
//   level 3 (drawn ahead for when the barracks grows): a walled keep with a catapult; a fort round a tall
//     tower over a yard of targets and shields.
function barracks(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(3, 110 + (level - 1) * 30)
  // Trampled yard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 4); x <= cx + (h * 2 - 4); x++) {
      const a = (x - cx) / (h * 2 - 6)
      const b = (y - (base - h)) / (h - 3)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(SOIL, 1.5 + hash(x >> 1, y, 83) * 1.2))
    }
  }
  const tops: { x: number; y: number; chimney: boolean }[] = []
  if (level === 1) {
    const top = hall(canvas, cx + 18, base - h + 4, { w: 56, wall: 28, roof: 30, walls: DARK_STONE, roofs: ROOF, masonry: true, bay: 16, door: true, chimney: 0.6 })
    tops.push(top)
    pennant(canvas, top.x, top.y, 14)
    if (v) {
      overgrow(canvas, cx - 50, base - h - 70, cx + 80, base - 10, 0.12, 51, DARK_STONE)
      hall(canvas, cx - 30, base - 18, { w: 16, wall: 14, roof: 8, walls: WALL, roofs: SHINGLE, open: true, roofed: true })
      rack(canvas, cx - 10, base - 10)
    } else {
      for (const [dx, dy] of [[-58, -6], [-40, 2]]) dummy(canvas, cx + dx, base - h + dy + 10)
      target(canvas, cx - 22, base - 10)
    }
    palisade(canvas, cx, base, h)
  } else if (level === 2) {
    if (!v) {
      const hw = 58
      const hb = base - h + 4
      const top = hall(canvas, cx + 18, hb, { w: hw, wall: 32, roof: 32, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 16, door: true, chimney: 0.6, trim: BRASS[1] })
      tops.push(top)
      // Round towers on the hall's side corners.
      for (const side of [-1, 1]) {
        const t = tower(canvas, cx + 18 + side * hw, hb - hw / 2 + 6, 9, 52, DARK_STONE, SLATE, true)
        pennant(canvas, t.x, t.y, 10)
      }
      for (const side of [-1, 1]) drape(canvas, cx + 18, base - h + 4, 60, side, 12, 28, 16)
      for (const [dx, dy] of [[-58, -6], [-40, 2], [-22, 8]]) dummy(canvas, cx + dx, base - h + dy + 10)
    } else {
      // Stables: an open shed on the left, the hall behind, banners on poles along the yard.
      const top = hall(canvas, cx + 22, base - h + 2, { w: 54, wall: 32, roof: 30, walls: DARK_STONE, roofs: ROOF, masonry: true, bay: 16, door: true, chimney: 0.6 })
      tops.push(top)
      hall(canvas, cx - 36, base - 16, { w: 24, wall: 18, roof: 12, walls: WALL, roofs: ROOF, open: true, roofed: true })
      for (const dx of [-12, 2, 16]) pennant(canvas, cx + dx, base - 8 + Math.abs(dx) / 4, 26)
      rack(canvas, cx + 30, base - 10)
    }
    palisade(canvas, cx, base, h)
  } else if (!v) {
    // A keep inside a curtain wall with round towers, a catapult before the gate.
    const ring = 80
    const corner = (dx: number, dy: number) => ({ x: cx + dx * ring, y: base - h + dy * (ring / 2) })
    const back = corner(0, -1)
    const left = corner(-1, 0)
    const right = corner(1, 0)
    // The back walls first, their inner faces over the yard, then the back tower and the keep.
    rampart(canvas, left.x + 10, left.y - 5, back.x - 10, back.y + 5, 22, DARK_STONE, false)
    rampart(canvas, back.x + 10, back.y + 5, right.x - 10, right.y - 5, 22, DARK_STONE, true)
    tower(canvas, back.x, back.y, 10, 56, DARK_STONE, null, true)
    const top = hall(canvas, cx, base - h + 20, { w: 44, wall: 50, roof: 26, walls: DARK_STONE, roofs: ROOF, masonry: true, bay: 12, trim: BRASS[1] })
    tops.push(top)
    for (const side of [-1, 1]) {
      const c = side < 0 ? left : right
      tower(canvas, c.x, c.y, 11, 50, DARK_STONE, null, true)
      rampart(canvas, c.x - side * 11, c.y + 5, cx + side * 14, base - 13, 22, DARK_STONE, side < 0)
    }
    for (let x = -14; x <= 14; x++) for (let z = 0; z < 30; z++) canvas.set(cx + x, base - 6 - z + Math.abs(x) * 0.15, Math.abs(x) < 7 && z < 18 ? TIMBER[0] : pick(DARK_STONE, x < 0 ? 3 : 1.6))
    for (const dx of [-20, 20]) pennant(canvas, cx + dx, base - 36, 14)
    catapult(canvas, cx - 50, base - 6)
  } else {
    // A fort round a tall tower with a pagoda roof; targets and shields along the yard.
    const t = hall(canvas, cx + 6, base - h + 10, { w: 22, wall: 70, roof: 24, walls: DARK_STONE, roofs: ROOF, masonry: true, bay: 10, trim: BRASS[1] })
    pennant(canvas, t.x, t.y, 14)
    for (const side of [-1, 1]) hall(canvas, cx + side * 40, base - h + 10, { w: 30, wall: 30, roof: 22, walls: DARK_STONE, roofs: ROOF, masonry: true, bay: 12, door: side < 0 })
    for (const dx of [-60, -46, -32]) target(canvas, cx + dx, base - h + 30 + (dx + 60) / 2)
    for (let i = 0; i < 6; i++) for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 9) canvas.set(cx + 14 + i * 7 + dx, base - 14 - i * 3.5 + dy, (i % 2 ? CRIMSON : CLOTH[1])[Math.abs(dx) + Math.abs(dy) <= 1 ? 3 : 2])
    palisade(canvas, cx, base, h, 12)
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The spy house (CLAUDE.md §9.7), two looks per level picked by the building:
//   level 1: a dark townhouse with lit slits of windows and a crow on the roof; an ivy-grown stone house with a
//     cellar hatch and a lean-to;
//   level 2: a tall narrow brick house with chimneys and a ladder; a timber-framed house with an outside stair;
//   level 3: a stone house with a lookout tower and balconies; a dark timbered manor with a tower and scaffolding.
const SHADOW_WALLS = ramp(0x1e1a24, 0x2a2532, 0x37314a, 0x4a4260, 0x5e5478)
const BRICK = ramp(0x3a1a14, 0x5a2a1e, 0x7a3a28, 0x9a4e36, 0xb4664a)
function crow(canvas: Canvas, x: number, y: number) {
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [-2, 0]]) canvas.set(x + dx, y + dy, rgb(0x16141a))
  canvas.set(x - 2, y, BRASS[3])
}
function spyHouse(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base } = footprint(2, 100 + (level - 1) * 26)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  const hb = base - 6
  if (level === 1) {
    const top = hall(canvas, cx, hb, { w: 38, wall: 34, roof: 32, walls: v ? KEEP : SHADOW_WALLS, roofs: SLATE, masonry: true, bay: 12, door: true, chimney: 0.5 })
    tops.push(top)
    crow(canvas, top.x - 4, top.y + 4)
    if (v) {
      overgrow(canvas, cx - 40, base - 80, cx + 40, base, 0.16, 61, KEEP)
      hall(canvas, cx + 24, base - 6, { w: 12, wall: 12, roof: 6, walls: WALL, roofs: SHINGLE, open: true, roofed: true })
      // A cellar hatch by the wall.
      for (let t = 0; t < 10; t++) for (let d = 0; d < 5; d++) canvas.set(cx - 30 + t + d, base - 10 + t / 2 - d / 2, d === 0 || t === 0 ? TIMBER[0] : PLANK[2])
    } else {
      barrel(canvas, cx + 22, base - 8)
    }
  } else if (level === 2) {
    const walls = v ? WALL : BRICK
    const top = hall(canvas, cx + 2, hb, { w: 34, wall: 54, roof: 30, walls, roofs: SLATE, masonry: !v, bay: 9, door: true, chimney: 0.35 })
    tops.push(top)
    tops.push(stack(canvas, cx + 16, hb - 54 - 12, 16))
    crow(canvas, top.x - 4, top.y + 4)
    if (v) {
      // An outside stair up the left wall to a door on the upper floor.
      for (let i = 0; i < 12; i++) for (let d = 0; d < 6; d++) canvas.set(cx - 34 + i * 2 + d, base - 10 - i * 2.5 + d * 0.5, d === 0 ? TIMBER[0] : PLANK[i % 2 ? 2 : 3])
      overgrow(canvas, cx - 40, base - 70, cx + 40, base, 0.05, 63)
      crate(canvas, cx + 22, base - 8, 8)
      barrel(canvas, cx + 30, base - 12)
    } else {
      // A ladder up to the roof.
      for (let z = 0; z < 44; z++) for (const dx of [0, 4]) canvas.set(cx + 26 + dx, base - 8 - z, TIMBER[1])
      for (let z = 2; z < 44; z += 4) for (let dx = 0; dx < 5; dx++) canvas.set(cx + 26 + dx, base - 8 - z, TIMBER[2])
    }
  } else {
    const walls = v ? SHADOW_WALLS : KEEP
    const t = hall(canvas, cx - 4, base - 36, { w: 12, wall: 80, roof: 18, walls, roofs: SLATE, masonry: true, bay: 6, trim: v ? undefined : BRASS[1] })
    finial(canvas, t.x, t.y, 4)
    crow(canvas, t.x + 2, t.y + 8)
    const top = hall(canvas, cx + 6, hb, { w: 40, wall: 40, roof: 28, walls, roofs: SLATE, masonry: true, bay: 10, door: true, chimney: 0.6 })
    tops.push(top)
    tops.push(stack(canvas, cx - 24, hb - 40 - 6, 14))
    // Balconies on the left wall.
    for (const lift of [20, 32]) {
      for (let tt = 0; tt < 18; tt++) for (let d = 0; d < 2; d++) canvas.set(cx - 30 + tt, hb - lift + tt / 2 + d, d === 0 ? PLANK[3] : TIMBER[1])
      for (let tt = 0; tt < 18; tt += 3) for (let z = 0; z < 4; z++) canvas.set(cx - 30 + tt, hb - lift + tt / 2 - z, TIMBER[0])
    }
    if (v) {
      // Scaffolding up the right wall.
      for (const dx of [16, 30]) for (let z = 0; z < 46; z++) canvas.set(cx + dx, base - 10 - dx / 4 - z, TIMBER[1])
      for (let z = 10; z < 46; z += 12) for (let dx = 16; dx <= 30; dx++) canvas.set(cx + dx, base - 10 - dx / 4 - z, PLANK[2])
    }
    barrel(canvas, cx - 34, base - 10)
  }
  // A lantern by the door.
  for (let z = 0; z < 8; z++) canvas.set(cx - 30, base - 30 - z, TIMBER[0])
  for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) canvas.set(cx - 30 + x, base - 29 + y, Math.abs(x) === 2 || y === 0 || y === 4 ? TIMBER[0] : EMBER[2])
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// The watchtower: a battered stone footing, a tall braced timber shaft, an overhanging railed lookout (its plank floor
// seen from above) with a beacon fire, and a steep slate roof with the kingdom's pennant. It stands in the middle of
// its tile.
// Two looks per level, picked by the building: level 1 the timber tower on a stone footing, or on a plank base with a
// rope ladder; level 2 (drawn ahead) taller, with shields on its railing and banners, or ringed by sharpened stakes
// with a pulley; level 3 (drawn ahead) a round stone tower, with braziers on its battlements or a bell under a roof.
function watchtower(variant = 0, level = 1): Sprite {
  if (level >= 3) return stoneWatchtower(variant % 2)
  const v = variant % 2
  const { canvas, cx, base } = footprint(1, level === 2 ? 200 : 180)
  // The ground under the middle of the tile; heights rise from here.
  const g = base - TILE_HEIGHT / 2
  // Stone footing, wider at the foot, its top a paved ring.
  const foot = 12
  if (v === 1 && level === 1) canvas.solid(ellipseAt(cx, g, 12), foot - 1, foot)
  else canvas.solid(ellipseAt(cx, g, 15), 0, foot)
  for (let z = 0; z <= foot; z++) {
    if (v === 1 && level === 1) break
    const r = 15 - z * 0.25
    for (let x = Math.ceil(-r); x <= r; x++) {
      const f = x / r
      const curve = Math.sqrt(Math.max(0, 1 - f * f)) * r * 0.5
      const course = Math.floor(z / 3)
      const mortar = z % 3 === 0 || (x + (course & 1) * 3) % 6 === 0
      const tone = 3.4 - (f + 1) * 1.5 - (mortar ? 0.9 : 0) + (hash(x >> 1, course, 17) - 0.5) * 0.6
      canvas.set(cx + x, Math.round(g - z + curve), pick(DARK_STONE, tone))
    }
  }
  const ring = 12
  for (let x = -ring; x <= ring; x++) {
    const curve = Math.sqrt(Math.max(0, 1 - (x / ring) ** 2)) * ring * 0.5
    for (let y = -curve; y <= curve; y++) canvas.set(cx + x, Math.round(g - foot + y), v === 1 && level === 1 ? PLANK[(x + Math.round(y)) % 3 === 0 ? 2 : 3] : pick(DARK_STONE, 3.2 - (x / ring) * 0.8))
  }
  // Legs under the plank base.
  if (v === 1 && level === 1) for (const dx of [-11, -4, 4, 11]) for (let z = 0; z < foot; z++) canvas.set(cx + dx, g - z + 3 - Math.abs(dx) * 0.2, TIMBER[0])
  // The timber shaft: a square frame seen corner-on, planked between the posts, braced crosswise on each face.
  const half = 8
  const z0 = foot + 2
  const z1 = level === 2 ? 96 : 80
  canvas.solid(diamondAt(cx, g, half), z0, z1)
  const at = (x: number, z: number) => Math.round(g - z + (half - Math.abs(x)) / 2)
  for (let z = z0; z <= z1; z++) {
    for (let x = -half; x <= half; x++) canvas.set(cx + x, at(x, z), PLANK[(x < 0 ? 3 : 1) - (Math.abs(x) % 3 === 0 ? 1 : 0)])
  }
  for (const side of [-1, 1]) {
    // Three crosses of braces up each face.
    for (let leg = 0; leg < 3; leg++) {
      const lo = z0 + 3 + leg * 22
      for (let t = 0; t <= half; t++) {
        const x = side * t
        canvas.set(cx + x, at(x, lo + t * 2.3), TIMBER[side < 0 ? 1 : 0])
        canvas.set(cx + x, at(x, lo + (half - t) * 2.3), TIMBER[side < 0 ? 1 : 0])
      }
    }
    for (let z = z0; z <= z1; z++) canvas.set(cx + side * half, at(side * half, z), TIMBER[0])
  }
  for (let z = z0; z <= z1; z++) canvas.set(cx, at(0, z), TIMBER[2])
  for (const lo of [40, 62]) for (let z = lo; z < lo + 8; z++) canvas.set(cx - 4, at(-4, z), TIMBER[0])
  // The lookout: a plank floor overhanging the shaft, seen from above, its front edge on joists.
  const deck = 15
  const floor = z1 + 3
  canvas.solid(diamondAt(cx, g, deck), z1, floor)
  const back = (x: number, z: number) => Math.round(g - z - (deck - Math.abs(x)) / 2)
  const front = (x: number, z: number) => Math.round(g - z + (deck - Math.abs(x)) / 2)
  for (let x = -deck; x <= deck; x++) {
    for (let z = z1; z < floor; z++) canvas.set(cx + x, front(x, z), PLANK[x < 0 ? 2 : 1])
    if (Math.abs(x) % 4 === 1) canvas.set(cx + x, front(x, z1 - 1), TIMBER[0])
    for (let y = back(x, floor); y <= front(x, floor); y++) {
      // Boards run along one side of the floor.
      const seam = (x + (y - g) * 2) % 6 === 0
      canvas.set(cx + x, y, PLANK[seam ? 2 : 3 + (hash(x >> 2, y, 41) > 0.7 ? 1 : 0)])
    }
  }
  // Behind the fire: the railing along the back edges and the back corner post, in shadow.
  const rail = (edge: (x: number, z: number) => number, shade: number) => {
    for (let x = -deck; x <= deck; x++) {
      const post = Math.abs(x) % 5 === 0
      for (let z = floor; z < floor + (post ? 7 : 1); z++) canvas.set(cx + x, edge(x, z), TIMBER[shade])
      canvas.set(cx + x, edge(x, floor + 6), TIMBER[Math.min(2, shade + 1)])
    }
  }
  rail(back, 0)
  const eave = z1 + 22
  for (let z = floor; z <= eave; z++) canvas.set(cx, back(0, z), TIMBER[0])
  // The beacon: a brazier on the middle of the floor with flames licking up out of it.
  const fireY = g - floor - 1
  for (let x = -4; x <= 4; x++) canvas.set(cx + x, fireY, TIMBER[0])
  for (let x = -3; x <= 3; x++) canvas.set(cx + x, fireY + 1, TIMBER[0])
  for (let y = 1; y <= 10; y++) {
    const w = Math.max(0, 4 - Math.floor(y / 2))
    for (let x = -w; x <= w; x++) {
      if (hash(x, y, 29) > 0.75 && y > 3) continue
      canvas.set(cx + x, fireY - y, EMBER[Math.abs(x) >= w && y < 6 ? 0 : y < 3 ? 1 : y < 7 ? 2 : 1])
    }
  }
  // In front: the railing along the front edges and the posts at the side and front corners up to the roof.
  rail(front, 1)
  for (const x of [-deck, 0, deck]) for (let z = floor; z <= eave; z++) canvas.set(cx + x, front(x, z), TIMBER[x < 0 ? 2 : x === 0 ? 1 : 0])
  // A steep pyramid roof of slate, its front ridge facing the viewer.
  const roof = 18
  const apex = eave + 32
  canvas.solid(diamondAt(cx, g, roof), eave, apex, [cx, g])
  // The corner posts holding up the roof.
  for (const x of [-deck, 0, deck]) canvas.solid(diamondAt(cx + x, g + (deck - Math.abs(x)) / 2, 1), floor, eave)
  for (let x = -roof; x <= roof; x++) {
    const bottom = Math.round(g - eave + (roof - Math.abs(x)) / 2)
    const topY = Math.round(g - apex + (Math.abs(x) / roof) * (apex - eave))
    for (let y = topY; y <= bottom; y++) {
      const shingle = (bottom - y) % 4 === 0
      canvas.set(cx + x, y, pick(SLATE, (x < 0 ? 3.6 : 1.6) - (shingle ? 0.7 : 0) + (hash(x, y >> 2, 23) - 0.5) * 0.4))
    }
    canvas.set(cx + x, bottom + 1, TIMBER[0])
  }
  for (let y = g - apex; y <= g - eave + roof / 2; y++) canvas.set(cx, y, SLATE[5])
  finial(canvas, cx, g - apex, 4)
  banner(canvas, cx, g - apex - 4, 9)
  if (v === 1 && level === 1) {
    // A rope ladder down the lit face.
    for (let z = foot; z < z1; z++) for (const dx of [-6, -2]) canvas.set(cx + dx, at(dx, z) + 1, SACK[2])
    for (let z = foot + 2; z < z1; z += 4) for (let dx = -6; dx <= -2; dx++) canvas.set(cx + dx, at(dx, z) + 1, SACK[1])
  }
  if (level === 2) {
    // Shields along the front railing, banners off the corners.
    for (const x of [-10, -3, 4, 11]) for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 8) canvas.set(cx + x + dx, front(x, floor + 3) + dy, (x % 2 ? CRIMSON : CLOTH[1])[Math.abs(dx) + Math.abs(dy) <= 1 ? 3 : 2])
    for (const x of [-deck, deck]) pennant(canvas, cx + x, front(x, eave) - 2, 12)
    if (v) {
      // Sharpened stakes leaning out round the foot, and a pulley with a rope.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI
        const sx = cx + Math.round(Math.cos(a) * 20)
        const sy = g + Math.round(Math.sin(a) * 9)
        for (let t = 0; t < 10; t++) canvas.set(sx + Math.round(Math.cos(a) * t * 0.6), sy - t, t > 7 ? LOGS[3] : LOGS[1])
      }
      for (let z = 20; z < z1; z++) canvas.set(cx + deck - 2, front(deck - 2, z), SACK[2])
    }
  }
  return canvas.sprite(cx, base, 0)
}

// The stone watchtower of level 3 (drawn ahead): a round crenellated tower with braziers burning on its top, or a
// bell under a little roof and red bands.
function stoneWatchtower(v: number): Sprite {
  const { canvas, cx, base } = footprint(1, 150)
  const g = base - TILE_HEIGHT / 2
  const top = tower(canvas, cx, g + 6, 15, 86, DARK_STONE, v ? null : null, true)
  if (v) {
    for (const z of [30, 60]) for (let x = -15; x <= 15; x++) {
      const curve = Math.sqrt(Math.max(0, 1 - (x / 15) ** 2)) * 7.5
      for (let d = 0; d < 3; d++) canvas.set(cx + x, Math.round(g + 6 - z + curve) - d, CRIMSON[x < 0 ? 2 : 1])
    }
    // The bell under a little roof on posts.
    for (const dx of [-6, 6]) for (let z = 0; z < 14; z++) canvas.set(cx + dx, top.y - z, TIMBER[1])
    for (let dx = -8; dx <= 8; dx++) for (let d = 0; d < 4; d++) canvas.set(cx + dx, top.y - 14 - d + Math.abs(dx) * 0.4, SLATE[3 - (d === 0 ? 1 : 0)])
    shadeBlobs(canvas, [{ x: cx, y: top.y - 7, r: 4 }], BRASS, 8)
    for (const dx of [-12, 12]) pennant(canvas, cx + dx, top.y - 2, 14)
  } else {
    for (const dx of [-9, 0, 9]) {
      for (let y = 0; y < 3; y++) canvas.set(cx + dx, top.y + 2 - y, STEEL_GREY[1])
      for (let z = 0; z < 5; z++) for (let d = -1; d <= 1; d++) if (Math.abs(d) < 2 - z / 3) canvas.set(cx + dx + d, top.y - 1 - z, EMBER[z < 2 ? 1 : 2])
    }
    for (const dx of [-14, 14]) pennant(canvas, cx + dx, top.y, 12)
  }
  // An arched door at the foot.
  for (let x = -4; x <= 4; x++) for (let z = 0; z < 12 + Math.sqrt(Math.max(0, 16 - x * x)); z++) canvas.set(cx - 7 + x, g + 12 - z + Math.round(x * 0.1), TIMBER[z < 1 ? 0 : 1])
  return canvas.sprite(cx, base, 0)
}

const PLASTER = ramp(0x8a8270, 0xb4ac98, 0xd4ccb6, 0xe8e2cc, 0xf6f2e2)
const TERRACOTTA = ramp(0x5a2416, 0x7a3420, 0x9a4a2c, 0xb8603a, 0xd07a4c, 0xe49464)
const VERDIGRIS = ramp(0x1e4a44, 0x2a6a5e, 0x3a8a78, 0x52a690, 0x74c2aa, 0x9adcc4)

// A flat paved yard over a footprint's diamond.
function yard(canvas: Canvas, cx: number, base: number, h: number, colors: Uint32Array, seed: number) {
  canvas.paving = true
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 4); x <= cx + (h * 2 - 4); x++) {
      const a = (x - cx) / (h * 2 - 6)
      const b = (y - (base - h)) / (h - 3)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(colors, 1.2 + (((x >> 2) + (y >> 1)) % 2) * 0.8 + (hash(x, y, seed) - 0.5)))
    }
  }
  canvas.paving = false
}

// The university (CLAUDE.md §9.8): level 1 a stone college under slate with an observatory tower, its green dome
// crowned by a gilded armillary; level 2 a bigger college with a clock tower, a bookcase out front, a banner and ivy;
// level 3 a grand hall of gilded gables with an arched gate under a crest, a telescope on the roof, crates of books
// and maps, and ivy over it all.
function armillary(canvas: Canvas, ax: number, ay: number, r = 4) {
  for (let a = 0; a < r * 6; a++) {
    const t = (a / (r * 6)) * Math.PI * 2
    canvas.set(ax + Math.round(Math.cos(t) * r), ay + Math.round(Math.sin(t) * r), BRASS[a < r * 3 ? 3 : 1])
  }
  for (let d = -r; d <= r; d++) canvas.set(ax + d, ay, BRASS[2])
  for (let z = 0; z < r + 2; z++) canvas.set(ax, ay + r + z, BRASS[1])
}

// A bookcase standing on (x, base): shelves of coloured spines under a little roof.
function bookcase(canvas: Canvas, x: number, base: number, wide = 14, tall = 18) {
  for (let i = 0; i <= wide; i++) {
    const g = base - i / 2
    for (let z = 0; z <= tall; z++) {
      const shelf = z % 5 === 0
      const side = i === 0 || i === wide
      canvas.set(x + i, g - z, side || shelf ? PLANK[side ? 1 : 2] : CLOTH[(i + Math.floor(z / 5)) % CLOTH.length][hash(i, z >> 2, 5) > 0.5 ? 2 : 1])
    }
    canvas.set(x + i, g - tall - 1, PLANK[4])
  }
}

// Steps up to a door on the left wall of a hall standing on (cx, base) with half-width w.
function steps(canvas: Canvas, cx: number, base: number, w: number) {
  const t0 = Math.round(w * 0.62) - 2
  for (let i = 0; i < 3; i++) {
    for (let t = t0 - i; t <= t0 + Math.max(5, Math.round(w * 0.2)) + 2 + i; t++) {
      const x = cx - (w - t) - i * 2
      const g = base - w / 2 + t / 2 + i
      canvas.set(x, g - 2 + i, KEEP[i === 0 ? 3 : 2])
      canvas.set(x, g - 1 + i, KEEP[1])
    }
  }
}

function university(level = 1): Sprite {
  const { canvas, cx, base, h } = footprint(3, 140 + (level - 1) * 24)
  yard(canvas, cx, base, h, level === 1 ? GREENS : KEEP, 91)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  if (level === 1) {
    const dome = tower(canvas, cx + 32, base - h - 14, 10, 58, KEEP, VERDIGRIS, true)
    armillary(canvas, dome.x, dome.y - 7)
    const hb = base - 14
    tops.push(hall(canvas, cx - 6, hb, { w: 54, wall: 32, roof: 28, walls: KEEP, roofs: SLATE, masonry: true, bay: 12, door: true, chimney: 0.6 }))
    steps(canvas, cx - 6, hb, 54)
  } else if (level === 2) {
    // The clock tower behind on the right: a tall square tower under a green spire, a clock face on its lit side.
    const tb = base - h - 6
    const clock = hall(canvas, cx + 28, tb, { w: 14, wall: 74, roof: 26, walls: KEEP, roofs: VERDIGRIS, masonry: true, bay: 0, trim: BRASS[2] })
    finial(canvas, clock.x, clock.y, 5)
    const fx = cx + 28 - 7
    const fy = tb - 7 - 58
    for (let y = -5; y <= 5; y++) for (let x = -4; x <= 4; x++) if ((x * x) / 16 + (y * y) / 25 <= 1) canvas.set(fx + x, fy + y + Math.round(x * 0.5), (x * x) / 16 + (y * y) / 25 > 0.7 ? BRASS[1] : rgb(0xf0e6c8))
    for (let z = 0; z < 4; z++) canvas.set(fx, fy - z, TIMBER[0])
    for (let d = 0; d < 3; d++) canvas.set(fx + d, fy + Math.round(d * 0.5), TIMBER[0])
    const hb = base - 12
    tops.push(hall(canvas, cx - 8, hb, { w: 58, wall: 38, roof: 30, walls: KEEP, roofs: SLATE, masonry: true, bay: 11, door: true, chimney: 0.62 }))
    steps(canvas, cx - 8, hb, 58)
    drape(canvas, cx - 8, hb, 58, -1, 10, 34, 20)
    overgrow(canvas, cx - 70, base - 90, cx + 50, base - 10, 0.12, 93, KEEP)
    bookcase(canvas, cx + 30, base - 16)
    // Flower beds by the steps.
    for (let i = 0; i < 10; i++) canvas.set(cx - 50 + i * 3, base - 18 + Math.round(i * 1.5), FRUIT[i % FRUIT.length])
  } else {
    // A wing behind with a telescope on its roof, the main hall, and two gilded gables on the front.
    const wing = hall(canvas, cx + 6, base - h - 14, { w: 44, wall: 46, roof: 26, walls: KEEP, roofs: SLATE, masonry: true, bay: 11, trim: BRASS[2], chimney: 0.5 })
    tops.push(wing)
    const hb = base - 10
    tops.push(hall(canvas, cx, hb, { w: 62, wall: 42, roof: 26, walls: KEEP, roofs: SLATE, masonry: true, bay: 12, trim: BRASS[2] }))
    for (const side of [-1, 1]) {
      const g = hall(canvas, cx + side * 30, hb - 12, { w: 16, wall: 46, roof: 24, walls: KEEP, roofs: SLATE, masonry: true, bay: 8, trim: BRASS[2] })
      finial(canvas, g.x, g.y, 4)
    }
    // The telescope: a brass tube on a tripod, pointing up at the sky.
    const sx = cx - 34
    const sy = base - h - 38
    for (const d of [-4, 0, 4]) for (let z = 0; z < 8; z++) canvas.set(sx + d - Math.round(d * z * 0.1), sy - z, TIMBER[1])
    for (let t = 0; t < 16; t++) for (let d = -1; d <= 1; d++) canvas.set(sx - 6 + t, sy - 8 - Math.round(t * 0.55) + d, d === -1 ? BRASS[3] : t > 13 ? BRASS[0] : BRASS[2])
    // The arched gate at the front corner, a crest over it.
    for (let x = -9; x <= 9; x++) {
      const top = 20 + Math.sqrt(Math.max(0, 81 - x * x)) * 0.7
      for (let z = 0; z < top; z++) canvas.set(cx + x, hb - z + Math.abs(x) * 0.5, Math.abs(x) >= 8 || z >= top - 1.5 ? KEEP[4] : z < 2 ? KEEP[1] : TIMBER[0])
    }
    for (let y = -5; y <= 5; y++) for (let x = -4; x <= 4; x++) if (Math.abs(x) <= 4 - Math.max(0, y - 1)) canvas.set(cx + x, hb - 36 + y, Math.abs(x) === 4 - Math.max(0, y - 1) || y === -5 ? BRASS[1] : x < 0 ? CRIMSON[2] : BRASS[2])
    overgrow(canvas, cx - 90, base - 120, cx + 90, base - 6, 0.16, 97, KEEP)
    crate(canvas, cx + 22, base - 10, 10)
    crate(canvas, cx + 32, base - 15, 9)
    for (let i = 0; i < 4; i++) for (let x = 0; x < 6; x++) canvas.set(cx - 38 + x, base - 14 - i * 2, CLOTH[i % 4][x < 3 ? 2 : 1])
    // A map spread on the ground.
    for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) canvas.set(cx - 22 + x, base - 8 + y - Math.round(x * 0.3), y === 0 || x === 0 ? SACK[2] : rgb(0xe8d8a8))
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// A white cloth with a red cross hung on the left wall of a hall, its top-left at (fx, fy).
function redCross(canvas: Canvas, fx: number, fy: number) {
  for (let y = 0; y < 11; y++) for (let x = 0; x < 9; x++) canvas.set(fx + x, fy + y + Math.floor(x / 2), x === 0 || x === 8 || y === 10 ? CRIMSON[1] : PLASTER[4])
  for (let i = 2; i <= 8; i++) {
    for (const w of [0, 1]) {
      canvas.set(fx + 4 + w, fy + i + 2, CRIMSON[2])
      canvas.set(fx + i - 1, fy + 4 + w + Math.floor((i - 1) / 2), CRIMSON[2])
    }
  }
}

// A wooden bench standing on (x, base).
function bench(canvas: Canvas, x: number, base: number) {
  for (let t = 0; t < 12; t++) {
    canvas.set(x + t, base - 4 + t / 2, PLANK[3])
    canvas.set(x + t, base - 3 + t / 2, PLANK[1])
  }
  for (const t of [1, 10]) for (let z = 0; z < 3; z++) canvas.set(x + t, base - z + t / 2, TIMBER[1])
}

// Rows of herbs or flowers starting at (x, y), running down to the right.
function beds(canvas: Canvas, x: number, y: number, rows = 3, length = 14) {
  for (let r = 0; r < rows; r++) for (let t = 0; t < length; t++) canvas.set(x + t, y - r * 4 + Math.floor(t / 2), hash(t, r, 13) > 0.4 ? GREENS[1 + (t % 3)] : FRUIT[(t + r) % 4])
}

// A dormer window on the left face of a hip roof: a little gable with a lit pane.
function dormer(canvas: Canvas, x: number, y: number, roofs: Uint32Array) {
  for (let z = 0; z < 6; z++) for (let dx = 0; dx < 6; dx++) canvas.set(x + dx, y - z + dx / 2, dx === 0 || dx === 5 || z === 0 ? PLASTER[2] : z > 1 && z < 5 && dx > 1 && dx < 4 ? GLASS[2] : PLASTER[4])
  for (let d = 0; d < 5; d++) for (let dx = -1; dx <= 6; dx++) if (Math.abs(dx - 2.5) <= 4 - d) canvas.set(x + dx, y - 6 - d + dx / 2, roofs[3 - (d === 0 ? 1 : 0)])
}

// The hospital (CLAUDE.md §9.8), two looks per level picked by the building: 0 a whitewashed house (a timber-framed
// hall with a herb garden and a stretcher at 2, a long stone infirmary with dormers, a well and a red-cross banner at
// 3); 1 a stone house with herbs drying (a timber hall with a field tent at 2, a dormered house in a fenced garden at 3).
function hospital(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 90 + (level - 1) * 18)
  yard(canvas, cx, base, h, level === 3 ? KEEP : v ? KEEP : PLASTER, 47)
  const tops: { x: number; y: number; chimney: boolean }[] = []
  const hb = base - 8
  if (level === 1) {
    const w = 36
    tops.push(hall(canvas, cx, hb, { w, wall: 24, roof: 22, walls: v ? KEEP : PLASTER, roofs: TERRACOTTA, masonry: true, bay: 12, door: true, chimney: v ? 0.5 : undefined }))
    redCross(canvas, cx - 16, hb - 34)
    if (v) {
      // Herbs hung up to dry on a line along the wall.
      for (let t = 0; t < 14; t++) canvas.set(cx + 8 + t, hb - 22 + t / 2, TIMBER[1])
      for (let t = 1; t < 14; t += 3) for (let z = 0; z < 4; z++) canvas.set(cx + 8 + t, hb - 21 + t / 2 + z, GREENS[2])
      bench(canvas, cx - 34, base - 14)
    } else {
      for (const dx of [-32, -26, 20]) shadeBlobs(canvas, [{ x: cx + dx, y: base - 10 + dx / 8, r: 3 }], GREENS, dx)
      bench(canvas, cx + 18, base - 4)
    }
  } else if (level === 2) {
    const w = 40
    tops.push(hall(canvas, cx + 4, hb - 4, { w, wall: 34, roof: 28, walls: WALL, roofs: TERRACOTTA, bay: 11, door: true, chimney: 0.45 }))
    redCross(canvas, cx - 14, hb - 46)
    if (v) {
      // A field tent of canvas beside the hall.
      tent(canvas, cx + 26, base - 6, 16, ramp(0x8a7a5a, 0xc8b88e, 0xe8dcc0), true)
      barrel(canvas, cx - 30, base - 10)
    } else {
      beds(canvas, cx - 40, base - 12, 3, 16)
      // A stretcher on the ground.
      for (let t = 0; t < 14; t++) for (const d of [0, 3]) canvas.set(cx + 14 + t, base - 8 + t / 2 + d, TIMBER[1])
      for (let t = 2; t < 12; t++) for (let d = 1; d < 3; d++) canvas.set(cx + 14 + t, base - 8 + t / 2 + d, PLASTER[3])
      barrel(canvas, cx + 30, base - 12)
    }
  } else if (!v) {
    const w = 46
    tops.push(hall(canvas, cx, hb - 4, { w, wall: 40, roof: 30, walls: KEEP, roofs: TERRACOTTA, masonry: true, bay: 10, door: true, chimney: 0.3 }))
    tops.push(stack(canvas, cx + 18, hb - 4 - 40 - 20, 14))
    for (const t of [-34, -22]) dormer(canvas, cx + t, hb - 4 - 40 - 8 + Math.abs(t) / 4, TERRACOTTA)
    redCross(canvas, cx - 18, hb - 52)
    // A banner pole with the red cross, and a well.
    for (let z = 0; z < 36; z++) canvas.set(cx - 48, base - 14 - z, TIMBER[1])
    redCross(canvas, cx - 47, base - 48)
    shadeBlobs(canvas, [{ x: cx + 26, y: base - 10, r: 5 }], STONE, 19)
    for (let x = -2; x <= 2; x++) canvas.set(cx + 26 + x, base - 13, rgb(0x3a7ab8))
  } else {
    const w = 40
    tops.push(hall(canvas, cx + 2, hb - 4, { w, wall: 30, roof: 28, walls: PLASTER, roofs: TERRACOTTA, masonry: true, bay: 11, door: true, chimney: 0.4 }))
    for (const t of [-28, -16]) dormer(canvas, cx + 2 + t, hb - 4 - 30 - 8 + Math.abs(t) / 4, TERRACOTTA)
    redCross(canvas, cx - 14, hb - 42)
    picket(canvas, cx - 4, base + 4, 6, 36)
    beds(canvas, cx - 40, base - 12, 2, 14)
    // Lanterns on posts by the path.
    for (const dx of [-24, 12]) {
      for (let z = 0; z < 14; z++) canvas.set(cx + dx, base - 6 - z, TIMBER[0])
      for (let y = 0; y < 3; y++) canvas.set(cx + dx, base - 21 + y, EMBER[2])
    }
  }
  return smoky(canvas.sprite(cx, base, 0), tops)
}

// A gilded cross standing on (x, y).
function cross(canvas: Canvas, x: number, y: number, tall = 8) {
  for (let z = 0; z < tall; z++) canvas.set(x, y - z, BRASS[z > tall - 3 ? 3 : 2])
  for (let d = -2; d <= 2; d++) canvas.set(x + d, y - tall + 3, BRASS[3])
}

// A brazier burning on a post, standing on (x, base).
function brazier(canvas: Canvas, x: number, base: number) {
  for (let z = 0; z < 12; z++) canvas.set(x, base - z, TIMBER[0])
  for (let d = -2; d <= 2; d++) canvas.set(x + d, base - 12, STEEL_GREY[1])
  for (let z = 0; z < 5; z++) for (let d = -1; d <= 1; d++) if (Math.abs(d) < 2 - z / 3) canvas.set(x + d, base - 13 - z, EMBER[z < 2 ? 1 : 2])
}

// A statue on a plinth, standing on (x, base).
function statue(canvas: Canvas, x: number, base: number) {
  for (let z = 0; z < 5; z++) for (let d = -3; d <= 3; d++) canvas.set(x + d, base - z, KEEP[d < 0 ? 3 : 1])
  for (let z = 5; z < 16; z++) for (let d = -2; d <= 2; d++) if (z < 13 || Math.abs(d) < 2) canvas.set(x + d, base - z, STONE[d < 0 ? 4 : 2])
}

// The temple (CLAUDE.md §9.8), two looks per level picked by the building:
//   level 1: a stone chapel beside a little green-domed tower; an old chapel overgrown with ivy;
//   level 2: a gilded chapel with a bell tower and a porch; a chapel with a green-spired tower, braziers and a well;
//   level 3: a domed basilica with a columned porch and banners; a spired church with statues and a lantern.
function temple(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 120 + (level - 1) * 34)
  yard(canvas, cx, base, h, level === 1 ? KEEP : GREENS, 37)
  const hb = base - 8
  if (level === 1) {
    if (!v) {
      const t = tower(canvas, cx + 22, base - h - 2, 7, 40, KEEP, VERDIGRIS, true)
      cross(canvas, t.x, t.y, 7)
    }
    const top = hall(canvas, cx - 2, hb, { w: 38, wall: 26, roof: 26, walls: KEEP, roofs: SLATE, masonry: true, bay: 0, door: true })
    cross(canvas, top.x, top.y, 8)
    if (v) {
      overgrow(canvas, cx - 50, base - 60, cx + 50, base, 0.16, 41, KEEP)
      bench(canvas, cx + 14, base - 4)
      barrel(canvas, cx + 30, base - 12)
    }
  } else if (level === 2) {
    // The bell tower behind on the right, a square tower under a spire.
    const bell = hall(canvas, cx + 22, base - h - 4, { w: 10, wall: 56, roof: 22, walls: KEEP, roofs: v ? VERDIGRIS : SLATE, masonry: true, bay: 0, trim: BRASS[2] })
    cross(canvas, bell.x, bell.y, 8)
    hall(canvas, cx - 4, hb, { w: 40, wall: 30, roof: 30, walls: KEEP, roofs: SLATE, masonry: true, bay: 10, glow: true, door: true, trim: v ? undefined : BRASS[2] })
    // A porch over the door.
    hall(canvas, cx - 26, base - 2, { w: 10, wall: 16, roof: 10, walls: KEEP, roofs: SLATE, masonry: true, bay: 0, door: true })
    if (v) {
      for (const dx of [-42, -12]) brazier(canvas, cx + dx, base - 8 + dx / 10)
      shadeBlobs(canvas, [{ x: cx + 26, y: base - 10, r: 5 }], STONE, 21)
      for (let x = -2; x <= 2; x++) canvas.set(cx + 26 + x, base - 13, rgb(0x3a7ab8))
    }
  } else if (!v) {
    // The domed tower behind, the nave under green copper, a columned porch with banners.
    const t = tower(canvas, cx + 18, base - h - 4, 11, 70, KEEP, null, true)
    // A dome of green copper on the tower.
    for (let y = 0; y <= 12; y++) {
      const half = Math.round(Math.sqrt(Math.max(0, 1 - (y / 12) ** 2)) * 11)
      for (let x = -half; x <= half; x++) canvas.set(t.x + x, t.y + 4 - y, pick(VERDIGRIS, x < 0 ? 4 : x < half / 2 ? 3 : 1))
    }
    cross(canvas, t.x, t.y - 8, 9)
    hall(canvas, cx - 4, hb, { w: 42, wall: 34, roof: 26, walls: KEEP, roofs: VERDIGRIS, masonry: true, bay: 10, glow: true, door: true, trim: BRASS[2] })
    for (const side of [-1, 1]) drape(canvas, cx - 4, hb, 42, side, 8, 30, 16)
    // Columns of a porch along the front of the left wall.
    for (let i = 0; i < 4; i++) for (let z = 0; z < 22; z++) canvas.set(cx - 40 + i * 7, base - 10 + i * 3.5 - z, KEEP[z % 7 === 0 ? 2 : 4])
    for (let i = 0; i <= 24; i++) for (let d = 0; d < 3; d++) canvas.set(cx - 42 + i, base - 32 + i / 2 - d, KEEP[3 - d])
  } else {
    // Spires at the corners of a gothic church.
    for (const [dx, dy] of [[-20, -h - 8], [24, -h - 6]]) {
      const sp = tower(canvas, cx + dx, base + dy, 6, 56, KEEP, SLATE, true)
      cross(canvas, sp.x, sp.y, 6)
    }
    const top = hall(canvas, cx, hb, { w: 40, wall: 32, roof: 30, walls: KEEP, roofs: SLATE, masonry: true, bay: 9, glow: true, door: true })
    cross(canvas, top.x, top.y, 8)
    for (const dx of [-30, 2]) {
      const sp = tower(canvas, cx + dx, base - 6 + Math.abs(dx) / 4, 5, 38, KEEP, SLATE, true)
      finial(canvas, sp.x, sp.y, 3)
    }
    statue(canvas, cx - 44, base - 14)
    statue(canvas, cx + 30, base - 12)
    brazier(canvas, cx + 16, base - 4)
  }
  return canvas.sprite(cx, base, 0)
}

// Big double doors on the right wall of a hall standing on (cx, hb) with half-width w.
function barnDoors(canvas: Canvas, cx: number, hb: number, w: number, from = 14, to = 30, tall = 16) {
  for (let t = from; t <= to; t++) {
    const x = cx + (w - t)
    const ground = hb - w / 2 + t / 2
    for (let z = 0; z < tall; z++) canvas.set(x, ground - z, t === Math.round((from + to) / 2) ? TIMBER[0] : (t + z) % 7 === 0 ? TIMBER[1] : t % 3 === 0 ? PLANK[1] : PLANK[2])
  }
}

// A wheelbarrow standing on (x, base).
function wheelbarrow(canvas: Canvas, x: number, base: number) {
  for (let t = 0; t < 10; t++) for (let z = 2; z < 6; z++) canvas.set(x + t, base - z + t / 2, z === 5 ? PLANK[1] : PLANK[3])
  for (let t = 0; t < 8; t++) canvas.set(x - 7 + t, base - 5 + t / 2, TIMBER[1])
  for (const [dx, dy] of [[11, 4], [11, 6], [12, 5], [10, 5]]) canvas.set(x + dx, base + dy - 2, TIMBER[0])
}

// The warehouse (CLAUDE.md §6.4), two looks per level picked by the building:
//   level 1: a thatched store with sacks and logs; a plank barn with a wheelbarrow;
//   level 2: a timber-framed store under slate on a loading deck; the same with a canvas awning over its door;
//   level 3: a great stone warehouse with a horse cart; a two-storey store with a covered wagon and a shed.
function warehouse(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 80 + (level - 1) * 16)
  yard(canvas, cx, base, h, level === 1 ? SOIL : KEEP, 53)
  const hb = base - 8
  if (level === 1) {
    const w = 38
    hall(canvas, cx - 2, hb, { w, wall: 18, roof: 22, walls: v ? LOG_WALLS : WALL, roofs: v ? SHINGLE : THATCH, bay: 0, door: true })
    barnDoors(canvas, cx - 2, hb, w, 12, 24, 13)
    if (v) {
      wheelbarrow(canvas, cx + 18, base - 10)
      shadeBlobs(canvas, [{ x: cx - 18, y: base - 6, r: 4 }, { x: cx - 12, y: base - 5, r: 3.5 }], SACK, 3)
    } else {
      logPile(canvas, cx - 40, base - 14, [[0, 3], [1, 2]])
      shadeBlobs(canvas, [{ x: cx + 14, y: base - 6, r: 4 }, { x: cx + 20, y: base - 9, r: 3.5 }, { x: cx + 17, y: base - 12, r: 3 }], SACK, 3)
      barrel(canvas, cx + 28, base - 12)
    }
  } else if (level === 2) {
    const w = 42
    // A loading deck of planks along the front left.
    for (let t = 0; t < 30; t++) for (let d = 0; d < 6; d++) canvas.set(cx - 44 + t + d, base - 14 + t / 2 - d / 2 + 2, PLANK[d === 0 ? 1 : 3])
    hall(canvas, cx + 2, hb - 2, { w, wall: 26, roof: 24, walls: WALL, roofs: SLATE, bay: 14, door: true })
    barnDoors(canvas, cx + 2, hb - 2, w, 14, 28, 17)
    if (v) awning(canvas, cx + 2, hb - 2, w, ramp(0x8a7a5a, 0xc8b88e), 14, 34, 20, 12)
    crate(canvas, cx + 18, base - 8, 9)
    crate(canvas, cx + 26, base - 12, 9)
    barrel(canvas, cx - 24, base - 10)
    barrel(canvas, cx - 16, base - 6)
  } else if (!v) {
    const w = 48
    hall(canvas, cx + 2, hb - 4, { w, wall: 30, roof: 26, walls: KEEP, roofs: SLATE, masonry: true, bay: 0, door: true })
    barnDoors(canvas, cx + 2, hb - 4, w, 14, 32, 20)
    logPile(canvas, cx - 46, base - 16, [[0, 3], [1, 2]])
    cart(canvas, cx + 14, base - 4)
    // The horse in the shafts.
    shadeBlobs(canvas, [{ x: cx + 4, y: base - 10, r: 4 }, { x: cx, y: base - 13, r: 2.5 }], ramp(0x3a2416, 0x5c3a22, 0x7f5432), 23)
    crate(canvas, cx + 30, base - 14, 9)
  } else {
    const w = 42
    // A lean-to shed on the right, then the two-storey store.
    hall(canvas, cx + 30, base - h + 6, { w: 16, wall: 16, roof: 10, walls: WALL, roofs: SLATE, open: true, roofed: true })
    hall(canvas, cx - 4, hb - 2, { w, wall: 36, roof: 26, walls: WALL, roofs: SLATE, bay: 12, door: true })
    barnDoors(canvas, cx - 4, hb - 2, w, 14, 28, 18)
    for (const t of [-26, -14]) dormer(canvas, cx - 4 + t, hb - 2 - 36 - 8 + Math.abs(t) / 4, SLATE)
    // A covered wagon.
    cart(canvas, cx + 10, base - 2)
    for (let t = 0; t < 18; t++) for (let z = 0; z < 8 - Math.abs(t - 9) * 0.3; z++) canvas.set(cx + 10 + t, base - 12 - z - t * 0.3, z > 6 ? PLASTER[2] : PLASTER[4 - (t % 6 === 0 ? 1 : 0)])
    barrel(canvas, cx + 34, base - 14)
  }
  return canvas.sprite(cx, base, 0)
}

// A gilded dome sitting on (x, y), `r` pixels across half-way.
function goldDome(canvas: Canvas, x: number, y: number, r: number, onion = false) {
  const tall = Math.round(r * (onion ? 1.5 : 1))
  for (let z = 0; z <= tall; z++) {
    const f = z / tall
    const half = Math.round(onion ? r * Math.sin(Math.min(1, (1 - f) * 1.15) * Math.PI * 0.6 + 0.35) * (1 - f * 0.3) : Math.sqrt(Math.max(0, 1 - f * f)) * r)
    for (let dx = -half; dx <= half; dx++) canvas.set(x + dx, y - z, BRASS[dx < -half / 3 ? 3 : dx < half / 3 ? 2 : 1])
  }
  finial(canvas, x, y - tall, 4)
}

// An iron railing along the front left edge, from (x, y) for `length` pixels.
function railing(canvas: Canvas, x: number, y: number, length: number) {
  for (let t = 0; t <= length; t++) {
    if (t % 3 === 0) for (let z = 0; z < 9; z++) canvas.set(x + t, y + t / 2 - z, z === 8 ? BRASS[2] : STEEL_GREY[0])
    canvas.set(x + t, y + t / 2 - 7, STEEL_GREY[1])
  }
}

// A chest of coins standing on (x, base).
function chest(canvas: Canvas, x: number, base: number) {
  for (let t = 0; t < 9; t++) for (let z = 0; z < 6; z++) canvas.set(x + t, base - z + t / 2, z === 5 || t === 0 || t === 8 ? BRASS[1] : PLANK[2])
  for (let t = 1; t < 8; t++) canvas.set(x + t, base - 6 + t / 2, BRASS[3])
}

// The treasury (CLAUDE.md §6.4), two looks per level picked by the building: a squat stone strong-house under slate
// with a gilded edge (a kennel and coin chests in the second look); a gilded dome on it at level 2, behind an iron
// railing with banners, or with a balcony and armoured guards on a paved path; at level 3 a castle of a treasury
// under a great golden onion dome with gilded turrets, crenellations, chests and a cart of gold.
function treasury(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 100 + (level - 1) * 30)
  yard(canvas, cx, base, h, KEEP, 71)
  const hb = base - 8
  if (level < 3) {
    const top = hall(canvas, cx, hb, { w: 42, wall: 30 + (level - 1) * 4, roof: 20, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 0, door: true, trim: BRASS[2] })
    if (level === 2) goldDome(canvas, top.x, top.y + 6, 8)
    for (let i = 0; i < 4; i++) canvas.set(cx - 16 + i * 2, hb - 12 + i, BRASS[3])
    if (level === 1 && !v) {
      shadeBlobs(canvas, [{ x: cx + 4, y: base - 4, r: 3.5 }, { x: cx + 8, y: base - 3, r: 3 }], BRASS, 3)
      chest(canvas, cx + 16, base - 8)
    } else if (level === 1) {
      // A kennel by the wall, barrels and a chest.
      hall(canvas, cx - 30, base - 10, { w: 8, wall: 7, roof: 6, walls: LOG_WALLS, roofs: SHINGLE, bay: 0, door: true })
      barrel(canvas, cx + 18, base - 8)
      barrel(canvas, cx + 26, base - 12)
      chest(canvas, cx + 6, base - 4)
    } else if (!v) {
      railing(canvas, cx - 52, base - 22, 40)
      for (const side of [-1, 1]) drape(canvas, cx, hb, 42, side, 8, 30, 14)
      chest(canvas, cx + 14, base - 6)
      shadeBlobs(canvas, [{ x: cx + 4, y: base - 4, r: 3.5 }], BRASS, 3)
    } else {
      // A balcony on the left wall, guards in armour either side of the door.
      for (let t = 0; t < 18; t++) for (let d = 0; d < 3; d++) canvas.set(cx - 38 + t, hb - 24 + t / 2 + d, d === 0 ? PLANK[3] : TIMBER[1])
      for (let t = 0; t < 18; t += 3) for (let z = 0; z < 5; z++) canvas.set(cx - 38 + t, hb - 24 + t / 2 - z, TIMBER[0])
      for (const dx of [-26, -10]) armour(canvas, cx + dx, base - 6 + dx / 6)
      for (let t = 0; t < 20; t++) for (let d = 0; d < 6; d++) canvas.set(cx - 20 - t + d, base - 4 - t / 2 + d / 2, KEEP[(t + d) % 3 === 0 ? 2 : 3])
    }
    return canvas.sprite(cx, base, 0)
  }
  // Level 3: a walled treasury under a great golden onion dome, gilded turrets at the corners.
  for (const [dx, dy] of [[-30, -h + 2], [30, -h + 2]]) {
    const t = tower(canvas, cx + dx, base + dy, 6, 40, DARK_STONE, null, true)
    goldDome(canvas, t.x, t.y + 2, 6, true)
  }
  const top = hall(canvas, cx, hb - 4, { w: 40, wall: 40, roof: 6, walls: DARK_STONE, roofs: SLATE, masonry: true, bay: 10, glow: true, door: true, trim: BRASS[2] })
  goldDome(canvas, top.x, top.y + 8, 22, true)
  // Battlements along the top of the walls.
  for (const side of [-1, 1]) for (let t = 0; t <= 40; t++) if (t % 6 < 3) for (let z = 0; z < 3; z++) canvas.set(cx + side * (40 - t), hb - 4 - 20 + t / 2 - 40 - z, DARK_STONE[side < 0 ? 4 : 2])
  for (const dx of [-20, 18]) {
    const t = tower(canvas, cx + dx, base - 6 + Math.abs(dx) / 4, 5, 30, DARK_STONE, null, true)
    goldDome(canvas, t.x, t.y + 2, 5, true)
  }
  for (const dx of [-40, 34]) brazier(canvas, cx + dx, base - 10)
  chest(canvas, cx + 6, base - 4)
  chest(canvas, cx + 22, base - 10)
  cart(canvas, cx - 34, base - 6)
  shadeBlobs(canvas, [{ x: cx - 28, y: base - 16, r: 3 }, { x: cx - 24, y: base - 17, r: 3 }], BRASS, 5)
  return canvas.sprite(cx, base, 0)
}

// The prison (CLAUDE.md §9.7): a squat dark keep with barred slits and an iron-bound door, a yard in front fenced with
// spiked iron bars. Full, a captive queen stands in the yard behind the bars, her crown still on, a guard by the gate.
const BARS = ramp(0x16161c, 0x2a2a34, 0x464652, 0x6a6a78)
const GOWN = ramp(0x3a0a2a, 0x5a1442, 0x7e2060, 0xa4307e)
const FLESH = ramp(0x6b4630, 0x93633f, 0xb88458, 0xd8a678)
function prison(variant = 0, full = false): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 96)
  // Flagstones over the yard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 2); x <= cx + (h * 2 - 2); x++) {
      const a = (x - cx) / (h * 2 - 4)
      const b = (y - (base - h)) / (h - 2)
      if (Math.abs(a) + Math.abs(b) > 1) continue
      const seam = (x + y * 2) % 7 === 0 || (x - y * 2) % 9 === 0
      canvas.set(x, y, seam ? STONE[1] : pick(STONE, 2 + hash(x >> 2, y >> 1, 211) * 1.5))
    }
  }
  const walls = v ? SHADOW_WALLS : KEEP
  const hb = base - h + 6
  const top = hall(canvas, cx + 10, hb, { w: 30, wall: 38, roof: 16, walls, roofs: SLATE, masonry: true, door: true })
  // Barred slits along both walls.
  for (const side of [-1, 1]) {
    for (const t of [8, 16, 24]) {
      if (side < 0 && t > 16) continue
      const x0 = cx + 10 + side * (30 - t)
      const g = hb - 15 + t / 2
      for (let z = 18; z < 30; z++) for (let d = 0; d < 4; d++) canvas.set(x0 + side * d, g - z + (side * d) / 2 * side, d === 0 || d === 3 ? BARS[0] : z % 3 === 0 ? BARS[2] : BARS[0])
    }
  }
  if (full) {
    // The queen in the yard, behind the bars drawn next: a long gown, arms at her sides, a gilded crown.
    const qx = cx - 10
    const qy = base - 13
    for (let z = 0; z < 12; z++) {
      const half = z < 8 ? 4 - Math.floor(z / 3) : 1
      for (let d = -half; d <= half; d++) canvas.set(qx + d, qy - z, GOWN[d < 0 ? 3 : d === 0 ? 2 : 1])
    }
    for (let z = 12; z < 15; z++) for (let d = -1; d <= 1; d++) canvas.set(qx + d, qy - z, FLESH[d < 0 ? 3 : 2])
    for (let d = -2; d <= 2; d++) canvas.set(qx + d, qy - 15, GOWN[0])
    for (const d of [-1, 0, 1]) canvas.set(qx + d, qy - 16, BRASS[2])
    for (const d of [-1, 1]) canvas.set(qx + d, qy - 17, BRASS[3])
    canvas.set(qx, qy - 17, BRASS[1])
  }
  // Iron bars along the two front edges of the yard, spiked at the top, a gate in the middle of the left one.
  for (const side of [-1, 1]) {
    for (let t = 4; t < h * 2 - 4; t += 3) {
      const x = cx + side * t
      const y = base - 2 - t / 2
      const gate = side < 0 && t > h - 6 && t < h + 4
      const tall = gate ? 14 : 12
      for (let z = 0; z < tall; z++) canvas.set(x, y - z, z === tall - 1 ? BARS[3] : BARS[side < 0 ? 2 : 1])
      canvas.set(x, y - 5, BARS[0])
    }
    for (let t = 4; t < h * 2 - 4; t++) for (const z of [1, 9]) canvas.set(cx + side * t, base - 2 - t / 2 - z, BARS[side < 0 ? 1 : 0])
  }
  // A lantern by the door.
  canvas.set(top.x - 18, hb - 14, EMBER[2])
  canvas.set(top.x - 18, hb - 13, EMBER[1])
  if (full) {
    // Her guard at the gate, a spear on his shoulder.
    const gx = cx - h - 6
    const gy = base - h / 2 + 2
    for (let z = 0; z < 10; z++) for (let d = -1; d <= 1; d++) canvas.set(gx + d, gy - z, z < 4 ? BARS[1] : z < 9 ? CRIMSON[d < 0 ? 3 : 2] : FLESH[2])
    for (let z = 0; z < 16; z++) canvas.set(gx + 3, gy - z, z > 13 ? BLADE[2] : TIMBER[1])
  }
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The house of entertainment (CLAUDE.md §7.8): a tall half-timbered hall with a red roof and lit windows, a little
// stage under a striped canopy at its side, strings of flags across a paved yard with tables, barrels and lanterns,
// where the crown's patrols stop to drink and leave a tip.
const BUNTING = [ramp(0xa82430), ramp(0xe2c058), ramp(0x3758a4), ramp(0x2a7a48), ramp(0xf6f2e2)]
function tavern(variant = 0): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 112)
  // Flagstones over the yard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 2); x <= cx + (h * 2 - 2); x++) {
      const a = (x - cx) / (h * 2 - 4)
      const b = (y - (base - h)) / (h - 2)
      if (Math.abs(a) + Math.abs(b) > 1) continue
      const seam = (x + y * 2) % 6 === 0 || (x - y * 2) % 8 === 0
      canvas.set(x, y, seam ? PLASTER[0] : pick(PLASTER, 1 + hash(x >> 2, y >> 1, 233) * 1.6))
    }
  }
  const hb = base - h + 2
  const top = hall(canvas, cx - 6, hb, { w: 34, wall: 34, roof: 26, walls: WALL, roofs: v ? ROOF : SLATE, bay: 9, door: true, glow: true, chimney: 0.45 })
  // The stage: an open stall under a striped canopy, front right.
  const stage = hall(canvas, cx + 30, base - 10, { w: 12, wall: 14, roof: 9, walls: WALL, roofs: ROOF, open: true, cloth: v ? CRIMSON : ramp(0x23347a, 0x3758a4, 0x7a96ea) })
  // Strings of little flags sagging from the hall's front corner out to poles at the yard's edge.
  const flags = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
    for (let t = 0; t <= 1; t += 1 / 60) {
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 6
      canvas.set(x, y, TIMBER[0])
      const k = Math.floor(t * 60)
      if (k % 4 !== 0) continue
      const c = BUNTING[(k / 4 + seed) % BUNTING.length]
      for (let d = 1; d <= 3; d++) for (let e = -(3 - d) / 2; e <= (3 - d) / 2; e++) canvas.set(x + e, y + d, c[0])
    }
  }
  const pole = (x: number, y: number, tall: number) => {
    for (let z = 0; z < tall; z++) canvas.set(x, y - z, TIMBER[z === tall - 1 ? 2 : 1])
    // A lantern hung at its top.
    canvas.set(x + 1, y - tall + 2, EMBER[2])
    canvas.set(x + 1, y - tall + 3, EMBER[1])
  }
  pole(cx - 52, base - h + 4, 30)
  pole(cx, base - 2, 30)
  pole(cx + 52, base - h + 2, 30)
  flags(cx - 30, hb - 34, cx - 52, base - h + 4 - 28, 0)
  flags(cx - 30, hb - 34, cx, base - 2 - 28, 2)
  flags(cx + 6, hb - 30, cx + 52, base - h + 2 - 28, 4)
  // Tables with benches in the yard, a barrel by each.
  for (const [tx, ty] of [[cx - 30, base - 12], [cx - 12, base - 6]]) {
    for (let t = 0; t < 10; t++) for (let d = 0; d < 3; d++) canvas.set(tx + t, ty - 4 + t / 2 - d / 2, d === 0 ? PLANK[3] : PLANK[2])
    for (const leg of [1, 8]) for (let z = 0; z < 3; z++) canvas.set(tx + leg, ty - 1 + leg / 2 - z, PLANK[0])
    for (let t = 0; t < 10; t++) canvas.set(tx + t + 2, ty + 1 + t / 2, PLANK[1])
    canvas.set(tx + 3, ty - 6, BRASS[2])
    canvas.set(tx + 6, ty - 5, BRASS[3])
  }
  barrel(canvas, cx - 44, base - h + 10)
  barrel(canvas, cx + 18, base - 4)
  barrel(canvas, cx + 22, base - 6)
  // A musician on the stage: a figure with a lute.
  const mx = stage.x
  const my = base - 16
  for (let z = 0; z < 9; z++) for (let d = -1; d <= 1; d++) canvas.set(mx + d, my - z, z < 7 ? (v ? BUNTING[1][0] : CRIMSON[2 + (d < 0 ? 1 : 0)]) : FLESH[2])
  for (let d = 0; d < 4; d++) canvas.set(mx + 2 + d, my - 4 - d / 2, TIMBER[2])
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The shipyard (CLAUDE.md §8.5): a plank yard at the water's edge with a shed of tools and pitch, and a slipway with a
// hull being built on it, drawn as a real shell (keel, frames, planks) seen from the corner: bare frames on the keel at
// level 1 with staging along its far side; a second, smaller hull at level 2 while the first is planked halfway; at
// level 3 the hull planked to the gunwale, tarred below the waterline, its mast stepped and a pennant flying. Shores
// prop it on the near side; a timber derrick, sawn timber and barrels of pitch fill the yard.
const PITCH = ramp(0x1a120c, 0x2a1c12, 0x3e2a1a)
const HULL = ramp(0x3a2414, 0x5a3a20, 0x76502c, 0x93683a, 0xaa7e48)
function shipyard(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 124)
  // The plank yard.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 2); x <= cx + (h * 2 - 2); x++) {
      const a = (x - cx) / (h * 2 - 4)
      const b = (y - (base - h)) / (h - 2)
      if (Math.abs(a) + Math.abs(b) > 1) continue
      const seam = (x - y * 2) % 7 === 0
      canvas.set(x, y, seam ? PLANK[0] : pick(PLANK, 1.4 + hash(x >> 3, y >> 1, 517) * 1.4))
    }
  }
  // Points of the yard in its own frame: u along the tile x axis (toward the lower right), w along y (lower left), z up;
  // one unit is one screen pixel across. Hull pixels keep the nearest (u + w + z) so the shell hides itself properly.
  const ox = cx
  const oy = base - h
  const near = new Float32Array(canvas.width * canvas.height).fill(-1e9)
  const put = (u: number, w: number, z: number, color: number) => {
    const x = Math.round(ox + u - w)
    const y = Math.round(oy + (u + w) / 2 - z)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
    const d = u + w + z
    if (d < near[y * canvas.width + x]) return
    near[y * canvas.width + x] = d
    canvas.set(x, y, color)
  }
  const line = (a: number[], b: number[], color: number) => {
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2) + 1
    for (let i = 0; i <= n; i++) put(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2] + ((b[2] - a[2]) * i) / n, color)
  }
  // A hull on its slip: stern at u0, bow `length` further on, centred on w0. `planked` is the share of its depth planked.
  const hull = (u0: number, w0: number, length: number, beam: number, depth: number, planked: number, seed: number) => {
    const lift = 5
    // The slipway: two rails on sleepers, the keel on blocks.
    for (let u = u0 - 6; u <= u0 + length + 4; u += 0.5) for (const side of [-5, 5]) put(u, w0 + side, 0.5, TIMBER[2])
    for (let u = u0 - 4; u <= u0 + length + 2; u += 7) line([u, w0 - 8, 0], [u, w0 + 8, 0], TIMBER[1])
    for (let u = u0 + 6; u < u0 + length - 6; u += 9) for (let z = 0; z < lift; z++) for (let d = -1.5; d <= 1.5; d += 0.5) put(u, w0 + d, z, TIMBER[z === lift - 1 ? 2 : 1])
    // Its shape: half-beam along the keel (a flat transom aft, fine at the bow), rocker at the ends, sheer rising there.
    const at = (u: number) => {
      const t = (u - u0) / length
      const x = t < 0.42 ? (t - 0.42) / 0.42 : (t - 0.42) / 0.58
      const half = beam * Math.max(t < 0.42 ? 0.55 : 0, Math.pow(Math.max(0, 1 - x * x), 0.7))
      const keel = lift + 7 * Math.max(0, Math.abs(x) - 0.65) / 0.35
      const sheer = lift + depth + 4 * x * x
      return { half, keel, sheer }
    }
    const width = (u: number, z: number) => {
      const { half, keel, sheer } = at(u)
      return half * Math.pow(Math.min(1, Math.max(0, (z - keel) / (sheer - keel - depth * 0.25))), 0.45)
    }
    const waterline = lift + depth * 0.38
    const plankTo = (u: number) => {
      const { keel, sheer } = at(u)
      return keel + (sheer - keel) * planked
    }
    // The keel, stem and sternpost.
    for (let u = u0; u <= u0 + length; u += 0.5) put(u, w0, at(u).keel - 0.5, PITCH[1])
    for (let z = at(u0 + length).keel; z <= at(u0 + length).sheer + 5; z += 0.5) put(u0 + length + (z - at(u0 + length).keel) * 0.35, w0, z, TIMBER[2])
    for (let z = at(u0).keel; z <= at(u0).sheer + 2; z += 0.5) put(u0 - 1, w0, z, TIMBER[2])
    // The planked shell, strake by strake, darker on the far side and in its seams, tarred below the waterline.
    for (let u = u0; u <= u0 + length; u += 0.5) {
      const top = plankTo(u)
      for (let z = at(u).keel; z <= top; z += 0.5) {
        const half = width(u, z)
        const strake = Math.floor((z - lift) / 2.5)
        const seam = (z - lift) % 2.5 < 0.5 || Math.round(u * 2) % Math.round(22 + strake * 6) === 0
        const tarred = z < waterline
        for (const side of [1, -1]) {
          const lit = side > 0 ? 3 : 1
          const tone = tarred ? PITCH[Math.min(2, lit - 1 + (seam ? 0 : 1))] : HULL[Math.max(0, lit - (seam ? 1 : 0) + ((strake + seed) % 2 ? 0 : 1) - 1)]
          put(u, w0 + side * half, z, tone)
        }
      }
      // Planked to the gunwale: a capping rail on top, the hold open below it, crossed by deck beams.
      if (planked >= 1) {
        const half = width(u, top)
        for (const side of [1, -1]) for (let d = 0; d <= 1; d += 0.5) put(u, w0 + side * (half - d), top + 0.5, TIMBER[side > 0 ? 2 : 1])
        const beamAt = Math.round(u - u0) % 8 === 0
        for (let d = -half + 1; d <= half - 1; d += 0.5) put(u, w0 + d, top - (beamAt ? 1.5 : 7), beamAt ? HULL[2] : PITCH[(Math.round(d * 2) + Math.round(u)) % 4 === 0 ? 1 : 2])
      }
    }
    // Frames: every few units a rib from the keel up each side past the planking, and ribbands tying their heads.
    for (let u = u0 + 2; u <= u0 + length - 2; u += 4) {
      const { sheer } = at(u)
      for (let z = plankTo(u); z <= sheer; z += 0.5) for (const side of [1, -1]) put(u, w0 + side * width(u, z), z, CUT[side > 0 ? 2 : 0])
      if (planked < 1) for (let d = -width(u, sheer); d <= width(u, sheer); d += 0.5) put(u, w0 + d, sheer - 0.5, CUT[1])
    }
    if (planked < 1)
      for (let u = u0; u <= u0 + length; u += 0.5) for (const f of [1, 0.75]) for (const side of [1, -1]) {
        const { keel, sheer } = at(u)
        const z = keel + (sheer - keel) * f
        if (z > plankTo(u)) put(u, w0 + side * width(u, z), z, TIMBER[side > 0 ? 2 : 1])
      }
    // Shores propping it on the near side, staging along the far side.
    for (let u = u0 + 8; u < u0 + length - 8; u += 12) {
      const z = lift + depth * 0.55
      line([u, w0 + beam + 8, 0], [u, w0 + width(u, z) + 0.5, z], TIMBER[2])
    }
    for (let u = u0 + 4; u < u0 + length; u += 14) {
      line([u, w0 - beam - 5, 0], [u, w0 - beam - 5, lift + depth + 6], TIMBER[1])
      line([u, w0 - beam - 9, 0], [u, w0 - beam - 9, lift + depth + 4], TIMBER[0])
    }
    for (let u = u0 + 4; u <= u0 + length - 10; u += 0.5) for (let d = 5; d <= 9; d += 0.5) put(u, w0 - beam - d, lift + depth - 2, PLANK[d === 5 ? 3 : 1])
    // Finished: the mast stepped and a pennant at its head.
    if (planked >= 1) {
      const mu = u0 + length * 0.55
      const foot = at(mu).sheer
      for (let z = foot - 4; z < foot + 40; z += 0.5) for (const d of [0, 0.5]) put(mu, w0 + d, z, z > foot + 36 ? TIMBER[2] : HULL[3 - (d ? 1 : 0)])
      for (let d = 0; d < 9; d++) for (let e = 0; e <= (9 - d) / 3; e++) canvas.set(Math.round(ox + mu - w0) + 1 + d, Math.round(oy + (mu + w0) / 2 - foot - 38) + e, CRIMSON[2])
      for (let t = -12; t <= 12; t += 0.5) put(mu, w0 + t, foot + 26 - Math.abs(t) * 0.08, TIMBER[2])
    }
  }
  // The derrick at the back: two raking poles, a boom and a beam hanging from its rope.
  const dx = cx + 18
  const dy = base - h * 2 + 18
  for (let z = 0; z < 44; z++) {
    canvas.set(dx - z * 0.18, dy - z, TIMBER[2])
    canvas.set(dx + 6 - z * 0.05, dy + 3 - z, TIMBER[1])
  }
  for (let t = 0; t < 26; t++) canvas.set(dx - 8 - t, dy - 42 + t * 0.25, TIMBER[3])
  for (let z = 0; z < 16; z++) canvas.set(dx - 30, dy - 35 + z, ROPE)
  for (let t = 0; t < 12; t++) for (let d = 0; d < 2; d++) canvas.set(dx - 36 + t, dy - 19 + t / 2 + d, LOGS[2 + d])
  logPile(canvas, cx - 30, base - h * 2 + 22, [[0, 3], [1, 2]])
  // The hulls: the main one on its slip, a second, smaller one on another at level 2 and up.
  hull(-28, -10, 54, 8, 16, level >= 3 ? 1 : level >= 2 ? 0.55 : 0.12, v)
  if (level >= 2) hull(-8, 16, 34, 6, 10, level >= 3 ? 0.4 : 0.05, v + 1)
  // The shed in the left corner, its doors open on the tools and the pitch kettle.
  const top = hall(canvas, cx - 40, base - h + 6, { w: 18, wall: 18, roof: 12, walls: WALL, roofs: v ? SLATE : ROOF, door: true, chimney: 0.5 })
  barrel(canvas, cx - 18, base - 6)
  barrel(canvas, cx - 12, base - 3)
  if (level >= 3) barrel(canvas, cx - 24, base - 9)
  return smoky(canvas.sprite(cx, base, 0), [top])
}

// The crown capital's cathedral (no lord may build one): a long nave of pale stone under slate, a great bell tower at
// its front with a tall spire, a rose window of coloured glass, gilded crosses on the ridge and spire.
const ROSE = [ramp(0x7a1822), ramp(0x2a4a8a), ramp(0xe2c058), ramp(0x2a7a48)]
function cathedral(variant = 0): Sprite {
  const { canvas, cx, base, h } = footprint(3, 260)
  // A paved close round it.
  for (let y = base - h * 2; y <= base; y++) {
    for (let x = cx - (h * 2 - 2); x <= cx + (h * 2 - 2); x++) {
      const a = (x - cx) / (h * 2 - 4)
      const b = (y - (base - h)) / (h - 2)
      if (Math.abs(a) + Math.abs(b) <= 1) canvas.set(x, y, pick(KEEP, 1.4 + (((x >> 2) + (y >> 1)) % 2) * 0.6))
    }
  }
  const nave = hall(canvas, cx + 10, base - h + 4, { w: 54, wall: 56, roof: 46, walls: KEEP, roofs: variant % 2 ? SLATE : ROOF, masonry: true, bay: 9, glow: true, trim: BRASS[2] })
  // Flying buttresses along its lit side.
  for (let i = 0; i < 4; i++) {
    const t = 10 + i * 12
    const x0 = cx + 10 - (54 - t)
    const g = base - h + 4 - 27 + t / 2
    for (let z = 0; z < 40; z++) for (let d = 0; d < 3; d++) canvas.set(x0 - 4 - d + Math.min(z, 12) / 3, g - z + 2, pick(KEEP, d === 0 ? 3.5 : 2))
  }
  // Gilded cross on the ridge.
  for (let z = 0; z < 10; z++) canvas.set(nave.x, nave.y - z, BRASS[z < 9 ? 2 : 3])
  for (let d = -3; d <= 3; d++) canvas.set(nave.x + d, nave.y - 6, BRASS[2])
  // The bell tower in front, square in plan, drawn as a round tower of many courses, and its spire.
  const bx = cx - 26
  const by = base - 18
  const top = tower(canvas, bx, by, 14, 128, KEEP, SLATE, true)
  // A lantern stage and the long spire.
  for (let y = 0; y < 40; y++) {
    const half = Math.max(0.5, 6 - y / 7)
    for (let x = -Math.floor(half); x <= half; x++) canvas.set(top.x + x, top.y - y, pick(SLATE, x < 0 ? 4 : 2))
  }
  for (let z = 0; z < 12; z++) canvas.set(top.x, top.y - 40 - z, BRASS[z < 11 ? 2 : 3])
  for (let d = -3; d <= 3; d++) canvas.set(top.x + d, top.y - 47, BRASS[2])
  // The rose window on the tower's face.
  const rx = bx - 4
  const ry = by - 84
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y)
      if (d > 6) continue
      const spoke = Math.round(Math.atan2(y, x) / (Math.PI / 4)) & 3
      canvas.set(rx + x, ry + y, d > 5.2 ? BRASS[0] : d < 1.5 ? BRASS[3] : ROSE[spoke][0])
    }
  }
  // The great doors.
  for (let x = -4; x <= 4; x++) for (let z = 0; z < 16 - Math.abs(x) * 0.6; z++) canvas.set(bx + x - 1, by - 4 - z, Math.abs(x) === 4 ? BRASS[1] : PLANK[x < 0 ? 3 : 1])
  return canvas.sprite(cx, base, 0)
}

// A monument to the crown: a tall obelisk of dark stone on a stepped plinth, gilded at its tip and base, with braziers
// burning at its corners.
const BASALT = ramp(0x1c1a22, 0x2c2a36, 0x423e4e, 0x5c5868, 0x7a7686)
function monument(variant = 0): Sprite {
  const { canvas, cx, base, h } = footprint(2, 170)
  // Three steps, each a smaller diamond.
  for (let step = 0; step < 3; step++) {
    const half = h * 2 - 6 - step * 9
    const lift = step * 5
    for (let y = -half / 2; y <= half / 2; y++) {
      for (let x = -half; x <= half; x++) {
        if (Math.abs(x) / half + Math.abs(y) / (half / 2) > 1) continue
        for (let z = 0; z < 5; z++) canvas.set(cx + x, base - h + y - lift - z, pick(KEEP, z === 4 ? (x < 0 ? 4 : 3) : x < 0 ? 3 : 1.4))
      }
    }
  }
  const foot = base - h - 15
  const tall = 120
  for (let z = 0; z < tall; z++) {
    const half = 7 - (z / tall) * 4
    for (let x = -Math.round(half); x <= Math.round(half); x++) {
      const lit = x < 0
      const band = z < 4 || (z > 40 && z < 43)
      canvas.set(cx + x, foot - z, band ? BRASS[lit ? 3 : 1] : pick(BASALT, lit ? 3.2 : 1.4) + (x === 0 ? 0 : 0))
    }
  }
  // The gilded pyramidion.
  for (let y = 0; y < 9; y++) {
    const half = Math.round((y / 9) * 3)
    for (let x = -half; x <= half; x++) canvas.set(cx + x, foot - tall - 9 + y, BRASS[x < 0 ? 3 : 2])
  }
  // Carved signs down its face.
  for (let z = 50; z < 100; z += 7) for (let x = -2; x <= 2; x++) if ((x + z) % 3 === 0) canvas.set(cx + x, foot - z, BASALT[0])
  // Braziers at the four corners of the top step.
  for (const [dx, dy] of [[-20, 0], [20, 0], [0, -10], [0, 10]]) {
    const x = cx + dx
    const y = base - h + dy - 10
    for (let z = 0; z < 6; z++) canvas.set(x, y - z, BARS[2])
    canvas.set(x - 1, y - 6, EMBER[1])
    canvas.set(x + 1, y - 6, EMBER[1])
    canvas.set(x, y - 7, EMBER[2])
    canvas.set(x, y - 8, EMBER[variant % 2 ? 1 : 2])
  }
  return canvas.sprite(cx, base, 0)
}

// The mysterious fisher's hut: a crooked shack on stilts with a mossy thatch, a net drying on poles, and an odd
// violet lantern burning by the door.
const MOSS = ramp(0x2a3a1c, 0x3a4e24, 0x51662e, 0x6a7e3a, 0x86984a, 0xa4b060)
const ARCANE = ramp(0x3a1a5a, 0x6a2aa0, 0x9a4ae0, 0xd090ff)
// Four looks, picked by the building: the hut on stilts with a net and a ladder; with fish drying, a smoking stack
// and a rowboat; with lanterns, barrels and a pole; swallowed by the roots and crown of a great tree.
function fisherHut(variant = 0): Sprite {
  const v = variant % 4
  const { canvas, cx, base } = footprint(1, v === 3 ? 80 : 64)
  // A deck on stilts, then the hut on it.
  for (const dx of [-16, -6, 6, 16]) for (let z = 0; z < 9; z++) canvas.set(cx + dx, base - 3 - z + Math.round(Math.abs(dx) * 0.1), TIMBER[0])
  for (let t = -20; t <= 20; t++) for (let d = 0; d < 3; d++) canvas.set(cx + t, base - 11 + Math.abs(t) * 0.12 + d, PLANK[d === 0 ? 3 : 1])
  const top = hall(canvas, cx, base - 12, { w: 19, wall: 14, roof: 18, walls: LOGS, roofs: MOSS, bay: 0, door: true })
  // A ladder down from the deck.
  for (let z = 0; z < 10; z++) for (const dx of [0, 4]) canvas.set(cx - 14 + dx + z * 0.3, base - 10 + z, TIMBER[1])
  for (let z = 1; z < 10; z += 3) for (let dx = 0; dx < 5; dx++) canvas.set(cx - 14 + dx + z * 0.3, base - 10 + z, TIMBER[2])
  const lantern = (lx: number, ly: number) => {
    for (let z = 0; z < 14; z++) canvas.set(lx, ly - z, TIMBER[1])
    for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) canvas.set(lx + x, ly - 14 + y, Math.abs(x) === 2 || y === 0 ? TIMBER[0] : ARCANE[y < 2 ? 3 : 2])
  }
  if (v === 0) {
    for (const px of [12, 24]) for (let z = 0; z < 14; z++) canvas.set(cx + px, base - 6 - z, TIMBER[1])
    for (let y = 0; y < 9; y++) for (let x = 13; x < 24; x++) if ((x + y) % 3 === 0 || (x - y) % 3 === 0) canvas.set(cx + x, base - 18 + y + Math.round(Math.sin(x * 0.6)), STONE[3])
    lantern(cx - 22, base - 14)
  } else if (v === 1) {
    stack(canvas, top.x + 4, top.y + 10, 8, 3)
    // Fish drying on a line.
    for (let t = 0; t < 14; t++) canvas.set(cx - 30 + t, base - 26 + t / 2, TIMBER[1])
    for (let t = 1; t < 14; t += 3) for (let z = 0; z < 4; z++) canvas.set(cx - 30 + t, base - 25 + t / 2 + z, BLADE[z < 2 ? 2 : 1])
    rowboat(canvas, cx + 6, base - 4, 16)
  } else if (v === 2) {
    lantern(cx - 22, base - 14)
    lantern(cx + 20, base - 18)
    barrel(canvas, cx + 10, base - 10)
    barrel(canvas, cx + 16, base - 13)
    crate(canvas, cx - 8, base - 9, 7)
    // A pole with a crossbar, a pennant at its top.
    for (let z = 0; z < 26; z++) canvas.set(top.x + 6, top.y + 12 - z, TIMBER[1])
    for (let d = -4; d <= 4; d++) canvas.set(top.x + 6 + d, top.y - 6, TIMBER[1])
  } else {
    // Roots coiling down over the deck into the water, a dark crown of leaves over the roof.
    for (let r = 0; r < 9; r++) {
      const rx = cx - 20 + r * 5
      for (let z = 0; z < 22; z++) canvas.set(rx + Math.round(Math.sin(z * 0.4 + r) * 2), base - 2 - z + Math.abs(rx - cx) * 0.2, BARK[z % 4 === 0 ? 2 : 1])
    }
    shadeBlobs(
      canvas,
      [
        { x: cx - 14, y: top.y + 4, r: 12 },
        { x: cx + 12, y: top.y + 2, r: 13 },
        { x: cx, y: top.y - 8, r: 14 },
        { x: cx - 20, y: top.y + 16, r: 8 },
        { x: cx + 20, y: top.y + 14, r: 9 },
      ],
      ramp(0x14261a, 0x1e3a22, 0x2c5230, 0x3e6c3a),
      61,
    )
    // Vines hanging from the crown.
    for (let i = 0; i < 8; i++) for (let z = 0; z < 8 + (i % 3) * 4; z++) canvas.set(cx - 22 + i * 6, top.y + 18 + z, IVY_LEAF[(z + i) % 3])
  }
  return canvas.sprite(cx, base, 0)
}

const variants = <T>(count: number, make: (i: number) => T) => Array.from({ length: count }, (_, i) => make(i))

// 'jetty': a pier on its own (a free city's harbour), nothing but its `pier`.
export type StructureLook = BuildingKind | 'scaffold' | 'brokenWall' | 'gateY' | 'towerWall' | 'tradePostRuined' | 'jetty' | 'prisonFull' | 'cathedral' | 'monument'

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
  // Drawn as this sprite instead of its look (a crown's war camp; see campSprites.ts).
  sprite?: Sprite
  // The building it shows, for picking it on the map.
  id?: number
  // Another kingdom's building: whose it is and its colour, for the outline drawn round it under the pointer.
  owner?: { kingdom: number; tint: number }
  pier?: { x: number; y: number; w: number; h: number; along: 'x' | 'y' }
  // Wall pieces: which neighbouring tiles hold wall too (see linkWalls).
  links?: number
  // A building of a free city: the city's index in world.cities.
  city?: number
}

// Wall pieces joined to the wall pieces beside them, so a run of wall reads as one wall with corners and ends. A gate
// turns to the run it stands in: older gates were saved without their direction, and one laid before the walls
// beside it guessed it before they stood.
const RUN_X = 1 | 2
const RUN_Y = 4 | 8
export function linkWalls(structures: Structure[]): Structure[] {
  const links = wallLinks(structures.filter((s) => WALL_KINDS.has(s.look)))
  return structures.map((s) => {
    if (!WALL_KINDS.has(s.look)) return s
    const joined = links.get(`${s.x},${s.y}`) ?? 0
    let look = s.look
    if ((look === 'gate' || look === 'gateY') && !(joined & RUN_X) !== !(joined & RUN_Y)) look = joined & RUN_Y ? 'gateY' : 'gate'
    return { ...s, look, links: joined }
  })
}

// A wall piece on its own runs along x; a gate along its own run.
const lonePiece = (look: WallKind) => (look === 'gateY' ? 12 : 3)

// Variants for each look; a building picks one by its id. Building sites come in one size per footprint tile count.
// Looks for levels 2 and 3 of the buildings that can be raised; level 1 is STRUCTURE_SPRITES.
export const LEVEL_SPRITES: Partial<Record<BuildingKind, Sprite[][]>> = {
  tradePost: [2, 3].map((level) => [tradePostLevel(0, level), tradePostLevel(1, level)]),
  house: [2, 3].map((level) => variants(4, (v) => house(v, level))),
  farm: [2, 3].map((level) => variants(3, (v) => farm(v, level))),
  lumberCamp: [2, 3].map((level) => variants(2, (v) => lumberCamp(v, level))),
  forge: [2, 3].map((level) => variants(3, (v) => forge(v, level))),
  dock: [2, 3].map((level) => variants(3, (v) => dock(v, level))),
  market: [2, 3].map((level) => variants(2, (v) => market(v, level))),
  barracks: [2, 3].map((level) => variants(2, (v) => barracks(v, level))),
  spyHouse: [2, 3].map((level) => variants(2, (v) => spyHouse(v, level))),
  watchtower: [2, 3].map((level) => variants(2, (v) => watchtower(v, level))),
  university: [2, 3].map((level) => [university(level)]),
  hospital: [2, 3].map((level) => variants(2, (v) => hospital(v, level))),
  temple: [2, 3].map((level) => variants(2, (v) => temple(v, level))),
  warehouse: [2, 3].map((level) => variants(2, (v) => warehouse(v, level))),
  treasury: [2, 3].map((level) => variants(2, (v) => treasury(v, level))),
  shipyard: [2, 3].map((level) => variants(2, (v) => shipyard(v, level))),
}

// The palace in each kingdom colour and at each level, made when first seen.
const palaces = new Map<string, Sprite>()
export const palaceIn = (color: string | undefined, level = 1): Sprite => {
  const hue = color && color in KINGDOM_COLORS ? color : 'royal'
  const key = `${hue}:${level}`
  if (!palaces.has(key)) palaces.set(key, palace(hue === 'royal' ? ROYAL : KINGDOM_COLORS[hue as KingdomColor].roofs, level))
  return palaces.get(key)!
}

// The variants a building shows at its level.
export const looksOf = (look: StructureLook, level = 1): Sprite[] =>
  look === 'tradePostRuined'
    ? ruinedTradeAt(Math.max(1, Math.min(3, level)))
    : look !== 'scaffold' && look !== 'brokenWall' && look !== 'gateY' && look !== 'towerWall' && look !== 'jetty' && look !== 'prisonFull' && look !== 'cathedral' && look !== 'monument' && level > 1
      ? (LEVEL_SPRITES[look]?.[level - 2] ?? STRUCTURE_SPRITES[look])
      : STRUCTURE_SPRITES[look]

export const STRUCTURE_SPRITES: Record<StructureLook, Sprite[]> = {
  palace: [palace()],
  house: variants(4, (v) => house(v)),
  farm: variants(3, (v) => farm(v)),
  lumberCamp: variants(2, (v) => lumberCamp(v)),
  forge: variants(3, (v) => forge(v)),
  tradePost: [tradePostLevel(0, 1), tradePostLevel(1, 1)],
  tradePostRuined: [0, 1].map((v) => ruinOf(tradePostLevel(v, 1), 42 + v)),
  dock: variants(3, (v) => dock(v)),
  market: variants(2, (v) => market(v)),
  barracks: variants(2, (v) => barracks(v)),
  spyHouse: variants(2, (v) => spyHouse(v)),
  watchtower: variants(2, (v) => watchtower(v)),
  wall: [wallLook('wall', 3, 0)],
  gate: [wallLook('gate', 3, 0)],
  gateY: [wallLook('gateY', 12, 0)],
  towerWall: [wallLook('towerWall', 3, 0)],
  university: [university()],
  hospital: variants(2, (v) => hospital(v)),
  temple: variants(2, (v) => temple(v)),
  warehouse: variants(2, (v) => warehouse(v)),
  treasury: variants(2, (v) => treasury(v)),
  fisherHut: variants(4, (v) => fisherHut(v)),
  prison: variants(2, (v) => prison(v)),
  prisonFull: variants(2, (v) => prison(v, true)),
  tavern: variants(2, (v) => tavern(v)),
  shipyard: variants(2, (v) => shipyard(v)),
  // A crown capital's own, never a lord's.
  cathedral: variants(2, (v) => cathedral(v)),
  monument: variants(2, (v) => monument(v)),
  brokenWall: [wallLook('brokenWall', 3, 0)],
  scaffold: [scaffold(1), scaffold(2), scaffold(3)],
  jetty: [new Canvas(1, 1).sprite(0, 0, 0)],
}

export const VILLAGER_SPRITES = [SACK, CLOTH[2], CLOTH[1], CLOTH[3]].map((tunic) => [peasant(0, tunic), peasant(1, tunic)])

const FOUNDATION = ramp(0x4a4650, 0x625e68, 0x7a7680, 0x928e96, 0xaaa6aa)
const BANK = ramp(0x3a2818, 0x4e3620, 0x64472a, 0x7a5834, 0x5f8c3a)
const FOOTING = ramp(0x26242c, 0x34323c, 0x46444e, 0x54525c, 0x5f8c3a)
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
  // Drawn in depth order with the buildings like a solid part, but walked over (what stands on a field).
  stands?: boolean
}

const made = new Map<string, Sprite>()
const once = (key: string, make: () => Sprite) => made.get(key) ?? (made.set(key, make()), made.get(key)!)

// On a slope a building stands level at the height of its highest corner, on a stone base (an earth bank for
// fields) reaching down to the ground.
export function structureParts(world: World, s: Structure): Part[] {
  const at = (x: number, y: number) => Math.round(heightAt(world, x, y))
  if (s.look === 'jetty') return s.pier ? [pierPart(s, s.pier, at)] : []
  // A sprite of its own (a camp's tent or squad) stands on its lowest corner, without a base.
  if (s.sprite) {
    const z = Math.min(at(s.x, s.y), at(s.x, s.y + s.size), at(s.x + s.size, s.y + s.size), at(s.x + s.size, s.y)) + 1
    return [{ sprite: s.sprite, fx: s.x + s.size, fy: s.y + s.size, z, solid: true }]
  }
  const back = at(s.x, s.y)
  const left = at(s.x, s.y + s.size)
  const front = at(s.x + s.size, s.y + s.size)
  const right = at(s.x + s.size, s.y)
  const low = Math.min(back, left, front, right)
  const high = Math.max(back, left, front, right)
  const fx = s.x + s.size
  const fy = s.y + s.size
  const looks = WALL_KINDS.has(s.look)
    ? [wallLook(s.look as WallKind, s.links ?? lonePiece(s.look as WallKind), s.variant)]
    : s.look === 'scaffold' ? [STRUCTURE_SPRITES.scaffold[s.size - 1]] : s.look === 'palace' ? [palaceIn(s.color, s.level)] : looksOf(s.look, s.level)
  // Fields are walked over; gates are walked through but stand tall like the wall around them.
  const flat = s.look === 'farm'
  const parts: Part[] = []
  let z = at(s.x + s.size / 2, s.y + s.size / 2)
  // Shore buildings (the dock house, the fisher's hut) stand on a steep bank: raised to its top they would sit on a
  // tall block of stone high above their jetty. They sit low instead, by the water, cut into the bank behind them.
  const shore = s.look === 'dock' || s.look === 'fisherHut'
  if (shore && high - low >= LEVEL_TOLERANCE) z = low + 1
  else if (high - low >= LEVEL_TOLERANCE) {
    z = high + 1
    const key = `plinth:${s.size}:${left}:${front}:${right}:${z}:${flat}`
    // The watchtower stands on rough stone like its own footing, not on a paved slab.
    const colors = flat ? BANK : s.look === 'watchtower' ? FOOTING : FOUNDATION
    const base = once(`${key}:${s.look === 'watchtower'}`, () => plinth(s.size, left, front, right, z, colors, flat || s.look === 'watchtower' ? 0 : 3))
    parts.push({ sprite: base, fx, fy, z: front, solid: !flat })
  }
  parts.push({ sprite: looks[s.variant % looks.length], fx, fy, z, solid: !flat })
  if (s.look === 'farm' && (s.level ?? 1) >= 2) parts.push({ sprite: once(`farmProps:${s.level}:${s.variant % 3}`, () => farmProps(s.level!, s.variant)), fx, fy, z, solid: false, stands: true })
  if (s.pier) parts.push(pierPart(s, s.pier, at))
  return parts
}

// A jetty reaching out over the water from the building (or, for a jetty on its own, from the tile it is given at).
function pierPart(s: Structure, p: NonNullable<Structure['pier']>, at: (x: number, y: number) => number): Part {
  // The deck starts level with the bank it leaves from.
  const shore = p.along === 'x' ? { x: p.x < s.x ? p.x + p.w : p.x, y: p.y + p.h / 2 } : { x: p.x + p.w / 2, y: p.y < s.y ? p.y + p.h : p.y }
  const lift = Math.max(5, Math.min(14, at(shore.x, shore.y) + 2))
  const outward = p.along === 'x' ? p.x >= s.x : p.y >= s.y
  const sprite = once(`pier:${p.w}:${p.h}:${p.along}:${lift}:${outward}`, () => pier(p.w, p.h, p.along, lift, outward))
  return { sprite, fx: p.x + p.w, fy: p.y + p.h, z: 0, solid: false }
}
