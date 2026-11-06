import { beforeEach, describe, expect, it, vi } from "vitest";
import { CP_RATES_URL, CP_TOKEN_URL, TABLE_CENTS, checkCanadaPost, forgetCanadaPostToken, normalPostal, parcelKg, parseRateResponse, quotedCm, quoteShipping, rateRequest, settingCents, shippingRules, shippingTable, tableQuote, usDutyCents, DEFAULT_RULES, freeShippingArea, type ParcelConfig } from "@/lib/shipping";

const PARCEL: ParcelConfig = { boxKg: 0.08, unitKg: 0.03, cm: [10, 10, 6], handlingCents: 0, fromPostalCode: "K1R 6A1" };
const CP = { apiKey: "key", apiSecret: "secret", customerNumber: "0001234567" };

// The shape of a Rating API answer (one service, with HST and a fuel surcharge).
const RESPONSE = [
  {
    serviceCode: "DOM.EP",
    serviceName: "Expedited Parcel",
    priceDetails: {
      base: 9.59,
      taxes: { gst: { amt: 0, percent: 0 }, pst: { amt: 0, percent: 0 }, hst: { amt: 1.47, percent: 13 } },
      due: 12.78,
      adjustments: [{ adjustmentCode: "FUELSC", adjustmentName: "Fuel surcharge", adjustmentCost: 1.72 }],
    },
    serviceStandard: { expectedTransitTime: 2, expectedDeliveryDate: "2026-11-05T00:00:00.000Z" },
  },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** A fake Canada Post: hands out a token, then answers rate requests with `rates`. */
function canadaPost(rates: () => Response) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
    String(url) === CP_TOKEN_URL ? json({ access_token: "tok", expires_in: 3600 }) : rates(),
  );
}

