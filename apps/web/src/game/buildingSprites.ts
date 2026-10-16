import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt } from '@game/shared'
import type { BuildingKind, KingdomColorId, World } from '@game/shared'
import { BARK, Canvas, CLOTH, GLASS, ROOF, SACK, STONE, TIMBER, WALL, diamondAt, ellipseAt, pick, ramp, rgb, shadeBlobs, shadow } from './sprites'
import type { Sprite } from './sprites'
import { WALL_KINDS, wallLinks, wallLook } from './wallSprites'
import type { WallKind } from './wallSprites'
import { CHIMNEYS, smoky, stillOf } from './buildingKit'
import { farm, farmProps } from './farms'
import { house } from './houses'
import { palaceModel } from './castle'
import { forge, lumberCamp } from './industry'
import { market, tavern, tradePost as tradePostLevel, treasury } from './civic'
import { barracks, prison, spyHouse, watchtower } from './military'
import { hospital, temple, university } from './learning'
import { dock, fisherHut } from './waterside'
import { citadel, guildHall, memorial } from './works'

export { CHIMNEYS }

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
const LOGS = ramp(0x3a2616, 0x5a3c22, 0x7a5432, 0x9a7044)
const CUT = ramp(0x8a6a40, 0xc8a46a, 0xe2c48a)
const SOIL = ramp(0x3a2818, 0x4e3620, 0x64472a, 0x7a5834)
// Canopy cloths: shade, colour, light stripe.
const CANOPY = ramp(0x7a2a26, 0xa8423a, 0xe9dcc0)
const EMBER = ramp(0x8a2a10, 0xe0641c, 0xffb040)
const PLANK = ramp(0x3a2818, 0x5a3e24, 0x7a5834, 0x9a7444, 0xb08a54)
const WATER_FOAM = rgb(0xd8eef4)
const BRASS = ramp(0x7a5a18, 0xb08a2a, 0xe2c058, 0xfff0a0)
const CRIMSON = ramp(0x4a0e14, 0x7a1822, 0xa82430, 0xcc3a40)
const FLAG = ramp(0x7a1c1c, 0xb02a24, 0xd84a3a)

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

const STEEL_GREY = ramp(0x3c4048, 0x6a707a, 0xa8b0bc, 0xd6dae0)

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
  // From the anchor up only: a solid below the anchor would throw its shadow toward the sun.
  canvas.solid(diamondAt(cx, base - h, w), 0, top - front)
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

// A builder at a building site, facing right: hammer raised (0) and struck (1), or walking with a plank on the
// shoulder (2, 3). A leather apron over the tunic and a cloth cap.
function builder(frame: number, tunic: Uint32Array, cap: Uint32Array): Sprite {
  const canvas = new Canvas(18, 24)
  const cx = 8
  const base = 22
  const SKIN = rgb(0xb88458)
  const walking = frame >= 2
  const stride = !walking ? 0 : frame === 2 ? 1 : -1
  // Feet apart while hammering, striding while carrying.
  canvas.set(cx - 1 - stride, base, TIMBER[0])
  canvas.set(cx + 1 + stride, base, TIMBER[0])
  if (!walking) canvas.set(cx + 2, base, TIMBER[0])
  for (let y = base - 8; y < base; y++) {
    const half = y > base - 3 ? 1.5 : 1
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) canvas.set(x, y, tunic[x < cx ? 2 : x === cx ? 1 : 0])
  }
  for (let y = base - 6; y < base - 1; y++) canvas.set(cx + 1, y, PLANK[y === base - 6 ? 3 : 2])
  canvas.set(cx, base - 9, SKIN)
  canvas.set(cx + 1, base - 9, rgb(0x93633f))
  for (let x = cx - 1; x <= cx + 1; x++) canvas.set(x, base - 10, cap[x < cx ? 2 : 1])
  canvas.set(cx - 1, base - 11, cap[2])
  canvas.set(cx, base - 11, cap[1])
  if (frame === 0) {
    // The arm up, the hammer over the head.
    canvas.set(cx + 2, base - 7, SKIN)
    canvas.set(cx + 2, base - 8, SKIN)
    for (let z = 9; z <= 12; z++) canvas.set(cx + 2, base - z, TIMBER[3])
    for (let x = cx + 1; x <= cx + 4; x++) canvas.set(x, base - 13, STEEL_GREY[x === cx + 4 ? 1 : 2])
    canvas.set(cx + 4, base - 14, STEEL_GREY[3])
  } else if (frame === 1) {
    // The arm down and out, the hammer on the timber.
    canvas.set(cx + 2, base - 6, SKIN)
    canvas.set(cx + 3, base - 5, SKIN)
    canvas.set(cx + 4, base - 4, TIMBER[3])
    canvas.set(cx + 5, base - 3, TIMBER[3])
    for (let y = base - 4; y <= base - 1; y++) canvas.set(cx + 6, y, STEEL_GREY[y === base - 4 ? 3 : 2])
    canvas.set(cx + 7, base - 2, rgb(0xe8d8a8))
  } else {
    // A plank across the shoulder.
    for (let x = cx - 7; x <= cx + 7; x++) {
      const dip = x > cx + 3 ? 1 : x < cx - 4 ? -1 : 0
      canvas.set(x, base - 8 + dip, PLANK[x < cx ? 3 : 4])
      canvas.set(x, base - 7 + dip, PLANK[1])
    }
    canvas.set(cx + 2, base - 6, SKIN)
  }
  shadow(canvas, cx, base, 3)
  return canvas.sprite(cx, base, 0)
}

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

