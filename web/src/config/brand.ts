import type { Maybe } from "@/lib/placeholder";
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
  /** Search results and link previews: say plainly what Snaggo is and makes. */
  description:
    "Snaggo is a small Canadian company making Lumi, a keychain companion with a glowing face that reacts when you pat, tilt or shake it. Every Lumi has its own personality.",
  /** The plain facts, for search engines and AI assistants (structured data and /llms.txt). */
  about:
    "Snaggo is a small company based in Ottawa, Ontario, Canada. It designs and makes Lumi, a keychain-sized companion with a tiny glowing screen for a face. Lumi reacts when you pat, shake, tilt or pick it up, has moods that change over time, and gets its own randomly chosen look and temperament when it's made. Lumi hasn't launched yet: the first run is in development, and people can sign up to hear when pre-orders open.",
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
    email: "snaggotech@gmail.com" as Maybe<string>,
  },

  /** Required in every marketing email under CASL. Signups stay closed until it's set. */
  legal: {
    businessName: "Snaggo-1223" as Maybe<string>,
    mailingAddress: "322 Bay St, Ottawa, ON K1R 6A1" as Maybe<string>,
  },

  /** Pre-order and in-stock items in one cart? Off: they check out separately. */
  allowMixedCarts: false,
} as const;

export type Brand = typeof brand;
