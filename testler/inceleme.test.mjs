/* İnceleme betiği: ağsız, sahte fetch ile. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { YAS_BEYANI, inceleme } from "../araclar/inceleme.mjs";

function sahte({ gonderimler = [], surumDurum = "DEVELOPER_REJECTED", derleme = true, yas = "NONE", iptalSonra = "COMPLETE", yayin = "MANUAL", ogeVar = false } = {}) {
  const istekler = [];
  let iptalEdildi = false;
  const yanit = (j) => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
  const f = async (url, { method, body }) => {
    const yol = url.replace("https://api.appstoreconnect.apple.com", "");
    istekler.push({ method, yol, body: body && JSON.parse(body) });
    if (yol.startsWith("/v1/apps?")) return yanit({ data: [{ id: "A1" }] });
    if (yol.startsWith("/v1/apps/A1/reviewSubmissions")) return yanit({ data: gonderimler.map((g) => ({ ...g, attributes: { state: g.state } })) });
    if (/^\/v1\/reviewSubmissions\/\w+$/.test(yol) && method === "GET") return yanit({ data: { attributes: { state: iptalEdildi ? iptalSonra : "CANCELING" } } });
    if (yol.endsWith("/items")) return yanit({ data: ogeVar ? [{ id: "O1" }] : [] });
    if (yol.startsWith("/v1/apps/A1/appStoreVersions")) return yanit({ data: [{ id: "V1", attributes: { versionString: "1.0", appVersionState: surumDurum, releaseType: yayin } }] });
    if (yol === "/v1/appStoreVersions/V1/build") return yanit({ data: derleme ? { id: "B11", attributes: { version: "11" } } : null });
    if (yol === "/v1/apps/A1/appInfos") return yanit({ data: [{ id: "I1", attributes: { state: "PREPARE_FOR_SUBMISSION" } }] });
    if (yol === "/v1/appInfos/I1/ageRatingDeclaration") return yanit({ data: { id: "Y1", attributes: Object.fromEntries(Object.keys(YAS_BEYANI).map((k) => [k, yas])) } });
    if (method === "PATCH" && body?.includes('"canceled":true')) { iptalEdildi = true; return yanit({ data: {} }); }
    if (yol === "/v1/reviewSubmissions" && method === "POST") return yanit({ data: { id: "R9" } });
    return yanit({ data: { id: "X" } });
  };
  return { f, istekler };
}
const yazmalar = (i) => i.filter((x) => x.method !== "GET").map((x) => `${x.method} ${x.yol}`);
const calistir = (s, a) => { const { f, istekler } = sahte(s); return inceleme({ fetch: f, token: "t", bundleId: "x.y", derlemeNo: "11", log: () => {}, bekle: async () => {}, ...a }).then(() => istekler); };

test("iptal: bekleyen gönderim geri çekilir ve bitmesi beklenir", async () => {
  const i = await calistir({ gonderimler: [{ id: "R1", state: "WAITING_FOR_REVIEW" }, { id: "R0", state: "COMPLETE" }] }, { islem: "iptal", kuru: false });
  assert.deepEqual(yazmalar(i), ["PATCH /v1/reviewSubmissions/R1"]);
  assert.deepEqual(i.find((x) => x.method === "PATCH").body.data.attributes, { canceled: true });
});

test("iptal: incelemedeyse dokunmaz; kuru kipte yazmaz", async () => {
  await assert.rejects(calistir({ gonderimler: [{ id: "R1", state: "IN_REVIEW" }] }, { islem: "iptal", kuru: false }), /IN_REVIEW/);
  const i = await calistir({ gonderimler: [{ id: "R1", state: "WAITING_FOR_REVIEW" }] }, { islem: "iptal", kuru: true });
  assert.deepEqual(yazmalar(i), []);
});

test("gonder: yaş beyanı güncellenir, yeni gönderim oluşturulur, sürüm eklenir, gönderilir", async () => {
  const i = await calistir({ gonderimler: [{ id: "R1", state: "COMPLETE" }] }, { islem: "gonder", kuru: false });
  assert.deepEqual(yazmalar(i), ["PATCH /v1/ageRatingDeclarations/Y1", "POST /v1/reviewSubmissions", "POST /v1/reviewSubmissionItems", "PATCH /v1/reviewSubmissions/R9"]);
  assert.deepEqual(i.find((x) => x.yol === "/v1/ageRatingDeclarations/Y1").body.data.attributes, YAS_BEYANI);
  const oge = i.find((x) => x.yol === "/v1/reviewSubmissionItems").body.data.relationships;
  assert.deepEqual([oge.reviewSubmission.data.id, oge.appStoreVersion.data.id], ["R9", "V1"]);
  assert.deepEqual(i.at(-1).body.data.attributes, { submitted: true });
});

test("gonder: yayın türü MANUAL değilse önce MANUAL yapılır (yayına alma sahibindir)", async () => {
  const i = await calistir({ yayin: "AFTER_APPROVAL", yas: "INFREQUENT_OR_MILD" }, { islem: "gonder", kuru: false });
  assert.equal(yazmalar(i)[0], "PATCH /v1/appStoreVersions/V1");
  assert.deepEqual(i.find((x) => x.yol === "/v1/appStoreVersions/V1" && x.method === "PATCH").body.data.attributes, { releaseType: "MANUAL" });
});

test("gonder: yaş güncelse yazılmaz; READY_FOR_REVIEW gönderim yeniden kullanılır", async () => {
  const i = await calistir({ gonderimler: [{ id: "R5", state: "READY_FOR_REVIEW" }], yas: "INFREQUENT_OR_MILD" }, { islem: "gonder", kuru: false });
  assert.deepEqual(yazmalar(i), ["POST /v1/reviewSubmissionItems", "PATCH /v1/reviewSubmissions/R5"]);
});

test("gonder: bekleyen gönderim, derlemesiz ya da düzenlenemez sürümde durur; kuru kipte yazmaz", async () => {
  await assert.rejects(calistir({ gonderimler: [{ id: "R1", state: "WAITING_FOR_REVIEW" }] }, { islem: "gonder", kuru: false }), /önce 'iptal'/);
  await assert.rejects(calistir({ derleme: false }, { islem: "gonder", kuru: false }), /derleme yok/);
  await assert.rejects(calistir({ surumDurum: "READY_FOR_SALE" }, { islem: "gonder", kuru: false }), /düzenlenebilir/);
  assert.deepEqual(yazmalar(await calistir({}, { islem: "gonder", kuru: true })), []);
  await assert.rejects(calistir({}, { islem: "sil" }), /iptal' ya da 'gonder/);
});

test("iş akışı: yalnızca elle, main, testflight ortamı, kuru varsayılan", () => {
  const w = readFileSync(new URL("../.github/workflows/inceleme.yml", import.meta.url), "utf8");
  assert.match(w, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(w, /^  (push|pull_request|schedule):/m);
  assert.doesNotMatch(w, /^  (push|pull_request|pull_request_target|schedule):/m);
  assert.match(w, /^    environment: testflight$/m);
  assert.match(w, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(w, /^      kuru:\n(?:        .*\n)*?        default: true$/m);
  // Aynı gizli bilgi adları testflight.yml'dekilerle; yeni ad yok. Betik gizli bilgiyi yazdırmaz.
  const tf = readFileSync(new URL("../.github/workflows/testflight.yml", import.meta.url), "utf8");
  for (const ad of w.match(/secrets\.\w+/g)) assert.ok(tf.includes(ad), `${ad} testflight.yml'de yok`);
  const betik = readFileSync(new URL("../araclar/inceleme.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(betik, /console\.log\([^)]*(P8|KEY)/);
});

test("iptal: taslak READY_FOR_REVIEW'a dokunmaz; UNRESOLVED_ISSUES geri çekilir; bitmezse zaman aşımı", async () => {
  assert.deepEqual(yazmalar(await calistir({ gonderimler: [{ id: "R2", state: "READY_FOR_REVIEW" }] }, { islem: "iptal", kuru: false })), []);
  assert.deepEqual(yazmalar(await calistir({ gonderimler: [{ id: "R3", state: "UNRESOLVED_ISSUES" }] }, { islem: "iptal", kuru: false })), ["PATCH /v1/reviewSubmissions/R3"]);
  await assert.rejects(calistir({ gonderimler: [{ id: "R4", state: "WAITING_FOR_REVIEW" }], iptalSonra: "CANCELING" }, { islem: "iptal", kuru: false }), /3 dakikada/);
});

test("gonder: reddedilmiş/kapanan gönderim varken durur; derleme eşleşmeli; taslakta öğe varsa yeniden eklenmez", async () => {
  for (const state of ["UNRESOLVED_ISSUES", "COMPLETING"])
    await assert.rejects(calistir({ gonderimler: [{ id: "R1", state }] }, { islem: "gonder", kuru: false }), /önce 'iptal'/);
  await assert.rejects(calistir({}, { islem: "gonder", kuru: false, derlemeNo: "10" }), /beklenen 10/);
  await assert.rejects(calistir({}, { islem: "gonder", kuru: false, derlemeNo: undefined }), /derleme numarası/);
  const i = await calistir({ gonderimler: [{ id: "R5", state: "READY_FOR_REVIEW" }], yas: "INFREQUENT_OR_MILD", ogeVar: true }, { islem: "gonder", kuru: false });
  assert.deepEqual(yazmalar(i), ["PATCH /v1/reviewSubmissions/R5"]);
});
