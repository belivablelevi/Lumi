import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { FRAME_BYTES, frameDiff, loadCore, macSeed, type StudioCore } from "@/lib/studio/core";
import { generateBatch, personaRow, quotas, readManifest, writeManifest } from "@/lib/studio/factory";
import {
  EFFECTS, PackError, encodePack, faceFrom, faceFromBytes, faceToBytes, firmwareHeader, hex, newAnimation, newKey,
  problems, projectFromJson, projectToJson, type Persona,
} from "@/lib/studio/model";
import { sha256 } from "@/lib/studio/sha256";

const repo = (p: string) => new URL(`../../../${p}`, import.meta.url);
const parity = JSON.parse(readFileSync(repo("tests/golden/studio_parity.json"), "utf8"));

let core: StudioCore;
beforeAll(async () => {
  core = await loadCore(readFileSync(new URL("../../public/studio/lumicore.wasm", import.meta.url)));
});

describe("Studio's face engine (the firmware compiled to WebAssembly)", () => {
  it("renders every expression exactly like the firmware's golden frames", () => {
    const golden = readFileSync(repo("tests/golden/expressions.frames"));
    expect(golden.length).toBe(core.expressions.length * FRAME_BYTES);
    core.expressions.forEach((name, i) => {
      const want = golden.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES);
      expect(Buffer.from(core.renderExpression(i, null, 600)).equals(want), name).toBe(true);
      // Faces saved in packs are quantized to 32 bytes; that costs at most a few pixels.
      expect(frameDiff(core.renderFace(core.expressionBytes(i), null, 600), want), name).toBeLessThanOrEqual(12);
    });
  });

  it("knows the firmware's tables", () => {
    expect(core.expressions).toContain("neutral");
    expect(core.geneOptions).toHaveLength(7);
    expect(core.triggers).toContain("pat");
    expect(core.builtinAnimations.length).toBeGreaterThan(10);
    expect(core.lookCount).toBe(core.geneOptions.reduce((n, o) => n * o.length, 1));
  });

  it("gives the same genes, odds and automatic personas as the desktop", () => {
    for (const g of parity.genes) {
      expect(core.genesCode(g.genes)).toBe(g.code);
      expect(core.genesRarity(g.genes)).toBe(g.rarity);
      expect(core.genesProbability(g.genes)).toBeCloseTo(g.probability, 15);
      expect(core.genesFromCode(g.code)).toEqual(g.genes);
    }
    const seed = macSeed(parity.mac.mac);
    expect(seed).toBe(BigInt(parity.mac.seed));
    expect(core.genesFromSeed(seed)).toEqual(parity.mac.genes);
    expect(core.nameFromSeed(seed)).toBe(parity.mac.name);
  });

  it("plays animations through the firmware's animator", () => {
    const pack = encodePack(core, projectFromJson(core, parity.project));
    const player = core.player(7);
    expect(player.loadPack(pack)).toBe(0);
    expect(player.animationNames()).toContain("giggle");
    expect(player.play("giggle")).toBeGreaterThanOrEqual(0);
    const frames = new Set<string>();
    for (let t = 0; t < 1500; t += 50) {
      player.update(t);
      frames.add(hex(player.render()));
    }
    expect(frames.size).toBeGreaterThan(3);
    player.free();
  });
});

describe("Studio's projects and packs", () => {
  it("encode byte for byte like the desktop app", () => {
    const project = projectFromJson(core, parity.project);
    const persona: Persona = parity.persona;
    expect(hex(encodePack(core, project))).toBe(parity.pack_project_hex);
    expect(hex(encodePack(core, project, persona))).toBe(parity.pack_persona_hex);
    expect(hex(encodePack(core, null, persona))).toBe(parity.pack_empty_persona_hex);
  });

  it("save as the same .lumiproject JSON", () => {
    expect(projectToJson(projectFromJson(core, parity.project))).toEqual(parity.project);
  });

  it("snap faces to what a pack can store", () => {
    const face = faceFrom(core, "happy", { openL: 0.1234, slant: 3.3 });
    expect(face.openL).toBe(0.124);
    expect(face.slant).toBe(3.25);
    expect(faceFromBytes(faceToBytes(face))).toEqual(face);
  });

  it("explain what's wrong instead of building a bad pack", () => {
    const project = {
      faces: [],
      animations: [newAnimation({ name: "", trigger: "nope", weight: 0, keys: [newKey({ face: "custom:missing", hold: 30000 })] })],
    };
    const issues = problems(core, project);
    expect(issues).toEqual(expect.arrayContaining([
      "Animation '?': name must be 1-23 characters.",
      "Animation '?': unknown trigger 'nope'.",
      "Animation '?': weight must be 1-10.",
      "Animation '?' key 1: no custom face called 'missing'.",
      "Animation '?' key 1: tween + hold must be 0-20000 ms.",
    ]));
    expect(() => encodePack(core, project)).toThrow(PackError);
    expect(EFFECTS).toHaveLength(12);
  });

  it("write the firmware header the desktop writes", () => {
    const text = firmwareHeader(Uint8Array.from([1, 2, 255]));
    expect(text).toContain("    0x01, 0x02, 0xFF,\n};\nstatic const size_t kDefaultPackSize = 3;");
    expect(firmwareHeader(new Uint8Array())).toContain("{\n    0\n};");
  });
});

describe("Studio's factory batches", () => {
  it("hash like Python's hashlib", () => {
    expect(hex(sha256(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(sha256(new Uint8Array(0)))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    for (let n = 0; n < 200; n += 7) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 0xff);
      expect(hex(sha256(data))).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });

  it("split units across rarities like the desktop", () => {
    for (const [count, want] of Object.entries(parity.quotas)) expect(quotas(Number(count))).toEqual(want);
  });

  it("make the same batch as the desktop for the same seed", () => {
    const b = parity.batch;
    const batch = generateBatch(core, { count: b.count, seed: b.seed, prefix: b.prefix, start: b.start });
    expect(batch.map((p) => personaRow(core, p))).toEqual(b.rows);
  });

  it("never repeat a look or a name, also against earlier batches", () => {
    const first = generateBatch(core, { count: 200, seed: "web-1" });
    expect(new Set(first.map((p) => core.genesCode(p.genes))).size).toBe(200);
    expect(new Set(first.map((p) => p.name.toLowerCase())).size).toBe(200);
    const second = generateBatch(core, {
      count: 50, seed: "web-2", avoidLooks: first.map((p) => core.genesCode(p.genes)), avoidNames: first.map((p) => p.name),
    });
    const looks = new Set(first.map((p) => core.genesCode(p.genes)));
    expect(second.some((p) => looks.has(core.genesCode(p.genes)))).toBe(false);
  });

  it("read and write manifests in the desktop's CSV dialect", () => {
    const rows = parity.batch.rows.slice(0, 3);
    rows[1] = { ...rows[1], name: 'Odd, "quoted"', mac: "24:0A:C4:00:00:01" };
    const csv = writeManifest(rows);
    expect(csv.startsWith("serial,name,rarity,look,")).toBe(true);
    expect(csv).toContain('"Odd, ""quoted"""');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(readManifest(csv)).toEqual(rows);
  });
});
