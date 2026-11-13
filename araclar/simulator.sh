#!/usr/bin/env bash
# Simülatör derlemesi ve ekran görüntüleri. Yalnızca .github/workflows/simulator.yml
# çalıştırır (macOS). İmzasız simülatör derlemesidir: Apple hesabı, gizli bilgi yok.
#
#   npm ci && npm run ios:sync && bash araclar/simulator.sh <çıktı klasörü>
#
# Otomatik oynama betiği (araclar/otomatik-oyna.js) YALNIZCA burada, derlemeden
# hemen önce ios/App/App/public içine eklenir. Her `cap sync` (npm run ios:sync,
# TestFlight iş akışı) o klasörü www/'den yeniden yazar ve betiği siler.
# DİKKAT: bunu yerelde çalıştırıp cap sync yapmadan Xcode'da arşivlemeyin.
set -euo pipefail   # macOS bash 3.2: $(...) içinde set -e geçmez, hatalar açıkça döndürülür

CIKTI=${1:?"kullanım: bash araclar/simulator.sh <çıktı klasörü>"}
KOK=$(cd "$(dirname "$0")/.." && pwd)
KIMLIK=$(jq -r .appId "$KOK/capacitor.config.json")
PUBLIC="$KOK/ios/App/App/public"
DD="${RUNNER_TEMP:-/tmp}/simulator-dd"
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
mkdir -p "$CIKTI"

echo "::group::Otomatik oynama betiği ekleniyor"
[ -f "$PUBLIC/index.html" ] || { echo "::error::$PUBLIC/index.html yok: önce npm run ios:sync"; exit 1; }
cp "$KOK/araclar/otomatik-oyna.js" "$PUBLIC/"
# yerel.js'ten ÖNCE: betik reklam/ATT/satın almayı kapatan bayrağı yerel.js okumadan koyar
perl -0pi -e 's|<script src="yerel\.js"></script>|<script src="otomatik-oyna.js"></script>\n  $&|' "$PUBLIC/index.html"
grep -q '<script src="otomatik-oyna.js"></script>' "$PUBLIC/index.html" ||
  { echo "::error::otomatik-oyna.js index.html'e eklenemedi"; exit 1; }
echo "::endgroup::"

echo "::group::Derleme (Debug, iOS Simülatörü, imzasız)"
xcodebuild -version
# Capacitor 8 Swift Package Manager kullanır; paketler derlemeden önce çözülür
# Sürümler Package.resolved'dan (revision ile kilitli); dışına çıkılamaz (-onlyUsePackageVersionsFromResolvedFile)
xcodebuild -resolvePackageDependencies -onlyUsePackageVersionsFromResolvedFile \
  -project "$KOK/ios/App/App.xcodeproj" -scheme App -derivedDataPath "$DD"
# Debug: ios/debug.xcconfig CAPACITOR_DEBUG=true verir, böylece Capacitor
# JavaScript konsolunu uygulamanın çıktısına aktarır (aşama işaretleri oradan okunur)
xcodebuild build -quiet -onlyUsePackageVersionsFromResolvedFile -project "$KOK/ios/App/App.xcodeproj" -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO
[ -d "$APP" ] || { echo "::error::$APP yok"; exit 1; }
echo "::endgroup::"

