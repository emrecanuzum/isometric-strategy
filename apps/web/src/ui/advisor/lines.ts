import {
  ARCADE_GAMES, BUILDINGS, allShips, balance, countShips, buildingCount, clogsOf, crownQuest, fealtyOpen, fishError, gameError, goldCap, hasPalace,
  hasTradePost, palaceLevel, popCapFor, population, queenError, questProgress, storageCap, upgradeError,
  campSoldiers, hasOpinion, ofAge, opinionOf, siblingsOf,
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
  // The tip it puts off, and a change to the tutorial.
  id?: string
  tutorial?: 'on' | 'off'
  // Skips this tutorial step (a lord who does not want that building).
  skip?: string
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

export interface Topic {
  id: string
  name: string
  icon: IconName
  text: (c: AdvisorCtx) => string[]
  go?: { label: string; act: AdvisorAction }
}

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
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [['Kardeşim beni sever', 'Severdi, lordum. Şimdi çadırında sizin portrenize ok atıyor.']],
  },
  {
    id: 'kinSour',
    when: ({ kingdom: k, now }) => !k.pretender && !!k.dynasty && siblingsOf(k.dynasty).some((p) => hasOpinion(p, now) && opinionOf(k, p, now).ruler < balance.dynasty.intrigue.opinion.warn),
    say: ({ kingdom: k, now }) => {
      const p = siblingsOf(k.dynasty!).filter((x) => hasOpinion(x, now)).sort((a, b) => opinionOf(k, a, now).ruler - opinionOf(k, b, now).ruler)[0]
      return [
        `Kardeşiniz ${p.name} sofrada size hiç bakmıyor, lordum. Bir görev ya da küçük bir hediye gönlünü alır; yoksa bir gün asker toplayıp tahtınızı ister.`,
        `Lordum, ${p.name} saray kapısında fısıldaşıyor. Hoşnutsuz bir kardeş en tehlikeli düşmandır: ona bir kasabanın valiliğini verin ya da hazineden bir kese yollayın.`,
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [['Kardeşimden korkmam', 'Korkmayın, lordum; ama yatağınızın altına bakmayı da ihmal etmeyin.']],
  },
  {
    id: 'princess',
    when: ({ kingdom: k, now }) => !!k.dynasty && palaceLevel(k, now) >= 2 && [...k.dynasty.children, ...siblingsOf(k.dynasty)].some((p) => p.sex === 'f' && ofAge(p, now)),
    say: () => {
      const m = balance.dynasty.intrigue.marriage
      return [
        `Saraydaki prensesimiz evlenme çağında, lordum. Taca gelin verirsek taçla ilişkimiz +${m.crown.relation} artar; bir kasabaya verirsek kasaba sadık kalır, kimsenin olmayan bir kasaba ise kılıçsız bizim olur.`,
        `Lordum, prensese talipler kapıda kuyruk oldu. Bir lorda gelin verirseniz ilişkiniz +${m.lord.relation} artar; taca ya da bir kasabaya vermek de akıllıca olur.`,
      ]
    },
    go: { label: 'Hanedana bak', act: tab('kingdom', 'palace', 'house') },
    jokes: [['Kızım kimseyle evlenmez', 'O da öyle diyor, lordum; ama şövalye turnuvasında gözü birine takıldı.']],
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
    ],
  },
  {
    label: 'Bir fıkra anlat',
    answers: [
      'Bir lord sarayına sur çekmiş, kapı koymayı unutmuş. Halk bir hafta içeride kalmış. Lord "Ne güzel, kimse şikâyet etmiyor" demiş. Kimse dışarı çıkıp şikâyet edemiyormuş da ondan.',
      'Bir lord tüccarına "Hiçbir şey satma" demiş. Tüccar bir hafta oturmuş, sonra gelip "Lordum, oturmaktan yoruldum, bari sandalyeyi satayım mı?" diye sormuş.',
      'Bir lord mancınığı ters kurmuş, taşı kendi sarayına atmış. "Tatbikattı" demiş. O günden beri o lordluğun tatbikatlarına herkes miğferle geliyor.',
      'Köylünün biri hastaneye gitmiş: "Doktor, her gün yorgun uyanıyorum." Doktor sormuş: "Gece mesaisi mi?" Köylü: "Ben istemedim, lordum açtı." Doktor: "O zaman ilaç bende değil, lordunda."',
    ],
  },
  {
    label: 'Sence iyi bir lord muyum?',
    answers: [
      'Sizden iyisini görmedim, lordum. Gerçi ben pek dışarı çıkmam.',
      'Elbette, lordum. Bir de ambarları doldurursanız kusursuz olursunuz.',
      'Kitaplar size "Büyük" diyecek, lordum. Neyin büyüğü olduğunu ben uydururum.',
      'Sizden önceki lordlara da böyle demiştim, lordum; ama size gerçekten inanarak söylüyorum. Neredeyse.',
    ],
  },
  {
    label: 'Eski günleri anlat',
    answers: [
      'Gençken bir kraliçeyi kaçıran casusu kovaladım, lordum. Yakalayamadım ama çok güzel koştum.',
      'Eskiden elçiler atla giderdi, lordum. Şimdi de atla gidiyoruz, ama eskiden atlar daha hızlıydı. Ya da ben daha hafiftim.',
      'Bir keresinde iki lord arasında barış imzalattım, lordum. Mürekkep kurumadan savaş çıktı, ama imza çok güzeldi.',
      'Dedem de elçiydi, lordum; o da çok konuşurdu. Ailemizde sessiz biri doğsa sanırım onu evlatlıktan reddederiz.',
    ],
  },
]

