import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { balance, overreachOf, tributeTalk, tributeTalkReact, tributeTalkScript } from '@game/shared'
import { supabase } from '../lib/supabase'
import type { Envoy as EnvoyRow, Operation, PeaceTerms, SpyTopic } from '@game/shared'
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
import { CROWN_COLORS } from '../game/cities'
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
              : p.kind === 'marriage'
                ? `${p.from}, ${(p.terms as { name?: string } | null)?.name ?? 'bir'} adlı prensesini (${(p.terms as { age?: number } | null)?.age ?? '?'} yaşında) senin hanedanına gelin vermek istiyor. Kabul edersen prenses sarayına gelir ve ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} artar.`
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
              : p.kind === 'marriage'
                ? `Prenses ${p.bride} ${p.by} hanedanına gelin gitti. İlişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı.`
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
      if (p.kind === 'outlaw') return { icon: 'swords', title: `${p.name} yakalandı!`, text: `Ordun ${p.name} yağmacılarını yolda yakaladı; çarpışma başladı. Savaş tur tur sürecek; kazanırsan çetenin ganimeti senin.` }
      if (p.kind === 'pretender') return { icon: 'swords', title: `${p.name} karargâhına saldırı`, text: `Ordun taht davacısı ${p.name}'in karargâhına saldırdı. Çiti ve asileri savunuyor; kazanırsan isyan biter.` }
      if (p.kind === 'usurp') return { icon: 'swords', title: `${p.name} sarayını kuşatıyor!`, text: `Taht davacısı ${p.name} asileriyle sarayının kapısına dayandı. Garnizonun, kulelerin ve surların savunuyor; kaybedersen tahtı o alır.` }
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
      if (p.kind === 'outlaw') {
        const minutes = Math.round(balance.outlaws.bands.respawnSeconds / 60)
        return p.winner === 'attackers'
          ? { icon: 'chest', title: `${p.name} dağıtıldı!`, text: `Ordun yağmacıları yendi (kayıplar: ${losses}).${report.loot ? ` Çetenin ganimeti ambara girdi: ${goodsText({ ...report.loot })}.` : ''} Yollar bir süre temiz; çete ${minutes} dakika sonra yeniden toplanır.` }
          : { icon: 'warn', title: `${p.name} yağmacıları direndi`, text: `Ordun yağmacılara yenildi ve eve çekiliyor (kayıplar: ${losses}). Çete yolu tutmaya devam ediyor; daha büyük bir orduyla yeniden dene.` }
      }
      if (p.kind === 'pretender')
        return p.winner === 'attackers'
          ? { icon: 'crown', title: `${p.name} isyanı bastırıldı`, text: `Ordun karargâhı dağıttı (kayıplar: ${losses}). Taht davacısı ${p.name} savaşta öldü; hanedan bir süre sakin kalır.` }
          : { icon: 'warn', title: `${p.name} karargâhı direndi`, text: `Ordun yenildi ve eve çekiliyor (kayıplar: ${losses}). Karargâh ayakta; zamanı dolmadan daha büyük bir orduyla dön ya da taçtan yardım iste.` }
      if (p.kind === 'usurp')
        return p.winner === 'defenders'
          ? { icon: 'crown', title: 'Taht korundu!', text: `Sarayın ${p.name} asilerini püskürttü (kayıplar: ${losses}). Taht davacısı düştü.` }
          : { icon: 'unhappy', title: 'Saray düştü', text: `${p.name} asileri sarayı aldı (kayıplar: ${losses}).` }
      if (p.kind === 'revolt') {
        const r = balance.towns.rebels
        return p.winner === 'attackers'
          ? { icon: 'crown', title: `${p.name} ayaklanması bastırıldı`, text: `Ordun asileri dağıttı (kayıplar: ${losses}). Ayaklanma bitti, kasabanın sadakati +${r.quellLoyalty} arttı ve ${Math.round(r.quietSeconds / 60)} dakika yeniden ayaklanmaz; sadakati düşük kalırsa sonra yine ayaklanabilir.` }
          : { icon: 'warn', title: `${p.name} asileri direndi`, text: `Ordun asilere yenildi ve eve çekiliyor (kayıplar: ${losses}). Asiler kasabanın kapısında kalıyor; daha büyük bir orduyla yeniden gelebilirsin.` }
      }
      // Told from the lord's own side when the battle is known: "you won" reads better than "the defenders won".
      const fought = online.battles.find((b) => b.id === p.battle)
      const side = fought?.attackers.some((f) => f.kingdom === online.me) ? 'attackers' : fought?.defenders.some((f) => f.kingdom === online.me) ? 'defenders' : null
      const what = p.kind === 'siege' ? 'Kuşatma' : 'Savaş'
      const outcome = side ? (side === p.winner ? 'kazandın!' : 'yenildin') : `${p.winner === 'attackers' ? 'saldıranlar' : 'savunanlar'} kazandı`
      return { icon: 'swords', title: `${what} bitti: ${outcome}`, text: `Kayıplar: ${losses}.${loot}` }
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
    case 'outlaw_chase':
      return { icon: 'swords', title: `${p.name} peşindesin`, text: `Ordun ${p.name} yağmacılarının önünü kesmek için yola çıktı (yaklaşık ${fmt(Number(p.soldiers))} kişiler). Yağmacılar ordudan yavaş yürür; yakaladığı an savaş başlar. ${Math.round(balance.outlaws.bands.chase.maxSeconds / 60)} dakikada yakalayamazsa takibi bırakır.` }
    case 'outlaw_gone':
      return { icon: 'shield', title: 'Çete ortada yok', text: `${p.name} dağıtılmış; ordun takibi bıraktı ve olduğu yerde bekliyor.` }
    case 'outlaw_escaped':
      return { icon: 'warn', title: `${p.name} izini kaybettirdi`, text: `Ordun ${p.name} yağmacılarına yetişemedi ve takibi bıraktı; olduğu yerde bekliyor. Daha yakındaki bir orduyla yeniden dene.` }
    case 'outlaw_road':
      return {
        icon: 'warn',
        title: 'Yağmacılar yolu tuttu!',
        text: `Ticaret noktanın çevresindeki ticaret yolunun %${Math.round(Number(p.share) * 100)}'i yağmacıların elinde (${p.bands} çete). Tüccarının altınının %${Math.round(Number(p.cut) * 100)}'ini kesiyorlar ve halk tedirgin. Haritada çeteye tıkla, bir ordu seç ve "Takip et".`,
      }
    case 'outlaw_road_clear':
      return { icon: 'shield', title: 'Yollar temizlendi', text: 'Ticaret noktanın çevresindeki yollarda yağmacı kalmadı; tüccarın yine tam kazanıyor.' }
    case 'pirate_waters':
      return {
        icon: 'ship',
        title: 'Korsanlar sularında!',
        text: `İskelenin yakınında ${p.boats} korsan teknesi dolaşıyor (korsanların etkisi %${Math.round(Number(p.share) * 100)}): deniz ticaretine saldırı olasılığı arttı, balık azaldı, halk tedirgin. Haritada kara yelkenli tekneye tıkla, savaş gemili bir filo seç ve "Takip et".`,
      }
    case 'pirate_waters_clear':
      return { icon: 'anchor', title: 'Sular temizlendi', text: 'İskelenin önündeki sularda korsan kalmadı.' }
    case 'pirate_battle': {
      const lostShips = Object.values((p.loss ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0)
      const might = `filonun gücü ${String(Math.round(Number(p.fleetMight) * 10) / 10).replace('.', ',')}, korsanlarınki ${String(Math.round(Number(p.might) * 10) / 10).replace('.', ',')}`
      return p.won
        ? { icon: 'chest', title: `${p.name} batırıldı!`, text: `Filon korsanları yakaladı ve yendi (${might}; zarlar ${(p.rolls as number[])?.join('–')}).${lostShips ? ` ${lostShips} gemi kaybettin.` : ' Kayıp yok.'}${p.loot ? ` Ödül ve ganimet: ${goodsText(p.loot)}.` : ''}` }
        : { icon: 'warn', title: `${p.name} korsanları kazandı`, text: `Filon korsanlara yenildi (${might}; zarlar ${(p.rolls as number[])?.join('–')})${lostShips ? ` ve ${lostShips} gemi kaybetti` : ''}. Korsanlar dolaşmaya devam ediyor; daha güçlü bir filoyla (kadırgalar korsanları yener) yeniden dene.` }
    }
    case 'pirate_gone':
      return { icon: 'anchor', title: 'Korsanlar ortada yok', text: `${p.name} batırılmış; filon takibi bıraktı.` }
    case 'pirate_escaped':
      return { icon: 'warn', title: `${p.name} kaçtı`, text: `Filon ${p.name} korsanlarına yetişemedi ve takibi bıraktı.` }
    // ---- The lord's house (CLAUDE.md §9.1.1) ----
    case 'kin_unhappy': {
      const brother = p.kinship === 'sibling'
      return {
        icon: 'unhappy',
        title: `${brother ? 'Kardeşin' : 'Oğlun'} ${p.name} hoşnutsuz`,
        text: `Saray kulağı fısıldıyor: ${brother ? 'kardeşin' : 'oğlun'} ${p.name} senden pek hoşnut değil (${p.opinion}). ${
          brother
            ? `Daha da soğursa (${balance.dynasty.intrigue.revolt.below} altı) asker toplayıp sana isyan edebilir ve tahtını isteyebilir. Ona bir görev ver, hediye gönder ya da halkını mutlu et.`
            : 'Ona bir görev ver ya da hediye gönder; Saray → Hanedan.'
        }`,
      }
    }
    case 'kin_role': {
      const role = p.role as string | null
      const name = p.name as string
      const s = (p.skills ?? {}) as Record<string, number>
      const I = balance.dynasty.intrigue.roles
      if (role === null) return { icon: 'scroll', title: `${name} görevden alındı`, text: `${name} artık ${p.was === 'governor' ? 'vali' : p.was === 'commander' ? 'devriye komutanı' : 'hazinedar'} değil. Böyle bir şey kolay unutulmaz; sana gücendi.` }
      if (role === 'governor')
        return { icon: 'crown', title: `${name} ${p.town} valisi`, text: `${name} ${p.town} kasabasına vali olarak gitti. Kasabanın sadakat hedefi +${Math.round(Math.max(0, I.governor.loyalty + ((s.people ?? 5) - 5) * I.governor.perPeople))} arttı; görev verdiğin için sana da ısındı.` }
      if (role === 'commander')
        return { icon: 'banner', title: `${name} tacın devriyesinin başında`, text: `${name} bağlı olduğun tacın devriyesinin komutasını aldı: devriyenin bahşişi artar, her uğrayışta taç seni biraz daha sever. Taç onu da sever; aklında olsun.` }
      return { icon: 'gold', title: `${name} hazinedar`, text: `${name} hazinenin başına geçti: vergi +%${Math.round(Math.max(0, (s.finance ?? 5) - I.treasurer.from) * I.treasurer.taxPerFinance * 100)}.` }
    }
    case 'house_marriage':
      if (p.kind === 'bride') return { icon: 'flower', title: `${p.from} hanedanından gelin geldi`, text: `${p.from} hanedanının prensesi ${p.name} sarayına geldi. İki hanedan artık akraba; ilişkiniz +${balance.dynasty.intrigue.marriage.lord.relation} arttı.` }
      if (p.kind === 'crown') return { icon: 'flower', title: `Prenses ${p.name} ${crown(p.crown)} sarayında`, text: `Prenses ${p.name} ${crown(p.crown)} hükümdar ailesine gelin gitti. Taçla ilişkin +${balance.dynasty.intrigue.marriage.crown.relation} arttı; bundan sonra taç seni hep biraz daha yakın tutar.` }
      return p.free
        ? { icon: 'crown', title: `${p.town} artık senin!`, text: `Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti; kasaba kılıç çekilmeden sana bağlandı. Sadakati %${balance.dynasty.intrigue.marriage.town.freeLoyalty} ile başlıyor, prenses orada kaldıkça +${balance.dynasty.intrigue.marriage.town.loyalty}.${overreachNote(online, 0)}` }
        : { icon: 'flower', title: `Prenses ${p.name} ${p.town} kasabasında`, text: `Prenses ${p.name} ${p.town} kasabasının ileri gelen ailesine gelin gitti. Kasabanın sadakat hedefi kalıcı olarak +${balance.dynasty.intrigue.marriage.town.loyalty}.` }
    case 'pretender_rise':
      return {
        icon: 'swords',
        title: `Kardeşin ${p.name} isyan etti!`,
        text: `${p.name} tahtı istiyor. ${Number(p.deserters) > 0 ? `Garnizonundan ${p.deserters} asker ona katıldı; ` : ''}${p.soldiers} asiyle sınırının yakınında bir karargâh kurdu. ${p.minutes} dakika içinde karargâhı kuşatıp dağıtmazsan büyüyüp sarayını kuşatacak; kuşatmayı kaybedersen tahtı o alır.${
          p.backed ? ` Kötü haber: ${crown(p.crown)} onu senden çok seviyor ve onu destekliyor; karargâh daha hızlı büyüyecek.` : p.crown !== null && p.crown !== undefined ? ` ${crown(p.crown)} şimdilik senin yanında; ondan asker ya da altın isteyebilirsin.` : ''
        } Saray → Hanedan'dan ordu gönderebilirsin.`,
      }
    case 'pretender_grow':
      return p.soon
        ? { icon: 'warn', title: `${p.name} yürümeye hazırlanıyor`, text: `Taht davacısının karargâhında ${p.soldiers} asi var. ${p.minutes} dakika sonra sarayını kuşatacak; ya karargâhı şimdi dağıt ya da garnizonunu, kulelerini ve surlarını hazırla.` }
        : { icon: 'warn', title: `${p.name} karargâhı büyüyor`, text: `Karargâha her gün yeni asiler katılıyor: ${p.soldiers} asi${p.backed ? ', tacın desteğiyle' : ''}. ${p.minutes} dakika sonra sarayına yürüyecek.` }
    case 'pretender_aid':
      if (!p.granted)
        return p.why === 'backed'
          ? { icon: 'unhappy', title: `${crown(p.crown)} yardım etmedi`, text: `${crown(p.crown)} hükümdarı kardeşin ${p.name}'i senden çok seviyor; yardım istemeni geri çevirdi ve davacıyı destekliyor.` }
          : { icon: 'unhappy', title: `${crown(p.crown)} yardım etmedi`, text: `${crown(p.crown)} seninle ilişkisini yardım edecek kadar iyi görmüyor (en az ${balance.dynasty.intrigue.aid.minRelation} gerekir). Siparişler ve görevlerle tacın gözüne gir.` }
      return p.kind === 'troops'
        ? { icon: 'shield', title: `${crown(p.crown)} asker gönderdi`, text: `Tacın askerleri ${p.name}'in karargâhına baskın yaptı: ${p.troops} asi düştü. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı.` }
        : { icon: 'gold', title: `${crown(p.crown)} altın gönderdi`, text: `Taç isyana karşı hazinene ${p.gold} altın gönderdi. Taçla ilişkin ${balance.dynasty.intrigue.aid.relationCost} azaldı.` }
    case 'pretender_crushed':
      return { icon: 'crown', title: 'İsyan bastırıldı', text: `Taht davacısı ${p.name}'in karargâhı dağıtıldı; ${p.name} savaşta öldü. Hanedan bir süre sakin kalacak.` }
    case 'pretender_siege':
      return { icon: 'swords', title: `${p.name} sarayını kuşatıyor!`, text: `Karargâh zamanında dağıtılamadı: ${p.name} ${p.soldiers} asiyle sarayına yürüdü. Karşısında ${p.garrison} asker, kuleler ve surlar var. Kuşatmayı kaybedersen tahtı o alır.` }
    case 'throne_held':
      return { icon: 'crown', title: 'Taht korundu', text: `Sarayın taht davacısı ${p.name}'in kuşatmasına dayandı; ${p.name} düştü, asileri dağıldı.` }
    case 'throne_lost':
      return { icon: 'unhappy', title: `Tahtı ${p.name} aldı`, text: `${p.name} sarayı ele geçirdi. Hükümdar ${p.old || '?'} tahttan indirildi ve öldü; kraliçesi saraydan gitti, çocukları artık yeni hükümdarın yeğenleri. Hanedan ${p.name} ile sürüyor: yeni bir kraliçe alman gerekecek.` }
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
    <DialogFoot label={`${fmt(amount)} altın öde`} disabled={sending} onNext={() => answer(true)}>
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
            <button className="btn small primary" disabled={!done} onClick={() => setReacting(false)}>
              Devam
            </button>
          </div>
        ) : (
          // Three short replies side by side; stacked when any is long.
          <div className={`talk-replies ${choices.some((r) => r.text.length > 46) ? 'stacked' : 'choices'}`} style={{ visibility: done ? 'visible' : 'hidden' }}>
            {choices.map((r, j) => (
              <button key={j} className="btn small talk-reply" disabled={!done} onClick={() => pick(j)}>
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
