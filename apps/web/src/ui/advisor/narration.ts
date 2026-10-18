import { PROJECT_IDS } from '@game/shared'
import type { Kingdom } from '@game/shared'
import { EXPEDITION_TEXTS } from '../expeditionNames'
import { BUILDING_NAMES, PRODUCT_NAMES, RESEARCH_NAMES, RESOURCE_NAMES, UNIT_NAMES } from '../names'
import { PROJECT_TEXTS } from '../hud/projects'

// The envoy's word on what the lord has just done (CLAUDE.md §9.8 "Elçinin notu"): a sermon preached, a festival
// held, a gift sent to the crown, a research begun… The game tells what follows from the lord's acts, not only what
// befalls him. Each act has at least six ways of saying it, one picked at random, so a lord who does the same thing
// twice hears something new; acts with a window of their own (crises, dilemmas, envoys' answers, the tribute talk)
// are left to that window, and the frequent small ones (workers, pings, mini games) get no word at all, or the envoy
// would never stop talking.

type Cmd = { type?: string; [key: string]: unknown }
const any = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]
const lower = (s: string) => s.toLocaleLowerCase('tr')
const goodOf = (g: unknown) => lower(RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES] ?? 'mal')
const unitsOf = (units: unknown) => Object.values((units ?? {}) as Record<string, number>).reduce((a, b) => a + (b || 0), 0)

// Ships by name, in the accusative-free form the lines need ("3 kadırga").
const SHIP_WORDS: Record<string, string> = { galley: 'kadırga', cog: 'koka', corsair: 'çektiri' }
// Spy topics as the envoy says them ("ambarlarına", "ordusuna", "elçilerine").
const SPY_ON: Record<string, string> = { stores: 'ambarlarını', army: 'ordusunu', diplomacy: 'elçilerini' }
// Town upkeep levels (towns.json upkeep: none, little, middling, generous).
const UPKEEP_WORDS = ['hiç', 'az', 'orta', 'cömert']

