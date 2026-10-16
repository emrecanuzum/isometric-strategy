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
  saatin başı = gece yarısı), yani herkes aynı anda aynı saati görür.
  Saatler aynı hızda akmaz: **gece hızlı geçer** (23:00–03:00 gerçekte ~6,5
  dk), kazanılan süre **şafağa ve gün batımına** eklenir (şafak 03:00–07:00
  ~12,5 dk, akşam 18:30–23:00 ~14 dk; `society.json` → `night`);
  gün yine tam 1 gerçek saattir (`config/balance/time.json` → `pace`). Arayüzde saat, gün (sezon başından),
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
   gösterilir (biyom çarpanları ve arazi payları; ayrıca ticaret noktası
   ve iskele arsasının uzaklığı, ticaret seferinin süresi ve hudut içinde
   mi dışında mı olduğu, yakınlığa göre dolan çubuklarla); oyuncu birini seçip
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
  önbelleğe alır. Oyuna girerken harita, kamera krallığa (ya da seçilecek
  yerlere) gidip ekrandaki bütün chunk'lar çizilene kadar yarı saydam bir
  yükleme perdesinin arkasında bekler.
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
- **Serbest şehirler / taç krallıkları (NPC):** Haritada **tam 2 tane**
  surlu şehir (eski lobilerde 1–2); her biri bir **NPC krallığın
  başkentidir**, oyuncular bunlardan birine bağlı lord olur (§7.8). Hiçbir
  oyuncuya ait değildir, **güvenli bölgedir** (savaş için değil, tüccarların
  gidip ticaret yaptığı yer). Büyük göllerin
  kıyısındadır, büyük iskeleleri ve kadırgaları vardır; birbirinden
  olabildiğince uzaktır. Ayrıntı §7.7.
- **Kaynak noktaları:** Maden ocakları, taş ocakları, zengin ormanlar —
  sahiplenilmesi için rekabet doğar.
- **Haydut kampları (opsiyonel PvE):** Ticaret yollarını tehdit eder.

### 4.2.1 Görsel dil

- Stil: **yüksek bitli (hi-bit) piksel art.** 1 karo = **64×32 sanat
  pikseli**. Her malzemenin (çim, kum, kaya, kar, su…) sınırlı bir renk
  rampası vardır; tonlar arası geçiş **dither** ile yapılır, yumuşak
  gradyan/bulanıklık kullanılmaz.
- **Yakınlaştırma kademelidir** (⅛×, ¼×, ½×, 1×, 2×, 3×); dokular en yakın
  komşu ile ölçeklenir, pikseller bozulmaz. Ağaçlar, kayalar, hanlar ve binalar en uzak
  kademede de çizilir (yürüyenler, kervanlar ve hayvanlar ½× altında
  gizlenir). Kamera haritanın dışına çıkamaz: ekranın ortası haritanın
  kenarından en fazla 24 karo içeride, kenardaki dağ halkasının üstünde
  kalır.
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
  yuvarlak kayalar, geniş **kaya çıkıntıları** (farklı boylarda sivri ve
  düz başlı kaya kümeleri), alçak **kaya basamakları**, başında iri bir
  kaya taşıyan aşınmış **peri bacaları**, döküntü yığınları, iri kayalar,
  çakıl serpintisi, eteklerde yosun / dağ çimi öbekleri ve bodur **dağ
  çalıları**. Kayaların aydınlık yüzlerinde liken, diplerinde yosun vardır.
  Yoğunluk bölgeden bölgeye değişir (taşlık kesimler ve sakin kesimler).
  Ağaç yerleşimi zeminle aynı sınırı kullanır.
- **Ağaçlar türlerine göre öbeklenir:** yapraklı ağaçlar, çamlar, daha koyu
  ve sık katlı **ladinler**, beyaz gövdeli **huş** koruları, erken sararan
  (pas ve altın renkli) küçük ağaç kümeleri; açık arazide tek tük **kavak**
  ve **çiçek açmış ağaçlar** (kiraz, beyaz elma, badem, leylak, sarı
  salkımlı laburnum; açık arazide yer yer meyve bahçesi gibi öbekler
  halinde, dökülen yaprakları yerde; nadiren iki kat büyüklükte ulu
  kiraz ya da beyaz çiçekli ulu ağaç). Çok nadiren **ulu ağaçlar** çıkar: ormanda
  dallı, geniş taçlı ulu meşe ya da öbürlerinin iki katı boyunda yaşlı
  çam, nadiren çayırda tek başına bir meşe. Ulu ağacın çevresindeki ağaçlar
  ona yer açar (`chunkPainter.ts` → `giantAt`).
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
- **Gölgeler saate bağlıdır.** Işık sol üstten geldiği için her şey
  gölgesini sağa ve aşağıya düşürür. Gün boyunca güneşle birlikte gölge
  döner ve boyu değişir: şafakta uzun ve sağa yatık, öğlen kısa ve
  koyu, akşam uzun ve sağ alta doğrudur. Gece yalnızca dibinde kısa, soluk
  bir gölge kalır (`daylight.ts` → `sunShadow`). Gölge sprite'ın kendi
  silüetinden piksel piksel düşürülür (`sprites.ts` → `castShadow`).
  Binalar çizilirken şekilleri birkaç katı olarak da kaydedilir (duvar
  kutusu, kırma çatı piramidi, kule silindiri ve konisi, baca, kaide; sur
  parçalarında modelin kutuları). Binanın gölgesi bu katıların güneş
  yönündeki izdüşümüdür: yapının birebir, keskin kenarlı kırılımı; avlu,
  çit ve küçük eşyalar gölge atmaz. Gölge yalnızca zemine değil **başka
  binaların üstüne de düşer**: bir binanın pikselinden güneşe giden çizgi
  başka bir binanın katısından geçiyorsa o piksel gölgede kalır (sur
  parçaları birbirini gölgelemez, sur zaten tek model gibi ışıklıdır). Bu
  hesap güneşin her adımında birkaç binada bir, karelere yayılarak yapılır. Binalar, surlar, kuleler, sallanan ağaçlar,
  yürüyenler, hayvanlar ve ordular gölgelerini ayrı bir katmana çizer
  (`shadows.ts`). Katman tek seferde saydamlaştırıldığı için üst üste
  binen gölgeler iki kat koyulaşmaz; gölgelerin yönü oyunun 10 dakikada
  bir değişir. Zemine boyanmış ağaçların, kayaların ve hanların gölgesi
  zeminle birlikte boyanır; bunlar oyun saati başına bir kez yeniden
  boyanır.
- **Surlar komşularına bağlanır** (`apps/web/src/game/wallSprites.ts`):
  her sur parçası yanındaki sur karelerine göre düz duvar, köşe, T, kavşak
  ya da uç olur; tek başına duran parça küçük bir burç gibidir. Duvar
  ortadan geçen kalın bir perde duvardır: geniş bir taş kaide, üstünde
  bayraklı yürüyüş yolu ve iki yanında mazgallı korkuluk (mazgal düzeni
  bütün surda aynı ritimde sürer). Parçalar küçük bir taş kutu modelinden
  ışıkla boyanır: güneşe bakan yüz aydınlık, öbürü gölgeli; mazgallar
  yürüyüş yoluna, kule duvara gölge düşürür; köşeler ve duvar dibi
  koyulaşır. Yüzlerde sıra sıra kesme taş, harç, yontulmuş köşeler,
  dipte ve yolda yosun, mazgal aralıklarından aşağı kir izi vardır.
  Kapı kulesi kare ve yüksektir, üstü konsollarla taşar, mazgal
  pencereleri ve flaması vardır; kapı kemerli, demir kuşaklı meşe kapı ve
  üstünde sancaklıdır; yıkık sur basamaklı bir kütük ve önüne dökülmüş
  taşlardır.
- **Yollar ve nehirler kıvrımlıdır**; uzun dümdüz hatlar izometrik görünümü
  bozduğu için rota üretimi bilerek sapma ekler.
- **Geniş nehirler** (dünya sürümü 6): her şey (hanlar, şehirler, yollar)
  yerleştikten sonra nehirlerin iki kıyısı da nehrin genişliğinin %60'ı
  kadar geri çekilir (derelerde kaynağa doğru daha az); nehirler aşağı
  yukarı iki kat geniştir, ortası daha derindir. Yeni sudan geçen yol
  köprü olur, taş köprüler geniş suya göre kurulur (en fazla 14 karo).
  Bir kıyının yakınında korunması gereken bir şey varsa (han, şehrin 30
  karo çevresi, canlı lobide lordların binaları, iskele arsaları ve
  kasabalar) o kıyı yerinde kalır, **karşı kıyı iki kat çekilir**; iki
  kıyı da tutulmuşsa nehir orada eski genişliğindedir. Geçişler nehir
  boyunca yumuşaktır; çekilen kıyının ardındaki yamaç 8 karoda suya iner,
  arazi türü değişmez (`worldgen.ts` → `widenRivers`, `world.json` →
  `riverWiden`). Genişlemeden önce açılmış lobiler (sürüm 5) sürüm 6'ya
  `scripts/widen-rivers.ts` ile taşınır: korunan dikdörtgenler
  `lobbies.river_keep`'e yazılır, istemci dünyayı tohum, sürüm ve bunlarla
  üretir; sunucunun `lobby_worlds` karoları da yenilenir (betik önce
  saklanan karoların sürüm 5'le aynı olduğunu ve hiçbir korunan karonun
  suya düşmediğini denetler).
- **Nehir ve göl aynı sudur**, hepsi aynı su seviyesindedir. Nehir araziyi
  **vadi** olarak oyar: yatağından uzaklaştıkça zemin en fazla sabit bir
  eğimle yükselebilir. Böylece dağdan geçen ya da dağda doğan nehir
  havada kalmaz, bir vadinin tabanında akar.
- **Köprüler** yolun sudan geçtiği her yerde kurulur: kıyıdan kıyıya
  **düz** bir ahşap güverte, iki yanda korkuluk ve dikmeler, suya inen
  **ayak çiftleri** (dibinde köpük halkası). Güverte kıyılardan rampayla
  yükselir (suyun 30 piksel üstünde, altından gemi geçecek kadar yüksek;
  taş köprünün kamburu 34 piksel). Güverte zemine boyandığı için ekranda
  kapladığı alan ayrıca hesaplanır (`chunkPainter.ts` → `worldDecks`):
  nehir parıltıları, ördek ve kuğular güvertenin örttüğü yerde çizilmez;
  köprünün arkasındaki ya da altındaki gemiler (ve gölgeleri) güvertenin
  ters maskesiyle kesilir, köprünün altından geçiyormuş gibi görünür; taş
  köprünün kemer boşlukları maskede açıktır, gemi kemerin altından görünür.
  Köprüden geçen ordular (yol köprü karolarında zigzag çizse ya da sunucunun
  yolu çizilen köprünün bir iki karo yanından geçse de) güvertenin ortasından
  düz yürür.
  Parçalar piksel bazında derinlik testiyle çizilir, öndeki kıyı
  köprünün ucunu örter. Güverte yaklaşık 1,5 karo, taş köprü 1,35 karo
  geniştir.
- **Yol onarımı (yalnız çizim):** Dünya üretimi bazen yolu derenin içinden,
  ona paralel geçirir ya da yolları nehrin ortasında çatallar; bu, dereye
  paralel uzun köprüler ve iç içe çarpık köprüler doğuruyordu. Çizilen ve
  yürünen yollar onarılır (`chunkPainter.ts` → `drawnRoads`): suya girip
  aynı yakadan çıkan kesim karadan, kıyıyı izleyerek dolanır; gerçekten
  karşıya geçen kesim kendi yakasında yürüyüp yakındaki en dar yerden düz
  bir köprüyle geçer. Aynı kesimi paylaşan yollar aynı köprüyü bir kez
  kurar. Sunucunun yol karoları değişmez.
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
  üstü; yükselir, büyür, rüzgârla sürüklenip söner). Her hanın ayrıca bir
  **işi** vardır (tohumdan, `apps/web/src/game/innInfo.ts`) ve duvar
  dibindeki eşyalar bunu gösterir: **yol hanı** (fıçılar, asma tabela),
  **pazar hanı** (çizgili tente, sandık ve çuvallar), **menzilhane** (su
  yalağı, saman, at bağlama direği), **gümrük hanı** (kırmızı-beyaz bariyer,
  bayrak direği). Kapı yanındaki fenerler gece yanar. Her hanın bir adı
  ("Akçay Hanı", "Gökdere Kervansarayı"…) ve hancısı vardır. Han
  zemine boyanır, ama sallanan ağaçlar yürüyenler katmanında olduğu için
  hanın bir kopyası da o katmanda durur; arkadaki ağaçlar hanın üstüne
  çıkmaz. Hanlar tıklanır (bkz. §7.6).
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
- **Sazlıklar:** Nehir ve göl kıyısında sığ suda (ve biraz da kıyıda)
  kamışlı saz öbekleri durur; kıyının bazı kesimlerinde sık, bazılarında
  hiç yoktur. Dağ boğazlarında, köprü ve iskele çevresinde çıkmaz.
- **Meyveli ağaçlar:** Ormanın açıklıklarında öbek öbek yaban elması
  (kırmızı, sarı), armut, erik ve kayısı ağaçları, aralarında çiçek açmış
  kirazlar; ormanda ve açık arazide tek tük de bulunur. Dibine birkaç
  meyve düşmüştür.
- **Çayır:** Açık çayırda kır çiçeği öbekleri (gelincik, papatya,
  peygamber çiçeği, düğün çiçeği, yonca, lavanta) serpilir; yer yer bütün
  bir kesim tek tür çiçekle kaplıdır. Ayrıca uzun ot tutamları, kırmızı ya
  da mor meyveli böğürtlen çalıları ve otun arasında tek tük taş vardır.
- Karo ızgarası çizilmez; yalnızca **imlecin altındaki karo** vurgulanır.
  İmleç bir taç başkentinin (dış suruna kadar, 36×36 karo) ya da bir
  kasabanın (8×8) üstündeyse, binalarının üstünde de olsa, o yerin **bütün
  alanı** araziye yatırılmış bir çerçeveyle vurgulanır.
  Hudut içinde parsel çizgileri çok silik gösterilir.
- Arayüz yazı tipi Pixelify Sans'tır; ondaki 2 ve 5 zor okunduğu için
  **rakamlar Tiny5** ile çizilir (`apps/web/src/fonts.ts`). Büyük sayılar
  1,2K / 3,4M diye kısaltılır.
- Görseller şimdilik **kodla üretilir** (`apps/web/src/game/sprites.ts`,
  binalar `buildingSprites.ts`); ileride aynı ölçüde çizilmiş sprite'larla
  değiştirilebilir. Binaların çoğunun **her seviyede birkaç çeşidi** vardır
  (ev 4, tarla 3 ürün, silah atölyesi ve iskele 3, diğerleri 2, balıkçı
  kulübesi 4); hangisi olduğu binanın kimliğinden seçilir. Saray her
  seviyede büyür (1: açık kuleli sur, 5: altın yıldızlı, sarmaşıklı büyük
  saray). Ticaret noktası görseli ticaret seviyesini izler (yükseltilince
  binanın seviyesi de yazılır, rakipler de görür); harap hâli o seviyenin ve
  çeşidin yanmış hâlidir. **Ambar** kırmızı tahta bir ahırdır (barn):
  dikey kırmızı tahtalar, beyaz pervazlar, koyu kırık (gambrel) çatı,
  alınlıkta çapraz kuşaklı büyük kapı ve saman kapağı, yan duvarda
  pencereler; ikinci çeşidi daha eski, koyu kırmızıdır. 1. seviye küçük ve
  saman balyalı, 2. seviyede yanında sundurma, 3. seviyede arkasında taş
  silo ve saman arabası vardır. 2. seviye iskelenin her çeşidi dolu bir
  balıkçı avlusudur (kulübe, sandal, balık sergeni, ağ, sandık ve fıçı;
  vinçli çeşitte liman barakası, fenerli çeşitte fener kulesinin önünde
  balıkçı kulübesi). Oyunda henüz olmayan seviyeler (pazar 2–3, kışla 3,
  gözcü kulesi 2–3) için görseller hazırdır.

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
  Önerilen isim bir ön ek ile bir yer adı ekinden kurulur (Ulupınar,
  Gökova, Kartalsuyu… binlerce birleşim) ve lobideki başka bir krallığın
  adıyla aynı kökü taşımaz; oyuncu kendi adını da yazabilir.
  Lobi, büyüklüğü kadar renk sunar (9 ya da 18; `packages/shared/src/colors.ts`)
  ve **bir renk lobide yalnızca bir krallığındır**: alınmış renk seçilemez.
  **Kızıl ve lacivert** taç krallıklarınındır (başkentler, devriyeler); hiçbir
  lord bu renkleri seçemez. Sarayın
  çatıları bu renkte çizilir. Harita uzaklaştırıldığında (½× ve altı)
  krallığın adı **sarayın üstünde**, haritayı okutacak kadar **büyük** (27
  piksel) yazar (saray yoksa hududun ortasında). Taç krallıklarının adları
  biraz daha büyük (30 piksel), **büyük harfle** ve tacın renginde yazar.
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
- **Kıyı** yalnızca gerçek suyun kıyısıdır: komşu su karosunun ait olduğu
  göl ya da nehir en az **20 karo** olmalıdır (`territory.json` →
  `shoreMinWater`). Ağaçların arasında kalmış birkaç karoluk su birikintisi
  kıyı sayılmaz (iskele ve balıkçı kulübesi oraya kurulmaz, iskele arsası
  oraya düşmez); yanındaki kara serbesttir.
- Ticaret noktası da **2×2 karo** kaplar; en az bir karosu yol kenarı
  olmalıdır.
- **Arsa hakları (önceden belirli):** Yer atandığı anda her krallığın bir
  **iskele arsası** ve bir **ticaret arsası** belirlenir. Hududunda uygun
  kıyı / yol kenarı varsa arsa oradadır; yoksa hududun dışında **yürüme
  mesafesi en kısa** 2×2 arsa verilir. Yürüme kara ve köprü üzerindendir;
  su ve dağ dolanılır (kuş uçuşu değil).
- **İskele eki:** İskele arsası hududun dışındaysa arsanın her yanında 2
  karoluk bir ek alan da krallığındır (`territory.json` →
  `dockAnnexTiles`); oraya yalnızca kıyı yapıları (balıkçı kulübesi)
  kurulur. Böylece kendi kıyısı olmayan krallık da kulübesini kurabilir.
  Ek alan haritada iskele renginde kesikli çizgiyle gösterilir; hudutla
  iç içe geçtiği yerde çizgi çekilmez, ikisi tek alan gibi birleşik
  çizilir (hudut ek alana açılan kenarını, ek alan hududun içinde kalan
  kenarını çizmez).
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

