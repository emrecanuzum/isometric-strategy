// The minimap's frame and the gilded fittings at its four tips (CLAUDE.md §11), painted pixel by pixel in screen space:
// the diamond's edges are true 2:1 isometric staircases, every band is shaded by the light from the top left, and tones
// meet through an ordered dither. One art pixel is one CSS pixel; the canvases are shown nearest-neighbour.

type RGB = [number, number, number]

const hex = (h: string): RGB => {
  const v = parseInt(h.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

const INK = hex('#120d0b')
// Ramps from light to dark.
const GOLD = ['#fff4c0', '#f2d16b', '#d9aa3e', '#a8781f', '#6b4a12', '#3e2a0a'].map(hex)
const WOOD = ['#b08452', '#8f6740', '#74512f', '#5a3d24', '#432c19', '#2c1c10'].map(hex)
const STONE = ['#c9c1ae', '#a39a86', '#7f7765', '#5f584a', '#423d33'].map(hex)
const RED = ['#e0705a', '#b8432f', '#8f2c1f', '#661b13', '#3f0f0a'].map(hex)

// The 4×4 Bayer matrix, 0..15: a pixel takes the darker tone when the share is above its cell.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// A tone from a ramp at a fractional index, the step between two tones dithered.
function tone(ramp: RGB[], at: number, x: number, y: number): RGB {
  const i = Math.max(0, Math.min(ramp.length - 1, at))
  const lo = Math.floor(i)
  return i - lo > dither(x, y) ? ramp[Math.min(ramp.length - 1, lo + 1)] : ramp[lo]
}

// How much an edge faces the light (top left): its outward normal against the light. The four edges of a 2:1 diamond
// have normals (±1, ±2)/√5; the top-left edge is the brightest, the bottom-right the darkest.
function facing(dx: number, dy: number) {
  const nx = dx < 0 ? -1 : 1
  const ny = dy < 0 ? -2 : 2
  // Light from the top left, a little more from above.
  return -(nx * 0.55 + ny * 0.83) / Math.sqrt(5)
}

// Distance of a pixel from a 2:1 diamond's edge, in vertical pixels: positive outside, negative inside.
function outside(px: number, py: number, cx: number, cy: number, a: number) {
  const b = a / 2
  const d = Math.abs(px - cx) / a + Math.abs(py - cy) / b
  return (d - 1) * b
}

export interface FrameSize {
  // The map diamond's bounding box (its tips touch its sides).
  width: number
  height: number
  // The frame's thickness outward from the map's edge, in vertical pixels.
  thick: number
}

export const frameMargin = (thick: number) => ({ x: thick * 2 + 6, y: thick + 3 })

// The frame around the map diamond: an inner dithered shadow sinking the map in, an ink line, a gilded trim, a carved
// oak band with grain and a bevel, a ring of grey stone blocks, an ink outline and a short shadow on the ground below.
export function paintFrame(ctx: CanvasRenderingContext2D, { width, height, thick }: FrameSize) {
  const m = frameMargin(thick)
  const W = width + m.x * 2
  const H = height + m.y * 2
  const img = ctx.createImageData(W, H)
  const cx = W / 2 - 0.5
  const cy = H / 2 - 0.5
  const a = width / 2
  // Bands outward (vertical pixels from the map's edge).
  const trim0 = 0.5
  const trim1 = trim0 + Math.max(2, Math.round(thick * 0.18))
  const wood0 = trim1 + 1
  const stone1 = thick - 1
  const stone0 = stone1 - Math.max(3, Math.round(thick * 0.24))
  const wood1 = stone0 - 1
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx
      const dy = y - cy
      const u = outside(x, y, cx, cy, a)
      let c: RGB | null = null
      let alpha = 255
      const lit = facing(dx, dy)
      if (u < -6) continue
      if (u < -1) {
        // The map sinks into the frame: ink dithered thinner away from the edge, heavier under the lit edges' lip.
        const depth = (-1 - u) / 5
        const share = (0.62 - depth * 0.6) * (lit > 0 ? 1.15 : 0.8)
        if (share > dither(x, y)) {
          c = INK
          alpha = 150
        }
      } else if (u < trim0) {
        c = INK
      } else if (u < trim1) {
        // Gold trim: a rounded moulding, bright on its outer half where the edge faces the light.
        const t = (u - trim0) / (trim1 - trim0)
        c = tone(GOLD, 2 - lit * 1.6 + (t < 0.5 ? -0.7 : 0.6) * Math.sign(lit || 1), x, y)
      } else if (u < wood0) {
        c = GOLD[5]
      } else if (u < wood1) {
        // Carved oak: a bevel on both sides of the band (the outer slope faces outward, the inner one inward), the
        // flat top in between, and streaks of grain running along the edge.
        const t = (u - wood0) / (wood1 - wood0)
        let at = 2.4
        if (t < 0.22) at -= -lit * 1.5
        else if (t > 0.78) at -= lit * 1.5
        else at -= lit * 0.5
        const row = Math.floor(u)
        const grain = hash(row * 7 + 3, Math.floor((dx + hash(row, 9) * 40) / (5 + hash(row, 2) * 6)))
        if (grain < 0.25) at += 1.1
        else if (grain > 0.9) at -= 0.8
        // A knot here and there.
        if (hash(Math.floor(dx / 3), row) > 0.995) at += 1.6
        c = tone(WOOD, at, x, y)
        // The carved edges of the band.
        if (t < 0.12 || t > 0.9) c = tone(WOOD, 4.4 - lit * 0.6, x, y)
      } else if (u < stone0) {
        c = WOOD[5]
      } else if (u < stone1) {
        // Stone blocks: lit by the edge's facing, speckled, with mortar joints across the ring.
        const t = (u - stone0) / (stone1 - stone0)
        let at = 1.8 - lit * 1.3 + (t < 0.34 ? -0.5 : t > 0.7 ? 0.6 : 0)
        const block = Math.floor((dx + (dy < 0 ? 0 : 5)) / 11)
        if (Math.abs(((dx + (dy < 0 ? 0 : 5)) % 11 + 11) % 11) < 1) at = 3.6
        if (hash(x, y) < 0.12) at += 0.7
        at += (hash(block, dy < 0 ? 1 : 2) - 0.5) * 0.5
        c = tone(STONE, at, x, y)
      } else if (u < thick) {
        c = INK
      } else if (u < thick + 2.5 && lit < 0) {
        // A short shadow on the ground under the darker edges.
        if (0.5 > dither(x, y)) {
          c = INK
          alpha = 110
        }
      }
      if (!c) continue
      const o = (y * W + x) * 4
      img.data[o] = c[0]
      img.data[o + 1] = c[1]
      img.data[o + 2] = c[2]
      img.data[o + 3] = alpha
    }
  }
  // A gilded stud in the middle of each edge, over the oak band.
  const mid = (wood0 + wood1) / 2
  const sa = Math.max(5, Math.round(thick * 0.75))
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    // The edge's middle, pushed out along the vertical to the band's middle.
    const ex = cx + (sx * a) / 2
    const ey = cy + (sy * a) / 4 + sy * mid
    for (let y = Math.floor(ey - sa / 2) - 1; y <= ey + sa / 2 + 1; y++) {
      for (let x = Math.floor(ex - sa) - 1; x <= ex + sa + 1; x++) {
        const u = -outside(x, y, ex, ey, sa)
        if (u < 0) continue
        const lit = facing(x - ex, y - ey)
        const c = u < 1 ? INK : u < 2.2 ? tone(GOLD, 2 - lit * 2, x, y) : tone(GOLD, 1.6 + (y - ey) / sa * 2, x, y)
        const o = (y * W + x) * 4
        img.data[o] = c[0]
        img.data[o + 1] = c[1]
        img.data[o + 2] = c[2]
        img.data[o + 3] = 255
      }
    }
    // Its glint.
    const gx = Math.round(ex - 1)
    const gy = Math.round(ey - 1)
    const o = (gy * W + gx) * 4
    img.data.set([...GOLD[0], 255], o)
  }
  ctx.canvas.width = W
  ctx.canvas.height = H
  ctx.putImageData(img, 0, 0)
}

