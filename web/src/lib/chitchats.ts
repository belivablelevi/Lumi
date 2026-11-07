// Chit Chats labels from the order admin: create a shipment for a paid order, see its
// rates, buy one, and get the PDF label and tracking. API docs: chitchats.com/docs/api/v1
// (JSON, the access token in the Authorization header, the client ID in the URL).
// Checkout doesn't use this: it charges the flat prices in lib/shipping.ts.

import { shippingAddress } from "./fulfilment";
import { parcelKg, type ParcelConfig } from "./shipping";
import type { Order } from "./store/types";

export interface ChitChatsConfig {
  clientId: string;
  token: string;
  /** https://chitchats.com, or https://staging.chitchats.com to test with fake credits. */
  base: string;
}

export interface CustomsConfig {
  hsCode: string;
  /** Two-letter country the Lumi counts as made in. US labels need it. */
  originCountry?: string;
  /** Chit Chats' battery code for a package with one Lumi, or undefined for none. */
  hazmatCode?: string;
  packageType: "parcel" | "thick_envelope";
}

export interface ChitChatsRate {
  postageType: string;
  description: string;
  deliveryTime?: string;
  /** What Chit Chats charges for this rate, tax and any US tariff included, in cents. */
  paymentCents: number;
  tariffCents?: number;
}

export interface ChitChatsShipment {
  id: string;
  /** unpaid, postage_requested, ready, postage_purchase_failed, in_transit, delivered, ... */
  status: string;
  postageType?: string;
  rates: ChitChatsRate[];
  trackingUrl?: string;
  carrierTrackingCode?: string;
  labelPdfUrl?: string;
  /** What was paid, in cents, once bought. */
  purchaseCents?: number;
}

export class ChitChatsError extends Error {}

export const CHIT_CHATS_LIVE = "https://chitchats.com";
export const CHIT_CHATS_STAGING = "https://staging.chitchats.com";
export const DESCRIPTION = "Lumi electronic toy keychain";
export const MARKED_HAZMAT = "CLASS_9_MARKED_LITHIUM_BATTERY";
/** Chit Chats' limit for a marked battery package: 5.5 lb. */
export const MARKED_MAX_KG = 2.49;

export interface Packing {
  units: number;
  /** More than one Lumi: Chit Chats' "Class 9 Marked" rules apply. */
  marked: boolean;
  packageType: CustomsConfig["packageType"];
  cm: [number, number, number];
  kg: number;
  /** Only US shipments are declared: Chit Chats said Canadian ones don't need it. */
  hazmatCode?: string;
}

/**
 * How an order is packed, following Chit Chats' compliance answer (2026-11-06):
 * - One Lumi: Class 9 Unmarked. A padded mailer is fine, no battery markings.
 * - More than one: Class 9 Marked. A sturdy cardboard box, at most 5.5 lb, with a lithium
 *   battery mark (with a phone number) on the same side as the label. US: send by U.S. Edge.
 * - Both follow the same packing rules in Canada, but only US shipments carry the code.
 */
export function packing(order: Pick<Order, "items">, parcel: ParcelConfig, customs: CustomsConfig, country?: string): Packing {
  const units = Math.max(1, order.items.reduce((n, i) => n + i.qty, 0));
  const marked = units > 1;
  const kg = marked && parcel.multiBoxKg !== undefined
    ? Math.round((parcel.multiBoxKg + parcel.unitKg * units) * 1000) / 1000
    : parcelKg(parcel, units);
  const code = customs.hazmatCode === undefined ? undefined : marked ? MARKED_HAZMAT : customs.hazmatCode;
  return {
    units,
    marked,
    packageType: marked ? "parcel" : customs.packageType,
    cm: (marked && parcel.multiCm) || parcel.cm,
    kg,
    ...(country?.toUpperCase() === "US" && code ? { hazmatCode: code } : {}),
  };
}

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const cents = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

