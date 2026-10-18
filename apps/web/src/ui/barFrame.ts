// The frame of the top bar and the dock (CLAUDE.md §11), painted once pixel by pixel in the minimap frame's manner: a
// black line, a gilded moulding, an oak band studded with gold rivets, gold corner plates with a diamond boss, lit from
// the top left and shaded through an ordered dither. It is a nine-slice image: CSS stretches nothing, it repeats the
// edges (border-image), shown nearest-neighbour at two screen pixels to the art pixel like the rest of the interface.

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const v = parseInt(h.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}
const INK = hex('#120d0b')
const GOLD = ['#fff4c0', '#f2d16b', '#d9aa3e', '#a8781f', '#6b4a12'].map(hex)
const OAK = ['#8f6740', '#74512f', '#5a3d24', '#432c19', '#2c1c10'].map(hex)
const PANEL_LO = hex('#140e0b')
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const tone = (ramp: RGB[], at: number, x: number, y: number) => {
  const i = Math.max(0, Math.min(ramp.length - 1, at))
  const lo = Math.floor(i)
  return i - lo > dither(x, y) ? ramp[Math.min(ramp.length - 1, lo + 1)] : ramp[lo]
}
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// The band's thickness and the length of an edge tile (the rivets repeat at this period).
export const BAR_EDGE = 7
const TILE = 16

function paint(): string {
  const size = BAR_EDGE * 2 + TILE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const put = (x: number, y: number, c: RGB, a = 255) => {
    const i = (y * size + x) * 4
    img.data[i] = c[0]
    img.data[i + 1] = c[1]
    img.data[i + 2] = c[2]
    img.data[i + 3] = a
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Depth into the band from the outside, and which side it is on (lit top and left, shaded bottom and right).
      const dl = x
      const dr = size - 1 - x
      const dt = y
      const db = size - 1 - y
      const d = Math.min(dl, dr, dt, db)
      if (d >= BAR_EDGE) continue
      const lit = d === dt || d === dl ? 1 : 0
      const corner = Math.min(dl, dr) < BAR_EDGE && Math.min(dt, db) < BAR_EDGE
      // Along the edge, for the rivets and the grain.
      const along = d === dt || d === db ? x : y
      if (d === 0) {
        put(x, y, INK)
        continue
      }
      if (corner) {
        // A gold plate over the corner, a diamond boss in its middle.
        const cx = dl < BAR_EDGE ? 3.5 : size - 4.5
        const cy = dt < BAR_EDGE ? 3.5 : size - 4.5
        const diamond = Math.abs(x - cx) + Math.abs(y - cy)
        if (diamond <= 1.6) put(x, y, x + y < cx + cy ? GOLD[0] : GOLD[2])
        else if (diamond <= 2.6) put(x, y, x + y < cx + cy ? GOLD[1] : GOLD[3])
        else if (d === BAR_EDGE - 1) put(x, y, GOLD[4])
        else put(x, y, tone(GOLD, 1.4 + (x + y) / size * 1.6, x, y))
        continue
      }
      if (d <= 2) {
        // The gilded moulding: bright on the lit sides, deep on the others.
        put(x, y, tone(GOLD, (d === 1 ? 0.6 : 1.6) + (lit ? 0 : 1.5), x, y))
        continue
      }
      if (d === 3) {
        put(x, y, INK)
        continue
      }
      if (d === BAR_EDGE - 1) {
        put(x, y, PANEL_LO)
        continue
      }
      // The oak band, its grain running along the edge, a gold rivet every tile.
      const r = along % TILE
      const stud = Math.abs(r - TILE / 2 + 0.5) <= 1 && d === 4 ? 2 : Math.abs(r - TILE / 2 + 0.5) <= 1 && d === 5 ? 1 : 0
      if (stud) {
        const left = r < TILE / 2
        put(x, y, stud === 2 ? (left ? GOLD[0] : GOLD[1]) : left ? GOLD[2] : GOLD[3])
        continue
      }
      const grain = hash(Math.floor(along / 3) % 5, d) * 0.9 + (r % 7 === 0 ? 0.6 : 0)
      put(x, y, tone(OAK, (d === 4 ? 0.6 : 1.4) + grain + (lit ? 0 : 1), x, y))
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

// Sets the frame as a CSS variable (--bar-frame) for the stylesheet; once.
let done = false
export function installBarFrame() {
  if (done || typeof document === 'undefined') return
  done = true
  document.documentElement.style.setProperty('--bar-frame', `url(${paint()})`)
}
