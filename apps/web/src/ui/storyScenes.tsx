import { useMemo } from 'react'
import { squad } from '../game/armies'
import { STRUCTURE_SPRITES, VILLAGER_SPRITES, palaceIn } from '../game/buildingSprites'
import { tent } from '../game/campSprites'
import { SPRITES } from '../game/sprites'
import type { KingdomColor } from '../game/buildingSprites'
import { Scene, coins } from './AwayReport'
import type { Mood, Placed } from './AwayReport'

// Small pictures for the expeditions (CLAUDE.md §9.9) and the newer fortunes, made like the "while you were away"
// report's: a backdrop of the mood's weather and the map's own sprites stood on its isometric meadow. Positions are
// tile points of that meadow (a building's front corner; see `Placed` in AwayReport.tsx): x + y from 0 (the far edge)
// to 7 (the bottom), x − y from about −9 (the left edge) to 9 (the right). Footprints never overlap.

const S = STRUCTURE_SPRITES
const walker = (i: number, frame = 0) => VILLAGER_SPRITES[i % VILLAGER_SPRITES.length][frame % 2]
const merchant = (i: number, frame = 0) => SPRITES.merchant[i % SPRITES.merchant.length][frame % 2]
const guard = (frame = 0) => SPRITES.guard[frame % 2]
const pick = <T,>(list: T[], i: number) => list[i % list.length]

// The party in a file from (x0, y0) toward the upper right, along a tile axis like the path.
const party = (n: number, x0: number, y0: number, look: (i: number) => Placed['sprite'] = (i) => walker(i, i)) =>
  Array.from({ length: n }, (_, i) => ({ sprite: look(i), x: x0 + (i % 2) * 0.25, y: y0 - i * 0.55 }))

const trees = (spots: [number, number][], kind: 'pine' | 'leaf' | 'fir' | 'birch' | 'blossom' | 'dead') => spots.map(([x, y], i) => ({ sprite: pick(SPRITES[kind], i), x, y }))

export interface Story {
  mood: Mood
  items: Placed[]
  // The tile column the path runs along (to the upper right), when the picture wants it somewhere in particular.
  road?: number
  // 1 for a picture without buildings: its figures drawn full size (see `Scene`).
  scale?: 0.5 | 1
}

// The picture of a party on (or back from) its road; what befell it shows in it (a bear, bandits, a hoard).
export function expeditionStory(kind: string, incidents: { id: string; bad: boolean }[] = [], own?: string, find?: string): Story {
  const met = new Set(incidents.map((i) => i.id))
  const n = 4
  switch (kind) {
    case 'hunt':
      return {
        mood: 'day',
        road: 0.5,
        scale: 1,
        items: [
          ...trees([[-2.75, 4.25], [-2.5, 5.5], [-1.5, 2.5], [6, -2], [7, 0], [5.5, -0.5]], 'pine'),
          ...trees([[-1.2, 3.2], [4.5, 1.5]], 'leaf'),
          ...party(n, 0.4, 5.6, (i) => walker(i, i)),
          { sprite: SPRITES.stag[0], x: 2.4, y: 2.6 },
          { sprite: SPRITES.deer[1], x: 3.2, y: 3.4 },
          ...(met.has('bear') ? [{ sprite: SPRITES.bear[0], x: 1.8, y: 4.6 }] : [{ sprite: SPRITES.hare[0], x: 2, y: 4.8 }]),
          ...(met.has('berries') ? [{ sprite: SPRITES.berryBush[0], x: -1.2, y: 2.4 }] : []),
        ],
      }
    case 'explore':
      return {
        mood: 'world',
        road: 0,
        scale: 1,
        items: [
          { sprite: SPRITES.snowCrag[0], x: -3, y: 4 },
          { sprite: SPRITES.crag[1], x: 5, y: -1 },
          { sprite: SPRITES.snowCrag[1], x: 7, y: -2 },
          { sprite: SPRITES.outcrop[2], x: 3.4, y: 2.8 },
          { sprite: SPRITES.scree[0], x: 2, y: 4.8 },
          ...party(n - 1, -0.1, 5.6),
          { sprite: guard(1), x: 0.2, y: 3.8 },
          { sprite: SPRITES.goat[2], x: 4.4, y: 1 },
          ...(met.has('wolves') ? [{ sprite: SPRITES.wolf[0], x: 2.4, y: 1.8 }] : []),
          ...(met.has('ruins') ? [{ sprite: S.brokenWall[0], x: -1.6, y: 3.4 }] : []),
        ],
      }
    case 'pilgrimage':
      return {
        mood: 'house',
        road: 2.5,
        items: [
          { sprite: S.temple[1], x: 5, y: 2 },
          ...trees([[-3, 4], [-1.5, 2.5], [0.6, 1.2]], 'blossom'),
          ...party(5, 1.2, 5.4, (i) => merchant(i, i)),
          ...(met.has('robbers') ? [{ sprite: squad('coal', 1, 3), x: -0.6, y: 4.6 }] : []),
        ],
      }
    case 'caravan':
      return {
        mood: 'treasury',
        road: 0.5,
        scale: 1,
        items: [
          { sprite: merchant(0, 1), x: 0.5, y: 3 },
          { sprite: SPRITES.camel[1][2][0], x: 0.5, y: 3.8 },
          { sprite: SPRITES.camel[2][1][1], x: 0.5, y: 4.6 },
          { sprite: SPRITES.camel[0][2][0], x: 0.5, y: 5.4 },
          { sprite: guard(0), x: 0.7, y: 6.2 },
          ...(met.has('bandits') ? [{ sprite: squad('coal', 0, 6), x: 3.6, y: 3 }] : [{ sprite: tent((own ?? 'gold') as KingdomColor, 1), x: 4.6, y: 1.4 }]),
          ...(met.has('oasis') ? trees([[-1.5, 2.8]], 'leaf') : []),
        ],
      }
    case 'treasure':
      return {
        mood: 'intrigue',
        road: -0.5,
        items: [
          ...trees([[-2.5, 5.5], [6, -1]], 'dead'),
          { sprite: SPRITES.tor[0], x: 4.4, y: 0.8 },
          { sprite: SPRITES.boulder[2], x: -2.4, y: 4.6 },
          ...party(3, -0.4, 4.4),
          ...(find === 'hoard'
            ? [{ sprite: S.treasury[0], x: 3, y: 1 }, { sprite: coins(30), x: 1.8, y: 3.8 }]
            : find === 'cache'
              ? [{ sprite: coins(10), x: 1.8, y: 3.8 }]
              : []),
          ...(met.has('rivals') ? [{ sprite: squad('violet', 1, 3), x: 4, y: 2.6 }] : []),
        ],
      }
    default:
      return { mood: 'day', items: [{ sprite: palaceIn(own, 1), x: 4, y: 3 }] }
  }
}

