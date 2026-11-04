"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { Button } from "../ui/Button";
import { useCart } from "./CartProvider";

export function CheckoutButton({ className }: { className?: string }) {
  const { check, services, setOpen } = useCart();
  const router = useRouter();
  const [going, setGoing] = useState(false);

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

  return (
    <div className={className}>
      <Button
        className="w-full"
        size="lg"
        disabled={going || check.problems.length > 0}
        onClick={() => {
          setGoing(true);
          setOpen(false);
          router.push("/checkout");
        }}
      >
        {going ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {check.fulfilment === "preorder" ? "Pre-order securely" : "Check out securely"}
      </Button>
      <p className="mt-2 min-h-5 text-center text-xs text-muted">Shipping is worked out from your address at checkout.</p>
    </div>
  );
}
