#!/usr/bin/env node
/* Bulut derlemelerinin bıraktığı geliştirme sertifikalarını listeler ya da iptal eder (App Store Connect API).
 *
 *   node araclar/sertifika.mjs --islem liste|temizle [--kuru]
 *
 * Neden (18 Kasım 2026, derleme 13): her TestFlight derlemesi yeni bir makinede arşivlenir ve Xcode
 * otomatik imzada hesaba yeni bir "Apple Development" sertifikası ekler. Sınır dolunca arşiv durur
 * ("Your account has reached the maximum number of certificates").
 * temizle YALNIZCA API anahtarıyla oluşturulmuş (adında "Created via API" geçen) GELİŞTİRME
 * sertifikalarını iptal eder; sahibin kendi Mac'inde oluşturduğu sertifikaya ve dağıtım
 * sertifikalarına dokunmaz. Gizli bilgiler ortamdan; yalnızca sertifika.yml ve testflight.yml, testflight ortamında.
 * Apple belgesi: GET /v1/certificates, DELETE /v1/certificates/{id}. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apiIstemci, jwt } from "./magaza-kayit.mjs";

const GELISTIRME = ["DEVELOPMENT", "IOS_DEVELOPMENT"];
export const bulutSertifikasi = (s) => GELISTIRME.includes(s.attributes?.certificateType)
  && /Created via API/i.test(`${s.attributes?.name ?? ""} ${s.attributes?.displayName ?? ""}`);

export async function sertifika({ fetch: f = fetch, token, islem, kuru = true, log = console.log }) {
  if (!["liste", "temizle"].includes(islem)) throw new Error("işlem 'liste' ya da 'temizle' olmalı");
  const api = apiIstemci(f, token);
  const hepsi = (await api("GET", "/v1/certificates?limit=200&fields[certificates]=name,displayName,certificateType,platform,expirationDate")).data;
  for (const s of hepsi) {
    const a = s.attributes ?? {};
    log(`${bulutSertifikasi(s) ? "[bulut] " : "        "}${a.certificateType} · ${a.name ?? "-"} · ${a.displayName ?? "-"} · ${String(a.expirationDate ?? "").slice(0, 10)}`);
  }
  const silinecek = hepsi.filter(bulutSertifikasi);
  log(`Toplam ${hepsi.length}; bulut geliştirme sertifikası ${silinecek.length}.`);
  if (islem === "liste") return;
  for (const s of silinecek) {
    log(`${kuru ? "[kuru] " : ""}DELETE /v1/certificates/${s.id}`);
    if (!kuru) await api("DELETE", `/v1/certificates/${s.id}`);
  }
  log(kuru ? "Kuru çalıştırma bitti; hiçbir şey değişmedi." : `Bitti: ${silinecek.length} bulut geliştirme sertifikası iptal edildi.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const deger = (ad) => { const i = arg.indexOf(ad); return i < 0 ? undefined : arg[i + 1]; };
  const e = process.env, temiz = (s = "") => s.replace(/\s/g, "");
  for (const ad of ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"]) if (!e[ad]) { console.error(`Eksik gizli bilgi: ${ad}`); process.exit(1); }
  try {
    await sertifika({ token: jwt({ keyId: temiz(e.ASC_KEY_ID), issuerId: temiz(e.ASC_ISSUER_ID), p8: e.ASC_KEY_P8 }),
      islem: deger("--islem"), kuru: arg.includes("--kuru") });
  } catch (err) { console.error(err.message); process.exit(1); }
}
