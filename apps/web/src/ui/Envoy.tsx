import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { balance, overreachOf, tributeTalk, tributeTalkReact, tributeTalkScript, unansweredTribute } from '@game/shared'
import { supabase } from '../lib/supabase'
import { L, locale, localPayload } from '../lib/i18n'
import type { Envoy as EnvoyRow, Operation, PeaceTerms, SpyTopic, TrailMark } from '@game/shared'
import { probeText, trailHint } from '../game/caveHints'
import type { Notice } from '../net/online'
import { DialogFoot } from './DialogQueue'
import { Icon } from './icons'
import type { IconName } from './icons'
import { RESOURCE_NAMES } from './names'
import { NoticeArt, noticeLook, soundForNotice } from './NoticeArt'
import { playOnce } from '../audio/sfx'
import { EnvoyPortrait } from './advisor/EnvoyPortrait'
import { CollectorPortrait } from './advisor/CollectorPortrait'
import { useBabble, useTyping } from './advisor/Advisor'
import { CROWN_COLORS, crownKeyNow } from '../game/cities'
import { waysText } from './hud/crownHouse'
import { ENVOY_NAMES, OPERATION_NAMES, TOPIC_NAMES, describeTerms } from './hud/diplomacy'
import type { Online } from './hud/online'

// The envoy's dialogs: one notice at a time from the player's inbox (proposals to answer, wars declared, battles
// beginning and ending, spies caught). Closing one marks it read.

const fmt = (v: number) => Math.round(v).toLocaleString(locale())

// Goods by name and amount ("40 yemek, 12 savaş malzemesi").
const goodsText = (goods: unknown) =>
  Object.entries((goods ?? {}) as Record<string, number>)
    .filter(([, v]) => v > 0)
    .map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? g}`)
    .join(', ')

// What the insulting envoy says at the gate (one of these, by the envoy's number).
const INSULTS = [
  L('Efendim der ki: kralınızın sakalı keçininkinden seyrek, ordunuz da tavuk kümesinden düzensiz!', "My master says: your king's beard is thinner than a goat's, and your army is less orderly than a henhouse!"),
  L('Efendim der ki: sarayınızın kokusu üç vadi öteden duyuluyor; hamamı hiç mi duymadınız?', 'My master says: your palace can be smelled three valleys away; have you never heard of a bathhouse?'),
  L('Efendim der ki: atalarınız domuz güderdi, siz ise onları bile güdemezsiniz!', 'My master says: your forefathers herded swine, and you could not even manage that!'),
  L('Efendim der ki: sancağınızı gördük, sandık ki çamaşır asmışsınız.', 'My master says: we saw your banner and thought you had hung out the washing.'),
  L('Efendim der ki: askerleriniz tahta kılıçla bile birbirini yaralar!', 'My master says: your soldiers would wound each other even with wooden swords!'),
  L('Efendim der ki: hazineniz fare yuvasından boş, tüccarınız da dilenciden fakir.', 'My master says: your treasury is emptier than a mouse hole, and your merchant poorer than a beggar.'),
  L('Efendim der ki: kralınız ata binemez, eşeği bile ondan utanır!', 'My master says: your king cannot sit a horse; even his donkey is ashamed of him!'),
  L('Efendim der ki: surlarınızı çocuklar bile kumdan daha sağlam yapar.', 'My master says: children build sturdier walls out of sand.'),
]


// Over-expansion (CLAUDE.md §8.4) as a town is besieged or taken: what holding `more` towns beyond those held now costs.
function overreachNote(online: Online, more: number) {
  const held = online.towns.filter((t) => t.owner === online.me).length + more
  const o = overreachOf(held)
  if (o.tier < 0) return ''
  const last = o.tier >= balance.towns.overreach.tiers.length - 1
  return L(` Hatırlatmak bana düşer, lordum: ${more > 0 ? 'alırsan' : 'artık'} elinde ${held} kasaba ${more > 0 ? 'olur' : 'var'}. Aşırı büyüme her kasabanın sadakatini ${o.loyalty}${o.loyaltyCap < 100 ? ` düşürür ve %${o.loyaltyCap}'in üstüne çıkmasına izin vermez` : ' düşürür'}, halkının mutluluğu ${o.happiness}, bakım ×${String(o.upkeepFactor).replace('.', ',')}.${last ? ' Bu kadar kasabada ayaklanmalar kesindir; ben şimdiden bavulumu hazırlıyorum.' : ''}`, ` It falls to me to remind you, my lord: ${more > 0 ? 'take it and you will hold' : 'you now hold'} ${held} town${held === 1 ? '' : 's'}. Over-expansion costs every town ${-o.loyalty} loyalty${o.loyaltyCap < 100 ? ` and will not let it rise above ${o.loyaltyCap}%` : ''}, costs your people ${-o.happiness} happiness, and puts upkeep at ×${o.upkeepFactor}.${last ? ' With this many towns, revolts are certain; I have already started packing my bags.' : ''}`)
}

// A new ruler's first days (CLAUDE.md §7.8): what his welcome did to the lord sworn to his crown.
function welcomeNote(p: Record<string, unknown>, online: Online) {
  const w = Number(p.welcome ?? 0)
  if (!w || online.kingdoms.find((k) => k.id === online.me)?.liege !== Number(p.crown)) return ''
  return w > 0
    ? L(` Yeni hükümdar lordlarına yakın davranıyor: ilişkin +${w}. Bana da göz kırptı, yemin ederim.`, ` The new ruler is warm to his lords: your relations +${w}. He winked at me too, I swear it.`)
    : L(` Yeni hükümdar lordlarına mesafeli: ilişkin ${w}. Bana selam bile vermedi; haberin olsun.`, ` The new ruler is cool to his lords: your relations ${w}. He did not even greet me; just so you know.`)
}

// A beaten pretender whose crown had backed him leaves the lord a choice (CLAUDE.md §9.1.1).
function betrayalNote(offer: unknown, crown: (i: unknown) => string) {
  const o = offer as { from?: number; to?: number } | null | undefined
  if (!o || o.from === undefined) return ''
  return L(` Ama unutmayalım, lordum: ${crown(o.from)} bu isyanda kardeşinin tarafını tuttu. ${balance.cities.crown.switch.offerMinutes} dakika içinde ${crown(o.to)} tarafına geçebilirsin. Ben iki sancağı da ütületip hazır ettim.`, ` But let us not forget, my lord: ${crown(o.from)} took your brother's side in this revolt. Within ${balance.cities.crown.switch.offerMinutes} minutes you may go over to ${crown(o.to)}. I have had both banners pressed and ready.`)
}

// Why a crown asks more or less than its usual share: its ruler's trait and the crowns' rivalry (CLAUDE.md §7.8).
function tilt(crown: number, at: number) {
  const key = crownKeyNow()
  const why = key ? waysText(key, crown, at, 'tribute') : ''
  return why ? `; ${why}` : ''
}

// One wording of a notice that is said several ways, picked by the notice's own number: the same notice reads the
// same every time it is drawn (and in the away report), while two notices of a kind rarely sound alike.
const vary = (n: Notice, list: string[]) => list[Math.abs(Math.trunc(Number(n.id) || 0)) % list.length]

// A crown's gift as the envoy tells it: on its own (`crown_gift`) or with the patrol's tip on the same visit.
function giftText(g: Record<string, unknown>) {
  const goods = Object.entries((g.goods ?? {}) as Record<string, number>).map(([k, v]) => `${fmt(v)} ${RESOURCE_NAMES[k as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? k}`)
  const name = String(g.name)
  return L(
    `Devriye, hükümdarın sana duyduğu yakınlığın işareti olarak «${name}» getirdi: ${[...(Number(g.gold) > 0 ? [`${fmt(Number(g.gold))} altın`] : []), ...goods].join(', ')}. Paketi ben açtım, lordum; eksik yok, yemin ederim.`,
    `As a token of the ruler's fondness for you, the patrol brought «${balance.cities.crown.gifts.find((x) => x.name === name)?.nameEn ?? name}»: ${[...(Number(g.gold) > 0 ? [`${fmt(Number(g.gold))} gold`] : []), ...goods].join(', ')}. I opened the package myself, my lord; nothing missing, I swear.`,
  )
}

