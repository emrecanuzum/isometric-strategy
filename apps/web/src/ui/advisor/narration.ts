import { PROJECT_IDS } from '@game/shared'
import { EXPEDITION_TEXTS } from '../expeditionNames'
import { RESEARCH_NAMES, RESOURCE_NAMES, UNIT_NAMES } from '../names'
import { PROJECT_TEXTS } from '../hud/projects'

// The envoy's word on what the lord has just done (CLAUDE.md §9.8 "Elçinin notu"): a sermon preached, a festival
// held, a gift sent to the crown, a research begun… The game tells what follows from the lord's acts, not only what
// befalls him. Each act has a few ways of saying it, one picked at random; acts with a window of their own (crises,
// dilemmas, envoys' answers, the tribute talk) are left to that window.

type Cmd = { type?: string; [key: string]: unknown }
const any = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const lower = (s: string) => s.toLocaleLowerCase('tr')

export function narrate(c: Cmd): string | null {
  switch (c.type) {
    case 'sermon':
      return any([
        'Rahipler kürsüye çıktı, lordum. "Vergi Tanrı\'nın ölçüsüdür" diyorlar; halk başını sallıyor. Bir süre vergiye daha az söylenecekler.',
        'Vaaz başladı, lordum. Rahip öyle güzel anlatıyor ki ben bile bir an vergi vermek istedim. Geçti.',
        'Tapınağın çanları çalıyor, lordum; meydan doldu. Bugün vergiden şikâyet eden azalacak.',
      ])
    case 'project':
      if (c.action === 'festival')
        return any([
          'Meydana sofralar kuruldu, lordum! Ozanlar çalıyor, çocuklar koşuşuyor; halk adınıza kadeh kaldırıyor.',
          'Şenlik başladı, lordum. Ambardan çıkan yemek gönüllere girdi; yarım saat kimse dert yanmaz.',
          'Davullar, zurnalar, kızarmış koyunlar… Lordum, halk bu günü torunlarına anlatacak.',
        ])
      if (c.action === 'donate') {
        const good = RESOURCE_NAMES[c.good as keyof typeof RESOURCE_NAMES] ?? 'mal'
        return any([
          `Arabalar ${lower(good)} yüklü yola çıktı, lordum. Saray kâtipleri adınızı deftere iri harflerle yazacak.`,
          `Tacın ambarlarına ${lower(good)} gidiyor, lordum. Hükümdar cömertliğinizi duyunca gülümseyecek; gülümsemesi pahalıdır.`,
          `Bağış yola çıktı, lordum. Saraydaki dostlarımız bunu duyunca sizden daha sıcak söz edecek.`,
        ])
      }
      if (c.action === 'give') {
        const id = c.id as (typeof PROJECT_IDS)[number]
        const name = PROJECT_TEXTS[id]?.name ?? 'büyük iş'
        return any([
          `Mallar ${name} için şantiyeye taşınıyor, lordum. Ustalar taşları sayıyor, kâtipler hesapları.`,
          `${name} büyüyor, lordum. Böyle giderse yüzyıllar sonra bile adınızla anılır.`,
          `Arabalar şantiyeye boşaldı, lordum. Ustabaşı "bu hızla giderse çabuk biter" dedi; ustabaşları hep böyle der.`,
        ])
      }
      return null
    case 'research': {
      const name = RESEARCH_NAMES[c.id as string]?.name
      return any([
        `Bilginler ${name ? `"${name}" üzerine ` : ''}kitaplara gömüldü, lordum. Mumları biz ödüyoruz, aklı onlar.`,
        `Üniversitede ${name ? `${name} ` : 'yeni bir '}araştırma başladı, lordum. Biri pencereden kuş uçuşunu ölçüyor; bilim böyle bir şey herhalde.`,
      ])
    }
    case 'tax':
      return c.tax === 'low'
        ? any(['Vergi indi, lordum. Meydanda adınıza türkü yakıyorlar; hazinedar ise ağlıyor.', 'Halk rahat bir nefes aldı, lordum. Hazine biraz zayıflar ama gönüller semirir.'])
        : c.tax === 'normal'
          ? any(['Vergi olağan düzene döndü, lordum. Kimse sevinmedi, kimse kızmadı; iyi vergi budur.'])
          : c.tax === 'high'
            ? any(['Vergi arttı, lordum. Hazine dolacak; ama çarşıda yüzler asıldı.', 'Tahsildarlar yola çıktı, lordum. Kapılar biraz daha geç açılacak artık.'])
            : any(['Ağır vergi, lordum… Hazine dolar ama halk homurdanıyor. Tapınakta bir vaaz iyi gelebilir.', 'Ağır vergi ilan edildi, lordum. Bazı aileler eşyalarını topluyor; göç başlamadan bir şenlik düşünün derim.'])
    case 'nightShift':
      return c.on
        ? any(['Gece mesaisi başladı, lordum. Fenerler yandı, çekiçler susmuyor; halk yorgun düşecek.', 'Atölyeler gece de çalışıyor, lordum. Üretim artar, yorgunluk da.'])
        : any(['Gece mesaisi bitti, lordum. Halk sonunda uyuyabilecek; ben de.'])
    case 'queen':
      return any(['Saraya kraliçe geldi, lordum! Çanlar çalıyor, halk sokaklarda. Hanedanınız artık sürecek.', 'Kraliçeniz saraya adım attı, lordum. Saray birden daha aydınlık; mutfak da daha kalabalık.'])
    case 'train': {
      const unit = UNIT_NAMES[c.unit as keyof typeof UNIT_NAMES]
      return any([
        `Kışlada ${c.count ?? ''} ${unit ? lower(unit) : 'asker'} talime başladı, lordum. Çavuşun sesi saraydan duyuluyor.`,
        `Gençler yazıldı, lordum; ${unit ? lower(unit) : 'asker'} olacaklar. Anneleri ağlıyor, çavuş gülüyor.`,
      ])
    }
    case 'disband':
      return any(['Askerler evlerine döndü, lordum. Tarlalar sevinecek, düşmanlarımız da.'])
    case 'expedition': {
      if (c.action === 'recall') return any(['Atlı haberci kafilenin peşinden yola çıktı, lordum. Eli boş dönecekler ama sağ dönecekler.'])
      const name = EXPEDITION_TEXTS[c.kind as string]?.name
      return any([
        `${name ?? 'Kafile'} yola çıktı, lordum. Arkalarından su döktük; gerisi yolun ve şansın elinde.`,
        `Kafile sarayın kapısından çıktı, lordum. Döndüklerinde anlatacak çok şeyleri olacak, umarım taşıyacak çok şeyleri de.`,
      ])
    }
    case 'steward':
      return c.on
        ? any(['Kâhya göreve başladı, lordum. Siz yokken bir felaket gelirse köylüleri o toplayacak; ücretini de unutmaz.'])
        : any(['Kâhyayı görevden aldınız, lordum. Artık felaketlerde karar yine sizin.'])
    case 'swear':
      return any(['Biat ettiniz, lordum. Artık bir tacın lordusunuz: devriyeleri sizi kollar, rakipleri haraç ister. Dünya böyle döner.'])
    case 'repairWalls':
      return any(['Duvarcılar iskeleye çıktı, lordum. Yıkık surlar yeniden ayağa kalkıyor.'])
    case 'repairTrade':
      return any(['Ticaret noktası onarıldı, lordum. Tüccarımız yeniden develerini yükledi.'])
    case 'releaseTown':
      return any(['Kasabayı serbest bıraktınız, lordum. Kasabalılar şaşkın ama memnun; hazinemiz de bakımdan kurtuldu.'])
    case 'quest':
      return c.action === 'claim'
        ? any(['Tacın ödülü geldi, lordum. Hükümdar işinizi beğenmiş; bir dahaki işi de size verecek.'])
        : any(['Tacın işini üstlendiniz, lordum. Saat dolmadan bitirelim; taçlar beklemeyi sevmez.'])
    case 'royal':
      return c.action === 'deliver'
        ? any(['Kraliyet elçisi istediklerini aldı, lordum. Arabalar saraya gidiyor; hükümdar sizi anacak.'])
        : c.action === 'accept'
          ? any(['Kraliyet elçisine söz verdiniz, lordum. Sözünüzü tutarsanız taç bunu unutmaz.'])
          : any(['Kraliyet elçisini geri çevirdiniz, lordum. Kibarca söyledim ama yüzü asıldı.'])
    case 'order':
      return any(['Kervan tacın başkentine yola çıktı, lordum. Döndüğünde keseler dolu olacak.'])
    case 'tradeCity':
      return any(['Tüccarımız yeni yoluna çıkıyor, lordum. Uzun yol, iyi kazanç, derler.'])
    case 'house':
      if (c.action === 'gift') return any(['Hediye yerine ulaştı, lordum. Kardeşiniz biraz daha sıcak bakıyor size; şimdilik.'])
      if (c.action === 'role') return any(['Görev verildi, lordum. Hanedandan birinin elinde iş, daha az kötü fikir demektir.'])
      if (c.action === 'marry') return any(['Düğün hazırlıkları başladı, lordum! Çeyiz sandıkları yükleniyor, çalgıcılar akordunu yapıyor.'])
      return null
    case 'ships':
      return any(['Tersanede yeni bir omurga kızağa kondu, lordum. Marangozların çekici gece gündüz susmayacak.'])
    default:
      return null
  }
}
