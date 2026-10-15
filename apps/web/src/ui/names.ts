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
  warehouse: 'Ambar',
  treasury: 'Hazine',
  fisherHut: 'Esrarengiz balıkçı kulübesi',
  prison: 'Hapishane',
  tavern: 'Eğlence merkezi',
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
  gate: '3 karo: kule, kapı, kule; sur üstüne de kurulur. Köylüler ve tüccar geçer',
  university: 'Araştırma yapar: inşaat kuyruğu, keten, verim',
  hospital: 'Hasta köylüleri iyileştirir',
  temple: 'Mutluluk, askerlere iman; vergi vaazı',
  warehouse: 'Depolara yer açar (yemek, malzeme, savaş malzemesi)',
  treasury: 'Hazineye altın yeri açar',
  fisherHut: 'Kıyıya kurulur; az yemek ve nehirden altın getirir. Tıkla, balık tut',
  prison: 'Kaçırılan kraliçeler burada tutulur; kraliçe kaçırmak için gerekir',
  tavern: 'Bağlı olduğun taç krallığının devriyeleri gelip eğlenir ve bahşiş bırakır'
}

export const UNIT_NAMES: Record<Unit, string> = {
  spear: 'Mızrakçı',
  archer: 'Okçu',
  shield: 'Kalkanlı piyade',
  cavalry: 'Süvari',
  catapult: 'Mancınık',
}

export const UNIT_ICONS: Record<Unit, IconName> = {
  spear: 'arms',
  archer: 'bow',
  shield: 'shield',
  cavalry: 'horse',
  catapult: 'catapult',
}

