# CLAUDE.md — İzometrik Çok Oyunculu Strateji Oyunu

Bu dosya, projenin **oyun tasarım belgesi (GDD)** ve Claude için çalışma rehberidir.
Projede kod yazılırken burada tanımlanan oyun mantığı esas alınır. Bir mekanik
değişirse önce bu dosya güncellenir, sonra kod.

> Durum: **Prototip başlangıcı.** Teknik yığın seçildi (bkz. §16); kalan
> kararlar için bkz. [§14 Açık Sorular](#14-açık-sorular--sonra-konuşulacaklar).

---

## 1. Oyunun Özeti

İzometrik görünümlü, tarayıcı/istemci üzerinden **online** oynanan, **kalıcı
lobi** tabanlı bir şehir kurma + strateji oyunu.

| Esinlenilen oyun          | Bizdeki karşılığı                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Clash of Clans**        | Açık dünya haritası, her oyuncunun kendi şehri, savunma yapıları, oyuncu kapalıyken de dünya akmaya devam eder |
| **Age of Empires**        | Süreye dayalı inşaat, hammadde toplama/depolama, askeri birim üretimi                                          |
| **Europa Universalis IV** | Basitleştirilmiş ekonomi: periyodik vergi geliri, ticaret gelirleri, ordu bakım giderleri                      |
| **Crusader Kings**        | Krallıklar arası ilişkiler: hanedan/kraliçe, istihbarat ağları, suikast/kaçırma, moral ve yaptırımlar          |

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
- **Saat ve gece-gündüz:** Oyun saati duvar saatinden hesaplanır (gerçek
  saatin başı = gece yarısı, her gerçek dakika = 24 oyun dakikası), yani
  herkes aynı anda aynı saati görür. Arayüzde saat, gün (sezon başından),
  ay ve sezon ilerlemesi gösterilir. Harita saate göre renklenir: şafak,
  gündüz, gün batımı ve gece (loş mavi, harita okunur kalır). Akşamdan itibaren binaların
  ve hanların pencereleri (atölyede ocak ateşi) yanar; krallık adı ve
  harita yazıları geceden etkilenmez. Lobilerin
  sezon başlangıcı gelene kadar günler krallığın kuruluşundan sayılır
  (`packages/shared/src/clock.ts`).

**Tasarım ilkesi:** Oyuncu günde birkaç kez kısa oturumlarla girip anlamlı
kararlar verebilmeli; sürekli başında durmak zorunlu olmamalı. Kritik süreler
(inşaat, yolculuk) saatler mertebesinde, anlık müdahale gerektiren olaylar
(saldırı) bildirim ile duyurulmalı.

---

## 3. Lobi Sistemi ve Sezonlar

### 3.1 Lobi türleri

- Her oyuncu ana menüden **lobi açabilir** (ad, büyüklük **9 ya da 18 krallık**,
  isteğe bağlı **şifre**). Lobinin haritası yeni bir tohumdan sunucuda
  üretilir. Bir oyuncunun aynı anda en fazla **3 açık lobisi** olabilir.
- Açık lobilerin tümü listede görünür (dolu/şifreli olduğu, kurucusu,
  krallık sayısı ve sezon bitişiyle). **Şifreli** lobiye yalnızca şifreyi
  bilen katılır; şifre sunucuda yalnızca hash olarak tutulur.
- Kapasite dolunca lobi yeni oyuncu almaz. (İleride: sıra, davet linki.)

### 3.2 Lobi yaşam döngüsü

1. **Oluşturma** — harita üretilir (seed), oyuncu slotları açılır.
2. **Katılım** — oyuncuya **3 başlangıç yeri** rastgele atanır; yerini
   haritadan kendisi seçemez. Üç yer baştan yan yana büyük kartlarda
   gösterilir (biyom çarpanları ve arazi payları); oyuncu birini seçip
   krallığını kurar (bkz. §6.4).
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

Oyun **açık dünyadır**; harita büyük olmalı, krallıklar arasında geniş
tarafsız arazi (dağ, orman, göl, nehir, ticaret yolu, han) kalmalıdır.

- Şimdiki boyut: **1024×1024 karo** (32×32 chunk, chunk = 32×32 karo).
  Değerler `config/balance/map.json` içindedir.
- Haritanın kenarları ve köşeleri **yüksek, karlı dağ halkasıyla** çevrilidir
  (iç sınırı kıvrımlı, ~70 karo); dünya kenarda bitmiyor, dağların ardında
  sürüyormuş hissi verir. Ana nehir ve dereler halkadan **boğazlar** açarak
  çıkar. Hanlar ve başlangıç yerleri halkanın içinde kalır.
- **Chunk tabanlı çizim:** istemci yalnızca ekrana giren chunk'ları çizer ve
  önbelleğe alır.
- Dünya, lobi tohumundan (seed) **deterministik** üretilir
  (`packages/shared/src/worldgen.ts`); üretim oranları
  `config/balance/world.json` içindedir.
- Uzak bölgeler için **düşük detaylı (LOD) görünüm** ve **savaş sisi
  (fog of war)** — keşfedilmemiş/istihbaratı olmayan alanlar gizli.

### 4.2 Harita öğeleri

- **Arazi türleri:** Çayır (tarım verimli), orman (kereste), dağ/kayalık
  (taş, maden), bataklık (inşaat zor), çöl/kurak (verimsiz).
- **Nehir(ler):** Haritanın her bölgesinden dolanarak geçen bir **ana
  nehir** ve dağlardan doğup ona veya harita kenarına akan **dereler**.
  Amaç: hiçbir krallık suya uzak başlamasın.
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

### 4.2.1 Görsel dil

- Stil: **yüksek bitli (hi-bit) piksel art.** 1 karo = **64×32 sanat
  pikseli**. Her malzemenin (çim, kum, kaya, kar, su…) sınırlı bir renk
  rampası vardır; tonlar arası geçiş **dither** ile yapılır, yumuşak
  gradyan/bulanıklık kullanılmaz.
- **Yakınlaştırma kademelidir** (⅛×, ¼×, ½×, 1×, 2×, 3×); dokular en yakın
  komşu ile ölçeklenir, pikseller bozulmaz.
- Harita **karo karo görünmez.** Zemin, sürekli yükseklik/nem alanlarından
  piksel düzeyinde boyanır; arazi sınırları kıvrımlıdır.
- **Biyom geçişleri** (kaya, bataklık, çöl, orman, çayır, kumsal arasında)
  birkaç karoluk bir bantta olur, çizgi halinde değil. Sınırın bir
  kesiminden ötekine geçiş tipi değişir: **ince dither**, **leke/adacık**
  ya da **yırtık lifler**. Bant öncesinde komşu zemin serpiştirilir
  (çimde taş, çamur, kum; kayada yosun öbekleri; kumsalda çim) ve renk
  yumuşakça kayar (dağ eteğinde koyulaşan, çöle yaklaştıkça sararan çim).
  Orman ağaçları kenarda seyrelerek biter, bataklığa birkaç ağaç sızar.
- **Çıplak kayada ağaç olmaz**; onun yerine kaya oluşumları bulunur:
  sivri kayalıklar (zirvede karlı), katmanlı kaya tabakaları, üst üste
  yuvarlak kayalar, döküntü yığınları, iri kayalar ve eteklerde yosun /
  dağ çimi öbekleri. Ağaç yerleşimi zeminle aynı sınırı kullanır.
- **Zemin gerçekten eğimlidir.** Her karonun bir **yüksekliği** vardır
  (`World.height`, sunucu ve istemci aynı değeri üretir); zemin ekranda bu
  kadar yukarı kaydırılarak çizilir, öndeki arazi arkadakini örter.
  Ovalar ve ormanlar da **tepelidir** (suya yaklaştıkça sönen tepe gürültüsü,
  kıyılar ve vadi tabanları alçak kalır); dağlar sırtlı ve çok yüksektir.
  Işık sol üstten gelir (sola bakan yamaç aydınlık, sağa bakan gölgeli),
  zirveler karlıdır.
- Zemine oturan her şey (imleç, hudut çizgisi, ağaç, yapı) **araziye
  giydirilir**: imleç karesi yamaçta eğik görünür. Fare ile karo seçimi de
  yüksekliği hesaba katar.
- **Yollar ve nehirler kıvrımlıdır**; uzun dümdüz hatlar izometrik görünümü
  bozduğu için rota üretimi bilerek sapma ekler.
- **Nehir ve göl aynı sudur**, hepsi aynı su seviyesindedir. Nehir araziyi
  **vadi** olarak oyar: yatağından uzaklaştıkça zemin en fazla sabit bir
  eğimle yükselebilir. Böylece dağdan geçen ya da dağda doğan nehir
  havada kalmaz, bir vadinin tabanında akar.
- **Köprüler** yolun sudan geçtiği her yerde kurulur: kıyıdan kıyıya
  **düz** bir ahşap güverte, iki yanda korkuluk ve dikmeler, suya inen
  **ayak çiftleri** (dibinde köpük halkası). Güverte kıyılardan rampayla
  yükselir; parçalar piksel bazında derinlik testiyle çizilir, öndeki kıyı
  köprünün ucunu örter.
- **Taş köprüler:** Yol geçmeyen nehir kesimlerine de rastgele aralıklarla
  (tohumdan, `World.crossings`) kemerli **taş köprü** kurulur; iki yaka
  yürüyerek birbirine bağlanır. Kambur güverte, iki yanda korkuluk duvarı,
  sudan yükselen yuvarlak kemerler ve ayak diplerinde köpük. Ticaret
  köprülerine ve harita kenarındaki boğazlara yakın kurulmaz; aralık ve
  sınırlar `config/balance/world.json` içindedir.
- **Hanlar** bulundukları araziye göre farklı tiptedir
  (`apps/web/src/game/innSprites.ts`): çölde düz damlı, kubbeli kerpiç
  **kervansaray**; dağ yakınında arduvaz damlı **taş han**; ormanda saman
  damlı (bazen yosunlu) **kütük han**; diğer yerlerde kiremit ya da arduvaz
  damlı **yarı ahşap (bağdadi)** han. Bacalarından **duman** tüter (½× ve
  üstü; yükselir, büyür, rüzgârla sürüklenip söner).
- **Kervanlar:** Ticaret yollarında hanlar arasında sürekli gidip gelen
  deve kervanları dolaşır (önde tüccar, 2–4 yüklü deve, bazen mızraklı
  muhafız). Şimdilik yalnızca görseldir; konumları saatten hesaplanır,
  saklanmaz (`apps/web/src/game/caravans.ts`). Köprüde güverte üstünden
  geçerler; yolları bir handan geçiyorsa hana girip öbür kapıdan çıkarlar
  (hanın arkasında/içinde kalan üye gizlenir). ½× altındaki yakınlaştırmada gizlenirler.
- **Yaşayan dünya** (yalnızca görsel, saatten ve tohumdan hesaplanır,
  saklanmaz; `apps/web/src/game/ambient.ts`):
  - **Nehir akışı:** 1× ve üstü yakınlaştırmada nehir boyunca akış
    yönünde süzülüp belirip sönen kısa parıltılar. Öndeki yüksek arazinin
    ya da köprünün arkasında kalanlar çizilmez.
  - **Hayvanlar** bölgeye göre yaşar: orman kenarındaki çayırda geyik
    sürüleri (birinde boynuzlu erkek), açık çayırda yaban atı, yaban sığırı
    ve yaban koyunu sürüleri (atlar baskın değil), çayırda tavşan ve tilki; ormanda geyik, yaban domuzu,
    kurt sürüsü, tilki ve nadiren ayı; çölde ceylan sürüleri; kar sınırı
    altındaki dağda keçi ve yaban koyunu; göl ve nehirde ördek, gölde kuğu çiftleri;
    bataklıkta balıkçıl ve yaban domuzu. Evlerinin çevresinde dinlenip
    (otlayıp) yeni bir noktaya yürürler. Kara hayvanları **suyu geçmez**
    (su kuşları da karayı): durak noktası yuvadan düz bir çizgiyle
    yürünebilir olmalıdır; iki durak arasındaki yol nehri kesiyorsa hayvan
    yuvası üzerinden dolaşır.
  - **Kuşlar** haritanın üstünde V düzeninde uçar, yere gölge düşer.
    Hayvanlar ve kuşlar ½× ve üstünde görünür.
  - **Bulutlar:** ¼× ve altında yarı saydam, yavaş sürüklenen iri
    bulutlar ve gölgeleri; boyutları buluttan buluta değişir. Dört tip: kümülüs (yığın), stratus (uzun katman), sirrus
    (ince tüy) ve dağınık küçük kümeler.
- **Su** derinliğe göre bantlı renk değiştirir, kıyıda köpük ve kumsal
  (kumsal kıyı boyunca genişleyip daralır, bazı kesimlerde hiç yoktur ve
  çim suya iner),
  yüzeyde parıltı çizgileri taşır. Çayırda çimen dokusu ve çiçekler,
  ormanda ağaçlar bulunur.
- Karo ızgarası çizilmez; yalnızca **imlecin altındaki karo** vurgulanır.
  Hudut içinde parsel çizgileri çok silik gösterilir.
- Arayüz yazı tipi Pixelify Sans'tır; ondaki 2 ve 5 zor okunduğu için
  **rakamlar Tiny5** ile çizilir (`apps/web/src/fonts.ts`). Büyük sayılar
  1,2K / 3,4M diye kısaltılır.
- Görseller şimdilik **kodla üretilir** (`apps/web/src/game/sprites.ts`);
  ileride aynı ölçüde çizilmiş sprite'larla değiştirilebilir.

### 4.3 Harita üretimi

Prosedürel (seed tabanlı), ama **adil başlangıç** kurallarıyla:
her oyuncunun başlangıç bölgesinden bir ticaret yoluna veya nehre makul
uzaklık olmalı; kimse tamamen dezavantajlı başlamamalı.

---

## 5. Şehir ve İnşaat

### 5.1 İnşaat alanı (Toprak / Hudut)

- Her oyuncu harita üzerinde bir **başlangıç bölgesi** ile başlar.
- Yalnızca **kendi hududu** içinde inşa edebilir.
- Hudut (inşa edilebilir alan) merkez etrafında bir **karedir** ve aşamalı
  büyür: **8×8 → 10×10 → 12×12 → 14×14 → 16×16 parsel**. Büyüme **sarayın
  seviyesine** bağlıdır (saray 1. seviye → 8×8, her seviye +2 parsel, 5. → 16×16); oyuncu boyutu
  elle seçemez, sarayı yükseltir. Yükseltme bitince hudut genişler; kare
  merkezini korur. Hudut haritada **kesikli** sarı çizgiyle gösterilir.
- Krallık kurulurken oyuncu krallığına bir **isim** ve bir **renk** verir.
  Lobi, büyüklüğü kadar renk sunar (9 ya da 18; `packages/shared/src/colors.ts`)
  ve **bir renk lobide yalnızca bir krallığındır**: alınmış renk seçilemez. Sarayın
  çatıları bu renkte çizilir. İsim, harita
  uzaklaştırıldığında (½× ve altı) isim hududun üzerinde yazar.
- **1 parsel = 4×4 karo** (yani 32×32 karodan 64×64 karoya). Değerler
  `config/balance/territory.json` içindedir.
- Karenin içinde **yerleşim tamamen oyuncuya aittir**: neyi nereye inşa
  edeceğini, şehrin şeklini kendisi belirler.
- Başlangıç yeri, son aşamadaki karenin haritaya sığdığı ve neredeyse
  tamamı inşa edilebilir arazi (göl/nehir/dağ değil) olan bir noktadır.

### 5.1.1 Karo inşa kuralları

| Karo                                         | Kural                    |
| -------------------------------------------- | ------------------------ |
| Su (göl, nehir), dağın içi, yol, han         | İnşa edilemez            |
| **Kıyı** (suya komşu kara karosu)            | Yalnızca **iskele/liman** |
| **Yol kenarı** (ticaret yoluna komşu karo)   | Yalnızca **ticaret noktası** |
| **Dağ eteği** (karaya komşu dağ karosu)      | Yalnızca **tünel**       |
| Diğer kara karoları                          | Serbest                  |

- İskele **2×2 karo** kaplar; en az bir karosu kıyı olmalı, hiçbiri su/dağ
  olmamalıdır.
- Ticaret noktası da **2×2 karo** kaplar; en az bir karosu yol kenarı
  olmalıdır.
- **Arsa hakları (önceden belirli):** Yer atandığı anda her krallığın bir
  **iskele arsası** ve bir **ticaret arsası** belirlenir. Hududunda uygun
  kıyı / yol kenarı varsa arsa oradadır; yoksa hududun dışında **yürüme
  mesafesi en kısa** 2×2 arsa verilir. Yürüme kara ve köprü üzerindendir;
  su ve dağ dolanılır (kuş uçuşu değil).
- Bu mesafenin kısa kalması için dünya üretimi, haritanın her bölgesinden
  geçen kıvrımlı bir **ana nehir** çizer (§4.2).
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

| Kaynak                    | Kaynağı               | Kullanım                            |
| ------------------------- | --------------------- | ----------------------------------- |
| **Altın (para)**          | Vergi, ticaret, satış | Her şey; tüccar ücreti, asker maaşı |
| **Gıda**                  | Tarlalar, ithalat     | Nüfus ve ordunun tüketimi           |
| **Kereste**               | Oduncu, ticaret       | İnşaat                              |
| **Taş**                   | Taş ocağı, ticaret    | İnşaat, surlar                      |
| **Demir**                 | Maden, ticaret        | Silah, ileri yapılar                |
| _(opsiyonel)_ Lüks mallar | Ticaret               | Moral, diplomasi hediyesi           |

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

### 6.4 Prototip ekonomisi (şu an uygulanan)

> "Her şey parayla başlar." İlk sürümde ekonomi sadeleştirilmiştir; süreler
> denemek için **saniye** mertebesindedir. Değerler
> `config/balance/economy.json`, mantık `packages/shared/src/economy.ts`.

- **Kaynaklar:** Altın + 3 hammadde: **Yemek**, **Yapı malzemesi**,
  **Savaş malzemesi**. Başlangıçta her birinden bir miktar stok verilir.
- **Kuruluş:** Hazır şehir düzeni yoktur. Krallık kurulunca oyuncu önce
  **Sarayını** hudut içinde istediği yere yerleştirir (ücretsiz, anında);
  ev, tarla vb. her şeyi de kendisi yerleştirir. Ticaret arsasına
  **ücretsiz 1. seviye ticaret noktası** kurulur. Saray birkaç saray
  hizmetlisi (köylü) barındırır.
- **Ticaret noktası:** Kurulduğu an oyuncu satılacak malı seçer (3
  hammaddeden biri; sonradan değiştirilebilir). Tüccar her **10 saniyede**
  seçilen maldan bir miktar götürüp satar ve altın getirir. Seviye
  yükseldikçe sefer başına satılan miktar artar.
- **İnşa menüsü:** Altın (ve yapı malzemesi) harcanarak ev, tarla, oduncu
  kampı, silah atölyesi kurulur. Yapılar süreyle inşa edilir (iskele
  görünür), aynı anda en fazla 2 inşaat yürür. Yalnızca hudut içinde,
  serbest karoya kurulur; altındaki ağaçlar temizlenir.
- **Nüfus:** Evler köylü verir, üretim binaları işçi ister; köylü yetmezse
  binalar orantılı daha az üretir. Köylüler her üretim turunda yemek yer.
- **Biyom çarpanları:** Yerin çevresindeki araziye göre üretim çarpanı:
  nehir/göl (balık) ve çayır (tarım) → yemek; orman → yapı malzemesi;
  dağ → savaş malzemesi; bataklık hepsini biraz düşürür, kurak yemeği
  düşürür. Çarpanlar kuruluşta sabitlenir.
- **İskele:** Krallığın önceden belirli iskele arsasına kurulur (yer
  seçilmez, tek tane). Balık tutar (yemek). İskelenin ahşap kısmı arsanın
  en açık suya bakan kenarından nehre/göle doğru uzanır.
- **Eğim:** Yokuşa kurulan yapı, en yüksek köşesi hizasında düz bir taş
  kaide üzerinde durur (tarlada toprak set); kaide aşağıdaki zemine iner.
- **Patikalar:** Her yapının kapısından saraya, yapıların etrafından
  dolaşan toprak patikalar zemine işlenir.
- **İnşa menüsü (devam):**
  - **Sur ve ev** basılı tutup sürükleyerek sıra hâlinde yerleştirilir;
    onay penceresi adedi ve toplam maliyeti gösterir. Sur parçaları inşaat
    sırasına girmez (aynı anda kurulur); evler sıraya girer, yer boşaldıkça
    başlar.
  - **Surlar insanları da tutar:** köylüler ve tüccar saraydan yürüyerek
    çıkar; ayakta duran sur parçasından geçemez, yalnızca **sur kapısından**
    (saray 2. seviye, 1 karo) ya da yıkık bir sur kesiminden geçer. Saraydan
    yürüyerek ulaşılamayan bina çalışmaz ("Sur arkasında kaldı"); surla
    çevrilmiş ticaret noktası ya da surun içinde kalan tüccar hiçbir şey
    satmaz. Ordular bundan etkilenmez; kuşatmada kapı sur sayılır
    (`packages/shared/src/walls.ts`).
  - **İlk oduncu kampı, ilk ev ve ilk tarla ücretsizdir** (bir kez), böylece
    bütün malzemesini harcayan oyuncu kilitlenmez.
  - **Ev ve nüfus sınırı:** Evler (ve sarayın kendi odaları) nüfus
    sınırından (saray seviyesi × 16) fazla barınak sağlayamaz. Planlanan
    barınak (inşaattakiler ve yükseltilenler hedef seviyesiyle sayılır)
    sınıra ulaşınca yeni ev kurulmaz, ev yükseltilmez; sarayı yükseltmek
    gerekir.
  - **Saray 4. ve 5. seviye** çok pahalı ve uzundur (savaş malzemesi de
    ister; `economy.json`).
  - Saray ve ticaret noktası dışındaki her yapı **yıkılabilir**: inşa ve
    yükseltme maliyetinin yarısı geri döner (ücretsiz ilk yapının inşa
    maliyeti dönmez).
- **Ticaret noktası:** satılacak mal yerine **hiçbir şey satma** da
  seçilebilir (tüccar evde bekler). Sefer başına kazanç lobinin anlık
  fiyatından gösterilir. Ticaret menüsünde satış seçimi en üsttedir;
  **pazara tıklamak da ticaret menüsünü açar** (fiyatlar ve alım tek
  satırda üç sütun).
- **Yokluk cezası:** Oyuncunun son görülmesinden (her komut ve oyun
  açıkken birkaç dakikada bir) 1 saat sonra, geçen her saat binaların
  üretimi, vergi ve tüccarın altını %10 azalır (en az %20'ye kadar;
  `economy.json` → `idle`). Diğer oyuncular Krallıklar sekmesinde
  "çevrimiçi / X önce görüldü" bilgisini görür.
- **Duman:** Bacası olan her yapıdan (ev, atölye, oduncu, ticaret evi,
  iskele) hareketli duman yükselir.
- **Bina seviyeleri:** Ev, tarla, oduncu kampı, silah atölyesi ve iskele
  **1–3. seviyededir**. Yükseltme altın + yapı malzemesi ve süre ister,
  inşaat kuyruğundan bir yer tutar; sürerken bina iskeleye döner ve
  üretmez. Her seviye daha çok üretir / daha çok köylü barındırır ve daha
  çok işçi alabilir; her seviyenin **kendi görseli** vardır.
- **Bina menüsü:** Haritada bir binanın üstüne gelince bina dış hatla
  vurgulanır ve adı/seviyesi küçük bir etikette görünür; tıklayınca o
  binanın menüsü açılır. Menüde:
  - **İşçi sayısı:** 0 ile seviyenin üst sınırı arasında ayarlanır
    (varsayılan: tam kadro). Üretim, atanan işçiyle orantılıdır; toplam
    atanan işçi köylü sayısını aşarsa hepsi orantılı yavaşlar.
  - **Ürün seçimi:** Tarla **buğday** (yemek) ya da **keten** (yapı
    malzemesi, daha düşük oranda) eker. Silah atölyesi **demir dökümü**
    (savaş malzemesi, arazi çarpanıyla) yapar ya da hammaddeden silah
    işler: **kılıç** (savaş malzemesi), **kalkan** (savaş + yapı
    malzemesi), **yay ve ok** (yapı malzemesi). Silahlar **cephanelikte**
    birikir (Depo sekmesinde görünür) ve ileride ordu eğitiminde
    kullanılacaktır. Hammadde yetmezse yetebildiği kadar işlenir.
  - Ticaret noktası menüsü ticaret ayarlarını, saray menüsü krallık
    özetini açar.
- Köylüler, tüccar ve hayvanlar yapıların **içinden geçmez**: köylüler
  yapıların etrafından yol bulur, hayvanlar yapı karolarında durmaz; bir
  yapının arkasında kalan yürüyen yapının arkasında çizilir. Tarlalar düz
  olduğu için üstünde yürünebilir.
- Durum sunucudadır (§11.1): her komut `command` Edge Function'ında aynı
  `advance` ve kurallarla doğrulanır; istemci sonucu beklerken komutu
  yerelde uygular, reddedilirse sunucunun durumuna döner.
- **Başka krallıklar:** Lobideki diğer krallıkların hududu kendi
  renginde kesikli çizgiyle, binaları haritada görünür (tıklanamaz);
  depoları gizlidir. Yeni bir krallığın yeri, son aşamadaki hududu başka
  hudutlara `kingdomGapTiles` karodan yakın olmayacak şekilde seçilir.

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

### 8.2.1 Emir gecikmesi (elçi)

- Yoldaki orduya **anlık emir verilemez.** Yön değiştirme, geri çağırma,
  hedef değiştirme gibi emirler komutana **elçi** ile ulaştırılır.
- Elçinin orduya ulaşması süre alır: canlı oyunda **12 oyun saati = 30
  gerçek dakika**; test aşamasında **30 saniye**
  (`config/balance/time.json` → `messengerDelayGameDays`; canlıya geçerken
  0.5 yapılacak). Emir, elçi
  vardığında (`effective_at`) yürürlüğe girer; o ana kadar ordu mevcut
  emrini uygulamaya devam eder. Böylece ordu sistemi tam gerçek zamanlı
  değildir: her ordunun en az 30 dakikalık geleceği önceden bellidir.
- Kendi yerleşiminde/garnizonunda bekleyen orduya emir anında verilir.
- Sunucuda ordu konumu saklanmaz; rota `path`, `depart_at`, `arrive_at`
  olarak tutulur, konum bu değerlerden hesaplanır. Oyuncu oyunu kapatsa da
  ordusu yoluna devam eder; **diğer oyuncular onu aynı formülle yolda ve
  savaşta görür.**
- **Bölme / birleşme:** Ordu bölünürse her parça ayrı bir ordudur (kendi
  rotası, kendi karşılaşmaları). Bölme de bir emirdir; elçi vardığında
  ordunun o anki konumunda iki ordu oluşur. Aynı karodaki dost ordular
  birleş emriyle tek orduya döner.

### 8.2.2 Meydan muharebesi (yolda karşılaşma)

- Savaş halindeki iki krallığın orduları yolda **aynı karoda/yakınında aynı
  anda** bulunursa meydan muharebesi olur.
- Emirler gecikmeli olduğu için rotalar önceden bellidir: karşılaşma, bir
  emir yürürlüğe girdiğinde rotaların zaman-mekân kesişimi hesaplanarak
  **zamanlanmış olay** olarak kaydedilir; sürekli konum taraması yapılmaz.
- Bir rota değişirse o orduya ait bekleyen karşılaşmalar silinir ve
  yeniden hesaplanır. Taraflar çevrimdışı olsa da savaş zamanında olur
  (bkz. §11.1 olay işleyici).
- **Takviye:** Aynı muharebe noktasına bir pencere içinde (ayar) varan dost
  ordular aynı savaşa katılır; muharebe anlık değil, süreli bir olaydır.
- Muharebe otomatik çözülür (canlı yönetim yok), sonucu olay kimliğinden
  türeyen tohumla deterministiktir; istemci sonucu aynı tohumdan birkaç
  karelik basit bir animasyonla gösterir.
- Aynı mekanik kervan yağması (§7.3) için de kullanılır.

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

| Ağ gücü | Açılanlar                                            |
| ------- | ---------------------------------------------------- |
| 10+     | Şehrin görünümü, ordu büyüklüğü tahmini (sis kalkar) |
| 30+     | Depo seviyeleri, hazine tahmini, inşaat kuyruğu      |
| 50+     | Sabotaj (depo yakma, inşaatı geciktirme)             |
| 70+     | **Kraliçeyi kaçırma**, suikast girişimleri           |
| 90+     | Ayaklanma kışkırtma (opsiyonel)                      |

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

| Etkileyen (+)                      | Etkileyen (−)                    |
| ---------------------------------- | -------------------------------- |
| Kraliçenin varlığı                 | Kraliçenin yokluğu / kaçırılması |
| Gıda fazlası                       | Gıda kıtlığı                     |
| Düşük vergi                        | Yüksek vergi                     |
| Zafer, festival, lüks mallar       | Yenilgi, yağma, borç             |
| Tapınak/eğlence yapıları (ileride) | Uzun savaş yorgunluğu            |

Moral etkiler: vergi verimi, üretim, nüfus artışı, asker savaş gücü,
isyan riski.

### 9.7 Prototip: krallıklar arası katman (şu an uygulanan)

Değerler `config/balance/society.json`, `market.json`, `diplomacy.json`,
`espionage.json`, `military.json`; mantık `packages/shared/src/` altında
(`society.ts`, `market.ts`, `realm.ts`, `diplomacy.ts`, `espionage.ts`,
`military.ts`, `units.ts`). Sunucuda `supabase/functions/command` (oyuncu
komutları) ve `supabase/functions/tick` (kendiliğinden olanlar; pg_cron her
dakika, iş varken) çalışır. Ekonomi gibi süreler prototipte saniye/dakika
mertebesindedir.

**Saray seviyesi ve nüfus**

- Sarayın her seviyesi bir **nüfus sınırı** verir: 16 / 32 / 48 / 64 / 80
  (seviye × 16). Köylü + asker bu sınırı aşamaz; evler sınırın üstünde
  köylü vermez.
- **2. seviye saray** şunları açar: kışla, casus evi, gözcü kulesi, sur,
  pazar ve kraliçe.

**Vergi ve mutluluk**

- Vergi oranı: düşük / normal / yüksek / ağır. Her üretim turunda köylü
  başına altın getirir (oran yükseldikçe daha çok).
- **Mutluluk** (0–100) her tur bir hedefe doğru yavaşça kayar. Hedef:
  taban + vergi etkisi (düşük +, ağır −−) + kraliçe + gıda (açlık −).
- Mutluluk **asker olmaya gönüllü** halkı ve asker maliyetini belirler:
  mutlu halkın yaklaşık yarısı, mutsuz halkın beşte biri kadarı asker
  olmaya razıdır; mutsuz halk daha pahalıya asker olur. (Ör. 32 nüfus:
  mutluyken ~16, mutsuzken ~6–8 gönüllü.)
- **Kraliçe:** 2. seviye saray ve en az belirli nüfus ister, altınla
  edinilir; mutluluk hedefini yükseltir. Casuslarca kaçırılabilir (aşağı).
- **Asker havuzu** (EU4 manpower): asker olmaya razı halkın havuzu her
  üretim turunda saray seviyesiyle orantılı dolar; tavanı mutlulukla
  belirlenir (mutlu halkın ~yarısı, mutsuzun ~beşte biri). Eğitim havuzdan
  düşer.

**Gece ve gece mesaisi**

- Oyun saatinde **gece** (22:00–04:00, haritanın karardığı saatler) halk
  dinlenir: binalar **%50** hızla üretir.
- Halk sekmesinden **gece mesaisi** açılabilir: gece de tam çalışılır ama
  mutluluk hedefi düşer ve her gece turunda **yorgunluk** birikir;
  yorgunluk gündüz dahil bütün üretimi azaltır (en fazla %60), mesai
  kapalıyken yavaşça geçer.

**Pazar ve lobi fiyatları**

- Her lobinin **ortak bir fiyat tablosu** vardır. Ticaret noktası mal
  sattıkça o malın fiyatı lobi genelinde düşer; pazardan alındıkça artar.
  Fiyatlar zamanla taban değerlerine geri döner.
- **Pazar** binası (2. seviye saray) altınla hammadde satın almaya yarar;
  alış fiyatı lobi fiyatının biraz üstündedir.

**İlişkiler ve diplomasi**

- Her krallık çiftinin bir **ilişki** puanı vardır (−100…+100, başta 0);
  zamanla yavaşça sıfıra döner. İlişkiler, ittifaklar, savaşlar ve
  haraçlar lobide herkese açıktır.
- Diplomatik işler **elçi** ile yapılır; elçi karşı sarayda varınca
  (birkaç dakika) teklif karşı tarafa düşer. Cevapsız teklif süresi
  dolunca reddedilmiş sayılır.
  - **İlişki geliştir:** altın karşılığı ilişki artar (bekleme süresiyle).
  - **Hediye:** altın gönderilir, miktarla orantılı ilişki artar.
  - **Haraç iste:** Kabul edilirse ilişki −5 düşer ve her üretim turunda
    haraç ödeyenden isteyene altın akar; iki tarafın gelir/gider
    tablosunda hangi krallıkla olduğu yazar. **Reddedilirse** ilişki çok
    düşer. Kabul edip sonra **haracı kesen** daha çok kaybeder. İsteyen
    haracı kendisi kaldırabilir.
  - **İttifak teklifi:** en az **+50** ilişki ister. İttifakı bozmak
    ilişkiyi çok düşürür.
  - **İtibar:** Bir krallığın −20'nin altındaki ilişkileri toplandıkça
    itibarı düşer (en fazla %60): elçilerinin ilişki geliştirmesi ve
    hediyeleri o oranda az etki eder. **Haracı kesen**, haraç alanla −45'in
    yanında diğer bütün krallıklarla −5 ilişki kaybeder ve haraç alan savaş
    gerekçesi kazanır.
  - **Hakaret:** elçi hakaret götürür (bekleme süresiyle); varınca ilişki
    −25 düşer ve hakarete uğrayan savaş gerekçesi kazanır.
  - **Ticaret yolu yağması:** garnizondan 10 asker (bekleme süresiyle,
    müttefike yapılamaz) hedefin tüccarını basar. Şans %75'ten başlar,
    hedefin ticaret noktası yakınındaki (8 karo) her gözcü kulesi %15
    düşürür (en az %15). Başarıda sattığı maldan 3 seferlik pay alınır ve
    **ticaret noktası harap olur**: sahibi altın + malzemeyle onarana kadar
    tüccar satış yapamaz. Her durumda saldıran asker kaybeder (başarıda
    %10, başarısızlıkta %40), ilişki −30 düşer ve hedef savaş gerekçesi
    kazanır.
  - **Savaş ilanı:** ilişki en fazla **−50** olmalı; **savaş gerekçen**
    (casus belli) varsa **−20** yeter. Gerekçesiz savaş açan, lobideki
    diğer bütün krallıklarla −10 ilişki kaybeder.
  - **Savaş gerekçesi** belli bir süre için doğar: casusu yakalanan,
    haracı reddedilen, haracı kesilen, ittifakı bozulan, kraliçesi
    kaçırılan ya da sabotaja uğrayıp sabotajcıyı yakalayan taraf, karşı
    tarafa karşı gerekçe kazanır.
  - **Savaş puanı** (−100…100, EU4 gibi): iki taraf arasındaki
    muharebelerden (kazanılan/kaybedilen, öldürülen/kaybedilen asker) ve
    alınan saraylardan hesaplanır.
  - **Barış şartları:** beyaz barış, altın iste (her 20 altın 1 puan),
    haraç iste (en az 40 puan), altın öde. Savaş puanı **100** olan tarafın
    teklifi varınca kabul edilmiş sayılır (dayatılan barış).
- Krallıklar sekmesinde müttefikler ayrı listelenir. Bir krallığa
  tıklayınca (EU4 gibi) ilişkisi, müttefikleri, savaşları, haraçları,
  diğer krallıklarla ilişkileri ve casusluk ağının izin verdiği ölçüde
  tahmini hammaddeleri ve ordusu görünür.

**Casusluk**

- **Casus evi** (2. seviye saray) zamanla casus yetiştirir (altınla,
  seviyeye göre kapasite).
- Casus panelinden bir casus **bir krallığa ve bir konuya** gönderilir:
  **Hammadde**, **Ordu** ya da **Diplomasi**; ya da evde **karşı
  casusluk** için tutulur.
- Her (hedef, konu) için **ağ gücü** (0–100) casus orada kaldıkça artar;
  hedefin karşı casusluğu (evdeki casuslar + casus evi seviyesi) artışı
  yavaşlatır.
- Rapor tahminidir: ağ gücü arttıkça hata payı küçülür (ör. "120–180
  yemek"). Diplomasi konusu hedefin yoldaki elçilerini ve casuslarını
  gösterir.
- Hedefin seninle **ilişkisi kötüyse** seni gözler: kötü ilişki karşı
  casusluğa eklenir (−100'de +2), ağ daha yavaş kurulur, casus daha
  çabuk yakalanır.
- Casusun **yakalanma** anı görev başında hedefin karşı casusluğuna göre
  belirlenir; yakalanınca casus ölür, hedef kimin gönderdiğini öğrenir,
  ilişki düşer ve hedef savaş gerekçesi kazanır.
- Ordu konusundaki ağ %30'u geçince ordunun **birlik türleri** de tahmin
  edilir.
- **Operasyonlar** (CK gibi), hedefteki en güçlü ağdan yapılır ve altına
  mal olur; başarı şansı ağ gücüyle artar, hedefin karşı casusluğuyla
  düşer. Başarısız operasyon casusu kaybettirir ve kimin yaptığını
  ortaya çıkarır.
  - **%50 sabotaj:** depoları yak (yemek ve yapı malzemesinin dörtte
    biri) ya da süren inşaatları geciktir.
  - **%70 kraliçeyi kaçır:** kraliçe kaçıranın elinde rehin kalır; kaçırılan
    krallığın mutluluğu hemen düşer ve rehinlik sürdükçe düşük kalır. Geri
    almanın yolları: **fidye** ödemek, kaçıranın kendi isteğiyle **serbest
    bırakması** (+ilişki) ya da kazanılan savaş gerekçesiyle savaş.
  - **%90 isyan kışkırt:** on dakika üretim yarıya iner ve mutluluk düşer.

**Ordu**

- **Kışla** (2. seviye saray) asker havuzundan, altın ve malzemeyle
  **birlik** yetiştirir (AoE gibi taş-kağıt-makas):
  - **Mızrakçı** (savaş malzemesi): süvariyi yener, okçuya yenilir.
  - **Okçu** (cephanelikten yay): mızrakçıyı yener, süvariye yenilir.
  - **Süvari** (2. seviye kışla; yemek + savaş malzemesi): okçuyu yener,
    mızrakçıya yenilir, daha sert vurur.
  - **Mancınık** (2. seviye kışla): sahada zayıf; kuşatmada her biri birkaç
    surun savunma bonusunu siler ve kazanılan kuşatmada daha çok sur yıkar.
  Askerler sarayda garnizon olur ve her tur altın ve yemek tüketir.
  Garnizondaki askerler **terhis** edilebilir: köylüye döner ve asker
  havuzuna geri sayılır (eğitim maliyeti geri gelmez).
  Birlik karışımları arasındaki üstünlük zara bonus olarak eklenir.
- Garnizondan istenen birliklerle **ordu** çıkarılır; ordu haritada yürür (konumu yol ve
  zamanlardan hesaplanır). Hududu dışındaki orduya emirler elçiyle gider
  (§8.2.1; testte 30 sn, canlıda 30 dk). Bir krallığın sahada **en fazla 2 ordusu** olur: ordu
  ikiye bölünebilir (her tür orantılı ayrılır); aynı krallığın iki ordusu
  **5 karo** yakınlıktaysa birleşebilir.
- Savaştaki iki krallığın orduları karşılaşınca **muharebe** olur
  (§8.2.2). **Müttefik orduları** muharebe noktasına yakınsa kendi
  tarafına katılır ve korur. Sonuç tohumla deterministiktir; yenilen
  ordu kalanlarıyla eve döner.
- Savaştaki düşman sarayına varan ordu **kuşatma** yapar: garnizon,
  **gözcü kuleleri** (menziline giren düşmana hasar verir, yoldan
  geçenlere de) ve **surlar** (savunmayı güçlendirir, kuşatmada hasar alır,
  yıkılan sur onarılmalıdır) savunur. Kazanan saldıran depolardan yağma
  alır.
- **Gözcü kuleleri muharebede:** Bir muharebenin yakınındaki (8 karo) kuleler
  sahiplerinin tarafına zar bonusu verir ve her tur birkaç düşman vurur;
  meydan muharebesinde iki taraf için de geçerlidir. Garnizonu boş saray
  kuşatılırsa kuleler birkaç tur direnir ve saldırana kayıp verdirir, sonra
  saray düşer.
- **Moral** (0–100, ordu başına): yürürken düşer; durunca kendi
  topraklarında toparlanır, bir **hanın** yakınında çok daha hızlı
  toparlanır, açık arazide yavaşça sarkar.
- **Saha bilgisi** (0–100): ordu bir yerde durdukça artar, kamptan
  uzaklaştıkça azalır; zara en fazla +1,5 ekler.
- **Muharebe turları** (EU4 gibi): her tur (30 sn) iki taraf da d10 atar,
  zara saha bilgisi (kuşatılan saray için kule ve sur bonusu) eklenir;
  sonuca göre karşı taraf asker ve moral kaybeder. Morali ya da askeri
  biten taraf yenilir; son turda (14.) saldıran çekilir. Savaşlar ~8 tur sürer
  ve tur tur izlenebilir (zarlar, bonuslar, moral, kayıplar). Yenilen ordu
  eve çekilir ve eve varana kadar yeniden yakalanamaz.
- Savaştayken elçiler yalnızca barış götürür (ilişki geliştirme, hediye ve
  haraç isteği olmaz).
- Haritada ordular krallığın sancağıyla görünür; oyuncunun yoldaki
  ordularının rotası kesikli çizgiyle çizilir, muharebeler çapraz kılıçla
  işaretlenir. Başkasının ordusunun gücü yalnızca casusla tahmin edilir.
- Muharebe başlayınca ve bitince **elçi** ekranda bir pencereyle haber
  verir (kim, nerede, sonuç, kayıplar).

### 9.8 Prototip: kurumlar ve günün olayları (şu an uygulanan)

Değerler `config/balance/institutions.json`, mantık
`packages/shared/src/institutions.ts`. Üç bina da 2. seviye saray ister,
krallıkta birer tane olur ve 3 seviyelidir.

- **Üniversite:** Aynı anda bir **araştırma** yürütür (altın/malzeme ve
  süre). Daha ileri araştırmalar daha yüksek üniversite seviyesi ister:
  - 1: **Mimarlık** (inşaat kuyruğu 2 → 3), **Keten tarımı** (tarla keten
    ekebilir; öncesinde yalnızca buğday), **Sulama** (tarla +%20),
    **Balıkçılık** (iskele +%25).
  - 2: **Ormancılık** (oduncu +%20), **Metalurji** (atölye +%20), **Tıp**
    (hastalık yarıya, iyileşme ×1,5), **Muhasebe** (vergi +%15).
  - 3: **Savaş taktikleri** (zar +0,5), **Ticaret hukuku** (tüccar +%25).
- **Hastalık ve hastane:** Köylülerin bir payı hastadır; hasta köylü
  çalışmaz, vergi vermez ve mutluluğu düşürür. Her tur birkaç kişi
  hastalanır (hasta çoksa, açlıkta ve soğukta daha hızlı yayılır) ve
  hastalar kendiliğinden yavaşça iyileşir. **Hastane** doktorlarıyla (işçi)
  her tur hastaların bir payını daha iyileştirir.
- **Tapınak:** Mutluluk hedefini yükseltir; askerler **iman gücüyle** zara
  bonus ekler (seviyeyle artar). **Vaaz:** altınla, bekleme süresiyle;
  bir süre verginin mutluluğa olumsuz etkisi azalır ("vergiler iyidir").
- **Günün olayları:** Her krallığın başına ara sıra (5 dakikalık
  pencerelerde, ~%60 şansla) birkaç dakika süren bir olay gelir: kavurucu
  güneş (yemek −%30), bereketli yağmur, salgın (bir anda hastalık), halk
  şenliği, orman yangını, maden damarı, gezgin tüccarlar, ambar yangını,
  define, soğuk dalgası, hacılar. Olay krallıktan ve zamandan
  deterministik hesaplanır (saklanmaz; sunucu ve istemci aynı olayı
  görür); anlık etkileri (kayıp, define, salgın) başladığı üretim turunda
  bir kez uygulanır.
- **Günlük:** Olaylar ayrı (mor) kâğıtta, elçinin diğer krallıklardan
  getirdiği haberler (savaş, teklif, casus…) ayrı (mühürlü) kâğıtta yazılır.

---

## 10. Puanlama ve Sezon Sonu

Sezon sonunda sıralama birden fazla kategoride yapılır:

- **Toplam güç** (nüfus + ekonomi + askeri + toprak bileşik skoru)
- **En zengin**, **en kalabalık**, **en büyük toprak**
- **En başarılı entrikacı**, **en çok zafer**
  Ödüller kozmetiktir (arma, unvan, rozet).

---

## 11. Çevrimiçi Altyapı Gereksinimleri (işlevsel)

- **Hesap sistemi:** e-posta + şifre ile kayıt/giriş (anonim giriş yok).
  Kayıtta kullanıcı adı alınır; her hesabın bir **profili** vardır
  (kullanıcı adı ve ayarlar: müzik açık/kapalı, müzik sesi). Ayarlar
  profilde saklanır, cihazdan cihaza taşınır. E-posta onayı şimdilik
  kapalıdır (yerleşik e-posta servisi saatte 2 e-posta ile sınırlı).
- **Ana menü:** Giriş sonrası Lobiler / Nasıl oynanır / Ayarlar. Oyun
  içinden Krallık sekmesindeki "Ana menü" ile dönülür. Lobi silinirse
  içindeki oyuncular kendiliğinden ana menüye döner (yayın + dakikalık
  yoklama).
- **Ayarlar ve ses:** Harita ekranının köşesindeki dişli **Ayarlar**
  penceresini açar: müzik ve **ses efektleri** ayrı ayrı açılıp kapanır,
  sesleri yüzde olarak ayarlanır (profilde saklanır). Efektler tarayıcıda
  sentezlenir (`apps/web/src/audio/sfx.ts`): savaş davulu ve boru,
  savaş ilanı, elçi borusu, kötü haber çanı, inşaat başlarken testere ve
  tokmak, bina bitince çekiç, günün olayları için arp.
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
- **Sohbet:** Lobi geneli, diplomatik özel mesajlar (bkz. §11.1).
- **Wipe otomasyonu:** Sezon sonu zamanlanmış görev.

### 11.1 Sunucu mimarisi (en az kaynak ilkesi)

Sunucu **ilerlemeyi ve konumu saklamaz, zamanı saklar**; her şey
`f(zaman)` olarak hesaplanır. Oyuncu çevrimdışıyken hiçbir şey yazılmaz.

- **Sunucu saati:** İstemci girişte sunucu saatini çeker
  (gidiş-dönüş/2 düzeltmeli `offset`), oyun saati `Date.now() + offset`
  ile hesaplanır; birkaç dakikada bir ve sekme geri gelince yeniden
  ölçülür. Cihaz saati yanlış olsa da herkes aynı gün/saati görür.
- **Dünya saklanmaz:** Harita lobi tohumundan istemcide üretilir; hayvan,
  kervan, bulut gibi görseller saatten hesaplanır, DB'ye dokunmaz.
- **Tembel ekonomi:** Krallık tek satırdır (`state jsonb`, `version`,
  `updated_at`). Sunucu yalnızca komut/okuma anında
  `advance(state, now)` çalıştırır; saat başı cron yoktur. İnşaatlar
  `finish_at` ile saklanır — oyuncu uyurken biter.
- **Komutlar:** Edge Function, `packages/shared` içindeki aynı TS
  mantığıyla doğrular; yazma iyimser kilitle (`version`) yapılır.
  İstemci aynı `advance` ile yerelde tahmin eder, sunucuyu yoklamaz.
- **Canlı güncelleme:** Lobi başına tek Realtime **Broadcast** kanalı,
  küçük mesajlar (`{kingdom, v}`); `postgres_changes` kullanılmaz. Mesajlar
  doğrudan veritabanı tetikleyicilerinden gönderilir; kanal **özeldir**,
  yalnızca lobinin üyeleri dinleyebilir.
- **Olaylar:** Krallıklar arası etkileşimler (muharebe, varış, yağma,
  casus) bitiş zamanlarıyla yazılır. **Dakikada bir çalışan tek `pg_cron`
  işi** zamanı gelenleri işler. Ayrıca istemci, ekranındaki bir savaşın,
  elçinin ya da emrin zamanı gelince sunucuyu `settle` ile dürter; sonuç
  saniyeler içinde gelir. Lobi başına kilit (`lobbies.sim_at`) aynı lobinin
  aynı anda iki kez işlenmesini önler.
- **Tarih:** Gün tick'inde krallık başına küçük bir satır
  (`kingdom_daily`: nüfus, altın, ordu gücü, toprak, skor) — gelişim
  eğrisi ve sezon sıralaması buradan.
- **Görünürlük:** RLS ile sahibi tüm `state`'i, diğerleri yalnızca
  haritada görünen alanları (yer, isim, renk, binalar, ordular) görür.
- **Lobi sohbeti:** Mesajlar kalıcıdır (`chat_messages` tablosu); her
  mesajda krallığın o anki **adı ve rengi** de saklanır, böylece sohbet
  geçmişi sonradan değişse de doğru görünür. Girişte son N mesaj çekilir,
  yenileri aynı Broadcast kanalından gelir. Mesaj uzunluğu ve gönderim
  sıklığı sınırlıdır. Wipe ile birlikte silinir.

| Tablo | İçerik |
| --- | --- |
| `lobbies` | tohum, `season_start`, ayarlar |
| `kingdoms` | `state jsonb`, `version`, `updated_at`, ad, renk |
| `armies` | sahibi, birlikler, `path`, `depart_at`, `arrive_at` |
| `orders` | elçi emirleri: `issued_at`, `effective_at`, içerik |
| `events` | `resolve_at`, tür, katılanlar |
| `battles` | sonuç raporu, tohum, kayıplar |
| `kingdom_daily` | günlük istatistik |
| `chat_messages` | lobi, gönderen krallık, ad, renk, metin, zaman |

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

- **E-posta onayı ve şifre sıfırlama:** Özel SMTP (ör. Resend) bağlanınca
  açılacak. Canlı (Vercel) adresi Auth "Site URL" olarak girilmeli.
- **Davet linki ve sezon sonu wipe'ı** henüz yok.
- **Parsel boyutu:** 1 parsel = 4×4 karo varsayımı onay bekliyor (§5.1).
- **Saray seviyesi** dışında hududu büyüten başka bir şey (başarım vb.) olacak mı?
- **Başlangıç yeri kuralları:** han/ticaret yoluna ve diğer krallıklara en
  az/en çok mesafe.
- **Tünel** ne işe yarar (dağın öbür yanına geçiş mi, maden girişi mi)?
- **İskele/ticaret arsası** iki krallığa aynı anda düşerse ne olur?
- **Ticaret arsası mesafesi:** han 16→28, yol bağlantısı artırıldı; yürüme
  mesafesi şu an medyan ~16 karo, ama en kötü ~250 karo ve nadiren hiç
  bulunamıyor (dağlarla çevrili yerler). Yerler yola yakın mı atanacak?
- **Harita boyutunun oyuncu sayısına göre ölçeklenmesi.**
- **Elçi süresi** sabit mi kalacak, mesafeye göre mi değişecek?
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
- Sırlar yalnızca `.env.local` dosyalarında durur; asla commit edilmez.

---

## 16. Teknik Yığın, Dizin Yapısı ve Komutlar

### 16.1 Yığın

- **Platform:** Web (tarayıcı).
- **İstemci:** Vite + React + TypeScript; oyun sahnesi **PixiJS v8**.
  Dünya 2D karo ızgarasıdır; kamera sabit açılıdır (dönme yok), 3D algısı
  izometrik çizilmiş 2D sprite'lar ve arkadan öne çizim sırası ile verilir.
- **Sunucu / veri:** **Supabase** — Postgres + RLS (savaş sisi dahil görünürlük
  kuralları), Auth, Realtime, Edge Functions (oyuncu komutları).
- **Zamanlama:** `pg_cron` + bitiş zamanlı olay tablosu (ekonomi tick'i,
  inşaat/kervan/ordu varışı, karşılaşmalar).
- **Savaş:** Tamamen otomatik çözülür; canlı yönetim yok. İstemci sonucu
  2–3 karelik animasyonla gösterir.
- **Paket yöneticisi:** bun (workspaces).

### 16.2 Dizin yapısı

```
apps/web/          İstemci (Vite + React + PixiJS); zemin boyama
                   `src/game/chunkPainter.ts` içinde (DOM'suz, worker'da
                   çalışır), sprite üretimi `src/game/sprites.ts` içinde
packages/shared/   İstemci ve sunucunun ortak kodu (izometrik matematik,
                   arazi yüksekliği, yürüyüş konumu hesabı, denge
                   yapılandırması erişimi)
config/balance/    Denge değerleri (JSON) — tek kaynak
supabase/          config.toml, migrations/, functions/ (command: oyuncu
                   komutları, tick: zamanı gelenler, _shared: ikisinin ortağı)
```

### 16.3 Komutlar (kök dizinden)

```
bun install          Bağımlılıkları kur
bun run db:start     Lokal Supabase'i başlat (Docker/OrbStack açık olmalı)
bun run db:stop      Lokal Supabase'i durdur
bun run db:reset     Veritabanını migration'lardan yeniden kur
bun run db:push      Migration'ları bağlı bulut projesine uygula
bun run fn:deploy    Ortak kodu paketle, `command` ve `tick` fonksiyonlarını yükle
bun run tick:setup   pg_cron'u `tick` fonksiyonuna bağla (gizli anahtarı yeniler)
bun run lobby:create "Ad" [tohum] [--private] [--players n]
                     Bulutta yeni lobi aç
bun run dev          İstemciyi başlat (http://localhost:5173)
bun run typecheck    Tüm paketlerde tip denetimi
bun run build        İstemciyi derle
```

Bulut projesi: `jafnaqdiukfmkefcjsqo` (CLI ile `supabase link` yapılmış).
Lokal Supabase Studio: http://127.0.0.1:54323. İstemci ortam değişkenleri
`apps/web/.env.local` içindedir (şablon: `apps/web/.env.example`).
