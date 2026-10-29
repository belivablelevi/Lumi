import type { Metadata } from "next";
import { PolicyPage } from "@/components/ui/PolicyPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <PolicyPage
      title="Privacy Policy"
      lead="What we collect, why, and the choices you have."
      sections={[
        { heading: "What we collect", note: "for orders: name, email, shipping address and order details (payment card details are handled by Stripe, never stored by us); for launch emails: email address, the consent you gave and when." },
        { heading: "Why we collect it", note: "fulfilling orders, sending order emails, and launch emails you opted into." },
        { heading: "Who we share it with", note: "service providers (payments, hosting, database, email) and where they store data." },
        { heading: "How long we keep it", note: "retention periods for orders and mailing-list records." },
        { heading: "Your rights", note: "access, correction and deletion under PIPEDA and applicable provincial law, and how to ask." },
        { heading: "Marketing emails", note: "express consent under CASL, how to unsubscribe (every email has a link), sender identification." },
        { heading: "Contact", note: "the privacy contact and mailing address." },
      ]}
    />
  );
}