// Barn reds (the second look an older, ox-blood barn) and the white of its trim.
const BARN_RED = ramp(0x4a1610, 0x6e2014, 0x962c1a, 0xbc3e22, 0xd8582e, 0xec7a46)
const BARN_OLD = ramp(0x3a1812, 0x56241a, 0x763224, 0x94402c, 0xae5238, 0xc46a4c)
const BARN_TRIM = ramp(0x8a867e, 0xbab6ac, 0xe2ded4, 0xf6f3ea)
const BARN_DARK = rgb(0x1a1c26)

// A barn standing with its front corner on (fx, fy): its gable end (`a` pixels across) faces the front left, its long
// side (`b` pixels) the front right, walls `wall` high under a gambrel roof `peak` high. Red boards upright, white
// trim at the corners and along the roof's edge, a big cross-braced door and a hay-loft hatch in the gable, windows
// in the side. Drawn as the model it is (u across the gable, v along the side, z up), back surfaces first.
function barn(canvas: Canvas, fx: number, fy: number, o: { a: number; b: number; wall: number; peak: number; reds: Uint32Array; windows: number }) {
  const { a: A, b: B, wall: W, peak: P, reds } = o
  const at = (u: number, v: number, z: number) => [fx - u + v, fy - u / 2 - v / 2 - z] as const
  const put = (u: number, v: number, z: number, c: number) => {
    const [x, y] = at(u, v, z)
    canvas.set(x, y, c)
  }
  // The gambrel: steep from the eaves to a knee, then gently up to the ridge.
  const roofAt = (u: number) => {
    const s = Math.max(0, Math.min(u, A - u)) / (A / 2)
    return s < 0.32 ? P * 0.62 * (s / 0.32) : P * (0.62 + 0.38 * ((s - 0.32) / 0.68))
  }
  const board = (k: number, salt: number) => (k % 3 < 0.6 ? 0 : hash(Math.floor(k / 3), salt, 61) > 0.78 ? 1 : hash(Math.floor(k / 3), salt + 1, 61) < 0.15 ? -1 : 0)
  const step = 0.5
  // A roof surface sampled across u: each sample is drawn down to the next one's height too, so the steep part of the
  // gambrel leaves no holes between samples.
  const slope = (u0: number, u1: number, zOf: (u: number) => number, color: (u: number, v: number) => number) => {
    for (let u = u0; u <= u1; u += 0.25) {
      const z = zOf(u)
      const next = zOf(Math.min(u1, u + 0.25))
      for (let v = -1; v <= B + 2; v += step) {
        const c = color(u, v)
        for (let zz = Math.min(z, next); zz <= Math.max(z, next); zz += 0.5) put(u, v, zz, c)
        put(u, v, z, c)
      }
    }
  }
  // The far slope of the roof (lit), behind everything.
  slope(A / 2, A + 2, (u) => W + roofAt(Math.min(u, A)) - Math.max(0, u - A) * 0.8, (_, v) => SLATE[Math.floor(v) % 5 === 0 ? 3 : 4])
  // The long side, in shade: boards, white corner posts and sill, windows with white frames.
  for (let v = 0; v <= B; v += step) {
    for (let z = 0; z <= W; z += step) {
      let c = reds[2 + board(v, 7)]
      if (v % 3 < 0.6) c = reds[1]
      if (v < 1.5 || v > B - 1.5 || z < 1.5 || z > W - 1) c = BARN_TRIM[1]
      for (let k = 0; k < o.windows; k++) {
        const mid = B * (0.42 + (0.46 * (k + 0.5)) / o.windows)
        const lo = W * 0.42
        const hi = W * 0.76
        if (Math.abs(v - mid) <= 4 && z >= lo && z <= hi) c = Math.abs(v - mid) > 2.8 || z < lo + 1.2 || z > hi - 1.2 ? BARN_TRIM[1] : Math.abs(v - mid) < 0.6 ? BARN_TRIM[0] : BARN_DARK
      }
      put(0, v, z, c)
    }
  }
  // The near slope of the roof, over the long side and out past it.
  slope(-2.5, A / 2, (u) => (u < 0 ? W + u * 0.7 : W + roofAt(u)), (u, v) => {
    const row = Math.floor((u < 0 ? 0 : roofAt(u)) / 2.5)
    if (u < -1.6) return BARN_TRIM[1]
    if (u > A / 2 - 0.8) return SLATE[4]
    return SLATE[(row & 1 ? 2 : 3) + (hash(Math.floor(v / 2), row, 63) > 0.85 ? -1 : 0)]
  })
  // The gable end, lit: boards up to the roof line, white trim round it, the hay-loft hatch and the big door.
  const doorW = Math.round(A * 0.26)
  const doorH = Math.round(W * 0.78)
  for (let u = 0; u <= A; u += step) {
    const top = W + roofAt(u)
    for (let z = 0; z <= top; z += step) {
      let c = reds[3 + board(u, 3)]
      if (u % 3 < 0.6) c = reds[2]
      if (u < 1.5 || u > A - 1.5 || z < 1.5 || z > top - 1.6 || Math.abs(z - W) < 0.6) c = BARN_TRIM[3]
      const du = u - A / 2
      // The hay-loft hatch.
      if (Math.abs(du) <= 4.5 && z >= W + 2 && z <= W + 2 + P * 0.42) c = Math.abs(du) > 3.2 || z < W + 3.2 || z > W + 0.8 + P * 0.42 ? BARN_TRIM[3] : BARN_DARK
      // The door: planks in a white frame, braced by a cross.
      if (Math.abs(du) <= doorW && z <= doorH) {
        const fu = (du + doorW) / (doorW * 2)
        const fz = z / doorH
        const edge = Math.abs(du) > doorW - 1.4 || z > doorH - 1.4
        const cross = Math.abs(fu - fz) < 0.07 || Math.abs(fu - (1 - fz)) < 0.07
        c = edge || cross ? BARN_TRIM[3] : Math.floor(du + doorW) % 3 === 0 ? PLANK[2] : PLANK[4]
      }
      put(u, 0, z, c)
    }
  }
  // The roof's edge over the gable.
  for (let u = -2.5; u <= A + 2.5; u += 0.25) {
    const z = u < 0 ? W + u * 0.7 : u > A ? W - (u - A) * 0.7 : W + roofAt(u)
    put(u, -1, z + 0.5, SLATE[2])
    put(u, -1, z + 1, BARN_TRIM[3])
  }
  // Its shape for the shadow: the walls, and the roof roughly as a box under its ridge.
  const foot = [at(0, 0, 0), at(A, 0, 0), at(A, B, 0), at(0, B, 0)].flat()
  canvas.solid(foot, 0, W)
  canvas.solid(foot, W, W + P * 0.8)
}

