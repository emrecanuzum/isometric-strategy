import '@fontsource/pixelify-sans/latin-400.css'
import '@fontsource/pixelify-sans/latin-ext-400.css'
import '@fontsource/pixelify-sans/latin-600.css'
import { type Art, badge, favicon, logoStacked, logoWide, thumbnail, banner, cover, album } from './brandArt'
import { eventScene } from '../ui/EventArt'
import { noticeScene } from '../ui/NoticeArt'

// A dev-only page (/brand.html) that paints the brand art and, with ?save=<port>&token=<token>, posts every export as a PNG to a
// local helper that writes it under public/brand (see CLAUDE.md §4.2.1 for the art's rules).

function canvasOf(a: Art, scale: number) {
  const src = document.createElement('canvas')
  src.width = a.w
  src.height = a.h
  const ctx = src.getContext('2d')!
  const img = ctx.createImageData(a.w, a.h)
  new Uint32Array(img.data.buffer).set(a.px)
  ctx.putImageData(img, 0, 0)
  const out = document.createElement('canvas')
  out.width = a.w * scale
  out.height = a.h * scale
  const o = out.getContext('2d')!
  o.imageSmoothingEnabled = false
  o.drawImage(src, 0, 0, out.width, out.height)
  return out
}

// A square picture fitted into `size` pixels: scaled by the largest whole number, centred on `fill`.
function squareOf(a: Art, size: number, fill?: string) {
  const s = Math.floor(size / Math.max(a.w, a.h))
  const c = canvasOf(a, s)
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const o = out.getContext('2d')!
  if (fill) ((o.fillStyle = fill), o.fillRect(0, 0, size, size))
  o.imageSmoothingEnabled = false
  o.drawImage(c, Math.floor((size - c.width) / 2), Math.floor((size - c.height) / 2))
  return out
}

await document.fonts.load('600 26px "Pixelify Sans"')
await document.fonts.load('400 12px "Pixelify Sans"', 'Çğışöü')

const TAGLINE = 'Lordum, haberler var. Çoğu kötü.'
const news = (family: string) => noticeScene({ family, variant: '', other: null, own: null } as never)
// The music videos' covers (scripts/music-video.sh puts each over its piece): a scene, a quip and colours per piece.
const COVERS: [string, ReturnType<typeof news>, string, string, [number, number, number]][] = [
  ['hearth', news('tavern'), 'By the Hearth', 'My lord, the storehouse rats have formed a guild. They have demands.', [0x1a0c06, 0x4a2410, 0xe8661a]],
  ['crusade', eventScene('caravanSeason')!, 'The Road to Jerusalem', 'My lord, I have two pieces of news: one bad, the other worse.', [0x2a1606, 0x7a4a18, 0xf2c060]],
  ['england', eventScene('festival')!, "The King's Meadows", 'My lord, the people say they love the taxes. I wrote it down; they signed.', [0x0a1a10, 0x1d4a2a, 0x7fba50]],
  ['horizon', news('war'), 'Banners on the Horizon', "My lord, war has been declared. But look on the bright side: we shan't be bored.", [0x1a0606, 0x5a1414, 0xe0303a]],
  ['jig', eventScene('dragonRumour')!, 'The Drunken Dragon Inn', 'My lord, I did not break the seal. It broke itself.', [0x100a1e, 0x3a2058, 0xb890e8]],
]
// The album's rose window: the five pieces' scenes, each with the point of it its pane shows.
const PANES: [ReturnType<typeof news>, number, number][] = [
  [COVERS[0][1], 400, 150],
  [COVERS[1][1], 170, 190],
  [COVERS[2][1], 256, 160],
  [COVERS[3][1], 220, 110],
  [COVERS[4][1], 96, 64],
]
const exports: [string, HTMLCanvasElement][] = [
  ['album-cover.png', canvasOf(album(PANES, 'Original  Soundtrack'), 10)],
  ...COVERS.map(([id, sc, title, quip, band]) => [`cover-${id}.png`, canvasOf(cover(sc, title, quip, band), 5)] as [string, HTMLCanvasElement]),
  ['youtube-banner.png', canvasOf(banner(TAGLINE), 5)],
  ['thumbnail-16x9.png', canvasOf(thumbnail('wide', TAGLINE), 4)],
  ['thumbnail-1x1.png', canvasOf(thumbnail('square', TAGLINE), 4)],
  ['thumbnail-9x16.png', canvasOf(thumbnail('tall', TAGLINE), 4)],
  ['logo-wide.png', canvasOf(logoWide(), 4)],
  ['logo-wide@2x.png', canvasOf(logoWide(), 8)],
  ['logo-stacked.png', canvasOf(logoStacked(), 6)],
  ['badge.png', canvasOf(badge(60), 16)],
  ['instagram-1080.png', canvasOf(badge(60, true), 18)],
  ['favicon-32.png', canvasOf(favicon(), 1)],
  ['favicon-64.png', canvasOf(favicon(), 2)],
  ['apple-touch-icon.png', squareOf(badge(60, true), 180)],
  ['icon-192.png', squareOf(badge(60, true), 192)],
  ['icon-512.png', squareOf(badge(60, true), 512)],
]

const out = document.getElementById('out')!
for (const [name, c] of exports) {
  const fig = document.createElement('figure')
  const view = c.cloneNode() as HTMLCanvasElement
  view.getContext('2d')!.drawImage(c, 0, 0)
  const max = name.startsWith('favicon') ? 128 : 520
  const k = Math.min(1, max / c.width) * (name.startsWith('favicon') ? 128 / c.width : 1)
  view.style.width = `${c.width * k}px`
  fig.append(view)
  const cap = document.createElement('figcaption')
  cap.textContent = `${name} · ${c.width}×${c.height}`
  fig.append(cap)
  out.append(fig)
}
out.className = 'row'

const query = new URLSearchParams(location.search)
const port = query.get('save')
const token = query.get('token') ?? ''
if (port) {
  // ?only=album-cover,cover-jig saves just those (the others stay as they are on disk).
  const only = query.get('only')?.split(',')
  for (const [name, c] of exports) {
    if (only && !only.includes(name.replace(/\.png$/, ''))) continue
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    await fetch(`http://127.0.0.1:${port}/${name}?token=${encodeURIComponent(token)}`, { method: 'POST', body: blob })
  }
  document.title = 'saved'
}
