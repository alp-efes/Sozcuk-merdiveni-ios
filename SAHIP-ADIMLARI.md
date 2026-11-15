# Sahibin yapacakları: ilk TestFlight derlemesi

Bu adımları yalnızca site sahibi yapabilir (hesap, ödeme, sözleşme). Takımlar
yapamaz. **[ÜCRETLİ]** işaretli adımlar para gerektirir. "Doğrulanmadı" yazan
yerler bu belge yazılırken denenemedi; Apple'ın ekranları farklıysa ekrandakine uyun.

Mac gerekmez: derleme GitHub'ın macOS makinesinde yapılır. Yine de ilk
derlemede hata çıkarsa bir Mac'te Xcode ile açmak (`ios/App/App.xcodeproj`)
sorunu bulmayı çok kolaylaştırır.

## 0. Önce karar verin

| Karar | Şu anki değer | Nerede |
|---|---|---|
| Paket kimliği (bundle ID) | `com.sozcukyolu.sozcukmerdiveni` | `capacitor.config.json` → `appId` |
| Ana ekrandaki ad | `Sözcük Merdiveni` | `capacitor.config.json` → `appName` |

- **Paket kimliği** App Store Connect'e kaydedildikten sonra değiştirilemez.
- **Ad** 16 karakter; ana ekranda büyük olasılıkla kısalır ("Sözcük Merd…"
  gibi; doğrulanmadı). Kısa bir ad isterseniz (ör. "Merdiven") takıma söyleyin.
  App Store'daki ad ayrıdır, App Store Connect'te girilir.

Değiştirecekseniz takım `npm run ios:ayarla` ile projeye yazar.

## 1. Apple Developer Program üyeliği — [ÜCRETLİ]

1. <https://developer.apple.com/programs/enroll/> adresinden başvurun.
2. Yıllık ücret: Apple'ın duyurduğu 99 USD (Türkiye'deki güncel tutarı
   başvuru ekranında görün; doğrulanmadı).
3. Bireysel başvuruda mağazada satıcı adı olarak kendi adınız görünür. Şirket
   adına başvuru D-U-N-S numarası ister ve daha uzun sürer.
4. Onay geldikten sonra <https://developer.apple.com/account> → *Membership
   details* sayfasındaki **Team ID**'yi (10 karakter) not edin.

## 2. Paket kimliğini ve iPhone'unuzu kaydedin

1. <https://developer.apple.com/account/resources/identifiers/list> → **+** →
   *App IDs* → *App* → Bundle ID: *Explicit*, `com.sozcukyolu.sozcukmerdiveni` (ya da
   seçtiğiniz). Ek yetenek (capability) işaretlemeyin: uygulama hiçbirini kullanmıyor.
2. **iPhone'unuzu kaydedin** (zorunlu): *Certificates, Identifiers & Profiles*
   → *Devices* → **+** → platform iOS, bir ad ve iPhone'un **UDID**'si.
   Derleme, arşivi önce geliştirme imzasıyla alır; geliştirme profili takımda
   kayıtlı en az bir cihaz ister. Cihaz yoksa ilk derleme "no devices" benzeri
   bir hatayla durur. Cihaz kaydı ücretsizdir.

   UDID'yi Mac olmadan bulmak:
   - **Windows:** iPhone'u kabloyla bağlayın, *Apple Devices* uygulamasını (ya
     da eski iTunes'u) açın; cihaz özetinde **Seri Numarası**'na tıklayınca
     UDID görünür, sağ tıkla kopyalanır. (iTunes'ta bilinen yöntemdir; *Apple
     Devices* uygulamasında doğrulanmadı.)
   - **Mac varsa:** Finder → kenar çubuğunda iPhone → adın altındaki bilgi
     satırına tıklayın, UDID görünene kadar tekrar tıklayın.
   - "UDID bulucu" sitelerine yapılandırma profili **yüklemeyin**: telefonunuzun
     bilgisini üçüncü kişiye verir.

   *Neden bu yol:* Arşivi doğrudan dağıtım imzasıyla almak elle imzalama
   ister; bu da sertifika (.p12), parolası ve profil için üç gizli bilgi daha
   ve her yıl yenileme demektir. İmzasız arşivleyip yalnızca dışa aktarmada
   imzalamak ise bu belge yazılırken doğrulanamadı. Bir cihaz kaydı en az işi
   ve en az gizli bilgiyi gerektirir.

