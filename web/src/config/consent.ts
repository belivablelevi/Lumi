import { confirmed } from "@/lib/placeholder";
import { brand } from "./brand";

/** Shown next to every signup checkbox and stored with each signup. Bump the version when the text changes. */
export const CONSENT_VERSION = "2026-11-1";
export const consentText = (brandName: string) =>
  `Yes, email me about ${brandName} launches and news. I can unsubscribe at any time.`;

/** CASL: a request for consent has to say who is asking, with a mailing address and another way to reach them. */
export function consentSender() {
  const business = confirmed(brand.legal.businessName) ?? brand.name;
  const address = confirmed(brand.legal.mailingAddress);
  const email = confirmed(brand.contact.email);
  return [`From ${business}`, address, email].filter(Boolean).join(", ") + ".";
}