// The village going about its life: the "while you were away" report's story page. The palace at the back, its market
// before it, a field, two cottages; the path runs into the market.
export function villageStory(own?: string): Story {
  return {
    mood: 'house',
    road: 2,
    items: [
      { sprite: palaceIn(own, 2), x: 5, y: 2 },
      { sprite: S.market[0], x: 3, y: 4 },
      { sprite: S.farm[1], x: 1, y: 6 },
      { sprite: S.house[2], x: -1, y: 3 },
      { sprite: S.house[0], x: -2, y: 5 },
      { sprite: walker(0, 0), x: 3.9, y: 2.8 },
      { sprite: walker(1, 1), x: 2.2, y: 4.6 },
      { sprite: walker(2, 0), x: -0.6, y: 4.2 },
      ...trees([[-3.5, 4.5], [7, -1]], 'leaf'),
    ],
  }
}

// Pictures for the fortunes added with the expeditions (EventArt draws the older ones).
export function fortuneStory(kind: string, own?: string): Story | null {
  switch (kind) {
    case 'scholar':
      return { mood: 'house', road: 1, items: [{ sprite: S.university[0], x: 5, y: 2 }, { sprite: merchant(3, 0), x: 2.2, y: 3.6 }, ...party(3, 1, 5.6), ...trees([[-3, 4]], 'leaf')] }
    case 'festivalRequest':
      return {
        mood: 'day',
        road: 1,
        items: [
          { sprite: palaceIn(own, 2), x: 5, y: 2 },
          { sprite: S.market[1], x: -1, y: 5 },
          ...[[0.6, 4.6], [1.4, 5.2], [2.2, 4.2], [1.8, 3.2], [2.8, 3.4], [0.8, 3.6]].map(([x, y], i) => ({ sprite: walker(i, i), x, y })),
        ],
      }
    case 'lostChild':
      return {
        mood: 'world',
        road: 1,
        scale: 1,
        items: [...trees([[-3, 4], [-2.5, 5.5], [-1.5, 2.5], [-2, 3.6], [6, -2], [7, 0]], 'fir'), { sprite: guard(0), x: 0.4, y: 4.6 }, ...party(3, 1.4, 4.2), { sprite: walker(2, 1), x: 3.6, y: 0.8 }],
      }
    case 'rareMerchant':
      return {
        mood: 'treasury',
        scale: 1,
        items: [
          { sprite: SPRITES.camel[3 % SPRITES.camel.length][2][0], x: -0.6, y: 4.6 },
          { sprite: merchant(2, 0), x: 0.6, y: 4.2 },
          { sprite: coins(8), x: 1.6, y: 4.6 },
          { sprite: tent((own ?? 'gold') as KingdomColor, 0), x: 3.8, y: 1.6 },
        ],
      }
    case 'strayHerd':
      return {
        mood: 'day',
        scale: 1,
        items: [0, 1, 2, 3, 4]
          .map((i) => ({ sprite: SPRITES.sheep[i % 3], x: 0.6 + i * 0.8, y: 4.4 - i * 0.7 + (i % 2) * 0.6 }))
          .concat([{ sprite: walker(1, 0), x: -0.8, y: 5.6 }, ...trees([[6, 0]], 'leaf')]),
      }
    case 'harvestFair':
      return {
        mood: 'house',
        road: 0,
        items: [
          { sprite: S.farm[0], x: -1, y: 5 },
          { sprite: S.market[0], x: 3, y: 4 },
          { sprite: S.market[1], x: 6, y: 1 },
          ...[[0.4, 5.8], [0.2, 4.4], [3.4, 3.2], [4.4, 2.2]].map(([x, y], i) => ({ sprite: walker(i, i), x, y })),
        ],
      }
    case 'refugees':
      return { mood: 'battle', road: -1, items: [{ sprite: palaceIn(own, 1), x: 6, y: 1 }, ...party(6, -0.8, 6.6), { sprite: SPRITES.horse[0][0], x: 0.6, y: 3.8 }] }
    default:
      return null
  }
}

// `id` names the picture: the backdrop is painted again only when it changes (the clock re-renders every quarter
// second; a story made afresh each time would repaint the whole scene).
export function StoryScene({ story, id }: { story: Story; id: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kept = useMemo(() => story, [id])
  return <Scene items={kept.items} mood={kept.mood} road={kept.road} scale={kept.scale} />
}
