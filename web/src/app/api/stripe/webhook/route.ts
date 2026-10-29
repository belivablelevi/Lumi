import { NextResponse } from "next/server";
import { getMailer } from "@/lib/email";
import { env } from "@/lib/env";
import { getStripe } from "@/lib/payments";
import { getStore } from "@/lib/store";
import { handleStripeEvent } from "@/lib/webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const store = getStore();
  if (!stripe || !store || !env.stripeWebhookSecret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const payload = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  try {
    const outcome = await handleStripeEvent(event, { store, mailer: getMailer() });
    return NextResponse.json({ received: true, outcome });
  } catch (e) {
    // A 500 makes Stripe retry later; handling is idempotent, so retries are safe.
    console.error("webhook failed", event.id, e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
