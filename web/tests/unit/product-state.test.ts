import { describe, expect, it } from "vitest";
import { products } from "@/content/products";
import { tbc } from "@/lib/placeholder";
import { canTransition, catalogueProblems, ctaFor, isOrderable, STATUSES, TRANSITIONS } from "@/lib/product-state";
import { testCatalogue } from "./fixtures";

describe("product states", () => {
  it("defines transitions for every status, only to known statuses, never to itself", () => {
    for (const s of STATUSES) {
      expect(TRANSITIONS[s].every((t) => STATUSES.includes(t) && t !== s)).toBe(true);
    }
    expect(canTransition("coming_soon", "preorder")).toBe(true);
    expect(canTransition("available", "coming_soon")).toBe(false);
    expect(canTransition("archived", "available")).toBe(false);
  });

  it("picks the CTA from the status", () => {
    const [pre, now, soon] = testCatalogue();
    expect(ctaFor(pre!)).toMatchObject({ kind: "add", label: "Pre-order your Lumi" });
    expect(ctaFor(now!)).toMatchObject({ kind: "add", label: "Add to cart" });
    expect(ctaFor(soon!)).toMatchObject({ kind: "notify" });
    expect(ctaFor({ ...now!, status: "sold_out" })).toMatchObject({ kind: "notify" });
    expect(ctaFor({ ...now!, status: "draft" }).kind).toBe("none");
    expect(isOrderable(soon!)).toBe(false);
  });

  it("refuses to sell without a confirmed price or pre-order terms", () => {
    const [pre] = testCatalogue();
    expect(catalogueProblems([pre!])).toEqual([]);
    expect(catalogueProblems([{ ...pre!, price: tbc("x") }])).toEqual(["pocket-lumi: preorder needs a confirmed price"]);
    expect(catalogueProblems([{ ...pre!, preorder: tbc("x") }])).toEqual(["pocket-lumi: pre-order needs confirmed terms"]);
    expect(catalogueProblems([{ ...pre!, status: "available", preorder: undefined, price: { amount: 0, currency: "CAD" } }])).toEqual(["pocket-lumi: price must be positive"]);
  });

  it("ships a real catalogue that sells nothing it hasn't confirmed", () => {
    expect(catalogueProblems(products)).toEqual([]);
    expect(products.filter(isOrderable)).toEqual([]);
  });
});
