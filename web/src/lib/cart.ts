import type { Product } from "@/content/products";
import { multiply, sum, type Money } from "./money";
import { confirmed } from "./placeholder";
import { isOrderable } from "./product-state";

/** What the browser keeps: identifiers and choices only, never prices. */
export interface CartLine {
  slug: string;
  variantId?: string;
  qty: number;
}

export type Fulfilment = "preorder" | "now";
export const fulfilmentOf = (p: Product): Fulfilment => (p.status === "preorder" ? "preorder" : "now");

export interface ResolvedLine {
  line: CartLine;
  product: Product;
  unit: Money;
  total: Money;
}

export interface CartCheck {
  items: ResolvedLine[];
  problems: string[];
  subtotal: Money | null;
  fulfilment: Fulfilment | "mixed" | null;
}

export const MAX_LINES = 10;

/**
 * Checks a cart against the catalogue. The browser uses this to show
 * problems early; the server runs the same checks on its own trusted copy
 * of the catalogue before creating a checkout session.
 */
export function checkCart(lines: CartLine[], catalogue: Product[], allowMixed: boolean): CartCheck {
  const problems: string[] = [];
  const items: ResolvedLine[] = [];
  if (lines.length === 0) problems.push("Your cart is empty.");
  if (lines.length > MAX_LINES) problems.push(`A cart can hold at most ${MAX_LINES} different items.`);
  const seen = new Set<string>();
  for (const line of lines) {
    const p = catalogue.find((x) => x.slug === line.slug);
    if (!p) {
      problems.push("An item in your cart is no longer available.");
      continue;
    }
    const key = `${line.slug}:${line.variantId ?? ""}`;
    if (seen.has(key)) problems.push(`${p.name} is in your cart twice.`);
    seen.add(key);
    if (!isOrderable(p)) {
      problems.push(`${p.name} can't be ordered right now.`);
      continue;
    }
    if (p.variants.length > 0 && !p.variants.some((v) => v.id === line.variantId)) {
      problems.push(`Choose an option for ${p.name}.`);
      continue;
    }
    if (p.variants.length === 0 && line.variantId) {
      problems.push(`${p.name} doesn't have options.`);
      continue;
    }
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > p.maxPerOrder) {
      problems.push(`You can order 1 to ${p.maxPerOrder} of ${p.name}.`);
      continue;
    }
    const unit = confirmed(p.price);
    if (!unit) {
      problems.push(`${p.name} doesn't have a price yet.`);
      continue;
    }
    items.push({ line, product: p, unit, total: multiply(unit, line.qty) });
  }
  const kinds = new Set(items.map((i) => fulfilmentOf(i.product)));
  const fulfilment = kinds.size === 0 ? null : kinds.size > 1 ? "mixed" : [...kinds][0]!;
  if (fulfilment === "mixed" && !allowMixed) {
    problems.push("Pre-orders and items that ship now check out separately. Remove one kind to continue.");
  }
  const currencies = new Set(items.map((i) => i.unit.currency));
  if (currencies.size > 1) problems.push("Items in different currencies can't be checked out together.");
  const subtotal = items.length && currencies.size === 1 ? sum(items.map((i) => i.total), items[0]!.unit.currency) : null;
  return { items, problems, subtotal, fulfilment };
}