beforeEach(() => forgetCanadaPostToken());

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
    expect(tableQuote({ country: "US", postalCode: "10001" })).toMatchObject({ amount: TABLE_CENTS.us, label: "Tracked shipping to the US" });
    expect(tableQuote({ country: "CA", postalCode: "K1A 0B1" })).toMatchObject({ label: "Tracked shipping" });
    expect(tableQuote({ country: "CA", postalCode: "nope" })).toBeNull();
  });

  it("reads the region prices from the settings, in dollars", () => {
    const settings: Record<string, string> = {
      SHIPPING_PRICE_ON_QC: "9.5",
      SHIPPING_PRICE_REST_OF_CANADA: "$12.75",
      SHIPPING_PRICE_NORTH: "lots",
    };
    const table = shippingTable((name) => settings[name]);
    expect(table).toEqual({ near: 950, far: 1275, north: TABLE_CENTS.north, us: TABLE_CENTS.us });
    expect(tableQuote({ country: "CA", postalCode: "M5V 2T6" }, table)!.amount).toBe(950);
    expect(shippingTable(() => undefined)).toEqual(TABLE_CENTS);
  });

  it("reads prices as dollars, with or without a $", () => {
    expect(settingCents("12")).toBe(1200);
    expect(settingCents(" $7.5 ")).toBe(750);
    expect(settingCents("7.505")).toBeNull();
    expect(settingCents("-3")).toBeNull();
    expect(settingCents(undefined)).toBeNull();
  });

  it("reads the duty and free-shipping settings, with defaults", () => {
    expect(shippingRules(() => undefined)).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.freeOverCents).toBeNull(); // free shipping is off until it's set
    const set: Record<string, string> = { SHIPPING_US_DUTY_PERCENT: "9.5%", SHIPPING_US_DUTY_FEE: "$2", SHIPPING_FREE_OVER: "75" };
    expect(shippingRules((n) => set[n])).toEqual({ usDutyPercent: 9.5, usDutyFeeCents: 200, freeOverCents: 7500, freeMaxCents: 1500 });
    expect(shippingRules((n) => ({ SHIPPING_FREE_MAX: "12.50" })[n]).freeMaxCents).toBe(1250);
    expect(shippingRules((n) => ({ SHIPPING_FREE_MAX: " None " })[n]).freeMaxCents).toBeNull();
    const bad: Record<string, string> = { SHIPPING_US_DUTY_PERCENT: "lots", SHIPPING_US_DUTY_FEE: "x", SHIPPING_FREE_OVER: "0", SHIPPING_FREE_MAX: "cheap" };
    expect(shippingRules((n) => bad[n])).toEqual(DEFAULT_RULES);
    expect(shippingRules((n) => (n === "SHIPPING_US_DUTY_PERCENT" ? "150" : undefined)).usDutyPercent).toBe(10);
  });

  it("adds the US duties on the order's value, plus the fees", async () => {
    const rules = { usDutyPercent: 10, usDutyFeeCents: 210, freeOverCents: 7500, freeMaxCents: 1500 };
    expect(usDutyCents(rules, 4000)).toBe(610);
    expect(usDutyCents(rules, 12000)).toBe(1410);
    const us = { country: "US", postalCode: "10001" };
    expect(await quoteShipping(us, 1, { parcel: PARCEL, table: TABLE_CENTS, rules }, 4000)).toEqual({
      amount: TABLE_CENTS.us + 610,
      label: "Shipping and import duties",
      minDays: 4,
      maxDays: 10,
      source: "table",
    });
    // Free shipping is for Canada only: a big US order still pays shipping and duties.
    expect(await quoteShipping(us, 3, { parcel: PARCEL, table: TABLE_CENTS, rules }, 12000)).toMatchObject({ amount: TABLE_CENTS.us + 1410 });
    // Canadian orders pay no duties.
    expect(await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: PARCEL, rules }, 4000)).toMatchObject({
      amount: TABLE_CENTS.near,
      label: "Tracked shipping",
    });
  });

  it("ships Canadian orders free from the amount set, packing charge included", async () => {
    const rules = { ...DEFAULT_RULES, freeOverCents: 7500 };
    const parcel = { ...PARCEL, handlingCents: 150 };
    const to = { country: "CA", postalCode: "V6B 1A1" };
    expect(await quoteShipping(to, 1, { parcel, rules }, 7499)).toMatchObject({ amount: TABLE_CENTS.far + 150 });
    expect(await quoteShipping(to, 2, { parcel, rules }, 7500)).toMatchObject({ amount: 0, label: "Free tracked shipping", source: "table" });
    expect(await quoteShipping(to, 2, { parcel, rules: DEFAULT_RULES }, 20000)).toMatchObject({ amount: TABLE_CENTS.far + 150 });
    // Free shipping doesn't wait on Canada Post.
    const unused = vi.fn();
    expect(await quoteShipping(to, 2, { parcel, rules, canadaPost: CP, fetch: unused }, 8000)).toMatchObject({ amount: 0 });
    expect(unused).not.toHaveBeenCalled();
  });

  it("only ships free where shipping costs under the limit ($15 by default)", async () => {
    const rules = { ...DEFAULT_RULES, freeOverCents: 7500 };
    const north = { country: "CA", postalCode: "Y1A 1B2" }; // Whitehorse: $15
    expect(await quoteShipping(north, 2, { parcel: PARCEL, rules }, 8000)).toMatchObject({ amount: TABLE_CENTS.north, label: "Tracked shipping" });
    expect(await quoteShipping({ country: "CA", postalCode: "M5V 3L9" }, 2, { parcel: PARCEL, rules }, 8000)).toMatchObject({ amount: 0 });
    // The packing charge counts towards the limit: $14 + $1 isn't under $15.
    const table = { ...TABLE_CENTS, north: 1400 };
    expect(await quoteShipping(north, 2, { parcel: PARCEL, table, rules }, 8000)).toMatchObject({ amount: 0 });
    expect(await quoteShipping(north, 2, { parcel: { ...PARCEL, handlingCents: 100 }, table, rules }, 8000)).toMatchObject({ amount: 1500 });
    // No limit: everywhere in Canada.
    expect(await quoteShipping(north, 2, { parcel: PARCEL, rules: { ...rules, freeMaxCents: null } }, 8000)).toMatchObject({ amount: 0 });
  });

  it("names where free shipping reaches", () => {
    const rules = { ...DEFAULT_RULES, freeOverCents: 7500 };
    expect(freeShippingArea(DEFAULT_RULES)).toBeNull(); // off
    expect(freeShippingArea(rules)).toBe("Canada, except the territories");
    expect(freeShippingArea({ ...rules, freeMaxCents: null })).toBe("Canada");
    expect(freeShippingArea({ ...rules, freeMaxCents: 850 })).toBe("Ontario and Quebec");
    expect(freeShippingArea({ ...rules, freeMaxCents: 1500 }, TABLE_CENTS, 600)).toBe("Ontario and Quebec");
    expect(freeShippingArea({ ...rules, freeMaxCents: 500 })).toBeNull();
  });

  it("uses the region prices from the settings at checkout", async () => {
    const table = { near: 800, far: 1100, north: 2000, us: 900 };
    expect(await quoteShipping({ country: "US", postalCode: "10001" }, 2, { parcel: { ...PARCEL, handlingCents: 100 }, table })).toMatchObject({
      source: "table",
      amount: 1000,
      label: "Tracked shipping to the US",
    });
  });
});

