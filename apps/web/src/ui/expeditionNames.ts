import { L, locale } from '../lib/i18n'
import type { IconName } from './icons'

// What the expeditions, the things that befall them and the season's goals are called (CLAUDE.md §9.9).

export const EXPEDITION_TEXTS: Record<string, { name: string; short: string; icon: IconName; text: string; road: string }> = {
  hunt: {
    name: L('Avcılar ormana', 'Hunters to the forest'),
    short: L('Av seferi', 'Hunt'),
    icon: 'bow',
    text: L('Birkaç köylü yay ve tuzaklarla ormana gider; et, yaban meyvesi ve post getirir.', 'A few villagers head into the forest with bows and snares; they bring back meat, wild fruit and pelts.'),
    road: L('Avcılar ormanın derinliklerinde iz sürüyor.', 'The hunters are tracking deep in the forest.'),
  },
  explore: {
    name: L('Kâşifler dağlara', 'Explorers to the mountains'),
    short: L('Keşif seferi', 'Exploration'),
    icon: 'eye',
    text: L('Kâşifler dağ geçitlerini ve mağaraları dolaşır; demir cevheri, bazen eski bir harabe ve dünyadan haberler getirir.', 'The explorers roam mountain passes and caves; they bring back iron ore, sometimes an old ruin, and news of the world.'),
    road: L('Kâşifler karlı geçitlerde, ip ve kazmayla ilerliyor.', 'The explorers are pushing through snowy passes with rope and pick.'),
  },
  pilgrimage: {
    name: L('Hacılar tapınağa', 'Pilgrims to the temple'),
    short: L('Hac yolu', 'Pilgrimage'),
    icon: 'temple',
    text: L('Hacılar uzak bir tapınağa yürür; döndüklerinde anlattıkları halkın gönlünü bir süre ferahlatır.', 'Pilgrims walk to a distant temple; on their return, their tales lift the people\'s hearts for a while.'),
    road: L('Hacılar ilahiler söyleyerek tozlu yollarda yürüyor.', 'The pilgrims are walking the dusty roads, singing hymns.'),
  },
  caravan: {
    name: L('Tüccar kafilesi uzak diyarlara', 'Merchant caravan to distant lands'),
    short: L('Kafile', 'Caravan'),
    icon: 'trade',
    text: L('Yapı malzemesiyle yüklü bir kafile uzak pazarlara gider ve altınla döner. Yollarda haydut çok: muhafız katmak akıllıca olur.', 'A caravan laden with building materials heads for distant markets and returns with gold. The roads teem with bandits: sending guards along is wise.'),
    road: L('Kafile çanlarını çalarak uzak diyarlara doğru ilerliyor.', 'The caravan is jingling its way toward distant lands.'),
  },
  treasure: {
    name: L('Kayıp hazine izinde', 'On the trail of lost treasure'),
    short: L('Hazine avı', 'Treasure hunt'),
    icon: 'chest',
    text: L('Eski bir haritanın peşine düşen birkaç cesur köylü. Çoğu zaman eli boş döner; ama bazen bir hazine bulur.', 'A few brave villagers chasing an old map. Most often they come back empty-handed; but now and then they find a treasure.'),
    road: L('Hazine avcıları eski bir haritanın üstüne eğilmiş, yol arıyor.', 'The treasure hunters are hunched over an old map, looking for the way.'),
  },
}

