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
export function rateRequest(cp: CanadaPostConfig, p: ParcelConfig, country: ShipCountry, postal: string, units: number) {
  const [length, width, height] = p.cm;
  return {
    customerNumber: cp.customerNumber,
    quoteType: "commercial",
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
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !body?.access_token) throw new Error(`token ${res.status}`);
  const life = Number(body.expires_in) > 0 ? Number(body.expires_in) : 600;
  token = { key: cp.apiKey, value: body.access_token, until: Date.now() + Math.max(life - 60, 30) * 1000 };
  return token.value;
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
  const cp = deps.canadaPost;
  if (cp) {
    const f = deps.fetch ?? fetch;
    const signal = AbortSignal.timeout(deps.timeoutMs ?? 8000);
    try {
      const res = await f(CP_RATES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await accessToken(cp, f, signal)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "Accept-Language": "en-CA",
        },
        body: JSON.stringify(rateRequest(cp, deps.parcel, country, postal, units)),
        signal,
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {}
      if (res.status === 401) forgetCanadaPostToken();
      const rate = res.ok ? parseRateResponse(body, SERVICES[country].code) : null;
      if (rate) {
        const svc = SERVICES[country];
        const days = rate.transitDays;
        return {
          amount: rate.cents + handling,
          label: svc.label,
          minDays: days ?? svc.days[0],
          maxDays: days ? days + 2 : svc.days[1],
          source: "canada_post",
        };
      }
      deps.log?.(`canada post rate failed (${res.status}): ${text.slice(0, 300)}`);
    } catch (e) {
      deps.log?.("canada post rate failed", e);
    }
  }
  return { ...table, amount: table.amount + handling };
}
