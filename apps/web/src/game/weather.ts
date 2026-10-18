import { Terrain, Feature, balance, lightningAt, screenToGround, weatherAt, CLEAR_WEATHER } from '@game/shared'
import type { Weather, World } from '@game/shared'
import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { setRainSound, thunder } from '../audio/sfx'

// Rain over the map (CLAUDE.md §4.2.1), only to be seen and heard: the weather comes from the lobby's key and the
// time (weatherAt), so everyone sees the same sky. While it rains the map greys (a grey wash over the ground and a
// darker, cooler light), dark cloud shadows drift over it, slanted pixel streaks fall across the screen at every zoom,
// and close up (1× and nearer) the drops splash on the ground: little crowns on land, rings on rivers and lakes. A
// storm flashes with lightning and rolls with thunder; sleet and hail fall pale and slow. Power saving keeps the grey
// and a few streaks only.

const D = balance.weather.draw

export interface WeatherLayer {
  // Splashes on the ground, in world pixels: goes in the camera just above the ground (under buildings and walkers).
  ground: Container
  // The grey wash, the cloud shadows and the falling rain, in screen pixels: on the stage over the map, under the light.
  screen: Container
  // A lightning flash over everything but the labels: on the stage just above the light.
  flash: Graphics
  setKey(key: number | undefined): void
  setSaver(on: boolean): void
  // The light of the hour as the rain sees it: darker and greyer while it rains.
  light(color: number): number
  update(time: number, camera: { x: number; y: number; scale: number }, width: number, height: number): void
  destroy(): void
}

const canvasTexture = (w: number, h: number, draw: (put: (x: number, y: number, color: number, alpha: number) => void) => void) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  draw((x, y, color, alpha) => {
    g.fillStyle = `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${alpha})`
    g.fillRect(x, y, 1, 1)
  })
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'nearest' }) })
}


// A rain streak `length` art pixels long leaning `lean` pixels across per pixel down: a bright head at the bottom and
// a fainter tail in two steps (no smooth fade).
const streaks = new Map<string, Texture>()
function streakTexture(length: number, lean: number, sleet: boolean) {
  const key = `${length}:${lean}:${sleet}`
  let t = streaks.get(key)
  if (t) return t
  const shift = Math.round(Math.abs(lean) * length)
  const w = shift + (sleet ? 2 : 1)
  t = canvasTexture(w, length, (put) => {
    for (let i = 0; i < length; i++) {
      // i counts from the top (tail) down to the head.
      const x = lean >= 0 ? Math.round(lean * i) : shift - Math.round(-lean * i)
      const head = i >= length - (sleet ? 2 : 2)
      const tail = i < length / 3
      const color = sleet ? 0xf4f8ff : 0xdce6f0
      const alpha = head ? (sleet ? 0.95 : 0.85) : tail ? 0.35 : 0.6
      put(x, i, color, alpha)
      if (sleet && head) put(x + 1, i, color, 0.8)
    }
  })
  streaks.set(key, t)
  return t
}

// A snowflake: a single bright pixel, or a small cross with a soft rim for the nearer ones.
const flakes = [
  canvasTexture(1, 1, (put) => put(0, 0, 0xffffff, 0.95)),
  canvasTexture(2, 2, (put) => {
    put(0, 0, 0xffffff, 0.95)
    put(1, 0, 0xf0f6ff, 0.6)
    put(0, 1, 0xf0f6ff, 0.6)
    put(1, 1, 0xdde8f4, 0.4)
  }),
  canvasTexture(3, 3, (put) => {
    put(1, 1, 0xffffff, 1)
    for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) put(x, y, 0xf4f8ff, 0.7)
  }),
]

// The frames of a splash on land: a drop, a little crown, droplets flying out and falling back.
const CROWN = [
  ['.......', '.......', '.......', '...O...', '.......'],
  ['.......', '.......', '..o.o..', '...O...', '.......'],
  ['.......', '.o...o.', '.......', '..ooo..', '.......'],
  ['o.....o', '.......', '.......', '.o...o.', '.......'],
]
const crownFrames = (sleet: boolean) =>
  CROWN.map((rows) =>
    canvasTexture(7, 5, (put) => {
      rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && put(x, y, sleet ? 0xffffff : c === 'O' ? 0xf2f7fb : 0xd8e3ee, c === 'O' ? 0.95 : 0.8)))
    }),
  )

