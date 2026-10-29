import { z } from "zod";
import type { Product } from "@/content/products";
import { checkCart, MAX_LINES } from "./cart";
import type { Payments } from "./payments";
import type { Order, Store } from "./store/types";

/** What the browser may send: product identifiers and quantities. Anything else is ignored. */
export const checkoutRequest = z.object({
  lines: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        variantId: z.string().min(1).max(80).optional(),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(MAX_LINES),
});

/** Stripe needs at least 30 minutes; capacity stays reserved for as long as the session can be paid. */
export const RESERVATION_MINUTES = 31;

export type CheckoutResult = { ok: true; url: string; orderId: string } | { ok: false; status: number; error: string };

export interface CheckoutDeps {
  catalogue: Product[];
  store: Store;
  payments: Payments;
  siteUrl: string;
  allowMixed: boolean;
  now?: () => Date;
  newId?: () => string;
}

export async function startCheckout(input: unknown, deps: CheckoutDeps): Promise<CheckoutResult> {
  const parsed = checkoutRequest.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "That cart doesn't look right. Please refresh and try again." };

  // Prices, statuses and limits come from the server's catalogue, not the request.
  const check = checkCart(parsed.data.lines, deps.catalogue, deps.allowMixed);
  if (check.problems.length || !check.subtotal || !check.fulfilment || check.fulfilment === "mixed") {
    return { ok: false, status: 409, error: check.problems[0] ?? "This cart can't be checked out." };
  }

  const now = deps.now?.() ?? new Date();
  const order: Order = {
    id: deps.newId?.() ?? crypto.randomUUID(),
    status: "pending",
    fulfilment: check.fulfilment,
    currency: check.subtotal.currency,
    subtotal: check.subtotal.amount,
    createdAt: now.toISOString(),
    reservationExpiresAt: new Date(now.getTime() + RESERVATION_MINUTES * 60_000).toISOString(),
    items: check.items.map((i) => ({
      sku: i.product.sku,
      slug: i.product.slug,
      name: i.product.name,
      ...(i.line.variantId ? { variantId: i.line.variantId } : {}),
      qty: i.line.qty,
      unitAmount: i.unit.amount,
    })),
  };

  const reserved = await deps.store.createOrder(order);
  if (!reserved.ok) {
    const name = check.items.find((i) => i.product.sku === reserved.sku)?.product.name ?? "An item";
    return reserved.reason === "insufficient"
      ? { ok: false, status: 409, error: `${name} doesn't have enough left for this order.` }
      : { ok: false, status: 409, error: `${name} isn't open for orders yet.` };
  }

  try {
    const session = await deps.payments.createSession(order, {
      success: `${deps.siteUrl}/checkout/success?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel: `${deps.siteUrl}/checkout/cancel?order=${order.id}`,
    });
    await deps.store.attachSession(order.id, session.id);
    return { ok: true, url: session.url, orderId: order.id };
  } catch (e) {
    await deps.store.releaseOrder(order.id, "failed");
    console.error("checkout session failed", e);
    return { ok: false, status: 502, error: "We couldn't start checkout. Please try again in a moment." };
  }
}