# $1 adı desene uyan simülatörün kimliği: en yeni iOS sürümündeki seçilir.
# Koşucu görüntüsünde yoksa, o tipi destekleyen en yeni iOS'ta $2 adıyla yaratılır.
simulator_sec() {
  local desen=$1 ad=$2 udid secim
  udid=$(xcrun simctl list devices available -j | jq -r --arg d "$desen" '
    [.devices | to_entries[] | select(.key | test("SimRuntime\\.iOS-"))
     | (.key | capture("iOS-(?<a>[0-9]+)-(?<b>[0-9]+)") | [(.a | tonumber), (.b | tonumber)]) as $s
     | .value[] | select(.name | test($d)) | {s: $s, name, udid}]
    | sort_by([.s, .name]) | last | .udid // empty')
  if [ -z "$udid" ]; then
    # Her iOS sürümü yalnızca bazı cihaz tiplerini destekler (ör. iOS 26'da 1. nesil SE yok)
    secim=$(xcrun simctl list runtimes available -j | jq -r --arg d "$desen" '
      [.runtimes[] | select(.platform == "iOS") | . as $r
       | .supportedDeviceTypes[] | select(.name | test($d))
       | {v: ($r.version | split(".") | map(tonumber)), name, tur: .identifier, surum: $r.identifier}]
      | sort_by([.v, .name]) | last | select(. != null) | "\(.tur) \(.surum)"')
    if [ -z "$secim" ]; then
      echo "::error::'$desen' simülatörü yok ve yaratılamadı. Desteklenen iPhone'lar:" >&2
      xcrun simctl list runtimes available -j |
        jq -r '.runtimes[] | select(.platform == "iOS") | .name + ": " + ([.supportedDeviceTypes[].name | select(test("iPhone"))] | join(", "))' >&2
      return 1
    fi
    udid=$(xcrun simctl create "$ad" ${secim% *} ${secim#* }) || return 1
  fi
  echo "$udid"
}

# Uygulamanın çıktısında "SM-OTOMATIK: <aşama>" satırını bekler (en çok 120 sn)
bekle() {
  local gunluk=$1 asama=$2 i
  for i in $(seq 240); do
    if grep -q "SM-OTOMATIK: hata" "$gunluk"; then
      echo "::error::$(grep -m1 'SM-OTOMATIK: hata' "$gunluk")"; return 1
    fi
    grep -q "SM-OTOMATIK: $asama" "$gunluk" && return 0
    sleep 0.5
  done
  echo "::error::'$asama' aşaması 120 sn içinde gelmedi"; return 1
}

# $1: dosya adı öneki, $2: simülatör adı deseni
calistir() {
  local on=$1 udid gunluk paket adim onceki=""
  udid=$(simulator_sec "$2" "sozcuk-$on")
  gunluk="$CIKTI/$on.log"
  echo "::group::$on: $(xcrun simctl list devices | grep "$udid")"
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl install "$udid" "$APP"
  paket=$(xcrun simctl get_app_container "$udid" "$KIMLIK" app)
  # Uygulamanın çıktısı doğrudan dosyaya; NSUnbufferedIO arabelleği kapatır
  # (kapatmasa da otomatik-oyna.js her aşamada onay bekler, yalnızca yavaşlar)
  SIMCTL_CHILD_NSUnbufferedIO=YES xcrun simctl launch \
    --stdout="$gunluk" --stderr="$CIKTI/$on.err.log" "$udid" "$KIMLIK"
  for adim in 0-ana-ekran:ana 1-gunun-bulmacasi:oyun 2-hamleler:hamle 3-cozum:cozum 4-nasil-oynanir:nasil; do
    if ! bekle "$gunluk" "${adim#*:}"; then
      xcrun simctl io "$udid" screenshot "$CIKTI/$on-hata.png" || true
      grep -v "(yineleme)" "$gunluk"; exit 1
    fi
    xcrun simctl io "$udid" screenshot "$CIKTI/$on-${adim%%:*}.png"
    # Ekran görüntüsü alındı: uygulama bir sonraki aşamaya geçebilir
    touch "$paket/public/onay-${adim#*:}.txt"
    # Art arda iki aynı görüntü: aşama ilerlememiş ya da görüntü bayat
    if [ -n "$onceki" ] && cmp -s "$onceki" "$CIKTI/$on-${adim%%:*}.png"; then
      echo "::error::$on: $(basename "$onceki") ile ${adim%%:*} aynı görüntü"; exit 1
    fi
    onceki="$CIKTI/$on-${adim%%:*}.png"
  done
  # Klavye açıkken ölçülen görünen alan (otomatik-oyna.js yazar): iş günlüğünde görünsün
  grep -o "SM-OTOMATIK: bilgi.*" "$gunluk" || echo "::warning::$on: klavye ölçüsü günlükte yok"
  sleep 2
  # Çökme denetimi: uygulama hamlelerden sonra hâlâ çalışıyor olmalı (PID'li launchd işi)
  if ! xcrun simctl spawn "$udid" launchctl list |
       awk -v k="UIKitApplication:$KIMLIK" 'index($3, k) == 1 && $1 ~ /^[0-9]+$/ { b = 1 } END { exit !b }'; then
    echo "::error::$on: uygulama çalışmıyor (çöktü mü?)"; grep -v "(yineleme)" "$gunluk"; exit 1
  fi
  # Sayfa hatası, console.error ve yedek sözlüğe düşme Capacitor çıktısına yazılır
  if grep -E "JS ERROR|\[error\]|mock sözlük" "$gunluk" "$CIKTI/$on.err.log"; then
    echo "::error::$on: JavaScript hatası ya da words.json yüklenmedi"; exit 1
  fi
  xcrun simctl shutdown "$udid"
  echo "::endgroup::"
}

# Ekran klavyesi açılsın: Simulator "bağlı klavye" varsayarsa telefonun klavyesi görünmez ve
# oyun ekranının klavyeli hali (uygulamanın asıl kullanımı) ekran görüntüsüne girmez
defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false

calistir kucuk '^iPhone SE'
calistir buyuk '^iPhone [0-9]+ Pro Max$'
ls -l "$CIKTI"