// The frames of a ring spreading on water (flattened 2:1 like the ground), with the drop in the middle at first.
const RING_FRAMES = 5
const ringFrames = () =>
  Array.from({ length: RING_FRAMES }, (_, k) => {
    const rx = 1.5 + k * 1.8
    const ry = rx / 2
    const w = Math.ceil(rx) * 2 + 1
    const h = Math.ceil(ry) * 2 + 1
    const cx = (w - 1) / 2
    const cy = (h - 1) / 2
    return canvasTexture(w, h, (put) => {
      const alpha = 0.75 - k * 0.12
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
          if (Math.abs(d - 1) < 0.9 / rx + 0.12) put(x, y, y < cy ? 0xe4eef6 : 0xaac4d8, alpha)
        }
      if (k < 2) put(Math.round(cx), Math.round(cy), 0xffffff, 0.9)
    })
  })

// A dark cloud's shadow: a soft, ragged patch baked once at about the size it is drawn (so it is never blown up into
// blocks), its edge torn by layered noise and fading out gradually. Shadows are soft in life, so this one has smooth
// alpha rather than a dither.
const SHADE_W = 320
const SHADE_H = 160
function cloudShadeTexture(seed: number) {
  const rand = (i: number) => {
    let h = Math.imul(seed * 374761393 + i * 668265263, 1274126177)
    h ^= h >>> 15
    return ((Math.imul(h, 2246822519) >>> 0) % 100000) / 100000
  }
  const lobes = Array.from({ length: 6 }, (_, i) => ({
    x: SHADE_W * (0.22 + rand(i) * 0.56),
    y: SHADE_H * (0.35 + rand(i + 20) * 0.3),
    rx: SHADE_W * (0.12 + rand(i + 40) * 0.12),
    ry: SHADE_H * (0.16 + rand(i + 60) * 0.14),
  }))
  // Smooth value noise on a coarse lattice, a few octaves of it.
  const lattice = (gx: number, gy: number, o: number) => rand(1000 + o * 7919 + gx * 131 + gy * 977)
  const noise = (x: number, y: number, o: number) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const a = lattice(ix, iy, o) + (lattice(ix + 1, iy, o) - lattice(ix, iy, o)) * sx
    const b = lattice(ix, iy + 1, o) + (lattice(ix + 1, iy + 1, o) - lattice(ix, iy + 1, o)) * sx
    return a + (b - a) * sy
  }
  const canvas = document.createElement('canvas')
  canvas.width = SHADE_W
  canvas.height = SHADE_H
  const g = canvas.getContext('2d')!
  const image = g.createImageData(SHADE_W, SHADE_H)
  for (let y = 0; y < SHADE_H; y++)
    for (let x = 0; x < SHADE_W; x++) {
      let v = 0
      for (const l of lobes) v = Math.max(v, 1 - Math.hypot((x - l.x) / l.rx, (y - l.y) / l.ry))
      const n = noise(x / 40, y / 20, 0) * 0.55 + noise(x / 16, y / 8, 1) * 0.3 + noise(x / 6, y / 3, 2) * 0.15
      // The noise eats into the edge and leaves thinner patches inside; the edge fades out over a wide band.
      const t = Math.min(1, Math.max(0, (v + (n - 0.5) * 0.9 + 0.15) / 0.75))
      const alpha = t * t * (3 - 2 * t)
      // Fade to nothing at the canvas edge whatever the noise does.
      const edge = Math.min(1, x / 24, (SHADE_W - 1 - x) / 24, y / 16, (SHADE_H - 1 - y) / 16)
      const k = (y * SHADE_W + x) * 4
      image.data[k] = 0x3e
      image.data[k + 1] = 0x48
      image.data[k + 2] = 0x56
      image.data[k + 3] = Math.round(255 * alpha * Math.max(0, edge))
    }
  g.putImageData(image, 0, 0)
  return new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'linear' }) })
}

