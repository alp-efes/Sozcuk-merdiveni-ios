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
const SITE_ADRESI = "https://sözcükyolu.com/";
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
// Ana ekrandan oyuna
async function oyunaGir(sayfa, mod = "daily") {
  await anaEkran(sayfa);
  await sayfa.tap(mod === "daily" ? "#btnGunluk" : "#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
}
// Oyundan ana ekrana: başlıktaki menü → "Ana menüye dön"
async function anaya(sayfa) {
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#btnAna");
}
// Bağlı (fiziksel) klavyeyle yazar: harfler küçük gelir (app.js Türkçe kuralla büyütür), Enter gönderir.
// iPad ve Bluetooth klavyesinin yolu; ekran tuşlarıyla yazma için bas(). Playwright'ın keyboard.type'ı
// ç, ş, ğ, ı, ö, ü'yü keydown'suz yazar (app.js görmez): her tuşun keydown'u doğrudan gönderilir.
async function yaz(sayfa, kelime) {
  await sayfa.evaluate((tuslar) => {
    for (const key of tuslar) document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }, [...kelime.toLocaleLowerCase("tr-TR"), "Enter"]);
}
// Tuşun yerine dokunur (Playwright'ın "üstü açık mı" denetimi olmadan): pencere tuşu örtüyorsa dokunuş ona gider
async function tusaDokun(sayfa, harf) {
  const k = await sayfa.locator(`#keyboard .key[data-key="${harf}"]`).boundingBox();
  await sayfa.touchscreen.tap(k.x + k.width / 2, k.y + k.height / 2);
}
// Oyuncu gibi ekran klavyesinin tuşlarına dokunur, sonra Gönder'e basar
async function bas(sayfa, kelime, gonder = true) {
  for (const h of kelime) await sayfa.tap(`#keyboard .key[data-key="${h}"]`);
  if (gonder) await sayfa.tap("#btnGonder");
}
const durum = (sayfa) => sayfa.evaluate(() => ({ mod: oyun.mode, zincir: oyun.chain.slice(), tampon: oyun.buffer, bitti: oyun.over,
  ekran: document.body.dataset.ekran, odak: document.activeElement.id }));

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
    ekranKlavyesi: getComputedStyle(document.getElementById("keyboard")).display !== "none",
  }));
  assert.equal(d.mod, "daily");
  // Açılış ekranı ana ekrana geçer; oyun arkada gizlidir
  await anaEkran(sayfa);
  // Açılışta üç blok basamağa oturdu: her birinde hafif dokunuş
  assert.deepEqual(await cagrilar("dokunus"), Array(3).fill({ style: "LIGHT" }), "açılışta her blok oturunca hafif dokunuş");
  assert.equal(await sayfa.textContent("#gunlukBulmaca"), `${d.bas} → ${d.hedef}`);
  await goruntu("0-ana-ekran.png");
  // Paketteki Young Serif yüklenmeli (CSP font-src)
  assert.ok(await sayfa.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes("Young Serif") && f.status === "loaded");
  }), "Young Serif yazı tipi yüklenmedi");
  assert.equal(d.reklam, 0, "reklam alanı kalmış");
  assert.equal(d.izleme, "undefined", "analitik köprüsü tanımlı");
  assert.deepEqual(d.betikler, ["app.js", "uygulama.js", "yerel.js"]);
  // Sahip kararı (15 Kasım 2026): uygulamada oyunun kendi ekran klavyesi kullanılır
  assert.ok(d.ekranKlavyesi, "ekran klavyesi görünmeli");
  await oyunaGir(sayfa);
  await goruntu("1-gunun-bulmacasi.png");

  // Geçersiz hamle: kelimeyi değiştirmeden ekran tuşlarıyla gönder → reddedilir + hata titreşimi.
  // Her harf tuşunda hafif dokunuş (açılıştaki üç bloğun ardından)
  await bas(sayfa, d.bas);
  assert.deepEqual(await cagrilar("dokunus"), Array(3 + d.bas.length).fill({ style: "LIGHT" }), "ekran tuşunda hafif dokunuş");
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1, "değişmeyen kelime kabul edildi");
  assert.ok(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")));
  assert.deepEqual(await cagrilar("titresim"), [{ type: "ERROR" }]);
  await goruntu("2-gecersiz-hamle.png");
  for (const _ of d.bas) await sayfa.tap('#keyboard .key[data-key="BACK"]');   // reddedilen kelime satırda kalır
  assert.equal((await durum(sayfa)).tampon, "");
  const dokunusOnce = (await cagrilar("dokunus")).length;
  assert.equal(dokunusOnce, 3 + 2 * d.bas.length, "Sil tuşunda da hafif dokunuş");

  // Çözüm
  const yol = enKisaYol(d.bas, d.hedef);
  await yaz(sayfa, yol[0]);                                              // bağlı klavye: tuş titreşimi yok
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 2, "geçerli hamle eklenmedi");
  assert.equal((await cagrilar("dokunus")).length, dokunusOnce + 1, "kabul edilen kelimede hafif dokunuş");
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
  assert.ok(!text.includes("xn--"), `paylaşım metninde punycode var:\n${text}`);

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
  assert.doesNotMatch(gizlilik, /Plus/, "ilk sürüm Plus'suz");
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
  // Bloklar da yeniden düşmez: baştan yerinde
  assert.deepEqual(await sayfa.evaluate(() => [...document.querySelectorAll("#acilis .i-dus")].map((g) => getComputedStyle(g).animationName)),
                   ["none", "none", "none"], "sayfa dönüşünde açılış animasyonu oynamamalı");
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
  // "bilgi" satırı oyun ekranının ölçüsüdür (eylem sırası ekranın içinde, odak metin alanında değil), aşama değildir
  const bilgi = isaretler.filter((i) => i.startsWith("bilgi "));
  assert.equal(bilgi.length, 1);
  assert.match(bilgi[0], /^bilgi gorunen=844 tam=844 kayma=0 klavye=\d+-\d+ eylem=\d+ odak=-$/);
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

// Mağaza modu (simulator.sh ... magaza): betik sayfadan önce yüklenir, saat sabitlenir. Telefonun
// klavyesi tarayıcıda yok; bir metin alanı odak alırsa görünen alanı kısaltmak onu taklit eder.
test("mağaza modu: sıra ana, hamle, cozum, gunluk, nasil; telefonun klavyesi hiçbir ekranda açılmaz", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  await baglam.route("**/onay-*.txt", (r) => r.fulfill({ status: 200, body: "" }));
  await baglam.addInitScript(() => {
    Object.defineProperty(window.visualViewport, "height",
      { get: () => innerHeight - (document.activeElement?.matches("input, textarea, [contenteditable]") ? 300 : 0) });
  });
  await baglam.addInitScript({ content: "window.SM_MAGAZA = true;\n" + readFileSync(OTOMATIK, "utf8") });
  const sayfa = await baglam.newPage();
  const isaretler = [];
  sayfa.on("console", (m) => { const e = m.text().match(/^SM-OTOMATIK: (.*)$/); if (e) isaretler.push(e[1]); });
  const son = sayfa.waitForEvent("console", { predicate: (m) => /^SM-OTOMATIK: (nasil|hata)/.test(m.text()), timeout: 60000 });
  await sayfa.goto(ADRES);
  await son;
  assert.deepEqual(isaretler.filter((i) => !i.startsWith("bilgi ")), ["ana", "hamle", "cozum", "gunluk", "nasil"]);
  assert.match(await sayfa.evaluate(() => new Date(Date.now() + 3 * 3600e3).toISOString()), /^2026-11-14T/);   // ertesi gün
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
  if (ayar.haklar) localStorage.setItem("sm_haklar", JSON.stringify(ayar.haklar));   // sayılı haklar (geri al, ipucu)
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
          // Gerçek eklenti gibi: gösterim hatası olayla bildirilir, söz çözülmez
          if (window.__odul === "olay") return setTimeout(() => window.__yay("onRewardedVideoAdFailedToShow", { code: 3 }), 20);
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
  // Çözüm penceresi yalnızca oyun ekranında açılır (ana ekranın üstünde açılmaz)
  if (await sayfa.evaluate(() => document.body.dataset.ekran) !== "oyun") await oyunaGir(sayfa, "free");
  const [bas, hedef] = await sayfa.evaluate(() => { oyun.hideModal(); oyun.newGame("free"); return [oyun.startWord, oyun.targetWord]; });
  await sayfa.evaluate((yol) => { for (const k of yol) { for (const h of k) oyun.pressKey(h); oyun.pressKey("ENTER"); } }, enKisaYol(bas, hedef));
  await sayfa.waitForFunction(() => oyun.over);
}
const pencereAcik = (sayfa) => sayfa.waitForSelector("#modal:not(.hidden)");
const pencereKapat = (sayfa) => sayfa.tap("#btnCloseModal");

