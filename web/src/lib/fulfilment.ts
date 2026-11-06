import type { Carrier, Order } from "./store/types";

export const CARRIERS: { id: Carrier; label: string }[] = [
  { id: "canada_post", label: "Canada Post" },
  { id: "chit_chats", label: "Chit Chats" },
  { id: "stallion", label: "Stallion Express" },
  { id: "other", label: "Other" },
];

export const carrierLabel = (c?: Carrier) => CARRIERS.find((x) => x.id === c)?.label ?? "the carrier";

/** The public tracking page for a parcel, or null when we can't link one. */
export function trackingUrl(carrier: Carrier | undefined, tracking: string | undefined): string | null {
  const t = tracking?.replace(/\s+/g, "");
  if (!t || !/^[A-Za-z0-9-]{4,40}$/.test(t)) return null;
  if (carrier === "canada_post") return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(t)}`;
  if (carrier === "chit_chats") return `https://chitchats.com/tracking/${encodeURIComponent(t)}`;
  return null;
}

export interface Address {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** Reads Stripe Checkout's collected shipping details ({ name, address: {...} }). */
export function shippingAddress(o: Pick<Order, "shipping" | "customerName">): Address {
  const s = (o.shipping ?? {}) as { name?: string | null; address?: Record<string, string | null | undefined> | null };
  const a = s.address ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    name: str(s.name) ?? str(o.customerName),
    line1: str(a.line1),
    line2: str(a.line2),
    city: str(a.city),
    state: str(a.state),
    postalCode: str(a.postal_code),
    country: str(a.country),
  };
}

/** The address as it goes on a label, one line per row. */
export function addressLines(a: Address): string[] {
  return [a.name, a.line1, a.line2, [a.city, a.state, a.postalCode].filter(Boolean).join(" "), a.country].filter(
    (l): l is string => !!l && l.trim().length > 0,
  );
}

const TZ = "America/Toronto";
export const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: TZ }) : "");
export const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }) : "";

export const itemsSummary =(o: Pick<Order, "items">) => o.items.map((i) => `${i.qty} × ${i.name}`).join(", ");

// A cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a leading quote.
function cell(v: string | number | undefined): string {
  let s = v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Column names follow Chit Chats' import template, so the file can go straight
// into it; it also works as a packing list in any spreadsheet.
const COLUMNS = [
  "order_id", "name", "address_1", "address_2", "city", "province_code", "postal_code", "country_code",
  "customer_email", "item_quantity", "item_description", "item_unit_value", "value_currency", "unit_names", "shipping_protection",
] as const;

/** Orders to ship as CSV (one row per order). */
export function ordersCsv(orders: Order[]): string {
  const rows = orders.map((o) => {
    const a = shippingAddress(o);
    const qty = o.items.reduce((n, i) => n + i.qty, 0);
    const value = qty ? (o.subtotal / qty / 100).toFixed(2) : "";
    return [
      o.id.slice(0, 8), a.name, a.line1, a.line2, a.city, a.state, a.postalCode, a.country,
      o.email, qty, o.items.map((i) => i.name).join(" + "), value, o.currency, o.unitNames, o.protectionAmount ? "yes" : "no",
    ].map(cell).join(",");
  });
  return [COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}
