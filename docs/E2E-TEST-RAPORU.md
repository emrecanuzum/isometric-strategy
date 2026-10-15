# Uçtan Uca Test Raporu — İzometrik Strateji

> **Güncelleme 3:** 2026-10-15 · Commit: `6e945bb` (önceki tur: `669ffa6`, arada 23 commit; 89 dosya, +15.132 satır) · Test eden: Claude (Opus 5.5)
> Durum: **İLK GERÇEK UÇTAN UCA TUR.** Lokal Supabase (Docker) + lokal Edge Functions + Vite istemcisi, Playwright ile tarayıcı ve iki test hesabıyla çok oyunculu komut akışı. Ayrıca 4 statik denetim (sunucu, ekonomi+AFK, ilişki/diplomasi/casusluk, savaş+hanedan) ve gerçek oyun fonksiyonlarını çağıran `bun` simülasyonları.

---

## 0. Kapsam beyanı

| Katman | Yöntem | Durum |
| --- | --- | --- |
| Tip denetimi (`bun run typecheck`) | Lokal | ✅ `@game/shared`, `@game/web` hatasız. Edge Function'lar typecheck kapsamında **değil**. |
| İstemci derlemesi (`bun run build`) | Lokal | ✅ (yalnız ">500 kB chunk" uyarısı) |
| Migration'lar | `supabase start` (temiz veritabanı) | ✅ 60+ migration sırayla hatasız uygulandı |
| Edge Functions | `supabase functions serve` (lokal, Deno 2.1.4) | ✅ çalışıyor — ⚠️ `found` bir kez **CPU sınırına takıldı** (L1) |
| Tarayıcıda UI | Playwright (Chromium, 1038×652) | ✅ giriş, lobi açma, yer seçimi, kuruluş, saray, mal seçimi, 8 sekmenin hepsi. Konsolda hata yok (yalnız PixiJS doku uyarısı). |
| Çok oyunculu | 2. hesap `bun` betiğiyle gerçek `command` fonksiyonuna | ✅ katılma, kuruluş, hakaret, savaş ilanı reddi, 1 altınlık haraç isteği, eşzamanlı `play`, 10× eşzamanlı `settle` |
| Denge | Kod okuma + simülasyon (`planBattle`, `dynastyStep`, `advance`, `priceAt` gerçek fonksiyonlar; 3000–4000 tohum) | ✅ |
| Ordu yürüyüşü / gerçek muharebe canlı | — | ❌ Kışla için saray 2 + biat gerekiyor; muharebeler simülasyonla ölçüldü |
| pg_cron `tick` | — | ❌ Lokalde bağlanmadı; olaylar `settle` ile işletildi |
| Yük testi | — | ❌ Kapsam dışı |

**Özet:**
- Önceki turun 16 sunucu bulgusunun **hiçbiri düzeltilmemiş**; S1 ve S11 yeni kodla genişledi. 9 yeni sunucu bulgusu (Y1–Y9), en acili **Y1: eşzamanlı iki "böl" emriyle asker çoğaltma**.
- Canlı testte 4 yeni bulgu (L1–L4); en önemlisi **L1: `found` CPU sınırına takılıp istemciyi yer seçimine geri atıyor**.
- Denge: 22 eski bulgudan 2'si düzeldi (D4 büyük ölçüde, D10 kısmen), çoğu sürüyor. Yeni: ekonomi 8 (E1–E8), AFK/çoklu hesap 8 (A1–A8), ilişki 15 (R1–R15), savaş 13 (W1–W13), hanedan 7 (H1–H7).
- **En tehlikeli 5 zincir:** (1) `seen` ile yokluk cezası tamamen atlatılıyor (A1); (2) boş saray 1 askerle alınıyor → puan, savaş puanı, dayatılan haraç ve "kahırdan ölüm" çiftçiliği (W1+W8+H3+A6); (3) boş kasadan haraç ödeyen alt hesaplar saatte 1.440 altın basıyor (D1/A2); (4) taç şehrine ticaret lobi pazarından 3–4 kat kârlı (B1, canlıda da görüldü: 48 sn'de 30 birim vs 44 sn'de 10 birim); (5) bütün içerik 1–3 günde bitiyor, sezon 14 gün (E5).

---

## 1. Oturum günlüğü

```
— Tur 1 (2026-10-14, f1487ea) / Tur 2 (2026-10-15 00:5x, 669ffa6): statik denetim; tarayıcı bağlanamadı —
— Tur 3 (2026-10-15, 6e945bb) —
[10:2x] typecheck ✅, build ✅
[10:2x] 4 statik denetim ajanı paralel başlatıldı (sunucu, ekonomi+AFK, ilişki, savaş+hanedan)
[10:2x] claude-in-chrome: list_connected_browsers → [] ; Docker açık → lokal yığına geçildi
[10:3x] bunx supabase start → bütün migration'lar temiz; fn:bundle; functions serve; vite :5174 (lokal URL ile, .env.local'a dokunulmadı)
[10:3x] 2 test hesabı admin API ile açıldı (yalnız lokal)
[10:3x] Playwright: giriş ✅ → "Lobi aç" (9 lord) ✅ → 3 yer kartı ✅ → "Burada kur" ✅
[10:3x] functions log: "CPU time soft limit reached … early termination" (found) → L1
[10:3x] Saray yerleştirildi (sunucuda kayıtlı) → istemci yer seçimi penceresine geri döndü, "0/9 lord" → sayfa yenilenince düzeldi (L1)
[10:4x] Mal seçimi, 8 sekme gezildi; konsolda hata yok
[10:4x] bun betiği: tester2 join/found ✅, geçersiz renk reddi ✅, hakaret ✅, 2. hakaret 'already'/'cooldown' ✅,
        savaş ilanı 'relation' reddi ✅, 1 altınlık haraç isteği KABUL edildi (R3), eşzamanlı 2×play → biri 'busy' ✅,
        10× eşzamanlı settle → hepsi 200 (hız sınırı yok, S1/Y3), 80 sn sonra hakaret yerleşti: ilişki −25 ✅
[10:5x] 4 ajan raporu birleştirildi, rapor yazıldı
```

---

## 2. Canlı E2E bulguları (yeni)

