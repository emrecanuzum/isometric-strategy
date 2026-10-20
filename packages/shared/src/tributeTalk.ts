import { L } from './lang'
import { patrolSpec } from './patrols'
import { hash } from './worldgen'

// A word with the rival crown's tribute collectors (CLAUDE.md §7.8): their captain has a name and a temper drawn
// from the lobby seed and the visit, says a few things, and the lord answers each with one of three replies. Playing
// along the way his temper likes lowers the demand, a dry answer leaves it, a sharp one raises it, and two sharp ones
// end the talk with the captain angry (refusing him then costs more). The same seed and visit give the same talk on
// every screen and on the server, which works the outcome out again from the replies.

export type Temper = 'proud' | 'greedy' | 'tired' | 'pious' | 'homesick'
export const TEMPERS: Temper[] = ['proud', 'greedy', 'tired', 'pious', 'homesick']

// An exchange as written: what he says, then the reply he likes, a dry one and a sharp one.
type Written = [say: string, good: string, plain: string, sharp: string]

interface Character {
  label: string
  greet: string[]
  exchanges: Written[]
  react: { good: string[]; plain: string[]; sharp: string[] }
  pleased: string
  plain: string
  angry: string
}

const CHARACTERS: Record<Temper, Character> = {
  proud: {
    label: L('kibirli', 'proud'),
    greet: [
      L('Ben {name}! Rakip tacın en yiğit haraççısı. Atım bile senin muhafızlarından soyludur.', 'I am {name}! The bravest tribute collector of the rival crown. Even my horse is better bred than your guards.'),
      L('Önümde eğil, lord! Yani… eğilmesen de olur, ama eğilsen hoş olurdu. Ben {name}.', "Bow before me, lord! Well… you needn't, but it would be a nice touch. I am {name}."),
    ],
    exchanges: [
      [L('Sarayın fena değil. Benim doğduğum ahır kadar büyük sayılır.', "Your palace isn't bad. Nearly as big as the stable I was born in."), L('Böyle bir yiğidin doğduğu ahır elbet saray gibidir, efendim.', 'A stable that bore such a hero must surely be a palace, sir.'), L('Sarayım işimi görüyor.', 'My palace serves its purpose.'), L('Ahırda doğduğun belli; kokusu hâlâ üstünde.', 'Born in a stable, clearly; you still smell of it.')],
      [L('Kılıcıma bak. Kırk haydut kesti, otuz dokuzu da gördü.', 'Look at my sword. It has cut down forty brigands, and thirty-nine of them saw it coming.'), L('Kırkıncısının ozanlara destan olduğuna eminim!', "I'm sure the fortieth is already a minstrel's ballad!"), L('Güzel kılıç. Paslanmasın.', "Fine sword. Mind it doesn't rust."), L('Kırk haydut mu? Bizim kümesteki horoz daha çok can aldı.', 'Forty brigands? The rooster in our henhouse has a higher tally.')],
      [L('Tacım beni haraca değil, savaşa yollamalıydı. Yazık, yetenek harcanıyor.', 'My crown should have sent me to war, not to fetch tribute. A shame; such talent wasted.'), L('Taç değerinizi bilmiyor; ama biz biliyoruz.', "The crown doesn't know your worth; but we do."), L('Her işin bir hayrı vardır.', 'Every task has its blessing.'), L('Belki de savaşta işe yaramadığın içindir.', "Perhaps it's because you're no use in a war.")],
      [L('Destanlarımı duydun mu? Üç ozan yazdı, ikisi ağladı.', 'Have you heard my ballads? Three minstrels wrote them, and two of them wept.'), L('Duymaz olur muyum! Üçüncüsü sevinçten bayılmış diyorlar.', 'Heard them? But of course! They say the third fainted from joy.'), L('Buralara pek ozan uğramaz.', 'Few minstrels come this way.'), L('Duydum. Ozanların ağlamasına hiç şaşmadım.', "I have. The weeping minstrels didn't surprise me one bit.")],
    ],
    react: {
      good: [L('Hah! Sonunda değer bilen biri.', 'Hah! At last, someone who knows true worth.'), L('Doğru söze ne denir? Doğru denir.', 'What can one say to the truth? One says: true.')],
      plain: [L('Hıh. Peki.', 'Hmph. Fine.'), L('Eh… olabilir.', 'Well… perhaps.')],
      sharp: [L('Sen kiminle konuştuğunu biliyor musun?!', "Do you know who you're talking to?!"), L('Bu sözü defterime kırmızı mürekkeple yazıyorum.', "I'm writing that remark in my ledger in red ink.")],
    },
    pleased: L('Böyle bir lorda haracın azını yazmak bile şereftir. Yazıyorum!', 'For such a lord, even writing down a smaller tribute is an honour. Written!'),
    plain: L('Konuştuk, güzel. Ama haraç haraçtır.', 'We talked, very nice. But tribute is tribute.'),
    angry: L('Yeter! Bu hakaret de haraca eklenecek!', 'Enough! That insult goes on the bill too!'),
  },
  greedy: {
    label: L('açgözlü', 'greedy'),
    greet: [
      L('Ben {name}. Haracı alırım, bahşişi de severim. İkisini karıştırmayalım ama, hı?', "I'm {name}. I take tribute, and I'm fond of tips. Let's not mix the two up, eh?"),
      L('{name} derler bana. Tacım altın ister, ben de… eh, ben de insanım.', "They call me {name}. My crown wants gold, and I… well, I'm only human."),
    ],
    exchanges: [
      [L('Haraç haraçtır. Ama yol tozlu, boğaz kuru, kese hafif…', 'Tribute is tribute. But the road is dusty, the throat is dry, the purse is light…'), L('Kesenin hafifliğini biraz giderelim; sen de tacına biraz az yazarsın, ne dersin?', "Let's lighten that purse's burden a little; and you write a little less for your crown, what do you say?"), L('Çeşme avlunun köşesinde, buyur.', "The fountain's in the corner of the yard, help yourself."), L('Kesen hafifse dilini tart, o fazla ağır.', "If your purse is light, weigh your tongue; it's far too heavy.")],
      [L('Defterime ne yazacağımı ben bilirim. Kalem benim, mürekkep benim.', 'I know what to write in my ledger. My quill, my ink.'), L('Kalem senin elinde ne güzel duruyor. Mürekkep parası bizden olsun.', "How splendid that quill looks in your hand. The ink's on us."), L('Yaz da gidin artık.', 'Write it down and be off.'), L('O defteri tacına gösteririm, bakalım ne diyecek.', "I'll show that ledger to your crown and see what they say.")],
      [L('Hazinen dolu görünüyor. Gözüm parlıyor, kusura bakma.', 'Your treasury looks full. My eyes are sparkling, forgive me.'), L('Parlayan göze bir avuç pırıltı yakışır; aramızda kalsın.', 'A sparkling eye deserves a handful of glitter; just between us.'), L('Görünüşe aldanma, giderimiz de çok.', "Don't be fooled by looks, our expenses are many."), L('Gözünü oyarız, o zaman parlamaz.', "We'll put your eyes out, then they won't sparkle.")],
      [L('Geçen lord bana bir yüzük verdi. Haracını da az yazdım. Tesadüf.', 'The last lord gave me a ring. And I wrote his tribute small. Coincidence.'), L('Ne güzel tesadüf! Bizde de tesadüfler olur, hem de sık sık.', 'What a lovely coincidence! We have coincidences here too, and often.'), L('Yüzük sende güzel durmuş.', 'The ring suits you.'), L('O lordu tacına ihbar etmek lazım. Seni de.', 'That lord should be reported to your crown. And you with him.')],
    ],
    react: {
      good: [L('Hıh hıh… anlaşıyoruz galiba.', 'Heh heh… I think we understand each other.'), L('Akıllı lord, akıllı lord.', 'Clever lord, clever lord.')],
      plain: [L('Ee, başka?', 'And? Anything else?'), L('Laf altın değil, lord.', "Words aren't gold, lord.")],
      sharp: [L('Vay! Defterdeki rakam büyüyor bak.', 'Oh! Look, the figure in the ledger is growing.'), L('Bu söz sana pahalıya patlar.', 'That remark will cost you dearly.')],
    },
    pleased: L('Defteri biraz… düzelttim. Aramızda kalsın.', "I've… adjusted the ledger a little. Just between us."),
    plain: L('Lafla kese dolmaz, lord. Haraç aynen.', "Words don't fill a purse, lord. The tribute stands."),
    angry: L('Bu sözlerin bir bedeli var: defterde haracın büyüdü!', 'Those words have a price: your tribute just grew in the ledger!'),
  },
  tired: {
    label: L('yorgun', 'weary'),
    greet: [
      L('Ben {name}… Bugün dördüncü saray. Ayaklarım beni değil, ben ayaklarımı taşıyorum.', "I'm {name}… Fourth palace today. My feet aren't carrying me; I'm carrying them."),
      L('{name}. Haraççı. Uykusuz. Sırası fark etmez.', '{name}. Tribute collector. Sleepless. In no particular order.'),
    ],
    exchanges: [
      [L('Atım bile benden dinç. Ben mi ona bineyim, o mu bana, karar veremedim.', "Even my horse is fresher than I am. Should I ride him, or he me? I can't decide."), L('Otur biraz; sana bir tas sıcak çorba getirtelim.', "Sit a while; we'll have a bowl of hot soup brought for you."), L('Yol uzun, anlıyorum.', 'Long road, I understand.'), L('Yorgunsan niye geldin? Çağıran olmadı.', "If you're tired, why did you come? Nobody called you.")],
      [L('On beş yıldır kapı kapı dolaşırım. Kapılar hep aynı, ben her yıl biraz daha eski.', "Fifteen years I've gone door to door. The doors are always the same; I'm a little older each year."), L('Bunca yıl hizmet edene bir gün dinlenmek de hak olmalı.', "Whoever has served so many years has earned a day's rest."), L('Herkesin bir işi var.', 'Everyone has a job.'), L('Emekliliğini başka bir sarayda bekle.', 'Wait for your retirement at some other palace.')],
      [L('Bir de nutuk mu çekeceksin? Önceki lord çekti, ayakta uyuyakaldım.', 'Are you going to make a speech too? The last lord did, and I fell asleep standing.'), L('Nutuk yok. Kısa keselim ki erken dönesin.', "No speeches. Let's keep it short so you can head back early."), L('Dinlemezsen dinleme.', "Don't listen if you don't want to."), L('Uzun bir nutuk hazırladım, otur bakalım. Birinci bölüm…', "I've prepared a long speech, sit down. Part one…")],
      [L('Rüyamda bile haraç topluyorum. Uyanınca yine. Hangisi rüya, bilmiyorum.', "I collect tribute even in my dreams. And again when I wake. I don't know which is the dream."), L('Bu gece samanlığımızda deliksiz uyu; misafirimizsin.', "Sleep soundly in our hayloft tonight; you're our guest."), L('Garip bir iş seninki.', 'Strange job, yours.'), L('Belki bu da rüyadır; bir çimdik atalım mı?', 'Maybe this is a dream too; shall we pinch you?')],
    ],
    react: {
      good: [L('Ah… Tanrı razı olsun.', 'Ah… bless you.'), L('İlk defa bir lord beni dinledi.', 'First time a lord has ever listened to me.')],
      plain: [L('Hı. Evet. Neyse.', 'Mm. Yes. Anyway.'), L('Esniyorum, kusura bakma.', "I'm yawning, forgive me.")],
      sharp: [L('Bir bu eksikti.', "That's all I needed."), L('Yorgun adamın sabrını sınama.', "Don't test a tired man's patience.")],
    },
    pleased: L('Haracı kısa yazdım; ben de yolu kısa keserim. Herkes mutlu.', "I wrote the tribute short; I'll cut the road short too. Everyone's happy."),
    plain: L('Peki… haraç yine aynı. Ben gidip bir oturayım.', "Fine… the tribute's the same. I'm going to go sit down."),
    angry: L('Tamam, yeter. Haraç arttı, ben de uyumaya gidiyorum.', "Right, that's enough. The tribute's gone up, and I'm off to sleep."),
  },
  pious: {
    label: L('dindar', 'pious'),
    greet: [
      L('Selam ve bereket üzerine olsun. Ben {name}. Haracı Tanrı’nın izniyle toplarım.', 'Peace and blessings upon you. I am {name}. I collect tribute by the grace of God.'),
      L('{name}. Önce dua, sonra hesap. Sırayı bozmayalım.', "{name}. Prayer first, then the accounts. Let's keep to the order."),
    ],
    exchanges: [
      [L('Haraç vermek de bir sadakadır, derim. Tacım pek katılmaz ama.', "Paying tribute is a kind of alms, I say. My crown doesn't quite agree."), L('Sözlerin ilahi gibi; tapınağımızda senin için bir mum yakarız.', "Your words are like a hymn; we'll light a candle for you in our temple."), L('Herkes inandığını yaşar.', 'Each lives by what he believes.'), L('Sadakaysa tacına söyle, biraz da o versin.', "If it's alms, tell your crown to give a little too.")],
      [L('Yolda bir kuyruklu yıldız gördüm. Hayra mı alamet, şerre mi?', 'On the road I saw a comet. A good omen or an ill one?'), L('Senin gibi bir hayır sahibinin yolunda elbet hayra alamettir.', 'On the road of so generous a soul, surely a good omen.'), L('Yıldız yıldızdır, kayar gider.', 'A star is a star; it falls and is gone.'), L('Kesesini kaybedecek bir haraççıya alamet.', 'An omen for a tribute collector about to lose his purse.')],
      [L('Bu sarayda dua edilir mi? Kapıda kutsal bir şey göremedim.', 'Does anyone pray in this palace? I saw nothing holy at the gate.'), L('Her akşam ederiz; bu akşam senin yolun açık olsun diye de ederiz.', "Every evening; tonight we'll pray for your safe road, too."), L('Eden eder, etmeyen etmez.', "Those who pray, pray; those who don't, don't."), L('Dua mı? Biz bereketi pazarda ararız.', 'Prayer? We look for our blessings at the market.')],
      [L('Açgözlülük büyük günahlardandır. Haraç da… şey, o başka.', "Greed is among the great sins. Tribute is… well, that's different."), L('Elbet başka; sen azıyla yetinmeyi bilen bir ruhsun.', "Of course it's different; you are a soul content with little."), L('Günahı da sevabı da sana kalsın.', 'The sin and the merit are both yours to keep.'), L('Bu vaazı önce kendi kesene versen?', 'Why not preach that sermon to your own purse first?')],
    ],
    react: {
      good: [L('Amin, evladım, amin.', 'Amen, my child, amen.'), L('Sözlerin kalbe su serpti.', 'Your words were water on a thirsty heart.')],
      plain: [L('Hm. Tövbe tövbe.', 'Hm. God forgive us.'), L('Neyse… Tanrı bilir.', 'Anyway… God knows.')],
      sharp: [L('Estağfurullah! Ne sözler bunlar!', 'Heaven forbid! What words are these!'), L('Günaha giriyorsun, lord.', 'You are falling into sin, lord.')],
    },
    pleased: L('Tanrı cömerdi sever; ben de haracı hafiflettim.', "God loves the generous; and so I've lightened the tribute."),
    plain: L('Hayırlı sohbetti. Haraç ise yazıldığı gibidir.', 'A blessed conversation. The tribute, however, stands as written.'),
    angry: L('Tanrı affetsin, ben affetmem. Haraç arttı!', "May God forgive you; I shan't. The tribute has gone up!"),
  },
  homesick: {
    label: L('sılayı özleyen', 'homesick'),
    greet: [
      L('Ben {name}. Köyümden çıkalı üç bahar oldu. Haracı topla, köyü özle; işim bu.', "I'm {name}. Three springs since I left my village. Collect the tribute, miss the village; that's my job."),
      L('{name}. Bir lord daha, bir saray daha… Annemin tandırı gibisi yok.', "{name}. Another lord, another palace… Nothing beats my mother's clay oven."),
    ],
    exchanges: [
      [L('Sancağın bizim köyün bayram örtüsüne benziyor. İçim bir tuhaf oldu.', "Your banner looks like our village's feast-day cloth. It gave me a strange feeling."), L('Anlat bakalım köyünü; bayramlarda neler pişer?', 'Tell me about your village; what do they cook on feast days?'), L('Sancak sancaktır.', 'A banner is a banner.'), L('Köyünüzün zevki bozukmuş demek.', 'Your village has poor taste, then.')],
      [L('Annem şimdi hamur yoğuruyordur. Ben burada senin altınını sayıyorum.', "My mother's kneading dough right now. And here I am counting your gold."), L('Selam söyle annene; dönerken bizim baldan bir kavanoz al.', 'Give your mother my regards; take a jar of our honey on your way back.'), L('Herkesin bir yükü var.', 'Everyone has a burden.'), L('Annen seni bu hâlde görse utanırdı.', 'Your mother would be ashamed to see you like this.')],
      [L('Bir dönsem, tacım bir daha yollamaz derim. Sonra yine yollar.', "Every time I get home, I tell myself my crown won't send me out again. Then it does."), L('Bu sefer tez dönersin; erken bitirelim ki yolun kısalsın.', "You'll be back soon this time; let's finish early so your road is shorter."), L('Tacın bilir.', 'Your crown knows best.'), L('Yollasınlar; köyünde de işe yaramazsın.', "Let them; you'd be no use in your village either.")],
      [L('Bizim köyün kızları sizinkilere benzemez. Bir tanesi var ki…', "The girls of our village aren't like yours. There's one in particular…"), L('Adını söyle de bu akşam onun şerefine kadeh kaldıralım.', "Tell me her name, and tonight we'll raise a cup in her honour."), L('Her köyün güzeli kendine.', 'Every village thinks its own girls the fairest.'), L('O kız seni çoktan unutmuştur.', 'That girl forgot you long ago.')],
    ],
    react: {
      good: [L('Ah… gözlerim doldu; rüzgârdandır.', "Ah… my eyes are watering; it's the wind."), L('Sen iyi adamsın, lord.', "You're a good man, lord.")],
      plain: [L('Hı… köyde de böyle derler.', "Hm… that's what they say back home too."), L('Eh, öyle.', 'Well, so it is.')],
      sharp: [L('Niye böyle konuşuyorsun ki…', 'Why would you talk like that…'), L('Bu söz yüreğime oturdu.', 'That remark went straight to my heart.')],
    },
    pleased: L('Seni köyümde anlatacağım. Haracı da hafif yazdım; kimseye söyleme.', "I'll tell my village about you. And I wrote the tribute light; don't tell anyone."),
    plain: L('Eh… haraç aynı, özlem aynı.', 'Well… same tribute, same longing.'),
    angry: L('Köyümü küçümseyenin haracı ağır olur!', 'Whoever scorns my village pays a heavy tribute!'),
  },
}

