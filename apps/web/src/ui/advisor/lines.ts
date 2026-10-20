import {
  ARCADE_GAMES, BUILDINGS, allShips, balance, countShips, buildingCount, clogsOf, fealtyOpen, fishError, gameError, goldCap, hasPalace,
  hasTradePost, palaceLevel, popCapFor, population, queenError, questProgress, storageCap, upgradeError,
  campSoldiers, PROJECT_IDS, projectError, hasOpinion, ofAge, opinionOf, siblingsOf, crownHouseAt, crownWays, liegeSwitchError,
  bandRaid, bandsOf, outlawUp, havensOf, havenPop, havenStrength, navyOf, warships, shipyardLevel, expeditionsOut, maxExpeditions, clansOf, trailOf,
} from '@game/shared'
import type { BuildingKind, Kingdom, World } from '@game/shared'
import type { IconName } from '../icons'
import type { TabId } from '../hud/Hud'
import type { Online } from '../hud/online'
import { innReach, innUnitPrice, tradeInnIndex } from '../hud/inns'
import { innInfo } from '../../game/innInfo'
import { isCaravanserai } from '../../game/innSprites'
import { innStats, tradePrice } from '@game/shared'

// What the envoy says (CLAUDE.md §9.8): his advice, picked from what the lord lacks or could do better; the steps of
import { L, locale } from '../../lib/i18n'
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
  // The map (for the bandits on their roads and the pirates' havens).
  world: World
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
  { id: 'basics', name: L('Lordluğun temelleri', 'Lordship basics') },
  { id: 'war', name: L('Ordu ve savaş', 'Army and war') },
  { id: 'court', name: L('Taçlar, saray ve entrika', 'Crowns, court and intrigue') },
  { id: 'wilds', name: L('Yolların ve suların belası', 'Scourges of road and water') },
  { id: 'pursuits', name: L('Uğraşlar ve şan', 'Pursuits and glory') },
]

// How often he comes on his own while the lord plays (minutes of play), and how long "later" lasts.
export const ADVISOR_EVERY_MINUTES = 3
export const SNOOZE_MINUTES = 15
// A tip he has brought up on his own rests this long even if it is only closed, so the next visit brings another.
export const SHOWN_MINUTES = 9

const n = (v: number) => Math.round(v).toLocaleString(locale())
const pct = (v: number) => L(`%${Math.round(v * 100)}`, `${Math.round(v * 100)}%`)
const min = (seconds: number) => Math.max(1, Math.round(seconds / 60))
const count = (k: Kingdom, kind: BuildingKind) => buildingCount(k, kind)
const unlocked = (c: AdvisorCtx, kind: BuildingKind) => (BUILDINGS[kind].requiresPalace ?? 0) <= palaceLevel(c.kingdom, c.now)
const palaceOf = (k: Kingdom) => k.buildings.find((b) => b.kind === 'palace')
const tab = (t: TabId, key?: string, part?: string): AdvisorAction => ({ kind: 'tab', tab: t, ...(key && part ? { part: { key, part } } : {}) })

// The inn that would pay the merchant best for what he sells, if it beats where he sells now by a fair margin
// (CLAUDE.md §7.6); null when there is none or he cannot go to the inns yet.
function betterInn({ kingdom: k, online, world, now }: AdvisorCtx) {
  const good = k.trade.good
  if (!good || k.trade.idle || k.trade.city || k.trade.level < balance.economy.trade.inns.minLevel) return null
  const here = tradePrice(k, good, online.market, now)
  const at = tradeInnIndex(world, k)
  let best: { index: number; unit: number; name: string } | null = null
  world.inns.forEach((inn, index) => {
    if (index === at) return
    const share = innReach(world, index, online).find((p) => p.k.id === online.me)?.share ?? 0
    if (share < balance.economy.trade.inns.minShare) return
    const unit = innUnitPrice(world, index, k, share, good, online.market, now)
    if (unit >= here * 1.15 && (!best || unit > best.unit)) best = { index, unit, name: innInfo(world, index, isCaravanserai(world, inn)).name }
  })
  return best as { index: number; unit: number; name: string } | null
}

// A rich inn the lord has no slice of, near enough that a town by it would win him one.
function richInnOutOfReach({ kingdom: k, online, world }: AdvisorCtx) {
  if (!hasTradePost(k) || k.trade.level < balance.economy.trade.inns.minLevel) return null
  const spec = balance.economy.trade.inns
  for (const [index, inn] of world.inns.entries()) {
    const stats = innStats(world.seed, inn)
    const rich = (stats.food + stats.materials + stats.arms) / 3
    if (rich < 1.15) continue
    const share = innReach(world, index, online).find((p) => p.k.id === online.me)?.share ?? 0
    if (share >= spec.minShare) continue
    const d = Math.hypot(inn.x + 1 - k.site.x, inn.y + 1 - k.site.y)
    if (d > spec.reachTiles * 2) continue
    const town = online.towns.find((t) => t.owner !== online.me && Math.hypot(t.x + 4 - inn.x - 1, t.y + 4 - inn.y - 1) < spec.reachTiles * 0.6)
    if (town) return { name: innInfo(world, index, isCaravanserai(world, inn)).name, town: town.name }
  }
  return null
}
const build = (building: BuildingKind): AdvisorAction => ({ kind: 'build', building })
const open = (building: BuildingKind): AdvisorAction => ({ kind: 'open', building })

// "Later": he takes it in good part, one way or another.
export const LATER = [L('Sonra, elçi efendi', 'Later, master envoy'), L('Şimdi olmaz', 'Not now'), L('Bir düşüneyim', 'Let me think on it'), L('Hele bir dur', 'Hold your horses'), L('Aklımda, merak etme', "It's on my mind, don't fret"), L('Yarın, belki', 'Tomorrow, perhaps'), L('Git biraz otur', 'Go and sit down a while')]
export const LATER_ANSWERS = [
  L(`Peki lordum. Not ettim: "sonra". Kırk yıllık elçiliğimde en çok duyduğum kelime; en sevdiğim de. Mesai bitti demek.`, `Very well, my lord. Noted: "later". In forty years of service it is the word I have heard most, and the one I love best. It means my shift is over.`),
  L(`Elbette. Ben de bu arada şu parşömeni okuyormuş gibi yaparım. Ters tutuyorum ama kimse fark etmez.`, `Of course. Meanwhile I shall pretend to read this parchment. I am holding it upside down, but nobody ever notices.`),
  L(`Nasıl isterseniz. Tarih, ertelenen kararlarla doludur, lordum; tarihçiler de onlarla geçinir. Ben yalnızca söylüyorum.`, `As you wish. History is full of decisions put off, my lord; historians make a living from them. I merely mention it.`),
  L(`Anlaşıldı. Unuttuğunuzda tekrar hatırlatırım; unutmadığınızda da hatırlatırım, işim bu.`, `Understood. When you forget, I shall remind you; when you don't forget, I shall remind you anyway. It is my job.`),
  L(`Bekleriz, lordum. Bekleme sanatında ustayım: bir keresinde bir taç elçisinin kapısında üç gün bekledim. Dördüncü gün kapının boyalı bir duvar olduğunu fark ettim.`, `We shall wait, my lord. I am a master of waiting: once I waited three days at a crown envoy's door. On the fourth day I noticed the door was a painted wall.`),
  L(`Peki lordum; ben de bu sırada ayna karşısında bir sonraki öğüdümü prova ederim. Ayna bayağı ikna oldu.`, `Very well, my lord; meanwhile I shall rehearse my next piece of advice before the mirror. The mirror is quite convinced.`),
  L(`Not ettim, lordum, hem de kırmızı mürekkeple. Kırmızı mürekkep "yine geleceğim" demektir. Siyah mürekkep de öyle demektir, aslında.`, `Noted, my lord, and in red ink. Red ink means "I shall be back". So does black ink, as it happens.`),
  L(`Peki lordum. Kumsaati çevirdim; dolunca kapınızı yine çalarım. Kumsaati yavaş akıyorsa bana değil, kuma kızın.`, `Very well, my lord. I have turned the hourglass; when it runs out I shall knock again. If it runs slow, blame the sand, not me.`),
  L(`Anlaşıldı, lordum. Bir elçinin en iyi bildiği iş beklemektir, ikincisi beklerken konuşmak. Şimdilik birinciyi yapıyorum; zor, ama yapıyorum.`, `Understood, my lord. What an envoy does best is wait; second best is talking while he waits. For now I am doing the first. It is hard, but I am doing it.`),
  L(`Siz bilirsiniz, lordum. Ben bu arada aşçıya uğrayayım; bekleyen elçinin karnı çabuk acıkır, karnı tok elçi de daha az konuşur. Herkes kazanır.`, `As you say, my lord. Meanwhile I shall drop in on the cook; a waiting envoy grows hungry, and a well-fed envoy talks less. Everyone wins.`),
  L(`Peki lordum, sonra. Bu konuyu yastığımın altına koydum; sabaha kadar onunla uyuyacağım, sonra yine getiririm.`, `Very well, my lord, later. I have put the matter under my pillow; I shall sleep on it till morning and bring it back.`),
  L(`Hay hay, lordum. Dizlerim zaten bir mola istiyordu; size teşekkür ederler.`, `Gladly, my lord. My knees were begging for a rest anyway; they thank you.`),
]

const GOOD_NAMES = { food: L('yemek', 'food'), materials: L('yapı malzemesi', 'building materials'), arms: L('savaş malzemesi', 'war materials') } as const

// The things he can tell the lord to do, the most pressing first.
export const TIPS: Tip[] = [
  {
    id: 'foodLow',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.food < Math.max(20, storageCap(k, now) * 0.06) && population(k, now).villagers > 4,
    say: ({ kingdom: k }) => {
      const f = n(k.stock.food)
      return [
        L(`Lordum, size iki haberim var: biri kötü, öbürü daha kötü. Kötüsü, ambarda yalnızca ${f} yemek kaldı. Daha kötüsü, bunu halk da biliyor. Açlık mutluluğu düşürür, köylüler de göç eder. Bir tarla daha, belki bir iskele?`, `My lord, I have two pieces of news: one bad, the other worse. The bad: only ${f} food is left in the storehouse. The worse: the people know it. Hunger lowers happiness, and villagers move away. Another farm, perhaps a dock?`),
        L(`Ambarcı az önce yanıma geldi, lordum, yüzü un çuvalı gibi bembeyaz; çuvalın kendisi ise bomboş: ${f} yemek kalmış. Açlık mutluluğu düşürür, köylüler bohçasını toplar. Bir tarla ya da iskele bu işi çözer.`, `The storekeeper just came to me, my lord, his face as white as a flour sack; the sack itself, alas, is empty: ${f} food left. Hunger lowers happiness, and villagers pack their bundles. A farm or a dock would settle it.`),
        L(`Lordum, kilerde ${f} yemek var; ben bunu bir kahvaltıda bitiririm, halk ne yapsın? Gerçi kahvaltıyı ben yaptım, oradan biliyorum. Aç halk mutsuz olur ve göç eder; bir tarla ya da iskele kuralım.`, `My lord, there is ${f} food in the larder; I could finish that at one breakfast, so what are the people to do? Admittedly I did have breakfast, which is how I know. Hungry people grow unhappy and leave; let us build a farm or a dock.`),
        L(`Saray aşçısı kepçeyi bıraktı, lordum, yerine bir dua kitabı aldı: ambarda ${f} yemek kalmış. Yemek bitince halkın keyfi kaçar, köylüler başka diyarlara göçer. Bir tarla daha ekelim, bir iskeleden de balık gelsin.`, `The palace cook has put down his ladle, my lord, and picked up a prayer book: only ${f} food left in the storehouse. When food runs out, the people sulk and villagers move to other lands. Let us sow another farm and have fish from a dock.`),
        L(`Size bir sır vereyim, lordum: aç köylünün aklı vergide değil, göçtedir. Ambarda yalnızca ${f} yemek var. Ambar fareleri bile toplanıp başka lordluğa taşınmayı konuşuyor. Buğday tarlası mı olsun, balık iskelesi mi?`, `Let me tell you a secret, my lord: a hungry villager thinks not of taxes but of leaving. There is only ${f} food in the storehouse. Even the storehouse rats are holding meetings about moving to another lordship. A wheat farm, or a fishing dock?`),
        L(`Lordum, haberler var. Çoğu kötü. Ambarda ${f} yemek kaldı ve köylüler bana "elçi efendi ne kadar da tombul" diye aç gözlerle bakmaya başladı. Açlık mutluluğu düşürür, halkı göç ettirir; ben de tedirginim. Bir tarla ya da iskele, lütfen.`, `My lord, there is news. Most of it bad. Only ${f} food is left, and the villagers have begun eyeing me hungrily, saying "isn't master envoy plump". Hunger lowers happiness and drives the people away; I am also nervous. A farm or a dock, please.`),
      ]
    },
    go: { label: L('Tarla kuralım', "Let's build a farm"), act: build('farm') },
    jokes: [
      [L('Halk biraz perhiz yapsın', 'Let the people diet a little'), L('Perhiz mi? Geçen sefer bir lord bunu dedi; şimdi heykeli meydanda, ama başı yok. Başını halk yemedi, merak etmeyin; satıp ekmek aldılar.', "A diet? The last lord who said that has a statue in the square now, minus the head. The people didn't eat the head, rest assured; they sold it and bought bread.")],
      [L('Pasta yesinler', 'Let them eat cake'), L('Pasta da undan yapılır, lordum. Un da tarladan gelir. Gördünüz mü, dolanıp yine tarlaya çıktık; bütün yollar tarlaya çıkar.', 'Cake is made from flour, my lord. And flour comes from a farm. You see, we have come round to the farm again; all roads lead to the farm.')],
      [L('Ben pek aç değilim', "I'm not very hungry"), L('Siz sarayın mutfağından besleniyorsunuz, lordum; halkın mutfağında yalnızca örümcekler var, onlar da zayıfladı. Biri dün bana ağ yerine dilekçe ördü.', "You dine from the palace kitchen, my lord; the people's kitchen holds only spiders, and even they have grown thin. Yesterday one wove me a petition instead of a web.")],
      [L('Oruç tutsunlar, sevaptır', 'Let them fast, it is virtuous'), L('Sevap güzel, lordum; ama göç eden köylü sevabını da yanında götürür. Bize yalnızca boş ev kalır.', 'Virtue is lovely, my lord; but a departing villager takes his virtue with him. We are left with an empty house.')],
      [L('Balıklar kendiliğinden gelir', 'The fish will come by themselves'), L('Gelirler, lordum, ama iskele olursa. Balıklar kapı çalmayı henüz öğrenmedi; öğrense de bizim kapımızı çalmaz, ünümüz kötü.', "They will, my lord, if there is a dock. Fish have not yet learned to knock; and if they did, they wouldn't knock on ours, our reputation is poor.")],
      [L('Elçiyi pişirelim', "Let's cook the envoy"), L('Ben sertim, lordum, kırk yıllık sinirim var; kimseyi doyurmam. Ancak lafla doyururum, o da halka yetmiyor.', 'I am tough, my lord, forty years of gristle; I would feed nobody. I can only feed people with words, and the people find that insufficient.')],
    ],
    snooze: 10,
  },
  {
    id: 'noFarm',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'farm') === 0 && count(k, 'lumberCamp') > 0,
    say: () => [
      L(`Tek bir tarlamız bile yok, lordum. Köylüler her üretim turunda yemek yer; ekmeksiz halk, kraliyet marşını bile söylemez. Söylerse de nakaratı "aç"tır.`, `We haven't a single farm, my lord. Villagers eat every production round; people without bread won't even sing the royal anthem. And if they do, the chorus is "hungry".`),
      L(`Lordum, bütün hududu dolaştım, dizlerimi feda ettim, tek bir başak göremedim. Köylüler her üretim turunda yemek yer; tarlasız lordluk, kilerini bir sabah boş bulur.`, `My lord, I walked the whole border, sacrificed my knees, and saw not a single ear of wheat. Villagers eat every production round; a lordship without farms finds its larder empty one morning.`),
      L(`Hiç tarlamız yok, lordum. Halk her turda yemek yiyor, ambar ise sihirli değil; kendiliğinden dolmaz. Denedim, önüne mum yaktım, olmadı. Bir buğday tarlası kuralım.`, `We have no farms, my lord. The people eat every round, and the storehouse is not magic; it does not fill itself. I tried lighting candles before it; nothing. Let us build a wheat farm.`),
      L(`Lordum, ekmeği fırından, fırını undan, unu tarladan biliriz; bizde tarla yok. Fırıncı şimdiden boş fırının önünde nostalji yapıyor. Köylüler her turda yemek yer; bir tarla şart.`, `My lord, bread comes from the oven, the oven from flour, flour from the farm; and we have no farm. The baker already stands before his empty oven, reminiscing. Villagers eat every round; a farm is a must.`),
      L(`Saray şairi "altın başaklar" diye bir şiir yazdı, lordum; ama hiç başak görmediği için papatya anlatmış. Tarlamız yok, halk ise her turda yemek yer. Şiir doyurmaz, ben denedim.`, `The court poet wrote a poem called "Golden Ears of Wheat", my lord; having never seen one, he described daisies. We have no farm, and the people eat every round. Poetry does not fill bellies; I have tried.`),
    ],
    go: { label: L('Hemen hallederim', "I'll see to it at once"), act: build('farm') },
    jokes: [
      [L('Taş çorbası yaparız', "We'll make stone soup"), L('Taş çorbası mı? Aşçı denedi, lordum; çorba olmadı ama iki diş kırıldı. İkisi de benimdi. Önce tarla.', 'Stone soup? The cook tried it, my lord; no soup, but two broken teeth. Both mine. Farm first.')],
      [L('Ağaç kabuğu yerler', "They'll eat tree bark"), L('Oduncular buna itiraz eder, lordum; o kabuklar yapı malzemesi olacak. Zaten tadı berbat; sormayın nereden biliyorum.', "The woodcutters would object, my lord; that bark is to be building materials. And it tastes dreadful; don't ask how I know.")],
      [L('Avlanırlar', "They'll hunt"), L('Ormandaki geyikler bu sözü duydu, lordum; hepsi komşu lordluğa taşındı. Giderken bize el salladılar, toynakla.', 'The deer in the forest heard you, my lord; they have all moved to the neighbouring lordship. They waved as they left, with a hoof.')],
      [L('Ben tarla sevmem', "I don't like farms"), L('Tarla da sizi sevmez, lordum, ama doyurur. Evlilik gibi; sevgi her zaman şart değil.', "The farm doesn't like you either, my lord, but it feeds you. Like marriage; love isn't always required.")],
    ],
  },
  {
    id: 'noLumber',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'lumberCamp') === 0,
    say: () => [
      L(`Lordum, her yapı yapı malzemesi ister ve onu oduncu kampı üretir. İlk oduncu kampı bedavadır; bedava olan şeyi geri çevirmek saraya yakışmaz. Bana sorarsanız bedava olan hiçbir şeyi geri çevirmeyin; ben çevirmem.`, `My lord, every building needs building materials, and a lumber camp makes them. The first lumber camp is free; refusing something free is unbecoming of a court. If you ask me, never refuse anything free; I never do.`),
      L(`Lordum, ustalar elleri boş bekliyor; biri sıkıntıdan benim bastonuma oyma yapmaya başladı. Yapı malzemesi olmadan tek bir duvar örülmez. Onu oduncu kampı üretir; ilki bedavadır.`, `My lord, the builders stand idle; one of them, out of boredom, has started carving my walking stick. Without building materials not a single wall goes up. A lumber camp makes them; the first is free.`),
      L(`Ormanda ağaçlar bizi bekliyor, lordum, baltalar da depoda paslanıyor. Ağaçların bu kadar rahat olması beni sinirlendiriyor. Her yapı yapı malzemesi ister; bir oduncu kampı kuralım.`, `The trees in the forest await us, my lord, and the axes rust in the store. Frankly, the trees' complacency irritates me. Every building needs building materials; let us build a lumber camp.`),
      L(`Size kırk yıllık tecrübemi söyleyeyim, lordum: kereste olmadan ne saray olur ne ev. Ne de elçi kürsüsü. Oduncu kampı yapı malzemesi üretir ve ilki hiçbir şeye mal olmaz.`, `Let me share forty years of experience, my lord: without timber there is neither palace nor house. Nor envoy's lectern. A lumber camp makes building materials, and the first costs nothing.`),
      L(`Lordum, marangozlar kendi tezgâhlarını yakıp ısınmaya başladı; yarın sıra sandalyelere, öbür gün benim kürsüme gelir. Yapı malzemesi lazım; o da oduncu kampından gelir. İlki bedava.`, `My lord, the carpenters have started burning their own workbenches for warmth; tomorrow the chairs, the day after my lectern. We need building materials, and they come from a lumber camp. The first is free.`),
    ],
    go: { label: L('Oduncu kampı kur', 'Build a lumber camp'), act: build('lumberCamp') },
    jokes: [
      [L('Ağaçlara kıyamam', "I can't bear to cut the trees"), L('Ağaçlar da size kıyar, lordum, kış gelince. Ormanda çok ağaç var, söz; saydım. Yüze kadar saydım, sonra uyuyakaldım.', "The trees will bear down on you, my lord, come winter. There are plenty of trees, I promise; I counted. I counted to a hundred, then fell asleep.")],
      [L('Tahtımı sökeriz', "We'll dismantle my throne"), L('Tahtınızı mı, lordum? Üstünde oturduğunuz son tahta o. Sökersek siz de benim gibi ayakta hükmedersiniz; tavsiye etmem.', "Your throne, my lord? It is the last plank you sit on. Take it apart and you'll rule standing, like me; I don't recommend it.")],
      [L('Komşudan ödünç alırız', "We'll borrow from the neighbour"), L('Komşu lord ödünç vermez, lordum; geçen sefer bir kova istedim, karşılığında bir hakaret elçisi geldi. Kovayı da geri istedi, hiç vermediği hâlde.', "The neighbouring lord doesn't lend, my lord; last time I asked for a bucket, he sent an envoy bearing insults. He also asked for the bucket back, though he never gave it.")],
      [L('Orman bir yere kaçmaz', "The forest isn't going anywhere"), L('Orman kaçmaz, lordum; ama ustalarımız kaçabilir. Geçen hafta biri kaçtı, ağaçların arasına saklandı; bulamadık. Bir kamp yeter.', "The forest won't run off, my lord, but our builders might. One ran last week and hid among the trees; we never found him. One camp will do.")],
    ],
  },
  {
    id: 'noHouse',
    when: ({ kingdom: k }) => hasPalace(k) && count(k, 'house') === 0,
    say: () => [
      L(`Sarayın birkaç hizmetlisi var ama halkın başını sokacak bir evi yok. Evler köylüye yer verir; yer olunca köylüler kendiliğinden gelir. İlk ev de bedava; bedavaya ben bile gelirdim.`, `The palace has a few servants, but the people haven't a roof over their heads. Houses give villagers room; where there is room, villagers come of their own accord. The first house is free, too; for free, even I would move in.`),
      L(`Lordum, köylüler yolda; ama başlarını sokacak bir ev bulamazlarsa gelmezler. Köylü dediğin çatısız yere yerleşmez, elçi değil ki. Evler köylüye yer verir, yer olunca halk kendiliğinden gelir.`, `My lord, villagers are on the road, but if they find no house they won't come. A villager won't settle without a roof; he isn't an envoy. Houses give villagers room, and where there is room the people come of their own accord.`),
      L(`Saray hizmetlileri bile yatacak yer arıyor, lordum; biri dün gece benim dolabımda uyudu. Bir ev kurarsak köylüler gelir, çalışır ve vergi öder. Hem ilk ev bedava; ben olsam kaçırmazdım.`, `Even the palace servants are looking for a bed, my lord; one slept in my wardrobe last night. Build a house and villagers will come, work and pay taxes. And the first house is free; I wouldn't pass that up.`),
      L(`Halk dediğiniz, lordum, bir çatı altında çoğalır; nasıl çoğaldığını anlatmayayım, saray adabına aykırı. Evler köylüye yer açar, köylüler o yere zamanla gelir. Bir ev kuralım.`, `The people, my lord, multiply under a roof; how exactly, I shan't say, it would breach court etiquette. Houses make room for villagers, and villagers fill it in time. Let us build a house.`),
      L(`Haritaya baktım, lordum: saray var, halk yok. Çünkü ev yok. Bir lordluk düşünün ki tek tebaası ben ve iki hizmetçi; vergiyi kimden alacağız? Ev olunca köylüler gelir, çalışır ve vergi verir.`, `I looked at the map, my lord: a palace, but no people. Because there are no houses. Picture a lordship whose only subjects are me and two servants; whom shall we tax? With houses, villagers come, work and pay taxes.`),
    ],
    go: { label: L('Ev kuralım', "Let's build a house"), act: build('house') },
    jokes: [
      [L('Sarayda yer çok', "There's plenty of room in the palace"), L('Sarayda yer çok, lordum, ama halkı sarayın koridorlarında uyutursanız tacınızın üstüne horlarlar. Gördüm; biri tacı yastık yapmıştı.', "Plenty of room, my lord, but put the people in the palace corridors and they'll snore on your crown. I've seen it; one used it as a pillow.")],
      [L('Ağaç kovuğunda yaşasınlar', 'Let them live in hollow trees'), L('Sincaplar kovukları kiraya vermiyor, lordum; sordum. Kira olarak ceviz istediler, cevizimiz de yok.', "The squirrels aren't letting their hollows, my lord; I asked. They wanted walnuts for rent, and we have no walnuts.")],
      [L('Yıldızların altında uyusunlar', 'Let them sleep under the stars'), L('Çok şiirsel, lordum. Ama yağmur yağınca şiir bitiyor, köylüler gidiyor, şair de grip oluyor.', 'Very poetic, my lord. But when it rains, the poetry ends, the villagers leave, and the poet catches a cold.')],
      [L('Saray bahçesine çadır kursunlar', 'Let them pitch tents in the palace garden'), L('Bahçıvan buna razı olmaz, lordum; güllerine kimse basamaz. Bana bile basamazsın dedi; ben güle basmam, güle bakarım.', "The gardener won't allow it, my lord; nobody treads on his roses. He told even me not to; I don't tread on roses, I admire them.")],
    ],
  },
  {
    id: 'noGood',
    when: ({ kingdom: k }) => hasTradePost(k) && k.trade.good === null && !k.trade.idle,
    say: () => [
      L(`Tüccarımız ticaret noktasında bekliyor, lordum, elinde boş bir çuval. Ara sıra çuvalı açıp içine bakıyor, belki bir şey çıkar diye. Ne satacağını seçmezseniz hiçbir şey satmaz ve altın getirmez.`, `Our merchant waits at the trading post, my lord, holding an empty sack. Now and then he opens it and peers in, in case something has appeared. Unless you choose what he sells, he sells nothing and brings no gold.`),
      L(`Lordum, tüccarımız devesine bakıyor, devesi de ona; ikisinin de yapacak işi yok ve bakışmaları gittikçe tuhaflaşıyor. Satılacak malı seçmezseniz tek bir altın getirmezler.`, `My lord, our merchant stares at his camel and the camel stares back; neither has anything to do, and the staring grows stranger by the hour. Unless you pick a good to sell, they won't bring a single coin.`),
      L(`Ticaret noktası hazır ama tüccar ne satacağını bilmiyor, lordum. Yemek mi, yapı malzemesi mi, savaş malzemesi mi? Bana sordu, ben de "elçilik hizmetleri" dedim; güldü. Seçin ki altın gelsin.`, `The trading post is ready but the merchant doesn't know what to sell, my lord. Food, building materials or war materials? He asked me; I said "envoy services"; he laughed. Choose, and the gold will come.`),
      L(`Tüccar her gün kapımı çalıp "Ne satayım?" diye soruyor, lordum. Ben bilmem ki; karar sizin, sorumluluk da. Mal seçilmeden sefer de yok, altın da.`, `The merchant knocks on my door every day asking "What shall I sell?", my lord. How should I know; the decision is yours, and so is the blame. No good chosen, no trip, no gold.`),
      L(`Lordum, boş çuvalla pazara giden tüccar boş keseyle döner; benim gençliğimin özeti budur. Ticaret sekmesinden bir mal seçin; fazla olanı satın, eksik olanı değil.`, `My lord, a merchant who goes to market with an empty sack comes home with an empty purse; that is my youth in a nutshell. Pick a good in the Trade tab; sell what you have too much of, not what you lack.`),
    ],
    go: { label: L('Satılacak malı seç', 'Choose a good to sell'), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Havayı satsın', 'Let him sell air'), L('Hava satmayı denedi, lordum. Alıcı da çıktı, ama altınları da havadandı. Şimdi ikisi mahkemelik.', 'He tried selling air, my lord. A buyer even turned up, but paid in thin-air gold. Now they are in court.')],
      [L('Elçiyi satsın', 'Let him sell the envoy'), L('Beni mi, lordum? Alan çıkmaz; geçen sefer beni rehin aldılar, ertesi gün çok konuşuyorum diye üstüne para verip geri gönderdiler.', "Me, my lord? No one would buy; last time I was taken hostage they paid to send me back the next day because I talked too much.")],
      [L('Deveyi satsın', 'Let him sell the camel'), L('Deve satılırsa tüccar malı sırtında taşır, lordum; bir sefer sonra o da satılığa çıkar. Deve de bunu biliyor, o yüzden tüccara iyi davranıyor.', 'Sell the camel and the merchant carries the goods on his own back, my lord; one trip later he is for sale too. The camel knows this, which is why it treats him kindly.')],
      [L('Söz satsın', 'Let him sell words'), L('Söz satmayı ben denedim, lordum, kırk yıl. Zengin olsaydım burada olmazdım; bir adada, şezlongda olurdum.', "I've tried selling words, my lord, for forty years. Were I rich I wouldn't be here; I'd be on an island, in a deckchair.")],
    ],
  },
  {
    id: 'innBetter',
    when: (c) => betterInn(c) !== null,
    say: (c) => {
      const b = betterInn(c)!
      const good = c.kingdom.trade.good!
      const here = tradePrice(c.kingdom, good, c.online.market, c.now)
      const gain = pct(b.unit / Math.max(0.0001, here) - 1)
      const p = L(b.unit.toFixed(2).replace('.', ','), b.unit.toFixed(2))
      return [
        L(`Lordum, ${b.name} malımıza birimi ${p} altın veriyor; şimdiki yerimizden ${gain} fazla. Bunu öğrenmek için üç akşam o handa oturdum; masrafı sonra konuşuruz. Tüccarı oraya çevirsek?`, `My lord, ${b.name} pays ${p} gold a unit for our goods; ${gain} more than where we sell now. I sat three evenings in that inn to learn it; we'll discuss my expenses later. Shall we send the merchant there?`),
        L(`Hanlarda kulağıma çalındı, lordum; kulağım hanlarda çok çalınır: ${b.name} bizim sattığımız mala iyi para veriyor, ${gain} fazlası. Sefer de aynı kısa yol.`, `I overheard in the inns, my lord; my ears do a great deal of overhearing in inns: ${b.name} pays well for what we sell, ${gain} more. And the trip is just as short.`),
        L(`${b.name} hancısı bize göz kırpıyor, lordum: birimi ${p} altın. Belki de gözüne bir şey kaçmıştır, ama fiyat gerçek. Bu kadar parayı lobi pazarına bırakmak yazık.`, `The innkeeper of ${b.name} is winking at us, my lord: ${p} gold a unit. Perhaps he has something in his eye, but the price is real. A shame to leave that much on the lobby market.`),
        L(`Tüccarımız yanlış kapıya gidiyor gibi, lordum; huyudur, düğününde de yanlış eve gitmişti. ${b.name} ${gain} fazla ödüyor; oradaki payımız da yetiyor.`, `Our merchant seems to be knocking at the wrong door, my lord; it's his habit, he went to the wrong house on his wedding day too. ${b.name} pays ${gain} more, and our share there is big enough.`),
      ]
    },
    go: { label: L('Tüccarın yoluna bak', "Check the merchant's route"), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Hancılara güvenmem', "I don't trust innkeepers"), L('Haklısınız, lordum; ben de birine güvendim, şarabı suydu. Ama fiyatı yazılı verdi; yazıyı da şarapla yazmış, okunmuyor.', 'Quite right, my lord; I trusted one once and his wine was water. But he gave the price in writing; written in wine, alas, so it is illegible.')],
      [L('Lobi pazarı alışkanlık', "The lobby market is a habit"), L('Alışkanlık da bir vergidir, lordum; üstelik en pahalısı. Ben kırk yıldır aynı şapkayı takıyorum, bakın hâlime.', "Habit is a tax too, my lord, and the dearest. I have worn the same hat for forty years; look at me.")],
      [L('Sonra bakarız', "We'll look later"), L('Bakarız, lordum. Hancı da bekler; ama fiyatı beklemez. Fiyatlar hancılardan daha sabırsızdır.', "We shall, my lord. The innkeeper will wait; his price won't. Prices are less patient than innkeepers.")],
    ],
  },
  {
    id: 'innReach',
    when: (c) => richInnOutOfReach(c) !== null,
    say: (c) => {
      const r = richInnOutOfReach(c)!
      return [
        L(`Lordum, ${r.name} cömert bir han; ama oraya uzağız, hancı bizi tanımıyor. Kendimi tanıttım, "elçi kim?" dedi; kalbim kırıldı. Yakınındaki ${r.town} kasabasını alırsak pastasından pay alırız.`, `My lord, ${r.name} is a generous inn, but we are too far away and the innkeeper doesn't know us. I introduced myself; he said "what envoy?"; my heart broke. Take the nearby town of ${r.town} and we'd get a slice of its pie.`),
        L(`${r.name} her mala iyi para veriyor, lordum. Elimizde yakınında bir kasaba olsa tüccarımız da oraya gidebilirdi: ${r.town} uygun duruyor. Hem şirin bir kasaba; garnizonu dışında.`, `${r.name} pays well for every good, my lord. If we held a town near it, our merchant could go there too: ${r.town} looks suitable. A charming town, too; apart from its garrison.`),
        L(`Hanlarda konuşulan bir şey var: ${r.name} cömert. Biz orada yokuz; ${r.town} kasabası bizim olsa olurduk. Hancılar yalnız komşularıyla iş yapar; benim gibi.`, `Word in the inns is that ${r.name} is generous. We have no foothold there; we would if ${r.town} were ours. Innkeepers deal only with neighbours; like me.`),
        L(`Uzak bir han, iyi fiyat, lordum: ${r.name}. Payımız yok, çünkü yakınında ne sarayımız ne kasabamız var. ${r.town} bu işi çözer; kılıçla ya da çeyizle, siz bilirsiniz.`, `A distant inn, a good price, my lord: ${r.name}. We have no share, for we have neither palace nor town near it. ${r.town} would solve that; by sword or by dowry, as you prefer.`),
      ]
    },
    go: { label: L('Ticarete bak', 'Look at trade'), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Kasaba almak zahmet', 'Taking a town is a bother'), L('Zahmet, lordum; ama hancılar zahmet çekmeyenlere iskonto yapmıyor. Ben sordum, bana "elçiye zam" dediler.', 'A bother, my lord; but innkeepers give no discount to those who spare themselves bother. I asked; they said "surcharge for envoys".')],
      [L('Uzak han, yorgun deve', 'Far inn, tired camel'), L('Sefer uzamaz, lordum; deve yalnız hancının kim olduğunu bilmek ister. Deveniz biraz snobdur.', "The trip wouldn't lengthen, my lord; the camel just likes to know who the innkeeper is. Your camel is a bit of a snob.")],
      [L('Han dediğin hep aynı', 'All inns are the same'), L('Hiç aynı değil, lordum; birinin şarabı ekşi, ötekinin fiyatı tatlı. Ben ikisini de denedim, fiyatı tercih ederim.', "Not at all, my lord; one has sour wine, another sweet prices. I've tried both; I prefer the prices.")],
    ],
  },
  {
    id: 'tradeIdle',
    when: ({ kingdom: k }) => hasTradePost(k) && !!k.trade.idle,
    say: () => [
      L(`Tüccar evde oturuyor, lordum; "hiçbir şey satma" demişsiniz. Adam o kadar boş ki kendi gölgesiyle pazarlığa girişti. Bir mal seçsek?`, `The merchant is sitting at home, my lord; you told him "sell nothing". The man is so idle he has started haggling with his own shadow. Shall we pick a good?`),
      L(`Lordum, "hiçbir şey satma" emriniz harfiyen uygulanıyor: tüccar sabahtan beri aynı taburede oturuyor. Bir mal seçsek, biraz altın getirse?`, `My lord, your order to "sell nothing" is being carried out to the letter: the merchant has sat on the same stool since dawn. Shall we pick a good, so he brings some gold?`),
      L(`Tüccarımız evde bekliyor, lordum; stoklar korunuyor ama hazineye tek bir kuruş girmiyor. Hazinedar her sabah kasayı açıp içine "merhaba" diyor, yankı cevap veriyor. Fazla olan bir malı sattırsak?`, `Our merchant waits at home, my lord; the stocks are safe but not a penny enters the treasury. Every morning the treasurer opens the chest and says "hello"; the echo answers. Shall we sell something we have too much of?`),
      L(`Tüccar boş oturmaktan o kadar sıkıldı ki devesine şarkı öğretiyor, lordum. Deve de öğrendi; şimdi ikisi gece düet yapıyor ve kimse uyuyamıyor. Ticaret sekmesinden ona bir mal verelim, altın getirsin.`, `The merchant is so bored he is teaching his camel to sing, my lord. The camel has learned; now they duet at night and nobody sleeps. Let's give him a good in the Trade tab and let him bring gold.`),
      L(`Lordum, satış durmuş: tüccar evde, deve ahırda, hazine bekliyor, ben de üçünü birden izliyorum. Ambarda fazla olan bir şey varsa tüccara verelim.`, `My lord, sales have stopped: the merchant at home, the camel in the stable, the treasury waiting, and me watching all three. If the storehouse has a surplus of anything, let's hand it to the merchant.`),
    ],
    go: { label: L('Tüccara iş ver', 'Give the merchant work'), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Dinlensin, hak etti', "Let him rest, he's earned it"), L('Hak etti tabii, lordum; ama hazine dinlenmeyi sevmez. Hazine işkolik bir kasadır.', 'Earned it he has, my lord; but the treasury dislikes rest. The treasury is a workaholic chest.')],
      [L('Tüccar da insan', 'The merchant is human too'), L('Elbette, lordum; ama dinlenen insan sıkılır, sıkılan tüccar da benimle sohbete gelir. Bunu ikimiz de istemeyiz; en çok da o.', "Of course, my lord; but a resting man grows bored, and a bored merchant comes to chat with me. Neither of us wants that; he least of all.")],
      [L('Fiyatlar düzelsin', 'Let prices recover'), L('Akıllıca, lordum: fiyat dipteyse beklemek iyidir. Taçlar da pazardan mal aldıkça fiyat toparlanır; yalnız çok beklemeyelim, ben bu yaşta "uzun vade"ye pek güvenemiyorum.', 'Wise, my lord: when a price is at rock bottom, waiting is good. As the crowns buy from the market, prices recover; only let us not wait too long, at my age I cannot quite trust "the long term".')],
      [L('Malları saklıyorum', "I'm saving the goods"), L('Saklayın, lordum; ama ambar dolarsa sığmayan boşa gider. Saklamanın da bir sınırı var; benim sırlarımın da.', "Save them, my lord; but when the storehouse is full, what won't fit is wasted. Saving has its limits; so do my secrets.")],
    ],
  },
  {
    id: 'tradeBroken',
    when: ({ kingdom: k }) => !!k.trade.damaged,
    say: () => {
      const g = n(balance.economy.trade.repairCost.gold)
      const m = n(balance.economy.trade.repairCost.materials)
      return [
        L(`Ticaret noktamız hâlâ harap, lordum. Turistik bir yıkıntı olarak gezdirmeyi düşündüm, kimse para vermedi. Onarılana kadar tüccar satış yapamaz; onarmak ${g} altın ve ${m} yapı malzemesi ister.`, `Our trading post is still in ruins, my lord. I thought of running tours of it as a picturesque ruin; nobody paid. Until it is repaired the merchant cannot sell; repairs cost ${g} gold and ${m} building materials.`),
        L(`Ticaret noktamızdan hâlâ duman tütüyor, lordum. Harap kaldıkça tüccar tek bir şey satamaz. Onarmak ${g} altın ve ${m} yapı malzemesi tutar.`, `Our trading post is still smoking, my lord. While it lies in ruins the merchant cannot sell a thing. Repairing it costs ${g} gold and ${m} building materials.`),
        L(`Lordum, yağmacıların bıraktığı enkaz hâlâ yerinde. Tüccar yanık tezgâhta mal satamaz; ${g} altın ve ${m} yapı malzemesiyle onaralım.`, `My lord, the wreckage the raiders left is still there. The merchant cannot sell from a charred stall; let us repair it with ${g} gold and ${m} building materials.`),
        L(`Tüccar yanmış ticaret noktasının önünde ağlıyor, lordum; devesi de onu teselli ediyor. Onarım ${g} altın, ${m} yapı malzemesi; sonra satış yeniden başlar.`, `The merchant weeps before the burnt trading post, my lord; his camel consoles him. Repairs: ${g} gold, ${m} building materials; then sales resume.`),
        L(`Harap bir ticaret noktası rakiplerin keyfini yerine getirir, lordum; haritada herkes yanık hâlini görüyor. ${g} altın ve ${m} yapı malzemesiyle onarırsak tüccar yeniden satar.`, `A ruined trading post delights our rivals, my lord; everyone on the map can see it charred. Repair it with ${g} gold and ${m} building materials and the merchant sells again.`),
      ]
    },
    go: { label: L('Onarmaya git', 'Go and repair it'), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Yanık hâli de güzel', 'It looks nice burnt'), L('Ressam da öyle dedi, lordum, ve tablosunu sattı. Biz ise hiçbir şey satamıyoruz; ressama mı geçsek?', 'So said the painter, my lord, and he sold his painting. We, however, sell nothing; shall we take up painting?')],
      [L('Kim yaktıysa o onarsın', 'Whoever burned it can fix it'), L('Mektup yazdım, lordum, çok kibar bir mektup. Cevap gelmedi; bir ok geldi. Okun ucunda da bizim mektup vardı.', 'I wrote a letter, my lord, a very polite letter. No reply came; an arrow came. Our letter was on its tip.')],
      [L('Biraz havalansın', 'Let it air out a bit'), L('Havalandı, lordum; artık yağmur da içeri giriyor, güvercinler de. Güvercinler kira vermiyor.', "It has aired, my lord; now the rain comes in, and the pigeons too. The pigeons pay no rent.")],
      [L('Kayıp da kazançtır', 'A loss is also a gain'), L('Hangi kitapta yazıyor, lordum? Hazinedar o kitabı yakmak istiyor; ticaret noktasında, ateş hazırken.', 'Which book says that, my lord? The treasurer wants to burn it; at the trading post, while the fire is going.')],
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
      L('Lordum, ambarlar tıka basa dolu; dolu ambar fareyi, pası ve yangını çeker. Fareler şimdiden sendika kurdu, talepleri var. Saray → Projeler\'de büyük işler bekliyor: katedral, çarşı, şövalye tarikatı. Malı taşa ve şana çevirelim.', 'My lord, the storehouses are crammed; a full storehouse draws rats, rust and fire. The rats have already formed a guild and have demands. Great works await in Palace → Projects: a cathedral, a bazaar, a knightly order. Let us turn goods into stone and glory.'),
      L('Bu bolluk çürümeden bir şeye dönüşmeli, lordum; çürürse kokusunu ben çekerim, odam ambarın üstünde. Ustalar büyük bir iş için hazır; her aşama kalıcı bir katkı ve sıralamada puan getirir. Projeler bölümüne bakalım mı?', 'This plenty must become something before it rots, my lord; if it rots I shall bear the smell, my room is above the storehouse. The builders are ready for a great work; every stage brings a lasting boon and points on the rankings. Shall we look at Projects?'),
      L('Lordum, hazinedar da ambarcı da yer kalmadı diye ağlıyor; ikisini aynı mendille sildim. Ulu Katedral\'e kereste, Büyük Çarşı\'ya yemek, Şövalye Tarikatı\'na demir gönderelim; afetler yakmadan.', "My lord, the treasurer and the storekeeper are both weeping that there's no room left; I dried them with the same handkerchief. Let us send timber to the Grand Cathedral, food to the Great Bazaar, iron to the Knightly Order; before disaster burns it."),
      L('Dolu ambar, lordum, deprem de sel de geldiğinde en çok yanan ambardır; afetler de akıllıdır, boş ambara uğramaz. Fazlayı büyük işlere aktaralım; adınız taşlara kazınsın.', 'A full storehouse, my lord, is the one that loses most when earthquake or flood comes; disasters are clever, they never visit an empty one. Let us pour the surplus into great works and have your name carved in stone.'),
      L('Lordum, ustabaşı kapımda şapkasını çeviriyor: "elimiz boş, ambar dolu" diyor. Bir de "elçi efendi niye hep konuşuyor" dedi, onu duymamış gibi yaptım. Büyük işlerin her aşaması kalıcı bir kazanç; Projeler bölümünde bekliyorlar.', 'My lord, the master builder stands at my door wringing his hat: "our hands are empty, the storehouse full," he says. He also said "why does master envoy never stop talking"; I pretended not to hear. Every stage of a great work is a lasting gain; they await in Projects.'),
    ],
    go: { label: L('Projelere git', 'Go to Projects'), act: tab('kingdom', 'palace', 'projects') },
    jokes: [
      [L('Fareler de bir şey yesin', 'Let the rats have something too'), L('Yiyorlar, lordum; dün biri bana selam verdi, öbürü vergi muafiyeti istedi. O kadar rahatlar.', 'They are eating, my lord; yesterday one greeted me and another asked for a tax exemption. That is how comfortable they are.')],
      [L('Ben zenginliğimi seyrederim', 'I like to gaze at my wealth'), L('Seyredin, lordum; ama pas da seyrediyor ve sizden hızlı yiyor. Pas hiç doymaz, benim gibi.', 'Gaze away, my lord; but rust is gazing too, and eats faster than you. Rust is never full, like me.')],
      [L('Katedral mi? Ben dindar değilim', "A cathedral? I'm not devout"), L('Çarşı da var, lordum, tarikat da. Taş her inanca uyar; hatta taşın kendi inancı yoktur, en rahatı odur.', 'There is the bazaar too, my lord, and the order. Stone suits every creed; indeed stone has no creed of its own, which makes it the most relaxed of all.')],
      [L('Bir kule de bana dikin', 'Raise a tower for me too'), L('Önce katedralin çan kulesi, lordum; sonra belki bir elçi heykeli. Ölçülerimi çoktan verdim, heykeltıraş "bu kadar çene sığmaz" dedi.', 'First the cathedral\'s bell tower, my lord; then perhaps a statue of the envoy. I gave my measurements long ago; the sculptor said "that much chin won\'t fit".')],
    ],
  },
  {
    id: 'storeFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && (['food', 'materials', 'arms'] as const).some((g) => k.stock[g] >= storageCap(k, now) * 0.97),
    say: ({ kingdom: k, now }) => {
      const full = (['food', 'materials', 'arms'] as const).filter((g) => k.stock[g] >= storageCap(k, now) * 0.97)
      const list = full.map((g) => GOOD_NAMES[g]).join(', ')
      return [
        L(`Ambarlar dolup taşıyor, lordum: ${list}. Kapıyı açan ambarcı çığ altında kaldı, çıkardık, iyi. Sığmayan mal boşa gider. Ya tüccara sattırın, ya bir ambar kurun ya da bir şeyler inşa edip harcayın.`, `The storehouses are overflowing, my lord: ${list}. The storekeeper who opened the door was buried in an avalanche; we dug him out, he's fine. What won't fit is wasted. Have the merchant sell it, build a storehouse, or build something and spend it.`),
        L(`Ambarcı kapıyı kapatamıyor, lordum: ${list} tavana kadar yığılmış. Kapıyı sırtıyla tutuyor, bir haftadır öyle. Yeni gelen mal sığmaz ve boşa gider. Sattırın, harcayın ya da yeni bir ambar kurun.`, `The storekeeper can't shut the door, my lord: ${list} piled to the rafters. He has been holding it shut with his back for a week. New goods won't fit and go to waste. Sell, spend, or build a new storehouse.`),
        L(`Lordum, ambara artık ${list} sığmıyor. Fazlası boşa gidiyor; bu benim yüreğime dokunuyor, cebime dokunmadığı hâlde. Tüccara sattırmak, bir ambar kurmak ya da bir şey inşa etmek çare.`, `My lord, the storehouse can hold no more ${list}. The surplus is wasted; it wounds my heart, though not my purse. The cure: have the merchant sell it, build a storehouse, or build something.`),
        L(`Bereketin bu kadarı dert olur, lordum: ${list} ambarın sınırında. Bunu söyleyen ilk elçi olmaktan gurur duyuyorum. Sığmayan mal kaybolur. Ya tüccar götürsün, ya bir ambar daha, ya da güzel bir yapı.`, `This much plenty becomes a problem, my lord: ${list} at the storehouse's limit. I am proud to be the first envoy ever to say so. What won't fit is lost. Let the merchant take it, or another storehouse, or a handsome building.`),
        L(`Lordum, ambarın duvarları gıcırdıyor: ${list} doldu. Gıcırtı her gece biraz daha yüksek; dün bir şarkıya benzedi. Depo sınırını aşan üretim yok olur. Malı satalım, harcayalım ya da bir ambar kuralım ki yer açılsın.`, `My lord, the storehouse walls are creaking: ${list} full. The creak grows louder every night; yesterday it sounded like a song. Production beyond the storage limit vanishes. Let us sell, spend, or build a storehouse to make room.`),
      ]
    },
    go: { label: L('Depoya bak', 'Check the stores'), act: tab('store', 'store', 'goods') },
    jokes: [
      [L('Fareler de yesin', 'Let the rats eat too'), L('Fareler zaten yiyor, lordum; o kadar besili ki kışlaya asker diye yazılmak istediler. Boy ölçüsünde elendiler, kilo ölçüsünde geçtiler.', 'The rats are already eating, my lord; they are so plump they tried to enlist at the barracks. Failed on height, passed on weight.')],
      [L('Halka dağıtalım', "Let's hand it out to the people"), L('Cömertsiniz, lordum! Ama halk ambara giremiyor, ben de anahtarı arıyorum; kırk yıldır bir anahtarı bulduğum görülmemiş. Satmak ya da harcamak kaldı.', "How generous, my lord! But the people can't get into the storehouse, and I'm looking for the key; in forty years I have never once found a key. That leaves selling or spending.")],
      [L('Üstüne oturup beklerim', "I'll sit on it and wait"), L('Oturursunuz, lordum, ama yeni gelen mal yine sığmaz; altınızdan kayar gider. Ben denedim, çuvalla birlikte merdivenden indim.', "You may, my lord, but new goods still won't fit; they'll slide out from under you. I tried; I went down the stairs with the sack.")],
      [L('Ne güzel, zenginiz', "How lovely, we're rich"), L('Zenginiz, lordum, ama tıka basa zengin. Fazlası boşa gidiyor; zenginlik de bir delik çuval gibi sızıyor.', "Rich we are, my lord, but stuffed-full rich. The surplus is wasted; wealth leaks like a sack with a hole.")],
    ],
  },
  {
    id: 'treasuryFull',
    when: ({ kingdom: k, now }) => hasPalace(k) && k.stock.gold >= goldCap(k, now) * 0.97,
    say: ({ kingdom: k, now }) => {
      const g = n(k.stock.gold)
      const cap = n(goldCap(k, now))
      return [
        L(`Hazine ağzına kadar dolu, lordum: ${g} / ${cap} altın. Dolu hazinede tüccar mal götürmez, vergi boşa gider; rakip tacın haraççıları da bu kokuyu çok uzaktan alır. Harcamanın tam zamanı: bir yükseltme, bir bina, belki bir hediye?`, `The treasury is full to the brim, my lord: ${g} / ${cap} gold. With a full treasury the merchant won't carry goods and taxes go to waste; the rival crown's tribute collectors can smell it from afar, too. The perfect time to spend: an upgrade, a building, perhaps a gift?`),
        L(`Hazinedar kapıyı ancak omzuyla kapatabildi, lordum: ${g} / ${cap} altın. Şimdi omzu çıktı, şifacıda. Dolu hazinede tüccar mal götürmez, vergi de boşa akar. Bir yükseltme ya da yeni bir bina tam zamanı.`, `The treasurer could only shut the door with his shoulder, my lord: ${g} / ${cap} gold. Now his shoulder is dislocated and he's at the healer's. With a full treasury the merchant carries nothing and taxes drain away. Time for an upgrade or a new building.`),
        L(`Lordum, kasalar dolu: ${g} / ${cap} altın. Bundan sonra gelen altın boşa gider ve tüccar evde oturur. Harcayalım: bir bina, bir yükseltme, belki bir komşuya hediye. Ya da bir elçiye; söylemiş olayım.`, `My lord, the coffers are full: ${g} / ${cap} gold. Any gold from now on is wasted, and the merchant sits at home. Let us spend: a building, an upgrade, perhaps a gift to a neighbour. Or to an envoy; I merely mention it.`),
        L(`Hazineye bir altın daha atsam taşacak, lordum: ${g} / ${cap}. Denemek istedim, hazinedar elimi tuttu. Tüccar dolu hazineye mal satmaz, vergi de kaybolur. Altını taşa, keresteye, şana çevirelim.`, `One more coin and the treasury will overflow, my lord: ${g} / ${cap}. I wanted to try; the treasurer grabbed my hand. The merchant won't sell into a full treasury, and taxes are lost. Let us turn gold into stone, timber and glory.`),
        L(`Lordum, ${g} altınla hazinenin sınırına (${cap}) dayandık. Burada duran altın yalnızca parlar, işe yaramaz; bana benzer, ama ben hiç değilse konuşurum. İnşa menüsünde harcayacak çok şey var.`, `My lord, with ${g} gold we have hit the treasury's limit (${cap}). Gold sitting here merely glitters and does nothing; rather like me, though at least I talk. The build menu has plenty to spend it on.`),
      ]
    },
    go: { label: L('İnşa menüsü', 'Build menu'), act: tab('build') },
    jokes: [
      [L('Altınlarımla yüzeceğim', "I'll swim in my gold"), L('Denedim, lordum. Altın suda yüzmez; ben de yüzemedim. Bir de kuru havuzda denedim, alnımda hâlâ iz var.', 'I tried, my lord. Gold does not float; nor, it turns out, do I. I also tried a dry pool; I still have the mark on my forehead.')],
      [L('Yastığımın altına koyarım', "I'll put it under my pillow"), L('Denedim, lordum; sabah boynum tutuldu, altınlar da yine hazineye sığmadı. Bir de rüyamda haraççıları gördüm.', 'I tried, my lord; I woke with a stiff neck and the gold still did not fit the treasury. And I dreamt of tribute collectors.')],
      [L('Elçime ikramiye', 'A bonus for my envoy'), L('Ah, lordum, ne incelik! Ama kabul edemem... Gerçi... Hayır, edemem. Belki küçük bir kese... Hayır! Önce bir yapı. Sonra konuşuruz. Unutmayın ama.', "Ah, my lord, how thoughtful! But I couldn't accept... Although... No, I couldn't. Perhaps a small purse... No! A building first. We'll talk later. Don't forget, though.")],
      [L('Altından heykelimi diktiririm', "I'll have a gold statue of myself made"), L('Heykeltıraş ölçü almak istedi, lordum; ama heykel üretmez, sadece güvercin çeker. Önce işe yarar bir şey, sonra şatafat.', 'The sculptor wanted your measurements, my lord; but a statue produces nothing, it only attracts pigeons. Something useful first, then the pomp.')],
    ],
  },
  {
    id: 'clogged',
    when: ({ kingdom: k, now }) => hasPalace(k) && clogsOf(k, now).length > 0,
    say: ({ kingdom: k, now }) => {
      const c = clogsOf(k, now).length
      return [
        L(`${c} yapımızın işi boşa gidiyor, lordum: ürettiklerine yer yok. Haritada üstlerinde sarı ünlemler sallanıyor; ben de sallanıyorum, endişeden.`, `The work of ${c} of our buildings is going to waste, my lord: there's no room for what they make. Yellow exclamation marks sway above them on the map; I am swaying too, with worry.`),
        L(`Lordum, ${c} yapımız boşuna çalışıyor: ürettiklerinin konacak yeri kalmadı. Bir demirci on kılıcı üst üste dizip kule yapmaya başladı. Ürünü değiştirin, ambarı büyütün ya da malı satın.`, `My lord, ${c} of our buildings are working in vain: nowhere left to put what they make. One smith has started stacking swords into a tower. Change the product, enlarge the storehouse, or sell the goods.`),
        L(`${c} yapıda işçiler eli kolu bağlı duruyor, lordum; ambar ya da cephanelik dolu. Biri bana "sonsuzluk böyle bir şey mi" diye sordu; felsefeye başladılar, tehlikeli. Ya ürünlerini değiştirelim ya da depoya yer açalım.`, `In ${c} buildings the workers stand with their hands tied, my lord; the storehouse or armoury is full. One asked me "is this what eternity is like?"; they have taken up philosophy, which is dangerous. Let us change their products or make room in the stores.`),
        L(`Üretim ağı tıkandı, lordum: ${c} yapının emeği boşa gidiyor. Bina menüsünde neyin dolduğu ve çaresi yazıyor; ben de burada endişeyle bekliyorum. Endişe benim ana mesleğim.`, `The production chain is clogged, my lord: the labour of ${c} buildings is wasted. The building menu says what is full and how to fix it; I wait here, anxiously. Anxiety is my main profession.`),
        L(`Lordum, ${c} yapının üstünde sarı ünlemler sallanıyor; dolmuş bir ambar ya da cephanelik yüzünden. İşçileri başka yere verelim ya da yer açalım.`, `My lord, yellow exclamation marks sway above ${c} buildings, all because of a full storehouse or armoury. Let us move the workers elsewhere or make room.`),
      ]
    },
    go: { label: L('Cephaneliğe bak', 'Check the armoury'), act: tab('store', 'store', 'armory') },
    jokes: [
      [L('Ünlemler süs olsun', 'The exclamation marks are decorative'), L('Sarı yakışıyor, lordum; ama süs için çok pahalı. Her biri boşa giden bir emek; bir yılbaşı ağacı bu kadara mal olmaz.', "Yellow suits you, my lord; but it's a costly decoration. Each one is wasted labour; a festive tree never cost this much.")],
      [L('İşçiler dinlensin', 'Let the workers rest'), L('Dinlenmiyorlar ki, lordum; çalışıp çalışıp boşa üretiyorlar. Dinlenmenin en kötüsü bu; elçiliğin de tarifi.', "They aren't resting, my lord; they work and work and produce for nothing. The worst kind of rest; and the very definition of diplomacy.")],
      [L('Bu ünlemler ne demek?', 'What do those marks mean?'), L('Ünlem "dikkat" demek, lordum; benim dilimde de "elçiye kulak verin". Benim dilimde her cümle ünlemle biter!', 'An exclamation mark means "attention", my lord; in my language it means "listen to the envoy". In my language every sentence ends with one!')],
      [L('Sarıyı severim', 'I like yellow'), L('Bilmezdim, lordum. Ama ünlemler çoğalırsa haritanız civciv çiftliğine döner; rakipler bize gülecek.', "I didn't know, my lord. But if the marks multiply, your map will look like a chick farm; our rivals will laugh at us.")],
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
        L(`Lordum, sarayı ${l}. seviyeye yükseltmeye gücümüz yetiyor! Hudut büyür, yeni yapılar açılır, nüfus sınırı artar. Bir de şatafat, unutmayalım; şatafat benim uzmanlık alanım.`, `My lord, we can afford to raise the palace to level ${l}! The border grows, new buildings unlock, the population limit rises. And the pomp, let us not forget; pomp is my speciality.`),
        L(`Hazine ve ambarlar yetiyor, lordum: saray ${l}. seviyeye çıkabilir! Hudut genişler, nüfus sınırı artar ve yeni yapılar açılır. Benim odama da bir pencere açılır diye umuyorum.`, `Treasury and stores suffice, my lord: the palace can rise to level ${l}! The border widens, the population limit rises and new buildings unlock. I'm hoping my room gets a window, too.`),
        L(`Mimarlar planları çoktan çizdi, lordum; ben de kenarına kendi odamı çizdim, büyükçe. Sarayı ${l}. seviyeye yükseltecek her şeyimiz var: daha geniş hudut, daha çok halk, yeni binalar.`, `The architects drew the plans long ago, my lord; I drew my own room in the margin, a roomy one. We have everything to raise the palace to level ${l}: a wider border, more people, new buildings.`),
        L(`Lordum, bir sarayın değeri yüksekliğiyle ölçülür; benim de öyle düşündüğümü bilirsiniz. ${l}. seviye için gerekenler hazır: hudut büyür, yeni yapılar açılır.`, `My lord, a palace is measured by its height; you know I hold that view. Everything for level ${l} is ready: the border grows, new buildings unlock.`),
        L(`Komşular sarayınıza bakıp burun kıvırıyor, lordum; oysa ${l}. seviyeye çıkacak gücümüz var. Yükseltince hudut genişler, nüfus sınırı artar.`, `The neighbours turn up their noses at your palace, my lord; yet we have the means to reach level ${l}. Upgrade it and the border widens and the population limit rises.`),
      ]
    },
    go: { label: L('Sarayı yükselt', 'Upgrade the palace'), act: open('palace') },
    jokes: [
      [L('Saray bana büyük bile', 'The palace is too big for me as it is'), L('Büyük mü? Geçen gün kraliçe ananın elbisesi kapıdan girmedi, lordum. Elbise hâlâ avluda bekliyor.', "Too big? The other day the queen mother's gown wouldn't fit through the door, my lord. The gown is still waiting in the courtyard.")],
      [L('Küçük saray yeter', 'A small palace will do'), L('Tevazu güzel, lordum; ama tevazuyla hudut genişlemez. Komşular da tevazuyu zayıflık sanar, hemen haraççı gönderir.', 'Modesty is lovely, my lord, but it does not widen borders. And neighbours mistake modesty for weakness and send tribute collectors at once.')],
      [L('Merdiven çıkmayı sevmem', "I don't like climbing stairs"), L('Ben sizin için çıkarım, lordum; dizlerim ağlar ama sadıktır. Her basamakta adınızı anar, pek iyi şeyler söylemez.', 'I shall climb them for you, my lord; my knees weep but they are loyal. At every step they mention your name, and not kindly.')],
      [L('Yükseklik korkum var', "I'm afraid of heights"), L('Pencereden bakmayın, lordum; yeni kattan yalnızca rakiplerin küçüldüğünü görürsünüz. Ki bu da çok keyifli bir korkudur.', "Don't look out of the window, my lord; from the new floor you'll only see your rivals shrinking. Which is a most enjoyable fear.")],
    ],
    snooze: 10,
  },
  {
    id: 'liege',
    when: ({ kingdom: k, now, crowns }) => crowns > 1 && k.liege === undefined && fealtyOpen(k, now),
    say: ({ online }) => {
      const cs = online.crowns.join(L(' ile ', ' and '))
      const l = balance.cities.crown.requiredForPalaceLevel
      return [
        L(`Henüz hiçbir taca biat etmediniz, lordum. ${cs} iki taç; sarayı ${l}. seviyeye yükseltmek için birine bağlı olmanız gerekiyor. Seçim sezon boyunca kalıcı; evlilik gibi, ama boşanma yok. İyi düşünün, ama çok uzun değil.`, `You have sworn fealty to no crown yet, my lord. ${cs}: two crowns; to raise the palace to level ${l} you must be bound to one. The choice lasts the whole season; like marriage, but with no divorce. Think it over well, but not too long.`),
        L(`Lordum, ${cs} sizi bekliyor; ikisi de adınızı kendi sancağının yanında görmek istiyor. İkisi de bana ayrı ayrı rüşvet teklif etti, ikisini de... şimdilik reddettim. Biat etmeden saray ${l}. seviyeye çıkmaz. Seçim kalıcı, ona göre.`, `My lord, ${cs} await you; each wants your name beside its banner. Each offered me a bribe separately, and I refused both... for now. Without fealty the palace won't reach level ${l}. The choice is permanent, mind.`),
        L(`Henüz kimsenin lordu değilsiniz, lordum; ${cs} arasında bir seçim yapmalısınız. Sarayın ${l}. seviyesi için biat şart ve sezon boyunca değişmez. Kendi tacınızın devriyesi bahşiş getirir, öbürü haraççı gönderir.`, `You are nobody's lord yet, my lord; you must choose between ${cs}. Fealty is required for a level ${l} palace and cannot change all season. Your own crown's patrol brings tips; the other sends tribute collectors.`),
        L(`İki taç, iki sancak, lordum: ${cs}. Birine biat etmeden saray ${l}. seviyeye yükselmez. Acele etmeyin ama oyalanmayın da; ben bu ikisini aynı anda yapmayı kırk yılda öğrendim.`, `Two crowns, two banners, my lord: ${cs}. Without swearing to one, the palace won't rise to level ${l}. Don't rush, but don't dawdle either; it took me forty years to learn to do both at once.`),
        L(`Lordum, taçların ulakları koridorda bekliyor, ben de onları oyalamaktan yoruldum. ${cs}: biri seçilmeli. Biat sezon boyunca kalıcıdır ve ${l}. seviye saray için şarttır.`, `My lord, the crowns' messengers wait in the corridor, and I am worn out keeping them amused. ${cs}: one must be chosen. Fealty lasts the season and is required for a level ${l} palace.`),
      ]
    },
    go: { label: L('Bağlılık bölümü', 'Allegiance section'), act: tab('kingdom', 'palace', 'level') },
    jokes: [
      [L('Kendi tacımı yaparım', "I'll make my own crown"), L('Kuyumcuya sordum, lordum. Taç yapar ama krallık yapmıyormuş. Bir de "kafa ölçüsü" istedi; sizinkini tahmin ettim, büyük söyledim.', "I asked the goldsmith, my lord. He makes crowns but not kingdoms. He also wanted a head size; I guessed yours and said large.")],
      [L('Yazı tura atalım', "Let's toss a coin"), L('Attım, lordum; para dik düştü. Tanrılar da kararsız. Parayı cebime koydum, bu da benim kararım. Seçim yine sizde.', 'I tossed it, my lord; it landed on its edge. Even the gods are undecided. I pocketed the coin; that was my decision. The choice is still yours.')],
      [L('İkisine de biat ederim', "I'll swear to both"), L('Ederdiniz, lordum, ama taçlar kıskançtır; ikisi aynı anda sizi dizinin dibinde görmek ister, iki dizinizin dibi de bir tane.', 'You would, my lord, but crowns are jealous; both want you kneeling at their feet at once, and you have only the one pair of knees.')],
      [L('Bağımsız kalırım', "I'll stay independent"), L('Kalırsınız, lordum; ama sarayınız da olduğu yerde kalır. Bağımsız ve küçük; şiirlerde güzel durur, haritada durmaz.', 'You may, my lord; but so will your palace, right where it is. Independent and small; charming in poetry, less so on a map.')],
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
        L(`Saray çok sessiz, lordum; o kadar sessiz ki kendi sesimi dinlemek zorunda kalıyorum, o da yoruyor. Bir kraliçe halkın mutluluğunu ${h} artırır, hanedanı sürdürür ve sarayın ${l}. seviyesi için şarttır. Bedeli ${g} altın; aşkın fiyatı biraz yüksek, kabul.`, `The palace is very quiet, my lord; so quiet I am forced to listen to my own voice, which is tiring. A queen raises the people's happiness by ${h}, continues the dynasty and is required for a level ${l} palace. She costs ${g} gold; love is a little pricey, I grant you.`),
        L(`Lordum, sarayın koridorlarında yalnızca benim ayak seslerim yankılanıyor; bir de dizlerimin gıcırtısı. Bir kraliçe mutluluğu ${h} artırır, hanedanı sürdürür ve ${l}. seviye saray için şarttır. Bedeli ${g} altın; akrabaları bedava gelir, maalesef.`, `My lord, only my footsteps echo in the palace corridors; and the creaking of my knees. A queen raises happiness by ${h}, continues the dynasty and is required for a level ${l} palace. She costs ${g} gold; her relatives come free, alas.`),
        L(`Halk bir kraliçe istiyor, lordum; düğün olursa şenlik de olur. Kraliçe mutluluğu ${h} artırır, çocuklarla hanedan büyür, ${l}. seviye saray da onsuz olmaz. Bedeli ${g} altın.`, `The people want a queen, my lord; a wedding means a festival. A queen raises happiness by ${h}, the dynasty grows with children, and there's no level ${l} palace without her. She costs ${g} gold.`),
        L(`Saray terzisi gelinlik dikmek için yanıp tutuşuyor, lordum. Kraliçe halkın mutluluğuna ${h} katar, varis doğurur ve sarayın ${l}. seviyesi için gerekir. Bedeli ${g} altın; terziyi ben ikna ederim.`, `The court tailor is dying to sew a wedding gown, my lord. A queen adds ${h} to the people's happiness, bears heirs and is needed for a level ${l} palace. She costs ${g} gold; I'll handle the tailor.`),
        L(`Lordum, tahtın iki kişilik olduğunu hatırlatırım. Kraliçe mutluluğu ${h} artırır, hanedanı sürdürür; ${l}. seviye saray için de şarttır. ${g} altına bu fırsat kaçmaz.`, `My lord, may I remind you the throne seats two. A queen raises happiness by ${h} and continues the dynasty; she is also required for a level ${l} palace. At ${g} gold, this is not to be missed.`),
      ]
    },
    go: { label: L('Kraliçe getir', 'Bring a queen'), act: tab('people', 'people', 'queen') },
    jokes: [
      [L('Ben evlenmem', "I won't marry"), L('Babanız da öyle derdi, lordum. Sonra annenizi gördü ve kırk gün şiir yazdı. Şiirleri hâlâ sandıkta; okumayın, aileye zarar.', 'Your father used to say so too, my lord. Then he saw your mother and wrote poetry for forty days. The poems are still in a chest; do not read them, they would harm the family.')],
      [L('Tahtımı kimseyle paylaşmam', "I share my throne with nobody"), L('Tahtı değil, lordum, sarayı paylaşırsınız. Tahtın yarısı zaten hep boş duruyor; ben bazen oturuyorum, kimseye söylemeyin.', "Not the throne, my lord, the palace. Half the throne is always empty anyway; I sit on it sometimes, don't tell anyone.")],
      [L('Önce âşık olmalıyım', 'I must fall in love first'), L('Aşk sonradan gelir, lordum; kırk yıllık evli bir elçi olarak söylüyorum. Bizimkine hâlâ geliyor, yolda galiba. Gelmese de kraliçe mutluluk verir.', "Love comes later, my lord; I say so as an envoy married forty years. Ours is still on its way, I believe. Even if it never arrives, a queen brings happiness.")],
      [L('Kraliçe pahalı', 'A queen is expensive'), L('Pahalı, lordum; ama bir savaştan ucuz. Savaş da kraliçeden ucuzdur diyenler var; onlar bekâr. Yalnız casuslara karşı iyi koruyalım; kaçırmayı severler.', "Expensive, my lord, but cheaper than a war. Some say war is cheaper than a queen; they are bachelors. Only let us guard her well against spies; they love a kidnapping.")],
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
        L(`Lordum, haberler var. Çoğu kötü. Kardeşiniz ${p.person.name} karargâhında ${s} asiyle tahtınızı bekliyor. ${m} dakika sonra sarayınıza yürür; karargâhı şimdi dağıtmak sonradan surlarda dövüşmekten iyidir. Aile toplantısı bu sefer kılıçlı olacak.`, `My lord, there is news. Most of it bad. Your brother ${p.person.name} sits in his camp with ${s} rebels, eyeing your throne. In ${m} minutes he marches on the palace; scattering the camp now beats fighting on the walls later. This family gathering will involve swords.`),
        L(`${p.person.name} karargâhına her gün yeni asiler katılıyor, lordum: ${s} oldular. Yemeklerini de bizim ambardan kaçırdıkları buğdayla yapıyorlar, ayrıca sinir bozucu. ${m} dakika var; bir ordu gönderin ya da tacınızdan yardım isteyin.`, `New rebels join ${p.person.name}'s camp every day, my lord: ${s} now. And they cook with wheat smuggled from our storehouse, which is especially galling. ${m} minutes left; send an army or ask your crown for help.`),
        L(`Lordum, karargâhtan davul sesleri geliyor. ${p.person.name} ${s} asiyle hazırlanıyor ve ${m} dakika sonra kapımızda olacak. Çadırları şimdi yıkmak, sonra surlarda kan dökmekten iyidir.`, `My lord, drums sound from the camp. ${p.person.name} is readying ${s} rebels and will be at our gate in ${m} minutes. Toppling the tents now beats spilling blood on the walls later.`),
        L(`Kardeşiniz ${p.person.name} kendine taç bile yaptırmış, lordum; tenekeden ama parlıyor. ${s} asisi var, ${m} dakikası var. Hanedan bölümünden ordu gönderebilirsiniz.`, `Your brother ${p.person.name} has even had himself a crown made, my lord; tin, but shiny. He has ${s} rebels and ${m} minutes. You can send an army from the Dynasty section.`),
        L(`Lordum, isyan büyüdükçe zorlaşır: ${p.person.name} şimdi ${s} asiyle, ${m} dakika sonra daha fazlasıyla sarayımıza yürür. Ordu ya da taçtan yardım; ikisi birden de olur.`, `My lord, a rebellion grows harder as it grows: ${p.person.name} has ${s} rebels now, and more when he marches on us in ${m} minutes. An army or help from the crown; or both.`),
      ]
    },
    go: { label: L('Hanedana bak', 'Look at the dynasty'), act: tab('kingdom', 'palace', 'house') },
    jokes: [
      [L('Kardeşim beni sever', 'My brother loves me'), L('Severdi, lordum. Şimdi çadırında sizin portrenize ok atıyor. İsabeti de kötü değil; burnunuz delik.', "He did, my lord. Now he shoots arrows at your portrait in his tent. His aim isn't bad either; your nose has a hole in it.")],
      [L('Gelsin, surlarım sağlam', 'Let him come, my walls are sound'), L('Sağlam, lordum; ama kardeşiniz surların zayıf yerini bilir. Çocukken oradan kaçardınız ikiniz; ben de arkanızdan koşardım, dizlerim o zamandan beri böyle.', "Sound they are, my lord; but your brother knows their weak spot. You two used to sneak out through it as boys; I used to run after you, and my knees have been like this ever since.")],
      [L('Ona bir mektup yazarım', "I'll write him a letter"), L('Yazdım, lordum, sizin adınıza, çok dokunaklı. Cevap olarak mektubu ok ucuna takıp geri yolladı. İmla hatalarımı da düzeltmiş.', 'I did, my lord, in your name, most touching. He sent it back on the tip of an arrow. He had corrected my spelling, too.')],
      [L('Annem bizi barıştırır', 'Mother will reconcile us'), L('Kraliçe ana denedi, lordum. Şimdi o da karargâha pasta gönderiyor; kimin tarafında belli değil, ama pastası çok güzel.', "The queen mother tried, my lord. Now she sends cakes to the camp too; whose side she is on is unclear, but her cakes are excellent.")],
    ],
  },
  {
    // The liege backed a beaten pretender: the lord may go over to the rival crown, for a while (CLAUDE.md §9.1.1).
    id: 'liegeOffer',
    when: ({ kingdom: k, now, crowns }) => !!k.liegeOffer && !liegeSwitchError(k, now, crowns),
    say: ({ kingdom: k, now, online }) => {
      const o = k.liegeOffer!
      const m = Math.max(1, Math.ceil((o.until - now) / 60_000))
      const from = online.crowns[o.from] ?? L('tacınız', 'your crown')
      const to = online.crowns[o.to] ?? L('rakip taç', 'the rival crown')
      return [
        L(`Lordum, ${from} kardeşiniz ${o.name}'in tarafını tuttu. Bunu yutacak mıyız? ${m} dakika içinde ${to} tarafına geçebiliriz; ya da sadık kalır, özürlerini ve altınlarını alırız.`, `My lord, ${from} sided with your brother ${o.name}. Are we to swallow that? Within ${m} minutes we can go over to ${to}; or stay loyal and pocket their apologies and their gold.`),
        L(`${from} size sırtını döndü, lordum; hem de ensesi kaşınırken. ${to} kapısını açık tutuyor, ama yalnızca ${m} dakika daha. Karar sizin: intikam mı, özür mü? Ben ikisinden de hediye beklerim.`, `${from} turned its back on you, my lord; and at the worst possible moment. ${to} holds its door open, but only for ${m} more minutes. Your choice: revenge or apology? Either way, I expect a present.`),
        L(`Bir taç kendi lorduna karşı davacıyı destekler mi? ${from} destekledi. ${m} dakikanız var, lordum: ${to} sancağına geçin ya da sadakatinizin bedelini isteyin.`, `Does a crown back a pretender against its own lord? ${from} did. You have ${m} minutes, my lord: go over to the banner of ${to}, or demand the price of your loyalty.`),
        L(`${to} ulağı koridorda bekliyor, lordum; elinde yeni bir sancak. ${m} dakika sonra gidecek. ${from} ise özür mektubunu yazmış, mührünü basmayı bekliyor. Hangisini açalım?`, `The messenger of ${to} waits in the corridor, my lord, holding a new banner. He leaves in ${m} minutes. ${from}, meanwhile, has written an apology and awaits only your seal. Which shall we open?`),
        L(`Lordum, ihanete ihanetle mi, sadakatle mi karşılık vereceğiz? ${from} ${o.name}'i destekledi; ${to} kapısı ${m} dakika daha açık. Seçim sezon boyunca bir daha gelmez.`, `My lord, do we answer betrayal with betrayal, or with loyalty? ${from} backed ${o.name}; the door of ${to} stays open ${m} more minutes. The choice won't come again this season.`),
      ]
    },
    go: { label: L('Kararı ver', 'Decide'), act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      [L('İkisine de biat etsem?', 'What if I swore to both?'), L('Denendi, lordum. O lord şimdi iki başkentte birden çok meşhur; heykeli değil, posteri asılı. "Aranıyor" yazıyor.', 'It has been tried, my lord. That lord is now famous in both capitals at once; not a statue, a poster. It says "Wanted".')],
      [L('Yazı tura atalım', "Let's toss a coin"), L('Attım, lordum; para yine dik düştü. Bu parayı artık kimseye göstermiyorum; sanırım lanetli, ya da çok kararsız.', "I tossed it, my lord; it landed on its edge again. I no longer show this coin to anyone; I think it's cursed, or just very indecisive.")],
      [L('Elçi efendi ne derse o', 'Whatever master envoy says'), L('Beni bu kadar önemsemeniz gururumu okşadı, lordum; ama taç değiştiren lordun elçisinin başı da değişir. Karar sizin.', "Your faith in me flatters me, my lord; but when a lord changes crowns, his envoy's head tends to change too. The decision is yours.")],
      [L('Bekleyelim, bakalım', "Let's wait and see"), L('Bekleriz, lordum; ama teklif beklemez. Saat dolunca ulak atına biner, kapı kapanır.', "We may, my lord; but the offer won't. When time is up the messenger mounts his horse and the door shuts.")],
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
        L(`Taçlar savaşta, lordum! ${m} dakika daha sürecek gibi. Rakip haraççılar ×${String(fx.tribute).replace('.', ',')} ister; hazineyi şişirmeyin, harcayın.`, `The crowns are at war, my lord! It looks set to last ${m} more minutes. The rival crown's tribute collectors demand ×${fx.tribute}; don't let the treasury swell, spend it.`),
        L(`Sınırlarda taç savaşı var. Tacımız sadık lordlarını kolluyor: devriyenin bahşişi ×${String(fx.tip).replace('.', ',')}. Bir eğlence merkeziniz varsa şimdi tam zamanı.`, `The crowns are at war along the borders, my lord. Our crown is looking after its loyal lords: the patrol's tip is ×${fx.tip}. If you have an entertainment hall, now is the time.`),
        L(`Lordum, iki taç birbirine girdi. Savaş bittiğinde kazanan tacın lordları gururlanır; dua edelim de bizimki kazansın. Kaybederse ben baştan beri öbürünü tutuyordum derim, siz de öyle deyin.`, `My lord, the two crowns are at each other's throats. When it ends, the winning crown's lords will strut; let us pray ours wins. If it loses, I shall say I backed the other all along, and so should you.`),
        L(`Başkentlerde savaş borusu çalıyor, lordum; ${m} dakika daha sürecek. Rakip haraççılar hazinenin daha çoğunu ister, tacımız da lordlarına daha cömert davranır.`, `War horns sound in the capitals, my lord; it will last ${m} more minutes. The rival tribute collectors want more of the treasury, and our crown is more generous to its lords.`),
        L(`Taç savaşı, lordum! Biz bu kavgada kılıç sallamıyoruz ama keselerimiz sallanıyor: rakip haraç ×${String(fx.tribute).replace('.', ',')}, devriyenin bahşişi ×${String(fx.tip).replace('.', ',')}.`, `A crown war, my lord! We swing no swords in this quarrel, but our purses swing: rival tribute ×${fx.tribute}, patrol tip ×${fx.tip}.`),
      ]
    },
    go: { label: L('Krallık bölümü', 'Kingdom section'), act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      [L('Ben de katılayım mı?', 'Should I join in?'), L('Taçlar lordların kılıcını değil kesesini ister, lordum. Kesenizi sıkı tutun; ben tutarım isterseniz, bana güvenin. Pek güvenmeyin aslında.', "The crowns want lords' purses, not their swords, my lord. Hold your purse tight; I'll hold it for you if you like, trust me. Actually, don't.")],
      [L('Kim kazanır sence?', 'Who do you think will win?'), L('Ben hep kazananın elçisiyim, lordum; savaş bitince söylerim. Kırk yıldır hiç yanılmadım, bu yöntemle.', "I am always the winner's envoy, my lord; I'll tell you when the war is over. Forty years and never wrong, using this method.")],
      [L('Uzaktan seyrederiz', "We'll watch from afar"), L('Ben de bir tas leblebi kaptım, lordum; seyirlik bir savaş. Yalnız haraççılar seyirci bırakmaz.', "I've already grabbed a bowl of roasted chickpeas, my lord; quite a spectacle. Only the tribute collectors don't leave room for spectators.")],
      [L('Bize ne taçların kavgasından', "The crowns' quarrel is none of our business"), L('Haraççılara bunu siz söyleyin, lordum; onlar kavganın masrafını bizim hazinemizden çıkarıyor.', "You tell the tribute collectors that, my lord; they're paying for the quarrel out of our treasury.")],
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
        L(`${online.crowns[rival] ?? 'Rakip taç'} tahtında ${h.title} oturuyor, lordum; ${t.name.toLocaleLowerCase('tr-TR')} biri. Haraççıları hazinenin daha çoğunu ister: altını hazinede bekletmeyin.`, `On the throne of ${online.crowns[rival] ?? 'the rival crown'} sits ${h.title}, my lord; a ${t.name.toLocaleLowerCase(locale())} sort. Their tribute collectors want more of the treasury: don't leave gold sitting in it.`),
        L(`Rakip tacın hükümdarı ${h.title} pek ${t.name.toLocaleLowerCase('tr-TR')}, lordum. Haraç günü gelmeden altını binalara, askere ya da siparişlere yatırın.`, `The rival crown's ruler, ${h.title}, is most ${t.name.toLocaleLowerCase(locale())}, my lord. Before tribute day comes, put the gold into buildings, soldiers or orders.`),
        L(`Lordum, ${online.crowns[rival] ?? 'rakip taç'} haraççıları hazinenin payını ister; ${h.title} gibi ${t.name.toLocaleLowerCase('tr-TR')} bir hükümdarın haraççıları daha da çoğunu. Dolu kasa onların iştahını açar.`, `My lord, the tribute collectors of ${online.crowns[rival] ?? 'the rival crown'} take a share of the treasury; those of a ${t.name.toLocaleLowerCase(locale())} ruler like ${h.title} take even more. A full chest whets their appetite.`),
        L(`${h.title} hakkında bir söz dolaşıyor, lordum: "${t.name.toLocaleLowerCase('tr-TR')} hükümdarın haraççısı da açgözlü olur." Altını hazinede tutmak, onlara hazır sofra kurmaktır.`, `There's a saying about ${h.title}, my lord: "a ${t.name.toLocaleLowerCase(locale())} ruler has greedy tribute collectors." Keeping gold in the treasury is laying the table for them.`),
        L(`Lordum, haraççılar yarım saatte bir gelir ve hazinenin payını alır. ${h.title} tahtta oldukça bu pay büyük; altını işe koşalım, kasada uyutmayalım.`, `My lord, the tribute collectors come every half hour and take their share of the treasury. While ${h.title} sits on the throne that share is large; let's put the gold to work, not let it sleep in the chest.`),
      ]
    },
    go: { label: L('Krallık bölümü', 'Kingdom section'), act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      [L('Altını gömerim', "I'll bury the gold"), L('Gömdünüz mü, lordum? Bahçıvan buldu, sayıp hazineye geri koydu. Dürüst adam, ne yazık ki; bu sarayda bu huy bulaşıcı değil, merak etmeyin.', "Did you bury it, my lord? The gardener found it, counted it and put it back in the treasury. An honest man, sadly; but don't worry, it isn't catching in this palace.")],
      [L('Hükümdara bir mektup yazarım', "I'll write to the ruler"), L('Yazdım, lordum, çok ağlamaklı. Cevabında "haraç az" diyor. Mektubu bir daha yazmayalım; her mektupta zam geliyor.', 'I did, my lord, a most tearful one. The reply says "the tribute is too low". Let us not write again; every letter brings a price rise.')],
      [L('Haraççıları kapıda oyalarım', "I'll stall the collectors at the gate"), L('Oyalamayı ben de denedim, lordum; beş dakika sonra haraç kendiliğinden ödendi, üstüne fazlası.', 'I tried stalling them too, my lord; five minutes later the tribute paid itself, with extra on top.')],
      [L('Ne kadar isterlerse isterler', 'Let them ask what they like'), L('İsterler, lordum, ama alamadıklarını alamazlar. Boş kasa en iyi kalkandır.', "Ask they will, my lord, but they can't take what isn't there. An empty chest is the best shield.")],
    ],
    snooze: 90,
  },
  {
    id: 'kinSour',
    when: ({ kingdom: k, now }) => !k.pretender && !!k.dynasty && siblingsOf(k.dynasty).some((p) => hasOpinion(p, now) && opinionOf(k, p, now).ruler < balance.dynasty.intrigue.opinion.warn),
    say: ({ kingdom: k, now }) => {
      const p = siblingsOf(k.dynasty!).filter((x) => hasOpinion(x, now)).sort((a, b) => opinionOf(k, a, now).ruler - opinionOf(k, b, now).ruler)[0]
      return [
        L(`Kardeşiniz ${p.name} sofrada size hiç bakmıyor, lordum; ama tahtınıza çok bakıyor, ölçü alır gibi. Bir görev ya da küçük bir hediye gönlünü alır; yoksa bir gün asker toplayıp tahtınızı ister.`, `Your brother ${p.name} never looks at you at table, my lord; but he looks at your throne a great deal, as if taking its measurements. A post or a small gift would win him over; otherwise one day he'll raise soldiers and come for your throne.`),
        L(`Lordum, ${p.name} saray kapısında fısıldaşıyor. Hoşnutsuz bir kardeş en tehlikeli düşmandır: ona bir kasabanın valiliğini verin ya da hazineden bir kese yollayın.`, `My lord, ${p.name} is whispering at the palace gate. A discontented brother is the most dangerous enemy: give him a town's governorship or send a purse from the treasury.`),
        L(`${p.name} ava çıktı, lordum, ama av yerine askerlerle konuştuğunu gördüm. Gönlü soğuk bir kardeş bir gün karargâh kurar; bir görev ya da hediye, şimdiden.`, `${p.name} went hunting, my lord, but I saw him chatting with soldiers rather than chasing game. A cold-hearted brother sets up a camp one day; a post or a gift, now.`),
        L(`Lordum, ${p.name} sizin sağlığınıza kadeh kaldırmayı unuttu; dün de, önceki gün de. Bir hediye kesesi hafızasını tazeler.`, `My lord, ${p.name} forgot to toast your health; yesterday, and the day before. A purse as a gift would refresh his memory.`),
        L(`Saray kulağı fısıldıyor, lordum: ${p.name} memnun değil. İşsiz kardeş kötü fikir üretir; ona bir görev verin, meşgul olsun.`, `The palace walls have ears, my lord, and they whisper: ${p.name} is unhappy. An idle brother breeds bad ideas; give him a post to keep him busy.`),
      ]
    },
    go: { label: L('Hanedana bak', 'Look at the dynasty'), act: tab('kingdom', 'palace', 'house') },
    jokes: [
      [L('Kardeşimden korkmam', "I don't fear my brother"), L('Korkmayın, lordum; ama yatağınızın altına bakmayı da ihmal etmeyin. Ben her gece bakıyorum; bir kez bir kedi çıktı, iki gün konuşamadım.', "Don't, my lord; but don't neglect to check under your bed. I check every night; once a cat jumped out and I couldn't speak for two days.")],
      [L('Çocukken iyi anlaşırdık', 'We got on well as children'), L('O zaman taht yoktu, lordum, yalnızca tahta at vardı. Onu da hep siz binerdiniz; o hatırlıyor. Kardeşler unutmaz, özellikle tahta atları.', "There was no throne then, my lord, only a rocking horse. And you always rode it; he remembers. Brothers never forget, especially rocking horses.")],
      [L('Ona bir şiir yazayım', "I'll write him a poem"), L('Şiir güzel, lordum; ama kardeşiniz şiir okumaz, kese sayar. Keseye bir dörtlük yazın, olsun.', "Poetry is lovely, my lord; but your brother doesn't read poems, he counts purses. Write a quatrain on a purse, that'll do.")],
      [L('Elçi efendi onu yatıştırsın', 'Let master envoy calm him down'), L('Denedim, lordum; bir saat konuştum. Sonunda o da yatıştı, ben de; ikimiz de uyuyakaldık.', 'I tried, my lord; I talked for an hour. In the end he calmed down, and so did I; we both fell asleep.')],
    ],
  },
  {
    id: 'princess',
    when: ({ kingdom: k, now }) => !!k.dynasty && palaceLevel(k, now) >= 2 && [...k.dynasty.children, ...siblingsOf(k.dynasty)].some((p) => p.sex === 'f' && ofAge(p, now)),
    say: () => {
      const m = balance.dynasty.intrigue.marriage
      return [
        L(`Saraydaki prensesimiz evlenme çağında, lordum. Taca gelin verirsek taçla ilişkimiz +${m.crown.relation} artar; bir kasabaya verirsek kasaba sadık kalır, kimsenin olmayan bir kasaba ise kılıçsız bizim olur.`, `Our princess at court is of marrying age, my lord. Marry her into the crown and our relations with it rise by ${m.crown.relation}; marry her into a town and it stays loyal, and a town that belongs to no one becomes ours without a sword drawn.`),
        L(`Lordum, prensese talipler kapıda kuyruk oldu. Bir lorda gelin verirseniz ilişkiniz +${m.lord.relation} artar; taca ya da bir kasabaya vermek de akıllıca olur.`, `My lord, suitors for the princess are queuing at the gate. Marry her to a lord and your relations rise by ${m.lord.relation}; marrying her into the crown or a town would be wise too.`),
        L(`Saray terzisi yine gelinlik ölçüsü istiyor, lordum. Prenses evlenme çağında; taca verirsek ilişki +${m.crown.relation}, sahipsiz bir kasabaya verirsek kasaba kılıçsız bizim.`, `The court tailor wants wedding-gown measurements again, my lord. The princess is of marrying age; into the crown means relations +${m.crown.relation}, into an unclaimed town means the town is ours without a sword.`),
        L(`Lordum, bir prenses sarayda bir hazinedir, evlendirildiğinde ise bir ittifak; ayrıca mutfak masrafında da ciddi bir düşüş. Taç, kasaba ya da bir lordun hanedanı; her birinin ayrı bir kazancı var.`, `My lord, a princess is a treasure at court and an alliance once married; and a considerable saving on the kitchen bill besides. The crown, a town, or a lord's house; each has its own gain.`),
        L(`Prenses bahçede papatya falı bakıyor, lordum: "seviyor, sevmiyor". Kimin sevdiğini bilmiyoruz ama kimin işine yarayacağını biliyoruz: Hanedan bölümünde "Evlendir".`, `The princess is plucking daisy petals in the garden, my lord: "loves me, loves me not". We don't know who loves her, but we know whom she'd be useful to: "Marry off" in the Dynasty section.`),
      ]
    },
    go: { label: L('Hanedana bak', 'Look at the dynasty'), act: tab('kingdom', 'palace', 'house') },
    jokes: [
      [L('Kızım kimseyle evlenmez', "My daughter won't marry anyone"), L('O da öyle diyor, lordum; ama şövalye turnuvasında gözü birine takıldı. Şövalyenin değil, atının. Endişelenmeye başladım.', "So she says, my lord; but at the tournament her eye fell on someone. Not the knight; his horse. I'm beginning to worry.")],
      [L('Elçi efendi evlensin', 'Let master envoy marry'), L('Teşekkür ederim, lordum, ama ben kırk yıldır elçiliğe nişanlıyım. Kıskançtır; bir keresinde bir kontese gülümsedim, üç ay yağmurda mektup taşıttı.', 'Thank you, my lord, but I have been engaged to diplomacy for forty years. It is jealous; I once smiled at a countess and it had me carrying letters in the rain for three months.')],
      [L('Önce ben bir görüşeyim', "I'll meet them first"), L('Görüşün, lordum; ama damat adaylarını ben de gördüm. Çoğu sizden korkuyor; bu iyi bir işaret. Biri benden korkuyor; bu da çok hoşuma gitti.', "Do, my lord; but I've seen the candidates too. Most are afraid of you; a good sign. One is afraid of me; I liked that very much.")],
      [L('Çeyiz çok pahalı', 'A dowry is too expensive'), L('Pahalı, lordum; ama bir kasabayı kılıçsız almak bir ordudan ucuzdur. Düğün yemeğini de kasaba öder, gelenek.', 'Expensive, my lord; but taking a town without a sword is cheaper than an army. And the town pays for the wedding feast; tradition.')],
    ],
  },
  {
    id: 'barracks',
    when: (c) => unlocked(c, 'barracks') && count(c.kingdom, 'barracks') === 0,
    say: () => [
      L(`Bir kışlamız yok, lordum. Komşular şimdilik gülümsüyor ama gülümseme kılıç değildir; daha çok "yakında geliyoruz" gülümsemesi. Kışla mızrakçı, okçu ve daha fazlasını yetiştirir.`, `We have no barracks, my lord. The neighbours are smiling for now, but a smile is not a sword; it's more of a "we'll be along shortly" smile. Barracks train spearmen, archers and more.`),
      L(`Lordum, savunmamız şu an bir bekçi, bir köpek ve bendenizden ibaret. Bekçi uyuyor, köpek beni ısırıyor, ben de konuşuyorum. Bir kışla kurarsak mızrakçı, okçu, sonra süvari yetiştiririz.`, `My lord, our defence currently consists of one watchman, one dog and my humble self. The watchman sleeps, the dog bites me, and I talk. Build barracks and we can train spearmen, archers, and later cavalry.`),
      L(`Komşuların ordusu var, lordum; bizimkinin adı bile yok. Ben "Elçinin Lejyonu" diye bir ad önerdim, kimse gülmedi. Kışla, asker havuzundan mızrakçı ve okçu yetiştirir; 2. seviyede süvari de.`, `The neighbours have armies, my lord; ours doesn't even have a name. I suggested "The Envoy's Legion"; nobody laughed. Barracks train spearmen and archers from the manpower pool; cavalry too at level 2.`),
      L(`Barış uzun sürsün isterim, lordum; ama barışı en çok kılıcı olan sürdürür. Bir kışla kuralım: mızrakçı süvariyi, okçu mızrakçıyı yener.`, `I'd like the peace to last, my lord; but peace is kept longest by whoever has the most swords. Let's build barracks: spearmen beat cavalry, archers beat spearmen.`),
      L(`Haydutlar yollarda dolaşıyor, rakipler sınırları ölçüyor, lordum. Kışla olmadan tek asker yetiştiremeyiz; kasabalar da kendiliğinden fethedilmez.`, `Bandits roam the roads and rivals are measuring our borders, my lord. Without barracks we can't train a single soldier; and towns don't conquer themselves.`),
    ],
    go: { label: L('Kışla kur', 'Build barracks'), act: build('barracks') },
    jokes: [
      [L('Dostluk yeter', 'Friendship is enough'), L('Dostluk güzel, lordum; ama kapıyı çalan haydutlara dostluk şiiri okumayı denedim. Şiiri beğendiler, şapkamı da beğendiler; şapkayı aldılar.', 'Friendship is lovely, my lord; but I tried reading a poem on friendship to bandits at the door. They liked the poem, and they liked my hat; they took the hat.')],
      [L('Ben kendim dövüşürüm', "I'll fight myself"), L('Kılıcınızı aradım, lordum; duvarda süs olarak asılı, paslı ve bir örümcek ona yuva yapmış. Örümceği tahliye edemeyiz, kışla daha güvenli.', "I looked for your sword, my lord; it hangs on the wall as decoration, rusty, with a spider living in it. We can't evict the spider; barracks are safer.")],
      [L('Asker çok yer', 'Soldiers eat a lot'), L('Yer, lordum; her tur yemek ve maaş ister. Ama düşman daha çok yer: bütün ambarı, üstüne de tatlı olarak sarayı.', 'They do, my lord; food and pay every round. But an enemy eats more: the whole storehouse, with the palace for pudding.')],
      [L('Elçi efendi korur bizi', 'Master envoy will protect us'), L('Korurum, lordum, sözle. Düşman ok atınca söz biraz yavaş kalıyor; ben de onunla birlikte yavaş kaçıyorum.', 'I shall, my lord, with words. When the enemy looses arrows, words are a little slow; and I run away just as slowly.')],
    ],
  },
  {
    id: 'spyHouse',
    when: (c) => unlocked(c, 'spyHouse') && count(c.kingdom, 'spyHouse') === 0 && count(c.kingdom, 'barracks') > 0,
    say: () => [
      L(`Komşularımızın ne yaptığını hiç bilmiyoruz, lordum; ben yalnızca ne yediklerini biliyorum, o da aşçılar sayesinde. Bir casus evi kurarsak hem onları gözetleriz hem de onların casuslarını yakalarız.`, `We have no idea what our neighbours are up to, my lord; I only know what they eat, thanks to the cooks. Build a spy house and we can watch them and catch their spies.`),
      L(`Lordum, komşuların ambarında ne var, ordusu ne kadar, bilmiyoruz. Bir casus evi kurarsak öğreniriz; evde kalan casuslar da onlarınkini yakalar.`, `My lord, we don't know what's in the neighbours' storehouses or how big their armies are. A spy house would tell us; and spies kept at home catch theirs.`),
      L(`Bilgi kılıçtan keskindir, lordum. Casus evi casus yetiştirir: başkalarının malını, ordusunu, elçilerini gözetler. Evdeki casuslar karşı casusluk yapar.`, `Knowledge is sharper than a sword, my lord. A spy house trains spies: they watch others' goods, armies and envoys. Spies at home do counter-espionage.`),
      L(`Rakipler bizi gözetliyor olabilir, lordum; biz onları gözetlemiyoruz. Bu hiç adil değil. Bir casus evi kurarsak hem bakarız hem de bize bakanı yakalarız.`, `Our rivals may be watching us, my lord; we aren't watching them. Most unfair. Build a spy house and we can watch, and catch whoever watches us.`),
      L(`Lordum, söylentiye göre komşu lord bizim hazineyi saymış; biz onunkini sayamıyoruz. Casus evi bu dengesizliği düzeltir.`, `My lord, rumour has it the neighbouring lord has counted our treasury; we can't count his. A spy house would fix that imbalance.`),
    ],
    go: { label: L('Casus evi kur', 'Build a spy house'), act: build('spyHouse') },
    jokes: [
      [L('Ben her şeyi duyarım', 'I hear everything'), L('Duyduğunuz, lordum, mutfaktaki aşçının dedikoduları. Gerçek casuslar daha az konuşur; o yüzden ben casus olamadım.', "What you hear, my lord, is the cook's gossip in the kitchen. Real spies talk less; which is why I never became one.")],
      [L('Kapıları dinlerim', 'I listen at doors'), L('Saray kapılarını dinlediğinizi biliyorum, lordum; geçen gün aşçıyla beni duydunuz. Konuştuğumuz şey sizin bıyığınız değildi, yemin ederim. Komşunun kapısı biraz uzakta ama.', "I know you listen at the palace doors, my lord; you overheard the cook and me the other day. We were not discussing your moustache, I swear. The neighbour's door is a bit far, though.")],
      [L('Casusluk ayıptır', 'Spying is shameful'), L('Ayıptır, lordum; o yüzden kimseye söylemeyiz. Ben de söylemem. Belki birine. En fazla üç kişiye.', "Shameful, my lord; which is why we tell no one. I won't tell. Perhaps one person. Three at most.")],
      [L('Komşular dürüst insanlar', 'The neighbours are honest folk'), L('Komşular da bizim için öyle diyor, lordum. Ben ikinize de inanmıyorum; elçiliğin ilk kuralı.', "The neighbours say the same of us, my lord. I believe neither of you; the first rule of diplomacy.")],
    ],
  },
  {
    id: 'market',
    when: (c) => unlocked(c, 'market') && count(c.kingdom, 'market') === 0 && count(c.kingdom, 'barracks') + count(c.kingdom, 'spyHouse') > 0,
    say: () => [
      L(`Pazarımız yok, lordum. Pazar, eksik malı altınla satın almaya yarar; bir gün savaş malzemesi bitince bana teşekkür edersiniz. Teşekkürü altınla da yapabilirsiniz, ayıp değil.`, `We have no market, my lord. A market lets you buy what you lack with gold; the day war materials run out, you'll thank me. You may thank me in gold, too; there's no shame in it.`),
      L(`Lordum, bir mal eksik kalınca pazar yoksa beklemekten başka çare kalmaz. Pazar, eksik malı altınla almanızı sağlar; her alınan birim bir sonrakini biraz pahalandırır.`, `My lord, when a good runs short and there's no market, all we can do is wait. A market lets you buy it with gold; each unit bought makes the next a little dearer.`),
      L(`Pazarımız yok, lordum; altınımız var ama altın yenmez. Pazar kurarsak yemek, yapı ve savaş malzemesini lobi fiyatının biraz üstüne alırız.`, `We have no market, my lord; we have gold, but gold isn't edible. With a market we can buy food, building and war materials at a little above the lobby price.`),
      L(`Hazinede altın, ambarda boşluk, lordum: bu ikisini buluşturan yere pazar denir. Kuralım; eksik mal için üretimi beklemeyiz.`, `Gold in the treasury, empty space in the storehouse, my lord: the place that brings them together is called a market. Let's build one; then we needn't wait on production for what we lack.`),
      L(`Lordum, savaşın ortasında savaş malzemesi biterse ne yapacağız? Pazar olursa altınla alırız. Ben her zaman önceden düşünürüm; bu yüzden hâlâ hayattayım.`, `My lord, what if war materials run out in the middle of a war? With a market we buy them with gold. I always think ahead; which is why I'm still alive.`),
    ],
    go: { label: L('Pazar kur', 'Build a market'), act: build('market') },
    jokes: [
      [L('Takasla idare ederiz', "We'll manage with barter"), L('Takası denedim, lordum; bir keçiye üç tavuk istediler. Tavukları verdim, keçi bana kafa attı. Altın daha kolay.', 'I tried bartering, my lord; they wanted three hens for a goat. I gave the hens; the goat headbutted me. Gold is easier.')],
      [L('Pazarlık sevmem', "I don't like haggling"), L('Pazarda pazarlık yok, lordum; fiyat bellidir. Ben de çok üzüldüm; hayatımın tek sporu pazarlıktı.', "There's no haggling at the market, my lord; prices are fixed. I was heartbroken; haggling was the only sport I ever played.")],
      [L('Her şeyi kendimiz üretiriz', "We'll make everything ourselves"), L('Güzel bir hayal, lordum; ama bazen tarla yetmez, bazen orman. O gün pazar lazım.', 'A lovely dream, my lord; but sometimes the farms fall short, sometimes the forest. That day, we need a market.')],
      [L('Pazar çok kalabalık olur', 'Markets get crowded'), L('Olur, lordum; ben de kalabalığın içinde söylentileri toplarım. Bir taşla iki kuş.', 'They do, my lord; and I gather rumours in the crowd. Two birds, one stone.')],
    ],
  },
  {
    id: 'warehouse',
    when: (c) => unlocked(c, 'warehouse') && count(c.kingdom, 'warehouse') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: ({ kingdom: k, now }) => {
      const cap = n(storageCap(k, now))
      return [
        L(`Ambarlarımız yalnızca ${cap} birim tutuyor, lordum. Bir ambar, her maldan çok daha fazlasını saklar; fareler de sevinir, hatta kurdele kesmeye gelirler, ama onları saymayalım.`, `Our stores hold only ${cap} units, my lord. A storehouse keeps far more of every good; the rats will be delighted too, they'll even come to cut the ribbon, but let's not count them.`),
        L(`Lordum, depomuz her maldan yalnızca ${cap} birim alıyor; fazlası boşa gidiyor. Bir ambar kurarsak depo sınırı büyür.`, `My lord, our stores take only ${cap} units of each good; the rest is wasted. Build a storehouse and the storage limit grows.`),
        L(`Depo sınırımız ${cap}, lordum; iyi bir hasatta çabucak dolar. Bir ambar, yani güzel kırmızı bir ahır, her maldan çok daha fazlasını saklar.`, `Our storage limit is ${cap}, my lord; a good harvest fills it fast. A storehouse, a fine red barn, keeps far more of every good.`),
        L(`Her maldan ${cap} birim, lordum; o kadar. Ambar kurarsak bu sınır büyür, mallar boşa gitmez, ben de geceleri rahat uyurum.`, `${cap} units of each good, my lord; that's all. Build a storehouse and the limit grows, nothing goes to waste, and I sleep soundly at night.`),
        L(`Lordum, ambarcı dert yanıyor: her maldan ${cap} birimden fazlasına yer yok. Bir ambar ve sonra yükseltmeleri, daha çok yer demek.`, `My lord, the storekeeper is complaining: no room for more than ${cap} units of anything. A storehouse, and then its upgrades, means more room.`),
      ]
    },
    go: { label: L('Ambar kur', 'Build a storehouse'), act: build('warehouse') },
    jokes: [
      [L('Fazlasını yeriz', "We'll eat the surplus"), L('Siz yersiniz, lordum, ben de yerim, hem de seve seve; ama yapı malzemesini yemek zor. Bir keresinde bir tahta kaşığı ısırdım, iyi bir fikir değildi.', "You'll eat, my lord, and so will I, with pleasure; but building materials are hard to eat. I once bit a wooden spoon; not a good idea.")],
      [L('Sarayın bodrumu yeter', "The palace cellar will do"), L('Bodrum şarap fıçılarıyla dolu, lordum; onlara dokunmayalım. Onlar benim... yani sarayın.', "The cellar is full of wine barrels, my lord; let's not touch those. They are my... I mean, the palace's.")],
      [L('Kırmızı sevmem', "I don't like red"), L('Ambar kırmızı olur, lordum, gelenek. İsterseniz ben arkamı dönüp bakmam; zaten gözlüksüz her şey pembe görünüyor.', "Storehouses are red, my lord; tradition. If you like, I'll turn my back and not look; without my spectacles everything looks pink anyway.")],
      [L('Fareler ne der?', 'What will the rats say?'), L('Fareler alkışlar, lordum; ama neyse ki fareler oy vermez. Verseydi şimdiye ambar başkanı seçilirlerdi.', "The rats will applaud, my lord; luckily rats don't vote. If they did they'd have been elected storehouse wardens by now.")],
    ],
  },
  {
    id: 'wall',
    when: (c) => unlocked(c, 'wall') && count(c.kingdom, 'wall') === 0 && palaceLevel(c.kingdom, c.now) >= 2,
    say: () => [
      L(`Lordum, sarayın çevresinde tek bir taş sur yok. Surlar kuşatmada savunmayı güçlendirir. Bir sur kapısı koymayı unutmayın; yoksa halkı içeri kilitler, kendinize hapishane yaparsınız.`, `My lord, there isn't a single stone of wall around the palace. Walls strengthen the defence in a siege. Don't forget a gate; otherwise you lock the people in and build yourself a prison.`),
      L(`Lordum, sarayımızı hiçbir sur korumuyor; düşman ordusu kapıya kadar yürüyebilir. Surlar kuşatmada savunmayı güçlendirir. Ama bir sur kapısı koyun; yoksa halk dışarı çıkamaz.`, `My lord, no wall protects our palace; an enemy army can march right up to the door. Walls strengthen the defence in a siege. But put in a gate, or the people can't get out.`),
      L(`Taş taş üstüne, lordum: surlar kuşatmada sarayı korur. Yalnız bir uyarı: sarayı kapısız çevirirseniz halkı içeri kilitler, kendinize bir hapishane kurarsınız.`, `Stone upon stone, my lord: walls protect the palace in a siege. One warning: wall the palace in without a gate and you lock the people inside and build yourself a prison.`),
      L(`Bir saray, surları kadar sağlamdır, lordum. Sur çekelim; köylüler ve tüccar yalnızca kapıdan geçer, o yüzden bir sur kapısı şart.`, `A palace is only as strong as its walls, my lord. Let's build some; villagers and the merchant pass only through gates, so a gate is a must.`),
      L(`Lordum, rakip lordun casusu surlarımızı saymaya geldi ve sıfırda kaldı. Biraz sur çekelim; kuşatmada fark eder. Kapıyı unutursak halk dışarı çıkamaz, söyleyeyim.`, `My lord, the rival lord's spy came to count our walls and got as far as zero. Let's build a few; it matters in a siege. Forget the gate and the people can't get out, mind.`),
    ],
    go: { label: L('Sur çekelim', "Let's build walls"), act: build('wall') },
    jokes: [
      [L('Düşman kibar olur', 'The enemy will be polite'), L('Düşman çok kibardır, lordum; kapınızı kırmadan önce mutlaka "affedersiniz" der. Kırdıktan sonra da "pardon" der; terbiyeli insanlar.', 'The enemy is very polite, my lord; before breaking down your door they always say "excuse me". And afterwards "pardon"; well-bred people.')],
      [L('Kapım herkese açık', 'My door is open to all'), L('Misafirperversiniz, lordum; düşman da bunu çok sever. Ayakkabılarını da çıkarmazlar.', "So hospitable, my lord; the enemy loves that. And they never take their boots off.")],
      [L('Surlar manzarayı kapatır', 'Walls block the view'), L('Manzarayı kuleden seyredersiniz, lordum; düşman ise surları dışarıdan seyreder. Herkes seyirci, kimse kaybetmez.', "You'll admire the view from the tower, my lord; the enemy will admire the walls from outside. Everyone's a spectator, nobody loses.")],
      [L('Okçularım yeter', 'My archers will do'), L('Okçular da bir duvarın arkasında durmayı sever, lordum; açıkta pek cesur olmazlar. Ben de öyleyim, o yüzden onları anlıyorum.', "Archers like standing behind a wall too, my lord; they aren't very brave in the open. Neither am I, so I understand them.")],
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
      L(`Evlerin hepsi dolu, lordum; gelmek isteyen köylüler kapıda bekliyor, ellerinde tavukları. Tavuklar da sabırsız. Bir ev daha kurarsak halk büyür, vergi artar.`, `Every house is full, my lord; villagers who want to move in are waiting at the gate, chickens in hand. The chickens are impatient too. Build another house and the people grow, and so does the tax.`),
      L(`Lordum, her ev ağzına kadar dolu; yeni köylüler yer bulamadan kapıda bekliyor. Bir ev daha, daha çok halk ve vergi demek.`, `My lord, every house is packed; new villagers wait at the gate with nowhere to go. Another house means more people and more tax.`),
      L(`Evlerde boş bir yatak bile kalmadı, lordum. Köylüler yalnızca yer olunca gelir; bir ev kuralım ya da var olanı yükseltelim.`, `There isn't a spare bed left in any house, my lord. Villagers only come when there's room; let's build a house or upgrade one.`),
      L(`Halk büyümek istiyor ama sığacak yer yok, lordum. Ev kurmak ya da evleri yükseltmek, büyümenin yolu.`, `The people want to grow, but there's no room, my lord. Building or upgrading houses is the way to grow.`),
      L(`Lordum, nüfus sınırına daha var ama evler dolu. Yeni bir ev açarsak köylüler zamanla gelir; gelenler çalışır ve vergi öder.`, `My lord, we're short of the population limit, but the houses are full. Open a new house and villagers come in time; and those who come work and pay taxes.`),
    ],
    go: { label: L('Ev kur', 'Build a house'), act: build('house') },
    jokes: [
      [L('Çadır kursunlar', 'Let them pitch tents'), L('Çadır kurdular, lordum. Rüzgâr esti, şimdi komşu lordun tarlasındalar ve ona vergi veriyorlar. Rüzgâr da hain çıktı.', "They did, my lord. The wind blew, and now they're in the neighbouring lord's field paying him taxes. The wind turned traitor.")],
      [L('Üst üste yatsınlar', 'Let them sleep in stacks'), L('Yattılar, lordum; en alttaki itiraz etti, şimdi o da kapıda. En üstteki ise tavana yapıştı, onu hâlâ indiremedik.', "They did, my lord; the one at the bottom objected and now he's at the gate too. The one on top got stuck to the ceiling; we still haven't got him down.")],
      [L('Saraya alalım', "Let's take them into the palace"), L('Saray hizmetlileri buna razı değil, lordum; sizin yatağınızı da paylaşmaları gerekirdi. Ben razıyım ama, benim yatağım dar.', "The palace servants won't have it, my lord; they'd have to share your bed too. I'd agree, but my bed is narrow.")],
      [L('Kalabalıktan hoşlanmam', "I don't like crowds"), L('Siz hoşlanmazsınız, lordum; hazine bayılır. Her köylü vergi demek; her vergi de benim maaşım demek. Lütfen kalabalık olsun.', "You may not, my lord; the treasury adores them. Every villager means tax, and every tax means my salary. Crowds, please.")],
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
        L(`${idle} köylü boş oturuyor, lordum; meydanda zar atıp bir de bana hile yaptılar. İşe koşalım: bir tarla, oduncu ya da atölye.`, `${idle} villagers are sitting idle, my lord; they play dice in the square, and cheated me too. Let's put them to work: a farm, a lumber camp or a workshop.`),
        L(`Lordum, ${idle} köylünün işi yok; çeşme başında dedikodu yapıyorlar, konu da genellikle ben. Bir tarla, oduncu kampı ya da atölye kuralım.`, `My lord, ${idle} villagers have no work; they gossip at the fountain, usually about me. Let's build a farm, a lumber camp or a workshop.`),
        L(`Boşta ${idle} köylü var, lordum. Vergilerini veriyorlar ama bir şey üretmiyorlar; dün bir koro kurdular, bugün bir tiyatro. Yarın sendika kurarlar. Bir yapıya verirsek ambar da dolar; İnşa menüsünde onlara iş bulalım.`, `There are ${idle} idle villagers, my lord. They pay their taxes but produce nothing; yesterday they formed a choir, today a theatre troupe. Tomorrow, a union. Put them in a building and the storehouse fills too; let's find them work in the Build menu.`),
        L(`${idle} köylü gölgede uzanmış, lordum; ben geçerken bir de ayaklarını uzattılar. Bir tarla, bir oduncu ya da bir silah atölyesi onları ayağa kaldırır.`, `${idle} villagers lie in the shade, my lord; as I passed they stretched their legs out in front of me. A farm, a lumber camp or a weapon workshop would get them on their feet.`),
        L(`Lordum, ${idle} çift el boşta duruyor. Yeni bir yapı kurarsak ya da var olanları yükseltirsek hepsine iş çıkar.`, `My lord, ${idle} pairs of hands are idle. Build something new or upgrade what we have, and there'll be work for all.`),
      ]
    },
    go: { label: L('İnşa menüsü', 'Build menu'), act: tab('build') },
    jokes: [
      [L('Onlar da dinlensin', 'Let them rest too'), L('Dinlendiler, lordum; dinlenmekten yoruldular, şimdi dinlenmeden dinleniyorlar. İşe vermek iyilik olur.', "They've rested, my lord; they're tired of resting, and now they rest from resting. Work would be a kindness.")],
      [L('Sana nasıl hile yaptılar?', 'How did they cheat you?'), L('Altı attım, lordum, zarda yedi çıktı. Nasıl yaptıklarını hâlâ çözemedim; şapkamı da kaybettim, cebimdeki son simidi de.', 'I rolled a six, my lord, and the die showed seven. I still have no idea how; I lost my hat, and the last bread ring in my pocket.')],
      [L('Zar oynamayı ben de severim', 'I like dice too'), L('Sizinle oynamazlar, lordum; vergiyi kimin topladığını biliyorlar. Kazansanız da kaybetseniz de sonunda onlar öder.', "They won't play with you, my lord; they know who collects the taxes. Win or lose, in the end they pay.")],
      [L('İşsizlik geçicidir', 'Idleness is temporary'), L('Her şey geçicidir, lordum; ben hariç. Ben kalıcıyım, sizi de, sizden sonrakini de bekleyeceğim. Ama bir tarla bu geçiciliği hızlandırır.', "Everything is temporary, my lord; except me. I am permanent; I shall outlast you and your successor. But a farm would speed up the temporariness.")],
    ],
  },
  {
    id: 'tired',
    when: ({ kingdom: k }) => !!k.nightShift && (k.fatigue ?? 0) > balance.society.night.maxFatigue * 0.5,
    say: () => [
      L(`Gece mesaisi halkı yordu, lordum. Dün bir köylü ineği sağarken uyudu, inek de onu sağmaya başladı. Yorgunluk gündüz dahil bütün üretimi azaltıyor. Bir süre kapatsak, köylüler uyusa?`, `The night shift has worn the people out, my lord. Yesterday a villager fell asleep milking a cow, and the cow started milking him. Fatigue cuts all production, daytime included. Shall we stop it a while and let them sleep?`),
      L(`Lordum, köylüler ayakta uyuyor; biri dün gece tarlada horladı. Gece mesaisinin yorgunluğu gündüz üretimini de düşürüyor. Mesaiyi bir süre kapatalım mı?`, `My lord, the villagers are sleeping on their feet; one snored in the field last night. The night shift's fatigue lowers daytime production too. Shall we switch it off for a while?`),
      L(`Gece de çalışmak güzel, lordum, ama yorgunluk birikti ve şimdi bütün üretimi yavaşlatıyor. Mesai kapalıyken yorgunluk yavaşça geçer.`, `Working nights is all very well, my lord, but fatigue has built up and now slows all production. With the shift off, fatigue slowly fades.`),
      L(`Halkın göz altları mor, lordum. Gece mesaisi mutluluğu düşürür, yorgunluk da gündüz verimini yer. Biraz uyusunlar, sonra yine açarsınız.`, `The people have purple bags under their eyes, my lord. The night shift lowers happiness, and fatigue eats into daytime output. Let them sleep a little; you can turn it on again later.`),
      L(`Lordum, çok konuşsam da ben bile gece uyurum. Halkın yorgunluğu yarıyı geçti, üretim düşüyor. Gece mesaisine bir mola verelim.`, `My lord, talk as I may, even I sleep at night. The people's fatigue is past half and production is falling. Let's give the night shift a rest.`),
    ],
    go: { label: L('Halk sekmesi', 'People tab'), act: tab('people', 'people', 'mood') },
    jokes: [
      [L('Uyku tembellere göre', 'Sleep is for the lazy'), L('Tembeller de üretmez, lordum, yorgunlar da. Hiç değilse tembeller mutlu; ben ikisini birden beceriyorum.', "The lazy don't produce, my lord, and nor do the tired. At least the lazy are happy; I manage both at once.")],
      [L('Bir gece daha', 'One more night'), L('Bir gece daha, bir gece daha... Lordum, bu söz bir hanedanın sonunu getirdi; kitaplarda yazıyor. Kitabı da gece yazmışlar, okunmuyor.', "One more night, one more night... My lord, those words ended a dynasty; it's in the books. They wrote the book at night too; it's illegible.")],
      [L('Ben de yorgunum', "I'm tired too"), L('Siz tahtta yoruldunuz, lordum; onlar tarlada. Yine de ikinize de uyku iyi gelir.', "You tired yourself on the throne, my lord; they in the fields. Still, sleep would do you both good.")],
      [L('Çalışmak sağlıktır', 'Work is healthy'), L('Sağlıktır, lordum, ölçüsünde. Ölçüsüzü hastaneye gider.', 'Healthy, my lord, in moderation. Without moderation it leads to the hospital.')],
    ],
  },
  {
    id: 'unhappy',
    when: ({ kingdom: k }) => hasPalace(k) && (k.happiness ?? 100) < 35,
    say: ({ kingdom: k }) => {
      const h = n(k.happiness ?? 0)
      return [
        L(`Halkın mutluluğu %${h}, lordum. Ben bu sayıyı söyleyip kaçmayı düşünüyordum, ama dizlerim izin vermedi. Mutsuz halk yavaş büyür, kaçar ve askere yazılmaz. Vergiyi düşürmek, bir tapınak ya da kraliçe çare olabilir.`, `The people's happiness is ${h}%, my lord. I meant to say the number and run, but my knees wouldn't allow it. Unhappy people grow slowly, flee, and won't enlist. Lowering taxes, a temple or a queen might help.`),
        L(`Halkın yüzü gülmüyor, lordum: mutluluk %${h}. Mutsuz halk yavaş büyür, göç eder ve askere yazılmaz. Vergiyi düşürmek, tapınak ya da kraliçe yardımcı olur.`, `Not a smile among the people, my lord: happiness ${h}%. Unhappy people grow slowly, move away and won't enlist. Lower taxes, a temple or a queen would help.`),
        L(`Lordum, meydanda adınıza bir şarkı yakmışlar; nakaratı pek hoş değil. Mutluluk %${h}. Vergiyi hafifletirsek, kraliçe getirirsek ya da bir tapınak kurarsak düzelir.`, `My lord, they've made up a song about you in the square; the chorus is not flattering. Happiness ${h}%. Lighter taxes, a queen or a temple would mend it.`),
        L(`Mutluluk %${h}, lordum; bu sayı bir lordun uykusunu kaçırmalı. Mutsuz halk daha az asker olur ve kaçar. Halk sekmesinde nedenleri yazıyor; bir bakalım.`, `Happiness ${h}%, my lord; a number that should cost a lord his sleep. Unhappy people make fewer soldiers and run away. The People tab lists the reasons; let's look.`),
        L(`Köylüler bana selam vermeyi bıraktı, lordum; mutluluk %${h}. Ağır vergi, açlık, kraliçesizlik ya da gece mesaisi olabilir. Halk sekmesinde hepsini görürüz.`, `The villagers have stopped greeting me, my lord; happiness ${h}%. It could be heavy tax, hunger, no queen, or the night shift. The People tab shows it all.`),
      ]
    },
    go: { label: L('Mutluluğa bak', 'Check happiness'), act: tab('people', 'people', 'mood') },
    jokes: [
      [L('Gülmeyi yasaklayalım', "Let's ban laughing"), L('Yasakladık, lordum; şimdi gizlice gülüyorlar, hem de bize. Daha da mutsuz oldular, ama eğleniyorlar.', "We did, my lord; now they laugh in secret, and at us. They're unhappier than ever, but having fun.")],
      [L('Ozan çağıralım', "Let's call a minstrel"), L('Çağırdım, lordum; ozan da mutsuzmuş. Şimdi hüzünlü şarkılar söylüyor; halk ağlıyor, ben ağlıyorum, ozan ücret istiyor.', "I did, my lord; the minstrel is unhappy too. Now he sings sad songs; the people weep, I weep, and the minstrel wants his fee.")],
      [L('Mutluluk abartılıyor', 'Happiness is overrated'), L('Abartılıyor olabilir, lordum; ama göç abartılmıyor, gerçekten gidiyorlar. Giderken el sallamıyorlar bile.', "It may be, my lord; but leaving isn't overrated, they really do go. They don't even wave.")],
      [L('Ben mutluyum ama', "But I'm happy"), L('Size ne kadar sevindiğimi bilemezsiniz, lordum; ama mutsuz halk vergi verecek kadar kalmaz. Sonra sizin mutluluğunuz da vergiden gelir.', "You can't imagine how glad I am, my lord; but unhappy people don't stay long enough to pay taxes. And your happiness comes from taxes too.")],
    ],
  },
  {
    id: 'sick',
    when: (c) => (c.kingdom.sickness ?? 0) > 0.15 && unlocked(c, 'hospital') && count(c.kingdom, 'hospital') === 0,
    say: ({ kingdom: k }) => {
      const p = pct(k.sickness ?? 0)
      return [
        L(`Halkın ${p} hasta, lordum. Hasta köylü çalışmaz, vergi vermez, bir de herkese hastalığını anlatır; bana üç kez anlattılar. Bir hastane kurarsak doktorlar onları iyileştirir.`, `${p} of the people are sick, my lord. A sick villager doesn't work, doesn't pay tax, and describes his ailment to everyone; they've described it to me three times. Build a hospital and the doctors will heal them.`),
        L(`Lordum, halkın ${p} yatakta. Hasta köylü çalışmaz, vergi vermez, keyfi de kaçar. Hastane kurarsak doktorlar onları çok daha çabuk iyileştirir.`, `My lord, ${p} of the people are in bed. A sick villager doesn't work, pays no tax, and sulks. With a hospital the doctors heal them far faster.`),
        L(`Öksürük sesinden kendi sesimi duyamıyorum, lordum: halkın ${p} hasta. Hastanenin doktorları her tur hastaların bir payını iyileştirir.`, `I can't hear myself speak for the coughing, my lord: ${p} of the people are sick. A hospital's doctors heal a share of the sick every round.`),
        L(`Halkın ${p} hasta, lordum; kışın hastalık daha da hızlı yayılır. Bir hastane kuralım, köylüler tarlaya dönsün.`, `${p} of the people are sick, my lord; in winter sickness spreads even faster. Let's build a hospital and get the villagers back to the fields.`),
        L(`Lordum, şifacı kadın otlarıyla yetişemiyor: halkın ${p} hasta. Hastane olursa hem iyileşirler hem de işlerine dönerler.`, `My lord, the herb-woman can't keep up: ${p} of the people are sick. With a hospital they'd recover and get back to work.`),
      ]
    },
    go: { label: L('Hastane kur', 'Build a hospital'), act: build('hospital') },
    jokes: [
      [L('Sarımsak yesinler', 'Let them eat garlic'), L('Yediler, lordum; hâlâ hastalar ama artık kimse yanlarına yaklaşmıyor. Hastalık da yaklaşmıyor, bu yüzden biraz işe yaradı.', "They did, my lord; they're still sick, but now nobody goes near them. Nor does the sickness, so it helped a little.")],
      [L('Kendiliğinden geçer', "It'll pass by itself"), L('Geçer, lordum, yavaşça. Ama o yavaşlıkta ambar da yavaşça boşalır, ben de yavaşça yaşlanırım.', "It will, my lord, slowly. But at that pace the storehouse slowly empties, and I slowly age.")],
      [L('Ben hiç hastalanmam', 'I never fall ill'), L('Siz sarayda oturuyorsunuz, lordum; hastalık bile kapıda bekliyor, randevu almış. Ben söylemedim, kapıcı söyledi.', "You sit in the palace, my lord; even sickness waits at the door with an appointment. I didn't say so; the porter did.")],
      [L('Dua edelim', "Let's pray"), L('Ettim, lordum; cevap olarak içime "hastane" doğdu. Gökler de bürokrasi seviyor.', 'I did, my lord; the answer came to me as "hospital". Heaven loves bureaucracy too.')],
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
      const { taken, quest: q } = questProgress(c.kingdom, c.kingdom.liege!, c.now)
      const g = n(q.gold)
      const crown = c.online.crowns[c.kingdom.liege!] ?? L('Tacımız', 'Our crown')
      // The tasks of the wilds (bandits, pirates, havens) are told as what they are.
      if (!taken && q.kind === 'bandit')
        return [
          L(`${crown} yollarından şikâyetçi, lordum: yağmacı çetelerinden birini bu saat ortadan kaldırmamızı istiyor. Ödülü ${g} altın; bir orduyla çetenin önünü keselim mi?`, `${crown} is complaining about its roads, my lord: it wants one of the bandit bands done away with this hour. The reward is ${g} gold; shall we cut a band off with an army?`),
          L(`Lordum, ${crown} sarayından ulak geldi: "Yollarımızdaki çetelerden birini temizleyin." ${g} altın ve tacın gönlü, artı çetenin ganimeti. Fena pazarlık değil.`, `My lord, a messenger came from the court of ${crown}: "Clear one of the bands from our roads." ${g} gold and the crown's favour, plus the band's loot. Not a bad bargain.`),
          L(`Bir çete tüccarları soyuyor, ${crown} de bunu bizden bekliyor, lordum. Haritada bir çeteye tıklayın, bir ordu seçin; gerisini kılıçlar konuşur. Ödül ${g} altın.`, `A band is robbing merchants, and ${crown} expects us to deal with it, my lord. Click a band on the map, choose an army; the swords will do the talking. Reward: ${g} gold.`),
          L(`${crown} der ki: "Yolları temizleyen lord tacın gözüdür." Bu saat bir çete yenersek ${g} altın bizim, lordum.`, `${crown} says: "The lord who clears the roads is the apple of the crown's eye." Beat a band this hour and ${g} gold is ours, my lord.`),
          L(`Lordum, yağmacılara karşı bir görev var: ${crown} bir çetenin dağıtılmasını istiyor. Taçlar böyledir; kirli işi lordlara, alkışı kendilerine ayırır. Ordumuz hazırsa ${g} altın kapıda.`, `My lord, there's a task against the bandits: ${crown} wants a band scattered. Crowns are like that; the dirty work for lords, the applause for themselves. If our army is ready, ${g} gold is at the door.`),
          L(`Kervanlar ağlıyor, taçlar kızıyor, lordum. ${crown} bu saat bir yağmacı çetesinin başını istiyor; karşılığı ${g} altın.`, `The caravans weep, the crowns fume, my lord. ${crown} wants a bandit band's head this hour; for ${g} gold.`),
        ]
      if (!taken && q.kind === 'pirate')
        return [
          L(`${crown} göllerdeki korsanlardan bıkmış, lordum: bu saat bir korsan teknesi batırmamızı istiyor. Ödülü ${g} altın; kadırgalarımız boş durmasın.`, `${crown} is sick of the pirates on the lakes, my lord: it wants us to sink a pirate boat this hour. The reward is ${g} gold; let's not leave our galleys idle.`),
          L(`Lordum, tersanemizi duyan ${crown} bir iş gönderdi: bir korsan teknesini batırın. ${g} altın ve korsanın ambarı bizim olur.`, `My lord, ${crown} has heard of our shipyard and sent a job: sink a pirate boat. ${g} gold and the pirate's hold become ours.`),
          L(`Kara yelkenli bir tekne tacın kadırgalarını kızdırıyor, lordum. ${crown} onu dibe göndermemizi istiyor; ödül ${g} altın.`, `A black-sailed boat is vexing the crown's galleys, my lord. ${crown} wants it sent to the bottom; reward: ${g} gold.`),
          L(`Denizde iş var, lordum! ${crown} bir korsan teknesinin batırılmasını istiyor. Savaş gemili bir filoyla takip etmek yeter. Ben kıyıdan el sallarım; deniz tutuyor beni, kara bile tutuyor bazen.`, `There's work on the water, my lord! ${crown} wants a pirate boat sunk. A fleet with warships giving chase will do. I'll wave from the shore; I get seasick, sometimes even landsick.`),
          L(`${crown}: "Göllerimizde korsan istemiyoruz." Biz de istemiyoruz, lordum; üstelik ${g} altın veriyorlar.`, `${crown}: "We want no pirates on our lakes." Nor do we, my lord; and they're paying ${g} gold.`),
          L(`Lordum, bu saat taçtan bir korsan avı görevi var. Haritada bir korsan teknesine tıklayın, filoyu gönderin; ödül ${g} altın.`, `My lord, this hour the crown has a pirate-hunting task. Click a pirate boat on the map and send the fleet; reward: ${g} gold.`),
        ]
      if (!taken && q.kind === 'haven')
        return [
          L(`${crown} korsanların yuvasını hedef gösteriyor, lordum: bir korsan limanını ablukaya almamızı istiyor. Ödülü ${g} altın; liman boşaldıkça korsanlar da zayıflar.`, `${crown} points at the pirates' nest, my lord: it wants us to blockade a pirate haven. The reward is ${g} gold; as the haven empties, the pirates weaken.`),
          L(`Lordum, büyük bir iş: ${crown} bir korsan limanının kuşatılmasını istiyor. Limana tıklayın, savaş gemili bir filo seçin, "Ablukaya al" deyin. Ödül ${g} altın.`, `My lord, a big job: ${crown} wants a pirate haven besieged. Click the haven, choose a fleet with warships, say "Blockade". Reward: ${g} gold.`),
          L(`Korsanlar bir yerden çıkıyor, lordum, o yer de bir liman. ${crown} oranın ablukaya alınmasını istiyor; karşılığı ${g} altın ve tacın gönlü.`, `Pirates come from somewhere, my lord, and that somewhere is a haven. ${crown} wants it blockaded; for ${g} gold and the crown's favour.`),
          L(`${crown}: "Korsan limanını kuşatın, tekneleri yuvasında boğun." ${g} altın veriyorlar, lordum; muhafız çektirileri de cabası.`, `${crown}: "Besiege the pirate haven, drown the boats in their nest." They're paying ${g} gold, my lord; and the raiders guarding it come free.`),
          L(`Lordum, filomuza layık bir görev geldi: bir korsan limanını abluka. Ödül ${g} altın, şanı bedava.`, `My lord, a task worthy of our fleet: blockade a pirate haven. Reward: ${g} gold, glory free of charge.`),
          L(`Bir korsan limanı tacın uykusunu kaçırıyor, lordum. ${crown} oraya bir filo göndermemizi istiyor; ödül ${g} altın.`, `A pirate haven is costing the crown its sleep, my lord. ${crown} wants us to send a fleet there; reward: ${g} gold.`),
        ]
      return taken
        ? [
            L(`Tacımızın görevini bitirdik, lordum! ${g} altınlık ödül bizi bekliyor; taç unutkan değildir ama hazinedarı biraz öyledir, hele ödeme günleri.`, `We've finished our crown's task, my lord! A ${g} gold reward awaits; the crown never forgets, but its treasurer does, especially on paydays.`),
            L(`Lordum, tacın görevini tamamladık! ${g} altınlık ödülü saat dolmadan almalıyız. Taçların hafızası kısadır, özellikle borçlarında.`, `My lord, we've completed the crown's task! We must claim the ${g} gold reward before the hour is out. Crowns have short memories, especially for debts.`),
            L(`Görev bitti, lordum; ödül ${g} altın ve tacın gönlü. Diplomasi sekmesinde "Ödülü al" demeniz yeter.`, `The task is done, my lord; the reward is ${g} gold and the crown's favour. Just press "Claim reward" in the Diplomacy tab.`),
            L(`Tacın istediğini yaptık, lordum; şimdi karşılığını isteme sırası bizde: ${g} altın. Hazinede yer olduğundan emin olun.`, `We've done what the crown asked, my lord; now it's our turn to ask: ${g} gold. Make sure there's room in the treasury.`),
            L(`Lordum, taç sözünü tutar; biz de tuttuk. ${g} altınlık ödül bekliyor, unutmadan alalım.`, `My lord, the crown keeps its word; and so did we. A ${g} gold reward is waiting; let's claim it before we forget.`),
          ]
        : [
            L(`${crown} bu saat sizden bir iş istiyor; ödülü ${g} altın ve tacın gönlü. Tacın gönlü ağırdır, lordum, ama altını hafif. Görevi alalım mı?`, `${crown} wants a job done this hour; the reward is ${g} gold and the crown's favour. The crown's favour weighs heavy, my lord, but its gold is light. Shall we take the task?`),
            L(`${crown} bu saat için bir görev gönderdi, lordum; ulak o kadar hızlı geldi ki atını kapıda bıraktı, at hâlâ soluyor. Bitirirsek ${g} altın ve tacın gönlü bizim. Bir bakalım mı?`, `${crown} has sent a task for this hour, my lord; the messenger came so fast he left his horse at the gate, still panting. Finish it and ${g} gold and the crown's favour are ours. Shall we look?`),
            L(`Lordum, ${crown} sarayından bir ulak geldi: tacın bir isteği var. Ödülü ${g} altın; saat dolmadan bitirmek gerek.`, `My lord, a messenger came from the court of ${crown}: the crown has a request. The reward is ${g} gold; it must be done before the hour is out.`),
            L(`Taçlar iş verir, lordum, akıllı lordlar da iş alır. ${crown} bu saat ${g} altınlık bir görev sunuyor.`, `Crowns hand out work, my lord, and clever lords take it. ${crown} offers a ${g} gold task this hour.`),
            L(`${crown} sizi düşünüyor, lordum; taçlarda düşünmek görev demektir. Ödülü ${g} altın ve ilişkiye güzel bir dokunuş.`, `${crown} is thinking of you, my lord; with crowns, thinking means a task. The reward is ${g} gold and a nice boost to relations.`),
          ]
    },
    go: { label: L('Taç görevleri', 'Crown tasks'), act: tab('diplomacy', 'diplomacy', 'crowns') },
    jokes: [
      [L('Taç beklesin', 'Let the crown wait'), L('Bekler, lordum; ama görev saatliktir. Saat dolunca görev de gider, ulak da gider, at da gider. Ben kalırım, merak etmeyin.', "It will, my lord; but the task lasts an hour. When the hour is up the task goes, the messenger goes, the horse goes. I stay, don't worry.")],
      [L('Ödül az', 'The reward is small'), L('Az değil, lordum; altının yanında tacın gönlü de var. Gönül, uzun vadede çok altındır; kısa vadede ise hiç altın değildir, kabul.', "Not small, my lord; there's the crown's favour on top of the gold. In the long run favour is a lot of gold; in the short run it is no gold at all, I grant you.")],
      [L('Kimsenin hizmetkârı değilim', "I'm nobody's servant"), L('Değilsiniz, lordum; ama lordlar arada bir taçlarına yardım eder. Ben de size ederim, karşılıksız... neredeyse. Faturası ay sonunda gelir.', "You aren't, my lord; but lords help their crowns now and then. I help you too, for nothing... almost. The bill comes at the end of the month.")],
      [L('Ne istiyorlar ki?', 'What do they even want?'), L('Diplomasi sekmesinde yazıyor, lordum; ben anlatsam süslerim, üç sayfa sürer. Orada süssüz yazıyor, sıkıcı ama kısa.', "It's in the Diplomacy tab, my lord; if I told you I'd embellish it to three pages. There it's plain; dull but short.")],
    ],
    snooze: 30,
  },
  {
    id: 'town',
    when: ({ kingdom: k, online }) => (k.soldiers ?? 0) >= 10 && (k.towns?.length ?? 0) === 0 && online.towns.some((t) => t.owner === null),
    say: () => [
      L(`Lordum, haritada kimseye bağlı olmayan kasabalar var ve garnizonumuzda askerler esniyor. Bir ordu çıkarıp bir kasabayı kuşatırsak her turda bize katkı gönderir. Kasaba paneli "Kuşat" bölümünden başlar.`, `My lord, there are towns on the map that belong to no one, and the soldiers in our garrison are yawning. Field an army and besiege a town, and it sends us a contribution every round. It starts from the "Besiege" section of the town panel.`),
      L(`Lordum, garnizonda en az on asker var ve haritada sahipsiz kasabalar duruyor. Bir kasabaya tıklayıp "Kuşat" bölümünden ordu gönderirsek kasaba her tur bize katkı gönderir.`, `My lord, there are at least ten soldiers in the garrison and unclaimed towns on the map. Click a town and send an army from the "Besiege" section, and the town will send us a contribution every round.`),
      L(`Askerler talimden sıkıldı, lordum; sahipsiz bir kasaba onlara iyi gelir. Kuşatma kasaba panelinin "Kuşat" bölümünden başlar; alınan kasaba her tur bir şey gönderir.`, `The soldiers are bored of drill, my lord; an unclaimed town would do them good. A siege starts from the "Besiege" section of the town panel; a captured town sends something every round.`),
      L(`Haritada kimsenin olmayan kasabalar var, lordum; biri bizim olsa fena olmaz. Ama ölçülü! Çok kasaba aşırı büyüme cezası getirir. Kuşatma, kasaba panelindeki "Kuşat" bölümünden başlar.`, `There are towns on the map that belong to nobody, my lord; one of them could do worse than be ours. But in moderation! Too many towns bring the overreach penalty. A siege starts from the "Besiege" section of the town panel.`),
      L(`Lordum, garnizondaki askerler kılıçlarını parlatmaktan içinde kendilerini görür oldu. Sahipsiz bir kasabayı kuşatalım: kasaba panelinde "Kuşat", gerisi askerlerin işi.`, `My lord, the garrison has polished its swords until they can see their faces in them. Let's besiege an unclaimed town: "Besiege" in the town panel, and the rest is the soldiers' business.`),
    ],
    go: { label: L('Ordu sekmesi', 'Army tab'), act: tab('army', 'army', 'land') },
    jokes: [
      [L('Kasabalar kendiliğinden gelir', 'Towns will come to us'), L('Geldiler, lordum; ama vergi memurumuzu görünce geri döndüler. Koşarak. Biri kapıyı kilitledi.', 'They came, my lord; but saw our tax collector and turned back. At a run. One locked the gate.')],
      [L('Kasabalar barışçıdır', 'Towns are peaceful'), L('Barışçıdır, lordum; garnizonları dışında. Onlar biraz kaba; bana taş attılar, ben elçi olduğumu söyleyince bir tane daha attılar.', "Peaceful, my lord; apart from their garrisons. They're a bit rude; they threw a stone at me, and when I said I was an envoy, they threw another.")],
      [L('Askerler evde kalsın', 'Let the soldiers stay home'), L('Kalırlar, lordum; ama evdeki asker her tur maaş ve yemek ister, karşılığında yalnızca horlar. Hem de marş ritminde.', 'They will, my lord; but a soldier at home wants pay and food every round and only snores in return. In marching rhythm, no less.')],
      [L('Kasaba ne işime yarar?', 'What good is a town to me?'), L('Altın, yemek, malzeme ya da köylü gönderir, lordum; sıralamada da puan. Küçük ama tatlı bir lokma.', 'It sends gold, food, materials or villagers, my lord; and points on the rankings. A small but tasty morsel.')],
    ],
  },
  // ---- The wilds: bandits coming down, pirates on the water, the havens, the year's sickness, a journey ----------
  {
    id: 'raid',
    when: (c) => bandsOf(c.world, c.world.seed, c.online.outlaws).some((b) => outlawUp(b, c.now) && bandRaid(c.world, b, c.now)?.target === c.online.me),
    say: (c) => {
      const band = bandsOf(c.world, c.world.seed, c.online.outlaws).find((b) => outlawUp(b, c.now) && bandRaid(c.world, b, c.now)?.target === c.online.me)!
      const leg = bandRaid(c.world, band, c.now)!.leg
      const name = band.name
      return leg === 'go'
        ? [
            L(`Lordum, gözcüler bağırıyor: ${name} yolundan ayrıldı, ticaret noktamıza doğru iniyor! Bir ordu çıkarıp önünü kesersek ganimet de bizim olur.`, `My lord, the lookouts are shouting: ${name} has left its road and is coming down on our trading post! Field an army and cut it off, and the loot is ours too.`),
            L(`${name} bize geliyor, lordum. Tüccarımız şimdiden develeri saklamaya başladı; ben de şapkamı. Bir orduyla karşılayalım mı?`, `${name} is coming for us, my lord. Our merchant has already started hiding the camels; I'm hiding my hat. Shall we meet them with an army?`),
            L(`Lordum, yağmacılar kokuyu almış: ${name} ticaret noktamıza baskına geliyor. Haritada çeteye tıklayıp "Takip et" demek yeter.`, `My lord, the bandits have caught the scent: ${name} is coming to raid our trading post. Just click the band on the map and choose "Chase".`),
            L(`Kötü haber, lordum: ${name} bizim yollara sapmış. İyi haber: yağmacılar ordulardan yavaştır, yakalamak kolay.`, `Bad news, my lord: ${name} has turned onto our roads. Good news: bandits are slower than armies, so they're easy to catch.`),
            L(`Lordum, uzaktan toz bulutu görünüyor; kervan değil, ${name}. Ticaret noktamıza varmadan bir orduyla önünü keselim.`, `My lord, there's a dust cloud in the distance; not a caravan, ${name}. Let's cut them off with an army before they reach our trading post.`),
          ]
        : leg === 'lurk'
          ? [
              L(`${name} ticaret noktamızın dibinde pusuya yattı, lordum; tüccarın kazancından pay kesiyorlar. Pusuları da pek gizli değil; biri ağaca saklanmış, şapkası dışarıda. Bir orduyla dağıtalım mı?`, `${name} lies in ambush right by our trading post, my lord, skimming the merchant's earnings. Not a very hidden ambush; one is hiding in a tree with his hat sticking out. Shall we scatter them with an army?`),
              L(`Lordum, yağmacılar kapımızda bekliyor: ${name}. Beklemek onların işi, kovmak bizim. Ordumuzu gönderelim.`, `My lord, bandits are waiting at our door: ${name}. Waiting is their job, chasing them off is ours. Let's send our army.`),
              L(`${name} çalıların arkasında sinsi sinsi bekliyor, lordum; tüccarlar yolu ondan sakınıyor. Bu iş kılıçla çözülür.`, `${name} lurks slyly behind the bushes, my lord; merchants give that road a wide berth. This calls for swords.`),
              L(`Lordum, ticaret noktamızın önünde ${name} kamp kurdu. Ganimeti onlarda, ordu bizde; bence adil bir takas.`, `My lord, ${name} has made camp in front of our trading post. They have the loot, we have the army; a fair swap, I'd say.`),
            ]
          : [
              L(`${name} ticaret noktamızdan çekiliyor, lordum; sırtını dönmüşken yakalamak kolaydır. Bir ordu gönderelim mi?`, `${name} is pulling back from our trading post, my lord; easy to catch with its back turned. Shall we send an army?`),
              L(`Lordum, ${name} baskından dönüyor; çantaları dolu. Önünü kesersek o çantalar bizim olur.`, `My lord, ${name} is returning from the raid with full bags. Cut them off and those bags are ours.`),
              L(`Yağmacılar dönüyor, lordum, ama yine gelecekler. ${name} yoldayken yakalamak en iyisi.`, `The bandits are heading back, my lord, but they'll be back again. Best to catch ${name} while it's on the road.`),
            ]
    },
    go: { label: L('Orduya bak', 'Look at the army'), act: tab('army', 'army', 'land') },
    jokes: [
      [L('Tüccar kendini korusun', 'Let the merchant protect himself'), L('Tüccar korkudan develerin arkasına saklandı, lordum; develer de onun arkasına. Şimdi bir daire hâlinde dönüyorlar ve kimse kimseyi korumuyor.', "The merchant hid behind the camels in fright, my lord; the camels hid behind him. Now they're going round in a circle and nobody is protecting anybody.")],
      [L('Yağmacılar da insan', 'Bandits are people too'), L('İnsan, lordum, ama bizim altınımızı seven insan. Sevgileri tek taraflı; bizim altınımızın da onlara hiç gönlü yok.', "People, my lord, but people who love our gold. Their love is unrequited; our gold doesn't fancy them at all.")],
      [L('Sur yaptırırız', "We'll build walls"), L('Sur güzel fikir, lordum; ama yağmacılar surla değil kılıçla sohbet eder. Ben surla sohbet etmeyi denedim, sur daha iyi dinliyor.', "Walls are a fine idea, my lord; but bandits converse with swords, not walls. I've tried conversing with a wall; it's a better listener.")],
      [L('Elçiyi yollayalım, konuşsun', "Send the envoy to talk"), L('Giderim, lordum; konuşurum, konuşurum, konuşurum. Belki sıkılıp giderler. Ama bir ihtimal beni de alıp giderler, fidyemi siz ödersiniz.', "I'll go, my lord; I'll talk and talk and talk. Perhaps they'll get bored and leave. But they might take me with them, and you'd pay my ransom.")],
    ],
    snooze: 6,
  },
  {
    id: 'bandits',
    when: (c) => (c.kingdom.outlaws?.road ?? 0) >= 0.25,
    say: ({ kingdom: k }) => {
      const p = pct(k.outlaws?.road ?? 0)
      const cut = pct((k.outlaws?.road ?? 0) * balance.outlaws.road.merchantCut)
      return [
        L(`Lordum, yağmacılar ticaret noktamızın çevresindeki yolların ${p}'ini tutuyor; tüccarın altınının ${cut}'ini kesiyorlar. Bir çeteyi kovalasak?`, `My lord, bandits hold ${p} of the roads around our trading post; they skim ${cut} of the merchant's gold. Shall we chase a band?`),
        L(`Yollarımız yağmacı dolu, lordum: ${p}. Tüccarımız her seferde ${cut} kayıpla dönüyor. Ordumuz da kışlada esniyor.`, `Our roads are full of bandits, my lord: ${p}. Our merchant comes home ${cut} short every trip. And our army yawns in the barracks.`),
        L(`Lordum, hanlarda yağmacılardan başka konu yok: yolların ${p}'i onların elinde. Bir çeteyi yenersek hem ganimet hem huzur gelir.`, `My lord, the inns talk of nothing but bandits: ${p} of the roads are theirs. Beat a band and we gain both loot and peace.`),
        L(`Tüccar şikâyet dilekçesi yazdı, lordum; üç sayfa, hepsi yağmacılar hakkında. Dördüncü sayfada benim hakkımda bir şeyler var, onu okumadım. Yolların ${p}'i tutulmuş.`, `The merchant wrote a complaint, my lord; three pages, all about bandits. The fourth page says something about me; I didn't read it. ${p} of the roads are held.`),
        L(`Yağmacılar ${cut} kesiyor, lordum. Az görünür ama her seferde; sonunda bir sarayın çatısı eder. Ya da bir elçinin emeklilik ikramiyesi.`, `The bandits skim ${cut}, my lord. It looks small, but it's every trip; in the end it adds up to a palace roof. Or an envoy's retirement bonus.`),
      ]
    },
    go: { label: L('Tüccara bak', 'Look at the merchant'), act: tab('trade', 'trade', 'merchant') },
    jokes: [
      [L('Vergi saysınlar', "Call it a tax"), L('Vergi gibi sayarsak bari onlardan da makbuz isteyelim, lordum. Vermiyorlar, sordum; makbuz yerine tokat verdiler.', "If it's a tax, my lord, let's at least ask them for a receipt. They don't give one; I asked; they gave me a slap instead.")],
      [L('Yollar zaten kötü', 'The roads are bad anyway'), L('Yollar kötü, yağmacılar daha kötü, lordum. İkisinden biriyle uğraşabiliriz; yağmacılar daha kolay, yollar kılıçtan anlamaz.', "The roads are bad and the bandits worse, my lord. We can deal with one of them; bandits are easier, roads don't understand swords.")],
      [L('Onlarla ortak olalım', "Let's go into business with them"), L('Teklif ettim, lordum, şaka yollu. Kabul ettiler, ciddi yollu. Payımızı da önceden kestiler; o yüzden ordu daha iyi bir fikir.', "I proposed it, my lord, in jest. They accepted, in earnest. And took our share in advance; which is why an army is the better idea.")],
    ],
    snooze: 25,
  },
  {
    id: 'pirates',
    when: (c) => (c.kingdom.outlaws?.sea ?? 0) >= 0.35,
    say: (c) => {
      const k = c.kingdom
      const p = pct(k.outlaws?.sea ?? 0)
      const fleet = navyOf(k).fleets.some((f) => warships(f.ships) > 0)
      return fleet
        ? [
            L(`Lordum, iskelemizin önünde korsan tekneleri dolaşıyor: etkileri ${p}. Savaş gemili bir filoyla takip edersek ödülü bizim olur.`, `My lord, pirate boats are prowling off our dock: their grip is ${p}. Chase them with a fleet of warships and the bounty is ours.`),
            L(`Kara yelkenler göründü, lordum! Korsanlar sularımızda (${p}); balıkçılar ağ atmaya korkuyor. Filomuzu salalım mı?`, `Black sails sighted, my lord! Pirates in our waters (${p}); the fishermen are afraid to cast their nets. Shall we let our fleet loose?`),
            L(`Lordum, korsanlar deniz ticaretimizi kollamaya başladı. Bir tekneye tıklayıp filomuzla "Takip et" demek yeter.`, `My lord, the pirates have started eyeing our sea trade. Just click a boat and choose "Chase" with our fleet.`),
            L(`Korsanların sularımızdaki gücü ${p}, lordum. Daha da iyisi: yuvaları olan korsan limanını ablukaya alırsak hepsi zayıflar.`, `The pirates' grip on our waters is ${p}, my lord. Better still: blockade their nest, the pirate haven, and they all weaken.`),
          ]
        : [
            L(`Lordum, iskelemizin önünde korsanlar dolaşıyor (${p}); balık az, ticaret korkak. Savaş gemilerimiz olsaydı bu iş kolay olurdu.`, `My lord, pirates prowl off our dock (${p}); fish are scarce and trade is timid. If we had warships this would be easy.`),
            L(`Korsanlar sularımızda, lordum, biz de kıyıda seyrediyoruz. Tersanede birkaç kadırga yapsak?`, `The pirates are in our waters, my lord, and we're watching from the shore. Shall we build a few galleys at the shipyard?`),
            L(`Lordum, balıkçılar korsanlardan yakınıyor: etkileri ${p}. Kadırgasız deniz, kuzusuz çoban gibi... ya da tersi. Benzetmeyi çözemedim ama derdi çözmek kolay: tersane ve kadırga.`, `My lord, the fishermen complain of pirates: their grip is ${p}. A sea without galleys is like a shepherd without lambs... or the other way round. I can't untangle the simile, but the problem is easy: a shipyard and galleys.`),
          ]
    },
    go: { label: L('Donanmaya bak', 'Look at the navy'), act: tab('army', 'army', 'sea') },
    jokes: [
      [L('Korsanlar romantiktir', 'Pirates are romantic'), L('Şarkılarda öyle, lordum. Gerçekte balığımızı çalıp kokuyorlar. Romantik olan tek şeyleri göz bantları; o da göz enfeksiyonundan.', "In songs, my lord. In reality they steal our fish and smell of it. The only romantic thing about them is the eyepatch, and that's from an eye infection.")],
      [L('Denizi sevmem', "I don't like the sea"), L('Deniz de sizi sevmiyor, lordum; ama korsanları hiç sevmiyor. Düşmanımın düşmanı, ıslak ama dosttur.', "The sea doesn't like you either, my lord; but it likes pirates even less. The enemy of my enemy is a friend, if a damp one.")],
      [L('Balık yemem zaten', "I don't eat fish anyway"), L('Halk yer, lordum. Siz yemezseniz de korsanlar yer; hem de bizim balıkları, bizim sofrada oturur gibi.', "The people do, my lord. And if you don't, the pirates will; our fish, as if they were sitting at our table.")],
    ],
    snooze: 25,
  },
  {
    id: 'haven',
    when: (c) => {
      if (shipyardLevel(c.kingdom, c.now) <= 0 || !navyOf(c.kingdom).fleets.some((f) => warships(f.ships) > 0)) return false
      if (navyOf(c.kingdom).fleets.some((f) => f.mission.kind === 'haven')) return false
      return havensOf(c.world, c.world.seed, c.online.outlaws).some((h) => !h.held && havenPop(h, c.now) >= balance.outlaws.havens.pop.max * 0.6)
    },
    say: (c) => {
      const havens = havensOf(c.world, c.world.seed, c.online.outlaws)
      const h = havens.filter((x) => !x.held).sort((a, b) => havenPop(b, c.now) - havenPop(a, c.now))[0]
      const strength = pct(havenStrength(havens, c.now))
      return [
        L(`Lordum, ${h.name} yine kalabalıklaştı: ${Math.round(havenPop(h, c.now))} korsan. Filomuzla ablukaya alırsak nüfusu erir, korsanların gücü düşer.`, `My lord, ${h.name} is crowded again: ${Math.round(havenPop(h, c.now))} pirates. Blockade it with our fleet and its numbers melt away, and the pirates weaken.`),
        L(`Korsanların yuvası belli, lordum: ${h.name}. Oraya bir filo gönderip limanı ablukaya alalım; korsanlar şu an tam güçlerinin ${strength}'inde.`, `We know where the pirates nest, my lord: ${h.name}. Let's send a fleet and blockade the haven; the pirates are at ${strength} of their full strength right now.`),
        L(`Lordum, korsan teknelerini tek tek kovalamak yerine yuvalarını kuşatalım: ${h.name}. Limana tıklayıp "Ablukaya al" demek yeter.`, `My lord, instead of chasing pirate boats one by one, let's besiege their nest: ${h.name}. Just click the haven and choose "Blockade".`),
        L(`Liman doldukça korsanlar azgınlaşır, lordum. ${h.name} bir abluka için yalvarıyor; tabii korsanlar böyle düşünmüyor.`, `The fuller the haven, the bolder the pirates, my lord. ${h.name} is begging for a blockade; the pirates disagree, naturally.`),
        L(`Lordum, kadırgalarımız limanda paslanıyor. ${h.name}'ın önünde demirleseler hem pas gider hem korsan.`, `My lord, our galleys are rusting in port. If they anchored off ${h.name}, we'd be rid of both the rust and the pirates.`),
      ]
    },
    go: { label: L('Donanmaya bak', 'Look at the navy'), act: tab('army', 'army', 'sea') },
    jokes: [
      [L('Korsanlar da yaşasın', 'Let the pirates live too'), L('Yaşasınlar, lordum; ama başka bir gölde. Mümkünse rakip tacın gölünde, onun kayıklarının yanında.', "Let them, my lord; on another lake. Preferably the rival crown's, next to its boats.")],
      [L('Kadırgalar yorgun', 'The galleys are tired'), L('Kadırgalar yorulmaz, lordum; kürekçiler yorulur. Onlara çift yemek veririz; ben de çift tezahürat, kıyıdan.', "Galleys don't tire, my lord; oarsmen do. We'll give them double rations; and I'll give double cheers, from the shore.")],
    ],
    snooze: 30,
  },
  {
    id: 'outbreak',
    when: (c) => (c.kingdom.sickness ?? 0) >= 0.03 && count(c.kingdom, 'hospital') > 0,
    say: ({ kingdom: k }) => {
      const p = pct(k.sickness ?? 0)
      return [
        L(`Lordum, köyde hastalık var: halkın ${p}'i yatakta. Şifahanenin doktorları tam kadro çalışırsa çabuk geçer.`, `My lord, there's sickness in the village: ${p} of the people are in bed. If the hospital's doctors work at full strength it'll pass quickly.`),
        L(`Salgın kapımızı çaldı, lordum; ${p} hasta. Şifahaneye işçi verirsek hastalar daha çabuk iş başı yapar.`, `An outbreak has knocked at our door, my lord; ${p} are sick. Give the hospital workers and the sick will be back at work sooner.`),
        L(`Lordum, öksürük sesleri sarayın içine kadar geliyor: halkın ${p}'i hasta. Şifahaneyi bir yoklayalım mı?`, `My lord, the coughing reaches right into the palace: ${p} of the people are sick. Shall we look in on the hospital?`),
        L(`Yılın hastalığı geldi, lordum; her yıl gelir ama her yıl geçer, bir akraba ziyareti gibi. Hastalar ${p}; şifahane işini yapıyor.`, `The year's sickness has arrived, my lord; it comes every year and leaves every year, like a visit from relatives. ${p} are sick; the hospital is doing its job.`),
      ]
    },
    go: { label: L('Sağlığa bak', 'Check health'), act: tab('people', 'people', 'health') },
    jokes: [
      [L('Bana bulaşmasın', "I'd better not catch it"), L('Bulaşmaz, lordum; hükümdarlar hastalanmaz, yalnızca "dinlenir". Yine de mendil taşıyın; benimkini değil, o kırk yıllık.', "You won't, my lord; rulers don't fall ill, they merely \"rest\". Do carry a handkerchief, though; not mine, it's forty years old.")],
      [L('Elçiler hastalanır mı?', 'Do envoys fall ill?'), L('Hastalanır, lordum, ama işten kaçmak için. Ben hiç hastalanmadım; bu da ya sağlığımı ya da tembelliğimin sınırını söylüyor.', "They do, my lord, to dodge work. I've never been ill; which says something either about my health or the limits of my laziness.")],
      [L('Kim hapşırdı?', 'Who sneezed?'), L('Ben değildim, lordum. Yani bendim, ama asil bir hapşırıktı, sayılmaz.', "Not I, my lord. Well, it was me, but it was a noble sneeze; it doesn't count.")],
    ],
    snooze: 20,
  },
  {
    id: 'journey',
    when: (c) => maxExpeditions(c.kingdom, c.now) > 0 && expeditionsOut(c.kingdom, c.now).length === 0 && (c.kingdom.expeditions ?? []).length > 0 && population(c.kingdom, c.now).healthy - population(c.kingdom, c.now).jobs >= 4,
    say: ({ kingdom: k, now }) => {
      const p = population(k, now)
      const idle = n(Math.floor(p.healthy - p.jobs))
      return [
        L(`Lordum, ${idle} köylü boşta oturuyor. Bir sefer başlatalım mı? Avcılar ormana, kâşifler dağlara; ganimetle dönerler.`, `My lord, ${idle} villagers are sitting idle. Shall we start an expedition? Hunters to the forest, explorers to the mountains; they'll come back with loot.`),
        L(`Boştaki köylüler meydanda sinek kovalıyor, lordum. Onları bir sefere yollasak hem sinekler rahatlar hem ambar dolar.`, `The idle villagers are chasing flies in the square, my lord. Send them on an expedition and the flies get some peace and the storehouse fills.`),
        L(`Lordum, uzun zamandır kimse yola çıkmadı. ${idle} köylümüz hazır; bir sefer başlatalım, belki bir define bulurlar.`, `My lord, nobody has set out for a long while. ${idle} of our villagers are ready; let's start an expedition, they might find treasure.`),
        L(`Bir sefer başlatın, lordum: köylüler macera ister, ambar da ganimet. İkisi birden mutlu olur, ben de.`, `Start an expedition, my lord: the villagers want adventure and the storehouse wants loot. Both will be happy, and so will I.`),
        L(`Lordum, kâşifler dağların ardında harabeler olduğunu söylüyor. ${idle} boşta köylüyle bir sefer düzenleyelim mi?`, `My lord, explorers say there are ruins beyond the mountains. Shall we organise an expedition with ${idle} idle villagers?`),
      ]
    },
    go: { label: L('Seferler', 'Expeditions'), act: tab('kingdom', 'palace', 'expeditions') },
    jokes: [
      [L('Seferler tehlikeli', 'Expeditions are dangerous'), L('Tehlikeli, lordum; ama boş oturmak daha tehlikeli: köylüler düşünmeye başlar. Düşünen köylü de "neden vergi veriyoruz" diye sorar. Birkaç muhafız verirsek içimiz rahat eder.', 'Dangerous, my lord; but sitting idle is more dangerous: villagers start thinking. And a thinking villager asks "why do we pay taxes?". Give them a few guards and we can rest easy.')],
      [L('Köylüler yorgun', 'The villagers are tired'), L('Boşta oturan köylü yorgun olmaz, lordum; sıkılır. Sıkılan köylü de şarkı söyler, kötü söyler, gece yarısı söyler.', "An idle villager isn't tired, my lord; he's bored. And a bored villager sings, badly, at midnight.")],
      [L('Sen de git', 'You go too'), L('Giderdim, lordum, ama dizlerim gitmiyor. Dizler gitmezse elçi de gitmez; anatomi böyle.', "I would, my lord, but my knees won't. Where the knees won't go, the envoy won't either; such is anatomy.")],
    ],
    snooze: 35,
  },
  {
    id: 'trail',
    when: (c) => clansOf(c.world.seed, c.online.outlaws).some((clan) => {
      const t = trailOf(c.kingdom.caveTrail, clan)
      return !!t && t.cave === undefined && (t.wins ?? 0) > 0
    }),
    say: (c) => {
      const clan = clansOf(c.world.seed, c.online.outlaws).find((x) => {
        const t = trailOf(c.kingdom.caveTrail, x)
        return !!t && t.cave === undefined && (t.wins ?? 0) > 0
      })!
      return [
        L(`Lordum, ${clan.name}'nın izi yarım kaldı. Çetelerinden birini daha yenersek mağaralarının yerini söylerler.`, `My lord, the trail of ${clan.name} is half-followed. Beat another of their bands and they'll tell us where their cave is.`),
        L(`Yakalanan yağmacılar ${clan.name}'nın mağarasından bahsediyordu, lordum. Bir zafer daha, iz tamamlanır; sonra ganimet dolu mağarayı kuşatırız.`, `The captured bandits were talking about the cave of ${clan.name}, my lord. One more victory and the trail is complete; then we besiege the loot-filled cave.`),
        L(`Lordum, ${clan.name} dağlarda bir yerde saklanıyor. İz sürmeye devam edelim: onların çetelerinden birini takip edin.`, `My lord, ${clan.name} is hiding somewhere in the mountains. Let's keep tracking: pursue one of their bands.`),
        L(`Mağaradaki ganimet her saat büyüyor, lordum; benim merakım da. ${clan.name}'nın izini bitirsek fena olmaz.`, `The loot in that cave grows every hour, my lord; and so does my curiosity. It wouldn't hurt to finish tracking ${clan.name}.`),
        L(`Esirlerden biri haritayı çizmeye başladı, lordum, sonra tam yerini göstereceği sırada hapşırdı ve kâğıdı yırttı. Bir zafer daha; bir esir daha, belki bu sefer hapşırmayan biri. ${clan.name}'nın izi yarım.`, `One of the prisoners began drawing a map, my lord, then sneezed just as he was about to mark the spot and tore the paper. One more victory; one more prisoner, perhaps one who doesn't sneeze. The trail of ${clan.name} is half done.`),
      ]
    },
    go: { label: L('Orduya bak', 'Look at the army'), act: tab('army', 'army', 'land') },
    jokes: [
      [L('Mağaralar karanlık', 'Caves are dark'), L('Karanlık, lordum; o yüzden içine ordu gönderiyoruz, beni değil. Ben meşale tutarım, uzaktan, burada.', "Dark, my lord; which is why we send an army in, not me. I'll hold a torch, from afar, here.")],
      [L('Ganimet ne kadar?', 'How much loot?'), L('Esirler "çok" diyor, lordum; yağmacı ağzıyla "çok" ya bir sandık ya bir dağ demektir. Gidip saymak lazım.', 'The prisoners say "lots", my lord; in bandit-speak "lots" means either a chest or a mountain. We must go and count.')],
    ],
    snooze: 40,
  },
  {
    id: 'game',
    when: ({ kingdom: k, now }) => ARCADE_GAMES.some((g) => gameError(k, g, now) === null) || (count(k, 'fisherHut') > 0 && fishError(k, now) === null),
    say: () => [
      L(`Lordum, bir mini oyun oynanmayı bekliyor: okçuluk, örs başında, kervan yolu ya da balıkçı kulübesinin oltası. Küçük ödüller verir; ben de seyrederken sizi alkışlarım.`, `My lord, a minigame awaits: archery, the anvil, the caravan road or the fishing hut's rod. They give small rewards; and I'll applaud while I watch.`),
      L(`Lordum, bir oyun sizi bekliyor: kışlada okçuluk, atölyede örs, ticaret noktasında kervan yolu ya da balıkçı kulübesinde olta. Ödüller küçük ama gönül eğlencesi büyük.`, `My lord, a game awaits you: archery at the barracks, the anvil at the workshop, the caravan road at the trading post or the rod at the fishing hut. Small rewards, but great amusement.`),
      L(`Hükümdarlık yorucu iştir, lordum; biraz eğlence iyi gelir. Mini oyunlardan biri oynanabilir; ödülü hazineye, puanı sıralamaya gider.`, `Ruling is tiring work, my lord; a little fun does you good. One of the minigames is ready; the reward goes to the treasury, the score to the rankings.`),
      L(`Okçuluk meydanı boş, örs soğuk, olta kuru, lordum. Bir el oynasanız? Küçük bir ödül verir, en iyi puanınız da sıralamaya yazılır.`, `The archery range is empty, the anvil cold, the rod dry, my lord. Fancy a round? It gives a small reward, and your best score goes on the rankings.`),
      L(`Lordum, en iyi puanınızı geçmenizi kimse beklemiyor; ama ben bekliyorum. Bahse girdim de. Bir mini oyun oynanabilir durumda.`, `My lord, nobody expects you to beat your best score; but I do. I've placed a bet. A minigame is ready to play.`),
    ],
    go: { label: L('Saraya bak', 'Look at the palace'), act: tab('kingdom', 'palace', 'buildings') },
    jokes: [
      [L('Oyun çocuklar için', 'Games are for children'), L('Saraydaki çocuklar da "oyun lordlar için" diyor, lordum. Kimse oynamayınca ödül de öylece yatıyor, toz tutuyor.', 'The children at court say "games are for lords", my lord. With nobody playing, the reward just lies there gathering dust.')],
      [L('Okçulukta iyiyimdir', "I'm good at archery"), L('Biliyorum, lordum; geçen sefer saman hedefi ıskaladınız ama benim şapkamı vurdunuz. Rüzgârdandı, eminim. Şapka da öyle düşünüyor.', "I know, my lord; last time you missed the straw target but hit my hat. It was the wind, I'm sure. The hat thinks so too.")],
      [L('Elçi efendi oynasın', 'Let master envoy play'), L('Oynadım, lordum; balık oltayı çekti, ben suya düştüm. Balık hâlâ kıyıda gülüyor. Siz oynayın.', "I did, my lord; the fish pulled the rod and I fell in. The fish is still laughing by the bank. You play.")],
      [L('Kazanırsam ne olur?', 'What if I win?'), L('Biraz altın, biraz mal, lordum; bir de sıralamada adınız. Kaybederseniz yalnızca ben bilirim. Bir de aşçı, bir de bekçi... Neyse, az kişi.', "A little gold, a few goods, my lord; and your name on the rankings. If you lose, only I will know. And the cook, and the watchman... Well, a few people.")],
    ],
    snooze: 40,
  },
]

// When there is nothing to advise.
export const IDLE_LINES = [
  L('Her şey yolunda görünüyor, lordum. Bu bende kuşku uyandırıyor; kırk yıllık elçilik alışkanlığı.', 'All seems well, my lord. Which makes me suspicious; forty years of diplomatic habit.'),
  L('Bugün sizi rahatsız edecek bir şey bulamadım. İsterseniz oyunun bir köşesini anlatayım?', "I've found nothing to trouble you with today. Shall I explain some corner of the game instead?"),
  L('Ülkede huzur var, lordum. Ben de biraz şarap... yani su içeyim.', 'There is peace in the land, my lord. I think I shall have a little wine... I mean, water.'),
  L('Komşular sessiz. Sessiz komşu, ya uyuyordur ya da plan yapıyordur. Ben ikinci şıktan korkarım.', 'The neighbours are quiet. A quiet neighbour is either asleep or plotting. I fear the latter.'),
  L('Ambarlar yerinde, hazine yerinde, ben yerindeyim. Bu kadar düzen beni huzursuz ediyor, lordum.', "The stores are in place, the treasury is in place, I am in place. So much order makes me uneasy, my lord."),
  L('Getirecek kötü bir haberim yok, lordum; bu yüzden kendimi işsiz hissediyorum. Bir şey sormak ister misiniz?', "I have no bad news to bring, my lord, so I feel rather unemployed. Would you like to ask me something?"),
  L('Lordum, bugün size yalnızca iltifat edeceğim: sarayınız heybetli, şapkanız da. Şapka benim tavsiyemdi.', 'My lord, today I shall only pay you compliments: your palace is imposing, and so is your hat. The hat was my suggestion.'),
  L('Her şey yolunda. Böyle günlerin fırtına öncesi olduğunu bilirim, lordum; ama şimdilik keyfini çıkaralım.', "All is well. I know days like this come before a storm, my lord; but let's enjoy it for now."),
  L('Bugün ulaklar bile tembel, lordum; atları ahırda geviş getiriyor. Ben de onlara uydum.', 'Even the messengers are lazy today, my lord; their horses are chewing the cud in the stable. I have followed their example.'),
  L('Söyleyecek bir derdim yok, lordum. Kırk yılda üçüncü kez başıma geliyor; tarihini not ettim.', "I have no complaints, my lord. The third time in forty years; I've noted the date."),
  L('Hazinedar gülümsüyor, ambarcı ıslık çalıyor, lordum. Ya işler iyi ya da ikisi bir şey biliyor.', 'The treasurer is smiling and the storekeeper whistling, my lord. Either things are good, or the two of them know something.'),
  L('Lordum, bugün size kötü haber getiremediğim için özür dilerim. Yarın telafi ederim, söz.', "My lord, I apologise for bringing no bad news today. I'll make up for it tomorrow, I promise."),
  L('Sarayda huzur var, lordum. Kraliyet kedisi bile güneşte uyuyor; ben de onu taklit etmeyi düşünüyorum.', 'Peace reigns in the palace, my lord. Even the royal cat is asleep in the sun; I am thinking of following suit.'),
  L('Pazarda fiyatlar yerinde, yollarda kervanlar yolunda, lordum. Benim dilim de yerinde; ona bir iş bulun.', 'Prices are steady at market and caravans on their way, my lord. My tongue is in fine form too; do find it something to do.'),
  L('Lordum, haberler var. Hiçbiri kötü değil. Bunu nasıl söyleyeceğimi bilemedim, prova etmemiştim.', "My lord, there is news. None of it bad. I didn't know how to say it; I hadn't rehearsed."),
  L('Ambar fareleri bugün grevde, lordum; hiçbir şey yemiyorlar. Talepleri arasında daha iyi peynir var. Bence müzakereye açığız.', "The storehouse rats are on strike today, my lord; they're eating nothing. Their demands include better cheese. I think we're open to negotiation."),
  L('Bugün tek olay, aşçının benim tabağıma bir kaşık daha az koyması oldu, lordum. Bunu bir hakaret sayıp savaş gerekçesi yapabilir miyiz?', "The only event today was the cook putting one spoonful less on my plate, my lord. Could we count it as an insult and a casus belli?"),
  L('Rakip lordlardan birinin elçisini pazarda gördüm, lordum. Şapkası benimkinden küçüktü. Bugünlük bu kadar zafer yeter.', "I saw a rival lord's envoy at the market, my lord. His hat was smaller than mine. That's victory enough for one day."),
  L('Kraliçenin kuzeni yine yemeğe kaldı, lordum. Bu ay on ikinci kez. Ama bunun dışında her şey yolunda.', "The queen's cousin stayed for dinner again, my lord. Twelfth time this month. Otherwise, all is well."),
  L('Vergi memuru köyden döndü, lordum; kesesi dolu, gözü morarmış. Olağan bir gün, yani.', 'The tax collector is back from the village, my lord; purse full, eye blackened. An ordinary day, then.'),
  L('Size iyi bir haberim var, lordum: kötü bir haberim yok. Bu da kötü bir haber sayılır mı, bilemedim; elçilikte böyle durumlar için bir kural yok.', "I have good news, my lord: I have no bad news. Whether that counts as bad news I can't say; diplomacy has no rule for it."),
]

// Things to chat about when there is nothing to advise, each with a few answers.
export const SMALL_TALK: { label: string; answers: string[] }[] = [
  {
    label: L('Nasılsın, elçi efendi?', 'How are you, master envoy?'),
    answers: [
      L('Dizlerim yağmuru haber veriyor, dilim savaşları. Yani her zamanki gibi, lordum.', 'My knees forecast the rain and my tongue the wars. So, as ever, my lord.'),
      L('İyiyim, lordum; dişlerimin yarısı ve hatıralarımın tamamı yerinde.', "I'm well, my lord; half my teeth and all my memories are still in place."),
      L('Daha iyi olamazdım, lordum. Gerçi dün de böyle demiştim, sonra merdivenden düştüm.', "Couldn't be better, my lord. Though I said the same yesterday, and then fell down the stairs."),
      L('Bir elçi nasıl olduğunu kimseye söylemez, lordum; ama size söylerim: yorgun ama gururlu.', "An envoy tells no one how he is, my lord; but I'll tell you: tired, but proud."),
      L('Sabah üç merdiven çıktım, öğlen iki haber taşıdım, akşam bir şarkı söyledim, lordum. Bu yaşta fena sayılmaz.', 'This morning I climbed three flights of stairs, at noon I carried two pieces of news, this evening I sang a song, my lord. Not bad at my age.'),
      L('Sağ dizim iyi, sol dizim küs, lordum. Aralarını bulmaya çalışıyorum; benim en zor diplomasi işim bu.', "My right knee is fine, my left knee is sulking, my lord. I'm trying to reconcile them; the hardest diplomatic task of my career."),
      L('Kimse sormuyordu, lordum, siz sordunuz. Bu yüzden size uzun anlatacağım. Şaka şaka; iyiyim. Ama kısaca: belim de var.', "Nobody ever asks, my lord, but you did. So I shall tell you at length. Only joking; I'm fine. In brief: there's also my back."),
    ],
  },
  {
    label: L('Bir fıkra anlat', 'Tell me a joke'),
    answers: [
      L('Bir lord sarayına sur çekmiş, kapı koymayı unutmuş. Halk bir hafta içeride kalmış. Lord "Ne güzel, kimse şikâyet etmiyor" demiş. Kimse dışarı çıkıp şikâyet edemiyormuş da ondan.', 'A lord walled in his palace and forgot the gate. The people were stuck inside for a week. The lord said "How lovely, nobody is complaining." Because nobody could get out to complain.'),
      L('Bir lord tüccarına "Hiçbir şey satma" demiş. Tüccar bir hafta oturmuş, sonra gelip "Lordum, oturmaktan yoruldum, bari sandalyeyi satayım mı?" diye sormuş.', 'A lord told his merchant "Sell nothing." The merchant sat for a week, then came and asked "My lord, I\'m tired of sitting; may I at least sell the chair?"'),
      L('Bir lord mancınığı ters kurmuş, taşı kendi sarayına atmış. "Tatbikattı" demiş. O günden beri o lordluğun tatbikatlarına herkes miğferle geliyor.', 'A lord set up his catapult backwards and hurled a stone into his own palace. "It was a drill," he said. Ever since, everyone comes to that lordship\'s drills wearing a helmet.'),
      L('Köylünün biri hastaneye gitmiş: "Doktor, her gün yorgun uyanıyorum." Doktor sormuş: "Gece mesaisi mi?" Köylü: "Ben istemedim, lordum açtı." Doktor: "O zaman ilaç bende değil, lordunda."', 'A villager goes to the hospital: "Doctor, I wake up tired every day." The doctor asks: "Night shift?" The villager: "I didn\'t want it, my lord ordered it." The doctor: "Then the cure isn\'t with me, it\'s with your lord."'),
      L('Haraççı bir lordun kapısını çalmış: "Hazinenin payını almaya geldik." Lord kasayı açmış, içinden bir fare çıkmış. Haraççı fareyi almış, gitmiş. Fare hâlâ rakip tacın hazinesinde, kendini pek önemli sanıyormuş.', 'A tribute collector knocks at a lord\'s door: "We\'ve come for the treasury\'s share." The lord opens the chest and out pops a mouse. The collector takes the mouse and leaves. The mouse is still in the rival crown\'s treasury, thinking itself very important.'),
      L('Bir elçi kısa konuşmaya karar vermiş. Sarayda herkes şaşırmış, hükümdar doktor çağırtmış. Doktor elçiyi muayene etmiş: "Hiçbir şeyi yok, yalnızca dili tutulmuş." Ertesi gün açılmış, üç gün susmadı. O elçi bendim, lordum.', 'An envoy once decided to keep it brief. The whole court was astonished and the ruler sent for a doctor. The doctor examined him: "Nothing wrong, his tongue is merely tied." Next day it came untied, and he didn\'t stop for three days. That envoy was me, my lord.'),
      L('Bir lord yağmacıları kovalamak için orduyu yollamış. Ordu çeteyi bulamamış, çete orduyu bulmuş. Sonra ikisi aynı hana girmiş, aynı masaya oturmuş, hesabı da lorda yazdırmışlar.', "A lord sent his army after the bandits. The army couldn't find the band, but the band found the army. Then they went into the same inn, sat at the same table, and put the bill on the lord's tab."),
      L('Bir köylü taç başkentine gitmiş, kralı görmüş, gelip anlatmış: "Bizim lordumuza benziyordu, yalnız tacı daha büyüktü." Lord sevinmiş. Köylü devam etmiş: "Kafası da."', 'A villager went to the crown capital, saw the king, and came back saying: "He looked like our lord, only his crown was bigger." The lord was delighted. The villager went on: "So was his head."'),
    ],
  },
  {
    label: L('Sence iyi bir lord muyum?', 'Do you think I am a good lord?'),
    answers: [
      L('Sizden iyisini görmedim, lordum. Gerçi ben pek dışarı çıkmam.', "I've never seen a better one, my lord. Though I don't get out much."),
      L('Elbette, lordum. Bir de ambarları doldurursanız kusursuz olursunuz.', 'Of course, my lord. Fill the storehouses and you would be flawless.'),
      L('Kitaplar size "Büyük" diyecek, lordum. Neyin büyüğü olduğunu ben uydururum.', 'The books will call you "the Great", my lord. I shall invent what you were great at.'),
      L('Sizden önceki lordlara da böyle demiştim, lordum; ama size gerçekten inanarak söylüyorum. Neredeyse.', 'I said so to the lords before you, my lord; but with you I truly mean it. Almost.'),
      L('Halka sordum, lordum: yarısı "iyi" dedi, yarısı "vergiye bağlı". Bence bu, bir lord için parlak bir karne.', 'I asked the people, my lord: half said "good", half said "depends on the tax". For a lord, I call that a glowing report.'),
    ],
  },
  {
    label: L('Eski günleri anlat', 'Tell me about the old days'),
    answers: [
      L('Gençken bir kraliçeyi kaçıran casusu kovaladım, lordum. Yakalayamadım ama çok güzel koştum.', "In my youth I chased a spy who had kidnapped a queen, my lord. I didn't catch him, but I ran beautifully."),
      L('Eskiden elçiler atla giderdi, lordum. Şimdi de atla gidiyoruz, ama eskiden atlar daha hızlıydı. Ya da ben daha hafiftim.', 'In the old days envoys travelled on horseback, my lord. We still do, but the horses were faster then. Or I was lighter.'),
      L('Bir keresinde iki lord arasında barış imzalattım, lordum. Mürekkep kurumadan savaş çıktı, ama imza çok güzeldi.', 'Once I got two lords to sign a peace, my lord. War broke out before the ink was dry, but the signatures were lovely.'),
      L('Dedem de elçiydi, lordum; o da çok konuşurdu. Ailemizde sessiz biri doğsa sanırım onu evlatlıktan reddederiz.', 'My grandfather was an envoy too, my lord; he also talked a great deal. If a quiet child were born into our family, I think we would disown it.'),
      L('Bir kış bir taç sarayında kar yüzünden mahsur kaldım, lordum. Üç ay boyunca hükümdara masal anlattım; bahara çıktığımda o elçi olmuştu, ben neredeyse hükümdar.', 'One winter I was snowed in at a crown court, my lord. For three months I told the ruler stories; by spring he had become an envoy and I very nearly a ruler.'),
    ],
  },
  {
    label: L('Taçlar hakkında ne düşünürsün?', 'What do you think of the crowns?'),
    answers: [
      L('Taçlar güneş gibidir, lordum: uzaktan ısıtır, yakından yakar. Biz uygun mesafede duralım.', 'Crowns are like the sun, my lord: they warm from afar and burn up close. Let us keep a sensible distance.'),
      L('Bir taç ne verdiğini hiç unutmaz, ne aldığını da hemen unutur. Defterleri tek sayfalıktır, lordum.', 'A crown never forgets what it gave and promptly forgets what it took. Their ledgers have only one page, my lord.'),
      L('Gençken bir hükümdarın elini öptüm, lordum. Yüzüğü o kadar büyüktü ki burnumu çizdi; izi hâlâ duruyor.', "In my youth I kissed a ruler's hand, my lord. His ring was so big it scratched my nose; the mark is still there."),
      L('Taçlara güvenin, lordum, ama hazinenizi kilitli tutun. İkisini aynı anda yapabilen lord uzun yaşar.', 'Trust the crowns, my lord, but keep your treasury locked. The lord who can do both at once lives long.'),
      L('İki taç, iki sancak, bir sürü lord; biz de aradaki köprüyüz, lordum. Köprüye herkes basar ama köprü olmadan kimse karşıya geçemez.', 'Two crowns, two banners, a host of lords; and we are the bridge between, my lord. Everyone treads on a bridge, but without one nobody gets across.'),
    ],
  },
  {
    label: L('Komşularımız hakkında ne biliyorsun?', 'What do you know about our neighbours?'),
    answers: [
      L('Çok şey bilirim, lordum, ama yarısını uydururum; hangi yarısı olduğunu casus evi söyler.', "I know a great deal, my lord, but I make up half of it; the spy house can tell you which half."),
      L('Komşulardan biri her gece surlarını sayıyormuş, lordum. Saydıkça azalıyormuş; ben de anlamadım.', "One of the neighbours counts his walls every night, my lord. And the more he counts, the fewer there are; I don't understand it either."),
      L('Bir komşu lordun aşçısı bizim aşçının kuzeni, lordum. Mutfaktan çıkan dedikodu, casustan çıkan rapordan hızlıdır.', "A neighbouring lord's cook is our cook's cousin, my lord. Kitchen gossip travels faster than any spy's report."),
      L('Komşular iyi insanlar, lordum; uyurken. Uyanınca her biri bir hesap peşinde.', 'The neighbours are good people, my lord; while asleep. Awake, each one is scheming.'),
      L('Han söylentilerini dinlerseniz, lordum, kimin ne sattığını, kimin kime savaş açtığını öğrenirsiniz. Ben her akşam bir hana uğrarım; yalnızca işim için.', 'Listen to the inn rumours, my lord, and you learn who sells what and who has declared war on whom. I drop in at an inn every evening; purely for work.'),
    ],
  },
  {
    label: L('Bir öğüt ver', 'Give me some advice'),
    answers: [
      L('Dolu ambar, dolu hazine, boş kafa: üçü bir arada olmasın, lordum. İlk ikisi tehlikelidir, üçüncüsü ölümcül.', 'A full storehouse, a full treasury, an empty head: never all three at once, my lord. The first two are dangerous; the third is fatal.'),
      L('Kraliçenizi iyi koruyun, kardeşlerinizi iyi doyurun, haraççıları iyi uğurlayın, lordum. Gerisi kendiliğinden gelir.', 'Guard your queen well, feed your siblings well, see the tribute collectors off well, my lord. The rest follows.'),
      L('Bir lord herkesle kavga edemez, lordum; ama herkes onunla kavga etmekten çekinmeli. İkisi arasındaki ince çizgiye diplomasi denir.', 'A lord cannot fight everyone, my lord; but everyone should be wary of fighting him. The fine line between the two is called diplomacy.'),
      L('Tüccarınızı hiç boş oturtmayın, lordum; boş tüccar ya şarkı söyler ya dedikodu yapar, ikisi de altın getirmez.', 'Never let your merchant sit idle, my lord; an idle merchant either sings or gossips, and neither brings in gold.'),
      L('Fazla düşünen lord fırsatı kaçırır, hiç düşünmeyen tahtını, lordum. Ben arada bir düşünürüm; o yüzden hâlâ buradayım.', 'A lord who thinks too much misses his chance; one who never thinks loses his throne, my lord. I think now and then; which is why I am still here.'),
    ],
  },
  {
    label: L('En sevdiğin yemek ne?', "What's your favourite food?"),
    answers: [
      L('Bal kaymak, lordum. Ama doktor yasakladı; ben de doktoru yasakladım. Şimdi ikimiz de mutsuzuz.', 'Honey and clotted cream, my lord. But the doctor forbade it; so I forbade the doctor. Now we are both miserable.'),
      L('Sarayın aşçısının kuzu güveci, lordum. Tarifini bir kez sordum; kepçeyle kovaladı.', "The palace cook's lamb stew, my lord. I asked for the recipe once; he chased me with a ladle."),
      L('Ziyafet sofrasında başkasının tabağındaki her şey, lordum. Elçilik bunu öğretir.', "Anything on someone else's plate at a banquet, my lord. Diplomacy teaches you that."),
      L('Kuru ekmek ve peynir, lordum; yolda yediğim. Gerçi yolda yediğim her şey kuru ekmek ve peynirdi. Peynir bile kuruydu.', 'Dry bread and cheese, my lord; what I eat on the road. Though everything I ate on the road was dry bread and cheese. Even the cheese was dry.'),
      L('Başka lordların ziyafetleri, lordum. Ben hiçbirine davet edilmem ama elçiyim; kapıdan girince "davetliyim" demek mesleğin gereği.', 'Other lords\' banquets, my lord. I am never invited, but I am an envoy; walking in and saying "I\'m expected" is part of the job.'),
    ],
  },
  {
    label: L('Kraliçenin akrabaları nasıl?', "How are the queen's relatives?"),
    answers: [
      L('Kalabalık, lordum. Geçen hafta biri "iki günlüğüne" geldi; şimdi bahçede kendi adına bir ağaç dikiyor.', 'Numerous, my lord. Last week one came "for two days"; now he\'s planting a tree in the garden in his own name.'),
      L('Gayet iyiler, lordum; sizin şarabınızla, sizin kilerinizle ve sizin yatak odanızın yanındaki odada. Benim eski odam.', 'Very well, my lord; on your wine, out of your larder, and in the room next to your bedchamber. My old room.'),
      L('Biri bana "elçi efendi, bir dilekçe yazar mısın, maaş bağlansın" dedi. Kime maaş, neden maaş, sormadım; sorsaydım anlatacaktı.', 'One asked me, "master envoy, would you write a petition for a stipend?" A stipend for whom, and why, I didn\'t ask; if I had, he would have told me.'),
      L('Kraliçenin bir dayısı var, lordum; her ziyafette aynı fıkrayı anlatıyor. Ben de her seferinde gülüyorum. Diplomasi budur.', "The queen has an uncle, my lord, who tells the same joke at every banquet. And every time I laugh. That's diplomacy."),
    ],
  },
  {
    label: L('Haraççılardan bahset', 'Tell me about the tribute collectors'),
    answers: [
      L('Haraççılar takvim gibidir, lordum; yarım saatte bir şaşmadan gelirler. Bir gün geç kalsalar, hasta mı diye merak ederim.', "Tribute collectors are like a calendar, my lord; they come every half hour without fail. If they were ever late, I'd wonder whether they were ill."),
      L('Bir haraççıbaşına bir gün "kalbiniz yok mu?" diye sordum, lordum. "Var," dedi, "hazineye koydum, o da yüzde sekiz kesildi."', 'I once asked a head collector "have you no heart?", my lord. "I do," he said, "I put it in the treasury, and eight per cent of it got taken."'),
      L('Haraççılarla konuşun, lordum; huylarını bulursanız indirim yaparlar. Kibirliyi övün, açgözlüye göz kırpın, yorgunu oturtun. Bana hiç indirim yapmadılar ama, ben kendimi övdüm.', "Talk to the tribute collectors, my lord; find their temper and they'll give you a discount. Flatter the vain, wink at the greedy, sit the weary down. They never gave me a discount, though; I flattered myself."),
    ],
  },
]

// The list of topics, the answers to skipping a step and to closing the tutorial.
export const TOPICS_ASK = [
  L('Ne öğrenmek istersiniz, lordum? Bilmediğim şey yok; olsa da söylemem.', "What would you like to learn, my lord? There's nothing I don't know; and if there were, I wouldn't say."),
  L('Hangi köşesini anlatayım, lordum? Kısa anlatacağım, söz. Kısa derken, elçi kısası.', "Which corner shall I explain, my lord? I'll keep it short, I promise. Short by envoy standards."),
  L('Sorun, lordum; kırk yılda öğrendiğimi beş dakikada anlatırım. Belki altı.', "Ask, my lord; I'll tell you forty years' learning in five minutes. Perhaps six."),
  L('Konuyu siz seçin, lordum, anlatmayı bana bırakın. Susmayı da bana bırakmayın, beceremem.', "You choose the topic, my lord, and leave the telling to me. Don't leave the silence to me, though; I'm no good at it."),
  L('Öğretmenlik de elçilik gibidir, lordum: karşınızdakinin uyumasına aldırmadan konuşmaya devam edersiniz. Bir konu seçin.', 'Teaching is like diplomacy, my lord: you keep talking regardless of whether your listener has fallen asleep. Pick a topic.'),
  L('Bir konu seçin, lordum; sayfa sayfa anlatırım, sıkılırsanız "Başka bir şey sor" dersiniz, gücenmem. Çok.', "Pick a topic, my lord; I'll explain it page by page, and if you get bored just say \"Ask something else\"; I won't be offended. Much."),
]
export const SKIP_ANSWERS = [
  L('Peki lordum, o işi şimdilik bir kenara koyuyorum. Kenar dolmaya başladı ama olsun. Sıradakine geçelim.', "Very well, my lord, I'll set that aside for now. The side is getting rather full, but never mind. On to the next."),
  L('Anlaşıldı, lordum; o adımı atlıyoruz. Her lordun kendi yolu var; bazılarınınki daha kestirme, bazılarınınki uçurumdan geçer.', "Understood, my lord; we skip that step. Every lord has his own path; some take shortcuts, some go over a cliff."),
  L('Geçtik, lordum. İleride gerekirse öğreticiyi ayarlardan yeniden açarsınız, atlanan adımlar da geri gelir.', "Skipped, my lord. If you need it later, turn the tutorial back on in the settings and the skipped steps return."),
  L('Peki lordum; o binayı şimdilik hayal defterime yazıyorum. Sıradaki adım geliyor.', "Very well, my lord; I'll write that building in my book of dreams for now. Next step coming up."),
  L('Atlıyoruz, lordum. Ben de gençken birçok adımı atladım; çoğu merdivendi, dizlerim hâlâ hatırlar.', 'Skipping, my lord. I skipped many steps in my youth too; most were stairs, and my knees still remember.'),
]
export const TUTORIAL_OFF_ANSWERS = [
  L('Peki lordum, artık kendi yolunuzu çiziyorsunuz. Yanlış çizerseniz ben "demiştim" demeye hazırım. Bir şey sormak isterseniz sohbetin yanındaki Elçi düğmesi beni çağırır.', 'Very well, my lord, you chart your own course now. If you chart it wrong, I stand ready to say "I told you so". If you want to ask anything, the Envoy button beside the chat calls me.'),
  L('Peki lordum; öğretmenlik bitti, danışmanlık başlıyor. Beni çağırmak için sohbetin yanındaki Elçi düğmesi yeter.', 'Very well, my lord; the lessons are over and the counsel begins. The Envoy button beside the chat will summon me.'),
  L('Anladım, lordum, kanatlarınız çıktı. Öğreticiyi ayarlardan yeniden açabilirsiniz; ben de Elçi düğmesinin arkasında beklerim.', "I see, my lord, you've grown your wings. You can turn the tutorial back on in the settings; I'll wait behind the Envoy button."),
  L('Nasıl isterseniz, lordum. Kitabı kapatıyorum ama dilimi kapatmıyorum; Elçi düğmesine basmanız yeter.', "As you wish, my lord. I'm closing the book but not my mouth; just press the Envoy button."),
  L('Peki lordum, ders bitti. Hocalığı bıraktım, elçiliğe döndüm; gerçi ikisi de aynı kapıya çıkar: çok konuşmak.', "Very well, my lord, class dismissed. I've given up teaching and gone back to diplomacy; though both come to the same thing: talking a great deal."),
]

// ---- The tutorial ----------------------------------------------------------------------------------------------------

export const STEPS: Step[] = [
  {
    id: 'palace',
    title: L('Sarayını yerleştir', 'Place your palace'),
    lead: true,
    quips: [
      L('Hoş geldiniz, lordum! Ben elçinizim; haberleri getirir, öğüt veririm ve fazla konuşurum. Sonuncusunda dünya birincisiyim.', 'Welcome, my lord! I am your envoy; I bring news, give advice and talk too much. At the last of these I am world champion.'),
      L('Lordum, hoş geldiniz! Sizden önceki lord da çok iyi bir lorddu, ta ki... neyse, siz ondan iyi olacaksınız. Ben elçinizim.', 'Welcome, my lord! The lord before you was a very good lord too, until... never mind, you will be better. I am your envoy.'),
      L('Ah, yeni lordum! Elçiniz huzurunuzda: haber taşırım, öğüt veririm; susmayı ise hiç öğrenemedim.', 'Ah, my new lord! Your envoy stands before you: I carry news, give advice; keeping quiet, I never learned.'),
      L('Hoş geldiniz, lordum! Kırk yıllık elçiyim; sekiz lorda hizmet ettim, en yakışıklısı sizsiniz.', "Welcome, my lord! Forty years an envoy; I've served eight lords, and you are the handsomest."),
      L('Lordum, nihayet geldiniz! Ben elçinizim. Bundan sonra hep yanınızda olacağım; isteseniz de istemeseniz de.', "My lord, at last you've come! I am your envoy. From now on I shall always be at your side; whether you like it or not."),
      L('Selam olsun, lordum! Elçinizim; haberin iyisini de kötüsünü de getiririm, araya biraz da laf karıştırırım.', 'Greetings, my lord! I am your envoy; I bring the good news and the bad, with a fair bit of chatter in between.'),
    ],
    say: () => L('İlk iş: sarayı hududun içinde istediğiniz yere yerleştirin. Bedava ve anında; böyle fırsat bir daha çıkmaz. Bundan sonra her şeyin bir faturası var, faturaları da ben getireceğim.', "First things first: place the palace anywhere inside your border. Free and instant; you won't get a deal like this again. From here on everything comes with a bill, and I'll be the one bringing the bills."),
    done: ({ kingdom: k }) => hasPalace(k),
    cheers: [
      L('Ne heybetli bir saray! Ben de bir oda kaptım, kuzey kulesinde. Rüzgâr alıyor ama manzarası güzel.', "What an imposing palace! I've grabbed a room in the north tower. Draughty, but what a view."),
      L('Saray yerine oturdu, lordum! Temel taşına adınızı kazıttım; altına küçük harflerle benimkini de.', "The palace is in place, my lord! I had your name carved on the foundation stone; and mine underneath, in small letters."),
      L('Ne güzel bir yer seçtiniz! Bir yanda orman, bir yanda ufuk, ortada siz. Ressamlar sırada.', "What a fine spot you've chosen! Forest on one side, horizon on the other, and you in the middle. The painters are queuing."),
      L('Saray dikildi! Sancağınız göndere çekildi, ben de alkışlamaktan ellerimi acıttım.', "The palace stands! Your banner is up the pole, and I've clapped until my hands hurt."),
      L('İşte sarayınız, lordum! Hizmetliler odalarına yerleşti, ben de en güzel odayı... yani size en yakın odayı aldım.', 'There is your palace, my lord! The servants have settled into their rooms, and I took the finest... I mean, the room nearest you.'),
    ],
  },
  {
    id: 'lumber',
    title: L('Oduncu kampı kur', 'Build a lumber camp'),
    say: () => L('Her yapı yapı malzemesi ister, onu da oduncu kampı üretir. İnşa sekmesinden oduncu kampını seçip haritaya yerleştirin. İnşa ettikleriniz önce bir plana eklenir: alttaki çubukta "Onayla" demeyi unutmayın. İlk oduncu kampı bedava.', 'Every building needs building materials, and a lumber camp makes them. Choose the lumber camp in the Build tab and place it on the map. What you build is first added to a plan: don\'t forget to press "Confirm" on the bar below. The first lumber camp is free.'),
    quips: [
      L('Ağaçlar şimdiden titriyor. Rüzgârdan değil.', "The trees are trembling already. And not from the wind."),
      L('Baltaları ben biledim; az kalsın parmağımı da. Parmak hâlâ bana küs.', "I sharpened the axes myself; and very nearly my finger. The finger still isn't speaking to me."),
      L('Oduncuların şarkısını duyunca anlarsınız ki iş başladı.', "When you hear the woodcutters singing, you'll know the work has begun."),
      L('Bedava olan şeyi geri çevirmek saraya yakışmaz.', 'Refusing something free is unbecoming of a court.'),
      L('"Onayla"yı unutan ilk lord siz olmazsınız; ama son olabilirsiniz.', 'You won\'t be the first lord to forget "Confirm"; but you could be the last.'),
    ],
    done: ({ kingdom: k }) => count(k, 'lumberCamp') > 0,
    go: { label: L('Oduncu kampı seç', 'Choose the lumber camp'), act: build('lumberCamp') },
    hint: 'build',
    cheers: [
      L('Baltalar parlıyor! Ormandaki sincaplar sizi şikâyet etmeye geldi ama ben savdım.', "The axes gleam! The squirrels came to lodge a complaint against you, but I sent them packing."),
      L('Oduncu kampı kuruldu! İlk ağaç devrildi; "Dikkat!" diye bağırdılar, ben de tam altındaydım.', 'The lumber camp is up! The first tree fell; they shouted "Timber!", and I was right underneath.'),
      L('Kamp hazır, lordum. Kereste yığılmaya başladı; marangozlar şimdiden ellerini ovuşturuyor.', 'The camp is ready, my lord. Timber is piling up; the carpenters are already rubbing their hands.'),
      L('Ormanın sesi değişti, lordum: artık balta sesi var. Bence müzik bu.', 'The forest sounds different now, my lord: there are axes in it. Music to my ears.'),
      L('Oduncular işbaşında! Birine adını sordum, "Meşe" dedi. Tam yerinde bir adam.', 'The woodcutters are at work! I asked one his name; he said "Oak". A man in exactly the right job.'),
    ],
  },
  {
    id: 'house',
    title: L('Bir ev kur', 'Build a house'),
    say: () => L('Şimdi halka bir ev. Evler köylüye yer verir; yer olunca köylüler zamanla gelir, gelen köylü çalışır ve vergi verir. Ev sırasını basılı tutup sürükleyerek de dizebilirsiniz.', 'Now a house for the people. Houses give villagers room; where there is room, villagers come in time, and those who come work and pay taxes. You can also lay out a row of houses by holding and dragging.'),
    quips: [
      L('İlk ev de bedava, söylemiş miydim?', 'The first house is free too; did I mention?'),
      L('Bir ev, bir baca, bir duman: işte uygarlık. Sonra bir komşu gelir, şikâyet eder: işte medeniyet.', 'A house, a chimney, some smoke: behold, settlement. Then a neighbour comes and complains: behold, civilisation.'),
      L('Köylüler gelince ilk iş size teşekkür edecekler; ikinci iş vergi; üçüncü iş vergiden şikâyet.', "When the villagers arrive, first they'll thank you; second, they'll pay tax; third, they'll complain about the tax."),
      L('Ev olmadan halk olmaz, halk olmadan lordluk; sıralamayı ben uydurmadım.', "No houses, no people; no people, no lordship; I didn't invent the order of things."),
      L('Komşu lordun evleri derme çatma; bizimkiler sağlam olsun.', "The neighbouring lord's houses are ramshackle; let ours be sturdy."),
    ],
    done: ({ kingdom: k }) => count(k, 'house') > 0,
    go: { label: L('Ev seç', 'Choose a house'), act: build('house') },
    hint: 'build',
    cheers: [
      L('Ev hazır! Bacasından duman tüttüğünü görür görmez komşuların kıskançlıktan sarardığını gördüm.', "The house is ready! The moment smoke rose from its chimney I saw the neighbours turn green with envy."),
      L('Ev bitti! İlk köylü kapıda belirdi bile; elinde bir tavuk, gözünde umut.', 'The house is done! The first villager is already at the door; a chicken in his hand, hope in his eyes.'),
      L('Bir çatı daha, lordum! Halk yakında gelir; ben de karşılama konuşmamı hazırladım, yalnızca yirmi sayfa.', "Another roof, my lord! The people will come soon; I've prepared my welcome speech, only twenty pages."),
      L('Ev hazır, lordum. Bacası tütüyor; demek ki biri çorba pişiriyor. Ben de davetliyim sanırım.', "The house is ready, my lord. Its chimney smokes; someone is making soup. I believe I'm invited."),
      L('Güzel bir ev oldu! Komşu lord görse kendi evlerini yıkıp yeniden yapar.', "A lovely house! If the neighbouring lord saw it, he'd tear his own down and start again."),
    ],
  },
  {
    id: 'farm',
    title: L('Bir tarla kur', 'Build a farm'),
    say: () => L(`Halk yemek yer: her köylü her turda ${balance.economy.foodPerVillager} yemek. Tarla buğday ekerse yemek üretir (keten ekerse yapı malzemesi). Bir tarla kuralım.`, `The people eat: each villager ${balance.economy.foodPerVillager} food per round. A farm sown with wheat makes food (sown with flax, building materials). Let's build a farm.`),
    quips: [
      L('Açlık iyi bir öğretmen değildir; ama çok hızlı öğretir, en çok da göç etmeyi.', "Hunger is not a good teacher; but it teaches very fast, mostly how to emigrate."),
      L('İlk tarla da bedava; bedava ekmek en tatlısıdır.', 'The first farm is free too; free bread is the sweetest.'),
      L('Buğday ekerseniz ben de ekmeğimi sizin sofranızdan yerim.', "Sow wheat and I'll eat my bread at your table."),
      L('Tarlanın üstünden yürünür, merak etmeyin; köylüler dolanmak zorunda kalmaz.', "Farms can be walked across, don't worry; the villagers won't have to go round."),
      L('Bir tarla bin dert çözer; en azından bir derdi kesin.', 'A farm solves a thousand problems; at least one, certainly.'),
    ],
    done: ({ kingdom: k }) => count(k, 'farm') > 0,
    go: { label: L('Tarla seç', 'Choose a farm'), act: build('farm') },
    hint: 'build',
    cheers: [
      L('Buğdaylar şimdiden boy atıyor! Ben de bir somun ayırttım, ileride.', "The wheat is shooting up already! I've reserved a loaf, for later."),
      L('Tarla sürüldü! Korkuluk yok ama ben dikilirsem kargalar zaten kaçar.', "The field is ploughed! There's no scarecrow, but if I stand in it the crows will flee anyway."),
      L('Başaklar sallanıyor, lordum; rüzgâr bile size selam veriyor.', 'The ears of wheat sway, my lord; even the wind salutes you.'),
      L('Tarla hazır! Halk ilk hasadı şimdiden konuşuyor; ben de ilk ekmeği.', 'The farm is ready! The people are already talking about the first harvest; I about the first loaf.'),
      L('Toprak ekildi, lordum. Kırk yıllık elçiyim, ilk kez bir tarlanın kuruluşuna tanık oldum. Duygulandım.', "The earth is sown, my lord. Forty years an envoy, and the first time I've witnessed a farm's founding. I'm quite moved."),
    ],
  },
  {
    id: 'trade',
    title: L('Tüccara mal seç', 'Choose goods for the merchant'),
    say: () => L(`Ticaret noktası sizin; tüccar her seferde seçtiğiniz maldan götürüp satar ve altın getirir (sefer en az ${balance.economy.trade.tripSeconds} saniye, ticaret noktası saraydan uzaksa daha uzun). Ticaret sekmesinden satılacak malı seçin; yapı malzemesini satarsanız inşaata kalmaz.`, `The trading post is yours; on every trip the merchant takes the good you chose, sells it and brings back gold (a trip takes at least ${balance.economy.trade.tripSeconds} seconds, longer if the trading post is far from the palace). Choose what to sell in the Trade tab; sell building materials and there'll be none left to build with.`),
    quips: [
      L('Fazla olanı satın; açlığı değil.', 'Sell the surplus, my lord; not the supper.'),
      L('Yemek satarken bile halkın birkaç dakikalık yemeğini ambarda bırakır; tüccarımız vicdanlıdır.', "Even when selling food he leaves the people a few minutes' worth in the storehouse; our merchant has a conscience."),
      L('Fiyatları lobideki herkes paylaşır; çok satılan mal ucuzlar, unutmayın.', 'Everyone in the lobby shares the prices; what is sold a lot gets cheap, remember.'),
      L('Tüccarımız iyi pazarlık eder; benden öğrendi. Ben de annemden; annem efsaneydi, kasap ondan korkardı.', 'Our merchant haggles well; he learned from me. I learned from my mother; she was a legend, the butcher feared her.'),
      L('Hiçbir şey satmamayı da seçebilirsiniz, ama hazine buna küser.', 'You can also choose to sell nothing, but the treasury will sulk.'),
    ],
    done: ({ kingdom: k }) => k.trade.good !== null || !!k.trade.idle,
    go: { label: L('Ticaret sekmesi', 'Trade tab'), act: tab('trade', 'trade', 'merchant') },
    hint: 'trade',
    cheers: [
      L('Tüccar devesine bindi bile! Deve biraz huysuz ama yolu biliyor.', "The merchant is already on his camel! The camel is a bit grumpy, but it knows the way."),
      L('Ticaret düzene girdi! Kese boş gidecek, dolu dönecek; ben de kapıda bekleyeceğim.', "Trade is under way! The purse goes out empty and comes back full; and I'll be waiting at the gate."),
      L('İşte bu, lordum! Deve iki kez dönüp bana baktı; sanırım beni de satmak istiyor.', "That's it, my lord! The camel turned to look at me twice; I think it wants to sell me too."),
      L('Karar verildi. Altın kokusu şimdiden geliyor, lordum; ya da devenin kokusu.', "It's decided. I can smell the gold already, my lord; or possibly the camel."),
      L('Tüccar işini öğrendi! Ona hayır duası ettim, bir de fiyatları fazla düşürmesin diye nasihat.', "The merchant knows his job! I gave him my blessing, and a word of advice not to drive prices down too far."),
    ],
  },
  {
    id: 'grow',
    title: L('Altı yapıya ulaş', 'Reach six buildings'),
    say: ({ kingdom: k, now }) => {
      const built = k.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road' && b.doneAt <= now).length
      return L(`Lordluğunuz büyüdükçe taç krallıkları sizi fark eder. ${balance.cities.crown.intro.buildings} yapıya ulaşalım (surlar sayılmaz): bir tarla, bir oduncu, bir ev daha... Şu an ${built} bitmiş yapınız var.`, `As your lordship grows, the crown kingdoms take notice. Let's reach ${balance.cities.crown.intro.buildings} buildings (walls don't count): another farm, a lumber camp, a house... You have ${built} finished building${built === 1 ? '' : 's'} right now.`)
    },
    quips: [
      L('Taçlar küçük lordluklara bakmaz; ben baktım ama, bu yüzden buradayım.', "Crowns don't look at little lordships; I did, though, which is why I'm here."),
      L('Saydım, lordum; iki kez saydım, emin olmak için.', 'I counted, my lord; twice, to be sure.'),
      L('Ne kadar çok yapı, o kadar çok baca dumanı; taçlar dumanı uzaktan görür.', 'The more buildings, the more chimney smoke; crowns can see smoke from afar.'),
      L('Acele yok ama gecikme de olmasın; taçların sabrı benimki kadar değildir.', "No rush, but no dawdling either; crowns are not as patient as I am."),
      L('Saray ve ticaret noktası da sayılır, merak etmeyin.', "The palace and the trading post count too, don't worry."),
    ],
    done: ({ kingdom: k, now }) => fealtyOpen(k, now) || k.liege !== undefined,
    go: { label: L('İnşa menüsü', 'Build menu'), act: tab('build') },
    hint: 'build',
    cheers: [
      L('İşte bu! Artık taçlar da sizi konuşuyor; benim kadar olmasa da.', "That's it! Now the crowns are talking about you too; not as much as I do, though."),
      L('Altı yapı! Taçların ulakları yola çıkmış bile; atlarının tozunu buradan görüyorum.', "Six buildings! The crowns' messengers are already on the road; I can see their dust from here."),
      L('Lordluk büyüdü, lordum. Artık haritada bir nokta değil, bir leke... yani çok güzel bir leke.', 'The lordship has grown, my lord. No longer a dot on the map but a blot... I mean, a very handsome blot.'),
      L('Tebrikler, lordum! Taçlar adınızı öğrendi; telaffuzunu ben düzelttim.', 'Congratulations, my lord! The crowns have learned your name; I corrected their pronunciation.'),
      L('İşte şimdi bir lordluk oldu! İki taç da sizi kendi tarafına çekmek isteyecek; nazlanmayı bana bırakın.', "Now that's a lordship! Both crowns will want you on their side; leave the playing hard to get to me."),
    ],
  },
  {
    id: 'fealty',
    title: L('Bir taca biat et', 'Swear fealty to a crown'),
    say: ({ online }) => L(`Haritada iki taç krallığı var: ${online.crowns.join(' ve ')}. Oyuncular krallık değil lorddur; birine biat edersiniz. Sarayın ${balance.cities.crown.requiredForPalaceLevel}. seviyesi için şart, ve seçim sezon boyunca kalıcıdır. Kendi tacınızın devriyesi eğlence merkezinize bahşiş bırakır; rakip taç ise haraççı gönderir.`, `There are two crown kingdoms on the map: ${online.crowns.join(' and ')}. Players are lords, not kingdoms; you swear fealty to one. It is required for a level ${balance.cities.crown.requiredForPalaceLevel} palace, and the choice lasts the whole season. Your own crown's patrol leaves tips at your entertainment hall; the rival crown sends tribute collectors.`),
    quips: [
      L('Seçiminizi iyi yapın; sezon bitene kadar değişmez.', "Choose well; it won't change until the season ends."),
      L('Ben tarafsızım, lordum; yalnızca güçlü olanı severim. Bir de bana hediye gönderenleri. İkisi de aynı taçsa işimiz kolay.', "I am neutral, my lord; I only love the strong. And those who send me presents. If both are the same crown, it's easy."),
      L('Başkenti yakın olan taç ticarette iyidir; tüccar yolda daha az yorulur.', 'A crown with a nearby capital is good for trade; the merchant tires less on the road.'),
      L('Hangi sancak size daha çok yakışır, ona da bakın; renk de önemlidir.', 'Consider which banner suits you best too; colour matters.'),
      L('Biat ettiğiniz tacın sancağı adınızın yanında dalgalanacak; herkes görecek.', "The banner of the crown you swear to will fly beside your name; everyone will see it."),
    ],
    done: ({ kingdom: k, crowns }) => k.liege !== undefined || crowns < 2,
    go: { label: L('Bağlılık bölümü', 'Allegiance section'), act: tab('kingdom', 'palace', 'level') },
    hint: 'kingdom',
    cheers: [
      L('Biat ettiniz! Tacın sancağı adınızın yanında dalgalanıyor. Ben de yeni bir şapka tüyü aldım, uyumlu olsun diye.', "You've sworn fealty! The crown's banner flies beside your name. I bought a new hat feather to match."),
      L('Biat tamam! Tacın ulağı beni kucakladı; biraz fazla sıktı ama gururdan.', "Fealty sworn! The crown's messenger embraced me; a little too hard, but out of pride."),
      L('Artık bir tacın lordusunuz, lordum. Rakip taç da bunu duydu; haraççısını hazırlıyordur.', "You are now a crown's lord, my lord. The rival crown has heard; it's probably readying its tribute collectors."),
      L('Sancak dikildi! Halk şimdiden tacın marşını mırıldanıyor; yanlış sözlerle ama içten.', "The banner is raised! The people are already humming the crown's anthem; with the wrong words, but sincerely."),
      L('Biat ettiniz, lordum. Taç sizi lordlarının listesine yazdı; en üste, ben ısrar ettim.', "You've sworn fealty, my lord. The crown has put you on its list of lords; at the top, I insisted."),
    ],
  },
  {
    id: 'palace2',
    title: L('Sarayı 2. seviyeye yükselt', 'Raise the palace to level 2'),
    say: () => L('Sarayı yükseltmek hududu büyütür, nüfus sınırını artırır ve yeni yapılar açar: kışla, casus evi, pazar, sur, kraliçe... Sarayınıza tıklayıp "Yükselt" deyin. Malzeme yetmezse önce biraz üretin.', 'Upgrading the palace widens the border, raises the population limit and unlocks new buildings: barracks, spy house, market, walls, a queen... Click your palace and press "Upgrade". If materials fall short, produce some first.'),
    quips: [
      L('Yükselen saray, yükselen lord demektir.', 'A rising palace means a rising lord.'),
      L('Mimarlar hazır; yalnızca sizin bir sözünüzü bekliyorlar.', 'The architects are ready; they await only your word.'),
      L('İnşaat sürerken saray eski hâliyle hizmet verir, merak etmeyin.', "While the work goes on, the palace serves as it was; don't worry."),
      L('Kraliçe de bu seviyeyle gelebilir; ben şimdiden çiçek sipariş ettim.', "A queen can come at this level too; I've already ordered the flowers."),
      L('Bir kat daha, bir bakış açısı daha. Bir merdiven daha; dizlerim bunu bir hakaret sayıyor.', 'Another floor, another point of view. Another staircase; my knees take it as an insult.'),
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 2,
    go: { label: L('Saraya git', 'Go to the palace'), act: open('palace') },
    hint: 'kingdom',
    cheers: [
      L('Saray büyüdü, hudut genişledi! Ben de mutfakta biraz genişledim ama o başka konu.', "The palace has grown and the border widened! I've widened a little too, in the kitchen, but that's another matter."),
      L('İkinci kat! Hudut genişledi; yeni topraklarda bir tavşan bulduk, ona da vergi koyalım mı?', 'A second floor! The border has widened; we found a rabbit on the new land; shall we tax it too?'),
      L('Saray yükseldi, lordum! Yeni yapılar açıldı; listesini üç kez okudum, ezberledim.', "The palace has risen, my lord! New buildings are unlocked; I've read the list three times and memorised it."),
      L('Tebrikler! Saray ikinci seviyede; kapıcı da yeni bir üniforma istedi.', 'Congratulations! The palace is at level two; the porter has asked for a new uniform.'),
      L('İşte büyüme bu, lordum: daha geniş hudut, daha çok halk, daha çok iş. Ben de daha çok konuşacağım.', "That's growth, my lord: a wider border, more people, more work. And I shall talk more."),
    ],
  },
  {
    id: 'barracks',
    title: L('Bir kışla kur', 'Build barracks'),
    say: () => L('Kışla, asker havuzundan birlik yetiştirir: mızrakçı süvariyi, okçu mızrakçıyı, süvari okçuyu yener. Bir kışla kuralım.', "Barracks train units from the manpower pool: spearmen beat cavalry, archers beat spearmen, cavalry beat archers. Let's build barracks."),
    quips: [
      L('Barış güzeldir ama haydutlar da güzel bulur.', 'Peace is lovely, but bandits find it lovely too.'),
      L('Asker havuzu mutlu halkla dolar; mutlu halk, cesur asker.', 'The manpower pool fills with happy people; happy people, brave soldiers.'),
      L('Komşular kışlamızı görünce iki kez düşünür; ben de üç kez.', 'The neighbours will think twice when they see our barracks; I think three times.'),
      L('Askerler her tur yemek ve maaş ister; korkusuz bir lordluğun bedeli budur.', 'Soldiers want food and pay every round; the price of a fearless lordship.'),
      L('Kışlada okçuluk da oynanır, lordum; ben hedefin yanında durmam. Bir kez durdum, şapkam hâlâ orada, delik.', "There's archery at the barracks too, my lord; I don't stand near the target. I did once; my hat is still there, with a hole in it."),
    ],
    done: ({ kingdom: k }) => count(k, 'barracks') > 0,
    go: { label: L('Kışla seç', 'Choose barracks'), act: build('barracks') },
    hint: 'build',
    cheers: [
      L('Kışla hazır! Borazancı ilk sabah beni de uyandırdı; saygımı kazandı.', 'The barracks are ready! The bugler woke me too on the first morning; he has earned my respect.'),
      L('Kışla hazır! İlk talimde biri mızrağını ters tuttu; ben düzelttim, askerlik geçmişim var. Bir günlük.', 'The barracks are ready! At the first drill someone held his spear backwards; I corrected him, I have military experience. One day of it.'),
      L('Davullar çaldı, lordum! Kışlanın kapısında gönüllüler sıraya girdi.', 'The drums have sounded, my lord! Volunteers are queuing at the barracks gate.'),
      L('Artık bir kışlamız var. Komşu lordun casusu bunu not etti; ben de onun not ettiğini not ettim.', "We have barracks now. The neighbouring lord's spy noted it; I noted his noting it."),
      L('Kışla kuruldu! Askerler size selam durdu; biri bana da durdu, sanırım beni general sandı.', 'The barracks are built! The soldiers saluted you; one saluted me too, I think he took me for a general.'),
    ],
  },
  {
    id: 'queen',
    title: L('Bir kraliçe getir', 'Bring a queen'),
    say: () => L(`Sarayın ${balance.dynasty.queenForPalaceLevel}. seviyesi için kraliçe gerekir; ayrıca halkın mutluluğunu artırır ve hanedanınız çocuklarla büyür. Halk sekmesinin Kraliçe bölümünden getirebilirsiniz (${n(balance.society.queen.cost.gold)} altın, en az ${balance.society.queen.minPopulation} nüfus).`, `A level ${balance.dynasty.queenForPalaceLevel} palace requires a queen; she also raises the people's happiness and your dynasty grows with children. You can bring one from the Queen section of the People tab (${n(balance.society.queen.cost.gold)} gold, at least ${balance.society.queen.minPopulation} population).`),
    quips: [
      L('Aşkın fiyatı biraz yüksek, kabul; ama değer.', "Love is a little pricey, I grant you; but it's worth it."),
      L('Düğünde ben konuşma yapacağım; kısa tutacağım, söz.', "I'll give a speech at the wedding; I'll keep it short, I promise."),
      L('Bir kraliçe sarayı ısıtır; şömineden daha iyi. Akrabaları da gelir; onlar ısıtmaz, yalnızca yer.', "A queen warms the palace; better than a fireplace. Her relatives come too; they don't warm anything, they only eat."),
      L('Kraliçeyi iyi koruyun, lordum; casuslar kaçırmayı sever.', 'Guard the queen well, my lord; spies love a kidnapping.'),
      L('Taht iki kişiliktir; şimdiye kadar bir yanı hep boş kaldı.', 'The throne seats two; until now one side has always been empty.'),
    ],
    done: ({ kingdom: k }) => !!k.queen || !!k.queenHeldBy,
    go: { label: L('Kraliçe bölümü', 'Queen section'), act: tab('people', 'people', 'queen') },
    hint: 'people',
    cheers: [
      L('Kraliçe saraya geldi! Bana bir bakışta "bu adam çok konuşur" dedi. Haklı, ama kırıldım.', 'The queen has arrived! One look at me and she said "this man talks too much". She\'s right, but I\'m hurt.'),
      L('Kraliçe geldi! Saray bahçesinde güller açtı; bahçıvan yemin ediyor, kendisi yapmamış.', "The queen is here! Roses have bloomed in the palace garden; the gardener swears it wasn't him."),
      L('Düğün çanları çaldı, lordum! Halkın mutluluğu şimdiden arttı; benimki de.', "The wedding bells have rung, my lord! The people's happiness has risen already; and mine."),
      L('Kraliçemiz saraya yerleşti. Bana çay ikram etti; kırk yılda ilk kez biri bana çay ikram etti.', 'Our queen has settled into the palace. She offered me tea; the first time in forty years anyone has offered me tea.'),
      L('Hanedan büyüyor, lordum! Kraliçe beni çocukların hocası yapmayı düşündüğünü söyledi; reddedemedim.', "The dynasty grows, my lord! The queen said she's thinking of making me the children's tutor; I couldn't refuse."),
    ],
  },
  {
    id: 'spy',
    title: L('Bir casus evi kur', 'Build a spy house'),
    say: () => L('Casus evi casus yetiştirir: başka lordların malını, ordusunu, elçilerini öğrenirsiniz; evde tutulan casuslar da size gelen casusları yakalar.', "A spy house trains spies: you learn other lords' goods, armies and envoys; spies kept at home catch the spies sent to you."),
    quips: [
      L('Bilgi altından değerlidir, lordum; en azından daha hafiftir.', 'Knowledge is worth more than gold, my lord; at least it weighs less.'),
      L('Casuslarınızı iyi seçin; benim gibi çok konuşanlar olmasın.', 'Choose your spies well; none who talk as much as I do.'),
      L('Bir lordun her konusuna bir casus; açgözlülük yok.', "One spy per subject per lord; no greed."),
      L('Güçlü bir ağ bir gün bir kraliçeyi bile... yok, bunu ben söylemedim.', "A strong network might one day even... no, I didn't say that."),
      L('Kimse bilmesin; ben bile bilmeyeyim, daha iyi. Çünkü bilirsem herkes bilir; kendimi tanırım.', "Let no one know; better even I don't. Because if I know, everyone knows; I know myself."),
    ],
    done: ({ kingdom: k }) => count(k, 'spyHouse') > 0,
    go: { label: L('Casus evi seç', 'Choose a spy house'), act: build('spyHouse') },
    hint: 'build',
    cheers: [
      L('Casus evi kuruldu. Kimseye söylemeyin. Ben de söylemedim, sadece size.', "The spy house is built. Don't tell anyone. I haven't; only you."),
      L('Casus evi hazır. İlk casus o kadar iyi saklandı ki onu hâlâ arıyoruz.', "The spy house is ready. The first spy hid so well we're still looking for him."),
      L('Casuslarımız işbaşında, lordum. Şşş... Ben de fısıldayarak konuşmaya karar verdim. Bir dakika sürdü.', 'Our spies are at work, my lord. Shhh... I decided to speak in whispers too. It lasted a minute.'),
      L('Casus evi kuruldu. Komşuların sırları artık bizim de sırrımız; paylaşmak güzel şey.', "The spy house is built. The neighbours' secrets are now our secrets too; sharing is a lovely thing."),
      L('Artık gözlerimiz ve kulaklarımız var, lordum. Benimkiler yaşlandı, gençlerini işe aldık.', "Now we have eyes and ears, my lord. Mine have aged, so we've hired younger ones."),
    ],
  },
  {
    id: 'palace3',
    title: L('Sarayı 3. seviyeye yükselt', 'Raise the palace to level 3'),
    say: () => L('3. seviye saray üniversiteyi, hastaneyi, tapınağı ve esrarengiz balıkçı kulübesini açar. Pahalıdır.', 'A level 3 palace unlocks the university, the hospital, the temple and the mysterious fishing hut. It is expensive.'),
    quips: [
      L('Ama tarih ucuz saraylardan söz etmez.', 'But history never speaks of cheap palaces.'),
      L('Hazinedar bedeli duyunca bayıldı; ayılınca bir daha duydu, bir daha bayıldı.', 'The treasurer fainted when he heard the price; when he came round he heard it again and fainted again.'),
      L('Savaş malzemesi de ister; tüccarı bir süre ondan uzak tutun.', 'It wants war materials too; keep the merchant away from them for a while.'),
      L('Üçüncü kattan bakınca komşuların saraylarının tepesini görürsünüz.', "From the third floor you can look down on the tops of the neighbours' palaces."),
      L('Balıkçı kulübesine dikkat; orada tuhaf şeyler olur. Balıkçı bir keresinde şişeden bir mektup çıkardı; benim yıllar önce kayınvalideme yazdığım mektuptu. Hâlâ cevap vermedi.', "Beware the fishing hut; strange things happen there. Once the fisherman pulled a letter from a bottle; it was one I wrote to my mother-in-law years ago. She still hasn't replied."),
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 3,
    go: { label: L('Saraya git', 'Go to the palace'), act: open('palace') },
    hint: 'kingdom',
    cheers: [
      L('Üç kat saray! Merdivenleri çıkarken dizlerim ağlıyor, ama gururdan.', 'A three-storey palace! My knees weep climbing the stairs, but with pride.'),
      L('Üçüncü seviye! Âlimler kapıda, şifacılar kapıda, rahipler kapıda; ben de kapıyı açmaktan yoruldum.', "Level three! Scholars at the door, healers at the door, priests at the door; I'm worn out opening it."),
      L('Saray yine büyüdü, lordum! Şimdi bilgi, şifa ve iman zamanı.', 'The palace has grown again, my lord! Now it is time for learning, healing and faith.'),
      L('Tebrikler! Kuzey kulesindeki odam daha da yükseldi; rüzgâr şapkamı iki kez uçurdu.', 'Congratulations! My room in the north tower is even higher now; the wind has blown my hat off twice.'),
      L('Hanedan kitaplarına yeni bir sayfa, lordum: "Üç kat saray". Yazıyı ben yazdım, süslü harflerle.', 'A new page in the dynasty\'s books, my lord: "A Palace of Three Storeys". I wrote it myself, in fancy letters.'),
    ],
  },
  {
    id: 'university',
    title: L('Bir üniversite kur', 'Build a university'),
    say: () => L('Üniversite araştırma yapar: dört dalda (Hammadde, Savaş, Devlet, Din ve halk) kademe kademe ilerlersiniz ve her kademede iki yoldan birini seçersiniz; öbürüne bir daha dönülmez.', 'The university does research: you advance tier by tier along four branches (Resources, War, State, Faith and people), and at each tier you choose one of two paths; you can never go back for the other.'),
    quips: [
      L('Bilgi pahalıdır, cehalet daha da pahalı. Ben ikisini de denedim; cehalet daha eğlenceliydi ama faturası ağır geldi.', "Knowledge is expensive; ignorance is dearer still. I've tried both; ignorance was more fun, but the bill was steep."),
      L('Seçerken iyi düşünün; geri dönüş yok, ben bunu kırk yaşında öğrendim.', "Think hard when choosing; there's no going back, as I learned at forty."),
      L('Âlimler sakallarını şimdiden uzatmaya başladı.', 'The scholars have already started growing their beards.'),
      L('Aynı anda tek araştırma yürür; acele eden âlim kitabı ters okur.', 'Only one research project at a time; a scholar in a hurry reads the book upside down.'),
      L('Bir gün adınızı taşıyan bir buluş olur; belki de benim adımı.', 'One day there will be a discovery named after you; or perhaps after me.'),
    ],
    done: ({ kingdom: k }) => count(k, 'university') > 0,
    go: { label: L('Üniversite seç', 'Choose a university'), act: build('university') },
    hint: 'build',
    cheers: [
      L('Üniversite açıldı! İlk dersi ben vermek istedim, "Uzun konuşmanın faydaları". Kimse gelmedi.', 'The university is open! I wanted to give the first lecture, "The Benefits of Speaking at Length". Nobody came.'),
      L('Üniversite açıldı! Kütüphaneye ilk kitabı ben bağışladım: "Elçinin Anıları, Cilt 1–12".', 'The university is open! I donated the first book to the library: "Memoirs of an Envoy, Volumes 1–12".'),
      L('Âlimler geldi, lordum; biri kapıdan girerken düşündü, düşerken de bir şey buldu.', 'The scholars have arrived, my lord; one was thinking as he came through the door, tripped, and discovered something on the way down.'),
      L('İlim yuvası hazır! Öğrenciler şimdiden tartışıyor; konu da genellikle yemekhane.', "The seat of learning is ready! The students are already debating; usually about the dining hall."),
      L('Üniversite kuruldu, lordum. Rektör beni fahri doktor yaptı; neyin doktoru olduğunu sormadım.', "The university is founded, my lord. The rector made me an honorary doctor; I didn't ask of what."),
    ],
  },
  {
    id: 'research',
    title: L('İlk araştırmayı bitir', 'Finish your first research'),
    say: () => L('Üniversiteye tıklayıp bir dal seçin ve ilk kademeden bir araştırma başlatın: sulama, kalkan duvarı, mimarlık, şenlikler... Aynı anda bir araştırma yürür; bitince etkisi hemen başlar.', 'Click the university, choose a branch and start a first-tier research project: irrigation, shield wall, architecture, festivals... Only one runs at a time; when it finishes, its effect starts at once.'),
    quips: [
      L('Hangisini seçerseniz seçin, âlimler mutlu olur; maaşlarını alınca.', 'Whichever you choose, the scholars will be happy; once they are paid.'),
      L('Ben şenlikleri öneririm, ama bana soran olmadı.', "I'd recommend festivals, but nobody asked me."),
      L('Bir yolu seçmek öbürünü bırakmak demektir; hayat gibi.', 'Choosing one path means leaving the other; like life.'),
      L('Araştırma pahalıdır; hazineye bir göz atın.', 'Research is expensive; keep an eye on the treasury.'),
      L('Bilim sabır ister, lordum; ben de sabırla bekliyorum. Sabrım tükenince size haber veririm, o da bilimsel bir gözlem olur.', "Science needs patience, my lord; I am waiting patiently. When my patience runs out I'll let you know; that too will be a scientific observation."),
    ],
    done: ({ kingdom: k, now }) => (k.researches ?? []).some((r) => r.doneAt <= now),
    go: { label: L('Üniversiteye git', 'Go to the university'), act: open('university') },
    hint: 'kingdom',
    cheers: [
      L('İlk buluş! Âlimler o kadar sevindi ki cübbelerini ters giydiler.', 'The first discovery! The scholars were so delighted they put their gowns on backwards.'),
      L('Buluş tamam! Âlimler kutlamak için bir şenlik düzenledi; şenlikleri araştırmadıysak biraz sönük geçti.', "Discovery made! The scholars threw a celebration; since we hadn't researched festivals, it was a bit dull."),
      L('İlk araştırma bitti, lordum! Etkisi şimdiden görülüyor; ben de görüyorum, gözlüğümle.', 'The first research is done, my lord! The effect can be seen already; I can see it too, with my spectacles.'),
      L('Bilgi hazinemize ilk mücevher eklendi, lordum. Haraççılar bunu alamaz; denesinler, kafalarına kitap atarız.', "The first jewel has been added to our treasury of knowledge, my lord. The tribute collectors can't take this one; let them try, we'll throw books at them."),
      L('Âlimler kitaplarını kapattı, gülümsedi ve hemen yenisini açtı. Bilim böyledir.', 'The scholars closed their books, smiled, and immediately opened new ones. Such is science.'),
    ],
  },
  {
    id: 'temple',
    title: L('Bir tapınak kur', 'Build a temple'),
    say: () => L('Tapınak halkın mutluluğunu artırır, askerlerinize iman gücü verir; rahipler vaaz verince vergiler halka daha az ağır gelir. Mutlu halk daha hızlı büyür, daha çok asker olmaya razı olur.', "A temple raises the people's happiness and gives your soldiers the strength of faith; when the priests preach, taxes weigh less on the people. Happy people grow faster and more of them are willing to become soldiers."),
    quips: [
      L('Ben de arada bir dua ederim; çoğunlukla sesim kısılmasın diye.', 'I pray now and then too; mostly that I never lose my voice.'),
      L('Rahipler de çok konuşur, lordum; ama onlarınki vaaz sayılır.', "Priests talk a lot too, my lord; but theirs counts as preaching."),
      L('Çanların sesi sınırdan duyulur; komşular kıskanır.', 'The bells can be heard from the border; the neighbours will be jealous.'),
      L('İman zara eklenir; savaşta gökler de hesap yapar.', 'Faith is added to the dice; in battle, heaven does sums too.'),
      L('Vaaz her an verilmez; rahiplerin de dinlenmesi gerekir.', "Sermons can't be given at any moment; priests need rest too."),
    ],
    done: ({ kingdom: k }) => count(k, 'temple') > 0,
    go: { label: L('Tapınak seç', 'Choose a temple'), act: build('temple') },
    hint: 'build',
    cheers: [
      L('Tapınağın çanları çaldı! Ben de dua ettim: daha az haraççı, daha çok bahşiş.', "The temple bells have rung! I prayed too: fewer tribute collectors, more tips."),
      L('Tapınak açıldı! Rahip ilk vaazını verdi; ilk kez birinin benden uzun konuştuğunu gördüm.', 'The temple is open! The priest gave his first sermon; the first time I have ever seen someone talk longer than me.'),
      L('Kutsal ateş yandı, lordum; halkın yüzü de aydınlandı. Benim sakalım da biraz aydınlandı, fazla yaklaştım.', "The sacred fire is lit, my lord, and the people's faces lit up. So did my beard, a little; I got too close."),
      L('Tapınak hazır. Askerler dua etmeyi öğrendi; şimdi kılıçlarını da kutsatmak istiyorlar.', 'The temple is ready. The soldiers have learned to pray; now they want their swords blessed too.'),
      L('Çanlar çalıyor, lordum! Duyan herkes sizin cömertliğinizi konuşuyor.', 'The bells are ringing, my lord! Everyone who hears them speaks of your generosity.'),
    ],
  },
  {
    id: 'hospital',
    title: L('Bir hastane kur', 'Build a hospital'),
    say: () => L('Hasta köylü çalışmaz, vergi vermez ve keyfi kaçar; kışın hastalık daha hızlı yayılır. Hastanenin doktorları hastaları çok daha çabuk iyileştirir.', "A sick villager doesn't work, pays no tax and sulks; in winter sickness spreads faster. A hospital's doctors heal the sick much faster."),
    quips: [
      L('Sağlıklı halk, dolu ambar. Hasta halk, dolu dertleşme saati; ben her gün üç saat dinliyorum.', "Healthy people, full storehouse. Sick people, endless hours of moaning; I listen to three a day."),
      L('Doktorlar da işçi sayılır; onlara kadro ayırın.', 'Doctors count as workers too; give the hospital its staff.'),
      L('Ben doktorlardan korkarım, ama siz korkmayın.', "I'm afraid of doctors, but don't you be."),
      L('Bir hastane bin dua kadar etkilidir; rahiplere söylemeyin.', "A hospital is as effective as a thousand prayers; don't tell the priests."),
      L('Köydeki şifacı kadın otlarını bırakıp hastaneye geçmek istiyor.', 'The village herb-woman wants to give up her herbs and move to the hospital.'),
    ],
    done: ({ kingdom: k }) => count(k, 'hospital') > 0,
    go: { label: L('Hastane seç', 'Choose a hospital'), act: build('hospital') },
    hint: 'build',
    cheers: [
      L('Hastane hazır! Doktor bana baktı, "dilin biraz yorgun" dedi. Ne bilir.', 'The hospital is ready! The doctor looked at me and said "your tongue seems a little tired". What does he know.'),
      L('Hastane açıldı! İlk hasta ben oldum: ayak parmağımı kapıya çarptım. Hemen sardılar.', 'The hospital is open! I was the first patient: I stubbed my toe on the door. They bandaged it at once.'),
      L('Doktorlar işbaşında, lordum. Öksürük sesleri azaldıkça sarayın yankısı güzelleşiyor.', "The doctors are at work, my lord. As the coughing fades, the palace's echo grows sweeter."),
      L('Şifa yurdu hazır! Köylüler iyileşip tarlalarına dönecek; tarlalar da sevinecek.', 'The house of healing is ready! The villagers will recover and return to their fields; and the fields will rejoice.'),
      L('Hastane kuruldu, lordum. Baş doktor size iyi uyumanızı öğütledi; ben de katılıyorum, siz uyurken ben konuşurum.', 'The hospital is built, my lord. The chief physician advises you to sleep well; I agree; I can talk while you sleep.'),
    ],
  },
  {
    id: 'expedition',
    title: L('İlk seferi gönder', 'Send your first expedition'),
    say: () => L('Boşta köylünüz varsa onları sefere gönderin: ava, keşfe, hacca ya da define peşine. Siz yokken de yol alırlar ve dönüşte başlarından geçeni anlatırlar. Çalışan köylüyü göndermeyin; tarlası boş kalır.', "If you have idle villagers, send them on an expedition: hunting, exploring, on pilgrimage or after treasure. They travel even while you're away and tell what befell them on their return. Don't send working villagers; their fields would lie empty."),
    quips: [
      L('Ben de gençken sefere çıkardım; çoğunlukla mutfağa.', 'I went on expeditions in my youth too; mostly to the kitchen.'),
      L('Yanlarına muhafız verirseniz daha güvende olurlar.', "Give them guards and they'll be safer."),
      L('Döndüklerinde anlatacakları hikâyeyi şimdiden merak ediyorum.', "I'm already curious about the tale they'll tell when they return."),
      L('Sefer uzun sürebilir; sabırlı olun, hikâye de ganimet de dönüşte gelir.', 'An expedition can take a while; be patient, the story and the loot both come at the end.'),
      L('Bir harita, bir azık, bir de cesaret; gerisi şans. Haritayı ben çizdim, cesareti de onlar getirsin.', "A map, some provisions, and courage; the rest is luck. I drew the map; they can bring the courage."),
    ],
    done: ({ kingdom: k }) => (k.expeditions ?? []).length > 0,
    go: { label: L('Seferler', 'Expeditions'), act: tab('kingdom', 'palace', 'expeditions') },
    hint: 'kingdom',
    cheers: [
      L('Kafile yola çıktı! Onlara bir harita verdim. Ters tutuyorlardı, düzelttim.', 'The party has set off! I gave them a map. They were holding it upside down; I fixed that.'),
      L('Kafile yola çıktı! Arkalarından el salladım; biri yanlışlıkla bana sırt çantasını uzattı.', 'The party has set off! I waved them goodbye; one of them mistakenly handed me his rucksack.'),
      L('Sefer başladı, lordum. Yolları açık, dönüşleri bereketli olsun. Ayılara da benden selam söylesinler; uzaktan.', "The expedition has begun, my lord. May their roads be open and their return bountiful. And may they give the bears my regards; from a distance."),
      L('İlk sefer! Kafile ufukta kayboldu; ben hâlâ mendilimi sallıyorum.', "The first expedition! The party has vanished over the horizon; I'm still waving my handkerchief."),
      L('Seferciler gitti, lordum. Dönüşte anlatacaklarını yazmak için yeni bir defter aldım.', "The expedition is off, my lord. I've bought a new notebook to write down what they tell us on their return."),
    ],
  },
  {
    id: 'palace4',
    title: L('Sarayı 4. seviyeye yükselt', 'Raise the palace to level 4'),
    say: () => L('4. seviye saray eğlence merkezini, tersaneyi ve hazineyi açar; hudut da genişler. Bedeli ağırdır, savaş malzemesi de ister.', 'A level 4 palace unlocks the entertainment hall, the shipyard and the treasury; the border widens too. The price is steep, and it wants war materials as well.'),
    quips: [
      L('Tüccarı bir süre savaş malzemesinden uzak tutun; satarsa ağlarız.', "Keep the merchant away from war materials for a while; if he sells them, we'll weep."),
      L('Dört kat, lordum; dördüncü kattan bulutlara el sallarsınız. Bulutlar el sallamaz ama yağmur yağdırarak cevap verir.', "Four storeys, my lord; from the fourth floor you can wave to the clouds. Clouds don't wave back, but they answer with rain."),
      L('Hazinedar bu kez bayılmadı; önceden oturdu.', "The treasurer didn't faint this time; he sat down first."),
      L('Eğlence merkezi açılınca tacınızın devriyesi uğrar ve bahşiş bırakır.', "Once the entertainment hall opens, your crown's patrol drops by and leaves tips."),
      L('Bu sizin büyük hamleniz olacak; ozanlar notlarını hazırlıyor.', 'This will be your grand move; the minstrels are preparing their notes.'),
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 4,
    go: { label: L('Saraya git', 'Go to the palace'), act: open('palace') },
    hint: 'kingdom',
    cheers: [
      L('Dördüncü kat! Buradan bakınca rakiplerin sarayları ne kadar küçük görünüyor, değil mi?', "The fourth floor! From up here the rivals' palaces look so small, don't they?"),
      L('Dördüncü seviye! Saray o kadar yüksek ki güneşi herkesten önce biz görüyoruz.', 'Level four! The palace is so tall we see the sun before anyone else.'),
      L('Saray dört kat oldu, lordum! Tersane, hazine, eğlence merkezi: hepsi sizi bekliyor.', 'Four storeys, my lord! Shipyard, treasury, entertainment hall: all await you.'),
      L('Tebrikler, lordum! Taçların ulakları bile artık size "lordum" derken eğiliyor.', 'Congratulations, my lord! Even the crowns\' messengers bow now when they say "my lord".'),
      L('İşte büyük saray, lordum. Merdivenlerine bir de tutamak koydurdum; dizlerim için.', "There's your grand palace, my lord. I had a handrail put on the stairs too; for my knees."),
    ],
  },
  {
    id: 'tavern',
    title: L('Bir eğlence merkezi kur', 'Build an entertainment hall'),
    say: () => L('Eğlence merkezi kendi tacınızın devriyesini ağırlar: her uğrayışta bahşiş bırakırlar. Mini oyunların hepsi de orada oynanır.', "An entertainment hall hosts your own crown's patrol: they leave tips at every visit. Every minigame can be played there too."),
    quips: [
      L('Biraz müzik kimseye zarar vermez; ozan hariç. Onun sesi kulaklara zarar verir.', "A little music never hurt anyone; except the minstrel. His voice hurts the ears."),
      L('Ben de arada uğrarım; elbette yalnızca denetim için. Fıçıların denetimi uzun sürer, çok fıçı var.', "I'll drop in now and then; purely to inspect, of course. Inspecting the barrels takes a long time; there are a lot of barrels."),
      L('Devriye bir kadeh içer, bir kese bırakır; iyi alışveriş.', 'The patrol drinks a cup and leaves a purse; good business.'),
      L('Rakip tacın devriyesi uğramaz; onlar haraççı gönderir, neşeleri de yoktur.', "The rival crown's patrol never drops by; they send tribute collectors, and those are no fun at all."),
      L('Fıçılar dolu, sahne hazır olsun.', 'Let the barrels be full and the stage ready.'),
    ],
    done: ({ kingdom: k }) => count(k, 'tavern') > 0,
    go: { label: L('Eğlence merkezi seç', 'Choose an entertainment hall'), act: build('tavern') },
    hint: 'build',
    cheers: [
      L('Fıçılar açıldı! Devriye yolunu şimdiden şaşırdı bile; bize doğru.', "The barrels are tapped! The patrol has already lost its way; in our direction."),
      L('Eğlence merkezi açıldı! Ozan ilk şarkısını söyledi, ben de dans ettim. Kimse beni durdurmadı, ne yazık ki.', 'The entertainment hall is open! The minstrel sang his first song and I danced. Nobody stopped me, sadly.'),
      L('Fenerler yandı, lordum; devriyenin atları bile kapıda kişniyor.', "The lanterns are lit, my lord; even the patrol's horses are whinnying at the door."),
      L('İlk gece büyük şenlik! Bir askere bahşiş verdim, sonra hatırladım ki bahşişi onlar bırakacaktı.', 'A grand party on the first night! I tipped a soldier, then remembered they were supposed to be tipping us.'),
      L('Eğlence merkezi hazır. Mini oyunlar da burada; okçulukta ben hakemim, örs başında da sağır.', "The entertainment hall is ready. The minigames are here too; I referee the archery, and at the anvil I'm deaf."),
    ],
  },
  {
    id: 'treasury',
    title: L('Bir hazine kur', 'Build a treasury'),
    say: () => L('Hazine dolunca tüccar mal götürmez, vergi de boşa gider. Hazine binası altın yerini büyütür; her seviyesi daha çok tutar.', 'When the treasury is full the merchant carries no goods and taxes go to waste. A treasury building enlarges your gold store; every level holds more.'),
    quips: [
      L('Altının da bir evi olmalı, lordum.', 'Gold needs a home too, my lord.'),
      L('Kilitleri ben seçeceğim; gerçi anahtarlarla aram pek iyi değil. Onlar beni hep terk eder.', "I'll choose the locks; though keys and I don't get on. They always leave me."),
      L('5. seviye sarayda ikinci bir hazine de kurulur.', 'A level 5 palace allows a second treasury.'),
      L('Dolu hazine güzeldir, taşan hazine üzücüdür.', 'A full treasury is lovely; an overflowing one is sad.'),
      L('Hazinedar yeni binayı görmek için sabırsızlanıyor; eski kasası artık kapanmıyor.', "The treasurer can't wait to see the new building; his old chest won't close any more."),
    ],
    done: ({ kingdom: k }) => count(k, 'treasury') > 0,
    go: { label: L('Hazine seç', 'Choose a treasury'), act: build('treasury') },
    hint: 'build',
    cheers: [
      L('Hazinenin kapısına üç kilit vurdum. Anahtarlardan birini kaybettim ama iki tane kaldı.', "I put three locks on the treasury door. I've lost one of the keys, but two remain."),
      L('Hazine kuruldu! Hazinedar içeri girdi, altınları saydı, yeniden saydı ve mutluluktan ağladı.', 'The treasury is built! The treasurer went in, counted the gold, counted it again and wept for joy.'),
      L('Altınlar artık daha geniş bir yerde, lordum. Tüccar da rahat; artık satabilir.', 'The gold has more room now, my lord. And the merchant can relax; he can sell again.'),
      L('Hazinenin kapısı o kadar ağır ki ben açamıyorum; iyi, demek ki hırsız da açamaz.', "The treasury door is so heavy I can't open it; good, then neither can a thief."),
      L('Yeni hazine hazır, lordum. Altınların şıngırtısı en güzel müzik; ozan bunu duymasın.', "The new treasury is ready, my lord. The clink of gold is the sweetest music; don't let the minstrel hear me say so."),
    ],
  },
  {
    id: 'shipyard',
    title: L('Bir tersane kur ve gemi yap', 'Build a shipyard and a ship'),
    say: () => L('Tersane suyun kıyısına kurulur ve gemi yapar: kadırga savaşır, koka yük taşır, çektiri akın eder. Gemilerle deniz ticareti, balık avı ve korsan avı yapılır; savaşta abluka.', 'A shipyard is built on the shore and makes ships: galleys fight, cogs carry cargo, raiders raid. Ships are for sea trade, fishing and pirate-hunting; and blockades in war.'),
    quips: [
      L('Ben yüzme bilmem, lordum; ama gemiye binmeyi severim. İnmeyi daha çok severim, özellikle karaya.', "I can't swim, my lord; but I like boarding ships. I like getting off even more, especially onto land."),
      L('Tayfa asker havuzundan gelir; denizciler köylü sayılmaz.', "The crew comes from the manpower pool; sailors don't count as villagers."),
      L('Çektiri için tersanenin 2. seviyesi gerekir.', 'Raiders need a level 2 shipyard.'),
      L('Bir gemi, bir rüzgâr, bir de iyi bir kaptan; gerisini su bilir.', 'A ship, a wind, and a good captain; the water knows the rest.'),
      L('Korsanlara dikkat; savaş gemileri ticaret seferlerine eskort olur.', 'Beware of pirates; warships escort trading voyages.'),
    ],
    done: ({ kingdom: k }) => count(k, 'shipyard') > 0 && countShips(allShips(k)) > 0,
    go: { label: L('Tersane seç', 'Choose a shipyard'), act: build('shipyard') },
    hint: 'build',
    cheers: [
      L('İlk gemi suya indi! Adını sizin koymanızı isterdim ama tayfa "Elçinin Sesi" demiş. Gurur duydum.', 'The first ship is launched! I wanted you to name her, but the crew called her "The Envoy\'s Voice". I was proud.'),
      L('Gemi kızaktan kaydı! Şişeyi gövdeye vurdum; şişe kırılmadı, kalbim kırıldı.', "The ship slid off the slipway! I smashed the bottle on the hull; the bottle didn't break, my heart did."),
      L('İlk gemimiz suda, lordum! Martılar bile selam durdu.', 'Our first ship is afloat, my lord! Even the gulls saluted.'),
      L('Donanmamız doğdu! Tek gemi ama gururu bir filo kadar.', 'Our navy is born! One ship, but with the pride of a whole fleet.'),
      L('Gemi suya indi, lordum. Kaptan bana bir kaptan şapkası verdi; uymadı ama yine de takıyorum.', "The ship is launched, my lord. The captain gave me a captain's hat; it doesn't fit, but I'm wearing it anyway."),
    ],
  },
  {
    id: 'palace5',
    title: L('Sarayı 5. seviyeye yükselt', 'Raise the palace to level 5'),
    say: () => L('Son basamak: 5. seviye saray hududu en geniş hâline getirir ve en büyük yapıları açar.', 'The last step: a level 5 palace widens the border to its fullest and unlocks the grandest buildings.'),
    quips: [
      L('Bedeli bir krallık fidyesi kadardır; ama hanedan kitapları bunu yazar.', "It costs a king's ransom; but the dynasty's books will record it."),
      L('Bu kattan bakınca taçların başkentlerini görürsünüz; belki.', "From this floor you can see the crowns' capitals; perhaps."),
      L('Mimarlar bu planı çizerken üç kalem kırdı.', 'The architects broke three pencils drawing these plans.'),
      L('Bu son yükseltme, lordum; sonra yalnızca efsane olmak kalır.', 'This is the last upgrade, my lord; after it, all that remains is to become a legend.'),
      L('Hazinedar istifa mektubunu hazırladı; ama imzalamadı, sonunu merak ediyor.', "The treasurer has drafted his resignation letter; but hasn't signed it, he wants to see how it ends."),
    ],
    done: ({ kingdom: k }) => (palaceOf(k)?.level ?? 1) >= 5,
    go: { label: L('Saraya git', 'Go to the palace'), act: open('palace') },
    hint: 'kingdom',
    cheers: [
      L('Beş kat! Lordum, artık ozanlar sizden söz ediyor. Benden de söz etsinler diye para verdim.', "Five storeys! My lord, the minstrels sing of you now. I paid them to mention me too."),
      L('Beşinci seviye! Saray artık bir masal sarayı, lordum; ben de masal anlatıcısı.', 'Level five! The palace is a fairy-tale palace now, my lord; and I am its storyteller.'),
      L('Zirvedesiniz, lordum! Hudut en geniş hâlinde; ben ölçtüm, iki kez.', "You've reached the summit, my lord! The border is at its widest; I measured it, twice."),
      L('Beş kat saray! Kuleye çıktım, bulutlara dokundum; ıslaktı.', 'A five-storey palace! I climbed the tower and touched the clouds; they were wet.'),
      L('Tebrikler, lordum. Bundan sonra size "lordum" değil, "ulu lordum" diyeceğim. Bir süre.', 'Congratulations, my lord. From now on I shall call you not "my lord" but "my most exalted lord". For a while.'),
    ],
  },
  {
    id: 'landmark',
    title: L('Büyük bir yapı kur', 'Build a grand building'),
    say: () => L('5. seviye saray üç büyük yapı açar: kuşatmada sarayı koruyan Hisar, halkı gururlandıran Hanedan anıtı ve tüccarlarınıza pazarlık öğreten Lonca konağı. Biriyle başlayın.', 'A level 5 palace unlocks three grand buildings: the Citadel that guards the palace in a siege, the Dynasty monument that makes the people proud, and the Guild hall that teaches your merchants to haggle. Start with one.'),
    quips: [
      L('Hepsi pahalıdır, hepsi kalıcıdır. Hazinedarın yüz ifadesi de kalıcı olacak.', "All are expensive, all are permanent. So will be the treasurer's expression."),
      L('Ben Hanedan anıtını seçerdim; belki bir köşesinde bana da yer ayırırsınız.', "I'd choose the Dynasty monument; perhaps you'd find a corner of it for me."),
      L('Hisar savaşta, anıt barışta, konak pazarda işe yarar.', 'The citadel serves in war, the monument in peace, the guild hall at market.'),
      L('Bunlar yüzyıllık yapılar, lordum; acele etmeyin ama geç de kalmayın.', "These are buildings for centuries, my lord; don't rush, but don't be late either."),
      L('Büyük yapı büyük lord demektir; küçük elçi de onu anlatır.', 'A grand building means a grand lord; and a humble envoy to tell of it.'),
    ],
    done: ({ kingdom: k }) => count(k, 'citadel') + count(k, 'memorial') + count(k, 'guildHall') > 0,
    go: { label: L('İnşa menüsü', 'Build menu'), act: tab('build') },
    hint: 'build',
    cheers: [
      L('İşte bir eser! Yüz yıl sonra da duracak. Ben de altına adımı kazıdım, küçük harflerle.', "Now that's a masterpiece! It will still stand in a hundred years. I carved my name at the bottom, in small letters."),
      L('Büyük yapı yükseldi! Ozanlar şimdiden üç şarkı yazdı; birinde ben de varım, ikinci kıtada.', "The grand building has risen! The minstrels have already written three songs; I'm in one of them, second verse."),
      L('Bir eser, lordum! Taşlarını ben de taşıdım; birini, en küçüğünü.', 'A masterpiece, my lord! I carried some of the stones myself; one, the smallest.'),
      L('Tamamlandı! Bu yapı biz gittikten sonra da duracak; ama ben bir süre daha buradayım.', "Complete! This building will stand long after we're gone; but I'll be here a while yet."),
      L('Göz kamaştırıcı, lordum. Komşu lord görünce bir süre konuşamadı; ben ise hiç susmadım.', "Dazzling, my lord. The neighbouring lord was speechless for a while when he saw it; I, on the other hand, haven't stopped talking."),
    ],
  },
]

export const TUTORIAL_DONE = [
  L('Öğreteceklerim bu kadar, lordum; gerisini zaman ve komşularınız öğretecek. Yine de bana "Bana oyunu anlat" diye sorarsanız her köşesini anlatırım.', "That's all I have to teach, my lord; time and your neighbours will teach the rest. Still, ask me \"Tell me about the game\" and I'll explain every corner of it."),
  L('Öğretici bitti, lordum; artık benden çok şey biliyorsunuz. Gerçi bunu kimseye söylemeyin. Bir köşeyi merak ederseniz "Bana oyunu anlat" deyin.', "The tutorial is over, my lord; you now know more than I do. Don't tell anyone, though. If you're curious about anything, say \"Tell me about the game\"."),
  L('İşte bu kadar, lordum: sarayı kurdunuz, büyüttünüz, bir taca bağlandınız. Gerisi sizin hikâyeniz. Merak ettiğiniz bir şey olursa beni çağırın.', "That's it, my lord: you built the palace, raised it, and bound yourself to a crown. The rest is your story. If you wonder about anything, call me."),
  L('Son adım da bitti, lordum. Artık yalnızca öğüt vereceğim; öğüt vermek de en sevdiğim iştir. Sorunuz olursa "Bana oyunu anlat" yeter.', 'The last step is done, my lord. From now on I shall only give advice; and giving advice is my favourite thing. If you have questions, "Tell me about the game" is all it takes.'),
  L('Lordum, artık size öğretecek bir şeyim kalmadı; bu beni hem gururlandırıyor hem de işsiz bırakıyor. Ben yine de yanınızdayım; "Bana oyunu anlat" dediğiniz an anlatırım.', 'My lord, I have nothing left to teach you; which makes me both proud and unemployed. I\'m still at your side; the moment you say "Tell me about the game", I\'ll tell you.'),
]

// ---- Topics he explains on request -----------------------------------------------------------------------------------

// Decimals the Turkish way (1,25) or the English way (1.25), and a person's age in the house's years (one real hour each).
const dec = (v: number) => L(String(Math.round(v * 1000) / 1000).replace('.', ','), String(Math.round(v * 1000) / 1000))
const ageOf = (bornAt: number, now: number) => Math.max(0, Math.floor((now - bornAt) / balance.time.gameDayMs))

export const TOPICS: Topic[] = [
  // ---- The basics -------------------------------------------------------------------------------------------------
  {
    id: 'time',
    name: L('Zaman', 'Time'),
    icon: 'time',
    group: 'basics',
    pages: () => {
      const s = balance.time.seasons.food
      const night = balance.society.night
      const idle = balance.economy.idle
      return [
        L(`Zaman burada tuhaf akar, lordum: her gerçek saat bir yıldır. Saatin başında gece yarısı olur, takvim 1 Ocak'a döner, hanedanınız bir yaş büyür. Ben de büyürüm, ama yalnızca enine. Sezon ${balance.time.seasonGameDays} yıl, yani ${n(balance.time.seasonGameDays / 24)} gün sürer; sonra dünya silinir, geriye yalnızca şanınız kalır. Bir de benim anılarım; onlar silinmez, ne yazık ki sizin için.`, `Time runs strangely here, my lord: every real hour is a year. At the top of the hour it is midnight, the calendar turns to 1 January, and your dynasty grows a year older. I grow too, but only around the middle. A season lasts ${balance.time.seasonGameDays} years, that is ${n(balance.time.seasonGameDays / 24)} days; then the world is wiped, and only your glory remains. And my memories; those are never wiped, unfortunately for you.`),
        L(`Aylar beşer dakikada geçer, mevsimler çeyrek saat sürer: gece kış, şafak ilkbahar, öğle yaz, akşam sonbahar. Yazın tarlalar ve iskeleler kıştakinin aşağı yukarı ${dec(Math.round((s.summer / s.winter) * 10) / 10)} katı yemek verir; hastalık da kışın hızlı yayılır. Ben kışı sevmem, lordum; sakalım donuyor.`, `Months pass in five minutes each, seasons last a quarter of an hour: night is winter, dawn spring, noon summer, evening autumn. In summer farms and docks yield about ${dec(Math.round((s.summer / s.winter) * 10) / 10)} times the food they do in winter; and sickness spreads fast in winter. I don't like winter, my lord; my beard freezes.`),
        L(`Ekonomi turlarla işler: her ${balance.economy.productionSeconds} gerçek saniyede bir tur. Binalar üretir, halk yer, vergi ve maaş ödenir.\n\nGece (${night.startHour}:00 ile 0${night.endHour}:00 arası) çabuk geçer ve halk dinlenir: binalar ${pct(night.workRate)} hızla çalışır. Gece mesaisi tam çalıştırır ama mutluluğu ${-night.shiftHappiness} puan düşürür ve yorgunluk biriktirir. Gece çalışan köylü sabah tarlada horlar; inekler şikâyetçi.`, `The economy runs in rounds: one every ${balance.economy.productionSeconds} real seconds. Buildings produce, the people eat, taxes and wages are paid.\n\nNight (between ${night.startHour}:00 and 0${night.endHour}:00) passes quickly and the people rest: buildings work at ${pct(night.workRate)} speed. The night shift keeps them working fully but lowers happiness by ${-night.shiftHappiness} points and builds up fatigue. A villager who works nights snores in the field next morning; the cows have complained.`),
        L(`Siz yokken de dünya akar: inşaatlar biter, tüccar sefere çıkar, ordular yürür. Ama ${balance.economy.away.afterMinutes} dakika görünmezseniz tüccar kaytarır, ${idle.graceHours} saati geçince de her saat üretim, vergi ve tüccarın altını ${pct(idle.perHour)} azalır (en çok ${pct(1 - idle.min)} kadar). Yemek hariç; halk kendi karnını doyurur, o konuda size hiç güvenmezler. Döndüğünüzde "Sen yokken" raporu her şeyi anlatır; raporu ben yazarım, kendimi biraz överim, hoş görün.`, `The world goes on while you're away: buildings finish, the merchant makes his trips, armies march. But if you aren't seen for ${balance.economy.away.afterMinutes} minutes the merchant slacks off, and after ${idle.graceHours} hours production, taxes and the merchant's gold drop by ${pct(idle.perHour)} every hour (by ${pct(1 - idle.min)} at most). Except food; the people feed themselves, they don't trust you with that at all. When you return, the "While you were away" report tells you everything; I write it, and I praise myself a little; do forgive me.`),
      ]
    },
  },
  {
    id: 'build',
    name: L('İnşa', 'Building'),
    icon: 'build',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const built = k.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'road').length
      return [
        L(`İnşa sekmesinden bir yapı seçip hududunuzun içine koyarsınız, lordum. Her inşa, taşıma ve yıkım önce bir plana yazılır; alttaki çubukta "Onayla" deyince hepsi birden gider. Bir planda en çok ${balance.economy.maxPlan} adım olur; benim alışveriş listem bile o kadar uzun değil.`, `You choose a building in the Build tab and place it inside your border, my lord. Every build, move and demolition is first written into a plan; press "Confirm" on the bar below and they all go at once. A plan holds at most ${balance.economy.maxPlan} steps; not even my shopping list is that long.`),
        L(`Aynı anda en çok ${balance.economy.maxConstructions} inşaat yürür, gerisi sırada bekler; sur ve yol sıraya girmez. İlk oduncu kampı, ilk ev ve ilk tarla bedavadır. Şu an ${built} yapınız var${built < balance.cities.crown.intro.buildings ? `; ${balance.cities.crown.intro.buildings} yapıya varınca taçlar kapınızı çalar` : ''}.`, `At most ${balance.economy.maxConstructions} constructions run at once; the rest wait in line; walls and roads don't queue. The first lumber camp, the first house and the first farm are free. You have ${built} building${built === 1 ? '' : 's'} right now${built < balance.cities.crown.intro.buildings ? `; at ${balance.cities.crown.intro.buildings} the crowns will come knocking` : ''}.`),
        L('Kıyı karelerine yalnızca iskele, balıkçı kulübesi ve sur; yol kenarına yalnızca ticaret noktası kurulur. Sur ile binalar arasında boşluk kalır, gözcü kulesi hariç. Surla sarayı kapısız çevirirseniz halk dışarı çıkamaz; buna saray değil hapishane derler. Bir lord bunu yaptı; halk üç gün içeride kaldı, dördüncü gün lordu dışarı attılar, kapıyı ondan sonra yaptılar.', "Only docks, fishing huts and walls go on shore tiles; only trading posts beside roads. Walls keep a gap from buildings, except watchtowers. Wall the palace in without a gate and the people can't get out; that's called a prison, not a palace. One lord did it; the people were stuck inside three days, on the fourth they threw the lord out, and only then built a gate."),
        L(`Yıkılan yapının bedelinin yarısı geri döner. Taşımak harcananın ${pct(balance.economy.move.costShare)} kadarını ister ve yeniden yapmanın ${dec(balance.economy.move.timeFactor)} katı sürer; ama seviyesi ve işçileri korunur. İşçiler de taşınır; kendi eşyalarını, bir de genellikle birkaç tavuk.`, `Demolishing returns half the cost. Moving costs ${pct(balance.economy.move.costShare)} of what was spent and takes ${dec(balance.economy.move.timeFactor)} times as long as rebuilding; but the level and workers are kept. The workers move too; with their belongings, and usually a few chickens.`),
      ]
    },
    go: { label: L('İnşa sekmesi', 'Build tab'), act: tab('build') },
  },
  {
    id: 'economy',
    name: L('Ekonomi', 'Economy'),
    icon: 'gold',
    group: 'basics',
    pages: ({ kingdom: k, now }) => [
      L('Dört kaynak vardır, lordum: altın, yemek, yapı malzemesi ve savaş malzemesi. Beşincisi benim sabrım, o da sınırlı. Oduncu yapı malzemesi, tarla ve iskele yemek, silah atölyesi demir ya da silah üretir. Köylü yetmezse binalar orantılı az üretir.', 'There are four resources, my lord: gold, food, building materials and war materials. The fifth is my patience, and that is limited. Lumber camps make building materials, farms and docks food, weapon workshops iron or weapons. If villagers are short, buildings produce proportionally less.'),
      L(`Depo sınırı saray seviyesiyle büyür, ambarlar ekler; şu an her maldan ${n(storageCap(k, now))} birim tutabilirsiniz, hazineniz ${n(goldCap(k, now))} altın alır. Sığmayan boşa gider. Hazine doluyken tüccar mal götürmez, evde bekler.`, `The storage limit grows with the palace level, and storehouses add to it; right now you can hold ${n(storageCap(k, now))} units of each good, and your treasury takes ${n(goldCap(k, now))} gold. What won't fit is wasted. While the treasury is full the merchant carries nothing and waits at home.`),
      L('Altın vergiden, tüccardan, kasabalardan, seferlerden ve ganimetten gelir. Gider: asker maaşı, gemi bakımı, kasaba bakımı ve rakip tacın haraççıları. Taçlara güvenip hazineyi doldurmayın, lordum; taçlar bu sezon aldıklarından azını geri verir. Taçlar bir kesedir, yalnızca içeri doğru açılır.', "Gold comes from taxes, the merchant, towns, expeditions and loot. It goes on soldiers' pay, ship upkeep, town upkeep and the rival crown's tribute collectors. Don't count on the crowns and fill the treasury, my lord; this season the crowns give back less than they take. A crown is a purse that only opens inwards."),
      L('Dolu ambar tehlikelidir: afetler dolu depodan daha çok götürür, fareler ve pas taşan malı yer. Fareler dolu ambarı kilometrelerce öteden sezer; burunları benimkinden iyidir, dedikoduda. Fazlayı satın, büyük işlere aktarın ya da taca bağışlayın. Ayrıntısı "Afetler ve hava" ile "Büyük işler" konularında.', 'A full storehouse is dangerous: disasters take more from full stores, and rats and rust eat what overflows. Rats can sniff out a full storehouse from miles away; their noses are better than mine, at gossip. Sell the surplus, pour it into great works or donate it to the crown. More in the "Disasters and weather" and "Great works" topics.'),
    ],
    go: { label: L('Depo sekmesi', 'Stores tab'), act: tab('store', 'store', 'books') },
  },
  {
    id: 'trade',
    name: L('Ticaret', 'Trade'),
    icon: 'trade',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const t = balance.economy.trade
      const o = balance.cities.crown.orders
      return [
        L(`Tüccar her seferde seçtiğiniz maldan götürür: ticaret noktasının seviyesine göre ${t.levels.map((l) => l.units).join(' / ')} birim. Sefer ${t.tripSeconds} saniyedir, ticaret noktası saraydan uzaksa uzar. ${k.trade.good === null ? 'Sizin tüccarınız şu an eli kolu bağlı oturuyor, lordum; ona bir mal verin.' : 'Tüccarınız yolda; iyi bir adamdır, biraz konuşkan ama.'}`, `On every trip the merchant takes the good you chose: ${t.levels.map((l) => l.units).join(' / ')} units depending on the trading post's level. A trip takes ${t.tripSeconds} seconds, longer if the trading post is far from the palace. ${k.trade.good === null ? 'Your merchant is sitting idle right now, my lord; give him a good.' : "Your merchant is on the road; a good man, if a little talkative."}`),
        L(`Lobideki bütün lordlar aynı fiyat tablosunu paylaşır: satılan mal ucuzlar, alınan pahalanır, zamanla olağan fiyata döner. Fiyat olağanın ${pct(balance.market.minFactor)} kadarının altına inmez. Taçlar da her yirmi dakikada bir malı piyasadan toplar; dipteki fiyatı onlar kaldırır. Hayır işi değil, lordum; ucuz buldukları için. Taçlar da indirim sever.`, `All the lords in the lobby share one price table: what is sold gets cheaper, what is bought dearer, and prices drift back to normal over time. A price never falls below ${pct(balance.market.minFactor)} of normal. And every twenty minutes the crowns buy a good off the market; they lift the price off the floor. Not out of charity, my lord; because it's cheap. Crowns love a bargain too.`),
        L(`Tüccarı bir taç başkentine de gönderebilirsiniz: ${balance.cities.trade.loadFactor} kat yük götürür, lobi fiyatından satar ama sefer uzar. Taç siparişleri malı lobi fiyatının ${dec(o.payFactor)} katına alır (kendi tacınız biraz fazlasını verir); ödeme kervan dönünce gelir.`, `You can also send the merchant to a crown capital: he carries ${balance.cities.trade.loadFactor} times the load and sells at the lobby price, but the trip is longer. Crown orders buy goods at ${dec(o.payFactor)} times the lobby price (your own crown pays a little more); payment comes when the caravan returns.`),
        L(`Bir de hanlar var, lordum. Ticaret noktası ${balance.economy.trade.inns.minLevel + 1}. seviyeye çıkınca tüccarı bir hana gönderebilirsiniz; sefer lobi pazarınınki kadardır. Her han her mala kendi fiyatını verir: kimi cömerttir, kimi ölü fiyat. Ama hancı yalnız yakınındaki lordlarla iş yapar: sarayınız ya da kasabanız ona ${balance.economy.trade.inns.reachTiles} karodan yakın olmalı ve pastasında en az ${pct(balance.economy.trade.inns.minShare)} payınız bulunmalı. Payınız büyüdükçe fiyat iyileşir; uzak bir hanı istiyorsanız yakınındaki kasabayı alın. Hana tıklayınca fiyatlarını görürsünüz. Ben hanları ezbere bilirim, lordum; elçiliğin yarısı hanlarda geçer, öbür yarısı hanlardan dönerken.`, `Then there are the inns, my lord. Once the trading post reaches level ${balance.economy.trade.inns.minLevel + 1} you can send the merchant to an inn; the trip is as long as to the lobby market. Each inn sets its own price for each good: some are generous, some pay a pittance. But an innkeeper deals only with lords nearby: your palace or a town of yours must be within ${balance.economy.trade.inns.reachTiles} tiles, and you must hold at least ${pct(balance.economy.trade.inns.minShare)} of its pie. The bigger your share, the better the price; if you want a distant inn, take a town near it. Click an inn to see its prices. I know the inns by heart, my lord; half of diplomacy is spent in inns, the other half on the way back from them.`),
        L(`Pazar binası eksik malı altınla almanıza yarar. Bir kasabanın pazarından da alınır, ama kapısında ordunuz durmalı ve asker başına ${balance.towns.market.carryPerSoldier} birim taşınır. Bir de yollardaki yağmacılar var: tüccarın kazancından pay keserler. O ayrı bir dert, "Yağmacılar"da anlatırım.`, `A market building lets you buy what you lack with gold. You can also buy at a town's market, but your army must stand at its gate, and each soldier carries ${balance.towns.market.carryPerSoldier} units. Then there are the bandits on the roads: they skim the merchant's earnings. That's a separate headache; I'll explain under "Bandits".`),
      ]
    },
    go: { label: L('Ticaret sekmesi', 'Trade tab'), act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'people',
    name: L('Nüfus', 'Population'),
    icon: 'people',
    group: 'basics',
    pages: ({ kingdom: k, now }) => {
      const p = population(k, now)
      return [
        L(`Evler köylüye yer verir; köylüler o yere her turda yavaş yavaş gelir, boş yer çoksa daha hızlı. Köylüler boş evi kokusundan bulur, lordum; ben de boş sofrayı. Nüfus sınırı saray seviyesi × ${balance.society.popCapPerPalaceLevel}; sizinki şu an ${popCapFor(palaceLevel(k, now))}, içeride ${p.villagers} köylü var.`, `Houses give villagers room; villagers trickle in every round, faster when there is plenty of room. Villagers sniff out an empty house, my lord; as I do an empty seat at table. The population limit is palace level × ${balance.society.popCapPerPalaceLevel}; yours is ${popCapFor(palaceLevel(k, now))} right now, with ${p.villagers} villagers inside.`),
        L('Büyümeyi mutluluk sürer: yüzde kırkın altında halk gelmez, çok mutsuz halk göç eder. Açlık ve kuşatma da halkı kaçırır, savaş büyümeyi yarıya indirir. Kraliçe ve tapınak hızlandırır. Sarayın hizmetlileri ise hiç gitmez; onlar bana benzer, nereye gitsinler.', "Happiness drives growth: below 40% nobody comes, and very unhappy people move away. Hunger and sieges drive people off too, and war halves growth. A queen and a temple speed it up. The palace servants never leave, though; they're like me, where would they go?"),
        L('Köylüler binalarda çalışır, vergi verir, asker ve denizci olur. Asker ve denizci köylüden düşer, terhis edilen asker köylüye döner. Seferdeki köylüler de çalışmaz; boşta köylünüz varsa onları sefere yollayın. Boşta köylü meydanda zar atar, bana da hile yapar.', "Villagers work in buildings, pay taxes, and become soldiers and sailors. Soldiers and sailors come out of the villagers, and a disbanded soldier becomes a villager again. Villagers on an expedition don't work either; if you have idle villagers, send them off. Idle villagers play dice in the square, and cheat me."),
      ]
    },
    go: { label: L('Halk sekmesi', 'People tab'), act: tab('people', 'people', 'people') },
  },
  {
    id: 'happiness',
    name: L('Mutluluk', 'Happiness'),
    icon: 'happy',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const t = balance.society.tax.levels
      const h = balance.society.happiness
      return [
        L(`Mutluluk her tur bir hedefe doğru kayar; sizinki şu an %${Math.round(k.happiness ?? h.start)}. Taban ${h.base}. Vergi düşükse +${t.low.happiness}, yüksekse ${t.high.happiness}, ağırsa ${t.heavy.happiness}. Kraliçe +${h.queen}, açlık ${h.starving}, yağma ${h.looted}. Elçinin varlığı +0; denedim, ölçtüler, hiç fark etmiyormuş. Kırıldım.`, `Happiness drifts towards a target every round; yours is ${Math.round(k.happiness ?? h.start)}% right now. The base is ${h.base}. Low tax +${t.low.happiness}, high ${t.high.happiness}, heavy ${t.heavy.happiness}. A queen +${h.queen}, hunger ${h.starving}, looting ${h.looted}. The envoy's presence +0; I tried, they measured, it makes no difference at all. I was hurt.`),
        L(`Vergi köylü başına turda düşük ${dec(t.low.goldPerVillager)}, normal ${dec(t.normal.goldPerVillager)}, yüksek ${dec(t.high.goldPerVillager)}, ağır ${dec(t.heavy.goldPerVillager)} altın getirir. Ağır vergi kasayı doldurur, halkı boşaltır. Ben ortası derim, lordum; elçiler hep ortayı sever.`, `Tax brings in, per villager per round: low ${dec(t.low.goldPerVillager)}, normal ${dec(t.normal.goldPerVillager)}, high ${dec(t.high.goldPerVillager)}, heavy ${dec(t.heavy.goldPerVillager)} gold. Heavy tax fills the chest and empties the land. I say the middle, my lord; envoys always love the middle.`),
        L(`Gece mesaisi mutluluğu ${-balance.society.night.shiftHappiness} puan, kapısız sur (hapishane) ${-h.imprisoned} puan düşürür. Yollardaki yağmacılar ve sulardaki korsanlar birlikte en çok ${balance.outlaws.happinessCap} puan götürür. Tapınak, şenlik, hanedan anıtı ve Ulu Katedral ise yükseltir.`, `The night shift lowers happiness by ${-balance.society.night.shiftHappiness} points, walls without a gate (a prison) by ${-h.imprisoned}. Bandits on the roads and pirates on the water together take at most ${balance.outlaws.happinessCap} points. A temple, festivals, the dynasty monument and the Grand Cathedral raise it.`),
        L('Mutlu halk hızlı büyür, asker olmaya gönüllüdür, kasabalarınız da size daha sadık kalır. Mutsuz halk pahalıya asker olur ve göç eder. Kısacası, lordum, halkı güldürmek bedava değildir ama ağlatmak daha pahalıdır.', "Happy people grow fast, volunteer as soldiers, and your towns stay more loyal. Unhappy people make costly soldiers and move away. In short, my lord, making the people laugh isn't free, but making them weep costs more."),
      ]
    },
    go: { label: L('Mutluluk bölümü', 'Happiness section'), act: tab('people', 'people', 'mood') },
  },
  {
    id: 'disasters',
    name: L('Afetler ve hava', 'Disasters and weather'),
    icon: 'snow',
    group: 'basics',
    pages: ({ kingdom: k }) => {
      const c = balance.institutions.events.crisis
      const toll = c.toll
      const hoard = balance.institutions.events.hoard
      const sh = balance.weather.showers
      return [
        L(`Yangın, sel, deprem, çekirge, kurt… Bir kriz gelince üç yol sunarım: köylüleri seferber et (${min(c.villagers.seconds)} dakika iş gücü ${pct(-c.villagers.work)} düşer), orduyu seferber et (bir iki asker ölür, ordu ${min(c.army.lockSeconds)} dakika sefere çıkamaz) ya da bir şey yapma. Karar için ${c.decideSeconds} saniye var; susarsanız bir şey yapılmamış sayılır. Ben iki dakikada bir kararı ancak düşünmeye başlarım, siz benden hızlı olun.`, `Fire, flood, earthquake, locusts, wolves… When a crisis strikes I offer three paths: rally the villagers (labour drops ${pct(-c.villagers.work)} for ${min(c.villagers.seconds)} minutes), rally the army (a soldier or two dies and the army can't march for ${min(c.army.lockSeconds)} minutes), or do nothing. You have ${c.decideSeconds} seconds to decide; say nothing and it counts as doing nothing. In two minutes I've barely begun to consider a decision; do be quicker than me.`),
        L(`Kriz nasıl karşılanırsa karşılansın depodan bir pay götürür: köylüler kaybı ${pct(toll.choice.villagers)} kadarına, ordu ${pct(toll.choice.army)} kadarına indirir. Örneğin orman yangını yapı malzemesinin ${pct(toll.kinds.forestFire.materials)} kadarını yakar. Depo ${pct(toll.fullAt)} doluluğu geçtikçe pay büyür, tam doluyken iki katıdır; ama ${toll.floor} birimin altı sayılmaz ve bir afet bir maldan ${pct(toll.maxShare)} kadarından fazlasını almaz.`, `However a crisis is met, it takes a share of the stores: the villagers cut the loss to ${pct(toll.choice.villagers)}, the army to ${pct(toll.choice.army)}. A forest fire, for example, burns ${pct(toll.kinds.forestFire.materials)} of the building materials. The share grows as the stores pass ${pct(toll.fullAt)} full, doubling when completely full; but the first ${toll.floor} units don't count, and no disaster takes more than ${pct(toll.maxShare)} of a good.`),
        L(`Bir de sessiz düşmanlar vardır: her yarım saatte bir, ambarın ${pct(hoard.fullAt)} kadarından dolu bir mal varsa fareler yemeği, rutubet yapı malzemesini, pas savaş malzemesini yer (${pct(hoard.minShare)}–${pct(hoard.maxShare)}). Seçim yok, lordum; tek çare ambarı ağzına kadar doldurmamak. Farelerle pazarlık denedim; peynir istediler, peyniri de yediler, ambarı da.`, `Then there are the silent enemies: every half hour, if a good is over ${pct(hoard.fullAt)} of the storehouse, rats eat the food, damp the building materials, rust the war materials (${pct(hoard.minShare)}–${pct(hoard.maxShare)}). There's no choice, my lord; the only cure is not to fill the storehouse to the brim. I tried bargaining with the rats; they asked for cheese, ate the cheese, and the storehouse too.`),
        L(`Kâhya tutarsanız cevapsız kalan krizde köylüleri o seferber eder, her seferinde ${c.steward.fee.gold} altın alır.${k.steward ? ' Sizin kâhyanız görevde; iyi adamdır, biraz cimri ama.' : ' Çevrimdışı lordun en iyi dostudur.'}\n\nHavaya gelince: yağmur, fırtına, sel ve dolu haritayı grileştirir; ayrıca on dakikada bir kısa bir sağanak geçebilir: yazın ${pct(sh.seasons.summer.chance)}, ilkbaharda ${pct(sh.seasons.spring.chance)}, sonbaharda ${pct(sh.seasons.autumn.chance)} ihtimalle; bazıları şimşekli fırtınadır. Kışın yağan kardır. Fırtınada denizde korsan saldırısı ${dec(balance.navy.seaWeather.storm)} kat sıklaşır, sis ise korsanları şaşırtır.`, `Hire a steward and he rallies the villagers for any crisis left unanswered, taking ${c.steward.fee.gold} gold each time.${k.steward ? " Your steward is on duty; a good man, if a bit stingy." : " He is the offline lord's best friend."}\n\nAs for the weather: rain, storms, floods and hail turn the map grey; and every ten minutes a short shower may pass: ${pct(sh.seasons.summer.chance)} chance in summer, ${pct(sh.seasons.spring.chance)} in spring, ${pct(sh.seasons.autumn.chance)} in autumn; some are thunderstorms. In winter it snows. In a storm, pirate attacks at sea are ${dec(balance.navy.seaWeather.storm)} times as frequent, while fog confuses the pirates.`),
      ]
    },
    go: { label: L('Sağlık ve kâhya', 'Health and steward'), act: tab('people', 'people', 'mood') },
  },
  {
    id: 'events',
    name: L('Günün olayları', 'Events of the day'),
    icon: 'bell',
    group: 'basics',
    pages: () => {
      const e = balance.institutions.events
      return [
        L(`Olaylar iki kanaldan gelir: bütün lobiye (yağmur, kuyruklu yıldız, dolunay şenliği, salgın…) ve yalnızca size (define, gezgin ozan, haydut baskını…). Her ${min(e.lobby.windowSeconds)} dakikalık pencerede lobiye ${pct(e.lobby.chance)}, size ${pct(e.kingdom.chance)} ihtimalle bir olay düşer ve ${min(e.lobby.minSeconds)}–${min(e.lobby.maxSeconds)} dakika sürer.`, `Events come through two channels: to the whole lobby (rain, a comet, the full-moon festival, plague…) and to you alone (treasure, a wandering minstrel, a bandit raid…). In every ${min(e.lobby.windowSeconds)}-minute window there is a ${pct(e.lobby.chance)} chance of a lobby event and ${pct(e.kingdom.chance)} of one for you, lasting ${min(e.lobby.minSeconds)}–${min(e.lobby.maxSeconds)} minutes.`),
        L(`Bazı olaylar iki yol sunar: ozanı saraya davet edersiniz ya da şapka dolaştırırsınız, kayıp kervanın yükünü alırsınız ya da sahibine haber salarsınız. Her yolun bir bedeli ve bir kazancı vardır; karar için ${e.choice.decideSeconds} saniye var. Bedelini karşılayamadığınız yol kapalıdır.`, `Some events offer two paths: invite the minstrel to court or pass the hat round, take the lost caravan's cargo or send word to its owners. Each path has a cost and a gain; you have ${e.choice.decideSeconds} seconds to decide. A path you can't afford is closed.`),
        L('Pencereler sıra sıra gelir; "Tümünü kapat" yalnızca haber verenleri kapatır, cevap bekleyenler kalır. Bakmadığınız haberleri bayatlayınca tek bir özete toplarım; hepsi günlükte de durur. Ben unutmam, lordum; unutsam elçilikten atarlar. Bir kez unuttum, bir hafta beni bahçıvan yaptılar; güller hâlâ bana küs.', 'Windows come one after another; "Close all" closes only those that merely inform, and those awaiting an answer stay. News you don\'t look at, I gather into a single summary once it goes stale; it is all in the journal too. I never forget, my lord; if I did, they\'d throw me out of the service. I forgot once, and they made me a gardener for a week; the roses still aren\'t speaking to me.'),
      ]
    },
    go: { label: L('Günlüğü aç', 'Open the journal'), act: tab('journal') },
  },

  // ---- The army and war -------------------------------------------------------------------------------------------
  {
    id: 'army',
    name: L('Ordu', 'Army'),
    icon: 'swords',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const delay = Math.round((balance.time.messengerDelayGameDays * balance.time.gameDayMs) / 1000)
      const c = balance.dynasty.command
      return [
        L(`Kışla asker havuzundan birlik yetiştirir: mızrakçı süvariyi yener, okçu mızrakçıyı, süvari okçuyu ve kalkanlıyı; kalkanlı da okçuyu. Mancınık sahada zayıftır ama kuşatmada surları siler. Garnizonunuzda şu an ${k.soldiers ?? 0} asker var. Hepsi kahraman, en azından yemek saatinde.`, `Barracks train units from the manpower pool: spearmen beat cavalry, archers beat spearmen, cavalry beat archers and shield infantry, and shield infantry beat archers. Catapults are weak in the field but wipe out walls in a siege. Your garrison has ${k.soldiers ?? 0} soldiers right now. Heroes, every one; at mealtimes, at least.`),
        L(`Garnizondan en çok ${balance.military.maxArmies} ordu çıkarırsınız; ${balance.military.mergeTiles} karo yakındaki iki ordu birleşir. Hududun dışındaki orduya emir elçiyle gider (${delay} saniye); elçi vardıktan sonra ${balance.time.contactSeconds} saniye yeni emirler hemen uygulanır. O elçiler benim çıraklarımdır, lordum; yavaşlarsa bana söyleyin.`, `You can field at most ${balance.military.maxArmies} armies from the garrison; two armies within ${balance.military.mergeTiles} tiles can merge. Orders to an army outside the border go by messenger (${delay} seconds); once he arrives, new orders take effect at once for ${balance.time.contactSeconds} seconds. Those messengers are my apprentices, my lord; if they dawdle, tell me.`),
        L(`Moral yürürken düşer, evde ve hanların yanında hızla toparlanır. Bir yerde durdukça saha bilgisi birikir ve zara en çok +${dec(balance.military.familiarity.maxBonus)} ekler. Ordular yolları sever ve köprülerden geçer; surlardan geçemez, kendi kapınızdan geçer.`, `Morale drops on the march and recovers quickly at home and near inns. Staying in one place builds up knowledge of the ground, adding at most +${dec(balance.military.familiarity.maxBonus)} to the dice. Armies love roads and cross by bridges; they can't pass through walls, only through your own gates.`),
        L(`Kralınız orduya bizzat komuta edebilir: ordu sarayın kapısında durmalı, sarayda bir kraliçe ve en az bir oğul olmalı. Kralın ordusuna emir elçisiz gider ve zara kralın savaş yeteneğiyle bonus eklenir. Bedeli: kaybedilen muharebede ${pct(c.fall)} ihtimalle kral düşer. Atından değil, lordum, tarihten. Ben olsam sarayda kalırdım; ama ben olsam hiçbir yere gitmezdim zaten.`, `Your king can command an army in person: the army must stand at the palace gate, and there must be a queen and at least one son at court. Orders to the king's army need no messenger, and the king's martial skill adds a bonus to the dice. The price: in a lost battle there is a ${pct(c.fall)} chance the king falls. Not off his horse, my lord; out of history. I'd stay at the palace; but then, I'd never go anywhere anyway.`),
      ]
    },
    go: { label: L('Ordu sekmesi', 'Army tab'), act: tab('army', 'army', 'land') },
  },
  {
    id: 'war',
    name: L('Savaş', 'War'),
    icon: 'banner',
    group: 'war',
    pages: () => {
      const d = balance.diplomacy
      const b = balance.military.battle
      return [
        L(`Savaş ilanı için ilişki en fazla ${d.war.maxRelation} olmalı; savaş gerekçeniz varsa ${d.casusBelli.maxRelation} yeter. Gerekçesiz savaş açan, lobideki herkesle ${-d.casusBelli.infamy} puan ilişki kaybeder. Kılıcı çekmeden önce bir bahane bulun, lordum; tarih bahaneleri sever.`, `To declare war, relations must be at most ${d.war.maxRelation}; with a casus belli, ${d.casusBelli.maxRelation} will do. Whoever starts a war without one loses ${-d.casusBelli.infamy} points of relations with everyone in the lobby. Find a pretext before drawing your sword, my lord; history loves a pretext.`),
        L(`Savaştaki iki ordu ${balance.military.contactTiles} karo yaklaşınca meydan muharebesi olur. Her ${b.roundSeconds} saniyede bir tur: iki taraf d${b.dice} atar, saha bilgisi, kuleler, tapınak ve birlik üstünlüğü eklenir. Morali ya da askeri biten yenilir, en geç ${b.maxRounds}. turda saldıran çekilir. "İzle" ile seyredersiniz. Ben gözlerimi kapatırım, sonucu siz söylersiniz.`, `When two armies at war come within ${balance.military.contactTiles} tiles, a pitched battle begins. One round every ${b.roundSeconds} seconds: both sides roll a d${b.dice}, adding knowledge of the ground, towers, temple and unit advantage. Whoever runs out of morale or soldiers loses; by round ${b.maxRounds} at the latest the attacker withdraws. You can follow it with "Watch". I close my eyes; you tell me how it ended.`),
        L(`Düşman sarayına varan ordu kuşatır: garnizon, gözcü kuleleri ve surlar savunur. Kazanan her depodan ${pct(balance.military.siege.lootShare)} alır, ama asker başına en çok ${balance.military.siege.carryPerSoldier} birim taşır. Düşen saray ${min(balance.military.siege.shieldSeconds)} dakika kalkan kazanır. Bir de gözdağı var: düşman hududunun yanında bekleyen ordu halkını korkutur (mutluluk ${balance.military.fear.happiness}).`, `An army that reaches an enemy palace lays siege: the garrison, watchtowers and walls defend it. The winner takes ${pct(balance.military.siege.lootShare)} of every store, but each soldier carries at most ${balance.military.siege.carryPerSoldier} units. A fallen palace gains a ${min(balance.military.siege.shieldSeconds)}-minute shield. There's intimidation too: an army waiting beside an enemy border frightens its people (happiness ${balance.military.fear.happiness}).`),
        L(`Savaş puanı muharebelerden (${d.warScore.battle}) ve kuşatmalardan (${d.warScore.siege}) birikir. Barışta altın istersiniz (her ${d.peace.goldPerScore} altın bir puan) ya da ${d.peace.tributeMinScore} puanla haraç; ${d.peace.enforceScore} puana ulaşan barışı dayatır. Barış antlaşmalarını ben okurum; en sevdiğim kısım, karşı tarafın imzası titrediği yer.`, `War score builds from battles (${d.warScore.battle}) and sieges (${d.warScore.siege}). In peace terms you can demand gold (${d.peace.goldPerScore} gold per point) or tribute with ${d.peace.tributeMinScore} points; whoever reaches ${d.peace.enforceScore} points can impose peace. I read the peace treaties aloud; my favourite part is where the other side's signature wobbles.`),
      ]
    },
    go: { label: L('Savaşlar', 'Wars'), act: tab('army', 'army', 'battles') },
  },
  {
    id: 'towns',
    name: L('Kasabalar', 'Towns'),
    icon: 'house',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const t = balance.towns
      const tiers = t.overreach.tiers
      const held = k.towns?.length ?? 0
      return [
        L(`Haritada küçük kasabalar vardır. Kuşatma yalnızca kasabanın panelinden başlar; ordu kapıya varınca ${min(t.siegeSeconds)} dakika sürer ve her ${min(t.siegeRoundSeconds)} dakikada bir asker kaybedersiniz. Sahipsiz kasaba ${t.garrison[0]}–${t.garrison[1]} askerle direnir; kazıklı olanlar daha zor düşer. Kasabalılar inatçıdır, lordum; muhtarları da benim kadar konuşur.`, `There are small towns on the map. A siege starts only from the town's panel; once the army reaches the gate it lasts ${min(t.siegeSeconds)} minutes and you lose a soldier every ${min(t.siegeRoundSeconds)} minutes. An unclaimed town resists with ${t.garrison[0]}–${t.garrison[1]} soldiers; palisaded ones fall harder. Townsfolk are stubborn, my lord; and their headmen talk as much as I do.`),
        L(`Alınan kasaba her tur gönderir: vergi kasabası ${dec(t.kinds.gold.perRound)} altın, tarım ${t.kinds.food.perRound} yemek, kereste ${t.kinds.materials.perRound} yapı, demirci ${dec(t.kinds.arms.perRound)} savaş malzemesi; kalabalık kasaba ${t.kinds.people.villagers} köylülük yer verir. Bakımı siz seçersiniz; bakım sadakati, sadakat de katkıyı büyütür.`, `A captured town sends something every round: a tax town ${dec(t.kinds.gold.perRound)} gold, a farming town ${t.kinds.food.perRound} food, a timber town ${t.kinds.materials.perRound} building materials, a smithing town ${dec(t.kinds.arms.perRound)} war materials; a populous town gives room for ${t.kinds.people.villagers} villagers. You choose the upkeep; upkeep raises loyalty, and loyalty raises the contribution.`),
        L(`Sadakat ${t.revolt.below} puanın altına inerse kasaba ayaklanır, asiler kapıya dayanır; ordunuzla bastırırsanız sadakat +${t.rebels.quellLoyalty} olur. ${t.revolt.breakAwayBelow} puanın altında kasaba sizden kopar. Kopan kasaba ayrılık mektubu bile yazmaz; kapıya "artık başkasıyız" diye bir tabela asar.`, `If loyalty falls below ${t.revolt.below}, the town revolts and rebels gather at its gate; crush them with your army and loyalty rises by ${t.rebels.quellLoyalty}. Below ${t.revolt.breakAwayBelow} the town breaks away from you. A town that breaks away doesn't even write a farewell letter; it hangs a sign on the gate saying "under new management".`),
        L(`Açgözlülüğün de cezası vardır, lordum: ${tiers[0].towns} kasabada hafif, ${tiers[1].towns} kasabada ağır ceza, ${tiers[2].towns} ve üstünde sadakat %${tiers[2].loyaltyCap} kadarında takılır ve hepsi sonunda kopar. ${held ? `Şu an ${held} kasabanız var.` : 'Henüz kasabanız yok; bir tanesi iyi gelir, ikisi de olur.'} Fazlasını paneldeki "Serbest bırak" ile salabilirsiniz.`, `Greed has its price too, my lord: a light penalty at ${tiers[0].towns} towns, a heavy one at ${tiers[1].towns}, and at ${tiers[2].towns} or more loyalty is stuck at ${tiers[2].loyaltyCap}% and they all break away in the end. ${held ? `You hold ${held} town${held === 1 ? '' : 's'} right now.` : "You have no towns yet; one would do you good, two would be fine."} You can let the extras go with "Release" in the panel.`),
      ]
    },
  },
  {
    id: 'navy',
    name: L('Donanma', 'Navy'),
    icon: 'ship',
    group: 'war',
    pages: ({ kingdom: k }) => {
      const s = balance.navy.ships
      const ships = countShips(allShips(k))
      return [
        L(`Tersane 4. seviye sarayla açılır ve kıyıya kurulur. Kadırga (${s.galley.cost.gold} altın) savaşır, koka (${s.cog.cost.gold}) yük taşır ve balık tutar, çektiri (${s.corsair.cost.gold}) hızlı akıncıdır. Kadırga çektiriyi, çektiri kokayı yener. Tayfa asker havuzundan gelir. ${ships ? `Limanınızda ${ships} gemi var.` : 'Henüz geminiz yok; ben de denize pek güvenmem zaten.'}`, `The shipyard unlocks with a level 4 palace and is built on the shore. Galleys (${s.galley.cost.gold} gold) fight, cogs (${s.cog.cost.gold}) carry cargo and fish, raiders (${s.corsair.cost.gold}) strike fast. Galleys beat raiders, raiders beat cogs. Crews come from the manpower pool. ${ships ? `You have ${ships} ship${ships === 1 ? '' : 's'} in port.` : "You have no ships yet; I don't much trust the sea anyway."}`),
        L(`Limandan en çok ${balance.navy.maxFleets} filo çıkar. Barışta deniz ticareti yapar (lobi fiyatının ${pct(balance.navy.trade.priceFactor)} kadarına satar, piyasayı az düşürür), balık tutar ya da korsan avlar. Filoyu "Hareket et" ile haritada istediğiniz suya da gönderirsiniz.`, `At most ${balance.navy.maxFleets} fleets can leave port. In peace they trade by sea (selling at ${pct(balance.navy.trade.priceFactor)} of the lobby price and barely denting the market), fish, or hunt pirates. You can also send a fleet to any water on the map with "Move".`),
        L(`Savaşta abluka kurarsınız: düşmanın iskelesi balık tutamaz, ticareti durur, halkı üzülür. Kıyı akını depolarından her malın ${pct(balance.navy.raid.stealShare)} kadarını kaçırır. Ablukaya düşen taraf savaş gemileriyle ablukayı yarabilir. Deniz muharebesinde kendi iskelesindeki savunan ${pct(balance.navy.battle.harbourBonus)} güçlüdür. Evinin önünde herkes cesurdur, lordum; ben de sarayın koridorunda aslan kesilirim.`, `In war you can blockade: the enemy's dock can't fish, its trade stops, its people grieve. A coastal raid carries off ${pct(balance.navy.raid.stealShare)} of every good in their stores. The blockaded side can break the blockade with warships. In a naval battle, a defender at its own dock is ${pct(balance.navy.battle.harbourBonus)} stronger. Everyone is brave on their own doorstep, my lord; I'm a lion in the palace corridors myself.`),
      ]
    },
    go: { label: L('Donanma bölümü', 'Navy section'), act: tab('army', 'army', 'sea') },
  },

  // ---- The crowns, the court and intrigue -----------------------------------------------------------------------------
  {
    id: 'crowns',
    name: L('Taçlar', 'Crowns'),
    icon: 'crown',
    group: 'court',
    pages: ({ kingdom: k, online }) => {
      const cr = balance.cities.crown
      const tr = cr.patrol.tribute
      const asked = Math.max(tr.min, Math.round(k.stock.gold * tr.share))
      const gifts = cr.gifts.map((g) => g.gold).join(' / ')
      return [
        L(`İki taç krallığı vardır: ${online.crowns.join(' ve ') || 'iki başkent'}. Oyuncular krallık değil, onlardan birine biat eden lordlardır. Biat sezon boyunca kalıcıdır ve sarayın ${cr.requiredForPalaceLevel}. seviyesi için şarttır. ${k.liege === undefined || k.liege === null ? 'Siz henüz kimseye bağlanmadınız, lordum.' : `Bağlı olduğunuz taç: ${online.crowns[k.liege] ?? 'bilinmiyor'}.`}`, `There are two crown kingdoms: ${online.crowns.join(' and ') || 'two capitals'}. Players are not kingdoms but lords who swear fealty to one of them. Fealty lasts the whole season and is required for a level ${cr.requiredForPalaceLevel} palace. ${k.liege === undefined || k.liege === null ? "You haven't bound yourself to anyone yet, my lord." : `Your crown: ${online.crowns[k.liege] ?? 'unknown'}.`}`),
        L(`Şimdi acı gerçek, lordum: taçlar size para kazandırmaz. Rakip taç her ${min(tr.everySeconds)} dakikada bir haraççı gönderir ve hazinenin ${pct(tr.share)} kadarını, en az ${tr.min} altın ister; bugünkü hazinenizle ${n(asked)} altın. Reddederseniz o tacın gözünden düşersiniz; konuşursanız, huyunu tutturursanız ${pct(tr.talk.discount[tr.talk.discount.length - 1])} kadar indirim koparırsınız.`, `Now the bitter truth, my lord: the crowns don't make you money. Every ${min(tr.everySeconds)} minutes the rival crown sends tribute collectors asking for ${pct(tr.share)} of the treasury, at least ${tr.min} gold; with your treasury today, ${n(asked)} gold. Refuse and you fall from that crown's favour; talk to them and match their temper and you can wring out a discount of up to ${pct(tr.talk.discount[tr.talk.discount.length - 1])}.`),
        L(`Cevap vermezseniz haraç kendiliğinden ödenir; oyundayken susarsanız ${pct(tr.afkFactor - 1)} fazlasıyla. Kendi tacınızın devriyesi ise eğlence merkezinize uğrayınca yalnızca ${cr.patrol.tip} altın bahşiş bırakır; armağanlar ilişkinize göre ${gifts} altın. Yani altını tüccardan, kasabalardan, seferlerden ve ganimetten kazanırsınız; taçtan kazandığınız itibardır. İtibar da bir tür paradır, lordum; yalnız hiçbir handa geçmiyor.`, `If you don't answer, the tribute pays itself; if you stay silent while in the game, with ${pct(tr.afkFactor - 1)} extra. Your own crown's patrol leaves only ${cr.patrol.tip} gold in tips when it visits your entertainment hall; gifts are ${gifts} gold depending on relations. So you earn gold from the merchant, towns, expeditions and loot; what you earn from the crown is standing. Standing is a kind of money too, my lord; only no inn accepts it.`),
        L(`İtibar da boş değildir: taç siparişleri, tacın görevleri (${cr.quests.gold[0]}–${cr.quests.gold[1]} altın) ve kraliyet elçisinin istekleri ilişkiyi yükseltir; tacın yönettiği malı satarken iyi ilişki ${pct(cr.stewardship.bonus)} fazla fiyat getirir, kötüsü ${pct(cr.stewardship.penalty)} eksik.`, `Standing isn't worthless: crown orders, crown tasks (${cr.quests.gold[0]}–${cr.quests.gold[1]} gold) and the royal envoy's requests raise relations; when selling the good a crown oversees, good relations fetch ${pct(cr.stewardship.bonus)} more, bad ones ${pct(cr.stewardship.penalty)} less.`),
        L(`Taçların da hanedanı vardır: hükümdarlar yaşlanır, ölür, yerine çocukları geçer. Açgözlü hükümdarın haraççıları çok ister, cömerdinin devriyesi çok bahşiş bırakır. Saraylarda bu yüzden hükümdarın sağlığına çok dua edilir; ya da tam tersine, huyuna göre. İki taç ${Math.round(cr.rivalry.windowSeconds / 3600)} saatlik dönemlerde barış, gerginlik ya da savaştadır; savaşta haraççılar ×${dec(cr.rivalry.effects.war.tribute)} ister.`, `The crowns have dynasties too: rulers age, die, and their children succeed them. A greedy ruler's tribute collectors ask a lot; a generous one's patrol tips a lot. Which is why courts pray hard for the ruler's health; or the opposite, depending on his temper. The two crowns spend ${Math.round(cr.rivalry.windowSeconds / 3600)}-hour periods at peace, in tension or at war; in war the tribute collectors ask ×${dec(cr.rivalry.effects.war.tribute)}.`),
      ]
    },
    go: { label: L('Krallık bölümü', 'Kingdom section'), act: tab('diplomacy', 'diplomacy', 'crowns') },
  },
  {
    id: 'dynasty',
    name: L('Hanedan', 'Dynasty'),
    icon: 'leaf',
    group: 'court',
    pages: ({ kingdom: k, now }) => {
      const d = balance.dynasty
      const king = k.dynasty?.king
      return [
        L(`Lordluğunuzun bir hanedanı vardır: hükümdar, kraliçe, çocuklar, kardeşler ve akrabalar. Bir yıl bir gerçek saattir. ${king ? `${king.name} şu an ${ageOf(king.bornAt, now)} yaşında; Allah uzun ömür versin, ama ${d.death.atAge[0]}–${d.death.atAge[1]} arası bir yaşta hepimiz gideriz.` : 'Henüz tahtta kimse yok; naipler idare ediyor.'}`, `Your lordship has a dynasty: the ruler, the queen, children, siblings and kin. One year is one real hour. ${king ? `${king.name} is ${ageOf(king.bornAt, now)} years old now; long may he live, but somewhere between ${d.death.atAge[0]} and ${d.death.atAge[1]} we all go.` : "There's no one on the throne yet; the regents are managing."}`),
        L('Yetenekler üçtür: maliye vergiyi ve ticareti, halk mutluluğu ve iş gücünü, askerlik zarı ve maaşı etkiler. Kraliçenin yeteneklerinin yarısı hükümdarınkine eklenir. Beşten yukarısı iyidir, lordum; ben de gençken beşin üstündeydim. Konuşmada on bir.', "There are three skills: Finance affects tax and trade, People affects happiness and labour, Military affects the dice and soldiers' pay. Half the queen's skills are added to the ruler's. Above five is good, my lord; I was above five in my youth. At talking, eleven."),
        L(`Kraliçe sarayda oldukça çocuk doğar: bir çiftin en çok iki çocuğu olur: çoğu zaman iki oğul, bazen tek oğul, bazen bir oğul ve bir kız. Adlarını siz koyarsınız (bir kez! Bir lord oğluna "Tuzluk" dedi, çocuk hâlâ affetmedi), eğitimlerini seçersiniz; ${d.comingOfAge} yaşında reşit olunca o yetenek artar. Sarayın ${d.queenForPalaceLevel}. seviyesi için kraliçe şarttır.`, `While the queen is at court, children are born: a couple has at most two: usually two sons, sometimes one son, sometimes a son and a daughter. You name them (once! One lord named his son "Saltcellar", and the boy has never forgiven him) and choose their education; when they come of age at ${d.comingOfAge}, that skill rises. A level ${d.queenForPalaceLevel} palace requires a queen.`),
        L(`Hükümdar ölünce en büyük oğul geçer; oğul küçükse naipler konseyi yönetir. Oğul yoksa reşit bir erkek kardeş geçer. Tahta geçmeyen kardeşler çoğu zaman genç yaşta bir hastalıktan ölür; salgın günlerinde hanedandan biri de gidebilir (ardılı olmayan hükümdar hariç). Kimse kalmazsa kraliçe yönetir, ama onu evlendirmek şarttır: siz seçmezseniz ${d.council.kinsmanYears} yıl içinde konsey bir eş bulur. Kraliçe de yoksa naipler yönetir, ${d.council.kinsmanYears} yıl sonra bir akraba çağrılır. Hanedan bitmez, lordum; yalnızca karışır. Soy ağacınız şimdiden bir sarmaşığa benziyor; kraliçenin akrabaları da üstüne tırmanıyor. Kardeşlerin hırsı ve taht kavgaları "Entrika" konusunda.`, `When the ruler dies the eldest son succeeds; if the son is young, a regency council rules. With no son, an adult brother succeeds. Siblings who don't take the throne usually die young of some illness; in plague times a member of the dynasty may go too (except a ruler with no heir). If nobody is left the queen rules, but she must be married: if you don't choose, the council finds her a husband within ${d.council.kinsmanYears} years. With no queen either, regents rule and after ${d.council.kinsmanYears} years a kinsman is summoned. The dynasty never ends, my lord; it merely gets complicated. Your family tree already looks like a vine; and the queen's relatives are climbing it. Siblings' ambitions and fights for the throne are under "Intrigue".`),
      ]
    },
    go: { label: L('Hanedan bölümü', 'Dynasty section'), act: tab('kingdom', 'palace', 'house') },
  },
  {
    id: 'diplomacy',
    name: L('Diplomasi', 'Diplomacy'),
    icon: 'scroll',
    group: 'court',
    pages: () => {
      const d = balance.diplomacy
      return [
        L(`Her iki lordun arasında −100 ile +100 arası bir ilişki vardır; zamanla sıfıra döner. Elçiyle ilişki geliştirirsiniz (${d.improve.cost.gold} altına +${d.improve.gain}), hediye yollarsınız, ittifak ya da barış teklif edersiniz. Rakip taçların lordları birbirine ${d.crowns.rivalMax} puandan fazla ısınamaz; ittifak ise +${d.alliance.minRelation} ister.`, `Between any two lords there are relations from −100 to +100, drifting back to zero over time. With envoys you improve relations (+${d.improve.gain} for ${d.improve.cost.gold} gold), send gifts, and propose alliances or peace. Lords of rival crowns can never warm to each other beyond ${d.crowns.rivalMax}; an alliance needs +${d.alliance.minRelation}.`),
        L(`Lordlar birbirinden haraç da ister: kabul eden her tur ${d.tribute.minGold}–${d.tribute.maxGold} altın öder ve ilişki ${d.tribute.accept} düşer. Reddetmek ${d.tribute.reject}, kabul edip sonra kesmek ${d.tribute.renege} ve herkesle ${d.tribute.renegeInfamy} getirir. İttifakı bozmak da ${d.alliance.break}. Sözünüzü tutun, lordum; tutamayacaksanız hiç vermeyin. Ya da benim gibi o kadar uzun söz verin ki kimse sonunu hatırlamasın.`, `Lords demand tribute from each other too: whoever accepts pays ${d.tribute.minGold}–${d.tribute.maxGold} gold every round, and relations change by ${d.tribute.accept}. Refusing costs ${d.tribute.reject}; accepting and then stopping costs ${d.tribute.renege}, plus ${d.tribute.renegeInfamy} with everyone. Breaking an alliance costs ${d.alliance.break}. Keep your word, my lord; if you can't keep it, don't give it. Or, like me, give it at such length that nobody remembers how it ended.`),
        L(`Düşmanlık da diplomasidir: hakaret elçisi ilişkiyi ${d.insult.relation} düşürür. Hakaretleri ben yazarım, lordum; en iyileri kafiyelidir. Ticaret yolu yağmasında garnizondan ${d.raid.soldiers} asker düşmanın tüccarını basar; şans ${pct(d.raid.baseChance)}, ticaret noktasının yanındaki her gözcü kulesi ${pct(d.raid.towerPenalty)} düşürür. Başarırsanız ${d.raid.lootTrips} seferlik malı alır, ticaret noktasını harap edersiniz.`, `Hostility is diplomacy too: an insulting envoy changes relations by ${d.insult.relation}. I write the insults myself, my lord; the best ones rhyme. In a trade-road raid, ${d.raid.soldiers} soldiers from the garrison ambush the enemy's merchant; the chance is ${pct(d.raid.baseChance)}, and each watchtower near the trading post lowers it by ${pct(d.raid.towerPenalty)}. Succeed and you take ${d.raid.lootTrips} trips' worth of goods and wreck the trading post.`),
        L(`Her kötülük karşı tarafa bir savaş gerekçesi verir: casusu yakalanan, hakarete uğrayan, haracı kesilen, kraliçesi kaçırılan… Gerekçe ${Math.round(d.casusBelli.seconds / 3600)} saat geçerlidir. −20'nin altındaki ilişkiler çoğaldıkça itibarınız düşer, elçileriniz en çok ${pct(d.reputation.maxPenalty)} az etki eder.\n\nKardeş kavgaları, evlilikler ve casusların karanlık işleri için "Entrika"yı sorun.`, `Every wrong gives the victim a casus belli: a caught spy, an insult, a stopped tribute, a kidnapped queen… It lasts ${Math.round(d.casusBelli.seconds / 3600)} hours. The more of your relations sink below −20, the lower your reputation, and your envoys lose up to ${pct(d.reputation.maxPenalty)} of their effect.\n\nFor sibling quarrels, marriages and the dark work of spies, ask about "Intrigue".`),
      ]
    },
    go: { label: L('Diplomasi sekmesi', 'Diplomacy tab'), act: tab('diplomacy', 'diplomacy', 'kingdoms') },
  },
  {
    id: 'intrigue',
    name: L('Entrika', 'Intrigue'),
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
        L(`Saray dışarıdan sakin görünür, lordum; içeriden kaynar. Reşit her oğlun, kardeşin ve akrabanın hükümdara bir bakışı vardır: yakınlık, hükümdarın yetenekleri, halkın mutluluğu ve kendi hırsı belirler. Büyük kardeşin tahtta gözü vardır. ${i.gift.gold} altınlık bir hediye bakışı +${i.gift.opinion} yükseltir, sonra yavaşça söner.${brothers.length ? ` Şu an ${sour ? `${sour} yakınınız hoşnutsuz` : 'kimse hoşnutsuz değil'}.` : ''}`, `The court looks calm from outside, my lord; inside it simmers. Every adult son, brother and kinsman has an opinion of the ruler: shaped by closeness, the ruler's skills, the people's happiness and their own ambition. An elder brother has an eye on the throne. A gift of ${i.gift.gold} gold raises opinion by ${i.gift.opinion}, fading slowly afterwards.${brothers.length ? ` Right now ${sour ? `${sour} of your kin ${sour === 1 ? 'is' : 'are'} discontented` : 'nobody is discontented'}.` : ''}`),
        L(`${i.roles.minAge} yaşını geçen hanedan üyelerine görev verin, sevinirler: vali bir kasabanın sadakatini yükseltir, devriye komutanı tacın bahşişini ve ilişkiyi artırır (ama taç onu da sever), hazinedar vergiyi maliyesiyle büyütür. Görevden alınan gücenir; ben de bir kez görevden alındım, hâlâ gücenikim. Kırk yıl oldu. Gücenmekte de ustayım.`, `Give posts to members of the dynasty aged ${i.roles.minAge} or over and they'll be pleased: a governor raises a town's loyalty, a patrol commander increases the crown's tips and relations (but the crown grows fond of him too), a treasurer grows the tax with his finance skill. Whoever is dismissed takes offence; I was dismissed once and I'm still offended. Forty years now. I'm a master of taking offence, too.`),
        L(`Prensesler evlendirilir: tacın ailesine (${i.marriage.crown.dowry} altın çeyiz, taçla ilişki +${i.marriage.crown.relation}), bir kasabanın ileri gelenine (${i.marriage.town.dowry} altın; sizin kasabanızsa sadakat +${i.marriage.town.loyalty}, kimsenin değilse kılıçsız size bağlanır) ya da elçiyle başka bir lordun hanedanına (kabul ederse ilişki +${i.marriage.lord.relation}).`, `Princesses are married off: into the crown's family (${i.marriage.crown.dowry} gold dowry, relations with the crown +${i.marriage.crown.relation}), to a town's notables (${i.marriage.town.dowry} gold; if the town is yours, loyalty +${i.marriage.town.loyalty}; if it's nobody's, it joins you without a sword drawn) or, by envoy, into another lord's house (if he accepts, relations +${i.marriage.lord.relation}).`),
        L(`Bakışı ${r.below} puanın altına inen kardeş isyan edebilir: garnizonun bir kısmını alır, hududun dışında karargâh kurar, asileri dakikada büyür ve ${r.growMinutes} dakika sonra saraya yürür. Ordunuzla karargâhı basın ya da taçtan yardım isteyin (asker ya da ${i.aid.gold} altın). Tacınız davacıyı desteklemişse ve isyanı bastırırsanız ${sw.offerMinutes} dakika içinde rakip taca geçebilirsiniz; biatin bozulduğu tek an budur.`, `A brother whose opinion falls below ${r.below} may rebel: he takes part of the garrison, sets up camp outside the border, his rebels grow by the minute, and after ${r.growMinutes} minutes he marches on the palace. Raid the camp with your army or ask the crown for help (soldiers or ${i.aid.gold} gold). If your crown backed the pretender and you crush the revolt, you can go over to the rival crown within ${sw.offerMinutes} minutes; the only moment fealty can be broken.`),
        L(`Bir de karanlık işler var: casuslarınız güçlü bir ağla sabotaj yapar (${ops.sabotage.minStrength}+), kraliçeyi kaçırır (${ops.kidnap.minStrength}+, hapishaneniz olmalı; fidye en az ${ops.kidnap.ransomMin} altın), kasabada isyan kışkırtır (${ops.townRevolt.minStrength}+, sadakat ${ops.townRevolt.loyalty}) ya da lordluğu ayaklandırır (${ops.revolt.minStrength}+). Yakalanırsanız kim olduğunuz ortaya çıkar, karşı taraf da savaş gerekçesi kazanır. O durumda ben de hiçbir şey bilmiyormuş gibi yaparım; bunda çok iyiyimdir, bilmediğim çok şey var.`, `Then there's the dark work: with a strong network your spies sabotage (${ops.sabotage.minStrength}+), kidnap the queen (${ops.kidnap.minStrength}+, you need a prison; ransom at least ${ops.kidnap.ransomMin} gold), stir up a town revolt (${ops.townRevolt.minStrength}+, loyalty ${ops.townRevolt.loyalty}) or raise the whole lordship in revolt (${ops.revolt.minStrength}+). If caught, your identity comes out and the other side gains a casus belli. In that case I'll pretend to know nothing; I'm very good at it, there's a great deal I don't know.`),
      ]
    },
    go: { label: L('Hanedan bölümü', 'Dynasty section'), act: tab('kingdom', 'palace', 'house') },
  },
  {
    id: 'spies',
    name: L('Casusluk', 'Espionage'),
    icon: 'eye',
    group: 'court',
    pages: () => {
      const e = balance.espionage
      const o = e.operations
      return [
        L(`Casus evi casus yetiştirir: ${e.spyCost.gold} altına, ${e.spySeconds} saniyede bir; seviyesine göre ${e.capacityByLevel.join(' / ')} casus. Bir casusu bir lorda ve bir konuya (hammadde, ordu ya da diplomasi) gönderirsiniz; orada kaldıkça ağ gücü artar, rapor netleşir.`, `A spy house trains spies: one every ${e.spySeconds} seconds for ${e.spyCost.gold} gold; ${e.capacityByLevel.join(' / ')} spies depending on its level. You send a spy to a lord and a subject (resources, army or diplomacy); the longer he stays, the stronger the network and the clearer the report.`),
        L(`Evde kalan casuslar karşı casusluk yapar (her biri ${dec(e.counterPerSpy)}, casus evinin her seviyesi ${dec(e.counterPerLevel)} puan): düşmanın ağı yavaş kurulur, casusu çabuk yakalanır. İlişkisi kötü olan lord da sizi gözler. Yakalanan casus ölür, gönderen ortaya çıkar. Casuslarımıza bu yüzden takma bıyık veririz; pek işe yaramaz ama moral verir.`, `Spies kept at home do counter-espionage (${dec(e.counterPerSpy)} each, plus ${dec(e.counterPerLevel)} per spy-house level): the enemy's network builds slowly and their spies get caught quickly. A lord on bad terms with you watches you too. A caught spy dies and his sender is exposed. That's why we give our spies false moustaches; they don't help much, but they're good for morale.`),
        L(`Ordu ağı güçlendikçe birlik türlerini ve gemileri de söyler. Güçlü ağla operasyon yapılır: sabotaj ${o.sabotage.cost.gold}, kraliçe kaçırma ${o.kidnap.cost.gold}, kasabada isyan ${o.townRevolt.cost.gold}, ayaklanma ${o.revolt.cost.gold} altın. Operasyon, başarılı olsun olmasın, istediği kadar ağ harcar. Ayrıntısı "Entrika"da.`, `As the army network grows stronger it reveals unit types and ships too. A strong network allows operations: sabotage ${o.sabotage.cost.gold}, kidnapping the queen ${o.kidnap.cost.gold}, a town revolt ${o.townRevolt.cost.gold}, an uprising ${o.revolt.cost.gold} gold. An operation, successful or not, spends as much network as it requires. More under "Intrigue".`),
      ]
    },
    go: { label: L('Casusluk bölümü', 'Espionage section'), act: tab('diplomacy', 'diplomacy', 'spies') },
  },

  // ---- Bandits, clans and pirates ---------------------------------------------------------------------------------------
  {
    id: 'bandits',
    name: L('Yağmacılar', 'Bandits'),
    icon: 'warn',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const b = balance.outlaws.bands
      const r = balance.outlaws.road
      const held = k.outlaws?.road ?? 0
      return [
        L(`Ticaret yollarında ${b.count} yağmacı çetesi dolaşır, lordum: her biri ${b.soldiers[0]}–${b.soldiers[1]} kişi, yırtık is karası bir sancak altında, kendi yol kesiminde ileri geri yürür. Ordulardan yavaştırlar; yakalamak zor değil, bulmak zor değil, sevmek zor.`, `${b.count} bandit bands roam the trade roads, my lord: each ${b.soldiers[0]}–${b.soldiers[1]} strong, under a tattered soot-black banner, marching back and forth along their own stretch of road. They're slower than armies; not hard to catch, not hard to find, hard to love.`),
        L(`Ticaret noktanızın ${r.radiusTiles} karo çevresindeki yolu tutarlarsa tuttukları pay ölçüsünde tüccarınızın kazancından en çok ${pct(r.merchantCut)} kadarını keserler, halkınız da tedirgin olur. ${held > 0 ? `Şu an yolunuzun ${pct(held)} kadarı onların elinde.` : 'Şu an sizin yolunuz temiz; dua edelim öyle kalsın.'}`, `If they hold the road within ${r.radiusTiles} tiles of your trading post, they skim up to ${pct(r.merchantCut)} of your merchant's earnings in proportion to how much they hold, and your people grow uneasy. ${held > 0 ? `Right now ${pct(held)} of your road is in their hands.` : "Your road is clear right now; let's pray it stays so."}`),
        L(`Çeteye tıklayıp bir ordu seçin, "Takip et" deyin: ordu çetenin önünü keser, ${b.chase.contactTiles} karo yaklaşınca muharebe olur. ${min(b.chase.maxSeconds)} dakikada yakalayamazsa vazgeçer.`, `Click a band, choose an army and say "Chase": the army cuts the band off, and a battle begins once they're within ${b.chase.contactTiles} tiles. If it can't catch them in ${min(b.chase.maxSeconds)} minutes, it gives up.`),
        L(`Yenilen çete ${min(b.respawnSeconds)} dakika dağılır, sonra bir kişi kalabalık geri gelir. Ganimet kişi başına ${b.loot.armsPerSoldier} savaş malzemesi, ${b.loot.goldPerSoldier} altın, ${b.loot.materialsPerSoldier} yapı malzemesi. Çeteler başıboş da değildir: dağlardaki bir klana bağlıdırlar. Kökünü kurutmak için "Mağaralar"ı sorun. Yağmacıların da bir anası var, lordum; o ana da mağarada oturuyor ve çok kalabalık bir aile.`, `A beaten band scatters for ${min(b.respawnSeconds)} minutes, then returns one stronger. Loot per head: ${b.loot.armsPerSoldier} war materials, ${b.loot.goldPerSoldier} gold, ${b.loot.materialsPerSoldier} building materials. Nor are the bands masterless: each belongs to a clan in the mountains. To root them out, ask about "Caves". Bandits have a mother too, my lord; she lives in a cave, and it's a very large family.`),
      ]
    },
    go: { label: L('Tüccara bak', 'Look at the merchant'), act: tab('trade', 'trade', 'merchant') },
  },
  {
    id: 'caves',
    name: L('Mağaralar ve klanlar', 'Caves and clans'),
    icon: 'map',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const cv = balance.outlaws.caves
      const cl = balance.outlaws.clans
      const spy = k.buildings.some((b) => b.kind === 'spyHouse')
      const trails = Object.values(k.caveTrail ?? {})
      const best = trails.reduce((m, t) => Math.max(m, t.wins), 0)
      return [
        L(`Dağ eteklerinde ${cv.count} mağara vardır ve hepsi birbirine benzer; ağızları hep bize doğru bakar ama içlerini göstermez. Bunların ${cl.count} tanesinde yağmacı klanları yaşar, her çete birine bağlıdır. Hangisinin dolu olduğunu dışarıdan anlayamazsınız, lordum; ben denedim, gözlüğüm yetmedi.`, `There are ${cv.count} caves in the foothills, all alike; their mouths always face us but never show what's inside. ${cl.count} of them house bandit clans, and every band belongs to one. You can't tell from outside which are occupied, my lord; I tried, my spectacles weren't up to it.`),
        L(`İz sürmek gerekir: bir klanın çetesini yendikçe esirler konuşur. İlk zaferde bir yer işaretinden (kasaba, han, başkent, sizin topraklarınız) yön, ikincisinde aşağı yukarı uzaklık, üçüncüsünde mağaranın kendisi. Casus eviniz varsa ${cl.discovery.spyHouseWins} zafer yeter.${spy ? ' Sizin var, şanslısınız.' : ''}${best ? ` En iyi izinizde ${best} zafer var.` : ''}`, `You have to track them: each time you beat a clan's band, the prisoners talk. The first victory gives a direction from a landmark (a town, an inn, a capital, your own lands), the second a rough distance, the third the cave itself. With a spy house, ${cl.discovery.spyHouseWins} victories are enough.${spy ? " You have one; lucky you." : ''}${best ? ` Your best trail has ${best} victor${best === 1 ? 'y' : 'ies'}.` : ''}`),
        L(`Bilmediğiniz bir mağaraya orduyu öylece yollarsanız ordu ağzın bir karo önünde durur, ama içine bakamaz: yol bozuktur, meşaleler söner, bir göçük vardır… Boş mağara da dolu mağara da aynı sözleri söyler; aynı ordu aynı mağara için saatte bir haber getirir. Yani dağ dağ gezmek boşa yorgunluktur. Ben bir kez denedim; mağaradan bir ayı çıktı, bana boş mağara olduğunu söyledi. İnandım.`, `Send an army blindly to a cave you haven't found and it stops one tile before the mouth but can't look inside: the path is bad, the torches go out, there's a rockfall… An empty cave and an occupied one say exactly the same; the same army brings news of the same cave once an hour. So wandering from mountain to mountain is wasted effort. I tried once; a bear came out of the cave and told me it was empty. I believed him.`),
        L(`Bulunan mağaraya "Mağarayı kuşat" deyin. Koruyanlar ${cl.garrison[0]}–${cl.garrison[1]} kişiyle başlar ve zamanla büyür; evlerindedirler, moralleri ${cl.morale}, zarlarına +${dec(cl.caveBonus)} eklenir. Kazanırsanız klan yok olur: biriktirdiği ganimet (en az ${cl.hoard.gold} altın) sizin olur, puanınıza ${cl.scorePerCave} eklenir, çeteleri yollardan çekilir. Ama dağlar boş kalmaz; başka bir mağarada yeni bir klan doğar.`, `For a cave you've found, choose "Besiege the cave". Its defenders start at ${cl.garrison[0]}–${cl.garrison[1]} and grow over time; they're at home, their morale is ${cl.morale}, and +${dec(cl.caveBonus)} is added to their dice. Win and the clan is destroyed: its hoard (at least ${cl.hoard.gold} gold) is yours, ${cl.scorePerCave} is added to your score, and its bands leave the roads. But the mountains never stay empty; a new clan is born in another cave.`),
      ]
    },
  },
  {
    id: 'pirates',
    name: L('Korsanlar', 'Pirates'),
    icon: 'anchor',
    group: 'wilds',
    pages: ({ kingdom: k }) => {
      const b = balance.outlaws.boats
      const s = balance.outlaws.sea
      const held = k.outlaws?.sea ?? 0
      return [
        L(`Göllerde ve nehirlerde ${b.count} korsan teknesi dolaşır: kara yelkenli, kan kırmızısı flamalı, her birinde ${b.ships[0]}–${b.ships[1]} gemi. Savaşta çektiri sayılırlar; kokaları yener, kadırgalara yenilirler. Korsanların şarkıları güzeldir, lordum, kokuları değil.`, `${b.count} pirate boats roam the lakes and rivers: black sails, blood-red pennants, ${b.ships[0]}–${b.ships[1]} ships each. In battle they count as raiders; they beat cogs and lose to galleys. Pirates' songs are lovely, my lord; their smell is not.`),
        L(`İskelenizin ${b.reachTiles} karo yakınından geçen her tekne korsan etkisine ${pct(s.perBoat)} ekler: deniz ticaretine saldırı sıklaşır, iskelenin ve balıkçı filolarının avı azalır, halk tedirgin olur. ${held > 0 ? `Sizin sularınızda etki şu an ${pct(held)}.` : 'Sizin sularınız şu an sakin.'}`, `Every boat that passes within ${b.reachTiles} tiles of your dock adds ${pct(s.perBoat)} to the pirates' grip: attacks on sea trade grow more frequent, the dock's and fishing fleets' catch shrinks, and the people grow uneasy. ${held > 0 ? `The grip on your waters is ${pct(held)} right now.` : 'Your waters are calm right now.'}`),
        L(`Tekneye tıklayıp bir filo seçin; filoda en az bir savaş gemisi olmalı ve aynı suda yüzmeli. Filo teknenin önünü keser, ${dec(b.chase.contactTiles)} karo yaklaşınca deniz savaşı olur. Batırırsanız ${b.loot.bounty} altın artı gemi başına ${b.loot.perShip} altın, ${b.loot.arms} savaş ve ${b.loot.materials} yapı malzemesi; tekne ${min(b.respawnSeconds)} dakika ortadan kalkar. Ben yüzme bilmem, lordum; bu işleri size bırakıyorum.`, `Click a boat and choose a fleet; it needs at least one warship and must be on the same water. The fleet cuts the boat off, and a sea battle begins within ${dec(b.chase.contactTiles)} tiles. Sink it and you get ${b.loot.bounty} gold plus ${b.loot.perShip} gold per ship, ${b.loot.arms} war and ${b.loot.materials} building materials; the boat disappears for ${min(b.respawnSeconds)} minutes. I can't swim, my lord; I leave these matters to you.`),
      ]
    },
    go: { label: L('Donanma bölümü', 'Navy section'), act: tab('army', 'army', 'sea') },
  },

  // ---- Pursuits and glory ---------------------------------------------------------------------------------------------
  {
    id: 'expeditions',
    name: L('Seferler', 'Expeditions'),
    icon: 'pin',
    group: 'pursuits',
    pages: ({ kingdom: k, now }) => {
      const x = balance.expeditions
      const kd = x.kinds
      const out = (k.expeditions ?? []).filter((e) => !e.result && e.startAt <= now && now < e.endAt).length
      return [
        L(`Saraydan küçük bir köylü kafilesi süreli bir yolculuğa çıkar; siz yokken de sürer. Avcılar ormana (${kd.hunt.minutes} dk), kâşifler dağlara (${kd.explore.minutes} dk), hacılar tapınağa (${kd.pilgrimage.minutes} dk), tüccar kafilesi uzak diyarlara (${kd.caravan.minutes} dk) ya da kayıp hazinenin izine (${kd.treasure.minutes} dk).`, `A small party of villagers sets out from the palace on a timed journey; it carries on even while you're away. Hunters to the forest (${kd.hunt.minutes} min), explorers to the mountains (${kd.explore.minutes} min), pilgrims to the temple (${kd.pilgrimage.minutes} min), a merchant caravan to distant lands (${kd.caravan.minutes} min) or on the trail of lost treasure (${kd.treasure.minutes} min).`),
        L(`Erzak peşin ödenir; yoldaki köylüler çalışmaz, vergi vermez. Aynı anda saray seviyesine göre ${x.maxActiveByPalaceLevel.join(' / ')} sefer, halkın en çok ${pct(x.maxVillagerShare)} kadarı yolda olur. ${out ? `Şu an ${out} kafileniz yolda.` : 'Şu an yolda kafileniz yok.'}`, `Provisions are paid up front; villagers on the road don't work or pay tax. At once you can have ${x.maxActiveByPalaceLevel.join(' / ')} expeditions depending on palace level, with at most ${pct(x.maxVillagerShare)} of the people on the road. ${out ? `You have ${out} part${out === 1 ? 'y' : 'ies'} on the road right now.` : 'You have no parties on the road right now.'}`),
        L(`Yolda iki üç şey olur: sürüye rastlarlar, ayıya rastlarlar… Her muhafız asker kötü olay ihtimalini ${pct(x.escortCut)} azaltır. Dönüşte ganimet depoya girer, resimli bir rapor açılır. Resimleri abartırlar, lordum; bir tavşanı ayı diye anlatan avcılar tanırım.`, `Two or three things happen on the way: they come across a herd, they come across a bear… Each soldier sent as a guard cuts the chance of a bad event by ${pct(x.escortCut)}. On their return the loot goes into the stores and an illustrated report opens. They exaggerate in the pictures, my lord; I know hunters who described a rabbit as a bear.`),
        L('Bir sır vereyim, lordum: seferler boşta oturan köylüler içindir. Bir binada çalışan köylüyü yollarsanız üretim kaybı kazancı yer. Boşta köylü varsa kafileye katın; hacılar dönünce halk da bir süre mutlu olur.', "Let me tell you a secret, my lord: expeditions are for idle villagers. Send a villager who works in a building and the lost production eats the gain. If you have idle villagers, add them to a party; when pilgrims return, the people are happy for a while too."),
      ]
    },
    go: { label: L('Seferler', 'Expeditions'), act: tab('kingdom', 'palace', 'expeditions') },
  },
  {
    id: 'works',
    name: L('Büyük işler', 'Great works'),
    icon: 'temple',
    group: 'pursuits',
    pages: ({ kingdom: k }) => {
      const p = balance.projects
      const w = p.works
      const stages = PROJECT_IDS.reduce((s, id) => s + (k.projects?.[id]?.stage ?? 0), 0)
      return [
        L(`Ambarı ve hazinesi taşan lord için büyük işler vardır, lordum (${w.minPalace}. seviye saray): Ulu Katedral, Büyük Çarşı ve Şövalye Tarikatı. Her biri ${w.stageFactors.length} aşamadır; her aşama bir teslimat ister, "Depodan aktar" her ambarın ve hazinenin ${pct(w.keep.goods)} kadarını yedekte bırakır.`, `For a lord whose storehouses and treasury overflow there are great works, my lord (level ${w.minPalace} palace): the Grand Cathedral, the Great Bazaar and the Knightly Order. Each has ${w.stageFactors.length} stages; every stage needs a delivery, and "Deliver from stores" keeps ${pct(w.keep.goods)} of every store and the treasury in reserve.`),
        L(`Katedral her aşamada mutluluk +${w.kinds.cathedral.happinessPerStage}, çarşı ticarete ${pct(w.kinds.bazaar.tradePerStage)}, tarikat askerlerin zarına +${dec(w.kinds.knights.battlePerStage)} katar. Her aşama ${w.growthPerStage} puan, biten iş +${w.completeGrowth} daha ve tacınızla ilişki +${w.completeCrownRelation}. ${stages ? `Şimdiye kadar ${stages} aşama bitirdiniz.` : 'Henüz bir taş bile koymadınız; ben temel atma konuşmamı çoktan yazdım, kırk sayfa.'}`, `Every stage, the cathedral adds +${w.kinds.cathedral.happinessPerStage} happiness, the bazaar ${pct(w.kinds.bazaar.tradePerStage)} to trade, the order +${dec(w.kinds.knights.battlePerStage)} to the soldiers' dice. Each stage is worth ${w.growthPerStage} points, a finished work +${w.completeGrowth} more and +${w.completeCrownRelation} relations with your crown. ${stages ? `So far you've finished ${stages} stage${stages === 1 ? '' : 's'}.` : "You haven't laid a single stone yet; I wrote my groundbreaking speech long ago, forty pages."}`),
        L(`Daha küçük işler de var: halk şenliği (${p.festival.cost.gold} altın, ${n(p.festival.cost.food)} yemek; ${min(p.festival.seconds)} dakika mutluluk +${p.festival.happiness}) ve taca bağış (bir maldan ${n(p.donation.units)} birim, ilişki +${p.donation.relation}). Ambarda çürüyecek malı halka ve taca vermek, lordum, farelere vermekten iyidir.`, `There are smaller works too: a people's festival (${p.festival.cost.gold} gold, ${n(p.festival.cost.food)} food; +${p.festival.happiness} happiness for ${min(p.festival.seconds)} minutes) and a donation to the crown (${n(p.donation.units)} units of one good, relations +${p.donation.relation}). Better to give goods that would rot in the storehouse to the people and the crown, my lord, than to the rats.`),
      ]
    },
    go: { label: L('Projelere git', 'Go to Projects'), act: tab('kingdom', 'palace', 'projects') },
  },
  {
    id: 'goals',
    name: L('Hedefler ve unvan', 'Goals and title'),
    icon: 'star',
    group: 'pursuits',
    pages: ({ kingdom: k }) => {
      const g = balance.goals
      const stars = Object.values(k.goals ?? {}).reduce((s, x) => s + (x?.tier ?? 0), 0)
      const rank = [...g.ranks].reverse().find((r) => stars >= r.stars) ?? g.ranks[0]
      const next = g.ranks.find((r) => r.stars > stars)
      return [
        L(`Hanedanın ${Object.keys(g.tracks).length} hedefi vardır: yapı, ev, saray, köylü, çocuk, zafer, kasaba, araştırma, sefer, ticaret, hazine, tapınak, gemi. Her birinin bronz, gümüş ve altın basamağı vardır ve her basamak bir yıldızla ${g.rewardByTier.map((r) => r.gold).join(' / ')} altınlık bir kese getirir.`, `The dynasty has ${Object.keys(g.tracks).length} goals: buildings, houses, palace, villagers, children, victories, towns, research, expeditions, trade, treasury, temple, ships. Each has bronze, silver and gold tiers, and every tier brings a star and a purse of ${g.rewardByTier.map((r) => r.gold).join(' / ')} gold.`),
        L(`Yıldızlar unvanınızı belirler: ${g.ranks.map((r) => r.title).join(', ')}. Sizin ${stars} yıldızınız var, unvanınız ${rank.title}${next ? `; ${next.title} olmak için ${next.stars - stars} yıldız daha` : '; daha yukarısı yok, lordum, ben de size bakarken gözlerimi kısıyorum'}.`, `Stars set your title: ${g.ranks.map((r) => r.titleEn ?? r.title).join(', ')}. You have ${stars} star${stars === 1 ? '' : 's'}, and your title is ${rank.titleEn ?? rank.title}${next ? `; ${next.stars - stars} more to become ${next.titleEn ?? next.title}` : "; there's nothing higher, my lord; I have to squint just looking at you"}.`),
        L('Sezon sonunda lordlar puana göre sıralanır: hazine, gelişim (saray, kurumlar, büyük işler), nüfus, ordu, zafer (muharebeler, kuşatmalar, kasabalar, mağaralar) ve bilgi. Sohbetin Sıralama sekmesinde herkesin yerini görürsünüz; başkalarının hazinesini ise yalnızca casuslar söyler. Ya da onların elçisi; elçiler sır tutamaz, lordum, ben bilirim.', "At season's end the lords are ranked by score: treasury, development (palace, institutions, great works), population, army, victory (battles, sieges, towns, caves) and knowledge. You can see everyone's place in the chat's Rankings tab; others' treasuries, though, only spies can tell you. Or their envoys; envoys can't keep a secret, my lord, I should know."),
      ]
    },
    go: { label: L('Hedefler', 'Goals'), act: tab('kingdom', 'palace', 'goals') },
  },
  {
    id: 'games',
    name: L('Mini oyunlar', 'Minigames'),
    icon: 'dice',
    group: 'pursuits',
    pages: () => {
      const m = balance.minigames
      return [
        L('Yorulunca biraz eğlenin, lordum: oduncu kampında odun yarma, tarlada hasat, iskelede ağ çekme, silah atölyesinde örs başında, ticaret noktasında kervan yolu, kışlada okçuluk ve balıkçı kulübesinde olta. Eğlence merkezi kurarsanız hepsi orada da oynanır.', "When you're tired, have a little fun, my lord: wood splitting at the lumber camp, harvest at the farm, net hauling at the dock, the anvil at the weapon workshop, the caravan road at the trading post, archery at the barracks and the rod at the fishing hut. Build an entertainment hall and they can all be played there too."),
        L(`Her oyun ${min(m.cooldownSeconds)} dakikada bir oynanır. Bütün oyunlar birlikte saatte en çok ${m.budget.goldPerWindow} altın değerinde ödül verir; gerisi yalnızca şan içindir. Puanı hakem kendisi hesaplar, hile yok; en iyiler sezon ve tüm zamanlar sıralamasına girer. Ben de bir kez girdim, sondan birinci.`, `Each game can be played once every ${min(m.cooldownSeconds)} minutes. Together, all the games give at most ${m.budget.goldPerWindow} gold worth of rewards an hour; the rest is purely for glory. The referee calculates the score himself, no cheating; the best go on the season and all-time rankings. I made it once; first from the bottom.`),
        L('Olta ayrıdır: balık tutarsanız bir kese ya da bir şişe çıkar. Şişedeki notlar başka lordların sırlarını fısıldar; çoğu yarım doğrudur, tıpkı saray dedikodusu gibi.', "The rod is different: catch a fish and out comes a purse or a bottle. The notes in the bottles whisper other lords' secrets; most are half true, just like court gossip."),
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
      L('Lordum, biraz büyük şeyler yapmanın vakti gelmedi mi sizce de? Ambarlar dolu, ustalar boş. Bir katedral, bir çarşı ya da bir şövalye tarikatı; her aşaması kalıcı bir kazanç ve sıralamada puan. Malı taşa çevirelim.', "My lord, don't you think it's time we did something grand? The storehouses are full, the builders idle. A cathedral, a bazaar or a knightly order; every stage a lasting gain and points on the rankings. Let's turn goods into stone."),
      L('Dolu ambar, lordum, farenin ve yangının sofrasıdır; fareler çatal bıçak bile almış. Saray → Projeler\'de üç büyük iş bekliyor; fazlayı oraya aktaralım, adınız taşlara kazınsın.', "A full storehouse, my lord, is a banquet for rats and fire; the rats have even bought cutlery. Three great works await in Palace → Projects; let's pour the surplus in and have your name carved in stone."),
      L('Lordum, servet saklandıkça erir: fare yer, pas yer, sel götürür. Büyük bir işe başlayalım; halk da görsün, tacınız da.', "My lord, wealth melts the longer it's hoarded: rats eat it, rust eats it, floods carry it off. Let's begin a great work; for the people to see, and your crown too."),
      L('Ustalar boş, ambar dolu, lordum; bu ikisini buluşturalım. Katedral gönüllere, çarşı keselere, tarikat kılıçlara yarar.', "The builders are idle and the storehouse full, my lord; let's bring the two together. The cathedral serves hearts, the bazaar purses, the order swords."),
      L('Bir lordun adını yüzyıllar sonra ambarı değil, diktiği taşlar söyler, lordum. Projeler bölümünde üç büyük iş bekliyor.', "Centuries from now, a lord's name is spoken not by his storehouse but by the stones he raised, my lord. Three great works await in Projects."),
    ])
    replies.push({ label: L('Projelere git', 'Go to Projects'), act: tab('kingdom', 'palace', 'projects') })
  } else if (level >= 3) {
    text = pick('wealth:festival', [
      L('Lordum, halka bir şenlik verin: meydanda sofralar kurulur, yemek erir, gönüller dolar. Taca bağış da var: fazla mal tacın gözünü sizden yana çevirir.', "My lord, give the people a festival: tables are laid in the square, the food melts away, hearts fill up. There's also donating to the crown: surplus goods turn the crown's eye your way."),
      L('Fazla yemeği bir şenliğe, fazla malı taca bağışa çevirelim, lordum. Büyük işler için sarayın dördüncü katına çıkmamız gerekecek.', "Let's turn surplus food into a festival and surplus goods into a donation to the crown, my lord. For great works we'll need to climb to the palace's fourth floor."),
      L('Halk karnını doyurup gülmek ister, taç da gönlünü hoş tutmak, lordum. Bir şenlik ve bir bağış; ambar hafifler, gönüller dolar.', 'The people want full bellies and a laugh, and the crown wants flattering, my lord. A festival and a donation; the storehouse lightens and hearts fill.'),
      L('Lordum, dolu ambarı afetler sever. Bir şenlik düzenleyelim, taca bir araba mal gönderelim; fare de pas da eli boş kalsın.', "My lord, disasters love a full storehouse. Let's hold a festival and send the crown a cartload of goods; leave the rats and the rust empty-handed."),
      L('Malı saklamak yerine bir şenliğe harcayın, lordum: yarım saat mutluluk, bir ömür hatıra. Ben şenliklerde dans ederim; halk da bu yüzden hatırlar. Taca bağış da ilişkiyi ısıtır.', "Rather than hoarding goods, spend them on a festival, my lord: half an hour of happiness, a lifetime of memories. I dance at festivals; which is why people remember them. And a donation to the crown warms relations."),
    ])
    replies.push({ label: L('Projelere git', 'Go to Projects'), act: tab('kingdom', 'palace', 'projects') })
  } else {
    text = pick('wealth:sell', [
      L('Lordum, fazlayı tüccara verin: o malı satıp altın getirir. Tacın siparişleri ve kraliyet elçisinin istekleri de iyi öder. Saray büyüdükçe şenlikler ve büyük işler de açılır.', "My lord, give the surplus to the merchant: he'll sell it and bring back gold. The crown's orders and the royal envoy's requests pay well too. As the palace grows, festivals and great works unlock as well."),
      L('Ambarda yatan mal, lordum, kimseye yaramaz. Tüccara hangi malı satacağını söyleyin; tacın siparişine de bir göz atalım.', "Goods lying in the storehouse do nobody any good, my lord. Tell the merchant what to sell; and let's look at the crown's order too."),
      L('Fazla malı satalım, lordum; altın da yerinde durmasın, yeni yapılara ve yükseltmelere gitsin. Büyüyen lordun ambarı hiç taşmaz.', "Let's sell the surplus, my lord; and don't let the gold sit either, put it into new buildings and upgrades. A growing lord's storehouse never overflows."),
      L('Lordum, ambar dolarsa fazlası boşa gider. Tüccara sattıralım, kraliyet elçisinin isteğini karşılayalım ya da sarayı yükseltmek için harcayalım.', "My lord, if the storehouse fills, the surplus goes to waste. Let's have the merchant sell it, meet the royal envoy's request, or spend it on raising the palace."),
      L('Mal satılır, altın harcanır, saray büyür, lordum; dünyanın düzeni bu. Ambarın tavanını beklemeyelim; tavan da bizi beklemez, çöker.', "Goods are sold, gold is spent, the palace grows, my lord; that's the order of the world. Let's not wait for the storehouse to hit the ceiling; the ceiling won't wait for us, it'll collapse."),
    ])
  }
  replies.push({ label: L('Tüccara bak', 'Look at the merchant'), act: tab('trade', 'trade', 'merchant') })
  replies.push({ label: L('Sonra bakarız', "We'll see later"), answer: '' })
  return { text, replies: replies.slice(0, 3) }
}
