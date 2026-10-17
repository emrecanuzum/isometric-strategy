# T1 — Kuruluş ve çekirdek ekonomi testi

> **Tarih:** 2026-10-16 · **Ortam:** yerel Supabase + yerel Edge Functions + Vite (5180) · **Lobi:** `T1 Ekonomi` · **Hesaplar:** `t1qa@test.local` (T1Tester), `t1b@test.local` (yalnızca API ile katılım denemesi)
> **Yöntem:** kendi dizinimde (`/private/tmp/claude-501/qa1`) headless Chromium'u Playwright ile süren küçük bir komut sunucusu. Ekran görüntülerine baktım, DOM metinlerini okudum, konsol ve ağ hatalarını topladım. Geç oyunu görmek için kendi krallığımın `state`'ini veritabanında ileri sardım (3. seviye saray, 20 yapı). Ekonomi akışını ayrıca `packages/shared` ile bun simülasyonunda denedim (yeni lordun ilk 2 saati, başlangıç yerlerinin arsa durumu).
> **Önemli kısıt:** Makinenin yük ortalaması test boyunca 80–215 arasındaydı (4 test eden, 4 tarayıcı). Ekran görüntüleri 15–120 sn sürdü, tıklamalar yer yer kayboldu. PostgREST bağlantı havuzu tükendi (`PGRST003`), sorgular zaman aşımına uğradı (`57014`), `command` `503 busy` döndü. Aşağıdaki "kaybolan tık" gözlemlerinin bir kısmı bu yükten kaynaklanıyor olabilir. Bu yüzden onları hata saymadım.

---

## 1. Özet

- **Düzeltilen: 22 sorun.** Biri adalet hatası: başlangıç yerlerinin ~%2'sinde ticaret ve iskele arsası hiç yoktu. Biri çökme benzeri: yoğun sunucuda oturum açıkken giriş ekranına atılma. Gerisi arayüz ve metin hataları (pencerelerin üst üste binmesi, yanlış ya da eskimiş metinler, ondalık nokta, günlük spam'i).
- **Açık: 9 sorun.** Hepsi küçük ya da orta. En önemlisi açılış dakikalarındaki pencere yağmuru (U1) ve yeni lordun tüccarla yapı malzemesini satıp kilitlenmesi (U2). İkincisi için şimdilik yalnızca uyarı ekledim.
- `bun run typecheck` temiz. `packages/shared`'a dokunmadım, bu yüzden `fn:bundle` gerekmedi. `supabase/functions/command/index.ts` değişti (sıcak yükleme). Katılım API ile denendi, çalışıyor.

---

## 2. Test edilenler

