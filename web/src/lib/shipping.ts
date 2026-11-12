// Shipping prices at checkout: a flat price per region, set in Vercel (SHIPPING_PRICE_*,
// see shippingTable below). US orders also pay the import duties up front (see
// ShippingRules), and Canadian orders can ship free over an amount.
//
// Lumi has a lithium battery, so it goes by ground services only. See docs/assembly.md
// "Packing it to ship". Labels are bought from Chit Chats in the order admin.

export type ShipCountry = "CA" | "US";

export interface ShipTo {
  country: string;
  postalCode?: string;
}

export interface ShippingQuote {
  /** Before tax, in cents (CAD). */
  amount: number;
  label: string;
  minDays: number;
  maxDays: number;
  source: "table";
}

export interface ParcelConfig {
  boxKg: number;
  unitKg: number;
  /** Length, width, height in cm. */
  cm: [number, number, number];
  /** The cardboard box for orders of more than one Lumi (battery rules need a box), if different. */
  multiCm?: [number, number, number];
  multiBoxKg?: number;
  handlingCents: number;
  fromPostalCode: string;
}

// Flat prices per region before tax, in cents.
export interface ShippingTable {
  near: number; // Ontario and Quebec
  far: number; // Atlantic, Prairies, BC
  north: number; // Yukon, NWT, Nunavut
  us: number;
}

// Used when the Vercel settings below aren't set. From Chit Chats quotes from Ottawa
// (November 2026): Select $5.06 Toronto, $5.71 Vancouver, $12.74 Whitehorse, $9.94 New York,
// with some headroom for addresses only Canada Tracked reaches ($12 to $14).
export const TABLE_CENTS: ShippingTable = { near: 800, far: 900, north: 1500, us: 1000 };

// The Vercel settings for each region, in dollars (for example 12.50).
export const PRICE_SETTINGS: Record<keyof ShippingTable, string> = {
  near: "SHIPPING_PRICE_ON_QC",
  far: "SHIPPING_PRICE_REST_OF_CANADA",
  north: "SHIPPING_PRICE_NORTH",
  us: "SHIPPING_PRICE_US",
};

/** A price setting such as "12.50" or "$12.50", in cents, or null if it isn't one. */
export function settingCents(v: string | undefined): number | null {
  const s = v?.trim().replace(/^\$/, "").trim();
  return s && /^\d+(\.\d{1,2})?$/.test(s) ? Math.round(Number(s) * 100) : null;
}

/** The region prices from the settings, falling back to TABLE_CENTS for any that are unset or not a price. */
export function shippingTable(read: (name: string) => string | undefined): ShippingTable {
  const cents = (key: keyof ShippingTable) => settingCents(read(PRICE_SETTINGS[key])) ?? TABLE_CENTS[key];
  return { near: cents("near"), far: cents("far"), north: cents("north"), us: cents("us") };
}

// What goes on top of (or replaces) the region price.
export interface ShippingRules {
  /** US import duties, as a percent of the order's value, paid when the label is bought. */
  usDutyPercent: number;
  /** The broker and items fees on each US label, in cents. */
  usDutyFeeCents: number;
  /** Canadian orders at or over this subtotal ship free, in cents; null = never. */
  freeOverCents: number | null;
  /** ...but only where the shipping would cost less than this, in cents; null = everywhere in Canada. */
  freeMaxCents: number | null;
}

// US duties: Chit Chats charged $3.76 on a $40 Lumi (9.4%, China origin) plus $1.88
// broker and $0.21 items fees. Free shipping is off until it's set, and then leaves out
// shipping of $15 or more (the North at the default prices).
export const DEFAULT_RULES: ShippingRules = { usDutyPercent: 10, usDutyFeeCents: 210, freeOverCents: null, freeMaxCents: 1500 };

export const RULE_SETTINGS = {
  usDutyPercent: "SHIPPING_US_DUTY_PERCENT",
  usDutyFeeCents: "SHIPPING_US_DUTY_FEE",
  freeOverCents: "SHIPPING_FREE_OVER",
  freeMaxCents: "SHIPPING_FREE_MAX",
} as const;

/** The rules from the settings (a percent like "10" or "9.5%", and dollars), with defaults for any unset or unreadable. */
export function shippingRules(read: (name: string) => string | undefined): ShippingRules {
  const pct = read(RULE_SETTINGS.usDutyPercent)?.trim().replace(/%$/, "").trim();
  const percent = pct && /^\d+(\.\d+)?$/.test(pct) && Number(pct) <= 100 ? Number(pct) : DEFAULT_RULES.usDutyPercent;
  return {
    usDutyPercent: percent,
    usDutyFeeCents: settingCents(read(RULE_SETTINGS.usDutyFeeCents)) ?? DEFAULT_RULES.usDutyFeeCents,
    freeOverCents: settingCents(read(RULE_SETTINGS.freeOverCents)) || DEFAULT_RULES.freeOverCents,
    freeMaxCents: freeMax(read(RULE_SETTINGS.freeMaxCents)),
  };
}