// Square bales of hay standing on (x, base).
function bale(canvas: Canvas, x: number, base: number) {
  for (let t = 0; t < 8; t++) for (let z = 0; z < 6; z++) canvas.set(x + t, base - z + t / 2, z === 5 ? THATCH[5] : z === 2 ? THATCH[2] : THATCH[t < 4 ? 4 : 3])
  for (let t = 0; t < 6; t++) for (let d = 0; d < 3; d++) canvas.set(x - t, base - 5 + t / 2 - d + 0.5, THATCH[5 - (d & 1)])
}

// The warehouse (CLAUDE.md §6.4), a red barn, two looks per level picked by the building (bright red, or older
// ox-blood boards): level 1 a small barn with hay bales; level 2 a bigger one with a lean-to beside it and crates;
// level 3 a great barn with a stone silo behind it, a lean-to and a hay cart.
function warehouse(variant = 0, level = 1): Sprite {
  const v = variant % 2
  const { canvas, cx, base, h } = footprint(2, 80 + (level - 1) * 16)
  yard(canvas, cx, base, h, level === 1 ? SOIL : KEEP, 53)
  const reds = v ? BARN_OLD : BARN_RED
  const size = [
    { a: 30, b: 40, wall: 20, peak: 18, windows: 1 },
    { a: 34, b: 46, wall: 24, peak: 21, windows: 2 },
    { a: 38, b: 52, wall: 28, peak: 24, windows: 2 },
  ][level - 1]
  // Centred on the footprint (2 tiles: 64 pixels a side in u and v).
  const u0 = (64 - size.a) / 2 + 4
  const v0 = (64 - size.b) / 2 - (level > 1 ? 6 : 0)
  const fx = cx - u0 + v0
  const fy = base - u0 / 2 - v0 / 2
  if (level === 3) {
    // The silo behind, to the left.
    tower(canvas, cx - 30, base - 46, 9, 50, KEEP, SLATE)
  }
  if (level > 1) {
    // A lean-to beside the long side's far end: a low shed under a single slope.
    const lu = size.a * 0.62
    const lv0 = size.b
    const lv1 = size.b + 14
    const lw = size.wall * 0.62
    const put = (u: number, vv: number, z: number, c: number) => canvas.set(fx - u + vv, fy - u / 2 - vv / 2 - z, c)
    for (let vv = lv0; vv <= lv1; vv += 0.5) for (let z = 0; z <= lw; z += 0.5) put(0, vv, z, vv > lv1 - 1.2 || z < 1.2 ? BARN_TRIM[1] : vv % 3 < 0.6 ? reds[1] : reds[2])
    for (let u = 0; u <= lu; u += 0.5) for (let z = 0; z <= lw + (u / lu) * 6; z += 0.5) put(u, lv1, z, u > lu - 1.2 || z < 1.2 ? BARN_TRIM[2] : u % 3 < 0.6 ? reds[2] : reds[3])
    for (let u = -2; u <= lu; u += 0.5) for (let vv = lv0; vv <= lv1 + 1.5; vv += 0.5) put(u, vv, lw + (Math.max(0, u) / lu) * 6, u < -1.2 ? BARN_TRIM[1] : SLATE[Math.floor(u / 2.5) & 1 ? 2 : 3])
    const foot = [[0, lv0], [lu, lv0], [lu, lv1], [0, lv1]].flatMap(([u, vv]) => [fx - u + vv, fy - u / 2 - vv / 2])
    canvas.solid(foot, 0, lw + 6)
  }
  barn(canvas, fx, fy, { ...size, reds })
  if (level === 1) {
    bale(canvas, cx - 40, base - 14)
    bale(canvas, cx - 32, base - 10)
    bale(canvas, cx - 36, base - 18)
  } else if (level === 2) {
    crate(canvas, cx - 36, base - 12, 9)
    bale(canvas, cx - 26, base - 8)
    barrel(canvas, cx - 42, base - 18)
  } else {
    cart(canvas, cx - 40, base - 12)
    for (let t = 0; t < 14; t++) for (let z = 0; z < 6 - Math.abs(t - 7) * 0.5; z++) canvas.set(cx - 40 + t, base - 20 - z + t / 2, THATCH[4 - (t % 4 === 0 ? 1 : 0)])
    bale(canvas, cx - 22, base - 6)
  }
  return canvas.sprite(cx, base, 0)
}

