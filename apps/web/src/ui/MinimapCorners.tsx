import { armyAt, calendarAt, fleetAt, townCenter, townRevolting } from '@game/shared'
import type { Army, Kingdom, Pact, Point, Rect, Town } from '@game/shared'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { play } from '../audio/sfx'
import type { MapArmy } from '../game/armies'
import type { WorldView } from '../game/createWorld'
import type { Battle } from '../net/online'
import { serverNow } from '../net/clock'
import { Icon } from './icons'
import { L } from '../lib/i18n'
import type { IconName } from './icons'
import { MONTH_NAMES } from './names'
import { frameMargin, paintCap, paintFrame } from '../game/minimapFrame'

// The minimap's pixel-art frame, laid over the map's edge; clicks pass through it to the map.
function Frame({ width, height, thick }: { width: number; height: number; thick: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => paintFrame(ref.current!.getContext('2d')!, { width, height, thick }), [width, height, thick])
  const m = frameMargin(thick)
  return <canvas ref={ref} className="mm-frame" style={{ left: -m.x, top: -m.y, width: width + m.x * 2, height: height + m.y * 2 }} aria-hidden />
}

// One of the tip fittings, painted once for its size and look.
function Cap({ width, face, className }: { width: number; face: 'wood' | 'alarm' | 'hover'; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => paintCap(ref.current!.getContext('2d')!, width, face), [width, face])
  return <canvas ref={ref} className={`mm-cap${className ? ` ${className}` : ''}`} aria-hidden />
}

// The four shortcuts as diamond tiles in the diamond minimap's tips (CLAUDE.md §11): the world map, the player's own
// armies and fleets one after another, the places that matter right now, and the photo mode.

export interface Spot {
  key: string
  label: string
  at: Point
  // Picks it on the map (an army or a fleet) besides moving the camera there.
  pick?: () => void
}

// Enemy armies this close to the border (tiles) count as a hot spot.
const BORDER_WATCH = 14

const at = (a: Pick<MapArmy, 'path' | 'departAt' | 'arriveAt'>, t: number) =>
  armyAt({ path: a.path, depart_at: new Date(a.departAt).toISOString(), arrive_at: new Date(a.arriveAt).toISOString() }, t)

const near = (r: Rect, p: Point, margin: number) => p.x >= r.x - margin && p.y >= r.y - margin && p.x <= r.x + r.size + margin && p.y <= r.y + r.size + margin

