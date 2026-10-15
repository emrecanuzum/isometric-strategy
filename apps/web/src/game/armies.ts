import { armyAt, groundToScreen, routeLength, tileToScreen } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Graphics, Sprite as PixiSprite, Text } from 'pixi.js'
import { KINGDOM_COLORS } from './buildingSprites'
import type { KingdomColor } from './buildingSprites'
import { Canvas, NO_SHADOW, STONE, TIMBER, ramp, rgb, shadow } from './sprites'
import type { Sprite } from './sprites'
import { dashes } from './dashes'
import { textureOf } from './textures'
import { surfaceHeight } from './chunkPainter'

// Armies on the map (CLAUDE.md §9.7): a squad of spearmen under the kingdom's banner, walking along the route the
// server keeps, which is drawn ahead of the player's own armies as a dashed line; crossed swords mark battles.
// Positions follow from the clock, like the caravans.

export interface MapArmy {
  id: number
  color: string | null
  own: boolean
  // Known for the player's own armies only.
  soldiers: number | null
  path: Point[]
  departAt: number
  arriveAt: number
  battle: boolean
  selected: boolean
  // Figures drawn (3–9, by its size) and whether a catapult rolls behind it.
  figures: number
  catapult: boolean
  // A column of this many squads one behind another (the crowns' patrols), each drawn this much larger.
  train?: number
  size?: number
}

// Tiles between the squads of a column.
const TRAIN_GAP = 1.7

export interface MapBattle {
  id: number
  at: Point
  startedAt: number
  endsAt: number
}

const SKIN = rgb(0xb88458)
const HELM = ramp(0x4a505a, 0x7a828e, 0xa8b0bc, 0xd6dce4)
const DASH = 10
const GAP = 7

const roofsOf = (color: string | null) => (KINGDOM_COLORS[color as KingdomColor] ?? KINGDOM_COLORS.royal).roofs

// Spearmen in tunics of the kingdom's colour behind a banner, more of them for a bigger army (in ranks of three), and
// a catapult on wheels at the back when the army has one; two frames of the march.
export function squad(color: string | null, frame: number, figures = 3): Sprite {
  const tunic = roofsOf(color)
  const canvas = new Canvas(52, 58)
  const base = 56
  const ox = 22
  // How high each pixel stands above the ground under it, so every soldier throws his shadow from his own feet (not
  // from the bottom of the sprite, which would set the rear ranks' shadows adrift).
  const lift = new Uint8Array(canvas.width * canvas.height)
  const raise = (ground: number, draw: () => void, shadowless = false) => {
    const before = canvas.pixels.slice()
    draw()
    for (let i = 0; i < before.length; i++) {
      if (canvas.pixels[i] !== before[i]) lift[i] = shadowless ? NO_SHADOW : Math.min(NO_SHADOW - 1, Math.max(0, ground - Math.floor(i / canvas.width)))
    }
  }
  // The march in four frames: a stride one way, feet together (body up a pixel), a stride the other way, together.
  const STRIDE = [1, 0, -1, 0]
  const LIFT = [0, 1, 0, 1]
  const soldier = (cx: number, feet: number, phase: number) => {
    const step = STRIDE[phase & 3]
    const by = feet - LIFT[phase & 3]
    canvas.set(cx - 1 - step, feet, TIMBER[0])
    canvas.set(cx + 1 + step, feet, TIMBER[0])
    if (LIFT[phase & 3]) {
      canvas.set(cx - 1, feet - 1, TIMBER[0])
      canvas.set(cx + 1, feet - 1, TIMBER[0])
    }
    for (let y = by - 7; y < by; y++) for (let x = cx - 1; x <= cx + 1; x++) canvas.set(x, y, tunic[x < cx ? 4 : x === cx ? 3 : 2])
    canvas.set(cx, by - 8, SKIN)
    canvas.set(cx - 1, by - 9, HELM[3])
    canvas.set(cx, by - 9, HELM[2])
    canvas.set(cx + 1, by - 9, HELM[1])
    canvas.set(cx, by - 10, HELM[2])
    // Spear held upright, a small round shield on the arm.
    for (let y = by - 15; y < by - 1; y++) canvas.set(cx + 2, y, TIMBER[2])
    canvas.set(cx + 2, by - 16, STONE[4])
    canvas.set(cx + 2, by - 17, STONE[3])
    canvas.set(cx - 2, by - 5, tunic[1])
    canvas.set(cx - 2, by - 4, tunic[1])
    canvas.set(cx - 3, by - 5, HELM[2])
  }
  // The banner stands behind the rear soldier.
  const bx = ox + 4
  // The banner throws no shadow: its long one, cast from high up, read as the squad floating over the ground.
  raise(base - 26, () => {
    for (let y = base - 50; y < base - 26; y++) canvas.set(bx, y, TIMBER[1])
    for (let y = 0; y < 7; y++) {
      for (let x = 1; x <= 9; x++) {
        const wave = Math.round(Math.sin(x * 0.7 + frame * 1.5) * 0.8)
        if (x > 7 && (y === 0 || y === 6)) continue
        canvas.set(bx + x, base - 50 + y + wave, y === 0 ? tunic[5] : tunic[y < 3 ? 3 : 2])
      }
    }
  }, true)
  // Ranks of three, back to front, each a little lower and to the side on the iso grid.
  const spots: [number, number][] = []
  for (let i = 0; i < figures; i++) {
    // Ranks of four, packed close so a big army reads as a crowd.
    const rank = Math.floor(i / 4)
    const file = i % 4
    spots.push([ox + file * 4 - rank * 4 - 2, base - 22 + rank * 3 + file * 2])
  }
  spots.sort((a, b) => a[1] - b[1])
  // Neighbours out of step with each other, so the column ripples as it marches.
  spots.forEach(([x, y], i) => raise(y, () => soldier(x, y, frame + (i % 2) * 2)))
  shadow(canvas, ox, base - 12, 8 + Math.ceil(figures / 4) * 3)
  return { ...canvas.sprite(ox + 2, base - 10, 0), lift }
}

