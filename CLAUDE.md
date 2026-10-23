# CLAUDE.md — Crownherald (İzometrik Çok Oyunculu Strateji Oyunu)

Bu dosya, projenin **oyun tasarım belgesi (GDD)** ve Claude için çalışma rehberidir.
Projede kod yazılırken burada tanımlanan oyun mantığı esas alınır. Bir mekanik
değişirse önce bu dosya güncellenir, sonra kod.

> Durum: **Prototip başlangıcı.** Teknik yığın seçildi (bkz. §16); kalan
> kararlar için bkz. [§14 Açık Sorular](#14-açık-sorular--sonra-konuşulacaklar).

---

## 1. Oyunun Özeti

Oyunun adı **Crownherald**'dır ("taç habercisi"): oyuncunun tek muhatabı,
her haberi mühürlü parşömenle getiren **elçidir** (§9.8). Ad ana menüde ve
sekmenin başlığında yazar.

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

- **1 oyun günü = 1 takvim yılı = 1 gerçek saat.** Bir gece-gündüz döngüsü
  takvimde bir yıldır; hanedan da bu yıllarla yaşlanır (§9.1).
- **Lobi ömrü = 2 hafta = 336 oyun günü** (336 yıl), sonra **wipe** (bkz. §3).
- Oyun **gerçek zamanlıdır ve oyuncu çevrimdışıyken de devam eder** (CoC tarzı).
  İnşaatlar tamamlanır, gelir/gider işler, kervanlar yol alır.
- **Ekonomik tick:** Her oyun günü başında (gerçek saatin başı) bir
  "gün sonu hesabı" çalışır: vergi, ticaret geliri, üretim, bakım giderleri,
  nüfus değişimi, moral güncellemesi.
- Daha ince işlemler (birim hareketi, inşaat ilerlemesi, savaş) gün tick'inden
  bağımsız olarak gerçek zamanlı ilerler.
- **Takvim** (`clock.ts` → `calendarAt`, `time.json` → `calendar`): yıl her
  gerçek saatin başında (oyun saatinde gece yarısı) **1 Ocak**'ta başlar;
  lobinin sezon başlangıcında yıl **1182**'dir, her saat bir artar. Günler
  saatin içinde eşit hızla akar (oyun saatinin gece/şafak temposuna değil):
  ay gerçekte ~5 dakika, ayların gün sayıları gerçektir (365 gün). Tarih
  "14 Mayıs 1182" diye yazar (Ocak, Şubat, Mart, Nisan, Mayıs, Haziran,
  Temmuz, Ağustos, Eylül, Ekim, Kasım, Aralık); üst çubuktaki saatin altında
  kısası ("14 May 1182") durur. Saat kartında tarih, mevsim (tek satırda, simgesiz:
  "Kış · 14 dk kaldı"), mevsimin hasada ve hastalığa etkisi, sezon
  (x / 336 yıl) ve yeni yıla kalan süre yazar. Günlük yıl yıl bölünür
  ("1184 yılı"), her kaydın yanında günü ve ayı yazar.
- **Mevsimler** takvim ayından çıkar: Mart–Mayıs **İlkbahar**, Haziran–Ağustos
  **Yaz**, Eylül–Kasım **Sonbahar**, Aralık–Şubat **Kış**; her biri gerçekte
  ~15 dakika. Yıl gece yarısı başladığı için mevsimler günün saatine
  denk gelir: kış ~21:50'den ~04:30'a (bütün gece kışın içindedir), ilkbahar
  şafaktan ~10:00'a, yaz ~16:30'a, sonbahar ~21:50'ye. Etkileri
  (`time.json` → `seasons`, `clock.ts` → `seasonEffect`, `economy.ts` →
  `seasonFactor`): **tarla ve iskelelerin yemeği** (balık avındaki filolar
  hariç) ve **hastalığın yayılma hızı**. Yapılandırmadaki değerler
  görelidir (yemek 1 / 1,15 / 1,1 / 0,75; hastalık 1 / 0,8 / 1 / 1,25) ve
  ölçeklenir ki bütün yıl önceki gibi çıksın: yemek mevsimlerdeki iş payıyla
  (gece işin yarısı yapılır ve gece kıştadır), hastalık süreyle tartılır.
  Ortaya çıkan çarpanlar: yemek ilkbahar ×0,98, yaz ×1,13, sonbahar ×1,08,
  kış ×0,74; hastalık ×0,99 / ×0,79 / ×0,99 / ×1,24. Gece mesaisi yapan
  lord yılda %1,4 az yemek alır (gece de tam çalıştığı için kışın düşük
  hasadı ona daha çok dokunur). Çarpan, yemek kartında ve Depo → Mallar'da "Mevsim: Kış ×0,74"
  diye yazar. Mevsimler haritayı ayrıca renklendirmez (gün ışığı zaten
  saate göre değişir ve mevsimler saate denk gelir). Sunucu krallığa
  lobinin sezon başlangıcını yazar (`Kingdom.seasonStart`, `command` →
  `seasonStartOf`); yazılmamış durumda mevsim etkisi yoktur.
- **Saat ve gece-gündüz:** Oyun saati duvar saatinden hesaplanır (gerçek
  saatin başı = gece yarısı), yani herkes aynı anda aynı saati görür.
  Saatler aynı hızda akmaz: **gece hızlı geçer** (23:00–03:00 gerçekte ~6,5
  dk), kazanılan süre **şafağa ve gün batımına** eklenir (şafak 03:00–07:00
  ~12,5 dk, akşam 18:30–23:00 ~14 dk; `society.json` → `night`);
  gün yine tam 1 gerçek saattir (`config/balance/time.json` → `pace`). Arayüzde saat, tarih, mevsim
  ve sezon ilerlemesi gösterilir. Harita saate göre renklenir: şafak,
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
  - **Bütün sular birbirine bağlıdır** (dünya sürümü 8; `worldgen.ts` →
    `linkLakes`): dereler bir nehre kavuşana kadar akar, harita kenarından
    çıkmaz; hiçbir nehrin ulaşmadığı, iskele kurulabilecek büyüklükteki
    (`territory.shoreMinWater`, 20 karo) her göle ortasından en yakın bağlı
    suya inen bir dere açılır (en büyük gölden başlayarak). Böylece her
    iskeleden her korsan limanına ve her suya, uzun yoldan da olsa, gemiyle
    gidilir. Önce haritada 5–18 kopuk su kütlesi vardı (paralel akıp harita
    kenarından çıkan dereler, nehre değmeyen göller). Denetim:
    `bun scripts/water-link-check.ts [tohumlar…]`.
  - **Açık lobiler** (sürüm 6 → 7; `scripts/link-waters.ts`): dünya olduğu
    gibi kalır, kopuk her suya en son, her şeyin etrafından dolanan bir
    **kanal** açılır (`carveLinks`, 3 karo genişliğinde, kıyısı 8 karoda suya
    iner). Betik kanalları bir kez planlar (karo karo en ucuz yol: binalardan,
    iskele arsalarından, kasabalardan 11 karo, sığmazsa 4 karo; hanlar ve taç
    başkentleri dışında; önce yollardan 3 karo uzak, olmazsa yolu keserek, kesen
    yol köprü olur; lordların son hududu çok pahalı; dağ pahalı) ve
    `lobbies.water_links`'e yazar (yalnız lobinin oyuncuları okur:
    `lobby_water_links`); istemci dünyayı tohum, sürüm, `river_keep` ve bu
    kanallarla üretir, sunucunun `lobby_worlds` karoları yenilenir. Yol
    geçmeyen her kanala bir taş köprü kurulur (ortadan dışa, sığan ilk yere;
    yoksa iki kıyıda sağlam zemin bulan herhangi bir yere). Betik uygulamadan
    önce denetler: saklanan karolar sürüm 6'yla aynı mı, korunan hiçbir karo
    suya düşüyor mu, hiçbir yer ya da kara karosu ana karadan kopuyor mu, su
    tek parça mı; ayrıca hangi korsan limanı, teknesi, mağarası ve çetesinin
    yerinde kaldığını yazar (limanlar su büyüklüklerinden seçildiği için
    taşınır; çeteler yollardan uzak kanallarla yerinde kalır).
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
  komşu ile ölçeklenir, pikseller bozulmaz. Dokunmatik ekranda **iki parmakla**
  sıkıştırarak yakınlaştırılır: parmakların açıklığına en yakın kademeye
  geçilir (tekerlek gibi), harita da parmakların ortasıyla kayar. İki
  parmaklı bir dokunuş hiçbir zaman tıklama sayılmaz (bir şey seçmez,
  pencere açmaz); bir parmak kalkınca öbürü haritayı sıçramadan sürüklemeye
  devam eder (`createWorld.ts` → `pinch`). Ağaçlar, kayalar, hanlar ve binalar en uzak
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
  Dağ eteklerinde tohumdan 18 **mağara ağzı** açılır (dağın kayasından alçak
  bir çıkıntının dibinde karanlık bir oyuk, önünde çakıl; hepsi birbirine benzer, yağmacı klanlarının
  yaşadığı mağaralar dışarıdan ayırt edilmez; §7.9.1).
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
  binen gölgeler iki kat koyulaşmaz; gölgelerin yönü oyunun yarım saatinde
  bir değişir (önce 10 dakikaydı; her adım bütün gölgeleri yeniden döktüğü
  için pil yiyordu). Zemine boyanmış ağaçların, kayaların ve hanların gölgesi
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
  **Eğimde sur kesintisizdir** (`buildingSprites.ts` → `structureParts`,
  `Part.shear`): sur, kapı ve kazık çit parçaları (lordların surları, taç
  başkentlerinin iç ve dış surları, kasabaların ve ordu karargâhının çitleri;
  çitler `Structure.fence` ile işaretlenir) kaideye çıkmaz. Her parça karosunun
  ortasının yüksekliğinde durur ve duvarın koştuğu yöndeki eğim kadar **dikey
  kaydırılır** (sütunlar dik kalır, genişlik korunur; köşe ve T parçalarında iki
  yönün ortalaması). Komşu iki parça ortak kenarlarının ortasında aynı
  yükseklikte buluşur, duvarın dibi ve yürüyüş yolu basamaksız akar. Kaydırma
  haritada (`createWorld.ts`, sprite'ın `skew.y`'si, `scale.x` = 1/cos) ve
  zemine boyanırken (`chunkPainter.ts`, sütun sütun) aynıdır. (Önce her parça
  kendi en yüksek köşesine kaide üstünde oturuyor, sur basamak basamak
  kopuyordu; çitler en alçak köşeye oturup yamaca gömülüyordu.)
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
  köprünün arkasındaki ya da altındaki gemiler (taç kadırgaları ve
  lordların bütün gemileri; gölgeleri ve seçili filonun dış hattı da)
  güvertenin ters maskesiyle kesilir, köprünün altından geçiyormuş gibi
  görünür; taş köprünün kemer boşlukları maskede açıktır, gemi kemerin
  altından görünür. Maske gemi başınadır (`worldDecks` → `cut`): gövdesi
  güvertenin önüne çıkmış bir geminin yalnız kıç tarafı (ekranda gövdenin
  güvertenin ön kenarını kestiği noktanın o yanı) kesilir, önde kalan
  pruvası, direği ve yelkeni güvertenin üstünde görünür. Hiçbir gemi
  köprünün üstünde ya da altında demirlemez, beklemez (`near`).
  Köprüden geçen ordular (yol köprü karolarında zigzag çizse ya da sunucunun
  yolu çizilen köprünün birkaç karo yanından geçse de) güvertenin ortasından
  düz yürür ve **sıçramaz** (`apps/web/src/game/marchView.ts`): yolun sudan
  geçen kesimi, sudan bir karo önceki noktadan bir karo sonrakine kadar
  (köprü yoldan uzaksa daha geniş, ordu en çok %35 hızlanacak kadar), en
  yakın güvertenin ucuna, oradan güverte boyunca öbür ucuna ve yola geri
  çizilir; ordu rampaya güvertenin hizasında, uçtan 0,8 karo öteden çıkar.
  Kesim aynı sürede yürünür, başında ve sonunda ordu sunucunun hesapladığı
  yerdedir (yalnızca çizim; sunucunun konumu değişmez). Köprünün yanından,
  ucuna çok yakın geçen yürüyen güverteye sıçramaz: güvertenin yüksekliği
  kenarlarına doğru zemine iner (`surfaceHeight`).
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
  - **Yağmur** (yalnızca görsel ve ses; `packages/shared/src/weather.ts` →
    `weatherAt`, `lightningAt`; çizim `apps/web/src/game/weather.ts`;
    değerler `config/balance/weather.json`): lobi geneli yağmur, fırtına,
    sel, dolu fırtınası ve soğuk dalgası (§9.8) sürerken yağmur yağar
    (fırtına en sert, şimşekli; dolu ve soğuk dalgası soluk, yavaş düşen
    sulu kar). Bunların dışında da lobi tohumundan ara sıra geçici
    sağanaklar olur: 10 dakikalık her pencerede, pencerenin ortasındaki
    mevsime göre bir olasılıkla 2,5–7 dk (`showers.seasons`: ilkbahar %30,
    yaz %3, sonbahar %85 ve 3,3–8 dk, kış %85 ve 4–8,3 dk; mevsim kendi
    süresini `minSeconds`/`maxSeconds` ile verebilir). Sağanakların bir kısmı **şimşekli
    fırtınadır** (ilkbahar %25, yaz %60, sonbahar %40; daha sert yağmur,
    daha koyu gök, şimşek ve gök gürültüsü). Ölçülen (lobi olaylarıyla
    birlikte, zamanın yüzdesi): yaz %12,5 (çoğu lobi olaylarından),
    ilkbahar %20, kış %66 (kar), sonbahar %48 (önce kış %36, sonbahar %31;
    `bun scripts/rain-share.ts`); şimşekli fırtına sonbaharda
    %9, ilkbaharda %5, yazın %4. **Kışın** (`snowSeasons`) yağan her şey
    **kardır**: beyaz, yavaş, salınarak düşen taneler (1–3 piksel), sıçrama
    ve ses yok, şimşek yok, grilik açık soğuk bir pus. Kuraklık, dolunay, kutup ışıkları, tutulma, gökkuşağı ve kuyruklu
    yıldız sürerken sağanak olmaz. Hava lobi anahtarından (`lobbyKeyOf`)
    ve saatten hesaplanır, saklanmaz; herkes aynı gökyüzünü görür.
    Bulutlar yağmurdan 45 sn önce toplanır, yağmur 30 sn'de başlayıp
    diner. Yağarken harita **grileşir**: zeminin üstüne soğuk gri bir
    perde iner ve gün ışığının rengi koyulaşıp grileşir (gece yağmuru
    daha karanlıktır); haritanın üstünde yumuşak kenarlı, düzensiz koyu bulut gölgeleri
    rüzgârla sürüklenir. Ekranda her yakınlaştırmada eğik, keskin piksel
    yağmur çizgileri düşer (rüzgâr yönü 15 dakikada bir değişir, yoğunluk
    yağmura göre; çizgi kalınlığı yakınlaştırmayla 1–3 piksel). 1× ve
    yakında damlalar yere düşer: çimende ve toprakta küçük sıçrama
    taçları, nehir ve gölde yayılan halkalar (köprüde taç); sıçramalar
    zeminin hemen üstünde, binaların ve yürüyenlerin altında çizilir.
    Fırtınada ara sıra şimşek çakar (ekran bir an ağarır, ardından
    1 saniyenin altında gök gürültüsü). Yağmurun kısık bir sesi vardır
    (sentezlenmiş gürültü, efekt sesine bağlı; sekme gizliyken susar).
    Hava efektleri "Sade"yken (Ayarlar → Görüntü; güç tasarrufu da
    sadeleştirebilir) yalnız grilik ve seyrek çizgiler kalır (bulut gölgesi
    ve sıçrama yok), "Kapalı"yken hava hiç çizilmez ve duyulmaz. Geliştirmede `?rain=1` / `storm` /
    `sleet` / `shower` / `snow` havayı, `?snow=1..3` kar örtüsünü zorlar
    (yalnız `bun run dev`).
  - **Kar örtüsü** (`weather.ts` → `snowCover`, `weather.json` →
    `snowCover`): takvimden hesaplanır, saklanmaz. Kışın ilk %12'sinde
    hafif (1), %30'una dek yamalı (2), sonra beyaz örtü (3); ilkbaharın ilk
    %12'sinde 2, %28'ine dek 1, sonra erir. Gerçekte saatin ~19 dakikası
    karlıdır. Örtü **kare başına hiçbir maliyet getirmez**: zemin zaten her
    oyun saatinde güneş gölgesi için yeniden boyanır, örtü değişince de
    aynı yol kullanılır. Zeminde açık arazi beyazlar (yamalı seviyelerde
    gürültüyle), yol ve patikalar yarı yarıya (karsız kalan yeri çamurlu
    kardır), kum az, su hiç; ışığa göre mavi-gri gölgeli kar tonları. 2 ve
    üstünde çimen tutamları, kır çiçekleri ve çakıllar gömülür. Binalar,
    ağaçlar, kayalar ve hanlar karlı hâllerini bir kez üretip saklar
    (`sprites.ts` → `snowOf`): modelle çizilen binaların her pikseli ne
    kadar yukarı baktığını bilir (`Sprite.up`; `buildingKit` düz üst,
    çatı eğimi, külah ve kubbeden yazar), kar önce düz üstlere ve yatık
    çatılara, derinleştikçe dik çatılara oturur, duvarlara hiç; öbür
    sprite'lar şekillerinin üst kenarından kar tutar. Kar pikselin
    ışığını korur (gölgedeki çatı mavi-gri, ışıktaki beyaz).
- **Ortam sesleri** (`apps/web/src/audio/ambience.ts`; Ayarlar → Ses'te kendi
  düğmesi ve ses düzeyi, varsayılan açık, %60): dünya kameranın baktığı yere
  göre kısık ve seyrek seslenir, hepsi tarayıcıda sentezlenir. Ortak gürültüden
  süzülen en çok dört döngü birbirine geçer: hep hafif esen, uzaklaştıkça ve
  dağda güçlenen, ara ara savrulan **rüzgâr** (kışın daha ince ve soğuk);
  ekranda nehir ya da göl varsa **akan su**; orman baskınsa **yaprak
  hışırtısı**; ½× ve yakında binalar varsa **köyün uğultusu**. Üstüne ara sıra
  tek sesler düşer: gündüz **kuş cıvıltıları** (ormanda ve çayırda daha çok,
  kışın az), uzakta guguk kuşu ve karga; akşam ve gece **cırcır böcekleri**
  (kışın yok), baykuş, nadiren uzak bir kurt uluması; köyde silah atölyesi
  varsa örse inen çekiç, oduncuda balta, köpek havlaması, şafakta (tarla varsa
  daha sık) horoz; ekranda tapınak ya da katedral varsa her oyun saatinin
  başında üç vuruşluk uzak bir çan; suda ördek ve şıpırtı. Yağmurda, sulu karda
  ve kar yağarken kuşlar ve böcekler susar (yağmurun kendi sesi vardır).
  Görünüm 10×10 karoluk bir ızgarada ve 16 karoluk hücrelerde sayılan
  binalardan saniyede ~3 kez örneklenir, her karede değil. Ortam sesi çalarken
  efekt ses motoru uyumaz; kapalıyken, sekme gizliyken ya da harita
  çizilmiyorken döngüler söner, motor yine 4 saniyede uyur (§12).
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
- Karo ızgarası çizilmez. İmlecin altındaki karo haritada gezerken yalnızca
  çok soluk bir hayalet olarak (beyaz, dolgu %3, kenar %16) görünür; bir yer
  seçilirken (yapı yerleştirme, yıkım/taşıma, ordu ya da filo gönderme)
  belirgindir (`createWorld.ts` → `setTargeting`).
- **Fare imleci** ortaçağ tarzı, piksel bir **zırh eldiveni**dir (işaret
  parmağı fare oku gibi çapraz, sol üste uzanır; altın kenarlı deri bilek
  sağ altta; `lib/cursors.ts` → `handCursor`,
  simgeler gibi karakter haritasından 2 kat çizilir, sıcak noktası parmak
  ucu). Bir şeyin üstüne gelince eldivenin sağ altında, altın kenarlı koyu bir
  levhada onun simgesi durur (`createWorld.ts` → `LOOK_ICONS`): saray taç,
  ev ev, tarla başak, oduncu balta, silah atölyesi örs, iskele ve balıkçı
  kulübesi balık, pazar ve hazine altın, kışla kılıçlar, casus evi göz, gözcü
  kulesi yay, sur ve kapı kalkan, üniversite kitap, hastane şifa, tapınak
  tapınak, ambar sandık, eğlence merkezi müzik, hapishane kilit, tersane gemi,
  hisar kalkan, anıt yıldız, lonca konağı parşömen, ticaret noktası ticaret,
  iskele (inşaat) çekiç, yol harita; ordular (yağmacılar ve devriyeler de) kılıçlar,
  gemiler gemi, hanlar han, mağaralar meşale, taç başkentleri taç, kasabalar
  sancak. Yıkım ve taşıma araçları kendi imleçlerini korur.
  İmleç bir taç başkentinin (dış suruna kadar, 36×36 karo) ya da bir
  kasabanın (8×8) üstündeyse, binalarının üstünde de olsa, o yerin **bütün
  alanı** araziye yatırılmış bir çerçeveyle vurgulanır.
  Hudut içinde parsel çizgileri çok silik gösterilir.
- **Marka** (`apps/web/src/brand/brandArt.ts`): logo, profil resmi ve favicon da kodla boyanır; maskot
  elçidir (portresi `EnvoyPortrait.tsx` → `paintEnvoy`, zeminsiz ve çerçevesiz). Madalyon: alacakaranlık
  gökte yıldızlar, başının ardında hâle, yaldızlı halka, omuzları halkanın alt kenarına taşar. Yazı
  Pixelify Sans'tan piksel piksel alınır, menünün başlığı gibi yaldız bantlı, mürekkep kenarlı ve kahverengi
  alt gölgelidir. Dosyalar `public/brand/` altındadır (yatay ve dikey logo, rozet, Instagram 1080, favicon
  32/64, apple-touch ve 192/512 simgeler; ana menünün gece manzarası üstünde iki kat büyük madalyon, ad ve
  menünün şeridinde "Lordum, haberler var. Çoğu kötü." ile thumbnail'lar: `thumbnail-16x9` 1920×1080,
  `thumbnail-1x1` 1080×1080, `thumbnail-9x16` 1080×1920; `brandArt.ts` → `thumbnail`); yeniden üretmek için `bun scripts/brand-save.ts
  apps/web/public/brand` çalıştırılır, `bun run dev` açıkken yazdırdığı `/brand.html?save=…&token=…` bağlantısı açılır
  (yalnızca 127.0.0.1'i dinler, bu token'ı ve bilinen PNG adlarını kabul eder).
- Arayüz yazı tipi Pixelify Sans'tır; ondaki 2 ve 5 zor okunduğu için
  **rakamlar Jersey 10** ile çizilir (Tiny5'in 8'i 0 gibi okunuyordu) (`apps/web/src/fonts.ts`). Büyük sayılar
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
- **Binalar model olarak çizilir** (`apps/web/src/game/buildingKit.ts`):
  her bina küçük bir 3B modeldir (kutu duvarlar, kırma/beşik/sundurma
  çatılar, silindir kuleler, koni çatılar, kubbeler), piksel piksel derinlik
  testiyle boyanır ve sol üstten gelen ışıkla gölgelenir; tonlar arası geçiş
  dither ile yapılır. Malzemeler dokuludur: düzensiz kesme taş sıraları,
  moloz taş, bağdadi (ahşap çatkı + sıva, çaprazlı), dikey tahta, yuvarlak
  kütük; çatılar kiremit kanalları, arduvaz, ahşap padavra, saman demetleri,
  kurşun ya da çizgili bez; saçak altı ve duvar dibi koyulaşır. Pencerelerin
  çerçevesi, haç kayıtları, panjurları, çiçek saksıları ya da demir
  parmaklıkları; kapıların kemeri, demir kuşakları ve önlerinde basamak
  vardır. Pencere camı gündüz koyu (gökyüzü yansımalı), gece yanar. Her
  binanın işini anlatan eşyaları vardır (fıçı, sandık, çuval, araba, odun
  yığını, tezgâh, raf, fener, insanlar). Gölge için duvar, çatı ve kule
  katıları çizilirken kaydedilir (§4.2.1 gölgeler); eşyalar katı sayılmaz.
  Binalar: saray 1–5 (sur, yuvarlak kuleler, kale; çatılar krallığın
  renginde; 6. seviye taç kalesi eski çiziminde kalır), ev (bağdadi/kiremit,
  badanalı/saman, taş/arduvaz, kütük/yosunlu padavra; 3. seviyede taş
  zemin kat üstüne çıkmalı üst kat), tarla, oduncu (kütük ev ya da açık
  sundurma, uçları görünen kütük yığınları, kalas istifi, odun), silah
  atölyesi (ocak, körük, örs, silah rafları, su fıçısı; 3. seviyede su
  çarkı), ticaret noktası, pazar (çizgili tezgâhlar, kemerli pazar hanı,
  saat kulesi, çeşme), kışla (talim alanı, saman kuklalar, hedefler,
  ahır), casus evi (dar, üç katlı, çıkmalı is lekeli ev, kapalı panjurlar,
  tek yanan pencere, kapı feneri, kukuletalı adam, mahyada kuzgunlar, arka
  mahzen kapısı), gözcü kulesi (uzun yuvarlak taş gövde, tepesinde
  dikmeli ahşap balkon ve kırma çatı; iki çeşidi yalnızca taş ve çatı
  malzemesiyle ayrılır, inşa menüsündeki resimle haritadaki aynıdır; 2.
  seviyede balkonda mangal, 3.de nöbetçi ve flama), hapishane (parmaklıklı taş zindan, demir
  parmaklıklı avlu, gardiyan; doluyken avluda taçlı kraliçe), üniversite,
  hastane (şifacıların altın kâsesi tabelası, şifalı ot tarhları, çamaşır
  ipinde çarşaflar; kızıl haç yok), tapınak (çan kuleli kilise ya da
  sütunlu kubbe), hazine, eğlence merkezi, iskele, balıkçı kulübesi, kale,
  anıt ve lonca binası. Ambar (ahır) ve tersane kendi çizimlerindedir.
- **Hareketli binalar** (`buildingKit.ts` → `animate`, `stillOf`,
  `animOf`): bir bina kare kare çizilir; haritada binanın **durgun hâli**
  (havada hareket eden parçalar — bayraklar, insanlar, alet — çıkarılmış,
  binanın üstünde hareket eden parçalar duruş hâlinde) çizilir, üstüne
  yalnızca o karede değişen pikselleri taşıyan küçük bir kare konur
  (`createWorld.ts` → `addMoving`). Kareler saatten seçilir, her binanın
  kendi evresi vardır; yalnızca ekrandakiler, ½× ve üstünde ve "Detay
  animasyonları" açıkken oynar (yoksa ilk karede durur). Kareler gölge
  düşürmez; başka binaların gölgesi üstlerine düşer. Tarlada ekinler
  rüzgârda dalga dalga sallanır (buğday, keten; balkabağı yaprakları
  kıpırdar; tarla karesi zeminle gölgelerin arasında çizilir), korkuluğun
  kolları sallanır; oduncuda adam kütüğe balta indirir (yongalar uçar),
  2. seviyeden iki biçkici bıçkı çeker; silah atölyesinde ocağın ateşi
  titrer, körük iner kalkar, demirci örse vurur (kıvılcımlar), 3. seviye su
  çarkı döner; saray, kışla, kale, eğlence merkezi ve gözcü kulesinde
  bayraklar dalgalanır; gözcü kulesi, tapınak, kale ve anıtta mangal
  ateşleri titrer; eğlence merkezinde ozan ud çalar, casus evinde bir kuzgun
  kanat çırpar. Menülerdeki resimler binanın tam (ilk kare) hâlidir.

### 4.3 Harita üretimi

Prosedürel (seed tabanlı), ama **adil başlangıç** kurallarıyla:
her oyuncunun başlangıç bölgesinden bir ticaret yoluna veya nehre makul
uzaklık olmalı; kimse tamamen dezavantajlı başlamamalı. Sunucu başlangıç
yerini çekerken önce ticaret arsası **ve** iskele arsası bulunabilen yerleri
dener (ilk 16 deneme), ilk 8 denemede de yemek çarpanı en az 1 olan yerleri;
yalnızca hiçbiri çıkmazsa böyle bir yer verir
(`command` → `rollSite`). Önceden ~%2 yerde ikisi de yoktu: tüccarsız lordluk.

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
  Gökova, Kartalsuyu… 134 ön ek × 78 ek, on bini aşkın kök; 16 unvan:
  Beyliği, Diyarı, Tımarı, Zeameti, Toprakları…) ve lobideki başka bir krallığın
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
| **Kıyı** (suya komşu kara karosu)            | Yalnızca **iskele/liman** ve **sur/kapı** |
| **Yol kenarı** (ticaret yoluna komşu karo)   | Yalnızca **ticaret noktası** |
| **Dağ eteği** (karaya komşu dağ karosu)      | Yalnızca **tünel**       |
| Diğer kara karoları                          | Serbest                  |

- İskele **2×2 karo** kaplar; en az bir karosu kıyı olmalı, hiçbiri su/dağ
  olmamalıdır.
