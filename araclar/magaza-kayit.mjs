#!/usr/bin/env node
/* App Store Connect mağaza kaydını magaza/kayit.json'dan doldurur (tr).
 *
 *   node araclar/magaza-kayit.mjs [--kuru] [--derleme 7] [--gorseller KLASÖR]
 *
 * Gizli bilgiler ortamdan: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (yalnızca
 * .github/workflows/magaza-kayit.yml, testflight ortamında). --kuru yalnızca okur.
 * Yapmaz: incelemeye gönderme, review iletişim bilgileri, App Privacy,
 * yaş sınıfı/kategori. Gönderimi sahip yapar.
 * Bağımlılıksız: JWT node:crypto ile, istekler fetch ile. */
import { createHash, createPrivateKey, sign } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.appstoreconnect.apple.com";
// DOĞRULANMADI: 6,9" için Apple'ın güncel adı; GORSEL_TURU ile değiştirilebilir
const GORSEL_TURU = process.env.GORSEL_TURU || "APP_IPHONE_67";
const b64u = (b) => Buffer.from(b).toString("base64url");

export function jwt({ keyId, issuerId, p8 }, simdi = Date.now()) {
  const iat = Math.floor(simdi / 1000);
  const veri = `${b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }))}.${
    b64u(JSON.stringify({ iss: issuerId, iat, exp: iat + 600, aud: "appstoreconnect-v1" }))}`;
  const imza = sign("sha256", Buffer.from(veri), { key: createPrivateKey(p8), dsaEncoding: "ieee-p1363" });
  return `${veri}.${b64u(imza)}`;
}

export async function kayitCalistir({ fetch: f = fetch, token, kayit, bundleId, kuru = true, derleme, gorseller, log = console.log }) {
  // Hata iletisi yalnızca Apple'ın başlık/ayrıntısını taşır; istek başlığı ya da anahtar asla
  async function api(yontem, yol, govde) {
    const r = await f(API + yol, {
      method: yontem,
      headers: { authorization: `Bearer ${token}`, ...(govde && { "content-type": "application/json" }) },
      body: govde && JSON.stringify(govde),
    });
    const metin = await r.text();
    const j = metin ? JSON.parse(metin) : {};
    if (!r.ok) {
      const e = new Error(`${yontem} ${yol} → ${r.status}: ${(j.errors || []).map((x) => `${x.title}: ${x.detail}`).join("; ")}`);
      e.durum = r.status; throw e;
    }
    return j;
  }
  // Salt okunur her çağrı; yazma yalnızca kuru değilse, yoksa planlanan gövde yazılır
  const yaz = async (yontem, yol, govde) => {
    log(`${kuru ? "[kuru] " : ""}${yontem} ${yol}\n  ${JSON.stringify(govde?.data?.attributes ?? govde?.data ?? "")}`);
    return kuru ? { data: { id: "KURU" } } : api(yontem, yol, govde);
  };
  const al = (yol) => api("GET", yol).catch((e) => { if (e.durum === 404) return { data: null }; throw e; });

  const { locale } = kayit;
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).data[0];
  if (!app) throw new Error(`Uygulama bulunamadı: ${bundleId}`);
  const duzenlenebilir = (d) => d.attributes.appStoreState === "PREPARE_FOR_SUBMISSION";
  const surum = (await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data.find(duzenlenebilir);
  if (!surum) throw new Error("Düzenlenebilir iOS sürümü (PREPARE_FOR_SUBMISSION) yok; App Store Connect'te yeni sürüm oluşturun.");
  log(`Sürüm ${surum.attributes.versionString} (${surum.id})`);

  await yaz("PATCH", `/v1/appStoreVersions/${surum.id}`, { data: { type: "appStoreVersions", id: surum.id, attributes: { copyright: kayit.copyright } } });

  // Sürüm yerelleştirmesi (açıklama, anahtar kelimeler, adresler)
  const yer = (await api("GET", `/v1/appStoreVersions/${surum.id}/appStoreVersionLocalizations`)).data.find((d) => d.attributes.locale === locale);
  if (yer) await yaz("PATCH", `/v1/appStoreVersionLocalizations/${yer.id}`, { data: { type: "appStoreVersionLocalizations", id: yer.id, attributes: kayit.surum } });
  const yerId = yer ? yer.id : (await yaz("POST", "/v1/appStoreVersionLocalizations", { data: { type: "appStoreVersionLocalizations", attributes: { locale, ...kayit.surum },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: surum.id } } } } })).data.id;

  // Alt başlık uygulama bilgisi düzeyindedir
  const bilgiler = (await api("GET", `/v1/apps/${app.id}/appInfos`)).data;
  const bilgi = bilgiler.find(duzenlenebilir) || bilgiler[0];
  const bYer = (await api("GET", `/v1/appInfos/${bilgi.id}/appInfoLocalizations`)).data.find((d) => d.attributes.locale === locale);
  if (bYer) await yaz("PATCH", `/v1/appInfoLocalizations/${bYer.id}`, { data: { type: "appInfoLocalizations", id: bYer.id, attributes: kayit.bilgi } });
  else await yaz("POST", "/v1/appInfoLocalizations", { data: { type: "appInfoLocalizations", attributes: { locale, ...kayit.bilgi },
    relationships: { appInfo: { data: { type: "appInfos", id: bilgi.id } } } } });

  // İnceleme notları: iletişim alanlarına dokunulmaz. Contact zorunluysa notlar atlanır, uyarılır.
  try {
    const ayr = (await al(`/v1/appStoreVersions/${surum.id}/appStoreReviewDetail`)).data;
    if (ayr) await yaz("PATCH", `/v1/appStoreReviewDetails/${ayr.id}`, { data: { type: "appStoreReviewDetails", id: ayr.id, attributes: kayit.inceleme } });
    else await yaz("POST", "/v1/appStoreReviewDetails", { data: { type: "appStoreReviewDetails", attributes: kayit.inceleme,
      relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: surum.id } } } } });
  } catch (e) {
    log(`UYARI: inceleme notları yazılamadı (iletişim bilgisi zorunlu olabilir; App Store Connect'te elle girin): ${e.message}`);
  }

  if (derleme) {
    const b = (await api("GET", `/v1/builds?filter[app]=${app.id}&filter[version]=${encodeURIComponent(derleme)}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`)).data[0];
    if (!b) throw new Error(`Derleme ${derleme} bulunamadı ya da işlenmesi bitmedi (VALID değil).`);
    await yaz("PATCH", `/v1/appStoreVersions/${surum.id}/relationships/build`, { data: { type: "builds", id: b.id } });
  }

  if (gorseller) await gorselYukle({ api, yaz, kuru, log, yerId, klasor: gorseller });
  log(kuru ? "Kuru çalıştırma bitti; hiçbir şey değişmedi." : "Bitti. İncelemeye gönderme sahibe kalır.");
}

