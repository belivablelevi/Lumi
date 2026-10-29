import type { Metadata } from "next";
import { listedProducts } from "@/lib/catalogue";
import { ShopGrid } from "@/components/product/ShopGrid";
import { PageHeader } from "@/components/ui/PageHeader";
import { LaunchSignupForm } from "@/components/forms/LaunchSignupForm";

export const metadata: Metadata = { title: "Desk Lumis", description: "A Lumi made to live on your desk. In the works." };

export default function DeskPage() {
  const products = listedProducts().filter((p) => p.category === "desk");
  return (
    <>
      <PageHeader eyebrow="Desk Lumis" title="A Lumi for your desk is in the works." lead="We're still designing it, so there are no specs or pictures yet. Leave your email and we'll share it when there's something to see.">
        <LaunchSignupForm topic="desk-lumi" className="mt-8 max-w-lg" />
      </PageHeader>
      {products.length ? (
        <section className="container-page" aria-label="Desk Lumis">
          <ShopGrid products={products} initialCategory="desk" />
        </section>
      ) : null}
    </>
  );
}
