import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeFrames, manifest, pixel } from "@/lib/lumi-frames";

const file = (url: string) => decodeFrames(inflateSync(readFileSync(new URL(`../../public${url}`, import.meta.url))));

describe("firmware frames", () => {
  it("decode to the frame counts in the manifest, with something on screen", () => {
    expect(manifest.personas.length).toBeGreaterThan(0);
    for (const p of manifest.personas) {
      expect(file(p.expressions)).toHaveLength(manifest.expressions.length);
      expect(file(p.idle.file)).toHaveLength(p.idle.frames);
      for (const a of Object.values(p.animations)) {
        const frames = file(a.file);
        expect(frames).toHaveLength(a.frames);
        let lit = 0;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (pixel(frames[0]!, x, y)) lit++;
        expect(lit).toBeGreaterThan(50);
      }
    }
  });

  it("gives every example unit a different face", () => {
    const neutral = manifest.expressions.indexOf("neutral");
    const faces = new Set(manifest.personas.map((p) => Buffer.from(file(p.expressions)[neutral]!).toString("base64")));
    expect(faces.size).toBe(manifest.personas.length);
  });
});
