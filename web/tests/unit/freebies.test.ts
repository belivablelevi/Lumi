import { describe, expect, it } from "vitest";
import { checkCart } from "@/lib/cart";
import { oddsCardCount } from "@/lib/freebies";
import { testCatalogue } from "./fixtures";

const cat = testCatalogue();

describe("oddsCardCount", () => {
  it("gives one free card per Lumi", () => {
    expect(oddsCardCount([{ slug: "pocket-lumi", qty: 1 }], cat)).toBe(1);
    expect(oddsCardCount([{ slug: "pocket-lumi", qty: 3 }], cat)).toBe(3);
  });

  it("gives none for an empty cart or an unknown item", () => {
    expect(oddsCardCount([], cat)).toBe(0);
    expect(oddsCardCount([{ slug: "nope", qty: 2 }], cat)).toBe(0);
    expect(oddsCardCount([{ slug: "pocket-lumi", qty: 0 }], cat)).toBe(0);
  });

  it("never changes what the cart costs", () => {
    const lines = [{ slug: "pocket-lumi", qty: 2 }];
    expect(oddsCardCount(lines, cat)).toBe(2);
    expect(checkCart(lines, cat, false).subtotal).toEqual({ amount: 11800, currency: "CAD" });
  });
});