| # | Ciddiyet | Başlık | Kanıt | Öneri |
| --- | --- | --- | --- | --- |
| L1 | **YÜKSEK** | `found` CPU sınırına takılıyor; istemci kurulmuş krallığı kaybedip yer seçimine dönüyor | functions log `CPU time soft limit reached … early termination` (`found`). Sunucuda krallık kurulmuş (`foundedAt` dolu), ama istemci isteği hata sayıp `mineRef.state=null`'a döndü (`App.tsx:553-561`). Saray sonra yerleştirildi; yine de pencere "Lordluğunu nereye kuracaksın?" ile açıldı, üstte "0/9 lord". Yenilemeyle düzeldi. Bulutta CPU sınırı (2 sn) aynı. | Hata durumunda körlemesine eski duruma dönme: önce satırı yeniden oku (`fetchMine`). `found`/`roll`/`join` içindeki dünya üretimini önbelleğe al (lobi başına bir kez, `lobby_worlds` zaten var). |
| L2 | ORTA | Taç şehri ticareti arayüzde de baskın | Ticaret sekmesi: "Lobi pazarı 44 sn, 10 birim" — "Sedefhisar Krallığı 48 sn, 30 birim, lobi fiyatı +%10". | Bkz. B1. |
| L3 | DÜŞÜK | Yer seçimi penceresinde "Burada kur" 652 px yükseklikte ekranın altında kalıyor | Playwright kutusu: bölge 116–628, düğme 640–684 (pencere dışına taşıyor). | Pencereyi `max-height: 100dvh` ile kaydırılabilir yap, düğmeyi yapışkan alt şeride al. |
| L4 | DÜŞÜK | "Ambar azalıyor" uyarısı birkaç dakikada tekrar tekrar yazılıyor | Günlük: aynı uyarı 28 sn ve 1 dk önce (106 tur ve 336 tur). | ✅ **Düzeltildi:** en çok 10 dakikada bir yazılıyor (`journal.ts` → `hungerToldAt`). |
| L5 | DÜŞÜK | 652 px yükseklikte harita uyarı kartı "Üsse dön" düğmesinin üstüne biniyor | Ekran görüntüsü: kart 568–668 px, düğme 640–715 px. | Uyarı sütununa harita düğmelerinin üstünde biten bir `max-height` ver. |
| L6 | — | R3 canlıda da doğrulandı | 1 altınlık haraç isteği kabul edildi; 600 sn sonra "Haraç isteği cevapsız kaldı · İlişkiniz 30 düştü". | Bkz. R3. |

Doğru çalışanlar (canlı): lobi açma ve dünya üretimi, şifresiz katılım, renk kilidi, geçersiz rengin reddi, yer kartlarındaki ticaret/iskele uzaklıkları, ücretsiz ticaret noktası, sefer süresinin uzaklıkla uzaması (44 sn), elçi yolculuğu (~60 sn) ve ilişki −25, hakaret beklemesi, eşzamanlı `play` koruması, sekme içerikleri.

---

## 3. Sistemsel / sunucu hataları

### 3.1 Önceki bulguların durumu (`6e945bb`)

| # | Ciddiyet | Başlık | Durum | Kanıt | Not |
| --- | --- | --- | --- | --- | --- |
| S1 | **KRİTİK** | Tick eşzamanlı koşuyor, olaylar idempotent değil | ⚠️ KÖTÜLEŞTİ | `_shared/tick.ts:44-55`, `tick/index.ts:14` (`minGapMs=0`), `tick.ts:67-71, 89-93, 432` | Kasaba ve devriye adımları idempotent (doğru). `finishBattle` hâlâ `resolved`'ı koşulsuz yazıyor; yeni **kahırdan ölüm** (`tick.ts:385-388`) savaş iki kez işlenirse tahta çıkan varisi de öldürür (Y5). Canlıda 10 eşzamanlı `settle` hepsi kabul edildi. |
| S2 | YÜKSEK | `reset` herkese açık | ❌ | `command/index.ts:383-389` | Yeni yan etkiler: N2, Y9. |
| S3 | YÜKSEK | `found`'da `cmd.site` doğrulanmıyor | ❌ | `command/index.ts:164`, `economy.ts:1066-1068` | `"constructor"` hâlâ `productAllowed`'dan geçiyor. |
| S4 | YÜKSEK | `recall` yarışı casus çoğaltıyor | ❌ | `command/index.ts:856-861` | — |
| S5 | ORTA | `respond` ile süre dolumu yarışı | ❌ | `command/index.ts:505-510`, `tick.ts:63-64` | — |
| S6 | ORTA | Rakip ordu büyüklüğü sızıyor | ❌ | `…army_crowd.sql:15` | — |
| S7 | ORTA | Lobi pazarı kilitsiz | ❌ | `_shared/server.ts:92-98` | — |
| S8 | ORTA | Krallıklar arası işlemler transaction'sız | ❌ GENİŞLEDİ | kaçırma `:605-617`, yağma `:629-666`, fidye `:692-711` | Kasabalar da (Y4). |
| S9 | ORTA | Ordu emirleri / yol bulma sınırsız | ❌ | `command/index.ts:912-913`, `tick.ts:82-97` | Kasaba emri ek sorgu + `march` (`armies.ts:126-132`). |
| S10 | DÜŞÜK-ORTA | Ordu sınırı / kuruluş yeri yarışı | ❌ | `armies.ts:163, 196` | Bölme yarışı artık asker çoğaltıyor (Y1). |
| S11 | DÜŞÜK→ORTA | Mini oyunlar botlanabilir | ⚠️ KÖTÜLEŞTİ | `command/index.ts:809-855` | Tasarım 4 oyuna ve sıralamaya yayıldı (Y2, A5). |
| S12 | DÜŞÜK | Küçükler | ❌ | `chat_stamp`, `gen_salt('bf')`, `is_public` varsayılanı | — |
| N1 | ORTA | Şehirsiz lobide saray 1'de kilit | ❌ | `economy.ts:1030, 1041` | — |
| N2 | DÜŞÜK | Biat `reset` ile değişiyor | ❌ | `command/index.ts:388` | — |
| N3 | DÜŞÜK-ORTA | Tek 401 oturumu kapatıyor | ❌ | `lib/supabase.ts:7-19` | — |
| N4 | DÜŞÜK | Rakip taç lordlarının eski ittifakı | ❌ | `economy.ts:1045` | — |

