#!/usr/bin/env node
/* =========================================================
 * Paket kimliği, görünen ad ve sürümü tek kaynaktan Xcode projesine yazar.
 *
 *   node araclar/ios-ayarla.mjs           # yaz
 *   node araclar/ios-ayarla.mjs --denetle # yazma; fark varsa hata ver (test kullanır)
 *
 * Kaynak: capacitor.config.json (appId, appName), package.json (version) ve
 * gelir.json (admobAppId → Info.plist GADApplicationIdentifier).
 * Bunları değiştirdikten sonra çalıştırın; Xcode dosyalarını elle düzenlemeyin.
 * ========================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oku = (yol) => readFileSync(join(KOK, yol), "utf8");
const { appId, appName } = JSON.parse(oku("capacitor.config.json"));
const { version } = JSON.parse(oku("package.json"));
const { admobAppId } = JSON.parse(oku("gelir.json"));

// Bu değerler Xcode dosyalarına ham metin olarak girer; beklenmeyen karakter dosyayı bozar
if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(appId)) throw new Error(`Geçersiz paket kimliği: ${appId}`);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Geçersiz sürüm: ${version}`);
if (!/^ca-app-pub-\d{16}~\d{10}$/.test(admobAppId)) throw new Error(`Geçersiz AdMob uygulama kimliği: ${admobAppId}`);
if (/[<>&]/.test(appName)) throw new Error(`Görünen adda < > & olamaz: ${appName}`);

const DOSYALAR = {
  "ios/App/App.xcodeproj/project.pbxproj": [
    [/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${appId};`, 2],
    [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`, 2],
  ],
  "ios/App/App/Info.plist": [
    [/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*/g, `$1${appName}`, 1],
    [/(<key>GADApplicationIdentifier<\/key>\s*<string>)[^<]*/g, `$1${admobAppId}`, 1],
  ],
};

const denetle = process.argv.includes("--denetle");
let fark = false;
for (const [yol, kurallar] of Object.entries(DOSYALAR)) {
  const eski = oku(yol);
  let yeni = eski;
  for (const [desen, deger, adet] of kurallar) {
    const n = (yeni.match(desen) || []).length;
    if (n !== adet) throw new Error(`${yol}: ${desen} ${n} kez bulundu, ${adet} olmalı`);
    yeni = yeni.replace(desen, deger);
  }
  if (yeni === eski) continue;
  fark = true;
  if (denetle) console.error(`${yol} güncel değil`);
  else { writeFileSync(join(KOK, yol), yeni); console.log(`${yol} güncellendi`); }
}
if (denetle && fark) {
  console.error("Xcode projesi capacitor.config.json / package.json ile uyumsuz: npm run ios:ayarla");
  process.exit(1);
}
