// Shipping prices at checkout. With a Canada Post API key set, each address gets
// Canada Post's own (Solutions for Small Business) price for the parcel; otherwise,
// or if Canada Post doesn't answer in time, the region table below is used.
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

// Backup prices before tax, in cents. Estimates for a small, light box from Ottawa:
// check them against Snap Ship now and then.
export const TABLE_CENTS = {
  near: 1400, // Ontario and Quebec
  far: 1900, // Atlantic, Prairies, BC
  north: 2800, // Yukon, NWT, Nunavut
  us: 1600,
};

const NEAR = new Set(["K", "L", "M", "N", "P", "G", "H", "J"]);
const NORTH = new Set(["X", "Y"]);

export const normalPostal = (country: string, postal?: string) => {
  const p = (postal ?? "").toUpperCase().replace(/\s+/g, "");
  if (country === "CA") return /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/.test(p) ? p : null;
  if (country === "US") return /^\d{5}(-?\d{4})?$/.test(p) ? p.slice(0, 5) : null;
  return null;
};

export function tableQuote(to: ShipTo): ShippingQuote | null {
  const country = to.country as ShipCountry;
  const svc = SERVICES[country];
  const postal = normalPostal(to.country, to.postalCode);
  if (!svc || !postal) return null;
  const first = postal[0]!;
  const amount = country === "US" ? TABLE_CENTS.us : NORTH.has(first) ? TABLE_CENTS.north : NEAR.has(first) ? TABLE_CENTS.near : TABLE_CENTS.far;
  return { amount, label: svc.label, minDays: svc.days[0], maxDays: svc.days[1], source: "table" };
}

export const parcelKg = (p: ParcelConfig, units: number) => Math.round((p.boxKg + p.unitKg * Math.max(1, units)) * 1000) / 1000;

/** The Rating API's request body for one service. */
export function rateRequest(cp: CanadaPostConfig, p: ParcelConfig, country: ShipCountry, postal: string, units: number, counter = false) {
  const [length, width, height] = p.cm;
  return {
    // Counter (regular) prices must leave the customer number out.
    ...(counter ? { quoteType: "counter" } : { customerNumber: cp.customerNumber, quoteType: "commercial" }),
    parcelCharacteristics: { weight: parcelKg(p, units), dimensions: { length, width, height } },
    services: [SERVICES[country].code],
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
  const rate = parseRateResponse(body, SERVICES[country].code);
  if (!rate) throw new Error(`Canada Post's answer had no ${SERVICES[country].code} price: ${text.slice(0, 300)}`);
  return rate;
}

export interface QuoteDeps {
  parcel: ParcelConfig;
  canadaPost?: CanadaPostConfig | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (msg: string, e?: unknown) => void;
}

/** The price to ship an order of `units` Lumis to this address, or null if we don't ship there. */
export async function quoteShipping(to: ShipTo, units: number, deps: QuoteDeps): Promise<ShippingQuote | null> {
  const table = tableQuote(to);
  if (!table) return null;
  const country = to.country as ShipCountry;
  const postal = normalPostal(to.country, to.postalCode)!;
  const handling = deps.parcel.handlingCents;
  if (deps.canadaPost) {
    try {
      const rate = await canadaPostRate(deps.canadaPost, deps.parcel, country, postal, units, deps.fetch, deps.timeoutMs);
      const svc = SERVICES[country];
      const days = rate.transitDays;
      return {
        amount: rate.cents + handling,
        label: svc.label,
        minDays: days ?? svc.days[0],
        maxDays: days ? days + 2 : svc.days[1],
        source: "canada_post",
      };
    } catch (e) {
      deps.log?.("canada post rate failed", e);
    }
  }
  return { ...table, amount: table.amount + handling };
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
    const service = SERVICES[a.country].label;
    try {
      const r = await canadaPostRate(cp, parcel, a.country, a.postal, 1, f, 8000, a.counter);
      out.push({ place: a.place, service, counter: a.counter, ok: true, cents: r.cents, checkoutCents: r.cents + parcel.handlingCents, transitDays: r.transitDays });
    } catch (e) {
      const error = e instanceof Error ? (e.name === "TimeoutError" ? "Canada Post didn't answer within 8 seconds." : e.message) : String(e);
      out.push({ place: a.place, service, counter: a.counter, ok: false, error });
    }
  }
  return out;
}