export function describe(n: Notice, online: Online): { icon: IconName; title: string; text: string } {
  const p = localPayload(n.payload as Record<string, unknown>) as Record<string, never>
  const kind = (k: unknown) => ENVOY_NAMES[k as EnvoyRow['kind']] ?? String(k)
  const me = online.kingdoms.find((k) => k.id === online.me)?.name
  const crown = (i: unknown) => online.crowns[Number(i)] ?? L('Taç krallığı', 'Crown kingdom')
  switch (n.kind) {
    case 'envoy_proposal':
      return {
        icon: 'scroll',
        title: L(`${p.from} elçisi geldi`, `An envoy from ${p.from} has arrived`),
        text:
          p.kind === 'tribute'
            ? L(`${p.from} elçisi kapıda, lordum; yüzü de pek pişkin. Saatte ${p.gold} altın haraç istiyor. Kabul edersen ilişkiniz ${balance.diplomacy.tribute.accept} düşer; reddedersen ${balance.diplomacy.tribute.reject} düşer. Yani iki yol da yokuş aşağı; ben olsam bugün hiç kalkmazdım yataktan.`, `The envoy of ${p.from} is at the gate, my lord, with a rather brazen face. He demands ${p.gold} gold in tribute an hour. Accept and your relations drop by ${balance.diplomacy.tribute.accept}; refuse and they drop by ${balance.diplomacy.tribute.reject}. Both roads run downhill; were I you, I would not have got out of bed today.`)
            : p.kind === 'alliance'
              ? L(`${p.from} seninle ittifak kurmak istiyor, lordum. Müttefik orduları birbirini korur; yani bir dahaki savaşta arkasına saklanacağımız bir ordu daha olur.`, `${p.from} wishes to form an alliance with you, my lord. Allied armies protect one another; which is to say, next war we will have one more army to hide behind.`)
              : p.kind === 'marriage'
                ? L(`${p.from}, ${(p.terms as { name?: string } | null)?.name ?? 'bir'} adlı prensesini (${(p.terms as { age?: number } | null)?.age ?? '?'} yaşında) senin hanedanına gelin vermek istiyor. Kabul edersen prenses sarayına gelir ve ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} artar. Düğün yemeğini ben ayarlarım, lordum; tadına bakmak da bana düşer, ne yapalım.`, `${p.from} offers the hand of a princess${(p.terms as { name?: string } | null)?.name ? ` named ${(p.terms as { name?: string } | null)?.name}` : ''} (aged ${(p.terms as { age?: number } | null)?.age ?? '?'}) as a bride to your house. Accept and the princess comes to your palace and your relations rise by ${balance.dynasty.intrigue.marriage.lord.relation}. I shall arrange the wedding feast, my lord; the tasting falls to me too, alas.`)
                : L(`${p.from} savaşı bitirmek için barış teklif ediyor: ${describeTerms(p.terms as PeaceTerms | null)}. Elçileri beyaz bayrağı biraz fazla coşkuyla sallıyor, lordum; gözümü çıkaracaktı.`, `${p.from} offers peace to end the war: ${describeTerms(p.terms as PeaceTerms | null)}. Their envoy waves the white flag with a little too much enthusiasm, my lord; he nearly took my eye out.`),
      }
    case 'envoy_courtesy':
      return p.kind === 'gift'
        ? {
            icon: 'gold',
            title: L(`${p.from} hediye gönderdi`, `${p.from} sent a gift`),
            text: vary(n, [
              L(`${p.gold} altın hazinene eklendi; ilişkiniz iyileşti. Bir tanesini ısırıp denedim, lordum: sahici.`, `${p.gold} gold added to your treasury; your relations improved. I bit one to check, my lord: genuine.`),
              L(`${p.from} elçisi bir sandık bıraktı: içinden ${p.gold} altın çıktı. Sandığı ben taşıdım; belim hâlâ itiraz ediyor. İlişkiniz iyileşti.`, `The envoy of ${p.from} left a chest: ${p.gold} gold inside. I carried the chest; my back is still lodging complaints. Your relations improved.`),
              L(`Kapıya mühürlü bir kese geldi: ${p.gold} altın, ${p.from} hediyesi. İlişkiniz iyileşti; elçileri de pek kibardı, benim kadar olmasa da.`, `A sealed purse arrived at the gate: ${p.gold} gold, a gift from ${p.from}. Your relations improved; their envoy was most courteous, though not as courteous as I.`),
              L(`${p.from} cömert davrandı: ${p.gold} altın hazinene girdi ve aranız ısındı. Yakında bir şey isteyecekler, lordum; ben bu gülümsemeyi bilirim.`, `${p.from} has been generous: ${p.gold} gold into your treasury and warmer relations. They will want something soon, my lord; I know that smile.`),
            ]),
          }
        : {
            icon: 'scroll',
            title: L(`${p.from} elçisi geldi`, `An envoy from ${p.from} has arrived`),
            text: vary(n, [
              L(`${p.from} ilişkilerinizi geliştirmek istiyor (+${balance.diplomacy.improve.gain}). Elçileri bana da iltifat etti; zevk sahibi bir adam.`, `${p.from} wishes to improve your relations (+${balance.diplomacy.improve.gain}). Their envoy complimented me too; a man of taste.`),
              L(`${p.from} elçisi selam ve güzel sözler getirdi; ilişkiniz +${balance.diplomacy.improve.gain}. Sözler bedava, lordum, ama bak işe yarıyor.`, `The envoy of ${p.from} brought greetings and fine words; relations +${balance.diplomacy.improve.gain}. Words are free, my lord, but look, they work.`),
              L(`${p.from} dostluk elçisi yolladı: iltifatlar, reveranslar ve +${balance.diplomacy.improve.gain} ilişki. Eğilirken beli tutuldu; halinden en iyi ben anlarım.`, `${p.from} sent an envoy of friendship: compliments, bows and +${balance.diplomacy.improve.gain} relations. His back gave out mid-bow; nobody understands him better than I.`),
              L(`${p.from} aranızın iyi olmasını istiyor; elçisi bunu üç kez söyledi, ben de üç kez başımı salladım. İlişkiniz +${balance.diplomacy.improve.gain}.`, `${p.from} wants good relations with you; the envoy said so three times and I nodded three times. Relations +${balance.diplomacy.improve.gain}.`),
            ]),
          }
    case 'envoy_answer':
      return {
        icon: p.accepted ? 'happy' : 'unhappy',
        title: L(`${p.by}: ${kind(p.kind)} ${p.accepted ? 'kabul edildi' : p.expired ? 'cevapsız kaldı' : 'reddedildi'}`, `${p.by}: ${kind(p.kind)} ${p.accepted ? 'accepted' : p.expired ? 'went unanswered' : 'refused'}`),
        text: p.accepted
          ? p.kind === 'tribute'
            ? L(`${p.by} artık saatte ${p.gold} altın ödeyecek. Yüzlerini görmeliydin, lordum; limon yemiş gibiydiler.`, `${p.by} will now pay ${p.gold} gold an hour. You should have seen their faces, my lord; as if they had bitten a lemon.`)
            : p.kind === 'alliance'
              ? vary(n, [
                  L(`${p.by} artık müttefikin. Sırtımız sağlam, lordum; en azından kâğıt üstünde.`, `${p.by} is now your ally. Our backs are covered, my lord; on paper, at least.`),
                  L(`${p.by} ittifakı mühürledi; artık ordularınız birbirini korur. Mührü ben bastım, iki kere, emin olmak için.`, `${p.by} sealed the alliance; your armies now protect one another. I pressed the seal myself, twice, to be sure.`),
                  L(`${p.by} elini uzattı: artık müttefiksiniz. Elini sıktım; parmaklarım hâlâ yerinde, sayıyorum.`, `${p.by} held out a hand: you are allies now. I shook it; my fingers are all still there, I am counting.`),
                  L(`Antlaşma imzalandı: ${p.by} ile artık müttefiksiniz. Ziyafette üç tabak yedim, lordum; diplomatik nezaket.`, `The treaty is signed: you and ${p.by} are allies now. I ate three plates at the banquet, my lord; diplomatic courtesy.`),
                ])
              : p.kind === 'marriage'
                ? L(`Prenses ${p.bride} ${p.by} hanedanına gelin gitti. İlişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı. Düğünde ağlayan tek kişi bendim, lordum; mutfakta soğan doğruyorlardı.`, `Princess ${p.bride} has gone as a bride to the house of ${p.by}. Your relations rose by ${balance.dynasty.intrigue.marriage.lord.relation}. I was the only one weeping at the wedding, my lord; they were chopping onions in the kitchen.`)
                : vary(n, [
                    L('Savaş bitti. Ben zaten hep barıştan yanaydım; özellikle savaş sırasında.', 'The war is over. I was always for peace, you know; especially during the war.'),
                    L('Kılıçlar kınına girdi; savaş bitti. Benimki hiç çıkmamıştı zaten.', 'Swords are back in their scabbards; the war is over. Mine never left its scabbard anyway.'),
                    L('Barış imzalandı; savaş bitti. Mürekkebi ben getirdim, lordum; kahramanlığım tarihe geçsin.', 'Peace is signed; the war is over. I brought the ink, my lord; let my heroism go down in history.'),
                    L('Davullar sustu, savaş bitti. Davulcular da sustu, çok şükür.', 'The drums have fallen silent; the war is over. The drummers too, thank heavens.'),
                  ])
          : p.kind === 'tribute'
            ? L(`İlişkiniz ${-balance.diplomacy.tribute.reject} düştü. Elçileri suratını asıp gitti, lordum; atı bile somurtuyordu.`, `Your relations dropped by ${-balance.diplomacy.tribute.reject}. Their envoy stormed off in a sulk, my lord; even his horse was pouting.`)
            : '',
      }
    case 'war_declared':
      return {
        icon: 'swords',
        title: L('Savaş ilan edildi!', 'War declared!'),
        text: L(`${p.by} savaş ilan etti${p.on === me ? '; hedef sensin' : ` (hedef: ${p.on})`}${p.claim ? '' : ', hem de hiçbir gerekçe göstermeden; terbiyesizliğin böylesi'}.${p.on === me ? ' Sen kılıcını bilet, lordum; ben de dizlerimi yağlayayım.' : ' Bu sefer bize değil, lordum; ben yine de kapıyı kilitledim.'}`, `${p.by} has declared war${p.on === me ? '; you are the target' : ` (target: ${p.on})`}${p.claim ? '' : ', and without any justification whatsoever; the sheer rudeness'}.${p.on === me ? ' You sharpen your sword, my lord; I shall oil my knees.' : ' Not on us this time, my lord; I locked the door all the same.'}`),
      }
    case 'peace_enforced':
      return { icon: 'banner', title: L('Barış dayatıldı', 'Peace imposed'), text: L(`${p.from} savaşı ezici bir üstünlükle kazandı ve barışı dayattı: ${describeTerms(p.terms as PeaceTerms | null)}. Pazarlık payı yoktu, lordum; masa bile kurulmadı.`, `${p.from} won the war by an overwhelming margin and imposed peace: ${describeTerms(p.terms as PeaceTerms | null)}. There was no haggling, my lord; they did not even set the table.`) }
    case 'operation_foiled':
      return { icon: 'eye', title: L('Casus operasyonu önlendi', 'Spy operation foiled'), text: L(`${p.by} adına ${OPERATION_NAMES[p.op as Operation].toLowerCase()} isteyen bir casus yakalandı. Bıyığı takmaydı, lordum; ilk rüzgârda düştü. Artık onlara karşı savaş gerekçen var.`, `A spy sent by ${p.by} on a mission to ${OPERATION_NAMES[p.op as Operation].toLowerCase()} was caught. His moustache was a fake, my lord; it fell off in the first breeze. You now have a casus belli against them.`) }
    case 'operation_struck':
      return {
        icon: 'warn',
        title: p.op === 'kidnap' ? L('Kraliçen kaçırıldı!', 'Your queen has been abducted!') : p.op === 'revolt' ? L('Halk ayaklandı!', 'The people have risen!') : p.op === 'townRevolt' ? L(`${p.town ?? 'Kasaban'} kışkırtıldı!`, `${p.town ?? 'Your town'} has been stirred up!`) : L('Sabotaj!', 'Sabotage!'),
        text:
          p.op === 'townRevolt'
            ? L(`Kimliği belirsiz kışkırtıcılar ${p.town ?? 'bir kasaban'} halkını sana karşı doldurdu: kasabanın sadakati ${-balance.espionage.operations.townRevolt.loyalty} düştü. Sadakat ${balance.towns.revolt.below}'in altındaysa kasaba ayaklanır; bakımını artırarak gönüllerini kazanabilirsin. Gönül altınla kazanılır, lordum; ben şiirle denedim, olmadı.`, `Unknown agitators turned the people of ${p.town ?? 'one of your towns'} against you: the town's loyalty dropped by ${-balance.espionage.operations.townRevolt.loyalty}. If loyalty is below ${balance.towns.revolt.below}, the town revolts; raise its upkeep to win their hearts. Hearts are won with gold, my lord; I tried poetry, it did not work.`)
            : p.op === 'kidnap'
            ? L(`${p.by} casusları kraliçeni kaçırdı. Ben o gece uyuyordum, lordum; stratejik bir uykuydu. Fidye ödeyebilir ya da savaş açabilirsin (savaş gerekçen var).`, `Spies of ${p.by} abducted your queen. I was asleep that night, my lord; a strategic sleep. You can pay a ransom or go to war (you have a casus belli).`)
            : p.op === 'revolt'
              ? vary(n, [
                  L('Kışkırtıcılar halkı ayaklandırdı: üretim bir süre yarıya indi. Köylüler yabalarını tarlaya değil, bize kaldırıyor.', 'Agitators have stirred the people to revolt: production is halved for a while. The peasants are raising their pitchforks at us, not the fields.'),
                  L('Meydanlarda öfkeli kalabalıklar toplandı; kışkırtıcıların işi. Üretim bir süre yarıya indi. Ben pencereden izledim, güvenlik gereği.', "Angry crowds gathered in the squares; the agitators' doing. Production is halved for a while. I watched from the window, for safety's sake."),
                  L('Yabancı ağızlar halkın kulağına zehir akıttı: köylüler aletlerini bıraktı, üretim bir süre yarıya indi. Aletleri ben topladım, lordum; kimse teşekkür etmedi.', "Foreign tongues poured poison into the people's ears: the peasants dropped their tools and production is halved for a while. I gathered up the tools, my lord; nobody thanked me."),
                  L('Halk ayaklandı; arkasında birilerinin parmağı var. Üretim bir süre yarıya indi. O parmağı bulursak bizzat ben parmakla gösteririm.', 'The people have risen; someone has a finger in this. Production is halved for a while. If we find that finger, I shall point at it personally.'),
                ])
              : p.op === 'burn'
                ? vary(n, [
                    L('Kimliği belirsiz sabotajcılar depolarını ateşe verdi. Ben kovayla koştum, lordum; boş kovayla ama, niyet önemli.', 'Unknown saboteurs set your stores ablaze. I ran with a bucket, my lord; an empty bucket, but it is the thought that counts.'),
                    L('Gece yarısı ambarların yandı; kaçan gölgeleri kimse tanımadı. Ben birini tanıdım sandım; kendi gölgemmiş.', 'Your granaries burned at midnight; nobody recognised the fleeing shadows. I thought I recognised one; it was my own.'),
                    L('Depolarından alevler yükseldi. Yangın kendiliğinden çıkmadı; birileri kıvılcımı getirdi. Biz de ellerimizi ısıttık, ne yapalım.', 'Flames rose from your stores. The fire did not start itself; someone brought the spark. We warmed our hands, at least.'),
                    L('Sabotajcılar depolarını yaktı ve karanlığa karıştı. Ambar fareleri de ilk kez evsiz kaldı.', 'Saboteurs burned your stores and melted into the dark. Even the granary rats are homeless for the first time.'),
                  ])
                : vary(n, [
                    L('Sabotajcılar inşaatlarını geciktirdi. Ustalar zaten yavaştı; şimdi resmen duruyorlar.', 'Saboteurs delayed your building works. The builders were slow already; now they are officially standing still.'),
                    L('Şantiyelerinde aletler kayboldu, iskeleler gevşetildi: inşaatların gecikti. Ustabaşı benden şüphelendi, lordum; hakarete bak!', 'Tools went missing from your building sites and scaffolds were loosened: your works are delayed. The foreman suspected me, my lord; the insolence!'),
                    L('Biri ustalarının harcına kum karıştırmış; inşaatların gecikti. Harç zaten kumluydu, şimdi plaj oldu.', "Someone mixed sand into your builders' mortar; your works are delayed. The mortar was sandy already; now it is a beach."),
                    L('Gece şantiyelerine sızanlar oldu; inşaatların gecikecek. Bekçi uyuyordu. Ben de uyuyordum, ama benim mesaim bitmişti.', 'Intruders slipped into your building sites at night; your works will be delayed. The watchman was asleep. So was I, but my shift was over.'),
                  ]),
      }
    case 'ransom_paid':
      return {
        icon: 'gold',
        title: L('Fidye ödendi', 'Ransom paid'),
        text: vary(n, [
          L(`${p.by} kraliçesi için ${p.gold} altın fidye ödedi. Sayarken iki kez şaşırdım, lordum; keyiften.`, `${p.by} paid ${p.gold} gold in ransom for their queen. I lost count twice, my lord; from sheer delight.`),
          L(`${p.by} sandığı getirdi: ${p.gold} altın. Kraliçeleri hapishanenden çıkıp evine dönüyor; giderken yemeklerimizi övdü, nezaketen.`, `${p.by} brought the chest: ${p.gold} gold. Their queen leaves your prison and goes home; on her way out she praised our food, out of politeness.`),
          L(`Fidye geldi: ${p.by} kraliçesini ${p.gold} altına geri aldı. Bence ucuz kurtardılar, lordum.`, `The ransom has come: ${p.by} bought back their queen for ${p.gold} gold. A bargain for them, if you ask me, my lord.`),
          L(`${p.by} kraliçesine kavuşmak için ${p.gold} altın saydı; hapishanenin avlusu yine boş. Gardiyanlar biraz özleyecek.`, `${p.by} counted out ${p.gold} gold to have their queen back; the prison yard is empty again. The guards will miss her a little.`),
        ]),
      }
    case 'queen_released':
      return {
        icon: 'happy',
        title: L('Kraliçen döndü', 'Your queen is back'),
        text: vary(n, [
          L(`${p.by} kraliçeni serbest bıraktı. İlk sorusu "Elçi beni neden kurtarmaya gelmedi?" olacak, lordum; cevabım hazır, üç sayfa.`, `${p.by} released your queen. Her first question will be "Why did the envoy not come to rescue me?", my lord; my answer is ready, three pages long.`),
          L(`${p.by} hapishanesinin kapısı açıldı; kraliçen sarayına dönüyor. Halıları ben silkeledim.`, `The gates of ${p.by}'s prison opened; your queen is returning to her palace. I beat the carpets myself.`),
          L(`Kraliçen eve dönüyor: ${p.by} onu serbest bıraktı. Halk sokaklara döküldü; ben en öndeydim, tamamen tesadüfen.`, `Your queen is coming home: ${p.by} let her go. The people poured into the streets; I was at the very front, purely by chance.`),
          L(`${p.by} kraliçeni bıraktı. Saray yeniden şenlenecek; ben de yeniden azar işiteceğim.`, `${p.by} let your queen go. The palace will be merry again; and I shall be scolded again.`),
        ]),
      }
    case 'alliance_broken':
      return {
        icon: 'unhappy',
        title: L('İttifak bozuldu', 'Alliance broken'),
        text: vary(n, [
          L(`${p.by} ittifakınızı bozdu. Zaten hiç hediye getirmezlerdi, lordum.`, `${p.by} broke your alliance. They never brought gifts anyway, my lord.`),
          L(`${p.by} antlaşmayı yırttı; artık müttefik değilsiniz. Parçaları ben topladım, hatıra olsun.`, `${p.by} tore up the treaty; you are no longer allies. I gathered the pieces, as a keepsake.`),
          L(`${p.by} sana sırtını döndü: ittifak bitti. Sırtları da pek geniş değildi zaten.`, `${p.by} turned their back on you: the alliance is over. Not a very broad back anyway.`),
          L(`${p.by} elçisi ittifakın bittiğini bildirdi; yüzüne bile bakmadan. Ben de ona bakmadım, ödeştik.`, `The envoy of ${p.by} announced the alliance's end without even looking at us. I did not look at him either; we are even.`),
        ]),
      }
    case 'tribute_ended':
      return {
        icon: 'gold',
        title: L('Haraç bitti', 'Tribute ended'),
        text: p.renege
          ? vary(n, [
              L(`${p.by} haracı kesti; sözünden döndü. Söz uçar, lordum; altın kalır, o da onlarda kaldı.`, `${p.by} stopped the tribute and broke their word. Words fly away, my lord; gold stays, and it stayed with them.`),
              L(`${p.by} artık haraç ödemeyecek; sözünü çiğnedi, üstüne de bastı.`, `${p.by} will pay no more tribute; they broke their word and stamped on it for good measure.`),
              L(`${p.by} haraç kesesini kapattı ve sözünden döndü. Düğümü de sıkı atmışlar, lordum.`, `${p.by} closed the tribute purse and went back on their word. Tied the knot tight, too, my lord.`),
              L(`${p.by} haracı kesti. Söz verip dönen herkesin gözünde küçülür; ben şimdiden herkese anlatmaya başladım.`, `${p.by} stopped the tribute. Whoever breaks their word shrinks in everyone's eyes; I have already started telling everyone.`),
            ])
          : vary(n, [
              L(`${p.by} haracı bağışladı. Neden diye sorma, lordum; belki vicdanı sızladı, belki dişi.`, `${p.by} waived the tribute. Do not ask why, my lord; perhaps a pang of conscience, perhaps a toothache.`),
              L(`${p.by} artık senden haraç istemiyor; bağışladı. Hazinedar sevinçten ağladı.`, `${p.by} no longer demands tribute from you; they waived it. The treasurer wept for joy.`),
              L(`${p.by} cömert davrandı: haraç bitti. Merak etme, bu cömertlik bulaşıcı değil.`, `${p.by} was generous: the tribute is over. Fear not, such generosity is not contagious.`),
              L(`${p.by} haraç defterini kapattı; artık ödemeyeceksin. Defteri bana verseler yakardım, emin olmak için.`, `${p.by} closed the tribute ledger; you will pay no more. Had they given me the ledger, I would have burned it, to be sure.`),
            ]),
      }
    case 'spy_caught':
      return {
        icon: 'eye',
        title: L('Casus yakalandı', 'Spy caught'),
        text: vary(n, [
          L(`Topraklarında ${p.owner} adına ${TOPIC_NAMES[p.topic as SpyTopic]} bilgisi toplayan bir casus yakalandı. Sahte bıyığı vardı, lordum; hem de ters takmıştı.`, `A spy gathering intelligence on your ${TOPIC_NAMES[p.topic as SpyTopic].toLowerCase()} for ${p.owner} was caught in your lands. He wore a false moustache, my lord; upside down, no less.`),
          L(`Muhafızların bir yabancıyı ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())} kayıtlarını kurcalarken yakaladı. Konuştu: ${p.owner} göndermiş. Bir sorduk, hepsini anlattı; sorulmayanları da.`, `Your guards caught a stranger rummaging through your ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())} records. He talked: ${p.owner} sent him. We asked once and he told us everything; and a few things we had not asked.`),
          L(`${p.owner} casusu ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())} bilgisi toplarken yakalandı. Artık ne aradıklarını biliyorsun; ben zaten hep biliyordum.`, `A spy of ${p.owner} was caught gathering intelligence on your ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())}. Now you know what they are after; I knew all along, naturally.`),
          L(`Bir seyisin aslında ${p.owner} casusu olduğu ortaya çıktı; ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())} bilgisi topluyormuş. Atlar zaten ondan şüpheleniyordu.`, `A stable hand turned out to be a spy of ${p.owner}, gathering intelligence on your ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase(locale())}. The horses had suspected him all along.`),
        ]),
      }
    case 'spy_lost':
      return {
        icon: 'eye',
        title: L('Casusun yakalandı', 'Your spy was caught'),
        text: vary(n, [
          L(`${p.target} topraklarındaki casusun yakalandı. İlişkiniz bozuldu. Kılık değiştirmeyi bana sorsaydı keşke.`, `Your spy in the lands of ${p.target} was caught. Your relations soured. If only he had asked me about disguises.`),
          L(`${p.target} muhafızları casusunu yakaladı; artık kimin gönderdiğini biliyorlar. İlişkiniz bozuldu. Adını bile söylemiş, lordum; unvanlarıyla birlikte.`, `The guards of ${p.target} caught your spy; now they know who sent him. Your relations soured. He even gave your name, my lord; titles and all.`),
          L(`Kötü haber: ${p.target} casusunun kılığını deldi. İlişkiniz bozuldu. Rahibe kılığına girmişti, sakallı hâliyle.`, `Bad news: ${p.target} saw through your spy's disguise. Your relations soured. He had dressed as a nun, beard and all.`),
          L(`${p.target} topraklarından casusundan haber gelmeyecek; yakalandı. İlişkiniz bozuldu. Maaşını da peşin vermiştik, lordum.`, `There will be no more word from your spy in the lands of ${p.target}; he was caught. Your relations soured. And we paid him in advance, my lord.`),
        ]),
      }
    case 'envoy_insult':
      return { icon: 'unhappy', title: L(`${p.from} elçisi hakaret etti!`, `The envoy of ${p.from} insulted you!`), text: L(`"${INSULTS[Number(p.seed ?? 0) % INSULTS.length]}" Bunu kapıda bağıra bağıra okudu, lordum; ben duymamış gibi yaptım ama bütün saray duydu. İlişkiniz ${balance.diplomacy.insult.relation} düştü; artık onlara karşı savaş gerekçen var.`, `"${INSULTS[Number(p.seed ?? 0) % INSULTS.length]}" He bellowed it at the gate, my lord; I pretended not to hear, but the whole palace heard. Your relations dropped by ${balance.diplomacy.insult.relation}; you now have a casus belli against them.`) }
    case 'insult_delivered':
      return {
        icon: 'scroll',
        title: L('Hakaretin iletildi', 'Your insult was delivered'),
        text: L(`${vary(n, [
          `Elçin ${p.to} sarayında ağzına geleni söyledi. Yani ben, lordum; biraz da süsledim.`,
          `Elçin ${p.to} hükümdarının yüzüne söyleneni söyledi; salon buz kesti. Kaçmadan önce reverans da yaptım, görgü önemli.`,
          `Elçin ${p.to} sarayında hakaretini okudu ve muhafızlar onu kapıya kadar kovaladı. Dizlerim hâlâ titriyor, ama gururla.`,
          `${p.to} sarayında elçinin sözleri yankılandı; kimse gülmedi. Oysa kafiyesi de vardı.`,
        ])} İlişkiniz ${balance.diplomacy.insult.relation} düştü; onlar da sana karşı savaş gerekçesi kazandı.`, `${vary(n, [
          `Your envoy said whatever came to mind in the palace of ${p.to}. That is, I did, my lord; with a few embellishments.`,
          `Your envoy said what had to be said to the face of the ruler of ${p.to}; the hall froze. I bowed before fleeing, manners matter.`,
          `Your envoy read out your insult in the palace of ${p.to} and the guards chased him to the gate. My knees are still trembling, but proudly.`,
          `Your envoy's words echoed through the palace of ${p.to}; nobody laughed. And it rhymed, too.`,
        ])} Relations dropped by ${balance.diplomacy.insult.relation}; they in turn gained a casus belli against you.`),
      }
    case 'army_threat':
      return {
        icon: 'warn',
        title: L('Düşman ordusu sınırda!', 'Enemy army at the border!'),
        text: vary(n, [
          L(`${p.by} ordusu sınırına kamp kurdu. Ordu orada kaldıkça halkın korkuyor ve mutluluğu düşüyor. Ben de korkuyorum, ama benim mutluluğum zaten hep düşüktü.`, `An army of ${p.by} has camped on your border. As long as it stays, your people are afraid and their happiness drops. I am afraid too, but my happiness was always low.`),
          L(`Sınırında ${p.by} çadırları yükseldi. Halkın geceleri o ateşleri seyrediyor ve korkuyor; ordu kaldıkça mutluluk düşüyor. Ateşlerde kuzu çeviriyorlar, kokusu buraya kadar geliyor.`, `Tents of ${p.by} have risen on your border. Your people watch those fires at night and tremble; while the army stays, happiness drops. They are roasting lamb on those fires; you can smell it from here.`),
          L(`${p.by} ordusu sınırının dibinde bekliyor; gözdağı veriyorlar. Ordu orada kaldıkça halkın mutluluğu düşüyor. Bana da baktılar, lordum; ben de geri baktım. Sonra koştum.`, `An army of ${p.by} waits right at your border, trying to intimidate you. While it stays, your people's happiness drops. They looked at me, my lord; I looked back. Then I ran.`),
          L(`${p.by} askerleri sınırda kılıç parlatıyor. Köylülerin korkuyor; ordu gitmedikçe mutluluk düşmeye devam edecek. Kılıçları parlak, lordum; akılları o kadar değil.`, `Soldiers of ${p.by} are polishing their swords at the border. Your peasants are frightened; until the army leaves, happiness will keep dropping. Shiny swords, my lord; their wits, less so.`),
        ]),
      }
    case 'trade_raided':
      return {
        icon: 'warn',
        title: L('Ticaret yolun yağmalandı!', 'Your trade route was raided!'),
        text: L(`${p.by} askerleri tüccarını bastı${p.units ? ` ve ${fmt(Number(p.units))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} götürdü` : ''}. Tüccar canını kurtardı, onurunu yolda bıraktı. Ticaret noktan harap; onarana kadar satış yapılamaz. Onarmak için ticaret noktasına tıkla ya da Ticaret sekmesini aç (${balance.economy.trade.repairCost.gold} altın, ${balance.economy.trade.repairCost.materials} yapı malzemesi). Savaş gerekçen var.`, `Soldiers of ${p.by} ambushed your merchant${p.units ? ` and made off with ${fmt(Number(p.units))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''}` : ''}. The merchant saved his life but left his dignity on the road. Your trading post is in ruins; nothing can be sold until it is repaired. To repair it, click the trading post or open the Trade tab (${balance.economy.trade.repairCost.gold} gold, ${balance.economy.trade.repairCost.materials} building materials). You have a casus belli.`),
      }
    case 'raid_repelled':
      return {
        icon: 'shield',
        title: L('Yağmacılar püskürtüldü', 'Raiders driven off'),
        text: L(`${vary(n, [
          `${p.by} askerleri ticaret yolunu basmaya çalıştı ama geri püskürtüldü. Kaçarken birbirlerine çarptılar, lordum; görülecek şeydi.`,
          `${p.by} askerleri tüccarına pusu kurdu; gözcülerin onları erken gördü ve kovaladı. Çalıların arkasına saklanmışlar, mızrakları dışarıda kalmış.`,
          `${p.by} ticaret yolunu basmak istedi ama elleri boş döndü. Tüccarımız arkalarından el salladı.`,
          `Tüccarın ${p.by} askerlerinin pususundan sağ salim kurtuldu; saldırganlar geri püskürtüldü. Tüccar şimdi kendini kahraman sanıyor; dayanılmaz.`,
        ])} Savaş gerekçen var.`, `${vary(n, [
          `Soldiers of ${p.by} tried to raid the trade route but were driven back. They crashed into each other as they fled, my lord; quite a sight.`,
          `Soldiers of ${p.by} laid an ambush for your merchant; your lookouts spotted them early and gave chase. They had hidden behind the bushes, spears sticking out.`,
          `${p.by} tried to raid the trade route but went home empty-handed. Our merchant waved them goodbye.`,
          `Your merchant escaped the ambush of ${p.by}'s soldiers unharmed; the attackers were driven off. Now he thinks he is a hero; unbearable.`,
        ])} You have a casus belli.`),
      }
    case 'naval_battle': {
      const mine = p.attacker === me
      const won = (p.winner === 'attackers') === mine
      const lost = (x: unknown) => {
        const n = Object.values((x ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
        return n ? L(`${n} gemi`, `${n} ship${n === 1 ? '' : 's'}`) : L('kayıpsız', 'no losses')
      }
      const what = p.kind === 'blockade' ? L('Abluka', 'Blockade') : p.kind === 'raid' ? L('Kıyı akını', 'Coastal raid') : L('Ablukayı yarma', 'Blockade run')
      const loot = p.loot ? Object.entries(p.loot as Record<string, number>).map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase()}`).join(', ') : ''
      const outcome =
        p.kind === 'blockade'
          ? p.winner === 'attackers'
            ? mine
              ? L(`İskelesi artık abluka altında: balığı, deniz ticareti durdu. Martılar bile yol değiştiriyor.`, `Their dock is now blockaded: their fishing and sea trade have stopped. Even the gulls are changing course.`)
              : L(`İskelen abluka altında: balık tutulamıyor, deniz ticareti durdu. Bir filoyla ablukayı yarabilirsin. Balıkçılar şimdilik ağ örüp dedikodu yapıyor.`, `Your dock is blockaded: no fishing, and sea trade has stopped. A fleet could break the blockade. For now the fishermen are mending nets and gossiping.`)
            : mine
              ? L('Filon püskürtüldü ve eve dönüyor. Kaptan rüzgârı suçluyor; rüzgâr yorum yapmadı.', 'Your fleet was driven off and is heading home. The captain blames the wind; the wind declined to comment.')
              : L('Saldıranlar geri püskürtüldü. Sırılsıklam döndüler, lordum.', 'The attackers were driven off. They went home soaked to the skin, my lord.')
          : p.kind === 'raid'
            ? p.winner === 'attackers'
              ? mine
                ? L(`Filon ${loot || 'ganimetle'} dönüyor. Tayfalar şimdiden şarkısını uyduruyor.`, `Your fleet is coming back ${loot ? `with ${loot}` : 'with plunder'}. The crew are already making up a song about it.`)
                : L(`Akıncılar depolarından ${loot || 'mal'} götürdü. Bir teşekkür bile etmediler.`, `The raiders carried off ${loot || 'goods'} from your stores. Not so much as a thank-you.`)
              : mine
                ? L('Akın püskürtüldü; filo eve dönüyor. Biraz ıslak, biraz mahcup.', 'The raid was driven off; the fleet is heading home. A little wet, a little sheepish.')
                : L('Akıncılar geri püskürtüldü. Kıyıdan taş atan çocuklar da elinden geleni yaptı.', 'The raiders were driven off. The children throwing stones from the shore did their bit too.')
            : p.winner === 'attackers'
              ? mine
                ? L('Abluka kırıldı! Balıkçılar sevinçten ağlarını havaya attı.', 'The blockade is broken! The fishermen threw their nets in the air for joy.')
                : L('Ablukacı filon yenildi ve eve dönüyor. Kaptan suyun bu sefer fazla ıslak olduğunu söylüyor.', 'Your blockading fleet was beaten and is heading home. The captain says the water was too wet this time.')
              : mine
                ? L('Abluka sürüyor. Gemileri hâlâ iskelenin önünde, lordum; inatçı tahta parçaları.', 'The blockade holds. Their ships are still in front of the dock, my lord; stubborn bits of timber.')
                : L('Ablukayı yarma girişimi püskürtüldü. Ablukamız keyifle sürüyor.', 'The attempt to run the blockade was driven off. Our blockade carries on merrily.')
      return {
        icon: 'ship',
        title: L(`Deniz muharebesi: ${what} · ${won ? 'kazandın' : 'kaybettin'}`, `Sea battle: ${what} · ${won ? 'you won' : 'you lost'}`),
        text: L(`${p.attacker} (${lost(p.attackerLoss)} kayıp) — ${p.defender} (${lost(p.defenderLoss)} kayıp). Zarlar ${(p.rolls as number[])?.join('–')}. ${outcome}`, `${p.attacker} (losses: ${lost(p.attackerLoss)}) — ${p.defender} (losses: ${lost(p.defenderLoss)}). Dice ${(p.rolls as number[])?.join('–')}. ${outcome}`),
      }
    }
    case 'blockade_lifted':
      return {
        icon: 'anchor',
        title: L('Abluka kalktı', 'Blockade lifted'),
        text: p.why === 'peace' ? L('Savaş bitti; düşman filosu iskelenin önünden çekildi. Martılar geri döndü, balıklar da.', 'The war is over; the enemy fleet has withdrawn from your dock. The gulls are back, and the fish too.') : p.why === 'sortie' ? L('Filon ablukayı yardı! Kaptan bunu üç gün anlatacak; hazırlıklı ol, lordum.', 'Your fleet broke the blockade! The captain will be telling this for three days; brace yourself, my lord.') : L(`${p.by} filosu iskelenin önünden çekildi. Sıkıldılar herhalde, lordum.`, `The fleet of ${p.by} withdrew from your dock. Got bored, I expect, my lord.`),
      }
    case 'fleet_turned':
      return {
        icon: 'ship',
        title: L('Filo geri döndü', 'Fleet turned back'),
        text: L(`Filon ${p.target} iskelesine vardı ama ${p.why === 'dock' ? 'orada iskele yok' : p.why === 'taken' ? 'başka bir donanma zaten abluka ediyor' : 'artık savaşta değilsiniz'}; eve dönüyor. Güzel bir deniz gezisi oldu en azından, lordum.`, `Your fleet reached the dock of ${p.target}, but ${p.why === 'dock' ? 'there is no dock there' : p.why === 'taken' ? 'another navy is already blockading it' : 'you are no longer at war'}; it is coming home. A pleasant sea cruise, at least, my lord.`),
      }
    case 'battle_start':
      if (p.kind === 'cave') return { icon: 'swords', title: L(`${p.name} mağarası kuşatılıyor`, `Besieging the cave of the ${p.name}`), text: L(`Ordun ${p.name} mağarasının ağzına dayandı. Yağmacılar kendi mağaralarında, kayaların ardından savaşıyor; kazanırsan klan yok olur ve mağaradaki ganimet senin. Ben dışarıda nöbet tutuyorum, lordum; mağaralar nemli, dizlerime iyi gelmez.`, `Your army has reached the mouth of the ${p.name}'s cave. The bandits fight in their own cave, from behind the rocks; win and the clan is wiped out and the plunder in the cave is yours. I am keeping watch outside, my lord; caves are damp, bad for my knees.`) }
      if (p.kind === 'outlaw') return { icon: 'swords', title: L(`${p.name} yakalandı!`, `${p.name} caught!`), text: L(`Ordun ${p.name} yağmacılarını yolda yakaladı; çarpışma başladı. Savaş tur tur sürecek; kazanırsan çetenin ganimeti senin. Ben bir tepeden izliyorum, stratejik olarak.`, `Your army caught ${p.name} on the road; the fight has begun. It will go round by round; win and the band's plunder is yours. I am watching from a hilltop, strategically.`) }
      if (p.kind === 'pretender') return { icon: 'swords', title: L(`${p.name} karargâhına saldırı`, `Attack on the camp of ${p.name}`), text: L(`Ordun taht davacısı ${p.name}'in karargâhına saldırdı. Çiti ve asileri savunuyor; kazanırsan isyan biter. Aile kavgası, lordum; ben karışmıyorum, sadece not alıyorum.`, `Your army attacked the camp of the pretender ${p.name}. The palisade and the rebels defend it; win and the revolt ends. A family quarrel, my lord; I am not getting involved, merely taking notes.`) }
      if (p.kind === 'usurp') return { icon: 'swords', title: L(`${p.name} sarayını kuşatıyor!`, `${p.name} besieges your palace!`), text: L(`Taht davacısı ${p.name} asileriyle sarayının kapısına dayandı. Garnizonun, kulelerin ve surların savunuyor; kaybedersen tahtı o alır. Ben mahzende önemli belgeleri koruyorum, lordum; şarap fıçılarının hemen yanında.`, `The pretender ${p.name} and his rebels are at your palace gate. Your garrison, towers and walls defend it; lose and he takes the throne. I am guarding important documents in the cellar, my lord; right next to the wine casks.`) }
      if (p.kind === 'revolt') return { icon: 'swords', title: L(`${p.name} asileriyle çarpışma başladı`, `Battle with the rebels of ${p.name} begins`), text: L(`Ordun ${p.name} kapısındaki asilerin üstüne yürüdü. Savaş tur tur sürecek; kazanırsan ayaklanma biter. Asilerin yabaları sivri, lordum; dilleri daha da sivri.`, `Your army marched on the rebels at the gate of ${p.name}. The fight will go round by round; win and the revolt ends. The rebels' pitchforks are sharp, my lord; their tongues sharper still.`) }
      return {
        icon: 'swords',
        title: p.kind === 'siege' ? L('Kuşatma başladı!', 'Siege begun!') : L('Savaş başladı!', 'Battle begun!'),
        text: L(`${(p.sides as string[][])[0].join(', ')} ile ${(p.sides as string[][])[1].join(', ')} karşı karşıya. ${vary(n, [
          'Savaş tur tur sürecek. Ben arkadan izleyeceğim, lordum; stratejik olarak.',
          'Davullar çalıyor; savaş tur tur sürecek. Davulcular bizden, çok cesurlar; en arkadalar.',
          'Saflar kapıştı; savaş tur tur sürecek, izleyebilirsin. Ben gözlerimi kapatıp dinleyeceğim.',
          'Zarlar atılmaya başladı; savaş tur tur sürecek. Zarlara ben üfledim, lordum; şans getirsin.',
          'Savaş tur tur sürecek. Ben komutanlara akıl veriyorum; uzaktan, bağırarak.',
        ])}`, `${(p.sides as string[][])[0].join(', ')} face ${(p.sides as string[][])[1].join(', ')}. ${vary(n, [
          'The battle will go round by round. I shall watch from the back, my lord; strategically.',
          'The drums are beating; the battle will go round by round. The drummers are ours, very brave; right at the back.',
          'The lines have clashed; the battle will go round by round, and you may watch. I shall close my eyes and listen.',
          'The dice are rolling; the battle will go round by round. I blew on the dice, my lord; for luck.',
          'The battle will go round by round. I am advising the commanders; from afar, by shouting.',
        ])}`),
      }
    case 'battle_end': {
      const report = p.report as { winner: string; losses: Record<string, number>; loot?: Record<string, number> }
      const losses = Object.entries(report.losses).map(([name, n]) => `${name} ${fmt(n)}`).join(', ')
      const loot = report.loot ? L(` Yağma: ${Object.entries(report.loot).map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')}.`, ` Plunder: ${Object.entries(report.loot).map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')}.`) : ''
      if (p.kind === 'cave')
        return p.winner === 'attackers'
          ? { icon: 'chest', title: L(`${p.name} yok edildi!`, `${p.name} wiped out!`), text: L(`Ordun mağarayı aldı, klanın son adamı da düştü (kayıplar: ${losses}).${report.loot ? ` Mağaradaki ganimet ambara girdi: ${goodsText({ ...report.loot })}.` : ''} Çeteleri yollardan dağıldı.${p.next ? ` Ama dağlarda yeni bir çete türedi: ${p.next}. Bu dağlar yağmacı doğuruyor, lordum; yağmurdan sonra mantar gibi.` : ''}`, `Your army took the cave; the clan's last man fell (losses: ${losses}).${report.loot ? ` The cave's plunder went into the stores: ${goodsText({ ...report.loot })}.` : ''} Its bands have scattered from the roads.${p.next ? ` But a new clan has sprung up in the mountains: ${p.next}. These mountains breed bandits, my lord; like mushrooms after rain.` : ''}`) }
          : { icon: 'warn', title: L(`${p.name} mağarası direndi`, `The cave of the ${p.name} held out`), text: L(`Ordun mağaranın ağzında yenildi ve eve çekiliyor (kayıplar: ${losses}). Klan zayıfladı; daha büyük bir orduyla dön. İçeriden kahkaha sesleri geliyordu, lordum; mağara da yankı yapınca iki kat ayıp oldu.`, `Your army was beaten at the mouth of the cave and is falling back home (losses: ${losses}). The clan is weakened; come back with a bigger army. There was laughter from inside, my lord; and with the echo it was twice as humiliating.`) }
      if (p.kind === 'outlaw') {
        const minutes = Math.round(balance.outlaws.bands.respawnSeconds / 60)
        return p.winner === 'attackers'
          ? { icon: 'chest', title: L(`${p.name} dağıtıldı!`, `${p.name} scattered!`), text: L(`Ordun yağmacıları yendi (kayıplar: ${losses}).${report.loot ? ` Çetenin ganimeti ambara girdi: ${goodsText({ ...report.loot })}.` : ''} Yollar bir süre temiz; çete ${minutes} dakika sonra yeniden toplanır. Yağmacılar sivrisinek gibidir, lordum; kovarsın, geri gelir.`, `Your army beat the bandits (losses: ${losses}).${report.loot ? ` The band's plunder went into the stores: ${goodsText({ ...report.loot })}.` : ''} The roads are clear for a while; the band regroups in ${minutes} minutes. Bandits are like mosquitoes, my lord; swat them and they come back.`) }
          : { icon: 'warn', title: L(`${p.name} yağmacıları direndi`, `${p.name} held out`), text: L(`Ordun yağmacılara yenildi ve eve çekiliyor (kayıplar: ${losses}). Çete yolu tutmaya devam ediyor; daha büyük bir orduyla yeniden dene. Şimdi yolda bizimle dalga geçen bir türkü söylüyorlar; sözleri de yanlış.`, `Your army was beaten by the bandits and is falling back home (losses: ${losses}). The band still holds the road; try again with a bigger army. Now they are singing a song mocking us on the road; they have the words wrong, too.`) }
      }
      if (p.kind === 'pretender')
        return p.winner === 'attackers'
          ? { icon: 'crown', title: L(`${p.name} isyanı bastırıldı`, `The revolt of ${p.name} crushed`), text: L(`Ordun karargâhı dağıttı (kayıplar: ${losses}). Taht davacısı ${p.name} savaşta öldü; hanedan bir süre sakin kalır. Bayram sofrası biraz boş kalacak, lordum; ama huzurlu.`, `Your army scattered the camp (losses: ${losses}). The pretender ${p.name} died in battle; the house will be quiet for a while. The feast table will be a little emptier, my lord; but peaceful.`) }
          : { icon: 'warn', title: L(`${p.name} karargâhı direndi`, `The camp of ${p.name} held out`), text: L(`Ordun yenildi ve eve çekiliyor (kayıplar: ${losses}). Karargâh ayakta; zamanı dolmadan daha büyük bir orduyla dön ya da taçtan yardım iste. Kardeşin çitin üstünden bize el sallıyordu, lordum; terbiyesiz.`, `Your army was beaten and is falling back home (losses: ${losses}). The camp still stands; before time runs out, come back with a bigger army or ask the crown for help. Your brother was waving at us over the palisade, my lord; the cheek of it.`) }
      if (p.kind === 'usurp')
        return p.winner === 'defenders'
          ? { icon: 'crown', title: L('Taht korundu!', 'The throne is safe!'), text: L(`Sarayın ${p.name} asilerini püskürttü (kayıplar: ${losses}). Taht davacısı düştü. Ben de mahzenden çıktım, lordum; şarap fıçıları da güvende, merak etme.`, `Your palace drove off the rebels of ${p.name} (losses: ${losses}). The pretender has fallen. I have come up from the cellar, my lord; the wine casks are safe too, never fear.`) }
          : { icon: 'unhappy', title: L('Saray düştü', 'The palace has fallen'), text: L(`${p.name} asileri sarayı aldı (kayıplar: ${losses}). Ben yeni efendiye de aynı derin reveransı yapacağım, lordum; mesleğim bu, bel ağrım da cabası.`, `The rebels of ${p.name} took the palace (losses: ${losses}). I shall make the same deep bow to the new master, my lord; it is my profession, back pain and all.`) }
      if (p.kind === 'revolt') {
        const r = balance.towns.rebels
        return p.winner === 'attackers'
          ? { icon: 'crown', title: L(`${p.name} ayaklanması bastırıldı`, `The revolt in ${p.name} crushed`), text: L(`Ordun asileri dağıttı (kayıplar: ${losses}). Ayaklanma bitti, kasabanın sadakati +${r.quellLoyalty} arttı ve ${Math.round(r.quietSeconds / 60)} dakika yeniden ayaklanmaz; sadakati düşük kalırsa sonra yine ayaklanabilir. Asiler yabalarını bırakıp tarlaya döndü; yabanın asıl yeri de orası zaten.`, `Your army scattered the rebels (losses: ${losses}). The revolt is over, the town's loyalty rose by ${r.quellLoyalty} and it will not revolt again for ${Math.round(r.quietSeconds / 60)} minutes; if its loyalty stays low it may revolt again later. The rebels put down their pitchforks and went back to the fields; which is where pitchforks belong anyway.`) }
          : { icon: 'warn', title: L(`${p.name} asileri direndi`, `The rebels of ${p.name} held out`), text: L(`Ordun asilere yenildi ve eve çekiliyor (kayıplar: ${losses}). Asiler kasabanın kapısında kalıyor; daha büyük bir orduyla yeniden gelebilirsin. Arkamızdan yuhaladılar, lordum; ritim tutturamadılar ama.`, `Your army was beaten by the rebels and is falling back home (losses: ${losses}). The rebels stay at the town gate; you can come back with a bigger army. They booed us as we left, my lord; could not keep the rhythm, though.`) }
      }
      // Told from the lord's own side when the battle is known: "you won" reads better than "the defenders won".
      const fought = online.battles.find((b) => b.id === p.battle)
      const side = fought?.attackers.some((f) => f.kingdom === online.me) ? 'attackers' : fought?.defenders.some((f) => f.kingdom === online.me) ? 'defenders' : null
      const what = p.kind === 'siege' ? L('Kuşatma', 'Siege') : L('Savaş', 'Battle')
      const outcome = side ? (side === p.winner ? L('kazandın!', 'you won!') : L('yenildin', 'you lost')) : L(`${p.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`, `the ${p.winner === 'attackers' ? 'attackers' : 'defenders'} won`)
      return {
        icon: 'swords',
        title: L(`${what} bitti: ${outcome}`, `${what} over: ${outcome}`),
        text: L(`Kayıplar: ${losses}.${loot}${side ? (side === p.winner ? ' Ben baştan beri biliyordum, lordum; hep söylüyordum, içimden.' : ' Bir dahaki sefere ben de gelirim, lordum; arkadan, moral vermek için.') : ''}`, `Losses: ${losses}.${loot}${side ? (side === p.winner ? ' I knew it from the start, my lord; I kept saying so, to myself.' : ' Next time I shall come too, my lord; at the back, to keep up morale.') : ''}`),
      }
    }
    case 'siege_people':
      return p.taken
        ? { icon: 'unhappy', title: L('Halk sarayı terk ediyor', 'The people are abandoning the palace'), text: L(`${p.by} sarayını düşürdü; korkuya kapılan ${fmt(Number(p.lost))} köylü lordluğunu terk etti. Evler boş kaldı, halk ancak zamanla geri gelir. Kalanları ben ikna ettim, lordum; kendi bavulumu arkama saklayarak.`, `${p.by} took your palace; ${fmt(Number(p.lost))} frightened ${Number(p.lost) === 1 ? 'villager' : 'villagers'} abandoned your lordship. Homes stand empty; the people will only come back in time. I talked the rest into staying, my lord; hiding my own bags behind my back.`) }
        : { icon: 'unhappy', title: L('Kuşatma halkı kaçırıyor', 'The siege is driving the people away'), text: L(`${p.by} ordusu sarayını kuşattı; ${fmt(Number(p.lost))} köylü canını kurtarmak için kaçtı. Kuşatma sürdükçe kaçanlar artacak, halk büyümeyecek. Ben kalıyorum, lordum; sadakatten. Bir de kapılar kapalı.`, `An army of ${p.by} is besieging your palace; ${fmt(Number(p.lost))} ${Number(p.lost) === 1 ? 'villager' : 'villagers'} fled for their lives. The longer the siege lasts, the more will flee, and the people will not grow. I am staying, my lord; out of loyalty. Also, the gates are shut.`) }
    case 'king_command':
      return p.lead
        ? { icon: 'crown', title: L('Kral ordunun başında', 'The king leads the army'), text: L(`${p.king} ordusunun başına geçti. Emirlerini kendisi verecek: elçi beklemeden, hemen uygulanır. Yani bana iş yok, lordum; dizlerim sevinçten ağlıyor. Savaş yeteneği zarlara tam sayılır; ama ordu yenilirse kral savaşta düşebilir.`, `${p.king} has taken command of his army. He gives the orders himself: no waiting for the envoy, they take effect at once. So nothing for me to do, my lord; my knees weep for joy. His battle skill counts in full on the dice; but if the army is beaten, the king may fall in battle.`) }
        : { icon: 'home', title: L('Kral saraya döndü', 'The king returned to the palace'), text: L(`${p.king || 'Kral'} ordunun komutasını bıraktı ve sarayına döndü. Ordunun emirleri yine elçiyle gider. Yani yine ben, yine o yollar, yine bu dizler.`, `${p.king || 'The king'} gave up command of the army and returned to his palace. The army's orders go by envoy again. So: me again, those roads again, these knees again.`) }
    case 'king_fell':
      return Number(p.lord) === online.me
        ? { icon: 'unhappy', title: L('Kral savaşta düştü!', 'The king has fallen in battle!'), text: L(`Hükümdar ${p.king} ordusunun başında savaşırken öldü. Ordu onsuz yoluna devam ediyor; tahta kimin geçeceğini hanedan belirleyecek. Kahramanca düştü, lordum; türkülerde daha da kahramanca olacak, onları ben yazacağım.`, `Ruler ${p.king} died fighting at the head of his army. The army carries on without him; the house will decide who takes the throne. He fell heroically, my lord; even more heroically in the ballads, which I shall write.`) }
        : { icon: 'swords', title: L(`${p.name} hükümdarı düştü`, `The ruler of ${p.name} has fallen`), text: L(`${p.name} hükümdarı ${p.king} ordusunun başında savaşırken öldü. Cesur adamdı, lordum; belki biraz fazla cesur.`, `The ruler of ${p.name}, ${p.king}, died fighting at the head of his army. A brave man, my lord; perhaps a little too brave.`) }
    case 'tower_losses':
      return {
        icon: 'warn',
        title: L('Gözcü kuleleri ateş açtı', 'The watchtowers opened fire'),
        text: vary(n, [
          L(`Düşman kuleleri ordundan ${p.killed} askeri vurdu. Kuleler hep tepeden bakar, lordum; ben hiç sevmem.`, `Enemy towers shot down ${p.killed} of your soldiers. Towers always look down on you, my lord; I never liked them.`),
          L(`Kulelerden ok yağdı; ordundan ${p.killed} asker düştü. Kalkanları başımıza tutmayı kimse akıl etmedi.`, `Arrows rained from the towers; ${p.killed} of your soldiers fell. Nobody thought to hold their shields over their heads.`),
          L(`Düşmanın gözcüleri seni erken gördü: kulelerden atılan oklar ${p.killed} askerini vurdu. Sancağı biraz küçültsek mi, lordum?`, `The enemy lookouts spotted you early: arrows from the towers struck ${p.killed} of your soldiers. Perhaps a smaller banner, my lord?`),
          L(`Ordun düşman kulelerinin menzilinden geçerken ${p.killed} asker kaybetti. O yoldan geçmeyin demiştim; içimden, ama demiştim.`, `Your army lost ${p.killed} ${Number(p.killed) === 1 ? 'soldier' : 'soldiers'} passing within range of the enemy towers. I said not to go that way; to myself, but I said it.`),
        ]),
      }
    case 'order_failed':
      if (p.why === 'peace') return { icon: 'warn', title: L('Kasaba kuşatılamadı', 'The town could not be besieged'), text: L('Ordun kasabaya vardı ama kasabanın sahibiyle savaşta değilsin; kuşatma yapamaz. Ordu orada bekliyor; askerler pazarda karpuz seçiyor, lordum.', 'Your army reached the town, but you are not at war with its owner; it cannot lay siege. The army waits there; the soldiers are picking out melons at the market, my lord.') }
      if (p.why === 'cave') return { icon: 'warn', title: L('Mağara kuşatılamadı', 'The cave could not be besieged'), text: L('Elçi orduya ulaştı ama o mağarada artık bildiğin klan yok (ya da mağarayı bilmiyorsun). Ordu olduğu yerde bekliyor. O elçi bendim, lordum; o yokuşu boşuna tırmandım.', 'The envoy reached the army, but the clan you knew is no longer in that cave (or you do not know the cave). The army waits where it is. That envoy was me, my lord; I climbed that slope for nothing.') }
      if (p.why === 'calm') return { icon: 'shield', title: L('Bastırılacak ayaklanma yok', 'No revolt to crush'), text: L('Ordun kasabana vardı ama orada asi yok; ordu kapıda bekliyor. Kasabalılar ayran ikram etti; savaşmaktan iyidir.', 'Your army reached your town, but there are no rebels there; the army waits at the gate. The townsfolk offered it buttermilk; better than fighting.') }
      return { icon: 'warn', title: L('Emir yerine getirilemedi', 'The order could not be carried out'), text: L('Elçi orduya ulaştı ama emir uygulanamadı (yol yok ya da ordu savaşta). Ben emri okudum, komutan bana baktı, ben ona baktım; olmadı, lordum.', 'The envoy reached the army, but the order could not be carried out (no route, or the army is in battle). I read out the order, the commander looked at me, I looked at him; no luck, my lord.') }
    case 'town_siege': {
      const mine = p.by === me
      const minutes = Math.round(balance.towns.siegeSeconds / 60)
      return mine
        ? { icon: 'swords', title: L(`${p.name} kuşatılıyor`, `Besieging ${p.name}`), text: L(`Ordun ${p.name} kasabasını kuşattı. Ordu orada kaldıkça kuşatma ${minutes} dakikada biter; ilerlemesi kasabanın üstünde görünür. Kasabalılar surlardan bize lahana atıyor, lordum; kuşatma resmen başladı.${overreachNote(online, 1)}`, `Your army has laid siege to the town of ${p.name}. If it stays there, the siege ends in ${minutes} minutes; its progress shows above the town. The townsfolk are throwing cabbages at us from the walls, my lord; the siege has officially begun.${overreachNote(online, 1)}`) }
        : { icon: 'warn', title: L(`${p.name} kuşatma altında!`, `${p.name} under siege!`), text: L(`${p.by} ordusu ${p.name} kasabanı kuşattı. ${minutes} dakika içinde ordunla gelip kuşatmayı kıramazsan kasaba onların olur. Acele et, lordum; o kasabanın meyhanesi çok iyidir.${Number(p.relation) < 0 ? ` ${p.by} ile ilişkin ${-Number(p.relation)} düştü.` : ''}`, `An army of ${p.by} has laid siege to your town of ${p.name}. If you cannot come with your army and break the siege within ${minutes} minutes, the town is theirs. Hurry, my lord; that town has an excellent tavern.${Number(p.relation) < 0 ? ` Your relations with ${p.by} dropped by ${-Number(p.relation)}.` : ''}`) }
    }
    case 'town_siege_lifted':
      return {
        icon: 'shield',
        title: L(`${p.name} kuşatması kalktı`, `The siege of ${p.name} lifted`),
        text: L(`${vary(n, [`${p.name} önündeki kuşatma sona erdi`, `${p.name} kapısındaki çadırlar söküldü`, `${p.name} surları önünde artık kimse yok`, `${p.name} kuşatması dağıldı`])}: kuşatan ordu gitti, yenildi ya da artık savaşta değilsiniz. Hangisi olduğunu sorma, lordum; ben sadece haberciyim.`, `${vary(n, [`The siege before ${p.name} has ended`, `The tents at the gate of ${p.name} have been struck`, `No one stands before the walls of ${p.name} any more`, `The siege of ${p.name} has broken up`])}: the besieging army left, was beaten, or you are no longer at war. Do not ask which, my lord; I am only the messenger.`),
      }
    case 'town_taken': {
      const mine = p.by === me
      return mine
        ? { icon: 'crown', title: L(`${p.name} artık senin!`, `${p.name} is yours now!`), text: L(`${p.name} kasabası kapılarını açtı${Number(p.lost) > 0 ? `; ${fmt(Number(p.lost))} asker kaybettin` : ''}. Bundan sonra sana katkı gönderecek. Anahtarı bana verdiler, lordum; biraz cebimde taşıyıp sana vereceğim.${overreachNote(online, 0)}`, `The town of ${p.name} opened its gates${Number(p.lost) > 0 ? `; you lost ${fmt(Number(p.lost))} soldier${Number(p.lost) === 1 ? '' : 's'}` : ''}. From now on it will send you its share. They gave me the key, my lord; I shall carry it in my pocket a while and then give it to you.${overreachNote(online, 0)}`) }
        : { icon: 'warn', title: L(`${p.name} elden çıktı`, `${p.name} lost`), text: L(`${p.by} ${p.name} kasabanı aldı. Kasabanın katkısı artık onlara gidiyor. Ben o kasabayı zaten pek sevmezdim, lordum; ekmeği bayattı.`, `${p.by} took your town of ${p.name}. Its share now goes to them. I never much liked that town anyway, my lord; the bread was stale.`) }
    }
    case 'patrol_tribute': {
      // How much of the treasury it is (newer notices carry the treasury as it stood).
      const share = Number(p.gold) > 0 ? L(` (hazinenin %${Math.max(1, Math.round((Number(p.amount) / Number(p.gold)) * 100))} kadarı${tilt(Number(p.crown ?? 0), Date.parse(n.show_at))})`, ` (about ${Math.max(1, Math.round((Number(p.amount) / Number(p.gold)) * 100))}% of your treasury${tilt(Number(p.crown ?? 0), Date.parse(n.show_at))})`) : ''
      return {
        icon: 'banner',
        title: L(`${crown(p.crown)} haraççıları kapında`, `Tribute collectors of ${crown(p.crown)} at your gate`),
        text: L(`Lordum, yine onlar. Rakip taç ${crown(p.crown)} haraççıları sarayına dayandı (her ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelirler; keşke tüccarımız bu kadar dakik olsa) ve ${fmt(Number(p.amount))} altın${share} haraç istiyor. Ödersen yollarına giderler. Reddedersen o tacın lordlarıyla ilişkin ${-balance.cities.crown.patrol.refuseRelation} düşer. ${Math.round(balance.cities.crown.patrol.answerSeconds / 60)} dakika içinde cevap vermezsen haraç kendiliğinden ödenir, ama oyundaysan %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla: ${fmt(unansweredTribute(Number(p.amount), 1, 1, Number(p.gold) > 0 ? Number(p.gold) : Infinity).amount)} altın. Başlarıyla konuşmak da bir yol; tatlı dil bazen haracı bile indirir.`, `My lord, it is them again. The tribute collectors of the rival crown, ${crown(p.crown)}, are at your palace (they come every ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} minutes; if only our merchant were so punctual) and demand ${fmt(Number(p.amount))} gold${share} in tribute. Pay and they go on their way. Refuse and your relations with that crown's lords drop by ${-balance.cities.crown.patrol.refuseRelation}. If you do not answer within ${Math.round(balance.cities.crown.patrol.answerSeconds / 60)} minutes, the tribute is paid automatically, but if you are in the game, with ${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)}% extra: ${fmt(unansweredTribute(Number(p.amount), 1, 1, Number(p.gold) > 0 ? Number(p.gold) : Infinity).amount)} gold. Talking to their captain is another way; a sweet tongue sometimes even lowers the tribute.`),
      }
    }
    case 'patrol_tip':
      // A lord still on a level 1 palace: no hall to drink in, the patrol tips him at the gate all the same.
      if (p.newcomer)
        return {
          icon: 'gold',
          title: L('Devriye yeni lorda uğradı', 'The patrol called on the new lord'),
          text: vary(n, [
            L(`${crown(p.crown)} devriyesi sarayının önünde durdu, yeni lordlarını görmeye gelmiş. Giderken ${fmt(Number(p.amount))} altın bıraktılar: "yolun açık olsun" demekmiş. Eğlence merkezin olsaydı içip şarkı da söylerlerdi; şimdilik kurtulduk.`, `The patrol of ${crown(p.crown)} stopped before your palace to see their new lord. As they left they dropped ${fmt(Number(p.amount))} gold: "for a good start", they said. Had you an entertainment hall they would have sung as well; we were spared, for now.`),
            L(`Tacının askerleri kapıda selam verdi ve kesene ${fmt(Number(p.amount))} altın koydu. Yeni lordlara cömert davranırlarmış, lordum; büyüyünce bu cömertlik bahşişe döner, o da ancak eğlence merkezinde.`, `Your crown's soldiers saluted at the gate and put ${fmt(Number(p.amount))} gold in your purse. They are generous to new lords, my lord; once you grow it turns into tips, and only at an entertainment hall.`),
            L(`${crown(p.crown)} devriyesi geldi, sarayını beğendi (küçük buldular ama kibarlar) ve ${fmt(Number(p.amount))} altın bıraktı. Ben de bir altın istedim; vermediler.`, `The patrol of ${crown(p.crown)} came, liked your palace (they found it small, but they are polite) and left ${fmt(Number(p.amount))} gold. I asked for a coin myself; they refused.`),
            L(`Tacının devriyesi uğradı, lordum: "Yeni lordumuz aç kalmasın" deyip ${fmt(Number(p.amount))} altın bıraktılar. Aç kalmayacağız; ben zaten mutfaktaydım.`, `Your crown's patrol called, my lord: "Our new lord shall not go hungry", they said, and left ${fmt(Number(p.amount))} gold. We shan't; I was in the kitchen anyway.`),
          ]) + (p.gift ? ` ${giftText(p.gift as Record<string, unknown>)}` : ''),
        }
      return {
        icon: 'gold',
        title: L('Devriye eğlenip gitti', 'The patrol had its fun and left'),
        text: vary(n, [
          L(`${crown(p.crown)} devriyesi eğlence merkezinde soluklandı, içti, şarkı söyledi ve ${fmt(Number(p.amount))} altın bahşiş bıraktı. Şarkıları berbattı, lordum; bahşişleri güzel.`, `The patrol of ${crown(p.crown)} rested at the entertainment hall, drank, sang and left ${fmt(Number(p.amount))} gold in tips. Their singing was dreadful, my lord; their tips lovely.`),
          L(`${crown(p.crown)} askerleri fıçıları boşalttı, ozanı alkışladı ve giderken masaya ${fmt(Number(p.amount))} altın bıraktı. Ozan alkışı hak etmemişti; ben söylesem daha iyi söylerdim.`, `The soldiers of ${crown(p.crown)} emptied the casks, applauded the bard and left ${fmt(Number(p.amount))} gold on the table. The bard did not deserve the applause; I would have sung it better.`),
          L(`${crown(p.crown)} devriyesi gece boyu şarkı söyledi; çavuşları biraz da dans etti. Bahşiş: ${fmt(Number(p.amount))} altın. Ayı daha zarif dans eder, lordum; ama ayı bahşiş bırakmaz.`, `The patrol of ${crown(p.crown)} sang all night; their sergeants even danced a little. Tips: ${fmt(Number(p.amount))} gold. A bear dances more gracefully, my lord; but a bear leaves no tip.`),
          L(`Eğlence merkezinde ${crown(p.crown)} devriyesi vardı: kadehler kalktı, zarlar atıldı ve ${fmt(Number(p.amount))} altın bahşiş kaldı. Zarda bana da kaybettiler; o kısmı deftere yazmadım.`, `The patrol of ${crown(p.crown)} was at the entertainment hall: glasses raised, dice rolled and ${fmt(Number(p.amount))} gold in tips left behind. They lost to me at dice too; that part I did not put in the ledger.`),
        ]) + (p.gift ? ` ${giftText(p.gift as Record<string, unknown>)}` : ''),
      }
    case 'rival_gift':
      return {
        icon: 'gold',
        title: L(`${crown(p.crown)} sana kese gönderdi`, `${crown(p.crown)} sent you a purse`),
        text: vary(n, [
          L(`Rakip taç ${crown(p.crown)} adamları kapına geldi ama haraç istemedi: sarayın daha küçük, lordum, onlar da gözünü boyamak istiyor. ${fmt(Number(p.amount))} altın bırakıp gittiler. Saray ${balance.cities.crown.patrol.newcomer.belowPalace}. seviyeye çıkınca bu keseler biter, haraç başlar; ben şimdiden kapıyı yağlatıyorum.`, `The men of the rival crown, ${crown(p.crown)}, came to your gate but asked for no tribute: your palace is still small, my lord, and they want to win you over. They left ${fmt(Number(p.amount))} gold and went. Once the palace reaches level ${balance.cities.crown.patrol.newcomer.belowPalace} the purses stop and the tribute begins; I am already oiling the gate.`),
          L(`${crown(p.crown)} haraççıları geldi, sarayına baktı, güldü ve kesene ${fmt(Number(p.amount))} altın koydu. "Büyüyünce görüşürüz" dediler. Bu bir tehdit, lordum; ama altını tehditten saymıyorum.`, `The tribute collectors of ${crown(p.crown)} came, looked at your palace, laughed and put ${fmt(Number(p.amount))} gold in your purse. "We'll talk when you've grown", they said. It's a threat, my lord; but I don't count the gold as one.`),
          L(`Rakip tacın adamları bugün cömertti: ${fmt(Number(p.amount))} altın. Küçük lordlardan haraç almaz, onları tavlarlarmış. Saray ${balance.cities.crown.patrol.newcomer.belowPalace}. seviyeye çıkınca kese yerine el uzatacaklar.`, `The rival crown's men were generous today: ${fmt(Number(p.amount))} gold. They take no tribute from small lords, they court them. Once the palace reaches level ${balance.cities.crown.patrol.newcomer.belowPalace} they'll hold out a hand instead of a purse.`),
          L(`${crown(p.crown)} askerleri kapıda biraz dikildi, sonra ${fmt(Number(p.amount))} altın bıraktı. Düşmanın hediyesi tatlıdır, lordum; ben tadına baktım bile.`, `The soldiers of ${crown(p.crown)} loitered at the gate a while, then left ${fmt(Number(p.amount))} gold. An enemy's gift is sweet, my lord; I've already had a taste.`),
        ]),
      }
    case 'patrol_visit':
      return {
        icon: 'crown',
        title: L('Taç devriyesi uğradı', "The crown's patrol stopped by"),
        text: L(`${crown(p.crown)} devriyesi sarayının önüne geldi, selam verdi ve yoluna devam etti; tacınla ilişkin +${fmt(Number(p.relation ?? 1))}. Bir eğlence merkezin (4. seviye saray) olsaydı içip eğlenir ve bahşiş bırakırlardı. Kuru bir selamla gittiler; ben de kuru kuru el salladım.`, `The patrol of ${crown(p.crown)} came before your palace, saluted and went on its way; relations with your crown +${fmt(Number(p.relation ?? 1))}. Had you an entertainment hall (level 4 palace), they would have drunk, made merry and left tips. They left with a dry salute; I waved back, dryly.`),
      }
    case 'crown_gift':
      return {
        icon: 'chest',
        title: L(`${crown(p.crown)} armağan gönderdi`, `${crown(p.crown)} sent a gift`),
        text: giftText(p),
      }
    case 'patrol_taken':
      return p.afk
        ? {
            icon: 'gold',
            title: L('Haraç fazlasıyla ödendi', 'Tribute paid, with a surcharge'),
            text: L(`Oyundaydın ama ${crown(p.crown)} haraççılarına cevap vermedin; haraç kendiliğinden, %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla ödendi: ${fmt(Number(p.amount))} altın${Number(p.asked) > 0 ? ` (istenen ${fmt(Number(p.asked))})` : ''}. Zamanında ödersen ya da reddedersen bu fazlalık olmaz. Kapıda onları oyalarken benim dizlerim de çürüdü, lordum.`, `You were in the game but did not answer the tribute collectors of ${crown(p.crown)}; the tribute was paid automatically with ${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)}% extra: ${fmt(Number(p.amount))} gold${Number(p.asked) > 0 ? ` (demanded: ${fmt(Number(p.asked))})` : ''}. Pay or refuse in time and there is no surcharge. My knees rotted stalling them at the gate, my lord.`),
          }
        : { icon: 'gold', title: L('Haraç ödendi', 'Tribute paid'), text: L(`Sen yokken ${crown(p.crown)} haraççıları geldi; olağan haracı, ${fmt(Number(p.amount))} altın ödedin. Ben pazarlığa girişecektim, lordum; ağzımı açmadan keseyi aldılar.`, `While you were away, the tribute collectors of ${crown(p.crown)} came; you paid the usual tribute, ${fmt(Number(p.amount))} gold. I was about to haggle, my lord; they took the purse before I opened my mouth.`) }
    case 'patrol_ignored':
      return { icon: 'warn', title: L('Haraç cevapsız kaldı', 'Tribute left unanswered'), text: L(`${crown(p.crown)} devriyesi ${fmt(Number(p.amount))} altınını alamadan döndü. O tacın lordları bunu unutmayacak: ilişkin ${-balance.cities.crown.patrol.refuseRelation} düştü. Giderken kapıyı öyle bir çarptılar ki menteşe hâlâ ağlıyor.`, `The patrol of ${crown(p.crown)} went back without its ${fmt(Number(p.amount))} gold. That crown's lords will not forget it: your relations dropped by ${-balance.cities.crown.patrol.refuseRelation}. They slammed the door so hard on the way out that the hinge is still crying.`) }
    case 'town_revolt':
      return {
        icon: 'unhappy',
        title: L(`${p.name} ayaklandı!`, `${p.name} revolts!`),
        text: L(`${p.name} halkı sana karşı ayaklandı: ${p.minutes ?? Math.round(balance.towns.revolt.seconds / 60)} dakika boyunca hiçbir şey göndermeyecek${Number(p.rebels) > 0 ? ` ve ${p.rebels} asi kasabanın kapısını tuttu` : ''}. Yabalar havada, lordum; çoğunu da biz vermiştik. Ordunu gönderip asileri yenersen ayaklanma biter (kasabanın panelinde "Ayaklanmayı bastır"). Yoksa ayaklanma bittiğinde sadakat hâlâ ${balance.towns.revolt.breakAwayBelow}'nin altındaysa kasaba senden kopar ve asiler onun garnizonu olur.`, `The people of ${p.name} have risen against you: for ${p.minutes ?? Math.round(balance.towns.revolt.seconds / 60)} minutes they will send nothing${Number(p.rebels) > 0 ? ` and ${p.rebels} rebels hold the town gate` : ''}. Pitchforks in the air, my lord; most of them we handed out. Send your army and beat the rebels and the revolt ends ("Crush the revolt" on the town's panel). Otherwise, if loyalty is still below ${balance.towns.revolt.breakAwayBelow} when the revolt ends, the town breaks away from you and the rebels become its garrison.`),
      }
    case 'town_lost_revolt':
      return {
        icon: 'warn',
        title: L(`${p.name} senden koptu`, `${p.name} broke away from you`),
        text: L(`${vary(n, [
          `${p.name} halkı ayaklanmayı sonuna götürdü ve sana bağlılığını bıraktı.`,
          `${p.name} burcundaki sancağın indirildi; kasaba sana bağlılığını bıraktı. Sancağı da iade etmediler, lordum.`,
          `${p.name} valinin kapısını gösterdi; kasaba artık senin değil.`,
          `${p.name} halkı "yeter" dedi ve senden koptu. Kibarca söylediler en azından; bağırarak ama kibarca.`,
        ])} Kasaba artık kimseye bağlı değil; küçük bir garnizonla kendini savunuyor, yeniden kuşatıp alabilirsin.`, `${vary(n, [
          `The people of ${p.name} saw the revolt through and renounced their allegiance to you.`,
          `Your banner was lowered from the tower of ${p.name}; the town renounced its allegiance to you. They did not return the banner either, my lord.`,
          `${p.name} showed your governor the door; the town is no longer yours.`,
          `The people of ${p.name} said "enough" and broke away from you. Politely, at least; shouting, but politely.`,
        ])} The town is now bound to no one; it defends itself with a small garrison, and you can besiege and take it again.`),
      }
    case 'town_sale': {
      const good = RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? String(p.good)
      return {
        icon: 'gold',
        title: L('Kasabadan iyi haber', 'Good news from a town'),
        text: L(`${p.by}, ${p.name} kasabanın pazarından ${fmt(Number(p.units))} ${good} aldı; hazinene ${fmt(Number(p.gold))} altın girdi. Başkasının askeri bizim pazarda alışveriş ediyor, lordum; ben buna ticaret derim, sen kâr de.${Number(p.wasted) > 0 ? ` Hazine dolu olduğu için ${fmt(Number(p.wasted))} altın boşa gitti.` : ''}`, `${p.by} bought ${fmt(Number(p.units))} ${good} at the market of your town of ${p.name}; ${fmt(Number(p.gold))} gold went into your treasury. Someone else's soldiers shopping at our market, my lord; I call it trade, you may call it profit.${Number(p.wasted) > 0 ? ` With the treasury full, ${fmt(Number(p.wasted))} gold went to waste.` : ''}`),
      }
    }
    case 'cargo_home': {
      const goods = goodsText(p.goods)
      return {
        icon: 'chest',
        title: L('Ordun yükünü getirdi', 'Your army brought its cargo home'),
        text: L(`Kasabadan alınan mallar saraya ulaştı${goods ? `: ${goods} ambara girdi` : ''}. Askerler yol boyu söylendi, lordum, ama çuvallar tamam; tek tek saydım.${Number(p.wasted) > 0 ? ` Ambar dolu olduğu için ${fmt(Number(p.wasted))} birim boşa gitti.` : ''}`, `The goods bought at the town have reached the palace${goods ? `: ${goods} went into the stores` : ''}. The soldiers grumbled the whole way, my lord, but the sacks are all there; I counted them one by one.${Number(p.wasted) > 0 ? ` With the storehouse full, ${fmt(Number(p.wasted))} units went to waste.` : ''}`),
      }
    }
    case 'cargo_lost':
      return {
        icon: 'warn',
        title: L('Yük kaybedildi', 'Cargo lost'),
        text: vary(n, [
          L(`Ordun yenildi; kasabadan taşıdığı mallar (${goodsText(p.goods)}) savaş alanında kaldı. Düşman şimdi bizim çuvallarla övünüyor.`, `Your army was beaten; the goods it carried from the town (${goodsText(p.goods)}) were left on the battlefield. The enemy now boasts of our sacks.`),
          L(`Yenilen ordun çuvalları bırakıp kaçtı: ${goodsText(p.goods)} düşmanın eline geçti. Hafiflik iyi gelmiş, lordum; çok hızlı koştular.`, `Your beaten army dropped the sacks and ran: ${goodsText(p.goods)} fell into enemy hands. Travelling light suited them, my lord; they ran very fast.`),
          L(`Kasabadan alınan mallar (${goodsText(p.goods)}) savaşın tozunda kayboldu; ordun yenildi. O çuvalları ben bağlamıştım, lordum; emeklerim!`, `The goods bought at the town (${goodsText(p.goods)}) were lost in the dust of battle; your army was beaten. I tied those sacks myself, my lord; all my labour!`),
          L(`Ordun canını kurtardı ama yükünü kurtaramadı: ${goodsText(p.goods)} savaş alanında kaldı. Önce can, sonra çuval; doğru sıra.`, `Your army saved its skin but not its cargo: ${goodsText(p.goods)} were left on the battlefield. Life first, sacks second; the right order.`),
        ]),
      }
    case 'town_held':
      return {
        icon: 'warn',
        title: L(`${p.name} dayandı`, `${p.name} held out`),
        text: vary(n, [
          L(`${p.name} garnizonu kuşatmayı püskürttü; ordundan ${fmt(Number(p.lost))} asker düştü, kimse kalmadı. Kasabalılar surlarda şarkı söylüyor, lordum; kulaklarımızı tıkayıp geçelim.`, `The garrison of ${p.name} repelled the siege; ${fmt(Number(p.lost))} of your soldiers fell, none left standing. The townsfolk are singing on the walls, my lord; let us plug our ears and move on.`),
          L(`${p.name} surları dayandı: ordundan ${fmt(Number(p.lost))} asker düştü ve ayakta kimse kalmadı. O surları hafife almıştım, itiraf ediyorum.`, `The walls of ${p.name} held: ${fmt(Number(p.lost))} of your soldiers fell and none were left standing. I underestimated those walls, I confess.`),
          L(`${p.name} garnizonu son adamına kadar direndi, ama son adam senin ordundandı: ${fmt(Number(p.lost))} asker düştü.`, `The garrison of ${p.name} fought to the last man, but the last man was from your army: ${fmt(Number(p.lost))} ${Number(p.lost) === 1 ? 'soldier' : 'soldiers'} fell.`),
          L(`Kuşatma kanla bitti: ${p.name} dayandı, ordundan ${fmt(Number(p.lost))} asker düştü, kimse kalmadı. Önce yas, lordum; sonra daha büyük bir ordu.`, `The siege ended in blood: ${p.name} held, ${fmt(Number(p.lost))} of your soldiers fell, none left. Mourning first, my lord; then a bigger army.`),
        ]),
      }
    case 'outlaw_chase':
      return { icon: 'swords', title: L(`${p.name} peşindesin`, `On the trail of ${p.name}`), text: L(`Ordun ${p.name} yağmacılarının önünü kesmek için yola çıktı (yaklaşık ${fmt(Number(p.soldiers))} kişiler). Yağmacılar ordudan yavaş yürür; yakaladığı an savaş başlar. ${Math.round(balance.outlaws.bands.chase.maxSeconds / 60)} dakikada yakalayamazsa takibi bırakır. Ben ordunun en arkasındayım, lordum; arkayı kollamak çok önemli bir görevdir.`, `Your army set out to cut off ${p.name} (about ${fmt(Number(p.soldiers))} of them). Bandits are slower than armies; the moment it catches them, the fight begins. If it cannot catch them within ${Math.round(balance.outlaws.bands.chase.maxSeconds / 60)} minutes, it gives up the chase. I am at the very back of the army, my lord; guarding the rear is a vital task.`) }
    case 'cave_trail': {
      const left = Math.max(1, Number(p.need) - Number(p.wins))
      const hint = trailHint({ dir: p.dir as number, far: p.far as number | null, mark: p.mark as TrailMark | null })
      return {
        icon: 'scroll',
        title: L(`${p.clan} izinde`, `On the trail of the ${p.clan}`),
        text: L(`Yakalanan yağmacılardan biri konuştu (sorguya ben de bir bakışımla katkıda bulundum): ${p.clan} çetelerin başında, dağlarda bir mağarada yaşıyor. Yağmacıların izi ${hint.to} gidiyor. Klanın çetelerinden ${left} tanesini daha yenersen mağarayı bulursun.`, `One of the captured bandits talked (I contributed to the questioning with a single look): the ${p.clan} leads the bands and lives in a cave in the mountains. The bandits' trail leads to ${hint.to}. Beat ${left} more of the clan's bands and you will find the cave.`),
      }
    }
    case 'cave_probe':
      return {
        icon: 'pin',
        title: L('Ordu mağarayı inceleyemedi', 'The army could not search the cave'),
        text: L(`${probeText(Number(p.reason))} Bir klanın izini sürmeden mağaralarda bir şey bulmak zor. Ordu mağaranın önünde bekliyor. Askerler içeri "Kimse var mı?" diye seslendi, lordum; yankı da onlara aynısını sordu.`, `${probeText(Number(p.reason))} It is hard to find anything in the caves without following a clan's trail. The army waits in front of the cave. The soldiers called "Anybody there?" inside, my lord; the echo asked them the same.`),
      }
    case 'cave_found':
      return { icon: 'pin', title: L(`${p.clan} mağarası bulundu!`, `Found the cave of the ${p.clan}!`), text: L(`İzler sonunda ${p.clan} mağarasına çıktı. Mağara artık haritanda işaretli (yalnız sen biliyorsun; bir de ben, ama ben kimseye söylemem). Mağaraya ya da çetelerinden birine tıkla, bir ordu seç ve "Mağarayı kuşat": klanı yok edersen mağaradaki ganimet senin.`, `The trail at last led to the cave of the ${p.clan}. The cave is now marked on your map (only you know of it; and me, but I never tell anyone). Click the cave or one of its bands, choose an army and "Besiege the cave": wipe out the clan and the plunder in the cave is yours.`) }
    case 'cave_empty':
      return {
        icon: 'shield',
        title: L('Mağara boş', 'The cave is empty'),
        text: L(`${vary(n, [
          'Ordun mağaraya vardı ama içeride kimse yok: klan çoktan yok edilmiş. Bize bir not bile bırakmamışlar.',
          'Meşaleler mağaranın dibine kadar indi; yalnızca sönmüş ateşler ve kırık çanaklar var. Klan çoktan yok edilmiş.',
          'Mağarada yarasalardan başka kimse yok; klan çoktan yok edilmiş. Yarasalar da pek misafirperver değildi, lordum.',
          'Ordun mağaraya daldı ve boş buldu: biri klanı senden önce bitirmiş. Geç kalınan bir davet gibi, lordum.',
        ])} Ordu mağaranın önünde bekliyor.`, `${vary(n, [
          'Your army reached the cave, but there is no one inside: the clan was wiped out long ago. They did not even leave us a note.',
          'The torches went down to the very back of the cave; only dead fires and broken pots. The clan was wiped out long ago.',
          'Nobody in the cave but bats; the clan was wiped out long ago. The bats were not very hospitable either, my lord.',
          'Your army charged into the cave and found it empty: someone finished the clan before you. Like arriving late to a party, my lord.',
        ])} The army waits in front of the cave.`),
      }
    case 'clan_destroyed':
      return { icon: 'swords', title: L(`${p.clan} yok edildi`, `The ${p.clan} wiped out`), text: L(`${p.byName} ordusu ${p.clan} mağarasını aldı; klanın çeteleri yollardan dağıldı. Ama dağlarda yeni bir çete türedi: ${p.next}. Bir süre sonra onun çeteleri yolları tutmaya başlar; izini yeniden sürmek gerekecek. Bu dağlarda yağmacılık aile mesleği, lordum.`, `The army of ${p.byName} took the cave of the ${p.clan}; the clan's bands have scattered from the roads. But a new clan has sprung up in the mountains: ${p.next}. Before long its bands will start holding the roads; its trail will have to be followed anew. Banditry runs in the family in these mountains, my lord.`) }
    case 'outlaw_gone':
      return {
        icon: 'shield',
        title: L('Çete ortada yok', 'The band is nowhere to be seen'),
        text: L(`${vary(n, [`${p.name} dağıtılmış`, `${p.name} çoktan dağılmış, izleri bile soğumuş`, `${p.name} senden önce birinin kılıcına denk gelmiş`, `Yolda ${p.name} adına yalnızca sönmüş bir kamp ateşi kaldı`])}; ordun takibi bıraktı ve olduğu yerde bekliyor. Bu kadar yürüdük, lordum; boşuna olmadı, bacaklar güçlendi.`, `${vary(n, [`${p.name} has been scattered`, `${p.name} broke up long ago; even its tracks have gone cold`, `${p.name} ran into someone's sword before you`, `All that is left of ${p.name} on the road is a dead campfire`])}; your army gave up the chase and waits where it is. All that marching, my lord; not for nothing, the legs got stronger.`),
      }
    case 'outlaw_escaped':
      return {
        icon: 'warn',
        title: L(`${p.name} izini kaybettirdi`, `${p.name} shook off the pursuit`),
        text: L(`${vary(n, [
          `Ordun ${p.name} yağmacılarına yetişemedi ve takibi bıraktı`,
          `${p.name} yağmacıları dere yataklarına dalıp kayboldu; ordun takibi bıraktı`,
          `${p.name} izlerini ustaca sildi; ordun peşlerini bıraktı`,
          `Ordun ${p.name} yağmacılarını gözden kaçırdı ve takibi bıraktı; komutan bir tavşanın peşine takılmış olabilir`,
        ])}; olduğu yerde bekliyor. Daha yakındaki bir orduyla yeniden dene.`, `${vary(n, [
          `Your army could not catch ${p.name} and gave up the chase`,
          `${p.name} slipped into the stream beds and vanished; your army gave up the chase`,
          `${p.name} covered its tracks skilfully; your army gave up the pursuit`,
          `Your army lost sight of ${p.name} and gave up the chase; the commander may have gone after a rabbit`,
        ])}; it waits where it is. Try again with an army closer by.`),
      }
    case 'outlaw_road':
      return {
        icon: 'warn',
        title: L('Yağmacılar yolu tuttu!', 'Bandits hold the road!'),
        text: L(`${vary(n, [
          `Lordum, yağmacılar tüccarımızı soymaya başladı; tüccar da onlara indirim yapıyor. Ticaret noktanın çevresindeki ticaret yolunun %${Math.round(Number(p.share) * 100)}'i yağmacıların elinde (${p.bands} çete).`,
          `Gözcüler haber verdi: ${p.bands} çete ticaret noktanın yollarına indi; yolun %${Math.round(Number(p.share) * 100)}'i onların. Yol kenarına tabela bile asmışlar.`,
          `Tüccarın soluk soluğa döndü: yağmacılar (${p.bands} çete) yolun %${Math.round(Number(p.share) * 100)}'ini tutuyor. Devesi daha sakin, lordum.`,
          `Hanlarda tek konu yağmacılar: ${p.bands} çete ticaret noktanın çevresindeki yolun %${Math.round(Number(p.share) * 100)}'ini kesmiş. Hancılar fiyatları da artırdı, tesadüfe bak.`,
        ])} Tüccarının altınının %${Math.round(Number(p.cut) * 100)}'ini kesiyorlar ve halk tedirgin. Haritada çeteye tıkla, bir ordu seç ve "Takip et".`, `${vary(n, [
          `My lord, the bandits have begun robbing our merchant; and the merchant is giving them a discount. ${Math.round(Number(p.share) * 100)}% of the trade road around your trading post is in bandit hands (${p.bands} band${Number(p.bands) === 1 ? '' : 's'}).`,
          `The lookouts report: ${p.bands} band${Number(p.bands) === 1 ? '' : 's'} came down onto your trading post's roads; ${Math.round(Number(p.share) * 100)}% of the road is theirs. They have even put up signposts.`,
          `Your merchant is out of breath: bandits (${p.bands} band${Number(p.bands) === 1 ? '' : 's'}) hold ${Math.round(Number(p.share) * 100)}% of the road. His camel is calmer, my lord.`,
          `The inns talk of nothing but bandits: ${p.bands} band${Number(p.bands) === 1 ? ' has' : 's have'} cut off ${Math.round(Number(p.share) * 100)}% of the road around your trading post. The innkeepers raised their prices too, what a coincidence.`,
        ])} They take ${Math.round(Number(p.cut) * 100)}% of your merchant's gold and the people are uneasy. Click the band on the map, choose an army and "Chase".`),
      }
    case 'inn_lost':
      return {
        icon: 'warn',
        title: L('Han kapılarını kapattı', 'The inn closed its doors'),
        text: L(`${vary(n, [
          'Tüccarının gittiği hanın hancısı onu artık tanımıyor: o hanın pastasında payın kalmadı denecek kadar azaldı. Bana da çorba vermediler, lordum.',
          'Kötü haber, lordum: tüccarımız handa yüz bulamadı. Başkaları oraya daha yakın, bizim payımız eridi; tereyağı gibi.',
          'Han başka lordların kervanlarıyla doldu; bizim tüccara yer yok dediler. Payımız neredeyse sıfır. Ahırda bile yer yokmuş.',
          'Hancı kapıda karşıladı ve geri çevirdi: o yöredeki gücümüz yetmiyor artık. Kapıyı da yüzümüze kibarca kapattı.',
        ])} Tüccar lobi pazarına döndü. O hanı geri istiyorsan yakınındaki bir kasabayı al.`, `${vary(n, [
          'The innkeeper where your merchant trades no longer knows him: your share of that inn has shrunk to next to nothing. They would not give me any soup either, my lord.',
          'Bad news, my lord: our merchant got a cold welcome at the inn. Others are closer to it and our share has melted away; like butter.',
          'The inn is full of other lords\' caravans; no room for our merchant, they said. Our share is almost nil. Not even room in the stable.',
          'The innkeeper met him at the door and turned him away: our hold on those parts is no longer enough. Shut the door in our faces, politely.',
        ])} The merchant has gone back to the lobby market. If you want that inn back, take a town near it.`),
      }
    case 'outlaw_road_clear':
      return {
        icon: 'shield',
        title: L('Yollar temizlendi', 'Roads cleared'),
        text: vary(n, [
          L('Ticaret noktanın çevresindeki yollarda yağmacı kalmadı; tüccarın yine tam kazanıyor. Ben de yine o yollarda rahat yürüyebileceğim; dizlerim hariç.', 'No bandits left on the roads around your trading post; your merchant earns in full again. And I can walk those roads in peace again; knees excepted.'),
          L('Yollar yeniden güvenli: ticaret noktanın çevresinde yağmacı kalmadı, tüccarın tam kazanıyor. Tüccar şimdi kendine korumasız dolaşıyor; havalı.', 'The roads are safe again: no bandits around your trading post, your merchant earns in full. Now he swaggers about without a guard; very dashing.'),
          L('Tüccarın bu sabah ıslık çalarak yola çıktı; yollarda yağmacı yok, kazancı tam. Islığı berbat, lordum; ama ses etmedim.', 'Your merchant set off whistling this morning; no bandits on the roads, full earnings. His whistling is dreadful, my lord; but I held my tongue.'),
          L('Ticaret yolunun yağmacıları gitti; tüccarın kesesi yine dolu dönüyor. Ben de yine yol masrafı isteyebilirim, değil mi?', "The trade road's bandits are gone; your merchant's purse comes back full again. So I can ask for travel expenses again, can I not?"),
        ]),
      }
    case 'pirate_waters':
      return {
        icon: 'ship',
        title: L('Korsanlar sularında!', 'Pirates in your waters!'),
        text: L(`${vary(n, [
          `İskelenin yakınında ${p.boats} korsan teknesi dolaşıyor (korsanların etkisi %${Math.round(Number(p.share) * 100)}). Ben denize hiç güvenmezdim, lordum; işte haklı çıktım.`,
          `Kara yelkenler göründü: ${p.boats} korsan teknesi iskelenin önünde (etkileri %${Math.round(Number(p.share) * 100)}). Biri de bize tahta bacağını sallıyor.`,
          `Balıkçılar ağlarını topladı: ${p.boats} korsan teknesi sularında geziyor (etkileri %${Math.round(Number(p.share) * 100)}). Balıklar da saklandı, korkaklar.`,
          `İskele bekçisi çan çaldı: korsanlar geldi, ${p.boats} tekne (etkileri %${Math.round(Number(p.share) * 100)}). Bekçi hâlâ çalıyor; durdurabilecek kimse yok.`,
        ])} Deniz ticaretine saldırı olasılığı arttı, balık azaldı, halk tedirgin. Haritada kara yelkenli tekneye tıkla, savaş gemili bir filo seç ve "Takip et"; ya da korsan limanını ablukaya al, hepsi zayıflar.`, `${vary(n, [
          `${p.boats} pirate boat${Number(p.boats) === 1 ? ' is' : 's are'} prowling near your dock (pirate influence ${Math.round(Number(p.share) * 100)}%). I never trusted the sea, my lord; and here I am, proven right.`,
          `Black sails sighted: ${p.boats} pirate boat${Number(p.boats) === 1 ? '' : 's'} off your dock (influence ${Math.round(Number(p.share) * 100)}%). One of them is waving his wooden leg at us.`,
          `The fishermen pulled in their nets: ${p.boats} pirate boat${Number(p.boats) === 1 ? ' is' : 's are'} roaming your waters (influence ${Math.round(Number(p.share) * 100)}%). The fish hid too, the cowards.`,
          `The dock watchman rang the bell: pirates, ${p.boats} boat${Number(p.boats) === 1 ? '' : 's'} (influence ${Math.round(Number(p.share) * 100)}%). He is still ringing; no one can stop him.`,
        ])} Attacks on sea trade are more likely, the catch is smaller and the people are uneasy. Click the black-sailed boat on the map, choose a fleet with warships and "Chase"; or blockade the pirate haven and they all weaken.`),
      }
    case 'pirate_waters_clear':
      return {
        icon: 'anchor',
        title: L('Sular temizlendi', 'Waters cleared'),
        text: vary(n, [
          L('İskelenin önündeki sularda korsan kalmadı. Martılar artık yalnız bizim balığımızı çalıyor.', 'No pirates left in the waters off your dock. Now only the gulls steal our fish.'),
          L('Kara yelkenler ufuktan çekildi; iskelenin önü yeniden temiz. Ben hep söylüyordum, giderler diye; sonunda gittiler.', 'The black sails have left the horizon; the waters off your dock are clear again. I always said they would go; and at last they went.'),
          L('İskelenin sularında korsan yok; balıkçılar yine rahat ağ atıyor. Ve yine boş çekiyor, ama rahat.', "No pirates in your dock's waters; the fishermen cast their nets in peace again. And haul them up empty again, but in peace."),
          L('Korsanlar iskelenin önünden gitti; deniz ticareti yeniden güvenli. Denizin kendisi hariç, lordum; o hiç güvenli değil.', 'The pirates have left your dock; sea trade is safe again. Except for the sea itself, my lord; that is never safe.'),
        ]),
      }
    case 'pirate_battle': {
      const lostShips = Object.values((p.loss ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
      const might = L(`filonun gücü ${String(Math.round(Number(p.fleetMight) * 10) / 10).replace('.', ',')}, korsanlarınki ${String(Math.round(Number(p.might) * 10) / 10).replace('.', ',')}`, `fleet strength ${Math.round(Number(p.fleetMight) * 10) / 10}, the pirates' ${Math.round(Number(p.might) * 10) / 10}`)
      return p.won
        ? { icon: 'chest', title: L(`${p.name} batırıldı!`, `${p.name} sunk!`), text: L(`Filon korsanları yakaladı ve yendi (${might}; zarlar ${(p.rolls as number[])?.join('–')}).${lostShips ? ` ${lostShips} gemi kaybettin.` : ' Kayıp yok.'}${p.loot ? ` Ödül ve ganimet: ${goodsText(p.loot)}.` : ''} Korsanların papağanı kaçtı, lordum; peşine düşmedim, çok küfürbazdı.`, `Your fleet caught the pirates and beat them (${might}; dice ${(p.rolls as number[])?.join('–')}).${lostShips ? ` You lost ${lostShips} ship${lostShips === 1 ? '' : 's'}.` : ' No losses.'}${p.loot ? ` Bounty and plunder: ${goodsText(p.loot)}.` : ''} The pirates' parrot escaped, my lord; I did not give chase, it swore terribly.`) }
        : { icon: 'warn', title: L(`${p.name} korsanları kazandı`, `The pirates of ${p.name} won`), text: L(`Filon korsanlara yenildi (${might}; zarlar ${(p.rolls as number[])?.join('–')})${lostShips ? ` ve ${lostShips} gemi kaybetti` : ''}. Korsanlar dolaşmaya devam ediyor; daha güçlü bir filoyla (kadırgalar korsanları yener) yeniden dene. Arkamızdan "yo ho" diye bağırdılar, lordum; çok kaba.`, `Your fleet was beaten by the pirates (${might}; dice ${(p.rolls as number[])?.join('–')})${lostShips ? ` and lost ${lostShips} ship${lostShips === 1 ? '' : 's'}` : ''}. The pirates roam on; try again with a stronger fleet (galleys beat pirates). They shouted "yo ho" after us, my lord; very rude.`) }
    }
    case 'haven_battle': {
      const lostShips = Object.values((p.loss ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
      const might = L(`filonun gücü ${String(Math.round(Number(p.fleetMight) * 10) / 10).replace('.', ',')}, limanın ${String(Math.round(Number(p.might) * 10) / 10).replace('.', ',')}`, `fleet strength ${Math.round(Number(p.fleetMight) * 10) / 10}, the haven's ${Math.round(Number(p.might) * 10) / 10}`)
      return p.won
        ? {
            icon: 'chest',
            title: L(`${p.name} abluka altında!`, `${p.name} under blockade!`),
            text: L(`${vary(n, [
              `Filon limanı koruyan ${p.guards} çektiriyi yendi`,
              `Korsanların muhafızları (${p.guards} çektiri) filonun önünde dağıldı; kaçarken birbirlerinin küreğine takıldılar`,
              `Limanın ağzındaki ${p.guards} çektiri batırıldı ya da kaçtı`,
              `Filon limanın önüne demir attı; ${p.guards} çektiri karşı koyamadı, biri teslim bayrağı yerine gömlek salladı`,
            ])} (${might}; zarlar ${(p.rolls as number[])?.join('–')}).${lostShips ? ` ${lostShips} gemi kaybettin.` : ' Kayıp yok.'}${p.loot ? ` Ganimet: ${goodsText(p.loot)}.` : ''} Filo limanın önünde kaldıkça korsanların nüfusu (${p.pop}) saatte ${balance.outlaws.havens.pop.blockadePerHour} kişi azalır ve bütün korsanlar zayıflar. Geri çağırınca liman yeniden dolmaya başlar.`, `${vary(n, [
              `Your fleet beat the ${p.guards} raider${Number(p.guards) === 1 ? '' : 's'} guarding the haven`,
              `The pirates' guards (${p.guards} raider${Number(p.guards) === 1 ? '' : 's'}) scattered before your fleet; they tangled in each other's oars as they fled`,
              `The ${p.guards} raider${Number(p.guards) === 1 ? '' : 's'} at the haven mouth were sunk or fled`,
              `Your fleet dropped anchor before the haven; the ${p.guards} raider${Number(p.guards) === 1 ? '' : 's'} could not resist, and one waved a shirt instead of a white flag`,
            ])} (${might}; dice ${(p.rolls as number[])?.join('–')}).${lostShips ? ` You lost ${lostShips} ship${lostShips === 1 ? '' : 's'}.` : ' No losses.'}${p.loot ? ` Plunder: ${goodsText(p.loot)}.` : ''} While the fleet stays before the haven, the pirate population (${p.pop}) falls by ${balance.outlaws.havens.pop.blockadePerHour} an hour and all pirates weaken. Recall it and the haven starts filling up again.`),
          }
        : { icon: 'warn', title: L(`${p.name} dayandı`, `${p.name} held out`), text: L(`Filon limanı koruyan ${p.guards} çektiriye yenildi (${might}; zarlar ${(p.rolls as number[])?.join('–')})${lostShips ? ` ve ${lostShips} gemi kaybetti` : ''}; kalanlar eve dönüyor. Daha güçlü bir filoyla (kadırgalar çektirileri yener) yeniden dene. Korsanlar kıyıda dans ediyordu, lordum; ritim de tutturuyorlardı, en acısı o.`, `Your fleet was beaten by the ${p.guards} raider${Number(p.guards) === 1 ? '' : 's'} guarding the haven (${might}; dice ${(p.rolls as number[])?.join('–')})${lostShips ? ` and lost ${lostShips} ship${lostShips === 1 ? '' : 's'}` : ''}; the rest are heading home. Try again with a stronger fleet (galleys beat raiders). The pirates were dancing on the shore, my lord; in rhythm, too, which hurts the most.`) }
    }
    case 'haven_turned':
      return {
        icon: 'anchor',
        title: L(`${p.name} zaten kuşatılmış`, `${p.name} is already blockaded`),
        text: vary(n, [
          L(`Filon vardığında limanın önünde ${p.by} gemilerini buldu; bir limanı aynı anda tek filo abluka eder. Filon eve dönüyor. Kaptanlar birbirine kibarca el salladı, lordum; dişlerini sıkarak.`, `When your fleet arrived it found the ships of ${p.by} before the haven; only one fleet can blockade a haven at a time. Your fleet is coming home. The captains waved to each other politely, my lord; through gritted teeth.`),
          L(`${p.by} senden önce davranmış: liman onun ablukasında. Filon geri dönüyor. Erken kalkan yol alıyor, lordum; ben hiç erken kalkamadım.`, `${p.by} got there before you: the haven is under their blockade. Your fleet is turning back. The early bird catches the worm, my lord; I have never been an early bird.`),
          L(`Limanın ağzı ${p.by} kadırgalarıyla dolu; filonun demirleyecek yeri yok. Eve dönüyor.`, `The haven mouth is full of galleys of ${p.by}; no room for your fleet to anchor. It is coming home.`),
        ]),
      }
    case 'haven_empty':
      return {
        icon: 'chest',
        title: L(`${p.name} boşaldı`, `${p.name} is empty`),
        text: vary(n, [
          L('Ablukan işini yaptı: korsan limanında kimse kalmadı. Korsanlar bu limandan güç alamıyor; filon geri çağırana dek orada bekler. Tayfalar boş iskelede balık tutuyor, lordum; hiç değilse bir işe yarasınlar.', 'Your blockade did its work: not a soul left in the pirate haven. The pirates draw no strength from it; your fleet waits there until you recall it. The crew are fishing off the empty pier, my lord; at least they are good for something.'),
          L('Limanın son korsanları da gece kaçtı; iskeleler bomboş. Filon döndüğünde liman yavaş yavaş yeniden dolacak. Giderken papağanlarını bile unutmuşlar.', "The haven's last pirates fled in the night; the piers are bare. When your fleet leaves, the haven will slowly fill again. They even forgot their parrots."),
          L('Korsan limanı ıssız: abluka korsanları dağıttı. Ne kadar uzun beklersen, liman o kadar geç dolar. Sabır, lordum; benim en büyük erdemim.', 'The pirate haven is deserted: the blockade scattered the pirates. The longer you wait, the later it fills again. Patience, my lord; my greatest virtue.'),
        ]),
      }
    case 'pirate_gone':
      return {
        icon: 'anchor',
        title: L('Korsanlar ortada yok', 'The pirates are nowhere to be seen'),
        text: vary(n, [
          L(`${p.name} batırılmış; filon takibi bıraktı. Biri işimizi yapmış, lordum; teşekkür mektubu yazayım mı?`, `${p.name} has been sunk; your fleet gave up the chase. Someone did our job for us, my lord; shall I write a thank-you letter?`),
          L(`${p.name} çoktan dalgaların altında; filon takibi bıraktı.`, `${p.name} is long beneath the waves; your fleet gave up the chase.`),
          L(`${p.name} başka bir filonun eline düşmüş; filon takibi bıraktı. Ganimeti de onlar almış tabii.`, `${p.name} fell to another fleet; your fleet gave up the chase. And they took the plunder, naturally.`),
          L(`Suyun üstünde ${p.name} adına yalnızca bir kırık direk yüzüyor; filon takibi bıraktı.`, `All that floats where ${p.name} was is a broken mast; your fleet gave up the chase.`),
        ]),
      }
    case 'ship_lost': {
      // A ship sunk by pirates on a sea-trade voyage or a pirate hunt (CLAUDE.md §8.5).
      const ship = ({ galley: L('kadırga', 'galley'), cog: L('koka', 'cog'), corsair: L('çektiri', 'raider') } as Record<string, string>)[String(p.ship)] ?? L('gemi', 'ship')
      const fleet = L(`${p.fleet}. filo`, `Fleet ${p.fleet}`)
      const cargo = Number(p.lost) > 0 && p.good ? L(` ve ${fmt(Number(p.lost))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES].toLocaleLowerCase(locale())}`, ` and ${fmt(Number(p.lost))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES].toLocaleLowerCase(locale())}`) : ''
      return {
        icon: 'ship',
        title: L(`Bir ${ship} battı`, `A ${ship} was sunk`),
        text:
          p.cause === 'hunt'
            ? vary(n, [
                L(`${fleet} korsan avında bir ${ship} kaybetti, lordum. Korsanları kovalarken korsanlar da bizi kovalamış; deniz iki yönlü bir yoldur.`, `${fleet} lost a ${ship} hunting pirates, my lord. While we chased the pirates, the pirates chased us; the sea is a two-way road.`),
                L(`Korsan avından acı haber: ${fleet} bir ${ship} kaybetti. Daha büyük bir filo daha az gemi kaybeder; bunu ben söylemedim, amiral söyledi.`, `Bitter news from the pirate hunt: ${fleet} lost a ${ship}. A bigger fleet loses fewer ships; I did not say that, the admiral did.`),
                L(`${fleet} korsanların peşindeyken bir ${ship} dalgalara gömüldü. Tayfadan kurtulanlar yüzerek döndü; ben olsam hâlâ yüzüyor olurdum.`, `${fleet} lost a ${ship} to the waves while after the pirates. The survivors swam back; I would still be swimming.`),
              ])
            : vary(n, [
                L(`Korsanlar ${fleet} filosunu yolda bastı: bir ${ship}${cargo} gitti, lordum. Eskort koymayan kervan da gemi de sonunda bunu yaşar.`, `Pirates fell on ${fleet} on the way: a ${ship}${cargo} lost, my lord. A voyage without an escort meets this sooner or later.`),
                L(`Deniz ticaretinden kara haber: korsanlar bir ${ship}${cargo} aldı. Filoya kadırga ya da çektiri katarsak bir dahakine onlar ağlar.`, `Black news from the sea trade: pirates took a ${ship}${cargo}. Add a galley or a raider to the fleet and next time they will be the ones weeping.`),
                L(`${fleet} korsanlara yenildi; bir ${ship}${cargo} battı. Kaptan "sis vardı" diyor; ben de vardı diyorum, gözlerinde.`, `${fleet} was beaten by pirates; a ${ship}${cargo} went down. The captain says "there was fog"; I say there was, in his eyes.`),
              ]),
      }
    }
    case 'pirate_escaped':
      return {
        icon: 'warn',
        title: L(`${p.name} kaçtı`, `${p.name} escaped`),
        text: vary(n, [
          L(`Filon ${p.name} korsanlarına yetişemedi ve takibi bıraktı. Kaptan "rüzgâr onlardan yanaydı" diyor; rüzgârı rüşvetle suçluyorum.`, `Your fleet could not catch the pirates of ${p.name} and gave up the chase. The captain says "the wind was on their side"; I accuse the wind of taking bribes.`),
          L(`${p.name} rüzgârı arkasına aldı ve kaçtı; filon takibi bıraktı.`, `${p.name} got the wind behind it and escaped; your fleet gave up the chase.`),
          L(`${p.name} sazlıklara sokuldu, filon izini kaybetti ve takibi bıraktı. Sazlıklar korsanı sever, lordum; ben de sazlıkları sevmem.`, `${p.name} slipped into the reeds, your fleet lost its trail and gave up the chase. Pirates love reeds, my lord; which is exactly why I do not.`),
          L(`Filon ${p.name} yelkenlerini ufukta kaybetti ve takibi bıraktı. Gözlük icat edilse ne güzel olurdu.`, `Your fleet lost the sails of ${p.name} on the horizon and gave up the chase. How nice it would be if someone invented spectacles.`),
        ]),
      }
    // ---- The lord's house (CLAUDE.md §9.1.1) ----
    case 'kin_unhappy': {
      const brother = p.kinship === 'sibling'
      return {
        icon: 'unhappy',
        title: L(`${brother ? 'Kardeşin' : 'Oğlun'} ${p.name} hoşnutsuz`, `Your ${brother ? 'brother' : 'son'} ${p.name} is unhappy`),
        text: L(`Saray kulağı fısıldıyor (saray kulağı benim, lordum): ${brother ? 'kardeşin' : 'oğlun'} ${p.name} senden pek hoşnut değil (${p.opinion}). ${
          brother
            ? `Daha da soğursa (${balance.dynasty.intrigue.revolt.below} altı) asker toplayıp sana isyan edebilir ve tahtını isteyebilir. Ona bir görev ver, hediye gönder ya da halkını mutlu et. Akşam yemeğinde ona ekmeği ilk sen uzat, derim.`
            : 'Ona bir görev ver ya da hediye gönder; Saray → Hanedan. Gençler böyledir, lordum; ben de onun yaşında bütün dünyaya küstüm.'
        }`, `The palace ear whispers (the palace ear is me, my lord): your ${brother ? 'brother' : 'son'} ${p.name} is not at all pleased with you (${p.opinion}). ${
          brother
            ? `If he cools further (below ${balance.dynasty.intrigue.revolt.below}) he may raise soldiers, rebel against you and claim your throne. Give him a post, send a gift or make your people happy. Pass him the bread first at supper, I say.`
            : 'Give him a post or send a gift; Palace → Dynasty. Young men are like that, my lord; at his age I sulked at the whole world.'
        }`),
      }
    }
    case 'kin_role': {
      const role = p.role as string | null
      const name = p.name as string
      const s = (p.skills ?? {}) as Record<string, number>
      const I = balance.dynasty.intrigue.roles
      if (role === null) return { icon: 'scroll', title: L(`${name} görevden alındı`, `${name} dismissed`), text: L(`${name} artık ${p.was === 'governor' ? 'vali' : p.was === 'commander' ? 'devriye komutanı' : 'hazinedar'} değil. Böyle bir şey kolay unutulmaz; sana gücendi. Akşam yemeğinde surat asacak, lordum; tuzu bile uzatmaz.`, `${name} is no longer ${p.was === 'governor' ? 'governor' : p.was === 'commander' ? 'patrol commander' : 'treasurer'}. Such things are not easily forgotten; they took offence. Expect a sulk at supper, my lord; they will not even pass the salt.`) }
      if (role === 'governor')
        return { icon: 'crown', title: L(`${name} ${p.town} valisi`, `${name}, governor of ${p.town}`), text: L(`${name} ${p.town} kasabasına vali olarak gitti. Kasabanın sadakat hedefi +${Math.round(Math.max(0, I.governor.loyalty + ((s.people ?? 5) - 5) * I.governor.perPeople))} arttı; görev verdiğin için sana da ısındı. Kasabalılar şimdiden ona dilekçe yazıyor.`, `${name} has gone to ${p.town} as governor. The town's loyalty target rose by ${Math.round(Math.max(0, I.governor.loyalty + ((s.people ?? 5) - 5) * I.governor.perPeople))}; and they warmed to you for the post. The townsfolk are already writing petitions to them.`) }
      if (role === 'commander')
        return { icon: 'banner', title: L(`${name} tacın devriyesinin başında`, `${name} leads the crown's patrol`), text: L(`${name} bağlı olduğun tacın devriyesinin komutasını aldı: devriyenin bahşişi artar, her uğrayışta taç seni biraz daha sever. Taç onu da sever; aklında olsun. Üniforma da ona çok yakıştı; biraz kıskandım.`, `${name} has taken command of your crown's patrol: the patrol's tips grow and the crown likes you a little more each visit. The crown will like them too; bear that in mind. The uniform suits them very well; I am a little jealous.`) }
      return { icon: 'gold', title: L(`${name} hazinedar`, `${name}, treasurer`), text: L(`${name} hazinenin başına geçti: vergi +%${Math.round(Math.max(0, (s.finance ?? 5) - I.treasurer.from) * I.treasurer.taxPerFinance * 100)}. Şimdiden benim yol masraflarımı sorgulamaya başladı, lordum.`, `${name} now runs the treasury: tax +${Math.round(Math.max(0, (s.finance ?? 5) - I.treasurer.from) * I.treasurer.taxPerFinance * 100)}%. Already questioning my travel expenses, my lord.`) }
    }
    case 'house_marriage':
      if (p.kind === 'bride') return { icon: 'flower', title: L(`${p.from} hanedanından gelin geldi`, `A bride from the house of ${p.from}`), text: L(`${p.from} hanedanının prensesi ${p.name} sarayına geldi. İki hanedan artık akraba; ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı. Çeyiz sandıklarını ben taşıdım, lordum; sırtımda bir hanedan kadar yük vardı.`, `${p.name}, princess of the house of ${p.from}, has come to your palace. The two houses are now kin; your relations rose by ${balance.dynasty.intrigue.marriage.lord.relation}. I carried the dowry chests, my lord; a whole dynasty's weight on my back.`) }
      if (p.kind === 'crown') return { icon: 'flower', title: L(`Prenses ${p.name} ${crown(p.crown)} sarayında`, `Princess ${p.name} at the court of ${crown(p.crown)}`), text: L(`Prenses ${p.name} ${crown(p.crown)} hükümdar ailesine gelin gitti. Taçla ilişkin +${balance.dynasty.intrigue.marriage.crown.relation} arttı; bundan sonra taç seni hep biraz daha yakın tutar. Düğünde hükümdarın yanına oturdum; tamamen yanlışlıkla, tabii.`, `Princess ${p.name} has married into the ruling family of ${crown(p.crown)}. Your relations with the crown rose by ${balance.dynasty.intrigue.marriage.crown.relation}; from now on the crown will always hold you a little closer. At the wedding I sat next to the ruler; entirely by mistake, of course.`) }
      return p.free
        ? { icon: 'crown', title: L(`${p.town} artık senin!`, `${p.town} is yours now!`), text: L(`Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti; kasaba kılıç çekilmeden sana bağlandı, yalnızca kadeh kalktı. Sadakati %${balance.dynasty.intrigue.marriage.town.freeLoyalty} ile başlıyor, prenses orada kaldıkça +${balance.dynasty.intrigue.marriage.town.loyalty}.${overreachNote(online, 0)}`, `Princess ${p.name} has married into the leading family of ${p.town}; the town joined you without a sword drawn, only glasses raised. Its loyalty starts at ${balance.dynasty.intrigue.marriage.town.freeLoyalty}%, +${balance.dynasty.intrigue.marriage.town.loyalty} while the princess stays there.${overreachNote(online, 0)}`) }
        : { icon: 'flower', title: L(`Prenses ${p.name} ${p.town} kasabasında`, `Princess ${p.name} in ${p.town}`), text: L(`Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti. Kasabanın sadakat hedefi kalıcı olarak +${balance.dynasty.intrigue.marriage.town.loyalty}. Kasabalılar hâlâ düğünü konuşuyor; benim dansımı özellikle.`, `Princess ${p.name} has married into the leading family of ${p.town}. The town's loyalty target is permanently +${balance.dynasty.intrigue.marriage.town.loyalty}. The townsfolk still talk of the wedding; of my dancing especially.`) }
    case 'pretender_rise':
      return {
        icon: 'swords',
        title: L(`Kardeşin ${p.name} isyan etti!`, `Your brother ${p.name} has rebelled!`),
        text: L(`${p.name} tahtı istiyor; aile meclisi biraz sertleşti, lordum. ${Number(p.deserters) > 0 ? `Garnizonundan ${p.deserters} asker ona katıldı; ` : ''}${p.soldiers} asiyle sınırının yakınında bir karargâh kurdu. ${p.minutes} dakika içinde karargâhı kuşatıp dağıtmazsan büyüyüp sarayını kuşatacak; kuşatmayı kaybedersen tahtı o alır.${
          p.backed ? ` Kötü haber: ${crown(p.crown)} onu senden çok seviyor ve onu destekliyor; karargâh daha hızlı büyüyecek.` : p.crown !== null && p.crown !== undefined ? ` ${crown(p.crown)} şimdilik senin yanında; ondan asker ya da altın isteyebilirsin.` : ''
        } Saray → Hanedan'dan ordu gönderebilirsin.`, `${p.name} wants the throne; the family council got a little heated, my lord. ${Number(p.deserters) > 0 ? `${p.deserters} ${Number(p.deserters) === 1 ? 'soldier' : 'soldiers'} from your garrison joined him; ` : ''}he has set up camp near your border with ${p.soldiers} rebels. If you do not besiege and scatter the camp within ${p.minutes} minutes, it will grow and besiege your palace; lose that siege and he takes the throne.${
          p.backed ? ` Bad news: ${crown(p.crown)} likes him more than you and backs him; the camp will grow faster.` : p.crown !== null && p.crown !== undefined ? ` ${crown(p.crown)} is on your side for now; you can ask it for soldiers or gold.` : ''
        } You can send an army from Palace → Dynasty.`),
      }
    case 'pretender_grow':
      return p.soon
        ? { icon: 'warn', title: L(`${p.name} yürümeye hazırlanıyor`, `${p.name} prepares to march`), text: L(`Taht davacısının karargâhında ${p.soldiers} asi var. ${p.minutes} dakika sonra sarayını kuşatacak; ya karargâhı şimdi dağıt ya da garnizonunu, kulelerini ve surlarını hazırla. Ben değerli eşyaları mahzene taşımaya başladım; önce kendiminkileri.`, `There are ${p.soldiers} rebels in the pretender's camp. In ${p.minutes} minutes he will besiege your palace; either scatter the camp now or ready your garrison, towers and walls. I have started moving the valuables to the cellar; my own first.`) }
        : { icon: 'warn', title: L(`${p.name} karargâhı büyüyor`, `The camp of ${p.name} is growing`), text: L(`Karargâha her gün yeni asiler katılıyor: ${p.soldiers} asi${p.backed ? ', tacın desteğiyle' : ''}. ${p.minutes} dakika sonra sarayına yürüyecek. Dedikoduya göre onların kampında yemek bizimkinden iyiymiş, lordum; bunu ben söylemedim.`, `New rebels join the camp every day: ${p.soldiers} rebels${p.backed ? ', with the crown\'s backing' : ''}. In ${p.minutes} minutes he will march on your palace. Rumour has it the food in their camp is better than ours, my lord; you did not hear it from me.`) }
    case 'pretender_aid':
      if (!p.granted)
        return p.why === 'backed'
          ? { icon: 'unhappy', title: L(`${crown(p.crown)} yardım etmedi`, `${crown(p.crown)} refused to help`), text: L(`${crown(p.crown)} hükümdarı kardeşin ${p.name}'i senden çok seviyor; yardım istemeni geri çevirdi ve davacıyı destekliyor. Sarayda kardeşine kadeh kaldırıyorlarmış, lordum; ben duymadım say.`, `The ruler of ${crown(p.crown)} likes your brother ${p.name} more than you; he turned down your plea for help and backs the pretender. They are raising toasts to your brother at court, my lord; pretend I never told you.`) }
          : { icon: 'unhappy', title: L(`${crown(p.crown)} yardım etmedi`, `${crown(p.crown)} refused to help`), text: L(`${crown(p.crown)} seninle ilişkisini yardım edecek kadar iyi görmüyor (en az ${balance.dynasty.intrigue.aid.minRelation} gerekir). Siparişler ve görevlerle tacın gözüne gir. Taç dalkavukluktan hoşlanır, lordum; ben bu işin ustasıyım.`, `${crown(p.crown)} does not think well enough of you to help (at least ${balance.dynasty.intrigue.aid.minRelation} is needed). Win the crown's favour with orders and tasks. The crown loves flattery, my lord; and I am a master of the art.`) }
      return p.kind === 'troops'
        ? { icon: 'shield', title: L(`${crown(p.crown)} asker gönderdi`, `${crown(p.crown)} sent soldiers`), text: L(`Tacın askerleri ${p.name}'in karargâhına baskın yaptı: ${p.troops} asi düştü. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı. Taç işini bilir, lordum; hesabını da.`, `The crown's soldiers raided the camp of ${p.name}: ${p.troops} rebels fell. Your relations with the crown dropped by ${balance.dynasty.intrigue.aid.relationCost}. The crown knows its business, my lord; and its accounts.`) }
        : { icon: 'gold', title: L(`${crown(p.crown)} altın gönderdi`, `${crown(p.crown)} sent gold`), text: L(`Taç isyana karşı hazinene ${p.gold} altın gönderdi. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı. Saydım, lordum; taç cimri değilmiş, ama cömert de sayılmaz.`, `The crown sent ${p.gold} gold to your treasury against the revolt. Your relations with the crown dropped by ${balance.dynasty.intrigue.aid.relationCost}. I counted it, my lord; the crown is not stingy, but you could not call it generous.`) }
    case 'pretender_crushed':
      return { icon: 'crown', title: L('İsyan bastırıldı', 'Revolt crushed'), text: L(`Taht davacısı ${p.name}'in karargâhı dağıtıldı; ${p.name} savaşta öldü. Hanedan bir süre sakin kalacak. Aile sofrası biraz boş kalacak, lordum; ama huzurlu.${betrayalNote(p.offer, crown)}`, `The camp of the pretender ${p.name} has been scattered; ${p.name} died in battle. The house will be quiet for a while. The family table will be a little emptier, my lord; but peaceful.${betrayalNote(p.offer, crown)}`) }
    case 'pretender_siege':
      return { icon: 'swords', title: L(`${p.name} sarayını kuşatıyor!`, `${p.name} besieges your palace!`), text: L(`Karargâh zamanında dağıtılamadı: ${p.name} ${p.soldiers} asiyle sarayına yürüdü. Karşısında ${p.garrison} asker, kuleler ve surlar var. Kuşatmayı kaybedersen tahtı o alır. Ben surlarda moral veriyorum, lordum; en arkadan, çok yüksek sesle.`, `The camp was not scattered in time: ${p.name} marched on your palace with ${p.soldiers} rebels. Against him stand ${p.garrison} ${Number(p.garrison) === 1 ? 'soldier' : 'soldiers'}, towers and walls. Lose the siege and he takes the throne. I am raising morale on the walls, my lord; from the very back, very loudly.`) }
    case 'throne_held':
      return { icon: 'crown', title: L('Taht korundu', 'Throne held'), text: L(`Sarayın taht davacısı ${p.name}'in kuşatmasına dayandı; ${p.name} düştü, asileri dağıldı. Mahzenden çıktım, lordum; zafer kutlamasına hazırım, kadehim de.${betrayalNote(p.offer, crown)}`, `Your palace withstood the siege of the pretender ${p.name}; ${p.name} fell and his rebels scattered. I have come out of the cellar, my lord; ready for the victory feast, glass in hand.${betrayalNote(p.offer, crown)}`) }
    case 'throne_lost':
      return { icon: 'unhappy', title: L(`Tahtı ${p.name} aldı`, `${p.name} has taken the throne`), text: L(`${p.name} sarayı ele geçirdi. Hükümdar ${p.old || '?'} tahttan indirildi ve öldü; kraliçesi saraydan gitti, çocukları artık yeni hükümdarın yeğenleri. Hanedan ${p.name} ile sürüyor: yeni bir kraliçe alman gerekecek. Ben de yeni hükümdara aynı derin reveransı yaptım, lordum; mesleğim bu.`, `${p.name} has seized the palace. Ruler ${p.old || '?'} was deposed and died; his queen has left the palace and his children are now the new ruler's nephews and nieces. The house carries on with ${p.name}: you will need to take a new queen. I made the same deep bow to the new ruler, my lord; it is my profession.`) }
    // The crowns' houses and the lord's fealty (CLAUDE.md §7.8, §9.1.1).
    case 'crown_succession': {
      const regent = p.regent ? L(` Yeni hükümdar henüz ${p.age} yaşında; reşit olana dek ${p.regent === true ? 'naipler meclisi' : `naip ${p.regent}`} yönetecek. Tahtta ayakları yere değmiyor, lordum.`, ` The new ruler is only ${p.age}; until of age, ${p.regent === true ? 'a council of regents' : `the regent ${p.regent}`} will rule. The throne is so tall the little ruler's feet do not reach the floor, my lord.`) : ''
      const kin = p.kinsman ? L(' Ölen hükümdarın yaşayan çocuğu yoktu; taht hanedandan bir akrabaya geçti. Uzak bir kuzen, lordum; o kadar uzak ki kendisi de şaşırmış.', ' The late ruler had no living children; the throne passed to a kinsman of the house. A distant cousin, my lord; so distant he was surprised himself.') : ''
      return {
        icon: 'crown',
        title: L(`${crown(p.crown)}: ${p.ruler} tahtta`, `${crown(p.crown)}: ${p.ruler} on the throne`),
        text: L(`${crown(p.crown)} yasta: ${p.late} ${p.lateAge} yaşında öldü. Cenazede en içten ağlayan bendim, lordum; çok iyi ağlarım. Yeni hükümdar ${p.ruler} (huyu: ${String(p.trait).toLocaleLowerCase(locale())}).${kin}${regent}${welcomeNote(p, online)} Yeni hükümdarın huyu tacın haraççılarının istediğini ve devriyesinin bahşişini biraz değiştirebilir; Diplomasi → Krallık'ta ayrıntısı var.`, `${crown(p.crown)} is in mourning: ${p.late} died aged ${p.lateAge}. I wept the most sincerely at the funeral, my lord; I am a very good weeper. The new ruler is ${p.ruler} (temper: ${String(p.trait).toLocaleLowerCase(locale())}).${kin}${regent}${welcomeNote(p, online)} The new ruler's temper may change a little what the crown's tribute collectors demand and what its patrol leaves in tips; details under Diplomacy → Kingdom.`),
      }
    }
    case 'crown_rivalry': {
      const names = online.crowns
      const both = L(`${names[0] ?? 'Birinci taç'} ile ${names[1] ?? 'ikinci taç'}`, `${names[0] ?? 'The first crown'} and ${names[1] ?? 'the second crown'}`)
      const fx = balance.cities.crown.rivalry.effects
      if (p.stance === 'war')
        return { icon: 'swords', title: L('Taçlar savaşta!', 'The crowns are at war!'), text: L(`${both} birbirine savaş açtı. Savaş sürdükçe haraççılar hazinenin ×${String(fx.war.tribute).replace('.', ',')}'i kadarını ister, taçlar kendi lordlarını kollar (devriyenin bahşişi ×${String(fx.war.tip).replace('.', ',')}). Fil kavga eder, çimen ezilir, lordum; çimen biziz.`, `${both} have declared war on each other. While the war lasts, tribute collectors ask ×${fx.war.tribute} their usual share of your treasury and the crowns favour their own lords (patrol tips ×${fx.war.tip}). When elephants fight, the grass gets trampled, my lord; we are the grass.`) }
      const won = p.winner !== null && p.winner !== undefined ? Number(p.winner) : null
      const mine = won !== null && online.kingdoms.find((k) => k.id === online.me)?.liege === won
      if (p.prev === 'war')
        return {
          icon: won !== null ? 'crown' : 'flower',
          title: won !== null ? L(`${crown(won)} taç savaşını kazandı`, `${crown(won)} won the crown war`) : L('Taç savaşı bitti', 'The crown war is over'),
          text: L(`${both} arasındaki savaş bitti${p.stance === 'tension' ? ', ama gerginlik sürüyor' : ''}.${won !== null ? ` Zafer ${crown(won)} tacının.` : ''}${mine ? ` Bağlı olduğun tacın zaferi seni de gururlandırdı: onunla ilişkin +${balance.cities.crown.rivalry.victoryRelation}.` : ''} Ben iki tarafa da tebrik mektubu yazdım, lordum; garanti olsun.`, `The war between ${both} is over${p.stance === 'tension' ? ', but the tension remains' : ''}.${won !== null ? ` Victory goes to ${crown(won)}.` : ''}${mine ? ` Your crown's victory made you proud too: your relations with it +${balance.cities.crown.rivalry.victoryRelation}.` : ''} I wrote letters of congratulation to both sides, my lord; just to be safe.`),
        }
      return p.stance === 'tension'
        ? {
            icon: 'warn',
            title: L('Taçlar arasında gerginlik', 'Tension between the crowns'),
            text: L(`${vary(n, [`${both} arasında gerginlik var`, `${both} elçilerini geri çağırdı`, `${both} sınırlarına asker yığıyor`, `${both} arasında soğuk rüzgârlar esiyor`, `${both} ziyafette birbirine sırtını döndü`])}: haraççılar biraz daha çok ister. Sinirli taç, aç taç demektir, lordum.`, `${vary(n, [`There is tension between ${both}`, `${both} have recalled their envoys`, `${both} are massing troops on their borders`, `Cold winds blow between ${both}`, `${both} turned their backs on each other at the banquet`])}: tribute collectors will ask a little more. A cross crown is a hungry crown, my lord.`),
          }
        : {
            icon: 'flower',
            title: L('Taçlar barıştı', 'The crowns have made peace'),
            text: vary(n, [
              L(`${both} arasındaki gerginlik yatıştı. Kimin haklı olduğunu hâlâ kimse bilmiyor, lordum.`, `The tension between ${both} has eased. Still nobody knows who was right, my lord.`),
              L(`${both} elçileri yeniden kadeh tokuşturuyor; gerginlik yatıştı. Ben de araya girip bir kadeh kaptım.`, `The envoys of ${both} are clinking glasses again; the tension has eased. I squeezed in between and grabbed a glass myself.`),
              L(`${both} arasında rüzgâr dindi; barış sürüyor.`, `The wind has dropped between ${both}; the peace holds.`),
              L(`${both} birbirine hediyeler gönderdi; gerginlik geride kaldı. Hediyelerin ikisi de çirkindi, ama niyet önemli.`, `${both} sent each other gifts; the tension is behind them. Both gifts were hideous, but it is the thought that counts.`),
            ]),
          }
    }
    case 'liege_switch':
      return p.accept
        ? { icon: 'banner', title: L(`Artık ${crown(p.to)} lordusun`, `You are now a lord of ${crown(p.to)}`), text: L(`${crown(p.from)} kardeşin ${p.name}'i sana karşı destekledi; sen de sancağını ${crown(p.to)} tarafına çevirdin. ${crown(p.to)} seni kollarını açarak karşıladı (ilişki en az +${balance.cities.crown.switch.newRelation}); ${crown(p.from)} bunu unutmayacak (ilişki en çok ${balance.cities.crown.switch.oldRelation}). Devriyeler ve haraççılar bundan sonra yeni bağlılığına göre gelir. Eski sancağı katlayıp sakladım, lordum; belli olmaz.`, `${crown(p.from)} backed your brother ${p.name} against you; so you turned your banner to ${crown(p.to)}. ${crown(p.to)} welcomed you with open arms (relations at least +${balance.cities.crown.switch.newRelation}); ${crown(p.from)} will not forget this (relations at most ${balance.cities.crown.switch.oldRelation}). From now on patrols and tribute collectors come according to your new allegiance. I folded the old banner and put it away, my lord; one never knows.`) }
        : { icon: 'gold', title: L(`${crown(p.from)} özür diledi`, `${crown(p.from)} apologised`), text: L(`${crown(p.from)} hanesine sadık kalmana çok sevindi: davacıyı desteklediği için özür diledi${Number(p.gold) > 0 ? `, hazinene ${fmt(Number(p.gold))} altın gönderdi` : ''} ve ilişkin +${balance.cities.crown.switch.declineRelation} arttı. Özür mektubu üç sayfaydı, lordum; ikisi kendini övüyordu.`, `${crown(p.from)} was delighted that you stayed loyal to its house: it apologised for backing the pretender${Number(p.gold) > 0 ? `, sent ${fmt(Number(p.gold))} gold to your treasury` : ''} and your relations rose by ${balance.cities.crown.switch.declineRelation}. The apology ran to three pages, my lord; two of them praising itself.`) }
    case 'liege_changed':
      return {
        icon: 'banner',
        title: L(`${p.by} taraf değiştirdi`, `${p.by} changed sides`),
        text: vary(n, [
          L(`${p.by}, kendisine karşı bir taht davacısını desteklediği için ${crown(p.from)} hanesinden ayrıldı ve ${crown(p.to)} tarafına geçti. Sancak terzileri bu sezon çok kazanıyor, lordum.`, `${p.by} left the house of ${crown(p.from)}, which had backed a pretender against them, and went over to ${crown(p.to)}. The banner tailors are doing very well this season, my lord.`),
          L(`${p.by} sancağını indirip yenisini çekti: ${crown(p.from)} kendisine karşı taht davacısını desteklemişti, şimdi ${crown(p.to)} lordu.`, `${p.by} lowered their banner and raised a new one: ${crown(p.from)} had backed a pretender against them; now they are a lord of ${crown(p.to)}.`),
          L(`${crown(p.from)} ${p.by} karşısında bir davacıyı tuttu; ${p.by} de ${crown(p.to)} tarafına geçerek karşılık verdi. Saray dedikodusu için harika bir hafta.`, `${crown(p.from)} backed a pretender against ${p.by}; ${p.by} answered by going over to ${crown(p.to)}. A splendid week for court gossip.`),
          L(`Saraylarda tek konu bu: ${p.by}, ${crown(p.from)} ihanetinden sonra ${crown(p.to)} tarafına geçti. Ben ilk duyanlardanım, lordum; ilk yayanlardan da.`, `The only talk at court: ${p.by} went over to ${crown(p.to)} after the betrayal of ${crown(p.from)}. I was among the first to hear, my lord; and the first to spread it.`),
        ]),
      }
    default:
      // A kind this page does not know yet: the game was updated while it was open.
      return { icon: 'scroll', title: L('Elçiden haber', 'News from the envoy'), text: L('Oyun güncellendi; bu haberi okumak için sayfayı yenile. Ben de okuyamadım, lordum; yazısı fazla yeni.', 'The game has been updated; reload the page to read this news. I could not read it either, my lord; the writing is too new.') }
  }
}

export function EnvoyDialog({ notice, online, onClose }: { notice: Notice; online: Online; onClose: () => void }) {
  const { icon, title, text } = describe(notice, online)
  const p = notice.payload as Record<string, unknown>
  const pending = notice.kind === 'envoy_proposal' && online.envoys.some((e) => e.id === p.envoy && e.status === 'pending')
  // A rival crown's demand, answerable until it runs out.
  const demand = notice.kind === 'patrol_tribute' && Number(p.expiresAt) > Date.now()
  const battle = notice.kind.startsWith('battle') || notice.kind === 'pretender_siege' ? (p.battle as number) : null
  const look = noticeLook(notice, online)
  // Talking with the tribute collectors' captain (for this notice): the picture and the demand step aside so the
  // dialog stays short while the talk goes one exchange at a time.
  const [talkFor, setTalkFor] = useState<number | null>(null)
  const talking = demand && talkFor === notice.id
  // Each notice's own sound, once, as its dialog opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => playOnce(`notice:${notice.id}`, soundForNotice(notice, online)), [notice.id])
  return (
    <div className="modal" role="dialog" aria-labelledby="envoy-title">
      <section className={`dialog frame fortune-dialog envoy-dialog ${look.tone}`}>
        <header className="fortune-banner">
          <span className="envoy-face">
            <EnvoyPortrait size={44} />
          </span>
          <div>
            <small>
              <Icon name={icon} size={16} /> {L('Elçi haber getirdi', 'The envoy brings news')}
            </small>
            <h2 id="envoy-title">{title}</h2>
          </div>
        </header>
        {!talking && (
          <div className="fortune-art">
            <NoticeArt look={look} />
          </div>
        )}
        <div className="fortune-body">
          {text && !talking && <p>{text}</p>}
          {demand ? (
            <TributeAnswer
              key={notice.id}
              online={online}
              visit={p.visit as number}
              asked={Number(p.amount)}
              color={CROWN_COLORS[Number(p.crown ?? 0) % CROWN_COLORS.length]}
              talking={talking}
              onTalk={() => setTalkFor(notice.id)}
              onClose={onClose}
            />
          ) : (
            pending ? (
              <DialogFoot label={L("Kabul et", 'Accept')} onNext={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: true }), onClose())}>
                <button className="btn small danger" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: false }), onClose())}>
                  {L('Reddet', 'Refuse')}
                </button>
              </DialogFoot>
            ) : (
              <DialogFoot onNext={onClose}>
                {battle !== null && (
                  <button className="btn small" onClick={() => (online.watch(battle), onClose())}>
                    <Icon name="swords" size={16} /> {L('İzle', 'Watch')}
                  </button>
                )}
              </DialogFoot>
            )
          )}
        </div>
      </section>
    </div>
  )
}

