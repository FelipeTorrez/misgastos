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
#
# Log del build: mobile/build-<variant>.log (se trunca en cada invocación;
#   el reintento por transform corrupto añade al mismo archivo).
#
# Saneo quirúrgico de transforms:
#   Si el build falla con
#     'Could not read workspace metadata from .../transforms/<hash>/metadata.bin'
#   o con 'Cannot snapshot ... not a regular file' que nombre un
#   'transforms/<hash>', el script borra SOLO ~/.gradle/caches/8.13/transforms/<hash>
#   (hash hexadecimal de 32 chars, validado por regex) y reintenta UNA sola vez.
#   Cualquier otro fallo sale sin tocar la caché.
#
# Forzar el saneo a mano (si el auto-reintento no alcanza o Gradle sigue
# inconsistente): copiar el <hash> del mensaje de error y correr
#   ./gradlew --stop && rm -rf ~/.gradle/caches/8.13/transforms/<hash>
# NUNCA borrar transforms/ entero: aborta builds en curso ("Device or resource busy").

set -euo pipefail

VARIANT="${1:-dev}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_TRANSFORMS="$HOME/.gradle/caches/8.13/transforms"
if [ "$VARIANT" = "release" ]; then
  LOG_FILE="$MOBILE_DIR/build-release.log"
else
  LOG_FILE="$MOBILE_DIR/build-dev.log"
fi

cd "$MOBILE_DIR/android"

ABI_FLAG="-PreactNativeArchitectures=arm64-v8a"

# --- 1. Build (con log a archivo) ---
# run_build ejecuta el assemble correspondiente y vuelca todo a LOG_FILE.
# Devuelve el exit code de gradlew (0 = OK).
run_build() {
  if [ "$VARIANT" = "release" ]; then
    echo "→ assembleRelease ($ABI_FLAG)"
    ./gradlew assembleRelease "$ABI_FLAG" --console=plain 2>&1 | tee -a "$LOG_FILE"
    return "${PIPESTATUS[0]}"
  else
    echo "→ assembleDebug dev client ($ABI_FLAG)"
    ./gradlew assembleDebug "$ABI_FLAG" --console=plain 2>&1 | tee -a "$LOG_FILE"
    return "${PIPESTATUS[0]}"
  fi
}

# Intenta el saneo quirúrgico: extrae transforms/<hash> del log, valida que el
# hash sea hexadecimal de 32 chars, para el daemon y borra SOLO esa carpeta.
# Echoa el hash en stdout si saneó; devuelve 1 si no había nada saneable.
try_sanitize_corrupt_transform() {
  local entry hash dir
  if ! grep -Eq 'Could not read workspace metadata from|not a regular file' "$LOG_FILE"; then
    return 1
  fi
  entry=$(grep -Eo 'transforms[/\\][0-9a-fA-F]{32}' "$LOG_FILE" | head -n 1 || true)
  hash=$(printf '%s' "$entry" | grep -Eo '[0-9a-fA-F]{32}$' || true)
  if [[ ! "$hash" =~ ^[0-9a-fA-F]{32}$ ]]; then
    return 1
  fi
  dir="$GRADLE_TRANSFORMS/$hash"
  case "$dir" in
    "$GRADLE_TRANSFORMS/"*) ;;
    *) echo "✖ hash válido pero ruta fuera de transforms, no toco nada: $dir" | tee -a "$LOG_FILE" >&2; return 1 ;;
  esac
  echo "⚠ transform corrupto detectado, saneando SOLO: $dir" | tee -a "$LOG_FILE" >&2
  ./gradlew --stop 2>&1 | tee -a "$LOG_FILE" >&2 || true
  rm -rf "$dir"
  echo "✔ removido: $dir (reintento UNA vez)" | tee -a "$LOG_FILE" >&2
  printf '%s' "$hash"
  return 0
}

: > "$LOG_FILE"
if run_build; then
  BUILD_OK=1
else
  BUILD_OK=0
  if SANITIZED_HASH=$(try_sanitize_corrupt_transform); then
    echo "→ reintentando build UNA vez tras sanear $SANITIZED_HASH..." | tee -a "$LOG_FILE"
    if run_build; then
      BUILD_OK=1
    else
      BUILD_OK=0
    fi
  fi
  if [ "$BUILD_OK" != "1" ]; then
    echo "✖ build falló (ver $LOG_FILE)" | tee -a "$LOG_FILE"
    exit 1
  fi
fi

if [ "$VARIANT" = "release" ]; then
  APK="app/build/outputs/apk/release/app-release.apk"
else
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
