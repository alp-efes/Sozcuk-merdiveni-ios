#!/usr/bin/env node
/* =========================================================
 * Site deposundaki oyunu www/ içine kopyalar ve uygulama sürümüne çevirir.
 *
 *   node araclar/web-esitle.mjs
 *   SITE_DEPOSU=/baska/yol node araclar/web-esitle.mjs
 *
 * Site deposu varsayılan olarak yandaki klasördür: ../sozcuk-merdiveni
 *
 * Web görünümü hiçbir dış ağ isteği yapmaz: sitedeki reklam, analitik (geri gelirse
 * derleme durur), SEO etiketleri çıkarılır, sıkı bir içerik güvenlik politikası (CSP)
 * eklenir. Reklamlar ve satın alma yerel (native) taraftadır, web görünümünde değil.
 * Site dosyaları elle düzenlenmez; bütün fark buradadır.
 *
 * Bilerek katı: sitenin yapısı beklenenden farklıysa (aranan parça yok,
 * yeni bir betik ya da dış adres eklenmiş) hata verip durur. Böylece site
 * değişikliği uygulamaya fark edilmeden girmez.
 * ========================================================= */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Site deposu: SITE_DEPOSU ortam değişkeni, yoksa yandaki klasör
export const SITE = resolve(process.env.SITE_DEPOSU || join(KOK, "..", "sozcuk-merdiveni"));