const luma = (c: number) => ((c >> 16) & 0xff) * 0.3 + ((c >> 8) & 0xff) * 0.59 + (c & 0xff) * 0.11

// The weather forced in development: ?rain=1 (rain), ?rain=storm, ?rain=sleet, ?rain=shower, ?rain=snow.
function forcedWeather(): Weather | null {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(location.search).get('rain')
  if (!v) return null
  if (v === 'storm') return { rain: 1, grey: 0.9, wind: 0.55, sleet: false, lightning: true, snow: false }
  if (v === 'sleet') return { rain: 0.5, grey: 0.6, wind: 0.2, sleet: true, lightning: false, snow: false }
  if (v === 'shower') return { rain: 0.35, grey: 0.5, wind: 0.2, sleet: false, lightning: false, snow: false }
  if (v === 'snow') return { rain: 0.6, grey: 0.65, wind: 0.15, sleet: false, lightning: false, snow: true }
  return { rain: 0.6, grey: 0.65, wind: 0.25, sleet: false, lightning: false, snow: false }
}

interface Drop {
  sprite: Sprite
  x: number
  y: number
  vy: number
  end: number
  length: number
  // A snowflake's sway: its phase and how wide it swings.
  phase: number
  sway: number
}

interface Splash {
  sprite: Sprite
  born: number
  frames: Texture[]
}

const CLOUD_SHADES = 5
// How far apart the cloud shadows repeat across and down the screen, in screen pixels.
const CLOUD_PERIOD = { x: 1100, y: 700 }
// Splash frames a second, and at most this many splashes start each second (the rest of the drops just end).
const SPLASH_FPS = 11
const SPLASHES_PER_SECOND = 110
const MAX_SPLASHES = 160

