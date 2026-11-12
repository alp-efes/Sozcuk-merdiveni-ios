#!/usr/bin/env node
/* =========================================================
 * Uygulama simgesini ve açılış görselini ios/ içine yerleştirir.
 *
 *   node araclar/gorsel.mjs
 *
 * Asıl kaynak tasarım takımının site deposunda ürettiği dosyalardır:
 *   tools/uygulama/simge-1024.png   (1024×1024, alfasız)
 *   tools/uygulama/acilis-2732.png  (2732×2732)
 * Bunlar yoksa GEÇİCİ olarak sitenin favicon.svg'sinden üretilir (Playwright).
 * Sonuç depoya işlenir; testler kaynak ile ios/ içindeki kopyayı karşılaştırır.
 * ========================================================= */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./web-esitle.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KATALOG = join(KOK, "ios/App/App/Assets.xcassets");

export const GORSELLER = [
  { ad: "simge", kaynak: "tools/uygulama/simge-1024.png", kenar: 1024,
    hedefler: ["AppIcon.appiconset/AppIcon-512@2x.png"] },
  { ad: "açılış görseli", kaynak: "tools/uygulama/acilis-2732.png", kenar: 2732,
    hedefler: ["Splash.imageset/splash-2732x2732.png", "Splash.imageset/splash-2732x2732-1.png",
               "Splash.imageset/splash-2732x2732-2.png"] },
].map((g) => ({ ...g, hedefler: g.hedefler.map((h) => join(KATALOG, h)) }));

/** PNG başlığını okur. App Store alfa kanallı simgeyi reddeder. */
export function pngBilgisi(yol) {
  const b = readFileSync(yol);
  if (b.length < 26 || b.toString("latin1", 1, 4) !== "PNG") throw new Error(`${yol} PNG değil`);
  const renkTuru = b[25];   // 4 ve 6: alfa kanallı
  return { en: b.readUInt32BE(16), boy: b.readUInt32BE(20), alfa: renkTuru === 4 || renkTuru === 6 };
}

export function gorselDenetle(yol, kenar) {
  const { en, boy, alfa } = pngBilgisi(yol);
  if (en !== kenar || boy !== kenar) throw new Error(`${yol} ${en}×${boy}; ${kenar}×${kenar} olmalı`);
  if (alfa) throw new Error(`${yol} alfa kanallı; alfasız olmalı`);
}

// Geçici görsel: favicon.svg, köşeleri yuvarlatılmadan (iOS kendisi yuvarlatır),
// koyu zemin üzerinde. Simgede kareyi doldurur, açılışta ortada küçük durur.
async function faviconCiz(kenar, hedef) {
  const { chromium } = await import("playwright");
  const svg = readFileSync(join(SITE, "favicon.svg"), "utf8");
  const tarayici = await chromium.launch();
  try {
    const sayfa = await tarayici.newPage({ viewport: { width: kenar, height: kenar } });
    const oran = kenar === 1024 ? 100 : 30;
    await sayfa.setContent(
      `<body style="margin:0;height:100vh;display:grid;place-items:center;background:#121213">` +
      `<div style="width:${oran}%">${svg}</div>`);
    // Simgede dış dikdörtgenin köşe yuvarlaması kalırsa köşelerde zemin görünür
    if (kenar === 1024) await sayfa.evaluate(() => document.querySelector("svg > rect").removeAttribute("rx"));
    // omitBackground kapalıyken Chromium alfasız (RGB) PNG yazar; aşağıda yine de denetlenir
    await sayfa.screenshot({ path: hedef, omitBackground: false });
  } finally {
    await tarayici.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { ad, kaynak, kenar, hedefler } of GORSELLER) {
    const yol = join(SITE, kaynak);
    if (existsSync(yol)) {
      gorselDenetle(yol, kenar);
      copyFileSync(yol, hedefler[0]);
      console.log(`${ad}: ${kaynak}`);
    } else {
      await faviconCiz(kenar, hedefler[0]);
      gorselDenetle(hedefler[0], kenar);
      console.log(`${ad}: GEÇİCİ (favicon.svg'den üretildi; ${kaynak} henüz yok)`);
    }
    for (const kopya of hedefler.slice(1)) copyFileSync(hedefler[0], kopya);
  }
}
