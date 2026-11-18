/* Sertifika temizliği: ağsız, sahte fetch ile. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bulutSertifikasi, sertifika } from "../araclar/sertifika.mjs";

const S = (id, certificateType, name) => ({ id, attributes: { certificateType, name, displayName: name } });
const VERI = [
  S("C1", "DEVELOPMENT", "Apple Development: Created via API (ABCDE12345)"),
  S("C2", "IOS_DEVELOPMENT", "iOS Development: Created via API"),
  S("C3", "DEVELOPMENT", "Apple Development: Deneme Kişi (XYZ9876543)"),
  S("C4", "DISTRIBUTION", "Apple Distribution: Created via API"),
];
function sahte() {
  const istekler = [];
  const f = async (url, { method }) => {
    istekler.push({ method, yol: url.replace("https://api.appstoreconnect.apple.com", "") });
    return { ok: true, status: method === "DELETE" ? 204 : 200, text: async () => (method === "DELETE" ? "" : JSON.stringify({ data: VERI })) };
  };
  return { f, istekler };
}
const silinen = (i) => i.filter((x) => x.method === "DELETE").map((x) => x.yol);

test("yalnızca API ile oluşturulmuş geliştirme sertifikaları seçilir", () => {
  assert.deepEqual(VERI.filter(bulutSertifikasi).map((s) => s.id), ["C1", "C2"]);
});

test("liste: bulut dışı sertifikanın adı günlüğe yazılmaz", async () => {
  const { f } = sahte(); const satirlar = [];
  await sertifika({ fetch: f, token: "t", islem: "liste", log: (x) => satirlar.push(x) });
  assert.ok(!satirlar.join("\n").includes("Deneme Kişi"));
  assert.ok(satirlar.join("\n").includes("Created via API"));
});

test("temizle: kendi sertifikasına ve dağıtım sertifikasına dokunmaz; kuru ve liste yazmaz", async () => {
  let { f, istekler } = sahte();
  await sertifika({ fetch: f, token: "t", islem: "temizle", kuru: false, log: () => {} });
  assert.deepEqual(silinen(istekler), ["/v1/certificates/C1", "/v1/certificates/C2"]);
  for (const a of [{ islem: "temizle", kuru: true }, { islem: "liste", kuru: false }]) {
    ({ f, istekler } = sahte());
    await sertifika({ fetch: f, token: "t", log: () => {}, ...a });
    assert.deepEqual(silinen(istekler), []);
  }
  await assert.rejects(sertifika({ fetch: f, token: "t", islem: "sil", log: () => {} }), /liste' ya da 'temizle/);
});

test("iş akışı: yalnızca elle, main, testflight ortamı, kuru varsayılan, yeni gizli bilgi adı yok", () => {
  const w = readFileSync(new URL("../.github/workflows/sertifika.yml", import.meta.url), "utf8");
  assert.match(w, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(w, /^  (push|pull_request|pull_request_target|schedule):/m);
  assert.match(w, /^    environment: testflight$/m);
  assert.match(w, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(w, /^      kuru:\n(?:        .*\n)*?        default: true$/m);
  const tf = readFileSync(new URL("../.github/workflows/testflight.yml", import.meta.url), "utf8");
  for (const ad of w.match(/secrets\.\w+/g)) assert.ok(tf.includes(ad), `${ad} testflight.yml'de yok`);
});
