import type { BuildingKind, CalendarDate, Resource, Season, Unit, Weapon } from '@game/shared'
import type { IconName } from './icons'
import { L } from '../lib/i18n'

export const RESOURCE_NAMES: Record<Resource, string> = {
  gold: L('Altın', 'Gold'),
  food: L('Yemek', 'Food'),
  materials: L('Yapı malzemesi', 'Building materials'),
  arms: L('Savaş malzemesi', 'War materials'),
}

export const RESOURCE_ICONS: Record<Resource, IconName> = {
  gold: 'gold',
  food: 'food',
  materials: 'materials',
  arms: 'arms',
}

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  palace: L('Saray', 'Palace'),
  tradePost: L('Ticaret noktası', 'Trading post'),
  house: L('Ev', 'House'),
  farm: L('Tarla', 'Field'),
  lumberCamp: L('Oduncu kampı', 'Lumber camp'),
  forge: L('Silah atölyesi', 'Forge'),
  dock: L('İskele', 'Dock'),
  market: L('Pazar', 'Market'),
  barracks: L('Kışla', 'Barracks'),
  spyHouse: L('Casus evi', 'Spy house'),
  watchtower: L('Gözcü kulesi', 'Watchtower'),
  wall: L('Sur', 'Wall'),
  gate: L('Sur kapısı', 'Gate'),
  road: L('Yol', 'Road'),
  university: L('Üniversite', 'University'),
  hospital: L('Hastane', 'Hospital'),
  temple: L('Tapınak', 'Temple'),
  warehouse: L('Ambar', 'Storehouse'),
  treasury: L('Hazine', 'Treasury'),
  fisherHut: L('Esrarengiz balıkçı kulübesi', 'Mysterious fisherman\'s hut'),
  prison: L('Hapishane', 'Prison'),
  tavern: L('Eğlence merkezi', 'Entertainment hall'),
  shipyard: L('Tersane', 'Shipyard'),
  citadel: L('Hisar', 'Citadel'),
  memorial: L('Hanedan anıtı', 'Dynasty monument'),
  guildHall: L('Lonca konağı', 'Guild hall'),
}

export const BUILDING_NOTES: Partial<Record<BuildingKind, string>> = {
  house: L('Köylülere barınak', 'Shelter for villagers'),
  farm: L('Buğday ya da keten eker', 'Sows wheat or flax'),
  lumberCamp: L('Yapı malzemesi üretir', 'Produces building materials'),
  forge: L('Demir döker ya da silah işler', 'Casts iron or forges weapons'),
  dock: L('Balık tutar (yemek), iskele alanına kurulur', 'Catches fish (food); built on the dock plot'),
  market: L('Altınla hammadde satın alınır', 'Buy raw goods with gold'),
  barracks: L('Savaşçı yetiştirir', 'Trains fighters'),
  spyHouse: L('Casus yetiştirir', 'Trains spies'),
  watchtower: L('Yaklaşan düşmana ok atar', 'Shoots arrows at approaching enemies'),
  wall: L('Köylüleri ve tüccarı da durdurur; kapı bırak', 'Stops villagers and the merchant too; leave a gate'),
  gate: L('3 karo: kule, kapı, kule; sur üstüne de kurulur. Köylüler ve tüccar geçer', '3 tiles: tower, gate, tower; can be built over walls. Villagers and the merchant pass'),
  road: L('Çok ucuz; köylüler, tüccar ve ordular yoldan yürür. Sürükleyerek döşe', 'Very cheap; villagers, the merchant and armies walk on roads. Drag to lay'),
  university: L('Araştırma yapar: inşaat kuyruğu, keten, verim', 'Researches: build queue, flax, yields'),
  hospital: L('Hasta köylüleri iyileştirir', 'Heals sick villagers'),
  temple: L('Mutluluk, askerlere iman; vergi vaazı', 'Happiness, faith for soldiers; tax sermons'),
  warehouse: L('Depolara yer açar (yemek, malzeme, savaş malzemesi)', 'Adds storage (food, materials, war materials)'),
  treasury: L('Hazineye altın yeri açar', 'Adds room for gold in the treasury'),
  fisherHut: L('Kıyıya kurulur; az yemek ve nehirden altın getirir. Tıkla, balık tut', 'Built on the shore; brings a little food and gold from the river. Click to fish'),
  prison: L('Kaçırılan kraliçeler burada tutulur; kraliçe kaçırmak için gerekir', 'Kidnapped queens are kept here; needed to kidnap a queen'),
  tavern: L('Bağlı olduğun taç krallığının devriyeleri gelip eğlenir ve bahşiş bırakır', 'Your crown\'s patrols come to make merry and leave tips'),
  shipyard: L('Kadırga, koka ve çektiri yapar; filolar deniz ticareti, korsan avı ve abluka için çıkar', 'Builds galleys, cogs and raiders; fleets sail for sea trade, pirate hunts and blockades'),
  citadel: L('Saray kuşatmasında savunana zar ve moral, düşen saraya daha uzun kalkan', 'Dice and morale for the defenders in a palace siege; a longer shield when the palace falls'),
  memorial: L('Hanedanın şanı: halkın mutluluğu ve lordluğun puanı artar', 'The dynasty\'s glory: raises happiness and your lordship\'s score'),
  guildHall: L('Tüccar ve deniz ticareti daha pahalıya satar, pazar daha ucuza satar', 'The merchant and sea trade sell dearer; the market sells cheaper'),
}

