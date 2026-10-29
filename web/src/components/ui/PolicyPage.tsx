import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

/** Policy pages are outlines until the business supplies its real terms. */
export function PolicyPage({ title, lead, sections, children }: { title: string; lead: string; sections: { heading: string; note: string }[]; children?: ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Help" title={title} lead={lead} />
      <div className="container-page max-w-3xl">
        <div className="rounded-card bg-peach-pale p-5 text-sm text-peach-deep" role="note">
          <p className="font-bold">This page is a placeholder.</p>
          <p className="mt-1">The real policy hasn&apos;t been written yet. Nothing here is a commitment or a legal term.</p>
        </div>
        {children}
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-h3 font-bold">{s.heading}</h2>
              <p className="mt-2 text-muted italic">To be written: {s.note}</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