| Özellik | Sonuç | Not |
| --- | --- | --- |
| Giriş: yanlış şifre | ✅ | "E-posta ya da şifre hatalı." |
| Hesap oluşturma → ana menü | ✅ | Kullanıcı adı alt köşede |
| Ana menü: Lobiler / Nasıl oynanır / Ayarlar | ✅ | Nasıl oynanır 6 sayfa. Ayarlarda müzik, efekt, detay animasyonu, hesap ve çıkış var |
| Lobi açma (9 lord, şifresiz) | ✅ | "Dünya oluşturuluyor…" → yer seçimi |
| 3 yer kartı | ⚠️→✅ | "106 karo" iki satıra kırılıyordu (düzeltildi). Bir yerde ticaret ve iskele arsası "yok" çıktı (adalet hatası, düzeltildi) |
| Ad önerisi, renk seçimi, "Burada kur" | ✅ | Ad önerisi iyi ("Erguvanalan Diyarı") |
| Saray yerleştirme ve onay | ✅ | "Saray buraya kurulsun mu? · Ücretsiz · 3×3" |
| İlk mal seçimi penceresi | ⚠️→✅ | Elçi penceresi bunun altında görünüyordu (düzeltildi). Yeni uyarı eklendi (U2) |
| Öğretici (23 adım) | ✅ / ⚠️ | Adımlar doğru ilerliyor, "Bu adımı geç", "Öğreticiyi kapat" çalışıyor. Yerleştirme sırasında elçi haritayı örtüyordu (düzeltildi) |
| İnşa sekmesi, 5 seviye sekmesi | ✅ / ⚠️ | Kilitli seviyeler "Bu yapılar için sarayı N. seviyeye yükselt" diyor, sınırı artanlar yazıyor. Sur kapısı "1×1" görünüyordu (düzeltildi). "Zaten var ya da arsa yok" belirsizdi (düzeltildi) |
| Plan çubuğu (Geri al / Temizle / Onayla → Emin misin?) | ✅ / ⚠️ | Çalışıyor. Yapılamayacak adımlar yalnız onay penceresinde yazıyordu, artık çubukta da yazıyor |
| Sürükleyerek ev sırası | ✅ | 6 ev sürüklendi; 3'ü malzeme yetmediği için atlandı |
| Yol sürükleme | ⏸ | Üç denemede de pencere araya girdi ya da tık kayboldu, doğrulanamadı |
| Yıkım modu | ✅ | Kırmızı dış hat, iade tutarı plan çubuğunda |
| Taşıma modu | ✅ / ⚠️ | Eski yer mavi, yeni yer iskele ve mavi çerçeve. Geçersiz yere tıklayınca hiçbir şey olmuyor (A5) |
| Bina menüsü (oduncu, ev): işçi, seviye, yükselt, taşı, yık, mini oyun | ✅ / ⚠️ | "Üretim ağı tıkandı" kutusu çok iyi. "Üretim 1.2 → 2" noktalıydı (düzeltildi) |
| Nüfus ve büyüme (Halk → Nüfus) | ✅ | Çarpanlar, dolmaya kalan süre, (i) açıklaması |
| Mutluluk, vergi, gece mesaisi, kâhya | ⚠️→✅ | "0.02 altın", "mutluluk -15 düşer" düzeltildi |
| Depo / hazine sınırı | ✅ | "Ambar dolu: yapı malzemesi. 1 oduncu kampı boşa üretiyor." uyarısı ve ünlem levhası. Hazine doluyken "Tüccar hazine dolu diye 57 sefer bekledi" |
| Depo → Mallar / Hazine / Cephanelik | ✅ / ⚠️ | "Giden +0,0" düzeltildi |
| Ticaret: mal, nereye, sefer başına satış, geliştir | ⚠️→✅ | Taç başkenti metni yanlıştı (düzeltildi). Malı biten tüccar için uyarı yoktu (eklendi) |
| Üst çubuk kartları | ✅ | Gelen / giden, kalan tur, saat kartında takvim açıklaması |
| Süren işler / Görevler kutusu | ✅ / ⚠️ | İnşaat "Bitti" yeşil yanıyor. Teslim edilen kraliyet isteği sayaçta kaldı (A6) |
| Elçi: çağırma, "Bana oyunu anlat", konular | ✅ | Konular lordun kendi sayılarıyla anlatıyor (depo 2.100, hazine 3.500, nüfus sınırı 72) |
| Biat → saray 2. seviye | ✅ / ⚠️ | Yükseltme sürerken hudut metni yanlış seviyeyi yazıyordu (düzeltildi) |
| Kraliyet isteği (üstlen, teslim et) | ✅ | Sunucuda `delivered`, +100 altın |
| Hamburger menü (Ayarlar, Ana menü) | ✅ | |
| Lordluğu sıfırla (iki onay) | ✅ / ⚠️ | Düğme → "Emin misin? Her şey silinecek" → elçi penceresi → sıfırlandı, yer seçimi geldi. Elçi penceresi arkada görünüyordu (düzeltildi). Bekleyen taç haracı yeni lorddan alınacaktı (düzeltildi) |
| Günlük (Tümü / Önemli) | ⚠️→✅ | "Tüccar eli boş döndü" her dakika yazılıyordu. Aç geçen her günlük rapor "Önemli"yi dolduruyordu (ikisi de düzeltildi) |
| "Sen yokken" raporu | ✅ / ⚠️ | 3 sayfa, çizimler güzel. Üstüne olay penceresi açılıyordu (düzeltildi) |

---

## 3. Bulunan ve düzeltilen sorunlar

