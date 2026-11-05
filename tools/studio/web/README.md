# Lumi Studio in Chrome: the face engine

The browser version of Studio (`web/src/app/admin/studio`, code in
`web/src/lib/studio` and `web/src/components/studio`) runs the firmware's own
`lumi_core`, compiled to WebAssembly through the same C API the desktop app
uses (`tools/studio/native/lumi_capi.h`).

| File | What it is |
|---|---|
| `build_wasm.sh` | Builds `web/public/studio/lumicore.wasm` with wasi-sdk (downloaded into `build/` once), like `tools/web-duel/build.sh` |
| `web/public/studio/lumicore.wasm` | The built engine, committed because Vercel can't build it |
| `web/src/lib/studio/core.ts` | Its API for the browser, like the desktop's `native.py` |
| `tests/golden/studio_parity.json` | What the desktop app produces for fixed inputs (packs, a batch, odds), from `tools/studio/tests/make_parity.py` |

## When the C++ changes

CI's **studio-wasm** job rebuilds the engine and fails if the committed
`lumicore.wasm` differs. To update it:

- on Linux or macOS: `tools/studio/web/build_wasm.sh`, then commit the file;
- anywhere else: download the **studio-wasm** artifact from that CI run and
  commit it as `web/public/studio/lumicore.wasm`.

Likewise, if the desktop's packs or batches change, CI's **studio-tests** job
uploads a fresh **studio-parity** artifact: commit it as
`tests/golden/studio_parity.json` (or run
`python tools/studio/tests/make_parity.py` where liblumicore is built).

The web tests (`web/tests/unit/studio.test.ts`) check the engine against the
firmware's golden frames and the TypeScript port against the parity file.
