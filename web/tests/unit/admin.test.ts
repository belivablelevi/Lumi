import { describe, expect, it } from "vitest";
import { SESSION_MS, passwordMatches, signSession, verifySession } from "@/lib/admin-auth";
import { lumiNames, orderShippedEmail } from "@/lib/email";
import { addressLines, ordersCsv, shippingAddress, trackingUrl } from "@/lib/fulfilment";
import type { Order } from "@/lib/store/types";

const PW = "correct horse battery staple";

const order = (over: Partial<Order> = {}): Order => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "paid",
  fulfilment: "preorder",
  currency: "CAD",
  subtotal: 11800,
  items: [{ sku: "LUMI-POCKET-01", slug: "pocket-lumi", name: "Pocket Lumi", qty: 2, unitAmount: 5900 }],
  createdAt: "2026-11-01T12:00:00Z",
  reservationExpiresAt: "2026-11-01T12:30:00Z",
  email: "sam@example.com",
  customerName: "Sam",
  shipping: { name: "Sam Lee", address: { line1: "1 Main St", line2: null, city: "Ottawa", state: "ON", postal_code: "K1A 0A1", country: "CA" } },
  paidAt: "2026-11-01T12:05:00Z",
  ...over,
});

describe("admin sessions", () => {
  it("accepts its own token until it expires", () => {
    const now = Date.now();
    const t = signSession(PW, now);
    expect(verifySession(t, PW, now)).toBe(true);
    expect(verifySession(t, PW, now + SESSION_MS - 1000)).toBe(true);
    expect(verifySession(t, PW, now + SESSION_MS + 1)).toBe(false);
  });

  it("rejects tampered tokens, other passwords and junk", () => {
    const now = Date.now();
    const t = signSession(PW, now);
    const [exp, sig] = t.split(".");
    expect(verifySession(`${Number(exp) + 1000}.${sig}`, PW, now)).toBe(false);
    expect(verifySession(`${exp}.${sig!.slice(0, -2)}AA`, PW, now)).toBe(false);
    expect(verifySession(t, "another password", now)).toBe(false);
    expect(verifySession(t, undefined, now)).toBe(false);
    for (const junk of [undefined, "", ".", "abc.def", `${exp}`, `${exp}.${sig}.x`]) expect(verifySession(junk, PW, now)).toBe(false);
    // An expiry far in the future wasn't made by signSession.
    expect(verifySession(signSession(PW, now + 10 * SESSION_MS), PW, now)).toBe(false);
  });

  it("checks the password exactly", () => {
    expect(passwordMatches(PW, PW)).toBe(true);
    expect(passwordMatches(PW + " ", PW)).toBe(false);
    expect(passwordMatches("", PW)).toBe(false);
    expect(passwordMatches(PW, undefined)).toBe(false);
  });
});

describe("fulfilment helpers", () => {
  it("reads Stripe's shipping details into label lines", () => {
    expect(addressLines(shippingAddress(order()))).toEqual(["Sam Lee", "1 Main St", "Ottawa ON K1A 0A1", "CA"]);
    expect(shippingAddress(order({ shipping: undefined })).name).toBe("Sam");
  });

  it("links tracking pages only for carriers and numbers it knows", () => {
    expect(trackingUrl("canada_post", "1234 5678 9012 3456")).toBe("https://www.canadapost-postescanada.ca/track-reperage/en#/details/1234567890123456");
    expect(trackingUrl("chit_chats", "ABC123")).toBe("https://chitchats.com/tracking/ABC123");
    expect(trackingUrl("ups", "1Z 999 AA1 01 2345 6784")).toBe("https://www.ups.com/track?loc=en_CA&tracknum=1Z999AA10123456784");
    expect(trackingUrl("stallion", "ABC123")).toBeNull(); // no public link yet: the email shows the number
    expect(trackingUrl("other", "ABC123")).toBeNull();
    expect(trackingUrl("canada_post", "<script>")).toBeNull();
    expect(trackingUrl("canada_post", undefined)).toBeNull();
  });

  it("writes a CSV that survives commas, quotes and spreadsheet formulas", () => {
    const csv = ordersCsv([
      order({ unitNames: "Starla, Kipo" }),
      order({ id: "22222222-2222-4222-8222-222222222222", shipping: { name: '=HYPERLINK("x")', address: { line1: 'Unit "B"', city: "Ottawa" } } }),
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toMatch(/^order_id,name,address_1,address_2,city,province_code,postal_code,country_code,/);
    expect(lines[1]).toBe('11111111,Sam Lee,1 Main St,,Ottawa,ON,K1A 0A1,CA,sam@example.com,2,Pocket Lumi,59.00,CAD,"Starla, Kipo",no');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain('"Unit ""B"""');
  });
});

describe("shipped email", () => {
  it("has the tracking link and how to wake Lumi", () => {
    const m = orderShippedEmail(order({ carrier: "canada_post", trackingNumber: "1234567890123456" }));
    expect(m.to).toBe("sam@example.com");
    expect(m.subject).toMatch(/has shipped/);
    expect(m.text).toContain("Tracking number (Canada Post): 1234567890123456");
    expect(m.text).toContain("https://www.canadapost-postescanada.ca/track-reperage/en#/details/1234567890123456");
    expect(m.text).toMatch(/tap its screen three times/);
    expect(m.html).toContain("Track your parcel");
    expect(m.html).toContain('/email-logo.png" width="40" height="40"');
  });

  it("names the Lumi only when asked, without serials", () => {
    const o = order({ carrier: "canada_post", trackingNumber: "1234567890123456", unitNames: "Starla (LUMI-000421)" });
    expect(orderShippedEmail(o).subject).toMatch(/has shipped/);
    expect(orderShippedEmail(o).text).not.toContain("Starla");
    const m = orderShippedEmail(o, { includeNames: true });
    expect(m.subject).toBe("Starla is on their way!");
    expect(m.text).toContain("Starla has left the nest and is on their way to you.");
    expect(m.text + m.html).not.toContain("LUMI-000421");
    expect(orderShippedEmail(order({ unitNames: "Starla, Pip LUMI-000422, Kipo" }), { includeNames: true }).subject).toBe(
      "Starla, Pip and Kipo are on their way!",
    );
    expect(orderShippedEmail(order({ unitNames: "<b>Pip</b>" }), { includeNames: true }).html).not.toContain("<b>Pip");
    // Nothing usable in the box: the usual email.
    expect(orderShippedEmail(order({ unitNames: "(LUMI-000423)" }), { includeNames: true }).subject).toMatch(/has shipped/);
    expect(lumiNames("  Starla ;  Pip [spare] ")).toEqual(["Starla", "Pip"]);
  });

  it("still makes sense without a tracking number", () => {
    const m = orderShippedEmail(order({ carrier: "other", trackingNumber: undefined }));
    expect(m.text).toContain("It's on its way.");
    expect(m.text).not.toContain("Other");
    expect(m.html).not.toContain("Track your parcel");
  });
});