async function gelirSayfasi(ayar = {}) {
  const baglam = await tarayici.newContext(TELEFON);
  await baglam.addInitScript(SAHTE_KOPRU, ayar);
  // Bayraklar yerel.js'te sabittir: PLUS_ACIK yayında false (Plus testleri için burada açılır; kapalı hâl
  // `plusKapali: true` ile), REKLAM_YOKSA_ODUL yayında true (`odulYoksaYok: true` ile kapatılır).
  await baglam.route("**/yerel.js", async (r) => {
    let kaynak = readFileSync(join(WWW, "yerel.js"), "utf8");
    for (const [ad, eski, yeni] of [["PLUS_ACIK", false, !ayar.plusKapali], ["REKLAM_YOKSA_ODUL", true, !ayar.odulYoksaYok]]) {
      assert.ok(kaynak.includes(`const ${ad} = ${eski};`), `yerel.js'te ${ad} bayrağı bulunamadı`);
      kaynak = kaynak.replace(`const ${ad} = ${eski};`, `const ${ad} = ${yeni};`);
    }
    await r.fulfill({ contentType: "text/javascript", body: kaynak });
  });
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
  assert.equal(await dene("hata", "ipucu"), true, "gösterilemedi: reklam yoksa ödül (REKLAM_YOKSA_ODUL)");
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

test("gelir kancası: reklam yüklenemezse ve REKLAM_YOKSA_ODUL kapalıysa ödüllü false, geçiş reklamı gösterilmez, oyun takılmaz", async () => {
  const { baglam, sayfa, say, bekle } = await gelirSayfasi({ yuklemeHata: true, odulYoksaYok: true });
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareInterstitial"));
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  await sayfa.evaluate(async () => { await window.SozcukGelir.gecisReklami("cozum"); await window.SozcukGelir.gecisReklami("cozum"); });
  assert.equal(await say("showRewardVideoAd") + await say("showInterstitial"), 0);
  await baglam.close();
});

test("gelir kancası: REKLAM_YOKSA_ODUL açıkken yüklenemeyen ya da gösterilemeyen ödüllü reklam +1 verir; yarıda kapatılan vermez", async () => {
  // Yüklenemedi (AdMob henüz onaylı değil): oyuncu takılmasın, reklam gösterilmez
  let g = await gelirSayfasi({ yuklemeHata: true });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true, "yüklenemedi: ödül verilmeli");
  assert.equal(await g.say("showRewardVideoAd"), 0);
  await g.baglam.close();
  // Yüklendi ama yarıda kapatıldı: ödül yok
  g = await gelirSayfasi();
  await g.bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await g.sayfa.evaluate(() => { window.__odul = "erken"; return window.SozcukGelir.odulluReklam("ipucu"); }), false, "yarıda kapatıldı: ödül yok");
  await g.baglam.close();
  // Gösterim hatası olayla gelirse (söz reddi değil) de +1; bayrak kapalıyken yok
  g = await gelirSayfasi();
  await g.bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await g.sayfa.evaluate(() => { window.__odul = "olay"; return window.SozcukGelir.odulluReklam("ipucu"); }), true, "FailedToShow olayı: ödül verilmeli");
  await g.baglam.close();
  g = await gelirSayfasi({ odulYoksaYok: true });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await g.sayfa.evaluate(() => { window.__odul = "olay"; return window.SozcukGelir.odulluReklam("ipucu"); }), false, "bayrak kapalı: FailedToShow olayında ödül yok");
  await g.baglam.close();
  // Bayrak kapalıyken yüklenemeyen reklam ödül vermez
  g = await gelirSayfasi({ yuklemeHata: true, odulYoksaYok: true });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false, "bayrak kapalı: ödül yok");
  await g.baglam.close();
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
  g = await gelirSayfasi({ odulYoksaYok: true, bilgi: gerekli, formSonrasi: { status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" } });
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), false);
  assert.deepEqual([await g.say("initialize"), await g.say("requestTrackingAuthorization")], [0, 0]);
  await g.baglam.close();
  // Form hatası: reklam yok, oyun etkilenmez
  g = await gelirSayfasi({ odulYoksaYok: true, bilgi: gerekli, formHata: true });
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

test("Plus kapalıyken (yayındaki hâl) Plus'tan hiç söz edilmez, StoreKit sorulmaz, reklam sürer", async () => {
  const { baglam, sayfa, adlar, bekle } = await gelirSayfasi({ plusKapali: true, onbellekPlus: true, magazaPlus: true, haklar: { geriAl: 0, ipucu: 0, gun: "2000-01-01" } });
  assert.deepEqual(await sayfa.evaluate(() => Object.keys(window.SozcukGelir).sort()), ["gecisReklami", "odulluReklam", "plusMu"]);
  assert.equal(await sayfa.evaluate(() => window.SozcukGelir.plusMu()), false, "önbellekte Plus olsa da kapalıyken Plus yok");
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_plus")), null);
  await bekle(() => window.__cagri.some((c) => c[0] === "initialize"));
  const ad = await adlar();
  for (const yok of ["durum", "fiyat", "satinAl", "geriYukle"]) assert.ok(!ad.includes(yok), `Plus kapalıyken ${yok} çağrılmamalı`);
  assert.equal(await gorunur(sayfa, "#plusBox"), false, "ana ekranda Plus kartı görünmemeli");
  // Hak bitince teklif: yalnızca reklam
  await oyunaGir(sayfa, "free");
  await sayfa.tap("#btnHint");
  await sayfa.waitForSelector("#offer:not(.hidden)");
  assert.equal(await gorunur(sayfa, "#btnOfferPlus"), false);
  assert.doesNotMatch(await sayfa.textContent("#offerText"), /Plus/);
  assert.doesNotMatch(await sayfa.textContent("#hakKurali"), /Plus/);
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
  let g = await gelirSayfasi({ bilgiHataSayisi: 1, odulYoksaYok: true });
  await g.bekle(() => window.__cagri.some((c) => c[0] === "requestConsentInfo"));
  assert.equal(await g.sayfa.evaluate(() => window.SozcukGelir.odulluReklam("ipucu")), true, "ikinci denemede başarılı");
  assert.equal(await g.say("requestConsentInfo"), 2);
  assert.equal(await g.say("initialize"), 1);
  await g.baglam.close();
  const hayir = { status: "REQUIRED", isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" };
  g = await gelirSayfasi({ odulYoksaYok: true, bilgi: hayir, formSonrasi: { status: "REQUIRED", canRequestAds: false, privacyOptionsRequirementStatus: "REQUIRED" } });
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

/* ---------- Uygulama arayüzü (web/uygulama.js): açılış, ana ekran, ekran klavyesi ----------
 * Arayüz Capacitor köprüsü gerektirmez. Yazma ekran tuşlarına dokunarak (bas) ya da bağlı
 * klavye olaylarıyla (yaz). iOS'taki gerçek yerleşim simülatörde ölçülür (araclar/otomatik-oyna.js). */

async function arayuzSayfasi({ secenek = TELEFON, kayitlar = {} } = {}) {
  const baglam = await tarayici.newContext(secenek);
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

// Açılış animasyonu (sahip isteği, 13 Kasım 2026): bloklar alttan üste basamağa düşer.
// Ana ekranın açıldığı an (performance.now) init betiğiyle kaydedilir. sozlukMs: words.json
// sayfa açılışından bu kadar sonra verilir.
async function acilisSayfasi({ sozlukMs = 0, secenek = {} } = {}) {
  const baglam = await tarayici.newContext({ ...TELEFON, ...secenek });
  await baglam.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.dataset.ekran === "ana" && window.__anaMs === undefined) window.__anaMs = performance.now();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-ekran"] });
  });
  const t0 = Date.now();
  await baglam.route("**/words.json", async (r) => {
    const kalan = sozlukMs - (Date.now() - t0);
    if (kalan > 0) await new Promise((coz) => setTimeout(coz, kalan));
    await r.continue();
  });
  const { sayfa, kayit } = await ac(baglam);
  return { baglam, sayfa, kayit };
}
// Bloklar: hangi blok, ekrandaki yeri, animasyonu ve gecikmesi (i-dus-1 → 3 sırasıyla)
const bloklar = (sayfa) => sayfa.evaluate(() => [...document.querySelectorAll("#acilis .i-dus")]
  .sort((a, b) => a.className.baseVal.localeCompare(b.className.baseVal))
  .map((g) => ({ renk: g.querySelector("rect:last-child").getAttribute("class"),
    ust: Math.round(g.querySelector("rect:last-child").getAttribute("y")),
    animasyon: getComputedStyle(g).animationName, gecikme: getComputedStyle(g).animationDelay })));

test("uygulama arayüzü: açılışta bloklar alttan üste birer birer düşer; ana ekran animasyon bitince gelir", async () => {
  const { baglam, sayfa, kayit } = await acilisSayfasi();
  const b = await bloklar(sayfa);
  assert.deepEqual(b.map((x) => x.renk), ["i-hedef", "i-yesil", "i-blok"], "düşüş sırası: kiremit, yeşil, krem");
  assert.ok(b[0].ust > b[1].ust && b[1].ust > b[2].ust, "sıra alttan üste olmalı");
  for (const x of b) assert.equal(x.animasyon, "acilisDus, acilisOtur", `${x.renk} düşme animasyonuyla başlamalı`);
  const gecikme = b.map((x) => parseFloat(x.gecikme));
  assert.ok(gecikme[0] < gecikme[1] && gecikme[1] < gecikme[2], `bloklar birer birer düşmeli: ${b.map((x) => x.gecikme)}`);
  // Sözlük hazırken bile ana ekran son blok oturmadan gelmez; toplam açılış 3 sn'nin altında
  await anaEkran(sayfa);
  const { ana, bitis, sure } = await sayfa.evaluate(() => {
    // Yalnızca blok animasyonları: ana ekran açılınca .acilis'in solma geçişi de listeye girer
    const a = document.getElementById("acilis").getAnimations({ subtree: true })
      .filter((x) => ["acilisDus", "acilisOtur"].includes(x.animationName));
    const son = (x) => x.effect.getComputedTiming().endTime;   // gecikme + süre; ilk çizimden bağımsız
    return { ana: window.__anaMs, bitis: Math.max(...a.map((x) => x.startTime + son(x))), sure: Math.max(...a.map(son)) };
  });
  // Sahip geri bildirimi (#14): sekmeli oturuş, üç çarpma arka arkaya; toplam ~1,6 sn'yi geçmez
  assert.ok(sure >= 1450 && sure <= 1650, `animasyon ~1,5–1,6 sn sürmeli (${Math.round(sure)} ms)`);
  // Ritim: her blok öncekinin sekmesi bittikten hemen sonra çarpar; basamak o anda iner
  const ritim = await sayfa.evaluate(() => {
    const son = (a) => a.startTime + a.effect.getComputedTiming().endTime;
    const anim = (g, ad) => g.getAnimations().find((a) => a.animationName === ad);
    return [1, 2, 3].map((n) => {
      const g = document.querySelector(`#acilis .i-dus-${n}`);
      const bas = document.querySelector(`#acilis .i-basamak-${n}`).getAnimations()[0];
      return { carpma: son(anim(g, "acilisDus")), otur: son(anim(g, "acilisOtur")), basamak: bas.startTime + bas.effect.getTiming().delay };
    });
  });
  for (let n = 0; n < 3; n++) {
    assert.ok(Math.abs(ritim[n].basamak - ritim[n].carpma) < 5, "basamak çarpma anında inmeli");
    if (n) assert.ok(ritim[n].carpma >= ritim[n - 1].otur && ritim[n].carpma - ritim[n - 1].otur <= 120,
      `blok ${n + 1} öncekinin oturmasından hemen sonra çarpmalı (${JSON.stringify(ritim)})`);
  }
  assert.ok(ana >= bitis, `ana ekran animasyon bitmeden açıldı (${Math.round(ana)} < ${Math.round(bitis)})`);
  assert.ok(ana < 3000, `açılış 3 sn'den uzun sürdü (${Math.round(ana)} ms)`);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: sözlük geç gelirse açılış onu bekler, gelince hemen geçer", async () => {
  const { baglam, sayfa, kayit } = await acilisSayfasi({ sozlukMs: 2500 });
  await anaEkran(sayfa);
  const ana = await sayfa.evaluate(() => window.__anaMs);
  assert.ok(ana >= 2400, `sözlük gelmeden ana ekran açıldı (${Math.round(ana)} ms)`);
  assert.ok(ana < 3500, `sözlük geldikten sonra açılış oyalandı (${Math.round(ana)} ms)`);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: hareketi azalt açıkken bloklar baştan yerinde, animasyon yok", async () => {
  const { baglam, sayfa, kayit } = await acilisSayfasi({ secenek: { reducedMotion: "reduce" } });
  const b = await bloklar(sayfa);
  assert.deepEqual(b.map((x) => x.animasyon), ["none", "none", "none"]);
  assert.equal(await sayfa.evaluate(() => document.getElementById("acilis").getAnimations({ subtree: true })
    .filter((a) => a.animationName !== "acilisAd").length), 0, "hareketi azaltta blok ya da basamak animasyonu oynamamalı");
  assert.deepEqual(await sayfa.evaluate(() => [...document.querySelectorAll("#acilis .i-dus")]
    .map((g) => [getComputedStyle(g).opacity, getComputedStyle(g).transform])), Array(3).fill(["1", "none"]), "bloklar yerinde olmalı");
  await anaEkran(sayfa);
  const ana = await sayfa.evaluate(() => window.__anaMs);
  assert.ok(ana >= 800 && ana < 1500, `hareketsiz açılış en az 0,8 sn, fazlası değil (${Math.round(ana)} ms)`);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: ekran klavyesi — Türkçe Q dizilişi, İ/I ayrımı, Sil, Gönder; telefonun klavyesi açılmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_uzunluk: "5", sm_zorluk: "zor" } });
  await oyunaGir(sayfa, "free");
  // Sahip kararı (15 Kasım 2026): Türkçe Q, Sil son sıranın sağ ucunda; Gönder ayrı eylem sırasında
  const d = await sayfa.evaluate(() => ({
    siralar: [...document.querySelectorAll("#keyboard .kb-row")].map((r) => [...r.querySelectorAll(".key")].map((k) => k.dataset.key)),
    kapali: [...document.querySelectorAll("#keyboard .key:disabled")].map((k) => k.dataset.key),
    adlar: Object.fromEntries([...document.querySelectorAll('#keyboard .key[data-key="I"], #keyboard .key[data-key="İ"], #keyboard .key[data-key="BACK"]')]
      .map((k) => [k.dataset.key, k.getAttribute("aria-label")])),
    hepsiDugme: [...document.querySelectorAll("#keyboard .key, #eylemler > *")].every((k) => k.tagName === "BUTTON" && k.type === "button"),
    // iOS klavyesini açabilecek hiçbir alan yok
    metinAlani: [...document.querySelectorAll("input, textarea, select, [contenteditable]")].map((e) => e.outerHTML),
  }));
  assert.deepEqual(d.siralar, [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
    ["Z", "X", "C", "V", "B", "N", "M", "Ö", "Ç", "BACK"],
  ]);
  assert.deepEqual(d.kapali, ["Q", "W", "X"], "Türkçede olmayan harfler basılmamalı");
  assert.deepEqual(d.adlar, { I: "Noktasız I", "İ": "Noktalı İ", BACK: "Sil" });
  assert.ok(d.hepsiDugme, "tuşlar button olmalı");
  assert.deepEqual(d.metinAlani, [], "telefonun klavyesini açacak alan olmamalı");
  assert.equal(await sayfa.getAttribute("#btnGonder", "aria-label") ?? await sayfa.textContent("#btnGonder"), "Gönder");

  // Noktasız I ve noktalı İ ayrı tuşlardır
  await bas(sayfa, "Iİ", false);
  assert.equal((await durum(sayfa)).tampon, "Iİ");
  await sayfa.tap('#keyboard .key[data-key="Q"]', { force: true });
  assert.equal((await durum(sayfa)).tampon, "Iİ", "Q yazılmamalı");
  // Sil
  await sayfa.tap('#keyboard .key[data-key="BACK"]');
  assert.equal((await durum(sayfa)).tampon, "I");
  await sayfa.tap('#keyboard .key[data-key="BACK"]');
  assert.equal((await durum(sayfa)).tampon, "");
  // Dokunmak odağı bir metin alanına vermez (iOS klavyesi açılmaz)
  assert.ok(await sayfa.evaluate(() => !document.activeElement.matches("input, textarea, [contenteditable]")));

  // Gönder: sözlükte olmayan kelime oyuncuyu suçlamayan iletiyle reddedilir, kelime satırda kalır
  await bas(sayfa, "ÇIİŞÜ");
  assert.equal(await sayfa.textContent("#toast"), "Sözlükte yok: ÇIİŞÜ");
  assert.equal((await durum(sayfa)).zincir.length, 1);
  for (let i = 0; i < 5; i++) await sayfa.tap('#keyboard .key[data-key="BACK"]');
  // Eksik kelime gönderilmez
  await bas(sayfa, "A");
  assert.equal(await sayfa.textContent("#toast"), "Harf eksik");
  await sayfa.tap('#keyboard .key[data-key="BACK"]');
  // Geçerli kelime ekran tuşlarıyla kabul edilir
  const { zincir: [ilk], } = await durum(sayfa);
  const [sonraki] = enKisaYol(ilk, await sayfa.evaluate(() => oyun.targetWord));
  await bas(sayfa, sonraki);
  assert.deepEqual((await durum(sayfa)).zincir, [ilk, sonraki]);

  // Bağlı (fiziksel) klavye de yazar: Türkçe kuralla ı → I, i → İ; Backspace siler
  await sayfa.evaluate(() => { for (const key of ["ı", "i"]) document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  assert.equal((await durum(sayfa)).tampon, "Iİ");
  await sil(sayfa);
  assert.equal((await durum(sayfa)).tampon, "");
  assert.ok(await tasmaYok(sayfa));
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: Gönder ortada, Geri al ve İpucu iki yanında en altta; başlıkta menü, mod adı ve yardım", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const d = await sayfa.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const gorunen = (e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
    return {
      eylem: [...document.getElementById("eylemler").children].map((e) => e.id),
      baslik: [...document.querySelectorAll(".header button, .header a, .header h2")].filter(gorunen).map((e) => e.id),
      klavyeAlt: r("#keyboard").bottom, eylemUst: r("#eylemler").top, eylemAlt: r("#eylemler").bottom,
      gonder: r("#btnGonder"), geri: r("#btnUndo"), ipucu: r("#btnHint"),
      rozet: [...document.querySelectorAll("#eylemler .hak")].map((h) => h.textContent),
      yuvarlak: ["btnUndo", "btnHint"].map((id) => getComputedStyle(document.getElementById(id)).borderRadius),
      harfBoy: Math.min(...[...document.querySelectorAll("#keyboard .key")].map((k) => k.getBoundingClientRect().height)),
    };
  });
  assert.deepEqual(d.eylem, ["btnUndo", "btnGonder", "btnHint"]);
  assert.deepEqual(d.baslik, ["btnMenu", "modAdi", "btnHelp"]);
  assert.ok(d.eylemUst >= d.klavyeAlt - 1 && d.eylemAlt <= 844, "eylem sırası klavyenin altında, ekranın içinde olmalı");
  assert.ok(d.gonder.height >= 52 && d.gonder.width >= 160, `Gönder büyük olmalı (${d.gonder.width}×${d.gonder.height})`);
  assert.ok(d.geri.right <= d.gonder.left && d.ipucu.left >= d.gonder.right, "Geri al solda, İpucu sağda");
  for (const b of [d.geri, d.ipucu]) assert.ok(b.width >= 44 && b.height >= 44 && Math.abs(b.width - b.height) < 1);
  assert.deepEqual(d.yuvarlak, ["50%", "50%"]);
  assert.deepEqual(d.rozet, ["5", "5"], "kalan hak rozetleri düğmelerde kalmalı");
  assert.ok(d.harfBoy >= 44, `harf tuşu en az 44 px yüksek olmalı (${d.harfBoy})`);
  // Gönder fiziksel Enter'la aynı işi yapar; Geri al eylem sırasından çalışır
  const { zincir: [ilk] } = await durum(sayfa);
  const [sonraki] = enKisaYol(ilk, await sayfa.evaluate(() => oyun.targetWord));
  await bas(sayfa, sonraki);
  assert.equal((await durum(sayfa)).zincir.length, 2);
  await sayfa.tap("#btnUndo");
  assert.equal((await durum(sayfa)).zincir.length, 1);
  assert.equal(await sayfa.textContent("#btnUndo .hak"), "4");
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: üç ekran boyunda merdiven, klavye ve eylem sırası kaydırmasız sığar; uzun merdiven kendi içinde kayar", async () => {
  for (const [en, boy] of [[375, 667], [390, 844], [430, 932]]) {
    const { baglam, sayfa, kayit } = await arayuzSayfasi({ secenek: { ...TELEFON, viewport: { width: en, height: boy } } });
    await oyunaGir(sayfa);
    const olc = () => sayfa.evaluate(() => {
      const r = (s) => { const k = document.querySelector(s).getBoundingClientRect(); return { ust: Math.round(k.top), alt: Math.round(k.bottom) }; };
      const son = document.querySelector("#ladder .rung:last-child")?.getBoundingClientRect();
      return { kabuk: r("#oyun"), baslik: r(".header"), giris: r("#inputRow"), hedef: r("#targetWord"), bas: r("#startWord"),
        merdiven: r("#steps"), klavye: r("#keyboard"), eylem: r("#eylemler"), son: son && { ust: Math.round(son.top), alt: Math.round(son.bottom) },
        tasma: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight || scrollY !== 0 };
    });
    let o = await olc();
    const ad = `${en}×${boy}`;
    assert.deepEqual([o.kabuk.ust, o.kabuk.alt, o.tasma], [0, boy, false], `${ad}: oyun ekranı tam sığmalı`);
    assert.ok(o.baslik.ust >= 0 && o.eylem.alt <= boy, `${ad}: başlık ve eylem sırası görünmeli`);
    assert.ok(o.bas.ust >= o.baslik.alt && o.hedef.alt <= o.klavye.ust, `${ad}: başlangıç ve hedef klavyenin üstünde`);
    assert.ok(o.giris.ust >= o.merdiven.ust && o.giris.alt <= o.merdiven.alt, `${ad}: giriş satırı görünmeli`);

    // Uzun merdiven: eski basamaklar yukarı kayar; son kelime, giriş satırı ve hedef görünür kalır
    const { zincir: [bas0] } = await durum(sayfa);
    const [bir] = enKisaYol(bas0, await sayfa.evaluate(() => oyun.targetWord));
    for (let i = 0; i < 5; i++) { await yaz(sayfa, bir); await yaz(sayfa, bas0); }      // geri dönmek serbesttir
    assert.equal((await durum(sayfa)).zincir.length, 11);
    await sayfa.waitForTimeout(400);                    // basamakların giriş animasyonu bitsin
    o = await olc();
    assert.deepEqual([o.kabuk.ust, o.kabuk.alt, o.tasma], [0, boy, false], `${ad}: uzun merdivende ekran kaymamalı`);
    assert.ok(o.giris.ust >= o.merdiven.ust && o.giris.alt <= o.merdiven.alt, `${ad}: uzun merdivende giriş satırı görünmüyor`);
    assert.ok(o.son.ust >= o.merdiven.ust - 1 && o.son.alt <= o.giris.ust, `${ad}: uzun merdivende son kelime görünmüyor`);
    assert.ok(o.hedef.alt <= o.klavye.ust, `${ad}: hedef klavyenin üstünde kalmalı`);
    if (process.env.EKRAN_DIZINI) await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, `7-uzun-merdiven-${en}x${boy}.png`) });
    assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
    await baglam.close();
  }
});