// What befell a party on the road, by kind and incident.
export const INCIDENT_TEXTS: Record<string, Record<string, string>> = {
  hunt: {
    herd: L('Bir geyik sürüsüne rastladılar; heybeler ağzına kadar doldu.', 'They came upon a herd of deer; the saddlebags were filled to the brim.'),
    berries: L('Yol üstünde böğürtlen ve yaban elmasıyla dolu bir açıklık buldular.', 'They found a clearing full of blackberries and crab apples by the path.'),
    hermit: L('Ormanda yaşlı bir ermişle karşılaştılar; dualarını alıp döndüler.', 'They met an old hermit in the forest and came back with his blessing.'),
    quiet: L('Orman sessizdi; ateş başında uzun hikâyeler anlatıldı.', 'The forest was quiet; long tales were told by the fire.'),
    bear: L('Bir ayı kampa saldırdı! Avın bir kısmını bırakıp kaçmak zorunda kaldılar.', 'A bear attacked the camp! They had to flee and leave part of the catch behind.'),
    lostTrail: L('Sisli bir sabah izi kaybettiler; günler boşa geçti.', 'They lost the trail one misty morning; days were wasted.'),
    poachers: L('Kaçak avcılar tuzaklarını yağmaladı.', 'Poachers plundered their snares.'),
  },
  explore: {
    cave: L('Işıl ışıl damarlarla dolu bir mağara buldular.', 'They found a cave full of glittering veins.'),
    ruins: L('Karlar altında eski bir kalenin yıkıntısı; içinde birkaç sikke vardı.', 'The ruin of an old castle under the snow, with a few coins inside.'),
    rumour: L('Geçitteki bir çobandan dünyaya dair haberler duydular.', 'They heard news of the world from a shepherd in the pass.'),
    eagle: L('Doruktaki kartal yuvasını gördüler; halk bunu hayra yordu.', 'They saw the eagle\'s nest on the peak; the people took it as a good omen.'),
    rockslide: L('Bir kaya çığı yolu kapattı; yüklerinin bir kısmını yitirdiler.', 'A rockslide blocked the way; they lost part of their load.'),
    blizzard: L('Tipiye yakalandılar; bir mağarada günlerce beklediler.', 'They were caught in a blizzard and waited for days in a cave.'),
    wolves: L('Kurtlar geceleri kampın çevresinde dolaştı.', 'Wolves prowled around the camp at night.'),
  },
  pilgrimage: {
    blessing: L('Tapınağın başrahibi hacıları kutsadı.', 'The temple\'s high priest blessed the pilgrims.'),
    relic: L('Bir aziz kalıntısını ziyaret ettiler; sadaka kutusu dolu döndü.', 'They visited a saint\'s relic; the alms box came back full.'),
    miracle: L('Kurumuş bir pınarın yeniden aktığını gördüler; bu mucize dilden dile dolaşıyor.', 'They saw a dried-up spring flow again; the miracle is on everyone\'s lips.'),
    fellowship: L('Yolda başka hacılarla dost oldular.', 'They made friends with other pilgrims on the road.'),
    fever: L('Yolda bir sıtma sardı; hacıların çoğu hasta yattı.', 'A fever struck on the road; most of the pilgrims fell ill.'),
    robbers: L('Yol kesiciler adaklarını aldı.', 'Highwaymen took their offerings.'),
  },
  caravan: {
    fair: L('Büyük bir panayıra denk geldiler; mallar el kapıştı.', 'They chanced upon a great fair; the goods were snapped up.'),
    spices: L('Kerestenin bir kısmını baharat ve kuru meyveye takas ettiler.', 'They traded part of the timber for spices and dried fruit.'),
    oasis: L('Bir vahada dinlenip develeri suladılar.', 'They rested at an oasis and watered the camels.'),
    rumour: L('Bir handa uzak diyarların haberlerini dinlediler.', 'At an inn they heard news of distant lands.'),
    bandits: L('Haydutlar kafileyi bastı!', 'Bandits raided the caravan!'),
    toll: L('Bir derebeyi geçit için ağır bir bac aldı.', 'A local baron took a heavy toll for the pass.'),
    sandstorm: L('Kum fırtınası kafileyi dağıttı.', 'A sandstorm scattered the caravan.'),
  },
  treasure: {
    map: L('Haritanın eksik parçasını yaşlı bir kâhinde buldular.', 'They found the map\'s missing piece with an old seer.'),
    wonders: L('Yolda akıl almaz harikalar gördüler; anlattıkları köyü büyüledi.', 'They saw unbelievable wonders on the way; their tales enchanted the village.'),
    rumour: L('Bir mezarlık bekçisinden dünyaya dair fısıltılar duydular.', 'They heard whispers of the world from a graveyard keeper.'),
    quiet: L('Yol uzun ve sakindi.', 'The road was long and quiet.'),
    trap: L('Eski bir mezarın tuzağına düştüler!', 'They fell into an old tomb\'s trap!'),
    curse: L('Bir mezar taşındaki lanet yazısı köye korku saldı.', 'A curse carved on a gravestone spread fear through the village.'),
    rivals: L('Başka hazine avcılarıyla karşılaştılar; kavga çıktı.', 'They ran into rival treasure hunters; a fight broke out.'),
  },
}

// What escorts did when trouble came.
export const ESCORT_FOUGHT = L('Muhafızlar saldırganlarla çarpıştı.', 'The guards fought off the attackers.')

export const FIND_TEXTS: Record<string, { name: string; text: string }> = {
  hoard: { name: L('Büyük hazine', 'Great treasure'), text: L('Bir mağaranın dibinde, toprağa gömülü sandıklar dolusu altın buldular!', 'Deep in a cave they found chests full of gold buried in the earth!') },
  cache: { name: L('Küçük bir zula', 'A small cache'), text: L('Bir taşın altında unutulmuş bir kese ve birkaç eski kılıç buldular.', 'Under a stone they found a forgotten purse and a few old swords.') },
}