/** Reads a shipment from Chit Chats' answer ({ shipment: {...} } or the shipment itself). */
export function parseShipment(body: unknown): ChitChatsShipment | null {
  const b = body as Record<string, unknown> | null;
  const s = (b && typeof b.shipment === "object" ? b.shipment : b) as Record<string, unknown> | null;
  const id = str(s?.id);
  if (!s || !id) return null;
  const rates = (Array.isArray(s.rates) ? (s.rates as Record<string, unknown>[]) : []).flatMap((r): ChitChatsRate[] => {
    const postageType = str(r.postage_type);
    const paymentCents = cents(r.payment_amount) ?? cents(r.purchase_amount);
    if (!postageType || paymentCents === undefined) return [];
    const tariff = cents(r.tariff_fee);
    return [{ postageType, description: str(r.postage_description) ?? postageType, deliveryTime: str(r.delivery_time_description), paymentCents, ...(tariff ? { tariffCents: tariff } : {}) }];
  });
  rates.sort((x, y) => x.paymentCents - y.paymentCents);
  return {
    id,
    status: str(s.status) ?? "unknown",
    postageType: str(s.postage_type),
    rates,
    trackingUrl: str(s.tracking_url),
    carrierTrackingCode: str(s.carrier_tracking_code),
    labelPdfUrl: str(s.postage_label_pdf_url),
    purchaseCents: cents(s.purchase_amount),
  };
}

