import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { personaStories } from "@/content/personas";
import { renderImage } from "@/lib/renders";
import { ShopGrid } from "@/components/product/ShopGrid";
import { CharacterCard } from "@/components/product/CharacterCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Pocket Lumis", description: "Keychain-sized companions that feel every pat, shake and tilt." };

export default function PocketPage() {
  const products = listedProducts().filter((p) => p.category === "pocket");
  const first = products[0];
  return (
    <>
      <PageHeader eyebrow="Pocket Lumis" title="A tiny face for your keys." lead="35 × 37 mm, a glowing screen, and no buttons at all. Pat it, tilt it, pick it up. It answers." />
      <section className="container-page" aria-label="Pocket Lumis">
        <ShopGrid products={products} initialCategory="pocket" />
      </section>
      {first ? (
        <section className="container-page py-16" aria-labelledby="examples-title">
          <SectionHeading id="examples-title" eyebrow="Example units" title="Every one is different." lead="Here are four Pocket Lumis and their personalities. Yours will be its own." />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {personaStories.map((s) => (
              <CharacterCard key={s.id} personaId={s.id} line={s.line} shell={s.shell} image={renderImage(s.render)} product={first} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