// The list of topics, the answers to skipping a step and to closing the tutorial.
export const TOPICS_ASK = [
  'Ne öğrenmek istersiniz, lordum? Bilmediğim şey yok; olsa da söylemem.',
  'Hangi köşesini anlatayım, lordum? Kısa anlatacağım, söz. Kısa derken, elçi kısası.',
  'Sorun, lordum; kırk yılda öğrendiğimi beş dakikada anlatırım. Belki altı.',
  'Konuyu siz seçin, lordum, anlatmayı bana bırakın.',
]
export const SKIP_ANSWERS = [
  'Peki lordum, o işi şimdilik bir kenara koyuyorum. Sıradakine geçelim.',
  'Anlaşıldı, lordum; o adımı atlıyoruz. Her lordun kendi yolu var.',
  'Geçtik, lordum. İleride gerekirse öğreticiyi ayarlardan yeniden açarsınız, atlanan adımlar da geri gelir.',
  'Peki lordum; o binayı şimdilik hayal defterime yazıyorum. Sıradaki adım geliyor.',
]
export const TUTORIAL_OFF_ANSWERS = [
  'Peki lordum, artık kendi yolunuzu çiziyorsunuz. Bir şey sormak isterseniz sohbetin yanındaki Elçi düğmesi beni çağırır.',
  'Peki lordum; öğretmenlik bitti, danışmanlık başlıyor. Beni çağırmak için sohbetin yanındaki Elçi düğmesi yeter.',
  'Anladım, lordum, kanatlarınız çıktı. Öğreticiyi ayarlardan yeniden açabilirsiniz; ben de Elçi düğmesinin arkasında beklerim.',
  'Nasıl isterseniz, lordum. Kitabı kapatıyorum ama dilimi kapatmıyorum; Elçi düğmesine basmanız yeter.',
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
]

// ---- Topics he explains on request -----------------------------------------------------------------------------------

