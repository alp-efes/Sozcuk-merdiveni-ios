/* Paketlenen www/ klasörünü iPhone boyutunda gerçek tarayıcıda oynar.
 * Capacitor köprüsü sahtedir: yerel.js'in doğru eklentiyi doğru anda çağırdığı
 * denetlenir; gerçek titreşim ve paylaşım sayfası ancak cihazda denenebilir.
 * Ekran görüntüsü için: EKRAN_DIZINI=/bir/yol npm test */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const WWW = resolve(dirname(fileURLToPath(import.meta.url)), "..", "www");
const OTOMATIK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "araclar", "otomatik-oyna.js");
const TUR = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2" };
const SITE_ADRESI = "https://xn--szckyolu-n4a6d.com/";
const TELEFON = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

let sunucu, tarayici, ADRES;

before(async () => {
  sunucu = createServer((istek, yanit) => {
    const yol = resolve(WWW, "." + decodeURIComponent(new URL(istek.url, "http://x").pathname).replace(/\/$/, "/index.html"));
    try {
      if (!yol.startsWith(WWW + sep)) throw new Error("dışarı çıkma");
      const govde = readFileSync(yol);
      yanit.writeHead(200, { "Content-Type": TUR[extname(yol)] || "application/octet-stream" }).end(govde);
    } catch (_) { yanit.writeHead(404).end(); }
  });
  await new Promise((coz) => sunucu.listen(0, "127.0.0.1", coz));
  ADRES = `http://127.0.0.1:${sunucu.address().port}/`;
  tarayici = await chromium.launch();
});
after(async () => { await tarayici?.close(); sunucu?.close(); });

// Sayfayı açar; hataları, uyarıları ve yapılan her isteği toplar
async function ac(baglam) {
  const kayit = { hatalar: [], uyarilar: [], disIstekler: [] };
  baglam.on("request", (i) => { if (!i.url().startsWith(ADRES)) kayit.disIstekler.push(i.url()); });
  const sayfa = await baglam.newPage();
  sayfa.on("pageerror", (e) => kayit.hatalar.push(e.message));
  // CSP ihlalleri konsola hata olarak düşer
  sayfa.on("console", (m) => {
    if (m.type() === "error") kayit.hatalar.push(m.text());
    if (m.type() === "warning") kayit.uyarilar.push(m.text());
  });
  await sayfa.goto(ADRES);
  await sayfa.waitForFunction(() => window.oyun?.db && window.oyun.startWord);
  return { sayfa, kayit };
}

// En kısa çözüm (başlangıç hariç, hedef dahil)
function enKisaYol(bas, hedef) {
  const kelimeler = JSON.parse(readFileSync(join(WWW, "words.json"), "utf8"))[String(bas.length)].words;
  const komsu = (a, b) => [...a].filter((h, i) => h !== b[i]).length === 1;
  const once = new Map([[bas, null]]);
  const kuyruk = [bas];
  for (let u; (u = kuyruk.shift()) && u !== hedef;) {
    for (const v of kelimeler) if (!once.has(v) && komsu(u, v)) { once.set(v, u); kuyruk.push(v); }
  }
  const yol = [];
  for (let k = hedef; k !== bas; k = once.get(k)) yol.unshift(k);
  return yol;
}

// Dokunmatikte cihaz klavyesi yok; oyuncu ekran klavyesine dokunur
const tus = (sayfa, ad) => sayfa.tap(`#keyboard .key[data-key="${ad}"]`);
async function yaz(sayfa, kelime) {
  for (const harf of kelime) await tus(sayfa, harf);
  await tus(sayfa, "ENTER");
}

