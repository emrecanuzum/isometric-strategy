import { balance, idleFactor, ledger, population } from '@game/shared'
import type { Kingdom, Pact, Resource } from '@game/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { squad } from '../game/armies'
import { STRUCTURE_SPRITES, palaceIn } from '../game/buildingSprites'
import { tent } from '../game/campSprites'
import type { KingdomColor } from '../game/buildingSprites'
import type { Sprite } from '../game/sprites'
import { supabase } from '../lib/supabase'
import type { Battle, Notice } from '../net/online'
import { describe } from './Envoy'
import { Icon } from './icons'
import type { IconName } from './icons'
import { RESOURCE_ICONS, RESOURCE_NAMES } from './names'
import type { Online } from './hud/online'
import { kingdomName } from './hud/online'
import { fmt } from './hud/primitives'

// "While you were away" (CLAUDE.md §11): a ruler back after a while is told, page by page, what happened meanwhile:
// the treasury and stores, the fighting, the tribute taken and paid, the envoys' and spies' doings, and the lobby's
// wars and towns changing hands. Each page has a small picture drawn from the map's own sprites.

// Away at least this long before the report is shown.
const AWAY_MS = 20 * 60_000
// The kingdom as it was when last seen, kept in the browser so the report can say what changed.
const SNAPSHOT_MS = 60_000
const snapshotKey = (lobby: string, kingdom: number) => `away:${lobby}:${kingdom}`

interface Snapshot {
  at: number
  kingdom: Kingdom
}

function readSnapshot(lobby: string, id: number): Snapshot | null {
  try {
    const raw = localStorage.getItem(snapshotKey(lobby, id))
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch {
    return null
  }
}

// Keeps the kingdom's copy up to date while the page is open (and as it is left).
export function useAwaySnapshot(lobby: string, id: number, kingdom: Kingdom | null, now: () => number) {
  const latest = useRef(kingdom)
  latest.current = kingdom
  useEffect(() => {
    const save = () => {
      if (!latest.current) return
      try {
        localStorage.setItem(snapshotKey(lobby, id), JSON.stringify({ at: now(), kingdom: latest.current }))
      } catch {
        // Storage full or blocked: the report then says less.
      }
    }
    const timer = window.setInterval(save, SNAPSHOT_MS)
    const hide = () => document.visibilityState === 'hidden' && save()
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', save)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', save)
    }
  }, [lobby, id, now])
}

// When the ruler was last here (the server's record from before this visit) and, if the browser kept it, the kingdom
// as it was then. Null when they were not away long.
export function awaySince(lobby: string, id: number, lastSeenAt: number | undefined, now: number): { since: number; before: Snapshot | null } | null {
  if (!lastSeenAt || now - lastSeenAt < AWAY_MS) return null
  const snap = readSnapshot(lobby, id)
  // A copy from about when they left (not one from long before, on another visit).
  const before = snap && Math.abs(snap.at - lastSeenAt) < 15 * 60_000 ? snap : null
  return { since: lastSeenAt, before }
}

// ---- Pictures --------------------------------------------------------------------------------------------------------

const W = 320
const H = 128
const GROUND = 84
// The pictures are laid out on a 240 × 96 plan and spread over the wider canvas, so the sprites stand smaller in it.
const SPREAD = W / 240

interface Placed {
  sprite: Sprite
  x: number
  y: number
}

const rgba = (c: number) => [c & 255, (c >> 8) & 255, (c >> 16) & 255]

