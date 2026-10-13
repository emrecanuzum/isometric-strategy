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
  wall: 'Kuşatmada savunmayı güçlendirir',
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
