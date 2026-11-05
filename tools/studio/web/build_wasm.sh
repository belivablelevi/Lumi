#!/usr/bin/env bash
# Builds Lumi Studio's face engine (the firmware's own lumi_core, through the same C API the
# desktop app uses) to WebAssembly for the Chrome version of Studio:
#   tools/studio/web/build_wasm.sh   ->   web/public/studio/lumicore.wasm
# Downloads wasi-sdk (clang + wasi-libc + libc++ for wasm) into build/ once, like
# tools/web-duel/build.sh. CI runs this and fails if the committed .wasm is out of date.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
SDK_VERSION=25
SDK="$HERE/build/wasi-sdk-$SDK_VERSION.0"
OUT="${1:-$ROOT/web/public/studio/lumicore.wasm}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=x86_64-linux ;;
  Linux-aarch64) PLATFORM=arm64-linux ;;
  Darwin-x86_64) PLATFORM=x86_64-macos ;;
  Darwin-arm64) PLATFORM=arm64-macos ;;
  *) echo "unsupported platform (CI builds this on Linux)" >&2; exit 1 ;;
esac

if [ ! -x "$SDK/bin/clang++" ]; then
  mkdir -p "$HERE/build"
  url="https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$SDK_VERSION/wasi-sdk-$SDK_VERSION.0-$PLATFORM.tar.gz"
  echo "Downloading $url"
  curl -fsSL "$url" | tar -xz -C "$HERE/build"
  mv "$HERE/build/wasi-sdk-$SDK_VERSION.0-$PLATFORM" "$SDK"
fi

CORE="$ROOT/firmware/lib/lumi_core/src"
mkdir -p "$(dirname "$OUT")"
# Only the lumi_* functions (LUMI_API: default visibility) and the allocator are exported.
"$SDK/bin/clang++" --target=wasm32-wasip1 --sysroot="$SDK/share/wasi-sysroot" \
  -std=c++17 -O2 -flto -fno-exceptions -fno-rtti -fvisibility=hidden -Wall -Wextra \
  -I"$CORE" \
  -mexec-model=reactor -Wl,--export-dynamic -Wl,--export=malloc -Wl,--export=free \
  -Wl,--strip-all -Wl,--gc-sections \
  -o "$OUT" "$ROOT/tools/studio/native/lumi_capi.cpp" "$CORE"/*.cpp
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
