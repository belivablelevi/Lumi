import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combinations, faces, genes, leastLikelyOneIn, mostLikelyOneIn, names, tierBelow, tierShare, temperaments } from "@/content/odds";

// The site's odds must be the firmware's odds.
const cpp = readFileSync(new URL("../../../firmware/lib/lumi_core/src/genes.cpp", import.meta.url), "utf8");
const strings = (body: string) => [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
const numbers = (body: string) => body.split(",").map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
const array = (name: string) => {
  const m = cpp.match(new RegExp(`${name}\\[\\] = \\{([^}]*)\\}`));
  if (!m) throw new Error(`${name} not found in genes.cpp`);
  return m[1]!;
};

describe("Lumi odds", () => {
  it("match the firmware's gene tables", () => {
    const shapes = [...cpp.matchAll(/\{"(\w+)", [\d.-]+, [\d.-]+, [\d.-]+, [\d.-]+, (\d+)\}/g)].map((m) => ({ name: m[1], weight: Number(m[2]) }));
    const fromCpp = [
      shapes,
      ...[["kSizeNames", "kSizeWeights"], ["kSpacingNames", "kSpacingWeights"], ["kEyeHeightNames", "kEyeHeightWeights"], ["kShineNames", "kShineWeights"], ["kAccentNames", "kAccentWeights"], ["kTemperamentNames", "kTemperamentWeights"]].map(([n, w]) => {
        const ws = numbers(array(w!));
        return strings(array(n!)).map((name, i) => ({ name, weight: ws[i] }));
      }),
    ];
    expect(genes.map((g) => g.options)).toEqual(fromCpp);
    expect(Object.keys(temperaments)).toEqual(genes.at(-1)!.options.map((o) => o.name));
  });

  it("use the firmware's rarity lines", () => {
    const line = (n: string) => Number(cpp.match(new RegExp(`${n} = ([\\d.e-]+);`))![1]);
    expect(tierBelow).toEqual({ uncommon: line("kUncommonBelow"), rare: line("kRareBelow"), legendary: line("kLegendaryBelow") });
  });

  it("add up to the numbers the site quotes", () => {
    expect(combinations).toBe(108_000);
    expect(faces).toBe(21_600);
    const pct = Object.fromEntries(Object.entries(tierShare).map(([k, v]) => [k, Math.round(v * 100)]));
    expect(pct).toEqual({ common: 60, uncommon: 25, rare: 12, legendary: 3 });
    expect(Object.values(tierShare).reduce((a, b) => a + b)).toBeCloseTo(1, 9);
    expect(mostLikelyOneIn).toBe(631);
    expect(leastLikelyOneIn).toBe(111_111_111);
  });

  it("count every name the firmware can make", () => {
    const [start, mid, end] = ["kStart", "kMid", "kEnd"].map((k) => strings(array(k)) as string[]) as [string[], string[], string[]];
    expect(new Set(start.flatMap((a) => mid.flatMap((b) => end.map((c) => a + b + c)))).size).toBe(names);
  });
});
