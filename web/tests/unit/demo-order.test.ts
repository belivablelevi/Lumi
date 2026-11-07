import { describe, expect, it } from "vitest";
import { shipmentRequest } from "@/lib/chitchats";
import { DEMO_NAME, DEMO_PLACES, demoOrder, isDemoOrder } from "@/lib/demo-order";
import { ordersCsv, shippingAddress } from "@/lib/fulfilment";
import { MemoryStore } from "@/lib/store/memory";
import type { ParcelConfig } from "@/lib/shipping";

const ID = "22222222-2222-4222-8222-222222222222";
const PARCEL: ParcelConfig = { boxKg: 0.03, unitKg: 0.03, cm: [22, 30, 3], handlingCents: 0, fromPostalCode: "K1R6A1" };

describe("demo orders", () => {
  it("is a paid order for one Lumi with no email, no payment and nothing counted as sold", () => {
    const o = demoOrder("toronto", ID, new Date("2026-11-06T12:00:00Z"));
    expect(o).toMatchObject({ id: ID, status: "paid", subtotal: 4000, amountTotal: 4000, paidAt: "2026-11-06T12:00:00.000Z", countedSold: false });
    expect(o.items).toEqual([{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 1, unitAmount: 4000 }]);
    expect(o.email).toBeUndefined();
    expect(o.paymentIntent).toBeUndefined();
    expect(isDemoOrder(o)).toBe(true);
    expect(isDemoOrder({ stripeSessionId: "cs_test_123" })).toBe(false);
    expect(isDemoOrder({})).toBe(false);
    expect(shippingAddress(o)).toMatchObject({ name: DEMO_NAME, city: "Toronto", state: "ON", postalCode: "M5V 3L9", country: "CA" });
  });

  it("has an address Chit Chats can label for every place", () => {
    for (const p of DEMO_PLACES) {
      const body = shipmentRequest(demoOrder(p.id, ID), PARCEL, { hsCode: "9503.00.0090", originCountry: "CN", packageType: "parcel" });
      expect(body).toMatchObject({ name: DEMO_NAME, country_code: p.address.country, postal_code: p.address.postal_code });
    }
    expect(() => demoOrder("nowhere" as never, ID)).toThrow(/Unknown demo place/);
  });

  it("is saved without touching stock, and only demo orders can be deleted", async () => {
    const store = new MemoryStore({ "LUMI-POCKET-01": 10 });
    await store.addDemoOrder(demoOrder("vancouver", ID));
    expect((await store.listOrders("to_ship")).map((o) => o.id)).toEqual([ID]);
    expect(store.capacity.get("LUMI-POCKET-01")).toEqual({ total: 10, reserved: 0, sold: 0 });

    const real = { ...demoOrder("toronto", "33333333-3333-4333-8333-333333333333"), stripeSessionId: "cs_test_real" };
    await store.addDemoOrder(real);
    expect(await store.deleteDemoOrder(real.id)).toBe(false);
    expect(await store.getOrder(real.id)).not.toBeNull();

    expect(await store.deleteDemoOrder(ID)).toBe(true);
    expect(await store.getOrder(ID)).toBeNull();
    expect(await store.deleteDemoOrder(ID)).toBe(false);
  });

  it("is still a normal order to the CSV, so the export route filters it out", () => {
    expect(ordersCsv([demoOrder("toronto", ID)])).toContain("Toronto");
  });
});
