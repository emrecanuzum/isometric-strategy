import { AlphaFilter, Container, Sprite as PixiSprite, Texture } from 'pixi.js'
import { sunShadow } from './daylight'
import { castShadow, shadeOn } from './sprites'
import type { ShadeJob, Sprite } from './sprites'
import { freeTexture, lookOf, textureOf } from './textures'

// Shadows of everything standing in the walkers' layer (buildings, walls, swaying trees, walkers, animals, armies),
// cast from their own pixels toward the sun of the hour. They are drawn solid into one layer lying on the ground, and
// the layer as a whole is made see-through, so overlapping shadows darken the ground only once.

// A deep blue-black: shade is cooler than the light.
const TINT = 0x0c1226
// The sun's direction moves in steps of this many game hours; every shadow is cast anew at each step.
const STEP = 1 / 6
// Sprites in the walkers' layer that throw no shadow.
const NONE = new Set(['smoke', 'shade', 'inn'])
// Shadows falling on buildings are worked out a few buildings at a time, this many milliseconds a frame.
const BUDGET_MS = 4

export interface Shadows {
  layer: Container
  // A building standing on a footprint of this many tiles (it rises from the footprint's back edges), `raise` pixels
  // above the ground at its front corner (on the stone base that levels it on a slope). The parts of one building (its
  // base and itself) share a `group` and throw no shade on one another; a `low` part (a stone base) throws none on any
  // building, only on the ground.
  setFootprint(caster: Container, size: number, raise?: number, group?: object, low?: boolean): void
  update(hour: number, casters: Container): void
}

