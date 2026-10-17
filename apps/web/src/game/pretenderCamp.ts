import type { Point } from '@game/shared'
import type { Structure } from './buildingSprites'
import { palisade, pavilion, rack, tent } from './campSprites'
import type { Sprite } from './sprites'

// A pretender's camp (CLAUDE.md §9.1.1): a palisade round a square of seven tiles, open at the front, the pretender's
// pavilion at the back and tents in coal grey, more of them as the camp grows (tier 0–3). Everyone sees it.

let looks: { tents: Sprite[]; pavilion: Sprite; rack: Sprite; fence: Record<'x' | 'y', Sprite> } | null = null
const looksOf = () =>
  (looks ??= { tents: [tent('coal', 0), tent('coal', 1)], pavilion: pavilion('coal'), rack: rack('coal'), fence: { x: palisade('x'), y: palisade('y') } })

// The tents, in the order they go up.
const TENTS: [number, number][] = [
  [-2, -2],
  [2, -2],
  [-2, 0],
  [2, 0],
  [-1, 1],
  [1, 1],
  [0, -1],
  [-2, 1],
  [2, 1],
]

export function pretenderCampStructures(at: Point, tier: number): Structure[] {
  const l = looksOf()
  const x0 = Math.round(at.x) - 3
  const y0 = Math.round(at.y) - 3
  const put = (dx: number, dy: number, sprite: Sprite, size = 1): Structure => ({ x: x0 + dx, y: y0 + dy, size, look: 'house', variant: 0, sprite })
  const parts: Structure[] = []
  for (let t = 0; t < 7; t++) {
    parts.push(put(t, 0, l.fence.x))
    if (t !== 3) parts.push(put(t, 6, l.fence.x))
  }
  for (let t = 1; t < 6; t++) parts.push(put(0, t, l.fence.y), put(6, t, l.fence.y))
  parts.push(put(2, 1, l.pavilion, 2))
  const tents = 3 + tier * 2
  for (const [dx, dy] of TENTS.slice(0, tents)) parts.push(put(3 + dx, 3 + dy + 1, l.tents[(dx + dy + 4) % 2]))
  if (tier >= 2) parts.push(put(1, 1, l.rack), put(5, 1, l.rack))
  return parts
}