test("uygulama arayüzü: ana ekran ⇄ oyun; her modun oyunu ayrı saklanır, yeniden açılışta sürer", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_zorluk: "zor" } });
  await oyunaGir(sayfa);
  assert.equal(await sayfa.textContent("#modAdi"), "Günün Bulmacası");
  assert.equal(await gorunur(sayfa, "#ana"), false, "oyunda ana ekran görünmemeli");
  // Sekmeler ve oyun içi ayar satırı uygulamada yok (ana ekrandadır)
  for (const s of [".mode-tabs", "#freeSettings", ".brand-game", "#dailyTimer"]) assert.equal(await gorunur(sayfa, s), false, `${s} görünmemeli`);
  const g = await durum(sayfa);
  const gunlukYol = enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord));
  await yaz(sayfa, gunlukYol[0]);
  const gunluk = (await durum(sayfa)).zincir;
  assert.equal(gunluk.length, 2);

  // Ana ekrana dönüş: başlıktaki menü → "Ana menüye dön"
  assert.equal(await sayfa.getAttribute("#btnMenu", "aria-label"), "Menü");
  await anaya(sayfa);
  assert.equal((await durum(sayfa)).ekran, "ana");
  assert.equal(await gorunur(sayfa, "#oyun"), false);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");
  assert.match(await sayfa.textContent("#gunlukDurum"), /^1 adım attın · en az \d+$/);

  // Serbest oyun: günlükte kalınan yer silinmez
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
  assert.equal(await sayfa.textContent("#modAdi"), "Serbest Oyun");
  let s = await durum(sayfa);
  assert.equal(s.mod, "free");
  const serbestHedef = await sayfa.evaluate(() => oyun.targetWord);
  const serbestYol = enKisaYol(s.zincir[0], serbestHedef);
  assert.ok(serbestYol.length > 1, "zor bulmaca tek adımda çözülmemeli");
  await yaz(sayfa, serbestYol[0]);
  const serbest = (await durum(sayfa)).zincir;
  assert.equal(serbest.length, 2);
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#serbestDurum"), `Kaldığın bulmaca: ${serbest[0]} → ${serbestHedef} · 1 adım`);
  assert.equal(await sayfa.textContent("#btnSerbest"), "Devam et");
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");

  await sayfa.tap("#btnGunluk");
  s = await durum(sayfa);
  assert.deepEqual([s.mod, s.zincir], ["daily", gunluk], "günlükte kalınan yer kayboldu");
  await anaya(sayfa);
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
  await anaya(sayfa);

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

