import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/cart", "/checkout/", "/signup/", "/unsubscribe"] },
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}