export const UNIT_NAMES: Record<Unit, string> = {
  spear: L('Mızrakçı', 'Spearman'),
  archer: L('Okçu', 'Archer'),
  shield: L('Kalkanlı piyade', 'Shield infantry'),
  cavalry: L('Süvari', 'Cavalry'),
  catapult: L('Mancınık', 'Catapult'),
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
  spear: L('Süvariyi yener, okçuya yenilir', 'Beats cavalry, loses to archers'),
  archer: L('Mızrakçıyı yener, süvariye ve kalkanlıya yenilir', 'Beats spearmen, loses to cavalry and shield infantry'),
  shield: L('Okçuyu yener, süvariye yenilir; kalkan ve kılıç ister (üniversite: Kalkan duvarı)', 'Beats archers, loses to cavalry; needs shields and swords (university: Shield wall)'),
  cavalry: L('Okçuyu ve kalkanlıyı yener, mızrakçıya yenilir; sert vurur', 'Beats archers and shield infantry, loses to spearmen; hits hard'),
  catapult: L('Sahada zayıf; kuşatmada surları etkisiz kılar ve yıkar (üniversite: Kuşatma sanatı)', 'Weak in the field; in a siege it neutralises and breaks walls (university: Siegecraft)'),
}

export const WEAPON_NAMES: Record<Weapon, string> = {
  sword: L('Kılıç', 'Sword'),
  shield: L('Kalkan', 'Shield'),
  bow: L('Yay ve ok', 'Bow and arrows'),
}

export const WEAPON_ICONS: Record<Weapon, IconName> = {
  sword: 'arms',
  shield: 'shield',
  bow: 'bow',
}

// What a building can be set to make (see BuildingSpec.products).
export const PRODUCT_NAMES: Record<string, string> = {
  wheat: L('Buğday', 'Wheat'),
  flax: L('Keten', 'Flax'),
  iron: L('Demir dökümü', 'Iron casting'),
  sword: L('Kılıç', 'Sword'),
  shield: L('Kalkan', 'Shield'),
  bow: L('Yay ve ok', 'Bow and arrows'),
}

// University studies (institutions.json research), by branch.
export const RESEARCH_CATEGORY_NAMES: Record<string, { name: string; icon: IconName }> = {
  resources: { name: L('Hammadde', 'Raw goods'), icon: 'materials' },
  war: { name: L('Savaş', 'War'), icon: 'swords' },
  state: { name: L('Devlet', 'State'), icon: 'crown' },
  faith: { name: L('Din ve halk', 'Faith and people'), icon: 'temple' },
}

