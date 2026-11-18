#!/usr/bin/env node
/* Uygulamayı bir App Store ülkesinde/bölgesinde satıştan kaldırır (App Store Connect API).
 *
 *   node araclar/ulke-kaldir.mjs --ulke CHN [--kuru]
 *
 * Sahip isteği (18 Kasım 2026): Çin anakarası kaldırılsın (oyun lisansı ve AI/güvenlik
 * değerlendirmesi uyum maddeleri). Gizli bilgiler ortamdan (ASC_KEY_ID, ASC_ISSUER_ID,
 * ASC_KEY_P8); yalnızca .github/workflows/ulke-kaldir.yml, testflight ortamında.
 * Apple belgesi: GET /v1/apps/{id}/appAvailabilityV2 → GET /v2/appAvailabilities/{id}/territoryAvailabilities
 * (include=territory) → PATCH /v1/territoryAvailabilities/{id} { available: false }.
 * Yapar: yalnızca verilen tek ülkeyi kapatır. Yapmaz: başka ülkeye dokunmak, ülke eklemek. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { apiIstemci, jwt } from "./magaza-kayit.mjs";

export async function ulkeKaldir({ fetch: f = fetch, token, bundleId, ulke, kuru = true, log = console.log }) {
  if (!/^[A-Z]{3}$/.test(ulke ?? "")) throw new Error("ülke 3 büyük harfli App Store bölge kodu olmalı (ör. CHN)");
  const api = apiIstemci(f, token);
  const app = (await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`)).data[0];
  if (!app) throw new Error(`Uygulama bulunamadı: ${bundleId}`);
  const uygunluk = (await api("GET", `/v1/apps/${app.id}/appAvailabilityV2`)).data;
  if (!uygunluk?.id) throw new Error("Uygulamanın ülke ayarı (appAvailabilityV2) bulunamadı");

  let yol = `/v2/appAvailabilities/${uygunluk.id}/territoryAvailabilities?include=territory&limit=200`;
  let hedef;
  while (yol && !hedef) {
    const sayfa = await api("GET", yol);
    hedef = sayfa.data.find((t) => t.relationships?.territory?.data?.id === ulke);
    const sonraki = sayfa.links?.next;
    yol = sonraki ? sonraki.replace("https://api.appstoreconnect.apple.com", "") : null;
  }
  if (!hedef) throw new Error(`${ulke} bölgesi uygulamanın ülke listesinde yok`);
  log(`${ulke}: available=${hedef.attributes?.available} durum=${(hedef.attributes?.contentStatuses || []).join(",") || "-"}`);
  if (hedef.attributes?.available === false) { log(`${ulke} zaten kapalı; değişiklik yok.`); return; }

  const govde = { data: { type: "territoryAvailabilities", id: hedef.id, attributes: { available: false } } };
  log(`${kuru ? "[kuru] " : ""}PATCH /v1/territoryAvailabilities/${hedef.id}\n  ${JSON.stringify(govde.data.attributes)}`);
  if (kuru) { log("Kuru çalıştırma bitti; hiçbir şey değişmedi."); return; }
  const son = (await api("PATCH", `/v1/territoryAvailabilities/${hedef.id}`, govde)).data;
  log(`Bitti: ${ulke} → available=${son?.attributes?.available} durum=${(son?.attributes?.contentStatuses || []).join(",") || "-"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const deger = (ad) => { const i = arg.indexOf(ad); return i < 0 ? undefined : arg[i + 1]; };
  const e = process.env, temiz = (s = "") => s.replace(/\s/g, "");
  for (const ad of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) if (!e[ad]) { console.error(`Eksik gizli bilgi: ${ad}`); process.exit(1); }
  try {
    await ulkeKaldir({
      token: jwt({ keyId: temiz(e.ASC_KEY_ID), issuerId: temiz(e.ASC_ISSUER_ID), p8: e.ASC_KEY_P8 }),
      bundleId: JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8")).appId,
      ulke: deger("--ulke"), kuru: arg.includes("--kuru"),
    });
  } catch (err) { console.error(err.message); process.exit(1); }
}
