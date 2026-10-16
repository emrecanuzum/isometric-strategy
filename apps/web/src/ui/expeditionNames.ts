import type { IconName } from './icons'

// What the expeditions, the things that befall them and the season's goals are called (CLAUDE.md §9.9).

export const EXPEDITION_TEXTS: Record<string, { name: string; short: string; icon: IconName; text: string; road: string }> = {
  hunt: {
    name: 'Avcılar ormana',
    short: 'Av seferi',
    icon: 'bow',
    text: 'Birkaç köylü yay ve tuzaklarla ormana gider; et, yaban meyvesi ve post getirir.',
    road: 'Avcılar ormanın derinliklerinde iz sürüyor.',
  },
  explore: {
    name: 'Kâşifler dağlara',
    short: 'Keşif seferi',
    icon: 'eye',
    text: 'Kâşifler dağ geçitlerini ve mağaraları dolaşır; demir cevheri, bazen eski bir harabe ve dünyadan haberler getirir.',
    road: 'Kâşifler karlı geçitlerde, ip ve kazmayla ilerliyor.',
  },
  pilgrimage: {
    name: 'Hacılar tapınağa',
    short: 'Hac yolu',
    icon: 'temple',
    text: 'Hacılar uzak bir tapınağa yürür; döndüklerinde anlattıkları halkın gönlünü bir süre ferahlatır.',
    road: 'Hacılar ilahiler söyleyerek tozlu yollarda yürüyor.',
  },
  caravan: {
    name: 'Tüccar kafilesi uzak diyarlara',
    short: 'Kafile',
    icon: 'trade',
    text: 'Yapı malzemesiyle yüklü bir kafile uzak pazarlara gider ve altınla döner. Yollarda haydut çok: muhafız katmak akıllıca olur.',
    road: 'Kafile çanlarını çalarak uzak diyarlara doğru ilerliyor.',
  },
  treasure: {
    name: 'Kayıp hazine izinde',
    short: 'Hazine avı',
    icon: 'chest',
    text: 'Eski bir haritanın peşine düşen birkaç cesur köylü. Çoğu zaman eli boş döner; ama bazen bir hazine bulur.',
    road: 'Hazine avcıları eski bir haritanın üstüne eğilmiş, yol arıyor.',
  },
}

// What befell a party on the road, by kind and incident.
export const INCIDENT_TEXTS: Record<string, Record<string, string>> = {
  hunt: {
    herd: 'Bir geyik sürüsüne rastladılar; heybeler ağzına kadar doldu.',
    berries: 'Yol üstünde böğürtlen ve yaban elmasıyla dolu bir açıklık buldular.',
    hermit: 'Ormanda yaşlı bir ermişle karşılaştılar; dualarını alıp döndüler.',
    quiet: 'Orman sessizdi; ateş başında uzun hikâyeler anlatıldı.',
    bear: 'Bir ayı kampa saldırdı! Avın bir kısmını bırakıp kaçmak zorunda kaldılar.',
    lostTrail: 'Sisli bir sabah izi kaybettiler; günler boşa geçti.',
    poachers: 'Kaçak avcılar tuzaklarını yağmaladı.',
  },
  explore: {
    cave: 'Işıl ışıl damarlarla dolu bir mağara buldular.',
    ruins: 'Karlar altında eski bir kalenin yıkıntısı; içinde birkaç sikke vardı.',
    rumour: 'Geçitteki bir çobandan dünyaya dair haberler duydular.',
    eagle: 'Doruktaki kartal yuvasını gördüler; halk bunu hayra yordu.',
    rockslide: 'Bir kaya çığı yolu kapattı; yüklerinin bir kısmını yitirdiler.',
    blizzard: 'Tipiye yakalandılar; bir mağarada günlerce beklediler.',
    wolves: 'Kurtlar geceleri kampın çevresinde dolaştı.',
  },
  pilgrimage: {
    blessing: 'Tapınağın başrahibi hacıları kutsadı.',
    relic: 'Bir aziz kalıntısını ziyaret ettiler; sadaka kutusu dolu döndü.',
    miracle: 'Kurumuş bir pınarın yeniden aktığını gördüler; bu mucize dilden dile dolaşıyor.',
    fellowship: 'Yolda başka hacılarla dost oldular.',
    fever: 'Yolda bir sıtma sardı; hacıların çoğu hasta yattı.',
    robbers: 'Yol kesiciler adaklarını aldı.',
  },
  caravan: {
    fair: 'Büyük bir panayıra denk geldiler; mallar el kapıştı.',
    spices: 'Kerestenin bir kısmını baharat ve kuru meyveye takas ettiler.',
    oasis: 'Bir vahada dinlenip develeri suladılar.',
    rumour: 'Bir handa uzak diyarların haberlerini dinlediler.',
    bandits: 'Haydutlar kafileyi bastı!',
    toll: 'Bir derebeyi geçit için ağır bir bac aldı.',
    sandstorm: 'Kum fırtınası kafileyi dağıttı.',
  },
  treasure: {
    map: 'Haritanın eksik parçasını yaşlı bir kâhinde buldular.',
    wonders: 'Yolda akıl almaz harikalar gördüler; anlattıkları köyü büyüledi.',
    rumour: 'Bir mezarlık bekçisinden dünyaya dair fısıltılar duydular.',
    quiet: 'Yol uzun ve sakindi.',
    trap: 'Eski bir mezarın tuzağına düştüler!',
    curse: 'Bir mezar taşındaki lanet yazısı köye korku saldı.',
    rivals: 'Başka hazine avcılarıyla karşılaştılar; kavga çıktı.',
  },
}

