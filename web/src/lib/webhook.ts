import type Stripe from "stripe";
import { orderConfirmationEmail, type Mailer } from "./email";
import type { Store } from "./store/types";

export interface WebhookDeps {
  store: Store;
  mailer: Mailer | null;
}

export type WebhookOutcome = "paid" | "duplicate" | "released" | "waiting" | "ignored" | "missing";

function orderId(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.order_id ?? session.client_reference_id ?? null;
}

/**
 * Applies one verified Stripe event. Safe to run any number of times for the
 * same event: orders are marked paid once, and the confirmation email is
 * only sent for an order that hasn't had one.
 */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookOutcome> {
  const { store } = deps;
  let outcome: WebhookOutcome = "ignored";
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const id = orderId(session);
      if (!id) break;
      if (session.payment_status !== "paid") {
        outcome = "waiting"; // e.g. a bank debit that settles later; async_payment_succeeded follows
        break;
      }
      const order = await store.getOrder(id);
      if (!order) {
        outcome = "missing";
        break;
      }
      const mismatch =
        session.currency?.toUpperCase() !== order.currency || (session.amount_subtotal ?? -1) !== order.subtotal;
      const result = await store.markPaid(id, {
        sessionId: session.id,
        email: session.customer_details?.email ?? undefined,
        customerName: session.customer_details?.name ?? undefined,
        shipping: session.collected_information?.shipping_details ?? undefined,
        amountTotal: session.amount_total ?? undefined,
        mismatch,
      });
      if (result === "missing") {
        outcome = "missing";
        break;
      }
      outcome = result === "updated" ? "paid" : "duplicate";
      const fresh = await store.getOrder(id);
      if (fresh && fresh.email && !fresh.confirmationSentAt && (fresh.status === "paid" || fresh.status === "review") && deps.mailer) {
        await deps.mailer.send(orderConfirmationEmail(fresh));
        await store.markConfirmationSent(id);
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const id = orderId(event.data.object);
      if (!id) break;
      await store.releaseOrder(id, event.type === "checkout.session.expired" ? "expired" : "failed");
      outcome = "released";
      break;
    }
  }
  await store.recordEvent(event.id, event.type);
  return outcome;
}
