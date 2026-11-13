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
  (StoreKit 2, npm paketi yok). Başkası sahip onayı ister; sürümler kesin (`^` yok),
  `package-lock.json` depoda, `npm audit` temiz.
- **Google test reklam kimlikleri yayına girmez.** Kimlikler tek yerde, `gelir.json`'da.
  TestFlight iş akışı arşivden önce `araclar/yayin-denetle.mjs` çalıştırır; test kimliği
  varsa derleme durur. Bu adımı kaldırmayın ya da koşula bağlamayın (testle korunur).
- **TestFlight gizli bilgileri yalnızca `testflight` ortamında.** Ortam
  yalnızca `main`'den çalışır; `testflight.yml`'deki `environment:` satırı
  testle korunur. Gizli bilgiyi başka bir işe ya da depo düzeyine taşımayın.
- **Site dosyaları burada düzenlenmez.** Oyun hatası site deposunda `[oyun]`
  issue'sudur. Uygulamaya özgü fark `araclar/web-esitle.mjs` ya da `web/yerel.js`'tedir.

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

**Gelir (`window.SozcukGelir`, `web/yerel.js`).** Oyun (site deposu) reklam, Plus ve
ipucu/tekrar için bu donuk kancayı çağırır: `plusMu()` (düz boolean, söz değil),
`odulluReklam(neden)`, `gecisReklami("cozum")`, `plusSatinAl()`, `plusGeriYukle()`.
Açılış sırası: StoreKit'ten Plus'ı yeniden doğrula → Plus yoksa UMP (AEA, BK, İsviçre)
→ ATT (yalnızca karar verilmemişse) → AdMob başlat → ödüllü ve geçiş reklamını önyükle.
Plus sahibine reklam başlatılmaz, izin sorulmaz. ATT reddedilirse reklam
kişiselleştirilmeden sürer. Geçiş reklamı: oturumun ilk çözümünde yok, en az 3 dk aralık,
çözüm penceresi kapanınca, hazır değilse atlanır. Kimlikler `gelir.json` → `web-esitle.mjs`
`yerel.js`'e yazar; `admobAppId` → `ios-ayarla.mjs` → `Info.plist`. Plus önbelleği
`localStorage.sm_plus`, her açılışta StoreKit düzeltir. Simülatör derlemesi
(`window.SM_OTOMATIK`) reklamı, ATT'yi ve satın almayı kapatır, ödülü hep verir.

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
yapmadan Xcode'da arşivlemeyin: betik uygulamaya girer. Site `index.html`'de
`<script src="yerel.js"></script>` satırı ya da `app.js`'te `pressKey`,
`hideModal`, `#nasil-oynanir` değişirse bu iş akışı kırılır, tarayıcı testi de.

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

1. `testflight.yml` hiç çalıştırılmadı (koşucu adı, Xcode sürümü, imzalama
   bayrakları). Arşiv geliştirme imzasıyla alınır ve takımda kayıtlı bir cihaz
   ister; API anahtarının App Manager rolüyle bulut imzalamaya yetip yetmediği
   bilinmiyor (SAHIP-ADIMLARI 2 ve 4).
2. WebKit'te CSP `'self'`in `capacitor://localhost` ile eşleşmesi (açıkça da
   yazıldı). Oyun boş açılırsa ilk bakılacak yer burası.
3. Çentik/güvenli alan: site CSS'i `env(safe-area-inset-*)` kullanmıyor,
   `viewport-fit=cover` yok; `capacitor.config.json` → `ios.contentInset =
   "always"` içeriği durum çubuğu ile ana ekran çubuğunun arasında tutar, aradaki
   şerit `backgroundColor` (#f3eada, sitenin `--bg` kâğıt rengi) olur.
   Simülatörde doğrulandı (PR #5, iPhone SE ve Pro Max): `.app { height: 100dvh }`
   kenar boşlukları düşülmüş yüksekliği veriyor, her zaman görünen ekran
   klavyesinin alt sırası (GİR, sil) tam görünüyor. Gerçek cihazda bir kez bakın.
   Sorun çıkarsa çözüm uygulamaya özel küçük bir CSS'tir, site CSS'ine dokunmayın.
4. `mailto:` bağlantısının Mail'i açması; `gizlilik.html` ↔ oyun geçişi.
5. Ana ekranda "Sözcük Merdiveni" adının kısalması.
6. `simulator.yml`'deki ön sürüm adımı (`gh release`) yalnızca `main`'de çalışır;
   PR'da denenemedi. İlk birleştirmeden sonra
   `releases/download/simulator/kucuk-1-gunun-bulmacasi.png` açılıyor mu bakın.
