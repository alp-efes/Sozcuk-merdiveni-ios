#!/usr/bin/env node
/* App Store incelemesi: bekleyen gönderimi geri çeker ya da sürümü incelemeye gönderir.
 *
 *   node araclar/inceleme.mjs --islem iptal|gonder [--kuru]
 *
 * Sahip isteği (18 Kasım 2026): "resubmit et, tüm yetkileri veriyorum". Sıra:
 *   iptal  → bekleyen (WAITING_FOR_REVIEW / READY_FOR_REVIEW / UNRESOLVED_ISSUES) gönderimi geri çeker;
 *            IN_REVIEW'daysa dokunmaz, durur.
 *   (magaza-kayit.yml: metinler + yeni derleme)
 *   gonder → yaş sınıfı beyanını YAS_BEYANI'na göre günceller, sürümü incelemeye gönderir.
 * Gizli bilgiler ortamdan (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8); yalnızca
 * .github/workflows/inceleme.yml, testflight ortamında. --kuru yalnızca okur.
 * Apple belgesi: /v1/apps/{id}/reviewSubmissions, PATCH /v1/reviewSubmissions/{id} {canceled|submitted},
 * POST /v1/reviewSubmissions, POST /v1/reviewSubmissionItems, PATCH /v1/ageRatingDeclarations/{id}. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { apiIstemci, jwt } from "./magaza-kayit.mjs";

// Sahip kararı 2A (18 Kasım 2026, site #52/#53): kaba ve aşağılayıcı sözler sözlükte, anlamı gösterilir,
// ipucu/çözüm yolunda çıkabilir. Yaş anketi buna göre: seyrek/hafif küfür ve kaba söz.
// Diğer alanlara dokunulmaz (App Store Connect'teki cevaplar kalır).
export const YAS_BEYANI = { profanityOrCrudeHumor: "INFREQUENT_OR_MILD" };
const BEKLEYEN = ["WAITING_FOR_REVIEW", "READY_FOR_REVIEW", "UNRESOLVED_ISSUES"];

export async function inceleme({ fetch: f = fetch, token, bundleId, islem, kuru = true, log = console.log, bekle = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!["iptal", "gonder"].includes(islem)) throw new Error("işlem 'iptal' ya da 'gonder' olmalı");
  const api = apiIstemci(f, token);
  const yaz = async (yontem, yol, govde) => {
    log(`${kuru ? "[kuru] " : ""}${yontem} ${yol}\n  ${JSON.stringify(govde?.data?.attributes ?? "")}`);
    return kuru ? { data: { id: "KURU" } } : api(yontem, yol, govde);
  };
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).data[0];
  if (!app) throw new Error(`Uygulama bulunamadı: ${bundleId}`);
  const gonderimler = (await api("GET", `/v1/apps/${app.id}/reviewSubmissions?filter[platform]=IOS&limit=20`)).data;
  for (const g of gonderimler) log(`gönderim ${g.id}: ${g.attributes.state}`);
  const surumler = (await api("GET", `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
  for (const s of surumler) log(`sürüm ${s.attributes.versionString}: ${s.attributes.appVersionState ?? s.attributes.appStoreState}`);

  if (islem === "iptal") {
    if (gonderimler.some((g) => g.attributes.state === "IN_REVIEW")) throw new Error("Gönderim incelemede (IN_REVIEW); geri çekilmedi.");
    const bekleyen = gonderimler.filter((g) => BEKLEYEN.includes(g.attributes.state));
    if (!bekleyen.length) { log("Geri çekilecek gönderim yok."); return; }
    for (const g of bekleyen) await yaz("PATCH", `/v1/reviewSubmissions/${g.id}`, { data: { type: "reviewSubmissions", id: g.id, attributes: { canceled: true } } });
    if (kuru) { log("Kuru çalıştırma bitti; hiçbir şey değişmedi."); return; }
    // CANCELING bitene dek bekle (en çok ~3 dk)
    for (let i = 0; i < 36; i++) {
      const durum = (await api("GET", `/v1/apps/${app.id}/reviewSubmissions?filter[platform]=IOS&limit=20`)).data
        .filter((g) => bekleyen.some((b) => b.id === g.id)).map((g) => g.attributes.state);
      log(`durum: ${durum.join(",")}`);
      if (durum.every((d) => !["CANCELING", ...BEKLEYEN].includes(d))) { log("Bitti: gönderim geri çekildi."); return; }
      await bekle(5000);
    }
    throw new Error("Geri çekme 3 dakikada bitmedi; App Store Connect'e bakın.");
  }

  // gonder
  if (gonderimler.some((g) => ["WAITING_FOR_REVIEW", "IN_REVIEW", "CANCELING"].includes(g.attributes.state)))
    throw new Error("Zaten bekleyen ya da incelenen bir gönderim var; önce 'iptal'.");
  const surum = surumler.find((s) => ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"]
    .includes(s.attributes.appVersionState ?? s.attributes.appStoreState));
  if (!surum) throw new Error("Gönderilecek düzenlenebilir iOS sürümü yok.");
  const derleme = (await api("GET", `/v1/appStoreVersions/${surum.id}/build`)).data;
  if (!derleme) throw new Error("Sürüme bağlı derleme yok; önce magaza-kayit.yml ile derleme bağlayın.");
  log(`gönderilecek: ${surum.attributes.versionString} (derleme ${derleme.attributes?.version})`);

  const bilgi = (await api("GET", `/v1/apps/${app.id}/appInfos`)).data
    .find(({ attributes: a }) => (a.state ?? a.appStoreState) !== "READY_FOR_DISTRIBUTION");
  if (!bilgi) throw new Error("Düzenlenebilir appInfo yok.");
  const yas = (await api("GET", `/v1/appInfos/${bilgi.id}/ageRatingDeclaration`)).data;
  const fark = Object.fromEntries(Object.entries(YAS_BEYANI).filter(([k, v]) => yas.attributes?.[k] !== v));
  if (Object.keys(fark).length) await yaz("PATCH", `/v1/ageRatingDeclarations/${yas.id}`, { data: { type: "ageRatingDeclarations", id: yas.id, attributes: fark } });
  else log("Yaş beyanı zaten güncel.");

  let gonderim = gonderimler.find((g) => g.attributes.state === "READY_FOR_REVIEW");
  if (!gonderim) gonderim = (await yaz("POST", "/v1/reviewSubmissions", { data: { type: "reviewSubmissions", attributes: { platform: "IOS" },
    relationships: { app: { data: { type: "apps", id: app.id } } } } })).data;
  await yaz("POST", "/v1/reviewSubmissionItems", { data: { type: "reviewSubmissionItems", relationships: {
    reviewSubmission: { data: { type: "reviewSubmissions", id: gonderim.id } },
    appStoreVersion: { data: { type: "appStoreVersions", id: surum.id } } } } });
  await yaz("PATCH", `/v1/reviewSubmissions/${gonderim.id}`, { data: { type: "reviewSubmissions", id: gonderim.id, attributes: { submitted: true } } });
  log(kuru ? "Kuru çalıştırma bitti; hiçbir şey değişmedi." : `Bitti: ${surum.attributes.versionString} (${derleme.attributes?.version}) incelemeye gönderildi.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const deger = (ad) => { const i = arg.indexOf(ad); return i < 0 ? undefined : arg[i + 1]; };
  const e = process.env, temiz = (s = "") => s.replace(/\s/g, "");
  for (const ad of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) if (!e[ad]) { console.error(`Eksik gizli bilgi: ${ad}`); process.exit(1); }
  try {
    await inceleme({
      token: jwt({ keyId: temiz(e.ASC_KEY_ID), issuerId: temiz(e.ASC_ISSUER_ID), p8: e.ASC_KEY_P8 }),
      bundleId: JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8")).appId,
      islem: deger("--islem"), kuru: arg.includes("--kuru"),
    });
  } catch (err) { console.error(err.message); process.exit(1); }
}
