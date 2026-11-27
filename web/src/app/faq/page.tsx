import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { confirmed } from "@/lib/placeholder";
import { PageHeader } from "@/components/ui/PageHeader";
import { Accordion } from "@/components/ui/Accordion";
import { Tbc } from "@/components/ui/Section";
import { JsonLd } from "@/components/JsonLd";
import { faqLd } from "@/lib/structured-data";

export const metadata: Metadata = { title: "FAQ", description: "Answers about Lumi, Snaggo's keychain companion: what it does, how its personality works, and how pre-orders will work.", alternates: { canonical: "/faq" } };

const GENERAL = [
  { q: "What is a Lumi?", a: "A small companion with a glowing screen for a face. It reacts to being patted, shaken, tilted and picked up, and it has moods that change over time." },
  { q: "Is every Lumi different?", a: "Yes. Each one gets its own eyes, glint, accent and temperament at random when it's made, and no two are the same. Which one you get is pure luck, and some are rarer than others." },
  { q: "Who makes Lumi?", a: "Levi, a young entrepreneur in Ottawa. I design the case, the circuit board, the software and this website, and I assemble and test every Lumi myself." },
  { q: "Where is Lumi made?", a: "In Ottawa, Ontario. The circuit boards and electronic parts are made by partner factories. Everything is designed, put together and tested here." },
  { q: "What's inside a Lumi?", a: "An ESP32-C3 chip, a 0.96 inch OLED screen, a motion sensor and a USB-C port, in a small 3D printed case. The prototypes are printed in PETG." },
  { q: "How does it know I patted it?", a: "A small motion sensor feels the tap, and Lumi's software turns it into a reaction. It can tell pats, double pats, shakes, tilts, drops and being picked up. No phone or app is involved." },
  { q: "How is a Lumi's personality decided?", a: "Each chip has its own ID, and the ID decides the eyes, glint, accent and temperament. The same chip always gives the same Lumi. You can try it on the Roll a Lumi page." },
  { q: "Can I see how Lumi is made?", a: "Yes. The How it's made page walks through each step, and the build is posted on Instagram and TikTok as it happens." },
  { q: "Are the pictures on this site photos?", a: "Not yet. They're renders of the prototype design. The faces on their screens are drawn by Lumi's real firmware. We'll add photos once the first units are made." },
  { q: "How do pre-orders work?", a: "You pay in full when you pre-order, and you can cancel for a full refund at any time before your Lumi ships. Each product page shows its dispatch window before you check out. Nothing is on pre-order yet." },
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