test("uygulama: oyun oynanır, yerel özellikler bağlanır, dış istek yapılmaz", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  // Sahte Capacitor köprüsü: çağrıları kaydeder
  await baglam.addInitScript(() => {
    window.__cagri = [];
    const kaydet = (ad) => (arg) => { window.__cagri.push([ad, arg]); return Promise.resolve(); };
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Haptics: { notification: kaydet("titresim") }, Share: { share: kaydet("paylas") } },
    };
  });
  const { sayfa, kayit } = await ac(baglam);
  const cagrilar = (ad) => sayfa.evaluate((a) => window.__cagri.filter((c) => c[0] === a).map((c) => c[1]), ad);
  const goruntu = async (ad) => {
    if (process.env.EKRAN_DIZINI) await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, ad) });
  };

  assert.ok(!kayit.uyarilar.some((u) => u.includes("mock sözlük")), "words.json yüklenmedi");
  const d = await sayfa.evaluate(() => ({
    mod: oyun.mode, bas: oyun.startWord, hedef: oyun.targetWord,
    reklam: document.querySelectorAll(".ad-container, ins, iframe").length,
    izleme: typeof window.trackEvent, betikler: [...document.scripts].map((s) => s.getAttribute("src")),
    ekranKlavyesi: getComputedStyle(document.getElementById("keyboard")).display,
  }));
  assert.equal(d.mod, "daily");
  // Paketteki Fraunces yüklenmeli (CSP font-src)
  assert.ok(await sayfa.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes("Fraunces") && f.status === "loaded");
  }), "Fraunces yazı tipi yüklenmedi");
  assert.equal(d.reklam, 0, "reklam alanı kalmış");
  assert.equal(d.izleme, "undefined", "analitik köprüsü tanımlı");
  assert.deepEqual(d.betikler, ["app.js", "yerel.js"]);
  assert.notEqual(d.ekranKlavyesi, "none", "dokunmatikte ekran klavyesi görünmeli");
  await goruntu("1-acilis.png");

  // Geçersiz hamle: kelimeyi değiştirmeden gönder → reddedilir + hata titreşimi
  await yaz(sayfa, d.bas);
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1, "değişmeyen kelime kabul edildi");
  assert.ok(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")));
  assert.deepEqual(await cagrilar("titresim"), [{ type: "ERROR" }]);
  await goruntu("2-gecersiz-hamle.png");
  for (const _ of d.bas) await tus(sayfa, "BACK");   // reddedilen kelime satırda kalır

  // Çözüm
  const yol = enKisaYol(d.bas, d.hedef);
  await yaz(sayfa, yol[0]);
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 2, "geçerli hamle eklenmedi");
  await goruntu("3-ilk-hamle.png");
  for (const kelime of yol.slice(1)) await yaz(sayfa, kelime);
  assert.ok(await sayfa.evaluate(() => oyun.over), "hedefe ulaşıldı ama oyun bitmedi");
  await sayfa.waitForSelector("#modal:not(.hidden)");
  assert.deepEqual(await cagrilar("titresim"), [{ type: "ERROR" }, { type: "SUCCESS" }]);
  await goruntu("4-cozum.png");

  // Paylaşım: yerel sayfaya gider; adres capacitor://localhost değil sitedir
  await sayfa.tap("#btnShare");
  await sayfa.waitForFunction(() => window.__cagri.some((c) => c[0] === "paylas"));
  const [{ text }] = await cagrilar("paylas");
  assert.ok(text.includes(`${d.bas} → ${d.hedef}`), text);
  assert.ok(text.endsWith("\n" + SITE_ADRESI), `paylaşılan adres site olmalı:\n${text}`);
  assert.ok(!text.includes("127.0.0.1"), "paylaşım metninde yerel adres kaldı");

  // Kayıt cihazda kalır, yeniden açılınca çözüm durur
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.db && window.oyun.startWord);
  assert.ok(await sayfa.evaluate(() => oyun.over && oyun.chain.length > 1), "çözüm yeniden açılışta kayboldu");
  assert.ok(await sayfa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "yatay taşma");

  // Gizlilik sayfası paketin içinden açılır ve oyuna geri döner
  await sayfa.locator('.site-footer a[href="gizlilik.html"]').tap();
  await sayfa.waitForURL(ADRES + "gizlilik.html");
  const gizlilik = await sayfa.textContent("main");
  assert.match(gizlilik, /Google AdMob/);
  assert.match(gizlilik, /İzin vermezsen reklamlar yine görünür/);
  assert.match(gizlilik, /Plus/);
  assert.equal(await sayfa.evaluate(() => getComputedStyle(document.body).backgroundColor !== "rgba(0, 0, 0, 0)"), true,
               "gizlilik sayfasına stil uygulanmadı");
  await goruntu("5-gizlilik.png");

  // Lisanslar gizlilik sayfasından açılır, telefon genişliğinde taşmaz
  await sayfa.locator('main a[href="lisanslar.html"]').tap();
  await sayfa.waitForURL(ADRES + "lisanslar.html");
  const lisans = await sayfa.textContent("main");
  assert.match(lisans, /Zemberek-NLP/);
  assert.match(lisans, /MIT License/);
  assert.ok(await sayfa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "lisanslar yatay taşıyor");
  await goruntu("6-lisanslar.png");
  await sayfa.locator("a.back").tap();
  await sayfa.waitForFunction(() => window.oyun?.startWord);
  assert.equal(await sayfa.locator('.site-footer a[href="lisanslar.html"]').count(), 1, "oyunda lisanslar bağlantısı yok");

  assert.deepEqual(kayit.disIstekler, [], "dış ağ isteği yapıldı");
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("Capacitor yokken (tarayıcıda) yerel.js hiçbir şeye dokunmaz", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  const { sayfa, kayit } = await ac(baglam);
  const d = await sayfa.evaluate(() => ({
    bas: oyun.startWord,
    paylasimSarildi: Object.prototype.hasOwnProperty.call(navigator, "share"),
  }));
  assert.equal(d.paylasimSarildi, false);
  assert.equal(await sayfa.evaluate(() => typeof window.SozcukGelir), "undefined", "web'de gelir kancası olmamalı (oyun web davranışına düşer)");
  await yaz(sayfa, d.bas);                  // geçersiz hamle hata vermeden reddedilir
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1);
  assert.deepEqual(kayit.disIstekler, []);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