export const RESEARCH_NAMES: Record<string, { name: string; note: string; icon: IconName }> = {
  irrigation: { name: L('Sulama', 'Irrigation'), note: L('Tarlalar %25 daha çok ürün verir', 'Fields yield 25% more'), icon: 'food' },
  flax: { name: L('Keten tarımı', 'Flax farming'), note: L('Tarlalar keten ekebilir; oduncular %10 daha çok üretir', 'Fields can sow flax; lumber camps produce 10% more'), icon: 'materials' },
  forestry: { name: L('Ormancılık', 'Forestry'), note: L('Oduncu kampları %25 daha çok üretir', 'Lumber camps produce 25% more'), icon: 'materials' },
  fishing: { name: L('Balıkçılık', 'Fishing'), note: L('İskele %35 daha çok balık tutar', 'The dock catches 35% more fish'), icon: 'food' },
  metallurgy: { name: L('Metalurji', 'Metallurgy'), note: L('Silah atölyesi %30 daha çok üretir', 'Forges produce 30% more'), icon: 'arms' },
  granaries: { name: L('Ambarcılık', 'Granaries'), note: L('Depolar %50 daha çok alır', 'Stores hold 50% more'), icon: 'chest' },
  shieldwall: { name: L('Kalkan duvarı', 'Shield wall'), note: L('Kışlada kalkanlı piyade yetiştirilir', 'Barracks can train shield infantry'), icon: 'shield' },
  siegecraft: { name: L('Kuşatma sanatı', 'Siegecraft'), note: L('Kışlada mancınık yapılır', 'Barracks can build catapults'), icon: 'catapult' },
  tactics: { name: L('Savaş taktikleri', 'War tactics'), note: L('Askerler zara +0,5 ekler', 'Soldiers add +0.5 to the dice'), icon: 'swords' },
  fortification: { name: L('İstihkâm', 'Fortification'), note: L('Kuşatmada sarayın 6 sur fazlasıyla savunur', 'In a siege your palace defends as if it had 6 more walls'), icon: 'shield' },
  drill: { name: L('Talim', 'Drill'), note: L('Askerler iki kat hızlı yetişir', 'Soldiers train twice as fast'), icon: 'people' },
  quartermaster: { name: L('İaşe', 'Quartermaster'), note: L('Asker maaşı ve yemeği %35 azalır', 'Soldiers\' pay and food fall by 35%'), icon: 'food' },
  architecture: { name: L('Mimarlık', 'Architecture'), note: L('Aynı anda bir inşaat daha (3)', 'One more build at a time (3)'), icon: 'build' },
  bookkeeping: { name: L('Muhasebe', 'Bookkeeping'), note: L('Vergiler %20 daha çok altın getirir', 'Taxes bring 20% more gold'), icon: 'gold' },
  commerce: { name: L('Ticaret hukuku', 'Commercial law'), note: L('Tüccar %30 daha çok altın getirir', 'The merchant brings 30% more gold'), icon: 'trade' },
  diplomacy: { name: L('Diplomasi okulu', 'School of diplomacy'), note: L('Elçilerin ilişki kazancı %50 artar', 'Envoys gain 50% more relations'), icon: 'scroll' },
  spycraft: { name: L('Casusluk okulu', 'School of espionage'), note: L('Karşı casusluk +2', 'Counter-espionage +2'), icon: 'eye' },
  lawCode: { name: L('Kanunname', 'Law code'), note: L('Mutluluk +6, elçilerin ilişki kazancı %25 artar', 'Happiness +6, envoys gain 25% more relations'), icon: 'scroll' },
  medicine: { name: L('Tıp', 'Medicine'), note: L('Hastalık yarı yarıya azalır, iyileşme hızlanır', 'Sickness is halved, recovery is faster'), icon: 'heal' },
  festivals: { name: L('Şenlikler', 'Festivals'), note: L('Mutluluk +8', 'Happiness +8'), icon: 'happy' },
  theology: { name: L('İlahiyat', 'Theology'), note: L('Tapınağın askerlere imanı %60 artar', 'The temple\'s faith for soldiers rises by 60%'), icon: 'temple' },
  charity: { name: L('Hayır işleri', 'Charity'), note: L('Vaazlar iki kat uzun sürer, mutluluk +3', 'Sermons last twice as long, happiness +3'), icon: 'heal' },
  holyOath: { name: L('Kutsal yemin', 'Holy oath'), note: L('Askerler zara +0,6 ekler', 'Soldiers add +0.6 to the dice'), icon: 'swords' },
  pilgrimage: { name: L('Hac yolu', 'Pilgrim road'), note: L('Tüccar %15 daha çok altın getirir, mutluluk +5', 'The merchant brings 15% more gold, happiness +5'), icon: 'temple' },
}

// Whether a fortune falls on the whole lobby or on the player's kingdom alone.
export const SCOPE_NAMES = { lobby: L('Lobi geneli', 'Lobby-wide'), kingdom: L('Topraklarına özel', 'Your lands only') } as const

