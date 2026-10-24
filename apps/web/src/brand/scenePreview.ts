import { eventScene } from '../ui/EventArt'
import { noticeScene } from '../ui/NoticeArt'
import { H, Paint, W } from '../ui/artKit'

// Dev-only: candidate scenes for the music covers, side by side (/scenes.html).
const look = (family: string, variant = '') => noticeScene({ family, variant, other: null, own: null } as never)
const list: [string, ReturnType<typeof eventScene>][] = [
  ...['caravanSeason', 'pilgrims', 'lostCaravan', 'tournament', 'festival', 'minstrel', 'dragonRumour', 'royalWedding', 'fullMoon', 'nomads'].map(
    (k) => [k, eventScene(k)] as [string, ReturnType<typeof eventScene>],
  ),
  ['notice:tavern', look('tavern')],
  ['notice:war', look('war')],
  ['notice:war:camp', look('war', 'camp')],
  ['notice:royal', look('royal')],
]
for (const [name, sc] of list) {
  if (!sc) continue
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const p = new Paint(new Uint32Array(img.data.buffer))
  sc.draw(p)
  sc.fx?.(p, 2.4)
  ctx.putImageData(img, 0, 0)
  c.style.cssText = 'width:512px;image-rendering:pixelated;display:block'
  const f = document.createElement('figure')
  f.style.cssText = 'display:inline-block;margin:6px;color:#fff;font:14px sans-serif'
  f.append(c, name)
  document.body.append(f)
}
