# Sözcük Merdiveni — iOS

Sözcük Merdiveni oyununun Capacitor 8 kabuğu. Oyun site deposundadır
(`alp-efes/sozcuk-merdiveni`); burada yalnızca paketleme, yerel özellikler ve
Xcode projesi vardır. Genel bakış ve komutlar: `README.md`.

**Kurallar site deposundadır:** `ekip/KURALLAR.md` ve `ekip/durum.md` bu depo
için de geçerlidir (anahtar, PR sınırı, denetçiler, otomatik birleştirme,
yalnızca sahibin yapabilecekleri). Bu depodaki her değişiklik "kod"dur:
`kod-inceleme` ve `guvenlik` denetimi ister; gizlilik metni, veri toplama ya da
mağaza kaydına dokunuyorsa `hukuk-uyum` da.

Kod yorumları, belgeler, commit mesajları ve kullanıcıya görünen her metin **Türkçe**.

## Değişmezler

Bunları değiştiren PR sahip onayı ister (KURALLAR 8) ve ilgili testi bilerek günceller:

- **Web görünümü yalnızca paketten yükler; ağ yalnızca yerel reklam ve satın alma SDK'larının.**
  Reklam (Google) ve StoreKit (Apple) trafiği yerel taraftadır; CSP `default-src 'none'`
  kalır. Uzak `words.json`, uzak içerik, Google/Apple dışı hizmet ve analitik yok. Bunlardan
  biri gizlilik etiketini, `PrivacyInfo.xcprivacy`'yi ve `web/gizlilik.html`'i değiştirir
  (sahip kararı, 13 Kasım 2026: reklam, Plus, ücretli ipucu/tekrar).
- **Tek izin istemi: App Tracking Transparency.** `Info.plist`'te
  `NSUserTrackingUsageDescription` dışında `…UsageDescription` olmaz; test kırılır.
