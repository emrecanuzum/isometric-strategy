import type { Point } from './iso'

export interface March {
  origin: Point
  target: Point
  departAt: number
  arriveAt: number
}

// The server never stores a moving army's position; it is derived from the march.
export function marchPosition(march: March, now: number): Point {
  const span = march.arriveAt - march.departAt
  const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - march.departAt) / span))
  return {
    x: march.origin.x + (march.target.x - march.origin.x) * t,
    y: march.origin.y + (march.target.y - march.origin.y) * t,
  }
}
