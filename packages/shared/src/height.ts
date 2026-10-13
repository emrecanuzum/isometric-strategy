import { balance } from './balance'
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from './iso'
import type { Point } from './iso'
import type { World } from './worldgen'

// No ground is drawn higher than this many screen pixels above the water surface.
export const MAX_HEIGHT = Math.ceil(
  balance.world.lowlandHeight + balance.world.hillHeight + balance.world.mountainHeight * balance.world.mountainHeightCap,
)

// Ground height at a fractional tile position; a tile's own value sits at its center.
export function heightAt(world: World, x: number, y: number) {
  const { size, height } = world
  const fx = Math.min(size - 1.001, Math.max(0, x - 0.5))
  const fy = Math.min(size - 1.001, Math.max(0, y - 0.5))
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const i = iy * size + ix
  const top = height[i] * (1 - tx) + height[i + 1] * tx
  const bottom = height[i + size] * (1 - tx) + height[i + size + 1] * tx
  return top * (1 - ty) + bottom * ty
}

// Where a point on the ground appears on screen: the flat projection lifted by the ground height.
export function groundToScreen(world: World, tile: Point): Point {
  const s = tileToScreen(tile)
  return { x: s.x, y: s.y - heightAt(world, tile.x, tile.y) }
}

// The ground point (fractional tile) drawn at a screen position: the nearest surface along the line of sight.
export function screenToGround(world: World, screen: Point): Point {
  const a = screen.x / (TILE_WIDTH / 2)
  let tile = { x: 0, y: 0 }
  for (let lift = MAX_HEIGHT; lift >= 0; lift--) {
    const b = (screen.y + lift) / (TILE_HEIGHT / 2)
    tile = { x: (a + b) / 2, y: (b - a) / 2 }
    if (heightAt(world, tile.x, tile.y) >= lift) break
  }
  return tile
}
