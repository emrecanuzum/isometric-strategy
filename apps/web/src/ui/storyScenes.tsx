import { useMemo } from 'react'
import { squad } from '../game/armies'
import { STRUCTURE_SPRITES, VILLAGER_SPRITES, palaceIn } from '../game/buildingSprites'
import { tent } from '../game/campSprites'
import { SPRITES } from '../game/sprites'
import type { KingdomColor } from '../game/buildingSprites'
import { Scene, coins } from './AwayReport'
import type { Mood, Placed } from './AwayReport'

// Small pictures for the expeditions (CLAUDE.md §9.9) and the newer fortunes, made like the "while you were away"
// report's: a backdrop of the mood's weather and the map's own sprites stood on its meadow (a 240 × 96 plan, feet at
// about y 70–92).

const S = STRUCTURE_SPRITES
const walker = (i: number, frame = 0) => VILLAGER_SPRITES[i % VILLAGER_SPRITES.length][frame % 2]
const merchant = (i: number, frame = 0) => SPRITES.merchant[i % SPRITES.merchant.length][frame % 2]
const guard = (frame = 0) => SPRITES.guard[frame % 2]
const pick = <T,>(list: T[], i: number) => list[i % list.length]

// A row of the party walking along the meadow, from x0 to the right.
const party = (n: number, x0: number, y: number, look: (i: number) => Placed['sprite'] = (i) => walker(i, i)) =>
  Array.from({ length: n }, (_, i) => ({ sprite: look(i), x: x0 + i * 13, y: y + (i % 2) * 4 }))

const trees = (xs: number[], kind: 'pine' | 'leaf' | 'fir' | 'birch' | 'blossom' | 'dead', y = 70) => xs.map((x, i) => ({ sprite: pick(SPRITES[kind], i), x, y: y + (i % 3) * 3 }))

export interface Story {
  mood: Mood
  items: Placed[]
}

// The picture of a party on (or back from) its road; what befell it shows in it (a bear, bandits, a hoard).
export function expeditionStory(kind: string, incidents: { id: string; bad: boolean }[] = [], own?: string, find?: string): Story {
  const met = new Set(incidents.map((i) => i.id))
  const n = 4
  switch (kind) {
    case 'hunt':
      return {
        mood: 'day',
        items: [
          ...trees([10, 34, 200, 222, 236], 'pine', 66),
          ...trees([52, 180], 'leaf', 72),
          ...party(n, 70, 84, (i) => walker(i, i)),
          { sprite: SPRITES.stag[0], x: 150, y: 80 },
          { sprite: SPRITES.deer[1], x: 168, y: 86 },
          ...(met.has('bear') ? [{ sprite: SPRITES.bear[0], x: 128, y: 90 }] : [{ sprite: SPRITES.hare[0], x: 132, y: 92 }]),
          ...(met.has('berries') ? [{ sprite: SPRITES.berryBush[0], x: 112, y: 76 }] : []),
        ],
      }
    case 'explore':
      return {
        mood: 'world',
        items: [
          { sprite: SPRITES.snowCrag[0], x: 30, y: 72 },
          { sprite: SPRITES.crag[1], x: 196, y: 74 },
          { sprite: SPRITES.snowCrag[1], x: 224, y: 70 },
          { sprite: SPRITES.outcrop[2], x: 160, y: 88 },
          { sprite: SPRITES.scree[0], x: 132, y: 92 },
          ...party(n - 1, 72, 84),
          { sprite: guard(1), x: 112, y: 86 },
          { sprite: SPRITES.goat[2], x: 176, y: 78 },
          ...(met.has('wolves') ? [{ sprite: SPRITES.wolf[0], x: 146, y: 80 }] : []),
          ...(met.has('ruins') ? [{ sprite: S.brokenWall[0], x: 60, y: 74 }] : []),
        ],
      }
    case 'pilgrimage':
      return {
        mood: 'house',
        items: [
          { sprite: S.temple[1], x: 196, y: 80 },
          ...trees([24, 46, 150], 'blossom', 74),
          ...party(5, 64, 86, (i) => merchant(i, i)),
          ...(met.has('robbers') ? [{ sprite: squad('coal', 1, 3), x: 168, y: 92 }] : []),
        ],
      }
    case 'caravan':
      return {
        mood: 'treasury',
        items: [
          { sprite: merchant(0, 1), x: 36, y: 86 },
          { sprite: SPRITES.camel[1][2][0], x: 62, y: 86 },
          { sprite: SPRITES.camel[2][1][1], x: 92, y: 88 },
          { sprite: SPRITES.camel[0][2][0], x: 122, y: 86 },
          { sprite: guard(0), x: 148, y: 90 },
          ...(met.has('bandits') ? [{ sprite: squad('coal', 0, 6), x: 200, y: 88 }] : [{ sprite: tent((own ?? 'gold') as KingdomColor, 1), x: 206, y: 80 }]),
          ...(met.has('oasis') ? trees([180], 'leaf', 72) : []),
        ],
      }
    case 'treasure':
      return {
        mood: 'intrigue',
        items: [
          ...trees([20, 214], 'dead', 72),
          { sprite: SPRITES.tor[0], x: 180, y: 76 },
          { sprite: SPRITES.boulder[2], x: 54, y: 90 },
          ...party(3, 92, 86),
          ...(find === 'hoard' ? [{ sprite: coins(30), x: 150, y: 90 }, { sprite: S.treasury[0], x: 140, y: 74 }] : find === 'cache' ? [{ sprite: coins(10), x: 150, y: 90 }] : []),
          ...(met.has('rivals') ? [{ sprite: squad('violet', 1, 3), x: 206, y: 90 }] : []),
        ],
      }
    default:
      return { mood: 'day', items: [{ sprite: palaceIn(own, 1), x: 120, y: 84 }] }
  }
}

