# T2 — Savaş ve lordlar arası oyun: test raporu

> **Tarih:** 2026-10-16 · **Ortam:** yerel Supabase + yerel Edge Functions (`supabase functions serve`) + Vite (5180)
> **Lobi:** `T2 Savaş` (9 kişilik), iki test lordu: **Ayşe Beyliği** (`t2a@test.local`, Safranbolu'ya bağlı) ve **Bora Diyarı** (`t2b@test.local`, Gümüşsu'ya bağlı; rakip taçlar)
> **Yöntem:** kendi Playwright betiklerim (iki ayrı tarayıcı bağlamı, ekran görüntülerine baktım, konsol hatalarını topladım). Kurulumu hızlandırmak için iki lordun durumunu veritabanında ilerlettim: 5. seviye saray, ortak paylaşılan yapılar (kışla, casus evi, hapishane, 4 gözcü kulesi, iskele, tersane, tapınak, üniversite…), asker, gemi ve stok verdim. Süreleri yer yer veritabanındaki zaman damgalarıyla kısalttım (kasaba kuşatması, casus ağının yaşı).

---

## 0. Özet

- Savaş döngüsünün baştan sona akışı çalışıyor: hakaret → savaş gerekçesi → savaş ilanı → meydan muharebesi → saray kuşatması → barış (altın şartıyla) → yeniden savaş → abluka, kıyı akını, ablukayı yarma → beyaz barış → haraç. İki oyuncu birbirinin hamlesini elçi pencereleriyle, savaş izleyicisinde ve günlükte görüyor.
- **2 ciddi hata buldum ve düzelttim:**
  1. Asilere karşı çarpışma hiç başlamıyordu (sunucuda JSON `null` denetimi yanlıştı).
  2. Sarayın kapısının önünde bir yapı varsa çıkarılan ordu hiçbir yere gidemiyordu ("Oraya yol yok").
- Bunların yanında 14 küçük düzeltme yaptım: arayüz metinleri, Türkçe yazım, ondalık ayracı, düzen ve kolaylık (§3).
- **Açık kalan en önemli sorun:** yerel Edge Runtime'da CPU sınırı aşılıyor. `settle` ve `tick` bazen `546 WORKER_LIMIT` ya da `503` dönüyor. Yarıda kesilen bir tick, kıyı akınını yarım bıraktı: saldıranın kaybı işlendi, savunanınki ve ganimet işlenmedi, haber de gitmedi (§4).

---

## 1. Test edilenler ve sonuçlar

