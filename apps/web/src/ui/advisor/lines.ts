import {
  ARCADE_GAMES, BUILDINGS, allShips, balance, countShips, buildingCount, clogsOf, crownQuest, fealtyOpen, fishError, gameError, goldCap, hasPalace,
  hasTradePost, palaceLevel, popCapFor, population, queenError, questProgress, storageCap, upgradeError,
  campSoldiers, PROJECT_IDS, projectError, hasOpinion, ofAge, opinionOf, siblingsOf, crownHouseAt, crownWays, liegeSwitchError,
} from '@game/shared'
import type { BuildingKind, Kingdom } from '@game/shared'
import type { IconName } from '../icons'
import type { TabId } from '../hud/Hud'
import type { Online } from '../hud/online'

// What the envoy says (CLAUDE.md §9.8): his advice, picked from what the lord lacks or could do better; the steps of
// the tutorial for a new lord; and the topics he explains when asked. Only words and the checks that pick them live
// here; the panel that speaks them is Advisor.tsx. Numbers come from the balance files, never written in.
// Almost everything he says comes in four or five wordings with the same facts; the panel takes them in turn, so the
// same advice never sounds the same twice in a row.

export interface AdvisorCtx {
  kingdom: Kingdom
  now: number
  online: Online
  // How many crown kingdoms the lobby has (their capitals).
  crowns: number
}

// What a reply does in the game: opens a tab (at one of its parts), starts placing a building, opens one of the
// lord's buildings, or takes the camera home.
export type AdvisorAction =
  | { kind: 'tab'; tab: TabId; part?: { key: string; part: string } }
  | { kind: 'build'; building: BuildingKind }
  | { kind: 'open'; building: BuildingKind }
  | { kind: 'home' }

export interface Reply {
  label: string
  act?: AdvisorAction
  // What the envoy says back (a joke for a joke).
  answer?: string
  // Not to bring the topic up again for this many minutes.
  snooze?: number
  // Opens one of the help topics ('' for the list of them).
  topic?: string
  // A side question, shown as a small link under the answers rather than a button among them.
  quiet?: boolean
  // The tip it puts off, and a change to the tutorial.
  id?: string
  tutorial?: 'on' | 'off'
  // Skips this tutorial step (a lord who does not want that building).
  skip?: string
  // What the envoy says next, with replies of its own (a question that leads on).
  say?: { text: string; replies: Reply[] }
}

export interface Tip {
  id: string
  when: (c: AdvisorCtx) => boolean
  // The ways of saying it (one per showing, in turn).
  say: (c: AdvisorCtx) => string[]
  // The reply that sets about it.
  go?: { label: string; act: AdvisorAction }
  // Joking replies with the envoy's comeback, one pair per showing.
  jokes?: [string, string][]
  // How many minutes "later" puts it off (default SNOOZE_MINUTES).
  snooze?: number
}

export interface Step {
  id: string
  title: string
  // The explanation (the same every time) and a quip said with it, one per showing; `lead` puts the quip first.
  say: (c: AdvisorCtx) => string
  quips: string[]
  lead?: boolean
  done: (c: AdvisorCtx) => boolean
  go?: { label: string; act: AdvisorAction }
  // The tab whose button glows while the step waits.
  hint?: TabId
  // What he says when it is done (one of them).
  cheers: string[]
}

// A part of the game he explains when asked ("Bana oyunu anlat"): a short talk told page by page, each page a few
// sentences ('\n\n' splits a page into paragraphs), listed under one of the groups below.
export interface Topic {
  id: string
  name: string
  icon: IconName
  group: TopicGroup
  pages: (c: AdvisorCtx) => string[]
  go?: { label: string; act: AdvisorAction }
}

// The groups his topics are listed under, in order (the menu would be a wall of buttons otherwise).
export type TopicGroup = 'basics' | 'war' | 'court' | 'wilds' | 'pursuits'
export const TOPIC_GROUPS: { id: TopicGroup; name: string }[] = [
  { id: 'basics', name: 'Lordluğun temelleri' },
  { id: 'war', name: 'Ordu ve savaş' },
  { id: 'court', name: 'Taçlar, saray ve entrika' },
  { id: 'wilds', name: 'Yolların ve suların belası' },
  { id: 'pursuits', name: 'Uğraşlar ve şan' },
]

// How often he comes on his own while the lord plays (minutes of play), and how long "later" lasts.
export const ADVISOR_EVERY_MINUTES = 4
export const SNOOZE_MINUTES = 20

const n = (v: number) => Math.round(v).toLocaleString('tr-TR')
const pct = (v: number) => `%${Math.round(v * 100)}`
const min = (seconds: number) => Math.max(1, Math.round(seconds / 60))
const count = (k: Kingdom, kind: BuildingKind) => buildingCount(k, kind)
const unlocked = (c: AdvisorCtx, kind: BuildingKind) => (BUILDINGS[kind].requiresPalace ?? 0) <= palaceLevel(c.kingdom, c.now)
const palaceOf = (k: Kingdom) => k.buildings.find((b) => b.kind === 'palace')
const tab = (t: TabId, key?: string, part?: string): AdvisorAction => ({ kind: 'tab', tab: t, ...(key && part ? { part: { key, part } } : {}) })
const build = (building: BuildingKind): AdvisorAction => ({ kind: 'build', building })
const open = (building: BuildingKind): AdvisorAction => ({ kind: 'open', building })

// "Later": he takes it in good part, one way or another.
export const LATER = ['Sonra, elçi efendi', 'Şimdi olmaz', 'Bir düşüneyim', 'Hele bir dur', 'Aklımda, merak etme']
export const LATER_ANSWERS = [
  `Peki lordum. Not ettim: "sonra". Bu kelimeyi çok severim, kırk yıllık elçiyim.`,
  `Elbette. Ben de bu arada şu parşömeni okuyormuş gibi yaparım.`,
  `Nasıl isterseniz. Ama tarih, ertelenen kararlarla doludur; ben yalnızca söylüyorum.`,
  `Anlaşıldı. Unuttuğunuzda tekrar hatırlatırım, işim bu.`,
  `Bekleriz, lordum. Ben beklemekte ustayım; bir keresinde bir taç elçisinin kapısında üç gün bekledim.`,
  `Peki lordum; ben de bu sırada ayna karşısında bir sonraki öğüdümü prova ederim.`,
  `Not ettim, lordum, hem de kırmızı mürekkeple. Kırmızı mürekkep "yine geleceğim" demektir.`,
  `Peki lordum. Kumsaati çevirdim; dolunca kapınızı yine çalarım.`,
  `Anlaşıldı, lordum. Bir elçinin en iyi bildiği iş beklemektir, ikincisi de beklerken konuşmak. Şimdilik birinciyi yapıyorum.`,
  `Siz bilirsiniz, lordum. Ben bu arada aşçıya uğrayayım; bekleyen elçinin karnı çabuk acıkır.`,
]

const GOOD_NAMES = { food: 'yemek', materials: 'yapı malzemesi', arms: 'savaş malzemesi' } as const