export function createShadows(): Shadows {
  const layer = new Container()
  const filter = new AlphaFilter({ alpha: 0, resolution: 'inherit' })
  layer.filters = [filter]
  const footprints = new WeakMap<Container, number>()
  const raises = new WeakMap<Container, number>()
  const groups = new WeakMap<Container, object>()
  const lows = new WeakSet<Container>()
  // The stone base each building stands on (the low part of its group), and the shade it throws onto that base.
  const baseOf = new WeakMap<object, PixiSprite>()
  const onBase = new Map<PixiSprite, { overlay: PixiSprite; key: string; cast: Sprite | null }>()
  const shades = new Map<PixiSprite, { shade: PixiSprite; frame: number }>()
  // Shadows that fall on buildings: per building, an overlay of its pixels in the shade of another building (its own
  // shading is drawn into it). Worked out anew for every step of the sun and whenever the buildings change.
  const shaded = new Map<PixiSprite, { overlay: PixiSprite | null; look: Sprite; cast: Sprite | null }>()
  let queue: PixiSprite[] = []
  // The building being shaded now, a few rows a frame.
  let job: { target: PixiSprite; work: ShadeJob } | null = null
  let built = ''
  // The decks' mask the ships' shadows are cut by (see ambient.ts).
  let cutMask: Container | null = null
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

  // A building's pixel is in shade when the line from it toward the sun passes through another building's solids.
  // Walls do not shade walls: a run of wall is lit as one model already.
  function shadeBuildings(casters: Container, sunMoved: boolean, alpha: number) {
    const buildings = casters.children.filter((c): c is PixiSprite => c instanceof PixiSprite && c.label === 'occluder' && !!lookOf(c.texture))
    const key = buildings.map((b) => `${b.x},${b.y}`).join(';')
    if (sunMoved || key !== built) {
      built = key
      queue = buildings.slice()
      job = null
      const standing = new Set(buildings)
      for (const [building, entry] of shaded) {
        if (standing.has(building)) continue
        entry.overlay?.destroy()
        if (entry.cast) freeTexture(entry.cast)
        shaded.delete(building)
      }
    } else {
      // A building whose look changed (a gate swinging open) is shaded again on its own.
      for (const building of buildings) {
        const entry = shaded.get(building)
        if (entry && entry.look !== lookOf(building.texture) && !queue.includes(building)) queue.push(building)
      }
    }
    for (const entry of shaded.values()) if (entry.overlay) entry.overlay.alpha = alpha
    const deadline = performance.now() + BUDGET_MS
    while (performance.now() < deadline) {
      if (!job) {
        const target = queue.shift()
        if (!target) break
        if (target.destroyed || !lookOf(target.texture)) continue
        job = { target, work: startShading(target, buildings) }
      }
      if (!job.work.step(deadline)) break
      if (!job.target.destroyed) finish(job.target, job.work.result(), casters, alpha)
      job = null
    }
  }

  function startShading(target: PixiSprite, buildings: PixiSprite[]) {
    const others = buildings.flatMap((other) => {
      const o = lookOf(other.texture)
      const kin = groups.get(target) !== undefined && groups.get(other) === groups.get(target)
      return other === target || kin || lows.has(other) || !o ? [] : [{ look: o, x: other.x, y: other.y, shadow: shadowOf(o, 1, false) }]
    })
    return shadeOn({ look: lookOf(target.texture)!, x: target.x, y: target.y }, others, sun)
  }

  // Puts what fell on a building over it (or takes the old overlay away).
  function finish(target: PixiSprite, cast: Sprite | null, casters: Container, alpha: number) {
    const look = lookOf(target.texture)!
    const old = shaded.get(target)
    if (old?.cast) freeTexture(old.cast)
    if (!cast) {
      old?.overlay?.destroy()
      shaded.set(target, { overlay: null, look, cast: null })
      return
    }
    const overlay = old?.overlay ?? new PixiSprite()
    overlay.texture = textureOf(cast)
    overlay.anchor.set(cast.anchorX / cast.width, cast.anchorY / cast.height)
    overlay.position.copyFrom(target.position)
    overlay.zIndex = target.zIndex + 0.01
    overlay.tint = TINT
    overlay.alpha = alpha
    overlay.label = 'shade'
    if (!overlay.parent) casters.addChild(overlay)
    shaded.set(target, { overlay, look, cast })
  }

  return {
    layer,
    setFootprint(caster, size, raise = 0, group, low) {
      footprints.set(caster, size)
      raises.set(caster, Math.max(0, raise))
      if (group) groups.set(caster, group)
      if (low) lows.add(caster)
      else lows.delete(caster)
      if (group && low && caster instanceof PixiSprite) baseOf.set(group, caster)
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
        // A building raised on a base throws its shadow from that height down onto the ground below the base: the
        // ground under it is `raise` lower on screen, and every point stands `raise` higher above it.
        const raise = raises.get(child) ?? 0
        shade.position.set(child.x + raise * sun.x, child.y + raise + raise * sun.y)
        shade.scale.set(Math.abs(child.scale.x), Math.abs(child.scale.y))
        shade.visible = true
        // A ship cut by a bridge's deck (it sails under it) has its shadow cut alike, so none falls on the deck.
        const cut = child.label === 'ship' ? (child.mask as Container | null) : null
        if (cut) cutMask = cut
        if (cut && shade.mask !== cut) shade.setMask({ mask: cut, inverse: true })
        else if (!cut && shade.mask) shade.mask = null
        // Taking a mask off puts it back among what is drawn: keep it out.
        if (cutMask) {
          cutMask.includeInBuild = false
          cutMask.measurable = false
        }
      }
      // A building on a stone base throws its shadow onto the base's top too: its shadow cast at the base's height, kept
      // where the base is, drawn over the base and under the building. (The ground's shadow layer lies beneath the base.)
      const kept = new Set<PixiSprite>()
      for (const child of casters.children) {
        if (!(child instanceof PixiSprite) || child.label !== 'occluder' || lows.has(child) || !child.visible) continue
        const group = groups.get(child)
        const base = group && baseOf.get(group)
        const look = lookOf(child.texture)
        const baseLook = base && !base.destroyed ? lookOf(base.texture) : undefined
        if (!base || !look || !baseLook || (raises.get(child) ?? 0) <= 0) continue
        kept.add(child)
        const dx = Math.round(child.x - look.anchorX - (base.x - baseLook.anchorX))
        const dy = Math.round(child.y - look.anchorY - (base.y - baseLook.anchorY))
        const key = `${step}:${dx}:${dy}`
        let entry = onBase.get(child)
        if (!entry || entry.key !== key) {
          const shadow = shadowOf(look, footprints.get(child) ?? 0, child.scale.x < 0)
          // Shadow pixels in the base's own pixels: shadow (sx, sy) sits at the building's anchor less the shadow's.
          const ox = dx + look.anchorX - shadow.anchorX
          const oy = dy + look.anchorY - shadow.anchorY
          const pixels = new Uint32Array(shadow.pixels.length)
          let any = false
          for (let y = 0; y < shadow.height; y++) {
            const by = y + oy
            if (by < 0 || by >= baseLook.height) continue
            for (let x = 0; x < shadow.width; x++) {
              const i = y * shadow.width + x
              if (shadow.pixels[i] >>> 24 === 0) continue
              const bx = x + ox
              if (bx < 0 || bx >= baseLook.width || baseLook.pixels[by * baseLook.width + bx] >>> 24 === 0) continue
              pixels[i] = shadow.pixels[i]
              any = true
            }
          }
          const cast: Sprite | null = any ? { ...shadow, pixels, lift: undefined, flat: undefined } : null
          if (entry?.cast) freeTexture(entry.cast)
          const overlay = entry?.overlay ?? new PixiSprite()
          if (cast) {
            overlay.texture = textureOf(cast)
            overlay.anchor.set(cast.anchorX / cast.width, cast.anchorY / cast.height)
          }
          overlay.visible = !!cast
          overlay.tint = TINT
          overlay.label = 'shade'
          if (!overlay.parent) casters.addChild(overlay)
          entry = { overlay, key, cast }
          onBase.set(child, entry)
        }
        const { overlay } = entry
        overlay.position.copyFrom(child.position)
        overlay.scale.set(Math.abs(child.scale.x), Math.abs(child.scale.y))
        overlay.alpha = filter.alpha
        // Just above the base, just below the building (whose zIndex is a little above its base's).
        overlay.zIndex = base.zIndex + 0.001
      }
      for (const [child, entry] of onBase) {
        if (kept.has(child)) continue
        entry.overlay.destroy()
        if (entry.cast) freeTexture(entry.cast)
        onBase.delete(child)
      }
      // Casters gone from the layer take their shadows with them.
      for (const [child, entry] of shades) {
        if (entry.frame === frame) continue
        entry.shade.destroy()
        shades.delete(child)
      }
      shadeBuildings(casters, now !== step || old !== null, filter.alpha)
      if (old) for (const byLook of old.values()) for (const shadow of byLook.values()) freeTexture(shadow)
    },
  }
}
