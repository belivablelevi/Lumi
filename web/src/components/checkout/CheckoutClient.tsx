"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CheckoutElementsProvider } from "@stripe/react-stripe-js/checkout";
import { Loader2 } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { buttonClass } from "@/components/ui/Button";
import type { CartLine } from "@/lib/cart";
import { CheckoutSteps } from "./CheckoutSteps";

// Stripe.js loads once per page, and a cart starts one checkout even if React
// runs the effect twice. A reload within the reservation reuses that checkout.
const stripes = new Map<string, Promise<Stripe | null>>();
const starts = new Map<string, Promise<Started>>();
const SAVED = "lumi-checkout-v1";
const REUSE_MS = 25 * 60_000;

interface Started {
  clientSecret: string;
  orderId: string;
}

function saved(key: string): Started | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVED) ?? "null") as (Started & { key: string; at: number }) | null;
    return s && s.key === key && Date.now() - s.at < REUSE_MS ? { clientSecret: s.clientSecret, orderId: s.orderId } : null;
  } catch {
    return null;
  }
}

export function forgetCheckout() {
  try {
    sessionStorage.removeItem(SAVED);
  } catch {}
  starts.clear();
}

function start(key: string, lines: CartLine[]): Promise<Started> {
  const reuse = saved(key);
  if (reuse) return Promise.resolve(reuse);
  let p = starts.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines, protection: false, tip: 0 }),
      });
      const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; orderId?: string; error?: string };
      if (!res.ok || !data.clientSecret || !data.orderId) throw new Error(data.error ?? "Checkout couldn't start. Please try again.");
      const s = { clientSecret: data.clientSecret, orderId: data.orderId };
      try {
        sessionStorage.setItem(SAVED, JSON.stringify({ ...s, key, at: Date.now() }));
      } catch {}
      return s;
    })();
    p.catch(() => starts.delete(key));
    starts.set(key, p);
  }
  return p;
}

const appearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#30263a",
    colorText: "#30263a",
    colorTextSecondary: "#685f6c",
    colorDanger: "#b3261e",
    colorBackground: "#ffffff",
    borderRadius: "14px",
    fontFamily: "Manrope, system-ui, sans-serif",
  },
};

export function CheckoutClient({ publishableKey }: { publishableKey: string }) {
  const { lines, ready, check } = useCart();
  const [started, setStarted] = useState<Started | null>(null);
  const [error, setError] = useState("");
  const key = JSON.stringify(lines);
  const blocked = ready && (lines.length === 0 || check.problems.length > 0);

  useEffect(() => {
    if (!ready || blocked) return;
    let alive = true;
    start(key, lines).then(
      (s) => alive && setStarted(s),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : "Checkout couldn't start. Please try again."),
    );
    return () => {
      alive = false;
    };
    // `key` stands for `lines`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, blocked, key]);

  if (!ready) return <Waiting text="Loading your cart…" />;
  if (lines.length === 0) {
    return (
      <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
        <p>Your cart is empty.</p>
        <Link href="/shop" className={buttonClass("primary", "md", "mt-4")}>Find a Lumi</Link>
      </div>
    );
  }
  if (check.problems.length) {
    return (
      <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
        <p role="alert">{check.problems[0]}</p>
        <Link href="/cart" className={buttonClass("outline", "md", "mt-4")}>Back to your cart</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-6 rounded-card bg-white p-6 ring-1 ring-line">
        <p role="alert" className="font-semibold">{error}</p>
        <Link href="/cart" className={buttonClass("outline", "md", "mt-4")}>Back to your cart</Link>
      </div>
    );
  }
  if (!started) return <Waiting text="Starting secure checkout…" />;

  let stripe = stripes.get(publishableKey);
  if (!stripe) {
    stripe = loadStripe(publishableKey);
    stripes.set(publishableKey, stripe);
  }
  return (
    <CheckoutElementsProvider
      key={started.clientSecret}
      stripe={stripe}
      options={{
        clientSecret: started.clientSecret,
        elementsOptions: {
          appearance,
          fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" }],
        },
      }}
    >
      <CheckoutSteps preorder={check.fulfilment === "preorder"} onRestart={() => { forgetCheckout(); location.reload(); }} />
    </CheckoutElementsProvider>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <p role="status" className="mt-6 flex items-center gap-2 text-muted">
      <Loader2 className="size-4 animate-spin" /> {text}
    </p>
  );
}
