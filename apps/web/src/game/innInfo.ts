import { hash } from '@game/shared'
import type { Point, World } from '@game/shared'
import { L } from '../lib/i18n'

// Every inn on the trade routes has a trade of its own besides lodging, and a name; both follow from the lobby seed, so
// every player sees the same inn. Purely for show and talk: the rumours told there (see ui/hud/InnSheet).

export type InnKind = 'inn' | 'market' | 'post' | 'toll'

export const INN_KINDS: InnKind[] = ['inn', 'market', 'post', 'toll']

export const INN_KIND_NAMES: Record<InnKind, string> = {
  inn: L('Yol hanı', 'Roadside inn'),
  market: L('Pazar hanı', 'Market inn'),
  post: L('Menzilhane', 'Post house'),
  toll: L('Gümrük hanı', 'Customs inn'),
}

export const INN_KIND_TEXT: Record<InnKind, string> = {
  inn: L('Yolcular ve tüccarlar burada geceler; her kervanın haberi önce buraya düşer.', 'Travellers and merchants spend the night here; every caravan\'s news lands here first.'),
  market: L('Önünde tezgâhlar kurulur, kervanlar yüklerinin bir kısmını burada bozar.', 'Stalls go up out front, and caravans break part of their loads here.'),
  post: L('Ulaklar ve kervanlar atlarını burada değiştirir; uzak yolların haberi buradan geçer.', 'Couriers and caravans change horses here; news from distant roads passes through.'),
  toll: L('Yoldan geçen yükler burada sayılır; kimin ne taşıdığını en iyi gümrükçü bilir.', 'Every load on the road is counted here; nobody knows who carries what better than the customs man.'),
}

const PLACES = [
  'Akçay', 'Karapınar', 'Yeşilova', 'Kızılkaya', 'Değirmendere', 'Taşköprü', 'Söğütlü', 'Çamlıbel', 'Kuyucak',
  'Eskiyol', 'Gökdere', 'Ilıca', 'Narlı', 'Bozkır', 'Sarıgöl', 'Kavaklı', 'Çınaraltı', 'Ayazma', 'Kurtbeli',
  'Dumanlı', 'Kervanyolu', 'Ulupınar', 'Yelkaya', 'Ardıçlı', 'Saraçlı', 'Kemerli', 'Güvercinlik', 'Boğazağzı',
  'Akpınar', 'Karaağaç', 'Çamlıca', 'Taşlıyurt', 'Yenice', 'Eskikale', 'Kuyulu', 'Sazlıdere', 'Bozdağ',
  'Gökçeova', 'Çeşmeli', 'Kayalı', 'Sarıyar', 'Değirmenli', 'Pınarbaşı', 'Ortaköy', 'Köprübaşı', 'Dereboyu',
  'Yaylacık', 'Elmalı', 'Cevizli', 'Bademli', 'Kırkgöz', 'Beşkonak', 'Kırkpınar', 'Delikkaya', 'Atlıbel',
  'Yalnızçam',
]
const KEEPERS = [
  'Hancı Mehmet', 'Hancı Ayşe', 'Yaşlı Rıza', 'Topal Hasan', 'Kara Fatma', 'Dilsiz Ömer', 'Gezgin Selim',
  'Hatice Kadın', 'Koca Yusuf', 'Ağzı Sıkı Nuri', 'Saz Çalan Kemal', 'Emine Ana',
  'Hancı Zeynep', 'Kel Mahmut', 'Şişman Bekir', 'Hacı Osman', 'Sarı Mustafa', 'Kör Ahmet', 'Fadime Bacı',
  'Deli Durmuş', 'Gözü Pek Halil', 'Topal Şerife', 'İhtiyar Süleyman', 'Kadir Usta',
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
    ? kind === 'market' ? L('Pazar Kervansarayı', 'Market Caravanserai') : L('Kervansarayı', 'Caravanserai')
    : { inn: L('Hanı', 'Inn'), market: L('Pazar Hanı', 'Market Inn'), post: L('Menzilhanesi', 'Post House'), toll: L('Gümrük Hanı', 'Customs House') }[kind]
  return {
    index,
    kind,
    desert,
    name: `${place} ${suffix}`,
    keeper: KEEPERS[Math.floor(hash(inn.x, inn.y, world.seed + 1937) * KEEPERS.length)],
  }
}
