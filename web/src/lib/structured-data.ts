import { brand } from "@/config/brand";
import { confirmed } from "@/lib/placeholder";

/**
 * Structured data (schema.org JSON-LD): tells search engines and AI assistants
 * plainly what Snaggo is, so they can recognise it as a company and Lumi as its product.
 */

const url = (path = "") => `${brand.siteUrl}${path}`;
const socials = () => brand.footer.socials.map((s) => s.href).filter(Boolean);

export function organizationLd() {
  const email = confirmed(brand.contact.email);
  const legalName = confirmed(brand.legal.businessName);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url("/#organization"),
    name: brand.name,
    legalName: legalName ?? undefined,
    url: url(),
    logo: url("/logo.png"),
    description: brand.about,
    foundingLocation: { "@type": "Place", name: "Ottawa, Ontario, Canada" },
    areaServed: "CA",
    brand: { "@type": "Brand", name: "Lumi" },
    email: email ?? undefined,
    sameAs: socials().length ? socials() : undefined,
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": url("/#website"),
    name: brand.name,
    url: url(),
    inLanguage: brand.locale,
    publisher: { "@id": url("/#organization") },
  };
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** A <script> body that can't close its own tag. */
export const jsonLdHtml = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