// What matters now, for the player: battles and sieges they are in, their towns under siege or risen, enemy armies by
// the border, and the crowns' riders coming to their gate.
function hotSpots(o: {
  me: number
  kingdom: Kingdom
  rect: Rect | null
  armies: Army[]
  battles: Battle[]
  towns: Town[]
  pacts: Pact[]
  patrols: MapArmy[]
  nameOf: (id: number) => string
  now: number
  // Bandits and pirates near the player's trade and the chases under way (CLAUDE.md §7.9).
  extra?: Spot[]
}): Spot[] {
  const { me, now } = o
  const out: Spot[] = []
  for (const b of o.battles) {
    if ((b.resolved && Date.parse(b.ends_at) <= now) || ![...b.attackers, ...b.defenders].some((f) => f.kingdom === me)) continue
    const foe = [...b.attackers, ...b.defenders].find((f) => f.kingdom !== me)
    const what = b.kind === 'siege' || b.kind === 'usurp' ? L('Kuşatma', 'Siege') : b.kind === 'revolt' || b.kind === 'pretender' ? L('Asilerle muharebe', 'Battle with rebels') : b.kind === 'outlaw' ? L('Yağmacılarla çarpışma', 'Clash with bandits') : L('Muharebe', 'Battle')
    out.push({ key: `b${b.id}`, label: foe && b.kind !== 'revolt' && b.kind !== 'outlaw' && b.kind !== 'pretender' && b.kind !== 'usurp' ? `${what}: ${o.nameOf(foe.kingdom)}` : what, at: { x: b.x, y: b.y } })
  }
  for (const t of o.towns) {
    if (t.siege && t.siege.endsAt > now && (t.siege.kingdom === me || t.owner === me)) {
      out.push({ key: `s${t.id}`, label: t.siege.kingdom === me ? L(`${t.name} kuşatılıyor`, `Besieging ${t.name}`) : L(`${t.name} kasaban kuşatma altında`, `Your town ${t.name} is under siege`), at: townCenter(t) })
    } else if (t.owner === me && t.rebels) {
      out.push({ key: `r${t.id}`, label: L(`${t.name}: asiler kapıda`, `${t.name}: rebels at the gate`), at: townCenter(t) })
    }
  }
  for (const h of o.kingdom.towns ?? []) {
    const t = o.towns.find((x) => x.id === h.id)
    if (t && townRevolting(h, now) && !out.some((s) => s.key === `r${t.id}` || s.key === `s${t.id}`)) out.push({ key: `r${t.id}`, label: L(`${t.name} ayaklandı`, `${t.name} has revolted`), at: townCenter(t) })
  }
  if (o.rect) {
    const foes = new Set(o.pacts.filter((p) => p.kind === 'war' && !p.ended_at && (p.from_id === me || p.to_id === me)).map((p) => (p.from_id === me ? p.to_id : p.from_id)))
    for (const a of o.armies) {
      if (!foes.has(a.kingdom_id)) continue
      const p = armyAt(a, now)
      if (near(o.rect, p, BORDER_WATCH)) out.push({ key: `e${a.id}`, label: L(`Sınırında ${o.nameOf(a.kingdom_id)} ordusu`, `${o.nameOf(a.kingdom_id)}'s army at your border`), at: p })
    }
    // The crowns' riders whose road ends at the player's lands (the tribute collectors carry the lord in their id).
    for (const p of o.patrols) {
      const end = p.path[p.path.length - 1]
      if (!end || !near(o.rect, end, 6) || p.trainAhead) continue
      const collector = p.id <= -100000
      out.push({ key: `p${p.id}`, label: collector ? L('Haraççılar kapına geliyor', 'Tribute collectors are coming to your door') : L('Taç devriyesi sana uğruyor', 'The crown patrol is calling on you'), at: at(p, now) })
    }
  }
  out.push(...(o.extra ?? []))
  return out
}

