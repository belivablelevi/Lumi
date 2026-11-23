import { describe, expect, it } from "vitest";
import { TABLE_CENTS, normalPostal, parcelKg, quoteShipping, settingCents, shippingRules, shippingTable, tableQuote, usDutyCents, DEFAULT_RULES, freeShippingArea, type ParcelConfig } from "@/lib/shipping";

const PARCEL: ParcelConfig = { boxKg: 0.08, unitKg: 0.03, cm: [10, 10, 6], handlingCents: 0, fromPostalCode: "K1R 6A1" };
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
    expect(await quoteShipping(to, 2, { parcel, rules }, 8000)).toMatchObject({ amount: 0 });
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

describe("the parcel and where it goes", () => {
  it("never weighs less than one Lumi", () => {
    expect(parcelKg(PARCEL, 0)).toBe(0.11);
    expect(parcelKg(PARCEL, 2)).toBe(0.14);
  });

  it("won't quote where it doesn't ship", async () => {
    expect(await quoteShipping({ country: "FR", postalCode: "75001" }, 1, { parcel: PARCEL })).toBeNull();
  });
});
