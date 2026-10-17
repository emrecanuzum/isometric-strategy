import { armyAt, groundToScreen, routeLength, tileToScreen } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Graphics, Sprite as PixiSprite, Text } from 'pixi.js'
import { KINGDOM_COLORS } from './buildingSprites'
import type { KingdomColor } from './buildingSprites'
import { Canvas, NO_SHADOW, STONE, TIMBER, ramp, rgb, shadow } from './sprites'
import type { Sprite } from './sprites'
import { dashes } from './dashes'
import { textureOf } from './textures'
import { surfaceHeight, worldDecks } from './chunkPainter'

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
  // The lord leads it himself: a royal banner (gold, crowned) and a crowned rider at its head.
  royal?: boolean
  // A column of this many squads one behind another (the crowns' patrols), each drawn this much larger.
  train?: number
  size?: number
  // A column riding back the way it came: the squads that halted behind its first lead the way home.
  trainAhead?: boolean
  // The tag over it ("Ulupınar Beyliği · 24"): on a plate in its lord's colour (`tagColor`), or dark with a blood-red
  // edge for outlaws (bandits, rebels). Rivals' sizes come only roughly ("birkaç / orta / büyük").
  tag?: string
  tagColor?: number
  tagOutlaw?: boolean
}

// A rival army's size as everyone sees it, from the figures drawn (about one for every two soldiers).
export const roughSize = (figures: number) => (figures <= 4 ? 'birkaç' : figures <= 10 ? 'orta' : 'büyük')

// A tag over a squad or a fleet on the map: a dark-edged plate in the lord's colour with the text in white, or (for
// outlaws) near black with a blood-red edge and red text. Drawn in screen pixels; scale it by 1 / the camera's zoom.
export function mapTag(text: string, color: number, outlaw = false) {
  const box = new Container()
  const back = new Graphics()
  const label = new Text({
    text,
    resolution: window.devicePixelRatio * 2,
    anchor: { x: 0.5, y: 0.5 },
    style: { fontFamily: "'Digits', 'Pixelify Sans', ui-monospace, monospace", fontSize: 13, fill: outlaw ? 0xff7a62 : 0xffffff, stroke: { color: 0x120d0b, width: 3, join: 'round' } },
  })
  const w = label.width + 10
  const h = label.height + 4
  if (outlaw) back.roundRect(-w / 2, -h / 2, w, h, 3).fill({ color: 0x1a0c0c, alpha: 0.92 }).stroke({ width: 2, color: 0x9a1c14 })
  else back.roundRect(-w / 2, -h / 2, w, h, 3).fill({ color, alpha: 0.9 }).stroke({ width: 1.5, color: 0x120d0b })
  box.addChild(back, label)
  return box
}

// The point `d` tiles along a path (clamped to its ends).
function along(path: Point[], d: number): Point {
  if (d <= 0 || path.length < 2) return path[0]
  for (let i = 1; i < path.length; i++) {
    const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (d <= l) {
      const f = l ? d / l : 0
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * f, y: path[i - 1].y + (path[i].y - path[i - 1].y) * f }
    }
    d -= l
  }
  return path[path.length - 1]
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
const GOLD = ramp(0x8a5e1c, 0xd9a83a, 0xffe27a)
const CLOAK = ramp(0x3e2050, 0x6a3a8c, 0x8e5ab0)
const DASH = 10
const GAP = 7

// A town's rebels (CLAUDE.md §8.4) march in black and ash grey, no kingdom's colours.
export const REBEL_COLOR = 'rebel'
const REBEL = ramp(0x0e0e10, 0x18181c, 0x24242a, 0x34343a, 0x4a4a50, 0x8a8a90)
// Bandits off the trade roads (CLAUDE.md §7.9) wear patched brown leather under a torn, soot-black banner.
export const BANDIT_COLOR = 'bandit'
const BANDIT = ramp(0x1a120c, 0x2a1c12, 0x3c2a1a, 0x4e3824, 0x6a4c30, 0x8a2a20)
const roofsOf = (color: string | null) => (color === REBEL_COLOR ? REBEL : color === BANDIT_COLOR ? BANDIT : (KINGDOM_COLORS[color as KingdomColor] ?? KINGDOM_COLORS.royal).roofs)