// Uygulama yalnızca kendi paketinden yükler. 'self' iOS'ta capacitor://localhost
// demektir; WebKit'in özel şemada 'self' eşlemesine güvenmemek için açıkça da yazıldı.
const KAYNAK = "'self' capacitor://localhost";
export const CSP = [
  "default-src 'none'",
  `script-src ${KAYNAK}`,
  `style-src ${KAYNAK}`,
  `img-src ${KAYNAK}`,
  `font-src ${KAYNAK}`,         // style.css paketteki Fraunces dosyalarını yükler
  `connect-src ${KAYNAK}`,      // words.json fetch ile okunur
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

// Siteden değiştirilmeden kopyalananlar
export const AYNEN = ["app.js", "style.css", "words.json",
  "fonts/fraunces-latin.woff2", "fonts/fraunces-latin-ext.woff2", "fonts/OFL.txt"];
// Uygulamanın kendi dosyaları (web/ içinde)
export const KENDI = ["yerel.js", "gizlilik.html", "lisanslar.html"];
// www/ içinde bulunması gereken her şey (testler bu listeyi denetler)
export const WWW_DOSYALARI = ["index.html", ...KENDI, ...AYNEN];
// web/yerel.js içinde bu yer tutucu bulunur; gelir.json (reklam/Plus kimlikleri, tek yer) buraya yazılır
export const GELIR_YER_TUTUCU = "/*GELIR_AYAR*/ null";

/** index.html'i uygulama sürümüne çevirir. Beklenen yapı yoksa hata fırlatır. */
export function donustur(html) {
  // desen tam olarak `adet` kez (adet yoksa en az bir kez) eşleşmeli
  const degistir = (desen, yeni, ad, adet) => {
    const n = (html.match(desen) || []).length;
    if (adet === undefined ? n < 1 : n !== adet) {
      throw new Error(`index.html beklenen yapıda değil: "${ad}" ${n} kez bulundu` +
                      (adet === undefined ? "" : `, ${adet} olmalı`));
    }
    html = html.replace(desen, yeni);
  };

  // Yorumlar: içlerinde reklam şablonları ve dış adresler var
  degistir(/[ \t]*<!--[\s\S]*?-->\n?/g, "", "yorum");
  // SEO ve sosyal kart etiketleri: uygulamada anlamsız, dış adres içerir
  degistir(/[ \t]*<link rel="canonical"[^>]*>\n?/g, "", "canonical", 1);
  degistir(/[ \t]*<meta (?:property="og:|name="twitter:)[^>]*>\n?/g, "", "og/twitter etiketi");
  degistir(/[ \t]*<link rel="(?:icon|apple-touch-icon)"[^>]*>\n?/g, "", "favicon bağlantısı");
  degistir(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, "", "yapılandırılmış veri", 1);
  // Reklam yer tutucuları
  degistir(/[ \t]*<div class="ad-container[^"]*"[^>]*><\/div>\n?/g, "", "reklam alanı", 2);
  // Site artık analitik içermez (2026-11-13). Eski izleri silen tek satır içi
  // temizlik betiği uygulamada gereksizdir (yeni kurulumda iz yok); çıkarılır,
  // pakete girmez. Siteden kaldırılırsa da sorun değil: 0 ya da 1 kez beklenir.
  // Betik içinde import, adres (http, //host), fetch( ve createElement varsa
  // eşleşmez; betik yerinde kalır ve aşağıdaki betik denetiminde derleme durur.
  const ic = String.raw`(?:(?!<\/script>)(?!import)(?!https?:)(?!\/\/[a-z])(?!fetch\()(?!createElement)[\s\S])*?`;
  const temizlik = new RegExp(String.raw`[ \t]*<script>${ic}_ga${ic}deleteDatabase${ic}<\/script>\n?`, "g");
  if ((html.match(temizlik) || []).length > 1) throw new Error("index.html beklenen yapıda değil: birden çok temizlik betiği");
  html = html.replace(temizlik, "");
  // Analitik ve izin arayüzü geri gelirse (Firebase betiği, izin bildirimi, Çerez
  // Tercihleri bağlantısı) sessizce paketlemek yerine dur: uygulama "veri toplanmıyor" der.
  const analitik = html.match(/firebase|gstatic|trackEvent|type="module"|id="izin|class="izin|cerez-tercihi|sm_izin|Çerez Tercih/i);
  if (analitik) throw new Error(`index.html beklenen yapıda değil: analitik/izin kalıntısı "${analitik[0]}"`);

  // Kalan her dış adres, satır içi betik/stil bilinmeyen bir site değişikliğidir;
  // sessizce paketlemek yerine dur. (CSP eklenmeden önce bakılır: o da adres içerir.)
  const yasak = html.match(/https?:|\/\/[a-z0-9]|<iframe|<object|<embed|\son[a-z]+\s*=|\sstyle\s*=|javascript:/i);
  if (yasak) throw new Error(`index.html'de izin verilmeyen içerik kaldı: "${yasak[0]}"`);

  degistir(/<meta charset="UTF-8">/g,
           `<meta charset="UTF-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`,
           "charset", 1);
  // Açık kaynak lisansları (Capacitor, Zemberek-NLP, Fraunces) uygulamadan erişilebilir olmalı
  degistir(/<a href="gizlilik\.html">Gizlilik Politikası<\/a>/g,
           '$&\n  <a href="lisanslar.html">Lisanslar</a>', "gizlilik bağlantısı", 1);
  degistir(/<script src="app\.js"><\/script>/g,
           '<script src="app.js"></script>\n  <script src="yerel.js"></script>', "app.js betiği", 1);

  const betikler = html.match(/<script\b[^>]*>/g) || [];
  if (betikler.join() !== '<script src="app.js">,<script src="yerel.js">') {
    throw new Error("index.html'de beklenmeyen betik: " + betikler.join(" "));
  }
  return html;
}

export function esitle(site = SITE) {
  const www = join(KOK, "www");
  rmSync(www, { recursive: true, force: true });
  mkdirSync(join(www, "fonts"), { recursive: true });
  writeFileSync(join(www, "index.html"), donustur(readFileSync(join(site, "index.html"), "utf8")));
  for (const ad of AYNEN) copyFileSync(join(site, ad), join(www, ad));
  // gizlilik.html sitenin metninin yerine geçer: uygulamanın reklamı (AdMob), ATT/UMP'si
  // ve Plus'ı sitedekinden farklıdır.
  for (const ad of KENDI) copyFileSync(join(KOK, "web", ad), join(www, ad));
  const yerel = readFileSync(join(www, "yerel.js"), "utf8");
  if (yerel.split(GELIR_YER_TUTUCU).length !== 2) throw new Error("web/yerel.js: gelir ayarı yer tutucusu tam bir kez olmalı");
  const gelir = JSON.parse(readFileSync(join(KOK, "gelir.json"), "utf8"));
  writeFileSync(join(www, "yerel.js"), yerel.replace(GELIR_YER_TUTUCU, () => JSON.stringify(gelir)));
  return www;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(`www/ hazır: ${esitle()}  (kaynak: ${SITE})`);
  } catch (e) {
    console.error("Eşitleme başarısız: " + e.message);
    process.exit(1);
  }
}
