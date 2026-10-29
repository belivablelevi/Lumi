"use client";

import { formatMoney } from "@/lib/money";
import { confirmed } from "@/lib/placeholder";
import { useCart } from "./CartProvider";
import { CheckoutButton } from "./CheckoutButton";

export function CartSummary() {
  const { check, lines } = useCart();
  const preorders = check.items.filter((i) => i.product.status === "preorder");
  return (
    <div className="space-y-4">
      {check.problems.length > 0 && lines.length > 0 ? (
        <ul className="space-y-1 rounded-control bg-peach-pale p-3 text-sm text-peach-deep" role="alert">
          {check.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <dl className="space-y-2 text-[0.9375rem]">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-bold tabular-nums">{check.subtotal ? formatMoney(check.subtotal) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted">Shipping and taxes</dt>
          <dd className="text-right text-muted">Calculated at checkout</dd>
        </div>
      </dl>
      {preorders.length > 0 ? (
        <div className="rounded-control bg-mint-pale p-3 text-sm text-ink-soft">
          <p className="font-bold text-ink">This is a pre-order</p>
          {preorders.map((i) => {
            const t = confirmed(i.product.preorder);
            return t ? (
              <p key={i.product.slug} className="mt-1">
                {i.product.name}: {t.dispatchWindow}. {t.paymentTiming}.
              </p>
            ) : null;
          })}
          <p className="mt-1">
            Full terms are on the product page and in{" "}
            <a className="underline" href="/shipping-returns">shipping and returns</a>.
          </p>
        </div>
      ) : null}
      <CheckoutButton />
    </div>
  );
}