## 3. App Store Connect'te uygulama kaydı

<https://appstoreconnect.apple.com> → *Apps* → **+** → *New App*:
platform iOS, ana dil Türkçe, 2. adımdaki paket kimliği, SKU (ör.
`sozcuk-merdiveni`), mağazadaki ad. Mağaza adı başkası tarafından alınmışsa
Apple reddeder; başka ad gerekir.

## 4. App Store Connect API anahtarı

1. App Store Connect → *Users and Access* → *Integrations* → *App Store
   Connect API* → *Team Keys* → **+**.
2. Erişim rolü: **Admin**. İlk TestFlight çalıştırmasında (13 Kasım 2026, #3) App Manager
   geliştirme imzası için yetti ama bulutta dağıtım imzası için yetmedi; Admin ile derleme
   yüklendi (Xcode 26.6, `macos-26`).
3. `.p8` dosyasını indirin (**yalnızca bir kez indirilebilir**), **Key ID** ve
   sayfanın üstündeki **Issuer ID**'yi not edin.

Bu anahtar hesabınız adına işlem yapabilir. Kimseyle paylaşmayın, sohbete ya
da depoya yapıştırmayın; yalnızca 5. adımdaki yere girin.

## 5. GitHub: korumalı ortam ve gizli bilgiler

Gizli bilgiler depoya değil, yalnızca `main` dalından çalışabilen bir
**ortama** konur. Depo düzeyindeki bir gizli bilgiyi, depoya dal açabilen
herkesin iş akışı okuyabilir (başka bir dala konan tek satırlık bir iş akışı
yeter, birleştirme gerekmez). Ortamın dal kuralı bunu engeller.

1. iOS deposunda *Settings* → *Environments* → *New environment* → ad:
   `testflight` (tam olarak bu).
2. **Deployment branches and tags** → *Selected branches and tags* → yalnızca
   `main` ekleyin. **Zorunlu**: bu olmadan ortam koruma sağlamaz.
3. Aynı sayfada *Environment secrets* → *Add secret* ile dördünü ekleyin:

   | Ad | Değer |
   |---|---|
   | `ASC_KEY_ID` | Anahtarın Key ID'si |
   | `ASC_ISSUER_ID` | Issuer ID |
   | `ASC_KEY_P8` | `.p8` dosyasının **tüm içeriği** (`-----BEGIN PRIVATE KEY-----` satırları dahil) |
   | `APPLE_TEAM_ID` | 1. adımdaki Team ID |

4. *Settings* → *Secrets and variables* → *Actions* altında **depo düzeyinde**
   aynı adlarla gizli bilgi varsa silin.
5. İsteğe bağlı: **Required reviewers** → kendinizi ekleyin. Artısı: her
   derleme sizin onayınızı bekler, gözden kaçan bir değişiklik anahtarı
   kullanamaz. Eksisi: her derlemede GitHub'a girip onaylamanız gerekir.

- Ortamı ve dal kuralını iş akışını **ilk kez çalıştırmadan önce** kurun.
  Ortam yoksa GitHub onu ilk çalıştırmada korumasız olarak kendisi oluşturur.
- **iOS deposu herkese açık (public).** Ortamın dal kuralı herkese açık depoda
  ücretsizdir. Bu yüzden gizli bilgiyi **hiçbir dosyaya ve depo düzeyindeki
  gizli bilgiye yazmayın**; yalnızca `testflight` ortamına koyun.

## 6. İş akışını çalıştırın

*Actions* → **TestFlight** → *Run workflow*.

- GitHub'ın macOS makineleri herkese açık depolarda ücretsizdir. Bir derleme
  yaklaşık 10–20 dakika sürer (tahmin).
- **Bu iş akışı daha önce hiç çalıştırılmadı.** İlk denemede hata verirse
  çıktıyı takıma iletin (gizli bilgiler GitHub tarafından gizlenir); büyük
  olasılıkla koşucu adı, Xcode sürümü ya da imzalama bayrağı düzeltilecektir.

## 7. TestFlight'ta deneyin

1. Yükleme bittikten birkaç dakika sonra derleme App Store Connect →
   uygulamanız → *TestFlight* sekmesinde görünür ("Processing" bitince).
2. *Internal Testing* → grup oluşturun, kendinizi ekleyin (iç test Apple
   incelemesi gerektirmez).
3. iPhone'unuza **TestFlight** uygulamasını kurun, davet e-postasındaki
   bağlantıdan uygulamayı yükleyin.
4. Şunlara bakın ve sonucu takıma yazın:
   - Oyun açılıyor mu, günün bulmacası sitedekiyle aynı mı?
   - Uçak kipinde açılıyor mu?
   - Üstte saat/pil yazıları okunuyor mu? Ses ve ↻ düğmeleri çentiğin ya da
     Dynamic Island'ın altında kalıyor mu? Açılışta ekranın altında boş ya da
     kesik bir şerit var mı?
   - Yanlış kelimede ve çözümde titreşim var mı?
   - "Sonucu paylaş" iOS paylaşım sayfasını açıyor mu; metindeki adres site mi?
   - Sayfanın altındaki *Gizlilik Politikası*, *Lisanslar* ve e-posta
     bağlantısı çalışıyor mu?
   - Ana ekranda ad nasıl görünüyor?
   - Reklam (9. bölüm yapıldıysa): açılışta izleme (ATT) penceresi çıkıyor mu; reddedince
     de reklam geliyor mu; ipucu/tekrar için ödüllü reklam açılıp kapanınca ödül veriyor mu
     (erken kapatınca vermemeli); çözümden sonra ikinci/üçüncü bulmacada geçiş reklamı
     geliyor mu (ilkinde gelmemeli). Plus ilk sürümde yok (sonraki sürümde; o zaman
     Sandbox hesabıyla satın alma ve geri yükleme de denenir); ekranda Plus'a değinen bir şey çıkmamalı.

## 8. Mağazaya göndermeden önce (bu iskelette yok)

Gönderimi yalnızca siz yaparsınız. App Store Connect'te doldurulacaklar ve
kararlar (alan adları Apple'ın İngilizce arayüzündeki gibidir; yerleri
değişmiş olabilir):

- **Privacy Policy URL** (zorunlu, herkese açık web sayfası):
  `https://xn--szckyolu-n4a6d.com/gizlilik`. Sitedeki sayfa (sitede analitik yok;
  yalnızca Cloudflare'in güvenlik çerezi var) ve "iOS uygulaması" bölümünü içerir; ayrı uygulama sayfası yoktur.
  Veri sorumlusu kişi adıyla değil "Sözcük Yolu (sözcükyolu.com)" olarak
  yazılıdır; veri sorumlusu adı artık gerekmez (alp-efes/sozcuk-merdiveni#9).
  Uygulamanın içindeki metin `web/gizlilik.html`'dir (AdMob, ATT/UMP ve saklanan kayıtlar; Plus ilk sürümde yok, metinde geçmez
  eklendi; sitedeki sayfa da aynı dilde güncellenmeli, hukuk-uyum bakacak). E-postaların saklama
  süresi ("yazışma bitince en geç 1 yıl"), yürürlük tarihi, hukuki sebep
  (KVKK m.5/2-f, meşru menfaat) ve alıcılar (Cloudflare Email Routing, Cloudflare, Inc., ABD ve
  e-postanın iletildiği posta hizmeti sağlayıcısı; yurt dışında olabilir) sizin
  onayınızı bekliyor. AB'de yayına karar verirseniz (aşağıdaki DSA) metin
  gözden geçirilmeli.
- **App Privacy (gizlilik etiketi):** artık "Data Not Collected" **değil**. Reklam (Google AdMob)
  veri topluyor; doldurulacak cevaplar aşağıda **9.6**'da.
- **Support URL** ve **Marketing URL:** ikisi de siteye: `https://xn--szckyolu-n4a6d.com/`
  (ana sayfa; iletişim adresi sayfanın altında). AdMob'un `app-ads.txt` denetimi bu alan adına bakar (9.7).
- **Copyright:** hakların sahibi ve yılı, ör. `2026 Ad Soyad` ya da şirket adı.
- **Content Rights:** "uygulama üçüncü taraf içerik içeriyor mu?" sorusuna
  **Evet**: sözlük Zemberek-NLP'den (Apache 2.0) üretildi. Lisans bunu
  kullanmaya izin veriyor; gereken bildirimler uygulamanın *Lisanslar*
  sayfasında.
- **Age Rating:** **4+** hedeflenir (reklamlar G sınıfıyla sınırlı: `maxAdContentRating`).
  Uygulamada şiddet, kumar, korku, kullanıcı içeriği, mesajlaşma ve uygulama içi
  tarayıcı yok → "Yok/Hayır". **Reklam artık var:** anketteki reklam/"Advertising"
  sorusuna **Evet** denir (soru metni ve etkisi **doğrulanmadı**; Apple'ın güncel anketi
  reklam için ayrı bir soru ya da yaş sınıfı etkisi getirmiş olabilir. Çıkan sınıf 4+
  değilse 9+ kabul edilebilir; kararı siz verin). İlk sürümde uygulama içi satın alma/harcama YOK (In-App Purchases, harcama
  sorularına Hayır); "Loot boxes / simulated gambling" sorularına da Hayır. Apple 2025'te anketi ve yaş
  sınıflarını yeniledi; güncel soru metinleri **doğrulanmadı**, soruları
  okuyarak yanıtlayın. **Kids kategorisini seçmeyin:** o kategori dışarıya
  giden bağlantılar (e-posta bağlantısı gibi) için ebeveyn kapısı ister,
  uygulamada yok.
- **Kullanılabilirlik (Pricing and Availability):** ilk sürümde **AB ülkeleri
  hariç bütün ülkeler** seçilir. Neden: AB'deki App Store'da yayın için hesap
  düzeyinde **DSA "trader" beyanı** gerekir (App Store Connect → *Business*;
  menü yeri doğrulanmadı); *trader* beyanında adres, telefon ve e-postanız
  Apple'ca doğrulanır ve AB ürün sayfasında herkese görünür. AB, sonradan
  açabileceğiniz bir kapıdır: açarken beyanı yapmanız ve gizlilik metnini
  gözden geçirmeniz gerekir. Reklam gibi ticari bir amaç varsa "trader değilim"
  beyanı uygun olmayabilir (hukuki değerlendirme).
- **Reklam:** sahip kararıyla (14 Kasım 2026) ilk sürüm reklamla (AdMob) çıkar; ipucu/geri al hakkı
  ve günlük tekrar ödüllü reklamla verilir. Plus sonraki sürümde. Kurulum ve sıralama **9. bölümde**; TestFlight
  derlemesinden önce yapılması gerekenler orada işaretli.
- **Ekran görüntüleri:** site deposunda `tools/uygulama/magaza/` (tasarım
  takımı). Mağazaya gidecek sürümü, yazı tipleri iPhone'dakiyle aynı çıksın
  diye macOS'ta üretmek gerekiyor (`tools/magaza_gorsel.js`).
- Açıklama, anahtar kelimeler, kategori (ör. *Games → Word*).
- **Risk — Yönerge 4.2 (asgari işlev):** Apple, bir web sitesini sarmaktan
  ibaret uygulamaları reddedebilir. Uygulama içeriği paketten yükler,
  çevrimdışı çalışır ve yerel titreşim/paylaşım kullanır; bu riski azaltır ama
  kaldırmaz. Reddedilirse seçenekler takımla konuşulur (ör. widget, bildirim —
  bunlar izin ve onay ister).
- **Cayma hakkı (Türkiye, mesafeli satış): avukat sorusu AÇIK.** **İlk sürümde Plus yok (sonraki sürümde; o zaman açılacak).** Plus uygulama içinde satılacak;
  anında teslim edilen dijital içerikte cayma hakkının nasıl ele alınacağı ve satıcının kim
  göründüğü (Apple mı siz mi; Apple'ın komisyoncu rolü) avukata sorulacak. Site, satın alma
  kutusunda şimdilik tarafsız bir cümle kullanır: "Satın alma Apple üzerinden yapılır; iade ve
  cayma koşulları App Store kurallarına tabidir." Avukat başka bir metin isterse site ekibine verilir
  (satın alma kutusu sitedeki oyun kodundadır).
- **Şifreleme beyanı:** `ITSAppUsesNonExemptEncryption = NO` ayarlı; uygulama
  şifreleme kullanmıyor, ek soru çıkmamalı.

## 9. Gelir: AdMob reklamı ve Plus (sahip kararı, 13 Kasım 2026)

> **14 Kasım 2026 kararı: ilk App Store sürümü Plus olmadan çıkar.** `web/yerel.js` → `PLUS_ACIK = false`
> Plus'ı arayüzden ve gizlilik metninden kaldırır; Plus sonraki sürümde, değişmiş kurallarla açılır.
> Aşağıdaki Plus adımları (9.4, 9.5) o zamana kadar gerekmez. AdMob onaylanana dek reklam
> gelmeyebilir: ödüllü reklam yüklenemez ya da gösterilemezse +1 hak verilir (yarıda kapatılan reklam
> vermez). AdMob onaylanınca `web/yerel.js` → `REKLAM_YOKSA_ODUL = false` yapılır (tek satır, yeni sürüm).

Uygulama reklam gösterir (ödüllü: ipucu/geri al/tekrar; geçiş: çözümden sonra), tek seferlik **Plus**
satar (reklamsız; sınırsız ipucu, geri al ve günlük tekrar). Kod hazır ve **Google'ın test kimlikleriyle** çalışıyor;
gerçek para için aşağıdakiler gerekir. **9.1 ve 9.2 yapıldı** (13 Kasım 2026): `gelir.json` gerçek
AdMob kimliklerini taşır; PR denetimi (`test.yml`) ve TestFlight iş akışı bunu her seferinde
denetler. **Engeller** her adımın yanında yazılı.

| # | Adım | Neyi engeller |
|---|---|---|
| 9.1 | AdMob hesabı + uygulama + iki reklam birimi | **TestFlight derlemesini** (iş akışı test kimliğiyle durur) ve her reklam gelirini |
| 9.2 | Kimlikleri `gelir.json`'a yazdırma | 9.1 ile aynı |
| 9.3 | AdMob'da Avrupa düzenlemeleri mesajını yayınlama | Birleşik Krallık/İsviçre'de reklam gösterimini |
| 9.4 | Paid Applications Agreement (banka + vergi) | **İlk sürümde gerekmez** (Plus sonraki sürümde, 14 Kasım 2026 kararı). Plus'ın TestFlight/Sandbox'ta yüklenmesini ve App Store yayınını |
| 9.5 | App Store Connect'te Plus ürünü | **İlk sürümde gerekmez** (Plus sonraki sürümde). Plus'ı denemeyi ve mağaza gönderimini |
| 9.6 | App Privacy etiketi | App Store gönderimini (iç TestFlight'ı değil) |
| 9.7 | `app-ads.txt` (siteye) | AdMob'un reklam doluluğunu ve gelirini (yayından sonra, haftalar içinde) |
| 9.8 | iPhone'unuzu AdMob test cihazı yapın | Canlı reklam birimlerinde geçersiz trafik (hesap cezası) riskini; **TestFlight denemesinden önce** |

### 9.1 AdMob hesabı ve birimler — [ÜCRETSİZ]

1. <https://admob.google.com> → Google hesabınızla hesap açın (ülke, saat dilimi, para birimi).
2. *Apps* → *Add app* → iOS → "Evet, mağazada yayında" demeyin (henüz değil) → ad
   "Sözcük Merdiveni". Verilen **App ID** (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`) not edilir.
3. Uygulamaya iki **reklam birimi** ekleyin: **Rewarded** (ad: `odullu`) ve **Interstitial**
   (ad: `gecis`). Birim kimlikleri `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ` biçimindedir.
   Banner eklemeyin (kullanılmıyor).
4. Ödüllü birimde ödül: ne olursa (1 / "ipucu"); kodda kullanılmıyor, ödül olayı yeter.
5. *Blocking controls* → reklam içeriği filtrelerini isteğe göre daraltın. Kod zaten genel kitleye
   uygun (G) reklam ister.
6. Ödeme için *Payments* → adres doğrulama (posta ile PIN gelebilir), vergi bilgisi, ödeme
   profili. Bu adım gelirin size ulaşmasını belirler; kod ya da TestFlight'ı engellemez.

### 9.2 Kimlikleri koda aktarma

Üç kimliği ve App ID'yi takıma verin (ya da kendiniz `gelir.json`'u düzenleyin):

```json
{
  "admobAppId": "ca-app-pub-…~…",
  "oduluId": "ca-app-pub-…/…",
  "gecisId": "ca-app-pub-…/…"
}
```

Plus ürün kimliği (`com.sozcukyolu.sozcukmerdiveni.plus`) bu dosyada değil, yerel kodda
(`SatinAlma.swift`) sabittir; web görünümü hangi ürünün sorgulanacağını belirleyemez.

Sonra `npm run ios:ayarla` (App ID'yi `Info.plist`'e yazar) ve `npm test`. Bunlar gizli
bilgi değildir; depoda durur. **Güvence:** TestFlight iş akışı arşivden önce
`araclar/yayin-denetle.mjs` çalıştırır; `gelir.json`, `Info.plist` ya da paketlenen `yerel.js`
Google'ın test kimliğini (`ca-app-pub-3940256099942544`) içeriyorsa derleme durur. Bu yüzden
**gerçek kimlikler olmadan TestFlight derlemesi çıkmaz** (istenen davranış: TestFlight'a giden
derleme mağazaya gider). Simülatör ve PR testleri test kimlikleriyle geçer.

### 9.3 Avrupa düzenlemeleri mesajı (UMP) — [ÜCRETSİZ]

AdMob → *Privacy & messaging* → *European regulations* → mesaj oluşturun, uygulamayı seçin,
**yayınlayın**. Mesaj yoksa AEA/Birleşik Krallık/İsviçre'deki kullanıcılar için onay
penceresi çıkmaz ve bu bölgelerde reklam gösterilmez (uygulama yine çalışır). Uygulama AB
mağazalarında yayınlanmasa da Birleşik Krallık ve İsviçre için gerekir. İsterseniz *IDFA
explainer* mesajını **açmayın**: kod ATT penceresini kendisi gösterir.

### 9.4 Paid Applications Agreement — [BANKA/VERGİ]

App Store Connect → *Business* (eski adıyla *Agreements, Tax, and Banking*) → **Paid
Applications** sözleşmesini kabul edin; banka hesabı ve vergi formlarını doldurun. Apple
doğrulayana dek (günler sürebilir) uygulama içi satın alma ürünleri yüklenmeyebilir
(**doğrulanmadı**; yaygın bildirilen davranış).

### 9.5 Plus ürünü (App Store Connect)

Uygulama → *Monetization* → *In-App Purchases* → **+**:

| Alan | Değer |
|---|---|
| Tür | **Non-Consumable** (tüketilmeyen) |
| Reference Name | `Plus` |
| Product ID | `com.sozcukyolu.sozcukmerdiveni.plus` (**tam olarak**; kodda ve `gelir.json`'da böyle) |
| Fiyat (öneri) | **99,99 TL** düzeyinde bir fiyat basamağı (~3 USD). Apple diğer ülkeleri çevirir; kodda sabit fiyat yok, StoreKit'in `displayPrice`'ı gösterilir |
| Kullanılabilirlik | Uygulamayla aynı ülkeler (AB hariç) |
| Aile Paylaşımı | Kapalı (öneri) |
| Görünen ad (Türkçe) | `Sözcük Merdiveni Plus` |
| Açıklama (Türkçe) | `Reklamları kaldırır; sınırsız ipucu, geri al ve tekrar` |
| İnceleme ekran görüntüsü | Oyundaki Plus kutusunun ekran görüntüsü (zorunlu; TestFlight/simülatörden) |
| İnceleme notu | "Plus, reklamları kaldıran ve ipucu, geri al ve tekrarı sınırsızlaştıran tek seferlik satın alımdır. Satın alma Apple hesabıyla, geri yükleme oyundaki 'satın alımı geri yükle' düğmesiyle yapılır." |

Ürünü **sürümle birlikte incelemeye gönderin** (ilk IAP uygulamanın sürümüne eklenir).
TestFlight'ta denemek için *Users and Access* → *Sandbox* altında bir **Sandbox test hesabı**
açın. Xcode kullanan biri için `ios/App/Plus.storekit` simülatörde ürünü Apple olmadan
sunar (Scheme → Run → Options → StoreKit Configuration; **doğrulanmadı**).

### 9.6 App Privacy etiketi (taslak cevaplar)

App Store Connect → uygulama → *App Privacy*. "Do you or your third-party partners collect
data from this app?" → **Yes**. Kaynak: Google'ın AdMob veri açıklaması ve SDK 13.11.0'ın
kendi gizlilik bildirimi (içeriği `ios/App/App/PrivacyInfo.xcprivacy` ile aynı). Üçüncü taraf
(Google) veriyi kendi amacıyla topladığı için bunlar sizin beyanınızdır. Apple'ın ekranları
farklıysa eşdeğer olanı seçin.

| Veri türü (Apple) | Toplanıyor | Kullanıcıya bağlı | İzleme (tracking) | Amaç |
|---|---|---|---|---|
| Identifiers → **Device ID** | Evet | Evet | **Evet** | Third-Party Advertising, Analytics, Developer's Advertising |
| Usage Data → **Advertising Data** | Evet | Evet | Hayır | Third-Party Advertising, Developer's Advertising, Analytics |
| Usage Data → **Product Interaction** | Evet | Evet | Hayır | Analytics, Developer's Advertising, Third-Party Advertising |
| Location → **Coarse Location** | Evet | Evet | Hayır | Third-Party Advertising, Analytics, Developer's Advertising |
| Diagnostics → **Crash Data** | Evet | Hayır | Hayır | Analytics |
| Diagnostics → **Performance Data** | Evet | Hayır | Hayır | Third-Party Advertising, Developer's Advertising, Analytics |
| Diagnostics → **Other Diagnostic Data** | Evet | Hayır | Hayır | Third-Party Advertising, Developer's Advertising, Analytics |

- **Purchases:** işaretlemeyin. Satın almayı Apple işler; Sözcük Yolu satın alma geçmişini
  toplamaz ve sunucusu yoktur (**doğrulanmadı**: Apple'ın "Purchases" tanımı yalnızca
  geliştiricinin topladığı alım verisini kapsıyor gibi görünüyor).
- **Tracking:** "Does this app use data for tracking?" → **Yes** (ATT penceresi bu yüzden var).
- Contact Info, Health, Financial, Contacts, User Content, Browsing/Search History, Sensitive Info:
  **toplanmıyor**.
- Google bu listeyi SDK sürümüne göre günceller; SDK güncellenirken (`@capacitor-community/admob`)
  etiket yeniden karşılaştırılır.

### 9.7 `app-ads.txt` — [ÜCRETSİZ]

AdMob gerçek yayıncı kimliğinizi (`pub-XXXXXXXXXXXXXXXX`, App ID'deki 16 hane) verince sitenin
**kök dizinine** `app-ads.txt` eklenmeli (site deposu; site ekibi kimlik gelince ekler):

```
google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

Dosya `https://xn--szckyolu-n4a6d.com/app-ads.txt` adresinde açılmalı ve App Store'daki
Marketing/Support URL'si aynı alan adında olmalı (yukarıda). AdMob hesabında *Apps* → uygulama →
*app-ads.txt* durumu "doğrulandı" olana dek (günler sürebilir) doluluk düşük kalabilir.

### 9.8 AdMob test cihazı — [ÜCRETSİZ, TestFlight'tan ÖNCE]

Gerçek reklam birimlerine kendi cihazınızdan tıklamak ya da çok izlemek **geçersiz trafik**
sayılır ve hesabı kapatabilir. TestFlight'ta denemeden önce iPhone'unuzu test cihazı yapın:
AdMob → *Settings* → *Test devices* → *Add test device* → cihazın reklam kimliği (IDFA) ya da
ilk reklam isteğinin Xcode/konsol günlüğündeki test cihazı kimliği. TestFlight kurulumunda
konsol günlüğü olmadığından en kolayı: iPhone'da *Ayarlar → Gizlilik ve Güvenlik → İzleme* açıkken
bir IDFA gösteren uygulamayla kimliği öğrenip eklemek (**doğrulanmadı**; yöntem Google'ın
"Enable test devices" sayfasında anlatılır). Kendi reklamlarınıza hiçbir koşulda tıklamayın;
tıklama teşviki kodda ve metinlerde yoktur.