// `k` is the lord's state as the server answered it, for acts that name only an id (a building upgraded).
export function narrate(c: Cmd, k?: Kingdom | null): string | null {
  switch (c.type) {
    case 'sermon':
      return any([
        'Rahipler kürsüye çıktı, lordum. "Vergi Tanrı\'nın ölçüsüdür" diyorlar; halk başını sallıyor. Bir süre vergiye daha az söylenecekler.',
        'Vaaz başladı, lordum. Rahip öyle güzel anlatıyor ki ben bile bir an vergi vermek istedim. Geçti.',
        'Tapınağın çanları çalıyor, lordum; meydan doldu. Bugün vergiden şikâyet eden azalacak.',
        'Rahip "vergi veren elin yeri cennettir" dedi, lordum. Halk önce düşündü, sonra inandı; tahsildar da hemen arkasından girdi.',
        'Vaaz bitti, lordum; halk başını öne eğdi, keselerini açtı. Ben de iki akçe attım, görünsün diye.',
        'Kürsüde tütsüler yanıyor, lordum. Rahip vergiyi öyle güzel anlattı ki tahsildar ağladı; ilk kez sevinçten.',
        'Halk dua ediyor, lordum; dualarının yarısı hasat için, yarısı sizin için. Hangisinin kabul olacağını göreceğiz.',
      ])
    case 'project':
      if (c.action === 'festival')
        return any([
          'Meydana sofralar kuruldu, lordum! Ozanlar çalıyor, çocuklar koşuşuyor; halk adınıza kadeh kaldırıyor.',
          'Şenlik başladı, lordum. Ambardan çıkan yemek gönüllere girdi; yarım saat kimse dert yanmaz.',
          'Davullar, zurnalar, kızarmış koyunlar… Lordum, halk bu günü torunlarına anlatacak.',
          'Meydanda ateşler yandı, lordum; halay çekiliyor. Ben de katıldım, iki adımdan sonra oturdum.',
          'Fıçılar açıldı, lordum! Aşçıbaşı "ambar boşalıyor" diye söyleniyor, ama halk sizin adınızı haykırıyor.',
          'Şenlik var, lordum: cambazlar ipte, çocuklar ağaçta, ozan masanın üstünde. Masayı ben kurdurmuştum.',
          'Halk bu akşam doyacak, gülecek ve sizi anacak, lordum. Yarın yine söylenirler ama bu akşam sizindir.',
        ])
      if (c.action === 'donate') {
        const good = goodOf(c.good)
        return any([
          `Arabalar ${good} yüklü yola çıktı, lordum. Saray kâtipleri adınızı deftere iri harflerle yazacak.`,
          `Tacın ambarlarına ${good} gidiyor, lordum. Hükümdar cömertliğinizi duyunca gülümseyecek; gülümsemesi pahalıdır.`,
          `Bağış yola çıktı, lordum. Saraydaki dostlarımız bunu duyunca sizden daha sıcak söz edecek.`,
          `Bir kervan dolusu ${good}, lordum! Tacın ambarcısı sayarken parmakları yetmeyecek.`,
          `Bağışınızı hükümdara ben bizzat anlatacağım, lordum; biraz da süsleyerek. Süs bedava.`,
          `Bizim ambar hafifledi, tacın gönlü ağırlaştı, lordum. Bu terazide kârlı çıkan bizizdir.`,
        ])
      }
      if (c.action === 'give') {
        const id = c.id as (typeof PROJECT_IDS)[number]
        const name = PROJECT_TEXTS[id]?.name ?? 'büyük iş'
        return any([
          `Mallar ${name} için şantiyeye taşınıyor, lordum. Ustalar taşları sayıyor, kâtipler hesapları.`,
          `${name} büyüyor, lordum. Böyle giderse yüzyıllar sonra bile adınızla anılır.`,
          `Arabalar şantiyeye boşaldı, lordum. Ustabaşı "bu hızla giderse çabuk biter" dedi; ustabaşları hep böyle der.`,
          `${name} için taş üstüne taş, lordum. Bir usta adınızı kemerin altına kazımak istiyor; harfleri ben seçeceğim.`,
          `Şantiyede çekiç sesi hiç susmuyor, lordum. ${name} bittiğinde torunlarınız bile onun gölgesinde oturacak.`,
          `Ambardan çıkan mallar ${name} şantiyesinde yığıldı, lordum. Kâtip saydı, ustabaşı saydı, ben de saydım; üçümüz üç ayrı sayı bulduk.`,
        ])
      }
      return null
    case 'research': {
      const name = RESEARCH_NAMES[c.id as string]?.name
      return any([
        `Bilginler ${name ? `"${name}" üzerine ` : ''}kitaplara gömüldü, lordum. Mumları biz ödüyoruz, aklı onlar.`,
        `Üniversitede ${name ? `${name} ` : 'yeni bir '}araştırma başladı, lordum. Biri pencereden kuş uçuşunu ölçüyor; bilim böyle bir şey herhalde.`,
        `${name ? `"${name}" ` : 'Yeni araştırma '}defterleri açıldı, lordum. Âlimler kavgaya başladı bile; bilim tartışmadan doğar, bazen de yumruktan.`,
        `Âlimler ${name ? `${name} için ` : ''}kütüphaneye kapandı, lordum. Yemeklerini kapının altından itiyoruz.`,
        `Rektör bana ${name ? `"${name}" ` : 'araştırmayı '}anlatmaya çalıştı, lordum. Yarısında uyudum; uyandığımda o da uyumuştu.`,
        `Mürekkep hokkaları doldu, lordum; ${name ? `"${name}" ` : 'yeni bilgi '}yolda. Bitince etkisi hemen başlar, âlimlerin kibri de.`,
      ])
    }
    case 'tax':
      return c.tax === 'low'
        ? any([
            'Vergi indi, lordum. Meydanda adınıza türkü yakıyorlar; hazinedar ise ağlıyor.',
            'Halk rahat bir nefes aldı, lordum. Hazine biraz zayıflar ama gönüller semirir.',
            'Düşük vergi, lordum! Köylüler şapkalarını havaya attı; birinin şapkası hâlâ inmedi.',
            'Tahsildarlar evlerine döndü, lordum; ilk kez bir tahsildarın gülümsediğini gördüm. Hazinedar ise gülümsemiyor.',
            'Vergiyi hafiflettiniz, lordum. Mutlu halk çabuk büyür; hazine de sonra büyür, sabırla.',
            'Çarşıda sizin için dua ediyorlar, lordum. Hazinedarın duası ise biraz farklı.',
          ])
        : c.tax === 'normal'
          ? any([
              'Vergi olağan düzene döndü, lordum. Kimse sevinmedi, kimse kızmadı; iyi vergi budur.',
              'Olağan vergi, lordum: halk söylenir ama öder, hazinedar söylenir ama yetinir. Denge budur.',
              'Vergi ortaya oturdu, lordum. Ne türkü yakan var ne taş atan; ben bu sessizliği severim.',
              'Tahsildarlar eski tarifeyi çıkardı, lordum. Köylüler de eski şikâyetlerini; hiçbir şey değişmedi, güzel.',
              'Altın orta karar akacak, lordum; halkın gönlü de orta karar. Orta karar, kırk yıllık tecrübeme göre en uzun yaşayandır.',
              'Vergi normale döndü, lordum. Hazinedar "hm" dedi; ondan duyduğum en olumlu söz.',
            ])
          : c.tax === 'high'
            ? any([
                'Vergi arttı, lordum. Hazine dolacak; ama çarşıda yüzler asıldı.',
                'Tahsildarlar yola çıktı, lordum. Kapılar biraz daha geç açılacak artık.',
                'Yüksek vergi, lordum. Hazinedar dans ediyor, köylüler etmiyor. Bir kraliçe ya da tapınak bu yükü hafifletir.',
                'Keseler biraz daha hafifleyecek, lordum; halkın keyfi de. Mutluluğa göz kulak olun.',
                'Vergi arttı, lordum. Bir köylü bana "bu da geçer" dedi; geçmezse göç eder, onu da söyledi.',
                'Tahsildarlara yeni defterler dağıttım, lordum; eskileri yetmeyecek. Halk sesini çıkarmıyor, şimdilik.',
              ])
            : any([
                'Ağır vergi, lordum… Hazine dolar ama halk homurdanıyor. Tapınakta bir vaaz iyi gelebilir.',
                'Ağır vergi ilan edildi, lordum. Bazı aileler eşyalarını topluyor; göç başlamadan bir şenlik düşünün derim.',
                'Ağır vergi, lordum. Tahsildarlar artık kapıyı çalmıyor, kırıyor. Halkın mutluluğunu gözden kaçırmayın.',
                'Hazineye altın yağacak, lordum; ama yağmurdan sonra sel gelir. Halk mutsuz olursa büyümez, göç eder.',
                'Ağır vergi duyuldu, lordum; meydandaki türkünün sözleri bir gecede değişti. Pek hoş sözler değil.',
                'Bu vergiyle hazine şişer, halk incelir, lordum. Uzun sürerse bir vaaz, bir şenlik ya da ikisi birden gerekecek.',
              ])
    case 'nightShift':
      return c.on
        ? any([
            'Gece mesaisi başladı, lordum. Fenerler yandı, çekiçler susmuyor; halk yorgun düşecek.',
            'Atölyeler gece de çalışıyor, lordum. Üretim artar, yorgunluk da.',
            'Gece mesaisi, lordum: ay da çalışıyor artık, maaşsız. Halkın yorgunluğunu gözetin.',
            'Kandiller yandı, lordum; oduncu baltayı karanlıkta sallıyor. Parmaklarına dua edelim.',
            'Gece de üretim var, lordum, ama mutluluk biraz düşer ve yorgunluk birikir. Uzun sürmesin.',
            'Horozlar şaşırdı, lordum; artık ne zaman öteceklerini bilmiyorlar. Köylüler de ne zaman uyuyacaklarını.',
          ])
        : any([
            'Gece mesaisi bitti, lordum. Halk sonunda uyuyabilecek; ben de.',
            'Fenerler söndü, lordum. Köylüler yataklarına koştu; biri yolda uyuyakaldı, üstüne battaniye örttüm.',
            'Gece yine gece oldu, lordum. Yorgunluk yavaşça geçer; gündüz üretimi de toparlanır.',
            'Atölyeler kapandı, lordum. Duyduğunuz o derin ses halkın horlaması; bence en güzel ninni.',
            'Gece mesaisine son verdiniz, lordum. Halk adınıza bir şükür duası etti, sonra hemen uyudu.',
            'Çekiçler sustu, lordum. Bu gece sarayda yalnızca benim sesim duyulacak; korkmayın, kısık konuşurum.',
          ])
    case 'queen':
      return any([
        'Saraya kraliçe geldi, lordum! Çanlar çalıyor, halk sokaklarda. Hanedanınız artık sürecek.',
        'Kraliçeniz saraya adım attı, lordum. Saray birden daha aydınlık; mutfak da daha kalabalık.',
        'Kraliçe geldi, lordum! İlk işi perdeleri değiştirmek oldu; ikinci işi beni süzmek.',
        'Saray kapısına çiçekler serildi, lordum. Kraliçe yürürken halk alkışladı; ben de alkışladım, en yüksek sesle.',
        'Tahtın öbür yarısı nihayet doldu, lordum. Halkın mutluluğu da hanedanın umudu da arttı.',
        'Kraliçeniz geldi, lordum; yanında üç sandık elbise ve bir kedi. Kedi beni sevmedi.',
      ])
    case 'train': {
      const unit = UNIT_NAMES[c.unit as keyof typeof UNIT_NAMES]
      const u = unit ? lower(unit) : 'asker'
      const n = Number(c.count) || 0
      return any([
        `Kışlada ${n || ''} ${u} talime başladı, lordum. Çavuşun sesi saraydan duyuluyor.`,
        `Gençler yazıldı, lordum; ${u} olacaklar. Anneleri ağlıyor, çavuş gülüyor.`,
        `${n ? `${n} ` : ''}${u} adayı kışlanın kapısından girdi, lordum. Çıktıklarında ayrı insanlar olacaklar; daha az uykulu.`,
        `Talim meydanında toz duman, lordum. ${unit ? `${unit} adayları` : 'Adaylar'} ilk gün bol bol düştü; ikinci gün daha az düşecekler.`,
        `Çavuş yeni ${u} adaylarına "tahtta oturan lordunuz sizi izliyor" dedi, lordum. Hepsi dimdik durdu; bir an için ben de.`,
        `Kışla yeniden kalabalık, lordum: ${n ? `${n} ` : ''}${u} yetişiyor. Maaşları ve yemekleri her tur hazineden; ama sınırlarımız daha sağlam.`,
      ])
    }
    case 'disband': {
      const n = unitsOf(c.units)
      return any([
        'Askerler evlerine döndü, lordum. Tarlalar sevinecek, düşmanlarımız da.',
        `${n ? `${n} asker ` : 'Askerler '}kılıcını asıp çapasını aldı, lordum. Maaş gideri azaldı, tarla ele geçti.`,
        'Terhis edilenler köylerine dağıldı, lordum. Biri giderken çavuşa el salladı; çavuş salladı mı, emin değilim.',
        'Askerler köylü oldu, lordum. Eğitimin bedeli geri gelmez ama artık her tur maaş da gitmez.',
        'Kışla biraz boşaldı, lordum. Analar sevindi; komşu lordun casusu da not aldı, haberiniz olsun.',
        `Garnizondan ${n ? `${n} kişi ` : 'birkaç kişi '}eve döndü, lordum. Kılıçları cephaneliğe, kendileri tarlaya.`,
      ])
    }
    case 'expedition': {
      if (c.action === 'recall')
        return any([
          'Atlı haberci kafilenin peşinden yola çıktı, lordum. Eli boş dönecekler ama sağ dönecekler.',
          'Kafileyi geri çağırdınız, lordum. Erzak gitti ama adamlar gelecek; insan erzaktan değerlidir.',
          'Ulak dörtnala çıktı, lordum. "Dönün" diye bağıracak; umarım kafile "duyamadık" demez.',
          'Sefer yarıda kaldı, lordum. Hikâyeleri kısa olacak, ganimetleri hiç olmayacak; ama sofrada yerleri dolacak.',
          'Kafile geri dönüyor, lordum. Bazen en akıllıca yolculuk yarıda kesilendir; böyle derler, ben de öyle derim.',
          'Geri çağırma emri yolda, lordum. Seferciler herhalde homurdanacak; homurdanan sefercinin sağ olduğu bellidir.',
        ])
      const name = EXPEDITION_TEXTS[c.kind as string]?.name
      const v = Number(c.villagers) || 0
      const guard = unitsOf(c.escort)
      return any([
        `${name ?? 'Kafile'} yola çıktı, lordum. Arkalarından su döktük; gerisi yolun ve şansın elinde.`,
        `Kafile sarayın kapısından çıktı, lordum. Döndüklerinde anlatacak çok şeyleri olacak, umarım taşıyacak çok şeyleri de.`,
        `${v ? `${v} köylü` : 'Köylüler'}${guard ? `, yanlarında ${guard} muhafız,` : ''} yola düştü, lordum. Azıkları sırtlarında, umutları gözlerinde.`,
        `${name ?? 'Sefer'} başladı, lordum. Onlara bir harita verdim; bu sefer doğru tuttuklarından emin oldum.`,
        `Kafile ufukta küçüldü, lordum. ${guard ? 'Muhafızlar önde, köylüler arkada; düzen güzel.' : 'Muhafızsız gittiler; yol uzun, dualarımız onlarla.'}`,
        `Seferciler uğurlandı, lordum. Döndüklerinde "Sen yokken" raporuna bir sayfa daha eklenir; ben de dinlemek için sabırsızlanıyorum.`,
      ])
    }
    case 'steward':
      return c.on
        ? any([
            'Kâhya göreve başladı, lordum. Siz yokken bir felaket gelirse köylüleri o toplayacak; ücretini de unutmaz.',
            'Kâhya anahtarları beline taktı, lordum. Yangında, selde köylüleri o seferber edecek; her seferinde de kesesini uzatacak.',
            'Artık bir kâhyamız var, lordum. Ciddi bir adam; güldüğünü hiç görmedim, umarım felaketlerde de gülmez.',
            'Kâhya işe başladı, lordum. Siz uyurken o nöbette; ben de uyurken, açıkçası.',
            'Kâhyaya yetki verdiniz, lordum. Cevapsız kalan krizlerde köylüleri o toplar; hazinede altın kalsın ki işini yapabilsin.',
            'Kâhya yeminini etti, lordum: "Ambarı korurum, ücretimi alırım." Dürüst bir yemin.',
          ])
        : any([
            'Kâhyayı görevden aldınız, lordum. Artık felaketlerde karar yine sizin.',
            'Kâhya anahtarları bıraktı, lordum. Bundan sonra krizleri siz karşılayacaksınız; ben de yanınızda olurum, uzaktan.',
            'Kâhya gitti, lordum. Ücreti hazinede kalacak; felaketler ise bizim başımıza.',
            'Kâhyamız emekli oldu, lordum. Giderken bana "kolay gelsin" dedi; ne demek istediğini şimdi anlıyorum.',
            'Kâhyalık kaldırıldı, lordum. Siz yokken gelen bir kriz cevapsız kalırsa olduğu gibi yaşanır; aklınızda olsun.',
            'Kâhya eşyalarını topladı, lordum. Masasını bana bıraktı; çekmecesinde yarım bir elma vardı.',
          ])
    case 'swear':
      return any([
        'Biat ettiniz, lordum. Artık bir tacın lordusunuz: devriyeleri sizi kollar, rakipleri haraç ister. Dünya böyle döner.',
        'Diz çöktünüz, lordum, ama başınız dik. Tacın sancağı artık adınızın yanında; sezon boyunca değişmez.',
        'Biat yemini edildi, lordum. Tacın ulağı mühürlü belgeyi aldı; ben de mührün kurumasını bekledim, gözümü ayırmadan.',
        'Artık bir tacın lordusunuz, lordum. Sarayın ikinci katına giden kapı açıldı; rakip taç da haraççılarını hazırlıyor.',
        'Tacınız sizi lordları arasına yazdı, lordum. Devriyeleri dost, rakip tacın haraççıları ise yarım saatte bir misafir.',
        'Biat ettiniz, lordum. Halk yeni sancağı alkışlıyor; ozan da renklerine uygun bir şarkı arıyor.',
      ])
    case 'repairWalls':
      return any([
        'Duvarcılar iskeleye çıktı, lordum. Yıkık surlar yeniden ayağa kalkıyor.',
        'Harç karılıyor, taşlar yontuluyor, lordum. Düşmanın açtığı gedikler kapanacak.',
        'Surlar onarılıyor, lordum. Ustabaşı "eskisinden sağlam olacak" dedi; ustabaşları hep böyle der, ama bu sefer inandım.',
        'Yıkık burçlara iskele kuruldu, lordum. Bir sonraki kuşatmada bu taşlar düşmana diş gösterecek.',
        'Duvarcıların çekiçleri çalışıyor, lordum. Halk surların yükseldiğini görünce daha rahat uyuyacak.',
        'Gedikler kapanıyor, lordum. Kapıdan başka yerden geçmek isteyen bundan sonra kanat takmalı.',
      ])
    case 'repairTrade':
      return any([
        'Ticaret noktası onarıldı, lordum. Tüccarımız yeniden develerini yükledi.',
        'Yanık tezgâhlar söküldü, yenileri çakıldı, lordum. Tüccar yeniden sefere çıkabilir.',
        'Ticaret noktası ayağa kalktı, lordum. Deve bile sevindi; ilk kez tükürmeden geçti yanımdan.',
        'Onarım bitti, lordum. Haritada artık yanık bir enkaz değil, gıcır gıcır bir ticaret noktası görünüyor.',
        'Tüccar yeni tentesinin altında el ovuşturuyor, lordum. Satış yeniden başlıyor, altın yeniden akıyor.',
        'Ticaret noktasının dumanı tütmüyor artık, lordum. Yağmacılar bir daha gelirse bu kez gözcü kulesi de olsun derim.',
      ])
    case 'releaseTown':
      return any([
        'Kasabayı serbest bıraktınız, lordum. Kasabalılar şaşkın ama memnun; hazinemiz de bakımdan kurtuldu.',
        'Kasabanın anahtarlarını geri verdik, lordum. Ötekiler rahatladı; çok kasaba, çok baş ağrısıdır.',
        'Sancağımız kasabanın burcundan indirildi, lordum. Kasabalılar el salladı; vedalaşma mı sevinç mi, emin olamadım.',
        'Kasaba artık kimsenin değil, lordum. Küçük bir garnizon kendini korur; bize de daha az bakım, daha az isyan.',
        'Bazen bırakmak da hükümdarlıktır, lordum. Aşırı büyüme yükü hafifledi; kalan kasabalar size daha sadık olur.',
        'Kasabadan çekildik, lordum. Valinin kâtibi defterleri kapattı ve bana "şimdi ne yapacağım" diye sordu. Ona da bir iş bulacağız.',
      ])
    case 'quest':
      return c.action === 'claim'
        ? any([
            'Tacın ödülü geldi, lordum. Hükümdar işinizi beğenmiş; bir dahaki işi de size verecek.',
            'Ödül kesesi hazineye girdi, lordum. Tacın kâtibi adınızın yanına bir yıldız çizdi; gördüm.',
            'Tacın ödülünü aldık, lordum. Altını sayarken tacın gülümsemesini de saydım; ikisi de fena değil.',
            'Görevin karşılığı geldi, lordum. Taçla ilişkimiz biraz daha ısındı; kışın bu sıcaklık işe yarar.',
            'Ulak keseyi uzatırken eğildi, lordum. Eskiden eğilmezdi; demek ki adınız sarayda konuşuluyor.',
            'Ödül alındı, lordum. Hükümdar "bu lord iş bilir" demiş; kulağıma öyle geldi, ben de size getirdim.',
          ])
        : any([
            'Tacın işini üstlendiniz, lordum. Saat dolmadan bitirelim; taçlar beklemeyi sevmez.',
            'Görevi aldık, lordum. Tacın ulağı gözlerini kısıp "bakalım" dedi; gösterelim ona.',
            'Söz verildi, lordum. Taç işini zamanında bitirene ödülünü cömert verir; geç kalana omuz silker.',
            'Tacın isteği defterimizde, lordum. Saatin kumu akıyor; ben şimdiden telaşlandım.',
            'İşe giriştik, lordum. Görevler kutusunda ilerlemesini görürsünüz; ben de her yarım saatte bir size hatırlatırım.',
            'Tacın görevini üstlendiniz, lordum. Bitirirsek altın ve gönül; bitiremezsek yalnızca utanç, o da benim payıma düşer.',
          ])
    case 'royal':
      return c.action === 'deliver'
        ? any([
            'Kraliyet elçisi istediklerini aldı, lordum. Arabalar saraya gidiyor; hükümdar sizi anacak.',
            'Teslimat tamam, lordum. Kraliyet elçisi sandıkları saydı, iki kez saydı ve sonunda gülümsedi.',
            'Söz tutuldu, lordum. Tacın kâtibi "zamanında" yazdı; sarayda bu iki kelime altından değerlidir.',
            'Mallar yola çıktı, karşılığı hazineye girdi, lordum. Asıl kazanç ise tacın gözünde; o görünmez ama işe yarar.',
            'Kraliyet elçisi atına binerken bana göz kırptı, lordum. Bu bir lütuf mu yoksa göz kayması mı, emin değilim.',
            'İstek yerine getirildi, lordum. Hükümdar bunu duyunca kadehini sizin için kaldıracak; ben de suyumu.',
          ])
        : c.action === 'accept'
          ? any([
              'Kraliyet elçisine söz verdiniz, lordum. Sözünüzü tutarsanız taç bunu unutmaz.',
              'Söz verildi, lordum. Ambarı ve cephaneliği bir kollayalım; bir saat çabuk geçer.',
              'Kraliyet elçisi "elimden geleni yaparım" sözünüzü deftere yazdı, lordum. Gelen de elimizden çıksın.',
              'İsteği üstlendiniz, lordum. Görevler kutusunda eldeki ve istenen yazıyor; ben de parmak hesabıyla takip ediyorum.',
              'Elçi memnun ayrıldı, lordum. Teslim edince taç piyasa değerinin üstünü öder; asıl kazanç yine de gönüldür.',
              'Söz bir kere ağızdan çıktı, lordum. Şimdi işçileri, atölyeleri ve biraz da şansı çalıştırma vakti.',
            ])
          : any([
              'Kraliyet elçisini geri çevirdiniz, lordum. Kibarca söyledim ama yüzü asıldı.',
              'Elçi "anlaşıldı" dedi, lordum; ama öyle bir "anlaşıldı" ki ben üşüdüm.',
              'Bu sefer olmaz dediniz, lordum. Taçla ilişkimiz biraz soğudu; bir sonraki isteği kaçırmayalım.',
              'Kraliyet elçisi eli boş döndü, lordum. Yolda başka bir lordun kapısını çalacak; o lord da bizi geçecek.',
              'Geri çevirdik, lordum. Ben elçiye bir kadeh şerbet ikram ettim; acı kalmasın diye.',
              'İstek reddedildi, lordum. Bazen hayır demek gerekir; yalnızca çok sık olmasın, taçlar sayar.',
            ])
    case 'order':
      return any([
        'Kervan tacın başkentine yola çıktı, lordum. Döndüğünde keseler dolu olacak.',
        'Develer yüklendi, lordum; tacın siparişi yolda. Ödeme kervan dönünce gelir.',
        'Sipariş kervanı uğurlandı, lordum. Önde tüccar, arkada develer, en arkada benim dualarım.',
        'Tacın istediği mallar yola düştü, lordum. Taç lobi fiyatının üstünü öder; iyi bir alışveriş.',
        'Kervan kapıdan çıktı, lordum. Yolda yağmacılar varsa onlara benim adımı söyleyecekler; pek işe yarar mı, bilmem.',
        'Siparişi gönderdik, lordum. Tacın kâtibi defterine bir satır daha yazacak: "Bu lord sözünün eri."',
      ])
    case 'tradeCity':
      return c.city === null || c.city === undefined
        ? any([
            'Tüccar yeniden lobi pazarına dönüyor, lordum. Kısa yol, hızlı sefer.',
            'Başkent yolu kapandı, lordum; tüccar yakın pazara dönüyor. Develer sevindi, yol kısaldı.',
            'Tüccar eski pazarına döndü, lordum. "Uzak yol yorar" dedi; ben de katılıyorum, dizlerimle.',
            'Lobi pazarı yine bizim, lordum. Seferler kısalır, ama fiyatları da biz düşürürüz; dikkat.',
            'Tüccar yönünü değiştirdi, lordum. Pazarda tanıdık yüzler onu bekliyor; bir de tanıdık fiyatlar.',
            'Yakın pazara dönüldü, lordum. İki dakika boyunca yeniden değiştiremeyiz; deve de kafa karışıklığını sevmez.',
          ])
        : any([
            'Tüccarımız yeni yoluna çıkıyor, lordum. Uzun yol, iyi kazanç, derler.',
            'Tüccar taç başkentine gidiyor, lordum: iki kat yük, uzun yol. Develer itiraz etti, ben bastırdım.',
            'Başkentin kapıları tüccarımıza açık, lordum. Sefer uzun ama fiyatı daha az düşürür.',
            'Tüccar kervanını başkente çevirdi, lordum. Döndüğünde hem kese hem tacın gözü dolu olacak.',
            'Uzun yol başladı, lordum. Tüccar yanına fazladan azık aldı; bir de benden bir mektup, başkentteki eski dostuma.',
            'Tüccar artık başkent yolunda, lordum. Satış yapılan her sefer o taçla ilişkimizi de biraz ısıtır.',
          ])
    case 'house':
      if (c.action === 'gift')
        return any([
          'Hediye yerine ulaştı, lordum. Kardeşiniz biraz daha sıcak bakıyor size; şimdilik.',
          'Kese teslim edildi, lordum. Alan gülümsedi; gülümsemesinin ne kadar süreceğini zaman gösterir.',
          'Hediye gitti, lordum. Hanedanda bir altın kesesi, bir kılıçtan daha çok kapı açar.',
          'Hediyeyi aldı, lordum, ve "lordumuz cömert" dedi. Ben de bunu herkese duyurdum, biraz yüksek sesle.',
          'Gönül alındı, lordum. Akraba gönlü cam gibidir; arada bir parlatmak gerekir.',
          'Hediye yerini buldu, lordum. Sofrada artık size bakarak gülüyor; eskiden size bakarak bıçak biliyordu.',
        ])
      if (c.action === 'role')
        return c.role === null || c.role === undefined
          ? any([
              'Görevden aldınız, lordum. Anlayışla karşıladı; yani yüzü bembeyaz oldu ve sustu.',
              'Görev elinden alındı, lordum. Bu kolay unutulmaz; bir süre ona hediyeyle yaklaşmak gerekebilir.',
              'Mührü geri aldık, lordum. Kapıyı biraz sert kapattı ama menteşeler dayandı.',
              'Görev boşaldı, lordum. Hanedandan biri gücendi; gücenik akraba, gözü dışarıda akrabadır.',
              'Görevden alındı, lordum. Bana "ben ne yaptım" diye sordu; cevap vermedim, elçiler her şeyi bilmez.',
              'Bir görev eksildi, lordum. Hesap tutan kâtip memnun; hanedan ise pek değil.',
            ])
          : any([
              'Görev verildi, lordum. Hanedandan birinin elinde iş, daha az kötü fikir demektir.',
              'Mühür teslim edildi, lordum. Yeni görevli göğsünü kabarttı; düğmeleri zor dayanıyor.',
              'Hanedandan birine görev verdiniz, lordum. Görev verilen sevinir, sevinen akraba sadık kalır.',
              `${c.role === 'governor' ? 'Yeni vali kasabaya yola çıktı' : c.role === 'commander' ? 'Devriyenin yeni komutanı atını eğerletti' : c.role === 'treasurer' ? 'Yeni hazinedar defterleri açtı' : 'Yeni görevli işe başladı'}, lordum. İnşallah işini sizin kadar iyi bilir; benim kadar konuşmasın yeter.`,
              'Görev dağıtıldı, lordum. Saray artık daha düzenli; ben de daha az koşturuyorum.',
              'Bir akrabanız artık hanedanın işini görüyor, lordum. İşsiz prens tehlikelidir, meşgul prens yararlı.',
            ])
      if (c.action === 'marry') {
        const to = (c.to as { kind?: string } | undefined)?.kind
        return to === 'lord'
          ? any([
              'Evlilik teklifimiz yola çıktı, lordum. Elçi en güzel cübbesini giydi; cevap gelince haber getiririm.',
              'Talip olduk, lordum. Teklif mühürlendi ve dörtnala yolda; karşı saray düşünecek.',
              'Prensesin portresi elçinin heybesinde, lordum. Ressam biraz cömert davranmış ama yalan da sayılmaz.',
              'Teklif gönderildi, lordum. Kabul ederlerse iki hanedan akraba olur, ilişki de ısınır.',
              'Evlilik elçisi uğurlandı, lordum. Yanında bir kese hediye, dilinde de benim öğrettiğim üç iltifat.',
              'Karşı saraya teklif gidiyor, lordum. Ben şimdiden düğün konuşmamı yazmaya başladım; kısa olacak, söz.',
            ])
          : any([
              'Düğün hazırlıkları başladı, lordum! Çeyiz sandıkları yükleniyor, çalgıcılar akordunu yapıyor.',
              'Prenses gelinlik giydi, lordum. Saray kadınları ağlıyor, ben de; yaşlandım.',
              'Çeyiz yola çıktı, lordum. Arabalar dolu, gönüller dolu, hazine biraz daha boş.',
              'Düğün çanları çalıyor, lordum! Prensesimiz yeni evine gidiyor; arkasından su döktük.',
              'Prenses evlendirildi, lordum. Hanedanınızın bağları artık daha geniş; düşmanlarınızın işi daha zor.',
              'Gelin alayı uğurlandı, lordum. Zurna, davul, bir de benim veda konuşmam; konuşma biraz uzun sürdü.',
            ])
      }
      if (c.action === 'aid')
        return c.kind === 'troops'
          ? any([
              'Taca asker yardımı için ulak gönderdik, lordum. Taç kabul ederse askerleri karargâha baskın yapar.',
              'Tacınızdan asker istediniz, lordum. Taçlar yardım eder ama karşılığında biraz gönül alır.',
              'Ulak başkente koşuyor, lordum. Kardeşinizin karargâhına bir de tacın kılıcı insin, dua edelim.',
              'Asker yardımı istendi, lordum. Tacımız sizi seviyorsa gelir; sevmiyorsa... onu da öğrenmiş oluruz.',
              'Yardım isteği yolda, lordum. Taçtan asker istemek gurur kırar; ama tahtı kaybetmek daha çok kırar.',
              'Taca "yardım" dedik, lordum. Cevabı elçi getirecek; ben de bu arada surları bir dolaşayım.',
            ])
          : any([
              'Taca altın yardımı için ulak gönderdik, lordum. Gelirse isyana karşı hazineye girer.',
              'Tacınızdan altın istediniz, lordum. Kese gelirse kardeşinize karşı asker yetiştiririz.',
              'Ulak başkente koşuyor, lordum. Hükümdar kesesini açar mı, birazdan öğreniriz.',
              'Altın yardımı istendi, lordum. Taç verirse ilişkimizden biraz eksilir; ama taht yerinde kalır.',
              'Yardım isteği yolda, lordum. Hazinedar şimdiden kasanın kapağını açık bıraktı; umutlu bir adam.',
              'Taca altın için yazdık, lordum. Mektubu ben yazdım; en dokunaklı cümlelerimi kullandım.',
            ])
      return null
    case 'nameChild':
      return any([
        `Çocuğun adı ${c.name} oldu, lordum. Kâtip hanedan defterine yazdı; mürekkebi altın tozlu.`,
        `${c.name}! Güzel bir ad, lordum. Ozan şimdiden bu adla kafiye arıyor.`,
        `Saray ${c.name} adını fısıldıyor, lordum. Bir gün belki bütün diyar haykırır.`,
        `${c.name} adı konuldu, lordum. Bir daha değişmez; ben de unutmam, söz.`,
        `Çocuğa ${c.name} dediniz, lordum. Dadı tekrar etti, aşçı tekrar etti, ben üç kez tekrar ettim.`,
        `${c.name} artık hanedanın bir adı, lordum. Bebek ağladı; sanırım beğendi.`,
      ])
    case 'educate': {
      const what = c.focus === 'finance' ? 'maliye' : c.focus === 'people' ? 'halk işleri' : 'askerlik'
      return any([
        `Çocuğa ${what} hocası tutuldu, lordum. Reşit olunca bu yeteneği daha güçlü olacak.`,
        `Eğitim seçildi: ${what}, lordum. Hoca ilk derse geldi; öğrenci uyuyordu.`,
        `${what === 'askerlik' ? 'Tahta kılıçlar' : what === 'maliye' ? 'Abaküs ve defterler' : 'Halkın masalları'} çocuğun odasına taşındı, lordum. Gelecek böyle yetişir.`,
        `Çocuk ${what} öğrenecek, lordum. Ben de ara sıra uğrayıp diplomasi öğretirim; bedavaya.`,
        `${what.charAt(0).toLocaleUpperCase('tr')}${what.slice(1)} eğitimi başladı, lordum. Hoca çok sert; ben de çocukken öyle bir hocadan korkardım.`,
        `Eğitim kararı verildi, lordum: ${what}. On altı yaşında farkı görürsünüz.`,
      ])
    }
    case 'ships': {
      const ship = SHIP_WORDS[c.ship as string] ?? 'gemi'
      const n = Number(c.count) || 1
      return any([
        'Tersanede yeni bir omurga kızağa kondu, lordum. Marangozların çekici gece gündüz susmayacak.',
        `${n} ${ship} için kızaklar hazırlandı, lordum. Zift kokusu saraya kadar geliyor.`,
        `Tersane ustaları ${ship} kaburgalarını dikiyor, lordum. Suya inince size haber veririm; şişeyi bu sefer ben kırmam.`,
        `${n > 1 ? `${n} ${ship}` : `Bir ${ship}`} yapılıyor, lordum. Tayfası asker havuzundan gelecek; denizciler köylü sayılmaz, unutmayın.`,
        `Kereste tersaneye taşındı, lordum. Bir ${ship} doğuyor; adını tayfaya bırakmayın, geçen sefer "Elçinin Sesi" koydular.`,
        `Kızaktan çekiç sesleri geliyor, lordum. ${ship.charAt(0).toLocaleUpperCase('tr')}${ship.slice(1)} pahalıdır ama sular bizim olacak.`,
      ])
    }
    // ---- Building, the plan and the stores ----
    case 'plan': {
      const steps = (c.steps as { type: string; kind?: string }[] | undefined) ?? []
      const builds = steps.filter((s) => s.type === 'build')
      const moves = steps.filter((s) => s.type === 'move').length
      const razes = steps.filter((s) => s.type === 'demolish').length
      if (!steps.length) return null
      // Roads alone are a small chore, not news.
      if (builds.length && builds.every((s) => s.kind === 'road') && !moves && !razes) return null
      const kinds = [...new Set(builds.map((s) => s.kind).filter((x) => x !== 'road' && x !== 'wall'))]
      const one = kinds.length === 1 ? lower(BUILDING_NAMES[kinds[0] as keyof typeof BUILDING_NAMES] ?? 'yapı') : null
      if (razes && !builds.length && !moves)
        return any([
          'Yıkım ekibi işe başladı, lordum. Taşların yarısı geri döner; öbür yarısı toz olur.',
          'Balyozlar kalktı, lordum. Bir yapı gider, bir boşluk kalır; boşluk da bir fırsattır.',
          'Yıkıldı, lordum. Ustabaşı içini çekti; kendi elleriyle yaptığı bir şeydi galiba.',
          'Enkaz kaldırılıyor, lordum. Harcananın yarısı ambara geri dönüyor, kalanı tarihe.',
          'Yıkım emri yerine geldi, lordum. Toz bulutu dağılınca yerine ne koyacağımızı konuşuruz.',
          'Bir yapı eksildi, lordum. Bazen bir şehri güzelleştiren eklediğiniz değil, kaldırdığınızdır.',
        ])
      if (moves && !builds.length)
        return any([
          'Taşıma başladı, lordum. Yapı söküldü, taşlar numaralandı; umarım aynı sırayla dizerler.',
          'Ustalar yapıyı yeni yerine taşıyor, lordum. Seviyesi ve işçileri korunur; yalnızca adresi değişir.',
          'Bir yapı yer değiştiriyor, lordum. Köylüler şaşkın: "dün buradaydı" diyorlar.',
          'Taşıma emri ustalarda, lordum. Taşınırken yapı üretmez; sabır, birazdan yerine oturur.',
          'Yeni yerine yürüyor, lordum, taş taş. Şehir planınız artık daha düzenli.',
          'Arabalara kirişler yüklendi, lordum. Mimar "bu yer daha iyi" dedi; mimarlar her yer için öyle der.',
        ])
      return any([
        `Plan onaylandı, lordum: ${builds.length > 1 ? `${builds.length} yapı` : one ?? 'yeni yapı'} için temeller kazılıyor. Ustalar iskeleye çıktı.`,
        `${one ? `Yeni ${one}` : 'Yeni yapılar'} için taşlar taşınıyor, lordum. Çekiç sesi lordluğun en güzel şarkısıdır.`,
        `Mimar planı ustalara dağıttı, lordum. ${builds.length > 2 ? 'Bu kadar işi aynı anda görünce biri bayıldı; ayıltıp işe koyduk.' : 'Biri ters tuttu, düzelttim.'}`,
        `İnşaat başladı, lordum. ${one ? `${one.charAt(0).toLocaleUpperCase('tr')}${one.slice(1)} yükseldikçe` : 'Yapılar yükseldikçe'} hudut daha dolu, haritanız daha güzel görünecek.`,
        `Plan yürürlükte, lordum. İnşaat yeri doluysa sıradakiler yer boşalınca başlar; ustalar sıra beklemeyi bilir.`,
        `Temel taşları atıldı, lordum. ${moves || razes ? 'Taşınan ve yıkılanlar da hallediliyor; ' : ''}Bir lordluk böyle büyür: taş üstüne taş.`,
      ])
    }
    case 'build':
    case 'buildMany': {
      // The palace is placed for free in an instant (the tutorial cheers it); roads and walls are small chores.
      if (c.kind === 'road' || c.kind === 'wall' || c.kind === 'gate' || c.kind === 'palace') return null
      const name = lower(BUILDING_NAMES[c.kind as keyof typeof BUILDING_NAMES] ?? 'yapı')
      return any([
        `Yeni ${name} için temel kazılıyor, lordum.`,
        `Ustalar ${name} iskelesine çıktı, lordum. Çekiç sesleri başladı.`,
        `Bir ${name} daha yükseliyor, lordum. Halk merakla seyrediyor.`,
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} inşaatı başladı, lordum. Ustabaşı "çabuk biter" dedi; ustabaşları hep böyle der.`,
        `Taşlar ve kirişler ${name} için taşınıyor, lordum.`,
        `Bir ${name} kuruluyor, lordum; lordluğumuz bir yapı daha büyüyor.`,
      ])
    }
    case 'upgrade': {
      const b = k?.buildings.find((x) => x.id === c.id)
      if (!b || b.kind === 'road' || b.kind === 'wall' || b.kind === 'gate') return null
      const name = lower(BUILDING_NAMES[b.kind] ?? 'yapı')
      const level = b.level ?? 1
      if (b.kind === 'palace')
        return any([
          `Saray ${level}. seviyeye yükseliyor, lordum! Mimarlar iskelede, hazinedar baygın, ben heyecanlı.`,
          `Sarayın yeni katı için ilk taş kondu, lordum. Bittiğinde hudut genişler, yeni yapılar açılır.`,
          `Saray yükseltmesi başladı, lordum. ${level}. seviye! Ozanlar şimdiden şarkısını yazıyor.`,
          `Ustalar saraya tırmandı, lordum. Yükseltme sürerken saray eski hâliyle hizmet verir; ben de eski odamda beklerim.`,
          `Sarayın ${level}. katı yolda, lordum. Komşular kulelerinden bakıp kıskançlıktan sararacak.`,
          `Saray büyüyor, lordum. Bitince ilk iş kuzey kulesindeki odama bir pencere daha açtırmak; izninizle.`,
        ])
      return any([
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} ${level}. seviyeye yükseliyor, lordum. Bitince daha çok iş görecek.`,
        `Ustalar ${name} için iskele kurdu, lordum. Yükseltme sürerken üretmez ama sonra fazlasıyla öder.`,
        `${level}. seviye ${name}, lordum! Ustabaşı "eskisinin iki katı" dedi; ben biraz abartıyor diye düşünüyorum.`,
        `Bir ${name} yükseltiliyor, lordum. Daha büyük, daha güzel, daha pahalı; dünyanın düzeni böyle.`,
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} yenileniyor, lordum. İşçiler bu fırsatla biraz dinleniyor; görmezden geldim.`,
        `Yükseltme başladı, lordum. ${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} bitince haritada yeni hâlini görürsünüz.`,
      ])
    }
    case 'upgradeTrade':
      return any([
        'Ticaret noktası büyüyor, lordum. Tüccar artık seferde daha çok yük götürecek.',
        'Ticaret noktasına yeni bir kat, lordum. Develer de bunu duydu; yükleri ağırlaşacak, morali bozuldu.',
        'Tüccarımız yeni tezgâhını beğendi, lordum. Seferde daha çok mal, daha çok altın.',
        'Ticaret noktası yükseltildi, lordum. Rakipler de görüyor; haritada seviyesi yazıyor.',
        'Yeni depolar, yeni tenteler, lordum. Tüccar el ovuşturuyor; ben de öyle.',
        'Ticaret büyüyor, lordum. Yalnız ambarda satacak mal olsun; boş tezgâh dolu tezgâhtan çirkindir.',
      ])
    case 'tradeGood':
      return c.good === null || c.good === undefined || c.good === 'none'
        ? any([
            'Tüccar evde kalacak, lordum. Develeri ahıra çekti, kendisi de taburesine.',
            'Satış durdu, lordum. Mallar ambarda kalır, hazine bekler.',
            '"Hiçbir şey satma" dediniz, lordum. Tüccar ilk kez bu kadar az iş için bu kadar çok sevindi.',
            'Tüccar dinlenmeye çekildi, lordum. Ambar sınırına dikkat; sığmayan mal boşa gider.',
            'Ticaret beklemede, lordum. Fiyatlar toparlanınca yeniden başlarız, değil mi?',
            'Tüccar boşta, lordum. Devesi bana bakıyor; sanırım bana da "ne iş yapıyorsun" diyor.',
          ])
        : any([
            `Tüccar artık ${goodOf(c.good)} satacak, lordum. Çuvallar yükleniyor.`,
            `Develere ${goodOf(c.good)} yüklendi, lordum. Fazla olanı satmak, akıllı lordun işidir.`,
            `Satılacak mal: ${goodOf(c.good)}, lordum. Tüccar başını salladı; ne satsa satar, o öyle biri.`,
            `Tüccar ${goodOf(c.good)} ile yola çıkıyor, lordum. Yalnız çok satılan malın fiyatı düşer; gözümüz pazarda olsun.`,
            `${goodOf(c.good).charAt(0).toLocaleUpperCase('tr')}${goodOf(c.good).slice(1)} satışa çıktı, lordum. Ambar biraz hafifler, kese biraz ağırlaşır.`,
            `Karar verildi, lordum: ${goodOf(c.good)}. Tüccar bu sefer çuvalları iki kez saydı; benden öğrendi.`,
          ])
    case 'tradeAmount':
      return any([
        `Tüccar artık seferde ${c.units} birim götürecek, lordum.`,
        `Sefer başına yük ${c.units} birim oldu, lordum. Develer hesabı yaptı; memnun değiller ama itaatkârlar.`,
        `Yük ayarlandı, lordum: ${c.units} birim. İki dakika yeniden değiştiremeyiz; deveye de karar vermesi için vakit tanıyalım.`,
        `${c.units} birimlik yük, lordum. Ne çok ne az; altın orta.`,
        `Tüccar yeni yük ölçüsünü öğrendi, lordum: ${c.units} birim. Çuvalları yeniden bağlıyor.`,
        `Seferde ${c.units} birim satılacak, lordum. Ambarın hâline göre arada bir bakalım.`,
      ])
    case 'product': {
      const name = PRODUCT_NAMES[c.product as string]
      if (!name) return null
      const p = lower(name)
      return any([
        `Artık ${p} üretilecek, lordum. İşçiler aletlerini değiştirdi.`,
        `${name}, lordum! Ustalar başını salladı; değişiklikten hoşlanmazlar ama itiraz da etmezler.`,
        `Ürün değişti: ${p}, lordum. Bir sonraki turda farkı görürsünüz.`,
        `İşçilere ${p} dediniz, lordum. Biri "dün başka diyordunuz" dedi; ona hükümdarların fikir değiştirebileceğini hatırlattım.`,
        `${name} için hazırlıklar yapıldı, lordum. Ambara ya da cephaneliğe yer olduğundan emin olalım.`,
        `Yeni iş: ${p}, lordum. Atölyenin bacasından çıkan duman bile rengini değiştirdi sanki.`,
      ])
    }
    case 'buy':
      return any([
        `Pazardan ${c.units} ${goodOf(c.good)} alındı, lordum. Arabalar ambara yol aldı.`,
        `${c.units} ${goodOf(c.good)} için kese açıldı, lordum. Pazarcı gülümsedi; pazarcılar hep gülümser, altını görünce.`,
        `Alışveriş tamam, lordum: ${c.units} ${goodOf(c.good)}. Fiyat biraz yükseldi; aldıkça pahalanır, bilirsiniz.`,
        `Ambara ${c.units} ${goodOf(c.good)} girdi, lordum. Hazinedar bir kenarda sessizce ağlıyor.`,
        `Pazardan ${goodOf(c.good)} geldi, lordum. Eksik kapandı; bekleyen inşaat da şimdi başlayabilir.`,
        `Pazarcı ${c.units} ${goodOf(c.good)} tarttı, lordum. Ben de terazinin başında durdum; eksik tartmasın diye.`,
      ])
    case 'townBuy':
      return any([
        `Askerler kasaba pazarından ${c.units} birim mal yüklendi, lordum. Saraya varınca ambara girer.`,
        `Kasabadan alışveriş yapıldı, lordum: ${c.units} birim. Askerler hem asker hem hamal; ikisine de maaş veriyoruz zaten.`,
        `${c.units} birim mal orduya yüklendi, lordum. Yolda bir çarpışmaya girmesinler; yenilen ordu yükünü kaybeder.`,
        `Kasaba pazarcısı ordunun önünde fiyat indirmedi, lordum; cesur adam. ${c.units} birim yüklendi.`,
        `Ordu yüklü, lordum: ${c.units} birim. Eve dönünce ambar dolacak, askerlerin sırtı ağrıyacak.`,
        `Kasabadan mal aldık, lordum. Askerler çuvalları kalkan gibi taşıyor; düşman görse gülerdi.`,
      ])
    case 'townUpkeep': {
      const w = UPKEEP_WORDS[Number(c.level)] ?? 'yeni'
      return Number(c.level) === 0
        ? any([
            'Kasabanın bakımı kesildi, lordum. Hazine rahatlar ama kasabanın sadakati düşer.',
            'Kasabaya artık bir şey gitmeyecek, lordum. Kasabalılar bunu fark eder; sadakat de fark eder.',
            'Bakım yok, lordum. Kasabanın valisi mektup yazdı; ağzı bozuk bir mektup.',
            'Kasabanın kesesi kapandı, lordum. Sadakat ayaklanma çizgisine yaklaşırsa haber veririm.',
            'Bakım durdu, lordum. Bedava sadakat yoktur; ama hazineniz bunu bir süre kaldırabilir.',
            'Kasaba kendi başının çaresine bakacak, lordum. Bakalım bize ne kadar bağlı kalacak.',
          ])
        : any([
            `Kasabanın bakımı ${w} oldu, lordum. Sadakat ona göre kayacak.`,
            `${w.charAt(0).toLocaleUpperCase('tr')}${w.slice(1)} bakım, lordum. Kasabalılar keselerinin ağırlığını hissedecek.`,
            `Kasaba için ${w} bakım ayrıldı, lordum. Sadakat birkaç turda hedefine doğru kayar.`,
            `Bakım ayarlandı: ${w}, lordum. Valinin yüzü ${Number(c.level) >= 3 ? 'güldü; hem de çok' : 'biraz güldü'}.`,
            `Kasabaya ${w} bakım gidecek, lordum. Hazine her tur öder; hazinede yoksa o tur bakım yokmuş sayılır.`,
            `Kasabanın kesesi ${w} doldurulacak, lordum. Sadık kasaba, daha çok katkı demektir.`,
          ])
    }
    // ---- Armies ----
    case 'raise': {
      const n = unitsOf(c.units)
      return any([
        `${n ? `${n} askerlik ` : ''}bir ordu garnizondan çıktı, lordum. Sancak açıldı, davullar çalıyor.`,
        'Ordu kapının önünde saf tuttu, lordum. Emirlerinizi bekliyorlar; hudut dışına çıkınca emirler elçiyle gider.',
        'Yeni bir ordu, lordum! Askerler kılıçlarını parlattı; parlattıkları kılıçlarda kendilerini görüp düzeldiler.',
        `${n ? `${n} asker ` : 'Askerler '}sarayın önünde toplandı, lordum. Haritada sancağınızla görünecekler; herkes görecek.`,
        'Ordu kuruldu, lordum. Sahada en çok iki ordumuz olur; bu onlardan biri, iyi kullanalım.',
        'Garnizon boşaldı, sancak doldu, lordum. Nereye gitsinler?',
      ])
    }
    case 'king':
      return c.action === 'lead'
        ? any([
            'Hükümdar ordusunun başına geçti, lordum! Emirler artık elçisiz, hemen gider.',
            'Kral atına bindi, taçlı sancak açıldı, lordum. Askerler bir anda bir karış uzadı.',
            'Ordu kralını buldu, lordum. Zarlar onun savaş yeteneğiyle atılacak; dikkat, kral da düşebilir.',
            'Kraliyet sancağı ordunun önünde, lordum. Haritada herkes görecek; düşman da.',
            'Hükümdar komutada, lordum. Ben elçi olarak işsiz kaldım; bu emirler artık bana uğramıyor.',
            'Kral askerlerin arasında, lordum. Kraliçe pencereden el salladı; ben de mendilimle.',
          ])
        : any([
            'Kral saraya döndü, lordum. Ordunun emirleri yine elçiyle gidecek; ben yeniden işe döndüm.',
            'Hükümdar komutayı bıraktı, lordum. Taçlı sancak saraya geri asıldı.',
            'Kral sağ salim sarayda, lordum. Kraliçe rahat bir nefes aldı; ben de.',
            'Komuta yeniden komutanlarda, lordum. Kral miğferini çıkardı, tacını taktı.',
            'Hükümdar sarayına döndü, lordum. Askerler biraz boyun büktü ama savaş devam eder.',
            'Kral ordudan ayrıldı, lordum. Ben yine at sırtında koşuşturacağım; dizlerim şimdiden ağrıyor.',
          ])
    case 'army': {
      const o = (c.order ?? {}) as { kind?: string; siege?: boolean }
      switch (o.kind) {
        case 'move':
          return o.siege
            ? any([
                'Ordu kuşatmaya gidiyor, lordum. Kapıya varınca kuşatma başlar.',
                'Kuşatma emri verildi, lordum. Askerler merdivenleri ve sabırlarını yanlarına aldı.',
                'Ordu kasabaya yürüyor, lordum. Kuşatma uzun sürer; sabır kılıçtan önce gelir.',
                'Sancak kasabaya döndü, lordum. Garnizon bizi uzaktan görünce dualarını hatırlayacak.',
                'Kuşatmaya yürüyüş başladı, lordum. Ordu kapıda kalmalı; gönderilirse kuşatma kalkar.',
                'Askerler kasabanın yolunu tuttu, lordum. Kasabalılar şimdiden kapılarını sürgülüyordur.',
              ])
            : any([
                'Ordu yola çıktı, lordum. Hudut dışındaysa emirler elçiyle gider, unutmayın.',
                'Sancak yürüyor, lordum. Askerler adım sayıyor; çavuş daha yüksek sesle sayıyor.',
                'Emir verildi, lordum. Ordunun tozunu buradan görüyorum.',
                'Ordu yönünü değiştirdi, lordum. Yürürken moral biraz düşer; hanların yanında toparlanır.',
                'Askerler yeni hedefe yürüyor, lordum. Yolları seçerler, köprülerden geçerler; akıllı askerler.',
                'Davullar yürüyüş havası çalıyor, lordum. Rota kesik çizgiyle haritada.',
              ])
        case 'home':
          return any([
            'Ordu eve dönüyor, lordum. Kışlada sıcak çorba bekliyor.',
            'Geri dönüş emri verildi, lordum. Askerler sevindi; çavuş bunu belli etmemeye çalıştı.',
            'Sancak saraya döndü, lordum. Garnizona katıldıklarında moral de toparlanır.',
            'Ordu yuvasına dönüyor, lordum. Analar kapılarda bekleyecek.',
            'Eve dönüş, lordum. En sevilen emir budur; askerler bunu her zaman duyar, ilk seferde.',
            'Ordu geri çağrıldı, lordum. Yürürken türkü söylüyorlar; sözleri pek düzgün değil.',
          ])
        case 'split':
          return any([
            'Ordu ikiye bölündü, lordum. Her parça artık kendi yolunda.',
            'İki sancak oldu, lordum. Komutanlar birbirine kaş göz ediyor; kim daha iyi, göreceğiz.',
            'Bölme emri yerine geldi, lordum. İki küçük ordu bir büyükten daha çok yer tutar; daha az zar atar.',
            'Ordu ayrıldı, lordum. Askerler arkadaşlarına el sallıyor; sanki yıllarca görüşmeyecekler.',
            'Bölündük, lordum. Her türden orantılı ayrıldı; kâtip hesabı iki kez yaptı.',
            'İki ordu, lordum. Biri burada beklesin, biri gitsin; ya da ikisi de gitsin, karar sizin.',
          ])
        case 'merge':
          return any([
            'Ordular birleşti, lordum. Tek sancak, tek yürek.',
            'İki ordu tek oldu, lordum. Komutanlardan biri kahrından küstü; ona sonra bir görev buluruz.',
            'Birleşme tamam, lordum. Büyük ordu, büyük zar; büyük maaş da.',
            'Askerler kucaklaştı, lordum. Yıllardır ayrıymış gibi; oysa yarım saat olmuştu.',
            'Ordular kaynaştı, lordum. Bu kalabalık düşmanın moralini daha bakarken bozar.',
            'Tek ordu, lordum. Haritada sancak büyüdü; rakipler de gördü.',
          ])
        case 'chase':
          return any([
            'Ordu yağmacıların peşine düştü, lordum. Yağmacılar yavaş yürür; önlerini keseceğiz.',
            'Takip başladı, lordum. Askerler izleri okuyor; birinin burnu av köpeğinden keskin.',
            'Çetenin peşindeyiz, lordum. Yakalarsak ganimet bizim, yollar da temiz.',
            'Ordu yola çıktı, lordum; hedef yağmacılar. Tüccarımız bunu duyunca sevinecek.',
            'Yağmacılara gün doğdu, lordum; ama onlar için iyi bir gün değil.',
            'Takip emri verildi, lordum. Yakalayınca haber getiririm; yakalayamazsak da getiririm, daha kısık sesle.',
          ])
        case 'cave':
          return any([
            'Ordu mağaraya yürüyor, lordum. Klanın yuvasına dayanacağız.',
            'Mağara kuşatması başlıyor, lordum. Meşaleler hazır, askerler pek değil; karanlıktan korkarlar.',
            'Ordu dağ yolunda, lordum. Mağarayı alırsak klan yok olur, ganimet bizim olur.',
            'Kuşatma emri verildi, lordum. Yağmacılar kendi mağaralarında güçlüdür; askerlerin sayısı bol olsun.',
            'Sancak mağaraya dönük, lordum. İzleri sürmenin karşılığını şimdi alacağız.',
            'Ordu klanın mağarasına gidiyor, lordum. Mağaranın kokusu şimdiden geliyor; ganimet kokusu da.',
          ])
        default:
          return null
      }
    }
    // ---- The navy ----
    case 'fleet': {
      const order = (c.order ?? {}) as { kind?: string; good?: string }
      if (c.action === 'mission') {
        switch (order.kind) {
          case 'port':
            return any([
              'Filo limanda bekleyecek, lordum. İskeleyi korur.',
              'Gemiler demir attı, lordum. Tayfa iskelede ağ örüyor.',
              'Filo limanda, lordum. Bir saldırı olursa ilk onlar karşılar.',
              'Yelkenler sarıldı, lordum. Gemiler limanda dinleniyor; tayfa meyhanede.',
              'Liman nöbeti başladı, lordum. Kaptan dürbünüyle ufku tarıyor.',
              'Filo evde kalacak, lordum. Denizciler bunu tatil sanıyor; değil.',
            ])
          case 'fish':
            return any([
              'Filo balığa çıktı, lordum. Ağlar atıldı, martılar heyecanlı.',
              'Gemiler iskele önünde balık tutacak, lordum. Ambara taze balık girecek.',
              'Balık avı başladı, lordum. Kokalar en çok tutar; kadırgalar biraz utangaçtır.',
              'Ağlar suya, lordum! Akşam sofrasında balık var; ben de davetliyim sanırım.',
              'Filo balıkçı oldu, lordum. Kaptan "bu bana yakışmaz" dedi, ama ağını iyi atıyor.',
              'Balıkçılar yola çıktı, lordum. Korsanlar uzak olsun, balıklar yakın.',
            ])
          case 'hunt':
            return any([
              'Filo korsan avına çıktı, lordum. Korsanlar yakalandıkça ödül gelir.',
              'Savaş gemileri ufka açıldı, lordum. Kara yelkenliler artık rahat uyuyamaz.',
              'Korsan avı başladı, lordum. Ticaret seferlerimiz de daha güvende olur.',
              'Kadırgalar korsan peşinde, lordum. Tayfa kılıçlarını biledi; kürekleri de.',
              'Filo deniz devriyesinde, lordum. Arada bir gemi batabilir; deniz cömert ama acımasızdır.',
              'Korsanlara dikkat, lordum; yani artık korsanlar bize dikkat etsin.',
            ])
          case 'trade':
            return any([
              `Filo ${order.good ? goodOf(order.good) : 'mal'} yüklü taç limanına yelken açtı, lordum.`,
              `Ambarlar boşaltıldı, gemiler doldu, lordum. Deniz ticareti başladı.`,
              `Filo deniz ticaretinde, lordum. Satılan her sefer o taçla ilişkimizi de ısıtır.`,
              `Yelkenler şişti, lordum; ${order.good ? goodOf(order.good) : 'yük'} denize açıldı. Korsanlar da bunu biliyorsa eskort iyi olur.`,
              'Ticaret filosu uğurlandı, lordum. Limandaki aracılar biraz pay alır; ama yük büyük.',
              'Gemiler yola çıktı, lordum. Kaptana "fırtınadan kaçın" dedim; "korsandan da" diye ekledim.',
            ])
          case 'blockade':
            return any([
              'Filo abluka için yola çıktı, lordum. Düşmanın iskelesi önünde sıraya dizilecek.',
              'Abluka emri verildi, lordum. Düşmanın balığı ağzında kalacak.',
              'Kadırgalar düşmanın iskelesine gidiyor, lordum. Oradaki gemilerle çarpışırsak kazanmalıyız.',
              'Abluka yolda, lordum. Başarılı olursa düşmanın deniz ticareti durur.',
              'Filo düşman sularına yöneldi, lordum. Tayfa şarkı söylüyor; korkudan mı neşeden mi, bilmiyorum.',
              'Ablukacılarımız yelken açtı, lordum. Düşmanın iskelesi yakında bizim kadırgalarla dolu olacak.',
            ])
          case 'raid':
            return any([
              'Filo kıyı akınına çıktı, lordum. Düşmanın depolarından pay almaya gidiyor.',
              'Akıncılar denizde, lordum. Kazanırlarsa ganimetle dönerler.',
              'Kıyı akını başladı, lordum. Gemiler taşıyabildiği kadar yüklenecek.',
              'Filo düşman kıyılarına gidiyor, lordum. Tayfa ganimet çuvallarını şimdiden katladı.',
              'Akın emri verildi, lordum. Düşmanın gemileri karşı çıkarsa çarpışacağız.',
              'Yelkenler düşmana dönük, lordum. Akın kısa sürer, hatırası uzun.',
            ])
          case 'sortie':
            return any([
              'Filo ablukayı yarmaya çıkıyor, lordum!',
              'Gemilerimiz abluka filosunun üstüne gidiyor, lordum. Kazanırsak iskelemiz kurtulur.',
              'Ablukayı yarma emri verildi, lordum. Tayfa dişlerini sıktı.',
              'Kadırgalar çıkıyor, lordum. Düşmanın gemileri bunu beklemiyordu.',
              'Filo saldırıya geçti, lordum. Balığımız, ticaretimiz bu çarpışmada.',
              'Ablukaya karşı çıkış, lordum. Rüzgâr bizden yana olsun.',
            ])
          default:
            return null
        }
      }
      switch (c.action) {
        case 'form':
          return any([
            'Limandan yeni bir filo çıktı, lordum. Sancak direkte dalgalanıyor.',
            'Filo kuruldu, lordum. Kaptan atandı; eski bir korsanmış, ama tövbeli.',
            'Gemiler sıraya girdi, lordum. Bir filo, bir sancak, bir görev bekliyor.',
            'Yeni filo hazır, lordum. Balık mı, ticaret mi, korsan mı; emir sizin.',
            'Filo limandan ayrıldı, lordum. En çok iki filo çıkarabiliriz; bu onlardan biri.',
            'Tayfalar gemilere bindi, lordum. Ben iskelede kaldım; deniz tutar beni.',
          ])
        case 'split':
          return any([
            'Filo ikiye bölündü, lordum.',
            'İki filo oldu, lordum. Kaptanlar artık birbiriyle yarışacak.',
            'Gemiler ayrıldı, lordum. Biri bir yana, biri öbür yana.',
            'Filo bölündü, lordum. Kaptanlardan biri haritayı aldı, öbürü pusulayı; umarım değiş tokuş ederler.',
            'Bölme tamam, lordum. Her filonun kendi görevi olabilir artık.',
            'İki ayrı filo, lordum. Denizler geniş, ikisine de yer var.',
          ])
        case 'merge':
          return any([
            'Filolar birleşti, lordum. Daha büyük filo, daha büyük güç.',
            'Gemiler tek sancak altında toplandı, lordum.',
            'Birleşme tamam, lordum. Korsanlar bu filoyu görünce rotalarını değiştirir.',
            'İki kaptan bir oldu, lordum; daha doğrusu biri kaptan kaldı, öbürü kâtip oldu.',
            'Filo büyüdü, lordum. Haritada etiketi de büyüdü.',
            'Gemiler kaynaştı, lordum. Tayfalar birbirine eski hikâyelerini anlatıyor.',
          ])
        case 'dock':
          return any([
            'Filo limana bağlandı, lordum. Gemiler yeniden liman gemileri.',
            'Filo dağıtıldı, lordum; gemiler iskeleye yanaştı.',
            'Tayfa karaya çıktı, lordum. Gemiler limanda dinleniyor.',
            'Filo limana katıldı, lordum. İskeleyi savunurlar.',
            'Sancak indirildi, lordum. Gemiler limana bağlandı.',
            'Filo eve döndü ve dağıldı, lordum. Kaptan da emekli olmak istiyor; ona bir fıçı şarap gönderdim.',
          ])
        case 'recall':
          return any([
            'Filo geri çağrıldı, lordum. Yol aldığı kadar geri dönecek.',
            'Geri dönüş emri, lordum. Yelkenler eve doğru çevrildi.',
            'Filo dönüyor, lordum. Tayfa sevindi; deniz yorgunu adamlar.',
            'Kaptana dönüş emri gönderdik, lordum.',
            'Filo görevi bıraktı, lordum. Eve dönüyorlar.',
            'Gemiler geri geliyor, lordum. Limanda onları bir fıçı ve bir ziyafet bekliyor.',
          ])
        case 'sail':
          return any([
            'Filo yelken açtı, lordum. Rotası haritada.',
            'Gemiler yola çıktı, lordum. Suyun ortasından giderler; kıyıdan uzak, kayadan uzak.',
            'Filo yeni yerine gidiyor, lordum. Rüzgâr arkadan essin.',
            'Kaptan rotayı çizdi, lordum. Vardıkları yerde demirleyecekler.',
            'Yelkenler şişti, lordum. Martılar da peşlerinde.',
            'Filo hareket etti, lordum. Kürekçiler tempo tutuyor; ben de ayağımla.',
          ])
        case 'chase':
          return any([
            'Filo korsan teknesinin peşine düştü, lordum.',
            'Korsanların önü kesilecek, lordum. Filo tam yelken yolda.',
            'Takip başladı, lordum. Korsanlar bizden yavaş; yakalarsak batırırız.',
            'Kara yelkenlinin peşindeyiz, lordum. Batırırsak ödül de bizim.',
            'Kaptan "kara yelkeni görürsem bırakmam" dedi, lordum. Sözünün eri bir adam.',
            'Filo korsanlara doğru, lordum. Kadırgalar çektirileri yener; dua edelim yeterince kadırgamız olsun.',
          ])
        case 'unchase':
          return any([
            'Filo takibi bıraktı, lordum.',
            'Korsanların peşinden vazgeçildi, lordum. Bugün şanslı günleri.',
            'Takip bitti, lordum. Kaptan biraz homurdandı ama emir emirdir.',
            'Filo durdu, lordum. Korsanlar uzaklaşıyor; başka gün.',
            'Takibi bıraktık, lordum. Deniz geniş, korsan bol; yine karşılaşırız.',
            'Filo yeni emri bekliyor, lordum. Korsanlar bizden kurtuldu; bu sefer.',
          ])
        default:
          return null
      }
    }
    // ---- Envoys, spies and the other lords ----
    case 'envoy': {
      const terms = c.terms as { kind?: string } | undefined
      switch (c.kind) {
        case 'improve':
          return any([
            'Elçimiz tatlı sözlerle yola çıktı, lordum. İlişkimiz biraz ısınacak.',
            'Nezaket elçisi yolda, lordum. Yanında bir kese ve benim yazdığım üç iltifat var.',
            'İlişkiyi geliştirmek için elçi gönderildi, lordum. Varınca teklif karşı tarafa düşer.',
            'Elçimiz şapkasını düzeltti, gülümsemesini taktı, lordum. Dost kazanmaya gidiyor.',
            'Bir dostluk elçisi yolda, lordum. İtibarımız iyiyse sözlerimiz daha çok tutar.',
            'Elçi karşı saraya gidiyor, lordum. Ben gidecektim ama dizlerim izin vermedi.',
          ])
        case 'gift':
          return any([
            `Elçimiz ${c.gold ? `${c.gold} altınlık ` : ''}bir hediyeyle yola çıktı, lordum.`,
            `Hediye sandığı yolda, lordum. ${c.gold ? `${c.gold} altın; ` : ''}gönüller altınla kolay açılır.`,
            'Hediye gönderildi, lordum. Karşı taraf sandığı açınca yüzü gülecek.',
            'Kesenin ağzı açıldı, lordum. Bu altın oraya varınca ilişki de ısınır.',
            'Hediyemiz yolda, lordum. Ben sandığa bir de mektup koydum; altın konuşur ama mektup süsler.',
            'Cömertliğiniz yola çıktı, lordum. Hediye ne kadar büyükse ilişki o kadar ısınır.',
          ])
        case 'tribute':
          return any([
            `Haraç isteğimiz yolda, lordum${c.gold ? `: turda ${c.gold} altın` : ''}. Kabul ederlerse hazine her tur dolar.`,
            'Elçimiz haraç istemeye gitti, lordum. Kaşlarını çatmayı biliyor; ben öğrettim.',
            'Haraç talebi gönderildi, lordum. Reddederlerse ilişki çok düşer; kabul ederlerse biraz.',
            'Elçimiz sert bir mektupla yolda, lordum. Karşı lord okurken çayını dökecek.',
            'Haraç istendi, lordum. Cevap gelince haber getiririm; kızgın bir cevap olabilir.',
            'Haraç elçisi yola düştü, lordum. Güçlü olan ister, akıllı olan verir; bakalım hangisi akıllı.',
          ])
        case 'alliance':
          return any([
            'İttifak teklifimiz yolda, lordum. Kabul ederlerse ordularımız birbirini korur.',
            'Elçimiz ittifak sözleşmesiyle gitti, lordum. Mührü ben bastım, en güzel yerine.',
            'İttifak teklifi gönderildi, lordum. Dost kılıcı yanınızda, düşman kılıcı karşınızda olur.',
            'Bir müttefik arıyoruz, lordum. Elçi karşı sarayda en iyi yüzünü takınacak.',
            'İttifak elçisi uğurlandı, lordum. İttifakı bozmak ilişkiyi çok düşürür; iyi seçtiğimizi umalım.',
            'Teklif yolda, lordum. Kabul gelirse ilk kadehi birlikte kaldırırız.',
          ])
        case 'peace':
          return any([
            `Barış teklifimiz yolda, lordum${terms?.kind === 'white' ? ': beyaz barış' : ''}. Kabul ederlerse kılıçlar kınına girer.`,
            'Elçimiz beyaz bayrakla yola çıktı, lordum. Umarım bayrağı tanırlar.',
            'Barış teklifi gönderildi, lordum. Savaş puanımız yüksekse kabul etmekten başka çareleri kalmaz.',
            'Elçi barış antlaşmasını taşıyor, lordum. Mürekkep kurumadan bir savaş daha çıkmasın.',
            'Barış istedik, lordum. Halk bunu duyunca derin bir nefes aldı.',
            'Barış elçisi yolda, lordum. Ben savaşı da barışı da bilirim; barış daha az ses yapar.',
          ])
        case 'insult':
          return any([
            'Elçimiz hakaret götürmeye gitti, lordum. Varınca ilişki çok düşer; onlar da savaş gerekçesi kazanır.',
            'Hakaret elçisi yolda, lordum. Ona en iyi sözlerimi verdim; yani en kötülerini.',
            'Elçimiz boğazını temizledi, lordum. Söyleyeceklerini duyan karşı lord bir hafta uyuyamaz.',
            'Hakaretimiz yola çıktı, lordum. Diplomaside buna "sert bir mektup" denir; biz yalnız sesli söylüyoruz.',
            'Elçi hakaretleri ezberledi, lordum. Bir tanesini ben ekledim, keçilerle ilgili.',
            'Hakaret yolda, lordum. Sonra bana kızmayın; ben yalnızca taşıyorum.',
          ])
        default:
          return null
      }
    }
    case 'respond':
      return c.accept
        ? any([
            'Teklifi kabul ettiniz, lordum. Elçi cevabı götürüyor.',
            'Kabul cevabı yolda, lordum. Karşı saray bunu duyunca sevinecek.',
            'Evet dediniz, lordum. Mühürlendi ve gönderildi.',
            'Anlaşma tamam, lordum. Elçi eğilip selam verdi ve yola koyuldu.',
            'Teklif kabul edildi, lordum. Ben de bu anı anılarıma yazıyorum.',
            'Kabul, lordum. Bazen en güçlü söz "evet"tir.',
          ])
        : any([
            'Teklifi reddettiniz, lordum. Elçi yüzünü buruşturdu ve gitti.',
            'Ret cevabı yolda, lordum. Karşı taraf pek hoşlanmayacak.',
            'Hayır dediniz, lordum. Kibarca söyledim; yine de kapıyı çarparak çıktı.',
            'Teklif geri çevrildi, lordum. İlişki bundan etkilenebilir, haberiniz olsun.',
            'Elçiyi eli boş gönderdik, lordum. Yolda ne düşündüğünü tahmin edebiliyorum.',
            'Reddedildi, lordum. Bazen en güçlü söz de "hayır"dır.',
          ])
    case 'declareWar':
      return any([
        'Savaş ilan edildi, lordum! Davullar çalıyor, sancaklar açılıyor.',
        'Savaş elçisi yolda, lordum. Bu haber vardığında bütün lobi duyacak.',
        'Kılıçlar kınından çıktı, lordum. Gerekçesiz savaş açtıysak öbür lordlar da bize biraz soğuyacak.',
        'Savaş başladı, lordum. Askerler sabırsız, analar endişeli, ben de ikisi birden.',
        'Savaş ilanı mühürlendi, lordum. Artık geri dönüş yok; ya da barış teklifine kadar yok.',
        'Ordulara haber gitti, lordum: düşmanla karşılaşınca muharebe olacak. Tanrı yardımcımız olsun.',
      ])
    case 'breakAlliance':
      return any([
        'İttifak bozuldu, lordum. Eski dostumuz bunu unutmayacak.',
        'Antlaşma yırtıldı, lordum. İlişki çok düşecek; onlar da savaş gerekçesi kazanır.',
        'İttifak sona erdi, lordum. Ben yırtılan antlaşmanın parçalarını topladım; hatıra olarak.',
        'Dostluk bitti, lordum. Elçi haberi götürürken başını öne eğdi.',
        'İttifakı bozdunuz, lordum. Bazen yollar ayrılır; yalnız ayrılan yol bir gün karşınıza çıkabilir.',
        'Mühür kırıldı, lordum. Artık kendi ordumuzla kendimizi korumalıyız.',
      ])
    case 'endTribute':
      return any([
        'Haraç anlaşması bitti, lordum. Elçi haberi götürüyor.',
        'Haraç işi kapandı, lordum. Hazinedar defterden bir satır sildi.',
        'Haraca son verdiniz, lordum. Bağışladıysak gönül kazanırız; kestiysek bedelini ödeyeceğiz.',
        'Anlaşma sona erdi, lordum. Altın akışı durdu; ilişkiler de buna göre değişecek.',
        'Haraç bitti, lordum. Bazen cömertlik, bazen gurur; hangisi olduğunu tarih yazar.',
        'Haraç defteri kapandı, lordum. Ben mürekkebi kurutuyorum.',
      ])
    case 'raid':
      return any([
        'Askerlerimiz ticaret yolunu basmaya gitti, lordum. Gözcü kuleleri azsa şansımız yüksek.',
        'Baskın başladı, lordum. Başarırsak tüccarlarının yükü ve ticaret noktası bizim kılıçlarımızla tanışır.',
        'On asker yola çıktı, lordum. Yüzlerini sardılar ama kim olduklarını herkes bilecek.',
        'Ticaret yolu yağması emredildi, lordum. Asker kaybımız olacak; ganimetimiz de, umarız.',
        'Askerler pusuya yattı, lordum. Karşı tarafın tüccarı bugün eve geç dönecek.',
        'Baskın yolda, lordum. İlişki düşecek, onlar da savaş gerekçesi kazanacak; ama bu bizim seçimimiz.',
      ])
    case 'spy': {
      const on = SPY_ON[c.topic as string] ?? 'sırlarını'
      return any([
        `Casusumuz yola çıktı, lordum. Hedefin ${on} gözetleyecek.`,
        `Bir casus daha karanlığa karıştı, lordum. Ağ kurdukça ${on} daha iyi göreceğiz.`,
        `Casus pelerinini giydi, lordum. Görevi: ${on} öğrenmek. Yakalanmasın diye dua ediyorum.`,
        'Casusumuz yolda, lordum. Ben de kimseye söylemedim; yalnızca size.',
        `Casus karşı saraya sızıyor, lordum. ${c.topic === 'army' ? 'Ordu konusunda ağ güçlenince birlik türleri de görünür.' : 'Ağ güçlendikçe tahminler daralır.'}`,
        'Gölgede bir adım, lordum. Casusumuz artık bir aşçı yamağı; ya da bir seyis, hangisi olduğunu ben de bilmiyorum.',
      ])
    }
    case 'recall':
      return any([
        'Casus geri çağrıldı, lordum. Gölgeden çıkıp eve dönüyor.',
        'Casusumuz görevi bıraktı, lordum. Evde karşı casusluğa yardım eder.',
        'Geri çağırma emri gizlice gönderildi, lordum. Casus kılık değiştirip yola çıkacak.',
        'Casus dönüyor, lordum. Ağ zamanla zayıflar; sonra yeniden kurarız.',
        'Casusumuzu çektik, lordum. Ona bir sıcak çorba hazırlattım; casuslar da üşür.',
        'Görev bitti, lordum. Casus sessizce geldi; o kadar sessiz ki geldiğini ancak şimdi fark ettim.',
      ])
    case 'intel':
      return any([
        'Casuslardan yeni rapor istendi, lordum. Tahminler yenilendi.',
        'Rapor geldi, lordum. Mürekkebi hâlâ ıslak; casus koşarak getirmiş.',
        'Casus raporu masanızda, lordum. Ağ güçlüyse rakamlar daha doğru.',
        'Yeni haberler var, lordum. Bazıları doğru, bazıları casusun hayal gücü; ağ gücüne bakın.',
        'Raporu okudum, lordum; sonra yaktım. Size okuyacak bir kopyası kaldı tabii.',
        'Casuslarımız konuştu, lordum. Fısıltıyla; ben de fısıltıyla aktarıyorum.',
      ])
    case 'operation': {
      const op = c.op as string
      return op === 'kidnap'
        ? any([
            'Kaçırma operasyonu başladı, lordum. Gece karanlık, ip sağlam olsun.',
            'Casuslar kraliçeye uzanıyor, lordum. Başarırsak hapishanemiz misafir ağırlayacak.',
            'Operasyon yolda, lordum. Ağ harcandı; şimdi şansa kaldı.',
            'Kukuletalı adamlar kuleye tırmanıyor, lordum. Ben bakmıyorum; elçiler böyle şeyleri görmez.',
            'Kaçırma emri verildi, lordum. Yakalanırlarsa herkes kimin yaptığını öğrenir.',
            'Gece yarısı, ip, at ve bir kraliçe, lordum. Masal gibi; sonu iyi biterse.',
          ])
        : op === 'burn'
          ? any([
              'Sabotajcılar depolara yöneldi, lordum. Bu gece bir ambar yanacak; bizimki değil.',
              'Kıvılcım yolda, lordum. Yemek ve malzemenin bir kısmı kül olacak.',
              'Operasyon başladı, lordum. Sabotajcı çakmak taşını cebine koydu.',
              'Depolar hedefte, lordum. Yakalanırlarsa savaş gerekçesi doğar; dikkat.',
              'Ateş emri verildi, lordum. Ben dumanını buradan görmeyi beklemiyorum ama umuyorum.',
              'Sabotaj yolda, lordum. Ağ harcandı; karşılığını alalım.',
            ])
          : op === 'delay'
            ? any([
                'Sabotajcılar inşaatlarına sızdı, lordum. İskeleleri gevşetecekler.',
                'Rakibin ustaları bu gece uyuyamayacak, lordum. Aletleri kayboluyor.',
                'İnşaat sabotajı başladı, lordum. Duvarlar biraz daha geç yükselecek.',
                'Operasyon yolda, lordum. Bir çekiç kaybolur, bir kiriş kırılır; inşaat uzar.',
                'Sabotajcılar şantiyede, lordum. Ustabaşına içki ikram ettiler; sonrası kolay.',
                'Rakip ustaların harcına kum karıştırılacak, lordum. Ben bunu duymadım.',
              ])
            : op === 'townRevolt'
              ? any([
                  'Kışkırtıcılar kasabaya girdi, lordum. Sadakat birazdan sarsılacak.',
                  'Kasabanın meydanında fısıltılar başladı, lordum. Sahibine pek iyi şeyler söylenmiyor.',
                  'Operasyon yolda, lordum. Kasaba halkı bu gece yeni dertler öğrenecek.',
                  'Kışkırtma emri verildi, lordum. Sadakat düşerse kasaba ayaklanır.',
                  'Casuslarımız kasabanın meyhanesinde, lordum. Herkese içki, herkese dedikodu.',
                  'Kasabada isyan tohumları ekiliyor, lordum. Hasadı rakibimiz toplayacak.',
                ])
              : any([
                  'Kışkırtıcılar halkın arasına karıştı, lordum. Rakibin üretimi yarıya inecek.',
                  'İsyan operasyonu başladı, lordum. Meydanlarda öfkeli sözler dolaşacak.',
                  'Casuslar halkı kışkırtıyor, lordum. On dakika sonra rakibin atölyeleri susar.',
                  'Operasyon yolda, lordum. Ağ harcandı; ama fırtına kopacak.',
                  'Rakibin halkı bu gece meşaleleri yakacak, lordum. Biz uzaktan izleriz.',
                  'İsyan tohumları ekildi, lordum. Yakalanırlarsa kimin yaptığı ortaya çıkar; dikkat.',
                ])
    }
    case 'ransom':
      return any([
        'Fidye ödendi, lordum. Kraliçe eve dönüyor.',
        'Altın sandığı yola çıktı, lordum. Kraliçemiz yakında sarayında.',
        'Fidye teslim edildi, lordum. Hazine hafifledi ama saray yeniden dolacak.',
        'Kraliçe için ödedik, lordum. Bazı şeylerin fiyatı sorulmaz.',
        'Fidye gitti, kraliçe geliyor, lordum. Halk sokaklara dökülmeye hazır.',
        'Ödendi, lordum. Kaçıranlar altını saysın; biz kraliçemizi sayarız.',
      ])
    case 'release':
      return any([
        'Rehine kraliçe serbest bırakıldı, lordum. Bu cömertlik ilişkiyi ısıtır.',
        'Hapishanenin kapısı açıldı, lordum. Kraliçe eve dönüyor.',
        'Kraliçeyi bıraktınız, lordum. Karşı saray bunu unutmayacak; iyi anlamda.',
        'Serbest bırakıldı, lordum. Gardiyan biraz üzüldü; ona hep kibar davranıyormuş.',
        'Rehine gitti, lordum. Hapishane sessiz; ben de sessiz kalıyorum.',
        'Kraliçe atına bindi, lordum. Giderken bize başıyla selam verdi; asil bir kadın.',
      ])
    default:
      return null
  }
}
