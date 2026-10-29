import clsx from "clsx";
import { STATUS_LABEL, type ProductStatus } from "@/lib/product-state";

const tone: Record<ProductStatus, string> = {
  draft: "bg-line text-muted",
  coming_soon: "bg-lavender-pale text-lavender-deep",
  preorder: "bg-mint-pale text-mint-deep",
  available: "bg-mint text-ink",
  sold_out: "bg-peach-pale text-peach-deep",
  archived: "bg-line text-muted",
};

export function StatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  return (
    <span className={clsx("inline-flex h-7 items-center gap-1.5 rounded-chip px-3 text-xs font-bold", tone[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
