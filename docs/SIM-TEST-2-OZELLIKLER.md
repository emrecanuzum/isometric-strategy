# Sim test 2: özellik listesi

Bu liste, sunucuda (`command` + `tick`) ve paylaşılan kurallarda (`advance`) çalışan, simülatörle test edilebilen özellikleri kapsıyor. Kaynağı CLAUDE.md; § işaretleri oraya gönderiyor. İstemcide çalışan özellikler en altta ayrı bir bölümde.

Her maddenin üç parçası var: **özellik · nasıl tetiklenir · nasıl doğrulanır**. Test eden her maddeyi şöyle işaretler: ✅ beklendiği gibi, ⚠️ çalışıyor ama sorunlu, ❌ çalışmıyor, ⏭️ test edilemedi (nedeniyle). Yanına kanıtı yazar: `events.md` satırı, SQL sorgusu ya da sayılar.

Testi üç ajan, üç ayrı lobide paralel yapıyor: **A** ekonomi, halk ve ilerleme · **B** ordu, yağmacılar, deniz · **C** taçlar, hanedan, diplomasi, casusluk.

---

## A. Ekonomi, halk, ilerleme (ajan A)

### A1. Kuruluş ve inşa (§5, §6.4)
- [ ] A1.1 Üç başlangıç yerinin biyom çarpanları farklı · setup · `status` yields, sql kingdoms.state->'yields'
- [ ] A1.2 Ücretsiz ilk oduncu kampı, ev ve tarla · build · maliyet 0, `freeUsed`
- [ ] A1.3 İnşaat sırası 2, dolunca `queue` · 3 build arka arkaya · RED queue
- [ ] A1.4 Yapı sınırları saray seviyesine göre (tarla 3/4/6/8/10…) · sınırı aş · RED limit
- [ ] A1.5 Ev ve nüfus sınırı, `limit` hatası · barınağı sınıra dayandır · RED limit
- [ ] A1.6 Bina yükseltme 1→3, yükseltme sürerken üretim durur · upgrade · status `*`
- [ ] A1.7 Yıkım yarı iade eder · demolish · stok farkı
- [ ] A1.8 Taşıma (%40 maliyet, ×1,25 süre) · plan move · stok/süre
- [ ] A1.9 Plan komutu (toplu inşa/yıkım/taşıma) · cmd plan · events
- [ ] A1.10 Yol (1 altın, 1 yapı malzemesi, sıraya girmez) · plan build road · OK
- [ ] A1.11 Sur ve kapı; sur ile bina arası boşluk kuralı · build wall/gate · RED spot / OK
- [ ] A1.12 Hapishane uyarısı: sarayı kapısız surla çevirince mutluluk −15 · sur halkası · status mutluluk
- [ ] A1.13 Sur arkasında kalan yapı çalışmaz · · üretim
- [ ] A1.14 Saray 2 için biat şartı (`liege`), saray 3 için kraliçe şartı (`queen`) · upgrade · RED
- [ ] A1.15 Hudut sarayla büyür (8→16 parsel) · saray yükselt · status hudut aşaması

### A2. Üretim ve depo (§6.4)
- [ ] A2.1 Tur 10 sn, gece %50 üretim · wait, gece/gündüz farkı · snapshots
- [ ] A2.2 Gece mesaisi: tam üretim, mutluluk düşer, yorgunluk birikir · nightShift · status
- [ ] A2.3 Biyom çarpanı üretime işler · iki lordun aynı yapısını karşılaştır
- [ ] A2.4 Tarla ürünü buğday/keten, silah atölyesi demir/kılıç/kalkan/yay · product · stok/cephanelik
- [ ] A2.5 Depo sınırı, "ambar dolu", boşa giden mal (`books.wasted`) · stoku doldur · sql books
- [ ] A2.6 Cephanelik sınırı dolunca silah atölyesi durur · çok silah üret · `clogsOf`
- [ ] A2.7 Hazine sınırı, hazine dolunca tüccar bekler · grant gold · trade sefer yok
- [ ] A2.8 Ambar ve hazine binaları sınırı artırır · build warehouse/treasury · status sınır
- [ ] A2.9 Fare, rutubet, pas: %85 dolu ambar erir · ambarı doldur, bekle · events HABER / books
- [ ] A2.10 Mevsim çarpanı yemekte (kış ×0,74) · saat saat yemek üretimi · snapshots