// Fortunes: random events and what they do (institutions.json events).
export const FORTUNE_TEXTS: Record<string, { title: string; text: string; tone: 'good' | 'bad'; icon: IconName }> = {
  drought: { title: L('Kavurucu güneş', 'Scorching sun'), text: L('Güneş bütün diyarı yakıyor; mahsul ve balık %30 az.', 'The sun is scorching the whole land; crops and fish 30% lower.'), tone: 'bad', icon: 'sun' },
  rain: { title: L('Bereketli yağmur', 'Bountiful rain'), text: L('Yağmur toprağı doyurdu; yemek üretimi %25 fazla.', 'The rain has sated the soil; food production 25% higher.'), tone: 'good', icon: 'food' },
  storm: { title: L('Fırtına', 'Storm'), text: L('Şiddetli fırtına; yapı malzemesi %20, ticaret geliri %25 az.', 'A fierce storm; building materials 20% and trade income 25% lower.'), tone: 'bad', icon: 'warn' },
  fog: { title: L('Yoğun sis', 'Thick fog'), text: L('Sis yolları kapladı; tüccarlar yolunu şaşırıyor, ticaret geliri %35 az.', 'Fog covers the roads; merchants lose their way, trade income 35% lower.'), tone: 'bad', icon: 'moon' },
  flood: { title: L('Sel', 'Flood'), text: L('Nehirler taştı; yemek %25, yapı malzemesi %10 az.', 'The rivers have burst their banks; food 25% and building materials 10% lower.'), tone: 'bad', icon: 'warn' },
  bountifulSeason: { title: L('Bereket mevsimi', 'Season of plenty'), text: L('Toprak cömert; yemek %35, yapı malzemesi %10 fazla.', 'The land is generous; food 35% and building materials 10% higher.'), tone: 'good', icon: 'food' },
  caravanSeason: { title: L('Kervan mevsimi', 'Caravan season'), text: L('Yollar kervanlarla dolu; ticaret geliri %30 fazla.', 'The roads are full of caravans; trade income 30% higher.'), tone: 'good', icon: 'trade' },
  comet: { title: L('Kuyruklu yıldız', 'Comet'), text: L('Gökte bir kuyruklu yıldız; halk bunu uğursuzluğa yoruyor (mutluluk −10).', 'A comet in the sky; the people take it for an ill omen (happiness −10).'), tone: 'bad', icon: 'star' },
  fullMoon: { title: L('Dolunay şenliği', 'Full moon festival'), text: L('Dolunayda halk sokaklarda; mutluluk artıyor (tapınak varsa daha çok).', 'The people are out under the full moon; happiness rises (more with a temple).'), tone: 'good', icon: 'moon' },
  epidemic: { title: L('Salgın her yerde', 'Epidemic everywhere'), text: L('Bir hastalık bütün diyara yayıldı; halkın bir kısmı hastalandı.', 'A sickness has spread across the whole land; some of the people have fallen ill.'), tone: 'bad', icon: 'heal' },
  goldRush: { title: L('Altına hücum', 'Gold rush'), text: L('Dağlarda altın bulundu; savaş malzemesi %30 fazla, hazineye küçük bir pay.', 'Gold found in the mountains; war materials 30% higher, and a small share for the treasury.'), tone: 'good', icon: 'gold' },
  plague: { title: L('Salgın baş gösterdi', 'Plague breaks out'), text: L('Halkın bir kısmı hastalandı. Hastane iyileşmeyi hızlandırır.', 'Some of the people have fallen ill. A hospital speeds recovery.'), tone: 'bad', icon: 'heal' },
  festival: { title: L('Halk şenliği', 'Folk festival'), text: L('Meydanda şenlik var; halkın keyfi yerinde.', 'There\'s a festival in the square; the people are in fine spirits.'), tone: 'good', icon: 'happy' },
  forestFire: { title: L('Orman yangını', 'Forest fire'), text: L('Ormanlar yanıyor; yapı malzemesi üretimi %30 az.', 'The forests are burning; building materials production 30% lower.'), tone: 'bad', icon: 'warn' },
  oreVein: { title: L('Yeni maden damarı', 'New ore vein'), text: L('Madenciler zengin bir damar buldu; savaş malzemesi %40 fazla.', 'The miners have struck a rich vein; war materials 40% higher.'), tone: 'good', icon: 'arms' },
  merchants: { title: L('Gezgin tüccarlar', 'Travelling merchants'), text: L('Yabancı tüccarlar kasabada; tüccarın %30 daha çok altın getiriyor.', 'Foreign merchants are in town; your merchant brings 30% more gold.'), tone: 'good', icon: 'trade' },
  granaryFire: { title: L('Ambar yangını', 'Storehouse fire'), text: L('Ambarda yangın çıktı; yemeğin bir kısmı yandı.', 'Fire broke out in the storehouse; some of the food has burned.'), tone: 'bad', icon: 'warn' },
  treasure: { title: L('Define bulundu', 'Treasure found'), text: L('Köylüler tarlada eski bir define buldu.', 'Villagers found an old treasure in a field.'), tone: 'good', icon: 'chest' },
  coldSnap: { title: L('Soğuk dalgası', 'Cold snap'), text: L('Ayaz çöktü; hastalık hızla yayılıyor, iş yavaşladı.', 'A hard frost has set in; sickness spreads fast, work has slowed.'), tone: 'bad', icon: 'moon' },
  pilgrims: { title: L('Hacılar geldi', 'Pilgrims arrive'), text: L('Hacılar kasabadan geçiyor; halk sevindi (tapınak varsa daha çok).', 'Pilgrims are passing through; the people are glad (more with a temple).'), tone: 'good', icon: 'temple' },
  locusts: { title: L('Çekirge istilası', 'Locust swarm'), text: L('Gökyüzünü çekirge bulutu kapladı; tarlalar yeniyor, yemek üretimi %30 az.', 'A cloud of locusts darkens the sky; the fields are being eaten, food production 30% lower.'), tone: 'bad', icon: 'food' },
  hailstorm: { title: L('Dolu fırtınası', 'Hailstorm'), text: L('Ceviz iriliğinde dolu yağıyor; yemek %15, yapı malzemesi %10 az, ekinin bir kısmı ezilebilir.', 'Hail the size of walnuts is falling; food 15% and building materials 10% lower, and some crops may be crushed.'), tone: 'bad', icon: 'warn' },
  earthquake: { title: L('Deprem', 'Earthquake'), text: L('Yer sarsıldı; duvarlar çatladı, iş yavaşladı ve halk tedirgin (mutluluk −6).', 'The ground shook; walls cracked, work slowed and the people are uneasy (happiness −6).'), tone: 'bad', icon: 'warn' },
  aurora: { title: L('Kutup ışıkları', 'Northern lights'), text: L('Gece göğünde yeşil ve mor perdeler dalgalanıyor; halk bunu hayra yoruyor.', 'Green and purple curtains ripple across the night sky; the people take it for a good omen.'), tone: 'good', icon: 'star' },
  eclipse: { title: L('Güneş tutulması', 'Solar eclipse'), text: L('Güneş gün ortasında karardı; halk korkuyla göğe bakıyor, iş durdu (mutluluk −8).', 'The sun went dark at midday; the people stare at the sky in fear, work has stopped (happiness −8).'), tone: 'bad', icon: 'sun' },
  rainbow: { title: L('Gökkuşağı', 'Rainbow'), text: L('Yağmurun ardından ovaya bir gökkuşağı kuruldu; halk sevinçli, toprak cömert.', 'After the rain a rainbow arches over the plain; the people are joyful, the land generous.'), tone: 'good', icon: 'happy' },
  dragonRumour: { title: L('Ejderha söylentisi', 'Dragon rumour'), text: L('Hanlarda dağlarda bir ejderha görüldüğü konuşuluyor; tüccarlar yollara çıkmaya çekiniyor.', 'The inns are abuzz with talk of a dragon seen in the mountains; merchants are wary of the roads.'), tone: 'bad', icon: 'eye' },
  royalWedding: { title: L('Taç düğünü', 'Royal wedding'), text: L('Taç krallıklarından birinde görkemli bir düğün var; bütün lordlar davetli.', 'One of the crown kingdoms is holding a splendid wedding; every lord is invited.'), tone: 'good', icon: 'crown' },
  nomads: { title: L('Göçebe çadırları', 'Nomad tents'), text: L('Sürüleriyle bir göçebe obası hududuna çadır kurdu; senden misafirlik bekliyorlar.', 'A nomad clan has pitched its tents on your border with its herds; they expect your hospitality.'), tone: 'good', icon: 'horse' },
  minstrel: { title: L('Gezgin ozan', 'Wandering minstrel'), text: L('Sazıyla bir ozan meydanda destan okuyor; halk başına toplandı.', 'A minstrel with his saz is reciting epics in the square; the people have gathered round.'), tone: 'good', icon: 'music' },
  wolves: { title: L('Kurt sürüsü', 'Wolf pack'), text: L('Aç bir kurt sürüsü ağılların çevresinde dolanıyor; sürüler kırılıyor, halk korkuyor.', 'A hungry wolf pack prowls the folds; flocks are being killed, the people are afraid.'), tone: 'bad', icon: 'warn' },
  mineCollapse: { title: L('Maden göçüğü', 'Mine collapse'), text: L('Madende bir galeri çöktü; savaş malzemesi %40 az, madencilerin bazıları yaralı.', 'A gallery has collapsed in the mine; war materials 40% lower, some miners are hurt.'), tone: 'bad', icon: 'arms' },
  bandits: { title: L('Haydut baskını', 'Bandit raid'), text: L('Haydutlar yolları tutmuş, köyleri basıyor; ticaret %25 az, depolar tehlikede.', 'Bandits hold the roads and raid the villages; trade 25% lower, the stores are in danger.'), tone: 'bad', icon: 'swords' },
  lostCaravan: { title: L('Kayıp kervan', 'Lost caravan'), text: L('Ormanda yolunu yitirmiş, sahipsiz bir kervan bulundu; yükü sapasağlam.', 'An ownerless caravan, lost in the forest, has been found; its load is intact.'), tone: 'good', icon: 'trade' },
  relic: { title: L('Aziz kalıntısı', 'Saint\'s relic'), text: L('Köylüler eski bir mezarda kutsal bir kalıntı buldu; halk ziyarete akın ediyor.', 'Villagers found a holy relic in an old tomb; people flock to see it.'), tone: 'good', icon: 'temple' },
  tournament: { title: L('Şövalye turnuvası', 'Knights\' tournament'), text: L('Meydanda mızrak dövüşü var; lordlar ve halk sancaklar altında toplandı.', 'There\'s jousting in the square; lords and commoners gather under the banners.'), tone: 'good', icon: 'banner' },
  scholar: { title: L('Gezgin bilgin', 'Wandering scholar'), text: L('Heybesi kitap dolu bir bilgin kapına geldi; bilgisini satmaya hazır.', 'A scholar with a satchel full of books is at your door, ready to sell his learning.'), tone: 'good', icon: 'book' },
  festivalRequest: { title: L('Halk şenlik istiyor', 'The people want a festival'), text: L('Köylüler meydanda toplandı: hasat bitti, bir şenlik istiyorlar. Halk biraz söyleniyor.', 'The villagers have gathered in the square: the harvest is in and they want a festival. There is some grumbling.'), tone: 'bad', icon: 'music' },
  lostChild: { title: L('Kayıp soylu çocuğu', 'Lost noble child'), text: L('Yoldan geçen bir soylunun çocuğu ormanda kayboldu; ailesi yardım dileniyor.', 'A passing noble\'s child has gone missing in the forest; the family begs for help.'), tone: 'bad', icon: 'eye' },
  rareMerchant: { title: L('Nadir mallar tüccarı', 'Rare goods merchant'), text: L('Uzak diyarlardan bir tüccar kapında: elinde iyi demir var, keresteye de alıcı.', 'A merchant from distant lands is at your door: he has good iron, and he\'ll buy timber too.'), tone: 'good', icon: 'trade' },
  strayHerd: { title: L('Sahipsiz sürü', 'Stray flock'), text: L('Çobansız bir koyun sürüsü tarlalarına girdi.', 'A flock of sheep without a shepherd has wandered into your fields.'), tone: 'good', icon: 'food' },
  harvestFair: { title: L('Hasat panayırı', 'Harvest fair'), text: L('Komşu köylerden gelenlerle hasat panayırı kuruldu; pazar canlı, halk neşeli.', 'A harvest fair has sprung up with folk from the neighbouring villages; the market is lively, the people merry.'), tone: 'good', icon: 'trade' },
  refugees: { title: L('Göçmen aileler', 'Refugee families'), text: L('Savaştan kaçan birkaç aile hududuna sığındı; yurt arıyorlar.', 'Several families fleeing war have sought refuge on your border; they are looking for a home.'), tone: 'bad', icon: 'people' },
}

