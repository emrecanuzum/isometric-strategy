# Sim oyun testi raporu (2026-10-23)

İki test koşuldu:

1. **Haiku, ilerleme testi** (`scripts/playtest.ts`): Yalnızca paylaşılan kurallar (`advance`) çalıştı, sunucu tarafı yoktu (haraç, devriye, yağmacı). 10 oyun saati, tohum 777.
2. **Sonnet, tam özellik testi** (`scripts/sim/`): Gerçek `command` ve `tick` edge function'ları yerel Supabase'e karşı sanal saatle çalıştı. 68 oyun saati; oyuncu lordu, rakip taçta bot1, kendi taçta bot2.

Aşağıda önce doğrulanmış özet, sonra ajanın raporu ve iki ham log var.

## Doğrulanmış bulgular

| # | Bulgu | Tür | Kanıt |
|---|---|---|---|
| 1 | Haraç hazinenin %25'ine kadar alıyor ve saatte ~2 kez geliyor. Ödeyen lordun hazinesi ~600'de sabitleniyor, saray 3'ün istediği 1200 altın birikmiyor. | Denge | sim-log t=610 dk |
| 2 | Reddetmek, ödemekten ~4 kat ucuz: ödemek saatte ~340 altın, reddetmenin ekonomik bedeli ~0. Çevrimdışı oyuncu reddedemiyor, hep ödüyor. | Denge | sim-log t=1743 dk |
| 3 | Muharebede ölüler `Math.round(asker × güç × 0,008 × zar)` ile hesaplanıyor. ~12 askerin altındaki ordu sıfıra yuvarlanıyor ve kimseyi öldüremiyor. | **Bug** | `packages/shared/src/military.ts:942-943`, battles #1 ve #2 |
| 4 | Tüccar yapı ve savaş malzemesinde yedek bırakmıyor (yalnızca yemekte 30 turluk yedek var). Ev ve yükseltme için malzeme kalmıyor. | Denge/UX | dört ayrı testte tekrarlandı |
| 5 | Köylü sayısı hep evlerin verdiği yere eşit. Sınıra ulaşılamamasının sebebi barınak ve yemek, büyüme hızı değil. | Nüfus | sim-log t=1040 dk |
| 6 | Yemek çarpanı 0,6 olan bir yerde 6 tarla ve 1 iskele ~40 kişiyi doyuramıyor; bütün oyun açlık sarmalında geçti. | Denge | sim-log t=98 / 1125 / 1518 dk |
| 7 | Saray 2–3 boyunca kendi tacının devriyesi hiç bahşiş bırakmıyor (eğlence merkezi 4. seviye sarayda açılıyor). Haraca giden 5754 altına karşı taçlardan gelen 258 altın. | Denge | sim-report §1 |
| 8 | Elçi haberleri saatte 4,2; bunların %85'i rutin haraç ve devriye haberi. Filo kaybı hiç haber olmuyor. | UX | sim-report §6 |
| 9 | 30 yaşını geçmiş kardeş, kardeş olduktan 0,5–3 saat içinde hastalıktan ölüyor. Bu yüzden taht davacısı isyanı pratikte hiç tetiklenemiyor. | Tasarım | sim-log t=2798 dk |
| 10 | 8 saatlik yoklukta altın 1419'dan 0'a, köylü 31'den 7'ye indi, kasaba isyan edip koptu. | Denge | sim-log t=3118 dk |
| 11 | Sarayın kapısının önü binalarla kapanınca ordu "route" hatası alıyor ve oyuncuya neden söylenmiyor. | UX | sim-log t=1819 dk (testte simülatörün yerleştirmesi tetikledi) |
| 12 | Kadırganın tayfası asker havuzundan geliyor ve bu şart oyuncuya söylenmiyor. | UX | sim-log t=3646 dk |

**Bug olmadığı anlaşılanlar:**
- Atilla'nın yaşı doğru; ajan doğumu geç loglamıştı.
- Oyunda görünüp cevap vermeyene haracın %50 fazla kesilmesi kural gereği.
- Haraç sıklığı saatte ~2, tasarıma uygun.

**Simülatörden kaynaklananlar:**
- İnşaat sırasının hep dolu görünmesi (ilk test; ajan zamanı 5 dakikalık adımlarla ilerletiyordu).
- `build` komutunun yapıları sarayın dibine dizmesi.

---

## Ek A: Sonnet tam özellik testi, ajanın raporu

### Crownherald oynanış analizi (sanal saat t=0 → 4075 dk ≈ 68 oyun saati; oyuncu 'player' + bot1 (rakip taç) + bot2)

### 1. Haraç / devriye / bahşiş (patrol_visits, oyuncu)