// otomatik-oyna.js'i aynı kaynaktan yükler (CSP 'self'); simulator.sh'ın yazdığı
// onay dosyaları hemen "var" döner. words.json kapalıysa yedek sözlük devreye girer.
async function otomatikOyna({ sozlukYok = false } = {}) {
  const baglam = await tarayici.newContext(TELEFON);
  await baglam.route("**/otomatik-oyna.js", (r) => r.fulfill({ path: OTOMATIK, contentType: "text/javascript" }));
  await baglam.route("**/onay-*.txt", (r) => r.fulfill({ status: 200, body: "" }));
  if (sozlukYok) await baglam.route("**/words.json", (r) => r.fulfill({ status: 404 }));
  const sayfa = await baglam.newPage();
  const isaretler = [];
  sayfa.on("console", (m) => { const e = m.text().match(/^SM-OTOMATIK: (.*)$/); if (e) isaretler.push(e[1]); });
  const son = sayfa.waitForEvent("console", { predicate: (m) => /^SM-OTOMATIK: (nasil|hata)/.test(m.text()), timeout: 60000 });
  await sayfa.goto(ADRES);
  await sayfa.waitForFunction(() => window.oyun?.startWord);
  await sayfa.addScriptTag({ url: "otomatik-oyna.js" });
  await son;
  return { baglam, sayfa, isaretler };
}

test("simülatörün otomatik oynama betiği günün bulmacasını çözer ve aşamaları bildirir", async () => {
  const { baglam, sayfa, isaretler } = await otomatikOyna();
  assert.deepEqual(isaretler, ["acilis", "hamle", "cozum", "nasil"]);
  const d = await sayfa.evaluate(() => ({
    bitti: oyun.over, modalKapali: oyun.el.modal.classList.contains("hidden"),
    nasilGorunur: document.getElementById("nasil-oynanir").getBoundingClientRect().top < innerHeight / 2,
  }));
  assert.deepEqual(d, { bitti: true, modalKapali: true, nasilGorunur: true });
  await baglam.close();
});

test("otomatik oynama betiği yedek sözlükle oynamaz, hata bildirir", async () => {
  const { baglam, isaretler } = await otomatikOyna({ sozlukYok: true });
  assert.deepEqual(isaretler, ["hata words.json yüklenmedi (mock sözlük)"]);
  await baglam.close();
});

/* ---------- Gelir kancası (window.SozcukGelir): sahte AdMob ve StoreKit köprüsü ---------- */

