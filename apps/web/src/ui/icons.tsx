import { memo } from 'react'
// Small pixel icons for the interface, drawn from 8×8 character maps so they match the pixel art of the map.
// They are always drawn at a whole multiple of 8 pixels, so every art pixel stays square.

export const PALETTE: Record<string, string> = {
  k: '#1c1612',
  y: '#f2d16b',
  o: '#c8952e',
  w: '#fff3c4',
  b: '#8a5a2e',
  t: '#c89052',
  l: '#e2c48a',
  g: '#5f8c3a',
  G: '#8fbf55',
  s: '#a8b0bc',
  S: '#e6ebf0',
  d: '#5a606c',
  r: '#b0302a',
  R: '#e05a4a',
  c: '#4a72bf',
  C: '#8fb8ea',
  f: '#e0a878',
  m: '#7a1822',
}

export const MAPS = {
  gold: ['..kkkk..', '.kyyyyk.', 'kyywyyok', 'kywyyyok', 'kyyyyook', 'kyyyoook', '.kooook.', '..kkkk..'],
  food: ['........', '..kkkk..', '.kttttk.', 'ktlltttk', 'kttttttk', 'kbbbbbbk', '.kkkkkk.', '........'],
  materials: ['........', 'kkkkkkk.', 'ktttttlk', 'kbbbbbbk', 'kkkkkkk.', 'ktttttlk', 'kbbbbbbk', 'kkkkkkk.'],
  arms: ['......kk', '.....kSk', '....kSk.', 'k..kSk..', 'kkkSk...', '.kbk....', 'kbkk....', 'kk......'],
  villager: ['..yyyy..', '.yooooy.', '..kffk..', '..kffk..', '.kggggk.', 'kgGggGgk', '.kggggk.', '.kk..kk.'],
  build: ['.kkkk...', 'kssssk..', 'kssssk..', '.kkbkk..', '...kbk..', '....kbk.', '.....kbk', '......kk'],
  trade: ['....k...', 'kkkkyk..', 'kyyyyyk.', 'kkkkyk..', '..kGkkkk', '.kGGGGGk', '..kGkkkk', '...k....'],
  time: ['.kkkkkk.', '.kwwwwk.', '..kwwk..', '...kk...', '...kk...', '..kyyk..', '.kyyyyk.', '.kkkkkk.'],
  crown: ['k..kk..k', 'yk.yy.ky', 'yykyykyy', 'yyyyyyyy', 'yRyyyyRy', 'oooooooo', 'kkkkkkkk', '........'],
  people: ['.kk..kk.', 'kffkkffk', 'kffkkffk', '.kk..kk.', 'kGgkkCck', 'kggkkcck', 'kggkkcck', '.k.k.k.k'],
  chest: ['........', '.kkkkkk.', 'kbttttbk', 'kkkyykkk', 'kbtyytbk', 'kbttttbk', 'kbbbbbbk', '.kkkkkk.'],
  banner: ['bk......', 'bcccccck', 'bcyyycck', 'bcyyycck', 'bccccck.', 'bck..ck.', 'b.......', 'b.......'],
  scroll: ['.kkkkkk.', 'kllllllk', '.kwwwwk.', '.kwddwk.', '.kwwwwk.', '.kwddwk.', 'kllllRRk', '.kkkkRR.'],
  happy: ['.kkkkkk.', 'kyyyyyyk', 'kykyykyk', 'kyyyyyyk', 'kkyyyykk', 'kykkkkyk', 'kyyyyyyk', '.kkkkkk.'],
  content: ['.kkkkkk.', 'kyyyyyyk', 'kykyykyk', 'kyyyyyyk', 'kyyyyyyk', 'kykkkkyk', 'kyyyyyyk', '.kkkkkk.'],
  unhappy: ['.kkkkkk.', 'kyyyyyyk', 'kykyykyk', 'kyyyyyyk', 'kykkkkyk', 'kkyyyykk', 'kyyyyyyk', '.kkkkkk.'],
  lock: ['..ssss..', '.s....s.', '.s....s.', 'kkkkkkkk', 'kyyyyyyk', 'kyykkyyk', 'kyyyyyyk', 'kkkkkkkk'],
  close: ['ww....ww', '.ww..ww.', '..wwww..', '...ww...', '..wwww..', '.ww..ww.', 'ww....ww', '........'],
  music: ['....wwww', '....wwww', '....w..w', '....w..w', '..www.ww', '.wwww.ww', '..ww....', '........'],
  home: ['...ww...', '..wwww..', '.wwwwww.', 'wwwwwwww', '.ww..ww.', '.ww..ww.', '.ww..ww.', '.wwwwww.'],
  plus: ['........', '...ww...', '...ww...', '.wwwwww.', '.wwwwww.', '...ww...', '...ww...', '........'],
  minus: ['........', '........', '........', '.wwwwww.', '.wwwwww.', '........', '........', '........'],
  warn: ['...kk...', '..kyyk..', '.kykkyk.', '.kykkyk.', 'kyykkyyk', 'kyyyyyyk', 'kyykkyyk', 'kkkkkkkk'],
  pin: ['..rrrr..', '.rRRRRr.', 'rRRwwRRr', 'rRRwwRRr', '.rRRRRr.', '..rRRr..', '...rr...', '........'],
  house: ['...kk...', '..kRRk..', '.kRRRRk.', 'kRRRRRRk', '.kllllk.', '.klkklk.', '.klkklk.', '.kkkkkk.'],
  sun: ['...y....', '.y.y.y..', '..ooo...', 'yyowoyy.', '..ooo...', '.y.y.y..', '...y....', '........'],
  moon: ['..wwww..', '.wwSSww.', 'wwS.....', 'wwS.....', 'wwS.....', 'wwwS....', '.wwwwww.', '..wwww..'],
  shield: ['kkkkkkkk', 'kRRyyRRk', 'kRRyyRRk', 'kyyyyyyk', 'kRRyyRRk', '.kRyyRk.', '..kyyk..', '...kk...'],
  bow: ['..bk....', '.b.Sk...', 'b...Sk..', 'b..kkSkk', 'b...Sk..', '.b.Sk...', '..bk....', '........'],
  inn: ['..kkkk..', '.kRRRRk.', 'kRRRRRRk', 'kkkkkkkk', '.klyylk.', '.klyylk.', '.klbblk.', '.kkkkkk.'],
  swords: ['S......S', 'sS....Ss', '.sS..Ss.', '..sSSs..', '...ss...', '..ySSy..', '.bk..kb.', 'bk....kb'],
  eye: ['........', '..kkkk..', '.kwwwwk.', 'kwwccwwk', 'kwwckwwk', '.kwwwwk.', '..kkkk..', '........'],
  horse: ['........', '.....kk.', '....kbbk', 'kkkkbbk.', 'kbbbbbk.', 'kbbbbbk.', '.k.k.k..', '.k.k.k..'],
  catapult: ['......kk', '.....kbk', '....kbk.', '...kbk..', '..kbk...', 'kkkkkkkk', '.kd..dk.', '.kk..kk.'],
  dice: ['kkkkkkk.', 'kwwwwwk.', 'kwkwwwk.', 'kwwkwwk.', 'kwwwkwk.', 'kwwwwwk.', 'kkkkkkk.', '........'],
  book: ['........', 'kkkk.kkk', 'kwwlklwk', 'kwwlklwk', 'kwwlklwk', 'kwwlklwk', 'kkkkkkkk', '..kRRk..'],
  heal: ['..kkkk..', '..kRRk..', 'kkkRRkkk', 'kRRRRRRk', 'kRRRRRRk', 'kkkRRkkk', '..kRRk..', '..kkkk..'],
  temple: ['...yy...', '...ky...', '..kssk..', '.kssssk.', 'kkkkkkkk', '.ksksks.', '.ksksks.', 'kkkkkkkk'],
  info: ['..cccc..', '.ccwwcc.', 'cccccccc', 'cccwwccc', 'cccwwccc', '.ccwwcc.', '..cccc..', '........'],
  bell: ['...yy...', '..yyyy..', '.yyyyyy.', '.yyyyyy.', '.yyyyyy.', 'yyyyyyyy', '...kk...', '........'],
  menu: ['........', 'wwwwwwww', 'wwwwwwww', '........', 'wwwwwwww', 'wwwwwwww', '........', 'wwwwwwww'],
  gear: ['...ww...', '.w.ww.w.', '..wwww..', 'www..www', 'www..www', '..wwww..', '.w.ww.w.', '...ww...'],
  ship: ['...k....', '...kw...', '..kkww..', '...kwww.', '...k....', 'kbbbbbbk', '.kbtttk.', 'CCcCCcCC'],
  anchor: ['...kk...', '..k..k..', '...kk...', 'kkkkkkkk', '...kk...', 'k..kk..k', '.k.kk.k.', '..kkkk..'],
  flower: ['..RR....', '.RyyR...', '..RR.RR.', '...gRyyR', '..g..RR.', '.Gg.g...', '..Ggg...', '...g....'],
  leaf: ['.....oko', '....okyk', '...oyyok', '..oyyok.', '.oyook..', '.kook...', '.k......', 'k.......'],
  snow: ['...C....', '.C.S.C..', '..SSS...', 'CSSwSSC.', '..SSS...', '.C.S.C..', '...C....', '........'],
  star: ['...yy...', '...yy...', 'yyywwyyy', '.yywwyy.', '..yyyy..', '.yy..yy.', '.y....y.', '........'],
  map: ['kkkkkkkk', 'kllGlllk', 'klGGlRlk', 'klllRllk', 'kllRlGlk', 'klRllGGk', 'kllllllk', 'kkkkkkkk'],
  camera: ['........', '..kkk...', 'kkkkkkkk', 'kddkkdyk', 'kdkCwkdk', 'kdkcCkdk', 'kddkkddk', 'kkkkkkkk'],
  wheat: ['..y.y...', '.yoyoy..', '..yoy...', '.yoyoy..', '..yoy...', '...g....', '..gg....', '..g.....'],
  axe: ['..kkk...', '.kSSSk..', 'kSSSskk.', '.kSSkbk.', '..kkkbk.', '....kbk.', '.....kbk', '......kk'],
  anvil: ['........', 'kkkkkkk.', 'ksSSSSSk', '.kssssk.', '..kdk...', '.kdddk..', 'kddddddk', 'kkkkkkkk'],
  fish: ['........', '.....k..', '.kkkkCk.', 'kCCCCCck', 'kCwCCCck', '.kkkkck.', '.....k..', '........'],
  torch: ['...R....', '..RyR...', '..ywy...', '...y....', '..kbk...', '...b....', '...b....', '...b....'],
} as const

export type IconName = keyof typeof MAPS

// One path per colour (a handful per icon, instead of a rect per pixel): the interface draws hundreds of icons and
// re-renders every second, so each one is worked out once and the component skips the render while its props hold
// (CLAUDE.md §12).
const PATHS = new Map<IconName, [string, string][]>()
function pathsOf(name: IconName) {
  let out = PATHS.get(name)
  if (!out) {
    const byColor = new Map<string, string>()
    MAPS[name].forEach((row, y) => [...row].forEach((ch, x) => PALETTE[ch] && byColor.set(PALETTE[ch], `${byColor.get(PALETTE[ch]) ?? ''}M${x} ${y}h1v1h-1z`)))
    PATHS.set(name, (out = [...byColor]))
  }
  return out
}
const SLASH = Array.from({ length: 8 }, (_, i) => `M${7 - i} ${i}h1v1h-1z`).join('')

export const Icon = memo(function Icon({ name, size = 16, slash = false }: { name: IconName; size?: number; slash?: boolean }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden>
      {pathsOf(name).map(([fill, d]) => (
        <path key={fill} d={d} fill={fill} />
      ))}
      {slash && <path d={SLASH} fill={PALETTE.R} />}
    </svg>
  )
})
