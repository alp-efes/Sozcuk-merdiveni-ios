/* =========================================================
 * Uygulama arayüzünün index.html'e eklenen parçaları (yalnızca işaretleme).
 * Nereye ekleneceği: araclar/web-esitle.mjs → donustur().
 * Davranış: web/uygulama.js. Görünüm: web/uygulama.css. Site bunları görmez.
 * Satır içi stil ve olay yok (CSP); renkler uygulama.css'te belirteçlerden gelir.
 * ========================================================= */

const ikon = (yol) => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${yol}</svg>`;

// Uygulama işareti: merdiven ve üç blok (yerel açılış görseliyle aynı çizim)
const ISARET = `<svg class="isaret" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <rect class="i-cita" x="52" y="51" width="216" height="18" rx="5"/>
      <rect class="i-cita" x="52" y="151" width="216" height="18" rx="5"/>
      <rect class="i-cita" x="52" y="251" width="216" height="18" rx="5"/>
      <rect class="i-ray" x="40" y="0" width="22" height="320" rx="9"/>
      <rect class="i-cita" x="46" y="4" width="8" height="312" rx="4"/>
      <rect class="i-ray" x="258" y="0" width="22" height="320" rx="9"/>
      <rect class="i-cita" x="264" y="4" width="8" height="312" rx="4"/>
      <rect class="i-blok-g" x="72" y="26" width="84" height="84" rx="16"/>
      <rect class="i-blok" x="72" y="18" width="84" height="84" rx="16"/>
      <rect class="i-yesil-g" x="118" y="126" width="84" height="84" rx="16"/>
      <rect class="i-yesil" x="118" y="118" width="84" height="84" rx="16"/>
      <rect class="i-hedef-g" x="164" y="226" width="84" height="84" rx="16"/>
      <rect class="i-hedef" x="164" y="218" width="84" height="84" rx="16"/>
    </svg>`;

// Açılış ekranı (sözlük yüklenene dek durur) ve ana ekran: iki büyük seçenek
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

// Oyun başlığı: ana ekrana dönüş + mod adı (sitedeki sekmelerin yerine)
export const BASLIK = `<button class="icon-btn" id="btnAna" type="button" aria-label="Ana ekran">${ikon('<path d="m15 5-7 7 7 7"/>')}</button>
    <h2 class="mod-adi" id="modAdi"></h2>`;

// Telefonun klavyesini açan metin alanı; yazılan harfler merdivendeki kutularda görünür.
// Büyük harfe uygulama.js çevirir (Türkçe kural: i → İ, ı → I), bu yüzden autocapitalize kapalı.
export const GIRIS = '<input class="giris" id="giris" type="text" inputmode="text" enterkeyhint="send" autocomplete="off" ' +
  'autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Kelime yaz">';

// Türkçe klavyesi olmayanlar için: klavyenin hemen üstünde duran harf şeridi
export const HARFLER = `<div class="harfler" id="harfler" role="group" aria-label="Türkçe harfler">
${[["Ç"], ["Ğ"], ["I", "Noktasız I"], ["İ", "Noktalı İ"], ["Ö"], ["Ş"], ["Ü"]].map(([harf, ad]) =>
    `    <button class="harf" type="button" data-key="${harf}"${ad ? ` aria-label="${ad}"` : ""}><span class="cap">${harf}</span></button>`).join("\n")}
  </div>`;

// "Nasıl oynanır?" uygulamada pencere olarak açılır: kapatma düğmesi ve klavye açıklaması
export const YARDIM_KAPAT = `<button class="modal-close" id="btnYardimKapat" type="button" aria-label="Kapat">${ikon('<path d="m6 6 12 12m0-12L6 18"/>')}</button>`;
export const YARDIM_KLAVYE = `<p>Kelimeyi telefonunun klavyesiyle yaz, klavyenin sağ altındaki tuşla gönder.
  Klavyende Türkçe harf yoksa merdivenin altındaki <strong>Ç Ğ I İ Ö Ş Ü</strong> şeridini kullan.</p>`;

// uygulama.js'in bağlandığı site ögeleri: her biri index.html'de tam bir kez bulunmalı
export const SITE_OGELERI = [
  'id="btnHelp" href="#nasil-oynanir"', '<a class="btn-primary" href="#oyun">', 'id="btnMute"', 'id="btnRestart"',
  'id="modal"', 'id="offer"', 'id="btnNewGame"', 'id="plusBox"', 'id="steps"', 'id="inputRow"', 'id="game"', 'class="site-footer"', '<h1 class="brand-game">',
];
