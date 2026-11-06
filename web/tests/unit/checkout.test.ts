import { describe, expect, it, vi } from "vitest";
import { PROTECTION_CENTS } from "@/lib/addons";
import { setCheckoutAddons, setCheckoutShipping, startCheckout, type CheckoutDeps, type ShippingDeps } from "@/lib/checkout";
import { lineItems, type Payments, type SessionInfo } from "@/lib/payments";
import type { ShippingQuote } from "@/lib/shipping";
import { MemoryStore } from "@/lib/store/memory";
import { testCatalogue } from "./fixtures";

/** A fake Stripe: sessions live in memory, keyed cs_test_<order id>. */
function fakePayments() {
  const sessions = new Map<string, SessionInfo>();
  const payments = {
    createSession: vi.fn<Payments["createSession"]>(async (o) => {
      const id = `cs_test_${o.id.replace(/-/g, "")}`;
      sessions.set(id, { id, status: "open", orderId: o.id });
      return { id, clientSecret: `${id}_secret_x` };
    }),
    getSession: vi.fn<Payments["getSession"]>(async (id) => sessions.get(id) ?? null),
    setShipping: vi.fn<Payments["setShipping"]>(async () => {}),
    setLineItems: vi.fn<Payments["setLineItems"]>(async () => {}),
  } satisfies Payments;
  return { payments, sessions };
}

function deps(over: Partial<CheckoutDeps> = {}, capacity: Record<string, number> = { "LUMI-POCKET-01": 3, "LUMI-STRAP": 10 }) {
  const store = new MemoryStore(capacity);
  const { payments, sessions } = fakePayments();
  let n = 0;
  return {
    store,
    payments,
    sessions,
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

const ID1 = "00000000-0000-4000-8000-000000000001";
const S1 = `cs_test_${ID1.replace(/-/g, "")}`;

describe("startCheckout", () => {
  it("creates an order from server prices and ignores prices sent by the browser", async () => {
    const { d, store, payments } = deps();
    const r = await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 2, price: 1, unitAmount: 1 }], total: 2 }, d);
    expect(r).toMatchObject({ ok: true, clientSecret: `${S1}_secret_x`, orderId: ID1 });
    const order = await store.getOrder(ID1);
    expect(order).toMatchObject({ status: "pending", currency: "CAD", subtotal: 11800, fulfilment: "preorder", stripeSessionId: S1, tipAmount: 0, protectionAmount: 0 });
    expect(order!.items).toEqual([{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 2, unitAmount: 5900 }]);
    expect(order!.reservationExpiresAt).toBe("2026-11-01T12:31:00.000Z");
    expect(store.capacity.get("LUMI-POCKET-01")).toEqual({ total: 3, reserved: 2, sold: 0 });
    const [, returnUrl] = vi.mocked(payments.createSession).mock.calls[0]!;
    expect(returnUrl).toBe(`https://lumi.test/checkout/success?order=${ID1}&session_id={CHECKOUT_SESSION_ID}`);
  });

  it("prices protection on the server and takes the tip the customer chose", async () => {
    const { d, store } = deps();
    await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }], protection: true, tip: 500 }, d);
    const order = (await store.getOrder(ID1))!;
    expect(order).toMatchObject({ protectionAmount: PROTECTION_CENTS, tipAmount: 500 });
    expect(lineItems(order).map((l) => [l.price_data!.product_data!.name, l.price_data!.unit_amount, l.quantity])).toEqual([
      ["Pocket Lumi (pre-order)", 5900, 1],
      ["Shipping protection", 398, 1],
      ["Tip", 500, 1],
    ]);
  });

  it("rejects malformed requests", async () => {
    const { d } = deps();
    const line = [{ slug: "pocket-lumi", qty: 1 }];
    for (const bad of [null, {}, { lines: [] }, { lines: [{ slug: "pocket-lumi", qty: -1 }] }, { lines: "x" }, { lines: line, tip: -100 }, { lines: line, tip: 1.5 }, { lines: line, tip: 100_000 }, { lines: line, protection: "yes" }]) {
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
    const { d, store, payments } = deps();
    payments.createSession.mockRejectedValueOnce(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }] }, d)).toMatchObject({ ok: false, status: 502 });
    expect(store.capacity.get("LUMI-POCKET-01")!.reserved).toBe(0);
    expect([...store.orders.values()][0]!.status).toBe("failed");
  });
});

const QUOTE: ShippingQuote = { amount: 1450, label: "Canada Post Expedited Parcel", minDays: 2, maxDays: 4, source: "table" };
const ADDRESS = { name: "Sam Lee", address: { line1: "1 Main St", line2: null, city: "Ottawa", state: "ON", postal_code: "K1A 0A1", country: "CA" } };

