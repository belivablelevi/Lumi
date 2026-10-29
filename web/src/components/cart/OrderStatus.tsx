"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ButtonLink } from "../ui/Button";
import { useCart } from "./CartProvider";

type Status = { kind: "checking" } | { kind: "paid"; preorder: boolean; items: { name: string; qty: number }[] } | { kind: "review" } | { kind: "ended" } | { kind: "unknown" };

/** Confirms an order only once the server has a verified payment from Stripe's webhook. */
export function OrderStatus({ order, session }: { order: string; session: string }) {
  const [s, setS] = useState<Status>({ kind: "checking" });
  const { clear } = useCart();

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(`/api/orders/status?order=${encodeURIComponent(order)}&session_id=${encodeURIComponent(session)}`, { cache: "no-store" });
        if (res.ok) {
          const d = (await res.json()) as { status: string; fulfilment: string; items: { name: string; qty: number }[] };
          if (!alive) return;
          if (d.status === "paid") { setS({ kind: "paid", preorder: d.fulfilment === "preorder", items: d.items }); clear(); return; }
          if (d.status === "review") { setS({ kind: "review" }); clear(); return; }
          if (d.status === "expired" || d.status === "failed") { setS({ kind: "ended" }); return; }
        } else if (res.status === 404 || res.status === 400) {
          if (alive) setS({ kind: "unknown" });
          return;
        }
      } catch {}
      if (alive) {
        if (tries < 40) timer = setTimeout(poll, Math.min(1000 + tries * 250, 4000));
        else setS({ kind: "unknown" });
      }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [order, session, clear]);

  if (s.kind === "checking") {
    return (
      <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line" role="status">
        <Clock className="mx-auto size-10 animate-pulse text-lavender-deep" />
        <h1 className="mt-4 text-h2 font-bold">Confirming your payment…</h1>
        <p className="mt-2 text-muted">This usually takes a few seconds. Please keep this page open.</p>
      </div>
    );
  }
  if (s.kind === "paid") {
    return (
      <div className="rounded-panel bg-mint-pale p-10 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-mint-deep" />
        <h1 className="mt-4 text-h2 font-bold">{s.preorder ? "Your pre-order is confirmed" : "Your order is confirmed"}</h1>
        <ul className="mt-4 text-ink-soft">{s.items.map((i) => <li key={i.name}>{i.qty} × {i.name}</li>)}</ul>
        <p className="mt-4 text-muted">We&apos;ve emailed you a confirmation.{s.preorder ? " We'll be in touch before it ships." : ""}</p>
        <ButtonLink href="/" className="mt-6">Back to Lumi</ButtonLink>
      </div>
    );
  }
  if (s.kind === "review") {
    return (
      <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line" role="status">
        <CheckCircle2 className="mx-auto size-10 text-lavender-deep" />
        <h1 className="mt-4 text-h2 font-bold">Payment received</h1>
        <p className="mt-2 text-muted">We need to check one detail on this order by hand. We&apos;ll email you shortly.</p>
      </div>
    );
  }
  return (
    <div className="rounded-panel bg-white p-10 text-center ring-1 ring-line" role="status">
      <XCircle className="mx-auto size-10 text-peach-deep" />
      <h1 className="mt-4 text-h2 font-bold">{s.kind === "ended" ? "This checkout didn't complete" : "We couldn't find this order yet"}</h1>
      <p className="mt-2 text-muted">
        {s.kind === "ended"
          ? "No payment was taken. Your cart is still here if you'd like to try again."
          : "If you paid, you'll get a confirmation email once the payment is verified."}
      </p>
      <ButtonLink href="/cart" className="mt-6">Back to cart</ButtonLink>
    </div>
  );
}
