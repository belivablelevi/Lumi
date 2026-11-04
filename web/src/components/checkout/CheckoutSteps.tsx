"use client";

import { useState } from "react";
import clsx from "clsx";
import { Loader2, Lock } from "lucide-react";
import { PaymentElement, ShippingAddressElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { Button } from "@/components/ui/Button";
import { PROTECTION_CENTS, PROTECTION_LABEL, TIP_MAX_CENTS, TIP_PRESETS } from "@/lib/addons";

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const card = "rounded-card bg-white p-5 ring-1 ring-line sm:p-6";
const heading = "text-lg font-bold";

/** Calls one of our checkout endpoints; throws with its message if it fails, so runServerUpdate rejects. */
async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

export function CheckoutSteps({ preorder, onRestart }: { preorder: boolean; onRestart: () => void }) {
  const state = useCheckoutElements();
  const [email, setEmail] = useState("");
  const [editingAddress, setEditingAddress] = useState(true);
  const [busy, setBusy] = useState<"" | "address" | "addons" | "pay">("");
  const [addressError, setAddressError] = useState("");
  const [addonsError, setAddonsError] = useState("");
  const [payError, setPayError] = useState("");
  const [protection, setProtection] = useState(false);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState("");

  if (state.type === "loading") {
    return (
      <p role="status" className="mt-6 flex items-center gap-2 text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading secure checkout…
      </p>
    );
  }
  if (state.type === "error") {
    return (
      <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
        <p role="alert" className="font-semibold">Checkout couldn&apos;t load: {state.error.message}</p>
        <Button className="mt-4" variant="outline" onClick={onRestart}>Start checkout again</Button>
      </div>
    );
  }

  const checkout = state.checkout;
  if (checkout.status.type !== "open") {
    return (
      <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
        <p role="alert" className="font-semibold">This checkout has ended.</p>
        <Button className="mt-4" variant="outline" onClick={onRestart}>Start checkout again</Button>
      </div>
    );
  }

  const shipping = checkout.shipping?.shippingOption;
  const address = checkout.shippingAddress;
  const showAddressForm = editingAddress || !address || !shipping;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const saveAddress = async () => {
    setAddressError("");
    const el = checkout.getShippingAddressElement();
    if (!el) return;
    const v = await el.getValue();
    if (!v.complete) {
      setAddressError("Please finish your address.");
      return;
    }
    setBusy("address");
    try {
      const r = await checkout.runServerUpdate(() => post("/api/checkout/shipping", { sessionId: checkout.id, shipping: v.value }));
      if (r.type === "error") throw new Error(r.error.message);
      setEditingAddress(false);
    } catch (e) {
      setAddressError(e instanceof Error ? e.message : "We couldn't work out shipping. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const saveAddons = async (next: { protection: boolean; tip: number }) => {
    const before = { protection, tip };
    setProtection(next.protection);
    setTip(next.tip);
    setAddonsError("");
    setBusy("addons");
    try {
      const r = await checkout.runServerUpdate(() => post("/api/checkout/addons", { sessionId: checkout.id, ...next }));
      if (r.type === "error") throw new Error(r.error.message);
    } catch (e) {
      setProtection(before.protection);
      setTip(before.tip);
      setAddonsError(e instanceof Error ? e.message : "We couldn't update your order. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const applyCustomTip = () => {
    const cents = Math.round(Number(customTip.replace(/[$,\s]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > TIP_MAX_CENTS) {
      setAddonsError(`Tips can be up to ${dollars(TIP_MAX_CENTS)}.`);
      return;
    }
    void saveAddons({ protection, tip: cents });
  };

  const pay = async () => {
    setPayError("");
    if (!emailOk) {
      setPayError("Please enter your email, so we can send your receipt.");
      return;
    }
    setBusy("pay");
    const r = await checkout.confirm({ email: email.trim() });
    // On success Stripe takes the customer to the order status page.
    if (r.type === "error") {
      setPayError(r.error.message);
      setBusy("");
    }
  };

  const tipChoices = [0, ...TIP_PRESETS];
  const customActive = tip > 0 && !TIP_PRESETS.includes(tip as (typeof TIP_PRESETS)[number]);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-4">
        <section className={card} aria-labelledby="contact">
          <h2 id="contact" className={heading}>Contact</h2>
          <label htmlFor="checkout-email" className="mt-3 block text-sm font-semibold">Email</label>
          <input
            id="checkout-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1 h-12 w-full rounded-chip border border-line bg-white px-4 text-[0.9375rem] outline-none focus:border-ink/40"
          />
          <p className="mt-1 text-xs text-muted">For your receipt and shipping updates.</p>
        </section>

        <section className={card} aria-labelledby="ship-to">
          <h2 id="ship-to" className={heading}>Shipping address</h2>
          <div className={clsx("mt-3", !showAddressForm && "hidden")}>
            <ShippingAddressElement />
            <Button className="mt-4" onClick={saveAddress} disabled={busy !== ""}>
              {busy === "address" ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy === "address" ? "Working out shipping…" : "Use this address"}
            </Button>
          </div>
          {!showAddressForm && address && shipping ? (
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="text-[0.9375rem] leading-relaxed">
                <p className="font-semibold">{address.name}</p>
                <p>{address.address.line1}{address.address.line2 ? `, ${address.address.line2}` : ""}</p>
                <p>{[address.address.city, address.address.state, address.address.postal_code].filter(Boolean).join(" ")}</p>
                <p className="mt-2 text-sm text-muted">{shipping.displayName}: {shipping.amount}</p>
              </div>
              <Button variant="outline" className="h-9 px-4 text-sm" onClick={() => setEditingAddress(true)} disabled={busy !== ""}>Change</Button>
            </div>
          ) : null}
          <p role="alert" className="mt-2 min-h-5 text-sm font-semibold text-[#b3261e]">{addressError}</p>
        </section>

        <section className={card} aria-labelledby="extras">
          <h2 id="extras" className={heading}>Extras</h2>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-chip border border-line px-4 py-3">
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={protection}
                disabled={busy !== ""}
                onChange={(e) => void saveAddons({ protection: e.target.checked, tip })}
              />
              <span className="font-semibold">{PROTECTION_LABEL}</span>
            </span>
            <span className="text-sm text-muted">{dollars(PROTECTION_CENTS)}</span>
          </label>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Add a tip</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {tipChoices.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tip === t}
                  disabled={busy !== ""}
                  onClick={() => void saveAddons({ protection, tip: t })}
                  className={clsx(
                    "h-10 rounded-chip px-4 text-sm font-semibold ring-1 transition-colors disabled:opacity-60",
                    tip === t ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-line hover:ring-ink/30",
                  )}
                >
                  {t === 0 ? "No tip" : dollars(t)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <label htmlFor="custom-tip" className="sr-only">Custom tip in dollars</label>
              <span className="relative flex-1">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">$</span>
                <input
                  id="custom-tip"
                  inputMode="decimal"
                  placeholder="Other amount"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  className={clsx(
                    "h-10 w-full rounded-chip border bg-white pr-4 pl-8 text-sm outline-none focus:border-ink/40",
                    customActive ? "border-ink" : "border-line",
                  )}
                />
              </span>
              <Button variant="outline" className="h-10 px-4 text-sm" onClick={applyCustomTip} disabled={busy !== "" || !customTip.trim()}>
                Add tip
              </Button>
            </div>
          </fieldset>
          <p role="alert" className="mt-2 min-h-5 text-sm font-semibold text-[#b3261e]">{addonsError}</p>
        </section>

        <section className={card} aria-labelledby="payment">
          <h2 id="payment" className={heading}>Payment</h2>
          <div className="mt-3">
            <PaymentElement />
          </div>
        </section>
      </div>

      <aside className={clsx(card, "lg:sticky lg:top-24")} aria-labelledby="summary">
        <h2 id="summary" className={heading}>Your order</h2>
        <ul className="mt-3 space-y-2 text-[0.9375rem]">
          {checkout.lineItems.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span>{l.quantity > 1 ? `${l.quantity} × ` : ""}{l.name}</span>
              <span>{l.total.amount}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 text-muted">
            <span>Shipping</span>
            <span>{shipping ? checkout.total.shippingRate.amount : "Add your address"}</span>
          </li>
          {checkout.total.taxExclusive.minorUnitsAmount > 0 ? (
            <li className="flex justify-between gap-3 text-muted">
              <span>Tax</span>
              <span>{checkout.total.taxExclusive.amount}</span>
            </li>
          ) : null}
        </ul>
        <p className="mt-3 flex justify-between gap-3 border-t border-line pt-3 text-lg font-bold">
          <span>Total</span>
          <span>{checkout.total.total.amount}</span>
        </p>
        {preorder ? <p className="mt-2 text-xs text-muted">Pre-order: ships when this launch is ready, not right away.</p> : null}
        <Button className="mt-4 w-full" size="lg" onClick={pay} disabled={busy !== "" || !shipping || !checkout.canConfirm}>
          {busy === "pay" ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          {busy === "pay" ? "Paying…" : `Pay ${checkout.total.total.amount}`}
        </Button>
        {!shipping ? <p className="mt-2 text-center text-xs text-muted">Add your shipping address to see the total.</p> : null}
        <p role="alert" className="mt-2 min-h-5 text-center text-sm font-semibold text-[#b3261e]">{payError}</p>
        <p className="text-center text-xs text-muted">Card details go straight to Stripe. We never see them.</p>
      </aside>
    </div>
  );
}
