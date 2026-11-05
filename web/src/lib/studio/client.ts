/** Browser-side pieces shared by the Studio page and its print page. */
import { loadCore, type StudioCore } from "./core";

let corePromise: Promise<StudioCore> | null = null;
/** The face engine, loaded once per page. */
export const getCore = () => (corePromise ??= loadCore(fetch("/studio/lumicore.wasm")));

export const PRINT_KEY = "lumi-studio-print";
export type PrintDoc = "cards" | "odds" | "odds-letter";

/** Hands the rows to the print page (a new tab) through this browser's storage. */
export function openPrint(doc: PrintDoc, rows: unknown[] = []) {
  try {
    localStorage.setItem(PRINT_KEY, JSON.stringify({ doc, rows }));
  } catch {
    // Too big for storage: the print page then has no rows and says so.
  }
  window.open(`/admin/studio/print?doc=${doc}`, "_blank");
}
