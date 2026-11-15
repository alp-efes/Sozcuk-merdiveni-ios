/* Test grubu betiği: ağsız, sahte fetch ile. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GRUP_ADI, VARSAYILAN_NOT, grubaEkle } from "../araclar/test-grubu.mjs";

function sahte({ durum = "READY_FOR_BETA_SUBMISSION", yer = false, grup = true } = {}) {
  const istekler = [];
  const yanit = (j, d = 200) => ({ ok: d < 400, status: d, text: async () => JSON.stringify(j) });
  const f = async (url, { method, body }) => {
    const yol = url.replace("https://api.appstoreconnect.apple.com", "");
    istekler.push({ method, yol, body: body && JSON.parse(body) });
    if (yol.startsWith("/v1/apps?")) return yanit({ data: [{ id: "A1" }] });
    if (yol.startsWith("/v1/builds?")) return yanit({ data: [{ id: "B7" }] });
    if (yol.endsWith("/betaGroups?limit=200")) return yanit({ data: grup ? [
      { id: "G0", attributes: { name: GRUP_ADI, isInternalGroup: true } },
      { id: "G1", attributes: { name: GRUP_ADI, isInternalGroup: false } }] : [] });
    if (yol.endsWith("/betaBuildLocalizations")) return yanit({ data: yer ? [{ id: "L1", attributes: { locale: "tr" } }] : [] });
    if (yol.endsWith("/buildBetaDetail")) return yanit({ data: { attributes: { externalBuildState: durum } } });
    return yanit({ data: { id: "YENI" } });
  };
  return { f, istekler };
}
const calistir = async (sec = {}, ...o) => {
  const { f, istekler } = sahte(sec.s);
  await grubaEkle({ fetch: f, token: "t", bundleId: "x.y", derleme: "7", log: () => {}, ...sec.a });
  return istekler.filter((i) => i.method !== "GET");
};

test("gerçek kip: not oluşturulur, dış gruba eklenir, inceleme gönderilir", async () => {
  const y = await calistir({ a: { kuru: false } });
  assert.deepEqual(y.map((i) => `${i.method} ${i.yol}`), [
    "POST /v1/betaBuildLocalizations", "POST /v1/betaGroups/G1/relationships/builds", "POST /v1/betaAppReviewSubmissions"]);
  assert.equal(y[0].body.data.attributes.whatsNew, VARSAYILAN_NOT);
  assert.equal(y[0].body.data.attributes.locale, "tr");
  assert.deepEqual(y[1].body.data, [{ type: "builds", id: "B7" }]);
  assert.equal(y[2].body.data.relationships.build.data.id, "B7");
});

test("mevcut tr notu güncellenir; inceleme zaten gönderilmişse atlanır", async () => {
  const y = await calistir({ s: { yer: true, durum: "IN_BETA_TESTING" }, a: { kuru: false, not: "x" } });
  assert.deepEqual(y.map((i) => `${i.method} ${i.yol}`), ["PATCH /v1/betaBuildLocalizations/L1", "POST /v1/betaGroups/G1/relationships/builds"]);
  assert.equal(y[0].body.data.attributes.whatsNew, "x");
});

test("kuru kip: hiçbir yazma gitmez", async () => {
  assert.deepEqual(await calistir({ a: { kuru: true } }), []);
});

test("grup yoksa yazmadan durur; derleme rakam olmalı", async () => {
  const { f, istekler } = sahte({ grup: false });
  await assert.rejects(grubaEkle({ fetch: f, token: "t", bundleId: "x.y", derleme: "7", kuru: false, log: () => {} }), /bulunamadı/);
  assert.ok(istekler.every((i) => i.method === "GET"));
  await assert.rejects(grubaEkle({ fetch: f, token: "t", bundleId: "x.y", derleme: "7;ls", log: () => {} }), /rakam/);
});

test("iş akışı: yalnızca elle, main, testflight ortamı", () => {
  const w = readFileSync(new URL("../.github/workflows/test-grubu.yml", import.meta.url), "utf8");
  assert.match(w, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(w, /^  (push|pull_request|schedule):/m);
  assert.match(w, /environment: testflight/);
  assert.match(w, /if: github\.ref == 'refs\/heads\/main'/);
});
