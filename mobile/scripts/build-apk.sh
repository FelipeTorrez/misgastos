#!/usr/bin/env bash
# Build + install de la APK de MisGastos en el celular por USB.
#
# Por qué existe este script:
#   1. El proyecto vive bajo OneDrive. Gradle crea hardlinks hacia archivos dentro
#      de OneDrive y su snapshotter falla con:
#        "Cannot snapshot ...libfbjni.so: not a regular file"
#      El fix es borrar la entrada de transform corrupta (lo hace este script).
#   2. Por defecto gradle compila 4 ABIs (arm64, armeabi-v7a, x86, x86_64).
#      El celular solo necesita arm64-v8a -> se ahorra la mayor parte del tiempo.
#
# Uso:
#   ./scripts/build-apk.sh              # dev client (metro, hot reload)
#   ./scripts/build-apk.sh release      # APK release standalone
#   ./scripts/build-apk.sh dev --install-native  (default: instala por adb)

set -euo pipefail

VARIANT="${1:-dev}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_TRANSFORMS="$HOME/.gradle/caches/8.13/transforms"

cd "$MOBILE_DIR/android"

# --- 1. Limpiar transform corrupto si aparece el error de snapshot ---
if grep -qs "not a regular file" "$MOBILE_DIR"/build-*.log 2>/dev/null; then
  echo "→ limpiando transforms con hardlinks rotos (OneDrive)"
  find "$GRADLE_TRANSFORMS" -maxdepth 1 -type d -newermt "-7 days" 2>/dev/null | while read -r d; do
    [ "$d" = "$GRADLE_TRANSFORMS" ] && continue
    rm -rf "$d"
  done
fi

ABI_FLAG="-PreactNativeArchitectures=arm64-v8a"

if [ "$VARIANT" = "release" ]; then
  echo "→ assembleRelease ($ABI_FLAG)"
  ./gradlew assembleRelease "$ABI_FLAG" --console=plain
  APK="app/build/outputs/apk/release/app-release.apk"
else
  echo "→ assembleDebug dev client ($ABI_FLAG)"
  ./gradlew assembleDebug "$ABI_FLAG" --console=plain
  APK="app/build/outputs/apk/debug/app-debug.apk"
fi

[ -f "$APK" ] || { echo "✖ no se generó $APK"; exit 1; }
echo "✔ APK: $MOBILE_DIR/android/$APK"

# --- 2. Instalar por USB ---
# adb es un binario nativo de Windows: NO acepta rutas estilo MSYS (/c/...).
# cygpath -w las convierte a C:\... y evita "failed to stat ... No such file or directory".
APK_NATIVE="$(cygpath -w "$MOBILE_DIR/android/$APK" 2>/dev/null || echo "$MOBILE_DIR/android/$APK")"
DEV=$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')
if [ -z "${DEV:-}" ]; then
  echo "⚠ ningún dispositivo conectado (USB debugging). APK lista igual: $APK"
  exit 0
fi
echo "→ instalando en $DEV"
adb -s "$DEV" install -r "$APK_NATIVE"

if [ "$VARIANT" != "release" ]; then
  # Metro y backend local por el cable: no depende del wifi.
  adb -s "$DEV" reverse tcp:8081 tcp:8081
  adb -s "$DEV" reverse tcp:3000 tcp:3000
  echo "✔ túneles: 8081 (metro) y 3000 (backend local)"
  echo "→ ahora: cd mobile && EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --dev-client"
fi
