# Sözcük Merdiveni — iOS

[Sözcük Merdiveni](https://xn--szckyolu-n4a6d.com/) oyununun iPhone uygulaması.
Oyunun kendisi site deposundadır (`alp-efes/sozcuk-merdiveni`); bu depo onu
[Capacitor 8](https://capacitorjs.com) ile bir iOS uygulamasına paketler.

- Oyun dosyaları **uygulamanın içine paketlenir**; uzak adres yüklenmez, çevrimdışı çalışır.
- Uygulama **hiçbir ağ isteği yapmaz**: sitedeki reklam ve analitik paketlenirken çıkarılır.
- Yerel özellikler: titreşim (geçersiz hamle, çözüm) ve iOS paylaşım sayfası. İzin isteyen hiçbir şey yok.
- Yalnızca iPhone, yalnızca dikey, iOS 15+, Türkçe.

## Nasıl çalışır

```
site deposu (index.html, app.js, style.css, words.json)
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
| `capacitor.config.json` | Paket kimliği (`appId`), görünen ad, durum çubuğu ve zemin rengi |
| `package.json` | Sürüm (`version` → Xcode `MARKETING_VERSION`), bağımlılıklar |
| `araclar/web-esitle.mjs` | Siteyi `www/` içine kopyalar; reklam/analitik/SEO'yu çıkarır, CSP ekler |
| `araclar/ios-ayarla.mjs` | Kimlik, ad ve sürümü Xcode projesine yazar |
| `araclar/gorsel.mjs` | Simge ve açılış görseli |
| `araclar/ExportOptions.plist` | TestFlight yüklemesinin dışa aktarma ayarı |
| `web/yerel.js` | Titreşim ve paylaşımı `app.js`'e bağlar |
| `web/gizlilik.html` | Uygulamanın kendi gizlilik metni (sitedekinin yerine paketlenir) |
| `ios/` | `npx cap add ios` çıktısı + elle yapılan ayarlar (aşağıda) |
| `testler/` | `paket.test.mjs` (dosya denetimleri), `tarayici.test.mjs` (oyunu oynar) |
| `.github/workflows/` | `test.yml` (her PR), `testflight.yml` (yalnızca elle) |

### `ios/` içinde elle değiştirilenler

`npx cap add ios` çıktısının üzerine (hepsi `testler/paket.test.mjs` ile korunur):

- `Info.plist`: geliştirme dili `tr`, `CFBundleLocalizations = [tr]`, yalnızca
  dikey, `ITSAppUsesNonExemptEncryption = NO`, iPad yönleri silindi.
- `project.pbxproj`: yalnızca iPhone (`TARGETED_DEVICE_FAMILY = 1`), geliştirme
  bölgesi `tr`, `PrivacyInfo.xcprivacy` kaynaklara eklendi, sürüm `1.0.0`.
- `PrivacyInfo.xcprivacy`: izleme yok, toplanan veri yok, gerekçe isteyen API yok.
- `Assets.xcassets`: simge ve açılış görseli (`npm run gorsel`).

Durum çubuğu Capacitor 8'in çekirdeğindeki SystemBars ile ayarlanır
(`capacitor.config.json` → `SystemBars.style = DARK`: koyu zeminde açık yazı).
Açılış ekranı Capacitor şablonunun `LaunchScreen.storyboard`'udur. Bu ikisi
için ayrı eklenti (`@capacitor/status-bar`, `@capacitor/splash-screen`)
kurulmadı: gerek yok.

## Yayın

TestFlight'a yükleme GitHub'daki **TestFlight** iş akışıyla yapılır; kurulum
`SAHIP-ADIMLARI.md` içinde. App Store'a gönderimi yalnızca site sahibi yapar.

Takımlar için kurallar ve tuzaklar: `CLAUDE.md`.