// The village going about its life: the "while you were away" report's story page.
export function villageStory(own?: string): Story {
  return {
    mood: 'house',
    items: [
      { sprite: palaceIn(own, 2), x: 186, y: 80 },
      { sprite: S.house[0], x: 40, y: 80 },
      { sprite: S.house[2], x: 70, y: 74 },
      { sprite: S.farm[1], x: 112, y: 88 },
      { sprite: S.market[0], x: 146, y: 92 },
      ...party(3, 84, 92),
      ...trees([14, 226], 'leaf', 70),
    ],
  }
}

// Pictures for the fortunes added with the expeditions (EventArt draws the older ones).
export function fortuneStory(kind: string, own?: string): Story | null {
  switch (kind) {
    case 'scholar':
      return { mood: 'house', items: [{ sprite: S.university[0], x: 170, y: 82 }, { sprite: merchant(3, 0), x: 104, y: 88 }, ...party(3, 50, 86), ...trees([224], 'leaf', 72)] }
    case 'festivalRequest':
      return { mood: 'day', items: [{ sprite: palaceIn(own, 2), x: 196, y: 82 }, { sprite: S.market[1], x: 60, y: 84 }, ...party(6, 92, 88)] }
    case 'lostChild':
      return { mood: 'world', items: [...trees([16, 38, 60, 200, 226], 'fir', 68), { sprite: guard(0), x: 110, y: 86 }, ...party(3, 130, 88), { sprite: walker(2, 1), x: 182, y: 92 }] }
    case 'rareMerchant':
      return { mood: 'treasury', items: [{ sprite: SPRITES.camel[3 % SPRITES.camel.length][2][0], x: 80, y: 86 }, { sprite: merchant(2, 0), x: 112, y: 88 }, { sprite: tent((own ?? 'gold') as KingdomColor, 0), x: 170, y: 80 }, { sprite: coins(8), x: 136, y: 92 }] }
    case 'strayHerd':
      return { mood: 'day', items: [0, 1, 2, 3, 4].map((i) => ({ sprite: SPRITES.sheep[i % 3], x: 70 + i * 22, y: 82 + (i % 2) * 6 })).concat([{ sprite: walker(1, 0), x: 40, y: 88 }, ...trees([220], 'leaf', 70)]) }
    case 'harvestFair':
      return { mood: 'house', items: [{ sprite: S.farm[0], x: 50, y: 82 }, { sprite: S.market[0], x: 120, y: 84 }, { sprite: S.market[1], x: 186, y: 86 }, ...party(4, 90, 92)] }
    case 'refugees':
      return { mood: 'battle', items: [{ sprite: palaceIn(own, 1), x: 200, y: 80 }, ...party(6, 40, 88), { sprite: SPRITES.horse[0][0], x: 132, y: 86 }] }
    default:
      return null
  }
}

// `id` names the picture: the backdrop is painted again only when it changes (the clock re-renders every quarter
// second; a story made afresh each time would repaint the whole scene).
export function StoryScene({ story, id }: { story: Story; id: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kept = useMemo(() => story, [id])
  return <Scene items={kept.items} mood={kept.mood} />
}
