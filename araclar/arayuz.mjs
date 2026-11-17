/* =========================================================
 * Uygulama arayüzünün index.html'e eklenen parçaları (yalnızca işaretleme).
 * Nereye ekleneceği: araclar/web-esitle.mjs → donustur().
 * Davranış: web/uygulama.js. Görünüm: web/uygulama.css. Site bunları görmez.
 * Satır içi stil ve olay yok (CSP); renkler uygulama.css'te belirteçlerden gelir.
 * ========================================================= */

const ikon = (yol) => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${yol}</svg>`;

// Uygulama işareti: merdiven ve üç blok (yerel açılış görseliyle aynı çizim). Bloklar
// gruplanır: açılış ekranında alttan üste (i-dus-1 → 3) basamağa (i-basamak-1 → 3) düşerler (uygulama.css)
const ISARET = `<svg class="isaret" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <rect class="i-cita i-basamak-3" x="52" y="51" width="216" height="18" rx="5"/>
      <rect class="i-cita i-basamak-2" x="52" y="151" width="216" height="18" rx="5"/>
      <rect class="i-cita i-basamak-1" x="52" y="251" width="216" height="18" rx="5"/>
      <rect class="i-ray" x="40" y="0" width="22" height="320" rx="9"/>
      <rect class="i-cita" x="46" y="4" width="8" height="312" rx="4"/>
      <rect class="i-ray" x="258" y="0" width="22" height="320" rx="9"/>
      <rect class="i-cita" x="264" y="4" width="8" height="312" rx="4"/>
      <g class="i-dus i-dus-3"><rect class="i-blok-g" x="72" y="26" width="84" height="84" rx="16"/>
      <rect class="i-blok" x="72" y="18" width="84" height="84" rx="16"/></g>
      <g class="i-dus i-dus-2"><rect class="i-yesil-g" x="118" y="126" width="84" height="84" rx="16"/>
      <rect class="i-yesil" x="118" y="118" width="84" height="84" rx="16"/></g>
      <g class="i-dus i-dus-1"><rect class="i-hedef-g" x="164" y="226" width="84" height="84" rx="16"/>
      <rect class="i-hedef" x="164" y="218" width="84" height="84" rx="16"/></g>
    </svg>`;

// Açılış ekranı (sözlük yüklenene dek durur) ve ana ekran: iki büyük seçenek
// Ana ekranın üst satırı: ses düğmesi uygulama.js ile buraya taşınır
export const ANA_EKRAN = `<div class="acilis" id="acilis" aria-hidden="true">
    ${ISARET}
    <p class="acilis-ad">Sözcük Merdiveni</p>
  </div>

  <section class="ana" id="ana" aria-label="Ana ekran">
    <div class="ana-ust" id="anaUst"></div>
    <div class="ana-marka">
    ${ISARET}
      <h1 class="ana-ad">Sözcük Merdiveni</h1>
      <p>Her basamakta tek harf değiştir, hedef kelimeye in.</p>
    </div>
    <div class="kart" role="group" aria-labelledby="kartGunlukBaslik">
      <p class="kart-ust" id="gunlukTarih"></p>
      <h2 id="kartGunlukBaslik">Günün Bulmacası</h2>
      <p class="kart-bulmaca" id="gunlukBulmaca"></p>
      <p class="kart-durum" id="gunlukDurum"></p>
      <button class="btn-primary" id="btnGunluk" type="button">Oyna</button>
      <p class="kart-alt" id="gunlukSonraki" hidden>Yeni bulmaca <strong id="anaGeriSayim">--:--:--</strong> sonra</p>
    </div>
    <div class="kart" role="group" aria-labelledby="kartSerbestBaslik">
      <h2 id="kartSerbestBaslik">Serbest Oyun</h2>
      <p class="kart-durum" id="serbestDurum"></p>
      <div class="ana-ayar" id="anaAyar">
        <div class="btn-group" role="group" aria-label="Zorluk">
          <button class="pick-btn" type="button" data-diff="kolay">Kolay</button>
          <button class="pick-btn" type="button" data-diff="orta">Orta</button>
          <button class="pick-btn" type="button" data-diff="zor">Zor</button>
        </div>
        <div class="btn-group" role="group" aria-label="Kelime uzunluğu">
          <button class="pick-btn" type="button" data-len="3">3 harf</button>
          <button class="pick-btn" type="button" data-len="4">4 harf</button>
          <button class="pick-btn" type="button" data-len="5">5 harf</button>
        </div>
      </div>
      <button class="btn-primary" id="btnSerbest" type="button">Oyna</button>
    </div>
    <button class="ana-nasil" id="btnAnaYardim" type="button">Nasıl oynanır?</button>
  </section>`;

// Oyun başlığı: menü + mod adı (sitedeki sekmelerin yerine). Sitenin yenile düğmesi uygulamada gizlidir;
// yerine menüdeki "Yeni serbest oyun" vardır (sahip notu, 15 Kasım 2026)
export const BASLIK = `<button class="icon-btn" id="btnMenu" type="button" aria-label="Menü" aria-expanded="false" aria-controls="menu">${ikon('<path d="M4 7h16M4 12h16M4 17h16"/>')}</button>
    <h2 class="mod-adi" id="modAdi"></h2>`;

// Oyun menüsü: ekranın ortasında yüzen kart. Üstte büyük eylem tuşları (sahip isteği, 15 Kasım 2026),
// altta yardım ve açık/kapalı ayarlar (role="switch"). "Yeniden dene" günlükte gizlidir (uygulama.js).
const menuOge = (id, yol, ad, anahtar = false) => `<button class="menu-oge" id="${id}" type="button"` +
  `${anahtar ? ' role="switch" aria-checked="true"' : ""}>${ikon(yol)}<span>${ad}</span>` +
  `${anahtar ? '<span class="anahtar" aria-hidden="true"></span>' : ""}</button>`;
export const MENU = `<div class="modal-overlay menu-perde hidden" id="menu" role="dialog" aria-modal="true" aria-label="Menü" aria-hidden="true">
    <div class="menu">
      <button class="btn-primary" id="btnAna" type="button">Ana menüye dön</button>
      <button class="btn-secondary" id="menuSerbest" type="button">Serbest oyun</button>
      <button class="btn-secondary" id="menuYeniden" type="button">Yeniden dene</button>
      <hr class="menu-ayrac">
      ${menuOge("menuYardim", '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8"/><path d="M12 17h.01"/>', "Nasıl oynanır?")}
      ${menuOge("menuTitresim", '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 9v6M21 9v6"/>', "Titreşim", true)}
      ${menuOge("menuSes", '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', "Ses", true)}
      ${menuOge("menuYazi", '<path d="m3 19 5-14 5 14M4.8 14h6.4"/><path d="m14 19 3.5-9 3.5 9M15.2 16h4.6"/>', "Büyük yazı", true)}
    </div>
  </div>`;

// İlk oyun girişinde bir kez açılan kısa "nasıl oynanır" kartı (sahip isteği, 16 Kasım 2026): menünün kartı
// ve perdesi. Örnekteki harfleri uygulama.js adım adım değiştirir (hareketi azaltta durur).
export const ILK_YARDIM = `<div class="modal-overlay menu-perde hidden" id="ilkYardim" role="dialog" aria-modal="true" aria-labelledby="ilkYardimBaslik" aria-hidden="true">
    <div class="menu ilk-yardim">
      <h2 id="ilkYardimBaslik">Nasıl oynanır?</h2>
      <ul class="ilk-kurallar">
        <li>Her adımda tek harf değiştir.</li>
        <li>Her adım gerçek bir kelime olmalı.</li>
        <li>Hedef kelimeye ulaş.</li>
      </ul>
      <div class="ilk-ornek" role="img" aria-label="Örnek: KAL, KOL, KOY, SOY. Her adımda bir harf değişir.">
        <div class="word-row" id="ilkOrnek"><div class="tile filled">K</div><div class="tile filled">A</div><div class="tile filled">L</div></div>
        <p class="ilk-zincir" id="ilkZincir"><span>KAL</span> → <span>KOL</span> → <span>KOY</span> → <span>SOY</span></p>
      </div>
      <dl class="ilk-modlar">
        <dt>Günün Bulmacası</dt><dd>Herkese aynı bulmaca, her gün yenisi.</dd>
        <dt>Serbest Oyun</dt><dd>İstediğin kadar bulmaca çöz.</dd>
      </dl>
      <button class="btn-primary" id="ilkBasla" type="button">Başla</button>
      <button class="ana-nasil" id="ilkDaha" type="button">Daha fazla</button>
    </div>
  </div>`;

// Ekran klavyesinin altındaki eylem sırası: ortada büyük Gönder; Geri al (solda) ve İpucu (sağda)
// sitenin durum satırından uygulama.js ile buraya taşınır, kalan hak rozetleriyle birlikte
export const EYLEMLER = `<div class="eylemler" id="eylemler" role="group" aria-label="Eylemler">
    <button class="btn-primary gonder" id="btnGonder" type="button">Gönder</button>
  </div>`;

// Çözüm penceresinde, en kısa yoldan uzun çözülünce: basınca bir en kısa yol kelime kelime yazılır
// (yalnızca gösterim; kayıt değişmez). Görünürlüğü ve yolu uygulama.js verir.
export const EN_KISA = `<button class="btn-secondary" id="btnEnKisa" type="button" hidden>En kısa yolu gör</button>
      <p class="en-kisa-yol" id="enKisaYol" tabindex="-1" hidden></p>`;

// "Nasıl oynanır?" uygulamada pencere olarak açılır: kapatma düğmesi ve klavye açıklaması
export const YARDIM_KAPAT = `<button class="modal-close" id="btnYardimKapat" type="button" aria-label="Kapat">${ikon('<path d="m6 6 12 12m0-12L6 18"/>')}</button>`;
export const YARDIM_KLAVYE = `<p>Kelimeyi alttaki klavyeyle yaz, <strong>Gönder</strong>'e bas.
  Geri al ve İpucu, Gönder'in iki yanında.</p>`;

// uygulama.js'in bağlandığı site ögeleri: her biri index.html'de tam bir kez bulunmalı
export const SITE_OGELERI = [
  'id="btnHelp" href="#nasil-oynanir"', '<a class="btn-primary" href="#oyun">', 'id="btnMute"', 'id="btnRestart"',
  'id="modal"', 'id="offer"', 'id="pes"', 'id="yenile"', 'id="btnUndo"', 'id="btnHint"', 'id="btnShowResult"', 'id="modalGrid"', 'id="btnNewGame"', 'id="plusBox"', 'id="steps"', 'id="inputRow"', 'id="game"', 'class="site-footer"', '<h1 class="brand-game">',
];
