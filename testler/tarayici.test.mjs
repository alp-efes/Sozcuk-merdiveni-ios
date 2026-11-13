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

// Açılış ekranı geçer, ana ekran gelir
const anaEkran = (sayfa) => sayfa.waitForSelector('body[data-ekran="ana"] #btnGunluk');
// Ana ekrandan oyuna: telefonun klavyesini açan metin alanı odaklanır
async function oyunaGir(sayfa, mod = "daily") {
  await anaEkran(sayfa);
  await sayfa.tap(mod === "daily" ? "#btnGunluk" : "#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun" && (oyun.over || document.activeElement.id === "giris"));
}
// Oyuncu telefonun klavyesiyle yazar: harfler küçük gelir (uygulama Türkçe kuralla büyütür),
// gönder tuşu Enter'dır. Sitenin ekran klavyesi uygulamada yoktur.
async function yaz(sayfa, kelime) {
  await sayfa.keyboard.type(kelime.toLocaleLowerCase("tr-TR"));
  await sayfa.keyboard.press("Enter");
}
// Telefonun klavyesi açılınca iOS'ta yalnızca GÖRÜNEN alan (visualViewport) küçülür; sayfanın
// yerleşim alanı (100dvh, innerHeight) aynı kalır. Tarayıcıda klavye açılmadığı için görünen alan
// sahtesiyle değiştirilir (SAHTE_GORUNUM); klavye() boyunu değiştirip iOS gibi "resize" gönderir.
const KLAVYE = 336;
const SAHTE_GORUNUM = () => {
  const vv = new EventTarget();
  let boy = null;                                        // null: klavye kapalı, görünen alan = yerleşim alanı
  Object.assign(vv, { offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
  Object.defineProperty(vv, "height", { get: () => boy ?? innerHeight, set: (v) => { boy = v; } });
  Object.defineProperty(vv, "width", { get: () => innerWidth });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
};
const klavye = (sayfa, acik) => sayfa.evaluate((boy) => {
  visualViewport.height = innerHeight - boy;
  visualViewport.dispatchEvent(new Event("resize"));
}, acik ? KLAVYE : 0);
const durum = (sayfa) => sayfa.evaluate(() => ({ mod: oyun.mode, zincir: oyun.chain.slice(), tampon: oyun.buffer, bitti: oyun.over,
  ekran: document.body.dataset.ekran, odak: document.activeElement.id, alan: document.getElementById("giris").value }));

test("uygulama: oyun oynanır, yerel özellikler bağlanır, dış istek yapılmaz", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  // Sahte Capacitor köprüsü: çağrıları kaydeder
  await baglam.addInitScript(() => {
    window.__cagri = [];
    const kaydet = (ad) => (arg) => { window.__cagri.push([ad, arg]); return Promise.resolve(); };
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Haptics: { notification: kaydet("titresim"), impact: kaydet("dokunus") }, Share: { share: kaydet("paylas") } },
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
  // Açılış ekranı ana ekrana geçer; oyun arkada gizlidir
  await anaEkran(sayfa);
  assert.equal(await sayfa.textContent("#gunlukBulmaca"), `${d.bas} → ${d.hedef}`);
  await goruntu("0-ana-ekran.png");
  // Paketteki Fraunces yüklenmeli (CSP font-src)
  assert.ok(await sayfa.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes("Fraunces") && f.status === "loaded");
  }), "Fraunces yazı tipi yüklenmedi");
  assert.equal(d.reklam, 0, "reklam alanı kalmış");
  assert.equal(d.izleme, "undefined", "analitik köprüsü tanımlı");
  assert.deepEqual(d.betikler, ["app.js", "uygulama.js", "yerel.js"]);
  // Sahip kararı (13 Kasım 2026): uygulamada sitenin ekran klavyesi yok, telefonun klavyesi kullanılır
  assert.equal(d.ekranKlavyesi, "none", "uygulamada sitenin ekran klavyesi görünmemeli");
  await oyunaGir(sayfa);
  await goruntu("1-gunun-bulmacasi.png");

  // Geçersiz hamle: kelimeyi değiştirmeden gönder → reddedilir + hata titreşimi
  await yaz(sayfa, d.bas);
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1, "değişmeyen kelime kabul edildi");
  assert.ok(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")));
  assert.deepEqual(await cagrilar("titresim"), [{ type: "ERROR" }]);
  await goruntu("2-gecersiz-hamle.png");
  for (const _ of d.bas) await sayfa.keyboard.press("Backspace");   // reddedilen kelime satırda kalır
  assert.equal((await durum(sayfa)).tampon, "");

  // Çözüm
  const yol = enKisaYol(d.bas, d.hedef);
  await yaz(sayfa, yol[0]);
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 2, "geçerli hamle eklenmedi");
  assert.deepEqual(await cagrilar("dokunus"), [{ style: "LIGHT" }], "kabul edilen kelimede hafif dokunuş");
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
  await anaEkran(sayfa);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
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
  // Sayfadan dönüş uygulama açılışı değildir: açılış ekranı bekletilmez (uygulama.js referrer'a bakar)
  assert.ok(await sayfa.evaluate(() => document.referrer.endsWith("lisanslar.html")), "dönüşte referrer boş: açılış ekranı yine bekletir");
  await anaEkran(sayfa);
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
  await oyunaGir(sayfa);
  await yaz(sayfa, d.bas);                  // geçersiz hamle hata vermeden reddedilir
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1);
  assert.ok(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")));
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
  // "bilgi" satırı klavye ölçüsüdür (tarayıcıda klavye açılmaz: klavye=false), aşama değildir
  const bilgi = isaretler.filter((i) => i.startsWith("bilgi "));
  assert.deepEqual(bilgi, ["bilgi klavye=false gorunen=844 tam=844 ust=0 kayma=0 kabuk=844 odak=giris"]);
  assert.deepEqual(isaretler.filter((i) => !i.startsWith("bilgi ")), ["ana", "oyun", "hamle", "cozum", "nasil"]);
  const d = await sayfa.evaluate(() => ({
    bitti: oyun.over, modalKapali: oyun.el.modal.classList.contains("hidden"), zincir: oyun.chain.length > 2,
    nasilGorunur: document.body.classList.contains("yardim") &&
      getComputedStyle(document.getElementById("nasil-oynanir")).display !== "none" &&
      document.getElementById("nasil-oynanir").getBoundingClientRect().top < innerHeight / 2,
  }));
  assert.deepEqual(d, { bitti: true, modalKapali: true, zincir: true, nasilGorunur: true });
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
        vitrin: cagri("vitrin", () => (ayar.vitrinTakili ? new Promise(() => {}) : ayar.vitrinHata ? Promise.reject(new Error("vitrin yok")) : tamam({ ulke: ayar.ulke ?? "TUR" }))),
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
  assert.deepEqual(akis.filter((a) => a !== "fiyat"), ["durum", "requestConsentInfo", "vitrin", "trackingAuthorizationStatus", "requestTrackingAuthorization",
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

test("gelir kancası: Birleşik Krallık vitrininde ATT sorulmaz ve TFUA yalnızca reklam başlatmaya konur, UMP'ye değil", async () => {
  const baslatma = (sayfa) => sayfa.evaluate(() => window.__cagri.find((c) => c[0] === "initialize")[1]);
  for (const [ayar, beklenen, attSayisi] of [
    [{ ulke: "GBR" }, { maxAdContentRating: "General", tagForUnderAgeOfConsent: true }, 0],
    [{ ulke: "TUR" }, { maxAdContentRating: "General" }, 1],
    [{ vitrinHata: true }, { maxAdContentRating: "General" }, 1],   // vitrin alınamazsa etiket yok, ATT sorulur
    [{ vitrinTakili: true }, { maxAdContentRating: "General" }, 1],  // takılırsa ~2 sn sonra etiketsiz başlar
  ]) {
    const g = await gelirSayfasi(ayar);
    await g.bekle(() => window.__cagri.some((c) => c[0] === "initialize"));
    assert.deepEqual(await baslatma(g.sayfa), beklenen, JSON.stringify(ayar));
    assert.equal(await g.say("requestTrackingAuthorization"), attSayisi, "ATT: " + JSON.stringify(ayar));
    // Vitrin ATT'den önce okunur
    const adlar = await g.adlar();
    assert.ok(adlar.indexOf("vitrin") < adlar.indexOf("initialize"), "vitrin, başlatmadan önce");
    // UMP çağrısına etiket verilmez: cihaz erişimi onayı (PECR) pencereden toplanmaya devam eder
    assert.deepEqual(await g.sayfa.evaluate(() => window.__cagri.find((c) => c[0] === "requestConsentInfo")[1] ?? null), null);
    await g.baglam.close();
  }
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

/* ---------- Uygulama arayüzü (web/uygulama.js): açılış, ana ekran, telefonun klavyesi ----------
 * Arayüz Capacitor köprüsü gerektirmez. Telefonun klavyesi tarayıcıda açılmaz: yazma gerçek
 * klavye olaylarıyla, klavyenin kapladığı yer görünümü kısaltarak (visualViewport) taklit edilir.
 * iOS'un kendi kaydırma davranışı ancak simülatörde/cihazda görülür (araclar/otomatik-oyna.js ölçer). */

async function arayuzSayfasi({ secenek = TELEFON, kayitlar = {} } = {}) {
  const baglam = await tarayici.newContext(secenek);
  await baglam.addInitScript(SAHTE_GORUNUM);
  await baglam.addInitScript((k) => {
    if (sessionStorage.getItem("__kuruldu")) return;      // yalnızca ilk açılışta: yenileme kayıtları ezmesin
    sessionStorage.setItem("__kuruldu", "1");
    for (const [ad, deger] of Object.entries(k)) localStorage.setItem(ad, deger);
  }, kayitlar);
  const { sayfa, kayit } = await ac(baglam);
  return { baglam, sayfa, kayit };
}
// Öge gerçekten görünüyor mu (display, visibility ve boyut)
const gorunur = (sayfa, secici) => sayfa.evaluate((s) => {
  const e = document.querySelector(s), r = e.getBoundingClientRect(), b = getComputedStyle(e);
  return b.display !== "none" && b.visibility !== "hidden" && r.width > 0 && r.height > 0;
}, secici);
const kutu = (sayfa, secici) => sayfa.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { ust: r.top, alt: r.bottom, sol: r.left, sag: r.right, en: r.width, boy: r.height };
}, secici);
// Verilen seçicilerdeki görünür her ögenin dokunma alanı en az 44×44 px
const kucukHedefler = (sayfa, secici) => sayfa.evaluate((s) => [...document.querySelectorAll(s)]
  .filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0)
  .map((e) => ({ ad: e.id || e.textContent.trim(), en: Math.round(e.getBoundingClientRect().width), boy: Math.round(e.getBoundingClientRect().height) }))
  .filter((o) => o.en < 44 || o.boy < 44), secici);
const tasmaYok = (sayfa) => sayfa.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0 && scrollY === 0);
const sil = async (sayfa, adet = 6) => { for (let i = 0; i < adet; i++) await sayfa.keyboard.press("Backspace"); };

test("uygulama arayüzü: açılış ekranı sözlük yüklenene dek durur, ardından iki seçenekli ana ekran gelir", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  // Sözlük bekletilir: açılış ekranı o sırada görünür olmalı
  let birak;
  const bekleyen = new Promise((coz) => { birak = coz; });
  await baglam.route("**/words.json", async (r) => { await bekleyen; await r.continue(); });
  const sayfa = await baglam.newPage();
  const hatalar = [];
  sayfa.on("pageerror", (e) => hatalar.push(e.message));
  sayfa.on("console", (m) => { if (m.type() === "error") hatalar.push(m.text()); });
  await sayfa.goto(ADRES);
  assert.equal(await sayfa.evaluate(() => document.body.dataset.ekran), undefined, "sözlük gelmeden ana ekran açıldı");
  assert.ok(await gorunur(sayfa, "#acilis"), "açılış ekranı görünmüyor");
  assert.ok(await gorunur(sayfa, "#acilis .isaret"), "açılış ekranında işaret yok");
  const a = await kutu(sayfa, "#acilis");
  assert.deepEqual([a.ust, a.sol, a.en, a.boy], [0, 0, 390, 844], "açılış ekranı ekranı kaplamalı");
  assert.equal(await gorunur(sayfa, "#ana"), false);
  assert.equal(await gorunur(sayfa, "#oyun"), false, "açılışta oyun görünmemeli");
  birak();
  await anaEkran(sayfa);
  assert.ok(await sayfa.evaluate(() => performance.now()) >= 800, "açılış ekranı en az 0,8 sn görünmeli");
  await sayfa.waitForFunction(() => getComputedStyle(document.getElementById("acilis")).visibility === "hidden");

  // Ana ekran: iki büyük seçenek, günün bulmacası kartta; oyun arkada gizli
  const [bas, hedef, enAz] = await sayfa.evaluate(() => oyun.dailyPuzzle());
  assert.equal(await sayfa.textContent("#gunlukBulmaca"), `${bas} → ${hedef}`);
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Herkese aynı bulmaca · en az ${enAz} adım`);
  assert.equal(await sayfa.textContent("#kartGunlukBaslik"), "Günün Bulmacası");
  assert.equal(await sayfa.textContent("#kartSerbestBaslik"), "Serbest Oyun");
  for (const dugme of ["#btnGunluk", "#btnSerbest"]) {
    assert.ok(await gorunur(sayfa, dugme));
    assert.equal(await sayfa.textContent(dugme), "Oyna");
    const k = await kutu(sayfa, dugme);
    assert.ok(k.en >= 250 && k.boy >= 44 && k.alt <= 844, `${dugme} büyük ve ilk ekranda olmalı (${k.en}×${k.boy}, alt ${k.alt})`);
  }
  assert.equal(await gorunur(sayfa, "#oyun"), false, "ana ekranda oyun görünmemeli");
  assert.equal(await gorunur(sayfa, "#gunlukSonraki"), false, "çözülmemiş günlükte geri sayım görünmemeli");
  assert.deepEqual(await kucukHedefler(sayfa, "#ana button, #ana a"), [], "ana ekranda 44 px'ten küçük dokunma hedefi");
  assert.ok(await tasmaYok(sayfa), "ana ekranda taşma ya da kayma");
  // Ana ekranda yazılan tuş arkadaki tahtaya gitmez
  await sayfa.keyboard.type("abc");
  await sayfa.keyboard.press("Enter");
  const d = await durum(sayfa);
  assert.deepEqual([d.tampon, d.zincir.length, d.ekran], ["", 1, "ana"]);
  assert.deepEqual(hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: telefonun klavyesiyle yazma — Türkçe büyük harf, süzme, silme, harf şeridi", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_uzunluk: "5", sm_zorluk: "zor" } });
  await oyunaGir(sayfa, "free");
  // Metin alanı: klavyeyi açar, otomatik düzeltme/büyütme yapmaz, iOS'u yakınlaştırmaz (≥ 16 px)
  const alan = await sayfa.evaluate(() => {
    const g = document.getElementById("giris");
    return { tur: g.type, buyut: g.getAttribute("autocapitalize"), duzelt: g.getAttribute("autocorrect"), yazim: g.getAttribute("spellcheck"),
      gonder: g.getAttribute("enterkeyhint"), ad: g.getAttribute("aria-label"), yazi: parseFloat(getComputedStyle(g).fontSize),
      ust: g.getBoundingClientRect().top };
  });
  assert.deepEqual(alan, { tur: "text", buyut: "off", duzelt: "off", yazim: "false", gonder: "send", ad: "Kelime yaz", yazi: 16, ust: 0 });
  const tampon = async () => { const d = await durum(sayfa); assert.equal(d.alan, d.tampon, "metin alanı tamponla aynı olmalı"); return d.tampon; };

  // Küçük harfler Türkçe kuralla büyür: ı → I, i → İ (İngilizce kuralla i → I olurdu)
  await sayfa.keyboard.type("ı");
  assert.equal(await tampon(), "I");
  await sayfa.keyboard.type("i");
  assert.equal(await tampon(), "Iİ", "i harfi İ olmalı; tuş iki kez de yazılmamalı");
  await sayfa.keyboard.type("şğ");
  assert.equal(await tampon(), "IİŞĞ");
  // Büyük yazılanlar olduğu gibi kalır
  await sil(sayfa);
  await sayfa.keyboard.type("Iİ");
  assert.equal(await tampon(), "Iİ");
  // Türk alfabesinde olmayan her şey süzülür (q, w, x, rakam, boşluk, noktalama)
  await sayfa.keyboard.type("q1 w.x-é");
  assert.equal(await tampon(), "Iİ");
  // Silme tuşu
  await sayfa.keyboard.press("Backspace");
  assert.equal(await tampon(), "I");
  await sil(sayfa);
  assert.equal(await tampon(), "");
  // Toplu yazma (dikte, öneri çubuğu, yapıştırma): süzülür ve kelime boyuna kırpılır
  await sayfa.keyboard.insertText("çığ lık!");
  assert.equal(await tampon(), "ÇIĞLI");
  await sayfa.keyboard.type("k");
  assert.equal(await tampon(), "ÇIĞLI", "kelime boyundan fazlası yazılmamalı");
  await sil(sayfa);

  // Türkçe harf şeridi: Türkçe klavyesi olmayan için; dokunmak klavyeyi kapatmaz
  assert.deepEqual(await sayfa.evaluate(() => [...document.querySelectorAll("#harfler .harf")].map((h) => h.dataset.key)),
                   ["Ç", "Ğ", "I", "İ", "Ö", "Ş", "Ü"]);
  assert.deepEqual(await kucukHedefler(sayfa, "#harfler .harf, #oyun .icon-btn"), [], "oyun ekranında 44 px'ten küçük dokunma hedefi");
  for (const h of ["Ç", "I", "İ", "Ş", "Ü"]) await sayfa.tap(`.harf[data-key="${h}"]`);
  assert.equal(await tampon(), "ÇIİŞÜ");
  assert.equal((await durum(sayfa)).odak, "giris", "şeride dokununca klavye kapanmamalı");
  // Sözlükte olmayan kelime: oyuncuyu suçlamayan ileti, kelime satırda kalır
  await sayfa.keyboard.press("Enter");
  assert.equal(await sayfa.textContent("#toast"), "Sözlükte yok: ÇIİŞÜ");
  assert.equal((await durum(sayfa)).zincir.length, 1);
  await sil(sayfa);
  // Tahtaya, ipucuna dokunmak da klavyeyi açık tutar
  await sayfa.tap("#inputRow");
  assert.equal((await durum(sayfa)).odak, "giris");
  await sayfa.tap("#btnHint");
  assert.equal((await durum(sayfa)).odak, "giris");
  // Eksik kelime gönderilmez
  await sayfa.keyboard.type("a");
  await sayfa.keyboard.press("Enter");
  assert.equal(await sayfa.textContent("#toast"), "Harf eksik");
  assert.ok(await tasmaYok(sayfa));
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: klavye açılınca ekran kaymaz; giriş satırı, son kelime ve harf şeridi görünür kalır", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const olc = () => sayfa.evaluate(() => {
    const r = (id) => { const k = document.getElementById(id).getBoundingClientRect(); return { ust: Math.round(k.top), alt: Math.round(k.bottom) }; };
    const son = document.querySelector("#ladder .rung:last-child")?.getBoundingClientRect();
    return { gorunen: visualViewport.height, kabuk: r("oyun"), giris: r("inputRow"), serit: r("harfler"), hedef: r("targetWord"), bas: r("startWord"),
      son: son && { ust: Math.round(son.top), alt: Math.round(son.bottom) }, merdiven: r("steps"),
      kayma: [scrollX, scrollY, visualViewport.offsetTop], belge: document.documentElement.scrollHeight <= innerHeight,
      sitedekiKlavye: getComputedStyle(document.getElementById("keyboard")).display };
  });
  let o = await olc();
  assert.deepEqual([o.kabuk.ust, o.kabuk.alt, o.sitedekiKlavye], [0, 844, "none"]);

  // Klavye açılır: görünen alan 844 → 508 px; sayfanın yerleşim alanı 844 kalır (iOS'taki gibi)
  await klavye(sayfa, true);
  o = await olc();
  assert.equal(await sayfa.evaluate(() => innerHeight), 844);
  assert.deepEqual([o.gorunen, o.kabuk.ust, o.kabuk.alt], [508, 0, 508], "oyun ekranı görünen alana sığmalı");
  assert.deepEqual(o.kayma, [0, 0, 0], "sayfa kaymamalı");
  assert.ok(o.belge, "belge kaydırılabilir olmamalı");
  assert.equal(o.serit.alt, 508, "harf şeridi klavyenin hemen üstünde olmalı");
  assert.ok(o.giris.ust >= o.merdiven.ust && o.giris.alt <= o.serit.ust, "giriş satırı görünmüyor");
  assert.ok(o.bas.ust >= 0 && o.hedef.alt <= o.serit.ust, "başlangıç ve hedef görünmeli");

  // Uzun merdiven: son kelime ve giriş satırı klavyenin üstünde kalır, eski basamaklar yukarı kayar
  const { zincir: [bas] } = await durum(sayfa);
  const [bir] = enKisaYol(bas, await sayfa.evaluate(() => oyun.targetWord));
  for (let i = 0; i < 5; i++) { await yaz(sayfa, bir); await yaz(sayfa, bas); }      // geri dönmek serbesttir
  assert.equal((await durum(sayfa)).zincir.length, 11);
  o = await olc();
  assert.deepEqual([o.kabuk.ust, o.kabuk.alt, ...o.kayma], [0, 508, 0, 0, 0]);
  assert.equal(await sayfa.evaluate(() => document.getElementById("game").scrollTop), 0, "merdivenin dış kabı kaymamalı");
  assert.ok(o.giris.ust >= o.merdiven.ust && o.giris.alt <= o.merdiven.alt, "uzun merdivende giriş satırı görünmüyor");
  assert.ok(o.son.ust >= o.merdiven.ust - 1 && o.son.alt <= o.giris.ust, "uzun merdivende son kelime görünmüyor");
  assert.ok(o.hedef.alt <= o.serit.ust, "hedef klavyenin üstünde kalmalı");
  assert.ok(o.bas.alt <= o.merdiven.ust + 1 || o.bas.ust < o.son.ust, "eski basamaklar yukarı kaymalı");
  if (process.env.EKRAN_DIZINI) {
    await sayfa.waitForTimeout(400);                    // basamakların giriş animasyonu bitsin
    await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, "7-uzun-merdiven-klavye.png") });
  }

  // Pencere (ipucu teklifi, çözüm) de görünen alana sığar
  const pencere = () => sayfa.evaluate(() => { const r = document.getElementById("modal").getBoundingClientRect(); return [r.top, r.height]; });
  assert.deepEqual(await pencere(), [0, 508]);
  // iOS sayfayı yine de kaydırırsa (görünen alanın üstü 0'dan büyük) kabuk görünen alanı izler
  await sayfa.evaluate(() => { visualViewport.offsetTop = 60; visualViewport.dispatchEvent(new Event("scroll")); });
  o = await olc();
  assert.deepEqual([o.kabuk.ust, o.kabuk.alt, await pencere()], [60, 568, [60, 508]], "kabuk kayan görünen alanı izlemeli");
  await sayfa.evaluate(() => { visualViewport.offsetTop = 0; visualViewport.dispatchEvent(new Event("scroll")); });
  assert.deepEqual((await olc()).kabuk, { ust: 0, alt: 508 });

  // Ana ekrana dönünce klavye kapanır; yeniden girişte ekran son ölçülen klavyeli boya HEMEN geçer
  // (iOS boyut olayını klavye animasyonu bitince gönderir; ekran o anda sıçramasın)
  await sayfa.tap("#btnAna");
  assert.notEqual((await durum(sayfa)).odak, "giris", "ana ekranda klavye kapanmalı");
  await klavye(sayfa, false);
  await sayfa.waitForFunction(() => document.documentElement.style.getPropertyValue("--vvh") === "844px");
  await sayfa.tap("#btnGunluk");
  assert.equal(await sayfa.evaluate(() => document.documentElement.style.getPropertyValue("--vvh")), "508px", "klavyeli boy önceden uygulanmalı");
  // Klavye hiç açılmazsa (bağlı klavye) gerçek ölçüye dönülür
  await sayfa.waitForFunction(() => document.documentElement.style.getPropertyValue("--vvh") === "844px", null, { timeout: 4000 });
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: ana ekran ⇄ oyun; her modun oyunu ayrı saklanır, yeniden açılışta sürer", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_zorluk: "zor" } });
  await oyunaGir(sayfa);
  assert.equal(await sayfa.textContent("#modAdi"), "Günün Bulmacası");
  assert.equal(await sayfa.getAttribute("#btnRestart", "aria-label"), "Baştan başla");
  assert.equal(await gorunur(sayfa, "#ana"), false, "oyunda ana ekran görünmemeli");
  // Sekmeler ve oyun içi ayar satırı uygulamada yok (ana ekrandadır)
  for (const s of [".mode-tabs", "#freeSettings", ".brand-game", "#keyboard", "#dailyTimer"]) assert.equal(await gorunur(sayfa, s), false, `${s} görünmemeli`);
  const g = await durum(sayfa);
  const gunlukYol = enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord));
  await yaz(sayfa, gunlukYol[0]);
  const gunluk = (await durum(sayfa)).zincir;
  assert.equal(gunluk.length, 2);

  // Ana ekrana dönüş: başlıktaki geri düğmesi
  assert.equal(await sayfa.getAttribute("#btnAna", "aria-label"), "Ana ekran");
  await sayfa.tap("#btnAna");
  assert.equal((await durum(sayfa)).ekran, "ana");
  assert.equal(await gorunur(sayfa, "#oyun"), false);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");
  assert.match(await sayfa.textContent("#gunlukDurum"), /^1 adım attın · en az \d+$/);

  // Serbest oyun: günlükte kalınan yer silinmez
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => document.activeElement.id === "giris");
  assert.equal(await sayfa.textContent("#modAdi"), "Serbest Oyun");
  assert.equal(await sayfa.getAttribute("#btnRestart", "aria-label"), "Yeni bulmaca");
  let s = await durum(sayfa);
  assert.equal(s.mod, "free");
  const serbestHedef = await sayfa.evaluate(() => oyun.targetWord);
  const serbestYol = enKisaYol(s.zincir[0], serbestHedef);
  assert.ok(serbestYol.length > 1, "zor bulmaca tek adımda çözülmemeli");
  await yaz(sayfa, serbestYol[0]);
  const serbest = (await durum(sayfa)).zincir;
  assert.equal(serbest.length, 2);
  await sayfa.tap("#btnAna");
  assert.equal(await sayfa.textContent("#serbestDurum"), `Kaldığın bulmaca: ${serbest[0]} → ${serbestHedef} · 1 adım`);
  assert.equal(await sayfa.textContent("#btnSerbest"), "Devam et");
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");

  await sayfa.tap("#btnGunluk");
  s = await durum(sayfa);
  assert.deepEqual([s.mod, s.zincir], ["daily", gunluk], "günlükte kalınan yer kayboldu");
  await sayfa.tap("#btnAna");
  await sayfa.tap("#btnSerbest");
  s = await durum(sayfa);
  assert.deepEqual([s.mod, s.zincir], ["free", serbest], "serbest oyunda kalınan yer kayboldu");

  // Uygulama kapanıp açılınca ikisi de sürer
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.db && window.oyun.startWord);
  await anaEkran(sayfa);
  assert.deepEqual([await sayfa.textContent("#btnGunluk"), await sayfa.textContent("#btnSerbest")], ["Devam et", "Devam et"]);
  await sayfa.tap("#btnGunluk");
  assert.deepEqual((await durum(sayfa)).zincir, gunluk);
  await sayfa.tap("#btnAna");

  // Zorluk/uzunluk ana ekranda seçilir: seçim kaydedilir, bulmaca "Oyna" ile gelir
  const boy = serbest[0].length === 3 ? 4 : 3;
  await sayfa.tap(`#anaAyar [data-len="${boy}"]`);
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_uzunluk")), String(boy));
  assert.equal(await sayfa.getAttribute(`#anaAyar [data-len="${boy}"]`, "aria-pressed"), "true");
  assert.equal(await sayfa.textContent("#btnSerbest"), "Oyna", "başka uzunluk seçilince eski bulmaca sürdürülmez");
  assert.equal((await durum(sayfa)).ekran, "ana", "seçim oyunu kendiliğinden başlatmamalı");
  await sayfa.tap("#btnSerbest");
  s = await durum(sayfa);
  assert.deepEqual([s.mod, s.zincir.length, s.zincir[0].length], ["free", 1, boy]);
  assert.ok(await tasmaYok(sayfa));
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: çözülen bulmacada klavye kapanır; ana ekran sonucu ve geri sayımı gösterir", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const g = await durum(sayfa);
  const yol = enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord));
  for (const kelime of yol) await yaz(sayfa, kelime);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  let d = await durum(sayfa);
  assert.equal(d.bitti, true);
  assert.notEqual(d.odak, "giris", "çözülünce klavye kapanmalı");
  assert.ok(await sayfa.evaluate(() => document.getElementById("giris").disabled));
  assert.equal(await gorunur(sayfa, "#harfler"), false, "çözülen bulmacada harf şeridi görünmemeli");
  await sayfa.tap("#btnCloseModal");
  assert.notEqual((await durum(sayfa)).odak, "giris", "çözülmüş bulmacada klavye açılmamalı");
  await sayfa.tap("#btnAna");
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Çözüldü · ${yol.length} adım · en az ${yol.length}`);
  assert.ok(await gorunur(sayfa, "#gunlukSonraki"));
  assert.match(await sayfa.textContent("#anaGeriSayim"), /^\d\d:\d\d:\d\d$/);
  // Sonucu gör: çözüm tahtada durur, klavye açılmaz
  await sayfa.tap("#btnGunluk");
  d = await durum(sayfa);
  assert.deepEqual([d.ekran, d.bitti, d.zincir.length, d.odak === "giris"], ["oyun", true, yol.length + 1, false]);
  // Pencereden "Serbest Oyun"a geçince klavye açılır
  await sayfa.tap("#btnAna");
  await sayfa.tap("#btnSerbest");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.odak], ["free", false, "giris"]);
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: \"Nasıl oynanır?\" pencere olarak açılır; açıkken tahtaya yazılmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await anaEkran(sayfa);
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false, "yardım kapalıyken görünmemeli");
  await sayfa.tap("#btnAnaYardim");
  assert.ok(await gorunur(sayfa, "#nasil-oynanir"));
  const y = await kutu(sayfa, "#nasil-oynanir");
  assert.deepEqual([y.ust, y.sol, y.en, y.boy], [0, 0, 390, 844], "yardım ekranı kaplamalı");
  assert.equal(await gorunur(sayfa, "#ana"), false, "yardım açıkken alttaki ekran ekran okuyucuya kapalı olmalı");
  assert.match(await sayfa.textContent("#nasil-oynanir"), /telefonunun klavyesiyle yaz[\s\S]*Ç Ğ I İ Ö Ş Ü/);
  assert.deepEqual(await kucukHedefler(sayfa, "#btnYardimKapat"), []);
  assert.equal(await sayfa.evaluate(() => document.activeElement.id), "btnYardimKapat", "odak kapatma düğmesinde olmalı");
  await sayfa.tap("#btnYardimKapat");
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false);
  assert.ok(await gorunur(sayfa, "#ana"));

  // Oyundan: klavye kapanır, yazılan tuş tahtaya gitmez; "Anladım" oyuna ve klavyeye döndürür
  await oyunaGir(sayfa);
  await sayfa.tap("#btnHelp");
  assert.ok(await gorunur(sayfa, "#nasil-oynanir"));
  assert.notEqual((await durum(sayfa)).odak, "giris", "yardım açıkken klavye kapanmalı");
  await sayfa.keyboard.type("ab");
  assert.equal((await durum(sayfa)).tampon, "");
  // Enter odaktaki kapatma düğmesini çalıştırır; alttaki tahtaya kelime göndermez
  await sayfa.keyboard.press("Enter");
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false);
  assert.equal(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")), false, "yardım açıkken Enter kelime göndermemeli");
  await sayfa.tap("#btnHelp");
  await sayfa.tap('#nasil-oynanir a[href="#oyun"]');
  let d = await durum(sayfa);
  assert.deepEqual([await gorunur(sayfa, "#nasil-oynanir"), d.ekran, d.odak], [false, "oyun", "giris"]);
  assert.equal(await sayfa.evaluate(() => location.hash), "", "sayfa içi bağlantı adresi değiştirmemeli");
  // Escape de kapatır
  await sayfa.tap("#btnHelp");
  await sayfa.keyboard.press("Escape");
  d = await durum(sayfa);
  assert.deepEqual([await gorunur(sayfa, "#nasil-oynanir"), d.odak], [false, "giris"]);
  assert.ok(await tasmaYok(sayfa));
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: ses tercihi hatırlanır; dar ekranda taşma ve küçük dokunma hedefi yok", async () => {
  let { baglam, sayfa, kayit } = await arayuzSayfasi();
  await anaEkran(sayfa);
  assert.ok(await gorunur(sayfa, "#ana #btnMute"), "ses düğmesi ana ekranda olmalı");
  await sayfa.tap("#btnMute");
  await sayfa.waitForFunction(() => localStorage.getItem("sm_ses") === "0");
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.db && window.oyun.startWord);
  await anaEkran(sayfa);
  assert.deepEqual(await sayfa.evaluate(() => { const d = document.getElementById("btnMute"); return [d.classList.contains("muted"), d.getAttribute("aria-pressed")]; }),
                   [true, "true"], "sessiz tercihi yeniden açılışta kayboldu");
  await sayfa.tap("#btnMute");
  await sayfa.waitForFunction(() => localStorage.getItem("sm_ses") === null && !document.getElementById("btnMute").classList.contains("muted"));
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();

  // En dar iPhone (320 px) ve 5 harfli bulmaca
  for (const en of [320, 375]) {
    ({ baglam, sayfa, kayit } = await arayuzSayfasi({ secenek: { ...TELEFON, viewport: { width: en, height: 568 } }, kayitlar: { sm_uzunluk: "5" } }));
    await anaEkran(sayfa);
    assert.deepEqual(await kucukHedefler(sayfa, "#ana button, #ana a"), [], `${en} px: ana ekranda küçük dokunma hedefi`);
    assert.ok(await tasmaYok(sayfa), `${en} px: ana ekranda yatay taşma`);
    for (const mod of ["daily", "free"]) {
      await sayfa.tap(mod === "daily" ? "#btnGunluk" : "#btnSerbest");
      await sayfa.waitForFunction(() => document.activeElement.id === "giris");
      assert.deepEqual(await kucukHedefler(sayfa, "#harfler .harf, #oyun .icon-btn"), [], `${en} px: oyunda küçük dokunma hedefi`);
      assert.ok(await tasmaYok(sayfa), `${en} px: oyunda yatay taşma`);
      assert.ok(await sayfa.evaluate(() => { const m = document.getElementById("modAdi"); return m.scrollWidth <= m.clientWidth; }), `${en} px: mod adı kesiliyor`);
      await sayfa.tap("#btnAna");
    }
    assert.deepEqual(kayit.hatalar, []);
    await baglam.close();
  }
});

test("uygulama arayüzü: ipucu teklifi açıkken klavye kapanır, yazılan harf tahtaya gitmez", async () => {
  const { baglam, sayfa, bekle } = await gelirSayfasi();
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  await oyunaGir(sayfa);
  await sayfa.tap("#btnHint");                            // günün ücretsiz ipucu
  const g = await durum(sayfa);
  await yaz(sayfa, enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord))[0]);
  await sayfa.tap("#btnHint");                            // hak bitti: teklif penceresi
  await sayfa.waitForSelector("#offer:not(.hidden)");
  assert.notEqual((await durum(sayfa)).odak, "giris", "teklif açıkken klavye kapanmalı");
  await sayfa.keyboard.type("ab");
  assert.equal((await durum(sayfa)).tampon, "");
  await sayfa.tap("#btnCloseOffer");
  assert.equal((await durum(sayfa)).odak, "giris", "teklif kapanınca klavye geri gelmeli");
  // Ana ekrana dönünce açık pencere kalmaz
  await sayfa.tap("#btnHint");
  await sayfa.waitForSelector("#offer:not(.hidden)");
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  assert.equal(await sayfa.evaluate(() => document.getElementById("offer").classList.contains("hidden")), true);
  await baglam.close();
});
