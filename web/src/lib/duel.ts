/**
 * Boop Pong between two Lumis: the real firmware (tools/web-duel/duel.cpp)
 * compiled to WebAssembly. Works in the browser and in Node (for tests).
 */

export const TRAITS = ["eyeShape", "eyeSize", "eyeSpacing", "eyeHeight", "highlight", "accent", "temperament"] as const;
export type Trait = (typeof TRAITS)[number];

export interface DuelPersona {
  name: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  traits: Record<Trait, string>;
}

/** 0: starting, 1: playing, 2: match over (reactions playing), 3: finished. */
export type DuelState = 0 | 1 | 2 | 3;

export interface Duel {
  newMatch(seedA: number, seedB: number): void;
  /** Advance `ms`. Lumi A follows `tilt` (-1 left .. 1 right) unless `auto`. */
  step(ms: number, tilt: number, pat: boolean, auto: boolean): void;
  /** Lumi k's screen as a 1024-byte SSD1306 page buffer (a view: copy it to keep it). */
  screen(k: 0 | 1): Uint8Array;
  /** Lumi k's tilt as gravity's x component, -0.5 .. 0.5. */
  tilt(k: 0 | 1): number;
  state(): DuelState;
  points(k: 0 | 1): number;
  persona(k: 0 | 1): DuelPersona;
}

interface Exports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  duel_new(a: number, b: number): void;
  duel_step(ms: number, tilt: number, pat: number, auto: number): void;
  duel_screen(k: number): number;
  duel_tilt(k: number): number;
  duel_state(): number;
  duel_points(k: number): number;
  duel_name(k: number): number;
  duel_gene(k: number, g: number): number;
  duel_option_name(g: number, o: number): number;
  duel_rarity(k: number): number;
}

/** Just enough WASI for the firmware: no files, no clock (time comes from step()). */
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
    random_get: (ptr: number, len: number) => {
      crypto.getRandomValues(new Uint8Array(memory().buffer, ptr, len));
      return ok;
    },
  };
}

export async function loadDuel(wasm: BufferSource | Response | Promise<Response>): Promise<Duel> {
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

  const str = (ptr: number) => {
    const bytes = new Uint8Array(e.memory.buffer, ptr);
    let end = 0;
    while (bytes[end]) end++;
    return new TextDecoder().decode(bytes.subarray(0, end));
  };

  return {
    newMatch: (a, b) => e.duel_new(a >>> 0, b >>> 0),
    step: (ms, tilt, pat, auto) => e.duel_step(Math.max(0, Math.round(ms)), Math.max(-1, Math.min(1, tilt)), pat ? 1 : 0, auto ? 1 : 0),
    screen: (k) => new Uint8Array(e.memory.buffer, e.duel_screen(k), 1024),
    tilt: (k) => e.duel_tilt(k),
    state: () => e.duel_state() as DuelState,
    points: (k) => e.duel_points(k),
    persona: (k) => ({
      name: str(e.duel_name(k)),
      rarity: str(e.duel_rarity(k)) as DuelPersona["rarity"],
      traits: Object.fromEntries(TRAITS.map((t, g) => [t, str(e.duel_option_name(g, e.duel_gene(k, g)))])) as Record<Trait, string>,
    }),
  };
}

export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;