// Stores left brimming struck by rats, rot and rust (CLAUDE.md §9.8; institutions.json events.hoard).
export const HOARD_TEXTS: Record<string, { title: string; text: string }> = {
  rats: { title: L('Ambar fareleri', 'Storehouse rats'), text: L('Ağzına kadar dolu ambarlara fareler dadandı; çuvallar delik deşik.', 'Rats have found the brimming storehouses; the sacks are riddled with holes.') },
  rot: { title: L('Rutubet ve kurt', 'Damp and woodworm'), text: L('Üst üste yığılan keresteyi rutubet ve kurt sardı.', 'Damp and woodworm have got into the stacked timber.') },
  rust: { title: L('Pas ve küf', 'Rust and mould'), text: L('Tıka basa dolu cephane depolarında demir paslandı, deri küflendi.', 'In the crammed armouries the iron has rusted and the leather gone mouldy.') },
}

// The answers to a crisis (CLAUDE.md §9.8): what the villagers and the army do against each, and what happens if
// nothing is done.
export const CRISIS_TEXTS: Record<string, { villagers: string; army: string; none: string }> = {
  forestFire: { villagers: L('Köylüler yangın şeridi açsın', 'Villagers cut a firebreak'), army: L('Ordu alevlerle savaşsın', 'The army fights the flames'), none: L('Ormanlar yanadursun', 'Let the forests burn') },
  granaryFire: { villagers: L('Köylüler kova zinciri kursun', 'Villagers form a bucket chain'), army: L('Askerler ambara koşsun', 'Soldiers rush to the storehouse'), none: L('Ambar yanadursun', 'Let the storehouse burn') },
  plague: { villagers: L('Köylüler hastalara baksın', 'Villagers tend the sick'), army: L('Ordu hastalık bölgesini kuşatsın', 'The army cordons off the sickness'), none: L('Hastalık kendi yoluna gitsin', 'Let the sickness run its course') },
  epidemic: { villagers: L('Köylüler evlerine kapansın', 'Villagers shut themselves in'), army: L('Ordu yolları tutsun', 'The army holds the roads'), none: L('Salgın kendi yoluna gitsin', 'Let the epidemic run its course') },
  flood: { villagers: L('Köylüler set çeksin', 'Villagers build a levee'), army: L('Ordu seti güçlendirsin', 'The army shores up the levee'), none: L('Su çekilene kadar bekle', 'Wait for the water to recede') },
  storm: { villagers: L('Köylüler damları bağlasın', 'Villagers tie down the roofs'), army: L('Ordu yıkıntıları kaldırsın', 'The army clears the debris'), none: L('Fırtına dinene kadar bekle', 'Wait for the storm to pass') },
  coldSnap: { villagers: L('Köylüler odun toplasın', 'Villagers gather firewood'), army: L('Ordu odun taşısın', 'The army hauls firewood'), none: L('Ayaz geçene kadar bekle', 'Wait for the frost to pass') },
  locusts: { villagers: L('Köylüler ateş yakıp tencere çalsın', 'Villagers light fires and bang pots'), army: L('Ordu tarlaları dumanla korusun', 'The army smokes the fields'), none: L('Çekirgeler doyana kadar bekle', 'Wait for the locusts to eat their fill') },
  hailstorm: { villagers: L('Köylüler ekinleri örtsün', 'Villagers cover the crops'), army: L('Ordu ambarları korusun', 'The army guards the storehouses'), none: L('Dolu dinene kadar bekle', 'Wait for the hail to stop') },
  earthquake: { villagers: L('Köylüler enkazı kaldırsın', 'Villagers clear the rubble'), army: L('Ordu yıkıntılarda arama yapsın', 'The army searches the ruins'), none: L('Sarsıntı geçene kadar bekle', 'Wait for the tremors to pass') },
  wolves: { villagers: L('Köylüler ağılları beklesin', 'Villagers guard the folds'), army: L('Ordu sürüyü avlasın', 'The army hunts the pack'), none: L('Kurtlar gidene kadar bekle', 'Wait for the wolves to leave') },
  mineCollapse: { villagers: L('Köylüler madencileri kazıp çıkarsın', 'Villagers dig the miners out'), army: L('Ordu galeriye destek çaksın', 'The army props up the gallery'), none: L('Madeni kapat ve bekle', 'Close the mine and wait') },
  bandits: { villagers: L('Köylüler köyleri savunsun', 'Villagers defend the villages'), army: L('Ordu haydutları kovalasın', 'The army chases the bandits'), none: L('Haydutlar gidene kadar bekle', 'Wait for the bandits to leave') },
}

