import type { Point, World } from '@game/shared'
import type { SunShadow } from './daylight'
import { paintChunk, preparePaint, setStructures } from './chunkPainter'
import type { LiftedTree, PaintContext, Structure } from './chunkPainter'

// Chunks are painted off the main thread, so panning and zooming never wait for them.

export type PaintRequest =
  | { world: World }
  | { structures: Structure[]; trails: Point[][] }
  | { id: number; cx: number; cy: number; lod: number; lift?: boolean; sun: SunShadow; liftedNear?: number[] | 'all'; snow?: number }

export interface PaintResult {
  id: number
  bitmap: ImageBitmap
  trees?: LiftedTree[]
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
  const { id, cx, cy, lod, lift, sun, liftedNear, snow } = e.data
  const image = paintChunk(context!, cx, cy, lod, lift, sun, liftedNear, snow)
  const bitmap = await createImageBitmap(new ImageData(image.data, image.width, image.height))
  const result: PaintResult = { id, bitmap, ...(image.trees && { trees: image.trees }) }
  postMessage(result, { transfer: [bitmap] })
}
