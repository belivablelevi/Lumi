import { brand } from "@/config/brand";
import { products, type Product } from "@/content/products";
import { demoMode } from "./env";
import { catalogueProblems, isListed } from "./product-state";

/**
 * The demo catalogue opens the Pocket Lumi for pre-order with an obviously
 * fake price, so the cart and Stripe test-mode checkout can be tried on
 * local and preview deployments. It's refused in production (see env.ts).
 */
function demoProducts(): Product[] {
  return products.map((p) =>
    p.slug !== "pocket-lumi"
      ? p
      : {
          ...p,
          status: "preorder",
          demo: true,
          price: { amount: 4900, currency: brand.currency },
          preorder: {
            dispatchWindow: "Demo only: no real dispatch window",
            paymentTiming: "Demo only: Stripe test mode, no real payment is taken",
            cancellation: "Demo only",
            delays: "Demo only",
          },
        },
  );
}

let cached: Product[] | undefined;

export function getCatalogue(): Product[] {
  if (!cached) {
    const list = demoMode() ? demoProducts() : products;
    const problems = catalogueProblems(list);
    if (problems.length) throw new Error(`Catalogue problems:\n${problems.join("\n")}`);
    cached = list;
  }
  return cached;
}

export const listedProducts = () => getCatalogue().filter(isListed);
export const productBySlug = (slug: string) => getCatalogue().find((p) => p.slug === slug && isListed(p));
export const productBySku = (sku: string) => getCatalogue().find((p) => p.sku === sku);
