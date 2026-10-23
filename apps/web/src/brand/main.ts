import '@fontsource/pixelify-sans/latin-600.css'
import { type Art, badge, favicon, logoStacked, logoWide } from './brandArt'

// A dev-only page (/brand.html) that paints the brand art and, with ?save=<port>, posts every export as a PNG to a
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

const exports: [string, HTMLCanvasElement][] = [
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

const port = new URLSearchParams(location.search).get('save')
if (port) {
  for (const [name, c] of exports) {
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    await fetch(`http://localhost:${port}/${name}`, { method: 'POST', body: blob })
  }
  document.title = 'saved'
}