// The things he can tell the lord to do, the most pressing first.
export const TIPS: Tip[] = [
  {
    id: 'foodLow',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.food < Math.max(20, storageCap(k, now) * 0.06) && population(k, now).villagers > 4,
    say: ({ kingdom: k }) => {
      const f = n(k.stock.food)
      return [
        `Lordum, ambarda yalnızca ${f} yemek kaldı. Halk karnını sarayın duvarlarına bakarak doyurmaz; açlık mutluluğu düşürür ve köylüler göç eder. Bir tarla daha, belki bir iskele?`,
        `Ambarcı az önce yanıma geldi, lordum, yüzü un çuvalı gibi bembeyaz: ${f} yemek kalmış. Açlık mutluluğu düşürür, köylüler de bohçasını toplar. Bir tarla ya da iskele bu işi çözer.`,
        `Lordum, kilerde ${f} yemek var; ben bunu bir kahvaltıda bitiririm, halk ne yapsın? Aç halk mutsuz olur ve göç eder. Bir tarla ya da iskele kuralım.`,
        `Saray aşçısı kepçeyi bıraktı, lordum: ambarda ${f} yemek kalmış. Yemek bitince halkın keyfi kaçar, köylüler başka diyarlara göçer. Bir tarla daha ekelim, bir iskeleden de balık gelsin.`,
        `Size bir sır vereyim, lordum: aç köylünün aklı vergide değil, göçtedir. Ambarda yalnızca ${f} yemek var. Buğday tarlası mı olsun, balık iskelesi mi?`,
      ]
    },
    go: { label: 'Tarla kuralım', act: build('farm') },
    jokes: [
      ['Halk biraz perhiz yapsın', 'Perhiz mi? Geçen sefer biri bunu dedi; şimdi heykeli meydanda, ama başı yok.'],
      ['Pasta yesinler', 'Pasta da undan yapılır, lordum. Un da tarladan gelir. Gördünüz mü, yine tarlaya çıktık.'],
      ['Ben pek aç değilim', 'Siz sarayın mutfağından besleniyorsunuz, lordum; halkın mutfağında yalnızca örümcekler var, onlar da zayıfladı.'],
      ['Oruç tutsunlar, sevaptır', 'Sevap güzel, lordum; ama göç eden köylü sevabını da yanında götürür.'],
      ['Balıklar kendiliğinden gelir', 'Gelirler, lordum, ama iskele olursa. Balıklar kapı çalmayı henüz öğrenmedi.'],
    ],
    snooze: 10,
  },
  {
    id: 'noFarm',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'farm') === 0 && count(k, 'lumberCamp') > 0,
    say: () => [
      `Tek bir tarlamız bile yok, lordum. Köylüler her üretim turunda yemek yer; ekmeksiz halk, kraliyet şarkılarını bile söylemez.`,
      `Lordum, bütün hududu dolaştım, tek bir başak göremedim. Köylüler her üretim turunda yemek yer; tarlasız lordluk, kilerini bir gün boş bulur.`,
      `Hiç tarlamız yok, lordum. Halk her turda yemek yiyor, ambar ise sihirli değil; kendiliğinden dolmaz. Bir buğday tarlası kuralım.`,
      `Lordum, ekmeği fırından, fırını undan, unu tarladan biliriz; bizde tarla yok. Köylüler her turda yemek yer; bir tarla şart.`,
      `Saray şairi "altın başaklar" diye bir şiir yazdı, lordum; ama başak görmediği için çiçek anlatmış. Tarlamız yok, halk ise her turda yemek yer.`,
    ],
    go: { label: 'Hemen hallederim', act: build('farm') },
    jokes: [
      ['Taş çorbası yaparız', 'Taş çorbası mı? Taş ocağımız bile yok, lordum. Önce tarla.'],
      ['Ağaç kabuğu yerler', 'Oduncular buna itiraz eder, lordum; o kabuklar yapı malzemesi olacak.'],
      ['Avlanırlar', 'Ormandaki geyikler de bunu duydu, lordum; hepsi komşu lordluğa taşındı.'],
      ['Ben tarla sevmem', 'Tarla da sizi sevmez, lordum, ama doyurur. Sevgi her zaman şart değil.'],
    ],
  },
  {
    id: 'noLumber',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'lumberCamp') === 0,
    say: () => [
      `Lordum, her yapı yapı malzemesi ister ve onu oduncu kampı üretir. İlk oduncu kampı bedavadır; bedava olan şeyi geri çevirmek saraya yakışmaz.`,
      `Lordum, ustalar elleri boş bekliyor: yapı malzemesi olmadan tek bir duvar örülmez. Onu oduncu kampı üretir; ilki bedavadır.`,
      `Ormanda ağaçlar bizi bekliyor, lordum, baltalar da depoda paslanıyor. Her yapı yapı malzemesi ister; bir oduncu kampı kuralım.`,
      `Size kırk yıllık tecrübemi söyleyeyim, lordum: kereste olmadan ne saray olur ne ev. Oduncu kampı yapı malzemesi üretir ve ilki hiçbir şeye mal olmaz.`,
      `Lordum, marangozlar kendi tezgâhlarını yakıp ısınmaya başladı. Yapı malzemesi lazım; o da oduncu kampından gelir.`,
    ],
    go: { label: 'Oduncu kampı kur', act: build('lumberCamp') },
    jokes: [
      ['Ağaçlara kıyamam', 'Ağaçlar da size kıyar, lordum, kış gelince. Ormanda çok ağaç var, söz.'],
      ['Tahtımı sökeriz', 'Tahtınızı mı, lordum? Üstünde oturduğunuz son tahta o; sökmeyelim.'],
      ['Komşudan ödünç alırız', 'Komşu lord ödünç vermez, lordum; geçen sefer bir kova istedim, karşılığında bir hakaret elçisi geldi.'],
      ['Orman bir yere kaçmaz', 'Orman kaçmaz, lordum; ama ustalarımız kaçabilir. Bir kamp yeter.'],
    ],
  },
  {
    id: 'noHouse',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'house') === 0,
    say: () => [
      `Sarayın birkaç hizmetlisi var ama halkın başını sokacak bir evi yok. Evler köylüye yer verir; yer olunca köylüler kendiliğinden gelir. İlk ev de bedava.`,
      `Lordum, köylüler yolda; ama başlarını sokacak bir ev bulamazlarsa gelmezler. Evler köylüye yer verir, yer olunca halk kendiliğinden gelir.`,
      `Saray hizmetlileri bile yatacak yer arıyor, lordum. Bir ev kurarsak köylüler gelir, çalışır ve vergi öder. Hem ilk ev bedava; ben olsam kaçırmazdım.`,
      `Halk dediğiniz, lordum, bir çatı altında çoğalır. Evler köylüye yer açar, köylüler o yere zamanla gelir. Bir ev kuralım.`,
      `Haritaya baktım, lordum: saray var, halk yok. Çünkü ev yok. Ev olunca köylüler gelir, gelen köylü çalışır ve vergi verir.`,
    ],
    go: { label: 'Ev kuralım', act: build('house') },
    jokes: [
      ['Sarayda yer çok', 'Sarayda yer çok, ama halkı sarayın koridorlarında uyuturken gördüm; tacınızın üstüne horluyorlardı.'],
      ['Ağaç kovuğunda yaşasınlar', 'Sincaplar kovukları kiraya vermiyor, lordum; sordum.'],
      ['Yıldızların altında uyusunlar', 'Çok şiirsel, lordum. Ama yağmur yağınca şiir bitiyor ve köylüler gidiyor.'],
      ['Saray bahçesine çadır kursunlar', 'Bahçıvan buna razı olmaz, lordum; güllerine kimse basamaz. Ev yapalım.'],
    ],
  },
  {
    id: 'noGood',
    when: ({ kingdom: k }) => hasTradePost(k) && k.trade.good === null && !k.trade.idle,
    say: () => [
      `Tüccarımız ticaret noktasında bekliyor, lordum, elinde boş bir çuval. Ne satacağını seçmezseniz hiçbir şey satmaz ve altın getirmez.`,
      `Lordum, tüccarımız devesine bakıyor, devesi de ona; ikisinin de yapacak işi yok. Satılacak malı seçmezseniz tek bir altın getirmezler.`,
      `Ticaret noktası hazır ama tüccar ne satacağını bilmiyor, lordum. Yemek mi, yapı malzemesi mi, savaş malzemesi mi? Seçin ki altın gelsin.`,
      `Tüccar her gün kapımı çalıp "Ne satayım?" diye soruyor, lordum. Ben bilmem ki; karar sizin. Mal seçilmeden sefer de yok, altın da.`,
      `Lordum, boş çuvalla pazara giden tüccar boş keseyle döner. Ticaret sekmesinden bir mal seçin; fazla olanı satın, eksik olanı değil.`,
    ],
    go: { label: 'Satılacak malı seç', act: tab('trade', 'trade', 'merchant') },
    jokes: [
      ['Havayı satsın', 'Hava satmayı denedi, lordum. Alıcı çıktı ama altınlar da havadandı.'],
      ['Elçiyi satsın', 'Beni mi, lordum? Alan çıkmaz; çok konuşuyorum diye iade ederler.'],
      ['Deveyi satsın', 'Deve satılırsa tüccar malı sırtında taşır, lordum; bir sefer sonra o da satılığa çıkar.'],
      ['Söz satsın', 'Söz satmayı ben denedim, lordum, kırk yıl. Zengin olsaydım burada olmazdım.'],
    ],
  },
  {
    id: 'tradeIdle',
    when: ({ kingdom: k }) => hasTradePost(k) && !!k.trade.idle,
    say: () => [
      `Tüccar evde oturuyor, lordum; "hiçbir şey satma" demişsiniz. Adam o kadar boş ki kendi gölgesiyle pazarlığa girişti. Bir mal seçsek?`,
      `Lordum, "hiçbir şey satma" emriniz harfiyen uygulanıyor: tüccar sabahtan beri aynı taburede oturuyor. Bir mal seçsek, biraz altın getirse?`,
      `Tüccarımız evde bekliyor, lordum; stoklar korunuyor ama hazineye tek bir kuruş girmiyor. Fazla olan bir malı sattırsak?`,
      `Tüccar boş oturmaktan o kadar sıkıldı ki devesine şarkı öğretiyor, lordum. Ticaret sekmesinden ona bir mal verelim, altın getirsin.`,
      `Lordum, satış durmuş: tüccar evde, deve ahırda, hazine bekliyor. Ambarda fazla olan bir şey varsa tüccara verelim.`,
    ],
    go: { label: 'Tüccara iş ver', act: tab('trade', 'trade', 'merchant') },
    jokes: [
      ['Dinlensin, hak etti', 'Hak etti tabii; ama hazine dinlenmeyi sevmez, lordum.'],
      ['Tüccar da insan', 'Elbette, lordum; ama dinlenen insan sıkılır, sıkılan tüccar da benimle sohbete gelir. Bunu ikimiz de istemeyiz.'],
      ['Fiyatlar düzelsin', 'Akıllıca, lordum: fiyat dipteyse beklemek iyidir. Taçlar da pazardan mal aldıkça fiyat toparlanır; yalnız çok beklemeyelim.'],
      ['Malları saklıyorum', 'Saklayın, lordum; ama ambar dolarsa sığmayan boşa gider. Saklamanın da bir sınırı var.'],
    ],
  },
  {
    id: 'tradeBroken',
    when: ({ kingdom: k }) => !!k.trade.damaged,
    say: () => {
      const g = n(balance.economy.trade.repairCost.gold)
      const m = n(balance.economy.trade.repairCost.materials)
      return [
        `Ticaret noktamız hâlâ harap, lordum. Onarılana kadar tüccar satış yapamaz. Onarmak ${g} altın ve ${m} yapı malzemesi ister.`,
        `Ticaret noktamızdan hâlâ duman tütüyor, lordum. Harap kaldıkça tüccar tek bir şey satamaz. Onarmak ${g} altın ve ${m} yapı malzemesi tutar.`,
        `Lordum, yağmacıların bıraktığı enkaz hâlâ yerinde. Tüccar yanık tezgâhta mal satamaz; ${g} altın ve ${m} yapı malzemesiyle onaralım.`,
        `Tüccar yanmış ticaret noktasının önünde ağlıyor, lordum; devesi de onu teselli ediyor. Onarım ${g} altın, ${m} yapı malzemesi; sonra satış yeniden başlar.`,
        `Harap bir ticaret noktası rakiplerin keyfini yerine getirir, lordum; haritada herkes yanık hâlini görüyor. ${g} altın ve ${m} yapı malzemesiyle onarırsak tüccar yeniden satar.`,
      ]
    },
    go: { label: 'Onarmaya git', act: tab('trade', 'trade', 'merchant') },
    jokes: [
      ['Yanık hâli de güzel', 'Ressam da öyle dedi, lordum, ve tablosunu sattı. Biz ise hiçbir şey satamıyoruz.'],
      ['Kim yaktıysa o onarsın', 'Mektup yazdım, lordum. Cevap gelmedi; bir ok geldi.'],
      ['Biraz havalansın', 'Havalandı, lordum; artık yağmur da içeri giriyor.'],
      ['Kayıp da kazançtır', 'Hangi kitapta yazıyor, lordum? Hazinedar o kitabı yakmak istiyor.'],
    ],
  },
  {
    // A rich lord with brimming stores and a great work waiting for them (CLAUDE.md §9.10).
    id: 'greatWorks',
    when: ({ kingdom: k, now }) =>
      hasPalace(k) &&
      ((['food', 'materials', 'arms'] as const).some((g) => k.stock[g] >= storageCap(k, now) * 0.85) || k.stock.gold >= goldCap(k, now) * 0.9) &&
      PROJECT_IDS.some((id) => projectError(k, id, now) === null),
    say: () => [
      'Lordum, ambarlar tıka basa dolu; dolu ambar fareyi, pası ve yangını çeker. Saray → Projeler\'de büyük işler bekliyor: katedral, çarşı, şövalye tarikatı. Malı taşa ve şana çevirelim.',
      'Bu bolluk çürümeden bir şeye dönüşmeli, lordum. Ustalar büyük bir iş için hazır; her aşama kalıcı bir katkı ve sıralamada puan getirir. Projeler bölümüne bakalım mı?',
      'Lordum, hazinedar da ambarcı da yer kalmadı diye ağlıyor. Ulu Katedral\'e kereste, Büyük Çarşı\'ya yemek, Şövalye Tarikatı\'na demir gönderelim; afetler yakmadan.',
      'Dolu ambar, lordum, deprem de sel de geldiğinde en çok yanan ambardır. Fazlayı büyük işlere aktaralım; adınız taşlara kazınsın.',
      'Lordum, ustabaşı kapımda şapkasını çeviriyor: "elimiz boş, ambar dolu" diyor. Büyük işlerin her aşaması kalıcı bir kazanç; Projeler bölümünde bekliyorlar.',
    ],
    go: { label: 'Projelere git', act: tab('kingdom', 'palace', 'projects') },
    jokes: [
      ['Fareler de bir şey yesin', 'Yiyorlar, lordum; dün biri bana selam verdi. O kadar rahatlar.'],
      ['Ben zenginliğimi seyrederim', 'Seyredin, lordum; ama pas da seyrediyor ve daha hızlı yiyor.'],
      ['Katedral mi? Ben dindar değilim', 'Çarşı da var, lordum, tarikat da. Taş her inanca uyar.'],
      ['Bir kule de bana dikin', 'Önce katedralin çan kulesi, lordum; sonra belki bir elçi heykeli.'],
    ],
  },
  {
    id: 'storeFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && (['food', 'materials', 'arms'] as const).some((g) => k.stock[g] >= storageCap(k, now) * 0.97),
    say: ({ kingdom: k, now }) => {
      const full = (['food', 'materials', 'arms'] as const).filter((g) => k.stock[g] >= storageCap(k, now) * 0.97)
      const list = full.map((g) => GOOD_NAMES[g]).join(', ')
      return [
        `Ambarlar dolup taşıyor, lordum: ${list}. Sığmayan mal boşa gider. Ya tüccara sattırın, ya bir ambar kurun ya da bir şeyler inşa edip harcayın.`,
        `Ambarcı kapıyı kapatamıyor, lordum: ${list} tavana kadar yığılmış. Yeni gelen mal sığmaz ve boşa gider. Sattırın, harcayın ya da yeni bir ambar kurun.`,
        `Lordum, ambara artık ${list} sığmıyor. Fazlası boşa gidiyor; bu benim yüreğime dokunuyor. Tüccara sattırmak, bir ambar kurmak ya da bir şey inşa etmek çare.`,
        `Bereketin bu kadarı dert olur, lordum: ${list} ambarın sınırında. Sığmayan mal kaybolur. Ya tüccar götürsün, ya bir ambar daha, ya da güzel bir yapı.`,
        `Lordum, ambarın duvarları gıcırdıyor: ${list} doldu. Depo sınırını aşan üretim yok olur. Malı satalım, harcayalım ya da bir ambar kuralım ki yer açılsın.`,
      ]
    },
    go: { label: 'Depoya bak', act: tab('store', 'store', 'goods') },
    jokes: [
      ['Fareler de yesin', 'Fareler zaten yiyor, lordum; o kadar besili ki kışlaya asker diye yazılmak istediler.'],
      ['Halka dağıtalım', 'Cömertsiniz, lordum! Ama halk ambara giremiyor, ben de anahtarı arıyorum. Satmak ya da harcamak kaldı.'],
      ['Üstüne oturup beklerim', 'Oturursunuz, lordum, ama yeni gelen mal yine sığmaz; altınızdan kayar gider.'],
      ['Ne güzel, zenginiz', 'Zenginiz, lordum, ama tıka basa zengin. Fazlası boşa gidiyor; zenginlik de sızıyor.'],
    ],
  },
  {
    id: 'treasuryFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.gold >= goldCap(k, now) * 0.97,
    say: ({ kingdom: k, now }) => {
      const g = n(k.stock.gold)
      const cap = n(goldCap(k, now))
      return [
        `Hazine ağzına kadar dolu, lordum: ${g} / ${cap} altın. Dolu hazinede tüccar mal götürmez, vergi boşa gider. Harcamanın tam zamanı: bir yükseltme, bir bina, belki bir hediye?`,
        `Hazinedar kapıyı ancak omzuyla kapatabildi, lordum: ${g} / ${cap} altın. Dolu hazinede tüccar mal götürmez, vergi de boşa akar. Bir yükseltme ya da yeni bir bina tam zamanı.`,
        `Lordum, kasalar dolu: ${g} / ${cap} altın. Bundan sonra gelen altın boşa gider ve tüccar evde oturur. Harcayalım: bir bina, bir yükseltme, belki bir komşuya hediye.`,
        `Hazineye bir altın daha atsam taşacak, lordum: ${g} / ${cap}. Tüccar dolu hazineye mal satmaz, vergi de kaybolur. Altını taşa, keresteye, şana çevirelim.`,
        `Lordum, ${g} altınla hazinenin sınırına (${cap}) dayandık. Burada duran altın yalnızca parlar, işe yaramaz. İnşa menüsünde harcayacak çok şey var.`,
      ]
    },
    go: { label: 'İnşa menüsü', act: tab('build') },
    jokes: [
      ['Altınlarımla yüzeceğim', 'Denedim, lordum. Altın suda yüzmez; ben de yüzemedim.'],
      ['Yastığımın altına koyarım', 'Denedim, lordum; sabah boynum tutuldu, altınlar da yine hazineye sığmadı.'],
      ['Elçime ikramiye', 'Ah, lordum, ne incelik! Ama kabul edemem... Gerçi... Hayır, edemem. Önce bir yapı.'],
      ['Altından heykelimi diktiririm', 'Heykeltıraş ölçü almak istedi, lordum; ama heykel üretmez. Önce işe yarar bir şey, sonra şatafat.'],
    ],
  },
  {
    id: 'clogged',
    when: ({ kingdom: k, now }) => hasPalace(k) && clogsOf(k, now).length > 0,
    say: ({ kingdom: k, now }) => {
      const c = clogsOf(k, now).length
      return [
        `${c} yapımızın işi boşa gidiyor, lordum: ürettiklerine yer yok. Haritada üstlerinde sarı ünlemler sallanıyor; ben de sallanıyorum, endişeden.`,
        `Lordum, ${c} yapımız boşuna çalışıyor: ürettiklerinin konacak yeri kalmadı. Ürünü değiştirin, ambarı büyütün ya da malı satın.`,
        `${c} yapıda işçiler eli kolu bağlı duruyor, lordum; ambar ya da cephanelik dolu. Ya ürünlerini değiştirelim ya da depoya yer açalım.`,
        `Üretim ağı tıkandı, lordum: ${c} yapının emeği boşa gidiyor. Bina menüsünde neyin dolduğu ve çaresi yazıyor; ben de burada endişeyle bekliyorum.`,
        `Lordum, ${c} yapının üstünde sarı ünlemler sallanıyor; dolmuş bir ambar ya da cephanelik yüzünden. İşçileri başka yere verelim ya da yer açalım.`,
      ]
    },
    go: { label: 'Cephaneliğe bak', act: tab('store', 'store', 'armory') },
    jokes: [
      ['Ünlemler süs olsun', 'Sarı yakışıyor, lordum; ama süs için çok pahalı. Her biri boşa giden bir emek.'],
      ['İşçiler dinlensin', 'Dinlenmiyorlar ki, lordum; çalışıp çalışıp boşa üretiyorlar. Dinlenmenin en kötüsü bu.'],
      ['Bu ünlemler ne demek?', 'Ünlem "dikkat" demek, lordum; benim dilimde de "elçiye kulak verin".'],
      ['Sarıyı severim', 'Bilmezdim, lordum. Ama ünlemler çoğalırsa haritanız civciv gibi olacak.'],
    ],
  },
  {
    id: 'palaceUp',
    when: ({ kingdom: k, now }) => {
      const p = palaceOf(k)
      return !!p && upgradeError(k, p.id, now) === null
    },
    say: ({ kingdom: k, now }) => {
      const l = palaceLevel(k, now) + 1
      return [
        `Lordum, sarayı ${l}. seviyeye yükseltmeye gücümüz yetiyor! Hudut büyür, yeni yapılar açılır, nüfus sınırı artar. Bir de şatafat, unutmayalım.`,
        `Hazine ve ambarlar yetiyor, lordum: saray ${l}. seviyeye çıkabilir! Hudut genişler, nüfus sınırı artar ve yeni yapılar açılır.`,
        `Mimarlar planları çoktan çizdi, lordum; sarayı ${l}. seviyeye yükseltecek her şeyimiz var. Daha geniş hudut, daha çok halk, yeni binalar.`,
        `Lordum, bir sarayın değeri yüksekliğiyle ölçülür; benim de öyle düşündüğümü bilirsiniz. ${l}. seviye için gerekenler hazır: hudut büyür, yeni yapılar açılır.`,
        `Komşular sarayınıza bakıp burun kıvırıyor, lordum; oysa ${l}. seviyeye çıkacak gücümüz var. Yükseltince hudut genişler, nüfus sınırı artar.`,
      ]
    },
    go: { label: 'Sarayı yükselt', act: open('palace') },
    jokes: [
      ['Saray bana büyük bile', 'Büyük mü? Geçen gün kraliçenin elbisesi kapıdan girmedi, lordum.'],
      ['Küçük saray yeter', 'Tevazu güzel, lordum; ama tevazuyla hudut genişlemez.'],
      ['Merdiven çıkmayı sevmem', 'Ben sizin için çıkarım, lordum; dizlerim ağlar ama sadıktır.'],
      ['Yükseklik korkum var', 'Pencereden bakmayın, lordum; yeni kattan yalnızca rakiplerin küçüldüğünü görürsünüz.'],
    ],
    snooze: 10,
  },
  {
    id: 'liege',
    when: ({ kingdom: k, now, crowns }) => crowns > 1 && k.liege === undefined && fealtyOpen(k, now),
    say: ({ online }) => {
      const cs = online.crowns.join(' ile ')
      const l = balance.cities.crown.requiredForPalaceLevel
      return [
        `Henüz hiçbir taca biat etmediniz, lordum. ${cs} iki taç; sarayı ${l}. seviyeye yükseltmek için birine bağlı olmanız gerekiyor. Seçim sezon boyunca kalıcı; iyi düşünün, ama çok uzun değil.`,
        `Lordum, ${cs} sizi bekliyor; ikisi de adınızı kendi sancağının yanında görmek istiyor. Biat etmeden saray ${l}. seviyeye çıkmaz. Seçim kalıcı, ona göre.`,
        `Henüz kimsenin lordu değilsiniz, lordum; ${cs} arasında bir seçim yapmalısınız. Sarayın ${l}. seviyesi için biat şart ve sezon boyunca değişmez. Kendi tacınızın devriyesi bahşiş getirir, öbürü haraççı gönderir.`,
        `İki taç, iki sancak, lordum: ${cs}. Birine biat etmeden saray ${l}. seviyeye yükselmez. Acele etmeyin ama oyalanmayın da; ben bu ikisini aynı anda yapmayı kırk yılda öğrendim.`,
        `Lordum, taçların ulakları koridorda bekliyor, ben de onları oyalamaktan yoruldum. ${cs}: biri seçilmeli. Biat sezon boyunca kalıcıdır ve ${l}. seviye saray için şarttır.`,
      ]
    },
    go: { label: 'Bağlılık bölümü', act: tab('kingdom', 'palace', 'level') },
    jokes: [
      ['Kendi tacımı yaparım', 'Kuyumcuya sordum, lordum. Taç yapar ama krallık yapmıyormuş.'],
      ['Yazı tura atalım', 'Attım, lordum; para dik düştü. Tanrılar da kararsız. Seçim yine sizde.'],
      ['İkisine de biat ederim', 'Ederdiniz, lordum, ama taçlar kıskançtır; yalnızca biri seçilir, o da kalıcıdır.'],
      ['Bağımsız kalırım', 'Kalırsınız, lordum; ama sarayınız da olduğu yerde kalır.'],
    ],
  },
  {
    id: 'queen',
    when: ({ kingdom: k, now }) => !k.queen && !k.queenHeldBy && queenError(k, now) === null,
    say: () => {
      const h = balance.society.happiness.queen
      const l = balance.dynasty.queenForPalaceLevel
      const g = n(balance.society.queen.cost.gold)
      return [
        `Saray çok sessiz, lordum. Bir kraliçe halkın mutluluğunu ${h} artırır, hanedanı sürdürür ve sarayın ${l}. seviyesi için şarttır. Bedeli ${g} altın; aşkın fiyatı biraz yüksek, kabul.`,
        `Lordum, sarayın koridorlarında yalnızca benim ayak seslerim yankılanıyor. Bir kraliçe mutluluğu ${h} artırır, hanedanı sürdürür ve ${l}. seviye saray için şarttır. Bedeli ${g} altın.`,
        `Halk bir kraliçe istiyor, lordum; düğün olursa şenlik de olur. Kraliçe mutluluğu ${h} artırır, çocuklarla hanedan büyür, ${l}. seviye saray da onsuz olmaz. Bedeli ${g} altın.`,
        `Saray terzisi gelinlik dikmek için yanıp tutuşuyor, lordum. Kraliçe halkın mutluluğuna ${h} katar, varis doğurur ve sarayın ${l}. seviyesi için gerekir. Bedeli ${g} altın; terziyi ben ikna ederim.`,
        `Lordum, tahtın iki kişilik olduğunu hatırlatırım. Kraliçe mutluluğu ${h} artırır, hanedanı sürdürür; ${l}. seviye saray için de şarttır. ${g} altına bu fırsat kaçmaz.`,
      ]
    },
    go: { label: 'Kraliçe getir', act: tab('people', 'people', 'queen') },
    jokes: [
      ['Ben evlenmem', 'Babanız da öyle derdi, lordum. Sonra annenizi gördü ve kırk gün şiir yazdı.'],
      ['Tahtımı kimseyle paylaşmam', 'Tahtı değil, lordum, sarayı paylaşırsınız. Tahtın yarısı zaten hep boş duruyor.'],
      ['Önce âşık olmalıyım', 'Aşk sonradan gelir, lordum; kırk yıllık evli bir elçi olarak söylüyorum. Gelmese de kraliçe mutluluk verir.'],
      ['Kraliçe pahalı', 'Pahalı, lordum; ama bir savaştan ucuz. Yalnız casuslara karşı iyi koruyalım; kaçırmayı severler.'],
    ],
  },
  // The lord's house (CLAUDE.md §9.1.1): a pretender out, a brother turning sour, a princess of age at court.
  {
    id: 'pretender',
    when: ({ kingdom: k }) => !!k.pretender && !k.pretender.marching,
    say: ({ kingdom: k, now }) => {
      const p = k.pretender!
      const m = Math.max(0, Math.ceil((p.marchAt - now) / 60_000))
      const s = campSoldiers(p, now)
      return [
        `Lordum, kardeşiniz ${p.person.name} karargâhında ${s} asiyle tahtınızı bekliyor. ${m} dakika sonra sarayınıza yürür; karargâhı şimdi dağıtmak sonradan surlarda dövüşmekten iyidir.`,
        `${p.person.name} karargâhına her gün yeni asiler katılıyor, lordum: ${s} oldular. ${m} dakika var; bir ordu gönderin ya da tacınızdan yardım isteyin.`,
        `Lordum, karargâhtan davul sesleri geliyor. ${p.person.name} ${s} asiyle hazırlanıyor ve ${m} dakika sonra kapımızda olacak. Çadırları şimdi yıkmak, sonra surlarda kan dökmekten iyidir.`,
        `Kardeşiniz ${p.person.name} kendine taç bile yaptırmış, lordum; tenekeden ama parlıyor. ${s} asisi var, ${m} dakikası var. Hanedan bölümünden ordu gönderebilirsiniz.`,
        `Lordum, isyan büyüdükçe zorlaşır: ${p.person.name} şimdi ${s} asiyle, ${m} dakika sonra daha fazlasıyla sarayımıza yürür. Ordu ya da taçtan yardım; ikisi birden de olur.`,
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [
      ['Kardeşim beni sever', 'Severdi, lordum. Şimdi çadırında sizin portrenize ok atıyor.'],
      ['Gelsin, surlarım sağlam', 'Sağlam, lordum; ama kardeşiniz surların zayıf yerini bilir. Çocukken oradan kaçardınız ikiniz.'],
      ['Ona bir mektup yazarım', 'Yazdım, lordum, sizin adınıza. Cevap olarak mektubu ok ucuna takıp geri yolladı.'],
      ['Annem bizi barıştırır', 'Kraliçe ana denedi, lordum. Şimdi o da karargâha pasta gönderiyor; kimin tarafında, belli değil.'],
    ],
  },
  {
    // The liege backed a beaten pretender: the lord may go over to the rival crown, for a while (CLAUDE.md §9.1.1).
    id: 'liegeOffer',
    when: ({ kingdom: k, now, crowns }) => !!k.liegeOffer && !liegeSwitchError(k, now, crowns),
    say: ({ kingdom: k, now, online }) => {
      const o = k.liegeOffer!
      const m = Math.max(1, Math.ceil((o.until - now) / 60_000))
      const from = online.crowns[o.from] ?? 'tacınız'
      const to = online.crowns[o.to] ?? 'rakip taç'
      return [
        `Lordum, ${from} kardeşiniz ${o.name}'in tarafını tuttu. Bunu yutacak mıyız? ${m} dakika içinde ${to} tarafına geçebiliriz; ya da sadık kalır, özürlerini ve altınlarını alırız.`,
        `${from} size sırtını döndü, lordum. ${to} kapısını açık tutuyor, ama yalnızca ${m} dakika daha. Karar sizin: intikam mı, özür mü?`,
        `Bir taç kendi lorduna karşı davacıyı destekler mi? ${from} destekledi. ${m} dakikanız var, lordum: ${to} sancağına geçin ya da sadakatinizin bedelini isteyin.`,
        `${to} ulağı koridorda bekliyor, lordum; elinde yeni bir sancak. ${m} dakika sonra gidecek. ${from} ise özür mektubunu yazmış, mührünü basmayı bekliyor. Hangisini açalım?`,
        `Lordum, ihanete ihanetle mi, sadakatle mi karşılık vereceğiz? ${from} ${o.name}'i destekledi; ${to} kapısı ${m} dakika daha açık. Seçim sezon boyunca bir daha gelmez.`,
      ]
    },
    go: { label: 'Kararı ver', act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      ['İkisine de biat etsem?', 'Denendi, lordum. O lordun başı şimdi iki başkentin surlarında, yarısı birinde yarısı öbüründe.'],
      ['Yazı tura atalım', 'Attım, lordum; para yine dik düştü. Bu parayı artık kimseye göstermiyorum.'],
      ['Elçi efendi ne derse o', 'Beni bu kadar önemsemeniz gururumu okşadı, lordum; ama taç değiştiren lordun elçisinin başı da değişir. Karar sizin.'],
      ['Bekleyelim, bakalım', 'Bekleriz, lordum; ama teklif beklemez. Saat dolunca ulak atına biner, kapı kapanır.'],
    ],
    snooze: 5,
  },
  {
    // The two crowns at war (CLAUDE.md §7.8): tribute is dearer, the liege's patrol tips more.
    id: 'crownWar',
    when: ({ kingdom: k, now, crowns }) => crowns > 1 && k.lobbyKey !== undefined && k.liege !== undefined && k.liege !== null && crownWays(k, k.liege, now).rivalry.stance === 'war',
    say: ({ kingdom: k, now }) => {
      const w = crownWays(k, k.liege!, now)
      const m = Math.max(1, Math.ceil((w.rivalry.until - now) / 60_000))
      const fx = balance.cities.crown.rivalry.effects.war
      return [
        `Taçlar savaşta, lordum! ${m} dakika daha sürecek gibi. Rakip haraççılar ×${String(fx.tribute).replace('.', ',')} ister; hazineyi şişirmeyin, harcayın.`,
        `Sınırlarda taç savaşı var. Tacımız sadık lordlarını kolluyor: devriyenin bahşişi ×${String(fx.tip).replace('.', ',')}. Bir eğlence merkeziniz varsa şimdi tam zamanı.`,
        `Lordum, iki taç birbirine girdi. Savaş bittiğinde kazanan tacın lordları gururlanır; dua edelim de bizimki kazansın.`,
        `Başkentlerde savaş borusu çalıyor, lordum; ${m} dakika daha sürecek. Rakip haraççılar hazinenin daha çoğunu ister, tacımız da lordlarına daha cömert davranır.`,
        `Taç savaşı, lordum! Biz bu kavgada kılıç sallamıyoruz ama keselerimiz sallanıyor: rakip haraç ×${String(fx.tribute).replace('.', ',')}, devriyenin bahşişi ×${String(fx.tip).replace('.', ',')}.`,
      ]
    },
    go: { label: 'Krallık bölümü', act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      ['Ben de katılayım mı?', 'Taçlar lordların kılıcını değil kesesini ister, lordum. Kesenizi sıkı tutun.'],
      ['Kim kazanır sence?', 'Ben hep kazananın elçisiyim, lordum; savaş bitince söylerim.'],
      ['Uzaktan seyrederiz', 'Ben de bir tas leblebi kaptım, lordum; seyirlik bir savaş. Yalnız haraççılar seyirci bırakmaz.'],
      ['Bize ne taçların kavgasından', 'Haraççılara bunu siz söyleyin, lordum; onlar kavganın masrafını bizim hazinemizden çıkarıyor.'],
    ],
    snooze: 60,
  },
  {
    // A rival ruler who asks a lot (CLAUDE.md §7.8): keep the treasury lean.
    id: 'rivalRuler',
    when: ({ kingdom: k, now, crowns }) => crowns > 1 && k.lobbyKey !== undefined && k.liege !== undefined && k.liege !== null && crownWays(k, k.liege === 0 ? 1 : 0, now).trait.tribute > 1,
    say: ({ kingdom: k, now, online }) => {
      const rival = k.liege === 0 ? 1 : 0
      const h = crownHouseAt(k, rival, now)
      const t = crownWays(k, rival, now).trait
      return [
        `${online.crowns[rival] ?? 'Rakip taç'} tahtında ${h.title} oturuyor, lordum; ${t.name.toLocaleLowerCase('tr-TR')} biri. Haraççıları hazinenin daha çoğunu ister: altını hazinede bekletmeyin.`,
        `Rakip tacın hükümdarı ${h.title} pek ${t.name.toLocaleLowerCase('tr-TR')}, lordum. Haraç günü gelmeden altını binalara, askere ya da siparişlere yatırın.`,
        `Lordum, ${online.crowns[rival] ?? 'rakip taç'} haraççıları hazinenin payını ister; ${h.title} gibi ${t.name.toLocaleLowerCase('tr-TR')} bir hükümdarın haraççıları daha da çoğunu. Dolu kasa onların iştahını açar.`,
        `${h.title} hakkında bir söz dolaşıyor, lordum: "${t.name.toLocaleLowerCase('tr-TR')} hükümdarın haraççısı da açgözlü olur." Altını hazinede tutmak, onlara hazır sofra kurmaktır.`,
        `Lordum, haraççılar yarım saatte bir gelir ve hazinenin payını alır. ${h.title} tahtta oldukça bu pay büyük; altını işe koşalım, kasada uyutmayalım.`,
      ]
    },
    go: { label: 'Krallık bölümü', act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      ['Altını gömerim', 'Gömdünüz mü, lordum? Bahçıvan buldu, sayıp hazineye geri koydu. Dürüst adam, ne yazık ki.'],
      ['Hükümdara bir mektup yazarım', 'Yazdım, lordum; cevabında "haraç az" diyor. Mektubu bir daha yazmayalım.'],
      ['Haraççıları kapıda oyalarım', 'Oyalamayı ben de denedim, lordum; beş dakika sonra haraç kendiliğinden ödendi, üstüne fazlası.'],
      ['Ne kadar isterlerse isterler', 'İsterler, lordum, ama alamadıklarını alamazlar. Boş kasa en iyi kalkandır.'],
    ],
    snooze: 90,
  },
  {
    id: 'kinSour',
    when: ({ kingdom: k, now }) => !k.pretender && !!k.dynasty && siblingsOf(k.dynasty).some((p) => hasOpinion(p, now) && opinionOf(k, p, now).ruler < balance.dynasty.intrigue.opinion.warn),
    say: ({ kingdom: k, now }) => {
      const p = siblingsOf(k.dynasty!).filter((x) => hasOpinion(x, now)).sort((a, b) => opinionOf(k, a, now).ruler - opinionOf(k, b, now).ruler)[0]
      return [
        `Kardeşiniz ${p.name} sofrada size hiç bakmıyor, lordum. Bir görev ya da küçük bir hediye gönlünü alır; yoksa bir gün asker toplayıp tahtınızı ister.`,
        `Lordum, ${p.name} saray kapısında fısıldaşıyor. Hoşnutsuz bir kardeş en tehlikeli düşmandır: ona bir kasabanın valiliğini verin ya da hazineden bir kese yollayın.`,
        `${p.name} ava çıktı, lordum, ama av yerine askerlerle konuştuğunu gördüm. Gönlü soğuk bir kardeş bir gün karargâh kurar; bir görev ya da hediye, şimdiden.`,
        `Lordum, ${p.name} sizin sağlığınıza kadeh kaldırmayı unuttu; dün de, önceki gün de. Bir hediye kesesi hafızasını tazeler.`,
        `Saray kulağı fısıldıyor, lordum: ${p.name} memnun değil. İşsiz kardeş kötü fikir üretir; ona bir görev verin, meşgul olsun.`,
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [
      ['Kardeşimden korkmam', 'Korkmayın, lordum; ama yatağınızın altına bakmayı da ihmal etmeyin.'],
      ['Çocukken iyi anlaşırdık', 'O zaman taht yoktu, lordum, yalnızca tahta at vardı. Onu da hep siz binerdiniz, hatırlıyor.'],
      ['Ona bir şiir yazayım', 'Şiir güzel, lordum; ama kardeşiniz şiir okumaz, kese sayar.'],
      ['Elçi efendi onu yatıştırsın', 'Denedim, lordum; bir saat konuştum. Sonunda o da yatıştı, ben de; ikimiz de uyuyakaldık.'],
    ],
  },
  {
    id: 'princess',
    when: ({ kingdom: k, now }) => !!k.dynasty && palaceLevel(k, now) >= 2 && [...k.dynasty.children, ...siblingsOf(k.dynasty)].some((p) => p.sex === 'f' && ofAge(p, now)),
    say: () => {
      const m = balance.dynasty.intrigue.marriage
      return [
        `Saraydaki prensesimiz evlenme çağında, lordum. Taca gelin verirsek taçla ilişkimiz +${m.crown.relation} artar; bir kasabaya verirsek kasaba sadık kalır, kimsenin olmayan bir kasaba ise kılıçsız bizim olur.`,
        `Lordum, prensese talipler kapıda kuyruk oldu. Bir lorda gelin verirseniz ilişkiniz +${m.lord.relation} artar; taca ya da bir kasabaya vermek de akıllıca olur.`,
        `Saray terzisi yine gelinlik ölçüsü istiyor, lordum. Prenses evlenme çağında; taca verirsek ilişki +${m.crown.relation}, sahipsiz bir kasabaya verirsek kasaba kılıçsız bizim.`,
        `Lordum, bir prenses sarayda bir hazinedir, evlendirildiğinde ise bir ittifak. Taç, kasaba ya da bir lordun hanedanı; her birinin ayrı bir kazancı var.`,
        `Prenses bahçede papatya falı bakıyor, lordum: "seviyor, sevmiyor". Kimin sevdiğini bilmiyoruz ama kimin işine yarayacağını biliyoruz: Hanedan bölümünde "Evlendir".`,
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [
      ['Kızım kimseyle evlenmez', 'O da öyle diyor, lordum; ama şövalye turnuvasında gözü birine takıldı.'],
      ['Elçi efendi evlensin', 'Teşekkür ederim, lordum, ama ben kırk yıldır elçiliğe nişanlıyım. Kıskançtır.'],
      ['Önce ben bir görüşeyim', 'Görüşün, lordum; ama damat adaylarını ben de gördüm. Çoğu sizden korkuyor; bu iyi bir işaret.'],
      ['Çeyiz çok pahalı', 'Pahalı, lordum; ama bir kasabayı kılıçsız almak bir ordudan ucuzdur.'],
    ],
  },
  {
    id: 'barracks',
    when: (c) => unlocked(c, 'barracks') && count(c.kingdom, 'barracks') === 0,
    say: () => [
      `Bir kışlamız yok, lordum. Komşular şimdilik gülümsüyor ama gülümseme kılıç değildir. Kışla mızrakçı, okçu ve daha fazlasını yetiştirir.`,
      `Lordum, savunmamız şu an bir bekçi, bir köpek ve bendenizden ibaret. Bir kışla kurarsak mızrakçı, okçu, sonra süvari yetiştiririz.`,
      `Komşuların ordusu var, lordum; bizimkinin adı bile yok. Kışla, asker havuzundan mızrakçı ve okçu yetiştirir; 2. seviyede süvari de.`,
      `Barış uzun sürsün isterim, lordum; ama barışı en çok kılıcı olan sürdürür. Bir kışla kuralım: mızrakçı süvariyi, okçu mızrakçıyı yener.`,
      `Haydutlar yollarda dolaşıyor, rakipler sınırları ölçüyor, lordum. Kışla olmadan tek asker yetiştiremeyiz; kasabalar da kendiliğinden fethedilmez.`,
    ],
    go: { label: 'Kışla kur', act: build('barracks') },
    jokes: [
      ['Dostluk yeter', 'Dostluk güzel, lordum; ama kapıyı çalan haydutlara dostluk şiiri okumayı denedim, olmadı.'],
      ['Ben kendim dövüşürüm', 'Kılıcınızı aradım, lordum; duvarda süs olarak asılı, paslı. Kışla daha güvenli.'],
      ['Asker çok yer', 'Yer, lordum; her tur yemek ve maaş ister. Ama düşman daha çok yer: bütün ambarı.'],
      ['Elçi efendi korur bizi', 'Korurum, lordum, sözle. Düşman ok atınca söz biraz yavaş kalıyor.'],
    ],
  },
  {
    id: 'spyHouse',
    when: (c) => unlocked(c, 'spyHouse') && count(c.kingdom, 'spyHouse') === 0 && count(c.kingdom, 'barracks') > 0,
    say: () => [
      `Komşularımızın ne yaptığını hiç bilmiyoruz, lordum. Bir casus evi kurarsak hem onları gözetleriz hem de onların casuslarını yakalarız.`,
      `Lordum, komşuların ambarında ne var, ordusu ne kadar, bilmiyoruz. Bir casus evi kurarsak öğreniriz; evde kalan casuslar da onlarınkini yakalar.`,
      `Bilgi kılıçtan keskindir, lordum. Casus evi casus yetiştirir: başkalarının malını, ordusunu, elçilerini gözetler. Evdeki casuslar karşı casusluk yapar.`,
      `Rakipler bizi gözetliyor olabilir, lordum; biz onları gözetlemiyoruz. Bu hiç adil değil. Bir casus evi kurarsak hem bakarız hem de bize bakanı yakalarız.`,
      `Lordum, söylentiye göre komşu lord bizim hazineyi saymış; biz onunkini sayamıyoruz. Casus evi bu dengesizliği düzeltir.`,
    ],
    go: { label: 'Casus evi kur', act: build('spyHouse') },
    jokes: [
      ['Ben her şeyi duyarım', 'Duyduğunuz, lordum, mutfaktaki aşçının dedikoduları. Gerçek casuslar daha az konuşur.'],
      ['Kapıları dinlerim', 'Saray kapılarını dinlediğinizi biliyorum, lordum; geçen gün aşçıyla beni duydunuz. Komşunun kapısı biraz uzakta ama.'],
      ['Casusluk ayıptır', 'Ayıptır, lordum; o yüzden kimseye söylemeyiz. Ben de söylemem. Belki birine.'],
      ['Komşular dürüst insanlar', 'Komşular da bizim için öyle diyor, lordum. Ben ikinize de inanmıyorum.'],
    ],
  },
  {
    id: 'market',
    when: (c) => unlocked(c, 'market') && count(c.kingdom, 'market') === 0 && count(c.kingdom, 'barracks') + count(c.kingdom, 'spyHouse') > 0,
    say: () => [
      `Pazarımız yok, lordum. Pazar, eksik malı altınla satın almaya yarar; bir gün savaş malzemesi bitince bana teşekkür edersiniz.`,
      `Lordum, bir mal eksik kalınca pazar yoksa beklemekten başka çare kalmaz. Pazar, eksik malı altınla almanızı sağlar; her alınan birim bir sonrakini biraz pahalandırır.`,
      `Pazarımız yok, lordum; altınımız var ama altın yenmez. Pazar kurarsak yemek, yapı ve savaş malzemesini lobi fiyatının biraz üstüne alırız.`,
      `Hazinede altın, ambarda boşluk, lordum: bu ikisini buluşturan yere pazar denir. Kuralım; eksik mal için üretimi beklemeyiz.`,
      `Lordum, savaşın ortasında savaş malzemesi biterse ne yapacağız? Pazar olursa altınla alırız. Ben her zaman önceden düşünürüm; bu yüzden hâlâ hayattayım.`,
    ],
    go: { label: 'Pazar kur', act: build('market') },
    jokes: [
      ['Takasla idare ederiz', 'Takası denedim, lordum; bir keçiye üç tavuk istediler. Altın daha kolay.'],
      ['Pazarlık sevmem', 'Pazarda pazarlık yok, lordum; fiyat bellidir. Ben de çok üzüldüm.'],
      ['Her şeyi kendimiz üretiriz', 'Güzel bir hayal, lordum; ama bazen tarla yetmez, bazen orman. O gün pazar lazım.'],
      ['Pazar çok kalabalık olur', 'Olur, lordum; ben de kalabalığın içinde söylentileri toplarım. Bir taşla iki kuş.'],
    ],
  },
  {
    id: 'warehouse',
    when: (c) => unlocked(c, 'warehouse') && count(c.kingdom, 'warehouse') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: ({ kingdom: k, now }) => {
      const cap = n(storageCap(k, now))
      return [
        `Ambarlarımız yalnızca ${cap} birim tutuyor, lordum. Bir ambar, her maldan çok daha fazlasını saklar; fareler de sevinir ama onları saymayalım.`,
        `Lordum, depomuz her maldan yalnızca ${cap} birim alıyor; fazlası boşa gidiyor. Bir ambar kurarsak depo sınırı büyür.`,
        `Depo sınırımız ${cap}, lordum; iyi bir hasatta çabucak dolar. Bir ambar, yani güzel kırmızı bir ahır, her maldan çok daha fazlasını saklar.`,
        `Her maldan ${cap} birim, lordum; o kadar. Ambar kurarsak bu sınır büyür, mallar boşa gitmez, ben de geceleri rahat uyurum.`,
        `Lordum, ambarcı dert yanıyor: her maldan ${cap} birimden fazlasına yer yok. Bir ambar ve sonra yükseltmeleri, daha çok yer demek.`,
      ]
    },
    go: { label: 'Ambar kur', act: build('warehouse') },
    jokes: [
      ['Fazlasını yeriz', 'Siz yersiniz, lordum, ben de yerim; ama yapı malzemesini yemek zor.'],
      ['Sarayın bodrumu yeter', 'Bodrum şarap fıçılarıyla dolu, lordum; onlara dokunmayalım.'],
      ['Kırmızı sevmem', 'Ambar kırmızı olur, lordum, gelenek. İsterseniz ben arkamı dönüp bakmam.'],
      ['Fareler ne der?', 'Fareler alkışlar, lordum; ama neyse ki fareler oy vermez.'],
    ],
  },
  {
    id: 'wall',
    when: (c) => unlocked(c, 'wall') && count(c.kingdom, 'wall') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: () => [
      `Lordum, sarayın çevresinde tek bir taş sur yok. Surlar kuşatmada savunmayı güçlendirir. Bir sur kapısı koymayı unutmayın; yoksa halkı içeri kilitler, kendinize hapishane yaparsınız.`,
      `Lordum, sarayımızı hiçbir sur korumuyor; düşman ordusu kapıya kadar yürüyebilir. Surlar kuşatmada savunmayı güçlendirir. Ama bir sur kapısı koyun; yoksa halk dışarı çıkamaz.`,
      `Taş taş üstüne, lordum: surlar kuşatmada sarayı korur. Yalnız bir uyarı: sarayı kapısız çevirirseniz halkı içeri kilitler, kendinize bir hapishane kurarsınız.`,
      `Bir saray, surları kadar sağlamdır, lordum. Sur çekelim; köylüler ve tüccar yalnızca kapıdan geçer, o yüzden bir sur kapısı şart.`,
      `Lordum, rakip lordun casusu surlarımızı saymaya geldi ve sıfırda kaldı. Biraz sur çekelim; kuşatmada fark eder. Kapıyı unutursak halk dışarı çıkamaz, söyleyeyim.`,
    ],
    go: { label: 'Sur çekelim', act: build('wall') },
    jokes: [
      ['Düşman kibar olur', 'Düşman çok kibardır, lordum; kapınızı kırmadan önce mutlaka "affedersiniz" der.'],
      ['Kapım herkese açık', 'Misafirperversiniz, lordum; düşman da bunu çok sever.'],
      ['Surlar manzarayı kapatır', 'Manzarayı kuleden seyredersiniz, lordum; düşman ise surları dışarıdan seyreder.'],
      ['Okçularım yeter', 'Okçular da bir duvarın arkasında durmayı sever, lordum; açıkta pek cesur olmazlar.'],
    ],
  },
  {
    id: 'housing',
    when: ({ kingdom: k, now }) => {
      if (!hasPalace(k)) return false
      const p = population(k, now)
      return p.room - p.people < 0.5 && p.room + p.soldiers + p.sailors < popCapFor(palaceLevel(k, now)) - 2 && count(k, 'house') > 0
    },
    say: () => [
      `Evlerin hepsi dolu, lordum; gelmek isteyen köylüler kapıda bekliyor. Bir ev daha kurarsak halk büyür, vergi artar.`,
      `Lordum, her ev ağzına kadar dolu; yeni köylüler yer bulamadan kapıda bekliyor. Bir ev daha, daha çok halk ve vergi demek.`,
      `Evlerde boş bir yatak bile kalmadı, lordum. Köylüler yalnızca yer olunca gelir; bir ev kuralım ya da var olanı yükseltelim.`,
      `Halk büyümek istiyor ama sığacak yer yok, lordum. Ev kurmak ya da evleri yükseltmek, büyümenin yolu.`,
      `Lordum, nüfus sınırına daha var ama evler dolu. Yeni bir ev açarsak köylüler zamanla gelir; gelenler çalışır ve vergi öder.`,
    ],
    go: { label: 'Ev kur', act: build('house') },
    jokes: [
      ['Çadır kursunlar', 'Çadır kurdular, lordum. Rüzgâr esti, şimdi komşu lordun tarlasındalar.'],
      ['Üst üste yatsınlar', 'Yattılar, lordum; en alttaki itiraz etti, şimdi o da kapıda.'],
      ['Saraya alalım', 'Saray hizmetlileri buna razı değil, lordum; sizin yatağınızı da paylaşmaları gerekirdi.'],
      ['Kalabalıktan hoşlanmam', 'Siz hoşlanmazsınız, lordum; hazine bayılır. Her köylü vergi demek.'],
    ],
  },
  {
    id: 'idleHands',
    when: ({ kingdom: k, now }) => {
      if (!hasPalace(k)) return false
      const p = population(k, now)
      return p.healthy - p.jobs >= 6
    },
    say: ({ kingdom: k, now }) => {
      const p = population(k, now)
      const idle = n(p.healthy - p.jobs)
      return [
        `${idle} köylü boş oturuyor, lordum; meydanda zar atıp bir de bana hile yaptılar. İşe koşalım: bir tarla, oduncu ya da atölye.`,
        `Lordum, ${idle} köylünün işi yok; çeşme başında dedikodu yapıyorlar, konu da genellikle ben. Bir tarla, oduncu kampı ya da atölye kuralım.`,
        `Boşta ${idle} köylü var, lordum. Vergilerini veriyorlar ama bir şey üretmiyorlar; bir yapıya verirsek ambar da dolar. İnşa menüsünde onlara iş bulalım.`,
        `${idle} köylü gölgede uzanmış, lordum; ben geçerken bir de ayaklarını uzattılar. Bir tarla, bir oduncu ya da bir silah atölyesi onları ayağa kaldırır.`,
        `Lordum, ${idle} çift el boşta duruyor. Yeni bir yapı kurarsak ya da var olanları yükseltirsek hepsine iş çıkar.`,
      ]
    },
    go: { label: 'İnşa menüsü', act: tab('build') },
    jokes: [
      ['Onlar da dinlensin', 'Dinlendiler, lordum; dinlenmekten yoruldular. İşe vermek iyilik olur.'],
      ['Sana nasıl hile yaptılar?', 'Altı attım, lordum, zarda yedi çıktı. Nasıl yaptıklarını hâlâ çözemedim.'],
      ['Zar oynamayı ben de severim', 'Sizinle oynamazlar, lordum; vergiyi kimin topladığını biliyorlar.'],
      ['İşsizlik geçicidir', 'Her şey geçicidir, lordum; ben hariç. Ama bir tarla bu geçiciliği hızlandırır.'],
    ],
  },
  {
    id: 'tired',
    when: ({ kingdom: k }) => !!k.nightShift && (k.fatigue ?? 0) > balance.society.night.maxFatigue * 0.5,
    say: () => [
      `Gece mesaisi halkı yordu, lordum. Yorgunluk gündüz dahil bütün üretimi azaltıyor. Bir süre kapatsak, köylüler uyusa?`,
      `Lordum, köylüler ayakta uyuyor; biri dün gece tarlada horladı. Gece mesaisinin yorgunluğu gündüz üretimini de düşürüyor. Mesaiyi bir süre kapatalım mı?`,
      `Gece de çalışmak güzel, lordum, ama yorgunluk birikti ve şimdi bütün üretimi yavaşlatıyor. Mesai kapalıyken yorgunluk yavaşça geçer.`,
      `Halkın göz altları mor, lordum. Gece mesaisi mutluluğu düşürür, yorgunluk da gündüz verimini yer. Biraz uyusunlar, sonra yine açarsınız.`,
      `Lordum, çok konuşsam da ben bile gece uyurum. Halkın yorgunluğu yarıyı geçti, üretim düşüyor. Gece mesaisine bir mola verelim.`,
    ],
    go: { label: 'Halk sekmesi', act: tab('people', 'people', 'mood') },
    jokes: [
      ['Uyku tembellere göre', 'Tembeller de üretmez, lordum, yorgunlar da. Hiç değilse tembeller mutlu.'],
      ['Bir gece daha', 'Bir gece daha, bir gece daha... Lordum, bu söz bir hanedanın sonunu getirdi; kitaplarda yazıyor.'],
      ['Ben de yorgunum', 'Siz tahtta yoruldunuz, lordum; onlar tarlada. Yine de ikinize de uyku iyi gelir.'],
      ['Çalışmak sağlıktır', 'Sağlıktır, lordum, ölçüsünde. Ölçüsüzü hastaneye gider.'],
    ],
  },
  {
    id: 'unhappy',
    when: ({ kingdom: k }) => hasPalace(k) && (k.happiness ?? 100) < 35,
    say: ({ kingdom: k }) => {
      const h = n(k.happiness ?? 0)
      return [
        `Halkın mutluluğu %${h}, lordum. Mutsuz halk yavaş büyür, kaçar ve askere yazılmaz. Vergiyi düşürmek, bir tapınak ya da kraliçe çare olabilir.`,
        `Halkın yüzü gülmüyor, lordum: mutluluk %${h}. Mutsuz halk yavaş büyür, göç eder ve askere yazılmaz. Vergiyi düşürmek, tapınak ya da kraliçe yardımcı olur.`,
        `Lordum, meydanda adınıza bir şarkı yakmışlar; nakaratı pek hoş değil. Mutluluk %${h}. Vergiyi hafifletirsek, kraliçe getirirsek ya da bir tapınak kurarsak düzelir.`,
        `Mutluluk %${h}, lordum; bu sayı bir lordun uykusunu kaçırmalı. Mutsuz halk daha az asker olur ve kaçar. Halk sekmesinde nedenleri yazıyor; bir bakalım.`,
        `Köylüler bana selam vermeyi bıraktı, lordum; mutluluk %${h}. Ağır vergi, açlık, kraliçesizlik ya da gece mesaisi olabilir. Halk sekmesinde hepsini görürüz.`,
      ]
    },
    go: { label: 'Mutluluğa bak', act: tab('people', 'people', 'mood') },
    jokes: [
      ['Gülmeyi yasaklayalım', 'Yasakladık, lordum; şimdi gizlice gülüyorlar. Daha da mutsuz oldular.'],
      ['Ozan çağıralım', 'Çağırdım, lordum; ozan da mutsuzmuş. Şimdi hüzünlü şarkılar söylüyor.'],
      ['Mutluluk abartılıyor', 'Abartılıyor olabilir, lordum; ama göç abartılmıyor, gerçekten gidiyorlar.'],
      ['Ben mutluyum ama', 'Size ne kadar sevindiğimi bilemezsiniz, lordum; ama mutsuz halk vergi verecek kadar kalmaz.'],
    ],
  },
  {
    id: 'sick',
    when: (c) => (c.kingdom.sickness ?? 0) > 0.15 && unlocked(c, 'hospital') && count(c.kingdom, 'hospital') === 0,
    say: ({ kingdom: k }) => {
      const p = pct(k.sickness ?? 0)
      return [
        `Halkın ${p} hasta, lordum. Hasta köylü çalışmaz, vergi vermez. Bir hastane kurarsak doktorlar onları iyileştirir.`,
        `Lordum, halkın ${p} yatakta. Hasta köylü çalışmaz, vergi vermez, keyfi de kaçar. Hastane kurarsak doktorlar onları çok daha çabuk iyileştirir.`,
        `Öksürük sesinden kendi sesimi duyamıyorum, lordum: halkın ${p} hasta. Hastanenin doktorları her tur hastaların bir payını iyileştirir.`,
        `Halkın ${p} hasta, lordum; kışın hastalık daha da hızlı yayılır. Bir hastane kuralım, köylüler tarlaya dönsün.`,
        `Lordum, şifacı kadın otlarıyla yetişemiyor: halkın ${p} hasta. Hastane olursa hem iyileşirler hem de işlerine dönerler.`,
      ]
    },
    go: { label: 'Hastane kur', act: build('hospital') },
    jokes: [
      ['Sarımsak yesinler', 'Yediler, lordum; hâlâ hastalar ama artık kimse yanlarına yaklaşmıyor.'],
      ['Kendiliğinden geçer', 'Geçer, lordum, yavaşça. Ama o yavaşlıkta ambar da yavaşça boşalır.'],
      ['Ben hiç hastalanmam', 'Siz sarayda oturuyorsunuz, lordum; hastalık bile kapıda bekliyor.'],
      ['Dua edelim', 'Ettim, lordum; cevap olarak içime "hastane" doğdu.'],
    ],
  },
  {
    id: 'quest',
    when: (c) => {
      const k = c.kingdom
      if (k.liege === undefined || palaceLevel(k, c.now) < balance.cities.crown.quests.minPalace) return false
      const { taken, have, need } = questProgress(k, k.liege, c.now)
      return !taken || (!taken.done && have >= need)
    },
    say: (c) => {
      const { taken } = questProgress(c.kingdom, c.kingdom.liege!, c.now)
      const q = crownQuest(c.kingdom.lobbyKey, c.kingdom.liege!, c.now)
      const g = n(q.gold)
      const crown = c.online.crowns[c.kingdom.liege!] ?? 'Tacımız'
      return taken
        ? [
            `Tacımızın görevini bitirdik, lordum! ${g} altınlık ödül bizi bekliyor; taç unutkan değildir ama hazinedar biraz öyledir.`,
            `Lordum, tacın görevini tamamladık! ${g} altınlık ödülü saat dolmadan almalıyız.`,
            `Görev bitti, lordum; ödül ${g} altın ve tacın gönlü. Diplomasi sekmesinde "Ödülü al" demeniz yeter.`,
            `Tacın istediğini yaptık, lordum; şimdi karşılığını isteme sırası bizde: ${g} altın. Hazinede yer olduğundan emin olun.`,
            `Lordum, taç sözünü tutar; biz de tuttuk. ${g} altınlık ödül bekliyor, unutmadan alalım.`,
          ]
        : [
            `${crown} bu saat sizden bir iş istiyor; ödülü ${g} altın ve tacın gönlü. Görevi alalım mı?`,
            `${crown} bu saat için bir görev gönderdi, lordum. Bitirirsek ${g} altın ve tacın gönlü bizim. Bir bakalım mı?`,
            `Lordum, ${crown} sarayından bir ulak geldi: tacın bir isteği var. Ödülü ${g} altın; saat dolmadan bitirmek gerek.`,
            `Taçlar iş verir, lordum, akıllı lordlar da iş alır. ${crown} bu saat ${g} altınlık bir görev sunuyor.`,
            `${crown} sizi düşünüyor, lordum; taçlarda düşünmek görev demektir. Ödülü ${g} altın ve ilişkiye güzel bir dokunuş.`,
          ]
    },
    go: { label: 'Taç görevleri', act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      ['Taç beklesin', 'Bekler, lordum; ama görev saatliktir. Saat dolunca görev de gider.'],
      ['Ödül az', 'Az değil, lordum; altının yanında tacın gönlü de var. Gönül, uzun vadede çok altındır.'],
      ['Kimsenin hizmetkârı değilim', 'Değilsiniz, lordum; ama lordlar arada bir taçlarına yardım eder. Ben de size ederim, karşılıksız... neredeyse.'],
      ['Ne istiyorlar ki?', 'Diplomasi sekmesinde yazıyor, lordum; ben anlatsam süslerim, orada süssüz yazıyor.'],
    ],
    snooze: 30,
  },
  {
    id: 'town',
    when: ({ kingdom: k, online }) => (k.soldiers ?? 0) >= 10 && (k.towns?.length ?? 0) === 0 && online.towns.some((t) => t.owner === null),
    say: () => [
      `Lordum, haritada kimseye bağlı olmayan kasabalar var ve garnizonumuzda askerler esniyor. Bir ordu çıkarıp bir kasabayı kuşatırsak her turda bize katkı gönderir. Kasaba paneli "Kuşat" bölümünden başlar.`,
      `Lordum, garnizonda en az on asker var ve haritada sahipsiz kasabalar duruyor. Bir kasabaya tıklayıp "Kuşat" bölümünden ordu gönderirsek kasaba her tur bize katkı gönderir.`,
      `Askerler talimden sıkıldı, lordum; sahipsiz bir kasaba onlara iyi gelir. Kuşatma kasaba panelinin "Kuşat" bölümünden başlar; alınan kasaba her tur bir şey gönderir.`,
      `Haritada kimsenin olmayan kasabalar var, lordum; biri bizim olsa fena olmaz. Ama ölçülü! Çok kasaba aşırı büyüme cezası getirir. Kuşatma, kasaba panelindeki "Kuşat" bölümünden başlar.`,
      `Lordum, garnizondaki askerler kılıçlarını parlatmaktan içinde kendilerini görür oldu. Sahipsiz bir kasabayı kuşatalım: kasaba panelinde "Kuşat", gerisi askerlerin işi.`,
    ],
    go: { label: 'Ordu sekmesi', act: tab('army', 'army', 'land') },
    jokes: [
      ['Kasabalar kendiliğinden gelir', 'Geldiler, lordum; ama vergi memurumuzu görünce geri döndüler.'],
      ['Kasabalar barışçıdır', 'Barışçıdır, lordum; garnizonları dışında. Onlar biraz kaba.'],
      ['Askerler evde kalsın', 'Kalırlar, lordum; ama evdeki asker her tur maaş ve yemek ister, karşılığında yalnızca horlar.'],
      ['Kasaba ne işime yarar?', 'Altın, yemek, malzeme ya da köylü gönderir, lordum; sıralamada da puan. Küçük ama tatlı bir lokma.'],
    ],
  },
  {
    id: 'game',
    when: ({ kingdom: k, now }) => ARCADE_GAMES.some((g) => gameError(k, g, now) === null) || (count(k, 'fisherHut') > 0 && fishError(k, now) === null),
    say: () => [
      `Lordum, bir mini oyun oynanmayı bekliyor: okçuluk, örs başında, kervan yolu ya da balıkçı kulübesinin oltası. Küçük ödüller verir; ben de seyrederken sizi alkışlarım.`,
      `Lordum, bir oyun sizi bekliyor: kışlada okçuluk, atölyede örs, ticaret noktasında kervan yolu ya da balıkçı kulübesinde olta. Ödüller küçük ama gönül eğlencesi büyük.`,
      `Hükümdarlık yorucu iştir, lordum; biraz eğlence iyi gelir. Mini oyunlardan biri oynanabilir; ödülü hazineye, puanı sıralamaya gider.`,
      `Okçuluk meydanı boş, örs soğuk, olta kuru, lordum. Bir el oynasanız? Küçük bir ödül verir, en iyi puanınız da sıralamaya yazılır.`,
      `Lordum, en iyi puanınızı geçmenizi kimse beklemiyor; ama ben bekliyorum. Bir mini oyun oynanabilir durumda.`,
    ],
    go: { label: 'Saraya bak', act: tab('kingdom', 'palace', 'buildings') },
    jokes: [
      ['Oyun çocuklar için', 'Saraydaki çocuklar da "oyun lordlar için" diyor, lordum. Kimse oynamayınca ödül de öylece yatıyor.'],
      ['Okçulukta iyiyimdir', 'Biliyorum, lordum; geçen sefer saman hedefi ıskaladınız ama benim şapkamı vurdunuz. Rüzgârdandı, eminim.'],
      ['Elçi efendi oynasın', 'Oynadım, lordum; balık oltayı çekti, ben suya düştüm. Siz oynayın.'],
      ['Kazanırsam ne olur?', 'Biraz altın, biraz mal, lordum; bir de sıralamada adınız. Kaybederseniz yalnızca ben bilirim.'],
    ],
    snooze: 40,
  },
]

// When there is nothing to advise.
export const IDLE_LINES = [
  'Her şey yolunda görünüyor, lordum. Bu bende kuşku uyandırıyor; kırk yıllık elçilik alışkanlığı.',
  'Bugün sizi rahatsız edecek bir şey bulamadım. İsterseniz oyunun bir köşesini anlatayım?',
  'Ülkede huzur var, lordum. Ben de biraz şarap... yani su içeyim.',
  'Komşular sessiz. Sessiz komşu, ya uyuyordur ya da plan yapıyordur. Ben ikinci şıktan korkarım.',
  'Ambarlar yerinde, hazine yerinde, ben yerindeyim. Bu kadar düzen beni huzursuz ediyor, lordum.',
  'Getirecek kötü bir haberim yok, lordum; bu yüzden kendimi işsiz hissediyorum. Bir şey sormak ister misiniz?',
  'Lordum, bugün size yalnızca iltifat edeceğim: sarayınız heybetli, şapkanız da. Şapka benim tavsiyemdi.',
  'Her şey yolunda. Böyle günlerin fırtına öncesi olduğunu bilirim, lordum; ama şimdilik keyfini çıkaralım.',
  'Bugün ulaklar bile tembel, lordum; atları ahırda geviş getiriyor. Ben de onlara uydum.',
  'Söyleyecek bir derdim yok, lordum. Kırk yılda üçüncü kez başıma geliyor; tarihini not ettim.',
  'Hazinedar gülümsüyor, ambarcı ıslık çalıyor, lordum. Ya işler iyi ya da ikisi bir şey biliyor.',
  'Lordum, bugün size kötü haber getiremediğim için özür dilerim. Yarın telafi ederim, söz.',
  'Sarayda huzur var, lordum. Kraliyet kedisi bile güneşte uyuyor; ben de onu taklit etmeyi düşünüyorum.',
  'Pazarda fiyatlar yerinde, yollarda kervanlar yolunda, lordum. Benim dilim de yerinde; ona bir iş bulun.',
]

// Things to chat about when there is nothing to advise, each with a few answers.
export const SMALL_TALK: { label: string; answers: string[] }[] = [
  {
    label: 'Nasılsın, elçi efendi?',
    answers: [
      'Dizlerim yağmuru haber veriyor, dilim savaşları. Yani her zamanki gibi, lordum.',
      'İyiyim, lordum; dişlerimin yarısı ve hatıralarımın tamamı yerinde.',
      'Daha iyi olamazdım, lordum. Gerçi dün de böyle demiştim, sonra merdivenden düştüm.',
      'Bir elçi nasıl olduğunu kimseye söylemez, lordum; ama size söylerim: yorgun ama gururlu.',
      'Sabah üç merdiven çıktım, öğlen iki haber taşıdım, akşam bir şarkı söyledim, lordum. Bu yaşta fena sayılmaz.',
    ],
  },
  {
    label: 'Bir fıkra anlat',
    answers: [
      'Bir lord sarayına sur çekmiş, kapı koymayı unutmuş. Halk bir hafta içeride kalmış. Lord "Ne güzel, kimse şikâyet etmiyor" demiş. Kimse dışarı çıkıp şikâyet edemiyormuş da ondan.',
      'Bir lord tüccarına "Hiçbir şey satma" demiş. Tüccar bir hafta oturmuş, sonra gelip "Lordum, oturmaktan yoruldum, bari sandalyeyi satayım mı?" diye sormuş.',
      'Bir lord mancınığı ters kurmuş, taşı kendi sarayına atmış. "Tatbikattı" demiş. O günden beri o lordluğun tatbikatlarına herkes miğferle geliyor.',
      'Köylünün biri hastaneye gitmiş: "Doktor, her gün yorgun uyanıyorum." Doktor sormuş: "Gece mesaisi mi?" Köylü: "Ben istemedim, lordum açtı." Doktor: "O zaman ilaç bende değil, lordunda."',
      'Haraççı bir lordun kapısını çalmış: "Hazinenin payını almaya geldik." Lord kasayı açmış, içinden bir fare çıkmış. Haraççı fareyi almış, gitmiş. Fare hâlâ rakip tacın hazinesinde, kendini pek önemli sanıyormuş.',
    ],
  },
  {
    label: 'Sence iyi bir lord muyum?',
    answers: [
      'Sizden iyisini görmedim, lordum. Gerçi ben pek dışarı çıkmam.',
      'Elbette, lordum. Bir de ambarları doldurursanız kusursuz olursunuz.',
      'Kitaplar size "Büyük" diyecek, lordum. Neyin büyüğü olduğunu ben uydururum.',
      'Sizden önceki lordlara da böyle demiştim, lordum; ama size gerçekten inanarak söylüyorum. Neredeyse.',
      'Halka sordum, lordum: yarısı "iyi" dedi, yarısı "vergiye bağlı". Bence bu, bir lord için parlak bir karne.',
    ],
  },
  {
    label: 'Eski günleri anlat',
    answers: [
      'Gençken bir kraliçeyi kaçıran casusu kovaladım, lordum. Yakalayamadım ama çok güzel koştum.',
      'Eskiden elçiler atla giderdi, lordum. Şimdi de atla gidiyoruz, ama eskiden atlar daha hızlıydı. Ya da ben daha hafiftim.',
      'Bir keresinde iki lord arasında barış imzalattım, lordum. Mürekkep kurumadan savaş çıktı, ama imza çok güzeldi.',
      'Dedem de elçiydi, lordum; o da çok konuşurdu. Ailemizde sessiz biri doğsa sanırım onu evlatlıktan reddederiz.',
      'Bir kış bir taç sarayında kar yüzünden mahsur kaldım, lordum. Üç ay boyunca hükümdara masal anlattım; bahara çıktığımda o elçi olmuştu, ben neredeyse hükümdar.',
    ],
  },
  {
    label: 'Taçlar hakkında ne düşünürsün?',
    answers: [
      'Taçlar güneş gibidir, lordum: uzaktan ısıtır, yakından yakar. Biz uygun mesafede duralım.',
      'Bir taç ne verdiğini hiç unutmaz, ne aldığını da hemen unutur. Defterleri tek sayfalıktır, lordum.',
      'Gençken bir hükümdarın elini öptüm, lordum. Yüzüğü o kadar büyüktü ki burnumu çizdi; izi hâlâ duruyor.',
      'Taçlara güvenin, lordum, ama hazinenizi kilitli tutun. İkisini aynı anda yapabilen lord uzun yaşar.',
      'İki taç, iki sancak, bir sürü lord; biz de aradaki köprüyüz, lordum. Köprüye herkes basar ama köprü olmadan kimse karşıya geçemez.',
    ],
  },
  {
    label: 'Komşularımız hakkında ne biliyorsun?',
    answers: [
      'Çok şey bilirim, lordum, ama yarısını uydururum; hangi yarısı olduğunu casus evi söyler.',
      'Komşulardan biri her gece surlarını sayıyormuş, lordum. Saydıkça azalıyormuş; ben de anlamadım.',
      'Bir komşu lordun aşçısı bizim aşçının kuzeni, lordum. Mutfaktan çıkan dedikodu, casustan çıkan rapordan hızlıdır.',
      'Komşular iyi insanlar, lordum; uyurken. Uyanınca her biri bir hesap peşinde.',
      'Han söylentilerini dinlerseniz, lordum, kimin ne sattığını, kimin kime savaş açtığını öğrenirsiniz. Ben her akşam bir hana uğrarım; yalnızca işim için.',
    ],
  },
  {
    label: 'Bir öğüt ver',
    answers: [
      'Dolu ambar, dolu hazine, boş kafa: üçü bir arada olmasın, lordum. İlk ikisi tehlikelidir, üçüncüsü ölümcül.',
      'Kraliçenizi iyi koruyun, kardeşlerinizi iyi doyurun, haraççıları iyi uğurlayın, lordum. Gerisi kendiliğinden gelir.',
      'Bir lord herkesle kavga edemez, lordum; ama herkes onunla kavga etmekten çekinmeli. İkisi arasındaki ince çizgiye diplomasi denir.',
      'Tüccarınızı hiç boş oturtmayın, lordum; boş tüccar ya şarkı söyler ya dedikodu yapar, ikisi de altın getirmez.',
      'Fazla düşünen lord fırsatı kaçırır, hiç düşünmeyen tahtını, lordum. Ben arada bir düşünürüm; o yüzden hâlâ buradayım.',
    ],
  },
  {
    label: 'En sevdiğin yemek ne?',
    answers: [
      'Bal kaymak, lordum. Ama doktor yasakladı; ben de doktoru yasakladım. Şimdi ikimiz de mutsuzuz.',
      'Sarayın aşçısının kuzu güveci, lordum. Tarifini bir kez sordum; kepçeyle kovaladı.',
      'Ziyafet sofrasında başkasının tabağındaki her şey, lordum. Elçilik bunu öğretir.',
      'Kuru ekmek ve peynir, lordum; yolda yediğim. Gerçi yolda yediğim her şey kuru ekmek ve peynirdi.',
    ],
  },
]

// The list of topics, the answers to skipping a step and to closing the tutorial.
export const TOPICS_ASK = [
  'Ne öğrenmek istersiniz, lordum? Bilmediğim şey yok; olsa da söylemem.',
  'Hangi köşesini anlatayım, lordum? Kısa anlatacağım, söz. Kısa derken, elçi kısası.',
  'Sorun, lordum; kırk yılda öğrendiğimi beş dakikada anlatırım. Belki altı.',
  'Konuyu siz seçin, lordum, anlatmayı bana bırakın.',
  'Bir konu seçin, lordum; sayfa sayfa anlatırım, sıkılırsanız "Başka bir şey sor" dersiniz, gücenmem. Çok.',
]
export const SKIP_ANSWERS = [
  'Peki lordum, o işi şimdilik bir kenara koyuyorum. Sıradakine geçelim.',
  'Anlaşıldı, lordum; o adımı atlıyoruz. Her lordun kendi yolu var.',
  'Geçtik, lordum. İleride gerekirse öğreticiyi ayarlardan yeniden açarsınız, atlanan adımlar da geri gelir.',
  'Peki lordum; o binayı şimdilik hayal defterime yazıyorum. Sıradaki adım geliyor.',
  'Atlıyoruz, lordum. Ben de gençken birçok adımı atladım; çoğu merdivendi, dizlerim hâlâ hatırlar.',
]
export const TUTORIAL_OFF_ANSWERS = [
  'Peki lordum, artık kendi yolunuzu çiziyorsunuz. Bir şey sormak isterseniz sohbetin yanındaki Elçi düğmesi beni çağırır.',
  'Peki lordum; öğretmenlik bitti, danışmanlık başlıyor. Beni çağırmak için sohbetin yanındaki Elçi düğmesi yeter.',
  'Anladım, lordum, kanatlarınız çıktı. Öğreticiyi ayarlardan yeniden açabilirsiniz; ben de Elçi düğmesinin arkasında beklerim.',
  'Nasıl isterseniz, lordum. Kitabı kapatıyorum ama dilimi kapatmıyorum; Elçi düğmesine basmanız yeter.',
  'Peki lordum, ders bitti. Hocalığı bıraktım, elçiliğe döndüm; gerçi ikisi de aynı kapıya çıkar: çok konuşmak.',
]

// ---- The tutorial ----------------------------------------------------------------------------------------------------

export const STEPS: Step[] = [
  {
    id: 'palace',
    title: 'Sarayını yerleştir',
    lead: true,
    quips: [
      'Hoş geldiniz, lordum! Ben elçinizim; haberleri getirir, öğüt veririm ve fazla konuşurum.',
      'Ah, yeni lordum! Elçiniz huzurunuzda: haber taşırım, öğüt veririm; susmayı ise hiç öğrenemedim.',
      'Hoş geldiniz, lordum! Kırk yıllık elçiyim; sekiz lorda hizmet ettim, en yakışıklısı sizsiniz.',
      'Lordum, nihayet geldiniz! Ben elçinizim. Bundan sonra hep yanınızda olacağım; isteseniz de istemeseniz de.',
      'Selam olsun, lordum! Elçinizim; haberin iyisini de kötüsünü de getiririm, araya biraz da laf karıştırırım.',
    ],
    say: () => 'İlk iş: sarayı hududun içinde istediğiniz yere yerleştirin. Bedava ve anında; böyle fırsat bir daha çıkmaz.',
    done: ({ kingdom: k }) => hasPalace(k),
    cheers: [
      'Ne heybetli bir saray! Ben de bir oda kaptım, kuzey kulesinde. Rüzgâr alıyor ama manzarası güzel.',
      'Saray yerine oturdu, lordum! Temel taşına adınızı kazıttım; altına küçük harflerle benimkini de.',
      'Ne güzel bir yer seçtiniz! Bir yanda orman, bir yanda ufuk, ortada siz. Ressamlar sırada.',
      'Saray dikildi! Sancağınız göndere çekildi, ben de alkışlamaktan ellerimi acıttım.',
      'İşte sarayınız, lordum! Hizmetliler odalarına yerleşti, ben de en güzel odayı... yani size en yakın odayı aldım.',
    ],
  },
  {
    id: 'lumber',
    title: 'Oduncu kampı kur',
    say: () => 'Her yapı yapı malzemesi ister, onu da oduncu kampı üretir. İnşa sekmesinden oduncu kampını seçip haritaya yerleştirin. İnşa ettikleriniz önce bir plana eklenir: alttaki çubukta "Onayla" demeyi unutmayın. İlk oduncu kampı bedava.',
    quips: [
      'Ağaçlar şimdiden titriyor.',
      'Baltaları ben biledim; az kalsın parmağımı da.',
      'Oduncuların şarkısını duyunca anlarsınız ki iş başladı.',
      'Bedava olan şeyi geri çevirmek saraya yakışmaz.',
      '"Onayla"yı unutan ilk lord siz olmazsınız; ama son olabilirsiniz.',
    ],
    done: ({ kingdom: k }) => count(k, 'lumberCamp') > 0,
    go: { label: 'Oduncu kampı seç', act: build('lumberCamp') },
    hint: 'build',
    cheers: [
      'Baltalar parlıyor! Ormandaki sincaplar sizi şikâyet etmeye geldi ama ben savdım.',
      'Oduncu kampı kuruldu! İlk ağaç devrildi; "Dikkat!" diye bağırdılar, ben de tam altındaydım.',
      'Kamp hazır, lordum. Kereste yığılmaya başladı; marangozlar şimdiden ellerini ovuşturuyor.',
      'Ormanın sesi değişti, lordum: artık balta sesi var. Bence müzik bu.',
      'Oduncular işbaşında! Birine adını sordum, "Meşe" dedi. Tam yerinde bir adam.',
    ],
  },
  {
    id: 'house',
    title: 'Bir ev kur',
    say: () => 'Şimdi halka bir ev. Evler köylüye yer verir; yer olunca köylüler zamanla gelir, gelen köylü çalışır ve vergi verir. Ev sırasını basılı tutup sürükleyerek de dizebilirsiniz.',
    quips: [
      'İlk ev de bedava, söylemiş miydim?',
      'Bir ev, bir baca, bir duman: işte uygarlık.',
      'Köylüler gelince ilk iş size teşekkür edecekler; ikinci iş vergi.',
      'Ev olmadan halk olmaz, halk olmadan lordluk; sıralamayı ben uydurmadım.',
      'Komşu lordun evleri derme çatma; bizimkiler sağlam olsun.',
    ],
    done: ({ kingdom: k }) => count(k, 'house') > 0,
    go: { label: 'Ev seç', act: build('house') },
    hint: 'build',
    cheers: [
      'Ev hazır! Bacasından duman tüttüğünü görür görmez komşuların kıskançlıktan sarardığını gördüm.',
      'Ev bitti! İlk köylü kapıda belirdi bile; elinde bir tavuk, gözünde umut.',
      'Bir çatı daha, lordum! Halk yakında gelir; ben de karşılama konuşmamı hazırladım, yalnızca yirmi sayfa.',
      'Ev hazır, lordum. Bacası tütüyor; demek ki biri çorba pişiriyor. Ben de davetliyim sanırım.',
      'Güzel bir ev oldu! Komşu lord görse kendi evlerini yıkıp yeniden yapar.',
    ],
  },
  {
    id: 'farm',
    title: 'Bir tarla kur',
    say: () => `Halk yemek yer: her köylü her turda ${balance.economy.foodPerVillager} yemek. Tarla buğday ekerse yemek üretir (keten ekerse yapı malzemesi). Bir tarla kuralım.`,
    quips: [
      'Açlık iyi bir öğretmen değildir.',
      'İlk tarla da bedava; bedava ekmek en tatlısıdır.',
      'Buğday ekerseniz ben de ekmeğimi sizin sofranızdan yerim.',
      'Tarlanın üstünden yürünür, merak etmeyin; köylüler dolanmak zorunda kalmaz.',
      'Bir tarla bin dert çözer; en azından bir derdi kesin.',
    ],
    done: ({ kingdom: k }) => count(k, 'farm') > 0,
    go: { label: 'Tarla seç', act: build('farm') },
    hint: 'build',
    cheers: [
      'Buğdaylar şimdiden boy atıyor! Ben de bir somun ayırttım, ileride.',
      'Tarla sürüldü! Korkuluk yok ama ben dikilirsem kargalar zaten kaçar.',
      'Başaklar sallanıyor, lordum; rüzgâr bile size selam veriyor.',
      'Tarla hazır! Halk ilk hasadı şimdiden konuşuyor; ben de ilk ekmeği.',
      'Toprak ekildi, lordum. Kırk yıllık elçiyim, ilk kez bir tarlanın kuruluşuna tanık oldum. Duygulandım.',
    ],
  },
  {
    id: 'trade',
    title: 'Tüccara mal seç',
    say: () => `Ticaret noktası sizin; tüccar her seferde seçtiğiniz maldan götürüp satar ve altın getirir (sefer en az ${balance.economy.trade.tripSeconds} saniye, ticaret noktası saraydan uzaksa daha uzun). Ticaret sekmesinden satılacak malı seçin; yapı malzemesini satarsanız inşaata kalmaz.`,
    quips: [
      'Fazla olanı satın; açlığı değil.',
      'Yemek satarken bile halkın birkaç dakikalık yemeğini ambarda bırakır; tüccarımız vicdanlıdır.',
      'Fiyatları lobideki herkes paylaşır; çok satılan mal ucuzlar, unutmayın.',
      'Tüccarımız iyi pazarlık eder; benden öğrendi.',
      'Hiçbir şey satmamayı da seçebilirsiniz, ama hazine buna küser.',
    ],
    done: ({ kingdom: k }) => k.trade.good !== null || !!k.trade.idle,
    go: { label: 'Ticaret sekmesi', act: tab('trade', 'trade', 'merchant') },
    hint: 'trade',
    cheers: [
      'Tüccar devesine bindi bile! Deve biraz huysuz ama yolu biliyor.',
      'Ticaret düzene girdi! Kese boş gidecek, dolu dönecek; ben de kapıda bekleyeceğim.',
      'İşte bu, lordum! Deve iki kez dönüp bana baktı; sanırım beni de satmak istiyor.',
      'Karar verildi. Altın kokusu şimdiden geliyor, lordum; ya da devenin kokusu.',
      'Tüccar işini öğrendi! Ona hayır duası ettim, bir de fiyatları fazla düşürmesin diye nasihat.',
    ],
  },
  {
    id: 'grow',
    title: 'Altı yapıya ulaş',
    say: ({ kingdom: k, now }) => `Lordluğunuz büyüdükçe taç krallıkları sizi fark eder. ${balance.cities.crown.intro.buildings} yapıya ulaşalım (surlar sayılmaz): bir tarla, bir oduncu, bir ev daha... Şu an ${k.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road' && b.doneAt <= now).length} bitmiş yapınız var.`,
    quips: [
      'Taçlar küçük lordluklara bakmaz; ben baktım ama, bu yüzden buradayım.',
      'Saydım, lordum; iki kez saydım, emin olmak için.',
      'Ne kadar çok yapı, o kadar çok baca dumanı; taçlar dumanı uzaktan görür.',
      'Acele yok ama gecikme de olmasın; taçların sabrı benimki kadar değildir.',
      'Saray ve ticaret noktası da sayılır, merak etmeyin.',
    ],
    done: ({ kingdom: k, now }) => fealtyOpen(k, now) || k.liege !== undefined,
    go: { label: 'İnşa menüsü', act: tab('build') },
    hint: 'build',
    cheers: [
      'İşte bu! Artık taçlar da sizi konuşuyor; benim kadar olmasa da.',
      'Altı yapı! Taçların ulakları yola çıkmış bile; atlarının tozunu buradan görüyorum.',
      'Lordluk büyüdü, lordum. Artık haritada bir nokta değil, bir leke... yani çok güzel bir leke.',
      'Tebrikler, lordum! Taçlar adınızı öğrendi; telaffuzunu ben düzelttim.',
      'İşte şimdi bir lordluk oldu! İki taç da sizi kendi tarafına çekmek isteyecek; nazlanmayı bana bırakın.',
    ],
  },
  {
    id: 'fealty',
    title: 'Bir taca biat et',
    say: ({ online }) => `Haritada iki taç krallığı var: ${online.crowns.join(' ve ')}. Oyuncular krallık değil lorddur; birine biat edersiniz. Sarayın ${balance.cities.crown.requiredForPalaceLevel}. seviyesi için şart, ve seçim sezon boyunca kalıcıdır. Kendi tacınızın devriyesi eğlence merkezinize bahşiş bırakır; rakip taç ise haraççı gönderir.`,
    quips: [
      'Seçiminizi iyi yapın; sezon bitene kadar değişmez.',
      'Ben tarafsızım, lordum; yalnızca güçlü olanı severim.',
      'Başkenti yakın olan taç ticarette iyidir; tüccar yolda daha az yorulur.',
      'Hangi sancak size daha çok yakışır, ona da bakın; renk de önemlidir.',
      'Biat ettiğiniz tacın sancağı adınızın yanında dalgalanacak; herkes görecek.',
    ],
    done: ({ kingdom: k, crowns }) => k.liege !== undefined || crowns < 2,
    go: { label: 'Bağlılık bölümü', act: tab('kingdom', 'palace', 'level') },
    hint: 'kingdom',
    cheers: [
      'Biat ettiniz! Tacın sancağı adınızın yanında dalgalanıyor. Ben de yeni bir şapka tüyü aldım, uyumlu olsun diye.',
      'Biat tamam! Tacın ulağı beni kucakladı; biraz fazla sıktı ama gururdan.',
      'Artık bir tacın lordusunuz, lordum. Rakip taç da bunu duydu; haraççısını hazırlıyordur.',
      'Sancak dikildi! Halk şimdiden tacın marşını mırıldanıyor; yanlış sözlerle ama içten.',
      'Biat ettiniz, lordum. Taç sizi lordlarının listesine yazdı; en üste, ben ısrar ettim.',
    ],
  },
  {
    id: 'palace2',
    title: 'Sarayı 2. seviyeye yükselt',
    say: () => 'Sarayı yükseltmek hududu büyütür, nüfus sınırını artırır ve yeni yapılar açar: kışla, casus evi, pazar, sur, kraliçe... Sarayınıza tıklayıp "Yükselt" deyin. Malzeme yetmezse önce biraz üretin.',
    quips: [
      'Yükselen saray, yükselen lord demektir.',
      'Mimarlar hazır; yalnızca sizin bir sözünüzü bekliyorlar.',
      'İnşaat sürerken saray eski hâliyle hizmet verir, merak etmeyin.',
      'Kraliçe de bu seviyeyle gelebilir; ben şimdiden çiçek sipariş ettim.',
      'Bir kat daha, bir bakış açısı daha.',
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 2,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheers: [
      'Saray büyüdü, hudut genişledi! Ben de mutfakta biraz genişledim ama o başka konu.',
      'İkinci kat! Hudut genişledi; yeni topraklarda bir tavşan bulduk, ona da vergi koyalım mı?',
      'Saray yükseldi, lordum! Yeni yapılar açıldı; listesini üç kez okudum, ezberledim.',
      'Tebrikler! Saray ikinci seviyede; kapıcı da yeni bir üniforma istedi.',
      'İşte büyüme bu, lordum: daha geniş hudut, daha çok halk, daha çok iş. Ben de daha çok konuşacağım.',
    ],
  },
  {
    id: 'barracks',
    title: 'Bir kışla kur',
    say: () => 'Kışla, asker havuzundan birlik yetiştirir: mızrakçı süvariyi, okçu mızrakçıyı, süvari okçuyu yener. Bir kışla kuralım.',
    quips: [
      'Barış güzeldir ama haydutlar da güzel bulur.',
      'Asker havuzu mutlu halkla dolar; mutlu halk, cesur asker.',
      'Komşular kışlamızı görünce iki kez düşünür; ben de üç kez.',
      'Askerler her tur yemek ve maaş ister; korkusuz bir lordluğun bedeli budur.',
      'Kışlada okçuluk da oynanır, lordum; ben hedefin yanında durmam.',
    ],
    done: ({ kingdom: k }) => count(k, 'barracks') > 0,
    go: { label: 'Kışla seç', act: build('barracks') },
    hint: 'build',
    cheers: [
      'Kışla hazır! Borazancı ilk sabah beni de uyandırdı; saygımı kazandı.',
      'Kışla hazır! İlk talimde biri mızrağını ters tuttu; ben düzelttim, askerlik geçmişim var. Bir günlük.',
      'Davullar çaldı, lordum! Kışlanın kapısında gönüllüler sıraya girdi.',
      'Artık bir kışlamız var. Komşu lordun casusu bunu not etti; ben de onun not ettiğini not ettim.',
      'Kışla kuruldu! Askerler size selam durdu; biri bana da durdu, sanırım beni general sandı.',
    ],
  },
  {
    id: 'queen',
    title: 'Bir kraliçe getir',
    say: () => `Sarayın ${balance.dynasty.queenForPalaceLevel}. seviyesi için kraliçe gerekir; ayrıca halkın mutluluğunu artırır ve hanedanınız çocuklarla büyür. Halk sekmesinin Kraliçe bölümünden getirebilirsiniz (${n(balance.society.queen.cost.gold)} altın, en az ${balance.society.queen.minPopulation} nüfus).`,
    quips: [
      'Aşkın fiyatı biraz yüksek, kabul; ama değer.',
      'Düğünde ben konuşma yapacağım; kısa tutacağım, söz.',
      'Bir kraliçe sarayı ısıtır; şömineden daha iyi.',
      'Kraliçeyi iyi koruyun, lordum; casuslar kaçırmayı sever.',
      'Taht iki kişiliktir; şimdiye kadar bir yanı hep boş kaldı.',
    ],
    done: ({ kingdom: k }) => !!k.queen || !!k.queenHeldBy,
    go: { label: 'Kraliçe bölümü', act: tab('people', 'people', 'queen') },
    hint: 'people',
    cheers: [
      'Kraliçe saraya geldi! Bana bir bakışta "bu adam çok konuşur" dedi. Haklı, ama kırıldım.',
      'Kraliçe geldi! Saray bahçesinde güller açtı; bahçıvan yemin ediyor, kendisi yapmamış.',
      'Düğün çanları çaldı, lordum! Halkın mutluluğu şimdiden arttı; benimki de.',
      'Kraliçemiz saraya yerleşti. Bana çay ikram etti; kırk yılda ilk kez biri bana çay ikram etti.',
      'Hanedan büyüyor, lordum! Kraliçe beni çocukların hocası yapmayı düşündüğünü söyledi; reddedemedim.',
    ],
  },
  {
    id: 'spy',
    title: 'Bir casus evi kur',
    say: () => 'Casus evi casus yetiştirir: başka lordların malını, ordusunu, elçilerini öğrenirsiniz; evde tutulan casuslar da size gelen casusları yakalar.',
    quips: [
      'Bilgi altından değerlidir, lordum; en azından daha hafiftir.',
      'Casuslarınızı iyi seçin; benim gibi çok konuşanlar olmasın.',
      'Bir lordun her konusuna bir casus; açgözlülük yok.',
      'Güçlü bir ağ bir gün bir kraliçeyi bile... yok, bunu ben söylemedim.',
      'Kimse bilmesin; ben bile bilmeyeyim, daha iyi.',
    ],
    done: ({ kingdom: k }) => count(k, 'spyHouse') > 0,
    go: { label: 'Casus evi seç', act: build('spyHouse') },
    hint: 'build',
    cheers: [
      'Casus evi kuruldu. Kimseye söylemeyin. Ben de söylemedim, sadece size.',
      'Casus evi hazır. İlk casus o kadar iyi saklandı ki onu hâlâ arıyoruz.',
      'Casuslarımız işbaşında, lordum. Şşş... Ben de fısıldayarak konuşmaya karar verdim. Bir dakika sürdü.',
      'Casus evi kuruldu. Komşuların sırları artık bizim de sırrımız; paylaşmak güzel şey.',
      'Artık gözlerimiz ve kulaklarımız var, lordum. Benimkiler yaşlandı, gençlerini işe aldık.',
    ],
  },
  {
    id: 'palace3',
    title: 'Sarayı 3. seviyeye yükselt',
    say: () => '3. seviye saray üniversiteyi, hastaneyi, tapınağı ve esrarengiz balıkçı kulübesini açar. Pahalıdır.',
    quips: [
      'Ama tarih ucuz saraylardan söz etmez.',
      'Hazinedar bedeli duyunca bayıldı; ayılınca bir daha duydu, bir daha bayıldı.',
      'Savaş malzemesi de ister; tüccarı bir süre ondan uzak tutun.',
      'Üçüncü kattan bakınca komşuların saraylarının tepesini görürsünüz.',
      'Balıkçı kulübesine dikkat; orada tuhaf şeyler olur.',
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 3,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheers: [
      'Üç kat saray! Merdivenleri çıkarken dizlerim ağlıyor, ama gururdan.',
      'Üçüncü seviye! Âlimler kapıda, şifacılar kapıda, rahipler kapıda; ben de kapıyı açmaktan yoruldum.',
      'Saray yine büyüdü, lordum! Şimdi bilgi, şifa ve iman zamanı.',
      'Tebrikler! Kuzey kulesindeki odam daha da yükseldi; rüzgâr şapkamı iki kez uçurdu.',
      'Hanedan kitaplarına yeni bir sayfa, lordum: "Üç kat saray". Yazıyı ben yazdım, süslü harflerle.',
    ],
  },
  {
    id: 'university',
    title: 'Bir üniversite kur',
    say: () => 'Üniversite araştırma yapar: dört dalda (Hammadde, Savaş, Devlet, Din ve halk) kademe kademe ilerlersiniz ve her kademede iki yoldan birini seçersiniz; öbürüne bir daha dönülmez.',
    quips: [
      'Bilgi pahalıdır, cehalet daha da pahalı.',
      'Seçerken iyi düşünün; geri dönüş yok, ben bunu kırk yaşında öğrendim.',
      'Âlimler sakallarını şimdiden uzatmaya başladı.',
      'Aynı anda tek araştırma yürür; acele eden âlim kitabı ters okur.',
      'Bir gün adınızı taşıyan bir buluş olur; belki de benim adımı.',
    ],
    done: ({ kingdom: k }) => count(k, 'university') > 0,
    go: { label: 'Üniversite seç', act: build('university') },
    hint: 'build',
    cheers: [
      'Üniversite açıldı! İlk dersi ben vermek istedim, "Uzun konuşmanın faydaları". Kimse gelmedi.',
      'Üniversite açıldı! Kütüphaneye ilk kitabı ben bağışladım: "Elçinin Anıları, Cilt 1–12".',
      'Âlimler geldi, lordum; biri kapıdan girerken düşündü, düşerken de bir şey buldu.',
      'İlim yuvası hazır! Öğrenciler şimdiden tartışıyor; konu da genellikle yemekhane.',
      'Üniversite kuruldu, lordum. Rektör beni fahri doktor yaptı; neyin doktoru olduğunu sormadım.',
    ],
  },
  {
    id: 'research',
    title: 'İlk araştırmayı bitir',
    say: () => 'Üniversiteye tıklayıp bir dal seçin ve ilk kademeden bir araştırma başlatın: sulama, kalkan duvarı, mimarlık, şenlikler... Aynı anda bir araştırma yürür; bitince etkisi hemen başlar.',
    quips: [
      'Hangisini seçerseniz seçin, âlimler mutlu olur; maaşlarını alınca.',
      'Ben şenlikleri öneririm, ama bana soran olmadı.',
      'Bir yolu seçmek öbürünü bırakmak demektir; hayat gibi.',
      'Araştırma pahalıdır; hazineye bir göz atın.',
      'Bilim sabır ister, lordum; ben de sabırla bekliyorum.',
    ],
    done: ({ kingdom: k, now }) => (k.researches ?? []).some((r) => r.doneAt <= now),
    go: { label: 'Üniversiteye git', act: open('university') },
    hint: 'kingdom',
    cheers: [
      'İlk buluş! Âlimler o kadar sevindi ki cübbelerini ters giydiler.',
      'Buluş tamam! Âlimler kutlamak için bir şenlik düzenledi; şenlikleri araştırmadıysak biraz sönük geçti.',
      'İlk araştırma bitti, lordum! Etkisi şimdiden görülüyor; ben de görüyorum, gözlüğümle.',
      'Bilgi hazinemize ilk mücevher eklendi, lordum.',
      'Âlimler kitaplarını kapattı, gülümsedi ve hemen yenisini açtı. Bilim böyledir.',
    ],
  },
  {
    id: 'temple',
    title: 'Bir tapınak kur',
    say: () => 'Tapınak halkın mutluluğunu artırır, askerlerinize iman gücü verir; rahipler vaaz verince vergiler halka daha az ağır gelir. Mutlu halk daha hızlı büyür, daha çok asker olmaya razı olur.',
    quips: [
      'Ben de arada bir dua ederim; çoğunlukla sesim kısılmasın diye.',
      'Rahipler de çok konuşur, lordum; ama onlarınki vaaz sayılır.',
      'Çanların sesi sınırdan duyulur; komşular kıskanır.',
      'İman zara eklenir; savaşta gökler de hesap yapar.',
      'Vaaz her an verilmez; rahiplerin de dinlenmesi gerekir.',
    ],
    done: ({ kingdom: k }) => count(k, 'temple') > 0,
    go: { label: 'Tapınak seç', act: build('temple') },
    hint: 'build',
    cheers: [
      'Tapınağın çanları çaldı! Ben de dua ettim: daha az haraççı, daha çok bahşiş.',
      'Tapınak açıldı! Rahip ilk vaazını verdi; ilk kez birinin benden uzun konuştuğunu gördüm.',
      'Kutsal ateş yandı, lordum; halkın yüzü de aydınlandı.',
      'Tapınak hazır. Askerler dua etmeyi öğrendi; şimdi kılıçlarını da kutsatmak istiyorlar.',
      'Çanlar çalıyor, lordum! Duyan herkes sizin cömertliğinizi konuşuyor.',
    ],
  },
  {
    id: 'hospital',
    title: 'Bir hastane kur',
    say: () => 'Hasta köylü çalışmaz, vergi vermez ve keyfi kaçar; kışın hastalık daha hızlı yayılır. Hastanenin doktorları hastaları çok daha çabuk iyileştirir.',
    quips: [
      'Sağlıklı halk, dolu ambar.',
      'Doktorlar da işçi sayılır; onlara kadro ayırın.',
      'Ben doktorlardan korkarım, ama siz korkmayın.',
      'Bir hastane bin dua kadar etkilidir; rahiplere söylemeyin.',
      'Köydeki şifacı kadın otlarını bırakıp hastaneye geçmek istiyor.',
    ],
    done: ({ kingdom: k }) => count(k, 'hospital') > 0,
    go: { label: 'Hastane seç', act: build('hospital') },
    hint: 'build',
    cheers: [
      'Hastane hazır! Doktor bana baktı, "dilin biraz yorgun" dedi. Ne bilir.',
      'Hastane açıldı! İlk hasta ben oldum: ayak parmağımı kapıya çarptım. Hemen sardılar.',
      'Doktorlar işbaşında, lordum. Öksürük sesleri azaldıkça sarayın yankısı güzelleşiyor.',
      'Şifa yurdu hazır! Köylüler iyileşip tarlalarına dönecek; tarlalar da sevinecek.',
      'Hastane kuruldu, lordum. Baş doktor size iyi uyumanızı öğütledi; ben de katılıyorum, siz uyurken ben konuşurum.',
    ],
  },
  {
    id: 'expedition',
    title: 'İlk seferi gönder',
    say: () => 'Boşta köylünüz varsa onları sefere gönderin: ava, keşfe, hacca ya da define peşine. Siz yokken de yol alırlar ve dönüşte başlarından geçeni anlatırlar. Çalışan köylüyü göndermeyin; tarlası boş kalır.',
    quips: [
      'Ben de gençken sefere çıkardım; çoğunlukla mutfağa.',
      'Yanlarına muhafız verirseniz daha güvende olurlar.',
      'Döndüklerinde anlatacakları hikâyeyi şimdiden merak ediyorum.',
      'Sefer uzun sürebilir; sabırlı olun, hikâye de ganimet de dönüşte gelir.',
      'Bir harita, bir azık, bir de cesaret; gerisi şans.',
    ],
    done: ({ kingdom: k }) => (k.expeditions ?? []).length > 0,
    go: { label: 'Seferler', act: tab('kingdom', 'palace', 'expeditions') },
    hint: 'kingdom',
    cheers: [
      'Kafile yola çıktı! Onlara bir harita verdim. Ters tutuyorlardı, düzelttim.',
      'Kafile yola çıktı! Arkalarından el salladım; biri yanlışlıkla bana sırt çantasını uzattı.',
      'Sefer başladı, lordum. Yolları açık, dönüşleri bereketli olsun.',
      'İlk sefer! Kafile ufukta kayboldu; ben hâlâ mendilimi sallıyorum.',
      'Seferciler gitti, lordum. Dönüşte anlatacaklarını yazmak için yeni bir defter aldım.',
    ],
  },
  {
    id: 'palace4',
    title: 'Sarayı 4. seviyeye yükselt',
    say: () => '4. seviye saray eğlence merkezini, tersaneyi ve hazineyi açar; hudut da genişler. Bedeli ağırdır, savaş malzemesi de ister.',
    quips: [
      'Tüccarı bir süre o maldan uzak tutun.',
      'Dört kat, lordum; dördüncü kattan bulutlara el sallarsınız.',
      'Hazinedar bu kez bayılmadı; önceden oturdu.',
      'Eğlence merkezi açılınca tacınızın devriyesi uğrar ve bahşiş bırakır.',
      'Bu sizin büyük hamleniz olacak; ozanlar notlarını hazırlıyor.',
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 4,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheers: [
      'Dördüncü kat! Buradan bakınca rakiplerin sarayları ne kadar küçük görünüyor, değil mi?',
      'Dördüncü seviye! Saray o kadar yüksek ki güneşi herkesten önce biz görüyoruz.',
      'Saray dört kat oldu, lordum! Tersane, hazine, eğlence merkezi: hepsi sizi bekliyor.',
      'Tebrikler, lordum! Taçların ulakları bile artık size "lordum" derken eğiliyor.',
      'İşte büyük saray, lordum. Merdivenlerine bir de tutamak koydurdum; dizlerim için.',
    ],
  },
  {
    id: 'tavern',
    title: 'Bir eğlence merkezi kur',
    say: () => 'Eğlence merkezi kendi tacınızın devriyesini ağırlar: her uğrayışta bahşiş bırakırlar. Mini oyunların hepsi de orada oynanır.',
    quips: [
      'Biraz müzik kimseye zarar vermez; ozan hariç.',
      'Ben de arada uğrarım; elbette yalnızca denetim için.',
      'Devriye bir kadeh içer, bir kese bırakır; iyi alışveriş.',
      'Rakip tacın devriyesi uğramaz; onlar haraççı gönderir, neşeleri de yoktur.',
      'Fıçılar dolu, sahne hazır olsun.',
    ],
    done: ({ kingdom: k }) => count(k, 'tavern') > 0,
    go: { label: 'Eğlence merkezi seç', act: build('tavern') },
    hint: 'build',
    cheers: [
      'Fıçılar açıldı! Devriye yolunu şimdiden şaşırdı bile; bize doğru.',
      'Eğlence merkezi açıldı! Ozan ilk şarkısını söyledi, ben de dans ettim. Kimse beni durdurmadı, ne yazık ki.',
      'Fenerler yandı, lordum; devriyenin atları bile kapıda kişniyor.',
      'İlk gece büyük şenlik! Bir askere bahşiş verdim, sonra hatırladım ki bahşişi onlar bırakacaktı.',
      'Eğlence merkezi hazır. Mini oyunlar da burada; okçulukta ben hakemim, örs başında da sağır.',
    ],
  },
  {
    id: 'treasury',
    title: 'Bir hazine kur',
    say: () => 'Hazine dolunca tüccar mal götürmez, vergi de boşa gider. Hazine binası altın yerini büyütür; her seviyesi daha çok tutar.',
    quips: [
      'Altının da bir evi olmalı, lordum.',
      'Kilitleri ben seçeceğim; gerçi anahtarlarla aram pek iyi değil.',
      '5. seviye sarayda ikinci bir hazine de kurulur.',
      'Dolu hazine güzeldir, taşan hazine üzücüdür.',
      'Hazinedar yeni binayı görmek için sabırsızlanıyor; eski kasası artık kapanmıyor.',
    ],
    done: ({ kingdom: k }) => count(k, 'treasury') > 0,
    go: { label: 'Hazine seç', act: build('treasury') },
    hint: 'build',
    cheers: [
      'Hazinenin kapısına üç kilit vurdum. Anahtarlardan birini kaybettim ama iki tane kaldı.',
      'Hazine kuruldu! Hazinedar içeri girdi, altınları saydı, yeniden saydı ve mutluluktan ağladı.',
      'Altınlar artık daha geniş bir yerde, lordum. Tüccar da rahat; artık satabilir.',
      'Hazinenin kapısı o kadar ağır ki ben açamıyorum; iyi, demek ki hırsız da açamaz.',
      'Yeni hazine hazır, lordum. Altınların şıngırtısı en güzel müzik; ozan bunu duymasın.',
    ],
  },
  {
    id: 'shipyard',
    title: 'Bir tersane kur ve gemi yap',
    say: () => 'Tersane suyun kıyısına kurulur ve gemi yapar: kadırga savaşır, koka yük taşır, çektiri akın eder. Gemilerle deniz ticareti, balık avı ve korsan avı yapılır; savaşta abluka.',
    quips: [
      'Ben yüzme bilmem, lordum; ama gemiye binmeyi severim.',
      'Tayfa asker havuzundan gelir; denizciler köylü sayılmaz.',
      'Çektiri için tersanenin 2. seviyesi gerekir.',
      'Bir gemi, bir rüzgâr, bir de iyi bir kaptan; gerisini su bilir.',
      'Korsanlara dikkat; savaş gemileri ticaret seferlerine eskort olur.',
    ],
    done: ({ kingdom: k }) => count(k, 'shipyard') > 0 && countShips(allShips(k)) > 0,
    go: { label: 'Tersane seç', act: build('shipyard') },
    hint: 'build',
    cheers: [
      'İlk gemi suya indi! Adını sizin koymanızı isterdim ama tayfa "Elçinin Sesi" demiş. Gurur duydum.',
      'Gemi kızaktan kaydı! Şişeyi gövdeye vurdum; şişe kırılmadı, kalbim kırıldı.',
      'İlk gemimiz suda, lordum! Martılar bile selam durdu.',
      'Donanmamız doğdu! Tek gemi ama gururu bir filo kadar.',
      'Gemi suya indi, lordum. Kaptan bana bir kaptan şapkası verdi; uymadı ama yine de takıyorum.',
    ],
  },
  {
    id: 'palace5',
    title: 'Sarayı 5. seviyeye yükselt',
    say: () => 'Son basamak: 5. seviye saray hududu en geniş hâline getirir ve en büyük yapıları açar.',
    quips: [
      'Bedeli bir krallık fidyesi kadardır; ama hanedan kitapları bunu yazar.',
      'Bu kattan bakınca taçların başkentlerini görürsünüz; belki.',
      'Mimarlar bu planı çizerken üç kalem kırdı.',
      'Bu son yükseltme, lordum; sonra yalnızca efsane olmak kalır.',
      'Hazinedar istifa mektubunu hazırladı; ama imzalamadı, sonunu merak ediyor.',
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 5,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheers: [
      'Beş kat! Lordum, artık ozanlar sizden söz ediyor. Benden de söz etsinler diye para verdim.',
      'Beşinci seviye! Saray artık bir masal sarayı, lordum; ben de masal anlatıcısı.',
      'Zirvedesiniz, lordum! Hudut en geniş hâlinde; ben ölçtüm, iki kez.',
      'Beş kat saray! Kuleye çıktım, bulutlara dokundum; ıslaktı.',
      'Tebrikler, lordum. Bundan sonra size "lordum" değil, "ulu lordum" diyeceğim. Bir süre.',
    ],
  },
  {
    id: 'landmark',
    title: 'Büyük bir yapı kur',
    say: () => '5. seviye saray üç büyük yapı açar: kuşatmada sarayı koruyan Hisar, halkı gururlandıran Hanedan anıtı ve tüccarlarınıza pazarlık öğreten Lonca konağı. Biriyle başlayın.',
    quips: [
      'Hepsi pahalıdır, hepsi kalıcıdır.',
      'Ben Hanedan anıtını seçerdim; belki bir köşesinde bana da yer ayırırsınız.',
      'Hisar savaşta, anıt barışta, konak pazarda işe yarar.',
      'Bunlar yüzyıllık yapılar, lordum; acele etmeyin ama geç de kalmayın.',
      'Büyük yapı büyük lord demektir; küçük elçi de onu anlatır.',
    ],
    done: ({ kingdom: k }) => count(k, 'citadel') + count(k, 'memorial') + count(k, 'guildHall') > 0,
    go: { label: 'İnşa menüsü', act: tab('build') },
    hint: 'build',
    cheers: [
      'İşte bir eser! Yüz yıl sonra da duracak. Ben de altına adımı kazıdım, küçük harflerle.',
      'Büyük yapı yükseldi! Ozanlar şimdiden üç şarkı yazdı; birinde ben de varım, ikinci kıtada.',
      'Bir eser, lordum! Taşlarını ben de taşıdım; birini, en küçüğünü.',
      'Tamamlandı! Bu yapı biz gittikten sonra da duracak; ama ben bir süre daha buradayım.',
      'Göz kamaştırıcı, lordum. Komşu lord görünce bir süre konuşamadı; ben ise hiç susmadım.',
    ],
  },
]

export const TUTORIAL_DONE = [
  'Öğreteceklerim bu kadar, lordum; gerisini zaman ve komşularınız öğretecek. Yine de bana "Bana oyunu anlat" diye sorarsanız her köşesini anlatırım.',
  'Öğretici bitti, lordum; artık benden çok şey biliyorsunuz. Gerçi bunu kimseye söylemeyin. Bir köşeyi merak ederseniz "Bana oyunu anlat" deyin.',
  'İşte bu kadar, lordum: sarayı kurdunuz, büyüttünüz, bir taca bağlandınız. Gerisi sizin hikâyeniz. Merak ettiğiniz bir şey olursa beni çağırın.',
  'Son adım da bitti, lordum. Artık yalnızca öğüt vereceğim; öğüt vermek de en sevdiğim iştir. Sorunuz olursa "Bana oyunu anlat" yeter.',
  'Lordum, artık size öğretecek bir şeyim kalmadı; bu beni hem gururlandırıyor hem de işsiz bırakıyor. Ben yine de yanınızdayım; "Bana oyunu anlat" dediğiniz an anlatırım.',
]

// ---- Topics he explains on request -----------------------------------------------------------------------------------

// Decimals the Turkish way (1,25), and a person's age in the house's years (one real hour each).
const dec = (v: number) => String(Math.round(v * 1000) / 1000).replace('.', ',')
const ageOf = (bornAt: number, now: number) => Math.max(0, Math.floor((now - bornAt) / balance.time.gameDayMs))

export const TOPICS: Topic[] = [
  // ---- The basics -------------------------------------------------------------------------------------------------
  {
    id: 'time',
    name: 'Zaman',
    icon: 'time',
    group: 'basics',
    pages: () => {
      const s = balance.time.seasons.food
      const night = balance.society.night
      const idle = balance.economy.idle
      return [
        `Zaman burada tuhaf akar, lordum: her gerçek saat bir yıldır. Saatin başında gece yarısı olur, takvim 1 Ocak'a döner, hanedanınız bir yaş büyür. Sezon ${balance.time.seasonGameDays} yıl, yani ${n(balance.time.seasonGameDays / 24)} gün sürer; sonra dünya silinir, geriye yalnızca şanınız kalır.`,
        `Aylar beşer dakikada geçer, mevsimler çeyrek saat sürer: gece kış, şafak ilkbahar, öğle yaz, akşam sonbahar. Yazın tarlalar ve iskeleler kıştakinin aşağı yukarı ${dec(Math.round((s.summer / s.winter) * 10) / 10)} katı yemek verir; hastalık da kışın hızlı yayılır. Ben kışı sevmem, lordum; sakalım donuyor.`,
        `Ekonomi turlarla işler: her ${balance.economy.productionSeconds} gerçek saniyede bir tur. Binalar üretir, halk yer, vergi ve maaş ödenir.\n\nGece (${night.startHour}:00 ile 0${night.endHour}:00 arası) çabuk geçer ve halk dinlenir: binalar ${pct(night.workRate)} hızla çalışır. Gece mesaisi tam çalıştırır ama mutluluğu ${-night.shiftHappiness} puan düşürür ve yorgunluk biriktirir.`,
        `Siz yokken de dünya akar: inşaatlar biter, tüccar sefere çıkar, ordular yürür. Ama ${balance.economy.away.afterMinutes} dakika görünmezseniz tüccar kaytarır, ${idle.graceHours} saati geçince de her saat üretim, vergi ve tüccarın altını ${pct(idle.perHour)} azalır (en çok ${pct(1 - idle.min)} kadar). Yemek hariç; halk kendi karnını doyurur. Döndüğünüzde "Sen yokken" raporu her şeyi anlatır.`,
      ]
    },
  },
  {
    id: 'build',
    name: 'İnşa',
    icon: 'build',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const built = k.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road').length
      return [
        `İnşa sekmesinden bir yapı seçip hududunuzun içine koyarsınız, lordum. Her inşa, taşıma ve yıkım önce bir plana yazılır; alttaki çubukta "Onayla" deyince hepsi birden gider. Bir planda en çok ${balance.economy.maxPlan} adım olur; benim alışveriş listem bile o kadar uzun değil.`,
        `Aynı anda en çok ${balance.economy.maxConstructions} inşaat yürür, gerisi sırada bekler; sur ve yol sıraya girmez. İlk oduncu kampı, ilk ev ve ilk tarla bedavadır. Şu an ${built} yapınız var${built < balance.cities.crown.intro.buildings ? `; ${balance.cities.crown.intro.buildings} yapıya varınca taçlar kapınızı çalar` : ''}.`,
        'Kıyı karelerine yalnızca iskele, balıkçı kulübesi ve sur; yol kenarına yalnızca ticaret noktası kurulur. Sur ile binalar arasında boşluk kalır, gözcü kulesi hariç. Surla sarayı kapısız çevirirseniz halk dışarı çıkamaz; buna saray değil hapishane derler.',
        `Yıkılan yapının bedelinin yarısı geri döner. Taşımak harcananın ${pct(balance.economy.move.costShare)} kadarını ister ve yeniden yapmanın ${dec(balance.economy.move.timeFactor)} katı sürer; ama seviyesi ve işçileri korunur.`,
      ]
    },
    go: { label: 'İnşa sekmesi', act: tab('build') },
  },
  {
    id: 'economy',
    name: 'Ekonomi',
    icon: 'gold',
    group: 'basics',
    pages: ({ kingdom: k, now }) => [
      'Dört kaynak vardır, lordum: altın, yemek, yapı malzemesi ve savaş malzemesi. Oduncu yapı malzemesi, tarla ve iskele yemek, silah atölyesi demir ya da silah üretir. Köylü yetmezse binalar orantılı az üretir.',
      `Depo sınırı saray seviyesiyle büyür, ambarlar ekler; şu an her maldan ${n(storageCap(k, now))} birim tutabilirsiniz, hazineniz ${n(goldCap(k, now))} altın alır. Sığmayan boşa gider. Hazine doluyken tüccar mal götürmez, evde bekler.`,
      'Altın vergiden, tüccardan, kasabalardan, seferlerden ve ganimetten gelir. Gider: asker maaşı, gemi bakımı, kasaba bakımı ve rakip tacın haraççıları. Taçlara güvenip hazineyi doldurmayın, lordum; taçlar bu sezon aldıklarından azını geri verir.',
      'Dolu ambar tehlikelidir: afetler dolu depodan daha çok götürür, fareler ve pas taşan malı yer. Fazlayı satın, büyük işlere aktarın ya da taca bağışlayın. Ayrıntısı "Afetler ve hava" ile "Büyük işler" konularında.',
    ],
    go: { label: 'Depo sekmesi', act: tab('store', 'store', 'books') },
  },
  {
    id: 'trade',
    name: 'Ticaret',
    icon: 'trade',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const t = balance.economy.trade
      const o = balance.cities.crown.orders
      return [
        `Tüccar her seferde seçtiğiniz maldan götürür: ticaret noktasının seviyesine göre ${t.levels.map((l) => l.units).join(' / ')} birim. Sefer ${t.tripSeconds} saniyedir, ticaret noktası saraydan uzaksa uzar. ${k.trade.good === null ? 'Sizin tüccarınız şu an eli kolu bağlı oturuyor, lordum; ona bir mal verin.' : 'Tüccarınız yolda; iyi bir adamdır, biraz konuşkan ama.'}`,
        `Lobideki bütün lordlar aynı fiyat tablosunu paylaşır: satılan mal ucuzlar, alınan pahalanır, zamanla olağan fiyata döner. Fiyat olağanın ${pct(balance.market.minFactor)} kadarının altına inmez. Taçlar da her yirmi dakikada bir malı piyasadan toplar; dipteki fiyatı onlar kaldırır.`,
        `Tüccarı bir taç başkentine de gönderebilirsiniz: ${balance.cities.trade.loadFactor} kat yük götürür, lobi fiyatından satar ama sefer uzar. Taç siparişleri malı lobi fiyatının ${dec(o.payFactor)} katına alır (kendi tacınız biraz fazlasını verir); ödeme kervan dönünce gelir.`,
        `Pazar binası eksik malı altınla almanıza yarar. Bir kasabanın pazarından da alınır, ama kapısında ordunuz durmalı ve asker başına ${balance.towns.market.carryPerSoldier} birim taşınır. Bir de yollardaki yağmacılar var: tüccarın kazancından pay keserler. O ayrı bir dert, "Yağmacılar"da anlatırım.`,
      ]
    },
    go: { label: 'Ticaret sekmesi', act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'people',
    name: 'Nüfus',
    icon: 'people',
    group: 'basics',
    pages: ({ kingdom: k, now }) => {
      const p = population(k, now)
      return [
        `Evler köylüye yer verir; köylüler o yere her turda yavaş yavaş gelir, boş yer çoksa daha hızlı. Nüfus sınırı saray seviyesi × ${balance.society.popCapPerPalaceLevel}; sizinki şu an ${popCapFor(palaceLevel(k, now))}, içeride ${p.villagers} köylü var.`,
        'Büyümeyi mutluluk sürer: yüzde kırkın altında halk gelmez, çok mutsuz halk göç eder. Açlık ve kuşatma da halkı kaçırır, savaş büyümeyi yarıya indirir. Kraliçe ve tapınak hızlandırır. Sarayın hizmetlileri ise hiç gitmez; onlar bana benzer, nereye gitsinler.',
        'Köylüler binalarda çalışır, vergi verir, asker ve denizci olur. Asker ve denizci köylüden düşer, terhis edilen asker köylüye döner. Seferdeki köylüler de çalışmaz; boşta köylünüz varsa onları sefere yollayın.',
      ]
    },
    go: { label: 'Halk sekmesi', act: tab('people', 'people', 'people') },
  },
  {
    id: 'happiness',
    name: 'Mutluluk',
    icon: 'happy',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const t = balance.society.tax.levels
      const h = balance.society.happiness
      return [
        `Mutluluk her tur bir hedefe doğru kayar; sizinki şu an %${Math.round(k.happiness ?? h.start)}. Taban ${h.base}. Vergi düşükse +${t.low.happiness}, yüksekse ${t.high.happiness}, ağırsa ${t.heavy.happiness}. Kraliçe +${h.queen}, açlık ${h.starving}, yağma ${h.looted}.`,
        `Vergi köylü başına turda düşük ${dec(t.low.goldPerVillager)}, normal ${dec(t.normal.goldPerVillager)}, yüksek ${dec(t.high.goldPerVillager)}, ağır ${dec(t.heavy.goldPerVillager)} altın getirir. Ağır vergi kasayı doldurur, halkı boşaltır. Ben ortası derim, lordum; elçiler hep ortayı sever.`,
        `Gece mesaisi mutluluğu ${-balance.society.night.shiftHappiness} puan, kapısız sur (hapishane) ${-h.imprisoned} puan düşürür. Yollardaki yağmacılar ve sulardaki korsanlar birlikte en çok ${balance.outlaws.happinessCap} puan götürür. Tapınak, şenlik, hanedan anıtı ve Ulu Katedral ise yükseltir.`,
        'Mutlu halk hızlı büyür, asker olmaya gönüllüdür, kasabalarınız da size daha sadık kalır. Mutsuz halk pahalıya asker olur ve göç eder. Kısacası, lordum, halkı güldürmek bedava değildir ama ağlatmak daha pahalıdır.',
      ]
    },
    go: { label: 'Mutluluk bölümü', act: tab('people', 'people', 'mood') },
  },
  {
    id: 'disasters',
    name: 'Afetler ve hava',
    icon: 'snow',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const c = balance.institutions.events.crisis
      const toll = c.toll
      const hoard = balance.institutions.events.hoard
      const sh = balance.weather.showers
      return [
        `Yangın, sel, deprem, çekirge, kurt… Bir kriz gelince üç yol sunarım: köylüleri seferber et (${min(c.villagers.seconds)} dakika iş gücü ${pct(-c.villagers.work)} düşer), orduyu seferber et (bir iki asker ölür, ordu ${min(c.army.lockSeconds)} dakika sefere çıkamaz) ya da bir şey yapma. Karar için ${c.decideSeconds} saniye var; susarsanız bir şey yapılmamış sayılır.`,
        `Kriz nasıl karşılanırsa karşılansın depodan bir pay götürür: köylüler kaybı ${pct(toll.choice.villagers)} kadarına, ordu ${pct(toll.choice.army)} kadarına indirir. Örneğin orman yangını yapı malzemesinin ${pct(toll.kinds.forestFire.materials)} kadarını yakar. Depo ${pct(toll.fullAt)} doluluğu geçtikçe pay büyür, tam doluyken iki katıdır; ama ${toll.floor} birimin altı sayılmaz ve bir afet bir maldan ${pct(toll.maxShare)} kadarından fazlasını almaz.`,
        `Bir de sessiz düşmanlar vardır: her yarım saatte bir, ambarın ${pct(hoard.fullAt)} kadarından dolu bir mal varsa fareler yemeği, rutubet yapı malzemesini, pas savaş malzemesini yer (${pct(hoard.minShare)}–${pct(hoard.maxShare)}). Seçim yok, lordum; tek çare ambarı ağzına kadar doldurmamak.`,
        `Kâhya tutarsanız cevapsız kalan krizde köylüleri o seferber eder, her seferinde ${c.steward.fee.gold} altın alır.${k.steward ? ' Sizin kâhyanız görevde; iyi adamdır, biraz cimri ama.' : ' Çevrimdışı lordun en iyi dostudur.'}\n\nHavaya gelince: yağmur, fırtına, sel ve dolu haritayı grileştirir; ayrıca on dakikada bir kısa bir sağanak geçebilir: yazın ${pct(sh.seasons.summer.chance)}, ilkbaharda ${pct(sh.seasons.spring.chance)}, sonbaharda ${pct(sh.seasons.autumn.chance)} ihtimalle; bazıları şimşekli fırtınadır. Kışın yağan kardır. Fırtınada denizde korsan saldırısı ${dec(balance.navy.seaWeather.storm)} kat sıklaşır, sis ise korsanları şaşırtır.`,
      ]
    },
    go: { label: 'Sağlık ve kâhya', act: tab('people', 'people', 'mood') },
  },
  {
    id: 'events',
    name: 'Günün olayları',
    icon: 'bell',
    group: 'basics',
    pages: () => {
      const e = balance.institutions.events
      return [
        `Olaylar iki kanaldan gelir: bütün lobiye (yağmur, kuyruklu yıldız, dolunay şenliği, salgın…) ve yalnızca size (define, gezgin ozan, haydut baskını…). Her ${min(e.lobby.windowSeconds)} dakikalık pencerede lobiye ${pct(e.lobby.chance)}, size ${pct(e.kingdom.chance)} ihtimalle bir olay düşer ve ${min(e.lobby.minSeconds)}–${min(e.lobby.maxSeconds)} dakika sürer.`,
        `Bazı olaylar iki yol sunar: ozanı saraya davet edersiniz ya da şapka dolaştırırsınız, kayıp kervanın yükünü alırsınız ya da sahibine haber salarsınız. Her yolun bir bedeli ve bir kazancı vardır; karar için ${e.choice.decideSeconds} saniye var. Bedelini karşılayamadığınız yol kapalıdır.`,
        'Pencereler sıra sıra gelir; "Tümünü kapat" yalnızca haber verenleri kapatır, cevap bekleyenler kalır. Bakmadığınız haberleri bayatlayınca tek bir özete toplarım; hepsi günlükte de durur. Ben unutmam, lordum; unutsam elçilikten atarlar.',
      ]
    },
    go: { label: 'Günlüğü aç', act: tab('journal') },
  },

  // ---- The army and war -------------------------------------------------------------------------------------------
  {
    id: 'army',
    name: 'Ordu',
    icon: 'swords',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
      const c = balance.dynasty.command
      return [
        `Kışla asker havuzundan birlik yetiştirir: mızrakçı süvariyi yener, okçu mızrakçıyı, süvari okçuyu ve kalkanlıyı; kalkanlı da okçuyu. Mancınık sahada zayıftır ama kuşatmada surları siler. Garnizonunuzda şu an ${k.soldiers ?? 0} asker var.`,
        `Garnizondan en çok ${balance.military.maxArmies} ordu çıkarırsınız; ${balance.military.mergeTiles} karo yakındaki iki ordu birleşir. Hududun dışındaki orduya emir elçiyle gider (${delay} saniye); elçi vardıktan sonra ${balance.time.contactSeconds} saniye yeni emirler hemen uygulanır. O elçiler benim çıraklarımdır, lordum; yavaşlarsa bana söyleyin.`,
        `Moral yürürken düşer, evde ve hanların yanında hızla toparlanır. Bir yerde durdukça saha bilgisi birikir ve zara en çok +${dec(balance.military.familiarity.maxBonus)} ekler. Ordular yolları sever ve köprülerden geçer; surlardan geçemez, kendi kapınızdan geçer.`,
        `Kralınız orduya bizzat komuta edebilir: ordu sarayın kapısında durmalı, sarayda bir kraliçe ve en az bir oğul olmalı. Kralın ordusuna emir elçisiz gider ve zara kralın savaş yeteneğiyle bonus eklenir. Bedeli: kaybedilen muharebede ${pct(c.fall)} ihtimalle kral düşer.`,
      ]
    },
    go: { label: 'Ordu sekmesi', act: tab('army', 'army', 'land') },
  },
  {
    id: 'war',
    name: 'Savaş',
    icon: 'banner',
    group: 'war',
    pages: () => {
      const d = balance.diplomacy
      const b = balance.military.battle
      return [
        `Savaş ilanı için ilişki en fazla ${d.war.maxRelation} olmalı; savaş gerekçeniz varsa ${d.casusBelli.maxRelation} yeter. Gerekçesiz savaş açan, lobideki herkesle ${-d.casusBelli.infamy} puan ilişki kaybeder. Kılıcı çekmeden önce bir bahane bulun, lordum; tarih bahaneleri sever.`,
        `Savaştaki iki ordu ${balance.military.contactTiles} karo yaklaşınca meydan muharebesi olur. Her ${b.roundSeconds} saniyede bir tur: iki taraf d${b.dice} atar, saha bilgisi, kuleler, tapınak ve birlik üstünlüğü eklenir. Morali ya da askeri biten yenilir, en geç ${b.maxRounds}. turda saldıran çekilir. "İzle" ile seyredersiniz.`,
        `Düşman sarayına varan ordu kuşatır: garnizon, gözcü kuleleri ve surlar savunur. Kazanan her depodan ${pct(balance.military.siege.lootShare)} alır, ama asker başına en çok ${balance.military.siege.carryPerSoldier} birim taşır. Düşen saray ${min(balance.military.siege.shieldSeconds)} dakika kalkan kazanır. Bir de gözdağı var: düşman hududunun yanında bekleyen ordu halkını korkutur (mutluluk ${balance.military.fear.happiness}).`,
        `Savaş puanı muharebelerden (${d.warScore.battle}) ve kuşatmalardan (${d.warScore.siege}) birikir. Barışta altın istersiniz (her ${d.peace.goldPerScore} altın bir puan) ya da ${d.peace.tributeMinScore} puanla haraç; ${d.peace.enforceScore} puana ulaşan barışı dayatır.`,
      ]
    },
    go: { label: 'Savaşlar', act: tab('army', 'army', 'battles') },
  },
  {
    id: 'towns',
    name: 'Kasabalar',
    icon: 'house',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const t = balance.towns
      const tiers = t.overreach.tiers
      const held = k.towns?.length ?? 0
      return [
        `Haritada küçük kasabalar vardır. Kuşatma yalnızca kasabanın panelinden başlar; ordu kapıya varınca ${min(t.siegeSeconds)} dakika sürer ve her ${min(t.siegeRoundSeconds)} dakikada bir asker kaybedersiniz. Sahipsiz kasaba ${t.garrison[0]}–${t.garrison[1]} askerle direnir; kazıklı olanlar daha zor düşer.`,
        `Alınan kasaba her tur gönderir: vergi kasabası ${dec(t.kinds.gold.perRound)} altın, tarım ${t.kinds.food.perRound} yemek, kereste ${t.kinds.materials.perRound} yapı, demirci ${dec(t.kinds.arms.perRound)} savaş malzemesi; kalabalık kasaba ${t.kinds.people.villagers} köylülük yer verir. Bakımı siz seçersiniz; bakım sadakati, sadakat de katkıyı büyütür.`,
        `Sadakat ${t.revolt.below} puanın altına inerse kasaba ayaklanır, asiler kapıya dayanır; ordunuzla bastırırsanız sadakat +${t.rebels.quellLoyalty} olur. ${t.revolt.breakAwayBelow} puanın altında kasaba sizden kopar.`,
        `Açgözlülüğün de cezası vardır, lordum: ${tiers[0].towns} kasabada hafif, ${tiers[1].towns} kasabada ağır ceza, ${tiers[2].towns} ve üstünde sadakat %${tiers[2].loyaltyCap} kadarında takılır ve hepsi sonunda kopar. ${held ? `Şu an ${held} kasabanız var.` : 'Henüz kasabanız yok; bir tanesi iyi gelir, ikisi de olur.'} Fazlasını paneldeki "Serbest bırak" ile salabilirsiniz.`,
      ]
    },
  },
  {
    id: 'navy',
    name: 'Donanma',
    icon: 'ship',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const s = balance.navy.ships
      const ships = countShips(allShips(k))
      return [
        `Tersane 4. seviye sarayla açılır ve kıyıya kurulur. Kadırga (${s.galley.cost.gold} altın) savaşır, koka (${s.cog.cost.gold}) yük taşır ve balık tutar, çektiri (${s.corsair.cost.gold}) hızlı akıncıdır. Kadırga çektiriyi, çektiri kokayı yener. Tayfa asker havuzundan gelir. ${ships ? `Limanınızda ${ships} gemi var.` : 'Henüz geminiz yok; ben de denize pek güvenmem zaten.'}`,
        `Limandan en çok ${balance.navy.maxFleets} filo çıkar. Barışta deniz ticareti yapar (lobi fiyatının ${pct(balance.navy.trade.priceFactor)} kadarına satar, piyasayı az düşürür), balık tutar ya da korsan avlar. Filoyu "Hareket et" ile haritada istediğiniz suya da gönderirsiniz.`,
        `Savaşta abluka kurarsınız: düşmanın iskelesi balık tutamaz, ticareti durur, halkı üzülür. Kıyı akını depolarından her malın ${pct(balance.navy.raid.stealShare)} kadarını kaçırır. Ablukaya düşen taraf savaş gemileriyle ablukayı yarabilir. Deniz muharebesinde kendi iskelesindeki savunan ${pct(balance.navy.battle.harbourBonus)} güçlüdür.`,
      ]
    },
    go: { label: 'Donanma bölümü', act: tab('army', 'army', 'sea') },
  },

  // ---- The crowns, the court and intrigue -----------------------------------------------------------------------------
  {
    id: 'crowns',
    name: 'Taçlar',
    icon: 'crown',
    group: 'court',
    pages: ({ kingdom: k, online }) => {
      const cr = balance.cities.crown
      const tr = cr.patrol.tribute
      const asked = Math.max(tr.min, Math.round(k.stock.gold * tr.share))
      const gifts = cr.gifts.map((g) => g.gold).join(' / ')
      return [
        `İki taç krallığı vardır: ${online.crowns.join(' ve ') || 'iki başkent'}. Oyuncular krallık değil, onlardan birine biat eden lordlardır. Biat sezon boyunca kalıcıdır ve sarayın ${cr.requiredForPalaceLevel}. seviyesi için şarttır. ${k.liege === undefined || k.liege === null ? 'Siz henüz kimseye bağlanmadınız, lordum.' : `Bağlı olduğunuz taç: ${online.crowns[k.liege] ?? 'bilinmiyor'}.`}`,
        `Şimdi acı gerçek, lordum: taçlar size para kazandırmaz. Rakip taç her ${min(tr.everySeconds)} dakikada bir haraççı gönderir ve hazinenin ${pct(tr.share)} kadarını, en az ${tr.min} altın ister; bugünkü hazinenizle ${n(asked)} altın. Reddederseniz o tacın gözünden düşersiniz; konuşursanız, huyunu tutturursanız ${pct(tr.talk.discount[tr.talk.discount.length - 1])} kadar indirim koparırsınız.`,
        `Cevap vermezseniz haraç kendiliğinden ödenir; oyundayken susarsanız ${pct(tr.afkFactor - 1)} fazlasıyla. Kendi tacınızın devriyesi ise eğlence merkezinize uğrayınca yalnızca ${cr.patrol.tip} altın bahşiş bırakır; armağanlar ilişkinize göre ${gifts} altın. Yani altını tüccardan, kasabalardan, seferlerden ve ganimetten kazanırsınız; taçtan kazandığınız itibardır.`,
        `İtibar da boş değildir: taç siparişleri, tacın görevleri (${cr.quests.gold[0]}–${cr.quests.gold[1]} altın) ve kraliyet elçisinin istekleri ilişkiyi yükseltir; tacın yönettiği malı satarken iyi ilişki ${pct(cr.stewardship.bonus)} fazla fiyat getirir, kötüsü ${pct(cr.stewardship.penalty)} eksik.`,
        `Taçların da hanedanı vardır: hükümdarlar yaşlanır, ölür, yerine çocukları geçer. Açgözlü hükümdarın haraççıları çok ister, cömerdinin devriyesi çok bahşiş bırakır. İki taç ${Math.round(cr.rivalry.windowSeconds / 3600)} saatlik dönemlerde barış, gerginlik ya da savaştadır; savaşta haraççılar ×${dec(cr.rivalry.effects.war.tribute)} ister.`,
      ]
    },
    go: { label: 'Krallık bölümü', act: tab('diplomacy', 'diplomacy', 'crowns') },
  },
  {
    id: 'dynasty',
    name: 'Hanedan',
    icon: 'leaf',
    group: 'court',
    pages: ({ kingdom: k, now }) => {
      const d = balance.dynasty
      const king = k.dynasty?.king
      return [
        `Lordluğunuzun bir hanedanı vardır: hükümdar, kraliçe, çocuklar, kardeşler ve akrabalar. Bir yıl bir gerçek saattir. ${king ? `${king.name} şu an ${ageOf(king.bornAt, now)} yaşında; Allah uzun ömür versin, ama ${d.death.atAge[0]}–${d.death.atAge[1]} arası bir yaşta hepimiz gideriz.` : 'Henüz tahtta kimse yok; naipler idare ediyor.'}`,
        'Yetenekler üçtür: maliye vergiyi ve ticareti, halk mutluluğu ve iş gücünü, askerlik zarı ve maaşı etkiler. Kraliçenin yeteneklerinin yarısı hükümdarınkine eklenir. Beşten yukarısı iyidir, lordum; ben de gençken beşin üstündeydim.',
        `Kraliçe sarayda oldukça çocuk doğar: bir çiftin en çok iki çocuğu olur: çoğu zaman iki oğul, bazen tek oğul, bazen bir oğul ve bir kız. Adlarını siz koyarsınız (bir kez!), eğitimlerini seçersiniz; ${d.comingOfAge} yaşında reşit olunca o yetenek artar. Sarayın ${d.queenForPalaceLevel}. seviyesi için kraliçe şarttır.`,
        `Hükümdar ölünce en büyük oğul geçer; oğul küçükse naipler konseyi yönetir. Oğul yoksa reşit bir erkek kardeş geçer. Tahta geçmeyen kardeşler çoğu zaman genç yaşta bir hastalıktan ölür; salgın günlerinde hanedandan biri de gidebilir (ardılı olmayan hükümdar hariç). Kimse kalmazsa kraliçe yönetir, ama onu evlendirmek şarttır: siz seçmezseniz ${d.council.kinsmanYears} yıl içinde konsey bir eş bulur. Kraliçe de yoksa naipler yönetir, ${d.council.kinsmanYears} yıl sonra bir akraba çağrılır. Hanedan bitmez, lordum; yalnızca karışır. Kardeşlerin hırsı ve taht kavgaları "Entrika" konusunda.`,
      ]
    },
    go: { label: 'Hanedan bölümü', act: tab('kingdom', 'palace', 'house') },
  },
  {
    id: 'diplomacy',
    name: 'Diplomasi',
    icon: 'scroll',
    group: 'court',
    pages: () => {
      const d = balance.diplomacy
      return [
        `Her iki lordun arasında −100 ile +100 arası bir ilişki vardır; zamanla sıfıra döner. Elçiyle ilişki geliştirirsiniz (${d.improve.cost.gold} altına +${d.improve.gain}), hediye yollarsınız, ittifak ya da barış teklif edersiniz. Rakip taçların lordları birbirine ${d.crowns.rivalMax} puandan fazla ısınamaz; ittifak ise +${d.alliance.minRelation} ister.`,
        `Lordlar birbirinden haraç da ister: kabul eden her tur ${d.tribute.minGold}–${d.tribute.maxGold} altın öder ve ilişki ${d.tribute.accept} düşer. Reddetmek ${d.tribute.reject}, kabul edip sonra kesmek ${d.tribute.renege} ve herkesle ${d.tribute.renegeInfamy} getirir. İttifakı bozmak da ${d.alliance.break}. Sözünüzü tutun, lordum; tutamayacaksanız hiç vermeyin.`,
        `Düşmanlık da diplomasidir: hakaret elçisi ilişkiyi ${d.insult.relation} düşürür. Ticaret yolu yağmasında garnizondan ${d.raid.soldiers} asker düşmanın tüccarını basar; şans ${pct(d.raid.baseChance)}, ticaret noktasının yanındaki her gözcü kulesi ${pct(d.raid.towerPenalty)} düşürür. Başarırsanız ${d.raid.lootTrips} seferlik malı alır, ticaret noktasını harap edersiniz.`,
        `Her kötülük karşı tarafa bir savaş gerekçesi verir: casusu yakalanan, hakarete uğrayan, haracı kesilen, kraliçesi kaçırılan… Gerekçe ${Math.round(d.casusBelli.seconds / 3600)} saat geçerlidir. −20'nin altındaki ilişkiler çoğaldıkça itibarınız düşer, elçileriniz en çok ${pct(d.reputation.maxPenalty)} az etki eder.\n\nKardeş kavgaları, evlilikler ve casusların karanlık işleri için "Entrika"yı sorun.`,
      ]
    },
    go: { label: 'Diplomasi sekmesi', act: tab('diplomacy', 'diplomacy', 'kingdoms') },
  },
  {
    id: 'intrigue',
    name: 'Entrika',
    icon: 'moon',
    group: 'court',
    pages: ({ kingdom: k, now }) => {
      const i = balance.dynasty.intrigue
      const r = i.revolt
      const ops = balance.espionage.operations
      const sw = balance.cities.crown.switch
      const brothers = k.dynasty ? siblingsOf(k.dynasty).filter((p) => hasOpinion(p, now)) : []
      const sour = brothers.filter((p) => opinionOf(k, p, now).ruler < i.opinion.warn).length
      return [
        `Saray dışarıdan sakin görünür, lordum; içeriden kaynar. Reşit her oğlun, kardeşin ve akrabanın hükümdara bir bakışı vardır: yakınlık, hükümdarın yetenekleri, halkın mutluluğu ve kendi hırsı belirler. Büyük kardeşin tahtta gözü vardır. ${i.gift.gold} altınlık bir hediye bakışı +${i.gift.opinion} yükseltir, sonra yavaşça söner.${brothers.length ? ` Şu an ${sour ? `${sour} yakınınız hoşnutsuz` : 'kimse hoşnutsuz değil'}.` : ''}`,
        `${i.roles.minAge} yaşını geçen hanedan üyelerine görev verin, sevinirler: vali bir kasabanın sadakatini yükseltir, devriye komutanı tacın bahşişini ve ilişkiyi artırır (ama taç onu da sever), hazinedar vergiyi maliyesiyle büyütür. Görevden alınan gücenir; ben de bir kez görevden alındım, hâlâ gücenikim.`,
        `Prensesler evlendirilir: tacın ailesine (${i.marriage.crown.dowry} altın çeyiz, taçla ilişki +${i.marriage.crown.relation}), bir kasabanın ileri gelenine (${i.marriage.town.dowry} altın; sizin kasabanızsa sadakat +${i.marriage.town.loyalty}, kimsenin değilse kılıçsız size bağlanır) ya da elçiyle başka bir lordun hanedanına (kabul ederse ilişki +${i.marriage.lord.relation}).`,
        `Bakışı ${r.below} puanın altına inen kardeş isyan edebilir: garnizonun bir kısmını alır, hududun dışında karargâh kurar, asileri dakikada büyür ve ${r.growMinutes} dakika sonra saraya yürür. Ordunuzla karargâhı basın ya da taçtan yardım isteyin (asker ya da ${i.aid.gold} altın). Tacınız davacıyı desteklemişse ve isyanı bastırırsanız ${sw.offerMinutes} dakika içinde rakip taca geçebilirsiniz; biatin bozulduğu tek an budur.`,
        `Bir de karanlık işler var: casuslarınız güçlü bir ağla sabotaj yapar (${ops.sabotage.minStrength}+), kraliçeyi kaçırır (${ops.kidnap.minStrength}+, hapishaneniz olmalı; fidye en az ${ops.kidnap.ransomMin} altın), kasabada isyan kışkırtır (${ops.townRevolt.minStrength}+, sadakat ${ops.townRevolt.loyalty}) ya da lordluğu ayaklandırır (${ops.revolt.minStrength}+). Yakalanırsanız kim olduğunuz ortaya çıkar, karşı taraf da savaş gerekçesi kazanır.`,
      ]
    },
    go: { label: 'Hanedan bölümü', act: tab('kingdom', 'palace', 'house') },
  },
  {
    id: 'spies',
    name: 'Casusluk',
    icon: 'eye',
    group: 'court',
    pages: () => {
      const e = balance.espionage
      const o = e.operations
      return [
        `Casus evi casus yetiştirir: ${e.spyCost.gold} altına, ${e.spySeconds} saniyede bir; seviyesine göre ${e.capacityByLevel.join(' / ')} casus. Bir casusu bir lorda ve bir konuya (hammadde, ordu ya da diplomasi) gönderirsiniz; orada kaldıkça ağ gücü artar, rapor netleşir.`,
        `Evde kalan casuslar karşı casusluk yapar (her biri ${dec(e.counterPerSpy)}, casus evinin her seviyesi ${dec(e.counterPerLevel)} puan): düşmanın ağı yavaş kurulur, casusu çabuk yakalanır. İlişkisi kötü olan lord da sizi gözler. Yakalanan casus ölür, gönderen ortaya çıkar.`,
        `Ordu ağı güçlendikçe birlik türlerini ve gemileri de söyler. Güçlü ağla operasyon yapılır: sabotaj ${o.sabotage.cost.gold}, kraliçe kaçırma ${o.kidnap.cost.gold}, kasabada isyan ${o.townRevolt.cost.gold}, ayaklanma ${o.revolt.cost.gold} altın. Operasyon, başarılı olsun olmasın, istediği kadar ağ harcar. Ayrıntısı "Entrika"da.`,
      ]
    },
    go: { label: 'Casusluk bölümü', act: tab('diplomacy', 'diplomacy', 'spies') },
  },

  // ---- Bandits, clans and pirates ---------------------------------------------------------------------------------------
  {
    id: 'bandits',
    name: 'Yağmacılar',
    icon: 'warn',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const b = balance.outlaws.bands
      const r = balance.outlaws.road
      const held = k.outlaws?.road ?? 0
      return [
        `Ticaret yollarında ${b.count} yağmacı çetesi dolaşır, lordum: her biri ${b.soldiers[0]}–${b.soldiers[1]} kişi, yırtık is karası bir sancak altında, kendi yol kesiminde ileri geri yürür. Ordulardan yavaştırlar; yakalamak zor değil, bulmak zor değil, sevmek zor.`,
        `Ticaret noktanızın ${r.radiusTiles} karo çevresindeki yolu tutarlarsa tuttukları pay ölçüsünde tüccarınızın kazancından en çok ${pct(r.merchantCut)} kadarını keserler, halkınız da tedirgin olur. ${held > 0 ? `Şu an yolunuzun ${pct(held)} kadarı onların elinde.` : 'Şu an sizin yolunuz temiz; dua edelim öyle kalsın.'}`,
        `Çeteye tıklayıp bir ordu seçin, "Takip et" deyin: ordu çetenin önünü keser, ${b.chase.contactTiles} karo yaklaşınca muharebe olur. ${min(b.chase.maxSeconds)} dakikada yakalayamazsa vazgeçer.`,
        `Yenilen çete ${min(b.respawnSeconds)} dakika dağılır, sonra bir kişi kalabalık geri gelir. Ganimet kişi başına ${b.loot.armsPerSoldier} savaş malzemesi, ${b.loot.goldPerSoldier} altın, ${b.loot.materialsPerSoldier} yapı malzemesi. Çeteler başıboş da değildir: dağlardaki bir klana bağlıdırlar. Kökünü kurutmak için "Mağaralar"ı sorun.`,
      ]
    },
    go: { label: 'Tüccara bak', act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'caves',
    name: 'Mağaralar ve klanlar',
    icon: 'map',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const cv = balance.outlaws.caves
      const cl = balance.outlaws.clans
      const spy = k.buildings.some((b) => b.kind === 'spyHouse')
      const trails = Object.values(k.caveTrail ?? {})
      const best = trails.reduce((m, t) => Math.max(m, t.wins), 0)
      return [
        `Dağ eteklerinde ${cv.count} mağara vardır ve hepsi birbirine benzer; ağızları hep bize doğru bakar ama içlerini göstermez. Bunların ${cl.count} tanesinde yağmacı klanları yaşar, her çete birine bağlıdır. Hangisinin dolu olduğunu dışarıdan anlayamazsınız, lordum; ben denedim, gözlüğüm yetmedi.`,
        `İz sürmek gerekir: bir klanın çetesini yendikçe esirler konuşur. İlk zaferde bir yer işaretinden (kasaba, han, başkent, sizin topraklarınız) yön, ikincisinde aşağı yukarı uzaklık, üçüncüsünde mağaranın kendisi. Casus eviniz varsa ${cl.discovery.spyHouseWins} zafer yeter.${spy ? ' Sizin var, şanslısınız.' : ''}${best ? ` En iyi izinizde ${best} zafer var.` : ''}`,
        `Bilmediğiniz bir mağaraya orduyu öylece yollarsanız ordu ağzın bir karo önünde durur, ama içine bakamaz: yol bozuktur, meşaleler söner, bir göçük vardır… Boş mağara da dolu mağara da aynı sözleri söyler; aynı ordu aynı mağara için saatte bir haber getirir. Yani dağ dağ gezmek boşa yorgunluktur.`,
        `Bulunan mağaraya "Mağarayı kuşat" deyin. Koruyanlar ${cl.garrison[0]}–${cl.garrison[1]} kişiyle başlar ve zamanla büyür; evlerindedirler, moralleri ${cl.morale}, zarlarına +${dec(cl.caveBonus)} eklenir. Kazanırsanız klan yok olur: biriktirdiği ganimet (en az ${cl.hoard.gold} altın) sizin olur, puanınıza ${cl.scorePerCave} eklenir, çeteleri yollardan çekilir. Ama dağlar boş kalmaz; başka bir mağarada yeni bir klan doğar.`,
      ]
    },
  },
  {
    id: 'pirates',
    name: 'Korsanlar',
    icon: 'anchor',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const b = balance.outlaws.boats
      const s = balance.outlaws.sea
      const held = k.outlaws?.sea ?? 0
      return [
        `Göllerde ve nehirlerde ${b.count} korsan teknesi dolaşır: kara yelkenli, kan kırmızısı flamalı, her birinde ${b.ships[0]}–${b.ships[1]} gemi. Savaşta çektiri sayılırlar; kokaları yener, kadırgalara yenilirler.`,
        `İskelenizin ${b.reachTiles} karo yakınından geçen her tekne korsan etkisine ${pct(s.perBoat)} ekler: deniz ticaretine saldırı sıklaşır, iskelenin ve balıkçı filolarının avı azalır, halk tedirgin olur. ${held > 0 ? `Sizin sularınızda etki şu an ${pct(held)}.` : 'Sizin sularınız şu an sakin.'}`,
        `Tekneye tıklayıp bir filo seçin; filoda en az bir savaş gemisi olmalı ve aynı suda yüzmeli. Filo teknenin önünü keser, ${dec(b.chase.contactTiles)} karo yaklaşınca deniz savaşı olur. Batırırsanız ${b.loot.bounty} altın artı gemi başına ${b.loot.perShip} altın, ${b.loot.arms} savaş ve ${b.loot.materials} yapı malzemesi; tekne ${min(b.respawnSeconds)} dakika ortadan kalkar. Ben yüzme bilmem, lordum; bu işleri size bırakıyorum.`,
      ]
    },
    go: { label: 'Donanma bölümü', act: tab('army', 'army', 'sea') },
  },

  // ---- Pursuits and glory ---------------------------------------------------------------------------------------------
  {
    id: 'expeditions',
    name: 'Seferler',
    icon: 'pin',
    group: 'pursuits',
    pages: ({ kingdom: k, now }) => {
      const x = balance.expeditions
      const kd = x.kinds
      const out = (k.expeditions ?? []).filter((e) => !e.result && e.startAt <= now && now < e.endAt).length
      return [
        `Saraydan küçük bir köylü kafilesi süreli bir yolculuğa çıkar; siz yokken de sürer. Avcılar ormana (${kd.hunt.minutes} dk), kâşifler dağlara (${kd.explore.minutes} dk), hacılar tapınağa (${kd.pilgrimage.minutes} dk), tüccar kafilesi uzak diyarlara (${kd.caravan.minutes} dk) ya da kayıp hazinenin izine (${kd.treasure.minutes} dk).`,
        `Erzak peşin ödenir; yoldaki köylüler çalışmaz, vergi vermez. Aynı anda saray seviyesine göre ${x.maxActiveByPalaceLevel.join(' / ')} sefer, halkın en çok ${pct(x.maxVillagerShare)} kadarı yolda olur. ${out ? `Şu an ${out} kafileniz yolda.` : 'Şu an yolda kafileniz yok.'}`,
        `Yolda iki üç şey olur: sürüye rastlarlar, ayıya rastlarlar… Her muhafız asker kötü olay ihtimalini ${pct(x.escortCut)} azaltır. Dönüşte ganimet depoya girer, resimli bir rapor açılır.`,
        'Bir sır vereyim, lordum: seferler boşta oturan köylüler içindir. Bir binada çalışan köylüyü yollarsanız üretim kaybı kazancı yer. Boşta köylü varsa kafileye katın; hacılar dönünce halk da bir süre mutlu olur.',
      ]
    },
    go: { label: 'Seferler', act: tab('kingdom', 'palace', 'expeditions') },
  },
  {
    id: 'works',
    name: 'Büyük işler',
    icon: 'temple',
    group: 'pursuits',
    pages: ({ kingdom: k }) => {
      const p = balance.projects
      const w = p.works
      const stages = PROJECT_IDS.reduce((s, id) => s + (k.projects?.[id]?.stage ?? 0), 0)
      return [
        `Ambarı ve hazinesi taşan lord için büyük işler vardır, lordum (${w.minPalace}. seviye saray): Ulu Katedral, Büyük Çarşı ve Şövalye Tarikatı. Her biri ${w.stageFactors.length} aşamadır; her aşama bir teslimat ister, "Depodan aktar" her ambarın ve hazinenin ${pct(w.keep.goods)} kadarını yedekte bırakır.`,
        `Katedral her aşamada mutluluk +${w.kinds.cathedral.happinessPerStage}, çarşı ticarete ${pct(w.kinds.bazaar.tradePerStage)}, tarikat askerlerin zarına +${dec(w.kinds.knights.battlePerStage)} katar. Her aşama ${w.growthPerStage} puan, biten iş +${w.completeGrowth} daha ve tacınızla ilişki +${w.completeCrownRelation}. ${stages ? `Şimdiye kadar ${stages} aşama bitirdiniz.` : 'Henüz bir taş bile koymadınız.'}`,
        `Daha küçük işler de var: halk şenliği (${p.festival.cost.gold} altın, ${n(p.festival.cost.food)} yemek; ${min(p.festival.seconds)} dakika mutluluk +${p.festival.happiness}) ve taca bağış (bir maldan ${n(p.donation.units)} birim, ilişki +${p.donation.relation}). Ambarda çürüyecek malı halka ve taca vermek, lordum, farelere vermekten iyidir.`,
      ]
    },
    go: { label: 'Projelere git', act: tab('kingdom', 'palace', 'projects') },
  },
  {
    id: 'goals',
    name: 'Hedefler ve unvan',
    icon: 'star',
    group: 'pursuits',
    pages: ({ kingdom: k }) => {
      const g = balance.goals
      const stars = Object.values(k.goals ?? {}).reduce((s, x) => s + (x?.tier ?? 0), 0)
      const rank = [...g.ranks].reverse().find((r) => stars >= r.stars) ?? g.ranks[0]
      const next = g.ranks.find((r) => r.stars > stars)
      return [
        `Hanedanın ${Object.keys(g.tracks).length} hedefi vardır: yapı, ev, saray, köylü, çocuk, zafer, kasaba, araştırma, sefer, ticaret, hazine, tapınak, gemi. Her birinin bronz, gümüş ve altın basamağı vardır ve her basamak bir yıldızla ${g.rewardByTier.map((r) => r.gold).join(' / ')} altınlık bir kese getirir.`,
        `Yıldızlar unvanınızı belirler: ${g.ranks.map((r) => r.title).join(', ')}. Sizin ${stars} yıldızınız var, unvanınız ${rank.title}${next ? `; ${next.title} olmak için ${next.stars - stars} yıldız daha` : '; daha yukarısı yok, lordum, ben de size bakarken gözlerimi kısıyorum'}.`,
        'Sezon sonunda lordlar puana göre sıralanır: hazine, gelişim (saray, kurumlar, büyük işler), nüfus, ordu, zafer (muharebeler, kuşatmalar, kasabalar, mağaralar) ve bilgi. Sohbetin Sıralama sekmesinde herkesin yerini görürsünüz; başkalarının hazinesini ise yalnızca casuslar söyler.',
      ]
    },
    go: { label: 'Hedefler', act: tab('kingdom', 'palace', 'goals') },
  },
  {
    id: 'games',
    name: 'Mini oyunlar',
    icon: 'dice',
    group: 'pursuits',
    pages: () => {
      const m = balance.minigames
      return [
        'Yorulunca biraz eğlenin, lordum: oduncu kampında odun yarma, tarlada hasat, iskelede ağ çekme, silah atölyesinde örs başında, ticaret noktasında kervan yolu, kışlada okçuluk ve balıkçı kulübesinde olta. Eğlence merkezi kurarsanız hepsi orada da oynanır.',
        `Her oyun ${min(m.cooldownSeconds)} dakikada bir oynanır. Bütün oyunlar birlikte saatte en çok ${m.budget.goldPerWindow} altın değerinde ödül verir; gerisi yalnızca şan içindir. Puanı sunucu kendisi hesaplar, en iyiler sezon ve tüm zamanlar sıralamasına girer.`,
        'Olta ayrıdır: balık tutarsanız bir kese ya da bir şişe çıkar. Şişedeki notlar başka lordların sırlarını fısıldar; çoğu yarım doğrudur, tıpkı saray dedikodusu gibi.',
      ]
    },
  },
]


// ---- What to do with the stores --------------------------------------------------------------------------------------

// Whether the stores or the treasury are filling up enough for the lord to ask what to do with them.
export function wellStocked({ kingdom: k, now }: AdvisorCtx): boolean {
  if (!hasPalace(k)) return false
  return (['food', 'materials', 'arms'] as const).some((g) => k.stock[g] >= storageCap(k, now) * 0.6) || k.stock.gold >= goldCap(k, now) * 0.7
}

// "How do we put our goods to use?": the envoy weighs what the lord has and what he may do with it (CLAUDE.md §9.10).
export function wealthAdvice(c: AdvisorCtx, pick: <T>(key: string, list: T[]) => T): { text: string; replies: Reply[] } {
  const { kingdom: k, now } = c
  const works = PROJECT_IDS.some((id) => projectError(k, id, now) === null)
  const level = palaceLevel(k, now)
  const replies: Reply[] = []
  let text: string
  if (works) {
    text = pick('wealth:works', [
      'Lordum, biraz büyük şeyler yapmanın vakti gelmedi mi sizce de? Ambarlar dolu, ustalar boş. Bir katedral, bir çarşı ya da bir şövalye tarikatı; her aşaması kalıcı bir kazanç ve sıralamada puan. Malı taşa çevirelim.',
      'Dolu ambar, lordum, farenin ve yangının sofrasıdır. Saray → Projeler\'de üç büyük iş bekliyor; fazlayı oraya aktaralım, adınız taşlara kazınsın.',
      'Lordum, servet saklandıkça erir: fare yer, pas yer, sel götürür. Büyük bir işe başlayalım; halk da görsün, tacınız da.',
      'Ustalar boş, ambar dolu, lordum; bu ikisini buluşturalım. Katedral gönüllere, çarşı keselere, tarikat kılıçlara yarar.',
      'Bir lordun adını yüzyıllar sonra ambarı değil, diktiği taşlar söyler, lordum. Projeler bölümünde üç büyük iş bekliyor.',
    ])
    replies.push({ label: 'Projelere git', act: tab('kingdom', 'palace', 'projects') })
  } else if (level >= 3) {
    text = pick('wealth:festival', [
      'Lordum, halka bir şenlik verin: meydanda sofralar kurulur, yemek erir, gönüller dolar. Taca bağış da var: fazla mal tacın gözünü sizden yana çevirir.',
      'Fazla yemeği bir şenliğe, fazla malı taca bağışa çevirelim, lordum. Büyük işler için sarayın dördüncü katına çıkmamız gerekecek.',
      'Halk karnını doyurup gülmek ister, taç da gönlünü hoş tutmak, lordum. Bir şenlik ve bir bağış; ambar hafifler, gönüller dolar.',
      'Lordum, dolu ambarı afetler sever. Bir şenlik düzenleyelim, taca bir araba mal gönderelim; fare de pas da eli boş kalsın.',
      'Malı saklamak yerine bir şenliğe harcayın, lordum: yarım saat mutluluk, bir ömür hatıra. Taca bağış da ilişkiyi ısıtır.',
    ])
    replies.push({ label: 'Projelere git', act: tab('kingdom', 'palace', 'projects') })
  } else {
    text = pick('wealth:sell', [
      'Lordum, fazlayı tüccara verin: o malı satıp altın getirir. Tacın siparişleri ve kraliyet elçisinin istekleri de iyi öder. Saray büyüdükçe şenlikler ve büyük işler de açılır.',
      'Ambarda yatan mal, lordum, kimseye yaramaz. Tüccara hangi malı satacağını söyleyin; tacın siparişine de bir göz atalım.',
      'Fazla malı satalım, lordum; altın da yerinde durmasın, yeni yapılara ve yükseltmelere gitsin. Büyüyen lordun ambarı hiç taşmaz.',
      'Lordum, ambar dolarsa fazlası boşa gider. Tüccara sattıralım, kraliyet elçisinin isteğini karşılayalım ya da sarayı yükseltmek için harcayalım.',
      'Mal satılır, altın harcanır, saray büyür, lordum; dünyanın düzeni bu. Ambarın tavanını beklemeyelim.',
    ])
  }
  replies.push({ label: 'Tüccara bak', act: tab('trade', 'trade', 'merchant') })
  replies.push({ label: 'Sonra bakarız', answer: '' })
  return { text, replies: replies.slice(0, 3) }
}
