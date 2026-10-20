import {
  balance, bandsOf, boatsOf, outlawUp, buildingCount, crownHouseAt, crownAgeOf, crownWays, crownRulerTitle, expeditionsOut, maxExpeditions,
  ageOf, heirOf, palaceLevel, clansOf,
} from '@game/shared'
import type { AdvisorAction, AdvisorCtx, Tip } from './lines'
import { L, locale } from '../../lib/i18n'

// The envoy's gossip (CLAUDE.md §9.8): when the lord calls him, he does not only nag about the economy. These are
// tips that are nearly always true, about the court, the crowns, the other lords, spies, the army, the bandits, the
// pirates and the expeditions, built from what the lord can already see; the panel takes them in turn with his advice,
// one subject after another (see `tipKind` and Advisor.tsx → `chooseTip`).

// What a tip is about, so that he changes the subject: the same kind is not brought up twice in a row.
export type TipKind = 'urgent' | 'economy' | 'build' | 'people' | 'court' | 'crowns' | 'lords' | 'spies' | 'army' | 'wilds' | 'pursuits'

const KINDS: Record<string, TipKind> = {
  foodLow: 'urgent', pretender: 'urgent', liegeOffer: 'urgent', raid: 'urgent',
  noFarm: 'build', noLumber: 'build', noHouse: 'build', barracks: 'build', spyHouse: 'build', market: 'build', warehouse: 'build', wall: 'build',
  housing: 'build', palaceUp: 'build',
  noGood: 'economy', innBetter: 'economy', innReach: 'economy', tradeIdle: 'economy', tradeBroken: 'economy', greatWorks: 'economy',
  storeFull: 'economy', treasuryFull: 'economy', clogged: 'economy',
  idleHands: 'people', tired: 'people', unhappy: 'people', sick: 'people', outbreak: 'people', queen: 'court', kinSour: 'court', princess: 'court',
  liege: 'crowns', crownWar: 'crowns', rivalRuler: 'crowns', quest: 'crowns',
  town: 'army', bandits: 'wilds', pirates: 'wilds', haven: 'wilds', trail: 'wilds',
  journey: 'pursuits', game: 'pursuits',
}
export const tipKind = (id: string): TipKind => KINDS[id] ?? (id.startsWith('g:') ? (id.slice(2).split('.')[0] as TipKind) : 'economy')

const n = (v: number) => Math.round(v).toLocaleString(locale())
const tab = (t: AdvisorAction & { kind: 'tab' }) => t
const crownsAct = tab({ kind: 'tab', tab: 'diplomacy', part: { key: 'diplomacy', part: 'crowns' } })
const lordsAct = tab({ kind: 'tab', tab: 'diplomacy', part: { key: 'diplomacy', part: 'kingdoms' } })
const spiesAct = tab({ kind: 'tab', tab: 'diplomacy', part: { key: 'diplomacy', part: 'spies' } })
const armyAct = tab({ kind: 'tab', tab: 'army', part: { key: 'army', part: 'land' } })
const seaAct = tab({ kind: 'tab', tab: 'army', part: { key: 'army', part: 'sea' } })
const houseAct = tab({ kind: 'tab', tab: 'kingdom', part: { key: 'palace', part: 'house' } })
const journeyAct = tab({ kind: 'tab', tab: 'kingdom', part: { key: 'palace', part: 'expeditions' } })

const keyed = (c: AdvisorCtx) => c.crowns > 0 && c.kingdom.lobbyKey !== undefined
const others = (c: AdvisorCtx) => c.online.kingdoms.filter((k) => k.id !== c.online.me)
const nameOf = (c: AdvisorCtx, id: number) => c.online.kingdoms.find((k) => k.id === id)?.name ?? '?'
const wars = (c: AdvisorCtx) => c.online.pacts.filter((p) => p.kind === 'war' && p.ended_at === null)