### 3.2 Yeni sunucu bulguları

| # | Ciddiyet | Başlık | Kanıt | Senaryo | Öneri |
| --- | --- | --- | --- | --- | --- |
| Y1 | **YÜKSEK** | Ordu bölme/birleştirme yarışı asker çoğaltıyor | `armies.ts:159-169` (oku → güncelle → ekle, CAS yok), `towns.ts:197`, `tick.ts:218-221` | Temas penceresindeki 10'luk orduya aynı anda iki `split 5` → 5 + 5 + 5 = 15 asker. Kuşatma kaybı yazılırken bölme de aynı. | Ordu satırına `version`, CAS'lı güncelleme; bölme/birleştirme tek RPC transaction. |
| Y2 | ORTA | Mini oyun tohumu önceden veriliyor | `command/index.ts:815-820`, `minigames.ts:315-327` | Tohumla yerelde binlerce deneme, en iyi basış dizisi gönderilir; ödül her seferinde tavanda, "Tüm zamanlar" anlamsız. | Basışlar arası en kısa süre ve aykırı değer denetimi; ödüllü oyun sayısına günlük sınır. |
| Y3 | ORTA | `tick_due` biat eden tek lordla hep açık; tick her dakika bütün lobilerde | `…town_loyalty.sql:4-17`, `patrols.ts:40, 64` | Devriye için `advance` `claim`'den önce, her dakika, saatlerce çevrimdışı lord için binlerce tur. Lobi sayısı artınca fonksiyon zaman aşımına düşer. | Önce `claim`, sonra `advance`; zamanları `due_at` olarak yaz. |
| Y4 | ORTA | Kasaba el değiştirirken transaction yok | `towns.ts:190-208` | Kaybedenin yazımı çakışmayla düşerse kasaba iki lorda birden gelir verir, `claim` alındığı için yeniden denenmez. | Sahipliği `lobby_towns`'tan türet ya da her `advance`'te uzlaştır. |
| Y5 | DÜŞÜK-ORTA | S1 yarışı kahırdan ölümü ikiye katlıyor | `tick.ts:385-388`, `dynasty.ts:274-281` | — | `battles.resolved`'ı önce CAS ile sahiplen. |
| Y6 | DÜŞÜK | 1 altınlık taç haracıyla ilişki kasma | `patrols.ts:99-101` | Hazinede ~20 altın → istenen 1 → öde → rakip taçla +4. | İlişki artışı miktarla orantılı ya da alt sınır. |
| Y7 | DÜŞÜK | Hükümdar ölünce kraliçe bedava | `realm.ts:29-45` | `queenOwed` yalnız saray ≥3'e bakıyor; varis tahta çıkınca "Kraliçe getir" bedelsiz. | Bayrakla bir kez ver. |
| Y8 | DÜŞÜK | Bilgi sızıntıları | `…minigames.sql:41-60`, `…towns.sql:15` | `minigame_board('all')` özel lobi ve kullanıcı adlarını açıyor; `lobby_towns` garnizon ve kuşatma kayıplarını herkese yayınlıyor. | Özel lobilerin adını gizle; kayıpları taraflara aç. |
| Y9 | DÜŞÜK | `reset` kasaba sahipliğini bırakmıyor | `command/index.ts:383-389`, `towns.ts:136, 149` | Kasaba kalıcı kilitlenir. | Reset'te `owner_id=null`. |

**Doğru bulunanlar:** `patrolAnswer` (önce ödeme, sonra `pending` CAS, başarısızsa iade) · süresi dolan haraç atomik · `patrol_visits` benzersiz anahtarla upsert · kasaba kuşatması başlangıcı ve tur kayıpları CAS'lı · ayaklanmayla kopuş `owner_id` korumalı · `play`/`played`/`cast`/`fish` bekleme, tek seferlik ödeme, `validToggles`, `playedInTime`, ödül tavanı · `minigame_scores`'a yalnız sunucu yazıyor · `crisis`/`choose` anahtar eşleşmesi ve tek cevap · `nameChild` bir kez · `townUpkeep`, `swear`, `tradeCity` girdi denetimi · `lobby_towns` RLS üye-yalnız.

**Öncelik:** Y1 → S1/Y5 (lobi kirası + `resolved`/`status`/`ended_at` CAS) → L1 → S3/S4/S5 → A1 (aşağıda) → S2/N2/Y9 (`reset`) → Y3.

---

## 4. Denge — ekonomi

Varsayım: tur 10 sn (saatte 360), arazi 1,2, olaylar açık. "Gelişmiş lord" = saray 5, 110 köylü, ticaret Lv3, 10 tarla + 6 oduncu + 4 demirhane (Lv3), 3 ambar + 2 hazine Lv3, eğlence merkezi.

### 4.1 Saatlik altın, lord tipine göre (simülasyon)

| Tip | Vergi | Tüccar | Maaş | Diğer | Net / saat |
| --- | --- | --- | --- | --- | --- |
| Yeni lord (saray 1, 24 köylü, Lv1), aktif | 150 | 255–550 | 0 | kervan oyunu ≤150 | **~600–850** (GDD hedefi ~700 ✅) |
| Gelişmiş, aktif, lobi pazarı | 713 (ağır: 2.000) | 1.092 | −145 | taç ~375 + mini oyun/balık ~575 | **1.660** (ağır vergi 2.955); ekstralarla ~2.600–3.900 |
| Gelişmiş, aktif, taç şehri (66 sn) | 713 | 3.917 | −145 | aynı | **≥4.480**; 35.000'lik hazine 8 saatte doldu |
| Gelişmiş, çevrimdışı 8 sa, lobi / şehir | 495 | 418 / 1.804 | −145 | haraççı −363 / −830 | **567 / 1.335** |
| Gelişmiş, çevrimdışı 24 sa, lobi / şehir | 262 | 295 / 874 | −145 | haraççı −334 / −791 | **88 / 208** |
| Açık sekme (A1), 24 sa, ağır vergi, haraç reddi | 1.998 | 1.085 | −145 | — | **~2.950** |

GDD'deki "gelişmiş ~2.000–2.500/saat" yalnız lobi pazarı + yüksek vergiyle tutuyor; şehirle 2 katı, çevrimdışı çok altı.

