import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { ctaFor } from "@/lib/product-state";
import { DeviceFrame } from "../lumi/DeviceFrame";
import { OledScreen } from "../lumi/OledScreen";
import { Price } from "../ui/Price";
import { StatusBadge } from "../ui/StatusBadge";
import { AddToCartButton } from "./AddToCartButton";

/** The product itself (not an example character), for the shop and category pages. */
export function ProductCard({ product }: { product: Product }) {
  const href = `/products/${product.slug}`;
  const img = product.images[0];
  const cta = ctaFor(product);
  const p = product.personas[0] ? persona(product.personas[0]) : undefined;
  return (
    <article className="group flex flex-col overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line/70 transition-[box-shadow,transform] duration-300 ease-(--ease-out-soft) hover:-translate-y-1 hover:shadow-lift">
      <Link href={href} className={`relative block aspect-[4/3] overflow-hidden ${product.category === "pocket" ? "bg-lavender-pale" : "bg-night"}`} aria-label={`${product.name} details`}>
        {img && img.screen && p ? (
          <div className="absolute inset-0 grid place-items-center p-6 transition-transform duration-500 ease-(--ease-out-soft) group-hover:scale-[1.04]">
            <DeviceFrame image={img} src={p.idle.file} label={`${p.name}, idling`} className="w-[78%] max-w-[360px]" sizes="(min-width: 1024px) 30vw, 80vw" />
          </div>
        ) : img ? (
          <Image src={img.src} alt={img.alt} fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-contain p-6 transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : p ? (
          <div className="absolute inset-0 grid place-items-center p-10">
            <div className="aspect-[2/1] w-full max-w-[280px] rounded-[16px] bg-black p-3 ring-1 ring-white/10">
              <OledScreen src={p.animations.nod_off?.file ?? p.idle.file} label="A Lumi face" />
            </div>
            <p className="absolute bottom-4 text-xs text-white/50">Design in progress</p>
          </div>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">{product.category === "pocket" ? "Pocket Lumis" : "Desk Lumis"}</p>
          <StatusBadge status={product.status} />
        </div>
        <h3 className="mt-3 text-h3 font-bold"><Link href={href} className="hover:underline">{product.name}</Link></h3>
        <p className="mt-1 text-muted">{product.personality}</p>
        <Price price={product.price} demo={product.demo} className="mt-4" />
        <div className="mt-auto pt-5">
          {cta.kind === "add" ? (
            <AddToCartButton product={product} label={cta.label} size="md" />
          ) : cta.kind === "notify" ? (
            <Link href={cta.href} className="inline-flex h-11 w-full items-center justify-center rounded-chip bg-ink text-[0.9375rem] font-semibold text-white hover:bg-ink-soft">
              {cta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
