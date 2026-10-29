import clsx from "clsx";
import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  id,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  id?: string;
  className?: string;
}) {
  return (
    <div className={clsx("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 id={id} className="text-h2 font-bold text-ink">{title}</h2>
      {lead ? <p className="mt-4 text-lead text-muted">{lead}</p> : null}
    </div>
  );
}

export function Tbc({ children = "To be confirmed" }: { children?: ReactNode }) {
  return <span className="text-muted italic">{children}</span>;
}