async function started(qty = 1) {
  const x = deps();
  await startCheckout({ lines: [{ slug: "pocket-lumi", qty }] }, x.d);
  const quote = vi.fn(async (): Promise<ShippingQuote | null> => QUOTE);
  const ship: ShippingDeps = { store: x.store, payments: x.payments, countries: ["CA", "US"], quote };
  return { ...x, ship, quote };
}

describe("shipping at checkout", () => {
  it("prices the address the server sets, for the order's units and value", async () => {
    const { ship, quote, payments, store } = await started(2);
    expect(await setCheckoutShipping({ sessionId: S1, shipping: ADDRESS }, ship)).toEqual({ ok: true, quote: QUOTE });
    const subtotal = [...store.orders.values()][0]!.subtotal;
    expect(subtotal).toBeGreaterThan(0);
    expect(quote).toHaveBeenCalledWith({ country: "CA", postalCode: "K1A 0A1" }, 2, subtotal);
    expect(payments.setShipping).toHaveBeenCalledWith(
      S1,
      { name: "Sam Lee", address: { line1: "1 Main St", city: "Ottawa", state: "ON", postal_code: "K1A 0A1", country: "CA" } },
      QUOTE,
    );
  });

  it("won't ship to countries that aren't set up, or to addresses it can't price", async () => {
    const { ship, quote, payments } = await started();
    const fr = { ...ADDRESS, address: { ...ADDRESS.address, country: "FR" } };
    expect(await setCheckoutShipping({ sessionId: S1, shipping: fr }, ship)).toMatchObject({ ok: false, status: 422 });
    quote.mockResolvedValueOnce(null);
    expect(await setCheckoutShipping({ sessionId: S1, shipping: ADDRESS }, ship)).toMatchObject({ ok: false, status: 422 });
    expect(payments.setShipping).not.toHaveBeenCalled();
  });

  it("only touches open checkouts it created", async () => {
    const { ship, sessions, store } = await started();
    expect(await setCheckoutShipping({ sessionId: "cs_test_unknown123", shipping: ADDRESS }, ship)).toMatchObject({ ok: false, status: 404 });
    expect(await setCheckoutShipping({ sessionId: "not-a-session", shipping: ADDRESS }, ship)).toMatchObject({ ok: false, status: 400 });
    sessions.get(S1)!.status = "complete";
    expect(await setCheckoutShipping({ sessionId: S1, shipping: ADDRESS }, ship)).toMatchObject({ ok: false, status: 409 });
    sessions.get(S1)!.status = "open";
    await store.releaseOrder(ID1, "expired");
    expect(await setCheckoutShipping({ sessionId: S1, shipping: ADDRESS }, ship)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("tip and protection at checkout", () => {
  it("updates Stripe's line items and the order together", async () => {
    const { store, payments } = await started();
    expect(await setCheckoutAddons({ sessionId: S1, protection: true, tip: 1000 }, { store, payments })).toEqual({ ok: true });
    expect(await store.getOrder(ID1)).toMatchObject({ protectionAmount: PROTECTION_CENTS, tipAmount: 1000 });
    const [, sent] = vi.mocked(payments.setLineItems).mock.calls[0]!;
    expect(sent).toMatchObject({ protectionAmount: PROTECTION_CENTS, tipAmount: 1000, subtotal: 5900 });
    expect(await setCheckoutAddons({ sessionId: S1, protection: false, tip: 0 }, { store, payments })).toEqual({ ok: true });
    expect(await store.getOrder(ID1)).toMatchObject({ protectionAmount: 0, tipAmount: 0 });
  });

  it("ignores a protection price sent by the browser and refuses silly tips", async () => {
    const { store, payments } = await started();
    await setCheckoutAddons({ sessionId: S1, protection: true, protectionAmount: 1, tip: 0 }, { store, payments });
    expect((await store.getOrder(ID1))!.protectionAmount).toBe(PROTECTION_CENTS);
    for (const tip of [-1, 2.5, 10_001]) {
      expect(await setCheckoutAddons({ sessionId: S1, protection: false, tip }, { store, payments })).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("can't change a checkout that has ended", async () => {
    const { store, payments, sessions } = await started();
    sessions.get(S1)!.status = "expired";
    expect(await setCheckoutAddons({ sessionId: S1, protection: true, tip: 0 }, { store, payments })).toMatchObject({ ok: false, status: 409 });
    expect(payments.setLineItems).not.toHaveBeenCalled();
  });
});
