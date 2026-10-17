# Oyun Test Raporu — Bütün Oyun (2026-10-16)

> **Kapsam:** oyundaki bütün işlevler (yalnızca bu oturumda eklenenler değil). Arayüz ve kullanım (UI/UX), oyun öğeleri ve oyundan keyif alma açısından.
> **Yöntem:** dört test ajanı aynı anda, her biri kendi alanında. Yerel Supabase (bütün migration'lar), yerel Edge Functions (`supabase functions serve`) ve yerel arka uca bağlı Vite istemcisi (5180). Her ajan kendi test hesaplarını ve lobisini kullandı (`T1`–`T4`). Tarayıcı olarak her ajan kendi Playwright Chromium'unu sürdü; ekran görüntülerine bakıldı. Geç oyun durumları yerel veritabanında ileri sarılarak kuruldu (yalnızca yerel test verisi; canlı veritabanına dokunulmadı).
> **İlke:** basit ya da acil sorunlar test sırasında doğrudan düzeltildi; büyük ya da tasarım kararı isteyenler açık bırakıldı.
> **Ayrıntılı raporlar:**
> - [T1 — Kuruluş ve çekirdek ekonomi](test/T1-kurulus-ekonomi.md)
> - [T2 — Savaş, kasabalar, donanma, diplomasi](test/T2-savas-diplomasi.md)
> - [T3 — Taçlar, yaşayan dünya, mini oyunlar, hanedan](test/T3-taclar-olaylar-oyunlar.md)
> - [T4 — Harita, görseller, kontroller, telefon, performans](test/T4-harita-gorsel-mobil.md)

---

## 0. Özet

| Alan | Düzeltilen | Açık kalan |
| --- | --- | --- |
| T1 Kuruluş ve ekonomi | 22 | 9 |
| T2 Savaş ve diplomasi | 16 (2'si ciddi) | 9 + 4 denge sorusu |
| T3 Taçlar, olaylar, oyunlar | 21 | 10 |
| T4 Harita, görsel, telefon | 9 | 9 |
| **Toplam** | **68** | **~37** |

- Bütün düzeltmelerden sonra `bun run typecheck` ve `bun run build` temiz; sunucu dosyaları ayrıştırılıyor; `fn:bundle` yeniden üretildi.
- Hiçbir şey commit edilmedi, canlıya alınmadı. Canlıya alırken **`db:push`** (bu oturumun yeni migration'ı: `20261016170000_tribute_talk`) ve **`fn:deploy`** gerekir.
- **Ortam uyarısı:** dört ajan aynı anda çalıştığı için makinenin yükü test boyunca çok yüksekti (yük ortalaması 70–220). Yerel veritabanı bağlantı havuzu zaman zaman tükendi, sunucu fonksiyonları 503/504/546 döndü. Bazı ölçümler (FPS, yol sürükleme) bu yüzden sınırlı.

---

## 1. Uçtan uca çalışanlar (✅)

- **Kuruluş:** kayıt/giriş, lobi açma ve katılma, 3 yer kartı, saray yerleştirme, ilk mal seçimi, öğretici.
- **Ekonomi:** bütün ekonomi binaları ve menüleri, işçi/ürün/seviye, nüfus büyümesi, vergi/mutluluk/gece mesaisi, depo ve hazine sınırları, tüccar, pazar, lobi fiyatları, serbest şehir ticareti, üst çubuk kartları, süren işler ve tıklayınca açılan yerler.
- **Savaş:** hakaret → savaş gerekçesi → savaş ilanı → meydan savaşı → saray kuşatması (kuleler, mancınık, kalkan, kaçan halk) → altınla barış; tekrar savaş → abluka, kıyı akını, ablukayı yarma → beyaz barış → haraç. Eğitim, garnizon, elçiyle bölme/birleştirme, takip, kral komutası, savaş izleme.
- **Kasabalar:** kuşatma ve ele geçirme, kasaba pazarından ordu ile alışveriş ve yükü eve getirme, sadakat ve bakım, serbest bırakma.
- **Casusluk ve diplomasi:** casus ağları, raporlar, kraliçe kaçırma ve fidye, ticaret yolu yağması, deniz ticareti, korsan avı.
- **Taçlar:** tanıtım ve biat, taçla ilişki, devriye bahşişi ve armağanlar, haraç (öde / reddet / konuş), kraliyet istekleri, taç görevleri ve siparişleri, taçların gücü ve pazarı.
- **Tek kişilik oyun:** krizler ve kâhya, seferler ve raporları, sezon hedefleri ve unvanlar, mini oyunların saatlik ödül tavanı ve sıralamaları.
- **Hanedan:** doğum, ad koyma, eğitim, reşit olma, tahta geçiş; takvim kartı; 5. seviye yapılar; araştırma, hastane, tapınak, vaaz.
- **Harita ve görsel:** arazi, biyom geçişleri, nehirler ve köprüler, köprüden güverte üstünde geçen ordu, taç başkenti (liman, kadırga, dış şehir, ordu karargâhı), bütün lord binaları ve hareketleri, gün boyu gölgeler, gece ışıkları; bütün yakınlaştırmalar, kamera sınırları, yükleme perdesi; yerleştirme önizlemesi, yıkım ve taşıma silüetleri; minimap köşe düğmeleri ve M/H/Tab/P kısayolları, fotoğraf modu, dünya haritası; sağ tık (tarayıcı menüsü açılmıyor).
- **Telefon ve orta ekran (390 / 768 / 1024 px):** yatay taşma yok, ekran dışında kalan düğme yok, 8 sekmenin hepsi telefonda açıldı.
- **Bellek:** 3 dakika gezinmede sürekli artış yok (yığın ⅛×'te en çok 584 MB, çöp toplamadan sonra 230–270 MB).

---

## 2. Düzeltilenlerin öne çıkanları

### Ciddi / acil
1. **Yoğun sunucu oyuncuları girişe atıyordu** (T1 + T4). Kimlik sunucusu yanıt vermeyince `command` 401 dönüyor, istemci de oturumu kapatıyordu. Sunucu artık yalnızca kimliği gerçekten reddedilen isteğe 401, ulaşılamayan kimlik sunucusuna 503 veriyor; istemci 401'de önce oturumu yeniliyor. (`command/index.ts`, `lib/supabase.ts`, `net/settings.ts`)
2. **Asileri bastırma hiç başlamıyordu** (T2). `startQuell` sorgusu JSON `null`'ı SQL `NULL` sanıyordu. (`_shared/towns.ts`)
3. **Saray kapısının önüne bina kurulunca ordu takılıyordu** ("Oraya yol yok") (T2). Ordu önce en yakın boş kareye çıkıyor. (`_shared/armies.ts`)
4. **Adil başlangıç** (T1). Başlangıç yerlerinin ~%2'sinde ne ticaret ne iskele arsası vardı; `rollSite` artık iki arsası olan yeri arıyor.
5. **Naipler konseyi sonsuza dek sürüyordu** (T3). Oğulsuz ölen hükümdardan sonra 3 yıl içinde bir akraba tahta çıkıyor. (`dynasty.json` → `council.kinsmanYears`)
6. **Haraçta yanlış %50 fazlalık** (T3), iki durumda: lorda hiç sorulmadan süresi geçen istekler ve süre dolduktan sonra giren lord. İkisi de artık fazlalıksız alınıyor.
7. **Biattan önceki devriye ziyaretleri sayılıyordu** (T3). Yeni biat eden lord iki armağan alıyordu (`Kingdom.liegeAt`).
8. **Sıfırlamada eski haraç** (T1). Eski lorda bekleyen haraç yeni lordun hazinesinden alınacaktı; kapatıldı.
9. **Barış şartlarında haraç isteği reddediliyordu** (T2). Arayüz 5 öneriyor, sınır 4'tü.

### Arayüz ve kullanım
- Elçi, yer seçimi, kraliyet isteği, sıfırlama ve mini oyunların üstüne çıkmıyor; yerleştirme sırasında kenara çekiliyor.
- Doğum, olay ve elçi pencereleri artık mini oyun oynanırken açılmıyor.
- Bekleyen haraç, kriz ve seçimler eski elçi haberlerinin arkasında beklemiyor. Bitmiş olaylar kuyruktan düşüyor.
- Araştırma tek tıkla başlayıp öbür yolu kalıcı kapatıyordu; artık "Emin misin? X kapanır" diye soruyor.
- Ordu takip, hedef ve seyir çubukları alttaki menünün üstüne biniyordu; artık menünün üstünde duruyorlar.
- Kışlaya "En çok (N)" düğmesi eklendi. Savaş sonuçları "kazandın / yenildin" diye yazıyor. Savaştayken Anlaşmalar bölümü savaş puanını gösteriyor.
- Teslim edilen kraliyet isteği sayaçta kalmıyor. Eğlence merkezinin 7 oyun sekmesi taşmıyor.
- Okunmayan taç renkli yazılar (yeşil şerit, koyu panel) düzeltildi. Dünya haritası Esc ile kapanıyor.

### Metin
- Ondalık virgüller, Türkçe ekler ("%12'sini"), eksi işaretleri ("−"), "i̇lkbahar"daki bozuk İ.
- Taç başkentine satış, taçla ilişkiyi değiştirenler, taç tanıtımı, haraççıbaşıyla konuşma sonrası tutar: yanlış ya da eski bilgiler düzeltildi, değerler ayar dosyalarından okunuyor.
- Günlükte dakikada bir tekrar eden "Tüccar eli boş döndü" kalktı. Aç geçen elçi raporları Önemli sekmesini doldurmuyor.

---

## 3. Açık kalanlar (öncelik sırasıyla)

### Yüksek
- **H1. Sunucu fonksiyonlarının işlemci sınırı** (T2, T4, T3). `settle` ve `tick` sık sık `546 WORKER_LIMIT` ya da 503 dönüyor; tek bir `settle` 1–10 sn sürüyor. Testte dört ajan aynı anda çalışıyordu, ama canlıda da aynı 2 sn sınır var. `tickLobby` profillenmeli: ağır adımlar (patrol/tribute döngüleri, ordu hareketi, kasabalar, donanma) ayrılmalı ya da sınırlanmalı.
- **H2. Yarım yazılan sonuçlar** (T2). Sunucu adımları tek bir işlem değil. Bir tur yarıda kesilince sonuç yarım kalıyor: bir kıyı akınında saldıranın kayıpları yazıldı, savunanın kayıpları, ganimet ve haber yazılmadı (`_shared/navy.ts` → `strike`). H1 ile birlikte ele alınmalı (iş başına kilit/işaret ya da tek RPC).
- **H3. Dünyasız lobi** (T3, T4). Lobi açılırken fonksiyon sınıra takılırsa lobi satırı yazılıyor, dünyası yazılmıyor. Öneri: dünyayı önce üretip lobiyle tek adımda yazmak ya da dünyası olmayan lobileri listede gizlemek.

### Orta (tasarım kararı gerekiyor)
- **M1. Pencere yağmuru** (T1, T3, T4). İlk 30 dakikada ~12 pencere ve uzun öğretici geliyor; dönen oyuncu 8–10 elçi haberini tek tek kapatıyor; sıradan haberler (bahşiş, haraççı) savaş haberlerini gömüyor. Öneri: önemsiz haberler kart ya da günlükte dursun, pencere tek tek açılsın ve "N haber daha" sayacı olsun, yerleştirme sırasında pencere açılmasın.
- **M2. Yapı malzemesi tuzağı** (T1). Tüccara yapı malzemesi sattıran yeni lord 2 saat boyunca 7 yapıda takılıyor; savaş malzemesi sattıran lord 13 yapıya ulaşıyor. Şimdilik uyarı eklendi. Çözüm: yapı malzemesine de bir rezerv ya da tüccarın varsayılan malını değiştirmek.
- **M3. Açlık** (T1, T3). 4 saray hizmetlisi tarlasız ~50 dakikada yemeği bitiriyor. Geç oyunda dört tarlalı lord, kış (×0,74) ve salgınla birlikte 53'ten 38 kişiye düştü. Kış çarpanı ile tarla sayısı ve yemek tüketimi birlikte gözden geçirilmeli.
- **M4. Ekonomi dengesi** (T2). Deniz ticareti 4 gemiyle saatte ~1.200 altın tahmin ediyor; bu gelişmiş bir lordun gelirinin yarısına yakın. Gözcü kuleleri çok güçlü (4 kule turda 8–9 asker). Meydan savaşını kazanan ordu kuşatma hedefini unutuyor.
- **M5. Kraliyet istekleri üretime bakmıyor** (T3). Yemeği sıfır olan lorda yemek, tek silah atölyesi olana 720 savaş malzemesi istendi.
- **M6. Haraççıbaşıyla konuşma çok kolay** (T3). Doğru cevap belli; 30 dakikada bir %40 indirim kısa sürede angaryaya dönüyor. Cevaplar daha az belli olmalı ya da indirim küçülmeli.
- **M7. Mini oyunlarda bot** (T3). Bir betik woodsplit'i kusursuz oynayabiliyor (96/100). Ödül tavanı altını sınırlıyor ama sıralamayı değil.

### Düşük
- Telefonda takip çubuğu minimap'in yarısını ve "−" düğmesini örtüyor (T4). Masaüstünde görev ve sayaç kutuları haritanın sol altını örtüyor (T3).
- Uzaklaştırınca fareyle üstüne gelme etiketleri lord ve başkent adlarının üstüne biniyor (T4).
- Görev kartı düğmeleri iki satıra kırılabiliyor (T4). Pencerelerde sürükleyince başlık metni seçiliyor (T1).
- Taç rengi hâlâ koyu panelde yazı rengi olarak kullanılıyor: `cities.tsx`, `CrownIntro.tsx`, `navy.tsx` (`info.ink` hazır) (T4).
- Şafakta ve akşamda bina gölgeleri çok silik (T4).
- Yer seçme penceresi seçilen yerin kendisini örtüyor; taşıma modunda geçersiz tıklamada neden yazmıyor; karo bilgisi bina varken "inşa edilebilir" diyor (T1).
- Tek başına olunan lobide elçi "komşu lord" ipucu veriyor; altın tam 1.000'de "1K" (T1).
- Ad koyma penceresinde ad boşken "Koy" bir şey yapmıyor; eğitimden sonra asker havuzu "0 / 0" gösteriyor; tersanesi olmayan iskelede "2 / 0 gemi"; savaş izlemede tur listesinin başlığı yok (T2).
- Kraliçe, 3. seviye ve üstü saraylı her lord için tahta geçişten sonra da bedava; kraliçe ana hanedandan tamamen kayboluyor (T3).
- Saray → Yapılar satırları tıklanmıyor; kriz cevabı ne olduğunu söylemeden pencereyi kapatıyor (T3).
- Bir kez görülen `pageerror: Object`, tekrarlanmadı (T4).
- **Yerel ortam:** `tick` yerelde hiç çalışmıyor (`tick_config` URL'si ve `TICK_SECRET` boş); devriye ve haraç yalnızca `settle` ile işleniyor (T3).

### Test edilemeyenler
- Yol sürükleyerek döşeme (yük yüzünden tıklamalar kayboldu), iki yollu seçim penceresi (güneş tutulması) ekranda görülmedi, gözdağı, savaş puanı 100'de dayatılan barış, kasabada isyan kışkırtma.

---

## 4. Değişen dosyalar (test düzeltmeleri)

Sunucu: `supabase/functions/command/index.ts`, `_shared/towns.ts`, `_shared/armies.ts`, `_shared/patrols.ts`, `_shared/game.js` (paket).
Ortak kod: `packages/shared/src/dynasty.ts`, `patrols.ts`, `crowns.ts`, `economy.ts` (biat zamanı, akraba, haraç fazlalığı), `config/balance/dynasty.json`, `cities.json`.
İstemci: `App.tsx`, `lib/supabase.ts`, `net/settings.ts`, `game/createWorld.ts`, `game/cities.ts`, `index.css`, `ui/advisor/*`, `ui/hud/*` (journal, tabs, cities, PlanBar, ConfirmBuild, BuildingSheet, primitives, war, towns, diplomacy, navy, Timers, TopBar, RoyalRequests, WorldMap, MiniGames, `minigames/playing.ts` yeni), `ui/Envoy.tsx`, `ui/panels.tsx`, `ui/AwayReport.tsx`, `ui/CrownIntro.tsx`, `ui/FortuneDialog.tsx`.
Belge: `CLAUDE.md` (§4.3, §7.8, §9.1, §9.7, §11).
