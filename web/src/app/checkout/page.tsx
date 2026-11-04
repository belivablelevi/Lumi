import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { env, serviceStatus } from "@/lib/env";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  const ready = serviceStatus().checkout && env.stripePublishableKey;
  return (
    <div className="container-page max-w-5xl pt-8 pb-16">
      <h1 className="text-h2 font-bold">Checkout</h1>
      {ready ? (
        <CheckoutClient publishableKey={env.stripePublishableKey!} />
      ) : (
        <p className="mt-6 rounded-card bg-white p-6 text-muted ring-1 ring-line">
          Payments aren&apos;t connected on this site yet, so no order can be placed.
        </p>
      )}
    </div>
  );
}
