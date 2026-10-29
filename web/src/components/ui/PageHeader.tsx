import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, lead, children }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="container-page pt-8 pb-10 sm:pt-12 lg:pb-14">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 className="mt-3 max-w-3xl text-h1 font-extrabold">{title}</h1>
      {lead ? <p className="mt-4 max-w-2xl text-lead text-muted">{lead}</p> : null}
      {children}
    </header>
  );
}