- **Sur suya kadar çekilir:** sur parçaları ve sur kapısı hudut içindeki kıyı
  karolarına da kurulur; böylece sur nehrin ya da gölün kenarına dayanır,
  ucu ile su arasında kimsenin geçebileceği bir karo kalmaz (su yürünmez,
  köşeden sıyrılarak da geçilmez). İskele henüz kurulmamışsa sur iskele
  arsasına ve onun sur boşluğuna (§6.4) kurulmaz, iskele her zaman sığar
  (`economy.ts` → `canPlace`).
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
  hizmetliler). Üst çubuktaki nüfus kartı **nüfus / sınır** yazar (köylü + asker +
  denizci, saray seviyesinin nüfus sınırı; sınırdayken kırmızı); açılan kartı
  da saatlik büyümeyi, yerleşimi (köylü / yer, dolmaya kalan süre),
  **barınağı** (evlerin ve sarayın verdiği, sınırla kesilmiş yer ve kaç
  yapıdan geldiği), askerleri, denizcileri ve altında bunları açıklayan kısa
  bir notu ("Askerler ve denizciler de barınakta yatar: 120 yerden köylülere
  96 kalır"; evler sınırdan fazla yer veriyorsa onu da söyler) ve **inşaat
  ustalarını** (aynı anda yürüyebilecek inşaat
  sayısı ve kaçının çalıştığı) gösterir.
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
- **Hazine sınırı:** Altının da sınırı vardır: saray seviyesiyle 1500 /
  12000 / 16000 / 22000 / 28000 (önce 1000 / 2000 / 3500 / 5500 / 7000: hazine
  birkaç saatte doluyordu, bir gece uyuyan oyuncunun geliri boşa gidiyordu;
  sınırlar, iyi oynanmış bir lordun 10 saatlik uykuda hazinesini üçte birden
  ~%70–90'a çıkaracağı, doldurmayacağı şekilde seçildi: `bun scripts/offline-balance.ts`), ve 4. seviye sarayda açılan **Hazine** binası
  ekler (seviye 1/2/3: +4000 / +8000 / +14000; 4. seviyede bir, 5.de iki
  hazine). Sığmayan altın boşa gider. **Hazine doluyken tüccar mal
  götürmez**, evde bekler (mallar depoda kalır, lobi fiyatı düşmez); yer
  azsa yalnızca hazineyi dolduracak kadar satar. Haraç, harcama ya da yeni
  hazine yer açınca yeniden satmaya başlar (Ticaret sekmesinde "Hazine
  dolu" uyarısı). Vergi gibi diğer gelirler dolu hazinede boşa gider. Tüccar yemek satarken
  halkın ve askerin 30 turluk (5 dakikalık) yemeğini depoda bırakır, satış
  krallığı aç bırakmaz (`trade.foodReserveRounds`). Yapı ve savaş malzemesi
  satarken de bir **iş stoğu** bırakır: 120 yapı / 60 savaş malzemesi ya da
  sarayın bir sonraki seviyesinin o maldan istediği, hangisi büyükse, ama
  ambarın yarısından fazla değil (`trade.keepGoods`; `tradeReserve`). Önce
  tüccar yapı malzemesini sıfıra kadar satıyordu; yeni lord ilk dakikalarda
  evini kuracak malzemeyi kaybediyordu (bütün testlerde tekrarlandı). Depo
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
  görünür; iskelede **ustalar çalışır**: bir kısmı çekiç sallar, bir kısmı
  omzunda kalasla şantiyenin bir ucundan öbürüne taşır ve boş döner;
  yapının boyuna göre 2–5 usta; yalnızca görsel, saatten hesaplanır,
  `createWorld.ts` → `placeBuilders`), aynı anda en fazla 2 inşaat yürür. Yalnızca hudut içinde,
  serbest karoya kurulur; altındaki ağaçlar temizlenir.
- **Nüfus:** Evler köylüye yer verir, köylüler o yere zamanla gelir (§5.2);
  üretim binaları işçi ister; köylü yetmezse binalar orantılı daha az
  üretir. Köylüler her üretim turunda yemek yer.
- **Biyom çarpanları:** Yerin çevresindeki araziye göre üretim çarpanı:
  nehir/göl (balık) ve çayır (tarım) → yemek; orman → yapı malzemesi;
  dağ → savaş malzemesi; bataklık hepsini biraz düşürür, kurak yemeği
  düşürür. Çarpanlar kuruluşta sabitlenir. Yemek çarpanı **0,8'in altına
  inmez** (`yield.foodMin`; önce 0,5'e kadar iniyordu: 0,6'lık bir yerde
  tarlalar halkı hiç doyuramıyor, lordluk bütün sezon açlık sarmalında
  kalıyordu; eski lordluklar `20261024120000_food_floor.sql` ile tabana
  çekildi). Yer kartı yemeği 1'in altındaki yerde "Yemek kıt" uyarısı yazar.
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
- **Eğim:** Yokuşa kurulan yapı (köşeleri arasında en az 6 piksel fark), en
  yüksek köşesi hizasında düz bir kaide üzerinde durur (köy yapılarında toprak
  set, tarlada toprak bank, büyük yapılarda kesme taş; aşağıda); kaide aşağıdaki zemine iner.
  Sur, kapı ve çitler bundan ayrıdır: kaidesiz, eğime göre kaydırılarak
  kesintisiz uzanır (§4.2.1).
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
  dalgalanarak uzanırlar (yürüyenler yine aynı yolu izler). Patika katı
  kahverengi bir çizgi değil, çimenin arasından görünen **aşınmış topraktır**:
  en fazla ~%55 opaklıkta, birkaç dither basamağıyla yarı saydam, ortası
  belirgin, kenarları çimene karışarak söner; genişliği yol boyunca hafifçe
  daralıp genişler, yer yer çimen tutunduğu için lekelidir. Patikalar
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
- **Kaide, avlu, aşınma ve köy süsleri** (`buildingSprites.ts` → `bank`,
  `buildingKit.ts` → `paveArea`, `villageProps.ts` → `planVillage`; yalnızca
  görsel): köşeleri arasında 6 pikselden az fark olan yapı kaidesiz oturur
  (yamaca bir iki piksel gömülür). Gerçek yokuşta köy yapıları yamaca yarı
  yarıya gömülür (alçak ve yüksek köşenin %45'i) ve **toprak setin** üstünde
  durur: set dik yüzler değil, yapının çevresinde dışa doğru alçalan, gerçek
  zemine değdiği yerde biten eğimli, çoğu çimli bir eteklik; dibi yamacı izler,
  köşeleri yuvarlaktır; yüksek kesimlerinde taşlı, kökli toprak bantları görünür,
  çim kenarından sarkar ve dibinden tırmanır.
  Kesme taş kaide yalnız saray, hisar, tapınak, anıt, lonca konağı, hazine,
  üniversite, hapishane ve taç yapılarındadır, onlar da %60'a gömülür, kaideleri
  alçaktır (gözcü kulesi kendi kaba taşında,
  tarla toprak bankında kalır). Toprak, çakıl ve çim avluların kenarı yoktur:
  geniş, lekeli bir bantta incelip çimene karışır, ortasında yer yer çim kalır;
  kesme taş, arnavut kaldırımı ve tahta kenarını korur (demirhane ve 2. seviye
  ticaret noktası çakıllıdır). Lordluğun zemini **yaşanmış görünür**: sarayın,
  evlerin ve patikaların çevresinde çim lekeler hâlinde kuruyup sararır (dither
  ile), en çok çiğnenen yerlerde bir iki karoluk çıplak toprak açılır, kenara
  doğru yeşile döner; aşınma yapılar değişince karo başına bir kez hesaplanır.
  Binaların arasına zemine boyanan **köy süsleri** kendiliğinden konur, hepsi
  binalar gibi model setinden (`buildingKit`) ışıkla ve dither ile çizilir:
  evlerin yarısında evin duvarına bitişik (önce sağ yanında, yoksa arkasında;
  boşta duran bahçe olmaz) küçük, düzensiz bir **sebze bahçesi** (çapalanmış
  sıralarda iki üç tonlu lahana, marul, pırasa, havuç; köşede fasulye sırığı,
  ışık alan dikmeli çit, kapıya bakan bir aralık ve patika), bazılarında çamaşır
  ipi; odun yığınları (kesik uçları, kütük ve balta); ambarın yanında
  saman yığınları; oduncuda odun istifleri; pazar ve ticaret noktasında araba,
  fıçı, sandık (iki büyük parmaklı tekerlekli, tahtaları görünen, çuval, saman
  ya da fıçı yüklü araba); birkaç evde bir kuyu; düz tarlaların arka kenarında çit ya da
  kuru taş duvar; yer yer genç meyve ağaçları. Yapı, yol, patika ve su üstüne
  konmazlar; uzun olanlar binanın, surun ve yürüyenlerin önüne düşmez, surdan 3
  karo uzak durur; karda bahçeler ve taş duvarlar gömülür. Hepsi zemine
  boyandığı için kareye maliyeti yoktur (parça boyaması ~%8 uzadı). Çayırın
  yeşili ~%10 soluklaştırıldı, açık tonları hafifçe sarıya çalar.
- **Köy hayatı** (yalnızca görsel, saatten ve tohumdan;
  `apps/web/src/game/villageLife.ts`): lordlukların yapıları arasında nüfusla
  artan bir kalabalık dolaşır: her 3,5 köylüye bir figür (en çok 40).
  Kasabalılar yakın yapılar arasında patikalardan gezip kapı önünde durur;
  sarayın ve pazarın önünde ikişer kişi sohbet eder; kadınlar kovayla evinin
  yakınındaki bir yere gidip döner; evlerin dibinde üçer çocuk koşup zıplar;
  bir iki köpek koşturur. Tarlaların ve ambarın yanındaki açık çayırda inek ve
  koyun sürüleri otlar, ambar ve bazı evlerin önünde tavuklar eşinir (en çok 30
  hayvan, yapıların ve suyun üstüne çıkmaz). Bir öküz arabası ambar ya da tarla
  ile pazar ya da saray arasında gidip gelir; 2× ve yakında pazarın ve ticaret
  noktasının önünde bir kalabalık kaynaşır. Gece yalnızca birkaç kişi ve
  köpekler dışarıdadır, hayvanlar yattığı yerde durur. Oyuncunun nüfusu gerçek
  sayısından, başkalarınınki evlerinin barınağından tahmin edilir (en çok 120).
  Bir lordluğun planı (yollar, yerler) ekrana ilk girdiğinde bir kez kurulur
  (karede en çok bir lordluk), yalnızca ekrandaki lordluklar ve figürler
  çizilir, hepsi 200 sprite'lık ortak bir havuzdan; ½× altında hiçbiri yoktur.
  Detay animasyonları kapalıyken (telefon, güç tasarrufu) lordluk başına
  yalnızca 6 kişi, köpekler, araba ve 12 hayvan kalır. Ölçüm: yoğun bir
  lordlukta kare başına ~6–8 µs.
- **Yol (inşa edilen):** 1. seviye sarayda açılır; 1×1, çok ucuzdur (1 altın
  + 1 yapı malzemesi, 2 sn; `economy.json` → `buildings.road`), inşaat
  sırasına girmez, işçi istemez, iskelesi yoktur. Sur ve ev gibi basılı tutup
  sürükleyerek sıra hâlinde plana eklenir (her karo bir adım). Hudut içinde
  serbest karoya kurulur; binalar yolun üstüne, yol binaların altına
  kurulamaz; surla arasında boşluk gerekmez. Taşınamaz, yıkılabilir (yarı
  iade). Sınırı 400 karodur; puana katkısı yoktur (`society.json` →
  `score.roadPer`), yapı sayısı eşiklerinde (taçların tanıtımı, hedefler)
  sayılmaz, günlüğe ve haritaya "tamamlandı" yazmaz. Köylüler, tüccar ve
  ordular yolun üstünden yürür (tarla gibi düzdür); yol ticaret yolu gibi
  aşınmış zemin sayılır: yürüyenler onu seçer, patika yolun üstüne ya da
  yanına çizilmez, yola varan patika kenarında birleşir. Yol zemine boyanır
  (`chunkPainter.ts` → `setLanes`): her yol karosu komşu yol karolarına (köşe
  komşusuna da), değdiği ticaret yoluna ve karşıdan geldiği sur kapısına (arada
  bir boş karo olsa da; kemerin altına kadar) bağlanır, dönüşler yuvarlaktır;
  sıkıştırılmış toprak ve çakıl, koyu kenar, iki silik araba izi, ara ara
  çakıl taşı; kenarı dalgalanarak çimene dither ile karışır. Gölge düşürmez,
  sprite değildir; üstüne gelince "Yol" yazar.
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
  - **Sur, ev ve yol** basılı tutup sürükleyerek sıra hâlinde plana eklenir. Sur
    parçaları ve yollar inşaat sırasına girmez (aynı anda kurulur); evler sıraya
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
    ekranda keserdi (`economy.json` → `wallClearance`). **Gözcü kulesi**
    bundan muaftır (`wallClearance.exempt`): kendisi yüksek olduğu için sur
    onu örtmez; sur kuleye bitişik kurulur, sur hattı kuleden suya kadar
    sürdürülebilir.
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
    açar; tercih tarayıcıda hatırlanır. Her kartın sağ üst köşesindeki **×** kartı
    kapatır; yalnızca bu ziyaret için (bellekte tutulur, oyun yeniden açılınca
    yine görünür). Hafif bir uyarı ağırlaşırsa (ör. aşırı büyüme 2'den 3
    kasabaya) kapatılmış olsa da yeniden çıkar.
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
  - **Yapı sınırları** saray seviyesiyle artar (saray 1→5): tarla 4 / 5 /
    6 / 8 / 10 (önce 3 / 4), oduncu kampı 2 / 3 / 4 / 5 / 6, silah atölyesi 1 / 2 / 3 /
    3 / 4, gözcü kulesi 2 / 2 / 3 / 4 / 6, sur kapısı 2 / 2 / 3 / 4 / 5;
    pazar, kışla, casus evi, hapishane, üniversite, hastane, tapınak, tersane,
    iskele ve 5. seviye sarayın üç büyük yapısı (hisar, hanedan anıtı, lonca
    konağı; §9.8) birer tane. Sınır İnşa sekmesinde ve Saray sekmesindeki yapılar listesinde
    "kurulu / sınır" olarak yazar; sınırı aşan eski yapılar yerinde kalır.
  - **Saray 4. ve 5. seviye** çok pahalı ve uzundur (savaş malzemesi de
    ister; `economy.json`).
  - Saray ve ticaret noktası dışındaki her yapı **yıkılabilir** (plana
    eklenir): inşa ve yükseltme maliyetinin yarısı geri döner (ücretsiz ilk
    yapının inşa maliyeti dönmez).
- **Ticaret noktası:** satılacak mal yerine **hiçbir şey satma** da
  seçilebilir (tüccar evde bekler). **Sefer başına satış** miktarı
  ayarlanabilir: 5'er birimlik adımlarla, en fazla seviyenin sınırı kadar
  (20 / 40 / 70; önce 40 / 80 / 140: tüccar **daha az birim, daha pahalıya**
  satar, mallar depoda birikir; §9.7 "Mal dengesi"); değiştirildikten sonra 2 dakika yeniden değiştirilemez
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
- **Yokluk cezası:** Oyuncunun son görülmesinden 2 saat sonra, geçen her saat binaların
  üretimi, vergi ve tüccarın altını %7 azalır (en az %60'a kadar;
  `economy.json` → `idle`; önce 1 saat sonra %10, en az %50'ydi: bir gecelik uyku geliri yarıya indiriyordu). (Daha önce %20'ye iniyordu: bir gün yokken gelir
  %20'ye düşerken asker maaşı, kasaba bakımı ve haraç tam sürüyor, hazine
  birkaç saatte boşalıp öyle kalıyordu.) Yemek üretimi bundan etkilenmez: halk kendi
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
  Bir saatten uzun süre "s:dd:ss" yazar. Sayaca tıklamak ilgili yeri açar:
  inşaat, araştırma ve vaaz o binanın menüsünü (kamera binaya gider), asker
  eğitimi Ordu → Kışla'yı, sefer Saray → Seferler'i, taç kervanı Ticaret →
  Siparişler'i, gemiler ve filolar Ordu → Donanma'yı, orduya giden elçi ve
  yoldaki ordular Ordu → Ordular'ı, lorda giden elçi o lordu Diplomasi'de,
  kraliyet isteği Diplomasi → Krallık'ı açar.
- **Haritada ilerleme çubukları** (`createWorld.ts` → `setProgress`):
  inşaatı ya da yükseltmesi süren her binanın üstünde, kasaba kuşatması
  gibi bir çubuk dolar. Kuşatılan bir sarayın (her lordun) üstünde
  kuşatanın renginde **"Kuşatma"** çubuğu muharebenin sonuna doğru dolar;
  saray düşünce kalkan süresince açık mavi **"Kuşatma kalkanı"** çubuğu
  durur. Sarayın savunması kuşatma muharebesidir (garnizon, gözcü
  kuleleri, surlar; §9.7).
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
  - **Hazine** menüsü üç alt sekmedir (`usePart` anahtarı `treasury`):
    **Hazine** (doluluk: altın / sınır çubuğu, sınırın nereden geldiği —
    saray + her hazine — ve hazinenin seviyelere göre altın yeri; hazine
    doluyken kırmızı nokta), **Gelir-gider** (tur başına gelir-gider) ve
    **Defter** (**sezonun defteri**, `booksOf`: vergi, tüccar, haraç,
    devriyeler, maaşlar, kasaba bakımı; boşa giden altın).
- **Alt sekmeler:** Uzun sekmeler Saray'daki gibi alt sekmelere bölünür
  (`apps/web/src/ui/hud/Subtabs.tsx`; son bakılan bölüm tarayıcıda
  hatırlanır, kırmızı nokta bekleyen bir şeyi gösterir; altı ve daha çok
  bölüm iki eşit satıra dizilir, 6 → 3 + 3, 8 → 4 + 4): **Halk** → Nüfus /
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
  renginde kesikli çizgiyle, binaları haritada görünür (tıklanınca o lord Diplomasi'de açılır);
  depoları gizlidir. Başka bir krallığın binasının üstüne gelince bina o
  krallığın renginde dış hatla vurgulanır, etikette krallığın adı (kendi
  renginde), binanın adı ve seviyesi yazar. Yıkım/taşıma modunda
  vurgulanmaz. Yeni bir krallığın yeri, son aşamadaki hududu başka
  hudutlara `kingdomGapTiles` karodan yakın olmayacak şekilde seçilir.

---

### 6.5 Mini oyunlar ve sıralamaları (şu an uygulanan)

Balıkçı kulübesinin oltasına ek olarak altı mini oyun daha vardır; üçü
(odun yarma, hasat, ağ çekme) 1. seviye sarayın ilk yapılarında oynanır,
böylece yeni bir lordun da beş oyunu olur (örs ve kervan yolu dahil). Hepsi
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
**Ortak ödül hakkı:** bütün oyunlar (balık tutma hariç) birlikte herhangi
bir saatte en fazla **70 altın değerinde** ödül verir (mallar olağan
fiyatından sayılır; `minigames.json` → `budget`, `budgetedReward`,
`Kingdom.minigameEarned`). Hak dolmuşsa ödül o oranda kısılır ya da hiç
verilmez, puan yine sıralamaya yazılır; menü kalan hakkı ve ne zaman
döneceğini yazar. (Hak olmasa her oyunu 10 dakikada bir oynayan biri
saatte ~470–550 altın değeri alırdı; yeni bir lordun saatlik ~700 altınının
%10'u sınırdır. Bot ölçümü: `bun scripts/minigame-bots.ts`.)
**Görünüm:** her oyun 256×144 sanat piksellik, en yakın komşuyla büyütülen
bir hi-bit sahnedir (`apps/web/src/ui/hud/minigames/`): bir kez boyanıp
saklanan, dither'lı katmanlar (gökyüzü, tepeler, iç mekân), kayan paralaks
katmanlar, hareketli ayrıntılar (bayrak, duman, su, kuşlar, ateş),
parçacıklar (kıvılcım, yonga, başak, sıçrama, toz), ekran sarsıntısı,
parlama, yükselen puanlar ve seri sayacı; üstte süre çubuğu ve puan
levhası. Oyun 3-2-1 geri sayımla başlar, "Bitti!" ile biter; sonuç
penceresinde madalya (bronz/gümüş/altın), 0–3 yıldız (`<oyun>.stars`
puan eşikleri) ve ödül yazar. Görsel etkiler yalnızca oyunun durumunu
okur, oyunu etkilemez (`Stage.tsx`). Figürler (demirci, oduncu, orakçı,
balıkçılar) koyu dış hatlı, 2–3 tonlu, ocak ışığıyla kenarı aydınlanan
uzuvlarla çizilir; demircinin çekici omuz ve dirsekten dönerek iner.
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
- **Odun yarma** (oduncu kampı): kütüğün yanında güç göstergesi iner
  çıkar; basınca balta iner. Her kütüğün göstergede bir bandı vardır (sert
  kütükte yüksek, dar ve gösterge hızlı): bandın altın ortası temiz yarar
  (5), geri kalanı iyi (3), bandın üstü fazla sert (1), altı baltayı
  sıkıştırır (0, uzun bekleme). Budaklı kütük (%20) iki kat; art arda iyi
  vuruşlar (seri / 3) ek puan. 12 kütük, en fazla 28 sn. Ödül: puanın %40'ı
  yapı malzemesi (en fazla 30) ve %12'si altın (en fazla 10).
- **Hasat** (tarla): başaklar orakçının önünden akar; basılı tutulunca
  tırpan biçer, altından geçen her başağı keser. Olgun başak +1, altın demet
  +5, ham (yeşil) başak −2, üstünde karga olan başak −5. Biçmek gücü
  tüketir; güç biterse orakçı %35'e dinlenene kadar biçemez. Kaçan olgun
  başak seriyi bozar; seri her 8 kesimde +1 (en çok +3). 25 sn. Ödül:
  puanın %35'i yemek (en fazla 50) ve %5'i altın (en fazla 8).
- **Ağ çekme** (iskele): basılı tut ip gerilir, bırak gevşer. Ağ yalnızca
  gerginlik yeşil banttayken (0,45–0,8) çekilince yükselir; gevşekken balık
  kaçar (ağ geri iner), 1'i aşarsa ağ yırtılır (2 balık kaçar). Balıklar ara
  sıra çırpınıp ipi çeker. Çıkan ağ balık başına 2, yırtılmadıysa +4 puan
  (5–9 balık). 5 ağ ya da 30 sn. Ödül: puanın %80'i yemek (en fazla 45) ve
  %20'si altın (en fazla 10).
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
  panel açılır: hancı, hanın işi, uzaklık, **ticaret söylentileri**,
  **hanın fiyatları**, **han kiminle ticarette** pastası ve ticaret payları.
  "En yakın saray" söylentisi oyuncunun kendi sarayını da sayar (önce
  sayamıyordu, sonradan kurulan yakın lord kendini göremiyordu).
- **Hanlarla ticaret** (`economy.json` → `trade.inns`; mantık
  `packages/shared/src/inns.ts`, `economy.ts` → `innPrice`, `setTradeInn`,
  `tradeInnError`, `refreshInnShare`; sunucu `_shared/inns.ts`, `tradeInn`
  komutu; arayüz `inns.tsx` → `InnMarket`, `InnReach`, `cities.tsx` →
  `InnChoices`): her han bir pazardır.
  - **Statlar:** her hanın her mala kendi çarpanı vardır (lobi tohumu ve hanın
    yerinden: hana bir eğilim ±0,22, mala bir sapma ±0,32, 0,05'e yuvarlı,
    ×0,55–×1,5). Hanların ~%21'i **cömert** (ortalama ≥ ×1,15), ~%18'i **ölü
    fiyat** verir (≤ ×0,85). Han paneli her malın çarpanını, hanın kendi fiyat
    düşüşünü ve sana birim fiyatını yazar.
  - **Yakınlık pastası:** her lordun hana çekimi sarayından (1 − uzaklık /
    220 karo) ve elindeki her kasabadan bunun yarısıdır; çekimlerin payı
    pastadır (lord kendi renginde). 220 karodan uzak olan pay almaz.
    **Pastada en az %8 payı olmayan lordun tüccarı o hana gidemez:** uzak bir
    cömert hanı isteyen yakınındaki kasabayı almalıdır.
  - **Fiyat:** lobi fiyatı × hanın o mal çarpanı × hanın kendi fiyatı × payın
    (%8 payda ×0,85, bütün pastada ×1,15) × tacın pazar etkisi. Hanın kendi
    fiyatı satılan her birimle %0,04 düşer (en az ×0,6), 15 dakikada yarı
    yolunu toplar; hanlar arası rekabet budur: çok lord aynı hana satarsa
    han ölür. Sunucu bunu lobinin pazarında saklar (`Market.inns`, hanın
    yerine göre `innKey`). Hana satış lobi fiyatlarını lobi pazarının %15'i
    kadar düşürür. **Sefer lobi pazarınınki kadardır**, yük 1 kat.
  - **Seçim:** ticaret noktası **2. seviye** olmalı. Ticaret sekmesinde "Tüccar
    nereye gitsin"in altında payın yeten hanlar en iyi ödeyen başta listelenir;
    han panelindeki "Tüccarı bu hana gönder" de aynı işi yapar. Hedef değişince
    2 dakika yeniden değişmez (taç başkentiyle ortak). Tüccar hana gidiyorsa
    `trade.inn` (yeri, çarpanları ve pay) saklanır.
  - **Pay değişir:** sunucu her tick'te hanlarda satan lordların payını
    yeniden hesaplar (yeni saraylar, el değiştiren kasabalar); pay %8'in altına
    inerse tüccar lobi pazarına döner ve elçi "Han kapılarını kapattı" haberini
    getirir (`inn_lost`).
  - **Elçi:** daha iyi ödeyen (en az %15 fazla) bir handa payı varsa söyler
    (`innBetter`), cömert bir hanın yakınındaki kasabayı almayı önerir
    (`innReach`), tüccarı hana gönderince söz düşer, "Ticaret" konusunda
    hanları anlatır. Söylentiler herkesin bilebileceği gerçek bilgilerden
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
- **Varoşlar** (yalnızca görsel; `cities.ts` → `suburbs`): dış surun
  dışında, surun 3 karo ötesinden 20 karo ötesine kadar (iç surdan 30 karo)
  sursuz, öbek öbek yapılar uzanır; şehir dışa doğru dağılır. Öbeklerin
  yeri tohumdan, 6 karoluk sarsılmış bir ızgaradan çekilir: surun dibinde
  ve kapılardan çıkan yolların kenarında sık, kenara doğru seyrek. Sura ve
  yollara yakın öbek bir **mahalle**dir (6–12 bitişik ev, yarısında bir han,
  demirci, ambar, pazar ya da şapel, bazen bir tarla); uzaktakiler birer
  **çiftlik**tir (kırmızı ahır, 1–3 tarla, ormana yakınsa oduncu, 2–4 ev,
  nadiren bir gözcü kulesi). Her öbekten en yakın yola (yoksa bir önceki
  öbeğe) aşınmış bir patika iner. Yapılar sudan, handan, şehirden 2,
  yollardan ve birbirinden 1 karo uzak durur (evler bitişik olabilir); dağa,
  dik yamaca, ordu karargâhına ve limana kurulmaz; altındaki ağaçlar
  temizlenir. Bu bant lordların hiç giremediği alanın içindedir
  (`kingdomGapTiles` son hududu iç surdan en az ~33 karo uzak tutar); şehir
  sonradan eklenmiş eski dünyalarda bir lordun toprağına ya da binasına
  düşen varoş yapısı çizilmez. Devriyeler dış şehir gibi varoşları da
  dolanır; zemin onları bilmez. Başkent başına ~200–280 yapıdır.
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
  hâlidir (§4.2), **7** 6'nın dünyasına en son kanallar açılmış hâlidir
  (açık lobiler için), **8** 6'nın suları baştan bağlı hâlidir (§4.2); yeni
  lobiler 8'dir (`command` lobiyi açarken
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
- **Taçların hanedanları** (`cities.json` → `crown.house`; mantık
  `packages/shared/src/crownHouse.ts`, arayüz `apps/web/src/ui/hud/crownHouse.tsx`):
  her tacın tahtta bir kral ya da kraliçesi, eşi, çocukları ve önceki
  hükümdarları vardır. **Hiçbir şey saklanmaz:** hanedan lobi numarası
  (`Kingdom.lobbyKey`), sezon başlangıcı ve saatten hesaplanır; sunucu da her
  oyuncu da aynı aileyi görür (sezon başlangıcı bilinmiyorsa sabit bir günden
  sayılır). Sezon başlarken (1182) tahtta 34–52 yaşında bir hükümdar vardır
  (%30 kraliçe), 4–18 yıldır hüküm sürer; öncesinde 3 ata hükümdar (12–36
  yıllık saltanatlar) yalnızca adları ve yıllarıyla bilinir. Taç hanedanları
  da lordların hanedanı gibi **bir gerçek saatte bir yıl** yaşlanır ve
  doğumda çekilen yaşta (56–78) ölür. Hükümdar 19–26 yaşında evlenir (eşi 0–8
  yaş genç/yaşlı); anne 42 yaşını geçmeden, ikisi de yaşarken 1–4 çocuk doğar
  (ilki evlilikten 1–3, sonrakiler 1,5–4 yıl sonra; %52 oğlan). Hükümdar
  ölünce **en büyük yaşayan oğlu**, yoksa en büyük kızı tahta geçer; çocuğu
  yoksa hanedandan 24–40 yaşında bir **akraba** çağrılır. Varis 16 yaşından
  küçükse reşit olana dek **naip** (dul kalan eşi, yoksa naipler meclisi)
  yönetir. Aynı adı taşıyan ikinci hükümdar "II" alır ("Kral Orhan II").
  Saltanatlar ~30 yıl (~30 gerçek saat) sürer; bir sezonda her taçta ~9
  tahta geçiş olur. Hükümdarın adı her yerde o an tahtta olandır
  (`game/cities.ts` → `cityInfo`; App `setCrownClock` ile anahtarı ve sunucu
  saatini verir): taç paneli, kraliyet elçisi, taçların tanıtımı, haberler.
  - **Huylar** (her kişinin tohumdan bir huyu vardır; `crown.house.traits`):
    hükümdarın huyu tacın **haraççılarının istediği payı** ve **devriyesinin
    bahşişini** çarpar: açgözlü ×1,2 / ×0,8, cömert ×0,85 / ×1,25, sert ×1,1 /
    ×0,9, dindar ×0,95 / ×1,1, adil ×1 / ×1 (sunucuda `patrols.ts` →
    `crownTraitAt`, `tributeDemand(gold, factor, palaceLevel)`; %3'lük haraç 2,6–3,6 arası
    olur). Bütün bu çarpanlar (taçların rekabetiyle birlikte, `crownWays`)
    Politika bölümünde (beklenen bahşiş ve haraç payı), taç panelinde, eğlence
    merkezinin menüsünde ve haraççıların haberinde ("hükümdarı açgözlü ×1,2 ·
    taç savaşı ×1,25") yazar.
  - **Tahta geçiş haberi:** bir taçta hükümdar ölüp yenisi tahta çıkınca elçi
    **her lorda** (biat etsin etmesin) haber getirir (`crown_succession`:
    ölen, yaşı, yeni hükümdar ve huyu, naip, akrabalık): taht salonunda bir
    yanda mumlar arasında katafalkta yatan eski hükümdar ve diz çökmüş yaslılar,
    öbür yanda tahtta taç giyen varis, düşen yapraklar (`NoticeArt` →
    `royal` ailesi; naipliyse yanında kara giyimli naip). Sesi taç giyme
    çanları (naipliyse cenaze çanı). Saltanatlar saatten hesaplandığı için
    haber **tarayıcıda** üretilir (`crownHouse.tsx` → `crownNews`): her tacın
    son haber verilen saltanatı lobi ve lord başına hatırlanır; ilk girişte
    var olan saltanatlar haber sayılmaz; yokken birden çok geçiş olduysa
    yalnızca her tacın sonuncusu pencereyle gelir, hepsi günlüğe yazılır.
    Haber hiçbir yerde saklanmaz ama her cihazda aynıdır: açılışta sunucunun
    son görülme anından (`lastSeenAt`) sonraki geçişler sayılır (tarayıcının
    hatırladığı son an daha yeniyse ondan sonrakiler); oyuncu "Sen yokken"
    raporuyla dönerse aradaki geçişler (ve taç savaşları) raporun **Dünyada
    olanlar** sayfasında yazar, ayrıca pencere açılmaz. Böylece bir cihazda
    görülen haber öbüründe yeniden gelmez (öbür cihaz açılınca son görülme
    çoktan sonradır).
  - **Yeni hükümdarın ilk günleri:** tahta çıkan hükümdar kendi lordlarına
    huyuna göre bir kez yaklaşır: o taca bağlı her lordun ilişkisi taç giyme
    anındaki üretim turunda cömertte **+8**, adilde ve dindarda **+5**, sertte
    0, açgözlüde **−4** değişir (`traits.*.welcome`), sonra olağan hızla
    dinlenme değerine döner. `advance` içinde saatten hesaplanır (sunucu ve
    istemci aynı turu bulur); taca geçişten (`liegeAt`) önceki taç giymeler
    sayılmaz.
- **Taçların rekabeti** (`cities.json` → `crown.rivalry`; `crownHouse.ts` →
  `crownRivalryAt`, `crownWays`): iki taç her **3 saatlik** dönemde **barış**,
  **gerginlik** ya da **taç savaşı** hâlindedir. Hâl lobi numarası ve dönemden
  çekilir, bir öncekine bağlıdır (8 dönem geriden barışla başlayan bir zincir):
  barıştan gerginliğe %35, savaşa %5; gerginlikten savaşa %30, barışa %30;
  savaştan barışa %45, gerginliğe %35. Hükümdarların huyu savaş olasılığını
  kaydırır (sert +6, açgözlü +5, cömert −4, dindar −3, adil −2 puan; dönemin
  başında tahtta olanlar, barıştan alınır). Etkileri küçüktür: gerginlikte
  haraççılar hazinenin ×1,1'i kadarını, savaşta ×1,25'ini ister; savaşta taç
  kendi lordlarını kollar, devriyenin bahşişi ×1,2 (huyun çarpanıyla
  çarpılır; sunucu `patrols.ts`, arayüz aynı `crownWays` ile önceden yazar).
  Savaş bittiğinde (dönem sınırında hâl savaştan çıkınca) **kazanan** tohumdan
  çekilir, hükümdarların askerlik yeteneği şansı kaydırır (puan farkı başına
  %4); kazanan tacın lordlarının o taçla ilişkisi o turda **+4** artar
  (`advance`; taca geçişten sonra biten savaşlar). Savaşın başlaması ve
  bitmesi elçiyle her lorda duyurulur (`crown_rivalry`; tarayıcıda, tahta
  geçiş haberleriyle aynı kuralla), gerginlik yalnızca günlüğe yazar.
  Diplomasi → Krallık sayfası (taç kartlarının altında) hâli, kalan süreyi, etkileri ve son
  dönemleri gösterir; taç sekmelerinin Saray bölümünde de yazar.
- **Oyuncular krallık değil, lorddur.** Oyunda yalnızca iki krallık vardır
  (taçlar); oyuncunun toprağı "lordluk"tur. Menüdeki sekmenin adı
  **Saray**dır; arayüz oyuncuya "krallığın" demez, önerilen adlar
  "Krallığı/Hükümdarlığı" ile bitmez (Beyliği, Diyarı, Hanedanı, Sancağı,
  Yurdu, Malikânesi, Lordluğu, Hisarı, Tımarı, Zeameti, Toprakları,
  Vilayeti, Kalesi, Obası, Ocağı, Ağalığı).
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
- **Anında haber:** Kendi devriyen ya da rakip tacın haraççıları sarayına
  vardığı an istemci sunucuyu dürter (`settle`), elçinin penceresi onlar
  kapıya gelirken açılır, dakikalık tick beklenmez. Devriyenin rotası hedef
  lorda ve **bütün lordların yapılarının bir izine** göre önbelleğe alınır
  (`App.tsx` → `blockPrint`): diğer lordlar yüklenmeden çizilen devriye yanlış
  lorda gitmez, sonradan kurulan bir sur da rotayı yeniden hesaplatır (önce
  rota dönem boyunca eski kalıyor, kol yeni surun içinden geçiyordu).
- **Devriyeler** (`cities.json` → `crown.patrol`; mantık
  `packages/shared/src/patrols.ts`, sunucu `supabase/functions/_shared/patrols.ts`,
  `patrol_visits` tablosu): her taç krallığı başkentinden **tek, büyük bir
  devriye** çıkarır (`perCrown` = 1). Her 30 dakikalık turda devriye,
  tohumdan seçilen **kendi lordlarından birinin** sarayına gider (turun %20'si,
  ~6 dk), orada biraz kalır (%7,5) ve geri döner; turun geri kalanında
  başkentte dinlenir. Böylece tacında tek başına olan lord da devriyeyi en çok
  haraççılar kadar sık (saatte 2) görür (önce tur 15 dakikaydı: tek lordun
  kapısına devriye haraççının iki katı geliyordu).
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
  merkezine) varınca kol **binanın önündeki boşluğa doluşur**
  (`patrolRoutes.ts` → `haltSpots`): öndeki bölük binanın önüne en yakın,
  çevresi açık boş kareye (binanın arkasındaki kareler, sıkışık kareler
  daha az tercih edilir) gelir, arkadakiler son 8 karoda sıklaşıp onun
  çevresindeki boş karelere (birbirinden ~1,3 karo arayla, öndekinden en
  çok 3,6 karo, sur ya da bina aşmadan ulaşılan) dağılır; her bölük yolu
  kendisi sonuna kadar izler, yerine ancak yolun son 1,5 karosunda ayrılır (önce
  bütün son kesim boyunca yana kayıyor, kapıdan giren kolun arkası kapının
  yanındaki surun içinden geçiyordu; `bun scripts/patrol-wall-check.ts`); hiçbir bölük
  binanın ya da tarlanın üstüne çıkmaz. Dönüşte ilk 8 karoda yeniden kol
  olurlar, arkadaki bölükler önden gider. Haraççılar da sarayın önünde aynı
  biçimde toplanır.
  Konumları saatten
  hesaplanır. Ordu sancakları gölge düşürmez (yüksekten düşen uzun gölge
  bölüğü havadaymış gibi gösteriyordu; `sprites.ts` → `NO_SHADOW`).
  - **Kendi tacının devriyesi** lordun **eğlence merkezine** uğrar, içer,
    eğlenir ve **60 altın bahşiş** bırakır (lordun bir kardeşi devriyenin
    başındaysa daha fazla; §9.1.1). Eğlence merkezi yoksa sarayın
    önüne gelip **20 altınlık** küçük bir bahşiş bırakır (`patrol.plainTip`;
    önce hiçbir şey bırakmıyordu ve saray 2–3 boyunca taçlar yalnızca haraç
    alıyordu). Bu küçük bahşiş rutindir: elçi pencere açmaz, günlüğe yazılır
    (haberin `quiet` işareti; aşağıda "Sessiz haberler").
  - **Haraççılar** (haritada görünür: tacın renginde küçük bir kol, rakip
    başkentten lordun sarayına haraç isteme anında varacak şekilde yola
    çıkar, cevap süresince kapıda bekler, sonra döner; herkes görür): Rakip taç, öbür taca bağlı her
    lordun kapısına **saatte bir** haraççı gönderir (`patrol.tribute`
    → `everySeconds`; önce 30 dakikada bir); her lordun geliş anı tohumdan çekilir, dilimin ilk
    üçte ikisindedir (`tributeVisitAt`). **İki tacın askerleri bir sarayda
    buluşmaz:** haraççıların kapıdaki kalışı (varıştan 1 dk önce, cevap
    süresi ve dönüşün ilk 1 dk'sı, iki yanda 30 sn pay) lordun kendi tacının
    devriyesinin orada olduğu aralıkla (varıştan 1 dk önce – ayrılıştan 1 dk
    sonra) ya da başka bir rakip tacın haraççılarıyla çakışırsa, geliş anı
    çakışmasız ilk ana 15 saniyelik adımlarla kaydırılır (yoksa en az
    çakışana; `tribute.clearSeconds`, `marginSeconds`, `stepSeconds`).
    Lordların listesiyle (kimin kime bağlı olduğu) hesaplanır; sunucu ve
    istemci aynı anı bulur. Haraççı **hazinenin %3'ünü, en az saray seviyesi ×
    40 altın** ister (`share`, `minPerPalaceLevel`; 10.000 altında 300, 2. seviye
    sarayın küçük hazinesinde 80), ama hiçbir zaman hazinenin **%12'sinden**
    fazlasını değil (`maxShare`); oyundayken cevapsız kalan haracın %50 fazlası
    da bu tavanı aşmaz (`unansweredTribute`); ilişki ve güç bunu değiştirmez.
    (Önce 30 dakikada bir %8, en az 150, en çok %25'ti: sim testlerinde
    sezonun brüt gelirinin %69'u haraca gidiyor, 8 saatlik yoklukta saray 2, 3 ve
    4'te hazine eksiliyordu; saray 3'ün 1200 altını haracı ödeyen bir lordda hiç
    birikmiyordu, hazine ~600'de dengeleniyordu. Haraç hazineyle oranlı
    kaldığı için hazine hiçbir zaman sınıra yapışmaz, ama artık bir gecede
    ciddi büyür; `docs/SIM-TEST-2-RAPORU.md`, `scripts/offline-balance.ts`.)
    **Taçlar lorda kazandırmaz,
    kaybettirir:** kendi tacının saatte en çok 2 devriyesi bahşiş ve armağanla en
    çok ~40–250 altın ve ~100 birim mal bırakır, rakip tacın saatte bir haraççısı ise
    hazinenin %3'ünü (10.000'lik hazinede ~300) götürür. Lord parasını tüccarla, kasabalarla,
    seferlerle ve ganimetle kazanır. (Önce bahşiş 120, armağanlar 60/150/300
    altın, haraç %5'ti; orta hazineli bir lord taçtan haraçtan fazla alıyordu.
    Sonra bahşiş 30, armağanlar 15/35/70 altın ve devriye saatte 4 kez geliyordu:
    tek lord 21 uğrayışta ~2.600 altın ve ~2.750 mal alırken 11 haraçta ~730
    altın ödüyordu.)
    Elçi diyaloğunda **"Öde"**, **"Reddet"** ya da **"Konuş"**. Reddedilirse o tacın
    bütün lordlarıyla ilişki **−8** düşer. 5 dakika içinde cevap
    verilmezse haraç **kendiliğinden ödenir** (hazinede ne kadar varsa),
    ilişki bozulmaz: oyuncu **çevrimdışıysa** olağan haracı öder, ceza
    yoktur; **oyundaysa** (süre dolarken son 7 dakikada görülmüşse; oyun açıkken 5 dakikada bir haber verir. AFK)
    haracı **%50 fazlasıyla** öder (`tribute.afkFactor`, `onlineMinutes`).
    Lordun hiç sorulmadığı (sunucu isteği ancak cevap süresi dolduktan sonra
    görebildi) ya da süre dolduktan çok sonra (`lateSeenSeconds`, 90 sn)
    görüldüğü haraçta bu fazlalık alınmaz. Lordun bağlılığından önceki
    (`Kingdom.liegeAt`) devriye ve haraççı ziyaretleri sayılmaz.
    Haraç diyaloğu bu fazlalığı önceden yazar, ödeme haberi de hangisinin
    olduğunu söyler. Böylece dolu
    hazine düzenli boşalır ve tüccar yeniden satar (§6.4).
  - **Haraççıyla konuşmak** (`packages/shared/src/tributeTalk.ts`;
    `cities.json` → `tribute.talk`): haraççıların başının lobi tohumundan ve
    ziyaretten çekilen bir adı ("Yüzbaşı Topal Rıza") ve huyu vardır:
    **kibirli, açgözlü, yorgun, dindar, sılayı özleyen**. Üç kez konuşur, her
    birine üç cevap verilir (sırası karışık): huyuna uyan (kibirliyi öv,
    açgözlüye göz kırp, yorgunu dinlendir, dindarı dua ile, sılayı özleyeni
    köyünü sorarak al), kuru bir cevap, ya da sert/aşağılayıcı bir cevap.
    Huyuna uyan cevap sayısına göre haraç %0 / 10 / 25 / **40** düşer, her
    sert cevap %10 artırır; **iki sert cevapta** konuşma biter, haraççı
    kızar: haraç %20 artar ve reddedilirse ilişki kayıpları 1,5 katıdır.
    Ziyaret başına **bir kez** konuşulur; konuşmadan sonra yeni miktar
    ödenir ya da reddedilir (cevapsız kalırsa kendiliğinden ödenen de odur).
    Sunucu konuşmayı aynı tohum ve cevaplarla yeniden kurup sonucu kendisi
    bulur (`patrolAnswer` komutu, `talk: number[]`; `patrol_visits.talk`
    sonucu ve ilk istenen miktarı tutar, `amount` yeni miktar olur).
    **Görünüm** (`Envoy.tsx` → `TributeAnswer`, `TalkPanel`): elçinin haraç
    haberi kısadır (istek, Reddet / Konuş / Öde). "Konuş"a basınca haberin
    resmi ve metni çekilir, pencere elçi danışmanınki gibi küçük bir konuşma
    paneline döner ve **her seferinde tek bir konuşma** gösterir: solda
    haraççıbaşının kodla çizilmiş portresi (nazallı sivri tolga, tacın
    renginde sorguç ve cübbe, zincir başlık, kara bıyık, yanağında yara izi;
    göz kırpar, konuşurken ağzı oynar; `advisor/CollectorPortrait.tsx`),
    üstte adı ve huyu ile "2/3" gibi adım sayacı, ortada harf harf yazılan
    sözü (elçinin mırıltısının daha pes hâliyle; söze dokunmak hepsini
    gösterir), altta üç cevap yan yana (biri uzunsa alt alta). Cevaptan
    sonra haraççının karşılığı yazılır, "Devam" sıradaki soruya geçer. Son
    cevapta karşılığı ve son sözü gelir, altında haracın yeni miktarı ve
    Reddet / Öde düğmeleri durur. Sunucuya cevaplar eskisi gibi konuşma
    bitince tek komutla gider.
  - Biat etmemiş lordlara ne devriye ne haraççı gelir.
  - **Yeni lord** (sarayı 1. seviyede; `cities.json` → `crown.patrol.newcomer`,
    `patrols.ts` → `isNewcomer`): taçlar onu tavlar. Kendi tacının devriyesi
    eğlence merkezi aramadan kapıya gelip **40 altın** bırakır (taç gücü, huy
    ve kardeş çarpanlarıyla; `patrol_tip`, `newcomer`). Rakip tacın adamları
    haraç istemez, aynı anda gelip **25 altınlık kese** bırakır (`rival_gift`;
    önce 120 ve 80'di: saray 1'de kalan lord taçlardan saatte ~370 altın alıyordu,
    saray 2'ye çıkmak gelir kaybıydı,
    `patrol_visits.kind` `tip`; o taçla ilişki +1); haritada etiketleri "X
    elçileri"dir. Haraç saray 2. seviyeye çıkınca başlar. Taç paneli, devriye
    penceresi ve taçların tanıtımı bunu yazar.
  - Devriye aynı uğrayışta hem bahşiş hem armağan getirirse elçi tek haber
    getirir (`patrol_tip` → `gift`); yalnız armağanda `crown_gift`.
  - **Tıklayınca:** devriyeye ya da haraççılara (kolun herhangi bir
    bölüğüne; imlecin kılıç simgesi de her bölükte çıkar, `armies.ts` →
    `pick`) tıklamak küçük bir pencere açar
    (`ui/hud/crownColumn.tsx`): kimin adamları (tacın adı, tahttaki hükümdar ve
    huyu, seninle ilişkisi, senin tacın mı rakip mi), ne iş yaptıkları ve şu an
    nereye gittikleri (sana geliyorlarsa bırakacakları bahşiş ya da şimdiki
    hazinenle isteyecekleri haraç), "… sayfasını aç" ile tacın paneli. Kasaba
    asilerine tıklamak kasabanın, taht davacısının kampına tıklamak sahibinin
    sayfasını açar (kendi kampın Saray → Hanedan).
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
  göre armağan getirir: 30+ "Teşekkür sepeti" (8 altın, 8 yemek), 60+
  "Saray armağanı" (18 altın, 12 yemek, 12 yapı malzemesi), 85+ "Hükümdarın
  lütfu" (35 altın, 20 yemek, 20 yapı, 15 savaş malzemesi; `crown.gifts`).
- **Taçların pazarı** (`crown.stewardship`): Her taç saatte bir değişen
  bir malın ticaretini yönetir (iki taç farklı mallar; lobi tohumu ve
  saatten). Lord o malı sattığında (lobi pazarında da şehirde de) fiyatı o
  taçla ilişkisine göre değişir: +100'de %25 fazla, −100'e doğru %35'e
  kadar az; −50'nin altında o tacın tüccarları onunla alışveriş etmez ve
  fiyat yarıya iner (`stewardFactor`, `tradePrice`).
- **Taç siparişleri** (`crown.orders`; `crowns.ts` → `crownOrder`,
  `fulfilOrder`, `settleOrderTrips`; sunucuda `order` komutu; Ticaret →
  Siparişler): her taç her saat bir mal siparişi verir (lobi tohumundan: bir
  mal, 120–480 birim; tüccarın yükü yarıya inip fiyatlar arttığından önceki
  240–960'ın yarısı). Lord "Kervanla gönder" der: mallar depodan hemen çıkar
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
  saatin taç siparişi), **ordunu büyüt** (garnizon ve sahadaki askerler
  en az ×1,25, en az 10) ya da **yolları temizle** (haritada gezen bir yağmacı
  çetesini yen; iki kat sık çıkar). Tersanesi olan lorda ayrıca **korsan avı**
  (bir korsan teknesi batır) ve **korsan limanını kuşat** (bir korsan limanının
  muhafızlarını yenip ablukaya al) da gelir (`crown.quests.navyKinds`,
  `asksNavy`; bunlar tersanesi olanların hepsine aynıdır). Yağmacı ve korsan
  görevleri lordun sayaçlarını okur (`Kingdom.record` → `bandsBeaten`,
  `piratesSunk`, `havensTaken`; sunucu çete yenilince, tekne batınca, liman
  muhafızları yenilince artırır). Lord görevi alır (başladığı yer saklanır:
  satılmış birim, kasaba sayısı, hedef asker, sayaç; `Kingdom.crownQuests`), saat
  dolmadan bitirip **ödülü alır**: 100–250 altın (hazineye sığdığı kadar;
  yer azsa önceden uyarılır) ve o taçla ilişki (kendi tacı +5, öbürü +3).
  2. seviye saray ister; ilişki −50'nin altındaysa taç bir şey istemez.
- **Diplomasi → Krallık** (`cities.tsx` → `CrownsPanel`): sekme düğmesi
  gibi görünen tek sıra Diplomasi'nin kendi sekmeleridir. Krallık sayfası iki
  büyük **taç kartıyla** açılır (yan yana: tacın sancağı ve adı kendi renginde,
  hükümdarın portresi, adı ve yaşı, naip varsa yazar, seninle ilişki çubuğu,
  "biat ettiğin taç" / "rakip taç" rozeti, ödülü bekleyen görevde kırmızı
  nokta); altında ince bir **güç şeridi** (iki tacın güç payı ve rekabet
  hâli), sonra **taçların rekabeti**, **taçların gücü** ve **taçların
  pazarı**. Bir karta dokunmak o tacın sayfasını açar: başlıkta "← Krallıklar"
  düğmesi, sancak, tacın adı ve hükümdarı; altında ince bir hap sırası
  (**Hanedan / Saray / Politika**). Son bakılan sayfa ve bölüm hatırlanır
  (`usePart` anahtarları `crowns`: `list` / `c0` / `c1`, ve `crown-part`).
  **Hanedan:** hükümdarın portresi, yaşı, yetenekleri ve huyu ile etkisi; eşi;
  çocukları, veliaht ve tahttaki sıraları, reşit olmayanlar, ölenler; naip;
  önceki hükümdarlar yıllarıyla (liste üç satır yüksekliğinde bir kutudur,
  fazlası kutunun içinde kayar; lordun kendi hanedanının "Atalar ve ölenler"
  listesi de öyle, `.ancestors.scroll3`). **Saray:** tacın sana bakışı
  (ilişki çubuğu ve kalemleri: bağlılık, hanedan bağları, dinlenme değeri, şu
  anki sapma ve saatlik geri dönüşü, ilişkiyi değiştirenler); tacın
  **lordları** puan çubuklarıyla ve her biriyle senin ilişkin, tıklayınca
  Diplomasi'de açılır; iki tacın lordları arasında süren savaş sayısı ve
  taçların hâli. **Politika:** aşağıdaki kart. İhanet teklifi açıksa (§9.1.1)
  iki sayfanın da en üstünde durur. Politika
  kartı: hükümdar ve başkent, seninle ilişkisi (çubuk), **politikaları**
  (lobi pazarından o an hangi malı dakikada kaç birim aldığı, yönettiği mal ve
  senin fiyat etkin, bu saatin siparişi ve ödediği, devriye mi haraççı mı
  gönderdiği; haraç payı ve bahşiş hükümdarın huyuyla) ve **senden istediği**
  görev (ilerleme çubuğu, ödül, kalan süre, "Görevi al" / "Ödülü al"). Ödülü
  bekleyen görev varsa sekmede kırmızı nokta yanar.
- **Taç paneli** (başkente tıklayınca): hükümdar, şehrin fiyatları,
  seninle ilişkisi (çubuk, dinlenme değeri, ilişkiyi değiştirenler ve
  armağan baremleri), **taçların gücü** (pasta grafik ve iki tacın lordları
  puan çubuklarıyla), **taçların pazarı** (hangi tacın hangi malı yönettiği,
  kalan süre ve senin fiyat etkin), bağlılık ve tüccar gönderme.
- **Kraliyet elçisinin istekleri** (`cities.json` → `crown.royal`; `crowns.ts` →
  `royalRequest`, `royalError`, `answerRoyal`; sunucuda `royal` komutu,
  `action`: `accept` / `decline` / `deliver`; arayüz
  `apps/web/src/ui/hud/RoyalRequests.tsx`): biat etmiş her lorda bağlı olduğu
  tacın kraliyet elçisi **saatte bir** (her lordun geliş anı lobi tohumu ve
  sarayının yerinden sabit) tek bir şey ister: cephanelikten bir silah (kılıç,
  kalkan, yay ve ok; yalnızca silah atölyesi olana, istek yarı yarıya silahtır)
  ya da depodan bir mal. Miktar o anki saray seviyesine ve silah atölyesi
  sayısına göredir (silah 20–95 + atölye başına 10, en fazla 150 ve
  cephaneliğin %80'i; mal 120–720, en fazla ambarın %60'ı; ×0,8–1,2) ve
  **1 saat** içinde teslim edilmelidir ("Hükümdarımız 100 kalkan istiyor;
  sınırda işler karışık. Yarına kadar yetişir mi?"). Elçi gelince pencere
  açılır: **"Elimden geleni yaparım"** (üstlen; miktar ve ödeme sabitlenir)
  ya da **"Bu sefer olmaz"** (taçla ilişki −2). İstek süresince ekranın
  solunda, "Süren işler"in üstündeki katlanır **Görevler** kutusunda durur
  (ikisi sohbet düğmesinin üstünde tek bir sütundur, `.side-stack`) (katlı hâli tarayıcıda hatırlanır): eldeki / istenen
  çubuğu, kalan süre, ödül ve stok yetince açılan **"Teslim et"**; alınmış
  taç görevleri de aynı kutuda ilerleme ve "Ödülü al" ile görünür. Teslimde
  mallar çıkar, taç **piyasa değerinin 1,3 katını** öder (mal: lobi fiyatı;
  silah: atölyede harcanan hammaddelerin lobi fiyatı), ama saray seviyesine
  göre en fazla 80 / 100 / 130 / 170 / 200 altın (hazineye sığdığı kadar);
  ilişki +4. Ödül bilerek küçüktür (yeni lordun saatlik gelirinin ~%5–9'u,
  gelişmişin ~%8'i): asıl kazanç tacın gözüdür. Süresi geçen istek teslim
  edilemez. Cevaplar `Kingdom.royal`'da bir gün tutulur; geliş, teslim ve
  yetişmeyen istek günlüğe yazılır, üstlenilen istek sayaçlarda da görünür.
- Başka etkileri (taç savaşları) sonra eklenecek.

### 7.9 Yağmacılar (şu an uygulanan)

Ticaret yollarında küçük **yağmacı çeteleri** dolaşır; tüccarın kazancından
pay keserler, halkı tedirgin ederler ve orduyla kovalanıp yenilebilirler.
Değerler `config/balance/outlaws.json` → `bands`, `road`; mantık
`packages/shared/src/outlaws.ts` (yerleşim, konum, takip) ve
`outlawPressure.ts` (lordun üstündeki etkiler); sunucu
`supabase/functions/_shared/outlaws.ts` (`lobby_outlaws` tablosu); arayüz
`apps/web/src/ui/hud/outlaws.tsx`.

- **Yer ve yürüyüş:** Lobi başına 9 çete (`count`). Her çete lobi
  tohumundan bir ticaret yolu karosunda (yol ya da köprü; taç
  başkentlerinin 44 karo yakınında değil, çeteler birbirinden en az 110
  karo uzak) doğar ve yolu izleyerek en çok **70 karoluk bir kesimi**
  tutar (`stretchTiles`; 24 karodan kısa kesim seçilmez). Kesim yalnızca **kuru
  karadaki yol karolarından** geçer: köprü ve suya giren ham yol karoları
  sayılmaz (istemci dere boyunca uzanan yolları kıyıdan dolaştırıp yeniden
  çizdiği için, `chunkPainter.ts` → `drawnRoads`), kesim suya vardığı yerde
  biter; çapraz adım ancak iki yanı da kuruysa atılır, çete suya köşe
  kesmez (`bun scripts/outlaw-water-check.ts`: çetelerin bütün yürüyüşü
  karada, korsanların bütün turu suda mı). Çete bu kesimde
  saniyede **0,45 karo** ile ileri geri yürür (ordular saniyede 1 karo:
  yağmacılar ordulardan yavaştır, yakalamak zor değildir). Konumları
  patrol gibi **saatten ve tohumdan** hesaplanır (`bandAt`, çizim için
  `bandLeg`); sunucu ve istemci aynı yeri bulur. Saklanan tek şey başına
  gelenlerdir: `lobby_outlaws` (`kind` `band`, `idx`): kaç kez yenildiği
  (`gen`), dağıtıldıysa ne zamana dek (`down_until`), şu an çarpıştığı
  muharebe (`battle`), çarpışmaların onu ne kadar bekletti (`shift`: çete
  savaştığı yerden yoluna devam eder) ve kazandığı çarpışmalarda düşenler
  (`losses`). Satırı olmayan çete hiç dokunulmamış, yolda demektir.
- **Baskınlar** (`bands.raid`; `outlaws.ts` → `bandClock`, `raidOf`, `bandNow`,
  `bandRaid`, `bandChangeAt`, `raidTargetsOf`): çeteler yalnızca yolda kalmaz.
  Her çetenin zamanı 30 dakikalık döngülerdir (`cycleSeconds`); döngünün
  yarısında (`awayShare`) kendi yolunu yürür, öbür yarısında %80 olasılıkla
  (`chance`) yoldan ayrılıp menzilindeki (kuş uçuşu 320 karo, `reachTiles`) bir
  lordun **ticaret noktasına baskına** iner: yolun ayrıldığı noktadan ticaret
  noktasının 10 karo önüne (`lurkTiles`) araziden yürür (`findRoute`, su ve
  dağdan dolanır; saniyede 0,9 karo, ordulardan yine yavaş), orada pusuda
  bekler (en az 2 dk) ve aynı yoldan geri döner. Kendi yolu zaten ticaret
  noktasının yakınından geçen lorda baskın yapmaz; menzilde lord yoksa, yol
  bulunamazsa ya da gidip dönmeye vakit yetmezse yolun kenarında kamp kurar.
  Yürüyüşün saati baskında durur, çete yürüyüşüne kaldığı yerden devam eder.
  Hedef lordların listesi (ticaret noktası olan her lord, kimliğe göre sıralı)
  sunucuda tick ve takip emrinde lordlardan (`outlawsIn(…, kingdoms)`),
  istemcide rakipler ve oyuncudan (`App.tsx` → `setRaidTargets`) kurulur; seçim
  lobi tohumu, çete ve döngüden çekilir, herkes aynı baskını görür. Çetenin
  penceresi baskındaysa kime gittiğini, pusuda mı döndüğünü yazar. Denetim:
  `bun scripts/raid-check.ts` (bir dünyada dokuz yol kenarı ticaret noktasıyla
  her lordun saatlik ortalama, en yüksek ve sıfır kalan payı).
- **Güç:** 6–14 kişi (tohumdan), her yenilip geri dönüşünde +1; %35'i
  okçu, gerisi mızrakçı; moral 55, saha bilgisi 70 (yolları bilirler).
- **Görünüm:** Haritada herkese görünür: yamalı kahverengi deri giysili
  askerler, **yırtık, is karası bir sancak** altında (`armies.ts` →
  `BANDIT_COLOR`); kişi sayısı kadar figür. Muharebedeyse muharebe
  noktasında durur, dağıtılmışsa görünmez. Üstünde korsan teknelerinin ve
  filoların etiketi gibi bir **etiket** durur ama tehditkâr: neredeyse kara
  zemin, kan kırmızısı kenar ve kırmızı yazı ("Uzun Yusuf çetesi ·
  yağmacı"; `armies.ts` → `mapTag`). Etiket her yakınlaştırmada görünür,
  büyük haritada çeteyi bulmak kolaydır; yalnızca en uzak yakınlaştırmada
  (⅛×) çeteler ve etiketleri gizlenir. Çeteler ve korsan tekneleri küçük
  haritada ve dünya haritasında gösterilmez.
- **Tuttukları yol:** Bir çete kesiminin 8 karo yakınındaki yol karolarını
  tutar (`holdTiles`). Bir lordun **ticaret noktasının 70 karo çevresindeki**
  yol karolarının ayaktaki çetelerce tutulan payı (`roadHeld`, 0–1), artı
  yakındaki her çetenin yakınlık payı (ticaret noktasına 14 karo ve daha yakınsa
  0,45, 45 karoda 0'a iner; `raid.pressure`, `nearTiles`, `farTiles`; baskına inen
  ya da yakından geçen çete) o lordun yağmacı payıdır (en fazla 1). Sunucu bunu her tick'te hesaplar ve değiştiğinde lordun
  durumuna yazar (`Kingdom.outlaws` → `road`, `bands`; `pressureOf`);
  `advance` oradan okur. Alanı olmayan eski kayıtlarda pay 0'dır.
- **Yeni lord** (sarayı 1. seviyede; `outlaws.json` → `newcomer`):
  yağmacıların ve korsanların payı ×0,1'dir (`pressureOf`; baskın da, yolu
  tutmak da neredeyse hissedilmez, elçinin "yolu tuttular" haberi ve baskın
  uyarısı gelmez). Baskın hedeflerinden çıkarılmaz: çıkarılsa çeteler öbür
  lordlara daha sık inerdi.
- **Etkileri** (`outlawEffects`): tüccarın her seferde getirdiği altının
  **yağmacı payı × %25**'ini keserler (yolun yarısı tutuluyorsa %12,5;
  `road.merchantCut`); kesilen altın defterde `books.outlaws` olarak yazar,
  Ticaret → Tüccar'daki **Yağmacılar** bölümünde ve "Sen yokken" mali
  raporunda görünür. Halkın mutluluk hedefi **yağmacı payı × 5** düşer
  (korsanlarla birlikte en fazla −8; `happinessCap`), Halk → Mutluluk'ta
  yazar.
- **Tıklayınca:** Çeteye tıklayınca yanda bir pencere açılır
  (`OutlawSheet`): adı ("Kara Yusuf çetesi"), yaklaşık büyüklüğü, ne yaptığı
  (tuttuğu kesim, hızı), senin ticaret noktanın çevresindeki yolun ne
  kadarını tuttuğu, yenince ganimeti ve **Takip et** bölümü: sahadaki her
  ordun seçilebilir bir kart olarak listelenir (adı "1. ordu", asker sayısı,
  uzaklığı, emrin elçiyle mi hemen mi gideceği, çeteye göre gücü). Tek ordu
  olsa bile **önce ordu seçilir**, sonra alttaki "N. orduyla takip et"
  düğmesi emri gönderir. Peşindeki ordu (ya da emri elçiyle yolda olan ordu)
  bölümün başında "1. ordu peşinde" / "1. ordu yola çıkacak · elçi N sn'de
  ulaşır" diye yazar; peşindekinin yanında **"Takibi bırak"** (ordu olduğu
  yerde durur, emir elçiyle gider) vardır. Zaten peşinde olan ya da emri
  yolda olan ordu yeniden seçilemez; sunucu da aynı çete için ikinci bir
  takip emrini reddeder (`chasing`: "Zaten peşinde (ya da emri yolda)"), elçi
  yolda gelen tekrar emri sessizce geçer; böylece "peşindesin" haberi bir kez
  gelir.
- **Takip** (`army` komutu, emir `{ kind: 'chase', band }`; ordu hedefi
  `chase`): emir öteki emirler gibi hudut içinde ya da kral ordunun
  başındayken anında, dışarıdaysa elçiyle gider (§8.2.1). Ordu, çetenin
  önünü keseceği noktaya yürür (`bandIntercept`: çetenin yolundaki ilk an
  ki orduya düz çizgi × 1,35 kadar yakın). Sunucu her tick'te ordunun ve
  çetenin geçen saniyelerdeki yerlerini karşılaştırır; **4 karoya
  yaklaştıkları an** muharebe başlar (tür `outlaw`, olağan zar turları,
  izlenebilir; çete bir anda tek orduyla çarpışır). Sunucu bunu ancak tick'te
  görürdü, ordu ile çete bir dakikaya kadar iç içe yürüyordu: istemci,
  takipteki kendi ordusunun çeteye 4 karo yaklaşacağı anı aynı saatlerden
  hesaplar ve sunucuyu o anda dürter (`settle`; zaten yakınsa en sık 10 sn'de
  bir; `App.tsx` → `chaseNudge`). Ordu varıp çeteyi
  bulamazsa yeniden önünü keser; **20 dakikada** yakalayamazsa takibi bırakır
  ve elçi haber getirir. Çete başkası tarafından dağıtılırsa takip biter.
- **Sonuç:** Kazanan ordu yerinde kalır; çete **45 dakika** dağılır
  (`respawnSeconds`), sonra aynı kesimde bir kişi kalabalık geri gelir.
  Ganimet çetenin savaş başındaki büyüklüğüyle orantılıdır: kişi başına
  **9 savaş malzemesi, 6 altın, 4 yapı malzemesi** (ambar ve hazine
  sınırına kadar; altını `books.outlawLoot`). Yenilen ordu her muharebedeki
  gibi eve çekilir; çete düşenleri kadar azalır, savaştığı yerden yoluna
  devam eder. Yağmacılarla çarpışma sıralamada zafer sayılmaz, kahırdan ölüm
  getirmez.
- **Hanlar:** Han paneli **"Yollardaki yağmacılar"** bölümünde hanın 70 karo
  çevresindeki ticaret yolunun yüzde kaçının yağmacıların elinde olduğunu
  (tam genişlikte bir satır, kaç çetenin tuttuğu ve altında bir çubuk) ve
  hangi çetelerin tuttuğunu yazar; söylentilerde de anlatılır (oyuncunun
  sarayı yakınsa "senin tüccarın da bu yollardan geçiyor" diye; göllerdeki
  korsan teknesi sayısı da).
- **Elçi:** Yağmacıların payı en az 15 puan artınca "Yağmacılar yolu tuttu!"
  (`outlaw_road`), sıfıra inince "Yollar temizlendi" (baskınlar yarım saatte bir
  gelip gittiği için ikisi birlikte en çok **2 saatte bir** söylenir;
  `road.noticeEveryMinutes`, `Kingdom.outlaws.roadTold`; korsanlarda aynısı,
  `sea.noticeEveryMinutes`, `seaTold`. Önce bir gün yokken onlarca aynı haber
  birikiyordu); takip başlayınca
  (`outlaw_chase`), çete yakalanınca ve muharebe bitince (`battle_start` /
  `battle_end`, tür `outlaw`; kazanınca ganimetle), çete kaçınca ya da
  ortadan kalkınca (`outlaw_escaped`, `outlaw_gone`). Çizimleri yağma
  sahnesidir (is karası saldırganlar; kovalanınca/temizlenince püskürtülmüş
  hâli), sesleri kılıç şakırtısı, gerilimli davul, zafer ya da hüzünlü
  borudur. Haritanın sağındaki uyarılarda "Yağmacılar ticaret yolunun %X'ini
  tutuyor" kartı (Ticaret sekmesini açar), küçük haritanın **Sıcak
  noktalar** düğmesinde ticaret noktanın yolunu tutan çeteler ve peşindeki
  orduların durur.

### 7.9.1 Yağmacı mağaraları ve klanlar (şu an uygulanan)

Çeteler başıboş değildir: her biri dağlarda bir **mağarada** yaşayan bir
**yağmacı klanına** bağlıdır. Değerler `config/balance/outlaws.json` →
`caves`, `clans`; mantık `packages/shared/src/caves.ts`; sunucu
`supabase/functions/_shared/caves.ts`; arayüz `apps/web/src/ui/hud/outlaws.tsx`
(`CaveSheet`, `ClanTrail`, `CaveSiege`); çizim `sprites.ts` → `caveMouth`,
`chunkPainter.ts` → `caveTiles`.

- **Mağaralar:** Lobi başına **18 mağara** (`caves.count`; önce 30'du, sayı düşünce listenin
  dışında kalan mağaradaki klan sunucuda boş bir mağaraya taşınır), lobi tohumundan
  (`caveSpots`; saklanmaz, sunucu ve istemci aynı yeri bulur). Her biri bir
  **dağ eteğinde**dir (yalnızca arazi ve yapıdan bulunur; sunucunun haritasında
  yükseklik yoktur): bir dağ karosu, önünde (ağzında)
  serbest bir kara karosu ve onun ardında bir kara karosu daha; ağız orduların
  yürüdüğü geniş karaya açılır (en az 4000 karoluk kara parçası), mağaralar
  birbirinden en az 70 karo, taç başkentlerinden 60 karo, harita kenarından 60
  karo uzaktır. Mağaralar yalnız **kameraya dönük** eteklerde açılır (ağız
  dağın sağ-altında ya da sol-altında; ekranın gerisine bakan bir ağız
  görünmezdi, önceki çizim onu dağın üstünde asılı gösteriyordu). Haritada
  binalar gibi bir **model** olarak çizilir (`caveSprites.ts`, `buildingKit`:
  sol üstten ışık, dither, piksel derinlik testi): ağız karosuna inen, dağın
  kendi kayasından alçak bir çıkıntı; haritanın çıplak kayasıyla aynı rampa ve
  aynı gölgeleme (düz yer zeminle aynı tonda, ışığa bakan yamaç açık, öbürü
  koyu, yükseklik eş eğrileri boyunca koyu katman çizgileri, teras teras
  basamaklar, dış çizgi yok), ucunda kaba bir kaya yüzü ve onun dibinde bir
  saçağın altına giren, içe doğru kararan bir oyuk; saçağın üstünde ve
  yanlarında kopmuş iri kayalar, önünde biraz koyulaşmış çiğnenmiş zemin ve
  çakıl. Model ağız karosunun ön köşesine oturur (iki karo: ağız karosu ve
  arkasındaki dağ karosu). Ağzın baktığı yöne göre iki yönde üçer çeşidi
  vardır. Mağaranın 2 karo çevresine sivri kaya, kaya kümesi, çakıl ya da ağaç
  konmaz (`chunkPainter.ts` → `caveTiles`, `CAVE_CLEAR`). Ordular ağzın
  içinde değil, **bir karo önünde** (`CaveSpot.front`) durur: mağaraya bakmak,
  kuşatmak ve bulunan mağaranın nöbetçileri oradadır. Haritadan "Hareket" ile
  mağaranın kayasına ya da modelin durduğu ağız karosuna gönderilen ordu da
  oraya gider (`caves.ts` → `caveOnTile`, sunucuda `applyOrder`); kayanın tepesine
  çıkmaz. Fare mağaranın üstüne gelince binalar gibi **dış hatla** vurgulanır
  (önündeki toprak ve çakıl dışarıda kalır), imleç karesi çıkmaz; tıklamak
  mağaranın penceresini açar (`createWorld.ts` → `caveHits`, `caveSprites.ts` →
  `caveLook`).
  Bu kural gelince (2026-10-18) mağaraların yeri değişti; sayı ve sıra aynı
  kaldığı için her klan aynı sıradaki mağarada kalır, yani yeni yerine taşınmış
  olur (bulunmuş mağaralar da onunla birlikte; yarım kalan izlerin ipuçları
  eski yeri anlatabilir).
  **Bütün mağaralar birbirine benzer:** klanın yaşadığı mağara dışarıdan
  ayırt edilmez; mağaraları bulmak zordur.
- **Klanlar:** Aynı anda **3 klan** (`clans.count`) vardır; çete `idx % 3`
  klanına bağlıdır (9 çetede klan başına 3). Her klanın tohumdan bir adı
  ("Kurtpençe klanı", yuva sırası ve kuşağından) vardır; çetenin haritadaki
  etiketi "Kara Yusuf çetesi · Kurtpençe klanı" yazar. Klanlar
  `lobby_outlaws`'ta `kind 'clan'` satırlarıdır (`idx` = yuva sırası): kuşağı
  (`gen`, kaç klanın yok edildiği), mağaraya yerleştiği an (`born_at`), süren
  kuşatma (`battle`), direndiği kuşatmalarda düşenler (`losses`), yıkılmış
  mağaralar (`fallen`: mağara, an, kim, klanın adı) ve yaşadığı mağara
  (`cave`). **`cave` sütununu yalnız sunucu okur** (lordlara sütun yetkisi
  verilmez); hangi mağarada kimin yaşadığı ancak izi sürülerek öğrenilir.
  Lobinin ilk klanları sunucunun ilk işleyişinde yerleşir (`ensureClans`):
  mağara tohum, yuva ve kuşaktan çekilir, başka bir klanın tuttuğu,
  yıkılmış ya da bir lordun son hududuna 24 karo / bir kasabaya 20 karo yakın
  mağara seçilmez (`pickCave`).
- **Büyüme (yaşayan dünya):** Mağarayı koruyanlar 16–24 kişiyle başlar,
  klan yerleştikçe her 20 dakikada +1 (en çok +16; `clanGarrison`), direndiği
  kuşatmalarda düşenler eksilir; mağaradaki **ganimet** 250 altın, 150 savaş
  malzemesi, 120 yapı malzemesi, 100 yemekle başlar ve klan yağmaladıkça saatte
  +40 / +25 / +20 / +20 büyür (en çok 8 saat; `clanHoard`).
- **İz sürmek:** Bir lordun ordusu bir klanın çetesini yendikçe yakalananlar
  konuşur (`followTrail`, lordun durumunda `caveTrail`, yalnız kendisi görür).
  İpuçları herkesin bildiği bir **yer işaretinden** anlatılır: sunucu, gizli
  mağaranın ağzına **en yakın** kasabayı, hanı, taç başkentini ya da lordun
  topraklarını (ortasından ölçülür; `nearestMark`, sunucuda `landmarks`) seçer
  ve izde yalnızca o işareti (tür, kimlik, adı, ortası; kendi toprakları
  `own`), yönü ve uzaklığı saklar; mağaranın kendisi bulunana kadar istemciye
  gitmez. Akış (`clans.discovery`):
  1. **1. zafer:** işaretten mağaraya **8 yönlü** yön ("Yağmacıların izi Akova
     kasabasının güneyindeki dağlara gidiyor"; yön ekrana göredir).
  2. **2. zafer:** yöne **aşağı yukarı uzaklık** eklenir (25 karoya yuvarlı,
     `farStep`): "Kavaklı Menzilhanesi'nin 50 karo kadar kuzeydoğusundaki dağ
     eteğine".
  3. **3. zafer:** mağara bulunur. **Casus evi** olan lord 2 zaferde bulur
     (`spyHouseWins`): onda ilk zafer yönü ve uzaklığı birlikte verir.
  Mağaralar birbirinden 70 karo uzak olduğu için erken ipucu birkaç mağaraya
  uyabilir; ipucu yol gösterir, yeri söylemez. Adlar istemcide kurulur
  (`apps/web/src/game/caveHints.ts` → `trailHint`, `markGenitive`: han ve başkent
  adı dünyadan, kasaba ve lord adı sunucunun yazdığından). Yer işaretinden önceki
  eski izler son savaş yerinden anlatılır ("kuzeydoğu yönündeki dağlar"). İz
  klanın kuşağına bağlıdır: klan yok olursa yeni klanın izi baştan sürülür.
  Elçi her adımda haber getirir (`cave_trail`, ipucu `mark`, `dir`, `far` ile)
  ve mağara bulununca "X mağarası bulundu!" (`cave_found`). Çetenin
  penceresinde klanın bölümü **"Bildiklerin: …"** ipucunu, izleri ("2 / 3") ve
  bulunduysa kuşatmayı gösterir; her mağaranın penceresinde de izi sürülen
  klanların ipuçları "Bildiklerin" bölümünde yazar.
- **Bulunan mağara:** Yalnız bulan lordun haritasında mağaranın ağzında
  klanın birkaç nöbetçisi "Kurtpençe klanı · mağara" etiketiyle durur ve
  **Sıcak noktalar** düğmesinde "X mağarası" olarak çıkar. Mağaraya (ya da
  nöbetçilere) tıklamak klanın mağara penceresini açar: klan, ona bağlı
  çeteler, koruyanların yaklaşık sayısı, ganimet ve **Mağarayı kuşat** (ordu
  seçilir, sonra gönderilir; orduyu "Hareket" ile nöbetçilerin üstüne
  göndermek de kuşatır). Bulunmamış bir mağaraya tıklamak yalnızca sıradan bir
  mağara anlatır (birkaç çeşit metin); yıkılmış bir mağara "Yağmacıların eski
  mağarası" olarak kimin aldığını yazar. Bu pencerelerde **Orduyu gönder**
  bölümü bir ordu seçip mağaranın ağzına sıradan bir yürüyüş emri (`move`)
  verir; pencere ordunun bakabileceğini ama iz sürülmeden büyük ihtimalle bir
  şey bulamayacağını söyler.
- **Mağaraya bakmak** (`outlaws.json` → `caves.probe`; sunucu `probeCaves`,
  tick'te ordular varınca): Bir lordun ordusu sıradan bir yürüyüşle (`move`)
  bir mağaranın ağzına ya da kayasına **2 karo** yakın durunca ve lord o
  mağaradaki klanı **bulmamışsa** (mağara boş da olabilir, bir klanın gizli
  yuvası da), ordu içine bakamaz: elçi "Ordu mağarayı inceleyemedi" haberini
  getirir (`cave_probe`) ve ordu ağızda bekler. Nedeni on çeşitten biridir ("Yol
  çok bozuktu…", "Mağara buz kesiyordu…", "Ağzı bir göçükle tıkalıydı…",
  "Meşaleler rutubetten söndü…", "Dar bir yarıktan öteye atlar ve yük
  geçemedi…"; `caves.ts` → `PROBE_REASONS`), lobi tohumu, mağara, ordu ve varış
  anından çekilir (`probeReason`). **Boş mağara ile klanın mağarası arasında hiçbir
  fark yoktur:** aynı sözler, aynı an, aynı alanlar (`army`, `cave`, `at`,
  `reason`). Aynı ordu aynı mağara için **saatte bir** haber alır
  (`cooldownMinutes`; sunucu son haberleri `notices` tablosunda arar, ayrıca bir
  şey saklanmaz). Lordun bulduğu mağaraya sıradan yürüyüşte haber gelmez (o
  mağara "Mağarayı kuşat" ile kuşatılır). Böylece mağaraları tek tek gezmek bir
  şey kazandırmaz; dolu mağarayı iz sürerek bilen lord doğrudan kuşatıp klanı
  kökünden kurutur. Haberin çizimi yol ayrımında kafası karışık ulak, sesi düşen
  ıslıktır.
- **Kuşatma:** Emir `army` komutuyla `{ kind: 'cave', slot }` (öteki emirler
  gibi elçiyle ya da hemen; sunucu lordun o kuşaktaki klanın mağarasını
  bildiğini denetler, yoksa `'cave'` hatası). Ordu mağaranın ağzına yürür
  (hedef `cave`), varınca sunucu (`settleCaves`) muharebeyi başlatır (tür
  `cave`, olağan zar turları, izlenebilir). Mağarayı aynı anda tek ordu
  kuşatır (öbürü sırasını bekler). Savunanlar kendi mağaralarındadır: moral
  70, saha bilgisi 100, %40 okçu ve zarlarına mancınıkların silemediği
  **+1,2** (`caveBonus`). Ordu vardığında klan çoktan yok edilmişse elçi
  "Mağara boş" der (`cave_empty`).
- **Sonuç:** Kazanılırsa klan **yok olur**: mağaradaki ganimet lordun
  ambarına ve hazinesine girer (sınıra kadar), lordun **Zafer** puanına mağara
  başına 100 eklenir (`record.cavesTaken`, `clans.scorePerCave`), klanın
  çeteleri yollardan **hemen dağılır**; ve **aynı anda yeni bir klan** başka
  bir mağarada (tutulmamış, yıkılmamış, lordlardan uzak) yeni bir adla doğar
  (`gen` +1, `born_at`). Yeni klanın çeteleri **10 dakika** sonra aynı yollara
  çıkar (`bandDelaySeconds`; `clanBandsUntil`, çetenin `downUntil`'ine
  eklenir). Bütün lordlara elçi haber getirir ("X klanı yok edildi; dağlarda
  yeni bir çete türedi: Y"; `clan_destroyed`), kazanan lord savaş sonu
  haberinde ganimeti ve yeni klanın adını okur. Kaybedilirse ordu eve çekilir,
  mağara düşenleri kadar zayıflar. Mağara kuşatması sıralamada muharebe
  zaferi sayılmaz, kahırdan ölüm getirmez.
- **Haberler:** Çizimleri kuşatma sahnesidir (is karası klan; alındı:
  sancak çekilir, direndi: kuşatanlar çekilir), iz haberleri yolda elçi
  sahnesi; sesleri gerilimli davul, zafer fanfarı ya da hüzünlü boru. Hepsi
  "Sen yokken" raporunun askeri sayfasında da durur.

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
- **Kral ordunun başında:** Ordu kartındaki "Kral komutayı alsın"
  hükümdarı orduya katar. Şartları: ordu **sarayın kapısının önünde**
  (3 karo içinde) durmalı, savaşta olmamalı; naipler konseyi değil yaşayan
  bir hükümdar, sarayda (kaçırılmamış) bir **kraliçe** ve en az bir **oğul**
  olmalı (reşit olması gerekmez); kral aynı anda tek orduya komuta eder.
  Kralın ordusuna emirler nerede olursa olsun **elçisiz, anında** gider.
  "Kral saraya dönsün" komutayı yalnızca ordu yine sarayın önündeyken
  bırakır; ordu eve dönüp garnizona katılınca ya da yok olunca kral
  kendiliğinden saraydadır. Ordu bölünürse kral asıl orduda kalır,
  birleşirse birleşen orduya geçer. Kral komutadayken savaş yeteneği zara
  genel etkinin yerine tam sayılır (§9.1). Haritada kralın ordusu herkese
  **altın, taçlı kraliyet sancağı** ve önde taçlı, mor pelerinli bir
  figürle görünür; savaş izleme sahnesinde kral sancağının yanında durur.
  Ordu kartında "Kral komutada · emirler anında" yazar. Sunucuda
  `armies.led_by` (kralın kişi kimliği; sahibi dışındakiler yalnızca
  `royal` görür), komut `{ type: 'king', army, action: 'lead' | 'leave' }`;
  değerler `dynasty.json` → `command`.
- **Hedefe yapışma:** Ordu "Hareket" ile gönderilirken fare bir lordun
  topraklarına, bir taç şehrine (dış suru dahil) ya da bir kasabaya 8
  karodan yakın gelince en yakını kendiliğinden seçilir: çevresi kesikli
  çizgiyle (lord kendi renginde, şehir tacın renginde, kasaba altın renginde)
  ve adıyla gösterilir; tıklayınca ordu oraya gider (lordda sarayına,
  kasabada kapısına; kasaba kuşatması yalnızca kasaba panelinden başlar). Kendi ordusunun 2,5 karo yakınındaki boş yere
  tıklamak o orduyu seçer (ordu sekmesi açılır).
- **Sağ tık ile emir** (fare): seçili kendi ordun varken haritada sağ
  tıklanan yere "Hareket" ile tıklamış gibi gider (hedefe yapışma ve elçi
  kuralları aynıdır; yapıştığı hedefin adı yerden yükselir). Seçili kendi
  filon varken sağ tık onu oraya yüzdürür ("Hareket et" gibi; karada "Gemiler
  yalnız suda yüzer", ulaşılamayan suda "Oraya su yolu yok"). Tıklanan yerde
  daralan halkalı kısa bir işaret belirir (ordu altın, filo mavi). Aynı anda
  ya bir ordu ya bir filo seçilidir; boş yere tıklamak ordunun seçimini
  kaldırır. Hiçbir şey seçili değilse sağ tık bir şey yapmaz; yerleştirme ya
  da yıkım/taşıma modunu kapatır, ordu nişanı ve filo yönlendirmesi sırasında
  sol tık gibidir (`App.tsx` → `rightTapRef`, `createWorld.ts` → `onRightTap`,
  `markMove`).
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
  Başkasının kasabasını kuşatmak sahibini kızdırır: kuşatma başlayınca sahibiyle
  ilişki bir kez **−15** düşer (`towns.json` → `siegeRelation`); elçinin kuşatma
  haberi bunu da yazar.
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
  yeteneği ekler ya da düşürür; hanedandan bir vali ya da kasabaya gelin giden bir
  prenses de ekler (§9.1.1). Kasabanın katkısı sadakatle çarpılır (%0'da ×0,5,
  %50'de ×1, %100'de ×1,5; kalabalık kasabanın köylüleri de).
  - **Ayaklanma:** Sadakat **25'in altına** inince kasaba ayaklanır: 10 dakika
    hiçbir şey göndermez (köylüleri de gider). Ayaklanma bittiğinde sadakat hâlâ
    25'in altındaysa ayaklanma sürer; **12'nin altındaysa kasaba lorddan kopar**:
    sahipsiz olur ve 3–6 askerlik küçük bir garnizonla kendini savunur. Lord
    ayaklanmayı ve kopuşu elçi haberiyle öğrenir (`town_revolt`,
    `town_lost_revolt`). Ayaklanma sadakat düşük kaldığı için uzayınca (yeni süre
    öncekinin bittiği anda başlar) yeniden haber verilmez; önce her 10 dakikada bir
    "X ayaklandı!" geliyordu. Sunucu, sadakati düşük kasabası olan lordların
    durumunu (çevrimdışıyken de) dakikada bir ilerletir, ayaklanmayı bir kez
    duyurur ve kopan kasabayı `lobby_towns`'ta sahipsiz yapar (lordun
    durumundaki `townsLost` listesinden; `supabase/functions/_shared/towns.ts`
    → `settleRevolts`).
  - **Asiler** (`towns.json` → `rebels`; `rebelCount`, `quellTown`; sunucuda
    `raiseRebels`, `syncRebels`, `startQuell`, `settleQuell`): ayaklanan kasabanın
    asileri kuşatma kurmuş gibi kapısının önünde toplanır: 4–10 asi (sadakat
    ayaklanma çizgisinin ne kadar altındaysa o kadar çok), `lobby_towns.rebels`
    (`count`, `since`, `battle`). Haritada kapının yanında siyah-gri bir bölük olarak
    herkese görünür; kasaba panelinin Durum bölümünde "Asiler kasabayı kuşatıyor"
    yazar, sağdaki uyarı kartlarında da çıkar. Lord ordusunu panelden gönderir
    ("Ayaklanmayı bastır" kapıdaysa, "Gönder ve bastır" uzaktaysa; emir `move` +
    `siege: true` kendi kasabasına): ordu kapıya varınca asilerle **muharebe**
    olur (tür `revolt`; olağan zar turları, asiler kendi topraklarını bilen
    mızrakçılardır: moral 55, saha bilgisi 60; izlenebilir). Kazanırsa ayaklanma
    biter, sadakat **+10** artar ve kasaba **30 dakika** yeniden ayaklanmaz
    (`quietUntil`; sadakat düşük kalsa da). Yenilirse ordu eve çekilir, asiler
    düşen kadar azalır ve kapıda kalır. Asiler yenilmezse eski kural sürer;
    kasaba koparsa asiler onun garnizonu olur. Ayaklanma kendiliğinden biterse
    asiler dağılır. Asilerle çarpışma sıralamada zafer sayılmaz.
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
- **Kasaba pazarı** (`towns.json` → `market`; `townStock`, `townUnitPrice`,
  `townBuyError`; sunucuda `townBuy` komutu): her kasaba kendi malını satar
  (tarım ve kalabalık kasaba yemek, kereste yapı malzemesi, demirci ve vergi
  kasabası savaş malzemesi). Stok en çok 400 birimdir ve tur başına 0,8 (saatte
  ~290) yenilenir; son satıştan kalan ve anı saklanır (`market_stock`,
  `market_at`), aradaki zamandan hesaplanır. Birim fiyatı pazar binasının
  fiyatının (lobi × 1,4) %80'i = **lobi × 1,12**, alıcının kasaba sahibiyle
  ilişkisine göre çarpılır (−100'de ×1,5, 0'da ×1, +100'de ×0,9) ve hiçbir zaman
  **lobi × 1,05**'in altına inmez: buradan alınan mal lobi pazarında kârla
  satılamaz. Sahibin kendisi ve sahipsiz kasaba ×1'dir. Herkes alabilir, ama
  **askerle**: alıcının bir ordusu kasabanın kapısında (3 karo) durmalıdır;
  ayaklanma ya da kuşatma sürerken pazar kapalıdır. Kasaba panelinin **Pazar**
  bölümünde miktar seçilir (stok, hazine ve ordunun yükü sınırlar: asker başına
  12 birim; ordunun satırı, miktar düğmeleri ve satın al düğmesi alt alta,
  tam genişlikte durur). Altın hemen ödenir ve sahibin hazinesine girer (sığmayan boşa
  gider; defterde `townSales`); sahip "Kasabadan iyi haber" diye kimin ne kadar
  aldığını öğrenir (`town_sale`). Sahipsiz kasabada ya da kendi kasabasından
  alanın altını kimseye gitmez. Mallar orduya yüklenir (`armies.cargo`, yalnız
  sahibi görür; ordu kartında "Yük") ve ordu **saraya girince** ambara eklenir
  (ambar sınırı, sığmayan boşa gider; `cargo_home`). Muharebede yenilen ordu
  yükünü kaybeder (`cargo_lost`). Altın basılmaz: alıcıdan sahibe geçer; bir
  kasaba sahibine saatte en çok ~290 × fiyat (savaş malzemesinde ~130 altın)
  kazandırır.
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
  nehirde gemi nehrin yönüne döner, iskeleye, köprülere ve başka gemilere
  binmez; yer yoksa çizilmez. Balık ve korsan avındaki filonun durakları ve
  ticaret seferinin dönüm noktası köprü dibine düşmez; seyri biten filonun
  arkadaki gemileri bir köprünün altına denk gelirse köprüden önce durur. **Gemiye tıklamak** kendi gemindeyse Ordu → Donanma'yı
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
  bağlanabilir. Limana bağlamak ve deniz ticaretine çıkmak için filo
  iskelenin yakınında olmalıdır: "Hareket et" ile uzağa yüzdürülmüş (ya da hâlâ
  yolda olan) filo iskeleye 8 karodan uzaksa önce geri yüzdürülür
  (`navy.ts` → `offDock`, `navy.json` → `dockReachTiles`; hata `offDock`).
  Önce görevi "limanda bekle" olan filo nerede olursa olsun evde sayılıyor,
  "Limana bağla" onu yol süresi olmadan ışınlıyordu. Limandaki gemiler ve limanda bekleyen filolar iskeleyi savunur.
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
- **Deniz muharebesi** (`navalBattle`): iki taraf gücünün (gemilerinin toplam
  gücü: kadırga 3, koka 0,6, çektiri 1,8; filo kartında "güç") üstüne zar atar
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
  Seferler, saldırılar, av ve dönüşler günlükte yazar. **Batan gemi** ayrıca
  elçiyle haber olur (`ship_lost`: deniz ticaretinde korsanlara ya da korsan
  avında; sunucu durumu ilerletirken `advance` olaylarından bir kez üretir,
  `server.ts` → `tellEvents`). Önce son gemisini kaybeden oyuncuya hiçbir pencere
  açılmıyordu.
- **Korsan kayıkları** (yağmacılarla aynı düzen, §7.9; `outlaws.json` →
  `boats`, `sea`): lobi başına 7 kara yelkenli korsan teknesi göllerde ve
  nehirlerde dolaşır. Her biri tohumdan, en az 500 karoluk bir suyun açık
  bir yerinde (kıyıdan en az 2 karo; taç limanlarından uzak, tekneler
  birbirinden en az 90 karo) doğar ve 28–60 karo ötedeki açık suya gidip
  dönen bir halkayı saniyede **1,1 karo** ile döner (filolar saniyede 2
  karo: korsanlar daha yavaştır). Her teknede 1–3 korsan gemisi vardır
  (savaşta **çektiri** sayılırlar: güç 1,8; kokaları yener, kadırgalara
  yenilir). Konum saatten hesaplanır (`boatAt`), haritada herkese görünür
  (`shipSprites.ts` → `pirate`: is karası latin yelkenli, kan kırmızısı
  flamalı küçük çektiriler; etiketinde adı, "Kara Martı · korsan"; küçük
  haritada ve dünya haritasında yağmacılar gibi kara sancakla). Batırılan
  tekne `lobby_outlaws`'ta (`kind` `boat`) 45 dakika yok sayılır.
  - **Etkisi** (`seaHeld`, `Kingdom.outlaws` → `sea`, `boats`): halkası bir
    lordun **iskelesinin 45 karo yakınından** geçen her ayaktaki tekne
    korsan etkisine %40 ekler (en fazla %100). Etki: deniz ticaretinde korsan
    saldırısı olasılığı **× (1 + etki × 0,6)**, iskelenin ve balıkçı
    filolarının avı **−etki × %25**, halkın mutluluk hedefi **−etki × 4**
    (yağmacılarla birlikte en fazla −8). "Korsanların ticarete etkisi"
    Donanma → Filolar'daki **Korsanlar** bölümünde, iskelenin ve tersanenin
    menüsünde ve Halk → Mutluluk'ta yazar.
  - **Takip** (`fleet` komutu, `chase` eylemi; `chaseBoat`): tekneye
    tıklayınca açılan pencerede her filo seçilebilir bir kart olarak, gemileri,
    gücü ("güç 4,8 / 3,6"), uzaklığı ve gidemiyorsa nedeniyle listelenir; tek
    filo olsa bile önce filo seçilir, sonra **"N. filoyla takip et"** filoyu
    teknenin önünü keseceği
    açık suya yüzdürür (elçisiz; filo evde ve ticarette olmamalı, en az bir
    savaş gemisi olmalı, aynı suda olmalı). `Fleet.chase` (`boat`, `since`)
    saklanır; elle "Hareket et" ya da "Takibi bırak" (`unchase`) takibi
    bitirir. Peşindeki filo pencerenin başında "1. filo peşinde" diye
    "Takibi bırak" düğmesiyle yazar; aynı tekneyi zaten kovalayan filoya
    sunucu yeni takip vermez (`chasing`). Sunucu her tick'te filonun ve teknenin yerlerini karşılaştırır;
    **3,5 karoya** yaklaşınca **deniz savaşı** olur: `navalBattle`, iki tarafın
    gücü **gemilerin toplam gücüdür** (kadırga 3, koka 0,6, çektiri 1,8;
    üstün türe +%25; korsanlar kendi limanında değildir). Kazanırsa tekne
    batar ve ödülü gelir: **60 + 25 × gemi altın**, gemi başına 20 savaş ve
    30 yapı malzemesi (sınırlara kadar; altın `books.outlawLoot` ve donanma
    defterinin ödüllerine); yenilirse filo gemi kaybeder, korsanlar
    dolaşmaya devam eder. Filo yetişemezse yeniden önünü keser; 15 dakikada
    yakalayamazsa takibi bırakır.
  - **Elçi:** korsan etkisi en az 35 puan artınca "Korsanlar sularında!"
    (`pirate_waters`), sıfıra inince "Sular temizlendi"; deniz savaşı
    (`pirate_battle`: iki tarafın gücü, zarlar, kayıplar, ödül), tekne
    kaçınca ya da batırılmış bulununca (`pirate_escaped`, `pirate_gone`).
    Çizimleri deniz sahnesidir (abluka sırası, çarpışma, sakin gün batımı;
    korsanlar is karası), sesleri abluka borusu, zafer ya da hüzünlü boru.
    Haritanın sağında "Korsanlar iskelenin önünde" kartı, Sıcak noktalarda
    iskelenin yakınındaki ve peşindeki tekneler durur.
- **Korsan limanları** (`outlaws.json` → `havens`; `outlaws.ts` →
  `havenSpots`, `havensOf`, `havenPop`, `havenStrength`, `havenGuards`;
  sunucu `_shared/outlaws.ts` → `settleHavens`, `havenStrike`, `setHavenHold`;
  çizim `game/havens.ts`, pencere `outlaws.tsx` → `HavenSheet`): lobi başına 2
  korsan limanı, en az 2500 karoluk bir suyun (büyük göl ya da geniş nehir)
  kıyısında, açık suya bakan kuru bir karoda (taç başkentlerinden 120,
  harita kenarından 90 karo, birbirinden 260 karo uzak; tohumdan, saklanmaz).
  Haritada kıyıda bir gözcü kulesi, kulübeler ve barakalar, önündeki suda
  nüfusu kadar (en çok 3) demirli kara yelkenli çektiri durur; ilk geminin
  etiketinde limanın adı ("Martı Kaya korsan limanı") ya da onu kimin abluka
  ettiği yazar. Gemilere ya da kulübelere tıklamak limanın penceresini açar;
  üstüne gelince yapılar ve gemiler dış hatla vurgulanır.
  - **Nüfus:** en çok 60 korsan; abluka yokken saatte 10 kişi geri gelir,
    abluka altındayken saatte 36 kişi azalır (`havenPop`; saklanan yalnız son
    nüfus ve anıdır, `lobby_outlaws` → `pop`, `pop_at`, `held`). Satırı olmayan
    liman doludur.
  - **Etki:** iki limanın toplam nüfusu korsanların gücünü belirler
    (`havenStrength`: dolu limanlarda 1, boşaldıkça en az 0,35; korsanlar
    limansız da dolaşır). Her lordun korsan etkisi (`seaHeld`) bununla
    çarpılır: deniz ticaretine saldırı, balık kaybı ve halkın tedirginliği
    birlikte azalır.
  - **Abluka** (filo görevi `haven`; `fleet` komutu `mission`, `{ kind:
    'haven', haven }`): penceredeki **Ablukaya al** bölümünde (tersane
    gerekir) filo seçilir, filo limanın önündeki açık suya seyreder (yolu
    `sail` olarak saklanır, haritada görünür; varış seyrin bitişidir). Varınca
    limanı koruyan çektirilerle deniz savaşı olur (nüfusun her 12 kişisine
    bir çektiri, en az 1; savunan kendi limanındadır). Kazanırsa filo limanın
    önünde demirler ve abluka başlar (`mission.resolved`, satırda `held`),
    muhafızların ganimeti gelir (80 + 25 × gemi altın, gemi başına 20 savaş ve
    30 yapı malzemesi). Kaybederse kalanlarıyla eve döner. Aynı anda limanı tek
    filo abluka eder; başkasının ablukasındaki limana varan filo döner
    (`haven_turned`). Filo geri çağrılınca (penceredeki "Ablukayı kaldır" ya
    da Donanma'daki geri çağır) abluka hemen kalkar ve liman yeniden dolmaya
    başlar; filo yok olursa sunucu ablukayı kaldırır. Liman boşalınca
    ablukacıya bir kez haber gelir (`haven_empty`).
  - **Elçi:** liman savaşı (`haven_battle`, kazanınca ganimet ve nüfus), dönen
    filo, boşalan liman; öğütlerde liman doluyken ablukaya almayı önerir.
- **Hareket et** (`seaways.ts`; sunucuda `fleet` komutu, `sail` eylemi):
  evdeki bir filo (ticarette değilse) ordu gibi haritada bir yere
  gönderilir: "Hareket et" deyip bir nehre ya da göle tıklanır. **Karaya
  tıklanamaz** ("Gemiler yalnız suda yüzer"), aynı suya bağlı olmayan yere
  gidilemez ("Oraya su yolu yok"). Yol karo karo su üstünde aranır (A*,
  karadan köşe kesmeden). Gemiler **suyun ortasından** gider: kıyıya yakın
  karo pahalıdır (karaya 1 / 2 / 3 karo uzaklıkta adım +%150 / +%60 / +%20;
  `navy.json` → `sail.shorePenalty`, `shoreClearance`), dar nehirde her karo
  aynı pahada olduğu için yine geçilir. Sonra yol suyun izin verdiği yerde
  düzleştirilir, ama düz çizgi kestiği karolardan kıyıya daha yakın geçemez
  (uçlarına bir buçuk karo kalana dek); yol ortadan birkaç yüzde uzar, süre
  yine yolun boyundan hesaplanır (düzleştirme bir noktadan en çok 80 karo
  ileriye bakar; uzun bir seyir böylece ~1 sn yerine ~0,1 sn'de bulunur);
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
  **çocuklar**. Kişiler yaşlanır: **1 hanedan yılı = 1 gerçek saat**,
  takvimin yılıyla aynıdır (§2; `clock.ts` → `yearMs`, tek kaynak
  `time.json` → `gameDayMs`; sezon 336 yıl). Çocuk 16 saatte reşit olur,
  hükümdar 58–80 yaşında ölür. İlk hükümdar 26–38, kraliçe 19–28 yaşında gelir.
  **Eski yıllardan geçiş:** Hanedan, tarihlerinin hangi yıl uzunluğuyla
  yazıldığını saklar (`Dynasty.yearMs`; yoksa eski 6 saatlik yıl,
  `dynasty.json` → `legacyYear`). Eski bir hanedan ilk ilerletildiği anda
  yeni yıllara çevrilir: herkes o anki yaşını korur, bundan sonra yeni
  yıllarla yaşlanır; gelecekteki ölüm ve doğum o kadar yeni yıl sonraya
  düşer. Ölüm yaşını çoktan geçmiş biri varsa `graceHours` (2 saat) daha
  yaşar; hiçbir lordluk yıl değişir değişmez hükümdarını kaybetmez. Kahırdan
  ölüm zamanını korur.
  Ölüm nedeni tek yerden yazılır (`dynasty.tsx` → `deathOf`): nedeni
  olmayan ya da "yaşlılık" yazılı eski kayıtlarda ölüm yaşı en küçük
  ölüm yaşının (58) altındaysa "hastalıktan" öldü yazar; 28 yaşında
  prens yaşlılıktan ölmez.
  Saray sekmesinin **Hanedan** bölümü hanedanı **hükümdara göre** gösterir:
  **Ebeveynler** (ölü babası, yaşıyorsa kraliçe ana), hükümdar ve kraliçesi,
  **Kardeşler** (babasının öbür çocukları), **Çocuklar** (hükümdarın kendi
  çocukları), **Akrabalar** (amcalar, halalar, yeğenler), **Evlendirilenler**,
  **Gelinler** ve **Atalar ve ölenler**; portreler, yaşlar, yetenekler, görevler
  ve reşit erkeklerin hükümdara bakışı (§9.1.1). Başlıklar cinsiyete göredir:
  oğullar ve kardeşler **Prens**, kızlar ve kız kardeşler **Prenses**
  (`dynasty.tsx` → `titleOf`).
- **Hanedanın düzeni** (`Dynasty.siblings`, `kin`, `mother`, `married`,
  `brides`; `rev` 2): hükümdar ölüp oğlu geçince ölen hükümdarın öbür çocukları
  yeni hükümdarın **kardeşleri** olur, ölenin kardeşleri **akraba**, kraliçesi
  **kraliçe ana**; yeni hükümdarın çocukları ayrıca "Çocuklar"da durur. Eski
  kayıtlarda bütün çocuklar tek listedeydi: ilk ilerletmede hükümdar reşit
  olmadan (kendi çocuğu olamadan) doğmuş olanlar kardeşlere taşınır
  (`normalizeHouse`). Hükümdardan başka herkes de (çocuklar, kardeşler,
  akrabalar, kraliçe ana) doğumda çekilen yaşta ölür; "Hanedandan bir ölüm"
  diye duyurulur (`Person.ruled` false; eski ölüler hükümdar sayılır).
- **Saray sekmesinin bölümleri:** Saray sekmesi üç alt sekmeye ayrılır:
  **Seviye** (saray kartı, hudut ve saray yükseltme, iskele, Bağlılık),
  **Hanedan**, **Seferler**, **Hedefler**, **Projeler** (büyük işler,
  şenlik, taca bağış; §9.10) ve **Yapılar** (kurulu / sınır listesi; başlıkta ve her yapının
  altında kaç tanesinin bir üst seviyeye çıkabileceği, kaçının şu an hemen
  yükseltilebileceği); hepsinin altında
  **Lordluğu sıfırla** durur ("her şey en baştan başlar" açıklamasıyla). Önce
  düğme "Emin misin?" diye sorar, sonra elçi "Emin misiniz, lordum?"
  penceresiyle son kez sorar; ancak orada "Evet, her şeyi sıfırla" denince
  sıfırlanır (ordular, casus görevleri, anlaşmalar ve eski lorda bekleyen taç
  haraç istekleri de düşer). Ayarlar ve ana menü Saray sekmesinde değil, köşedeki menüdedir. Son açılan alt sekme tarayıcıda hatırlanır
  (`tabs.tsx` → `showPalacePart`). Adı konmamış ya da eğitimi seçilmemiş
  reşit olmayan bir çocuk varsa Hanedan sekmesinde kırmızı bir nokta yanar.
- **Yetenekler** (0–10): **Maliye** (vergi ±%3, ticaret geliri ±%2 / puan),
  **Halk** (mutluluk ±1,2, iş gücü ±%1,5 / puan), **Askerlik** (savaş zarı
  ±0,12, asker maaşı ∓%2 / puan); 5 ortadır. Kral bir orduya bizzat
  komuta ederken (§8.2.1) o ordunun zarına genel etki yerine **+0,3 +
  (kralın kendi savaş yeteneği − 5) × 0,3** eklenir (kraliçenin payı
  sayılmaz; 10'da +1,8, 0'da −1,2). Kraliçenin yeteneklerinin
  ortadan farkının yarısı hükümdarınkine eklenir.
- **Kraliçe ve doğumlar:** Kraliçe alınınca (Halk sekmesi) hanedana katılır
  ("Kraliçe saraya geldi"). Kraliçe saraydayken (kaçırılmamışken) ilk çocuk
  0,4–1 yıl içinde, sonrakiler 1,2–2,5 yılda bir doğar, kraliçe 44 yaşına
  kadar. Bir çiftin **en çok iki çocuğu** olur; kraliçe gelince ailenin
  planı tohumdan çekilir (`births.plans`, `Dynasty.plan`): **iki oğul**
  (%45), **tek oğul** (%25) ya da **bir oğul ve bir kız** (%30); iki kız
  olmaz. Her doğumda %55 oğlan çekilir, plan o cinsten çocuk bırakmamışsa öbürü
  doğar (`birthsLeft`); ilk çocuk kız da olabilir. Eski
  kayıtlarda plan ilk ilerletmede çekilir (`Dynasty.rev` 3). Doğan çocuğun babası ve annesi
  (`father`, `mother`) saklanır. Çocuğun yetenekleri %60 anne-baba
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
  "Rastgele" düğmesi kişinin cinsiyetine göre bir ad önerir: eski adlardan
  biri ya da iki yarıdan kurulan bir ad (Alptekin, Gülbike…; `dynasty.json` →
  `names`, `nameParts`; `randomName`); hanedanda (yaşayan, evlenen, ölen)
  taşınan adlar atlanır (`houseNames`). Doğum pencereleri art arda gelince ad
  kutusu bir önceki çocuğun adını taşıyordu (pencere yeniden kullanılıyordu,
  bütün çocuklar aynı adı alıyordu); her pencere ve ad kutusu artık kendi
  kişisinindir.
- **Ad ve eğitim:** Doğumda bir haber penceresi açılır; çocuğa ad
  konur (koyulmazsa çekilen ad kalır; sonradan çocuğun kartındaki "Adını
  koy" ile konabilir). **Ad yalnızca bir kez konur:** lordun ad koyduğu
  çocuğun (`named`) adı değiştirilemez; hükümdarın ve kraliçenin adı da
  değiştirilemez, geldikleri adı taşırlar (sunucu `nameError` → `'named'`
  ile reddeder). Hükümdar yaşarken reşit olmamış her çocuğun (yeni doğan
  bebek dahil) eğitimi seçilir (Maliye, Halk, Askerlik; seçilen düğme
  yanar, seçilmemişse kartta yazar); çocuk 16 yaşında reşit olunca o
  yetenek +3 artar. Reşit olmayan kardeşlerin adı ve eğitimi de böyle seçilir.
- **Ölüm ve tahta geçiş:** Hükümdarın ölüm yaşı doğumunda 58–80 arasında
  çekilir. Ayrıca tarafının kaybettiği her muharebede %5 ihtimalle
  kahrından ölür (sunucu, muharebenin ve lordluğun tohumuyla). Kral
  komuta ettiği ordunun kaybettiği muharebede bunun yerine **%15**
  ihtimalle savaşta düşer (`dynasty.json` → `command.fall`); ordu onsuz
  devam eder, tahta geçiş kuralları işler ve savaştaki bütün taraflara
  elçi haber getirir (`king_fell`). Yerine en
  büyük oğlu geçer; oğlu reşit değilse **naipler konseyi** yönetir
  (yetenekler 4/3/4), oğul reşit olunca tahta çıkar. Hiç oğlu yoksa **en
  büyük reşit erkek kardeşi** geçer (`succession.brotherInherits`; ölenin
  çocukları yeğen olarak akrabalara geçer, kraliçesi saraydan ayrılır).
  Ne oğlu ne reşit kardeşi varsa konsey 3 yıl (`dynasty.json` →
  `council.kinsmanYears`) yönetir, sonra
  hanedandan bir **akraba** (26–38 yaşında, yeni yetenekler) tahta çağrılır
  (`Dynasty.kinsmanAt`); hanedan bitmez, yeni hükümdar kendi kraliçesini alır. Eski kraliçe
  kraliçe ana olur: yeni hükümdar kendi kraliçesini almalıdır.
- **Kardeşler orta yaşta ölür:** Tahta geçmeyen kardeşler (hükümdarın kardeşleri)
  bir hastalıktan ölür: 34–46 yaşında, kardeş olduklarında bu
  yaşı geçmişlerse 8–16 yıl içinde (`siblingFate`; `cause: 'sickness'`).
  Kardeşlerden biri tahta çıkarsa doğumda çekilen ömrüne döner (`fullLife`).
  (Önce 18–30 yaşında ya da 0,5–3 yıl içinde ölüyorlardı: kardeş taht davacısı
  olacak kadar yaşamıyordu, isyan sim testlerinde hiç görülmedi.)
- **Salgın hanedanı ve halkı öldürür** (`dynasty.json` → `sickness`;
  `sicknessStrikes`, `economy.ts` üretim turu): **her salgında bir kez**
  zar atılır: %12 × (salgının payı / %5,5) olasılıkla hanedandan biri
  (hükümdar, çocuklar, kardeşler, akrabalar, kraliçe ana; kraliçe değil)
  hastalıktan ölür; şifahanenin her seviyesi olasılığı %25 düşürür
  (`royalPerOutbreak`, `typicalShare`, `hospitalCutPerLevel`). Sezonda lord
  başına ~100 salgından şifahanesiz ~12, 3. seviye şifahaneyle ~3 hanedan
  ölümü çıkar. (Önce her tur pay × 0,001'di: salgın başına ~%0,14, kural
  pratikte ölüydü.) **Hanedandan biri her zaman hayatta kalır:** ölüm, kanı
  taşıyan son kişiyi (hükümdar, çocuklar, kardeşler, akrabalar) seçmez.
  **Ardılı olmayan hükümdar** (heirOf boş) hastalıktan
  ölmez (zaten ordunun başına da geçemez). Hastaların küçük bir payı da ölür:
  tur başına köylü × hasta payı × 0,0006 (100 köylü, %10 hasta: saatte ~2).
- **Kraliçe tek başına** (`Dynasty.regnant`): hükümdar ölür, ne oğlu ne reşit
  kardeşi kalmaz ama kraliçe saraydaysa (kaçırılmamışsa) lordluğu **kraliçe
  yönetir**, kendi yetenekleriyle (naip yok, `rulerSkills`). Onu
  **evlendirmek şarttır**: elçi bunu bir pencereyle haber verir ("Kraliçe tek
  başına"; "Kraliçeyi evlendir" / "Sonra"), Saray → Hanedan'da da aynı düğme
  durur (`house` komutu, `wedQueen`). Lord evlendirmezse konsey 3 yıl sonra
  (`kinsmanAt`) kendisi bir eş bulur. Eş hanedandan 26–38 yaşında bir beydir,
  tahta çıkar; kraliçe onun kraliçesi olur, yeni bir aile planı çekilir.
  Kraliçe evlenmeden ölürse naipler yönetir, 3 yıl sonra bir akraba çağrılır.
- **Haberler:** doğum, reşit olma (çocuklar ve kardeşler), ölüm, hanedandan
  birinin ölümü, tahta çıkış, naipler konseyi ve kraliçenin gelişi, oyundaki
  olay pencereleri gibi çizimli birer pencereyle duyurulur. **Bir anda birden çok
  haber** birikmişse (lord bir süre yoktu) hepsi **tek bir pencerede**
  ("Sen yokken hanedanda olanlar") en önemlisi başta sıralanır, resmi en
  önemlisinin resmidir (`dynasty.tsx` → `HouseDigest`); yalnızca cevap isteyen
  "Kraliçe tek başına" ayrı pencerede kalır, adı konmamış çocuklar Saray →
  Hanedan'dan adlandırılır. Haberler hanedanın
  o anki hâlinden çıkarılır ve tarayıcıda hatırlanır (sunucu olayı önce işlese
  de duyurulur); "Sen yokken" raporunda da bir Hanedan sayfası vardır.
  Entrikanın haberleri (§9.1.1) elçinin pencereleriyle gelir.

### 9.1.1 Entrika: görevler, evlilikler, bakışlar ve taht davacıları (şu an uygulanan)

Değerler `config/balance/dynasty.json` → `intrigue`; mantık
`packages/shared/src/intrigue.ts` (görevlerin etkileri `dynasty.ts` →
`townKinBonus`, `houseCrownRest`, `patrolFavour`, `treasurerTax`); sunucuda
`supabase/functions/_shared/house.ts` (tick'te `settleHouses`) ve `command` →
`house` komutu (`action`: `role` / `gift` / `marry` / `aid`); arayüz
`apps/web/src/ui/hud/dynasty.tsx`, karargâh çizimi
`apps/web/src/game/pretenderCamp.ts`.

- **Bakışlar** (yalnızca reşit erkekler: oğullar, kardeşler, akrabalar):
  her birinin hükümdara bir bakışı (−100…100) ve bağlı olunan tacın ona bir
  bakışı vardır. Bakış, durumdan anında hesaplanan bir **dinlenme değeri** ile
  zamanla sönen bir **sapmadan** oluşur (`Person.op`: sapma ve anı; yarı ömür
  60 dk; saklanan tek şey sapmadır, gerisi `f(zaman)`). Dinlenme değeri:
  yakınlık (oğul +20, kardeş −5, akraba 0), hükümdarın yeteneklerinin
  ortalaması (5'ten her puan ±3; konsey de sayılır), halkın mutluluğu (50'den
  her puan ±0,2), kişinin **hırsı** (tohumdan ±10, askerlik 6'nın üstünde her
  puan −2 daha), görevi varsa +15, hükümdardan büyük kardeşse −15 ("tahtta
  gözü var"), naipler yönetiyorsa kardeşlere −10, kraliçe ana yaşıyorsa
  kardeşlere +5. Sapmayı değiştirenler: hediye (+15), görevden alınma (−20),
  yeni hükümdar tahta çıkınca kardeşlerine (−10). Tacın bakışı: askerlik
  yeteneği (5'ten her puan ±2), tacın devriyesini yönetiyorsa +35, hanedandan
  taca gelin gitmiş her prenses +5. Kartta bakış bir çubuk ve tek kelimeyle
  (sadık ≥40, iyi ≥10, mesafeli ≥−15, hoşnutsuz ≥−35, düşman) ve bütün
  kalemleriyle yazar; taç onu lorddan çok seviyorsa kırmızı uyarı çıkar.
- **Hoşnutsuzluk haberi:** bir oğul ya da kardeşin bakışı −15'in altına
  inince elçi bir kez haber getirir (`kin_unhappy`; kişi `warned`), −5'in
  üstüne çıkınca uyarı sıfırlanır. Elçinin danışmanlığı da hoşnutsuz kardeşi,
  evlenme çağındaki prensesi ve karargâhı hatırlatır.
- **Hediye:** reşit bir erkeğe 100 altın; bakış +15 (sönerek), kişi başına 20
  dakikada bir.
- **Görevler** (en az 18 yaşında oğul, kız, kardeş ya da kız kardeşe; kişi
  başına bir görev, her görevde bir kişi, "Görevden al" ile kaldırılır):
  - **Vali** (elindeki bir kasabaya): kasabanın sadakat hedefi +6 + (halk
    yeteneği − 5) × 1,5 (en az 0); kasabanın paneli bunu "Hanedan" kalemiyle
    yazar. Kasaba elden çıkarsa görev boşa düşer (kartta yazar).
  - **Devriye komutanı** (bir prens; biat etmiş olmalı): tacın devriyesinin
    bahşişi ×(1,2 + (askerlik − 5) × 0,04), her uğrayışta taçla ilişki +1
    fazla, taçla ilişkinin dinlenme değeri +5. Bedeli: taç onu da çok sever
    (+35), isyan ederse onu destekleyebilir.
  - **Hazinedar:** vergi +(maliye − 4) × %1.
  Görev verilen sevinir (+15 dinlenme), görevden alınan gücenir.
- **Prensesleri evlendirmek** (reşit kız ya da kız kardeş; "Evlendir"):
  - **Taca:** bağlı olunan tacın hükümdar ailesine; 200 altın çeyiz, taçla
    ilişki hemen +25, dinlenme değeri kalıcı +5.
  - **Kasabaya:** kasabanın ileri gelen ailesine; 150 altın çeyiz. Elindeki
    kasabanın sadakat hedefi kalıcı +12; **kimsenin olmayan** (kuşatılmamış,
    asisiz) bir kasaba ise kılıç çekilmeden lorda bağlanır (sadakat %60 ile
    başlar, +12 de sürer; aşırı büyüme kuralları geçerlidir). Başka bir lordun
    kasabasına gelin verilmez.
  - **Bir lordun hanedanına:** elçiyle teklif (`envoys.kind` `'marriage'`,
    `terms`: gelin, adı, yetenekleri, yaşı); savaştayken olmaz. Karşı taraf
    kabul ederse prenses onun hanedanının **Gelinler** listesine geçer, ilişki
    +30 artar; ikisine de elçi haber getirir.
  Evlenen prenses saraydan ayrılır ve **Evlendirilenler** listesinde kalır.
- **Görevsiz kardeş kırılır:** tahta geçişten (`Person.kinSince`) bu yana
  görevi olmayan her kardeşin bakışı saatte 3 puan düşer, en çok −30
  (`opinion.neglect`; kartta "Görevsiz bırakıldı: kırgın"). Görev vermek bunu
  siler, hediye bir süre telafi eder. Lord bir şey yapmazsa kardeşli bir tahta
  geçişin ~%79'unda, ortalama ~8 saat sonra isyan çıkar (bun ile ölçüldü);
  görevli ya da hediyeli kardeş isyan etmez. Böylece taht davacısı sezonda
  birkaç kez karşılaşılan bir durumdur, kardeşe görev vermek gerçek bir karardır.
- **Taht davacısı:** 2. seviye ve üstü sarayda, her 15 dakikalık yoklamada
  bakışı **−20**'nin altındaki her reşit erkek kardeş için isyan çekilir
  (olasılık %20 + eşiğin altındaki her puan %1,5, en çok %50; önce −35, %15 ve %1; kardeşin ve yoklamanın
  tohumundan; sunucu yoklamayı `Dynasty.revoltSlot`'ta bir kez yazar).
  Bir davacı dışarıdayken ve bastırılınca 2 saat boyunca yeni isyan olmaz
  (`quietUntil`). İsyan eden kardeş hanedandan çıkar, garnizonun %15'i (en
  çok 15) onunla gider, 8–14 asi + saray seviyesi × 2 toplar ve hududun
  10–18 karo dışında açık, kuru bir araziye (başka hudutlardan, kasabalardan ve
  taç şehirlerinden uzak) **karargâh** kurar (`Kingdom.pretender`).
  Karargâh çitli bir kamptır (kömür grisi çadırlar ve davacının köşkü;
  büyüdükçe çadır eklenir), kapısında siyah-gri asiler bekler, üstünde adı ve
  saraya yürüyüşe kalan süreyi gösteren bir çubuk durur; **herkes görür**
  (`lobby_kingdoms.pretender`). Karargâh dakikada 0,4 asi büyür (en çok 70) ve
  **60 dakika** sonra davacı saraya yürür. Tacın bakışı davacıya lordun taçla
  ilişkisinden yüksekse **taç onu destekler**: karargâh 1,5 kat hızlı büyür ve
  10 taç askeri ona katılır. Elçi isyanı (`pretender_rise`), sürenin yarısında
  ve %85'inde büyümeyi (`pretender_grow`) haber verir; harita uyarılarında en
  üstte bir kart durur.
  - **Karargâha saldırmak:** lordun ordusu karargâhın 5 karo yakınına
    gönderilince (Hanedan bölümündeki "orduyu gönder" ya da haritadan)
    `camp` hedefiyle yürür, varınca muharebe olur (`battles.kind`
    `'pretender'`; asiler mızrakçı ve okçudur, moral 65, saha bilgisi 70,
    çit 2 sur sayılır). Kazanırsa davacı ölür, isyan biter (`pretender_crushed`);
    yenilirse ordu eve çekilir, karargâh düşen asiler kadar küçülür.
  - **Taçtan yardım:** biat edilen taçtan bir kez asker, bir kez altın istenir.
    Taç davacıyı destekliyorsa ya da lordla ilişkisi 25'in altındaysa geri
    çevirir. Kabul ederse ilişki 6 düşer ve asker yardımı karargâhtan
    12 × (0,5 + ilişki/100) asi düşürür, altın yardımı 250 × (0,5 +
    ilişki/100) altın verir (`pretender_aid`).
  - **Saray kuşatması:** süre dolunca davacı sarayı kuşatır (`battles.kind`
    `'usurp'`, `besieged` lord): garnizon, sarayın yanında bekleyen ordular,
    kuleler, surlar ve hisar savunur (`pretender_siege`). Savunanlar kazanırsa
    davacı ölür (`throne_held`). Davacı kazanırsa **tahtı alır**
    (`throne_lost`): eski hükümdar tahttan indirilerek ölür, kraliçesi
    saraydan gider, çocukları yeni hükümdarın yeğenleri olur; hanedan
    davacıyla sürer, hayatta kalan asiler garnizona katılır, saray 15 dakika
    kalkan alır ve halk yağma gibi üzülür. Davacıyla muharebeler sıralamada
    zafer sayılmaz, kahırdan ölüm çekilmez.
  - **Taç seni sattıysa taraf değiştir** (`cities.json` → `crown.switch`;
    `intrigue.ts` → `crushPretender`, `liegeSwitchError`, `answerLiegeOffer`;
    sunucuda `switchLiege` komutu; arayüz `crownHouse.tsx` → `BetrayalDialog`,
    `BetrayalCard`): bağlı olunan taç davacıyı **desteklemişse** (`backed`) ve
    lord isyanı bastırırsa (karargâh dağıtıldı ya da saray kuşatmasına
    dayanıldı), biat bir kez ve **30 dakikalığına** bozulabilir
    (`Kingdom.liegeOffer`: eski taç, öbür taç, davacının adı, bitiş anı).
    Bastırma haberi bunu yazar; sonra elçi sorar: "Krallığın sana karşı
    savaştı. Onlara tepki göstermek için karşı krallığa geçmek ister misin?"
    (**geç** / **sadık kal** / **sonra**; "sonra" soruyu o ziyaret için
    erteler, teklif Diplomasi → Krallık'ın başında durur). **Geçerse:** liege
    öbür taç olur ve `liegeAt` yenilenir (devriyeler, haraççılar, kraliyet
    istekleri, siparişlerin fazlası yeni bağlılığa göre kendiliğinden gelir;
    geçişten önceki ziyaretler sayılmaz); eski taçla ilişki en çok **−60**'a
    iner, yeni taçla en az **+35**'e çıkar; lobideki öbür lordlara elçi haber
    getirir (`liege_changed`). **Sadık kalırsa:** eski taç özür diler: ilişki
    +20 ve 250 altın (hazineye sığdığı kadar). Her iki cevap elçi haberiyle
    gelir (`liege_switch`). Teklif bir kez verilir, süresi dolunca geçersizdir
    (sunucu `switch_expired` ile reddeder) ve ilk üretim turunda durumdan
    silinir (`advance`); taç sezonun geri kalanında yine değiştirilemez. Elçi
    (danışman) teklif açıkken kalan süreyle birlikte hatırlatır.

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
  saatte ~2.500–4.500 altın (lobi fiyatı düştükçe daha az), yeni kurulmuş
  bir lord ~700 altın kazanır. **Bir gece uyuyan lord** (10 saat, hazine
  üçte bir dolu, `bun scripts/offline-balance.ts`): iyi oynanmış bir lordun
  hazinesi ~%70–90'a çıkar, sıradan bir lordunki ~%55–65'e; hiçbir seviyede
  dolmaz, çünkü haraççılar saatte bir hazinenin %3'ünü alır (hazine büyüdükçe
  haraç da büyür ve bir dengede durur). Mallar da birikir (tüccar iş stoğunu
  bırakır, yokken yarım yük götürür). Asker maaşı tur başına 0,025 altın
  (önce 0,04: bir asker iki köylünün vergisini yiyor, küçük lordluk garnizon
  besleyemiyordu; normal vergide köylü 0,02 öder),
  lordlar arası haraç saatte 20–150 altındır.
- **Mal dengesi:** Tüccar **daha az birim, daha pahalıya** satar: 3. seviye
  ticaret noktası seferde 70 birim (önce 140), tur başına ~23 birim; en iyi
  arazide en çok oduncu kampı tur başına ~44 yapı malzemesi, silah atölyeleri
  ~19 savaş malzemesi, tarlalar halkı doyurduktan sonra ~27 yemek üretir. Yani
  büyük üretici artık her şeyini satamaz, mallar depoda birikir; fiyatlar ise
  ×1,5'tir (yemek 0,3, yapı 0,45, savaş 0,6), tüccarın altını küçük üreticide
  ×1,5, büyük üreticide ~×0,75–1 olur. (Önce seferde 140 birim, fiyatlar 0,2 /
  0,3 / 0,4'tü: tüccar ne üretilirse satıyor, depolar sıfırda kalıyor, hazine
  birkaç saatte doluyordu. Saklanan lobi fiyatları
  `20261024090000_economy_rebalance.sql` ile ×1,5 taşındı, `market.priceRev` = 3.)
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
  iner (`market.json`). Taban fiyatlar: yemek 0,3, yapı malzemesi 0,45,
  savaş malzemesi 0,6 (`economy.json` → `trade.price`); pazarın alış
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
  - **Haraç iste:** Kabul edilirse ilişki −5 düşer ve haraç ödeyenden
    isteyene **saatte 20–150 altın** (10'luk adımlarla; `diplomacy.json` →
    `tribute`) akar. (Önce tur başına 1–4 altındı, yani saatte 360–1.440:
    yeni bir lordun bütün gelirinden fazla; eski anlaşmalar ve yoldaki istekler
    `20261024090000_economy_rebalance.sql` ile ×36 taşındı.) Akışı **sunucu** yürütür
    (`settleTributes`, tick'te): haraç anlaşmasının son ödendiği andan bu
    yana birikmiş tam altınlar ödeyenin hazinesinden **ne kadar varsa** alınır
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
  böylece tek askerlik kuşatmalarla nüfus eritilemez; elçi haber getirir (`siege_people`). Düşen saray **15 dakika kuşatma kalkanı** kazanır (hisarla 25 dakikaya kadar, §9.8): bu sürede kapıya
  varan ordu savaşmadan bekler, kalkan bitince kuşatma kendiliğinden
  başlar. Kalan süre Krallıklar sekmesinde, ordu kartında ve sayaçlarda
  görünür.
- **Kule kayıpları haberi** (`tower_losses`): kule menzilinde duran ordu her
  dakika asker kaybeder; haber o ordu için 15 dakikada bir yazılır, okunmamışken
  gelen kayıplar aynı haberin sayısına eklenir (`military.json` →
  `tower.noticeEveryMinutes`).
- **Gözcü kuleleri muharebede:** Bir muharebenin yakınındaki (8 karo) kuleler
  sahiplerinin tarafına zar bonusu verir ve her tur birkaç düşman vurur;
  meydan muharebesinde iki taraf için de geçerlidir. Garnizonu boş saray
  kuşatılırsa kuleler birkaç tur direnir ve saldırana kayıp verdirir, sonra
  saray düşer.
- **Moral** (0–100, ordu başına): yürürken düşer (saatte −20); durunca kendi
  topraklarında toparlanır, bir **hanın** yakınında çok daha hızlı
  toparlanır, açık arazide yavaşça sarkar (saatte −6). Yürüyüş ve bekleme
  morali **45'in altına indirmez** (`morale.wearFloor`; morali zaten daha
  düşük olan ordu olduğu yerde kalır); onu yalnızca muharebe kırar. Önce taban
  yoktu ve yürüyüş saatte −30'du: 87 kişilik ordu uzun bir seferden sonra moral
  4,8 ile vardı ve 30 kişilik garnizona tek turda yenildi, uzak sefer pratikte
  imkânsızdı.
- **Saha bilgisi** (0–100): ordu bir yerde durdukça artar, kamptan
  uzaklaştıkça azalır; zara en fazla +1,5 ekler.
- **Muharebe turları** (EU4 gibi): her tur (30 sn) iki taraf da d10 atar,
  zara saha bilgisi (kuşatılan saray için kule ve sur bonusu) eklenir;
  sonuca göre karşı taraf asker ve moral kaybeder. Öldürülen asker kesirli
  çıkar (asker × güç × 0,008 × zar); kesir, muharebenin tohumundan ayrı bir
  zarla bir asker daha olasılığıdır (0,48 ölü %48 olasılıkla 1). Önce en yakına
  yuvarlanıyordu: eşit ordularda 1–6 asker hiçbir zaman kimseyi öldüremiyor,
  10 asker muharebelerin %5'inde sıfır öldürüyordu; yağmacı çeteleri ve asiler
  bu aralıktadır (`military.ts` → `planBattle`). Morali ya da askeri
  biten taraf yenilir; son turda (14.) saldıran çekilir. Savaşlar ~8 tur sürer
  ve tur tur izlenebilir (zarlar, bonuslar, moral, kayıplar). Zar bonusunun
  altında kalemleri yazar: saha bilgisi, birlik üstünlüğü, iman ve kral, kuleler,
  hisar ve surlar. **Birlik üstünlüğü sayıya değil karışıma bakar** (iki ordunun
  birlik paylarının çarpımı, `units.ts` → `counterBonus`); asker sayısı zarda değil,
  öldürülen düşmanda ve moral kaybında sayılır. Yenilen ordu
  eve çekilir ve eve varana kadar yeniden yakalanamaz. **Yolda kazanan ordu
  yoluna devam eder:** muharebe başlarken yürüyen ordunun gittiği yer
  saklanır (`goal.resume`); kazanırsa aynı hedefle (kuşatma, kasaba, kamp,
  mağara, ev) oraya yürümeyi sürdürür. Önce hedefi sıradan yürüyüşe dönüyor,
  kasaba kuşatması kayboluyor, ordu kapıya varmadan duruyordu. **Sarayı alan
  ordu ganimetle eve döner:** kuşatma kalkanı boyunca kapıda, kulelerin
  altında beklemez (önce bekliyor, kulelere 16 dakikada 48 asker kaybediyordu).
- Savaştayken elçiler yalnızca barış götürür (ilişki geliştirme, hediye ve
  haraç isteği olmaz).
- Ordu yolu iki adımda aranır: önce 4×4 karoluk hücrelerin **yürünebilir
  parçaları** üzerinde (bir hücrenin içinde birbirine yürünerek ulaşılan
  karolar bir parçadır; ortasından sur geçen hücre surun iki yanında iki
  ayrı parçadır, böylece arama suru delemez ve kapıyı bulur; dar köprüler de
  bulunur), sonra seçilen hücre koridorunda karo karo; yol, arazinin izin
  verdiği yerde düzleştirilir. Böylece ordular nehirleri köprülerden ve en
  kısa yoldan geçer. **Yollar tercih edilir:** ticaret yolunun (köprüler
  dahil) ve lordların döşediği yolların yanındaki karolar daha ucuzdur: yolun
  üstü ×0,92, bir karo yanı ×0,8, iki karo yanı ×0,9 (`military.json` →
  `route`); ordu yakındaki yolu, yol en çok ~%25 uzatıyorsa kullanır ve yolun
  ortasından değil bir karo yanından yürür (düzleştirme yolu ancak daha pahalı
  değilse kısaltır). **Kapıdan ortadan geçer:** yol bir sur kapısından
  geçiyorsa kapı karosunun ortası ve giriş/çıkış kenarlarının ortası sabittir,
  kapıya 1,4 karo kala yol kapının doğrultusuna döner (`gateApproach`,
  `gateLead`; devriyeler lordların kapılarından da böyle geçer). **Yollar
  kıvrımlıdır:** 8 karodan uzun, yol kenarında olmayan düz bacaklara ~6 karoda
  bir, yanlara en çok 1,1 karo sapan noktalar eklenir (koordinattan
  belirlenimci), sonra köşeler üç geçişte yuvarlatılır (köşe başına en çok 2,5
  karo; kesişen kısa yol araziden ya da binadan geçiyorsa o köşe kalır).
  Sonuç bir karonun yüzde biri hassasiyetle saklanır; süre bu son yolun
  uzunluğundan hesaplanır, sunucu ve istemci aynı yolu kullanır
  (`military.ts` → `findRoute`; `scripts/route-check.ts` ve
  `scripts/bridge-check.ts` gerçek bir haritada denetler). Binaların (tarla hariç) ve ayakta duran **surların**
  içinden geçmez; **sur kapısından** yalnızca sahibinin orduları geçer
  (yıkık sur geçilir). Bir binanın üstüne gönderilen ordu yanındaki boş
  karoda, bir saraya gönderilen ordu sarayın kapısının (ön köşesi) önünde
  durur; yeni çıkarılan ve eve dönen ordular da oradadır (kapının önüne bir
  yapı kurulmuşsa ordu yola çıkarken önce en yakın boş kareye adım atar;
  `armies.ts` → `march`). Surla çevrili bir
  sarayı kuşatan ordu surların önünde durur ve kuşatma orada başlar.
- **Sur ile su arası kapalıdır:** ayakta duran bir sur parçası (ya da sur
  hattındaki, bir sura 3 karodan yakın gözcü kulesi) ile su, dağ ya da
  lordun kendi gözcü kulesi arasında en çok 2 karoluk dar bir boşluk
  kalırsa, o ikisini birleştiren düz çizginin üstündeki karolar ordulara
  kapalıdır (kendi ordusu dahil; `military.json` → `wall.sealTiles`,
  `military.ts` → `sealed`; `findRoute` ve `standingSpot` uygular). Böylece
  suyun bir iki karo önünde biten sur hattının ucundan, kuleyle göl
  arasından sıyrılıp geçilmez. Kapının ve çevresindeki 3×3 karonun, yıkık
  sur kesimlerinin önü kapanmaz. Kuşatılan lordun surları kuşatma için
  açıldığında da boşluklar kapalı kalır; kuşatan sura yürüyüp önünde durur.
  Surun bir evle (ya da başka bir binayla) arasındaki boşluk kapanmaz; köylü
  ve tüccarın yürüyüşü (§6.4) bundan etkilenmez.
- **Detay animasyonları** (Ayarlar → Görüntü, varsayılan açık): 1× ve üstü
  yakınlaştırmada ağaçlar zemine işlenmek yerine ayrı çizilir ve rüzgârda
  hafifçe sallanır; yürüyenler, hayvanlar ve binalarla aynı derinlik
  sırasındadır (ormandaki geyik önündeki ağacın arkasında kalır). Kapatılınca harita onlarsız yeniden çizilir.
  Bir ordunun bulunduğu parçalarda (ve hemen çevresinde) ağaçlar **her
  yakınlaştırmada** ve bu ayardan bağımsız olarak ayrı çizilir; ordu
  ormanda önündeki ağaçların arkasında kalır. Komşu parçalar sınırdan taşan
  ağaçları buna göre ya boyar ya da bırakır (`createWorld.ts` → `liftFor`,
  `nearOf`). **Güç tasarrufu** açıkken (oyuncu bunu seçili bırakmışsa)
  detay animasyonları kapalıdır (§11 Ayarlar, §12).
- Gece yanan pencerelerin çevresinde yumuşak bir **parıltı** vardır (aynı
  ışıklar bulanıklaştırılıp gecenin üstüne eklenir).
- Ordular (ve devriyeler) köprüden geçerken güvertenin üstünde yürür,
  suyun hizasında değil (`chunkPainter.ts` → `surfaceHeight`, `marchView.ts`). Bölükteki
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
- **Ordu etiketleri** (`armies.ts` → `mapTag`, filo etiketleriyle aynı
  tasarım): her ordunun üstünde lordun renginde koyu kenarlı küçük bir
  etiket durur: lordun adı ve büyüklüğü. Kendi ordunda kesin asker sayısı
  ("Ulupınar Beyliği · 24"), başkasınınkinde kaba büyüklük: figür sayısından
  **birkaç** (≤8 asker), **orta** (≤20) ya da **büyük** (`roughSize`);
  kesin sayı yine yalnız casuslarla. Taç devriyelerinin etiketi tacın
  renginde "Altınkapı devriyesi", haraççılarınki "Altınkapı haraççıları";
  yağmacı çeteleri ve kasaba asileri kara zeminli, kan kırmızısı kenarlı
  etiket taşır ("Uzun Yusuf çetesi · yağmacı", "Akçay asileri").
  Kalabalığı önlemek için üst üste binen etiketlerden yalnız öncelikli olan
  çizilir (seçili ordun, kendi orduların, yağmacılar/asiler, taç kolları,
  ötekiler); en uzak yakınlaştırmada (⅛×) yalnız kendi orduların
  etiketlidir; yağmacı çeteleri orada hiç çizilmez.
- Muharebe başlayınca ve bitince **elçi** ekranda bir pencereyle haber
  verir (kim, nerede, sonuç, kayıplar).
- **Savaş izleme:** Savaş penceresinin (ve kasaba kuşatmasının) üstünde
  mini oyunlar gibi çizilmiş bir hi-bit sahne oynar (256×104 sanat
  pikseli, en yakın komşuyla büyütülür; `apps/web/src/ui/hud/BattleScene.tsx`,
  mini oyunların `art.ts` araçlarıyla). Durgun katmanlar bir kez boyanıp
  saklanır: oyun saatine göre gökyüzü (şafak, gündüz, gün batımı, gece;
  güneş, ay, yıldızlar), sürüklenen bulutlar, hafifçe kayan karlı dağlar ve
  tepeler, ufukta çam ormanı, dither'lı çayır (ot tutamları, çiçekler,
  kayalar, çarpışma yerinde çiğnenmiş toprak, kapıya giden yol). Savunanların
  tarafı savaşın türüne göredir: saray kuşatması (taht davacısının kuşatması
  da) yuvarlak kuleli, mazgallı taş sur, meşe kapı, asılı sancaklar ve
  meşaleler; tahta surlu kasaba kazık çit ve kapı; surusuz kasaba (ve
  ayaklanma) yarı ahşap evler; davacının karargâhı çadırlar ve kamp ateşi;
  meydan muharebesi ve yağmacılar açık arazi. Askerler her lordun rengi için
  bir kez çizilen sprite tablolarındandır (dış hatlı, rengin üç tonu;
  miğfer, mızrak ve yuvarlak kalkan; kukuletalı okçu ve yay; büyük
  kalkanlı ve kılıçlı piyade; kılıflı atlı ve mızrak; asiler, kasaba halkı
  ve yağmacılar başı açık, yabalı) ve ordunun birlik karışımını izler
  (askerleri kadar figür, en çok 18; mancınıklar ayrı makine). Yürüme,
  durma, geri çekme, vurma, sevinme, düşme ve yatma kareleri vardır. İlk tur
  başlayınca saflar yürüyüp kapışır (toz ve kıvılcım, sarsıntı), ön saf
  mızrak savurur, atlılar hücum eder, okçular yay çizerek ok yağdırır (yere
  saplanan oklar kalır), mancınıklar sura taş atar (moloz, toz, surda
  çatlak), savunanlar mazgallardan ok atar; kuşatma uzadıkça surun ardında
  yangın ve duman çıkar. Her turun kayıpları düşer ve yerde kalır (surdaki
  okçu aşağı düşer), yaşayanlar safları kapatır. Her ordunun sancaktarı
  vardır; kral komutadaysa altın, taçlı sancağın yanında durur. Savaş
  bitince kazananlar silahlarını kaldırır, yenilenler geri çekilir; kuşatma
  kazanılmışsa kapı kırılır, kulede kazananın bayrağı dalgalanır. Gece ve
  akşam sahne kararır, ateşler ve meşaleler parlar. Gösterilen her şey
  savaşın verisinden (tur, kayıplar, birlikler) gelir; parçacıklar yalnızca
  göz içindir. Savaş sürerken gerilimli bir savaş müziği (davul, bas,
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
  çalışmaz, vergi vermez ve mutluluğu düşürür. Hastalık kendiliğinden
  çıkmaz (`sickness.perRound` 0): **yılın salgını** (`sickness.outbreak`;
  `economy.ts` → `outbreakOf`, `outbreakBetween`) her oyun yılında (gerçek
  saatte) %30 olasılıkla bir kez gelir ve halkın %3–8'ini yatağa düşürür;
  anı lordun yeri, lobi ve yıldan çekilir, ay ağırlıklıdır (kış ×3, sonbahar
  ×1,5, ilkbahar ×1, yaz ×0,5; sezonda ~100 salgın). Günlüğe
  Önemli olarak yazar. Hastalık hasta çoksa (tur başına pay × 0,006), açlıkta
  (×1,5) ve soğukta daha hızlı yayılır; hastalar kendiliğinden iyileşir (tur
  başına %5) ve tek bir hasta köylü bile kalmayınca hastalık biter
  (`wellBelowVillagers`). Bir salgın ~10 dakikada geçer, lordluk zamanın ~%4'ünde
  hastadır. (Önce salgın %90 olasılıkla her saat geliyordu, yayılma %1, açlıkta ×2,
  iyileşme %3,5 ve son hasta yarım kişiydi: hastalık geçmeden yenisi geliyor,
  halkın hep ~%2'si hasta görünüyordu; daha önce de her tur %0,1 temel hastalanma
  vardı.)
  **Hastane** doktorlarıyla (işçi) her tur hastaların bir payını daha
  iyileştirir. Krizlerin salgınları (§9.8 günün olayları) ayrıca gelir.
- **Tapınak:** Mutluluk hedefini yükseltir; askerler **iman gücüyle** zara
  bonus ekler (seviyeyle artar). **Vaaz:** altınla, bekleme süresiyle;
  bir süre verginin mutluluğa olumsuz etkisi azalır ("vergiler iyidir").
- **5. seviye sarayın büyük yapıları** (`economy.json` → `buildings`,
  etkileri `institutions.json` → `landmarks`; mantık
  `packages/shared/src/landmarks.ts`, menüler `apps/web/src/ui/hud/landmarks.tsx`):
  5. seviye saray üç yapı açar, her biri bir tane ve 3 seviyelidir; çok
  pahalıdır (savaş malzemesi de ister).

  | Yapı | 1. sv. maliyet | 1 / 2 / 3. seviye etkisi |
  | --- | --- | --- |
  | **Hisar** (3×3) | 3500 altın, 2400 yapı, 800 savaş, 300 sn | saray kuşatmasında savunanın zarı +0,5 / +0,9 / +1,3, garnizonun morali +8 / +12 / +16, düşen sarayın kalkanı +5 / +7,5 / +10 dk |
  | **Hanedan anıtı** (2×2) | 3000 altın, 2200 yapı, 300 savaş, 240 sn | mutluluk hedefi +4 / +6 / +8; puanda seviye × 100 Gelişim |
  | **Lonca konağı** (2×2) | 3200 altın, 1800 yapı, 200 savaş, 240 sn | tüccarın ve deniz ticaretinin sattığı her birim +%4 / +%6 / +%8 altın, pazar binasının fiyatı −%5 / −%8 / −%12 |

  Yükseltmeler: hisar 5000/3200/1200 ve 7000/4000/1600, anıt 4500/3000/500
  ve 6500/3800/800, lonca 4800/2600/400 ve 6800/3400/600 (altın / yapı /
  savaş). Hisarın zarı sur bonusunun tavanının (+3) üstüne eklenir,
  mancınıklar onu silmez; yalnızca saray kuşatmasında savaşır (meydan
  muharebesi ve kasaba kuşatmasında değil). Savaş izlemede savunanların zar
  bonusunda "hisar +N" yazar. Lonca konağının payı tüccar gelirine (Ticaret
  sekmesi, sefer başına kazanç) ve pazarın "N altına al" fiyatına işlenir;
  anıtın mutluluğu Halk → Mutluluk'ta yazar. Kabaca değerleri: 3. seviye
  lonca gelişmiş bir lordun ~1.200–1.600 altınlık saatlik tüccar gelirine
  ~100–130 altın ekler (toplam gelirin ~%5'i); anıtın +8 mutluluğu ağır
  olmayan bir yüksek vergiyi taşımaya yeter (100 köylüde yüksek vergi
  saatte ~575 altın fazladır ama −20 mutluluk); 3. seviye hisarla 30
  askerlik garnizon, 50 askerlik bir kuşatmayı %28 yerine ~%76 püskürtür.
  Görselleri: hisar koyu taştan kare bir burç (mazgallı korkuluk, gece
  yanan iki sıra mazgal penceresi), önünde perde sur ve kuleler; 2. seviyede
  sur her yanı çevirir, kapı kulesi ve mangallar, burçta kızıl sancaklar;
  3. seviyede çatılı üst kat, külahlı ve flamalı kuleler, yaldızlı parmaklıklı
  kapı ve zırhlı muhafızlar. Anıt kurucunun tunç heykeli (taçlı, pelerinli;
  2. seviyeden kılıcı havada) çiçek tarhları ve mangallar arasında; 2.
  seviyede arkada yaldızlı başlıklı sütun dizisi; 3. seviyede yaldızlı attikalı
  zafer takı ve taç, kara dikilitaşlar, sönmeyen ateş, heykel yaldızlı. Lonca
  konağı bacalı yarı ahşap bir hol, tenteli kumaş tezgâhı ve yaldızlı terazi
  tabelası; 2. seviyede taş zemin katın üstünde çıkmalı ahşap kat, arkada
  çan kulesi, sancaklar ve araba; 3. seviyede yaldızlı süslemeler, altın
  kubbeli kule, altın tenteli tezgâh ve altın sandıkları
  (`buildingSprites.ts` → `citadel`, `memorial`, `guildHall`).
- **Günün olayları:** İki ayrı kanal vardır, her biri 15 dakikalık
  pencerelerde en fazla bir olay, 8–14 dakika sürer:
  - **Lobi geneli** (%55): hava ve dünya olayları lobideki herkese aynı
    anda gelir (lobi tohumundan): kavurucu güneş (yalnız gündüz), yağmur,
    soğuk dalgası (yalnız gece), fırtına, yoğun sis, sel, bereket mevsimi,
    kervan mevsimi, kuyruklu yıldız, dolunay şenliği (yalnız gece), salgın,
    altına hücum, çekirge istilası, dolu fırtınası, deprem, kutup ışıkları
    (yalnız gece), güneş tutulması (yalnız gündüz), gökkuşağı (yalnız
    gündüz), ejderha söylentisi, taç düğünü.
    Yağmur, fırtına, sel, dolu fırtınası ve soğuk dalgası haritada da
    görünür (yağmur ve grilik, §4.2.1).
  - **Krallığa özel** (%40): salgın, halk şenliği, orman yangını, maden
    damarı, gezgin tüccarlar, ambar yangını, define, hacılar, göçebe
    çadırları, gezgin ozan, kurt sürüsü, maden göçüğü, haydut baskını,
    kayıp kervan, aziz kalıntısı, şövalye turnuvası; ayrıca (§9.9) gezgin
    bilgin, halk şenlik istiyor, kayıp soylu çocuğu, nadir mallar tüccarı,
    sahipsiz sürü, hasat panayırı, göçmen aileler.
  Gündüz/gece olayları o vakit başlar ve en geç o vakit bitince biter.
  **Yeni lord** (sarayı 1. seviyede ya da henüz yok; `events.quietBelowPalace`)
  olaylar için pencere görmez: haber günlüğe ve Halk şeridine yazılır, yalnızca
  **krizler** (cevapsız kalınca zarar verir) pencereyle gelir.
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
  vardır; cevap verilmezse bir şey yapılmamış sayılır. Seçeneklerin altındaki
  etkiler renklidir: iyi etkiler mavi, kötüler kırmızı (`FortuneDialog.tsx` →
  `Effects`; ikiyollu olaylarda da). Krizlerin anlık
  zararı (yanan yemek, hastalanan halk) bu yüzden olay başlayınca değil,
  karar süresi dolunca gelir; önlenmişse gelmez, süren etkileri de
  (üretim düşüşü vb.) uygulanmaz. Cevap krallık durumunda saklanır
  (`responses`, 24 saat), sunucu `crisis` komutuyla doğrular.
  **Kâhya** (Halk → Mutluluk; `steward` komutu, `Kingdom.steward`): görevdeyse
  karar süresi dolan, kimsenin cevaplamadığı krizde köylüleri seferber eder
  (aynı bedelle) ve her seferinde 15 altın alır (`events.crisis.steward`);
  hazinede yoksa bir şey yapamaz. Çevrimdışı lord için işe yarar.
- **Afetin bedeli** (`institutions.json` → `events.crisis.toll`;
  `packages/shared/src/disasters.ts` → `crisisToll`): bir kriz nasıl
  karşılanırsa karşılansın karar süresi dolunca depodan bir pay götürür;
  köylüler ve ordu yalnızca kaybı azaltır. Pay krize göre (orman yangını
  yapı malzemesinin %12'si, ambar yangını yemeğin %12'si, sel yemek ve yapı
  malzemesinin %6'sı, deprem yapı malzemesinin %8'i ve altının %4'ü (onarım),
  fırtına %5 yapı, çekirge %10 yemek, dolu %5 yemek, soğuk dalgası %6 yapı
  (odun), salgınlar %4 yemek ve %3 altın (ilaç), kurtlar %4 yemek, maden
  göçüğü %8 savaş malzemesi, haydutlar %4 yapı, %4 savaş ve %3 altın) ×
  seçim (bir şey yapma 1, köylüler 0,5, ordu 0,4; kâhya köylüler sayılır).
  **Dolu depo belayı çeker:** deponun doluluğu %70'i geçtikçe pay artar, tam
  doluyken iki katıdır (`fullAt`, `fullBoost`). Adil kalsın diye yalnızca
  250 birimin üstü sayılır (`floor`) ve bir afet bir maldan en çok %25 alır
  (`maxShare`). Hiçbir şey yapılmazsa olayın kendi zararı (`lose`, hastalık)
  da üstüne gelir. Örnek: 6.800'lük dolu ambarda orman yangını köylülerle
  ~790, hiçbir şey yapmadan ~1.570 yapı malzemesi yakar. Kriz penceresi her
  seçeneğin altında "Yine de ~N … gider" diye yazar.
- **Fare, rutubet, pas** (`events.hoard`; `hoardsBetween`, `hoardStrike`):
  her 30 dakikalık pencerede %40 ihtimalle (krallığın yeri ve kuruluşundan
  tohumlu, saklanmaz) bir an çekilir; o anda ambarın %85'inden dolu bir mal
  varsa (birden çoksa zar seçer) **Ambar fareleri** (yemek), **Rutubet ve
  kurt** (yapı malzemesi) ya da **Pas ve küf** (savaş malzemesi) o malın
  %4–10'unu (doluluğa göre) yer. Seçim yoktur; günlüğe Önemli olarak yazar.
  Ağzına kadar dolu tutulan ambar böylece kendiliğinden erir.
- **Çevrimdışıyken de gelir:** krizler ve bozulmalar `advance` içinde, o
  anki depoyla, üretim turu turu işlenir; lord yokken de (dönüşte ya da
  sunucu krallığı ilerlettiğinde) aynı sırayla uygulanır: cevapsız kriz tam
  zararını verir, kâhya varsa köylüleri seferber eder. 6 saatlik bir
  yokluğun hesabı ~60 ms sürer. Defter (`books.disasterLost`, `disasters`,
  `stewarded`) ne gittiğini toplar; "Sen yokken" raporu buradan okur.
- **İki yollu olaylar (seçim):** Güneş tutulması, ejderha söylentisi, taç
  düğünü, göçebe çadırları, gezgin ozan, kayıp kervan, aziz kalıntısı ve
  şövalye turnuvası (ve §9.9'un kuyruklu yıldız, gezgin bilgin, şenlik
  isteği, kayıp çocuk, nadir tüccar, sahipsiz sürü, göçmen aileler olayları)
  gelince pencere iki yol sunar (`institutions.json` →
  `events.choice`). Her yolun hemen ödenen bir bedeli (`cost`) ve hemen
  gelen bir kazancı (`gain`; altın en fazla 150) olabilir, ayrıca olay
  sürdükçe etkileri (mutluluk, tapınak mutluluğu, ticaret, iş gücü, üretim)
  olayın kendi etkisine eklenir. Örn. ozanı saraya davet et (−40 altın,
  mutluluk +8) ya da meydanda şapka dolaştır (+25 altın, mutluluk −2);
  kayıp kervanın yükünü al (+40 yapı, +30 yemek, mutluluk −3) ya da
  sahiplerine haber sal (+50 altın ödül, mutluluk +5, ticaret +%10).
  Bir yol süren araştırmayı kısaltabilir (`researchRush`, saniye) ya da
  köylü yerleştirebilir (`people`; boş ev kadarı kalır). Bedeli karşılanamayan yol seçilemez. Karar için 2 dakika vardır;
  cevap verilmezse olay yalnızca kendi etkisiyle sürer. Cevap `responses`
  içinde `'a'`/`'b'` olarak saklanır; sunucu `choose` komutuyla
  (`dilemmaError`, `answerDilemma`) doğrular ve uygular.
- **Sessiz haberler** (`notices.payload.quiet`): sunucunun rutin saydığı
  haberler pencere açmaz, yalnızca günlüğe yazılır ve okundu sayılır
  (`App.tsx` → `loud`): bahşişsiz ya da küçük bahşişli devriye uğrayışı, lord
  yokken gelen haraç isteği (cevap veremez; süresi dolunca ödenir) ve lord yokken
  kendiliğinden ödenen haraç. "Sen yokken" raporu ve defter bunları toplar. Sim
  testlerinde lord başına saatte 4–6 haber geliyordu, ~%60–85'i bu rutin haraç ve
  devriye haberleriydi; şimdi pencere olan haberler saatte ~1'e iner.
- **Art arda gelen pencereler** (`apps/web/src/ui/DialogQueue.tsx`):
  elçi haberleri, hanedan haberleri ve günün olayları bir sıra gibidir.
  Her pencerenin altında aynı alt çubuk durur: solda pencerenin kendi
  düğmeleri ve (arkada başka pencere varsa) **"Tümünü kapat"**, ortada
  sıradaki yeri ("2 / 5"; sıra boşalınca sayaç sıfırlanır), sağ uçta hep
  aynı yerde ileri düğmesi (arkada pencere varsa **"İleri"**, sonuncuda
  "Tamam"). Alt çubukta başka hiçbir şey yoksa (tek pencere, kendi düğmesi
  yok) "Tamam" bütün genişliği kaplar, büyük bir düğme olur (`.dialog-foot.alone`).
  Bu pencerelerin hepsi (olaylar, krizler ve seçimler, elçi ve
  hanedan haberleri, "Sen yokken", sefer raporu, özetler) **aynı boydadır**
  (600 piksel genişlik, ekrana sığdığınca 700 piksel yükseklik; düğmeler hep
  en altta; kısa ekranda alt çubuk hiç kaybolmaz: olay ve elçi pencerelerinde
  resim ortasından kırpılarak küçülür ve metin kayar, hanedan haberi ve
  raporlarda pencere kayar, alt çubuk en altta yapışık kalır), sıradaki tam öncekinin yerine gelir. Arkada bekleyen pencere
  varsa, masaüstündeki üst üste pencereler gibi en çok üçü sol üste doğru
  çapraz kayarak öndekinin arkasından görünür (`index.css` →
  `.dialog-stack`, `data-behind`); telefonda (720 pikselden dar) yığın çizilmez,
  pencere tam boyunu alır, yalnız sayaç ("1 / 4") kaç pencere beklediğini söyler. "Tümünü kapat" yalnızca bir şey bildiren pencereleri kapatır
  (süresi işleyen haraç isteği, cevap bekleyen elçi teklifi, kriz ve seçim kalır) ve kapattıklarını
  kısa bir pencerede başlık başlık (tekrarlananlar "×N") özetler. Özetteki her satıra dokununca o haber (birden çok geldiyse hepsi)
  tam metniyle açılır; "Geri dön" listeye döndürür. Raf ömrü özeti de
  aynı penceredir.
  - **Pencerelerin raf ömrü** (`config/balance/dialogs.json`; `App.tsx` →
    `folded`): bir şey bildiren pencere geldiği andan (hanedan haberinde
    doğum/ölüm anı ya da tarayıcının duyduğu an, olayda başlangıcı) **3
    dakika** içinde gösterilmezse (savaş haberleri, zarar veren haberler,
    kötü olaylar, ölüm/taç/naipler için **10 dakika**; `shelfSeconds`)
    artık tek başına açılmaz: okundu sayılır (günlükte zaten yazar) ve
    sıra boşalınca tek bir **"Sen bakmazken N haber geldi"** penceresinde
    başlık başlık (tekrarlananlar "N kez") özetlenir; oradan **"Günlüğü
    aç"** ile günlüğe gidilir. Sekme arka plandayken gelip bayatlayanlar da
    sekmeye dönülünce böyle toplanır. Aynı anda 5'ten fazla (`maxWaiting`)
    bildiren pencere bekliyorsa önemliler ve en yeniler olmak üzere 3'ü
    (`keepWhenFlooded`) kalır, gerisi özete katılır. Hiçbir zaman
    düşmeyenler: cevap süresi işleyen haraç isteği, cevap bekleyen elçi
    teklifi, karar süresi açık kriz ve seçim; sekme görünürken ekranda
    açılmış pencere de okunurken kaybolmaz.
    **Birikmiş haberler:** istemci okunmamış haberlerin **en yeni 30'unu** çeker
    (`net/online.ts` → `loadNotices`, `NOTICE_PAGE`; önce en eski 30'u çekiyordu:
    bir gün yokken birikmiş yüzlerce haber 30'arlı parçalarla bitmez bir sıra
    gibi geri geliyordu). Sayfa doluyken katlanan haberlerle birlikte ondan
    eskilerin hepsi de okundu sayılır; "Sen yokken" raporu kapanınca o ana kadarki
    bütün okunmamış haberler okundu sayılır (`markSeenUpTo`). Cevap bekleyenler
    (süresi işleyen haraç, bekleyen elçi teklifi) kalır. Burada kapatılan haber,
    `seen` yazılmadan önce çekilen bir sayfayla geri gelse de yeniden gösterilmez
    (`net/layer.ts` → `closed`). Günün olayı da bir kez açılır: sunucunun durumu
    yereldekinden geride gelince (`advance` aynı turları yeniden oynar) aynı olay
    yeniden başlamış sayılıyordu; gösterilenler tarayıcıda olay bitene kadar
    hatırlanır (`App.tsx` → `tellFortune`). Sınama:
    `bun scripts/notice-repeat-check.ts` (yağmacı/korsan haberi, süren ayaklanma,
    yeniden oynanan olaylar, birikmiş haberlerin sayfalanması; eski kurala göre de
    sayar). Oyuncu sırayı ilerletirken
    arkada bekleyenlerin yaşı son "İleri"den sayılır (okuyan oyuncunun
    haberleri bayatlamaz). Doğumda ad konmasa da olur (sonra kartından
    konur). "Sen yokken" raporu açılacaksa haberleri o anlatır: rapor
    açıkken hiçbir şey toplanmaz, rapordan önceki haberler rapor
    kapanınca özetsiz düşer.
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
  vardır (`apps/web/src/ui/AwayReport.tsx`). Çimenlik yandan görünen bir
  manzara değil, haritanın ½× hâli gibi gerçek bir izometrik zemindir: bir
  karo 32×16 piksel, yapılar yarı boyda ve ön köşelerinden karo noktalarına
  oturur (ayak izleri çakışmaz, sıralama ön köşeye göre); patika bir karo
  ekseni boyunca, hep aynı genişlikte uzanır. Yapısız sahnelerde (av, sürü,
  kervan…) figürler tam boy çizilir (`Scene` → `scale`). Aynı sahne
  seferlerde, olaylarda, taç tanıtımında, hapishane, eğlence merkezi ve hazine
  menülerinde kullanılır:
  **Sen yokken köyde neler oldu** (ilk sayfa, kısa özet: yokluk boyunca
  başlayan günün olaylarının (`fortunesBegun`) sayısı, kaçının kötü /
  hayırlı olduğu, ilk üçünün adı ve seçimlerin kaçında yol seçildiği tek
  satırda; afetler tek satırda: kaç afet, kaçını kâhya / sen karşıladın,
  kaçı karşılanmadı, kaç kez fare/çürük/pas ve toplam giden mal (defterden);
  dönen seferler toplam ganimetle tek satırda, tamamlanan hedefler ve unvan
  tek satırda, büyük işler tek satırda ("Ulu Katedral 3/5 (yapılıyor)")),
  **Mali rapor** (depo: dört kaynağın şimdiki hâli ve farkı tek satırda;
  gelen altın (vergi, tüccar, kasaba ve olaylar, seferler, ganimet, diğer)
  tek satırda; giden altın (maaşlar, kasaba bakımı, yağmacılar, inşaat ve
  alımlar) tek satırda; dolu hazine/ambarda boşa giden, bekleyen ve yarım
  yükle giden seferler tek satırda; köylü ve mutluluk; yokluk cezası),
  **Seferler** (dönen her sefer tek satırda: ganimeti, bulduğu, kayıpları;
  hâlâ yolda olanlar;
  sayfanın resmi son seferin sahnesidir), **Askeri rapor** (muharebeler, kuşatmalar, kasabalar,
  kuleler, sınırdaki ordular, asker sayısı ve kayıpların nedeni),
  **Haraçlar** (toplamlar: rakip tacın haraççıları kaç kez geldi ve
  toplam ne kadar ödendi, kaçı kendiliğinden / fazlasıyla, kaçı cevapsız
  kaldı; kendi tacının devriyesi kaç kez uğradı ve toplam bahşiş; armağanlar
  kaç kez geldi ve toplam altın ve mallar; lordlar arası ödenen/alınan
  haraç), **Elçiler ve
  casuslar** ve **Dünyada olanlar** (kim kime savaş açtı, hangi savaş
  bitti, kim kiminle çarpıştı ve kim kazandı, kim hangi kasabayı fethetti, taçlarda kim ölüp kim tahta çıktı, taç savaşları başladı mı bitti mi).
  Askeri rapor ve Elçiler sayfalarında aynı başlıklı haberler birleşir
  ("… (5 kez; sonuncusu)"). Hiçbir sayfa 7 satırı geçmez, kaydırma
  gerekmez: uzun sayfa ilk 6 satırı ve "… ve N haber daha (ayrıntısı
  günlükte)" yazar (`PAGE_LINES`). Raporda yalnızca maddelerin listesi kayar;
  resim, başlık ve Geri / İleri düğmeleri hep yerinde durur.
  Öncesi/sonrası sunucudaki `seen` özetinden okunur (her cihazda aynı). Rapor açıkken elçi pencereleri beklemez; kapatınca rapordaki
  haberler okunmuş sayılır (günlükte yine durur).
- **Elçinin haber çizimleri:** Elçinin getirdiği her haberin penceresi olay
  penceresi gibidir: üstte başlık şeridi (iyi haberde yeşil, kötüde kırmızı;
  solunda elçinin portresi), altında pencerenin üst yarısını dolduran
  hareketli, kodla çizilmiş bir piksel sahnesi (`apps/web/src/ui/NoticeArt.tsx`;
  olay çizimleriyle ortak araçlar `artKit.ts`'te), en altta haber ve düğmeler. Haberler ailelere
  ayrılır; sahne ilgili lordun ya da tacın rengini ve bir çeşidi alır:
  **haraç** (haraççılar sarayın kapısında altın sandığıyla; ödendi: sandığı
  götürürler; reddedildi: sandık kapalı, parmak sallanır), **eğlence**
  (devriye handa sahne önünde içer, ozan çalar), **armağan** (salonda altın
  sandığı ve hediyeler; fidyede yastıkta taç), **elçi** (atlı elçi
  parşömenle saraya gelir; kraliçe dönüşü; yerine getirilemeyen emirde yol
  ayrımında kafası karışık ulak), **ittifak** (iki lord çadırlar arasında el
  sıkışır; bozulunca sırt döner, yırtık antlaşma), **barış** (masada parşömen,
  yazan tüy, mumlar; dayatılmışta yanında kılıç), **savaş** (alacakaranlıkta
  davullar, sancaklar, sırttaki ordu, işaret ateşi; sınırdaki ordu: gece
  tepelerde düşman çadırları ve ateşleri), **hakaret** (taht salonunda
  fırlatılan eldiven), **casus** (zindanda ay ışığı, parmaklıklar, meşaleli
  gardiyan), **sabotaj** (gece yanan ambar ya da kesilmiş iskele, kaçan
  kukuletalı), **ayaklanma** (kapı önünde meşaleli, yabalı kalabalık),
  **kaçırma** (gece kuleden halat, kraliçeyi ata götüren iki kukuletalı),
  **yağma** (kervana saldıran askerler; püskürtülünce kaçarlar), **deniz**
  (yanan gemiler, oklar; abluka: iskelenin önünde gemi sırası; gün batımına
  açılan gemi), **kuşatma** (tepede surlu kasaba, taş fırlatan mancınık;
  alındı: sancak çekilir; dayandı: kuşatanlar çekilir; halk kaçıyor) ve
  **muharebe** (karşılaşan iki saf; gözcü kulesinden ok yağmuru).
  Yağmacı haberleri yağma sahnesini, korsan haberleri deniz sahnesini
  saldırganlar is karası olarak kullanır (§7.9, §8.5).
  Hanedanın haberleri (§9.1.1) bu ailelerden çizilir: evlilik teklifleri ve
  düğünler ittifak sahnesiyle, hoşnutsuz kardeş taht salonundaki hakaret
  sahnesiyle, görevler elçi sahnesiyle, taht davacısının isyanı ve büyüyen
  karargâhı gece tepelerdeki düşman çadırlarıyla, bastırılan isyan
  ayaklanmanın bitişiyle, saray kuşatması, korunan ve kaybedilen taht kuşatma
  sahnesiyle.
- **Elçi (danışman ve öğretici)** (`apps/web/src/ui/advisor/`): Elçi oyunun **komik unsurudur** (oyun
  adını ondan alır): kendini beğenmiş, yaşlı, dizleri ağrıyan, dedikoducu bir
  saray elçisi; kötü haberi neşeyle verir, fikirleri kendine mal eder, savaşı
  "arkadan, stratejik olarak" izler. Her söz bilgiyi eksiksiz taşır, şaka onu
  sarar. Elçinin kodla
  çizilmiş bir portresi vardır (tüylü şapka, fırfırlı yaka, sivri ak sakal,
  bir kaşı kalkık, elinde mühürlü parşömen; göz kırpar, konuşurken ağzı
  oynar; `EnvoyPortrait.tsx`). Sohbet düğmesinin hemen sağındaki
  **Elçi** düğmesi onu çağırır. Elçi haritayı kapatmayan küçük bir konuşma
  panelinde gelir: portre, harf harf yazılan söz ve 1–3 cevap. Kendiliğinden
  oynanan her 3 dakikada bir gelir (`ADVISOR_EVERY_MINUTES`). Süre bir sekme
  ya da pencere açıkken de işler, ama elçi konuşmak için onların kapanmasını
  bekler (bir şey yerleştirilirken de gelmez, üst üste binmez; önce süre
  sekme açıkken duruyordu ve elçi neredeyse hiç gelmiyordu). Kendiliğinden
  açtığı bir öğüt yalnızca kapatılsa da 9 dakika dinlenir (`SHOWN_MINUTES`),
  sonraki gelişinde başka bir şey söyler; "Sonra" denen öğüt 15 dakika
  (`SNOOZE_MINUTES`, öğüdün kendi süresi yoksa) ertelenir. **Konuyu değiştirir**
  (`Advisor.tsx` → `chooseTip`, konular `gossip.ts` → `tipKind`): her öğüdün bir
  konusu vardır (acil, ekonomi, inşa, halk, saray, taçlar, lordlar, casusluk, ordu,
  yağmacılar ve korsanlar, uğraşlar). Acil olanlar (açlık, taht davacısı, taç
  değiştirme teklifi, baskın) önce gelir (5 dakikada bir); yoksa en uzun süredir
  açılmayan konudan, o konunun ilk geçerli öğüdü. Son 20 dakikada söylenen öğüt,
  başka söylenecek bir şey varken tekrarlanmaz; elçi düğmesiyle çağırınca da
  (önce hep listenin ilk öğüdünü, ör. hep aynı handan söz ediyordu). Ekonominin
  yanında **sohbet konuları** da vardır (`GOSSIP`, hemen her zaman geçerli,
  lordun görebildiklerinden): tacın hükümdarı, huyu ve veliahdı; iki tacın
  rekabeti; rakip hükümdar; lobinin en güçlü lordu; süren lord savaşları (bizimki
  dahil); casusların ne yaptığı ya da casus evi yokluğu; garnizon ve sahadaki
  ordular; yollardaki bir çete ve klanı; dağlardaki klanlar; göllerdeki korsanlar;
  yoldaki ya da düzenlenebilecek seferler; hükümdarın yaşı ve veliaht. Lordun
  eksiklerine ya da düzeltebileceklerine göre biraz şakacı bir öğüt verir
  (yemek azalıyor, tarla yok, ambar ya da hazine dolu, tüccar boşta, saray
  yükseltilebilir, biat edilmedi, kraliçe yok, kışla/casus evi/pazar/ambar/
  sur yok, evler dolu, boşta köylü, gece mesaisi yorgunluğu, mutsuz ya da
  hasta halk, dolu ambarlar varken büyük işler (Saray → Projeler), tacın
  görevi, alınabilecek kasaba, oynanabilir mini oyun, rakip
  taca geçme teklifi, taç savaşı, haraççıları çok isteyen rakip hükümdar;
  bir çete ticaret noktamıza baskına iniyor / pusuda / dönüyor, yağmacılar
  yolu tutuyor, korsanlar sularımızda, korsan limanı yeniden kalabalık
  (ablukaya al), yılın salgını, boştaki köylülerle bir sefer başlat, yarım
  kalan mağara izi; taçların yağmacı ve korsan görevleri kendi sözleriyle…).
  Yağmacı ve korsan haberleri de birkaç söylenişle gelir.
  Panel sade tutulur: söze verilen cevaplar düğmedir; **"Bana oyunu
  anlat"** kapatma düğmesinin yanında bir kitap simgesidir; yan sorular
  ("Dolu ambarları ve hazineyi ne yapalım?", sohbet sorusu) cevapların altında
  küçük, soluk bağlantılardır (`Reply.quiet`).
  Cevaplar: işe girişmek (ilgili sekmeyi ya da alt bölümü açar, yapıyı
  yerleştirmeye başlar ya da binanın menüsünü açıp kamerayı oraya götürür),
  "Sonra" (konuyu bir süre ertelemek) ya da bir şaka (şakayla karşılık
  verir). Depolardan biri %60'ı ya da hazine %70'i geçmişse elçi çağrıldığında
  bir cevap da **"Dolu ambarları ve hazineyi ne yapalım?"** olur (`lines.ts` →
  `wellStocked`, `wealthAdvice`): büyük işler açıksa "Lordum, biraz büyük
  şeyler yapmanın vakti gelmedi mi sizce de?" diye Projeler'e, 3. seviye sarayda
  şenliğe ve taca bağışa, daha önce tüccara, taç siparişlerine ve kraliyet
  isteklerine yönlendirir.
  **Elçinin notu** (`advisor/narration.ts`, `EnvoyNote.tsx`): lordun yaptığı
  işlere elçi kısa bir sözle karşılık verir: vaaz, şenlik, taca bağış, büyük
  işe aktarma, araştırma, vergi, gece mesaisi, kraliçe, asker eğitimi ve
  terhis, sefer ve geri çağırma, kâhya, biat, onarımlar, kasabayı bırakma, taç
  görevleri ve kraliyet istekleri, taç siparişi, tüccarın yolu, malı ve yükü,
  ticaret noktasını yükseltme, onaylanan plan (inşa, taşıma, yıkım; yalnızca yol
  döşemek not düşmez) ve bina yükseltme (sarayınki ayrı), ürün seçimi, pazardan ve
  kasabadan alım, kasaba bakımı, hanedan işleri (görev verme ve alma, hediye,
  evlendirme ya da bir lorda evlilik teklifi, taçtan yardım, çocuğa ad ve
  eğitim), gemi yapımı, filo emirleri (kurma, bölme, birleştirme, limana bağlama,
  geri çağırma, seyir, korsan takibi; liman, balık, korsan avı, deniz ticareti,
  abluka, kıyı akını, ablukayı yarma), ordu çıkarma ve emirleri (yürüyüş,
  kuşatmaya gönderme, eve dönüş, bölme, birleşme, yağmacı takibi, mağara
  kuşatması), kralın komutayı alması ve bırakması, elçi gönderme (ilişki
  geliştirme, hediye, haraç isteği, ittifak, barış, hakaret), teklife cevap,
  savaş ilanı, ittifakı bozma, haracı bitirme, ticaret yolu yağması, casus
  gönderme, geri çağırma ve rapor isteme, casus operasyonları, fidye ve rehine
  kraliçeyi bırakma. Her işin en az altı söylenişi vardır (rastgele biri; mal,
  birlik, sayı, araştırma, iş, vergi gibi ayrıntılar söze girer). Sunucu komutu
  kabul edince (`net/online.ts` → `onCommandDone`; bina yükseltmede sunucunun
  döndürdüğü durumdan binanın türü okunur) haritanın altında, menünün üstünde
  portreli küçük bir parşömen 9 saniye durur; dokununca kapanır, yenisi eskisinin
  yerini alır. Kendi penceresi olan işler (kriz, seçim, elçi cevapları, haraç
  konuşması, taç değiştirme) ve sık yapılan küçük işler (işçi sayısı, mini
  oyunlar, "buradayım", dürtme) not düşmez; bir pencere açıkken not gelmez.
  **Elçinin haberleri** de tek bir kalıba bağlı kalmaz: tek cümlelik haberlerin
  (hediye, nezaket elçisi, ittifak ve barış kabulü, sabotajlar, fidye, kraliçenin
  dönüşü, bozulan ittifak, biten haraç, casuslar, hakaret, sınırdaki ordu,
  püskürtülen yağma, savaş başı, kuleler, sona eren kuşatma, kopan ve dayanan
  kasaba, devriyenin bahşişi, boş mağara, kaçan ya da dağılmış çete ve korsan,
  temizlenen yollar ve sular, taçların gerginliği ve barışı, taraf değiştiren
  lord, kaybedilen yük) dört söylenişi vardır; hangisi olduğu haberin
  numarasından seçilir (`Envoy.tsx` → `vary`), aynı haber her açılışta ve "Sen
  yokken" raporunda aynı okunur. Başlıklar değişmez (özet ve rapor onlara göre
  toplar). **Öğretici:** yeni lordda açık başlar; adımlar durumdan anlaşılır
  ve bitince elçi kutlayıp sonrakine geçer: saray → oduncu kampı → ev →
  tarla → tüccara mal → 6 yapı → biat → 2. seviye saray → kışla → kraliçe →
  casus evi → 3. seviye saray → üniversite → ilk araştırma → tapınak →
  hastane → ilk sefer → 4. seviye saray → eğlence merkezi → hazine →
  tersane ve ilk gemi → 5. seviye saray → bir büyük yapı (hisar, anıt ya da
  lonca konağı). Beklenen adımın sekmesi alttaki
  menüde yanıp söner. Elçi süren adımı kendiliğinden (ve sayfa yenilenince) en
  çok **12 dakikada bir** hatırlatır (`STEP_MINUTES`, `AdvisorMemory.stepAt`);
  arada başka konulardan söz eder ve adımı tekrarlayan öğütleri (2. seviye
  saraya geçince "sarayı yükselt", biat adımında "biat et"…; `STEP_TIPS`)
  söylemez. Önce her 3 dakikada aynı adımı söylüyordu. Her adımda **"Bu adımı geç"** cevabı o adımı atlar
  (atlanan adım kutlanmaz); öğretici ayarlardan yeniden açılınca atlananlar
  da sıfırlanır. Ayarlardaki düğme Açık / Kapalı / Tamamlandı yazar. **"Bana oyunu anlat":** konular menüde beş başlık altında
  durur (menü panelin içinde kayar): **Lordluğun temelleri** (Zaman, İnşa,
  Ekonomi, Ticaret, Nüfus, Mutluluk, Afetler ve hava, Günün olayları),
  **Ordu ve savaş** (Ordu, Savaş, Kasabalar, Donanma), **Taçlar, saray ve
  entrika** (Taçlar, Hanedan, Diplomasi, Entrika, Casusluk), **Yolların ve
  suların belası** (Yağmacılar, Mağaralar ve klanlar, Korsanlar) ve
  **Uğraşlar ve şan** (Seferler, Büyük işler, Hedefler ve unvan, Mini
  oyunlar). Her konu elçinin kendi ağzından 3–5 sayfalık kısa bir
  anlatımdır: sayılar denge dosyalarından okunur, yer yer lordun kendi
  durumuna değinir (hazinesine göre haraççının isteyeceği, yolunun ne
  kadarını yağmacıların tuttuğu, unvanı, hoşnutsuz kardeşleri…). Sayfalar
  "‹ Geri" / "İleri ›" düğmeleri ve "2 / 4" sayacıyla çevrilir; parşömene
  dokunmak önce sayfanın tamamını gösterir, sonra sonraki sayfaya geçer;
  her sayfa harf harf, mırıltıyla yeniden yazılır. Konunun kendi düğmesi
  (ilgili sekme) ve "Başka bir şey sor" her sayfada, "Teşekkürler" son
  sayfadadır. Diplomasi lordlar arası ilişkiyi, haracı, hakareti, yağmayı
  ve savaş gerekçesini; Entrika hanedanın içini (bakışlar, hediye, görevler,
  evlilikler, taht davacısı, taçtan yardım, taç değiştirme) ve casusların
  operasyonlarını (sabotaj, kraliçe kaçırma ve fidye, kasabada isyan,
  ayaklanma) anlatır. Sözler `lines.ts`'te, panel `Advisor.tsx`'tedir. Ayarlar
  penceresinde elçinin öğütleri ve öğretici açılıp kapanır; hatırladıkları
  (sessiz, öğretici, ertelenen konular) tarayıcıda lobi ve lord başına
  saklanır.
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

### 9.9 Seferler, hikâyeler ve hedefler (şu an uygulanan)

Tek başına oynayan ve günde birkaç kez giren lord için çevrimdışı akan
içerik. Değerler `config/balance/expeditions.json`, `goals.json` ve
`institutions.json`; mantık `packages/shared/src/expeditions.ts`,
`goals.ts`; arayüz `apps/web/src/ui/hud/expeditions.tsx`, adlar
`apps/web/src/ui/expeditionNames.ts`, resimler `apps/web/src/ui/storyScenes.tsx`.

- **Seferler** (Saray → **Seferler**): saraydan küçük bir köylü kafilesi
  (isteğe bağlı birkaç muhafız askerle) süreli bir yolculuğa çıkar; oyuncu
  çevrimdışıyken de sürer. Türler: **Avcılar ormana** (45 dk, 2–6 köylü:
  yemek ve post), **Kâşifler dağlara** (2 sa, 2. sv. saray: savaş malzemesi,
  harabe, dünyadan haber), **Hacılar tapınağa** (90 dk: dönünce 45 dk
  mutluluk, hacı başına +1,5, en çok +8), **Tüccar kafilesi uzak diyarlara**
  (4 sa, ticaret noktası: yapı malzemesi götürür, altın getirir; haydut
  riski), **Kayıp hazine izinde** (3 sa, 3. sv. saray: çoğu zaman eli boş,
  bazen 800 altınlık hazine ya da küçük bir zula).
  - **Bedel:** erzak peşin ödenir; yoldaki köylüler çalışmaz ve vergi
    vermez (`population` → `away`, sağlıklı köylüden düşer), yemeklerini
    yer. Muhafızlar garnizondan çıkar, maaşları sürer. Aynı anda saray
    seviyesine göre 1 / 1 / 2 / 2 / 3 sefer, toplamda halkın en çok %34'ü
    yolda olabilir. **Geri çağır**: kafile hemen döner, eli boş (erzak
    gitmiştir).
  - **Yolda olanlar:** her seferin 2–3 olayı vardır, aynı olay bir seferde iki kez gelmez (önce aynı havuzdan bağımsız çekiliyordu; iyi: sürü, mağara,
    panayır, harita…; kötü: ayı, kaya çığı, haydut, tuzak…). Kötü olay
    şansı türün `danger` değeridir; her muhafız onu %15 azaltır (en az
    %35'ine kadar). Olaylar ganimeti artırır/azaltır, bir köylü ya da
    muhafız kaybettirebilir, mutluluk getirebilir ya da dünyadan haber
    (söylenti: sahipsiz bir kasabanın garnizonu, bir lordun saray seviyesi;
    haritada görünenden seçilir) getirir. Hepsi krallığın yeri, kuruluşu ve
    çıkış anından tohumlanır (`expeditionOutcome`); saklanmaz, yalnızca
    çıkış/varış anı ve dönüşte sonuç (`Kingdom.expeditions`, son 8) saklanır.
  - **Dönüş** `advance` içinde işlenir (`settleExpeditions`): ganimet depo
    ve hazine sınırına kadar girer (sığmayan boşa gider), muhafızlar
    garnizona döner, mutluluk etkisi başlar (`expeditionHappiness`). Kafile
    dönünce resimli bir **sefer raporu** açılır (yolun olayları, ganimet,
    kayıplar; tarayıcıda lobi başına hangi raporun görüldüğü hatırlanır),
    günlüğe yazılır, sayaçlarda yolculuk görünür.
  - **Sunucu:** `expedition` komutu (`{ action: 'start', kind, villagers,
    escort }` / `{ action: 'recall', id }`; `expeditionError`).
  - **Denge** (`scripts/expedition-value.ts`, 6000 tohum): ortalama ganimet
    (olağan fiyatlarla altın değeri) ÷ (erzak + yokken ödenmeyen vergi):
    muhafızsız 0,94–1,11, tam muhafızla 1,04–1,24. Köylüler bir binada
    çalışıyorsa üretim de kaybolur, oran 0,23–0,5'e düşer: seferler **boşta
    köylüler** içindir. En kârlı kullanımda bile net kazanç sefer başına
    birkaç düzine altındır (saatte en çok ~%2–3).
- **Yeni olaylar** (krallığa özel, çoğu iki yollu): gezgin bilgin (50 altına
  süren araştırma 60 sn erken biter ya da halka ders, mutluluk), halk
  şenlik istiyor (şenliği düzenle ya da ertele: iş gücü +%8, mutluluk −3),
  kayıp soylu çocuğu (arama: iş gücü −%10, +70 altın ödül; ya da 30 altın
  ödül ilanı), nadir mallar tüccarı (60 altına 160 savaş malzemesi ya da
  100 yapı malzemesine 34 altın), sahipsiz sürü (+50 yemek ya da sahibini
  bul: mutluluk, ticaret), hasat panayırı (ticaret +%20, mutluluk +4),
  göçmen aileler (40 yemeğe 3 köylü ya da azık verip gönder). Lobi
  genelindeki kuyruklu yıldız da iki yolludur. Yeni olayların resimleri
  rapor sahneleriyle çizilir (`fortuneStory`).
- **Hanedan hedefleri** (Saray → **Hedefler**): 13 iz, her biri üç
  basamak (bronz, gümüş, altın): yapı (10/25/50), ev, saray seviyesi,
  köylü, çocuk (hükümdarın çocukları, kardeşleri ve evlendirilen prensesler),
  kazanılan muharebe, elde tutulan kasaba, araştırma, dönen
  sefer, tüccar geliri, hazine, tapınak, gemi. Basamaklar durumdan okunur
  ve `advance` içinde kaydedilir (`Kingdom.goals`: basamak ve an; geri
  alınmaz). Her basamak bir yıldız, bir rozet ("Usta Kurucu"…) ve küçük bir
  kese verir (25 / 50 / 100 altın; sezonda en çok ~2.300 altın, hazine
  sınırına kadar). Yıldızlar unvanı belirler (Genç Lord → Saygın Lord →
  Ünlü Lord → Efsanevi Lord → Destansı Hükümdar); unvan Saray sekmesinde
  yazar.

### 9.10 Büyük işler, şenlik ve taca bağış (şu an uygulanan)

Her şeyi en üste çıkarmış, ambarı ve hazinesi dolu lordun mallarını
harcayacağı büyük hedefler. Değerler `config/balance/projects.json`; mantık
`packages/shared/src/projects.ts`; arayüz `apps/web/src/ui/hud/projects.tsx`
(Saray → **Projeler**); sunucuda `project` komutu (`action`: `give` + `id`,
`festival`, `donate` + `good`).

- **Büyük işler** (4. seviye saray): üç iş, her biri **5 aşama**. Her
  aşama bir teslimat ister (işin temel maliyeti × 1 / 1,5 / 2 / 3 / 4, 50'ye
  yuvarlı) ve ambardan çok olduğu için istendiği kadar seferde verilir:
  **"Depodan aktar"** kalan ihtiyaçtan depoda olanı aktarır ama her ambarın
  ve hazinenin %25'ini yedekte bırakır (`keep`; halk aç, hazine boş kalmaz).
  Teslimat tamamlanınca ustalar aşamayı yapar (20 dk / 30 dk / 45 dk / 1 sa /
  1,5 sa); yapılırken yeni teslimat alınmaz. Durum `Kingdom.projects`
  (`stage`: biten aşama, `paid`: teslim edilen, `until`: yapımın bitişi);
  biten aşamayı `advance` kaydeder ve günlüğe yazar, sayaçlarda görünür.

  | İş | Temel (altın / yemek / yapı / savaş) | 5 aşamada toplam | Aşama başına |
  | --- | --- | --- | --- |
  | **Ulu Katedral** | 2500 / 1500 / 6000 / 600 | 28,8K / 17,3K / 69K / 6,9K | mutluluk +2 |
  | **Büyük Çarşı** | 3000 / 5000 / 3000 / 400 | 34,5K / 57,5K / 34,5K / 4,6K | tüccar ve deniz ticareti +%2 |
  | **Şövalye Tarikatı** | 2500 / 2000 / 2000 / 5000 | 28,8K / 23K / 23K / 57,5K | askerlerin zarı +0,1 (`battleSpirit`) |

  Her aşama +120 Gelişim puanı, iş bitince +200 daha ve bağlı olunan taçla
  ilişki +15 (iş başına 800 puan; üçü 2.400). **Denge:** dolu bir lord (≈7K
  hazine, 6–7K ambar, saatte ~2K altın) bir seferde ~5K mal ve ~5K altın
  aktarabilir; üç işin toplamı ~92K altın, ~98K yemek, ~127K yapı ve ~69K
  savaş malzemesidir. Altın darboğazdır (~40–45 saatlik gelir), yani üç iş
  günde birkaç kez giren gelişmiş bir lordu birkaç gün (sezonun ikinci
  haftasına kadar) meşgul eder; tek bir iş ~1 gün sürer. Haritada ayrı bir
  yapısı yoktur (ileride: anıt görseli).
- **Halk şenliği** (3. seviye saray): 600 altın + 3000 yemek; 30 dakika
  mutluluk +10; saatte bir düzenlenir (`festivalUntil`, `festivalAt`).
- **Taca bağış** (biat etmiş, 2. seviye saray): bir maldan 2000 birim taca
  gider, o taçla ilişki +4; 15 dakikada bir (`donatedAt`); ilişki 100'deyse
  verilmez. Panelde her mal bir satırdır (miktar, depodaki, "Bağışla"); seçim
  sekmesi gibi görünmez. "Bağışla" önce sorar: "2.000 yapı malzemesi tacına
  gidecek (depoda …). Emin misin?" (Vazgeç / Evet, gönder). (`project` komutu
  sunucuda lordun kendi komutları listesinde yoktu; bağış, şenlik ve büyük
  işlere aktarma "Komut reddedildi" diye dönüyordu.)
- Elçi, ambarlardan biri %85'i ya da hazine %90'ı geçince ve bir işe
  aktarılacak mal varsa Projeler'e çağırır (`greatWorks`).

---

## 10. Puanlama ve Sezon Sonu

**Şu an uygulanan (lobi sıralaması):** Her krallığın bir puanı vardır
(`packages/shared/src/score.ts`, ağırlıklar `society.json` → `score`):
- **Hazine:** altın / 10 + depodaki mallar / 25.
- **Gelişim:** saray seviyesi × 120, kurum binaları (üniversite, hastane,
  tapınak, kışla, casus evi, pazar, ambar, hisar, lonca konağı) seviye × 30,
  hanedan anıtı seviye × 100, diğer binalar seviye × 10, sur ve kapı 1;
  büyük işlerin her aşaması 120, biten iş +200 (§9.10).
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
- **Dil (Türkçe / İngilizce):** Oyun Türkçe ve İngilizce oynanır. İlk açılışta
  tarayıcının diline göre seçilir (tarayıcı dillerinden biri Türkçeyse Türkçe,
  değilse İngilizce); oyuncu **Ayarlar**'ın en üstündeki "Dil · Language"
  satırından değiştirir; giriş ekranında formun altında ve açılıştaki "Devam et"
  düğmesinin altında iki küçük piksel **bayrak** (Türkiye, Birleşik Krallık)
  durur, dokununca dil değişir (`ui/home/LangFlags.tsx`). Seçili olanın altın
  çerçevesi vardır ve bir piksel yukarı kalkıktır, öbürü soluktur. Seçim tarayıcıda
  saklanır (`localStorage` → `lang`); değiştirince sayfa yeniden yüklenir, harita
  yazıları ve bütün metinler yeni dille kurulur. Kaynak dil Türkçedir: oyuncunun
  gördüğü her metin kodda `L('Türkçe', 'English')` olarak yazılır
  (`packages/shared/src/lang.ts`; istemcide `apps/web/src/lib/i18n.ts`, dil
  `main.tsx`'te her şeyden önce seçilir), sayılar ve tarihler `locale()` ile
  biçimlenir (1,2K / 1.2K). Denge dosyalarındaki adların İngilizcesi yanlarında
  `nameEn` / `titleEn` gibi alanlardadır. Kişi, lord ve yer adları (Kara Yusuf,
  Altınkapı) iki dilde de Türkçe kalır; onlara eklenen sözler çevrilir ("Akçay
  Hanı" → "Akçay Inn"). Dil Türkçe değilse yer adlarının anlamı adın altında küçük bir notla yazar ("Altınkapı" → *“Golden Gate”*): taç başkentleri, hanlar, kasabalar ve lordluk adları; harita etiketlerinde ve panellerin başlığında (`ui/NameNote.tsx`, sözlük `ui/nameMeanings.ts`: şehir ve han adları tam karşılık, kasaba ve lordluk adları ön ek + son ekten). Elçinin İngilizcesi de aynı kendini beğenmiş, komik
  saray elçisidir. Sunucu dili bilmez, Türkçe kalır (oyuncuya giden metinleri
  istemci kurar). Yeni metin yazarken iki dili birlikte yaz.
- **Ana menü:** Giriş sonrası Lobiler / Nasıl oynanır / Ayarlar. Oyun
  içinden köşedeki menünün "Ana menü"süyle dönülür. Lobi silinirse
  içindeki oyuncular kendiliğinden ana menüye döner (yayın + dakikalık
  yoklama).
  **Görünüm** (`apps/web/src/ui/home/menuScene.ts`, `MenuBackdrop.tsx`,
  `home.css`): giriş ekranının ve menünün arkasında kodla, piksel piksel bir
  kez boyanan bir hi-bit manzara durur: alacakaranlıktan geceye dönen mor gök
  (ufukta dither'lı kızıllık, yıldızlar, silik bir samanyolu), sol üstte hâleli
  ay (ışık oradan gelir), karlı iki sıradağ (aya bakan yüzler aydınlık, yarıklar
  boyunca inen kar, eteklerde pus), çam ormanı, hepsini yansıtan bir göl ve
  çayırlardan inen bir dere; sağda tepede surlu bir kale (yuvarlak kuleler,
  kırmızı külahlar, burç, şapel kulesi, yanan pencereler, sancaklar; tepenin
  düzlüğü bütün surları taşır, surun dibinde kaba taş temel vardır), altında
  köy, açık çayırda bir tepecik üstünde yel değirmeni (taş gövde, sazdan külah,
  kapı, yanan pencere; ön plandaki çamların dışında), meşalelerle kapıya tırmanan yol; önde karanlık
  tepeler ve ulu çamlar. Resim ekranın sanat pikseli boyundadır (~290 piksel
  yüksek, cihaz pikseli başına tam sayı katla en yakın komşuyla büyütülür;
  kırpılır, gerilmez), tohumu sabittir, yalnız boyut değişince yeniden boyanır.
  Üstünde saniyede 12 kare kıpırdayanlar çizilir: göz kırpan yıldızlar, kayan
  bulutlar (karanın arkasında), ara sıra kayan yıldız, kuş sürüsü, gölde ayın
  yolu, derede parıltılar, titreyen pencere ve meşaleler, baca dumanı, dalgalanan
  sancaklar, dönen değirmen kanatları, ateş böcekleri, gölün ve kıyının üstünde
  üç tonlu katmanlar hâlinde süzülen sis, gölde ağır ağır gidip gelen, feneri suya
  yansıyan bir balıkçı kayığı, şatonun kulesinin çevresinde dönen yarasalar; sekme gizliyken durur,
  "hareketi azalt" tercihinde tek kare kalır. Başlıkta kodla çizilmiş taç
  (kadife başlık, inciler, yakut ve safirler; ara sıra parlar), altın bantlı ve
  mürekkep kenarlı "Crownherald", ortasında baklava olan altın çizgi ve uçları
  çentikli koyu bir şerit üstünde alt başlık (elçinin şakalarından biri, her
  açılışta rastgele: "Lordum, haberler var. Çoğu kötü."; `Root.tsx` →
  `ENVOY_QUIPS`); panel üst çubuğun çerçevesindedir
  (`--bar-frame`: yaldızlı pervaz, perçinli meşe bant, koyu tahta), sekmeler
  simgeli koyu meşe (seçili olan yaldızlı), lobi satırları köşeleri altın
  perçinli meşe levhalardır (devam edilen lobi altın şeritli).
  **Açılış:** giriş yapmış oyuncu menüyü önce yalnızca başlık ve ekranın
  altında, ince çerçeveli, yavaşça parlayan yaldızlı bir **"Devam et"**
  düğmesiyle görür; manzara açık kalır, izlenebilir. Düğme (ya da Enter /
  Boşluk) lobiler panelini açar. Oyundan ana menüye dönen oyuncu doğrudan
  paneli görür (`Root.tsx` → `splash`, `home.css` → `.home-continue`).
- **Kapalı düğmeler nedenini söyler:** Devre dışı (disabled) her düğme,
  üstüne gelince (dokunmatikte dokununca, birkaç saniye) neden kapalı
  olduğunu küçük bir parşömen balonda yazar: "Ordu sarayın önünde
  durmalı", "Yeterli altın yok (eksik: 120)", "İnşaat yeri dolu (2/2)",
  "3 dk 20 sn sonra". Neden düğmenin `data-why` özniteliğindedir (yoksa
  `title` okunur) ve onu kapatan hata/koşul mantığından türetilir
  (`upgradeError`, `buildError`, `roleError`… ve yardımcılar
  `apps/web/src/ui/why.ts` → `lackWhy`, `waitWhy`, `buildWhy`). Tarayıcılar
  kapalı düğmelere işaretçi olayı göndermediği için bu düğmeler CSS'te
  işaretçiye saydamdır; `apps/web/src/lib/whyTooltip.ts` imlecin altındaki
  kapalı düğmeyi kendisi bulur, balonu sayfaya sabit (kaydırılan panelde
  kesilmez) çizer, ekrana sığmazsa alta döner; kapalı düğmeye tıklama
  arkasındaki öğeye geçmez. Yalnızca imlecin vurduğu elemanın içindeki kapalı
  düğme sayılır: üstüne bir şey açılmış (açık bir liste) bir düğmenin balonu
  çıkmaz, tıklamayı yutmaz (önce açılır listenin satırları, altlarında kapalı
  bir düğme varsa yalnızca yazıları tıklanır oluyordu). Yeni bir kapalı düğme
  her zaman `data-why` taşımalıdır.
- **Komut bekleyen düğmeler:** Sunucuya komut gönderen her düğme cevabı
  bekler; bileşen başına kod gerekmez (`apps/web/src/lib/busyButtons.ts`,
  `net/online.ts` → `invoke`). Bir tıklamanın içinde başlayan komut o
  düğmeyi meşgul işaretler (`data-busy`, `aria-busy`): etiketinin yanında
  üç piksel sırayla yanar, imleç beklemeye döner ve cevap gelene kadar
  düğme yeni tıklamayı yutar. Cevaptan hemen sonra zincirlenen komut da
  aynı düğmeyi meşgul tutar. Aynı komut (aynı içerik) yoldayken yeniden
  gönderilmez, ikinci çağıran ilkinin cevabını bekler. Reddedilen komutun
  uyarısı eskisi gibi çıkar.
- Ortadaki alt şeritler (ordu takibi, hedef seçme, filo seyri; bekleyen plan)
  menü (dock) görünürken onun üstünde durur, menünün sekmelerini örtmez;
  yerleştirirken menü gizli olduğu için en altta kalırlar.
- Telefonda yakınlaştırma (+/−) ve üsse dön düğmeleri sağ altta, küçük
  harita sol alttadır; sohbet düğmesi küçük haritanın, sayaçlar sohbet
  düğmesinin üstünde durur. Üst çubuk ekranın tam genişliğindedir, her
  kartta ikon üstte, sayı altta. Ayarlar ve ana menü tek bir **hamburger**
  düğmesindedir; bu düğme çubuğun son kartıdır ve menü çubuğun altına doğru
  açılır. Dokunmatik
  ekranda bir karta dokunmak bilgi kartını açar; kartın altındaki "Depoya
  git" / "Halka git" ilgili sekmeyi açar, başka yere dokunmak kartı kapatır.
- **Dünya haritası** (M, küçük haritanın üst ucu; telefonda küçük haritaya
  dokununca) yalnızca **gezinmek** içindir: tıklanan yere gidilmez, kamera
  kıpırdamaz (`apps/web/src/game/WorldMap.tsx`). Fare tekerleği imlecin
  altındaki yeri sabit tutarak yakınlaştırır/uzaklaştırır (bütün dünyanın
  ekrana sığdığı 1× ile 6× arası), çift tık 2 kat yakınlaştırır, − / +
  düğmeleri ekranın ortasına doğru yumuşakça yakınlaştırır; sürükleyerek
  (telefonda tek parmakla) her yöne kaydırılır, iki parmakla sıkıştırınca
  yakınlaşır. Harita ekrandan kaçırılamaz: ekrandan küçükken ortada durur,
  büyükken ekranın ortası hep haritanın üstündedir. Geniş ekranda bütün dünya
  açılır, uzun ekranda (telefon) bakılan yerin çevresi biraz yakın açılır;
  boyut değişince ortadaki yer korunur. M tuşu açıp kapatır, Esc kapatır.
  Yollar, nehirler, lordların toprakları ve bakılan yer çerçevesi her
  yakınlıkta keskin kalan vektör çizgilerdir. Her lordun toprağı kendi
  renginde yarı saydam bir baklava, koyu bir alt çizgi üstünde kendi
  renginde (oyuncununki altın) kenarla çizilir; ortasında altın tepelikli
  direkte lordun renginde piksel bir sancak durur. Taç başkentleri küçük
  haritadaki iki kuleli kalenin büyüğüdür (tacın renginde). Sancak, kale,
  han ve kasaba simgeleri ile adlar yakınlaştıkça haritadan yavaş büyür
  (uzakta küçülüp kaybolmaz, yakında devleşmez). Adlar simgenin üstüne,
  yer yoksa altına, sağına ya da soluna yerleşir; hiçbir yere sığmayan ad
  (oyuncununki hariç) yakınlaştırılana kadar gizlenir, adlar üst üste
  binmez.
- **Üst çubuk ve alt menünün çerçevesi** (`apps/web/src/ui/barFrame.ts`):
  küçük haritanın çerçevesiyle aynı dilde, bir kez piksel piksel boyanan 9'lu
  dilim bir resim (`--bar-frame`, CSS `border-image`, sanat pikseli başına 2
  ekran pikseli): siyah dış çizgi, ışığa göre parlayan altın pervaz, her 16
  pikselde altın perçinli damarlı meşe bant, köşelerde altın plaka ve baklava
  topuz; içi koyu tahta panellerdir. Kaynak kartları ve menünün grupları altın
  çivili meşe dikmelerle ayrılır; açık sekme altın çizgili, kabartmalı tahta
  zeminlidir.
  **Bütün kutular aynı dildedir:** sekme sayfaları, pencereler, sohbet ve
  elçinin paneli aynı tam çerçeveyi koyu tahta (yatay kalaslar) zemin üstünde
  taşır, başlık şeritleri düz (kalas çizgisiz) ceviz tahtasıdır; küçük kutular (uyarılar, süren
  işler, görevler, elçinin notu, menüler, ipuçları, yerleştirme ve plan
  şeritleri) aynı çerçevenin 4 piksellik ince kesimini (`--slim-frame`: siyah
  çizgi, yaldızlı boncuk, altın perçinli meşe pervaz, köşede altın topuz)
  taşır. Sohbet ve elçi düğmeleri ile sağdaki harita düğmeleri (üsse dön,
  yakınlaştır) ince çerçeveli oyma tahta levhalardır. Dock'un üstündeki her
  şey (sayfalar, sohbet, süren işler, elçi) dock'un çerçevesini de hesaba
  katar (`--dock-frame`), aralarında boşluk kalır; telefonda dock ve sayfalar
  yalnızca üst kenarda çerçevelidir. Bir sayfa (devriye/haraççı penceresi
  dahil) açıkken sohbet ve elçi düğmeleri gizlenir, pencerenin üstüne
  binmez.
- **Küçük haritanın çerçevesi** baklavayı izleyen, ekran pikseliyle boyanmış
  bir piksel sanatıdır (`apps/web/src/game/minimapFrame.ts` → `paintFrame`,
  başlıklar `paintCap`; kenarları gerçek 2:1 izometrik basamaklardır):
  haritanın kenarında dither'lı iç gölge (harita çerçeveye gömülmüş gibi),
  siyah çizgi, yuvarlak altın pervaz, iki yanı oyulmuş ve ışığa göre
  pahlanmış damarlı meşe bant (sol üst kenarlar aydınlık, sağ alt gölgede),
  her kenarın ortasında yaldızlı bir baklava çivi, derzli gri taş halka,
  siyah dış hat ve sağ alt kenarların altında kısa bir gölge. Tonlar
  arası geçiş Bayer dither'ıyla yapılır. Çerçeve harita kutusunun
  boyundan ölçeklenir (masaüstünde 17, orta ekranda 12, telefonda 10
  piksel kalınlık) ve tıklamayı haritaya geçirir.
- Küçük haritada her krallığın **hududu kendi renginde** yarı saydam bir
  alan ve çerçeveyle (oyuncununki altın çerçeveli) boyanır. Simgeler (kale,
  kasaba, devriye) büyüktür, taç kaleleri en büyüğüdür; krallık sancakları
  kasabalardan biraz küçüktür.
- Küçük haritada krallıklar renkli sancakla, **taç başkentleri**
  tacın renginde (kızıl / lacivert) küçük bir **kale** simgesiyle (iki
  kuleli, kapılı; üstünde sancak yok),
  **kasabalar** sahibinin renginde çatılı küçük bir **ev** simgesiyle
  (sahipsizse saman rengi) ve gezen **taç devriyeleri** tacın renginde
  sancaklı birer noktayla (2 saniyede bir yerleri güncellenir) gösterilir;
  sancaklar en üstte çizilir. Dünya haritasında da kasabalar ve devriyeler
  görünür. Küçük harita 512 piksel çözünürlükle (2 karoya 1 piksel) çizilir
  ve masaüstünde 320, orta ekranda 200, telefonda 132 piksel karedir.
- Küçük haritada ve dünya haritasında **ekranda görünen alan** beyaz bir
  çerçeveyle çizilir: ekranın dört köşesinin zemindeki karşılığı (izometrik
  olduğu için eğik bir dörtgen); yakınlaştırınca küçülür, uzaklaştırınca
  büyür, harita dışına taşan kısmı kesilir. Çok yakından bakarken de
  görünsün diye en küçük boyu vardır (küçük haritada 18 piksel). Kamera bir
  karo kaydıkça güncellenir, en sık 120 ms'de bir (`createWorld.ts` → `onCamera`).
- Harita ekranının sağ üstünde tek bir **hamburger** düğmesi vardır; aşağı
  açılan menüsünde **Ayarlar** ve **Ana menü** durur (telefonda aynı menü üst
  çubuğun son kartıdır). Yakınlaştırma düğmelerinin üstündeki **üsse
  dön** düğmesi (konum pini) kamerayı krallığa götürür.
- **Açılır seçimler** tarayıcının kendi `<select>`'i değil, oyunun
  `PixelSelect`'idir (`apps/web/src/ui/hud/PixelSelect.tsx`): ahşap düğme ve
  piksel ok; liste oyunun çerçevesinde, üstüne gelinen altın vurgulu, seçili
  olanın yanında altın elmas, isteğe bağlı simge ve soluk etiket ("kimsenin
  değil"). Liste sayfanın üstünde (portal) açılır, yer yoksa yukarı açılır,
  uzunsa kayar; dışarı tıklamak ya da Esc kapatır; oklar, Home/End, Enter ve
  harf yazarak arama çalışır. Kodda yeni `<select>` kullanılmaz.
- Haritada sağ tık tarayıcının sağ tık menüsünü açmaz (yalnızca harita
  tuvalinde engellenir; menüler, üst çubuk, sohbet gibi arayüz öğelerinde
  açılır). Sağ ve orta tuş haritayı sürüklemez, karo seçmez.
- **Küçük haritanın köşe düğmeleri** (`apps/web/src/ui/MinimapCorners.tsx`):
  baklava biçimli küçük haritanın dört ucunda, çerçevenin ucuna geçirilmiş
  yaldızlı **köşe başlıkları** düğmedir: karo (baklava) biçimli, ışığa
  göre parlayan altın kenar, çöküntü koyu meşe yüz, iki yanında altın
  perçin ve ortada oyunun piksel simgesi (masaüstünde 92 piksel genişlik
  ve 24 piksellik simge, orta ekranda 68 / 16, telefonda 60 / 16).
  Yalnızca karo tıklanır; üstüne gelince yüz aydınlanır ve simge bir piksel
  kalkar, basınca başlık bir piksel çöker ve kararır. Sayı rozeti başlığın
  sağ üst kenarında, simgenin dışında durur. Üst uçta **Dünya haritası** (M), sağ
  uçta **Sıcak noktalar** (H; o an
  önemli olanlar: içinde olduğun muharebe ve kuşatmalar, kuşatılan, asileri
  kapıda ya da ayaklanmış kasabaların, sınırının 14 karo yakınındaki
  savaştaki düşman orduları, sana gelen haraççılar ve taç devriyesi; sayı
  rozeti, varken başlığın yüzü kırmızı mineye dönüp yanıp söner), sol uçta **Ordularım ve
  filolarım** (Tab, sayfada odaklı bir şey yokken; sayı rozeti) ve alt
  uçta **Fotoğraf modu** (P). Sıcak noktalar ve ordular düğmesi her
  basışta sıradakine geçer: kamera oraya gider (ordu ya da filo seçilir),
  küçük haritanın üst ucunun üstünde, düğmeye binmeden ve bütün arayüzün
  önünde (ekranın kenarlarından taşmadan) "2/3 · …" diye kısa bir yazı
  çıkar (`MinimapCorners.tsx` → `Caption`); yoksa düğme
  sönüktür. Kısayollar yazı yazarken ve Ctrl/Cmd/Alt basılıyken çalışmaz.
  **Fotoğraf modu** bütün arayüzü gizler (yalnız harita kalır), kenarları
  hafifçe karartır ve sol altta lordun adını ve tarihi yazar; Boşluk
  kamerayı yavaşça süzdürür, tekerlek yakınlaştırır, başka herhangi bir
  tuş ya da tıklama moddan çıkar.
- **Ayarlar** (`apps/web/src/ui/home/SettingsPanel.tsx` → `SettingsTabs`;
  model `net/settings.ts`): köşedeki menünün **Ayarlar**'ı (ana menüde Ayarlar
  sekmesi) sekmeli bir pencere açar (son bakılan sekme hatırlanır; Esc
  kapatır). Her şey profilde saklanır, cihazdan cihaza taşınır. Her satırda
  ayarın adı ve ne yaptığı solda, düğmesi sağda; seçili seçenek altın zeminlidir.
  - **Ses:** en üstte bir **mikser** durur: önce **Genel ses** (bütün seslerin
    üstündeki düzey ve düğmesi; `Settings.master`, `masterVolume`, varsayılan açık,
    %100; her türün düzeyiyle çarpılır, kapatınca oyun susar), altında her tür
    tek satırda adı, sürgüsü, yüzdesi ve Açık/Kapalı düğmesiyle (ne olduğu üstüne
    gelince yazar). Sürgüler oyunun piksel dilindedir (koyu oluk, değere kadar
    altın dolgu, kare altın tutamak; `index.css` → `input[type='range']`, dolgu
    `--fill` ile). Mikserin altında düğme sesleri ve müziğin parçaları durur.
    Türler: müzik, **savaş müziği** (savaş izlerken), **ses efektleri**
    (elçinin haberleri, olaylar, inşaat, pencereler) ve altında **düğme
    sesleri** (tık), **yağmur ve gök gürültüsü**, **ortam sesleri** (rüzgâr,
    su, kuşlar, köy; §4.2.1), **elçinin sesi** (elçi ve
    haraççıbaşının mırıltısı): her biri ayrı açılıp kapanır ve ayrı ses
    düzeyindedir (`sfx.ts` → `setSfx`, `setVoice`, `setRain`,
    `setAmbience`, `setBattleMusicLevel`; her türün kendi kazanç düğümü, hepsi sıkıştırıcıdan
    geçer). Ayrılmadan önce kaydedilmiş profillerde elçinin sesi ve yağmur efekt
    ayarını, savaş müziği müzik ayarını alır (`fromSaved`).
  - **Görüntü:** detay animasyonları, canlı gölgeler, gece ışıltısı, kuşlar,
    bulutlar, keskin çizim (uzaklaşınca ekranın tam yoğunluğu) aç/kapa; **hava
    efektleri** Tam / Sade (daha az damla, bulut gölgesi ve sıçrama yok) /
    Kapalı (hava hiç çizilmez ve duyulmaz).
  - **Telefon ekranında zorunlu olanlar** (`lib/power.ts` → `usePhone`:
    720 pikselden dar ya da yatay tutulmuş dokunmatik ekran; `net/settings.ts`
    → `PHONE_OFF`): detay animasyonları, kuşlar, bulutlar, gece ışıltısı ve
    keskin çizim hep kapalıdır, hava en çok Sade çizilir. Bu satırlar Görüntü
    sekmesinde ve güç tasarrufunun listesinde kapalı (disabled) görünür,
    üstüne gelince "Telefonda hep kapalı (pil ve bellek için)" yazar; oyuncunun
    seçimi profilde kalır, büyük ekranda yine geçerlidir. **Kare hızı zorunlu
    değildir:** telefonda da Akıcı / Dengeli / Pil dostu seçilir ve güç
    tasarrufu onu Pil dostuna çekmez. Canlı gölgeler oyuncunun seçimindedir.
  - **Performans:** **kare hızı** Akıcı / Dengeli / Pil dostu (§12) ve **güç
    tasarrufu** Otomatik / Açık / Kapalı; altında **güç tasarrufu açıkken**
    neyin kısılacağı tek tek seçilir (piksel onay kutuları: kare hızını Pil
    dostu yap, detay animasyonları, canlı gölgeler, gece ışıltısı, kuşlar,
    bulutlar, havayı sadeleştir, keskin çizim; varsayılan canlı gölgeler hariç
    hepsi). Görüntü sekmesi tasarrufun şu an kıstığı satırlarda bunu yazar.
    Harita bu ayarlardan tek bir görüntü tarifi alır (`videoOf` → `WorldView.setVideo`).
  - **Elçi** (oyunda): öğütler ve öğretici; öğretici tamamlanınca düğmesi
    "Tamamlandı" yazar ve tıklanmaz.
  Efektler tarayıcıda sentezlenir (`apps/web/src/audio/sfx.ts`): savaş davulu
  ve boru, savaş ilanı, elçi borusu, kötü haber çanı, inşaat başlarken testere
  ve tokmak, bina bitince çekiç, günün olayları için arp.
  **Müzik** (`audio/music.ts`) de sentezlenir ve beş parça sırayla çalar (her
  biri 2,5–3,5 dk, sonu bir geçişin bitiminde; aralarında 3 sn sessizlik; aynı
  parça art arda gelmez; açılışta seçiliyse hep Han): **Han** (D dorian, 6/8, lavta ve
  dron; ilk meyhane ezgisi), **Kudüs yolu** (haçlı yolu, D hicaz, ud, ney, güçlü
  dron, 3+3+2 def), **Kralın yolu** (ortaçağ İngilteresi, G miksolidyen, 3/4,
  blok flüt, lavta, tabor), **Ufuk** (EU4 tarzı sefer havası, A eolyen, yaylı
  pad, uzak boru, arp, uzak timpani) ve **Sarhoş Ejder** (fantastik meyhane
  jig'i, E dorian, keman, tıngırdatılan lavta, bodhrán). Hepsi aynı yankıyı
  (tek kanallı) ve davullar tek bir gürültü tamponunu paylaşır; notalar kısa
  ömürlü osilatörlerdir, 150 ms'lik zamanlayıcıyla 0,6 sn önceden kurulur.
  Adları ruhlarına göredir: **Ocak Başında** (Han), **Kudüs Yolunda**, **Kralın
  Çayırları**, **Ufuktaki Sancaklar**, **Sarhoş Ejder Hanı** (`TRACKS`).
  Ayarlar → Ses'te müziğin altında **Çalacak parçalar** listesi vardır: işaretli
  parçalar sırayla çalar (en az biri işaretli kalır; `Settings.tracks`,
  profilde), her satırın **Çal** düğmesi o parçayı bir sonraki ölçüden başlatır
  (işaretli değilse işaretler), çalan parça altın renkte "Şimdi çalıyor" yazar.
  Çalan parçanın işareti kaldırılırsa bir sonraki ölçüde başka parçaya geçilir.
  Geliştirmede `?music=0..4` ilk parçayı seçer.
  **Kayıtlar:** parçaların birer çalınışı `apps/web/public/music/` altında MP3'tür (`01-ocak-basinda.mp3` …
  `05-sarhos-ejder-hani.mp3`, 128–190 kbps VBR, tepe −0,9 dB). Oyunun çaldığı notaların aynısıdır, çevrimdışı
  kaydedilir (`music.ts` → `renderPiece`: `OfflineAudioContext`, barlar oyundaki gibi bir saniye önden kurulur);
  parçalar rastgele çalındığı için her kayıt biraz farklıdır. Yeniden kaydetmek için `bun scripts/music-export.ts`
  çalıştırılır, `bun run dev` açıkken yazdırdığı `/music.html?save=…&token=…` açılır (ffmpeg gerekir).
  Kapatılan müzik sessizce çalmaya devam etmez: sesi kısıldıktan sonra ses
  motoru durdurulur, açılınca yeniden başlar (`music.ts` → `setMuted`). Efekt
  ses motoru da 4 saniye bir şey çalmayınca uyutulur, ilk seste uyanır (yağmur
  ya da savaş müziği sürerken uyumaz).
  Hafif bir sıkıştırıcı efektlerin yüksekliğini eşitler.
  - **Her pencerenin kendi sesi vardır** (hepsi 1 saniyenin altında, pencere
    açılınca bir kez çalar; `sfx.ts` → `playOnce`). Elçi haberlerinin sesi
    `NoticeArt.tsx` → `soundForNotice` ile türünden ya da sahne ailesinden
    seçilir: taç armağanı borazan fanfarı, taç devriyesinin uğrayışı nal sesi
    ve kısa boru, haraççı sayılan altın ve sert davul, handaki devriye ud ve
    tezahürat, hediye parıltı ve altın, nezaket elçisi yumuşak boru, ret
    düşen iki nota, ittifak sıcak iki notalı bakır (bozulunca düşen tritone),
    barış çanlar, savaş ilanı savaş borusu ve davul trampeti, sınırdaki ordu
    pes davullar, hakaret keskin bakır vuruşu, casus pizzikato ve kapanan
    kapı, sabotaj çatırdayan ateş, ayaklanma kalabalık uğultusu, kaçırma
    ürkütücü pes ton, yağma kılıç şakırtısı, deniz muharebesi dalga ve
    şakırtı (abluka dalga ve pes boru), kuşatma mancınık gümlemesi, kasaba
    alınınca zafer fanfarı ve tezahürat, muharebe başı davullar, sonu
    kazanana zafer borusu, kaybedene hüzünlü boru; kral ordunun başında
    görkemli boru, kral düşünce ağır çan, kasaba satışı kasa zili ve altın, hanedanın
    düğünleri ve evlilik teklifleri düğün çanları, hoşnutsuz kardeş tehdit
    davulları, taht davacısının isyanı savaş borusu, bastırılması zafer
    fanfarı, korunan taht zafer borusu, kaybedilen taht ağır çan,
    kervan dönüşü araba ve altın, ulaşmayan emir düşen ıslık, kuleler ok
    vızıltısı; yağmacılar yolu tutunca kılıç şakırtısı, takip başlayınca
    gerilimli pes davul, yollar ya da sular temizlenince sakin ton, korsanlar
    sulara gelince abluka borusu, korsan teknesi batınca zafer borusu (§7.9,
    §8.5). Hanedan haberleri (doğumda müzik kutusu ninnisi, ölümde cenaze
    çanı, taç giyme, naipler, reşit olma, kraliçenin gelişi çanları), taç
    elçisinin isteği (saray fanfarı), sefer dönüşü (nal sesi ve boru), taçların
    tanıtımı (fanfar) ve "Sen yokken" raporu (sayfa çevirme) da kendi
    sesleriyle açılır.
  - **Elçinin sesi:** Elçinin sözleri yazılırken (`Advisor.tsx`) elçi
    Animal Crossing gibi anlamsız hecelerle mırıldanır (`sfx.ts` → `babble`):
    her 2–3 harfte bir, en sık 70 ms'de bir, 60–90 ms'lik pes, yaşlı bir ses;
    hecenin ünlüsüne göre iki formant süzgeci, heceden heceye değişen perde,
    soruda yükselen ton. Yazı noktalama işaretlerinde durur, elçi de susar;
    yazı atlanınca ya da pencere kapanınca ses biter. Efekt ayarına ve sesine
    bağlıdır, kısıktır.
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
| `kingdoms.state.pretender` | taht davacısının karargâhı (§9.1.1); `lobby_kingdoms.pretender` herkese açar |
| `kingdoms.state.liegeOffer` | davacıyı destekleyen tacı bırakıp öbür taca geçme teklifi (§9.1.1), bitiş anıyla |
| `lobbies` | tohum, `world_rev` (dünya üretim sürümü), `river_keep` (genişleyen nehrin kuru bıraktığı alanlar), `water_links` (sürüm 7'nin kanalları), `season_start`, ayarlar |
| `kingdoms` | `state jsonb`, `version`, `updated_at`, ad, renk |
| `armies` | sahibi, birlikler, `path`, `depart_at`, `arrive_at` |
| `orders` | elçi emirleri: `issued_at`, `effective_at`, içerik |
| `events` | `resolve_at`, tür, katılanlar |
| `battles` | sonuç raporu, tohum, kayıplar |
| `kingdom_daily` | günlük istatistik |
| `chat_messages` | lobi, gönderen krallık, ad, renk, metin, zaman |
| `minigame_scores` | mini oyun puanları: lobi, lord, oyuncu, oyun, puan, zaman, ad/renk/lobi adı (yalnız sunucu yazar) |
| `lobby_outlaws` | yağmacı çeteleri, korsan tekneleri, yağmacı klanları ve korsan limanları (§7.9, §7.9.1, §8.5): tür (`band` / `boat` / `clan` / `haven`); limanda `pop`, `pop_at`, `held` (abluka eden filo); sıra, kaç kez yenildiği (klanda kuşağı), `down_until`, süren muharebe, `shift`, kayıplar; klanda `born_at`, `fallen` ve yalnız sunucunun okuduğu `cave` (yalnız sunucu yazar; satırı olmayan dokunulmamıştır) |

---

## 12. Performans Hedefleri

- Harita chunk'lar halinde, görünür alan + tampon kadar render edilir.
- Sunucu tarafında **ilgi alanı (area of interest)** filtrelemesi: istemciye
  yalnızca görebildiği/istihbaratı olan veriler gönderilir (bu aynı zamanda
  savaş sisi hilesini önler).
- Hedef: 10–20 oyunculu bir lobi tek bir sunucu sürecinde rahatça
  çalışabilmeli; birden fazla lobi yatay ölçeklenebilmeli.
- İstemci orta segment bilgisayarlarda (ve ileride mobilde) akıcı çalışmalı.
- **Pil ve işlemci (şu an uygulanan):** Harita kendi döngüsüyle, gerektiği
  kadar sık çizilir (`apps/web/src/game/pacing.ts`; Pixi'nin kendi döngüsü ve
  sistem ticker'ı kapalıdır, ikisi de bu döngüyle adım atar):
  - Oyuncu haritayı sürüklerken, yakınlaştırırken, tekerlekte, fareyi
    haritada gezdirirken, kamera bir şeyi takip ederken ve bunlardan sonraki
    1,5 saniye **60 kare/sn** (120 Hz ekranda da 60).
  - Duruyorken yakında (½× ve üstü, yürüyenler görünür) **24**, uzakta
    **15**; 45 saniye hiç dokunulmazsa **10**. Bir pencere (`.modal`) haritayı
    örtüyorsa **8**. Sekme gizliyse hiç çizilmez.
  - Pixi'nin durgun imleç için tekrarladığı sahte fare hareketleri haritayı
    "etkin" saymaz.
  - Tuval çözünürlüğü (`canvasResolution`): harita piksel sanatıdır ve tam
    sayı yakınlıklarda (1×, 2×, 3×) en yakın komşuyla büyütülür; bu
    yakınlıklarda tuval **ekran noktası başına 1 piksel** çizilir, görüntü
    aynıdır ama Retina'da 4 kat az piksel boyanır (dizüstü ve telefonun pili
    piksel boyamaya gider). Uzaklaştırınca (½× ve altı) binalar sanatlarından
    küçük çizildiği için ekranın kendi yoğunluğu (en fazla 2) kullanılır;
    keskin çizim kapalıyken (ya da güç tasarrufu onu kısarken) her yakınlıkta 1. Yakınlık değişince tuval yeniden
    boyutlanır. Gece ışıltısının bulanıklığı ekran noktası başına yarım
    pikselde çizilir. WebGL düşük güç tercihiyle açılır.
  - Arayüzün ikonları (`icons.tsx` → `Icon`) piksel başına bir `<rect>`
    yerine renk başına tek `<path>` ile çizilir ve `memo`'dur: arayüz her
    saniye yeniden çizilirken yüzlerce ikon artık yeniden kurulmaz.
  - Ölçüm (bu düzeltmelerle; geliştirme sürümü, 1440×900, DPR 1, boşta ana
    iş parçacığı): %31 → ~%21; kalanın çoğu Pixi'nin kendi çizimi. Retina'da
    ekran kartı tarafındaki kazanç (4 kat az piksel) buna dahil değildir.
  - Arayüzün saati (`now`) saniyede bir, saniyenin başında ilerler (önce 250
    ms'de bir bütün arayüzü yeniden çiziyordu); sekme gizliyken durur, dönünce
    hemen yetişir. Haritanın üstündeki imleç bilgisi yalnızca altındaki karo ya
    da bina değişince, kameranın yeri (küçük haritanın çerçevesi) en sık 120
    ms'de bir arayüze bildirilir. Devriye noktaları devriye yoksa ya da sekme
    gizliyse güncellenmez.
- **Kare hızı ve güç tasarrufu** (Ayarlar → Performans; profilde `pace`,
  `power`, `cuts`; `apps/web/src/lib/power.ts`, `game/pacing.ts`): kare hızı
  üç kademedir (etkin / yakında / uzakta / uzun süre dokunulmazsa / pencere
  altında): **Akıcı** 60 / 30 / 20 / 15 / 8, **Dengeli** (varsayılan) 60 / 24 /
  15 / 10 / 8, **Pil dostu** 30 / 15 / 10 / 8 / 5. Güç tasarrufu Otomatik'te
  dokunmatik ve faresiz cihazlarda, hareketi azalt tercihinde ve dizüstü pilde
  çalışırken (tarayıcı söylüyorsa; Safari söylemez) açılır. Açıkken oyuncunun
  seçtikleri kısılır (varsayılan: kare hızı Pil dostu, detay animasyonları,
  kuşlar, bulutlar, gece ışıltısı kapalı, hava sade, keskin çizim kapalı;
  canlı gölgeler açık kalır).
- **Doku atlası** (`game/textures.ts`): kodla üretilen bütün sprite'lar
  (ağaçlar, binalar, yürüyenler, gölgeler…) 2048² atlas sayfalarına raf
  yöntemiyle paketlenir (2 piksel saydam payla; sayfadan büyükler kendi
  dokusunu alır). Önce her sprite'ın kendi dokusu vardı; Pixi 16 dokuda bir
  partiyi böldüğü için kare başına ~340 çizim çağrısı GPU sürecine gidiyordu,
  şimdi ~11. Sayfa, değiştiği karede çizimden hemen önce bir kez yüklenir
  (`flushTextures`). Her güneş adımında yeniden dökülen gölgeler ayrı bir
  havuzdadır (`'shade'`; sayfadaki bütün dokular serbest kalınca sayfa yeniden
  doldurulur), maskeli pencere ışıkları da (`'masked'`). Kare kare birer birer
  üretilen bina gölge kaplamaları (bir binaya düşen gölge) kendi küçük
  havuzundadır (`'cast'`, 512² sayfalar; her yeni kaplama küçük bir sayfa
  yükler). Önce her biri ayrı bir tuval ve GPU dokusuydu (`'own'`) ve
  haritadaki **bütün** binalar gölgeleniyordu: dolu bir lobide 2.400 bina,
  1.500'ü aşkın ayrı tuval; telefonlar (iOS) bir süre sonra tuval belleğini
  aşıp sekmeyi çökertiyordu. Şimdi yalnızca ekranın çevresindeki binalar
  gölgelenir (`shadows.ts` → `REGION`: 1024 dünya pikseline yuvarlanmış
  görüş alanı ve bir hücre pay; kaydırınca yalnızca yeni gelenler
  gölgelenir, alandan çıkanların kaplaması serbest kalır).
- **Ekran dışı binalar ve bellek** (`createWorld.ts` → `cullBuildings`,
  `LOW_MEMORY`): ekranın dışındaki binalar (ağaçların payıyla), hareketli
  kareleri, gece pencereleri, gölgeleri ve üstlerine düşen gölge kaplamaları
  Pixi'nin `culled` bayrağıyla çizimden çıkarılır (`visible`'a dokunulmaz);
  gölgesi yalnızca geri gelince yeniden hesaplanır. Dolu bir lobide binlerce
  bina her kare toplanıp GPU'ya gidiyordu. Yürüyenlerin binalarla
  karşılaştırılması (kim kimin arkasında, hangi kapı açık) ekran ızgarasıyla
  yapılır (256 piksel hücreler; `sortWalkers`): her yürüyen yalnızca
  çevresindeki binalarla sınanır (önce haritadaki bütün binalarla, boşta
  karenin en pahalı işiydi). İş yokken bina gölgesi taraması 15 karede bir
  yapılır. Telefon ve 4 GB ve altı cihazlar (`LOW_MEMORY`: dokunmatik ya da
  `deviceMemory` ≤ 4) ekran dışındaki chunk'lardan en çok 64 MB tutar
  (masaüstü 192 MB; önce 320 MB) ve 2 boyama işçisi açar (masaüstü 4; her
  işçi dünyanın bir kopyasını ve kendi sprite'larını, ~40 MB, tutar).
  Ölçüm (geliştirme sürümü, dolu lobi, boşta): ana iş parçacığı %19 → %15
  (kalanın üçte biri geliştirme sürümünün React'i).
- **Filtreler:** gölge katmanının saydamlık filtresi ve gece ışıltısının
  bulanıklığı ekranın gördüğü alanla sınırlıdır (`filterArea`, her kare kamera
  koordinatında): her karede bütün ışıkların ve gölgelerin sınırları
  ölçülmez. Işıltı yarım çözünürlükte, iki geçişle bulanıklaşır.
- **Ses:** müziğin yankısı tek kanallı ve 2,6 sn'dir (stereo 3,2 sn'lik yankı
  çalıştığı sürece dört evrişim yapıyordu); efekt ses motoru boşta uyur.
- **Ölçüm (bu düzeltmelerle):** üretim sürümü, 1440×900, DPR 1, yakın zoom,
  güç tasarrufu açık, müzik açık; Chrome'un bütün süreçleri: boşta %43 →
  %29 (GPU süreci %14 → %4–9). Ölçüm `ps` ile süreç ağacının CPU zamanından,
  WebGL çağrıları `drawElements`/`texSubImage2D` sayılarak alındı.
- **Çizim yükü (şu an uygulanan; ölçüm: 1440×900, 1× yakınlık, ormanlık bir
  yer, ana iş parçacığının dolu payı):** duruyorken %31 → %16, sürüklerken
  %76 → %35, fırtınada duruyorken %12 (yağmur kendisi ölçülemeyecek kadar
  az tutar). Uzun süre gezinmede bellek ve doku sayısı büyümez.
  - Bir chunk ekrandan çok büyük olduğu için sallanan ağaçlar da tek tek
    ayıklanır (`createWorld.ts` → `treeView`, `treeShown`): ekranın (gölge
    yönünde geniş payla) dışındaki ağaçlar ve gölgeleri çizilmez. Önce
    ağaçların üçte ikisi ekran dışındaydı ama her kare sıralanıp
    gölgeleniyordu.
  - Gölge katmanı kendi render grubudur (`shadows.ts`): yürüyenlerin
    katmanı her kare yeniden sıralandığında (yürüyen her şey derinliğini
    değiştirir) Pixi yalnızca o katmanın çizim listesini yeniden kurar,
    gölgeleri değil. Değişmeyen bir şeyin gölgesi her kare yeniden hesaplanmaz
    (bakış, yön, güneş adımı, yer ve ölçek hatırlanır); binaların birbirine
    düşen gölgesi için her kare bütün binalardan bir metin anahtarı kurulmaz.
  - Kasaba adları ve ilerleme çubukları, aynı kasabalar/çubuklar aynı ad ve
    renkle yeniden verildiğinde (rakipler her yenilendiğinde) yeniden
    yazılmaz; kuşatmasız kasabanın çubuğu her kare silinmez.
  - **Paket bölme:** oyun (harita, Pixi, bütün paneller ve resimler) ayrı bir
    parçadır (`Root.tsx` → `lazy(App)`): giriş ekranı ve menü 2,19 MB (733 KB
    gzip) yerine 665 KB (207 KB gzip) indirir; oyun parçası menü açılır
    açılmaz arkada indirilir.
  - **Ağ:** katmanın dakikalık yenilemesi sekme gizliyken durur, sekme
    dönünce bir kez yenilenir. Vadesi geçmiş bir şey için sunucuyu dürtme
    (`settle` + bütün katmanı yeniden çekme, 11 sorgu) 5 sn'de bir değil, art
    arda 5 / 10 / 20 / en çok 30 sn arayla yapılır; gizli sekme dürtmez
    (`net/layer.ts`). Elçi haberleri günlüğe bir kez yazılır, her saniye
    bütün haberler yeniden tarif edilmez.
  - **Sunucu tick'i:** krallıklar bir tick'te ~10 kez bütün `state`'leriyle
    okunuyordu; şimdi ilk okumadan sonra yalnızca sürümlerine bakılır
    (`server.ts` → `freshKingdoms`), bir krallık yazılmamışsa önceki satırlar
    kullanılır (her durum yazımı sürümü artırır).

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
SIM_DIR=<klasör> scripts/sim/run <komut>
                     Sanal saatli lobi: gerçek `command` ve `tick` yerel Supabase'e karşı
                     (önce db:start). setup, status, news, wait, cmd, grant, patch, sql;
                     her şey SIM_DIR/events.md ve snapshots.csv'ye yazılır (docs/SIM-TEST-2-RAPORU.md)
bun scripts/offline-balance.ts [saat] [tohum]
                     Her saray seviyesinde tipik bir lordun çevrimdışı gecesi ve çevrimiçi saati
                     (BAL='{"yol.anahtar":değer}' ile denge denemesi)
bun scripts/playtest.ts <kayıt.json> <komut>
                     Yalnızca paylaşılan kurallarla (sunucusuz) tek lordluk denemesi
```

Bulut projesi: `jafnaqdiukfmkefcjsqo` (CLI ile `supabase link` yapılmış).
Lokal Supabase Studio: http://127.0.0.1:54323. İstemci ortam değişkenleri
`apps/web/.env.local` içindedir (şablon: `apps/web/.env.example`).