// What escorts did when trouble came.
export const ESCORT_FOUGHT = 'Muhafızlar saldırganlarla çarpıştı.'

export const FIND_TEXTS: Record<string, { name: string; text: string }> = {
  hoard: { name: 'Büyük hazine', text: 'Bir mağaranın dibinde, toprağa gömülü sandıklar dolusu altın buldular!' },
  cache: { name: 'Küçük bir zula', text: 'Bir taşın altında unutulmuş bir kese ve birkaç eski kılıç buldular.' },
}

// The season's goals: each track's name and the badge of every tier.
export const GOAL_TEXTS: Record<string, { name: string; icon: IconName; what: (n: number) => string; badges: [string, string, string] }> = {
  builder: { name: 'Kurucu', icon: 'build', what: (n) => `${n} yapı`, badges: ['Yapıcı', 'Usta Kurucu', 'Büyük Mimar'] },
  homes: { name: 'Yuva', icon: 'house', what: (n) => `${n} ev`, badges: ['Ev Sahibi', 'Mahalle Kurucusu', 'Kasaba Babası'] },
  palace: { name: 'Saray', icon: 'home', what: (n) => `${n}. seviye saray`, badges: ['Köşk Sahibi', 'Saray Sahibi', 'Sarayların Sarayı'] },
  people: { name: 'Kalabalık', icon: 'villager', what: (n) => `${n} köylü`, badges: ['Köy Ağası', 'Halkın Lordu', 'Kalabalıkların Efendisi'] },
  heirs: { name: 'Soy', icon: 'crown', what: (n) => `${n} çocuk`, badges: ['Baba', 'Hanedan Kurucusu', 'Soylu Ata'] },
  victor: { name: 'Muzaffer', icon: 'swords', what: (n) => `${n} kazanılmış muharebe`, badges: ['Kılıç Ehli', 'Savaş Lordu', 'Yenilmez'] },
  lands: { name: 'Fatih', icon: 'banner', what: (n) => `${n} kasaba elde tutmak`, badges: ['Kasaba Beyi', 'Toprak Ağası', 'Fatih'] },
  scholar: { name: 'Bilge', icon: 'book', what: (n) => `${n} araştırma`, badges: ['Okumuş', 'Bilge', 'Âlim'] },
  explorer: { name: 'Kâşif', icon: 'pin', what: (n) => `${n} sefer dönüşü`, badges: ['Yolcu', 'Kâşif', 'Diyar Diyar Gezen'] },
  merchant: { name: 'Tüccar', icon: 'trade', what: (n) => `tüccarla ${n.toLocaleString('tr-TR')} altın`, badges: ['Pazarcı', 'Tüccarbaşı', 'Ticaret Prensi'] },
  treasurer: { name: 'Hazinedar', icon: 'gold', what: (n) => `hazinede ${n.toLocaleString('tr-TR')} altın`, badges: ['Tutumlu', 'Varlıklı', 'Altın Lord'] },
  devout: { name: 'Dindar', icon: 'temple', what: (n) => `${n}. seviye tapınak`, badges: ['Mümin', 'Hayırsever', 'Kutsal Lord'] },
  admiral: { name: 'Amiral', icon: 'ship', what: (n) => `${n} gemi`, badges: ['Kaptan', 'Reis', 'Kaptan-ı Derya'] },
}

export const TIER_NAMES = ['Bronz', 'Gümüş', 'Altın'] as const
