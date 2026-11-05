import type { Metadata } from "next";
import Link from "next/link";
import { StudioApp } from "@/components/studio/StudioApp";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = { title: "Lumi Studio", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Lumi Studio in the browser: faces, animations, personalities and factory batches (no install). */
export default async function Page() {
  await requireAdmin();
  return (
    // Wider than the other admin pages: the editors need the room.
    <div className="relative left-1/2 w-[min(calc(100vw-2rem),88rem)] -translate-x-1/2">
      <p>
        <Link href="/admin" className="text-sm font-semibold text-muted underline underline-offset-4">
          Back to orders
        </Link>
      </p>
      <h1 className="mt-4 text-h2 font-bold">Lumi Studio</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Design faces and animations, try personalities and make factory batches, drawn by Lumi&apos;s own face engine. Your work is
        kept in this browser; use Save project to keep a file. Setting up units over USB and flashing firmware are in the desktop app.
      </p>
      <StudioApp />
    </div>
  );
}
