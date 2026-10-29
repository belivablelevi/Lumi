import { describe, expect, it, vi } from "vitest";
import { startCheckout, type CheckoutDeps } from "@/lib/checkout";
import type { Payments } from "@/lib/payments";
import { MemoryStore } from "@/lib/store/memory";
import { testCatalogue } from "./fixtures";

function deps(over: Partial<CheckoutDeps> = {}, capacity: Record<string, number> = { "LUMI-POCKET-01": 3, "LUMI-STRAP": 10 }) {
  const store = new MemoryStore(capacity);
  const payments: Payments = { createSession: vi.fn(async (o) => ({ id: `cs_test_${o.id}`, url: `https://checkout.stripe.test/${o.id}` })) };
  let n = 0;
  return {
    store,
    payments,
    d: {
      catalogue: testCatalogue(),
      store,
      payments,
      siteUrl: "https://lumi.test",
      allowMixed: false,
      now: () => new Date("2026-11-01T12:00:00Z"),
      newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
      ...over,
    } satisfies CheckoutDeps,
  };
}

describe("startCheckout", () => {
  it("creates an order from server prices and ignores prices sent by the browser", async () => {
    const { d, store, payments } = deps();
    const r = await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 2, price: 1, unitAmount: 1 }], total: 2 }, d);
    expect(r).toMatchObject({ ok: true, url: "https://checkout.stripe.test/00000000-0000-4000-8000-000000000001" });
    const order = await store.getOrder("00000000-0000-4000-8000-000000000001");
    expect(order).toMatchObject({ status: "pending", currency: "CAD", subtotal: 11800, fulfilment: "preorder", stripeSessionId: "cs_test_00000000-0000-4000-8000-000000000001" });
    expect(order!.items).toEqual([{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 2, unitAmount: 5900 }]);
    expect(order!.reservationExpiresAt).toBe("2026-11-01T12:31:00.000Z");
    expect(store.capacity.get("LUMI-POCKET-01")).toEqual({ total: 3, reserved: 2, sold: 0 });
    const [, urls] = vi.mocked(payments.createSession).mock.calls[0]!;
    expect(urls.success).toBe("https://lumi.test/checkout/success?order=00000000-0000-4000-8000-000000000001&session_id={CHECKOUT_SESSION_ID}");
  });

  it("rejects malformed requests", async () => {
    const { d } = deps();
    for (const bad of [null, {}, { lines: [] }, { lines: [{ slug: "pocket-lumi", qty: -1 }] }, { lines: "x" }]) {
      expect(await startCheckout(bad, d)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("refuses products that can't be ordered, and mixed carts", async () => {
    const { d, payments } = deps();
    expect(await startCheckout({ lines: [{ slug: "soon", qty: 1 }] }, d)).toMatchObject({ ok: false, status: 409 });
    expect(await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }, { slug: "strap", qty: 1 }] }, d)).toMatchObject({ ok: false, status: 409 });
    expect(payments.createSession).not.toHaveBeenCalled();
  });

  it("never oversells pre-order capacity", async () => {
    const { d, store } = deps();
    expect((await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 2 }] }, d)).ok).toBe(true);
    const r = await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 2 }] }, d);
    expect(r).toMatchObject({ ok: false, status: 409, error: "Pocket Lumi doesn't have enough left for this order." });
    expect(store.capacity.get("LUMI-POCKET-01")!.reserved).toBe(2);
  });

  it("won't sell a SKU whose capacity isn't set up", async () => {
    const { d } = deps({}, {});
    expect(await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }] }, d)).toMatchObject({ ok: false, error: "Pocket Lumi isn't open for orders yet." });
  });

  it("gives the reservation back when Stripe fails", async () => {
    const { d, store } = deps({ payments: { createSession: async () => { throw new Error("stripe down"); } } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }] }, d)).toMatchObject({ ok: false, status: 502 });
    expect(store.capacity.get("LUMI-POCKET-01")!.reserved).toBe(0);
    expect([...store.orders.values()][0]!.status).toBe("failed");
  });
});
