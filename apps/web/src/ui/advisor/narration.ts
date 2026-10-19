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
        'Rahipler kürsüye çıktı, lordum. "Vergi bir erdemdir" diyorlar; halk erdemi sevdi, vergiyi hâlâ sevmiyor ama artık daha sessiz sevmiyor.',
        'Vaaz başladı, lordum. Rahip öyle güzel anlatıyor ki bir an ben bile vergi vermek istedim. Neyse ki çabuk geçti.',
        'Çanlar çalıyor, lordum; meydan doldu. Vergiden şikâyet eden azaldı, rahibin uzun konuşmasından şikâyet eden arttı.',
        'Rahip "vergi veren el bereketlidir" dedi, lordum. Tahsildar hemen arkasından girdi; zamanlamayı ben ayarlamıştım.',
        'Vaaz bitti, lordum; halk keselerini açtı. Ben de bağış kutusuna iki akçe attım, görünsün diye. Sonra birini geri aldım, görünmesin diye.',
        'Rahip vergiyi öyle dokunaklı anlattı ki tahsildar ağladı, lordum. Ömründe ilk kez birileri onun yüzünden değil, onun için ağlıyordu.',
        'Halk dua ediyor, lordum; yarısı hasat için, yarısı sizin için. Kâtip olsam hasada bahse girerdim, ama ben sadık bir elçiyim.',
        'Vaazdan çıkan köylüler vergiyi "gönüllü bağış" diye anıyor, lordum. Kelimeyi rahibe ben verdim; telif istemedim, şimdilik.',
      ])
    case 'project':
      if (c.action === 'festival')
        return any([
          'Meydana sofralar kuruldu, lordum! Halk adınıza kadeh kaldırıyor; birkaçı adınızı yanlış söylüyor ama niyet önemli.',
          'Şenlik başladı, lordum. Ambardan çıkan yemek gönüllere girdi; yarım saat kimse dert yanmaz, yarım saat sonra yine yanar.',
          'Davullar, zurnalar, kızarmış koyunlar… Lordum, halk bu günü torunlarına anlatacak. Koyunlar anlatamayacak, ama onlar da katkıda bulundu.',
          'Meydanda halay çekiliyor, lordum. Ben de katıldım; iki adımdan sonra dizim "yeter" dedi, oturdum.',
          'Fıçılar açıldı, lordum! Aşçıbaşı "ambar boşalıyor" diye söyleniyor; ona da bir kadeh verdim, şimdi o da şarkı söylüyor.',
          'Şenlik var, lordum: cambazlar ipte, çocuklar ağaçta, ozan masanın üstünde. Masayı ben kurdurmuştum; ozan çıkmasın diye değil tabii.',
          'Halk bu akşam doyacak, gülecek ve sizi anacak, lordum. Yarın yine söylenirler, ama tok karınla söylenmek bambaşkadır.',
          'Şenliğin en güzel anı benim konuşmamdı, lordum. Kısa tutmuştum; halk yine de üçüncü sayfada alkışlamaya başladı.',
        ])
      if (c.action === 'donate') {
        const good = goodOf(c.good)
        return any([
          `Arabalar ${good} yüklü yola çıktı, lordum. Saray kâtipleri adınızı deftere iri harflerle yazacak; ben de yanına küçük harflerle kendiminkini.`,
          `Tacın ambarlarına ${good} gidiyor, lordum. Hükümdar cömertliğinizi duyunca gülümseyecek; o gülümseme bize epey pahalıya geldi, iyi bakalım.`,
          'Bağış yola çıktı, lordum. Saraydaki dostlarımız artık sizden "o cömert lord" diye söz edecek; eskiden "o lord" diyorlardı.',
          `Bir kervan dolusu ${good}, lordum! Tacın ambarcısı sayarken parmakları yetmeyecek; ayak parmaklarına geçecek.`,
          'Bağışınızı hükümdara ben bizzat anlatacağım, lordum; biraz da süsleyerek. Süs bedava, ben de cömertim.',
          'Bizim ambar hafifledi, tacın gönlü ağırlaştı, lordum. Hazinedarımız bu teraziyi pek anlamadı; anlatmaya çalıştım, ağladı.',
          `${good.charAt(0).toLocaleUpperCase('tr')}${good.slice(1)} taca gidiyor, lordum. Ambar fareleri yolculara el salladı; onların da gözü vardı.`,
        ])
      }
      if (c.action === 'give') {
        const id = c.id as (typeof PROJECT_IDS)[number]
        const name = PROJECT_TEXTS[id]?.name ?? 'büyük iş'
        return any([
          `Mallar ${name} için şantiyeye taşınıyor, lordum. Ustalar taşları sayıyor, kâtipler hesapları, ben de ustaları.`,
          `${name} büyüyor, lordum. Yüzyıllar sonra bile adınızla anılacak; yanında küçük bir levhada da benimki, rica ederim.`,
          'Arabalar şantiyeye boşaldı, lordum. Ustabaşı "bu hızla giderse çabuk biter" dedi; ustabaşları bunu doğduklarında da söylemiştir.',
          `${name} için taş üstüne taş, lordum. Bir usta adınızı kemerin altına kazımak istiyor; harfleri ben seçeceğim, imla bende.`,
          `Şantiyede çekiç sesi hiç susmuyor, lordum. ${name} bittiğinde torunlarınız gölgesinde oturacak; şimdilik ben oturuyorum, deneme amaçlı.`,
          `Ambardan çıkan mallar ${name} şantiyesine yığıldı, lordum. Kâtip saydı, ustabaşı saydı, ben de saydım; üçümüz üç ayrı sayı bulduk.`,
          `${name} için bir teslimat daha, lordum. Mimar planı bana da gösterdi; ters tutuyordum, ama çok beğendim.`,
        ])
      }
      return null
    case 'research': {
      const name = RESEARCH_NAMES[c.id as string]?.name
      return any([
        `Bilginler ${name ? `"${name}" üzerine ` : ''}kitaplara gömüldü, lordum. Mumları biz ödüyoruz, aklı onlar; adil bir paylaşım sayılmaz.`,
        `Üniversitede ${name ? `${name} ` : 'yeni bir '}araştırma başladı, lordum. Biri pencereden kuş uçuşunu ölçüyor; bilim böyle bir şey herhalde.`,
        `${name ? `"${name}" ` : 'Yeni araştırma '}defterleri açıldı, lordum. Âlimler kavgaya başladı bile; bilim tartışmadan doğar, bazen de iki kırık sandalyeden.`,
        `Âlimler ${name ? `${name} için ` : ''}kütüphaneye kapandı, lordum. Yemeklerini kapının altından itiyoruz; çorba pek geçmiyor.`,
        `Rektör bana ${name ? `"${name}" ` : 'araştırmayı '}anlatmaya çalıştı, lordum. Yarısında uyudum; uyandığımda o da uyumuştu. Verimli bir toplantıydı.`,
        `Mürekkep hokkaları doldu, lordum; ${name ? `"${name}" ` : 'yeni bilgi '}yolda. Bitince etkisi hemen başlar, âlimlerin kibri ondan da önce.`,
        `${name ? `"${name}" ` : 'Yeni araştırma '}başladı, lordum. Bu fikri aslında ben vermiştim; âlimler biraz daha uzun kelimelerle yazdı, o kadar.`,
      ])
    }
    case 'tax':
      return c.tax === 'low'
        ? any([
            'Vergi indi, lordum. Meydanda adınıza türkü yakıyorlar; hazinedar ise kendi adına ağıt yakıyor.',
            'Halk rahat bir nefes aldı, lordum. Hazine biraz zayıflar ama gönüller semirir; gönülden vergi alınmıyor, ne yazık.',
            'Düşük vergi, lordum! Köylüler şapkalarını havaya attı; birinin şapkası hâlâ inmedi, karga kaptı galiba.',
            'Tahsildarlar evlerine döndü, lordum; ilk kez bir tahsildarın gülümsediğini gördüm. Korkutucu bir manzaraydı.',
            'Vergiyi hafiflettiniz, lordum. Mutlu halk çabuk büyür; hazine de sonra büyür, çok sonra, sabırla.',
            'Çarşıda sizin için dua ediyorlar, lordum. Hazinedarın duası biraz farklı; içinde sizin adınız ve birkaç ağır kelime var.',
          ])
        : c.tax === 'normal'
          ? any([
              'Vergi olağan düzene döndü, lordum. Kimse sevinmedi, kimse kızmadı; iyi vergi böyle bir şeydir, sıkıcı.',
              'Olağan vergi, lordum: halk söylenir ama öder, hazinedar söylenir ama yetinir. Herkes söyleniyor; denge budur.',
              'Vergi ortaya oturdu, lordum. Ne türkü yakan var ne taş atan; ben bu sessizliğe bayılırım, kimse beni çağırmıyor.',
              'Tahsildarlar eski tarifeyi çıkardı, lordum. Köylüler de eski şikâyetlerini; ikisi de tozlanmış ama hâlâ çalışıyor.',
              'Altın orta karar akacak, lordum; halkın gönlü de orta karar. Kırk yıllık tecrübeme göre orta karar olan her şey uzun yaşar; ben de öyleyim.',
              'Vergi normale döndü, lordum. Hazinedar "hm" dedi; ondan duyduğum en coşkulu söz.',
            ])
          : c.tax === 'high'
            ? any([
                'Vergi arttı, lordum. Hazine dolacak; çarşıda yüzler asıldı, ama asık yüzden vergi almıyoruz, şimdilik.',
                'Tahsildarlar yola çıktı, lordum. Kapılar biraz daha geç açılacak, köpekler biraz daha erken havlayacak.',
                'Yüksek vergi, lordum. Hazinedar dans ediyor, köylüler etmiyor. Bir kraliçe ya da tapınak bu yükü hafifletir; dansı değil, yükü.',
                'Keseler hafifleyecek, lordum; halkın keyfi de. Mutluluğa göz kulak olun; ben kulak olurum, gözlerim artık pek görmüyor.',
                'Vergi arttı, lordum. Bir köylü bana "bu da geçer" dedi; geçmezse göç edeceğini de ekledi, çok kibar bir tehditti.',
                'Tahsildarlara yeni defterler dağıttım, lordum; eskileri yetmeyecek. Halk sesini çıkarmıyor; dişlerini sıkmaktan çıkaramıyor.',
              ])
            : any([
                'Ağır vergi, lordum… Hazine dolar ama halk homurdanıyor. Tapınakta bir vaaz iyi gelir; rahibe ben de bir iki laf fısıldarım.',
                'Ağır vergi ilan edildi, lordum. Bazı aileler eşyalarını topluyor; göç başlamadan bir şenlik düşünün derim. Ya da en azından bir pasta.',
                'Ağır vergi, lordum. Tahsildarlar artık kapıyı çalmıyor, kırıyor; marangozlar da tamir ediyor. Ekonomi canlandı diyebiliriz.',
                'Hazineye altın yağacak, lordum; ama yağmurdan sonra sel gelir. Mutsuz halk büyümez, göç eder; giderken kapıyı da kapatmaz.',
                'Ağır vergi duyuldu, lordum; meydandaki türkünün sözleri bir gecede değişti. Size okumayacağım, kafiyeleri de berbat.',
                'Bu vergiyle hazine şişer, halk incelir, lordum. Uzun sürerse bir vaaz, bir şenlik ya da ikisi birden gerekecek; bir de bana yeni bir zırh.',
              ])
    case 'nightShift':
      return c.on
        ? any([
            'Gece mesaisi başladı, lordum. Fenerler yandı, çekiçler susmuyor; halk yorgun düşecek, ben de uykusuz.',
            'Atölyeler gece de çalışıyor, lordum. Üretim artar, yorgunluk da; ikisinden hangisinin daha hızlı arttığını sabah görürüz.',
            'Gece mesaisi, lordum: ay da çalışıyor artık, üstelik maaşsız. Ona bir şey demeyin, sendikalaşmasın.',
            'Kandiller yandı, lordum; oduncu baltayı karanlıkta sallıyor. Parmaklarına dua edelim; sayıyı sabah kontrol ederim.',
            'Gece de üretim var, lordum, ama mutluluk biraz düşer ve yorgunluk birikir. Köylüler esnerken üretiyor; ben esnerken bile yorulurum.',
            'Horozlar şaşırdı, lordum; ne zaman öteceklerini bilmiyorlar. Köylüler de ne zaman uyuyacaklarını. Bir tek ben biliyorum: hiç.',
          ])
        : any([
            'Gece mesaisi bitti, lordum. Halk sonunda uyuyabilecek; ben de, siz yeni bir emir vermezseniz.',
            'Fenerler söndü, lordum. Köylüler yataklarına koştu; biri yolda uyuyakaldı, üstüne battaniye örttüm. Faturasını hazineye yazdım.',
            'Gece yine gece oldu, lordum. Yorgunluk yavaşça geçer; gündüz üretimi de toparlanır, horozlar da.',
            'Atölyeler kapandı, lordum. Duyduğunuz o gürültü halkın horlaması; çekiçten daha yüksek, ama daha ucuz.',
            'Gece mesaisine son verdiniz, lordum. Halk adınıza şükür etti, sonra cümlenin ortasında uyudu.',
            'Çekiçler sustu, lordum. Bu gece sarayda yalnızca benim sesim duyulacak; korkmayın, kısık konuşurum. Uzun ama kısık.',
          ])
    case 'queen':
      return any([
        'Saraya kraliçe geldi, lordum! Çanlar çalıyor, halk sokaklarda. Hanedanınız artık sürecek; benim işim de, şükür.',
        'Kraliçeniz saraya adım attı, lordum. Saray birden daha aydınlık oldu; mutfak daha kalabalık, benim odam daha küçük.',
        'Kraliçe geldi, lordum! İlk işi perdeleri değiştirmek oldu; ikinci işi beni baştan aşağı süzmek. Üçüncü işinden korkuyorum.',
        'Saray kapısına çiçekler serildi, lordum. Kraliçe yürürken halk alkışladı; ben de alkışladım, en yüksek sesle, görsün diye.',
        'Tahtın öbür yarısı nihayet doldu, lordum. Halkın mutluluğu da arttı, hanedanın umudu da; hazinedarın endişesi de, terzi faturalarından.',
        'Kraliçeniz geldi, lordum; yanında üç sandık elbise ve bir kedi. Kedi beni sevmedi. Kraliçe henüz karar vermedi.',
      ])
    case 'train': {
      const unit = UNIT_NAMES[c.unit as keyof typeof UNIT_NAMES]
      const u = unit ? lower(unit) : 'asker'
      const n = Number(c.count) || 0
      return any([
        `Kışlada ${n || ''} ${u} talime başladı, lordum. Çavuşun sesi saraydan duyuluyor; kraliçenin kedisi bile hazırol duruşuna geçti.`,
        `Gençler yazıldı, lordum; ${u} olacaklar. Anneleri ağlıyor, çavuş gülüyor; çavuşun güldüğü pek görülmez, iyiye işaret değil.`,
        `${n ? `${n} ` : ''}${u} adayı kışlanın kapısından girdi, lordum. Çıktıklarında ayrı insanlar olacaklar; daha az uykulu, daha çok bağıran.`,
        `Talim meydanında toz duman, lordum. ${unit ? `${unit} adayları` : 'Adaylar'} ilk gün bol bol düştü; ikinci gün daha az düşecekler, üçüncü gün çavuşu düşürecekler.`,
        `Çavuş yeni ${u} adaylarına "lordunuz sizi izliyor" dedi, lordum. Hepsi dimdik durdu; bir an ben de durdum, belim itiraz etti.`,
        `Kışla yeniden kalabalık, lordum: ${n ? `${n} ` : ''}${u} yetişiyor. Maaşları ve yemekleri her tur hazineden çıkacak; askerlerin iştahını hesaba katmadan söylüyorum.`,
      ])
    }
    case 'disband': {
      const n = unitsOf(c.units)
      return any([
        'Askerler evlerine döndü, lordum. Tarlalar sevinecek, analar sevinecek; maalesef düşmanlarımız da.',
        `${n ? `${n} asker ` : 'Askerler '}kılıcını asıp çapasını aldı, lordum. Maaş gideri azaldı; tarlada kılıç sallayanı görürsem uyarırım.`,
        'Terhis edilenler köylerine dağıldı, lordum. Biri giderken çavuşa el salladı; çavuş da salladı, ama bir parmağıyla.',
        'Askerler köylü oldu, lordum. Eğitimin bedeli geri gelmez, ama artık her tur maaş da gitmez. Hazinedar bunu duyunca yanağımdan öptü; tuhaf bir gündü.',
        'Kışla biraz boşaldı, lordum. Analar sevindi; komşu lordun casusu da not aldı. Ona ben söylemedim, yemin ederim, bu sefer değil.',
        `Garnizondan ${n ? `${n} kişi ` : 'birkaç kişi '}eve döndü, lordum. Kılıçları cephaneliğe, kendileri tarlaya, hikâyeleri meyhaneye.`,
      ])
    }
    case 'expedition': {
      if (c.action === 'recall')
        return any([
          'Atlı haberci kafilenin peşinden yola çıktı, lordum. Eli boş dönecekler ama sağ dönecekler; eli boş olmaları da taşımayı kolaylaştırır.',
          'Kafileyi geri çağırdınız, lordum. Erzak gitti ama adamlar gelecek; insan erzaktan değerlidir, çoğu zaman.',
          'Ulak dörtnala çıktı, lordum. "Dönün" diye bağıracak; umarım kafile "duyamadık" deyip yürümeye devam etmez. Ben gençken bunu çok yapardım.',
          'Sefer yarıda kaldı, lordum. Hikâyeleri kısa olacak, ganimetleri hiç olmayacak; abartıları ise her zamanki kadar uzun.',
          'Kafile geri dönüyor, lordum. Bazen en akıllıca yolculuk yarıda kesilendir; bunu dizlerim söylüyor, ben de katılıyorum.',
          'Geri çağırma emri yolda, lordum. Seferciler homurdanacak; homurdanan sefercinin sağ olduğu bellidir, bu iyi haber.',
        ])
      const name = EXPEDITION_TEXTS[c.kind as string]?.name
      const v = Number(c.villagers) || 0
      const guard = unitsOf(c.escort)
      return any([
        `${name ?? 'Kafile'} yola çıktı, lordum. Arkalarından su döktük; gerisi yolun, şansın ve haritayı kimin tuttuğunun elinde.`,
        'Kafile sarayın kapısından çıktı, lordum. Döndüklerinde anlatacak çok şeyleri olacak; umarım taşıyacak çok şeyleri de.',
        `${v ? `${v} köylü` : 'Köylüler'}${guard ? `, yanlarında ${guard} muhafız,` : ''} yola düştü, lordum. Azıkları sırtlarında, umutları gözlerinde, ayakkabıları da maalesef ayaklarında değil, birkaçının.`,
        `${name ?? 'Sefer'} başladı, lordum. Onlara bir harita verdim; bu sefer ters tutmadıklarından emin oldum. İki kez.`,
        `Kafile ufukta küçüldü, lordum. ${guard ? 'Muhafızlar önde, köylüler arkada; köylüler muhafızların kaçtığı yöne bakmayı öğrendi.' : 'Muhafızsız gittiler; yol uzun, dualarımız onlarla, ama dualar kılıç sallamaz.'}`,
        'Seferciler uğurlandı, lordum. Döndüklerinde "Sen yokken" raporuna bir sayfa daha eklenir; ben de dinlemeye hazırım, yalanları ayıklamaya da.',
      ])
    }
    case 'steward':
      return c.on
        ? any([
            'Kâhya göreve başladı, lordum. Siz yokken bir felaket gelirse köylüleri o toplar; ücretini de unutmaz, hiç unutmaz.',
            'Kâhya anahtarları beline taktı, lordum. Yangında, selde köylüleri o seferber edecek; her seferinde de kesesini uzatacak, alışkanlıkla.',
            'Artık bir kâhyamız var, lordum. Ciddi bir adam; güldüğünü hiç görmedim. Felaketlerde de gülmezse iyi olur.',
            'Kâhya işe başladı, lordum. Siz uyurken o nöbette; ben de uyurken, açıkçası. Birimizin uyanık olması yeter.',
            'Kâhyaya yetki verdiniz, lordum. Cevapsız kalan krizlerde köylüleri o toplar; hazinede altın kalsın ki işini yapabilsin. Bedavaya yangın söndürmüyor.',
            'Kâhya yeminini etti, lordum: "Ambarı korurum, ücretimi alırım." Ömrümde duyduğum en dürüst yemin; biraz da kıskandım.',
          ])
        : any([
            'Kâhyayı görevden aldınız, lordum. Artık felaketlerde karar yine sizin; ben de yine yanınızda, arka sırada.',
            'Kâhya anahtarları bıraktı, lordum. Bundan sonra krizleri siz karşılayacaksınız; ben de yanınızda olurum, güvenli bir mesafeden.',
            'Kâhya gitti, lordum. Ücreti hazinede kalacak; felaketler ise doğrudan bizim başımıza. Ucuz ama heyecanlı.',
            'Kâhyamız emekli oldu, lordum. Giderken bana "kolay gelsin" dedi; ne demek istediğini şimdi anlıyorum ve hiç hoşuma gitmedi.',
            'Kâhyalık kaldırıldı, lordum. Siz yokken gelen bir kriz cevapsız kalırsa olduğu gibi yaşanır; ben de olduğu gibi anlatırım.',
            'Kâhya eşyalarını topladı, lordum. Masasını bana bıraktı; çekmecesinde yarım bir elma ve bizim hakkımızda uzun bir liste vardı.',
          ])
    case 'swear':
      return any([
        'Biat ettiniz, lordum. Artık bir tacın lordusunuz: devriyeleri sizi kollar, rakip tacın haraççıları da kesenizi kollar.',
        'Diz çöktünüz, lordum, ama başınız dik. Tacın sancağı artık adınızın yanında; sezon boyunca değişmez, beğenmesek de.',
        'Biat yemini edildi, lordum. Tacın ulağı mühürlü belgeyi aldı; ben de mühür kuruyana kadar başında bekledim, kimse üflemesin diye.',
        'Artık bir tacın lordusunuz, lordum. Sarayın ikinci katına giden yol açıldı; rakip taç da tebrik yerine haraççılarını gönderecek, adetleri öyle.',
        'Tacınız sizi lordları arasına yazdı, lordum. Devriyeleri dost; rakip tacın haraççıları ise yarım saatte bir uğrayan, hiç gitmeyen misafir.',
        'Biat ettiniz, lordum. Halk yeni sancağı alkışlıyor; ozan da renklerine uyan bir kafiye arıyor. Kızıl zor, lacivert daha zor.',
      ])
    case 'repairWalls':
      return any([
        'Duvarcılar iskeleye çıktı, lordum. Yıkık surlar ayağa kalkıyor; ben kalkarken bu kadar ses çıkarmıyorum, o da bir şey.',
        'Harç karılıyor, taşlar yontuluyor, lordum. Düşmanın açtığı gedikler kapanacak; düşmanın ağzı da, umarım.',
        'Surlar onarılıyor, lordum. Ustabaşı "eskisinden sağlam olacak" dedi; ustabaşları hep böyle der, ama bu sefer yüzüme bakarak söyledi.',
        'Yıkık burçlara iskele kuruldu, lordum. Bir sonraki kuşatmada bu taşlar düşmana diş gösterecek; benim dişlerimden daha sağlam olduklarına eminim.',
        'Duvarcıların çekiçleri çalışıyor, lordum. Halk surların yükseldiğini görünce daha rahat uyuyacak; çekiçler yüzünden bu gece değil ama.',
        'Gedikler kapanıyor, lordum. Kapıdan başka yerden girmek isteyen artık kanat takmalı; takarsa da kulelerimiz var.',
      ])
    case 'repairTrade':
      return any([
        'Ticaret noktası onarıldı, lordum. Tüccarımız develerini yeniden yükledi; develer bu habere pek sevinmedi.',
        'Yanık tezgâhlar söküldü, yenileri çakıldı, lordum. Tüccar yeniden sefere çıkabilir; is kokusu kalan tek şey benim cübbem.',
        'Ticaret noktası ayağa kalktı, lordum. Deve bile sevindi; ilk kez yanımdan tükürmeden geçti. Belki de hedef şaşırdı.',
        'Onarım bitti, lordum. Haritada artık yanık bir enkaz değil, gıcır gıcır bir ticaret noktası var. Rakipler bunu görünce yüzleri yanacak, sıra onlarda.',
        'Tüccar yeni tentesinin altında el ovuşturuyor, lordum. Satış yeniden başlıyor; bir dahaki yağmacıya da indirim yapmamasını tembihledim.',
        'Ticaret noktasının dumanı tütmüyor artık, lordum. Yağmacılar bir daha gelirse bu kez yanına bir gözcü kulesi koyalım; tüccarın duası yetmiyor.',
      ])
    case 'releaseTown':
      return any([
        'Kasabayı serbest bıraktınız, lordum. Kasabalılar şaşkın ama memnun; hazinemiz de bakımdan kurtuldu. Herkes mutlu, vali hariç.',
        'Kasabanın anahtarlarını geri verdik, lordum. Ötekiler rahatladı; çok kasaba, çok baş ağrısıdır. Benim başım zaten ağrıyordu.',
        'Sancağımız kasabanın burcundan indirildi, lordum. Kasabalılar el salladı; vedalaşma mı sevinç mi, emin olamadım. Galiba ikincisi.',
        'Kasaba artık kimsenin değil, lordum. Küçük bir garnizon kendini korur; bize de daha az bakım, daha az isyan, daha az mektup.',
        'Bazen bırakmak da hükümdarlıktır, lordum. Aşırı büyüme yükü hafifledi; bu fikri size ben vermiştim, hatırlarsanız, hatırlamazsanız da.',
        'Kasabadan çekildik, lordum. Valinin kâtibi defterleri kapattı ve bana "şimdi ben ne yapacağım" diye sordu. Ona da bir iş buluruz; elçi yardımcılığı belki.',
      ])
    case 'quest':
      return c.action === 'claim'
        ? any([
            'Tacın ödülü geldi, lordum. Hükümdar işinizi beğenmiş; bir dahaki işi de size verecek. İyi iş yapmanın cezası budur.',
            'Ödül kesesi hazineye girdi, lordum. Tacın kâtibi adınızın yanına bir yıldız çizdi; gördüm. Benim adımın yanına da bir şey çizdi, ama yıldız değildi.',
            'Tacın ödülünü aldık, lordum. Altını sayarken tacın gülümsemesini de saydım; ikisi de fena değil, altın biraz daha ağır.',
            'Görevin karşılığı geldi, lordum. Taçla ilişkimiz biraz daha ısındı; kışın bu sıcaklık işe yarar, odun parası da düşer.',
            'Ulak keseyi uzatırken eğildi, lordum. Eskiden eğilmezdi; demek ki adınız sarayda konuşuluyor. Ya da beli tutuldu.',
            'Ödül alındı, lordum. Hükümdar "bu lord iş bilir" demiş; kulağıma öyle geldi, ben de biraz cilalayıp size getirdim.',
          ])
        : any([
            'Tacın işini üstlendiniz, lordum. Saat dolmadan bitirelim; taçlar beklemeyi sevmez, beklemeyi sevenler de taç olamaz.',
            'Görevi aldık, lordum. Tacın ulağı gözlerini kısıp "bakalım" dedi; gösterelim ona, gözlerini açsın.',
            'Söz verildi, lordum. Taç işini zamanında bitirene cömert davranır; geç kalana omuz silker, omuzları da çok geniştir.',
            'Tacın isteği defterimizde, lordum. Saatin kumu akıyor; ben şimdiden telaşlandım, siz telaşlanmayın, ikimize yeter.',
            'İşe giriştik, lordum. Görevler kutusunda ilerlemesini görürsünüz; ben de her yarım saatte bir hatırlatırım, sevmeseniz de.',
            'Tacın görevini üstlendiniz, lordum. Bitirirsek altın ve gönül; bitiremezsek yalnızca utanç, o da nasılsa benim payıma düşer.',
          ])
    case 'royal':
      return c.action === 'deliver'
        ? any([
            'Kraliyet elçisi istediklerini aldı, lordum. Arabalar saraya gidiyor; hükümdar sizi anacak, belki adınızı da doğru söyler.',
            'Teslimat tamam, lordum. Kraliyet elçisi sandıkları saydı, iki kez saydı ve sonunda gülümsedi. Meslektaşımdır, gülümsemesinin ne kadar zor çıktığını bilirim.',
            'Söz tutuldu, lordum. Tacın kâtibi "zamanında" yazdı; sarayda bu kelime çok nadir yazılır, mürekkebi bile şaşırdı.',
            'Mallar yola çıktı, karşılığı hazineye girdi, lordum. Asıl kazanç tacın gözünde; görünmez ama işe yarar, tıpkı benim gibi.',
            'Kraliyet elçisi atına binerken bana göz kırptı, lordum. Bir lütuf mu yoksa göz kayması mı, emin değilim; ben de karşılık olarak öksürdüm.',
            'İstek yerine getirildi, lordum. Hükümdar duyunca kadehini sizin için kaldıracak; ben de suyumu. Doktor öyle dedi.',
          ])
        : c.action === 'accept'
          ? any([
              'Kraliyet elçisine söz verdiniz, lordum. Sözünüzü tutarsanız taç bunu unutmaz; tutmazsanız hiç unutmaz.',
              'Söz verildi, lordum. Ambarı ve cephaneliği bir kollayalım; bir saat çabuk geçer, hele benim yaşımda.',
              'Kraliyet elçisi "elimden geleni yaparım" sözünüzü deftere yazdı, lordum. Şimdi elimizden gerçekten bir şey gelmeli; ben ellerimi hazırladım.',
              'İsteği üstlendiniz, lordum. Görevler kutusunda eldeki ve istenen yazıyor; ben de parmak hesabıyla takip ediyorum, on parmağı aşarsa haber veririm.',
              'Elçi memnun ayrıldı, lordum. Teslim edince taç piyasa değerinin üstünü öder; asıl kazanç yine de gönüldür, hazinedar buna inanmıyor.',
              'Söz bir kere ağızdan çıktı, lordum. Şimdi işçileri, atölyeleri ve biraz da şansı çalıştırma vakti; şans en tembelidir.',
            ])
          : any([
              'Kraliyet elçisini geri çevirdiniz, lordum. Kibarca söyledim, ama yüzü öyle asıldı ki kendimi kötü hissettim; az önce geçti.',
              'Elçi "anlaşıldı" dedi, lordum; ama öyle bir "anlaşıldı" ki ben üşüdüm. Pelerinimi aldım.',
              'Bu sefer olmaz dediniz, lordum. Taçla ilişkimiz biraz soğudu; bir sonraki isteği kaçırmayalım, yoksa buz tutar.',
              'Kraliyet elçisi eli boş döndü, lordum. Yolda başka bir lordun kapısını çalacak; o lord da bize dünyanın en kibar gülüşüyle bakacak.',
              'Geri çevirdik, lordum. Ben elçiye bir kadeh şerbet ikram ettim; acı kalmasın diye. Şerbet de acıydı ama, aşçıya söyleyeceğim.',
              'İstek reddedildi, lordum. Bazen hayır demek gerekir; yalnız çok sık olmasın, taçlar sayar, hem de benden iyi sayar.',
            ])
    case 'order':
      return any([
        'Kervan tacın başkentine yola çıktı, lordum. Döndüğünde keseler dolu olacak; dönmezse hikâyesi dolu olur.',
        'Develer yüklendi, lordum; tacın siparişi yolda. Ödeme kervan dönünce gelir; develer ise ödemesiz, her zamanki gibi homurdanarak gidiyor.',
        'Sipariş kervanı uğurlandı, lordum. Önde tüccar, arkada develer, en arkada benim dualarım; dualar biraz geride kaldı.',
        'Tacın istediği mallar yola düştü, lordum. Taç lobi fiyatının üstünü öder; tacın cebinden çıkan altının tadı başkadır.',
        'Kervan kapıdan çıktı, lordum. Yolda yağmacılara benim adımı söyleyecekler; pek işe yaramaz ama en azından şöhretim yayılır.',
        'Siparişi gönderdik, lordum. Tacın kâtibi defterine bir satır daha yazacak: "Bu lord sözünün eri." Altına küçükçe "elçisi de" yazdırmaya çalışacağım.',
      ])
    case 'tradeInn':
      return any([
        'Tüccar artık hana gidiyor, lordum. Hancı fiyatını söyledi; pazarlık ettim, o da kızdı, sonra bana çorba ikram etti. İyi pazarlık budur.',
        'Kervan hanın yolunu tuttu, lordum. Sefer pazar kadar kısa; fiyat ise hancının keyfine ve oradaki gücümüze bağlı. Hancının keyfi bugün yerinde, dişi ağrımıyor.',
        'Han kapısı tüccarımıza açıldı, lordum. Oradaki payımız büyüdükçe hancı bize daha cömert davranır; küçüldükçe kapıyı yüzümüze çarpar.',
        'Tüccar hana yerleşti, lordum. Yalnız dikkat: çok satarsak hancının o mala verdiği fiyat düşer. Hancılar da tüccarlar kadar kurnazdır; benden az ama.',
        'Hancıyla el sıkıştık, lordum. O yöredeki kasabalarımız elimizde kaldıkça kapısı bize açık; kaybedersek, hancı bizi hiç tanımamış olur.',
        'Tüccarımız handa, lordum. Lobi pazarına dokunmadan satıyoruz; fiyatları biz düşürmüyoruz, yalnız hanınkini. Hancı henüz fark etmedi.',
      ])
    case 'tradeCity':
      return c.city === null || c.city === undefined
        ? any([
            'Tüccar yeniden lobi pazarına dönüyor, lordum. Kısa yol, hızlı sefer, az hikâye.',
            'Başkent yolu kapandı, lordum; tüccar yakın pazara dönüyor. Develer sevindi; sevinçten bir tanesi tükürmeyi bile unuttu.',
            'Tüccar eski pazarına döndü, lordum. "Uzak yol yorar" dedi; dizlerim de bu fikre canı gönülden katılıyor.',
            'Lobi pazarı yine bizim, lordum. Seferler kısalır, ama fiyatları da biz düşürürüz; kendi ayağımıza basmayalım.',
            'Tüccar yönünü değiştirdi, lordum. Pazarda tanıdık yüzler onu bekliyor; bir de tanıdık, kötü fiyatlar.',
            'Yakın pazara dönüldü, lordum. İki dakika yeniden değiştiremeyiz; deve kafa karışıklığını sevmez, bir kere ters yöne yürüdü, ikna etmesi saatler sürdü.',
          ])
        : any([
            'Tüccarımız taç başkentinin yoluna çıktı, lordum. Uzun yol, iyi kazanç derler; diyenler genelde yolu yürümeyenlerdir.',
            'Tüccar taç başkentine gidiyor, lordum: iki kat yük, uzun yol. Develer itiraz etti, ben bastırdım; bir tanesi hâlâ bana küs.',
            'Başkentin kapıları tüccarımıza açık, lordum. Sefer uzun ama fiyatı daha az düşürür; tüccar da başkentte biraz gezer, ona söylemeyin.',
            'Tüccar kervanını başkente çevirdi, lordum. Döndüğünde hem kese hem tacın gözü dolu olacak; bir de tüccarın ağzı, dedikoduyla.',
            'Uzun yol başladı, lordum. Tüccar yanına fazladan azık aldı; bir de benden, başkentteki eski dostuma bir mektup. Bana borcu var, unutmuş olabilir.',
            'Tüccar artık başkent yolunda, lordum. Satış yapılan her sefer o taçla ilişkimizi de ısıtır; deve sırtında diplomasi, en sevdiğim tür.',
          ])
    case 'house':
      if (c.action === 'gift')
        return any([
          'Hediye yerine ulaştı, lordum. Kardeşiniz size biraz daha sıcak bakıyor; şimdilik. Kesenin dibi görününce bakışı da soğur.',
          'Kese teslim edildi, lordum. Alan gülümsedi; gülümsemesinin ne kadar süreceğini zaman gösterir, bence en çok akşam yemeğine kadar.',
          'Hediye gitti, lordum. Hanedanda bir altın kesesi bir kılıçtan çok kapı açar; daha az ses de çıkarır.',
          'Hediyeyi aldı, lordum, ve "lordumuz cömert" dedi. Ben de bunu sarayda herkese duyurdum, biraz yüksek sesle, kraliçenin kedisi bile duydu.',
          'Gönül alındı, lordum. Akraba gönlü cam gibidir; arada bir parlatmak gerekir, çok parlatırsanız da kırılır.',
          'Hediye yerini buldu, lordum. Sofrada artık size bakarak gülümsüyor; eskiden size bakarak bıçağını biliyordu. Gelişme var.',
        ])
      if (c.action === 'role')
        return c.role === null || c.role === undefined
          ? any([
              'Görevden aldınız, lordum. Anlayışla karşıladı; yani yüzü bembeyaz oldu, sustu ve bir süre bana bakmadı. Ben ne yaptım ki?',
              'Görev elinden alındı, lordum. Bu kolay unutulmaz; bir süre ona hediyeyle yaklaşmak gerekebilir, arkadan değil önden.',
              'Mührü geri aldık, lordum. Kapıyı biraz sert kapattı ama menteşeler dayandı; marangoza teşekkür ettim.',
              'Görev boşaldı, lordum. Hanedandan biri gücendi; gücenik akraba, gözü dışarıda olan akrabadır. Gözü taçta olursa haber veririm.',
              'Görevden alındı, lordum. Bana "ben ne yaptım" diye sordu; cevap vermedim, elçiler her şeyi bilir ama her şeyi söylemez.',
              'Bir görev eksildi, lordum. Hesap tutan kâtip memnun; hanedan ise pek değil. Kâtip zaten kimseyi sevmez.',
            ])
          : any([
              'Görev verildi, lordum. Hanedandan birinin elinde iş, aklında daha az kötü fikir demektir.',
              'Mühür teslim edildi, lordum. Yeni görevli göğsünü öyle kabarttı ki düğmeleri zor dayanıyor; terziyi hazırda tutuyorum.',
              'Hanedandan birine görev verdiniz, lordum. Görev verilen sevinir, sevinen akraba sadık kalır, sadık akraba da az yemek yer. Bu sonuncusunu uydurdum.',
              `${c.role === 'governor' ? 'Yeni vali kasabaya yola çıktı' : c.role === 'commander' ? 'Devriyenin yeni komutanı atını eğerletti' : c.role === 'treasurer' ? 'Yeni hazinedar defterleri açtı' : 'Yeni görevli işe başladı'}, lordum. İnşallah işini sizin kadar iyi bilir; benim kadar konuşmasın yeter.`,
              'Görev dağıtıldı, lordum. Saray artık daha düzenli; ben de daha az koşturuyorum, dizlerim size şükranlarını sunar.',
              'Bir akrabanız artık hanedanın işini görüyor, lordum. İşsiz prens tehlikelidir, meşgul prens yararlı; yorgun prens en iyisidir.',
            ])
      if (c.action === 'marry') {
        const to = (c.to as { kind?: string } | undefined)?.kind
        return to === 'lord'
          ? any([
              'Evlilik teklifimiz yola çıktı, lordum. Elçi en güzel cübbesini giydi; aslında benim cübbem, iade edeceğine söz verdi.',
              'Talip olduk, lordum. Teklif mühürlendi ve dörtnala yolda; karşı saray düşünecek, umarım çok uzun düşünmez.',
              'Prensesin portresi elçinin heybesinde, lordum. Ressam biraz cömert davranmış ama yalan da sayılmaz; ışık iyi düşmüş, diyelim.',
              'Teklif gönderildi, lordum. Kabul ederlerse iki hanedan akraba olur, ilişki de ısınır; bayram sofraları da kalabalıklaşır, ona hazırlıklı olun.',
              'Evlilik elçisi uğurlandı, lordum. Yanında bir kese hediye, dilinde de benim öğrettiğim üç iltifat. Dördüncüsünü öğretmedim, fazla iddialıydı.',
              'Karşı saraya teklif gidiyor, lordum. Ben şimdiden düğün konuşmamı yazmaya başladım; kısa olacak, söz. Yedi sayfa.',
            ])
          : any([
              'Düğün hazırlıkları başladı, lordum! Çeyiz sandıkları yükleniyor, çalgıcılar akort yapıyor; akort yapanlar her zaman çalanlardan daha uzun sürer.',
              'Prenses gelinlik giydi, lordum. Saray kadınları ağlıyor, ben de; yaşlandım, gözlerim terliyor.',
              'Çeyiz yola çıktı, lordum. Arabalar dolu, gönüller dolu, hazine biraz boş. Hazinedar arabaların arkasından el salladı, gelinin değil, altının arkasından.',
              'Düğün çanları çalıyor, lordum! Prensesimiz yeni evine gidiyor; arkasından su döktük. Ben fazla döktüm, aşçı kızdı.',
              'Prenses evlendirildi, lordum. Hanedanınızın bağları artık daha geniş; düşmanlarınızın işi daha zor, düğün davetiyelerinin işi daha kolay.',
              'Gelin alayı uğurlandı, lordum. Zurna, davul, bir de benim veda konuşmam; konuşma biraz uzun sürdü, alay iki kez mola verdi.',
            ])
      }
      if (c.action === 'wedQueen')
        return any([
          'Kraliçemiz evlendi, lordum! Soylu bir bey tahta çıktı; hanedan yeniden bir hükümdara kavuştu. Ben de yeniden birine "lordum" diyebiliyorum, alışkanlık işte.',
          'Düğün davulları çaldı, lordum. Kraliçe artık yalnız değil, taht da boş değil; benim de işim var, şükür.',
          'Konseyle oturup en uygun beyi seçtik, lordum. Kraliçe razı oldu; ben de mendilimi çıkardım. Konsey üyeleri de; meğer hepsi duygusalmış.',
          'Yeni hükümdarımız taç giydi, lordum. Kraliçenin yanında yakışıyor; halk şimdiden çocuk bekliyor, sabırsız insanlar.',
          'Evlilik sözleşmesi mühürlendi, lordum. Hanedanın sürmesi için daha iyi bir haber olamazdı; ben de emekliliğimi bir sezon daha erteledim.',
          'Saray bayram yerine döndü, lordum. Yalnız hüküm süren kraliçenin günleri bitti; konseyin de, ki onlar biraz üzüldü.',
        ])
      if (c.action === 'aid')
        return c.kind === 'troops'
          ? any([
              'Taca asker yardımı için ulak gönderdik, lordum. Taç kabul ederse askerleri karargâha baskın yapar; etmezse bize nazik bir mektup yollar.',
              'Tacınızdan asker istediniz, lordum. Taçlar yardım eder, ama karşılığında biraz gönül alır, biraz da gurur.',
              'Ulak başkente koşuyor, lordum. Kardeşinizin karargâhına bir de tacın kılıcı insin, dua edelim; kılıç yanlış yere inmesin.',
              'Asker yardımı istendi, lordum. Tacımız sizi seviyorsa gelir; sevmiyorsa... onu da öğrenmiş oluruz, en pahalı yoldan.',
              'Yardım isteği yolda, lordum. Taçtan asker istemek gurur kırar; ama tahtı kaybetmek daha çok kırar, bir de koltuğu.',
              'Taca "yardım" dedik, lordum. Cevabı elçi getirecek; ben de bu arada surları bir dolaşayım, kardeşiniz el sallarsa geri sallamam.',
            ])
          : any([
              'Taca altın yardımı için ulak gönderdik, lordum. Gelirse isyana karşı hazineye girer; gelmezse hazinedarın gözyaşları girer.',
              'Tacınızdan altın istediniz, lordum. Kese gelirse kardeşinize karşı asker yetiştiririz; kardeşiniz de bunu duyunca biraz düşünür.',
              'Ulak başkente koşuyor, lordum. Hükümdar kesesini açar mı, birazdan öğreniriz; hükümdarların keseleri sıkı düğümlenir.',
              'Altın yardımı istendi, lordum. Taç verirse ilişkimizden biraz eksilir; ama taht yerinde kalır, siz de üstünde.',
              'Yardım isteği yolda, lordum. Hazinedar şimdiden kasanın kapağını açık bıraktı; umutlu bir adam, ilk kez.',
              'Taca altın için yazdık, lordum. Mektubu ben yazdım; en dokunaklı cümlelerimi kullandım. Okurken kâtip ağladı, umarım hükümdar da ağlar, kesesiyle birlikte.',
            ])
      return null
    case 'nameChild':
      return any([
        `Çocuğun adı ${c.name} oldu, lordum. Kâtip hanedan defterine yazdı; mürekkebi altın tozlu. Altın tozunun parasını sormayın.`,
        `${c.name}! Güzel bir ad, lordum. Ozan şimdiden bu adla kafiye arıyor; bulamazsa uyduracak, hep öyle yapar.`,
        `Saray ${c.name} adını fısıldıyor, lordum. Bir gün belki bütün diyar haykırır; şimdilik dadı haykırıyor, bez değişirken.`,
        `${c.name} adı konuldu, lordum. Bir daha değişmez; ben de unutmam, söz. Unutursam kâtibe sorarım.`,
        `Çocuğa ${c.name} dediniz, lordum. Dadı tekrar etti, aşçı tekrar etti, ben üç kez tekrar ettim; bebek bıktı, uyudu.`,
        `${c.name} artık hanedanın bir adı, lordum. Bebek ağladı; sanırım beğendi. Ya da acıkmıştı, ikisi bu yaşta pek ayırt edilmez.`,
      ])
    case 'educate': {
      const what = c.focus === 'finance' ? 'maliye' : c.focus === 'people' ? 'halk işleri' : 'askerlik'
      return any([
        `Çocuğa ${what} hocası tutuldu, lordum. Reşit olunca bu yeteneği daha güçlü olacak; hocanın sabrı ise çoktan zayıfladı.`,
        `Eğitim seçildi: ${what}, lordum. Hoca ilk derse geldi; öğrenci uyuyordu. Hoca da yanına oturup uyudu. Bence iyi bir başlangıç.`,
        `${what === 'askerlik' ? 'Tahta kılıçlar' : what === 'maliye' ? 'Abaküs ve defterler' : 'Halkın masalları'} çocuğun odasına taşındı, lordum. ${what === 'askerlik' ? 'İlk kurban benim baldırım oldu.' : 'Gelecek böyle yetişir, odada biraz dağınıklıkla.'}`,
        `Çocuk ${what} öğrenecek, lordum. Ben de ara sıra uğrayıp diplomasi öğretirim; bedavaya. Yani neredeyse bedavaya.`,
        `${what.charAt(0).toLocaleUpperCase('tr')}${what.slice(1)} eğitimi başladı, lordum. Hoca çok sert; ben de çocukken böyle bir hocadan korkardım. Hâlâ korkuyorum, aynı hoca.`,
        `Eğitim kararı verildi, lordum: ${what}. On altı yaşında farkı görürsünüz; o yaşa kadar da her akşam hocanın şikâyetlerini dinlersiniz.`,
      ])
    }
    case 'ships': {
      const ship = SHIP_WORDS[c.ship as string] ?? 'gemi'
      const n = Number(c.count) || 1
      return any([
        'Tersanede yeni bir omurga kızağa kondu, lordum. Marangozların çekici gece gündüz susmayacak; benim baş ağrım da.',
        `${n} ${ship} için kızaklar hazırlandı, lordum. Zift kokusu saraya kadar geliyor; kraliçenin kedisi bundan hiç hoşlanmadı.`,
        `Tersane ustaları ${ship} kaburgalarını dikiyor, lordum. Suya inince size haber veririm; şişeyi bu sefer ben kırmam, geçen sefer kaptanın kafasına denk gelmişti.`,
        `${n > 1 ? `${n} ${ship}` : `Bir ${ship}`} yapılıyor, lordum. Tayfası asker havuzundan gelecek; denizciler köylü sayılmaz, köylüler de denizci sayılmak istemez.`,
        `Kereste tersaneye taşındı, lordum. Bir ${ship} doğuyor; adını tayfaya bırakmayın, geçen sefer "Elçinin Sesi" koydular ve bunun bir iltifat olmadığını sonra öğrendim.`,
        `Kızaktan çekiç sesleri geliyor, lordum. ${ship.charAt(0).toLocaleUpperCase('tr')}${ship.slice(1)} pahalıdır ama sular bizim olacak. Ben yine de karada kalacağım; deniz beni sevmiyor.`,
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
          'Yıkım ekibi işe başladı, lordum. Taşların yarısı ambara döner, öbür yarısı toz olup benim cübbeme yerleşir.',
          'Balyozlar kalktı, lordum. Bir yapı gider, bir boşluk kalır; boşluk da bir fırsattır, en azından fareler için.',
          'Yıkıldı, lordum. Ustabaşı içini çekti; kendi elleriyle yaptığı bir şeydi galiba. Ona yeni bir şey yaptırın, avunur.',
          'Enkaz kaldırılıyor, lordum. Harcananın yarısı ambara geri dönüyor, kalanı tarihe. Tarih de iade etmiyor.',
          'Yıkım emri yerine geldi, lordum. Toz bulutu dağılınca yerine ne koyacağımızı konuşuruz; ben bir heykel öneriyorum, kimin heykeli olduğu sonra konuşulur.',
          'Bir yapı eksildi, lordum. Bazen bir şehri güzelleştiren eklediğiniz değil, kaldırdığınızdır. Bunu bir mimara söyledim, bana küstü.',
        ])
      if (moves && !builds.length)
        return any([
          'Taşıma başladı, lordum. Yapı söküldü, taşlar numaralandı; umarım aynı sırayla dizerler. Yedinci taşı ararken buldum, cebimdeydi.',
          'Ustalar yapıyı yeni yerine taşıyor, lordum. Seviyesi ve işçileri korunur; yalnızca adresi değişir, mektupları ben yönlendiririm.',
          'Bir yapı yer değiştiriyor, lordum. Köylüler şaşkın: "dün buradaydı" diyorlar. Bir tanesi büyü yapıldığına inanıyor; düzeltmedim, eğlenceli.',
          'Taşıma emri ustalarda, lordum. Taşınırken yapı üretmez; işçiler de bunu fırsat bilip taşların üstünde uyuyor.',
          'Yapı yeni yerine yürüyor, lordum, taş taş. Şehir planınız artık daha düzenli; bu fikri ben vermiştim, hatırlarsınız belki.',
          'Arabalara kirişler yüklendi, lordum. Mimar "bu yer daha iyi" dedi; mimarlar her yer için öyle der, eski yer için de demişti.',
        ])
      return any([
        `Plan onaylandı, lordum: ${builds.length > 1 ? `${builds.length} yapı` : one ?? 'yeni yapı'} için temeller kazılıyor. Ustalar iskeleye çıktı; biri yanlış iskeleye çıktı, indirdik.`,
        `${one ? `Yeni ${one}` : 'Yeni yapılar'} için taşlar taşınıyor, lordum. Çekiç sesi lordluğun en güzel şarkısıdır; benim şarkı söylememden kesinlikle daha güzel.`,
        `Mimar planı ustalara dağıttı, lordum. ${builds.length > 2 ? 'Bu kadar işi aynı anda görünce biri bayıldı; ayıltıp işe koyduk, ikinci kez bayılmasın diye planı göstermiyoruz.' : 'Biri ters tuttu, düzelttim; aslında ben de ters tutuyordum, ama o bilmiyor.'}`,
        `İnşaat başladı, lordum. ${one ? `${one.charAt(0).toLocaleUpperCase('tr')}${one.slice(1)} yükseldikçe` : 'Yapılar yükseldikçe'} hudut dolacak, haritanız güzelleşecek; komşular da kıskançlıktan çatlayacak.`,
        'Plan yürürlükte, lordum. İnşaat yeri doluysa sıradakiler yer boşalınca başlar; ustalar sıra beklemeyi bilir, beklerken yemek yemeyi de.',
        `Temel taşları atıldı, lordum. ${moves || razes ? 'Taşınan ve yıkılanlar da hallediliyor; ' : ''}Bir lordluk böyle büyür: taş üstüne taş, şikâyet üstüne şikâyet.`,
      ])
    }
    case 'build':
    case 'buildMany': {
      // The palace is placed for free in an instant (the tutorial cheers it); roads and walls are small chores.
      if (c.kind === 'road' || c.kind === 'wall' || c.kind === 'gate' || c.kind === 'palace') return null
      const name = lower(BUILDING_NAMES[c.kind as keyof typeof BUILDING_NAMES] ?? 'yapı')
      return any([
        `Yeni ${name} için temel kazılıyor, lordum. Kazıcılar eski bir kemik buldu; tavuk kemiğiymiş, heyecanlanmayın.`,
        `Ustalar ${name} iskelesine çıktı, lordum. Çekiç sesleri başladı; benim öğle uykum bitti.`,
        `Bir ${name} daha yükseliyor, lordum. Halk merakla seyrediyor; çalışan bir kişiye seyreden on kişi, her şantiyenin kuralıdır.`,
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} inşaatı başladı, lordum. Ustabaşı "çabuk biter" dedi; ustabaşları bunu annelerinin karnında bile söyler.`,
        `Taşlar ve kirişler ${name} için taşınıyor, lordum. Bir kiriş benim ayağıma düştü; inşaat güvenliği bundan sonra benim sorumluluğumda.`,
        `Bir ${name} kuruluyor, lordum. Lordluğumuz bir yapı daha büyüyor; ben de bir yapı daha anlatacak şey buluyorum.`,
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} için yer seçimini çok beğendim, lordum. Aynısını ben de düşünmüştüm, söylemeye fırsat bulamadan siz söylediniz.`,
      ])
    }
    case 'upgrade': {
      const b = k?.buildings.find((x) => x.id === c.id)
      if (!b || b.kind === 'road' || b.kind === 'wall' || b.kind === 'gate') return null
      const name = lower(BUILDING_NAMES[b.kind] ?? 'yapı')
      const level = b.level ?? 1
      if (b.kind === 'palace')
        return any([
          `Saray ${level}. seviyeye yükseliyor, lordum! Mimarlar iskelede, hazinedar baygın, ben heyecanlı. Hazinedarı ayıltmayalım, faturayı görmesin.`,
          'Sarayın yeni katı için ilk taş kondu, lordum. Bittiğinde hudut genişler, yeni yapılar açılır; benim odama da bir pencere, umuyorum.',
          `Saray yükseltmesi başladı, lordum. ${level}. seviye! Ozanlar şimdiden şarkısını yazıyor; kafiyesi "seviye" ile "hediye", hediyeyi kime bilmiyorum.`,
          'Ustalar saraya tırmandı, lordum. Yükseltme sürerken saray eski hâliyle hizmet verir; ben de eski odamda beklerim, tavandan toz yağarken.',
          `Sarayın ${level}. katı yolda, lordum. Komşular kulelerinden bakıp kıskançlıktan sararacak; birine dürbün hediye edelim, iyi görsün.`,
          'Saray büyüyor, lordum. Bitince ilk iş kuzey kulesindeki odama bir pencere daha açtırmak; izninizle, iznim olmasa da.',
        ])
      return any([
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} ${level}. seviyeye yükseliyor, lordum. Bitince daha çok iş görecek; işçiler bu habere pek sevinmedi.`,
        `Ustalar ${name} için iskele kurdu, lordum. Yükseltme sürerken üretmez ama sonra fazlasıyla öder; ustalar da öyle söylüyor, ücretlerini isterken.`,
        `${level}. seviye ${name}, lordum! Ustabaşı "eskisinin iki katı" dedi; ben biraz abartıyor diye düşünüyorum, abartıyı iyi bilirim.`,
        `Bir ${name} yükseltiliyor, lordum. Daha büyük, daha güzel, daha pahalı; dünyanın düzeni böyle, benim maaşım hariç.`,
        `${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} yenileniyor, lordum. İşçiler bu fırsatla biraz dinleniyor; görmezden geldim, karşılığında bana da yer açtılar.`,
        `Yükseltme başladı, lordum. ${name.charAt(0).toLocaleUpperCase('tr')}${name.slice(1)} bitince haritada yeni hâlini görürsünüz; eski hâlini özleyen olursa o benim.`,
      ])
    }
    case 'upgradeTrade':
      return any([
        'Ticaret noktası büyüyor, lordum. Tüccar artık seferde daha çok yük götürecek; develer bunu henüz bilmiyor, söylemeyin.',
        'Ticaret noktasına yeni bir kat, lordum. Develer de bunu duydu; yükleri ağırlaşacak, morali bozuldu, sendika konuşuluyor.',
        'Tüccarımız yeni tezgâhını çok beğendi, lordum. Seferde daha çok mal, daha çok altın; daha çok övünme de, maalesef.',
        'Ticaret noktası yükseltildi, lordum. Rakipler de görüyor, haritada seviyesi yazıyor; biraz hava atmanın kimseye zararı olmaz.',
        'Yeni depolar, yeni tenteler, lordum. Tüccar el ovuşturuyor; ben de öyle, ama benimki soğuktan.',
        'Ticaret büyüyor, lordum. Yalnız ambarda satacak mal olsun; boş tezgâh dolu tezgâhtan çirkindir, tüccarın yüzü de.',
      ])
    case 'tradeGood':
      return c.good === null || c.good === undefined || c.good === 'none'
        ? any([
            'Tüccar evde kalacak, lordum. Develeri ahıra çekti, kendisini de taburesine; ikisi de aynı sesle iç çekti.',
            'Satış durdu, lordum. Mallar ambarda kalır, hazine bekler, fareler sevinir.',
            '"Hiçbir şey satma" dediniz, lordum. Tüccar ilk kez bu kadar az iş için bu kadar çok sevindi; maaşının devam ettiğini öğrenince daha da sevindi.',
            'Tüccar dinlenmeye çekildi, lordum. Ambar sınırına dikkat; sığmayan mal boşa gider, boşa giden malı da fareler sahiplenir.',
            'Ticaret beklemede, lordum. Fiyatlar toparlanınca yeniden başlarız, değil mi? Tüccar "değil mi" sorusundan hoşlanmıyor.',
            'Tüccar boşta, lordum. Devesi bana bakıyor; sanırım bana da "sen ne iş yapıyorsun" diyor. Cevap veremedim.',
          ])
        : any([
            `Tüccar artık ${goodOf(c.good)} satacak, lordum. Çuvallar yükleniyor; develer şimdiden şikâyetçi, ne yüklesek şikâyetçiler zaten.`,
            `Develere ${goodOf(c.good)} yüklendi, lordum. Fazla olanı satmak akıllı lordun işidir; az olanı satmak benim kuzenimin işiydi, o yüzden fakir öldü.`,
            `Satılacak mal: ${goodOf(c.good)}, lordum. Tüccar başını salladı; ne verseniz satar, bana da annemi satmayı teklif etmişti bir kere.`,
            `Tüccar ${goodOf(c.good)} ile yola çıkıyor, lordum. Yalnız çok satılan malın fiyatı düşer; pazara göz kulak olalım, tüccara da.`,
            `${goodOf(c.good).charAt(0).toLocaleUpperCase('tr')}${goodOf(c.good).slice(1)} satışa çıktı, lordum. Ambar biraz hafifler, kese biraz ağırlaşır; fareler bu karardan memnun değil.`,
            `Karar verildi, lordum: ${goodOf(c.good)}. Tüccar bu sefer çuvalları iki kez saydı; benden öğrendi. Ben üç kez sayarım ama her seferinde farklı çıkar.`,
          ])
    case 'tradeAmount':
      return any([
        `Tüccar artık seferde ${c.units} birim götürecek, lordum. Develere sordum; cevap vermediler ama yüzlerinden belliydi.`,
        `Sefer başına yük ${c.units} birim oldu, lordum. Develer hesabı yaptı; memnun değiller ama itaatkârlar. Benim gibi.`,
        `Yük ayarlandı, lordum: ${c.units} birim. İki dakika yeniden değiştiremeyiz; deveye de karar vermesi için vakit tanıyalım.`,
        `${c.units} birimlik yük, lordum. Ne çok ne az; orta karar, tıpkı benim maaşım gibi. Ondan da söz etmişken…`,
        `Tüccar yeni yük ölçüsünü öğrendi, lordum: ${c.units} birim. Çuvalları yeniden bağlıyor; iki düğüm bana düştü, parmaklarım düğüm oldu.`,
        `Seferde ${c.units} birim satılacak, lordum. Ambarın hâline arada bir bakalım; ben bakarım, fareleri de sayarım.`,
      ])
    case 'product': {
      const name = PRODUCT_NAMES[c.product as string]
      if (!name) return null
      const p = lower(name)
      return any([
        `Artık ${p} üretilecek, lordum. İşçiler aletlerini değiştirdi; biri yanlış aleti aldı, şimdi ${p} için kepçe kullanıyor.`,
        `${name}, lordum! Ustalar başını salladı; değişiklikten hoşlanmazlar ama itiraz da etmezler, sadece arkadan söylenirler.`,
        `Ürün değişti: ${p}, lordum. Bir sonraki turda farkı görürsünüz; işçilerin homurtusunu ise hemen duyarsınız.`,
        `İşçilere ${p} dediniz, lordum. Biri "dün başka diyordunuz" dedi; ona hükümdarların fikir değiştirebileceğini hatırlattım. Elçilerin de.`,
        `${name} için hazırlıklar yapıldı, lordum. Ambarda ya da cephanelikte yer olsun; yoksa üretilen her şey koridorda bana çarpıyor.`,
        `Yeni iş: ${p}, lordum. Atölyenin bacasından çıkan duman bile rengini değiştirdi sanki. Belki de ben yanlış bacaya bakıyorum.`,
      ])
    }
    case 'buy':
      return any([
        `Pazardan ${c.units} ${goodOf(c.good)} alındı, lordum. Arabalar ambara yol aldı; fareler kapıda karşılama töreni hazırlıyor.`,
        `${c.units} ${goodOf(c.good)} için kese açıldı, lordum. Pazarcı gülümsedi; pazarcılar hep gülümser, altını görünce. Altın gidince gülümseme de gider.`,
        `Alışveriş tamam, lordum: ${c.units} ${goodOf(c.good)}. Fiyat biraz yükseldi; aldıkça pahalanır. Pazarcı bunu bize anlatırken bir hayli keyifliydi.`,
        `Ambara ${c.units} ${goodOf(c.good)} girdi, lordum. Hazinedar bir köşede sessizce ağlıyor; sessiz olmasına sevindim, önceki sefer çok sesliydi.`,
        `Pazardan ${goodOf(c.good)} geldi, lordum. Eksik kapandı; bekleyen inşaat da şimdi başlayabilir, ustabaşının bahanesi kalmadı.`,
        `Pazarcı ${c.units} ${goodOf(c.good)} tarttı, lordum. Ben de terazinin başında durdum, eksik tartmasın diye. Bir kez parmağını terazide yakaladım; utanmadı bile.`,
      ])
    case 'townBuy':
      return any([
        `Askerler kasaba pazarından ${c.units} birim mal yüklendi, lordum. Saraya varınca ambara girer; yolda kimse bir çuval aşırmazsa.`,
        `Kasabadan alışveriş yapıldı, lordum: ${c.units} birim. Askerler hem asker hem hamal oldu; ikisine de maaş veriyoruz zaten, birine fazladan.`,
        `${c.units} birim mal orduya yüklendi, lordum. Yolda bir çarpışmaya girmesinler; yenilen ordu yükünü kaybeder, onurunu da.`,
        `Kasaba pazarcısı ordunun önünde fiyat indirmedi, lordum; cesur adam, ya da çok açgözlü. ${c.units} birim yüklendi.`,
        `Ordu yüklü, lordum: ${c.units} birim. Eve dönünce ambar dolacak, askerlerin sırtı ağrıyacak; ağrıyan sırtları bana şikâyet edecekler, biliyorum.`,
        'Kasabadan mal aldık, lordum. Askerler çuvalları kalkan gibi taşıyor; düşman görse güler, gülerken de onu yakalarız. Strateji.',
      ])
    case 'townUpkeep': {
      const w = UPKEEP_WORDS[Number(c.level)] ?? 'yeni'
      return Number(c.level) === 0
        ? any([
            'Kasabanın bakımı kesildi, lordum. Hazine rahatlar, kasabanın sadakati düşer; ikisi aynı terazide, biri iner öbürü çıkar.',
            'Kasabaya artık bir şey gitmeyecek, lordum. Kasabalılar bunu fark eder; sadakat de fark eder, hem de çabucak.',
            'Bakım yok, lordum. Kasabanın valisi mektup yazdı; ağzı epey bozuk bir mektup. İmlası da bozuktu, onu da düzelttim, geri gönderdim.',
            'Kasabanın kesesi kapandı, lordum. Sadakat ayaklanma çizgisine yaklaşırsa haber veririm; meşaleleri görünce zaten anlarsınız.',
            'Bakım durdu, lordum. Bedava sadakat yoktur; ama hazineniz bunu bir süre kaldırabilir, kasabalılar kaldıramayabilir.',
            'Kasaba kendi başının çaresine bakacak, lordum. Bakalım bize ne kadar bağlı kalacak; ben bahse girmem, girersem de karşı tarafa girerim.',
          ])
        : any([
            `Kasabanın bakımı ${w} oldu, lordum. Sadakat ona göre kayacak; kasabalılar parayı koklamayı iyi bilir.`,
            `${w.charAt(0).toLocaleUpperCase('tr')}${w.slice(1)} bakım, lordum. Kasabalılar keselerinin ağırlığını hissedecek; vali de, her zamanki gibi önce kendisi.`,
            `Kasaba için ${w} bakım ayrıldı, lordum. Sadakat birkaç turda hedefine doğru kayar; sadakat altına uzanan bir kediye benzer, yavaş ama emin.`,
            `Bakım ayarlandı: ${w}, lordum. Valinin yüzü ${Number(c.level) >= 3 ? 'güldü; hem de öyle güldü ki iki dişi eksik, gördüm' : 'biraz güldü; tam gülmesi için daha fazlası lazım, söyledi'}.`,
            `Kasabaya ${w} bakım gidecek, lordum. Hazine her tur öder; hazinede yoksa o tur bakım yokmuş sayılır, kasabalılar da bunu kişisel algılar.`,
            `Kasabanın kesesi ${w} doldurulacak, lordum. Sadık kasaba daha çok katkı demektir; sadık elçi de, unutmayın.`,
          ])
    }
    // ---- Armies ----
    case 'raise': {
      const n = unitsOf(c.units)
      return any([
        `${n ? `${n} askerlik ` : ''}bir ordu garnizondan çıktı, lordum. Sancak açıldı, davullar çalıyor; davulcu biraz geç kaldı, kahvaltıdaymış.`,
        'Ordu kapının önünde saf tuttu, lordum. Emirlerinizi bekliyorlar; hudut dışına çıkınca emirler elçiyle gider. Yani benimle, yani dizlerimle.',
        'Yeni bir ordu, lordum! Askerler kılıçlarını parlattı; kılıçta kendi yüzlerini görünce biraz şaşırdılar, sonra saçlarını düzelttiler.',
        `${n ? `${n} asker ` : 'Askerler '}sarayın önünde toplandı, lordum. Haritada sancağınızla görünecekler; herkes görecek, rakipler de, kayınpederiniz de.`,
        'Ordu kuruldu, lordum. Sahada en çok iki ordumuz olur; bu onlardan biri, iyi kullanalım. Öbürünü kıskandırmayalım.',
        'Garnizon boşaldı, sancak doldu, lordum. Nereye gitsinler? Benim önerim bir han, ama askerler başka şey önerir.',
      ])
    }
    case 'king':
      return c.action === 'lead'
        ? any([
            'Hükümdar ordusunun başına geçti, lordum! Emirler artık elçisiz, hemen gider. Yani ben işsizim; bunu biraz kişisel algıladım.',
            'Kral atına bindi, taçlı sancak açıldı, lordum. Askerler bir anda bir karış uzadı; at da, sanırım.',
            'Ordu kralını buldu, lordum. Zarlar onun savaş yeteneğiyle atılacak; dikkat, kral da düşebilir, attan da, savaşta da.',
            'Kraliyet sancağı ordunun önünde, lordum. Haritada herkes görecek; düşman da. Altın sancağı uzaktan görmemek zor, saklambaç için kötü bir seçim.',
            'Hükümdar komutada, lordum. Ben elçi olarak işsiz kaldım; bu emirler artık bana uğramıyor. Bahçeyle uğraşırım, belki.',
            'Kral askerlerin arasında, lordum. Kraliçe pencereden el salladı; ben de mendilimle. Mendili kraliçenin kedisi kaptı.',
          ])
        : any([
            'Kral saraya döndü, lordum. Ordunun emirleri yine elçiyle gidecek; ben yeniden işe döndüm, ne kadar sevindiğimi anlatamam.',
            'Hükümdar komutayı bıraktı, lordum. Taçlı sancak saraya geri asıldı; tozunu ben aldım.',
            'Kral sağ salim sarayda, lordum. Kraliçe rahat bir nefes aldı; ben de, ama benimki işim geri geldiği için.',
            'Komuta yeniden komutanlarda, lordum. Kral miğferini çıkardı, tacını taktı; miğferin izi alnında kaldı, kimse söylemesin.',
            'Hükümdar sarayına döndü, lordum. Askerler biraz boyun büktü ama savaş devam eder; benim dizlerim de.',
            'Kral ordudan ayrıldı, lordum. Ben yine at sırtında koşuşturacağım; dizlerim şimdiden ağrıyor, atım da.',
          ])
    case 'army': {
      const o = (c.order ?? {}) as { kind?: string; siege?: boolean }
      switch (o.kind) {
        case 'move':
          return o.siege
            ? any([
                'Ordu kuşatmaya gidiyor, lordum. Kapıya varınca kuşatma başlar; kapının ardındakiler şimdiden ter döküyordur.',
                'Kuşatma emri verildi, lordum. Askerler merdivenleri ve sabırlarını yanlarına aldı; sabır daha hafif ama daha çabuk bitiyor.',
                'Ordu kasabaya yürüyor, lordum. Kuşatma uzun sürer; sabır kılıçtan önce gelir, kılıç da sabırdan sonra, sırayla.',
                'Sancak kasabaya döndü, lordum. Garnizon bizi uzaktan görünce bütün dualarını bir anda hatırlayacak.',
                'Kuşatmaya yürüyüş başladı, lordum. Ordu kapıda kalmalı; başka yere gönderilirse kuşatma kalkar, kasabalılar da bize el sallar.',
                'Askerler kasabanın yolunu tuttu, lordum. Kasabalılar şimdiden kapılarını sürgülüyor; birkaçı da çamaşırlarını topluyor, beklenmedik misafir.',
              ])
            : any([
                'Ordu yola çıktı, lordum. Hudut dışındaysa emirler elçiyle gider, unutmayın; ben de unutmamaya çalışıyorum.',
                'Sancak yürüyor, lordum. Askerler adım sayıyor; çavuş daha yüksek sesle sayıyor, onluktan sonrasını bilmiyor ama.',
                'Emir verildi, lordum. Ordunun tozunu buradan görüyorum; ya da gözlüğüm kirli, ikisinden biri.',
                'Ordu yönünü değiştirdi, lordum. Yürürken moral biraz düşer; hanların yanında toparlanır, hancının fıçısı boşalır.',
                'Askerler yeni hedefe yürüyor, lordum. Yolları seçerler, köprülerden geçerler; akıllı askerler. Bunu onlara ben öğrettim, tabii.',
                'Davullar yürüyüş havası çalıyor, lordum. Rota haritada kesik çizgiyle; çizgiyi düz tutmaya çalıştım, at hapşırdı.',
              ])
        case 'home':
          return any([
            'Ordu eve dönüyor, lordum. Kışlada sıcak çorba bekliyor; aşçı yarısını tattı ama kalanı yeter.',
            'Geri dönüş emri verildi, lordum. Askerler sevindi; çavuş bunu belli etmemeye çalıştı, ama ıslık çaldığını duydum.',
            'Sancak saraya döndü, lordum. Garnizona katıldıklarında moral de toparlanır; meyhanenin morali de, aynı akşam.',
            'Ordu yuvasına dönüyor, lordum. Analar kapılarda bekleyecek, ellerinde terlik; bazıları sevgiden, bazıları başka sebeple.',
            'Eve dönüş, lordum. En sevilen emir budur; askerler başka emirleri iki kez duyar, bunu ilk seferde.',
            'Ordu geri çağrıldı, lordum. Yürürken türkü söylüyorlar; sözleri pek düzgün değil, birkaçı sizinle ilgili ama iyi şeyler, sanırım.',
          ])
        case 'split':
          return any([
            'Ordu ikiye bölündü, lordum. Her parça artık kendi yolunda; umarım aynı yolda değil.',
            'İki sancak oldu, lordum. Komutanlar birbirine kaş göz ediyor; kim daha iyi, göreceğiz. Ben şimdiden ikisine de "sizsiniz" dedim.',
            'Bölme emri yerine geldi, lordum. İki küçük ordu bir büyükten daha çok yer tutar, daha az zar atar, daha çok mektup yazar.',
            'Ordu ayrıldı, lordum. Askerler arkadaşlarına el sallıyor; sanki yıllarca görüşmeyecekler. Yarın kantinde görüşecekler.',
            'Bölündük, lordum. Her türden orantılı ayrıldı; kâtip hesabı iki kez yaptı, iki farklı sonuç buldu, ortalamasını aldık.',
            'İki ordu, lordum. Biri burada beklesin, biri gitsin; ya da ikisi de gitsin, karar sizin. Ben bekleyenle kalırım, alışkanlık.',
          ])
        case 'merge':
          return any([
            'Ordular birleşti, lordum. Tek sancak, tek yürek, tek kazan; kazanın başında da büyük kavga.',
            'İki ordu tek oldu, lordum. Komutanlardan biri kahrından küstü; ona sonra bir görev buluruz, belki elçi yardımcılığı.',
            'Birleşme tamam, lordum. Büyük ordu, büyük zar; büyük maaş da, hazinedar haberi aldı, yatağa düştü.',
            'Askerler kucaklaştı, lordum. Yıllardır ayrıymış gibi; oysa yarım saat olmuştu. Askerler duygusaldır, belli etmezler.',
            'Ordular kaynaştı, lordum. Bu kalabalık düşmanın moralini daha bakarken bozar; kokusuyla da, yürüyüşten sonra.',
            'Tek ordu, lordum. Haritada sancak büyüdü; rakipler de gördü, birkaçı gözlerini kırpıştırıyor.',
          ])
        case 'chase':
          return any([
            'Ordu yağmacıların peşine düştü, lordum. Yağmacılar yavaş yürür; ganimet ağır, vicdanları hafif ama yine de yavaşlar.',
            'Takip başladı, lordum. Askerler izleri okuyor; birinin burnu av köpeğinden keskin. Köpek de bunu kıskanıyor.',
            'Çetenin peşindeyiz, lordum. Yakalarsak ganimet bizim, yollar temiz; tüccarımız da yağmacılara verdiği indirimden pişman olur.',
            'Ordu yola çıktı, lordum; hedef yağmacılar. Tüccarımız bunu duyunca sevindi, hemen yağmacılara borcunu ödememeye karar verdi.',
            'Yağmacılara gün doğdu, lordum; ama onlar için iyi bir gün olmayacak. Güneş bile bizden yana.',
            'Takip emri verildi, lordum. Yakalayınca haber getiririm; yakalayamazsak da getiririm, daha kısık sesle ve arkadan.',
          ])
        case 'cave':
          return any([
            'Ordu mağaraya yürüyor, lordum. Klanın yuvasına dayanacağız; kapıyı çalmayacağız, mağaraların kapısı yok zaten.',
            'Mağara kuşatması başlıyor, lordum. Meşaleler hazır, askerler pek değil; karanlıktan korkarlar, yarasalardan daha çok.',
            'Ordu dağ yolunda, lordum. Mağarayı alırsak klan yok olur, ganimet bizim olur; mağara rutubeti de bizim olur, ama onu bırakırız.',
            'Kuşatma emri verildi, lordum. Yağmacılar kendi mağaralarında güçlüdür; askerlerimizin sayısı bol olsun, cesareti de en azından ortalama.',
            'Sancak mağaraya dönük, lordum. İzleri sürmenin karşılığını şimdi alacağız; izleri ben sürmüştüm, birazcık, uzaktan.',
            'Ordu klanın mağarasına gidiyor, lordum. Mağaranın kokusu şimdiden geliyor; içinde bir ganimet kokusu da var, çok hafif.',
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
              'Filo limanda bekleyecek, lordum. İskeleyi korur; meyhaneyi de, gönüllü olarak.',
              'Gemiler demir attı, lordum. Tayfa iskelede ağ örüyor; birkaçı ağın içinde uyuyor.',
              'Filo limanda, lordum. Bir saldırı olursa ilk onlar karşılar; olmazsa ilk onlar yemeğe yetişir.',
              'Yelkenler sarıldı, lordum. Gemiler limanda dinleniyor; tayfa meyhanede, aynı işi yapıyorlar.',
              'Liman nöbeti başladı, lordum. Kaptan dürbünüyle ufku tarıyor; dürbünü ters tutuyordu, söyleyemedim.',
              'Filo evde kalacak, lordum. Denizciler bunu tatil sanıyor; değil, ama ikna edemedim.',
            ])
          case 'fish':
            return any([
              'Filo balığa çıktı, lordum. Ağlar atıldı, martılar heyecanlı; martılar ağlardan daha çok tutuyor.',
              'Gemiler iskele önünde balık tutacak, lordum. Ambara taze balık girecek; saraya da balık kokusu, kraliçenin kedisi sevinecek.',
              'Balık avı başladı, lordum. Kokalar en çok tutar; kadırgalar biraz utangaçtır, balığa bakamıyorlar.',
              'Ağlar suya, lordum! Akşam sofrasında balık var; ben de davetliyim sanırım, davet edilmediysem de geliyorum.',
              'Filo balıkçı oldu, lordum. Kaptan "bu bana yakışmaz" dedi, ama ağını iyi atıyor; kendi ayağını da iki kez yakaladı.',
              'Balıkçılar yola çıktı, lordum. Korsanlar uzak olsun, balıklar yakın; balıklar bu dileğe katılmıyor.',
            ])
          case 'hunt':
            return any([
              'Filo korsan avına çıktı, lordum. Korsanlar yakalandıkça ödül gelir; korsanlar bu düzeni pek sevmiyor.',
              'Savaş gemileri ufka açıldı, lordum. Kara yelkenliler artık rahat uyuyamaz; zaten pek uyuyamazlardı, vicdan meselesi.',
              'Korsan avı başladı, lordum. Ticaret seferlerimiz de daha güvende olur; tüccar bunu duyunca ilk kez "teşekkürler" dedi.',
              'Kadırgalar korsan peşinde, lordum. Tayfa kılıçlarını biledi; kürekleri de, nedenini sormadım.',
              'Filo deniz devriyesinde, lordum. Arada bir gemi batabilir; deniz cömert ama acımasızdır, tıpkı hazinedarımız gibi.',
              'Korsanlara dikkat, lordum; yani artık korsanlar bize dikkat etsin. Bu cümleyi tayfaya ben yazdım, bayrağa işlettiler.',
            ])
          case 'trade':
            return any([
              `Filo ${order.good ? goodOf(order.good) : 'mal'} yüklü taç limanına yelken açtı, lordum. Kaptan haritayı bu kez doğru tutuyordu, kontrol ettim.`,
              'Ambarlar boşaltıldı, gemiler doldu, lordum. Deniz ticareti başladı; fareler de gemiye bindi, onlar da ticarete meraklı.',
              'Filo deniz ticaretinde, lordum. Satılan her sefer o taçla ilişkimizi de ısıtır; denizde ısınmak zor bir iştir, takdir edin.',
              `Yelkenler şişti, lordum; ${order.good ? goodOf(order.good) : 'yük'} denize açıldı. Korsanlar da bunu biliyorsa eskort iyi olur; korsanlar her şeyi bilir, dedikoducudurlar.`,
              'Ticaret filosu uğurlandı, lordum. Limandaki aracılar biraz pay alır; aracılar her zaman biraz pay alır, ben de aracıyım, söylemiş olayım.',
              'Gemiler yola çıktı, lordum. Kaptana "fırtınadan kaçın" dedim; "korsandan da" diye ekledim, "ve bana bir hediye getirin" diye de bitirdim.',
            ])
          case 'blockade':
            return any([
              'Filo abluka için yola çıktı, lordum. Düşmanın iskelesi önünde sıraya dizilecek; nazik ama inatçı bir misafir gibi.',
              'Abluka emri verildi, lordum. Düşmanın balığı ağzında kalacak; düşmanın balıkçısı da ağzı açık kalacak.',
              'Kadırgalar düşmanın iskelesine gidiyor, lordum. Oradaki gemilerle çarpışırsak kazanmalıyız; kaybetmek iyi bir abluka tekniği değil.',
              'Abluka yolda, lordum. Başarılı olursa düşmanın deniz ticareti durur; düşmanın tüccarı da bizim tüccarımızdan daha çok ağlar.',
              'Filo düşman sularına yöneldi, lordum. Tayfa şarkı söylüyor; korkudan mı neşeden mi bilmiyorum, sesleri pek fark etmiyor.',
              'Ablukacılarımız yelken açtı, lordum. Düşmanın iskelesi yakında bizim kadırgalarla dolu olacak; düşmanın gözleri de yaşla.',
            ])
          case 'raid':
            return any([
              'Filo kıyı akınına çıktı, lordum. Düşmanın depolarından pay almaya gidiyor; pay demek, hepsi demek değil, söz verdiler.',
              'Akıncılar denizde, lordum. Kazanırlarsa ganimetle dönerler; kaybederlerse hikâyeyle, o da az değil.',
              'Kıyı akını başladı, lordum. Gemiler taşıyabildiği kadar yüklenecek; tayfa ceplerine de, onu sayamayız.',
              'Filo düşman kıyılarına gidiyor, lordum. Tayfa ganimet çuvallarını şimdiden katladı; biri benim yastık kılıfımdı.',
              'Akın emri verildi, lordum. Düşmanın gemileri karşı çıkarsa çarpışacağız; çıkmazsa da düşmanın ambarına kibarca gireceğiz.',
              'Yelkenler düşmana dönük, lordum. Akın kısa sürer, hatırası uzun; düşmanın hatırası daha da uzun.',
            ])
          case 'sortie':
            return any([
              'Filo ablukayı yarmaya çıkıyor, lordum! Bu kadar heyecanı yaşımda kaldıramam, oturuyorum.',
              'Gemilerimiz abluka filosunun üstüne gidiyor, lordum. Kazanırsak iskelemiz kurtulur; balıkçılarımız da işsizlikten.',
              'Ablukayı yarma emri verildi, lordum. Tayfa dişlerini sıktı; birkaçında sıkacak diş kalmamıştı, onlar dudağını ısırdı.',
              'Kadırgalar çıkıyor, lordum. Düşmanın gemileri bunu beklemiyordu; açıkçası ben de beklemiyordum.',
              'Filo saldırıya geçti, lordum. Balığımız, ticaretimiz bu çarpışmada; akşam yemeğimiz de.',
              'Ablukaya karşı çıkış, lordum. Rüzgâr bizden yana olsun; olmazsa kürekçiler bizden yana olsun.',
            ])
          default:
            return null
        }
      }
      switch (c.action) {
        case 'form':
          return any([
            'Limandan yeni bir filo çıktı, lordum. Sancak direkte dalgalanıyor; biraz ters asılmış, kimse fark etmeden düzelttirdim.',
            'Filo kuruldu, lordum. Kaptan atandı; eski bir korsanmış, ama tövbeli. Tövbe ettiğine yemin etti, korsan yemini.',
            'Gemiler sıraya girdi, lordum. Bir filo, bir sancak, bir görev bekliyor; bir de çok aç bir tayfa.',
            'Yeni filo hazır, lordum. Balık mı, ticaret mi, korsan mı; emir sizin, deniz tutması tayfanın.',
            'Filo limandan ayrıldı, lordum. En çok iki filo çıkarabiliriz; bu onlardan biri, öbürü kıskanmasın.',
            'Tayfalar gemilere bindi, lordum. Ben iskelede kaldım; deniz beni tutar, ben de denizi tutamam.',
          ])
        case 'split':
          return any([
            'Filo ikiye bölündü, lordum. Kaptanlar ayrılırken "sende kalsın" diye pusulayı birbirine itti; ikisi de pusulayı bilmiyor.',
            'İki filo oldu, lordum. Kaptanlar artık birbiriyle yarışacak; kaybeden akşam yemeğini ısmarlayacak, öyle anlaştılar.',
            'Gemiler ayrıldı, lordum. Biri bir yana, biri öbür yana; ben ortada kaldım, karada.',
            'Filo bölündü, lordum. Kaptanlardan biri haritayı aldı, öbürü pusulayı; umarım değiş tokuş ederler, yoksa ikisi de kaybolur.',
            'Bölme tamam, lordum. Her filonun kendi görevi olabilir artık; kendi kaptanı, kendi şikâyetleri de.',
            'İki ayrı filo, lordum. Denizler geniş, ikisine de yer var; meyhanede ise yer yok, orada kavga çıkar.',
          ])
        case 'merge':
          return any([
            'Filolar birleşti, lordum. Daha büyük filo, daha büyük güç; daha büyük meyhane hesabı.',
            'Gemiler tek sancak altında toplandı, lordum. Sancak bu kadar gemiyi görünce gururla dalgalandı; ya da rüzgâr çıktı.',
            'Birleşme tamam, lordum. Korsanlar bu filoyu görünce rotalarını değiştirir; bir kısmı mesleklerini de.',
            'İki kaptan bir oldu, lordum; daha doğrusu biri kaptan kaldı, öbürü kâtip oldu. Kâtip olan bana dert yandı, iki saat.',
            'Filo büyüdü, lordum. Haritada etiketi de büyüdü; kaptanın egosu da, maalesef.',
            'Gemiler kaynaştı, lordum. Tayfalar birbirine eski hikâyelerini anlatıyor; hepsi aynı hikâye, her seferinde balina büyüyor.',
          ])
        case 'dock':
          return any([
            'Filo limana bağlandı, lordum. Gemiler yeniden liman gemileri; tayfalar da yeniden meyhane müdavimi.',
            'Filo dağıtıldı, lordum; gemiler iskeleye yanaştı. Bir tanesi biraz sert yanaştı, iskele hafif yamuldu.',
            'Tayfa karaya çıktı, lordum. Gemiler limanda dinleniyor; tayfa dinlenmiyor, şarkı söylüyor.',
            'Filo limana katıldı, lordum. İskeleyi savunurlar; özellikle de iskelenin yanındaki meyhaneyi.',
            'Sancak indirildi, lordum. Gemiler limana bağlandı; düğümleri ben kontrol ettim, ikisini çözdüm, yanlışlıkla.',
            'Filo eve döndü ve dağıldı, lordum. Kaptan da emekli olmak istiyor; ona bir fıçı şarap gönderdim, fikrini değiştirdi.',
          ])
        case 'recall':
          return any([
            'Filo geri çağrıldı, lordum. Yol aldığı kadar geri dönecek; denizde geri vites yok, bunu kaptana ben anlattım.',
            'Geri dönüş emri, lordum. Yelkenler eve doğru çevrildi; tayfa da yüzünü meyhaneye.',
            'Filo dönüyor, lordum. Tayfa sevindi; deniz yorgunu adamlar, denizden de yorgunlar.',
            'Kaptana dönüş emri gönderdik, lordum. Ulak yüzerek gitmedi, merak etmeyin; sandalla gitti, zor da olsa.',
            'Filo görevi bıraktı, lordum. Eve dönüyorlar; bir tanesi "unuttuğumuz bir şey vardı" dedi, gemi değildi umarım.',
            'Gemiler geri geliyor, lordum. Limanda onları bir fıçı ve bir ziyafet bekliyor; fıçıyı ben bekletiyorum, bir yudum aldım.',
          ])
        case 'sail':
          return any([
            'Filo yelken açtı, lordum. Rotası haritada; kaptan rotaya uyacağına yemin etti, rüzgâr etmedi.',
            'Gemiler yola çıktı, lordum. Suyun ortasından giderler; kıyıdan uzak, kayadan uzak, benden de uzak.',
            'Filo yeni yerine gidiyor, lordum. Rüzgâr arkadan essin; önden eserse kürekçiler essin.',
            'Kaptan rotayı çizdi, lordum. Vardıkları yerde demirleyecekler; demiri bu kez gemiye bağlamayı unutmazlarsa.',
            'Yelkenler şişti, lordum. Martılar da peşlerinde; martılar her zaman bir şey bilir.',
            'Filo hareket etti, lordum. Kürekçiler tempo tutuyor; ben de ayağımla. Ayağım kramp girdi, tempo da bozuldu.',
          ])
        case 'chase':
          return any([
            'Filo korsan teknesinin peşine düştü, lordum. Kaptan "kara yelkenden nefret ederim" dedi; yelkenciliği de pek sevmez zaten.',
            'Korsanların önü kesilecek, lordum. Filo tam yelken yolda; korsanlar şimdiden kendi aralarında suçlu arıyor.',
            'Takip başladı, lordum. Korsanlar bizden yavaş; yakalarsak batırırız, batırınca da ödül alırız. Güzel bir zincir.',
            'Kara yelkenlinin peşindeyiz, lordum. Batırırsak ödül de bizim; papağanları varsa, onu da isterim.',
            'Kaptan "kara yelkeni görürsem bırakmam" dedi, lordum. Sözünün eri bir adam; bir keresinde kendi yelkenini de kovaladı, gece karanlıktı.',
            'Filo korsanlara doğru, lordum. Kadırgalar çektirileri yener; dua edelim yeterince kadırgamız olsun, yoksa dua edelim yeterince hızlı olalım.',
          ])
        case 'unchase':
          return any([
            'Filo takibi bıraktı, lordum. Korsanlar arkalarına bakıp el salladı; terbiyesizler.',
            'Korsanların peşinden vazgeçildi, lordum. Bugün onların şanslı günü; bizim de, ödülü kaçırdık ama gemiyi kaçırmadık.',
            'Takip bitti, lordum. Kaptan biraz homurdandı ama emir emirdir; homurtusu iki saat sürdü.',
            'Filo durdu, lordum. Korsanlar uzaklaşıyor; başka gün, başka rüzgâr.',
            'Takibi bıraktık, lordum. Deniz geniş, korsan bol; yine karşılaşırız, onlar da biliyor, bu yüzden pek sevinmediler.',
            'Filo yeni emri bekliyor, lordum. Korsanlar bizden kurtuldu; bu sefer. Kaptan kara yelkenin rengini not aldı.',
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
            'Elçimiz tatlı sözlerle yola çıktı, lordum. İlişkimiz biraz ısınacak; sözleri ben yazdım, tatlıyı da ben yedim.',
            'Nezaket elçisi yolda, lordum. Yanında bir kese ve benim yazdığım üç iltifat var; üçü de aynı iltifat, farklı kelimelerle.',
            'İlişkiyi geliştirmek için elçi gönderildi, lordum. Varınca teklif karşı tarafa düşer; inşallah ayağına düşmez.',
            'Elçimiz şapkasını düzeltti, gülümsemesini taktı, lordum. Dost kazanmaya gidiyor; gülümsemesi biraz eğreti, aynada çalıştı.',
            'Bir dostluk elçisi yolda, lordum. İtibarımız iyiyse sözlerimiz daha çok tutar; kötüyse sözlerimiz de kapıdan döner.',
            'Elçi karşı saraya gidiyor, lordum. Ben gidecektim ama dizlerim izin vermedi; dizlerim diplomasiye karşı.',
          ])
        case 'gift':
          return any([
            `Elçimiz ${c.gold ? `${c.gold} altınlık ` : ''}bir hediyeyle yola çıktı, lordum. Yolda bir tane bile eksilmeyecek; saydım, mühürledim, elçiyi de sıkı tembihledim.`,
            `Hediye sandığı yolda, lordum. ${c.gold ? `${c.gold} altın; ` : ''}gönüller altınla kolay açılır, kapılar ise daha kolay.`,
            'Hediye gönderildi, lordum. Karşı taraf sandığı açınca yüzü gülecek; kapatınca da daha fazlası var mı diye arkasına bakacak.',
            'Kesenin ağzı açıldı, lordum. Bu altın oraya varınca ilişki de ısınır; hazinedarın ilişkisi bizimle soğudu ama.',
            'Hediyemiz yolda, lordum. Ben sandığa bir de mektup koydum; altın konuşur, mektup süsler, ben de imzalarım.',
            'Cömertliğiniz yola çıktı, lordum. Hediye ne kadar büyükse ilişki o kadar ısınır; hazinedar ne kadar büyükse o kadar ağlar.',
          ])
        case 'tribute':
          return any([
            `Haraç isteğimiz yolda, lordum${c.gold ? `: turda ${c.gold} altın` : ''}. Kabul ederlerse hazine her tur dolar; etmezlerse elçimiz kaçmayı bilir.`,
            'Elçimiz haraç istemeye gitti, lordum. Kaşlarını çatmayı biliyor; ben öğrettim, aynada saatlerce çalıştık.',
            'Haraç talebi gönderildi, lordum. Reddederlerse ilişki çok düşer; kabul ederlerse biraz. Her durumda düşer, ama haraç güzeldir.',
            'Elçimiz sert bir mektupla yolda, lordum. Karşı lord okurken şarabını dökecek; mektubu lekesiz bir köşeye yazdım ki okunsun.',
            'Haraç istendi, lordum. Cevap gelince haber getiririm; kızgın bir cevap olabilir, ben de kızgın bir sesle okurum.',
            'Haraç elçisi yola düştü, lordum. Güçlü olan ister, akıllı olan verir; bakalım komşumuz hangisi. Ben ikisine de bahse girmedim.',
          ])
        case 'alliance':
          return any([
            'İttifak teklifimiz yolda, lordum. Kabul ederlerse ordularımız birbirini korur; meyhanede de birbirine ısmarlar.',
            'Elçimiz ittifak sözleşmesiyle gitti, lordum. Mührü ben bastım, en güzel yerine; biraz kaydı, ama sanatsal oldu.',
            'İttifak teklifi gönderildi, lordum. Dost kılıcı yanınızda, düşman kılıcı karşınızda olur; arkanızda olmasın da.',
            'Bir müttefik arıyoruz, lordum. Elçi karşı sarayda en iyi yüzünü takınacak; ikinci en iyi yüzü yok zaten.',
            'İttifak elçisi uğurlandı, lordum. İttifakı bozmak ilişkiyi çok düşürür; iyi seçtiğimizi umalım, ben iyi seçtiğimizi söyledim zaten.',
            'Teklif yolda, lordum. Kabul gelirse ilk kadehi birlikte kaldırırız; ikinci kadehi ben kaldırırım, yalnız.',
          ])
        case 'peace':
          return any([
            `Barış teklifimiz yolda, lordum${terms?.kind === 'white' ? ': beyaz barış' : ''}. Kabul ederlerse kılıçlar kınına girer; kınını kaybeden askerler çok.`,
            'Elçimiz beyaz bayrakla yola çıktı, lordum. Umarım bayrağı tanırlar; yıkandıktan sonra biraz griye döndü.',
            'Barış teklifi gönderildi, lordum. Savaş puanımız yüksekse kabul etmekten başka çareleri kalmaz; düşüksek de dua ederiz.',
            'Elçi barış antlaşmasını taşıyor, lordum. Mürekkep kurumadan bir savaş daha çıkmasın; mürekkebi hızlı kuruyan cinsten seçtim.',
            'Barış istedik, lordum. Halk bunu duyunca derin bir nefes aldı; askerler daha da derin aldı.',
            'Barış elçisi yolda, lordum. Ben savaşı da barışı da bilirim; barış daha az ses yapar ve daha az sargı beziyle biter.',
          ])
        case 'insult':
          return any([
            'Elçimiz hakaret götürmeye gitti, lordum. Varınca ilişki çok düşer; onlar da savaş gerekçesi kazanır. Ama değer, sözler çok güzel.',
            'Hakaret elçisi yolda, lordum. Ona en iyi sözlerimi verdim; yani en kötülerini. Bir ömür biriktirmiştim.',
            'Elçimiz boğazını temizledi, lordum. Söyleyeceklerini duyan karşı lord bir hafta uyuyamaz; annesi de.',
            'Hakaretimiz yola çıktı, lordum. Diplomaside buna "sert bir mektup" denir; biz yalnızca sesli ve kafiyeli söylüyoruz.',
            'Elçi hakaretleri ezberledi, lordum. Bir tanesini ben ekledim; keçilerle ilgili. Uzun hikâye, keçiler suçsuz.',
            'Hakaret yolda, lordum. Sonra bana kızmayın; ben yalnızca yazdım, düzelttim, kafiyeledim ve gönderdim. Taşımadım.',
          ])
        default:
          return null
      }
    }
    case 'respond':
      return c.accept
        ? any([
            'Teklifi kabul ettiniz, lordum. Elçi cevabı götürüyor; koşarak, siz fikrinizi değiştirmeden.',
            'Kabul cevabı yolda, lordum. Karşı saray bunu duyunca sevinecek; şaşıracak da, ummuyorlardı galiba.',
            'Evet dediniz, lordum. Mühürlendi ve gönderildi; mührü ben bastım, bu sefer kaymadı.',
            'Anlaşma tamam, lordum. Elçi eğilip selam verdi ve yola koyuldu; eğilirken beli tuttu, doğrulması biraz sürdü.',
            'Teklif kabul edildi, lordum. Ben de bu anı anılarıma yazıyorum; anılarımın altıncı cildi, en heyecanlı bölümü.',
            'Kabul, lordum. Bazen en güçlü söz "evet"tir; bazen de "olur" ama o daha az görkemli.',
          ])
        : any([
            'Teklifi reddettiniz, lordum. Elçi yüzünü buruşturdu ve gitti; yüzü zaten buruşuktu, ama bu sefer bilerek.',
            'Ret cevabı yolda, lordum. Karşı taraf pek hoşlanmayacak; ben de pek hoşlanmazdım, ama ben değilim.',
            'Hayır dediniz, lordum. Kibarca söyledim; yine de kapıyı çarparak çıktı. Kapıyı tamir ettirdim, faturasını onlara gönderdim.',
            'Teklif geri çevrildi, lordum. İlişki bundan etkilenebilir, haberiniz olsun; haberiniz olunca da benim haberim olsun.',
            'Elçiyi eli boş gönderdik, lordum. Yolda ne düşündüğünü tahmin edebiliyorum; çoğu kafiyeli ve hiçbiri kibar değil.',
            'Reddedildi, lordum. Bazen en güçlü söz de "hayır"dır; "belki" de var, ama onu hep ben kullanıyorum.',
          ])
    case 'declareWar':
      return any([
        'Savaş ilan edildi, lordum! Davullar çalıyor, sancaklar açılıyor; hazinedar yatağın altına girdi.',
        'Savaş elçisi yolda, lordum. Bu haber vardığında bütün lobi duyacak; birkaçı şimdiden patlamış mısır hazırlıyor.',
        'Kılıçlar kınından çıktı, lordum. Gerekçesiz savaş açtıysak öbür lordlar da bize biraz soğuyacak; zaten pek sıcak değillerdi.',
        'Savaş başladı, lordum. Askerler sabırsız, analar endişeli; ben ikisi birden, artı biraz da hazımsızlık.',
        'Savaş ilanı mühürlendi, lordum. Artık geri dönüş yok; ya da barış teklifine kadar yok, ki ben onu da şimdiden yazmaya başladım, ne olur ne olmaz.',
        'Ordulara haber gitti, lordum: düşmanla karşılaşınca muharebe olacak. Ben savaşın en tehlikeli yerinde olacağım: mektupların arasında.',
      ])
    case 'breakAlliance':
      return any([
        'İttifak bozuldu, lordum. Eski dostumuz bunu unutmayacak; eski dostlar hiçbir şeyi unutmaz, özellikle borçları.',
        'Antlaşma yırtıldı, lordum. İlişki çok düşecek; onlar da savaş gerekçesi kazanır. Kâğıt yırtmak kolay, sonrası zor.',
        'İttifak sona erdi, lordum. Yırtılan antlaşmanın parçalarını topladım; hatıra olarak. Bir parçası mutfakta reçel kavanozunun kapağı oldu.',
        'Dostluk bitti, lordum. Elçi haberi götürürken başını öne eğdi; utançtan değil, rüzgârdan.',
        'İttifakı bozdunuz, lordum. Bazen yollar ayrılır; yalnız ayrılan yol bir gün karşınıza çıkabilir, elinde kılıçla.',
        'Mühür kırıldı, lordum. Artık kendi ordumuzla kendimizi korumalıyız; ordumuza bunu söyledim, birkaçı terledi.',
      ])
    case 'endTribute':
      return any([
        'Haraç anlaşması bitti, lordum. Elçi haberi götürüyor; nasıl karşılanacağını bilmiyorum, ben uzakta durmayı tercih ederim.',
        'Haraç işi kapandı, lordum. Hazinedar defterden bir satır sildi; yanına küçük bir ağlayan yüz çizdi, gördüm.',
        'Haraca son verdiniz, lordum. Bağışladıysak gönül kazanırız; kestiysek bedelini öderiz, hem de faiziyle.',
        'Anlaşma sona erdi, lordum. Altın akışı durdu; ilişkiler de buna göre değişecek, genelde aşağı doğru.',
        'Haraç bitti, lordum. Bazen cömertlik, bazen gurur; hangisi olduğunu tarih yazar, tarihi de ben yazarım, yani sorun yok.',
        'Haraç defteri kapandı, lordum. Ben mürekkebi kurutuyorum; hazinedar da gözyaşlarını.',
      ])
    case 'raid':
      return any([
        'Askerlerimiz ticaret yolunu basmaya gitti, lordum. Gözcü kuleleri azsa şansımız yüksek; çoksa askerlerimizin bacakları hızlı olsa iyi.',
        'Baskın başladı, lordum. Başarırsak tüccarlarının yükü bizim olur, ticaret noktaları da kül; ben bu işlere karışmam, sadece yazarım.',
        'On asker yola çıktı, lordum. Yüzlerini sardılar ama kim olduklarını herkes bilecek; birinin sargısında adımız yazıyor, söylemedim.',
        'Ticaret yolu yağması emredildi, lordum. Asker kaybımız olacak; ganimetimiz de, umarız. Tüccarlar bu işlerden nefret eder, bizimki de dahil.',
        'Askerler pusuya yattı, lordum. Karşı tarafın tüccarı bugün eve geç dönecek, hafif dönecek, çok kızgın dönecek.',
        'Baskın yolda, lordum. İlişki düşecek, onlar da savaş gerekçesi kazanacak; ama bu bizim seçimimiz ve ben bu seçimi çok cesur buldum, uzaktan.',
      ])
    case 'spy': {
      const on = SPY_ON[c.topic as string] ?? 'sırlarını'
      return any([
        `Casusumuz yola çıktı, lordum. Hedefin ${on} gözetleyecek; ilk iş kılık değiştirecek, ilk kılığı biraz şüpheliydi, sahte sakal.`,
        `Bir casus daha karanlığa karıştı, lordum. Ağ kurdukça ${on} daha iyi göreceğiz; karanlıkta değil tabii, gündüz.`,
        `Casus pelerinini giydi, lordum. Görevi: ${on} öğrenmek. Yakalanmasın diye dua ediyorum; pelerin biraz parlak.`,
        'Casusumuz yolda, lordum. Ben de kimseye söylemedim; yalnızca size, aşçıya ve kâtibe. Bir de kraliçenin kedisine.',
        `Casus karşı saraya sızıyor, lordum. ${c.topic === 'army' ? 'Ordu konusunda ağ güçlenince birlik türleri de görünür; şimdilik yalnızca miğfer sayıyor.' : 'Ağ güçlendikçe tahminler daralır; şimdilik "çok" ve "az" diye iki sayı biliyor.'}`,
        'Gölgede bir adım, lordum. Casusumuz artık bir aşçı yamağı; ya da bir seyis. Hangisi olduğunu ben de bilmiyorum, iyi casus böyle olur.',
      ])
    }
    case 'recall':
      return any([
        'Casus geri çağrıldı, lordum. Gölgeden çıkıp eve dönüyor; gölgesini de getiriyor, merak etmeyin.',
        'Casusumuz görevi bıraktı, lordum. Evde karşı casusluğa yardım eder; ilk iş benim odamı aradı, ne bulduğunu söylemedi.',
        'Geri çağırma emri gizlice gönderildi, lordum. O kadar gizli ki ben bile unuttum; casus umarım unutmaz.',
        'Casus dönüyor, lordum. Ağ zamanla zayıflar; sonra yeniden kurarız, örümcekler gibi, daha az bacakla.',
        'Casusumuzu çektik, lordum. Ona bir sıcak çorba hazırlattım; casuslar da üşür, özellikle gece bacada beklerken.',
        'Görev bitti, lordum. Casus sessizce geldi; o kadar sessiz ki geldiğini ancak şimdi fark ettim, arkamdaymış.',
      ])
    case 'intel':
      return any([
        'Casuslardan yeni rapor istendi, lordum. Tahminler yenilendi; bazıları gerçeğe yakın, bazıları casusun hayallerine.',
        'Rapor geldi, lordum. Mürekkebi hâlâ ıslak; casus koşarak getirmiş, ya da yağmur yağıyor.',
        'Casus raporu masanızda, lordum. Ağ güçlüyse rakamlar doğruya yakın; zayıfsa casusun parmak sayısına.',
        'Yeni haberler var, lordum. Bazıları doğru, bazıları casusun hayal gücü; ağ gücüne bakın, bir de casusun yüzüne.',
        'Raporu okudum, lordum; sonra yaktım. Size okuyacak bir kopyası kaldı tabii; yanlış olanı yaktım galiba, neyse ezberledim.',
        'Casuslarımız konuştu, lordum. Fısıltıyla; ben de fısıltıyla aktarıyorum. Daha yaklaşın. Biraz daha.',
      ])
    case 'operation': {
      const op = c.op as string
      return op === 'kidnap'
        ? any([
            'Kaçırma operasyonu başladı, lordum. Gece karanlık, ip sağlam olsun; ipi ben seçtim, çamaşır ipinden daha sağlam.',
            'Casuslar kraliçeye uzanıyor, lordum. Başarırsak hapishanemiz misafir ağırlayacak; yastıkları kabartın, kibar olalım.',
            'Operasyon yolda, lordum. Ağ harcandı; şimdi şansa kaldı, şans da bu gece pek uyanık görünmüyor.',
            'Kukuletalı adamlar kuleye tırmanıyor, lordum. Ben bakmıyorum; elçiler böyle şeyleri görmez, görse de anlatmaz, anlatsa da süsler.',
            'Kaçırma emri verildi, lordum. Yakalanırlarsa herkes kimin yaptığını öğrenir; ben "o saatte uyuyordum" derim, provası bitti.',
            'Gece yarısı, ip, at ve bir kraliçe, lordum. Masal gibi; sonu iyi biterse. Kötü biterse de bir ozan ondan şarkı yapar.',
          ])
        : op === 'burn'
          ? any([
              'Sabotajcılar depolara yöneldi, lordum. Bu gece bir ambar yanacak; bizimki değil, bunu üç kez sordum.',
              'Kıvılcım yolda, lordum. Yemek ve malzemenin bir kısmı kül olacak; onların fareleri bu gece evsiz kalacak, üzüldüm biraz.',
              'Operasyon başladı, lordum. Sabotajcı çakmak taşını cebine koydu; cebi delikti, yeni cep diktirdik.',
              'Depolar hedefte, lordum. Yakalanırlarsa savaş gerekçesi doğar; yakalanmazlarsa bir yangın ve bir sürü soru doğar.',
              'Ateş emri verildi, lordum. Dumanını buradan görmeyi beklemiyorum ama umuyorum; kuleye çıktım, boşuna.',
              'Sabotaj yolda, lordum. Ağ harcandı; karşılığını alalım. Alamazsak da en azından iyi bir hikâye olur, kimseye anlatmayacağımız.',
            ])
          : op === 'delay'
            ? any([
                'Sabotajcılar inşaatlarına sızdı, lordum. İskeleleri gevşetecekler; ustabaşları da "ben demiştim" diyecek.',
                'Rakibin ustaları bu gece uyuyamayacak, lordum. Aletleri kayboluyor; birini ben de istiyorum, güzel bir çekiçti.',
                'İnşaat sabotajı başladı, lordum. Duvarlar biraz daha geç yükselecek; ustabaşı da "çabuk biter" demeyi bırakacak.',
                'Operasyon yolda, lordum. Bir çekiç kaybolur, bir kiriş kırılır, bir ustabaşı ağlar; inşaat uzar.',
                'Sabotajcılar şantiyede, lordum. Ustabaşına içki ikram ettiler; sonrası kolay, ustabaşları içkiye hayır demez.',
                'Rakip ustaların harcına kum karıştırılacak, lordum. Ben bunu duymadım; zaten yaşlıyım, pek bir şey duymam.',
              ])
            : op === 'townRevolt'
              ? any([
                  'Kışkırtıcılar kasabaya girdi, lordum. Sadakat birazdan sarsılacak; kasabanın sahibi de, haberi alınca.',
                  'Kasabanın meydanında fısıltılar başladı, lordum. Sahibine pek iyi şeyler söylenmiyor; birkaçını ben yazdım, edebi değeri yüksek.',
                  'Operasyon yolda, lordum. Kasaba halkı bu gece yeni dertler öğrenecek; eskileri yetmiyormuş gibi.',
                  'Kışkırtma emri verildi, lordum. Sadakat düşerse kasaba ayaklanır; ayaklanınca da bizim kasabalarımıza bakıp "onlar ne güzel" der.',
                  'Casuslarımız kasabanın meyhanesinde, lordum. Herkese içki, herkese dedikodu; içkinin parasını biz ödüyoruz, dedikodu bedava.',
                  'Kasabada isyan tohumları ekiliyor, lordum. Hasadı rakibimiz toplayacak; tarımda ilk kez bu kadar hızlı bir hasat görülecek.',
                ])
              : any([
                  'Kışkırtıcılar halkın arasına karıştı, lordum. Rakibin üretimi yarıya inecek; rakibin keyfi çeyreğe.',
                  'İsyan operasyonu başladı, lordum. Meydanlarda öfkeli sözler dolaşacak; bazıları bizim sözlerimiz, fark etmezler umarım.',
                  'Casuslar halkı kışkırtıyor, lordum. On dakika sonra rakibin atölyeleri susar; rakibin kendisi ise susmaz, ona bahse girerim.',
                  'Operasyon yolda, lordum. Ağ harcandı; ama fırtına kopacak. Şemsiyemi aldım, uzaktan izleyeceğim.',
                  'Rakibin halkı bu gece meşaleleri yakacak, lordum. Biz uzaktan izleriz; ben bir de kestane getirdim.',
                  'İsyan tohumları ekildi, lordum. Yakalanırlarsa kimin yaptığı ortaya çıkar; o durumda ben bu konuşmayı hiç hatırlamayacağım.',
                ])
    }
    case 'ransom':
      return any([
        'Fidye ödendi, lordum. Kraliçe eve dönüyor; hazinedar ise yatağına, uzun bir süreliğine.',
        'Altın sandığı yola çıktı, lordum. Kraliçemiz yakında sarayında; kedisi de pencerede bekliyor, bana hâlâ küs.',
        'Fidye teslim edildi, lordum. Hazine hafifledi ama saray yeniden dolacak; kraliçenin sandıkları da geri geliyor, üç tane.',
        'Kraliçe için ödedik, lordum. Bazı şeylerin fiyatı sorulmaz; hazinedar sordu yine de, cevap verdim, bayıldı.',
        'Fidye gitti, kraliçe geliyor, lordum. Halk sokaklara dökülmeye hazır; ben de en iyi cübbemi giydim, kaçıranlara nispet.',
        'Ödendi, lordum. Kaçıranlar altınlarını saysın; biz kraliçemizi sayarız, bir tane, eksiksiz.',
      ])
    case 'release':
      return any([
        'Rehine kraliçe serbest bırakıldı, lordum. Bu cömertlik ilişkiyi ısıtır; hapishanenin ısıtma gideri de düşer.',
        'Hapishanenin kapısı açıldı, lordum. Kraliçe eve dönüyor; giderken gardiyana bahşiş bıraktı, bize bırakmadı.',
        'Kraliçeyi bıraktınız, lordum. Karşı saray bunu unutmayacak; iyi anlamda, umarım. Kötü anlamda da unutmazlar ama.',
        'Serbest bırakıldı, lordum. Gardiyan biraz üzüldü; ona hep kibar davranıyormuş, satranç da öğretmiş.',
        'Rehine gitti, lordum. Hapishane sessiz; ben de sessiz kalıyorum, ki bu benim için büyük bir fedakârlık.',
        'Kraliçe atına bindi, lordum. Giderken bize başıyla selam verdi; asil bir kadın. Bana ayrıca bir bakış attı, ne anlama geldiğini çözüyorum.',
      ])
    default:
      return null
  }
}
