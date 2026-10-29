import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { ShopGrid } from "@/components/product/ShopGrid";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Shop", description: "Every Lumi, from keychain companions to the ones still in the works." };

export default function ShopPage() {
  return (
    <>
      <PageHeader eyebrow="Shop" title="Meet the Lumis" lead="Small companions with big personalities. Every Pocket Lumi is made one of a kind." />
      <section className="container-page" aria-label="Products">
        <ShopGrid products={listedProducts()} />
      </section>
    </>
  );
}