**Şu an uygulanan (nüfus artışı):** Evler, saray ve köylü gönderen
kasabalar yalnızca **yer** verir; köylüler o yere her üretim turunda
yavaş yavaş gelir (`Kingdom.people`, `economy.ts` → `growthTerms`,
değerler `society.json` → `growth`). Tur başına gelen: (0,08 + boş yerin
%0,6'sı) × büyüme çarpanı; boş yer çoksa daha hızlı gelirler.

- **Mutluluk** çarpanı belirler: %0 → −1, %40 → 0, %55 → 0,7, %75 → 1,
  %100 → 1,3 (aradakiler doğrusal). Böylece yüksek ve ağır vergi nüfusa da
  dokunur: kraliçeli lordda normal vergide ×1,14, yüksekte ×0,87, ağırda
  ×0,31; kraliçesiz erken lordda yüksek vergi büyümeyi durdurur, ağır
  vergi halkı göç ettirir. (Önce sıfır noktası %25'ti ve ağır vergi
  nüfusta bedelsizdi.) Sıfırın altında halk göç eder: tur
  başına halkın %0,2'si × |çarpan|.
- **Açlık** (ambarda yemek yok) çarpanı en fazla −0,6, **kuşatma** (en az 10 askerle saray
  kuşatılırken) en fazla −1 yapar: halk gider.
- **Sarayın hizmetlileri gitmez:** göç, nüfusu sarayın kendi köylülerinin
  (saray seviyesine göre 4–8) altına indiremez; nüfus bunun altına düşmüşse
  (kuşatmada kaçanlar) aç da olsa hizmetliler tur başına 0,08 kişi geri gelir
  (`growth.palaceFloor`). **Açlıkta köylüler önce yemeğe koşar:** ambarda yemek
  yokken sağlıklı köylüler önce tarlalara (buğday), iskeleye ve balıkçı
  kulübesine yetecek kadar çalışır, kalanı öbür yapılara dağılır. Böylece aç
  kalan lordluk ölüm sarmalına girip sıfıra inmez, kendini toparlar.
  (Bu iki kural gelmeden 30 dakikada bir giren bir lordun yemeği bitince
  nüfusu 0'a iniyor ve bir daha büyüyemiyordu.)
- Büyüme varken **savaş** ×0,5, **hastalık** ×(1 − hasta payı),
  **kraliçe** ×1,1, **tapınak** seviye başına +%5 çarpar.
- Ev yıkılır ya da sınır düşerse yeri kalmayan köylüler **hemen** gider.
  Asker eğitmek ve gemi mürettebatı köylüden düşer; terhis edilen asker
  köylüye döner. Ölen askerin yeri boşalır, halk zamanla doldurur.
- Ayar: 100 kişilik bir lordluk %50'den mutlu (%60, kraliçesiz) ve barışta
  ~50 dakikada, %75 mutlulukta ~43 dakikada dolar; savaşta iki katı sürer,
  %30 mutlulukta ~5 saat.
- Eski kayıtlar ilk turda yerleri kadar köylüyle başlar (hiçbir şey
  sıçramaz); yeni lordluk sarayın hizmetlileriyle başlar.
- Halk sekmesindeki **Nüfus** bölümü (`apps/web/src/ui/hud/population.tsx`
  → `PopulationPanel`) köylü / yer, tur ve saat başına büyümeyi, her
  çarpanı nedeniyle ve dolmaya kalan süreyi gösterir. Büyümenin yanındaki
  **(i)** düğmesi büyümenin nasıl işlediğini lordun kendi sayılarıyla
  anlatır (`GrowthExplained`: yer, boş yer, formül, mutluluk çarpanı, göç,
  hizmetliler). Üst çubuktaki nüfus kartı da saatlik büyümeyi, yerleşimi
  (köylü / yer, dolmaya kalan süre) ve denizcileri gösterir.
- Sunucu, savaşta olan lordları (`atWar`) savaş ilanında, barışta ve her
  tick'te işaretler; kuşatılan sarayın `besiegedUntil` değeri kuşatma
  başlayınca yazılır.

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
- **Tur:** Ekonomi **üretim turlarıyla** işler: her 10 gerçek saniyede
  (oyunda 4 dakika) bir tur; binalar üretir, halk yer, vergi ve maaşlar
  ödenir. Bir oyun saatinde ortalama 15 tur geçer (gece daha az, şafakta ve akşam daha çok). Saat kartı bunu ve sonraki tura
  kalan süreyi yazar; saatteki şeridin her karesi bir oyun saatidir.
- **Depo sınırı:** Her hammaddeden (yemek, yapı malzemesi, savaş
  malzemesi) depoda tutulabilecek miktar saray seviyesiyle artar (400 /
  800 / 1300 / 1900 / 2600) ve her **Ambar** ekler (seviye 1/2/3: +400 /
  +800 / +1400; saray seviyesine göre 1–3 ambar). Sığmayan üretim boşa
  gider; günlükte bir kez "Ambar dolu" yazar (depo yer açılana kadar
  tekrarlanmaz, yeniden dolarsa yine yazar).
- **Cephanelik sınırı:** Cephanelik her silahtan (kılıç, kalkan, yay ve ok)
  sınırlı tutar: saray seviyesine göre 60 / 120 / 200 / 300 / 400, her ambar
  seviyesi +40 (`economy.json` → `armory`). Bir silahın yeri dolunca o silahı
  işleyen silah atölyesi **durur** (hammadde harcamaz, işçileri boşta kalır);
  son parti sınırda kesilir. Sınırdan önce birikmiş fazlası kalır ama artmaz.
  Depo → Cephanelik "stok / sınır" yazar.
- **Üretim ağı tıkandı** (`clogsOf`): bir yapının işi boşa gidiyorsa —
  silah atölyesi yeri dolmuş bir silahı işliyorsa ya da bir yapının ürettiği
  malın ambarı doluysa (oduncu yapı malzemesi, tarla/iskele yemek, demir
  dökümü savaş malzemesi) — üç yerde görünür: haritada yapının üstünde
  sallanan sarı bir **ünlem** levhası; ekranın sağındaki uyarı kartlarında
  her tıkanan mal/silah için bir kart ("Cephanelik dolu: kalkan · 2 silah
  atölyesi boşta"; dokununca Depo açılır); bina menüsünde **"Üretim ağı
  tıkandı"** kutusu: neyin dolduğu, ne kadar boşa gittiği ve çare (ürünü
  değiştir, ambar kur/yükselt, malı sat ya da kullan, işçileri başka yere
  ver). Sağdaki uyarı kartları alt alta dizilir; ekranın tam sağ
  kenarında, ayarlar ve ana menü düğmelerinin hemen altından başlar,
  yakınlaştırma düğmelerinin üstünde biter, sığmazsa kendi içinde kayar
  (telefonda üst çubuğun altından başlar).
- **Hazine sınırı:** Altının da sınırı vardır: saray seviyesiyle 1000 /
  2000 / 3500 / 5500 / 7000, ve 4. seviye sarayda açılan **Hazine** binası
  ekler (seviye 1/2/3: +4000 / +8000 / +14000; 4. seviyede bir, 5.de iki
  hazine). Sığmayan altın boşa gider. **Hazine doluyken tüccar mal
  götürmez**, evde bekler (mallar depoda kalır, lobi fiyatı düşmez); yer
  azsa yalnızca hazineyi dolduracak kadar satar. Haraç, harcama ya da yeni
  hazine yer açınca yeniden satmaya başlar (Ticaret sekmesinde "Hazine
  dolu" uyarısı). Vergi gibi diğer gelirler dolu hazinede boşa gider. Tüccar yemek satarken
  halkın ve askerin 30 turluk (5 dakikalık) yemeğini depoda bırakır, satış
  krallığı aç bırakmaz (`trade.foodReserveRounds`). Depo
  ve hazine doluluğu Depo sekmesinde ve üst çubuğun kartlarında
  "stok / sınır" olarak görünür.
- **Kuruluş:** Hazır şehir düzeni yoktur. Krallık kurulunca oyuncu önce
  **Sarayını** hudut içinde istediği yere yerleştirir (ücretsiz, anında);
  ev, tarla vb. her şeyi de kendisi yerleştirir. Ticaret arsasına
  **ücretsiz 1. seviye ticaret noktası** kurulur. Saray birkaç saray
  hizmetlisi (köylü) barındırır.
- **Ticaret noktası:** Kurulduğu an oyuncu satılacak malı seçer (3
  hammaddeden biri; sonradan değiştirilebilir). Tüccar her **30 saniyede**
  seçilen maldan bir miktar götürüp satar ve altın getirir. Seviye
  yükseldikçe sefer başına satılan miktar artar. **Ticaret noktası saraydan
  uzaksa sefer uzar:** saray ile ticaret noktası arasındaki ilk 12 karo
  30 saniyeye dahildir, ötesindeki her karo 0,2 sn ekler (ör. 100 karo ≈
  48 sn, 250 karo ≈ 78 sn; `economy.json` → `trade.walkFreeTiles`, `walkSecondsPerTile`;
  `lobbyTripMs`). Serbest şehre sefer ayrıca hesaplanır (§7.7).
  Tüccar haritada devesiyle saraydan ticaret noktasına yürür (uzaklık ne
  olursa olsun; seferi uzadığı için hızı aynı kalır, köprülerden geçer;
  surlar kapısız çevirdiyse yürümez, evde kalır); **başka
  krallıkların tüccarları da** kendi saraylarıyla ticaret noktaları
  arasında yürür (bir şey satıyorlarsa ve ticaret noktaları harap
  değilse). Yola çıkış anları gizli olduğu için her krallığın tüccarı kendi
  sabit temposuyla yürür; görsel olarak gösterilir, gerçek seferle aynı anda
  olmayabilir.
- **İnşa menüsü:** Altın (ve yapı malzemesi) harcanarak ev, tarla, oduncu
  kampı, silah atölyesi kurulur. Yapılar süreyle inşa edilir (iskele
  görünür), aynı anda en fazla 2 inşaat yürür. Yalnızca hudut içinde,
  serbest karoya kurulur; altındaki ağaçlar temizlenir.
- **Nüfus:** Evler köylüye yer verir, köylüler o yere zamanla gelir (§5.2);
  üretim binaları işçi ister; köylü yetmezse binalar orantılı daha az
  üretir. Köylüler her üretim turunda yemek yer.
- **Biyom çarpanları:** Yerin çevresindeki araziye göre üretim çarpanı:
  nehir/göl (balık) ve çayır (tarım) → yemek; orman → yapı malzemesi;
  dağ → savaş malzemesi; bataklık hepsini biraz düşürür, kurak yemeği
  düşürür. Çarpanlar kuruluşta sabitlenir.
- **Yemek üretimi** (tur başına, arazi çarpanından önce): tarla 0,6 / 0,9 /
  1,4, iskele 0,6 / 1,2 / 1,8 (seviye 1/2/3); oduncu kampı 1,2 / 2 / 3, silah
  atölyesi (demir) 0,8 / 1,2 / 2. Köylü tur başına 0,1, asker 0,1 yemek
  yer. Su payının yemek çarpanına katkısı 3,5'tir (`economy.json` → `yield.foodPerWater`; yalnızca yeni
  kurulan krallıkları etkiler).
- **İskele:** Krallığın önceden belirli iskele arsasına kurulur (yer
  seçilmez, tek tane). Balık tutar (yemek). İskelenin ahşap kısmı arsanın
  en açık suya bakan kenarından nehre/göle doğru en fazla 2 karo uzanır
  (`dockPier`); üstünde kıyı ucunda sandıklar ve fıçı, ortada kangal
  halat ve balık sepeti, kenarından sarkan kurumaya asılmış ağ, öbür
  ucunda direkte bir fener durur.
- **Eğim:** Yokuşa kurulan yapı, en yüksek köşesi hizasında düz bir taş
  kaide üzerinde durur (tarlada toprak set); kaide aşağıdaki zemine iner.
  Kıyı yapıları (iskele binası, balıkçı kulübesi) kaideye çıkmaz: dik
  kıyıda suya bakan alçak köşeye oturur, arkasındaki yamaca gömülür;
  böylece iskelenin ahşap kısmıyla aynı hizada kalır.
  Kaidedeki yapının gölgesi kaide yüksekliğinden aşağıdaki zemine düşer
  (güneşten öteye kayar; `shadows.ts` → `setFootprint`). Bir binanın
  parçaları (kaide ve kendisi) birbirini gölgelemez, kaideler başka
  binalara gölge düşürmez (yalnız zemine); kaidenin gölge kütlesi sabit
  noktasının altına inmez, gölgesi güneşe doğru ters düşmez. Böylece hiçbir
  saatte kaide baştan başa gölgeye gömülmez. Zeminin gölge katmanı kaidenin
  altında kaldığı için kaidedeki binanın gölgesi kaidenin üstüne ayrıca
  çizilir: kaide yüksekliğinde düşürülen gölgenin kaideye düşen pikselleri,
  kaide ile bina arasında (`shadows.ts` → `onBase`).
  Binalar ön köşelerine göre sıralanır; resimleri üst üste binen iki
  komşudan x ya da y ekseninde ötekinin ilerisinde olan sonra çizilir
  (yamaçta kaidedeki ev yanındaki sarayın arkasına düşmez).
- **Esrarengiz balıkçı kulübesi** (3. seviye saray, bir tane, yalnızca
  hudut içindeki ya da iskele ekindeki bir **kıyı** karesine kurulur): kendi başına çok az yemek
  ve nehre atılmış altınlardan çok az (tur başına 0,1) getirir. Tıklanınca
  "Oltayı at" ile bir mini oyun açılır: dikey suda düzensiz kaçan bir balık;
  basılı tutunca yükselen, bırakınca düşen yeşil alanı balığın üstünde tutmak
  gerekir; balık alandayken çubuk dolar, dışındayken boşalır; 30 saniyede
  dolarsa balık tutulur. Oyun bilerek kolay ve sakindir: balık 1–2 saniyede
  bir yön değiştirir, nadiren ani kaçar, yeşil alan geniştir, çubuk %40'tan
  başlar, yavaş dolar ve yavaş boşalır; bir atış 10–15 saniye sürer
  (`economy.json` → `fishing.game`). Tutunca ya bir **kese** (iki ya da üç maldan
  25–70'er birim, bazen altın) ya da bir **şişe** çıkar: şişede başka bir
  krallık hakkında yavan bir not vardır ("… krallığının 1000'den fazla
  altını var gibi görünüyor"; gerçeğin yaklaşık %70'inin yuvarlanmış hâli).
  Sonuçlar kulübenin **balıkçı günlüğüne** yazılır. Olta 150 saniyede bir
  atılabilir. "Oltayı at"a basınca pencere hemen açılır; sunucunun tohumu
  gelene kadar "Olta suya atılıyor…", sonuç gelene kadar "Olta çekiliyor…"
  yazar. Oyun belirlenimcidir: olta atılınca sunucu bir tohum verir,
  oyun saniyede 60 sabit adımla oynanır, istemci yalnızca düğmeye basılıp
  bırakılan adımları gönderir; sunucu oyunu aynı tohum ve basışlarla yeniden
  oynayıp tutulup tutulmadığına kendisi karar verir (ve oyunun süresinden
  kısa sürede biten bir atışı kabul etmez). Ödülü de sunucu çeker. Değerler `economy.json` → `fishing`,
  mantık `packages/shared/src/fishing.ts`.
- **Patikalar:** Her yapının kapısından saraya ve köylülerin evden işe
  yürüdüğü yollar boyunca, yapıların etrafından dolaşan ince toprak
  patikalar zemine işlenir; cetvelle çizilmiş gibi düz değil, hafifçe
  dalgalanarak uzanırlar (yürüyenler yine aynı yolu izler). Patikalar
  binaların da **tarlaların da** içinden geçmez, yanlarından dolanır; tarlaya
  giden patika tarlanın kenarında biter (köylüler tarlada çalışmak için
  içine yürür). Başka bir
  patikaya bağlanmayan ucunda patika birden kesilmez: son ~2,5 karoda
  daralır ve yer yer çimenle kesilerek söner. Ticaret yolu da aşınmış yol
  sayılır: yürüyenler onu kullanır, yolun üstüne ya da yanına ona paralel
  patika çizilmez; yola varan patika yolun kenarında birleşir. Sur ve kapılar patika üretmez. Saraya en yakın
  yapıların yolu önce açılır, sonrakiler var olan patikaya katılır (patika
  karosu yürümesi daha ucuzdur); böylece saraydan dallanan birkaç ortak
  patika oluşur, yelpaze gibi açılan düz çizgiler değil. Bir yürüyüşün
  var olan patikanın üstünde (ya da bir karo yanında) kalan kısmı yeniden
  çizilmez; yalnızca yeni açılan kısmı çizilir ve patikaya bağlanır, böylece
  aynı yere giden yollar örgü gibi yan yana iki çizgi olmaz. Yeni parçanın
  ucu var olan patikanın çizgisine taşınır, çatal gibi ona bağlanır; kapıya
  ya da tarlaya varan uç da gevşek sayılmaz, solmaz. Köylüler de
  patikalardan yürür. Patikalar bütün krallıklarda çizilir (rakiplerinki de
  herkese görünür).
  Lordluğun binalar arasında kalan zemini ve patika kenarları boş kalmaz:
  ağaç dikilmez (surları ve yürüyenleri örterdi), ama çimen tutamları, kır
  çiçekleri, ara sıra bir taş ve kimsenin arkasından geçmediği yerde alçak
  çalılar (böğürtlen de) serpilir; patika kenarında daha sıktır. Çölde
  seyrektir: kuru ot tutamı, çakıl, bodur çalı. Binanın oturduğu karoya ve
  patikanın üstüne bir şey konmaz (`chunkPainter.ts`).
- **İnşa menüsü (devam):**
  - **İnşa listesi** saray seviyesine göre 5 sekmedir (1. sv. … 5. sv.): her
    sekmede o seviyede açılan yapılar ve sınırı artan yapılar yazar; henüz
    ulaşılmamış seviyeler kilitli görünür.
  - **Plan (toplu inşa/taşıma/yıkım):** Saray dışındaki her inşa, taşıma ve
    yıkım hemen gönderilmez, bir **plana** eklenir. Oyuncu aynı yapıdan
    istediği kadar yerleştirir, başka yapılara geçer, başka binaları yıkar
    ya da taşır; harita planın uygulanmış hâlini (iskeleler, kalkan
    binalar) gösterir. Alttaki plan çubuğu adımları, harcanacak ve iade
    edilecek malları gösterir (Geri al / Temizle / Onayla); "Onayla"
    **"Emin misin?"** diye sorar ve bütün plan tek komutla gider
    (`plan`, en fazla `economy.json` → `maxPlan` = 256 adım; çubuk "N / 256
    adım" yazar, dolunca yeni adım eklenmez ve "önce onayla" der). Önce yıkımlar,
    sonra taşımalar, sonra inşalar uygulanır; inşaat yeri doluysa adım yer
    boşalınca başlar; yapılamayan adımlar atlanır
    (`packages/shared/src/economy.ts` → `applyPlan`).
  - **Sur ve ev** basılı tutup sürükleyerek sıra hâlinde plana eklenir. Sur
    parçaları inşaat sırasına girmez (aynı anda kurulur); evler sıraya
    girer, yer boşaldıkça başlar.
  - **Yıkım modu:** Bina menüsündeki "Yık" o binayı plana ekler ve yıkım
    modunu açar: imleç **çekiç** olur, üstüne gelinen bina **kırmızı** dış
    hatla vurgulanır, tıklanan her bina plana yıkım olarak eklenir. Bina
    haritadan kaybolmaz: tıklandığı anda üstüne yarı saydam **kırmızı
    silüet** ve kırmızı dış hat çizilir, plan onaylanana kadar öyle kalır;
    işaretli binaya yeniden tıklamak işareti kaldırır. "Bitti" ya da Esc
    moddan çıkar; plan onaya kadar bekler.
  - **Taşıma editörü:** Bina menüsündeki "Taşı" o binayı eline alır ve
    taşıma modunu açar (imleç el, vurgu mavi). Eldeki binanın eski yeri
    soluk mavi silüet ve mavi çerçeveyle işaretlenir; binanın kendisi yarı
    saydam olarak imleci takip eder (altındaki karo yeşil/kırmızı). Yeni
    yerine tıklayınca
    taşıma plana eklenir; sonra başka bir binaya tıklayıp onu da alıp
    yerine koyarsın. Eldeyken başka binaya tıklamak eldekini değiştirir;
    planda taşınmış bir binayı yeniden almak eski taşımayı siler. Bütün
    taşımalar plan onayında birlikte gider.
  - **Taşı:** Saray, ticaret noktası, iskele, sur ve kapı dışındaki bitmiş
    her yapı taşınabilir.
    Seviyesi, işçileri ve ürünü korunur; taşınırken iskeleye döner, üretmez
    ve bir inşaat yeri tutar. Maliyeti yapıya harcanan her şeyin (inşa +
    yükseltmeler) **%40'ı** (yıkıp yeniden yapmanın net maliyeti %50);
    süresi o seviyeye yeniden inşa süresinin **1,25 katı**
    (`economy.json` → `move`).
  - **Sur kapısı** üç karodur: ortada kapı, iki yanında daha uzun **kule
    surları**. Surun yönüne göre kendiliğinden döner (kapı yüzü surun
    içinden geçer; iki yanında daha çok sur olan yön), **R** tuşu ya da
    "Döndür" düğmesiyle çevrilebilir; yerleştirirken üç karonun önizlemesi
    görünür. Var olan sur parçalarının üstüne kurulabilir (onların yerini
    alır).
    Biri (köylü, tüccar, ordu) kapıdan geçerken kapı **açılır**: kanatlar
    geçidin yanlarına yaslanır, kemerin altı karanlık bir geçit olur; yürüyen
    bu geçitte gizlenir ve öbür yandan çıkar. Kapı karosuna yaklaşık bir karo
    kalınca açılır, uzaklaşınca kapanır (yalnızca görsel,
    `apps/web/src/game/wallSprites.ts` → `openGate`).
    Kapı çizilirken içinde durduğu surun yönüne döner (yanındaki sur
    parçalarına bakılır); yönü kaydedilmemiş eski tek karolu kapılar ve
    surlardan önce kurulan kapılar da böylece doğru görünür
    (`buildingSprites.ts` → `linkWalls`).
  - **Boşluk:** Sur ve kapılar diğer binalarla arasında boşluk bırakır
    (surlar birbirine bitişik olabilir): binanın arkasında 1 karo, önünde
    (ekranın altına doğru, x ya da y yönünde ileride) 2 karo; çünkü öndeki
    yüksek sur aradaki zeminin üstüne yükselir ve 1 karoda binanın avlusunu
    ekranda keserdi (`economy.json` → `wallClearance`).
    Kural gelmeden önce bir binanın önüne bundan yakın kurulmuş eski sur
    parçaları kayıtta olduğu gibi kalır ve tam boyunda çizilir; öndeki sur
    binanın üstünde görünür.
  - **Surlar insanları da tutar:** köylüler ve tüccar saraydan yürüyerek
    çıkar; ayakta duran sur parçasından geçemez, yalnızca **sur kapısından**
    (saray 2. seviye, 1 karo) ya da yıkık bir sur kesiminden geçer. Saraydan
    yürüyerek ulaşılamayan bina çalışmaz ("Sur arkasında kaldı"); surla
    çevrilmiş ticaret noktası ya da surun içinde kalan tüccar hiçbir şey
    satmaz. Ordular bundan etkilenmez; kuşatmada kapı sur sayılır
    (`packages/shared/src/walls.ts`).
  - **Hapishane:** Surlar sarayı kapısız (ve yıkık kesimsiz) çevrelerse halk
    dışarı çıkamaz: "Krallığın bir hapishane" uyarısı çıkar ve mutluluk
    hedefi düşer (`society.json` → `happiness.imprisoned`, −15).
  - **Harita uyarıları:** Süren sorunlar (hapishane, sur arkasında kalan
    yapılar, sınırdaki düşman ordusu, ayaklanma) ekranın sağ kenarında,
    ayarlar ve ana menü düğmelerinin altında kırmızı kartlarla durur; dokununca
    ilgili sekme açılır (`apps/web/src/ui/hud/MapAlerts.tsx`). Kartların
    üstündeki "Uyarılar" başlığı (kırmızı rozette sayı) onları katlar ve
    açar; tercih tarayıcıda hatırlanır.
    **Savaş en üsttedir:** oyuncunun kuşattığı ya da onun kasabasını kuşatan
    kasaba kuşatmaları (kalan süreyle), askerinin bulunduğu süren
    muharebeler ve kuşatmaya yürüyen orduları da birer kart olur; dokununca
    Ordu sekmesi açılır. Ordu sekmesinin başında aynı liste **Süren savaş**
    bölümünde ilerleme çubuklarıyla durur; kuşatan ordunun kartında "X
    kuşatılıyor · N dk kaldı" yazar. Kasaba kuşatmasıyla ilgili bütün
    haberler (başladı, kalktı, alındı, direndi) günlükte **Önemli** sayılır
    (`apps/web/src/ui/hud/war.tsx` → `warNotes`).
  - **İlk oduncu kampı, ilk ev ve ilk tarla ücretsizdir** (bir kez), böylece
    bütün malzemesini harcayan oyuncu kilitlenmez.
  - **Ev ve nüfus sınırı:** Evler (ve sarayın kendi odaları) nüfus
    sınırından (saray seviyesi × 24) fazla barınak sağlayamaz. Planlanan
    barınak (inşaattakiler ve yükseltilenler hedef seviyesiyle sayılır)
    sınırı aşacaksa yeni ev kurulmaz, ev yükseltilmez (ör. 23/24'te 3
    köylülük ev kurulamaz); sarayı yükseltmek gerekir.
  - **Yapı sınırları** saray seviyesiyle artar (saray 1→5): tarla 3 / 4 /
    6 / 8 / 10, oduncu kampı 2 / 3 / 4 / 5 / 6, silah atölyesi 1 / 2 / 3 /
    3 / 4, gözcü kulesi 2 / 2 / 3 / 4 / 6, sur kapısı 2 / 2 / 3 / 4 / 5;
    pazar, kışla, casus evi, hapishane, üniversite, hastane, tapınak, tersane ve
    iskele birer tane. Sınır İnşa sekmesinde ve Saray sekmesindeki yapılar listesinde
    "kurulu / sınır" olarak yazar; sınırı aşan eski yapılar yerinde kalır.
  - **Saray 4. ve 5. seviye** çok pahalı ve uzundur (savaş malzemesi de
    ister; `economy.json`).
  - Saray ve ticaret noktası dışındaki her yapı **yıkılabilir** (plana
    eklenir): inşa ve yükseltme maliyetinin yarısı geri döner (ücretsiz ilk
    yapının inşa maliyeti dönmez).
- **Ticaret noktası:** satılacak mal yerine **hiçbir şey satma** da
  seçilebilir (tüccar evde bekler). **Sefer başına satış** miktarı
  ayarlanabilir: 5'er birimlik adımlarla, en fazla seviyenin sınırı kadar
  (40 / 80 / 140); değiştirildikten sonra 2 dakika yeniden değiştirilemez
  (`economy.json` → `trade.amountStep`, `amountCooldownSeconds`). Tam yük
  seçiliyse ticaret noktası yükselince yük de büyür. Sefer başına kazanç lobinin anlık
  fiyatından gösterilir. Ticaret menüsünde satış seçimi en üsttedir;
  **pazara tıklamak da ticaret menüsünü açar** (fiyatlar ve alım tek
  satırda üç sütun).
- **Lord yokken** (son görülmesinden 10 dakika sonra; `economy.json` →
  `away`): tüccar biraz kaytarır, seferde yükün yarısını götürür ("Sen
  yokken tüccar biraz kaytardı"); ambarlar ağzına kadar dolmaz: bir malın
  stoku ambarın yarısını geçince üretimi yavaşlar, %80'inde durur (yemek,
  yapı ve savaş malzemesi). Böylece dönen oyuncunun depoları artmış ama
  sınırda değildir ve boşa mal gitmez.
- **Görülme:** Oyuncu her gerçek komutta (inşa, ticaret, elçi, ordu, oyun…)
  görülmüş sayılır. Açık oyunun birkaç dakikada bir gönderdiği "buradayım"
  (`seen`) ise yalnızca son gerçek komuttan sonraki **40 dakikaya** kadar
  görülmeyi uzatır (`economy.json` → `away.seenGraceMinutes`;
  `presenceAt`): açık bırakılan sekme ya da bir betik, başında olmayan
  lordu "burada" tutamaz.
- **Yokluk cezası:** Oyuncunun son görülmesinden 1 saat sonra, geçen her saat binaların
  üretimi, vergi ve tüccarın altını %10 azalır (en az %20'ye kadar;
  `economy.json` → `idle`). Yemek üretimi bundan etkilenmez: halk kendi
  yiyeceğini yetiştirir, lord uzun süre yokken açlık çekmez. Diğer oyuncular Krallıklar sekmesinde
  "çevrimiçi / X önce görüldü" bilgisini görür.
- **Duman:** Bacası olan her yapıdan (ev, atölye, oduncu, ticaret evi,
  iskele) hareketli duman yükselir.
- **Bina seviyeleri:** Ev, tarla, oduncu kampı, silah atölyesi ve iskele
  **1–3. seviyededir**. Yükseltme altın + yapı malzemesi ve süre ister,
  inşaat kuyruğundan bir yer tutar; sürerken bina iskeleye döner ve
  üretmez. Ambar, hazine, ev ve saray ise yükseltme sürerken bir alt
  seviyesinin depo, hazine ve barınak payını korur (taşınırken hepsini);
  yükseltme yüzünden depo küçülüp mal yanmaz. Her seviye daha çok üretir / daha çok köylü barındırır ve daha
  çok işçi alabilir; her seviyenin **kendi görseli** vardır.
- **Sayaçlar:** Süren her iş (inşaat ve yükseltme, araştırma, asker
  eğitimi, vaaz, yoldaki elçi ve ordular, orduya emir götüren elçi,
  kuşatma kalkanı ve kalkan bekleyen ordu) sol altta menünün üstünde kalan
  süre ve ilerleme çubuğuyla listelenir; biten iş birkaç saniye yeşil yanıp
  söner. Sohbet düğmesinin (açıkken sohbetin) üstünde durur; bir sekme ya
  da bina menüsü açıkken gizlenir. Başlığına ("Süren işler · N") dokununca
  liste daralır; daralmışken yalnızca sayı ve ilk bitecek işin kalan süresi
  görünür (tercih tarayıcıda hatırlanır).
- **Ses efektleri kısadır** (hepsi 1 saniyenin altında).
- Ana menüde müzik daha kısık çalar (haritadaki sesin yaklaşık %45'i).
  Her düğme hafif bir tık sesiyle cevap verir; lobiye girerken yükselen,
  ana menüye dönerken alçalan kısa bir boru sesi çalar.
- **Bina menüsü:** Haritada bir binanın üstüne gelince bina dış hatla
  vurgulanır ve adı/seviyesi küçük bir etikette görünür; tıklayınca o
  binanın menüsü açılır. Menüde:
  - **İşçi sayısı:** 0 ile seviyenin üst sınırı arasında ayarlanır
    (varsayılan: tam kadro). Üretim, atanan işçiyle orantılıdır; toplam
    atanan işçi köylü sayısını aşarsa hepsi orantılı yavaşlar.
  - **Ürün seçimi:** Tarla **buğday** (yemek) ya da **keten** (yapı
    malzemesi) eker. Silah atölyesi **demir dökümü**
    (savaş malzemesi, arazi çarpanıyla) yapar ya da hammaddeden silah
    işler: **kılıç** (savaş malzemesi), **kalkan** (savaş + yapı
    malzemesi), **yay ve ok** (yapı malzemesi). Silahlar **cephanelikte**
    birikir (Depo sekmesinde görünür) ve ileride ordu eğitiminde
    kullanılacaktır. Hammadde yetmezse yetebildiği kadar işlenir.
  - Ticaret noktası menüsü ticaret ayarlarını (Tüccar sekmesinde), pazar
    menüsü Pazar sekmesinde, saray menüsü krallık özetini açar.
  - **Hapishane** menüsünde gece hapishane avlusunun çizimi (gardiyanlar,
    kraliçe tutuluyorsa dolu hapishane), mahkûm kraliçeler ve fidyeleri,
    ve **gardiyanların fısıltıları** vardır: her lordun kraliçesi var mı,
    zaten bizim elimizde mi, orada casusumuz var mı ve son casus raporuna
    göre en güçlü ağımız kaçırmaya (%70) yetiyor mu ("Ölç" raporu yeniler).
  - **Casus evi** menüsü Diplomasi → Casusluk bölümünün aynısıdır: evdeki,
    görevdeki casuslar, kapasite, sıradaki casus, karşı casusluk, görevler
    (son rapora göre ağ gücü, geri çağırma) ve günlükten casus haberleri.
  - **Hazine** menüsünde hazinenin doluluğu (altın / sınır çubuğu), sınırın
    nereden geldiği (saray + her hazine), hazinenin seviyelere göre altın
    yeri, tur başına gelir-gider ve **sezonun defteri** (`booksOf`: vergi,
    tüccar, haraç, devriyeler, maaşlar, kasaba bakımı; boşa giden altın).
- **Alt sekmeler:** Uzun sekmeler Saray'daki gibi alt sekmelere bölünür
  (`apps/web/src/ui/hud/Subtabs.tsx`; son bakılan bölüm tarayıcıda
  hatırlanır, kırmızı nokta bekleyen bir şeyi gösterir): **Halk** → Nüfus /
  Mutluluk (vergi, gece mesaisi) / Sağlık ve din (hastalık, şifahane,
  tapınak, vaaz) / Kraliçe; **Ticaret** → Tüccar / Pazar / Siparişler /
  Hâkimler; **Depo** → Mallar / Hazine (gelir-gider, sezonun defteri) /
  Cephanelik; **Ordu** → Ordular (ve garnizon) / Kışla / Savaşlar /
  Donanma; **Diplomasi** → Lordlar / Krallık (§7.8) / Casusluk. Bir lordun sayfası da
  bölümlere ayrılır (`usePart` anahtarı `lord`): **İlişki** (seninle ilişkisi,
  savaş puanı, gerekçeler, dış ilişkileri), **Elçi** (ilişki geliştir, hediye,
  haraç iste, ittifak, barış; yoldaki elçi sayısı), **Anlaşmalar** (haracı
  bağışla/kes, ittifakı boz, savaş ilanı; savaştayken nokta), **Düşmanlık**
  (hakaret, ticaret yolu yağması) ve **Casusluk** (istihbarat, casus gönder,
  operasyonlar; oradaki casus sayısı). Uyarılar (günün olayı,
  korku, hapishane, ayaklanma, yıkık surlar; süren savaş) alt sekmelerin
  üstünde durur.
- Tarlanın 2. seviyede saman yığınları ve korkuluğu, 3. seviyede küçük
  ambarı vardır; bunlar düz tarladan ayrı, binalarla aynı derinlik
  sırasında çizilir (arkadaki bina onları örtmez), üstlerinden yine
  yürünür.
- Köylüler, tüccar ve hayvanlar yapıların **içinden geçmez**: köylüler
  yapıların etrafından yol bulur, hayvanlar yapı karolarında durmaz; bir
  yapının arkasında kalan yürüyen yapının arkasında çizilir. Tarlalar düz
  olduğu için üstünde yürünebilir.
- Durum sunucudadır (§11.1): her komut `command` Edge Function'ında aynı
  `advance` ve kurallarla doğrulanır; istemci sonucu beklerken komutu
  yerelde uygular, reddedilirse sunucunun durumuna döner.
- **Başka krallıklar:** Lobideki diğer krallıkların hududu kendi
  renginde kesikli çizgiyle, binaları haritada görünür (tıklanamaz);
  depoları gizlidir. Başka bir krallığın binasının üstüne gelince bina o
  krallığın renginde dış hatla vurgulanır, etikette krallığın adı (kendi
  renginde), binanın adı ve seviyesi yazar. Yıkım/taşıma modunda
  vurgulanmaz. Yeni bir krallığın yeri, son aşamadaki hududu başka
  hudutlara `kingdomGapTiles` karodan yakın olmayacak şekilde seçilir.

---

### 6.5 Mini oyunlar ve sıralamaları (şu an uygulanan)

Balıkçı kulübesinin oltasına ek olarak üç mini oyun daha vardır. Hepsi
balık tutmayla aynı hile önleme düzenindedir: oyun başlarken sunucu bir
tohum verir, oyun saniyede 60 sabit adımla oynanır, istemci yalnızca
düğmeye basılıp bırakılan adımları gönderir; sunucu oyunu aynı tohum ve
basışlarla yeniden oynar ve **puanı kendisi bulur**. Oyunun süresinden
kısa sürede biten bir oyun 0 puan sayılır, adımlar tam sayı ve sıralı
olmalıdır (en fazla 3000), bir oyunun sonucu bir kez kabul edilir ve 90
saniye içinde gelmelidir. Oyunlar yalnızca toplama/çarpma kullanır
(trigonometri yok), böylece her tarayıcı ve sunucu aynı sonucu bulur.
Pencere hemen açılır; tohum gelene kadar "Hazırlanıyor…", sonuç gelene
kadar "Puan hesaplanıyor…" yazar. Her oyun 10 dakikada bir oynanır (`cooldownSeconds` 600); ödüller
küçüktür, oyuncu gelirine aktif oynayana küçük bir ek olur.
Değerler `config/balance/minigames.json`, mantık
`packages/shared/src/minigames.ts`, arayüz
`apps/web/src/ui/hud/MiniGames.tsx`; sunucuda `play` (tohum) ve `played`
(basışlar) komutları. **Bütün mini oyunlar (balık tutma dahil) eğlence
merkezinde de oynanır** (`minigames.json` → `hall`; `gameBuildings`,
`fishError`): her oyun kendi binasında ya da eğlence merkezinde açılır,
bekleme süresi ikisinde ortaktır.

- **Okçuluk** (kışla, atış meydanı): nişangâh saman hedefin üstünde
  gezinir. Basılı tutunca yay gerilir, nişan 1,6 saniye sakinleşir (yavaş
  kayar), sonra kol titremeye başlar; bırakınca ok çıkar (0,35 sn'den kısa
  gerilen yay yalnızca indirilir). Her okun bir rüzgârı vardır (bayrak),
  oku yana taşır: rüzgâra karşı nişan alınır. 6 ok, ok başına en çok 10
  puan (ortadan her 2,5 pikselde bir eksik), en fazla 30 sn. Ödül: puanın
  %40'ı altın (en fazla 20).
- **Örs başında** (silah atölyesi): demircinin 24 işareti kızgın demirin
  üstünde çekice doğru kayar; her biri çekicin altına geldiğinde basılır.
  Tam zamanında 5, biraz kayık 3, daha uzak 1 puan; işaretsiz vuruş −1 ve
  seriyi bozar, kaçırılan işaret de seriyi bozar. Seri her vuruşa
  (seri / 4) ek puan katar. Ödül: puanın %10'u altın (en fazla 15) ve
  %12'si savaş malzemesi (en fazla 25).
- **Kervan yolu** (ticaret noktası): deve kayan yolda yürür; basılı tutunca
  yukarı, bırakınca aşağı süzülür. Altın +3, ara sıra mücevher +10; kaya
  −5 ve deve kısa bir süre tökezler. 25 sn. Ödül: puanın %25'i altın (en
  fazla 25).
- **Balık tutma** da puan verir: tutulan balık 50 + (kalan sürenin payı ×
  50), kaçan balık 0. Ödülü eskisi gibidir (kese ya da şişe).
- Ödüller hazine ve depo sınırını aşmaz. Her oyunun en iyi puanı krallık
  durumunda (`minigames`) tutulur ve menüde "en iyin" diye yazar.
- **Sıralamalar:** Doğrulanan her puan (0'dan büyükse) yalnızca sunucu
  tarafından `minigame_scores` tablosuna yazılır (lord adı ve rengi, oyuncu
  adı ve lobi adı o anki hâliyle). İstemci yalnızca `minigame_board`
  fonksiyonuyla okur: **Bu sezon** (lobideki her lordun en iyi puanı, ilk
  10, yalnızca lobi üyeleri) ve **Tüm zamanlar** (her oyuncunun bütün
  lobilerdeki en iyi puanı, ilk 10; lobi silinse de kalır). Oyuncunun
  kendi satırı vurgulanır, ilk 10'da değilse altta sırasıyla gösterilir.
  Sıralamaya her oyunun menüsündeki "Sıralama" düğmesinden, oyun bitince
  sonuç penceresinden ve sohbetin **Sıralama** sekmesindeki **Mini
  oyunlar** bölümünden ulaşılır.

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

### 7.6 Prototip: hanlar ve ticaret payları (şu an uygulanan)

- **Satış defteri:** Her krallığın tüccarının sezon boyunca sattığı mal
  (yemek / yapı / savaş malzemesi, birim) ve getirdiği altın krallığın
  durumunda tutulur (`trade.ledger`, `economy.ts`). Sunucu bunu diğer
  oyunculara **yuvarlanmış** verir (mallar 25'e, altın 50'ye; kişinin
  kendisine tam), ayrıca tüccarın şu an sattığı malı da
  (`lobby_kingdoms` → `trade_good`, `trade_ledger`).
- **Ticaretin hâkimleri:** Ticaret sekmesinde ve han panelinde pasta
  grafik: kazanca (altın) ya da tek bir malın birimine göre her krallığın
  payı, krallık renginde; altında yüzde ve yaklaşık miktar.
- **Han paneli:** Hanın üstüne gelince adı ve işi yazar; tıklanınca
  panel açılır: hancı, hanın işi, uzaklık, **ticaret söylentileri** ve
  ticaret payları. Söylentiler herkesin bilebileceği gerçek bilgilerden
  kurulur (lobi fiyatları, yuvarlanmış satış payları, kim şu an ne
  satıyor, yağmalanmış ticaret noktaları, savaşlar, yoldaki ordular, hana
  en yakın saray) ve her oyun saati değişir. Hanın işi neyi duyduğunu
  belirler: pazar hanı fiyatları ve en çok satanları, gümrük hanı kimin ne
  taşıdığını, menzilhane savaşları ve yoldaki orduları, yol hanı biraz
  her şeyi (`apps/web/src/ui/hud/inns.tsx`).

### 7.7 Prototip: serbest şehirler (şu an uygulanan)

Değerler `config/balance/cities.json`; üretim `worldgen.ts`, ticaret
`economy.ts`, çizim `apps/web/src/game/cities.ts`, panel
`apps/web/src/ui/hud/cities.tsx`.

- **Yer:** Lobi tohumundan 1 ya da 2 şehir (`count`), kendi rastgele
  çekilişiyle (dünyanın geri kalanı şehirsiz hâliyle aynı çıkar). 16×16
  karo (`size`), dağ halkasının epey içinde, hanlardan uzak, şehirler
  birbirinden en az `minSpacing` karo uzakta; düz, kuru kara (çayır, orman
  ya da çöl; bataklık, su, dağ değil) ve az eğimli bir yere kurulur.
  Şehrin altı düzlenir, çevresi yumuşakça ona iner. Şehir karoları inşa
  edilemez; krallıklar yerleşirken son hudutları şehre `kingdomGapTiles`
  karodan yaklaşmaz.
  Yeni lobilerde (dünya sürümü 4) şehir **büyük bir gölün kıyısına**
  kurulur: surun bir yüzünün ortasından dışarı bakınca su 2–6 karo
  ötede başlar ve en az 14 karo açık su uzanır; göl en az 2500 karodur
  (`harbour`). Uygun bütün kıyı yerleri toplanır; iki şehir varsa
  **birbirinden en uzak** iki yer seçilir, tek şehir rastgele bir kıyı
  yerine kurulur. Hiçbir göl kıyısı uymazsa açık arazide en uzak yerler
  seçilir.
  Dünya sürümü 5'ten itibaren **her zaman 2 şehir** vardır
  (`cities.json` → `lakesideCount`): kıyı yerlerinden birbirine en uzak
  iki tanesi, aradaki mesafe ne olursa olsun. Yalnızca bir kıyı yeri
  varsa ikincisi açık arazide ona en uzak yerdir; hiç yoksa açık arazide en
  uzak iki yer seçilir. Eski lobiler kendi sürümünde kalır.
- **Liman** (`cityHarbour` dünya üretiminde, `harbourOf` istemcide; yalnızca
  görsel): Göle bakan surun ortasında bir **liman kapısı**, kapıdan inen
  patika, kıyıdan göle uzanan 3 karo genişliğinde, 12 karoya kadar uzun
  **büyük ahşap iskele**, yer varsa yanında ikinci bir iskele ve kıyıda
  bir liman evi vardır. İskelelerin yanında **büyük kadırgalar** yanaşmıştır
  (yaklaşık 6,6 karo boyunda, uzun ve alçak; burnunda tunç mahmuz, iki
  yanında kürek sırası, bordasında kalkanlar, tek direkte çizgili büyük kare
  yelken, kıçta tenteli kasara ve fener; demirliyken kürekler dik çekili,
  yelken sarılı, suda hafifçe sallanır); göl genişse biri açıkta demirli bekler.
  **Her limanda** bir kadırga yelken açıp açığa gidip geri gelir: iskelelerden
  ve demirli gemilerden uzak şeritler arasından en uzun açık suyun olduğu
  seçilir. Kadırgalar **her yakınlaştırmada** görünür (yürüyenler ve kervanlar
  gibi uzakta gizlenmez) (`apps/web/src/game/shipSprites.ts`, `ambient.ts`). Eski lobilerdeki şehirlerin yanı uygun bir göle bakıyorsa
  onlarda da liman görünür.
- **Yollar:** Şehirler ticaret yolu ağının düğümleridir (hanlar gibi).
  Şehre giden yol **surda biter**, orada kapı vardır; şehre gitmeyen yollar
  şehrin çevresinden dolanır. Kervanlar şehir kapısına kadar gelir.
- **Görünüm:** Krallık yapılarıyla aynı çizimden: çevresinde köşe kuleli
  sur, her yolun girdiği yerde kuleli kapı; ortada **kraliyet kalesi**
  (4×4, tacın renginde çatılı, üç katlı ana kale; sarayın hiçbir lordun
  ulaşamayacağı 6. "seviyesi"), yanında **katedral** (çan kulesi, sivri
  külah, gül pencere) ve **anıt** (basamaklı kaide üstünde altın uçlu
  dikilitaş, köşelerinde mangallar); bu üçü oyunculara kapalıdır. Ardı
  sıra pazarlar, ambarlar, hazine, hastane, atölye ve sıkışık evler;
  surun iç dibinden dolanan ve kapılardan meydana inen sokaklar.
- **Dış şehir** (yalnızca görsel; şehrin kendi karoları iç kaledir): iç
  surun 10 karo dışından ikinci bir **dış sur** dolanır; köşelerinde, yol
  kapılarının yanında ve aralıklarla kuleleri, yolların kestiği yerlerde
  kapıları vardır. İki sur arasında yüksek evler, pazarlar, ambarlar,
  tapınaklar dolu bir dış şehir uzanır (yollardan ve surlardan uzak,
  arazinin izin verdiği yerde). Sur her yerde kesintisizdir; yalnızca suya
  düştüğü yerde açıktır. Bir yol (ya da liman yolu) suru kestiği her yerde
  tek bir kapı açılır, yol sur boyunca uzansa bile; kapı karadadır (yol
  suru köprüyle su üstünde kesiyorsa kapı yoktur, sur orada zaten açıktır)
  ve suyun kestiği üç parçadan kısa sur kırıntıları çizilmez; kuleler köşelerde,
  kapıların iki yanında ve 9 karoda bir durur
  (`apps/web/src/game/cities.ts` → `outskirts`).
- **Ordu karargâhı:** Dış surun 3 karo dışında, limanın karşı tarafında
  14×12 karoluk bir ordu kampı: kazık çitle çevrili (önü açık), arkada
  tacın renginde çizgili büyük komuta çadırı, iki yanında sıra sıra çadırlar,
  önündeki talim alanında üç sıra halinde 12 bölük asker, köşelerde mızrak
  sehpaları ve sancaklar (`warCamp`, görseller `campSprites.ts`).
- **Büyük iskele** bir rıhtımdır: kenarlarda babalar, bir yanında halat
  korkuluk, sandık ve fıçı yığınları, kıyı ucunda fenerler, öbür ucunda
  suya uzanan ahşap yük vinci ve kancasında bir yük ağı.
  Adı (ör. "Altınkapı Serbest Şehri") 1× ve altında şehrin üstünde, dünya
  haritasında altın renkte yazar. Üstüne gelince adı, tıklanınca paneli
  açılır: yöneten (lonca meclisi, kadı…), şehrin ödediği fiyatlar ve
  tüccarı oraya gönderme.
- **Güvenli bölge:** Şehrin ortasından `safeTiles` (26) karo içinde
  **meydan muharebesi olmaz**; savaştaki iki ordu orada karşılaşsa da
  çarpışmaz. Ordular şehrin `restTiles` karo yakınında handaki gibi moral
  toplar.
- **Ticaret:** Ticaret sekmesinde "Tüccar nereye gitsin": lobi pazarı ya
  da bir serbest şehir. Şehre giden tüccar sefer başına **2 kat yük**
  (`loadFactor`) götürür ve **lobinin o anki fiyatından** (`priceFactor` 1)
  satar; sabit fiyat yoktur, lobi fiyatı düşünce şehrin ödediği de düşer.
  Bu satış lobi fiyatlarını lobi pazarınınkinin **%80'i** kadar düşürür
  (`marketImpact` 0,8). Gelişmiş bir lord için şehir lobi pazarından
  %15–20 kârlıdır. (Önce 3 kat yük ve %10 fazla fiyattı ve fiyata
  dokunmuyordu: lobi pazarından 3–4 kat; sonra 2 kat, %5 ve yarım etkiyle
  hâlâ %60 kârlıydı.) Ama
  sefer her zaman lobi pazarınınkinden (30 sn) uzundur: 30 sn + ticaret
  noktası ile şehir arasındaki her karo için 0,36 sn (ör. 200 karo ≈ 102
  sn; hudutlar şehre 40 karodan yaklaşmadığı için en az ~45 sn). Şehir
  yakınken ve lobide çok satılan bir malı fiyatı daha da düşürmeden
  satmak için kârlıdır. Hedef değiştirilince tüccar yeni sefere
  başlar; 2 dakika yeniden değiştirilemez (`trade.city`, `setTradeCity`;
  sunucuda `tradeCity` komutu, sefer süresini sunucu hesaplar).
- **Eski lobiler:** Lobi, dünyasının hangi kuralla üretildiğini saklar
  (`lobbies.world_rev`, `WORLD_REV`): 1 şehirsiz, 2 yeni lobiler (şehirler
  yol ağıyla birlikte kurulur). **3**, şehirlerden önce açılmış bir lobiye
  şehir eklemek içindir: 1'in dünyası olduğu gibi kalır (yollar, köprüler,
  arazi), şehirler hiçbir yol/köprü/han karosuna değmeyen boş araziye
  kurulur ve her biri en yakın yola yeni bir yolla bağlanır. Lobiyi 3'e
  geçirirken sunucudaki `lobby_worlds` karoları da 3'ün karolarıyla
  değiştirilir (yalnızca şehir ve yeni yol karoları farklıdır); önce
  krallıkların hududuna değen karo olmadığı denetlenir. **4**, 2'nin
  aynısıdır ama şehirler göl kıyısına ve birbirinden en uzağa kurulur.
  **5** her zaman iki şehir kurar, **6** 5'in nehirleri genişletilmiş
  hâlidir (§4.2); yeni lobiler 6'dır (`command` lobiyi açarken
  `world_rev`'i yazar).
- **İleride:** paralı asker kiralama, barış görüşmelerinde arabuluculuk,
  rehine/fidye takası, kara borsa, şehirden mal satın alma.

---


### 7.8 Taç krallıkları ve biat (şu an uygulanan)

İki şehir yalnızca ticaret yeri değil, **iki NPC krallığın başkentidir**
(taç krallıkları). Oyuncular bu krallıklardan birine **bağlı lord** olur.
Değerler `config/balance/cities.json` → `crown`; mantık
`packages/shared/src/economy.ts` (`swearFealty`, `upgradeError`), adlar ve
renkler `apps/web/src/game/cities.ts`, panel `apps/web/src/ui/hud/cities.tsx`.

- **Taç krallıkları:** Her şehrin adı "X Krallığı"dır (başkenti X), bir
  hükümdarı (kral ya da kraliçe) ve bir **sancak rengi** vardır (biri
  kırmızı, biri mavi). Şehrin üstüne gelince çıkan etiket ve şehir paneli
  bu adı ve rengi gösterir; dünya haritasında başkentin adı yazar.
  Şehirlerin ticaret kuralları (§7.7) aynen geçerlidir.
- **Oyuncular krallık değil, lorddur.** Oyunda yalnızca iki krallık vardır
  (taçlar); oyuncunun toprağı "lordluk"tur. Menüdeki sekmenin adı
  **Saray**dır; arayüz oyuncuya "krallığın" demez, önerilen adlar
  "Krallığı/Hükümdarlığı" ile bitmez (Beyliği, Diyarı, Hanedanı, Sancağı,
  Yurdu, Malikânesi, Lordluğu, Hisarı).
- **Biat:** Oyuncu Saray sekmesindeki ya da saray menüsündeki
  **Bağlılık** bölümünden iki taç krallığından birine biat eder
  ("Biat et", onay ister). Biat **sezon boyunca kalıcıdır**, değiştirilemez.
  Biat edilmişse Bağlılık bölümünde tacın adı büyük bir düğme olarak
  yazar; tıklayınca kamera başkente gider ve tacın paneli açılır.
- **Tanıtım ve seçim:** Lordluk en az 6 yapıya ulaşmadan (sur ve kapı
  sayılmaz; `crown.intro.buildings`) biat edilemez: "Şu an uygun değil"
  (`'early'`). Bu eşiğe ulaşınca taçlar sayfa sayfa bir pencereyle
  kendini tanıtır (iki taç, rekabet ve güç, lord olmak ve armağanlar,
  taçların pazarı) ve son sayfa tarafını seçmeni ister; "Sonra karar
  vereceğim" denirse seçim Saray sekmesinden yapılır
  (`apps/web/src/ui/CrownIntro.tsx`, tarayıcıda bir kez gösterilir).
- **Ne zaman:** Başlangıçta zorunlu değildir; lordluk biatsız kurulur ve
  büyür. Ama **sarayı 2. seviyeye yükseltmek için biat şarttır**
  (`crown.requiredForPalaceLevel` = 2): biatsız krallığın saray yükseltmesi
  "Önce bir taç krallığına biat et" diye reddedilir (`'liege'` hatası).
- **Herkes görür:** Bir lordun kime biat ettiği herkese açıktır
  (`lobby_kingdoms` → `liege`). Tacın renginde küçük bir **sancak**
  (direk ve çatal uçlu bayrak) lordun adının yanında durur: haritada
  hududun üstündeki büyük ismin solunda, sohbette (mesajlar, krallıklar ve
  sıralama) ve diplomasi sekmesinde (liste ve krallık ayrıntısı; ayrıntıda
  "X Krallığı lordu" yazar).
- **Rakip taçların lordları:** Farklı taçlara biat etmiş iki lordun
  ilişkisi **−20'den başlar** ve zamanla oraya döner (0 yerine), **en fazla
  +40** olabilir (`diplomacy.json` → `crowns.rivalRest`, `rivalMax`). İttifak
  +50 istediği için rakip taçların lordları müttefik olamaz; tavandaki
  ilişkiye "ilişki geliştir" elçisi gönderilemez. Aynı taca bağlı ya da
  henüz biat etmemiş lordlar arasında eski kural geçerlidir (0'dan başlar,
  en fazla +100). Krallık ayrıntısı bu sınırı yazar.
- **Devriyeler** (`cities.json` → `crown.patrol`; mantık
  `packages/shared/src/patrols.ts`, sunucu `supabase/functions/_shared/patrols.ts`,
  `patrol_visits` tablosu): her taç krallığı başkentinden **tek, büyük bir
  devriye** çıkarır (`perCrown` = 1). Her 15 dakikalık turda devriye,
  tohumdan seçilen **kendi lordlarından birinin** sarayına gider (turun %40'ı),
  orada biraz kalır (%15) ve geri döner.
  Devriye **ticaret yollarından** gider: başkentin surundaki bir yol ucundan
  (böylece iç ve dış surun kapılarından) çıkar, yol ağında lorda en yakın
  noktaya kadar yolu izler, son parçayı araziden yürür. Yol iki katından
  uzun düşerse doğrudan gider (`apps/web/src/game/patrolRoutes.ts`).
  Devriye surların ve binaların içinden geçmez: başkentlerin (dış şehir
  dahil) sur, kule ve evlerini, lordların binalarını ve ayakta duran
  surlarını dolanır; başkentin de lordların da **kapılarından geçer**
  (`patrolBlocker`).
  Devriyeler haritada tacın renginde (kızıl / lacivert), sıradan ordulardan
  iri, **arka arkaya 5 bölüklük bir kol** olarak herkese görünür: bölükler
  aynı yolu biraz arayla izler, her biri kendi yönünü alır; yolun başında
  öndekinin çevresinde toplanırlar. Lordun sarayına (ya da eğlence
  merkezine) varınca kol yolda, binanın önünde arka arkaya durur (hiçbir
  bölük binanın üstüne çıkmaz); dönüşte arkadaki bölükler önden gider.
  Konumları saatten
  hesaplanır. Ordu sancakları gölge düşürmez (yüksekten düşen uzun gölge
  bölüğü havadaymış gibi gösteriyordu; `sprites.ts` → `NO_SHADOW`).
  - **Kendi tacının devriyesi** lordun **eğlence merkezine** uğrar, içer,
    eğlenir ve **120 altın bahşiş** bırakır. Eğlence merkezi yoksa sarayın
    önüne gelip geçer, bahşiş bırakmaz.
  - **Haraççılar** (haritada görünmez): Rakip taç, öbür taca bağlı her
    lordun kapısına **30 dakikada bir** haraççı gönderir (`patrol.tribute`
    → `everySeconds`); her lordun geliş anı tohumdan sabittir, aralık hep
    30 dakikadır (`tributeVisitAt`). Haraççı **hazinenin sabit %5'ini**
    ister (`share`; 7000 altında 350); ilişki ve güç bunu değiştirmez.
    Elçi diyaloğunda **"Öde"** ya da **"Reddet"**. Reddedilirse o tacın
    bütün lordlarıyla ilişki **−8** düşer. 5 dakika içinde cevap
    verilmezse haraç **kendiliğinden ödenir** (hazinede ne kadar varsa),
    ilişki bozulmaz: oyuncu **çevrimdışıysa** olağan haracı öder, ceza
    yoktur; **oyundaysa** (süre dolarken son 7 dakikada görülmüşse; oyun açıkken 5 dakikada bir haber verir. AFK)
    haracı **%50 fazlasıyla** öder (`tribute.afkFactor`, `onlineMinutes`).
    Haraç diyaloğu bu fazlalığı önceden yazar, ödeme haberi de hangisinin
    olduğunu söyler. Böylece dolu
    hazine düzenli boşalır ve tüccar yeniden satar (§6.4).
  - Biat etmemiş lordlara ne devriye ne haraççı gelir.
- **Eğlence merkezi** (4. seviye saray, krallıkta bir tane; 1200 altın, 700
  yapı malzemesi, 120 sn): bayraklı, fenerli, küçük sahneli iki katlı bir
  salon. Bağlı olunan tacın devriyeleri buraya gelip bahşiş bırakır.
  Menüsünde bir çizim, devriyelerin bahşişi ve oyun sekmeleri (balık tutma,
  okçuluk, örs, kervan yolu; oynanabilir olanda kırmızı nokta) vardır; her
  oyunun sıralama düğmesi de oradadır (§6.5).
- **Taçla ilişki** (`packages/shared/src/crowns.ts`, `cities.json` →
  `crown.relation`): her lordun iki taçla ayrı ayrı −100…+100 ilişkisi
  vardır (`crownRelations`). Zamanla (tur başına 0,03, saatte ~11 puan)
  dinlenme değerine döner: kendi tacıyla +15, rakip taçla −15, biatsızken
  0. Biat edince kendi tacıyla +20. Artıranlar: tüccarı o tacın başkentine
  göndermek (satış yapılan her sefer +0,4; başkente yakın lord ilişkiyi
  100'e çıkarabilir, ~250 karo uzaktaki ~25'te kalır), taç siparişleri
  (+3 / +1,5), deniz ticareti (+0,6), kendi tacının devriyesini ağırlamak (+1), rakip tacın
  haracını ödemek (+4). Azaltanlar: haracı reddetmek (−10). Cevapsız kalan
  haraç kendiliğinden ödenir, ilişkiyi değiştirmez.
- **Armağanlar:** Kendi tacının devriyesi her uğrayışta ilişki baremine
  göre armağan getirir: 30+ "Teşekkür sepeti", 60+ "Saray armağanı", 85+
  "Hükümdarın lütfu" (altın ve mallar; `crown.gifts`).
- **Taçların pazarı** (`crown.stewardship`): Her taç saatte bir değişen
  bir malın ticaretini yönetir (iki taç farklı mallar; lobi tohumu ve
  saatten). Lord o malı sattığında (lobi pazarında da şehirde de) fiyatı o
  taçla ilişkisine göre değişir: +100'de %25 fazla, −100'e doğru %35'e
  kadar az; −50'nin altında o tacın tüccarları onunla alışveriş etmez ve
  fiyat yarıya iner (`stewardFactor`, `tradePrice`).
- **Taç siparişleri** (`crown.orders`; `crowns.ts` → `crownOrder`,
  `fulfilOrder`, `settleOrderTrips`; sunucuda `order` komutu; Ticaret →
  Siparişler): her taç her saat bir mal siparişi verir (lobi tohumundan: bir
  mal, 240–960 birim). Lord "Kervanla gönder" der: mallar depodan hemen çıkar
  ve bir **kervanla** tacın başkentine gider; ödeme ve ilişki **kervan dönünce**
  gelir. Sefer, tüccarın o şehre gidip dönmesi kadar sürer (`cityTripMs`:
  30 sn + ticaret noktası ile başkent arasındaki her karo için 0,36 sn;
  ticaret noktası yoksa gönderilemez). Taç malı gönderildiği andaki **lobi
  fiyatının %25 fazlasına** alır (biat edilen taç %20 daha fazla öder);
  olağan fiyata bağlı olsaydı pazardan dip fiyata alıp teslim etmek
  garantili kâr olurdu. Kervan dönerken hazine doluysa sığmayan altın boşa
  gider. İlişki: kendi tacı +3, öbürü +1,5. Her lord her tacın siparişini
  saatte bir kez gönderebilir; 2. seviye saray ister, ilişki −50'nin
  altındaysa taç almaz. Satış lobi fiyatlarına dokunmaz. Panel her taç için
  bir kart gösterir (istenen mal, ödeme, sefer süresi, kalan süre; düğme
  kartın altında tam genişlikte) ve yoldaki kervanları ilerleme çubuğuyla;
  kervanlar sayaçlarda da görünür, dönüş günlüğe yazılır.
- **Taçların gücü** (`crown.power`): Bir tacın gücü 400 + ona bağlı
  lordların puanlarının toplamıdır; lordları geliştikçe güçlenir. Güç payı
  kendi lordlarına bahşiş ve armağanları ×0,7–1,3 etkiler (eşit güçte ×1).
- **Taçların görevleri** (`cities.json` → `crown.quests`; `crowns.ts` →
  `crownQuest`, `questProgress`, `questError`, `takeQuest`, `claimQuest`;
  sunucuda `quest` komutu): her taç her saat her lorddan bir iş ister (lobi
  tohumundan, herkese aynı): **ticari üstünlük** (bu saat tüccarın bir maldan
  150–450 birim satsın), **kasaba ele geçir**, **siparişimizi gönder** (bu
  saatin taç siparişi) ya da **ordunu büyüt** (garnizon ve sahadaki askerler
  en az ×1,25, en az 10). Lord görevi alır (başladığı yer saklanır:
  satılmış birim, kasaba sayısı, hedef asker; `Kingdom.crownQuests`), saat
  dolmadan bitirip **ödülü alır**: 100–250 altın (hazineye sığdığı kadar;
  yer azsa önceden uyarılır) ve o taçla ilişki (kendi tacı +5, öbürü +3).
  2. seviye saray ister; ilişki −50'nin altındaysa taç bir şey istemez.
- **Diplomasi → Krallık** (`cities.tsx` → `CrownsPanel`): her taç için bir
  kart: hükümdar ve başkent, seninle ilişkisi (çubuk), **politikaları**
  (lobi pazarından o an hangi malı dakikada kaç birim aldığı, yönettiği mal ve
  senin fiyat etkin, bu saatin siparişi ve ödediği, devriye mi haraççı mı
  gönderdiği) ve **senden istediği** görev (ilerleme çubuğu, ödül, kalan
  süre, "Görevi al" / "Ödülü al"); altında **taçların gücü** (güç savaşı:
  pasta grafik ve iki tacın lordları) ve **taçların pazarı**. Ödülü
  bekleyen görev varsa sekmede kırmızı nokta yanar.
- **Taç paneli** (başkente tıklayınca): hükümdar, şehrin fiyatları,
  seninle ilişkisi (çubuk, dinlenme değeri, ilişkiyi değiştirenler ve
  armağan baremleri), **taçların gücü** (pasta grafik ve iki tacın lordları
  puan çubuklarıyla), **taçların pazarı** (hangi tacın hangi malı yönettiği,
  kalan süre ve senin fiyat etkin), bağlılık ve tüccar gönderme.
- Başka etkileri (taç savaşları) sonra eklenecek.

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
- **Hedefe yapışma:** Ordu "Hareket" ile gönderilirken fare bir lordun
  topraklarına, bir taç şehrine (dış suru dahil) ya da bir kasabaya 8
  karodan yakın gelince en yakını kendiliğinden seçilir: çevresi kesikli
  çizgiyle (lord kendi renginde, şehir tacın renginde, kasaba altın renginde)
  ve adıyla gösterilir; tıklayınca ordu oraya gider (lordda sarayına,
  kasabada kapısına; kasaba kuşatması yalnızca kasaba panelinden başlar). Kendi ordusunun 2,5 karo yakınındaki boş yere
  tıklamak o orduyu seçer (ordu sekmesi açılır).
- **Takip et:** Ordu kartındaki düğme kamerayı orduya kilitler; kamera
  orduyla birlikte kayar. Düğmeye yeniden basınca, alttaki şeritteki
  "Bırak" ile ya da harita sürüklenince takip biter.
- **Hızlı hedefler:** Ordu "Hareket" ile gönderilirken solda, savaşta
  olunan krallıkların listesi açılır: sarayını kuşat (kalkan süresiyle),
  gözdağı ver (sınırının 3 karo dışına git ve bekle), ticaret noktasına
  git, ordularından birine muharebeye git; ayrıca eve dön ve haritada
  göster. Haritaya tıklamak da hâlâ geçerlidir.
- **Gözdağı:** Savaşta olunan bir krallığın hududuna 6 karodan yakın
  bekleyen (yürümeyen) ordu, o krallığın halkını korkutur: 2 dakika
  boyunca mutluluk hedefi −12 (ordu kaldıkça yenilenir). Korkutulan
  krallığa elçi haber getirir; Halk sekmesinde uyarı çıkar.
- **İletişim penceresi:** Elçi orduya ulaşıp emri verdikten sonra
  **30 saniye** komutanın yanında kalır; bu sürede verilen yeni emirler
  elçi beklemeden hemen uygulanır (`time.json` → `contactSeconds`). Kalan
  süre ordu kartında ve sayaçlarda görünür.
- Sunucuda ordu konumu saklanmaz; rota `path`, `depart_at`, `arrive_at`
  olarak tutulur, konum bu değerlerden hesaplanır. Oyuncu oyunu kapatsa da
  ordusu yoluna devam eder; **diğer oyuncular onu aynı formülle yolda ve
  savaşta görür.**
- **Bölme / birleşme:** Ordu bölünürse her parça ayrı bir ordudur (kendi
  rotası, kendi karşılaşmaları). Bölme de bir emirdir; elçi vardığında
  ordunun o anki konumunda iki ordu oluşur. Aynı karodaki dost ordular
  birleş emriyle tek orduya döner. Muharebedeki ordu bölünmez. Bölme,
  birleşme ve kasaba kuşatmasının kayıpları ordunun satırını yalnızca
  okunduğu hâliyle yazar (asker sayısı üzerinde CAS), böylece aynı anda
  gelen iki emir askerleri çoğaltamaz ya da yok edemez.

### 8.2.2 Meydan muharebesi (yolda karşılaşma)

- Savaş halindeki iki krallığın orduları birbirine **5 karo** (çember
  yarıçapı) kadar yaklaşınca meydan muharebesi olur (`military.json` →
  `contactTiles`).
- Emirler gecikmeli olduğu için rotalar önceden bellidir: karşılaşma, bir
  emir yürürlüğe girdiğinde rotaların zaman-mekân kesişimi hesaplanarak
  **zamanlanmış olay** olarak kaydedilir; sürekli konum taraması yapılmaz.
- Bir rota değişirse o orduya ait bekleyen karşılaşmalar silinir ve
  yeniden hesaplanır. Taraflar çevrimdışı olsa da savaş zamanında olur
  (bkz. §11.1 olay işleyici).
- **Serbest şehirlerin** çevresinde muharebe olmaz (güvenli bölge, §7.7).
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

### 8.4 Kasabalar (şu an uygulanan)

Haritada rastgele küçük **kasabalar** vardır; kuşatılıp fethedilir, sahibine
her tur katkı gönderir ve savaşta olunan başka bir lord tarafından geri
alınabilir. Değerler `config/balance/towns.json`; yerleşim ve bonus
`packages/shared/src/towns.ts`; sunucu `supabase/functions/_shared/towns.ts`
(`lobby_towns` tablosu); çizim `apps/web/src/game/towns.ts`, panel
`apps/web/src/ui/hud/towns.tsx`.

- **Yer:** Lobi başına oyuncu sayısının ~1,2 katı (9 kişilik lobide 11,
  18 kişilikte 22; `perPlayers`) kasaba, 8×8 karo. Lobi tohumundan, sunucu tarafından **bir kez** yerleşir
  (ilk komutta; eski lobiler dahil): dağ halkasının içinde, düz kuru arazide,
  yollardan, hanlardan, taç başkentlerinden, birbirinden ve o ana kadar
  verilmiş bütün kuruluş yerlerinin son hududundan uzakta. Sonra gelen
  oyuncuların kuruluş yerleri de kasabalardan uzak seçilir.
- **Görünüm:** Ortada kasabanın işini gösteren bir yapı (pazar, ambar,
  oduncu, demirhane, tapınak), çevresinde evler, köşede gözcü kulesi, önünde
  bir patika. Adı üstünde yazar; sahibi varsa sahibinin renginde ve adıyla.
- **Türler ve katkı** (tur başına, yokluk cezasına tabi): vergi kasabası
  +1,5 altın, tarım +5 yemek, kereste +4 yapı malzemesi, demirci +3,5 savaş
  malzemesi (mal kasabaları önce 2 / 1,6 / 1,4 idi ve bakımlarını
  karşılamıyordu); kalabalık kasaba **14 köylülük yer** verir (nüfus sınırı ve
  barınak birlikte artar; halk o yeri zamanla doldurur, ayaklanmada yer
  gidince o köylüler de gider). Türler kasabalar arasında dağıtılır; her tür en az bir kez vardır.
- **Kuşatma:** Kuşatma yalnızca kasaba panelinin **Kuşat** bölümünden
  başlar: kapıda bekleyen ordu için "Kuşatmayı başlat", uzaktaki için
  "Gönder ve kuşat" (emir `move` + `siege: true`). Haritadan "Hareket" ile
  kasabanın üstüne gönderilen ordu yalnızca kasabanın kapısına yürür ve
  orada bekler, kuşatmaz. Kuşatma emri verilen ordu kapıya varınca kuşatma
  başlar ve **15 dakika** sürer;
  ilerleme çubuğu kasabanın üstünde, kuşatanın renginde görünür.
  Kuşatma **5 dakikalık turlarla** işler (`siegeRoundSeconds`): her turda
  kuşatan **en az 1 asker** kaybeder (sahipli kasabada da; halk direnir),
  sahipsiz kasabada garnizon da kendi askerlerinden kaybeder. Turlar kasaba
  ve kuşatmanın başlangıcından belirlenir (`townSiegeRounds`); sunucu her
  dakika o ana kadarki kaybı orduya işler (`siege.lost`). Kuşatma, savaş
  gibi **izlenebilir**: Ordu sekmesindeki "Süren savaş" satırında ve kasaba
  panelinde "İzle" düğmesi açar (iki taraf, turlar, kayıplar, canlandırma). Ordu orada
  kalmalıdır: başka yere gönderilirse, yenilirse ya da savaş biterse kuşatma
  kalkar. Aynı anda bir kasabayı tek ordu kuşatabilir.
- **Tahta surlu kasabalar:** Kasabaların ~%40'ı (tohumdan) kazık çitle
  çevrilidir; ön ortada geçit açıktır. Taş surdan zayıftır: kuşatma %30
  uzun sürer, garnizon %35 daha çok kayıp verdirir (`towns.json` →
  `palisade`, `townWalled`).
- **Sahipsiz kasaba** kendi garnizonuyla (6–12 asker) savunur: kuşatma
  boyunca ordu garnizonun %60'ı kadar asker kaybeder (turlara yayılmış);
  bitince ayakta asker kalırsa kasaba onundur, kuşatanlar daha önce
  tükenirse kasaba dayanır (garnizonu azalır).
- **Sahipli kasaba** yalnız sahibiyle **savaşta** olan biri tarafından
  kuşatılabilir; garnizonu yoktur, kuşatma bitince el değiştirir. Sahibi
  ordusunu gönderip kuşatanla meydan muharebesine girerek kuşatmayı kırabilir.
- Kuşatma başlarken, kalkarken, kasaba alınınca ya da dayanınca elçi iki
  tarafa da haber getirir. Krallığın elindeki kasabalar durumunda tutulur
  (`towns`), katkı her üretim turunda eklenir.
- **Sadakat ve bakım** (`towns.json` → `loyalty`, `upkeep`, `revolt`, `score`;
  mantık `packages/shared/src/towns.ts` → `townsRound`): elde tutulan her kasabanın
  bir **sadakati** (0–100, alınınca 50) ve lordun seçtiği bir **bakımı** vardır:
  **Yok / Az / Orta / Cömert** (tur başına 0 / 0,3 / 0,7 / 1,2 altın; yeni alınan
  kasaba "Az" ile başlar). Bakım her üretim turunda hazineden ödenir; hazine
  yetmezse ödenmez ve o tur bakım yokmuş sayılır. Sadakat her tur bir hedefe
  doğru kayar (~30 dakikada yolun üçte ikisi): hedef bakımdan gelir (%15 / 45 /
  65 / 85), lordun halkının mutluluğu (50'den her puan ±0,2) ve hükümdarın halk
  yeteneği ekler ya da düşürür. Kasabanın katkısı sadakatle çarpılır (%0'da ×0,5,
  %50'de ×1, %100'de ×1,5; kalabalık kasabanın köylüleri de).
  - **Ayaklanma:** Sadakat **25'in altına** inince kasaba ayaklanır: 10 dakika
    hiçbir şey göndermez (köylüleri de gider). Ayaklanma bittiğinde sadakat hâlâ
    25'in altındaysa ayaklanma sürer; **12'nin altındaysa kasaba lorddan kopar**:
    sahipsiz olur ve 3–6 askerlik küçük bir garnizonla kendini savunur. Lord
    ayaklanmayı ve kopuşu elçi haberiyle öğrenir (`town_revolt`,
    `town_lost_revolt`). Sunucu, sadakati düşük kasabası olan lordların
    durumunu (çevrimdışıyken de) dakikada bir ilerletir, ayaklanmayı bir kez
    duyurur ve kopan kasabayı `lobby_towns`'ta sahipsiz yapar (lordun
    durumundaki `townsLost` listesinden; `supabase/functions/_shared/towns.ts`
    → `settleRevolts`).
  - **Casusluk:** Kasaba sahibinde en az %40 ağı olan biri **"Kasabada isyan
    kışkırt"** operasyonuyla (120 altın) seçtiği kasabanın sadakatini bir anda
    **35** düşürür (`espionage.json` → `operations.townRevolt`); diğer
    operasyonlar gibi başarı şansı, ağ harcaması ve yakalanma vardır.
  - **Aşırı büyüme** (`towns.json` → `overreach.tiers`; `overreachOf`,
    `townLoyaltyParts`): bir lord aynı anda birden çok kasaba tutarsa elindeki
    kasaba sayısına göre bütün kasabalarına ve kendi halkına ceza işler:

    | Kasaba | Sadakat hedefi | Lordluğun mutluluğu | Bakım | Katkı |
    | --- | --- | --- | --- | --- |
    | 2 (hafif) | −5 | −2 | ×1,1 | ×1 |
    | 3 (ağır) | −20 | −6 | ×1,4 | ×0,85 |
    | 4+ (isyan) | −40, **en fazla %10** | −12 | ×2 | ×0,6 |

    4 ve üstünde sadakat hedefi kopma çizgisinin (%12) altında bir tavana
    takıldığı için cömert bakım, mutlu halk ve iyi hükümdarla bile **bütün
    kasabalar ayaklanır ve sonunda kopar**. **Ayaklanan kasabaya bakım
    ödenmez** (bir şey göndermez, bir şey almaz). Bir kasabayı bırakmak için
    paneldeki **"Serbest bırak"** kullanılır (aşağıda); kopunca ya da
    bırakılınca ötekiler rahatlar. Ölçülen (altın kasabaları,
    Orta bakım, %75 mutluluk): 1 kasaba +382/sa, 2 kasaba +667, 3 kasaba +319,
    4 kasaba −695 ve hepsi kopar (önce 4+ kasaba sadakat 15'te takılıp sonsuza
    dek ayaklanıyor ve saatte ~1.900 altın bakım ödüyordu). Sunucunun ayaklanma işleyişi değişmez; ayaklanmalar sadakatten
    çıkar. Haritanın sağındaki uyarı kartlarında "Aşırı büyüme" kartı çıkar (2
    kasabada sarı, 3+ kırmızı; dokununca en huzursuz kasabanın paneli açılır).
    Sahipsiz/başkasının kasabasının panelinde ve kendi kuşatmanın başladığı,
    kasabayı aldığın elçi haberinde, bir kasaba daha almanın aşırı büyümeyi
    nasıl artıracağı yazar.
  - **Serbest bırak** (`releaseTown` komutu; `towns.ts` → `releaseTownError`,
    `releaseTown`): lord elindeki bir kasabayı kendi isteğiyle bırakabilir
    (panelin sonunda, "Emin misin?" onayıyla). Kasaba sahipsiz olur ve kopan
    kasaba gibi 3–6 askerlik küçük bir garnizonla kendini korur; bakımı ve
    katkısı, kattığı puan biter, aşırı büyüme basamağı hemen düşer. Kuşatma
    altındaki kasaba bırakılamaz (`'besieged'`). Bir bedeli yoktur: aşırı
    büyümeden kurtulmanın, ayaklanmayı beklemeden yolu budur.
  - **Panelin bölümleri:** kasaba paneli de alt sekmelere bölünür (son bakılan
    hatırlanır; `usePart` anahtarı `town:own` / `town:other`). Üstte özet hep
    durur (kimin elinde, ne gönderir). Kendi kasaban: **Durum** (sadakat,
    huzursuzluğun kaynakları; ayaklanmada ya da ayaklanmaya yakınken kırmızı
    nokta), **Bakım** (aşırı büyüme ve bakım; birden çok kasabada nokta),
    **Getiri** (gönderdikleri, kattığı güç), **Kuşatma** (süren kuşatma ya da
    savunma bilgisi) ve **Bırak**. Başkasının ya da sahipsiz kasaba: **Bilgi**
    (bir kasaba daha almanın aşırı büyümeye etkisi) ve **Kuşat**.
  - **Kasaba paneli** (kendi kasaban): sadakat çubuğu, yönü ve hedefi neyin
    belirlediği, ayaklanma uyarısı; **huzursuzluğun kaynakları** (bakım tabanı,
    halkın mutluluğu, hükümdar, aşırı büyüme ve tavanı, gittiği yer ve şu an
    0–100 ölçeğinde şelale çubuklarıyla, %25 ayaklanma ve %12 kopma çizgileri;
    son 2 yarı ömürde casus kışkırttıysa ne kadar ve ne zaman (`incitedAt`);
    ayaklanma riski çubuğu (düşük / orta / yüksek / kesin, kesinse kaç dakika
    kaldığı) ve önümüzdeki saatte sadakat eğrisi); aşırı büyüme basamakları
    (1, 2, 3, 4+ kasaba, lordun basamağı işaretli); bakım seçimi (tur ve saat başına altın);
    alındığından beri gönderdiklerinin toplamı (mal mal) ve şu anki tur başına
    katkısı; ve **kattığı güç**: lordun puanına (Zafer kalemi) kasaba başına 40 ×
    sadakat çarpanı (ayaklanmada yarısı); bu puan bağlı olunan taç krallığının
    gücüne de eklenir (§7.8).
- **İleride:** kasabaya asker yerleştirme, kasaba yükseltme.

### 8.5 Donanma (şu an uygulanan)

Değerler `config/balance/navy.json` (tersane `economy.json` → `buildings.shipyard`);
mantık `packages/shared/src/navy.ts` (komutlar `realm.ts` → `shipsError`,
`orderShips`); sunucuda gemi buluşmaları `supabase/functions/_shared/navy.ts`
(`settleNavy`, tick'te); arayüz `apps/web/src/ui/hud/navy.tsx` (Ordu sekmesi →
**Donanma**; tersaneye tıklamak da açar), haritada `apps/web/src/game/fleetShips.ts`.
Donanma paneli alt sekmelere bölünür (`usePart` anahtarı `navy`): **Filolar**
(filo kartları, ordu kartları gibi tam genişlikte; görev düğmeleri üçlü
sütunlarda), **Liman** (limandaki gemiler, filo çıkarma), **Tersane** (gemi
türü, maliyet, kızak) ve **Defter** (deniz ticareti sonuçları).

- **Tersane** (**4. seviye saray**, bir tane, 3 seviye): 2×2, **suyun kıyısına**
  kurulur: karolarından en az biri kıyı, gerisi serbest kara olmalıdır (iskele
  eki de sayılır). Taşınamaz. Görseli: tahta avlu, alet ve zift sundurması,
  vinç ve kereste yığını; kızakta (raylar, traversler, takozlar) gerçek bir
  gövde kabuğu olarak çizilen yapım hâlinde bir gemi: 1. seviyede omurga,
  bodoslama ve kaburgalar, yanında dayaklar ve arka yanında iskele; 2.
  seviyede gövde yarıya kadar kaplanmış, yanında ikinci, küçük bir kızak;
  3. seviyede küpeşteye kadar kaplanmış, su hattının altı ziftli, ambarı
  kemereli, direği dikilmiş ve flamalı bir gövde.
  Kızak sayısı (aynı anda yapılan parti) 1 / 2 / 3, limanın gemi sınırı
  6 / 10 / 16. Lordların gemileri haritada türüne göre çizilir
  (`shipSprites.ts` → `ship`, `kind`): **kadırga** taç limanlarının
  kadırgasının küçültülmüşü (2,4 karo; mahmuz, kalkanlar, kürekler, tente,
  çizgili kare yelken), **koka** geniş, karnı yuvarlak, iki ucunda yüksek
  kasaralı, küreksiz bir yük gemisi (2 karo; düz kare yelken), **çektiri**
  ince, az kürekli, uzun eğik serende üçgen latin yelkenli bir akıncı (2
  karo). Gövde boyla birlikte bütünüyle küçülür (genişlik, direk, kürek).
  Her gemi yalnız gövdesinin tamamını alan açık suya yerleşir
  (`fleetShips.ts` → `berth`): istenen yere en yakın uygun yer aranır, dar
  nehirde gemi nehrin yönüne döner, iskeleye ve başka gemilere binmez; yer
  yoksa çizilmez. **Gemiye tıklamak** kendi gemindeyse Ordu → Donanma'yı
  açar (filodaysa Filolar, limandaysa Liman bölümü), başkasınınkindeyse o
  lordu Diplomasi'de açar (`ambient.ts` → `pickShip`).
- **Gemiler:**
  - **Kadırga** (savaş): güç 3, eskort 2, yük 24, 4 denizci; çektirileri yener.
  - **Koka** (yük): güç 0,6, yük 80, balıkta iyi, 2 denizci.
  - **Çektiri** (hızlı akıncı, 2. seviye tersane): güç 1,8, eskort 1,5, yük
    40, 3 denizci; kokaları yener.
  Gemi altınla, malzemeyle ve süreyle yapılır ve pahalıdır (kadırga 260
  altın, 160 yapı, 70 savaş malzemesi; koka 170 altın, 200 yapı; çektiri 150
  altın, 110 yapı, 40 savaş malzemesi); **tayfa asker havuzundan**
  gelir. Denizciler köylü sayılmaz (nüfustan düşer). Her gemi tur başına
  az ama sürekli bir altın bakımı ister (kadırga 0,1, koka 0,05, çektiri
  0,07; saatte ~36 / 18 / 25 altın), her denizci yemek ister.
- **Liman ve filolar:** Yapılan gemiler limana bağlanır. Limandaki
  gemilerden **en çok 2 filo** çıkarılır (ordular gibi). Evdeki bir filo
  ikiye **bölünebilir**, iki filo **birleşebilir**, filo limana geri
  bağlanabilir. Limandaki gemiler ve limanda bekleyen filolar iskeleyi savunur.
- **Görevler** (evdeyken anında değişir):
  - **Limanda bekle:** iskeleyi savunur.
  - **Deniz ticareti:** filo seçilen malı bir taç başkentinin limanına
    taşır, satar, döner ve yeniden çıkar. Sefer 90 sn + iskele ile başkent
    arasındaki her karo için 0,18 sn. Yük filonun yük kapasitesi kadardır
    (lord yokken yarısı). Fiyat **lobi fiyatının %85'i** (limandaki aracılar)
    × tacın pazar etkisi (§7.8); satış lobi fiyatını tüccarınkinin **yarısı**
    kadar düşürür. Satış yapılan taçla ilişki her seferde +0,6. Hazine doluysa
    yalnızca dolduracak kadar satar.
  - **Balık avı:** gemiler iskele önünde balık tutar (tur başına koka 0,36,
    çektiri 0,2, kadırga 0,12 yemek × arazinin yemek çarpanı). Denizci başına
    tur 0,1 yemek (köylü gibi; önce 0,25 kalmıştı ve balık avı zarar ediyordu).
  - **Korsan avı:** savaş gemileri korsan arar; arada bir bir tayfa
    yakalanır (30 altın ödül), arada bir bir gemi batar. Yakalama sıklığı
    filonun gücüyle artar ama bir tavanı vardır (tur başına en çok %3);
    büyük filo daha az gemi kaybeder. Bir filo korsan avındayken ticaret
    seferlerine korsan saldırısı olasılığı yarıya iner.
  - **Abluka** (savaşta, hedefin iskelesi olmalı): filo hedefin iskelesine
    yol alır (iki iskele arası uzaklık × 0,15 sn, en az 45 sn). Varınca oradaki
    gemilerle **deniz muharebesi** olur. Kazanırsa iskele **abluka** altına
    girer: hedefin iskelesi balık tutmaz, balıkçı kulübesi altın bulmaz, deniz
    ticareti ve balık avı durur, gemileri yalnızca ablukayı yarmak için
    çıkabilir, halkın mutluluğu −6. Abluka filo geri çağrılınca, ablukayı yarma
    başarılı olunca ya da savaş bitince kalkar. Bir iskeleyi aynı anda tek
    donanma abluka edebilir.
  - **Kıyı akını** (savaşta, 10 dk'da bir): varınca oradaki gemilerle
    çarpışır; kazanırsa hedefin depolarından her malın %12'sini gemilerin
    taşıyabildiği kadar alıp döner (ganimet dönüşte depoya girer).
  - **Ablukayı yar** (yalnızca abluka altındayken, savaş gemisi gerekir):
    30 sn sonra ablukacı filoyla çarpışır; kazanırsa abluka kalkar ve
    ablukacı filonun kalanı eve döner.
  Uzaktaki (abluka, akın, yarma) filo **geri çağrılabilir**: yol aldığı kadar
  geri döner.
- **Deniz muharebesi** (`navalBattle`): iki taraf gücünün üstüne zar atar
  (kadırga çektiriyi, çektiri kokayı yener: +%25); kendi iskelesindeki
  savunan +%15 güçlüdür. Kaybeden gemilerinin %15–40'ını, kazanan %5–20'sini
  (çarpışma ne kadar çetinse o kadar) kaybeder; en hafif gemiler önce gider.
  Sonuç tohumdan belirlenir; iki taraf da elçiden haber alır (günlükte
  Önemli sayılır).
- **Korsanlar:** Her ticaret seferinde korsan saldırısı olasılığı %12 ×
  (1 − 0,13 × eskort gücü, en az %15'i); fırtınada ×1,8, siste ×0,7.
  **Korsan mevsimi** (lobi tohumundan; iki saatlik pencerelerin dörtte
  birinde 30–50 dk) olasılığı ×2,5 yapar ve Donanma bölümünde yazar. Eskort
  korsanları yenerse yük güvende ve 35 altın ödül; yenemezse yük gider ve
  bir gemi batabilir (eskortsuz %20, eskortlu %15).
  Seferler, saldırılar, av ve dönüşler günlükte yazar.
- **Hareket et** (`seaways.ts`; sunucuda `fleet` komutu, `sail` eylemi):
  evdeki bir filo (ticarette değilse) ordu gibi haritada bir yere
  gönderilir: "Hareket et" deyip bir nehre ya da göle tıklanır. **Karaya
  tıklanamaz** ("Gemiler yalnız suda yüzer"), aynı suya bağlı olmayan yere
  gidilemez ("Oraya su yolu yok"). Yol karo karo su üstünde aranır (A*,
  karadan köşe kesmeden), sonra suyun izin verdiği yerde düzleştirilir;
  filo karo başına 0,5 sn'de yol alır (`navy.json` → `sail`) ve vardığı
  yerde demirler. Hedef dar ya da kıyıya yapışık bir su karosuysa filo
  4 karo içindeki en yakın açık suya (çevresi de su olan karoya) demirler,
  gövdeler kıyıya taşmaz (`openWater`). Emir elçisiz, hemen gider. Seyir filonun `sail` alanında
  yol, kalkış ve varış anı olarak saklanır, konum bunlardan hesaplanır;
  bölünen filonun yeni parçası aynı yoldan gider. Görevler (balık, korsan
  avı, ticaret) eskisi gibi işler; seyir yalnız filonun nerede durduğunu
  belirler.
- **Haritada filo** (`createWorld.ts` → `drawFleets`): her filonun ilk
  gemisinin üstünde lordluğun renginde bir etiket ("1. filo · 3") durur.
  Yol alan filonun kalan yolu lordun renginde kesikli çizgiyle, ucunda
  gittiği yönü gösteren bir okla çizilir. Bir filoya tıklamak onu **seçer**:
  gemileri altın dış hatla vurgulanır. Kendi filon Ordu → Donanma →
  Filolar'da da seçili (altın çerçeveli) görünür; karttaki **Göster** filoyu
  seçer ve kamerayı ona götürür. Boş yere tıklamak seçimi kaldırır.
  **Başka bir lordun filosuna** tıklamak bir pencere açar
  (`navy.tsx` → `RivalFleetSheet`): lord ve filo, filonun kaba büyüklüğü,
  ne yaptığı, varış süresi, haritada göster ve "Lordu aç". **Hangi gemiden
  kaç tane** olduğunu yalnız casuslar söyler: o lordda **Ordu** konusunda en
  az %30 ağın varsa casus raporu limanın ve her filonun tür tür tahminini
  getirir (`intel` → `navy`; ağ güçlendikçe aralık daralır); pencerede
  "Casus raporunu getir" düğmesi vardır.
- **Herkes görür:** lobi her lordun filolarını haritada görür
  (`lobby_kingdoms` → `navy.fleets[].sail`): limandaki gemiler iskelenin
  yanına yanaşmış (en çok 4); limanda bekleyen filo iskelenin açığında ya da
  gönderildiği yerde demirli, yoldaysa suda yol alıyor (gemileri ilkinin
  ardından aynı yolda sıra hâlinde, en çok 3); **balık avındaki** filo
  durduğu yerin çevresinde (5 karo) ağır ağır, **korsan avındaki** daha
  geniş (12 karo) dolaşır; **ticaretteki** filo her seferde suda en uzağa
  (26 karoya kadar) açılıp döner; hiçbiri gözden kaybolmaz. Abluka eden
  filonun kadırgaları hedefin iskelesinin önünde demirler; akına giden ve
  dönen filolar görünmez. Başkalarının limanı ve filoları yalnız **kaba
  büyüklükle** görünür: birkaç (1–3), orta (4–8) ya da büyük (9+;
  `rough_ships`), türleri görünmez (yalnız kadırga olup olmadığı); kendi
  filonun etiketinde kesin sayı, başkasınınkinde "birkaç / orta / büyük"
  yazar (`lobby_kingdoms` → `navy`, `blockade`). Abluka ve yoldaki filolar harita
  uyarılarında ve sayaçlarda görünür.
- **Puan:** gemilerin gücü ordu puanına asker gibi sayılır.

## 9. Krallıklar Arası İlişkiler (Crusader Kings tarzı)

### 9.1 Hanedan ve karakterler

**Şu an uygulanan** (değerler `config/balance/dynasty.json`, mantık
`packages/shared/src/dynasty.ts`, arayüz `apps/web/src/ui/hud/dynasty.tsx`,
portreler ve sahneler `apps/web/src/ui/DynastyArt.tsx`):

- Her lordluğun bir **hanedanı** vardır: **hükümdar**, **kraliçe** ve
  **çocuklar**. Kişiler yaşlanır: **1 hanedan yılı = 6 gerçek saat**
  (sezon ≈ 56 yıl). İlk hükümdar 26–38, kraliçe 19–28 yaşında gelir.
  Saray sekmesinin **Hanedan** bölümü portreleri, yaşları, yetenekleri,
  çocukları ve ataları gösterir.
- **Saray sekmesinin bölümleri:** Saray sekmesi üç alt sekmeye ayrılır:
  **Seviye** (saray kartı, hudut ve saray yükseltme, iskele, Bağlılık),
  **Hanedan** ve **Yapılar** (kurulu / sınır listesi); Ayarlar hepsinin
  altında durur. Son açılan alt sekme tarayıcıda hatırlanır
  (`tabs.tsx` → `showPalacePart`). Adı konmamış ya da eğitimi seçilmemiş
  reşit olmayan bir çocuk varsa Hanedan sekmesinde kırmızı bir nokta yanar.
- **Yetenekler** (0–10): **Maliye** (vergi ±%3, ticaret geliri ±%2 / puan),
  **Halk** (mutluluk ±1,2, iş gücü ±%1,5 / puan), **Askerlik** (savaş zarı
  ±0,12, asker maaşı ∓%2 / puan); 5 ortadır. Kraliçenin yeteneklerinin
  ortadan farkının yarısı hükümdarınkine eklenir.
- **Kraliçe ve doğumlar:** Kraliçe alınınca (Halk sekmesi) hanedana katılır
  ("Kraliçe saraya geldi"). Kraliçe saraydayken (kaçırılmamışken) ilk çocuk
  0,4–1 yıl içinde, sonrakiler 1,2–2,5 yılda bir doğar; en çok 4 çocuk,
  kraliçe 44 yaşına kadar. %55 oğlan. Çocuğun yetenekleri %60 anne-baba
  ortalaması, %40 yeni çekiliştir. **Sarayı 3. seviyeye yükseltmek için
  kraliçe şarttır** (`'queen'` hatası).
  Saray sekmesinde yükseltme bu yüzden kapalıysa düğmenin altında bunu
  söyleyen bir uyarı ve oradan kraliçe getiren **"Kraliçe bul"** düğmesi
  durur (kraliçe rehinse fidye yolu yazar).
- **Kuraldan önce yükselmiş saraylar:** Sarayı 3. seviye ya da üstü olup
  kraliçesi olmayan (ve kraliçesi rehin olmayan) lordluğun ekranının sağında
  "Kraliçeye ihtiyacımız var" uyarısı durur; "Kraliçe getir" düğmesi tek
  tuşla, bedelsiz ve nüfus şartı aranmadan rastgele bir kraliçe getirir
  (`queenOwed`). Kraliçesi rehinken yeni kraliçe alınamaz.
- **Ad üreteci:** Ad koyulan her yerde (doğum penceresi, çocuklar)
  "Rastgele" düğmesi bir ad önerir: eski adlardan biri ya da iki yarıdan
  kurulan bir ad (Alptekin, Gülbike…; `dynasty.json` → `names`,
  `nameParts`; `randomName`).
- **Ad ve eğitim:** Doğumda bir haber penceresi açılır; çocuğa ad
  konur (koyulmazsa çekilen ad kalır; sonradan çocuğun kartındaki "Adını
  koy" ile konabilir). **Ad yalnızca bir kez konur:** lordun ad koyduğu
  çocuğun (`named`) adı değiştirilemez; hükümdarın ve kraliçenin adı da
  değiştirilemez, geldikleri adı taşırlar (sunucu `nameError` → `'named'`
  ile reddeder). Hükümdar yaşarken reşit olmamış her çocuğun (yeni doğan
  bebek dahil) eğitimi seçilir (Maliye, Halk, Askerlik; seçilen düğme
  yanar, seçilmemişse kartta yazar); çocuk 16 yaşında reşit olunca o
  yetenek +3 artar.
- **Ölüm ve tahta geçiş:** Hükümdarın ölüm yaşı doğumunda 58–80 arasında
  çekilir. Ayrıca tarafının kaybettiği her muharebede %5 ihtimalle
  kahrından ölür (sunucu, muharebenin ve lordluğun tohumuyla). Yerine en
  büyük oğlu geçer; oğlu yoksa ya da reşit değilse **naipler konseyi**
  yönetir (yetenekler 4/3/4), oğul reşit olunca tahta çıkar. Eski kraliçe
  kraliçe ana olur: yeni hükümdar kendi kraliçesini almalıdır.
- **Haberler:** doğum, reşit olma, ölüm, tahta çıkış, naipler konseyi ve
  kraliçenin gelişi, oyundaki olay pencereleri gibi çizimli birer pencereyle
  duyurulur. Haberler hanedanın o anki hâlinden çıkarılır ve tarayıcıda
  hatırlanır (sunucu olayı önce işlese de duyurulur); "Sen yokken"
  raporunda da bir Hanedan sayfası vardır.

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

- Sarayın her seviyesi bir **nüfus sınırı** verir: 24 / 48 / 72 / 96 / 120
  (seviye × 24; `society.json` → `popCapPerPalaceLevel`). Köylü + asker bu sınırı aşamaz; evler sınırın üstünde
  köylüye yer vermez. Yer bir anda dolmaz: halk mutluluğa, yemeğe, savaşa
  ve kuşatmaya göre her tur büyür ya da göç eder (§5.2).
- **2. seviye saray** şunları açar: kışla, casus evi, gözcü kulesi, sur,
  pazar ve kraliçe.

**Vergi ve mutluluk**

- Vergi oranı: düşük / normal / yüksek / ağır. Her üretim turunda köylü
  başına 0,008 / 0,02 / 0,036 / 0,056 altın getirir.
- **Altın dengesi** (hedef, `economy.json`, `society.json`): gelişmiş bir
  lord (4–5. seviye saray, ~100 köylü, 3. seviye ticaret noktası) çevrimiçi
  saatte ~2.000–2.500 altın (lobi fiyatı düştükçe daha az), yeni kurulmuş
  bir lord ~700 altın kazanır. Boş bir 7.000'lik hazine çevrimdışıyken
  ~4–5 saatte dolar; dolunca tüccar bekler, haraççılar 30 dakikada bir %5
  alır. Asker maaşı tur başına 0,04 altın, lordlar arası haraç tur başına
  en fazla 4 altındır.
- **Mal dengesi:** Tüccar bir malı tam yükle satıyorsa, o malın en yüksek
  üretimi (en çok yapı, 3. seviye, en iyi arazi) bile satışa yetmez; stok
  azalır. 3. seviye ticaret noktası seferde 140 birim, tur başına ~47
  birim satar; en iyi arazide en çok oduncu kampı tur başına ~44 yapı
  malzemesi, silah atölyeleri ~19 savaş malzemesi, tarlalar halkı
  doyurduktan sonra ~27 yemek üretir. Bu yüzden mal fiyatları düşüktür
  (yemek 0,2, yapı 0,3, savaş 0,4) ve tüccarın geliri ürettiğin kadardır.
  (Önce 0,13 / 0,2 / 0,27 idi; o fiyatlarla yeni ve orta lordun altını
  ölçekleme öncesine göre %35–55 düşmüş, 4. seviye saray 8,6 saatten 10,2
  saate uzamıştı. Saklanan lobi fiyatları `20261015180000_goods_reprice.sql`
  ile ×1,5 taşındı, `market.priceRev` = 2.)
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

- Oyun saatinde **gece** (23:00–03:00, haritanın karardığı saatler) halk
  dinlenir: binalar **%50** hızla üretir.
- Halk sekmesinden **gece mesaisi** açılabilir: gece de tam çalışılır ama
  mutluluk hedefi düşer ve her gece turunda **yorgunluk** birikir;
  yorgunluk gündüz dahil bütün üretimi azaltır (en fazla %60), mesai
  kapalıyken yavaşça geçer.

**Pazar ve lobi fiyatları**

- Her lobinin **ortak bir fiyat tablosu** vardır. Ticaret noktası mal
  sattıkça o malın fiyatı lobi genelinde düşer; pazardan alındıkça artar.
  Fiyatlar zamanla taban değerlerine geri döner. **Fiyat yükselmesi
  düşmesinden zordur:** satılan her birim fiyatı %0,0375 düşürür, alınan her
  birim yalnızca %0,02 yükseltir; tabanın altına düşmüş fiyat yarı yolunu
  40 dakikada toplar, tabanın üstüne çıkmış fiyat yarı yolunu 15 dakikada
  iner (`market.json`). Taban fiyatlar: yemek 0,2, yapı malzemesi 0,3,
  savaş malzemesi 0,4 (`economy.json` → `trade.price`); pazarın alış
  fiyatı lobi fiyatının 1,4 katıdır.
- Fiyat **olağan fiyatının %30'unun** altına inmez (`minFactor`); oraya inen
  malın kutusunda "en dipte" yazar ve satış onu daha fazla düşürmez.
  Arayüzde taban fiyat **"olağan"** fiyat olarak yazar (fiyat onun altına
  inebildiği için "taban" yanıltıcıdır).
- **Dünya nüfusu yemeği pahalandırır:** lobideki bütün lordların nüfusu
  (köylü + asker + denizci) 200'ü geçtikçe yemeğin olağan fiyatı artar,
  1600'de en fazla +%30 (%1'lik adımlarla; `market.json` → `foodDemand`).
  Sunucu her tick'te hesaplayıp lobinin pazarına `foodDemand` olarak yazar
  (o anki fiyat korunur, yalnızca döndüğü olağan fiyat değişir; alan yoksa
  1). Lobi fiyatları kutusunda "Dünya nüfusu yemeği pahalandırıyor: +%N"
  yazar.
- **Taç krallıkları alır:** İki taç krallığı her 20 dakikalık pencerede
  saatten belirlenen birer malı lobi piyasasından alır (iki taç aynı malı da
  isteyebilir). Tam talep dakikada 480 birimdir; mal ucuzken tamamını, olağan
  fiyatına yaklaştıkça daha azını alırlar, olağan fiyatın %20 üstünde hiç
  almazlar (`market.json` → `crowns`). Böylece kimse satmazsa fiyat yaklaşık
  bir saatte olağan fiyatına toparlanır, dibe kilitlenmez; çok satılan mal
  yine dipte kalabilir. Alımlar saklanmaz: fiyat, son satıştan bu yana her
  dakikanın alımı eklenerek saatten hesaplanır (`market.ts` → `priceAt`,
  `crownDemand`); sunucu ve istemci aynı fiyatı bulur. Lobi fiyatları
  kutusunun altında hangi tacın neyi dakikada kaç birim aldığı ve pencerenin
  kaç dakika süreceği yazar.
- **Pazar** binası (2. seviye saray) altınla hammadde satın almaya yarar;
  alış fiyatı lobi fiyatının biraz üstündedir. Her alınan birim bir
  sonrakinin fiyatını yükseltir; büyük bir alım, aynı malı parça parça almakla
  aynı tutar. "Al" tıklamaları bir **sepette** toplanır (tık başına en fazla
  400, sepette en fazla 1.600 birim); tıklama durunca ya da sepet dolunca tek
  komut olarak gider, bu sırada "Fiyat güncelleniyor, lütfen bekle" yazar.

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
    haraç ödeyenden isteyene altın akar. Akışı **sunucu** yürütür
    (`settleTributes`, tick'te): haraç anlaşmasının son ödendiği andan bu
    yana geçen turların haracı ödeyenin hazinesinden **ne kadar varsa** alınır
    ve alana **yalnızca ödenen kadar** (hazinesine sığdığı kadar) geçer; boş
    kasadan haraç yoktan altın basmaz (önce alan taraf her turda koşulsuz
    alıyordu). Anlaşma `pacts.paid_at`'te son ödemeyi tutar; iki tarafın gelir/gider
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
    tüccar satış yapamaz. Harap ticaret noktası haritada herkese yanmış
    görünür (is lekeleri, çatısında tüten bir delik, parçalanmış tente).
    Sahibi ticaret noktasına tıklayıp ya da Ticaret sekmesinden "Onar" ile
    onarır. Her durumda saldıran asker kaybeder (başarıda
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
- Casus panelinden bir casus **bir krallığa ve bir konuya** gönderilir (bir
  krallığın her konusunda en fazla bir casus):
  **Hammadde**, **Ordu** ya da **Diplomasi**; ya da evde **karşı
  casusluk** için tutulur.
- Her (hedef, konu) için **ağ gücü** (0–100) casus orada kaldıkça artar;
  hedefin karşı casusluğu (evdeki her casus 0,5, casus evinin her seviyesi
  0,75 puan) artışı yavaşlatır: her karşı casusluk puanı ağın kurulma
  süresine bir kat daha ekler.
- **Casus evi seviyesi** iki yönde işler: kendi casuslarının ağ kurma
  hızını artırır (1. seviye ×1, her seviye +0,25; `networkSpeedPerLevel`)
  ve karşı casusluğu büyütür (başkalarının sende ağı daha yavaş kurulur,
  casusları daha çabuk yakalanır, operasyonlarının şansı düşer). Casuslar
  bölümü bugünkü ve bir sonraki seviyenin değerlerini yazar.
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
  ortaya çıkarır. Casus raporu her operasyonun **başarı şansını** (en
  yakın %5'e yuvarlı) getirir; operasyon listesinde her satırda yazar.
  **Operasyon ağı harcar:** başarılı da olsa başarısız da olsa, yapıldığı
  ağdan istediği kadar puan düşer (%70 isteyen kaçırma 70 puan;
  `operations.networkCostShare` = 1). Ağ kalan güçten yeniden büyür (o
  konudaki görevler daha geç başlamış sayılır).
  - **%50 sabotaj:** depoları yak (yemek ve yapı malzemesinin dörtte
    biri) ya da süren inşaatları geciktir.
  - **%70 kraliçeyi kaçır:** kaçıranın bitmiş bir **hapishanesi** olmalıdır
    (2. seviye saray, bir tane). Kraliçe kaçıranın hapishanesinde rehin
    kalır; hapishane haritada **dolu** görünür (avlusunda parmaklıkların
    ardında taçlı kraliçe, kapıda muhafız) ve menüsünde içerideki kraliçeler,
    fidyeleri ve "Serbest bırak" yazar. Kaçırılan krallığın mutluluğu hemen
    düşer ve rehinlik sürdükçe düşük kalır. Geri almanın yolları: **fidye**
    ödemek, kaçıranın kendi isteğiyle **serbest bırakması** (+ilişki) ya da
    kazanılan savaş gerekçesiyle savaş. **Fidye** kaçırma anında sabitlenir:
    kaçıranın hammadde casuslarının o krallığın altını için tahmininin
    ortasının **%40'ı**, en az **500 altın** (casus bilgisi yoksa 500;
    `operations.kidnap.ransomShare`, `ransomMin`).
  - **%90 isyan kışkırt:** on dakika üretim yarıya iner ve mutluluk düşer.

**Ordu**

- **Kışla** (2. seviye saray) asker havuzundan, altın ve malzemeyle
  **birlik** yetiştirir (AoE gibi taş-kağıt-makas):
  - **Mızrakçı** (savaş malzemesi): süvariyi yener, okçuya yenilir.
  - **Okçu** (cephanelikten yay): mızrakçıyı yener, süvariye yenilir.
  - **Süvari** (2. seviye kışla; yemek + savaş malzemesi): okçuyu yener,
    mızrakçıya yenilir, daha sert vurur.
  - **Kalkanlı piyade** (üniversite: Kalkan duvarı; cephanelikten kalkan +
    kılıç): okçuyu yener, süvariye yenilir. Süvari hem okçuyu hem kalkanlıyı
    yener.
  - **Mancınık** (2. seviye kışla ve üniversite: Kuşatma sanatı): sahada zayıf; kuşatmada her biri birkaç
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
  alır: her depodan %15, ama toplamda hayatta kalan asker başına en fazla
  12 birim (askerlerin taşıyabildiği kadar). **Kuşatma halkı kaçırır:**
  kuşatma başlayınca köylülerin %3'ü kaçar, kuşatma sürdükçe halk göç eder
  (§5.2), saray düşerse %10'u daha kaçar (`society.json` →
  `growth.siege`). Kaçış için kuşatanların en az **10 asker** olması gerekir
  (bir avuç asker kimseyi korkutmaz) ve bir lordun halkı **15 dakikada en
  fazla bir kez** kaçar (`minAttackers`, `cooldownSeconds`, `Kingdom.fledAt`);
  böylece tek askerlik kuşatmalarla nüfus eritilemez; elçi haber getirir (`siege_people`). Düşen saray **15 dakika kuşatma kalkanı** kazanır: bu sürede kapıya
  varan ordu savaşmadan bekler, kalkan bitince kuşatma kendiliğinden
  başlar. Kalan süre Krallıklar sekmesinde, ordu kartında ve sayaçlarda
  görünür.
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
- Ordu yolu iki adımda aranır: önce 4×4 karoluk hücrelerin **yürünebilir
  parçaları** üzerinde (bir hücrenin içinde birbirine yürünerek ulaşılan
  karolar bir parçadır; ortasından sur geçen hücre surun iki yanında iki
  ayrı parçadır, böylece arama suru delemez ve kapıyı bulur; dar köprüler de
  bulunur), sonra seçilen hücre koridorunda karo karo; yol, arazinin izin
  verdiği yerde düzleştirilir. Böylece ordular nehirleri köprülerden ve en
  kısa yoldan geçer. Binaların (tarla hariç) ve ayakta duran **surların**
  içinden geçmez; **sur kapısından** yalnızca sahibinin orduları geçer
  (yıkık sur geçilir). Bir binanın üstüne gönderilen ordu yanındaki boş
  karoda, bir saraya gönderilen ordu sarayın kapısının (ön köşesi) önünde
  durur; yeni çıkarılan ve eve dönen ordular da oradadır. Surla çevrili bir
  sarayı kuşatan ordu surların önünde durur ve kuşatma orada başlar.
- **Detay animasyonları** (Ayarlar → Görüntü, varsayılan açık): 1× ve üstü
  yakınlaştırmada ağaçlar zemine işlenmek yerine ayrı çizilir ve rüzgârda
  hafifçe sallanır; yürüyenler, hayvanlar ve binalarla aynı derinlik
  sırasındadır (ormandaki geyik önündeki ağacın arkasında kalır). Kapatılınca harita onlarsız yeniden çizilir.
  Bir ordunun bulunduğu parçalarda (ve hemen çevresinde) ağaçlar **her
  yakınlaştırmada** ve bu ayardan bağımsız olarak ayrı çizilir; ordu
  ormanda önündeki ağaçların arkasında kalır. Komşu parçalar sınırdan taşan
  ağaçları buna göre ya boyar ya da bırakır (`createWorld.ts` → `liftFor`,
  `nearOf`).
- Gece yanan pencerelerin çevresinde yumuşak bir **parıltı** vardır (aynı
  ışıklar bulanıklaştırılıp gecenin üstüne eklenir).
- Ordular (ve devriyeler) köprüden geçerken güvertenin üstünde yürür,
  suyun hizasında değil (`chunkPainter.ts` → `surfaceHeight`). Bölükteki
  her asker gölgesini kendi ayağından düşürür (arka saflar havada
  görünmez; `armies.ts` → `squad`, piksel başına `lift`).
- Ordular binalar, surlar ve yürüyenlerle aynı derinlik sıralamasında
  çizilir: önlerindeki bina ya da sur onları örter, bir kapının içinden
  geçerken kemerin altında gizlenirler; uzak yakınlaştırmada da görünürler.
  Ordular kendi kapılarından geçer ama kapı karesinde durmaz; varış noktası
  kapıdaysa yanındaki en yakın boş kareye kayar.
- Ordular 1× ve üstü yakınlaştırmada yürürken adım atar (4 kareli yürüyüş,
  komşu askerler farklı adımda); uzaktayken durağan çizilir.
- **Ordu sekmesi** alt sekmeleri: Ordular (Ordularım, çoğu emir burada
  verilir, ve Garnizon), Kışla, Savaşlar, Donanma. Ordu kartları tam genişlikte, grid düzenindedir: birlik
  türleri tek satırda, moral ve saha bilgisi yan yana, emir düğmeleri üçlü
  sütunlarda.
- Haritada ordular krallığın sancağıyla görünür; görünen asker sayısı
  ordunun büyüklüğüyle artar (yaklaşık her 2 askere bir figür, 2–20,
  sık dörtlü saflarda) ve
  mancınığı olan ordunun **arkasından** ayrı bir mancınık gelir: ordunun
  gittiği yöne bakar, yuvarlanırken (yakınlaştırınca) tekerlekleri döner. Rakipler yalnızca bu kaba
  büyüklüğü görür, kesin sayıyı casuslar söyler; oyuncunun yoldaki
  ordularının rotası kesikli çizgiyle çizilir, muharebeler çapraz kılıçla
  işaretlenir. Başkasının ordusunun gücü yalnızca casusla tahmin edilir.
- Muharebe başlayınca ve bitince **elçi** ekranda bir pencereyle haber
  verir (kim, nerede, sonuç, kayıplar).
- **Savaş izleme:** Savaş penceresinin üstünde küçük bir canlandırma
  oynar: iki taraf kendi renklerinde, askerleri kadar figürle ortada
  çarpışır; kuşatmada savunanların tarafında sur ve kapı, okçu varsa ok
  yağmuru, mancınık varsa sura uçan taşlar görünür; her turun kayıpları
  yere düşer, savaş bitince kazananlar mızraklarını kaldırır, yenilenler
  geri çekilir. Savaş sürerken gerilimli bir savaş müziği (davul, bas,
  boru) çalar ve meyhane müziği kısılır; ses müzik ayarına bağlıdır.

### 9.8 Prototip: kurumlar ve günün olayları (şu an uygulanan)

Değerler `config/balance/institutions.json`, mantık
`packages/shared/src/institutions.ts`. Üç bina da 3. seviye saray ister,
krallıkta birer tane olur ve 3 seviyelidir.

- **Üniversite (araştırma ağacı):** Dört dal (sekme): **Hammadde**,
  **Savaş**, **Devlet**, **Din ve halk**. Her dalda üç kademe, her kademede
  iki yol vardır; **birini seçen ötekine bir daha gidemez**. Bir kademe,
  aynı daldaki alt kademe öğrenilince ve üniversite o seviyeye gelince
  açılır. Aynı anda bir araştırma yürür; araştırmalar pahalıdır (kademe
  1/2/3: ~600/1500/3200 altın ve malzeme, 2/4/7 dakika).
  - Hammadde: Sulama | Keten tarımı → Ormancılık | Balıkçılık → Metalurji |
    Ambarcılık (depo +%50).
  - Savaş: Kalkan duvarı (kalkanlı piyade) | Kuşatma sanatı (mancınık) →
    Savaş taktikleri (zar +0,5) | İstihkâm (kuşatmada +6 sur) → Talim (iki
    kat hızlı eğitim) | İaşe (asker bakımı −%35).
  - Devlet: Mimarlık (inşaat kuyruğu 3) | Muhasebe (vergi +%20) → Ticaret
    hukuku (tüccar +%30) | Diplomasi okulu (elçi etkisi +%50) → Casusluk
    okulu (karşı casusluk +2) | Kanunname (mutluluk +6, elçi +%25).
  - Din ve halk: Tıp | Şenlikler (mutluluk +8) → İlahiyat (tapınak imanı
    +%60) | Hayır işleri (vaaz 2 kat uzun) → Kutsal yemin (zar +0,6) | Hac
    yolu (tüccar +%15, mutluluk +5).
- Saray 3. ve 4. seviye yükseltmeleri pahalıdır (3: 1200 altın, 800 malzeme,
  200 savaş malzemesi, 150 sn; 4: 2200 / 1500 / 500; 5: 5000 / 3000 / 1000).
  Kuruluştan 4. seviyeye makul oynayan aktif bir lord ~8 saatte, 30
  dakikada bir giren ~16 saatte varır (bot simülasyonu, 10 harita).
- **Hastalık ve hastane:** Köylülerin bir payı hastadır; hasta köylü
  çalışmaz, vergi vermez ve mutluluğu düşürür. Her tur birkaç kişi
  hastalanır (hasta çoksa, açlıkta ve soğukta daha hızlı yayılır) ve
  hastalar kendiliğinden yavaşça iyileşir. **Hastane** doktorlarıyla (işçi)
  her tur hastaların bir payını daha iyileştirir.
- **Tapınak:** Mutluluk hedefini yükseltir; askerler **iman gücüyle** zara
  bonus ekler (seviyeyle artar). **Vaaz:** altınla, bekleme süresiyle;
  bir süre verginin mutluluğa olumsuz etkisi azalır ("vergiler iyidir").
- **Günün olayları:** İki ayrı kanal vardır, her biri 15 dakikalık
  pencerelerde en fazla bir olay, 8–14 dakika sürer:
  - **Lobi geneli** (%55): hava ve dünya olayları lobideki herkese aynı
    anda gelir (lobi tohumundan): kavurucu güneş (yalnız gündüz), yağmur,
    soğuk dalgası (yalnız gece), fırtına, yoğun sis, sel, bereket mevsimi,
    kervan mevsimi, kuyruklu yıldız, dolunay şenliği (yalnız gece), salgın,
    altına hücum, çekirge istilası, dolu fırtınası, deprem, kutup ışıkları
    (yalnız gece), güneş tutulması (yalnız gündüz), gökkuşağı (yalnız
    gündüz), ejderha söylentisi, taç düğünü.
  - **Krallığa özel** (%40): salgın, halk şenliği, orman yangını, maden
    damarı, gezgin tüccarlar, ambar yangını, define, hacılar, göçebe
    çadırları, gezgin ozan, kurt sürüsü, maden göçüğü, haydut baskını,
    kayıp kervan, aziz kalıntısı, şövalye turnuvası.
  Gündüz/gece olayları o vakit başlar ve en geç o vakit bitince biter.
  Olay başlayınca açılan pencere, günlük ve Halk sekmesindeki şerit olayın
  **lobi geneli mi krallığa özel mi** olduğunu yazar. Olaylar saklanmaz;
  zamandan ve tohumdan hesaplanır (lobi tohumu sunucunun krallığa yazdığı
  `lobbyKey`), anlık etkileri (kayıp, define, salgın) başladığı üretim
  turunda bir kez uygulanır.
- **Krizler (seçimli olaylar):** Orman yangını, ambar yangını, salgın
  (yerel ve lobi geneli), sel, fırtına, soğuk dalgası, çekirge istilası,
  dolu fırtınası, deprem, kurt sürüsü, maden göçüğü ve haydut baskını
  gelince pencere üç
  seçenek sunar (`institutions.json` → `events.crisis`):
  **köylüleri seferber et** (zarar önlenir; 5 dakika iş gücü %30 düşer),
  **orduyu seferber et** (zarar önlenir; garnizondan 1, %25 ihtimalle 2
  asker ölür ve ordu 5 dakika sefere çıkamaz; en az 2 asker gerekir) ya da
  **bir şey yapma** (olayın kötü etkisi tam yaşanır). Karar için 2 dakika
  vardır; cevap verilmezse bir şey yapılmamış sayılır. Krizlerin anlık
  zararı (yanan yemek, hastalanan halk) bu yüzden olay başlayınca değil,
  karar süresi dolunca gelir; önlenmişse gelmez, süren etkileri de
  (üretim düşüşü vb.) uygulanmaz. Cevap krallık durumunda saklanır
  (`responses`, 24 saat), sunucu `crisis` komutuyla doğrular.
- **İki yollu olaylar (seçim):** Güneş tutulması, ejderha söylentisi, taç
  düğünü, göçebe çadırları, gezgin ozan, kayıp kervan, aziz kalıntısı ve
  şövalye turnuvası gelince pencere iki yol sunar (`institutions.json` →
  `events.choice`). Her yolun hemen ödenen bir bedeli (`cost`) ve hemen
  gelen bir kazancı (`gain`; altın en fazla 150) olabilir, ayrıca olay
  sürdükçe etkileri (mutluluk, tapınak mutluluğu, ticaret, iş gücü, üretim)
  olayın kendi etkisine eklenir. Örn. ozanı saraya davet et (−40 altın,
  mutluluk +8) ya da meydanda şapka dolaştır (+25 altın, mutluluk −2);
  kayıp kervanın yükünü al (+40 yapı, +30 yemek, mutluluk −3) ya da
  sahiplerine haber sal (+50 altın ödül, mutluluk +5, ticaret +%10).
  Bedeli karşılanamayan yol seçilemez. Karar için 2 dakika vardır;
  cevap verilmezse olay yalnızca kendi etkisiyle sürer. Cevap `responses`
  içinde `'a'`/`'b'` olarak saklanır; sunucu `choose` komutuyla
  (`dilemmaError`, `answerDilemma`) doğrular ve uygular.
- **Olay penceresi:** Üstte pencerenin tam genişliğinde bir başlık şeridi
  (hayırlı haberde yeşil, kötü haberde kırmızı), altında pencerenin üst
  yarısını kenardan kenara dolduran olay çizimi, en altta haber, seçenekler
  ve düğmeler (`apps/web/src/ui/FortuneDialog.tsx`).
- **Olay çizimleri:** Her olayın penceresinde oyundan daha ayrıntılı,
  kodla çizilmiş, hareketli bir piksel sahnesi vardır
  (`apps/web/src/ui/EventArt.tsx`): çekirge sürüsü tarlaların üstünde
  dalgalanır, dolu yağar ve seker, depremde resim sarsılır, kutup ışıkları
  göle yansır, tutulmada taç ışınları döner, düğünde çanlar sallanır ve
  yapraklar uçuşur, turnuvada şövalyeler birbirine koşup mızrak kırar…
- **Günlük sekmeleri:** "Tümü" ve "Önemli". Önemli'de krallığı etkileyen
  olumsuz olaylar toplanır: kötü olaylar, yağma ve yağma girişimi, savaş
  ilanı, dayatılan barış, hakaret, sabotaj ve kaçırma, yakalanan casuslar,
  kule kayıpları, asker kaybedilen muharebeler, reddedilen teklifler, haraç
  isteği, yerine getirilemeyen emirler, ambar boşalıyor uyarıları (en çok 10
  dakikada bir), korsan baskınları, deniz muharebeleri. Önemli
  kayıtlar diğerlerinden daha uzun saklanır ve kırmızı kenarlıdır. Sekmedeki
  rozet okunmamış önemli kayıt sayısıdır; sekme açılınca sıfırlanır.
- **Hesap defteri:** Krallık sezon boyunca bir defter tutar (`books`,
  `economy.ts`): vergi, asker maaşı, tüccar geliri, hazine dolu diye
  bekleyen tüccar seferleri, deniz ticareti, korsan ödülleri ve gemi bakımı,
  lordlar arası haraç, taç haraççılarına ödenen
  ve devriyenin bıraktığı, kasaba/olay/balıkçı geliri, dolu hazinede ve
  ambarda boşa giden, ve **kaybedilen askerler nedeniyle** (meydan
  muharebesi, saray kuşatması, kasaba kuşatması, gözcü kuleleri, yağma,
  afette seferberlik, terhis). Her komutta sunucu son görülme anıyla
  birlikte o anın özetini (`seen`: depo, defter, asker, köylü, mutluluk)
  saklar.
- **Sen yokken:** Oyuncu en az 20 dakika sonra döndüğünde (sunucunun
  kaydettiği son görülme anından) önce sayfa sayfa bir rapor açılır; her
  sayfada oyunun kendi sprite'larından kurulmuş küçük bir piksel çizim
  (arkasında sayfaya göre değişen dağ sıraları, bulutlar, tepeler, uzak
  kale ya da köy, kuşlar; savaşta duman, entrikada gece; bulutlar ve kuşlar
  hafifçe hareket eder)
  vardır (`apps/web/src/ui/AwayReport.tsx`):
  **Mali rapor** (yokluk süresi, hazine ve depoların öncesi/sonrası;
  defterden gerçek vergi, tüccar geliri, maaş, boşa giden altın, hazine
  dolu diye bekleyen seferler ve geri kalan harcama; nüfus, mutluluk,
  yokluk cezası), **Askeri rapor** (muharebeler, kuşatmalar, kasabalar,
  kuleler, sınırdaki ordular, asker sayısı ve kayıpların nedeni),
  **Haraçlar** (haraççıların aldığı, devriyenin bıraktığı, lordlar arası
  ödenen/alınan haraç), **Elçiler ve
  casuslar** ve **Dünyada olanlar** (kim kime savaş açtı, hangi savaş
  bitti, kim kiminle çarpıştı ve kim kazandı, kim hangi kasabayı fethetti).
  Öncesi/sonrası sunucudaki `seen` özetinden okunur (her cihazda aynı). Rapor açıkken elçi pencereleri beklemez; kapatınca rapordaki
  haberler okunmuş sayılır (günlükte yine durur).
- **Sohbet bildirimleri:** Sohbet kapalıyken gelen yeni mesaj, sayaçların
  yerinde (sohbet düğmesinin üstünde) birkaç saniye görünen bir önizlemeyle
  ve kısa bir sesle bildirilir; tıklanınca sohbet açılır. Sohbet başlığındaki
  zil düğmesi bildirimleri sessize alır (tarayıcıda hatırlanır); sessizdeyken
  yalnızca oyuncuyu **@etiketleyen** mesajlar bildirilir. Mesaja @ yazınca
  lobideki oyuncuların adları önerilir; etiketler mesajda vurgulanır. Okunmamış
  etiket varsa sohbet düğmesindeki rozet sayı yerine "@1" gibi yazar. Okunan
  son mesaj tarayıcıda lobi başına hatırlanır; sayfa yenilenince eski
  mesajlar yeniden bildirilmez.
- **Sohbet** penceresi daha uzundur; Krallıklar sekmesinde her satırın
  sonundaki pin kamerayı o krallığa götürür; her oyuncunun
  son görülmesinden çevrimiçi olup olmadığı (yeşil nokta, son 6 dakika) ya
  da ne zaman görüldüğü yazar.
- **Günlük:** Olaylar ayrı (mor) kâğıtta, elçinin diğer krallıklardan
  getirdiği haberler (savaş, teklif, casus…) ayrı (mühürlü) kâğıtta yazılır.

---

## 10. Puanlama ve Sezon Sonu

**Şu an uygulanan (lobi sıralaması):** Her krallığın bir puanı vardır
(`packages/shared/src/score.ts`, ağırlıklar `society.json` → `score`):
- **Hazine:** altın / 10 + depodaki mallar / 25.
- **Gelişim:** saray seviyesi × 120, kurum binaları (üniversite, hastane,
  tapınak, kışla, casus evi, pazar, ambar) seviye × 30, diğer binalar
  seviye × 10, sur ve kapı 1.
- **Nüfus:** köylü + asker × 3. **Ordu:** asker × 2 + cephanelik / 10 +
  gemi gücü × 2.
- **Zafer:** kazanılan muharebe × 40, alınan saray (kuşatma) × 120,
  kraliçe 40, rehine × 60, elde tutulan kasaba × 40 × sadakat çarpanı (§8.4).
- **Bilgi:** öğrenilen araştırma × kademe × 50.
Puanı sunucu, krallığı her yazışında hesaplar ve satırına yazar; böylece
herkes aynı tabloyu görür. Başkalarının yalnızca zaten görünen kalemleri
(gelişim, zafer) ve 50'ye yuvarlanmış toplamı gönderilir; hazine, nüfus,
ordu ve bilgi kalemleri kişinin kendisine özeldir (depo ve asker sayısı
yalnızca casuslarla tahmin edilir). Sohbetteki
**Sıralama** sekmesi krallıkları puana göre dizer ve dökümünü gösterir.

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
  Sunucu oturumu artık kabul etmezse (veritabanı ya da fonksiyonlar 401
  dönerse) oyuncunun oturumu kapatılır ve giriş ekranına döner
  (`apps/web/src/lib/supabase.ts`).
- **Ana menü:** Giriş sonrası Lobiler / Nasıl oynanır / Ayarlar. Oyun
  içinden Saray sekmesindeki "Ana menü" ile dönülür. Lobi silinirse
  içindeki oyuncular kendiliğinden ana menüye döner (yayın + dakikalık
  yoklama).
- Telefonda yakınlaştırma (+/−) ve üsse dön düğmeleri sağ altta, küçük
  harita sol alttadır; sohbet düğmesi küçük haritanın, sayaçlar sohbet
  düğmesinin üstünde durur. Üst çubuk ekranın tam genişliğindedir, her
  kartta ikon üstte, sayı altta. Ayarlar ve ana menü tek bir **hamburger**
  düğmesindedir; bu düğme çubuğun son kartıdır ve menü çubuğun altına doğru
  açılır. Dokunmatik
  ekranda bir karta dokunmak bilgi kartını açar; kartın altındaki "Depoya
  git" / "Halka git" ilgili sekmeyi açar, başka yere dokunmak kartı kapatır.
- Dünya haritası (telefonda küçük haritaya dokununca) yakınlaştırılınca her
  yöne, yukarı-aşağı da kaydırılabilir; yakınlaştırma bakılan yeri ortaya
  getirir.
- Küçük haritada her krallığın **hududu kendi renginde** yarı saydam bir
  alan ve çerçeveyle (oyuncununki altın çerçeveli) boyanır. Simgeler (kale,
  kasaba, devriye) büyüktür; krallık sancakları onlardan biraz küçüktür.
- Küçük haritada krallıklar renkli sancakla, **taç başkentleri**
  tacın renginde (kızıl / lacivert) küçük bir **kale** simgesiyle (iki
  kuleli, kapılı; üstünde sancak yok),
  **kasabalar** sahibinin renginde çatılı küçük bir **ev** simgesiyle
  (sahipsizse saman rengi) ve gezen **taç devriyeleri** tacın renginde
  sancaklı birer noktayla (2 saniyede bir yerleri güncellenir) gösterilir;
  sancaklar en üstte çizilir. Dünya haritasında da kasabalar ve devriyeler
  görünür. Küçük harita 512 piksel çözünürlükle (2 karoya 1 piksel) çizilir
  ve masaüstünde 320, orta ekranda 200, telefonda 132 piksel karedir.
- Harita ekranının sağ üstünde, ayarların altında **ana menüye dön**
  düğmesi (ev ikonu) vardır. Yakınlaştırma düğmelerinin üstündeki **üsse
  dön** düğmesi (konum pini) kamerayı krallığa götürür.
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

- **Güncelleme:** Her derleme bir sürüm kimliği taşır ve yanına
  `version.json` yazar. Açık sayfa 90 saniyede bir ve sekme geri gelince
  bu dosyayı okur; yeni bir sürüm yayındaysa "Oyun güncellendi, sayfa
  yenileniyor…" yazıp kendini yeniler (`apps/web/src/lib/version.ts`).
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
| `lobbies` | tohum, `world_rev` (dünya üretim sürümü), `river_keep` (genişleyen nehrin kuru bıraktığı alanlar), `season_start`, ayarlar |
| `kingdoms` | `state jsonb`, `version`, `updated_at`, ad, renk |
| `armies` | sahibi, birlikler, `path`, `depart_at`, `arrive_at` |
| `orders` | elçi emirleri: `issued_at`, `effective_at`, içerik |
| `events` | `resolve_at`, tür, katılanlar |
| `battles` | sonuç raporu, tohum, kayıplar |
| `kingdom_daily` | günlük istatistik |
| `chat_messages` | lobi, gönderen krallık, ad, renk, metin, zaman |
| `minigame_scores` | mini oyun puanları: lobi, lord, oyuncu, oyun, puan, zaman, ad/renk/lobi adı (yalnız sunucu yazar) |

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
