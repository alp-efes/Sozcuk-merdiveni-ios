"use strict";

// yerel.js bunu okuyup reklamı, ATT penceresini ve satın almayı devre dışı bırakır:
// sistem pencereleri ekran görüntüsünü ve oynamayı bloklamasın. Bu yüzden betik
// yerel.js'ten ÖNCE yüklenir (araclar/simulator.sh).
window.SM_OTOMATIK = true;

/* =========================================================
 * YALNIZCA SİMÜLATÖR İŞ AKIŞI İÇİN: günün bulmacasını kendi kendine oynar.
 * ---------------------------------------------------------
 * Her aşamada konsola "SM-OTOMATIK: <aşama>" yazar (Capacitor bunu uygulamanın
 * çıktısına aktarır) ve araclar/simulator.sh ekran görüntüsünü alıp paketin
 * içine "onay-<aşama>.txt" dosyasını yazana dek o ekranda bekler. Böylece
 * çıktı ne kadar gecikirse geciksin her görüntü doğru aşamayı gösterir.
 * Aşamalar: ana, oyun, hamle, cozum, nasil (hata olursa "hata …").
 * Oyuncunun yolundan gider: ana ekranda "Oyna"ya basar, kelimeleri oyunun ekran
 * klavyesine basarak yazar ve Gönder'e basar. "SM-OTOMATIK: bilgi …" satırı oyun
 * ekranının ölçülerini günlüğe yazar. Telefonun klavyesi hiçbir ekranda açılmamalıdır.
 *
 * Mağaza modu (araclar/simulator.sh <klasör> magaza): simulator.sh dosyanın başına
 * `window.SM_MAGAZA = true;` yazar. Saat 13 Kasım 2026 12:00'ye (TRT) sabitlenir; sıra
 * ana, hamle, cozum, gunluk (ertesi günün bulmacası, ipucu açık), nasil.
 *
 * Uygulama paketine (www/, npm run ios:sync, TestFlight) GİRMEZ:
 * araclar/simulator.sh derlemeden hemen önce ios/App/App/public içine, yerel.js'ten
 * önce yüklenecek biçimde ekler;
 * her `cap sync` o klasörü www/'den yeniden yazar.
 * ========================================================= */
