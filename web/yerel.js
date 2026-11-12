"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — yerel bağlantılar
 * ---------------------------------------------------------
 * Site app.js'i değiştirilmeden paketlenir; yerel özellikler ona buradan
 * bağlanır. Bağlanılan her nokta testler/ içinde korunur: site değişirse
 * test kırılır, uygulama sessizce özellik kaybetmez.
 *
 * Capacitor yokken (tarayıcıda) hiçbir şey yapmaz.
 * İzin isteyen hiçbir şey kullanılmaz (titreşim ve paylaşım izin istemez).
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
})();
