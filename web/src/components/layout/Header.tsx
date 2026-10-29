"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, ShoppingBag, X } from "lucide-react";
import clsx from "clsx";
import { brand } from "@/config/brand";
import { duration, ease } from "@/lib/motion";
import { Wordmark } from "../brand/Wordmark";
import { useCart } from "../cart/CartProvider";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const { count, ready, setOpen } = useCart();
  const menuButton = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [menuTop, setMenuTop] = useState(80);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Close the menu on navigation.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenu(false);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menu]);

  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header
      ref={headerRef}
      className={clsx(
        "sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled || menu ? "bg-cloud/85 shadow-[0_1px_0_var(--color-line)] backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <div className={clsx("container-page flex items-center justify-between gap-4 transition-[height] duration-300", scrolled ? "h-16" : "h-20")}>
        <Wordmark />
        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {brand.nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={clsx(
                    "rounded-chip px-4 py-2 text-[0.9375rem] font-semibold transition-colors",
                    active(n.href) ? "bg-ink/[0.06] text-ink" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative grid size-11 place-items-center rounded-full text-ink hover:bg-ink/[0.05]"
            aria-label={`Cart, ${ready ? count : 0} ${count === 1 ? "item" : "items"}`}
          >
            <ShoppingBag className="size-5" strokeWidth={2} />
            <AnimatePresence>
              {ready && count > 0 ? (
                <motion.span
                  key={count}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: duration.fast, ease }}
                  className="absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[0.6875rem] font-bold text-white"
                  aria-hidden
                >
                  {count}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
          <button
            ref={menuButton}
            type="button"
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-ink/[0.05] lg:hidden"
            aria-expanded={menu}
            aria-controls="mobile-menu"
            aria-label={menu ? "Close menu" : "Open menu"}
            onClick={() => {
              setMenuTop(headerRef.current?.getBoundingClientRect().bottom ?? 80);
              setMenu((m) => !m);
            }}
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {menu ? (
          <motion.nav
            id="mobile-menu"
            aria-label="Main"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: duration.base, ease }}
            className="fixed inset-x-0 bottom-0 z-40 overflow-y-auto bg-cloud lg:hidden"
            style={{ top: menuTop }}
          >
            <ul className="container-page flex flex-col gap-1 py-6">
              {brand.nav.map((n, i) => (
                <motion.li
                  key={n.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i, duration: duration.base, ease }}
                >
                  <Link
                    href={n.href}
                    aria-current={active(n.href) ? "page" : undefined}
                    className="flex items-center justify-between rounded-card px-4 py-4 font-display text-[1.75rem] font-bold tracking-tight text-ink hover:bg-white"
                  >
                    {n.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
