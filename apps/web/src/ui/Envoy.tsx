import { useEffect } from 'react'
import { balance, overreachOf } from '@game/shared'
import type { Envoy as EnvoyRow, Operation, PeaceTerms, SpyTopic } from '@game/shared'
import type { Notice } from '../net/online'
import { Icon } from './icons'
import type { IconName } from './icons'
import { RESOURCE_NAMES } from './names'
import { NoticeArt, noticeLook, soundForNotice } from './NoticeArt'
import { playOnce } from '../audio/sfx'
import { EnvoyPortrait } from './advisor/EnvoyPortrait'
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
  return ` ${more > 0 ? 'Alırsan' : 'Artık'} elinde ${held} kasaba ${more > 0 ? 'olur' : 'var'}: aşırı büyüme her kasabanın sadakatini ${o.loyalty}${o.loyaltyCap < 100 ? ` düşürür ve %${o.loyaltyCap}'in üstüne çıkmasına izin vermez` : ' düşürür'}, halkının mutluluğu ${o.happiness}, bakım ×${String(o.upkeepFactor).replace('.', ',')}.${last ? ' Bu kadar kasabada ayaklanmalar kesindir.' : ''}`
}

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
            ? `${p.from} her üretim turunda ${p.gold} altın haraç istiyor. Kabul edersen ilişkiniz ${balance.diplomacy.tribute.accept} düşer; reddedersen ${balance.diplomacy.tribute.reject} düşer.`
            : p.kind === 'alliance'
              ? `${p.from} seninle ittifak kurmak istiyor. Müttefik orduları birbirini korur.`
              : `${p.from} savaşı bitirmek için barış teklif ediyor: ${describeTerms(p.terms as PeaceTerms | null)}.`,
      }
    case 'envoy_courtesy':
      return p.kind === 'gift'
        ? { icon: 'gold', title: `${p.from} hediye gönderdi`, text: `${p.gold} altın hazinene eklendi; ilişkiniz iyileşti.` }
        : { icon: 'scroll', title: `${p.from} elçisi geldi`, text: `${p.from} ilişkilerinizi geliştirmek istiyor (+${balance.diplomacy.improve.gain}).` }
    case 'envoy_answer':
      return {
        icon: p.accepted ? 'happy' : 'unhappy',
        title: `${p.by}: ${kind(p.kind)} ${p.accepted ? 'kabul edildi' : p.expired ? 'cevapsız kaldı' : 'reddedildi'}`,
        text: p.accepted
          ? p.kind === 'tribute'
            ? `${p.by} artık her turda ${p.gold} altın ödeyecek.`
            : p.kind === 'alliance'
              ? `${p.by} artık müttefikin.`
              : 'Savaş bitti.'
          : p.kind === 'tribute'
            ? `İlişkiniz ${-balance.diplomacy.tribute.reject} düştü.`
            : '',
      }
    case 'war_declared':
      return {
        icon: 'swords',
        title: 'Savaş ilan edildi!',
        text: `${p.by} savaş ilan etti${p.on === me ? '; hedef sensin' : ` (hedef: ${p.on})`}${p.claim ? '' : ', hiçbir gerekçe göstermeden'}.`,
      }
    case 'peace_enforced':
      return { icon: 'banner', title: 'Barış dayatıldı', text: `${p.from} savaşı ezici bir üstünlükle kazandı ve barışı dayattı: ${describeTerms(p.terms as PeaceTerms | null)}.` }
    case 'operation_foiled':
      return { icon: 'eye', title: 'Casus operasyonu önlendi', text: `${p.by} adına ${OPERATION_NAMES[p.op as Operation].toLowerCase()} isteyen bir casus yakalandı. Artık onlara karşı savaş gerekçen var.` }
    case 'operation_struck':
      return {
        icon: 'warn',
        title: p.op === 'kidnap' ? 'Kraliçen kaçırıldı!' : p.op === 'revolt' ? 'Halk ayaklandı!' : p.op === 'townRevolt' ? `${p.town ?? 'Kasaban'} kışkırtıldı!` : 'Sabotaj!',
        text:
          p.op === 'townRevolt'
            ? `Kimliği belirsiz kışkırtıcılar ${p.town ?? 'bir kasaban'} halkını sana karşı doldurdu: kasabanın sadakati ${-balance.espionage.operations.townRevolt.loyalty} düştü. Sadakat ${balance.towns.revolt.below}'in altındaysa kasaba ayaklanır; bakımını artırarak gönüllerini kazanabilirsin.`
            : p.op === 'kidnap'
            ? `${p.by} casusları kraliçeni kaçırdı. Fidye ödeyebilir ya da savaş açabilirsin (savaş gerekçen var).`
            : p.op === 'revolt'
              ? 'Kışkırtıcılar halkı ayaklandırdı: üretim bir süre yarıya indi.'
              : p.op === 'burn'
                ? 'Kimliği belirsiz sabotajcılar depolarını ateşe verdi.'
                : 'Sabotajcılar inşaatlarını geciktirdi.',
      }
    case 'ransom_paid':
      return { icon: 'gold', title: 'Fidye ödendi', text: `${p.by} kraliçesi için ${p.gold} altın fidye ödedi.` }
    case 'queen_released':
      return { icon: 'happy', title: 'Kraliçen döndü', text: `${p.by} kraliçeni serbest bıraktı.` }
    case 'alliance_broken':
      return { icon: 'unhappy', title: 'İttifak bozuldu', text: `${p.by} ittifakınızı bozdu.` }
    case 'tribute_ended':
      return { icon: 'gold', title: 'Haraç bitti', text: p.renege ? `${p.by} haracı kesti; sözünden döndü.` : `${p.by} haracı bağışladı.` }
    case 'spy_caught':
      return { icon: 'eye', title: 'Casus yakalandı', text: `Topraklarında ${p.owner} adına ${TOPIC_NAMES[p.topic as SpyTopic]} bilgisi toplayan bir casus yakalandı.` }
    case 'spy_lost':
      return { icon: 'eye', title: 'Casusun yakalandı', text: `${p.target} topraklarındaki casusun yakalandı. İlişkiniz bozuldu.` }
    case 'envoy_insult':
      return { icon: 'unhappy', title: `${p.from} elçisi hakaret etti!`, text: `"${INSULTS[Number(p.seed ?? 0) % INSULTS.length]}" İlişkiniz ${balance.diplomacy.insult.relation} düştü; artık onlara karşı savaş gerekçen var.` }
    case 'insult_delivered':
      return { icon: 'scroll', title: 'Hakaretin iletildi', text: `Elçin ${p.to} sarayında ağzına geleni söyledi. İlişkiniz ${balance.diplomacy.insult.relation} düştü; onlar da sana karşı savaş gerekçesi kazandı.` }
    case 'army_threat':
      return { icon: 'warn', title: 'Düşman ordusu sınırda!', text: `${p.by} ordusu sınırına kamp kurdu. Ordu orada kaldıkça halkın korkuyor ve mutluluğu düşüyor.` }
    case 'trade_raided':
      return {
        icon: 'warn',
        title: 'Ticaret yolun yağmalandı!',
        text: `${p.by} askerleri tüccarını bastı${p.units ? ` ve ${fmt(Number(p.units))} ${RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? ''} götürdü` : ''}. Ticaret noktan harap; onarana kadar satış yapılamaz. Onarmak için ticaret noktasına tıkla ya da Ticaret sekmesini aç (${balance.economy.trade.repairCost.gold} altın, ${balance.economy.trade.repairCost.materials} yapı malzemesi). Savaş gerekçen var.`,
      }
    case 'raid_repelled':
      return { icon: 'shield', title: 'Yağmacılar püskürtüldü', text: `${p.by} askerleri ticaret yolunu basmaya çalıştı ama geri püskürtüldü. Savaş gerekçen var.` }
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
              ? `İskelesi artık abluka altında: balığı, deniz ticareti durdu.`
              : `İskelen abluka altında: balık tutulamıyor, deniz ticareti durdu. Bir filoyla ablukayı yarabilirsin.`
            : mine
              ? 'Filon püskürtüldü ve eve dönüyor.'
              : 'Saldıranlar geri püskürtüldü.'
          : p.kind === 'raid'
            ? p.winner === 'attackers'
              ? mine
                ? `Filon ${loot || 'ganimetle'} dönüyor.`
                : `Akıncılar depolarından ${loot || 'mal'} götürdü.`
              : mine
                ? 'Akın püskürtüldü; filo eve dönüyor.'
                : 'Akıncılar geri püskürtüldü.'
            : p.winner === 'attackers'
              ? mine
                ? 'Abluka kırıldı!'
                : 'Ablukacı filon yenildi ve eve dönüyor.'
              : mine
                ? 'Abluka sürüyor.'
                : 'Ablukayı yarma girişimi püskürtüldü.'
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
        text: p.why === 'peace' ? 'Savaş bitti; düşman filosu iskelenin önünden çekildi.' : p.why === 'sortie' ? 'Filon ablukayı yardı!' : `${p.by} filosu iskelenin önünden çekildi.`,
      }
    case 'fleet_turned':
      return {
        icon: 'ship',
        title: 'Filo geri döndü',
        text: `Filon ${p.target} iskelesine vardı ama ${p.why === 'dock' ? 'orada iskele yok' : p.why === 'taken' ? 'başka bir donanma zaten abluka ediyor' : 'artık savaşta değilsiniz'}; eve dönüyor.`,
      }
    case 'battle_start':
      if (p.kind === 'revolt') return { icon: 'swords', title: `${p.name} asileriyle çarpışma başladı`, text: `Ordun ${p.name} kapısındaki asilerin üstüne yürüdü. Savaş tur tur sürecek; kazanırsan ayaklanma biter.` }
      return {
        icon: 'swords',
        title: p.kind === 'siege' ? 'Kuşatma başladı!' : 'Savaş başladı!',
        text: `${(p.sides as string[][])[0].join(', ')} ile ${(p.sides as string[][])[1].join(', ')} karşı karşıya. Savaş tur tur sürecek.`,
      }
    case 'battle_end': {
      const report = p.report as { winner: string; losses: Record<string, number>; loot?: Record<string, number> }
      const losses = Object.entries(report.losses).map(([name, n]) => `${name} ${fmt(n)}`).join(', ')
      const loot = report.loot ? ` Yağma: ${Object.entries(report.loot).map(([r, v]) => `${fmt(v)} ${RESOURCE_NAMES[r as keyof typeof RESOURCE_NAMES].toLowerCase()}`).join(', ')}.` : ''
      if (p.kind === 'revolt') {
        const r = balance.towns.rebels
        return p.winner === 'attackers'
          ? { icon: 'crown', title: `${p.name} ayaklanması bastırıldı`, text: `Ordun asileri dağıttı (kayıplar: ${losses}). Ayaklanma bitti, kasabanın sadakati +${r.quellLoyalty} arttı ve ${Math.round(r.quietSeconds / 60)} dakika yeniden ayaklanmaz; sadakati düşük kalırsa sonra yine ayaklanabilir.` }
          : { icon: 'warn', title: `${p.name} asileri direndi`, text: `Ordun asilere yenildi ve eve çekiliyor (kayıplar: ${losses}). Asiler kasabanın kapısında kalıyor; daha büyük bir orduyla yeniden gelebilirsin.` }
      }
      return { icon: 'swords', title: `${p.kind === 'siege' ? 'Kuşatma' : 'Savaş'} bitti: ${p.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`, text: `Kayıplar: ${losses}.${loot}` }
    }
    case 'siege_people':
      return p.taken
        ? { icon: 'unhappy', title: 'Halk sarayı terk ediyor', text: `${p.by} sarayını düşürdü; korkuya kapılan ${fmt(Number(p.lost))} köylü lordluğunu terk etti. Evler boş kaldı, halk ancak zamanla geri gelir.` }
        : { icon: 'unhappy', title: 'Kuşatma halkı kaçırıyor', text: `${p.by} ordusu sarayını kuşattı; ${fmt(Number(p.lost))} köylü canını kurtarmak için kaçtı. Kuşatma sürdükçe kaçanlar artacak, halk büyümeyecek.` }
    case 'king_command':
      return p.lead
        ? { icon: 'crown', title: 'Kral ordunun başında', text: `${p.king} ordusunun başına geçti. Emirlerini kendisi verecek: elçi beklemeden, hemen uygulanır. Savaş yeteneği zarlara tam sayılır; ama ordu yenilirse kral savaşta düşebilir.` }
        : { icon: 'home', title: 'Kral saraya döndü', text: `${p.king || 'Kral'} ordunun komutasını bıraktı ve sarayına döndü. Ordunun emirleri yine elçiyle gider.` }
    case 'king_fell':
      return Number(p.lord) === online.me
        ? { icon: 'unhappy', title: 'Kral savaşta düştü!', text: `Hükümdar ${p.king} ordusunun başında savaşırken öldü. Ordu onsuz yoluna devam ediyor; tahta kimin geçeceğini hanedan belirleyecek.` }
        : { icon: 'swords', title: `${p.name} hükümdarı düştü`, text: `${p.name} hükümdarı ${p.king} ordusunun başında savaşırken öldü.` }
    case 'tower_losses':
      return { icon: 'warn', title: 'Gözcü kuleleri ateş açtı', text: `Düşman kuleleri ordundan ${p.killed} askeri vurdu.` }
    case 'order_failed':
      if (p.why === 'peace') return { icon: 'warn', title: 'Kasaba kuşatılamadı', text: 'Ordun kasabaya vardı ama kasabanın sahibiyle savaşta değilsin; kuşatma yapamaz. Ordu orada bekliyor.' }
      if (p.why === 'calm') return { icon: 'shield', title: 'Bastırılacak ayaklanma yok', text: 'Ordun kasabana vardı ama orada asi yok; ordu kapıda bekliyor.' }
      return { icon: 'warn', title: 'Emir yerine getirilemedi', text: 'Elçi orduya ulaştı ama emir uygulanamadı (yol yok ya da ordu savaşta).' }
    case 'town_siege': {
      const mine = p.by === me
      const minutes = Math.round(balance.towns.siegeSeconds / 60)
      return mine
        ? { icon: 'swords', title: `${p.name} kuşatılıyor`, text: `Ordun ${p.name} kasabasını kuşattı. Ordu orada kaldıkça kuşatma ${minutes} dakikada biter; ilerlemesi kasabanın üstünde görünür.${overreachNote(online, 1)}` }
        : { icon: 'warn', title: `${p.name} kuşatma altında!`, text: `${p.by} ordusu ${p.name} kasabanı kuşattı. ${minutes} dakika içinde ordunla gelip kuşatmayı kıramazsan kasaba onların olur.${Number(p.relation) < 0 ? ` ${p.by} ile ilişkin ${-Number(p.relation)} düştü.` : ''}` }
    }
    case 'town_siege_lifted':
      return { icon: 'shield', title: `${p.name} kuşatması kalktı`, text: `${p.name} önündeki kuşatma sona erdi: kuşatan ordu gitti, yenildi ya da artık savaşta değilsiniz.` }
    case 'town_taken': {
      const mine = p.by === me
      return mine
        ? { icon: 'crown', title: `${p.name} artık senin!`, text: `${p.name} kasabası kapılarını açtı${Number(p.lost) > 0 ? `; ${fmt(Number(p.lost))} asker kaybettin` : ''}. Bundan sonra sana katkı gönderecek.${overreachNote(online, 0)}` }
        : { icon: 'warn', title: `${p.name} elden çıktı`, text: `${p.by} ${p.name} kasabanı aldı. Kasabanın katkısı artık onlara gidiyor.` }
    }
    case 'patrol_tribute': {
      // How much of the treasury it is (newer notices carry the treasury as it stood).
      const share = Number(p.gold) > 0 ? ` (hazinenin %${Math.max(1, Math.round((Number(p.amount) / Number(p.gold)) * 100))} kadarı)` : ''
      return {
        icon: 'banner',
        title: `${crown(p.crown)} haraççıları kapında`,
        text: `Rakip taç ${crown(p.crown)} haraççıları sarayına geldi (her ${Math.round(balance.cities.crown.patrol.tribute.everySeconds / 60)} dakikada bir gelirler) ve ${fmt(Number(p.amount))} altın${share} haraç istiyor. Ödersen yollarına giderler. Reddedersen o tacın lordlarıyla ilişkin ${-balance.cities.crown.patrol.refuseRelation} düşer. ${Math.round(balance.cities.crown.patrol.answerSeconds / 60)} dakika içinde cevap vermezsen haraç kendiliğinden ödenir, ama oyundaysan %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla: ${fmt(Math.round(Number(p.amount) * balance.cities.crown.patrol.tribute.afkFactor))} altın.`,
      }
    }
    case 'patrol_tip':
      return { icon: 'gold', title: 'Devriye eğlenip gitti', text: `${crown(p.crown)} devriyesi eğlence merkezinde soluklandı, içti, şarkı söyledi ve ${fmt(Number(p.amount))} altın bahşiş bıraktı.` }
    case 'patrol_visit':
      return {
        icon: 'crown',
        title: 'Taç devriyesi uğradı',
        text: `${crown(p.crown)} devriyesi sarayının önüne geldi, selam verdi ve yoluna devam etti; tacınla ilişkin +${fmt(Number(p.relation ?? 1))}. Bir eğlence merkezin (4. seviye saray) olsaydı içip eğlenir ve bahşiş bırakırlardı.`,
      }
    case 'crown_gift': {
      const goods = Object.entries((p.goods ?? {}) as Record<string, number>).map(([g, v]) => `${fmt(v)} ${RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? g}`)
      return {
        icon: 'chest',
        title: `${crown(p.crown)} armağan gönderdi`,
        text: `Devriye, hükümdarın sana duyduğu yakınlığın işareti olarak «${p.name}» getirdi: ${[...(Number(p.gold) > 0 ? [`${fmt(Number(p.gold))} altın`] : []), ...goods].join(', ')}.`,
      }
    }
    case 'patrol_taken':
      return p.afk
        ? {
            icon: 'gold',
            title: 'Haraç fazlasıyla ödendi',
            text: `Oyundaydın ama ${crown(p.crown)} haraççılarına cevap vermedin; haraç kendiliğinden, %${Math.round((balance.cities.crown.patrol.tribute.afkFactor - 1) * 100)} fazlasıyla ödendi: ${fmt(Number(p.amount))} altın${Number(p.asked) > 0 ? ` (istenen ${fmt(Number(p.asked))})` : ''}. Zamanında ödersen ya da reddedersen bu fazlalık olmaz.`,
          }
        : { icon: 'gold', title: 'Haraç ödendi', text: `Sen yokken ${crown(p.crown)} haraççıları geldi; olağan haracı, ${fmt(Number(p.amount))} altın ödedin.` }
    case 'patrol_ignored':
      return { icon: 'warn', title: 'Haraç cevapsız kaldı', text: `${crown(p.crown)} devriyesi ${fmt(Number(p.amount))} altınını alamadan döndü. O tacın lordları bunu unutmayacak: ilişkin ${-balance.cities.crown.patrol.refuseRelation} düştü.` }
    case 'town_revolt':
      return {
        icon: 'unhappy',
        title: `${p.name} ayaklandı!`,
        text: `${p.name} halkı sana karşı ayaklandı: ${p.minutes ?? Math.round(balance.towns.revolt.seconds / 60)} dakika boyunca hiçbir şey göndermeyecek${Number(p.rebels) > 0 ? ` ve ${p.rebels} asi kasabanın kapısını tuttu` : ''}. Ordunu gönderip asileri yenersen ayaklanma biter (kasabanın panelinde "Ayaklanmayı bastır"). Yoksa ayaklanma bittiğinde sadakat hâlâ ${balance.towns.revolt.breakAwayBelow}'nin altındaysa kasaba senden kopar ve asiler onun garnizonu olur.`,
      }
    case 'town_lost_revolt':
      return { icon: 'warn', title: `${p.name} senden koptu`, text: `${p.name} halkı ayaklanmayı sonuna götürdü ve sana bağlılığını bıraktı. Kasaba artık kimseye bağlı değil; küçük bir garnizonla kendini savunuyor, yeniden kuşatıp alabilirsin.` }
    case 'town_sale': {
      const good = RESOURCE_NAMES[p.good as keyof typeof RESOURCE_NAMES]?.toLowerCase() ?? String(p.good)
      return {
        icon: 'gold',
        title: 'Kasabadan iyi haber',
        text: `${p.by}, ${p.name} kasabanın pazarından ${fmt(Number(p.units))} ${good} aldı; hazinene ${fmt(Number(p.gold))} altın girdi.${Number(p.wasted) > 0 ? ` Hazine dolu olduğu için ${fmt(Number(p.wasted))} altın boşa gitti.` : ''}`,
      }
    }
    case 'cargo_home': {
      const goods = goodsText(p.goods)
      return {
        icon: 'chest',
        title: 'Ordun yükünü getirdi',
        text: `Kasabadan alınan mallar saraya ulaştı${goods ? `: ${goods} ambara girdi` : ''}.${Number(p.wasted) > 0 ? ` Ambar dolu olduğu için ${fmt(Number(p.wasted))} birim boşa gitti.` : ''}`,
      }
    }
    case 'cargo_lost':
      return { icon: 'warn', title: 'Yük kaybedildi', text: `Ordun yenildi; kasabadan taşıdığı mallar (${goodsText(p.goods)}) savaş alanında kaldı.` }
    case 'town_held':
      return { icon: 'warn', title: `${p.name} dayandı`, text: `${p.name} garnizonu kuşatmayı püskürttü; ordundan ${fmt(Number(p.lost))} asker düştü, kimse kalmadı.` }
    default:
      // A kind this page does not know yet: the game was updated while it was open.
      return { icon: 'scroll', title: 'Elçiden haber', text: 'Oyun güncellendi; bu haberi okumak için sayfayı yenile.' }
  }
}

