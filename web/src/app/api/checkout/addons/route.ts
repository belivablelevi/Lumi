import { NextResponse } from "next/server";
import { setCheckoutAddons } from "@/lib/checkout";
import { getStripe, stripePayments } from "@/lib/payments";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Called from the checkout page (through Stripe's runServerUpdate) when the tip or protection changes. */
export async function POST(req: Request) {
  const stripe = getStripe();
  const store = getStore();
  if (!stripe || !store) return NextResponse.json({ error: "Checkout isn't set up on this site yet." }, { status: 503 });
  const body = await req.json().catch(() => null);
  try {
    const result = await setCheckoutAddons(body, { store, payments: stripePayments(stripe) });
    return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (e) {
    console.error("checkout add-ons failed", e);
    return NextResponse.json({ error: "We couldn't update your order. Please try again." }, { status: 502 });
  }
}