/** The US duties and fees on an order worth `subtotalCents`. */
export const usDutyCents = (rules: ShippingRules, subtotalCents: number) =>
  Math.round((Math.max(0, subtotalCents) * rules.usDutyPercent) / 100) + rules.usDutyFeeCents;

// SHIPPING_FREE_MAX: dollars, or "none" for no limit. Unset or unreadable keeps the default.
function freeMax(v: string | undefined): number | null {
  if (v?.trim().toLowerCase() === "none") return null;
  return settingCents(v) || DEFAULT_RULES.freeMaxCents;
}

/** Whether a Canadian order this size ships free, where its shipping would cost `shippingCents`. */
export const shipsFree = (rules: ShippingRules | undefined, subtotalCents: number, shippingCents: number) =>
  !!rules?.freeOverCents && subtotalCents >= rules.freeOverCents && (rules.freeMaxCents === null || shippingCents < rules.freeMaxCents);

/**
 * Where free shipping reaches, for the cart and the shipping page ("Canada", "Canada, except
 * the territories", "Ontario and Quebec"...). Null when it's off or reaches nowhere.
 */
export function freeShippingArea(rules: ShippingRules, table: ShippingTable = TABLE_CENTS, handlingCents = 0): string | null {
  if (!rules.freeOverCents) return null;
  const free = (cents: number) => rules.freeMaxCents === null || cents + handlingCents < rules.freeMaxCents;
  const near = free(table.near), far = free(table.far), north = free(table.north);
  if (near && far && north) return "Canada";
  if (near && far) return "Canada, except the territories";
  const parts = [near && "Ontario and Quebec", far && "the other provinces", north && "the territories"].filter((p): p is string => !!p);
  return parts.length ? parts.join(" and ") : null;
}

// The table doesn't know which carrier will take the parcel, so it names the service only.
const TABLE_SERVICES: Record<ShipCountry, { label: string; days: [number, number] }> = {
  CA: { label: "Tracked shipping", days: [2, 8] },
  US: { label: "Tracked shipping to the US", days: [4, 10] },
};

const NEAR = new Set(["K", "L", "M", "N", "P", "G", "H", "J"]);
const NORTH = new Set(["X", "Y"]);

export const normalPostal = (country: string, postal?: string) => {
  const p = (postal ?? "").toUpperCase().replace(/\s+/g, "");
  if (country === "CA") return /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/.test(p) ? p : null;
  if (country === "US") return /^\d{5}(-?\d{4})?$/.test(p) ? p.slice(0, 5) : null;
  return null;
};

export function tableQuote(to: ShipTo, table: ShippingTable = TABLE_CENTS): ShippingQuote | null {
  const country = to.country as ShipCountry;
  const svc = TABLE_SERVICES[country];
  const postal = normalPostal(to.country, to.postalCode);
  if (!svc || !postal) return null;
  const first = postal[0]!;
  const amount = country === "US" ? table.us : NORTH.has(first) ? table.north : NEAR.has(first) ? table.near : table.far;
  return { amount, label: svc.label, minDays: svc.days[0], maxDays: svc.days[1], source: "table" };
}

export const parcelKg = (p: ParcelConfig, units: number) => Math.round((p.boxKg + p.unitKg * Math.max(1, units)) * 1000) / 1000;

export interface QuoteDeps {
  parcel: ParcelConfig;
  table?: ShippingTable;
  /** Duties and free shipping. Without them, the region price is all there is. */
  rules?: ShippingRules;
}

/**
 * The price to ship an order of `units` Lumis worth `subtotalCents` to this address,
 * or null if we don't ship there. US prices include the import duties.
 */
export async function quoteShipping(to: ShipTo, units: number, deps: QuoteDeps, subtotalCents = 0): Promise<ShippingQuote | null> {
  const table = tableQuote(to, deps.table);
  if (!table) return null;
  const country = to.country as ShipCountry;
  if (country === "CA" && shipsFree(deps.rules, subtotalCents, table.amount + deps.parcel.handlingCents)) return { ...table, amount: 0, label: "Free tracked shipping" };
  const duties = country === "US" && deps.rules ? usDutyCents(deps.rules, subtotalCents) : 0;
  const handling = deps.parcel.handlingCents + duties;
  return { ...table, amount: table.amount + handling, label: duties ? "Shipping and import duties" : table.label };
}

/** Sample addresses for the admin's "Shipping prices" page, one per region. */
export const SAMPLE_ADDRESSES: { place: string; country: ShipCountry; postal: string }[] = [
  { place: "Ottawa, ON", country: "CA", postal: "K1A0B1" },
  { place: "Vancouver, BC", country: "CA", postal: "V6B1A1" },
  { place: "Whitehorse, YT", country: "CA", postal: "Y1A1A1" },
  { place: "New York, NY (US)", country: "US", postal: "10001" },
];