### 4.2 Eski ekonomi bulguları

| # | Etki | Başlık | Durum | Güncel hesap |
| --- | --- | --- | --- | --- |
| D1 | YÜKSEK | Lordlar arası haraç yoktan altın basıyor | ⚠️ küçüldü, sürüyor | `economy.ts:741` koşulsuz, `:1243` ödeyende `max(0)`. `maxGold` 4 → boş kasa başına **1.440/saat** (eskiden 7.200). |
| D2 | YÜKSEK | Lobi fiyatı tek satıcıyla çöküyor | ⚠️ | 4 sa: Lv3 tek satıcı ortalama taban×0,34; 3 satıcı %33 dipte; 9 satıcı ×0,30. Lv1 tek satıcı ×0,74. |
| D3 | YÜKSEK | Biriken satış yerleşme anı fiyatından | ⚠️ kısmen | Biatlı lord haraççı ile 30 dk'da bir yerleşiyor (`server.ts:113`). Biatsız lordda 8 sa tek seferde 9.455 vs adım adım 4.557 (2,1×). |
| D4 | YÜKSEK | Sabotaj seli | ✅ büyük ölçüde | `networkCostShare: 1`. Ama 3 konu ayrı ağ: 3 dk'da 6 yakma → depoda %18 kalıyor (R13). |
| D5 | YÜKSEK | Mutluluk ekonomiyi etkilemiyor | ❌ **daha kötü** | 8 sa: ağır vergi 15.982, normal 5.708 (2,8×). Mutluluk 58'e iniyor, bedelsiz. |
| D7 | ORTA | Geri ödeme | ⚠️ dönüştü | Darboğaz artık üretimin boşa gitmesi (E1). |
| D8 | ORTA | Puan formülü | ❌ | 35.000 altın = 3.500 puan, saray 5 = 600. Araştırma kademe 3: 320 puanlık altın → 150 puan. |
| D14 | DÜŞÜK | Balıkçı kulübesi | ⚠️ | 150 sn bekleme = saatte 24 atış: ≈215 altın + 1.230 mal + 36 pasif. |
| D15 | DÜŞÜK | Plan | ❔ doğrulanmadı | — |
| D16 | DÜŞÜK | Yokluk cezası | ❌ | Bkz. A1. |
| B1 | **YÜKSEK** | Taç şehri ticareti baskın | ❌ (canlıda da) | 50 karoda **3.515/saat**, lobide Lv3 848 (4,1×); 200 karoda 3×. |
| B2 | YÜKSEK | Aç kalmak bedava | ❌ | Tarlasız aç lord vergide 15.812, beslenen 15.982 (−%1). |
| B3 | ORTA | Uzak ticaret noktası | ⚠️ | 100 karo 47,6 sn (−%37), 250 karo 77,6 sn (−%61). |
| B5 | DÜŞÜK | Fiyat tabanın üstünde kalıyor | ❌ | `upToFactor` 1,2. |
| B6 | DÜŞÜK | Keten buğdaydan değerli | ❌ | 0,66 vs 0,4 (1,65×). |

### 4.3 Yeni ekonomi bulguları