// Spearmen in tunics of the kingdom's colour behind a banner, more of them for a bigger army (in ranks of three), and
// a catapult on wheels at the back when the army has one; two frames of the march.
export function squad(color: string | null, frame: number, figures = 3, royal = false): Sprite {
  const tunic = roofsOf(color)
  const tattered = color === BANDIT_COLOR
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
        // A bandits' banner is torn: ragged notches out of its fly and holes in the cloth.
        if (tattered && ((x >= 6 && (x + y * 3) % 4 === 0) || (x === 4 && y === 3) || (x > 8 && y % 2 === 1))) continue
        // The royal banner: gold, edged in the kingdom's colour, a small crown on it.
        const crown = royal && y >= 2 && y <= 4 && x >= 3 && x <= 6 && (y > 2 || x === 3 || x === 6 || x === 4)
        const color = royal ? (crown ? tunic[5] : y === 0 || y === 6 ? tunic[3] : GOLD[y < 3 ? 2 : 1]) : y === 0 ? tunic[5] : tunic[y < 3 ? 3 : 2]
        canvas.set(bx + x, base - 50 + y + wave, color)
      }
    }
    // A gilded finial over the royal banner.
    if (royal) {
      canvas.set(bx, base - 51, GOLD[2])
      canvas.set(bx - 1, base - 52, GOLD[1])
      canvas.set(bx + 1, base - 52, GOLD[1])
      canvas.set(bx, base - 53, GOLD[2])
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
  // The lord at the front: a crowned man in a purple cloak.
  if (royal) {
    const [x, y] = [ox + 8, base - 6]
    raise(y, () => {
      soldier(x, y, frame + 1)
      for (let yy = y - 8; yy < y - 1; yy++) canvas.set(x - 2, yy, CLOAK[yy < y - 5 ? 2 : 1])
      for (let xx = x - 1; xx <= x + 1; xx++) canvas.set(xx, y - 9, GOLD[2])
      canvas.set(x - 1, y - 10, GOLD[2])
      canvas.set(x + 1, y - 10, GOLD[2])
      canvas.set(x, y - 10, GOLD[1])
    })
  }
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
const squadOf = (color: string | null, frame: number, figures = 3, royal = false) => {
  const key = `${color ?? 'royal'}:${figures}${royal ? ':king' : ''}`
  if (!squads.has(key)) squads.set(key, [0, 1, 2, 3].map((f) => squad(color, f, figures, royal)))
  return squads.get(key)![frame]
}
const CATAPULTS = [0, 1, 2, 3].map(catapultLook)
const SWORDS = swords()

interface Shown {
  army: MapArmy
  body: PixiSprite
  ring: Graphics
  label: { box: Container; key: string } | null
  // The catapult rolling behind, and the way the army last faced (tile space).
  cart: PixiSprite | null
  facing: Point
  // The squads riding behind the first in a column.
  followers: PixiSprite[]
}

export function createArmies(world: World, walkers: Container, routes: Graphics, labels: Container) {
  // Where a marcher stands on screen: on a bridge's deck when crossing, not down at the water, and along the deck's
  // middle (the way over the bridge's tiles zigzags).
  const decks = worldDecks(world)
  const standAt = (q: Point) => {
    const p = decks.snap(q)
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
      s.label?.box.destroy({ children: true })
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
      const key = army.tag ? `${army.tag}:${army.tagColor ?? 0}:${army.tagOutlaw ? 1 : 0}` : ''
      if (s.label && s.label.key !== key) {
        s.label.box.destroy({ children: true })
        s.label = null
      }
      if (army.tag && !s.label) {
        s.label = { box: mapTag(army.tag, army.tagColor ?? 0xf2d16b, army.tagOutlaw), key }
        labels.addChild(s.label.box)
      }
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

  // Where the armies stood at the last update (tile space), for the map to lift the trees around them.
  let standing: Point[] = []

  function update(time: number, scale: number) {
    routes.clear()
    standing = []
    for (const s of shown.values()) {
      const { army, body, ring, label } = s
      const route = { path: army.path, depart_at: new Date(army.departAt).toISOString(), arrive_at: new Date(army.arriveAt).toISOString() }
      const here = armyAt(route, time)
      standing.push(here)
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
      const look = squadOf(army.color, moving && scale >= 1 ? Math.floor(time / 180) % 4 : 0, army.figures, army.royal)
      body.texture = textureOf(look)
      body.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
      body.position.set(screen.x, screen.y)
      // Larger than life when zoomed out, so an army never shrinks out of sight.
      const size = Math.max(1, 0.6 / scale) * (army.size ?? 1)
      body.scale.set(size)
      body.zIndex = screen.y
      // The rest of a column ride the same road one behind another. Where the road ends the column halts along it,
      // each squad still a gap behind the one before (none ride up onto what the road leads to); riding back, the
      // squads that halted behind lead the way. Only where the road has not yet begun (or the column has come home)
      // do they gather round the first.
      if (s.followers.length > 0) {
        const total = routeLength(army.path)
        const progress = total * Math.min(1, Math.max(0, (time - army.departAt) / Math.max(1, army.arriveAt - army.departAt)))
        s.followers.forEach((f, i) => {
          const k = i + 1
          const d = army.trainAhead ? progress + k * TRAIN_GAP : progress - k * TRAIN_GAP
          const angle = (k / s.followers.length) * Math.PI * 2 + army.id
          const rest = { x: here.x + Math.cos(angle) * 1.4, y: here.y + Math.sin(angle) * 1.4 }
          const trail = along(army.path, d)
          // How far it is out of the bunch: all the way once a gap from the end it waits at.
          const w = Math.min(1, (army.trainAhead ? total - progress : progress) / (k * TRAIN_GAP))
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
        // Over the banner's top; tags are placed (and the crowded ones left out) after every army has moved.
        label.box.position.set(screen.x, screen.y - (look.anchorY + 4) * size - 6 / scale)
        label.box.scale.set(1 / scale)
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
    placeTags(scale)
    for (const { battle, sprite } of battles) {
      const on = time >= battle.startedAt && time < battle.endsAt
      sprite.visible = on
      if (!on) continue
      const screen = groundToScreen(world, battle.at)
      sprite.position.set(screen.x, screen.y - 30 - Math.abs(Math.sin(time / 250)) * 4)
      sprite.scale.set(Math.max(1, 0.6 / scale))
    }
  }

  // Tags that would overlap give way: the player's own first (the picked one before all), then outlaws, then the
  // crowns' columns, then the rest. Zoomed all the way out only the player's own and the outlaws keep theirs.
  function placeTags(scale: number) {
    const rank = (a: MapArmy) => (a.selected ? 0 : a.own ? 1 : a.tagOutlaw ? 2 : a.train ? 3 : 4)
    const tagged = [...shown.values()].filter((s) => s.label).sort((a, b) => rank(a.army) - rank(b.army))
    const placed: { l: number; t: number; r: number; b: number }[] = []
    for (const s of tagged) {
      const box = s.label!.box
      if (scale < 0.2 && rank(s.army) > 2) {
        box.visible = false
        continue
      }
      const w = box.width / 2 + 2 / scale
      const h = box.height / 2 + 1 / scale
      const rect = { l: box.x - w, t: box.y - h, r: box.x + w, b: box.y + h }
      const clash = placed.some((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t)
      box.visible = !clash
      if (!clash) placed.push(rect)
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

  return { set, update, pick, positions: () => standing }
}
