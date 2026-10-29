"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "../ui/Button";
import { useCart } from "./CartProvider";

export function CheckoutButton({ className }: { className?: string }) {
  const { lines, check, services } = useCart();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!services.checkout) {
    return (
      <div className={className}>
        <Button className="w-full" size="lg" disabled>
          <Lock className="size-4" /> Checkout isn&apos;t set up yet
        </Button>
        <p className="mt-2 text-center text-xs text-muted">
          Payments aren&apos;t connected on this site yet, so no order can be placed.
        </p>
      </div>
    );
  }

  const go = async () => {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout couldn't start. Please try again.");
      window.location.assign(data.url);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Checkout couldn't start. Please try again.");
    }
  };

  return (
    <div className={className}>
      <Button className="w-full" size="lg" onClick={go} disabled={state === "loading" || check.problems.length > 0}>
        {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {state === "loading" ? "Starting secure checkout…" : check.fulfilment === "preorder" ? "Pre-order securely" : "Check out securely"}
      </Button>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-xs text-peach-deep">
        {state === "error" ? message : ""}
      </p>
    </div>
  );
}
