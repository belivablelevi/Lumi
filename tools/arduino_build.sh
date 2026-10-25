#!/usr/bin/env bash
# Build Lumi with arduino-cli instead of PlatformIO.
#
#   tools/arduino_build.sh                 # compile
#   tools/arduino_build.sh /dev/ttyACM0    # compile + upload
#
# Needs arduino-cli with the ESP32 core installed:
#   arduino-cli config add board_manager.additional_urls \
#     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
#   arduino-cli core install esp32:esp32@2.0.17
#
# The script also leaves an Arduino-IDE-ready sketch in build/arduino/Lumi
# (open Lumi.ino, and copy firmware/lib/lumi_core into your libraries folder).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKETCH="$ROOT/build/arduino/Lumi"
FQBN="${LUMI_FQBN:-esp32:esp32:XIAO_ESP32C3:CDCOnBoot=cdc}"
CLI="${ARDUINO_CLI:-arduino-cli}"

rm -rf "$SKETCH"
mkdir -p "$SKETCH"
cp "$ROOT"/firmware/src/*.cpp "$ROOT"/firmware/src/*.h "$SKETCH/"
cat > "$SKETCH/Lumi.ino" <<'EOF'
// Lumi - see firmware/src/main.cpp. setup() and loop() live there.
EOF

"$CLI" compile --fqbn "$FQBN" \
  --library "$ROOT/firmware/lib/lumi_core" \
  --build-property "compiler.cpp.extra_flags=-std=gnu++17 -Wall -Wextra" \
  --output-dir "$ROOT/build/arduino/out" \
  "$SKETCH"

if [[ $# -ge 1 ]]; then
  "$CLI" upload --fqbn "$FQBN" -p "$1" --input-dir "$ROOT/build/arduino/out" "$SKETCH"
fi
