// Writes the PNGs that apps/web/brand.html posts: run `bun scripts/brand-save.ts apps/web/public/brand`, then open the
// printed /brand.html?save=…&token=… link while `bun run dev` is up. Listens on 127.0.0.1 only, answers only the dev
// origin, needs the token it prints, and writes only the brand art's own PNG names.
const dir = process.argv[2]
if (!dir) throw new Error('usage: bun scripts/brand-save.ts <output dir>')
const port = 5199
const token = crypto.randomUUID()
const origin = process.env.BRAND_ORIGIN ?? 'http://localhost:5173'
const NAME = /^(logo-wide(@2x)?|logo-stacked|badge|instagram-1080|favicon-(32|64)|apple-touch-icon|icon-(192|512))\.png$/
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

Bun.serve({
  hostname: '127.0.0.1',
  port,
  async fetch(req) {
    const h = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
    if (req.method === 'OPTIONS') return new Response(null, { headers: h })
    const url = new URL(req.url)
    const name = url.pathname.slice(1)
    if (req.method !== 'POST' || req.headers.get('origin') !== origin || url.searchParams.get('token') !== token || !NAME.test(name)) {
      return new Response('refused', { status: 403, headers: h })
    }
    const body = new Uint8Array(await req.arrayBuffer())
    if (body.length > 8_000_000 || PNG.some((b, i) => body[i] !== b)) return new Response('not a png', { status: 400, headers: h })
    await Bun.write(`${dir}/${name}`, body)
    console.log('wrote', name)
    return new Response('ok', { headers: h })
  },
})
console.log(`open ${origin}/brand.html?save=${port}&token=${token}`)
