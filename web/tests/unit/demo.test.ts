import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("demo catalogue", () => {
  it("opens a demo pre-order on preview deployments", async () => {
    vi.stubEnv("LUMI_DEMO_CATALOGUE", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const { getCatalogue } = await import("@/lib/catalogue");
    const p = getCatalogue().find((x) => x.slug === "pocket-lumi")!;
    expect(p).toMatchObject({ status: "preorder", demo: true });
  });

  it("is refused in production", async () => {
    vi.stubEnv("LUMI_DEMO_CATALOGUE", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const { getCatalogue } = await import("@/lib/catalogue");
    expect(getCatalogue().find((x) => x.slug === "pocket-lumi")!.status).toBe("coming_soon");
  });

  it("runs on production only with the second opt-in, and never with a live Stripe key", async () => {
    const { demoAllowed } = await import("@/lib/env");
    const base = { demoCatalogue: true, demoOnProduction: false };
    expect(demoAllowed({ ...base, vercelEnv: "preview" })).toBe(true);
    expect(demoAllowed({ ...base })).toBe(true); // local
    expect(demoAllowed({ ...base, vercelEnv: "production" })).toBe(false);
    expect(demoAllowed({ ...base, demoOnProduction: true, vercelEnv: "production" })).toBe(true);
    expect(demoAllowed({ ...base, demoOnProduction: true, vercelEnv: "production", stripeSecretKey: "sk_test_x" })).toBe(true);
    for (const key of ["sk_live_x", "rk_live_x"]) {
      expect(demoAllowed({ ...base, demoOnProduction: true, vercelEnv: "production", stripeSecretKey: key })).toBe(false);
      expect(demoAllowed({ ...base, vercelEnv: "preview", stripeSecretKey: key })).toBe(false);
    }
    expect(demoAllowed({ demoCatalogue: false, demoOnProduction: true, vercelEnv: "production" })).toBe(false);
  });

  it("opens on production with the opt-in", async () => {
    vi.stubEnv("LUMI_DEMO_CATALOGUE", "1");
    vi.stubEnv("LUMI_DEMO_ON_PRODUCTION", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const { getCatalogue } = await import("@/lib/catalogue");
    expect(getCatalogue().find((x) => x.slug === "pocket-lumi")!.demo).toBe(true);
  });

  it("reports which services are missing", async () => {
    const { serviceStatus } = await import("@/lib/env");
    const s = serviceStatus();
    expect(s.checkout).toBe(false);
    expect(s.missing.checkout).toContain("STRIPE_SECRET_KEY");
    expect(s.missing.signup).toContain("brand.legal.mailingAddress (src/config/brand.ts)");
  });
});