// Yalnızca gerçek .png dosyaları; sembolik bağ klasör dışındaki dosyayı sızdırabilir
export const gorselDosyalari = (klasor) =>
  readdirSync(klasor).filter((d) => d.endsWith(".png") && lstatSync(join(klasor, d)).isFile()).sort();

async function gorselYukle({ api, yaz, kuru, log, yerId, klasor }) {
  const dosyalar = gorselDosyalari(klasor);
  if (!dosyalar.length) throw new Error(`${klasor} içinde PNG yok`);
  const setler = (await api("GET", `/v1/appStoreVersionLocalizations/${yerId}/appScreenshotSets`).catch(() => ({ data: [] }))).data;
  let set = setler.find((s) => s.attributes.screenshotDisplayType === GORSEL_TURU);
  if (!set) set = (await yaz("POST", "/v1/appScreenshotSets", { data: { type: "appScreenshotSets", attributes: { screenshotDisplayType: GORSEL_TURU },
    relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: yerId } } } } })).data;
  if (kuru) return log(`[kuru] ${dosyalar.length} görsel (${GORSEL_TURU}) yüklenecek: ${dosyalar.join(", ")}`);
  // Yeniden çalıştırma aynı sonucu versin: kümedeki eskiler silinir
  for (const g of (await api("GET", `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data) await api("DELETE", `/v1/appScreenshots/${g.id}`);
  for (const ad of dosyalar) {
    const yol = join(klasor, ad), veri = readFileSync(yol);
    const g = (await api("POST", "/v1/appScreenshots", { data: { type: "appScreenshots", attributes: { fileName: ad, fileSize: statSync(yol).size },
      relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } } } })).data;
    for (const op of g.attributes.uploadOperations) {
      const h = Object.fromEntries(op.requestHeaders.map((x) => [x.name, x.value]));
      const r = await fetch(op.url, { method: op.method, headers: h, body: veri.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error(`${ad}: yükleme parçası ${r.status}`);
    }
    await api("PATCH", `/v1/appScreenshots/${g.id}`, { data: { type: "appScreenshots", id: g.id, attributes: { uploaded: true, sourceFileChecksum: createHash("md5").update(veri).digest("hex") } } });
    log(`Görsel yüklendi: ${ad}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const deger = (ad) => { const i = arg.indexOf(ad); return i < 0 ? undefined : arg[i + 1]; };
  const e = process.env, temiz = (s = "") => s.replace(/\s/g, "");
  for (const ad of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) if (!e[ad]) { console.error(`Eksik gizli bilgi: ${ad}`); process.exit(1); }
  try {
    await kayitCalistir({
      token: jwt({ keyId: temiz(e.ASC_KEY_ID), issuerId: temiz(e.ASC_ISSUER_ID), p8: e.ASC_KEY_P8 }),
      kayit: JSON.parse(readFileSync(join(KOK, "magaza/kayit.json"), "utf8")),
      bundleId: JSON.parse(readFileSync(join(KOK, "capacitor.config.json"), "utf8")).appId,
      kuru: arg.includes("--kuru"), derleme: deger("--derleme"), gorseller: deger("--gorseller"),
    });
  } catch (err) { console.error(err.message); process.exit(1); }
}
