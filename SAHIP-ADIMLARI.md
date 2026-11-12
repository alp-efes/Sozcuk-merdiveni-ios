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
| Paket kimliği (bundle ID) | `com.sozcukyolu.app` | `capacitor.config.json` → `appId` |
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

## 2. Paket kimliğini kaydedin

<https://developer.apple.com/account/resources/identifiers/list> → **+** →
*App IDs* → *App* → Bundle ID: *Explicit*, `com.sozcukyolu.app` (ya da
seçtiğiniz). Ek yetenek (capability) işaretlemeyin: uygulama hiçbirini kullanmıyor.

## 3. App Store Connect'te uygulama kaydı

<https://appstoreconnect.apple.com> → *Apps* → **+** → *New App*:
platform iOS, ana dil Türkçe, 2. adımdaki paket kimliği, SKU (ör.
`sozcuk-merdiveni`), mağazadaki ad. Mağaza adı başkası tarafından alınmışsa
Apple reddeder; başka ad gerekir.

## 4. App Store Connect API anahtarı

1. App Store Connect → *Users and Access* → *Integrations* → *App Store
   Connect API* → *Team Keys* → **+**.
2. Erişim rolü: **Admin**. (Otomatik imzalamanın dağıtım sertifikası
   oluşturabilmesi için gerektiği biliniyor; daha dar bir rolün (*App
   Manager*) yetip yetmediği doğrulanmadı.)
3. `.p8` dosyasını indirin (**yalnızca bir kez indirilebilir**), **Key ID** ve
   sayfanın üstündeki **Issuer ID**'yi not edin.

Bu anahtar hesabınız adına işlem yapabilir. Kimseyle paylaşmayın, sohbete ya
da depoya yapıştırmayın; yalnızca 5. adımdaki yere girin.

## 5. GitHub Secrets

iOS deposunda *Settings* → *Secrets and variables* → *Actions* → *New
repository secret*:

| Ad | Değer |
|---|---|
| `ASC_KEY_ID` | Anahtarın Key ID'si |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | `.p8` dosyasının **tüm içeriği** (`-----BEGIN PRIVATE KEY-----` satırları dahil) |
| `APPLE_TEAM_ID` | 1. adımdaki Team ID |

## 6. İş akışını çalıştırın — [ÜCRETLİ OLABİLİR]

*Actions* → **TestFlight** → *Run workflow*.

- GitHub'ın macOS makineleri herkese açık depolarda ücretsizdir. **Özel
  depoda** dakikalar ücretsiz kotadan katlanarak düşer ve kota aşılırsa
  ücretlendirilir (güncel oranı GitHub'ın faturalandırma sayfasında görün;
  doğrulanmadı). Bir derleme yaklaşık 10–20 dakika sürer (tahmin).
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
   - Üstte saat/pil yazıları okunuyor mu, içerik çentiğin altına giriyor mu?
   - Yanlış kelimede ve çözümde titreşim var mı?
   - "Sonucu paylaş" iOS paylaşım sayfasını açıyor mu; metindeki adres site mi?
   - Sayfanın altındaki *Gizlilik Politikası* ve e-posta bağlantısı çalışıyor mu?
   - Ana ekranda ad nasıl görünüyor?

## 8. Mağazaya göndermeden önce (bu iskelette yok)

Gönderimi yalnızca siz yaparsınız. Hazırlanması gerekenler:

- **Gizlilik politikası adresi** (zorunlu, herkese açık web sayfası). Sitedeki
  `gizlilik.html` reklam ve çerezleri anlatır; uygulama için ayrı bir bölüm ya
  da sayfa gerekir. Uygulamanın içindeki metin: `web/gizlilik.html` — taslaktır,
  onaylamanız gerekir.
- **Gizlilik etiketi:** uygulama bugünkü haliyle veri toplamıyor ("Data Not
  Collected"). Reklam ya da analitik eklenirse bu beyan değişir.
- Yaş sınıflandırması anketi, ekran görüntüleri, açıklama, destek adresi.
- **Risk — Yönerge 4.2 (asgari işlev):** Apple, bir web sitesini sarmaktan
  ibaret uygulamaları reddedebilir. Uygulama içeriği paketten yükler,
  çevrimdışı çalışır ve yerel titreşim/paylaşım kullanır; bu riski azaltır ama
  kaldırmaz. Reddedilirse seçenekler takımla konuşulur (ör. widget, bildirim —
  bunlar izin ve onay ister).
- **Şifreleme beyanı:** `ITSAppUsesNonExemptEncryption = NO` ayarlı; uygulama
  şifreleme kullanmıyor, ek soru çıkmamalı.
