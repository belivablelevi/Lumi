"use client";

import { useState } from "react";
import type { Product } from "@/content/products";
import { Gallery } from "./Gallery";
import { PurchasePanel } from "./PurchasePanel";

/** The gallery and the purchase panel, sharing the picked colour so the gallery shows it. */
export function ProductTop({ product, empty }: { product: Product; empty: React.ReactNode }) {
  const [pick, setPick] = useState({ id: product.variants[0]?.id, n: 0 });
  const image = product.variants.find((x) => x.id === pick.id)?.image;
  return (
    <>
      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        {product.images.length ? (
          <Gallery
            images={product.images}
            personaId={product.personas[0]}
            name={product.name}
            select={image !== undefined && pick.n > 0 ? { image, key: pick.n } : undefined}
          />
        ) : (
          empty
        )}
      </div>
      <PurchasePanel product={product} variant={pick.id} onVariant={(id) => setPick((p) => ({ id, n: p.n + 1 }))} />
    </>
  );
}
