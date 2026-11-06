import { NextResponse } from "next/server";
import { setCheckoutShipping } from "@/lib/checkout";
import { env } from "@/lib/env";
import { getStripe, stripePayments } from "@/lib/payments";
import { quoteShipping } from "@/lib/shipping";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

/** Called from the checkout page (through Stripe's runServerUpdate) when the address is saved. */
export async function POST(req: Request) {
  const stripe = getStripe();
  const store = getStore();
  if (!stripe || !store) return NextResponse.json({ error: "Checkout isn't set up on this site yet." }, { status: 503 });
  const body = await req.json().catch(() => null);
  try {
    const result = await setCheckoutShipping(body, {
      store,
      payments: stripePayments(stripe),
      countries: env.shippingCountries,
      quote: (to, units) => quoteShipping(to, units, { parcel: env.parcel, table: env.shippingTable, canadaPost: env.canadaPost, log: console.error }),
    });
    return result.ok
      ? NextResponse.json({ amount: result.quote.amount, label: result.quote.label }, { headers: { "cache-control": "no-store" } })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (e) {
    console.error("checkout shipping failed", e);
    return NextResponse.json({ error: "We couldn't work out shipping. Please try again." }, { status: 502 });
  }
}