// The two ways of meeting a choice fortune (CLAUDE.md §9.8; institutions.json events.choice), and what is said once one
// was taken.
export const DILEMMA_TEXTS: Record<string, { a: string; b: string; done: { a: string; b: string } }> = {
  eclipse: { a: L('Tapınakta ayin düzenle', 'Hold a rite at the temple'), b: L('Bilginler halka anlatsın', 'Have scholars explain it to the people'), done: { a: L('Rahipler dua etti; halk yatıştı.', 'The priests prayed; the people calmed down.'), b: L('Bilginler ayın güneşin önünden geçtiğini anlattı; halk işine döndü.', 'The scholars explained the moon passed before the sun; the people went back to work.') } },
  dragonRumour: { a: L('Ejderha avcıları tut', 'Hire dragon hunters'), b: L('Yollara nöbetçi koy', 'Post sentries on the roads'), done: { a: L('Avcılar dağlara çıktı; halk rahatladı.', 'The hunters set off for the mountains; the people breathe easier.'), b: L('Nöbetçiler yolları tutuyor; tüccarlar yeniden yola çıktı.', 'Sentries hold the roads; the merchants are travelling again.') } },
  royalWedding: { a: L('Görkemli bir armağan gönder', 'Send a splendid gift'), b: L('Düğünü kendi meydanında kutla', 'Celebrate the wedding in your own square'), done: { a: L('Armağanın düğünde konuşuldu; misafirler pazarına uğruyor.', 'Your gift was the talk of the wedding; guests are visiting your market.'), b: L('Meydanda sofralar kuruldu; halk düğünü kendi kutluyor.', 'Tables are laid in the square; the people celebrate the wedding themselves.') } },
  nomads: { a: L('Obayı konuk et', 'Host the clan'), b: L('Göçebelerle takas yap', 'Trade with the nomads'), done: { a: L('Göçebeler sofrana oturdu; kervanları ticaretine katıldı.', 'The nomads sat at your table; their caravans joined your trade.'), b: L('Kerestene karşılık peynir, yün ve demir aldın.', 'You got cheese, wool and iron for your timber.') } },
  minstrel: { a: L('Ozanı saraya davet et', 'Invite the minstrel to the palace'), b: L('Meydanda şapka dolaştırılsın', 'Pass the hat round the square'), done: { a: L('Ozan sarayda hanedanının destanını okuyor.', 'The minstrel recites your dynasty\'s epic at the palace.'), b: L('Şapkadan biraz altın çıktı; ama halk biraz bozuldu.', 'The hat came back with some gold; but the people were a little put out.') } },
  lostCaravan: { a: L('Yükü depolara al', 'Take the load into your stores'), b: L('Sahiplerine haber sal', 'Send word to the owners'), done: { a: L('Yük depolarında; halk sahiplerinin ne diyeceğini merak ediyor.', 'The load is in your stores; the people wonder what its owners will say.'), b: L('Sahipleri geldi; hem ödül verdiler hem de pazarına uğruyorlar.', 'The owners came; they paid a reward and now visit your market.') } },
  relic: { a: L('Kalıntıya bir türbe yaptır', 'Build a shrine for the relic'), b: L('Kalıntıyı pazarda sergile', 'Display the relic at the market'), done: { a: L('Türbe yükseliyor; tapınağa giden yol kalabalık.', 'The shrine is rising; the road to the temple is crowded.'), b: L('Ziyaretçiler pazarı doldurdu; sadaka kutusu doldu.', 'Visitors fill the market; the alms box is full.') } },
  tournament: { a: L('Büyük bir ödül koy', 'Offer a grand prize'), b: L('Halka ziyafet ver', 'Feast the people'), done: { a: L('Ödül için en iyi şövalyeler geldi; meydan coştu.', 'The finest knights came for the prize; the square went wild.'), b: L('Ziyafet sofraları kuruldu; halk karnını doyurup turnuvayı izliyor.', 'The feast tables are laid; the people eat their fill and watch the tournament.') } },
  scholar: { a: L('Üniversitende ağırla', 'Host him at your university'), b: L('Halka okuma yazma öğretsin', 'Have him teach the people to read'), done: { a: L('Bilgin hocalarına yol gösterdi; süren araştırma hızlandı.', 'The scholar guided your masters; the current research sped up.'), b: L('Meydanda dersler başladı; halk memnun.', 'Lessons have begun in the square; the people are pleased.') } },
  festivalRequest: { a: L('Şenliği sen düzenle', 'Hold the festival yourself'), b: L('Hasat sonrasına ertele', 'Put it off until after the harvest'), done: { a: L('Meydanda davullar çalıyor; halk bayram ediyor.', 'Drums beat in the square; the people are celebrating.'), b: L('Halk söylene söylene işine döndü; tarlalar boş kalmadı.', 'The people went back to work grumbling; the fields were not left idle.') } },
  lostChild: { a: L('Arama ekipleri çıkar', 'Send out search parties'), b: L('Ödül ilan et', 'Announce a reward'), done: { a: L('Köylüler ormanı taradı ve çocuğu buldu; ailesi seni ödüllendirdi.', 'The villagers combed the forest and found the child; the family rewarded you.'), b: L('Avcılar ödül için ormana daldı; çocuk annesine kavuştu, adın dilden dile dolaşıyor.', 'Hunters plunged into the forest for the reward; the child is back with its mother, and your name is on every tongue.') } },
  rareMerchant: { a: L('Demirini satın al', 'Buy his iron'), b: L('Kerestemizi sat', 'Sell our timber'), done: { a: L('Demir çubuklar cephaneye taşındı.', 'The iron bars were carried to the armoury.'), b: L('Tüccar keresteni yükleyip altınını saydı.', 'The merchant loaded your timber and counted out the gold.') } },
  strayHerd: { a: L('Sürüyü ağıla kat', 'Add the flock to your folds'), b: L('Sahibini bul', 'Find the owner'), done: { a: L('Koyunlar ağılda; komşular biraz kırgın.', 'The sheep are in your fold; the neighbours are a little sore.'), b: L('Sahibi bulundu; dürüstlüğün pazarda konuşuluyor.', 'The owner was found; your honesty is the talk of the market.') } },
  refugees: { a: L('Kapıları aç', 'Open the gates'), b: L('Azık verip yollarını gönder', 'Give them provisions and send them on'), done: { a: L('Aileler boş evlere yerleşti.', 'The families settled into empty houses.'), b: L('Aileler azıklarını alıp teşekkür ederek yollarına devam etti.', 'The families took their provisions, thanked you and went on their way.') } },
  comet: { a: L('Müneccimleri çağır', 'Summon the astrologers'), b: L('Halka ziyafet ver', 'Feast the people'), done: { a: L('Müneccimler yıldızın bolluk getireceğini söyledi; halk yatıştı.', 'The astrologers declared the star a harbinger of plenty; the people calmed down.'), b: L('Sofralar kuruldu; halk korkusunu unuttu.', 'Tables were laid; the people forgot their fear.') } },
}

