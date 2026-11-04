import { z } from "zod";
import type { Product } from "@/content/products";
import { addonsRequest, toAddons } from "./addons";
import { checkCart, MAX_LINES } from "./cart";
import type { Payments } from "./payments";
import type { ShippingQuote, ShipTo } from "./shipping";
import type { Order, Store } from "./store/types";

/** What the browser may send: product identifiers, quantities and its add-on choices. Anything else is ignored. */
export const checkoutRequest = addonsRequest.extend({
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

export type CheckoutResult = { ok: true; clientSecret: string; orderId: string } | { ok: false; status: number; error: string };
type Fail = { ok: false; status: number; error: string };

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
    ...toAddons(parsed.data),
  };

  const reserved = await deps.store.createOrder(order);
  if (!reserved.ok) {
    const name = check.items.find((i) => i.product.sku === reserved.sku)?.product.name ?? "An item";
    return reserved.reason === "insufficient"
      ? { ok: false, status: 409, error: `${name} doesn't have enough left for this order.` }
      : { ok: false, status: 409, error: `${name} isn't open for orders yet.` };
  }

  try {
    const session = await deps.payments.createSession(order, `${deps.siteUrl}/checkout/success?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`);
    await deps.store.attachSession(order.id, session.id);
    return { ok: true, clientSecret: session.clientSecret, orderId: order.id };
  } catch (e) {
    await deps.store.releaseOrder(order.id, "failed");
    console.error("checkout session failed", e);
    return { ok: false, status: 502, error: "We couldn't start checkout. Please try again in a moment." };
  }
}

// ---- while the customer is on the checkout page ------------------------------

const sessionId = z.string().regex(/^cs_[A-Za-z0-9_]{8,200}$/);

/** The open session and its pending order, or why the change can't be made. */
async function openOrder(id: string, deps: { store: Store; payments: Payments }): Promise<{ ok: true; order: Order } | Fail> {
  const session = await deps.payments.getSession(id);
  const order = session?.orderId ? await deps.store.getOrder(session.orderId) : null;
  if (!session || !order || order.stripeSessionId !== session.id) return { ok: false, status: 404, error: "That checkout wasn't found. Please start again from your cart." };
  if (session.status !== "open" || order.status !== "pending") {
    return { ok: false, status: 409, error: "This checkout has ended. Please start again from your cart." };
  }
  return { ok: true, order };
}

export const shippingRequest = z.object({
  sessionId,
  shipping: z.object({
    name: z.string().trim().min(1).max(120),
    address: z.object({
      line1: z.string().trim().min(1).max(200),
      line2: z.string().trim().max(200).nullish(),
      city: z.string().trim().min(1).max(100),
      state: z.string().trim().max(60).nullish(),
      postal_code: z.string().trim().min(3).max(12),
      country: z.string().length(2),
    }),
  }),
});

export interface ShippingDeps {
  store: Store;
  payments: Payments;
  countries: string[];
  quote: (to: ShipTo, units: number) => Promise<ShippingQuote | null>;
}

/** Prices shipping for the address the customer entered and puts both on the session. */
export async function setCheckoutShipping(input: unknown, deps: ShippingDeps): Promise<{ ok: true; quote: ShippingQuote } | Fail> {
  const parsed = shippingRequest.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "Please check the address and try again." };
  const { sessionId: id, shipping } = parsed.data;
  const open = await openOrder(id, deps);
  if (!open.ok) return open;
  const country = shipping.address.country.toUpperCase();
  if (!deps.countries.includes(country)) return { ok: false, status: 422, error: "Sorry, we can't ship there yet." };
  const units = open.order.items.reduce((n, i) => n + i.qty, 0);
  const quote = await deps.quote({ country, postalCode: shipping.address.postal_code }, units);
  if (!quote) return { ok: false, status: 422, error: "That postal code doesn't look right. Please check it." };
  const a = shipping.address;
  await deps.payments.setShipping(
    id,
    {
      name: shipping.name,
      address: { line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, ...(a.state ? { state: a.state } : {}), postal_code: a.postal_code, country },
    },
    quote,
  );
  return { ok: true, quote };
}

export const addonsUpdateRequest = addonsRequest.extend({ sessionId });

/** Changes the tip or shipping protection on an open checkout. */
export async function setCheckoutAddons(input: unknown, deps: { store: Store; payments: Payments }): Promise<{ ok: true } | Fail> {
  const parsed = addonsUpdateRequest.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, error: "That tip doesn't look right." };
  const open = await openOrder(parsed.data.sessionId, deps);
  if (!open.ok) return open;
  const addons = toAddons(parsed.data);
  // Stripe first: if saving the order fails after, the webhook sees the amounts differ and flags it for review.
  await deps.payments.setLineItems(parsed.data.sessionId, { ...open.order, ...addons });
  if (!(await deps.store.updateAddons(open.order.id, addons))) return { ok: false, status: 409, error: "This checkout has ended. Please start again from your cart." };
  return { ok: true };
}
