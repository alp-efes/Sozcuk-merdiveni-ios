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
2. Erişim rolü: önce en dar olan **App Manager**'ı deneyin.
   Derleme sırasında Xcode bu anahtarla geliştirme sertifikası, profil ve
   bulutta tutulan dağıtım sertifikası kullanır. Apple'ın belgelerine göre
   bulut dağıtım sertifikası *Account Holder*/*Admin* rolünü ya da ayrıca
   verilen bir erişimi ister; bunun API anahtarlarında App Manager ile yetip
   yetmediği **doğrulanmadı**. İlk derleme imzalamada yetki/izin hatası
   verirse anahtarı iptal edip **Admin** rolüyle yeniden oluşturun ve 5.
   adımdaki değerleri güncelleyin.
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

## 8. Mağazaya göndermeden önce (bu iskelette yok)

Gönderimi yalnızca siz yaparsınız. App Store Connect'te doldurulacaklar ve
kararlar (alan adları Apple'ın İngilizce arayüzündeki gibidir; yerleri
değişmiş olabilir):

- **Privacy Policy URL** (zorunlu, herkese açık web sayfası):
  `https://xn--szckyolu-n4a6d.com/gizlilik`. Sitedeki sayfa (sitede analitik yok;
  yalnızca Cloudflare'in güvenlik çerezi var) ve "iOS uygulaması" bölümünü içerir; ayrı uygulama sayfası yoktur.
  Veri sorumlusu kişi adıyla değil "Sözcük Yolu (sözcükyolu.com)" olarak
  yazılıdır; veri sorumlusu adı artık gerekmez (alp-efes/sozcuk-merdiveni#9).
  Uygulamanın içindeki metin `web/gizlilik.html`'dir. E-postaların saklama
  süresi ("yazışma bitince en geç 1 yıl"), yürürlük tarihi, hukuki sebep
  (KVKK m.5/2-f, meşru menfaat) ve alıcılar (Cloudflare Email Routing, Cloudflare, Inc., ABD ve
  e-postanın iletildiği posta hizmeti sağlayıcısı; yurt dışında olabilir) sizin
  onayınızı bekliyor. AB'de yayına karar verirseniz (aşağıdaki DSA) metin
  gözden geçirilmeli.
- **App Privacy (gizlilik etiketi):** uygulama bugünkü haliyle veri toplamıyor
  → "Data Not Collected". Reklam ya da analitik eklenirse bu beyan değişir.
- **Support URL:** `https://xn--szckyolu-n4a6d.com/` (sitenin ana sayfası;
  iletişim adresi sayfanın altında).
- **Copyright:** hakların sahibi ve yılı, ör. `2026 Ad Soyad` ya da şirket adı.
- **Content Rights:** "uygulama üçüncü taraf içerik içeriyor mu?" sorusuna
  **Evet**: sözlük Zemberek-NLP'den (Apache 2.0) üretildi. Lisans bunu
  kullanmaya izin veriyor; gereken bildirimler uygulamanın *Lisanslar*
  sayfasında.
- **Age Rating:** **4+** önerilir. Uygulamada şiddet, kumar, korku, kullanıcı
  içeriği, mesajlaşma, reklam ve uygulama içi tarayıcı yok; anketteki
  sorulara buna göre "Yok/Hayır" denir. Apple 2025'te anketi ve yaş
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
- **Reklam:** 1.0 reklamsız çıkar. AdMob ileride, AdMob hesabınızı
  açtıktan sonraki bir sürümde gelecek; o zaman AEA, Birleşik Krallık ve İsviçre için Google onaylı bir CMP
  gerekir, gizlilik etiketi ve sayfası güncellenir.
- **Ekran görüntüleri:** site deposunda `tools/uygulama/magaza/` (tasarım
  takımı). Mağazaya gidecek sürümü, yazı tipleri iPhone'dakiyle aynı çıksın
  diye macOS'ta üretmek gerekiyor (`tools/magaza_gorsel.js`).
- Açıklama, anahtar kelimeler, kategori (ör. *Games → Word*).
- **Risk — Yönerge 4.2 (asgari işlev):** Apple, bir web sitesini sarmaktan
  ibaret uygulamaları reddedebilir. Uygulama içeriği paketten yükler,
  çevrimdışı çalışır ve yerel titreşim/paylaşım kullanır; bu riski azaltır ama
  kaldırmaz. Reddedilirse seçenekler takımla konuşulur (ör. widget, bildirim —
  bunlar izin ve onay ister).
- **Şifreleme beyanı:** `ITSAppUsesNonExemptEncryption = NO` ayarlı; uygulama
  şifreleme kullanmıyor, ek soru çıkmamalı.
