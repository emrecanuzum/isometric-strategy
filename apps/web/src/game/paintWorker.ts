import type { Point, World } from '@game/shared'
import { paintChunk, preparePaint, setStructures } from './chunkPainter'
import type { PaintContext, Structure } from './chunkPainter'

// Chunks are painted off the main thread, so panning and zooming never wait for them.

export type PaintRequest =
  | { world: World }
  | { structures: Structure[]; trails: Point[][] }
  | { id: number; cx: number; cy: number; lod: number }

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
  if ('structures' in e.data) {
    setStructures(context!, e.data.structures, e.data.trails)
    return
  }
  const { id, cx, cy, lod } = e.data
  const image = paintChunk(context!, cx, cy, lod)
  const bitmap = await createImageBitmap(new ImageData(image.data, image.width, image.height))
  const result: PaintResult = { id, bitmap }
  postMessage(result, { transfer: [bitmap] })
}
