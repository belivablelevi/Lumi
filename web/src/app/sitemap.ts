import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { listedProducts } from "@/lib/catalogue";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/shop", "/pocket", "/desk", "/our-world", "/launches", "/faq", "/contact", "/shipping-returns", "/privacy", "/terms"];
  return [
    ...pages.map((p) => ({ url: `${brand.siteUrl}${p}` })),
    ...listedProducts().map((p) => ({ url: `${brand.siteUrl}/products/${p.slug}` })),
  ];
}