| # | Etki | Başlık | Hesap | Öneri |
| --- | --- | --- | --- | --- |
| E1 | **YÜKSEK** | Üretimin çoğu boşa gidiyor | Gelişmiş lord 8 saatte **227.000 mal** yaktı (6.800'lük depo ilk saatte doldu). Lv3 tüccar saatte en çok 4.200 birim satıyor ≈ 1,5 oduncu Lv3. 2. tarladan sonra her bina altın getirmiyor. | Üretimi ~%50 düşür ya da tüccar kapasitesini artır (`levels.units` 10/20/35 → 15/35/60), ticaret Lv4–5 ekle. **Deniz ticareti bu açığı kapatmak için tasarlandı (§9).** |
| E2 | **YÜKSEK** | Ağır vergi baskın | Gelişmiş aktif: ağır 2.955/sa, normal 1.660/sa. | Vergi × (0,4 + mutluluk/100); `heavy.goldPerVillager` 0,056 → 0,042. |
| E3 | **YÜKSEK** | Taç devriyesi lord sayısına bölünüyor | Taç başına saatte 4 ziyaret. 85+ ilişkide ziyaret ≈ 120 bahşiş + 300 altın + 220 mal × güç payı. 9 kişilik lobide lord başına ≈375/sa; tacında **tek lord** ≈1.350–2.180/sa + mal. | Ziyaret lord başına sabit tempo (`visitEverySeconds: 3600`); armağan altını 60/150/300 → 30/80/150. |
| E4 | **YÜKSEK** | Haraççılar çevrimdışını eritiyor, çevrimiçi ret bedava | Çevrimdışı 8 sa: brütün %39'u, 24 sa: **%79**'u. Ret bedeli (−10) 14 dk'da siliniyor. | `everySeconds` 3600, `share` 0,04; hazine binasındaki altın korunsun; `tributeRefused` −30; ret sonrası istek 2×. |
| E5 | **YÜKSEK** | İçerik 1–3 günde bitiyor | Saray 2→5: 9.300 altın, **16 dk** inşa. Bütün içerik ≈66.000 altın; aktif oyuncu 13–22 saatte bitiriyor. Sezon 14 gün. | Saray `buildSeconds` 20/150/300/480 → 600/3600/10800/21600; araştırma 2/4/7 dk → 30/90/180 dk. |
| E6 | ORTA | Kasaba bakımında en düşük kademe baskın | Altın kasabası: "Az" net 1,2/tur, "Cömert" 0,9/tur. Mutluluk 97'de "Yok" ayaklanmıyor. | `upkeepTargets` [0,40,65,90], `yieldMax` 1,8. |
| E7 | ORTA | Puanı altın istifi belirliyor | Son saatlerde 35.000 altın = 3.500 puan. | `goldPer` 50, `goodsPer` 100. |
| E8 | DÜŞÜK | Balık kesesi depo sınırını aşıyor | `command/index.ts:800` sınırsız `+=`. | Mini oyun ödülleri gibi sınırla. |

---

## 5. Denge — AFK ve çoklu hesap

| # | Etki | Başlık | Hesap | Öneri |
| --- | --- | --- | --- | --- |
| A1 | **YÜKSEK** | `seen` ile yokluk cezası tamamen atlatılıyor | Sunucu `seen`'i koşulsuz kabul ediyor (`command/index.ts:390, 399`; canlıda doğrulandı). İstemci 5 dk'da bir gönderiyor (`App.tsx:570`); curl döngüsü aynısını yapar. 24 saatte açık sekme **70.700**, gerçek çevrimdışı 10.100 brüt / 2.100 net (7× brüt, 34× net). Bot haraççıyı da reddeder. | `lastSeenAt` yalnız oyun komutlarıyla güncellensin; `seen` en çok 30 dk uzatsın. |
| A2 | **YÜKSEK** | Alt hesaplardan haraç basma | Boş kasalı alt, ana hesaba 4/tur: alt başına **1.440/saat**; 8 alt ≈11.500/saat. | Önce ödeyenden düş, ödenen kadarı alana; lord başına en çok 2 gelen haraç. |
| A3 | ORTA | Hediyeyle sınırsız altın aktarımı | `gift` yalnız `minGold`. | `gift.maxGold` 300, bekleme 600 sn. |
| A4 | **YÜKSEK** | Taç seçimi ve altlarla devriye farmı, çevrimdışı da | Ana hesap tacında tek kalır (E3). Şehir tüccarı çevrimdışıyken de sefer başı +1,2 (saatte ~90 > 43 dönüş): ilişki 100'de, armağan 7/24. | E3 düzeltmesi; ilişki artışı satılan birimle orantılı (0,03/birim); lord yokken armağan gelmesin. |
| A5 | ORTA | Mini oyun botu | Tavan saatte 360 altın + 150 savaş malz.; balıkla +215 altın ve 1.230 mal (yeni lord için +%50–80). | Günlük ödüllü oyun sınırı (oyun başına 12). |
| A6 | ORTA | Alt hesapla puan farmı | 15 dk kalkanla saatte 4 kuşatma × 120 = **480 puan/saat**; puan taç gücüne de gidiyor. | Aynı hedef için kuşatma puanı saatte 1; muharebe puanı ≥10 kayıpta; rehine 60 → 20. |
| A7 | ORTA | Gerçek çevrimdışı oyuncu aşırı cezalı | Yokluk cezası (×0,2) + yarım yük + %5 haraççı: 24 sa net 88/sa. | `idle.min` 0,5; lord yokken haraççı payı yarıya. |
| A8 | DÜŞÜK | `act` komutları `lastSeenAt`'i güncellemiyor | `command/index.ts:921` OWN listesi (oyna, olta, haraç cevabı, elçi). | Bütün oyuncu komutları işaretlesin. |

---

## 6. Denge — ilişkiler, taçlar, casusluk

Hesap: elçi yolu 60 sn, teklif süresi 600 sn, ilişki dönüşü saatte 2 puan, gerekçe 2 saat.

**Eski bulgular:** D6 savaşsız yağma ❌ (barış süresi ve gerekçe şartı yok) · D10 ⚠️ (rehineyken yeni kraliçe alınamıyor, fidye ≥500; döngü R1) · D11 ❌ (iki hakaret 4 dk'da −50, bedava) · B4 ❌ (rakip taç −20 = gerekçeli savaş eşiği) · N4 ❌.

| # | Etki | Başlık | Hesap | Öneri |
| --- | --- | --- | --- | --- |
| R1 | **YÜKSEK** | Kaçırma–fidye sonsuz döngüsü | Başarılı kaçırma ilişkiyi düşürmüyor (`command/index.ts:605-617`). Karşı casusluğu 0 hedefte ağ 30→70 8 dk. Fidye tahminin %40'ı; tahmin ±%30 saptığı için hazinenin %52'sine çıkabiliyor. 7.000 altında deneme başı beklenen kazanç ≈ **+1.060**. Ödenince 8 dk sonra yeniden. Savaş kazanmak kraliçeyi getirmiyor. | Kaçırma −30 ilişki; aynı hedefe 2 sa bekleme; `ransomShare` 0,25, `ransomMax` 2500; kazanılan kuşatma rehineyi kurtarsın; rehine puanı 20. |
| R2 | **YÜKSEK** | Yağma çevrimdışı ticareti saatlerce kapatıyor | `trade.damaged` yalnız elle onarılıyor (`economy.ts:1129`). 8 sa yokluk ≈ 8–16K altın kayıp. | 15 dk sonra kendiliğinden onarım; savaş/gerekçe şartı; hedefe 1 sa bekleme. |
| R3 | **YÜKSEK** | 1 altınlık haraç isteği bedava savaş gerekçesi | Canlıda doğrulandı: 1 altınlık istek kabul edildi. Reddedilir ya da 600 sn cevapsız kalırsa isteyen −30 ilişki ve gerekçe kazanıyor (`_shared/diplomacy.ts:125-128`) → 11 dk'da itibarsız savaş. | Süresi dolan istek gerekçe vermesin, en çok −10; `tribute.minRelation` −10; en az tutar. |
| R4 | **YÜKSEK** | Taç ilişkisi çok hızlı geri dönüyor; kazanç yalnız uzaklığa bağlı | `driftPerRound 0.12` = saatte 43 puan. Başkente <194 karo olan yükseltebiliyor; 40 karoda 85'e 1,3 sa, 200 karo ötesi hep +15 (armağan yok). | `driftPerRound` 0,02, `cityTrip` 0,5, `visit` 4, `tributePaid` 6. |
| R5 | **YÜKSEK** | Taç haracını reddetmek baskın | Bkz. E4. | R4 + `tributeRefused` −15 + ret sonrası istek 2×. |
| R6 | ORTA | Devriye armağanı küçük tacın tek lorduna yığılıyor | 8'e 1 dağılımda tek lord ~5× armağan. | `perLords: 3` ile ceil(N/3) devriye ya da saatlik sabit armağan; `favour` [0,85; 1,15]. |
| R7 | ORTA | Taçların pazarı bonusu her saat seçilebilir | Mal değişiminde bekleme yok (`economy.ts:1075`). | `bonus` 0,15; mal değişimine 10 dk bekleme. |
| R8 | ORTA | Lordlar arası haraç | Bkz. D1/A2. | `tribute.maxGold` 2 ya da ödeyenin vergisinin %30'u. |
| R9 | ORTA | Barıştan hemen sonra yeniden savaş | `peaceRelation` −20 = eşik; gerekçe 2 sa. | `peaceRelation` 0, `truceSeconds` 3600. |
| R10 | ORTA | İlişki satın almak ucuz | 3 hediye (600 altın) ~3 dk'da +50; iki dost karşılıklı göndererek bedava ittifak. | `relationPerGold` 0,05, hediyeye çift başına 600 sn bekleme, `improve.gain` 6. |
| R11 | ORTA | İtibar cezası zayıf | İlk −20 bedava (`freeHostility` 20), −10 5 saatte geri. | `freeHostility` 10, `infamy` −20. |
| R12 | ORTA | Karşı casusluk uçurumu | 0'da casus asla yakalanmıyor (`espionage.ts:72`), ağ 12 dk'da 70; 7,25'te 99 dk ve %5 hayatta kalma. | `baseCounter: 1`, `counterPenalty` 0,03. |
| R13 | ORTA | Konular ayrı ağ, operasyonlar çarpılıyor | 3 konu = 3 isyan / 6 yakma / 3×(−35) sadakat. | Ağ harcaması bütün konulardan ya da hedefe 600 sn bekleme. |
| R14 | DÜŞÜK | Başarılı sabotaj/isyan ilişkiyi düşürmüyor | — | Başarıda %25 ifşa. |
| R15 | DÜŞÜK | `Claim.reason` türünde `'insult'`, `'raid'` yok | `diplomacy.ts:93` | Türe ekle. |

---

## 7. Denge — savaş

Simülasyon: gerçek `planBattle`, 4000 tohum.

**Eski:** D8 ❌ ağırlaştı (+40 puanlık muharebede asker alt sınırı yok) · D9 ❌ (`tick.ts:275` kuşatmada bütün kuleler) · D12 ❌ (`military.ts:603`: 3'e 3 ve 5'e 5 muharebelerin %100'ü kayıpsız; 10'a 10 ort. 3,2 kayıp) · D13 ❌ şekli değişti (W3).

| # | Etki | Başlık | Hesap | Öneri |
| --- | --- | --- | --- | --- |
| W1 | **YÜKSEK** | Garnizonsuz saray 1 askerle bedavaya düşüyor | `tick.ts:271` garnizon 0 → moral 0. 1 mızrakçı %100, 0 kayıp. Her kuşatma: 12 yağma, surların %30'u yıkık, mutluluk −20, +120 puan, +35 savaş puanı; saatte 4 kez. Yeni oyuncu koruması yok. | `minSiegeSoldiers` 10; boş sarayı `palaceGuard` (5 × saray seviyesi, moral 100) savunsun; `newcomerShieldSeconds` 3600 (GDD §3.3). |
| W2 | **YÜKSEK** | Muharebeyi sayı kazanıyor, kalite değil | Moral vuruşunda `might` yok (`military.ts:605`). 11'e 10 %63, 12'ye 10 %75, 15'e 10 %96. Eşitlikte saldıran %43,6 (savaşı ilan eden hep saldıran). | `hitByA *= aWeight`; eşitlikte zar toplamı; `moraleHit` 1,3. |
| W3 | ORTA | Karşıtlık grafiği dengesiz | Round-robin: süvari %65, okçu %38. | `cavalry: ["archer"]`, `shield: ["archer","cavalry"]` ya da süvari `might` 1,3. |
| W4 | **YÜKSEK** | Kuşatma savunmasını mutluluk belirliyor | Garnizon morali = mutluluk. 40 saldıran, 20 garnizon: mutluluk 60'ta %39, 90'da %3. Yağmanın −20'si 3 dk'da siliniyor. | Garnizon morali `60 + 0.4·(mutluluk−50)`; yağma cezası 10 dk ek etki. |
| W5 | ORTA | Sur ve kule ucuz, kule öldürmesi sabit | 12 sur (60 altın + 180 malz.) +3 zar. T kule için 6T+1 asker. | `wallsForBonus` 8, `maxWallBonus` 2; kule öldürmesi karşı tarafın %3'ü, en az 1. |
| W6 | ORTA | Yağma tavanı anlamsız | %15 yağma 2.220 birim; almak için 185 asker gerekir, nüfus sınırı 120. 60 askerlik saldırı ≈ kaybı karşılıyor. | `carryPerSoldier` 30; `siegeWon` 60, aynı saraya saatte 1. |
| W7 | **YÜKSEK** | Ölen asker nüfusa bedava dönüyor | `economy.ts:595`; havuz `0.25 × saray seviyesi`/tur → saray 3'te tam dolum 8 dk. | `regenPerRoundPerPalaceLevel` 0,03; ölen asker barınaktan 30 dk düşsün. |
| W8 | **YÜKSEK** | Savaş puanı ve barış şartları çiftçiliği | Her muharebe ±10 (`diplomacy.ts:155`), 3 boş kuşatma 45 dk'da 100 puan → dayatılan haraç **1.440/saat**. | Puan × min(1, kayıp/10); `tribute.maxGold` 1; haraca süre (7200 sn). |
| W9 | **YÜKSEK** | Kasabalar çok kârlı, kuşatma belirlenimci | Garnizon 12 + tahta sur → 11 asker kesin alıyor; sahipli kasabaya 4–5. Net getiri saatte ~700–1.000 altın değeri, alım ~130 altın. | Kuşatma `planBattle` ile; `kinds` food 2 / materials 1,6 / arms 1,2 / gold 1,5; bakım [0; 0,8; 1,5; 2,5]. |
| W10 | ORTA | Bakım | Asker başı saatte 21,6 altın (eğitimin 1,6×); W7 yüzünden ordu tutmamak en iyisi. | W7 sonra `upkeep.gold` 0,025. |
| W11 | DÜŞÜK | Yürüme morali etkisiz, saha bilgisi baskın | 1000 karo 17 dk, moral −8. 15 dk kamp yapan savunan %92. | `marchPerHour` −150, `familiarity.maxBonus` 1,0. |
| W12 | ORTA | Elçi gecikmesi test değerinde | 30 sn; canlıda 30 dk olunca 3 dk'lık yürüyüşe yarım saat geri çağırma yok. | 0,05 gün (~3 dk) ya da mesafeye bağlı. |
| W13 | DÜŞÜK | Ordu sınırı 2 | W1+W8 ile iki ufak ordu saatte ~8 muharebe. | W1, W2, W8 yeterli. |

**Kuşatma simülasyonu (saldıran morali 85):**

| Garnizon / kule / sur | Saldıran | Kazanma (mutluluk 60 / 90) | Saldıran kaybı |
| --- | --- | --- | --- |
| 20 / 2 / 12 | 40 mızrak | %39 / %3 | 30–33 |
| 20 / 2 / 12 | 60 mızrak | %95 / %73 | 25–34 |
| 20 / 2 / 12 | 40 mızrak + 6 mancınık | %86 / %41 | 29–38 |
| 30 / 6 / 24 | 120 mızrak | %99 / %88 | 57–78 |
| 0 / 2 / 0 | 15 mızrak | %100 | 12 |
| 0 / 0 / 0 | 1 mızrak | %100 | 0 |

---

## 8. Denge — hanedan

Simülasyon: gerçek `dynastyStep`, 3000 tohum, 336 saat.

| Senaryo | Ölüm | Doğum | Kalıcı naiplik |
| --- | --- | --- | --- |
| Kraliçe 6. saatte, kahır yok | 1,00 | 7,8 | %4,5 |
| Hiç kraliçe yok | 1,00 | 0 | %100 (ort. 108. saatten) |
| Kahır saatte 1/20 | 2,4 | — | %79 |

| # | Etki | Başlık | Hesap | Öneri |
| --- | --- | --- | --- | --- |
| H1 | ORTA | İlk hükümdar sezonda %100 ölüyor, hemen hep tek halef | Ölüm 120–324. saat (ort. 229). | Tasarım bu ise sorun değil; `yearHours` 4 → 1–2 halef. |
| H2 | **YÜKSEK** | Oğulsuz ölüm = sezon sonuna kadar naiplik | `dynasty.ts:175-185`: varis yoksa `king: null`, sonra doğum yok (`:162`). | 1 hanedan yılı sonra "uzak akraba" tahta çıksın (`council.heirAfterYears: 1`). |
| H3 | **YÜKSEK** | Kahırdan ölüm başkasının elinde | `tick.ts:385`: kaybeden %5 ölüyor, kuşatılan saray dahil. W1 ile saatte 4 → 1 saatte %18,5, 3 saatte %46. Tersine, kendi kötü hükümdarını 1 askerlik intihar ordularıyla öldürmek ~200 altın. | Ancak kayıp ≥10 ya da ordunun ≥%25'i; hükümdar başına yılda en çok 1 zar. |
| H4 | DÜŞÜK | Yetenek etkisi | Kraliçe katkısı sınırsız (`dynasty.ts:131`): etkin −2,5…12,5. Vergi ×0,775–1,225; zar ±0,9 (eşit muharebe %44 → %75). | `rulerSkills` 0–10'a sıkıştır; `military.dice` 0,08. |
| H5 | DÜŞÜK | Eğitimle yukarı kayma | Sezon sonu maliye ort. 8,5 (başta 5,5). | `education` 2. |
| H6 | ORTA | Kraliçe pazarlıksız zorunlu | 300 altına +15 mutluluk (= garnizon moralinde +15, W4), +40 puan, doğumlar. | `queen.cost.gold` 800 ya da +8 mutluluk. |
| H7 | DÜŞÜK | Dul kraliçe rehinken yeni kraliçe alınamıyor | `realm.ts:34`. Varis evlenemez, −25 sürer. | Hükümdar ölünce rehine kraliçe ana sayılsın. |

---

## 9. GDD (CLAUDE.md) ↔ kod uyuşmazlıkları

**Hâlâ geçerli:** §6.2/§9.6 moral vergi ve üretimi etkiler → kodda etkilemiyor (D5/E2) · §3.3 barış süresi yok (W1) · §5.2 açlıkta nüfus azalmıyor (B2) · §9.7 kuşatmada bütün kuleler (D9) · §6.4 "saray 4–5 savaş malzemesi ister" → 3 de istiyor · §9.8 Tıp ve Hayır işleri etkileri eksik · §7.8 taçlar fiyatı ×1,14'e çıkarıyor (B5).

**Yeni:**
- §9.1 "kuraldan önce yükselmiş saraylar" için bedava kraliçe → kodda her tahta geçişte bedava (Y7).
- §8.4 kasaba kuşatması "savaş gibi" → kodda zarsız, belirlenimci (W9).
- §6.4 "lord yokken ambar %50'de yavaşlar, %80'de durur" → doğru; ama §6.4 yokluk cezası `seen` ile atlatılıyor (A1).
- §10 hazine puanı (altın/10) → sezon sonu istif stratejisi (E7).

---

## 10. Tarayıcı (UI/UX) — yapılanlar

| Adım | Sonuç |
| --- | --- |
| Giriş (e-posta + şifre) | ✅ ana menü, kullanıcı adı köşede |
| Lobi aç (ad, 9 lord, şifresiz) | ✅ ~6 sn'de dünya hazır |
| 3 yer kartı (çarpanlar, ticaret noktası uzaklığı/sefer süresi, iskele, arazi payları), ad önerisi, renk | ✅ (L3: 652 px'te "Burada kur" taşıyor) |
| Kuruluş | ⚠️ L1 (CPU sınırı) |
| Saray yerleştirme | ✅ sunucuda; istemci L1 yüzünden yer seçimine döndü, yenileyince doğru |
| Ticaret noktası mal seçimi penceresi | ✅ |
| İnşa / Depo / Ticaret / Saray / Halk / Ordu / Diplomasi / Günlük | ✅ hepsi açıldı, içerik tutarlı; günlükte tekrar eden uyarı (L4) |
| Konsol | ✅ hata yok; PixiJS "textureSource destroyed while still bound" uyarısı (chunk önbelleği boşaltılırken) |

**Yapılmadı:** ordu yürüyüşü/muharebe izleme, kasaba kuşatması, casus operasyonları ve mini oyunların canlı oynanışı, telefon genişliği (390×844), ses.

---

## 11. Bu turda eklenen özellikler

### 11.1 Donanma (CLAUDE.md §8.5)

- **Tersane** (3. seviye saray, kıyıya 2×2, 3 seviye; kızakta kaburgalı gemi iskeleti, 3. seviyede bitmiş kadırga).
- **3 gemi türü** (kadırga / koka / çektiri; taş-kağıt-makas: kadırga > çektiri > koka), tayfa asker havuzundan, denizciler nüfustan düşer, tur başı bakım.
- **Liman + en çok 2 filo** (ordu gibi): filo çıkar, böl, birleştir, limana bağla, geri çağır.
- **7 görev:** limanda bekle (savunma) · deniz ticareti (taç limanına sefer, lobi fiyatının %85'i, fiyatı yarı oranda düşürür, taç ilişkisi +0,6) · balık avı · korsan avı (tavanlı ödül, ticarette korsan olasılığını yarıya indirir) · **abluka** (savaşta; iskele balığı, deniz ticareti, balık avı durur, mutluluk −6) · **kıyı akını** (ganimet yük kapasitesiyle sınırlı) · **ablukayı yarma**.
- **Korsanlar:** sefer başına olasılık, eskortla azalır; fırtına ×1,8, sis ×0,7, lobi tohumundan **korsan mevsimi** ×2,5; eskort kazanırsa ödül, kaybederse yük ve gemi gider.
- **Deniz muharebesi:** tohumlu, karşıtlık bonusu, kendi iskelesinde +%15; sunucu tick'inde (`_shared/navy.ts`), saldıranın satırında CAS ile bir kez işlenir; iki tarafa elçi haberi.
- **Görünürlük:** `lobby_kingdoms` → `navy` (gemi sayısı başkalarına çifte yuvarlı) ve `blockade`; haritada demirli gemiler, sefere çıkıp dönen ticaret gemisi, açıkta gezen av/balık filoları, hedef iskelenin önünde ablukacı kadırgalar. Harita uyarısı, sayaçlar, günlük, "Sen yokken" askeri sayfası.

### 11.2 Taç siparişleri (CLAUDE.md §7.8)

Her taç saatte bir mal siparişi verir (240–960 birim); lord deposundan teslim eder, olağan fiyatın +%25'ini alır (kendi tacı +%20 daha), taç ilişkisi +3 / +1,5. Saatte taç başına bir kez. Ambarı taşan lordun fazlası (E1) için bir çıkış.

### 11.3 Ticaret dengesinin kaydırılması

Deniz ticareti yeni bir gelir kanalı olduğu için kara ticareti hafifletildi: taç şehrine tüccar yükü 3× → **2×**, fiyat +%10 → **+%5**, şehir satışları artık lobi fiyatını **yarı oranda** düşürüyor (B1 büyük ölçüde giderildi). Deniz ticareti de fiyatı yarı oranda düşürdüğü için çok satıcılı lobide kendini sınırlıyor.

> **Not:** Bu tur sırasında depoda eşzamanlı başka bir çalışma oldu: son 4 commit (`36c3c14`…`162980c`) benim yarım kalmış deniz kodumu da içeriyor; ayrıca commit edilmemiş bir **mal yeniden ölçeklemesi** var (taban fiyatlar ÷3, tüccar yükü ×4, `goods_rescale.sql`, `market/military/society/time/towns.json`, `daylight.ts`). Bunlara dokunmadım. Gemi yüklerini (×4: kadırga 24, koka 80, çektiri 40) ve sipariş miktarlarını (×4) bu ölçeğe uydurdum; §4'teki ekonomi rakamları ölçekleme **öncesine** aittir.

### 11.4 Canlı test (lokal sunucu, 2 hesap)

```
gemi siparişi: kadırga×3, koka×2 ✅ · geçersiz tür 'rejected' ✅ · kızak dolu 'queue' ✅
filo çıkar ✅ · fazla gemi 'ships' ✅ · ticaret görevi ✅ · geçersiz mal 'good' ✅
abluka (savaşta) ✅ · uzaktaki filoyu bölme 'away' ✅ · korsan avı ✅ · kıyı akını ✅
lobby_kingdoms navy: başkası için çifte yuvarlı ✅
settle → abluka: 3 kadırga vs 1 koka, kazandı, hedefte blockade ✅
       → akın: kadırga+koka vs 2 koka, kazandı, 6 savaş malz. ganimet (yük sınırı) ✅
ablukadayken ticaret 'blockaded' ✅ · ablukayı yarma 1 vs 3: kaybetti, abluka sürdü ✅
geri çağırma → abluka kalktı ✅ · ganimet dönüşte depoya girdi (1460 → 1466) ✅
taç siparişi: iki taç teslim ✅ · aynı saatte tekrar 'done' ✅ · geçersiz taç 'crown' ✅
```

Bulunan ve düzeltilen: denizdeki ticaret filosu iskeleyi savunuyor sayılıyordu (akında koka'sı battı) → artık yalnız liman, bekleyen, balık ve av filoları savunur. Korsan avı gemi sayısıyla doğrusal büyüyordu (4 kadırga ≈ saatte 4.600 altın) → tavanlı yapıldı.

**Açık kalanlar:** deniz muharebeleri savaş puanına (`warScore`) henüz girmiyor; filolar haritada gerçek su yolu izlemiyor (iskeleden açığa çıkıp gözden kaybolur); deniz olayları için özel olay çizimi yok.

## 12. Öncelik sırası (öneri)

1. **Güvenlik/bütünlük:** Y1 (asker çoğaltma) → S1/Y5 → L1 → A1 (`seen`) → D1/A2 (haraç basma) → S3/S4/S5 → `reset` (S2/N2/Y9).
2. **Savaş zinciri:** W1 + H3 + W8 + A6 (boş saray çiftçiliği) → W7 (insan gücü) → W9 (kasaba) → W2/W3.
3. **Ekonomi:** E5 (içerik hızı) → B1 (şehir ticareti) → E1 (boşa giden üretim; deniz ticareti ile birlikte) → E2/D5 (ağır vergi) → E3/E4/R4/R5 (taç sistemi).
4. **İlişki:** R1 (kaçırma döngüsü) → R3 (1 altınlık haraç) → R2 (kalıcı yağma hasarı) → R9/R10.
5. **Hanedan:** H2 (kalıcı naiplik) → H6.