/** One request to the client's API. Errors carry Chit Chats' own words, never the token. */
async function call(cfg: ChitChatsConfig, f: typeof fetch, method: string, path: string, body?: unknown) {
  const res = await f(`${cfg.base}/api/v1/clients/${encodeURIComponent(cfg.clientId)}${path}`, {
    method,
    headers: { Authorization: cfg.token, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const json = readJson(text);
  if (res.status === 401) throw new ChitChatsError("Chit Chats refused the access token. Check CHIT_CHATS_CLIENT_ID and CHIT_CHATS_ACCESS_TOKEN in Vercel.");
  if (!res.ok) {
    const msg = str((json as { error?: { message?: unknown } } | null)?.error?.message) ?? (text.trim().slice(0, 300) || "no message");
    throw new ChitChatsError(`Chit Chats said no (${res.status}): ${msg}`);
  }
  return { res, json };
}

/** The shipment to create for a paid order: the label's address, the parcel, and the customs lines. */
export function shipmentRequest(order: Order, parcel: ParcelConfig, customs: CustomsConfig) {
  const a = shippingAddress(order);
  const country = a.country?.toUpperCase();
  if (!a.name || !a.line1 || !a.city || !a.postalCode || !country) throw new ChitChatsError("This order's shipping address is incomplete.");
  if (country !== "CA" && country !== "US") throw new ChitChatsError(`We don't ship to ${country}.`);
  if (country === "US" && !customs.originCountry) {
    throw new ChitChatsError("US labels need the country Lumi is made in: set CUSTOMS_ORIGIN_COUNTRY in Vercel (for example CN), then redeploy.");
  }
  if (country === "US" && customs.hsCode.replace(/[^0-9]/g, "").length !== 10) {
    throw new ChitChatsError(`US labels need the full 10-digit US tariff code, not "${customs.hsCode}": set CUSTOMS_HS_CODE in Vercel (for example 9503.00.0090), then redeploy.`);
  }
  const pack = packing(order, parcel, customs, country);
  if (pack.marked && pack.kg > MARKED_MAX_KG) throw new ChitChatsError(`This parcel would weigh ${pack.kg} kg. Battery parcels can be at most 5.5 lb (2.49 kg): split it.`);
  const [x, y, z] = [...pack.cm].sort((p, q) => q - p);
  const lineItems = customs.originCountry
    ? order.items.map((i) => ({
        quantity: i.qty,
        description: DESCRIPTION,
        value_amount: (i.unitAmount / 100).toFixed(2),
        currency_code: "cad",
        hs_tariff_code: customs.hsCode,
        origin_country: customs.originCountry,
        weight: Math.round(parcel.unitKg * 1000),
        weight_unit: "g",
      }))
    : undefined;
  return {
    name: a.name,
    address_1: a.line1,
    ...(a.line2 ? { address_2: a.line2 } : {}),
    city: a.city,
    ...(a.state ? { province_code: a.state } : {}),
    postal_code: a.postalCode,
    country_code: country,
    package_contents: "merchandise",
    description: DESCRIPTION,
    value: (order.subtotal / 100).toFixed(2),
    value_currency: "cad",
    order_id: order.id.slice(0, 8),
    order_store: "other",
    package_type: pack.packageType,
    size_unit: "cm",
    size_x: x,
    size_y: y,
    size_z: z,
    weight_unit: "kg",
    weight: pack.kg,
    postage_type: "unknown",
    ship_date: "today",
    ...(pack.hazmatCode ? { hazmat_code: pack.hazmatCode } : {}),
    ...(lineItems ? { line_items: lineItems } : {}),
  };
}

/** The shipment, with its current rates (or label, once bought). */
export async function getShipment(cfg: ChitChatsConfig, id: string, f: typeof fetch = fetch): Promise<ChitChatsShipment> {
  const { json } = await call(cfg, f, "GET", `/shipments/${encodeURIComponent(id)}`);
  const s = parseShipment(json);
  if (!s) throw new ChitChatsError("Chit Chats' answer had no shipment in it.");
  return s;
}

/** Creates the shipment (unpaid, so nothing is charged yet) and returns it with its rates. */
export async function createShipment(cfg: ChitChatsConfig, order: Order, parcel: ParcelConfig, customs: CustomsConfig, f: typeof fetch = fetch): Promise<ChitChatsShipment> {
  const body = shipmentRequest(order, parcel, customs);
  const { res, json } = await call(cfg, f, "POST", "/shipments", body).catch((e: unknown) => {
    // Making a shipment only 404s when the account itself isn't found.
    if (!(e instanceof ChitChatsError && e.message.includes("(404)"))) throw e;
    throw new ChitChatsError(cfg.base === CHIT_CHATS_STAGING
      ? "Chit Chats' test site doesn't know this client ID (404). The test site has its own accounts: use a client ID and token from staging.chitchats.com, or remove CHIT_CHATS_SANDBOX to use your real account."
      : "Chit Chats doesn't know this client ID (404). Check CHIT_CHATS_CLIENT_ID in Vercel (the number in your Chit Chats dashboard's address).");
  });
  const made = parseShipment(json);
  const id = made?.id ?? res.headers.get("location")?.split("/").filter(Boolean).pop();
  if (!id) throw new ChitChatsError("Chit Chats made the shipment but didn't say its ID. Check your Chit Chats shipments.");
  if (made?.rates.length) return made;
  const s = await getShipment(cfg, id, f);
  if (s.rates.length) return s;
  await call(cfg, f, "PATCH", `/shipments/${encodeURIComponent(id)}/refresh`, {});
  return getShipment(cfg, id, f);
}

/** Asks Chit Chats to buy this rate. It finishes shortly after: the shipment's status becomes ready (or postage_purchase_failed). */
export async function buyLabel(cfg: ChitChatsConfig, id: string, postageType: string, f: typeof fetch = fetch): Promise<void> {
  await call(cfg, f, "PATCH", `/shipments/${encodeURIComponent(id)}/buy`, { postage_type: postageType });
}

/** Deletes an unpaid shipment. A bought label is refunded in Chit Chats instead. */
export async function deleteShipment(cfg: ChitChatsConfig, id: string, f: typeof fetch = fetch): Promise<void> {
  await call(cfg, f, "DELETE", `/shipments/${encodeURIComponent(id)}`);
}
