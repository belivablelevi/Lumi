import { describe, expect, it, vi } from "vitest";
import { ChitChatsError, MARKED_HAZMAT, buyLabel, createShipment, deleteShipment, getShipment, packing, parseShipment, shipmentRequest, type CustomsConfig } from "@/lib/chitchats";
import type { ParcelConfig } from "@/lib/shipping";
import type { Order } from "@/lib/store/types";

const CFG = { clientId: "123456", token: "secret-token", base: "https://staging.chitchats.com" };
const PARCEL: ParcelConfig = { boxKg: 0.03, unitKg: 0.03, cm: [22, 30, 3], handlingCents: 0, fromPostalCode: "K1R6A1" };
const CUSTOMS: CustomsConfig = { hsCode: "9503.00", originCountry: "CN", hazmatCode: "CLASS_9_UNMARKED_LITHIUM_BATTERY", packageType: "thick_envelope" };

const order = (country = "US", over: Partial<Order> = {}): Order => ({
  id: "0f8c2a1e-1111-4111-8111-111111111111",
  status: "paid",
  fulfilment: "preorder",
  currency: "CAD",
  subtotal: 8000,
  items: [{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 2, unitAmount: 4000 }],
  createdAt: "2026-11-05T00:00:00Z",
  reservationExpiresAt: "2026-11-05T00:30:00Z",
  paidAt: "2026-11-05T00:05:00Z",
  email: "sam@example.com",
  shipping: {
    name: "Sam Lee",
    address: country === "US"
      ? { line1: "350 5th Ave", line2: "Fl 2", city: "New York", state: "NY", postal_code: "10118", country: "US" }
      : { line1: "1 Main St", line2: null, city: "Toronto", state: "ON", postal_code: "M5V 2T6", country: "CA" },
  },
  ...over,
});

