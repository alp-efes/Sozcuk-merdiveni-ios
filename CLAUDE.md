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

- **Uzak içerik yok, ağ isteği yok.** Uygulama yalnızca paketindeki dosyaları
  yükler. Reklam, analitik, uzaktan `words.json` eklemek gizlilik etiketini
  ("Veri Toplanmıyor"), `PrivacyInfo.xcprivacy`'yi ve `web/gizlilik.html`'i değiştirir.
- **İzin isteyen özellik yok** (bildirim, takip, konum, kamera…). `Info.plist`'e
  `…UsageDescription` eklenirse test kırılır.
- **Yeni paket ya da eklenti yok.** Bağımlılık listesi testte sabittir; sürümler
  kesin (`^` yok), `package-lock.json` depoda, `npm audit` temiz.
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

**Paket kimliği tek yerde:** `capacitor.config.json` → `appId`. Değiştirince
`npm run ios:ayarla`. Sürüm `package.json` → `version`. Derleme numarası
depoda `1` kalır; TestFlight iş akışı çalıştırma sayısını kullanır.

**CSP:** `default-src 'none'`, betik/stil/bağlantı yalnızca paketten.
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

**Tarayıcı testi sahte köprü kullanır.** Titreşimin ve paylaşım sayfasının
gerçekten çalıştığı ancak cihazda (TestFlight) görülür.

**Paylaşım metnindeki adres** uygulamada `capacitor://localhost` olurdu;
`yerel.js` onu site adresiyle (punycode) değiştirir.

**Simge geçici olabilir.** Tasarım takımı site deposuna
`tools/uygulama/simge-1024.png` ve `acilis-2732.png` ekleyince `npm test`
"güncel değil" diye kırılır: `npm run gorsel` çalıştırıp sonucu işleyin.

## Doğrulanmamış varsayımlar

İlk gerçek cihaz derlemesinde bakılacaklar (bulunca bu listeden silin):

1. `testflight.yml` hiç çalıştırılmadı (koşucu adı, Xcode sürümü, imzalama bayrakları).
2. WebKit'te CSP `'self'`in `capacitor://localhost` ile eşleşmesi (açıkça da
   yazıldı). Oyun boş açılırsa ilk bakılacak yer burası.
3. Çentik/güvenli alan: site CSS'i `env(safe-area-inset-*)` kullanmıyor,
   `viewport-fit=cover` yok. İçeriğin durum çubuğunun altına girmediği
   varsayıldı; kenarlarda `backgroundColor` (#121213) görünmeli.
4. `mailto:` bağlantısının Mail'i açması; `gizlilik.html` ↔ oyun geçişi.
5. Ana ekranda "Sözcük Merdiveni" adının kısalması.