export function MinimapCorners({
  view,
  center,
  me,
  kingdom,
  rect,
  armies,
  battles,
  towns,
  pacts,
  patrols,
  outlaws,
  nameOf,
  seasonStart,
  onWorldMap,
  onArmy,
  onFleet,
}: {
  view: WorldView
  // Where the camera looks now (the photo mode's drift sets off from there).
  center: Point | null
  me: number
  kingdom: Kingdom | null
  rect: Rect | null
  armies: Army[]
  battles: Battle[]
  towns: Town[]
  pacts: Pact[]
  patrols: MapArmy[]
  // Bandits and pirates that matter to the player (see hotSpots).
  outlaws?: Spot[]
  nameOf: (id: number) => string
  seasonStart: number
  onWorldMap: () => void
  onArmy: (id: number) => void
  onFleet: (id: number) => void
}) {
  // Moved on every couple of seconds, so the counts and the places follow the armies.
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), 2000)
    return () => clearInterval(id)
  }, [])
  const [photo, setPhoto] = useState(false)
  // A short caption by the minimap after a jump: which of how many, and what.
  const [caption, setCaption] = useState<{ text: string; id: number } | null>(null)
  useEffect(() => {
    if (!caption) return
    const id = window.setTimeout(() => setCaption(null), 2600)
    return () => clearTimeout(id)
  }, [caption])

  const units: Spot[] = kingdom
    ? [
        ...armies
          .filter((a) => a.kingdom_id === me)
          .map((a, i): Spot => ({ key: `a${a.id}`, label: L(`${i + 1}. ordu${a.soldiers !== null ? ` · ${a.soldiers} asker` : ''}${a.status === 'battle' ? ' · muharebede' : ''}`, `Army ${i + 1}${a.soldiers !== null ? ` · ${a.soldiers} soldier${a.soldiers === 1 ? '' : 's'}` : ''}${a.status === 'battle' ? ' · in battle' : ''}`), at: armyAt(a, now), pick: () => onArmy(a.id) })),
        ...(kingdom.navy?.fleets ?? []).flatMap((f, i): Spot[] => {
          const p = fleetAt(view.world, kingdom, f, now)
          return p ? [{ key: `f${f.id}`, label: L(`${i + 1}. filo`, `Fleet ${i + 1}`), at: p, pick: () => onFleet(f.id) }] : []
        }),
      ]
    : []
  const spots = kingdom ? hotSpots({ me, kingdom, rect, armies, battles, towns, pacts, patrols, nameOf, now, extra: outlaws }) : []

  // Each press goes on to the next one in the list (kept by key, so a list that changes does not start over).
  const lastUnit = useRef<string | null>(null)
  const lastSpot = useRef<string | null>(null)
  const cycle = (list: Spot[], last: React.MutableRefObject<string | null>, none: string) => {
    const fresh = list
    if (fresh.length === 0) return setCaption({ text: none, id: Date.now() })
    const i = (fresh.findIndex((s) => s.key === last.current) + 1) % fresh.length
    const s = fresh[i]
    last.current = s.key
    play('click')
    view.centerOn({ x: Math.floor(s.at.x), y: Math.floor(s.at.y) })
    s.pick?.()
    setCaption({ text: fresh.length > 1 ? `${i + 1}/${fresh.length} · ${s.label}` : s.label, id: Date.now() })
  }
  const nextUnit = () => cycle(units, lastUnit, L('Sahada ordun ya da filon yok', 'You have no army or fleet in the field'))
  const nextSpot = () => cycle(spots, lastSpot, L('Şu an sıcak bir nokta yok', 'No hot spots right now'))
  const openMap = () => {
    play('click')
    onWorldMap()
  }

  // Keyboard shortcuts, never while typing or with a control key held.
  const keys = useRef({ nextUnit, nextSpot, openMap, photo })
  keys.current = { nextUnit, nextSpot, openMap, photo }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || keys.current.photo) return
      const el = e.target as HTMLElement | null
      if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (k === 'm') keys.current.openMap()
      else if (k === 'h') keys.current.nextSpot()
      else if (k === 'p') setPhoto(true)
      // Tab only when nothing on the page has the focus, so moving through the buttons with it still works.
      else if (e.key === 'Tab' && !e.shiftKey && (!el || el === document.body || el instanceof HTMLCanvasElement)) {
        e.preventDefault()
        keys.current.nextUnit()
      } else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The frame and the fittings are sized from the box the map's diamond takes on this screen.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current!
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const size = width >= 400 ? { thick: 17, cap: 92, icon: 24 } : width >= 250 ? { thick: 12, cap: 68, icon: 16 } : { thick: 10, cap: 60, icon: 16 }

  // A gilded fitting clamped over one of the frame's tips; the count rides on its upper edge, clear of the icon.
  const corner = (where: string, icon: IconName, title: string, onClick: () => void, count?: number, alarm = false) => (
    <span className={`mm-tip ${where}`}>
      <button className={`mm-corner${alarm ? ' alarm' : ''}`} onClick={onClick} title={title} aria-label={title} disabled={count === 0}>
        <Cap width={size.cap} face="wood" />
        <Cap width={size.cap} face="hover" className="hover" />
        {alarm && <Cap width={size.cap} face="alarm" className="glow" />}
        <Icon name={icon} size={size.icon} />
      </button>
      {count !== undefined && count > 0 && <b>{count}</b>}
    </span>
  )

  return (
    <>
      <div
        className="mm-corners"
        ref={box}
        style={{ '--mm-f': `${size.thick}px`, '--mm-w': `${size.cap}px`, '--mm-icon': `${size.icon}px` } as React.CSSProperties}
      >
        {width > 0 && <Frame width={width} height={box.current?.clientHeight ?? width / 2} thick={size.thick} />}
        {corner('top', 'map', L('Dünya haritası (M)', 'World map (M)'), openMap)}
        {corner('right', 'swords', spots.length ? L(`Sıcak noktalar (H): ${spots.map((s) => s.label).join(' · ')}`, `Hot spots (H): ${spots.map((s) => s.label).join(' · ')}`) : L('Sıcak noktalar (H): şu an yok', 'Hot spots (H): none right now'), nextSpot, spots.length, spots.length > 0)}
        {corner('left', 'banner', units.length ? L('Ordularım ve filolarım (Tab): sıradakine git', 'My armies and fleets (Tab): go to the next one') : L('Ordularım ve filolarım: sahada yok', 'My armies and fleets: none in the field'), nextUnit, units.length)}
        {corner('bottom', 'camera', L('Fotoğraf modu (P)', 'Photo mode (P)'), () => (play('click'), setPhoto(true)))}
      </div>
      {caption && <Caption key={caption.id} text={caption.text} box={box.current} lift={size.thick} />}
      {photo && <PhotoMode view={view} center={center} lord={kingdom?.name ?? null} seasonStart={seasonStart} onClose={() => setPhoto(false)} />}
    </>
  )
}

