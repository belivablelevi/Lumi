import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";

export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };

export default function Page() {
  return (
    <PolicyPage
      title="Terms"
      lead="The terms that apply when you use this site or buy a Lumi."
      sections={[
        { heading: "Who we are", note: "business name and contact details." },
        { heading: "Orders and pricing", note: "prices in CAD, taxes, when a contract is formed." },
        {
          heading: "Pre-orders",
          body: [
            "A pre-order is an order for a Lumi that hasn't been made yet. You're reserving one from an upcoming batch.",
            "You pay in full when you place the pre-order.",
            "Each product page shows its dispatch window before you check out. It's our best estimate of when your Lumi will ship, not a guaranteed date.",
            "You can cancel a pre-order for a full refund at any time before it ships. Use the contact page and include your order number. Refunds go back to the way you paid.",
            "If we expect to miss the dispatch window, we'll email you with a new estimate, and you can still cancel for a full refund.",
          ],
        },
        { heading: "Personalities", note: "each unit's look and temperament are picked at random when it's made; customers can't choose or swap them." },
        { heading: "Warranty", note: "warranty terms and statutory rights." },
        { heading: "Liability", note: "limits of liability as permitted by law." },
        { heading: "Governing law", note: "the province whose laws apply." },
      ]}
    />
  );
}