// A little picture: a dusky sky over rolling grass, the sprites stood on it back to front.
function Scene({ items, sky = [0x6a8cb8, 0xb8c8d8], grass = [0x3d7c40, 0x4f9142] }: { items: Placed[]; sky?: [number, number]; grass?: [number, number] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(W, H)
    const px = new Uint32Array(image.data.buffer)
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    const rgb = (r: number, g: number, b: number) => (255 << 24) | (b << 16) | (g << 8) | r
    const mix = (a: number, b: number, t: number) => {
      const [ar, ag, ab] = rgba(a)
      const [br, bg, bb] = rgba(b)
      return rgb(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t))
    }
    // Colours given as 0xRRGGBB; turned into the canvas's byte order.
    const swap = (c: number) => ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const horizon = GROUND - 14 + Math.round(Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 2)
        const d = BAYER[(y % 4) * 4 + (x % 4)] / 16
        if (y < horizon) {
          const t = y / horizon
          px[y * W + x] = t + (d - 0.5) * 0.25 > 0.5 ? mix(swap(sky[0]), swap(sky[1]), Math.min(1, t * 1.2)) : mix(swap(sky[0]), swap(sky[1]), t * 0.8)
        } else {
          const t = (y - horizon) / (H - horizon)
          px[y * W + x] = mix(swap(grass[0]), swap(grass[1]), t + (d - 0.5) * 0.5 > 0.5 ? 0 : 1)
        }
      }
    }
    // Back to front.
    for (const { sprite, x, y } of [...items].sort((a, b) => a.y - b.y)) {
      const ox = Math.round(x * SPREAD - sprite.anchorX)
      const oy = Math.round(GROUND + (y - 64) * SPREAD + 8 - sprite.anchorY)
      for (let sy = 0; sy < sprite.height; sy++) {
        for (let sx = 0; sx < sprite.width; sx++) {
          const c = sprite.pixels[sy * sprite.width + sx]
          const a = c >>> 24
          if (a === 0) continue
          const tx = ox + sx
          const ty = oy + sy
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue
          const i = ty * W + tx
          if (a === 255) px[i] = c
          else {
            // Translucent shade pixels darken what is under them.
            const k = a / 255
            const [r, g, b] = rgba(px[i])
            const [cr, cg, cb] = rgba(c)
            px[i] = rgb(Math.round(r + (cr - r) * k), Math.round(g + (cg - g) * k), Math.round(b + (cb - b) * k))
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [items, sky, grass])
  return <canvas ref={canvas} className="away-scene" width={W} height={H} aria-hidden />
}

// A heap of gold coins (and a chest), drawn pixel by pixel.
function coins(n: number): Sprite {
  const w = 34
  const h = 20
  const pixels = new Uint32Array(w * h)
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) pixels[y * w + x] = (255 << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)
  }
  const GOLD = [0x7a5a18, 0xc8952e, 0xf2d16b, 0xfff0b0]
  for (let k = 0; k < n; k++) {
    const r = Math.sin(k * 12.9898) * 43758.5453
    const f = r - Math.floor(r)
    const cx = 4 + Math.floor(f * 26)
    const cy = 17 - Math.floor(((k * 7) % 11) * (1 - Math.abs(cx - 17) / 17))
    for (let dx = -2; dx <= 2; dx++) {
      set(cx + dx, cy, GOLD[Math.abs(dx) === 2 ? 1 : 2])
      set(cx + dx, cy + 1, GOLD[0])
    }
    set(cx - 1, cy - 1, GOLD[3])
    set(cx, cy - 1, GOLD[2])
  }
  return { width: w, height: h, anchorX: 17, anchorY: 19, pixels, shadow: 0 }
}

type Picture = 'treasury' | 'battle' | 'tribute' | 'intrigue' | 'world'

function picture(kind: Picture, own: string | undefined, foe: string | undefined): Placed[] {
  const color = (c: string | undefined) => (c ?? 'emerald') as KingdomColor
  const S = STRUCTURE_SPRITES
  switch (kind) {
    case 'treasury':
      return [
        { sprite: S.treasury[0], x: 64, y: 84 },
        { sprite: S.market[1], x: 176, y: 86 },
        { sprite: coins(26), x: 120, y: 82 },
        { sprite: S.warehouse[0], x: 214, y: 70 },
      ]
    case 'battle':
      return [
        { sprite: palaceIn(own, 2), x: 40, y: 82 },
        { sprite: squad(own ?? null, 0, 12), x: 104, y: 88 },
        { sprite: squad(own ?? null, 2, 8), x: 92, y: 74 },
        { sprite: squad(foe ?? 'coal', 1, 12), x: 168, y: 88 },
        { sprite: squad(foe ?? 'coal', 3, 8), x: 184, y: 74 },
        { sprite: tent(color(foe ?? 'coal'), 0), x: 222, y: 72 },
      ]
    case 'tribute':
      return [
        { sprite: palaceIn(own, 2), x: 60, y: 84 },
        { sprite: squad('crimson', 0, 6), x: 140, y: 88 },
        { sprite: squad('crimson', 2, 6), x: 166, y: 82 },
        { sprite: squad('royal', 1, 6), x: 196, y: 76 },
        { sprite: coins(14), x: 108, y: 84 },
      ]
    case 'intrigue':
      return [
        { sprite: S.spyHouse[0], x: 70, y: 84 },
        { sprite: S.prison[0], x: 170, y: 84 },
        { sprite: S.house[2], x: 120, y: 72 },
      ]
    case 'world':
      return [
        { sprite: S.house[0], x: 40, y: 84 },
        { sprite: S.house[1], x: 66, y: 76 },
        { sprite: S.market[0], x: 96, y: 88 },
        { sprite: tent(color(foe ?? 'violet'), 0), x: 172, y: 76 },
        { sprite: tent(color(foe ?? 'violet'), 1), x: 196, y: 70 },
        { sprite: tent(color(own), 1), x: 206, y: 88 },
        { sprite: squad(own ?? null, 1, 8), x: 140, y: 92 },
      ]
  }
}

