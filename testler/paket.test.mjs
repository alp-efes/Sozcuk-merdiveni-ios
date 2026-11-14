/* Paketin bütünlüğü: eşitleme ve dönüşüm, site bağlantı noktaları, bağımlılıklar,
 * Xcode ayarları, görseller, iş akışları. Tarayıcı gerektirmez.
 * `npm test` önce eşitlemeyi çalıştırır; www/ buraya hazır gelir. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AYNEN, CSP, SITE, WWW_DOSYALARI, donustur } from "../araclar/web-esitle.mjs";
import { SITE_OGELERI } from "../araclar/arayuz.mjs";
import { GORSELLER, gorselDenetle } from "../araclar/gorsel.mjs";
import { TEST_YAYINCI, kimlikHatalari, paketHatalari } from "../araclar/yayin-denetle.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oku = (...yol) => readFileSync(join(...yol), "utf8");
const gelir = JSON.parse(oku(KOK, "gelir.json"));
const siteIndex = oku(SITE, "index.html");
const siteApp = oku(SITE, "app.js");

test("www/ yalnızca beklenen dosyaları içerir", () => {
  const dosyalar = readdirSync(join(KOK, "www"), { recursive: true, withFileTypes: true })
    .filter((g) => g.isFile()).map((g) => relative(join(KOK, "www"), join(g.parentPath, g.name)));
  assert.deepEqual(dosyalar.sort(), [...WWW_DOSYALARI].sort());
});

test("site dosyaları değiştirilmeden kopyalanır", () => {
  for (const ad of AYNEN) {
    assert.ok(readFileSync(join(KOK, "www", ad)).equals(readFileSync(join(SITE, ad))), `${ad} siteyle aynı değil`);
  }
});

test("site CSS'inin yüklediği her dosya pakete kopyalanır", () => {
  const adresler = [...oku(SITE, "style.css").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
  assert.ok(adresler.length > 0, "style.css'te url() bulunamadı: desen bozulmuş olabilir");
  for (const adres of adresler) assert.ok(AYNEN.includes(adres), `style.css "${adres}" yüklüyor ama web-esitle.mjs (AYNEN) kopyalamıyor`);
});

// Yalnızca metin olarak geçebilecek adresler; hiçbiri bağlantı ya da kaynak değildir.
// Unicode site adresi paylaşım metnine yazılır (yerel.js); punycode makine alanlarındadır
// (canonical, og:url); diğerleri lisans metinlerindedir.
const METIN_ADRESLERI = new Set([
  "https://sözcükyolu.com/", "https://xn--szckyolu-n4a6d.com/", "https://ionic.io", "https://github.com/ahmetaa/zemberek-nlp",
  "http://www.apache.org/", "http://www.apache.org/licenses/", "http://www.apache.org/licenses/LICENSE-2.0",
  "https://github.com/undercasetype/Fraunces", "http://scripts.sil.org/OFL",
]);
// Uygulamanın kendi sayfaları: yalnızca paketteki stil dosyası ve yazı tipleri yüklenir
const SAYFA_CSP = "default-src 'none'; style-src 'self' capacitor://localhost; font-src 'self' capacitor://localhost; base-uri 'none'; form-action 'none'";

test("paketteki hiçbir dosya dış adres, reklam ya da analitik içermez", () => {
  for (const ad of WWW_DOSYALARI) {
    if (ad.endsWith(".woff2")) continue;    // ikili yazı tipi dosyası; siteyle aynı olduğu yukarıda denetlenir
    const metin = oku(KOK, "www", ad);
    for (const adres of metin.match(/https?:\/\/[^\s"'<>()]+/g) || []) {
      assert.ok(METIN_ADRESLERI.has(adres.replace(/[.,;]+$/, "")), `${ad}: izinsiz adres ${adres}`);
    }
    assert.doesNotMatch(metin, /gstatic|googlesyndication|googletagmanager|google-analytics|firebasejs|doubleclick/i,
                        `${ad}: reklam/analitik kalıntısı`);
    if (!ad.endsWith(".html")) continue;
    // Bağlantı ve kaynaklar yalnızca paketin içine ya da e-postaya gider
    for (const [, deger] of metin.matchAll(/\s(?:href|src|srcset|action|poster|data)\s*=\s*["']?([^"'\s>]*)/gi)) {
      // Yerel dosyada ve mailto'da sorgu dizgisi olabilir (ör. style.css?v=2, ?subject=…)
      assert.match(deger, /^(?:#[\w-]+|(?:[\w-]+\.(?:html|css|js)|mailto:[\w.@-]+)(?:\?[\w.%=&;+-]*)?)$/,
                   `${ad}: izinsiz bağlantı/kaynak ${deger}`);
    }
  }
  const index = oku(KOK, "www", "index.html");
  assert.doesNotMatch(index, /ad-container|adsbygoogle|firebase|<!--/i);
  // Dönüşüm sitenin sayfasını eklemelerden ÖNCE denetler; eklenen arayüz parçaları (araclar/arayuz.mjs)
  // burada denetlenir: satır içi stil/olay, iframe, dış kaynak yok (CSP zaten çalıştırmazdı)
  assert.doesNotMatch(index, /\sstyle\s*=|\son[a-z]+\s*=|javascript:|<iframe|<object|<embed|<img|<form/i, "index.html'de izinsiz içerik");
  assert.deepEqual(index.match(/<script\b[^>]*>/g), ['<script src="app.js">', '<script src="uygulama.js">', '<script src="yerel.js">']);
  assert.deepEqual(index.match(/<link\b[^>]*>/g), ['<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="uygulama.css">']);
  // Uygulama hiçbir şey toplamaz: analitik, izin bildirimi ve onu açan bağlantı da yok
  assert.doesNotMatch(index, /id="izin|class="izin|cerez-tercihi|sm_izin|Çerez Tercih/i, "uygulamada analitik izin arayüzü kalmış");
  assert.ok(index.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`), "CSP yok");
  assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval|\*|https?:/, "CSP gevşetilmiş");
  for (const ad of ["gizlilik.html", "lisanslar.html"]) {
    assert.ok(oku(KOK, "www", ad).includes(`<meta http-equiv="Content-Security-Policy" content="${SAYFA_CSP}">`), `${ad}: CSP yok`);
  }
  assert.ok(index.includes('<a href="lisanslar.html">'), "oyundan lisanslara bağlantı yok");
  assert.ok(oku(KOK, "www", "gizlilik.html").includes('<a href="lisanslar.html">'), "gizlilikten lisanslara bağlantı yok");
});

test("lisanslar sayfası pakete giren yazılımların lisanslarını aynen içerir", () => {
  // Etiketleri ve boşluk farklarını at; geriye görünen metin kalır
  const duz = (s) => s.replace(/<[^>]+>/g, " ").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&").replace(/\s+/g, " ");
  const sayfa = duz(oku(KOK, "web", "lisanslar.html"));
  // Bir bağımlılık güncellenip lisansı değişirse burada yakalanır
  for (const ad of Object.keys(JSON.parse(oku(KOK, "package.json")).dependencies)) {
    const metin = oku(KOK, "node_modules", ad, "LICENSE").replace(/\s+/g, " ").trim();
    assert.ok(sayfa.includes(metin), `${ad} lisansı lisanslar.html'de aynen yok`);
  }
  for (const parca of [
    "Zemberek-NLP", "github.com/ahmetaa/zemberek-nlp", "Copyright 2018 Ahmet A. Akın, Mehmet D. Akın",
    "Apache Cordova Copyright 2012 The Apache Software Foundation",
    "Apache License Version 2.0, January 2004", "END OF TERMS AND CONDITIONS",
  ]) assert.ok(sayfa.includes(parca), `lisanslar.html: "${parca}" yok`);
  // Fraunces yazı tipi (SIL OFL 1.1): telif satırı ve lisans metni sitedeki dosyayla aynı
  const ofl = oku(SITE, "fonts", "OFL.txt").replace(/\s+/g, " ").trim();
  assert.ok(ofl.startsWith("Copyright 2020 The Fraunces Project Authors"), "OFL.txt beklenen telif satırıyla başlamıyor");
  assert.ok(sayfa.includes(ofl), "Fraunces lisansı (fonts/OFL.txt) lisanslar.html'de aynen yok");
});

test("dönüşüm, sitenin yapısı beklenmedik biçimde değişirse durur", () => {
  const bozuk = [
    ["yeni dış betik", siteIndex.replace("</body>", '<script src="https://ornek.test/x.js"></script></body>')],
    ["yeni satır içi betik", siteIndex.replace("</body>", "<script>alert(1)</script></body>")],
    ["satır içi olay", siteIndex.replace('id="btnShare"', 'id="btnShare" onclick="x()"')],
    ["yeni dış bağlantı", siteIndex.replace("</body>", '<a href="https://ornek.test/">x</a></body>')],
    ["iframe", siteIndex.replace("</body>", '<iframe src="x.html"></iframe></body>')],
    ["Firebase modül betiği geri gelmiş", siteIndex.replace("</body>", '<script type="module">import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js")</script></body>')],
    ["Firebase adı satır içinde geçiyor", siteIndex.replace("</body>", '<script>const firebaseConfig = {}</script></body>')],
    ["temizlik betiği fetch ile veri gönderiyor", siteIndex.replace("deleteDatabase", "deleteDatabase; fetch('x')")],
    ["temizlik betiği betik ekliyor", siteIndex.replace("deleteDatabase", "deleteDatabase; document.createElement('script')")],
    ["temizlik betiği dışarıdan yüklüyor", siteIndex.replace("deleteDatabase", "deleteDatabase; import('x.js')")],
    ["trackEvent geri gelmiş", siteIndex.replace("</body>", '<script>window.trackEvent = () => {}</script></body>')],
    ["reklam alanı sayısı değişti", siteIndex.replace('id="adBottom"', 'id="adBottom" data-x="1"></div><div class="ad-container"')],
    ["analitik izin bildirimi geri gelmiş", siteIndex.replace('<div class="toast"', '<div class="izin" id="izin" hidden></div><div class="toast"')],
    ["çerez tercihleri bağlantısı geri gelmiş", siteIndex.replace('<a href="gizlilik.html">Gizlilik Politikası</a>', '<a href="gizlilik.html">Gizlilik Politikası</a><a href="#cerez-tercihi">Çerez Tercihleri</a>')],
    ["app.js betiği yok", siteIndex.replace('<script src="app.js"></script>', "")],
    ["gizlilik bağlantısı yok", siteIndex.replace('<a href="gizlilik.html">Gizlilik Politikası</a>', "")],
    // Uygulama arayüzünün eklendiği ve bağlandığı yerler
    ["başlık yok", siteIndex.replace('<header class="header">', '<header class="ust">')],
    ["oyun kabuğu değişmiş", siteIndex.replace('<div class="app" id="oyun">', '<div class="app" id="oyun2">')],
    ["ekran klavyesi yok", siteIndex.replace(/<footer class="keyboard"[^>]*><\/footer>/, "")],
    ["nasıl oynanır bölümü değişmiş", siteIndex.replace('<section class="info page" id="nasil-oynanir">', '<section class="info page" id="yardim">')],
    ["örnek açıklaması yok", siteIndex.replace('<p class="legend">', '<p class="aciklama">')],
    ["stil dosyası değişmiş", siteIndex.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="stil.css">')],
    ["yardım bağlantısı düğme olmuş", siteIndex.replace('id="btnHelp" href="#nasil-oynanir"', 'id="btnHelp" type="button"')],
    ["Anladım bağlantısı yok", siteIndex.replace('<a class="btn-primary" href="#oyun">', '<a class="btn-primary" href="#ust">')],
    ["ses düğmesi yok", siteIndex.replace('id="btnMute"', 'id="btnSes"')],
    ["ikinci alt bilgi", siteIndex.replace("</body>", '<nav class="site-footer"></nav></body>')],
    ...SITE_OGELERI.map((parca) => [`"${parca}" yok`, siteIndex.replace(parca, "")]),
  ];
  for (const [ad, html] of bozuk) {
    assert.notEqual(html, siteIndex, `${ad}: deneme girdisi siteden farklı olmalı`);
    assert.throws(() => donustur(html), /index\.html/, ad);
  }
});

test("site temizlik betiğini kaldırsa da dönüşüm çalışır, betik pakete girmez", () => {
  const temizlikli = donustur(siteIndex);
  assert.doesNotMatch(temizlikli, /_ga|deleteDatabase|firebase/i, "temizlik betiği pakete girmiş");
  const betiksiz = siteIndex.replace(/<script>(?:(?!<\/script>)[\s\S])*?deleteDatabase[\s\S]*?<\/script>/, "");
  assert.notEqual(betiksiz, siteIndex, "deneme girdisi siteden farklı olmalı");
  assert.doesNotThrow(() => donustur(betiksiz));
});

test("paylaşım metninde Unicode adres, makine alanlarında punycode", () => {
  const yerel = oku(KOK, "web/yerel.js");
  assert.match(yerel, /const SITE = "https:\/\/sözcükyolu\.com\/";/, "paylaşım adresi Unicode olmalı");
  assert.doesNotMatch(yerel, /xn--/, "yerel.js'te punycode olmamalı (kullanıcıya görünen metin)");
  assert.match(siteIndex, /<link rel="canonical" href="https:\/\/xn--szckyolu-n4a6d\.com\/">/, "sitede canonical punycode kalmalı");
});

test("yerel.js'in app.js'te bağlandığı noktalar duruyor", () => {
  // yerel.js bunları sarar ya da varsayar; site değişirse burada fark edilir
  assert.match(siteApp, /^class WordLadder \{/m, "WordLadder sınıfı");
  assert.match(siteApp, /^  reject\(message\) \{/m, "reject(): geçersiz hamle titreşimi");
  assert.match(siteApp, /^  win\(\) \{/m, "win(): çözüm titreşimi");
  assert.match(siteApp, /^  accept\(word\) \{/m, "accept(): kabul edilen kelimede hafif dokunuş");
  assert.ok(siteApp.includes("await navigator.share({ text: metin })"), "share(): navigator.share({ text })");
  // yerel.js bu adresi (uygulamada capacitor://localhost/) site adresiyle değiştirir
  assert.ok(siteApp.includes("this.paylasimAdresi(location.href)") && siteApp.includes("href.split(/[?#]/)[0]"), "share(): adresin hesaplanışı");
  // Site analitiği kaldırıldı; app.js'te trackEvent çağrısı kalmamalı
  assert.doesNotMatch(siteApp, /trackEvent/, "app.js'te trackEvent kalmış");
  assert.ok(siteApp.includes('fetch("words.json"'), "words.json göreli yoldan okunmalı");
  assert.ok(siteIndex.includes('href="gizlilik.html"'), "gizlilik bağlantısı (uygulamada kendi metnine gider)");
});

test("uygulama.js'in app.js'te bağlandığı noktalar duruyor", () => {
  // uygulama.js bu metotları sarar ya da çağırır, bu alanları okur; site değişirse burada fark edilir
  for (const [desen, ad] of [
    [/^  async init\(\) \{/m, "init(): açılış ekranı → ana ekran"],
    [/^  renderInput\(popLast = false\) \{/m, "renderInput(): metin alanı tamponla eşitlenir"],
    [/^  win\(\) \{/m, "win(): klavye kapanır"],
    [/^  showOffer\(open, tur = "ipucu"\) \{/m, "showOffer(): teklif açıkken klavye kapanır"],
    [/^  showYenile\(open\) \{/m, "showYenile(): yenile onayı açıkken klavye kapanır"],
    [/^  beginRetry\(\) \{/m, "beginRetry(): tekrar başlayınca klavye açılır"],
    [/^  showPes\(open\) \{/m, "showPes(): sonucu göster onayı açıkken klavye kapanır"],
    [/^  showResult\(\) \{/m, "showResult(): yol gösterilince klavye kapanır"],
    [/^  showModal\(\{ oncedenCozuldu = false \} = \{\}\) \{/m, "showModal(): gecikmeli çözüm penceresi yalnızca aynı oyunda açılır"],
    [/^  saveState\(\) \{/m, "saveState(): her modun kaydı"],
    [/^  restoreState\(\) \{/m, "restoreState(): modun kaydından sürdürme"],
    [/^  newGame\(mode = this\.mode\) \{/m, "newGame(mod)"],
    [/^  updateTabs\(\) \{/m, "updateTabs(): başlıktaki mod adı"],
    [/^  tickCountdown\(\) \{/m, "tickCountdown(): ana ekran geri sayımı"],
    [/^  pressKey\(key\) \{/m, "pressKey(): yeni harf"],
    [/^  hideModal\(\) \{/m, "hideModal()"],
    [/^  showModal\(\{ oncedenCozuldu = false \} = \{\}\) \{/m, "showModal(): başka ekrana geçildiyse açılmaz"],
    [/setTimeout\(\(\) => this\.showModal\(\), 650\);/, "win(): pencere prototipteki showModal ile gecikmeli açılır"],
    [/^  freePool\(\) \{/m, "freePool(): serbest bulmaca seçime uyuyor mu"],
    [/^  renderPlus\(\) \{/m, "renderPlus(): ana ekrandaki Plus kartı"],
    [/this\.el\.plusBox\.classList\.toggle\("hidden", !this\.plusAcik\(\)\);/, "Plus kutusu yalnızca kanca Plus satıyorsa görünür"],
    [/showInterstitialAd\(\(\) => this\.newGame\("free"\)\);/, "btnNewGame: uygulamada günlükten serbeste geçiş yönlendirilir"],
    [/if \(this\.over\) \{ this\.el\.btnNewGame\.click\(\); return; \}/, "bitmiş oyunda Enter btnNewGame'e basar"],
    [/^  dailyPuzzle\(\) \{/m, "dailyPuzzle()"],
    [/^  dailyRecord\(\) \{/m, "dailyRecord()"],
    [/^  dayNumber\(\) \{/m, "dayNumber()"],
    [/^  savePref\(anahtar, deger\) \{/m, "savePref()"],
    [/^function muteGame\(mute\) \{/m, "muteGame(): ses tercihi"],
    [/^  static TR_LETTER = /m, "TR_LETTER: Türk alfabesi süzgeci"],
    [/this\.buffer = "";/, "buffer: yazılan kelime"],
    [/this\.gosterilenGun = this\.dayNumber\(\);/, "gosterilenGun"],
    [/this\.lenPref = this\.loadPref\("sm_uzunluk"/, "lenPref"],
    [/this\.diffPref = this\.loadPref\("sm_zorluk"/, "diffPref"],
    [/this\.puzzleDiff = puzzleDiff;/, "puzzleDiff"],
    [/steps:\s+document\.getElementById\("steps"\)/, "el.steps"],
    [/game:\s+document\.getElementById\("game"\)/, "el.game"],
    [/input:\s+document\.getElementById\("inputRow"\)/, "el.input"],
    [/countdown:\s+document\.getElementById\("dailyCountdown"\)/, "el.countdown"],
    [/localStorage\.setItem\("sm_state", JSON\.stringify\(\{\s+v: 1,\s+mode: this\.mode,\s+day: [^\n]+\s+start: [^\n]+\s+target: [^\n]+\s+optimal: [^\n]+\s+puzzleDiff: [^\n]+\s+chain: this\.chain,\s+over: this\.over,/,
      "sm_state alanları (mod kaydı bunları okur)"],
    [/if \(e\.key === "Enter"\) \{/, "Enter: belge düzeyindeki dinleyici kelimeyi gönderir"],
    [/e\.key\.toLocaleUpperCase\("tr-TR"\)/, "bağlı klavyede Türkçe büyük harf"],
  ]) assert.match(siteApp, desen, ad);
  // Sarılan her metot uygulama.js'te gerçekten sarılıyor
  const uygulama = oku(KOK, "web", "uygulama.js");
  for (const ad of ["init", "renderInput", "win", "showModal", "showOffer", "showPes", "showResult", "beginRetry", "saveState", "updateTabs", "tickCountdown"]) {
    assert.ok(uygulama.includes(`P.${ad} = `), `uygulama.js ${ad} metodunu sarmıyor`);
  }
  // Büyük harf Türkçe kuralla: i → İ, ı → I (yerel ayarsız toUpperCase i'yi I yapar)
  assert.ok(uygulama.includes('toLocaleUpperCase("tr-TR")'));
  assert.doesNotMatch(uygulama, /toUpperCase\(\)|toLowerCase\(\)/, "yerel ayarsız büyük/küçük harf dönüşümü");
  assert.deepEqual(["i", "ı", "ş", "ğ", "ç", "ö", "ü"].map((h) => h.toLocaleUpperCase("tr-TR")), ["İ", "I", "Ş", "Ğ", "Ç", "Ö", "Ü"]);
  // Uygulama betiği dışarıya hiçbir şey göndermez, dinamik kod çalıştırmaz
  assert.doesNotMatch(uygulama, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|import\(|eval\(|new Function|innerHTML|document\.write|insertAdjacentHTML/);
});

test("uygulama.css yalnızca sitenin tasarım belirteçlerini kullanır", () => {
  const css = oku(KOK, "web", "uygulama.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // Sabit renk, dış kaynak, içe aktarma yok
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|url\(|@import|expression\(/i);
  // Kullanılan her belirteç sitenin style.css'inde tanımlı (iki tanesi uygulama.js'ten gelir)
  const tanimli = new Set([...oku(SITE, "style.css").matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
  const kullanilan = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  assert.ok(kullanilan.size > 20, "belirteç bulunamadı: desen bozulmuş olabilir");
  for (const ad of kullanilan) {
    assert.ok(tanimli.has(ad) || ["--vvh", "--vv-top"].includes(ad), `uygulama.css tanımsız belirteç kullanıyor: ${ad}`);
  }
  // Sitenin gizlediği ya da yeniden düzenlediği sınıflar style.css'te duruyor
  const stil = oku(SITE, "style.css");
  for (const sinif of [".app", ".mode-tabs", ".free-settings", ".keyboard", ".brand-game", ".toast", ".modal-overlay", ".info",
                       ".modal-close", ".cap", ".btn-group", ".pick-btn", ".btn-primary", ".icon-btn", ".site-footer", ".game.bitti"]) {
    assert.ok(stil.includes(sinif + " ") || stil.includes(sinif + ",") || stil.includes(sinif + ":") || stil.includes(sinif + "."), `style.css'te ${sinif} yok`);
  }
});

test("bağımlılıklar kesin sürümlü ve izinli listede", () => {
  const paket = JSON.parse(oku(KOK, "package.json"));
  // Yeni paket ya da eklenti eklemek sahip onayı ister (ekip/KURALLAR.md 8)
  // Reklam eklentisi sahip kararıdır (13 Kasım 2026): yalnızca @capacitor-community/admob.
  // Satın alma eklentisi yok: StoreKit köprüsü uygulamanın içinde (ios/App/App/SatinAlma.swift).
  assert.deepEqual(Object.keys(paket.dependencies).sort(),
                   ["@capacitor-community/admob", "@capacitor/core", "@capacitor/haptics", "@capacitor/ios", "@capacitor/share"]);
  // 8.3.0 yeni ve iki haftalık bir bağımlılık ekliyor (@webview-native-ui/engine, yalnızca yerel reklam
  // ögeleri için); kullanmadığımız şey için tedarik zinciri yüzeyi açılmaz.
  assert.equal(paket.dependencies["@capacitor-community/admob"], "8.2.1");
  const kilit = JSON.parse(oku(KOK, "package-lock.json")).packages;
  assert.equal(kilit["node_modules/@capacitor-community/admob"]?.version, "8.2.1");
  assert.ok(!kilit["node_modules/@webview-native-ui/engine"], "admob'un 8.3.0 bağımlılığı girmiş");
  assert.deepEqual(Object.keys(paket.devDependencies).sort(), ["@capacitor/cli", "playwright"]);
  for (const [ad, surum] of Object.entries({ ...paket.dependencies, ...paket.devDependencies })) {
    assert.match(surum, /^\d+\.\d+\.\d+$/, `${ad}: sürüm kesin olmalı (${surum})`);
  }
  assert.ok(existsSync(join(KOK, "package-lock.json")), "package-lock.json depoda olmalı");
});

test("uygulama uzak adres yüklemez", () => {
  const ayar = JSON.parse(oku(KOK, "capacitor.config.json"));
  assert.equal(ayar.webDir, "www");
  assert.equal(ayar.server, undefined, "server.url / allowNavigation kullanılmamalı");
});

test("Xcode ayarları", () => {
  execFileSync("node", [join(KOK, "araclar/ios-ayarla.mjs"), "--denetle"], { stdio: "pipe" });
  const proje = oku(KOK, "ios/App/App.xcodeproj/project.pbxproj");
  const say = (desen) => (proje.match(desen) || []).length;
  assert.equal(say(/TARGETED_DEVICE_FAMILY = 1;/g), 2, "yalnızca iPhone");
  assert.equal(say(/TARGETED_DEVICE_FAMILY/g), 2);
  assert.equal(say(/IPHONEOS_DEPLOYMENT_TARGET = 15\.0;/g), say(/IPHONEOS_DEPLOYMENT_TARGET/g), "en düşük iOS 15.0");
  assert.equal(say(/CURRENT_PROJECT_VERSION = 1;/g), 2);
  assert.match(proje, /developmentRegion = tr;/);
  assert.match(proje, /PrivacyInfo\.xcprivacy in Resources \*\/,/, "gizlilik bildirimi pakete girmiyor");
  assert.doesNotMatch(proje, /DEVELOPMENT_TEAM|PROVISIONING_PROFILE/, "imzalama bilgisi depoya yazılmamalı");
  // Site CSS'i güvenli alanı (env(safe-area-inset-*)) bilmiyor; içeriği çentik ve
  // ana ekran çubuğundan web görünümü uzak tutar. Kalkarsa başlık durum çubuğunun altına girer.
  assert.equal(JSON.parse(oku(KOK, "capacitor.config.json")).ios?.contentInset, "always", "ios.contentInset 'always' olmalı");
  assert.doesNotMatch(siteIndex, /viewport-fit\s*=\s*cover/, "site viewport-fit=cover kullanıyor: contentInset kararını yeniden düşünün");

  const plist = oku(KOK, "ios/App/App/Info.plist");
  const deger = (anahtar) => (plist.match(new RegExp(`<key>${anahtar}</key>\\s*(<[^>]+>(?:[^<]*</string>)?)`)) || [])[1];
  assert.equal(deger("CFBundleDevelopmentRegion"), "<string>tr</string>");
  assert.equal(deger("ITSAppUsesNonExemptEncryption"), "<false/>");
  assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/,
               "yalnızca dikey");
  assert.doesNotMatch(plist, /~ipad/);
  // Tek izin istemi App Tracking Transparency (sahip kararı, 13 Kasım 2026). Başka bir izin
  // açıklaması, arka plan kipi ya da ATS istisnası eklenirse sahip onayı gerekir.
  assert.deepEqual(plist.match(/<key>\w*UsageDescription<\/key>/g), ["<key>NSUserTrackingUsageDescription</key>"]);
  assert.doesNotMatch(plist, /UIBackgroundModes|NSAppTransportSecurity/);
  assert.match(deger("NSUserTrackingUsageDescription"), /^<string>[^<]*reklam[^<]*diğer uygulama ve sitelerdeki[^<]*<\/string>$/, "ATT metni Türkçe olmalı, reklamı ve diğer uygulama/sitelerdeki kullanımı anlatmalı");
  // AdMob: uygulama kimliği yoksa Google SDK başlarken uygulamayı çökertir; gelir.json ile aynı olmalı
  assert.equal(deger("GADApplicationIdentifier"), `<string>${gelir.admobAppId}</string>`);
  // SKAdNetwork: Google'ın istediği liste (50 kimlik, benzersiz, Google'ın kendi kimliği dahil)
  const skan = [...plist.matchAll(/<key>SKAdNetworkIdentifier<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  assert.equal(skan.length, 50);
  assert.equal(new Set(skan).size, 50);
  assert.ok(skan.every((k) => /^[a-z0-9]{10}\.skadnetwork$/.test(k)));
  assert.ok(skan.includes("cstr6suwn9.skadnetwork"));
  // Açılış ekranı (açık kâğıt zemin) için koyu durum çubuğu yazısı. Açıldıktan sonra
  // SystemBars yönetir; bunun için görünüm denetleyicisi tabanlı görünüm açık kalmalı.
  assert.equal(deger("UIStatusBarStyle"), "<string>UIStatusBarStyleDarkContent</string>");
  assert.equal(deger("UIViewControllerBasedStatusBarAppearance"), "<true/>");

  // Gizlilik bildirimi (Google'ın 13.11.0 SDK bildirimiyle doğrulandı): uygulamanın KENDİ kodu izleme
  // yapmaz, bu yüzden NSPrivacyTracking false; reklam SDK'sı kendi bildirimini taşır. (App Store
  // Connect gizlilik etiketinde yine "Tracking = Yes" denir: SAHIP-ADIMLARI 9.6.) Toplanan veri türleri
  // SDK'dakilerle aynen yinelenir. İzleme alan adı LİSTELENMEZ: iOS, izin verilmediğinde listedeki
  // adlara bağlantıyı keser; kişiselleştirilmemiş reklamlar da yüklenemezdi.
  const gizlilik = oku(KOK, "ios/App/App/PrivacyInfo.xcprivacy").replace(/\s+/g, "");
  assert.ok(gizlilik.includes("<key>NSPrivacyTracking</key><false/>"));
  for (const dizi of ["NSPrivacyTrackingDomains", "NSPrivacyAccessedAPITypes"]) {
    assert.ok(gizlilik.includes(`<key>${dizi}</key><array/>`), `${dizi} boş olmalı`);
  }
  const veriler = [...gizlilik.matchAll(/<key>NSPrivacyCollectedDataType<\/key><string>NSPrivacyCollectedDataType(\w+)<\/string>/g)].map((m) => m[1]);
  assert.deepEqual(veriler.sort(), ["AdvertisingData", "CoarseLocation", "CrashData", "DeviceID", "OtherDiagnosticData", "PerformanceData", "ProductInteraction"]);
  assert.equal((gizlilik.match(/<key>NSPrivacyCollectedDataTypeTracking<\/key><true\/>/g) || []).length, 1, "yalnızca cihaz kimliği izleme için");
  assert.match(gizlilik, /DeviceID<\/string><key>NSPrivacyCollectedDataTypeLinked<\/key><true\/><key>NSPrivacyCollectedDataTypeTracking<\/key><true\/>/);

  // Yerel Plus köprüsü uygulamanın içinde: dosya, projeye kayıtlı, kök görünüm
  const swift = oku(KOK, "ios/App/App/SatinAlma.swift");
  assert.match(swift, /class AnaGorunum: CAPBridgeViewController/);
  assert.ok(swift.includes("bridge?.registerPluginInstance(SatinAlmaPlugin())"));
  assert.ok(swift.includes('public let jsName = "SatinAlma"'));
  for (const yontem of ["durum", "fiyat", "satinAl", "geriYukle", "vitrin"]) {
    assert.ok(swift.includes(`CAPPluginMethod(name: "${yontem}"`) && swift.includes(`@objc func ${yontem}(`), `SatinAlma.${yontem}`);
  }
  assert.equal(say(/path = SatinAlma\.swift;/g), 1, "SatinAlma.swift dosya olarak kayıtlı olmalı");
  assert.equal(say(/SatinAlma\.swift in Sources/g), 2, "SatinAlma.swift derleme aşamasında olmalı");
  // Kök görünüm SceneDelegate'te kodla kurulur (storyboard'daki sınıf kullanılmaz); AnaGorunum olmalı,
  // yoksa Plus eklentisi köprüye hiç kaydolmaz (simülatör işinde yakalanır)
  assert.match(oku(KOK, "ios/App/App/SceneDelegate.swift"), /window\?\.rootViewController = AnaGorunum\(\)/);
  assert.doesNotMatch(oku(KOK, "ios/App/App/SceneDelegate.swift"), /CAPBridgeViewController\(\)/);
  assert.match(oku(KOK, "ios/App/CapApp-SPM/Package.swift"), /CapacitorCommunityAdmob/, "cap sync: Package.swift admob'u içermiyor");
});

test("simge ve açılış görseli doğru boyutta, alfasız ve kaynağıyla aynı", () => {
  for (const { ad, kaynak, kenar, hedefler } of GORSELLER) {
    for (const hedef of hedefler) gorselDenetle(hedef, kenar);
    // Tasarım takımı asıl dosyayı ekleyince geçici görsel burada yakalanır
    if (existsSync(join(SITE, kaynak))) {
      for (const hedef of hedefler) {
        assert.ok(readFileSync(hedef).equals(readFileSync(join(SITE, kaynak))),
                  `${ad} güncel değil: npm run gorsel çalıştırıp sonucu işleyin`);
      }
    }
  }
});

test("iş akışları: sabit eylem sürümü, dar yetki, gizli bilgi yalnızca Secrets'tan", () => {
  for (const ad of ["test.yml", "testflight.yml", "simulator.yml"]) {
    const akis = oku(KOK, ".github/workflows", ad);
    const eylemler = akis.match(/uses:.*/g) || [];
    assert.ok(eylemler.length > 0, `${ad}: eylem yok`);
    for (const e of eylemler) assert.match(e, /^uses: [\w./-]+@[0-9a-f]{40} # v[\d.]+$/, `${ad}: ${e} commit SHA'sına sabitlenmeli`);
    assert.match(akis, /^permissions:\n  contents: read\n(?!  )/m, `${ad}: permissions yalnızca contents: read olmalı`);
    assert.doesNotMatch(akis, /pull_request_target/, ad);
    // PR'dan ya da elle girilen metin kabukta doğrudan açılmamalı (env üzerinden geçer)
    for (const blok of akis.split(/\n\s+run: /).slice(1)) {
      assert.doesNotMatch(blok.split(/\n\s+- name:/)[0], /\$\{\{/, `${ad}: run içinde \${{ }} kullanılmamalı`);
    }
  }
  const tf = oku(KOK, ".github/workflows/testflight.yml");
  assert.match(tf, /^on:\n  workflow_dispatch:/m, "TestFlight yalnızca elle çalışmalı");
  assert.doesNotMatch(tf, /^  (push|pull_request|schedule):/m);
  // Gizli bilgiler korumalı ortamda: dal kuralı olmadan başka dal anahtarı okuyabilir
  assert.equal(isler(tf).yukle?.ortam, "testflight", "yukle işi testflight ortamında çalışmalı");
  // Hiçbir iş akışında ortamsız iş gizli bilgiye erişmemeli
  for (const ad of readdirSync(join(KOK, ".github/workflows"))) {
    const akis = oku(KOK, ".github/workflows", ad);
    assert.doesNotMatch(akis.split(/^jobs:\n/m)[0], /secrets\./, `${ad}: gizli bilgi işlerin dışında kullanılıyor`);
    for (const [is, { ortam, metin }] of Object.entries(isler(akis))) {
      if (ortam !== "testflight") assert.doesNotMatch(metin, /secrets\./, `${ad}: ${is} işi ortamsız gizli bilgi kullanıyor`);
    }
  }
});

