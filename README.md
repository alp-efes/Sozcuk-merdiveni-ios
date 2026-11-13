# Sözcük Merdiveni — iOS

[Sözcük Merdiveni](https://xn--szckyolu-n4a6d.com/) oyununun iPhone uygulaması.
Oyunun kendisi site deposundadır (`alp-efes/sozcuk-merdiveni`); bu depo onu
[Capacitor 8](https://capacitorjs.com) ile bir iOS uygulamasına paketler.

- Oyun dosyaları **uygulamanın içine paketlenir**; uzak adres yüklenmez, çevrimdışı çalışır.
- Web görünümü ağ isteği yapmaz: sitedeki reklam ve analitik paketlenirken çıkarılır, CSP sıkıdır.
  Ağa yalnızca yerel Google AdMob SDK'sı (reklam) ve Apple StoreKit (Plus) çıkar.
- Gelir: ödüllü reklam (ipucu/tekrar), çözüm sonrası geçiş reklamı ve tek seferlik **Plus**
  satın alması (reklamsız, sınırsız ipucu/tekrar). Tek izin istemi App Tracking Transparency.
- Yerel özellikler: titreşim (geçersiz hamle, çözüm), iOS paylaşım sayfası, reklam, Plus.
- Yalnızca iPhone, yalnızca dikey, iOS 15+, Türkçe.

## Nasıl çalışır

```
site deposu (index.html, app.js, style.css, words.json, fonts/)
   │  npm run esitle   → araclar/web-esitle.mjs: kopyalar, index.html'i dönüştürür
   ▼
www/  (üretilir, depoya girmez)  + web/yerel.js + web/gizlilik.html
   │  npx cap sync ios
   ▼
ios/App  (Xcode projesi, Swift Package Manager)  →  TestFlight iş akışı
```

Site dosyaları elle düzenlenmez. `index.html` üzerindeki bütün fark
`araclar/web-esitle.mjs` içindedir; `app.js`'e yerel özellikler
`web/yerel.js` ile dışarıdan bağlanır.

## Komutlar

Site deposu yan klasörde (`../sozcuk-merdiveni`) olmalı; başka yerdeyse
`SITE_DEPOSU=/yol` verin.

```bash
npm ci                 # bağımlılıklar (kesin sürümler, package-lock.json)
npm test               # eşitle + bütün testler (Linux'ta çalışır)
npm run esitle         # siteyi www/ içine paketle
npm run ios:sync       # esitle + npx cap sync ios
npm run ios:ayarla     # paket kimliği / ad / sürümü Xcode projesine yaz
npm run gorsel         # simge ve açılış görselini ios/ içine yerleştir
```

`npm test` Playwright'ın Chromium'una ihtiyaç duyar:
`npx playwright install chromium`. Ekran görüntüsü almak için
`EKRAN_DIZINI=/bir/klasor npm test`.

## Dosyalar

| Yol | Görev |
|---|---|
| `gelir.json` | Reklam (AdMob) ve Plus kimlikleri: **tek yer**. Şu an Google test kimlikleri; gerçekleri `SAHIP-ADIMLARI.md` 9 |
| `capacitor.config.json` | Paket kimliği (`appId`), görünen ad, durum çubuğu ve zemin rengi |
| `package.json` | Sürüm (`version` → Xcode `MARKETING_VERSION`), bağımlılıklar |
| `araclar/web-esitle.mjs` | Siteyi `www/` içine kopyalar; reklam/analitik/SEO'yu çıkarır, CSP ekler |
| `araclar/ios-ayarla.mjs` | Kimlik, ad ve sürümü Xcode projesine yazar |
| `araclar/gorsel.mjs` | Simge ve açılış görseli |
| `araclar/ExportOptions.plist` | TestFlight yüklemesinin dışa aktarma ayarı |
| `araclar/simulator.sh` | Simülatör derlemesi, otomatik oynatma ve ekran görüntüleri (yalnızca macOS, `simulator.yml`) |
| `araclar/otomatik-oyna.js` | Günün bulmacasını kendi kendine oynar; yalnızca simülatör derlemesine eklenir |
| `web/yerel.js` | Titreşim, paylaşım ve gelir kancasını (`window.SozcukGelir`: reklam, izin, Plus) `app.js`'e bağlar |
| `araclar/yayin-denetle.mjs` | TestFlight derlemesine Google test reklam kimliği girmesini engeller |
| `ios/App/App/SatinAlma.swift` | Uygulama içi StoreKit 2 köprüsü (Plus) + köprüye kaydeden ana görünüm |
| `ios/App/Plus.storekit` | Xcode simülatöründe Plus'ı denemek için (pakete girmez) |
| `web/gizlilik.html` | Uygulamanın kendi gizlilik metni (sitedekinin yerine paketlenir) |
| `web/lisanslar.html` | Açık kaynak lisansları; oyunun alt bilgisinden ve gizlilik sayfasından açılır |
| `ios/` | `npx cap add ios` çıktısı + elle yapılan ayarlar (aşağıda) |
| `testler/` | `paket.test.mjs` (dosya denetimleri), `tarayici.test.mjs` (oyunu oynar) |
| `.github/workflows/` | `test.yml` (her PR), `simulator.yml` (her PR, main ve günlük), `testflight.yml` (yalnızca elle) |

### `ios/` içinde elle değiştirilenler

`npx cap add ios` çıktısının üzerine (hepsi `testler/paket.test.mjs` ile korunur):

- `Info.plist`: geliştirme dili `tr`, `CFBundleLocalizations = [tr]`, yalnızca
  dikey, `ITSAppUsesNonExemptEncryption = NO`, iPad yönleri silindi.
- `project.pbxproj`: yalnızca iPhone (`TARGETED_DEVICE_FAMILY = 1`), geliştirme
  bölgesi `tr`, `PrivacyInfo.xcprivacy` kaynaklara eklendi, sürüm `1.0.0`.
- `Info.plist`: `GADApplicationIdentifier` (gelir.json'dan), `NSUserTrackingUsageDescription`,
  Google'ın 50 `SKAdNetworkItems` kimliği. `SceneDelegate`: kök görünüm `AnaGorunum` (Plus eklentisini köprüye kaydeder).
- `PrivacyInfo.xcprivacy`: izleme var (`NSPrivacyTracking`), alan adı listesi bilerek boş
  (iOS, izin yokken listedeki adlara bağlantıyı keser; kişiselleştirilmemiş reklam da yüklenemezdi).
  Toplanan veri türlerini ve API gerekçelerini Google SDK'sı kendi bildiriminde taşır.
- `Assets.xcassets`: simge ve açılış görseli (`npm run gorsel`).

Durum çubuğu Capacitor 8'in çekirdeğindeki SystemBars ile ayarlanır
(`capacitor.config.json` → `SystemBars.style = LIGHT`: açık kâğıt zeminde koyu yazı).
Site güvenli alanı bilmediği için `ios.contentInset = "always"`: içerik çentiğin
ve ana ekran çubuğunun altına girmez (ayrıntı: `CLAUDE.md`).
Açılış ekranı Capacitor şablonunun `LaunchScreen.storyboard`'udur. Bu ikisi
için ayrı eklenti (`@capacitor/status-bar`, `@capacitor/splash-screen`)
kurulmadı: gerek yok.

## Simülatör ekran görüntüleri

**Simülatör** iş akışı (`simulator.yml`) her PR'da, `main`'e her push'ta, her
gün ve elle çalışır. macOS'ta uygulamayı iOS Simülatörü için imzasız derler
(Apple hesabı, gizli bilgi yok), küçük (iPhone SE) ve büyük (Pro Max) iPhone'da
açar ve şu anlarda ekran görüntüsü alır: günün bulmacası, iki hamle sonrası,
çözüm penceresi, "Nasıl Oynanır". Hamlelerden sonra uygulamanın hâlâ
çalıştığına ve JavaScript hatası olmadığına bakar.

Hamleleri `araclar/otomatik-oyna.js` oynar: `araclar/simulator.sh` onu derlemeden
hemen önce `ios/App/App/public` içine ekler. Asıl güvence `cap sync`'tir: her
`npm run ios:sync` ya da `npx cap sync ios` o klasörü `www/`'den yeniden yazar ve
betik silinir; TestFlight iş akışı arşivden önce eşitler. `www/`'in ve diğer iş
akışlarının betiği içermediğini `testler/paket.test.mjs` denetler.
**Dikkat:** yerelde `simulator.sh` çalıştırıp `cap sync` yapmadan Xcode'da
arşivlerseniz betik uygulamaya girer.

Betik her aşamada konsola `SM-OTOMATIK: <aşama>` yazar; Debug derlemesinde
Capacitor bunu uygulamanın çıktısına aktarır. `simulator.sh` satırı görünce ekran
görüntüsü alır ve paketin içine `onay-<aşama>.txt` yazar; betik bu dosyayı
görene dek o ekranda bekler. Çıktı gecikse de her görüntü doğru aşamadır.
Art arda iki aynı görüntü, `words.json` yerine yedek sözlüğe düşme ya da günün
bulmacası dışında bir bulmaca iş akışını durdurur.

Görüntüler her çalıştırmada `simulator-ekran` iş akışı çıktısıdır. `main`'deki
çalıştırmalar (PR'lar değil) onları **simulator** ön sürümüne de yükler; adresler
sabittir, giriş istemez:

```
https://github.com/alp-efes/Sozcuk-merdiveni-ios/releases/download/simulator/kucuk-1-gunun-bulmacasi.png
… kucuk-2-hamleler, kucuk-3-cozum, kucuk-4-nasil-oynanir; aynıları buyuk- önekiyle
```

## Yayın

TestFlight'a yükleme GitHub'daki **TestFlight** iş akışıyla yapılır; kurulum
`SAHIP-ADIMLARI.md` içinde. App Store'a gönderimi yalnızca site sahibi yapar.

Takımlar için kurallar ve tuzaklar: `CLAUDE.md`.