// ---- The report ------------------------------------------------------------------------------------------------------

interface Line {
  icon: IconName
  text: string
  tone?: 'up' | 'down'
}

interface Page {
  title: string
  picture: Picture
  lines: Line[]
}

const MILITARY = new Set(['battle_start', 'battle_end', 'town_siege', 'town_taken', 'town_held', 'town_siege_lifted', 'tower_losses', 'army_threat', 'trade_raided', 'raid_repelled', 'war_declared', 'peace_enforced', 'order_failed'])
const TRIBUTE = new Set(['patrol_tribute', 'patrol_taken', 'patrol_tip', 'patrol_ignored', 'tribute_ended'])

const duration = (ms: number) => {
  const minutes = Math.round(ms / 60_000)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} saat${m ? ` ${m} dakika` : ''}` : `${m} dakika`
}
const delta = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`

export function AwayReport({ lobby, me, since, before, kingdom, online, now, onClose }: {
  lobby: string
  me: number
  since: number
  before: Snapshot | null
  kingdom: Kingdom
  online: Online
  now: number
  onClose: (notices: number[]) => void
}) {
  const [data, setData] = useState<{ notices: Notice[]; battles: Battle[]; wars: Pact[]; towns: { name: string; owner_id: number | null; taken_at: string }[] } | null>(null)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const iso = new Date(since).toISOString()
    Promise.all([
      supabase.from('notices').select('*').eq('lobby_id', lobby).eq('kingdom_id', me).gt('show_at', iso).lte('show_at', new Date().toISOString()).order('show_at').limit(120),
      supabase.from('battles').select('*').eq('lobby_id', lobby).gt('ends_at', iso).order('started_at').limit(40),
      supabase.from('pacts').select('*').eq('lobby_id', lobby).eq('kind', 'war').or(`started_at.gt.${iso},ended_at.gt.${iso}`).order('started_at'),
      supabase.from('lobby_towns').select('name, owner_id, taken_at').eq('lobby_id', lobby).gt('taken_at', iso).order('taken_at'),
    ]).then(([n, b, p, t]) =>
      setData({ notices: (n.data ?? []) as Notice[], battles: (b.data ?? []) as Battle[], wars: (p.data ?? []) as Pact[], towns: (t.data ?? []) as { name: string; owner_id: number | null; taken_at: string }[] }),
    )
  }, [lobby, me, since])

  const pages = useMemo((): Page[] => {
    if (!data) return []
    const away = now - since
    const rounds = Math.floor(away / (balance.economy.productionSeconds * 1000))
    const name = (id: number | null) => (id === null ? 'Kimse' : kingdomName(online, id))
    const out: Page[] = []

    // The treasury and the stores.
    const money: Line[] = [{ icon: 'time', text: `${duration(away)} yoktun.` }]
    if (before) {
      for (const r of ['gold', 'food', 'materials', 'arms'] as Resource[]) {
        const d = kingdom.stock[r] - before.kingdom.stock[r]
        if (Math.abs(d) < 1) continue
        money.push({ icon: RESOURCE_ICONS[r], text: `${RESOURCE_NAMES[r]}: ${fmt(before.kingdom.stock[r])} → ${fmt(kingdom.stock[r])} (${delta(d)})`, tone: d >= 0 ? 'up' : 'down' })
      }
      const was = before.kingdom.trade.ledger
      const is = kingdom.trade.ledger
      if (was && is) {
        const gold = (is.gold ?? 0) - (was.gold ?? 0)
        const sold = (['food', 'materials', 'arms'] as const).map((g) => [g, (is[g] ?? 0) - (was[g] ?? 0)] as const).filter(([, v]) => v > 0)
        if (gold > 0) money.push({ icon: 'trade', text: `Tüccarın ${sold.map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g].toLowerCase()}`).join(', ')} sattı, ${fmt(gold)} altın getirdi.`, tone: 'up' })
      }
      const p0 = population(before.kingdom, before.at)
      const p1 = population(kingdom, now)
      if (p0.villagers !== p1.villagers) money.push({ icon: 'people', text: `Köylüler: ${p0.villagers} → ${p1.villagers}`, tone: p1.villagers >= p0.villagers ? 'up' : 'down' })
      const h0 = Math.round(before.kingdom.happiness ?? 0)
      const h1 = Math.round(kingdom.happiness ?? 0)
      if (h0 !== h1) money.push({ icon: h1 >= h0 ? 'happy' : 'unhappy', text: `Mutluluk: %${h0} → %${h1}`, tone: h1 >= h0 ? 'up' : 'down' })
    } else {
      money.push({ icon: 'gold', text: `Hazinede ${fmt(kingdom.stock.gold)} altın var (gidişindeki hâli bu tarayıcıda kayıtlı değil).` })
    }
    const l = ledger(before?.kingdom ?? kingdom, before?.at ?? now)
    if (rounds > 0) {
      if (l.tax > 0) money.push({ icon: 'gold', text: `Vergiden yaklaşık ${fmt(l.tax * rounds)} altın toplandı.`, tone: 'up' })
      if (l.soldiersGold > 0) money.push({ icon: 'swords', text: `Askerlerin maaşına yaklaşık ${fmt(l.soldiersGold * rounds)} altın gitti.`, tone: 'down' })
    }
    const idle = idleFactor({ ...kingdom, lastSeenAt: since }, now)
    if (idle < 1) money.push({ icon: 'warn', text: `Uzun süre yoktun: binaların üretimi, vergi ve tüccarın kazancı %${Math.round(idle * 100)} düzeyine kadar düştü (yokluk cezası). Döndüğün için yeniden tam çalışıyorlar.`, tone: 'down' })
    out.push({ title: 'Mali rapor', picture: 'treasury', lines: money })

    // The fighting.
    const war: Line[] = data.notices.filter((n) => MILITARY.has(n.kind)).map((n) => {
      const { icon, title, text } = describe(n, online)
      return { icon, text: text ? `${title}: ${text}` : title, tone: n.kind === 'town_taken' && (n.payload as { by?: string }).by === kingdom.name ? 'up' : 'down' }
    })
    if (before) {
      const s0 = population(before.kingdom, before.at).soldiers
      const s1 = population(kingdom, now).soldiers
      if (s0 !== s1) war.push({ icon: 'swords', text: `Askerlerin: ${s0} → ${s1}`, tone: s1 >= s0 ? 'up' : 'down' })
    }
    const mine = data.battles.filter((b) => [...b.attackers, ...b.defenders].some((f) => f.kingdom === me))
    for (const b of mine) {
      if (!b.report) continue
      const won = (b.plan.winner === 'attackers' ? b.attackers : b.defenders).some((f) => f.kingdom === me)
      war.push({ icon: 'swords', text: `${b.kind === 'siege' ? 'Kuşatma' : 'Meydan muharebesi'} ${won ? 'kazanıldı' : 'kaybedildi'} (${Object.entries(b.report.losses).map(([who, n]) => `${who} −${fmt(n)}`).join(', ')})`, tone: won ? 'up' : 'down' })
    }
    if (war.length > 0) out.push({ title: 'Askeri rapor', picture: 'battle', lines: war })

    // Tribute: the crowns' patrols, and what was paid and received between lords.
    const tribute: Line[] = data.notices.filter((n) => TRIBUTE.has(n.kind)).map((n) => {
      const { icon, title, text } = describe(n, online)
      return { icon, text: text ? `${title}: ${text}` : title, tone: n.kind === 'patrol_tip' ? 'up' : 'down' }
    })
    const taken = data.notices.filter((n) => n.kind === 'patrol_taken').reduce((s, n) => s + Number((n.payload as { amount?: number }).amount ?? 0), 0)
    if (taken > 0) tribute.unshift({ icon: 'gold', text: `Sen yokken taç devriyeleri hazinenden toplam ${fmt(taken)} altın haraç aldı.`, tone: 'down' })
    for (const t of kingdom.tributes ?? []) {
      if (rounds <= 0) break
      tribute.push(
        t.dir === 'out'
          ? { icon: 'gold', text: `${t.name} krallığına her tur ${fmt(t.gold)}, toplam yaklaşık ${fmt(t.gold * rounds)} altın haraç ödedin.`, tone: 'down' }
          : { icon: 'gold', text: `${t.name} krallığından her tur ${fmt(t.gold)}, toplam yaklaşık ${fmt(t.gold * rounds)} altın haraç aldın.`, tone: 'up' },
      )
    }
    if (tribute.length > 0) out.push({ title: 'Haraçlar', picture: 'tribute', lines: tribute })

    // Envoys and spies.
    const intrigue: Line[] = data.notices
      .filter((n) => !MILITARY.has(n.kind) && !TRIBUTE.has(n.kind))
      .map((n) => {
        const { icon, title, text } = describe(n, online)
        return { icon, text: text ? `${title}: ${text}` : title }
      })
    if (intrigue.length > 0) out.push({ title: 'Elçiler ve casuslar', picture: 'intrigue', lines: intrigue })

    // The lobby: wars begun and ended, battles fought, towns changing hands.
    const world: Line[] = []
    for (const p of data.wars) {
      if (Date.parse(p.started_at) > since) world.push({ icon: 'swords', text: `${name(p.from_id)}, ${name(p.to_id)} krallığına savaş açtı.`, tone: 'down' })
      if (p.ended_at && Date.parse(p.ended_at) > since) world.push({ icon: 'banner', text: `${name(p.from_id)} ile ${name(p.to_id)} arasındaki savaş bitti.`, tone: 'up' })
    }
    for (const b of data.battles) {
      if (mine.includes(b) || !b.report) continue
      const side = (fighters: Battle['attackers']) => [...new Set(fighters.map((f) => name(f.kingdom)))].join(', ')
      const winner = b.plan.winner === 'attackers' ? side(b.attackers) : side(b.defenders)
      world.push({
        icon: 'swords',
        text: b.kind === 'siege' && b.besieged !== null ? `${side(b.attackers)}, ${name(b.besieged)} sarayını kuşattı; ${winner} kazandı.` : `${side(b.attackers)} ile ${side(b.defenders)} meydanda çarpıştı; ${winner} kazandı.`,
      })
    }
    for (const t of data.towns) world.push({ icon: 'crown', text: `${name(t.owner_id)}, ${t.name} kasabasını fethetti.`, tone: t.owner_id === me ? 'up' : undefined })
    if (world.length === 0) world.push({ icon: 'banner', text: 'Lobide sakin bir dönem geçti: yeni savaş açılmadı, kasaba el değiştirmedi.' })
    out.push({ title: 'Dünyada olanlar', picture: 'world', lines: world })
    return out
  }, [data, before, kingdom, online, now, since, me])

  const foe = useMemo(() => {
    const war = data?.wars.find((p) => p.from_id === me || p.to_id === me)
    const other = war ? (war.from_id === me ? war.to_id : war.from_id) : online.kingdoms.find((k) => k.id !== me)?.id
    return online.kingdoms.find((k) => k.id === other)?.color ?? undefined
  }, [data, me, online.kingdoms])
  const items = useMemo(() => (pages[page] ? picture(pages[page].picture, kingdom.color, foe) : []), [pages, page, kingdom.color, foe])

  const close = () => onClose((data?.notices ?? []).map((n) => n.id))
  const current = pages[page]
  return (
    <div className="modal" role="dialog" aria-labelledby="away-title">
      <section className="dialog frame away">
        <header className="sheet-head">
          <Icon name="scroll" size={32} />
          <div>
            <h2 id="away-title">Sen yokken</h2>
            <small>{current ? `${current.title} · ${page + 1} / ${pages.length}` : 'Elçiler raporlarını topluyor…'}</small>
          </div>
          <button className="btn icon-only" onClick={close} aria-label="Kapat">
            <Icon name="close" size={16} />
          </button>
        </header>
        {current && (
          <>
            <Scene items={items} />
            <h3 className="away-title">{current.title}</h3>
            <ul className="away-lines">
              {current.lines.map((line, i) => (
                <li key={i} className={line.tone}>
                  <Icon name={line.icon} size={16} />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
            <div className="away-nav">
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Geri
              </button>
              <span className="away-dots" aria-hidden>
                {pages.map((_, i) => (
                  <i key={i} className={i === page ? 'on' : undefined} />
                ))}
              </span>
              {page < pages.length - 1 ? (
                <button className="btn primary" onClick={() => setPage(page + 1)}>
                  İleri
                </button>
              ) : (
                <button className="btn primary" onClick={close}>
                  Krallığa dön
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