export const TOPICS: Topic[] = [
  {
    id: 'time',
    name: 'Zaman',
    icon: 'time',
    text: () => [
      `Her gerçek saat oyunda bir yıldır: haritada bir gündüz-gece döngüsü geçer (saatin başı gece yarısı ve 1 Ocak), takvim bir yıl ilerler, hanedan bir yaş büyür. Sezon ${balance.time.seasonGameDays} yıl, yani iki hafta sürer; sonra dünya sıfırlanır.`,
      'Aylar beşer dakikada geçer, mevsimler yaklaşık çeyrek saat sürer: gece yarısı kış, şafakta ilkbahar, öğlen yaz, akşama doğru sonbahar. Kışın tarla ve iskele az, yazın çok yemek verir; hastalık kışın hızlı yayılır.',
      `Ekonomi üretim turlarıyla işler: her ${balance.economy.productionSeconds} gerçek saniyede bir tur. Binalar üretir, halk yer, vergi ve maaş ödenir.`,
      `Gece (${balance.society.night.startHour}:00–0${balance.society.night.endHour}:00) hızlı geçer ve halk dinlenir: binalar yarı hızla çalışır. Gece mesaisi tam çalıştırır ama yorar.`,
      'Siz çevrimdışıyken de dünya akar: inşaatlar biter, tüccar sefer yapar, ordular yürür. Döndüğünüzde "Sen yokken" raporunu okursunuz.',
    ],
  },
  {
    id: 'build',
    name: 'İnşa',
    icon: 'build',
    text: () => [
      'İnşa sekmesinden bir yapı seçip hududunuzun içine yerleştirirsiniz. Her inşa, taşıma ve yıkım önce bir plana eklenir; alttaki çubukta "Onayla" deyince hepsi birden gider.',
      `Aynı anda en çok ${balance.economy.maxConstructions} inşaat yürür; fazlası sırada bekler. Sur parçaları sıraya girmez.`,
      'Kıyı karelerine yalnızca iskele ve balıkçı kulübesi, yol kenarına yalnızca ticaret noktası kurulur. İlk oduncu kampı, ilk ev ve ilk tarla bedavadır.',
      `Yıkılan yapının bedelinin yarısı geri döner; taşımak, harcananın ${pct(balance.economy.move.costShare)}'ını ister.`,
    ],
    go: { label: 'İnşa sekmesi', act: tab('build') },
  },
  {
    id: 'economy',
    name: 'Ekonomi',
    icon: 'gold',
    text: ({ kingdom: k, now }) => [
      'Dört kaynak vardır: altın, yemek, yapı malzemesi ve savaş malzemesi. Oduncu yapı malzemesi, tarla ve iskele yemek, silah atölyesi demir (savaş malzemesi) ya da silah üretir.',
      `Depo sınırı saray seviyesiyle artar, ambarlar ekler; şu an her maldan ${n(storageCap(k, now))} tutabilirsiniz. Hazine sınırı ${n(goldCap(k, now))} altın. Sığmayan boşa gider.`,
      'Gelir: köylülerin vergisi, tüccarın satışları, kasabalar, taç bahşişleri. Gider: asker maaşı, gemi bakımı, kasaba bakımı, haraçlar.',
      `Yokken üretim yavaşlar: son görülmenizden ${balance.economy.idle.graceHours} saat sonra her saat ${pct(balance.economy.idle.perHour)} azalır (yemek hariç).`,
    ],
    go: { label: 'Depo sekmesi', act: tab('store', 'store', 'books') },
  },
  {
    id: 'trade',
    name: 'Ticaret',
    icon: 'trade',
    text: () => [
      `Tüccar her seferde seçtiğiniz maldan götürür: ticaret noktası seviyesine göre ${balance.economy.trade.levels.map((l) => l.units).join(' / ')} birim. Sefer ${balance.economy.trade.tripSeconds} saniyedir; ticaret noktası saraydan uzaksa uzar.`,
      'Lobideki bütün lordlar aynı fiyat tablosunu paylaşır: satılan mal ucuzlar, alınan pahalanır, zamanla olağan fiyata döner. Taç krallıkları da piyasadan mal alır.',
      `Tüccarı bir taç başkentine de gönderebilirsiniz: ${balance.cities.trade.loadFactor} kat yük götürür ama sefer uzundur. Taç siparişleri ve görevler ek altın ve tacın gönlünü getirir.`,
      'Pazar binası eksik malı altınla almanıza yarar; her alınan birim bir sonrakini pahalandırır.',
    ],
    go: { label: 'Ticaret sekmesi', act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'people',
    name: 'Nüfus',
    icon: 'people',
    text: ({ kingdom: k, now }) => [
      `Evler köylüye yer verir; köylüler o yere her turda yavaş yavaş gelir. Boş yer çoksa daha hızlı gelirler. Nüfus sınırı saray seviyesi × ${balance.society.popCapPerPalaceLevel}; şu an ${popCapFor(palaceLevel(k, now))}.`,
      'Büyümeyi mutluluk belirler; açlık, kuşatma ve çok mutsuz halk göçe yol açar. Savaş büyümeyi yavaşlatır, kraliçe ve tapınak hızlandırır.',
      'Köylüler binalarda çalışır, vergi verir ve asker olur. Asker ve denizci köylüden düşer; terhis edilen asker köylüye döner.',
    ],
    go: { label: 'Halk sekmesi', act: tab('people', 'people', 'people') },
  },
  {
    id: 'happiness',
    name: 'Mutluluk',
    icon: 'happy',
    text: () => {
      const t = balance.society.tax.levels
      return [
        `Mutluluk her tur bir hedefe doğru kayar. Taban ${balance.society.happiness.base}; vergi düşükse +${t.low.happiness}, yüksekse ${t.high.happiness}, ağırsa ${t.heavy.happiness}. Kraliçe +${balance.society.happiness.queen}, açlık ${balance.society.happiness.starving}.`,
        `Vergi köylü başına turda düşük ${t.low.goldPerVillager}, normal ${t.normal.goldPerVillager}, yüksek ${t.high.goldPerVillager}, ağır ${t.heavy.goldPerVillager} altın getirir. Ağır vergi halkı göç ettirir.`,
        `Mutlu halk daha hızlı büyür ve daha çok asker olmaya razıdır. Gece mesaisi mutluluğu ${balance.society.night.shiftHappiness} düşürür; sarayı kapısız surla çevirmek de (hapishane) ${balance.society.happiness.imprisoned}.`,
      ]
    },
    go: { label: 'Mutluluk bölümü', act: tab('people', 'people', 'mood') },
  },
  {
    id: 'army',
    name: 'Ordu',
    icon: 'swords',
    text: () => [
      'Kışla asker havuzundan birlik yetiştirir: mızrakçı süvariyi yener, okçu mızrakçıyı, süvari okçuyu ve kalkanlıyı. Mancınık kuşatmada surları siler.',
      `Askerler sarayda garnizon olur; garnizondan en çok ${balance.military.maxArmies} ordu çıkarabilirsiniz. Ordular haritada yürür, ikiye bölünür, yakınken birleşir.`,
      'Hududun dışındaki orduya emir elçiyle gider; elçi varana kadar ordu eski emrini sürdürür. Elçi vardıktan sonra kısa bir süre yeni emirler hemen uygulanır.',
      'Ordunun morali yürürken düşer, hanların yanında hızla toparlanır. Bir yerde durdukça saha bilgisi birikir ve zara eklenir.',
    ],
    go: { label: 'Ordu sekmesi', act: tab('army', 'army', 'land') },
  },
  {
    id: 'war',
    name: 'Savaş',
    icon: 'banner',
    text: () => [
      `Savaş ilan etmek için ilişki en fazla ${balance.diplomacy.war.maxRelation} olmalı; savaş gerekçeniz varsa ${balance.diplomacy.war.peaceRelation} yeter. Gerekçesiz savaş açan herkesle ilişki kaybeder.`,
      `Savaştaki iki ordu ${balance.military.contactTiles} karo yaklaşınca meydan muharebesi olur. Muharebe turlarla sürer; zar, saha bilgisi, kuleler ve moral belirler. İzle düğmesiyle seyredebilirsiniz.`,
      'Düşman sarayına varan ordu kuşatma yapar: garnizon, gözcü kuleleri ve surlar savunur. Kazanan depolardan yağma alır; düşen saray bir süre kuşatma kalkanı kazanır.',
      'Savaş puanı muharebelerden ve kuşatmalardan hesaplanır; 100 puana ulaşan barışı dayatır.',
    ],
    go: { label: 'Savaşlar', act: tab('army', 'army', 'battles') },
  },
  {
    id: 'towns',
    name: 'Kasabalar',
    icon: 'house',
    text: () => [
      `Haritada küçük kasabalar vardır. Kasabanın panelinden "Kuşat" dersiniz; ordu kapıya varınca kuşatma ${min(balance.towns.siegeSeconds)} dakika sürer. Sahipsiz kasaba kendi garnizonuyla savunur.`,
      'Alınan kasaba her tur katkı gönderir: altın, yemek, malzeme ya da köylü. Bakımını siz seçersiniz; bakım sadakati yükseltir.',
      `Sadakat ${balance.towns.revolt.below}'in altına inerse kasaba ayaklanır, ${balance.towns.revolt.breakAwayBelow}'nin altında sizden kopar. Çok kasaba tutmak aşırı büyüme cezası getirir: dört ve üstünde hepsi ayaklanır.`,
    ],
  },
  {
    id: 'crowns',
    name: 'Taçlar',
    icon: 'crown',
    text: ({ online }) => [
      `İki taç krallığı vardır: ${online.crowns.join(' ve ') || 'iki başkent'}. Oyuncular onlardan birine biat eden lordlardır; biat sezon boyunca kalıcıdır ve sarayın ${balance.cities.crown.requiredForPalaceLevel}. seviyesi için şarttır.`,
      `Kendi tacınızın devriyesi eğlence merkezinize uğrar ve bahşiş bırakır. Rakip taç her ${min(balance.cities.crown.patrol.tribute.everySeconds)} dakikada bir haraççı gönderir ve hazinenin ${pct(balance.cities.crown.patrol.tribute.share)}'ini ister: öde ya da reddet.`,
      `Cevap vermezseniz haraç kendiliğinden ödenir; oyundaysanız ${pct(balance.cities.crown.patrol.tribute.afkFactor - 1)} fazlasıyla. Taçla ilişkiniz armağanları, görevleri ve fiyatlarınızı belirler.`,
    ],
    go: { label: 'Krallık bölümü', act: tab('diplomacy', 'diplomacy', 'crowns') },
  },
  {
    id: 'diplomacy',
    name: 'Diplomasi',
    icon: 'scroll',
    text: () => [
      'Her lord çiftinin −100 ile +100 arası bir ilişkisi vardır. Elçiyle ilişki geliştirir, hediye gönderir, haraç ister, ittifak ya da barış teklif edersiniz.',
      `İttifak en az +${balance.diplomacy.alliance.minRelation} ilişki ister; müttefik orduları muharebede birbirini korur. Rakip taçların lordları birbirine pek ısınamaz.`,
      `Hakaret elçisi ilişkiyi ${balance.diplomacy.insult.relation} düşürür ve karşı tarafa savaş gerekçesi verir. Haracı kesmek ya da ittifakı bozmak itibarınızı da yaralar.`,
    ],
    go: { label: 'Diplomasi sekmesi', act: tab('diplomacy', 'diplomacy', 'kingdoms') },
  },
  {
    id: 'spies',
    name: 'Casusluk',
    icon: 'eye',
    text: () => [
      'Casus evi casus yetiştirir. Bir casusu bir lorda ve bir konuya (hammadde, ordu, diplomasi) gönderirsiniz; orada kaldıkça ağ gücü artar ve rapor netleşir.',
      `Evde tutulan casuslar karşı casusluk yapar: her biri ${balance.espionage.counterPerSpy}, casus evinin her seviyesi ${balance.espionage.counterPerLevel} puan.`,
      'Güçlü bir ağla operasyon yapılır: %50 sabotaj, %70 kraliçe kaçırma (hapishane gerekir), %90 isyan. Operasyon ağı harcar; başarısız olursa kim yaptığı ortaya çıkar.',
    ],
    go: { label: 'Casusluk bölümü', act: tab('diplomacy', 'diplomacy', 'spies') },
  },
  {
    id: 'navy',
    name: 'Donanma',
    icon: 'ship',
    text: () => [
      'Tersane 4. seviye sarayla açılır ve kıyıya kurulur. Kadırga savaşır, koka yük taşır, çektiri hızlı akıncıdır. Tayfa asker havuzundan gelir.',
      `Limandan en çok ${balance.navy.maxFleets} filo çıkar. Görevler: deniz ticareti, balık avı, korsan avı; savaşta abluka, kıyı akını ve ablukayı yarma.`,
      'Korsanlar ticaret seferlerine saldırabilir; eskort gemileri korur. Kadırga çektiriyi, çektiri kokayı yener.',
    ],
    go: { label: 'Donanma bölümü', act: tab('army', 'army', 'sea') },
  },
  {
    id: 'dynasty',
    name: 'Hanedan',
    icon: 'crown',
    text: () => [
      `Lordluğun bir hanedanı vardır: hükümdar, kraliçe ve çocuklar. Bir hanedan yılı takvimdeki bir yıldır: bir gerçek saat.`,
      'Yetenekler (maliye, halk, askerlik) vergiyi, mutluluğu ve savaş zarını etkiler. Kraliçenin yetenekleri hükümdara yarı yarıya eklenir.',
      `Çocuklara ad koyar ve eğitim seçersiniz; ${balance.dynasty.comingOfAge} yaşında reşit olurlar. Hükümdar ölünce en büyük oğul tahta geçer; yoksa naipler konseyi yönetir.`,
    ],
    go: { label: 'Hanedan bölümü', act: tab('kingdom', 'palace', 'house') },
  },
  {
    id: 'games',
    name: 'Mini oyunlar',
    icon: 'dice',
    text: () => [
      'Balıkçı kulübesinin oltası, kışlada okçuluk, silah atölyesinde örs başında ve ticaret noktasında kervan yolu; hepsi eğlence merkezinde de oynanır.',
      `Her oyun ${min(balance.minigames.cooldownSeconds)} dakikada bir oynanır ve küçük ödüller verir. Puanı sunucu hesaplar; en iyi puanlar sezon ve tüm zamanlar sıralamasına girer.`,
    ],
  },
  {
    id: 'events',
    name: 'Olaylar',
    icon: 'star',
    text: () => [
      'Günün olayları iki kanaldan gelir: bütün lobiye (hava, kuyruklu yıldız, salgın…) ve yalnızca size (define, orman yangını, haydut baskını…).',
      `Krizlerde üç seçenek vardır: köylüleri seferber et, orduyu seferber et ya da bir şey yapma. Karar için ${balance.institutions.events.crisis.decideSeconds} saniye var; cevap vermezseniz bir şey yapılmamış sayılır.`,
      'Bazı olaylar iki yol sunar; her yolun bir bedeli ve bir kazancı vardır.',
    ],
  },
]