| Özellik | Sonuç | Not |
| --- | --- | --- |
| Kışla: birlik seçimi, maliyet, eğitim, sıra | ✅ | 52 mızrakçı sıraya girdi (12 dk 57 sn). Bir adım düğmesi vardı; **"En çok"** düğmesini ekledim. |
| Asker havuzu ("asker havuzu X / Y") | ⚠️ | Eğitimden sonra "0 / 0" yazıyor. Tavan, eğitilenler de sayılarak hesaplandığı için doğru, ama oyuncu "havuz bozuldu" sanabilir. |
| Garnizon: tür tür seçim, ordu çıkar, terhis | ✅ | Satırlar kaymıştı ("Kalkanlı piyade" uzun), hizaladım. |
| Ordu kartı: Göster, Hareket, Takip et, Eve dön, İkiye böl, Birleştir | ✅ | Bölme ve birleştirme elçiyle 30 sn sonra uygulandı. Takip şeridinde "Bırak" var. |
| Elçi gecikmesi ve iletişim penceresi | ✅ | Toast: "Elçi yola çıktı; emir orduya ulaşınca uygulanacak". Sayaç: "Elçi orduya: yürü · 29 sn". İkinci emir iletişim penceresinde hemen gitti. |
| Hızlı hedefler (sarayını kuşat, gözdağı, ticaret noktası, muharebeye git, eve dön) | ✅ | "Muharebeye git" ile iki ordu yolda karşılaştı. |
| Ordunun kapıdan çıkışı | ❌→✅ | **Hata 1** (§3): kapının önüne yapı kurulmuşsa ordu kımıldayamıyordu. |
| Kral ordunun başında | ✅ | Oğul şartı, "Kral komutada · emirler anında · zara −0,9" ve "Kral saraya dönsün" çalışıyor. Düğme metnini kısalttım. |
| Meydan muharebesi ve izleyici | ✅ | Tur tur zarlar, bonusların dökümü, moral ve canlandırma var. Bitiş haberinde artık "Savaş bitti: kazandın! / yenildin" yazıyor (önce "savunanlar kazandı"). |
| Saray kuşatması (4 kule, 0 sur, mancınık, kalkan) | ✅ | Kuleler her tur 8–9 asker öldürdü. Kalkan, halkın kaçması ve "Kuşatma halkı kaçırıyor" haberi çalışıyor. |
| Savaşlar listesi | ✅ | Artık "Bitti · kazandın / yenildin" yazıyor. Biten savaşta "sen de varsın" çıkmıyor. |
| Hakaret → savaş gerekçesi → savaş ilanı (onaylı) | ✅ | −45 ilişkide gerekçeyle savaş ilan edildi. |
| Anlaşmalar sekmesi (savaşta) | ⚠️→✅ | Savaş sürerken bölüm boştu. Artık "Savaştasınız (savaş puanı +6). Barışı Elçi bölümünden teklif edebilirsin." yazıyor. |
| Savaş puanı ve barış şartları (altın iste, beyaz barış) | ✅ | +6 puanla 100 altın istendi ve kabul edildi. Beyaz barış da çalışıyor. |
| İlişki geliştir, hediye | ✅ | Karşı tarafa pencere geldi, ilişki değişti. |
| Haraç iste | ❌→✅ | Düğmenin varsayılanı 5 altın/turdu, sınır ise 4 (`tribute.maxGold`), bu yüzden "Komut reddedildi" çıkıyordu. Düzelttim; haraç anlaşması kuruldu. |
| İttifak | ✅ (kısıt) | Rakip taçlar yüzünden kurulamıyor; "(+50 gerekir)" ve "ittifak kurulamaz" açıkça yazıyor. |
| Ticaret yolu yağması | ✅ | Başarılı oldu, ticaret noktası harap. Hedefin deposu boşken "0 yapı malzemesi getirildi" yazıyordu; metni düzelttim. |
| Kasaba: panel (Bilgi / Pazar / Kuşat), "Gönder ve kuşat", kuşatma, ele geçirme | ✅ | 8 kişilik garnizondan 5 asker kaybıyla alındı. Panelde "Ordu #3" yazıyordu, "1. Ordu" yaptım. Gönderilen ordu için "Yolda · N dk" gösterimini ekledim. |
| Kasaba pazarından orduyla alım, yükü eve taşıma | ✅ | 100 birim 51 altına alındı. Kartta "Yük: 100 savaş malzemesi…", eve varınca "Ordun yükünü getirdi". |
| Sadakat, huzursuzluk kaynakları, bakım, getiri, aşırı büyüme tablosu | ✅ | "×0.5" nokta ayracı vardı, düzelttim. "alınalı 0 dakika" ifadesini "… önce alındı" yaptım. |
| Ayaklanma → asiler → bastırma | ❌→✅ | **Hata 2** (§3): "Ayaklanmayı bastır" emri gidiyordu ama çarpışma hiç başlamıyordu. Düzelttikten sonra çarpışma, "ayaklanması bastırıldı" haberi ve +10 sadakat çalıştı. |
| Serbest bırak | ✅ | Kasaba sahipsiz kaldı, 4 kişilik garnizon kurdu. Onay metni "Emin misin? Bakırova serbest bırak" idi, düzelttim. |
| Casus evi, casus gönderme, ağ, rapor | ✅ | Ağ %93'te rapor tutarlı. "90–95%" yazıyordu, "%90–95" yaptım. Diplomasi casusu 8 dakikada yakalandı, "Casusun yakalandı" haberi geldi. |
| Kraliçeyi kaçırma, hapishane, fidye | ✅ | %45 şansla başarılı oldu, fidye 3.560 (hazinenin %40'ı). Halk → Kraliçe bölümünde "Fidye öde" çalışıyor. Kraliçe geri döndü, altın karşı tarafa geçti. |
| Donanma: liman, filo çıkarma (2 filo), tersane | ✅ | "güç 12.0", "0.05 altın bakım" nokta ayracı vardı, düzelttim. |
| Abluka | ✅ | Deniz muharebesi kazanıldı. Hedefte "iskeleni abluka altında tutuyor" uyarısı çıktı. |
| Ablukayı yarma | ✅ | Kazanıldı; abluka kalktı, ablukacı filo eve döndü. |
| Kıyı akını | ⚠️ | Tick yarıda kesildi. Saldıran 2 koka kaybetti ve döndü, ama savunanın kaybı, ganimet ve haber yok (§4). Metindeki "%12'ini" yazımını "%12'sini" yaptım. |
| Deniz ticareti, korsan avı | ✅ | Görevler başladı; korsan olasılığı (%2) yazıyor. |
| Telefon düzeni (390 px): Ordu, Kışla, savaş izleyici | ✅ | Yatay taşma yok. |
| Gözdağı, dayatılan barış (100 puan), kasabada isyan kışkırtma, rakip filo penceresi, "Hareket et" ile seyir | ⏸ | Zaman yetmedi. Seyir ve rakip filo penceresi Tur 5'te test edilmişti. |

---

## 2. Arayüz, deneyim ve eğlence üzerine gözlemler

- **Savaş izleyici oyunun en güçlü yeri.** Zarlar, bonusların dökümü ("birlik üstünlüğü +0,1 · iman +1,6 · 4 kule"), moral çubukları ve küçük canlandırma savaşı okunur ve heyecanlı kılıyor. Tur listesindeki "56 / 8 asker" sütununun başlığı yok; "kalan asker (sen / rakip)" gibi bir etiket iyi olur.
- **Moral, sayıdan daha belirleyici.** 66 asker (%30 moralle gelen), 14 asker ve 4 kule savunan saraya yenildi; son turda savunanda tek asker kalmıştı. Kurala uygun, ama oyuncuya sert gelir. Öneri: "Hareket" ile kuşatmaya gönderirken moral %50'nin altındaysa "Ordu yorgun; önce bir handa dinlensin" uyarısı. Kazanan ordu meydan muharebesinden sonra kuşatma hedefini unutup "Bekliyor" kalıyor; bu da yeni emir istiyor.
- **Kuleler çok etkili.** 4 kule her tur 8–9 asker öldürdü. Ucuz olduklarını düşünürsek dengeye bakılmalı (`military.json` → `tower`).
- **Pencere seli.** Sezonun ileri bir anına atlattığım için olabilir, ama oyun sırasında devriye bahşişi ("Devriye eğlenip gitti", her uğrayışta), haraççı, kraliyet isteği, olay ve doğum pencereleri art arda geliyor ve savaş haberlerini gömüyor. Devriye bahşişi gibi sıradan haberlerin pencere yerine günlüğe ya da küçük bir toast'a düşmesi iyi olur (taç ve olay alanı başka bir test edicide).
- **Hedef çubuğu** ("Ordunun hedefi · Haritada bir yere tıkla…") alttaki sekme çubuğunun üstüne biniyor; Halk, Ordu ve Diplomasi sekmeleri örtülüyor. Bina yerleştirmede de aynı `.placing` sınıfı kullanılıyor; dokunmadım (§4).
- Ordu kartında "Kral komutayı alsın / Kral saraya dönsün" 3 sütunluk ızgarada hâlâ 3 satıra sarıyor (önce 4 satırdı).
- **Deniz ticareti cömert görünüyor:** 4 gemilik bir filo için "saatte yaklaşık 1.229 altın" yazıyor. Bu, CLAUDE.md'deki gelişmiş lord hedefinin (~2.000–2.500/sa) yarısı. Fiyat düşüşü hesaba katılmadan gösterilen bir tahmin, ama birkaç kokalık iki filo geliri katlayabilir. Bot simülasyonuyla bakılmalı.
- Kasaba fethi ödüllendirici bir döngü: yürü, kuşat, al, sadakat, asiler, bastır. Kasaba pazarından orduyla yük taşımak da güzel bir ek.

---

## 3. Düzeltilen hatalar

| # | Ciddiyet | Sorun | Düzeltme |
| --- | --- | --- | --- |
| 1 | **Yüksek** | Asilere karşı çarpışma hiç başlamıyordu. `startQuell` kasabayı `.is('rebels->battle', null)` ile sahipleniyor; `rebels.battle` JSON `null` olduğu için `->` işleci SQL NULL dönmüyor, sahiplenme hep boşa çıkıyor ve çarpışma satırı siliniyordu. | `supabase/functions/_shared/towns.ts`: `.is('rebels->>battle', null)` |
| 2 | **Yüksek** | Sarayın kapısının (ön köşesi) önüne bir yapı kurulmuşsa çıkarılan ordu o yapının içinde duruyordu. `findRoute` yalnız komşu karolara bakıyor, rota hiç bulunamıyordu ("Oraya yol yok"). Normal oyunda da olabilir, çünkü `buildError` o kareye yapıya izin veriyor. | `supabase/functions/_shared/armies.ts` → `march`: ordu bir yapının içindeyse önce `standingSpot` ile en yakın boş kareye adım atıyor. CLAUDE.md §9.7'ye not eklendi. |
| 3 | Orta | Haraç isteğinin varsayılanı 5 altın/turdu, sınır 4 (`tribute.maxGold`): "Komut reddedildi". Barış şartındaki haraç adımlayıcısının da üst sınırı yoktu. | `diplomacy.tsx`: varsayılan `min(5, maxGold)`; barış haracı sınırda duruyor, ipucuna "en fazla N altın/tur" eklendi. |
| 4 | Orta | Kışlada askerler yalnız birer birer artırılabiliyordu (50 asker için 50 tık). | `war.tsx` → `Training`: gönüllülerin ve depoların yettiği en büyük sayıyı ikili aramayla bulan **"En çok (N)"** düğmesi. |
| 5 | Düşük | Savaş bitince "saldıranlar / savunanlar kazandı" yazıyordu. | `Envoy.tsx` (`battle_end`) ve `war.tsx` (Savaşlar listesi): oyuncunun tarafına göre "kazandın! / yenildin". |
| 6 | Düşük | Savaştayken Anlaşmalar bölümü boştu. | `diplomacy.tsx`: savaş puanı ve barışın nereden teklif edileceği yazıyor. |
| 7 | Düşük | Garnizon adımlayıcıları hizasızdı. | `index.css` → `.unit-label` 15ch, sayı 7ch. |
| 8 | Düşük | "Kral ordunun başına geçsin" 4 satıra sarıyordu. | Metin "Kral komutayı alsın" oldu (`war.tsx`, CLAUDE.md). |
| 9 | Düşük | Kasaba metni "kuşatma bitince ordun onlar kadar kayıp verir" diyordu; gerçek kayıp garnizonun %60'ı (çitle ×1,35). | `towns.tsx`: `townLosses` ile "yaklaşık N asker kaybeder". |
| 10 | Düşük | Kasaba panellerinde "Ordu #3" (veritabanı kimliği) yazıyordu. | `towns.tsx` → `armyLabel`: Ordu sekmesindeki gibi "1. Ordu". |
| 11 | Düşük | Ordu kasabaya gönderildikten sonra da "Gönder ve kuşat" düğmesi duruyordu. | `towns.tsx`: "Yolda · N dk" yazıp düğmeyi kapatıyor. |
| 12 | Düşük | Türkçe yazım: "%12'ini", "×0.5", "90–95%", "Emin misin? Bakırova serbest bırak", "alınalı 0 dakika", "Kasaba kendi ürettiği … satar" (vergi kasabası savaş malzemesi satıyordu). | `primitives.tsx` → `percentOf` (yüzdeye doğru belirtme hâli eki), `navy.tsx`, `towns.tsx`, `diplomacy.tsx`. |
| 13 | Düşük | Donanmada nokta ayracı: "güç 12.0", "eskort 8.0", "birimi 0.29", "0.05 altın bakım". | `navy.tsx`: virgül ayracı. |
| 14 | Düşük | Yağma başarılı olup hedefin deposu boşsa "0 yapı malzemesi getirildi" yazıyordu. | `diplomacy.tsx`: "…tüccarın taşıyacak malı yoktu (depoları boştu)…" |

`bun run typecheck` temiz. `packages/shared` değişmediği için `fn:bundle` gerekmedi; sunucu düzeltmeleri `_shared/*.ts` içinde ve yerel fonksiyonlara hemen yansıdı.

---

## 4. Açık kalanlar

| Sorun | Ciddiyet | Neden açık | Öneri |
| --- | --- | --- | --- |
| Edge Runtime CPU sınırı: `settle` ve `tick` sık sık `546 WORKER_LIMIT` ya da `503` dönüyor (`CPU time hard limit reached`). 4 test edicinin yükü katkı yapıyor olabilir; tek bir `settle` 1–10 sn sürüyor. | **Yüksek** (canlıda da 2 sn CPU sınırı var) | Profil çıkarmak ayrı bir iş. Paylaşılan servisleri yeniden başlatmam yasaktı. | `tickLobby` adımlarını ölçün (devriye rotaları, kasabalar, donanma, `ensureTowns`). Ağır adımları lobi başına önbelleğe alın ya da tick'i parçalara bölün. |
| Yarıda kesilen tick yarım sonuç bırakıyor. Kıyı akınında saldıranın kaybı ve dönüşü yazıldı; hedefin gemi kaybı, ganimet ve `naval_battle` haberi yazılmadı. | Orta | Sunucu adımları ayrı `mutateKingdom` çağrıları; atomik değiller. | `strike`'ta önce sonucu (seed'den belirlenen) bir olay satırına yazın, iki tarafı ondan tekrarlanabilir biçimde uygulayın ya da sahiplenmeyi en sona alın. |
| `.placing` hedef çubuğu alttaki sekmeleri örtüyor. | Düşük | Bina yerleştirmeyle ortak; başka test edicinin alanına da giriyor. | Çubuğu `bottom: calc(var(--gap) + 64px)` ile menünün üstüne alın, plan çubuğunu bir kat daha yukarı taşıyın. |
| Doğum penceresinde ad kutusu boşken "Koy" sessizce hiçbir şey yapmıyor. | Düşük | Hanedan alanı. | Boşken düğmeyi kapatın ya da "Rastgele" ad koyun. |
| Asker havuzu eğitimden sonra "0 / 0" görünüyor. | Düşük | Gösterim doğru, yalnız anlaşılmıyor. | "asker havuzu 0 / 0 · ordunun tavanı dolu" gibi bir açıklama. |
| Limanı olup tersanesi olmayan lordda "2 / 0 gemi". | Düşük | Yalnız tersane yıkılınca olur (benim kurulumum). | Sınır 0 ise "/ 0" yerine "tersane yok" yazın. |
| Kazanan ordu meydan muharebesinden sonra kuşatma hedefini unutuyor. | Tasarım | Mekanik kararı. | Hedefi `siege` olan kazanan ordu yoluna devam edebilir. |
| Tur listesinde sütun başlığı yok ("56 / 8 asker"). | Düşük | — | Başlık ekleyin. |

Not: Kurulumda başta aynı adlı süreçlere geniş bir `pkill -f "bun server.ts"` çalıştırdım; sonra bunun başka test edicilerin Playwright sunucularına da çarpabileceğini fark ettim. qa1 ve qa3 sunucularının o sırada çalışmaya devam ettiğini gördüm; sonrasında yalnız kendi PID'lerimi kapattım.

---

## 5. Geliştirme fikirleri

- Ordu kartında "moral düşük" ve "kule menzilinde" uyarıları; "Hareket" sırasında hedefin tahmini savunmasını gösteren bir önizleme (casus raporu varsa).
- Savaş bitince izleyicide kazananın yüklendiği ganimet ve kaçan halk, ayrı bir "sonuç" kartında.
- Elçi pencerelerini önem sırasına göre dizin (savaş, kuşatma, kaçırma önce; bahşiş ve devriye en sona ya da günlüğe).
- Kasaba panelinde "en yakın ordumu gönder" kısayolu; şimdilik ordu çıkarmak için Ordu sekmesine dönmek gerekiyor.
- Barış teklifinde, karşı tarafın kabul etme olasılığına dair bir ipucu (savaş puanı, ilişki).
