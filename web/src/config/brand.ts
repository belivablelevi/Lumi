import { tbc, type Maybe } from "@/lib/placeholder";
import { siteUrl } from "@/lib/site-url";

/**
 * Everything brand-level in one place. Snaggo is the company and site; Lumi is
 * the product, so product wording says Lumi directly instead of using `name`.
 * The logo lives in components/brand/Mark.tsx and public/icon.svg.
 */
export const brand = {
  name: "Snaggo",
  tagline: "Little companions. Big personality.",
  headline: "A little personality. A lot of feeling.",
  description:
    "Meet Lumi from Snaggo: expressive little companions made to travel with you, live on your desk, and make everyday moments a little more fun.",
  locale: "en-CA",
  currency: "CAD" as const,
  siteUrl: siteUrl(),

  announcement: {
    enabled: true,
    id: "next-generation-2026", // change the id to show a dismissed bar again
    text: "Meet the next generation of little companions.",
    href: "/launches",
    linkText: "See what's coming",
  },

  nav: [
    { label: "Shop", href: "/shop" },
    { label: "Pocket Lumis", href: "/pocket" },
    { label: "Desk Lumis", href: "/desk" },
    { label: "Our World", href: "/our-world" },
    { label: "Launches", href: "/launches" },
  ],

  footer: {
    columns: [
      {
        title: "Shop",
        links: [
          { label: "All Lumis", href: "/shop" },
          { label: "Pocket Lumis", href: "/pocket" },
          { label: "Desk Lumis", href: "/desk" },
          { label: "Launches", href: "/launches" },
        ],
      },
      {
        title: "Snaggo",
        links: [
          { label: "Our World", href: "/our-world" },
          { label: "FAQ", href: "/faq" },
          { label: "Contact", href: "/contact" },
        ],
      },
      {
        title: "Help",
        links: [
          { label: "Shipping and Returns", href: "/shipping-returns" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
        ],
      },
    ],
    // Add real profile URLs to show them. Empty entries are hidden.
    socials: [
      { label: "Instagram", href: "" },
      { label: "TikTok", href: "" },
      { label: "YouTube", href: "" },
    ],
  },

  contact: {
    email: tbc("Support email address") as Maybe<string>,
  },

  /** Required in every marketing email under CASL. Signups stay closed until it's set. */
  legal: {
    businessName: tbc("Registered business name") as Maybe<string>,
    mailingAddress: tbc("Mailing address for CASL sender identification") as Maybe<string>,
  },

  /** Pre-order and in-stock items in one cart? Off: they check out separately. */
  allowMixedCarts: false,
} as const;

export type Brand = typeof brand;
