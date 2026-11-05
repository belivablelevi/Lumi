import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";
import { PROTECTION_CENTS } from "@/lib/addons";

export const metadata: Metadata = {
  alternates: { canonical: "/shipping-returns" },
  title: "Shipping and Returns",
  description: "Snaggo ships Lumi to Canada and the US with Canada Post. Shipping is worked out from your address at checkout.",
};

const protection = `$${(PROTECTION_CENTS / 100).toFixed(2)}`;

export default function Page() {
  return (
    <PolicyPage
      title="Shipping and Returns"
      lead="How orders and pre-orders reach you, and what happens if something isn't right."
      sections={[
        {
          heading: "Where we ship",
          body: [
            "Canada and the United States.",
            "Lumi has a small lithium battery inside, and Canada Post doesn't carry lithium batteries to other countries, so we can't ship anywhere else yet.",
          ],
        },
        {
          heading: "Shipping rates and times",
          body: [
            "Shipping is worked out from your address at checkout, so you see the exact price before you pay. Prices are in Canadian dollars.",
            "In Canada we ship with Canada Post Expedited Parcel, and to the US with Canada Post Tracked Packet USA. Both are tracked. Checkout shows the estimated delivery time for your address, and we email you the tracking number when your order ships.",
            `You can add shipping protection at checkout for ${protection}.`,
          ],
        },
        { heading: "US orders", note: "who pays US duties and import fees, and how." },
        { heading: "When your Lumi arrives", body: ["Lumi travels asleep, so bumps in the post can't wake it. Tap its screen three times and it'll wake up and say hello."] },
        { heading: "Pre-orders", note: "when pre-ordered Lumis are dispatched, when payment is taken, and what happens if a launch is delayed." },
        { heading: "Mixed orders", note: "pre-orders and in-stock items are checked out separately; explain how each ships." },
        { heading: "Returns and refunds", note: "return window, condition, how refunds are made, and cancellation of pre-orders." },
        { heading: "Damaged or faulty Lumis", note: "how to report a problem and what we'll do." },
      ]}
    />
  );
}