const TITLES = [
  L('Yüzbaşı', 'Captain'), L('Haraççıbaşı', 'Chief Collector'), L('Onbaşı', 'Corporal'), L('Tahsildar', 'Tax-gatherer'), L('Sancaktar', 'Standard-bearer'), L('Çavuş', 'Sergeant'), L('Subaşı', 'Constable'), L('Ağa', 'Agha'), L('Bölükbaşı', 'Company Captain'), L('Kethüda', 'Chamberlain'),
]
const NAMES = [
  'Kara Ömer', 'Toygar', 'Kayhan', 'Ertuğ', 'Sungur', 'Alpay', 'Duman', 'Karaca', 'Oktay', 'Bozkurt', 'Çağan',
  'Topal Rıza', 'Gümüş Temir', 'Bıyıklı Saltuk', 'Uzun Hasan', 'Demirci Battal', 'Deli Hüsrev', 'Kara Mustafa',
  'Turgut', 'Atsız', 'Kaplan', 'Yavuz', 'Akbaş Murat', 'Çakır Ali', 'Kel Hamza', 'Sağır Bekir', 'Tekinalp', 'Börü',
  'Esen', 'Kutlu', 'Koca Davut', 'Sarı Saltuk',
]

const draw = (seed: number, visit: number, k: number, n: number) => Math.floor(hash(visit, k, seed + 4021) * n)