function ruler(c: AdvisorCtx, crown: number) {
  const h = crownHouseAt(c.kingdom, crown, c.now)
  const trait = crownWays(c.kingdom, crown, c.now).trait.name.toLocaleLowerCase(locale())
  return { title: crownRulerTitle(h.reign), age: Math.floor(crownAgeOf(h.ruler, c.now)), trait, heir: h.heir?.name ?? null, realm: c.online.crowns[crown] ?? '?' }
}

export const GOSSIP: Tip[] = [
  {
    // His own crown's court: the ruler, his nature, the heir.
    id: 'g:crowns.court',
    when: (c) => keyed(c) && c.kingdom.liege !== undefined && c.kingdom.liege !== null,
    say: (c) => {
      const r = ruler(c, c.kingdom.liege!)
      const heir = r.heir ?? L('kimse', 'no one')
      return [
        L(`Başkentten haber, lordum: ${r.title} ${r.age} yaşında, huyu ${r.trait}. Veliaht ${heir}. Sarayda herkes veliahta gülümsüyor; ben de gülümsedim, belli olmaz.`, `News from the capital, my lord: ${r.title} is ${r.age}, ${r.trait} by nature. The heir is ${heir}. Everyone at court smiles at the heir; I smiled too, one never knows.`),
        L(`${r.realm} sarayında bir ziyafete katıldım, lordum. ${r.title} bana iki kez baktı; birinde gülümsedi, ötekinde garsonu çağırdı. ${r.trait} biri; ona göre davranmalı.`, `I attended a feast at the court of ${r.realm}, my lord. ${r.title} looked at me twice; once he smiled, the other time he called for the waiter. A ${r.trait} sort; we must act accordingly.`),
        L(`Hükümdarımız ${r.title} ${r.age} yaşına bastı, lordum. Saray hekimi "daha çok yaşar" diyor; saray hekimi herkese öyle der, bana da dedi.`, `Our sovereign ${r.title} has turned ${r.age}, my lord. The court physician says "many years yet"; he says that to everyone. He said it to me.`),
        L(`Tacımızın kapısında konuşulanlar, lordum: ${r.title} ${r.trait} biriymiş, veliaht ${heir} ise "babasından iyi olur" diyorlar. Bunu yüksek sesle söyleyeni henüz görmedim.`, `Talk at our crown's gate, my lord: ${r.title} is ${r.trait}, and of the heir ${heir} they say "he'll be better than his father". I have yet to meet anyone who says it out loud.`),
      ]
    },
    go: { label: L('Tacın sayfasını aç', "Open the crown's page"), act: crownsAct },
  },
  {
    // The two crowns' rivalry, whatever it is.
    id: 'g:crowns.rivalry',
    when: (c) => keyed(c) && c.crowns > 1,
    say: (c) => {
      const w = crownWays(c.kingdom, 0, c.now).rivalry
      const m = Math.max(1, Math.ceil((w.until - c.now) / 60_000))
      const a = c.online.crowns[0] ?? '?'
      const b = c.online.crowns[1] ?? '?'
      if (w.stance === 'peace')
        return [
          L(`İki taç barışta, lordum: ${a} ile ${b} birbirine hediye yolluyor. Hediyelerin yarısı yolda kayboluyor; bende değil, söyleyeyim.`, `The two crowns are at peace, my lord: ${a} and ${b} send each other gifts. Half the gifts go missing on the way; not to me, let me say.`),
          L(`Taçlar arasında sükûnet var, en az ${m} dakika. Elçiler bu dönemde işsiz kalır; ben de size geldim.`, `Calm between the crowns, for ${m} minutes at least. Envoys are idle at such times; so I came to you.`),
          L(`${a} ile ${b} barışık, lordum. Barış uzun sürmez; ben iki tacı da tanırım, ikisi de sofrada son lokmayı kimseye bırakmaz.`, `${a} and ${b} are at peace, my lord. It won't last; I know both crowns, and neither leaves the last morsel to anyone.`),
        ]
      if (w.stance === 'tension')
        return [
          L(`Taçlar arasında gerginlik var, lordum; ${m} dakika sürecek gibi. Rakip haraççılar biraz daha açgözlü gelir. Kılıçlar kınında ama kınlar gevşek.`, `There is tension between the crowns, my lord; it looks set to last ${m} minutes. The rival tribute collectors will come a little greedier. Swords are sheathed, but loosely.`),
          L(`${a} elçisi ${b} sarayında selam vermeden çıkmış, lordum. Ben olsam verirdim; ben her yere selam veririm, kapılara bile.`, `The envoy of ${a} left the court of ${b} without a bow, my lord. I would have bowed; I bow everywhere, even to doors.`),
          L(`Başkentlerde sesler yükseliyor, lordum. Savaş çıkarsa hangi tarafta olduğumuzu herkes bilir; çıkmazsa da bilir. Kısacası herkes biliyor.`, `Voices are rising in the capitals, my lord. If war comes, everyone knows which side we are on; if it doesn't, they know too. In short, everyone knows.`),
        ]
      return [
        L(`Taçlar savaşta, lordum; ${m} dakika daha. Ben savaşı arkadan, stratejik olarak izliyorum; çok arkadan.`, `The crowns are at war, my lord; ${m} more minutes. I am watching the war from the rear, strategically; very far to the rear.`),
        L(`${a} ile ${b} birbirine girdi, lordum. Kazanan tacın lordları sevinecek; ben iki tarafa da tebrik mektubu yazdım, birini yollarım.`, `${a} and ${b} are at each other's throats, my lord. The winning crown's lords will rejoice; I have written letters of congratulation to both sides, and will send one.`),
      ]
    },
    go: { label: L('Taçlara bak', 'Look at the crowns'), act: crownsAct },
  },
  {
    // The rival crown's ruler.
    id: 'g:crowns.rival',
    when: (c) => keyed(c) && c.crowns > 1 && c.kingdom.liege !== undefined && c.kingdom.liege !== null,
    say: (c) => {
      const r = ruler(c, c.kingdom.liege === 0 ? 1 : 0)
      return [
        L(`Rakip taçtan dedikodu, lordum: ${r.title} ${r.age} yaşında ve ${r.trait} biriymiş. Haraççıları buna göre gelir; kesesi neyse haracı o.`, `Gossip from the rival crown, my lord: ${r.title} is ${r.age} and ${r.trait} by nature. His tribute collectors come accordingly; as is his purse, so is his demand.`),
        L(`${r.realm} sarayında bir casusumuz yok, lordum, ama bir aşçıyla tanışığım var. Aşçı diyor ki ${r.title} ${r.trait}; ve çorbayı az tuzlu severmiş. İkincisi işimize yaramaz, ama bilin.`, `We have no spy at the court of ${r.realm}, my lord, but I know a cook there. The cook says ${r.title} is ${r.trait}, and likes his soup lightly salted. The second won't help us, but now you know.`),
        L(`Rakip hükümdar ${r.title} hakkında bir şey söyleyeyim, lordum: ${r.age} yaşında, hâlâ sağlam. Ben onun yaşındayken iki merdiveni bir çıkardım; şimdi bir merdiveni iki çıkıyorum.`, `A word about the rival ruler ${r.title}, my lord: ${r.age} and still hale. At his age I took the stairs two at a time; now I take each stair twice.`),
      ]
    },
    go: { label: L('Taçlara bak', 'Look at the crowns'), act: crownsAct },
  },
  {
    // The strongest of the other lords.
    id: 'g:lords.top',
    when: (c) => others(c).some((k) => (k.score?.total ?? 0) > 0),
    say: (c) => {
      const top = [...others(c)].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0]
      const mine = c.online.kingdoms.find((k) => k.id === c.online.me)?.score?.total ?? 0
      const ahead = (top.score?.total ?? 0) > mine
      return ahead
        ? [
            L(`Lobinin en güçlüsü şimdilik ${top.name}, lordum: puanı aşağı yukarı ${n(top.score!.total)}. Bizden önde; şimdilik. "Şimdilik" lafını ben uydurdum, telif istemem.`, `The strongest in the lobby for now is ${top.name}, my lord: around ${n(top.score!.total)} points. Ahead of us; for now. I coined the phrase "for now"; I ask no royalties.`),
            L(`${top.name} hızla büyüyor, lordum. Bir casusumuz olsa neyle büyüdüğünü öğrenirdik; olmasa da ben tahmin ederim: kendini beğenmişlikle. Tanırım o tipleri.`, `${top.name} is growing fast, my lord. With a spy there we would learn what it feeds on; without one I'll guess: conceit. I know the type.`),
            L(`Hanlarda herkes ${top.name}'ı konuşuyor, lordum. Bizi konuşmuyorlar. Ben bizi konuştum ama dinleyen olmadı.`, `In the inns everyone talks about ${top.name}, my lord. Nobody talks about us. I talked about us, but nobody listened.`),
          ]
        : [
            L(`Sıralamada başı biz çekiyoruz, lordum; ${top.name} hemen arkada. Arkadakiler hep öndekine bakar; sırtımızı dik tutalım.`, `We lead the ranking, my lord; ${top.name} is right behind. Those behind always watch the one ahead; let's keep our backs straight.`),
            L(`${top.name} bizi yakalamak istiyor, lordum. Elçisi bana sordu, "nasıl bu kadar iyiler?" Ben "elçileri sayesinde" dedim. Yalan değil.`, `${top.name} wants to catch us, my lord. Its envoy asked me, "how are they so good?" I said "thanks to their envoy". Not a lie.`),
          ]
    },
    go: { label: L('Lordlara bak', 'Look at the lords'), act: lordsAct },
  },
  {
    // A war between other lords (or ours).
    id: 'g:lords.wars',
    when: (c) => wars(c).length > 0,
    say: (c) => {
      const mine = wars(c).find((p) => p.from_id === c.online.me || p.to_id === c.online.me)
      if (mine) {
        const foe = nameOf(c, mine.from_id === c.online.me ? mine.to_id : mine.from_id)
        return [
          L(`${foe} ile savaştayız, lordum; unutmadınız umarım. Ben unutmadım; her sabah kapının arkasına bakıyorum.`, `We are at war with ${foe}, my lord; I hope you haven't forgotten. I haven't; I check behind the door every morning.`),
          L(`${foe} sınırında ordular var mı diye baktım, lordum. Uzaktan baktım; yakından bakmak askerin işi.`, `I looked to see whether there are armies on ${foe}'s border, my lord. From afar; looking up close is a soldier's job.`),
          L(`Savaş puanını bir hesaplayın derim, lordum. ${foe} barış isterse pazarlık edelim; ben pazarlıkta iyiyimdir, bir keresinde bir kâseyi iki katına aldım.`, `I'd say check the war score, my lord. If ${foe} sues for peace, let's haggle; I'm good at haggling, I once bought a bowl for twice its price.`),
        ]
      }
      const w = wars(c)[0]
      const a = nameOf(c, w.from_id)
      const b = nameOf(c, w.to_id)
      return [
        L(`Duydunuz mu, lordum? ${a} ile ${b} savaşta. İki lord kavga ederken üçüncüsü… bilirsiniz, atasözünün sonunu hep unuturum ama iyi bir şeydi.`, `Have you heard, my lord? ${a} and ${b} are at war. When two lords quarrel, the third… you know, I always forget how the proverb ends, but it was something good.`),
        L(`${a}, ${b}'ye savaş açtı, lordum. İkisi de bize elçi yollamadı; kırıldım. Ama kırgınlığım işime engel olmaz, olan biteni izliyorum.`, `${a} has declared war on ${b}, my lord. Neither sent us an envoy; I'm hurt. But my hurt doesn't stop my work; I am watching.`),
        L(`Komşular birbirine girdi, lordum: ${a} ile ${b}. Biz tarafsızız; yani ikisine de gülümsüyoruz, ikisinin de arkasından konuşuyoruz.`, `The neighbours are at it, my lord: ${a} and ${b}. We are neutral; that is, we smile at both and talk behind both their backs.`),
      ]
    },
    go: { label: L('Lordlara bak', 'Look at the lords'), act: lordsAct },
  },
  {
    // Spies: what the house does, or that there is none.
    id: 'g:spies.net',
    when: (c) => buildingCount(c.kingdom, 'spyHouse') > 0 && others(c).length > 0,
    say: (c) => {
      const out = c.online.missions.filter((m) => m.owner_id === c.online.me && m.ended_at === null && m.caught_at === null)
      const home = c.kingdom.spies ?? 0
      const target = [...others(c)].sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))[0]
      if (out.length === 0)
        return [
          L(`Casuslarımız evde oturuyor, lordum; ${home} kişi, hepsi pelerinli. Pelerinli adam evde durunca şüphe çeker. ${target.name}'a birini yollasak?`, `Our spies are sitting at home, my lord; ${home} of them, all cloaked. A cloaked man indoors draws suspicion. Shall we send one to ${target.name}?`),
          L(`Casus evinde kimse çalışmıyor, lordum. Bir tanesi yüzünü sakladığı için kim olduğunu bilmiyoruz; belki de aşçıdır.`, `Nobody is working in the spy house, my lord. One hides his face so well we don't know who he is; perhaps he's the cook.`),
          L(`Lordum, ${target.name} hakkında hiçbir şey bilmiyoruz; ne ambarını ne ordusunu. Ben tahmin edebilirim ama tahminlerim pek tutmaz; bir keresinde yağmur dedim, deprem oldu.`, `My lord, we know nothing of ${target.name}; neither its stores nor its army. I could guess, but my guesses rarely hold; once I said rain and there was an earthquake.`),
        ]
      const where = nameOf(c, out[0].target_id)
      return [
        L(`${out.length} casusumuz görevde, lordum; biri ${where} sarayında. Bana bir mektup yolladı: "her şey yolunda". Mektubu yakmamı istemiş; yaktım, sonra okudum. Ya da tersi.`, `${out.length} of our spies are abroad, my lord; one is at ${where}'s court. He sent me a letter: "all is well". He asked me to burn it; I burned it, then read it. Or the other way round.`),
        L(`${where}'daki ağımız büyüyor, lordum. Ağ güçlenince operasyonlar açılır: sabotaj, kaçırma, isyan. Ben hiçbirine karışmam; yalnızca not alırım.`, `Our network at ${where} is growing, my lord. A stronger network opens operations: sabotage, kidnapping, revolt. I meddle in none of it; I only take notes.`),
        L(`Casus raporu tazelemek iyi olur, lordum. Eski rapor bayat ekmek gibidir: yenir ama keyif vermez.`, `A fresh spy report would be good, my lord. An old report is like stale bread: edible, but no pleasure.`),
      ]
    },
    go: { label: L('Casuslara bak', 'Look at the spies'), act: spiesAct },
  },
  {
    // No spy house yet: the trade of whispers.
    id: 'g:spies.none',
    when: (c) => palaceLevel(c.kingdom, c.now) >= (balance.economy.buildings.spyHouse.requiresPalace ?? 2) && buildingCount(c.kingdom, 'spyHouse') === 0,
    say: () => [
      L(`Lordum, bütün lordlar birbirini gözlüyor; bir biz gözlemiyoruz. Ben gözlüyorum ama gözlerim eskisi gibi değil. Bir casus evi kursak?`, `My lord, all the lords watch one another; all but us. I watch, but my eyes are not what they were. Shall we build a spy house?`),
      L(`Casussuz lord, karanlıkta yürüyen adama benzer, lordum. Ben karanlıkta yürürüm, ama hep aynı dolaba çarparım.`, `A lord without spies is like a man walking in the dark, my lord. I walk in the dark, but I always bump into the same cupboard.`),
      L(`Bir casus evi kraliçe kaçırmaya, sabotaja, isyana kapı açar, lordum. Ben bunları onaylamam tabii; yalnızca anlatırım. Uzun uzun anlatırım.`, `A spy house opens the door to kidnapping queens, sabotage and revolts, my lord. Not that I approve, of course; I merely describe them. At length.`),
    ],
    go: { label: L('Casus evini kur', 'Build the spy house'), act: { kind: 'build', building: 'spyHouse' } },
  },
  {
    // The army: the garrison, the field.
    id: 'g:army.state',
    when: (c) => buildingCount(c.kingdom, 'barracks') > 0,
    say: (c) => {
      const g = c.kingdom.soldiers ?? 0
      const field = c.online.armies.filter((a) => a.kingdom_id === c.online.me).length
      return field > 0
        ? [
            L(`Sahada ${field} ordumuz var, lordum, sarayda da ${g} asker. Komutanlar elçimi bekliyor; ben de dizlerimi. Kim önce gelirse.`, `We have ${field} army in the field, my lord, and ${g} soldiers at the palace. The commanders await my messenger; I await my knees. Whoever comes first.`),
            L(`Ordumuz yolda, lordum. Moralleri iyi; ben yanlarındayken daha da iyiydi, sonra bir şarkı söyledim. Sonra moralleri biraz düştü.`, `Our army is on the march, my lord. Their spirits are good; they were better while I was with them, until I sang. Then they fell a bit.`),
            L(`Askerlerimiz uzun yürüyünce yorulur, lordum; bir hanın yakınında dinlendirmek moral toplar. Ben her hanın yakınında dinlenirim, moralim hep yüksektir.`, `Our soldiers tire on long marches, my lord; resting near an inn restores morale. I rest near every inn; my morale is always high.`),
          ]
        : [
            L(`Kışlada ${g} asker esniyor, lordum. Esneyen asker paslanır; bir çeteyi kovalasalar, bir kasabayı kuşatsalar…`, `${g} soldiers are yawning in the barracks, my lord. A yawning soldier rusts; if they chased a band, or besieged a town…`),
            L(`Askerlerimiz talim yapıyor, lordum; bugün saman kuklalardan biri kazandı. Belki de sahaya çıkmanın vakti gelmiştir.`, `Our soldiers are drilling, my lord; today one of the straw dummies won. Perhaps it is time to take the field.`),
            L(`Garnizonda ${g} asker var, lordum. Ordu çıkarmak için hepsi gerekmez; benim gibi kıdemli birkaç kişi yeter. Ben gelmem ama.`, `There are ${g} soldiers in the garrison, my lord. You don't need them all to raise an army; a few seasoned men like me will do. I won't be coming, though.`),
          ]
    },
    go: { label: L('Orduya bak', 'Look at the army'), act: armyAct },
  },
  {
    // A band on the roads, by name.
    id: 'g:wilds.band',
    when: (c) => bandsOf(c.world, c.world.seed, c.online.outlaws).some((b) => outlawUp(b, c.now)),
    say: (c) => {
      const up = bandsOf(c.world, c.world.seed, c.online.outlaws).filter((b) => outlawUp(b, c.now))
      const b = up[Math.floor(c.now / 600_000) % up.length]
      return [
        L(`Yollarda ${b.name} dolaşıyor, lordum; ${b.clanName} bağlı. ${up.length} çete ayakta. Yensek ganimeti var, yakalananlar da mağaralarını anlatır.`, `${b.name} roams the roads, my lord; sworn to the ${b.clanName}. ${up.length} bands are at large. Beat one and there is loot, and the captives talk of their cave.`),
        L(`Hanlarda ${b.name} konuşuluyor, lordum. Adı korkunç ama ben bir keresinde onlardan birini gördüm; ayakkabısının teki yoktu. Korkunç bir adamın iki ayakkabısı olur.`, `The inns talk of ${b.name}, my lord. A dreadful name, but I once saw one of them; he was missing a shoe. A truly dreadful man has two shoes.`),
        L(`${b.clanName} dağlarda bir mağarada yaşıyormuş, lordum. Çetelerini yenen iz sürer, izi süren mağarayı bulur. Mağarayı ben bulmadım; karanlık yerlerden hoşlanmam.`, `The ${b.clanName} live in a cave in the mountains, my lord. Whoever beats their bands picks up the trail, and whoever follows the trail finds the cave. I didn't look; I dislike dark places.`),
      ]
    },
    go: { label: L('Orduya bak', 'Look at the army'), act: armyAct },
  },
  {
    // The clans: three of them, and their caves.
    id: 'g:wilds.clans',
    when: (c) => clansOf(c.world.seed, c.online.outlaws).length > 0,
    say: (c) => {
      const clans = clansOf(c.world.seed, c.online.outlaws)
      const names = clans.map((x) => x.name).join(', ')
      return [
        L(`Dağlarda ${clans.length} yağmacı klanı var, lordum: ${names}. Biri yok olunca bir başkası türer; mantar gibiler. Mantarı severim, klanları sevmem.`, `There are ${clans.length} bandit clans in the mountains, my lord: ${names}. When one falls another springs up; like mushrooms. I like mushrooms; not clans.`),
        L(`Bir klanın mağarasını alan lord ganimetiyle şan da kazanır, lordum. Ben mağaraya girmem; ama kapısında durup "teslim olun" diye bağırabilirim. Uzaktan.`, `The lord who takes a clan's cave wins glory along with the hoard, my lord. I won't go in; but I can stand at the mouth and shout "surrender". From a distance.`),
      ]
    },
    go: { label: L('Orduya bak', 'Look at the army'), act: armyAct },
  },
  {
    // Pirates on the lakes.
    id: 'g:wilds.pirates',
    when: (c) => boatsOf(c.world, c.world.seed, c.online.outlaws).some((b) => outlawUp(b, c.now)),
    say: (c) => {
      const up = boatsOf(c.world, c.world.seed, c.online.outlaws).filter((b) => outlawUp(b, c.now))
      const b = up[Math.floor(c.now / 600_000) % up.length]
      const yard = buildingCount(c.kingdom, 'shipyard') > 0
      return [
        L(`Göllerde ${up.length} korsan teknesi dolaşıyor, lordum; en ünlüsü ${b.name}. ${yard ? 'Bir filoyla kovalasak ödül alırız.' : 'Tersanemiz olsa kovalardık.'}`, `${up.length} pirate boats sail the lakes, my lord; the most famous is ${b.name}. ${yard ? 'Chase one with a fleet and there is a bounty.' : 'With a shipyard we could chase them.'}`),
        L(`${b.name} kara yelkenini açmış, lordum. Ben denize hiç açılmadım; midem karadan bile bulanır.`, `${b.name} has raised its black sail, my lord. I have never been to sea; my stomach turns even on land.`),
        L(`Korsanların iki limanı var, lordum; liman doluyken korsanlar azgın olur. Bir filo ablukaya alırsa sakinleşirler. Ben de abluka altında sakinleşirim; karım bilir.`, `The pirates have two havens, my lord; when a haven is full the pirates are bold. A fleet's blockade calms them. I calm down under blockade too; my wife can vouch.`),
      ]
    },
    go: { label: L('Donanmaya bak', 'Look at the navy'), act: seaAct },
  },
  {
    // The expeditions: those out, or the idea of one.
    id: 'g:pursuits.journey',
    when: (c) => maxExpeditions(c.kingdom, c.now) > 0,
    say: (c) => {
      const out = expeditionsOut(c.kingdom, c.now)
      if (out.length > 0) {
        const m = Math.max(1, Math.ceil((Math.min(...out.map((e) => e.endAt)) - c.now) / 60_000))
        return [
          L(`Kafilemiz yolda, lordum; ${m} dakika sonra dönecek. Döndüklerinde ganimet anlatırlar, abartırlar; ben dinlerim, daha da abartırım.`, `Our company is on the road, my lord; back in ${m} minutes. When they return they'll tell of loot and exaggerate; I'll listen and exaggerate further.`),
          L(`Seferdekilerden haber yok, lordum; haber yoksa iyi haberdir. Bunu ben söylemiyorum, annem söylerdi. Annem de hiç seyahat etmezdi.`, `No word from the expedition, my lord; no news is good news. Not my saying, my mother's. And she never travelled.`),
        ]
      }
      return [
        L(`Lordum, bir sefer düzenlesek? Avcılar ormana, kâşifler dağlara, hacılar tapınağa… Boştaki köylüler içindir; ben gönüllü olmam, ama uğurlarım.`, `My lord, shall we send an expedition? Hunters to the forest, scouts to the mountains, pilgrims to the temple… It's for idle villagers; I won't volunteer, but I'll wave them off.`),
        L(`Kâşifler dağlarda harabe bulur, dünyadan haber getirir, lordum. Ben de haber getiririm ama dağa çıkmadan.`, `Scouts find ruins in the mountains and bring news of the world, my lord. I bring news too, but without climbing anything.`),
        L(`Kayıp bir hazine izi var diyorlar, lordum. Çoğu zaman eli boş dönülür; ama bir keresinde biri 800 altınla döndü. O adamı tanırım; altınları hâlâ saymaya çalışıyor.`, `They say there's a trail to a lost treasure, my lord. Most come back empty-handed; but once a man returned with 800 gold. I know him; he's still trying to count it.`),
      ]
    },
    go: { label: L('Seferlere bak', 'Look at the expeditions'), act: journeyAct },
  },
  {
    // The family: the ruler's age, the heir.
    id: 'g:court.house',
    when: (c) => !!c.kingdom.dynasty?.king,
    say: (c) => {
      const d = c.kingdom.dynasty!
      const age = Math.floor(ageOf(d.king!, c.now))
      const heir = heirOf(d, c.now)
      return heir
        ? [
            L(`Hükümdarımız ${age} yaşında, lordum; veliaht ${heir.name} ${Math.floor(ageOf(heir, c.now))}. Saray soytarısı veliahta benziyor; ben söylemedim, soytarı söyledi.`, `Our ruler is ${age}, my lord; the heir ${heir.name} is ${Math.floor(ageOf(heir, c.now))}. The court jester resembles the heir; I didn't say it, the jester did.`),
            L(`${heir.name} her gün biraz daha büyüyor, lordum; eğitimine dikkat edelim. Ben onun yaşındayken elçiliği seçtim; çünkü kılıç ağırdı.`, `${heir.name} grows a little every day, my lord; let us mind the education. At that age I chose diplomacy; the sword was heavy.`),
            L(`Hanedanın kardeşleri, akrabaları hükümdara nasıl bakıyor, bir yoklayın derim, lordum. Hoşnutsuz bir kardeş taht davacısı olur; ben de hoşnutsuzum ama tahtta gözüm yok, yalnızca bir yastıkta.`, `I'd check how the brothers and kin regard the ruler, my lord. A sour brother becomes a pretender; I'm sour too, but I've no eye on the throne, only on a cushion.`),
          ]
        : [
            L(`Hükümdarımız ${age} yaşında ve bir veliahdı yok, lordum. Saray bunu fısıldıyor; ben fısıltıları yüksek sesle aktarırım, işim bu.`, `Our ruler is ${age} and has no heir, my lord. The court whispers it; I repeat whispers out loud, it's my job.`),
            L(`Veliahtsız bir saray rüzgârda bir mum gibidir, lordum. Bu benzetmeyi bir ozandan çaldım; ozan da başka birinden çalmıştı.`, `A court without an heir is a candle in the wind, my lord. I stole that line from a minstrel; he stole it from someone else.`),
          ]
    },
    go: { label: L('Hanedana bak', 'Look at the house'), act: houseAct },
  },
]
