/**
 * Lumi's real face engine for Studio in Chrome: the firmware's lumi_core compiled to WebAssembly
 * (tools/studio/web/build_wasm.sh) through the same C API the desktop Studio uses
 * (tools/studio/native/lumi_capi.h). This mirrors tools/studio/lumi_studio/native.py, so every
 * frame is what a unit's screen shows. Works in the browser and in Node (tests).
 */

export const FRAME_BYTES = 1024;
export const FACE_BYTES = 32;
export const GENE_COUNT = 7;
export const RARITIES = ["common", "uncommon", "rare", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

interface Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  malloc(n: number): number;
  free(p: number): void;
  lumi_version(): number;
  lumi_expr_count(): number;
  lumi_expr_name(e: number): number;
  lumi_expression(e: number, out: number): void;
  lumi_render_face(face: number, genes: number, t: number, out: number): void;
  lumi_render_expression(e: number, genes: number, t: number, out: number): void;
  lumi_gene_count(): number;
  lumi_gene_name(g: number): number;
  lumi_gene_options(g: number): number;
  lumi_gene_option_name(g: number, o: number): number;
  lumi_gene_weight(g: number, o: number): number;
  lumi_genes_from_seed(seed: bigint, out: number): void;
  lumi_name_from_seed(seed: bigint, out: number, size: number): void;
  lumi_genes_code(genes: number): number;
  lumi_look_count(): number;
  lumi_genes_probability(genes: number): number;
  lumi_genes_rarity(genes: number): number;
  lumi_rarity_name(r: number): number;
  lumi_trigger_count(): number;
  lumi_trigger_name(t: number): number;
  lumi_builtin_anim_count(): number;
  lumi_builtin_anim_name(i: number): number;
  lumi_builtin_anim_trigger(i: number): number;
  lumi_pack_validate(data: number, len: number, err: number, size: number): number;
  lumi_player_new(seed: number): number;
  lumi_player_free(p: number): void;
  lumi_player_load_pack(p: number, data: number, len: number): number;
  lumi_player_set_genes(p: number, genes: number): void;
  lumi_player_set_base(p: number, e: number): void;
  lumi_player_set_idle(p: number, on: number): void;
  lumi_player_play(p: number, name: number): number;
  lumi_player_stop(p: number): void;
  lumi_player_busy(p: number): number;
  lumi_player_update(p: number, t: number): void;
  lumi_player_render(p: number, out: number): void;
  lumi_anim_count(): number;
  lumi_anim_name(i: number): number;
}

/** The firmware's Animator: plays animations with blinks and breathing. */
export interface Player {
  /** Loads an emotion pack (or clears it with null). 0 = ok, else the pack decoder's error code. */
  loadPack(data: Uint8Array | null): number;
  setGenes(genes: readonly number[] | null): void;
  setBase(expr: number): void;
  setIdle(on: boolean): void;
  /** Plays an animation by name; returns its index or -1. */
  play(name: string): number;
  stop(): void;
  busy(): boolean;
  update(tMs: number): void;
  render(): Uint8Array;
  animationNames(): string[];
  free(): void;
}

export interface StudioCore {
  version: string;
  expressions: string[];
  geneNames: string[];
  geneOptions: string[][];
  geneWeights: number[][];
  triggers: string[];
  builtinAnimations: { name: string; trigger: string }[];
  lookCount: number;
  expressionBytes(index: number): Uint8Array;
  renderFace(face: Uint8Array, genes?: readonly number[] | null, tMs?: number): Uint8Array;
  renderExpression(index: number, genes?: readonly number[] | null, tMs?: number): Uint8Array;
  genesFromSeed(seed: bigint): number[];
  nameFromSeed(seed: bigint): string;
  genesCode(genes: readonly number[]): number;
  genesFromCode(code: number): number[];
  genesProbability(genes: readonly number[]): number;
  genesRarity(genes: readonly number[]): Rarity;
  validatePack(data: Uint8Array): { ok: boolean; message: string };
  player(seed?: number): Player;
}

