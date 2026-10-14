import { hash } from '@game/shared'
import type { Point, World } from '@game/shared'

// Every inn on the trade routes has a trade of its own besides lodging, and a name; both follow from the lobby seed, so
// every player sees the same inn. Purely for show and talk: the rumours told there (see ui/hud/InnSheet).

export type InnKind = 'inn' | 'market' | 'post' | 'toll'

export const INN_KINDS: InnKind[] = ['inn', 'market', 'post', 'toll']

export const INN_KIND_NAMES: Record<InnKind, string> = {
  inn: 'Yol hanı',
  market: 'Pazar hanı',
  post: 'Menzilhane',
  toll: 'Gümrük hanı',
}

export const INN_KIND_TEXT: Record<InnKind, string> = {
  inn: 'Yolcular ve tüccarlar burada geceler; her kervanın haberi önce buraya düşer.',
  market: 'Önünde tezgâhlar kurulur, kervanlar yüklerinin bir kısmını burada bozar.',
  post: 'Ulaklar ve kervanlar atlarını burada değiştirir; uzak yolların haberi buradan geçer.',
  toll: 'Yoldan geçen yükler burada sayılır; kimin ne taşıdığını en iyi gümrükçü bilir.',
}

const PLACES = [
  'Akçay', 'Karapınar', 'Yeşilova', 'Kızılkaya', 'Değirmendere', 'Taşköprü', 'Söğütlü', 'Çamlıbel', 'Kuyucak',
  'Eskiyol', 'Gökdere', 'Ilıca', 'Narlı', 'Bozkır', 'Sarıgöl', 'Kavaklı', 'Çınaraltı', 'Ayazma', 'Kurtbeli',
  'Dumanlı', 'Kervanyolu', 'Ulupınar', 'Yelkaya', 'Ardıçlı', 'Saraçlı', 'Kemerli', 'Güvercinlik', 'Boğazağzı',
]
const KEEPERS = [
  'Hancı Mehmet', 'Hancı Ayşe', 'Yaşlı Rıza', 'Topal Hasan', 'Kara Fatma', 'Dilsiz Ömer', 'Gezgin Selim',
  'Hatice Kadın', 'Koca Yusuf', 'Ağzı Sıkı Nuri', 'Saz Çalan Kemal', 'Emine Ana',
]

export interface InnInfo {
  index: number
  kind: InnKind
  // Built of sun-dried brick in the desert: a caravanserai.
  desert: boolean
  name: string
  keeper: string
}

export function innKind(world: World, inn: Point): InnKind {
  const r = hash(inn.x, inn.y, world.seed + 1931)
  return r < 0.4 ? 'inn' : r < 0.65 ? 'market' : r < 0.85 ? 'post' : 'toll'
}

export function innInfo(world: World, index: number, desert: boolean): InnInfo {
  const inn = world.inns[index]
  const kind = innKind(world, inn)
  // Names are dealt out without repeats while there are enough of them.
  const start = Math.floor(hash(1, 2, world.seed + 1933) * PLACES.length)
  const place = PLACES[(start + index * 5) % PLACES.length]
  const suffix = desert
    ? kind === 'market' ? 'Pazar Kervansarayı' : 'Kervansarayı'
    : { inn: 'Hanı', market: 'Pazar Hanı', post: 'Menzilhanesi', toll: 'Gümrük Hanı' }[kind]
  return {
    index,
    kind,
    desert,
    name: `${place} ${suffix}`,
    keeper: KEEPERS[Math.floor(hash(inn.x, inn.y, world.seed + 1937) * KEEPERS.length)],
  }
}
