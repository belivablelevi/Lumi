import type { Product } from "@/content/products";
import type { CartLine } from "./cart";

/**
 * The personality odds card that goes in the box with every Lumi. The cart
 * shows it as its own free line so buyers see it as a gift. It is display
 * only: it is never a cart line, so it adds nothing to the subtotal, the
 * payment, the shipping weight or the customs lines.
 */
export const ODDS_CARD = {
  name: "Personality odds card",
  note: "The odds of every eye shape, glint, accent and temperament. One comes with each Lumi.",
} as const;

/** One card per Lumi in the cart. Lines the catalogue doesn't know don't count. */
export function oddsCardCount(lines: CartLine[], catalogue: Product[]): number {
  return lines.reduce((n, l) => (catalogue.some((p) => p.slug === l.slug) && Number.isInteger(l.qty) && l.qty > 0 ? n + l.qty : n), 0);
}
