import { CanvasSource, Texture } from 'pixi.js'
import type { Sprite } from './sprites'

const cache = new Map<Sprite, Texture>()

// A generated sprite as a pixel-exact texture, made once per sprite and shared by every scene.
export function textureOf(sprite: Sprite): Texture {
  let texture = cache.get(sprite)
  if (texture) return texture
  const canvas = document.createElement('canvas')
  canvas.width = sprite.width
  canvas.height = sprite.height
  const pixels = new Uint8ClampedArray(sprite.pixels.slice().buffer)
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, sprite.width, sprite.height), 0, 0)
  texture = new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) })
  cache.set(sprite, texture)
  return texture
}

