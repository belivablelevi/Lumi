import type { Product } from "@/content/products";
import { confirmed } from "./placeholder";

export const STATUSES = ["draft", "coming_soon", "preorder", "available", "sold_out", "archived"] as const;
export type ProductStatus = (typeof STATUSES)[number];

/** Allowed status changes. Anything else is a mistake in the catalogue. */
export const TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  draft: ["coming_soon", "preorder", "available", "archived"],
  coming_soon: ["preorder", "available", "draft", "archived"],
  preorder: ["available", "sold_out", "coming_soon", "archived"],
  available: ["sold_out", "archived"],
  sold_out: ["available", "preorder", "archived"],
  archived: ["draft"],
};

export function canTransition(from: ProductStatus, to: ProductStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Draft",
  coming_soon: "Coming soon",
  preorder: "Pre-order",
  available: "Available now",
  sold_out: "Sold out",
  archived: "Archived",
};

/** Shown to visitors at all? (drafts and archived products are not). */
export const isListed = (p: Product) => p.status !== "draft" && p.status !== "archived";

/** Can a new order be placed right now (before stock or capacity checks)? */
export const isOrderable = (p: Product) => p.status === "preorder" || p.status === "available";

export type Cta =
  | { kind: "add"; label: string }
  | { kind: "notify"; label: string; href: string }
  | { kind: "none"; label: string };

export function ctaFor(p: Product): Cta {
  switch (p.status) {
    case "preorder":
      return { kind: "add", label: "Pre-order your Lumi" };
    case "available":
      return { kind: "add", label: "Add to cart" };
    case "coming_soon":
      return { kind: "notify", label: "Notify me", href: `/launches${p.launchId ? `#${p.launchId}` : ""}` };
    case "sold_out":
      return { kind: "notify", label: "Sold out: get notified", href: "/launches" };
    default:
      return { kind: "none", label: "Not available" };
  }
}

/**
 * Catalogue invariants: a product can't be sold without a confirmed price,
 * and can't take pre-orders without confirmed pre-order terms.
 */
export function catalogueProblems(products: Product[]): string[] {
  const out: string[] = [];
  const slugs = new Set<string>();
  for (const p of products) {
    if (slugs.has(p.slug)) out.push(`${p.slug}: duplicate slug`);
    slugs.add(p.slug);
    if (isOrderable(p) && !confirmed(p.price)) out.push(`${p.slug}: ${p.status} needs a confirmed price`);
    if (p.status === "preorder" && !confirmed(p.preorder)) out.push(`${p.slug}: pre-order needs confirmed terms`);
    if (confirmed(p.price) && confirmed(p.price)!.amount <= 0) out.push(`${p.slug}: price must be positive`);
    if (p.maxPerOrder < 1) out.push(`${p.slug}: maxPerOrder must be at least 1`);
  }
  return out;
}
