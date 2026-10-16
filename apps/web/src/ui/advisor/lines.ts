import {
  ARCADE_GAMES, BUILDINGS, balance, buildingCount, clogsOf, crownQuest, fealtyOpen, fishError, gameError, goldCap, hasPalace,
  hasTradePost, palaceLevel, popCapFor, population, queenError, questProgress, storageCap, upgradeError,
} from '@game/shared'
import type { BuildingKind, Kingdom } from '@game/shared'
import type { IconName } from '../icons'
import type { TabId } from '../hud/Hud'
import type { Online } from '../hud/online'

// What the envoy says (CLAUDE.md §9.8): his advice, picked from what the lord lacks or could do better; the steps of
// the tutorial for a new lord; and the topics he explains when asked. Only words and the checks that pick them live
// here; the panel that speaks them is Advisor.tsx. Numbers come from the balance files, never written in.

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
}

export interface Tip {
  id: string
  when: (c: AdvisorCtx) => boolean
  say: (c: AdvisorCtx) => string
  // The reply that sets about it, and a joking one with the envoy's comeback.
  go?: { label: string; act: AdvisorAction }
  joke?: [string, string]
  // How many minutes "later" puts it off (default SNOOZE_MINUTES).
  snooze?: number
}

export interface Step {
  id: string
  title: string
  say: (c: AdvisorCtx) => string
  done: (c: AdvisorCtx) => boolean
  go?: { label: string; act: AdvisorAction }
  // The tab whose button glows while the step waits.
  hint?: TabId
  cheer: string
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
export const LATER = ['Sonra, elçi efendi', 'Şimdi olmaz', 'Bir düşüneyim']
export const LATER_ANSWERS = [
  'Peki lordum. Not ettim: "sonra". Bu kelimeyi çok severim, kırk yıllık elçiyim.',
  'Elbette. Ben de bu arada şu parşömeni okuyormuş gibi yaparım.',
  'Nasıl isterseniz. Ama tarih, ertelenen kararlarla doludur; ben yalnızca söylüyorum.',
  'Anlaşıldı. Unuttuğunuzda tekrar hatırlatırım, işim bu.',
]

// The things he can tell the lord to do, the most pressing first.
export const TIPS: Tip[] = [
  {
    id: 'foodLow',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.food < Math.max(20, storageCap(k, now) * 0.06) && population(k, now).villagers > 4,
    say: ({ kingdom: k }) => `Lordum, ambarda yalnızca ${n(k.stock.food)} yemek kaldı. Halk karnını sarayın duvarlarına bakarak doyurmaz; açlık mutluluğu düşürür ve köylüler göç eder. Bir tarla daha, belki bir iskele?`,
    go: { label: 'Tarla kuralım', act: build('farm') },
    joke: ['Halk biraz perhiz yapsın', 'Perhiz mi? Geçen sefer biri bunu dedi; şimdi heykeli meydanda, ama başı yok.'],
    snooze: 10,
  },
  {
    id: 'noFarm',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'farm') === 0 && count(k, 'lumberCamp') > 0,
    say: () => 'Tek bir tarlamız bile yok, lordum. Köylüler her üretim turunda yemek yer; ekmeksiz halk, kraliyet şarkılarını bile söylemez.',
    go: { label: 'Hemen hallederim', act: build('farm') },
    joke: ['Taş çorbası yaparız', 'Taş çorbası mı? Taş ocağımız bile yok, lordum. Önce tarla.'],
  },
  {
    id: 'noLumber',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'lumberCamp') === 0,
    say: () => 'Lordum, her yapı yapı malzemesi ister ve onu oduncu kampı üretir. İlk oduncu kampı bedavadır; bedava olan şeyi geri çevirmek saraya yakışmaz.',
    go: { label: 'Oduncu kampı kur', act: build('lumberCamp') },
    joke: ['Ağaçlara kıyamam', 'Ağaçlar da size kıyar, lordum, kış gelince. Ormanda çok ağaç var, söz.'],
  },
  {
    id: 'noHouse',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'house') === 0,
    say: () => 'Sarayın birkaç hizmetlisi var ama halkın başını sokacak bir evi yok. Evler köylüye yer verir; yer olunca köylüler kendiliğinden gelir. İlk ev de bedava.',
    go: { label: 'Ev kuralım', act: build('house') },
    joke: ['Sarayda yer çok', 'Sarayda yer çok, ama halkı sarayın koridorlarında uyuturken gördüm; tacınızın üstüne horluyorlardı.'],
  },
  {
    id: 'noGood',
    when: ({ kingdom: k }) => hasTradePost(k) && k.trade.good === null && !k.trade.idle,
    say: () => 'Tüccarımız ticaret noktasında bekliyor, lordum, elinde boş bir çuval. Ne satacağını seçmezseniz hiçbir şey satmaz ve altın getirmez.',
    go: { label: 'Satılacak malı seç', act: tab('trade', 'trade', 'merchant') },
    joke: ['Havayı satsın', 'Hava satmayı denedi, lordum. Alıcı çıktı ama altınlar da havadandı.'],
  },
  {
    id: 'tradeIdle',
    when: ({ kingdom: k }) => hasTradePost(k) && !!k.trade.idle,
    say: () => 'Tüccar evde oturuyor, lordum; "hiçbir şey satma" demişsiniz. Adam o kadar boş ki kendi gölgesiyle pazarlığa girişti. Bir mal seçsek?',
    go: { label: 'Tüccara iş ver', act: tab('trade', 'trade', 'merchant') },
    joke: ['Dinlensin, hak etti', 'Hak etti tabii; ama hazine dinlenmeyi sevmez, lordum.'],
  },
  {
    id: 'tradeBroken',
    when: ({ kingdom: k }) => !!k.trade.damaged,
    say: () => `Ticaret noktamız hâlâ harap, lordum. Onarılana kadar tüccar satış yapamaz. Onarmak ${n(balance.economy.trade.repairCost.gold)} altın ve ${n(balance.economy.trade.repairCost.materials)} yapı malzemesi ister.`,
    go: { label: 'Onarmaya git', act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'storeFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && (['food', 'materials', 'arms'] as const).some((g) => k.stock[g] >= storageCap(k, now) * 0.97),
    say: ({ kingdom: k, now }) => {
      const full = (['food', 'materials', 'arms'] as const).filter((g) => k.stock[g] >= storageCap(k, now) * 0.97)
      const names = { food: 'yemek', materials: 'yapı malzemesi', arms: 'savaş malzemesi' }
      return `Ambarlar dolup taşıyor, lordum: ${full.map((g) => names[g]).join(', ')}. Sığmayan mal boşa gider. Ya tüccara sattırın, ya bir ambar kurun ya da bir şeyler inşa edip harcayın.`
    },
    go: { label: 'Depoya bak', act: tab('store', 'store', 'goods') },
    joke: ['Fareler de yesin', 'Fareler zaten yiyor, lordum; o kadar besili ki kışlaya asker diye yazılmak istediler.'],
  },
  {
    id: 'treasuryFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.gold >= goldCap(k, now) * 0.97,
    say: ({ kingdom: k, now }) => `Hazine ağzına kadar dolu, lordum: ${n(k.stock.gold)} / ${n(goldCap(k, now))} altın. Dolu hazinede tüccar mal götürmez, vergi boşa gider. Harcamanın tam zamanı: bir yükseltme, bir bina, belki bir hediye?`,
    go: { label: 'İnşa menüsü', act: tab('build') },
    joke: ['Altınlarımla yüzeceğim', 'Denedim, lordum. Altın suda yüzmez; ben de yüzemedim.'],
  },
  {
    id: 'clogged',
    when: ({ kingdom: k, now }) => hasPalace(k) && clogsOf(k, now).length > 0,
    say: ({ kingdom: k, now }) => `${clogsOf(k, now).length} yapımızın işi boşa gidiyor, lordum: ürettiklerine yer yok. Haritada üstlerinde sarı ünlemler sallanıyor; ben de sallanıyorum, endişeden.`,
    go: { label: 'Cephaneliğe bak', act: tab('store', 'store', 'armory') },
  },
  {
    id: 'palaceUp',
    when: ({ kingdom: k, now }) => {
      const p = palaceOf(k)
      return !!p && upgradeError(k, p.id, now) === null
    },
    say: ({ kingdom: k, now }) => `Lordum, sarayı ${palaceLevel(k, now) + 1}. seviyeye yükseltmeye gücümüz yetiyor! Hudut büyür, yeni yapılar açılır, nüfus sınırı artar. Bir de şatafat, unutmayalım.`,
    go: { label: 'Sarayı yükselt', act: open('palace') },
    joke: ['Saray bana büyük bile', 'Büyük mü? Geçen gün kraliçenin elbisesi kapıdan girmedi, lordum.'],
    snooze: 10,
  },
  {
    id: 'liege',
    when: ({ kingdom: k, now, crowns }) => crowns > 1 && k.liege === undefined && fealtyOpen(k, now),
    say: ({ online }) => `Henüz hiçbir taca biat etmediniz, lordum. ${online.crowns.join(' ile ')} iki taç; sarayı ${balance.cities.crown.requiredForPalaceLevel}. seviyeye yükseltmek için birine bağlı olmanız gerekiyor. Seçim sezon boyunca kalıcı; iyi düşünün, ama çok uzun değil.`,
    go: { label: 'Bağlılık bölümü', act: tab('kingdom', 'palace', 'level') },
    joke: ['Kendi tacımı yaparım', 'Kuyumcuya sordum, lordum. Taç yapar ama krallık yapmıyormuş.'],
  },
  {
    id: 'queen',
    when: ({ kingdom: k, now }) => !k.queen && !k.queenHeldBy && queenError(k, now) === null,
    say: () => `Saray çok sessiz, lordum. Bir kraliçe halkın mutluluğunu ${balance.society.happiness.queen} artırır, hanedanı sürdürür ve sarayın ${balance.dynasty.queenForPalaceLevel}. seviyesi için şarttır. Bedeli ${n(balance.society.queen.cost.gold)} altın; aşkın fiyatı biraz yüksek, kabul.`,
    go: { label: 'Kraliçe getir', act: tab('people', 'people', 'queen') },
    joke: ['Ben evlenmem', 'Babanız da öyle derdi, lordum. Sonra annenizi gördü ve kırk gün şiir yazdı.'],
  },
  {
    id: 'barracks',
    when: (c) => unlocked(c, 'barracks') && count(c.kingdom, 'barracks') === 0,
    say: () => 'Bir kışlamız yok, lordum. Komşular şimdilik gülümsüyor ama gülümseme kılıç değildir. Kışla mızrakçı, okçu ve daha fazlasını yetiştirir.',
    go: { label: 'Kışla kur', act: build('barracks') },
    joke: ['Dostluk yeter', 'Dostluk güzel, lordum; ama kapıyı çalan haydutlara dostluk şiiri okumayı denedim, olmadı.'],
  },
  {
    id: 'spyHouse',
    when: (c) => unlocked(c, 'spyHouse') && count(c.kingdom, 'spyHouse') === 0 && count(c.kingdom, 'barracks') > 0,
    say: () => 'Komşularımızın ne yaptığını hiç bilmiyoruz, lordum. Bir casus evi kurarsak hem onları gözetleriz hem de onların casuslarını yakalarız.',
    go: { label: 'Casus evi kur', act: build('spyHouse') },
    joke: ['Ben her şeyi duyarım', 'Duyduğunuz, lordum, mutfaktaki aşçının dedikoduları. Gerçek casuslar daha az konuşur.'],
  },
  {
    id: 'market',
    when: (c) => unlocked(c, 'market') && count(c.kingdom, 'market') === 0 && count(c.kingdom, 'barracks') + count(c.kingdom, 'spyHouse') > 0,
    say: () => 'Pazarımız yok, lordum. Pazar, eksik malı altınla satın almaya yarar; bir gün savaş malzemesi bitince bana teşekkür edersiniz.',
    go: { label: 'Pazar kur', act: build('market') },
  },
  {
    id: 'warehouse',
    when: (c) => unlocked(c, 'warehouse') && count(c.kingdom, 'warehouse') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: ({ kingdom: k, now }) => `Ambarlarımız yalnızca ${n(storageCap(k, now))} birim tutuyor, lordum. Bir ambar, her maldan çok daha fazlasını saklar; fareler de sevinir ama onları saymayalım.`,
    go: { label: 'Ambar kur', act: build('warehouse') },
  },
  {
    id: 'wall',
    when: (c) => unlocked(c, 'wall') && count(c.kingdom, 'wall') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: () => 'Lordum, sarayın çevresinde tek bir taş sur yok. Surlar kuşatmada savunmayı güçlendirir. Bir sur kapısı koymayı unutmayın; yoksa halkı içeri kilitler, kendinize hapishane yaparsınız.',
    go: { label: 'Sur çekelim', act: build('wall') },
    joke: ['Düşman kibar olur', 'Düşman çok kibardır, lordum; kapınızı kırmadan önce mutlaka "affedersiniz" der.'],
  },
  {
    id: 'housing',
    when: ({ kingdom: k, now }) => {
      if (!hasPalace(k)) return false
      const p = population(k, now)
      return p.room - p.people < 0.5 && p.room + p.soldiers + p.sailors < popCapFor(palaceLevel(k, now)) - 2 && count(k, 'house') > 0
    },
    say: () => 'Evlerin hepsi dolu, lordum; gelmek isteyen köylüler kapıda bekliyor. Bir ev daha kurarsak halk büyür, vergi artar.',
    go: { label: 'Ev kur', act: build('house') },
    joke: ['Çadır kursunlar', 'Çadır kurdular, lordum. Rüzgâr esti, şimdi komşu lordun tarlasındalar.'],
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
      return `${n(p.healthy - p.jobs)} köylü boş oturuyor, lordum; meydanda zar atıp bir de bana hile yaptılar. İşe koşalım: bir tarla, oduncu ya da atölye.`
    },
    go: { label: 'İnşa menüsü', act: tab('build') },
  },
  {
    id: 'tired',
    when: ({ kingdom: k }) => !!k.nightShift && (k.fatigue ?? 0) > balance.society.night.maxFatigue * 0.5,
    say: () => 'Gece mesaisi halkı yordu, lordum. Yorgunluk gündüz dahil bütün üretimi azaltıyor. Bir süre kapatsak, köylüler uyusa?',
    go: { label: 'Halk sekmesi', act: tab('people', 'people', 'mood') },
  },
  {
    id: 'unhappy',
    when: ({ kingdom: k }) => hasPalace(k) && (k.happiness ?? 100) < 35,
    say: ({ kingdom: k }) => `Halkın mutluluğu %${n(k.happiness ?? 0)}, lordum. Mutsuz halk yavaş büyür, kaçar ve askere yazılmaz. Vergiyi düşürmek, bir tapınak ya da kraliçe çare olabilir.`,
    go: { label: 'Mutluluğa bak', act: tab('people', 'people', 'mood') },
    joke: ['Gülmeyi yasaklayalım', 'Yasakladık, lordum; şimdi gizlice gülüyorlar. Daha da mutsuz oldular.'],
  },
  {
    id: 'sick',
    when: (c) => (c.kingdom.sickness ?? 0) > 0.15 && unlocked(c, 'hospital') && count(c.kingdom, 'hospital') === 0,
    say: ({ kingdom: k }) => `Halkın ${pct(k.sickness ?? 0)} hasta, lordum. Hasta köylü çalışmaz, vergi vermez. Bir hastane kurarsak doktorlar onları iyileştirir.`,
    go: { label: 'Hastane kur', act: build('hospital') },
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
      return taken ? `Tacımızın görevini bitirdik, lordum! ${n(q.gold)} altınlık ödül bizi bekliyor; taç unutkan değildir ama hazinedar biraz öyledir.` : `${c.online.crowns[c.kingdom.liege!] ?? 'Tacımız'} bu saat sizden bir iş istiyor; ödülü ${n(q.gold)} altın ve tacın gönlü. Görevi alalım mı?`
    },
    go: { label: 'Taç görevleri', act: tab('diplomacy', 'diplomacy', 'crowns') },
    snooze: 30,
  },
  {
    id: 'town',
    when: ({ kingdom: k, online }) => (k.soldiers ?? 0) >= 10 && (k.towns?.length ?? 0) === 0 && online.towns.some((t) => t.owner === null),
    say: () => 'Lordum, haritada kimseye bağlı olmayan kasabalar var ve garnizonumuzda askerler esniyor. Bir ordu çıkarıp bir kasabayı kuşatırsak her turda bize katkı gönderir. Kasaba paneli "Kuşat" bölümünden başlar.',
    go: { label: 'Ordu sekmesi', act: tab('army', 'army', 'land') },
    joke: ['Kasabalar kendiliğinden gelir', 'Geldiler, lordum; ama vergi memurumuzu görünce geri döndüler.'],
  },
  {
    id: 'game',
    when: ({ kingdom: k, now }) => ARCADE_GAMES.some((g) => gameError(k, g, now) === null) || (count(k, 'fisherHut') > 0 && fishError(k, now) === null),
    say: () => 'Lordum, bir mini oyun oynanmayı bekliyor: okçuluk, örs başında, kervan yolu ya da balıkçı kulübesinin oltası. Küçük ödüller verir; ben de seyrederken sizi alkışlarım.',
    go: { label: 'Saraya bak', act: tab('kingdom', 'palace', 'buildings') },
    snooze: 40,
  },
]