// The caption after a jump, outside the minimap's own layer (its stacking context would keep it under the rest of the
// interface): fixed on the screen above the frame's top fitting, never over it, and kept inside the screen's edges.
function Caption({ text, box, lift }: { text: string; box: HTMLDivElement | null; lift: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!box || !el) return
    const r = box.getBoundingClientRect()
    const w = el.offsetWidth
    const margin = 8
    const left = Math.max(margin, Math.min(window.innerWidth - margin - w, r.left + r.width / 2 - w / 2))
    // The top fitting rises `lift` above the box; the caption keeps a clear gap above its point.
    setPos({ left, bottom: window.innerHeight - r.top + lift + 10 })
  }, [box, lift, text])
  return (
    <div ref={ref} className="mm-caption frame" role="status" style={pos ? { left: pos.left, bottom: pos.bottom } : { visibility: 'hidden' }}>
      {text}
    </div>
  )
}

// The photo mode: the whole interface hidden for a clean picture, a soft vignette, the date and the lord's name in a
// corner. Any key or click goes back; Space starts a slow drift of the camera, the wheel zooms.
function PhotoMode({ view, center, lord, seasonStart, onClose }: { view: WorldView; center: Point | null; lord: string | null; seasonStart: number; onClose: () => void }) {
  const [drift, setDrift] = useState(false)
  const [hint, setHint] = useState(true)
  const centerRef = useRef(center)
  centerRef.current = center
  useEffect(() => {
    document.documentElement.dataset.photo = '1'
    const id = window.setTimeout(() => setHint(false), 3500)
    return () => {
      delete document.documentElement.dataset.photo
      clearTimeout(id)
    }
  }, [])
  // A slow glide: the camera follows a point that wanders off from where it was, turning gently.
  useEffect(() => {
    if (!drift || !centerRef.current) return
    const from = centerRef.current
    const start = performance.now()
    const turn = Math.random() * Math.PI * 2
    view.follow(() => {
      const s = (performance.now() - start) / 1000
      const a = turn + Math.sin(s / 9) * 0.8
      // About a tile and a half a second, the heading swinging back and forth.
      return { x: from.x + Math.cos(turn) * s * 1.5 + Math.cos(a) * 3, y: from.y + Math.sin(turn) * s * 1.5 + Math.sin(a) * 3 }
    })
    return () => view.follow(null)
  }, [drift, view])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code === 'Space') return setDrift((d) => !d)
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const date = calendarAt(serverNow(), seasonStart)
  return (
    <div
      className="photo-overlay"
      onClick={onClose}
      onWheel={(e) => view.zoomBy(e.deltaY < 0 ? 1 : -1)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="photo-stamp">
        {lord && <b>{lord}</b>}
        <span>
          {date.day} {MONTH_NAMES[date.month]} {date.year}
        </span>
      </div>
      {hint && <div className="photo-hint">{L('Çıkmak için bir tuşa bas ya da tıkla · Boşluk: kamera süzülsün · Tekerlek: yakınlaştır', 'Press a key or click to leave · Space: let the camera glide · Wheel: zoom')}</div>}
    </div>
  )
}