test("uygulama arayüzü: çözülen bulmacada tuşlar yazmaz; ana ekran sonucu ve geri sayımı gösterir", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const g = await durum(sayfa);
  const yol = enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord));
  for (const kelime of yol) await yaz(sayfa, kelime);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  let d = await durum(sayfa);
  assert.equal(d.bitti, true);
  await sayfa.tap("#btnCloseModal");
  await bas(sayfa, "A", false);
  assert.equal((await durum(sayfa)).tampon, "", "çözülmüş bulmacada tuş yazmamalı");
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Çözüldü · ${yol.length} adım · en az ${yol.length}`);
  assert.ok(await gorunur(sayfa, "#gunlukSonraki"));
  assert.match(await sayfa.textContent("#anaGeriSayim"), /^\d\d:\d\d:\d\d$/);
  // Sonucu gör: çözüm tahtada durur
  await sayfa.tap("#btnGunluk");
  d = await durum(sayfa);
  assert.deepEqual([d.ekran, d.bitti, d.zincir.length], ["oyun", true, yol.length + 1]);
  // Ana ekrandan serbest oyuna geçince yeni bulmaca yazılabilir
  await anaya(sayfa);
  await sayfa.tap("#btnSerbest");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti], ["free", false]);
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
  assert.match(await sayfa.textContent("#nasil-oynanir"), /alttaki klavyeyle yaz, Gönder'e bas/);
  assert.doesNotMatch(await sayfa.textContent("#nasil-oynanir"), /telefonunun klavyesi|şerit/);
  assert.deepEqual(await kucukHedefler(sayfa, "#btnYardimKapat"), []);
  assert.equal(await sayfa.evaluate(() => document.activeElement.id), "btnYardimKapat", "odak kapatma düğmesinde olmalı");
  await sayfa.tap("#btnYardimKapat");
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false);
  assert.ok(await gorunur(sayfa, "#ana"));

  // Oyundan: yazılan tuş tahtaya gitmez; "Anladım" oyuna döndürür
  await oyunaGir(sayfa);
  await sayfa.tap("#btnHelp");
  assert.ok(await gorunur(sayfa, "#nasil-oynanir"));
  await sayfa.keyboard.type("ab");
  assert.equal((await durum(sayfa)).tampon, "");
  // Enter odaktaki kapatma düğmesini çalıştırır; alttaki tahtaya kelime göndermez
  await sayfa.keyboard.press("Enter");
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false);
  assert.equal(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")), false, "yardım açıkken Enter kelime göndermemeli");
  await sayfa.tap("#btnHelp");
  await sayfa.tap('#nasil-oynanir a[href="#oyun"]');
  let d = await durum(sayfa);
  assert.deepEqual([await gorunur(sayfa, "#nasil-oynanir"), d.ekran], [false, "oyun"]);
  assert.equal(await sayfa.evaluate(() => location.hash), "", "sayfa içi bağlantı adresi değiştirmemeli");
  // Escape de kapatır
  await sayfa.tap("#btnHelp");
  await sayfa.keyboard.press("Escape");
  assert.equal(await gorunur(sayfa, "#nasil-oynanir"), false);
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
      await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
      assert.deepEqual(await kucukHedefler(sayfa, "#oyun .icon-btn, #eylemler button"), [], `${en} px: oyunda küçük dokunma hedefi`);
      assert.ok(await tasmaYok(sayfa), `${en} px: oyunda yatay taşma`);
      assert.ok(await sayfa.evaluate(() => { const m = document.getElementById("modAdi"); return m.scrollWidth <= m.clientWidth; }), `${en} px: mod adı kesiliyor`);
      await anaya(sayfa);
    }
    assert.deepEqual(kayit.hatalar, []);
    await baglam.close();
  }
});

test("uygulama arayüzü: ipucu teklifi açıkken ne ekran tuşu ne bağlı klavye tahtaya yazar", async () => {
  const { baglam, sayfa, bekle } = await gelirSayfasi({ haklar: { geriAl: 5, ipucu: 1, gun: "" } });
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  await oyunaGir(sayfa);
  await sayfa.tap("#btnHint");                            // son ipucu hakkı
  const g = await durum(sayfa);
  await yaz(sayfa, enKisaYol(g.zincir[0], await sayfa.evaluate(() => oyun.targetWord))[0]);
  await sayfa.tap("#btnHint");                            // hak bitti: teklif penceresi
  await sayfa.waitForSelector("#offer:not(.hidden)");
  await sayfa.keyboard.type("ab");
  await tusaDokun(sayfa, "A");                           // pencerenin perdesi tuşu örter
  assert.equal((await durum(sayfa)).tampon, "");
  await sayfa.tap("#btnCloseOffer");
  await bas(sayfa, "A", false);
  assert.equal((await durum(sayfa)).tampon, "A", "teklif kapanınca tuşlar yeniden yazmalı");
  // Ana ekrana dönünce açık pencere kalmaz
  await sayfa.tap("#btnHint");
  await sayfa.waitForSelector("#offer:not(.hidden)");
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  assert.equal(await sayfa.evaluate(() => document.getElementById("offer").classList.contains("hidden")), true);
  await baglam.close();
});

/* ---------- Geri al ve Sonucu göster (site PR'ı: geri-al-sonuc) ---------- */

// Başlangıç ile bir komşusu arasında gidip gelerek (geçerli hamleler) adım sayısını istenene çıkarır
async function gezin(sayfa, adimSayisi) {
  const [bas, hedef, komsu] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord,
    [...oyun.dict].find((w) => w !== oyun.targetWord && [...w].filter((c, i) => c !== oyun.startWord[i]).length === 1)]);
  while ((await sayfa.evaluate(() => oyun.chain.length - 1)) < adimSayisi) {
    await yaz(sayfa, (await sayfa.evaluate(() => oyun.currentWord)) === bas ? komsu : bas);
  }
  return hedef;
}

test("uygulama arayüzü: Geri al ve Sonucu göster görünür; onay açıkken tuşlar yazmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa, "daily");
  const [bas, hedef, en] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
  assert.ok(await gorunur(sayfa, "#btnUndo"), "Geri al düğmesi uygulamada görünmüyor");
  assert.equal(await sayfa.evaluate(() => document.getElementById("btnUndo").disabled), true, "başlangıçta Geri al devre dışı olmalı");
  assert.equal(await gorunur(sayfa, "#btnShowResult"), false, "eşik aşılmadan Sonucu göster görünmemeli");
  await yaz(sayfa, enKisaYol(bas, hedef)[0]);
  await sayfa.tap("#btnUndo");
  const d = await durum(sayfa);
  assert.equal(d.zincir.length, 1, "Geri al zinciri kısaltmalı");
  // Eşik aşılınca Sonucu göster görünür, klavyenin üstünde ekranın içindedir
  await gezin(sayfa, en + 1);
  assert.ok(await gorunur(sayfa, "#btnShowResult"), "Sonucu göster görünmüyor");
  const k = await kutu(sayfa, "#btnShowResult");
  assert.ok(k.alt <= (await kutu(sayfa, "#keyboard")).ust && k.en >= 44, `Sonucu göster görünür olmalı (${JSON.stringify(k)})`);
  // Onay penceresi: yazılan harf tahtaya gitmez
  await sayfa.tap("#btnShowResult");
  await sayfa.waitForSelector("#pes:not(.hidden)");
  await sayfa.keyboard.type("ab");
  await tusaDokun(sayfa, "A");
  assert.equal((await durum(sayfa)).tampon, "");
  await sayfa.tap("#btnPesVazgec");
  // Evet: oyun biter
  await sayfa.tap("#btnShowResult");
  await sayfa.tap("#btnPesEvet");
  const son = await sayfa.evaluate(() => ({ bitti: oyun.over, gosterildi: oyun.shown,
    kayit: JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())) }));
  assert.deepEqual([son.bitti, son.gosterildi], [true, true]);
  assert.equal(son.kayit.steps, 0, "günlükte çözüm kaydı oluşmamalı");
  // Ana ekran kartı "çözüm gösterildi"yi okur: ne "adım attın" ne "Oyna"
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Çözüm gösterildi · en az ${en}`);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  assert.ok(await gorunur(sayfa, "#gunlukSonraki"), "çözüm gösterilince geri sayım görünmeli");
  // Serbest oyuna gidip dönünce de aynı (günlük yeniden açılmaz)
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Çözüm gösterildi · en az ${en}`, "serbestteyken kart yanlış");
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  await sayfa.tap("#btnGunluk");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
  assert.deepEqual(await sayfa.evaluate(() => [oyun.mode, oyun.over, oyun.shown]), ["daily", true, true]);
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası");
  await baglam.close();
});

test("uygulama arayüzü: gecikmeli çözüm penceresi, o arada geçilen başka bulmacanın üstünde açılmaz", async () => {
  const { baglam, sayfa } = await arayuzSayfasi();
  const modalAcik = () => sayfa.evaluate(() => !document.getElementById("modal").classList.contains("hidden"));
  // Günün bulmacasını çöz (pencere açılır), kapat, ana ekrana dön
  await oyunaGir(sayfa, "daily");
  const [bas, hedef] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord]);
  for (const k of enKisaYol(bas, hedef)) await yaz(sayfa, k);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  // Serbest bulmacayı çöz; pencere açılmadan (650 ms) ana ekrana, oradan çözülmüş günlüğe geç
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
  const [sb, sh] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord]);
  const yol = enKisaYol(sb, sh);
  for (const k of yol.slice(0, -1)) await yaz(sayfa, k);
  await yaz(sayfa, yol[yol.length - 1]);
  await sayfa.evaluate(() => {
    document.getElementById("btnAna").click();
    document.getElementById("btnGunluk").click();
  });
  assert.equal(await sayfa.evaluate(() => [oyun.mode, oyun.over].join()), "daily,true", "günlük çözülmüş açılmalı");
  await sayfa.waitForTimeout(1000);
  assert.equal(await modalAcik(), false, "gecikmeli çözüm penceresi günlüğün üstünde açıldı");
  await baglam.close();
});

/* ---------- Denetim bulguları (PR #9): mod kayıtlarını ezen yollar, bekleyen çözüm penceresi, Plus ---------- */

// Günlüğü en kısa yoldan `fazla` adım uzun çözer (bir ileri bir geri): "Tekrar dene" hakkı doğar
async function gunluguCoz(sayfa, { fazla = 0 } = {}) {
  const { zincir: [bas] } = await durum(sayfa);
  const yol = enKisaYol(bas, await sayfa.evaluate(() => oyun.targetWord));
  for (let i = 0; i < fazla / 2; i++) { await yaz(sayfa, yol[0]); await yaz(sayfa, bas); }
  for (const kelime of yol) await yaz(sayfa, kelime);
  return yol;
}

test("uygulama arayüzü: çözüm penceresindeki \"Serbest Oyun\" ve bitmiş tahtada Enter, serbestte kalınan yeri ezmez", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_zorluk: "zor" } });
  // Serbest oyunda bir hamle yapılıp bırakılır
  await oyunaGir(sayfa, "free");
  let d = await durum(sayfa);
  await yaz(sayfa, enKisaYol(d.zincir[0], await sayfa.evaluate(() => oyun.targetWord))[0]);
  const serbest = (await durum(sayfa)).zincir;
  assert.equal(serbest.length, 2);
  const kayitliSerbest = () => sayfa.evaluate(() => JSON.parse(localStorage.getItem("sm_mod_free")).chain);
  assert.deepEqual(await kayitliSerbest(), serbest);

  // Günlük çözülür; penceredeki "Serbest Oyun" kalınan serbest oyuna döner (app.js yeni bulmaca çekerdi)
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  await gunluguCoz(sayfa);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  assert.equal(await sayfa.textContent("#btnNewGame"), "Serbest Oyun");
  await sayfa.tap("#btnNewGame");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.zincir, d.ekran], ["free", serbest, "oyun"], "penceredeki Serbest Oyun kalınan yeri ezdi");
  assert.ok(await sayfa.evaluate(() => document.getElementById("modal").classList.contains("hidden")));
  assert.deepEqual(await kayitliSerbest(), serbest);

  // Bitmiş günlük tahtasında Enter (bağlı klavye): app.js aynı düğmeye basar; yine kalınan yere döner
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  assert.equal((await durum(sayfa)).bitti, true);
  await sayfa.keyboard.press("Enter");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.zincir], ["free", serbest], "bitmiş tahtada Enter kalınan yeri ezdi");
  assert.deepEqual(await kayitliSerbest(), serbest);

  // Serbest oyun bitince aynı düğme ("Yeni Oyun") yeni bulmaca çeker: davranış sitedeki gibi
  const yol = enKisaYol(serbest[1], await sayfa.evaluate(() => oyun.targetWord));
  for (const kelime of yol) await yaz(sayfa, kelime);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  assert.equal(await sayfa.textContent("#btnNewGame"), "Yeni Oyun");
  await sayfa.tap("#btnNewGame");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.zincir.length], ["free", false, 1]);
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: çözümden hemen sonra başka ekrana geçilirse çözüm penceresi onun üstünde açılmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const { zincir: [bas] } = await durum(sayfa);
  const yol = enKisaYol(bas, await sayfa.evaluate(() => oyun.targetWord));
  for (const kelime of yol.slice(0, -1)) await yaz(sayfa, kelime);
  // Son kelime ve hemen ardından (app.js'in 650 ms'lik pencere gecikmesi dolmadan) ana ekran → serbest oyun
  await sayfa.evaluate((son) => {
    for (const h of son) oyun.pressKey(h);
    oyun.pressKey("ENTER");
    document.getElementById("btnAna").click();
    document.getElementById("btnSerbest").click();
  }, yol.at(-1));
  let d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.ekran], ["free", false, "oyun"]);
  await sayfa.waitForTimeout(900);
  assert.ok(await sayfa.evaluate(() => document.getElementById("modal").classList.contains("hidden")), "günlüğün çözüm penceresi serbest oyunun üstünde açıldı");
  // Günlük yine çözülmüş sayılır; sonuç ana ekranda ve tahtada durur
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  await sayfa.tap("#btnGunluk");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.zincir.length], ["daily", true, yol.length + 1]);
  // Tahtadaki oyun bittiyse pencere açılabilir (çözüldü satırındaki yol: aynı metot)
  await sayfa.evaluate(() => oyun.showModal({ oncedenCozuldu: true }));
  assert.equal(await sayfa.evaluate(() => document.getElementById("modal").classList.contains("hidden")), false);
  // Ana ekranda beklerken de açılmaz
  await sayfa.tap("#btnCloseModal");
  await anaya(sayfa);
  await sayfa.evaluate(() => oyun.showModal());
  assert.ok(await sayfa.evaluate(() => document.getElementById("modal").classList.contains("hidden")), "ana ekranın üstünde çözüm penceresi açıldı");
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: seçilen zorlukta bulmaca yoksa app.js'in verdiği bulmaca da sürdürülür", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await anaEkran(sayfa);
  // 3 harfte hiç "zor" bulmaca kalmasın: app.js o uzunluğun tümünden seçer
  await sayfa.evaluate(() => { oyun.db["3"].puzzles = oyun.db["3"].puzzles.filter((b) => b[3] !== "zor" && b[2] > 1); });
  await sayfa.tap('#anaAyar [data-len="3"]');
  await sayfa.tap('#anaAyar [data-diff="zor"]');
  await sayfa.tap("#btnSerbest");
  let d = await durum(sayfa);
  assert.notEqual(await sayfa.evaluate(() => oyun.puzzleDiff), "zor");
  await yaz(sayfa, enKisaYol(d.zincir[0], await sayfa.evaluate(() => oyun.targetWord))[0]);
  const serbest = (await durum(sayfa)).zincir;
  assert.equal(serbest.length, 2);
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#btnSerbest"), "Devam et", "başka zorluğa düşen bulmaca sürdürülemiyor");
  await sayfa.tap("#btnGunluk");
  await anaya(sayfa);
  await sayfa.tap("#btnSerbest");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.zincir], ["free", serbest]);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: günlük tekrar sürerken mod değiştirmek tekrarı ve ilk sonucu korur", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_zorluk: "zor" } });
  await oyunaGir(sayfa);
  const yol = await gunluguCoz(sayfa, { fazla: 2 });           // en azın 2 üstünde: tekrar hakkı var
  await sayfa.waitForSelector("#modal:not(.hidden)");
  await sayfa.tap("#btnRetry");                               // web'de (kanca yok) tekrar serbesttir
  let d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.zincir.length], ["daily", false, 1], "tekrar başlamalı");
  await yaz(sayfa, yol[0]);
  const deneme = (await durum(sayfa)).zincir;
  assert.equal(deneme.length, 2);
  const ilkSonuc = () => sayfa.evaluate(() => { const k = oyun.dailyRecord(); return [k.steps, k.deneme]; });
  assert.deepEqual(await ilkSonuc(), [yol.length + 2, deneme]);

  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Tekrar deniyorsun · 1 adım · en az ${yol.length}`);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");
  assert.equal(await gorunur(sayfa, "#gunlukSonraki"), false);
  // Serbest oyunda hamle yapılır, günlüğe dönülür: tekrar kaldığı yerden sürer
  await sayfa.tap("#btnSerbest");
  d = await durum(sayfa);
  assert.equal(d.mod, "free");
  await yaz(sayfa, enKisaYol(d.zincir[0], await sayfa.evaluate(() => oyun.targetWord))[0]);
  const serbest = (await durum(sayfa)).zincir;
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#btnGunluk"), "Devam et");
  await sayfa.tap("#btnGunluk");
  d = await durum(sayfa);
  assert.deepEqual([d.mod, d.bitti, d.zincir], ["daily", false, deneme], "süren tekrar mod değişiminde kayboldu");
  assert.deepEqual(await ilkSonuc(), [yol.length + 2, deneme], "ilk sonuç ya da tekrar kaydı bozuldu");
  // Yeniden açılışta da sürer; serbest oyun da yerinde
  await sayfa.reload();
  await sayfa.waitForFunction(() => window.oyun?.db && window.oyun.startWord);
  await anaEkran(sayfa);
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Tekrar deniyorsun · 1 adım · en az ${yol.length}`);
  await sayfa.tap("#btnGunluk");
  assert.deepEqual((await durum(sayfa)).zincir, deneme);
  await anaya(sayfa);
  await sayfa.tap("#btnSerbest");
  assert.deepEqual((await durum(sayfa)).zincir, serbest);
  // Tekrar en kısa yoldan biter: ilk sonuç kayıtta kalır, en iyi ana ekranda yazar
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  for (const kelime of yol.slice(1)) await yaz(sayfa, kelime);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  await sayfa.tap("#btnCloseModal");
  await anaya(sayfa);
  assert.equal(await sayfa.textContent("#gunlukDurum"), `Çözüldü · ${yol.length + 2} adım · en iyi ${yol.length} · en az ${yol.length}`);
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: Plus (satın al, geri yükle, cayma notu) ana ekrandan doğrudan ulaşılır; kanca yoksa görünmez", async () => {
  // Kanca yok (tarayıcı): Plus kartı görünmez
  const a = await arayuzSayfasi();
  await anaEkran(a.sayfa);
  assert.equal(await gorunur(a.sayfa, "#plusBox"), false, "kanca yokken Plus kartı görünmemeli");
  await a.baglam.close();

  const { baglam, sayfa, kayit, bekle, say } = await gelirSayfasi();
  await anaEkran(sayfa);
  await bekle(() => window.SozcukGelir.plusFiyat() === "₺99,99");
  assert.ok(await sayfa.evaluate(() => document.getElementById("ana").contains(document.getElementById("plusBox"))), "Plus ana ekranda olmalı");
  assert.equal(await sayfa.evaluate(() => document.getElementById("nasil-oynanir").contains(document.getElementById("plusBox"))), false);
  for (const s of ["#plusBox", "#btnPlusBuy", "#btnPlusRestore", "#plusNot"]) assert.ok(await gorunur(sayfa, s), `${s} ana ekranda görünmeli`);
  assert.equal(await sayfa.textContent("#btnPlusBuy"), "Plus'a geç (₺99,99)");
  assert.equal(await sayfa.textContent("#btnPlusRestore"), "Satın alımı geri yükle");
  assert.match(await sayfa.textContent("#plusNot"), /cayma hakkı yoktur/);
  assert.deepEqual(await kucukHedefler(sayfa, "#plusBox button"), [], "Plus düğmeleri en az 44 px olmalı");
  assert.ok(await tasmaYok(sayfa));
  if (process.env.EKRAN_DIZINI) {
    await sayfa.evaluate(() => document.getElementById("plusBox").scrollIntoView({ block: "center" }));
    await sayfa.waitForTimeout(400);                    // açılış ekranının solması bitsin
    await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, "8-ana-ekran-plus.png") });
    await sayfa.evaluate(() => { document.getElementById("ana").scrollTop = 0; });
  }
  // Geri yükleme ve satın alma ana ekrandan çalışır
  await sayfa.tap("#btnPlusRestore");
  await bekle(() => window.__cagri.some((c) => c[0] === "geriYukle"));
  assert.equal(await sayfa.textContent("#toast"), "Geri yüklenecek satın alım bulunamadı.");
  await sayfa.tap("#btnPlusBuy");
  await bekle(() => window.SozcukGelir.plusMu() === true);
  assert.equal(await say("satinAl"), 1);
  await bekle(() => document.getElementById("plusText").textContent.startsWith("Plus etkin"));
  for (const s of ["#btnPlusBuy", "#btnPlusRestore", "#plusNot"]) assert.equal(await gorunur(sayfa, s), false, `Plus etkinken ${s} görünmemeli`);
  // Reklam tercihleri bağlantısının yeri gizlilik metnindeki tarifle aynı: ana ekranın altı
  assert.ok(await sayfa.evaluate(() => document.getElementById("ana").contains(document.querySelector(".site-footer"))));
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();
});

test("uygulama arayüzü: çözülmüş günlükte tekrar Sonucu göster ile bitince ilk çözüm kaydı ve kart korunur", async () => {
  const { baglam, sayfa } = await arayuzSayfasi();
  await oyunaGir(sayfa, "daily");
  const [bas, hedef, en] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
  // En azın üstünde çöz: tekrar teklif edilir
  await gezin(sayfa, en + 1);
  for (const k of enKisaYol(await sayfa.evaluate(() => oyun.currentWord), hedef)) await yaz(sayfa, k);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  const ilk = await sayfa.evaluate(() => JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())));
  assert.ok(ilk.steps > en, "ilk çözüm en azın üstünde olmalı");
  await sayfa.tap("#btnRetry");
  await gezin(sayfa, en + 1);
  await sayfa.tap("#btnShowResult");
  await sayfa.tap("#btnPesEvet");
  const k = await sayfa.evaluate(() => ({ kayit: JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())),
    shown: oyun.shown, paylas: !document.getElementById("dailySolved").classList.contains("hidden") }));
  assert.deepEqual([k.kayit.steps, k.kayit.deneme, k.kayit.gosterildi, k.shown, k.paylas], [ilk.steps, undefined, undefined, true, true],
    `ilk çözüm kaydı değişti ya da Paylaş görünmüyor: ${JSON.stringify(k)}`);
  await sayfa.evaluate(() => document.getElementById("btnAna").click());
  assert.ok((await sayfa.textContent("#gunlukDurum")).startsWith(`Çözüldü · ${ilk.steps} adım`), "kart ilk çözümü göstermeli");
  assert.equal(await sayfa.textContent("#btnGunluk"), "Sonucu gör");
  await baglam.close();
});

test("uygulama arayüzü: Türkçe harf şeridi kalktı; düğmesi ve menü anahtarı yok, eski sm_serit kaydı açılışta silinir", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi({ kayitlar: { sm_serit: "0" } });
  await anaEkran(sayfa);
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_serit")), null, "eski kayıt silinmeli");
  assert.deepEqual(await sayfa.evaluate(() => ["btnSerit", "menuSerit", "harfler"].filter((id) => document.getElementById(id))), []);
  assert.equal(await sayfa.evaluate(() => document.body.classList.contains("serit-yok")), false);
  // Ana ekranın üst satırında yalnızca ses düğmesi
  assert.deepEqual(await sayfa.evaluate(() => [...document.getElementById("anaUst").children].map((e) => e.id)), ["btnMute"]);
  await oyunaGir(sayfa);
  await bas(sayfa, "Ç", false);
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_serit")), null, "oynarken yeniden yazılmamalı");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

/* ---------- Sayılı haklar (site PR'ı: sayili-haklar): geri al ve ipucu, yenile onayı ---------- */

// Rozetler ve aria-label (Plus'ta rozet gizli)
const haklar = (sayfa) => sayfa.evaluate(() => {
  const r = (id) => { const e = document.querySelector(`#${id} .hak`); return getComputedStyle(e).display === "none" ? null : e.textContent; };
  return { kayit: JSON.parse(localStorage.getItem("sm_haklar") || "null"), geri: r("btnUndo"), ipucu: r("btnHint"),
    etiketGeri: document.getElementById("btnUndo").getAttribute("aria-label"), etiketIpucu: document.getElementById("btnHint").getAttribute("aria-label") };
});
// Başlangıçtan hedef olmayan bir komşuya: geri alınacak bir adım
const birAdim = async (sayfa) => yaz(sayfa, await sayfa.evaluate(() =>
  [...oyun.dict].find((w) => w !== oyun.targetWord && [...w].filter((c, i) => c !== oyun.currentWord[i]).length === 1)));

