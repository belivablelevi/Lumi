"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShoppingBag, X } from "lucide-react";
import { duration, ease } from "@/lib/motion";
import { ButtonLink } from "../ui/Button";
import { CartLines } from "./CartLines";
import { useCart } from "./CartProvider";
import { CartSummary } from "./CartSummary";

export function CartDrawer() {
  const { open, setOpen, lines, count } = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("button, a")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select")];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      restore.current?.focus();
    };
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.base }}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col bg-cloud shadow-lift sm:rounded-l-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: duration.slow, ease }}
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 id="cart-title" className="text-h3 font-bold">
                Your cart {count > 0 ? <span className="text-muted">({count})</span> : null}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-ink/5"
                aria-label="Close cart"
              >
                <X className="size-5" />
              </button>
            </div>
            {lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="grid size-16 place-items-center rounded-full bg-lavender-pale">
                  <ShoppingBag className="size-6 text-lavender-deep" />
                </div>
                <p className="text-h3 font-bold">Your cart is empty</p>
                <p className="text-muted">Meet the Lumis and find one that feels like yours.</p>
                <ButtonLink href="/shop" onClick={() => setOpen(false)}>Meet the Lumis</ButtonLink>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6">
                  <CartLines onNavigate={() => setOpen(false)} />
                </div>
                <div className="border-t border-line px-6 py-5">
                  <CartSummary />
                </div>
              </>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