// A catapult on its wheeled bed, facing right (mirrored to face left): the throwing arm leans back over the bed and the
// wheels turn through four frames as it rolls.
export function catapultLook(frame: number): Sprite {
  const canvas = new Canvas(30, 26)
  const cx = 15
  const cy = 20
  // The bed, sloping with the ground's grain toward the front.
  for (let x = -9; x <= 9; x++) for (let z = 0; z < 3; z++) canvas.set(cx + x, cy - z + Math.round(x * 0.25), TIMBER[z === 2 ? 2 : 1])
  // The A-frame and the arm, its cup with a stone at the back.
  for (let z = 0; z < 9; z++) {
    canvas.set(cx - 1 + Math.round(z * 0.25), cy - 3 - z, TIMBER[2])
    canvas.set(cx + 3 - Math.round(z * 0.25), cy - 3 - z, TIMBER[1])
  }
  for (let i = 0; i < 15; i++) canvas.set(cx - 8 + i, cy - 15 + Math.round(i * 0.6), TIMBER[i < 3 ? 0 : 2])
  canvas.set(cx - 8, cy - 16, STONE[3])
  canvas.set(cx - 9, cy - 16, STONE[2])
  canvas.set(cx - 8, cy - 17, STONE[4])
  // Wheels: a rim and two spokes turned a quarter more each frame.
  for (const wx of [-6, 6]) {
    const wy = cy + 1 + Math.round(wx * 0.25)
    for (let a = 0; a < 16; a++) canvas.set(cx + wx + Math.round(Math.cos((a / 16) * Math.PI * 2) * 3), wy + Math.round(Math.sin((a / 16) * Math.PI * 2) * 3), TIMBER[0])
    const turn = (frame / 4) * (Math.PI / 2)
    for (let r = -2; r <= 2; r++) {
      canvas.set(cx + wx + Math.round(Math.cos(turn) * r), wy + Math.round(Math.sin(turn) * r), TIMBER[2])
      canvas.set(cx + wx + Math.round(Math.cos(turn + Math.PI / 2) * r), wy + Math.round(Math.sin(turn + Math.PI / 2) * r), TIMBER[2])
    }
  }
  shadow(canvas, cx, cy + 3, 10)
  return canvas.sprite(cx, cy + 3, 0)
}

// Two crossed swords over a puff of dust.
function swords(): Sprite {
  const canvas = new Canvas(22, 22)
  for (let i = 0; i < 15; i++) {
    canvas.set(3 + i, 3 + i, i < 11 ? HELM[3] : TIMBER[1])
    canvas.set(18 - i, 3 + i, i < 11 ? HELM[2] : TIMBER[1])
  }
  for (const [x, y] of [[13, 15], [14, 14], [7, 14], [8, 15]]) canvas.set(x, y, rgb(0xe2c058))
  shadow(canvas, 11, 20, 7)
  return canvas.sprite(11, 20, 0)
}

const squads = new Map<string, Sprite[]>()
const squadOf = (color: string | null, frame: number, figures = 3) => {
  const key = `${color ?? 'royal'}:${figures}`
  if (!squads.has(key)) squads.set(key, [0, 1, 2, 3].map((f) => squad(color, f, figures)))
  return squads.get(key)![frame]
}
const CATAPULTS = [0, 1, 2, 3].map(catapultLook)
const SWORDS = swords()

