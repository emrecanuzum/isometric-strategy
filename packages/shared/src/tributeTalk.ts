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
    label: 'kibirli',
    greet: [
      'Ben {name}! Rakip tacın en yiğit haraççısı. Atım bile senin muhafızlarından soyludur.',
      'Önümde eğil, lord! Yani… eğilmesen de olur, ama eğilsen hoş olurdu. Ben {name}.',
    ],
    exchanges: [
      ['Sarayın fena değil. Benim doğduğum ahır kadar büyük sayılır.', 'Böyle bir yiğidin doğduğu ahır elbet saray gibidir, efendim.', 'Sarayım işimi görüyor.', 'Ahırda doğduğun belli; kokusu hâlâ üstünde.'],
      ['Kılıcıma bak. Kırk haydut kesti, otuz dokuzu da gördü.', 'Kırkıncısının ozanlara destan olduğuna eminim!', 'Güzel kılıç. Paslanmasın.', 'Kırk haydut mu? Bizim kümesteki horoz daha çok can aldı.'],
      ['Tacım beni haraca değil, savaşa yollamalıydı. Yazık, yetenek harcanıyor.', 'Taç değerinizi bilmiyor; ama biz biliyoruz.', 'Her işin bir hayrı vardır.', 'Belki de savaşta işe yaramadığın içindir.'],
      ['Destanlarımı duydun mu? Üç ozan yazdı, ikisi ağladı.', 'Duymaz olur muyum! Üçüncüsü sevinçten bayılmış diyorlar.', 'Buralara pek ozan uğramaz.', 'Duydum. Ozanların ağlamasına hiç şaşmadım.'],
    ],
    react: {
      good: ['Hah! Sonunda değer bilen biri.', 'Doğru söze ne denir? Doğru denir.'],
      plain: ['Hıh. Peki.', 'Eh… olabilir.'],
      sharp: ['Sen kiminle konuştuğunu biliyor musun?!', 'Bu sözü defterime kırmızı mürekkeple yazıyorum.'],
    },
    pleased: 'Böyle bir lorda haracın azını yazmak bile şereftir. Yazıyorum!',
    plain: 'Konuştuk, güzel. Ama haraç haraçtır.',
    angry: 'Yeter! Bu hakaret de haraca eklenecek!',
  },
  greedy: {
    label: 'açgözlü',
    greet: [
      'Ben {name}. Haracı alırım, bahşişi de severim. İkisini karıştırmayalım ama, hı?',
      '{name} derler bana. Tacım altın ister, ben de… eh, ben de insanım.',
    ],
    exchanges: [
      ['Haraç haraçtır. Ama yol tozlu, boğaz kuru, kese hafif…', 'Kesenin hafifliğini biraz giderelim; sen de tacına biraz az yazarsın, ne dersin?', 'Çeşme avlunun köşesinde, buyur.', 'Kesen hafifse dilini tart, o fazla ağır.'],
      ['Defterime ne yazacağımı ben bilirim. Kalem benim, mürekkep benim.', 'Kalem senin elinde ne güzel duruyor. Mürekkep parası bizden olsun.', 'Yaz da gidin artık.', 'O defteri tacına gösteririm, bakalım ne diyecek.'],
      ['Hazinen dolu görünüyor. Gözüm parlıyor, kusura bakma.', 'Parlayan göze bir avuç pırıltı yakışır; aramızda kalsın.', 'Görünüşe aldanma, giderimiz de çok.', 'Gözünü oyarız, o zaman parlamaz.'],
      ['Geçen lord bana bir yüzük verdi. Haracını da az yazdım. Tesadüf.', 'Ne güzel tesadüf! Bizde de tesadüfler olur, hem de sık sık.', 'Yüzük sende güzel durmuş.', 'O lordu tacına ihbar etmek lazım. Seni de.'],
    ],
    react: {
      good: ['Hıh hıh… anlaşıyoruz galiba.', 'Akıllı lord, akıllı lord.'],
      plain: ['Ee, başka?', 'Laf altın değil, lord.'],
      sharp: ['Vay! Defterdeki rakam büyüyor bak.', 'Bu söz sana pahalıya patlar.'],
    },
    pleased: 'Defteri biraz… düzelttim. Aramızda kalsın.',
    plain: 'Lafla kese dolmaz, lord. Haraç aynen.',
    angry: 'Bu sözlerin bir bedeli var: defterde haracın büyüdü!',
  },
  tired: {
    label: 'yorgun',
    greet: [
      'Ben {name}… Bugün dördüncü saray. Ayaklarım beni değil, ben ayaklarımı taşıyorum.',
      '{name}. Haraççı. Uykusuz. Sırası fark etmez.',
    ],
    exchanges: [
      ['Atım bile benden dinç. Ben mi ona bineyim, o mu bana, karar veremedim.', 'Otur biraz; sana bir tas sıcak çorba getirtelim.', 'Yol uzun, anlıyorum.', 'Yorgunsan niye geldin? Çağıran olmadı.'],
      ['On beş yıldır kapı kapı dolaşırım. Kapılar hep aynı, ben her yıl biraz daha eski.', 'Bunca yıl hizmet edene bir gün dinlenmek de hak olmalı.', 'Herkesin bir işi var.', 'Emekliliğini başka bir sarayda bekle.'],
      ['Bir de nutuk mu çekeceksin? Önceki lord çekti, ayakta uyuyakaldım.', 'Nutuk yok. Kısa keselim ki erken dönesin.', 'Dinlemezsen dinleme.', 'Uzun bir nutuk hazırladım, otur bakalım. Birinci bölüm…'],
      ['Rüyamda bile haraç topluyorum. Uyanınca yine. Hangisi rüya, bilmiyorum.', 'Bu gece samanlığımızda deliksiz uyu; misafirimizsin.', 'Garip bir iş seninki.', 'Belki bu da rüyadır; bir çimdik atalım mı?'],
    ],
    react: {
      good: ['Ah… Tanrı razı olsun.', 'İlk defa bir lord beni dinledi.'],
      plain: ['Hı. Evet. Neyse.', 'Esniyorum, kusura bakma.'],
      sharp: ['Bir bu eksikti.', 'Yorgun adamın sabrını sınama.'],
    },
    pleased: 'Haracı kısa yazdım; ben de yolu kısa keserim. Herkes mutlu.',
    plain: 'Peki… haraç yine aynı. Ben gidip bir oturayım.',
    angry: 'Tamam, yeter. Haraç arttı, ben de uyumaya gidiyorum.',
  },
  pious: {
    label: 'dindar',
    greet: [
      'Selam ve bereket üzerine olsun. Ben {name}. Haracı Tanrı’nın izniyle toplarım.',
      '{name}. Önce dua, sonra hesap. Sırayı bozmayalım.',
    ],
    exchanges: [
      ['Haraç vermek de bir sadakadır, derim. Tacım pek katılmaz ama.', 'Sözlerin ilahi gibi; tapınağımızda senin için bir mum yakarız.', 'Herkes inandığını yaşar.', 'Sadakaysa tacına söyle, biraz da o versin.'],
      ['Yolda bir kuyruklu yıldız gördüm. Hayra mı alamet, şerre mi?', 'Senin gibi bir hayır sahibinin yolunda elbet hayra alamettir.', 'Yıldız yıldızdır, kayar gider.', 'Kesesini kaybedecek bir haraççıya alamet.'],
      ['Bu sarayda dua edilir mi? Kapıda kutsal bir şey göremedim.', 'Her akşam ederiz; bu akşam senin yolun açık olsun diye de ederiz.', 'Eden eder, etmeyen etmez.', 'Dua mı? Biz bereketi pazarda ararız.'],
      ['Açgözlülük büyük günahlardandır. Haraç da… şey, o başka.', 'Elbet başka; sen azıyla yetinmeyi bilen bir ruhsun.', 'Günahı da sevabı da sana kalsın.', 'Bu vaazı önce kendi kesene versen?'],
    ],
    react: {
      good: ['Amin, evladım, amin.', 'Sözlerin kalbe su serpti.'],
      plain: ['Hm. Tövbe tövbe.', 'Neyse… Tanrı bilir.'],
      sharp: ['Estağfurullah! Ne sözler bunlar!', 'Günaha giriyorsun, lord.'],
    },
    pleased: 'Tanrı cömerdi sever; ben de haracı hafiflettim.',
    plain: 'Hayırlı sohbetti. Haraç ise yazıldığı gibidir.',
    angry: 'Tanrı affetsin, ben affetmem. Haraç arttı!',
  },
  homesick: {
    label: 'sılayı özleyen',
    greet: [
      'Ben {name}. Köyümden çıkalı üç bahar oldu. Haracı topla, köyü özle; işim bu.',
      '{name}. Bir lord daha, bir saray daha… Annemin tandırı gibisi yok.',
    ],
    exchanges: [
      ['Sancağın bizim köyün bayram örtüsüne benziyor. İçim bir tuhaf oldu.', 'Anlat bakalım köyünü; bayramlarda neler pişer?', 'Sancak sancaktır.', 'Köyünüzün zevki bozukmuş demek.'],
      ['Annem şimdi hamur yoğuruyordur. Ben burada senin altınını sayıyorum.', 'Selam söyle annene; dönerken bizim baldan bir kavanoz al.', 'Herkesin bir yükü var.', 'Annen seni bu hâlde görse utanırdı.'],
      ['Bir dönsem, tacım bir daha yollamaz derim. Sonra yine yollar.', 'Bu sefer tez dönersin; erken bitirelim ki yolun kısalsın.', 'Tacın bilir.', 'Yollasınlar; köyünde de işe yaramazsın.'],
      ['Bizim köyün kızları sizinkilere benzemez. Bir tanesi var ki…', 'Adını söyle de bu akşam onun şerefine kadeh kaldıralım.', 'Her köyün güzeli kendine.', 'O kız seni çoktan unutmuştur.'],
    ],
    react: {
      good: ['Ah… gözlerim doldu; rüzgârdandır.', 'Sen iyi adamsın, lord.'],
      plain: ['Hı… köyde de böyle derler.', 'Eh, öyle.'],
      sharp: ['Niye böyle konuşuyorsun ki…', 'Bu söz yüreğime oturdu.'],
    },
    pleased: 'Seni köyümde anlatacağım. Haracı da hafif yazdım; kimseye söyleme.',
    plain: 'Eh… haraç aynı, özlem aynı.',
    angry: 'Köyümü küçümseyenin haracı ağır olur!',
  },
}

const TITLES = ['Yüzbaşı', 'Haraççıbaşı', 'Onbaşı', 'Tahsildar', 'Sancaktar']
const NAMES = ['Kara Ömer', 'Toygar', 'Kayhan', 'Ertuğ', 'Sungur', 'Alpay', 'Duman', 'Karaca', 'Oktay', 'Bozkurt', 'Çağan', 'Topal Rıza', 'Gümüş Temir', 'Bıyıklı Saltuk', 'Uzun Hasan', 'Demirci Battal']

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
