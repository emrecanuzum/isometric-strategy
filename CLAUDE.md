# CLAUDE.md — İzometrik Çok Oyunculu Strateji Oyunu

Bu dosya, projenin **oyun tasarım belgesi (GDD)** ve Claude için çalışma rehberidir.
Projede kod yazılırken burada tanımlanan oyun mantığı esas alınır. Bir mekanik
değişirse önce bu dosya güncellenir, sonra kod.

> Durum: **Tasarım aşaması.** Teknik mimari (motor, sunucu, veritabanı) henüz
> kesinleşmedi; bkz. [§14 Açık Sorular](#14-açık-sorular--sonra-konuşulacaklar).

---

## 1. Oyunun Özeti

İzometrik görünümlü, tarayıcı/istemci üzerinden **online** oynanan, **kalıcı
lobi** tabanlı bir şehir kurma + strateji oyunu.

| Esinlenilen oyun | Bizdeki karşılığı |
|---|---|
| **Clash of Clans** | Açık dünya haritası, her oyuncunun kendi şehri, savunma yapıları, oyuncu kapalıyken de dünya akmaya devam eder |
| **Age of Empires** | Süreye dayalı inşaat, hammadde toplama/depolama, askeri birim üretimi |
| **Europa Universalis IV** | Basitleştirilmiş ekonomi: periyodik vergi geliri, ticaret gelirleri, ordu bakım giderleri |
| **Crusader Kings** | Krallıklar arası ilişkiler: hanedan/kraliçe, istihbarat ağları, suikast/kaçırma, moral ve yaptırımlar |

**Temel döngü:** Şehrini genişlet → nüfus artar → vergi ve üretim artar →
ticaret ve hammadde ile daha fazla inşa et → ordunu ve savunmanı kur →
diğer krallıklarla diplomasi, entrika veya savaş.

---

## 2. Zaman Modeli

- **1 oyun günü = 1 gerçek saat.**
- **Lobi ömrü = 2 hafta = 336 oyun günü**, sonra **wipe** (bkz. §3).
- Oyun **gerçek zamanlıdır ve oyuncu çevrimdışıyken de devam eder** (CoC tarzı).
  İnşaatlar tamamlanır, gelir/gider işler, kervanlar yol alır.
- **Ekonomik tick:** Her oyun günü başında (gerçek saatin başı) bir
  "gün sonu hesabı" çalışır: vergi, ticaret geliri, üretim, bakım giderleri,
  nüfus değişimi, moral güncellemesi.
- Daha ince işlemler (birim hareketi, inşaat ilerlemesi, savaş) gün tick'inden
  bağımsız olarak gerçek zamanlı ilerler.
- Ayrıca **ay** kavramı kullanılabilir (ör. 30 oyun günü ≈ 30 saat) — büyük
  olaylar, rapor özetleri ve bazı kontrat süreleri için.

**Tasarım ilkesi:** Oyuncu günde birkaç kez kısa oturumlarla girip anlamlı
kararlar verebilmeli; sürekli başında durmak zorunlu olmamalı. Kritik süreler
(inşaat, yolculuk) saatler mertebesinde, anlık müdahale gerektiren olaylar
(saldırı) bildirim ile duyurulmalı.

---

## 3. Lobi Sistemi ve Sezonlar

### 3.1 Lobi türleri
- **Halka açık lobiler:** Herkes listeden görüp katılabilir. Kapasite dolunca
  kapanır veya sıra (waitlist) oluşur.
- **Özel (arkadaş) lobileri:** Kurucu oluşturur, davet kodu/link ile katılım.
  Kurucu belirli ayarları (bkz. 3.3) seçebilir.

### 3.2 Lobi yaşam döngüsü
1. **Oluşturma** — harita üretilir (seed), oyuncu slotları açılır.
2. **Katılım** — oyuncu kendi başlangıç bölgesini seçer veya atanır.
3. **Aktif sezon** — 2 hafta (336 oyun günü).
4. **Sezon sonu** — skor tablosu, ödüller/başarımlar kaydedilir.
5. **Wipe** — dünya sıfırlanır; özel lobide aynı grup yeni sezona devam eder.

### 3.3 Lobi ayarları (özel lobiler için)
- Maksimum oyuncu sayısı (öneri: 4–20, varsayılan 10)
- Sezon süresi (varsayılan 2 hafta)
- Barış süresi / başlangıç koruması (ör. ilk 24 oyun günü saldırı yok)
- Harita boyutu ön ayarı (oyuncu sayısına göre otomatik ölçeklenir)
- Ekonomi hızı çarpanı (opsiyonel)

### 3.4 Sezon dışında kalıcı olanlar
Wipe dünyayı sıfırlar; ancak **hesap seviyesinde** şunlar kalıcıdır:
oyuncu profili, istatistikler, başarımlar, kozmetikler (sancak/bayrak, hanedan
arması). **Oynanışa avantaj sağlayan hiçbir şey sezonlar arası taşınmaz.**

### 3.5 Geç katılım
Sezon ortasında katılan oyuncu için "yakalama" mekaniği: başlangıç kaynak
bonusu ve uzatılmış başlangıç koruması.

---

## 4. Dünya ve Harita

### 4.1 Boyut hedefi
Harita "küçük" hissettirmemeli ama sunucu ve istemciyi yormamalı.

- Harita **oyuncu sayısına göre ölçeklenir.** Kaba hedef: oyuncu başına
  yaklaşık **48×48 – 64×64 karo** "kişisel alan" + aradaki tarafsız bölgeler.
- 10 kişilik lobi için örnek: **~256×256 karo** (≈65k karo).
- **Chunk (parça) tabanlı yükleme:** Harita örn. 32×32 karoluk parçalara
  bölünür; istemci yalnızca görünen ve yakın parçaları yükler/render eder.
- Uzak bölgeler için **düşük detaylı (LOD) görünüm** ve **savaş sisi
  (fog of war)** — keşfedilmemiş/istihbaratı olmayan alanlar gizli.

### 4.2 Harita öğeleri
- **Arazi türleri:** Çayır (tarım verimli), orman (kereste), dağ/kayalık
  (taş, maden), bataklık (inşaat zor), çöl/kurak (verimsiz).
- **Nehir(ler):** Haritayı kesen bir veya daha fazla nehir.
  - Kıyısına **liman/iskele** kurulabilir → su yolu ticareti.
  - Nehir kenarı tarlalar daha verimli.
  - Köprü veya geçit noktaları stratejik önemdedir.
- **Kervan ticaret yolları:** Haritada önceden tanımlı ana yollar
  (bkz. §7). Yola yakınlık ekonomik avantajdır.
- **Tarafsız yerleşimler / ticaret merkezleri (NPC):** Pazar yerleri,
  kervansaraylar. Hammadde alınıp satılabilir.
- **Kaynak noktaları:** Maden ocakları, taş ocakları, zengin ormanlar —
  sahiplenilmesi için rekabet doğar.
- **Haydut kampları (opsiyonel PvE):** Ticaret yollarını tehdit eder.

### 4.3 Harita üretimi
Prosedürel (seed tabanlı), ama **adil başlangıç** kurallarıyla:
her oyuncunun başlangıç bölgesinden bir ticaret yoluna veya nehre makul
uzaklık olmalı; kimse tamamen dezavantajlı başlamamalı.

---

## 5. Şehir ve İnşaat

### 5.1 İnşaat alanı (Toprak / Hudut)
- Her oyuncu harita üzerinde bir **başlangıç bölgesi** ile başlar.
- Yalnızca **kendi hududu** içinde inşa edebilir.
- Hudut; **şehir merkezinin seviyesi**, **nüfus**, **karakol/kule** gibi
  yapılarla genişletilir. Genişleme hammadde + para + süre gerektirir.
- Başka bir oyuncunun hududu ile çakışma olamaz; sınır anlaşmazlığı
  diplomasi/savaş konusudur.

### 5.2 Nüfus mantığı
- **Şehir ne kadar genişlerse nüfus o kadar artar.**
- Nüfus kapasitesi: **konutlar** + şehir merkezi seviyesi belirler.
- Nüfus artışı şunlara bağlıdır: **gıda fazlası**, **moral**, **barınma**.
- Nüfus → **vergi tabanı**, **işgücü** (yapılar işçi ister) ve **asker
  havuzu** (manpower, EU4 benzeri).
- Gıda açığı veya düşük moral → nüfus azalır, göç olur.

### 5.3 Zamana dayalı inşaat (AoE tarzı)
- Her yapının **maliyeti** (para + hammadde), **inşaat süresi** ve
  **işçi ihtiyacı** vardır.
- Aynı anda yürütülebilecek inşaat sayısı sınırlıdır (**inşaat kuyruğu**;
  şehir merkezi seviyesi / mimar binası ile artar).
- Hammadde **depoda yoksa inşaat başlamaz** (veya bekler).
- Örnek süreler (ayar yapılacak): Ev 1–2 saat, Tarla 2 saat, Kışla 6 saat,
  Sur parçası 1 saat/segment, Şehir merkezi seviye atlama 12–24 saat.

### 5.4 Yapı kategorileri (ilk taslak)

**Yönetim**
- **Şehir Merkezi / Saray** — çekirdek yapı; seviyesi diğer yapıların
  kilidini açar. Kral/kraliçe burada yaşar.
- **Mimarlar Loncası** — eşzamanlı inşaat sayısını artırır.

**Ekonomi ve Üretim**
- **Konut** — nüfus kapasitesi.
- **Tarla** — gıda üretir (mevsim/arazi verimine bağlı).
- **Değirmen / Fırın** — gıda verimini artırır.
- **Oduncu kampı, Taş ocağı, Maden** — yakındaki kaynak noktasına bağlı.
- **Depo / Ambar** — hammadde & gıda depolama kapasitesi.
- **Pazar** — yerel ticaret, vergi bonusu.
- **Liman / İskele** — nehir kıyısı şart; su yolu ticareti.
- **Kervansaray / Ticaret Ofisi** — tüccar ve kervan çıkarma kapasitesi.

**Askeri**
- **Kışla** — piyade.
- **Okçu menzili**, **Ahır** (süvari), **Atölye** (kuşatma silahları).
- **Demirci** — birim yükseltmeleri.

**Savunma (Tower Defense)**
- **Sur / Duvar** — şehri çevreleyen segmentler halinde inşa edilir.
- **Kapı** — kendi birimleri geçer, düşman geçemez.
- **Kule (okçu/ balista)** — otomatik menzilli saldırı.
- **Kale / Hisar** — şehri çevreleyen tam savunma halkası; sur + kule +
  kapı kombinasyonu, seviye atlatılabilir.
- **Hendek, tuzak** — düşmanı yavaşlatır.

**Entrika ve Diplomasi**
- **Elçilik** — diplomatik ilişki slotları.
- **Casus Yuvası / İstihbarat Bürosu** — casus ve suikastçı yetiştirme,
  istihbarat ağı yönetimi (bkz. §9).

### 5.5 Yapı seviyeleri
Çoğu yapı 3–5 seviyeye yükseltilebilir; her seviye daha fazla maliyet ve süre,
daha fazla verim/kapasite/dayanıklılık.

---

## 6. Ekonomi (EU4 tarzı, basitleştirilmiş)

### 6.1 Kaynaklar
| Kaynak | Kaynağı | Kullanım |
|---|---|---|
| **Altın (para)** | Vergi, ticaret, satış | Her şey; tüccar ücreti, asker maaşı |
| **Gıda** | Tarlalar, ithalat | Nüfus ve ordunun tüketimi |
| **Kereste** | Oduncu, ticaret | İnşaat |
| **Taş** | Taş ocağı, ticaret | İnşaat, surlar |
| **Demir** | Maden, ticaret | Silah, ileri yapılar |
| *(opsiyonel)* Lüks mallar | Ticaret | Moral, diplomasi hediyesi |

Hammadde ve gıda **depolarda** saklanır; depo kapasitesi sınırlıdır.
Kapasiteyi aşan üretim boşa gider (veya satılmalıdır).

### 6.2 Günlük hesap (her oyun günü / her gerçek saat)
```
Gelir  = Vergi + Ticaret geliri + Üretim satışları
Gider  = Ordu bakımı + Bina bakımı + Casus/ağ giderleri + Tüccar kontratları
Net    = Gelir - Gider  → hazineye eklenir
```
- **Vergi** = nüfus × vergi oranı × moral çarpanı × (yaptırım çarpanı).
- **Ticaret geliri** = bağlı ticaret yolu/limanların değeri × ticaret
  verimliliği (bkz. §7).
- **Ordu bakımı:** Her birim günlük **altın + gıda** tüketir. Büyük ordu
  ekonomiyi eritir (EU4 mantığı).
- **Hazine eksiye düşerse:** borç → moral düşer, asker firarı, inşaat durur.

### 6.3 Vergi oranı
Oyuncu vergi oranını ayarlayabilir (düşük / normal / yüksek / ağır).
Yüksek vergi → daha çok altın, ama moral ve nüfus artışı düşer.

---

## 7. Ticaret, Tüccarlar ve Kervanlar

### 7.1 Ticaret yolları
- Haritada sabit **kervan yolları** ve **nehir su yolu** vardır.
- Şehrin hududu bir ticaret yoluna **değiyorsa / yakınsa**:
  - Doğrudan pazardan hammadde alıp satabilir (düşük maliyet, hızlı).
  - Pasif **ticaret geliri** elde eder.
- Nehir kıyısında **liman** varsa su yolu ticaretine katılır (daha yüksek
  hacim, daha hızlı).

### 7.2 Yola uzak şehirler — Tüccar gönderme
Ticaret yoluna uzak şehirler hammaddeyi **tüccar göndererek** alır:
1. Oyuncu bir **tüccar** görevlendirir (kervansaray kapasitesine bağlı).
2. Hedef pazar/ticaret noktası ve **alınacak mallar** seçilir.
3. **Maliyet:** malların fiyatı + **tüccar ücreti** (mesafeye ve yük
   miktarına göre) — peşin ve/veya varışta ödenir.
4. Tüccar haritada fiziksel olarak **gidip gelir** (yolculuk süresi, saatler).
5. Dönüşte mallar **depoya** eklenir (depo doluysa fazlası kaybolur/
   satılır).

### 7.3 Riskler
- Kervanlar yolda **haydutlar** veya **diğer oyuncular** tarafından
  yağmalanabilir.
- **Eskort** (asker) eklenebilir → güvenlik artar, maliyet ve süre artar.
- Savaş halindeki krallığın topraklarından geçen kervanlar risk altındadır.

### 7.4 Oyuncular arası ticaret
- Doğrudan takas teklifleri (X kereste ↔ Y altın).
- **Ticaret anlaşmaları** (diplomasi): iki krallık arasında süreli,
  karşılıklı ticaret bonusu.
- Ambargo uygulanabilir.

### 7.5 Fiyatlar
Pazar fiyatları **arz-talep** ile dinamik (basit model): çok satılan malın
fiyatı düşer, çok alınanın artar; zamanla dengeye döner.

---

## 8. Askeri Sistem

### 8.1 Birimler (ilk taslak)
- **Piyade** (mızrakçı, kılıçlı), **Okçu**, **Süvari**, **Kuşatma**
  (koçbaşı, mancınık), **Eskort/Muhafız**.
- Her birim: eğitim süresi, eğitim maliyeti, **günlük bakım** (altın +
  gıda), nüfustan **asker havuzu** tüketir.
- Taş-kağıt-makas benzeri basit karşıtlıklar (mızrak > süvari > okçu > piyade).

### 8.2 Ordu ve hareket
- Birimler **ordu** halinde gruplanır ve harita üzerinde gerçek zamanlı yol
  alır (yolculuk süresi saatler mertebesinde).
- Ordunun ikmali: kendi topraklarından uzaklaştıkça gıda tüketimi artar /
  yıpranma (attrition) — EU4 benzeri basitleştirilmiş.

### 8.3 Saldırı ve savunma (Tower Defense)
- Saldırıya uğrayan şehirde savaş **otomatik simüle edilir**: kuleler,
  surlar, garnizon birimleri savunur; saldıran birimler AI ile surları
  aşmaya çalışır (CoC tarzı).
- Savunma oyuncusu çevrimdışı olsa da savaş gerçekleşir; şehrin yerleşimi
  (sur düzeni, kule konumları) bu nedenle kritiktir.
- Saldırı sonucu: yağma (depolardan hammadde/altın), bina hasarı,
  moral kaybı. Şehir **tamamen yok edilmez**; hasar onarılabilir.
- **Savaş ilanı** gerekebilir (sürpriz saldırı diplomatik ceza getirir).
- Saldırı sonrası kısa süreli **koruma kalkanı** (sürekli ezilmeyi önler).

---

## 9. Krallıklar Arası İlişkiler (Crusader Kings tarzı)

### 9.1 Hanedan ve karakterler
- Her krallığın bir **hükümdarı (kral)** ve **kraliçesi** vardır.
  İleride: varis, danışmanlar, generaller gibi ek karakterler.
- Karakterlerin basit özellikleri olabilir (ör. "Yetenekli yönetici":
  +%5 vergi; "Sevilen kraliçe": +moral).
- **Kraliçe** şehrin moral kaynağıdır; varlığı bir moral bonusu sağlar.

### 9.2 Diplomatik durumlar
- **Barış**, **Ticaret anlaşması**, **İttifak**, **Saldırmazlık paktı**,
  **Savaş**, **Vasallık** (opsiyonel).
- **Evlilik ittifakı** (opsiyonel, ileride): hanedanlar arası bağ.
- Anlaşmaları bozmak **itibar (prestige/güvenilirlik)** kaybettirir.

### 9.3 İstihbarat ağı
Bir krallığa karşı entrika yapmadan önce **o krallıkta istihbarat ağı
kurulmalıdır**.
- **Casus İstihbarat Bürosu** binası casus yetiştirir.
- Casus hedef krallığa gönderilir; her gün ağın **gücü (0–100)** artar.
- Ağ kurmanın günlük maliyeti vardır (altın).
- Hedef krallığın **karşı istihbarat** yatırımı ağ büyümesini yavaşlatır
  ve casusları ifşa edebilir.
- Ağ gücü arttıkça açılan bilgiler / eylemler:

| Ağ gücü | Açılanlar |
|---|---|
| 10+ | Şehrin görünümü, ordu büyüklüğü tahmini (sis kalkar) |
| 30+ | Depo seviyeleri, hazine tahmini, inşaat kuyruğu |
| 50+ | Sabotaj (depo yakma, inşaatı geciktirme) |
| 70+ | **Kraliçeyi kaçırma**, suikast girişimleri |
| 90+ | Ayaklanma kışkırtma (opsiyonel) |

### 9.4 Suikast / Kaçırma operasyonları
- **Suikastçı birliği** istihbarat bürosunda yetiştirilir (pahalı, uzun
  eğitim).
- Operasyon başlatma şartı: hedefte yeterli ağ gücü.
- **Başarı şansı** = f(ağ gücü, suikastçı seviyesi, hedefin karşı
  istihbaratı, sarayın muhafızları).
- Sonuçlar:
  - **Başarı:** kraliçe kaçırılır (rehin olarak saldıran krallıkta tutulur).
  - **Başarısızlık:** suikastçılar yakalanır/ölür, ağ gücü düşer.
  - **İfşa:** hedef, operasyonu kimin yaptığını öğrenir → diplomatik
    ceza, otomatik savaş gerekçesi (casus belli).

### 9.5 Kraliçe kaçırıldığında / kraliçe yoksa
- **Kraliçesi olmayan** krallıkta kalıcı **moral cezası**.
- **Kraliçesi kaçırılan** krallıkta ek olarak **ani moral düşüşü** ve
  kraliçe geri dönene kadar süren **yaptırımlar**:
  - Vergi gelirinde azalma (ör. −%20)
  - Tarım/üretim veriminde azalma (depolara daha az mahsul girer)
  - Nüfus artışı yavaşlar
  - Asker morali düşer (savaş gücü azalır)
- **Kraliçeyi geri alma yolları:**
  - **Fidye** ödemek (kaçıranla müzakere)
  - **Kurtarma operasyonu** (kendi istihbarat ağın ile)
  - **Savaş** ile zorla geri almak
  - Belli süre sonra yeni kraliçe edinmek (ağır moral bedeli ile)
- Kaçıran taraf rehin kraliçeyi diplomatik koz olarak kullanabilir.

### 9.6 Moral sistemi (özet)
Moral 0–100 arası bir değerdir ve birçok sistemi çarpan olarak etkiler.

| Etkileyen (+) | Etkileyen (−) |
|---|---|
| Kraliçenin varlığı | Kraliçenin yokluğu / kaçırılması |
| Gıda fazlası | Gıda kıtlığı |
| Düşük vergi | Yüksek vergi |
| Zafer, festival, lüks mallar | Yenilgi, yağma, borç |
| Tapınak/eğlence yapıları (ileride) | Uzun savaş yorgunluğu |

Moral etkiler: vergi verimi, üretim, nüfus artışı, asker savaş gücü,
isyan riski.

---

## 10. Puanlama ve Sezon Sonu

Sezon sonunda sıralama birden fazla kategoride yapılır:
- **Toplam güç** (nüfus + ekonomi + askeri + toprak bileşik skoru)
- **En zengin**, **en kalabalık**, **en büyük toprak**
- **En başarılı entrikacı**, **en çok zafer**
Ödüller kozmetiktir (arma, unvan, rozet).

---

## 11. Çevrimiçi Altyapı Gereksinimleri (işlevsel)

- **Hesap sistemi:** kayıt/giriş (e-posta + OAuth seçenekleri).
- **Lobi tarayıcısı:** halka açık lobiler listesi, özel lobiye kodla katılım.
- **Sunucu otoriter (authoritative) mimari:** Tüm oyun durumu sunucuda;
  istemci yalnızca görüntüler ve komut gönderir (hile önleme).
- **Kalıcılık:** Oyuncular çevrimdışıyken dünya sunucuda işler; durum
  veritabanında saklanır.
- **Olay tabanlı simülasyon:** Uzun süreli işlemler (inşaat bitişi, kervan
  varışı) "bitiş zamanı" olarak saklanır ve zamanı gelince işlenir; her
  saniye her şeyi simüle etmeye gerek yoktur. Gerçek zamanlı simülasyon
  sadece aktif savaşlar ve izlenen alanlar için.
- **Bildirimler:** Saldırı, inşaat bitişi, kervan varışı, casus ifşası.
- **Sohbet:** Lobi geneli, diplomatik özel mesajlar.
- **Wipe otomasyonu:** Sezon sonu zamanlanmış görev.

---

## 12. Performans Hedefleri

- Harita chunk'lar halinde, görünür alan + tampon kadar render edilir.
- Sunucu tarafında **ilgi alanı (area of interest)** filtrelemesi: istemciye
  yalnızca görebildiği/istihbaratı olan veriler gönderilir (bu aynı zamanda
  savaş sisi hilesini önler).
- Hedef: 10–20 oyunculu bir lobi tek bir sunucu sürecinde rahatça
  çalışabilmeli; birden fazla lobi yatay ölçeklenebilmeli.
- İstemci orta segment bilgisayarlarda (ve ileride mobilde) akıcı çalışmalı.

---

## 13. Geliştirme Yol Haritası (öneri)

1. **Prototip (MVP):** Tek oyunculu yerel izometrik harita, karo yerleştirme,
   birkaç yapı (şehir merkezi, ev, tarla, depo), zamanlı inşaat, günlük
   ekonomi tick'i.
2. **Çok oyunculu çekirdek:** Hesap, lobi oluşturma/katılma, sunucu otoriter
   durum, kalıcılık.
3. **Ticaret:** Ticaret yolları, nehir/liman, tüccar gönderme, depolar.
4. **Askeri:** Kışla, birimler, ordu hareketi, sur/kule, otomatik savaş.
5. **Diplomasi & entrika:** Kraliçe, istihbarat ağı, suikast/kaçırma, moral.
6. **Sezon sistemi:** Wipe, sıralama, ödüller, halka açık lobiler.
7. **Cila:** Sanat, ses, bildirimler, denge ayarları.

---

## 14. Açık Sorular / Sonra Konuşulacaklar

Teknik detaylar ayrıca konuşulacak. Karar bekleyen başlıklar:

- **Platform:** Tarayıcı (web) mı, masaüstü mü, mobil mi? Hepsi mi?
- **İstemci motoru:** Örn. Phaser / PixiJS (web, 2D izometrik), Godot,
  Unity. 2D sprite mı, 3D model + izometrik kamera mı?
- **Sunucu:** Node.js (TypeScript), Go, C#, Rust? WebSocket protokolü?
  Hazır çözümler (Colyseus, Nakama) kullanılacak mı?
- **Veritabanı:** PostgreSQL + Redis gibi bir kombinasyon?
- **Barındırma:** Bulut sağlayıcı, lobi başına süreç/kapsayıcı modeli.
- **Kesin harita boyutu** ve chunk boyutu.
- **Savaş modeli:** Tamamen otomatik mi, yoksa saldıran oyuncu canlı
  yönetebilir mi?
- **Kraliçe dışı karakterler** (varis, generaller) ilk sürümde olacak mı?
- **Monetizasyon** (varsa) — yalnızca kozmetik olması önerilir.
- **Denge sayıları:** Tüm maliyet, süre ve oranlar bir yapılandırma
  dosyasında (ör. JSON/YAML) tutulacak, koda gömülmeyecek.

---

## 15. Claude İçin Çalışma Kuralları

- Bu dosya projenin **tek doğruluk kaynağıdır** (oyun tasarımı için).
  Mekanik değişikliklerinde önce burayı güncelle.
- Denge değerlerini (maliyet, süre, oran) **asla koda gömme**; yapılandırma
  dosyalarından oku.
- Oyun mantığı **sunucuda** çalışır; istemciye güvenme.
- Zaman tabanlı işlemleri "bitiş zamanı" olarak sakla; polling ile her şeyi
  simüle etme.
- Dil: Kod ve kod içi tanımlayıcılar **İngilizce**; tasarım belgeleri ve
  kullanıcıyla iletişim **Türkçe**.
- Teknik yığın kesinleştiğinde bu dosyaya **build/test/çalıştırma
  komutları** ve **dizin yapısı** bölümleri eklenecek.
