import { DIR_NAMES, PROBE_REASONS } from '@game/shared'
import type { TrailMark, World } from '@game/shared'
import { cityInfo } from './cities'
import { innInfo } from './innInfo'
import { isCaravanserai } from './innSprites'

// The words of a lord's trail to a bandit clan's cave (CLAUDE.md §7.9.1): the hints are told from a landmark the server
// chose ("Akova kasabasının güneyindeki dağlar"); inns and crown capitals are named here, from the world the app sets
// (as setCrownClock does), towns and lords by the name the server sent.

let world: World | null = null
export const setHintWorld = (w: World | null) => {
  world = w
}

// "kuzeyindeki" … : the way from the landmark, 0–7 clockwise from north on the screen.
const DIR_LOC = ['kuzeyindeki', 'kuzeydoğusundaki', 'doğusundaki', 'güneydoğusundaki', 'güneyindeki', 'güneybatısındaki', 'batısındaki', 'kuzeybatısındaki']

// A proper name in the genitive ("Akçay Hanı'nın", "Altınkapı'nın", "Gökova Beyliği'nin"), by the last vowel.
export function genitive(name: string) {
  const lower = name.toLocaleLowerCase('tr-TR')
  const vowels = 'aeıioöuü'
  let last = ''
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i])) {
      last = lower[i]
      break
    }
  }
  const v = last === 'a' || last === 'ı' ? 'ı' : last === 'e' || last === 'i' ? 'i' : last === 'o' || last === 'u' ? 'u' : 'ü'
  const endsVowel = vowels.includes(lower[lower.length - 1] ?? '')
  return `${name}'${endsVowel ? 'n' : ''}${v}n`
}

function innName(mark: TrailMark) {
  if (!world || world.inns.length === 0) return null
  let best = 0
  let bestD = Infinity
  world.inns.forEach((p, i) => {
    const d = Math.hypot(p.x + 0.5 - mark.at.x, p.y + 0.5 - mark.at.y)
    if (d < bestD) [best, bestD] = [i, d]
  })
  return innInfo(world, best, isCaravanserai(world, world.inns[best])).name
}

// The landmark's name in the genitive: "Akova kasabasının", "Kavaklı Menzilhanesi'nin", "senin topraklarının".
export function markGenitive(mark: TrailMark) {
  switch (mark.kind) {
    case 'town':
      return `${mark.name ?? 'bir'} kasabasının`
    case 'inn': {
      const name = innName(mark)
      return name ? genitive(name) : 'bir hanın'
    }
    case 'city':
      return world && world.cities[mark.idx] ? genitive(cityInfo(world, mark.idx).capital) : 'bir taç başkentinin'
    case 'lord':
      return mark.own ? 'senin topraklarının' : mark.name ? `${genitive(mark.name)} topraklarının` : 'bir lordun topraklarının'
  }
}

export interface TrailHint {
  dir?: number | null
  far?: number | null
  mark?: TrailMark | null
}

// Where the trail leads, as a phrase: `place` ("Akova kasabasının güneyindeki dağlar", then "Akova kasabasının 25 karo
// kadar güneyindeki dağ eteği") and `to` (the same in the dative: "… dağlara" / "… dağ eteğine"). Old trails without a
// landmark: from the last fight.
export function trailHint(t: TrailHint) {
  const dir = ((Number(t.dir ?? 0) % 8) + 8) % 8
  const far = t.far ? Number(t.far) : null
  if (t.mark) {
    const head = `${markGenitive(t.mark)} ${far ? `${far.toLocaleString('tr-TR')} karo kadar ` : ''}${DIR_LOC[dir]}`
    return { place: `${head} ${far ? 'dağ eteği' : 'dağlar'}`, to: `${head} ${far ? 'dağ eteğine' : 'dağlara'}` }
  }
  const tail = far ? `, son savaş yerinden aşağı yukarı ${far.toLocaleString('tr-TR')} karo ötede` : ''
  return { place: `${DIR_NAMES[dir]} yönündeki dağlar${tail}`, to: `${DIR_NAMES[dir]} yönündeki dağlara${tail}` }
}

// What the envoy says of an army that could not look into a cave.
export const probeText = (reason: number) => PROBE_REASONS[((Number(reason) % PROBE_REASONS.length) + PROBE_REASONS.length) % PROBE_REASONS.length]
