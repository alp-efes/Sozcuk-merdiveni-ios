#!/usr/bin/env bash
# Simülatör derlemesi ve ekran görüntüleri. Yalnızca .github/workflows/simulator.yml
# çalıştırır (macOS). İmzasız simülatör derlemesidir: Apple hesabı, gizli bilgi yok.
#
#   npm ci && npm run ios:sync && bash araclar/simulator.sh <çıktı klasörü>
#
# Otomatik oynama betiği (araclar/otomatik-oyna.js) YALNIZCA burada, derlemeden
# hemen önce ios/App/App/public içine eklenir. www/, npm run ios:sync ve TestFlight
# paketi onu içermez (testler/paket.test.mjs).
set -euo pipefail

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
perl -0pi -e 's|<script src="yerel\.js"></script>|$&\n  <script src="otomatik-oyna.js"></script>|' "$PUBLIC/index.html"
grep -q '<script src="otomatik-oyna.js"></script>' "$PUBLIC/index.html" ||
  { echo "::error::otomatik-oyna.js index.html'e eklenemedi"; exit 1; }
echo "::endgroup::"

echo "::group::Derleme (Debug, iOS Simülatörü, imzasız)"
xcodebuild -version
# Capacitor 8 Swift Package Manager kullanır; paketler derlemeden önce çözülür
xcodebuild -resolvePackageDependencies -project "$KOK/ios/App/App.xcodeproj" -scheme App -derivedDataPath "$DD"
# Debug: ios/debug.xcconfig CAPACITOR_DEBUG=true verir, böylece Capacitor
# JavaScript konsolunu uygulamanın çıktısına aktarır (aşama işaretleri oradan okunur)
xcodebuild build -quiet -project "$KOK/ios/App/App.xcodeproj" -scheme App -configuration Debug \
  -sdk iphonesimulator -destination "generic/platform=iOS Simulator" \
  -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO
[ -d "$APP" ] || { echo "::error::$APP yok"; exit 1; }
echo "::endgroup::"

# $1 adı desene uyan simülatörün kimliği: en yeni iOS sürümündeki seçilir.
# Koşucu görüntüsünde yoksa o cihaz tipiyle en yeni iOS'ta $2 adıyla yenisi yaratılır.
simulator_sec() {
  local desen=$1 ad=$2 udid tur surum
  udid=$(xcrun simctl list devices available -j | jq -r --arg d "$desen" '
    [.devices | to_entries[] | select(.key | test("SimRuntime\\.iOS-"))
     | (.key | capture("iOS-(?<a>[0-9]+)-(?<b>[0-9]+)") | [(.a | tonumber), (.b | tonumber)]) as $s
     | .value[] | select(.name | test($d)) | {s: $s, name, udid}]
    | sort_by([.s, .name]) | last | .udid // empty')
  if [ -z "$udid" ]; then
    tur=$(xcrun simctl list devicetypes -j | jq -r --arg d "$desen" \
      '[.devicetypes[] | select(.name | test($d))] | last | .identifier // empty')
    surum=$(xcrun simctl list runtimes available -j | jq -r \
      '[.runtimes[] | select(.platform == "iOS")] | last | .identifier // empty')
    [ -n "$tur" ] && [ -n "$surum" ] || { echo "::error::'$desen' simülatörü yok ve yaratılamadı" >&2; return 1; }
    udid=$(xcrun simctl create "$ad" "$tur" "$surum")
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
  local on=$1 udid gunluk pid adim
  udid=$(simulator_sec "$2" "sozcuk-$on")
  gunluk="$CIKTI/$on.log"
  echo "::group::$on: $(xcrun simctl list devices | grep "$udid")"
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl install "$udid" "$APP"
  # --console-pty: uygulamanın çıktısı satır satır gelir (dosyaya yönlendirilen
  # çıktı arabelleğe alınır, işaretler gecikir)
  xcrun simctl launch --console-pty "$udid" "$KIMLIK" > "$gunluk" 2>&1 &
  pid=$!
  for adim in 1-gunun-bulmacasi:acilis 2-hamleler:hamle 3-cozum:cozum 4-nasil-oynanir:nasil; do
    if ! bekle "$gunluk" "${adim#*:}"; then
      xcrun simctl io "$udid" screenshot "$CIKTI/$on-hata.png" || true
      cat "$gunluk"; exit 1
    fi
    xcrun simctl io "$udid" screenshot "$CIKTI/$on-${adim%%:*}.png"
  done
  sleep 2
  # Çökme denetimi: uygulama hamlelerden sonra hâlâ çalışıyor olmalı (PID'li launchd işi)
  if ! xcrun simctl spawn "$udid" launchctl list |
       awk -v k="UIKitApplication:$KIMLIK" 'index($3, k) == 1 && $1 ~ /^[0-9]+$/ { b = 1 } END { exit !b }'; then
    echo "::error::$on: uygulama çalışmıyor (çöktü mü?)"; cat "$gunluk"; exit 1
  fi
  # Sayfa hatası ya da console.error Capacitor çıktısına düşer
  if grep -E "JS ERROR|\[error\]" "$gunluk"; then
    echo "::error::$on: JavaScript hatası"; cat "$gunluk"; exit 1
  fi
  kill "$pid" 2>/dev/null || true
  xcrun simctl shutdown "$udid"
  echo "::endgroup::"
}

calistir kucuk '^iPhone SE'
calistir buyuk '^iPhone [0-9]+ Pro Max$'
ls -l "$CIKTI"