(async () => {
  const MAGAZA = window.SM_MAGAZA === true;
  const GUN = 86400000;
  let kayma = 0;
  if (MAGAZA) {   // gün Date.now()'dan, pencere tarihi new Date()'ten gelir; ilk okumadan önce sabitlenir
    const Gercek = Date;
    kayma = Date.UTC(2026, 10, 13, 9) - Gercek.now();
    window.Date = class extends Gercek {
      constructor(...a) { super(...(a.length ? a : [Gercek.now() + kayma])); }
      static now() { return Gercek.now() + kayma; }
    };
  }
  const uyu = (ms) => new Promise((coz) => setTimeout(coz, ms));
  const isaret = (asama) => console.log("SM-OTOMATIK: " + asama);

  // Aşamayı bildirir; ekran görüntüsü alınıp onay dosyası gelene dek bekler (en çok 2 dk)
  const asama = async (ad) => {
    isaret(ad);
    for (let i = 1; i <= 240; i++) {
      try {
        if ((await fetch(`onay-${ad}.txt`, { cache: "no-store" })).ok) return;
      } catch (_) { /* dosya henüz yok */ }
      await uyu(500);
      // Çıktı arabelleğe alınıyorsa dolup boşalsın diye işaret uzun bir satırla yinelenir
      if (i % 4 === 0) isaret(`${ad} (yineleme) ${".".repeat(1000)}`);
    }
    throw new Error(ad + " aşaması 2 dk içinde onaylanmadı");
  };

  // En kısa çözüm (başlangıç hariç, hedef dahil); testler/tarayici.test.mjs ile aynı
  const enKisaYol = (bas, hedef, kelimeler) => {
    const komsu = (a, b) => [...a].filter((h, i) => h !== b[i]).length === 1;
    const once = new Map([[bas, null]]);
    const kuyruk = [bas];
    for (let u; (u = kuyruk.shift()) && u !== hedef;) {
      for (const v of kelimeler) if (!once.has(v) && komsu(u, v)) { once.set(v, u); kuyruk.push(v); }
    }
    if (!once.has(hedef)) throw new Error(`çözüm yok: ${bas} → ${hedef}`);
    const yol = [];
    for (let k = hedef; k !== bas; k = once.get(k)) yol.unshift(k);
    return yol;
  };
  // Oyuncu gibi ekran klavyesinin harf tuşlarına, sonra Gönder'e basar
  const yaz = (kelime) => {
    for (const h of kelime) {
      const tus = document.querySelector(`#keyboard .key[data-key="${h}"]`);
      if (!tus || tus.disabled) throw new Error("ekran klavyesinde tuş yok: " + h);
      tus.click();
    }
    document.getElementById("btnGonder").click();
  };
  const bekleKosul = async (kosul, ne) => {
    for (let i = 0; !kosul(); i++) {
      if (i > 300) throw new Error(ne + " 30 sn içinde olmadı");
      await uyu(100);
    }
  };
  const ekran = () => document.body.dataset.ekran;
  const kutu = (id) => document.getElementById(id).getBoundingClientRect();

  try {
    await bekleKosul(() => window.oyun?.db && window.oyun.startWord, "oyunun yüklenmesi");
    // words.json yüklenemezse app.js küçük bir yedek sözlüğe düşer; bu bir hatadır
    if (oyun.db === WordLadder.MOCK_DB) throw new Error("words.json yüklenmedi (mock sözlük)");
    // Yerel eklentiler köprüye kayıtlı olmalı: yalnızca uygulamada denetlenir (tarayıcıda köprü yok).
    // Reklam ve satın alma bu derlemede kapalıdır ama eklentilerin bağlandığı burada görülür.
    if (window.Capacitor?.isNativePlatform?.()) {
      for (const ad of ["AdMob", "SatinAlma", "Haptics", "Share"]) {
        if (!Capacitor.Plugins[ad]) throw new Error("yerel eklenti köprüde kayıtlı değil: " + ad);
      }
    }

    // Açılış ekranından sonra ana ekran gelir; günün bulmacası kartta yazar
    await bekleKosul(() => ekran() === "ana", "ana ekran");
    const [bas, hedef] = oyun.dailyPuzzle();
    if (document.getElementById("gunlukBulmaca").textContent !== `${bas} → ${hedef}`) {
      throw new Error("ana ekranda günün bulmacası yazmıyor");
    }
    const vv = window.visualViewport;
    const tamBoy = vv.height;
    // Uygulamanın kendi klavyesi var: telefonun klavyesi hiçbir ekranda açılmamalı
    const klavyeYok = (ne) => {
      if (vv.height < tamBoy - 100) throw new Error(`${ne}: telefonun klavyesi açıldı`);
    };
    await uyu(1000);                       // ilk boyama ve yazı tipi
    klavyeYok("ana ekran");
    await asama("ana");

    document.getElementById("btnGunluk").click();
    await bekleKosul(() => ekran() === "oyun", "oyun ekranı");
    if (oyun.mode !== "daily" || oyun.startWord !== bas || oyun.targetWord !== hedef) {
      throw new Error("günün bulmacası açık değil");
    }
    if (oyun.chain.length !== 1 || oyun.over) throw new Error("oyun ilk açılış durumunda değil");
    await uyu(1500);
    // Ekran tek parça: giriş satırı, ekran klavyesi ve eylem sırası kaydırmadan görünür
    isaret(`bilgi gorunen=${Math.round(vv.height)} tam=${Math.round(tamBoy)} kayma=${Math.round(scrollY)} ` +
           `klavye=${Math.round(kutu("keyboard").top)}-${Math.round(kutu("keyboard").bottom)} eylem=${Math.round(kutu("eylemler").bottom)} ` +
           `odak=${document.activeElement.id || "-"}`);
    klavyeYok("oyun");
    if (kutu("eylemler").bottom > vv.height + 1) throw new Error("eylem sırası ekrana sığmıyor");
    if (kutu("inputRow").bottom > kutu("keyboard").top + 1) throw new Error("giriş satırı klavyenin altında kalıyor");
    if (!MAGAZA) await asama("oyun");

    const yol = enKisaYol(oyun.startWord, oyun.targetWord, oyun.db[String(oyun.len)].words);
    const ilk = Math.min(2, yol.length - 1);
    for (const kelime of yol.slice(0, ilk)) yaz(kelime);
    if (oyun.chain.length !== ilk + 1) throw new Error("hamleler kabul edilmedi");
    await uyu(1000);
    klavyeYok("hamle");
    await asama("hamle");

    for (const kelime of yol.slice(ilk)) yaz(kelime);
    await bekleKosul(() => oyun.over && !oyun.el.modal.classList.contains("hidden"), "çözüm penceresi");
    await uyu(1000);                       // pencere açılış geçişi
    await asama("cozum");

    oyun.hideModal();
    if (MAGAZA) {
      // Ertesi gün: TRT gece yarısı geçti, yeni günlük bulmaca gelir; ipucuyla başlanır
      document.getElementById("btnMenu").click();         // oyuncunun yolu: menü → "Ana menü"
      document.getElementById("btnAna").click();
      await bekleKosul(() => ekran() === "ana", "ana ekrana dönüş");
      kayma += GUN;
      await uyu(500);
      document.getElementById("btnGunluk").click();
      await bekleKosul(() => ekran() === "oyun" && oyun.mode === "daily" && oyun.startWord !== bas && !oyun.over, "ertesi günün bulmacası");
      document.getElementById("btnHint").click();
      await uyu(2500);
      klavyeYok("günlük");
      await asama("gunluk");
      document.getElementById("btnMenu").click();         // oyuncunun yolu: menü → "Ana menü"
      document.getElementById("btnAna").click();
      await bekleKosul(() => ekran() === "ana", "ana ekrana dönüş");
      document.getElementById("btnAnaYardim").click();
    } else {
      document.getElementById("btnMenu").click();         // yardım menüde (başlıkta yardım düğmesi yok)
      document.getElementById("menuYardim").click();
    }
    if (!document.body.classList.contains("yardim")) throw new Error("yardım penceresi açılmadı");
    await uyu(1000);
    klavyeYok("nasıl oynanır");
    await asama("nasil");
  } catch (e) {
    isaret("hata " + e.message);
  }
})();
