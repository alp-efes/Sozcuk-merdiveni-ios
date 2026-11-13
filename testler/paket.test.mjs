/* Paketin bütünlüğü: eşitleme ve dönüşüm, site bağlantı noktaları, bağımlılıklar,
 * Xcode ayarları, görseller, iş akışları. Tarayıcı gerektirmez.
 * `npm test` önce eşitlemeyi çalıştırır; www/ buraya hazır gelir. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AYNEN, CSP, SITE, WWW_DOSYALARI, donustur } from "../araclar/web-esitle.mjs";
import { GORSELLER, gorselDenetle } from "../araclar/gorsel.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oku = (...yol) => readFileSync(join(...yol), "utf8");
const siteIndex = oku(SITE, "index.html");
const siteApp = oku(SITE, "app.js");

test("www/ yalnızca beklenen dosyaları içerir", () => {
  assert.deepEqual(readdirSync(join(KOK, "www")).sort(), [...WWW_DOSYALARI].sort());
});

test("site dosyaları değiştirilmeden kopyalanır", () => {
  for (const ad of AYNEN) {
    assert.ok(readFileSync(join(KOK, "www", ad)).equals(readFileSync(join(SITE, ad))), `${ad} siteyle aynı değil`);
  }
});

// Yalnızca metin olarak geçebilecek adresler; hiçbiri bağlantı ya da kaynak değildir.
// Site adresi paylaşım metnine yazılır (yerel.js), diğerleri lisans metinlerindedir.
const METIN_ADRESLERI = new Set([
  "https://xn--szckyolu-n4a6d.com/", "https://ionic.io", "https://github.com/ahmetaa/zemberek-nlp",
  "http://www.apache.org/", "http://www.apache.org/licenses/", "http://www.apache.org/licenses/LICENSE-2.0",
]);
// Uygulamanın kendi sayfaları: yalnızca paketteki stil dosyası yüklenir
const SAYFA_CSP = "default-src 'none'; style-src 'self' capacitor://localhost; base-uri 'none'; form-action 'none'";

test("paketteki hiçbir dosya dış adres, reklam ya da analitik içermez", () => {
  for (const ad of WWW_DOSYALARI) {
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
  // Uygulama hiçbir şey toplamaz: analitik izin bildirimi ve onu açan bağlantı da yok
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
});

test("dönüşüm, sitenin yapısı beklenmedik biçimde değişirse durur", () => {
  const bozuk = [
    ["yeni dış betik", siteIndex.replace("</body>", '<script src="https://ornek.test/x.js"></script></body>')],
    ["yeni satır içi betik", siteIndex.replace("</body>", "<script>alert(1)</script></body>")],
    ["satır içi olay", siteIndex.replace('id="btnShare"', 'id="btnShare" onclick="x()"')],
    ["yeni dış bağlantı", siteIndex.replace("</body>", '<a href="https://ornek.test/">x</a></body>')],
    ["iframe", siteIndex.replace("</body>", '<iframe src="x.html"></iframe></body>')],
    ["analitik betiği yok", siteIndex.replace(/<script type="module">[\s\S]*?<\/script>/, "")],
    ["reklam alanı sayısı değişti", siteIndex.replace('id="adBottom"', 'id="adBottom" data-x="1"></div><div class="ad-container"')],
    ["analitik izin bildirimi yok", siteIndex.replace('<div class="izin" id="izin"', '<div class="x" id="izin"')],
    ["çerez tercihleri bağlantısı yok", siteIndex.replace('<a href="#cerez-tercihi">Çerez Tercihleri</a>', "")],
    ["app.js betiği yok", siteIndex.replace('<script src="app.js"></script>', "")],
    ["gizlilik bağlantısı yok", siteIndex.replace('<a href="gizlilik.html">Gizlilik Politikası</a>', "")],
  ];
  for (const [ad, html] of bozuk) {
    assert.notEqual(html, siteIndex, `${ad}: deneme girdisi siteden farklı olmalı`);
    assert.throws(() => donustur(html), /index\.html/, ad);
  }
});

test("yerel.js'in app.js'te bağlandığı noktalar duruyor", () => {
  // yerel.js bunları sarar ya da varsayar; site değişirse burada fark edilir
  assert.match(siteApp, /^class WordLadder \{/m, "WordLadder sınıfı");
  assert.match(siteApp, /^  reject\(message\) \{/m, "reject(): geçersiz hamle titreşimi");
  assert.match(siteApp, /^  win\(\) \{/m, "win(): çözüm titreşimi");
  assert.ok(siteApp.includes("await navigator.share({ text: metin })"), "share(): navigator.share({ text })");
  assert.ok(siteApp.includes("location.href.split(/[?#]/)[0]"), "share(): adresin hesaplanışı");
  // Analitik betiği çıkarıldığı için trackEvent tanımsızdır; her çağrı ?. ile olmalı
  assert.doesNotMatch(siteApp, /trackEvent\s*\(/, "trackEvent güvenli (?.) çağrılmıyor");
  assert.ok(siteApp.includes('fetch("words.json"'), "words.json göreli yoldan okunmalı");
  assert.ok(siteIndex.includes('href="gizlilik.html"'), "gizlilik bağlantısı (uygulamada kendi metnine gider)");
});

test("bağımlılıklar kesin sürümlü ve izinli listede", () => {
  const paket = JSON.parse(oku(KOK, "package.json"));
  // Yeni paket ya da eklenti eklemek sahip onayı ister (ekip/KURALLAR.md 8)
  assert.deepEqual(Object.keys(paket.dependencies).sort(),
                   ["@capacitor/core", "@capacitor/haptics", "@capacitor/ios", "@capacitor/share"]);
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
  // İzin isteyen hiçbir şey yok: izin açıklaması ya da arka plan kipi eklenirse sahip onayı gerekir
  assert.doesNotMatch(plist, /UsageDescription|UIBackgroundModes|NSAppTransportSecurity/);

  const gizlilik = oku(KOK, "ios/App/App/PrivacyInfo.xcprivacy").replace(/\s+/g, "");
  assert.ok(gizlilik.includes("<key>NSPrivacyTracking</key><false/>"));
  for (const dizi of ["NSPrivacyTrackingDomains", "NSPrivacyCollectedDataTypes", "NSPrivacyAccessedAPITypes"]) {
    assert.ok(gizlilik.includes(`<key>${dizi}</key><array/>`), `${dizi} boş olmalı`);
  }
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
  for (const ad of ["test.yml", "testflight.yml"]) {
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
