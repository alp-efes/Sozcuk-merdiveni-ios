#!/usr/bin/env node
/* =========================================================
 * Yayın denetimi: derlemeye Google'ın TEST reklam kimlikleri girmesin.
 *
 *   node araclar/yayin-denetle.mjs
 *
 * TestFlight iş akışı arşivden önce çalıştırır; test kimliği varsa derleme durur.
 * (TestFlight'a giden derleme App Store'a gönderilen derlemedir.) Hem gelir.json'a
 * hem de derlemeye girecek dosyalara (Info.plist, paketlenmiş yerel.js) bakar.
 * Geliştirme ve PR testlerinde test kimlikleri serbesttir; `npm test` yalnızca
 * biçimi denetler (testler/paket.test.mjs).
 * ========================================================= */
import { existsSync, readFileSync } from "node:fs";
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
  if (!/^[A-Za-z0-9._-]+$/.test(String(gelir.plusUrunId))) hatalar.push("gelir.json: plusUrunId geçersiz");
  if (yayin && yayincilar.has(TEST_YAYINCI)) {
    hatalar.push("gelir.json Google'ın TEST reklam kimliklerini içeriyor: AdMob'daki gerçek kimlikleri yazın (SAHIP-ADIMLARI)");
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
  if (!existsSync(join(KOK, "ios/App/App/public/yerel.js"))) hatalar.push("ios/App/App/public/yerel.js yok: önce npx cap sync ios");
  if (hatalar.length) {
    for (const h of hatalar) console.error("::error::" + h);
    process.exit(1);
  }
  console.log("Reklam kimlikleri gerçek ve tutarlı.");
}