// Sahte köprü: her yerel çağrıyı __cagri'ya yazar. `ayar` senaryoyu belirler; oyun sırasında
// değişecekler window.__odul ("odul" | "erken" | "hata") ve window.__magaza'dadır.
// Gerçek reklam ve satın alma ancak cihazda (TestFlight) denenebilir.
const SAHTE_KOPRU = (ayar) => {
  window.__cagri = [];
  window.__ofset = 0;                                  // Date.now() ileri sarma (geçiş reklamı aralığı)
  const gercekSimdi = Date.now.bind(Date);
  Date.now = () => gercekSimdi() + window.__ofset;
  window.__odul = "odul";
  window.__magaza = { plus: !!ayar.magazaPlus, satin: "tamam", geri: false };
  if (ayar.onbellekPlus) localStorage.setItem("sm_plus", "1");
  if (ayar.simulator) window.SM_OTOMATIK = true;
  window.__bilgiHata = ayar.bilgiHataSayisi || 0;          // ilk N requestConsentInfo çağrısı reddedilir (çevrimdışı açılış)
  const dinleyiciler = {};
  window.__yay = (ad, veri) => (dinleyiciler[ad] || []).slice().forEach((f) => f(veri));
  const cagri = (ad, don) => (arg) => { window.__cagri.push([ad, arg]); return don(arg); };
  const tamam = (v) => Promise.resolve(v);
  const bilgi = ayar.bilgi || { status: "NOT_REQUIRED", isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: "NOT_REQUIRED" };
  const yukle = (arg) => (ayar.yuklemeHata ? Promise.reject(new Error("no fill")) : tamam({ adUnitId: arg.adId }));
  const kopru = window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Haptics: { notification: cagri("titresim", () => tamam()) },
      Share: { share: cagri("paylas", () => tamam()) },
      AdMob: {
        addListener: (ad, f) => {
          (dinleyiciler[ad] ??= []).push(f);
          return tamam({ remove: () => { dinleyiciler[ad] = dinleyiciler[ad].filter((x) => x !== f); } });
        },
        requestConsentInfo: cagri("requestConsentInfo", () => (window.__bilgiHata-- > 0 ? Promise.reject(new Error("çevrimdışı")) : tamam(bilgi))),
        showConsentForm: cagri("showConsentForm", () => (ayar.formHata ? Promise.reject(new Error("form")) : tamam(ayar.formSonrasi))),
        showPrivacyOptionsForm: cagri("showPrivacyOptionsForm", () => tamam()),
        trackingAuthorizationStatus: cagri("trackingAuthorizationStatus", () => tamam({ status: ayar.att || "notDetermined" })),
        requestTrackingAuthorization: cagri("requestTrackingAuthorization", () => tamam()),
        initialize: cagri("initialize", () => tamam()),
        prepareRewardVideoAd: cagri("prepareRewardVideoAd", yukle),
        prepareInterstitial: cagri("prepareInterstitial", yukle),
        // Gerçek eklenti gibi: showRewardVideoAd yalnızca ödülde çözülür, erken kapanışta asla
        showRewardVideoAd: cagri("showRewardVideoAd", () => new Promise((coz, red) => {
          if (window.__odul === "hata") return red(new Error("hazır değil"));
          setTimeout(() => {
            if (window.__odul === "odul") { window.__yay("onRewardedVideoAdReward", { type: "x", amount: 1 }); coz({ type: "x", amount: 1 }); }
            window.__yay("onRewardedVideoAdDismissed");
          }, 20);
        })),
        showInterstitial: cagri("showInterstitial", () => { setTimeout(() => window.__yay("interstitialAdDismissed"), 20); return tamam(); }),
      },
      SatinAlma: {
        addListener: (ad, f) => { (dinleyiciler[ad] ??= []).push(f); return tamam({ remove() {} }); },
        durum: cagri("durum", () => (ayar.durumTakili ? new Promise(() => {}) : tamam({ plus: window.__magaza.plus }))),
        fiyat: cagri("fiyat", () => (ayar.fiyatYok ? Promise.reject(new Error("ürün yok")) : tamam({ fiyat: "₺99,99" }))),
        satinAl: cagri("satinAl", () => tamam({ sonuc: window.__magaza.satin })),
        geriYukle: cagri("geriYukle", () => (ayar.geriHata ? Promise.reject(new Error("giriş iptal")) : tamam({ plus: window.__magaza.geri }))),
      },
    },
  };
};

// Gerçek çözüm akışı: yeni bulmaca çekilir, yol oyunun pressKey'iyle oynanır; win() geçiş
// reklamı kancasını çağırır, çözüm penceresi 650 ms sonra açılır (elle #modal açılmaz).
async function cozGercek(sayfa) {
  const [bas, hedef] = await sayfa.evaluate(() => { oyun.hideModal(); oyun.newGame("free"); return [oyun.startWord, oyun.targetWord]; });
  await sayfa.evaluate((yol) => { for (const k of yol) { for (const h of k) oyun.pressKey(h); oyun.pressKey("ENTER"); } }, enKisaYol(bas, hedef));
  await sayfa.waitForFunction(() => oyun.over);
}
const pencereAcik = (sayfa) => sayfa.waitForSelector("#modal:not(.hidden)");
const pencereKapat = (sayfa) => sayfa.tap("#btnCloseModal");

async function gelirSayfasi(ayar = {}) {
  const baglam = await tarayici.newContext(TELEFON);
  await baglam.addInitScript(SAHTE_KOPRU, ayar);
  if (ayar.eklentiYok) await baglam.addInitScript(() => { delete window.Capacitor.Plugins.SatinAlma; });
  const { sayfa, kayit } = await ac(baglam);
  const adlar = () => sayfa.evaluate(() => window.__cagri.map((c) => c[0]));
  const say = async (ad) => (await adlar()).filter((a) => a === ad).length;
  const bekle = (kosul, arg) => sayfa.waitForFunction(kosul, arg, { timeout: 5000 });
  return { baglam, sayfa, kayit, adlar, say, bekle };
}

