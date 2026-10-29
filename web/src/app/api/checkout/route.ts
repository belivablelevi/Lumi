import { NextResponse } from "next/server";
import { brand } from "@/config/brand";
import { listedProducts } from "@/lib/catalogue";
import { startCheckout } from "@/lib/checkout";
import { env, serviceStatus } from "@/lib/env";
import { getStripe, stripePayments } from "@/lib/payments";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const store = getStore();
  if (!serviceStatus().checkout || !stripe || !store) {
    return NextResponse.json({ error: "Checkout isn't set up on this site yet." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  const result = await startCheckout(body, {
    catalogue: listedProducts(),
    store,
    payments: stripePayments(stripe),
    siteUrl: env.siteUrl,
    allowMixed: brand.allowMixedCarts,
  });
  return result.ok
    ? NextResponse.json({ url: result.url })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
