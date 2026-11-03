import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { confirmed } from "@/lib/placeholder";
import { PageHeader } from "@/components/ui/PageHeader";
import { Accordion } from "@/components/ui/Accordion";
import { Tbc } from "@/components/ui/Section";
import { JsonLd } from "@/components/JsonLd";
import { faqLd } from "@/lib/structured-data";

export const metadata: Metadata = { title: "FAQ", description: "Answers about Lumi, Snaggo's keychain companion: what it does, how its personality works, and how pre-orders will work." };

const GENERAL = [
  { q: "What is a Lumi?", a: "A small companion with a glowing screen for a face. It reacts to being patted, shaken, tilted and picked up, and it has moods that change over time." },
  { q: "Is every Lumi different?", a: "Yes. Each one gets its own eyes, glint, accent and temperament at random when it's made, and no two are the same. Which one you get is pure luck, and some are rarer than others." },
  { q: "Are the pictures on this site photos?", a: "Not yet. They're renders of the prototype design. The faces on their screens are drawn by Lumi's real firmware. We'll add photos once the first units are made." },
  { q: "How do pre-orders work?", a: "When a Lumi opens for pre-order, its page lists the dispatch window, when you pay, and how cancelling works, before you check out. Nothing is on pre-order yet." },
];

export default function Page() {
  const product = listedProducts().flatMap((p) => p.faq.map((f) => ({ q: f.q, a: confirmed(f.a) ?? <Tbc /> })));
  // Only questions with a real answer go in the structured data.
  const answered = [...GENERAL, ...listedProducts().flatMap((p) => p.faq.flatMap((f) => (confirmed(f.a) ? [{ q: f.q, a: confirmed(f.a)! }] : [])))];
  return (
    <>
      <JsonLd data={faqLd(answered)} />
      <PageHeader eyebrow="FAQ" title="Questions, answered" />
      <div className="container-page max-w-3xl space-y-10">
        <Accordion items={GENERAL} />
        {product.length ? (
          <div>
            <h2 className="mb-4 text-h3 font-bold">Pocket Lumi</h2>
            <Accordion items={product} />
          </div>
        ) : null}
      </div>
    </>
  );
}