// When there is nothing to advise.
export const IDLE_LINES = [
  'Her şey yolunda görünüyor, lordum. Bu bende kuşku uyandırıyor; kırk yıllık elçilik alışkanlığı.',
  'Bugün sizi rahatsız edecek bir şey bulamadım. İsterseniz oyunun bir köşesini anlatayım?',
  'Ülkede huzur var, lordum. Ben de biraz şarap... yani su içeyim.',
  'Komşular sessiz. Sessiz komşu, ya uyuyordur ya da plan yapıyordur. Ben ikinci şıktan korkarım.',
]

// Answers to "How are you?" and the like, for the idle chat.
export const SMALL_TALK: Reply[] = [
  { label: 'Nasılsın, elçi efendi?', answer: 'Dizlerim yağmuru haber veriyor, dilim savaşları. Yani her zamanki gibi, lordum.' },
  { label: 'Bir fıkra anlat', answer: 'Bir lord sarayına sur çekmiş, kapı koymayı unutmuş. Halk bir hafta içeride kalmış. Lord "Ne güzel, kimse şikâyet etmiyor" demiş. Kimse dışarı çıkıp şikâyet edemiyormuş da ondan.' },
  { label: 'Sence iyi bir lord muyum?', answer: 'Sizden iyisini görmedim, lordum. Gerçi ben pek dışarı çıkmam.' },
]

