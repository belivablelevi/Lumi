import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";
import { PROTECTION_CENTS } from "@/lib/addons";
import { env } from "@/lib/env";
import { freeShippingArea } from "@/lib/shipping";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  alternates: { canonical: "/shipping-returns" },
  title: "Shipping and Returns",
  description: "Snaggo ships Lumi to Canada and the US, tracked. Checkout shows the shipping price for your address before you pay.",
};

const protection = `$${(PROTECTION_CENTS / 100).toFixed(2)}`;

export default function Page() {
  const freeOver = env.shippingRules.freeOverCents;
  const freeArea = freeShippingArea(env.shippingRules, env.shippingTable, env.parcel.handlingCents);
  return (
    <PolicyPage
      title="Shipping and Returns"
      lead="How orders and pre-orders reach you, and what happens if something isn't right."
      sections={[
        {
          heading: "Where we ship",
          body: [
            "Canada and the United States.",
            "Lumi has a small lithium battery inside, and the rules for sending batteries abroad mean we can't ship anywhere else yet.",
          ],
        },
        {
          heading: "Shipping rates and times",
          body: [
            "Checkout shows the shipping price for your address, so you see the exact price before you pay. Prices are in Canadian dollars.",
            "Every order is tracked. Checkout shows the estimated delivery time for your address, and we email you the tracking number when your order ships.",
            ...(freeOver && freeArea ? [`Orders of ${formatMoney({ amount: freeOver, currency: "CAD" })} or more ship free within ${freeArea}.`] : []),
            `You can add shipping protection at checkout for ${protection}.`,
          ],
        },
        {
          heading: "US orders",
          body: [
            "US shipping prices include the import duties and fees, and we pay them when your order ships, so there's nothing more to pay when it arrives.",
          ],
        },
        { heading: "When your Lumi arrives", body: ["Lumi travels asleep, so bumps in the post can't wake it. Tap its screen three times and it'll wake up and say hello."] },
        {
          heading: "Pre-orders",
          body: [
            "A pre-ordered Lumi ships in the dispatch window shown on its product page. You pay in full when you order, and we email you before it ships.",
            "You can cancel a pre-order for a full refund at any time before it ships. If a launch is delayed, we'll email you a new estimate and you can still cancel.",
          ],
        },
        { heading: "Mixed orders", note: "pre-orders and in-stock items are checked out separately; explain how each ships." },
        { heading: "Returns and refunds", note: "return window, condition, how refunds are made, and cancellation of pre-orders." },
        { heading: "Damaged or faulty Lumis", note: "how to report a problem and what we'll do." },
      ]}
    />
  );
}