export interface TalkReply {
  text: string
  points: 1 | 0 | -1
}
export interface TalkScript {
  name: string
  temper: Temper
  label: string
  greet: string
  exchanges: { say: string; replies: TalkReply[] }[]
}

// The captain of visit `visit` and what he will talk about: his temper, name, a greeting and the exchanges, each with
// its three replies in an order drawn from the seed.
export function tributeTalkScript(seed: number, visit: number): TalkScript {
  const temper = TEMPERS[draw(seed, visit, 1, TEMPERS.length)]
  const c = CHARACTERS[temper]
  const name = `${TITLES[draw(seed, visit, 2, TITLES.length)]} ${NAMES[draw(seed, visit, 3, NAMES.length)]}`
  const count = Math.min(c.exchanges.length, patrolSpec().tribute.talk.exchanges)
  // A run of the written exchanges from a drawn one on.
  const first = draw(seed, visit, 4, c.exchanges.length)
  const exchanges = Array.from({ length: count }, (_, i) => {
    const [say, good, plain, sharp] = c.exchanges[(first + i) % c.exchanges.length]
    const replies: TalkReply[] = [
      { text: good, points: 1 },
      { text: plain, points: 0 },
      { text: sharp, points: -1 },
    ]
    // Shuffled, so the reply he likes is not always the first.
    for (let j = replies.length - 1; j > 0; j--) {
      const k = draw(seed, visit, 10 + i * 4 + j, j + 1)
      ;[replies[j], replies[k]] = [replies[k], replies[j]]
    }
    return { say: say.replace('{name}', name), replies }
  })
  return { name, temper, label: c.label, greet: c.greet[draw(seed, visit, 5, c.greet.length)].replace('{name}', name), exchanges }
}

