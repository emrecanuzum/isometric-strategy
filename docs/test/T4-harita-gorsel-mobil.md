# T4 — Harita, görseller, kontroller, mobil ve performans

> **Tarih:** 2026-10-16 · **Test eden:** Claude (Opus 5.5, T4) · **Ortam:** yerel Supabase + yerel Edge Functions + Vite (5180)
> **Hesap / lobi:** `t4tester@example.com` (T4tester), lobi **T4 Harita** (tohum 133492178), lordluk "Bakırkent Hanedanı" (id 8).
> **Yöntem:** kendi Playwright kurulumum (`/private/tmp/claude-501/qa4`, Chromium, ANGLE Metal / Apple M2), 1440×900, 1024×768, 768×1024 ve 390×844 (dokunmatik, DPR 2) görünümlerinde betiklerle gezinme, ~150 ekran görüntüsü (bölge bölge büyütülerek incelendi), rAF ile FPS, CDP `Performance.getMetrics` ile CPU/yığın ölçümü.
> **Test verisi:** Durumu yerel DB'de ileri sardım: saray 5, her yapı türü 1–3. seviyede (61 yapı: ev, tarla, oduncu, atölye, ambar, pazar, kışla, casus evi, üniversite, hastane, tapınak, hazine, eğlence merkezi, hapishane, hisar, anıt, lonca, gözcü kuleleri, balıkçı kulübesi, tersane, iskele, 13 sur + kapı + yıkık sur, 10 karo yol), 60 askerlik ordu; orduya köprüden geçen bir rota DB'den verildi. Saat görselleri için istemcinin `server_now` cevabı kaydırıldı (gece/şafak/öğle/akşam).

**Önemli not (ortam):** Test boyunca makinenin yük ortalaması 70–220 arasındaydı (8 çekirdek; 4 test eden, birkaçı SwiftShader ile). Edge Functions sık sık 546 `WORKER_LIMIT`, 504 ve 500 döndü. Bu yüzden FPS sayıları **gerçek oyuncu donanımını temsil etmez**; göreli karşılaştırma olarak okunmalı.

---

## 1. Özet

- Harita görsel olarak çok güçlü: biyom geçişleri, nehirler, taş köprüler, taç başkenti (iç kale + dış şehir + liman + kadırga + ordu karargâhı), gece ışıkları ve parıltı, yeni modellenmiş bütün lord yapıları ve seviyeleri sorunsuz çizildi. Konsolda istemci kaynaklı hata görülmedi (bir kez kaynağı bulunamayan `pageerror: Object`).
- **Düzeltilen 9 sorun** (§3): biri ciddi (sunucu yoğunken oyuncunun oturumu kapanıyordu), diğerleri metin, okunabilirlik, çakışma ve kısayol sorunları.
- **Açık kalanlar** (§4): yerelde lobi açarken worker sınırı yüzünden yarım kalan lobiler, modal yağmuru, telefonda takip şeridinin küçük haritayı örtmesi, birkaç küçük görsel not.

---

## 2. Test edilenler

