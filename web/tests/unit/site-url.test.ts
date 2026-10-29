import { describe, expect, it } from "vitest";
import { siteUrl } from "@/lib/site-url";

describe("siteUrl", () => {
  it("prefers the explicit setting", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://lumi.shop/", VERCEL_URL: "x.vercel.app" })).toBe("https://lumi.shop");
  });
  it("uses the production domain only in production", () => {
    const vercel = { VERCEL_PROJECT_PRODUCTION_URL: "lumi.vercel.app", VERCEL_BRANCH_URL: "lumi-git-b.vercel.app", VERCEL_URL: "lumi-abc.vercel.app" };
    expect(siteUrl({ ...vercel, VERCEL_ENV: "production" })).toBe("https://lumi.vercel.app");
    expect(siteUrl({ ...vercel, VERCEL_ENV: "preview" })).toBe("https://lumi-git-b.vercel.app");
    expect(siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "lumi-abc.vercel.app" })).toBe("https://lumi-abc.vercel.app");
  });
  it("falls back to localhost", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
