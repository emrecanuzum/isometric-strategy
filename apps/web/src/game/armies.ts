import { armyAt, groundToScreen } from '@game/shared'
import type { Point, World } from '@game/shared'
import { Container, Graphics, Sprite as PixiSprite, Text } from 'pixi.js'
import { KINGDOM_COLORS } from './buildingSprites'
import type { KingdomColor } from './buildingSprites'
import { Canvas, STONE, TIMBER, ramp, rgb, shadow } from './sprites'
import type { Sprite } from './sprites'
import { dashes } from './dashes'
import { textureOf } from './textures'

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
}

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
export function squad(color: string | null, frame: number, figures = 3, catapult = false): Sprite {
  const tunic = roofsOf(color)
  const canvas = new Canvas(54, 42)
  const base = 38
  const ox = 12
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
  if (catapult) {
    // A throwing arm on an A-frame over a wheeled bed, behind the ranks.
    const cx = ox + 30
    const cy = base - 10
    for (let x = -7; x <= 7; x++) for (let z = 0; z < 3; z++) canvas.set(cx + x, cy - z + Math.round(x * 0.3), TIMBER[z === 2 ? 2 : 1])
    for (const wx of [-5, 5]) for (let a = 0; a < 12; a++) canvas.set(cx + wx + Math.round(Math.cos(a / 2) * 2), cy + 1 + Math.round(Math.sin(a / 2) * 2), TIMBER[0])
    for (let z = 0; z < 8; z++) {
      canvas.set(cx - 3 + Math.round(z * 0.3), cy - 3 - z, TIMBER[2])
      canvas.set(cx + 3 - Math.round(z * 0.3), cy - 3 - z, TIMBER[1])
    }
    for (let i = 0; i < 13; i++) canvas.set(cx - 6 + i, cy - 13 + Math.round(i * 0.55), TIMBER[i < 3 ? 0 : 2])
    canvas.set(cx - 6, cy - 14, STONE[3])
    canvas.set(cx - 7, cy - 14, STONE[2])
    shadow(canvas, cx, cy + 2, 8)
  }
  // The banner stands behind the rear soldier.
  const bx = ox + 4
  for (let y = base - 34; y < base - 10; y++) canvas.set(bx, y, TIMBER[1])
  for (let y = 0; y < 7; y++) {
    for (let x = 1; x <= 9; x++) {
      const wave = Math.round(Math.sin(x * 0.7 + frame * 1.5) * 0.8)
      if (x > 7 && (y === 0 || y === 6)) continue
      canvas.set(bx + x, base - 34 + y + wave, y === 0 ? tunic[5] : tunic[y < 3 ? 3 : 2])
    }
  }
  // Ranks of three, back to front, each a little lower and to the side on the iso grid.
  const spots: [number, number][] = []
  for (let i = 0; i < figures; i++) {
    const rank = Math.floor(i / 3)
    const file = i % 3
    spots.push([ox + file * 5 - rank * 4, base - 12 + rank * 4 + file * 2])
  }
  spots.sort((a, b) => a[1] - b[1])
  // Neighbours out of step with each other, so the column ripples as it marches.
  spots.forEach(([x, y], i) => soldier(x, y, frame + (i % 2) * 2))
  shadow(canvas, ox + 4, base - 6, 6 + Math.ceil(figures / 3) * 3)
  return canvas.sprite(ox + 4, base, 0)
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
const squadOf = (color: string | null, frame: number, figures = 3, catapult = false) => {
  const key = `${color ?? 'royal'}:${figures}:${catapult}`
  if (!squads.has(key)) squads.set(key, [0, 1, 2, 3].map((f) => squad(color, f, figures, catapult)))
  return squads.get(key)![frame]
}
const SWORDS = swords()

interface Shown {
  army: MapArmy
  body: PixiSprite
  ring: Graphics
  label: Text | null
}

export function createArmies(world: World, walkers: Container, routes: Graphics, labels: Container) {
  const shown = new Map<number, Shown>()
  let battles: { battle: MapBattle; sprite: PixiSprite }[] = []

  function set(armies: MapArmy[], fights: MapBattle[]) {
    const ids = new Set(armies.map((a) => a.id))
    for (const [id, s] of shown) {
      if (ids.has(id)) continue
      s.body.destroy()
      s.ring.destroy()
      s.label?.destroy()
      shown.delete(id)
    }
    for (const army of armies) {
      let s = shown.get(army.id)
      if (!s) {
        const body = new PixiSprite(textureOf(squadOf(army.color, 0)))
        const look = squadOf(army.color, 0)
        body.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
        const ring = new Graphics()
        walkers.addChild(ring, body)
        s = { army, body, ring, label: null }
        shown.set(army.id, s)
      }
      s.army = army
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
    for (const { army, body, ring, label } of shown.values()) {
      const here = armyAt({ path: army.path, depart_at: new Date(army.departAt).toISOString(), arrive_at: new Date(army.arriveAt).toISOString() }, time)
      const screen = groundToScreen(world, here)
      const moving = !army.battle && time < army.arriveAt && army.path.length > 1
      // Marching feet only when close enough to see them; far out the column stands still.
      const look = squadOf(army.color, moving && scale >= 1 ? Math.floor(time / 180) % 4 : 0, army.figures, army.catapult)
      body.texture = textureOf(look)
      body.anchor.set(look.anchorX / look.width, look.anchorY / look.height)
      body.position.set(screen.x, screen.y)
      // Larger than life when zoomed out, so an army never shrinks out of sight.
      body.scale.set(Math.max(1, 0.6 / scale))
      body.zIndex = screen.y
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
