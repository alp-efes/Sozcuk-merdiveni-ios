"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — uygulama arayüzü
 * ---------------------------------------------------------
 * Site (app.js, style.css) değiştirilmeden paketlenir ve web'de bugünkü gibi
 * kalır. Uygulamaya özgü deneyim buradadır:
 *   - açılış ekranı → ana ekran (Günün Bulmacası / Serbest Oyun) ⇄ oyun
 *   - ekran klavyesi Türkçe Q dizilişinde; altında eylem sırası (Geri al, Gönder, İpucu)
 *   - oyun ekranı kaymaz; telefonun klavyesi hiç açılmaz
 *   - "Nasıl oynanır?" sayfanın altında değil, pencere olarak açılır
 *   - oyun başlığında menü: ana menü, yeni serbest oyun, yardım, titreşim/ses
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
  const govde = document.body;
  const al = (id) => document.getElementById(id);
  const menu = al("menu");
  // Açılış ekranı uygulama açılırken en az ACILIS_MS görünür (sayfa açılışından; yukarıda)
  const KAYIT = { daily: "sm_mod_daily", free: "sm_mod_free" };   // her modun canlı oyunu (sm_state'in kopyası)
  let oyun = null;
  let ekran = "acilis";
  let yenidenOnay = false;   // açık yenile onayı menüdeki "Yeniden dene" için (aşağıda, Menü)

  const oku = (anahtar) => { try { return localStorage.getItem(anahtar); } catch (_) { return null; } };
  const yaz = (anahtar, deger) => { try { localStorage.setItem(anahtar, deger); } catch (_) { /* kayıt tutulamadı */ } };
  const yardimAcik = () => govde.classList.contains("yardim");

  // Eski sürümün "Türkçe harf şeridi" tercihi: şerit kalktı, kayıt silinir (gizlilik metni artık saymaz)
  try { localStorage.removeItem("sm_serit"); } catch (_) { /* kayıt silinemedi */ }

  /* ---------- Ekran klavyesi ve eylem sırası ----------
     Tuşları app.js üretir (buildKeyboard, LAYOUT) ve basar (pressKey); telefonun klavyesi
     açılmaz, çünkü odak alan metin alanı yoktur. Bağlı klavye app.js'in keydown yolundan yazar.
     Diziliş sahip kararı (15 Kasım 2026): Türkçe Q, Sil son sıranın sağ ucunda, Gönder ayrı
     eylem sırasında. Q, W, X Türkçede yok: yerleri tanıdık dursun diye görünür ama basılmaz. */
  WordLadder.LAYOUT = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
    ["Z", "X", "C", "V", "B", "N", "M", "Ö", "Ç", "BACK"],
  ];
  const asilBuildKeyboard = P.buildKeyboard;
  P.buildKeyboard = function (...arg) {
    const s = asilBuildKeyboard.apply(this, arg);
    for (const tus of this.el.keyboard.querySelectorAll(".key")) {
      const k = tus.dataset.key;
      if (k === "I") tus.setAttribute("aria-label", "Noktasız I");
      else if (k === "İ") tus.setAttribute("aria-label", "Noktalı İ");
      else if (k !== "BACK" && !WordLadder.TR_LETTER.test(k)) tus.disabled = true;
    }
    return s;
  };
  // Geri al ve İpucu (rozetleriyle) Gönder'in iki yanına
  al("eylemler").prepend(al("btnUndo"));
  al("eylemler").append(al("btnHint"));
  // En kısa yolu göster başlığın sağ ucunda, yardımın yerinde (sahip kararları, 15 Kasım 2026; yardım menüde).
  // Sitede yalnızca adım en azı geçince görünür; uygulamada oyun sürdükçe hep açıktır, her basışta onay
  // sorar (app.js askShowResult → showResult). Oyun bitince (.hidden) gösterilecek yol kalmaz: düğme
  // görünmez ama uygulama.css'te yerini tutar, mod adı ortada kalır.
  P.canShowResult = function () { return !this.over && this.optimal > 0; };
  const asilAskShowResult = P.askShowResult;
  P.askShowResult = function (...arg) {
    const s = asilAskShowResult.apply(this, arg);
    // Günlükte ilk çözüm yoksa sonuç açıkça söylenir
    if (this.mode === "daily" && !this.dailyRecord()) {
      this.el.pesText.textContent = "Bir en kısa yol gösterilir. Bugünün bulmacası çözülmemiş sayılır, sonucu paylaşamazsın.";
    }
    return s;
  };
  const btnSonuc = al("btnShowResult");
  btnSonuc.className = "icon-btn" + (btnSonuc.classList.contains("hidden") ? " hidden" : "");
  btnSonuc.setAttribute("aria-label", "En kısa yolu göster");
  al("btnHelp").after(btnSonuc);
  // Bitmiş oyunda Gönder'in yapacağı bir şey yok: devre dışı (app.js her durum değişiminde renderStatus çağırır)
  const asilRenderStatus = P.renderStatus;
  P.renderStatus = function (...arg) {
    al("btnGonder").disabled = this.over;
    return asilRenderStatus.apply(this, arg);
  };
  al("btnGonder").addEventListener("click", (e) => {
    e.currentTarget.blur();          // odakta kalırsa bağlı klavyedeki Enter/Space onu yeniden tetikler
    oyun?.pressKey("ENTER");
  });

  // Çözüm penceresi win()'den 650 ms sonra açılır; o arada oyuncu ana ekrana dönüp
  // başka bir bulmacaya (ör. bugün zaten çözülmüş Günün Bulmacası) geçmiş olabilir.
  // Pencere yalnızca hâlâ aynı biten oyundaysa açılır.
  let kazanilan = null;
  const asilWin = P.win;
  P.win = function (...arg) {
    kazanilan = { mod: this.mode, bas: this.startWord, hedef: this.targetWord, uzunluk: this.chain.length };
    return asilWin.apply(this, arg);
  };
  // Yenile onayı kapanınca bir sonraki açılış yine app.js'indir (menüdeki "Yeniden dene" değil)
  const asilShowYenile = P.showYenile;
  P.showYenile = function (ac, ...arg) {
    if (!ac) yenidenOnay = false;
    return asilShowYenile.call(this, ac, ...arg);
  };
  // iOS, sayfada dokunma dinleyicisi yoksa düğmelerin basılı görünümünü (:active) göstermez
  document.addEventListener("touchstart", () => {}, { passive: true });

  /* ---------- Günlükte tekrar yok (sahip kararı, 15 Kasım 2026; site aynı kalır) ----------
     "Tekrar dene" (çözüm penceresi, durum satırı) ve ödüllü reklamlı tekrar hiç açılmaz. Eski sürümde
     başlamış bir tekrar (`sm_gunluk_*` içinde `deneme`) okunurken temizlenir: günlük ilk çözümüyle bitmiş
     açılır; ilk çözüm, en iyi, seri ve paylaşım alanlarına dokunulmaz. */
  P.canRetry = () => false;
  const asilBeginRetry = P.beginRetry;
  P.beginRetry = function (...arg) { if (this.mode !== "daily") return asilBeginRetry.apply(this, arg); };
  const asilDailyRecord = P.dailyRecord;
  P.dailyRecord = function (...arg) {
    const k = asilDailyRecord.apply(this, arg);
    if (!k || !("deneme" in k)) return k;
    const { deneme, ...temiz } = k;
    this.saveDailyRecord(temiz);
    return temiz;
  };
  // sm_state süren bir tekrarı tutuyorsa günlük, günün kaydından (çözülmüş) yeniden kurulur
  const asilRestoreState = P.restoreState;
  P.restoreState = function (...arg) {
    const s = asilRestoreState.apply(this, arg);
    if (s && this.mode === "daily" && !this.over && this.dailyRecord()) this.newGame("daily");
    return s;
  };

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
    const adim = suruyor("daily") ? oyun.chain.length - 1 : (kayitli("daily")?.s.chain.length || 1) - 1;
    const enAzYazi = enAz ? ` · en az ${enAz}` : "";
    al("gunlukTarih").textContent = new Intl.DateTimeFormat("tr-TR",
      { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
    al("gunlukBulmaca").textContent = `${bas} → ${hedef}`;
    const cozuldu = !!kayit;
    // "Sonucu göster" ile bitirilmiş (çözüm kaydı yok): ayrı metin, ayrı eylem
    const gosterildi = !kayit && oyun.dailyShown();
    if (gosterildi) {
      al("gunlukDurum").textContent = "Çözüm gösterildi" + enAzYazi;
    } else if (cozuldu) {
      const enIyi = kayit.enIyi || kayit.steps;
      al("gunlukDurum").textContent = `Çözüldü · ${kayit.steps} adım` + (enIyi < kayit.steps ? ` · en iyi ${enIyi}` : "") + enAzYazi;
    } else {
      al("gunlukDurum").textContent = adim > 0 ? `${adim} adım attın` + enAzYazi
        : "Herkese aynı bulmaca" + (enAz ? ` · en az ${enAz} adım` : "");
    }
    al("btnGunluk").textContent = cozuldu || gosterildi ? "Sonucu gör" : adim > 0 ? "Devam et" : "Oyna";
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
    if (ac) { al("nasil-oynanir").scrollTop = 0; al("btnYardimKapat").focus({ preventScroll: true }); }
  };

  const anaAc = () => {
    ekranAc("ana");
    menuAc(false);
    oyun.hideModal();
    oyun.showOffer(false);
    oyun.showYenile(false);
    anaCiz();
    al("ana").scrollTop = 0;
  };

  // Ana ekrandan oyuna: o modda kalınan oyun sürer, yoksa yenisi açılır
  const oyna = (mod) => {
    if (!suruyor(mod)) {
      // Çözülmüş günlüğü newGame günün kaydından kurar
      const k = mod === "daily" && oyun.dailyRecord() ? null : kayitli(mod);
      if (k) yaz("sm_state", k.ham);
      if (!k || !oyun.restoreState() || oyun.mode !== mod) oyun.newGame(mod);
    }
    ekranAc("oyun");
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
    menuAc(false);                         // çözüm penceresi açık menünün üstüne açılmaz
    const s = asilShowModal.call(this, secenek, ...arg);
    // En kısa yoldan uzun çözüldüyse "En kısa yolu gör" (pencere kapanmaz: geçiş reklamı kuralı aynı kalır)
    const adim = this.lastResult ? this.lastResult.steps : this.chain.length - 1;
    al("btnEnKisa").hidden = this.shown || !this.optimal || adim <= this.optimal;
    al("enKisaYol").hidden = true;
    return s;
  };
  al("btnEnKisa").addEventListener("click", (e) => {
    const yol = oyun?.shortestPath();
    if (!yol) return;
    al("enKisaYol").textContent = yol.join(" → ");
    al("enKisaYol").hidden = false;
    e.currentTarget.hidden = true;
    // Gizlenen düğmeden odak body'ye düşmesin; ekran okuyucu yolu okusun
    al("enKisaYol").focus({ preventScroll: true });
  });

  // Mod adı başlıkta yazar (sekmelerin yerine); app.js her mod değişiminde updateTabs çağırır
  const asilUpdateTabs = P.updateTabs;
  P.updateTabs = function (...arg) {
    al("modAdi").textContent = this.mode === "daily" ? "Günün Bulmacası" : "Serbest Oyun";
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
  // Sitedeki "Anladım" bağlantısı sayfayı kaydırır; uygulamada yardım kapanır (başlıktaki yardım gizli, yardım menüde)
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
  // Plus (satın al, geri yükle, cayma notu) ana ekranda kart olarak durur: doğrudan ulaşılır.
  // Görünürlüğünü ve metnini app.js yönetir (renderPlus: yalnızca kanca `plusSatinAl` veriyorsa görünür).
  al("plusBox").classList.add("kart");
  al("ana").insertBefore(al("plusBox"), al("btnAnaYardim"));
  // Gizlilik ve lisans bağlantıları ana ekranın altında
  al("ana").append(document.querySelector(".site-footer"));

  /* ---------- Menü: oyun başlığının sol ucunda; ekranın ortasında kart olarak açılır ----------
     Sitenin yenile düğmesi uygulamada gizlidir (style: uygulama.css). "Serbest oyun" serbestte ona
     basar (app.js askRestart: yeni bulmaca, ilerleme varsa onay), günlükte ana ekrandaki Serbest
     Oyun kartının yolundan gider (kalınan serbest oyun sürer). "Yeniden dene" aynı bulmacayı
     baştan açar. Ses ana ekrandaki düğmeyle aynı kaydı kullanır (sm_ses);
     sm_titresim'i yerel.js okur. */
  // Günlükte "Baştan başla" olmasın (sahip kararı); sahibin cevabı gelene dek Yeniden dene yalnızca serbestte
  const YENIDEN_DENE_GUNLUKTE = false;
  const btnMenu = al("btnMenu");
  const menuAcik = () => !menu.classList.contains("hidden");
  const anahtarlar = () => {
    al("menuTitresim").setAttribute("aria-checked", String(oku("sm_titresim") !== "0"));
    al("menuSes").setAttribute("aria-checked", String(!al("btnMute").classList.contains("muted")));
  };
  function menuAc(ac) {
    if (ac === menuAcik()) return;
    menu.classList.toggle("hidden", !ac);
    menu.setAttribute("aria-hidden", String(!ac));
    btnMenu.setAttribute("aria-expanded", String(ac));
    if (ac) {
      al("menuYeniden").hidden = oyun?.mode !== "free" && !YENIDEN_DENE_GUNLUKTE;
      anahtarlar();
      al("btnAna").focus({ preventScroll: true });
    } else {
      // Odak başka yere (ör. yardımın kapat düğmesi) geçmediyse ☰'e döner. Oyunda orada bırakılmaz (bağlı
      // klavyedeki Boşluk menüyü yeniden açıyordu): ☰'e verilip bırakılır, Tab başlıktan sürer
      if (menu.contains(document.activeElement) || document.activeElement === govde) {
        btnMenu.focus({ preventScroll: true });
        if (ekran === "oyun") btnMenu.blur();
      }
    }
  }
  btnMenu.addEventListener("click", () => menuAc(true));
  menu.addEventListener("click", (e) => { if (e.target === menu) menuAc(false); });   // dışarı dokunuş
  al("menuSerbest").addEventListener("click", () => {
    if (oyun.mode === "free") { menuAc(false); al("btnRestart").click(); }
    else { oyna("free"); menuAc(false); }
  });
  // Yeniden dene: serbestte app.js'te "aynı bulmaca baştan" yolu yok (askRestart yeni bulmaca çeker);
  // zincir başlangıca döner. Onay için sitenin yenile penceresi kendi metniyle kullanılır.
  const yenidenBasla = () => {
    Object.assign(oyun, { chain: [oyun.startWord], buffer: "", over: false, shown: false });
    oyun.render();
    oyun.saveState();
  };
  al("menuYeniden").addEventListener("click", () => {
    menuAc(false);
    if (oyun.mode === "daily") return al("btnRestart").click();   // app.js: günlükte aynı bulmaca baştan
    if (!oyun.canUndo()) return yenidenBasla();                   // silinecek adım yok
    al("yenileTitle").textContent = "Baştan başlansın mı?";
    al("yenileText").textContent = "Attığın adımlar silinir, aynı bulmaca baştan açılır.";
    al("btnYenileEvet").textContent = "Baştan başla";
    oyun.showYenile(true);
    yenidenOnay = true;
  });
  // Onay "Yeniden dene" içinse app.js'in restart'ı (yeni bulmaca) çalışmaz
  al("yenile").addEventListener("click", (e) => {
    if (!yenidenOnay || !e.target.closest("#btnYenileEvet")) return;
    e.stopPropagation();
    oyun.showYenile(false);
    yenidenBasla();
  }, true);
  al("menuYardim").addEventListener("click", () => { yardimAc(true); menuAc(false); });   // önce yardım: odak onun kapat düğmesine
  al("menuTitresim").addEventListener("click", () => {
    const ac = oku("sm_titresim") === "0";
    try { ac ? localStorage.removeItem("sm_titresim") : localStorage.setItem("sm_titresim", "0"); }
    catch (_) { /* kayıt tutulamadı */ }
    anahtarlar();
  });
  al("menuSes").addEventListener("click", () => { al("btnMute").click(); anahtarlar(); });

  // Ana ekran, yardım ya da menü açıkken fiziksel klavye (ve Enter) alttaki tahtaya yazmaz
  document.addEventListener("keydown", (e) => {
    if (yardimAcik()) { e.stopPropagation(); if (e.key === "Escape") yardimAc(false); }
    else if (menuAcik()) {
      e.stopPropagation();
      if (e.key === "Escape") menuAc(false);
      if (e.key === "Tab") {                       // odak menünün içinde döner (aria-modal)
        const ogeler = [...menu.querySelectorAll("button:not([hidden])")];
        const sira = ogeler.indexOf(document.activeElement);
        const sonraki = e.shiftKey ? (sira <= 0 ? ogeler.length - 1 : sira - 1) : (sira + 1) % ogeler.length;
        e.preventDefault();
        ogeler[sonraki].focus();
      }
    }
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
