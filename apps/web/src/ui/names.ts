import type { BuildingKind, Resource, Unit, Weapon } from '@game/shared'
import type { IconName } from './icons'

export const RESOURCE_NAMES: Record<Resource, string> = {
  gold: 'Altın',
  food: 'Yemek',
  materials: 'Yapı malzemesi',
  arms: 'Savaş malzemesi',
}

export const RESOURCE_ICONS: Record<Resource, IconName> = {
  gold: 'gold',
  food: 'food',
  materials: 'materials',
  arms: 'arms',
}

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  palace: 'Saray',
  tradePost: 'Ticaret noktası',
  house: 'Ev',
  farm: 'Tarla',
  lumberCamp: 'Oduncu kampı',
  forge: 'Silah atölyesi',
  dock: 'İskele',
  market: 'Pazar',
  barracks: 'Kışla',
  spyHouse: 'Casus evi',
  watchtower: 'Gözcü kulesi',
  wall: 'Sur',
  gate: 'Sur kapısı',
  university: 'Üniversite',
  hospital: 'Hastane',
  temple: 'Tapınak',
}

export const BUILDING_NOTES: Partial<Record<BuildingKind, string>> = {
  house: 'Köylülere barınak',
  farm: 'Buğday ya da keten eker',
  lumberCamp: 'Yapı malzemesi üretir',
  forge: 'Demir döker ya da silah işler',
  dock: 'Balık tutar (yemek), iskele alanına kurulur',
  market: 'Altınla hammadde satın alınır',
  barracks: 'Savaşçı yetiştirir',
  spyHouse: 'Casus yetiştirir',
  watchtower: 'Yaklaşan düşmana ok atar',
  wall: 'Köylüleri ve tüccarı da durdurur; kapı bırak',
  gate: 'Köylüler ve tüccar geçer; kuşatmada sur sayılır',
  university: 'Araştırma yapar: inşaat kuyruğu, keten, verim',
  hospital: 'Hasta köylüleri iyileştirir',
  temple: 'Mutluluk, askerlere iman; vergi vaazı',
}

export const UNIT_NAMES: Record<Unit, string> = {
  spear: 'Mızrakçı',
  archer: 'Okçu',
  cavalry: 'Süvari',
  catapult: 'Mancınık',
}

export const UNIT_ICONS: Record<Unit, IconName> = {
  spear: 'arms',
  archer: 'bow',
  cavalry: 'horse',
  catapult: 'catapult',
}

// What each kind is good for, in a few words.
export const UNIT_NOTES: Record<Unit, string> = {
  spear: 'Süvariyi yener, okçuya yenilir',
  archer: 'Mızrakçıyı yener, süvariye yenilir',
  cavalry: 'Okçuyu yener, mızrakçıya yenilir; sert vurur',
  catapult: 'Sahada zayıf; kuşatmada surları etkisiz kılar ve yıkar',
}

export const WEAPON_NAMES: Record<Weapon, string> = {
  sword: 'Kılıç',
  shield: 'Kalkan',
  bow: 'Yay ve ok',
}

export const WEAPON_ICONS: Record<Weapon, IconName> = {
  sword: 'arms',
  shield: 'shield',
  bow: 'bow',
}

// What a building can be set to make (see BuildingSpec.products).
export const PRODUCT_NAMES: Record<string, string> = {
  wheat: 'Buğday',
  flax: 'Keten',
  iron: 'Demir dökümü',
  sword: 'Kılıç',
  shield: 'Kalkan',
  bow: 'Yay ve ok',
}

// University studies (institutions.json research).
export const RESEARCH_NAMES: Record<string, { name: string; note: string; icon: IconName }> = {
  architecture: { name: 'Mimarlık', note: 'Aynı anda bir inşaat daha (3)', icon: 'build' },
  flax: { name: 'Keten tarımı', note: 'Tarlalar keten ekebilir (yapı malzemesi)', icon: 'materials' },
  irrigation: { name: 'Sulama', note: 'Tarlalar %20 daha çok ürün verir', icon: 'food' },
  fishing: { name: 'Balıkçılık', note: 'İskele %25 daha çok balık tutar', icon: 'food' },
  forestry: { name: 'Ormancılık', note: 'Oduncu kampları %20 daha çok üretir', icon: 'materials' },
  metallurgy: { name: 'Metalurji', note: 'Silah atölyesi %20 daha çok üretir', icon: 'arms' },
  medicine: { name: 'Tıp', note: 'Hastalık yarı yarıya azalır, iyileşme hızlanır', icon: 'heal' },
  bookkeeping: { name: 'Muhasebe', note: 'Vergiler %15 daha çok altın getirir', icon: 'gold' },
  tactics: { name: 'Savaş taktikleri', note: 'Askerler zara +0,5 ekler', icon: 'swords' },
  commerce: { name: 'Ticaret hukuku', note: 'Tüccar %25 daha çok altın getirir', icon: 'trade' },
}

// Fortunes: random events and what they do (institutions.json events).
export const FORTUNE_TEXTS: Record<string, { title: string; text: string; tone: 'good' | 'bad'; icon: IconName }> = {
  drought: { title: 'Kavurucu güneş', text: 'Bugün güneş yakıyor; mahsul ve balık %30 az.', tone: 'bad', icon: 'sun' },
  rain: { title: 'Bereketli yağmur', text: 'Yağmur toprağı doyurdu; yemek üretimi %25 fazla.', tone: 'good', icon: 'food' },
  plague: { title: 'Salgın baş gösterdi', text: 'Halkın bir kısmı hastalandı. Hastane iyileşmeyi hızlandırır.', tone: 'bad', icon: 'heal' },
  festival: { title: 'Halk şenliği', text: 'Meydanda şenlik var; halkın keyfi yerinde.', tone: 'good', icon: 'happy' },
  forestFire: { title: 'Orman yangını', text: 'Ormanlar yanıyor; yapı malzemesi üretimi %30 az.', tone: 'bad', icon: 'warn' },
  oreVein: { title: 'Yeni maden damarı', text: 'Madenciler zengin bir damar buldu; savaş malzemesi %40 fazla.', tone: 'good', icon: 'arms' },
  merchants: { title: 'Gezgin tüccarlar', text: 'Yabancı tüccarlar kasabada; tüccarın %30 daha çok altın getiriyor.', tone: 'good', icon: 'trade' },
  granaryFire: { title: 'Ambar yangını', text: 'Ambarda yangın çıktı; yemeğin bir kısmı yandı.', tone: 'bad', icon: 'warn' },
  treasure: { title: 'Define bulundu', text: 'Köylüler tarlada eski bir define buldu.', tone: 'good', icon: 'chest' },
  coldSnap: { title: 'Soğuk dalgası', text: 'Ayaz çöktü; hastalık hızla yayılıyor, iş yavaşladı.', tone: 'bad', icon: 'moon' },
  pilgrims: { title: 'Hacılar geldi', text: 'Hacılar kasabadan geçiyor; halk sevindi (tapınak varsa daha çok).', tone: 'good', icon: 'temple' },
}
