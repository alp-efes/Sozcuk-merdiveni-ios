/* Paketin bütünlüğü: eşitleme ve dönüşüm, site bağlantı noktaları, bağımlılıklar,
 * Xcode ayarları, görseller, iş akışları. Tarayıcı gerektirmez.
 * `npm test` önce eşitlemeyi çalıştırır; www/ buraya hazır gelir. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AYNEN, CSP, SITE, WWW_DOSYALARI, donustur } from "../araclar/web-esitle.mjs";
import { GORSELLER, gorselDenetle } from "../araclar/gorsel.mjs";
import { TEST_YAYINCI, kimlikHatalari } from "../araclar/yayin-denetle.mjs";

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
// Site adresi paylaşım metnine yazılır (yerel.js), diğerleri lisans metinlerindedir.
const METIN_ADRESLERI = new Set([
  "https://xn--szckyolu-n4a6d.com/", "https://ionic.io", "https://github.com/ahmetaa/zemberek-nlp",
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

test("yerel.js'in app.js'te bağlandığı noktalar duruyor", () => {
  // yerel.js bunları sarar ya da varsayar; site değişirse burada fark edilir
  assert.match(siteApp, /^class WordLadder \{/m, "WordLadder sınıfı");
  assert.match(siteApp, /^  reject\(message\) \{/m, "reject(): geçersiz hamle titreşimi");
  assert.match(siteApp, /^  win\(\) \{/m, "win(): çözüm titreşimi");
  assert.ok(siteApp.includes("await navigator.share({ text: metin })"), "share(): navigator.share({ text })");
  assert.ok(siteApp.includes("location.href.split(/[?#]/)[0]"), "share(): adresin hesaplanışı");
  // Site analitiği kaldırıldı; app.js'te trackEvent çağrısı kalmamalı
  assert.doesNotMatch(siteApp, /trackEvent/, "app.js'te trackEvent kalmış");
  assert.ok(siteApp.includes('fetch("words.json"'), "words.json göreli yoldan okunmalı");
  assert.ok(siteIndex.includes('href="gizlilik.html"'), "gizlilik bağlantısı (uygulamada kendi metnine gider)");
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
  assert.match(deger("NSUserTrackingUsageDescription"), /^<string>[^<]*reklam[^<]*<\/string>$/, "ATT metni Türkçe ve reklamı anlatmalı");
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

  // Gizlilik bildirimi (Google'ın 13.11.0 SDK bildirimiyle doğrulandı): SDK'nın kendi bildirimi toplanan
  // veri türlerini ve gerekçeli API'leri taşır ama NSPrivacyTracking içermez; izleme beyanı uygulamanındır.
  // Toplanan veri türleri SDK'dakilerle aynen yinelenir (App Store gizlilik etiketiyle tutarlı).
  // İzleme alan adı LİSTELENMEZ: Google kendi bildiriminde de listelemiyor ve iOS, izin verilmediğinde
  // listedeki adlara bağlantıyı keser; kişiselleştirilmemiş reklamlar da yüklenemezdi.
  const gizlilik = oku(KOK, "ios/App/App/PrivacyInfo.xcprivacy").replace(/\s+/g, "");
  assert.ok(gizlilik.includes("<key>NSPrivacyTracking</key><true/>"));
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
  for (const yontem of ["durum", "fiyat", "satinAl", "geriYukle"]) {
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
  for (const yol of ["package.json", "capacitor.config.json", "araclar/web-esitle.mjs",
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
  assert.equal(gelir.plusUrunId, "com.sozcukyolu.sozcukmerdiveni.plus");
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

test("TestFlight iş akışı, arşivden önce yayın denetimini çalıştırır", () => {
  const tf = oku(KOK, ".github/workflows/testflight.yml");
  const denetim = tf.indexOf("run: node araclar/yayin-denetle.mjs");
  assert.ok(denetim > 0, "yayın denetimi adımı yok");
  assert.ok(tf.lastIndexOf("npx cap sync ios", denetim) > 0, "denetim cap sync'ten sonra olmalı (paketlenen dosyalara bakar)");
  assert.ok(denetim < tf.indexOf("xcodebuild archive"), "denetim arşivden önce olmalı");
  // Denetim bir koşula bağlanıp atlanamaz
  assert.doesNotMatch(tf.slice(tf.lastIndexOf("- name:", denetim), denetim), /^\s+if:/m);
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
  for (const [, ad] of siteApp.matchAll(/["'`](sm_[a-z_]+)/g)) adlar.add(ad);
  assert.ok(adlar.has("sm_plus"), "sm_plus bulunamadı: desen bozulmuş olabilir");
  const gizlilik = oku(KOK, "web", "gizlilik.html");
  for (const ad of adlar) assert.ok(gizlilik.includes(ad), `gizlilik.html "${ad}" kaydını listelemiyor`);
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
