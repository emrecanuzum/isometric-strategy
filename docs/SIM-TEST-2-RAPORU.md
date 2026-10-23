# Sim test 2 raporu (2026-10-23)

Gerçek `command` ve `tick` edge function'ları yerel Supabase'e karşı sanal saatle çalıştı (`scripts/sim/`). Üç sonnet ajanı üç ayrı lobide paralel oynadı ve `docs/SIM-TEST-2-OZELLIKLER.md` listesini madde madde işaretledi.

Kendiliğinden tutulan kayıtlar her lobinin klasöründe: `events.md` (her komut, her lordun her elçi haberi, her muharebe ve her yönetmen müdahalesi) ve `snapshots.csv` (her lord, oyun saatinde bir).

| Ajan | Alan | Süre | Madde | ✅ | ⚠️ | ❌ | ⏭️ |
|---|---|---|---|---|---|---|---|
| A | Ekonomi, halk, ilerleme, çevrimdışı | ~44 sa | 57 | ~42 | ~14 | 0 | 1 |
| B | Ordu, muharebe, kasaba, yağmacı, deniz | ~22 sa, 20 muharebe | 51 | ~33 | ~14 | 1 | ~3 |
| C | Taçlar, hanedan, diplomasi, casusluk | ~30 sa | 51 | 36 | 13 | 0 | 2 |

Ajanların işaretleri onların kendi yargısı. Aşağıdaki tablolarda yalnızca kodda ya da veride doğrulananlar ve tasarım belgesiyle karşılaştırılanlar var.

## 1. Bug'lar

| # | Bug | Yer | Kanıt | Durum |
|---|---|---|---|---|
| 1 | Muharebede ölüler `Math.round(asker × güç × 0,008 × zar)` ile hesaplanıyor. Eşit ordularda 1–6 asker hiçbir zaman öldüremiyor, 7 askerde muharebelerin %44'ünde, 10'da %5'inde sıfır. Küçük taraf yalnızca morali çöküp kaybediyor. Yağmacılar, asiler ve erken oyundaki bütün ordular bu aralıkta. | `packages/shared/src/military.ts:942-943` | 2000 tohum; sunucuda muharebe #3, #13, #27 | **doğrulandı** |
| 2 | Uzağa yüzdürülen filo, görevi limanda bekle / ticaret / balık / korsan avı olduğu sürece "evde" sayılıyor. "Limana bağla" onu yol süresi olmadan ışınlıyor. | `packages/shared/src/navy.ts:226` (`atHome`) | B5.2 | **doğrulandı** |
| 3 | Seferin olayları listeden bağımsız çekiliyor, aynı olay iki kez gelebiliyor (iki kez münzevi, iki kez panayır). | `packages/shared/src/expeditions.ts:254` | A5.5 | **doğrulandı** |
| 4 | Kasabayı kuşatmaya giden ordu yolda muharebe kazanınca kuşatma emri kayboluyor ve ordu kapıya 6 karo kala bekliyor. | ordunun hedefi muharebeden sonra `move`'a dönüyor (`_shared/armies.ts` / `tick.ts`) | B3, army 20 | ajan gözlemi |
| 5 | Kuşatmayı kazanan ordu kule menzilinde kendiliğinden çekilmiyor (16 dakikada 48 kayıp). Kuşatma kalkanı bitince kuşatma kendiliğinden yeniden başlamıyor; CLAUDE.md §9.7 başlamalı diyor. | `tick.ts` kuşatma ve kule | B2.4 / B2.6 | ajan gözlemi |
| 6 | Hudut dışındaki orduya iki farklı çete için takip emri verilebiliyor, sonuncusu geçerli oluyor. | `command/index.ts:1196` yalnızca aynı çeteyi denetliyor | B4.5 | ajan gözlemi |
| 7 | Casus raporu ağ gücünü yukarı yuvarlıyor ("50" gösterip gerçekte 49,x); operasyon reddediliyor. | casus raporu / intel | C4.6 | ajan gözlemi |
| 8 | Kraliçe evlendirilince ölen eski hükümdarın kızı yeni hükümdarın "Çocuklar" listesinde kalıyor (aile planı doğru). | `dynasty.ts` / `intrigue.ts` wedQueen | C2.6 | ajan gözlemi |
| 9 | Yağmacı baskınlarının dağılımı dengesiz: aynı tohumda bazı lordlar saatin %94–100'ünde baskın görmüyor, biri %93 görüyor; 18 baskın noktasının karada olmadığı söyleniyor. | `scripts/raid-check.ts`, `outlaws.ts` | B4.1 | **doğrulanmadı** |

**Bug olmadığı anlaşılanlar:** Muharebedeki "iman" bonusunun eksi çıkması, hükümdarın askerlik yeteneğinin de bu alana eklenmesinden. Askerlik yeteneği zayıf hükümdar −0,12 / puan ekliyor (`institutions.ts:120`); bu tasarımdaki gibi, ama alanın adı yanıltıcı. Eksik kalan diğer şeyler de bug sayılmadı:

| Ajanın bulgusu | Neden bug değil |
|---|---|
| Asker havuzunun yetmemesi | Tasarım gereği |
| Çevrimdışı lordun ölümünün geç işlenmesi | Durum tembel ilerletiliyor, tasarım gereği |
| Kraliyet isteği, taç kervanı ve hanedan haberleri için sunucu haberi yok | Bunları istemci kendisi türetiyor |
| Saray 3+ kraliçesiz lorda uyarı yok | İstemcide "Kraliçeye ihtiyacımız var" kartı var |
| SQL'in eski durumu okuması | Durum tembel ilerletiliyor |

## 2. Denge (offline birikim ve kazanç ayarı için)

| # | Bulgu | Sayılar |
|---|---|---|
| D1 | **Rakip tacın haracı geliri yiyor.** Hazinenin %8'i (en az 150, en çok %25), 30 dakikada bir; hazine büyüdükçe haraç da büyüyor. | 45 saatlik sezonda brüt ~28,3K altının 19,5K'sı (%69) haraca gitti. Çevrimdışı saray 4 (iyi oynanmış lord): 2 saatte +528, 4 saatte −148, 8 saatte −309 altın. Saray 2: 8 saatte −871, saray 3: −1534 |
| D2 | **Reddetmek, ödemekten ucuz.** Ödemek saatte ~340 altın; reddetmenin ekonomik bedeli ~0 (rakip tacın yönettiği mal satılmazsa). Bedeli diplomatik: rakip taçtaki lordlarla ilişki −100'e iniyor. Çevrimdışı oyuncu reddedemiyor. | 1. sim testi |
| D3 | **Lordlar arası haraç tavanı ~10 kat yüksek.** Tur başına en çok 4 altın, gerçek saatte 360 tur. | Saatte 1080–1440 altın; 40 dakikada 612 altın aktı. Yeni lordun geliri saatte ~700 |
| D4 | **Saray 1'de kalmak kârlı.** Yeni lord haraç ödemiyor, iki taç da bahşiş veriyor. Saray 2'ye çıkınca bu akış tersine dönüyor. | Saray 1: saatte ~365 altın bahşiş, ama hazine sınırı 1000 olduğu için 4 saatte 1875 altın boşa gitti. Saray 2: saatte ~420 haraç |
| D5 | **Hazine ve ambar sınırları birikimi boşa harcatıyor.** | Sezonda 17.668 birim mal boşa gitti; saray 1–2'de çevrimdışı altının yarısından fazlası |
| D6 | **Tüccar yedek bırakmıyor.** Yalnızca yemekte 30 turluk yedek var; yapı ve savaş malzemesi sıfıra kadar satılıyor. Beş ayrı testte tekrarlandı. | İlk 3 dakikada 120 yapı malzemesi gitti, inşaat durdu |
| D7 | **Tüccar lord yokken yarım yükle gidiyor.** | 8 saatte ~740 altın kayıp |
| D8 | **Yokluk cezası vergiyi düşürüyor.** | 8 saatte ortalama ×0,69 |
| D9 | **Afetler dolu depoya daha çok vuruyor.** | 45 saatte 6120 yapı malzemesi gitti. Fare, rutubet ve pas defterde afetlere karışıyor, ayrı görünmüyor |
| D10 | **İlerleme hızı yer seçimine ve tüccar kullanımına bağlı.** | İyi yer ve akıllı ticaret: sv2 48 dk, sv3 6,5 sa, sv4 10,7 sa. Yemeği kötü yer (1. sim testi): sv3 17,5 sa, sv4 30,5 sa. CLAUDE.md hedefi sv4 ~8 sa |
| D11 | **Uzun yürüyüş orduyu işe yaramaz hâle getiriyor.** Moral yürürken saatte −30. | 87 kişilik ordu ~170 dakikalık seferden sonra moral 4,8 ile vardı ve 30 kişilik garnizona tek turda yenildi |
| D12 | **Bir asker iki köylünün vergisini yiyor.** | Asker maaşı tur başına 0,04, köylünün normal vergisi 0,02 |
| D13 | **Salgının hanedandan birini öldürmesi pratikte hiç olmuyor.** | Salgın başına kişi başı ~%0,14 |
| D14 | **Doğal oyunda taht davacısı çıkmıyor**, çünkü tahta geçmeyen ve 30 yaşını geçmiş kardeş 0,5–3 saat içinde ölüyor. Durum düzenlenerek zorlanınca bütün akış (davacı, karargâh, saray kuşatması, tahtın kaybı, taraf değiştirme) çalıştı. | C2.14, C2.17 |
| D15 | **Taç pazarında uçurum:** ilişki −50 civarında fiyat çarpanı ×0,83'ten ×0,5'e düşüyor. | C1.10 |
| D16 | **Çevrimiçi ama cevapsız haraçtaki ×1,5 ceza %25 tavanının üstüne çıkıyor.** CLAUDE.md "hiçbir zaman %25'ten fazla değil" diyor. | 515 altınlık hazineden 192 altın (%37) |

## 3. UX

- **Elçi haberleri tek düze.** Lord başına saatte 4,2–6,6 haber geliyor; bunların ~%60–85'i haraç isteği, "haraç ödendi" ve bahşişsiz devriye uğrayışı.
- **Deniz kayıpları sessiz.** Deniz ticaretinin sonuçları, korsan saldırısı ve batan gemi için elçi haberi yok; yalnızca defter ve günlük güncelleniyor.
- **Sarayın kapısı kapanabiliyor.** Kapının önü binalarla kapanınca ordu "route" hatası alıyor ve nedeni söylenmiyor.
- **Kadırganın tayfa şartı söylenmiyor.** Tayfa asker havuzundan geliyor; havuz yetmeyince "crew" hatası çıkıyor, nedeni anlatılmıyor.

## 4. Test edilemeyenler ve neden

| Madde | Neden |
|---|---|
| A4.11 Ticaret noktası onarımı | Yağma gerekiyordu |
| B1.6 Kralın muharebede düşme şansı (%15) | Rastgele, denk gelmedi |
| B4.3 Takip edilen çeteye 20 dakikada yetişememe | Ordu çeteden hızlı |
| B5.3 "Su yolu yok" hatası | Ana nehir bütün suları bağlıyor |
| B5.10 Korsan etkisi | Bu tohumda hiçbir korsan teknesi bir iskeleye yaklaşmadı |
| C1.15 Taç savaşı | 30 saatte yalnızca gerginlikten barışa geçiş oldu |
| C2.7 Kahırdan ölüm | Rastgele, denk gelmedi |
| C3.7 Dayatılan barış | Savaş puanı 100'e ulaşmadı |
| Olta oyununun gerçek yakalaması, mini oyun puanları | İstemcideki basışları gerekiyor |

---

## Ek A: Ajan A sonucu



Toplam ~2700 oyun dakikası (45 saat). Komut sayısı ~1050: ~350 sınırını aştım (otomatik politika betiği ve botların hazırlığı). Ham kayıtlar: `.../sim2-A/events.md`, `snapshots.csv`, `offline.jsonl`. Betikler `sim2-A/` içinde (auto.py, snap.py, diff.py).

### 1. Kontrol listesi

#### A1 Kuruluş ve inşa
- A1.1 ✅ 3 lordun yields'i farklı: yemek 1.54/1.28/0.99, savaş 1.16/1.47/1.98 (sql yields).
- A1.2 ✅ İlk oduncu+ev+tarla ücretsiz: altın 150 ve yapı 120 değişmedi, `freeUsed` doldu.
- A1.3 ✅ 3. build RED queue.
- A1.4 ✅ sv1'de 4. tarla / 3. oduncu RED limit.
- A1.5 ✅ evleri yükseltince barınak 48 = sınır 48'de RED limit.
- A1.6 ✅ ev 1→3 yükseltme ('*' işareti); 3'ten sonra RED top. Yükseltirken üretimin durması doğrudan ölçülmedi.
- A1.7 ✅ yıkım yarı iade: forge (60 altın, 30 yapı) → +30 altın, +15 yapı.
- A1.8 ✅ plan move: ev (511,335)→(506,342) OK. Maliyet %40 ve süre ×1,25 ölçülmedi.
- A1.9 ✅ plan: taşı + yol + yıkım tek komut OK. İkinci yol adımı sessizce atlandı (spot): "yapılamayan adım atlanır" kuralı.
- A1.10 ✅ yol OK (sıraya girmedi).
- A1.11 ✅ sur ev yanında (509,339) RED spot; (505,339) OK. Kapı (505,340) RED spot, nedeni belirsiz.
- A1.12 ✅ 76 parçalık sur halkası sarayı kapısız kapattı: mutluluk 69→51 (≈−15 hedef).
- A1.13 ✅ halka sonrası çalışan iş 25→19.
- A1.14 ✅ RED liege (sv2 için), RED queen (sv3 ve sonradan sv5 için).
- A1.15 ⚠️ sv2'de 20×20 karo sur halkası kuruldu; hudut aşaması doğrudan okunmadı.