| Alan | Sonuç | Not |
| --- | --- | --- |
| Giriş, hesap açma, lobi tarayıcısı | ✅ | |
| Lobi açma | ⚠️ | Yerelde 546 `WORKER_LIMIT` ile düştü, lobi satırı **dünyasız** kaldı (§4 A1). Dünyayı elle ekledim. |
| Yer seçme kartları, kuruluş | ✅ | 3 kart, çubuklar, arsa uzaklıkları okunaklı |
| Yükleme perdesi | ✅ | Kamera krallığa gidene kadar bekliyor |
| Yakınlaştırma ⅛×…3× (tekerlek ve +/−) | ✅ | Her kademede ağaç, kaya, han, bina çiziliyor; yürüyen/hayvan ½× altında gizli |
| Kamera sınırları | ✅ | Dağ halkasının dışına çıkılmıyor |
| Arazi, biyom geçişleri, kayalıklar, ağaç türleri, çiçekli ağaçlar | ✅ | Dither/leke geçişleri güzel; kayada ağaç yok |
| Nehir, göl, kumsal, sazlık | ✅ | |
| Taş köprü, ahşap köprü | ✅ | Kemerler, güverte; ordu güvertenin üstünden geçti (§2.1) |
| Ticaret yolları, patikalar, oyuncu yolu | ✅ | Patikalar dalgalı; oyuncunun yaptığı 10 karoluk yol yuvarlak uçlu bir şerit (⚠️ ormanda biraz yapay duruyor) |
| Hayvanlar, kuşlar, bulutlar | ✅ | ¼×'te stratus bulutları basamaklı kenarlı (bilinçli piksel stili, ama lordluğun üstüne düşünce sis gibi duruyor) |
| Taç başkenti (Kervankale): iç sur, dış şehir, liman, kadırga, karargâh, ad | ✅ | Hover çerçevesi bütün alanı (dış sur dahil) çiziyor |
| Kasabalar, hanlar (adlar) | ✅ | Haritada ve dünya haritasında görünüyor |
| Lord yapıları (tüm türler, 1–3. seviye, saray 5) | ✅ | Ambar (kırmızı ahır), hisar, tapınak kubbesi, kışla avlusu, pazar tenteleri, eğlence merkezi; atölyede ocak ateşi, oduncuda işçiler, tarla ürünleri, duman |
| Gölgeler gün boyunca | ✅ | Öğlen kısa ve koyu, akşam uzun ve sağ alta; akşamda bina gölgeleri çok soluk (⚠️ tasarıma uygun ama zor seçiliyor) |
| Gece ışıkları ve parıltı | ✅ | Pencereler, saray, hisar yanıyor; harita okunur |
| Mevsim arayüzde (saat kartı) | ✅ / düzeltildi | "1 dk sonra i̇lkbahar" (bozuk İ) düzeltildi (§3 D2) |
| Hover dış hattı ve etiketi | ✅ | Etiket panellerin altında kalmıyor. ⚠️ Uzak yakınlaştırmada saray etiketi lordluğun büyük adının üstüne biniyor |
| İnşa önizlemesi (yeşil/kırmızı), sürükleyerek ev sırası, plan çubuğu | ✅ / düzeltildi | Plan metnindeki sarkan "·" düzeltildi (§3 D6) |
| Yıkım modu (kırmızı silüet), taşıma modu (mavi silüet, yarı saydam bina) | ✅ | |
| Bina menüsü (Ambar Sv.3) | ✅ | |
| Ordu çıkarma, seçme (Göster), takip et | ✅ / düzeltildi | Takip şeridi menünün son sekmelerini örtüyordu (§3 D7) |
| Ordunun köprüden geçişi | ✅ | Bölük güvertenin üstünde, mancınık arkadan geliyor, varışta sarı halka |
| Sağ tık: tarayıcı menüsü açılmıyor | ✅ | `contextmenu` engelleniyor; sağ tık seçili orduya emir |
| Küçük harita ve köşe düğmeleri, M / H / Tab / P | ✅ / düzeltildi | Dünya haritası Esc ile kapanmıyordu (§3 D5). Fotoğraf modu güzel (köşede ad + tarih) |
| Dünya haritası | ✅ | Biyomlar, yollar, nehirler, hanlar, başkentler, lord adı |
| Köşe (hamburger) menüsü | ✅ | |
| Uyarılar sütunu | ✅ | "Ambar dolu…" kartı; sağ kenarda, ayar düğmesinin altında |
| Telefon 390×844 (8 sekme tek tek) | ✅ | Yatay taşma yok, hiçbir düğme ekran dışında değil, sekme içi taşma yok |
| Orta 1024×768, tablet 768×1024 | ✅ | Yatay taşma yok |
| Sesler | ✅ | Hata atan ses çağrısı görülmedi (duyulamadı) |
| Hanedan, olay, haraç, kraliyet isteği pencereleri | ✅ | Çizimler güzel; başlıktaki taç adı okunmuyordu (§3 D3) |

