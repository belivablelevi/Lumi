import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <PolicyPage
      title="Terms"
      lead="The terms that apply when you use this site or buy a Lumi."
      sections={[
        { heading: "Who we are", note: "business name and contact details." },
        { heading: "Orders and pricing", note: "prices in CAD, taxes, when a contract is formed." },
        { heading: "Pre-orders", note: "what a pre-order is, payment timing, dispatch estimates, cancellation, delays." },
        { heading: "Personalities", note: "each unit's look and temperament are assigned when it's made." },
        { heading: "Warranty", note: "warranty terms and statutory rights." },
        { heading: "Liability", note: "limits of liability as permitted by law." },
        { heading: "Governing law", note: "the province whose laws apply." },
      ]}
    />
  );
}