// ---- The tutorial ----------------------------------------------------------------------------------------------------

export const STEPS: Step[] = [
  {
    id: 'palace',
    title: 'Sarayını yerleştir',
    say: () => 'Hoş geldiniz, lordum! Ben elçinizim; haberleri getirir, öğüt veririm ve fazla konuşurum. İlk iş: sarayı hududun içinde istediğiniz yere yerleştirin. Bedava ve anında; böyle fırsat bir daha çıkmaz.',
    done: ({ kingdom: k }) => hasPalace(k),
    cheer: 'Ne heybetli bir saray! Ben de bir oda kaptım, kuzey kulesinde. Rüzgâr alıyor ama manzarası güzel.',
  },
  {
    id: 'lumber',
    title: 'Oduncu kampı kur',
    say: () => 'Her yapı yapı malzemesi ister, onu da oduncu kampı üretir. İnşa sekmesinden oduncu kampını seçip haritaya yerleştirin. İnşa ettikleriniz önce bir plana eklenir: alttaki çubukta "Onayla" demeyi unutmayın. İlk oduncu kampı bedava.',
    done: ({ kingdom: k }) => count(k, 'lumberCamp') > 0,
    go: { label: 'Oduncu kampı seç', act: build('lumberCamp') },
    hint: 'build',
    cheer: 'Baltalar parlıyor! Ormandaki sincaplar sizi şikâyet etmeye geldi ama ben savdım.',
  },
  {
    id: 'house',
    title: 'Bir ev kur',
    say: () => 'Şimdi halka bir ev. Evler köylüye yer verir; yer olunca köylüler zamanla gelir, gelen köylü çalışır ve vergi verir. Ev sırasını basılı tutup sürükleyerek de dizebilirsiniz.',
    done: ({ kingdom: k }) => count(k, 'house') > 0,
    go: { label: 'Ev seç', act: build('house') },
    hint: 'build',
    cheer: 'Ev hazır! Bacasından duman tüttüğünü görür görmez komşuların kıskançlıktan sarardığını gördüm.',
  },
  {
    id: 'farm',
    title: 'Bir tarla kur',
    say: () => `Halk yemek yer: her köylü her turda ${balance.economy.foodPerVillager} yemek. Tarla buğday ekerse yemek üretir (keten ekerse yapı malzemesi). Bir tarla kuralım; açlık iyi bir öğretmen değildir.`,
    done: ({ kingdom: k }) => count(k, 'farm') > 0,
    go: { label: 'Tarla seç', act: build('farm') },
    hint: 'build',
    cheer: 'Buğdaylar şimdiden boy atıyor! Ben de bir somun ayırttım, ileride.',
  },
  {
    id: 'trade',
    title: 'Tüccara mal seç',
    say: () => `Ticaret noktası sizin; tüccar her ${balance.economy.trade.tripSeconds} saniyelik seferde seçtiğiniz maldan götürüp satar ve altın getirir. Ticaret sekmesinden satılacak malı seçin. Fazla olanı satın; açlığı değil.`,
    done: ({ kingdom: k }) => k.trade.good !== null || !!k.trade.idle,
    go: { label: 'Ticaret sekmesi', act: tab('trade', 'trade', 'merchant') },
    hint: 'trade',
    cheer: 'Tüccar devesine bindi bile! Deve biraz huysuz ama yolu biliyor.',
  },
  {
    id: 'grow',
    title: 'Altı yapıya ulaş',
    say: ({ kingdom: k, now }) => `Lordluğunuz büyüdükçe taç krallıkları sizi fark eder. ${balance.cities.crown.intro.buildings} yapıya ulaşalım (surlar sayılmaz): bir tarla, bir oduncu, bir ev daha... Şu an ${k.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.doneAt <= now).length} bitmiş yapınız var.`,
    done: ({ kingdom: k, now }) => fealtyOpen(k, now) || k.liege !== undefined,
    go: { label: 'İnşa menüsü', act: tab('build') },
    hint: 'build',
    cheer: 'İşte bu! Artık taçlar da sizi konuşuyor; benim kadar olmasa da.',
  },
  {
    id: 'fealty',
    title: 'Bir taca biat et',
    say: ({ online }) => `Haritada iki taç krallığı var: ${online.crowns.join(' ve ')}. Oyuncular krallık değil lorddur; birine biat edersiniz. Sarayın ${balance.cities.crown.requiredForPalaceLevel}. seviyesi için şart, ve seçim sezon boyunca kalıcıdır. Kendi tacınızın devriyesi eğlence merkezinize bahşiş bırakır; rakip taç ise haraççı gönderir.`,
    done: ({ kingdom: k, crowns }) => k.liege !== undefined || crowns < 2,
    go: { label: 'Bağlılık bölümü', act: tab('kingdom', 'palace', 'level') },
    hint: 'kingdom',
    cheer: 'Biat ettiniz! Tacın sancağı adınızın yanında dalgalanıyor. Ben de yeni bir şapka tüyü aldım, uyumlu olsun diye.',
  },
  {
    id: 'palace2',
    title: 'Sarayı 2. seviyeye yükselt',
    say: () => 'Sarayı yükseltmek hududu büyütür, nüfus sınırını artırır ve yeni yapılar açar: kışla, casus evi, pazar, sur, kraliçe... Sarayınıza tıklayıp "Yükselt" deyin. Malzeme yetmezse önce biraz üretin.',
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 2,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheer: 'Saray büyüdü, hudut genişledi! Ben de mutfakta biraz genişledim ama o başka konu.',
  },
  {
    id: 'barracks',
    title: 'Bir kışla kur',
    say: () => 'Barış güzeldir ama haydutlar da güzel bulur. Kışla, asker havuzundan birlik yetiştirir: mızrakçı süvariyi, okçu mızrakçıyı, süvari okçuyu yener. Bir kışla kuralım.',
    done: ({ kingdom: k }) => count(k, 'barracks') > 0,
    go: { label: 'Kışla seç', act: build('barracks') },
    hint: 'build',
    cheer: 'Kışla hazır! Borazancı ilk sabah beni de uyandırdı; saygımı kazandı.',
  },
  {
    id: 'queen',
    title: 'Bir kraliçe getir',
    say: () => `Sarayın ${balance.dynasty.queenForPalaceLevel}. seviyesi için kraliçe gerekir; ayrıca halkın mutluluğunu artırır ve hanedanınız çocuklarla büyür. Halk sekmesinin Kraliçe bölümünden getirebilirsiniz (${n(balance.society.queen.cost.gold)} altın, en az ${balance.society.queen.minPopulation} nüfus).`,
    done: ({ kingdom: k }) => !!k.queen || !!k.queenHeldBy,
    go: { label: 'Kraliçe bölümü', act: tab('people', 'people', 'queen') },
    hint: 'people',
    cheer: 'Kraliçe saraya geldi! Bana bir bakışta "bu adam çok konuşur" dedi. Haklı, ama kırıldım.',
  },
  {
    id: 'spy',
    title: 'Bir casus evi kur',
    say: () => 'Bilgi altından değerlidir, lordum; en azından daha hafiftir. Casus evi casus yetiştirir: başka lordların malını, ordusunu, elçilerini öğrenirsiniz; evde tutulan casuslar da size gelen casusları yakalar.',
    done: ({ kingdom: k }) => count(k, 'spyHouse') > 0,
    go: { label: 'Casus evi seç', act: build('spyHouse') },
    hint: 'build',
    cheer: 'Casus evi kuruldu. Kimseye söylemeyin. Ben de söylemedim, sadece size.',
  },
  {
    id: 'palace3',
    title: 'Sarayı 3. seviyeye yükselt',
    say: () => '3. seviye saray üniversiteyi, hastaneyi, tapınağı ve esrarengiz balıkçı kulübesini açar. Pahalıdır; ama tarih ucuz saraylardan söz etmez.',
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 3,
    go: { label: 'Saraya git', act: open('palace') },
    hint: 'kingdom',
    cheer: 'Üç kat saray! Merdivenleri çıkarken dizlerim ağlıyor, ama gururdan.',
  },
]

export const TUTORIAL_DONE = 'Öğreteceklerim bu kadar, lordum; gerisini zaman ve komşularınız öğretecek. Yine de bana "Bana oyunu anlat" diye sorarsanız her köşesini anlatırım.'

// ---- Topics he explains on request -----------------------------------------------------------------------------------

export const TOPICS: Topic[] = [
  {
    id: 'time',
    name: 'Zaman',
    icon: 'time',
    text: () => [
      `Bir oyun günü bir gerçek saattir; sezon ${balance.time.seasonGameDays} oyun günü, yani iki hafta sürer, sonra dünya sıfırlanır.`,
      'Takvimde her gerçek saat bir yıldır: saatin başı gece yarısı ve 1 Ocak. Aylar beşer dakikada geçer, mevsimler yaklaşık çeyrek saat sürer. Kışın tarla ve iskele az, yazın çok yemek verir; hastalık kışın hızlı yayılır. Hanedan da bu yılla yaşlanır.',
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