// The prison (CLAUDE.md §9.7): a squat dark keep with barred slits and an iron-bound door, a yard in front fenced with
// spiked iron bars. Full, a captive queen stands in the yard behind the bars, her crown still on, a guard by the gate.
const BARS = ramp(0x16161c, 0x2a2a34, 0x464652, 0x6a6a78)

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

// ---- The great works of a 5th-level palace (CLAUDE.md §9.8) ---------------------------------------------------------

// A record whose entries are made when first read (sprites take a while to draw; most are never shown).
function lazy<T>(makers: Record<string, () => T>): Record<string, T> {
  const out = {} as Record<string, T>
  for (const [key, make] of Object.entries(makers)) {
    Object.defineProperty(out, key, {
      enumerable: true,
      configurable: true,
      get() {
        const value = make()
        Object.defineProperty(out, key, { value, enumerable: true })
        return value
      },
    })
  }
  return out
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
export const LEVEL_SPRITES: Partial<Record<BuildingKind, Sprite[][]>> = lazy({
  tradePost: () => [2, 3].map((level) => [tradePostLevel(0, level), tradePostLevel(1, level)]),
  house: () => [2, 3].map((level) => variants(4, (v) => house(v, level))),
  farm: () => [2, 3].map((level) => variants(3, (v) => farm(v, level))),
  lumberCamp: () => [2, 3].map((level) => variants(2, (v) => lumberCamp(v, level))),
  forge: () => [2, 3].map((level) => variants(3, (v) => forge(v, level))),
  dock: () => [2, 3].map((level) => variants(3, (v) => dock(v, level))),
  market: () => [2, 3].map((level) => variants(2, (v) => market(v, level))),
  barracks: () => [2, 3].map((level) => variants(2, (v) => barracks(v, level))),
  spyHouse: () => [2, 3].map((level) => variants(2, (v) => spyHouse(v, level))),
  watchtower: () => [2, 3].map((level) => variants(2, (v) => watchtower(v, level))),
  university: () => [2, 3].map((level) => [university(level)]),
  hospital: () => [2, 3].map((level) => variants(2, (v) => hospital(v, level))),
  temple: () => [2, 3].map((level) => variants(2, (v) => temple(v, level))),
  warehouse: () => [2, 3].map((level) => variants(2, (v) => warehouse(v, level))),
  treasury: () => [2, 3].map((level) => variants(2, (v) => treasury(v, level))),
  shipyard: () => [2, 3].map((level) => variants(2, (v) => shipyard(v, level))),
  citadel: () => [2, 3].map((level) => variants(2, (v) => citadel(v, level))),
  memorial: () => [2, 3].map((level) => variants(2, (v) => memorial(v, level))),
  guildHall: () => [2, 3].map((level) => variants(2, (v) => guildHall(v, level))),
})

// The palace in each kingdom colour and at each level, made when first seen.
const palaces = new Map<string, Sprite>()
export const palaceIn = (color: string | undefined, level = 1): Sprite => {
  const hue = color && color in KINGDOM_COLORS ? color : 'royal'
  const key = `${hue}:${level}`
  const roofs = hue === 'royal' ? ROYAL : KINGDOM_COLORS[hue as KingdomColor].roofs
  // A lord's palace is drawn as a model; the crown capitals' royal keep (level 6) keeps its own drawing.
  if (!palaces.has(key)) palaces.set(key, level >= 6 ? palace(roofs, level) : palaceModel(roofs, level))
  return palaces.get(key)!
}

// The variants a building shows at its level.
export const looksOf = (look: StructureLook, level = 1): Sprite[] =>
  look === 'tradePostRuined'
    ? ruinedTradeAt(Math.max(1, Math.min(3, level)))
    : look !== 'scaffold' && look !== 'brokenWall' && look !== 'gateY' && look !== 'towerWall' && look !== 'jetty' && look !== 'prisonFull' && look !== 'cathedral' && look !== 'monument' && level > 1
      ? (LEVEL_SPRITES[look]?.[level - 2] ?? STRUCTURE_SPRITES[look])
      : STRUCTURE_SPRITES[look]

export const STRUCTURE_SPRITES: Record<StructureLook, Sprite[]> = lazy({
  palace: () => [palaceModel(ROYAL)],
  house: () => variants(4, (v) => house(v)),
  farm: () => variants(3, (v) => farm(v)),
  lumberCamp: () => variants(2, (v) => lumberCamp(v)),
  forge: () => variants(3, (v) => forge(v)),
  tradePost: () => [tradePostLevel(0, 1), tradePostLevel(1, 1)],
  tradePostRuined: () => [0, 1].map((v) => ruinOf(tradePostLevel(v, 1), 42 + v)),
  dock: () => variants(3, (v) => dock(v)),
  market: () => variants(2, (v) => market(v)),
  barracks: () => variants(2, (v) => barracks(v)),
  spyHouse: () => variants(2, (v) => spyHouse(v)),
  watchtower: () => variants(2, (v) => watchtower(v)),
  wall: () => [wallLook('wall', 3, 0)],
  gate: () => [wallLook('gate', 3, 0)],
  gateY: () => [wallLook('gateY', 12, 0)],
  towerWall: () => [wallLook('towerWall', 3, 0)],
  university: () => [university()],
  hospital: () => variants(2, (v) => hospital(v)),
  temple: () => variants(2, (v) => temple(v)),
  warehouse: () => variants(2, (v) => warehouse(v)),
  treasury: () => variants(2, (v) => treasury(v)),
  fisherHut: () => variants(4, (v) => fisherHut(v)),
  prison: () => variants(2, (v) => prison(v)),
  prisonFull: () => variants(2, (v) => prison(v, true)),
  tavern: () => variants(2, (v) => tavern(v)),
  shipyard: () => variants(2, (v) => shipyard(v)),
  citadel: () => variants(2, (v) => citadel(v)),
  memorial: () => variants(2, (v) => memorial(v)),
  guildHall: () => variants(2, (v) => guildHall(v)),
  // A crown capital's own, never a lord's.
  cathedral: () => variants(2, (v) => cathedral(v)),
  monument: () => variants(2, (v) => monument(v)),
  brokenWall: () => [wallLook('brokenWall', 3, 0)],
  scaffold: () => [scaffold(1), scaffold(2), scaffold(3)],
  jetty: () => [new Canvas(1, 1).sprite(0, 0, 0)],
})

export const VILLAGER_SPRITES = [SACK, CLOTH[2], CLOTH[1], CLOTH[3]].map((tunic) => [peasant(0, tunic), peasant(1, tunic)])
// Builders at work on a site, in a few tunics and caps: hammer up, hammer down, two walking steps with a plank.
export const BUILDER_SPRITES = [
  [SACK, CLOTH[0]],
  [CLOTH[2], CLOTH[1]],
  [CLOTH[3], SACK],
].map(([tunic, cap]) => [0, 1, 2, 3].map((frame) => builder(frame, tunic, cap)))

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
  // What moves on the map (see buildingKit → animate) shows its still look, the moving parts laid over it.
  parts.push({ sprite: stillOf(looks[s.variant % looks.length]), fx, fy, z, solid: !flat })
  if (s.look === 'farm' && (s.level ?? 1) >= 2) parts.push({ sprite: stillOf(once(`farmProps:${s.level}:${s.variant % 3}`, () => farmProps(s.level!, s.variant))), fx, fy, z, solid: false, stands: true })
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