| Aşama | Haraç isteği | Ödenen (oyuncu/otomatik) | Reddedilen | İstenen toplam | Bahşiş/armağan |
|---|---|---|---|---|---|
| sv1 (0-78 dk) | 0 | – | – | – | yeni lord bonusu 161 (+9 altın,9 yemek) + rakip taç kesesi 88 |
| sv2 (78-1090) | 34 | 22 (otomatik/ödenen; 2'si elle) | 12 | 4026 | yok |
| sv3 (1090-1830) | 24 | 5 | 19 | 3476 | yok |
| sv4 (1830-4075) | 67 | 18 (otomatik) | 49 | 6023 | yok |

Toplam 125 haraç / 13.525 istenen; hazineden fiilen çıkan (books.crownPaid) 5.754; alınan armağan/bahşiş (crownGot) 258. Kendi tacının devriyesi 68 kez uğradı (saatte ~1) ama eğlence merkezi (tavern 1200g) kurulamadığı için hiç bahşiş bırakmadı: yalnız 'patrol_visit' haberi. Bot1/bot2'de ~6 'patrol_tip' (yeni lord) sonrası da bahşiş yok.
- Haraç sıklığı ~2/saat. İstek = hazinenin %25'ine kadar (küçük hazinede %25 tavan, 1000+'da ~142 sabit, 1800'de 160). Cevapsız ve oyuncu 'aktif' (seen) ise **x1,5 (AFK)** ile otomatik ödenir (82→123, 142→213); çevrimdışıysa olağan miktar. 
- Reddetmek: rakip taçla ilişki −10/ret (taban −100), rakip taç lordlarıyla (bot1) ilişki −100 → savaş ilanı mümkün oldu. Gecikmeli bedel: rakip tacın yönettiği mal satışı x0,5 (rakip taç saatte 1 malı yönetir; her mal ~%33 süre, ortalama x0,84); malı her saat değiştirirsen bedel ≈0. Ödemenin maliyeti ~340 altın/saat. Reddetmek ödemekten ~4x ucuz → dominant strateji (BUG/denge).
- Haraççıyla konuşma (talk [0,0,0]) çalıştı: factor 1 (hiçbir huya uyulmadı), sonra öde. Öde, reddet, konuş üçü de denendi.

### 2. Ordu / muharebe / kasaba
- Muharebe #1 (t=1836 kuşatma, player 10 mızrakçı → bot1 sarayı, garnizon 16): savunan kazandı, player 10/10 kayıp, bot1 0.
- Muharebe #2 (t=2486 yağmacı Kurt Osman çetesi, 11 kişi (7 mızrak+4 okçu) vs 5 mızrakçı): yenildik, 3 kayıp, ordu eve çekildi.
- Kasaba: Karacayayla (people, sahipsiz, garnizon 8) 10 mızrakçıyla kuşatıldı t=2447, alındı t=2462 (kayıp 5). t≈3040'ta oyuncu yokken sadakat düşüp ayaklandı ve koptu (town_revolt→town_lost_revolt).
- Savaş: player→bot1 savaş ilanı (claim:false → başkalarıyla −10). Bot1 hiç saldırmadı (bot).
- [BUG/UX] Saray kapısı (ön köşe) binalarla kapanınca ordu hiçbir yere gidemez ("route"); oyuncuya uyarı yok. (Sim'in kapıya yakın dizmesi tetikledi; oyuncu da yapabilir.) 2 bina yıkılınca düzeldi.

### 3. Nüfus neden dolmuyor
- Köylü hemen her zaman = "yer" (barınak) ya da yer'in altında: 20/20, 29/29 ... Yani büyüme hızı sorun değil, barınak (ev) ve **yemek**. Ayrıca sınır (saray sv×24) barınaktan çok yüksek: sv4'te sınır 96, barınak 55, köylü 20-42.
- Ana engel açlık: başlangıç yerinin yemek çarpanı 0,6; 5-6 tarla + iskele (tarla 0,6/0,9/1,4 × 0,6 × mevsim) ~40 kişiyi doyurmuyor (kişi 0,1 yemek/tur = 36/saat). Yemek 0 → starving çarpanı −0,6 → göç (31→7 çevrimdışı 8 saatte). Düşük vergi/mutluluk ≥55 ile ve yemek alınınca 7→27 köylü 90 dk'da (hızlı toparlanma).
- Asker eğitimi köylüden düşer ve maaş −0,04/tur/asker: 12 asker altın dengesini bozdu.
- Mutluluk<40 → göç eşiği; mutluluk 25-70 arası salındı (açlık −30, yüksek vergi).

### 4. Hanedan zaman çizelgesi
- t=0 Timur 30y (ölüm@77); kraliçe Şirin t≈330; çocuklar Tuğrul (t≈330, ölüm@61), Tekin (t≈550, @76).
- t=2795 Timur yaşlılıktan öldü (tam 77y). Tuğrul (37y) tahta çıktı. t=2798 kardeş Tekin bakışı −20 → 'kin_unhappy' (tek haber). t=2830 Tekin hastalıktan öldü (35 dk sonra). Taht davacısı isyanı oluşmadı; görev/hediye/prenses/evlilik komutlarını denemedim (kardeş ömrü kısa; kız çocuk yok).
- Kraliçe Şirin kraliçe ana oldu; yeni hükümdar kraliçesiz kaldı; yeni kraliçe Turna alındı (t≈3150), oğlu Atilla doğdu.
- t≈4070 Tuğrul (61y) öldü; Atilla 15y <16 → naipler konseyi (council=true), kraliçe yok. Toplam 4 ölü.

### 5. Yağmacı / mağara / korsan / filo
- Yağmacı: 2 çeteye takip emri (Kambur Bekir 12, Kurt Osman 11); ikinci emir birincinin yerini aldı (2 outlaw_chase haberi, kabul). 5 mızrakçıyla yenildik. Ticaret yolu payı %11-56 arası (oyuncunun yolunun %56'sı tutulu), tüccar kesintisi toplam 361 altın (books.outlaws). Çete baskını hep 'outlaw_road'. Mağara izi/kuşatma TEST EDİLMEDİ (yenilen çete yok).
- Filo: tersane t≈3550'de (700g/500yapı/80savaş), galley 'crew' hatasıyla reddedildi (asker havuzu yok → 12 askeri terhis ettim); cog 1 adet; balık/deniz ticareti OK, hunt/abluka 'warships' (galley gerek). Cog 19 sefer, +272 altın, 3 korsan saldırısı, 1 gemi battı (filo yok oldu). notices'ta hiçbir deniz/korsan haberi yok (sessiz kayıp). Abluka/kıyı akını/korsan avı/liman TEST EDİLMEDİ.

### 6. Elçi haberleri (notices, oyuncu)
Toplam ~285 haber / 68 saat ≈ 4,2/saat. Türler: patrol_tribute 125 (haraç sorusu, ~1,8/saat), patrol_visit 68 (~1/saat), patrol_taken 40, outlaw_road 31 (~0,5/saat), battle_start/end 4, outlaw_chase 2, envoy_insult 2, kasaba 3 (siege/taken/revolt+lost = 4), kin_unhappy 1, spy_lost 1, rival_gift 1, patrol_tip 1. %85'i rutin haraç/devriye: bıktırıcı olabilir (haraç + devriye + sonucu = saatte ~4 satır), önemli haberler (hanedan ölümü, tahta geçiş, kasaba) azdır; hanedan ölümleri notices'a hiç yazılmıyor (istemcide üretiliyor).

### 7. Çevrimdışı testleri (player aktif değil)

| Test | Süre | Altın | Yemek | Köylü | Not |
|---|---|---|---|---|---|
| #1 (t=2020-2260) | 240 dk | 976 → 173 (−803) | 120→0 | 22→18 | 8 haraç ödendi ~1010 (olağan, AFK değil) |
| #2 (t=2640-3118) | 480 dk | 1419 → 0 | 0 | 31→7 | kraliçe yok (tahta geçiş), kasaba koptu, mutluluk 42→25, 10 haraç |
| kısa (t=390-510) | 120 dk | 332 → 505 (+173) | 200→292 | 20→20 | sv2 küçük hazine |

Eksiye gitmedi (alt sınır 0, haraç hazineyle küçülüyor) ama uzun yokluk çöküşe yol açtı: haraç + yokluk cezası + açlık.

### 8. Çalışmayan / hiç tetiklenmeyen özellikler
Taht davacısı isyanı, görev/hediye/evlilik, mağara izi/kuşatma, galley/abluka/akın/korsan limanı, casus operasyonları (2 casus bot1'e gitti, 1 yakalandı), ittifak/barış, kasaba pazarı, eğlence merkezi bahşişi, projeler, üniversite araştırmaları, sefer, mini oyun, kasabada isyan casusluğu.

### 9. En önemli 10 bulgu
1. Haraç reddetmek neredeyse bedelsiz (ilişki −100, steward x0,5 değiştirilen malla kaçınılabilir) → ödeme mantıksız; ama aktifken cevapsızlık x1,5 AFK cezası.
2. Haraç ≈ vergi gelirinin tamamı; sv3 için 1200 altın biriktirilemiyor (hazine ~600'de dengeleniyor) ta ki reddedene dek.
3. Kötü başlangıç yeri (yemek ×0,6) açlık sarmalı: köylü barınaktan çok az; yemek alımı ve düşük vergi şart.
4. Kapıyı kapayan dolgu binalar orduyu hapsediyor, uyarı yok.
5. Uzun çevrimdışılık çöküşe götürüyor (köylü 31→7, hazine 0, kasaba isyan/kopuş).
6. Kendi taç devriyesi bahşiş bırakmıyor (eğlence merkezi yok); armağan eşiği ilişki 30+ hiç ulaşılmadı: taç hep kaybettirir (crownPaid 5754 vs 258).
7. Filo kaybı/korsan saldırısı için haber üretilmiyor; galley için asker havuzu şartı (crew) gizli.
8. Hükümdar tam ölüm yaşında ölüyor; kardeş/çocuk yaşları yüzünden çift ölüm (Tuğrul @61 < Timur @77) hızlı naipliğe götürdü; kardeş 35 dk yaşadı → isyan penceresi çok dar.
9. Ordu 10 askerle kasaba alabiliyor, saray/çete alamıyor; çete 11-12 kişi (okçu dahil) küçük orduyu yeniyor.
10. İki farklı çeteye art arda chase emri kabul ediliyor (ilk emri sessizce iptal ediyor).
Sim notları: [SIM-HATA] build komutu sarayın en yakın karelerini doluyor; haraç cevap penceresi için dar adımlı wait gerekiyor.

---

## Ek B: Sonnet tam özellik testi, ham log

- [t=0dk][NOT] tam özellik testi başladı
- [t=48dk][ILERLEME] player taç0'a biat etti (7 bina), saray sv2 yükseltmesi denendi; başlangıç yapı malzemesi 120→3'e düştü (tüccar materials sattı), yemek 120→29 düştü: tarla az
- [t=98dk][NUFUS] player başlangıç yeri yemek çarpanı 0.6; 3 tarla (sv1 0.6 yemek) 12 köylüyü doyurmuyor: yemek 120→0, mutluluk 56→18; sezon etkisi ayrıca. Tarla sınırı sv1'de 3
- [t=143dk][HARAC] rakip taç (1) haraççıları sv2'den sonra geldi: t=95 ask 82→AFK 123 ödendi, t=121 ask 48→72 (AFK x1.5). kendi taç devriyesi t=60 yeni lord bahşişi 161 (+armağan 9 altın,9 yemek), t=65 rakip taç 88 altın kese; t=90 devriye uğradı (patrol_visit, eğlence yok). tek oyunculu/lord görülüyorsa haraç hep AFK x1.5 çünkü ben cevap veremiyorum (sim)
- [t=154dk][HARAC] haraççıyla konuştum (patrolAnswer talk [0,0,0]) → factor 1, ask 59; ardından Öde. Çalıştı. Hazine 187 iken haraç 59 (%31)
- [t=185dk][HARAC] haraç 80 REDDEDİLDİ (patrolAnswer pay:false) → taç ilişkisi etkisi status'ta; haraç ask 80 hazine ~320
- [t=245dk][DENGE] sv2 oyuncu: vergi geliri tur başına 0.35 (~5 altın/saat) iken haraç saatte ~2 kez 60-90 altın (~%25 hazine). Altın akışı tüccara bağlı; tüccar materials satınca yapı malzemesi (yükseltme için lazım) tükeniyor. Yeni lord haraçla boğuşuyor. Haraç: t=185 ret(80), t=211 ask61→AFK 92, t=245 ask71 öde
- [t=285dk][DENGE] DÜZELTME: saatte 360 tur; vergi 0.35/tur ≈ 126 altın/saat (önceki '5/saat' notu yanlıştı). Haraç ~2x70-140/saat ≈ vergi gelirinin neredeyse tamamı
- [t=510dk][CEVRIMDISI] 120dk çevrimdışı (active bot1,bot2): altın 332→505 (+173, 4 haraç ödendi 84+100+112+126=422 olağan miktar, afk:false), yemek 200→292, yapı 5→4 (tüccar satıyor). Haraç ask hazineyle büyüyor (hazine 339→507: ask 84→126 = %25). Haraç sıklığı ~2.5/saat. Çevrimdışı eksiye gitmedi ama net kazanç ~+86/saat
- [t=510dk][HARAC] kendi tacı devriyesi eğlence merkezi yok → yalnız 'patrol_visit' haberi: t=90,180,240,360,450 (≈saatte 1 haber, bahşiş yok; yeni lord bonusu yalnız ilk). sv2'de rakip haraççı saatte ~2.4, toplam ödenen (t≤486) crownPaid≈1500+ vs crownGot 258
- [t=570dk][HARAC] player aktifken (seen) cevapsız haraç AFK x1.5: 128→192, 130→195; çevrimdışı iken x1. Aktif ama cevap vermeyen oyuncu cezalı
- [t=610dk][DENGE][BUG?] Haraç ask = hazinenin %25'i (hazine<600: min150 → maxShare %25 sınırı), saatte ~2.4 uğrayış: hazine ~600'de dengeye oturuyor; sv3 için 1200 altın BİRİKTİRİLEMİYOR (gelir ~250/saat, haraç skim ~%45/saat). Bunu reddederek aşıyorum (test)
- [t=780dk][HARAC][DENGE] haraçları sürekli REDDETMEK: 60dk'da 2 haraç reddedildi, hazine 659→1056; taç ilişkisi sadece -15→-25 (saatte ~11 geri döner). Pratikte ceza yok → reddetmek dominant strateji (başka yan etki gözlenmedi: ordu/saldırı yok). Ödemek hazinenin %25'ini götürür
- [t=1040dk][HARAC] haraç 142 sabit (hazine 1200-1800'de, ≈%8 ya da min), reddederek 17 saatte: hazine 659→1818; taç ilişkisi rakibe -58 (reddetme x tekrar birikiyor, dinlenme -15'e saatte ~11 döner). Ödeme yalnızca AFK iken 213'e çıktı.
- [t=1040dk][NUFUS] köylü=yer her zaman (20/20,29/29): büyüme hızı değil BARINAK sınırlayıcı; barınak 29, sınır 48. Köylü yeni ev biter bitmez dolar. Ev inşası sıra (2 inşaat) + yapı malzemesi tüccar tarafından satıldığından yavaş
- [t=1055dk][ILERLEME] player saray sv3 yükseltmesi başladı (1200g/800yapı/200savaş). Yemek 0'a düştü tekrar (29 köylü)
- [t=1125dk][NUFUS] sv3'te yemek açığı: 5 tarla/1 iskele 26 köylüyü doyurmuyor (başlangıç yemek çarpanı 0.6); yemek 0 → mutluluk 25, köylü 29→23 göç (yüksek vergi + açlık). Pazardan yemek alıp (200 birim) kurtardım, vergi normal
- [t=1125dk][ORDU] player 10 mızrakçı eğitimine alındı (köylü 36→26). bot1 player'a hakaret elçisi gönderdi (savaş gerekçesi için)
- [t=1293dk][OZET] sv3, altın 869, köylü 24/72 (barınak 42; açlık), asker 10, haber ~2/saat (patrol_visit, patrol_tribute, outlaw_road), yemek 0
- [t=1428dk][OZET] player sv3, altın 472, köylü 30/72 (barınak 48), asker 10, açlık sürüyor; hanedan: Timur 54y, çocuklar Tuğrul 17y(ölüm@61) Tekin 15y(@76), kardeş yok
- [t=1518dk][DENGE] Hata: arms (savaş malzemesi) satarak 1170→4'e düştüm, sv4 için 500 gerekiyor; kendi hatam. [NUFUS] açlık: köylü+asker 40 kişi tur başına ~4 yemek yer = saatte 1440; 6 tarla+iskele*0.6 çarpan karşılamıyor; yemek 0 → starving factor -0.6 → göç. Ana neden yemek, mutluluk 39 (<40 eşiği → göç)
- [t=1653dk][DENGE] Tüccar materials satışı çok kazançlı: 135dk'da gold 706→2090 (+~600/saat) ama yapı malzemesi 1784→7. Haraç reddi sürüyor (taç ilişkisi -86). player sv3 puan 1313
- [t=1743dk][HARAC][DENGE] Reddetmenin gecikmeli bedeli (stewardFactor hesabı, bun scripti st.ts, rel -100): rakip tacın yönettiği mal saatte değişir (48 saatte her mal ~%33 zaman rakip taçta); o saatte satış x0.5, diğer saatlerde x1.0-1.04. Sabit bir mal satarsan ortalama x0.84-0.85 (≈-%15 ticaret geliri ≈ ~90 altın/saat @600/saat). Her saat rakip tacın yönetmediği malı seçersen (2dk bekleme, tek komut) bedel ≈0. Ödemenin maliyeti ise ~2.4 haraç x142 ≈ 340 altın/saat. SONUÇ: reddetmek ödemekten ~4x ucuz, hiç bedelsiz kaçınılabilir; başka ceza gözlenmedi (ilişki -100 tabanda sabit).
- [t=1819dk][ILERLEME] player saray sv4 yükseltmesi başladı (t≈30 saat). player aktifken cevapsız haraç AFK x1.5 ile otomatik ödeniyor: dikkat
- [t=1819dk][HARAC][ORDU] haraç reddi yan etkisi: rakip taç lordlarıyla ilişki: player↔bot1 (rakip taca bağlı) = -100 (her ret -8). Bu savaş açmayı mümkün kıldı: player bot1'e SAVAŞ İLAN ETTİ (OK)
- [t=1819dk][ORDU] player 10 mızrakçıyla ordu #1 çıkardı, bot1 sarayına (589,108) yürüyor (~800 karo). bot1 garnizon 16 mızrakçı
- [t=1819dk][BUG] player ordusu (mızrakçı 10) hiçbir hedefe yürüyemiyor: 'RED: route' (komşu 330,850 dahil). Saray kapısı çevresine tp.sh ile ev/tarla/ambar/kışla yığıldı (40 bina 12x12'de); bot2 aynı emri alıyor (OK). Binalar ordunun çıkışını kapatıyor olabilir; UX: oyuncuya neden uyarı yok
- [t=1819dk][BUG] Doğrulandı: ev #28 (314,872) + ambar #37 (317,871) yıkınca ordu yürüdü → kapı çevresi kapanınca ordu sıkışıyordu
- [t=1840dk][SIM-HATA][UX] 'route' hatası: sim build komutu yapıları sarayın en yakın boş karesine dizdi, saray kapısı (ön köşe) kapandı → ordu çıkamadı. Oyuncu da elle aynısını yapabilir ama oyun uyarmıyor (UX). Çözüm: 2 yapı yıkıldı. tp.sh artık ev/tarla spamlamıyor
- [t=1840dk][ORDU] MUHAREBE #1 (kuşatma, bot1 sarayı, t=1836): player 10 mızrakçı vs bot1 garnizon 16 → savunan kazandı, player kayıp 10 (hepsi), bot1 kayıp 0. Ordu yok edildi, savaş sürüyor. sv4 t≈1830
- [t=1840dk][ORDU] 2 casus bot1'e (ordu, hammadde konuları) gönderildi
- [t=2020dk][OZET] player sv4, altın 976, köylü 22/96 (barınak 55, açlık/verim %51), asker 10, savaş sürüyor bot1 ile; hanedan Timur 64y (ölüm@77) çocuklar Tuğrul 27 (@61) Tekin 25 (@76)
- [t=2260dk][CEVRIMDISI] 240dk çevrimdışı #1 (t=2020→2260): altın 976→173 (-803), yemek 120→0, köylü 22→18, yapı 8→6, savaş malz. 1136→1352 (+216). 8 haraç otomatik ödendi (156,156,156,156,143,108,77,58 = ~1010 toplam, afk:false → olağan miktar). Sezon defteri: vergi 7187, tüccar 5548, haraç ödenen 3718 (alınan armağan 258), maaş 1956, boşa giden mal 3063. Eksiye gitmedi (hazine sıfıra yaklaşınca haraç da küçülüyor: 156→58) ama 4 saatte hazine %82 eridi
- [t=2443dk][ORDU] 10 mızrakçı (ordu #3) Akova... (kasaba #22 (454,780) sahipsiz, garnizon 8) kuşatmaya gönderildi (move+siege)
- [t=2462dk][ORDU] KASABA ALINDI: Karacayayla (people, sahipsiz, garnizon 8) 10 mızrakçıyla kuşatıldı t=2447, alındı t=2462 (15 dk), kayıp 5 asker. Ordu 168 karoyu 3 dk'da... (sim süresi)
- [t=2488dk][YAGMA] 5 mızrakçı Kambur Bekir(12) sonra Kurt Osman(11) çetesini takip etti: iki farklı çeteye art arda chase emri kabul edildi (ikincisi birinciyi iptal etti, 2 outlaw_chase haberi); muharebe #2 t=2486: player 3 kayıp, çete 0 kayıp → yenildi, ordu eve çekildi. (çete 11-12 kişi vs 5)
- [t=2640dk][ILERLEME] taç görevi (quest take), taç siparişi (order), kraliyet isteği (royal accept) komutları çalıştı
- [t=2795dk][HANEDAN] Hükümdar Timur yaşlılıktan öldü (77y, ölüm@77 tam zamanında); oğlu Tuğrul (37y) tahta çıktı. Kraliçe Şirin 'kraliçe ana' oldu, yeni hükümdarın kraliçesi YOK → oyuncu kraliçesiz (mutluluk -, sv5 için queen şartı)
- [t=2798dk][HANEDAN] kin_unhappy: kardeş Tekin (35y) bakışı -20 (uyarı haberi, elçi 1 kez); t=2830 Tekin 'sickness' ile öldü (tahta geçmeyen kardeş genç ölür kuralı: hükümdar ölümünden 35 dk sonra). Taht davacısı isyanı TETİKLENMEDİ: kardeş bakışı -35'in altına inmeden öldü. Tek kardeş vardı (ilk hükümdarın 2 oğlu: Tuğrul/Tekin). Tuğrul'un çocuğu yok, kraliçesi yok, ölüm@61 (16 saat sonra)
- [t=3118dk][CEVRIMDISI] 480dk çevrimdışı #2 (t=2640→3118): altın 1419→0, yemek 0, köylü 31→7 (barınak 55), mutluluk 42→25, kraliçe yok (yeni hükümdar), kasaba Karacayayla t≈3040'ta İSYAN→kopuş (town_revolt→town_lost_revolt), 10 haraç otomatik ödendi (142×~8 + 97), hazine sıfırlandı; yapı malz. 3→0. Ağır çöküş: uzun yokluk + açlık + haraç
- [t=3300dk][DENGE] sv4 oyuncu ölüm sarmalı: tüccar yok/satmıyor iken gelir (vergi 0.4-0.5/tur≈160/saat) < asker maaşı (12 asker -0.48/tur≈-170/saat) + yemek alımı; altın 0'da. Köylü başı yemek+asker maaşı kötü arazide yürümüyor. Düşük vergi mutluluğu 59'a çıkarsa da nüfus yine 23'te (yemek)
- [t=3553dk][ILERLEME] tersane kuruldu (700g/500yapı/80savaş) — ~58 saatte; kraliçe Turna geldi, çocuk Atilla doğdu
- [t=3646dk][DENIZ] cog yapıldı (170g/200yapı, 2 denizci; galley 'crew' hatası: asker havuzu yok → 12 asker terhis edilip köylüye döndü, sonra cog yapılabildi). Filo #1 kuruldu; mission fish OK, trade (materyal→taç0) OK; hunt/blockade → 'warships' hatası (galley yok). Korsan etkisi sea=0 (korsan yok bu oyuncuya)
- [t=3781dk][DENIZ] cog 19 sefer yaptı (deniz ticareti, toplam +272 altın), 3 korsan saldırısı, 1 gemi battı (ledger: sunk 1, lostUnits 120, pirates 3). Filo yok oldu. DİKKAT: notices tablosunda hiç deniz/korsan haberi YOK (pirate_battle vb. üretilmedi) — filo sessizce kayboldu; sadece navy.ledger'da
- [t=3781dk][ELCI] player'a 262 haber / 62 saat = 4.2/saat: patrol_tribute 115, patrol_visit 62, patrol_taken 40, outlaw_road 29, çeşitli 16. Haberlerin %85'i haraç/devriye (rutin). Diğer türler toplam 16 haber 62 saatte (kasaba, savaş, hanedan 1).
- [t=4075dk][HANEDAN] Hükümdar Tuğrul (61y, ölüm@61) öldü; varis Atilla 15y (<16) → naipler konseyi (council=true), kraliçe yok, mutluluk 68→30. Hanedan: Timur(30→77y t≈2795) → Tuğrul (t≈4070) → Atilla. Kardeş isyanı hiç oluşmadı
- [t=4075dk][SON] rapor yazıldı

---

## Ek C: Haiku ilerleme testi, ham log

- [t=0dk][NOT] test başladı
- [t=10dk][UX] İlk 10 dk: ücretsiz oduncu+tarla kuruldu, ev kurulamadı (queue: inşaat yeri 2/2 dolu). Tüccar 'materials' ile yapı malzemesini 120'den 3'e düşürdü: ev için malzeme kalmadı, tüccarı kapatmak gerekebilir
- [t=25dk][ZORLUK] Ev/tarla/oduncu için inşaat kuyruğu 2 yer; 8-10 sn'lik inşaatlar bile kuyruğu dolu tutuyor. Ücretsiz ilk yapılardan sonra ev 30 altın+20 yapı, tarla 20 altın
- [t=65dk][ILERLEME] Biat (taç 0) yapıldı; 7 yapı sayıldı; saray 2 yükseltmesi yapılabilir (305 altın, 279 yapı)
- [t=65dk][NOT] Tüccar food satışı 20 dk'da 189 yemek sattı, yemek 212'den 23'e düştü; satış yemeği bitirdi
- [t=80dk][ILERLEME] Saray sv2 tamam (t=80dk; yükseltme 20 sn)
- [t=100dk][ZORLUK] Kraliçe reddedildi: 'people' (nüfus yetersiz). Nüfus 11/11, barınak 11; ev kurmak için inşaat kuyruğu boş olmalı, kuyruk forge+dock ile doldu
- [t=120dk][BUG-ish][NOT] Tüccar 'materials' 10 dk'da 310 yapı malzemesi sattı (2'ye indi): ev için (20 malzeme) kalmadı, 'house: cost' hatası. Tüccar stok tavanı koymuyor gibi; benim hatam ama oyunda da 'ev için rezerv' yok
- [t=160dk][ZORLUK] Kraliçe için min nüfus 20 + 300 altın (society.json queen.minPopulation). Nüfus 16/17 idi; ev kurmak ~8 sn sürüyor ama her ev 1 yer; sınır 17
- [t=185dk][ILERLEME] Kraliçe geldi (t=185dk; 300 altın, nüfus 23 ile). Kraliçe bekleme nedeni: önce nüfus 20, sonra altın; altın 296'da 'cost' hatası
- [t=205dk][OZET] Saray sv2, kraliçe var, biat 0, 15 yapı. Altın 244; vergi normal ~173/sa (köylü 23); tüccar satışı (food 373 → ~+120 altın, 20 dk). Sv3 için 1200 altın+800 yapı+200 savaş gerekli. Darboğaz: ALTIN (saat başı net ~200-250). Yemek 70'e düştü (tarla 2 / köylü 23)
- [t=235dk][NOT] Savaş malzemesi (arms) satışını 30 dk'da 216 sattım: sv3 için 200 arms gerekiyor, şimdi 3. Arms üretimi forge ~5/dk; sv3 için hem altın (1200) hem yapı (800) hem arms (200) aynı anda birikmeli
- [t=295dk][DENGE] Yüksek vergiyle saatte +334 altın (vergi 311/sa); 60 dk'da yemek +1 (net sıfır): 23 köylü + 2 tarla yemeği tüketiyor; yemek darboğazı başladı
- [t=337dk][DENGE] 12 dk'da sadece +62 altın (önceki 30 dk +181). Muhtemelen gece (oyun saati 23-03 arası üretim %50); altın hızı gündüz/gece farkı büyük
- [t=357dk][ILERLEME] Saray sv3 yükseltmesi başladı (t=357dk; 1200 altın, 800 yapı, 200 savaş). Sv3 kapısı: kraliçe + 1200 altın darboğazı; altın 1188'de 'cost' hatası, 12 dk önce +62
- [t=367dk][ILERLEME] Saray sv3 tamam (t=367dk), kraliçe var, biat var; sv4 için 2200 altın+1500 yapı+500 savaş
- [t=367dk][OZET] sv3; altın darboğaz; nüfus 24/24 barınak dolu → ev şart; yemek 694 (artık sorun değil)
- [t=397dk][ZORLUK] Sv4 için yapı malzemesi darboğaz: 1500 gerekli, depo 479; saatte ~370 yapı. Oduncu sınırı 3 (sv3), 1 kurulu
- [t=427dk][DENGE] 30 dk'da altın +203 (saatte ~400, gece payı dahil). Sv4 için 1750 altın eksik; 173 dk kaldı. Altın darboğazı; yapı/arms/yemek fazla birikiyor (951/988/1016) ama altına çevrilmiyor
- [t=457dk][DENGE] Yemek satışı 924 yemek → +444 altın (30 dk, vergi dahil); yemek 92'ye düştü: satış yemek üretimini aşıyor
- [t=487dk][BUG][NOT] Arms satışı 'trade arms' 30 dk'da 1090 savaş malzemesi sattı: rezerv yok, sv4 için 500 arms gerekiyor, şimdi 3. Satış süreye bağlı, sınırsız; oyuncu rezervi kendisi korumalı (yemekte ayrı rezerv var, arms'ta yok)
- [t=532dk][OZET] sv3, altın 1880/2200 sv4 için; yapı 1675 ok; savaş 598 ok. Altın tek darboğaz (~400/sa vergi yüksek + ~30 dk gece yavaş)
- [t=567dk][ZORLUK] Sv4 için altın 2200 (sv3'teki gibi 2117'de 83 eksik); 35 dk beklemek + 2 dk yemek satışı gerekti
- [t=572dk][ILERLEME] Saray sv4 yükseltmesi başladı (300 sn). Sv4 tamamlandı ~t=577-582 (status t=582'de sv4)
- [t=582dk][ILERLEME] SAYFA: sv4 bitti; sv5 için 5000 altın + 3000 yapı + 1000 savaş (oyun bitimine çok yakın, ulaşılamaz)
- [t=582dk][DENGE] Sv4 yükseltmesinin tek ekstra maliyeti: 2200 altın/1500 yapı/500 savaş. Sv5 5000 altın: yüksek vergide saatte ~400 altınla ~12 saat
- [t=582dk][UX] 'trade' komutu stok rezervi bırakmıyor (yemek için 30 turluk rezerv var; yapı/savaş yok): ev/saray için yapı 2 kalmasına yol açtı
- [t=582dk][DENGE] Yemek: 2 tarla + 23 köylü ile net sıfır (60 dk +1); 2 tarla daha eklenince +235/30dk. Tarla sınırı sv1'de 3 (sonra 4/6/8/10)
- [t=582dk][NOT] Ücretsiz ilk yapılar (oduncu, tarla, ev, sonra iskele/dock) ve ilk 25 dk'nın ardından sv1 → sv2'ye 80 dk, sv2 → sv3 287 dk (kraliçe 185 dk)
- [t=582dk][OZET] Sv4 bitti. Gelir: yüksek vergi ~400 altın/sa, tüccar satışı (yemek ~+0.45/birim, silah ~+0.65/birim) ile destekli. Darboğaz: altın (sv3 ve sv4 için toplam 3400 altın), sonra ev/nüfus kapasitesi (kraliçe için nüfus 20 şartı)
- [SON] Gelişim ZOR DEĞİL ama YAVAŞ ve PAZARLIK GEREKTİREN. 10 saatlik oyunda sv4'e ulaşıldı (t≈580 dk). Ölçülebilen darboğazlar: (1) altın — sv3/sv4 için 3400 altın, yüksek vergi + satış olmadan ~6-8 saat; (2) kuyruk/nüfus — kraliçe için nüfus 20 + ev kapasitesi; (3) depo/rezerv yönetimi — tüccar stoku sıfıra indiriyor. Kilometre taşları: biat t=65, sv2 t=80, kraliçe t=185, sv3 t=367, sv4 t≈580.
