import { PROJECT_IDS } from '@game/shared'
import type { Kingdom } from '@game/shared'
import { L, locale } from '../../lib/i18n'
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
const lower = (s: string) => s.toLocaleLowerCase(locale())
const goodOf = (g: unknown) => lower(RESOURCE_NAMES[g as keyof typeof RESOURCE_NAMES] ?? L('mal', 'goods'))
const unitsOf = (units: unknown) => Object.values((units ?? {}) as Record<string, number>).reduce((a, b) => a + (b || 0), 0)

// Ships by name, in the accusative-free form the lines need ("3 kadırga").
const SHIP_WORDS: Record<string, string> = {
  galley: L('kadırga', 'galley'),
  cog: L('koka', 'cog'),
  corsair: L('çektiri', 'raider'),
}
// Spy topics as the envoy says them ("ambarlarına", "ordusuna", "elçilerine").
const SPY_ON: Record<string, string> = {
  stores: L('ambarlarını', 'stores'),
  army: L('ordusunu', 'army'),
  diplomacy: L('elçilerini', 'envoys'),
}
// Town upkeep levels (towns.json upkeep: none, little, middling, generous).
const UPKEEP_WORDS = [L('hiç', 'no'), L('az', 'meagre'), L('orta', 'middling'), L('cömert', 'generous')]

