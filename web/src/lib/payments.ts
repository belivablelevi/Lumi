import Stripe from "stripe";
import { env } from "./env";
import type { Order } from "./store/types";

export interface CheckoutSession {
  id: string;
  url: string;
}

export interface Payments {
  createSession(order: Order, urls: { success: string; cancel: string }): Promise<CheckoutSession>;
}

let stripe: Stripe | null | undefined;
export function getStripe(): Stripe | null {
  if (stripe === undefined) stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
  return stripe;
}

/** Stripe-hosted Checkout. Prices come from the server's order, never from the browser. */
export function stripePayments(s: Stripe): Payments {
  return {
    async createSession(order, urls) {
      const session = await s.checkout.sessions.create(
        {
          mode: "payment",
          client_reference_id: order.id,
          metadata: { order_id: order.id, fulfilment: order.fulfilment },
          payment_intent_data: { metadata: { order_id: order.id } },
          line_items: order.items.map((i) => ({
            quantity: i.qty,
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: i.unitAmount,
              product_data: {
                name: order.fulfilment === "preorder" ? `${i.name} (pre-order)` : i.name,
                metadata: { sku: i.sku, slug: i.slug, ...(i.variantId ? { variant: i.variantId } : {}) },
              },
            },
          })),
          shipping_address_collection: {
            allowed_countries: env.shippingCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
          ...(env.shippingRateIds.length ? { shipping_options: env.shippingRateIds.map((r) => ({ shipping_rate: r })) } : {}),
          automatic_tax: { enabled: env.stripeTax },
          expires_at: Math.floor(new Date(order.reservationExpiresAt).getTime() / 1000),
          success_url: urls.success,
          cancel_url: urls.cancel,
        },
        { idempotencyKey: `checkout-${order.id}` },
      );
      if (!session.url) throw new Error("Stripe returned a session without a URL");
      return { id: session.id, url: session.url };
    },
  };
}
