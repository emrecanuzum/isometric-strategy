import type { World } from '@game/shared'
import { paintChunk, preparePaint } from './chunkPainter'
import type { PaintContext } from './chunkPainter'

// Chunks are painted off the main thread, so panning and zooming never wait for them.

export type PaintRequest = { world: World } | { id: number; cx: number; cy: number; lod: number }

export interface PaintResult {
  id: number
  bitmap: ImageBitmap
}

let context: PaintContext | undefined

self.onmessage = async (e: MessageEvent<PaintRequest>) => {
  if ('world' in e.data) {
    context = preparePaint(e.data.world)
    return
  }
  const { id, cx, cy, lod } = e.data
  const image = paintChunk(context!, cx, cy, lod)
  const bitmap = await createImageBitmap(new ImageData(image.data, image.width, image.height))
  const result: PaintResult = { id, bitmap }
  postMessage(result, { transfer: [bitmap] })
}
