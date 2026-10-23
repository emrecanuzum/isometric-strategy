// Records the game's music as MP3s under apps/web/public/music: run `bun scripts/music-export.ts`, then open the
// printed /music.html?save=…&token=… link while `bun run dev` is up (BRAND_ORIGIN sets another dev origin). The page
// bounces each piece offline and posts it as a WAV; this turns it into an MP3 with ffmpeg. Listens on 127.0.0.1 only,
// answers only the dev origin, needs the token it prints and writes only the pieces' own names.
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dir = join(import.meta.dir, '../apps/web/public/music')
mkdirSync(dir, { recursive: true })
const port = 5199
const token = crypto.randomUUID()
const origin = process.env.BRAND_ORIGIN ?? 'http://localhost:5173'
// Track ids and the files they are saved as, in the order the settings list them.
const FILES: Record<string, string> = {
  hearth: '01-ocak-basinda.mp3',
  crusade: '02-kudus-yolunda.mp3',
  england: '03-kralin-cayirlari.mp3',
  horizon: '04-ufuktaki-sancaklar.mp3',
  jig: '05-sarhos-ejder-hani.mp3',
}
const TITLES: Record<string, string> = {
  hearth: 'Ocak Başında',
  crusade: 'Kudüs Yolunda',
  england: 'Kralın Çayırları',
  horizon: 'Ufuktaki Sancaklar',
  jig: 'Sarhoş Ejder Hanı',
}

Bun.serve({
  hostname: '127.0.0.1',
  port,
  maxRequestBodySize: 200_000_000,
  async fetch(req) {
    const h = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }
    if (req.method === 'OPTIONS') return new Response(null, { headers: h })
    const url = new URL(req.url)
    const id = url.pathname.slice(1).replace(/\.wav$/, '')
    if (req.method !== 'POST' || req.headers.get('origin') !== origin || url.searchParams.get('token') !== token || !FILES[id] || !url.pathname.endsWith('.wav')) {
      return new Response('refused', { status: 403, headers: h })
    }
    const body = new Uint8Array(await req.arrayBuffer())
    if (String.fromCharCode(...body.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...body.subarray(8, 12)) !== 'WAVE') return new Response('not a wav', { status: 400, headers: h })
    const wav = join(tmpdir(), `crownherald-${token}-${id}.wav`)
    await Bun.write(wav, body)
    const mp3 = join(dir, FILES[id])
    const ff = Bun.spawnSync(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '2', '-metadata', `title=${TITLES[id]}`, '-metadata', 'artist=Crownherald', '-metadata', 'album=Crownherald', mp3])
    rmSync(wav, { force: true })
    if (ff.exitCode !== 0) return new Response(ff.stderr.toString(), { status: 500, headers: h })
    console.log('wrote', FILES[id])
    return new Response('ok', { headers: h })
  },
})
console.log(`open ${origin}/music.html?save=${port}&token=${token}`)
