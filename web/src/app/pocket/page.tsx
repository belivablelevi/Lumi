import type { Metadata } from "next";
import Link from "next/link";
import { listedProducts } from "@/lib/catalogue";
import { ShopGrid } from "@/components/product/ShopGrid";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Pocket Lumis", description: "Keychain-sized companions that feel every pat, shake and tilt.", alternates: { canonical: "/pocket" } };

export default function PocketPage() {
  const products = listedProducts().filter((p) => p.category === "pocket");
  return (
    <>
      <PageHeader eyebrow="Pocket Lumis" title="A tiny face for your keys." lead="35 × 37 mm, a glowing screen, and no buttons at all. Pat it, tilt it, pick it up. It answers." />
      <p className="container-page -mt-4 pb-8 text-sm text-muted">
        Made in Ottawa. <Link href="/how-its-made" className="font-semibold underline">See how a Lumi is made</Link> or <Link href="/roll" className="font-semibold underline">roll one</Link>.
      </p>
      <section className="container-page" aria-label="Pocket Lumis">
        <ShopGrid products={products} initialCategory="pocket" />
      </section>
    </>
  );
}