test("uygulama arayüzü: sayılı haklar — rozet, 0 hakta geri al için ödüllü reklam (+1), günlük yenilenmez", async () => {
  // Dünkü kayıt: uygulamada yeni gün hak vermez
  const { baglam, sayfa, kayit, bekle } = await gelirSayfasi({ haklar: { geriAl: 0, ipucu: 5, gun: "2000-01-01" } });
  await bekle(() => window.__cagri.some((c) => c[0] === "prepareRewardVideoAd"));
  await oyunaGir(sayfa);
  let h = await haklar(sayfa);
  assert.deepEqual([h.geri, h.ipucu, h.etiketGeri, h.etiketIpucu], ["0", "5", "Geri al, 0 hak kaldı", "İpucu, 5 hak kaldı"]);
  await birAdim(sayfa);
  // Silme tuşu hak harcamaz; yazılan harf silinir
  await sayfa.keyboard.type("a");
  await sil(sayfa, 1);
  assert.equal((await durum(sayfa)).tampon, "");
  if (process.env.EKRAN_DIZINI) {
    await sayfa.waitForTimeout(400);
    await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, "h1-rozetler.png") });
  }
  await sayfa.tap("#btnUndo");                            // hak yok: teklif
  await sayfa.waitForSelector("#offer:not(.hidden)");
  assert.equal(await sayfa.textContent("#offerTitle"), "Geri alma hakkın bitti");
  assert.equal(await sayfa.textContent("#btnOfferAd"), "Reklam izle, geri al");
  assert.equal((await durum(sayfa)).zincir.length, 2, "teklif açılınca adım henüz geri alınmamalı");
  if (process.env.EKRAN_DIZINI) {
    await sayfa.waitForTimeout(400);
    await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, "h2-geri-al-teklifi.png") });
  }
  await sayfa.tap("#btnOfferAd");                         // sahte köprü ödülü verir
  await bekle(() => oyun.chain.length === 1);
  h = await haklar(sayfa);
  assert.deepEqual([h.kayit.geriAl, h.geri], [0, "0"], "ödül +1 verip hemen kullanmalı");
  assert.ok(await sayfa.evaluate(() => document.getElementById("offer").classList.contains("hidden")), "ödülden sonra teklif kapanmalı");
  assert.ok(await sayfa.evaluate(() => window.__cagri.some((c) => c[0] === "showRewardVideoAd")), "ödüllü reklam gösterilmeli");
  assert.deepEqual(kayit.hatalar, [], "sayfa hatası ya da CSP ihlali");
  await baglam.close();

  // Plus: rozet yok, hak 0 olsa da geri al reklamsız
  const p = await gelirSayfasi({ onbellekPlus: true, magazaPlus: true, haklar: { geriAl: 0, ipucu: 0, gun: "" } });
  await oyunaGir(p.sayfa);
  await p.bekle(() => window.SozcukGelir.plusMu() === true);
  h = await haklar(p.sayfa);
  assert.deepEqual([h.geri, h.ipucu, h.etiketGeri, h.etiketIpucu], [null, null, "Geri al", "İpucu"], "Plus'ta rozet görünmemeli");
  await birAdim(p.sayfa);
  await p.sayfa.tap("#btnUndo");
  assert.equal((await durum(p.sayfa)).zincir.length, 1, "Plus'ta geri al sınırsız");
  assert.equal(await p.say("showRewardVideoAd"), 0);
  await p.baglam.close();
});

