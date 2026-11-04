import clsx from "clsx";
import type { Order } from "@/lib/store/types";

/** One label for where an order stands, worded for whoever's packing. */
export function orderStage(o: Order): { label: string; tone: "todo" | "warn" | "done" | "off" } {
  if (o.status === "refunded") return { label: "Refunded", tone: "off" };
  if (o.status === "review") return { label: "Check payment", tone: "warn" };
  if (o.status !== "paid") return { label: o.status[0]!.toUpperCase() + o.status.slice(1), tone: "off" };
  if (o.fulfilmentStatus === "shipped") return { label: "Shipped", tone: "done" };
  if (o.fulfilmentStatus === "packed") return { label: "Packed", tone: "todo" };
  return { label: "To pack", tone: "todo" };
}

const TONES = {
  todo: "bg-lavender-pale text-ink",
  warn: "bg-[#ffe6b3] text-ink",
  done: "bg-mint/60 text-ink",
  off: "bg-ink/5 text-muted",
};

export function OrderPill({ order, className }: { order: Order; className?: string }) {
  const s = orderStage(order);
  return <span className={clsx("inline-flex rounded-chip px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", TONES[s.tone], className)}>{s.label}</span>;
}