// A fitting at one of the frame's tips, which is also a button: a gilded rim bevelled toward the light around a sunken
// face of dark oak (or of red enamel, when something calls for the player), a gold rivet at each side point.
export function paintCap(ctx: CanvasRenderingContext2D, width: number, face: 'wood' | 'alarm' | 'hover') {
  const height = Math.round(width / 2)
  const img = ctx.createImageData(width, height)
  const cx = width / 2 - 0.5
  const cy = height / 2 - 0.5
  const a = width / 2
  const rim = Math.max(3, Math.round(width * 0.055))
  const ramp = face === 'alarm' ? RED : WOOD
  const lift = face === 'hover' ? -0.8 : 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      const u = -outside(x, y, cx, cy, a)
      if (u < 0) continue
      const lit = facing(dx, dy)
      let c: RGB
      if (u < 1) c = INK
      else if (u < 1 + rim) {
        // The rim's outer slope faces outward, its inner slope inward; a glint on the brightest edge.
        const t = (u - 1) / rim
        c = tone(GOLD, 2.1 - lit * (t < 0.5 ? 1.8 : -1.2), x, y)
        if (t > 0.3 && t < 0.6 && lit > 0.3 && hash(x, y) > 0.86) c = GOLD[0]
      } else if (u < 2 + rim) c = GOLD[5]
      else {
        // The sunken face: shadowed under the lit edges' lip, a soft light across its upper half.
        const t = u - 2 - rim
        let at = 2.2 + lift + (dy / height) * 1.4
        if (t < 1.5) at += lit > 0 ? 1.4 : -0.9
        else if (t < 3) at += lit > 0 ? 0.6 : -0.3
        if (hash(Math.floor(u), Math.floor((dx + 40) / 4)) < 0.15) at += 0.5
        c = tone(ramp, at, x, y)
      }
      const o = (y * width + x) * 4
      img.data[o] = c[0]
      img.data[o + 1] = c[1]
      img.data[o + 2] = c[2]
      img.data[o + 3] = 255
    }
  }
  ctx.canvas.width = width
  ctx.canvas.height = height
  ctx.putImageData(img, 0, 0)
  // Rivets at the two side points, inside the rim.
  const r = Math.max(2, Math.round(width / 30))
  for (const side of [-1, 1]) {
    const x = Math.round(cx + side * (a - rim * 2 - r * 2.2)) - (r >> 1)
    const y = Math.round(cy) - (r >> 1)
    ctx.fillStyle = '#120d0b'
    ctx.fillRect(x - 1, y - 1, r + 2, r + 2)
    ctx.fillStyle = '#d9aa3e'
    ctx.fillRect(x, y, r, r)
    ctx.fillStyle = '#fff4c0'
    ctx.fillRect(x, y, Math.max(1, r >> 1), Math.max(1, r >> 1))
    ctx.fillStyle = '#6b4a12'
    ctx.fillRect(x + r - 1, y + r - 1, 1, 1)
  }
}