### A3. Nüfus ve halk (§5.2, §9.7, §9.8)
- [ ] A3.1 Köylüler boş yere yavaş yavaş gelir, mutluluk çarpanı · ev kur · snapshots villagers/room
- [ ] A3.2 Açlıkta köylüler önce yemeğe çalışır, sarayın hizmetlileri gitmez · yemeği bitir · villagers
- [ ] A3.3 Göç (mutluluk düşük, açlık) · · villagers düşer
- [ ] A3.4 Vergi düzeyleri (düşük/normal/yüksek/ağır) gelir ve mutluluk etkisi · tax · ledger/mutluluk
- [ ] A3.5 Kraliçe: 20 nüfus ve 300 altın, mutluluk etkisi · queen · RED people / OK
- [ ] A3.6 Hastalık: yılın salgını, hastane, kendiliğinden iyileşme · bekle, hospital · status hasta
- [ ] A3.7 Tapınak mutluluğu, vaaz · build temple, sermon · mutluluk
- [ ] A3.8 Kâhya krizi kendiliğinden karşılar (15 altın) · steward · events
- [ ] A3.9 Lord yokken tüccar yarım yük, ambar yarıdan sonra yavaşlar · active "" · snapshots
- [ ] A3.10 Yokluk cezası: 1 saat sonra saatte −%10, en az %50 · uzun active "" · ledger
- [ ] A3.11 Yeni lord kuralları: haraç yok, yağmacı etkisi ×0,1, olay pencereleri sessiz · sv1 · events