interface Shown {
  army: MapArmy
  body: PixiSprite
  ring: Graphics
  label: Text | null
  // The catapult rolling behind, and the way the army last faced (tile space).
  cart: PixiSprite | null
  facing: Point
  // The squads riding behind the first in a column.
  followers: PixiSprite[]
}

export function createArmies(world: World, walkers: Container, routes: Graphics, labels: Container) {
  // Where a marcher stands on screen: on a bridge's deck when crossing, not down at the water.
  const standAt = (p: Point) => {
    const s = tileToScreen(p)
    return { x: s.x, y: s.y - surfaceHeight(world, p) }
  }
  const shown = new Map<number, Shown>()
  let battles: { battle: MapBattle; sprite: PixiSprite }[] = []

  function set(armies: MapArmy[], fights: MapBattle[]) {
    const ids = new Set(armies.map((a) => a.id))
    for (const [id, s] of shown) {
      if (ids.has(id)) continue
      s.body.destroy()
      s.ring.destroy()
      s.label?.destroy()
      s.cart?.destroy()
      for (const f of s.followers) f.destroy()
      shown.delete(id)
    }
    for (const army of armies) {
      let s = shown.get(army.id)
      if (!s) {
        const body = new PixiSprite(textureOf(squadOf(army.color, 0)))
        const look = squadOf(army.color, 0)
        body.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
        const ring = new Graphics()
        // Labelled so the layer they share with buildings keeps them at every zoom and sorts them like walkers.
        body.label = 'army'
        ring.label = 'army-ring'
        walkers.addChild(ring, body)
        s = { army, body, ring, label: null, cart: null, facing: { x: 1, y: 0 }, followers: [] }
        shown.set(army.id, s)
      }
      s.army = army
      const behind = Math.max(0, (army.train ?? 1) - 1)
      while (s.followers.length < behind) {
        const f = new PixiSprite(textureOf(squadOf(army.color, 0)))
        f.label = 'army'
        walkers.addChild(f)
        s.followers.push(f)
      }
      while (s.followers.length > behind) s.followers.pop()!.destroy()
      if (army.catapult && !s.cart) {
        s.cart = new PixiSprite(textureOf(CATAPULTS[0]))
        s.cart.label = 'army'
        s.cart.anchor.set(CATAPULTS[0].anchorX / CATAPULTS[0].width, CATAPULTS[0].anchorY / CATAPULTS[0].height)
        walkers.addChild(s.cart)
      } else if (!army.catapult && s.cart) {
        s.cart.destroy()
        s.cart = null
      }
      if (army.soldiers !== null && !s.label) {
        s.label = new Text({
          text: '',
          resolution: window.devicePixelRatio * 2,
          anchor: { x: 0.5, y: 1 },
          style: { fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace", fontSize: 13, fill: 0xf3e6c8, stroke: { color: 0x120d0b, width: 3 } },
        })
        labels.addChild(s.label)
      }
      if (s.label) s.label.text = `${army.soldiers}`
    }
    for (const b of battles) b.sprite.destroy()
    battles = fights.map((battle) => {
      const sprite = new PixiSprite(textureOf(SWORDS))
      sprite.anchor.set(SWORDS.anchorX / SWORDS.width, SWORDS.anchorY / SWORDS.height)
      labels.addChild(sprite)
      return { battle, sprite }
    })
  }

  function dashed(points: Point[], scale: number) {
    dashes(points, DASH / scale, GAP / scale, false, (x0, y0, x1, y1) => routes.moveTo(x0, y0).lineTo(x1, y1))
  }

  function update(time: number, scale: number) {
    routes.clear()
    for (const s of shown.values()) {
      const { army, body, ring, label } = s
      const route = { path: army.path, depart_at: new Date(army.departAt).toISOString(), arrive_at: new Date(army.arriveAt).toISOString() }
      const here = armyAt(route, time)
      const screen = standAt(here)
      const moving = !army.battle && time < army.arriveAt && army.path.length > 1
      // Which way it is heading: from a moment ago to now (kept when it stops).
      if (moving) {
        const before = armyAt(route, time - 600)
        const dx = here.x - before.x
        const dy = here.y - before.y
        const d = Math.hypot(dx, dy)
        if (d > 1e-3) s.facing = { x: dx / d, y: dy / d }
      }
      if (s.cart) {
        // A tile and a half behind the column, facing the way it goes, wheels turning while it rolls (when close).
        const behind = { x: here.x - s.facing.x * 1.5, y: here.y - s.facing.y * 1.5 }
        const at = standAt(behind)
        const frame = moving && scale >= 1 ? Math.floor(time / 120) % 4 : 0
        s.cart.texture = textureOf(CATAPULTS[frame])
        s.cart.position.set(at.x, at.y)
        const size = Math.max(1, 0.6 / scale)
        s.cart.scale.set(s.facing.x - s.facing.y < 0 ? -size : size, size)
        s.cart.zIndex = at.y
      }
      // Marching feet only when close enough to see them; far out the column stands still.
      // Shown again each frame: the layer's sorting hides an army while it stands inside a building's footprint (in a
      // gateway).
      body.visible = true
      if (s.cart) s.cart.visible = true
      const look = squadOf(army.color, moving && scale >= 1 ? Math.floor(time / 180) % 4 : 0, army.figures)
      body.texture = textureOf(look)
      body.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
      body.position.set(screen.x, screen.y)
      // Larger than life when zoomed out, so an army never shrinks out of sight.
      const size = Math.max(1, 0.6 / scale) * (army.size ?? 1)
      body.scale.set(size)
      body.zIndex = screen.y
      // The rest of a column ride the same road a little later, each on its own; bunched up where the road ends (or
      // has not yet begun) they gather round the first.
      if (s.followers.length > 0) {
        const speed = routeLength(army.path) / Math.max(1, army.arriveAt - army.departAt)
        s.followers.forEach((f, i) => {
          const k = i + 1
          const lag = speed > 0 ? (k * TRAIN_GAP) / speed : 0
          const trail = armyAt(route, time - lag)
          const angle = (k / s.followers.length) * Math.PI * 2 + army.id
          const rest = { x: here.x + Math.cos(angle) * 1.4, y: here.y + Math.sin(angle) * 1.4 }
          const w = Math.min(1, Math.hypot(trail.x - here.x, trail.y - here.y) / (k * TRAIN_GAP))
          const at = { x: rest.x + (trail.x - rest.x) * w, y: rest.y + (trail.y - rest.y) * w }
          const p = standAt(at)
          f.visible = true
          f.texture = body.texture
          f.anchor.copyFrom(body.anchor)
          f.position.set(p.x, p.y)
          f.scale.set(size)
          f.zIndex = p.y
        })
      }
      ring.clear()
      if (army.selected) {
        ring.ellipse(screen.x, screen.y, 16, 8).stroke({ width: 2 / scale, color: 0xf2d16b })
        ring.zIndex = screen.y - 1
      }
      if (label) {
        label.position.set(screen.x, screen.y - 44 * Math.max(1, 0.6 / scale))
        label.scale.set(1 / scale)
      }
      // The road still ahead of the player's own armies.
      if (army.own && moving) {
        const ahead = army.path.filter((_, i) => i > 0)
        const total = Math.max(1, army.arriveAt - army.departAt)
        const share = (time - army.departAt) / total
        // Corners already passed are dropped; what remains is drawn from where the army stands.
        let walked = 0
        const lengths = army.path.slice(1).map((p, i) => Math.hypot(p.x - army.path[i].x, p.y - army.path[i].y))
        const length = lengths.reduce((a, b) => a + b, 0)
        const remaining = [here, ...ahead.filter((_, i) => (walked += lengths[i]) > share * length)]
        const color = parseInt((KINGDOM_COLORS[army.color as KingdomColor]?.swatch ?? '#f2d16b').slice(1), 16)
        dashed(remaining.map((p) => groundToScreen(world, p)), scale)
        routes.stroke({ width: 3 / scale, color, alpha: 0.6, cap: 'butt' })
        const end = groundToScreen(world, army.path[army.path.length - 1])
        routes.circle(end.x, end.y, 5 / scale).fill({ color, alpha: 0.6 })
      }
    }
    for (const { battle, sprite } of battles) {
      const on = time >= battle.startedAt && time < battle.endsAt
      sprite.visible = on
      if (!on) continue
      const screen = groundToScreen(world, battle.at)
      sprite.position.set(screen.x, screen.y - 30 - Math.abs(Math.sin(time / 250)) * 4)
      sprite.scale.set(Math.max(1, 0.6 / scale))
    }
  }

  // The army drawn nearest to a point on the map (world pixels), if any is close.
  function pick(at: Point): number | undefined {
    let best: number | undefined
    let bestD = 22
    for (const { army, body } of shown.values()) {
      const d = Math.hypot(body.x - at.x, body.y - 14 - at.y)
      if (d < bestD) {
        bestD = d
        best = army.id
      }
    }
    return best
  }

  return { set, update, pick }
}