test("gelir kancası: sözleşmedeki altı yöntem var, açılışta UMP → ATT → başlat → önyükleme", async () => {
  const { baglam, sayfa, kayit, adlar, bekle } = await gelirSayfasi();
  assert.deepEqual(await sayfa.evaluate(() => Object.keys(window.SozcukGelir).sort()),
                   ["gecisReklami", "odulluReklam", "plusFiyat", "plusGeriYukle", "plusMu", "plusSatinAl"]);
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.plusMu()), false);
  // plusMu düz boolean olmalı: app.js !!plusMu() yazar, bir söz (Promise) herkesi Plus yapardı
  assert.equal(await sayfa.evaluate(() => typeof window.SozcukGelir.plusMu()), "boolean");
  // Kanca değiştirilemez: sayfadaki başka bir betik üzerine yazamaz, tanımı değiştiremez
  assert.deepEqual(await sayfa.evaluate(() => {
    const once = window.SozcukGelir;
    window.SozcukGelir = { plusMu: () => true };
    try { window.SozcukGelir.plusMu = () => true; } catch (_) { /* sıkı kipte hata atar */ }
    let tanimHatasi = false;
    try { Object.defineProperty(window, "SozcukGelir", { value: {} }); } catch (_) { tanimHatasi = true; }
    return [window.SozcukGelir === once, Object.isFrozen(once), window.SozcukGelir.plusMu(), tanimHatasi];
  }), [true, true, false, true]);
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  const akis = (await adlar()).filter((a) => !["titresim", "paylas"].includes(a));
  assert.deepEqual(akis.filter((a) => a !== "fiyat"), ["durum", "requestConsentInfo", "trackingAuthorizationStatus", "requestTrackingAuthorization",
                          "initialize", "prepareRewardVideoAd", "prepareInterstitial"]);
  // 4+ sınıfıyla uyumlu: yalnızca genel kitleye uygun (G) reklamlar
  assert.deepEqual(await sayfa.evaluate(() => window.__cagri.find((c) => c[0] === "initialize")[1]), { maxAdContentRating: "General" });
  // Reklamlar yerel; web görünümüne hiçbir şey yüklenmez, CSP değişmez
  assert.deepEqual(kayit.disIstekler, []);
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  assert.doesNotMatch(await sayfa.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content), /google|unsafe|\*/);
  await baglam.close();
});

test("gelir kancası: ödüllü reklam yalnızca ödül kazanılırsa true döner", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi();
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  const dene = (mod, neden) => sayfa.evaluate(([m, n]) => { window.__odul = m; return window.SozcukGelir.odulluReklam(n); }, [mod, neden]);
  assert.equal(await dene("odul", "ipucu"), true, "izlendi: ödül");
  assert.equal(await dene("erken", "tekrar"), false, "erken kapatıldı: ödül yok (eklentinin sözü hiç çözülmez)");
  assert.equal(await dene("hata", "ipucu"), false, "gösterilemedi");
  assert.equal(await say("showRewardVideoAd"), 3);
  assert.ok(await say("prepareRewardVideoAd") >= 4, "her gösterimden sonra bir sonraki önyüklenmeli");
  // Google reklamları ~1 saatte eskir: 55 dk sonra hazır sayılmaz, gösterimden önce yeniden yüklenir
  await bekle(() => window.__cagri.filter((c) => c[0] === "prepareRewardVideoAd").length >= 4);
  const once = await say("prepareRewardVideoAd");
  await sayfa.evaluate(() => { window.__ofset += 56 * 60 * 1000; });
  assert.equal(await dene("odul", "ipucu"), true);
  assert.equal(await say("prepareRewardVideoAd"), once + 2, "eskiyen reklam yeniden yüklenmeli (+1 gösterimden önce, +1 sonraki için)");
  await baglam.close();
});

test("gelir kancası: reklam yüklenemezse ödüllü false, geçiş reklamı gösterilmez, oyun takılmaz", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi({ yuklemeHata: true });
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  await sayfa.evaluate(async () => { await window.SozcukGelir.gecisReklami("cozum"); await window.SozcukGelir.gecisReklami("cozum"); });
  assert.equal(await say("showRewardVideoAd") + await say("showInterstitial"), 0);
  await baglam.close();
});

