import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";

export interface PolicySection {
  heading: string;
  /** What still has to be written. Ignored once `body` is given. */
  note?: string;
  /** The real text, one paragraph per entry. */
  body?: string[];
}

/** Policy pages: real sections where the business has decided, outlines where it hasn't yet. */
export function PolicyPage({ title, lead, sections, children }: { title: string; lead: string; sections: PolicySection[]; children?: ReactNode }) {
  const unwritten = sections.filter((s) => !s.body?.length).length;
  return (
    <>
      <PageHeader eyebrow="Help" title={title} lead={lead} />
      <div className="container-page max-w-3xl">
        {unwritten ? (
          <div className="rounded-card bg-peach-pale p-5 text-sm text-peach-deep" role="note">
            <p className="font-bold">{unwritten === sections.length ? "This page is a placeholder." : "Parts of this page are still placeholders."}</p>
            <p className="mt-1">
              {unwritten === sections.length
                ? "The real policy hasn't been written yet. Nothing here is a commitment or a legal term."
                : "Sections marked \"to be written\" aren't decided yet and aren't a commitment or a legal term."}
            </p>
          </div>
        ) : null}
        {children}
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-h3 font-bold">{s.heading}</h2>
              {s.body?.length ? (
                s.body.map((p) => <p key={p} className="mt-2 text-ink-soft">{p}</p>)
              ) : (
                <p className="mt-2 text-muted italic">To be written: {s.note}</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