export function EnvoyDialog({ notice, online, onClose }: { notice: Notice; online: Online; onClose: () => void }) {
  const { icon, title, text } = describe(notice, online)
  const p = notice.payload as Record<string, unknown>
  const pending = notice.kind === 'envoy_proposal' && online.envoys.some((e) => e.id === p.envoy && e.status === 'pending')
  // A rival crown's demand, answerable until it runs out.
  const demand = notice.kind === 'patrol_tribute' && Number(p.expiresAt) > Date.now()
  const battle = notice.kind.startsWith('battle') ? (p.battle as number) : null
  const look = noticeLook(notice, online)
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
        <div className="fortune-art">
          <NoticeArt look={look} />
        </div>
        <div className="fortune-body">
          {text && <p>{text}</p>}
          <div className="row spread">
            {demand ? (
              <>
                <button className="btn small danger" onClick={() => (online.act({ type: 'patrolAnswer', visit: p.visit as number, pay: false }), onClose())}>
                  Reddet
                </button>
                <button className="btn small" onClick={() => (online.act({ type: 'patrolAnswer', visit: p.visit as number, pay: true }), onClose())}>
                  <Icon name="gold" size={16} /> {fmt(Number(p.amount))} altın öde
                </button>
              </>
            ) : pending ? (
              <>
                <button className="btn small danger" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: false }), onClose())}>
                  Reddet
                </button>
                <button className="btn small" onClick={() => (online.act({ type: 'respond', envoy: p.envoy as number, accept: true }), onClose())}>
                  Kabul et
                </button>
              </>
            ) : (
              <>
                {battle !== null ? (
                  <button className="btn small" onClick={() => (online.watch(battle), onClose())}>
                    <Icon name="swords" size={16} /> İzle
                  </button>
                ) : (
                  <span />
                )}
                <button className="btn small" onClick={onClose}>
                  Tamam
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
