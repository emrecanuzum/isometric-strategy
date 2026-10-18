import { MAPS, PALETTE } from '../ui/icons'
import type { IconName } from '../ui/icons'

// The map's pointer (CLAUDE.md §11): a steel gauntlet pointing its finger, drawn pixel by pixel like the icons, and
// over something on the map the same hand carrying that thing's icon on a small plate (a sheaf over a field, swords
// over an army). Made once per icon as a PNG data URL for CSS `cursor`, at twice the art's size so every pixel stays
// square; the hot spot is the fingertip.

// 16 × 16, pointing to the upper left like a mouse arrow: k outline, S/s/d steel from light to dark, o gold trim,
// b leather cuff. The index finger runs along the diagonal, the other fingers curl under it, the cuff at the lower
// right.
const HAND = [
  'kk..............',
  'kSSk............',
  'kSSdk...........',
  '.kSSdk..........',
  '..kSSdk.kk......',
  '...kSSdkSdk.....',
  '....kSSSSdkkk...',
  '....kSSSSSSSdk..',
  '...kSkSSSSSSSdk.',
  '...kSSkSSSSSSdk.',
  '....kSSSSSSSdk..',
  '.....kSSSSSdkok.',
  '......kSSSdkoobk',
  '.......kkkkoobbk',
  '...........kbbk.',
  '............kk..',
]
const SCALE = 2
const HOT = { x: 1, y: 1 }
const COLORS: Record<string, string> = { ...PALETTE, s: '#a8b0bc', S: '#e6ebf0', d: '#5a606c', o: '#c8952e', b: '#8a5a2e', k: '#1c1612' }

const made = new Map<string, string>()

function paint(ctx: CanvasRenderingContext2D, rows: readonly string[], ox: number, oy: number, palette: Record<string, string>) {
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = palette[ch]
      if (!c) return
      ctx.fillStyle = c
      ctx.fillRect(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE)
    }),
  )
}

// The CSS cursor for the plain hand, or the hand with an icon's plate.
export function handCursor(icon?: IconName | null): string {
  const key = icon ?? ''
  const known = made.get(key)
  if (known) return known
  if (typeof document === 'undefined') return 'pointer'
  const size = icon ? 40 : 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return 'pointer'
  paint(ctx, HAND, 0, 0, COLORS)
  if (icon) {
    // A dark plate with a gold rim at the lower right, the icon on it.
    const px = size - 20
    const py = size - 20
    ctx.fillStyle = '#1c1612'
    ctx.fillRect(px, py, 20, 20)
    ctx.fillStyle = '#c8952e'
    ctx.fillRect(px + 1, py + 1, 18, 18)
    ctx.fillStyle = '#2a201a'
    ctx.fillRect(px + 2, py + 2, 16, 16)
    paint(ctx, MAPS[icon], px + 2, py + 2, PALETTE)
  }
  const cursor = `url("${canvas.toDataURL('image/png')}") ${HOT.x} ${HOT.y}, pointer`
  made.set(key, cursor)
  return cursor
}