test("uygulama arayüzü: yenile düğmesi başlıkta yok; serbestte menüdeki \"Serbest oyun\" yeni bulmaca açar, ilerleme varken onay ister, onay açıkken tuşlar yazmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa, "free");
  // Sahip notu (15 Kasım 2026): yenile düğmesi geri okuna benziyordu; başlıkta yalnızca menü, mod adı ve yardım
  assert.equal(await gorunur(sayfa, "#btnRestart"), false, "yenile düğmesi başlıkta görünmemeli");
  const [mn, m] = [await kutu(sayfa, "#btnMenu"), await kutu(sayfa, "#modAdi")];
  assert.ok(mn.sol < 30 && mn.sag <= m.sol, `menü düğmesi başlığın sol ucunda, mod adından önce olmalı (${JSON.stringify({ mn, m })})`);
  assert.deepEqual(await kucukHedefler(sayfa, "#oyun .icon-btn"), []);
  const yeni = async () => { await sayfa.tap("#btnMenu"); await sayfa.tap("#menuSerbest"); };
  const ilk = await sayfa.evaluate(() => oyun.startWord + oyun.targetWord);
  await yeni();                                            // ilerleme yok: onaysız
  assert.equal(await gorunur(sayfa, "#yenile"), false);
  assert.ok(await sayfa.evaluate(() => document.getElementById("menu").classList.contains("hidden")), "seçince menü kapanmalı");
  assert.notEqual(await sayfa.evaluate(() => oyun.startWord + oyun.targetWord), ilk, "yeni bulmaca gelmeli");
  await birAdim(sayfa);
  await yeni();
  await sayfa.waitForSelector("#yenile:not(.hidden)");
  assert.equal(await sayfa.textContent("#yenileTitle"), "Yeni bulmaca açılsın mı?");
  await sayfa.keyboard.type("ab");
  await tusaDokun(sayfa, "A");
  assert.equal((await durum(sayfa)).tampon, "");
  if (process.env.EKRAN_DIZINI) {
    await sayfa.waitForTimeout(400);
    await sayfa.screenshot({ path: join(process.env.EKRAN_DIZINI, "h3-yenile-onayi.png") });
  }
  await sayfa.tap("#btnYenileVazgec");
  let d = await durum(sayfa);
  assert.equal(d.zincir.length, 2, "vazgeçince ilerleme kalmalı");
  await yeni();
  await sayfa.tap("#btnYenileEvet");
  d = await durum(sayfa);
  assert.deepEqual([d.zincir.length, d.mod, await sayfa.evaluate(() => document.getElementById("yenile").classList.contains("hidden"))],
    [1, "free", true], "onaydan sonra yeni bulmaca açılmalı, onay kapanmalı");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: menü açılır/kapanır (Escape, dışarı dokunuş); odak; açıkken tuşlar yazmaz; günlükte \"Yeniden dene\" yok", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const m = () => sayfa.evaluate(() => ({ acik: !document.getElementById("menu").classList.contains("hidden"),
    genis: document.getElementById("btnMenu").getAttribute("aria-expanded"), odak: document.activeElement.id,
    gizli: document.getElementById("menu").getAttribute("aria-hidden") }));
  assert.equal(await sayfa.getAttribute("#btnMenu", "aria-controls"), "menu");
  assert.deepEqual({ ...await m(), odak: undefined }, { acik: false, genis: "false", odak: undefined, gizli: "true" });
  await birAdim(sayfa);
  await sayfa.tap("#btnMenu");
  assert.deepEqual(await m(), { acik: true, genis: "true", odak: "btnAna", gizli: "false" }, "açılınca odak ilk öğede");
  // Günlükte "Baştan başla" yok (sahip kararı): yeni oyun satırı hiç görünmez
  assert.equal(await gorunur(sayfa, "#menuYeniden"), false, "günlükte Yeniden dene görünmemeli (sahibin cevabı bekleniyor)");
  const ogeler = () => sayfa.evaluate(() => [...document.querySelectorAll("#menu button")].filter((e) => !e.hidden).map((e) => e.textContent.trim()));
  assert.deepEqual(await ogeler(), ["Ana menüye dön", "Serbest oyun", "Nasıl oynanır?", "Titreşim", "Ses"]);
  // Eylemler büyük tuş (en az 52 px, sitenin birincil/ikincil tuşları), ayarlar küçük satır
  assert.deepEqual(await sayfa.evaluate(() => ["btnAna", "menuSerbest"].map((id) => [document.getElementById(id).className,
    Math.round(document.getElementById(id).getBoundingClientRect().height) >= 52])), [["btn-primary", true], ["btn-secondary", true]]);
  assert.deepEqual(await sayfa.evaluate(() => [...document.querySelectorAll('#menu [role="switch"]')].map((e) => [e.id, e.getAttribute("aria-checked")])),
    [["menuTitresim", "true"], ["menuSes", "true"]]);
  assert.deepEqual(await kucukHedefler(sayfa, "#menu button"), [], "menü satırları en az 44 px");
  assert.ok(await tasmaYok(sayfa));
  // Odak tuzağı: Tab ve Shift+Tab menünün görünen satırları arasında döner
  const odaklar = [];
  for (let i = 0; i < 5; i++) { await sayfa.keyboard.press("Tab"); odaklar.push((await m()).odak); }
  assert.deepEqual(odaklar, ["menuSerbest", "menuYardim", "menuTitresim", "menuSes", "btnAna"], "Tab menüde dönmeli, gizli tuşa gitmemeli");
  await sayfa.keyboard.press("Shift+Tab");
  assert.equal((await m()).odak, "menuSes", "ilk satırda Shift+Tab sona gitmeli");
  await sayfa.keyboard.press("Tab");
  // Menü açıkken yazılan harf ve ekran tuşu tahtaya gitmez (perde tuşları örter)
  await sayfa.keyboard.type("ab");
  await tusaDokun(sayfa, "A");
  assert.equal((await durum(sayfa)).tampon, "");
  if ((await m()).acik === false) await sayfa.tap("#btnMenu");   // perdeye dokunuş menüyü kapatır
  await sayfa.keyboard.press("Escape");
  assert.deepEqual(await m(), { acik: false, genis: "false", odak: "btnMenu", gizli: "true" }, "Escape kapatır; odak menü düğmesine döner");
  assert.equal((await durum(sayfa)).zincir.length, 2, "menü ilerlemeye dokunmaz");
  // Dışarı (perdeye) dokunuş kapatır
  await sayfa.tap("#btnMenu");
  await sayfa.mouse.click(195, 100);
  assert.deepEqual(await m(), { acik: false, genis: "false", odak: "btnMenu", gizli: "true" }, "dışarı dokunuş kapatır");
  // Nasıl oynanır? menüden açılır; odak kapat düğmesine gider
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuYardim");
  assert.ok(await sayfa.evaluate(() => document.body.classList.contains("yardim")));
  assert.equal((await m()).odak, "btnYardimKapat");
  await sayfa.tap("#btnYardimKapat");
  // Ana menü: ana ekran
  await anaya(sayfa);
  assert.equal((await durum(sayfa)).ekran, "ana");
  assert.equal((await m()).acik, false);
  // Serbestte yeni oyun satırı görünür
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => document.body.dataset.ekran === "oyun");
  await sayfa.tap("#btnMenu");
  assert.deepEqual(await ogeler(), ["Ana menüye dön", "Serbest oyun", "Yeniden dene", "Nasıl oynanır?", "Titreşim", "Ses"]);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: menü ekranın ortasında yüzen karttır; iPhone SE'de taşmaz", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    const { baglam, sayfa, kayit } = await arayuzSayfasi({ secenek: { ...TELEFON, viewport } });
    await oyunaGir(sayfa, "free");
    await sayfa.tap("#btnMenu");
    await sayfa.waitForTimeout(300);                     // açılış geçişi biter
    const k = await kutu(sayfa, "#menu .menu");
    const ad = `${viewport.width}×${viewport.height}`;
    assert.ok(Math.abs((k.sol + k.sag) / 2 - viewport.width / 2) < 1, `${ad}: kart yatayda ortada olmalı`);
    assert.ok(Math.abs((k.ust + k.alt) / 2 - viewport.height / 2) < 2, `${ad}: kart dikeyde ortada olmalı (${k.ust}–${k.alt})`);
    assert.ok(k.en <= 340 && k.sol >= 16 && k.ust >= 16 && k.alt <= viewport.height - 16, `${ad}: kart kenarlardan en az 16 px içeride (${JSON.stringify(k)})`);
    assert.equal(await sayfa.evaluate(() => { const e = document.querySelector("#menu .menu"); return e.scrollHeight <= e.clientHeight; }), true, `${ad}: kartın içi kaymamalı`);
    assert.ok(await tasmaYok(sayfa), `${ad}: taşma`);
    assert.deepEqual(kayit.hatalar, []);
    await baglam.close();
  }
});

