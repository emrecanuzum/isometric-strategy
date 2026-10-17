# Uçtan Uca Test Raporu — Tur 5

> **Tarih:** 2026-10-15 · **Canlı sürüm:** `7353be3` · **Önceki rapor:** `docs/E2E-TEST-RAPORU-4.md` · **Test eden:** Claude (Opus 5.5)
> **Kapsam:** bu oturumda eklenenler: donanma (tersane görseli, gemi türleri, filolar, "Hareket et", seyir, seçim, etiketler, rakip filo penceresi, kaba büyüklük ve casus raporu), depo kartlarındaki yeni satırlar, nüfus büyümesinin (i) açıklaması, Diplomasi → Krallık sekmesi ve taç görevleri.
> **Yöntem:** iki aşama.
> 1. **Yerel ortamda işlevsel test:** yerel Supabase (Docker, bütün migration'lar), yerel Edge Functions ve yerel Supabase'e bağlı Vite istemcisi (5180) kullanıldı. İki test hesabı açıldı; durum veritabanında ileri sarıldı (4. seviye saray, iskele, tersane, gemiler). Tarayıcı Playwright'tı.
> 2. **Canlı ortamda doğrulama:** `https://isometric-strategy.vercel.app` açıldı; sürüm, paket içeriği, sunucu fonksiyonları ve migration'lar denetlendi.

---

## 0. Özet

- **Canlı sürüm güncel:** `version.json` → `7353be3`. Vercel dağıtımı `success` (13:01 UTC). Bütün migration'lar (son: `20261015220000_fleet_rough`) canlı veritabanında uygulanmış. `command` (v92) ve `tick` (v86) fonksiyonları 13:01'de yüklenmiş.
- **Canlı istemci:** giriş ekranı masaüstünde ve telefonda (390 px) düzgün açılıyor. Konsolda hata yok, yatay taşma yok. Bu turun yeni metinlerinin hepsi canlı pakette var.
- **Sınır:** canlı sitede oturum açılmadı. Gerçek bir hesaba şifre girilmedi, canlı servise test hesabı da açılmadı. Bu yüzden giriş ekranının arkası (harita, paneller) **yalnız yerel ortamda** test edildi. Kod aynı commit'ten derlendiği için yerel sonuçlar canlıyı temsil eder; yine de canlı lobide gözle bakılmadı.
- **Yerel testte bulunan 6 sorun düzeltildi ve canlıya alındı** (§3). Açık kalan 2 küçük sorun var (§4).

---

## 1. Canlı ortam denetimi

| Denetim | Sonuç | Kanıt |
| --- | --- | --- |
| İstemci sürümü | ✅ | `https://isometric-strategy.vercel.app/version.json` → `{"build":"7353be3…"}` |
| Vercel dağıtımı | ✅ | GitHub deployments: Production `7353be3`, durum `success` |
| Giriş ekranı (1440×900) | ✅ | Başlık, sekmeler, form düzgün; konsolda 0 hata |
| Giriş ekranı (390×844) | ✅ | Yatay taşma yok |
| Yeni kod pakette | ✅ | JS paketinde şu metinler var: "Nüfus büyümesi nasıl işler?", "Senden istediği", "Gemiler yalnız suda yüzer", "Casus raporunu getir", "Balık avındaki filolar" |
| Migration'lar | ✅ | `supabase migration list --linked`: 37 yerel = 37 uzak, son `20261015220000` |
| Edge Functions | ✅ | `command` v92, `tick` v86, ikisi de `ACTIVE`; oturumsuz `POST /command` → 401 (beklenen) |
| Oturum açık oyun ekranları | ⏸ yapılmadı | Canlıda hesaba giriş gerekir (bkz. Özet) |

---

## 2. Yerel ortamda işlevsel test

| Özellik | Sonuç | Not |
| --- | --- | --- |
| Giriş, lobi açma, yer seçme, kuruluş, saray yerleştirme, tüccar malı | ✅ | Kuruluş penceresi ve 3 yer kartı düzgün |
| Bütün sekmeler ve alt sekmeler (İnşa, Depo, Ticaret, Saray, Halk, Ordu, Diplomasi, Günlük) | ✅ | Her alt sekme açıldı: konsol hatası yok, taşan düğme yok |
| Telefon düzeni (390 px), Ordu → Donanma | ✅ | Yatay taşma yok |
| Üst çubuk nüfus kartı: büyüme, yerleşim | ✅ | "Büyüme +0,0 / saat", "Yerleşim 0 / 0" |
| Halk → Nüfus (i) açıklaması | ✅ | Açılıyor, lordun kendi sayıları ve config'teki eşiklerle anlatıyor |
| Liman → filo çıkarma (7 gemi) | ✅ | "7 gemiyle filo çıkar" → "1. filo" kartı |
| Görev düğmesi seçili görünür ve yeniden gönderilmez | ✅ | Etkin görevin sınıfı `btn small active current` |
| "Göster": filo seçilir, kamera gider, gemiler dış hatlı, kart altın çerçeveli | ✅ | |
| Haritada etiket ("1. filo · 7", lordluk renginde), gemi türleri ayrı çizilir | ✅ | Kadırga tenteli ve kalkanlı, koka geniş, çektiri latin yelkenli |
| "Hareket et" → karaya tıklama | ✅ | "Gemiler yalnız suda yüzer…" uyarısı, nişan kipi açık kalıyor |
| "Hareket et" → suya tıklama | ✅ | Filo su yolundan gidiyor; kesikli rota ve okun ucu lordluk renginde |
| Balık avı | ✅ | Filo kaybolmuyor, çevrede dolaşıyor; yemek −2,0'dan +1,3'e çıktı |
| Rakip filo: etiket kaba büyüklükte ("1. filo · orta") | ✅ | Kesin sayı ve türler gizli |
| Rakip filo penceresi (ağ yok) | ✅ | "orta boy, aralarında kadırga var… en az %30 ağ… (şu an %0)" |
| Rakip filo penceresi (Ordu ağı %100) | ✅ | "Kadırga 3, Koka 2" (gerçek değer); seçili rakip filo dış hatlı |
| Diplomasi → Krallık | ✅ | İki taç: hükümdar, ilişki, politikalar, görev, taçların gücü, taçların pazarı |
| Görevi al (sunucu) | ✅ | "0 / 10 · Henüz tamamlanmadı" |
| Ödülü al (sunucu) | ✅ | İlişki −15'ten −12'ye (+3), "Ödülü aldın", sekmede kırmızı nokta yandı |
| `typecheck`, `build` | ✅ | Hata yok |

---

## 3. Bulunan ve düzeltilen sorunlar (canlıda)

| # | Sorun | Düzeltme |
| --- | --- | --- |
| D1 | Kıyı çizgisindeki bir su karosuna gönderilen filonun gövdeleri kumsala ve ağaçlara taşıyordu | Hedef dar ya da kıyıya yapışıksa 4 karo içindeki en yakın açık suya demirliyor (`seaways.ts` → `openWater`; sunucuda da) |
| D2 | (i) metninde ek hatası ("yerin 0'i dolu"); boş yer yokken "0,08 × 0,77 = 0,00 kişi" yazıyordu ama nedenini söylemiyordu | Metin "yer / yerleşmiş / boş" diye yeniden yazıldı; boş yer yoksa "kimse gelmez" diyor |
| D3 | Üst çubuktaki nüfus kartı denizcileri göstermiyordu (denizciler yeri doldurunca köylü "0 / 0" görünüyordu ve nedeni anlaşılmıyordu) | "Denizci (yerden düşer)" satırı eklendi |
| D4 | Rakip filo penceresinde ve tersanede "0.6" (nokta) | Türkçe ondalık virgül |
| D5 | Filo başka bir yerdeyken de "İskele önünde balık tutuyor" yazıyordu | "Durduğu yerin çevresinde balık tutuyor" |
| D6 | Krallık sekmesinde politika satırları dar sütunda kırılıyordu; sipariş görevi "(aşağıda)" diyordu ama sipariş yukarıdaydı | Satırlar başlık + değer + not düzenine geçti; metin düzeltildi |
| D7 | Hazine doluyken görev ödülü sessizce boşa gidiyordu (testte 164 altınlık ödülün 4'ü girdi) | "Ödülü al"dan önce "hazinende X altınlık yer var, kalanı boşa gider" uyarısı |

---

## 4. Açık kalan sorunlar

| # | Sorun | Öneri |
| --- | --- | --- |
| A1 | Kısa balık avı döngüsünde dönüş noktalarında filonun gemileri üst üste biniyor | Döngüyü uzatmak ya da arkadaki gemilere yan kaydırma vermek |
| A2 | Sipariş görevi, saatin siparişi görev alınmadan önce gönderilmişse görev alınır alınmaz tamamlanmış sayılıyor | Kabul edilebilir (sipariş yine gönderilmek zorunda); istenirse başlangıç değeri saklanabilir |

---

## 5. CLAUDE.md ile proje arasındaki farklar

### 5.1 Belgede olup projede olmayanlar
- **Sezon döngüsü:** sezon sonu wipe ve otomasyonu, sezon sonu kategori sıralaması ve ödülleri, başarımlar, kalıcı profil istatistikleri.
- **Lobi:** davet linki ya da kodla özel lobiye katılma; lobi ayarları (barış süresi, ekonomi hızı, sezon süresi, harita ön ayarı); geç katılım bonusu.
- **Harita:** savaş sisi (fog of war); haydut kampları (PvE). Tünelin karo kuralı var ama binası yok; dağ etekleri fiilen kullanılamıyor.
- **Ticaret:** kervanla uzaktan mal alma, eskort, kervan yağması (kervanlar yalnız görsel); oyuncular arası takas, ticaret anlaşması, ambargo.
- **Diplomasi ve entrika:** saldırmazlık paktı, vasallık, evlilik ittifakı; suikast, suikastçı birliği, kurtarma operasyonu.
- **Yapılar:** Mimarlar Loncası, değirmen/fırın, okçu menzili, ahır, ayrı atölye, demirci, kale/hisar, hendek/tuzak, elçilik.
- **Ekonomi ve ordu:** hazine borcu, lüks mallar, itibar/prestij, ordu ikmali ve yıpranma.
- **Altyapı:** push bildirimleri. `kingdom_daily` tablosu var ama hiçbir yer yazmıyor ya da okumuyor.

### 5.2 Tutarsızlıklar
- §7.7 "yeni lobiler sürüm 4" diyor; kodda `WORLD_REV = 5`. Aynı bölümün başı "1 ya da 2 şehir" diyor; sürüm 5'te her zaman 2.
- Sur kapısı bir yerde "1 karo", başka yerde "üç karo" diye geçiyor; kod 3 karo (`economy.json` → `gate.size` ise 1).
- §11.1'deki tablo listesi eski: `orders` ve `events` silinmiş. Yerlerindeki `army_orders`, `envoys`, `notices`, `claims`, `relations`, `pacts`, `spy_missions`, `lobby_towns`, `lobby_worlds`, `patrol_visits`, `profiles` yazmıyor.
- Ordu birleşmesi §8.2.1'de "aynı karo", kodda 5 karo (§9.7 doğru).
- Oyuncu sayısı §3.3'te 4–20, varsayılan 10; uygulamada yalnız 9 ya da 18 (DB'de eski kısıt 2–20 kalmış).
- Korsan mevsimi değerleri (×2,5, iki saatlik pencere, 30–50 dk) koda gömülü, `navy.json`'da değil. Bu, §15'teki "denge değerlerini koda gömme" kuralına aykırı.
- Küçük farklar:
  - Hayır işleri araştırmasının +3 mutluluğu belgede yazmıyor.
  - "2. seviye saray şunları açar" listesinde hapishane ve sur kapısı eksik.
  - Elçi süresi "birkaç dakika" deniyor, config 1 dakika.
  - §16.1 "2–3 karelik animasyon" diyor; savaş artık ayrıntılı canlandırmayla gösteriliyor.

### 5.3 Belgelenmemiş olanlar
- Admin rolü (`profiles.is_admin`, her lobiyi silebilir).
- Şifreli lobide tahmin sınırı (`lobby_join_failures`).
- Belgede sayısı geçmeyen config değerleri: ordu hızı, kule menzili, kraliçe bedeli, casus ve operasyon bedelleri, tersane maliyeti.
- §16.2'de anılmayan `docs/`, `vercel.json` ve `db:status` / `fn:bundle` betikleri.

---

## 6. Önerilen sıradaki işler

1. **Sezon sonu (wipe ve sıralama ödülleri) ile davet linki:** lobinin yaşam döngüsünü tamamlar.
2. **Tünel:** dağ etekleri şu an ölü arazi.
3. **Korsan mevsimi değerlerini `navy.json`'a taşımak** ve §5.2'deki belge tutarsızlıklarını temizlemek.
4. **Canlıda oturum açık bir gözden geçirme:** bir hesapla Krallık sekmesi, donanma ve (i) açıklaması canlı lobide görülmeli.