test("gelir kancası: UMP gerekiyorsa form gösterilir, reddedilirse reklam yok; tercih bağlantısı çıkar", async () => {
  const gerekli = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
  // Onay alındı
  let g = await gelirSayfasi({ bilgi: gerekli, formSonrasi: { status: "OBTAINED", canRequestAds: true, privacyOptionsRequirementStatus: "REQUIRED" } });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "initialize"));
  assert.ok((await g.adlar()).indexOf("showConsentForm") < (await g.adlar()).indexOf("requestTrackingAuthorization"), "UMP, ATT'den önce");
  await g.bekle(() => [...document.querySelectorAll(".site-footer a")].some((a) => a.textContent === "Reklam Tercihleri"));
  await g.sayfa.locator(".site-footer a", { hasText: "Reklam Tercihleri" }).tap();
  await g.bekle(() => window.__cagri.some((c) => c[0] === "showPrivacyOptionsForm"));
  await g.baglam.close();
  // Onay verilmedi: reklam başlatılmaz, ödüllü false
  g = await gelirSayfasi({ bilgi: gerekli, formSonrasi: { status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" } });
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  assert.deepEqual([await g.say("initialize"), await g.say("requestTrackingAuthorization")], [0, 0]);
  await g.baglam.close();
  // Form hatası: reklam yok, oyun etkilenmez
  g = await gelirSayfasi({ bilgi: gerekli, formHata: true });
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  assert.equal(await g.say("initialize"), 0);
  await g.baglam.close();
});

test("gelir kancası: ATT reddedilse de reklam çalışır (soru yeniden sorulmaz)", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi({ att: "denied" });
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await say("requestTrackingAuthorization"), 0, "karar verilmişse yeniden sorulmaz");
  assert.equal(await say("initialize"), 1);
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true);
  await baglam.close();
});

test("gelir kancası: Plus sahibi reklam görmez, ATT/UMP sorulmaz; iade önbelleği siler", async () => {
  // Önbellekte Plus var, StoreKit de doğruluyor
  let g = await gelirSayfasi({ onbellekPlus: true, magazaPlus: true });
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.plusMu()), true);
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true, "Plus: sınırsız");
  await g.sayfa.evaluate(async () => { await window.SozcukGelir.gecisReklami("cozum"); await window.SozcukGelir.gecisReklami("cozum"); });
  for (const ad of ["requestConsentInfo", "requestTrackingAuthorization", "initialize", "showRewardVideoAd", "showInterstitial"]) {
    assert.equal(await g.say(ad), 0, `Plus sahibinde ${ad} çağrılmamalı`);
  }
  await g.baglam.close();
  // Önbellekte Plus var ama StoreKit artık yok diyor (iade): Plus silinir, reklam akışı başlar
  g = await gelirSayfasi({ onbellekPlus: true });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "initialize"));
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.plusMu()), false);
  assert.equal(await g.sayfa.evaluate(() => localStorage.getItem("sm_plus")), null);
  await g.baglam.close();
});

test("gelir kancası: Plus satın alma ve geri yükleme", async () => {
  const { baglam, sayfa } = await gelirSayfasi();
  const plusMu = () => sayfa.evaluate(() => window.SozcukGelir.plusMu());
  const dene = (ad, ayar) => sayfa.evaluate(([a, m]) => { Object.assign(window.__magaza, m); return window.SozcukGelir[a](); }, [ad, ayar]);
  assert.equal(await dene("plusSatinAl", { satin: "iptal" }), false);
  assert.equal(await dene("plusSatinAl", { satin: "bekliyor" }), false, "ebeveyn onayı bekleyen alım Plus sayılmaz");
  assert.equal(await dene("plusSatinAl", { satin: "dogrulanamadi" }), false);
  assert.equal(await dene("plusGeriYukle", { geri: false }), false, "geri yüklenecek alım yok");
  assert.equal(await plusMu(), false);
  assert.equal(await dene("plusSatinAl", { satin: "tamam" }), true);
  assert.equal(await plusMu(), true);
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_plus")), "1", "yerelde saklanır");
  const cagrilar = await sayfa.evaluate(() => window.__cagri.filter((c) => c[0] === "satinAl").map((c) => c[1]));
  assert.ok(cagrilar.length > 0 && cagrilar.every((a) => a === undefined), "JS ürün kimliği göndermemeli: yerel tarafta sabit");
  await baglam.close();
  // Geri yükleme: alım bulunur → Plus; giriş iptal edilirse (reddedilir) → false, oyun takılmaz
  const g = await gelirSayfasi();
  assert.equal(await g.sayfa.evaluate(() => { window.__magaza.geri = true; return window.SozcukGelir.plusGeriYukle(); }), true);
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.plusMu()), true);
  await g.baglam.close();
  const h = await gelirSayfasi({ geriHata: true });
  assert.equal(await h.sayfa.evaluate(() => window.SozcukGelir.plusGeriYukle()), false);
  await h.baglam.close();
});