// What he says back to a reply worth `points` in exchange `i`.
export function tributeTalkReact(seed: number, visit: number, i: number, points: number) {
  const c = CHARACTERS[TEMPERS[draw(seed, visit, 1, TEMPERS.length)]]
  const lines = points > 0 ? c.react.good : points < 0 ? c.react.sharp : c.react.plain
  return lines[draw(seed, visit, 40 + i, lines.length)]
}

export interface TalkOutcome {
  // What the demand is multiplied by.
  factor: number
  // Ended by two sharp replies: refusing him then costs more.
  angry: boolean
  good: number
  sharp: number
  // His last word.
  line: string
}

// The outcome of the replies `replies` (indices into each exchange's replies), or null when they do not make a whole
// talk: one reply to every exchange, unless the captain grew angry and walked off at the last of them.
export function tributeTalk(seed: number, visit: number, replies: unknown): TalkOutcome | null {
  if (!Array.isArray(replies)) return null
  const spec = patrolSpec().tribute.talk
  const script = tributeTalkScript(seed, visit)
  const c = CHARACTERS[script.temper]
  let good = 0
  let sharp = 0
  for (let i = 0; i < replies.length; i++) {
    const r = replies[i]
    if (i >= script.exchanges.length || !Number.isInteger(r) || r < 0 || r >= script.exchanges[i].replies.length) return null
    const points = script.exchanges[i].replies[r].points
    if (points > 0) good++
    if (points < 0) sharp++
    if (sharp >= spec.angryAt) {
      if (i !== replies.length - 1) return null
      return { factor: spec.angryFactor, angry: true, good, sharp, line: c.angry }
    }
  }
  if (replies.length !== script.exchanges.length) return null
  const discount = spec.discount[Math.min(good, spec.discount.length - 1)] ?? 0
  const factor = Math.round((1 - discount + sharp * spec.badRaise) * 100) / 100
  return { factor, angry: false, good, sharp, line: factor < 1 ? c.pleased : c.plain }
}

// The demand after the talk (never below 1 gold).
export const talkedTribute = (amount: number, factor: number) => Math.max(1, Math.round(amount * factor))
