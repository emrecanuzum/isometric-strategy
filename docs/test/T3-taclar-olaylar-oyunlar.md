# T3 — Taçlar, yaşayan dünya ve tek başına oyun: test raporu

> **Tarih:** 2026-10-16 · **Test eden:** Claude (QA3) · **Ortam:** yerel Supabase + yerel Edge Functions + Vite (5180)
> **Lobi:** `T3 Taçlar` (tohum 777333). İki lord: **T3a** "Tekinoba Malikânesi" (Sedefhisar'a bağlı, DB'de 4. sonra 5. seviye saraya ve 29 yapıya büyütüldü) ve **T3b** "İncidağ Beyliği" (Yıldızlıhan'a bağlı, 1. seviye saray).
> **Yöntem:** Kendi Playwright'ım (headless chromium) bir HTTP sunucusu üstünden sürüldü; ekran görüntülerine bakıldı. Sunucu tarafı `command` fonksiyonu test hesaplarıyla doğrudan çağrıldı (biat, `settle`, mini oyun botu, sefer). Saatleri öne çekmek için yerel DB'de durum düzenlendi (yaş, ölüm anı, sefer dönüşü, akraba anı).

## Ortam notları (test dışı)

- **Lobi açma yerelde 546 dönüyor** (`WORKER_LIMIT`): dünya üretimi + `toHex` yerel Edge worker'ın kaynak sınırını aşıyor. Lobi satırı yazılıyor ama dünyası (`lobby_worlds`) yazılmıyor. Yetim lobi satırları kalıyor (ben iki tanesini sildim; `T4 Harita` da dünyasız görünüyordu). Kendi lobimi `generateWorld` ile yerelde bir betikle açtım. Canlıda sorun olup olmadığı bilinmiyor. Öneri: `toHex` yerine `Buffer`/base64 kullanmak; dünya yazılamazsa lobiyi silmek, worker öldürülürse de silinsin diye kaydı tek işlemde yazmak.
- **Yerelde `tick` çalışmıyor:** `private.tick_config.url` boş, `TICK_SECRET` yok. Devriye ve haraçlar yalnız istemci `settle` ile dürtünce işleniyor. Bu yüzden haraç satırları bazen geç yazıldı. Canlıda tick dakikada bir çalıştığı için sorun yok, ama aşağıdaki "geç yazılan haraç" hatasını bu ortaya çıkardı.
- Makine çok yüklüydü (load 240'a kadar). Headless tarayıcılarım birkaç kez dışarıdan öldürüldü. Bu yüzden bazı ekranlar hiç açılamadı ya da kısmen açıldı.

## Özellik özeti

| Özellik | Sonuç | Not |
| --- | --- | --- |
| Kuruluş, yer kartları, saray yerleştirme, ilk mal seçimi | ✅ | 6 yerin hepsinde iskele ve ticaret arsası "hudut dışı" çıktı (T4'ün alanı) |
| Taç tanıtımı (5 sayfa), biat, onay | ✅ | Metin düzeltmesi yapıldı (aşağıda) |
| Bağlılık düğmesi → başkent, taç paneli | ✅ | Kamera başkente gidiyor, panel açılıyor, şehir çizimi çok güzel |
| Taçla ilişki (dinlenme, biat +20, artıranlar) | ✅ | Paneldeki "artıranlar" listesi eksik ve yanlıştı, düzeltildi |
| Devriye: görünür kol, eğlence merkezinde bahşiş, "Taç devriyesi uğradı" | ✅ | Bahşiş 140 (güçle ×1,17). Kol tacın renginde, eğlence merkezinin önünde duruyor |
| Taç armağanı (30+) | ✅ | "Teşekkür sepeti"; **biattan önceki ziyaretler için de armağan veriliyordu** → düzeltildi |
| Haraççı: diyalog, Öde / Reddet / Konuş | ✅ | Reddet: lordla −8, tacın ilişkisi −10 ✓. Konuşma: 2 iyi + 1 sert = ×0,85 (338 → 287) ✓ |
| Cevapsız haraç: çevrimdışı olağan, oyundaysa %50 fazla | ⚠️→✅ | Geç yazılan ya da geç işlenen haraçta yanlış AFK cezası vardı → düzeltildi |
| Kraliyet isteği: üstlen, teslim, Görevler kutusu | ✅ | Teslimden sonra "Süren işler"de sayaç kalıyordu → düzeltildi |
| Taç görevleri: al, ilerleme, ödül | ✅ | Ticari üstünlük 250/250, ödül 216 altın, ilişki +5 |
| Taç siparişleri: kervanla gönder, sayaç | ✅ | 400 yapı → 208 altın, 157 sn |
| Taçların gücü, pazarı, politikalar | ✅ | %78 – %22, "satış fiyatın +%8" |
| Serbest şehir paneli, tüccarı şehre gönder | ✅ | Metinler düzeltildi (aşağıda) |
| Günün olayları (lobi / krallık) | ✅ | Pencere, çizimler, "Topraklarına özel / Lobi geneli" doğru |
| Kriz (3 seçenek), kâhya | ✅ | Kâhya, süresi dolan soğuk dalgasında köylüleri seferber etti ✓. Krizin sırası ve şeridi düzeltildi |
| İki yollu olay | ⚠️ | Tutulma penceresine tarayıcı ölünce bakılamadı; mantığı koddan okundu |
| Seferler (çıkış, dönüş raporu, Sen yokken) | ✅ | Avcılar: +89 yemek, +30 yapı, mutluluk +3. Rapor çizimi güzel |
| Hedefler ve unvan | ✅ | 11/39 ★ "Ünlü Lord" |
| "Sen yokken" raporu | ✅ | Metin ve olay sırası düzeltildi |
| Mini oyunlar: balık, odun yarma, ağ çekme (bot) | ✅ | Ödül hakkı: 19 + 14 → 37 kaldı ✓. Sıralama (sezon / tüm zamanlar) ✓ |
| Eğlence merkezi menüsü | ✅ | 7 oyun sekmesi taşıyordu → düzeltildi |
| Hanedan: doğum, ad koyma (bir kez), eğitim, reşit olma (+3), ölüm, tahta geçiş | ✅ | Kaan reşit oldu (askerlik 7 → 10), sonra tahta çıktı |
| Naipler konseyi (oğulsuz ölüm) | ❌→✅ | **Konsey sonsuza dek kalıyordu** → akraba kuralı eklendi |
| Kraliçe, "Kraliçeye ihtiyacımız var" | ✅ | Tahta geçişten sonra uyarı çıkıyor, bedelsiz kraliçe veriliyor (aşağıda not) |
| Takvim ve saat kartı | ✅ | "5 Şubat 1187, Kış ×0,74, Sezon 6 / 336 yıl" |
| 5. seviye yapılar (hisar, anıt, lonca konağı) | ✅ | Menü değerleri config ile tutarlı, çizimler iyi |
| Üniversite (araştırma ağacı) | ⚠️→✅ | Geri dönüşü olmayan seçim tek tıkla oluyordu → onay eklendi |
| Hastane, tapınak, vaaz | ✅ | Vaaz: vergi etkisi ×0,50, 5 dk bekleme |
| Telefon (390 px): elçi penceresi, haraç | ✅ | Taşma yok |

## Düzeltilen hatalar

| # | Sorun | Önem | Düzeltme (dosya) |
| --- | --- | --- | --- |
| D1 | **Biattan önceki devriye ziyaretleri sayılıyordu:** yeni biat eden lord, biattan 20 dk önceki iki devriye dilimi için armağan aldı (2 × 60 altın + 30 yemek) ve ilişki kazandı. Biattan önceki haraç dilimi de istenebiliyordu | Orta | `Kingdom.liegeAt` (biat anı) eklendi (`economy.ts` → `swearFealty`). Sunucu bu andan önceki devriye ve haraç ziyaretlerini atlıyor (`_shared/patrols.ts`) |
| D2 | **Lorda hiç sorulmamış haraçtan %50 AFK fazlası alınıyordu:** sunucu isteği cevap süresi dolduktan sonra ilk kez görünce (`late`) haracı "sormadan" alıyordu, ama lord yakın zamanda görüldüyse fazlalığı da kesiyordu | Orta | Geç yazılan haraçta fazlalık yok (`takeTribute(..., asked=false)`) |
| D3 | **Geç işlenen haraçta yanlış AFK cezası:** `lastSeenAt` en son görülme anı olduğu için, süre dolduktan sonra oyuna giren lord da "oyundaydın ama cevap vermedin" diye %50 fazla ödüyordu. Testte süre dolduktan 1 saat sonra girdiğimde 41 altın kesildi | Orta | `unansweredTribute`: lord süre dolduktan `lateSeenSeconds` (90 sn, `cities.json`) sonra görüldüyse fazlalık yok |
| D4 | **Naipler konseyi sonsuza dek:** oğlu olmadan ölen hükümdarın yerine kimse geçmiyordu. Kral olmadığı için kraliçe ve çocuk da gelemiyordu. 336 yıllık sezonda bu sık olur ve lordluk sezon boyu 4/3/4 yetenekte kalırdı | Yüksek | 3 yıl sonra (`dynasty.json` → `council.kinsmanYears`) hanedandan bir akraba (26–38 yaşında, yeni yetenekler) tahta çıkıyor (`dynasty.ts` → `kinsmanAt`). Ölüm haberi bunu söylüyor. CLAUDE.md §9.1 güncellendi. Sunucuda denendi: "Yiğit" tahta çıktı |
| D5 | Mini oyun oynanırken doğum penceresi (ve olay ya da elçi pencereleri) oyunun üstüne açılıyordu. Boşluk tuşu ad kutusuna gidiyordu | Orta | `minigames/playing.ts` (açık oyun bayrağı). App bütün pencereleri ve elçiyi oyun bitene kadar bekletiyor |
| D6 | Zamanı geçen bir haraç ya da kriz, eski elçi haberlerinin (4–8 tane) arkasında kuyrukta bekliyordu. Kriz süresi (2 dk) bu sırada dolabiliyordu | Orta | Cevap bekleyen haraç en öne alınıyor. Cevap bekleyen kriz ya da seçim, elçi haberlerinden önce gösteriliyor (`App.tsx` → `decisionFirst`) |
| D7 | Olay penceresi "Sen yokken" raporunun üstüne açılıyordu (olay raporda zaten yazıyor) | Düşük | Düz haber rapor kapanana kadar bekliyor; süresi işleyen kriz ve seçim yine gösteriliyor |
| D8 | Teslim edilen kraliyet isteği (ya da erken biten herhangi bir iş) "Süren işler"de bitiş anına kadar sayılmaya devam ediyordu | Düşük | `Timers.tsx`: bitişinden 15 sn'den fazla önce listeden çıkan iş tutulmuyor |
| D9 | Araştırma ağacında, öbür yolu **sonsuza dek kapatan** seçim tek tıkla, onay sorulmadan başlıyordu | Orta | İlk tık "Emin misin? X kapanır" diye soruyor (`institutions.tsx`) |
| D10 | Önlenen kriz Halk sekmesinin şeridinde hâlâ zararını yazıyordu ("savaş malzemesi %40 az") | Düşük | Şeritte "Zarar önlendi; olayın kötü etkisi işlemiyor" yazıyor, şerit yeşil |
| D11 | Eğlence merkezindeki 7 oyun sekmesi tek satıra sığmıyordu, "Okçuluk" kesiliyordu | Düşük | 6 ve daha çok sekmede iki satır, satırda dört (`Subtabs.tsx`, `index.css` → `.palace-tabs.wide`) |
| D12 | Puanı 0 olan oyunun sonuç penceresinde "Madalyasız" yazıyor ama gümüş madalya gibi görünen bir madalya sallanıyordu | Düşük | Madalya soluk, gri ve hareketsiz (`minigames.css`) |
| D13 | Taç paneli: "Tüccarın buraya seferde 2 kat yük **getirir**; satış lobinin fiyatlarını **etkilemez**". İkisi de yanlıştı: tüccar yük götürür, satış da lobi fiyatını %80 oranında düşürür (`marketImpact`) | Düşük | Metin düzeltildi, oran config'ten okunuyor |
| D14 | Taç paneli, "Seninle ilişkisi": kendi tacın için de "istediği haracı ödemek / reddetmek" yazıyordu. Siparişler, görevler ve kraliyet istekleri listede yoktu | Düşük | Kendi tacında devriye ve istekler, rakipte haraç yazıyor. Sipariş ve görev ikisinde de, değerler config'ten |
| D15 | Bekleme süresindeki düğmede yalnızca "117 sn sonra" yazıyordu; "Tüccarın şu an bu şehre gidip geliyor" cümlesinde ek hatası vardı | Düşük | "Göndermek için N sn bekle", "Tüccar şu an…" |
| D16 | Diplomasi → Krallık: kendi tacın kartında ilişki sayısı yoktu | Düşük | "biat ettiğin taç · ilişki +32" |
| D17 | Eksi işareti ASCII tire ile yazılıyordu: "ilişki -2", "-50'nin altında" (tanıtımda, taçların pazarında, kraliyet isteğinde) | Düşük | Gerçek eksi işareti (−) |
| D18 | Taç tanıtımı "Rakip tacın **devriyeleri** kapına gelip haraç ister" diyordu; haraç isteyen haraççılardır. Ne zaman geldikleri ve ne istedikleri de yazmıyordu | Düşük | "haraççıları her 30 dakikada bir kapına gelip hazinenin %5'ini ister" (config'ten) |
| D19 | Haraççıyla konuştuktan sonra "cevapsız kalırsa %50 fazlasıyla X" tutarı eski (konuşmadan önceki) miktardı | Düşük | Konuşmanın sonucunda yeni miktarın cevapsız hâli de yazıyor |
| D20 | "Sen yokken" 50 dakikalık yokluk için "Kısa bir süre yoktun" diyordu | Düşük | "54 dakika yoktun; kâhyanın defterinden:" |
| D21 | Depo kartı ve sekmesi, yemek zaten 0 iken "~0 tur sonra tükenir" diyordu | Düşük | "Tükendi: ambar boş" |

Her düzeltmeden sonra `bun run typecheck` temiz geçti. Ortak kod değiştikçe `bun run fn:bundle` çalıştırıldı. CLAUDE.md'ye §7.8 (haraçta AFK istisnaları, `liegeAt`) ve §9.1 (akraba) eklendi.

## Açık kalanlar (düzeltilmedi)

| # | Sorun | Önem | Neden / öneri |
| --- | --- | --- | --- |
| A1 | Yerelde lobi açma 546 (yukarıda) | Orta (yerel) | Ortam. `toHex` ağır; dünyasız yetim lobi satırı kalıyor |
| A2 | Kraliçe 3. seviye ve üstündeki **her** sarayda bedelsiz: `queenOwed` eski saraylar için konmuş, ama tahta geçişten ya da kraliçenin ölümünden sonra da 300 altınlık bedeli kaldırıyor | Düşük | Tasarım kararı. Öneri: bedelsizlik yalnız 1. kuşakta ve hiç kraliçesi olmamış hanedanda olsun |
| A3 | Kraliçe ana hanedandan tamamen kayboluyor (ölüler listesinde de, hanedan ekranında da yok). Metin "kraliçe ana oldu" diyor | Düşük | Hanedan ekranında "Kraliçe ana" satırı tutulabilir |
| A4 | Kraliyet istekleri lordun ürettiğine bakmıyor: aç ve yemeği 0 olan lorda "Kuzeyde kıtlık var, 100 yemek", tek silah atölyesi olana 720 savaş malzemesi | Düşük | İsteği lordun net üretimine ya da stoğuna göre tartmak; aç lordda yemek istememek |
| A5 | Elçi haberleri kuyruğu uzun: dönen oyuncu 8–10 eski haberi (devriye eğlendi, armağan…) tek tek kapatıyor | Düşük | Aynı türden haberleri birleştirmek ("3 devriye uğradı: 420 altın") ya da "Hepsini okundu say" düğmesi |
| A6 | Haraççıyla konuşmada huyuna uyan cevap çok belli (övgü / rüşvet / dua). Her 30 dakikada %40 indirim neredeyse bedava, kısa sürede angaryaya döner | Düşük (eğlence) | Cevapları biraz belirsizleştirmek ya da aynı haraççıya üst üste konuşmanın etkisini azaltmak |
| A7 | Mini oyunlarda tohum istemciye verildiği ve oyun belirlenimci olduğu için bir bot kusursuz oynayabiliyor (ödül hakkı bunu sınırlıyor; botum 96/100 aldı) | Düşük | Bilinen tasarım: ödül hakkı yeterli. Sıralama için bir şey yapılmazsa bot puanları tabloyu doldurabilir |
| A8 | Desktop'ta Görevler ve Süren işler kutuları haritanın sol alt çeyreğini kaplıyor; devriye kolu bunların arkasında kaldı | Düşük | Görevler kutusu varsayılan olarak katlı açılabilir |
| A9 | Saray → Yapılar listesindeki satırlar tıklanmıyor | İyileştirme | Satıra tıklayınca kamera binaya gitsin ve menüsü açılsın (tek binalı türlerde) |
| A10 | Dev modunda HMR yeniden yüklemesinden sonra istemci birkaç saniye eski bir durumu gösterdi (ilk girişteki `initial`) | Yok (yalnız dev) | Canlıyı etkilemez |
| A11 | Bir kriz cevaplanınca pencere hemen kapanıyor; seçimin sonucu söylenmiyor | İyileştirme | "Köylüler seferber edildi: zarar önlendi, 5 dk iş gücü −%30" diye kısa bir onay |

## UI/UX ve eğlence gözlemleri

- **Taçlar katmanı oyunun en "canlı" kısmı.** Devriyenin gelmesi, bahşiş, armağan, haraççının adı ve huyu, kraliyet elçisi: oyuncuya sürekli küçük kararlar ve ödüller veriyor. Çizimler (taç tanıtımı, haraç, armağan salonu, doğum odası, maden göçüğü, avcılar) çok iyi ve tutarlı.
- Haraçla konuşmak eğlenceli ve iyi yazılmış ("Kırk haydut kesti, otuz dokuzu da gördü"). Ama A6'daki gibi çabuk çözülüyor.
- Devriye ve haraç ritmi (15 / 30 dk), kraliyet isteği (60 dk), sipariş ve görev (saatte bir) birleşince elçi pencereleri çok sık açılıyor. Dönen bir oyuncu önce rapor, sonra 5–10 pencere görüyor (A5). Önceliklendirme (D6) bunu biraz düzeltti, ama gruplama gerekli.
- Mini oyunların sahneleri çok iyi. Saatlik ödül hakkı menüde açıkça yazıyor ("bu saat kalan: 70").
- Hanedan: 1 yıl = 1 saat çok hızlı ama dramatik: 30 yaşındaki kral 4 dakika içinde öldü (test için öne çekildi), bebek bir öğleden sonrada reşit oluyor. Akraba kuralıyla (D4) artık çıkmaz yok.
- Takvim kartı bilgilendirici. "Mevsim: Kış · 4 dk sonra ilkbahar" ile hasat ve hastalık çarpanları açık yazıyor.
- Ekonomi notu (benim alanım değil): DB'de büyütülen lordda yemek sürekli 0'daydı ve nüfus 53'ten 38'e düştü (4 tarla, 3 seviyeli 5 ev). Kış ×0,74 ve salgın da üst üste geldi. T1'e bildirilebilir.

## Test araçları

Betiklerin hepsi depo dışında, `/private/tmp/claude-501/qa3/` içinde: `server.ts` (Playwright'ı HTTP'den süren sunucu), `api.ts` (komut çağırma), `boost.ts` (DB'de lordu büyütme), `when.ts` (devriye ve haraç zamanları), `fort.ts` (yaklaşan olaylar), `mg.ts` (mini oyun botu), `board.ts` (sıralama). Depoda geçici dosya kalmadı.
