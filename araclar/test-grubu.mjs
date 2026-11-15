#!/usr/bin/env node
/* Bir TestFlight derlemesini dış test grubuna ekler (App Store Connect API).
 *
 *   node araclar/test-grubu.mjs --derleme 7 [--not "metin"] [--kuru]
 *
 * Gizli bilgiler ortamdan (ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8); yalnızca
 * .github/workflows/test-grubu.yml, testflight ortamında. --kuru yalnızca okur.
 * Yapar: "neyi test etmeli" metni (tr), gruba ekleme, gerekirse beta incelemesine gönderme.
 * Yapmaz: test kullanıcısı ekleme/silme. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { apiIstemci, jwt } from "./magaza-kayit.mjs";

export const GRUP_ADI = "1. Seviye Test";
export const VARSAYILAN_NOT = "Günün bulmacasını ve serbest oyunu oyna. Geri al, ipucu ve Sonucu göster düğmelerini dene. Hata görürsen ekran görüntüsüyle bildir.";

export async function grubaEkle({ fetch: f = fetch, token, bundleId, derleme, not = VARSAYILAN_NOT, kuru = true, log = console.log }) {
  if (!/^\d+$/.test(derleme ?? "")) throw new Error("derleme yalnızca rakam olmalı");
  const api = apiIstemci(f, token);
  const yaz = async (yontem, yol, govde) => {
    log(`${kuru ? "[kuru] " : ""}${yontem} ${yol}\n  ${JSON.stringify(govde?.data?.attributes ?? govde?.data ?? "")}`);
    return kuru ? { data: { id: "KURU" } } : api(yontem, yol, govde);
  };
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).data[0];
  if (!app) throw new Error(`Uygulama bulunamadı: ${bundleId}`);
  const b = (await api("GET", `/v1/builds?filter[app]=${app.id}&filter[version]=${derleme}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`)).data[0];
  if (!b) throw new Error(`Derleme ${derleme} bulunamadı ya da işlenmesi bitmedi (VALID değil).`);
  const grup = (await api("GET", `/v1/apps/${app.id}/betaGroups?limit=200`)).data
    .find((g) => g.attributes.name === GRUP_ADI && !g.attributes.isInternalGroup);
  if (!grup) throw new Error(`Dış test grubu bulunamadı: "${GRUP_ADI}"`);

  const yer = (await api("GET", `/v1/builds/${b.id}/betaBuildLocalizations`)).data.find((d) => d.attributes.locale === "tr");
  if (yer) await yaz("PATCH", `/v1/betaBuildLocalizations/${yer.id}`, { data: { type: "betaBuildLocalizations", id: yer.id, attributes: { whatsNew: not } } });
  else await yaz("POST", "/v1/betaBuildLocalizations", { data: { type: "betaBuildLocalizations", attributes: { locale: "tr", whatsNew: not },
    relationships: { build: { data: { type: "builds", id: b.id } } } } });

  await yaz("POST", `/v1/betaGroups/${grup.id}/relationships/builds`, { data: [{ type: "builds", id: b.id }] });

  // Yalnızca incelemeye hazırsa gönderilir; bekleyen/onaylı/reddedilmiş olanlara dokunulmaz
  const durum = (await api("GET", `/v1/builds/${b.id}/buildBetaDetail`)).data?.attributes?.externalBuildState;
  if (durum === "READY_FOR_BETA_SUBMISSION") {
    await yaz("POST", "/v1/betaAppReviewSubmissions", { data: { type: "betaAppReviewSubmissions",
      relationships: { build: { data: { type: "builds", id: b.id } } } } });
  } else log(`Beta incelemesi gönderilmedi (durum: ${durum ?? "bilinmiyor"}).`);
  log(kuru ? "Kuru çalıştırma bitti; hiçbir şey değişmedi." : `Bitti: derleme ${derleme} → "${GRUP_ADI}".`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const deger = (ad) => { const i = arg.indexOf(ad); return i < 0 ? undefined : arg[i + 1]; };
  const e = process.env, temiz = (s = "") => s.replace(/\s/g, "");
  for (const ad of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) if (!e[ad]) { console.error(`Eksik gizli bilgi: ${ad}`); process.exit(1); }
  try {
    await grubaEkle({
      token: jwt({ keyId: temiz(e.ASC_KEY_ID), issuerId: temiz(e.ASC_ISSUER_ID), p8: e.ASC_KEY_P8 }),
      bundleId: JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8")).appId,
      derleme: deger("--derleme"), not: deger("--not") || undefined, kuru: arg.includes("--kuru"),
    });
  } catch (err) { console.error(err.message); process.exit(1); }
}