| # | Sorun | Önem | Düzeltme (dosya) |
| --- | --- | --- | --- |
| D1 | **Adil başlangıç:** başlangıç yerlerinin ~%2'sinde ne ticaret ne iskele arsası bulunuyordu (kartta "yok · yakında yol yok"). Böyle bir yeri seçen lordun tüccarı hiç olmaz. Testte 3 yerden biri böyle çıktı | Yüksek | `rollSite` ilk 16 denemede ticaret ve iskele arsası olan yer arıyor; ancak hiçbiri çıkmazsa ötekini veriyor (`supabase/functions/command/index.ts`). API ile yeni bir hesapla katılınca çekilen 3 yerin üçünde de iki arsa var. CLAUDE.md §4.3 güncellendi |
| D2 | Sunucu yoğunken oturum açık oyuncu giriş ekranına düşüyordu. `loadProfile`, `/auth/v1/user` zaman aşımına uğrayınca (504) "oturum yok" sayıyordu | Yüksek | Sunucu açıkça reddetmediyse (4xx değilse) oturumdaki kullanıcıyla devam ediyor (`apps/web/src/net/settings.ts`) |
| D3 | Herhangi bir 401'de oyuncunun oturumu hemen kapatılıyordu. Erişim jetonunun yenilenmesi geçici olarak başarısız olunca da oluyordu | Orta | Önce `refreshSession()` deneniyor; yalnızca sunucu yenilemeyi reddederse oturum kapanıyor (`apps/web/src/lib/supabase.ts`) |
| D4 | Lordluk sıfırlanınca eski lorda bekleyen taç haraç isteği (`patrol_visits`, `pending`) yeni kurulan lordun hazinesinden alınacaktı | Orta | Sıfırlamada bu lordun bekleyen istekleri kapatılıyor (`command/index.ts`, `reset`). CLAUDE.md'ye eklendi |
| D5 | İlk mal seçimi penceresi, elçinin öğretici penceresinin üstüne biniyordu; iki pencere iç içe görünüyordu | Orta | Mal seçimi açıkken elçi bekliyor (`App.tsx`, `pickingGood`) |
| D6 | Kraliyet isteği penceresi ve sıfırlama onayı da elçinin üstüne biniyordu | Orta | `royalShown` ve `resetAsk` de elçiyi bekletiyor (`App.tsx`) |
| D7 | Yapı yerleştirirken elçi (öğreticinin yeni adımı) ekranın ortasına çıkıp haritayı örtüyordu; tık haritaya değil pencereye gidiyordu | Orta | Yerleştirme, taşıma ve yıkım sırasında elçi kenara çekiliyor, bitince geri geliyor (`Advisor.tsx` → `aside`, `App.tsx`) |
| D8 | "Sen yokken" raporunun üstüne, karar süresi çoktan dolmuş bir olay penceresi açılıyordu | Düşük | Yalnızca kararı hâlâ açık olan kriz ya da seçim raporun üstüne çıkıyor (`App.tsx`, `fortuneDecisionOpen`) |
| D9 | Olay kuyruğu, arkada beklerken bitmiş olayları da sırayla açıyordu ("1 dakika sürecek" kervan mevsimi, turnuva). Yeni bir seçimli olay ancak birkaç dakika sonra gelebiliyor ve "Karar verilmedi" diyordu | Orta | Bitmiş olaylar kuyruktan düşüyor (günlükte duruyorlar) (`App.tsx`) |
| D10 | Günlükte "Tüccar eli boş döndü" her raporda (≈ dakikada bir) yeniden yazılıyordu: listenin yarısı buydu | Orta | Bir kez yazılıyor; tüccar yeniden satınca ya da başka bir mal veya neden olunca tekrar yazılıyor (`journal.ts`, `emptyTold`) |
| D11 | Yemek azalırken her "Elçi raporu" kırmızı ve **Önemli** sayılıyordu; Önemli sekmesi Tümü ile neredeyse aynıydı | Orta | Günlük rapor Önemli sayılmıyor. Seyrek gelen "Ambar azalıyor" uyarısı orada kalıyor (`journal.ts`) |
| D12 | Tüccarın sattığı mal bitince Ticaret sekmesi bir şey söylemiyordu | Düşük | "Ambarda satılacak X kalmadı: tüccar eli boş bekliyor" uyarısı. Malın üretimi varsa çıkmıyor (`tabs.tsx`) |
| D13 | Şehre ticaret metni yanlıştı: "lobi fiyatı +%0", "%0 fazlasını öder", "lobi pazarının yarısı kadar düşürür" (oysa ayar 0,8) ve "serbest şehirde lobi fiyatının biraz üstünden" | Düşük | Metin config'ten kuruluyor: "lobi fiyatı", "(lobi pazarındaki etkinin %80 kadarı)", "Taç başkenti…" (`cities.tsx`, `tabs.tsx`) |
| D14 | Saray sekmesinde eskimiş bir cümle kalmıştı: "Hudut başarımlarla büyüyecek; şimdilik yalnızca görünüm için seçilebilir." | Düşük | Kaldırıldı (`tabs.tsx`) |
| D15 | Saray yükseltilirken "Sarayı 3. seviyeye yükseltince hudut 10×10 olur" yazıyordu (2. seviyeye yükseltiliyordu) | Düşük | Seviye hudut aşamasından hesaplanıyor; yükseltme sürerken de bir sonraki boyut yazıyor (`tabs.tsx`) |
| D16 | Yer kartında "106 karo" iki satıra kırılıyordu | Düşük | `index.css` (`.site-distance`) |
| D17 | Sur kapısı kartı ve onay penceresinde "1×1" yazıyordu; kapı 3 karodur | Düşük | "3×1" (`tabs.tsx`, `ConfirmBuild.tsx`) |
| D18 | Tek kurulabilen yapı için "Zaten var ya da arsa yok" yazıyordu | Düşük | "Zaten kurulu (bir tane olur)" ya da "Arsası yok" (`tabs.tsx`) |
| D19 | Ondalık noktalar: "köylü başına 0.02 altın", "Üretim 1.2 → 2" | Düşük | Türkçe virgül; vergi satırına "/ tur" eklendi (`tabs.tsx`, `BuildingSheet.tsx`) |
| D20 | "mutluluk -15 düşer" (çift olumsuz, ASCII tire); uyarılarda "(mutluluk -12)" | Düşük | "mutluluk 15 puan düşer", "(mutluluk −12)" (`tabs.tsx`) |
| D21 | "Giden +0,0", "tur başına +0,0" | Düşük | `signed` sıfırda işaret koymuyor: "0,0" (`primitives.tsx`) |
| D22 | Kraliçe gerekçeleri parantez içinde büyük harfle başlıyordu: "(En az 20 nüfus gerekir)" | Düşük | Küçük harf (`tabs.tsx`) |
| + | Plan çubuğu, yapılamayacak adımları yalnız onay penceresinde söylüyordu | Düşük | Çubukta "N adım şu an yapılamıyor" (`PlanBar.tsx`) |
| + | Öğreticinin tüccar adımı "her 30 saniyelik seferde" diyordu; sefer uzaklıkla 34–40 sn | Düşük | "sefer en az 30 saniye, ticaret noktası uzaksa daha uzun", yapı malzemesi uyarısıyla (`advisor/lines.ts`) |

