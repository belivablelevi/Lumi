import manifestJson from "../../public/lumi/manifest.json";

/** Frames rendered by Lumi's firmware (tools/studio/export_web_assets.py). */
export interface LumiManifest {
  frameMs: number;
  width: number;
  height: number;
  core: string;
  expressions: string[];
  personas: LumiPersona[];
}
export interface LumiPersona {
  id: string;
  name: string;
  seed: number;
  genes: number[];
  rarity: "common" | "uncommon" | "rare" | "legendary";
  traits: Record<"eyeShape" | "eyeSize" | "eyeSpacing" | "eyeHeight" | "highlight" | "accent" | "temperament", string>;
  expressions: string;
  idle: { file: string; frames: number };
  posters: { neutral: string; happy: string };
  animations: Record<string, { file: string; frames: number; trigger: string }>;
}

export const manifest = manifestJson as LumiManifest;
export const FRAME_BYTES = 1024;

export function persona(id: string): LumiPersona {
  const p = manifest.personas.find((x) => x.id === id);
  if (!p) throw new Error(`unknown persona ${id}`);
  return p;
}

/** Undoes the exporter's XOR-with-previous-frame step. */
export function decodeFrames(raw: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let prev = new Uint8Array(FRAME_BYTES);
  for (let i = 0; i + FRAME_BYTES <= raw.length; i += FRAME_BYTES) {
    const f = new Uint8Array(FRAME_BYTES);
    for (let j = 0; j < FRAME_BYTES; j++) f[j] = raw[i + j]! ^ prev[j]!;
    out.push(f);
    prev = f;
  }
  return out;
}

export function pixel(frame: Uint8Array, x: number, y: number): boolean {
  return ((frame[(y >> 3) * 128 + x] ?? 0) & (1 << (y & 7))) !== 0;
}

const cache = new Map<string, Promise<Uint8Array[]>>();

/** Fetches and decodes a .lumi file (zlib stream) in the browser. */
export function loadFrames(url: string): Promise<Uint8Array[]> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`couldn't load ${url}`);
      const inflated = res.body.pipeThrough(new DecompressionStream("deflate"));
      return decodeFrames(new Uint8Array(await new Response(inflated).arrayBuffer()));
    })();
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export const OLED_ON = "#3cf0ff";

/**
 * Draws one 128x64 frame onto a canvas `scale` pixels per OLED pixel, with a
 * 1 px gap between pixels when `grid` is set.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, frame: Uint8Array | undefined, scale: number, grid: boolean) {
  const size = grid ? scale - 1 : scale;
  ctx.clearRect(0, 0, 128 * scale, 64 * scale);
  if (!frame) return;
  ctx.fillStyle = OLED_ON;
  for (let page = 0; page < 8; page++) {
    for (let x = 0; x < 128; x++) {
      const bits = frame[page * 128 + x] ?? 0;
      if (!bits) continue;
      for (let b = 0; b < 8; b++) {
        if (bits & (1 << b)) ctx.fillRect(x * scale, (page * 8 + b) * scale, size, size);
      }
    }
  }
}
