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
const TUR = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
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

async function yaz(sayfa, kelime) {
  await sayfa.tap("#game");                 // cihaz klavyesini açar
  await sayfa.keyboard.type(kelime);
  await sayfa.keyboard.press("Enter");
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
  assert.equal(d.reklam, 0, "reklam alanı kalmış");
  assert.equal(d.izleme, "undefined", "analitik köprüsü tanımlı");
  assert.deepEqual(d.betikler, ["app.js", "yerel.js"]);
  assert.equal(d.ekranKlavyesi, "none", "dokunmatikte cihaz klavyesi kullanılır");
  await goruntu("1-acilis.png");

  // Geçersiz hamle: kelimeyi değiştirmeden gönder → reddedilir + hata titreşimi
  await yaz(sayfa, d.bas);
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1, "değişmeyen kelime kabul edildi");
  assert.ok(await sayfa.evaluate(() => document.getElementById("toast").classList.contains("show")));
  assert.deepEqual(await cagrilar("titresim"), [{ type: "ERROR" }]);
  await goruntu("2-gecersiz-hamle.png");
  for (const _ of d.bas) await sayfa.keyboard.press("Backspace");   // reddedilen kelime satırda kalır

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
  assert.match(await sayfa.textContent("main"), /hiçbir veri toplamaz/);
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
  await yaz(sayfa, d.bas);                  // geçersiz hamle hata vermeden reddedilir
  assert.equal(await sayfa.evaluate(() => oyun.chain.length), 1);
  assert.deepEqual(kayit.disIstekler, []);
  assert.deepEqual(kayit.hatalar, []);
  await baglam.close();
});
