// Shipping prices at checkout. Normally a flat price per region, set in Vercel
// (SHIPPING_PRICE_*, see shippingTable below). US orders also pay the import duties
// up front (see ShippingRules), and Canadian orders can ship free over an amount.
// With a Canada Post API key set, each address instead gets Canada Post's own price
// for the parcel, and the region table is the backup if Canada Post doesn't answer.
//
// Canada Post's Rating API (developer portal, since April 2026): JSON, with an
// OAuth 2.0 token from the app's API key and secret. A "Test" app's key gets
// made-up prices from the same address; a "Production" app's key gets real ones.
//
// Lumi has a lithium battery, so only ground parcel services are offered inside
// Canada (Expedited Parcel), and Tracked Packet to the US. See docs/assembly.md
// "Packing it to ship" and Canada Post's battery rules.

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
  source: "canada_post" | "table";
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

export interface CanadaPostConfig {
  apiKey: string;
  apiSecret: string;
  customerNumber: string;
}

const CP_API = "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs";
export const CP_TOKEN_URL = `${CP_API}/cpc-api-native-oauth-provider/oauth2/token`;
export const CP_RATES_URL = `${CP_API}/rating/v1/prices`;

const SERVICES: Record<ShipCountry, { code: string; label: string; days: [number, number] }> = {
  CA: { code: "DOM.EP", label: "Canada Post Expedited Parcel", days: [2, 8] },
  US: { code: "USA.TP", label: "Canada Post Tracked Packet USA", days: [4, 10] },
};

// Expedited Parcel is for business accounts only, so a counter (regular) price inside
// Canada has to ask for Regular Parcel. Only the admin test asks for counter prices.
const COUNTER_CA = { code: "DOM.RP", label: "Canada Post Regular Parcel" };
const service = (country: ShipCountry, counter = false) => (counter && country === "CA" ? COUNTER_CA : SERVICES[country]);

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

// Canada Post's smallest parcel inside Canada (Regular, Expedited, Xpresspost, Priority):
// 23 x 20 x 2.5 cm. It won't price anything smaller (error 9111) and charges a smaller box
// as this size, so domestic quotes round each side up to it.
export const CA_MIN_CM: [number, number, number] = [23, 20, 2.5];

/** The parcel's sides, longest first, rounded up to Canada Post's minimum inside Canada. */
export function quotedCm(p: ParcelConfig, country: ShipCountry): [number, number, number] {
  const sides = [...p.cm].sort((a, b) => b - a) as [number, number, number];
  return country === "CA" ? (sides.map((s, i) => Math.max(s, CA_MIN_CM[i]!)) as [number, number, number]) : sides;
}

/** The Rating API's request body for one service. */
export function rateRequest(cp: CanadaPostConfig, p: ParcelConfig, country: ShipCountry, postal: string, units: number, counter = false) {
  const [length, width, height] = quotedCm(p, country);
  return {
    // Counter (regular) prices must leave the customer number out.
    ...(counter ? { quoteType: "counter" } : { customerNumber: cp.customerNumber, quoteType: "commercial" }),
    parcelCharacteristics: { weight: parcelKg(p, units), dimensions: { length, width, height } },
    services: [service(country, counter).code],
    originPostalCode: p.fromPostalCode.replace(/\s+/g, "").toUpperCase(),
    destination: country === "CA" ? { domestic: { postalCode: postal } } : { unitedStates: { zipCode: postal } },
  };
}

interface PriceQuote {
  serviceCode?: string;
  priceDetails?: { due?: number; taxes?: Record<string, { amt?: number } | undefined> };
  serviceStandard?: { expectedTransitTime?: number };
}

/** Reads one service's pre-tax price and transit time from a Rating API answer. */
export function parseRateResponse(body: unknown, serviceCode: string): { cents: number; transitDays?: number } | null {
  const quotes: PriceQuote[] = Array.isArray(body) ? body : [];
  const q = quotes.find((x) => x?.serviceCode === serviceCode);
  const due = Number(q?.priceDetails?.due);
  if (!q || !Number.isFinite(due) || due <= 0) return null;
  const taxes = ["gst", "pst", "hst"].reduce((sum, t) => sum + (Number(q.priceDetails?.taxes?.[t]?.amt) || 0), 0);
  const transit = Number(q.serviceStandard?.expectedTransitTime);
  return { cents: Math.round((due - taxes) * 100), transitDays: Number.isFinite(transit) && transit > 0 ? transit : undefined };
}

// Tokens last a while, so one is reused until shortly before it runs out.
let token: { key: string; value: string; until: number } | null = null;
export const forgetCanadaPostToken = () => {
  token = null;
};

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const TRACE_HEADERS = ["content-type", "www-authenticate", "x-global-transaction-id", "x-request-id", "server"];

/** Canada Post's own words for what went wrong (never includes our key or secret). */
function reason(body: unknown, text: string, headers?: Headers): string {
  const b = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | null;
  const errors = b && Array.isArray(b.errors) ? (b.errors as { errorCode?: string; message?: string }[]) : null;
  if (errors?.length) return errors.map((e) => `${e.message ?? ""}${e.errorCode ? ` (${e.errorCode})` : ""}`.trim()).join(" ");
  for (const k of ["error_description", "moreInformation", "detail", "title", "error"]) {
    if (b && typeof b[k] === "string" && b[k]) return b[k] as string;
  }
  if (text.trim()) return text.slice(0, 300);
  // An empty answer: the headers are all there is to go on.
  const seen = TRACE_HEADERS.flatMap((h) => (headers?.get(h) ? [`${h}: ${headers.get(h)}`] : []));
  return seen.length ? `no message (${seen.join("; ")})` : "no message";
}

