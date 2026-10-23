import { TRACKS, renderPiece } from '../audio/music'

// A dev-only page (/music.html?save=<port>&token=<token>) that bounces every piece of the game's music offline and
// posts each as a 16-bit WAV to scripts/music-export.ts, which turns them into MP3s under public/music.

function wav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytes = frames * channels * 2
  const view = new DataView(new ArrayBuffer(44 + bytes))
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, bytes, true)
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  let at = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      at += 2
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' })
}

const out = document.getElementById('out')!
const query = new URLSearchParams(location.search)
const port = query.get('save')
const token = query.get('token') ?? ''
const log: string[] = []
for (const track of TRACKS) {
  const buffer = await renderPiece(track.id)
  log.push(`${track.id} · ${track.name} · ${buffer.duration.toFixed(1)} sn`)
  out.textContent = log.join('\n')
  if (port) await fetch(`http://127.0.0.1:${port}/${track.id}.wav?token=${encodeURIComponent(token)}`, { method: 'POST', body: wav(buffer) })
}
document.title = 'done'