test("otomatik oynama betiği yalnızca simülatör iş akışında, paketlere girmez", () => {
  // www/ (dolayısıyla npm run ios:sync ve TestFlight) betiği içermez
  assert.ok(!existsSync(join(KOK, "www", "otomatik-oyna.js")));
  assert.doesNotMatch(oku(KOK, "www", "index.html"), /otomatik-oyna/);
  for (const yol of ["package.json", "capacitor.config.json", "araclar/web-esitle.mjs", "araclar/arayuz.mjs", "web/uygulama.js",
                     ".github/workflows/test.yml", ".github/workflows/testflight.yml"]) {
    assert.doesNotMatch(oku(KOK, yol), /otomatik-oyna|simulator\.sh/, `${yol} simülatör betiğine dokunmamalı`);
  }
  // Betiği yalnızca simulator.sh ekler; o da derlemeden hemen önce, imzasız simülatör paketine
  const sh = oku(KOK, "araclar/simulator.sh");
  assert.ok(sh.includes('cp "$KOK/araclar/otomatik-oyna.js" "$PUBLIC/"'));
  assert.match(sh, /-sdk iphonesimulator .*\n.* CODE_SIGNING_ALLOWED=NO$/m, "yalnızca imzasız simülatör derlemesi");
  assert.doesNotMatch(sh, /archive|exportArchive|iphoneos\b|DEVELOPMENT_TEAM|ASC_/, "simulator.sh dağıtım derlemesi yapmamalı");

  // Simülatör iş akışı gizli bilgi ve testflight ortamı kullanmaz; yazma yetkisi
  // yalnızca main'de çalışan yayinla işinde, derleme işinde değil
  const sim = oku(KOK, ".github/workflows/simulator.yml");
  assert.doesNotMatch(sim, /environment:|secrets\./);
  assert.match(sim, /^  push:\n    branches: \[main\]$/m);
  const is = isler(sim);
  assert.deepEqual(Object.keys(is).filter((ad) => /contents: write/.test(is[ad].metin)), ["yayinla"]);
  assert.match(is.yayinla.metin, /^    if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'$/m);
  assert.doesNotMatch(is.ekran.metin, /permissions:|github\.token|GH_TOKEN/);
});

test("gelir.json: kimlikler biçimli; TestFlight denetimi test kimliğini yakalar", () => {
  assert.deepEqual(kimlikHatalari(gelir), [], "gelir.json biçimi");
  assert.equal(gelir.plusUrunId, undefined, "Plus ürün kimliği gelir.json'da değil, yerelde (SatinAlma.swift) sabit");
  // Ürün kimliği yalnızca yerel tarafta: Swift sabiti = paket kimliği + ".plus"; JS göndermez, StoreKit dosyası aynı
  const urunKimligi = `${JSON.parse(oku(KOK, "capacitor.config.json")).appId}.plus`;
  assert.ok(oku(KOK, "ios/App/App/SatinAlma.swift").includes(`private let urun = "${urunKimligi}"`));
  assert.doesNotMatch(oku(KOK, "ios/App/App/SatinAlma.swift"), /call\.getString\("urun"\)/, "ürün kimliği JS'ten kabul edilmemeli");
  assert.doesNotMatch(oku(KOK, "web/yerel.js"), /plusUrunId|urun:/, "yerel.js ürün kimliği göndermemeli");
  assert.equal(JSON.parse(oku(KOK, "ios/App/Plus.storekit")).products[0].productID, urunKimligi);
  // Geliştirmede test kimliği serbest, yayın denetiminde hata
  const testMi = JSON.stringify(gelir).includes(TEST_YAYINCI);
  assert.equal(kimlikHatalari(gelir, { yayin: true }).length > 0, testMi);
  const test = { ...gelir, admobAppId: `ca-app-pub-${TEST_YAYINCI}~1458002511` };
  assert.match(kimlikHatalari(test, { yayin: true }).join("\n"), /TEST reklam kimlikleri/);
  // Gerçek görünümlü (uydurma) kimlikler yayın denetiminden geçer
  const gercek = { ...gelir, admobAppId: "ca-app-pub-1234567890123456~1111111111",
    oduluId: "ca-app-pub-1234567890123456/2222222222", gecisId: "ca-app-pub-1234567890123456/3333333333" };
  assert.deepEqual(kimlikHatalari(gercek, { yayin: true }), []);
  // Karışık (test + gerçek) ya da bozuk kimlik yakalanır
  assert.ok(kimlikHatalari({ ...gercek, gecisId: gelir.gecisId }).some((h) => /farklı yayıncı/.test(h)));
  assert.ok(kimlikHatalari({ ...gercek, oduluId: "x" }).some((h) => /oduluId/.test(h)));
  // Komut satırı denetimi: test kimlikleri varken (bu depoda varsayılan) sıfırdan farklı çıkış
  if (testMi) {
    assert.throws(() => execFileSync("node", [join(KOK, "araclar/yayin-denetle.mjs")], { stdio: "pipe" }), /TEST reklam kimlikleri/);
  }
});

test("TestFlight iş akışı, arşivden önce yayın denetimini atlanamaz biçimde çalıştırır", () => {
  const tf = oku(KOK, ".github/workflows/testflight.yml");
  const is = isler(tf).yukle.metin;
  // Adımın tam bloğu: "- name:" satırından sonraki "- name:" satırına kadar
  const adimlar = is.split(/^(?=      - (?:name|uses):)/m);
  const blok = adimlar.find((a) => a.includes("yayin-denetle"));
  assert.ok(blok, "yayın denetimi adımı yok");
  const satirlar = blok.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  assert.equal(satirlar.length, 2, `adım yalnızca "name" ve "run" içermeli:\n${blok}`);
  assert.match(satirlar[0], /^      - name: /);
  assert.equal(satirlar[1], "        run: node araclar/yayin-denetle.mjs", "run tam bu olmalı (|| true, shell: vb. yok)");
  // Koşul ya da hata yutma hiçbir yerde: ne adımda ne iş düzeyinde ne iş akışı düzeyinde
  assert.doesNotMatch(tf, /^\s*if:/m, "iş akışında hiçbir if: olmamalı");
  assert.doesNotMatch(tf, /continue-on-error/, "continue-on-error olmamalı");
  // Sıra: cap sync'ten sonra (paketlenen dosyalara bakar), arşivden önce; aynı işte
  const denetim = is.indexOf("yayin-denetle");
  assert.ok(is.lastIndexOf("npx cap sync ios", denetim) > 0, "denetim cap sync'ten sonra olmalı");
  assert.ok(denetim < is.indexOf("xcodebuild archive"), "denetim arşivden önce olmalı");
});

test("www/yerel.js: gelir ayarı gelir.json'dan gelir, yer tutucu kalmaz", () => {
  const yerel = oku(KOK, "www", "yerel.js");
  assert.ok(yerel.includes(`const AYAR = ${JSON.stringify(gelir)};`));
  assert.ok(!yerel.includes("GELIR_AYAR"));
  assert.ok(oku(KOK, "web", "yerel.js").includes("const AYAR = /*GELIR_AYAR*/ null;"));
});

test("cihazda saklanan her sm_* kayıt adı gizlilik metninde listelidir", () => {
  // yerel.js ve (site yeni bir anahtar eklerse) app.js: gizlilik metni kayıt adlarını sayar
  const adlar = new Set([...oku(KOK, "web", "yerel.js").matchAll(/["'`](sm_[a-z_]+)/g)].map((m) => m[1]));
  for (const [, ad] of oku(KOK, "web", "uygulama.js").matchAll(/["'`](sm_[a-z_]+)/g)) adlar.add(ad);
  for (const ad of ["sm_mod_daily", "sm_mod_free", "sm_ses", "sm_serit"]) assert.ok(adlar.has(ad), `uygulama.js'te ${ad} bulunamadı: desen bozulmuş olabilir`);
  // Kayıt adları uygulama.js'te birleştirilerek üretilmez: yukarıdaki tarama her adı tam görmeli
  assert.doesNotMatch(oku(KOK, "web", "uygulama.js"), /["'`]sm_[a-z_]*["'`]\s*\+/, "sm_* adı birleştirilerek üretiliyor: gizlilik denetimi göremez");
  for (const [, ad] of siteApp.matchAll(/["'`](sm_[a-z_]+)/g)) adlar.add(ad);
  assert.ok(adlar.has("sm_plus"), "sm_plus bulunamadı: desen bozulmuş olabilir");
  const gizlilik = oku(KOK, "web", "gizlilik.html");
  // Plus kapalıyken (PLUS_ACIK = false) sm_plus yazılmaz, yalnızca silinir; gizlilik metni Plus'tan söz etmez.
  // Plus açılırken bayrakla birlikte metne sm_plus ve satın alma bölümü geri konur.
  const plusKapali = oku(KOK, "web", "yerel.js").includes("const PLUS_ACIK = false;");
  if (plusKapali) { adlar.delete("sm_plus"); assert.doesNotMatch(gizlilik, /Plus|StoreKit|sm_plus/, "Plus kapalıyken gizlilik metni Plus'a değinmemeli"); }
  for (const ad of adlar) assert.ok(gizlilik.includes(ad), `gizlilik.html "${ad}" kaydını listelemiyor`);
  // "Reklam Tercihleri" bağlantısı alt bilgiyle birlikte ana ekranın altındadır (uygulama.js taşır)
  assert.match(gizlilik.replace(/\s+/g, " "), /ana ekranın altındaki "Reklam Tercihleri" bağlantısını/);
  assert.doesNotMatch(gizlilik, /oyunun alt bilgisindeki/);
});

test("simülatör betiği yerel.js'ten önce yüklenir (reklam/ATT bayrağı)", () => {
  const sh = oku(KOK, "araclar/simulator.sh");
  assert.match(sh, /<script src="otomatik-oyna\.js"><\/script>\\n  \$&/, "otomatik-oyna.js yerel.js'ten önce eklenmeli");
  assert.match(oku(KOK, "araclar/otomatik-oyna.js"), /^window\.SM_OTOMATIK = true;$/m);
  assert.ok(oku(KOK, "web/yerel.js").includes("window.SM_OTOMATIK === true"));
});

test("site, yalnızca yerel.js'in tanımladığı gelir kancalarını çağırır", () => {
  // Oyun ekibi kancayı eklediğinde sözleşme dışı bir ad çağrılırsa burada fark edilir
  const tanimli = ["plusMu", "plusFiyat", "odulluReklam", "gecisReklami", "plusSatinAl", "plusGeriYukle"];
  const yerel = oku(KOK, "web", "yerel.js");
  for (const ad of tanimli) assert.ok(new RegExp(`\\b${ad}\\b`).test(yerel), `yerel.js ${ad} tanımlamıyor`);
  const cagrilan = [...siteApp.matchAll(/SozcukGelir\??\.(\w+)/g)].map((m) => m[1])
    .concat([...siteApp.matchAll(/kancaya\("(\w+)"/g)].map((m) => m[1]));
  for (const ad of cagrilan) assert.ok(tanimli.includes(ad), `app.js tanımsız kancayı çağırıyor: ${ad}`);
});

test("Swift paketleri Package.resolved ile revision'a kilitli", () => {
  const dosya = JSON.parse(oku(KOK, "ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"));
  const pin = Object.fromEntries(dosya.pins.map((p) => [p.identity, p.state]));
  assert.deepEqual(Object.keys(pin).sort(), ["capacitor-swift-pm", "swift-package-manager-google-mobile-ads",
                                              "swift-package-manager-google-user-messaging-platform"]);
  // Sürüm ve tam commit SHA'sı (git ls-remote ile doğrulandı); bir etiket kaydırılırsa derleme durur
  assert.deepEqual(pin["capacitor-swift-pm"], { revision: "b945758eaf3f034cea377e3138a60611cb40a88b", version: "8.6.2" });
  assert.deepEqual(pin["swift-package-manager-google-mobile-ads"], { revision: "d1fa1f5c1dfe3b43d56c73f4de388ad3316618bc", version: "13.11.0" });
  assert.deepEqual(pin["swift-package-manager-google-user-messaging-platform"], { revision: "13b248eaa73b7826f0efb1bcf455e251d65ecb1b", version: "3.1.0" });
  // Derleme yalnızca bu dosyadaki sürümleri kullanır
  for (const yol of [".github/workflows/testflight.yml", "araclar/simulator.sh"]) {
    const metin = oku(KOK, yol);
    for (const komut of metin.match(/xcodebuild (?:archive|build|-resolvePackageDependencies)(?:[^\n]*\\\n)*[^\n]*/g) || []) {
      assert.match(komut, /-onlyUsePackageVersionsFromResolvedFile/, `${yol}: ${komut.split("\n")[0]}`);
    }
  }
  assert.match(oku(KOK, "araclar/simulator.sh"), /-resolvePackageDependencies -onlyUsePackageVersionsFromResolvedFile/);
});

test("package-lock.json yalnızca izinli paketleri içerir", () => {
  const adlar = Object.keys(JSON.parse(oku(KOK, "package-lock.json")).packages).filter(Boolean)
    .map((k) => k.replace("node_modules/", "")).sort();
  // Yeni (geçişli dahil) paket eklemek bu listeyi bilerek güncellemeyi gerektirir
  const IZINLI = [
  "@capacitor-community/admob", "@capacitor/cli", "@capacitor/core", "@capacitor/haptics",
  "@capacitor/ios", "@capacitor/share", "@ionic/cli-framework-output", "@ionic/utils-array",
  "@ionic/utils-fs", "@ionic/utils-fs/node_modules/fs-extra", "@ionic/utils-object", "@ionic/utils-process",
  "@ionic/utils-stream", "@ionic/utils-subprocess", "@ionic/utils-terminal", "@isaacs/fs-minipass",
  "@isaacs/nonrecursive-glob-match", "@rdlabo/capacitor-docgen", "@types/fs-extra", "@types/node",
  "@types/slice-ansi", "@xmldom/xmldom", "ansi-regex", "ansi-styles",
  "astral-regex", "at-least-node", "balanced-match", "base64-js",
  "big-integer", "bplist-creator", "bplist-parser", "brace-expansion",
  "buffer-crc32", "chownr", "color-convert", "color-name",
  "colorette", "commander", "cross-spawn", "debug",
  "define-lazy-prop", "elementtree", "emoji-regex", "env-paths",
  "fd-slicer", "fs-extra", "github-slugger", "glob",
  "graceful-fs", "inherits", "ini", "is-docker",
  "is-fullwidth-code-point", "is-wsl", "isexe", "jsonfile",
  "kleur", "lru-cache", "minimatch", "minimist",
  "minipass", "minizlib", "ms", "native-run",
  "open", "package-json-from-dist", "path-key", "path-scurry",
  "pend", "playwright", "playwright-core", "plist",
  "prompts", "prompts/node_modules/kleur", "readable-stream", "rimraf",
  "safe-buffer", "sax", "semver", "shebang-command",
  "shebang-regex", "signal-exit", "simple-plist", "simple-plist/node_modules/bplist-parser",
  "sisteransi", "slice-ansi", "split2", "stream-buffers",
  "string-width", "string_decoder", "strip-ansi", "tar",
  "through2", "tree-kill", "tslib", "typescript",
  "undici-types", "universalify", "untildify", "util-deprecate",
  "which", "wrap-ansi", "xcode", "xml2js",
  "xml2js/node_modules/xmlbuilder", "xmlbuilder", "yallist", "yauzl"
  ];
  assert.deepEqual(adlar, IZINLI);
});

test("yayın denetimi: pakette simülatör betiği ve test reklam seçenekleri yakalanır", () => {
  const dizin = mkdtempSync(join(tmpdir(), "paket-"));
  try {
    writeFileSync(join(dizin, "yerel.js"), "const x = 1;");
    writeFileSync(join(dizin, "index.html"), "<script src=\"yerel.js\"></script>");
    assert.deepEqual(paketHatalari(dizin), [], "temiz paket");
    const dene = (ad, dosya, icerik, desen) => {
      writeFileSync(join(dizin, dosya), icerik);
      assert.match(paketHatalari(dizin).join("\n"), desen, ad);
      rmSync(join(dizin, dosya)); writeFileSync(join(dizin, "yerel.js"), "const x = 1;");
    };
    dene("simülatör betiği", "otomatik-oyna.js", "x", /otomatik-oyna\.js/);
    dene("bayrak", "baska.js", "window.SM_OTOMATIK = true;", /SM_OTOMATIK/);
    dene("index'te betik", "index.html", "<script src=\"otomatik-oyna.js\"></script>", /otomatik-oyna betiğini/);
    for (const yasak of ["isTesting", "initializeForTesting", "debugGeography"]) {
      dene(yasak, "yerel.js", `AdMob.initialize({ ${yasak}: true })`, new RegExp(yasak));
    }
    // yerel.js'in kendi bayrak OKUMASI ("=== true") hata sayılmaz
    writeFileSync(join(dizin, "yerel.js"), "const k = window.SM_OTOMATIK === true;");
    assert.deepEqual(paketHatalari(dizin), []);
  } finally { rmSync(dizin, { recursive: true, force: true }); }
  // Gerçek senkronize paket de temiz olmalı (yalnızca cap sync sonrası vardır)
  const gercek = join(KOK, "ios/App/App/public");
  if (existsSync(join(gercek, "yerel.js")) && !existsSync(join(gercek, "otomatik-oyna.js"))) assert.deepEqual(paketHatalari(gercek), []);
});

// Basit YAML ayrıştırma: jobs: altındaki her 2 boşluk girintili anahtar bir iştir.
// shortcut: akış biçimli ({...}) ya da çapalı YAML'ı anlamaz; iş akışları blok biçiminde yazılır.
function isler(akis) {
  const sonuc = {};
  const govde = akis.split(/^jobs:\n/m)[1] || "";
  for (const blok of govde.split(/^(?=  [\w-]+:\s*$)/m)) {
    const ad = blok.match(/^  ([\w-]+):/)?.[1];
    if (!ad) continue;
    sonuc[ad] = { ortam: blok.match(/^    environment:\s*(\S+)\s*$/m)?.[1], metin: blok };
  }
  return sonuc;
}
