"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — yerel bağlantılar
 * ---------------------------------------------------------
 * Site app.js'i değiştirilmeden paketlenir; yerel özellikler ona buradan
 * bağlanır. Bağlanılan her nokta testler/ içinde korunur: site değişirse
 * test kırılır, uygulama sessizce özellik kaybetmez.
 *
 * Capacitor yokken (tarayıcıda) hiçbir şey yapmaz.
 * Gelir kancası (window.SozcukGelir) oyuna reklam, Plus ve izin akışını verir;
 * ayrıntı aşağıda. Reklamlar ve satın alma yerel tarafta çalışır, web görünümüne
 * hiçbir şey yüklenmez (CSP değişmez). Tek izin istemi: App Tracking Transparency.
 * ========================================================= */
(() => {
  const eklenti = window.Capacitor?.Plugins;
  if (!eklenti || !window.Capacitor.isNativePlatform?.()) return;
  if (typeof WordLadder === "undefined") return;   // app.js yüklenmediyse bağlanacak bir şey yok

  // Paylaşılan sonuçtaki adres: uygulamada location "capacitor://localhost"
  // olduğu için sitenin adresi yazılır. Makine alanı olduğundan punycode.
  const SITE = "https://xn--szckyolu-n4a6d.com/";

  // Titreşim başarısız olursa (eski cihaz, eklenti yok) oyun etkilenmesin
  const titret = (type) => {
    try { eklenti.Haptics?.notification({ type }).catch(() => {}); } catch (_) { /* yok say */ }
  };

  // app.js metodunu, önüne titreşim ekleyerek sarar
  const sar = (ad, type) => {
    const asil = WordLadder.prototype[ad];
    if (typeof asil !== "function") return;
    WordLadder.prototype[ad] = function (...arg) { titret(type); return asil.apply(this, arg); };
  };
  sar("reject", "ERROR");    // geçersiz hamle
  sar("win", "SUCCESS");     // bulmaca çözüldü

  // app.js share() dokunmatik cihazda navigator.share({ text }) çağırır.
  // WKWebView'de bu API her sürümde güvenilir olmadığından yerel paylaşım
  // sayfasına yönlendirilir. İptal edilince eklenti reddeder; app.js bunu yutar.
  if (eklenti.Share) {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: ({ text = "" } = {}) =>
        eklenti.Share.share({ text: text.replace(location.href.split(/[?#]/)[0], SITE) }),
    });
  }

  /* ---------- Gelir: reklam (AdMob), izin (UMP + ATT), Plus (StoreKit) ---------- */

  // Kimlikler gelir.json'dadır (tek yer); web-esitle.mjs yer tutucuyu doldurur
  const AYAR = /*GELIR_AYAR*/ null;
  const { AdMob, SatinAlma } = eklenti;
  const uyu = (ms) => new Promise((coz) => setTimeout(coz, ms));

  const GECIS_ARALIK_MS = 3 * 60 * 1000;   // iki geçiş reklamı arası en az 3 dk
  const PLUS_ANAHTAR = "sm_plus";          // Plus'ın yerel önbelleği; açılışta StoreKit yeniden doğrular

  // Simülatör ekran görüntüsü derlemesi (araclar/otomatik-oyna.js bayrağı koyar): sistem
  // pencereleri (ATT) ve reklamlar oynamayı bloklamasın diye reklam ve satın alma yok.
  const REKLAMSIZ_DERLEME = window.SM_OTOMATIK === true;

  // Plus ya da fiyat değişince sayfaya haber verilir; site bu olayı dinleyip Plus kutusunu
  // ve reklam durumunu yeniden çizer (uygulamayı yeniden açmak gerekmesin)
  const bildir = () => window.dispatchEvent(new Event("sozcukgelir"));

  let plus = false;
  try { plus = localStorage.getItem(PLUS_ANAHTAR) === "1"; } catch (_) { /* depolama yoksa Plus değil */ }
  const plusYaz = (deger) => {
    const eski = plus;
    plus = !!deger;
    try { plus ? localStorage.setItem(PLUS_ANAHTAR, "1") : localStorage.removeItem(PLUS_ANAHTAR); } catch (_) { /* yok say */ }
    if (plus !== eski) bildir();
  };

  // Plus'ın yerelleştirilmiş fiyatı (StoreKit displayPrice); yüklenene dek null. Elle yazılmaz.
  let fiyat = null;
  const fiyatYukle = () => SatinAlma.fiyat({ urun: AYAR.plusUrunId }).then((r) => {
    if (typeof r.fiyat === "string" && r.fiyat && r.fiyat !== fiyat) { fiyat = r.fiyat; bildir(); }
  }, () => {});

  // StoreKit'ten yeniden doğrula (iade, aile paylaşımı kaybı, başka cihazdaki alım). Hata olursa
  // önbellek kalır: çevrimdışı açılış Plus'ı silmez.
  const dogrula = () => SatinAlma.durum({ urun: AYAR.plusUrunId }).then((r) => plusYaz(r.plus), () => {});
  const dogrulama = REKLAMSIZ_DERLEME || !SatinAlma ? Promise.resolve() : dogrula();
  if (SatinAlma && !REKLAMSIZ_DERLEME) {
    // Uygulama dışında biten işlem (ebeveyn onayı, başka cihaz, iade): yerel taraf bildirir
    SatinAlma.addListener("plus", (r) => plusYaz(r.plus)).catch(() => {});
    // Çevrimdışı açılırsa bir kez daha dene
    fiyatYukle().then(() => fiyat || uyu(30000).then(fiyatYukle));
  }

  // UMP gerektiriyorsa kullanıcı onayını sonradan değiştirebilmeli: alt bilgiye bağlantı
  const tercihBaglantisiEkle = () => {
    const alt = document.querySelector(".site-footer");
    if (!alt) return;
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = "Reklam Tercihleri";
    a.addEventListener("click", (e) => { e.preventDefault(); AdMob.showPrivacyOptionsForm().catch(() => {}); });
    alt.append(a);
  };

  // Reklam önyükleme: gösterilmeden hazır tutulur; yüklenemezse sonraki istekte yeniden denenir
  const yuklu = { odul: false, gecis: false };
  const yukleniyor = {};
  const hazirla = (tur) => {
    if (yuklu[tur]) return Promise.resolve(true);
    yukleniyor[tur] ??= (tur === "odul"
      ? AdMob.prepareRewardVideoAd({ adId: AYAR.oduluId })
      : AdMob.prepareInterstitial({ adId: AYAR.gecisId }))
      .then(() => { yuklu[tur] = true; }, () => {})
      .then(() => { yukleniyor[tur] = null; return yuklu[tur]; });
    return yukleniyor[tur];
  };

  // Açılışta sırayla: UMP (AEA, Birleşik Krallık, İsviçre) → ATT → AdMob başlat. Çözümü
  // "reklam isteyebilir miyiz" (boolean). Plus sahibi reklam görmez, izin de sorulmaz.
  // ATT reddedilirse reklamlar kişiselleştirilmeden yine gösterilir (Google SDK kendisi
  // reklam kimliği olmadan istek yapar).
  let izinSozu = null;
  const reklamIzni = () => (izinSozu ??= dogrulama.then(async () => {
    if (plus || REKLAMSIZ_DERLEME || !AdMob) return false;
    try {
      let bilgi = await AdMob.requestConsentInfo();
      if (bilgi.isConsentFormAvailable && bilgi.status === "REQUIRED") bilgi = await AdMob.showConsentForm();
      if (!bilgi.canRequestAds) return false;
      if (bilgi.privacyOptionsRequirementStatus === "REQUIRED") tercihBaglantisiEkle();
      // Form kapanırken sistem istemi bazen yutulur; kısa bekleme
      await uyu(500);
      if ((await AdMob.trackingAuthorizationStatus()).status === "notDetermined") await AdMob.requestTrackingAuthorization();
      // 4+ App Store sınıfıyla uyumlu: yalnızca genel kitleye uygun (G) reklamlar. Çocuklara
      // yönelik uygulama değil (Kids kategorisi yok), bu yüzden child-directed işareti konmaz.
      await AdMob.initialize({ maxAdContentRating: "General" });
      hazirla("odul"); hazirla("gecis");   // ilk istekte beklemesinler
      return true;
    } catch (_) { return false; }   // çevrimdışı ya da form hatası: bu oturumda reklam yok
  }));
  if (!REKLAMSIZ_DERLEME) reklamIzni();

  const OLAY = {
    odul: { kapandi: "onRewardedVideoAdDismissed", hata: "onRewardedVideoAdFailedToShow", goster: () => AdMob.showRewardVideoAd() },
    gecis: { kapandi: "interstitialAdDismissed", hata: "interstitialAdFailedToShow", goster: () => AdMob.showInterstitial() },
  };

  // Hazır reklamı gösterir; reklam kapanınca çözülür. Ödüllü reklamda ödül kazanıldıysa true.
  // (Eklentinin showRewardVideoAd sözü yalnızca ödülde çözülür; erken kapanış ya da
  // gösterim hatası olaylardan anlaşılır. 3 dk güvenlik süresi oyunu kilitlemez.)
  let reklamAcik = false;   // tam ekran reklam şu an ekranda
  const goster = (tur) => new Promise((coz) => {
    let kazandi = false, bitti = false;
    reklamAcik = true;
    const tutamaclar = [];
    const dinle = (ad, f) => tutamaclar.push(AdMob.addListener(ad, f));
    const zamanasimi = setTimeout(() => bit(), 3 * 60 * 1000);
    function bit() {
      if (bitti) return;
      bitti = true;
      reklamAcik = false;
      clearTimeout(zamanasimi);
      tutamaclar.forEach((t) => t.then((h) => h.remove()).catch(() => {}));
      yuklu[tur] = false;
      hazirla(tur);                  // bir sonrakini şimdiden yükle
      coz(kazandi);
    }
    dinle(OLAY[tur].kapandi, bit);
    dinle(OLAY[tur].hata, bit);
    if (tur === "odul") dinle("onRewardedVideoAdReward", () => { kazandi = true; });
    OLAY[tur].goster().catch(bit);
  });

  // Oyunun çözüm penceresi (#modal) kapanana dek bekler: reklam kutlamanın üstüne binmesin,
  // yeni bulmaca başlarken ya da oyuncu kapatınca gelsin. En çok 2 dk.
  const cozumPenceresiKapansin = async () => {
    const pencere = document.getElementById("modal");
    for (let i = 0; i < 240 && pencere && !pencere.classList.contains("hidden"); i++) await uyu(500);
    return !pencere || pencere.classList.contains("hidden");
  };

  let cozumSayisi = 0, sonGecis = 0;
  const reklamlar = {
    plusFiyat: () => fiyat,   // string | null, eşzamanlı (önbellekten)
    plusMu: () => plus,   // DÜZ boolean, söz (Promise) değil: app.js !!plusMu() yazar, söz herkesi Plus yapardı

    async odulluReklam(_neden) {
      if (plus) return true;                                       // Plus: sınırsız ipucu/tekrar
      if (!(await reklamIzni())) return false;
      // Yüklenmesi uzun sürüyorsa oyuncuyu bekletme; yükleme arkada sürer
      if (!(await Promise.race([hazirla("odul"), uyu(8000).then(() => false)]))) return false;
      // Arka arkaya reklam yok: ödüllü reklam "son gösterilen reklam" sayılır; çözüm penceresinden
      // bekleyen geçiş reklamı (örn. "reklam izle, tekrar dene" sonrası) bu yüzden düşer
      sonGecis = Date.now();
      const kazandi = await goster("odul");
      sonGecis = Date.now();
      return kazandi;
    },

    // Çözümden sonra: oturumun ilk çözümünde yok, iki reklam arası en az 3 dk, hazır değilse yok
    async gecisReklami(an) {
      if (plus || an !== "cozum") return;
      if (++cozumSayisi < 2 || Date.now() - sonGecis < GECIS_ARALIK_MS) return;
      if (!(await reklamIzni())) return;
      if (!yuklu.gecis) { hazirla("gecis"); return; }              // bir sonrakine hazır olsun
      // Beklerken bir ödüllü reklam gösterildiyse (sonGecis yenilendi) ya da reklam ekrandaysa vazgeç
      if (!(await cozumPenceresiKapansin()) || reklamAcik || Date.now() - sonGecis < GECIS_ARALIK_MS) return;
      sonGecis = Date.now();
      await goster("gecis");
    },

    async plusSatinAl() {
      if (plus) return true;
      try {
        const r = await SatinAlma.satinAl({ urun: AYAR.plusUrunId });
        if (r.sonuc === "tamam") plusYaz(true);
      } catch (_) { /* iptal ya da hata: Plus değil */ }
      return plus;
    },

    async plusGeriYukle() {
      try { plusYaz((await SatinAlma.geriYukle({ urun: AYAR.plusUrunId })).plus); } catch (_) { /* yok say */ }
      return plus;
    },
  };

  // Simülatör: reklam ve satın alma yok; oyunun akışı bloklanmasın diye ödül hep verilir
  const kanca = REKLAMSIZ_DERLEME
    ? { plusMu: () => false, plusFiyat: () => null, odulluReklam: async () => true, gecisReklami: async () => {}, plusSatinAl: async () => false, plusGeriYukle: async () => false }
    : reklamlar;
  // Donuk ve değiştirilemez: sayfadaki başka bir betik kancayı (ör. plusMu'yu) değiştiremesin
  Object.defineProperty(window, "SozcukGelir", { value: Object.freeze(kanca), writable: false, configurable: false });
})();
