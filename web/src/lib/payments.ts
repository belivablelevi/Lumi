import Stripe from "stripe";
import { PROTECTION_LABEL, TIP_LABEL } from "./addons";
import { env } from "./env";
import type { ShippingQuote } from "./shipping";
import type { Order } from "./store/types";

export interface CheckoutSession {
  id: string;
  clientSecret: string;
}

export interface SessionInfo {
  id: string;
  /** "open", "complete" or "expired". */
  status: string | null;
  orderId: string | null;
}

export interface ShippingDetails {
  name: string;
  address: { line1: string; line2?: string; city: string; state?: string; postal_code: string; country: string };
}

export interface Payments {
  createSession(order: Order, returnUrl: string): Promise<CheckoutSession>;
  getSession(id: string): Promise<SessionInfo | null>;
  /** Sets the address (only the server may) and the one shipping option priced for it. */
  setShipping(id: string, details: ShippingDetails, quote: ShippingQuote): Promise<void>;
  /** Replaces the line items with the order's products plus its tip and protection. */
  setLineItems(id: string, order: Order): Promise<void>;
}

let stripe: Stripe | null | undefined;
export function getStripe(): Stripe | null {
  if (stripe === undefined) stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
  return stripe;
}

type LineItem = Stripe.Checkout.SessionCreateParams.LineItem;

/** The order as Stripe line items: products, then shipping protection and the tip if chosen. */
export function lineItems(order: Order): LineItem[] {
  const currency = order.currency.toLowerCase();
  const extra = (name: string, amount: number, kind: string): LineItem => ({
    quantity: 1,
    price_data: { currency, unit_amount: amount, product_data: { name, metadata: { kind } } },
  });
  return [
    ...order.items.map((i) => ({
      quantity: i.qty,
      price_data: {
        currency,
        unit_amount: i.unitAmount,
        product_data: {
          name: order.fulfilment === "preorder" ? `${i.name} (pre-order)` : i.name,
          metadata: { kind: "product", sku: i.sku, slug: i.slug, ...(i.variantId ? { variant: i.variantId } : {}) },
        },
      },
    })),
    ...(order.protectionAmount ? [extra(PROTECTION_LABEL, order.protectionAmount, "protection")] : []),
    ...(order.tipAmount ? [extra(TIP_LABEL, order.tipAmount, "tip")] : []),
  ];
}

/**
 * Checkout Sessions with Stripe Elements on our own checkout page. Prices come
 * from the server's order, and the shipping address can only be set by the
 * server, so the price we quote is always for the address on the order.
 */
export function stripePayments(s: Stripe): Payments {
  return {
    async createSession(order, returnUrl) {
      const session = await s.checkout.sessions.create(
        {
          mode: "payment",
          ui_mode: "elements",
          client_reference_id: order.id,
          metadata: { order_id: order.id, fulfilment: order.fulfilment },
          payment_intent_data: { metadata: { order_id: order.id } },
          line_items: lineItems(order),
          shipping_address_collection: {
            allowed_countries: env.shippingCountries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
          },
          permissions: { update_shipping_details: "server_only" },
          automatic_tax: { enabled: env.stripeTax },
          expires_at: Math.floor(new Date(order.reservationExpiresAt).getTime() / 1000),
          return_url: returnUrl,
        },
        { idempotencyKey: `checkout-${order.id}` },
      );
      if (!session.client_secret) throw new Error("Stripe returned a session without a client secret");
      return { id: session.id, clientSecret: session.client_secret };
    },

    async getSession(id) {
      try {
        const session = await s.checkout.sessions.retrieve(id);
        return { id: session.id, status: session.status, orderId: session.metadata?.order_id ?? null };
      } catch (e) {
        if (e instanceof Stripe.errors.StripeInvalidRequestError) return null;
        throw e;
      }
    },

    async setShipping(id, details, quote) {
      await s.checkout.sessions.update(id, {
        collected_information: { shipping_details: details },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              display_name: quote.label,
              fixed_amount: { amount: quote.amount, currency: "cad" },
              delivery_estimate: {
                minimum: { unit: "business_day", value: quote.minDays },
                maximum: { unit: "business_day", value: quote.maxDays },
              },
              ...(env.stripeTax ? { tax_behavior: "exclusive" as const, tax_code: "txcd_92010001" } : {}),
            },
          },
        ],
      });
    },

    async setLineItems(id, order) {
      // Sending the whole list without ids replaces every line item.
      await s.checkout.sessions.update(id, { line_items: lineItems(order) });
    },
  };
}