// The shape of a Chit Chats shipment (trimmed from their docs' sample).
const SHIPMENT = {
  shipment: {
    id: "R4Q286T84T",
    status: "unpaid",
    postage_type: "unknown",
    purchase_amount: null,
    tracking_url: "https://chitchats.com/tracking/r4q286t84t",
    carrier_tracking_code: null,
    postage_label_pdf_url: null,
    rates: [
      { postage_type: "chit_chats_us_edge", postage_description: "Chit Chats U.S. Edge", delivery_time_description: "3-6 business days", payment_amount: "19.20", tariff_fee: "7.52" },
      { postage_type: "chit_chats_us_select", postage_description: "Chit Chats U.S. Select", delivery_time_description: "4-8 business days", payment_amount: "16.30", tariff_fee: "7.52" },
      { postage_type: "broken" },
    ],
  },
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Chit Chats shipments", () => {
  it("sends the label address, the parcel and the customs lines, and nothing else about the customer", () => {
    const body = shipmentRequest(order(), PARCEL, CUSTOMS);
    expect(body).toMatchObject({
      name: "Sam Lee",
      address_1: "350 5th Ave",
      address_2: "Fl 2",
      city: "New York",
      province_code: "NY",
      postal_code: "10118",
      country_code: "US",
      value: "80.00",
      value_currency: "cad",
      order_id: "0f8c2a1e",
      order_store: "other",
      package_type: "parcel", // two Lumis go in a box (battery rules)
      size_unit: "cm",
      size_x: 30,
      size_y: 22,
      size_z: 3,
      weight_unit: "kg",
      weight: 0.09,
      postage_type: "unknown",
      hazmat_code: "CLASS_9_MARKED_LITHIUM_BATTERY",
      line_items: [{ quantity: 2, value_amount: "40.00", currency_code: "cad", hs_tariff_code: "9503.00", origin_country: "CN" }],
    });
    expect(JSON.stringify(body)).not.toContain("sam@example.com");
    expect(body).not.toHaveProperty("phone");
  });

  it("follows Chit Chats' battery rules: one Lumi unmarked in a mailer, more in a marked box, and only US shipments declared", () => {
    const one = { items: [{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 1, unitAmount: 4000 }], subtotal: 4000 };
    const usOne = shipmentRequest(order("US", one), PARCEL, CUSTOMS);
    expect(usOne).toMatchObject({ package_type: "thick_envelope", hazmat_code: "CLASS_9_UNMARKED_LITHIUM_BATTERY", weight: 0.06 });
    expect(shipmentRequest(order("CA", one), PARCEL, CUSTOMS)).not.toHaveProperty("hazmat_code");
    const caTwo = shipmentRequest(order("CA"), PARCEL, CUSTOMS);
    expect(caTwo).toMatchObject({ package_type: "parcel" });
    expect(caTwo).not.toHaveProperty("hazmat_code");
    expect(shipmentRequest(order("US"), PARCEL, { ...CUSTOMS, hazmatCode: undefined })).not.toHaveProperty("hazmat_code");

    const boxed: ParcelConfig = { ...PARCEL, multiCm: [15, 12, 8], multiBoxKg: 0.12 };
    expect(packing(order("US"), boxed, CUSTOMS, "US")).toEqual({ units: 2, marked: true, packageType: "parcel", cm: [15, 12, 8], kg: 0.18, hazmatCode: MARKED_HAZMAT });
    expect(packing(order("US", one), boxed, CUSTOMS, "US")).toMatchObject({ marked: false, cm: [22, 30, 3], kg: 0.06 });
    expect(shipmentRequest(order("US"), boxed, CUSTOMS)).toMatchObject({ size_x: 15, size_y: 12, size_z: 8, weight: 0.18 });

    const heavy = { items: [{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 90, unitAmount: 4000 }] };
    expect(() => shipmentRequest(order("CA", heavy), PARCEL, CUSTOMS)).toThrow(/5.5 lb/);
  });

  it("won't make a US label until the origin country is set", () => {
    expect(() => shipmentRequest(order(), PARCEL, { ...CUSTOMS, originCountry: undefined })).toThrow(/CUSTOMS_ORIGIN_COUNTRY/);
    const ca = shipmentRequest(order("CA"), PARCEL, { ...CUSTOMS, originCountry: undefined, hazmatCode: undefined });
    expect(ca).toMatchObject({ country_code: "CA", province_code: "ON", postal_code: "M5V 2T6" });
    expect(ca).not.toHaveProperty("line_items");
    expect(ca).not.toHaveProperty("hazmat_code");
    expect(ca).not.toHaveProperty("address_2");
    expect(() => shipmentRequest(order("CA", { shipping: { name: "X", address: { country: "CA" } } }), PARCEL, CUSTOMS)).toThrow(ChitChatsError);
  });

  it("reads rates cheapest first, in cents, skipping ones it can't read", () => {
    const s = parseShipment(SHIPMENT)!;
    expect(s).toMatchObject({ id: "R4Q286T84T", status: "unpaid", trackingUrl: "https://chitchats.com/tracking/r4q286t84t" });
    expect(s.rates).toEqual([
      { postageType: "chit_chats_us_select", description: "Chit Chats U.S. Select", deliveryTime: "4-8 business days", paymentCents: 1630, tariffCents: 752 },
      { postageType: "chit_chats_us_edge", description: "Chit Chats U.S. Edge", deliveryTime: "3-6 business days", paymentCents: 1920, tariffCents: 752 },
    ]);
    expect(s.purchaseCents).toBeUndefined();
    expect(parseShipment({})).toBeNull();
  });

  it("creates the shipment with the token in the header, and fetches it when the answer has no rates", async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return new Response("", { status: 201, headers: { location: "https://staging.chitchats.com/api/v1/clients/123456/shipments/R4Q286T84T" } });
      return json(SHIPMENT);
    });
    const s = await createShipment(CFG, order(), PARCEL, CUSTOMS, f as typeof fetch);
    expect(s.id).toBe("R4Q286T84T");
    expect(s.rates).toHaveLength(2);
    const [postUrl, post] = f.mock.calls[0]!;
    expect(String(postUrl)).toBe("https://staging.chitchats.com/api/v1/clients/123456/shipments");
    expect((post!.headers as Record<string, string>).Authorization).toBe("secret-token");
    expect(String(f.mock.calls[1]![0])).toBe("https://staging.chitchats.com/api/v1/clients/123456/shipments/R4Q286T84T");
  });

  it("asks Chit Chats to refresh the rates if a new shipment has none yet", async () => {
    let gets = 0;
    const f = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") return json({ shipment: { ...SHIPMENT.shipment, rates: [] } }, 201);
      if (init?.method === "PATCH") return json({});
      gets += 1;
      return json(gets === 1 ? { shipment: { ...SHIPMENT.shipment, rates: [] } } : SHIPMENT);
    });
    expect((await createShipment(CFG, order(), PARCEL, CUSTOMS, f as typeof fetch)).rates).toHaveLength(2);
    expect(f.mock.calls.map(([u, i]) => `${i?.method} ${String(u).split("/clients/123456")[1]}`)).toEqual([
      "POST /shipments",
      "GET /shipments/R4Q286T84T",
      "PATCH /shipments/R4Q286T84T/refresh",
      "GET /shipments/R4Q286T84T",
    ]);
  });

  it("buys a rate and deletes a shipment", async () => {
    const f = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    await buyLabel(CFG, "R4Q286T84T", "chit_chats_us_select", f as typeof fetch);
    expect(f.mock.calls[0]![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ postage_type: "chit_chats_us_select" }) });
    expect(String(f.mock.calls[0]![0])).toMatch(/\/shipments\/R4Q286T84T\/buy$/);
    await deleteShipment(CFG, "R4Q286T84T", f as typeof fetch);
    expect(f.mock.calls[1]![1]).toMatchObject({ method: "DELETE" });
  });

  it("explains a refusal in Chit Chats' words, never showing the token", async () => {
    const refused = vi.fn(async () => json({ error: { message: "Postal code is invalid" } }, 422));
    await expect(getShipment(CFG, "X", refused as typeof fetch)).rejects.toThrow("Chit Chats said no (422): Postal code is invalid");
    const badToken = vi.fn(async () => json({ error: { message: "Unauthorized" } }, 401));
    const err = await getShipment(CFG, "X", badToken as typeof fetch).catch((e: Error) => e);
    expect(err).toBeInstanceOf(ChitChatsError);
    expect((err as Error).message).toMatch(/CHIT_CHATS_ACCESS_TOKEN/);
    expect((err as Error).message).not.toContain("secret-token");
  });
});
