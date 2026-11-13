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
 * Oyuncunun yolundan gider: ana ekranda "Oyna"ya basar, kelimeleri telefonun
 * klavyesinin yazdığı metin alanına yazar. "SM-OTOMATIK: bilgi …" satırı,
 * klavye açıldıktan sonra ölçülen görünen alanı günlüğe yazar.
 *
 * Uygulama paketine (www/, npm run ios:sync, TestFlight) GİRMEZ:
 * araclar/simulator.sh derlemeden hemen önce ios/App/App/public içine, yerel.js'ten
 * önce yüklenecek biçimde ekler;
 * her `cap sync` o klasörü www/'den yeniden yazar.
 * ========================================================= */
(async () => {
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
  // Telefonun klavyesi gibi yazar: harfler metin alanına küçük harfle girer
  // (uygulama.js Türkçe kuralla büyütür), gönder tuşu Enter'dır
  const yaz = (kelime) => {
    const giris = document.getElementById("giris");
    for (const h of kelime.toLocaleLowerCase("tr-TR")) {
      giris.value += h;
      giris.dispatchEvent(new InputEvent("input", { bubbles: true, data: h, inputType: "insertText" }));
    }
    giris.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
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
    await uyu(1000);                       // ilk boyama ve yazı tipi
    await asama("ana");

    document.getElementById("btnGunluk").click();
    await bekleKosul(() => ekran() === "oyun", "oyun ekranı");
    if (oyun.mode !== "daily" || oyun.startWord !== bas || oyun.targetWord !== hedef) {
      throw new Error("günün bulmacası açık değil");
    }
    if (oyun.chain.length !== 1 || oyun.over) throw new Error("oyun ilk açılış durumunda değil");
    await uyu(2500);                       // telefonun klavyesi açılır (bağlı klavye varsa açılmaz)
    // Klavye açıksa kabuk görünen alana sığmalı; giriş satırı ve harf şeridi klavyenin üstünde kalmalı
    const klavye = vv.height < tamBoy - 100;
    isaret(`bilgi klavye=${klavye} gorunen=${Math.round(vv.height)} tam=${Math.round(tamBoy)} ust=${Math.round(vv.offsetTop)} ` +
           `kayma=${Math.round(scrollY)} kabuk=${Math.round(kutu("oyun").height)} odak=${document.activeElement.id || "-"}`);
    if (klavye) {
      const alt = vv.offsetTop + vv.height + 1;
      if (kutu("inputRow").top < vv.offsetTop || kutu("inputRow").bottom > alt) throw new Error("klavye açıkken giriş satırı görünmüyor");
      if (kutu("harfler").bottom > alt) throw new Error("klavye açıkken harf şeridi klavyenin altında kalıyor");
    }
    await asama("oyun");

    const yol = enKisaYol(oyun.startWord, oyun.targetWord, oyun.db[String(oyun.len)].words);
    const ilk = Math.min(2, yol.length - 1);
    for (const kelime of yol.slice(0, ilk)) yaz(kelime);
    if (oyun.chain.length !== ilk + 1) throw new Error("hamleler kabul edilmedi");
    await uyu(1000);
    await asama("hamle");

    for (const kelime of yol.slice(ilk)) yaz(kelime);
    await bekleKosul(() => oyun.over && !oyun.el.modal.classList.contains("hidden"), "çözüm penceresi");
    await uyu(1000);                       // pencere açılış geçişi
    await asama("cozum");

    oyun.hideModal();
    document.getElementById("btnHelp").click();
    if (!document.body.classList.contains("yardim")) throw new Error("yardım penceresi açılmadı");
    await uyu(1000);
    await asama("nasil");
  } catch (e) {
    isaret("hata " + e.message);
  }
})();
