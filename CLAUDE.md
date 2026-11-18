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
  Tek istisna (sahip onaylı, 17 Kasım 2026, #47): anlam balonundaki "TDK'da aç" bağlantısı
  (`https://sozluk.gov.tr/kelime/<kelime>`, `target="_blank"`). Capacitor bunu web görünümünde yüklemez, harici (varsayılan) tarayıcıya
  verir (`WebViewDelegationHandler.swift`: ana çerçeve dışı gezinmede `UIApplication.shared.open` + `.cancel`;
  yeni pencerede `createWebViewWith` → `open`, `nil`). Yerel kod yok, CSP değişmez; `SFSafariViewController`/uygulama içi
  tarayıcı KULLANILMAZ (App Store yaş anketi "Unrestricted Web Access = Hayır"). `paket.test.mjs` yalnızca `app.js`'te bu ön eke izin verir.
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
  İstisna (sahip isteği, 14 Kasım 2026): `magaza-kayit.yml` (mağaza metinleri; incelemeye göndermez) aynı
  `testflight` ortamını kullanır; gizli bilgi taşınmadı, yeni ad eklenmedi. Yalnızca `workflow_dispatch` ve
  yalnızca `main` (testle korunur); `pull_request` tetikleyicisi eklenmez.
  İkinci elle çalışan iş (sahip isteği, 14 Kasım 2026): `test-grubu.yml` bir derlemeyi dış test grubu "1. Seviye Test"e ekler
  (kullanıcı eklemez/silmez); aynı kurallar.
  Üçüncü (sahip isteği, 18 Kasım 2026): `ulke-kaldir.yml` uygulamayı tek bir App Store bölgesinde satıştan kaldırır
  (Çin anakarası, CHN: oyun lisansı, AI/güvenlik değerlendirmesi uyum maddeleri); ülke eklemez, kuru varsayılan; aynı kurallar.
  Dördüncü (sahip isteği, 18 Kasım 2026, "resubmit et, tüm yetkileri veriyorum"): `inceleme.yml` bekleyen App Store
  gönderimini geri çeker (`iptal`) ya da sürümü incelemeye gönderir (`gonder`; önce yaş beyanını `YAS_BEYANI`'na göre günceller:
  kaba söz, alkol/uyuşturucu göndermesi ve yetişkin temalar seyrek/hafif: sahip kararı 2A ve anlam tanımları; yayın
  türüne dokunmaz: sahibin seçimi (AFTER_APPROVAL); gonder sürüme bağlı derlemenin numarasını ister); kuru varsayılan; aynı kurallar.
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

**Anlam balonu (site #49) uygulamada çalışır:** `anlam.json` `AYNEN`'dedir (zorunlu; site deposunda yoksa eşitleme durur, sessizce atlanmaz:
anlamsız uygulama göndermemek için). TDK bağlantısı yukarıdaki istisnadır; `gizlilik.html` bunu söyler.

**Uygulama arayüzü siteden farklıdır (sahip kararı, 13 Kasım 2026); site aynı kalır.**
`araclar/arayuz.mjs` işaretlemeyi tutar, `web-esitle.mjs` onu sitenin `index.html`'ine
sayarak ekler, `web/uygulama.js` davranışı, `web/uygulama.css` görünümü verir. Site
dosyalarına dokunulmaz; `uygulama.js` `WordLadder` metotlarını sarar (`init`, `buildKeyboard`, `renderStatus`, `askShowResult`, `beginRetry`, `dailyRecord`, `restoreState`,
`win`, `showModal`, `showYenile`, `saveState`, `updateTabs`, `tickCountdown`), `canShowResult`'u, `canRetry`'yi ve `WordLadder.LAYOUT`'u değiştirir ve Capacitor
köprüsü gerektirmez (tarayıcı testinde de çalışır). Farklar:

- **Oyun başlığında menü (☰, `#btnMenu`), yenile düğmesi yok** (sahip notları, 15 Kasım 2026: yenile
  düğmesi geri okuna benziyordu; menü ortada yüzen kart, eylemler büyük tuş). Sitenin `#btnRestart`'ı gizlidir.
  Menü (`#menu`) sitenin pencereleri gibi ekranın ortasında açılır. Üstte büyük tuşlar: Ana menüye dön
  (`#btnAna`); Serbest oyun (serbestte `#btnRestart`'a basar: yeni bulmaca, ilerleme varken onay; günlükte
  ana ekrandaki Serbest Oyun kartının yolu, kalınan serbest oyun sürer); Yeniden dene (aynı bulmaca baştan,
  ilerleme varken sitenin yenile penceresi kendi metniyle onay ister; app.js'te serbest için bu yol yok,
  zinciri `uygulama.js` sıfırlar). Yeniden dene günlükte gizli: `YENIDEN_DENE_GUNLUKTE = false` (sahip
  "günlükte baştan başla olmasın" demişti; yeni isteği soruldu). Altta Nasıl oynanır? ve `role="switch"`
  ayarlar: Titreşim (`sm_titresim`; `yerel.js` her `Haptics` çağrısında bakar), Ses (`#btnMute`'a basar),
  Büyük yazı (`sm_yazi`; aşağıda).
  Açılınca odak ilk tuşa gider; Escape ve dışarı dokunuş kapatır, Tab menünün içinde döner; kapanınca odak
  menü düğmesine döner, oyun ekranında orada bırakılmaz (bağlı klavyedeki Boşluk menüyü yeniden açardı; Tab başlıktan sürer). Açıkken perdesi ekran tuşlarını örter, bağlı klavye de tahtaya yazmaz.
  Gecikmeli çözüm penceresi açılırken açık menü kapanır.
- **Başlık: ☰ solda, mod adı tam ortada, sağda "En kısa yolu göster"** (sahip kararları, 15 Kasım 2026).
  Sitenin yardım düğmesi (`#btnHelp`) uygulamada gizli; yardım menüde. Sitenin `#btnShowResult`'ı durum
  satırından başlığa taşınır (yuvarlak `icon-btn`). Sitede yalnızca adım en azı geçince görünür; uygulamada
  `canShowResult` oyun sürdükçe hep açık der, her basış sitenin onay penceresini açar (günlükte ilk çözüm
  yoksa metin: "Bugünün bulmacası çözülmemiş sayılır"). Onayda sitenin yolu sürer (en kısa yol basılır,
  `sm_gunluk_*` `{steps: 0, gosterildi: true}`). Bitmiş oyunda düğme `visibility: hidden`: yerini tutar,
  mod adı kaymaz.
- **Çözüm penceresinde "En kısa yolu gör"** (`#btnEnKisa`, `arayuz.mjs` → `EN_KISA`): pencerenin adım
  sayısı en azı aşıyorsa görünür; basınca sitenin `shortestPath()`'iyle bir en kısa yol pencerede yazılır
  (`#enKisaYol`). Yalnızca gösterim: kayıt, seri, paylaşım değişmez; pencere kapanmaz (geçiş reklamı
  pencerenin kapanmasına bağlıdır).
- **Günlükte tekrar yok** (sahip kararı, 15 Kasım 2026; site aynı kalır). `canRetry` hep `false`: çözüm
  penceresinde ve durum satırında "Tekrar dene" çıkmaz, ödüllü reklamlı tekrar (`odulluReklam("tekrar")`)
  tetiklenmez; `beginRetry` günlükte bir şey yapmaz. Eski sürümde başlamış tekrar (`sm_gunluk_*` → `deneme`)
  okunurken temizlenir, sm_state'teki süren tekrar yerine günlük ilk çözümüyle bitmiş açılır; ilk çözüm,
  en iyi, seri ve paylaşım değişmez. Serbestteki menü "Yeniden dene" aynen durur.
- **Açılış → ana ekran ⇄ oyun.** `body[data-ekran]` (`ana` | `oyun`; yokken açılış ekranı).
  Açılış ekranı yerel açılış görseliyle aynı çizimdir (satır içi SVG, renkler belirteçlerden),
  sözlük yüklenene dek ve en az 0,8 sn görünür. Ana ekranda iki kart: Günün Bulmacası,
  Serbest Oyun (zorluk/uzunluk burada seçilir). Oyun başlığında menü düğmesi ve mod adı;
  sitenin sekmeleri, ayar satırı, durum satırındaki geri sayım ve ses düğmesi oyun ekranında
  yoktur (ses düğmesi ana ekrana taşınır, tercih `sm_ses`'te hatırlanır).
- **Oyunun kendi ekran klavyesi; telefonun klavyesi hiç açılmaz** (sahip isteği, 15 Kasım 2026:
  "en alt köşeye uzanıp enter demek yorucu"). Tuşları sitenin `buildKeyboard`'u üretir ve basar
  (`pressKey`); diziliş `uygulama.js`'te `WordLadder.LAYOUT` ile değişir: Türkçe Q
  (`Q W E R T Y U I O P Ğ Ü` / `A S D F G H J K L Ş İ` / `Z X C V B N M Ö Ç ⌫`). Q, W, X Türkçede yok:
  yerleri durur, devre dışıdır. I ve İ'nin `aria-label`'ı "Noktasız I" / "Noktalı İ". Klavyenin altında
  eylem sırası (`#eylemler`, `arayuz.mjs` → `EYLEMLER`): ortada büyük Gönder (`#btnGonder`, `.btn-primary`,
  52 px), solda Geri al, sağda İpucu (sitenin `#btnUndo`/`#btnHint`'i durum satırından taşınır, yuvarlak,
  hak rozetleri yerinde); altında 16 px boşluk (ana ekran çubuğuna yapışmasın). Bitmiş oyunda Gönder devre
  dışıdır (`renderStatus` sarılır). Sayfada metin alanı yoktur (test kırılır):
  iOS klavyesini açacak odak olmaz. Bağlı klavye (iPad, Bluetooth) `app.js`'in keydown yolundan yazar
  (şapkalı harf orada süzülür). Harf ve Sil tuşu hafif dokunuş verir (`yerel.js`, `sm_titresim`'e uyar);
  basış bir şey yapmayacaksa (oyun bitmiş, satır dolu, boşken Sil) titremez.
  Tasarım dili sitenin: tuş kapağı `.cap`, renkler belirteçlerden; harf boyama yok.
  Türkçe harf şeridi ve `#btnSerit` kalktı: `sm_serit` yazılmaz, eski kayıt açılışta silinir.
- **Ekran kaymaz.** `html, body` kaydırılmaz; `.app` `position: fixed; inset: 0`. Merdiven,
  klavye ve eylem sırası tek parçadır (375×667'den 430×932'ye test edilir); uzun merdiven
  kendi içinde kayar. `.app .frame { height: 100% }`: sitede bitmiş merdivenin çerçevesi uzayıp
  dış kap kaydığı için HEDEF klavyenin arkasında kalıyordu; artık bitince de yalnızca `.steps`
  kayar, sona kaydırılmış açılır, HEDEF görünür. `@capacitor/keyboard` eklentisi YOK.
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
- **Isındın / Soğudun göstergesi (`#yakin`, site #48) durum satırının sağ ucunda** (`uygulama.css`, `order`): sitede durum satırının altına asılır; uygulamada geri al/ipucu satırda olmadığı için adım bilgisiyle aynı satırda durur, satır kaymaz (testli).
- **"Nasıl oynanır?" pencere olarak açılır** (`body.yardim`); açıkken alttaki ekran gizlidir.
- **Oyuna ilk girişte bir kez kısa "nasıl oynanır" kartı** (`#ilkYardim`, `arayuz.mjs` → `ILK_YARDIM`; sahip
  isteği, 16 Kasım 2026). Ana ekranda değil, ilk oyun girişinde (günlük ya da serbest) açılır; menünün kartı ve
  perdesi. Kurallar, KAL → KOL → KOY → SOY örneği (harfler `uygulama.js` zamanlayıcısıyla adım adım değişir,
  değişen harf çizgili, yerine oturan yeşil; hareketi azaltta durağan), iki oyun türü; "Başla" kapatır,
  "Daha fazla" yardım penceresini açar. Escape ve dışarı dokunuş da kapatır; açılınca odak "Başla"da, Tab kartta
  döner, açıkken ekran tuşları ve bağlı klavye yazmaz. Kapanınca `sm_ilk_yardim` yazılır (oyunu, hakları
  değiştirmez); güncelleyen eski oyuncular da bir kez görür. Çözüm penceresi açılırsa kart kapanır.
- **Günlük kartında seri** (sahip kararı 2A, site issue #47, 17 Kasım 2026). Sayı ("4 günlük seri") ve son 7 günün
  kareleri (çözülen yeşil, çözülmeyen boş, bugün kiremit çerçeveli; şerit `role="img"`, günler `aria-label`'da metinle).
  Yalnızca mevcut `sm_gunluk_<YYYY-AA-GG>` kayıtlarından, TRT günüyle (`todayKey`); yeni kayıt yok. Çözülmüş gün
  `steps ≥ 1` (`dailyRecord` gibi): "Sonucu göster" ile biten gün (`{steps: 0, gosterildi: true}`) seriyi bozar
  (bugün gösterildiyse seri 0); bugün henüz bitmediyse seri dünden sayılır. TRT 18.00'den sonra bugün bitmemiş ve
  seri ≥ 1 ise kartta "Serini korumak için bugün çöz · N saat kaldı" (`#seriUyari`). Bildirim ve izin yok. Metin ve
  sayaç tek sabitte, `uygulama.js` → `SERI_UYARI` (sahip kararı bekliyor; `null` uyarıyı kaldırır). Kart ana ekran
  açılınca ve TRT saati değişince (`tickCountdown`) yeniden çizilir; her saniye kayıt okunmaz. Geçersiz tarihli
  (`2026-13-45`, `2026-02-30`) ya da `steps`'i tam sayı olmayan kayıt sayılmaz. Varsayılanlar sahip değiştirebilir.
- **"İstatistiklerim" penceresi** (10A; `#istatistik`, `arayuz.mjs` → `ISTATISTIK`, menünün kartı ve perdesi; günlük
  kartındaki `#btnIstatistik` açar). Yalnızca günün bulmacası, `sm_gunluk_*`'tan, cihazda: çözülen gün, şu anki ve
  en uzun seri, en kısa yolla çözme oranı, en kısa yola uzaklık dağılımı (tam, +1, +2, +3 ve üstü), en iyi gün
  (en az fazla adım; eşitse uzun bulmaca, sonra yeni gün). Sonuç ilk çözümdür (`steps`, paylaşılanla aynı). Kayıt
  en az adımı saklamaz: geçmiş günün bulmacası şimdiki `words.json`'dan (`dailyPuzzle` o günün numarasıyla) alınır;
  kayıttaki zincirin uçları uymuyorsa (sözlük `--yeni` ile yenilenmiş) ya da zincir yoksa o gün oranda ve dağılımda
  sayılmaz, sayısı yazılır. Serbest oyun özeti yok (yeni kayıt isterdi). Odak kapat düğmesinde, Escape ve dışarı
  dokunuş kapatır, Tab kartta döner; kapanınca odak açan düğmeye döner. Çubuk genişliği CSSOM ile (`style.width`,
  CSP'ye takılmaz).
- **Büyük yazı** (5A; menüde `role="switch"`, `sm_yazi` = `"1"`, kapatınca silinir; `gizlilik.html` sayar).
  `html.buyuk-yazi { font-size: 119% }`: sitenin rem belirteçleri birlikte büyür (gövde 19 px, klavye harfi ~21 px);
  harf blokları ve tuş/düğme boyları px'tir, yerleşim aynı kalır. "Ekran kaymaz", mod adı ve menü testleri büyük
  yazıda da koşar (375×667, 390×844, 430×932).

**İlk sürüm Plus'suz (sahip kararı, 14 Kasım 2026):** `web/yerel.js` → `PLUS_ACIK = false` kancadan `plusSatinAl`/`plusGeriYukle`/`plusFiyat`'ı çıkarır, `plusMu` hep false'tur, StoreKit'ten Plus sorulmaz; site `app.js` Plus'a yalnızca kanca `plusSatinAl` veriyorsa değinir. `SatinAlma.swift` yerinde (vitrin için de gerekli); `web/gizlilik.html` Plus'tan söz etmez (Plus açılırken geri konur, testler bayrağı açıp dener). **Geçici: `REKLAM_YOKSA_ODUL = true`** (`web/yerel.js`) ödüllü reklam yüklenemez ya da gösterilemezse +1 hak verir (AdMob onayı gelene dek oyuncu takılmasın); yarıda kapatılan reklam ödül vermez. AdMob onaylanınca `false` yapılır.

**Gelir (`window.SozcukGelir`, `web/yerel.js`).** Oyun (site deposu) reklam, Plus ve
ipucu/geri al için bu donuk kancayı çağırır (sitedeki günlük tekrar ödüllü reklamı uygulamada yok:
günlükte tekrar hakkı kaldırıldı, 15 Kasım 2026): `plusMu()` (düz boolean, söz değil),
`odulluReklam(neden)`, `gecisReklami("cozum")`, `plusSatinAl()`, `plusGeriYukle()`.
Açılış sırası: StoreKit'ten Plus'ı yeniden doğrula → Plus yoksa UMP (AEA, BK, İsviçre)
→ vitrin (App Store ülkesi, en çok 2 sn) → ATT (yalnızca karar verilmemişse ve vitrin GBR değilse;
GBR'de ATT sorulmaz ve `tagForUnderAgeOfConsent` verilir) → AdMob başlat → ödüllü ve geçiş reklamını önyükle.
Plus sahibine reklam başlatılmaz, izin sorulmaz. ATT reddedilirse reklam
kişiselleştirilmeden sürer (reklam kimliği ve diğer uygulama/sitelerdeki bilgi kullanılmaz). Geçiş reklamı: oturumun ilk çözümünde yok, en az 3 dk aralık,
hazır değilse atlanır. Reklam `win()` anında değil, çözüm penceresi (650 ms sonra) açılıp **oyuncu
onu kapatır kapatmaz** (MutationObserver, yoklama yok) gösterilir; pencere "Yeni Oyun" ile
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

**Derleme makinesi `xcode-27` (18 Kasım 2026).** Apple ITMS-90725: Nisan 2027'den itibaren App Store'a yükleme
iOS 27 SDK (Xcode 27) ister; `macos-*` görüntülerinde Xcode 27 yok, GitHub'ın ayrı `xcode-27` görüntüsünde var
(ilk çalıştırma: Xcode 27.1, 27A9275). `simulator.yml` ve `testflight.yml` onu kullanır; `macos-26`'ya geri
çevirmeyin. Xcode alt sürümü görüntünün varsayılanıdır (sabitlenmedi).

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
Apache 2.0 metni ve Young Serif yazı tipinin sitedeki `fonts/OFL.txt` dosyası
(SIL OFL 1.1). Bağımlılık güncellenip lisansı değişirse test kırılır;
metni `node_modules`'ten (yazı tipi için siteden) aynen kopyalayın.

**Simülatör iş akışı (`simulator.yml`) gerçek derlemedir ama mağaza derlemesi
değildir:** imzasız, Debug, iOS Simülatörü. Ekran görüntüleri sabit adreslerde
(README → "Simülatör ekran görüntüleri"). Hamleleri oynayan
`araclar/otomatik-oyna.js` yalnızca `araclar/simulator.sh` içinde
`ios/App/App/public`'e eklenir; her `cap sync` o klasörü yeniden yazıp siler
(TestFlight arşivden önce eşitler). Yerelde `simulator.sh`'tan sonra `cap sync`
yapmadan Xcode'da arşivlemeyin: betik uygulamaya girer. Betik oyuncunun yolundan gider
(ana ekranda "Oyna", ilk giriş kartında "Başla", ekran klavyesinin tuşları ve `#btnGonder`, menüden "Nasıl oynanır?"); site `index.html`'de
`<script src="yerel.js"></script>` satırı ya da bu ögeler değişirse iş akışı kırılır,
tarayıcı testi de. Oyun ekranını ölçer (`SM-OTOMATIK: bilgi …`, iş günlüğünde görünür):
telefonun klavyesi hiçbir ekranda açılmamalı, eylem sırası ekrana sığmalı.

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
7. Ekran klavyesi (15 Kasım 2026): yalnızca tarayıcıda denendi. Cihazda bakılacaklar:
   (a) hızlı yazarken tuşların her dokunuşu alması (çift dokunuş yakınlaştırması yok,
   `touch-action: manipulation`); (b) basılı görünüm ve tuş başına hafif titreşimin yorucu
   olmaması; (c) iPhone SE'de (375×667, güvenli alan düşülünce daha kısa) merdivenin yeterli
   yer bulması; (d) ana ekran çubuğu ile Gönder'in arasında yeterli boşluk; (e) VoiceOver'da
   "Noktasız I" / "Noktalı İ" ve devre dışı Q, W, X'in okunuşu; (g) menü kapanınca `blur()` sonrası
   bağlı klavyede Tab sırası WKWebView'de Chromium'daki gibi mi (iPad/TestFlight'ta bakılacak).
8. TDK bağlantısı (17 Kasım 2026): yalnızca Chromium'da denendi. Cihazda "TDK'da aç"ın uygulama dışında, kullanıcının
   varsayılan tarayıcısında açıldığı ve oyunun yerinde kaldığı TestFlight'ta bakılacak (Capacitor 8.6.2
   `WebViewDelegationHandler` `createWebViewWith` → `UIApplication.shared.open`).