async function accessToken(cp: CanadaPostConfig, f: typeof fetch, signal: AbortSignal): Promise<string> {
  if (token && token.key === cp.apiKey && token.until > Date.now()) return token.value;
  const res = await f(CP_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cp.apiKey}:${cp.apiSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "merchant" }).toString(),
    signal,
  });
  const text = await res.text();
  const body = readJson(text) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) throw new Error(`Canada Post refused the API key and secret (${res.status}): ${reason(body, text, res.headers)}`);
  const life = Number(body.expires_in) > 0 ? Number(body.expires_in) : 600;
  token = { key: cp.apiKey, value: body.access_token, until: Date.now() + Math.max(life - 60, 30) * 1000 };
  return token.value;
}

/** Canada Post's pre-tax price for one parcel. Throws with Canada Post's reason if it can't get one. */
export async function canadaPostRate(
  cp: CanadaPostConfig,
  parcel: ParcelConfig,
  country: ShipCountry,
  postal: string,
  units: number,
  f: typeof fetch = fetch,
  timeoutMs = 8000,
  counter = false,
): Promise<{ cents: number; transitDays?: number }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const res = await f(CP_RATES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(cp, f, signal)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "en-CA",
      "User-Agent": "Snaggo-checkout/1.0 (+https://www.snaggo.tech)",
    },
    body: JSON.stringify(rateRequest(cp, parcel, country, postal, units, counter)),
    signal,
  });
  const text = await res.text();
  const body = readJson(text);
  if (res.status === 401) forgetCanadaPostToken();
  if (!res.ok) throw new Error(`Canada Post wouldn't price it (${res.status}): ${reason(body, text, res.headers)}`);
  const code = service(country, counter).code;
  const rate = parseRateResponse(body, code);
  if (!rate) throw new Error(`Canada Post's answer had no ${code} price: ${text.slice(0, 300)}`);
  return rate;
}

export interface QuoteDeps {
  parcel: ParcelConfig;
  table?: ShippingTable;
  /** Duties and free shipping. Without them, the region price is all there is. */
  rules?: ShippingRules;
  canadaPost?: CanadaPostConfig | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (msg: string, e?: unknown) => void;
}

/**
 * The price to ship an order of `units` Lumis worth `subtotalCents` to this address,
 * or null if we don't ship there. US prices include the import duties.
 */
export async function quoteShipping(to: ShipTo, units: number, deps: QuoteDeps, subtotalCents = 0): Promise<ShippingQuote | null> {
  const table = tableQuote(to, deps.table);
  if (!table) return null;
  const country = to.country as ShipCountry;
  const postal = normalPostal(to.country, to.postalCode)!;
  if (country === "CA" && shipsFree(deps.rules, subtotalCents, table.amount + deps.parcel.handlingCents)) return { ...table, amount: 0, label: "Free tracked shipping" };
  const duties = country === "US" && deps.rules ? usDutyCents(deps.rules, subtotalCents) : 0;
  const handling = deps.parcel.handlingCents + duties;
  const withDuties = (label: string) => (duties ? `${label}, import duties included` : label);
  if (deps.canadaPost) {
    try {
      const rate = await canadaPostRate(deps.canadaPost, deps.parcel, country, postal, units, deps.fetch, deps.timeoutMs);
      const svc = SERVICES[country];
      const days = rate.transitDays;
      return {
        amount: rate.cents + handling,
        label: withDuties(svc.label),
        minDays: days ?? svc.days[0],
        maxDays: days ? days + 2 : svc.days[1],
        source: "canada_post",
      };
    } catch (e) {
      deps.log?.("canada post rate failed", e);
    }
  }
  return { ...table, amount: table.amount + handling, label: duties ? "Shipping and import duties" : table.label };
}

/** Sample addresses for the admin's "Test Canada Post" check. */
export const TEST_ADDRESSES: { place: string; country: ShipCountry; postal: string; counter?: boolean }[] = [
  { place: "Ottawa, ON", country: "CA", postal: "K1A0B1" },
  { place: "Vancouver, BC", country: "CA", postal: "V6B1A1" },
  { place: "New York, NY (US)", country: "US", postal: "10001" },
  // Without the customer number: if only this works, the number doesn't match the API key's account.
  { place: "Ottawa, ON, regular price (no customer number)", country: "CA", postal: "K1A0B1", counter: true },
];

export type CanadaPostCheck = { place: string; service: string; counter?: boolean } & (
  | { ok: true; cents: number; checkoutCents: number; transitDays?: number }
  | { ok: false; error: string }
);

/** Asks Canada Post for one Lumi to each sample address, keeping the exact error when it fails. */
export async function checkCanadaPost(cp: CanadaPostConfig, parcel: ParcelConfig, f: typeof fetch = fetch): Promise<CanadaPostCheck[]> {
  const out: CanadaPostCheck[] = [];
  for (const a of TEST_ADDRESSES) {
    const label = service(a.country, a.counter).label;
    try {
      const r = await canadaPostRate(cp, parcel, a.country, a.postal, 1, f, 8000, a.counter);
      out.push({ place: a.place, service: label, counter: a.counter, ok: true, cents: r.cents, checkoutCents: r.cents + parcel.handlingCents, transitDays: r.transitDays });
    } catch (e) {
      const error = e instanceof Error ? (e.name === "TimeoutError" ? "Canada Post didn't answer within 8 seconds." : e.message) : String(e);
      out.push({ place: a.place, service: label, counter: a.counter, ok: false, error });
    }
  }
  return out;
}
