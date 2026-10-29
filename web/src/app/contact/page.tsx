import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { confirmed } from "@/lib/placeholder";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Contact" };

export default function Page() {
  const email = confirmed(brand.contact.email);
  return (
    <>
      <PageHeader eyebrow="Contact" title="Say hello" lead="Questions about Lumi, an order, or a launch? We'd love to hear from you." />
      <div className="container-page max-w-3xl">
        {email ? (
          <a href={`mailto:${email}`} className="inline-flex rounded-chip bg-ink px-6 py-3 font-semibold text-white">{email}</a>
        ) : (
          <div className="rounded-card bg-white p-6 ring-1 ring-line">
            <p className="font-bold">Our contact address is on its way</p>
            <p className="mt-1 text-muted">We haven&apos;t set up our support inbox yet. It&apos;ll appear here once it&apos;s ready.</p>
          </div>
        )}
      </div>
    </>
  );
}