test("gelir kancası: simülatör derlemesinde reklam, ATT ve satın alma yok; ödül hep verilir", async () => {
  const { baglam, sayfa, adlar } = await gelirSayfasi({ simulator: true });
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true);
  await sayfa.evaluate(async () => { await window.SozcukGelir.gecisReklami("cozum"); await window.SozcukGelir.gecisReklami("cozum"); });
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.plusSatinAl()), false);
  await sayfa.waitForTimeout(800);
  assert.deepEqual((await adlar()).filter((a) => !["titresim", "paylas"].includes(a)), [], "hiçbir yerel reklam/satın alma çağrısı yapılmamalı");
  await baglam.close();
});

test("gelir kancası: Plus değişince ve fiyat gelince sayfaya 'sozcukgelir' olayı gider", async () => {
  const { baglam, sayfa, bekle } = await gelirSayfasi();
  await sayfa.evaluate(() => { window.__olaylar = 0; window.addEventListener("sozcukgelir", () => window.__olaylar++); });
  // Fiyat açılışta yüklenip önbelleğe alınır (eşzamanlı string); olay sayfa dinlemeden önce gelmiş olabilir
  await bekle(() => window.SozcukGelir.plusFiyat() === "₺99,99");
  assert.equal(await sayfa.evaluate(() => typeof window.SozcukGelir.plusFiyat()), "string");
  // Uygulama dışında biten alım (ebeveyn onayı): yerel dinleyici Plus'ı verir
  await sayfa.evaluate(() => window.__yay("plus", { plus: true }));
  assert.deepEqual(await sayfa.evaluate(() => [window.SozcukGelir.plusMu(), window.__olaylar]), [true, 1]);
  await sayfa.evaluate(() => window.__yay("plus", { plus: true }));
  assert.equal(await sayfa.evaluate(() => window.__olaylar), 1, "değişmeyen durumda olay yok");
  await sayfa.evaluate(() => window.__yay("plus", { plus: false }));            // iade
  assert.deepEqual(await sayfa.evaluate(() => [window.SozcukGelir.plusMu(), window.__olaylar]), [false, 2]);
  await baglam.close();
  // Ürün yoksa fiyat null kalır, kanca bozulmaz
  const g = await gelirSayfasi({ fiyatYok: true });
  await g.sayfa.waitForTimeout(300);
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.plusFiyat()), null);
  await g.baglam.close();
});

test("gelir kancası: geçiş reklamı gerçek çözüm akışıyla: pencere kapanır kapanmaz, sıklık sınırı, yeni bulmacada yok", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi();
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  // 1. çözüm: oturumun ilk çözümünde reklam yok
  await cozGercek(sayfa);
  await pencereAcik(sayfa);
  assert.equal(await say("showInterstitial"), 0, "ilk çözümde reklam yok");
  // 2. çözüm: win() reklamı hemen ister ama pencere (650 ms sonra) açıkken gösterilmez
  await cozGercek(sayfa);
  await pencereAcik(sayfa);
  await sayfa.waitForTimeout(500);
  assert.equal(await say("showInterstitial"), 0, "çözüm penceresi açıkken reklam gösterildi (win() anında)");
  await pencereKapat(sayfa);
  await bekle(() => window.__cagri.some((c) => c[0] === "showInterstitial"));
  assert.equal(await say("showInterstitial"), 1, "pencere kapanınca reklam");
  // 3. çözüm hemen ardından: 3 dk dolmadı
  await bekle(() => window.__cagri.filter((c) => c[0] === "prepareInterstitial").length >= 2);
  await cozGercek(sayfa);
  await pencereAcik(sayfa); await pencereKapat(sayfa);
  await sayfa.waitForTimeout(400);
  assert.equal(await say("showInterstitial"), 1, "3 dk dolmadan ikinci reklam yok");
  // 3 dk sonra: gösterilir
  await sayfa.evaluate(() => { window.__ofset += 3 * 60 * 1000 + 1000; });
  await cozGercek(sayfa);
  await pencereAcik(sayfa); await pencereKapat(sayfa);
  await bekle(() => window.__cagri.filter((c) => c[0] === "showInterstitial").length === 2);
  // Pencereyi "Yeni Oyun" ile kapatmak yeni bulmaca çeker: o çözümde reklam yok (oyuncu yazmaya başlayabilir)
  await bekle(() => window.__cagri.filter((c) => c[0] === "prepareInterstitial").length >= 3);
  await sayfa.evaluate(() => { window.__ofset += 3 * 60 * 1000 + 1000; });
  await cozGercek(sayfa);
  await pencereAcik(sayfa);
  await sayfa.tap("#btnNewGame");
  await sayfa.waitForTimeout(600);
  assert.equal(await say("showInterstitial"), 2, "yeni bulmaca çekilince reklam gösterilmez");
  await baglam.close();
});

