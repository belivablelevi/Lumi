import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";

type Variant = "primary" | "soft" | "ghost" | "outline";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-chip font-semibold transition-[background-color,color,box-shadow,transform] duration-200 ease-(--ease-out-soft) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft shadow-soft",
  soft: "bg-lavender text-ink hover:bg-[#d3a9e3]",
  ghost: "text-ink hover:bg-ink/5",
  outline: "border border-ink/15 bg-white/60 text-ink hover:border-ink/40 hover:bg-white",
};
const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & { variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} {...props} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
