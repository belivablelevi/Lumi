import Link from "next/link";
import { brand } from "@/config/brand";
import { Mark } from "./Mark";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 rounded-lg ${className}`} aria-label={`${brand.name} home`}>
      <Mark className="h-7 w-auto text-ink transition-transform duration-300 ease-(--ease-out-soft) group-hover:-rotate-6" />
      <span className="font-display text-[1.45rem] font-extrabold tracking-[-0.04em] text-ink">{brand.name}</span>
    </Link>
  );
}
