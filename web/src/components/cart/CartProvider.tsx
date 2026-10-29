"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/content/products";
import { checkCart, type CartCheck, type CartLine } from "@/lib/cart";

const KEY = "lumi-cart-v1";

export interface Services {
  checkout: boolean;
  signup: boolean;
}

interface CartContext {
  lines: CartLine[];
  ready: boolean;
  check: CartCheck;
  count: number;
  catalogue: Product[];
  services: Services;
  allowMixed: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (line: CartLine) => void;
  setQty: (slug: string, variantId: string | undefined, qty: number) => void;
  remove: (slug: string, variantId?: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartContext | null>(null);

function read(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((l): l is CartLine => !!l && typeof l.slug === "string" && Number.isInteger(l.qty))
      .map((l) => ({ slug: l.slug, qty: l.qty, ...(typeof l.variantId === "string" ? { variantId: l.variantId } : {}) }));
  } catch {
    return [];
  }
}

export function CartProvider({
  catalogue,
  services,
  allowMixed,
  children,
}: {
  catalogue: Product[];
  services: Services;
  allowMixed: boolean;
  children: ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Reading storage must wait for the browser; the first render matches the server's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setLines(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      // Private mode or storage full: the cart still works for this visit.
    }
  }, [lines, ready]);

  const same = (l: CartLine, slug: string, variantId?: string) => l.slug === slug && l.variantId === variantId;

  const add = useCallback((line: CartLine) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => same(l, line.slug, line.variantId));
      if (i < 0) return [...ls, line];
      return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + line.qty } : l));
    });
  }, []);
  const setQty = useCallback((slug: string, variantId: string | undefined, qty: number) => {
    setLines((ls) => ls.map((l) => (same(l, slug, variantId) ? { ...l, qty } : l)));
  }, []);
  const remove = useCallback((slug: string, variantId?: string) => {
    setLines((ls) => ls.filter((l) => !same(l, slug, variantId)));
  }, []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContext>(() => {
    const check = checkCart(lines, catalogue, allowMixed);
    return {
      lines, ready, check, catalogue, services, allowMixed, open, setOpen, add, setQty, remove, clear,
      count: lines.reduce((n, l) => n + l.qty, 0),
    };
  }, [lines, ready, catalogue, services, allowMixed, open, add, setQty, remove, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