test("gelir kancası: ödüllü reklam, bekleyen geçiş reklamını ve hemen ardından gelecek reklamı düşürür", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi();
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial") && window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  await cozGercek(sayfa);                                                // 1. çözüm
  await cozGercek(sayfa);                                                // 2. çözüm: reklam pencere kapanınca gelecekti
  await pencereAcik(sayfa);
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.odulluReklam("tekrar")), true);
  await sayfa.evaluate(() => oyun.beginRetry());                         // "reklam izle, tekrar dene": pencere kapanır, tekrar başlar
  await sayfa.waitForTimeout(600);
  assert.equal(await say("showRewardVideoAd"), 1);
  assert.equal(await say("showInterstitial"), 0, "ödüllü reklamın hemen ardından geçiş reklamı gösterildi");
  // Ödüllü reklamdan sonra pencereyi kapatmak da reklam getirmez (sonGecis yenilendi)
  await cozGercek(sayfa);
  await pencereAcik(sayfa); await pencereKapat(sayfa);
  await sayfa.waitForTimeout(400);
  assert.equal(await say("showInterstitial"), 0, "ödüllü reklamdan sonra 3 dk dolmadan geçiş reklamı yok");
  await baglam.close();
});

test("gelir kancası: çözüm sayısı ve son reklam zamanı sayfa yenilenince kaybolmaz (sessionStorage)", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi();
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  await cozGercek(sayfa);
  assert.equal(await sayfa.evaluate(() => sessionStorage.getItem("sm_cozum")), "1");
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.startWord);
  await sayfa.waitForFunction(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  await cozGercek(sayfa);                                                // yenileme sonrası ikinci çözüm: reklam hakkı doğar
  await pencereAcik(sayfa); await pencereKapat(sayfa);
  await bekle(() => window.__cagri.some((c) => c[0] === "showInterstitial"));
  assert.ok(Number(await sayfa.evaluate(() => sessionStorage.getItem("sm_gecis"))) > 0);
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.startWord);
  await sayfa.waitForFunction(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  await cozGercek(sayfa);
  await pencereAcik(sayfa); await pencereKapat(sayfa);
  await sayfa.waitForTimeout(500);
  assert.equal(await say("showInterstitial"), 0, "yenilemeden sonra da 3 dk aralığı sürmeli");
  await baglam.close();
});

test("gelir kancası: izin hatası (çevrimdışı açılış) saklanmaz, sonraki istek yeniden dener; gerçek 'onay yok' saklanır", async () => {
  let g = await gelirSayfasi({ bilgiHataSayisi: 1 });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "requestConsentInfo"));
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true, "ikinci denemede başarılı");
  assert.equal(await g.say("requestConsentInfo"), 2);
  assert.equal(await g.say("initialize"), 1);
  await g.baglam.close();
  const hayir = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
  g = await gelirSayfasi({ bilgi: hayir, formSonrasi: { status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" } });
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  assert.equal(await g.say("requestConsentInfo"), 1, "gerçek 'onay yok' oturum boyunca saklanır (tekrar sorulmaz)");
  await g.baglam.close();
});

test("gelir kancası: Plus eklentisi yoksa önbellekteki sm_plus'a güvenilmez", async () => {
  const { baglam, sayfa } = await gelirSayfasi({ onbellekPlus: true, eklentiYok: true });
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.plusMu()), false);
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_plus")), null);
  await baglam.close();
});

test("gelir kancası: StoreKit doğrulaması takılırsa 5 sn sonra reklam akışı başlar", async () => {
  const { baglam, sayfa } = await gelirSayfasi({ durumTakili: true });
  await sayfa.waitForTimeout(1500);
  assert.equal(await sayfa.evaluate(() => window.__cagri.filter((c) => c[0] === "initialize").length), 0, "5 sn dolmadan başlamamalı");
  await sayfa.waitForFunction(() => window.__cagri.some((c) => c[0] === "initialize"), null, { timeout: 8000 });
  await baglam.close();
});