- **Eklentiler adlıdır:** `@capacitor-community/admob` (kesin **8.2.1**; 8.3.0 yeni ve
  kullanmadığımız bir bağımlılık getiriyor) ve uygulamanın içindeki `SatinAlma.swift`
  (StoreKit 2, npm paketi yok; **ürün kimliği Swift sabiti**, JS'ten kabul edilmez). Başkası
  sahip onayı ister; sürümler kesin (`^` yok), `package-lock.json` depoda ve testteki açık
  izin listesiyle (geçişli paketler dahil) birebir, `npm audit` temiz. Swift paketleri
  `Package.resolved` ile revision'a kilitlidir ve derlemeler `-onlyUsePackageVersionsFromResolvedFile`
  kullanır; paket sürümü değişirse dosya macOS'ta yeniden üretilip testteki SHA'lar bilerek güncellenir.
- **Google test reklam kimlikleri yayına girmez.** Kimlikler tek yerde, `gelir.json`'da.
  TestFlight iş akışı arşivden önce `araclar/yayin-denetle.mjs` çalıştırır; test kimliği
  varsa derleme durur; simülatör betiği (`otomatik-oyna.js`, `SM_OTOMATIK`) ve `isTesting`,
  `initializeForTesting`, `debugGeography` pakette de reddedilir. Bu adımı kaldırmayın, koşula
  bağlamayın, `continue-on-error` vermeyin (testle korunur).
- **TestFlight gizli bilgileri yalnızca `testflight` ortamında.** Ortam
  yalnızca `main`'den çalışır; `testflight.yml`'deki `environment:` satırı
  testle korunur. Gizli bilgiyi başka bir işe ya da depo düzeyine taşımayın.
- **Site dosyaları burada düzenlenmez.** Oyun hatası site deposunda `[oyun]`
  issue'sudur. Uygulamaya özgü fark `araclar/web-esitle.mjs` (+ `araclar/arayuz.mjs`),
  `web/yerel.js`, `web/uygulama.js` ve `web/uygulama.css`'tedir.

## Komutlar

```bash
npm test               # PR açmadan önce geçmeli (eşitleme + paket + tarayıcı testleri)
npm run ios:sync       # siteyi paketle + npx cap sync ios
npm run ios:ayarla     # capacitor.config.json / package.json → Xcode projesi
npm run gorsel         # simge + açılış görseli
```

Site deposu `../sozcuk-merdiveni` içinde aranır; değilse `SITE_DEPOSU=/yol`.

## Mimari kararlar

**`www/` depoya girmez.** Her derlemede site deposundan üretilir; depoda
tutulsaydı sitenin bayat bir kopyası olur, `words.json` her değişimde 150 KB'lık
fark üretirdi. Hangi site commit'inin paketlendiği TestFlight iş akışının
özetine yazılır.

**Dönüşüm bilerek katıdır.** `web-esitle.mjs` sitenin `index.html`'inde
beklediği her parçayı sayarak arar ve sonunda izinli olmayan her şeyi (yeni
betik, dış adres, satır içi olay/stil, iframe) reddeder. Site değişince
`npm test` kırılıyorsa bu istenen davranıştır: değişikliğe bakın, dönüşümü
bilerek güncelleyin. Denetimi gevşetmeyin.

**Yerel özellikler `app.js`'e dışarıdan bağlanır.** `web/yerel.js`,
`WordLadder.prototype.reject` ve `.win` metotlarını sarar (titreşim) ve
`navigator.share`'i yerel paylaşım sayfasına yönlendirir. Derleyici olmadığı
için eklentilere `window.Capacitor.Plugins.<Ad>` ile erişilir (köprü bunu yerel
tarafta kendisi kurar). Bağlanılan her nokta `paket.test.mjs` içinde aranır.
Kabul edilen her kelimede hafif dokunuş verir (`accept` → `Haptics.impact`).

**Uygulama arayüzü siteden farklıdır (sahip kararı, 13 Kasım 2026); site aynı kalır.**
`araclar/arayuz.mjs` işaretlemeyi tutar, `web-esitle.mjs` onu sitenin `index.html`'ine
sayarak ekler, `web/uygulama.js` davranışı, `web/uygulama.css` görünümü verir. Site
dosyalarına dokunulmaz; `uygulama.js` `WordLadder` metotlarını sarar (`init`, `renderInput`,
`win`, `showModal`, `showOffer`, `showPes`, `showYenile`, `showResult`, `beginRetry`, `saveState`, `updateTabs`, `tickCountdown`) ve Capacitor
köprüsü gerektirmez (tarayıcı testinde de çalışır). Farklar:

- **Yenile düğmesi başlığın sol ucunda** (ana ekran düğmesinin yanında): sitedeki yerinde geri al'ın
  tam üstüne düşüyor, ikisi karışıyordu (sahip notu, 13 Kasım 2026). İlerleme varken onay ister (site).
- **Açılış → ana ekran ⇄ oyun.** `body[data-ekran]` (`ana` | `oyun`; yokken açılış ekranı).
  Açılış ekranı yerel açılış görseliyle aynı çizimdir (satır içi SVG, renkler belirteçlerden),
  sözlük yüklenene dek ve en az 0,8 sn görünür. Ana ekranda iki kart: Günün Bulmacası,
  Serbest Oyun (zorluk/uzunluk burada seçilir). Oyun başlığında geri düğmesi ve mod adı;
  sitenin sekmeleri, ayar satırı, durum satırındaki geri sayım ve ses düğmesi oyun ekranında
  yoktur (ses düğmesi ana ekrana taşınır, tercih `sm_ses`'te hatırlanır).
- **Telefonun klavyesi.** Sitenin ekran klavyesi gizlidir. Görünmez `#giris` metin alanı
  odaklanınca klavye açılır; alan `app.js`'teki `buffer`'ın aynısını tutar. Harfler
  `toLocaleUpperCase("tr-TR")` ile büyür (i → İ, ı → I), şapkalı harf şapkasız yazılır
  (â → A, î → İ, û → U) ve `TR_LETTER` ile süzülür; bileşim (IME) bitince eşitlenir. Alan
  ekranın en üstündedir: klavye onu örtmediği için iOS odaklanırken sayfayı kaydırmaz.
  Klavyenin üstünde `Ç Ğ I İ Ö Ş Ü` şeridi durur (Türkçe klavyesi olmayanlar için). Oyuncu
  şeridi ana ekrandaki düğmeyle (`#btnSerit`, ses düğmesinin yanında) kapatabilir: varsayılan
  açık, tercih `sm_serit`; kapalıyken `body.serit-yok` şeridi hiç göstermez, yerini merdiven alır.
- **Ekran kaymaz.** `html, body` kaydırılmaz; `.app` `position: fixed` ve boyu
  `visualViewport.height`'tir (`--vvh`, `--vv-top`). iOS boyut olayını klavye animasyonu
  bitince gönderdiği için son klavyeli/klavyesiz boy hatırlanır ve odak değişir değişmez
  uygulanır; 1 sn sonra gerçek ölçüyle eşitlenir. `@capacitor/keyboard` eklentisi YOK.
- **Her modun oyunu ayrı saklanır:** `sm_mod_daily`, `sm_mod_free` (`sm_state`'in kopyaları);
  ana ekrandan öteki moda geçmek kalınan yeri silmez. Günlük çözüm penceresindeki "Serbest
  Oyun" ve bitmiş günlükte Enter de aynı yoldan gider (`#modal`'da yakalanır; `app.js` yeni
  bulmaca çekip kaydı ezerdi). Serbest kayıt, bulmaca `freePool()`'da ise sürdürülür. Yeni
  `sm_*` adı tam yazılır (birleştirilmez) ve `web/gizlilik.html`'e eklenir (test kırılır).
- **Çözüm penceresi yalnızca oyun ekranında ve bitmiş oyunda açılır** (`showModal` sarılır):
  `app.js` pencereyi çözümden 650 ms sonra açar; o arada başka ekrana geçildiyse açılmaz.
- **Plus kartı ana ekrandadır** (sitenin `#plusBox`'ı taşınır: satın al, geri yükle, cayma
  notu); görünürlüğünü `app.js` `renderPlus` yönetir (yalnızca kanca `plusSatinAl` veriyorsa). Alt bilgi
  (Gizlilik, Lisanslar, "Reklam Tercihleri") da ana ekranın altındadır; `gizlilik.html` böyle tarif eder.
- **"Nasıl oynanır?" pencere olarak açılır** (`body.yardim`); açıkken alttaki ekran gizlidir.

**İlk sürüm Plus'suz (sahip kararı, 14 Kasım 2026):** `web/yerel.js` → `PLUS_ACIK = false` kancadan `plusSatinAl`/`plusGeriYukle`/`plusFiyat`'ı çıkarır, `plusMu` hep false'tur, StoreKit'ten Plus sorulmaz; site `app.js` Plus'a yalnızca kanca `plusSatinAl` veriyorsa değinir. `SatinAlma.swift` yerinde (vitrin için de gerekli); `web/gizlilik.html` Plus'tan söz etmez (Plus açılırken geri konur, testler bayrağı açıp dener). **Geçici: `REKLAM_YOKSA_ODUL = true`** (`web/yerel.js`) ödüllü reklam yüklenemez ya da gösterilemezse +1 hak verir (AdMob onayı gelene dek oyuncu takılmasın); yarıda kapatılan reklam ödül vermez. AdMob onaylanınca `false` yapılır.

**Gelir (`window.SozcukGelir`, `web/yerel.js`).** Oyun (site deposu) reklam, Plus ve
ipucu/tekrar için bu donuk kancayı çağırır: `plusMu()` (düz boolean, söz değil),
`odulluReklam(neden)`, `gecisReklami("cozum")`, `plusSatinAl()`, `plusGeriYukle()`.
Açılış sırası: StoreKit'ten Plus'ı yeniden doğrula → Plus yoksa UMP (AEA, BK, İsviçre)
→ vitrin (App Store ülkesi, en çok 2 sn) → ATT (yalnızca karar verilmemişse ve vitrin GBR değilse;
GBR'de ATT sorulmaz ve `tagForUnderAgeOfConsent` verilir) → AdMob başlat → ödüllü ve geçiş reklamını önyükle.
Plus sahibine reklam başlatılmaz, izin sorulmaz. ATT reddedilirse reklam
kişiselleştirilmeden sürer (reklam kimliği ve diğer uygulama/sitelerdeki bilgi kullanılmaz). Geçiş reklamı: oturumun ilk çözümünde yok, en az 3 dk aralık,
hazır değilse atlanır. Reklam `win()` anında değil, çözüm penceresi (650 ms sonra) açılıp **oyuncu
onu kapatır kapatmaz** (MutationObserver, yoklama yok) gösterilir; pencere "Yeni Oyun"/"Tekrar dene" ile
kapanıp yeni bulmaca çekildiyse ya da oyuncu yazmaya başladıysa o çözümde reklam yoktur. Son reklam
zamanı ve çözüm sayısı `sessionStorage` (`sm_gecis`, `sm_cozum`) tutulur. Reklamlar 55 dk sonra eskir ve
yeniden yüklenir. İzin hatası (çevrimdışı açılış) saklanmaz, sonraki istek yeniden dener. Kimlikler `gelir.json` → `web-esitle.mjs`
`yerel.js`'e yazar; `admobAppId` → `ios-ayarla.mjs` → `Info.plist`. Plus önbelleği
`localStorage.sm_plus`, her açılışta StoreKit düzeltir. Simülatör derlemesi
(`window.SM_OTOMATIK`) reklamı, ATT'yi ve satın almayı kapatır, ödülü hep verir.

**Türkiye'de ayrı reklam rıza ekranı yok (sahip kararı, 13 Kasım 2026; kabul edilmiş risk).**
Kişiselleştirilmemiş reklam meşru menfaate (KVKK m.5/2-f), kişiselleştirme ATT'ye dayanır. Hukuk
taslağı bunun KVKK Çerez Rehberi'yle çeliştiğini söyledi; sahip riski bilerek kabul etti. `hukuk-uyum`
bulgu olarak yazabilir ama "sahip kararı, kabul edilmiş risk" diye; engel sayılmaz, tekrar tekrar açılmaz.

**Birleşik Krallık: TFUA yalnızca `AdMob.initialize`'da, UMP'de değil.** App Store vitrini `GBR` ise
(`SatinAlma.vitrin()`, StoreKit `Storefront.current`; alınamazsa ya da 2 sn içinde gelmezse etiket konmaz ve ATT sorulur)
`tagForUnderAgeOfConsent: true` verilir: reklam isteklerine TFUA konur, kişiselleştirilmemiş reklam gider.
`requestConsentInfo`'ya etiket VERİLMEZ: Google, UMP tarafında bu etiketin onay penceresini nasıl
etkilediğini belgelemiyor; PECR gereği BK'da cihaz erişimi onayı penceresi toplanmaya devam etmeli. Bunu
değiştirmek sahip kararıdır.

**`PrivacyInfo.xcprivacy`: `NSPrivacyTracking` bilerek `false`.** Uygulamanın kendi kodu izleme yapmaz;
Google SDK'sı kendi bildirimini taşır (13.11.0'da `NSPrivacyTracking` ve alan adı yok). Toplanan
veri türleri SDK'dakilerle aynen yinelenir. App Store Connect gizlilik etiketinde yine
"Tracking = Yes" denir (SAHIP-ADIMLARI 9.6); ikisi farklı şeylerdir. İzleme alan adı listelenmez:
iOS, ATT yokken listedeki adlara bağlantıyı keser, kişiselleştirilmemiş reklam da yüklenemezdi.

**Plus köprüsü uygulamanın içindedir:** `ios/App/App/SatinAlma.swift` hem
`AnaGorunum`'u (`SceneDelegate` kök görünüm olarak kurar, storyboard değil; köprüye eklentiyi kaydeder) hem de
`SatinAlmaPlugin`'i içerir. `ios/App/Plus.storekit` yalnızca Xcode simülatör testi içindir
(Scheme → Run → Options → StoreKit Configuration); pakete girmez.

**Paket kimliği tek yerde:** `capacitor.config.json` → `appId`. Değiştirince
`npm run ios:ayarla`. Sürüm `package.json` → `version`. Derleme numarası
depoda `1` kalır; TestFlight iş akışı çalıştırma sayısını kullanır.

**CSP:** `default-src 'none'`, betik/stil/yazı tipi/bağlantı yalnızca paketten.
`'unsafe-inline'` yok; site satır içi betik ya da `style=` eklerse dönüşüm durur.

## Tuzaklar

**Günün bulmacası pakete gömülüdür.** Site `words.json`'ı yeniden üretirse
(sıra değişir) eski uygulama sürümü siteden **farklı** bir günlük bulmaca
gösterir; paylaşılan `#gün` sonuçları uyuşmaz. `words.json` değişikliği yeni
bir uygulama sürümü gerektirir. `GUN_BASLANGIC_UTC` için de aynısı geçerli.

**Xcode burada yok.** Bulut oturumları Linux'tur; `npx cap sync ios` çalışır ama
derleme yalnızca TestFlight iş akışında (macOS) yapılır. Derlemeyi görmeden
"derleniyor" demeyin.

**`ios/` dosyalarını `cap add` ile yeniden üretmeyin.** Elle yapılan ayarlar
(README → "elle değiştirilenler") kaybolur. `npx cap sync ios` güvenlidir:
yalnızca `public/`, `capacitor.config.json` ve `CapApp-SPM/Package.swift`'i yazar.

**`project.pbxproj` elle düzenlenirken** her nesne kimliği (24 onaltılık hane)
benzersiz olmalı; bozuk dosyayı ancak Xcode fark eder.

**Lisanslar elle güncellenir.** `web/lisanslar.html` şunları kelimesi
kelimesine içerir: pakete giren bağımlılıkların `node_modules/<paket>/LICENSE`
dosyaları (MIT), Zemberek-NLP'nin `LICENSE` dosyası, Apache Cordova'nın
`NOTICE` dosyası (`@capacitor/ios` Cordova kodu içerir), apache.org'daki
Apache 2.0 metni ve Fraunces yazı tipinin sitedeki `fonts/OFL.txt` dosyası
(SIL OFL 1.1). Bağımlılık güncellenip lisansı değişirse test kırılır;
metni `node_modules`'ten (yazı tipi için siteden) aynen kopyalayın.

**Simülatör iş akışı (`simulator.yml`) gerçek derlemedir ama mağaza derlemesi
değildir:** imzasız, Debug, iOS Simülatörü. Ekran görüntüleri sabit adreslerde
(README → "Simülatör ekran görüntüleri"). Hamleleri oynayan
`araclar/otomatik-oyna.js` yalnızca `araclar/simulator.sh` içinde
`ios/App/App/public`'e eklenir; her `cap sync` o klasörü yeniden yazıp siler
(TestFlight arşivden önce eşitler). Yerelde `simulator.sh`'tan sonra `cap sync`
yapmadan Xcode'da arşivlemeyin: betik uygulamaya girer. Betik oyuncunun yolundan gider
(ana ekranda "Oyna", `#giris` alanına yazma, `#btnHelp`); site `index.html`'de
`<script src="yerel.js"></script>` satırı ya da bu ögeler değişirse iş akışı kırılır,
tarayıcı testi de. Klavye açıldıysa görünen alanı ölçer (`SM-OTOMATIK: bilgi …`, iş
günlüğünde görünür) ve giriş satırı ile harf şeridinin klavyenin üstünde kaldığını denetler.

**Tarayıcı testi sahte köprü kullanır.** Titreşimin, paylaşım sayfasının, gerçek
reklamların, ATT/UMP pencerelerinin ve gerçek satın almanın çalıştığı ancak cihazda
(TestFlight, Sandbox hesabı) görülür.

**Paylaşım metnindeki adres** uygulamada `capacitor://localhost` olurdu;
`yerel.js` onu site adresiyle (punycode) değiştirir.

**Simge geçici olabilir.** Tasarım takımı site deposuna
`tools/uygulama/simge-1024.png` ve `acilis-2732.png` ekleyince `npm test`
"güncel değil" diye kırılır: `npm run gorsel` çalıştırıp sonucu işleyin.

## Doğrulanmamış varsayımlar

İlk gerçek cihaz derlemesinde bakılacaklar (bulunca bu listeden silin):

0. Gelir: hiçbiri cihazda denenmedi. `SatinAlma.swift` Linux'ta derlenemedi (simülatör işi
   derler); `capacitorDidLoad` ile kayıtlı yerel eklentinin `Capacitor.Plugins.SatinAlma`
   olarak görünmesi simülatör işinde `otomatik-oyna.js` ile denetlenir. Gerçek reklam,
   ATT/UMP pencereleri, ödüllü reklamın kapanış olayları, satın alma ve geri yükleme
   TestFlight'ta ve Sandbox hesabıyla bakılacak. Çevrimdışı açılışta StoreKit'in
   `currentEntitlement`'ı boş dönüp Plus'ı silmesi olasılığı bilinmiyor (yerel önbellek
   yalnızca açık "yok" cevabıyla silinir; ama boş cevabın ne zaman geldiği doğrulanmadı).

1. `testflight.yml` çalıştı: #3 (13 Kasım 2026) başarılı, derleme 3 yüklendi (Xcode 26.6,
   `macos-26`). API anahtarı **Admin** olmalı: App Manager geliştirme imzasına yetti, bulutta
   dağıtım imzasına yetmedi (SAHIP-ADIMLARI 4). Gerçek AdMob kimlikleri girdikten sonra
   yayın denetimi adımının ilk gerçek çalışması izlenecek.