### 2.1 Köprü geçişi
DB'den verilen rota (saray → 170,457 taş köprü → karşı yaka) boyunca 9 sn'de bir görüntü alındı: bölük kıyıda yürüyor, köprüde güvertenin üstüne çıkıyor (suyun hizasında değil), kemerlerin üstünden geçip öbür yakada iniyor. Mancınık arkadan aynı yolu izliyor. Sorun görülmedi.

---

## 3. Bulunan ve düzeltilen sorunlar

| # | Önem | Sorun | Düzeltme (yer) |
| --- | --- | --- | --- |
| D1 | **Yüksek** | Sunucu yoğunken (auth sunucusuna ulaşılamayınca) `command` fonksiyonu **401** dönüyordu; istemci 401'de oturumu kapattığı için oyuncu testte iki kez giriş ekranına atıldı. Canlıda bir yoğunluk anında herkes çıkış yapabilir. | `supabase/functions/command/index.ts`: `getUser` hatası 4xx değilse (ağ/5xx) **503** `busy` döner; yalnızca reddedilen jeton 401 olur. |
| D2 | Orta | Saat kartında "1 dk sonra **i̇lkbahar**" (`'İlkbahar'.toLowerCase()` → noktalı i + birleşik nokta). | `ui/hud/TopBar.tsx`: `toLocaleLowerCase('tr')`. |
| D3 | Orta | Kraliyet elçisi penceresinin başlığında tacın adı tacın renginde (kızıl/lacivert) **yeşil şerit üstünde** yazıyordu: okunmuyordu. | `ui/hud/RoyalRequests.tsx`: ad krem renkte, yanında tacın renginde küçük bir kare. |
| D4 | Düşük | Görevler kartında "Kraliyet isteği" ve görev başlıkları koyu kızıl/lacivertle koyu panelde zor okunuyordu. | `game/cities.ts`: `CityInfo.ink` (açık tonlar `CROWN_INKS`); `RoyalRequests.tsx` bunları kullanıyor. Diğer yerler (cities.tsx, CrownIntro…) hâlâ `color` kullanıyor (§4 A6). |
| D5 | Orta | Dünya haritası **Esc ile kapanmıyordu**; M ile açıp Esc'ye basınca harita açık kalıyor, sonraki kısayollar haritanın arkasında çalışıyordu. | `game/WorldMap.tsx`: Esc `onClose`. CLAUDE.md §11'e yazıldı. |
| D6 | Düşük | Plan çubuğunda "Plan" başlığından sonra "**· 4 ev kurulacak**" ayrı satıra düşüp başında sarkan nokta kalıyordu. | `ui/hud/PlanBar.tsx`: başlık ve metin tek satır (span). |
| D7 | Orta | Ortadaki alt şeritler (ordu takibi, hedef seçme, filo seyri) masaüstünde **menünün Diplomasi ve Günlük sekmelerini örtüyordu** (1440'ta x 470–975, menü 12–584). Bekleyen plan çubuğu da menüye 8 px biniyordu. | `index.css`: menü görünürken (`.dock ~ .placing`) şerit menünün üstüne çıkar, plan onun da üstüne; telefonda da menünün üstünde durur. Yerleştirirken menü gizli olduğu için davranış değişmedi. CLAUDE.md §11'e yazıldı. |
| D8 | Düşük | Arsa etiketleri ("Ticaret alanı", "İskele alanı") ve haritada uçan sayılar ("+7 altın") `system-ui` yazı tipiyle çiziliyordu; arayüzün piksel yazısıyla uyumsuzdu. | `game/createWorld.ts`: `'Digits', 'Pixelify Sans'` (rakamlar Tiny5). |
| D9 | Düşük | Taç başkentinin karosunun üstündeki bilgi etiketi "**Serbest şehir** · inşa edilemez" diyordu; şehirler artık taç başkenti (§7.8). | `App.tsx`: "Taç başkenti". |

`bun run typecheck` temiz. Paylaşılan kod değişmedi (`fn:bundle` gerekmedi); `command` fonksiyonu yerelde sıcak yüklendi. **Canlıya alınmadı** (commit/deploy yok).

---

## 4. Açık kalan sorunlar

| # | Önem | Sorun | Neden düzeltilmedi / öneri |
| --- | --- | --- | --- |
| A1 | Orta | **Lobi açma yarıda kalabiliyor:** `openLobby` önce `open_lobby` ile satırı yazıp sonra dünyayı yüklüyor; worker CPU/bellek sınırına (546) takılınca `catch` hiç çalışmıyor ve **dünyası olmayan lobi** listede kalıyor (T3'ün iki "T3 Taçlar" lobisi de böyle). Dünya üretimi bun'da ~2 sn CPU sürüyor. | Sunucu akışı, başka test edenlerin alanı. Öneri: dünyayı lobi satırından önce üretip tek RPC'de birlikte yaz; ya da `lobby_worlds` olmayan lobileri listeden gizle / temizle. Canlıdaki Edge CPU sınırını da kontrol et. |
| A2 | Orta (UX) | **Modal yağmuru:** girişte arka arkaya "Sen yokken", haraççı, kraliyet isteği, hanedan doğumu, lobi olayı, kriz seçimi, elçi öğütleri ve öğretici açılıyor; harita kısayolları ve tekerlek bunların arkasında kalıyor. | Tasarım konusu. Öneri: aynı anda tek pencere ve bir sıra göstergesi ("3 haber daha"), acil olmayanları günlüğe/rozete düşür. |
| A3 | Düşük | Telefonda takip/hedef şeridi artık menünün üstünde ama **küçük haritanın alt yarısını ve "−" düğmesini** örtüyor. | Telefonda boş yer yok; menüyü örtmekten iyidir. Öneri: şeridi telefonda tek satıra indirip (yalnız ikon + "Bırak") küçült. |
| A4 | Düşük | Uzak yakınlaştırmada (½× ve altı) saray üstündeki hover etiketi lordluğun büyük adıyla üst üste biniyor. | Öneri: ad gösterilirken hover etiketini adın altına kaydır. |
| A5 | Düşük | Görevler kartında düğmeler bazen iki satıra kırılıyor ("X" üstte, "Teslim et" altta, "ilişki +4" ayrı satırda). | Kart genişliği 320 px; öneri: ödül metnini ayrı satıra al, düğmeleri sağda tek satırda tut. |
| A6 | Düşük | Tacın rengi koyu panellerde başka yerlerde de metin rengi olarak kullanılıyor (`cities.tsx`, `CrownIntro.tsx`, `navy.tsx`). | Başka test edenler bu dosyalarda çalışıyordu; `info.ink` hazır, aynı değişiklik oralara da yapılabilir. |
| A7 | Düşük | Akşam/şafakta bina gölgeleri çok soluk; ağaçların uzun gölgeleri belirgin, binalarınki neredeyse görünmüyor. | Görsel ayar; öneri: akşam bina gölgesinin opaklığını ağaçlarınkine yaklaştır. |
| A8 | Bilgi | Bir kez `pageerror: Object` (fırlatılan Error olmayan bir nesne) görüldü, sonra tekrarlanmadı. | Büyük olasılıkla bir supabase hatasının `throw error` ile yakalanmadan fırlatılması; `unhandledrejection` dinleyicisiyle yeniden denendi, tekrar çıkmadı. |
| A9 | Bilgi | Taç başkentinin üstündeki hover etiketi şehrin büyük adının hemen üstüne biniyor (A4'ün şehir hâli). | A4 ile birlikte. |

---

## 5. Performans

Ölçümler yük ortalaması 70–200 olan bir makinede yapıldı (başka tarayıcılar SwiftShader ile tam CPU kullanıyordu), bu yüzden mutlak FPS düşük çıktı.

| Görünüm (1440×900) | FPS (ort.) | p95 kare | Ana iş parçacığı (sn/sn) | JS yığını |
| --- | --- | --- | --- | --- |
| 1× durağan | 25–37 | 83 ms | 0,37 | 320 MB |
| 1× kaydırma | 24 | 83 ms | 1,1 | 356 MB |
| ½× durağan | 23–34 | 50–100 ms | 1,0–1,8 (yeni parçalar boyanıyor) | 303 MB |
| ¼× durağan | 31–43 | 50 ms | 1,0 | 483 MB |
| ⅛× durağan | 30–49 | 50 ms | 0,96 | 584 MB |
| 2× durağan | 21–33 | 67–100 ms | 0,9 | 233 MB |
| 3× durağan / kaydırma | 38 / 42–49 | 33–67 ms | — | 144–324 MB |
| Telefon 390×844 DPR 2 | ekran görüntüleri akıcı | — | — | — |

- **Bellek:** yığın ⅛×'e inince 584 MB'a çıkıyor (parça önbellekleri), GC sonrası 230–270 MB'a dönüyor; 3 dakikalık kaydırmada sürekli artış (sızıntı) görülmedi. DOM düğümü ~7.700 (HUD için yüksek ama sabit).
- **Darboğaz:** durağan 1×'te ana iş parçacığı yalnızca %37 meşgulken FPS 25–37'de kalıyordu; yük altında sınır GPU/kompozitördeydi. Kod incelemesinde ticker'larda açık bir sıcak nokta bulmadım; dikkat edilecek iki şey: (1) her oyun saatinde (gerçekte ~2,5 dk) bütün parçalar gölge için yeniden boyanıyor, bu sırada ½×'te kısa takılmalar olabilir; (2) ≥1×'te görünen bütün ağaçlar her karede sallanıyor (ayarla kapatılabiliyor).
- Öneri: performansı sakin bir makinede yeniden ölç (özellikle ½× ve ⅛×'te saat başı yeniden boyama sırasındaki en uzun kare).

---

## 6. Görsel kalite ve UX gözlemleri

- **Çok iyi:** gece sahnesi (yanan pencereler, parıltı, loş mavi), taç başkentinin katmanlı yapısı, köprü kemerleri, ambarın kırmızı ahır görseli, hisar ve tapınak; fotoğraf modu paylaşılmaya hazır görüntüler veriyor.
- Yer seçme ekranındaki üç kart ve renk seçimi net. Yükleme perdesi boş harita göstermiyor.
- Telefon düzeni temiz: üst çubuk tam genişlik, alt menü ikonlu, sekmeler alt sekmelere bölünmüş ve taşmıyor.
- ¼×'teki büyük stratus bulutu lordluğun üstüne geldiğinde bütün kasabayı soldurabiliyor; kameranın ortasında/oyuncunun lordluğu üstünde bulut opaklığını biraz düşürmek düşünülebilir.
- Oyuncunun yaptığı yol, ormanın içinde ağaçlarla çevrili yuvarlak uçlu bir şerit gibi duruyor; uçların patikalar gibi solarak bitmesi daha doğal olurdu.
- Bina kartlarındaki küçük önizlemeler koyu zeminde ve kilitliyken griye döndüğü için seçilmesi zor.

## 7. İyileştirme fikirleri

1. Pencereler için bir sıra/öncelik sistemi (A2).
2. Lobi açmayı tek atomik adıma indirmek (A1).
3. Uzak yakınlaştırmada hover etiketinin ad etiketinden kaçması (A4).
4. Takip şeridinin telefonda kompakt hâli (A3).
5. Tacın renginin koyu panellerde her yerde `ink` tonuyla yazılması (A6).