test("uygulama arayüzü: çözümden hemen sonra açılan menü, gecikmeli çözüm penceresiyle kapanır (üst üste binmez)", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  const yol = enKisaYol((await durum(sayfa)).zincir[0], await sayfa.evaluate(() => oyun.targetWord));
  for (const k of yol.slice(0, -1)) await yaz(sayfa, k);
  await yaz(sayfa, yol.at(-1));
  await sayfa.tap("#btnMenu");                           // çözüm penceresi 650 ms sonra açılır
  assert.equal(await sayfa.getAttribute("#btnMenu", "aria-expanded"), "true");
  await sayfa.waitForSelector("#modal:not(.hidden)");
  assert.deepEqual(await sayfa.evaluate(() => [document.getElementById("menu").classList.contains("hidden"),
    document.getElementById("btnMenu").getAttribute("aria-expanded")]), [true, "false"], "çözüm penceresi açılınca menü kapanmalı");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: menüdeki \"Yeniden dene\" aynı bulmacayı baştan açar; ilerleme varken onay ister", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa, "free");
  const bulmaca = () => sayfa.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.chain.length, oyun.over]);
  const [bas, hedef] = await bulmaca();
  const yeniden = async () => { await sayfa.tap("#btnMenu"); await sayfa.tap("#menuYeniden"); };
  await yeniden();                                         // ilerleme yok: onaysız, aynı bulmaca
  assert.equal(await gorunur(sayfa, "#yenile"), false);
  assert.deepEqual(await bulmaca(), [bas, hedef, 1, false]);
  await birAdim(sayfa);
  await yeniden();
  await sayfa.waitForSelector("#yenile:not(.hidden)");
  assert.equal(await sayfa.textContent("#yenileTitle"), "Baştan başlansın mı?");
  assert.equal(await sayfa.textContent("#btnYenileEvet"), "Baştan başla");
  await sayfa.tap("#btnYenileVazgec");
  assert.deepEqual(await bulmaca(), [bas, hedef, 2, false], "vazgeçince ilerleme kalmalı");
  // Vazgeçtikten sonra "Serbest oyun" yine yeni bulmaca açar (onay app.js'e döner)
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuSerbest");
  await sayfa.waitForSelector("#yenile:not(.hidden)");
  assert.equal(await sayfa.textContent("#yenileTitle"), "Yeni bulmaca açılsın mı?");
  await sayfa.tap("#btnYenileVazgec");
  await yeniden();
  await sayfa.waitForSelector("#yenile:not(.hidden)");
  await sayfa.tap("#btnYenileEvet");
  const d = await durum(sayfa);
  assert.deepEqual([...(await bulmaca()), d.tampon, await sayfa.evaluate(() => JSON.parse(localStorage.getItem("sm_state")).chain.length)],
    [bas, hedef, 1, false, "", 1], "aynı bulmaca baştan açılmalı, kaydedilmeli");
  // Çözülmüş serbest bulmaca da baştan açılır
  for (const k of enKisaYol(bas, hedef)) await yaz(sayfa, k);
  await sayfa.waitForSelector("#modal:not(.hidden)");
  await sayfa.tap("#btnCloseModal");
  await yeniden();
  assert.deepEqual(await bulmaca(), [bas, hedef, 1, false], "çözülmüş bulmaca baştan açılmalı");
  assert.equal(await sayfa.evaluate(() => document.getElementById("game").classList.contains("bitti")), false);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: \"Yeniden dene\" açık ipucunu temizler, hakları değiştirmez", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa, "free");
  await birAdim(sayfa);
  const haklarOnce = await sayfa.evaluate(() => localStorage.getItem("sm_haklar"));
  await sayfa.tap("#btnHint");
  await sayfa.waitForFunction(() => oyun.hint !== null);
  const haklarIpucu = await sayfa.evaluate(() => localStorage.getItem("sm_haklar"));
  assert.notEqual(haklarIpucu, haklarOnce, "ipucu bir hak harcamalı (testin ön koşulu)");
  assert.notEqual(await sayfa.evaluate(() => JSON.parse(localStorage.getItem("sm_state")).ipucu), null, "ipucu kayda yazılmalı (ön koşul)");
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuYeniden");
  await sayfa.waitForSelector("#yenile:not(.hidden)");
  await sayfa.tap("#btnYenileEvet");
  assert.deepEqual(await sayfa.evaluate(() => ({ hint: oyun.hint, ipucu: JSON.parse(localStorage.getItem("sm_state")).ipucu,
    haklar: localStorage.getItem("sm_haklar"), serbest: JSON.parse(localStorage.getItem("sm_mod_free")).chain.length,
    cerceve: document.querySelectorAll(".tile.hint").length })),
  { hint: null, ipucu: null, haklar: haklarIpucu, serbest: 1, cerceve: 0 }, "ipucu temizlenmeli, haklar değişmemeli, serbest kayıt baştan olmalı");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: günlükte menüdeki \"Serbest oyun\" serbest moda geçer, kalınan serbest oyunu ve günlüğü silmez", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa, "free");
  await birAdim(sayfa);
  const serbest = await sayfa.evaluate(() => oyun.chain.slice());
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  await sayfa.waitForFunction(() => oyun.mode === "daily");
  await birAdim(sayfa);
  const gunluk = await sayfa.evaluate(() => oyun.chain.slice());
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuSerbest");
  await sayfa.waitForFunction(() => oyun.mode === "free");
  let d = await durum(sayfa);
  assert.deepEqual([d.zincir, d.ekran, await gorunur(sayfa, "#yenile")], [serbest, "oyun", false], "kalınan serbest oyun sürmeli, onay sorulmamalı");
  assert.equal(await sayfa.textContent("#modAdi"), "Serbest Oyun");
  // Günlükte kalınan yer de silinmedi
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  await sayfa.waitForFunction(() => oyun.mode === "daily");
  assert.deepEqual((await durum(sayfa)).zincir, gunluk);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: menüdeki ses ana ekrandaki düğmeyle aynı kaydı tutar", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuSes");
  assert.equal(await sayfa.getAttribute("#menuSes", "aria-checked"), "false");
  assert.equal(await gorunur(sayfa, "#menu"), true, "ayar değiştirmek menüyü kapatmaz");
  await sayfa.waitForFunction(() => localStorage.getItem("sm_ses") === "0");
  await sayfa.tap("#btnAna");
  assert.equal(await sayfa.evaluate(() => document.getElementById("btnMute").classList.contains("muted")), true, "ana ekrandaki ses düğmesi de kapalı görünmeli");
  // Ana ekrandan açınca menü de açık gösterir
  await sayfa.tap("#btnMute");
  await oyunaGir(sayfa);
  await sayfa.tap("#btnMenu");
  assert.equal(await sayfa.getAttribute("#menuSes", "aria-checked"), "true");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama: titreşim menüden kapatılınca Haptics hiç çağrılmaz; açınca yeniden çağrılır", async () => {
  const baglam = await tarayici.newContext(TELEFON);
  await baglam.addInitScript(() => {
    window.__cagri = [];
    const kaydet = (ad) => (arg) => { window.__cagri.push([ad, arg]); return Promise.resolve(); };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: { notification: kaydet("titresim"), impact: kaydet("dokunus") } } };
  });
  const { sayfa, kayit } = await ac(baglam);
  await oyunaGir(sayfa);
  const say = () => sayfa.evaluate(() => window.__cagri.length);
  await sayfa.tap("#btnMenu");
  await sayfa.tap("#menuTitresim");
  assert.equal(await sayfa.getAttribute("#menuTitresim", "aria-checked"), "false");
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_titresim")), "0");
  await sayfa.keyboard.press("Escape");
  const once = await say();
  await bas(sayfa, "A", false);                          // ekran tuşu: hafif dokunuş olurdu
  await sayfa.tap('#keyboard .key[data-key="BACK"]');
  await birAdim(sayfa);                                  // kabul: hafif dokunuş olurdu
  await yaz(sayfa, "zzzz");                              // geçersiz: hata titreşimi olurdu
  assert.equal((await durum(sayfa)).zincir.length, 2);
  assert.equal(await say(), once, "titreşim kapalıyken Haptics çağrılmamalı");
  // Yeniden açılışta da kapalı kalır
  await sayfa.reload();
  await oyunaGir(sayfa);
  await sayfa.tap("#btnMenu");
  assert.equal(await sayfa.getAttribute("#menuTitresim", "aria-checked"), "false");
  await sayfa.tap("#menuTitresim");
  assert.equal(await sayfa.evaluate(() => localStorage.getItem("sm_titresim")), null);
  await sayfa.keyboard.press("Escape");
  const sonra = await say();
  await birAdim(sayfa);
  assert.ok(await say() > sonra, "titreşim açılınca Haptics yeniden çağrılmalı");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});