export function createWeather(world: World): WeatherLayer {
  const ground = new Container()
  const screen = new Container()
  const wash = new Graphics()
  const shades = new Container()
  const rainLayer = new Container()
  screen.addChild(wash, shades, rainLayer)
  const flash = new Graphics()
  flash.visible = false
  const forced = forcedWeather()
  let key: number | undefined = forced ? 1 : undefined
  let saver = false
  let weather: Weather = CLEAR_WEATHER
  let weatherAt_ = 0
  let last = performance.now()
  let washKey = ''
  let thunderSlot = -1
  let soundAt = 0
  let splashBudget = 0
  let wasSnow = false
  const crowns = crownFrames(false)
  const sleetCrowns = crownFrames(true)
  const rings = ringFrames()
  const drops: Drop[] = []
  const splashes: Splash[] = []
  const shadeSprites = Array.from({ length: CLOUD_SHADES }, (_, i) => {
    const s = new Sprite(cloudShadeTexture(i + 3))
    s.blendMode = 'multiply'
    // Drawn near the size it was baked, smoothly filtered: never blocky at any zoom (the shadows are screen-sized).
    s.scale.set(i % 2 ? 1.6 : 2.1)
    shades.addChild(s)
    return { sprite: s, bx: ((i * 0.618) % 1) * CLOUD_PERIOD.x, by: ((i * 0.381 + 0.2) % 1) * CLOUD_PERIOD.y }
  })
  const rnd = Math.random

  const resetDrop = (d: Drop, width: number, height: number, unit: number, fill: boolean) => {
    const w = weather
    if (w.snow) {
      // Flakes drift down slowly, swaying, and melt into the ground somewhere on screen.
      d.vy = 28 + rnd() * 46
      d.end = rnd() * (height + 30)
      const fall = 60 + rnd() * 300
      d.y = fill ? d.end - rnd() * fall : d.end - fall
      d.x = rnd() * (width + 80) - 40 - w.wind * (d.end - d.y)
      d.length = 0
      d.phase = rnd() * Math.PI * 2
      d.sway = 4 + rnd() * 10
      d.sprite.texture = flakes[d.vy > 62 ? 2 : d.vy > 44 ? 1 : 0]
      d.sprite.scale.set(unit)
      d.sprite.alpha = 0.6 + rnd() * 0.4
      return
    }
    d.vy = w.sleet ? 200 + rnd() * 120 : 760 + rnd() * 340
    // The drop ends where it meets the ground somewhere on screen, after falling a short way into sight.
    d.end = rnd() * (height + 30)
    const fall = (w.sleet ? 90 : 160) + rnd() * 260
    d.y = fill ? d.end - rnd() * fall : d.end - fall
    d.x = rnd() * (width + 80) - 40 - w.wind * (d.end - d.y)
    d.length = w.sleet ? 3 : 7 + Math.floor(rnd() * 6)
    // Leaning in steps of a tenth, so a handful of textures serve every drop.
    d.sprite.texture = streakTexture(d.length, Math.round(w.wind * 10) / 10, w.sleet)
    d.sprite.scale.set(unit)
    d.sprite.alpha = 0.55 + rnd() * 0.45
  }

  const splash = (sx: number, sy: number, cam: { x: number; y: number; scale: number }, now: number) => {
    const wx = (sx - cam.x) / cam.scale
    const wy = (sy - cam.y) / cam.scale
    const tile = screenToGround(world, { x: wx, y: wy })
    const tx = Math.floor(tile.x)
    const ty = Math.floor(tile.y)
    if (tx < 0 || ty < 0 || tx >= world.size || ty >= world.size) return
    const i = ty * world.size + tx
    const t = world.terrain[i]
    const water = (t === Terrain.Lake || t === Terrain.River) && world.feature[i] !== Feature.Bridge
    let s = splashes.find((p) => !p.sprite.visible)
    if (!s) {
      if (splashes.length >= MAX_SPLASHES) return
      const sprite = new Sprite()
      sprite.anchor.set(0.5, 0.6)
      ground.addChild(sprite)
      s = { sprite, born: 0, frames: crowns }
      splashes.push(s)
    }
    s.frames = water ? rings : weather.sleet ? sleetCrowns : crowns
    s.born = now
    s.sprite.texture = s.frames[0]
    s.sprite.position.set(Math.round(wx), Math.round(wy))
    s.sprite.visible = true
  }

  const layer: WeatherLayer = {
    ground,
    screen,
    flash,
    setKey(k) {
      if (!forced) key = k
    },
    setSaver(on) {
      saver = on
    },
    light(color) {
      const g = weather.grey
      if (g <= 0) return color
      const l = luma(color)
      // Cool grey of the same brightness, mixed in by half the greyness, then darkened.
      const grey = [l * 0.9, l * 0.95, l * 1.06]
      const dark = 1 - D.darken * g * (weather.snow ? 0.4 : 1)
      const ch = (shift: number, k: number) => Math.min(255, Math.round((((color >> shift) & 0xff) * (1 - g * 0.5) + grey[k] * g * 0.5) * dark))
      return (ch(16, 0) << 16) | (ch(8, 1) << 8) | ch(0, 2)
    },
    update(time, cam, width, height) {
      const now = performance.now()
      const dt = Math.min(0.12, (now - last) / 1000)
      last = now
      // The weather changes slowly: worked out a few times a second.
      if (now - weatherAt_ > 250) {
        weatherAt_ = now
        weather = forced ?? weatherAt(key, time)
      }
      const w = weather
      // Snow falls without a sound.
      const sound = !saver && !document.hidden && !w.snow ? w.rain * (w.sleet ? 0.5 : 1) : 0
      if (now - soundAt > 500) {
        soundAt = now
        setRainSound(sound)
      }
      // The grey wash: the ground's colours drawn toward a cool grey.
      const wk = `${Math.round(w.grey * 100)}:${w.snow}:${width}:${height}`
      if (wk !== washKey) {
        washKey = wk
        wash.clear()
        // Snow clouds are paler: a light, cold haze rather than the rain's grey.
        if (w.grey > 0.005) wash.rect(0, 0, width, height).fill({ color: w.snow ? 0xc4cedb : 0x7c8794, alpha: D.greyWash * w.grey })
      }
      // Cloud shadows drift with the wind, held to the ground as the map is dragged (a little behind it, as if high).
      shades.visible = !saver && w.grey > 0.02
      if (shades.visible) {
        const drift = time / 1000
        for (const [i, s] of shadeSprites.entries()) {
          const px = s.bx + drift * (14 + i * 3) * Math.sign(w.wind || 1) + cam.x * 0.6
          const py = s.by + drift * (4 + i) + cam.y * 0.6
          const mod = (v: number, p: number) => ((v % p) + p) % p
          s.sprite.position.set(Math.round(mod(px, CLOUD_PERIOD.x + 600) - 600), Math.round(mod(py, CLOUD_PERIOD.y + 300) - 300))
          s.sprite.alpha = 0.3 * w.grey
        }
      }
      // Falling rain: as many drops as the rain is hard, for the size of the screen.
      const unit = Math.max(1, Math.min(3, Math.round(cam.scale)))
      const want = w.rain <= 0.01 ? 0 : Math.round(D.maxDrops * w.rain * Math.min(1.6, (width * height) / (1280 * 800)) * (saver ? D.saverShare : 1))
      while (drops.length < want) {
        const sprite = new Sprite()
        sprite.anchor.set(0, 1)
        rainLayer.addChild(sprite)
        const d: Drop = { sprite, x: 0, y: 0, vy: 0, end: 0, length: 0, phase: 0, sway: 0 }
        resetDrop(d, width, height, unit, true)
        drops.push(d)
      }
      while (drops.length > want) drops.pop()!.sprite.destroy()
      const splashing = !saver && !w.snow && cam.scale >= D.splashZoom
      splashBudget = Math.min(SPLASHES_PER_SECOND / 4, splashBudget + dt * SPLASHES_PER_SECOND)
      // Drops end (and maybe splash) about this many times a second; splashes are rationed among them.
      const hits = drops.length > 0 ? drops.reduce((n, d) => n + d.vy, 0) / drops.length / 300 * drops.length : 0
      const share = hits > 0 ? SPLASHES_PER_SECOND / hits : 0
      // A change between rain and snow sends every drop round again in the new form.
      if (w.snow !== wasSnow) {
        wasSnow = w.snow
        for (const d of drops) resetDrop(d, width, height, unit, true)
      }
      const t = time / 1000
      for (const d of drops) {
        d.y += d.vy * dt
        d.x += w.wind * d.vy * dt
        if (w.snow) {
          d.sprite.position.set(Math.round(d.x + Math.sin(t * 1.3 + d.phase) * d.sway), Math.round(d.y))
          if (d.y >= d.end) resetDrop(d, width, height, unit, false)
          continue
        }
        if (d.y >= d.end) {
          if (splashing && splashBudget >= 1 && rnd() < share) {
            splashBudget--
            splash(d.x + (w.wind >= 0 ? Math.abs(w.wind) * d.length * unit : 0), d.end, cam, now)
          }
          resetDrop(d, width, height, unit, false)
        }
        d.sprite.position.set(Math.round(d.x), Math.round(d.y))
      }
      // Splashes play their frames and go.
      for (const s of splashes) {
        if (!s.sprite.visible) continue
        const frame = Math.floor(((now - s.born) / 1000) * SPLASH_FPS)
        if (frame >= s.frames.length || !splashing) s.sprite.visible = false
        else s.sprite.texture = s.frames[frame]
      }
      // Lightning in a storm, with thunder a moment later.
      const bright = w.lightning && key !== undefined ? lightningAt(key, time) : 0
      flash.visible = bright > 0.02
      if (flash.visible) flash.clear().rect(0, 0, width, height).fill({ color: 0xe8eeff, alpha: (saver ? 0.25 : 0.42) * bright })
      const slot = Math.floor(time / (balance.weather.lightning.slotSeconds * 1000))
      if (bright > 0.3 && slot !== thunderSlot) {
        thunderSlot = slot
        if (!saver && !document.hidden) thunder(0.6 + w.rain * 0.4)
      }
    },
    destroy() {
      // The layers go with the stage they stand on; the textures baked for this map (not the shared streak cache) are
      // freed here, or every lobby switch would leave them on the GPU.
      setRainSound(0)
      for (const t of [...crowns, ...sleetCrowns, ...rings, ...shadeSprites.map((s) => s.sprite.texture)]) t.destroy(true)
    },
  }
  return layer
}
