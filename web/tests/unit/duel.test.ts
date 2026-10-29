import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadDuel } from "@/lib/duel";

const wasm = readFileSync(new URL("../../public/duel/lumi-duel.wasm", import.meta.url));
const lit = (f: Uint8Array) => f.reduce((n, b) => n + ((b * 0x01010101) >>> 0).toString(2).split("1").length - 1, 0);

describe("Boop Pong in WebAssembly (the real firmware)", () => {
  it("plays a whole demo match between two unique Lumis", async () => {
    const duel = await loadDuel(wasm);
    duel.newMatch(11, 22);
    duel.step(10, 0, false, true);
    expect(duel.state()).toBe(1);
    const a = duel.persona(0), b = duel.persona(1);
    expect(a.name).not.toBe("");
    expect(a.name).not.toBe(b.name);
    expect(["common", "uncommon", "rare", "legendary"]).toContain(a.rarity);
    expect(Object.values(a.traits).every((v) => v.length > 0)).toBe(true);
    let maxLit = 0;
    for (let i = 0; i < 30000 && duel.state() === 1; i++) {
      duel.step(33, 0, false, true);
      if (i % 30 === 0) maxLit = Math.max(maxLit, lit(duel.screen(0)), lit(duel.screen(1)));
    }
    expect(duel.state()).toBe(2);
    expect([duel.points(0), duel.points(1)]).toContain(5);
    expect(maxLit).toBeGreaterThan(40);
  });

  it("lets the player steer Lumi A", async () => {
    const duel = await loadDuel(wasm);
    duel.newMatch(5, 6);
    duel.step(10, 0, false, false);
    for (let i = 0; i < 30; i++) duel.step(33, 1, false, false);
    const right = duel.tilt(0);
    for (let i = 0; i < 30; i++) duel.step(33, -1, false, false);
    const left = duel.tilt(0);
    expect(right).toBeLessThan(-0.3); // gravity's x: tilting right
    expect(left).toBeGreaterThan(0.3);
  });

  it("deals different Lumis for different seeds", async () => {
    const duel = await loadDuel(wasm);
    const names = new Set<string>();
    for (let s = 0; s < 6; s++) {
      duel.newMatch(100 + s, 200 + s);
      names.add(duel.persona(0).name);
      names.add(duel.persona(1).name);
    }
    expect(names.size).toBeGreaterThan(9);
  });
});