#### A2 Üretim ve depo
- A2.1 ✅ gece ×0,54: bot2 5 dk, gündüz savaş 96/yapı 117; gece 52/62.
- A2.2 ✅ gece mesaisi: aynı pencerede tam üretim (savaş 56/3dk ≈ 18,7/dk; gündüz 19,2; mesaisiz gece 10,4), mutluluk 76→65. Yorgunluk sayacı ölçülmedi (sql bayat okur).
- A2.3 ⚠️ biyom çarpanları farklı ama kontrollü üretim karşılaştırması yapılmadı.
- A2.4 ✅ forge kılıç/kalkan → cephanelik; keten RED locked (araştırma yok).
- A2.5 ✅ books.wastedGold/wastedGoods dolu ve hesaplı (tavan olunca).
- A2.6 ✅ kılıç tam 280'de durdu (= 200 + 2 ambar × 40).
- A2.7 ✅ hazine tavanında books.tradeHeld artıyor (233/461/222 sefer) ve altın boşa gidiyor.
- A2.8 ✅ ambar +400 (2700→3100), hazine binası +4000 (5500→9500).
- A2.9 ⚠️ fare/rutubet/pas ayrı kalem değil: disasterLost.* içine karışıyor (player yapı −6120 sezon). Notice yok. Krizin bedelinden ayrılamadı.
- A2.10 ⚠️ yön doğru ama ölçüm kirli (kış penceresi geceye denk geldi): net yemek kış-gece −52, yaz +16, sonbahar −1 (tüketim ~79/4dk).

#### A3 Nüfus ve halk
- A3.1 ✅ köylüler yavaş gelir (yer 47, köylü 40 → dolana kadar saatler).
- A3.2 ✅ bot1 yemek 0: köylü 4 (= saray hizmetlileri, yer 13), hiç sıfıra inmedi.
- A3.3 ✅ ağır vergide mutluluk 76→35, köylü 33→29 (90 dk).
- A3.4 ✅ tur başına vergi: düşük 0,24 / normal 0,61 / yüksek 1,10 / ağır 1,71 (33 köylü). Ağır: mutluluk 76→36.
- A3.5 ⚠️ kraliçe OK/RED cost görüldü; RED people denenmedi. Hükümdar ölünce kraliçe → kraliçe ana, sv5 için yeniden `queen` gerekti (§9.1 uyumlu).
- A3.6 ✅ hastaneli lord 5,4→0,7→0,0 (5'er dk), hastanesiz 7,6→3,3→1,5.
- A3.7 ⚠️ vaaz OK, 5 dk sonra ikincisi de OK (bekleme çok kısa ya da yok olabilir); mutluluk etkisi ölçülmedi.
- A3.8 ✅ books.stewarded 27 (kâhya krizleri kendiliğinden karşıladı).
- A3.9 ✅ ambar %80'de duruyor (yapı 2160 = 0,8×2700 plato); tüccar offline yarım yük: books.tradeSlack = yarım yük sefer sayısı (2 sa'te 237).
- A3.10 ✅ yokluk cezası: sv4 8 sa vergi 2072 ≈ 2880 tur × 1,0 × ort. 0,69 (−%10/saat, taban %50).
- A3.11 ⚠️ bot1 (sv1): haraç yok, bahşiş+armağan var, books.outlaws yok. Olay pencerelerinin sessizliği arayüzde gözlenemedi.

#### A4 Ticaret
- A4.1 ✅ tradeGood, 'none'.
- A4.2 ✅ 37 → RED step; 60 OK; hemen 80 → RED tradeWait; 2 dk sonra OK; 500 → RED step.
- A4.3 ✅ upgradeTrade: level 3, 140 birim/sefer sınırı.
- A4.4 ✅ player yemek satarken ~148'de kaldı (30 tur yedeği).
- A4.5 ✅ yapı 24'e, savaş 6'ya satılıyor (yedek yok).
- A4.6 ⚠️ yapı 0,20 (taban 0,3), yemek 0,173, savaş 0,42. Toparlanma eğrisi ve %30 dip ölçülmedi.
- A4.7 ⚠️ taç alımı doğrudan ölçülmedi.
- A4.8 ✅ pazar: 400 yemek −102 altın (0,255/birim), ikincisi −110.
- A4.9 ✅ taç 1: sefer 200 sn, 2× yük (160), 20 dk'da 800 savaş malzemesi → +272 altın (0,34/birim).
- A4.10 ✅ han (474,518) OK; (438,282) RED innFar; sonrakiler RED innWait.
- A4.11 ⏭️ yağma olmadı (B ajanı alanı).
- A4.12 ⚠️ lobide 3 lord, nüfus <200: etki yok, `foodDemand` yazılmadı.

#### A5 Olaylar ve uğraşlar
- A5.1 ✅ lobi (fog, locusts, earthquake) ve krallık (plague, bandits) olayları.
- A5.2 ⚠️ krizler cevaplandı (earthquake villagers/none; bandits none, stok 1200: yapı −111, savaş −107, altın −28). Üç seçenek yan yana kontrollü kıyaslanamadı, 'army' denenmedi.
- A5.3 ⚠️ cevapsız kriz kaybı disasterLost'ta; tek tek ayrıştırılamadı.
- A5.4 ✅ choose 'a' birçok kez OK.
- A5.5 ✅ en çok 2 sefer (sv4); recall eli boş; hacı +8 mutluluk; avcı +132 yemek +44 yapı; kervan +336 altın (bedel 80+100y); hazine 0. ⚠️ aynı sefer içinde aynı olay iki kez çıkıyor (hermit×2, fair×2, map×2).
- A5.6 ✅ hedefler kaydı: 5 gümüş, 4 bronz.
- A5.7 ✅ irrigation OK; flax RED excluded; forestry/fishing RED locked; metallurgy RED prereq.
- A5.8 ✅ cathedral/bazaar aktar: %25 yedek bırakıldı (altın 2376, yemek 775, yapı 775).
- A5.9 ✅ şenlik: mutluluk 64→68→74; ikincisi RED rejected.
- A5.10 ✅ bağış: ilişki 15→19; ikincisi RED rejected; yetersiz stokta RED cost.
- A5.11 ✅ hemen played → skor 0; RED busy; sonra skor 17 (7 yapı + 2 altın, bütçe 70→65,9); aynı run RED none.
- A5.12 ⚠️ kulübe iskele ekine kuruldu; cast OK, basışsız fish → miss, cast tekrar RED busy. Gerçek yakalama simüle edilmedi.
- A5.13 ✅ hisar/anıt/lonca konağı kuruldu; ikinci hisar RED unique. Etkiler ölçülmedi.

#### A6 Çevrimdışı
- A6.1 ✅ 2, 4, 8 saat yapıldı (tablo 3).
- A6.2 ✅ sv1 (2 sa, 4 sa), sv2 (2 sa, 8 sa), sv3 (4 sa, 8 sa), sv4 (2, 4, 8 sa).

### 2. İlerleme (doğal ilk 12 saat, player)
| saray | dakika | not / darboğaz |
|--|--|--|
| 1 | 0 | başlangıç 150 altın / 120 yemek / 120 yapı |
| 2 | 48 | biat 30. dk; 200 altın + 100 yapı; yapı malzemesi tüccara gidip tükendi |
| kraliçe | 179 | 300 altın + 20 nüfus |
| 3 | 389 | 1200 altın + 800 yapı + 200 savaş malzemesi + kraliçe; darboğaz altın ve ambar sınırı (sv2 depo 800, hazine 2000); tüccar malı sıfırlayıp tekrar biriktirdim |
| 4 | 639 | 2200 altın + 1500 yapı + 500 savaş malzemesi; altın darboğazı |
| 5 | 2646 (grant) | 5000/3000/1000; doğal olarak erişilmedi |
Köylü 49 civarında takıldı (ev sv1; politikam tasarruf modunda ev yükseltmedi). Yeni lordda ilk 3 dk: tradeGood=materials seçilirse 120 yapı malzemesi gider.

### 3. Çevrimdışı tablosu (başında kimse yok; haraç cevapsız, otomatik ödenir)
| tur | lord | sv | saat | altın önce→sonra | Δaltın | vergi | tüccar | haraç (ödenen) | crownGot | yağmacı | boşa altın | boşa mal | afet kaybı (yapı/savaş/yemek/altın) | köylü | mutluluk |
|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|
| r1 | player | 4 | 2 | 1555→2082 | +528 | 689 | 667 | 828 | 0 | 60 | 0 | 0 | 313/0/0/0 | 49→49 | 77→78 |
| r1 | bot1 | 1 | 2 | 1097→1000 | -97 | 294 | 0 | 0 | 731 | 0 | 1122 | 0 | 73/68/11/0 | 17→22 | 55→59 |
| r1 | bot2 | 2 | 2 | 3450→1598 | -1852 | 222 | 376 | 839 | 0 | 0 | 1552 | 629 | 246/0/22/59 | 10→16 | 60→57 |
| r2 | player | 4 | 4 | 2045→1897 | -148 | 902 | 1019 | 2023 | 0 | 16 | 0 | 0 | 194/0/104/31 | 49→49 | 78→80 |
| r2 | bot1 | 1 | 4 | 1000→1000 | 0 | 409 | 40 | 0 | 1471 | 0 | 1875 | 0 | 40/22/8/45 | 22→22 | 58→59 |
| r2 | bot2 | 3 | 4 | 3336→1747 | -1589 | 737 | 319 | 2353 | 0 | 0 | 69 | 575 | 504/0/32/322 | 28→33 | 76→77 |
| r3 | player | 4 | 8 | 1986→1677 | -309 | 2072 | 1667 | 4016 | 0 | 101 | 0 | 0 | 830/0/0/112 | 49→49 | 79→77 |
| r3 | bot1 | 2 | 8 | 2000→1129 | -871 | 1025 | 2150 | 3367 | 0 | 65 | 322 | 243 | 35/109/179/407 | 24→26 | 82→69 |
| r3 | bot2 | 3 | 8 | 1784→250 | -1534 | 867 | 2 | 2377 | 0 | 0 | 0 | 0 | 983/162/3/86 | 30→30 | 50→44 |
Notlar: botlar grant'li stok ve hazine tavanına yakın başladı (boşa altın, sv2/sv3 negatif Δaltın buna ve yemeksiz satış sıfırlamasına bağlı). Sağlıklı karşılaştırma player sv4 satırları ve bot1 sv2 (8 sa) satırıdır. Haber başına: 30 dk'da bir haraç (patrol_tribute + patrol_taken: 2 haber), kendi tacının devriyesi patrol_visit (eğlence merkezi yok → bahşiş yok), yağmacı yolu haberleri.

Kilit sonuç: offline'da brüt altın (vergi + tüccar) neredeyse tamamı hazine büyüklüğüne bağlı haraçla (hazinenin %8'i, 30 dk'da bir) gidiyor: sv4 2 sa +528 net, 4 sa −148, 8 sa −309. Yokluk cezası vergiyi 8 saatte ort. ×0,69'a, tüccar yarım yüke (tradeSlack: tüm seferler hafif) indiriyor. Yeni lordda (sv1) haraç yok, bahşiş+armağan geliyor, net pozitif (hazine tavanı olmasa).

### 4. Sezonun (player, 45 saat) gelir-gider defteri
vergi 12.894; tüccar 13.949; diğer 1.136; sefer 336 (toplam brüt ~28.3K). Giden: taç haraç 19.485 (brütün %69'u), yağmacı kesintisi 1.415, maaş 415. crownGot (bahşiş/armağan) yalnızca 194. Boşa giden mal 17.668, boşa altın 44. Afet/bozulma kaybı: yapı 6.120, yemek 1.813, savaş 1.186, altın 318 (afet sayısı 57; kâhya 27'sini karşıladı). Tüccar yarım yük sefer sayısı 1.979.