2. WebKit'te CSP `'self'`in `capacitor://localhost` ile eşleşmesi (açıkça da
   yazıldı). Oyun boş açılırsa ilk bakılacak yer burası.
3. Çentik/güvenli alan: site CSS'i `env(safe-area-inset-*)` kullanmıyor,
   `viewport-fit=cover` yok; `capacitor.config.json` → `ios.contentInset =
   "always"` içeriği durum çubuğu ile ana ekran çubuğunun arasında tutar, aradaki
   şerit `backgroundColor` (#f3eada, sitenin `--bg` kâğıt rengi) olur.
   Simülatörde doğrulandı (PR #5, iPhone SE ve Pro Max): `.app { height: 100dvh }`
   kenar boşlukları düşülmüş yüksekliği veriyor. Gerçek cihazda bir kez bakın.
   Sorun çıkarsa çözüm `web/uygulama.css`'tedir, site CSS'ine dokunmayın.
4. `mailto:` bağlantısının Mail'i açması; `gizlilik.html` ↔ oyun geçişi.
5. Ana ekranda "Sözcük Merdiveni" adının kısalması.
6. `simulator.yml`'deki ön sürüm adımı (`gh release`) yalnızca `main`'de çalışır;
   PR'da denenemedi. İlk birleştirmeden sonra
   `releases/download/simulator/kucuk-1-gunun-bulmacasi.png` açılıyor mu bakın.
7. Telefonun klavyesi (13 Kasım 2026): yalnızca tarayıcıda, görünüm kısaltılarak denendi.
   Cihazda bakılacaklar: (a) klavye açılırken ekranın sıçramaması ve sayfanın kaymaması
   (kayarsa `--vv-top` izler; kalıcı çözüm `capacitor.config.json` → `ios.scrollEnabled:
   false`, ama gizlilik/lisans sayfaları belge kaydırır, önce onlar iç kaydırmaya alınmalı);
   (b) WKWebView'in klavyenin üstünde gösterdiği "Bitti" çubuğu (form yardımcı çubuğu)
   eklentisiz gizlenemez: yer kaplıyor ya da rahatsız ediyorsa seçenek `@capacitor/keyboard`
   (sahip onayı) ya da `AnaGorunum`'da küçük bir Swift eklemesi; (c) gönder tuşunun
   (`enterkeyhint="send"`) kelimeyi göndermesi; (d) İngilizce klavyede `i` → `İ`, şeritteki
   `I`; (e) dikte ve öneri çubuğu; (f) ödüllü reklamdan dönünce klavyenin geri gelmesi
   (gelmezse tahtaya dokunmak açar).
