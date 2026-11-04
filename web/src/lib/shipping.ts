// Shipping prices at checkout. With Canada Post API keys set, each address gets
// Canada Post's own (discounted) price for the parcel; otherwise, or if Canada
// Post doesn't answer in time, the region table below is used.
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
  username: string;
  password: string;
  customerNumber: string;
  sandbox: boolean;
}

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

const esc = (s: string) => s.replace(/[<>&'"]/g, "");

export function rateRequestXml(cp: CanadaPostConfig, p: ParcelConfig, country: ShipCountry, postal: string, units: number): string {
  const [l, w, h] = p.cm;
  const dest =
    country === "CA"
      ? `<domestic><postal-code>${esc(postal)}</postal-code></domestic>`
      : `<united-states><zip-code>${esc(postal)}</zip-code></united-states>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  <customer-number>${esc(cp.customerNumber)}</customer-number>
  <parcel-characteristics>
    <weight>${parcelKg(p, units)}</weight>
    <dimensions><length>${l}</length><width>${w}</width><height>${h}</height></dimensions>
  </parcel-characteristics>
  <services><service-code>${SERVICES[country].code}</service-code></services>
  <origin-postal-code>${esc(p.fromPostalCode.replace(/\s+/g, "").toUpperCase())}</origin-postal-code>
  <destination>${dest}</destination>
</mailing-scenario>`;
}

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`));
  return m ? m[1]!.trim() : undefined;
};

/** Reads one service's pre-tax price and transit time from a Canada Post rate response. */
export function parseRateResponse(xml: string, serviceCode: string): { cents: number; transitDays?: number } | null {
  for (const block of xml.match(/<price-quote>[\s\S]*?<\/price-quote>/g) ?? []) {
    if (tag(block, "service-code") !== serviceCode) continue;
    const due = Number(tag(block, "due"));
    if (!Number.isFinite(due) || due <= 0) return null;
    const taxes = ["gst", "pst", "hst"].reduce((sum, t) => sum + (Number(tag(block, t)) || 0), 0);
    const transit = Number(tag(block, "expected-transit-time"));
    return { cents: Math.round((due - taxes) * 100), transitDays: Number.isFinite(transit) && transit > 0 ? transit : undefined };
  }
  return null;
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
    const host = cp.sandbox ? "https://ct.soa-gw.canadapost.ca" : "https://soa-gw.canadapost.ca";
    try {
      const res = await (deps.fetch ?? fetch)(`${host}/rs/ship/price`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${cp.username}:${cp.password}`).toString("base64")}`,
          Accept: "application/vnd.cpc.ship.rate-v4+xml",
          "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
          "Accept-language": "en-CA",
        },
        body: rateRequestXml(cp, deps.parcel, country, postal, units),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
      });
      const xml = await res.text();
      const rate = res.ok ? parseRateResponse(xml, SERVICES[country].code) : null;
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
      deps.log?.(`canada post rate failed (${res.status}): ${xml.slice(0, 300)}`);
    } catch (e) {
      deps.log?.("canada post rate failed", e);
    }
  }
  return { ...table, amount: table.amount + handling };
}