describe("Canada Post rates", () => {
  it("asks for the right service, parcel and addresses", () => {
    expect(rateRequest(CP, PARCEL, "CA", "V6B1A1", 2)).toEqual({
      customerNumber: "0001234567",
      quoteType: "commercial",
      // A 10 x 10 x 6 cm box is smaller than Canada Post's minimum parcel, so it's priced as 23 x 20 x 6.
      parcelCharacteristics: { weight: 0.14, dimensions: { length: 23, width: 20, height: 6 } },
      services: ["DOM.EP"],
      originPostalCode: "K1R6A1",
      destination: { domestic: { postalCode: "V6B1A1" } },
    });
    expect(rateRequest(CP, PARCEL, "US", "10001", 1)).toMatchObject({
      services: ["USA.TP"],
      parcelCharacteristics: { dimensions: { length: 10, width: 10, height: 6 } },
      destination: { unitedStates: { zipCode: "10001" } },
    });
    expect(quotedCm({ ...PARCEL, cm: [2, 30, 18] }, "CA")).toEqual([30, 20, 2.5]);
    expect(parcelKg(PARCEL, 0)).toBe(0.11); // never weighs less than one Lumi
  });

  it("reads the price before tax and the transit time", () => {
    expect(parseRateResponse(RESPONSE, "DOM.EP")).toEqual({ cents: 1131, transitDays: 2 });
    expect(parseRateResponse(RESPONSE, "USA.TP")).toBeNull();
    expect(parseRateResponse({ title: "Validation failed", errors: [{ errorCode: "9111" }] }, "DOM.EP")).toBeNull();
    expect(parseRateResponse(null, "DOM.EP")).toBeNull();
  });

  it("gets a token with the key and secret, then uses Canada Post's price plus any packing charge", async () => {
    const fetch = canadaPost(() => json(RESPONSE));
    const q = await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: { ...PARCEL, handlingCents: 150 }, canadaPost: CP, fetch });
    expect(q).toEqual({ amount: 1281, label: "Canada Post Expedited Parcel", minDays: 2, maxDays: 4, source: "canada_post" });
    const [tokenUrl, tokenInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe(CP_TOKEN_URL);
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("key:secret").toString("base64")}`);
    expect(String(tokenInit.body)).toBe("grant_type=client_credentials&scope=merchant");
    const [rateUrl, rateInit] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(rateUrl).toBe(CP_RATES_URL);
    expect((rateInit.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(rateInit.body))).toMatchObject({ customerNumber: "0001234567", destination: { domestic: { postalCode: "K1A0B1" } } });
  });

  it("reuses the token, and gets a new one after a 401", async () => {
    let status = 200;
    const fetch = canadaPost(() => (status === 200 ? json(RESPONSE) : json([{ httpCode: 401 }], 401)));
    const to = { country: "CA", postalCode: "K1A 0B1" };
    const tokens = () => fetch.mock.calls.filter(([u]) => String(u) === CP_TOKEN_URL).length;
    await quoteShipping(to, 1, { parcel: PARCEL, canadaPost: CP, fetch });
    await quoteShipping(to, 1, { parcel: PARCEL, canadaPost: CP, fetch });
    expect(tokens()).toBe(1);
    status = 401;
    expect(await quoteShipping(to, 1, { parcel: PARCEL, canadaPost: CP, fetch, log: () => {} })).toMatchObject({ source: "table" });
    status = 200;
    expect(await quoteShipping(to, 1, { parcel: PARCEL, canadaPost: CP, fetch })).toMatchObject({ source: "canada_post" });
    expect(tokens()).toBe(2);
  });

  it("falls back to the table when Canada Post fails or isn't set up", async () => {
    const log = vi.fn();
    const down = canadaPost(() => json({ title: "Server error" }, 500));
    expect(await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: PARCEL, canadaPost: CP, fetch: down, log })).toMatchObject({ source: "table", amount: TABLE_CENTS.near });
    const throws = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await quoteShipping({ country: "US", postalCode: "10001" }, 1, { parcel: PARCEL, canadaPost: CP, fetch: throws, log })).toMatchObject({ source: "table", amount: TABLE_CENTS.us });
    const badKey = vi.fn(async () => json({ error: "invalid_client" }, 401));
    expect(await quoteShipping({ country: "CA", postalCode: "K1A 0B1" }, 1, { parcel: PARCEL, canadaPost: CP, fetch: badKey, log })).toMatchObject({ source: "table" });
    expect(log).toHaveBeenCalledTimes(3);
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

describe("the admin's Canada Post check", () => {
  it("shows each sample address's price, or Canada Post's reason for refusing", async () => {
    const good = await checkCanadaPost(CP, { ...PARCEL, handlingCents: 150 }, canadaPost(() => json(RESPONSE)));
    expect(good[0]).toEqual({ place: "Ottawa, ON", service: "Canada Post Expedited Parcel", ok: true, cents: 1131, checkoutCents: 1281, transitDays: 2 });
    expect(good.find((r) => r.place.includes("US"))).toMatchObject({ ok: false, error: expect.stringMatching(/no USA\.TP price/) });

    forgetCanadaPostToken();
    const refused = vi.fn(async () => json({ error: "unauthorized_client", error_description: "Invalid client ID or secret, or client not subscribed to this API" }, 401));
    const bad = await checkCanadaPost(CP, PARCEL, refused);
    expect(bad[0]).toMatchObject({ ok: false, error: "Canada Post refused the API key and secret (401): Invalid client ID or secret, or client not subscribed to this API" });
    expect(bad[0]!.ok === false && bad[0]!.error).not.toContain("secret\"");

    forgetCanadaPostToken();
    const invalid = canadaPost(() => json({ title: "Validation failed", errors: [{ errorCode: "9111", message: "No services are appropriate." }] }, 400));
    expect((await checkCanadaPost(CP, PARCEL, invalid))[0]).toMatchObject({ ok: false, error: "Canada Post wouldn't price it (400): No services are appropriate. (9111)" });
  });
});

describe("telling Canada Post's refusals apart", () => {
  it("asks for a counter price without the customer number", () => {
    const r = rateRequest(CP, PARCEL, "CA", "K1A0B1", 1, true);
    expect(r).not.toHaveProperty("customerNumber");
    expect(r).toMatchObject({ quoteType: "counter", services: ["DOM.RP"] });
    expect(rateRequest(CP, PARCEL, "CA", "K1A0B1", 1)).toMatchObject({ quoteType: "commercial", services: ["DOM.EP"] });
  });

  it("shows the headers when Canada Post answers with nothing", async () => {
    const empty = canadaPost(() => new Response("", { status: 403, headers: { "x-global-transaction-id": "abc123" } }));
    const [first] = await checkCanadaPost(CP, PARCEL, empty);
    expect(first).toMatchObject({ ok: false, error: expect.stringMatching(/^Canada Post wouldn't price it \(403\): no message \(.*x-global-transaction-id: abc123\)$/) });
  });

  it("flags a customer number that only fails for discounted prices", async () => {
    const fetch = canadaPost(() => json([], 403));
    fetch.mockImplementation(async (url, init) => {
      if (String(url) === CP_TOKEN_URL) return json({ access_token: "tok", expires_in: 3600 });
      return JSON.parse(String(init?.body)).customerNumber
        ? new Response("", { status: 403 })
        : json([{ ...RESPONSE[0], serviceCode: "DOM.RP", serviceName: "Regular Parcel" }]);
    });
    const results = await checkCanadaPost(CP, PARCEL, fetch);
    expect(results.filter((r) => !r.counter).every((r) => !r.ok)).toBe(true);
    expect(results.find((r) => r.counter)).toMatchObject({ ok: true, cents: 1131, service: "Canada Post Regular Parcel" });
  });
});