// The season's goals: each track's name and the badge of every tier.
export const GOAL_TEXTS: Record<string, { name: string; icon: IconName; what: (n: number) => string; badges: [string, string, string] }> = {
  builder: { name: L('Kurucu', 'Founder'), icon: 'build', what: (n) => L(`${n} yapı`, `${n} building${n === 1 ? '' : 's'}`), badges: [L('Yapıcı', 'Builder'), L('Usta Kurucu', 'Master Builder'), L('Büyük Mimar', 'Grand Architect')] },
  homes: { name: L('Yuva', 'Hearth'), icon: 'house', what: (n) => L(`${n} ev`, `${n} house${n === 1 ? '' : 's'}`), badges: [L('Ev Sahibi', 'Householder'), L('Mahalle Kurucusu', 'Founder of Neighbourhoods'), L('Kasaba Babası', 'Father of Towns')] },
  palace: { name: L('Saray', 'Palace'), icon: 'home', what: (n) => L(`${n}. seviye saray`, `level ${n} palace`), badges: [L('Köşk Sahibi', 'Manor Holder'), L('Saray Sahibi', 'Palace Holder'), L('Sarayların Sarayı', 'Palace of Palaces')] },
  people: { name: L('Kalabalık', 'Multitude'), icon: 'villager', what: (n) => L(`${n} köylü`, `${n} villager${n === 1 ? '' : 's'}`), badges: [L('Köy Ağası', 'Village Squire'), L('Halkın Lordu', 'Lord of the People'), L('Kalabalıkların Efendisi', 'Master of Multitudes')] },
  heirs: { name: L('Soy', 'Lineage'), icon: 'crown', what: (n) => L(`${n} çocuk`, `${n} ${n === 1 ? 'child' : 'children'}`), badges: [L('Baba', 'Father'), L('Hanedan Kurucusu', 'Dynasty Founder'), L('Soylu Ata', 'Noble Ancestor')] },
  victor: { name: L('Muzaffer', 'Victor'), icon: 'swords', what: (n) => L(`${n} kazanılmış muharebe`, `${n} battle${n === 1 ? '' : 's'} won`), badges: [L('Kılıç Ehli', 'Swordsman'), L('Savaş Lordu', 'Warlord'), L('Yenilmez', 'Undefeated')] },
  lands: { name: L('Fatih', 'Conqueror'), icon: 'banner', what: (n) => L(`${n} kasaba elde tutmak`, `hold ${n} town${n === 1 ? '' : 's'}`), badges: [L('Kasaba Beyi', 'Town Lord'), L('Toprak Ağası', 'Landowner'), L('Fatih', 'Conqueror')] },
  scholar: { name: L('Bilge', 'Sage'), icon: 'book', what: (n) => L(`${n} araştırma`, `${n} research project${n === 1 ? '' : 's'}`), badges: [L('Okumuş', 'Lettered'), L('Bilge', 'Sage'), L('Âlim', 'Scholar')] },
  explorer: { name: L('Kâşif', 'Explorer'), icon: 'pin', what: (n) => L(`${n} sefer dönüşü`, `${n} expedition${n === 1 ? '' : 's'} returned`), badges: [L('Yolcu', 'Traveller'), L('Kâşif', 'Explorer'), L('Diyar Diyar Gezen', 'Wanderer of Realms')] },
  merchant: { name: L('Tüccar', 'Merchant'), icon: 'trade', what: (n) => L(`tüccarla ${n.toLocaleString(locale())} altın`, `${n.toLocaleString(locale())} gold from the merchant`), badges: [L('Pazarcı', 'Stallholder'), L('Tüccarbaşı', 'Master Merchant'), L('Ticaret Prensi', 'Prince of Trade')] },
  treasurer: { name: L('Hazinedar', 'Treasurer'), icon: 'gold', what: (n) => L(`hazinede ${n.toLocaleString(locale())} altın`, `${n.toLocaleString(locale())} gold in the treasury`), badges: [L('Tutumlu', 'Thrifty'), L('Varlıklı', 'Wealthy'), L('Altın Lord', 'Golden Lord')] },
  devout: { name: L('Dindar', 'Devout'), icon: 'temple', what: (n) => L(`${n}. seviye tapınak`, `level ${n} temple`), badges: [L('Mümin', 'Faithful'), L('Hayırsever', 'Benefactor'), L('Kutsal Lord', 'Holy Lord')] },
  admiral: { name: L('Amiral', 'Admiral'), icon: 'ship', what: (n) => L(`${n} gemi`, `${n} ship${n === 1 ? '' : 's'}`), badges: [L('Kaptan', 'Captain'), L('Reis', 'Skipper'), L('Kaptan-ı Derya', 'Grand Admiral')] },
}

export const TIER_NAMES = [L('Bronz', 'Bronze'), L('Gümüş', 'Silver'), L('Altın', 'Gold')] as const
