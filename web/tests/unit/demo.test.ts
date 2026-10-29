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

  it("reports which services are missing", async () => {
    const { serviceStatus } = await import("@/lib/env");
    const s = serviceStatus();
    expect(s.checkout).toBe(false);
    expect(s.missing.checkout).toContain("STRIPE_SECRET_KEY");
    expect(s.missing.signup).toContain("brand.legal.mailingAddress (src/config/brand.ts)");
  });
});