### A4. Ticaret (§7.6, §7.7, §9.7)
- [ ] A4.1 Tüccar malı ve "hiçbir şey satma" · tradeGood · ledger
- [ ] A4.2 Sefer başına miktar (5'lik adım, 2 dk bekleme) · tradeAmount · RED tradeWait
- [ ] A4.3 Ticaret noktası yükseltme · upgradeTrade · sv
- [ ] A4.4 Tüccar yemek yedeği (30 tur) · trade food · stok tabanı
- [ ] A4.5 Tüccar yapı/savaş malzemesi yedeği YOK (bilinen) · trade materials · stok 0
- [ ] A4.6 Lobi fiyatı satıldıkça düşer, zamanla döner; en dipte %30 · sql lobbies market · fiyat
- [ ] A4.7 Taçlar lobi piyasasından alır · · fiyat toparlanması
- [ ] A4.8 Pazar binası, alış ×1,4 · buy · stok/altın
- [ ] A4.9 Taç başkentine tüccar (2 kat yük, sefer uzun) · tradeCity · ledger
- [ ] A4.10 Hanlara tüccar (sv2 ticaret noktası, %8 pay) · tradeInn · RED innFar / OK
- [ ] A4.11 Ticaret noktası onarımı (yağma sonrası) · repairTrade · OK
- [ ] A4.12 Dünya nüfusu yemeği pahalandırır (`foodDemand`) · · market

### A5. Olaylar ve uğraşlar (§9.8, §9.9, §9.10)
- [ ] A5.1 Günün olayları, lobi ve krallık kanalları · status OLAY · events
- [ ] A5.2 Kriz: köylüler / ordu / hiçbir şey, afetin bedeli, dolu depo daha çok kaybeder · crisis · stok farkı
- [ ] A5.3 Cevapsız kriz tam zarar verir · cevap verme · stok
- [ ] A5.4 İki yollu seçimler (`choose a/b`), bedel ve kazanç · choose · stok
- [ ] A5.5 Seferler: avcılar, kâşifler, hacılar, tüccar kafilesi, hazine; muhafız; geri çağırma · expedition · events/stok
- [ ] A5.6 Hanedan hedefleri: basamaklar, kese, unvan · bekle · state goals
- [ ] A5.7 Üniversite araştırması, dallar, kilitlenen yol · research · RED / OK
- [ ] A5.8 Büyük işler: depodan aktar, aşamalar, %25 yedek · project give · state projects
- [ ] A5.9 Halk şenliği (600 altın, 3000 yemek) · project festival · mutluluk
- [ ] A5.10 Taca bağış (2000 birim, ilişki +4) · project donate · crownRelations
- [ ] A5.11 Mini oyun: tohum, sonuç, bekleme, saatlik ödül hakkı · play/played (boş basışlar) · RED/0 puan
- [ ] A5.12 Balıkçı kulübesi oltası · cast/fish · events
- [ ] A5.13 5. seviye saray: hisar, anıt, lonca konağı · grant + build · etkiler

### A6. Çevrimdışı (senin sonraki işin için en önemlisi)
- [ ] A6.1 2, 4 ve 8 saatlik yoklukta öncesi/sonrası depo, nüfus, haraç, haberler · active "" · snapshots + events tablosu
- [ ] A6.2 Bunu saray 1, 2, 3 ve 4'te ayrı ayrı · · tablo

---

## B. Ordu, yağmacılar, deniz (ajan B)

### B1. Kışla ve ordu (§8, §9.7)
- [ ] B1.1 Birlikler: mızrakçı, okçu, süvari (sv2 kışla), kalkanlı (araştırma), mancınık · train · garnizon
- [ ] B1.2 Asker havuzu, mutluluğa bağlı · train fazla · RED
- [ ] B1.3 Terhis · disband · köylü
- [ ] B1.4 Ordu çıkarma (en fazla 2), bölme, birleşme · raise/army · armies
- [ ] B1.5 Elçiyle emir gecikmesi (test 30 sn), hudut içinde anında · army move · army_orders
- [ ] B1.6 Kral ordunun başında, emir anında, %15 düşme şansı · king lead · armies.led_by
- [ ] B1.7 Moral ve saha bilgisi, handa toparlanma · bekle · battle plan
- [ ] B1.8 Gözdağı: savaştaki düşmanın sınırında bekleyince −12 mutluluk · · hedefin mutluluğu
- [ ] B1.9 Asker maaşı ve yemeği · · ledger

### B2. Muharebe (§8.2.2, §9.7)
- [ ] B2.1 Meydan muharebesi (5 karo temas) · iki ordu karşılaşsın · battles field
- [ ] B2.2 **Küçük ordu yuvarlama bug'ı**: asker sayısına göre öldürülenler (5, 10, 15, 20, 30, 50) · battles plan rounds kills
- [ ] B2.3 Birlik karşıtlıkları (mızrak > süvari > okçu > mızrak) · karışık ordular · bonus
- [ ] B2.4 Saray kuşatması: garnizon, kule, sur bonusu, mancınık · siege · battles
- [ ] B2.5 Yağma, kuşatma halkı kaçırır, 15 dk kalkan · kazanılan kuşatma · stok/villagers/events
- [ ] B2.6 Gözcü kulesi menzilde hasar ve `tower_losses` haberi (15 dk'da bir) · kule yanında bekle · events
- [ ] B2.7 Müttefik ordusu yakındaysa muharebeye katılır · ittifak + yakın ordu · battles
- [ ] B2.8 Güvenli bölge: taç şehirlerinin yakınında muharebe olmaz · şehir yanında karşılaş · battles yok
- [ ] B2.9 Sur ile su arası kapalı; kapıdan yalnız sahibi geçer · rota · RED route / yol
- [ ] B2.10 Yenilen ordu eve çekilir, yükünü kaybeder · · armies/cargo

### B3. Kasabalar (§8.4)
- [ ] B3.1 Sahipsiz kasaba kuşatması (15 dk, %60 kayıp) · move+siege · lobby_towns
- [ ] B3.2 Tahta surlu kasaba (%30 uzun, %35 fazla kayıp) · · süre/kayıp
- [ ] B3.3 Sahipli kasaba, yalnız savaştaki lord · · RED / OK
- [ ] B3.4 Katkı türleri ve sadakat çarpanı · bekle · stok
- [ ] B3.5 Bakım düzeyi ve sadakat · townUpkeep · state towns loyalty
- [ ] B3.6 Ayaklanma, asiler, bastırma muharebesi (+10 sadakat, 30 dk sessizlik) · bakımsız bırak · events/battles revolt
- [ ] B3.7 Kopma (%12 altı) · · lobby_towns owner null
- [ ] B3.8 Aşırı büyüme basamakları (2, 3, 4+ kasaba) · 4 kasaba al · sadakat tavanı
- [ ] B3.9 Serbest bırak · releaseTown · garnizon
- [ ] B3.10 Kasaba pazarı: ordu kapıda, kargo, saraya girince ambara · townBuy · cargo
- [ ] B3.11 Kuşatma −15 ilişki · başkasının kasabası · relations

### B4. Yağmacılar ve mağaralar (§7.9, §7.9.1)
- [ ] B4.1 Çete yerleri, yürüyüş, baskın döngüsü · sql lobby_outlaws, state.outlaws · road/bands
- [ ] B4.2 Yağmacı payı: tüccar kesintisi, mutluluk · · books.outlaws
- [ ] B4.3 Takip, 4 karoda muharebe, 20 dk yetişememe · army chase · events
- [ ] B4.4 Zafer: ganimet, 45 dk dağılma, +1 kişi geri dönüş · büyük orduyla · events
- [ ] B4.5 Aynı orduya iki çete için takip emri verilebiliyor (bilinen) · · events
- [ ] B4.6 Mağara izi: 1. zaferde yön, 2.'de uzaklık, 3.'te bulunur (casus eviyle 2) · aynı klanın çetelerini yen · cave_trail
- [ ] B4.7 Mağaraya bakmak (bulunmamış): saatte bir "inceleyemedi" · move mağaraya · cave_probe
- [ ] B4.8 Mağara kuşatması, klan yok olur, yeni klan doğar, +100 zafer · army cave · clan_destroyed
- [ ] B4.9 Klan büyümesi (garnizon, ganimet) · bekle · lobby_outlaws

### B5. Deniz (§8.5)
- [ ] B5.1 Tersane, gemi türleri, tayfa asker havuzundan · ships · navy
- [ ] B5.2 Filo kurma, bölme, birleştirme, limana bağlama · fleet · navy.fleets
- [ ] B5.3 Seyir (hareket et), karaya tıklanamaz, su yolu yok · fleet sail · RED
- [ ] B5.4 Deniz ticareti, korsan saldırısı, batan gemi; **haber var mı?** · mission trade · navy.ledger/notices
- [ ] B5.5 Balık avı · mission fish · yemek
- [ ] B5.6 Korsan avı · mission hunt · ödül/kayıp
- [ ] B5.7 Korsan teknesi takibi ve deniz savaşı · fleet chase · pirate_battle
- [ ] B5.8 Korsan limanı ablukası, nüfus azalır · mission haven · lobby_outlaws havens
- [ ] B5.9 Lord iskelesine abluka, kıyı akını, ablukayı yarma (savaşta) · mission blockade/raid/break · events
- [ ] B5.10 Korsan etkisi (sea), korsan mevsimi · · state.outlaws.sea

---

## C. Taçlar, hanedan, diplomasi, casusluk (ajan C)

### C1. Taçlar (§7.8)
- [ ] C1.1 Biat için 6 yapı (`early`), sezonluk kalıcı · swear · RED early / sworn
- [ ] C1.2 Yeni lord: kendi tacı 120 altın bahşiş, rakip tacın 80 altın kesesi · sv1 · events
- [ ] C1.3 Devriye 30 dk'da bir; eğlence merkezi yoksa bahşiş yok · bekle · patrol_visit
- [ ] C1.4 Eğlence merkezi varken bahşiş (60 × taç gücü × huy) · grant + build tavern · patrol_tip
- [ ] C1.5 Armağan baremleri (ilişki 30/60/85) · patch crownRelations · crown_gift
- [ ] C1.6 Haraççılar: 30 dk'da bir, %8 / en az 150 / en çok %25 · sv2+ · patrol_tribute
- [ ] C1.7 Öde / reddet (−8, rakip taçtaki bütün lordlar) / konuş (huya uyan cevaplar %40'a kadar indirir; iki sert cevap %20 artırır) · patrolAnswer · events + tributeTalk.ts
- [ ] C1.8 Cevapsız haraç: çevrimdışı olağan, çevrimiçi ×1,5 · · events afk
- [ ] C1.9 Taçla ilişki dinlenme değerine döner (saatte ~11) · · crownRelations
- [ ] C1.10 Taçların pazarı (yönetilen mal, fiyat ×0,5…×1,25) · · stewardFactor
- [ ] C1.11 Taç siparişleri (kervan, ödeme dönüşte) · order · events
- [ ] C1.12 Taç görevleri (ticaret, kasaba, sipariş, ordu, yağmacı, korsan) · quest take/claim · ödül
- [ ] C1.13 Kraliyet elçisinin isteği (silah/mal, 1 saat, ödül ×1,3) · royal accept/deliver/decline · events
- [ ] C1.14 Taçların gücü (400 + lordların puanı) · · tip çarpanı
- [ ] C1.15 Taçların rekabeti (barış/gerginlik/savaş, 3 saat), kazanan taç +4 · · crownHouse.ts / events
- [ ] C1.16 Rakip taçların lordları −20'den başlar, en fazla +40 · · relations

### C2. Hanedan (§9.1, §9.1.1)
- [ ] C2.1 Doğumlar, aile planı (en çok 2 çocuk, iki kız yok) · queen, bekle · dynasty
- [ ] C2.2 Ad koyma (bir kez), eğitim (+3) · nameChild/educate · RED named
- [ ] C2.3 Reşit olma (16 yıl = 16 saat) · bekle · dynasty grown
- [ ] C2.4 Hükümdarın ölümü, tahta geçiş; kardeşler, akrabalar, kraliçe ana · patch deathAt öne · dynasty
- [ ] C2.5 Naipler konseyi, akraba çağırma (3 yıl) · varis reşit değilken öldür · dynasty council/kinsmanAt
- [ ] C2.6 Kraliçe tek başına, evlendirme (wedQueen) · · house wedQueen
- [ ] C2.7 Kahırdan ölüm %5 (kaybedilen muharebe), kral komutadayken %15 · · dynasty dead cause
- [ ] C2.8 Salgın hanedandan birini öldürür · · cause sickness
- [ ] C2.9 Kardeşlerin genç ölmesi (0,5–3 yıl) · tahta geçişten sonra · cause sickness
- [ ] C2.10 Bakışlar: dinlenme değeri, sapma, hediye (+15, 20 dk), görevden alma (−20) · house gift/role · Person.op
- [ ] C2.11 Görevler: vali (kasaba sadakati), devriye komutanı (bahşiş, taç sevgisi), hazinedar (vergi) · house role · etkiler
- [ ] C2.12 Prenses evlendirme: taca, kasabaya (sahipsizse lorda bağlanır), bir lorda (elçi teklifi) · house marry · relations/towns
- [ ] C2.13 Hoşnutsuz kardeş haberi (−15) · · kin_unhappy
- [ ] C2.14 **Taht davacısı**: bakış −35 altı, 15 dk yoklama, karargâh, büyüme, saraya yürüyüş · patch op + bekle · pretender_rise/grow/siege
- [ ] C2.15 Karargâha saldırı, taçtan yardım (asker/altın) · army camp, house aid · pretender_crushed/aid
- [ ] C2.16 Tahtın kaybı (davacı kazanırsa) · · throne_lost
- [ ] C2.17 Taç davacıyı desteklerse taraf değiştirme teklifi (30 dk) · switchLiege · liege_switch

### C3. Diplomasi (§9.7)
- [ ] C3.1 İlişki geliştirme elçisi, hediye · envoy improve/gift · relations
- [ ] C3.2 Haraç isteme, kabul/ret, haracı kesme, isteyen kaldırma · envoy tribute, respond, endTribute · pacts/books
- [ ] C3.3 İttifak (+50 ister), bozma · envoy alliance, breakAlliance · pacts
- [ ] C3.4 Hakaret (−25, savaş gerekçesi) · envoy insult · claims
- [ ] C3.5 Ticaret yolu yağması (10 asker, kule şansı düşürür, ticaret noktası harap) · raid · damaged
- [ ] C3.6 Savaş ilanı (−50 ya da gerekçeyle −20), gerekçesiz −10 herkesle · declareWar · relations
- [ ] C3.7 Savaş puanı, barış şartları, dayatılan barış (100 puan) · envoy peace · pacts
- [ ] C3.8 İtibar (kötü ilişkiler elçi etkisini düşürür) · · etki
- [ ] C3.9 Cevapsız teklifin süresi dolar · · envoys expired

### C4. Casusluk (§9.3, §9.7)
- [ ] C4.1 Casus evi casus yetiştirir, kapasite · build spyHouse · spies
- [ ] C4.2 Casus gönderme (konu başına bir), ağ gücü büyür, karşı casusluk yavaşlatır · spy · spy_missions
- [ ] C4.3 Rapor tahmini (ağ arttıkça hata payı küçülür) · intel · result
- [ ] C4.4 Yakalanma: ilişki düşer, savaş gerekçesi · bekle · spy_caught
- [ ] C4.5 Geri çağırma · recall · spies
- [ ] C4.6 Operasyon: sabotaj (%50) · operation · stok/inşaat
- [ ] C4.7 Operasyon: kraliçe kaçırma (%70, hapishane), fidye, serbest bırakma · operation kidnap, ransom, release · queenHeldBy
- [ ] C4.8 Operasyon: isyan kışkırt (%90), kasabada isyan · operation · revoltUntil/town loyalty −35
- [ ] C4.9 Operasyon ağı harcar · · ağ gücü

---

## İstemci tarafı (simülatörde yok; koddan ya da tarayıcıdan bakılır)

Elçinin öğüt balonları ve öğretici · taç hanedanı haberleri ve tahta geçiş pencereleri · lordun hanedan haberleri (doğum, ölüm) · "Sen yokken" raporu · pencerelerin raf ömrü ve özet · harita çizimi, ses, müzik · mini oyunların oynanışı · elçinin notları.
