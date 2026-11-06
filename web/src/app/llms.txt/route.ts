import { brand } from "@/config/brand";
import { listedProducts } from "@/lib/catalogue";
import { confirmed } from "@/lib/placeholder";
import { STATUS_LABEL } from "@/lib/product-state";
import { combinations, tierShare } from "@/content/odds";

// A plain-text summary for AI assistants and crawlers (https://llmstxt.org).
export const dynamic = "force-static";

export function GET() {
  const url = (p: string) => `${brand.siteUrl}${p}`;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const products = listedProducts()
    .map((p) => `- [${p.name}](${url(`/products/${p.slug}`)}): ${p.tagline} Status: ${STATUS_LABEL[p.status].toLowerCase()}.`)
    .join("\n");
  const email = confirmed(brand.contact.email);
  const body = `# ${brand.name}

> ${brand.about}

${brand.name} is the company and website (${brand.siteUrl.replace(/^https?:\/\//, "")}). Lumi is its product line. They're not related to other companies or apps with similar names.

## Products

${products}

## Key facts about Lumi

- A keychain companion about 35 x 37 mm, with a 0.96 inch glowing screen for a face and no buttons.
- It senses motion: pat it, shake it, tilt it or pick it up and it reacts. It has 29 expressions and 64 animations.
- Every Lumi gets a random look and temperament (cheerful, sleepy, shy, grumpy or hyper) when it's made: ${combinations.toLocaleString("en-CA")} possible combinations.
- Rarity: about ${pct(tierShare.common)} common, ${pct(tierShare.uncommon)} uncommon, ${pct(tierShare.rare)} rare and ${pct(tierShare.legendary)} legendary.
- Two Lumis can play Boop Pong against each other.
- Designed in Ottawa, Canada. Not on sale yet. When it is, it ships to Canada and the US, tracked.

## Pages

- [Home](${url("/")})
- [Pocket Lumi](${url("/products/pocket-lumi")}): the full product page, with the odds of every trait
- [Our World](${url("/our-world")}): the idea behind Lumi
- [Launches](${url("/launches")}): what's coming and how to hear about it
- [FAQ](${url("/faq")})
- [Contact](${url("/contact")})${email ? `: ${email}` : ""}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