/** Just enough WASI for lumi_core: no files, no clock. */
function wasi(memory: () => WebAssembly.Memory) {
  const ok = 0;
  return {
    fd_close: () => ok,
    fd_seek: () => ok,
    fd_write: (_fd: number, iovs: number, iovsLen: number, written: number) => {
      const v = new DataView(memory().buffer);
      let n = 0;
      for (let i = 0; i < iovsLen; i++) n += v.getUint32(iovs + i * 8 + 4, true);
      v.setUint32(written, n, true);
      return ok;
    },
    fd_fdstat_get: () => ok,
    environ_get: () => ok,
    environ_sizes_get: (count: number, size: number) => {
      const v = new DataView(memory().buffer);
      v.setUint32(count, 0, true);
      v.setUint32(size, 0, true);
      return ok;
    },
    proc_exit: (code: number) => {
      throw new Error(`lumi_core exited (${code})`);
    },
    random_get: (ptr: number, len: number) => {
      crypto.getRandomValues(new Uint8Array(memory().buffer, ptr, len));
      return ok;
    },
  };
}

export const U64 = (1n << 64n) - 1n;

/** The seed a unit uses for its automatic persona: its MAC as a 48-bit number. */
export function macSeed(mac: string): bigint {
  const parts = mac.trim().replace(/-/g, ":").split(":");
  if (parts.length !== 6 || parts.some((p) => !/^[0-9a-fA-F]{1,2}$/.test(p))) throw new Error(`not a MAC address: ${mac}`);
  return parts.reduce((v, p) => (v << 8n) | BigInt(parseInt(p, 16)), 0n);
}