// `k` is the lord's state as the server answered it, for acts that name only an id (a building upgraded).
export function narrate(c: Cmd, k?: Kingdom | null): string | null {
  switch (c.type) {
    case 'sermon':
      return any([
        L(
          'Rahipler kürsüye çıktı, lordum. "Vergi bir erdemdir" diyorlar; halk erdemi sevdi, vergiyi hâlâ sevmiyor ama artık daha sessiz sevmiyor.',
          'The priests have taken the pulpit, my lord. "Taxes are a virtue," they say; the people love the virtue, still loathe the tax, but now loathe it more quietly.',
        ),
        L(
          'Vaaz başladı, lordum. Rahip öyle güzel anlatıyor ki bir an ben bile vergi vermek istedim. Neyse ki çabuk geçti.',
          'The sermon has begun, my lord. The priest speaks so beautifully that for a moment even I wanted to pay taxes. Mercifully, it passed.',
        ),
        L(
          'Çanlar çalıyor, lordum; meydan doldu. Vergiden şikâyet eden azaldı, rahibin uzun konuşmasından şikâyet eden arttı.',
          'The bells are ringing, my lord; the square is full. Fewer complain about the tax, more complain about the length of the sermon.',
        ),
        L(
          'Rahip "vergi veren el bereketlidir" dedi, lordum. Tahsildar hemen arkasından girdi; zamanlamayı ben ayarlamıştım.',
          'The priest said "blessed is the hand that pays," my lord. The tax collector walked in right on cue; I arranged the timing myself.',
        ),
        L(
          'Vaaz bitti, lordum; halk keselerini açtı. Ben de bağış kutusuna iki akçe attım, görünsün diye. Sonra birini geri aldım, görünmesin diye.',
          'The sermon is over, my lord; the people opened their purses. I dropped two coins in the alms box, to be seen. Then took one back, when nobody was looking.',
        ),
        L(
          'Rahip vergiyi öyle dokunaklı anlattı ki tahsildar ağladı, lordum. Ömründe ilk kez birileri onun yüzünden değil, onun için ağlıyordu.',
          'The priest spoke of taxes so movingly that the tax collector wept, my lord. For once in his life someone was crying for him rather than because of him.',
        ),
        L(
          'Halk dua ediyor, lordum; yarısı hasat için, yarısı sizin için. Kâtip olsam hasada bahse girerdim, ama ben sadık bir elçiyim.',
          'The people are praying, my lord; half for the harvest, half for you. Were I a clerk I’d bet on the harvest, but I am a loyal envoy.',
        ),
        L(
          'Vaazdan çıkan köylüler vergiyi "gönüllü bağış" diye anıyor, lordum. Kelimeyi rahibe ben verdim; telif istemedim, şimdilik.',
          'The villagers leaving the sermon now call the tax a "voluntary donation," my lord. I gave the priest that phrase; I’ve not asked for royalties. Yet.',
        ),
      ])
    case 'project':
      if (c.action === 'festival')
        return any([
          L(
            'Meydana sofralar kuruldu, lordum! Halk adınıza kadeh kaldırıyor; birkaçı adınızı yanlış söylüyor ama niyet önemli.',
            'Tables are laid in the square, my lord! The people raise their cups to your name; a few get the name wrong, but it’s the thought that counts.',
          ),
          L(
            'Şenlik başladı, lordum. Ambardan çıkan yemek gönüllere girdi; yarım saat kimse dert yanmaz, yarım saat sonra yine yanar.',
            'The festival has begun, my lord. Food from the storehouse has gone straight to the heart; nobody will grumble for half an hour; after that, back to normal.',
          ),
          L(
            'Davullar, zurnalar, kızarmış koyunlar… Lordum, halk bu günü torunlarına anlatacak. Koyunlar anlatamayacak, ama onlar da katkıda bulundu.',
            'Drums, pipes, roast mutton… My lord, the people will tell their grandchildren of this day. The sheep won’t, but they did contribute.',
          ),
          L(
            'Meydanda halay çekiliyor, lordum. Ben de katıldım; iki adımdan sonra dizim "yeter" dedi, oturdum.',
            'There’s dancing in the square, my lord. I joined in; after two steps my knee said "enough," so I sat down.',
          ),
          L(
            'Fıçılar açıldı, lordum! Aşçıbaşı "ambar boşalıyor" diye söyleniyor; ona da bir kadeh verdim, şimdi o da şarkı söylüyor.',
            'The casks are open, my lord! The head cook was grumbling that the storehouse is emptying; I gave him a cup too, and now he’s singing.',
          ),
          L(
            'Şenlik var, lordum: cambazlar ipte, çocuklar ağaçta, ozan masanın üstünde. Masayı ben kurdurmuştum; ozan çıkmasın diye değil tabii.',
            'A festival, my lord: acrobats on the rope, children up the trees, the minstrel on the table. I had that table set up; not for the minstrel to climb, naturally.',
          ),
          L(
            'Halk bu akşam doyacak, gülecek ve sizi anacak, lordum. Yarın yine söylenirler, ama tok karınla söylenmek bambaşkadır.',
            'Tonight the people will eat, laugh and speak your name, my lord. Tomorrow they’ll grumble again, but grumbling on a full belly is another thing entirely.',
          ),
          L(
            'Şenliğin en güzel anı benim konuşmamdı, lordum. Kısa tutmuştum; halk yine de üçüncü sayfada alkışlamaya başladı.',
            'The finest moment of the festival was my speech, my lord. I kept it short; even so, the people started applauding on page three.',
          ),
        ])
      if (c.action === 'donate') {
        const good = goodOf(c.good)
        return any([
          L(
            `Arabalar ${good} yüklü yola çıktı, lordum. Saray kâtipleri adınızı deftere iri harflerle yazacak; ben de yanına küçük harflerle kendiminkini.`,
            `The carts have set off laden with ${good}, my lord. The court clerks will write your name in the ledger in big letters; I’ll add mine beside it in small ones.`,
          ),
          L(
            `Tacın ambarlarına ${good} gidiyor, lordum. Hükümdar cömertliğinizi duyunca gülümseyecek; o gülümseme bize epey pahalıya geldi, iyi bakalım.`,
            `${good.charAt(0).toLocaleUpperCase(locale())}${good.slice(1)} is on its way to the crown’s storehouses, my lord. The ruler will smile at your generosity; that smile cost us dearly, so let’s take good care of it.`,
          ),
          L(
            'Bağış yola çıktı, lordum. Saraydaki dostlarımız artık sizden "o cömert lord" diye söz edecek; eskiden "o lord" diyorlardı.',
            'The donation is on its way, my lord. Our friends at court will now speak of you as "that generous lord"; they used to say "that lord."',
          ),
          L(
            `Bir kervan dolusu ${good}, lordum! Tacın ambarcısı sayarken parmakları yetmeyecek; ayak parmaklarına geçecek.`,
            `A whole caravan of ${good}, my lord! The crown’s storekeeper will run out of fingers counting; he’ll have to move on to his toes.`,
          ),
          L(
            'Bağışınızı hükümdara ben bizzat anlatacağım, lordum; biraz da süsleyerek. Süs bedava, ben de cömertim.',
            'I shall describe your donation to the ruler myself, my lord; with a little embroidery. Embroidery is free, and I am generous.',
          ),
          L(
            'Bizim ambar hafifledi, tacın gönlü ağırlaştı, lordum. Hazinedarımız bu teraziyi pek anlamadı; anlatmaya çalıştım, ağladı.',
            'Our storehouse is lighter and the crown’s heart fuller, my lord. Our treasurer didn’t quite follow this arithmetic; I tried to explain, he wept.',
          ),
          L(
            `${good.charAt(0).toLocaleUpperCase(locale())}${good.slice(1)} taca gidiyor, lordum. Ambar fareleri yolculara el salladı; onların da gözü vardı.`,
            `The ${good} goes to the crown, my lord. The storehouse rats waved it off; they had their eye on it too.`,
          ),
        ])
      }
      if (c.action === 'give') {
        const id = c.id as (typeof PROJECT_IDS)[number]
        const name = PROJECT_TEXTS[id]?.name ?? L('büyük iş', 'great work')
        return any([
          L(
            `Mallar ${name} için şantiyeye taşınıyor, lordum. Ustalar taşları sayıyor, kâtipler hesapları, ben de ustaları.`,
            `Goods are being hauled to the site of the ${name}, my lord. The masons count the stones, the clerks count the sums, and I count the masons.`,
          ),
          L(
            `${name} büyüyor, lordum. Yüzyıllar sonra bile adınızla anılacak; yanında küçük bir levhada da benimki, rica ederim.`,
            `The ${name} is growing, my lord. Centuries from now it will still bear your name; with mine on a small plaque beside it, if you please.`,
          ),
          L(
            'Arabalar şantiyeye boşaldı, lordum. Ustabaşı "bu hızla giderse çabuk biter" dedi; ustabaşları bunu doğduklarında da söylemiştir.',
            'The carts have unloaded at the site, my lord. The foreman said "at this rate it’ll be done in no time"; foremen have been saying that since the day they were born.',
          ),
          L(
            `${name} için taş üstüne taş, lordum. Bir usta adınızı kemerin altına kazımak istiyor; harfleri ben seçeceğim, imla bende.`,
            `Stone upon stone for the ${name}, my lord. A mason wants to carve your name beneath the arch; I’ll choose the letters, the spelling is my department.`,
          ),
          L(
            `Şantiyede çekiç sesi hiç susmuyor, lordum. ${name} bittiğinde torunlarınız gölgesinde oturacak; şimdilik ben oturuyorum, deneme amaçlı.`,
            `The hammers never stop on the site, my lord. When the ${name} is done your grandchildren will sit in its shade; for now I’m sitting there myself, as a trial.`,
          ),
          L(
            `Ambardan çıkan mallar ${name} şantiyesine yığıldı, lordum. Kâtip saydı, ustabaşı saydı, ben de saydım; üçümüz üç ayrı sayı bulduk.`,
            `Goods from the storehouse are piled at the ${name} site, my lord. The clerk counted, the foreman counted, I counted; the three of us got three different numbers.`,
          ),
          L(
            `${name} için bir teslimat daha, lordum. Mimar planı bana da gösterdi; ters tutuyordum, ama çok beğendim.`,
            `Another delivery for the ${name}, my lord. The architect showed me the plans too; I was holding them upside down, but I liked them very much.`,
          ),
        ])
      }
      return null
    case 'research': {
      const name = RESEARCH_NAMES[c.id as string]?.name
      return any([
        L(
          `Bilginler ${name ? `"${name}" üzerine ` : ''}kitaplara gömüldü, lordum. Mumları biz ödüyoruz, aklı onlar; adil bir paylaşım sayılmaz.`,
          `The scholars have buried themselves in books${name ? ` on "${name}"` : ''}, my lord. We pay for the candles, they supply the brains; hardly a fair split.`,
        ),
        L(
          `Üniversitede ${name ? `${name} ` : 'yeni bir '}araştırma başladı, lordum. Biri pencereden kuş uçuşunu ölçüyor; bilim böyle bir şey herhalde.`,
          `${name ? `Research into ${name}` : 'New research'} has begun at the university, my lord. One of them is measuring the flight of birds from the window; that’s science, I suppose.`,
        ),
        L(
          `${name ? `"${name}" ` : 'Yeni araştırma '}defterleri açıldı, lordum. Âlimler kavgaya başladı bile; bilim tartışmadan doğar, bazen de iki kırık sandalyeden.`,
          `The ledgers for ${name ? `"${name}"` : 'the new research'} are open, my lord. The scholars are already quarrelling; science is born of argument, and sometimes of two broken chairs.`,
        ),
        L(
          `Âlimler ${name ? `${name} için ` : ''}kütüphaneye kapandı, lordum. Yemeklerini kapının altından itiyoruz; çorba pek geçmiyor.`,
          `The scholars have locked themselves in the library${name ? ` for ${name}` : ''}, my lord. We slide their meals under the door; the soup takes it rather badly.`,
        ),
        L(
          `Rektör bana ${name ? `"${name}" ` : 'araştırmayı '}anlatmaya çalıştı, lordum. Yarısında uyudum; uyandığımda o da uyumuştu. Verimli bir toplantıydı.`,
          `The rector tried to explain ${name ? `"${name}"` : 'the research'} to me, my lord. I fell asleep halfway; when I woke, so had he. A productive meeting.`,
        ),
        L(
          `Mürekkep hokkaları doldu, lordum; ${name ? `"${name}" ` : 'yeni bilgi '}yolda. Bitince etkisi hemen başlar, âlimlerin kibri ondan da önce.`,
          `The inkwells are full, my lord; ${name ? `"${name}"` : 'new knowledge'} is on its way. Its effect starts the moment it’s done; the scholars’ smugness, rather sooner.`,
        ),
        L(
          `${name ? `"${name}" ` : 'Yeni araştırma '}başladı, lordum. Bu fikri aslında ben vermiştim; âlimler biraz daha uzun kelimelerle yazdı, o kadar.`,
          `${name ? `"${name}"` : 'New research'} has begun, my lord. It was my idea, really; the scholars merely wrote it down in longer words.`,
        ),
      ])
    }
    case 'tax':
      return c.tax === 'low'
        ? any([
            L(
              'Vergi indi, lordum. Meydanda adınıza türkü yakıyorlar; hazinedar ise kendi adına ağıt yakıyor.',
              'Taxes are lowered, my lord. They’re singing ballads to your name in the square; the treasurer is singing a dirge to his own.',
            ),
            L(
              'Halk rahat bir nefes aldı, lordum. Hazine biraz zayıflar ama gönüller semirir; gönülden vergi alınmıyor, ne yazık.',
              'The people breathe easier, my lord. The treasury grows a little thinner but hearts grow fat; sadly, one cannot tax a heart.',
            ),
            L(
              'Düşük vergi, lordum! Köylüler şapkalarını havaya attı; birinin şapkası hâlâ inmedi, karga kaptı galiba.',
              'Low taxes, my lord! The villagers threw their hats in the air; one hat still hasn’t come down, I think a crow took it.',
            ),
            L(
              'Tahsildarlar evlerine döndü, lordum; ilk kez bir tahsildarın gülümsediğini gördüm. Korkutucu bir manzaraydı.',
              'The tax collectors have gone home, my lord; for the first time I saw one smile. A frightening sight.',
            ),
            L(
              'Vergiyi hafiflettiniz, lordum. Mutlu halk çabuk büyür; hazine de sonra büyür, çok sonra, sabırla.',
              'You’ve eased the tax, my lord. A happy people grows quickly; the treasury grows later, much later, with patience.',
            ),
            L(
              'Çarşıda sizin için dua ediyorlar, lordum. Hazinedarın duası biraz farklı; içinde sizin adınız ve birkaç ağır kelime var.',
              'They’re praying for you in the market, my lord. The treasurer’s prayer is a little different; it has your name in it and several heavy words.',
            ),
          ])
        : c.tax === 'normal'
          ? any([
              L(
                'Vergi olağan düzene döndü, lordum. Kimse sevinmedi, kimse kızmadı; iyi vergi böyle bir şeydir, sıkıcı.',
                'Taxes are back to normal, my lord. Nobody cheered, nobody fumed; that is what a good tax is like: dull.',
              ),
              L(
                'Olağan vergi, lordum: halk söylenir ama öder, hazinedar söylenir ama yetinir. Herkes söyleniyor; denge budur.',
                'Normal taxes, my lord: the people grumble but pay, the treasurer grumbles but makes do. Everyone grumbles; that’s balance.',
              ),
              L(
                'Vergi ortaya oturdu, lordum. Ne türkü yakan var ne taş atan; ben bu sessizliğe bayılırım, kimse beni çağırmıyor.',
                'The tax sits in the middle, my lord. No ballads, no stones; I adore this quiet, nobody sends for me.',
              ),
              L(
                'Tahsildarlar eski tarifeyi çıkardı, lordum. Köylüler de eski şikâyetlerini; ikisi de tozlanmış ama hâlâ çalışıyor.',
                'The collectors have dug out the old rates, my lord. And the villagers, their old complaints; both are dusty, but both still work.',
              ),
              L(
                'Altın orta karar akacak, lordum; halkın gönlü de orta karar. Kırk yıllık tecrübeme göre orta karar olan her şey uzun yaşar; ben de öyleyim.',
                'Gold will flow moderately, my lord; and the people’s mood will be moderate too. In my forty years’ experience, everything moderate lives long; I am the proof.',
              ),
              L(
                'Vergi normale döndü, lordum. Hazinedar "hm" dedi; ondan duyduğum en coşkulu söz.',
                'Taxes are back to normal, my lord. The treasurer said "hm"; the most enthusiastic word I’ve ever had from him.',
              ),
            ])
          : c.tax === 'high'
            ? any([
                L(
                  'Vergi arttı, lordum. Hazine dolacak; çarşıda yüzler asıldı, ama asık yüzden vergi almıyoruz, şimdilik.',
                  'Taxes are up, my lord. The treasury will fill; faces in the market have fallen, but we don’t tax long faces. Yet.',
                ),
                L(
                  'Tahsildarlar yola çıktı, lordum. Kapılar biraz daha geç açılacak, köpekler biraz daha erken havlayacak.',
                  'The tax collectors are on the road, my lord. Doors will open a little later, and dogs will bark a little sooner.',
                ),
                L(
                  'Yüksek vergi, lordum. Hazinedar dans ediyor, köylüler etmiyor. Bir kraliçe ya da tapınak bu yükü hafifletir; dansı değil, yükü.',
                  'High taxes, my lord. The treasurer is dancing, the villagers are not. A queen or a temple would lighten the burden; not the dancing, the burden.',
                ),
                L(
                  'Keseler hafifleyecek, lordum; halkın keyfi de. Mutluluğa göz kulak olun; ben kulak olurum, gözlerim artık pek görmüyor.',
                  'Purses will grow lighter, my lord, and so will spirits. Keep an eye on happiness; I’ll keep an ear on it, my eyes aren’t what they were.',
                ),
                L(
                  'Vergi arttı, lordum. Bir köylü bana "bu da geçer" dedi; geçmezse göç edeceğini de ekledi, çok kibar bir tehditti.',
                  'Taxes are up, my lord. A villager told me "this too shall pass"; and added that if it doesn’t, he will. A very polite threat.',
                ),
                L(
                  'Tahsildarlara yeni defterler dağıttım, lordum; eskileri yetmeyecek. Halk sesini çıkarmıyor; dişlerini sıkmaktan çıkaramıyor.',
                  'I’ve handed the collectors new ledgers, my lord; the old ones won’t suffice. The people say nothing; they can’t, their teeth are clenched.',
                ),
              ])
            : any([
                L(
                  'Ağır vergi, lordum… Hazine dolar ama halk homurdanıyor. Tapınakta bir vaaz iyi gelir; rahibe ben de bir iki laf fısıldarım.',
                  'Crushing taxes, my lord… The treasury fills but the people growl. A sermon at the temple would help; I’ll whisper a word or two to the priest myself.',
                ),
                L(
                  'Ağır vergi ilan edildi, lordum. Bazı aileler eşyalarını topluyor; göç başlamadan bir şenlik düşünün derim. Ya da en azından bir pasta.',
                  'Crushing taxes have been proclaimed, my lord. Some families are packing; I’d think of a festival before they leave. Or at least a cake.',
                ),
                L(
                  'Ağır vergi, lordum. Tahsildarlar artık kapıyı çalmıyor, kırıyor; marangozlar da tamir ediyor. Ekonomi canlandı diyebiliriz.',
                  'Crushing taxes, my lord. The collectors no longer knock on doors, they break them; and the carpenters mend them. One might say the economy is booming.',
                ),
                L(
                  'Hazineye altın yağacak, lordum; ama yağmurdan sonra sel gelir. Mutsuz halk büyümez, göç eder; giderken kapıyı da kapatmaz.',
                  'Gold will rain into the treasury, my lord; but after rain comes the flood. An unhappy people doesn’t grow, it leaves; and doesn’t shut the door behind it.',
                ),
                L(
                  'Ağır vergi duyuldu, lordum; meydandaki türkünün sözleri bir gecede değişti. Size okumayacağım, kafiyeleri de berbat.',
                  'Word of the crushing tax is out, my lord; the song in the square changed its words overnight. I shan’t recite it to you; the rhymes are dreadful too.',
                ),
                L(
                  'Bu vergiyle hazine şişer, halk incelir, lordum. Uzun sürerse bir vaaz, bir şenlik ya da ikisi birden gerekecek; bir de bana yeni bir zırh.',
                  'With this tax the treasury swells and the people waste away, my lord. If it lasts we’ll need a sermon, a festival, or both; and new armour for me.',
                ),
              ])
    case 'nightShift':
      return c.on
        ? any([
            L(
              'Gece mesaisi başladı, lordum. Fenerler yandı, çekiçler susmuyor; halk yorgun düşecek, ben de uykusuz.',
              'The night shift has begun, my lord. Lanterns lit, hammers ringing; the people will grow weary, and I sleepless.',
            ),
            L(
              'Atölyeler gece de çalışıyor, lordum. Üretim artar, yorgunluk da; ikisinden hangisinin daha hızlı arttığını sabah görürüz.',
              'The workshops run through the night, my lord. Output rises, and so does weariness; we’ll see in the morning which rises faster.',
            ),
            L(
              'Gece mesaisi, lordum: ay da çalışıyor artık, üstelik maaşsız. Ona bir şey demeyin, sendikalaşmasın.',
              'Night shift, my lord: even the moon is working now, and unpaid at that. Don’t mention it to her, or she’ll form a guild.',
            ),
            L(
              'Kandiller yandı, lordum; oduncu baltayı karanlıkta sallıyor. Parmaklarına dua edelim; sayıyı sabah kontrol ederim.',
              'The lamps are lit, my lord; the woodcutter swings his axe in the dark. Let us pray for his fingers; I’ll count them in the morning.',
            ),
            L(
              'Gece de üretim var, lordum, ama mutluluk biraz düşer ve yorgunluk birikir. Köylüler esnerken üretiyor; ben esnerken bile yorulurum.',
              'We produce at night too, my lord, but happiness dips a little and weariness piles up. The villagers produce while yawning; I get tired just yawning.',
            ),
            L(
              'Horozlar şaşırdı, lordum; ne zaman öteceklerini bilmiyorlar. Köylüler de ne zaman uyuyacaklarını. Bir tek ben biliyorum: hiç.',
              'The roosters are confused, my lord; they don’t know when to crow. Nor do the villagers know when to sleep. Only I know: never.',
            ),
          ])
        : any([
            L(
              'Gece mesaisi bitti, lordum. Halk sonunda uyuyabilecek; ben de, siz yeni bir emir vermezseniz.',
              'The night shift is over, my lord. The people can finally sleep; so can I, unless you issue a new order.',
            ),
            L(
              'Fenerler söndü, lordum. Köylüler yataklarına koştu; biri yolda uyuyakaldı, üstüne battaniye örttüm. Faturasını hazineye yazdım.',
              'The lanterns are out, my lord. The villagers ran to their beds; one fell asleep on the way, so I covered him with a blanket. I billed the treasury.',
            ),
            L(
              'Gece yine gece oldu, lordum. Yorgunluk yavaşça geçer; gündüz üretimi de toparlanır, horozlar da.',
              'Night is night again, my lord. Weariness fades slowly; daytime output recovers, and so do the roosters.',
            ),
            L(
              'Atölyeler kapandı, lordum. Duyduğunuz o gürültü halkın horlaması; çekiçten daha yüksek, ama daha ucuz.',
              'The workshops are shut, my lord. That racket you hear is the people snoring; louder than the hammers, but cheaper.',
            ),
            L(
              'Gece mesaisine son verdiniz, lordum. Halk adınıza şükür etti, sonra cümlenin ortasında uyudu.',
              'You’ve ended the night shift, my lord. The people gave thanks in your name, then fell asleep mid-sentence.',
            ),
            L(
              'Çekiçler sustu, lordum. Bu gece sarayda yalnızca benim sesim duyulacak; korkmayın, kısık konuşurum. Uzun ama kısık.',
              'The hammers are silent, my lord. Tonight only my voice will be heard in the palace; fear not, I’ll speak softly. At length, but softly.',
            ),
          ])
    case 'queen':
      return any([
        L(
          'Saraya kraliçe geldi, lordum! Çanlar çalıyor, halk sokaklarda. Hanedanınız artık sürecek; benim işim de, şükür.',
          'A queen has come to the palace, my lord! Bells ringing, people in the streets. Your dynasty will go on now; and so will my job, thank heavens.',
        ),
        L(
          'Kraliçeniz saraya adım attı, lordum. Saray birden daha aydınlık oldu; mutfak daha kalabalık, benim odam daha küçük.',
          'Your queen has set foot in the palace, my lord. It’s suddenly brighter; the kitchen busier, my room smaller.',
        ),
        L(
          'Kraliçe geldi, lordum! İlk işi perdeleri değiştirmek oldu; ikinci işi beni baştan aşağı süzmek. Üçüncü işinden korkuyorum.',
          'The queen has arrived, my lord! Her first act was to change the curtains; her second, to look me up and down. I dread her third.',
        ),
        L(
          'Saray kapısına çiçekler serildi, lordum. Kraliçe yürürken halk alkışladı; ben de alkışladım, en yüksek sesle, görsün diye.',
          'Flowers were strewn before the palace gate, my lord. The people cheered as the queen walked; I cheered too, loudest of all, so she’d notice.',
        ),
        L(
          'Tahtın öbür yarısı nihayet doldu, lordum. Halkın mutluluğu da arttı, hanedanın umudu da; hazinedarın endişesi de, terzi faturalarından.',
          'The other half of the throne is filled at last, my lord. The people’s happiness is up, the dynasty’s hopes too; and the treasurer’s worries, over the tailor’s bills.',
        ),
        L(
          'Kraliçeniz geldi, lordum; yanında üç sandık elbise ve bir kedi. Kedi beni sevmedi. Kraliçe henüz karar vermedi.',
          'Your queen has arrived, my lord, with three chests of gowns and a cat. The cat does not like me. The queen has yet to decide.',
        ),
      ])
    case 'train': {
      const unit = UNIT_NAMES[c.unit as keyof typeof UNIT_NAMES]
      const u = unit ? lower(unit) : L('asker', 'soldier')
      const n = Number(c.count) || 0
      return any([
        L(
          `Kışlada ${n || ''} ${u} talime başladı, lordum. Çavuşun sesi saraydan duyuluyor; kraliçenin kedisi bile hazırol duruşuna geçti.`,
          `${n ? `${n} ` : ''}${u} recruits have begun drilling at the barracks, my lord. The sergeant can be heard from the palace; even the queen’s cat stood to attention.`,
        ),
        L(
          `Gençler yazıldı, lordum; ${u} olacaklar. Anneleri ağlıyor, çavuş gülüyor; çavuşun güldüğü pek görülmez, iyiye işaret değil.`,
          `The young men have signed up, my lord; they’ll be ${u} troops. Their mothers weep, the sergeant smiles; the sergeant rarely smiles, which is not a good sign.`,
        ),
        L(
          `${n ? `${n} ` : ''}${u} adayı kışlanın kapısından girdi, lordum. Çıktıklarında ayrı insanlar olacaklar; daha az uykulu, daha çok bağıran.`,
          `${n ? `${n} ` : ''}${u} recruits have walked through the barracks gate, my lord. They’ll come out different men; less sleepy, much louder.`,
        ),
        L(
          `Talim meydanında toz duman, lordum. ${unit ? `${unit} adayları` : 'Adaylar'} ilk gün bol bol düştü; ikinci gün daha az düşecekler, üçüncü gün çavuşu düşürecekler.`,
          `Dust and smoke on the drill ground, my lord. The ${unit ? `${u} ` : ''}recruits fell over plenty on day one; on day two they’ll fall less, and on day three they’ll knock the sergeant over.`,
        ),
        L(
          `Çavuş yeni ${u} adaylarına "lordunuz sizi izliyor" dedi, lordum. Hepsi dimdik durdu; bir an ben de durdum, belim itiraz etti.`,
          `The sergeant told the new ${u} recruits "your lord is watching," my lord. They all stood bolt upright; for a moment so did I, and my back objected.`,
        ),
        L(
          `Kışla yeniden kalabalık, lordum: ${n ? `${n} ` : ''}${u} yetişiyor. Maaşları ve yemekleri her tur hazineden çıkacak; askerlerin iştahını hesaba katmadan söylüyorum.`,
          `The barracks are crowded again, my lord: ${n ? `${n} ` : ''}${u} troops in training. Their pay and food come out of the treasury every round; and that’s before counting a soldier’s appetite.`,
        ),
      ])
    }
    case 'disband': {
      const n = unitsOf(c.units)
      return any([
        L(
          'Askerler evlerine döndü, lordum. Tarlalar sevinecek, analar sevinecek; maalesef düşmanlarımız da.',
          'The soldiers have gone home, my lord. The fields will rejoice, the mothers will rejoice; and, alas, so will our enemies.',
        ),
        L(
          `${n ? `${n} asker ` : 'Askerler '}kılıcını asıp çapasını aldı, lordum. Maaş gideri azaldı; tarlada kılıç sallayanı görürsem uyarırım.`,
          `${n ? `${n} soldier${n === 1 ? ' has' : 's have'} ` : 'The soldiers have '}hung up the sword and picked up the hoe, my lord. Wages are down; if I see anyone swinging a sword in the fields, I’ll have a word.`,
        ),
        L(
          'Terhis edilenler köylerine dağıldı, lordum. Biri giderken çavuşa el salladı; çavuş da salladı, ama bir parmağıyla.',
          'The discharged men have scattered to their villages, my lord. One waved to the sergeant on his way out; the sergeant waved back, with one finger.',
        ),
        L(
          'Askerler köylü oldu, lordum. Eğitimin bedeli geri gelmez, ama artık her tur maaş da gitmez. Hazinedar bunu duyunca yanağımdan öptü; tuhaf bir gündü.',
          'The soldiers are villagers again, my lord. The cost of their training won’t come back, but no more wages go out each round. The treasurer kissed my cheek when he heard; a strange day.',
        ),
        L(
          'Kışla biraz boşaldı, lordum. Analar sevindi; komşu lordun casusu da not aldı. Ona ben söylemedim, yemin ederim, bu sefer değil.',
          'The barracks are a little emptier, my lord. The mothers are glad; the neighbouring lord’s spy took notes. I didn’t tell him, I swear, not this time.',
        ),
        L(
          `Garnizondan ${n ? `${n} kişi ` : 'birkaç kişi '}eve döndü, lordum. Kılıçları cephaneliğe, kendileri tarlaya, hikâyeleri meyhaneye.`,
          `${n ? `${n} m${n === 1 ? 'an' : 'en'}` : 'A few men'} from the garrison went home, my lord. Their swords to the armoury, themselves to the fields, their stories to the tavern.`,
        ),
      ])
    }
    case 'expedition': {
      if (c.action === 'recall')
        return any([
          L(
            'Atlı haberci kafilenin peşinden yola çıktı, lordum. Eli boş dönecekler ama sağ dönecekler; eli boş olmaları da taşımayı kolaylaştırır.',
            'A rider has gone after the party, my lord. They’ll come back empty-handed but alive; and empty hands are easier to carry.',
          ),
          L(
            'Kafileyi geri çağırdınız, lordum. Erzak gitti ama adamlar gelecek; insan erzaktan değerlidir, çoğu zaman.',
            'You’ve recalled the party, my lord. The provisions are gone, but the men will return; people are worth more than provisions, most of the time.',
          ),
          L(
            'Ulak dörtnala çıktı, lordum. "Dönün" diye bağıracak; umarım kafile "duyamadık" deyip yürümeye devam etmez. Ben gençken bunu çok yapardım.',
            'The messenger is off at a gallop, my lord. He’ll shout "turn back"; I hope the party doesn’t say "didn’t hear you" and keep walking. I did that a lot in my youth.',
          ),
          L(
            'Sefer yarıda kaldı, lordum. Hikâyeleri kısa olacak, ganimetleri hiç olmayacak; abartıları ise her zamanki kadar uzun.',
            'The expedition is cut short, my lord. Their stories will be short, their spoils nonexistent; their exaggerations as long as ever.',
          ),
          L(
            'Kafile geri dönüyor, lordum. Bazen en akıllıca yolculuk yarıda kesilendir; bunu dizlerim söylüyor, ben de katılıyorum.',
            'The party is turning back, my lord. Sometimes the wisest journey is the one cut short; so say my knees, and I agree.',
          ),
          L(
            'Geri çağırma emri yolda, lordum. Seferciler homurdanacak; homurdanan sefercinin sağ olduğu bellidir, bu iyi haber.',
            'The recall order is on its way, my lord. The travellers will grumble; a grumbling traveller is clearly alive, which is good news.',
          ),
        ])
      const name = EXPEDITION_TEXTS[c.kind as string]?.name
      const v = Number(c.villagers) || 0
      const guard = unitsOf(c.escort)
      return any([
        L(
          `${name ?? 'Kafile'} yola çıktı, lordum. Arkalarından su döktük; gerisi yolun, şansın ve haritayı kimin tuttuğunun elinde.`,
          `${name ?? 'The party'} has set out, my lord. We poured water after them for luck; the rest is up to the road, fortune, and whoever is holding the map.`,
        ),
        L(
          'Kafile sarayın kapısından çıktı, lordum. Döndüklerinde anlatacak çok şeyleri olacak; umarım taşıyacak çok şeyleri de.',
          'The party has left the palace gate, my lord. They’ll have much to tell when they return; and, I hope, much to carry.',
        ),
        L(
          `${v ? `${v} köylü` : 'Köylüler'}${guard ? `, yanlarında ${guard} muhafız,` : ''} yola düştü, lordum. Azıkları sırtlarında, umutları gözlerinde, ayakkabıları da maalesef ayaklarında değil, birkaçının.`,
          `${v ? `${v} villager${v === 1 ? '' : 's'}` : 'The villagers'}${guard ? `, with ${guard} guard${guard === 1 ? '' : 's'},` : ''} took to the road, my lord. Provisions on their backs, hope in their eyes, and shoes, alas, not on their feet; a few of them, anyway.`,
        ),
        L(
          `${name ?? 'Sefer'} başladı, lordum. Onlara bir harita verdim; bu sefer ters tutmadıklarından emin oldum. İki kez.`,
          `${name ?? 'The expedition'} has begun, my lord. I gave them a map; this time I made sure they weren’t holding it upside down. Twice.`,
        ),
        L(
          `Kafile ufukta küçüldü, lordum. ${guard ? 'Muhafızlar önde, köylüler arkada; köylüler muhafızların kaçtığı yöne bakmayı öğrendi.' : 'Muhafızsız gittiler; yol uzun, dualarımız onlarla, ama dualar kılıç sallamaz.'}`,
          `The party has shrunk to a speck on the horizon, my lord. ${guard ? 'Guards in front, villagers behind; the villagers have learned to watch which way the guards run.' : 'They went without guards; the road is long and our prayers go with them, but prayers don’t swing swords.'}`,
        ),
        L(
          'Seferciler uğurlandı, lordum. Döndüklerinde "Sen yokken" raporuna bir sayfa daha eklenir; ben de dinlemeye hazırım, yalanları ayıklamaya da.',
          'We’ve seen the travellers off, my lord. When they return, the "While you were away" report gains another page; I’m ready to listen, and to sift out the lies.',
        ),
      ])
    }
    case 'steward':
      return c.on
        ? any([
            L(
              'Kâhya göreve başladı, lordum. Siz yokken bir felaket gelirse köylüleri o toplar; ücretini de unutmaz, hiç unutmaz.',
              'The steward has taken up his post, my lord. If disaster strikes while you’re away, he’ll rally the villagers; nor will he forget his fee, ever.',
            ),
            L(
              'Kâhya anahtarları beline taktı, lordum. Yangında, selde köylüleri o seferber edecek; her seferinde de kesesini uzatacak, alışkanlıkla.',
              'The steward has hung the keys on his belt, my lord. In fire and flood he’ll muster the villagers; and every time he’ll hold out his purse, out of habit.',
            ),
            L(
              'Artık bir kâhyamız var, lordum. Ciddi bir adam; güldüğünü hiç görmedim. Felaketlerde de gülmezse iyi olur.',
              'We have a steward now, my lord. A serious man; I’ve never seen him laugh. Just as well if he doesn’t laugh during disasters either.',
            ),
            L(
              'Kâhya işe başladı, lordum. Siz uyurken o nöbette; ben de uyurken, açıkçası. Birimizin uyanık olması yeter.',
              'The steward is at work, my lord. While you sleep, he keeps watch; while I sleep too, frankly. One of us awake is enough.',
            ),
            L(
              'Kâhyaya yetki verdiniz, lordum. Cevapsız kalan krizlerde köylüleri o toplar; hazinede altın kalsın ki işini yapabilsin. Bedavaya yangın söndürmüyor.',
              'You’ve given the steward authority, my lord. In crises nobody answers, he rallies the villagers; keep some gold in the treasury so he can do it. He doesn’t put out fires for free.',
            ),
            L(
              'Kâhya yeminini etti, lordum: "Ambarı korurum, ücretimi alırım." Ömrümde duyduğum en dürüst yemin; biraz da kıskandım.',
              'The steward has sworn his oath, my lord: "I guard the stores, I take my fee." The most honest oath I’ve ever heard; I was a little jealous.',
            ),
          ])
        : any([
            L(
              'Kâhyayı görevden aldınız, lordum. Artık felaketlerde karar yine sizin; ben de yine yanınızda, arka sırada.',
              'You’ve dismissed the steward, my lord. Disasters are your call again; and I’m at your side again, in the back row.',
            ),
            L(
              'Kâhya anahtarları bıraktı, lordum. Bundan sonra krizleri siz karşılayacaksınız; ben de yanınızda olurum, güvenli bir mesafeden.',
              'The steward has handed back the keys, my lord. From now on you’ll face the crises; I’ll be beside you, at a safe distance.',
            ),
            L(
              'Kâhya gitti, lordum. Ücreti hazinede kalacak; felaketler ise doğrudan bizim başımıza. Ucuz ama heyecanlı.',
              'The steward is gone, my lord. His fee stays in the treasury; the disasters land straight on our heads. Cheap, but exciting.',
            ),
            L(
              'Kâhyamız emekli oldu, lordum. Giderken bana "kolay gelsin" dedi; ne demek istediğini şimdi anlıyorum ve hiç hoşuma gitmedi.',
              'Our steward has retired, my lord. On his way out he said to me "good luck with it"; I now understand what he meant, and I don’t like it one bit.',
            ),
            L(
              'Kâhyalık kaldırıldı, lordum. Siz yokken gelen bir kriz cevapsız kalırsa olduğu gibi yaşanır; ben de olduğu gibi anlatırım.',
              'The stewardship is abolished, my lord. A crisis that comes while you’re away and goes unanswered will play out in full; and I’ll tell it to you in full.',
            ),
            L(
              'Kâhya eşyalarını topladı, lordum. Masasını bana bıraktı; çekmecesinde yarım bir elma ve bizim hakkımızda uzun bir liste vardı.',
              'The steward has packed his things, my lord. He left me his desk; in the drawer were half an apple and a long list about us.',
            ),
          ])
    case 'swear':
      return any([
        L(
          'Biat ettiniz, lordum. Artık bir tacın lordusunuz: devriyeleri sizi kollar, rakip tacın haraççıları da kesenizi kollar.',
          'You’ve sworn fealty, my lord. You are now a crown’s lord: its patrols watch over you, and the rival crown’s tribute collectors watch over your purse.',
        ),
        L(
          'Diz çöktünüz, lordum, ama başınız dik. Tacın sancağı artık adınızın yanında; sezon boyunca değişmez, beğenmesek de.',
          'You knelt, my lord, but with your head held high. The crown’s banner now stands beside your name; it won’t change all season, like it or not.',
        ),
        L(
          'Biat yemini edildi, lordum. Tacın ulağı mühürlü belgeyi aldı; ben de mühür kuruyana kadar başında bekledim, kimse üflemesin diye.',
          'The oath of fealty is sworn, my lord. The crown’s courier took the sealed document; I stood over it until the wax dried, so nobody would blow on it.',
        ),
        L(
          'Artık bir tacın lordusunuz, lordum. Sarayın ikinci katına giden yol açıldı; rakip taç da tebrik yerine haraççılarını gönderecek, adetleri öyle.',
          'You are a crown’s lord now, my lord. The way to the palace’s second level is open; and instead of congratulations the rival crown will send its tribute collectors. It’s their custom.',
        ),
        L(
          'Tacınız sizi lordları arasına yazdı, lordum. Devriyeleri dost; rakip tacın haraççıları ise yarım saatte bir uğrayan, hiç gitmeyen misafir.',
          'Your crown has entered you on the roll of its lords, my lord. Its patrols are friends; the rival crown’s tribute collectors are guests who call every half hour and never leave.',
        ),
        L(
          'Biat ettiniz, lordum. Halk yeni sancağı alkışlıyor; ozan da renklerine uyan bir kafiye arıyor. Kızıl zor, lacivert daha zor.',
          'You’ve sworn fealty, my lord. The people cheer the new banner; the minstrel is hunting for a rhyme to match its colours. Crimson is hard, navy harder.',
        ),
      ])
    case 'repairWalls':
      return any([
        L(
          'Duvarcılar iskeleye çıktı, lordum. Yıkık surlar ayağa kalkıyor; ben kalkarken bu kadar ses çıkarmıyorum, o da bir şey.',
          'The masons are up on the scaffolding, my lord. The ruined walls are getting back on their feet; I make less noise when I get up, which is something.',
        ),
        L(
          'Harç karılıyor, taşlar yontuluyor, lordum. Düşmanın açtığı gedikler kapanacak; düşmanın ağzı da, umarım.',
          'Mortar is being mixed and stones dressed, my lord. The breaches the enemy made will be closed; and the enemy’s mouth too, I hope.',
        ),
        L(
          'Surlar onarılıyor, lordum. Ustabaşı "eskisinden sağlam olacak" dedi; ustabaşları hep böyle der, ama bu sefer yüzüme bakarak söyledi.',
          'The walls are being repaired, my lord. The foreman said "it’ll be stronger than before"; foremen always say that, but this time he looked me in the eye.',
        ),
        L(
          'Yıkık burçlara iskele kuruldu, lordum. Bir sonraki kuşatmada bu taşlar düşmana diş gösterecek; benim dişlerimden daha sağlam olduklarına eminim.',
          'Scaffolding is up on the ruined bastions, my lord. At the next siege these stones will bare their teeth at the enemy; sturdier than my teeth, I’m sure.',
        ),
        L(
          'Duvarcıların çekiçleri çalışıyor, lordum. Halk surların yükseldiğini görünce daha rahat uyuyacak; çekiçler yüzünden bu gece değil ama.',
          'The masons’ hammers are busy, my lord. Seeing the walls rise, the people will sleep easier; though not tonight, because of the hammers.',
        ),
        L(
          'Gedikler kapanıyor, lordum. Kapıdan başka yerden girmek isteyen artık kanat takmalı; takarsa da kulelerimiz var.',
          'The breaches are closing, my lord. Anyone wanting in by any way but the gate will need wings now; and if he grows them, we have towers.',
        ),
      ])
    case 'repairTrade':
      return any([
        L(
          'Ticaret noktası onarıldı, lordum. Tüccarımız develerini yeniden yükledi; develer bu habere pek sevinmedi.',
          'The trading post is repaired, my lord. Our merchant has loaded his camels again; the camels were not thrilled by the news.',
        ),
        L(
          'Yanık tezgâhlar söküldü, yenileri çakıldı, lordum. Tüccar yeniden sefere çıkabilir; is kokusu kalan tek şey benim cübbem.',
          'The burnt stalls are torn out and new ones nailed up, my lord. The merchant can set out again; the only thing still smelling of soot is my robe.',
        ),
        L(
          'Ticaret noktası ayağa kalktı, lordum. Deve bile sevindi; ilk kez yanımdan tükürmeden geçti. Belki de hedef şaşırdı.',
          'The trading post is back on its feet, my lord. Even the camel was pleased; for the first time it passed me without spitting. Or perhaps it missed.',
        ),
        L(
          'Onarım bitti, lordum. Haritada artık yanık bir enkaz değil, gıcır gıcır bir ticaret noktası var. Rakipler bunu görünce yüzleri yanacak, sıra onlarda.',
          'The repairs are done, my lord. Instead of a charred ruin the map now shows a spotless trading post. Our rivals will burn with envy; their turn to burn.',
        ),
        L(
          'Tüccar yeni tentesinin altında el ovuşturuyor, lordum. Satış yeniden başlıyor; bir dahaki yağmacıya da indirim yapmamasını tembihledim.',
          'The merchant is rubbing his hands under his new awning, my lord. Trade resumes; I’ve told him not to give the next bandit a discount.',
        ),
        L(
          'Ticaret noktasının dumanı tütmüyor artık, lordum. Yağmacılar bir daha gelirse bu kez yanına bir gözcü kulesi koyalım; tüccarın duası yetmiyor.',
          'The trading post no longer smokes, my lord. If bandits come again, let’s put a watchtower beside it this time; the merchant’s prayers aren’t enough.',
        ),
      ])
    case 'releaseTown':
      return any([
        L(
          'Kasabayı serbest bıraktınız, lordum. Kasabalılar şaşkın ama memnun; hazinemiz de bakımdan kurtuldu. Herkes mutlu, vali hariç.',
          'You’ve released the town, my lord. The townsfolk are bewildered but pleased; and our treasury is spared the upkeep. Everyone’s happy, except the governor.',
        ),
        L(
          'Kasabanın anahtarlarını geri verdik, lordum. Ötekiler rahatladı; çok kasaba, çok baş ağrısıdır. Benim başım zaten ağrıyordu.',
          'We’ve handed back the town’s keys, my lord. The others breathe easier; many towns, many headaches. My head was aching anyway.',
        ),
        L(
          'Sancağımız kasabanın burcundan indirildi, lordum. Kasabalılar el salladı; vedalaşma mı sevinç mi, emin olamadım. Galiba ikincisi.',
          'Our banner has come down from the town’s tower, my lord. The townsfolk waved; farewell or delight, I couldn’t tell. Probably the latter.',
        ),
        L(
          'Kasaba artık kimsenin değil, lordum. Küçük bir garnizon kendini korur; bize de daha az bakım, daha az isyan, daha az mektup.',
          'The town belongs to no one now, my lord. A small garrison guards it; and for us, less upkeep, fewer revolts, fewer letters.',
        ),
        L(
          'Bazen bırakmak da hükümdarlıktır, lordum. Aşırı büyüme yükü hafifledi; bu fikri size ben vermiştim, hatırlarsanız, hatırlamazsanız da.',
          'Sometimes letting go is statecraft too, my lord. The burden of overreach is lighter; that was my idea, if you recall, and even if you don’t.',
        ),
        L(
          'Kasabadan çekildik, lordum. Valinin kâtibi defterleri kapattı ve bana "şimdi ben ne yapacağım" diye sordu. Ona da bir iş buluruz; elçi yardımcılığı belki.',
          'We’ve withdrawn from the town, my lord. The governor’s clerk closed his ledgers and asked me "what do I do now?" We’ll find him something; assistant envoy, perhaps.',
        ),
      ])
    case 'quest':
      return c.action === 'claim'
        ? any([
            L(
              'Tacın ödülü geldi, lordum. Hükümdar işinizi beğenmiş; bir dahaki işi de size verecek. İyi iş yapmanın cezası budur.',
              'The crown’s reward has arrived, my lord. The ruler liked your work; you’ll get the next job too. Such is the punishment for doing well.',
            ),
            L(
              'Ödül kesesi hazineye girdi, lordum. Tacın kâtibi adınızın yanına bir yıldız çizdi; gördüm. Benim adımın yanına da bir şey çizdi, ama yıldız değildi.',
              'The purse of reward is in the treasury, my lord. The crown’s clerk drew a star beside your name; I saw it. He drew something beside mine too, but it wasn’t a star.',
            ),
            L(
              'Tacın ödülünü aldık, lordum. Altını sayarken tacın gülümsemesini de saydım; ikisi de fena değil, altın biraz daha ağır.',
              'We have the crown’s reward, my lord. Counting the gold, I counted the crown’s smile too; both are respectable, the gold slightly heavier.',
            ),
            L(
              'Görevin karşılığı geldi, lordum. Taçla ilişkimiz biraz daha ısındı; kışın bu sıcaklık işe yarar, odun parası da düşer.',
              'The task has paid off, my lord. Our relations with the crown are a little warmer; handy in winter, saves on firewood.',
            ),
            L(
              'Ulak keseyi uzatırken eğildi, lordum. Eskiden eğilmezdi; demek ki adınız sarayda konuşuluyor. Ya da beli tutuldu.',
              'The courier bowed as he handed over the purse, my lord. He never used to bow; so your name is being spoken at court. Or his back went.',
            ),
            L(
              'Ödül alındı, lordum. Hükümdar "bu lord iş bilir" demiş; kulağıma öyle geldi, ben de biraz cilalayıp size getirdim.',
              'The reward is claimed, my lord. The ruler is said to have remarked "this lord knows his business"; that’s what reached my ear, and I’ve polished it a little for you.',
            ),
          ])
        : any([
            L(
              'Tacın işini üstlendiniz, lordum. Saat dolmadan bitirelim; taçlar beklemeyi sevmez, beklemeyi sevenler de taç olamaz.',
              'You’ve taken on the crown’s task, my lord. Let’s finish before the hour is out; crowns don’t like to wait, and those who like waiting never become crowns.',
            ),
            L(
              'Görevi aldık, lordum. Tacın ulağı gözlerini kısıp "bakalım" dedi; gösterelim ona, gözlerini açsın.',
              'We’ve accepted the task, my lord. The crown’s courier narrowed his eyes and said "we’ll see"; let’s show him, and open those eyes.',
            ),
            L(
              'Söz verildi, lordum. Taç işini zamanında bitirene cömert davranır; geç kalana omuz silker, omuzları da çok geniştir.',
              'The promise is made, my lord. The crown is generous to those who finish on time; to latecomers it shrugs, and it has very broad shoulders.',
            ),
            L(
              'Tacın isteği defterimizde, lordum. Saatin kumu akıyor; ben şimdiden telaşlandım, siz telaşlanmayın, ikimize yeter.',
              'The crown’s request is in our ledger, my lord. The sand is running; I’m already in a flap, so you needn’t be, mine is enough for two.',
            ),
            L(
              'İşe giriştik, lordum. Görevler kutusunda ilerlemesini görürsünüz; ben de her yarım saatte bir hatırlatırım, sevmeseniz de.',
              'We’re on it, my lord. You’ll see its progress in the Tasks box; and I’ll remind you every half hour, whether you like it or not.',
            ),
            L(
              'Tacın görevini üstlendiniz, lordum. Bitirirsek altın ve gönül; bitiremezsek yalnızca utanç, o da nasılsa benim payıma düşer.',
              'You’ve taken on the crown’s task, my lord. If we finish: gold and favour; if not: only shame, and that somehow always falls to me.',
            ),
          ])
    case 'royal':
      return c.action === 'deliver'
        ? any([
            L(
              'Kraliyet elçisi istediklerini aldı, lordum. Arabalar saraya gidiyor; hükümdar sizi anacak, belki adınızı da doğru söyler.',
              'The royal envoy has what he asked for, my lord. The carts are bound for the palace; the ruler will remember you, and may even pronounce your name correctly.',
            ),
            L(
              'Teslimat tamam, lordum. Kraliyet elçisi sandıkları saydı, iki kez saydı ve sonunda gülümsedi. Meslektaşımdır, gülümsemesinin ne kadar zor çıktığını bilirim.',
              'Delivery complete, my lord. The royal envoy counted the chests, counted them twice, and at last smiled. He’s a colleague; I know how hard that smile came.',
            ),
            L(
              'Söz tutuldu, lordum. Tacın kâtibi "zamanında" yazdı; sarayda bu kelime çok nadir yazılır, mürekkebi bile şaşırdı.',
              'Promise kept, my lord. The crown’s clerk wrote "on time"; that word is so rarely written at court that even the ink was surprised.',
            ),
            L(
              'Mallar yola çıktı, karşılığı hazineye girdi, lordum. Asıl kazanç tacın gözünde; görünmez ama işe yarar, tıpkı benim gibi.',
              'The goods are off and the payment is in the treasury, my lord. The real gain is in the crown’s eyes; invisible but useful, just like me.',
            ),
            L(
              'Kraliyet elçisi atına binerken bana göz kırptı, lordum. Bir lütuf mu yoksa göz kayması mı, emin değilim; ben de karşılık olarak öksürdüm.',
              'The royal envoy winked at me as he mounted, my lord. A favour or a twitch, I can’t say; I coughed in reply.',
            ),
            L(
              'İstek yerine getirildi, lordum. Hükümdar duyunca kadehini sizin için kaldıracak; ben de suyumu. Doktor öyle dedi.',
              'The request is fulfilled, my lord. The ruler will raise a cup to you on hearing of it; I’ll raise my water. Doctor’s orders.',
            ),
          ])
        : c.action === 'accept'
          ? any([
              L(
                'Kraliyet elçisine söz verdiniz, lordum. Sözünüzü tutarsanız taç bunu unutmaz; tutmazsanız hiç unutmaz.',
                'You’ve given the royal envoy your word, my lord. Keep it and the crown won’t forget; break it and the crown will never forget.',
              ),
              L(
                'Söz verildi, lordum. Ambarı ve cephaneliği bir kollayalım; bir saat çabuk geçer, hele benim yaşımda.',
                'The word is given, my lord. Let’s keep an eye on the storehouse and the armoury; an hour flies by, especially at my age.',
              ),
              L(
                'Kraliyet elçisi "elimden geleni yaparım" sözünüzü deftere yazdı, lordum. Şimdi elimizden gerçekten bir şey gelmeli; ben ellerimi hazırladım.',
                'The royal envoy wrote your "I’ll do my best" in his ledger, my lord. Now our best had better be good; I’ve limbered up my hands.',
              ),
              L(
                'İsteği üstlendiniz, lordum. Görevler kutusunda eldeki ve istenen yazıyor; ben de parmak hesabıyla takip ediyorum, on parmağı aşarsa haber veririm.',
                'You’ve taken on the request, my lord. The Tasks box shows what we have and what’s wanted; I’m keeping count on my fingers, and will tell you if it goes past ten.',
              ),
              L(
                'Elçi memnun ayrıldı, lordum. Teslim edince taç piyasa değerinin üstünü öder; asıl kazanç yine de gönüldür, hazinedar buna inanmıyor.',
                'The envoy left content, my lord. On delivery the crown pays above market value; the real gain is still goodwill, though the treasurer doesn’t believe in it.',
              ),
              L(
                'Söz bir kere ağızdan çıktı, lordum. Şimdi işçileri, atölyeleri ve biraz da şansı çalıştırma vakti; şans en tembelidir.',
                'The word has left our lips, my lord. Now to set the workers, the workshops and a little luck to work; luck is the laziest of the lot.',
              ),
            ])
          : any([
              L(
                'Kraliyet elçisini geri çevirdiniz, lordum. Kibarca söyledim, ama yüzü öyle asıldı ki kendimi kötü hissettim; az önce geçti.',
                'You’ve turned the royal envoy away, my lord. I put it politely, but his face fell so far I felt dreadful; it passed a moment ago.',
              ),
              L(
                'Elçi "anlaşıldı" dedi, lordum; ama öyle bir "anlaşıldı" ki ben üşüdüm. Pelerinimi aldım.',
                'The envoy said "understood," my lord; but such an "understood" that I felt a chill. I fetched my cloak.',
              ),
              L(
                'Bu sefer olmaz dediniz, lordum. Taçla ilişkimiz biraz soğudu; bir sonraki isteği kaçırmayalım, yoksa buz tutar.',
                'You said "not this time," my lord. Our relations with the crown have cooled a little; let’s not miss the next request, or they’ll freeze over.',
              ),
              L(
                'Kraliyet elçisi eli boş döndü, lordum. Yolda başka bir lordun kapısını çalacak; o lord da bize dünyanın en kibar gülüşüyle bakacak.',
                'The royal envoy went back empty-handed, my lord. On the way he’ll knock on another lord’s door; and that lord will give us the politest smile in the world.',
              ),
              L(
                'Geri çevirdik, lordum. Ben elçiye bir kadeh şerbet ikram ettim; acı kalmasın diye. Şerbet de acıydı ama, aşçıya söyleyeceğim.',
                'We declined, my lord. I offered the envoy a cup of sherbet to sweeten things. The sherbet was bitter too; I’ll have a word with the cook.',
              ),
              L(
                'İstek reddedildi, lordum. Bazen hayır demek gerekir; yalnız çok sık olmasın, taçlar sayar, hem de benden iyi sayar.',
                'The request is refused, my lord. Sometimes one must say no; just not too often, crowns keep count, and they count better than I do.',
              ),
            ])
    case 'order':
      return any([
        L(
          'Kervan tacın başkentine yola çıktı, lordum. Döndüğünde keseler dolu olacak; dönmezse hikâyesi dolu olur.',
          'The caravan has set out for the crown’s capital, my lord. When it returns the purses will be full; if it doesn’t, the story will be.',
        ),
        L(
          'Develer yüklendi, lordum; tacın siparişi yolda. Ödeme kervan dönünce gelir; develer ise ödemesiz, her zamanki gibi homurdanarak gidiyor.',
          'The camels are loaded, my lord; the crown’s order is on its way. Payment comes when the caravan returns; the camels go unpaid, grumbling as ever.',
        ),
        L(
          'Sipariş kervanı uğurlandı, lordum. Önde tüccar, arkada develer, en arkada benim dualarım; dualar biraz geride kaldı.',
          'We’ve seen the order caravan off, my lord. The merchant in front, the camels behind, my prayers at the very back; the prayers are lagging a bit.',
        ),
        L(
          'Tacın istediği mallar yola düştü, lordum. Taç lobi fiyatının üstünü öder; tacın cebinden çıkan altının tadı başkadır.',
          'The goods the crown wanted are on the road, my lord. The crown pays above the going rate; gold from a crown’s pocket tastes different.',
        ),
        L(
          'Kervan kapıdan çıktı, lordum. Yolda yağmacılara benim adımı söyleyecekler; pek işe yaramaz ama en azından şöhretim yayılır.',
          'The caravan is out of the gate, my lord. If they meet bandits they’ll mention my name; it won’t help much, but at least my fame will spread.',
        ),
        L(
          'Siparişi gönderdik, lordum. Tacın kâtibi defterine bir satır daha yazacak: "Bu lord sözünün eri." Altına küçükçe "elçisi de" yazdırmaya çalışacağım.',
          'We’ve sent the order, my lord. The crown’s clerk will add a line to his ledger: "This lord keeps his word." I’ll try to have "and so does his envoy" added in small print.',
        ),
      ])
    case 'tradeInn':
      return any([
        L(
          'Tüccar artık hana gidiyor, lordum. Hancı fiyatını söyledi; pazarlık ettim, o da kızdı, sonra bana çorba ikram etti. İyi pazarlık budur.',
          'The merchant goes to the inn now, my lord. The innkeeper named his price; I haggled, he got cross, then he served me soup. That’s good haggling.',
        ),
        L(
          'Kervan hanın yolunu tuttu, lordum. Sefer pazar kadar kısa; fiyat ise hancının keyfine ve oradaki gücümüze bağlı. Hancının keyfi bugün yerinde, dişi ağrımıyor.',
          'The caravan has taken the road to the inn, my lord. The trip is as short as the market’s; the price depends on the innkeeper’s mood and our standing there. His mood is good today; no toothache.',
        ),
        L(
          'Han kapısı tüccarımıza açıldı, lordum. Oradaki payımız büyüdükçe hancı bize daha cömert davranır; küçüldükçe kapıyı yüzümüze çarpar.',
          'The inn’s door is open to our merchant, my lord. The bigger our share there, the more generous the innkeeper; the smaller, the sooner he slams the door in our face.',
        ),
        L(
          'Tüccar hana yerleşti, lordum. Yalnız dikkat: çok satarsak hancının o mala verdiği fiyat düşer. Hancılar da tüccarlar kadar kurnazdır; benden az ama.',
          'The merchant has settled in at the inn, my lord. A word of caution: sell too much and the innkeeper’s price for those goods drops. Innkeepers are as crafty as merchants; less so than me, though.',
        ),
        L(
          'Hancıyla el sıkıştık, lordum. O yöredeki kasabalarımız elimizde kaldıkça kapısı bize açık; kaybedersek, hancı bizi hiç tanımamış olur.',
          'We’ve shaken hands with the innkeeper, my lord. As long as we hold our towns nearby, his door is open to us; lose them, and he’ll never have met us.',
        ),
        L(
          'Tüccarımız handa, lordum. Lobi pazarına dokunmadan satıyoruz; fiyatları biz düşürmüyoruz, yalnız hanınkini. Hancı henüz fark etmedi.',
          'Our merchant is at the inn, my lord. We sell without touching the lobby market; we don’t drive its prices down, only the inn’s. The innkeeper hasn’t noticed yet.',
        ),
      ])
    case 'tradeCity':
      return c.city === null || c.city === undefined
        ? any([
            L(
              'Tüccar yeniden lobi pazarına dönüyor, lordum. Kısa yol, hızlı sefer, az hikâye.',
              'The merchant is going back to the lobby market, my lord. Short road, quick trips, few stories.',
            ),
            L(
              'Başkent yolu kapandı, lordum; tüccar yakın pazara dönüyor. Develer sevindi; sevinçten bir tanesi tükürmeyi bile unuttu.',
              'We’re done with the capital road, my lord; the merchant returns to the nearby market. The camels are delighted; one even forgot to spit.',
            ),
            L(
              'Tüccar eski pazarına döndü, lordum. "Uzak yol yorar" dedi; dizlerim de bu fikre canı gönülden katılıyor.',
              'The merchant is back at his old market, my lord. "Long roads are tiring," he said; my knees agree wholeheartedly.',
            ),
            L(
              'Lobi pazarı yine bizim, lordum. Seferler kısalır, ama fiyatları da biz düşürürüz; kendi ayağımıza basmayalım.',
              'The lobby market is ours again, my lord. The trips are shorter, but we drive the prices down ourselves; let’s not tread on our own toes.',
            ),
            L(
              'Tüccar yönünü değiştirdi, lordum. Pazarda tanıdık yüzler onu bekliyor; bir de tanıdık, kötü fiyatlar.',
              'The merchant has changed course, my lord. Familiar faces await him at the market; and familiar, bad prices.',
            ),
            L(
              'Yakın pazara dönüldü, lordum. İki dakika yeniden değiştiremeyiz; deve kafa karışıklığını sevmez, bir kere ters yöne yürüdü, ikna etmesi saatler sürdü.',
              'Back to the nearby market, my lord. We can’t change it again for two minutes; camels hate confusion, one once walked the wrong way and took hours to persuade.',
            ),
          ])
        : any([
            L(
              'Tüccarımız taç başkentinin yoluna çıktı, lordum. Uzun yol, iyi kazanç derler; diyenler genelde yolu yürümeyenlerdir.',
              'Our merchant is on the road to the crown capital, my lord. Long road, good profit, they say; those who say it rarely walk it.',
            ),
            L(
              'Tüccar taç başkentine gidiyor, lordum: iki kat yük, uzun yol. Develer itiraz etti, ben bastırdım; bir tanesi hâlâ bana küs.',
              'The merchant is bound for the crown capital, my lord: double load, long road. The camels objected, I overruled them; one still isn’t speaking to me.',
            ),
            L(
              'Başkentin kapıları tüccarımıza açık, lordum. Sefer uzun ama fiyatı daha az düşürür; tüccar da başkentte biraz gezer, ona söylemeyin.',
              'The capital’s gates are open to our merchant, my lord. The trip is long but drives prices down less; and the merchant gets a little sightseeing, don’t tell him I said so.',
            ),
            L(
              'Tüccar kervanını başkente çevirdi, lordum. Döndüğünde hem kese hem tacın gözü dolu olacak; bir de tüccarın ağzı, dedikoduyla.',
              'The merchant has turned his caravan towards the capital, my lord. When he returns, the purse will be full, the crown pleased; and the merchant’s mouth full of gossip.',
            ),
            L(
              'Uzun yol başladı, lordum. Tüccar yanına fazladan azık aldı; bir de benden, başkentteki eski dostuma bir mektup. Bana borcu var, unutmuş olabilir.',
              'The long road begins, my lord. The merchant took extra provisions; and a letter from me to an old friend in the capital. He owes me money; he may have forgotten.',
            ),
            L(
              'Tüccar artık başkent yolunda, lordum. Satış yapılan her sefer o taçla ilişkimizi de ısıtır; deve sırtında diplomasi, en sevdiğim tür.',
              'The merchant is on the capital road now, my lord. Every trip that sells warms our relations with that crown too; diplomacy by camel, my favourite kind.',
            ),
          ])
    case 'house':
      if (c.action === 'gift')
        return any([
          L(
            'Hediye yerine ulaştı, lordum. Kardeşiniz size biraz daha sıcak bakıyor; şimdilik. Kesenin dibi görününce bakışı da soğur.',
            'The gift has arrived, my lord. Your kinsman looks on you a little more warmly; for now. Once he sees the bottom of the purse, the look will cool.',
          ),
          L(
            'Kese teslim edildi, lordum. Alan gülümsedi; gülümsemesinin ne kadar süreceğini zaman gösterir, bence en çok akşam yemeğine kadar.',
            'The purse is delivered, my lord. He smiled; time will tell how long the smile lasts, until supper at most, I’d say.',
          ),
          L(
            'Hediye gitti, lordum. Hanedanda bir altın kesesi bir kılıçtan çok kapı açar; daha az ses de çıkarır.',
            'The gift is sent, my lord. In a dynasty, a purse of gold opens more doors than a sword; and makes less noise.',
          ),
          L(
            'Hediyeyi aldı, lordum, ve "lordumuz cömert" dedi. Ben de bunu sarayda herkese duyurdum, biraz yüksek sesle, kraliçenin kedisi bile duydu.',
            'He took the gift, my lord, and said "our lord is generous." I made sure the whole palace heard it, rather loudly; even the queen’s cat heard.',
          ),
          L(
            'Gönül alındı, lordum. Akraba gönlü cam gibidir; arada bir parlatmak gerekir, çok parlatırsanız da kırılır.',
            'Feelings soothed, my lord. A kinsman’s heart is like glass; it needs a polish now and then, but polish too hard and it breaks.',
          ),
          L(
            'Hediye yerini buldu, lordum. Sofrada artık size bakarak gülümsüyor; eskiden size bakarak bıçağını biliyordu. Gelişme var.',
            'The gift hit the mark, my lord. At table he now smiles at you; he used to sharpen his knife while looking at you. Progress.',
          ),
        ])
      if (c.action === 'role')
        return c.role === null || c.role === undefined
          ? any([
              L(
                'Görevden aldınız, lordum. Anlayışla karşıladı; yani yüzü bembeyaz oldu, sustu ve bir süre bana bakmadı. Ben ne yaptım ki?',
                'You’ve relieved them of their post, my lord. They took it with understanding; that is, went white, said nothing, and wouldn’t look at me for a while. What did I do?',
              ),
              L(
                'Görev elinden alındı, lordum. Bu kolay unutulmaz; bir süre ona hediyeyle yaklaşmak gerekebilir, arkadan değil önden.',
                'The post has been taken away, my lord. That isn’t easily forgotten; you may need to approach with a gift for a while, from the front, not from behind.',
              ),
              L(
                'Mührü geri aldık, lordum. Kapıyı biraz sert kapattı ama menteşeler dayandı; marangoza teşekkür ettim.',
                'We’ve taken back the seal, my lord. The door was shut rather hard, but the hinges held; I thanked the carpenter.',
              ),
              L(
                'Görev boşaldı, lordum. Hanedandan biri gücendi; gücenik akraba, gözü dışarıda olan akrabadır. Gözü taçta olursa haber veririm.',
                'The post is vacant, my lord. A member of the house is offended; an offended relative is one whose eye wanders. If it wanders towards the crown, I’ll let you know.',
              ),
              L(
                'Görevden alındı, lordum. Bana "ben ne yaptım" diye sordu; cevap vermedim, elçiler her şeyi bilir ama her şeyi söylemez.',
                'Dismissed, my lord. They asked me "what did I do?"; I didn’t answer. Envoys know everything but don’t tell everything.',
              ),
              L(
                'Bir görev eksildi, lordum. Hesap tutan kâtip memnun; hanedan ise pek değil. Kâtip zaten kimseyi sevmez.',
                'One post fewer, my lord. The accounting clerk is pleased; the house rather less so. The clerk doesn’t like anyone anyway.',
              ),
            ])
          : any([
              L(
                'Görev verildi, lordum. Hanedandan birinin elinde iş, aklında daha az kötü fikir demektir.',
                'The post is given, my lord. Work in a kinsman’s hands means fewer bad ideas in his head.',
              ),
              L(
                'Mühür teslim edildi, lordum. Yeni görevli göğsünü öyle kabarttı ki düğmeleri zor dayanıyor; terziyi hazırda tutuyorum.',
                'The seal is handed over, my lord. The new officer has puffed out his chest so far his buttons are barely holding; I’m keeping the tailor on standby.',
              ),
              L(
                'Hanedandan birine görev verdiniz, lordum. Görev verilen sevinir, sevinen akraba sadık kalır, sadık akraba da az yemek yer. Bu sonuncusunu uydurdum.',
                'You’ve given a member of the house a post, my lord. The appointed are pleased, pleased relatives stay loyal, and loyal relatives eat less. I made that last one up.',
              ),
              L(
                `${c.role === 'governor' ? 'Yeni vali kasabaya yola çıktı' : c.role === 'commander' ? 'Devriyenin yeni komutanı atını eğerletti' : c.role === 'treasurer' ? 'Yeni hazinedar defterleri açtı' : 'Yeni görevli işe başladı'}, lordum. İnşallah işini sizin kadar iyi bilir; benim kadar konuşmasın yeter.`,
                `${c.role === 'governor' ? 'The new governor has set off for the town' : c.role === 'commander' ? 'The patrol’s new commander has had his horse saddled' : c.role === 'treasurer' ? 'The new treasurer has opened the ledgers' : 'The new officer has started work'}, my lord. May they know the job as well as you do; so long as they don’t talk as much as I do.`,
              ),
              L(
                'Görev dağıtıldı, lordum. Saray artık daha düzenli; ben de daha az koşturuyorum, dizlerim size şükranlarını sunar.',
                'The post is assigned, my lord. The palace is tidier now; and I run about less, my knees send their gratitude.',
              ),
              L(
                'Bir akrabanız artık hanedanın işini görüyor, lordum. İşsiz prens tehlikelidir, meşgul prens yararlı; yorgun prens en iyisidir.',
                'One of your kin now serves the house, my lord. An idle prince is dangerous, a busy prince useful; a tired prince best of all.',
              ),
            ])
      if (c.action === 'marry') {
        const to = (c.to as { kind?: string } | undefined)?.kind
        return to === 'lord'
          ? any([
              L(
                'Evlilik teklifimiz yola çıktı, lordum. Elçi en güzel cübbesini giydi; aslında benim cübbem, iade edeceğine söz verdi.',
                'Our marriage proposal is on its way, my lord. The envoy wore his finest robe; actually my robe, he promised to return it.',
              ),
              L(
                'Talip olduk, lordum. Teklif mühürlendi ve dörtnala yolda; karşı saray düşünecek, umarım çok uzun düşünmez.',
                'We’ve made our suit, my lord. The proposal is sealed and on its way at a gallop; the other court will think it over, not for too long, I hope.',
              ),
              L(
                'Prensesin portresi elçinin heybesinde, lordum. Ressam biraz cömert davranmış ama yalan da sayılmaz; ışık iyi düşmüş, diyelim.',
                'The princess’s portrait is in the envoy’s saddlebag, my lord. The painter was a touch generous, but it’s not a lie; let’s say the light fell kindly.',
              ),
              L(
                'Teklif gönderildi, lordum. Kabul ederlerse iki hanedan akraba olur, ilişki de ısınır; bayram sofraları da kalabalıklaşır, ona hazırlıklı olun.',
                'The proposal is sent, my lord. If they accept, two houses become kin and relations warm; feast tables get crowded too, so be prepared.',
              ),
              L(
                'Evlilik elçisi uğurlandı, lordum. Yanında bir kese hediye, dilinde de benim öğrettiğim üç iltifat. Dördüncüsünü öğretmedim, fazla iddialıydı.',
                'We’ve seen the marriage envoy off, my lord. A purse of gifts with him, and three compliments I taught him on his tongue. I didn’t teach him the fourth; too bold.',
              ),
              L(
                'Karşı saraya teklif gidiyor, lordum. Ben şimdiden düğün konuşmamı yazmaya başladım; kısa olacak, söz. Yedi sayfa.',
                'The proposal is off to the other court, my lord. I’ve already begun my wedding speech; it’ll be short, I promise. Seven pages.',
              ),
            ])
          : any([
              L(
                'Düğün hazırlıkları başladı, lordum! Çeyiz sandıkları yükleniyor, çalgıcılar akort yapıyor; akort yapanlar her zaman çalanlardan daha uzun sürer.',
                'Wedding preparations have begun, my lord! Dowry chests being loaded, musicians tuning up; the tuning always takes longer than the playing.',
              ),
              L(
                'Prenses gelinlik giydi, lordum. Saray kadınları ağlıyor, ben de; yaşlandım, gözlerim terliyor.',
                'The princess is in her wedding gown, my lord. The ladies of the court are weeping, and so am I; I’m getting old, my eyes sweat.',
              ),
              L(
                'Çeyiz yola çıktı, lordum. Arabalar dolu, gönüller dolu, hazine biraz boş. Hazinedar arabaların arkasından el salladı, gelinin değil, altının arkasından.',
                'The dowry is on its way, my lord. Carts full, hearts full, treasury somewhat empty. The treasurer waved after the carts; after the gold, not the bride.',
              ),
              L(
                'Düğün çanları çalıyor, lordum! Prensesimiz yeni evine gidiyor; arkasından su döktük. Ben fazla döktüm, aşçı kızdı.',
                'Wedding bells are ringing, my lord! Our princess goes to her new home; we poured water after her for luck. I poured too much, the cook was furious.',
              ),
              L(
                'Prenses evlendirildi, lordum. Hanedanınızın bağları artık daha geniş; düşmanlarınızın işi daha zor, düğün davetiyelerinin işi daha kolay.',
                'The princess is wed, my lord. Your house’s ties reach further now; harder work for your enemies, easier work for wedding invitations.',
              ),
              L(
                'Gelin alayı uğurlandı, lordum. Zurna, davul, bir de benim veda konuşmam; konuşma biraz uzun sürdü, alay iki kez mola verdi.',
                'The bridal procession is off, my lord. Pipes, drums, and my farewell speech; the speech ran a little long, the procession stopped for rest twice.',
              ),
            ])
      }
      if (c.action === 'wedQueen')
        return any([
          L(
            'Kraliçemiz evlendi, lordum! Soylu bir bey tahta çıktı; hanedan yeniden bir hükümdara kavuştu. Ben de yeniden birine "lordum" diyebiliyorum, alışkanlık işte.',
            'Our queen is wed, my lord! A noble lord has taken the throne; the house has a ruler again. And I can say "my lord" to someone again; force of habit.',
          ),
          L(
            'Düğün davulları çaldı, lordum. Kraliçe artık yalnız değil, taht da boş değil; benim de işim var, şükür.',
            'The wedding drums have sounded, my lord. The queen is no longer alone, nor is the throne empty; and I have work, thank heavens.',
          ),
          L(
            'Konseyle oturup en uygun beyi seçtik, lordum. Kraliçe razı oldu; ben de mendilimi çıkardım. Konsey üyeleri de; meğer hepsi duygusalmış.',
            'We sat with the council and chose the most suitable lord, my lord. The queen consented; I brought out my handkerchief. So did the councillors; it turns out they’re all sentimental.',
          ),
          L(
            'Yeni hükümdarımız taç giydi, lordum. Kraliçenin yanında yakışıyor; halk şimdiden çocuk bekliyor, sabırsız insanlar.',
            'Our new ruler has been crowned, my lord. He looks well beside the queen; the people are already expecting children, impatient lot.',
          ),
          L(
            'Evlilik sözleşmesi mühürlendi, lordum. Hanedanın sürmesi için daha iyi bir haber olamazdı; ben de emekliliğimi bir sezon daha erteledim.',
            'The marriage contract is sealed, my lord. There could be no better news for the house’s future; I’ve put off my retirement another season.',
          ),
          L(
            'Saray bayram yerine döndü, lordum. Yalnız hüküm süren kraliçenin günleri bitti; konseyin de, ki onlar biraz üzüldü.',
            'The palace has become a fairground, my lord. The days of the queen ruling alone are over; and of the council too, who were a little sad about it.',
          ),
        ])
      if (c.action === 'aid')
        return c.kind === 'troops'
          ? any([
              L(
                'Taca asker yardımı için ulak gönderdik, lordum. Taç kabul ederse askerleri karargâha baskın yapar; etmezse bize nazik bir mektup yollar.',
                'We’ve sent a courier to the crown asking for troops, my lord. If the crown agrees, its soldiers will raid the camp; if not, it will send us a polite letter.',
              ),
              L(
                'Tacınızdan asker istediniz, lordum. Taçlar yardım eder, ama karşılığında biraz gönül alır, biraz da gurur.',
                'You’ve asked your crown for troops, my lord. Crowns do help, but they take a little goodwill in return, and a little pride.',
              ),
              L(
                'Ulak başkente koşuyor, lordum. Kardeşinizin karargâhına bir de tacın kılıcı insin, dua edelim; kılıç yanlış yere inmesin.',
                'The courier is racing to the capital, my lord. Let’s pray the crown’s sword falls on your brother’s camp too; and not in the wrong place.',
              ),
              L(
                'Asker yardımı istendi, lordum. Tacımız sizi seviyorsa gelir; sevmiyorsa... onu da öğrenmiş oluruz, en pahalı yoldan.',
                'Troops have been requested, my lord. If our crown loves you, they’ll come; if not… we’ll have found that out too, the expensive way.',
              ),
              L(
                'Yardım isteği yolda, lordum. Taçtan asker istemek gurur kırar; ama tahtı kaybetmek daha çok kırar, bir de koltuğu.',
                'The plea for help is on its way, my lord. Asking the crown for soldiers hurts one’s pride; but losing the throne hurts more, and the seat as well.',
              ),
              L(
                'Taca "yardım" dedik, lordum. Cevabı elçi getirecek; ben de bu arada surları bir dolaşayım, kardeşiniz el sallarsa geri sallamam.',
                'We’ve cried "help" to the crown, my lord. The envoy will bring the answer; meanwhile I’ll take a stroll on the walls, and if your brother waves, I shan’t wave back.',
              ),
            ])
          : any([
              L(
                'Taca altın yardımı için ulak gönderdik, lordum. Gelirse isyana karşı hazineye girer; gelmezse hazinedarın gözyaşları girer.',
                'We’ve sent a courier to the crown asking for gold, my lord. If it comes, it goes into the treasury against the rebellion; if not, the treasurer’s tears do.',
              ),
              L(
                'Tacınızdan altın istediniz, lordum. Kese gelirse kardeşinize karşı asker yetiştiririz; kardeşiniz de bunu duyunca biraz düşünür.',
                'You’ve asked your crown for gold, my lord. If the purse comes we’ll train soldiers against your brother; and your brother, hearing of it, may think twice.',
              ),
              L(
                'Ulak başkente koşuyor, lordum. Hükümdar kesesini açar mı, birazdan öğreniriz; hükümdarların keseleri sıkı düğümlenir.',
                'The courier is racing to the capital, my lord. Whether the ruler opens the royal purse, we’ll soon know; royal purses are tightly knotted.',
              ),
              L(
                'Altın yardımı istendi, lordum. Taç verirse ilişkimizden biraz eksilir; ama taht yerinde kalır, siz de üstünde.',
                'Gold has been requested, my lord. If the crown gives, our relations take a small knock; but the throne stays put, and you on it.',
              ),
              L(
                'Yardım isteği yolda, lordum. Hazinedar şimdiden kasanın kapağını açık bıraktı; umutlu bir adam, ilk kez.',
                'The plea for help is on its way, my lord. The treasurer has already left the strongbox lid open; a hopeful man, for the first time.',
              ),
              L(
                'Taca altın için yazdık, lordum. Mektubu ben yazdım; en dokunaklı cümlelerimi kullandım. Okurken kâtip ağladı, umarım hükümdar da ağlar, kesesiyle birlikte.',
                'We’ve written to the crown for gold, my lord. I wrote the letter myself, with my most moving phrases. The clerk wept reading it; I hope the ruler weeps too, purse and all.',
              ),
            ])
      return null
    case 'nameChild':
      return any([
        L(
          `Çocuğun adı ${c.name} oldu, lordum. Kâtip hanedan defterine yazdı; mürekkebi altın tozlu. Altın tozunun parasını sormayın.`,
          `The child is named ${c.name}, my lord. The clerk entered it in the house register, in ink with gold dust. Don’t ask what the gold dust cost.`,
        ),
        L(
          `${c.name}! Güzel bir ad, lordum. Ozan şimdiden bu adla kafiye arıyor; bulamazsa uyduracak, hep öyle yapar.`,
          `${c.name}! A fine name, my lord. The minstrel is already hunting for a rhyme; if he can’t find one, he’ll invent one, he always does.`,
        ),
        L(
          `Saray ${c.name} adını fısıldıyor, lordum. Bir gün belki bütün diyar haykırır; şimdilik dadı haykırıyor, bez değişirken.`,
          `The palace whispers the name ${c.name}, my lord. One day perhaps the whole land will shout it; for now it’s the nurse shouting, at nappy time.`,
        ),
        L(
          `${c.name} adı konuldu, lordum. Bir daha değişmez; ben de unutmam, söz. Unutursam kâtibe sorarım.`,
          `The name ${c.name} is given, my lord. It won’t change again; nor will I forget it, I promise. If I do, I’ll ask the clerk.`,
        ),
        L(
          `Çocuğa ${c.name} dediniz, lordum. Dadı tekrar etti, aşçı tekrar etti, ben üç kez tekrar ettim; bebek bıktı, uyudu.`,
          `You’ve named the child ${c.name}, my lord. The nurse repeated it, the cook repeated it, I repeated it three times; the baby grew bored and fell asleep.`,
        ),
        L(
          `${c.name} artık hanedanın bir adı, lordum. Bebek ağladı; sanırım beğendi. Ya da acıkmıştı, ikisi bu yaşta pek ayırt edilmez.`,
          `${c.name} is now a name of the house, my lord. The baby cried; I think it approved. Or it was hungry; at that age it’s hard to tell.`,
        ),
      ])
    case 'educate': {
      const finance = c.focus === 'finance'
      const war = c.focus !== 'finance' && c.focus !== 'people'
      const what = finance ? L('maliye', 'finance') : c.focus === 'people' ? L('halk işleri', 'people skills') : L('askerlik', 'soldiering')
      return any([
        L(
          `Çocuğa ${what} hocası tutuldu, lordum. Reşit olunca bu yeteneği daha güçlü olacak; hocanın sabrı ise çoktan zayıfladı.`,
          `A ${what} tutor has been engaged for the child, my lord. When they come of age, that skill will be stronger; the tutor’s patience is already weaker.`,
        ),
        L(
          `Eğitim seçildi: ${what}, lordum. Hoca ilk derse geldi; öğrenci uyuyordu. Hoca da yanına oturup uyudu. Bence iyi bir başlangıç.`,
          `Education chosen: ${what}, my lord. The tutor came to the first lesson; the pupil was asleep. The tutor sat down beside them and slept too. A good start, I’d say.`,
        ),
        L(
          `${war ? 'Tahta kılıçlar' : finance ? 'Abaküs ve defterler' : 'Halkın masalları'} çocuğun odasına taşındı, lordum. ${war ? 'İlk kurban benim baldırım oldu.' : 'Gelecek böyle yetişir, odada biraz dağınıklıkla.'}`,
          `${war ? 'Wooden swords have' : finance ? 'An abacus and ledgers have' : 'The people’s folk tales have'} been moved into the child’s room, my lord. ${war ? 'The first casualty was my shin.' : 'That’s how the future is raised: with a bit of mess in the nursery.'}`,
        ),
        L(
          `Çocuk ${what} öğrenecek, lordum. Ben de ara sıra uğrayıp diplomasi öğretirim; bedavaya. Yani neredeyse bedavaya.`,
          `The child will learn ${what}, my lord. I’ll drop in now and then to teach diplomacy; for free. Well, almost free.`,
        ),
        L(
          `${what.charAt(0).toLocaleUpperCase(locale())}${what.slice(1)} eğitimi başladı, lordum. Hoca çok sert; ben de çocukken böyle bir hocadan korkardım. Hâlâ korkuyorum, aynı hoca.`,
          `${what.charAt(0).toLocaleUpperCase(locale())}${what.slice(1)} lessons have begun, my lord. The tutor is very strict; as a child I was terrified of such a tutor. I still am; it’s the same one.`,
        ),
        L(
          `Eğitim kararı verildi, lordum: ${what}. On altı yaşında farkı görürsünüz; o yaşa kadar da her akşam hocanın şikâyetlerini dinlersiniz.`,
          `The decision is made, my lord: ${what}. You’ll see the difference at sixteen; until then, you’ll hear the tutor’s complaints every evening.`,
        ),
      ])
    }
    case 'ships': {
      const ship = SHIP_WORDS[c.ship as string] ?? L('gemi', 'ship')
      const n = Number(c.count) || 1
      return any([
        L(
          'Tersanede yeni bir omurga kızağa kondu, lordum. Marangozların çekici gece gündüz susmayacak; benim baş ağrım da.',
          'A new keel has been laid on the slipway, my lord. The shipwrights’ hammers won’t stop day or night; nor will my headache.',
        ),
        L(
          `${n} ${ship} için kızaklar hazırlandı, lordum. Zift kokusu saraya kadar geliyor; kraliçenin kedisi bundan hiç hoşlanmadı.`,
          `The slipways are ready for ${n} ${ship}${n === 1 ? '' : 's'}, my lord. The smell of pitch reaches the palace; the queen’s cat does not approve.`,
        ),
        L(
          `Tersane ustaları ${ship} kaburgalarını dikiyor, lordum. Suya inince size haber veririm; şişeyi bu sefer ben kırmam, geçen sefer kaptanın kafasına denk gelmişti.`,
          `The shipwrights are raising the ${ship}’s ribs, my lord. I’ll tell you when she’s launched; I won’t break the bottle this time, last time it landed on the captain’s head.`,
        ),
        L(
          `${n > 1 ? `${n} ${ship}` : `Bir ${ship}`} yapılıyor, lordum. Tayfası asker havuzundan gelecek; denizciler köylü sayılmaz, köylüler de denizci sayılmak istemez.`,
          `${n > 1 ? `${n} ${ship}s are` : `A ${ship} is`} being built, my lord. The crew will come from the manpower pool; sailors don’t count as villagers, and villagers don’t want to count as sailors.`,
        ),
        L(
          `Kereste tersaneye taşındı, lordum. Bir ${ship} doğuyor; adını tayfaya bırakmayın, geçen sefer "Elçinin Sesi" koydular ve bunun bir iltifat olmadığını sonra öğrendim.`,
          `Timber has been hauled to the shipyard, my lord. A ${ship} is being born; don’t let the crew name her, last time they chose "The Envoy’s Voice" and I learned later it wasn’t a compliment.`,
        ),
        L(
          `Kızaktan çekiç sesleri geliyor, lordum. ${ship.charAt(0).toLocaleUpperCase(locale())}${ship.slice(1)} pahalıdır ama sular bizim olacak. Ben yine de karada kalacağım; deniz beni sevmiyor.`,
          `Hammering from the slipway, my lord. ${ship.charAt(0).toLocaleUpperCase(locale())}${ship.slice(1)}s are expensive, but the waters will be ours. I’ll stay ashore all the same; the sea doesn’t like me.`,
        ),
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
      const one = kinds.length === 1 ? lower(BUILDING_NAMES[kinds[0] as keyof typeof BUILDING_NAMES] ?? L('yapı', 'building')) : null
      if (razes && !builds.length && !moves)
        return any([
          L(
            'Yıkım ekibi işe başladı, lordum. Taşların yarısı ambara döner, öbür yarısı toz olup benim cübbeme yerleşir.',
            'The demolition crew is at work, my lord. Half the stones go back to the storehouse; the other half turn to dust and settle on my robe.',
          ),
          L(
            'Balyozlar kalktı, lordum. Bir yapı gider, bir boşluk kalır; boşluk da bir fırsattır, en azından fareler için.',
            'The sledgehammers are up, my lord. A building goes, a gap remains; and a gap is an opportunity, for the rats at least.',
          ),
          L(
            'Yıkıldı, lordum. Ustabaşı içini çekti; kendi elleriyle yaptığı bir şeydi galiba. Ona yeni bir şey yaptırın, avunur.',
            'It’s down, my lord. The foreman sighed; I think he built it with his own hands. Give him something new to build, he’ll get over it.',
          ),
          L(
            'Enkaz kaldırılıyor, lordum. Harcananın yarısı ambara geri dönüyor, kalanı tarihe. Tarih de iade etmiyor.',
            'The rubble is being cleared, my lord. Half of what was spent returns to the storehouse, the rest to history. History gives no refunds.',
          ),
          L(
            'Yıkım emri yerine geldi, lordum. Toz bulutu dağılınca yerine ne koyacağımızı konuşuruz; ben bir heykel öneriyorum, kimin heykeli olduğu sonra konuşulur.',
            'The demolition is done, my lord. When the dust settles we’ll discuss what goes there; I propose a statue; whose statue, we can decide later.',
          ),
          L(
            'Bir yapı eksildi, lordum. Bazen bir şehri güzelleştiren eklediğiniz değil, kaldırdığınızdır. Bunu bir mimara söyledim, bana küstü.',
            'One building fewer, my lord. Sometimes what beautifies a town isn’t what you add but what you take away. I said so to an architect; he stopped speaking to me.',
          ),
        ])
      if (moves && !builds.length)
        return any([
          L(
            'Taşıma başladı, lordum. Yapı söküldü, taşlar numaralandı; umarım aynı sırayla dizerler. Yedinci taşı ararken buldum, cebimdeydi.',
            'The move has begun, my lord. The building’s taken apart, the stones numbered; I hope they stack them back in order. The seventh stone went missing; I found it in my pocket.',
          ),
          L(
            'Ustalar yapıyı yeni yerine taşıyor, lordum. Seviyesi ve işçileri korunur; yalnızca adresi değişir, mektupları ben yönlendiririm.',
            'The builders are carrying the building to its new spot, my lord. Its level and workers are kept; only the address changes, I’ll forward the post.',
          ),
          L(
            'Bir yapı yer değiştiriyor, lordum. Köylüler şaşkın: "dün buradaydı" diyorlar. Bir tanesi büyü yapıldığına inanıyor; düzeltmedim, eğlenceli.',
            'A building is on the move, my lord. The villagers are baffled: "it was here yesterday," they say. One believes it’s sorcery; I didn’t correct him, it’s fun.',
          ),
          L(
            'Taşıma emri ustalarda, lordum. Taşınırken yapı üretmez; işçiler de bunu fırsat bilip taşların üstünde uyuyor.',
            'The builders have the order to move it, my lord. While moving, it produces nothing; and the workers have seized the chance to nap on the stones.',
          ),
          L(
            'Yapı yeni yerine yürüyor, lordum, taş taş. Şehir planınız artık daha düzenli; bu fikri ben vermiştim, hatırlarsınız belki.',
            'The building is walking to its new home, my lord, stone by stone. Your town plan is tidier now; that was my idea, you may recall.',
          ),
          L(
            'Arabalara kirişler yüklendi, lordum. Mimar "bu yer daha iyi" dedi; mimarlar her yer için öyle der, eski yer için de demişti.',
            'The beams are loaded onto carts, my lord. The architect said "this spot is better"; architects say that of every spot, he said it of the old one too.',
          ),
        ])
      return any([
        L(
          `Plan onaylandı, lordum: ${builds.length > 1 ? `${builds.length} yapı` : one ?? 'yeni yapı'} için temeller kazılıyor. Ustalar iskeleye çıktı; biri yanlış iskeleye çıktı, indirdik.`,
          `The plan is approved, my lord: foundations are being dug for ${builds.length > 1 ? `${builds.length} buildings` : one ? `the ${one}` : 'the new building'}. The builders are up the scaffolding; one climbed the wrong scaffolding, we got him down.`,
        ),
        L(
          `${one ? `Yeni ${one}` : 'Yeni yapılar'} için taşlar taşınıyor, lordum. Çekiç sesi lordluğun en güzel şarkısıdır; benim şarkı söylememden kesinlikle daha güzel.`,
          `Stones are being carried for ${one ? `the new ${one}` : 'the new buildings'}, my lord. Hammering is the lordship’s sweetest song; certainly sweeter than my singing.`,
        ),
        L(
          `Mimar planı ustalara dağıttı, lordum. ${builds.length > 2 ? 'Bu kadar işi aynı anda görünce biri bayıldı; ayıltıp işe koyduk, ikinci kez bayılmasın diye planı göstermiyoruz.' : 'Biri ters tuttu, düzelttim; aslında ben de ters tutuyordum, ama o bilmiyor.'}`,
          `The architect has handed out the plans, my lord. ${builds.length > 2 ? 'One fainted at the sight of so much work at once; we revived him and set him to it, and we’re not showing him the plan again lest he faint twice.' : 'One held it upside down; I put him right. Actually I was holding it upside down too, but he doesn’t know.'}`,
        ),
        L(
          `İnşaat başladı, lordum. ${one ? `${one.charAt(0).toLocaleUpperCase(locale())}${one.slice(1)} yükseldikçe` : 'Yapılar yükseldikçe'} hudut dolacak, haritanız güzelleşecek; komşular da kıskançlıktan çatlayacak.`,
          `Construction has begun, my lord. As ${one ? `the ${one} rises` : 'the buildings rise'}, your borders will fill and your map grow lovelier; and the neighbours will burst with envy.`,
        ),
        L(
          'Plan yürürlükte, lordum. İnşaat yeri doluysa sıradakiler yer boşalınca başlar; ustalar sıra beklemeyi bilir, beklerken yemek yemeyi de.',
          'The plan is in force, my lord. If the building slots are full, the rest start as slots free up; builders know how to queue, and how to eat while queuing.',
        ),
        L(
          `Temel taşları atıldı, lordum. ${moves || razes ? 'Taşınan ve yıkılanlar da hallediliyor; ' : ''}Bir lordluk böyle büyür: taş üstüne taş, şikâyet üstüne şikâyet.`,
          `The foundation stones are laid, my lord. ${moves || razes ? 'The moves and demolitions are in hand too. ' : ''}That’s how a lordship grows: stone upon stone, complaint upon complaint.`,
        ),
      ])
    }
    case 'build':
    case 'buildMany': {
      // The palace is placed for free in an instant (the tutorial cheers it); roads and walls are small chores.
      if (c.kind === 'road' || c.kind === 'wall' || c.kind === 'gate' || c.kind === 'palace') return null
      const name = lower(BUILDING_NAMES[c.kind as keyof typeof BUILDING_NAMES] ?? L('yapı', 'building'))
      return any([
        L(
          `Yeni ${name} için temel kazılıyor, lordum. Kazıcılar eski bir kemik buldu; tavuk kemiğiymiş, heyecanlanmayın.`,
          `The foundations are being dug for the new ${name}, my lord. The diggers found an old bone; a chicken bone, don’t get excited.`,
        ),
        L(
          `Ustalar ${name} iskelesine çıktı, lordum. Çekiç sesleri başladı; benim öğle uykum bitti.`,
          `The builders are up the scaffolding of the ${name}, my lord. The hammering has begun; my afternoon nap has ended.`,
        ),
        L(
          `Bir ${name} daha yükseliyor, lordum. Halk merakla seyrediyor; çalışan bir kişiye seyreden on kişi, her şantiyenin kuralıdır.`,
          `Another ${name} is rising, my lord. The people watch with interest; ten watching for every one working, the rule of every building site.`,
        ),
        L(
          `${name.charAt(0).toLocaleUpperCase(locale())}${name.slice(1)} inşaatı başladı, lordum. Ustabaşı "çabuk biter" dedi; ustabaşları bunu annelerinin karnında bile söyler.`,
          `Work on the ${name} has begun, my lord. The foreman said "it’ll be done in no time"; foremen say that before they’re even born.`,
        ),
        L(
          `Taşlar ve kirişler ${name} için taşınıyor, lordum. Bir kiriş benim ayağıma düştü; inşaat güvenliği bundan sonra benim sorumluluğumda.`,
          `Stones and beams are being hauled for the ${name}, my lord. A beam fell on my foot; site safety is my responsibility from now on.`,
        ),
        L(
          `Bir ${name} kuruluyor, lordum. Lordluğumuz bir yapı daha büyüyor; ben de bir yapı daha anlatacak şey buluyorum.`,
          `A ${name} is going up, my lord. Our lordship grows by one more building; and I find one more building’s worth of things to tell.`,
        ),
        L(
          `${name.charAt(0).toLocaleUpperCase(locale())}${name.slice(1)} için yer seçimini çok beğendim, lordum. Aynısını ben de düşünmüştüm, söylemeye fırsat bulamadan siz söylediniz.`,
          `I much admire your choice of site for the ${name}, my lord. I’d thought of the very same spot; you just said it before I had the chance.`,
        ),
      ])
    }
    case 'upgrade': {
      const b = k?.buildings.find((x) => x.id === c.id)
      if (!b || b.kind === 'road' || b.kind === 'wall' || b.kind === 'gate') return null
      const name = lower(BUILDING_NAMES[b.kind] ?? L('yapı', 'building'))
      const level = b.level ?? 1
      if (b.kind === 'palace')
        return any([
          L(
            `Saray ${level}. seviyeye yükseliyor, lordum! Mimarlar iskelede, hazinedar baygın, ben heyecanlı. Hazinedarı ayıltmayalım, faturayı görmesin.`,
            `The palace is rising to level ${level}, my lord! Architects on the scaffolding, treasurer in a faint, me in a flutter. Let’s not revive the treasurer; he mustn’t see the bill.`,
          ),
          L(
            'Sarayın yeni katı için ilk taş kondu, lordum. Bittiğinde hudut genişler, yeni yapılar açılır; benim odama da bir pencere, umuyorum.',
            'The first stone of the palace’s new level is laid, my lord. When it’s done the borders widen and new buildings unlock; and my room gets a window, I hope.',
          ),
          L(
            `Saray yükseltmesi başladı, lordum. ${level}. seviye! Ozanlar şimdiden şarkısını yazıyor; kafiyesi "seviye" ile "hediye", hediyeyi kime bilmiyorum.`,
            `The palace upgrade has begun, my lord. Level ${level}! The minstrels are already writing its song; they’re rhyming "level" with "revel," though I don’t know who’s invited.`,
          ),
          L(
            'Ustalar saraya tırmandı, lordum. Yükseltme sürerken saray eski hâliyle hizmet verir; ben de eski odamda beklerim, tavandan toz yağarken.',
            'The builders have climbed the palace, my lord. During the upgrade it serves as it was; and I’ll wait in my old room while dust rains from the ceiling.',
          ),
          L(
            `Sarayın ${level}. katı yolda, lordum. Komşular kulelerinden bakıp kıskançlıktan sararacak; birine dürbün hediye edelim, iyi görsün.`,
            `Level ${level} of the palace is on its way, my lord. The neighbours will peer from their towers and go green with envy; let’s gift one a spyglass, so he sees it properly.`,
          ),
          L(
            'Saray büyüyor, lordum. Bitince ilk iş kuzey kulesindeki odama bir pencere daha açtırmak; izninizle, iznim olmasa da.',
            'The palace is growing, my lord. When it’s done, my first act will be to have another window cut in my room in the north tower; with your leave, or without it.',
          ),
        ])
      return any([
        L(
          `${name.charAt(0).toLocaleUpperCase(locale())}${name.slice(1)} ${level}. seviyeye yükseliyor, lordum. Bitince daha çok iş görecek; işçiler bu habere pek sevinmedi.`,
          `The ${name} is rising to level ${level}, my lord. When it’s done it’ll do more work; the workers weren’t thrilled by the news.`,
        ),
        L(
          `Ustalar ${name} için iskele kurdu, lordum. Yükseltme sürerken üretmez ama sonra fazlasıyla öder; ustalar da öyle söylüyor, ücretlerini isterken.`,
          `The builders have put scaffolding round the ${name}, my lord. It produces nothing during the upgrade but repays it handsomely after; so say the builders, while asking for their wages.`,
        ),
        L(
          `${level}. seviye ${name}, lordum! Ustabaşı "eskisinin iki katı" dedi; ben biraz abartıyor diye düşünüyorum, abartıyı iyi bilirim.`,
          `A level ${level} ${name}, my lord! The foreman says "twice as good as before"; I suspect he exaggerates, and I know exaggeration when I hear it.`,
        ),
        L(
          `Bir ${name} yükseltiliyor, lordum. Daha büyük, daha güzel, daha pahalı; dünyanın düzeni böyle, benim maaşım hariç.`,
          `A ${name} is being upgraded, my lord. Bigger, finer, dearer; that’s the way of the world, except for my salary.`,
        ),
        L(
          `${name.charAt(0).toLocaleUpperCase(locale())}${name.slice(1)} yenileniyor, lordum. İşçiler bu fırsatla biraz dinleniyor; görmezden geldim, karşılığında bana da yer açtılar.`,
          `The ${name} is being renovated, my lord. The workers are taking the chance to rest a bit; I looked the other way, and in return they made room for me.`,
        ),
        L(
          `Yükseltme başladı, lordum. ${name.charAt(0).toLocaleUpperCase(locale())}${name.slice(1)} bitince haritada yeni hâlini görürsünüz; eski hâlini özleyen olursa o benim.`,
          `The upgrade has begun, my lord. When the ${name} is done you’ll see its new look on the map; if anyone misses the old one, it’ll be me.`,
        ),
      ])
    }
    case 'upgradeTrade':
      return any([
        L(
          'Ticaret noktası büyüyor, lordum. Tüccar artık seferde daha çok yük götürecek; develer bunu henüz bilmiyor, söylemeyin.',
          'The trading post is growing, my lord. The merchant will carry more per trip now; the camels don’t know yet, don’t tell them.',
        ),
        L(
          'Ticaret noktasına yeni bir kat, lordum. Develer de bunu duydu; yükleri ağırlaşacak, morali bozuldu, sendika konuşuluyor.',
          'A new level for the trading post, my lord. The camels heard about it; heavier loads ahead, morale is low, there’s talk of a guild.',
        ),
        L(
          'Tüccarımız yeni tezgâhını çok beğendi, lordum. Seferde daha çok mal, daha çok altın; daha çok övünme de, maalesef.',
          'Our merchant adores his new stall, my lord. More goods per trip, more gold; and more boasting, alas.',
        ),
        L(
          'Ticaret noktası yükseltildi, lordum. Rakipler de görüyor, haritada seviyesi yazıyor; biraz hava atmanın kimseye zararı olmaz.',
          'The trading post is upgraded, my lord. Our rivals can see it too, its level is on the map; a little showing off never hurt anyone.',
        ),
        L(
          'Yeni depolar, yeni tenteler, lordum. Tüccar el ovuşturuyor; ben de öyle, ama benimki soğuktan.',
          'New stores, new awnings, my lord. The merchant is rubbing his hands; so am I, but mine is from the cold.',
        ),
        L(
          'Ticaret büyüyor, lordum. Yalnız ambarda satacak mal olsun; boş tezgâh dolu tezgâhtan çirkindir, tüccarın yüzü de.',
          'Trade is growing, my lord. Just make sure there’s something in the storehouse to sell; an empty stall is uglier than a full one, and so is the merchant’s face.',
        ),
      ])
    case 'tradeGood':
      return c.good === null || c.good === undefined || c.good === 'none'
        ? any([
            L(
              'Tüccar evde kalacak, lordum. Develeri ahıra çekti, kendisini de taburesine; ikisi de aynı sesle iç çekti.',
              'The merchant is staying home, my lord. He led the camels to the stable and himself to his stool; they all sighed in unison.',
            ),
            L(
              'Satış durdu, lordum. Mallar ambarda kalır, hazine bekler, fareler sevinir.',
              'Sales have stopped, my lord. The goods stay in the storehouse, the treasury waits, the rats rejoice.',
            ),
            L(
              '"Hiçbir şey satma" dediniz, lordum. Tüccar ilk kez bu kadar az iş için bu kadar çok sevindi; maaşının devam ettiğini öğrenince daha da sevindi.',
              'You said "sell nothing," my lord. The merchant has never been so pleased about so little work; and even more so on learning his pay continues.',
            ),
            L(
              'Tüccar dinlenmeye çekildi, lordum. Ambar sınırına dikkat; sığmayan mal boşa gider, boşa giden malı da fareler sahiplenir.',
              'The merchant has retired to rest, my lord. Mind the storehouse limit; what doesn’t fit goes to waste, and the rats claim what goes to waste.',
            ),
            L(
              'Ticaret beklemede, lordum. Fiyatlar toparlanınca yeniden başlarız, değil mi? Tüccar "değil mi" sorusundan hoşlanmıyor.',
              'Trade is on hold, my lord. We’ll resume when prices recover, won’t we? The merchant doesn’t care for "won’t we."',
            ),
            L(
              'Tüccar boşta, lordum. Devesi bana bakıyor; sanırım bana da "sen ne iş yapıyorsun" diyor. Cevap veremedim.',
              'The merchant is idle, my lord. His camel is staring at me; I think it’s asking "and what do you do?" I had no answer.',
            ),
          ])
        : any([
            L(
              `Tüccar artık ${goodOf(c.good)} satacak, lordum. Çuvallar yükleniyor; develer şimdiden şikâyetçi, ne yüklesek şikâyetçiler zaten.`,
              `The merchant will sell ${goodOf(c.good)} now, my lord. The sacks are being loaded; the camels are already complaining, they complain whatever we load.`,
            ),
            L(
              `Develere ${goodOf(c.good)} yüklendi, lordum. Fazla olanı satmak akıllı lordun işidir; az olanı satmak benim kuzenimin işiydi, o yüzden fakir öldü.`,
              `The camels are loaded with ${goodOf(c.good)}, my lord. Selling what you have plenty of is a wise lord’s business; selling what you lack was my cousin’s, which is why he died poor.`,
            ),
            L(
              `Satılacak mal: ${goodOf(c.good)}, lordum. Tüccar başını salladı; ne verseniz satar, bana da annemi satmayı teklif etmişti bir kere.`,
              `Goods for sale: ${goodOf(c.good)}, my lord. The merchant nodded; he’ll sell whatever you give him, he once offered to sell my mother.`,
            ),
            L(
              `Tüccar ${goodOf(c.good)} ile yola çıkıyor, lordum. Yalnız çok satılan malın fiyatı düşer; pazara göz kulak olalım, tüccara da.`,
              `The merchant sets out with ${goodOf(c.good)}, my lord. Mind you, goods that sell a lot fall in price; let’s keep an eye on the market, and on the merchant.`,
            ),
            L(
              `${goodOf(c.good).charAt(0).toLocaleUpperCase(locale())}${goodOf(c.good).slice(1)} satışa çıktı, lordum. Ambar biraz hafifler, kese biraz ağırlaşır; fareler bu karardan memnun değil.`,
              `${goodOf(c.good).charAt(0).toLocaleUpperCase(locale())}${goodOf(c.good).slice(1)} is up for sale, my lord. The storehouse gets lighter, the purse heavier; the rats are not pleased with this decision.`,
            ),
            L(
              `Karar verildi, lordum: ${goodOf(c.good)}. Tüccar bu sefer çuvalları iki kez saydı; benden öğrendi. Ben üç kez sayarım ama her seferinde farklı çıkar.`,
              `It’s decided, my lord: ${goodOf(c.good)}. The merchant counted the sacks twice this time; he learned that from me. I count three times, but get a different answer each time.`,
            ),
          ])
    case 'tradeAmount':
      return any([
        L(
          `Tüccar artık seferde ${c.units} birim götürecek, lordum. Develere sordum; cevap vermediler ama yüzlerinden belliydi.`,
          `The merchant will now carry ${c.units} units per trip, my lord. I asked the camels; they didn’t answer, but it was written on their faces.`,
        ),
        L(
          `Sefer başına yük ${c.units} birim oldu, lordum. Develer hesabı yaptı; memnun değiller ama itaatkârlar. Benim gibi.`,
          `The load per trip is now ${c.units} units, my lord. The camels did the sums; they’re not happy, but they obey. Like me.`,
        ),
        L(
          `Yük ayarlandı, lordum: ${c.units} birim. İki dakika yeniden değiştiremeyiz; deveye de karar vermesi için vakit tanıyalım.`,
          `The load is set, my lord: ${c.units} units. We can’t change it again for two minutes; let’s give the camel time to make its peace with it.`,
        ),
        L(
          `${c.units} birimlik yük, lordum. Ne çok ne az; orta karar, tıpkı benim maaşım gibi. Ondan da söz etmişken…`,
          `A load of ${c.units} units, my lord. Neither too much nor too little; middling, just like my salary. Speaking of which…`,
        ),
        L(
          `Tüccar yeni yük ölçüsünü öğrendi, lordum: ${c.units} birim. Çuvalları yeniden bağlıyor; iki düğüm bana düştü, parmaklarım düğüm oldu.`,
          `The merchant has learned the new load: ${c.units} units, my lord. He’s re-tying the sacks; two knots fell to me, and now my fingers are in knots.`,
        ),
        L(
          `Seferde ${c.units} birim satılacak, lordum. Ambarın hâline arada bir bakalım; ben bakarım, fareleri de sayarım.`,
          `${c.units} units will be sold per trip, my lord. Let’s check on the storehouse now and then; I’ll look, and count the rats.`,
        ),
      ])
    case 'product': {
      const name = PRODUCT_NAMES[c.product as string]
      if (!name) return null
      const p = lower(name)
      return any([
        L(
          `Artık ${p} üretilecek, lordum. İşçiler aletlerini değiştirdi; biri yanlış aleti aldı, şimdi ${p} için kepçe kullanıyor.`,
          `Now it’ll make ${p}, my lord. The workers have changed tools; one picked the wrong one and is now making ${p} with a ladle.`,
        ),
        L(
          `${name}, lordum! Ustalar başını salladı; değişiklikten hoşlanmazlar ama itiraz da etmezler, sadece arkadan söylenirler.`,
          `${name}, my lord! The craftsmen nodded; they dislike change but don’t object, they just mutter behind your back.`,
        ),
        L(
          `Ürün değişti: ${p}, lordum. Bir sonraki turda farkı görürsünüz; işçilerin homurtusunu ise hemen duyarsınız.`,
          `The product has changed: ${p}, my lord. You’ll see the difference next round; the workers’ grumbling, you’ll hear right away.`,
        ),
        L(
          `İşçilere ${p} dediniz, lordum. Biri "dün başka diyordunuz" dedi; ona hükümdarların fikir değiştirebileceğini hatırlattım. Elçilerin de.`,
          `You told the workers "${p}," my lord. One said "yesterday you said something else"; I reminded him that rulers may change their minds. Envoys too.`,
        ),
        L(
          `${name} için hazırlıklar yapıldı, lordum. Ambarda ya da cephanelikte yer olsun; yoksa üretilen her şey koridorda bana çarpıyor.`,
          `Everything’s ready for ${p}, my lord. Make sure there’s room in the storehouse or armoury; otherwise everything made ends up bumping into me in the corridor.`,
        ),
        L(
          `Yeni iş: ${p}, lordum. Atölyenin bacasından çıkan duman bile rengini değiştirdi sanki. Belki de ben yanlış bacaya bakıyorum.`,
          `New work: ${p}, my lord. Even the smoke from the workshop chimney seems to have changed colour. Or perhaps I’m looking at the wrong chimney.`,
        ),
      ])
    }
    case 'buy':
      return any([
        L(
          `Pazardan ${c.units} ${goodOf(c.good)} alındı, lordum. Arabalar ambara yol aldı; fareler kapıda karşılama töreni hazırlıyor.`,
          `${c.units} ${goodOf(c.good)} bought at the market, my lord. The carts are bound for the storehouse; the rats are preparing a welcome at the door.`,
        ),
        L(
          `${c.units} ${goodOf(c.good)} için kese açıldı, lordum. Pazarcı gülümsedi; pazarcılar hep gülümser, altını görünce. Altın gidince gülümseme de gider.`,
          `The purse was opened for ${c.units} ${goodOf(c.good)}, my lord. The trader smiled; traders always smile at the sight of gold. When the gold goes, so does the smile.`,
        ),
        L(
          `Alışveriş tamam, lordum: ${c.units} ${goodOf(c.good)}. Fiyat biraz yükseldi; aldıkça pahalanır. Pazarcı bunu bize anlatırken bir hayli keyifliydi.`,
          `Shopping done, my lord: ${c.units} ${goodOf(c.good)}. The price went up a little; the more you buy, the dearer it gets. The trader was in fine spirits explaining that to us.`,
        ),
        L(
          `Ambara ${c.units} ${goodOf(c.good)} girdi, lordum. Hazinedar bir köşede sessizce ağlıyor; sessiz olmasına sevindim, önceki sefer çok sesliydi.`,
          `${c.units} ${goodOf(c.good)} went into the storehouse, my lord. The treasurer is weeping quietly in a corner; I’m glad it’s quietly, last time it was very loud.`,
        ),
        L(
          `Pazardan ${goodOf(c.good)} geldi, lordum. Eksik kapandı; bekleyen inşaat da şimdi başlayabilir, ustabaşının bahanesi kalmadı.`,
          `${goodOf(c.good).charAt(0).toLocaleUpperCase(locale())}${goodOf(c.good).slice(1)} has arrived from the market, my lord. The shortfall is covered; the waiting construction can start now, the foreman has run out of excuses.`,
        ),
        L(
          `Pazarcı ${c.units} ${goodOf(c.good)} tarttı, lordum. Ben de terazinin başında durdum, eksik tartmasın diye. Bir kez parmağını terazide yakaladım; utanmadı bile.`,
          `The trader weighed out ${c.units} ${goodOf(c.good)}, my lord. I stood over the scales so he wouldn’t short us. Once I caught his thumb on the scale; he wasn’t even embarrassed.`,
        ),
      ])
    case 'townBuy':
      return any([
        L(
          `Askerler kasaba pazarından ${c.units} birim mal yüklendi, lordum. Saraya varınca ambara girer; yolda kimse bir çuval aşırmazsa.`,
          `The soldiers have loaded ${c.units} units of goods at the town market, my lord. They go into the storehouse when they reach the palace; provided nobody pinches a sack on the way.`,
        ),
        L(
          `Kasabadan alışveriş yapıldı, lordum: ${c.units} birim. Askerler hem asker hem hamal oldu; ikisine de maaş veriyoruz zaten, birine fazladan.`,
          `We’ve shopped at the town, my lord: ${c.units} units. The soldiers are soldiers and porters now; we pay them for both anyway, for one of them twice.`,
        ),
        L(
          `${c.units} birim mal orduya yüklendi, lordum. Yolda bir çarpışmaya girmesinler; yenilen ordu yükünü kaybeder, onurunu da.`,
          `${c.units} units of goods are loaded onto the army, my lord. Let’s hope they don’t get into a fight on the way; a beaten army loses its cargo, and its honour.`,
        ),
        L(
          `Kasaba pazarcısı ordunun önünde fiyat indirmedi, lordum; cesur adam, ya da çok açgözlü. ${c.units} birim yüklendi.`,
          `The town trader didn’t lower his price even in front of the army, my lord; a brave man, or a very greedy one. ${c.units} units loaded.`,
        ),
        L(
          `Ordu yüklü, lordum: ${c.units} birim. Eve dönünce ambar dolacak, askerlerin sırtı ağrıyacak; ağrıyan sırtları bana şikâyet edecekler, biliyorum.`,
          `The army is laden, my lord: ${c.units} units. When they’re home the storehouse will fill and the soldiers’ backs will ache; and they’ll complain about their backs to me, I know it.`,
        ),
        L(
          'Kasabadan mal aldık, lordum. Askerler çuvalları kalkan gibi taşıyor; düşman görse güler, gülerken de onu yakalarız. Strateji.',
          'We’ve bought goods from the town, my lord. The soldiers carry the sacks like shields; any enemy would laugh, and while he laughs we catch him. Strategy.',
        ),
      ])
    case 'townUpkeep': {
      const w = UPKEEP_WORDS[Number(c.level)] ?? L('yeni', 'new')
      return Number(c.level) === 0
        ? any([
            L(
              'Kasabanın bakımı kesildi, lordum. Hazine rahatlar, kasabanın sadakati düşer; ikisi aynı terazide, biri iner öbürü çıkar.',
              'The town’s upkeep is cut, my lord. The treasury breathes easier, the town’s loyalty falls; they sit on the same scales, one goes down, the other up.',
            ),
            L(
              'Kasabaya artık bir şey gitmeyecek, lordum. Kasabalılar bunu fark eder; sadakat de fark eder, hem de çabucak.',
              'Nothing more goes to the town, my lord. The townsfolk will notice; and so will their loyalty, quickly.',
            ),
            L(
              'Bakım yok, lordum. Kasabanın valisi mektup yazdı; ağzı epey bozuk bir mektup. İmlası da bozuktu, onu da düzelttim, geri gönderdim.',
              'No upkeep, my lord. The town’s governor has written; a rather foul-mouthed letter. The spelling was foul too; I corrected it and sent it back.',
            ),
            L(
              'Kasabanın kesesi kapandı, lordum. Sadakat ayaklanma çizgisine yaklaşırsa haber veririm; meşaleleri görünce zaten anlarsınız.',
              'The town’s purse is shut, my lord. If loyalty nears the revolt line I’ll let you know; though you’ll know anyway when you see the torches.',
            ),
            L(
              'Bakım durdu, lordum. Bedava sadakat yoktur; ama hazineniz bunu bir süre kaldırabilir, kasabalılar kaldıramayabilir.',
              'Upkeep has stopped, my lord. There’s no such thing as free loyalty; your treasury can bear it a while, the townsfolk perhaps not.',
            ),
            L(
              'Kasaba kendi başının çaresine bakacak, lordum. Bakalım bize ne kadar bağlı kalacak; ben bahse girmem, girersem de karşı tarafa girerim.',
              'The town must fend for itself, my lord. We’ll see how loyal it stays; I wouldn’t bet on it, and if I did, I’d bet against.',
            ),
          ])
        : any([
            L(
              `Kasabanın bakımı ${w} oldu, lordum. Sadakat ona göre kayacak; kasabalılar parayı koklamayı iyi bilir.`,
              `The town’s upkeep is now ${w}, my lord. Loyalty will drift accordingly; townsfolk have a fine nose for money.`,
            ),
            L(
              `${w.charAt(0).toLocaleUpperCase(locale())}${w.slice(1)} bakım, lordum. Kasabalılar keselerinin ağırlığını hissedecek; vali de, her zamanki gibi önce kendisi.`,
              `${w.charAt(0).toLocaleUpperCase(locale())}${w.slice(1)} upkeep, my lord. The townsfolk will feel the weight in their purses; and the governor, as ever, first of all.`,
            ),
            L(
              `Kasaba için ${w} bakım ayrıldı, lordum. Sadakat birkaç turda hedefine doğru kayar; sadakat altına uzanan bir kediye benzer, yavaş ama emin.`,
              `${w.charAt(0).toLocaleUpperCase(locale())}${w.slice(1)} upkeep is set aside for the town, my lord. Loyalty drifts towards its target over a few rounds; loyalty is like a cat stretching towards gold, slow but sure.`,
            ),
            L(
              `Bakım ayarlandı: ${w}, lordum. Valinin yüzü ${Number(c.level) >= 3 ? 'güldü; hem de öyle güldü ki iki dişi eksik, gördüm' : 'biraz güldü; tam gülmesi için daha fazlası lazım, söyledi'}.`,
              `Upkeep set: ${w}, my lord. The governor ${Number(c.level) >= 3 ? 'beamed; beamed so wide I could see two teeth missing' : 'smiled a little; for a proper smile he needs more, he said'}.`,
            ),
            L(
              `Kasabaya ${w} bakım gidecek, lordum. Hazine her tur öder; hazinede yoksa o tur bakım yokmuş sayılır, kasabalılar da bunu kişisel algılar.`,
              `The town gets ${w} upkeep, my lord. The treasury pays each round; if it’s empty, that round counts as no upkeep, and the townsfolk take it personally.`,
            ),
            L(
              `Kasabanın kesesi ${w} doldurulacak, lordum. Sadık kasaba daha çok katkı demektir; sadık elçi de, unutmayın.`,
              `The town’s purse will be filled at ${w} rates, my lord. A loyal town means more contributions; so does a loyal envoy, don’t forget.`,
            ),
          ])
    }
    // ---- Armies ----
    case 'raise': {
      const n = unitsOf(c.units)
      return any([
        L(
          `${n ? `${n} askerlik ` : ''}bir ordu garnizondan çıktı, lordum. Sancak açıldı, davullar çalıyor; davulcu biraz geç kaldı, kahvaltıdaymış.`,
          `An army${n ? ` of ${n}` : ''} has marched out of the garrison, my lord. Banner unfurled, drums beating; the drummer was a little late, he was at breakfast.`,
        ),
        L(
          'Ordu kapının önünde saf tuttu, lordum. Emirlerinizi bekliyorlar; hudut dışına çıkınca emirler elçiyle gider. Yani benimle, yani dizlerimle.',
          'The army has formed up before the gate, my lord. They await your orders; beyond the border, orders travel by envoy. That is, by me; that is, by my knees.',
        ),
        L(
          'Yeni bir ordu, lordum! Askerler kılıçlarını parlattı; kılıçta kendi yüzlerini görünce biraz şaşırdılar, sonra saçlarını düzelttiler.',
          'A new army, my lord! The soldiers polished their swords; seeing their own faces in the blades startled them a bit, then they fixed their hair.',
        ),
        L(
          `${n ? `${n} asker ` : 'Askerler '}sarayın önünde toplandı, lordum. Haritada sancağınızla görünecekler; herkes görecek, rakipler de, kayınpederiniz de.`,
          `${n ? `${n} soldier${n === 1 ? ' has' : 's have'} ` : 'The soldiers have '}gathered before the palace, my lord. They’ll show on the map under your banner; everyone will see, your rivals too, and your father-in-law.`,
        ),
        L(
          'Ordu kuruldu, lordum. Sahada en çok iki ordumuz olur; bu onlardan biri, iyi kullanalım. Öbürünü kıskandırmayalım.',
          'The army is raised, my lord. We can field at most two; this is one of them, let’s use it well. And not make the other jealous.',
        ),
        L(
          'Garnizon boşaldı, sancak doldu, lordum. Nereye gitsinler? Benim önerim bir han, ama askerler başka şey önerir.',
          'The garrison is empty, the banner full, my lord. Where shall they go? I suggest an inn, but soldiers would suggest something else.',
        ),
      ])
    }
    case 'king':
      return c.action === 'lead'
        ? any([
            L(
              'Hükümdar ordusunun başına geçti, lordum! Emirler artık elçisiz, hemen gider. Yani ben işsizim; bunu biraz kişisel algıladım.',
              'The ruler has taken command of his army, my lord! Orders now go instantly, without an envoy. Which means I’m out of work; I’ve taken that a little personally.',
            ),
            L(
              'Kral atına bindi, taçlı sancak açıldı, lordum. Askerler bir anda bir karış uzadı; at da, sanırım.',
              'The king has mounted, the crowned banner is unfurled, my lord. The soldiers grew a hand taller on the spot; so did the horse, I think.',
            ),
            L(
              'Ordu kralını buldu, lordum. Zarlar onun savaş yeteneğiyle atılacak; dikkat, kral da düşebilir, attan da, savaşta da.',
              'The army has found its king, my lord. The dice will be rolled with his martial skill; careful, though, kings can fall too, off horses and in battle.',
            ),
            L(
              'Kraliyet sancağı ordunun önünde, lordum. Haritada herkes görecek; düşman da. Altın sancağı uzaktan görmemek zor, saklambaç için kötü bir seçim.',
              'The royal banner leads the army, my lord. Everyone will see it on the map; the enemy too. A golden banner is hard to miss; a poor choice for hide-and-seek.',
            ),
            L(
              'Hükümdar komutada, lordum. Ben elçi olarak işsiz kaldım; bu emirler artık bana uğramıyor. Bahçeyle uğraşırım, belki.',
              'The ruler is in command, my lord. As envoy I find myself unemployed; these orders no longer pass through me. I may take up gardening.',
            ),
            L(
              'Kral askerlerin arasında, lordum. Kraliçe pencereden el salladı; ben de mendilimle. Mendili kraliçenin kedisi kaptı.',
              'The king is among his soldiers, my lord. The queen waved from the window; I waved my handkerchief. The queen’s cat snatched it.',
            ),
          ])
        : any([
            L(
              'Kral saraya döndü, lordum. Ordunun emirleri yine elçiyle gidecek; ben yeniden işe döndüm, ne kadar sevindiğimi anlatamam.',
              'The king has returned to the palace, my lord. The army’s orders will go by envoy again; I’m back in work, I can’t tell you how pleased I am.',
            ),
            L(
              'Hükümdar komutayı bıraktı, lordum. Taçlı sancak saraya geri asıldı; tozunu ben aldım.',
              'The ruler has handed over command, my lord. The crowned banner hangs in the palace again; I dusted it myself.',
            ),
            L(
              'Kral sağ salim sarayda, lordum. Kraliçe rahat bir nefes aldı; ben de, ama benimki işim geri geldiği için.',
              'The king is safe and sound in the palace, my lord. The queen breathed a sigh of relief; so did I, but mine was for getting my job back.',
            ),
            L(
              'Komuta yeniden komutanlarda, lordum. Kral miğferini çıkardı, tacını taktı; miğferin izi alnında kaldı, kimse söylemesin.',
              'Command is back with the commanders, my lord. The king took off his helmet and put on his crown; the helmet left a mark on his brow, nobody mention it.',
            ),
            L(
              'Hükümdar sarayına döndü, lordum. Askerler biraz boyun büktü ama savaş devam eder; benim dizlerim de.',
              'The ruler is back in his palace, my lord. The soldiers drooped a little, but the war goes on; and so do my knees.',
            ),
            L(
              'Kral ordudan ayrıldı, lordum. Ben yine at sırtında koşuşturacağım; dizlerim şimdiden ağrıyor, atım da.',
              'The king has left the army, my lord. I’ll be dashing about on horseback again; my knees ache already, and so does my horse.',
            ),
          ])
    case 'army': {
      const o = (c.order ?? {}) as { kind?: string; siege?: boolean }
      switch (o.kind) {
        case 'move':
          return o.siege
            ? any([
                L(
                  'Ordu kuşatmaya gidiyor, lordum. Kapıya varınca kuşatma başlar; kapının ardındakiler şimdiden ter döküyordur.',
                  'The army is off to lay siege, my lord. The siege begins when it reaches the gate; those behind it are surely sweating already.',
                ),
                L(
                  'Kuşatma emri verildi, lordum. Askerler merdivenleri ve sabırlarını yanlarına aldı; sabır daha hafif ama daha çabuk bitiyor.',
                  'The order to besiege is given, my lord. The soldiers took their ladders and their patience; patience is lighter but runs out faster.',
                ),
                L(
                  'Ordu kasabaya yürüyor, lordum. Kuşatma uzun sürer; sabır kılıçtan önce gelir, kılıç da sabırdan sonra, sırayla.',
                  'The army marches on the town, my lord. Sieges take time; patience comes before the sword, and the sword after patience, in that order.',
                ),
                L(
                  'Sancak kasabaya döndü, lordum. Garnizon bizi uzaktan görünce bütün dualarını bir anda hatırlayacak.',
                  'The banner has turned towards the town, my lord. When the garrison spots us, they’ll remember every prayer they ever knew.',
                ),
                L(
                  'Kuşatmaya yürüyüş başladı, lordum. Ordu kapıda kalmalı; başka yere gönderilirse kuşatma kalkar, kasabalılar da bize el sallar.',
                  'The march to the siege has begun, my lord. The army must stay at the gate; send it elsewhere and the siege lifts, and the townsfolk wave us goodbye.',
                ),
                L(
                  'Askerler kasabanın yolunu tuttu, lordum. Kasabalılar şimdiden kapılarını sürgülüyor; birkaçı da çamaşırlarını topluyor, beklenmedik misafir.',
                  'The soldiers have taken the road to the town, my lord. The townsfolk are already bolting their doors; a few are taking in the washing, unexpected guests.',
                ),
              ])
            : any([
                L(
                  'Ordu yola çıktı, lordum. Hudut dışındaysa emirler elçiyle gider, unutmayın; ben de unutmamaya çalışıyorum.',
                  'The army is on the move, my lord. Beyond the border, orders go by envoy, remember; I’m trying to remember too.',
                ),
                L(
                  'Sancak yürüyor, lordum. Askerler adım sayıyor; çavuş daha yüksek sesle sayıyor, onluktan sonrasını bilmiyor ama.',
                  'The banner is marching, my lord. The soldiers count their steps; the sergeant counts louder, though he doesn’t know what comes after ten.',
                ),
                L(
                  'Emir verildi, lordum. Ordunun tozunu buradan görüyorum; ya da gözlüğüm kirli, ikisinden biri.',
                  'The order is given, my lord. I can see the army’s dust from here; or my spectacles are dirty, one or the other.',
                ),
                L(
                  'Ordu yönünü değiştirdi, lordum. Yürürken moral biraz düşer; hanların yanında toparlanır, hancının fıçısı boşalır.',
                  'The army has changed course, my lord. Morale dips a little on the march; it recovers near inns, and the innkeeper’s casks run dry.',
                ),
                L(
                  'Askerler yeni hedefe yürüyor, lordum. Yolları seçerler, köprülerden geçerler; akıllı askerler. Bunu onlara ben öğrettim, tabii.',
                  'The soldiers march on their new target, my lord. They pick the roads, they cross by the bridges; clever soldiers. I taught them that, naturally.',
                ),
                L(
                  'Davullar yürüyüş havası çalıyor, lordum. Rota haritada kesik çizgiyle; çizgiyi düz tutmaya çalıştım, at hapşırdı.',
                  'The drums beat a marching tune, my lord. The route is on the map as a dashed line; I tried to keep it straight, but the horse sneezed.',
                ),
              ])
        case 'home':
          return any([
            L(
              'Ordu eve dönüyor, lordum. Kışlada sıcak çorba bekliyor; aşçı yarısını tattı ama kalanı yeter.',
              'The army is coming home, my lord. Hot soup awaits at the barracks; the cook tasted half of it, but the rest will do.',
            ),
            L(
              'Geri dönüş emri verildi, lordum. Askerler sevindi; çavuş bunu belli etmemeye çalıştı, ama ıslık çaldığını duydum.',
              'The order to return is given, my lord. The soldiers are glad; the sergeant tried not to show it, but I heard him whistling.',
            ),
            L(
              'Sancak saraya döndü, lordum. Garnizona katıldıklarında moral de toparlanır; meyhanenin morali de, aynı akşam.',
              'The banner has turned for the palace, my lord. Once they rejoin the garrison morale recovers; and the tavern’s morale too, that same evening.',
            ),
            L(
              'Ordu yuvasına dönüyor, lordum. Analar kapılarda bekleyecek, ellerinde terlik; bazıları sevgiden, bazıları başka sebeple.',
              'The army is heading home, my lord. Mothers will wait at the doors, slippers in hand; some out of love, some for other reasons.',
            ),
            L(
              'Eve dönüş, lordum. En sevilen emir budur; askerler başka emirleri iki kez duyar, bunu ilk seferde.',
              'Home, my lord. The best-loved order of all; soldiers need to hear other orders twice, this one they hear the first time.',
            ),
            L(
              'Ordu geri çağrıldı, lordum. Yürürken türkü söylüyorlar; sözleri pek düzgün değil, birkaçı sizinle ilgili ama iyi şeyler, sanırım.',
              'The army has been recalled, my lord. They’re singing on the march; the words aren’t entirely proper, a few are about you, but nice things, I think.',
            ),
          ])
        case 'split':
          return any([
            L(
              'Ordu ikiye bölündü, lordum. Her parça artık kendi yolunda; umarım aynı yolda değil.',
              'The army has split in two, my lord. Each part goes its own way now; not the same way, I hope.',
            ),
            L(
              'İki sancak oldu, lordum. Komutanlar birbirine kaş göz ediyor; kim daha iyi, göreceğiz. Ben şimdiden ikisine de "sizsiniz" dedim.',
              'Two banners now, my lord. The commanders are eyeing each other; we’ll see who’s better. I’ve already told each of them "it’s you."',
            ),
            L(
              'Bölme emri yerine geldi, lordum. İki küçük ordu bir büyükten daha çok yer tutar, daha az zar atar, daha çok mektup yazar.',
              'The split is done, my lord. Two small armies take up more room than one big one, roll fewer dice, and write more letters.',
            ),
            L(
              'Ordu ayrıldı, lordum. Askerler arkadaşlarına el sallıyor; sanki yıllarca görüşmeyecekler. Yarın kantinde görüşecekler.',
              'The army has parted, my lord. The soldiers wave to their comrades as if they’ll not meet for years. They’ll meet in the canteen tomorrow.',
            ),
            L(
              'Bölündük, lordum. Her türden orantılı ayrıldı; kâtip hesabı iki kez yaptı, iki farklı sonuç buldu, ortalamasını aldık.',
              'We’ve divided, my lord. Each kind of troop was split in proportion; the clerk did the sums twice, got two answers, and we took the average.',
            ),
            L(
              'İki ordu, lordum. Biri burada beklesin, biri gitsin; ya da ikisi de gitsin, karar sizin. Ben bekleyenle kalırım, alışkanlık.',
              'Two armies, my lord. One waits here, one goes; or both go, your call. I’ll stay with the one that waits; force of habit.',
            ),
          ])
        case 'merge':
          return any([
            L(
              'Ordular birleşti, lordum. Tek sancak, tek yürek, tek kazan; kazanın başında da büyük kavga.',
              'The armies have joined, my lord. One banner, one heart, one cooking pot; and a great brawl around the pot.',
            ),
            L(
              'İki ordu tek oldu, lordum. Komutanlardan biri kahrından küstü; ona sonra bir görev buluruz, belki elçi yardımcılığı.',
              'Two armies are now one, my lord. One of the commanders is sulking; we’ll find him a job later, assistant envoy perhaps.',
            ),
            L(
              'Birleşme tamam, lordum. Büyük ordu, büyük zar; büyük maaş da, hazinedar haberi aldı, yatağa düştü.',
              'The merger is done, my lord. Big army, big dice; big wages too, the treasurer heard and took to his bed.',
            ),
            L(
              'Askerler kucaklaştı, lordum. Yıllardır ayrıymış gibi; oysa yarım saat olmuştu. Askerler duygusaldır, belli etmezler.',
              'The soldiers embraced, my lord. As if they’d been apart for years; it had been half an hour. Soldiers are sentimental; they just don’t show it.',
            ),
            L(
              'Ordular kaynaştı, lordum. Bu kalabalık düşmanın moralini daha bakarken bozar; kokusuyla da, yürüyüşten sonra.',
              'The armies have merged, my lord. A crowd this size breaks the enemy’s morale at a glance; and with its smell, after a march.',
            ),
            L(
              'Tek ordu, lordum. Haritada sancak büyüdü; rakipler de gördü, birkaçı gözlerini kırpıştırıyor.',
              'One army, my lord. The banner on the map has grown; the rivals have noticed, a few are blinking hard.',
            ),
          ])
        case 'chase':
          return any([
            L(
              'Ordu yağmacıların peşine düştü, lordum. Yağmacılar yavaş yürür; ganimet ağır, vicdanları hafif ama yine de yavaşlar.',
              'The army is after the bandits, my lord. Bandits walk slowly; the loot is heavy, their consciences light, but still they’re slow.',
            ),
            L(
              'Takip başladı, lordum. Askerler izleri okuyor; birinin burnu av köpeğinden keskin. Köpek de bunu kıskanıyor.',
              'The chase is on, my lord. The soldiers are reading the tracks; one has a nose keener than a hound’s. The hound is jealous.',
            ),
            L(
              'Çetenin peşindeyiz, lordum. Yakalarsak ganimet bizim, yollar temiz; tüccarımız da yağmacılara verdiği indirimden pişman olur.',
              'We’re on the band’s trail, my lord. Catch them and the loot is ours and the roads clear; and our merchant will regret the discount he gave the bandits.',
            ),
            L(
              'Ordu yola çıktı, lordum; hedef yağmacılar. Tüccarımız bunu duyunca sevindi, hemen yağmacılara borcunu ödememeye karar verdi.',
              'The army is on the road, my lord; target: bandits. Our merchant was delighted and promptly decided not to pay the bandits what he owes them.',
            ),
            L(
              'Yağmacılara gün doğdu, lordum; ama onlar için iyi bir gün olmayacak. Güneş bile bizden yana.',
              'The bandits’ day has come, my lord; just not the kind they hoped for. Even the sun is on our side.',
            ),
            L(
              'Takip emri verildi, lordum. Yakalayınca haber getiririm; yakalayamazsak da getiririm, daha kısık sesle ve arkadan.',
              'The order to give chase has gone out, my lord. I’ll bring word when we catch them; and if we don’t, I’ll bring it anyway, more quietly and from the back.',
            ),
          ])
        case 'cave':
          return any([
            L(
              'Ordu mağaraya yürüyor, lordum. Klanın yuvasına dayanacağız; kapıyı çalmayacağız, mağaraların kapısı yok zaten.',
              'The army marches on the cave, my lord. We’ll be on the clan’s doorstep; we shan’t knock, caves have no doors anyway.',
            ),
            L(
              'Mağara kuşatması başlıyor, lordum. Meşaleler hazır, askerler pek değil; karanlıktan korkarlar, yarasalardan daha çok.',
              'The cave siege begins, my lord. The torches are ready, the soldiers less so; they fear the dark, and bats even more.',
            ),
            L(
              'Ordu dağ yolunda, lordum. Mağarayı alırsak klan yok olur, ganimet bizim olur; mağara rutubeti de bizim olur, ama onu bırakırız.',
              'The army is on the mountain road, my lord. Take the cave and the clan is finished and the loot is ours; the cave’s damp would be ours too, but we’ll leave that.',
            ),
            L(
              'Kuşatma emri verildi, lordum. Yağmacılar kendi mağaralarında güçlüdür; askerlerimizin sayısı bol olsun, cesareti de en azından ortalama.',
              'The siege order is given, my lord. Bandits are strong in their own caves; let’s hope our soldiers are many, and their courage at least average.',
            ),
            L(
              'Sancak mağaraya dönük, lordum. İzleri sürmenin karşılığını şimdi alacağız; izleri ben sürmüştüm, birazcık, uzaktan.',
              'The banner faces the cave, my lord. Now all that tracking pays off; I did the tracking, a little, from a distance.',
            ),
            L(
              'Ordu klanın mağarasına gidiyor, lordum. Mağaranın kokusu şimdiden geliyor; içinde bir ganimet kokusu da var, çok hafif.',
              'The army is headed for the clan’s cave, my lord. The smell of the cave reaches us already; with a faint whiff of loot in it.',
            ),
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
              L(
                'Filo limanda bekleyecek, lordum. İskeleyi korur; meyhaneyi de, gönüllü olarak.',
                'The fleet will wait in harbour, my lord. It guards the dock; and the tavern too, voluntarily.',
              ),
              L(
                'Gemiler demir attı, lordum. Tayfa iskelede ağ örüyor; birkaçı ağın içinde uyuyor.',
                'The ships have dropped anchor, my lord. The crew are mending nets on the dock; a few are asleep in them.',
              ),
              L(
                'Filo limanda, lordum. Bir saldırı olursa ilk onlar karşılar; olmazsa ilk onlar yemeğe yetişir.',
                'The fleet is in harbour, my lord. If there’s an attack, they’ll meet it first; if not, they’ll be first to dinner.',
              ),
              L(
                'Yelkenler sarıldı, lordum. Gemiler limanda dinleniyor; tayfa meyhanede, aynı işi yapıyorlar.',
                'Sails furled, my lord. The ships rest in harbour; the crew in the tavern, doing the same.',
              ),
              L(
                'Liman nöbeti başladı, lordum. Kaptan dürbünüyle ufku tarıyor; dürbünü ters tutuyordu, söyleyemedim.',
                'The harbour watch has begun, my lord. The captain scans the horizon with his spyglass; he was holding it the wrong way round, I hadn’t the heart to say.',
              ),
              L(
                'Filo evde kalacak, lordum. Denizciler bunu tatil sanıyor; değil, ama ikna edemedim.',
                'The fleet stays home, my lord. The sailors think it’s a holiday; it isn’t, but I couldn’t convince them.',
              ),
            ])
          case 'fish':
            return any([
              L(
                'Filo balığa çıktı, lordum. Ağlar atıldı, martılar heyecanlı; martılar ağlardan daha çok tutuyor.',
                'The fleet has gone fishing, my lord. Nets cast, gulls excited; the gulls are catching more than the nets.',
              ),
              L(
                'Gemiler iskele önünde balık tutacak, lordum. Ambara taze balık girecek; saraya da balık kokusu, kraliçenin kedisi sevinecek.',
                'The ships will fish off the dock, my lord. Fresh fish for the storehouse; and the smell of fish for the palace, the queen’s cat will be delighted.',
              ),
              L(
                'Balık avı başladı, lordum. Kokalar en çok tutar; kadırgalar biraz utangaçtır, balığa bakamıyorlar.',
                'The fishing has begun, my lord. Cogs catch the most; galleys are a bit shy, they can’t look a fish in the eye.',
              ),
              L(
                'Ağlar suya, lordum! Akşam sofrasında balık var; ben de davetliyim sanırım, davet edilmediysem de geliyorum.',
                'Nets in the water, my lord! Fish for supper; I assume I’m invited, and if not, I’m coming anyway.',
              ),
              L(
                'Filo balıkçı oldu, lordum. Kaptan "bu bana yakışmaz" dedi, ama ağını iyi atıyor; kendi ayağını da iki kez yakaladı.',
                'The fleet has turned fishermen, my lord. The captain said "this is beneath me," but he casts a fine net; he’s caught his own foot twice.',
              ),
              L(
                'Balıkçılar yola çıktı, lordum. Korsanlar uzak olsun, balıklar yakın; balıklar bu dileğe katılmıyor.',
                'The fishermen are off, my lord. May the pirates stay far and the fish come near; the fish don’t share that wish.',
              ),
            ])
          case 'hunt':
            return any([
              L(
                'Filo korsan avına çıktı, lordum. Korsanlar yakalandıkça ödül gelir; korsanlar bu düzeni pek sevmiyor.',
                'The fleet is out hunting pirates, my lord. Each pirate caught brings a bounty; the pirates don’t much care for the arrangement.',
              ),
              L(
                'Savaş gemileri ufka açıldı, lordum. Kara yelkenliler artık rahat uyuyamaz; zaten pek uyuyamazlardı, vicdan meselesi.',
                'The warships have sailed for the horizon, my lord. The black sails won’t sleep easy now; not that they ever did, a matter of conscience.',
              ),
              L(
                'Korsan avı başladı, lordum. Ticaret seferlerimiz de daha güvende olur; tüccar bunu duyunca ilk kez "teşekkürler" dedi.',
                'The pirate hunt is on, my lord. Our trading voyages will be safer too; on hearing it, the merchant said "thank you" for the first time ever.',
              ),
              L(
                'Kadırgalar korsan peşinde, lordum. Tayfa kılıçlarını biledi; kürekleri de, nedenini sormadım.',
                'The galleys are after pirates, my lord. The crew have sharpened their swords; and their oars, I didn’t ask why.',
              ),
              L(
                'Filo deniz devriyesinde, lordum. Arada bir gemi batabilir; deniz cömert ama acımasızdır, tıpkı hazinedarımız gibi.',
                'The fleet is on sea patrol, my lord. Now and then a ship may sink; the sea is generous but merciless, just like our treasurer.',
              ),
              L(
                'Korsanlara dikkat, lordum; yani artık korsanlar bize dikkat etsin. Bu cümleyi tayfaya ben yazdım, bayrağa işlettiler.',
                'Beware of pirates, my lord; or rather, let the pirates beware of us. I wrote that line for the crew; they had it stitched on the flag.',
              ),
            ])
          case 'trade':
            return any([
              L(
                `Filo ${order.good ? goodOf(order.good) : 'mal'} yüklü taç limanına yelken açtı, lordum. Kaptan haritayı bu kez doğru tutuyordu, kontrol ettim.`,
                `The fleet has sailed for the crown’s harbour laden with ${order.good ? goodOf(order.good) : 'goods'}, my lord. The captain was holding the map the right way up this time; I checked.`,
              ),
              L(
                'Ambarlar boşaltıldı, gemiler doldu, lordum. Deniz ticareti başladı; fareler de gemiye bindi, onlar da ticarete meraklı.',
                'The storehouses emptied, the ships filled, my lord. Sea trade has begun; the rats came aboard too, they fancy themselves traders.',
              ),
              L(
                'Filo deniz ticaretinde, lordum. Satılan her sefer o taçla ilişkimizi de ısıtır; denizde ısınmak zor bir iştir, takdir edin.',
                'The fleet is trading by sea, my lord. Every voyage that sells warms our relations with that crown too; staying warm at sea is hard work, do appreciate it.',
              ),
              L(
                `Yelkenler şişti, lordum; ${order.good ? goodOf(order.good) : 'yük'} denize açıldı. Korsanlar da bunu biliyorsa eskort iyi olur; korsanlar her şeyi bilir, dedikoducudurlar.`,
                `The sails are full, my lord; the ${order.good ? goodOf(order.good) : 'cargo'} is out to sea. If the pirates know, an escort would be wise; pirates know everything, they’re terrible gossips.`,
              ),
              L(
                'Ticaret filosu uğurlandı, lordum. Limandaki aracılar biraz pay alır; aracılar her zaman biraz pay alır, ben de aracıyım, söylemiş olayım.',
                'We’ve seen the trading fleet off, my lord. The middlemen at the harbour take a cut; middlemen always take a cut, and I’m a middleman too, just so you know.',
              ),
              L(
                'Gemiler yola çıktı, lordum. Kaptana "fırtınadan kaçın" dedim; "korsandan da" diye ekledim, "ve bana bir hediye getirin" diye de bitirdim.',
                'The ships are away, my lord. I told the captain "avoid storms"; I added "and pirates," and finished with "and bring me back a present."',
              ),
            ])
          case 'blockade':
            return any([
              L(
                'Filo abluka için yola çıktı, lordum. Düşmanın iskelesi önünde sıraya dizilecek; nazik ama inatçı bir misafir gibi.',
                'The fleet has set out to blockade, my lord. It will line up before the enemy’s dock; like a polite but stubborn guest.',
              ),
              L(
                'Abluka emri verildi, lordum. Düşmanın balığı ağzında kalacak; düşmanın balıkçısı da ağzı açık kalacak.',
                'The blockade is ordered, my lord. The enemy’s fish will stay in the sea; and the enemy’s fishermen will be left gaping like one.',
              ),
              L(
                'Kadırgalar düşmanın iskelesine gidiyor, lordum. Oradaki gemilerle çarpışırsak kazanmalıyız; kaybetmek iyi bir abluka tekniği değil.',
                'The galleys are bound for the enemy’s dock, my lord. If we clash with the ships there, we must win; losing is not a good blockade technique.',
              ),
              L(
                'Abluka yolda, lordum. Başarılı olursa düşmanın deniz ticareti durur; düşmanın tüccarı da bizim tüccarımızdan daha çok ağlar.',
                'The blockade is on its way, my lord. If it works, the enemy’s sea trade stops; and their merchant will weep more than ours ever has.',
              ),
              L(
                'Filo düşman sularına yöneldi, lordum. Tayfa şarkı söylüyor; korkudan mı neşeden mi bilmiyorum, sesleri pek fark etmiyor.',
                'The fleet is heading into enemy waters, my lord. The crew are singing; from fear or joy I can’t tell, they sound much the same.',
              ),
              L(
                'Ablukacılarımız yelken açtı, lordum. Düşmanın iskelesi yakında bizim kadırgalarla dolu olacak; düşmanın gözleri de yaşla.',
                'Our blockaders have set sail, my lord. The enemy’s dock will soon be full of our galleys; and the enemy’s eyes full of tears.',
              ),
            ])
          case 'raid':
            return any([
              L(
                'Filo kıyı akınına çıktı, lordum. Düşmanın depolarından pay almaya gidiyor; pay demek, hepsi demek değil, söz verdiler.',
                'The fleet is off on a coastal raid, my lord. It’s going to take a share of the enemy’s stores; a share, not all of it, they promised.',
              ),
              L(
                'Akıncılar denizde, lordum. Kazanırlarsa ganimetle dönerler; kaybederlerse hikâyeyle, o da az değil.',
                'The raiders are at sea, my lord. If they win they’ll return with loot; if they lose, with a story, which is something.',
              ),
              L(
                'Kıyı akını başladı, lordum. Gemiler taşıyabildiği kadar yüklenecek; tayfa ceplerine de, onu sayamayız.',
                'The coastal raid has begun, my lord. The ships will load as much as they can carry; and the crew their pockets, which we can’t count.',
              ),
              L(
                'Filo düşman kıyılarına gidiyor, lordum. Tayfa ganimet çuvallarını şimdiden katladı; biri benim yastık kılıfımdı.',
                'The fleet is bound for the enemy’s shores, my lord. The crew have already folded their loot sacks; one of them was my pillowcase.',
              ),
              L(
                'Akın emri verildi, lordum. Düşmanın gemileri karşı çıkarsa çarpışacağız; çıkmazsa da düşmanın ambarına kibarca gireceğiz.',
                'The raid is ordered, my lord. If the enemy’s ships come out, we fight; if not, we’ll politely let ourselves into their storehouse.',
              ),
              L(
                'Yelkenler düşmana dönük, lordum. Akın kısa sürer, hatırası uzun; düşmanın hatırası daha da uzun.',
                'Sails turned towards the enemy, my lord. A raid is short, the memory long; the enemy’s memory longer still.',
              ),
            ])
          case 'sortie':
            return any([
              L(
                'Filo ablukayı yarmaya çıkıyor, lordum! Bu kadar heyecanı yaşımda kaldıramam, oturuyorum.',
                'The fleet is sailing out to break the blockade, my lord! I can’t take this much excitement at my age; I’m sitting down.',
              ),
              L(
                'Gemilerimiz abluka filosunun üstüne gidiyor, lordum. Kazanırsak iskelemiz kurtulur; balıkçılarımız da işsizlikten.',
                'Our ships are going for the blockading fleet, my lord. If we win, our dock is saved; and our fishermen from unemployment.',
              ),
              L(
                'Ablukayı yarma emri verildi, lordum. Tayfa dişlerini sıktı; birkaçında sıkacak diş kalmamıştı, onlar dudağını ısırdı.',
                'The order to break the blockade is given, my lord. The crew gritted their teeth; a few had no teeth left to grit, so they bit their lips.',
              ),
              L(
                'Kadırgalar çıkıyor, lordum. Düşmanın gemileri bunu beklemiyordu; açıkçası ben de beklemiyordum.',
                'The galleys are sailing out, my lord. The enemy’s ships didn’t expect this; frankly, neither did I.',
              ),
              L(
                'Filo saldırıya geçti, lordum. Balığımız, ticaretimiz bu çarpışmada; akşam yemeğimiz de.',
                'The fleet is attacking, my lord. Our fish and our trade ride on this fight; and our supper.',
              ),
              L(
                'Ablukaya karşı çıkış, lordum. Rüzgâr bizden yana olsun; olmazsa kürekçiler bizden yana olsun.',
                'A sortie against the blockade, my lord. May the wind be with us; and if not, the rowers.',
              ),
            ])
          default:
            return null
        }
      }
      switch (c.action) {
        case 'form':
          return any([
            L(
              'Limandan yeni bir filo çıktı, lordum. Sancak direkte dalgalanıyor; biraz ters asılmış, kimse fark etmeden düzelttirdim.',
              'A new fleet has left the harbour, my lord. The banner flies from the mast; it was hung a bit upside down, I had it fixed before anyone noticed.',
            ),
            L(
              'Filo kuruldu, lordum. Kaptan atandı; eski bir korsanmış, ama tövbeli. Tövbe ettiğine yemin etti, korsan yemini.',
              'The fleet is formed, my lord. A captain is appointed; a former pirate, but reformed. He swore he’d reformed; a pirate’s oath.',
            ),
            L(
              'Gemiler sıraya girdi, lordum. Bir filo, bir sancak, bir görev bekliyor; bir de çok aç bir tayfa.',
              'The ships are in line, my lord. One fleet, one banner, awaiting a task; and one very hungry crew.',
            ),
            L(
              'Yeni filo hazır, lordum. Balık mı, ticaret mi, korsan mı; emir sizin, deniz tutması tayfanın.',
              'The new fleet is ready, my lord. Fish, trade or pirates; the orders are yours, the seasickness the crew’s.',
            ),
            L(
              'Filo limandan ayrıldı, lordum. En çok iki filo çıkarabiliriz; bu onlardan biri, öbürü kıskanmasın.',
              'The fleet has left the harbour, my lord. We can put out at most two fleets; this is one, let’s not make the other jealous.',
            ),
            L(
              'Tayfalar gemilere bindi, lordum. Ben iskelede kaldım; deniz beni tutar, ben de denizi tutamam.',
              'The crews have boarded, my lord. I stayed on the dock; the sea doesn’t agree with me, and I’ve never agreed with it.',
            ),
          ])
        case 'split':
          return any([
            L(
              'Filo ikiye bölündü, lordum. Kaptanlar ayrılırken "sende kalsın" diye pusulayı birbirine itti; ikisi de pusulayı bilmiyor.',
              'The fleet has split in two, my lord. Parting, the captains pushed the compass at each other saying "you keep it"; neither knows how to use one.',
            ),
            L(
              'İki filo oldu, lordum. Kaptanlar artık birbiriyle yarışacak; kaybeden akşam yemeğini ısmarlayacak, öyle anlaştılar.',
              'Two fleets now, my lord. The captains will race each other; the loser buys supper, so they’ve agreed.',
            ),
            L(
              'Gemiler ayrıldı, lordum. Biri bir yana, biri öbür yana; ben ortada kaldım, karada.',
              'The ships have parted, my lord. One this way, one that; and I’m left in the middle, on land.',
            ),
            L(
              'Filo bölündü, lordum. Kaptanlardan biri haritayı aldı, öbürü pusulayı; umarım değiş tokuş ederler, yoksa ikisi de kaybolur.',
              'The fleet is divided, my lord. One captain took the map, the other the compass; I hope they swap, or they’ll both get lost.',
            ),
            L(
              'Bölme tamam, lordum. Her filonun kendi görevi olabilir artık; kendi kaptanı, kendi şikâyetleri de.',
              'The split is done, my lord. Each fleet can have its own task now; its own captain, and its own complaints.',
            ),
            L(
              'İki ayrı filo, lordum. Denizler geniş, ikisine de yer var; meyhanede ise yer yok, orada kavga çıkar.',
              'Two separate fleets, my lord. The seas are wide, there’s room for both; not in the tavern, though, there’ll be a brawl.',
            ),
          ])
        case 'merge':
          return any([
            L(
              'Filolar birleşti, lordum. Daha büyük filo, daha büyük güç; daha büyük meyhane hesabı.',
              'The fleets have joined, my lord. Bigger fleet, greater strength; bigger tavern bill.',
            ),
            L(
              'Gemiler tek sancak altında toplandı, lordum. Sancak bu kadar gemiyi görünce gururla dalgalandı; ya da rüzgâr çıktı.',
              'The ships are gathered under one banner, my lord. The banner fluttered with pride at the sight of so many ships; or the wind picked up.',
            ),
            L(
              'Birleşme tamam, lordum. Korsanlar bu filoyu görünce rotalarını değiştirir; bir kısmı mesleklerini de.',
              'The merger is done, my lord. Pirates who see this fleet will change course; some will change careers.',
            ),
            L(
              'İki kaptan bir oldu, lordum; daha doğrusu biri kaptan kaldı, öbürü kâtip oldu. Kâtip olan bana dert yandı, iki saat.',
              'Two captains became one, my lord; or rather, one stayed captain and the other became a clerk. The clerk poured out his woes to me, for two hours.',
            ),
            L(
              'Filo büyüdü, lordum. Haritada etiketi de büyüdü; kaptanın egosu da, maalesef.',
              'The fleet has grown, my lord. Its label on the map grew too; and the captain’s ego, alas.',
            ),
            L(
              'Gemiler kaynaştı, lordum. Tayfalar birbirine eski hikâyelerini anlatıyor; hepsi aynı hikâye, her seferinde balina büyüyor.',
              'The ships have merged, my lord. The crews are swapping old tales; it’s all the same tale, and the whale gets bigger each time.',
            ),
          ])
        case 'dock':
          return any([
            L(
              'Filo limana bağlandı, lordum. Gemiler yeniden liman gemileri; tayfalar da yeniden meyhane müdavimi.',
              'The fleet is moored in harbour, my lord. The ships are harbour ships again; and the crews tavern regulars again.',
            ),
            L(
              'Filo dağıtıldı, lordum; gemiler iskeleye yanaştı. Bir tanesi biraz sert yanaştı, iskele hafif yamuldu.',
              'The fleet is disbanded, my lord; the ships have come alongside the dock. One came alongside rather hard; the dock is slightly bent.',
            ),
            L(
              'Tayfa karaya çıktı, lordum. Gemiler limanda dinleniyor; tayfa dinlenmiyor, şarkı söylüyor.',
              'The crew have gone ashore, my lord. The ships rest in harbour; the crew don’t rest, they sing.',
            ),
            L(
              'Filo limana katıldı, lordum. İskeleyi savunurlar; özellikle de iskelenin yanındaki meyhaneyi.',
              'The fleet has rejoined the harbour, my lord. They’ll defend the dock; especially the tavern beside it.',
            ),
            L(
              'Sancak indirildi, lordum. Gemiler limana bağlandı; düğümleri ben kontrol ettim, ikisini çözdüm, yanlışlıkla.',
              'The banner is lowered, my lord. The ships are tied up; I checked the knots, and untied two, by accident.',
            ),
            L(
              'Filo eve döndü ve dağıldı, lordum. Kaptan da emekli olmak istiyor; ona bir fıçı şarap gönderdim, fikrini değiştirdi.',
              'The fleet came home and disbanded, my lord. The captain wants to retire too; I sent him a cask of wine, he changed his mind.',
            ),
          ])
        case 'recall':
          return any([
            L(
              'Filo geri çağrıldı, lordum. Yol aldığı kadar geri dönecek; denizde geri vites yok, bunu kaptana ben anlattım.',
              'The fleet is recalled, my lord. It must sail back as far as it came; there’s no reverse at sea, I explained that to the captain myself.',
            ),
            L(
              'Geri dönüş emri, lordum. Yelkenler eve doğru çevrildi; tayfa da yüzünü meyhaneye.',
              'Orders to return, my lord. The sails are turned for home; and the crew’s faces for the tavern.',
            ),
            L(
              'Filo dönüyor, lordum. Tayfa sevindi; deniz yorgunu adamlar, denizden de yorgunlar.',
              'The fleet is coming back, my lord. The crew are glad; sea-weary men, and weary of the sea.',
            ),
            L(
              'Kaptana dönüş emri gönderdik, lordum. Ulak yüzerek gitmedi, merak etmeyin; sandalla gitti, zor da olsa.',
              'We’ve sent the captain orders to return, my lord. The messenger didn’t swim, don’t worry; he went by rowing boat, though it was a struggle.',
            ),
            L(
              'Filo görevi bıraktı, lordum. Eve dönüyorlar; bir tanesi "unuttuğumuz bir şey vardı" dedi, gemi değildi umarım.',
              'The fleet has abandoned its task, my lord. They’re coming home; one said "we forgot something," I hope it wasn’t a ship.',
            ),
            L(
              'Gemiler geri geliyor, lordum. Limanda onları bir fıçı ve bir ziyafet bekliyor; fıçıyı ben bekletiyorum, bir yudum aldım.',
              'The ships are returning, my lord. A cask and a feast await them in harbour; I’m minding the cask, I’ve had a sip.',
            ),
          ])
        case 'sail':
          return any([
            L(
              'Filo yelken açtı, lordum. Rotası haritada; kaptan rotaya uyacağına yemin etti, rüzgâr etmedi.',
              'The fleet has set sail, my lord. Its course is on the map; the captain swore to keep to it, the wind made no such promise.',
            ),
            L(
              'Gemiler yola çıktı, lordum. Suyun ortasından giderler; kıyıdan uzak, kayadan uzak, benden de uzak.',
              'The ships are under way, my lord. They keep to mid-water; away from the shore, away from the rocks, and away from me.',
            ),
            L(
              'Filo yeni yerine gidiyor, lordum. Rüzgâr arkadan essin; önden eserse kürekçiler essin.',
              'The fleet is heading for its new station, my lord. May the wind blow from astern; if it blows from ahead, may the rowers blow harder.',
            ),
            L(
              'Kaptan rotayı çizdi, lordum. Vardıkları yerde demirleyecekler; demiri bu kez gemiye bağlamayı unutmazlarsa.',
              'The captain has charted the course, my lord. They’ll anchor when they arrive; provided they remember to tie the anchor to the ship this time.',
            ),
            L(
              'Yelkenler şişti, lordum. Martılar da peşlerinde; martılar her zaman bir şey bilir.',
              'The sails are full, my lord. The gulls are following; gulls always know something.',
            ),
            L(
              'Filo hareket etti, lordum. Kürekçiler tempo tutuyor; ben de ayağımla. Ayağım kramp girdi, tempo da bozuldu.',
              'The fleet is moving, my lord. The rowers keep time; so do I, with my foot. My foot cramped, and the rhythm went to pieces.',
            ),
          ])
        case 'chase':
          return any([
            L(
              'Filo korsan teknesinin peşine düştü, lordum. Kaptan "kara yelkenden nefret ederim" dedi; yelkenciliği de pek sevmez zaten.',
              'The fleet is chasing the pirate boat, my lord. The captain said "I hate black sails"; he’s not fond of sailing in general either.',
            ),
            L(
              'Korsanların önü kesilecek, lordum. Filo tam yelken yolda; korsanlar şimdiden kendi aralarında suçlu arıyor.',
              'We’ll cut the pirates off, my lord. The fleet is under full sail; the pirates are already blaming each other.',
            ),
            L(
              'Takip başladı, lordum. Korsanlar bizden yavaş; yakalarsak batırırız, batırınca da ödül alırız. Güzel bir zincir.',
              'The chase is on, my lord. The pirates are slower than us; catch them and we sink them, sink them and we get a bounty. A lovely chain of events.',
            ),
            L(
              'Kara yelkenlinin peşindeyiz, lordum. Batırırsak ödül de bizim; papağanları varsa, onu da isterim.',
              'We’re after the black sail, my lord. Sink her and the bounty is ours; and if they have a parrot, I want it.',
            ),
            L(
              'Kaptan "kara yelkeni görürsem bırakmam" dedi, lordum. Sözünün eri bir adam; bir keresinde kendi yelkenini de kovaladı, gece karanlıktı.',
              'The captain said "once I see a black sail I don’t let go," my lord. A man of his word; once he chased his own sail, it was a dark night.',
            ),
            L(
              'Filo korsanlara doğru, lordum. Kadırgalar çektirileri yener; dua edelim yeterince kadırgamız olsun, yoksa dua edelim yeterince hızlı olalım.',
              'The fleet bears down on the pirates, my lord. Galleys beat raiders; let us pray we have enough galleys, and if not, that we’re fast enough.',
            ),
          ])
        case 'unchase':
          return any([
            L(
              'Filo takibi bıraktı, lordum. Korsanlar arkalarına bakıp el salladı; terbiyesizler.',
              'The fleet has given up the chase, my lord. The pirates looked back and waved; the cheek of it.',
            ),
            L(
              'Korsanların peşinden vazgeçildi, lordum. Bugün onların şanslı günü; bizim de, ödülü kaçırdık ama gemiyi kaçırmadık.',
              'We’ve let the pirates go, my lord. Their lucky day; ours too, we lost the bounty but not a ship.',
            ),
            L(
              'Takip bitti, lordum. Kaptan biraz homurdandı ama emir emirdir; homurtusu iki saat sürdü.',
              'The chase is over, my lord. The captain grumbled a little, but orders are orders; the grumbling lasted two hours.',
            ),
            L(
              'Filo durdu, lordum. Korsanlar uzaklaşıyor; başka gün, başka rüzgâr.',
              'The fleet has stopped, my lord. The pirates are sailing off; another day, another wind.',
            ),
            L(
              'Takibi bıraktık, lordum. Deniz geniş, korsan bol; yine karşılaşırız, onlar da biliyor, bu yüzden pek sevinmediler.',
              'We’ve broken off the chase, my lord. The sea is wide and pirates plenty; we’ll meet again, and they know it, which is why they didn’t celebrate much.',
            ),
            L(
              'Filo yeni emri bekliyor, lordum. Korsanlar bizden kurtuldu; bu sefer. Kaptan kara yelkenin rengini not aldı.',
              'The fleet awaits new orders, my lord. The pirates have escaped us; this time. The captain made a note of the black sail’s colour.',
            ),
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
            L(
              'Elçimiz tatlı sözlerle yola çıktı, lordum. İlişkimiz biraz ısınacak; sözleri ben yazdım, tatlıyı da ben yedim.',
              'Our envoy has set off with sweet words, my lord. Relations will warm a little; I wrote the words, and ate the sweets.',
            ),
            L(
              'Nezaket elçisi yolda, lordum. Yanında bir kese ve benim yazdığım üç iltifat var; üçü de aynı iltifat, farklı kelimelerle.',
              'The courtesy envoy is on his way, my lord. He carries a purse and three compliments I wrote; all three the same compliment, in different words.',
            ),
            L(
              'İlişkiyi geliştirmek için elçi gönderildi, lordum. Varınca teklif karşı tarafa düşer; inşallah ayağına düşmez.',
              'An envoy has been sent to improve relations, my lord. When he arrives, the offer falls into their hands; not onto their feet, let’s hope.',
            ),
            L(
              'Elçimiz şapkasını düzeltti, gülümsemesini taktı, lordum. Dost kazanmaya gidiyor; gülümsemesi biraz eğreti, aynada çalıştı.',
              'Our envoy straightened his hat and put on his smile, my lord. He’s off to win friends; the smile is a little forced, he practised in the mirror.',
            ),
            L(
              'Bir dostluk elçisi yolda, lordum. İtibarımız iyiyse sözlerimiz daha çok tutar; kötüyse sözlerimiz de kapıdan döner.',
              'A goodwill envoy is on the road, my lord. If our reputation is good, our words carry further; if it’s bad, our words get turned away at the door.',
            ),
            L(
              'Elçi karşı saraya gidiyor, lordum. Ben gidecektim ama dizlerim izin vermedi; dizlerim diplomasiye karşı.',
              'The envoy is off to the other court, my lord. I was going to go, but my knees wouldn’t allow it; my knees are opposed to diplomacy.',
            ),
          ])
        case 'gift':
          return any([
            L(
              `Elçimiz ${c.gold ? `${c.gold} altınlık ` : ''}bir hediyeyle yola çıktı, lordum. Yolda bir tane bile eksilmeyecek; saydım, mühürledim, elçiyi de sıkı tembihledim.`,
              `Our envoy has set off with a gift${c.gold ? ` of ${c.gold} gold` : ''}, my lord. Not a single coin will go missing on the way; I counted, sealed, and gave the envoy a stern talking-to.`,
            ),
            L(
              `Hediye sandığı yolda, lordum. ${c.gold ? `${c.gold} altın; ` : ''}gönüller altınla kolay açılır, kapılar ise daha kolay.`,
              `The gift chest is on its way, my lord. ${c.gold ? `${c.gold} gold; ` : ''}hearts open easily to gold, and doors more easily still.`,
            ),
            L(
              'Hediye gönderildi, lordum. Karşı taraf sandığı açınca yüzü gülecek; kapatınca da daha fazlası var mı diye arkasına bakacak.',
              'The gift is sent, my lord. They’ll smile when they open the chest; and when they close it, they’ll look behind it to see if there’s more.',
            ),
            L(
              'Kesenin ağzı açıldı, lordum. Bu altın oraya varınca ilişki de ısınır; hazinedarın ilişkisi bizimle soğudu ama.',
              'The purse strings are loosened, my lord. When this gold arrives, relations warm; the treasurer’s relations with us have cooled, though.',
            ),
            L(
              'Hediyemiz yolda, lordum. Ben sandığa bir de mektup koydum; altın konuşur, mektup süsler, ben de imzalarım.',
              'Our gift is on its way, my lord. I tucked a letter into the chest; gold talks, the letter embellishes, and I sign.',
            ),
            L(
              'Cömertliğiniz yola çıktı, lordum. Hediye ne kadar büyükse ilişki o kadar ısınır; hazinedar ne kadar büyükse o kadar ağlar.',
              'Your generosity is on the road, my lord. The bigger the gift, the warmer the relations; and the louder the treasurer weeps.',
            ),
          ])
        case 'tribute':
          return any([
            L(
              `Haraç isteğimiz yolda, lordum${c.gold ? `: turda ${c.gold} altın` : ''}. Kabul ederlerse hazine her tur dolar; etmezlerse elçimiz kaçmayı bilir.`,
              `Our tribute demand is on its way, my lord${c.gold ? `: ${c.gold} gold a round` : ''}. If they accept, the treasury fills every round; if not, our envoy knows how to run.`,
            ),
            L(
              'Elçimiz haraç istemeye gitti, lordum. Kaşlarını çatmayı biliyor; ben öğrettim, aynada saatlerce çalıştık.',
              'Our envoy has gone to demand tribute, my lord. He knows how to frown; I taught him, we practised in the mirror for hours.',
            ),
            L(
              'Haraç talebi gönderildi, lordum. Reddederlerse ilişki çok düşer; kabul ederlerse biraz. Her durumda düşer, ama haraç güzeldir.',
              'The tribute demand is sent, my lord. If they refuse, relations drop a lot; if they accept, a little. Either way they drop, but tribute is lovely.',
            ),
            L(
              'Elçimiz sert bir mektupla yolda, lordum. Karşı lord okurken şarabını dökecek; mektubu lekesiz bir köşeye yazdım ki okunsun.',
              'Our envoy is on his way with a stern letter, my lord. The other lord will spill his wine reading it; I wrote it in an unstained corner so it stays legible.',
            ),
            L(
              'Haraç istendi, lordum. Cevap gelince haber getiririm; kızgın bir cevap olabilir, ben de kızgın bir sesle okurum.',
              'Tribute has been demanded, my lord. I’ll bring word when the answer comes; it may be an angry one, and I’ll read it in an angry voice.',
            ),
            L(
              'Haraç elçisi yola düştü, lordum. Güçlü olan ister, akıllı olan verir; bakalım komşumuz hangisi. Ben ikisine de bahse girmedim.',
              'The tribute envoy is on the road, my lord. The strong demand, the wise pay; we’ll see which our neighbour is. I’ve bet on neither.',
            ),
          ])
        case 'alliance':
          return any([
            L(
              'İttifak teklifimiz yolda, lordum. Kabul ederlerse ordularımız birbirini korur; meyhanede de birbirine ısmarlar.',
              'Our alliance offer is on its way, my lord. If they accept, our armies protect each other; and buy each other rounds in the tavern.',
            ),
            L(
              'Elçimiz ittifak sözleşmesiyle gitti, lordum. Mührü ben bastım, en güzel yerine; biraz kaydı, ama sanatsal oldu.',
              'Our envoy has gone with the treaty of alliance, my lord. I pressed the seal myself, in the finest spot; it slipped a little, but it looks artistic.',
            ),
            L(
              'İttifak teklifi gönderildi, lordum. Dost kılıcı yanınızda, düşman kılıcı karşınızda olur; arkanızda olmasın da.',
              'The alliance offer is sent, my lord. A friend’s sword at your side, the enemy’s before you; just so long as none is behind you.',
            ),
            L(
              'Bir müttefik arıyoruz, lordum. Elçi karşı sarayda en iyi yüzünü takınacak; ikinci en iyi yüzü yok zaten.',
              'We’re looking for an ally, my lord. The envoy will put on his best face at the other court; he hasn’t a second-best one anyway.',
            ),
            L(
              'İttifak elçisi uğurlandı, lordum. İttifakı bozmak ilişkiyi çok düşürür; iyi seçtiğimizi umalım, ben iyi seçtiğimizi söyledim zaten.',
              'We’ve seen the alliance envoy off, my lord. Breaking an alliance badly damages relations; let’s hope we chose well; I’ve already told everyone we did.',
            ),
            L(
              'Teklif yolda, lordum. Kabul gelirse ilk kadehi birlikte kaldırırız; ikinci kadehi ben kaldırırım, yalnız.',
              'The offer is on its way, my lord. If they accept, we’ll raise the first cup together; the second I’ll raise alone.',
            ),
          ])
        case 'peace':
          return any([
            L(
              `Barış teklifimiz yolda, lordum${terms?.kind === 'white' ? ': beyaz barış' : ''}. Kabul ederlerse kılıçlar kınına girer; kınını kaybeden askerler çok.`,
              `Our peace offer is on its way, my lord${terms?.kind === 'white' ? ': a white peace' : ''}. If they accept, swords go back in their scabbards; plenty of soldiers have lost theirs.`,
            ),
            L(
              'Elçimiz beyaz bayrakla yola çıktı, lordum. Umarım bayrağı tanırlar; yıkandıktan sonra biraz griye döndü.',
              'Our envoy has set off under a white flag, my lord. I hope they recognise it; it’s gone a bit grey in the wash.',
            ),
            L(
              'Barış teklifi gönderildi, lordum. Savaş puanımız yüksekse kabul etmekten başka çareleri kalmaz; düşüksek de dua ederiz.',
              'The peace offer is sent, my lord. If our war score is high, they’ll have no choice but to accept; if it’s low, we pray.',
            ),
            L(
              'Elçi barış antlaşmasını taşıyor, lordum. Mürekkep kurumadan bir savaş daha çıkmasın; mürekkebi hızlı kuruyan cinsten seçtim.',
              'The envoy carries the peace treaty, my lord. Let no new war break out before the ink dries; I chose the quick-drying sort.',
            ),
            L(
              'Barış istedik, lordum. Halk bunu duyunca derin bir nefes aldı; askerler daha da derin aldı.',
              'We’ve sued for peace, my lord. The people drew a deep breath on hearing it; the soldiers a deeper one.',
            ),
            L(
              'Barış elçisi yolda, lordum. Ben savaşı da barışı da bilirim; barış daha az ses yapar ve daha az sargı beziyle biter.',
              'The peace envoy is on the road, my lord. I’ve known both war and peace; peace makes less noise and ends with fewer bandages.',
            ),
          ])
        case 'insult':
          return any([
            L(
              'Elçimiz hakaret götürmeye gitti, lordum. Varınca ilişki çok düşer; onlar da savaş gerekçesi kazanır. Ama değer, sözler çok güzel.',
              'Our envoy has gone to deliver an insult, my lord. When he arrives, relations plummet; and they gain a casus belli. But it’s worth it, the words are exquisite.',
            ),
            L(
              'Hakaret elçisi yolda, lordum. Ona en iyi sözlerimi verdim; yani en kötülerini. Bir ömür biriktirmiştim.',
              'The insult envoy is on his way, my lord. I gave him my best words; that is, my worst. I’d been saving them all my life.',
            ),
            L(
              'Elçimiz boğazını temizledi, lordum. Söyleyeceklerini duyan karşı lord bir hafta uyuyamaz; annesi de.',
              'Our envoy has cleared his throat, my lord. Once the other lord hears what he has to say, he won’t sleep for a week; nor will his mother.',
            ),
            L(
              'Hakaretimiz yola çıktı, lordum. Diplomaside buna "sert bir mektup" denir; biz yalnızca sesli ve kafiyeli söylüyoruz.',
              'Our insult is on the road, my lord. In diplomacy it’s called "a strongly worded letter"; we merely deliver it aloud and in rhyme.',
            ),
            L(
              'Elçi hakaretleri ezberledi, lordum. Bir tanesini ben ekledim; keçilerle ilgili. Uzun hikâye, keçiler suçsuz.',
              'The envoy has memorised the insults, my lord. I added one myself; it concerns goats. Long story; the goats are innocent.',
            ),
            L(
              'Hakaret yolda, lordum. Sonra bana kızmayın; ben yalnızca yazdım, düzelttim, kafiyeledim ve gönderdim. Taşımadım.',
              'The insult is on its way, my lord. Don’t be cross with me later; I only wrote it, edited it, rhymed it and sent it. I didn’t carry it.',
            ),
          ])
        default:
          return null
      }
    }
    case 'respond':
      return c.accept
        ? any([
            L(
              'Teklifi kabul ettiniz, lordum. Elçi cevabı götürüyor; koşarak, siz fikrinizi değiştirmeden.',
              'You’ve accepted the offer, my lord. The envoy is taking the answer; at a run, before you change your mind.',
            ),
            L(
              'Kabul cevabı yolda, lordum. Karşı saray bunu duyunca sevinecek; şaşıracak da, ummuyorlardı galiba.',
              'The acceptance is on its way, my lord. The other court will be pleased; surprised too, I don’t think they expected it.',
            ),
            L(
              'Evet dediniz, lordum. Mühürlendi ve gönderildi; mührü ben bastım, bu sefer kaymadı.',
              'You said yes, my lord. Sealed and sent; I pressed the seal myself, and it didn’t slip this time.',
            ),
            L(
              'Anlaşma tamam, lordum. Elçi eğilip selam verdi ve yola koyuldu; eğilirken beli tuttu, doğrulması biraz sürdü.',
              'The deal is done, my lord. The envoy bowed and set off; his back seized as he bowed, straightening up took a while.',
            ),
            L(
              'Teklif kabul edildi, lordum. Ben de bu anı anılarıma yazıyorum; anılarımın altıncı cildi, en heyecanlı bölümü.',
              'The offer is accepted, my lord. I’m writing this moment into my memoirs; volume six, the most thrilling chapter.',
            ),
            L(
              'Kabul, lordum. Bazen en güçlü söz "evet"tir; bazen de "olur" ama o daha az görkemli.',
              'Accepted, my lord. Sometimes the mightiest word is "yes"; sometimes it’s "all right," but that’s less majestic.',
            ),
          ])
        : any([
            L(
              'Teklifi reddettiniz, lordum. Elçi yüzünü buruşturdu ve gitti; yüzü zaten buruşuktu, ama bu sefer bilerek.',
              'You’ve refused the offer, my lord. The envoy screwed up his face and left; it was already wrinkled, but this time on purpose.',
            ),
            L(
              'Ret cevabı yolda, lordum. Karşı taraf pek hoşlanmayacak; ben de pek hoşlanmazdım, ama ben değilim.',
              'The refusal is on its way, my lord. They won’t like it much; I wouldn’t either, but I’m not them.',
            ),
            L(
              'Hayır dediniz, lordum. Kibarca söyledim; yine de kapıyı çarparak çıktı. Kapıyı tamir ettirdim, faturasını onlara gönderdim.',
              'You said no, my lord. I put it politely; still he slammed the door on his way out. I had the door fixed and sent them the bill.',
            ),
            L(
              'Teklif geri çevrildi, lordum. İlişki bundan etkilenebilir, haberiniz olsun; haberiniz olunca da benim haberim olsun.',
              'The offer is turned down, my lord. Relations may suffer, I should mention; and if they do, you’ll hear it from me first.',
            ),
            L(
              'Elçiyi eli boş gönderdik, lordum. Yolda ne düşündüğünü tahmin edebiliyorum; çoğu kafiyeli ve hiçbiri kibar değil.',
              'We’ve sent the envoy away empty-handed, my lord. I can guess what he’s thinking on the road; most of it rhymes and none of it is polite.',
            ),
            L(
              'Reddedildi, lordum. Bazen en güçlü söz de "hayır"dır; "belki" de var, ama onu hep ben kullanıyorum.',
              'Refused, my lord. Sometimes the mightiest word is "no"; there’s also "perhaps," but I’m always the one using that.',
            ),
          ])
    case 'declareWar':
      return any([
        L(
          'Savaş ilan edildi, lordum! Davullar çalıyor, sancaklar açılıyor; hazinedar yatağın altına girdi.',
          'War is declared, my lord! Drums beating, banners unfurling; the treasurer has crawled under his bed.',
        ),
        L(
          'Savaş elçisi yolda, lordum. Bu haber vardığında bütün lobi duyacak; birkaçı şimdiden patlamış mısır hazırlıyor.',
          'The herald of war is on his way, my lord. When the news arrives the whole lobby will hear it; a few are already settling in to watch.',
        ),
        L(
          'Kılıçlar kınından çıktı, lordum. Gerekçesiz savaş açtıysak öbür lordlar da bize biraz soğuyacak; zaten pek sıcak değillerdi.',
          'Swords are drawn, my lord. If we went to war without a casus belli, the other lords will cool towards us a little; they weren’t especially warm anyway.',
        ),
        L(
          'Savaş başladı, lordum. Askerler sabırsız, analar endişeli; ben ikisi birden, artı biraz da hazımsızlık.',
          'The war has begun, my lord. The soldiers are impatient, the mothers anxious; I’m both, plus a touch of indigestion.',
        ),
        L(
          'Savaş ilanı mühürlendi, lordum. Artık geri dönüş yok; ya da barış teklifine kadar yok, ki ben onu da şimdiden yazmaya başladım, ne olur ne olmaz.',
          'The declaration of war is sealed, my lord. There’s no turning back now; or not until a peace offer, which I’ve already started drafting, just in case.',
        ),
        L(
          'Ordulara haber gitti, lordum: düşmanla karşılaşınca muharebe olacak. Ben savaşın en tehlikeli yerinde olacağım: mektupların arasında.',
          'Word has gone to the armies, my lord: meet the enemy and there will be battle. I shall be in the most dangerous spot of the war: among the letters.',
        ),
      ])
    case 'breakAlliance':
      return any([
        L(
          'İttifak bozuldu, lordum. Eski dostumuz bunu unutmayacak; eski dostlar hiçbir şeyi unutmaz, özellikle borçları.',
          'The alliance is broken, my lord. Our old friend won’t forget it; old friends forget nothing, debts least of all.',
        ),
        L(
          'Antlaşma yırtıldı, lordum. İlişki çok düşecek; onlar da savaş gerekçesi kazanır. Kâğıt yırtmak kolay, sonrası zor.',
          'The treaty is torn up, my lord. Relations will plummet; and they gain a casus belli. Tearing paper is easy; what follows is not.',
        ),
        L(
          'İttifak sona erdi, lordum. Yırtılan antlaşmanın parçalarını topladım; hatıra olarak. Bir parçası mutfakta reçel kavanozunun kapağı oldu.',
          'The alliance is over, my lord. I gathered up the pieces of the torn treaty, as a keepsake. One piece now covers a jam jar in the kitchen.',
        ),
        L(
          'Dostluk bitti, lordum. Elçi haberi götürürken başını öne eğdi; utançtan değil, rüzgârdan.',
          'The friendship is over, my lord. The envoy bowed his head as he carried the news; not from shame, from the wind.',
        ),
        L(
          'İttifakı bozdunuz, lordum. Bazen yollar ayrılır; yalnız ayrılan yol bir gün karşınıza çıkabilir, elinde kılıçla.',
          'You’ve broken the alliance, my lord. Sometimes paths part; but a parted path may one day cross yours again, sword in hand.',
        ),
        L(
          'Mühür kırıldı, lordum. Artık kendi ordumuzla kendimizi korumalıyız; ordumuza bunu söyledim, birkaçı terledi.',
          'The seal is broken, my lord. Now we must defend ourselves with our own army; I told the army so, and a few broke into a sweat.',
        ),
      ])
    case 'endTribute':
      return any([
        L(
          'Haraç anlaşması bitti, lordum. Elçi haberi götürüyor; nasıl karşılanacağını bilmiyorum, ben uzakta durmayı tercih ederim.',
          'The tribute agreement is over, my lord. The envoy is taking the news; I don’t know how it’ll be received, I prefer to stand well back.',
        ),
        L(
          'Haraç işi kapandı, lordum. Hazinedar defterden bir satır sildi; yanına küçük bir ağlayan yüz çizdi, gördüm.',
          'The tribute business is closed, my lord. The treasurer struck a line from the ledger; and drew a little crying face beside it, I saw.',
        ),
        L(
          'Haraca son verdiniz, lordum. Bağışladıysak gönül kazanırız; kestiysek bedelini öderiz, hem de faiziyle.',
          'You’ve ended the tribute, my lord. If we waived it, we win goodwill; if we cut it off, we pay the price, with interest.',
        ),
        L(
          'Anlaşma sona erdi, lordum. Altın akışı durdu; ilişkiler de buna göre değişecek, genelde aşağı doğru.',
          'The agreement has ended, my lord. The flow of gold has stopped; relations will change accordingly, usually downwards.',
        ),
        L(
          'Haraç bitti, lordum. Bazen cömertlik, bazen gurur; hangisi olduğunu tarih yazar, tarihi de ben yazarım, yani sorun yok.',
          'The tribute is over, my lord. Sometimes generosity, sometimes pride; history will record which, and I write the history, so no problem.',
        ),
        L(
          'Haraç defteri kapandı, lordum. Ben mürekkebi kurutuyorum; hazinedar da gözyaşlarını.',
          'The tribute ledger is closed, my lord. I’m blotting the ink; the treasurer his tears.',
        ),
      ])
    case 'raid':
      return any([
        L(
          'Askerlerimiz ticaret yolunu basmaya gitti, lordum. Gözcü kuleleri azsa şansımız yüksek; çoksa askerlerimizin bacakları hızlı olsa iyi.',
          'Our soldiers have gone to raid the trade road, my lord. If there are few watchtowers, our chances are good; if many, our soldiers had better have quick legs.',
        ),
        L(
          'Baskın başladı, lordum. Başarırsak tüccarlarının yükü bizim olur, ticaret noktaları da kül; ben bu işlere karışmam, sadece yazarım.',
          'The raid has begun, my lord. If it works, their merchant’s cargo is ours and their trading post ashes; I don’t get involved in such things, I only write them down.',
        ),
        L(
          'On asker yola çıktı, lordum. Yüzlerini sardılar ama kim olduklarını herkes bilecek; birinin sargısında adımız yazıyor, söylemedim.',
          'Ten soldiers have set out, my lord. They’ve wrapped their faces, but everyone will know who they are; one has our name written on his wrapping, I didn’t mention it.',
        ),
        L(
          'Ticaret yolu yağması emredildi, lordum. Asker kaybımız olacak; ganimetimiz de, umarız. Tüccarlar bu işlerden nefret eder, bizimki de dahil.',
          'A raid on the trade road is ordered, my lord. We’ll lose soldiers; and gain loot, we hope. Merchants hate this sort of thing, ours included.',
        ),
        L(
          'Askerler pusuya yattı, lordum. Karşı tarafın tüccarı bugün eve geç dönecek, hafif dönecek, çok kızgın dönecek.',
          'The soldiers lie in ambush, my lord. The other side’s merchant will get home late today, light, and very cross.',
        ),
        L(
          'Baskın yolda, lordum. İlişki düşecek, onlar da savaş gerekçesi kazanacak; ama bu bizim seçimimiz ve ben bu seçimi çok cesur buldum, uzaktan.',
          'The raid is under way, my lord. Relations will drop and they’ll gain a casus belli; but it’s our choice, and I find it very brave, from a distance.',
        ),
      ])
    case 'spy': {
      const on = SPY_ON[c.topic as string] ?? L('sırlarını', 'secrets')
      return any([
        L(
          `Casusumuz yola çıktı, lordum. Hedefin ${on} gözetleyecek; ilk iş kılık değiştirecek, ilk kılığı biraz şüpheliydi, sahte sakal.`,
          `Our spy is on his way, my lord. He’ll keep watch on the target’s ${on}; first he’ll change disguise, the first one was a bit suspicious, a false beard.`,
        ),
        L(
          `Bir casus daha karanlığa karıştı, lordum. Ağ kurdukça ${on} daha iyi göreceğiz; karanlıkta değil tabii, gündüz.`,
          `Another spy has melted into the dark, my lord. As the network grows we’ll see their ${on} better; not in the dark, of course, by day.`,
        ),
        L(
          `Casus pelerinini giydi, lordum. Görevi: ${on} öğrenmek. Yakalanmasın diye dua ediyorum; pelerin biraz parlak.`,
          `The spy has donned his cloak, my lord. His mission: learn about their ${on}. I’m praying he isn’t caught; the cloak is a bit shiny.`,
        ),
        L(
          'Casusumuz yolda, lordum. Ben de kimseye söylemedim; yalnızca size, aşçıya ve kâtibe. Bir de kraliçenin kedisine.',
          'Our spy is on his way, my lord. I’ve told no one; only you, the cook and the clerk. And the queen’s cat.',
        ),
        L(
          `Casus karşı saraya sızıyor, lordum. ${c.topic === 'army' ? 'Ordu konusunda ağ güçlenince birlik türleri de görünür; şimdilik yalnızca miğfer sayıyor.' : 'Ağ güçlendikçe tahminler daralır; şimdilik "çok" ve "az" diye iki sayı biliyor.'}`,
          `The spy is slipping into the other court, my lord. ${c.topic === 'army' ? 'Once the army network is strong, troop types show too; for now he’s just counting helmets.' : 'As the network grows, the estimates narrow; for now he knows two numbers: "lots" and "not many."'}`,
        ),
        L(
          'Gölgede bir adım, lordum. Casusumuz artık bir aşçı yamağı; ya da bir seyis. Hangisi olduğunu ben de bilmiyorum, iyi casus böyle olur.',
          'A step into the shadows, my lord. Our spy is now a kitchen boy; or a groom. I don’t know which myself; that’s what makes a good spy.',
        ),
      ])
    }
    case 'recall':
      return any([
        L(
          'Casus geri çağrıldı, lordum. Gölgeden çıkıp eve dönüyor; gölgesini de getiriyor, merak etmeyin.',
          'The spy is recalled, my lord. He’s stepping out of the shadows and coming home; bringing his shadow with him, don’t worry.',
        ),
        L(
          'Casusumuz görevi bıraktı, lordum. Evde karşı casusluğa yardım eder; ilk iş benim odamı aradı, ne bulduğunu söylemedi.',
          'Our spy has left his post, my lord. At home he’ll help with counter-espionage; his first act was to search my room, he wouldn’t say what he found.',
        ),
        L(
          'Geri çağırma emri gizlice gönderildi, lordum. O kadar gizli ki ben bile unuttum; casus umarım unutmaz.',
          'The recall was sent in secret, my lord. So secret that even I’ve forgotten; I hope the spy hasn’t.',
        ),
        L(
          'Casus dönüyor, lordum. Ağ zamanla zayıflar; sonra yeniden kurarız, örümcekler gibi, daha az bacakla.',
          'The spy is coming back, my lord. The network will weaken in time; then we’ll rebuild it, like spiders, with fewer legs.',
        ),
        L(
          'Casusumuzu çektik, lordum. Ona bir sıcak çorba hazırlattım; casuslar da üşür, özellikle gece bacada beklerken.',
          'We’ve pulled our spy out, my lord. I’ve had hot soup made for him; spies get cold too, especially waiting in chimneys at night.',
        ),
        L(
          'Görev bitti, lordum. Casus sessizce geldi; o kadar sessiz ki geldiğini ancak şimdi fark ettim, arkamdaymış.',
          'The mission is over, my lord. The spy came back silently; so silently I only just noticed, he was standing behind me.',
        ),
      ])
    case 'intel':
      return any([
        L(
          'Casuslardan yeni rapor istendi, lordum. Tahminler yenilendi; bazıları gerçeğe yakın, bazıları casusun hayallerine.',
          'A fresh report has been requested from the spies, my lord. The estimates are updated; some close to the truth, some close to the spy’s daydreams.',
        ),
        L(
          'Rapor geldi, lordum. Mürekkebi hâlâ ıslak; casus koşarak getirmiş, ya da yağmur yağıyor.',
          'The report is in, my lord. The ink is still wet; either the spy ran all the way, or it’s raining.',
        ),
        L(
          'Casus raporu masanızda, lordum. Ağ güçlüyse rakamlar doğruya yakın; zayıfsa casusun parmak sayısına.',
          'The spy report is on your desk, my lord. If the network is strong, the figures are close to the truth; if weak, close to the number of the spy’s fingers.',
        ),
        L(
          'Yeni haberler var, lordum. Bazıları doğru, bazıları casusun hayal gücü; ağ gücüne bakın, bir de casusun yüzüne.',
          'There’s fresh news, my lord. Some true, some the spy’s imagination; look at the network’s strength, and at the spy’s face.',
        ),
        L(
          'Raporu okudum, lordum; sonra yaktım. Size okuyacak bir kopyası kaldı tabii; yanlış olanı yaktım galiba, neyse ezberledim.',
          'I read the report, my lord; then burned it. There’s a copy left for you, naturally; I may have burned the wrong one, but never mind, I memorised it.',
        ),
        L(
          'Casuslarımız konuştu, lordum. Fısıltıyla; ben de fısıltıyla aktarıyorum. Daha yaklaşın. Biraz daha.',
          'Our spies have spoken, my lord. In whispers; and I pass it on in a whisper. Come closer. A little closer.',
        ),
      ])
    case 'operation': {
      const op = c.op as string
      return op === 'kidnap'
        ? any([
            L(
              'Kaçırma operasyonu başladı, lordum. Gece karanlık, ip sağlam olsun; ipi ben seçtim, çamaşır ipinden daha sağlam.',
              'The abduction is under way, my lord. May the night be dark and the rope strong; I chose the rope myself, stronger than a washing line.',
            ),
            L(
              'Casuslar kraliçeye uzanıyor, lordum. Başarırsak hapishanemiz misafir ağırlayacak; yastıkları kabartın, kibar olalım.',
              'The spies are reaching for the queen, my lord. If they succeed, our prison will be hosting a guest; plump the pillows, let’s be civilised.',
            ),
            L(
              'Operasyon yolda, lordum. Ağ harcandı; şimdi şansa kaldı, şans da bu gece pek uyanık görünmüyor.',
              'The operation is under way, my lord. The network is spent; now it’s down to luck, and luck doesn’t look very awake tonight.',
            ),
            L(
              'Kukuletalı adamlar kuleye tırmanıyor, lordum. Ben bakmıyorum; elçiler böyle şeyleri görmez, görse de anlatmaz, anlatsa da süsler.',
              'Hooded men are climbing the tower, my lord. I’m not looking; envoys don’t see such things, and if they do they don’t tell, and if they tell they embellish.',
            ),
            L(
              'Kaçırma emri verildi, lordum. Yakalanırlarsa herkes kimin yaptığını öğrenir; ben "o saatte uyuyordum" derim, provası bitti.',
              'The abduction is ordered, my lord. If they’re caught, everyone learns who did it; I shall say "I was asleep at the time," I’ve rehearsed it.',
            ),
            L(
              'Gece yarısı, ip, at ve bir kraliçe, lordum. Masal gibi; sonu iyi biterse. Kötü biterse de bir ozan ondan şarkı yapar.',
              'Midnight, a rope, a horse and a queen, my lord. Like a fairy tale; if it ends well. If it ends badly, some minstrel will make a song of it.',
            ),
          ])
        : op === 'burn'
          ? any([
              L(
                'Sabotajcılar depolara yöneldi, lordum. Bu gece bir ambar yanacak; bizimki değil, bunu üç kez sordum.',
                'The saboteurs are heading for the stores, my lord. Tonight a storehouse burns; not ours, I asked three times.',
              ),
              L(
                'Kıvılcım yolda, lordum. Yemek ve malzemenin bir kısmı kül olacak; onların fareleri bu gece evsiz kalacak, üzüldüm biraz.',
                'The spark is on its way, my lord. Some of their food and materials will turn to ash; their rats will be homeless tonight, I feel a little sorry.',
              ),
              L(
                'Operasyon başladı, lordum. Sabotajcı çakmak taşını cebine koydu; cebi delikti, yeni cep diktirdik.',
                'The operation has begun, my lord. The saboteur put his flint in his pocket; the pocket had a hole, we had a new one sewn.',
              ),
              L(
                'Depolar hedefte, lordum. Yakalanırlarsa savaş gerekçesi doğar; yakalanmazlarsa bir yangın ve bir sürü soru doğar.',
                'The stores are the target, my lord. If they’re caught, a casus belli is born; if not, a fire and a great many questions.',
              ),
              L(
                'Ateş emri verildi, lordum. Dumanını buradan görmeyi beklemiyorum ama umuyorum; kuleye çıktım, boşuna.',
                'The order to burn is given, my lord. I don’t expect to see the smoke from here, but I hope to; I climbed the tower, in vain.',
              ),
              L(
                'Sabotaj yolda, lordum. Ağ harcandı; karşılığını alalım. Alamazsak da en azından iyi bir hikâye olur, kimseye anlatmayacağımız.',
                'The sabotage is under way, my lord. The network is spent; let’s get our money’s worth. If not, at least it makes a good story, one we’ll tell no one.',
              ),
            ])
          : op === 'delay'
            ? any([
                L(
                  'Sabotajcılar inşaatlarına sızdı, lordum. İskeleleri gevşetecekler; ustabaşları da "ben demiştim" diyecek.',
                  'The saboteurs have slipped onto their building sites, my lord. They’ll loosen the scaffolding; and the foremen will say "I told you so."',
                ),
                L(
                  'Rakibin ustaları bu gece uyuyamayacak, lordum. Aletleri kayboluyor; birini ben de istiyorum, güzel bir çekiçti.',
                  'The rival’s builders won’t sleep tonight, my lord. Their tools are going missing; I’d like one myself, it was a lovely hammer.',
                ),
                L(
                  'İnşaat sabotajı başladı, lordum. Duvarlar biraz daha geç yükselecek; ustabaşı da "çabuk biter" demeyi bırakacak.',
                  'The construction sabotage has begun, my lord. Their walls will rise a little later; and their foreman will stop saying "it’ll be done in no time."',
                ),
                L(
                  'Operasyon yolda, lordum. Bir çekiç kaybolur, bir kiriş kırılır, bir ustabaşı ağlar; inşaat uzar.',
                  'The operation is under way, my lord. A hammer goes missing, a beam cracks, a foreman weeps; construction drags on.',
                ),
                L(
                  'Sabotajcılar şantiyede, lordum. Ustabaşına içki ikram ettiler; sonrası kolay, ustabaşları içkiye hayır demez.',
                  'The saboteurs are on site, my lord. They offered the foreman a drink; the rest is easy, foremen never say no to a drink.',
                ),
                L(
                  'Rakip ustaların harcına kum karıştırılacak, lordum. Ben bunu duymadım; zaten yaşlıyım, pek bir şey duymam.',
                  'Sand will be mixed into the rival builders’ mortar, my lord. I didn’t hear that; I’m old, I don’t hear much anyway.',
                ),
              ])
            : op === 'townRevolt'
              ? any([
                  L(
                    'Kışkırtıcılar kasabaya girdi, lordum. Sadakat birazdan sarsılacak; kasabanın sahibi de, haberi alınca.',
                    'The agitators have entered the town, my lord. Its loyalty will soon be shaken; and so will its owner, when he hears.',
                  ),
                  L(
                    'Kasabanın meydanında fısıltılar başladı, lordum. Sahibine pek iyi şeyler söylenmiyor; birkaçını ben yazdım, edebi değeri yüksek.',
                    'Whispers have started in the town square, my lord. Not very nice things are being said about its owner; I wrote a few of them, of high literary merit.',
                  ),
                  L(
                    'Operasyon yolda, lordum. Kasaba halkı bu gece yeni dertler öğrenecek; eskileri yetmiyormuş gibi.',
                    'The operation is under way, my lord. Tonight the townsfolk will learn of new grievances; as if the old ones weren’t enough.',
                  ),
                  L(
                    'Kışkırtma emri verildi, lordum. Sadakat düşerse kasaba ayaklanır; ayaklanınca da bizim kasabalarımıza bakıp "onlar ne güzel" der.',
                    'The order to stir unrest is given, my lord. If loyalty falls the town revolts; and while revolting it looks at our towns and says "how nice they have it."',
                  ),
                  L(
                    'Casuslarımız kasabanın meyhanesinde, lordum. Herkese içki, herkese dedikodu; içkinin parasını biz ödüyoruz, dedikodu bedava.',
                    'Our spies are in the town tavern, my lord. Drinks for all, gossip for all; we pay for the drinks, the gossip is free.',
                  ),
                  L(
                    'Kasabada isyan tohumları ekiliyor, lordum. Hasadı rakibimiz toplayacak; tarımda ilk kez bu kadar hızlı bir hasat görülecek.',
                    'The seeds of revolt are being sown in the town, my lord. Our rival will reap the harvest; the fastest harvest agriculture has ever seen.',
                  ),
                ])
              : any([
                  L(
                    'Kışkırtıcılar halkın arasına karıştı, lordum. Rakibin üretimi yarıya inecek; rakibin keyfi çeyreğe.',
                    'The agitators have mingled with the people, my lord. The rival’s output will drop by half; the rival’s mood by three quarters.',
                  ),
                  L(
                    'İsyan operasyonu başladı, lordum. Meydanlarda öfkeli sözler dolaşacak; bazıları bizim sözlerimiz, fark etmezler umarım.',
                    'The revolt operation has begun, my lord. Angry words will make the rounds of the squares; some of them ours, I hope nobody notices.',
                  ),
                  L(
                    'Casuslar halkı kışkırtıyor, lordum. On dakika sonra rakibin atölyeleri susar; rakibin kendisi ise susmaz, ona bahse girerim.',
                    'The spies are stirring up the people, my lord. In ten minutes the rival’s workshops fall silent; the rival himself won’t, I’d bet on it.',
                  ),
                  L(
                    'Operasyon yolda, lordum. Ağ harcandı; ama fırtına kopacak. Şemsiyemi aldım, uzaktan izleyeceğim.',
                    'The operation is under way, my lord. The network is spent; but the storm will break. I’ve brought my umbrella, I’ll watch from afar.',
                  ),
                  L(
                    'Rakibin halkı bu gece meşaleleri yakacak, lordum. Biz uzaktan izleriz; ben bir de kestane getirdim.',
                    'The rival’s people will light their torches tonight, my lord. We’ll watch from afar; I’ve brought chestnuts.',
                  ),
                  L(
                    'İsyan tohumları ekildi, lordum. Yakalanırlarsa kimin yaptığı ortaya çıkar; o durumda ben bu konuşmayı hiç hatırlamayacağım.',
                    'The seeds of revolt are sown, my lord. If they’re caught, it’ll come out who did it; in which case I shall have no memory of this conversation.',
                  ),
                ])
    }
    case 'ransom':
      return any([
        L(
          'Fidye ödendi, lordum. Kraliçe eve dönüyor; hazinedar ise yatağına, uzun bir süreliğine.',
          'The ransom is paid, my lord. The queen is coming home; and the treasurer is going to bed, for a long while.',
        ),
        L(
          'Altın sandığı yola çıktı, lordum. Kraliçemiz yakında sarayında; kedisi de pencerede bekliyor, bana hâlâ küs.',
          'The chest of gold is on its way, my lord. Our queen will soon be in her palace; her cat waits at the window, still not speaking to me.',
        ),
        L(
          'Fidye teslim edildi, lordum. Hazine hafifledi ama saray yeniden dolacak; kraliçenin sandıkları da geri geliyor, üç tane.',
          'The ransom is delivered, my lord. The treasury is lighter, but the palace will be full again; the queen’s chests are coming back too, all three.',
        ),
        L(
          'Kraliçe için ödedik, lordum. Bazı şeylerin fiyatı sorulmaz; hazinedar sordu yine de, cevap verdim, bayıldı.',
          'We’ve paid for the queen, my lord. Some things one doesn’t ask the price of; the treasurer asked anyway, I told him, he fainted.',
        ),
        L(
          'Fidye gitti, kraliçe geliyor, lordum. Halk sokaklara dökülmeye hazır; ben de en iyi cübbemi giydim, kaçıranlara nispet.',
          'The ransom goes, the queen comes, my lord. The people are ready to pour into the streets; I’ve put on my best robe, to spite the kidnappers.',
        ),
        L(
          'Ödendi, lordum. Kaçıranlar altınlarını saysın; biz kraliçemizi sayarız, bir tane, eksiksiz.',
          'Paid, my lord. Let the kidnappers count their gold; we’ll count our queen: one, complete.',
        ),
      ])
    case 'release':
      return any([
        L(
          'Rehine kraliçe serbest bırakıldı, lordum. Bu cömertlik ilişkiyi ısıtır; hapishanenin ısıtma gideri de düşer.',
          'The hostage queen is released, my lord. Such generosity warms relations; and lowers the prison’s heating bill.',
        ),
        L(
          'Hapishanenin kapısı açıldı, lordum. Kraliçe eve dönüyor; giderken gardiyana bahşiş bıraktı, bize bırakmadı.',
          'The prison door is open, my lord. The queen is going home; she left the gaoler a tip on her way out, but not us.',
        ),
        L(
          'Kraliçeyi bıraktınız, lordum. Karşı saray bunu unutmayacak; iyi anlamda, umarım. Kötü anlamda da unutmazlar ama.',
          'You’ve let the queen go, my lord. The other court won’t forget it; in a good way, I hope. They don’t forget in the bad way either, mind.',
        ),
        L(
          'Serbest bırakıldı, lordum. Gardiyan biraz üzüldü; ona hep kibar davranıyormuş, satranç da öğretmiş.',
          'She’s free, my lord. The gaoler is a little sad; she was always kind to him, and taught him chess.',
        ),
        L(
          'Rehine gitti, lordum. Hapishane sessiz; ben de sessiz kalıyorum, ki bu benim için büyük bir fedakârlık.',
          'The hostage is gone, my lord. The prison is quiet; and I’m keeping quiet too, which for me is a great sacrifice.',
        ),
        L(
          'Kraliçe atına bindi, lordum. Giderken bize başıyla selam verdi; asil bir kadın. Bana ayrıca bir bakış attı, ne anlama geldiğini çözüyorum.',
          'The queen has mounted her horse, my lord. She nodded to us as she left; a noble lady. She gave me a separate look as well; I’m still working out what it meant.',
        ),
      ])
    default:
      return null
  }
}