// A rival crown's demand at the gate (CLAUDE.md §7.8): refuse, pay, or first have a word with the collectors' captain.
// The talk is drawn from the lobby seed and the visit, so it is the same here as on the server, which works out again
// what the replies did to the demand. Once a visit. While talking, the dialog shows one exchange at a time, as the
// envoy advisor does: the captain's portrait, his line typed out with his voice, and the three replies.
function TributeAnswer({
  online,
  visit,
  asked,
  color,
  talking,
  onTalk,
  onClose,
}: {
  online: Online
  visit: number
  asked: number
  // The crown's colour (interface hex), for the captain's crest and tabard.
  color: string
  talking: boolean
  onTalk: () => void
  onClose: () => void
}) {
  const seed = online.lobby.seed
  const [amount, setAmount] = useState(asked)
  // Null until known whether the captain has been talked to already (the dialog may have been closed and opened again).
  const [talked, setTalked] = useState<boolean | null>(null)
  const [angry, setAngry] = useState(false)
  const [replies, setReplies] = useState<number[]>([])
  // His answer to the last reply is on screen (with "Devam"), not yet the next thing he says.
  const [reacting, setReacting] = useState(false)
  const [sending, setSending] = useState(false)
  useEffect(() => {
    let live = true
    supabase
      .from('patrol_visits')
      .select('amount, talk')
      .eq('id', visit)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return
        if (data?.talk) {
          setAmount(Number(data.amount))
          setAngry(!!(data.talk as { angry?: boolean }).angry)
        }
        setTalked(!!data?.talk)
      })
    return () => {
      live = false
    }
  }, [visit])
  const script = tributeTalkScript(seed, visit)
  const outcome = tributeTalk(seed, visit, replies)
  const answer = (pay: boolean) => (online.act({ type: 'patrolAnswer', visit, pay }), onClose())
  const pick = (r: number) => {
    const next = [...replies, r]
    setReplies(next)
    setReacting(true)
    const done = tributeTalk(seed, visit, next)
    if (!done) return
    setSending(true)
    online
      .act<{ amount: number; angry: boolean }>({
        type: 'patrolAnswer',
        visit,
        talk: next,
      })
      .then((res) => {
        setSending(false)
        setTalked(true)
        if (res) {
          setAmount(res.amount)
          setAngry(res.angry)
        }
      })
  }
  const refusal = -Math.round(balance.cities.crown.patrol.refuseRelation * (angry ? balance.cities.crown.patrol.tribute.talk.angryRefuseFactor : 1))
  const buttons = (
    <DialogFoot label={L(`${fmt(amount)} altın öde`, `Pay ${fmt(amount)} gold`)} disabled={sending} why={L("Cevabın haraççılara iletiliyor", 'Your answer is being passed to the collectors')} onNext={() => answer(true)}>
      <button className="btn small danger" onClick={() => answer(false)}>
        {L('Reddet', 'Refuse')}
      </button>
      {talked === false && !talking && (
        <button className="btn small" onClick={onTalk}>
          <Icon name="scroll" size={16} /> {L('Konuş', 'Talk')}
        </button>
      )}
    </DialogFoot>
  )
  if (!talking) {
    return (
      <div className="tribute-answer">
        {talked && amount !== asked && (
          <p className="muted">
            {L(`Haraççıyla konuştun: istenen ${fmt(asked)} değil, ${fmt(amount)} altın.`, `You talked with the collector: he now asks ${fmt(amount)} gold, not ${fmt(asked)}.`)}
            {angry ? L(` Kızgın gitti; reddedersen o tacın lordlarıyla ilişkin ${refusal} düşer.`, ` He left angry; refuse and your relations with that crown's lords drop by ${refusal}.`) : ''}
          </p>
        )}
        {buttons}
      </div>
    )
  }
  // One exchange at a time: the greeting with his first question, then each question; after a reply, his answer
  // (and, at the end, his last word).
  const total = script.exchanges.length
  const at = replies.length
  const index = reacting ? at - 1 : at
  const reaction = reacting && at > 0 ? tributeTalkReact(seed, visit, at - 1, script.exchanges[at - 1].replies[replies[at - 1]].points) : ''
  const line = outcome
    ? `“${reaction}”\n\n“${outcome.line}”`
    : reacting
      ? `“${reaction}”`
      : at === 0
        ? `“${script.greet}”\n\n“${script.exchanges[0].say}”`
        : `“${script.exchanges[at].say}”`
  const choices = !outcome && !reacting ? script.exchanges[at].replies : []
  return (
    <TalkPanel color={color} name={script.name} label={script.label} step={`${Math.min(index, total - 1) + 1}/${total}`} line={line}>
      {(done) =>
        outcome ? (
          <div className="tribute-answer" style={{ visibility: done ? 'visible' : 'hidden' }}>
            <p className="muted">
              {sending
                ? L('Haraççı defterine bir şeyler karalıyor…', 'The collector is scribbling something in his ledger…')
                : amount < asked
                  ? L(`Haraç ${fmt(asked)} altından ${fmt(amount)} altına indi.`, `The tribute fell from ${fmt(asked)} to ${fmt(amount)} gold.`)
                  : amount > asked
                    ? L(`Haraç ${fmt(asked)} altından ${fmt(amount)} altına çıktı.${angry ? ` Kızgın: reddedersen o tacın lordlarıyla ilişkin ${refusal} düşer.` : ''}`, `The tribute rose from ${fmt(asked)} to ${fmt(amount)} gold.${angry ? ` He is angry: refuse and your relations with that crown's lords drop by ${refusal}.` : ''}`)
                    : L(`Haraç aynı kaldı: ${fmt(amount)} altın.`, `The tribute stays the same: ${fmt(amount)} gold.`)}
              {!sending && L(` Cevapsız bırakırsan oyundayken ${fmt(Math.round(amount * balance.cities.crown.patrol.tribute.afkFactor))} altın olarak kendiliğinden ödenir.`, ` Leave it unanswered while you are in the game and ${fmt(Math.round(amount * balance.cities.crown.patrol.tribute.afkFactor))} gold is paid automatically.`)}
            </p>
            {buttons}
          </div>
        ) : reacting ? (
          <div className="advisor-replies">
            <button className="btn small primary" disabled={!done} data-why={L("Haraççı sözünü bitirsin", 'Let the collector finish speaking')} onClick={() => setReacting(false)}>
              {L('Devam', 'Continue')}
            </button>
          </div>
        ) : (
          // Three short replies side by side; stacked when any is long.
          <div className={`talk-replies ${choices.some((r) => r.text.length > 46) ? 'stacked' : 'choices'}`} style={{ visibility: done ? 'visible' : 'hidden' }}>
            {choices.map((r, j) => (
              <button key={j} className="btn small talk-reply" disabled={!done} data-why={L("Haraççı sözünü bitirsin", 'Let the collector finish speaking')} onClick={() => pick(j)}>
                {r.text}
              </button>
            ))}
          </div>
        )
      }
    </TalkPanel>
  )
}

// The captain speaking: his portrait, his name and temper, the step of the talk, and his line typed out letter by letter
// with a gruff mumble under it (the envoy advisor's typing and voice). A tap on the line shows it whole.
function TalkPanel({ color, name, label, step, line, children }: { color: string; name: string; label: string; step: string; line: string; children: (done: boolean) => ReactNode }) {
  const { shown, done, finish } = useTyping(line)
  useBabble(line, shown, 0.8)
  const paragraphs = [...line].slice(0, shown).join('').split('\n\n')
  return (
    <div className="tribute-talk">
      <div className="advisor-face">
        <CollectorPortrait color={color} size={72} talking={!done} />
      </div>
      <div className="advisor-talk">
        <header>
          <small>
            <b>{name}</b> · {label}
          </small>
          <small className="talk-step">{step}</small>
        </header>
        <div className="advisor-bubble" onClick={finish}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <span className="sr-only">{line}</span>
        </div>
        {children(done)}
      </div>
    </div>
  )
}
