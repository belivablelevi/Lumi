"use client";

import Link from "next/link";
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import type { Product } from "@/content/products";
import { formatMoney, multiply } from "@/lib/money";
import { confirmed } from "@/lib/placeholder";
import { ctaFor } from "@/lib/product-state";
import { LaunchSignupForm } from "../forms/LaunchSignupForm";
import { Price } from "../ui/Price";
import { StatusBadge } from "../ui/StatusBadge";
import { AddToCartButton } from "./AddToCartButton";

export function PurchasePanel({ product }: { product: Product }) {
  const [variant, setVariant] = useState(product.variants[0]?.id);
  const [qty, setQty] = useState(1);
  const cta = ctaFor(product);
  const price = confirmed(product.price);
  const terms = confirmed(product.preorder);
  const v = product.variants.find((x) => x.id === variant);

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} />
          <span className="text-sm font-semibold text-muted">{product.category === "pocket" ? "Pocket Lumi · keychain" : "Desk Lumi"}</span>
        </div>
        <h1 className="mt-4 text-h1 font-extrabold">{product.name}</h1>
        <p className="mt-3 text-lead text-ink-soft">{product.tagline}</p>
        <Price price={product.price} demo={product.demo} className="mt-5 text-xl" />
      </div>

      {product.variants.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-bold">Colour: <span className="font-semibold text-muted">{v?.name}</span></legend>
          <div className="mt-3 flex gap-2">
            {product.variants.map((x) => (
              <button key={x.id} type="button" onClick={() => setVariant(x.id)} aria-pressed={variant === x.id} aria-label={x.name}
                className={clsx("size-10 rounded-full ring-2 ring-offset-2 ring-offset-cloud", variant === x.id ? "ring-ink" : "ring-transparent")}
                style={{ background: x.swatch }} />
            ))}
          </div>
        </fieldset>
      ) : null}

      {cta.kind === "add" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold" id="qty-label">Quantity</span>
            <div className="inline-flex items-center rounded-chip border border-line bg-white" role="group" aria-labelledby="qty-label">
              <button type="button" className="grid size-11 place-items-center rounded-full hover:bg-ink/5 disabled:opacity-40" onClick={() => setQty((q) => q - 1)} disabled={qty <= 1} aria-label="Decrease quantity"><Minus className="size-4" /></button>
              <span className="w-10 text-center font-bold tabular-nums" aria-live="polite">{qty}</span>
              <button type="button" className="grid size-11 place-items-center rounded-full hover:bg-ink/5 disabled:opacity-40" onClick={() => setQty((q) => q + 1)} disabled={qty >= product.maxPerOrder} aria-label="Increase quantity"><Plus className="size-4" /></button>
            </div>
            <span className="text-xs text-muted">Up to {product.maxPerOrder} per order</span>
          </div>

          <dl className="space-y-2 rounded-card bg-white p-5 text-[0.9375rem] ring-1 ring-line">
            <div className="flex justify-between gap-4"><dt className="text-muted">Item</dt><dd className="text-right font-semibold">{product.name}{v ? `, ${v.name}` : ""}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Quantity</dt><dd className="font-semibold tabular-nums">{qty}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Subtotal</dt><dd className="font-bold tabular-nums">{price ? formatMoney(multiply(price, qty)) : "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Shipping and taxes</dt><dd className="text-right text-muted">Calculated at checkout</dd></div>
          </dl>

          {product.status === "preorder" ? (
            <div className="rounded-card bg-mint-pale p-5 text-sm text-ink-soft" aria-label="Pre-order terms">
              <p className="font-bold text-ink">You&apos;re pre-ordering a future release</p>
              {terms ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><b>Dispatch:</b> {terms.dispatchWindow}</li>
                  <li><b>Payment:</b> {terms.paymentTiming}</li>
                  <li><b>Cancelling:</b> {terms.cancellation}</li>
                  <li><b>If it&apos;s delayed:</b> {terms.delays}</li>
                </ul>
              ) : null}
            </div>
          ) : null}

          <AddToCartButton product={product} label={cta.label} variantId={variant} qty={qty} />
        </div>
      ) : cta.kind === "notify" ? (
        <div className="rounded-card bg-lavender-pale p-5">
          <p className="font-bold">{product.status === "sold_out" ? "Sold out for now" : "Not on sale yet"}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {product.status === "sold_out"
              ? "Leave your email and we'll tell you if more become available."
              : "Price, dispatch dates and pre-order terms will be shared before anything goes on sale. Leave your email to hear first."}
          </p>
          <LaunchSignupForm topic={product.launchId ?? product.slug} className="mt-4" />
          <Link href={cta.href} className="mt-1 inline-block text-sm font-semibold underline underline-offset-4">Launch details</Link>
        </div>
      ) : null}
    </div>
  );
}
