"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { confirmed } from "@/lib/placeholder";
import { fulfilmentOf } from "@/lib/cart";
import { StatusBadge } from "../ui/StatusBadge";
import { useCart } from "./CartProvider";

export function CartLines({ onNavigate }: { onNavigate?: () => void }) {
  const { lines, catalogue, setQty, remove } = useCart();
  return (
    <ul className="divide-y divide-line">
      {lines.map((l) => {
        const p = catalogue.find((x) => x.slug === l.slug);
        const unit = p ? confirmed(p.price) : undefined;
        const variant = p?.variants.find((v) => v.id === l.variantId);
        const img = p?.images[0];
        return (
          <li key={`${l.slug}:${l.variantId ?? ""}`} className="flex gap-4 py-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-[18px] bg-lavender-pale">
              {img ? <Image src={img.src} alt="" fill sizes="80px" className="object-contain p-1.5" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {p ? (
                    <Link href={`/products/${p.slug}`} onClick={onNavigate} className="font-bold text-ink hover:underline">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-bold text-muted">Unavailable item</span>
                  )}
                  {variant ? <p className="text-sm text-muted">{variant.name}</p> : null}
                  {p ? <StatusBadge status={p.status} className="mt-1.5 h-6 text-[0.6875rem]" /> : null}
                </div>
                <p className="shrink-0 font-bold tabular-nums">{unit ? formatMoney({ ...unit, amount: unit.amount * l.qty }) : "—"}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="inline-flex items-center rounded-chip border border-line bg-white">
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-full text-ink hover:bg-ink/5 disabled:opacity-40"
                    onClick={() => setQty(l.slug, l.variantId, l.qty - 1)}
                    disabled={l.qty <= 1}
                    aria-label={`Decrease quantity of ${p?.name ?? "item"}`}
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums" aria-label="Quantity">{l.qty}</span>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-full text-ink hover:bg-ink/5 disabled:opacity-40"
                    onClick={() => setQty(l.slug, l.variantId, l.qty + 1)}
                    disabled={!p || l.qty >= p.maxPerOrder}
                    aria-label={`Increase quantity of ${p?.name ?? "item"}`}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(l.slug, l.variantId)}
                  className="inline-flex items-center gap-1.5 rounded-chip px-2 py-1 text-sm font-semibold text-muted hover:text-ink"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              </div>
              {p && fulfilmentOf(p) === "preorder" ? (
                <p className="mt-2 text-xs text-muted">Pre-order: ships when this launch is ready, not right away.</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
