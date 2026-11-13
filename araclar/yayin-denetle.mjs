#!/usr/bin/env node
/* =========================================================
 * Yayın denetimi: derlemeye Google'ın TEST reklam kimlikleri girmesin.
 *
 *   node araclar/yayin-denetle.mjs
 *
 * TestFlight iş akışı arşivden önce çalıştırır; test kimliği varsa derleme durur.
 * (TestFlight'a giden derleme App Store'a gönderilen derlemedir.) Hem gelir.json'a
 * hem de derlemeye girecek dosyalara (Info.plist, paketlenmiş yerel.js) bakar; ayrıca pakette
 * simülatör betiği ya da test reklam seçeneği (isTesting, debugGeography…) kalmamalı.
 * Geliştirme ve PR testlerinde test kimlikleri serbesttir; `npm test` yalnızca
 * biçimi denetler (testler/paket.test.mjs).
 * ========================================================= */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TEST_YAYINCI = "3940256099942544";   // Google'ın herkese açık demo yayıncı kimliği

const BICIM = {
  admobAppId: /^ca-app-pub-(\d{16})~\d{10}$/,
  oduluId: /^ca-app-pub-(\d{16})\/\d{10}$/,
  gecisId: /^ca-app-pub-(\d{16})\/\d{10}$/,
};

/** gelir.json'daki biçim hatalarını döndürür; yayin=true ise test kimliklerini de hata sayar. */
export function kimlikHatalari(gelir, { yayin = false } = {}) {
  const hatalar = [];
  const yayincilar = new Set();
  for (const [anahtar, desen] of Object.entries(BICIM)) {
    const m = String(gelir[anahtar]).match(desen);
    if (!m) hatalar.push(`gelir.json: ${anahtar} biçimi geçersiz`);
    else yayincilar.add(m[1]);
  }
  if (yayincilar.size > 1) hatalar.push("gelir.json: App ID ve reklam birimi kimlikleri farklı yayıncılara ait");
  if (yayin && yayincilar.has(TEST_YAYINCI)) {
    hatalar.push("gelir.json Google'ın TEST reklam kimliklerini içeriyor: AdMob'daki gerçek kimlikleri yazın (SAHIP-ADIMLARI)");
  }
  return hatalar;
}

/**
 * Derlemeye girecek web paketine (ios/App/App/public) bakar: simülatör betiği ve test/hata ayıklama
 * seçenekleri mağaza derlemesine girmemeli.
 */
export function paketHatalari(dizin) {
  const hatalar = [];
  if (!existsSync(join(dizin, "yerel.js"))) return [`${dizin}/yerel.js yok: önce npx cap sync ios`];
  if (existsSync(join(dizin, "otomatik-oyna.js"))) hatalar.push("paket otomatik-oyna.js (simülatör betiği) içeriyor");
  const dosyalar = readdirSync(dizin, { recursive: true, withFileTypes: true }).filter((g) => g.isFile());
  for (const d of dosyalar) {
    if (/\.(woff2|png|jpg)$/.test(d.name)) continue;
    const yol = join(d.parentPath, d.name);
    const metin = readFileSync(yol, "utf8");
    const ad = yol.slice(dizin.length + 1);
    if (/SM_OTOMATIK\s*=(?!=)/.test(metin)) hatalar.push(`paket/${ad} SM_OTOMATIK bayrağını koyuyor (simülatör betiği)`);
    if (ad === "index.html" && metin.includes("otomatik-oyna")) hatalar.push("paket/index.html otomatik-oyna betiğini yüklüyor");
  }
  const yerel = readFileSync(join(dizin, "yerel.js"), "utf8");
  for (const yasak of ["isTesting", "initializeForTesting", "debugGeography"]) {
    if (yerel.includes(yasak)) hatalar.push(`paketlenen yerel.js "${yasak}" içeriyor (test reklam seçeneği)`);
  }
  return hatalar;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hatalar = kimlikHatalari(JSON.parse(readFileSync(join(KOK, "gelir.json"), "utf8")), { yayin: true });
  // Derlemeye girecek dosyalar: gelir.json'dan bağımsız olarak test kimliği taşımamalı
  for (const yol of ["ios/App/App/Info.plist", "ios/App/App/public/yerel.js"]) {
    if (existsSync(join(KOK, yol)) && readFileSync(join(KOK, yol), "utf8").includes(TEST_YAYINCI)) {
      hatalar.push(`${yol} Google test kimliği içeriyor`);
    }
  }
  hatalar.push(...paketHatalari(join(KOK, "ios/App/App/public")));
  if (hatalar.length) {
    for (const h of hatalar) console.error("::error::" + h);
    process.exit(1);
  }
  console.log("Reklam kimlikleri gerçek ve tutarlı.");
}