export async function loadCore(wasm: BufferSource | Response | Promise<Response>): Promise<StudioCore> {
  let ex: Exports | undefined;
  const imports = { wasi_snapshot_preview1: wasi(() => ex!.memory) };
  const res = await wasm;
  const { instance } =
    res instanceof Response
      ? await (typeof WebAssembly.instantiateStreaming === "function" && res.headers.get("content-type")?.includes("wasm")
          ? WebAssembly.instantiateStreaming(res, imports)
          : WebAssembly.instantiate(await res.arrayBuffer(), imports))
      : await WebAssembly.instantiate(res, imports);
  ex = instance.exports as unknown as Exports;
  ex._initialize?.();
  const e = ex;

  // Memory can grow, so views are made fresh for every call.
  const bytes = () => new Uint8Array(e.memory.buffer);
  const str = (ptr: number) => {
    if (!ptr) return "";
    const b = bytes();
    let end = ptr;
    while (b[end]) end++;
    return new TextDecoder().decode(b.subarray(ptr, end));
  };
  /** Runs `fn` with scratch buffers holding `inputs` (null = pass a null pointer) and `outSizes` zeroed. */
  function withBuffers<T>(inputs: (Uint8Array | null)[], outSizes: number[], fn: (ptrs: number[]) => T): T {
    const ptrs: number[] = [];
    try {
      for (const data of inputs) {
        if (!data) {
          ptrs.push(0);
          continue;
        }
        const p = e.malloc(Math.max(1, data.length));
        bytes().set(data, p);
        ptrs.push(p);
      }
      for (const n of outSizes) {
        const p = e.malloc(Math.max(1, n));
        bytes().fill(0, p, p + n);
        ptrs.push(p);
      }
      return fn(ptrs);
    } finally {
      for (const p of ptrs) if (p) e.free(p);
    }
  }
  const genesBuf = (g: readonly number[] | null | undefined) => (g ? Uint8Array.from(g) : null);
  const read = (p: number, n: number) => bytes().slice(p, p + n);
  const cstr = (s: string) => {
    const enc = new TextEncoder().encode(s);
    const out = new Uint8Array(enc.length + 1);
    out.set(enc);
    return out;
  };

  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const geneCount = e.lumi_gene_count();
  const triggers = range(e.lumi_trigger_count()).map((t) => str(e.lumi_trigger_name(t)));
  const geneOptions = range(geneCount).map((g) => range(e.lumi_gene_options(g)).map((o) => str(e.lumi_gene_option_name(g, o))));

  const core: StudioCore = {
    version: str(e.lumi_version()),
    expressions: range(e.lumi_expr_count()).map((i) => str(e.lumi_expr_name(i))),
    geneNames: range(geneCount).map((g) => str(e.lumi_gene_name(g))),
    geneOptions,
    geneWeights: range(geneCount).map((g) => range(e.lumi_gene_options(g)).map((o) => e.lumi_gene_weight(g, o))),
    triggers,
    builtinAnimations: range(e.lumi_builtin_anim_count()).map((i) => ({
      name: str(e.lumi_builtin_anim_name(i)),
      trigger: triggers[e.lumi_builtin_anim_trigger(i)] ?? "",
    })),
    lookCount: e.lumi_look_count() >>> 0,
    expressionBytes: (index) => withBuffers([], [FACE_BYTES], ([out]) => (e.lumi_expression(index, out!), read(out!, FACE_BYTES))),
    renderFace: (face, genes = null, tMs = 600) =>
      withBuffers([face, genesBuf(genes)], [FRAME_BYTES], ([f, g, out]) => {
        e.lumi_render_face(f!, g!, tMs >>> 0, out!);
        return read(out!, FRAME_BYTES);
      }),
    renderExpression: (index, genes = null, tMs = 600) =>
      withBuffers([genesBuf(genes)], [FRAME_BYTES], ([g, out]) => {
        e.lumi_render_expression(index, g!, tMs >>> 0, out!);
        return read(out!, FRAME_BYTES);
      }),
    genesFromSeed: (seed) =>
      withBuffers([], [GENE_COUNT], ([out]) => (e.lumi_genes_from_seed(BigInt.asUintN(64, seed), out!), Array.from(read(out!, GENE_COUNT)))),
    nameFromSeed: (seed) =>
      withBuffers([], [16], ([out]) => (e.lumi_name_from_seed(BigInt.asUintN(64, seed), out!, 16), str(out!))),
    genesCode: (genes) => withBuffers([genesBuf(genes)], [], ([g]) => e.lumi_genes_code(g!) >>> 0),
    genesFromCode: (code) => {
      const genes: number[] = [];
      for (let g = geneCount - 1; g >= 0; g--) {
        const n = geneOptions[g]!.length;
        genes.unshift(code % n);
        code = Math.floor(code / n);
      }
      return genes;
    },
    genesProbability: (genes) => withBuffers([genesBuf(genes)], [], ([g]) => e.lumi_genes_probability(g!)),
    genesRarity: (genes) => RARITIES[withBuffers([genesBuf(genes)], [], ([g]) => e.lumi_genes_rarity(g!))]!,
    validatePack: (data) =>
      withBuffers([data], [64], ([d, err]) => {
        const code = e.lumi_pack_validate(d!, data.length, err!, 64);
        return { ok: code === 0, message: str(err!) };
      }),
    player: (seed = 1) => {
      let p = e.lumi_player_new(seed >>> 0);
      const live = () => {
        if (!p) throw new Error("player was freed");
        return p;
      };
      return {
        loadPack: (data) =>
          data && data.length ? withBuffers([data], [], ([d]) => e.lumi_player_load_pack(live(), d!, data.length)) : e.lumi_player_load_pack(live(), 0, 0),
        setGenes: (genes) => withBuffers([genesBuf(genes)], [], ([g]) => e.lumi_player_set_genes(live(), g!)),
        setBase: (expr) => e.lumi_player_set_base(live(), expr),
        setIdle: (on) => e.lumi_player_set_idle(live(), on ? 1 : 0),
        play: (name) => withBuffers([cstr(name)], [], ([n]) => e.lumi_player_play(live(), n!)),
        stop: () => e.lumi_player_stop(live()),
        busy: () => e.lumi_player_busy(live()) !== 0,
        update: (tMs) => e.lumi_player_update(live(), tMs >>> 0),
        render: () => withBuffers([], [FRAME_BYTES], ([out]) => (e.lumi_player_render(live(), out!), read(out!, FRAME_BYTES))),
        animationNames: () => range(e.lumi_anim_count()).map((i) => str(e.lumi_anim_name(i))),
        free: () => {
          if (p) e.lumi_player_free(p);
          p = 0;
        },
      };
    },
  };
  return core;
}

/** Number of pixels that differ between two frames. */
export function frameDiff(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = a[i]! ^ b[i]!;
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}
