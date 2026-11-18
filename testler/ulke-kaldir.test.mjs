/* Ülkeden kaldırma betiği: ağsız, sahte fetch ile. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ulkeKaldir } from "../araclar/ulke-kaldir.mjs";

function sahte({ chnAcik = true, ikiSayfa = false } = {}) {
  const istekler = [];
  const yanit = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
  const ta = (id, ulke, available) => ({ id, attributes: { available, contentStatuses: ["AVAILABLE"] }, relationships: { territory: { data: { type: "territories", id: ulke } } } });
  const f = async (url, { method, body }) => {
    const yol = url.replace("https://api.appstoreconnect.apple.com", "");
    istekler.push({ method, yol, body: body && JSON.parse(body) });
    if (yol.startsWith("/v1/apps?")) return yanit({ data: [{ id: "A1" }] });
    if (yol === "/v1/apps/A1/appAvailabilityV2") return yanit({ data: { id: "AV1" } });
    if (yol.startsWith("/v2/appAvailabilities/AV1/territoryAvailabilities?include=territory")) return yanit(ikiSayfa
      ? { data: [ta("T1", "TUR", true)], links: { next: "https://api.appstoreconnect.apple.com/v2/appAvailabilities/AV1/territoryAvailabilities?cursor=2" } }
      : { data: [ta("T1", "TUR", true), ta("T2", "CHN", chnAcik)] });
    if (yol.includes("cursor=2")) return yanit({ data: [ta("T2", "CHN", chnAcik)] });
    if (method === "PATCH") return yanit({ data: { id: "T2", attributes: { available: false, contentStatuses: ["PROCESSING_TO_NOT_AVAILABLE"] } } });
    throw new Error("beklenmeyen istek " + yol);
  };
  return { f, istekler };
}
const yazmalar = (i) => i.filter((x) => x.method !== "GET");

test("gerçek kip: yalnızca CHN kapatılır", async () => {
  const { f, istekler } = sahte();
  await ulkeKaldir({ fetch: f, token: "t", bundleId: "x.y", ulke: "CHN", kuru: false, log: () => {} });
  assert.deepEqual(yazmalar(istekler).map((i) => `${i.method} ${i.yol}`), ["PATCH /v1/territoryAvailabilities/T2"]);
  assert.deepEqual(yazmalar(istekler)[0].body, { data: { type: "territoryAvailabilities", id: "T2", attributes: { available: false } } });
});

test("ikinci sayfadaki ülke de bulunur", async () => {
  const { f, istekler } = sahte({ ikiSayfa: true });
  await ulkeKaldir({ fetch: f, token: "t", bundleId: "x.y", ulke: "CHN", kuru: false, log: () => {} });
  assert.deepEqual(yazmalar(istekler).map((i) => i.yol), ["/v1/territoryAvailabilities/T2"]);
});

test("kuru kip ve zaten kapalı: hiçbir yazma gitmez", async () => {
  for (const s of [{ a: { kuru: true } }, { s: { chnAcik: false }, a: { kuru: false } }]) {
    const { f, istekler } = sahte(s.s);
    await ulkeKaldir({ fetch: f, token: "t", bundleId: "x.y", ulke: "CHN", log: () => {}, ...s.a });
    assert.deepEqual(yazmalar(istekler), []);
  }
});

test("geçersiz ya da listede olmayan ülke: yazmadan durur", async () => {
  const { f, istekler } = sahte();
  await assert.rejects(ulkeKaldir({ fetch: f, token: "t", bundleId: "x.y", ulke: "chn;ls", log: () => {} }), /3 büyük harfli/);
  await assert.rejects(ulkeKaldir({ fetch: f, token: "t", bundleId: "x.y", ulke: "VNM", kuru: false, log: () => {} }), /listesinde yok/);
  assert.deepEqual(yazmalar(istekler), []);
});

test("iş akışı: yalnızca elle, main, testflight ortamı, kuru varsayılan", () => {
  const w = readFileSync(new URL("../.github/workflows/ulke-kaldir.yml", import.meta.url), "utf8");
  assert.match(w, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(w, /^  (push|pull_request|schedule):/m);
  assert.match(w, /environment: testflight/);
  assert.match(w, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(w, /kuru:\n(?:        .*\n)*?        default: true/);
});
