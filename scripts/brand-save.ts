// Writes the PNGs that apps/web/brand.html?save=5199 posts: `bun scripts/brand-save.ts apps/web/public/brand`.
const dir = process.argv[2]
Bun.serve({ port: 5199, async fetch(req) {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  if (req.method === 'POST') { const name = new URL(req.url).pathname.slice(1).replace(/[^\w.@-]/g, ''); await Bun.write(`${dir}/${name}`, await req.arrayBuffer()); console.log('wrote', name) }
  return new Response('ok', { headers: h })
}})
