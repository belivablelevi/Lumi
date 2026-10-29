import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { confirmed } from "@/lib/placeholder";
import { PageHeader } from "@/components/ui/PageHeader";
import { Accordion } from "@/components/ui/Accordion";
import { Tbc } from "@/components/ui/Section";

export const metadata: Metadata = { title: "FAQ" };

const GENERAL = [
  { q: "What is a Lumi?", a: "A small companion with a glowing screen for a face. It reacts to being patted, shaken, tilted and picked up, and it has moods that change over time." },
  { q: "Is every Lumi different?", a: "Yes. Each one is made with its own eyes, glint, accent and temperament, picked from 108,000 combinations. Some are rarer than others." },
  { q: "Are the pictures on this site photos?", a: "Not yet. They're renders of the prototype design. The faces on their screens are drawn by Lumi's real firmware. We'll add photos once the first units are made." },
  { q: "How do pre-orders work?", a: "When a Lumi opens for pre-order, its page lists the dispatch window, when you pay, and how cancelling works, before you check out. Nothing is on pre-order yet." },
];

export default function Page() {
  const product = listedProducts().flatMap((p) => p.faq.map((f) => ({ q: f.q, a: confirmed(f.a) ?? <Tbc /> })));
  return (
    <>
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
