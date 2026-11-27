import { describe, expect, it } from "vitest";
import { founderNote, inside, makingSteps, origin } from "@/content/making";
import { seedFromText } from "@/components/roll/RollLumi";

const allCopy = [
  origin.chip,
  origin.line,
  origin.partsNote,
  ...makingSteps.flatMap((s) => [s.title, ...s.text]),
  ...inside.flatMap((i) => [i.name, i.what]),
  ...founderNote.paragraphs,
].join("\n");

describe("how it's made copy", () => {
  it("makes no price, date or battery claim", () => {
    expect(allCopy).not.toMatch(/\$|\b(CAD|USD)\b|\bprice\b/);
    expect(allCopy).not.toMatch(/\b(january|february|march|april|may|june|july|august|september|october|november|december|202\d)\b/i);
    expect(allCopy).not.toMatch(/battery|mah|hours/i);
  });

  it("has no em dashes", () => {
    expect(allCopy).not.toContain("—");
  });

  it("says where it is made and where the parts come from", () => {
    expect(origin.chip).toBe("Made in Ottawa");
    expect(origin.partsNote).toMatch(/partner factories/);
  });

  it("has unique step ids", () => {
    const ids = makingSteps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("roll seed", () => {
  it("is the same for the same text, ignoring case and spaces at the ends", () => {
    expect(seedFromText("Levi")).toBe(seedFromText("  levi "));
  });

  it("differs for different text and fits in 48 bits", () => {
    expect(seedFromText("levi")).not.toBe(seedFromText("lumi"));
    expect(seedFromText("anything at all") < 1n << 48n).toBe(true);
  });
});
