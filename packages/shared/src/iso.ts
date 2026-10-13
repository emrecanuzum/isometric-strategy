export interface Point {
  x: number
  y: number
}

export const TILE_WIDTH = 64
export const TILE_HEIGHT = 32

export function tileToScreen(tile: Point): Point {
  return {
    x: (tile.x - tile.y) * (TILE_WIDTH / 2),
    y: (tile.x + tile.y) * (TILE_HEIGHT / 2),
  }
}

export function screenToTile(screen: Point): Point {
  const a = screen.x / (TILE_WIDTH / 2)
  const b = screen.y / (TILE_HEIGHT / 2)
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) }
}
