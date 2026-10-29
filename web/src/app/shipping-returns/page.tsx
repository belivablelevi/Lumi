import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";

export const metadata: Metadata = { title: "Shipping and Returns" };

export default function Page() {
  return (
    <PolicyPage
      title="Shipping and Returns"
      lead="How orders and pre-orders reach you, and what happens if something isn't right."
      sections={[
        { heading: "Where we ship", note: "countries and regions served." },
        { heading: "Shipping rates and times", note: "rates in CAD and typical delivery times." },
        { heading: "Pre-orders", note: "when pre-ordered Lumis are dispatched, when payment is taken, and what happens if a launch is delayed." },
        { heading: "Mixed orders", note: "pre-orders and in-stock items are checked out separately; explain how each ships." },
        { heading: "Returns and refunds", note: "return window, condition, how refunds are made, and cancellation of pre-orders." },
        { heading: "Damaged or faulty Lumis", note: "how to report a problem and what we'll do." },
      ]}
    />
  );
}