test("uygulama arayüzü: açık ipucu ana ekrana gidip dönünce ve yeniden açılışta korunur; hak yeniden harcanmaz", async () => {
  const { baglam, sayfa, kayit } = await arayuzSayfasi();
  await oyunaGir(sayfa);
  await birAdim(sayfa);
  await sayfa.tap("#btnHint");
  const ipucu = await sayfa.evaluate(() => JSON.stringify(oyun.hint));
  assert.notEqual(ipucu, "null");
  const ac = () => sayfa.evaluate(() => ({ h: JSON.stringify(oyun.hint), cerceve: document.querySelectorAll(".tile.hint").length, hak: JSON.parse(localStorage.getItem("sm_haklar")).ipucu }));
  // Ana ekran → serbest oyun → ana ekran → günlük: kayıttan geri yüklenir
  await anaya(sayfa);
  await sayfa.tap("#btnSerbest");
  await sayfa.waitForFunction(() => oyun.mode === "free");
  await anaya(sayfa);
  await sayfa.tap("#btnGunluk");
  await sayfa.waitForFunction(() => oyun.mode === "daily");
  assert.deepEqual(await ac(), { h: ipucu, cerceve: 1, hak: 4 }, "gidiş-dönüşte ipucu kayboldu ya da hak değişti");
  await sayfa.reload();
  await oyunaGir(sayfa);
  assert.deepEqual(await ac(), { h: ipucu, cerceve: 1, hak: 4 }, "yeniden açılışta ipucu kayboldu ya da hak değişti");
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});
