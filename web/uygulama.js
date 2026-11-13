"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — uygulama arayüzü
 * ---------------------------------------------------------
 * Site (app.js, style.css) değiştirilmeden paketlenir ve web'de bugünkü gibi
 * kalır. Uygulamaya özgü deneyim buradadır:
 *   - açılış ekranı → ana ekran (Günün Bulmacası / Serbest Oyun) ⇄ oyun
 *   - sitenin ekran klavyesi yerine telefonun klavyesi + Türkçe harf şeridi
 *   - oyun ekranı kaymaz; klavye açılınca görünen alana sığar
 *   - "Nasıl oynanır?" sayfanın altında değil, pencere olarak açılır
 * İşaretlemeyi araclar/web-esitle.mjs ekler (araclar/arayuz.mjs), görünüm
 * uygulama.css'tedir. app.js'e yalnızca aşağıdaki metotlar sarılarak bağlanılır;
 * her biri testler/paket.test.mjs içinde aranır (site değişirse test kırılır).
 * Capacitor köprüsü gerekmez: tarayıcı testinde de aynı çalışır.
 * ========================================================= */
(() => {
  // Gizlilik/lisans dönüşünde (referrer dolu) açılış bekletilmez, bloklar düşmez: sınıf, betiğin
  // ilk işi olarak konur (index.html'de daha erken betik yok; CSP satır içi betiğe izin vermez)
  const ACILIS_MS = document.referrer ? 0 : 800;
  if (!ACILIS_MS) document.getElementById("acilis")?.classList.add("hemen");
  if (typeof WordLadder === "undefined") return;   // app.js yüklenmediyse bağlanacak bir şey yok
  const P = WordLadder.prototype;
  const kok = document.documentElement;
  const govde = document.body;
  const al = (id) => document.getElementById(id);
  const giris = al("giris");
  const pencereler = [al("modal"), al("offer"), al("pes")];
  // Açılış ekranı uygulama açılırken en az ACILIS_MS görünür (sayfa açılışından; yukarıda)
  const KAYIT = { daily: "sm_mod_daily", free: "sm_mod_free" };   // her modun canlı oyunu (sm_state'in kopyası)
  let oyun = null;
  let ekran = "acilis";

  const oku = (anahtar) => { try { return localStorage.getItem(anahtar); } catch (_) { return null; } };
  const yaz = (anahtar, deger) => { try { localStorage.setItem(anahtar, deger); } catch (_) { /* kayıt tutulamadı */ } };
  const yardimAcik = () => govde.classList.contains("yardim");
  const pencereAcik = () => pencereler.some((p) => !p.classList.contains("hidden"));

  /* ---------- Giriş: telefonun klavyesi ---------- */

  // Metin alanına odaklanır; telefonun klavyesi açılır. Oyun ekranında her
  // dokunuştan sonra çağrılır: klavye oyun boyunca açık kalır, ekran oynamaz.
  const odakla = () => {
    if (!oyun || ekran !== "oyun" || oyun.over || yardimAcik() || pencereAcik()) return;
    giris.focus({ preventScroll: true });
  };

  // Metin alanı her zaman app.js'teki buffer'ın aynısını tutar: silme tuşu her
  // klavyede çalışır, ekran okuyucu yazılanı okur. Bitmiş oyunda klavye açılmaz.
  const asilRenderInput = P.renderInput;
  P.renderInput = function (...arg) {
    if (giris.value !== this.buffer) giris.value = this.buffer;
    giris.disabled = this.over;
    return asilRenderInput.apply(this, arg);
  };

  // Çözülünce klavye kapanır: merdivenin tamamı ve sonuç penceresi görünür
  // Çözüm penceresi win()'den 650 ms sonra açılır; o arada oyuncu ana ekrana dönüp
  // başka bir bulmacaya (ör. bugün zaten çözülmüş Günün Bulmacası) geçmiş olabilir.
  // Pencere yalnızca hâlâ aynı biten oyundaysa açılır.
  let kazanilan = null;
  const asilWin = P.win;
  P.win = function (...arg) {
    giris.disabled = true;
    giris.blur();
    kazanilan = { mod: this.mode, bas: this.startWord, hedef: this.targetWord, uzunluk: this.chain.length };
    return asilWin.apply(this, arg);
  };
  // Sonucu göster: onay penceresi açıkken klavye kapanır (teklifteki gibi); yol
  // gösterilince oyun biter, klavye kapanır
  const asilShowPes = P.showPes;
  P.showPes = function (ac, ...arg) {
    const s = asilShowPes.call(this, ac, ...arg);
    if (ac) giris.blur(); else odakla();
    return s;
  };
  const asilShowResult = P.showResult;
  P.showResult = function (...arg) {
    const s = asilShowResult.apply(this, arg);
    if (this.over) giris.blur();
    return s;
  };

  // İpucu teklifi açıkken yazılan harf arkadaki tahtaya gitmesin; kapanınca klavye geri gelir
  const asilShowOffer = P.showOffer;
  P.showOffer = function (ac, ...arg) {
    const s = asilShowOffer.call(this, ac, ...arg);
    if (ac) giris.blur(); else odakla();
    return s;
  };

  // Harfler Türkçe kuralla büyütülür (i → İ, ı → I); şapkalı harf sözlükteki gibi şapkasız
  // yazılır (â → A, î → İ, û → U); harf olmayan her şey süzülür
  const SAPKA = { "Â": "A", "Î": "İ", "Û": "U" };
  const harfler = (metin, boy) => [...metin.toLocaleUpperCase("tr-TR")].map((h) => SAPKA[h] || h)
    .filter((h) => WordLadder.TR_LETTER.test(h)).slice(0, boy).join("");

  // Bileşim (IME) sürerken alan yarım metin tutar: bitince (compositionend) eşitlenir
  const girisEsitle = (e) => {
    if (!oyun || e.isComposing) return;
    const once = oyun.buffer.length;
    const yeni = oyun.over ? "" : harfler(giris.value, oyun.len);
    // Yeni harf app.js'in kendi yolundan geçer (ses, animasyon); silme ve toplu yazma doğrudan yazılır
    if (yeni.length === once + 1 && yeni.startsWith(oyun.buffer)) oyun.pressKey(yeni[once]);
    else { oyun.buffer = yeni; oyun.renderInput(); }
    if (giris.value !== oyun.buffer) giris.value = oyun.buffer;   // süzülen ya da sığmayan harf alanda kalmasın
  };
  giris.addEventListener("input", girisEsitle);
  giris.addEventListener("compositionend", girisEsitle);
  // Odak metin alanındayken harf ve silme tuşlarını alan kendisi işler; app.js'in
  // belge düzeyindeki dinleyicisi aynı tuşu ikinci kez yazmasın. Enter ona ulaşır.
  giris.addEventListener("keydown", (e) => { if (e.key !== "Enter") e.stopPropagation(); });

  // iOS, sayfada dokunma dinleyicisi yoksa düğmelerin basılı görünümünü (:active) göstermez
  document.addEventListener("touchstart", () => {}, { passive: true });

  // Türkçe harf şeridi
  al("harfler").addEventListener("click", (e) => {
    const dugme = e.target.closest(".harf");
    if (dugme && oyun) oyun.pressKey(dugme.dataset.key);
  });
  // Oyun ekranına dokunmak odağı metin alanından almaz: klavye kapanıp açılmaz
  al("oyun").addEventListener("mousedown", (e) => { if (e.target !== giris) e.preventDefault(); });
  // Oyun ekranında ya da pencerelerde her dokunuştan sonra (tahta, şerit, ipucu,
  // yeni oyun, pencereyi kapat) klavye açık kalır; koşullar odakla()'da
  for (const kap of [al("oyun"), ...pencereler]) kap.addEventListener("click", () => odakla());
  // Reklamdan sonra başlayan tekrar: dokunuş zinciri kopmuş olabilir, yine de dene
  const asilBeginRetry = P.beginRetry;
  P.beginRetry = function (...arg) { const s = asilBeginRetry.apply(this, arg); odakla(); return s; };

  /* ---------- Oyun ekranı görünen alana sığar ----------
     Klavye açılınca görünen alan (visualViewport) küçülür; kabuğun boyu ona
     eşitlenir (--vvh), sayfa kaydıysa üstü de (--vv-top). iOS boyut olayını
     klavye animasyonu bitince gönderir: ekran o anda sıçramasın diye son
     ölçülen klavyeli ve klavyesiz boy hatırlanır, odak değişir değişmez uygulanır. */
  const vv = window.visualViewport;
  let tamBoy = 0, klavyeliBoy = 0, esitleme = 0;

  // Giriş satırı kayan bölümlerin içinde görünür kalsın (belge kaydırılmaz)
  const girisGoster = () => {
    if (!oyun || ekran !== "oyun" || oyun.over) return;
    for (const kap of [oyun.el.steps, oyun.el.game]) {
      const k = kap.getBoundingClientRect();
      const r = oyun.el.input.parentElement.getBoundingClientRect();
      if (r.bottom > k.bottom) kap.scrollTop += r.bottom - k.bottom;
      else if (r.top < k.top) kap.scrollTop -= k.top - r.top;
    }
  };
  const boyYaz = (boy) => {
    kok.style.setProperty("--vvh", boy + "px");
    kok.style.setProperty("--vv-top", (vv ? vv.offsetTop : 0) + "px");
    girisGoster();
  };
  const gorunum = () => {
    const boy = vv ? vv.height : window.innerHeight;
    if (document.activeElement === giris) klavyeliBoy = boy; else tamBoy = boy;
    boyYaz(boy);
  };
  // Tahmin yanlışsa (ör. bağlı klavye: ekran klavyesi hiç açılmaz) gerçek ölçüye dönülür
  const tahmin = (boy) => {
    if (boy) boyYaz(boy);
    clearTimeout(esitleme);
    esitleme = setTimeout(gorunum, 1000);
  };
  giris.addEventListener("focus", () => {
    giris.setSelectionRange(giris.value.length, giris.value.length);   // imleç hep sonda
    tahmin(klavyeliBoy);
  });
  giris.addEventListener("blur", () => tahmin(tamBoy));
  gorunum();
  (vv || window).addEventListener("resize", gorunum);
  if (vv) vv.addEventListener("scroll", gorunum);

  /* ---------- Her modun oyunu ayrı saklanır ---------- */

  // app.js tek bir canlı oyun tutar (sm_state). Ana ekranla iki mod arasında gidip
  // gelmek kolaylaştığı için her kayıt moduna göre kopyalanır; öteki moda geçmek
  // kalınan yeri silmez.
  const asilSaveState = P.saveState;
  P.saveState = function (...arg) {
    const s = asilSaveState.apply(this, arg);
    const ham = oku("sm_state");
    if (ham && KAYIT[this.mode]) yaz(KAYIT[this.mode], ham);
    return s;
  };

  // O modun sürdürülebilir kaydı ya da null
  const kayitli = (mod) => {
    const ham = oku(KAYIT[mod]);
    let s;
    try { s = JSON.parse(ham); } catch (_) { return null; }
    if (!s || s.over || !Array.isArray(s.chain) || typeof s.start !== "string" || typeof s.target !== "string") return null;
    if (mod === "daily" ? (s.mode !== "daily" || s.day !== oyun.dayNumber())
      : (s.mode !== "free" || !secimeUyar(s.start, s.target))) return null;
    return { ham, s };
  };
  // Serbest bulmaca ana ekrandaki seçime (uzunluk + zorluk) uyuyor mu: app.js'in o seçim için
  // çektiği havuzda mı diye bakılır (havuz boşsa app.js başka zorluğa düşer; o da uyar)
  const secimeUyar = (bas, hedef) => oyun.freePool().some((b) => b[0] === bas && b[1] === hedef);
  // Ekrandaki oyun bu modun sürdürülebilir oyunu mu
  const suruyor = (mod) => oyun.mode === mod && (mod === "daily"
    ? oyun.gosterilenGun === oyun.dayNumber()
    : !oyun.over && secimeUyar(oyun.startWord, oyun.targetWord));

  /* ---------- Ekranlar: açılış → ana ekran ⇄ oyun ---------- */

  const ekranAc = (ad) => { ekran = ad; govde.dataset.ekran = ad; };

  let anaGun = 0;
  const anaCiz = () => {
    anaGun = oyun.dayNumber();
    const [bas, hedef, enAz = 0] = oyun.dailyPuzzle();
    const kayit = oyun.dailyRecord();
    const tekrar = Array.isArray(kayit?.deneme);
    const adim = tekrar ? kayit.deneme.length - 1
      : suruyor("daily") ? oyun.chain.length - 1 : (kayitli("daily")?.s.chain.length || 1) - 1;
    const enAzYazi = enAz ? ` · en az ${enAz}` : "";
    al("gunlukTarih").textContent = new Intl.DateTimeFormat("tr-TR",
      { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
    al("gunlukBulmaca").textContent = `${bas} → ${hedef}`;
    const cozuldu = !!kayit && !tekrar;
    // "Sonucu göster" ile bitirilmiş (çözüm kaydı yok): ayrı metin, ayrı eylem
    const gosterildi = !kayit && oyun.dailyShown();
    if (gosterildi) {
      al("gunlukDurum").textContent = "Çözüm gösterildi" + enAzYazi;
    } else if (cozuldu) {
      const enIyi = kayit.enIyi || kayit.steps;
      al("gunlukDurum").textContent = `Çözüldü · ${kayit.steps} adım` + (enIyi < kayit.steps ? ` · en iyi ${enIyi}` : "") + enAzYazi;
    } else {
      al("gunlukDurum").textContent = tekrar ? `Tekrar deniyorsun · ${adim} adım` + enAzYazi
        : adim > 0 ? `${adim} adım attın` + enAzYazi
        : "Herkese aynı bulmaca" + (enAz ? ` · en az ${enAz} adım` : "");
    }
    al("btnGunluk").textContent = cozuldu || gosterildi ? "Sonucu gör" : tekrar || adim > 0 ? "Devam et" : "Oyna";
    al("gunlukSonraki").hidden = !(cozuldu || gosterildi);

    const s = suruyor("free") ? { start: oyun.startWord, target: oyun.targetWord, chain: oyun.chain } : kayitli("free")?.s;
    const yarim = !!s && s.chain.length > 1;
    al("serbestDurum").textContent = yarim
      ? `Kaldığın bulmaca: ${s.start} → ${s.target} · ${s.chain.length - 1} adım`
      : "İstediğin kadar oyna. Zorluğu ve uzunluğu sen seç.";
    al("btnSerbest").textContent = yarim ? "Devam et" : "Oyna";
  };

  const yardimAc = (ac) => {
    govde.classList.toggle("yardim", ac);
    if (ac) { giris.blur(); al("nasil-oynanir").scrollTop = 0; al("btnYardimKapat").focus({ preventScroll: true }); }
    else odakla();
  };

  const anaAc = () => {
    ekranAc("ana");
    giris.blur();
    oyun.hideModal();
    oyun.showOffer(false);
    anaCiz();
    al("ana").scrollTop = 0;
  };

  // Ana ekrandan oyuna: o modda kalınan oyun sürer, yoksa yenisi açılır
  const oyna = (mod) => {
    if (!suruyor(mod)) {
      // Çözülmüş ya da tekrarı süren günlüğü newGame günün kaydından kurar
      const k = mod === "daily" && oyun.dailyRecord() ? null : kayitli(mod);
      if (k) yaz("sm_state", k.ham);
      if (!k || !oyun.restoreState() || oyun.mode !== mod) oyun.newGame(mod);
    }
    ekranAc("oyun");
    odakla();
    girisGoster();
  };

  // Günlük çözüm penceresindeki "Serbest Oyun" (ve bitmiş günlükte Enter: app.js aynı düğmeye
  // basar) app.js'te her zaman YENİ serbest bulmaca çeker ve serbestte kalınan yeri ezerdi.
  // Uygulamada ana ekrandaki kartla aynı yoldan gider: kalınan serbest oyun sürer.
  al("modal").addEventListener("click", (e) => {
    if (!oyun || oyun.mode !== "daily" || !e.target.closest("#btnNewGame")) return;
    e.stopPropagation();
    oyun.hideModal();
    oyna("free");
  }, true);

  // app.js çözüm penceresini çözümden 650 ms sonra açar. O arada ana ekrana ya da başka bir
  // oyuna geçildiyse pencere açılmaz (bitmemiş oyunun ya da ana ekranın üstünde çözüm penceresi olmaz).
  const asilShowModal = P.showModal;
  // Ayrıca pencere yalnızca hâlâ aynı biten oyundaysa açılır: ana ekrana dönüp bugün zaten
  // çözülmüş günlüğe (ya da başka bir bulmacaya) geçildiyse, o oyunun üstünde "Tebrikler" açılmaz.
  P.showModal = function (secenek, ...arg) {
    if (ekran !== "oyun" || !this.over) return undefined;
    if (!secenek?.oncedenCozuldu) {          // gecikmeli çözüm penceresi (win)
      const k = kazanilan;
      kazanilan = null;
      if (!k || k.mod !== this.mode || k.bas !== this.startWord || k.hedef !== this.targetWord || k.uzunluk !== this.chain.length) return undefined;
    }
    return asilShowModal.call(this, secenek, ...arg);
  };

  // Mod adı başlıkta yazar (sekmelerin yerine); app.js her mod değişiminde updateTabs çağırır
  const asilUpdateTabs = P.updateTabs;
  P.updateTabs = function (...arg) {
    al("modAdi").textContent = this.mode === "daily" ? "Günün Bulmacası" : "Serbest Oyun";
    al("btnRestart").setAttribute("aria-label", this.mode === "daily" ? "Baştan başla" : "Yeni bulmaca");
    return asilUpdateTabs.apply(this, arg);
  };

  // Ana ekrandaki geri sayım; gün değişince kart yeni bulmacayı gösterir
  const asilTick = P.tickCountdown;
  P.tickCountdown = function (...arg) {
    const s = asilTick.apply(this, arg);
    al("anaGeriSayim").textContent = this.el.countdown.textContent;
    if (oyun && ekran === "ana" && anaGun !== this.dayNumber()) anaCiz();
    return s;
  };

  al("btnGunluk").addEventListener("click", () => oyna("daily"));
  al("btnSerbest").addEventListener("click", () => oyna("free"));
  al("btnAna").addEventListener("click", anaAc);
  al("btnAnaYardim").addEventListener("click", () => yardimAc(true));
  al("btnYardimKapat").addEventListener("click", () => yardimAc(false));
  // Sitedeki bağlantılar sayfayı kaydırır; uygulamada sayfa kaymaz, yardım açılıp kapanır
  al("btnHelp").addEventListener("click", (e) => { e.preventDefault(); yardimAc(true); });
  document.querySelector('#nasil-oynanir a[href="#oyun"]').addEventListener("click", (e) => { e.preventDefault(); yardimAc(false); });

  // Serbest oyun ayarları ana ekranda: seçim kaydedilir, bulmaca "Oyna" ile gelir
  al("anaAyar").addEventListener("click", (e) => {
    const d = e.target.closest(".pick-btn");
    if (!d || !oyun) return;
    if ("len" in d.dataset) { oyun.lenPref = Number(d.dataset.len); oyun.savePref("sm_uzunluk", oyun.lenPref); }
    else { oyun.diffPref = d.dataset.diff; oyun.savePref("sm_zorluk", oyun.diffPref); }
    oyun.updateTabs();
    anaCiz();
  });

  // Ses düğmesi ana ekrana taşınır (oyun başlığında mod adına yer açılır); seçim hatırlanır
  al("anaUst").append(al("btnMute"));
  // (app.js'in kendi dinleyicisi sesi bu dinleyiciden sonra değiştirir: durum bir tur sonra okunur)
  al("btnMute").addEventListener("click", () => setTimeout(() => {
    try { al("btnMute").classList.contains("muted") ? localStorage.setItem("sm_ses", "0") : localStorage.removeItem("sm_ses"); }
    catch (_) { /* kayıt tutulamadı */ }
  }, 0));
  if (oku("sm_ses") === "0") muteGame(true);
  // Türkçe harf şeridi: varsayılan açık; kapatılırsa hiç görünmez, yerini merdiven alır (sm_serit)
  const seritAyarla = (acik) => {
    govde.classList.toggle("serit-yok", !acik);
    al("btnSerit").setAttribute("aria-pressed", String(acik));
  };
  al("btnSerit").addEventListener("click", () => {
    const acik = govde.classList.contains("serit-yok");
    seritAyarla(acik);
    try { acik ? localStorage.removeItem("sm_serit") : localStorage.setItem("sm_serit", "0"); }
    catch (_) { /* kayıt tutulamadı */ }
  });
  seritAyarla(oku("sm_serit") !== "0");
  // Plus (satın al, geri yükle, cayma notu) ana ekranda kart olarak durur: doğrudan ulaşılır.
  // Görünürlüğünü ve metnini app.js yönetir (renderPlus: yalnızca gelir kancası varsa görünür).
  al("plusBox").classList.add("kart");
  al("ana").insertBefore(al("plusBox"), al("btnAnaYardim"));
  // Gizlilik ve lisans bağlantıları ana ekranın altında
  al("ana").append(document.querySelector(".site-footer"));

  // Ana ekran ya da yardım açıkken fiziksel klavye (ve Enter) alttaki tahtaya yazmaz
  document.addEventListener("keydown", (e) => {
    if (yardimAcik()) { e.stopPropagation(); if (e.key === "Escape") yardimAc(false); }
    else if (ekran !== "oyun") e.stopPropagation();
  }, true);

  // Açılış: bloklar basamaklara düşer (uygulama.css → acilisDus); dönüşte (.hemen) beklenmez.
  // Animasyon olayları gelmezse (sayfa arka planda) bekleme, son animasyonun beklenen
  // bitişinden ACILIS_PAY_MS sonra bırakılır.
  const ACILIS_PAY_MS = 400;
  const acilis = al("acilis");
  const animasyonBitti = async () => {
    const animasyonlar = ACILIS_MS ? acilis.getAnimations?.({ subtree: true }) || [] : [];
    if (!animasyonlar.length) return;
    // Zaman çizelgesi performance.now ile aynı kökten sayar; henüz başlamamış animasyon şimdi başlar
    const bitis = Math.max(...animasyonlar.map((a) => (a.startTime ?? performance.now()) + a.effect.getComputedTiming().endTime));
    let zamanlayici;
    await Promise.race([
      Promise.all(animasyonlar.map((a) => a.finished.catch(() => {}))),
      new Promise((coz) => { zamanlayici = setTimeout(coz, Math.max(0, bitis + ACILIS_PAY_MS - performance.now())); }),
    ]);
    clearTimeout(zamanlayici);
  };

  // Açılış ekranı sözlük yüklenene ve bloklar oturana dek (en az ACILIS_MS) durur, sonra ana ekran gelir
  const asilInit = P.init;
  P.init = async function (...arg) {
    await asilInit.apply(this, arg);
    oyun = this;
    await Promise.all([
      new Promise((coz) => setTimeout(coz, Math.max(0, ACILIS_MS - performance.now()))),
      animasyonBitti(),
    ]);
    anaAc();
  };
})();
