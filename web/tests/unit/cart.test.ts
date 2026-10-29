import { describe, expect, it } from "vitest";
import { checkCart } from "@/lib/cart";
import { testCatalogue } from "./fixtures";

const cat = testCatalogue();

describe("checkCart", () => {
  it("prices a valid cart from the catalogue", () => {
    const c = checkCart([{ slug: "pocket-lumi", qty: 2 }], cat, false);
    expect(c.problems).toEqual([]);
    expect(c.subtotal).toEqual({ amount: 11800, currency: "CAD" });
    expect(c.fulfilment).toBe("preorder");
  });

  it("explains what's wrong", () => {
    expect(checkCart([], cat, false).problems).toContain("Your cart is empty.");
    expect(checkCart([{ slug: "nope", qty: 1 }], cat, false).problems[0]).toMatch(/no longer available/);
    expect(checkCart([{ slug: "soon", qty: 1 }], cat, false).problems[0]).toMatch(/can't be ordered/);
    expect(checkCart([{ slug: "pocket-lumi", qty: 9 }], cat, false).problems[0]).toMatch(/1 to 4/);
    expect(checkCart([{ slug: "pocket-lumi", qty: 0 }], cat, false).problems[0]).toMatch(/1 to 4/);
    expect(checkCart([{ slug: "pocket-lumi", qty: 1.5 }], cat, false).problems[0]).toMatch(/1 to 4/);
    expect(checkCart([{ slug: "pocket-lumi", variantId: "gold", qty: 1 }], cat, false).problems[0]).toMatch(/doesn't have options/);
    expect(checkCart([{ slug: "pocket-lumi", qty: 1 }, { slug: "pocket-lumi", qty: 1 }], cat, false).problems[0]).toMatch(/twice/);
  });

  it("keeps pre-orders and in-stock items apart unless mixed carts are allowed", () => {
    const lines = [{ slug: "pocket-lumi", qty: 1 }, { slug: "strap", qty: 1 }];
    expect(checkCart(lines, cat, false).problems[0]).toMatch(/check out separately/);
    const mixed = checkCart(lines, cat, true);
    expect(mixed.problems).toEqual([]);
    expect(mixed.fulfilment).toBe("mixed");
  });
});
