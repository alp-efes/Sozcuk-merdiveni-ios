/* Mağaza kaydı betiği: ağsız, sahte fetch ile. Kuru kipte yalnızca GET gider ve
 * planlanan PATCH gövdeleri kayit.json'dan çıkar; gerçek kipte PATCH'ler gönderilir. */
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { jwt, kayitCalistir } from "../araclar/magaza-kayit.mjs";

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kayit = JSON.parse(readFileSync(join(KOK, "magaza/kayit.json"), "utf8"));
const tf = readFileSync(join(KOK, ".github/workflows/testflight.yml"), "utf8");

function sahte() {
  const istekler = [];
  const yanit = (j, durum = 200) => ({ ok: durum < 400, status: durum, text: async () => JSON.stringify(j) });
  const f = async (url, { method, body }) => {
    const yol = url.replace("https://api.appstoreconnect.apple.com", "");
    istekler.push({ method, yol, body: body && JSON.parse(body) });
    if (yol.startsWith("/v1/apps?")) return yanit({ data: [{ id: "A1" }] });
    if (yol.includes("/appStoreVersions?")) return yanit({ data: [
      { id: "V0", attributes: { appStoreState: "READY_FOR_SALE", versionString: "0.9" } },
      { id: "V1", attributes: { appStoreState: "PREPARE_FOR_SUBMISSION", versionString: "1.0" } }] });
    if (yol.endsWith("/appStoreVersionLocalizations")) return yanit({ data: [{ id: "L1", attributes: { locale: "tr" } }] });
    if (yol.endsWith("/appInfos")) return yanit({ data: [{ id: "I1", attributes: { appStoreState: "PREPARE_FOR_SUBMISSION" } }] });
    if (yol.endsWith("/appInfoLocalizations")) return yanit({ data: [{ id: "IL1", attributes: { locale: "tr" } }] });
    if (yol.endsWith("/appStoreReviewDetail")) return yanit({ errors: [] }, 404);
    if (yol.startsWith("/v1/builds?")) return yanit({ data: [{ id: "B7" }] });
    return yanit({ data: { id: "YENI" } });
  };
  return { f, istekler };
}
const calistir = async (secenek) => {
  const { f, istekler } = sahte();
  await kayitCalistir({ fetch: f, token: "t", kayit, bundleId: "x.y", log: () => {}, ...secenek });
  return istekler.filter((i) => i.method !== "GET");
};

test("kuru kip: hiçbir yazma isteği gitmez", async () => {
  assert.deepEqual(await calistir({ kuru: true, derleme: "7" }), []);
});

test("gerçek kip: doğru PATCH/POST gövdeleri, iletişim bilgisi ve gönderim yok", async () => {
  const yazilan = await calistir({ kuru: false, derleme: "7" });
  const gor = (m, yol) => yazilan.find((i) => i.method === m && i.yol === yol)?.body.data;
  assert.deepEqual(gor("PATCH", "/v1/appStoreVersionLocalizations/L1").attributes, kayit.surum);
  assert.deepEqual(gor("PATCH", "/v1/appInfoLocalizations/IL1").attributes, kayit.bilgi);
  // inceleme ayrıntısı yok → yalnızca notes ile sürüme bağlı oluşturulur
  const inc = gor("POST", "/v1/appStoreReviewDetails");
  assert.deepEqual(inc.attributes, { notes: kayit.inceleme.notes });
  assert.equal(inc.relationships.appStoreVersion.data.id, "V1");
  assert.equal(gor("PATCH", "/v1/appStoreVersions/V1/relationships/build").id, "B7");
  assert.deepEqual(gor("PATCH", "/v1/appStoreVersions/V1").attributes, { copyright: "2026 Alp Efes" });
  assert.ok(!yazilan.some((i) => /appStoreVersionSubmissions|reviewSubmissions/.test(i.yol)), "incelemeye gönderilmemeli");
});

test("kayit.json: iletişim alanı yok, sınırlar içinde", () => {
  assert.doesNotMatch(JSON.stringify(kayit), /contact|phone|@/i);
  assert.equal(kayit.copyright, "2026 Alp Efes");
  assert.ok(kayit.bilgi.subtitle.length <= 30);
  assert.ok(kayit.surum.promotionalText.length <= 170);
  assert.ok(kayit.surum.keywords.length <= 100, "anahtar kelimeler 100 karakteri aşmamalı");
  assert.ok(kayit.surum.description.length <= 4000);
});

test("jwt: ES256 imzası doğrulanır", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const p8 = privateKey.export({ type: "pkcs8", format: "pem" });
  const [b, p, s] = jwt({ keyId: "KID", issuerId: "ISS", p8 }, 1_000_000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(b, "base64url")), { alg: "ES256", kid: "KID", typ: "JWT" });
  assert.equal(JSON.parse(Buffer.from(p, "base64url")).aud, "appstoreconnect-v1");
  assert.ok(verify("sha256", Buffer.from(`${b}.${p}`), { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
});

test("magaza-kayit.yml: yalnızca elle, yalnızca main, testflight ortamı, PR tetikleyicisi yok", () => {
  const m = readFileSync(join(KOK, ".github/workflows/magaza-kayit.yml"), "utf8");
  assert.match(m, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(m, /^  (push|pull_request|pull_request_target|schedule):/m);
  assert.match(m, /^    environment: testflight$/m);
  assert.match(m, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(m, /^      kuru:\n(?:        .*\n)*?        default: true$/m, "kuru varsayılanı true olmalı");
  // Aynı gizli bilgi adları testflight.yml'dekilerle; yeni ad yok
  for (const ad of m.match(/secrets\.\w+/g)) assert.ok(tf.includes(ad), `${ad} testflight.yml'de yok`);
  // Betik hiçbir yerde incelemeye göndermez ve gizli bilgiyi yazdırmaz
  const betik = readFileSync(join(KOK, "araclar/magaza-kayit.mjs"), "utf8");
  assert.doesNotMatch(betik, /reviewSubmissions|appStoreVersionSubmissions|console\.log\([^)]*(P8|KEY)/);
  assert.ok(readdirSync(join(KOK, "araclar")).includes("magaza-kayit.mjs"));
});