### 5. Bulunan bug / sorunlar
1. Sefer olayları tekrar: aynı seferde aynı olay iki kez çıkıyor (`hermit,hermit`, `fair,fair`, `map,map`; `Kingdom.expeditions[].result.incidents`). Kodda `expeditionOutcome` (packages/shared/src/expeditions.ts) çekilişini kontrol et. Yeniden üretme: sv4 player `expedition start hunt/caravan/treasure`, bitince sql state->'expeditions'.
2. Fare/rutubet/pas görünmez: ayrı haber ve defter kalemi yok, `disasterLost` içinde karışıyor (economy.ts ~1707 `spoiled` olayı yalnız `events`'te). Tüm sezonda 6.120 yapı kaybının ne kadarı bozulma, ne kadarı kriz bedeli bilinemez.
3. Tüccar seçili malı tamamen bitiriyor (yapı/savaş malzemesinde yedek yok): yeni oyuncu ilk 3 dk'da yapı malzemesini sıfırlayıp inşaatı durdurabiliyor. (Bilinen A4.5, ama etkisi kötü.)
4. Altın tavanına dayanan offline lordda her gelir boşa gider (bot1: 1875 altın / 4 sa); hazine binası/sv ile tavan yükselmeden kazanç görünmez.
5. Sur kapısı (505,340) RED spot, nedeni belirsiz (kapı yönü/komşu sur?). Kapının RED nedeni oyuncuya anlatılmıyor olabilir.
6. [SIM-HATA küçük] `build fisherHut` yardımcısı iskele ekini taramıyor ("hududda yer yok"); elle koordinat gerekiyor. `sql` yardımcısı `state` için bayat okur (tembel ekonomi), ölçüm `status` ile yapılmalı.
7. Saray 5 yükseltmesi hükümdar ölünce RED queen; elçi/arayüz önceden uyarmıyor (hükümdar ölümü sonrası kraliçe yok uyarısı yalnızca ≥3. seviye sarayda kendiliğinden).
8. Vaaz bekleme süresi 5 dk'da bitiyor gibi (2. vaaz OK): tasarımda "bekleme süresiyle" yazıyor, süre denge dosyasından doğrulanmadı.

### 6. En önemli 10 bulgu
1. Offline'da haraç baskın gider: sv4 8 saatte brüt ~3.900 altının 4.016'sı haraç (16 ziyaret × ~250). Net −309.
2. Haraç hazine ile büyüdüğü için offline'da altın biriktirmek cezalandırılıyor; net birikimin pozitife geçmesi için haraç payı/ya da offline tüccar çarpanı değişmeli.
3. Yokluk cezası çalışıyor: vergi 8 sa'te ort. ×0,69 (−%10/saat, taban %50); tüccar tüm seferlerde yarım yük.
4. Yeni lord (sv1) offline'da net pozitif ve haraçsız: bahşiş+armağan 2 sa'te 731, 4 sa'te 1.471, ama 1000 altın hazine tavanı bunu boşa harcatıyor.
5. Tüccar tek mal satıp stoku sıfırlıyor: yeni oyuncu ilk 3 dk'da yapı malzemesini tüketiyor; ilerlemeyi 1+ saat geciktirebilir.
6. Doğal ilerleme: sv2 48 dk, sv3 389 dk, sv4 639 dk; darboğaz altın ve depo sınırı. Kraliçe şartı ve ambar sınırı sv3 için ek bekleme.
7. Afetler dolu depoyu kemiriyor (player 45 sa'te yapı −6.120, boşa mal 17.668); depoyu %80'in üstünde tutmak anlamsız (üretim %80'de duruyor).
8. Hükümdar ölümü (38. saat) kraliçeyi düşürür; sv5 yükseltmesi RED queen. Oyuncuyu önceden uyaran yok.
9. Mutluluk/vergi/göç mantığı tutarlı: ağır vergi mutluluk 76→35, köylü 33→29 (90 dk); sur halkası mutluluğu −15 hedefe çekiyor ve çalışan işleri 25→19'a düşürüyor.
10. Seferler: kervan en kârlı (+336 altın bedel 80g+100y), hazine boş; kayıp hiç olmadı; olay çekilişi tekrar ediyor (bug adayı).

---

## Ek B: Ajan B sonucu



Lobi 0a4da2d1…, player + bot1 + bot2, ~1320 oyun dakikası (22 saat) sanal saat, ~340 komut, 20 muharebe. Ham kayıt: `sim2-B/events.md`, `sim2-B/battles.txt`, yardımcı betikler `sim2-B/*.ts`.
Yönetmen müdahaleleri (hepsi `note` ile): garnizona toplu asker `patch` (havuz/barınak yüzünden eğitimle 50+ asker mümkün değil), bot lordlara asker, bir kez `navy.harbour` (tayfa havuzu), bot1'e 3 kadırga.

### 1. Kontrol listesi

#### B1 Kışla ve ordu
- B1.1 ⚠️ mızrakçı eğitimi OK; süvari kışla sv1'de `RED locked` ✔, kalkanlı/mancınık `RED research` ✔; okçu/süvari gerçek eğitimi köylü havuzu (`RED people`, manpower 6) yüzünden tamamlanamadı. Karşıtlık testleri için birlikler patch ile
- B1.2 ⚠️ 30 asker istendi, havuz 6 → `RED people` ✔; mutluluğa bağlı oranın kendisi sayısal sınanmadı (yalnız kod okundu)
- B1.3 ✅ bot1 disband 25 mızrakçı → köylü 0→11 (barınak 17 − asker 6). Barınak taşınca köylü görünmüyor (kural gereği)
- B1.4 ✅ en fazla 2 ordu: 3. `raise` ve doluyken `split` `RED armies`; boşken split 70→50+20 OK, merge aynı karo OK, >5 karo `order_failed far`
- B1.5 ✅ hudut dışında emir +30 sn (21:28:25 vs 21:27:55), hudut içinde anında
- B1.6 ✅ king lead (kraliçe+oğul şart) → `armies.led_by`; kralın ordusuna emir uzakta bile anında; uzaktayken leave `RED king_palace`; %15 düşme şansı ⏭️ (rastgele, yeterli yenilgi üretilmedi)
- B1.7 ⚠️ morale: 87'lik ordu ~170 dk kampanyada 100→4.8, kuşatmada 1 turda 0 → retreat. Han toparlanması sınanmadı
- B1.8 ✅ 39 askerlik ordu hududun 6 karo yakınında: `fearUntil` +120 sn, `army_threat`, bot1 mutluluk 77→70 düşüş
- B1.9 ✅ maaş/yemek tur başına (maaş −1…−12/tur), `books.wages` birikiyor; yemek 0 olunca açlık mutluluğu düşürdü

#### B2 Muharebe
- B2.1 ✅ meydan muharebesi 5 karo temas: #5 #6 #8 #9 #18 #24 #25 #26
- B2.2 ❌ **Doğrulandı** (bölüm 3)
- B2.3 ✅ okçu>mızrak ve süvari>okçu: ±1.5 karşıtlık (#10 #11)
- B2.4 ✅ saray kuşatması #21/#23: garnizon + 2 kule (db 3.02–3.14), kule 2 vuruş/tur; sur ve mancınık analitik: sur +1/4 sur (en çok +3), mancınık 2 sur siler (walls.ts çıktısı); oyunda sur kurulmadığından canlı doğrulanamadı
- B2.5 ⚠️ yağma %15 ✔ (119 savaş/78 yemek/191 altın/120 yapı), kalkan 15 dk ✔ (850 sn kalan); kuşatma halkı kaçırması hedefte köylü olmadığı için sınanamadı
- B2.6 ✅ kule menzilinde ordu 20 sn'de 1 asker: 16 dk'da 48 asker (`books.lost.towers` 52); tek haber birikerek (3→48), 15 dk sonra yenisi
- B2.7 ✅ müttefik (bot2 ordusu 31 asker) #26'da player tarafına katıldı (6 karo içinde); 14 karo uzaktaysa katılmadı
- B2.8 ✅ taç şehri 1 çevresinde iki düşman ordusu aynı noktada bekledi, muharebe yok; dışarı çıkınca muharebe
- B2.9 ⚠️ yalnız betikle: route-check 40/40 rota, 21 köprü, havada kalma 0. Kapı/sur geçişi oyunda sınanmadı ⏭️
- B2.10 ✅ yenilen ordu `retreat:true` ile eve; yük `cargo_lost {arms:60}` (#27)

#### B3 Kasabalar
- B3.1 ✅ 900 sn, ordu 24→19; garnizon 7
- B3.2 ✅ tahta surlu 1170 sn (=900×1.3), garnizon 12 → 10 kayıp (12×0,6×1,35)
- B3.3 ✅ barış içindeki lordun kasabasına `order_failed why=peace`; savaştaki bot1'in kasabası alındı
- B3.4 ✅ katkılar (yemek 755 / 24 dk, silah 670, altın) sadakat çarpanıyla
- B3.5 ✅ bakım 3: sadakat 60'a, bakım 0: 26'ya; bakım ödenmezse `unpaid`
- B3.6 ✅ ayaklanma (<25) asi 4–7; bastırma muharebesi #19: sadakat +10, `quietUntil` +30 dk
- B3.7 ✅ <12 → `town_lost_revolt` (Kavakpazar defalarca), sahipsiz + 3–6 garnizon
- B3.8 ✅ 4 kasabada sadakat tavanı çöker (Gümüşgöl 12'ye, 9 dk sonra koptu); 3'e inince hâlâ ayaklanma
- B3.9 ✅ releaseTown: sahipsiz, garnizon 3
- B3.10 ✅ townBuy 100 yemek=30 altın; 2. alım `RED carry` (14 asker×12); `cargo_home wasted 0`
- B3.11 ✅ kuşatma başlayınca ilişki −15

#### B4 Yağmacı/mağara
- B4.1 ✅ çeteler saatten; `bandRaid` döngüsü (go/lurk/back) 3 çetede; raid-check/outlaw-water-check temiz, ama dengesizlik (bölüm 4 #6)
- B4.2 ✅ `books.outlaws` 79 / 379 altın; yağmacı payı 0.97
- B4.3 ⚠️ takip → 4 karoda muharebe ✔; 20 dk yetişememe ⏭️ (ordu çeteden hızlı, tetiklenemedi)
- B4.4 ✅ ganimet 9/6/4×kişi ✔ (81/54/36), 45 dk dağılma, geri dönüşte güç değişti (8→9→16)
- B4.5 ⚠️ Bilinen hata doğrulandı (bölüm 4 #3)
- B4.6 ✅ casussuz 1. zafer yalnız yön; casus evi ile 2. zaferde mağara bulundu (cave 3 @905,385 = caveSpots)
- B4.7 ✅ `cave_probe` varışta; <5 dk içinde tekrar yok, 86 dk sonra tekrar; boş/dolu aynı
- B4.8 ✅ kuşatma #16 (110 vs 35): klan yok, yeni "Geceyele klanı", `cavesTaken` 1, çeteler 10 dk dağıldı, `clan_destroyed` herkese, ganimet 243/175/399/195
- B4.9 ✅ garnizon +1/20 dk (23→39), ganimet +40/25/20/20 saatlik 8 saat (250→570)

#### B5 Deniz
- B5.1 ⚠️ tersane sv1 kızak 1, corsair `locked`; tayfa havuzdan ✔ ama 2. gemi `RED crew` (havuz ≈ (köylü+asker+denizci)×pay − asker − denizci, küçük lordlukta 1 gemiyi geçmiyor)
- B5.2 ✅ form/merge/split, en çok 2 filo (`RED fleets`); ⚠️ dock ışınlanması (bölüm 4 #2)
- B5.3 ⚠️ karaya `RED land` ✔; "su yolu yok" tetiklenemedi, ana nehir her yeri bağlıyor
- B5.4 ✅ 22 sefer, 1608 birim, 371 altın, 3 korsan saldırısı (208 birim kayıp, 35 ödül); haber yok (bölüm 4 #5)
- B5.5 ⚠️ `fish` görevi çalışıyor (mission yazılı), yemek etkisi ayrıştırılamadı
- B5.6 ⚠️ `hunt` görevi 15 dk çalıştı (`books.navy` 22.8→113.7) fakat ayrıntılı haber/kayıt yok
- B5.7 ✅ korsan teknesi takibi: pirate_battle won, ödül 60+25×3 altın, 20×3, 30×3 ✔, 1 kadırga battı; 2. chase `RED chasing`
- B5.8 ✅ limana abluka: 3 kadırga (9) vs 5 muhafız (9) kaybetti, 9 gemilik filo kazandı; nüfus 60→47.6/20 dk (=36.7/sa ✔); abluka kalkınca 60'a döndü
- B5.9 ✅ abluka (kazan/kaybet), kıyı akını (loot arms 48), recall→`blockade_lifted`, ablukayı yarma (sortie) 1 vs 7 kaybetti
- B5.10 ⚠️ bu tohumda hiçbir korsan teknesi hiçbir lordun iskelesine 45 karo girmedi (seaHeld hep 0) → korsan etkisi sınanamadı; korsan mevsimi ayrıca sınanmadı

### 2. Muharebe tablosu (`battles.txt`, ka/kd = tur toplamı öldürenler)

| # | tür | saldıran → savunan | birlikler | zar bonusu A/D | tur | öldürdü A / D | kayıp A / D | kazanan |
|---|---|---|---|---|---|---|---|---|
| 3 | yağmacı | 5 → 8 | mızrak / 5m+3o | −0.76 / 1.61 | 5 | 0 / 3 | 3 / 0 | savunan |
| 4 | yağmacı | 10 → 8 | mızrak | −0.74 / 1.61 | 7 | 4 / 0 | 0 / 4 | saldıran |
| 5 | alan | 10 → 10 | mızrak (morale 37) | −0.26 / −0.36 | 4 | 1 / 3 | 3 / 1 | savunan |
| 6 | alan | 15 → 15 | mızrak | −0.26 / −0.12 | 11 | 6 / 4 | 4 / 6 | saldıran |
| 8 | alan | 30 → 30 | mızrak | 0.41 / −0.12 | 11 | 14 / 10 | 10 / 14 | saldıran |
| 9 | alan | 50 → 50 | mızrak | −0.36 / −0.36 | 12 | 20 / 14 | 14 / 20 | saldıran |
| 10 | alan | 30 → 30 | süvari → okçu | 1.45 / −1.62 | 9 | 21 / 5 | 5 / 21 | saldıran |
| 11 | alan | 30 → 30 | okçu → mızrak | 1.91 / −1.62 | 9 | 13 / 6 | 6 / 13 | saldıran |
| 12 | yağmacı | 14 → 9 | mızrak | −0.86 / 1.55 | 5 | 3 / 0 | 0 / 3 | saldıran |
| 13 | yağmacı | 19 → 13 | mızrak | −0.94 / 1.63 | 7 | **0 / 7** | 7 / 0 | **savunan** |
| 16 | mağara | 110 → 35 | mızrak | −0.96 / 3.30 | 4 | 23 / 8 | 8 / 23 | saldıran |
| 18 | alan | 98 → 34 | mızrak | −0.36 / 1.14 | 6 | 23 / 5 | 5 / 23 | saldıran |
| 19 | isyan | 87 → 4 | mızrak | −0.35 / 0.90 | 1 | 4 / 0 | 0 / 4 | saldıran |
| 21 | kuşatma | 87 → 30 + 2 kule | mızrak (morale 4.8) | −0.36 / 3.14 | 1 | 5 / 5 | 5 / 5 | savunan |
| 22 | yağmacı | 12 → 16 | mızrak | −0.86 / 1.61 | 8 | 2 / 7 | 7 / 2 | savunan |
| 23 | kuşatma | 110 (10 mancınık) → 25 + 2 kule | | −0.36 / 3.02 | 3 | 17 / 16 | 16 / 17 | saldıran |
| 24 | alan | 43 → 30 (bot1 kapısı, 2 kule) | | 1.09 / 3.02 | 6 | 4 / 34 | 34 / 4 | savunan |
| 25 | alan | 25 → 26 | mızrak | 0.77 / 0.65 | 8 | 8 / 11 | 11 / 8 | savunan |
| 26 | alan | 71 (40 + müttefik 31) → 18 | | 1.14 / 0.51 | 2 | 6 / 1 | 1 / 6 | saldıran |
| 27 | yağmacı | 10 → 12 | mızrak | −1.09 / 1.55 | 7 | 0 / 5 | 5 / 0 | savunan |

Tüm tablodan: yağmacıların zar bonusu +1.55…+1.63 (moral 55, saha bilgisi 70; ordunun saha bilgisi ve kralın askerlik yeteneği zayıf: −0.4…−1.1) yüzünden 19 asker 13'lük çeteye yenildi.

### 3. Küçük ordu yuvarlama analizi (planBattle doğrudan, 2000 tohum, eşit orduların morale 100, saha bilgisi 0)

`killsByA = min(d, Math.round(a × güç × 0.008 × (zar + bonus)))`. zar+bonus ≤ ~10 → bir turda ≥1 öldürmek için `a × 0,008 × s ≥ 0,5` → a ≥ 62,5/s.

| n (her iki taraf) | tüm muharebede ort. öldürülen (taraf başına) | hiç öldürmeme olasılığı | ort. tur | ort. kayıp % |
|---|---|---|---|---|
| 1–6 | **0,00** | **%100** | 11 | 0 (yalnız morale ile kazanır/kaybeder, A kazanma %43) |
| 7 | 1,25 | %44 | | |
| 8 | 1,98 | %22 | | |
| 9 | 2,60 | %12 | | |
| 10 | 3,15 | %5 | 10,5 | %32 |
| 12 | 4,29 | %1 | | |
| 14 | 5,24 | %0 | | |
| 15 | 5,61 | %0 | 10,7 | %37 |
| 20 | 7,32 | %0 | 10,7 | %36,5 |
| 30 | 11,33 | %0 | 10,7 | %37,8 |
| 50 | 19,14 | %0 | 10,8 | %38,3 |

Asimetri: 5 v 30 → küçük taraf 0 öldürür (%100 sıfır), 30'luk 4,9 öldürür; 3 v 12 → 0 / 2,6; 10 v 50 → 0,74 (%43 sıfır) / 9,7. Gerçek sunucu doğrulaması: battle #3 (5 asker: 0 öldürdü, 3 kayıp), #27 (10 asker vs 12: 0 öldürdü, 5 kayıp), #13 (19 vs 13: 0 öldürdü). 6 asker ve altı hasar vermeden yalnızca moral kaybıyla çekilir/yenilir. Ayrıca (yağmacı bonusu +1,6 ve kral dice'ı −0,4…−1) nedeniyle 20'ye yakın ordu bile 13'lük çeteyi sıfır hasarla geçemeyebiliyor.
Öneri: kills'i kesirli biriktir (`carry`) ya da `Math.round` yerine olasılıksal/toplamalı yuvarlama kullan; en azından her tur `max(1, …)` yerine kalanı sonraki tura taşı.
Dosyalar: `sim2-B/round.ts`, `round2.ts`, `round2.txt`.

### 4. Bug'lar / sorunlar

1. **B2.2 yuvarlama**: `packages/shared/src/military.ts:942-943`. Yeniden üretme: 6 askerlik orduyla herhangi bir muharebe (ör. `raise spear 5` + `army chase band 0`) → 0 kill. Etki: küçük/orta ordular yağmacıya karşı etkisiz; lord ordusu 12 civarına kadar anlamsız.
2. **Filo dock ışınlaması**: `packages/shared/src/navy.ts:226` `atHome = HOME_MISSIONS.includes(mission.kind)`; `dockFleet` (navy.ts:281-292) filonun `sail` ile uzağa gönderilmiş olmasına bakmıyor. Adım: `fleet sail` (400 karo), sonra `fleet dock` → anında limana (seyir süresi atlanıyor). Ayrıca `trade` görevindeki filo `mission port` ile anında iptal edilebiliyor.
3. **B4.5 çift takip**: `supabase/functions/command/index.ts:1196-1203` yalnız aynı çete için engelliyor. Adım: hudut dışındaki orduya `chase band 3` sonra `chase band 0` → ikisi de `army_orders`'a yazılıyor (aynı effective_at), sonuncusu geçerli. Hudut içinde ikincisi hedefi ezip geçiyor.
4. **Kuşatmaya yürürken muharebe hedefi siliyor**: ordu 20 `move … siege:true` ile town 49'a giderken bot1 ordusuyla muharebe yaptı, kazandıktan sonra `goal` `{kind:'move'}` oldu ve 6 karo kala idle kaldı (kuşatma emri kayboldu). İlgili yer tick.ts muharebe sonrası ordu güncellemesi.
5. **Deniz olayları için bildirim yok**: korsan saldırısı, kayıp yük, hunt ödülü/kaybı, ticaret dönüşü sunucuda `notices`'a yazılmıyor (yalnız `pirate_battle`/`haven_battle`/`naval_battle` var); `Kingdom.navy.ledger` ve `books.navy` güncelleniyor, gerisi istemci günlüğüne kalıyor.
6. **Yağmacı baskın dağılımı** (raid-check, seed 4242): lord 3/5/9 saatin %94–100'ünde hiç baskın görmüyor (mean ≤%3), lord 7 mean %93; `off-land raid points 18` (baskın yolu karadan çıkıyor). Seed 777/12345'te benzer.
7. **UX/denge: zafer sonrası kule kanaması**: kuşatmayı kazanan ordu saray kapısında emir almazsa kulelerin menzilinde 20 sn'de bir asker kaybediyor (16 dk'da 48/91); otomatik geri çekilme yok. Ayrıca kalkan bitince yeni kuşatma kendiliğinden başlamıyor (hedef 'move'a dönmüş).
8. **Yağmacı çetesi savunan bonusu**: +1.55…+1.63 sabit; lord (kral askerlik 3 → −0.36…−1.09) ile birleşince eşit büyüklükte orduyu sistematik yeniyor (19 v 13, 12 v 16'da 2 öldürdü). Denge gözden geçirilmeli (B2.2 ile birlikte).
9. **Mağara incelemesi haberi yalnız varışta**: orada 60 dk bekleyen ordu yeniden "inceleyemedi" haberi almıyor (spec "saatte bir"). Küçük.
10. **Donanma tayfa limiti**: crew havuzu (cap) küçük lordlukta 1 gemiyi geçmiyor; barınak/asker çakışması. Tersane (sv4) için 2. gemi ancak ~60 nüfusla mümkün; oyuncu için gizli kısıt, UI'da neden `RED crew` açıklanmalı.
11. [SIM] macOS BSD `sed -i` ile uyumsuz kendi yardımcı betiğim; simülatör hatası yok.

### 5. En önemli 10 bulgu

1. Küçük ordu yuvarlama hatası kesin: ≤6 asker hiç öldüremez, 10'dan azında muharebe moralle çözülüyor (military.ts:942).
2. Yağmacı savunma bonusu + kral dice'ı: 19 asker 13'lük çeteye sıfır hasarla kaybetti; takip yalnız büyük (>30) ordularla anlamlı.
3. Filo `dock` seyir süresini atlatıyor (ışınlanma).
4. Aynı orduya iki farklı çete için takip emri verilebiliyor, sonuncusu kazanıyor.
5. Kuşatmaya giderken meydan muharebesi kuşatma hedefini siliyor.
6. Deniz ticareti/korsan/hunt sonuçları için sunucu haberi yok.
7. Kasaba zinciri tutarlı çalışıyor: 4+ kasabada tavan çöküşü, ayaklanma→kopma, bastırma +10 sadakat, bakım etkisi, pazar kargosu ve −15 ilişki doğru.
8. Mağara zinciri bütün adımlarıyla doğru: iz, casus evi kısayolu, kuşatma, yeni klan, 10 dk dağılma, büyüme.
9. Müttefik katılımı ve taç şehri güvenli bölgesi doğru çalışıyor; kule kanaması ve haber birikimi kuralı gibi.
10. Korsan etkisi (seaHeld) bu tohumda hiçbir lorda ulaşmıyor; deniz mekanikleri (abluka, akın, liman) ise sağlam.

---

## Ek C: Ajan C sonucu


Süre: 1784 sanal dk (~29,7 oyun saati), ~185 oyuncu komutu + ~130 yönetmen müdahalesi (patch/grant, hepsi events.md'de `YÖNETMEN` ve `note` ile). Kanıt: $SIM_DIR/events.md (sim2-C), sim2-log.md.
Lordlar: player #9 (taç0), bot1 #10 (taç1), bot2 #12 (taç0), bot3 #14 (taç1 → t=362'de taç0'a geçti).

### 1. Kontrol listesi
#### C1 Taçlar
- ✅ C1.1 biat: 2 yapıyla `early` RED; 8 yapıda 4 lord de biat etti.
- ✅ C1.2 yeni lord (sv1): kendi taç patrol_tip 120 (güç ×1,1 → 132) + ilk seferde Teşekkür sepeti; rakip taç rival_gift 80 (88), ~30 dk'da bir.
- ✅ C1.3 devriye 30 dk'lık slotlarda; eğlence merkezi olmayan sv2+ lordda yalnız patrol_visit (+1 ilişki), bahşiş yok.
- ✅ C1.4 tavern + sv4: tip 66 (=60×huy 1,1); devriye komutanı kardeşle 91; taç değişince 76–80 (güç payı). Tüm değerler 55–132 aralığında.
- ✅ C1.5 armağan baremleri: 85+ Hükümdarın lütfu (35 altın/20 yemek/20 yapı/15 savaş), 60+ Saray armağanı (21/14/14, güç ×1,17), 30+ Teşekkür sepeti; <30 armağan yok.
- ✅ C1.6 haraççı 30 dk'da bir; talep = hazinenin %8'i (×1,1 gerginlik) en az 150, en çok %25 (hazine 515 → 128); sv2/3/4 hepsinde aynı kural.
- ✅ C1.7 öde/reddet/konuş: 3 uygun cevap 156→94 (×0,6); 2 sert cevap konuşmayı kesti, 156→187 (×1,2), ret = taçla −15 (−10×1,5) ve rakip taçın bütün lordlarıyla −8×1,5; ödeme +4. Reddedince taç0 lordları bot1'le −20→−32.
- ✅ C1.8 cevapsız haraç: oyundaki lord 165→248 (×1,5, afk:true), çevrimdışı 165/156 (afk:false).
- ✅ C1.9 ilişki dinlenmesi: 64→54 (~1 saat).
- ⚠️ C1.10 taç pazarı: yalnız kod/hesap incelemesi (+100 ×1,25; −49'da ×0,84; ≤−50 ×0,5: −49→−51 arasında 0,84→0,5 uçurumu; −100'e doğru 0,65 hiç görülmez). Ticaretle ölçülmedi (A ajanı).
- ✅ C1.11 sipariş: 440 yapı→203 altın (0,46/birim ≈ 0,3×1,25×1,2), kervan yola çıktı, dönüşte ödeme geldi; dönüş için haber (notice) yok.
- ⚠️ C1.12 görev: take OK; `order` türü görev (take→siparişi gönder→claim) +197 altın, rakip taç +3 ✅. trade/town/army/yağmacı/korsan türleri ölçülmedi.
- ✅ C1.13 kraliyet isteği: accept+deliver (570 savaş malzemesi) +170 altın (sv4 tavanı), ilişki +4. decline denenmedi.
- ✅ C1.14 güç: tip çarpanı lord sayısına göre değişti (bot3 taç değiştirince 66→76).
- ⚠️ C1.15 rekabet: 30 saatte 1 geçiş (tension→peace, 09:00); savaş hâli ve kazanan +4 görülmedi (3 saatlik pencere, hal zinciri sakin).
- ✅ C1.16 rakip taç: ilişki −20'den başlıyor (−32 reddetmeyle), 6 hediyeyle +40'ta tavan.
#### C2 Hanedan
- ✅ C2.1 doğumlar/plan: her lordda ≤2 çocuk, iki kız yok (bot1 oğul+kız, bot3 iki oğul, bot2 yeni çift plan sons1/daughters1).
- ✅ C2.2 ad bir kez (ikinci nameChild RED named), eğitim +3 (finance 7→10).
- ✅ C2.3 reşit olma: bornAt 15,97 yıl → birkaç dk sonra grown, +3.
- ✅ C2.4 ölüm/tahta geçiş: player (bebek varis → council), bot3 (reşit oğul Alpay, kraliçe→kraliçe ana, küçük oğul kardeş), bot2/bot1 (kraliçe tek başına).
- ⚠️ C2.5 konsey: council=true regentFor=3 ✅; "akraba 3 yıl" için kinsmanAt patch ile (bot1 Kerem tahta çıktı).
- ✅ C2.6 kraliçe tek başına (regnant) + wedQueen: bot2 Arslan tahta çıktı, bot1 kinsmanAt ile Kerem.
- ⏭️ C2.7 kahırdan ölüm: kaybedilen meydan muharebesi yok (B alanı; davacı savaşları sayılmaz).
- ⚠️ C2.8 salgın: sicknessStrikes olasılığı share×0,001/tur ve share ~%3,5/tur sönüyor → bir salgında kişi başı ≈%0,14. Sınanamadı, pratikte etkisiz.
- ✅ C2.9 kardeş genç ölümü: tahta geçişte Cengiz cause=sickness deathAt planlandı, patch ile öne çekilince öldü (dead'e geçti).
- ✅ C2.10 hediye +15 op, 20 dk bekleme (RED cooldown). ⚠️ görevden alma −20 erkekte denenmedi.
- ⚠️ C2.11 devriye komutanı ✅ (tip ×1,38), vali ataması OK ama etkisi ölçülmedi, hazinedar atanmadı.
- ✅ C2.12 taca (+25 ilişki, 200 çeyiz), sahipsiz kasabaya (Kervansu bağlandı, sadakat 60), lorda (ilişki<0 RED; teklif→kabul, gelin Gelinler'de, +30).
- ✅ C2.13 kin_unhappy (−22'de bir kez).
- ✅ C2.14 davacı: bakış ≈−80 iken sunucu ~50 dk içinde pretender_rise (bot3 t=356, bot1 357, bot2 363; ikinci tur 446); grow 30/51. dk; 60 dk sonra siege.
- ✅ C2.15 karargâha 80 mızrakçı (3 dk, kayıp 9/14, pretender_crushed); taçtan yardım: destekliyorsa granted:false why:backed; desteklemiyorsa asker −12, altın +242, ilişki ≈−6, ikincisi aid_asked RED.
- ✅ C2.16 tahtın kaybı: bot1 (garnizon yok, 61 asi, taç destekli) 417→418 throne_lost; bot2 (55 garnizon) throne_held.
- ✅ C2.17 taraf değiştirme: bastırınca liegeOffer (30 dk); accept → liege 1→0, ilişki [−15,−34]→[35,−60], liege_changed öbür lordlara; sadık kal +20 ilişki +250 altın; ikinci cevap RED switch_none; taç desteklemediğinde teklif yok.
#### C3 Diplomasi
- ✅ C3.1 improve +10 (50 altın), gift 0,1/altın (maks +20), elçi 60 sn.
- ✅ C3.2 haraç isteği kabul −5; kesen −45 (+ −5 diğerlerine, renege claim); isteyen kaldırır +5; reddedilen/cevapsız teklif −30.
- ✅ C3.3 ittifak: 19,7'de RED relation, 58'de kabul; bozma −40, claim.
- ✅ C3.4 hakaret −25 + claim (2 saat).
- ✅ C3.5 raid: 1. deneme başarısız (−4 asker, −30), 2. başarılı: ticaret noktası damaged, 120 yemek yağma. Kule şansı ölçülmedi.
- ✅ C3.6 savaş: gerekçesiz −37'de RED; claim ile −25'te OK; gerekçesiz −72'de savaş ilanı herkesle −10.
- ⚠️ C3.7 beyaz barış ✅; skorsuz gold/tribute RED score ✅; dayatılan barış ⏭️ (muharebe gerek).
- ✅ C3.8 itibar: ilişkileri bozuk bot2 improve +6, temiz bot3 +10,3.
- ✅ C3.9 cevapsız teklif 10 dk sonra expired (+ −30).
#### C4 Casusluk
- ✅ C4.1 spyHouse sv1 → 3 dk'da 2 casus (kapasite 2, 60 sn/casus).
- ✅ C4.2 aynı konuya ikinci casus RED already; ağ 10 dk'da ~50–63; karşı casusluk hızı düşürüyor (düşman lordda 78'e 25 dk).
- ✅ C4.3 intel hata aralıkları (altın 702–968 @50).
- ✅ C4.4 doğal yakalanma 4 kez (75 dk, 4 sa…) + operasyon başarısızlığında yakalanma: ilişki −15, claim, spy_caught/spy_lost.
- ✅ C4.5 recall.
- ✅ C4.6 sabotaj burn: yemek/yapı −%25.
- ✅ C4.7 kidnap (3/6 deneme başarılı), fidye 720 (min 500), ransom ve release çalıştı (release +10).
- ✅ C4.8 revolt (revoltUntil +600 sn), townRevolt (sadakat −35).
- ✅ C4.9 operasyon ağ harcıyor (50→6, 90→0).

### 2. Haraç / devriye / armağan tablosu
| Saray sv | Durum | Devriye/tip | Haraç talebi | Armağan |
|---|---|---|---|---|
| 1 (yeni) | kendi taç tip 120 (×1,1=132), rakip kese 80 (88), 30 dk'da bir | – | haraç yok | ilk seferde sepet |
| 2 | tavernsiz: yalnız visit (+1) | yok | 165 = 150×1,1 (hazine 700–1100) | – |
| 3 | tavernsiz bot2 | yok | 8%×1,1; 3292 altın → 289; 1050 → 165 | – |
| 4 + tavern | tip 55–132 (ort 68–99) | komutanla 91 | %8,8 (hazine 3000–5500 → 271–484 afk dahil değil; afk ×1,5 = 248–726); hazine 515 → 128 (%25 tavan) | rel 30/60/85 baremleri |
Haraççı oranı gözlem (160 talep): 0,075–0,25 (ort. 0,08 zengin, 0,23 yoksul). Konuşma: iyi×3 ×0,6, sert×2 ×1,2 (bitiş), tek iyi ×0,9. Ret −15 (angry) / −10 + −8×1,5 diğer lordlar. 7,5 saatte oyuncu cevapsızlıktan ~57 haraç (1,5×) ödedi.

### 3. Hanedan zaman çizelgesi
- t≈0 hükümdarlar 26–38 yaş; player Cem+Ilgın, ilk oğul Turgut t≈210'da doğdu (kraliçe t≈150).
- t=285 player: Cem öldü (patch) → Turgut II (bebek) tahtta, council/regentFor, Ilgın kraliçe ana; ~t=1050 reşit (konsey kalktı).
- t=292 bot2/bot1 hükümdar öldü → kraliçe tek başına; t=294 wedQueen (Arslan), kinsmanAt patch (Kerem).
- t=356/357/363 davacı yükselişleri (bot3, bot1, bot2); t=360 bot3 davacı ezildi; t=362 taç değiştirdi; t=418 bot1 tahtı kaybetti (Hirsli, deposed Kerem); t=426 bot2 tahtı korudu.
- t=446: ikinci davacılar (bot2 #53 taçsız yardımlı; bot3 #54 ezildi → sadık kal t=477).
- t=486 bot3 Alpay reşit; t=526 bot3 Turgut öldü → Alpay, Cengiz kardeş (sickness) → t≈526 öldü.
- Doğal doğumlar: bot1 Korkut+Gülnar (t≈130–180), bot2 Ilgın, bot3 Alpay+Cengiz. Taç: t≈ (17:30 UTC=1050) taç0 hükümdar Mehmed (açgözlü).

### 4. Elçi haber türleri / saatlik sıklık (4 lord, 29,7 sa, lord-saat başına)
patrol_tribute 1,75 · patrol_taken 1,72 · patrol_visit 0,63 · patrol_tip 0,35 · outlaw_road 0,34 · envoy_courtesy 0,14 · rival_gift 0,07 · pretender_grow 0,06 · spy_caught 0,05 · spy_lost 0,05 · envoy_proposal 0,05 · envoy_answer 0,05 · operation_struck 0,04 · kin_unhappy 0,04 · diğerleri <0,04. Lord başına toplam 5,3–6,6 haber/saat (%62'si haraç isteği+ödendi çifti). Hanedan haberleri sunucuda notice değil (istemci türetir): doğum/ölüm/tahta geçiş notice listesinde görünmez. Siparişin dönüşü, royal istek ve taç hükümdar değişimi de notice değil. Haraç: 30 dk'da bir "talep" + 5 dk sonra "ödendi" = çevrimdışı/AFK oyuncuya ~4 haber/saat sadece haraçtan: bıktırıcı sınırda (raf ömrü/özetleme istemcide).

### 5. Bug'lar / sorunlar
1. [UX] Casus raporu 'stores 50' gösterirken burn (min 50) RED strength verdi (yuvarlama). Yeniden üret: 10 dk ağ, intel→operation burn hemen. (espionage.ts operationError / intel yuvarlaması)
2. [UX] Ilgın (eski kralın kızı) kinsman Arslan'ın "Çocuklar" listesinde kalıyor; yeni kızla iki kız görünüyor (plan kuralı yeni çift için korunuyor). Yeniden üret: bot2'de kral ölür, oğul/kardeş yok, wedQueen.
3. [DENGE] Lordlar arası haraç 3 altın/tur = 1080 altın/saat (tur=10 sn, 360 tur/sa); tavan 4 → 1440/sa. Yeni lord geliri ~700/sa. Tek anlaşma ödeyeni batırır, alanı çok zenginleştirir (40 dk'da 612). CLAUDE.md "15 tur/oyun saati" ifadesi gerçek saatle karışık.
4. [DENGE] Kidnap: 6 denemede 3 başarı (%40–60); başarısızlık casus+70 ağ+ilişki −15+claim; başarıda fidye 500–720 (≈ maliyet 200). Çok kârlı değil ama kraliçesiz lordu uzun süre cezalandırıyor; ransom hemen ödenebiliyor.
5. [DENGE] Salgın hanedan ölümleri pratikte olmaz (~%0,14/kişi/salgın).
6. [UX] Kraliyet isteği, sipariş dönüşü, hükümdar ölümü/taç değişimi için sunucu notice yok (istemci üretir); çevrimdışı lordda tembel durum: hükümdarın ölümü komut/okuma gelene dek işlenmiyor (tasarım). Test: deathAt+90sn, 4 dk sonra hâlâ yaşıyordu; `seen` sonrası ölü.
7. [DENGE] Taç pazarı çarpanı ≥−50'de ×0,83 → ×0,5 uçurum.
8. Köylü 0: bot2'de barınak 15, asker 32 → "yer 0" ve verim %0 (askerler barınağı yiyor; savaşta halk göç eder) — tasarım gereği ama bot2 yalnız yamayla 60 asker verildiği için yanlış alarm olabilir.
9. [SIM-HATA] psql ile `lobbies order by created_at desc limit 1` başka ajanın lobisinin tohumunu verdi (talk betiği yanlış sonuç, RED rejected). `status` çıktısı tek-satır; `news` yalnız yeni haber.

### 6. En önemli 10 bulgu
1. Haraççı konuşması tam spesifikasyona uyuyor (×0,6 / ×1,2 / angry / ret −15 + rakip taç lordlarıyla −8×1,5).
2. AFK haracı ×1,5 yalnızca oyundaki (seen) lorda; çevrimdışı normal: çalışıyor.
3. Taht davacısı sunucu tarafından kendiliğinden doğuyor (bakış ≈−80'de ~50 dk) ve tam akışı (rise→grow→siege→held/lost/crushed) çalışıyor.
4. Taç desteği zinciri (backed → yardım reddi → bastırınca taraf değiştirme teklifi → kabul/sadık kal) tamamen çalışıyor.
5. Lordlar arası haraç ekonomik olarak çok güçlü (1080 altın/sa) — denge riski.
6. Casus operasyonları ağ harcıyor; kidnap fidye/ransom/release döngüsü çalışıyor, başarısızlıklar acı verici.
7. Hanedanın kural seti (kraliçe tek başına, council, kinsman, kardeşin genç ölümü, evlilik üç yolu) çalışıyor.
8. Elçi haberleri %60 haraç/devriye gürültüsü; AFK oyuncuya saatte ~4 haber.
9. Salgın ile hanedan ölümü ve kahırdan ölüm pratikte sınanamıyor/etkisiz.
10. Çevrimdışı lordun hanedan durumu tembel; hükümdar ölümü gibi olaylar komutla tetikleniyor ama haber notice yok.

---

## Ek D: Ortak canlı log (üç ajan)

- [A][t=0dk][NOT] başladı
- [C][t=0dk][NOT] başladı
- [B][t=0dk][NOT] başladı
- [A][t=0dk][KAPSAM] A1.2 ✅ ilk oduncu+ev ücretsiz (altın 150, yapı 120 değişmedi, freeUsed [lumberCamp,house]); A1.3 ✅ 3. build RED queue
- [C][t=13dk][KAPSAM] C1.1 ✅ 2 yapıyla swear RED early; 8 yapıyla kabul (4 lord)
- [C][t=70dk][KAPSAM] C1.2 ✅ yeni lord: kendi taç tip 120 (x1.1 güç = 132, bir seferde gift Teşekkür sepeti 8 altın+8 yemek), rakip rival_gift 80 (x1.1=88). Ayrıca C1.3 kısmen: devriye 30dk slot, eğlence merkezi yokken sv1 newcomer tip
- [A][t=50dk][ILERLEME] Saray 2'ye 50dk'da (biat 32dk'da, 2. sv için altın 200+yapı 100 darboğazı; ilk 30dk'da trade materials seçilince yapı malzemesi tamamen satıldı=oyuncu tuzağı)
- [C][t=96dk][HARAC] sv2 haraççı rakip taçtan: 165 altın (min 150 × huy 1.1; hazine 1062 → %8=85 < min). 3 konuşma yapıldı (visit 16841/16847/16848).
- [C][t=97dk][HARAC] Konuşma: 3 huya-uyan → ×0.6 (156→94 ✅ %40). 2 sert cevap → konuşma 2 cevapta biter, ×1.2 (156→187 ✅); reddedince taç ilişkisi −15 (=−10×1.5 ✅). Ödeyince taçla ilişki +4 ✅ (−15→−11).
- [C][t=97dk][SIM-HATA] PSQL'de `lobbies order by created_at desc limit 1` başka ajanın lobisini verir; seed'i kingdom id'den çek.
- [C][t=97dk][HARAC] Ret: bot1(taç1) taç0 haraççısını reddetti → bot1↔player ve bot1↔bot2 ilişki −20→−32 (−8×1.5 angry, tüm taç0 lordlarıyla ✅)
- [C][t=97dk][KAPSAM] C1.6 ✅(30dk,min150) C1.7 ✅ (öde/reddet/konuş/iki sert)
- [C][t=129dk][KAPSAM] C1.8 ✅ cevapsız haraç: oyundaki player 248 (=165×1.5, afk:true), çevrimdışı bot'lar 165/156 (afk:false)
- [C][t=152dk][TAC] sv4 + tavern(eğlence merkezi) + ilişki 88: patrol_tip 66 (=60×1.1 güç) + 'Hükümdarın lütfu' 35 altın/20 yemek/20 yapı/15 savaş ✅ C1.4, C1.5(85+)
- [C][t=188dk][HARAC] sv4, hazine 515: haraç 128 = %25 tavan ✅ (min 150 aşıldı, maxShare uygulandı). ×1.5 afk 192.
- [C][t=211dk][KAPSAM] C1.5 ✅ rel 64'ten dinlenme düşüşüyle ~53'e inince 'Teşekkür sepeti' (30+ barem) geldi; 60+ barem ayrıca denenecek
- [C][t=213dk][KAPSAM] C2.2 kısmen ✅ ad koyma: ilk OK, ikinci RED (bkz sonuç); eğitim seçildi (+3 reşit olunca)
- [B][t=46dk][MUHAREBE] B2.2 (planBattle doğrudan, 2000 tohum): eşit ordularda 1–6 asker ASLA öldüremez (0 kill, %100 sıfır), 7→%44 sıfır, 10→%5, 12→%1, 14→%0; 5 v 30'da 5'lik taraf 0 öldürür ama 30'luk ort 4,9 öldürür (asimetrik: küçük ordu hiç hasar vermiyor, sadece morale ile kaybediyor). Dosya packages/shared/src/military.ts:942-943
- [B][t=46dk][BUG] train: sezon başı lordun asker havuzu (manpower 6) ve köylü 17 → 'people' RED; 30 asker eğitilemez. Büyük orduları garnizona patch ile koyacağım (yönetmen)
- [C][t=240dk][KAPSAM] C1.13 ✅ royal accept+deliver: +170 altın (sv4 tavanı), taç ilişkisi +4 (73.5→77.5). 570 savaş malzemesi (arms) istendi, depo 575; istek penceresi 1 saat.
- [C][t=240dk][KAPSAM] C1.12 ✅ taç görevi 'order' türü: take→order gönder→claim: +197 altın, rakip taçla ilişki +3 (−15→−12). C1.11 ✅ order: 440 yapı→203 altın (≈0.46/birim = 0.3×1.25×1.2 sworn), 2 kervan yola çıktı
- [C][t=240dk][KAPSAM] C1.9 ✅ ilişki dinlenmesi: 64→54 ~1 saatte (−10/sa ≈ 0.03×15 tur... beklenen ~11)
- [C][t=240dk][UX] Siparişin/kervanın dönüşü için notices'te haber yok (yalnız günlük); royal_request haberi de notices'te görünmedi (news'te hiç 'royal' türü yok) — oyuncu istek penceresini kaçırabilir?
- [C][t=282dk][HANEDAN] player: Cem(41y) ölümü +3dk'ya çekildi; varis Turgut II (bebek) → konsey beklenir. bot3: davacı için kardeş #50 eklendi
- [C][t=288dk][KAPSAM] C2.4 ✅ player: hükümdar öldü (cause age), varis bebek Turgut II tahtta, council=true regentFor=3, kraliçe ana (mother) Ilgın, kraliçe boşaldı
- [C][t=294dk][KAPSAM] C2.6 kraliçe tek başına (bot2, bot1: regnant true, kinsmanAt=+3sa) ✅
- [C][t=283dk][KAPSAM] C2.13 ✅ kin_unhappy (kardeş #50, bakış −22 <−15) geldi, 1 kez
- [A][t=399dk][ILERLEME] Saray 3'e 399dk'da çıktı (sv2 50dk; kraliçe ~100dk'da; 1200 altın+800 yapı+200 savaş malzemesi; tüccar aynı malı satıp sıfırladığı için altın 2000 tavanına çarptı, wastedGold 43). Gelir: 400dk'da tüccar 4333 altın + vergi 1825; taç haracı ödenen 1139 (devriye bahşişi/armağan 194); yağmacı kesintisi 547
- [A][t=399dk][DENGE] Yeni lordda tüccar ticaret malını tamamen satıp bitiriyor (40 birim/30sn): yapı ve savaş malzemesi stoku sıfıra iniyor, oyuncu elle malı değiştirmeli (UX tuzağı: ilk 30dk'da trade=materials seçilince 120 yapı malzemesi 3dk'da gitti, inşaat durdu)
- [C][t=356dk][KAPSAM] C2.14 kısmen ✅ pretender_rise (bot3, backed:true, 17 asker, 60 dk sonra yürüyüş). Tetikleme: kardeş bakış ≈ −80, sunucunun kendi 15dk yoklaması ~2 yoklamada (≈50 dk) çekti
- [B][t=50dk][MUHAREBE] yağmacı #3: 5 asker vs çete 8(5 mızrak+3 okçu): 5 tur, kills A 0/0/0/0/0, D 1/0/1/1/0 → 5'lik ordu 3 kayıp, 0 öldürdü, çekildi (round bug gerçek sunucuda doğrulandı)
- [B][t=55dk][MUHAREBE] yağmacı #4: 10 vs 8: 7 tur kills A 1/1/1/0/0/0/1 D 0 → 10'luk 4 öldürür 0 kayıp kazandı; ganimet 72 savaş/48 altın/32 yapı (8 kişi × 9/6/4 ✔); 1. zafer cave_trail dir=2 (Yenigöl kasabasından) ✔
- [B][t=71dk][MUHAREBE] alan #5 (10v10, A morale 37 yürüyüşten): 4 tur, D kazandı, kayıp 3/1; alan #6 (15v15): 11 tur, kills A 6 D 4(=al 4 dl 6), kazandı attackers. Zar bonusları hep −0.1…−0.36 (iman negatif?) inceleniyor
- [C][t=360dk][KAPSAM] C2.14 ✅ davacı yükselişi (rise 356dk) + C2.15 ✅ karargâha 80 mızrakçıyla saldırı: 3 dk'da bitti, bot3 kayıp 9, asi 14; pretender_crushed. Taçtan yardım (taç destekliyor) → granted:false why:backed (asker ve altın) ✅
- [C][t=361dk][KAPSAM] C2.17 liegeOffer oluştu (from 1 → to 0, 30 dk) — bastırınca ✅; kabul testi aşağıda
- [C][t=362dk][KAPSAM] C2.17 ✅ switchLiege accept: liege 1→0, taç ilişkisi [−15,−34]→[35,−60] (yeni +35, eski −60), diğer lordlara liege_changed
- [B][t=114dk][KAPSAM] B2.1 ✅ meydan muharebesi 5 karo temas (battles #5,#6,#8,#9: 10v10,15v15,30v30,50v50; 12 tur ~6 dk; 50v50 kayıp 14/20 ≈%30-40)
- [B][t=84dk][KAPSAM] B1.5 ✅ hudut dışında emir +30 sn (21:28:25 vs 21:27:55), hudut içinde anında
- [C][t=364dk][KAPSAM] C3.1 ✅ improve (50 altın, +10) + gift 100 altın (+10, 0.1/altın) → ilişki 0→19.7; envoy 60 sn
- [C][t=364dk][KAPSAM] C3.4 insult ✅ player→bot3: −25
- [C][t=368dk][KAPSAM] C3.3 ittifak ✅ ilişki 19.7'de RED relation, 58'de teklif→kabul; C3.2 haraç isteği kabul (3 altın/tur) başlatıldı
- [B][t=140dk][KAPSAM] B2.3 ✅ okçu(30)>mızrak(30): attackerCounter +1.5/defenderCounter −1.5 (battle #11, ölü 13 vs 6); süvari>okçu aynı ±1.5 (#10)
- [A][t=729dk][ILERLEME] 12 saat doğal: sv2 48dk, sv3 389dk, sv4 639dk (sv5 için 5000 altın/3000 yapı/1000 savaş; altın darboğaz). Köylü 49 (ev sv1 kaldığı için barınak 49; politikam tasarruf modunda evleri yükseltmedi). Yapı malzemesi/savaş malzemesi depo sınırında (2700) boşa gidiyor, altın 1.4K.
- [C][t=375dk][KAPSAM] C4.1 ✅ spyHouse sv1: 2 casus 3 dk içinde (60sn/casus, kapasite 2). C4.2: stores+army casusları bot1'e gönderildi; aynı konuya ikinci casus RED/ → bkz events
- [C][t=387dk][UX] casus raporu 'strength 50' gösterirken burn (minStrength 50) RED strength verdi — yuvarlama: gösterilen 50 ≠ gerçek 49.x (küçük)
- [C][t=390dk][KAPSAM] C4.6 ✅ sabotaj burn (50 ağ): bot1 yemek 961→721, yapı 1028→771 (−%25); C4.9 ✅ ağ harcadı: stores 50→6; C4.3 ✅ intel hata aralıkları (altın lo702 hi968 @ ağ 50)
- [C][t=396dk][KAPSAM] C4.4 ✅(operasyon yoluyla): kidnap %45 şansı başarısız: casus yakalandı (ended caught), ilişki −15 (spyCaught), bot1'e operation_foiled + sabotage claim
- [B][t=174dk][KAPSAM] B3.1 ✅ sahipsiz kasaba (Sarayköprü) 15 dk (900s), 24→19 asker (lost 5, garnizon 7); B3.2 ✅ tahta surlu Kavakpazar 1170 sn (=900×1.3), garnizon 12 → lost 10 (=12×0,6×1,35=9,7) ✔
- [C][t=404dk][KAPSAM] C3.6 ✅ gerekçesiz −37'de savaş RED relation; bot3 (insult gerekçesi) −25'te savaş ilan etti OK; bot2→bot1 −72'de gerekçesiz savaş: bot2↔player −10, bot2↔bot3 −10 (infamy) ✅
- [C][t=406dk][KAPSAM] C3.7 kısmen ✅ beyaz barış kabul → savaş bitti; skorsuz 'gold'/'tribute' şartları RED score ✅. Dayatılan barış (100 puan): ⏭️ muharebe gerekir (B alanı)
- [C][t=412dk][KAPSAM] C3.5 ✅ raid: 1.deneme başarısız (−4 asker, relation −30), 2. başarılı: bot1 ticaret noktası harap (damaged:true), 120 yemek yağma, kayıp 1
- [A][t=873dk][CEVRIMDISI] TUR1 2sa offline. player sv4: altın +528 (vergi +689, tüccar +667 [tradeSlack 237], haraç ÖDENEN −828 [4 ziyaret × 181–227, afk=false → olağan], yağmacı −60); yemek +1133, yapı −313 (afet/disaster), savaş +24; köylü 49→49 (barınak sınırı), mutluluk 77→78. Brüt ~1360 altının %61'i haraca gidiyor.
- [A][t=873dk][CEVRIMDISI] TUR1 bot2 sv2 2sa: altın 3450→1598 (wastedGold 1552: hazine sınırı 2000 → tavandaki altın boşa), savaş 1260→0 (tüccar satıyor), haraç −839 (4×~210), köylü 10→16.
- [A][t=873dk][CEVRIMDISI] TUR1 bot1 sv1 (yeni lord) 2sa: haraç YOK (patrol_tip 109 altın + rival_gift 77 altın geliyor: crownGot 731 [2 saatte]), wastedGold 1122 (tavan 1000), tradeHeld 233 (hazine dolu → tüccar bekliyor), köylü 17→22.
- [B][t=203dk][MUHAREBE] yağmacı #13: 19 asker (bonus −0,94: kral askerlik zayıf) vs çete 13 (bonus +1,63): 7 turda saldıran 0 öldürdü, çete turda 1 öldürdü → 7 kayıp, kaybettik. Orta boy ordular ~13'lük yağmacı çetesini yenemiyor (round yuvarlaması + savunan bonusu). Çözüm için bkz. B2.2
- [B][t=200dk][KAPSAM] B4.6 ✅ casus evi ile 2. zaferde mağara bulundu (cave 3 @905,385 = caveSpots ✔), 1. zaferde (casussuz) yalnız yön (Yenigöl kasabasının doğusu dir=2) ✔; B4.4 ✅ band 0 yenildi 45 dk sonra geri 9 kişi (gen+1), ganimet 81 savaş/54 altın/36 yapı = 9×(9/6/4) ✔
- [C][t=407dk][DENGE] lordlar arası haraç 3 altın/tur: 40 dk'da 612 altın ödendi (≈1080 altın/saat; tavan 4 → 1440/sa). Yeni lordun toplam geliri ~700/sa: tek bir haraç anlaşması gelirin >%100'ü. CLAUDE.md '15 tur/oyun saati' ≠ gerçek saatte 360 tur; ödeyen için yıkıcı, alan için çok cömert.
- [C][t=417dk][KAPSAM] C3.8 ✅ itibar: bot2 (−100 ilişki bot1 ile, renege) improve +6 (normal +10), temiz bot3 +10.3. Renege (haracı kesen) −45, diğerleriyle −5, claim ✅ (C3.2 kesme)
- [C][t=418dk][KAPSAM] C2.16 ✅ bot1 (garnizon yok, taç destekli, 61 asi): pretender_siege 417dk → throne_lost 418dk (savaş anında bitti, 0 kayıp), old king Kerem. C3.9 ✅ cevapsız haraç teklifi 10 dk sonra expired
- [B][t=225dk][KAPSAM] B4.8 ✅ mağara kuşatması battle #16 (110 vs 35; db bonus 3.3=1.2+1.5+…): klan yok oldu, yeni 'Geceyele klanı' aynı anda doğdu, record.cavesTaken=1, çeteler 10 dk dağıldı (down 10), clan_destroyed haberi botlara da geldi, ganimet 243 savaş/175 yemek/399 altın/195 yapı; B4.7 ✅ cave_probe (cave 4 @t=209dk reason 3)
- [C][t=426dk][KAPSAM] C2.14/15 ✅ bot2 (taç desteklemiyor): rise → 423dk siege (garnizon 55 vs 40 asi) → 426dk throne_held; liegeOffer YOK (taç desteklemediği için ✅ doğru)
- [A][t=1131dk][CEVRIMDISI] TUR2 4sa offline. player sv4: altın −148 (vergi +902, tüccar +1019 [tradeSlack 462], haraç ÖDENEN −2023 [8 ziyaret, ~250'şer, hazine büyüdükçe haraç %8 artıyor], diğer +60). Net NEGATİF: brüt ~1980, haraç %102'si. stok: yemek ±0 (dolu), yapı −84 (afet), savaş −981 (tüccar sattı). köylü 49, mutluluk 78→80.
- [A][t=1131dk][CEVRIMDISI] TUR2 bot2 sv3 4sa: altın 3335→1747 (haraç −2353, vergi +737, tüccar +319; afet altın −322), yemek −1883 (satış), yapı −826 (afetler −504 + ...), savaş +366, köylü 28→33.
- [A][t=1131dk][CEVRIMDISI] TUR2 bot1 sv1 4sa: haraç YOK; patrol_tip+rival_gift toplam +1471 altın (newcomer kuralı), ama hazine tavanı (1000) yüzünden wastedGold 1875 (tavan dolu → gelen altın boşa), tradeHeld 461.
- [C][t=447dk][KAPSAM] C2.15 ✅ taçtan yardım (taç davacıyı desteklemiyor, rel 54): asker yardımı karargâhtan 12 asi düşürdü (12×(0.5+rel/100)), altın 242 (250×(0.5+0.54)); her biri bir kez (ikinci: aid_asked), her yardımda ilişki ≈ −6 ✅
- [C][t=480dk][KAPSAM] C2.17 ✅ 'sadık kal' yolu ve 2. kez RED (teklif tek kullanımlık) denendi — sonuç events.md
- [B][t=276dk][KAPSAM] B3.3 ✅ barış içindeki lordun kasabasına (Meşebağ, bot2) kuşatma: order_failed why=peace (RED); savaştaki bot1'in kasabasına (Gümüşgöl) yürüyüş kabul. B3.7 ✅ Kavakpazar sadakat<12 → town_lost_revolt t=226 (ayaklanma t=196'da başladı: sadakat 26→19 ~) ; B3.4 ✅ 
- [C][t=477dk][UX] bot2: kral kinsman (wedQueen) ile değişince önceki kralın kızı Ilgın (father=eski kral) yeni kralın 'Çocuklar' listesinde kalıyor; yeni çocuk Dilşad da kız → ekranda "iki kız". Plan kuralı (iki kız olmaz) yeni çiftte korunuyor (plan sons1/daughters1) — yalnız görünüm yanıltıcı.
- [C][t=477dk][KAPSAM] C2.1 ✅ plan: bot1 (oğul+kız), bot3 (iki oğul), bot2 yeni çift (kız → plan sons:1), hiçbirinde 2'den fazla çocuk yok / iki kız çifti yok
- [C][t=477dk][KAPSAM] C2.17 ✅ sadık kal: +20 ilişki (15→35), +250 altın; sonraki switchLiege RED switch_none
- [A][t=1623dk][CEVRIMDISI] TUR3 8sa offline. player sv4: altın −309 (vergi +2072, tüccar +1667 [tradeSlack 740], diğer +170, haraç ÖDENEN −4016 [16 ziyaret], yağmacı −101, afet altın −112 [dolu depo afetleri yapı −830]); yemek −1983 (satış+halk), savaş +2155 (forge). OFFLINE'DA SV4 BİRİKİM ≈ 0/NEGATİF: brüt altın ~3900, haraç %103'ü.
- [A][t=1623dk][CEVRIMDISI] TUR3 bot1 sv2 8sa: altın 2000→1129 (vergi +1025, tüccar +2150 [tradeSlack 709], haraç −3367 [16 ziyaret ~210], afet altın −407). bot2 sv3 8sa: altın 1784→250 (vergi +867, tüccar +2 [yemek 0], haraç −2377, afet yapı −983); mutluluk 50→44 (açlık).
- [A][t=1623dk][DENGE] Haraç: hazinenin %8'i (en az 150, en çok %25) 30 dk'da bir; 8 saatte 16 ziyaret. Offline lordun gelirinin tamamını haraç alıyor (sv2: 3367/3300, sv3: haraç 2377 vs vergi+tüccar 869, sv4: 4016/3900). Geliştirici istediği 'offline birikim artıya' için haraç ya da tüccar yarım yük (tradeSlack) ayarı belirleyici.
- [B][t=281dk][UX] B3: kuşatmaya yürüyen ordu yolda meydan muharebesine girip kazanınca hedefi 'town' iken 'move' olarak sıfırlanıyor (army 20 → town 49 kapısına 6 karo kala idle); kuşatma yeniden emir ister
- [C][t=486dk][KAPSAM] C1.16 ✅ rakip taç lordları: 6 hediye (+120 teorik) → ilişki 40.0'da tavan; improve ek artış yok (bot1/player farklı taç)
- [C][t=486dk][KAPSAM] C3.9 ✅ ek: süresi dolan cevapsız haraç teklifi 'reddedilmiş' sayıldı: ilişki −30 (−9.7→−39.3) tam spec (reject −30)
- [C][t=490dk][KAPSAM] C2.12 ✅ prenses sahipsiz kasabaya (Kervansu): kasaba bot2'ye bağlandı (kılıç çekilmeden), 150 altın çeyiz
- [B][t=369dk][KAPSAM] B3.8 ✅ 4 kasabada (Gümüşgöl 12→ lost t=363, bakım cömert 3 ve borç ödense de) sadakat tavanı çöküyor; 3'e inince Taşbel hâlâ <25 ayaklandı. B3.9 releaseTown çalıştırıldı (aşağı)
- [C][t=495dk][KAPSAM] C2.12 ✅ taca (+25 ilişki, 200 çeyiz) ✅, kasabaya ✅, lorda (relation<0 RED; sonra teklif→kabul: gelin Gelinler'e, ilişki +30) ✅
- [B][t=373dk][KAPSAM] B3.6 ✅ ayaklanma bastırma muharebesi #19 (87 vs 4 asi, 1 tur): sadakat 22.96→29.8 (+10 ✔), quietUntil = +30 dk; B3.9 ✅ releaseTown: kasaba sahipsiz, garnizon 3 (3–6 ✔); B3.10 ✅ townBuy 100 yemek=30 altın, 2. alım RED carry (14 asker×12=168), cargo_home t=297 saraya girince, wasted 0; B3.11 ✅ başkasının kasabasını kuşatınca relation −15 (town_siege relation:-15)
- [A][t=1660dk][KAPSAM] A1.1 ✅ üç lordda yields farklı (food 1.54/1.28/0.99, arms 1.16/1.47/1.98); A1.5 ✅ evleri yükseltince barınak 48=sınır 48'de RED limit; A1.7 ✅ yıkım yarı iade (forge 60g/30y → +30g/+15y); A1.9 ✅ plan (taşı+yol+yıkım tek komut) OK
- [C][t=511dk][KAPSAM] C2.11 ✅ devriye komutanı (Alpay): patrol_tip 91 (normal 66; ×1.38 ≈ 1.2 komutan × güç/huy); hediye +15 op, ikinci hediye RED cooldown ✅ C2.10; vali ataması OK (etkisi ayrıca ölçülmedi)
- [C][t=526dk][KAPSAM] C2.4 ✅ bot3: kral Turgut ölünce reşit oğlu Alpay (19y) geçti, kraliçe → kraliçe ana (mother), küçük oğul Cengiz kardeş olup cause=sickness deathAt planlandı (C2.9 ✅ plan; ölümü patch ile hızlandırılıyor)
- [C][t=526dk][UX/SIM] Hükümdar ölümü patch ile +90sn'ye çekilince çevrimdışı (komutsuz) lordda 4 dk geçse de işlenmedi: tembel durum, advance yalnız komut/okumada (tasarım gereği). Tick yalnız davacı/haraç gibi işleri ilerletiyor.
- [A][t=1700dk][KAPSAM] A1.2 ✅ A1.3 ✅ A1.4 ✅ (tarla 4. build RED limit, sv1) A1.6 ✅ (ev 1→3 yükseltme; yapılırken '*'; 3. seviye sonrası RED top) A1.8 ✅ (plan move: ev #19 (511,335)→(506,342) OK; maliyet/süre ölçülmedi) A1.10 ✅ A1.11 ✅ (wall (509,339) ev yanında RED spot; (505,339) OK; gate (505,340) RED spot — nedeni belirsiz) A1.12 ✅ (76 parça sur halkası sarayı kapısız kapattı: mutluluk 69→51'e iniyor, ~−15 hedef) A1.13 ✅ (halka sonrası işler 25→19) A1.14 ✅ (RED liege sv2 için, RED queen sv3 için) A1.15 ⚠️ (sv2'de 20×20 karo halka kuruldu, aşama değeri doğrudan ölçülmedi)
- [C][t=530dk][KAPSAM] C4.5 ✅ recall mission 2: casus eve döndü (spies +1, spiesAway −1)
- [C][t=535dk][KAPSAM] C3.2 ✅ haraç isteği (kabul −5, 2 altın/tur), isteyen kaldırır: ilişki +5 (release), ödeyen keserse −45/−5 infamy (önceki test)
- [A][t=1738dk][KAPSAM] A2.1 ✅ bot2 sv3 (sunucu durumu sql'de bayat okunur: status ile ölçtüm) gündüz 5dk: savaş 96/yapı 117; gece (00:58–01:03) 5dk: savaş 52/yapı 62 → oran 0,54 (beklenen 0,5). NOT: tur 10sn
- [C][t=539dk][KAPSAM] C1.15 kısmen ✅ (kod+hesap): rivalry 4 pencere 'tension' kaldı (3sa pencere); tension çarpanı haraç ×1.1 uygulandı (165=150×1.1; bot2 289 = %8×3292×1.1). Sezon içinde geçiş henüz görülmedi
- [C][t=560dk][KAPSAM] C4.7 kidnap: iki deneme (%45, %50 şans) da başarısız: casus yakalandı; devam
- [A][t=1790dk][KAPSAM] A2.2 ✅ gece mesaisi: aynı pencerede savaş +56/3dk (≈18,7/dk; gündüz 19,2, gece mesaisiz 10,4) ve mutluluk 76→65 (yorgunluk sql'de bayat, ölçülmedi) A2.4 ✅ (forge sword/shield → cephanelik; flax RED locked) A2.6 ✅ (kılıç tam 280'de durdu = 200 + 2 ambar×40) A2.7 ✅ (offline'da books.tradeHeld 233/461/222, wastedGold tavanda) A2.5 ✅ (books.wastedGoods 628/575/243, wastedGold 1552/1875)
- [C][t=582dk][KAPSAM] C4.8 kısmen ✅ townRevolt (120 altın): Kervansu sadakati 53→17.8 (−35), operation_struck bot2'ye. 'revolt' (%90) ayrıca denenecek
- [B][t=394dk][MUHAREBE] saray kuşatması #21: 87 saldıran (morale 4.8 uzun yürüyüşten) vs bot1 garnizon 30 + 2 kule: db=3.14 (kule +2 tavan + …), towerKills 4/tur (2 kule × 2 ✔), saldıran morale 1 turda 0 → geri çekildi (retreat ✔ B2.10). B1.7 morale: 87 kişilik ordunun morale'i ~170 dk kampanyada 100→4.8 (yürürken −30/sa, açıkta −6/sa)
- [C][t=605dk][KAPSAM] C4.7 ✅ kidnap başarılı (3. deneme, ağ 81/90, şans %60): kraliçe hapishaneye, fidye 720 (=%40 tahmin, min 500), hostages kayıtlı, kurban mutluluk −15; ransom ödenince 720 altın alıcıdan kaçıran'a geçti, kraliçe döndü ✅ (release yolu ayrıca)
- [C][t=605dk][DENGE] kidnap başarı oranı 3 denemede 1/3 (şans %45/%50/%60); her başarısızlık 1 casus + 70 ağ + ilişki −15 + 2 saat savaş gerekçesi; başarıda fidye 720 ≈ operasyon maliyeti 200 + casus + bekleme → kaçıran kârlı, ama kurban ilk saat içinde 'ransom' ile çözebilir.
- [B][t=402dk][KAPSAM] B4.5 ⚠️ doğrulandı: aynı orduya art arda iki FARKLI çete takibi (band 3 sonra band 0), ordu hudut dışındayken ikisi de army_orders'a OK ile yazıldı (aynı effective_at); aynı çete için ikinci emir RED chasing ✔ (hem anında hem bekleyen). B1.4 ✅ en fazla 2 ordu (raise 3. RED armies, split RED armies), merge >5 karo → order_failed far
- [A][t=1900dk][KAPSAM] A2.8 ✅ ambar +400 (2700→3100), hazine binası +4000 (5500→9500) A2.3 ⚠️ biyom yield'leri lordlara göre farklı (1.54/1.28/0.99), kontrollü üretim karşılaştırması yapılmadı A2.9 ⚠️ fare/rutubet/pas ayrı haber/defter kalemi yok: disasterLost.* içine karışıyor (player 8sa yapı −830, doluluk>%85'te); kriz payından ayrılamadı A2.10 ⚠️ yön doğru, ölçüm kirli: aynı bot2'de 4dk pencerelerde net yemek kış-gece −52, yaz +16, sonbahar −1 (tüketim ~79/4dk ⇒ üretim ≈27/95/78; beklenen oranlar 0.37/1.13/1.08; kış penceresi gece olduğu için ×0.5 ile birleşti) A3.1 ✅ A3.2 ✅ (bot1 yemek 0 iken köylü 4=saray hizmetlileri; room 13) A3.3 ✅ bot2 ağır vergide mutluluk 76→35, köylü 33→29 (90dk)
- [A][t=1900dk][KAPSAM] A3.4 ✅ vergi/tur: düşük 0.24, normal 0.61, yüksek 1.10, ağır 1.71 (33 köylü, sv3); ağırda mutluluk 76→36 (30dk)
- [C][t=904dk][KAPSAM] C4.4 ✅ doğal yakalanma: casus 5 deneme boyunca 3 kez yakalandı (75dk, 4s38 sonra...), spy_caught(bot2)+spy_lost(player) haberleri, gerekçe+ilişki düşüşü
- [B][t=434dk][KAPSAM] B2.4 ✅ saray kuşatması #23 (110 asker+10 mancınık vs 25 garnizon + 2 kule; db=3.02): 3 tur, 7/6 4/5 6/5, kayıp 16/17; B2.5 ⚠️ yağma 119 savaş/78 yemek/191 altın/120 yapı (%15 ✔), kalkan 15 dk (850 sn kalan ✔) ✔, ama 'fled' 0: hedefin köylüsü yoktu (patch/açlık), kaçış kuralı sınanamadı; B2.6 ✅ tower_losses {killed:3} haberi geldi (tek haber)
- [C][t=964dk][KAPSAM] C4.8 ✅ revolt (300 altın, ağ 90): bot2.revoltUntil = +600sn, operation_struck haberi. C2.8 ⚠️/⏭️ salgın: sicknessStrikes olasılığı share×0.001/tur, share tur başına ~%3.5 sönüyor → bir salgında kişi başı ≈%0.14 ölüm şansı (pratikte hiç) — DENGE: spec 'salgın hanedandan birini öldürür' etkisiz
- [B][t=450dk][KAPSAM] B2.6 ✅ kule menzilinde duran ordu 20 sn'de 1 asker kaybeder (87→43 kuşatma sonrası kapıda bekleyen ordu 16 dk'da 48 asker; books.lost.towers=52); tek haber birikir ('killed' 3→48) ve 15 dk sonra yenisi ✔. [UX] kuşatmayı KAZANAN ordu kuleler menzilinde kendiliğinden çekilmiyor, oyuncu emir vermezse eriyor
- [A][t=1990dk][KAPSAM] A3.6 ✅ hastalık (bot2 patch %): hastaneli player 5.4→0.7→0.0 (5dk adımlar), hastanesiz bot2 7.6→3.3→1.5 A3.7 ⚠️ vaaz OK, 5dk sonra 2. vaaz da OK (bekleme çok kısa ya da yok?), mutluluk 80→77 (etki yalnız vergi cezasını azaltıyor, ölçülmedi) A3.8 ✅ books.stewarded 1/5/6 (kâhya kriz karşıladı) A3.9 ✅ ambar %80'de duruyor (player yapı 2157→2000/2160, depo 2700) A3.10 ✅ tahmin: sv4 8sa vergi 2072 ≈ 2880 tur×1.0×ort.0.69 (−%10/saat, taban %50) ✔ A3.11 ⚠️ bot1 sv1: haraç yok, rival_gift+patrol_tip var, yağmacı kesintisi books'ta yok (×0.1); olay pencereleri UI gözlenemedi
- [A][t=1990dk][KAPSAM] A4.1 ✅ A4.2 ✅ (37→RED step, 60 OK, 80→RED tradeWait, 2dk sonra OK, 500→RED step) A4.3 ✅ (upgradeTrade botlar+player: level 3 / 140 birim sınırı) A4.4 ✅ player tüccar food satarken yemek ~148 (30 tur yedeği) A4.5 ✅ yapı 3090→sat 24'e, savaş 6'ya iniyor (yedek yok) A4.6 ⚠️ lobi fiyat yapı 0.20 (taban 0.3), yemek 0.173, savaş 0.42; minFactor görülmedi A4.8 ✅ pazar 400 yemek −102 altın (0.255/birim=0.173×1.4×~1.05), 2. 400 −110 (artıyor) A4.9 ✅ taç 1 (200s sefer): 20dk'da savaş 800 birim (160/sefer=2×80) → +272 altın (0.34/birim); A4.10 ✅ han (474,518) OK, (438,282) RED innFar, sonrakiler RED innWait; A4.11 ⏭️ yağma yok; A4.12 ⚠️ dünya nüfusu <200 olduğu için etki yok (lobi 3 lord)
- [C][t=1204dk][KAPSAM] C1.5 ✅ 60+ barem: rel 72'de 'Saray armağanı' 21 altın+14 yemek+14 yapı (18×1.17 güç çarpanı), 30+ 'Teşekkür sepeti', 85+ 'Hükümdarın lütfu' (3 baremin üçü de görüldü). Rel<30'da armağan yok
- [B][t=471dk][KAPSAM] B2.8 ✅ taç şehri 1 (838,546) yakınında (838,572) iki düşman ordusu (player 25, bot1 26) aynı noktada bekliyor: temas olmasına rağmen muharebe yok
- [C][t=1245dk][KAPSAM] C4.7 ✅ release: ikinci kaçırma (%40) başarılı, 'release' ile kraliçe eve döndü, ilişki +10 (queen_released)
- [A][t=2250dk][KAPSAM] A5.1 ✅ lobi (fog, locusts, earthquake) + krallık (plague, bandits) olayları status'ta; A5.2 ⚠️ krizler cevaplandı (earthquake: player/bot2 villagers, bot1 none; bandits bot1 none: stok 1200 iken yapı −111, savaş −107, altın −28 [~%9/%9/%2]); villagers/army/none yan yana kontrollü kıyas yapılamadı (kriz dakikada bir pencerede, eşit stokta aynı anda yalnız tek lorda geldi) A5.3 ⚠️ cevapsız krizler yapı/yemek götürüyor (books.disasterLost) ama tek tek ayrıştırılamadı A5.4 ✅ choose 'a' OK birçok kez (auto politika) 
- [B][t=537dk][KAPSAM] B2.7 ✅ müttefik (bot2 ordusu 22, 31 asker, 1 karo yakın) battle #26'da player tarafına katıldı (attackers 2 ordu: 40+31 vs 18); ilk denememde ordu 14 karo uzaktaydı → katılmadı (6 karo sınırı ✔). İttifak için +50 ilişki: 4 hediye (200 altın=+20 tavan) + 3 improve gerekti ~35 dk
- [B][t=537dk][KAPSAM] B2.10 ✅ yenilen ordu (#25 27: 25→14, morale 0) retreat:true ile eve çekildi; B1.7 ✅ morale: 87'lik ordu uzun yürüyüşte 100→4.8, handa toparlanma henüz sınanmadı
- [B][t=540dk][KAPSAM] B1.6 ✅ king lead (bot1, kraliçe+oğul) → armies.led_by=1; kralın ordusuna emir uzakta bile anında (at=şimdi); 'leave' sarayın önünde değilken RED king_palace ✔; %15 düşme şansı sınanmadı (⏭️ rastgele)
- [C][SON] C bölümü tamamlandı: ~30 oyun saati, ~185 komut; sonuç dosyası sim2-C-sonuc.md. Ana bulgular: lordlar arası haraç 1080 altın/sa DENGE; salgın hanedan ölümü etkisiz; kidnap %40–60; tüm taç/davacı/taraf değiştirme akışı çalışıyor
- [A][t=2650dk][KAPSAM] A5.5 ✅ sv4'te en çok 2 sefer (3. RED rejected); hunt+explore geri çağrıldı → eli boş; pilgrimage→ mutluluk +8 boon; hunt (2 muhafız) → +132 yemek +44 yapı +boon; caravan (80g+100y bedel) → +336 altın; treasure → 0 (boon +4). Muhafız kaybı 0. ⚠️ BUG-ADAYI: aynı sefer içinde aynı olay iki kez çıkıyor (hermit,hermit / fair,fair / map,map) — tekrarlı çekiliş
- [B][t=560dk][KAPSAM] B1.8 ✅ gözdağı: 39 askerlik düşman ordusu bot1 hududunun 6 karo yakınında → fearUntil +120 sn yazıldı, army_threat haberi (t=434 ve t=558), bot1 mutluluk 77→70'e düşüyor (−12 hedefi)
- [A][t=2750dk][KAPSAM] A5.6 ✅ goals: heirs/homes/palace/builder/merchant gümüş (2), people/devout/explorer/treasurer bronz (1) kaydedilmiş A5.7 ✅ irrigation OK; flax RED excluded; forestry/fishing RED locked; metallurgy RED prereq (kilitlenen yol çalışıyor) A5.8 ✅ cathedral+bazaar give: depo %25 yedek (altın 2376=%25×9500, yemek 775, yapı 775) bırakıldı, aşama ödemesi biriktiriliyor (stage 0, paid {arms600, food1485, gold659, mat1966}) A5.9 ✅ şenlik: mutluluk 64→68 (1dk), 74 (20dk); 2. şenlik RED rejected (saatte 1) A5.10 ✅ bağış: ilişki 15→19 (+4); 2. bağış RED rejected; yemek yetmeyince RED cost A5.11 ✅ hemen 'played' → skor 0; play tekrar RED busy; 11dk sonra play+1dk+basışlar skor 17 (ödül 7 yapı + 2 altın; budgetLeft 70→65.9); aynı run tekrar RED none
- [A][t=2780dk][KAPSAM] A5.12 ⚠️ fisherHut yalnız iskele eki karosuna (378,660) kuruldu ('build' yardımcısı spotFor annex'i görmüyor → [SIM-HATA] küçük); cast OK (seed), basışsız fish → miss; cast tekrar → RED (bekleme). Gerçek yakalama simüle edilmedi
- [B][t=585dk][KAPSAM] B4.2 ✅ books.outlaws=79 altın kesinti / toplam 379 tüccar geliri (yağmacı payı road 0.97); B5.1 ⚠️ tersane lv1: galley (crew 4) tayfa havuzdan: 1 galley OK (denizci 4), ikinci ise RED crew (cap=floor((köylü+asker)*pay) − ... 6 kişi), RED queue (kızak 1), corsair RED locked (lv2) ✔; gemi bitince harbour {galley:1}
- [A][t=2630dk][NUFUS] Hükümdar Cem 66 yaşında öldü (~38. saat), oğlu Aydoğdu geçti; eski kraliçe Aybike 'kraliçe ana' oldu → 'kraliçe yok', saray 5 yükseltmesi RED queen → yeni kraliçe (queen komutu OK) alındı. Beklendiği gibi (§9.1) ama oyuncuya hiçbir uyarı yok sadece RED queen (UX: sv5 yükseltmesinden önce)
- [B][t=595dk][KAPSAM] B5.3 ⚠️ sail: karaya RED land ✔; ana nehir tüm suları bağladığı için (göl 224,154 ve 839,540 dahil) 'su yolu yok' RED'i tetiklenemedi (izole su bulunamadı); ardışık 3 sail emri hepsi OK (son kazandı)
- [A][t=2700dk][KAPSAM] A5.13 ✅ sv5'e çıkış (grant), hisar/anıt/lonca konağı kuruldu (her biri 1; ikinci hisar RED unique); etkileri (anıt mutluluk +4, lonca +%4) ölçülmedi
- [B][t=597dk][BUG] B5.2/5.3 dock: 'fleet dock' filoyu denize sail ettikten sonra (400 karo uzakta, görev fish ya da port) hâlâ 'evde' sayılıp ANINDA limana ışınlıyor (navy.ts:226 atHome=HOME_MISSIONS, sail konumu hesaba katılmıyor): seyir süresi atlatılıyor. B5.2 ✅ form/merge OK
- [A][SON] sonuç dosyası yazıldı: /private/tmp/claude-501/-Users-emrecanuzum-Developer-isometric-strategy/85762a45-0623-473c-954c-fe23b7ef3c02/scratchpad/sim2-A-sonuc.md (45 saat, ~1050 komut; A6 tablosu ve defter içinde)
- [B][t=657dk][KAPSAM] B5.2 ✅ en fazla 2 filo (form 3. RED fleets); B5.4 ✅ deniz ticareti 22 sefer/1608 birim/371 altın, 3 korsan saldırısı (lostUnits 208, bounty 35), AMA elçi haberi/notices yok (yalnız advance olayı→istemci günlüğü): sunucuda notice tablosunda 'sea/pirate' türü hiç yok; B5.5/5.6 hunt çalışıyor (books.navy artıyor) ayrıntı sınırlı; B5.7 chase komutu OK, 2. chase RED chasing ✔
- [B][t=671dk][KAPSAM] B4.9 ✅ (clanGarrison/clanHoard analitik + battle #16 35 savunan): garnizon 23→39 (+1/20dk, tavan +16), ganimet altın 250→570 (+40/sa, 8 saat tavan); B5.7 ✅ pirate_battle: Sinsi Kurşun (3 gemi güç 5.4) vs 3 kadırga güç 12: kazandık, 1 kadırga battı, ödül 135 altın(60+25×3 ✔) 60 savaş(20×3 ✔) 90 yapı(30×3 ✔); B5.9 ✅ abluka: fleet 3 → bot1 iskelesi, naval_battle kind=blockade, bot1.state.blockade={by:11,fleet:3}, iki tarafa haber
- [B][t=692dk][KAPSAM] B4.7 ✅ cave_probe: 1. varışta haber (reason 3), 60 dk sonra yeniden varışta 2. haber, 86 dk sonra 3. ; hemen geri dönüş (<5 dk) haber yok (cooldown ✔). Boş/klan ayırt edilemez ✔ (cave 4 boş/dolu aynı payload). Not: haber yalnız VARIŞTA; orada bekleyen ordu 60 dk sonra tekrar haber almıyor
- [B][t=695dk][KAPSAM] B2.9 ⚠️ yalnız betikle: scripts/route-check.ts 40/40 rota bulundu, 21 köprüden, havada kalan 0; sur/kapı geçişi oyunda sınanmadı (⏭️). B4.1 ✅ outlaw-water-check 4 tohumda 0 su üstü nokta, 7 tekne 0 sudan taşma; raid-check: [DENGE] seed 4242'de bazı lordlar saatin %94–100'ünde hiç baskın görmüyor (lord 3,5,9 mean ≤%3) iken lord 7 mean %93; 'off-land raid points 18' (baskın noktası karada değil)
- [B][t=749dk][KAPSAM] B5.8 ✅ korsan limanı ablukası: ilk deneme 3 kadırga (güç 9) vs 5 muhafız çektiri (9) kaybetti (haven_battle won:false, 1 kadırga); 9 gemilik (güç 24.6) filo kazandı, ganimet 205 altın/100 savaş/150 yapı ✔, held yazıldı, nüfus 60→47.6 /20 dk (=36.7/sa ✔). B5.9 ✅ abluka (iki lord filosuna karşı kazanılıp kaybedilebiliyor: 2 galley vs 3 → kaybetti; 8 vs 2 kazandı), raid (loot arms 48 = 2 galley×24 yük), recall → blockade_lifted, sortie/ablukayı yar: bot1 1 galley vs 7: kaybetti, abluka sürdü; B2.10 ✅ cargo_lost {arms:60} yenilince (#27); B5.10 ⚠️ bu tohumda hiçbir korsan teknesi hiçbir lordun iskelesine 45 karo yaklaşmıyor (seaHeld hep 0 üç lord için 3 saat boyunca) → korsan etkisi/halk mutluluğu hiç sınanamadı
- [B][SON][t=1323dk] B1–B5 bitti: ~340 komut, 22 oyun saati, 20 muharebe. ❌ B2.2 yuvarlama doğrulandı (≤6 asker 0 kill), ⚠️ dock ışınlaması (navy.ts:226), çift çete takibi, kuşatma hedefi silinmesi, deniz haberleri yok; kasaba/mağara/abluka zincirleri ✅. Sonuç: sim2-B-sonuc.md

---

## Ek E: Ham kayıtlar

`docs/sim-test-2/` klasöründe:
- `A-events.md`, `B-events.md`, `C-events.md`: her komut ve sonucu, her lordun her elçi haberi, her muharebe ve her yönetmen müdahalesi (sanal dakikayla)
- `A-snapshots.csv`, `B-snapshots.csv`, `C-snapshots.csv`: her lordun sayıları, oyun saatinde bir
- `canli-log.md`: üç ajanın ortak canlı log'u
