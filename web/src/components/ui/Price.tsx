import clsx from "clsx";
import { formatMoney, type Money } from "@/lib/money";
import { confirmed, type Maybe } from "@/lib/placeholder";

export function Price({ price, demo, className }: { price: Maybe<Money>; demo?: boolean; className?: string }) {
  const p = confirmed(price);
  if (!p) return <span className={clsx("text-muted", className)}>Price to be announced</span>;
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <span className="font-bold tabular-nums">{formatMoney(p)}</span>
      {demo ? (
        <span className="rounded-md bg-peach px-1.5 py-0.5 text-[0.65rem] font-extrabold tracking-wider text-ink">DEMO PRICE</span>
      ) : null}
    </span>
  );
}
