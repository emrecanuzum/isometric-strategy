import { TILE_HEIGHT, TILE_WIDTH, hash, heightAt } from '@game/shared'
import type { World } from '@game/shared'
import { Container, Sprite as PixiSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import { ROUTE_STEP, deckHeight, findBridges, resampleRoute, roundRoute } from './chunkPainter'
import { innLook } from './innSprites'
import { SPRITES } from './sprites'
import type { Sprite } from './sprites'
import { textureOf } from './textures'

// Ambient merchant caravans: camels and their drivers walking the trade routes back and forth between inns.
// Purely visual for now; their positions follow from the clock, so nothing is stored or sent.

// One caravan per this many tiles of route, at least one per route.
const TILES_PER_CARAVAN = 90
// Walking speed range in tiles per second, gap between members in tiles, steps per tile for the stride.
const SPEED = [0.45, 0.75]
const GAP = 0.85
const STRIDES_PER_TILE = 3
// Routes start inside an inn's footprint; caravans turn around at its door instead of walking over the roof.
const INN_REACH = 2

interface Track {
  // Resampled route ROUTE_STEP tiles apart, with the height of the ground or bridge deck under each point.
  x: Float32Array
  y: Float32Array
  z: Float32Array
  length: number
}

interface Member {
  frames: Texture[]
  sprite: PixiSprite
  // Distance behind the caravan's leader, in tiles.
  behind: number
}

interface Caravan {
  track: Track
  speed: number
  offset: number
  members: Member[]
}

function buildTrack(world: World, points: { x: number; y: number }[]): Track {
  const line = resampleRoute(roundRoute(points))
  const n = line.length
  const track: Track = { x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), length: (n - 1) * ROUTE_STEP }
  for (let i = 0; i < n; i++) {
    track.x[i] = line[i].x
    track.y[i] = line[i].y
    track.z[i] = heightAt(world, line[i].x, line[i].y)
  }
  // Over water the caravan keeps to the straight bridge deck.
  for (const bridge of findBridges(world, line)) {
    for (let i = bridge.from; i <= bridge.to; i++) {
      const t = (i - bridge.from) / Math.max(1, bridge.to - bridge.from)
      track.x[i] = bridge.ax + (bridge.bx - bridge.ax) * t
      track.y[i] = bridge.ay + (bridge.by - bridge.ay) * t
      track.z[i] = deckHeight(bridge, t)
    }
  }
  return track
}

export interface Caravans {
  layer: Container
  update(seconds: number, view: { left: number; top: number; right: number; bottom: number }): void
}

export function createCaravans(world: World): Caravans {
  const layer = new Container()
  layer.sortableChildren = true
  const frames = (pair: Sprite[]) => pair.map(textureOf)

  // Inns are painted into the ground, below this layer; a walker behind or inside one is hidden wherever the
  // inn's pixels cover its feet, so caravans pass through inns instead of over their roofs.
  const inns = world.inns.map((p) => ({
    sprite: innLook(world, p).sprite,
    // Footprint center, and the screen position of the front corner the sprite is anchored at.
    cx: p.x + 1,
    cy: p.y + 1,
    sx: (p.x - p.y) * (TILE_WIDTH / 2),
    sy: (p.x + p.y + 4) * (TILE_HEIGHT / 2) - heightAt(world, p.x + 1, p.y + 1),
  }))
  const hiddenByInn = (x: number, y: number, sx: number, sy: number) =>
    inns.some((p) => {
      if (Math.abs(x - p.cx) > 5 || Math.abs(y - p.cy) > 5 || x + y > p.cx + p.cy + 2) return false
      const inn = p.sprite
      const px = Math.round(sx - p.sx + inn.anchorX)
      const py = Math.round(sy - p.sy + inn.anchorY)
      return px >= 0 && py >= 0 && px < inn.width && py < inn.height && inn.pixels[py * inn.width + px] !== 0
    })

  const caravans: Caravan[] = []
  world.roads.forEach((road, r) => {
    const track = buildTrack(world, road.points)
    const count = Math.max(1, Math.round(track.length / TILES_PER_CARAVAN))
    for (let c = 0; c < count; c++) {
      const roll = (n: number) => hash(r, c * 16 + n, world.seed + 301)
      const cloth = Math.floor(roll(0) * SPRITES.camel.length)
      const pairs: Sprite[][] = [SPRITES.merchant[Math.floor(roll(1) * SPRITES.merchant.length)]]
      const camels = 2 + Math.floor(roll(2) * 3)
      for (let i = 0; i < camels; i++) {
        pairs.push(SPRITES.camel[i === 0 ? cloth : Math.floor(roll(3 + i) * SPRITES.camel.length)][1 + Math.floor(roll(8 + i) * 2)])
      }
      if (roll(14) < 0.5) pairs.push(SPRITES.guard)
      const members = pairs.map((pair, i) => {
        const sprite = new PixiSprite(frames(pair)[0])
        sprite.anchor.set(pair[0].anchorX / pair[0].width, pair[0].anchorY / pair[0].height)
        sprite.visible = false
        layer.addChild(sprite)
        return { frames: frames(pair), sprite, behind: i * GAP }
      })
      caravans.push({
        track,
        speed: SPEED[0] + roll(15) * (SPEED[1] - SPEED[0]),
        // Spread evenly along the out-and-back loop, so caravans on one route keep apart.
        offset: ((c + roll(16) * 0.5) / count) * Math.max(0.5, track.length - INN_REACH * 2) * 2,
        members,
      })
    }
  })

  return {
    layer,
    update(seconds, view) {
      for (const { track, speed, offset, members } of caravans) {
        const walk = Math.max(0.5, track.length - INN_REACH * 2)
        const loop = walk * 2
        const lead = seconds * speed + offset
        for (const { frames, sprite, behind } of members) {
          // Distance along the out-and-back loop; the return half walks the route backwards.
          const u = (((lead - behind) % loop) + loop) % loop
          const forward = u <= walk
          const along = Math.min(track.length, INN_REACH + (forward ? u : loop - u))
          const f = Math.min(track.x.length - 2, Math.floor(along / ROUTE_STEP))
          const t = along / ROUTE_STEP - f
          const x = track.x[f] + (track.x[f + 1] - track.x[f]) * t
          const y = track.y[f] + (track.y[f + 1] - track.y[f]) * t
          const z = track.z[f] + (track.z[f + 1] - track.z[f]) * t
          const sx = (x - y) * (TILE_WIDTH / 2)
          const sy = (x + y) * (TILE_HEIGHT / 2) - z
          if (
            sx < view.left ||
            sx > view.right ||
            sy < view.top ||
            sy > view.bottom ||
            hiddenByInn(x, y, sx, sy)
          ) {
            sprite.visible = false
            continue
          }
          sprite.visible = true
          sprite.position.set(Math.round(sx), Math.round(sy))
          sprite.zIndex = sy
          // Facing follows the walking direction on screen.
          const heading = (track.x[f + 1] - track.x[f] - (track.y[f + 1] - track.y[f])) * (forward ? 1 : -1)
          sprite.scale.x = heading < 0 ? -1 : 1
          sprite.texture = frames[Math.floor(u * STRIDES_PER_TILE) % 2]
        }
      }
    },
  }
}
