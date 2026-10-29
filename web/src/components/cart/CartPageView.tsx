"use client";

import { ShoppingBag } from "lucide-react";
import { ButtonLink } from "../ui/Button";
import { CartLines } from "./CartLines";
import { useCart } from "./CartProvider";
import { CartSummary } from "./CartSummary";

export function CartPageView() {
  const { lines, ready } = useCart();
  return (
    <div className="container-page pt-8 pb-10 sm:pt-12">
      <h1 className="text-h1 font-extrabold">Your cart</h1>
      {!ready ? (
        <p className="mt-6 text-muted">Loading your cart…</p>
      ) : lines.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-panel bg-white p-12 text-center ring-1 ring-line">
          <div className="grid size-16 place-items-center rounded-full bg-lavender-pale"><ShoppingBag className="size-6 text-lavender-deep" /></div>
          <p className="text-h3 font-bold">Your cart is empty</p>
          <ButtonLink href="/shop">Meet the Lumis</ButtonLink>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-card bg-white px-6 ring-1 ring-line"><CartLines /></div>
          <div className="h-fit rounded-card bg-white p-6 ring-1 ring-line lg:sticky lg:top-24"><CartSummary /></div>
        </div>
      )}
    </div>
  );
}
