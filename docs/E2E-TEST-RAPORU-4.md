# Uçtan Uca Test Raporu — Tur 4

> **Tarih:** 2026-10-15 · **Taban:** `54dc335` (önceki rapor: `docs/E2E-TEST-RAPORU.md`, `6e945bb`) · **Test eden:** Claude (Opus 5.5)
> **Kapsam:** CLAUDE.md baştan sona okundu; son iki commit (`8c9c984` donanma + mal ölçeklemesi, `54dc335` nüfus artışı, yemek talebi, kuşatma göçü, aşırı büyüme, alt sekmeler, bina panelleri) ve bu turda eklenenler test edildi.
> **Yöntem:** lokal Supabase (Docker, bütün migration'lar) + lokal Edge Functions + Vite istemcisi; tarayıcıda headless Chromium (Playwright); iki test hesabıyla sunucu komutları; gerçek `advance` fonksiyonuyla bot ve denge simülasyonları; iki statik denetim (sunucu/güvenlik, nüfus-ekonomi dengesi).
> **Canlıya alınmadı, commit yapılmadı.**

---

## 0. Özet

- **Kritik hata bulundu ve düzeltildi:** yeni nüfus sisteminde **açlık ölüm sarmalı**. Yemeği biten lordluk göçle 0 köylüye iniyor, tarlada çalışan kalmadığı için yemek hiç gelmiyor, lordluk **kalıcı olarak ölüyordu** (bot simülasyonunda 30 dakikada bir giren oyuncuda 8 haritanın 2'sinde). Düzeltme: sarayın hizmetlileri göç etmez ve geri gelir; açlıkta köylüler önce yemek üreten yapılara koşar.
- **4. seviye saraya ulaşma** (istediğin denge): değişikliklerden önce 8,6 sa (aktif); `54dc335`'te **10,2 sa**; bu turdaki ayarla **7,95 sa** (12 harita, medyan). Asıl sebep kara ticaretinin kısılması değil (etkisi ~1 sa), mal ölçeklemesinin geliri düşürmesiydi (birim üretimin altın değeri ×0,13).
- **Tersane artık 4. seviye saray istiyor.**
- **İstediğin yeni özellikler eklendi ve test edildi:** sipariş kartları (taşma düzeltildi), **seferli taç siparişleri**, **cephanelik sınırı**, **"Üretim ağı tıkandı"** (harita uyarısı, binanın üstünde ünlem levhası, bina menüsünde açıklama kutusu), uyarıların alt alta dizilmesi.
- Sunucu denetiminde kendi kodumda 3 hata (Z1 sipariş arbitrajı, Z2 çifte abluka, Z5 sonucu görüp geri çağırma) bulundu ve düzeltildi. Denge denetiminde donanma tayfasının yemek hatası (N5) ve korsan batmaları (N3) düzeltildi.
- **Açık kalan önemli sorunlar** (§5): ucuz kuşatma tacizi (P1), ağır verginin nüfusta bedelsiz olması (P2), 4+ kasabada sonsuz ayaklanma kanaması (T3), mal kasabalarının değersizliği (T1), taç şehri ticaretinin hâlâ baskın olması (N1), önceki turdan Y1/S1/A1/D1.

---

## 1. Yeni özelliklerin testi (`8c9c984`, `54dc335`)

| Özellik | Sonuç | Kanıt |
| --- | --- | --- |
| Migration'lar (navy, goods_rescale, bu turun goods_reprice) | ✅ temiz | lokal `migration up` |
| Nüfus artışı (ev yer verir, halk tur tur gelir) | ✅ / ⚠️ | Halk → Nüfus paneli: "61 / 72 köylü, +0,10/tur ≈ +10,4/saat, doluma 21 dk", çarpanlar (mutluluk ×0,64, hastalık ×0,99, kraliçe ×1,10, tapınak ×1,05). **Açlık ölüm sarmalı vardı → düzeltildi (§2.1).** |
| Asker/tayfa nüfustan düşer, terhis geri verir | ✅ | denetim P5 (W7 düzeldi: ölen askerin yeri barışta 11 dk'da dolar) |
| Dünya nüfusu yemeği pahalandırır | ✅ | 9 kişilik lobide geç oyunda +%19–22, 18 kişide +%30 tavanı; tek lord en çok %2,6 oynatabilir (istismar yok) |
| Kuşatma halkı kaçırır (kuşatma başına bir kez) | ✅ / ⚠️ | `siegeBegun` CAS doğru; ama 1 askerlik kuşatma da %4 kaçırıyor (P1) |
| Aşırı büyüme (2/3/4+ kasaba), kasaba panelinde grafikler, sağda uyarı | ✅ / ⚠️ | CLAUDE.md tablosu kodla birebir; "~38 dk" ve "Az bakımda ~67 dk" doğrulandı; 4+ kasabada sonsuz ayaklanma ve bakım kanaması (T3) |
| Alt sekmeler (Halk, Ticaret, Depo, Ordu, Diplomasi) | ✅ | tarayıcıda hepsi açıldı, konsol hatası yok |
| Hapishane, eğlence merkezi, casus evi, hazine panelleri | ✅ (kod) | panel bileşenleri derleniyor; hapishane/casus evi seed'li lordda var. Eğlence merkezi 4. seviye ister, canlı açılmadı |
| Donanma (önceki tur) | ✅ | yeniden derlendi; navysim ve sunucu yolları geçiyor |

---

## 2. Bu turda yapılanlar

### 2.1 Düzeltilen hatalar

| # | Ciddiyet | Ne | Düzeltme |
| --- | --- | --- | --- |
| K1 | **KRİTİK** | Açlık ölüm sarmalı: yemek biter → göç → 0 köylü → tarla çalışmaz → kalıcı ölüm (`growthTerms`, `economy.ts:688`) | **Sarayın hizmetlileri** (saray seviyesine göre 4–8) göçle gitmez; altına düşülmüşse aç da olsa tur başına 0,08 kişi geri gelir (`society.json` → `growth.palaceFloor`). **Açlıkta yemek önce:** ambarda yemek yokken sağlıklı köylüler önce tarla/iskele/balıkçıya dağılır (`staffing`, `foodPace`). Sonuç: 8/8 harita kurtuldu. |
| Z1 | ORTA | Taç siparişinde garanti arbitraj (pazardan dipte al, olağan fiyat ×1,25'e teslim et) | Ödeme **lobinin o anki fiyatı** × 1,25 (`orderPay`) |
| Z2 | ORTA | Aynı tick'te iki abluka: ikincisi birincinin üstüne yazıyor, ilk filo sonsuza takılıyor | Geç gelen filo savaşı kazansa da ablukayı yazmaz, eve döner, "başka donanma zaten abluka ediyor" haberi |
| Z5 | DÜŞÜK | Varmış akını sonucu belli olunca tick'ten önce geri çağırmak | Varmış, işlenmemiş akın/abluka geri çağrılamaz (`'engaged'`; düğme pasif) |
| N5 | YÜKSEK | Denizci yemeği 0,25'te kalmış (köylü 0,1) → balık avı net zarar | `upkeepFoodPerCrew` 0,1 |
| N3 | YÜKSEK | Eskortlu batma (0,35) eskortsuzdan (0,25) yüksek; 8 saatte 8 kokanın 6'sı batıyordu | saldırı %16 → %12, batma eskortlu %15 / eskortsuz %20 |
| L4 | DÜŞÜK | "Ambar azalıyor" her dakika yazılıyordu | (önceki tur) 10 dakikada bir |
| L5 | DÜŞÜK | Harita uyarıları "Üsse dön" düğmesinin üstüne biniyordu | Uyarı sütunu üst çubuğun altından başlar, düğmelerin **solunda** durur, alt alta dizilir, sığmazsa kendi içinde kayar. Tarayıcıda ölçüldü: 4 kart 96–352 px, düğmeler x ≥ 1228, çakışma yok |

### 2.2 4. seviye saray dengesi (istediğin)

Bot simülasyonu: kuruluştan itibaren makul oynayan lord (ev/tarla/oduncu/atölye kurar, biat eder, kraliçe alır, en fazla fazlası olan malı satar, kâr ederse taç şehrine gönderir, sarayı yükseltir). 12 harita, medyan saat:

| Ayar | P2 | P3 | **P4 aktif** | P4 30 dk'da bir giren |
| --- | --- | --- | --- | --- |
| Değişiklik öncesi (`162980c` ekonomi + eski şehir ticareti) | 1,8 | 5,6 | **8,6** | 13,1–14,6 |
| Yalnız şehir ticareti eski hâlinde (bugünkü ekonomiyle) | 2,8 | 7,1 | 9,4–9,7 | 18,1–19,1 |
| `54dc335` | 2,8 | 7,6–8,0 | **10,2–10,7** | 18,1 (2/8 haritada ölüm sarmalı) |
| **Bu tur** (fiyat ×1,5 + saray 3/4 altın 1200/2200 + K1) | 2,3 | 6,0 | **7,95** | 16,1 |

Bulgular:
- **Kara ticaretinin kısılmasının etkisi küçük** (~1 sa): bot şehri yalnızca yakınken seçiyor, çoğu lord zaten lobi pazarına satıyor.
- **Asıl darboğaz altın:** 3. seviyeden sonra malzeme ~30 dk'da hazır, altın ~2,5 saat beklenir. Mal ölçeklemesi (üretim ×0,4, fiyat ÷3) birim üretimin altın değerini ×0,13'e indirmişti (yeni lord savaş malzemesinden saatte 545 → 115 altın).
- **Uygulanan:** taban fiyatlar yemek 0,13→**0,2**, yapı 0,2→**0,3**, savaş 0,27→**0,4**; saray 3. seviye 1500→**1200**, 4. seviye 2600→**2200** altın. Lobilerde saklanan fiyatlar `20261015180000_goods_reprice.sql` ile ×1,5 taşınır (`market.priceRev = 2`; ikinci çalıştırmada dokunmadığı ve diğer anahtarları koruduğu lokal DB'de denendi).
- 30 dakikada bir giren oyuncu için kalan fark (16 vs 13–15 sa) altından değil: yeni nüfus artışı ve inşaat kuyruğunun boşta beklemesinden geliyor.
- **Tersane 4. seviye saray ister.** Deniz ticareti ve taç siparişleri artık 4. seviyeye **ulaştıktan sonra** gelen gelir; 4. seviyeye ulaşmayı onlar hızlandırmıyor, yukarıdaki ayarla eski hız korunuyor.

### 2.3 Yeni özellikler (bu turdaki isteğin)

**Taç siparişleri — kart düzeni ve sefer:**
- Her taç için bir kart: tacın adı, istenen mal ve miktar, ödeme, sefer süresi, kalan süre; düğme kartın altında tam genişlikte (taşma giderildi, ekran görüntüsüyle doğrulandı).
- "Kervanla gönder": mallar hemen çıkar, **kervan** tacın başkentine gider; **ödeme ve ilişki kervan dönünce** gelir. Sefer = tüccarın o şehre gidip dönmesi (`cityTripMs`); ödeme gönderme anındaki lobi fiyatı × 1,25 (+%20 kendi tacı). Yoldaki kervanlar panelde ilerleme çubuğuyla ve sol alttaki sayaçlarda, dönüş günlükte.
- Sunucuda denendi: iki taç (86 sn ve 204 sn kervan), aynı saatte tekrar `done`, geçersiz taç `crown`, 86 sn sonra +242 altın ve defter.

**Cephanelik sınırı:** her silahtan saray seviyesine göre 60/120/200/300/400, her ambar seviyesi +40. Yeri dolan silahı işleyen atölye **durur** (hammadde harcamaz). Depo → Cephanelik "240 / 240", çubuk, "Dolu: atölye durdu".

**"Üretim ağı tıkandı"** (`clogsOf`; silah yeri dolu ya da ürünün ambarı dolu):
- Sağda uyarı kartı (mal/silah başına bir kart; silah kırmızı, ambar sarı; dokununca Depo).
- Haritada tıkanan binanın üstünde sallanan ünlem levhası (silah kırmızı, ambar sarı; her yakınlaştırmada okunur boyda).
- Bina menüsünde "Üretim ağı tıkandı" kutusu: neyin dolduğu, ne kadar boşa gittiği / kaç işçinin boşta olduğu ve çareler (ürünü değiştir, asker eğit / sat / siparişe gönder, ambar kur, işçileri başka yere ver).
- Senin söylemediğin ama eklediğim: tıkanma yalnız silah değil, **ambarı dolu her ham mal** için de (oduncu, tarla, demir dökümü). Depo'da Cephanelik alt sekmesinde dolu olunca kırmızı nokta.

---

## 3. Sunucu / güvenlik (denetim)

**Önceki bulgular:** Y1 (bölme ile asker çoğaltma) ❌ · S1 ⚠️ genişledi (`tick.ts:471` `resolved` koşulsuz; saray düşünce %10 kaçış aynı mutasyonda, savaş çift işlenirse iki kez) · A1 (`seen` ile yokluk cezası) ❌ · D1/A2 (haraçla altın basma) ❌ · R3 (1 altınlık haraç) ❌ · S7 ⚠️ genişledi.

| # | Ciddiyet | Başlık | Kanıt | Durum |
| --- | --- | --- | --- | --- |
| Z1 | ORTA | Taç siparişi arbitrajı | `crowns.ts` | ✅ düzeltildi |
| Z2 | ORTA | İki abluka aynı hedefe | `_shared/navy.ts` | ✅ düzeltildi |
| Z3 | DÜŞÜK-ORTA | `foodDemand` yazımı pazar yazımlarıyla yarışıyor (S7) | `server.ts:231-241` vs `92-98` | açık — öneri: yalnız `foodDemand`'ı `jsonb_set` eden RPC ya da pazar için `version` CAS |
| Z4 | DÜŞÜK | Deniz çatışması atomik değil (3 ayrı yazım; `refuse('conflict')` tick'in geri kalanını durdurur) | `_shared/navy.ts` | açık — tick içinde try/catch, kayıp+ganimeti tek RPC'ye |
| Z5 | DÜŞÜK | Varmış akını geri çağırma | `navy.ts` | ✅ düzeltildi |
| Z6 | DÜŞÜK | `syncWarFlags` çakışırsa savaş ilanı/barış yarıda kalır | `command/index.ts:640`, `diplomacy.ts:111` | açık — yut, tick zaten düzeltiyor |
| Z7 | DÜŞÜK | Tick maliyeti: lobi başına ~8 `loadKingdoms`, `tick_due` biatlı tek lordla hep açık | `tick.ts:116-121` | açık |
| Z8 | DÜŞÜK | `goods_rescale.sql` idempotent değil, null'a dayanıksız | migration | açık (yeni `goods_reprice.sql` bu hatalardan arındırıldı) |
| Z9 | BİLGİ | Başkalarının gemi sayısı 2'ye yuvarlı (neredeyse kesin) | `navy.sql` | tasarım kararı |

**Doğru bulunanlar:** deniz çatışmasının sahiplenmesi her denemede sıfırlanıyor, çift uygulama yok · ganimet hedefin o anki deposundan · kuşatma kaçışı kuşatma başına bir kez · yeni komutların girdi doğrulaması · asker ve tayfa nüfustan düşüyor, nüfus şişirilemiyor · eski kayıtlar dolu başlıyor · `atWar` istemciden yazılamaz · navy migration güvenli.

---

## 4. Denge (denetim, simülasyonlar)

### 4.1 Altın/saat (yapı malzemesi satan lord; `54dc335`, fiyat değişikliğinden **önce**)

| Arketip | Çevrimiçi (şimdi / ölçekleme öncesi) | Çevrimdışı 8 sa |
| --- | --- | --- |
| Yeni lord (saray 1, ticaret 1) | 375 / 638 | 221 / 328 |
| Orta lord (saray 3, ticaret 2) | 1009 / 1109 | 636 / 657 |
| Gelişmiş (saray 5, ticaret 3) | 1579 / 1627 | 1003 / 948 |

Fiyat ×1,5 ile tüccar geliri yaklaşık ×1,5 olur: yeni lord ~560, gelişmiş ~2.000+ (CLAUDE.md hedefi 2.000–2.500'e yaklaşır). Ayrı bir arketip simülasyonuyla doğrulanması önerilir.

### 4.2 Bulgular

| # | Etki | Başlık | Hesap | Öneri | Durum |
| --- | --- | --- | --- | --- | --- |
| P1 | **YÜKSEK** | Ucuz kuşatma tacizi | 1 askerlik kuşatma (~1 mızrakçı kaybı) %4 halkı kaçırır; 3 dk'da bir → nüfus −%38, vergi −%36 | `growth.siege.minAttackers: 10`, lord başına kaçış beklemesi 900 sn, `startShare` 0,02 | açık |
| P2 | **YÜKSEK** | Ağır vergi nüfusta bedelsiz | göç ancak mutluluk <25'te; ağır vergide hedef 47 → büyüme ×0,6, kayıp yok; saray 5'te vergi 864 → 2.419/sa | büyüme eğrisinin sıfırını 25 → 45 | açık |
| P3 | ORTA | Göç ve açlık sert | mutluluk 0'da saatte %51, açlıkta %35 | `leaveSharePerRound` 0,001, `starving` −0,3 | K1 ile sarmal kapandı; oranlar açık |
| P4 | DÜŞÜK | Erken oyun | 4→24 köylü ~30 dk; ilk saat −%16 altın | — | kabul |
| F1 | **YÜKSEK** | Mal ölçeklemesi geliri düşürdü | yeni lord savaş malzemesi 545 → 115/sa | fiyatlar 0,2/0,3/0,4 | ✅ uygulandı |
| F2 | DÜŞÜK | Yemek talebi eşikleri lobi boyuna bağlı değil | 9 kişide +%19–22 | `fromPeople` = 25×oyuncu, `toPeople` = 110×oyuncu | açık |
| F3 | DÜŞÜK | Sipariş yemek talebini görmüyordu | | `priceAt` ile | ✅ |
| N1 | **YÜKSEK** | Taç şehrine kara ticareti hâlâ baskın | gelişmiş 790 → 1.277/sa; kâhyalık +%25 ve sefer başı +1,2 ilişki | `marketImpact` 0,8, `priceFactor` 1,0, `cityTrip` 0,4 | açık — 4. seviye hızına etkisi küçük olduğu için dokunmadım; karar senin |
| N2 | ORTA | Taç siparişleri değerli | saatte ~333 altın (yalnız çevrimiçi) | Z1 ve sefer süresiyle azaldı | ⚠️ |
| N3, N5 | YÜKSEK | Korsan batmaları, tayfa yemeği | | | ✅ |
| N4 | ORTA | Deniz ticareti gelişmiş lorda +450/sa, 2–4 saatte geri öder | | | kabul (artık 4. seviyede) |
| T1 | **YÜKSEK** | Mal kasabaları değersiz | sadakat 50: yemek 94/sa, yapı 115, savaş 136; Az bakım 108 | eski miktarlar (5 / 4 / 3,5) ya da bakımı düşür | ⚠️ fiyat ×1,5 kısmen iyileştirir |
| T2 | ORTA | Basamaklar istenen eğride değil | 1 kasaba +382, 2 +530, 3 +30 (marjinal −500), 4 −1.831/sa | 2. basamak bakım ×1,1, 3. ×1,3, sadakat −15 | açık |
| T3 | **YÜKSEK** | 4+ kasabada sonsuz ayaklanma | sadakat tavanı 15 > kopma 12; ayaklanan kasabalara ×2 bakım ödeniyor (Orta: −1.940/sa) | tavan 10 ya da ayaklanan kasabaya bakım ödenmesin | açık |
| T4 | DÜŞÜK | Aşırı büyümenin mutluluk cezası vergiye dokunmuyor | | P2 ile | açık |
| A1 | ORTA | Çevrimdışı / çevrimiçi oranı %59–64 | | | kabul |

### 4.3 Simülasyon dökümü
- Nüfus doldurma (saray 5, yarı doludan): %60 mutlulukta 57 dk, %75'te 46 dk, savaşta 93–113 dk, %30'da 331 dk — CLAUDE.md §5.2 ile uyumlu.
- Seferli sipariş: 360 yapı malzemesi → 170 altın, 239 sn kervan (simülasyon); sunucuda 520 → 242 altın, 86 sn.
- Cephanelik: kalkan 195 → 200'de durdu, sonrasında atölye hammadde harcamadı.

---

## 5. CLAUDE.md ile kod uyuşmazlıkları (baştan okuma)

- §8.4 "kalabalık kasaba **+14 köylü**": artık yalnızca yer veriyor; ayaklanmada 14 kişi anında gider, sonra yeniden büyümesi gerekir.
- §9.7 "**Altın dengesi**" hedefi (gelişmiş 2.000–2.500, yeni ~700): fiyat değişikliğinden önce tutmuyordu (1.579 / 375); yeniden ölçülmeli.
- §5.3 örnek süreler (Ev 1–2 saat vb.) prototipteki saniyelik sürelerle çelişiyor (bilinen taslak).
- §2'deki gece saatleri (23:00–03:00) ile §9.7 tutarlı.
- Bu turda güncellenenler: §5.2 (sarayın hizmetlileri, açlıkta yemek önce), §6.4 (cephanelik sınırı, üretim ağı tıkandı, uyarı sütunu), §7.8 (seferli siparişler, lobi fiyatına bağlı ödeme), §8.5 (tersane 4. seviye, tayfa yemeği, korsan oranları), §9.7–9.8 (fiyatlar, saray maliyetleri, 4. seviye süresi).

---

## 6. Öncelik sırası (öneri)

1. **Bütünlük:** Y1 (asker çoğaltma) → S1 (savaşın çift işlenmesi; artık kaçışı da çiftler) → A1 (`seen`) → D1/A2 (haraç basma).
2. **Nüfus/savaş:** P1 (ucuz kuşatma tacizi) → P2 (ağır vergi) → T3 (4+ kasaba kanaması) → T1/T2.
3. **Ticaret:** N1 (şehir ticareti; senin kararın) → F2.
4. **Altyapı:** Z3, Z4, Z6, Z7, Z8.

---

## 7. Test günlüğü

```
CLAUDE.md 2.358 satır okundu
2 denetim ajanı (sunucu 8c9c984+54dc335; nüfus/ekonomi dengesi) paralel
pace.ts bot simülasyonu: varyantlar now / oldCity / lobbyOnly / OLD_ECON, aktif ve 30 dk'da bir
  → 2/8 haritada açlık ölüm sarmalı bulundu → palaceFloor + açlıkta yemek önce → 8/8
  → darboğaz altın; fiyat ×1,5 + saray 1200/2200 → P4 7,95 sa
navy.json: tayfa yemeği 0,1, korsan %12, batma %15/%20; tersane 4. seviye
Z1, Z2, Z5 düzeltildi
Yeni: seferli taç siparişleri, cephanelik sınırı, üretim ağı tıkandı (uyarı + ünlem + menü), sipariş kartları, uyarı sütunu
t4.ts: cephanelik 200'de durdu, hammadde harcanmadı; sipariş kervanı 239 sn sonra 170 altın
lokal Supabase (yeniden kuruldu), goods_reprice.sql tek sefer + anahtarları koruyor
headless Chromium: giriş, lobi, 4 uyarı alt alta (96–352 px, düğmelerle çakışma yok), Siparişler kartları,
  Cephanelik 240/240, Nüfus paneli, İnşa → 4. sv'de Tersane, atölye menüsünde tıkanma kutusu, haritada ünlem levhası; konsol hatası yok
sunucu: order ×2 (86 sn / 204 sn kervan), tekrar 'done', geçersiz 'crown', dönüşte +242 altın
typecheck ✅, build ✅
```

---

## 8. Ek: canlıya alma öncesi düzeltmeler (aynı gün)

| # | Sorun | Düzeltme | Doğrulama (lokal sunucu, Deno) |
| --- | --- | --- | --- |
| P1 | 1 askerlik kuşatma halkın %4'ünü kaçırıyordu | Kaçış için en az 10 kuşatan; lord başına 15 dakikada bir; başlangıç payı %3; saray düşüşündeki %10 da en az 10 sağ kalan ister | 1 asker: 60 → 60; 12 asker: 60 → 58; hemen ikinci 12'lik kuşatma: 58 → 58 |
| P2 | Ağır vergi nüfusta bedelsiz | Büyüme eğrisinin sıfırı %25 → %40 (55 → 0,7) | kraliçeli: normal ×1,14, yüksek ×0,87, ağır ×0,31 (önce ×0,60); kraliçesiz erken lordda yüksek ×−0,06, ağır ×−0,56 |
| T1 | Mal kasabaları değersiz | yemek 2 → 5, yapı 1,6 → 4, savaş 1,4 → 3,5 / tur | yemek kasabası (Az bakım) −14 → +126/sa |
| T2 | 3 kasaba düpedüz zarar | 2. basamak bakım ×1,1, katkı ×1; 3. basamak sadakat −20, bakım ×1,4, katkı ×0,85 | altın kasabaları, Orta: 1 → +382, 2 → +667, 3 → +319/sa |
| T3 | 4+ kasabada sonsuz ayaklanma, saatte ~1.900 altın bakım | 4+ basamakta sadakat tavanı 15 → 10 (kopma 12'nin altı); ayaklanan kasabaya bakım ödenmez | 4 kasaba: −1.831 → −695/sa, hepsi kopuyor |
| N1 | Taç şehri lobi pazarından %60 kârlı | `priceFactor` 1,0, `marketImpact` 0,8, sefer başına taç ilişkisi 1,2 → 0,4; taç ilişkisinin geri dönüşü tur başına 0,12 → 0,03 | gelişmiş lord yapı malzemesi: lobi 1.184, şehir 1.413–1.423/sa (+%19–20); yakın lordun ilişkisi 100'e, ~250 karo uzaktakinin 25'e çıkıyor |
| Y1 | Aynı anda iki bölme emriyle asker çoğaltma | Bölme, birleşme ve kasaba kuşatma kaybı ordu satırını asker sayısı üzerinde CAS ile yazar; muharebedeki ordu bölünmez; birleşme önce birleşeni siler, öbürü yazılamazsa geri koyar | aynı anda iki "5 asker böl": biri `ok`, öbürü `soldiers`; ordular 15 + 5 = 20 |
| S1 | Aynı savaş iki kez işlenebiliyordu (kaçış da iki kez) | `finishBattle` önce `resolved` alanını false → true CAS ile sahiplenir, raporu sonra yazar | kod incelemesi; 10× eşzamanlı settle önceki turda sorunsuz |
| A1 | Açık sekme yokluk cezasını tamamen kaldırıyordu | "Buradayım" (`seen`) yalnızca son gerçek komuttan sonraki 40 dakikaya kadar görülmeyi uzatır (`presenceAt`, `lastActedAt`); elçi/ordu/oyun gibi dış komutlar da görülme sayılır | 2 saat önce son komut + şimdi `seen` → son görülme 80 dk önce; gerçek komutla 0 sn |
| D1/A2 | Boş kasadan haraç yoktan altın basıyordu | Haraç akışı sunucuda (`settleTributes`, `pacts.paid_at`): ödeyenden ne kadar çıkarsa alana o kadar geçer | boş kasalı ödeyen: alan +0; ödeyebilen: 6 tur × 4 = +24 |

Yeni migration: `20261015190000_tribute_settled.sql` (`pacts.paid_at`, tick haraç varken de çalışır).
4. seviye saray (bot, 12 harita): aktif 7,91 sa, 30 dakikada bir giren 16,1 sa — değişmedi.
