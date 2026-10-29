#!/usr/bin/env bash
# Builds the website's Boop Pong (the real firmware) to WebAssembly:
#   tools/web-duel/build.sh   ->   web/public/duel/lumi-duel.wasm
# Downloads wasi-sdk (clang + wasi-libc + libc++ for wasm) into build/ once.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SDK_VERSION=25
SDK="$HERE/build/wasi-sdk-$SDK_VERSION.0"
OUT="$ROOT/web/public/duel/lumi-duel.wasm"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=x86_64-linux ;;
  Linux-aarch64) PLATFORM=arm64-linux ;;
  Darwin-x86_64) PLATFORM=x86_64-macos ;;
  Darwin-arm64) PLATFORM=arm64-macos ;;
  *) echo "unsupported platform" >&2; exit 1 ;;
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
"$SDK/bin/clang++" --target=wasm32-wasip1 --sysroot="$SDK/share/wasi-sysroot" \
  -std=c++17 -Oz -flto -fno-exceptions -fno-rtti -Wall -Wextra \
  -I"$CORE" -I"$ROOT/tools/sim" \
  -mexec-model=reactor -Wl,--strip-all -Wl,--gc-sections \
  -o "$OUT" "$HERE/duel.cpp" "$CORE"/*.cpp
echo "Wrote $OUT ($(wc -c < "$OUT") bytes)"