---

## 4. Açık kalan sorunlar ve öneriler

| # | Sorun | Önem | Neden düzeltilmedi / öneri |
| --- | --- | --- | --- |
| U1 | **Pencere yağmuru.** İlk 30 dakikada sırayla şunlar geldi: dolu fırtınası, gezgin ozan, ejderha söylentisi, şövalye turnuvası, kervan mevsimi, taç düğünü, devriye uğradı, taç tanıtımı (5 sayfa), iki kraliyet isteği, haraççılar, "Sen yokken" ve 23 adımlık öğretici. Oyuncu çoğu zaman haritaya dokunamıyor; sürüklemeler ve tıklar pencereye gidiyor | Orta–yüksek | Tasarım kararı. Öneriler: (1) iyi haberler ve kararsız olaylar pencere yerine sağdaki kartlara ya da bir "haberler" rozetine gitsin; pencere yalnız karar isteyenler için açılsın. (2) Lordun ilk 30 dakikasında lobi olayları penceresiz gelsin. (3) Yerleştirme modundayken hiçbir pencere açılmasın, kuyrukta beklesin |
| U2 | **Yeni lord tüccarla yapı malzemesini satıp kilitleniyor.** Simülasyon: "yapı malzemesi sat" seçen lord 2 saat boyunca 7 yapıda takılı kalıyor (malzeme 1–4, 7 köylü). "Savaş malzemesi sat" seçen lord 13 yapıya ve 22 köylüye çıkıyor. Seçim penceresinde en kârlı mal yapı malzemesi gibi görünüyor | Orta | Uyarı metni eklendi (D5'in yanında). Kalıcı çözüm bir mekanik değişikliği: yemekteki gibi yapı malzemesine de bir rezerv (`trade.materialsReserve`, ör. 100), ya da ilk saatte tüccar varsayılanı "hiçbir şey satma" / savaş malzemesi. Karar tasarımcının |
| U3 | Yeni lordun 4 saray hizmetlisi tarlasız ~50 dakikada yemeği bitiriyor. İlk dakikalarda gelen dolu fırtınası 113 yemeği 45'e indirdi; açlık ve mutsuzluk (%21) çabuk geliyor | Düşük | Öğretici tarlayı 4. adımda istiyor. İlk tarla adımı oduncu kampıyla yer değiştirebilir ya da başlangıç yemeği 120'den 200'e çıkabilir |
| U4 | Yer seçme penceresi haritanın ortasını kapatıyor; "Seçtiğin yer haritada görünür" deniyor ama yerin kendisi pencerenin altında kalıyor | Düşük | Kamera, yeri pencerenin üstündeki boş alana kaydırsın ya da pencere yan panele dönüşsün |
| U5 | Taşıma modunda geçersiz bir yere tıklayınca hiçbir şey olmuyor; neden yazmıyor. Sağ üstteki karo bilgisi de bina varken "Çayır … · inşa edilebilir" diyor | Düşük | Geçersiz tıkta kısa bir neden ("Yer dolu"); karo bilgisinde binanın adı |
| U6 | Teslim edilen kraliyet isteği "Süren işler"de kalmaya devam etti (Görevler kutusu kayboldu). Sunucuda `status: delivered` | Düşük | Yük altında ve bir kez görüldü. İstemcinin krallık durumu güncellenmemiş olabilir. Yeniden denenmeli |
| U7 | Elçi tek başıma olduğum lobide "komşu lord bizim hazineyi saymış" ipucunu verdi | Düşük | Casus evi ipucu en az bir başka lord olunca gelsin |
| U8 | Üst çubukta altın tam 1.000 iken "1K" yazıyor. Kartta yer varken bin altı kısaltma garip duruyor | Çok düşük | Kısaltma 10.000'den başlasın |
| U9 | Olay penceresinde sürükleyince başlık metni seçiliyor (mavi vurgu) | Çok düşük | `.modal` başlıklarına `user-select: none` |

---

## 5. Arayüz, deneyim ve eğlence üzerine (ekran görüntülerinden)

- **Görsel kalite çok yüksek.** Saray, binalar (kırmızı ahır, tarlalar, ev çeşitleri), olay çizimleri (dolu, turnuva, taç düğünü, kervan) ve "Sen yokken" sahnesi pikselli ve özenli. Gece aydınlatması, yanan pencereler ve gölgeler lordluğu canlı gösteriyor. 3. seviyedeki 20 yapılık lordluk bir köy gibi okunuyor; insanı büyütmeye teşvik ediyor.
- **Bilgi zengin ama yoğun.** Bina menüsündeki "Üretim ağı tıkandı" kutusu örnek bir tasarım: ne oldu, ne kadar boşa gidiyor, üç çare. Depo, hazine defteri ve üst çubuk kartları da çok açıklayıcı. Ama yan panel tam bir yazı duvarı (oduncu menüsünde mini oyun açıklaması 6 satır). Uzun açıklamalar "(i)" arkasına katlanabilir.
- **Açılış temposu.** İlk 5 dakika keyifli: elçinin esprili dili, bedava ilk yapılar, inşaatın 6–10 saniye sürmesi. Sonra pencereler (U1) ve yemek baskısı (U3) akışı bölüyor. Öğreticinin "Odunu kampı seç" gibi düğmeleri doğrudan yerleştirme moduna sokuyor; bu çok iyi.
- **Ödül hissi.** Hedef yıldızı ("Köşk Sahibi, +25 altın"), taç armağanı, kraliyet isteği gibi küçük ödüller sık geliyor; iyi. Ama ekonominin ana döngüsü (tüccar) erken oyunda sessizce durabiliyor: mal bitince, hazine dolunca. Bunu artık uyarılar söylüyor (D12; hazine uyarısı zaten vardı). Öneri: tüccar her döndüğünde saray üstünde beliren "+15 altın" yazısı mal bitince "eli boş" diye kırmızı yazsın.
- **Para hissi.** 1. seviyede hazine sınırı 1.000 ve 2. seviyede 2.000. Ben (DB ile) 900 altın verince hazine hemen doldu ve "57 sefer bekledi" yazdı. Gerçek oyunda 1. seviyede ~140 altın/saat kazanılıyor, sınır sorun değil. Sınırlar makul.

---

## 6. Değişen dosyalar

- `supabase/functions/command/index.ts` — `rollSite` arsa tercihi; `reset` bekleyen haraçları kapatır
- `apps/web/src/net/settings.ts`, `apps/web/src/lib/supabase.ts` — yoğun sunucuda oturumu korumak
- `apps/web/src/App.tsx` — elçi engelleri (`pickingGood`, `royalShown`, `resetAsk`, `aside`); kararı açık olay raporun üstünde; bitmiş olayları kuyruktan düşürme
- `apps/web/src/ui/advisor/Advisor.tsx`, `apps/web/src/ui/advisor/lines.ts`
- `apps/web/src/ui/hud/journal.ts` — boş sefer bir kez yazılıyor; günlük rapor Önemli değil
- `apps/web/src/ui/hud/tabs.tsx`, `apps/web/src/ui/hud/cities.tsx`, `apps/web/src/ui/hud/PlanBar.tsx`, `apps/web/src/ui/hud/ConfirmBuild.tsx`, `apps/web/src/ui/hud/BuildingSheet.tsx`, `apps/web/src/ui/hud/primitives.tsx`, `apps/web/src/ui/panels.tsx`, `apps/web/src/index.css`
- `CLAUDE.md` — §4.3 adil başlangıç kuralı; sıfırlamanın temizledikleri
