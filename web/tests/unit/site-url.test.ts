import { describe, expect, it } from "vitest";
import { publicSiteUrl, siteUrl } from "@/lib/site-url";

describe("siteUrl", () => {
  it("prefers the explicit setting", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://snaggo.tech/", VERCEL_URL: "x.vercel.app" })).toBe("https://snaggo.tech");
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

describe("publicSiteUrl", () => {
  it("never points emails at a preview behind Vercel's login", () => {
    const vercel = { VERCEL_PROJECT_PRODUCTION_URL: "snaggo.tech", VERCEL_BRANCH_URL: "lumi-git-b.vercel.app", VERCEL_ENV: "preview" };
    expect(publicSiteUrl(vercel)).toBe("https://snaggo.tech");
    expect(publicSiteUrl({ ...vercel, NEXT_PUBLIC_SITE_URL: "https://www.snaggo.tech" })).toBe("https://www.snaggo.tech");
    expect(publicSiteUrl({})).toBe("http://localhost:3000");
  });
});
