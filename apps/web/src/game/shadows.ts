import { AlphaFilter, Container, Sprite as PixiSprite, Texture } from 'pixi.js'
import { sunShadow } from './daylight'
import { castShadow } from './sprites'
import type { Sprite } from './sprites'
import { freeTexture, lookOf, textureOf } from './textures'

// Shadows of everything standing in the walkers' layer (buildings, walls, swaying trees, walkers, animals, armies),
// cast from their own pixels toward the sun of the hour. They are drawn solid into one layer lying on the ground, and
// the layer as a whole is made see-through, so overlapping shadows darken the ground only once.

// A deep blue-black: shade is cooler than the light.
const TINT = 0x0c1226
// The sun's direction moves in steps of this many game hours; every shadow is cast anew at each step.
const STEP = 1 / 6
// Sprites in the walkers' layer that throw no shadow.
const NONE = new Set(['smoke'])

export interface Shadows {
  layer: Container
  // A building standing on a footprint of this many tiles (it rises from the footprint's back edges).
  setFootprint(caster: Container, size: number): void
  update(hour: number, casters: Container): void
}

export function createShadows(): Shadows {
  const layer = new Container()
  const filter = new AlphaFilter({ alpha: 0, resolution: 'inherit' })
  layer.filters = [filter]
  const footprints = new WeakMap<Container, number>()
  const shades = new Map<PixiSprite, { shade: PixiSprite; frame: number }>()
  let frame = 0
  let step = NaN
  let sun = sunShadow(0)
  // This step's shadows, per look, footprint and facing.
  let cast = new Map<Sprite, Map<number, Sprite>>()
  const shadowOf = (look: Sprite, size: number, flip: boolean) => {
    let byLook = cast.get(look)
    if (!byLook) cast.set(look, (byLook = new Map()))
    const key = size * 2 + (flip ? 1 : 0)
    let shadow = byLook.get(key)
    if (!shadow) byLook.set(key, (shadow = castShadow(look, sun, size > 0, flip)))
    return shadow
  }

  return {
    layer,
    setFootprint(caster, size) {
      footprints.set(caster, size)
    },
    update(hour, casters) {
      filter.alpha = sunShadow(hour).alpha
      frame++
      const now = Math.floor(hour / STEP)
      let old: Map<Sprite, Map<number, Sprite>> | null = null
      if (now !== step) {
        step = now
        sun = sunShadow((now + 0.5) * STEP)
        old = cast
        cast = new Map()
      }
      for (const child of casters.children) {
        if (!(child instanceof PixiSprite) || NONE.has(child.label)) continue
        let entry = shades.get(child)
        const look = child.visible && child.alpha > 0 ? lookOf(child.texture) : undefined
        if (!look) {
          if (entry) {
            entry.frame = frame
            entry.shade.visible = false
            entry.shade.texture = Texture.EMPTY
          }
          continue
        }
        if (!entry) {
          const shade = new PixiSprite()
          shade.tint = TINT
          layer.addChild(shade)
          shades.set(child, (entry = { shade, frame }))
        }
        entry.frame = frame
        const { shade } = entry
        const shadow = shadowOf(look, footprints.get(child) ?? 0, child.scale.x < 0)
        const texture = textureOf(shadow)
        if (shade.texture !== texture) {
          shade.texture = texture
          shade.anchor.set(shadow.anchorX / shadow.width, shadow.anchorY / shadow.height)
        }
        shade.position.copyFrom(child.position)
        shade.scale.set(Math.abs(child.scale.x), Math.abs(child.scale.y))
        shade.visible = true
      }
      // Casters gone from the layer take their shadows with them.
      for (const [child, entry] of shades) {
        if (entry.frame === frame) continue
        entry.shade.destroy()
        shades.delete(child)
      }
      if (old) for (const byLook of old.values()) for (const shadow of byLook.values()) freeTexture(shadow)
    },
  }
}
