"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import clsx from "clsx";
import type { GalleryImage, Product } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { ctaFor } from "@/lib/product-state";
import { DeviceFrame } from "../lumi/DeviceFrame";
import { RarityDot } from "../lumi/PersonaChip";
import { Price } from "../ui/Price";
import { StatusBadge } from "../ui/StatusBadge";
import { AddToCartButton } from "./AddToCartButton";

const bg = { lavender: "bg-lavender-pale", mint: "bg-mint-pale", peach: "bg-peach-pale" } as const;

/** One example personality, sold as the product it belongs to. */
export function CharacterCard({
  personaId,
  line,
  shell,
  image,
  product,
  hoverAnimation = "pat_giggle",
}: {
  personaId: string;
  line: string;
  shell: keyof typeof bg;
  image: GalleryImage;
  product: Product;
  hoverAnimation?: string;
}) {
  const p = persona(personaId);
  const [hover, setHover] = useState(false);
  const anim = p.animations[hoverAnimation];
  const cta = ctaFor(product);
  const href = `/products/${product.slug}`;
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line/70 transition-[box-shadow,transform] duration-300 ease-(--ease-out-soft) hover:-translate-y-1 hover:shadow-lift"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <Link href={href} className={clsx("relative block overflow-hidden px-6 pt-6", bg[shell])} aria-label={`${p.name}: ${product.name} details`}>
        <div className="transition-transform duration-500 ease-(--ease-out-soft) group-hover:scale-[1.04]">
          <DeviceFrame
            image={image}
            src={hover && anim ? anim.file : p.idle.file}
            label={hover && anim ? `${p.name} giggling` : `${p.name}, idling`}
            sizes="(min-width: 1024px) 22vw, (min-width: 640px) 40vw, 80vw"
          />
        </div>
        <span className="absolute top-4 left-4 rounded-chip bg-white/80 px-2.5 py-1 text-[0.6875rem] font-bold text-muted">Example unit</span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">{product.category === "pocket" ? "Pocket Lumi" : "Desk Lumi"}</p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted capitalize">
            <RarityDot rarity={p.rarity} /> {p.rarity}
          </span>
        </div>
        <h3 className="mt-2 text-h3 font-bold">
          <Link href={href} className="hover:underline">{p.name}</Link>
        </h3>
        <p className="mt-1 text-[0.9375rem] text-muted">{line}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} />
          <Price price={product.price} demo={product.demo} className="text-sm" />
        </div>
        <div className="mt-auto flex items-center gap-2 pt-5">
          {cta.kind === "add" ? (
            <AddToCartButton product={product} label={cta.label} className="flex-1" size="md" />
          ) : cta.kind === "notify" ? (
            <Link href={cta.href} className="inline-flex h-11 flex-1 items-center justify-center rounded-chip bg-ink text-[0.9375rem] font-semibold text-white transition-colors hover:bg-ink-soft">
              {cta.label}
            </Link>
          ) : null}
          <Link href={href} className="grid size-11 place-items-center rounded-full border border-line text-ink transition-colors hover:border-ink/40" aria-label={`${product.name} details`}>
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
