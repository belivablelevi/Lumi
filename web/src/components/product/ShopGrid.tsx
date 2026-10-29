"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import clsx from "clsx";
import type { Category, Product } from "@/content/products";
import { confirmed } from "@/lib/placeholder";
import { STATUS_LABEL, type ProductStatus } from "@/lib/product-state";
import { duration, ease } from "@/lib/motion";
import { ProductCard } from "./ProductCard";

type Sort = "featured" | "price-asc" | "price-desc" | "name";
const CATEGORY_LABEL: Record<Category, string> = { pocket: "Pocket Lumis", desk: "Desk Lumis" };
const AVAILABILITY: ProductStatus[] = ["available", "preorder", "coming_soon", "sold_out"];
const SEARCH_FROM = 12; // only offer search once the catalogue is big enough to need it

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={clsx(
        "h-10 rounded-chip px-4 text-sm font-semibold transition-colors",
        on ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30",
      )}
    >
      {children}
    </button>
  );
}

export function ShopGrid({ products, initialCategory }: { products: Product[]; initialCategory?: Category }) {
  const [category, setCategory] = useState<Category | "all">(initialCategory ?? "all");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [sort, setSort] = useState<Sort>("featured");
  const [q, setQ] = useState("");

  // Filters only for things that exist in the catalogue.
  const categories = [...new Set(products.map((p) => p.category))];
  const statuses = AVAILABILITY.filter((s) => products.some((p) => p.status === s));
  const priced = products.some((p) => confirmed(p.price));

  const shown = useMemo(() => {
    const price = (p: Product) => confirmed(p.price)?.amount ?? Number.POSITIVE_INFINITY;
    const list = products.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (status === "all" || p.status === status) &&
        (!q || `${p.name} ${p.tagline}`.toLowerCase().includes(q.toLowerCase())),
    );
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price-asc") list.sort((a, b) => price(a) - price(b));
    // Unpriced products go last either way.
    if (sort === "price-desc") list.sort((a, b) => (confirmed(b.price)?.amount ?? -1) - (confirmed(a.price)?.amount ?? -1));
    return list;
  }, [products, category, status, sort, q]);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {categories.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
              <Chip on={category === "all"} onClick={() => setCategory("all")}>All</Chip>
              {categories.map((c) => (
                <Chip key={c} on={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABEL[c]}</Chip>
              ))}
            </div>
          ) : null}
          {statuses.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Availability">
              <Chip on={status === "all"} onClick={() => setStatus("all")}>Any availability</Chip>
              {statuses.map((s) => (
                <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {products.length >= SEARCH_FROM ? (
            <label className="relative">
              <span className="sr-only">Search Lumis</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search" className="h-10 rounded-chip bg-white pr-4 pl-10 text-sm ring-1 ring-line outline-none focus:ring-ink/40" />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-10 rounded-chip bg-white px-3 text-sm font-semibold text-ink ring-1 ring-line outline-none focus:ring-ink/40"
            >
              <option value="featured">Featured</option>
              <option value="name">Name</option>
              {priced ? <option value="price-asc">Price, low to high</option> : null}
              {priced ? <option value="price-desc">Price, high to low</option> : null}
            </select>
          </label>
        </div>
      </div>
      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {shown.length} {shown.length === 1 ? "Lumi" : "Lumis"}
      </p>
      {shown.length ? (
        <motion.ul layout className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {shown.map((p) => (
              <motion.li key={p.slug} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: duration.base, ease }}>
                <ProductCard product={p} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <div className="mt-4 rounded-card border border-dashed border-ink/15 p-10 text-center">
          <p className="font-bold">No Lumis match those filters</p>
          <button type="button" className="mt-2 text-sm font-semibold underline" onClick={() => { setCategory("all"); setStatus("all"); setQ(""); }}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
