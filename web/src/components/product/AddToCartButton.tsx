"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ShoppingBag } from "lucide-react";
import type { Product } from "@/content/products";
import { checkCart } from "@/lib/cart";
import { duration, ease } from "@/lib/motion";
import { Button } from "../ui/Button";
import { useCart } from "../cart/CartProvider";

export function AddToCartButton({
  product,
  label,
  variantId,
  qty = 1,
  className,
  size = "lg",
}: {
  product: Product;
  label: string;
  variantId?: string;
  qty?: number;
  className?: string;
  size?: "md" | "lg";
}) {
  const { add, setOpen, lines, catalogue, allowMixed } = useCart();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  const onClick = () => {
    const line = { slug: product.slug, qty, ...(variantId ? { variantId } : {}) };
    const next = [...lines.filter((l) => !(l.slug === line.slug && l.variantId === line.variantId))];
    const existing = lines.find((l) => l.slug === line.slug && l.variantId === line.variantId);
    next.push({ ...line, qty: (existing?.qty ?? 0) + qty });
    const check = checkCart(next, catalogue, allowMixed);
    if (check.problems.length) {
      setError(check.problems[0]!);
      return;
    }
    setError("");
    add(line);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
    setTimeout(() => setOpen(true), 350);
  };

  return (
    <div className={className}>
      <Button onClick={onClick} size={size} className="w-full">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={added ? "added" : "add"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: duration.fast, ease }}
            className="inline-flex items-center gap-2"
          >
            {added ? <Check className="size-4" /> : <ShoppingBag className="size-4" />}
            {added ? "Added" : label}
          </motion.span>
        </AnimatePresence>
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-peach-deep">{error}</p> : null}
    </div>
  );
}
