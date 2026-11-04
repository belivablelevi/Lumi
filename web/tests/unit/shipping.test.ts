import { describe, expect, it, vi } from "vitest";
import { TABLE_CENTS, normalPostal, parcelKg, parseRateResponse, quoteShipping, rateRequestXml, tableQuote, type ParcelConfig } from "@/lib/shipping";

const PARCEL: ParcelConfig = { boxKg: 0.08, unitKg: 0.03, cm: [10, 10, 6], handlingCents: 0, fromPostalCode: "K1R 6A1" };
const CP = { username: "user", password: "pass", customerNumber: "0001234567", sandbox: true };

// The shape of a Canada Post rate-v4 answer (one service, with HST and a fuel surcharge).
const RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<price-quotes xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  <price-quote>
    <service-code>DOM.EP</service-code>
    <service-link rel="service" href="https://ct.soa-gw.canadapost.ca/rs/ship/service/DOM.EP" media-type="application/vnd.cpc.ship.rate-v4+xml"/>
    <service-name>Expedited Parcel</service-name>
    <price-details>
      <base>9.59</base>
      <taxes><gst percent="0.000">0.00</gst><pst>0.00</pst><hst percent="13.000">1.47</hst></taxes>
      <due>12.78</due>
      <adjustments><adjustment><adjustment-code>FUELSC</adjustment-code><adjustment-cost>1.72</adjustment-cost></adjustment></adjustments>
    </price-details>
    <service-standard><expected-transit-time>2</expected-transit-time><expected-delivery-date>2026-11-05</expected-delivery-date></service-standard>
  </price-quote>
</price-quotes>`;

describe("postal codes and the region table", () => {
  it("accepts real Canadian postal codes and US ZIP codes only", () => {
    expect(normalPostal("CA", "k1a 0b1")).toBe("K1A0B1");
    expect(normalPostal("CA", "D1A 0B1")).toBeNull(); // D isn't used
    expect(normalPostal("CA", "K1A")).toBeNull();
    expect(normalPostal("US", "10001-1234")).toBe("10001");
    expect(normalPostal("US", "1000")).toBeNull();
    expect(normalPostal("FR", "75001")).toBeNull();
  });

  it("prices by region", () => {
    expect(tableQuote({ country: "CA", postalCode: "K1A 0B1" })!.amount).toBe(TABLE_CENTS.near);
    expect(tableQuote({ country: "CA", postalCode: "H2X 1Y4" })!.amount).toBe(TABLE_CENTS.near);
    expect(tableQuote({ country: "CA", postalCode: "V6B 1A1" })!.amount).toBe(TABLE_CENTS.far);
    expect(tableQuote({ country: "CA", postalCode: "X1A 2L9" })!.amount).toBe(TABLE_CENTS.north);
    expect(tableQuote({ country: "US", postalCode: "10001" })).toMatchObject({ amount: TABLE_CENTS.us, label: "Canada Post Tracked Packet USA" });
    expect(tableQuote({ country: "CA", postalCode: "nope" })).toBeNull();
  });
});

describe("Canada Post rates", () => {
  it("asks for the right service, parcel and addresses", () => {
    const xml = rateRequestXml(CP, PARCEL, "CA", "V6B1A1", 2);
    expect(xml).toContain("<customer-number>0001234567</customer-number>");
    expect(xml).toContain("<weight>0.14</weight>");
    expect(xml).toContain("<length>10</length><width>10</width><height>6</height>");
    expect(xml).toContain("<service-code>DOM.EP</service-code>");
    expect(xml).toContain("<origin-postal-code>K1R6A1</origin-postal-code>");
    expect(xml).toContain("<domestic><postal-code>V6B1A1</postal-code></domestic>");
    expect(rateRequestXml(CP, PARCEL, "US", "10001", 1)).toContain("<united-states><zip-code>10001</zip-code></united-states>");
    expect(parcelKg(PARCEL, 0)).toBe(0.11); // never weighs less than one Lumi
  });

  it("reads the price before tax and the transit time", () => {
    expect(parseRateResponse(RESPONSE, "DOM.EP")).toEqual({ cents: 1131, transitDays: 2 });
    expect(parseRateResponse(RESPONSE, "USA.TP")).toBeNull();
    expect(parseRateResponse("<messages><message><code>9111</code></message></messages>", "DOM.EP")).toBeNull();
  });

  it("uses Canada Post's price, plus any packing charge", async () => {
    const fetch = vi.fn(async () => new Response(RESPONSE, { status: 200 }));
    const q = await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: { ...PARCEL, handlingCents: 150 }, canadaPost: CP, fetch });
    expect(q).toEqual({ amount: 1281, label: "Canada Post Expedited Parcel", minDays: 2, maxDays: 4, source: "canada_post" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ct.soa-gw.canadapost.ca/rs/ship/price");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
  });

  it("falls back to the table when Canada Post fails or isn't set up", async () => {
    const log = vi.fn();
    const down = vi.fn(async () => new Response("<messages><message><code>Server</code></message></messages>", { status: 500 }));
    expect(await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: PARCEL, canadaPost: CP, fetch: down, log })).toMatchObject({ source: "table", amount: TABLE_CENTS.near });
    const throws = vi.fn(async () => { throw new Error("timeout"); });
    expect(await quoteShipping({ country: "US", postalCode: "10001" }, 1, { parcel: PARCEL, canadaPost: CP, fetch: throws, log })).toMatchObject({ source: "table", amount: TABLE_CENTS.us });
    expect(log).toHaveBeenCalledTimes(2);
    const unused = vi.fn();
    expect(await quoteShipping({ country: "CA", postalCode: "V6B 1A1" }, 1, { parcel: PARCEL, canadaPost: null, fetch: unused })).toMatchObject({ source: "table", amount: TABLE_CENTS.far });
    expect(unused).not.toHaveBeenCalled();
  });

  it("won't quote where it doesn't ship", async () => {
    const fetch = vi.fn();
    expect(await quoteShipping({ country: "FR", postalCode: "75001" }, 1, { parcel: PARCEL, canadaPost: CP, fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
