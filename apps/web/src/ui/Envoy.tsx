import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { balance, overreachOf, tributeTalk, tributeTalkReact, tributeTalkScript } from '@game/shared'
import { supabase } from '../lib/supabase'
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

const fmt = (v: number) => Math.round(v).toLocaleString('tr-TR')

// Goods by name and amount ("40 yemek, 12 savaş malzemesi").
const goodsText = (goods: unknown) =>
  Object.entries((goods ?? {}) as Record<string, number>)
    .filter(([, v]) => v > 0)
    .map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? g}`)
    .join(', ')

// What the insulting envoy says at the gate (one of these, by the envoy's number).
const INSULTS = [
  'Efendim der ki: kralınızın sakalı keçininkinden seyrek, ordunuz da tavuk kümesinden düzensiz!',
  'Efendim der ki: sarayınızın kokusu üç vadi öteden duyuluyor; hamamı hiç mi duymadınız?',
  'Efendim der ki: atalarınız domuz güderdi, siz ise onları bile güdemezsiniz!',
  'Efendim der ki: sancağınızı gördük, sandık ki çamaşır asmışsınız.',
  'Efendim der ki: askerleriniz tahta kılıçla bile birbirini yaralar!',
  'Efendim der ki: hazineniz fare yuvasından boş, tüccarınız da dilenciden fakir.',
  'Efendim der ki: kralınız ata binemez, eşeği bile ondan utanır!',
  'Efendim der ki: surlarınızı çocuklar bile kumdan daha sağlam yapar.',
]


// Over-expansion (CLAUDE.md §8.4) as a town is besieged or taken: what holding `more` towns beyond those held now costs.
function overreachNote(online: Online, more: number) {
  const held = online.towns.filter((t) => t.owner === online.me).length + more
  const o = overreachOf(held)
  if (o.tier < 0) return ''
  const last = o.tier >= balance.towns.overreach.tiers.length - 1
  return ` Hatırlatmak bana düşer, lordum: ${more > 0 ? 'alırsan' : 'artık'} elinde ${held} kasaba ${more > 0 ? 'olur' : 'var'}. Aşırı büyüme her kasabanın sadakatini ${o.loyalty}${o.loyaltyCap < 100 ? ` düşürür ve %${o.loyaltyCap}'in üstüne çıkmasına izin vermez` : ' düşürür'}, halkının mutluluğu ${o.happiness}, bakım ×${String(o.upkeepFactor).replace('.', ',')}.${last ? ' Bu kadar kasabada ayaklanmalar kesindir; ben şimdiden bavulumu hazırlıyorum.' : ''}`
}

// A new ruler's first days (CLAUDE.md §7.8): what his welcome did to the lord sworn to his crown.
function welcomeNote(p: Record<string, unknown>, online: Online) {
  const w = Number(p.welcome ?? 0)
  if (!w || online.kingdoms.find((k) => k.id === online.me)?.liege !== Number(p.crown)) return ''
  return w > 0
    ? ` Yeni hükümdar lordlarına yakın davranıyor: ilişkin +${w}. Bana da göz kırptı, yemin ederim.`
    : ` Yeni hükümdar lordlarına mesafeli: ilişkin ${w}. Bana selam bile vermedi; haberin olsun.`
}

// A beaten pretender whose crown had backed him leaves the lord a choice (CLAUDE.md §9.1.1).
function betrayalNote(offer: unknown, crown: (i: unknown) => string) {
  const o = offer as { from?: number; to?: number } | null | undefined
  if (!o || o.from === undefined) return ''
  return ` Ama unutmayalım, lordum: ${crown(o.from)} bu isyanda kardeşinin tarafını tuttu. ${balance.cities.crown.switch.offerMinutes} dakika içinde ${crown(o.to)} tarafına geçebilirsin. Ben iki sancağı da ütületip hazır ettim.`
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

export function describe(n: Notice, online: Online): { icon: IconName; title: string; text: string } {
  const p = n.payload as Record<string, never>
  const kind = (k: unknown) => ENVOY_NAMES[k as EnvoyRow['kind']] ?? String(k)
  const me = online.kingdoms.find((k) => k.id === online.me)?.name
  const crown = (i: unknown) => online.crowns[Number(i)] ?? 'Taç krallığı'
  switch (n.kind) {
    case 'envoy_proposal':
      return {
        icon: 'scroll',
        title: `${p.from} elçisi geldi`,
        text:
          p.kind === 'tribute'
            ? `${p.from} elçisi kapıda, lordum; yüzü de pek pişkin. Her üretim turunda ${p.gold} altın haraç istiyor. Kabul edersen ilişkiniz ${balance.diplomacy.tribute.accept} düşer; reddedersen ${balance.diplomacy.tribute.reject} düşer. Yani iki yol da yokuş aşağı; ben olsam bugün hiç kalkmazdım yataktan.`
            : p.kind === 'alliance'
              ? `${p.from} seninle ittifak kurmak istiyor, lordum. Müttefik orduları birbirini korur; yani bir dahaki savaşta arkasına saklanacağımız bir ordu daha olur.`
              : p.kind === 'marriage'
                ? `${p.from}, ${(p.terms as { name?: string } | null)?.name ?? 'bir'} adlı prensesini (${(p.terms as { age?: number } | null)?.age ?? '?'} yaşında) senin hanedanına gelin vermek istiyor. Kabul edersen prenses sarayına gelir ve ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} artar. Düğün yemeğini ben ayarlarım, lordum; tadına bakmak da bana düşer, ne yapalım.`
                : `${p.from} savaşı bitirmek için barış teklif ediyor: ${describeTerms(p.terms as PeaceTerms | null)}. Elçileri beyaz bayrağı biraz fazla coşkuyla sallıyor, lordum; gözümü çıkaracaktı.`,
      }
    case 'envoy_courtesy':
      return p.kind === 'gift'
        ? {
            icon: 'gold',
            title: `${p.from} hediye gönderdi`,
            text: vary(n, [
              `${p.gold} altın hazinene eklendi; ilişkiniz iyileşti. Bir tanesini ısırıp denedim, lordum: sahici.`,
              `${p.from} elçisi bir sandık bıraktı: içinden ${p.gold} altın çıktı. Sandığı ben taşıdım; belim hâlâ itiraz ediyor. İlişkiniz iyileşti.`,
              `Kapıya mühürlü bir kese geldi: ${p.gold} altın, ${p.from} hediyesi. İlişkiniz iyileşti; elçileri de pek kibardı, benim kadar olmasa da.`,
              `${p.from} cömert davrandı: ${p.gold} altın hazinene girdi ve aranız ısındı. Yakında bir şey isteyecekler, lordum; ben bu gülümsemeyi bilirim.`,
            ]),
          }
        : {
            icon: 'scroll',
            title: `${p.from} elçisi geldi`,
            text: vary(n, [
              `${p.from} ilişkilerinizi geliştirmek istiyor (+${balance.diplomacy.improve.gain}). Elçileri bana da iltifat etti; zevk sahibi bir adam.`,
              `${p.from} elçisi selam ve güzel sözler getirdi; ilişkiniz +${balance.diplomacy.improve.gain}. Sözler bedava, lordum, ama bak işe yarıyor.`,
              `${p.from} dostluk elçisi yolladı: iltifatlar, reveranslar ve +${balance.diplomacy.improve.gain} ilişki. Eğilirken beli tutuldu; halinden en iyi ben anlarım.`,
              `${p.from} aranızın iyi olmasını istiyor; elçisi bunu üç kez söyledi, ben de üç kez başımı salladım. İlişkiniz +${balance.diplomacy.improve.gain}.`,
            ]),
          }
    case 'envoy_answer':
      return {
        icon: p.accepted ? 'happy' : 'unhappy',
        title: `${p.by}: ${kind(p.kind)} ${p.accepted ? 'kabul edildi' : p.expired ? 'cevapsız kaldı' : 'reddedildi'}`,
        text: p.accepted
          ? p.kind === 'tribute'
            ? `${p.by} artık her turda ${p.gold} altın ödeyecek. Yüzlerini görmeliydin, lordum; limon yemiş gibiydiler.`
            : p.kind === 'alliance'
              ? vary(n, [
                  `${p.by} artık müttefikin. Sırtımız sağlam, lordum; en azından kâğıt üstünde.`,
                  `${p.by} ittifakı mühürledi; artık ordularınız birbirini korur. Mührü ben bastım, iki kere, emin olmak için.`,
                  `${p.by} elini uzattı: artık müttefiksiniz. Elini sıktım; parmaklarım hâlâ yerinde, sayıyorum.`,
                  `Antlaşma imzalandı: ${p.by} ile artık müttefiksiniz. Ziyafette üç tabak yedim, lordum; diplomatik nezaket.`,
                ])
              : p.kind === 'marriage'
                ? `Prenses ${p.bride} ${p.by} hanedanına gelin gitti. İlişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı. Düğünde ağlayan tek kişi bendim, lordum; mutfakta soğan doğruyorlardı.`
                : vary(n, [
                    'Savaş bitti. Ben zaten hep barıştan yanaydım; özellikle savaş sırasında.',
                    'Kılıçlar kınına girdi; savaş bitti. Benimki hiç çıkmamıştı zaten.',
                    'Barış imzalandı; savaş bitti. Mürekkebi ben getirdim, lordum; kahramanlığım tarihe geçsin.',
                    'Davullar sustu, savaş bitti. Davulcular da sustu, çok şükür.',
                  ])
          : p.kind === 'tribute'
            ? `İlişkiniz ${-balance.diplomacy.tribute.reject} düştü. Elçileri suratını asıp gitti, lordum; atı bile somurtuyordu.`
            : '',
      }
    case 'war_declared':
      return {
        icon: 'swords',
        title: 'Savaş ilan edildi!',
        text: `${p.by} savaş ilan etti${p.on === me ? '; hedef sensin' : ` (hedef: ${p.on})`}${p.claim ? '' : ', hem de hiçbir gerekçe göstermeden; terbiyesizliğin böylesi'}.${p.on === me ? ' Sen kılıcını bilet, lordum; ben de dizlerimi yağlayayım.' : ' Bu sefer bize değil, lordum; ben yine de kapıyı kilitledim.'}`,
      }
    case 'peace_enforced':
      return { icon: 'banner', title: 'Barış dayatıldı', text: `${p.from} savaşı ezici bir üstünlükle kazandı ve barışı dayattı: ${describeTerms(p.terms as PeaceTerms | null)}. Pazarlık payı yoktu, lordum; masa bile kurulmadı.` }
    case 'operation_foiled':
      return { icon: 'eye', title: 'Casus operasyonu önlendi', text: `${p.by} adına ${OPERATION_NAMES[p.op as Operation].toLowerCase()} isteyen bir casus yakalandı. Bıyığı takmaydı, lordum; ilk rüzgârda düştü. Artık onlara karşı savaş gerekçen var.` }
    case 'operation_struck':
      return {
        icon: 'warn',
        title: p.op === 'kidnap' ? 'Kraliçen kaçırıldı!' : p.op === 'revolt' ? 'Halk ayaklandı!' : p.op === 'townRevolt' ? `${p.town ?? 'Kasaban'} kışkırtıldı!` : 'Sabotaj!',
        text:
          p.op === 'townRevolt'
            ? `Kimliği belirsiz kışkırtıcılar ${p.town ?? 'bir kasaban'} halkını sana karşı doldurdu: kasabanın sadakati ${-balance.espionage.operations.townRevolt.loyalty} düştü. Sadakat ${balance.towns.revolt.below}'in altındaysa kasaba ayaklanır; bakımını artırarak gönüllerini kazanabilirsin. Gönül altınla kazanılır, lordum; ben şiirle denedim, olmadı.`
            : p.op === 'kidnap'
            ? `${p.by} casusları kraliçeni kaçırdı. Ben o gece uyuyordum, lordum; stratejik bir uykuydu. Fidye ödeyebilir ya da savaş açabilirsin (savaş gerekçen var).`
            : p.op === 'revolt'
              ? vary(n, [
                  'Kışkırtıcılar halkı ayaklandırdı: üretim bir süre yarıya indi. Köylüler yabalarını tarlaya değil, bize kaldırıyor.',
                  'Meydanlarda öfkeli kalabalıklar toplandı; kışkırtıcıların işi. Üretim bir süre yarıya indi. Ben pencereden izledim, güvenlik gereği.',
                  'Yabancı ağızlar halkın kulağına zehir akıttı: köylüler aletlerini bıraktı, üretim bir süre yarıya indi. Aletleri ben topladım, lordum; kimse teşekkür etmedi.',
                  'Halk ayaklandı; arkasında birilerinin parmağı var. Üretim bir süre yarıya indi. O parmağı bulursak bizzat ben parmakla gösteririm.',
                ])
              : p.op === 'burn'
                ? vary(n, [
                    'Kimliği belirsiz sabotajcılar depolarını ateşe verdi. Ben kovayla koştum, lordum; boş kovayla ama, niyet önemli.',
                    'Gece yarısı ambarların yandı; kaçan gölgeleri kimse tanımadı. Ben birini tanıdım sandım; kendi gölgemmiş.',
                    'Depolarından alevler yükseldi. Yangın kendiliğinden çıkmadı; birileri kıvılcımı getirdi. Biz de ellerimizi ısıttık, ne yapalım.',
                    'Sabotajcılar depolarını yaktı ve karanlığa karıştı. Ambar fareleri de ilk kez evsiz kaldı.',
                  ])
                : vary(n, [
                    'Sabotajcılar inşaatlarını geciktirdi. Ustalar zaten yavaştı; şimdi resmen duruyorlar.',
                    'Şantiyelerinde aletler kayboldu, iskeleler gevşetildi: inşaatların gecikti. Ustabaşı benden şüphelendi, lordum; hakarete bak!',
                    'Biri ustalarının harcına kum karıştırmış; inşaatların gecikti. Harç zaten kumluydu, şimdi plaj oldu.',
                    'Gece şantiyelerine sızanlar oldu; inşaatların gecikecek. Bekçi uyuyordu. Ben de uyuyordum, ama benim mesaim bitmişti.',
                  ]),
      }
    case 'ransom_paid':
      return {
        icon: 'gold',
        title: 'Fidye ödendi',
        text: vary(n, [
          `${p.by} kraliçesi için ${p.gold} altın fidye ödedi. Sayarken iki kez şaşırdım, lordum; keyiften.`,
          `${p.by} sandığı getirdi: ${p.gold} altın. Kraliçeleri hapishanenden çıkıp evine dönüyor; giderken yemeklerimizi övdü, nezaketen.`,
          `Fidye geldi: ${p.by} kraliçesini ${p.gold} altına geri aldı. Bence ucuz kurtardılar, lordum.`,
          `${p.by} kraliçesine kavuşmak için ${p.gold} altın saydı; hapishanenin avlusu yine boş. Gardiyanlar biraz özleyecek.`,
        ]),
      }
    case 'queen_released':
      return {
        icon: 'happy',
        title: 'Kraliçen döndü',
        text: vary(n, [
          `${p.by} kraliçeni serbest bıraktı. İlk sorusu "Elçi beni neden kurtarmaya gelmedi?" olacak, lordum; cevabım hazır, üç sayfa.`,
          `${p.by} hapishanesinin kapısı açıldı; kraliçen sarayına dönüyor. Halıları ben silkeledim.`,
          `Kraliçen eve dönüyor: ${p.by} onu serbest bıraktı. Halk sokaklara döküldü; ben en öndeydim, tamamen tesadüfen.`,
          `${p.by} kraliçeni bıraktı. Saray yeniden şenlenecek; ben de yeniden azar işiteceğim.`,
        ]),
      }
    case 'alliance_broken':
      return {
        icon: 'unhappy',
        title: 'İttifak bozuldu',
        text: vary(n, [
          `${p.by} ittifakınızı bozdu. Zaten hiç hediye getirmezlerdi, lordum.`,
          `${p.by} antlaşmayı yırttı; artık müttefik değilsiniz. Parçaları ben topladım, hatıra olsun.`,
          `${p.by} sana sırtını döndü: ittifak bitti. Sırtları da pek geniş değildi zaten.`,
          `${p.by} elçisi ittifakın bittiğini bildirdi; yüzüne bile bakmadan. Ben de ona bakmadım, ödeştik.`,
        ]),
      }
    case 'tribute_ended':
      return {
        icon: 'gold',
        title: 'Haraç bitti',
        text: p.renege
          ? vary(n, [
              `${p.by} haracı kesti; sözünden döndü. Söz uçar, lordum; altın kalır, o da onlarda kaldı.`,
              `${p.by} artık haraç ödemeyecek; sözünü çiğnedi, üstüne de bastı.`,
              `${p.by} haraç kesesini kapattı ve sözünden döndü. Düğümü de sıkı atmışlar, lordum.`,
              `${p.by} haracı kesti. Söz verip dönen herkesin gözünde küçülür; ben şimdiden herkese anlatmaya başladım.`,
            ])
          : vary(n, [
              `${p.by} haracı bağışladı. Neden diye sorma, lordum; belki vicdanı sızladı, belki dişi.`,
              `${p.by} artık senden haraç istemiyor; bağışladı. Hazinedar sevinçten ağladı.`,
              `${p.by} cömert davrandı: haraç bitti. Merak etme, bu cömertlik bulaşıcı değil.`,
              `${p.by} haraç defterini kapattı; artık ödemeyeceksin. Defteri bana verseler yakardım, emin olmak için.`,
            ]),
      }
    case 'spy_caught':
      return {
        icon: 'eye',
        title: 'Casus yakalandı',
        text: vary(n, [
          `Topraklarında ${p.owner} adına ${TOPIC_NAMES[p.topic as SpyTopic]} bilgisi toplayan bir casus yakalandı. Sahte bıyığı vardı, lordum; hem de ters takmıştı.`,
          `Muhafızların bir yabancıyı ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase('tr-TR')} kayıtlarını kurcalarken yakaladı. Konuştu: ${p.owner} göndermiş. Bir sorduk, hepsini anlattı; sorulmayanları da.`,
          `${p.owner} casusu ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase('tr-TR')} bilgisi toplarken yakalandı. Artık ne aradıklarını biliyorsun; ben zaten hep biliyordum.`,
          `Bir seyisin aslında ${p.owner} casusu olduğu ortaya çıktı; ${TOPIC_NAMES[p.topic as SpyTopic].toLocaleLowerCase('tr-TR')} bilgisi topluyormuş. Atlar zaten ondan şüpheleniyordu.`,
        ]),
      }
    case 'spy_lost':
      return {
        icon: 'eye',
        title: 'Casusun yakalandı',
        text: vary(n, [
          `${p.target} topraklarındaki casusun yakalandı. İlişkiniz bozuldu. Kılık değiştirmeyi bana sorsaydı keşke.`,
          `${p.target} muhafızları casusunu yakaladı; artık kimin gönderdiğini biliyorlar. İlişkiniz bozuldu. Adını bile söylemiş, lordum; unvanlarıyla birlikte.`,
          `Kötü haber: ${p.target} casusunun kılığını deldi. İlişkiniz bozuldu. Rahibe kılığına girmişti, sakallı hâliyle.`,
          `${p.target} topraklarından casusundan haber gelmeyecek; yakalandı. İlişkiniz bozuldu. Maaşını da peşin vermiştik, lordum.`,
        ]),
      }
    case 'envoy_insult':
      return { icon: 'unhappy', title: `${p.from} elçisi hakaret etti!`, text: `"${INSULTS[Number(p.seed ?? 0) % INSULTS.length]}" Bunu kapıda bağıra bağıra okudu, lordum; ben duymamış gibi yaptım ama bütün saray duydu. İlişkiniz ${balance.diplomacy.insult.relation} düştü; artık onlara karşı savaş gerekçen var.` }
    case 'insult_delivered':
      return {
        icon: 'scroll',
        title: 'Hakaretin iletildi',
        text: `${vary(n, [
          `Elçin ${p.to} sarayında ağzına geleni söyledi. Yani ben, lordum; biraz da süsledim.`,
          `Elçin ${p.to} hükümdarının yüzüne söyleneni söyledi; salon buz kesti. Kaçmadan önce reverans da yaptım, görgü önemli.`,
          `Elçin ${p.to} sarayında hakaretini okudu ve muhafızlar onu kapıya kadar kovaladı. Dizlerim hâlâ titriyor, ama gururla.`,
          `${p.to} sarayında elçinin sözleri yankılandı; kimse gülmedi. Oysa kafiyesi de vardı.`,
        ])} İlişkiniz ${balance.diplomacy.insult.relation} düştü; onlar da sana karşı savaş gerekçesi kazandı.`,
      }
    case 'army_threat':
      return {
        icon: 'warn',
        title: 'Düşman ordusu sınırda!',
        text: vary(n, [
          `${p.by} ordusu sınırına kamp kurdu. Ordu orada kaldıkça halkın korkuyor ve mutluluğu düşüyor. Ben de korkuyorum, ama benim mutluluğum zaten hep düşüktü.`,
          `Sınırında ${p.by} çadırları yükseldi. Halkın geceleri o ateşleri seyrediyor ve korkuyor; ordu kaldıkça mutluluk düşüyor. Ateşlerde kuzu çeviriyorlar, kokusu buraya kadar geliyor.`,
          `${p.by} ordusu sınırının dibinde bekliyor; gözdağı veriyorlar. Ordu orada kaldıkça halkın mutluluğu düşüyor. Bana da baktılar, lordum; ben de geri baktım. Sonra koştum.`,
          `${p.by} askerleri sınırda kılıç parlatıyor. Köylülerin korkuyor; ordu gitmedikçe mutluluk düşmeye devam edecek. Kılıçları parlak, lordum; akılları o kadar değil.`,
        ]),
      }
    case 'trade_raided':
      return {
        icon: 'warn',
        title: 'Ticaret yolun yağmalandı!',
        text: `${p.by} askerleri tüccarını bastı${p.units ? ` ve ${fmt(Number(p.units))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} götürdü` : ''}. Tüccar canını kurtardı, onurunu yolda bıraktı. Ticaret noktan harap; onarana kadar satış yapılamaz. Onarmak için ticaret noktasına tıkla ya da Ticaret sekmesini aç (${balance.economy.trade.repairCost.gold} altın, ${balance.economy.trade.repairCost.materials} yapı malzemesi). Savaş gerekçen var.`,
      }
    case 'raid_repelled':
      return {
        icon: 'shield',
        title: 'Yağmacılar püskürtüldü',
        text: `${vary(n, [
          `${p.by} askerleri ticaret yolunu basmaya çalıştı ama geri püskürtüldü. Kaçarken birbirlerine çarptılar, lordum; görülecek şeydi.`,
          `${p.by} askerleri tüccarına pusu kurdu; gözcülerin onları erken gördü ve kovaladı. Çalıların arkasına saklanmışlar, mızrakları dışarıda kalmış.`,
          `${p.by} ticaret yolunu basmak istedi ama elleri boş döndü. Tüccarımız arkalarından el salladı.`,
          `Tüccarın ${p.by} askerlerinin pususundan sağ salim kurtuldu; saldırganlar geri püskürtüldü. Tüccar şimdi kendini kahraman sanıyor; dayanılmaz.`,
        ])} Savaş gerekçen var.`,
      }
    case 'naval_battle': {
      const mine = p.attacker === me
      const won = (p.winner === 'attackers') === mine
      const lost = (x: unknown) => {
        const n = Object.values((x ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
        return n ? `${n} gemi` : 'kayıpsız'
      }
      const what = p.kind === 'blockade' ? 'Abluka' : p.kind === 'raid' ? 'Kıyı akını' : 'Ablukayı yarma'
      const loot = p.loot ? Object.entries(p.loot as Record<string, number>).map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase()}`).join(', ') : ''
      const outcome =
        p.kind === 'blockade'
          ? p.winner === 'attackers'
            ? mine
              ? `İskelesi artık abluka altında: balığı, deniz ticareti durdu. Martılar bile yol değiştiriyor.`
              : `İskelen abluka altında: balık tutulamıyor, deniz ticareti durdu. Bir filoyla ablukayı yarabilirsin. Balıkçılar şimdilik ağ örüp dedikodu yapıyor.`
            : mine
              ? 'Filon püskürtüldü ve eve dönüyor. Kaptan rüzgârı suçluyor; rüzgâr yorum yapmadı.'
              : 'Saldıranlar geri püskürtüldü. Sırılsıklam döndüler, lordum.'
          : p.kind === 'raid'
            ? p.winner === 'attackers'
              ? mine
                ? `Filon ${loot || 'ganimetle'} dönüyor. Tayfalar şimdiden şarkısını uyduruyor.`
                : `Akıncılar depolarından ${loot || 'mal'} götürdü. Bir teşekkür bile etmediler.`
              : mine
                ? 'Akın püskürtüldü; filo eve dönüyor. Biraz ıslak, biraz mahcup.'
                : 'Akıncılar geri püskürtüldü. Kıyıdan taş atan çocuklar da elinden geleni yaptı.'
            : p.winner === 'attackers'
              ? mine
                ? 'Abluka kırıldı! Balıkçılar sevinçten ağlarını havaya attı.'
                : 'Ablukacı filon yenildi ve eve dönüyor. Kaptan suyun bu sefer fazla ıslak olduğunu söylüyor.'
              : mine
                ? 'Abluka sürüyor. Gemileri hâlâ iskelenin önünde, lordum; inatçı tahta parçaları.'
                : 'Ablukayı yarma girişimi püskürtüldü. Ablukamız keyifle sürüyor.'
      return {
        icon: 'ship',
        title: `Deniz muharebesi: ${what} · ${won ? 'kazandın' : 'kaybettin'}`,
        text: `${p.attacker} (${lost(p.attackerLoss)} kayıp) — ${p.defender} (${lost(p.defenderLoss)} kayıp). Zarlar ${(p.rolls as number[])?.join('–')}. ${outcome}`,
      }
    }
    case 'blockade_lifted':
      return {
        icon: 'anchor',
        title: 'Abluka kalktı',
        text: p.why === 'peace' ? 'Savaş bitti; düşman filosu iskelenin önünden çekildi. Martılar geri döndü, balıklar da.' : p.why === 'sortie' ? 'Filon ablukayı yardı! Kaptan bunu üç gün anlatacak; hazırlıklı ol, lordum.' : `${p.by} filosu iskelenin önünden çekildi. Sıkıldılar herhalde, lordum.`,
      }
    case 'fleet_turned':
      return {
        icon: 'ship',
        title: 'Filo geri döndü',
        text: `Filon ${p.target} iskelesine vardı ama ${p.why === 'dock' ? 'orada iskele yok' : p.why === 'taken' ? 'başka bir donanma zaten abluka ediyor' : 'artık savaşta değilsiniz'}; eve dönüyor. Güzel bir deniz gezisi oldu en azından, lordum.`,
      }
    case 'battle_start':
      if (p.kind === 'cave') return { icon: 'swords', title: `${p.name} mağarası kuşatılıyor`, text: `Ordun ${p.name} mağarasının ağzına dayandı. Yağmacılar kendi mağaralarında, kayaların ardından savaşıyor; kazanırsan klan yok olur ve mağaradaki ganimet senin. Ben dışarıda nöbet tutuyorum, lordum; mağaralar nemli, dizlerime iyi gelmez.` }
      if (p.kind === 'outlaw') return { icon: 'swords', title: `${p.name} yakalandı!`, text: `Ordun ${p.name} yağmacılarını yolda yakaladı; çarpışma başladı. Savaş tur tur sürecek; kazanırsan çetenin ganimeti senin. Ben bir tepeden izliyorum, stratejik olarak.` }
      if (p.kind === 'pretender') return { icon: 'swords', title: `${p.name} karargâhına saldırı`, text: `Ordun taht davacısı ${p.name}'in karargâhına saldırdı. Çiti ve asileri savunuyor; kazanırsan isyan biter. Aile kavgası, lordum; ben karışmıyorum, sadece not alıyorum.` }
      if (p.kind === 'usurp') return { icon: 'swords', title: `${p.name} sarayını kuşatıyor!`, text: `Taht davacısı ${p.name} asileriyle sarayının kapısına dayandı. Garnizonun, kulelerin ve surların savunuyor; kaybedersen tahtı o alır. Ben mahzende önemli belgeleri koruyorum, lordum; şarap fıçılarının hemen yanında.` }
      if (p.kind === 'revolt') return { icon: 'swords', title: `${p.name} asileriyle çarpışma başladı`, text: `Ordun ${p.name} kapısındaki asilerin üstüne yürüdü. Savaş tur tur sürecek; kazanırsan ayaklanma biter. Asilerin yabaları sivri, lordum; dilleri daha da sivri.` }
      return {
        icon: 'swords',
        title: p.kind === 'siege' ? 'Kuşatma başladı!' : 'Savaş başladı!',
        text: `${(p.sides as string[][])[0].join(', ')} ile ${(p.sides as string[][])[1].join(', ')} karşı karşıya. ${vary(n, [
          'Savaş tur tur sürecek. Ben arkadan izleyeceğim, lordum; stratejik olarak.',
          'Davullar çalıyor; savaş tur tur sürecek. Davulcular bizden, çok cesurlar; en arkadalar.',
          'Saflar kapıştı; savaş tur tur sürecek, izleyebilirsin. Ben gözlerimi kapatıp dinleyeceğim.',
          'Zarlar atılmaya başladı; savaş tur tur sürecek. Zarlara ben üfledim, lordum; şans getirsin.',
          'Savaş tur tur sürecek. Ben komutanlara akıl veriyorum; uzaktan, bağırarak.',
        ])}`,
      }
    case 'battle_end': {
      const report = p.report as { winner: string; losses: Record<string, number>; loot?: Record<string, number> }
      const losses = Object.entries(report.losses).map(([name, n]) => `${name} ${fmt(n)}`).join(', ')
      const loot = report.loot ? ` Yağma: ${Object.entries(report.loot).map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')}.` : ''
      if (p.kind === 'cave')
        return p.winner === 'attackers'
          ? { icon: 'chest', title: `${p.name} yok edildi!`, text: `Ordun mağarayı aldı, klanın son adamı da düştü (kayıplar: ${losses}).${report.loot ? ` Mağaradaki ganimet ambara girdi: ${goodsText({ ...report.loot })}.` : ''} Çeteleri yollardan dağıldı.${p.next ? ` Ama dağlarda yeni bir çete türedi: ${p.next}. Bu dağlar yağmacı doğuruyor, lordum; yağmurdan sonra mantar gibi.` : ''}` }
          : { icon: 'warn', title: `${p.name} mağarası direndi`, text: `Ordun mağaranın ağzında yenildi ve eve çekiliyor (kayıplar: ${losses}). Klan zayıfladı; daha büyük bir orduyla dön. İçeriden kahkaha sesleri geliyordu, lordum; mağara da yankı yapınca iki kat ayıp oldu.` }
      if (p.kind === 'outlaw') {
        const minutes = Math.round(balance.outlaws.bands.respawnSeconds / 60)
        return p.winner === 'attackers'
          ? { icon: 'chest', title: `${p.name} dağıtıldı!`, text: `Ordun yağmacıları yendi (kayıplar: ${losses}).${report.loot ? ` Çetenin ganimeti ambara girdi: ${goodsText({ ...report.loot })}.` : ''} Yollar bir süre temiz; çete ${minutes} dakika sonra yeniden toplanır. Yağmacılar sivrisinek gibidir, lordum; kovarsın, geri gelir.` }
          : { icon: 'warn', title: `${p.name} yağmacıları direndi`, text: `Ordun yağmacılara yenildi ve eve çekiliyor (kayıplar: ${losses}). Çete yolu tutmaya devam ediyor; daha büyük bir orduyla yeniden dene. Şimdi yolda bizimle dalga geçen bir türkü söylüyorlar; sözleri de yanlış.` }
      }
      if (p.kind === 'pretender')
        return p.winner === 'attackers'
          ? { icon: 'crown', title: `${p.name} isyanı bastırıldı`, text: `Ordun karargâhı dağıttı (kayıplar: ${losses}). Taht davacısı ${p.name} savaşta öldü; hanedan bir süre sakin kalır. Bayram sofrası biraz boş kalacak, lordum; ama huzurlu.` }
          : { icon: 'warn', title: `${p.name} karargâhı direndi`, text: `Ordun yenildi ve eve çekiliyor (kayıplar: ${losses}). Karargâh ayakta; zamanı dolmadan daha büyük bir orduyla dön ya da taçtan yardım iste. Kardeşin çitin üstünden bize el sallıyordu, lordum; terbiyesiz.` }
      if (p.kind === 'usurp')
        return p.winner === 'defenders'
          ? { icon: 'crown', title: 'Taht korundu!', text: `Sarayın ${p.name} asilerini püskürttü (kayıplar: ${losses}). Taht davacısı düştü. Ben de mahzenden çıktım, lordum; şarap fıçıları da güvende, merak etme.` }
          : { icon: 'unhappy', title: 'Saray düştü', text: `${p.name} asileri sarayı aldı (kayıplar: ${losses}). Ben yeni efendiye de aynı derin reveransı yapacağım, lordum; mesleğim bu, bel ağrım da cabası.` }
      if (p.kind === 'revolt') {
        const r = balance.towns.rebels
        return p.winner === 'attackers'
          ? { icon: 'crown', title: `${p.name} ayaklanması bastırıldı`, text: `Ordun asileri dağıttı (kayıplar: ${losses}). Ayaklanma bitti, kasabanın sadakati +${r.quellLoyalty} arttı ve ${Math.round(r.quietSeconds / 60)} dakika yeniden ayaklanmaz; sadakati düşük kalırsa sonra yine ayaklanabilir. Asiler yabalarını bırakıp tarlaya döndü; yabanın asıl yeri de orası zaten.` }
          : { icon: 'warn', title: `${p.name} asileri direndi`, text: `Ordun asilere yenildi ve eve çekiliyor (kayıplar: ${losses}). Asiler kasabanın kapısında kalıyor; daha büyük bir orduyla yeniden gelebilirsin. Arkamızdan yuhaladılar, lordum; ritim tutturamadılar ama.` }
      }
      // Told from the lord's own side when the battle is known: "you won" reads better than "the defenders won".
      const fought = online.battles.find((b) => b.id === p.battle)
      const side = fought?.attackers.some((f) => f.kingdom === online.me) ? 'attackers' : fought?.defenders.some((f) => f.kingdom === online.me) ? 'defenders' : null
      const what = p.kind === 'siege' ? 'Kuşatma' : 'Savaş'
      const outcome = side ? (side === p.winner ? 'kazandın!' : 'yenildin') : `${p.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`
      return {
        icon: 'swords',
        title: `${what} bitti: ${outcome}`,
        text: `Kayıplar: ${losses}.${loot}${side ? (side === p.winner ? ' Ben baştan beri biliyordum, lordum; hep söylüyordum, içimden.' : ' Bir dahaki sefere ben de gelirim, lordum; arkadan, moral vermek için.') : ''}`,
      }
    }
    case 'siege_people':
      return p.taken
        ? { icon: 'unhappy', title: 'Halk sarayı terk ediyor', text: `${p.by} sarayını düşürdü; korkuya kapılan ${fmt(Number(p.lost))} köylü lordluğunu terk etti. Evler boş kaldı, halk ancak zamanla geri gelir. Kalanları ben ikna ettim, lordum; kendi bavulumu arkama saklayarak.` }
        : { icon: 'unhappy', title: 'Kuşatma halkı kaçırıyor', text: `${p.by} ordusu sarayını kuşattı; ${fmt(Number(p.lost))} köylü canını kurtarmak için kaçtı. Kuşatma sürdükçe kaçanlar artacak, halk büyümeyecek. Ben kalıyorum, lordum; sadakatten. Bir de kapılar kapalı.` }
    case 'king_command':
      return p.lead
        ? { icon: 'crown', title: 'Kral ordunun başında', text: `${p.king} ordusunun başına geçti. Emirlerini kendisi verecek: elçi beklemeden, hemen uygulanır. Yani bana iş yok, lordum; dizlerim sevinçten ağlıyor. Savaş yeteneği zarlara tam sayılır; ama ordu yenilirse kral savaşta düşebilir.` }
        : { icon: 'home', title: 'Kral saraya döndü', text: `${p.king || 'Kral'} ordunun komutasını bıraktı ve sarayına döndü. Ordunun emirleri yine elçiyle gider. Yani yine ben, yine o yollar, yine bu dizler.` }
    case 'king_fell':
      return Number(p.lord) === online.me
        ? { icon: 'unhappy', title: 'Kral savaşta düştü!', text: `Hükümdar ${p.king} ordusunun başında savaşırken öldü. Ordu onsuz yoluna devam ediyor; tahta kimin geçeceğini hanedan belirleyecek. Kahramanca düştü, lordum; türkülerde daha da kahramanca olacak, onları ben yazacağım.` }
        : { icon: 'swords', title: `${p.name} hükümdarı düştü`, text: `${p.name} hükümdarı ${p.king} ordusunun başında savaşırken öldü. Cesur adamdı, lordum; belki biraz fazla cesur.` }
    case 'tower_losses':
      return {
        icon: 'warn',
        title: 'Gözcü kuleleri ateş açtı',
        text: vary(n, [
          `Düşman kuleleri ordundan ${p.killed} askeri vurdu. Kuleler hep tepeden bakar, lordum; ben hiç sevmem.`,
          `Kulelerden ok yağdı; ordundan ${p.killed} asker düştü. Kalkanları başımıza tutmayı kimse akıl etmedi.`,
          `Düşmanın gözcüleri seni erken gördü: kulelerden atılan oklar ${p.killed} askerini vurdu. Sancağı biraz küçültsek mi, lordum?`,
          `Ordun düşman kulelerinin menzilinden geçerken ${p.killed} asker kaybetti. O yoldan geçmeyin demiştim; içimden, ama demiştim.`,
        ]),
      }
    case 'order_failed':
      if (p.why === 'peace') return { icon: 'warn', title: 'Kasaba kuşatılamadı', text: 'Ordun kasabaya vardı ama kasabanın sahibiyle savaşta değilsin; kuşatma yapamaz. Ordu orada bekliyor; askerler pazarda karpuz seçiyor, lordum.' }
      if (p.why === 'cave') return { icon: 'warn', title: 'Mağara kuşatılamadı', text: 'Elçi orduya ulaştı ama o mağarada artık bildiğin klan yok (ya da mağarayı bilmiyorsun). Ordu olduğu yerde bekliyor. O elçi bendim, lordum; o yokuşu boşuna tırmandım.' }
      if (p.why === 'calm') return { icon: 'shield', title: 'Bastırılacak ayaklanma yok', text: 'Ordun kasabana vardı ama orada asi yok; ordu kapıda bekliyor. Kasabalılar ayran ikram etti; savaşmaktan iyidir.' }
      return { icon: 'warn', title: 'Emir yerine getirilemedi', text: 'Elçi orduya ulaştı ama emir uygulanamadı (yol yok ya da ordu savaşta). Ben emri okudum, komutan bana baktı, ben ona baktım; olmadı, lordum.' }
    case 'town_siege': {
      const mine = p.by === me
      const minutes = Math.round(balance.towns.siegeSeconds / 60)
      return mine
        ? { icon: 'swords', title: `${p.name} kuşatılıyor`, text: `Ordun ${p.name} kasabasını kuşattı. Ordu orada kaldıkça kuşatma ${minutes} dakikada biter; ilerlemesi kasabanın üstünde görünür. Kasabalılar surlardan bize lahana atıyor, lordum; kuşatma resmen başladı.${overreachNote(online, 1)}` }
        : { icon: 'warn', title: `${p.name} kuşatma altında!`, text: `${p.by} ordusu ${p.name} kasabanı kuşattı. ${minutes} dakika içinde ordunla gelip kuşatmayı kıramazsan kasaba onların olur. Acele et, lordum; o kasabanın meyhanesi çok iyidir.${Number(p.relation) < 0 ? ` ${p.by} ile ilişkin ${-Number(p.relation)} düştü.` : ''}` }
    }
    case 'town_siege_lifted':
      return {
        icon: 'shield',
        title: `${p.name} kuşatması kalktı`,
        text: `${vary(n, [`${p.name} önündeki kuşatma sona erdi`, `${p.name} kapısındaki çadırlar söküldü`, `${p.name} surları önünde artık kimse yok`, `${p.name} kuşatması dağıldı`])}: kuşatan ordu gitti, yenildi ya da artık savaşta değilsiniz. Hangisi olduğunu sorma, lordum; ben sadece haberciyim.`,
      }
    case 'town_taken': {
      const mine = p.by === me
      return mine
        ? { icon: 'crown', title: `${p.name} artık senin!`, text: `${p.name} kasabası kapılarını açtı${Number(p.lost) > 0 ? `; ${fmt(Number(p.lost))} asker kaybettin` : ''}. Bundan sonra sana katkı gönderecek. Anahtarı bana verdiler, lordum; biraz cebimde taşıyıp sana vereceğim.${overreachNote(online, 0)}` }
        : { icon: 'warn', title: `${p.name} elden çıktı`, text: `${p.by} ${p.name} kasabanı aldı. Kasabanın katkısı artık onlara gidiyor. Ben o kasabayı zaten pek sevmezdim, lordum; ekmeği bayattı.` }
    }
    case 'patrol_tribute': {
      // How much of the treasury it is (newer notices carry the treasury as it stood).
      const share = Number(p.gold) > 0 ? ` (hazinenin %${Math.max(1, Math.round((Number(p.amount) / Number(p.gold)) * 100))} kadarı${tilt(Number(p.crown ?? 0), Date.parse(n.show_at))})` : ''
      return {
        icon: 'banner',
        title: `${crown(p.crown)} haraççıları kapında`,
        text: `Lordum, yine onlar. Rakip taç ${crown(p.crown)} haraççıları sarayına dayandı (her ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelirler; keşke tüccarımız bu kadar dakik olsa) ve ${fmt(Number(p.amount))} altın${share} haraç istiyor. Ödersen yollarına giderler. Reddedersen o tacın lordlarıyla ilişkin ${-balance.cities.crown.patrol.refuseRelation} düşer. ${Math.round(balance.cities.crown.patrol.answerSeconds / 60)} dakika içinde cevap vermezsen haraç kendiliğinden ödenir, ama oyundaysan %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla: ${fmt(Math.round(Number(p.amount) * balance.cities.crown.patrol.tribute.afkFactor))} altın. Başlarıyla konuşmak da bir yol; tatlı dil bazen haracı bile indirir.`,
      }
    }
    case 'patrol_tip':
      return {
        icon: 'gold',
        title: 'Devriye eğlenip gitti',
        text: vary(n, [
          `${crown(p.crown)} devriyesi eğlence merkezinde soluklandı, içti, şarkı söyledi ve ${fmt(Number(p.amount))} altın bahşiş bıraktı. Şarkıları berbattı, lordum; bahşişleri güzel.`,
          `${crown(p.crown)} askerleri fıçıları boşalttı, ozanı alkışladı ve giderken masaya ${fmt(Number(p.amount))} altın bıraktı. Ozan alkışı hak etmemişti; ben söylesem daha iyi söylerdim.`,
          `${crown(p.crown)} devriyesi gece boyu şarkı söyledi; çavuşları biraz da dans etti. Bahşiş: ${fmt(Number(p.amount))} altın. Ayı daha zarif dans eder, lordum; ama ayı bahşiş bırakmaz.`,
          `Eğlence merkezinde ${crown(p.crown)} devriyesi vardı: kadehler kalktı, zarlar atıldı ve ${fmt(Number(p.amount))} altın bahşiş kaldı. Zarda bana da kaybettiler; o kısmı deftere yazmadım.`,
        ]),
      }
    case 'patrol_visit':
      return {
        icon: 'crown',
        title: 'Taç devriyesi uğradı',
        text: `${crown(p.crown)} devriyesi sarayının önüne geldi, selam verdi ve yoluna devam etti; tacınla ilişkin +${fmt(Number(p.relation ?? 1))}. Bir eğlence merkezin (4. seviye saray) olsaydı içip eğlenir ve bahşiş bırakırlardı. Kuru bir selamla gittiler; ben de kuru kuru el salladım.`,
      }
    case 'crown_gift': {
      const goods = Object.entries((p.goods ?? {}) as Record<string, number>).map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? g}`)
      return {
        icon: 'chest',
        title: `${crown(p.crown)} armağan gönderdi`,
        text: `Devriye, hükümdarın sana duyduğu yakınlığın işareti olarak «${p.name}» getirdi: ${[...(Number(p.gold) > 0 ? [`${fmt(Number(p.gold))} altın`] : []), ...goods].join(', ')}. Paketi ben açtım, lordum; eksik yok, yemin ederim.`,
      }
    }
    case 'patrol_taken':
      return p.afk
        ? {
            icon: 'gold',
            title: 'Haraç fazlasıyla ödendi',
            text: `Oyundaydın ama ${crown(p.crown)} haraççılarına cevap vermedin; haraç kendiliğinden, %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla ödendi: ${fmt(Number(p.amount))} altın${Number(p.asked) > 0 ? ` (istenen ${fmt(Number(p.asked))})` : ''}. Zamanında ödersen ya da reddedersen bu fazlalık olmaz. Kapıda onları oyalarken benim dizlerim de çürüdü, lordum.`,
          }
        : { icon: 'gold', title: 'Haraç ödendi', text: `Sen yokken ${crown(p.crown)} haraççıları geldi; olağan haracı, ${fmt(Number(p.amount))} altın ödedin. Ben pazarlığa girişecektim, lordum; ağzımı açmadan keseyi aldılar.` }
    case 'patrol_ignored':
      return { icon: 'warn', title: 'Haraç cevapsız kaldı', text: `${crown(p.crown)} devriyesi ${fmt(Number(p.amount))} altınını alamadan döndü. O tacın lordları bunu unutmayacak: ilişkin ${-balance.cities.crown.patrol.refuseRelation} düştü. Giderken kapıyı öyle bir çarptılar ki menteşe hâlâ ağlıyor.` }
    case 'town_revolt':
      return {
        icon: 'unhappy',
        title: `${p.name} ayaklandı!`,
        text: `${p.name} halkı sana karşı ayaklandı: ${p.minutes ?? Math.round(balance.towns.revolt.seconds / 60)} dakika boyunca hiçbir şey göndermeyecek${Number(p.rebels) > 0 ? ` ve ${p.rebels} asi kasabanın kapısını tuttu` : ''}. Yabalar havada, lordum; çoğunu da biz vermiştik. Ordunu gönderip asileri yenersen ayaklanma biter (kasabanın panelinde "Ayaklanmayı bastır"). Yoksa ayaklanma bittiğinde sadakat hâlâ ${balance.towns.revolt.breakAwayBelow}'nin altındaysa kasaba senden kopar ve asiler onun garnizonu olur.`,
      }
    case 'town_lost_revolt':
      return {
        icon: 'warn',
        title: `${p.name} senden koptu`,
        text: `${vary(n, [
          `${p.name} halkı ayaklanmayı sonuna götürdü ve sana bağlılığını bıraktı.`,
          `${p.name} burcundaki sancağın indirildi; kasaba sana bağlılığını bıraktı. Sancağı da iade etmediler, lordum.`,
          `${p.name} valinin kapısını gösterdi; kasaba artık senin değil.`,
          `${p.name} halkı "yeter" dedi ve senden koptu. Kibarca söylediler en azından; bağırarak ama kibarca.`,
        ])} Kasaba artık kimseye bağlı değil; küçük bir garnizonla kendini savunuyor, yeniden kuşatıp alabilirsin.`,
      }
    case 'town_sale': {
      const good = RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? String(p.good)
      return {
        icon: 'gold',
        title: 'Kasabadan iyi haber',
        text: `${p.by}, ${p.name} kasabanın pazarından ${fmt(Number(p.units))} ${good} aldı; hazinene ${fmt(Number(p.gold))} altın girdi. Başkasının askeri bizim pazarda alışveriş ediyor, lordum; ben buna ticaret derim, sen kâr de.${Number(p.wasted) > 0 ? ` Hazine dolu olduğu için ${fmt(Number(p.wasted))} altın boşa gitti.` : ''}`,
      }
    }
    case 'cargo_home': {
      const goods = goodsText(p.goods)
      return {
        icon: 'chest',
        title: 'Ordun yükünü getirdi',
        text: `Kasabadan alınan mallar saraya ulaştı${goods ? `: ${goods} ambara girdi` : ''}. Askerler yol boyu söylendi, lordum, ama çuvallar tamam; tek tek saydım.${Number(p.wasted) > 0 ? ` Ambar dolu olduğu için ${fmt(Number(p.wasted))} birim boşa gitti.` : ''}`,
      }
    }
    case 'cargo_lost':
      return {
        icon: 'warn',
        title: 'Yük kaybedildi',
        text: vary(n, [
          `Ordun yenildi; kasabadan taşıdığı mallar (${goodsText(p.goods)}) savaş alanında kaldı. Düşman şimdi bizim çuvallarla övünüyor.`,
          `Yenilen ordun çuvalları bırakıp kaçtı: ${goodsText(p.goods)} düşmanın eline geçti. Hafiflik iyi gelmiş, lordum; çok hızlı koştular.`,
          `Kasabadan alınan mallar (${goodsText(p.goods)}) savaşın tozunda kayboldu; ordun yenildi. O çuvalları ben bağlamıştım, lordum; emeklerim!`,
          `Ordun canını kurtardı ama yükünü kurtaramadı: ${goodsText(p.goods)} savaş alanında kaldı. Önce can, sonra çuval; doğru sıra.`,
        ]),
      }
    case 'town_held':
      return {
        icon: 'warn',
        title: `${p.name} dayandı`,
        text: vary(n, [
          `${p.name} garnizonu kuşatmayı püskürttü; ordundan ${fmt(Number(p.lost))} asker düştü, kimse kalmadı. Kasabalılar surlarda şarkı söylüyor, lordum; kulaklarımızı tıkayıp geçelim.`,
          `${p.name} surları dayandı: ordundan ${fmt(Number(p.lost))} asker düştü ve ayakta kimse kalmadı. O surları hafife almıştım, itiraf ediyorum.`,
          `${p.name} garnizonu son adamına kadar direndi, ama son adam senin ordundandı: ${fmt(Number(p.lost))} asker düştü.`,
          `Kuşatma kanla bitti: ${p.name} dayandı, ordundan ${fmt(Number(p.lost))} asker düştü, kimse kalmadı. Önce yas, lordum; sonra daha büyük bir ordu.`,
        ]),
      }
    case 'outlaw_chase':
      return { icon: 'swords', title: `${p.name} peşindesin`, text: `Ordun ${p.name} yağmacılarının önünü kesmek için yola çıktı (yaklaşık ${fmt(Number(p.soldiers))} kişiler). Yağmacılar ordudan yavaş yürür; yakaladığı an savaş başlar. ${Math.round(balance.outlaws.bands.chase.maxSeconds / 60)} dakikada yakalayamazsa takibi bırakır. Ben ordunun en arkasındayım, lordum; arkayı kollamak çok önemli bir görevdir.` }
    case 'cave_trail': {
      const left = Math.max(1, Number(p.need) - Number(p.wins))
      const hint = trailHint({ dir: p.dir as number, far: p.far as number | null, mark: p.mark as TrailMark | null })
      return {
        icon: 'scroll',
        title: `${p.clan} izinde`,
        text: `Yakalanan yağmacılardan biri konuştu (sorguya ben de bir bakışımla katkıda bulundum): ${p.clan} çetelerin başında, dağlarda bir mağarada yaşıyor. Yağmacıların izi ${hint.to} gidiyor. Klanın çetelerinden ${left} tanesini daha yenersen mağarayı bulursun.`,
      }
    }
    case 'cave_probe':
      return {
        icon: 'pin',
        title: 'Ordu mağarayı inceleyemedi',
        text: `${probeText(Number(p.reason))} Bir klanın izini sürmeden mağaralarda bir şey bulmak zor. Ordu mağaranın önünde bekliyor. Askerler içeri "Kimse var mı?" diye seslendi, lordum; yankı da onlara aynısını sordu.`,
      }
    case 'cave_found':
      return { icon: 'pin', title: `${p.clan} mağarası bulundu!`, text: `İzler sonunda ${p.clan} mağarasına çıktı. Mağara artık haritanda işaretli (yalnız sen biliyorsun; bir de ben, ama ben kimseye söylemem). Mağaraya ya da çetelerinden birine tıkla, bir ordu seç ve "Mağarayı kuşat": klanı yok edersen mağaradaki ganimet senin.` }
    case 'cave_empty':
      return {
        icon: 'shield',
        title: 'Mağara boş',
        text: `${vary(n, [
          'Ordun mağaraya vardı ama içeride kimse yok: klan çoktan yok edilmiş. Bize bir not bile bırakmamışlar.',
          'Meşaleler mağaranın dibine kadar indi; yalnızca sönmüş ateşler ve kırık çanaklar var. Klan çoktan yok edilmiş.',
          'Mağarada yarasalardan başka kimse yok; klan çoktan yok edilmiş. Yarasalar da pek misafirperver değildi, lordum.',
          'Ordun mağaraya daldı ve boş buldu: biri klanı senden önce bitirmiş. Geç kalınan bir davet gibi, lordum.',
        ])} Ordu mağaranın önünde bekliyor.`,
      }
    case 'clan_destroyed':
      return { icon: 'swords', title: `${p.clan} yok edildi`, text: `${p.byName} ordusu ${p.clan} mağarasını aldı; klanın çeteleri yollardan dağıldı. Ama dağlarda yeni bir çete türedi: ${p.next}. Bir süre sonra onun çeteleri yolları tutmaya başlar; izini yeniden sürmek gerekecek. Bu dağlarda yağmacılık aile mesleği, lordum.` }
    case 'outlaw_gone':
      return {
        icon: 'shield',
        title: 'Çete ortada yok',
        text: `${vary(n, [`${p.name} dağıtılmış`, `${p.name} çoktan dağılmış, izleri bile soğumuş`, `${p.name} senden önce birinin kılıcına denk gelmiş`, `Yolda ${p.name} adına yalnızca sönmüş bir kamp ateşi kaldı`])}; ordun takibi bıraktı ve olduğu yerde bekliyor. Bu kadar yürüdük, lordum; boşuna olmadı, bacaklar güçlendi.`,
      }
    case 'outlaw_escaped':
      return {
        icon: 'warn',
        title: `${p.name} izini kaybettirdi`,
        text: `${vary(n, [
          `Ordun ${p.name} yağmacılarına yetişemedi ve takibi bıraktı`,
          `${p.name} yağmacıları dere yataklarına dalıp kayboldu; ordun takibi bıraktı`,
          `${p.name} izlerini ustaca sildi; ordun peşlerini bıraktı`,
          `Ordun ${p.name} yağmacılarını gözden kaçırdı ve takibi bıraktı; komutan bir tavşanın peşine takılmış olabilir`,
        ])}; olduğu yerde bekliyor. Daha yakındaki bir orduyla yeniden dene.`,
      }
    case 'outlaw_road':
      return {
        icon: 'warn',
        title: 'Yağmacılar yolu tuttu!',
        text: `${vary(n, [
          `Lordum, yağmacılar tüccarımızı soymaya başladı; tüccar da onlara indirim yapıyor. Ticaret noktanın çevresindeki ticaret yolunun %${Math.round(Number(p.share) * 100)}'i yağmacıların elinde (${p.bands} çete).`,
          `Gözcüler haber verdi: ${p.bands} çete ticaret noktanın yollarına indi; yolun %${Math.round(Number(p.share) * 100)}'i onların. Yol kenarına tabela bile asmışlar.`,
          `Tüccarın soluk soluğa döndü: yağmacılar (${p.bands} çete) yolun %${Math.round(Number(p.share) * 100)}'ini tutuyor. Devesi daha sakin, lordum.`,
          `Hanlarda tek konu yağmacılar: ${p.bands} çete ticaret noktanın çevresindeki yolun %${Math.round(Number(p.share) * 100)}'ini kesmiş. Hancılar fiyatları da artırdı, tesadüfe bak.`,
        ])} Tüccarının altınının %${Math.round(Number(p.cut) * 100)}'ini kesiyorlar ve halk tedirgin. Haritada çeteye tıkla, bir ordu seç ve "Takip et".`,
      }
    case 'inn_lost':
      return {
        icon: 'warn',
        title: 'Han kapılarını kapattı',
        text: `${vary(n, [
          'Tüccarının gittiği hanın hancısı onu artık tanımıyor: o hanın pastasında payın kalmadı denecek kadar azaldı. Bana da çorba vermediler, lordum.',
          'Kötü haber, lordum: tüccarımız handa yüz bulamadı. Başkaları oraya daha yakın, bizim payımız eridi; tereyağı gibi.',
          'Han başka lordların kervanlarıyla doldu; bizim tüccara yer yok dediler. Payımız neredeyse sıfır. Ahırda bile yer yokmuş.',
          'Hancı kapıda karşıladı ve geri çevirdi: o yöredeki gücümüz yetmiyor artık. Kapıyı da yüzümüze kibarca kapattı.',
        ])} Tüccar lobi pazarına döndü. O hanı geri istiyorsan yakınındaki bir kasabayı al.`,
      }
    case 'outlaw_road_clear':
      return {
        icon: 'shield',
        title: 'Yollar temizlendi',
        text: vary(n, [
          'Ticaret noktanın çevresindeki yollarda yağmacı kalmadı; tüccarın yine tam kazanıyor. Ben de yine o yollarda rahat yürüyebileceğim; dizlerim hariç.',
          'Yollar yeniden güvenli: ticaret noktanın çevresinde yağmacı kalmadı, tüccarın tam kazanıyor. Tüccar şimdi kendine korumasız dolaşıyor; havalı.',
          'Tüccarın bu sabah ıslık çalarak yola çıktı; yollarda yağmacı yok, kazancı tam. Islığı berbat, lordum; ama ses etmedim.',
          'Ticaret yolunun yağmacıları gitti; tüccarın kesesi yine dolu dönüyor. Ben de yine yol masrafı isteyebilirim, değil mi?',
        ]),
      }
    case 'pirate_waters':
      return {
        icon: 'ship',
        title: 'Korsanlar sularında!',
        text: `${vary(n, [
          `İskelenin yakınında ${p.boats} korsan teknesi dolaşıyor (korsanların etkisi %${Math.round(Number(p.share) * 100)}). Ben denize hiç güvenmezdim, lordum; işte haklı çıktım.`,
          `Kara yelkenler göründü: ${p.boats} korsan teknesi iskelenin önünde (etkileri %${Math.round(Number(p.share) * 100)}). Biri de bize tahta bacağını sallıyor.`,
          `Balıkçılar ağlarını topladı: ${p.boats} korsan teknesi sularında geziyor (etkileri %${Math.round(Number(p.share) * 100)}). Balıklar da saklandı, korkaklar.`,
          `İskele bekçisi çan çaldı: korsanlar geldi, ${p.boats} tekne (etkileri %${Math.round(Number(p.share) * 100)}). Bekçi hâlâ çalıyor; durdurabilecek kimse yok.`,
        ])} Deniz ticaretine saldırı olasılığı arttı, balık azaldı, halk tedirgin. Haritada kara yelkenli tekneye tıkla, savaş gemili bir filo seç ve "Takip et"; ya da korsan limanını ablukaya al, hepsi zayıflar.`,
      }
    case 'pirate_waters_clear':
      return {
        icon: 'anchor',
        title: 'Sular temizlendi',
        text: vary(n, [
          'İskelenin önündeki sularda korsan kalmadı. Martılar artık yalnız bizim balığımızı çalıyor.',
          'Kara yelkenler ufuktan çekildi; iskelenin önü yeniden temiz. Ben hep söylüyordum, giderler diye; sonunda gittiler.',
          'İskelenin sularında korsan yok; balıkçılar yine rahat ağ atıyor. Ve yine boş çekiyor, ama rahat.',
          'Korsanlar iskelenin önünden gitti; deniz ticareti yeniden güvenli. Denizin kendisi hariç, lordum; o hiç güvenli değil.',
        ]),
      }
    case 'pirate_battle': {
      const lostShips = Object.values((p.loss ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
      const might = `filonun gücü ${String(Math.round(Number(p.fleetMight) * 10) / 10).replace('.', ',')}, korsanlarınki ${String(Math.round(Number(p.might) * 10) / 10).replace('.', ',')}`
      return p.won
        ? { icon: 'chest', title: `${p.name} batırıldı!`, text: `Filon korsanları yakaladı ve yendi (${might}; zarlar ${(p.rolls as number[])?.join('–')}).${lostShips ? ` ${lostShips} gemi kaybettin.` : ' Kayıp yok.'}${p.loot ? ` Ödül ve ganimet: ${goodsText(p.loot)}.` : ''} Korsanların papağanı kaçtı, lordum; peşine düşmedim, çok küfürbazdı.` }
        : { icon: 'warn', title: `${p.name} korsanları kazandı`, text: `Filon korsanlara yenildi (${might}; zarlar ${(p.rolls as number[])?.join('–')})${lostShips ? ` ve ${lostShips} gemi kaybetti` : ''}. Korsanlar dolaşmaya devam ediyor; daha güçlü bir filoyla (kadırgalar korsanları yener) yeniden dene. Arkamızdan "yo ho" diye bağırdılar, lordum; çok kaba.` }
    }
    case 'haven_battle': {
      const lostShips = Object.values((p.loss ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
      const might = `filonun gücü ${String(Math.round(Number(p.fleetMight) * 10) / 10).replace('.', ',')}, limanın ${String(Math.round(Number(p.might) * 10) / 10).replace('.', ',')}`
      return p.won
        ? {
            icon: 'chest',
            title: `${p.name} abluka altında!`,
            text: `${vary(n, [
              `Filon limanı koruyan ${p.guards} çektiriyi yendi`,
              `Korsanların muhafızları (${p.guards} çektiri) filonun önünde dağıldı; kaçarken birbirlerinin küreğine takıldılar`,
              `Limanın ağzındaki ${p.guards} çektiri batırıldı ya da kaçtı`,
              `Filon limanın önüne demir attı; ${p.guards} çektiri karşı koyamadı, biri teslim bayrağı yerine gömlek salladı`,
            ])} (${might}; zarlar ${(p.rolls as number[])?.join('–')}).${lostShips ? ` ${lostShips} gemi kaybettin.` : ' Kayıp yok.'}${p.loot ? ` Ganimet: ${goodsText(p.loot)}.` : ''} Filo limanın önünde kaldıkça korsanların nüfusu (${p.pop}) saatte ${balance.outlaws.havens.pop.blockadePerHour} kişi azalır ve bütün korsanlar zayıflar. Geri çağırınca liman yeniden dolmaya başlar.`,
          }
        : { icon: 'warn', title: `${p.name} dayandı`, text: `Filon limanı koruyan ${p.guards} çektiriye yenildi (${might}; zarlar ${(p.rolls as number[])?.join('–')})${lostShips ? ` ve ${lostShips} gemi kaybetti` : ''}; kalanlar eve dönüyor. Daha güçlü bir filoyla (kadırgalar çektirileri yener) yeniden dene. Korsanlar kıyıda dans ediyordu, lordum; ritim de tutturuyorlardı, en acısı o.` }
    }
    case 'haven_turned':
      return {
        icon: 'anchor',
        title: `${p.name} zaten kuşatılmış`,
        text: vary(n, [
          `Filon vardığında limanın önünde ${p.by} gemilerini buldu; bir limanı aynı anda tek filo abluka eder. Filon eve dönüyor. Kaptanlar birbirine kibarca el salladı, lordum; dişlerini sıkarak.`,
          `${p.by} senden önce davranmış: liman onun ablukasında. Filon geri dönüyor. Erken kalkan yol alıyor, lordum; ben hiç erken kalkamadım.`,
          `Limanın ağzı ${p.by} kadırgalarıyla dolu; filonun demirleyecek yeri yok. Eve dönüyor.`,
        ]),
      }
    case 'haven_empty':
      return {
        icon: 'chest',
        title: `${p.name} boşaldı`,
        text: vary(n, [
          'Ablukan işini yaptı: korsan limanında kimse kalmadı. Korsanlar bu limandan güç alamıyor; filon geri çağırana dek orada bekler. Tayfalar boş iskelede balık tutuyor, lordum; hiç değilse bir işe yarasınlar.',
          'Limanın son korsanları da gece kaçtı; iskeleler bomboş. Filon döndüğünde liman yavaş yavaş yeniden dolacak. Giderken papağanlarını bile unutmuşlar.',
          'Korsan limanı ıssız: abluka korsanları dağıttı. Ne kadar uzun beklersen, liman o kadar geç dolar. Sabır, lordum; benim en büyük erdemim.',
        ]),
      }
    case 'pirate_gone':
      return {
        icon: 'anchor',
        title: 'Korsanlar ortada yok',
        text: vary(n, [
          `${p.name} batırılmış; filon takibi bıraktı. Biri işimizi yapmış, lordum; teşekkür mektubu yazayım mı?`,
          `${p.name} çoktan dalgaların altında; filon takibi bıraktı.`,
          `${p.name} başka bir filonun eline düşmüş; filon takibi bıraktı. Ganimeti de onlar almış tabii.`,
          `Suyun üstünde ${p.name} adına yalnızca bir kırık direk yüzüyor; filon takibi bıraktı.`,
        ]),
      }
    case 'pirate_escaped':
      return {
        icon: 'warn',
        title: `${p.name} kaçtı`,
        text: vary(n, [
          `Filon ${p.name} korsanlarına yetişemedi ve takibi bıraktı. Kaptan "rüzgâr onlardan yanaydı" diyor; rüzgârı rüşvetle suçluyorum.`,
          `${p.name} rüzgârı arkasına aldı ve kaçtı; filon takibi bıraktı.`,
          `${p.name} sazlıklara sokuldu, filon izini kaybetti ve takibi bıraktı. Sazlıklar korsanı sever, lordum; ben de sazlıkları sevmem.`,
          `Filon ${p.name} yelkenlerini ufukta kaybetti ve takibi bıraktı. Gözlük icat edilse ne güzel olurdu.`,
        ]),
      }
    // ---- The lord's house (CLAUDE.md §9.1.1) ----
    case 'kin_unhappy': {
      const brother = p.kinship === 'sibling'
      return {
        icon: 'unhappy',
        title: `${brother ? 'Kardeşin' : 'Oğlun'} ${p.name} hoşnutsuz`,
        text: `Saray kulağı fısıldıyor (saray kulağı benim, lordum): ${brother ? 'kardeşin' : 'oğlun'} ${p.name} senden pek hoşnut değil (${p.opinion}). ${
          brother
            ? `Daha da soğursa (${balance.dynasty.intrigue.revolt.below} altı) asker toplayıp sana isyan edebilir ve tahtını isteyebilir. Ona bir görev ver, hediye gönder ya da halkını mutlu et. Akşam yemeğinde ona ekmeği ilk sen uzat, derim.`
            : 'Ona bir görev ver ya da hediye gönder; Saray → Hanedan. Gençler böyledir, lordum; ben de onun yaşında bütün dünyaya küstüm.'
        }`,
      }
    }
    case 'kin_role': {
      const role = p.role as string | null
      const name = p.name as string
      const s = (p.skills ?? {}) as Record<string, number>
      const I = balance.dynasty.intrigue.roles
      if (role === null) return { icon: 'scroll', title: `${name} görevden alındı`, text: `${name} artık ${p.was === 'governor' ? 'vali' : p.was === 'commander' ? 'devriye komutanı' : 'hazinedar'} değil. Böyle bir şey kolay unutulmaz; sana gücendi. Akşam yemeğinde surat asacak, lordum; tuzu bile uzatmaz.` }
      if (role === 'governor')
        return { icon: 'crown', title: `${name} ${p.town} valisi`, text: `${name} ${p.town} kasabasına vali olarak gitti. Kasabanın sadakat hedefi +${Math.round(Math.max(0, I.governor.loyalty + ((s.people ?? 5) - 5) * I.governor.perPeople))} arttı; görev verdiğin için sana da ısındı. Kasabalılar şimdiden ona dilekçe yazıyor.` }
      if (role === 'commander')
        return { icon: 'banner', title: `${name} tacın devriyesinin başında`, text: `${name} bağlı olduğun tacın devriyesinin komutasını aldı: devriyenin bahşişi artar, her uğrayışta taç seni biraz daha sever. Taç onu da sever; aklında olsun. Üniforma da ona çok yakıştı; biraz kıskandım.` }
      return { icon: 'gold', title: `${name} hazinedar`, text: `${name} hazinenin başına geçti: vergi +%${Math.round(Math.max(0, (s.finance ?? 5) - I.treasurer.from) * I.treasurer.taxPerFinance * 100)}. Şimdiden benim yol masraflarımı sorgulamaya başladı, lordum.` }
    }
    case 'house_marriage':
      if (p.kind === 'bride') return { icon: 'flower', title: `${p.from} hanedanından gelin geldi`, text: `${p.from} hanedanının prensesi ${p.name} sarayına geldi. İki hanedan artık akraba; ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı. Çeyiz sandıklarını ben taşıdım, lordum; sırtımda bir hanedan kadar yük vardı.` }
      if (p.kind === 'crown') return { icon: 'flower', title: `Prenses ${p.name} ${crown(p.crown)} sarayında`, text: `Prenses ${p.name} ${crown(p.crown)} hükümdar ailesine gelin gitti. Taçla ilişkin +${balance.dynasty.intrigue.marriage.crown.relation} arttı; bundan sonra taç seni hep biraz daha yakın tutar. Düğünde hükümdarın yanına oturdum; tamamen yanlışlıkla, tabii.` }
      return p.free
        ? { icon: 'crown', title: `${p.town} artık senin!`, text: `Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti; kasaba kılıç çekilmeden sana bağlandı, yalnızca kadeh kalktı. Sadakati %${balance.dynasty.intrigue.marriage.town.freeLoyalty} ile başlıyor, prenses orada kaldıkça +${balance.dynasty.intrigue.marriage.town.loyalty}.${overreachNote(online, 0)}` }
        : { icon: 'flower', title: `Prenses ${p.name} ${p.town} kasabasında`, text: `Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti. Kasabanın sadakat hedefi kalıcı olarak +${balance.dynasty.intrigue.marriage.town.loyalty}. Kasabalılar hâlâ düğünü konuşuyor; benim dansımı özellikle.` }
    case 'pretender_rise':
      return {
        icon: 'swords',
        title: `Kardeşin ${p.name} isyan etti!`,
        text: `${p.name} tahtı istiyor; aile meclisi biraz sertleşti, lordum. ${Number(p.deserters) > 0 ? `Garnizonundan ${p.deserters} asker ona katıldı; ` : ''}${p.soldiers} asiyle sınırının yakınında bir karargâh kurdu. ${p.minutes} dakika içinde karargâhı kuşatıp dağıtmazsan büyüyüp sarayını kuşatacak; kuşatmayı kaybedersen tahtı o alır.${
          p.backed ? ` Kötü haber: ${crown(p.crown)} onu senden çok seviyor ve onu destekliyor; karargâh daha hızlı büyüyecek.` : p.crown !== null && p.crown !== undefined ? ` ${crown(p.crown)} şimdilik senin yanında; ondan asker ya da altın isteyebilirsin.` : ''
        } Saray → Hanedan'dan ordu gönderebilirsin.`,
      }
    case 'pretender_grow':
      return p.soon
        ? { icon: 'warn', title: `${p.name} yürümeye hazırlanıyor`, text: `Taht davacısının karargâhında ${p.soldiers} asi var. ${p.minutes} dakika sonra sarayını kuşatacak; ya karargâhı şimdi dağıt ya da garnizonunu, kulelerini ve surlarını hazırla. Ben değerli eşyaları mahzene taşımaya başladım; önce kendiminkileri.` }
        : { icon: 'warn', title: `${p.name} karargâhı büyüyor`, text: `Karargâha her gün yeni asiler katılıyor: ${p.soldiers} asi${p.backed ? ', tacın desteğiyle' : ''}. ${p.minutes} dakika sonra sarayına yürüyecek. Dedikoduya göre onların kampında yemek bizimkinden iyiymiş, lordum; bunu ben söylemedim.` }
    case 'pretender_aid':
      if (!p.granted)
        return p.why === 'backed'
          ? { icon: 'unhappy', title: `${crown(p.crown)} yardım etmedi`, text: `${crown(p.crown)} hükümdarı kardeşin ${p.name}'i senden çok seviyor; yardım istemeni geri çevirdi ve davacıyı destekliyor. Sarayda kardeşine kadeh kaldırıyorlarmış, lordum; ben duymadım say.` }
          : { icon: 'unhappy', title: `${crown(p.crown)} yardım etmedi`, text: `${crown(p.crown)} seninle ilişkisini yardım edecek kadar iyi görmüyor (en az ${balance.dynasty.intrigue.aid.minRelation} gerekir). Siparişler ve görevlerle tacın gözüne gir. Taç dalkavukluktan hoşlanır, lordum; ben bu işin ustasıyım.` }
      return p.kind === 'troops'
        ? { icon: 'shield', title: `${crown(p.crown)} asker gönderdi`, text: `Tacın askerleri ${p.name}'in karargâhına baskın yaptı: ${p.troops} asi düştü. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı. Taç işini bilir, lordum; hesabını da.` }
        : { icon: 'gold', title: `${crown(p.crown)} altın gönderdi`, text: `Taç isyana karşı hazinene ${p.gold} altın gönderdi. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı. Saydım, lordum; taç cimri değilmiş, ama cömert de sayılmaz.` }
    case 'pretender_crushed':
      return { icon: 'crown', title: 'İsyan bastırıldı', text: `Taht davacısı ${p.name}'in karargâhı dağıtıldı; ${p.name} savaşta öldü. Hanedan bir süre sakin kalacak. Aile sofrası biraz boş kalacak, lordum; ama huzurlu.${betrayalNote(p.offer, crown)}` }
    case 'pretender_siege':
      return { icon: 'swords', title: `${p.name} sarayını kuşatıyor!`, text: `Karargâh zamanında dağıtılamadı: ${p.name} ${p.soldiers} asiyle sarayına yürüdü. Karşısında ${p.garrison} asker, kuleler ve surlar var. Kuşatmayı kaybedersen tahtı o alır. Ben surlarda moral veriyorum, lordum; en arkadan, çok yüksek sesle.` }
    case 'throne_held':
      return { icon: 'crown', title: 'Taht korundu', text: `Sarayın taht davacısı ${p.name}'in kuşatmasına dayandı; ${p.name} düştü, asileri dağıldı. Mahzenden çıktım, lordum; zafer kutlamasına hazırım, kadehim de.${betrayalNote(p.offer, crown)}` }
    case 'throne_lost':
      return { icon: 'unhappy', title: `Tahtı ${p.name} aldı`, text: `${p.name} sarayı ele geçirdi. Hükümdar ${p.old || '?'} tahttan indirildi ve öldü; kraliçesi saraydan gitti, çocukları artık yeni hükümdarın yeğenleri. Hanedan ${p.name} ile sürüyor: yeni bir kraliçe alman gerekecek. Ben de yeni hükümdara aynı derin reveransı yaptım, lordum; mesleğim bu.` }
    // The crowns' houses and the lord's fealty (CLAUDE.md §7.8, §9.1.1).
    case 'crown_succession': {
      const regent = p.regent ? ` Yeni hükümdar henüz ${p.age} yaşında; reşit olana dek ${p.regent === true ? 'naipler meclisi' : `naip ${p.regent}`} yönetecek. Tahtta ayakları yere değmiyor, lordum.` : ''
      const kin = p.kinsman ? ' Ölen hükümdarın yaşayan çocuğu yoktu; taht hanedandan bir akrabaya geçti. Uzak bir kuzen, lordum; o kadar uzak ki kendisi de şaşırmış.' : ''
      return {
        icon: 'crown',
        title: `${crown(p.crown)}: ${p.ruler} tahtta`,
        text: `${crown(p.crown)} yasta: ${p.late} ${p.lateAge} yaşında öldü. Cenazede en içten ağlayan bendim, lordum; çok iyi ağlarım. Yeni hükümdar ${p.ruler} (huyu: ${String(p.trait).toLocaleLowerCase('tr-TR')}).${kin}${regent}${welcomeNote(p, online)} Yeni hükümdarın huyu tacın haraççılarının istediğini ve devriyesinin bahşişini biraz değiştirebilir; Diplomasi → Krallık'ta ayrıntısı var.`,
      }
    }
    case 'crown_rivalry': {
      const names = online.crowns
      const both = `${names[0] ?? 'Birinci taç'} ile ${names[1] ?? 'ikinci taç'}`
      const fx = balance.cities.crown.rivalry.effects
      if (p.stance === 'war')
        return { icon: 'swords', title: 'Taçlar savaşta!', text: `${both} birbirine savaş açtı. Savaş sürdükçe haraççılar hazinenin ×${String(fx.war.tribute).replace('.', ',')}'i kadarını ister, taçlar kendi lordlarını kollar (devriyenin bahşişi ×${String(fx.war.tip).replace('.', ',')}). Fil kavga eder, çimen ezilir, lordum; çimen biziz.` }
      const won = p.winner !== null && p.winner !== undefined ? Number(p.winner) : null
      const mine = won !== null && online.kingdoms.find((k) => k.id === online.me)?.liege === won
      if (p.prev === 'war')
        return {
          icon: won !== null ? 'crown' : 'flower',
          title: won !== null ? `${crown(won)} taç savaşını kazandı` : 'Taç savaşı bitti',
          text: `${both} arasındaki savaş bitti${p.stance === 'tension' ? ', ama gerginlik sürüyor' : ''}.${won !== null ? ` Zafer ${crown(won)} tacının.` : ''}${mine ? ` Bağlı olduğun tacın zaferi seni de gururlandırdı: onunla ilişkin +${balance.cities.crown.rivalry.victoryRelation}.` : ''} Ben iki tarafa da tebrik mektubu yazdım, lordum; garanti olsun.`,
        }
      return p.stance === 'tension'
        ? {
            icon: 'warn',
            title: 'Taçlar arasında gerginlik',
            text: `${vary(n, [`${both} arasında gerginlik var`, `${both} elçilerini geri çağırdı`, `${both} sınırlarına asker yığıyor`, `${both} arasında soğuk rüzgârlar esiyor`, `${both} ziyafette birbirine sırtını döndü`])}: haraççılar biraz daha çok ister. Sinirli taç, aç taç demektir, lordum.`,
          }
        : {
            icon: 'flower',
            title: 'Taçlar barıştı',
            text: vary(n, [
              `${both} arasındaki gerginlik yatıştı. Kimin haklı olduğunu hâlâ kimse bilmiyor, lordum.`,
              `${both} elçileri yeniden kadeh tokuşturuyor; gerginlik yatıştı. Ben de araya girip bir kadeh kaptım.`,
              `${both} arasında rüzgâr dindi; barış sürüyor.`,
              `${both} birbirine hediyeler gönderdi; gerginlik geride kaldı. Hediyelerin ikisi de çirkindi, ama niyet önemli.`,
            ]),
          }
    }
    case 'liege_switch':
      return p.accept
        ? { icon: 'banner', title: `Artık ${crown(p.to)} lordusun`, text: `${crown(p.from)} kardeşin ${p.name}'i sana karşı destekledi; sen de sancağını ${crown(p.to)} tarafına çevirdin. ${crown(p.to)} seni kollarını açarak karşıladı (ilişki en az +${balance.cities.crown.switch.newRelation}); ${crown(p.from)} bunu unutmayacak (ilişki en çok ${balance.cities.crown.switch.oldRelation}). Devriyeler ve haraççılar bundan sonra yeni bağlılığına göre gelir. Eski sancağı katlayıp sakladım, lordum; belli olmaz.` }
        : { icon: 'gold', title: `${crown(p.from)} özür diledi`, text: `${crown(p.from)} hanesine sadık kalmana çok sevindi: davacıyı desteklediği için özür diledi${Number(p.gold) > 0 ? `, hazinene ${fmt(Number(p.gold))} altın gönderdi` : ''} ve ilişkin +${balance.cities.crown.switch.declineRelation} arttı. Özür mektubu üç sayfaydı, lordum; ikisi kendini övüyordu.` }
    case 'liege_changed':
      return {
        icon: 'banner',
        title: `${p.by} taraf değiştirdi`,
        text: vary(n, [
          `${p.by}, kendisine karşı bir taht davacısını desteklediği için ${crown(p.from)} hanesinden ayrıldı ve ${crown(p.to)} tarafına geçti. Sancak terzileri bu sezon çok kazanıyor, lordum.`,
          `${p.by} sancağını indirip yenisini çekti: ${crown(p.from)} kendisine karşı taht davacısını desteklemişti, şimdi ${crown(p.to)} lordu.`,
          `${crown(p.from)} ${p.by} karşısında bir davacıyı tuttu; ${p.by} de ${crown(p.to)} tarafına geçerek karşılık verdi. Saray dedikodusu için harika bir hafta.`,
          `Saraylarda tek konu bu: ${p.by}, ${crown(p.from)} ihanetinden sonra ${crown(p.to)} tarafına geçti. Ben ilk duyanlardanım, lordum; ilk yayanlardan da.`,
        ]),
      }
    default:
      // A kind this page does not know yet: the game was updated while it was open.
      return { icon: 'scroll', title: 'Elçiden haber', text: 'Oyun güncellendi; bu haberi okumak için sayfayı yenile. Ben de okuyamadım, lordum; yazısı fazla yeni.' }
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
              <Icon name={icon} size={16} /> Elçi haber getirdi
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
              <DialogFoot label="Kabul et" onNext={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: true }), onClose())}>
                <button className="btn small danger" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: false }), onClose())}>
                  Reddet
                </button>
              </DialogFoot>
            ) : (
              <DialogFoot onNext={onClose}>
                {battle !== null && (
                  <button className="btn small" onClick={() => (online.watch(battle), onClose())}>
                    <Icon name="swords" size={16} /> İzle
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
    <DialogFoot label={`${fmt(amount)} altın öde`} disabled={sending} why="Cevabın haraççılara iletiliyor" onNext={() => answer(true)}>
      <button className="btn small danger" onClick={() => answer(false)}>
        Reddet
      </button>
      {talked === false && !talking && (
        <button className="btn small" onClick={onTalk}>
          <Icon name="scroll" size={16} /> Konuş
        </button>
      )}
    </DialogFoot>
  )
  if (!talking) {
    return (
      <div className="tribute-answer">
        {talked && amount !== asked && (
          <p className="muted">
            Haraççıyla konuştun: istenen {fmt(asked)} değil, {fmt(amount)} altın.
            {angry ? ` Kızgın gitti; reddedersen o tacın lordlarıyla ilişkin ${refusal} düşer.` : ''}
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
                ? 'Haraççı defterine bir şeyler karalıyor…'
                : amount < asked
                  ? `Haraç ${fmt(asked)} altından ${fmt(amount)} altına indi.`
                  : amount > asked
                    ? `Haraç ${fmt(asked)} altından ${fmt(amount)} altına çıktı.${angry ? ` Kızgın: reddedersen o tacın lordlarıyla ilişkin ${refusal} düşer.` : ''}`
                    : `Haraç aynı kaldı: ${fmt(amount)} altın.`}
              {!sending && ` Cevapsız bırakırsan oyundayken ${fmt(Math.round(amount * balance.cities.crown.patrol.tribute.afkFactor))} altın olarak kendiliğinden ödenir.`}
            </p>
            {buttons}
          </div>
        ) : reacting ? (
          <div className="advisor-replies">
            <button className="btn small primary" disabled={!done} data-why="Haraççı sözünü bitirsin" onClick={() => setReacting(false)}>
              Devam
            </button>
          </div>
        ) : (
          // Three short replies side by side; stacked when any is long.
          <div className={`talk-replies ${choices.some((r) => r.text.length > 46) ? 'stacked' : 'choices'}`} style={{ visibility: done ? 'visible' : 'hidden' }}>
            {choices.map((r, j) => (
              <button key={j} className="btn small talk-reply" disabled={!done} data-why="Haraççı sözünü bitirsin" onClick={() => pick(j)}>
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