// The calendar (CLAUDE.md §2): month names, long and short, the seasons and how a date is written.
export const MONTH_NAMES = L('Ocak,Şubat,Mart,Nisan,Mayıs,Haziran,Temmuz,Ağustos,Eylül,Ekim,Kasım,Aralık', 'January,February,March,April,May,June,July,August,September,October,November,December').split(',')
export const MONTH_SHORT = L('Oca,Şub,Mar,Nis,May,Haz,Tem,Ağu,Eyl,Eki,Kas,Ara', 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec').split(',')

export const SEASON_NAMES: Record<Season, string> = { spring: L('İlkbahar', 'Spring'), summer: L('Yaz', 'Summer'), autumn: L('Sonbahar', 'Autumn'), winter: L('Kış', 'Winter') }
export const SEASON_ICONS: Record<Season, IconName> = { spring: 'flower', summer: 'sun', autumn: 'leaf', winter: 'snow' }

// "14 Mayıs 1182"; short: "14 May 1182"; without the year: "14 Mayıs".
export const dateText = (c: Pick<CalendarDate, 'year' | 'month' | 'day'>, form: 'long' | 'short' | 'day' = 'long') =>
  form === 'day' ? `${c.day} ${MONTH_NAMES[c.month]}` : `${c.day} ${(form === 'short' ? MONTH_SHORT : MONTH_NAMES)[c.month]} ${c.year}`
