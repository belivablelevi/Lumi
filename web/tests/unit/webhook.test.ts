import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { startCheckout } from "@/lib/checkout";
import type { Mail, Mailer } from "@/lib/email";
import { MemoryStore } from "@/lib/store/memory";
import { handleStripeEvent } from "@/lib/webhook";
import { testCatalogue } from "./fixtures";

const stripe = new Stripe("sk_test_offline");
const SECRET = "whsec_test_secret";

/** Builds an event, signs it like Stripe does, and verifies it with the real SDK check. */
function signedEvent(id: string, type: string, object: Record<string, unknown>): Stripe.Event {
  const payload = JSON.stringify({ id, object: "event", type, api_version: "2026-01-01", created: 1, data: { object }, livemode: false, pending_webhooks: 1, request: null });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return stripe.webhooks.constructEvent(payload, header, SECRET);
}

async function setup() {
  const store = new MemoryStore({ "LUMI-POCKET-01": 5 });
  const sent: Mail[] = [];
  const mailer: Mailer = { send: async (m) => { sent.push(m); } };
  const r = await startCheckout({ lines: [{ slug: "pocket-lumi", qty: 1 }] }, {
    catalogue: testCatalogue(), store, allowMixed: false, siteUrl: "https://lumi.test",
    payments: { createSession: async (o) => ({ id: "cs_test_1", url: `https://stripe.test/${o.id}` }) },
  });
  if (!r.ok) throw new Error(r.error);
  return { store, sent, mailer, orderId: r.orderId };
}

const session = (orderId: string, over: Record<string, unknown> = {}) => ({
  id: "cs_test_1", object: "checkout.session", metadata: { order_id: orderId }, client_reference_id: orderId,
  payment_status: "paid", currency: "cad", amount_subtotal: 5900, amount_total: 6667,
  customer_details: { email: "sam@example.com", name: "Sam" }, ...over,
});

describe("Stripe webhook", () => {
  it("rejects events with a bad signature", () => {
    const payload = JSON.stringify({ id: "evt_x", type: "checkout.session.completed" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET)).toThrow();
  });

  it("marks the order paid once and sends one email, however often Stripe retries", async () => {
    const { store, sent, mailer, orderId } = await setup();
    const ev = signedEvent("evt_1", "checkout.session.completed", session(orderId));
    expect(await handleStripeEvent(ev, { store, mailer })).toBe("paid");
    expect(await handleStripeEvent(ev, { store, mailer })).toBe("duplicate");
    expect(await handleStripeEvent(signedEvent("evt_2", "checkout.session.async_payment_succeeded", session(orderId)), { store, mailer })).toBe("duplicate");
    const o = (await store.getOrder(orderId))!;
    expect(o).toMatchObject({ status: "paid", email: "sam@example.com", amountTotal: 6667 });
    expect(o.confirmationSentAt).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/pre-order is confirmed/);
    expect(store.capacity.get("LUMI-POCKET-01")).toEqual({ total: 5, reserved: 0, sold: 1 });
    expect(store.events.size).toBe(2);
  });

  it("retries the email on the next delivery if sending failed", async () => {
    const { store, orderId } = await setup();
    const failing: Mailer = { send: vi.fn(async () => { throw new Error("smtp"); }) };
    const ev = signedEvent("evt_1", "checkout.session.completed", session(orderId));
    await expect(handleStripeEvent(ev, { store, mailer: failing })).rejects.toThrow("smtp");
    const sent: Mail[] = [];
    await handleStripeEvent(ev, { store, mailer: { send: async (m) => { sent.push(m); } } });
    expect(sent).toHaveLength(1);
    expect((await store.getOrder(orderId))!.status).toBe("paid");
  });

  it("waits for delayed payments instead of confirming them", async () => {
    const { store, sent, mailer, orderId } = await setup();
    expect(await handleStripeEvent(signedEvent("evt_1", "checkout.session.completed", session(orderId, { payment_status: "unpaid" })), { store, mailer })).toBe("waiting");
    expect((await store.getOrder(orderId))!.status).toBe("pending");
    expect(sent).toHaveLength(0);
  });

  it("flags payments that don't match the order for review", async () => {
    const { store, mailer, orderId } = await setup();
    await handleStripeEvent(signedEvent("evt_1", "checkout.session.completed", session(orderId, { amount_subtotal: 100 })), { store, mailer });
    expect((await store.getOrder(orderId))!.status).toBe("review");
  });

  it("releases capacity when a checkout expires, and ignores a late duplicate", async () => {
    const { store, mailer, orderId } = await setup();
    const ev = signedEvent("evt_9", "checkout.session.expired", session(orderId, { payment_status: "unpaid" }));
    expect(await handleStripeEvent(ev, { store, mailer })).toBe("released");
    await handleStripeEvent(ev, { store, mailer });
    expect((await store.getOrder(orderId))!.status).toBe("expired");
    expect(store.capacity.get("LUMI-POCKET-01")!.reserved).toBe(0);
  });

  it("ignores events it doesn't handle", async () => {
    const { store, mailer } = await setup();
    expect(await handleStripeEvent(signedEvent("evt_5", "customer.created", { id: "cus_1", object: "customer" }), { store, mailer })).toBe("ignored");
  });
});
