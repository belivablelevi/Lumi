"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PRINT_KEY, getCore, type PrintDoc } from "@/lib/studio/client";
import type { StudioCore } from "@/lib/studio/core";
import type { ManifestRow } from "@/lib/studio/factory";
import { OddsCardLetter, OddsCardPages } from "./OddsCard";
import { UnitCardSheets } from "./UnitCards";

const PAGES: Record<PrintDoc, { title: string; size: string; how: string }> = {
  cards: {
    title: "Birth certificates",
    size: "8.5in 11in",
    how: "Letter paper, actual size (100%), two-sided, flip on long edge. Each sheet is a page of fronts, then a page of backs.",
  },
  odds: {
    title: "Odds card for a print shop",
    size: "4.25in 6.25in",
    how: "Two pages, 4 × 6 in plus bleed. Save as PDF and send it to the print shop.",
  },
  "odds-letter": {
    title: "Odds cards, 2 per Letter sheet",
    size: "8.5in 11in",
    how: "Letter paper, actual size (100%), two-sided, flip on long edge. Cut on the marks.",
  },
};

/**
 * The print page: just the sheets, at their real size. In Chrome's print dialog choose
 * "Save as PDF" (or a printer), margins "None" and scale 100%. The page size is set for you.
 */
function savedRows(): ManifestRow[] {
  try {
    return (JSON.parse(localStorage.getItem(PRINT_KEY) ?? "{}") as { rows?: ManifestRow[] }).rows ?? [];
  } catch {
    return [];
  }
}

const noop = () => () => {};

export function PrintView({ doc }: { doc: PrintDoc }) {
  const [core, setCore] = useState<StudioCore | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Client only: the rows live in this browser's storage, and the sheets go straight under <body>.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [rows] = useState<ManifestRow[] | null>(() => (typeof window === "undefined" ? null : savedRows()));

  useEffect(() => {
    getCore().then(setCore, (e: unknown) => setError(String(e)));
    // Everything else on the page is hidden, on screen and on paper.
    document.body.classList.add("studio-printing");
    return () => document.body.classList.remove("studio-printing");
  }, []);

  const page = PAGES[doc];
  const ready = core && rows && (doc !== "cards" || rows.length > 0);
  if (!mounted) return null;
  return createPortal(
    <div id="studio-print">
      <style>{`
        @page { size: ${page.size}; margin: 0; }
        body.studio-printing > :not(#studio-print) { display: none !important; }
        body.studio-printing { background: #e9e3ea; }
        #studio-print .studio-sheet { display: block; margin: 24px auto; background: #fff; box-shadow: 0 2px 12px rgba(48,38,58,.18); }
        @media print {
          body.studio-printing { background: #fff; }
          #studio-print .studio-toolbar { display: none !important; }
          #studio-print .studio-sheet { margin: 0; box-shadow: none; break-after: page; }
        }
      `}</style>
      <div className="studio-toolbar sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-white px-6 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-ink">{page.title}</h1>
          <p className="text-sm text-muted">{page.how} In the print dialog, set Margins to None.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          className="inline-flex h-11 items-center rounded-chip bg-ink px-5 font-semibold text-white hover:bg-ink-soft disabled:opacity-40"
        >
          Print or save as PDF
        </button>
      </div>
      {error ? <p className="p-6">Couldn&apos;t start the face engine: {error}</p> : null}
      {!core || !rows ? <p className="p-6 text-muted">Drawing the cards…</p> : null}
      {core && rows && doc === "cards" ? (
        rows.length ? <UnitCardSheets rows={rows} core={core} /> : <p className="p-6">No units to print: generate or open a batch in Studio first.</p>
      ) : null}
      {core && doc === "odds" ? <OddsCardPages core={core} /> : null}
      {core && doc === "odds-letter" ? <OddsCardLetter core={core} /> : null}
    </div>,
    document.body,
  );
}