// What each kind is good for, in a few words.
export const UNIT_NOTES: Record<Unit, string> = {
  spear: 'Süvariyi yener, okçuya yenilir',
  archer: 'Mızrakçıyı yener, süvariye ve kalkanlıya yenilir',
  shield: 'Okçuyu yener, süvariye yenilir; kalkan ve kılıç ister (üniversite: Kalkan duvarı)',
  cavalry: 'Okçuyu ve kalkanlıyı yener, mızrakçıya yenilir; sert vurur',
  catapult: 'Sahada zayıf; kuşatmada surları etkisiz kılar ve yıkar (üniversite: Kuşatma sanatı)',
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

// University studies (institutions.json research), by branch.
export const RESEARCH_CATEGORY_NAMES: Record<string, { name: string; icon: IconName }> = {
  resources: { name: 'Hammadde', icon: 'materials' },
  war: { name: 'Savaş', icon: 'swords' },
  state: { name: 'Devlet', icon: 'crown' },
  faith: { name: 'Din ve halk', icon: 'temple' },
}

export const RESEARCH_NAMES: Record<string, { name: string; note: string; icon: IconName }> = {
  irrigation: { name: 'Sulama', note: 'Tarlalar %25 daha çok ürün verir', icon: 'food' },
  flax: { name: 'Keten tarımı', note: 'Tarlalar keten ekebilir; oduncular %10 daha çok üretir', icon: 'materials' },
  forestry: { name: 'Ormancılık', note: 'Oduncu kampları %25 daha çok üretir', icon: 'materials' },
  fishing: { name: 'Balıkçılık', note: 'İskele %35 daha çok balık tutar', icon: 'food' },
  metallurgy: { name: 'Metalurji', note: 'Silah atölyesi %30 daha çok üretir', icon: 'arms' },
  granaries: { name: 'Ambarcılık', note: 'Depolar %50 daha çok alır', icon: 'chest' },
  shieldwall: { name: 'Kalkan duvarı', note: 'Kışlada kalkanlı piyade yetiştirilir', icon: 'shield' },
  siegecraft: { name: 'Kuşatma sanatı', note: 'Kışlada mancınık yapılır', icon: 'catapult' },
  tactics: { name: 'Savaş taktikleri', note: 'Askerler zara +0,5 ekler', icon: 'swords' },
  fortification: { name: 'İstihkâm', note: 'Kuşatmada sarayın 6 sur fazlasıyla savunur', icon: 'shield' },
  drill: { name: 'Talim', note: 'Askerler iki kat hızlı yetişir', icon: 'people' },
  quartermaster: { name: 'İaşe', note: 'Asker maaşı ve yemeği %35 azalır', icon: 'food' },
  architecture: { name: 'Mimarlık', note: 'Aynı anda bir inşaat daha (3)', icon: 'build' },
  bookkeeping: { name: 'Muhasebe', note: 'Vergiler %20 daha çok altın getirir', icon: 'gold' },
  commerce: { name: 'Ticaret hukuku', note: 'Tüccar %30 daha çok altın getirir', icon: 'trade' },
  diplomacy: { name: 'Diplomasi okulu', note: 'Elçilerin ilişki kazancı %50 artar', icon: 'scroll' },
  spycraft: { name: 'Casusluk okulu', note: 'Karşı casusluk +2', icon: 'eye' },
  lawCode: { name: 'Kanunname', note: 'Mutluluk +6, elçilerin ilişki kazancı %25 artar', icon: 'scroll' },
  medicine: { name: 'Tıp', note: 'Hastalık yarı yarıya azalır, iyileşme hızlanır', icon: 'heal' },
  festivals: { name: 'Şenlikler', note: 'Mutluluk +8', icon: 'happy' },
  theology: { name: 'İlahiyat', note: 'Tapınağın askerlere imanı %60 artar', icon: 'temple' },
  charity: { name: 'Hayır işleri', note: 'Vaazlar iki kat uzun sürer, mutluluk +3', icon: 'heal' },
  holyOath: { name: 'Kutsal yemin', note: 'Askerler zara +0,6 ekler', icon: 'swords' },
  pilgrimage: { name: 'Hac yolu', note: 'Tüccar %15 daha çok altın getirir, mutluluk +5', icon: 'temple' },
}

// Whether a fortune falls on the whole lobby or on the player's kingdom alone.
export const SCOPE_NAMES = { lobby: 'Lobi geneli', kingdom: 'Topraklarına özel' } as const

// Fortunes: random events and what they do (institutions.json events).
export const FORTUNE_TEXTS: Record<string, { title: string; text: string; tone: 'good' | 'bad'; icon: IconName }> = {
  drought: { title: 'Kavurucu güneş', text: 'Güneş bütün diyarı yakıyor; mahsul ve balık %30 az.', tone: 'bad', icon: 'sun' },
  rain: { title: 'Bereketli yağmur', text: 'Yağmur toprağı doyurdu; yemek üretimi %25 fazla.', tone: 'good', icon: 'food' },
  storm: { title: 'Fırtına', text: 'Şiddetli fırtına; yapı malzemesi %20, ticaret geliri %25 az.', tone: 'bad', icon: 'warn' },
  fog: { title: 'Yoğun sis', text: 'Sis yolları kapladı; tüccarlar yolunu şaşırıyor, ticaret geliri %35 az.', tone: 'bad', icon: 'moon' },
  flood: { title: 'Sel', text: 'Nehirler taştı; yemek %25, yapı malzemesi %10 az.', tone: 'bad', icon: 'warn' },
  bountifulSeason: { title: 'Bereket mevsimi', text: 'Toprak cömert; yemek %35, yapı malzemesi %10 fazla.', tone: 'good', icon: 'food' },
  caravanSeason: { title: 'Kervan mevsimi', text: 'Yollar kervanlarla dolu; ticaret geliri %30 fazla.', tone: 'good', icon: 'trade' },
  comet: { title: 'Kuyruklu yıldız', text: 'Gökte bir kuyruklu yıldız; halk bunu uğursuzluğa yoruyor (mutluluk −10).', tone: 'bad', icon: 'star' },
  fullMoon: { title: 'Dolunay şenliği', text: 'Dolunayda halk sokaklarda; mutluluk artıyor (tapınak varsa daha çok).', tone: 'good', icon: 'moon' },
  epidemic: { title: 'Salgın her yerde', text: 'Bir hastalık bütün diyara yayıldı; halkın bir kısmı hastalandı.', tone: 'bad', icon: 'heal' },
  goldRush: { title: 'Altına hücum', text: 'Dağlarda altın bulundu; savaş malzemesi %30 fazla, hazineye küçük bir pay.', tone: 'good', icon: 'gold' },
  plague: { title: 'Salgın baş gösterdi', text: 'Halkın bir kısmı hastalandı. Hastane iyileşmeyi hızlandırır.', tone: 'bad', icon: 'heal' },
  festival: { title: 'Halk şenliği', text: 'Meydanda şenlik var; halkın keyfi yerinde.', tone: 'good', icon: 'happy' },
  forestFire: { title: 'Orman yangını', text: 'Ormanlar yanıyor; yapı malzemesi üretimi %30 az.', tone: 'bad', icon: 'warn' },
  oreVein: { title: 'Yeni maden damarı', text: 'Madenciler zengin bir damar buldu; savaş malzemesi %40 fazla.', tone: 'good', icon: 'arms' },
  merchants: { title: 'Gezgin tüccarlar', text: 'Yabancı tüccarlar kasabada; tüccarın %30 daha çok altın getiriyor.', tone: 'good', icon: 'trade' },
  granaryFire: { title: 'Ambar yangını', text: 'Ambarda yangın çıktı; yemeğin bir kısmı yandı.', tone: 'bad', icon: 'warn' },
  treasure: { title: 'Define bulundu', text: 'Köylüler tarlada eski bir define buldu.', tone: 'good', icon: 'chest' },
  coldSnap: { title: 'Soğuk dalgası', text: 'Ayaz çöktü; hastalık hızla yayılıyor, iş yavaşladı.', tone: 'bad', icon: 'moon' },
  pilgrims: { title: 'Hacılar geldi', text: 'Hacılar kasabadan geçiyor; halk sevindi (tapınak varsa daha çok).', tone: 'good', icon: 'temple' },
  locusts: { title: 'Çekirge istilası', text: 'Gökyüzünü çekirge bulutu kapladı; tarlalar yeniyor, yemek üretimi %30 az.', tone: 'bad', icon: 'food' },
  hailstorm: { title: 'Dolu fırtınası', text: 'Ceviz iriliğinde dolu yağıyor; yemek %15, yapı malzemesi %10 az, ekinin bir kısmı ezilebilir.', tone: 'bad', icon: 'warn' },
  earthquake: { title: 'Deprem', text: 'Yer sarsıldı; duvarlar çatladı, iş yavaşladı ve halk tedirgin (mutluluk −6).', tone: 'bad', icon: 'warn' },
  aurora: { title: 'Kutup ışıkları', text: 'Gece göğünde yeşil ve mor perdeler dalgalanıyor; halk bunu hayra yoruyor.', tone: 'good', icon: 'star' },
  eclipse: { title: 'Güneş tutulması', text: 'Güneş gün ortasında karardı; halk korkuyla göğe bakıyor, iş durdu (mutluluk −8).', tone: 'bad', icon: 'sun' },
  rainbow: { title: 'Gökkuşağı', text: 'Yağmurun ardından ovaya bir gökkuşağı kuruldu; halk sevinçli, toprak cömert.', tone: 'good', icon: 'happy' },
  dragonRumour: { title: 'Ejderha söylentisi', text: 'Hanlarda dağlarda bir ejderha görüldüğü konuşuluyor; tüccarlar yollara çıkmaya çekiniyor.', tone: 'bad', icon: 'eye' },
  royalWedding: { title: 'Taç düğünü', text: 'Taç krallıklarından birinde görkemli bir düğün var; bütün lordlar davetli.', tone: 'good', icon: 'crown' },
  nomads: { title: 'Göçebe çadırları', text: 'Sürüleriyle bir göçebe obası hududuna çadır kurdu; senden misafirlik bekliyorlar.', tone: 'good', icon: 'horse' },
  minstrel: { title: 'Gezgin ozan', text: 'Sazıyla bir ozan meydanda destan okuyor; halk başına toplandı.', tone: 'good', icon: 'music' },
  wolves: { title: 'Kurt sürüsü', text: 'Aç bir kurt sürüsü ağılların çevresinde dolanıyor; sürüler kırılıyor, halk korkuyor.', tone: 'bad', icon: 'warn' },
  mineCollapse: { title: 'Maden göçüğü', text: 'Madende bir galeri çöktü; savaş malzemesi %40 az, madencilerin bazıları yaralı.', tone: 'bad', icon: 'arms' },
  bandits: { title: 'Haydut baskını', text: 'Haydutlar yolları tutmuş, köyleri basıyor; ticaret %25 az, depolar tehlikede.', tone: 'bad', icon: 'swords' },
  lostCaravan: { title: 'Kayıp kervan', text: 'Ormanda yolunu yitirmiş, sahipsiz bir kervan bulundu; yükü sapasağlam.', tone: 'good', icon: 'trade' },
  relic: { title: 'Aziz kalıntısı', text: 'Köylüler eski bir mezarda kutsal bir kalıntı buldu; halk ziyarete akın ediyor.', tone: 'good', icon: 'temple' },
  tournament: { title: 'Şövalye turnuvası', text: 'Meydanda mızrak dövüşü var; lordlar ve halk sancaklar altında toplandı.', tone: 'good', icon: 'banner' },
}

// The answers to a crisis (CLAUDE.md §9.8): what the villagers and the army do against each, and what happens if
// nothing is done.
export const CRISIS_TEXTS: Record<string, { villagers: string; army: string; none: string }> = {
  forestFire: { villagers: 'Köylüler yangın şeridi açsın', army: 'Ordu alevlerle savaşsın', none: 'Ormanlar yanadursun' },
  granaryFire: { villagers: 'Köylüler kova zinciri kursun', army: 'Askerler ambara koşsun', none: 'Ambar yanadursun' },
  plague: { villagers: 'Köylüler hastalara baksın', army: 'Ordu hastalık bölgesini kuşatsın', none: 'Hastalık kendi yoluna gitsin' },
  epidemic: { villagers: 'Köylüler evlerine kapansın', army: 'Ordu yolları tutsun', none: 'Salgın kendi yoluna gitsin' },
  flood: { villagers: 'Köylüler set çeksin', army: 'Ordu seti güçlendirsin', none: 'Su çekilene kadar bekle' },
  storm: { villagers: 'Köylüler damları bağlasın', army: 'Ordu yıkıntıları kaldırsın', none: 'Fırtına dinene kadar bekle' },
  coldSnap: { villagers: 'Köylüler odun toplasın', army: 'Ordu odun taşısın', none: 'Ayaz geçene kadar bekle' },
  locusts: { villagers: 'Köylüler ateş yakıp tencere çalsın', army: 'Ordu tarlaları dumanla korusun', none: 'Çekirgeler doyana kadar bekle' },
  hailstorm: { villagers: 'Köylüler ekinleri örtsün', army: 'Ordu ambarları korusun', none: 'Dolu dinene kadar bekle' },
  earthquake: { villagers: 'Köylüler enkazı kaldırsın', army: 'Ordu yıkıntılarda arama yapsın', none: 'Sarsıntı geçene kadar bekle' },
  wolves: { villagers: 'Köylüler ağılları beklesin', army: 'Ordu sürüyü avlasın', none: 'Kurtlar gidene kadar bekle' },
  mineCollapse: { villagers: 'Köylüler madencileri kazıp çıkarsın', army: 'Ordu galeriye destek çaksın', none: 'Madeni kapat ve bekle' },
  bandits: { villagers: 'Köylüler köyleri savunsun', army: 'Ordu haydutları kovalasın', none: 'Haydutlar gidene kadar bekle' },
}

// The two ways of meeting a choice fortune (CLAUDE.md §9.8; institutions.json events.choice), and what is said once one
// was taken.
export const DILEMMA_TEXTS: Record<string, { a: string; b: string; done: { a: string; b: string } }> = {
  eclipse: { a: 'Tapınakta ayin düzenle', b: 'Bilginler halka anlatsın', done: { a: 'Rahipler dua etti; halk yatıştı.', b: 'Bilginler ayın güneşin önünden geçtiğini anlattı; halk işine döndü.' } },
  dragonRumour: { a: 'Ejderha avcıları tut', b: 'Yollara nöbetçi koy', done: { a: 'Avcılar dağlara çıktı; halk rahatladı.', b: 'Nöbetçiler yolları tutuyor; tüccarlar yeniden yola çıktı.' } },
  royalWedding: { a: 'Görkemli bir armağan gönder', b: 'Düğünü kendi meydanında kutla', done: { a: 'Armağanın düğünde konuşuldu; misafirler pazarına uğruyor.', b: 'Meydanda sofralar kuruldu; halk düğünü kendi kutluyor.' } },
  nomads: { a: 'Obayı konuk et', b: 'Göçebelerle takas yap', done: { a: 'Göçebeler sofrana oturdu; kervanları ticaretine katıldı.', b: 'Kerestene karşılık peynir, yün ve demir aldın.' } },
  minstrel: { a: 'Ozanı saraya davet et', b: 'Meydanda şapka dolaştırılsın', done: { a: 'Ozan sarayda hanedanının destanını okuyor.', b: 'Şapkadan biraz altın çıktı; ama halk biraz bozuldu.' } },
  lostCaravan: { a: 'Yükü depolara al', b: 'Sahiplerine haber sal', done: { a: 'Yük depolarında; halk sahiplerinin ne diyeceğini merak ediyor.', b: 'Sahipleri geldi; hem ödül verdiler hem de pazarına uğruyorlar.' } },
  relic: { a: 'Kalıntıya bir türbe yaptır', b: 'Kalıntıyı pazarda sergile', done: { a: 'Türbe yükseliyor; tapınağa giden yol kalabalık.', b: 'Ziyaretçiler pazarı doldurdu; sadaka kutusu doldu.' } },
  tournament: { a: 'Büyük bir ödül koy', b: 'Halka ziyafet ver', done: { a: 'Ödül için en iyi şövalyeler geldi; meydan coştu.', b: 'Ziyafet sofraları kuruldu; halk karnını doyurup turnuvayı izliyor.' } },
}
