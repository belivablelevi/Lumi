"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Product } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { formatMoney } from "@/lib/money";
import { duration, ease } from "@/lib/motion";
import { confirmed } from "@/lib/placeholder";
import { pillCta, STATUS_LABEL } from "@/lib/product-state";

/** Pages that already are the next step, or where a sales prompt would get in the way. */
const HIDDEN_ON = ["/cart", "/checkout", "/launches", "/signup", "/unsubscribe"];
/** The opening block of a page: the home hero, a page header, or a product's buy section. */
const PAGE_HEAD = "main > :is(section, header)";

/** The floating bar at the bottom of the page. What it says follows the product's status. */
export function LumiCtaPill({ product }: { product: Product }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [pastHead, setPastHead] = useState(false);
  const [footerInView, setFooterInView] = useState(false);

  // Wait until the page's head has scrolled off, so the pill never competes with its buttons.
  useEffect(() => {
    const head = document.querySelector(PAGE_HEAD) ?? document.querySelector("main");
    if (!head) return;
    const observer = new IntersectionObserver(([entry]) => setPastHead(entry ? !entry.isIntersecting && entry.boundingClientRect.bottom <= 0 : false));
    observer.observe(head);
    return () => observer.disconnect();
  }, [pathname]);

  // Step aside at the footer so it never covers the legal links.
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(([entry]) => setFooterInView(entry?.isIntersecting ?? false));
    observer.observe(footer);
    return () => observer.disconnect();
  }, [pathname]);

  const cta = pillCta(product);
  const hiddenHere = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const price = confirmed(product.price);
  const image = product.images[0];
  const example = product.personas[0];
  const face = example ? persona(example).posters.happy : undefined;
  const offset = reduced ? 0 : 24;

  return (
    <AnimatePresence>
      {cta && !hiddenHere && pastHead && !footerInView ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
          <motion.aside
            aria-label={product.name}
            initial={{ opacity: 0, y: offset }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: offset }}
            transition={{ duration: duration.base, ease }}
            className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-chip bg-night p-2 text-white shadow-lift ring-1 ring-white/10 sm:gap-3"
          >
            {image ? (
              <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-cloud max-[359px]:hidden">
                <Image src={image.src} alt="" fill sizes="48px" className="object-contain" />
                {image.screen && face ? (
                  <Image
                    src={face}
                    alt=""
                    width={128}
                    height={64}
                    unoptimized
                    className="absolute"
                    style={{ left: `${image.screen.left * 100}%`, top: `${image.screen.top * 100}%`, width: `${image.screen.width * 100}%`, height: `${image.screen.height * 100}%` }}
                  />
                ) : null}
              </span>
            ) : null}
            <div className="min-w-0 pl-1 leading-tight max-[359px]:pl-3">
              <p className="truncate text-sm font-bold">{product.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs whitespace-nowrap text-white/70 tabular-nums">
                {price ? formatMoney(price) : STATUS_LABEL[product.status]}
                {price && product.demo ? (
                  <span className="rounded bg-peach px-1 text-[0.6rem] font-extrabold tracking-wider text-ink">DEMO PRICE</span>
                ) : null}
              </p>
            </div>
            <Link
              href={cta.href}
              aria-label={`${cta.label}: ${product.name}`}
              className="ml-1 inline-flex h-11 shrink-0 items-center justify-center rounded-chip bg-peach px-4 text-sm font-bold whitespace-nowrap text-ink transition-[background-color,transform] duration-200 ease-(--ease-out-soft) hover:bg-[#ffb998] focus-visible:outline-white active:scale-[0.97] sm:ml-3 sm:px-5"
            >
              <span className="max-[419px]:hidden">{cta.label}</span>
              <span className="min-[420px]:hidden">{cta.shortLabel}</span>
            </Link>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
