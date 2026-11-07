import type { Metadata } from "next";
import Link from "next/link";
import { ClipMakerLoader } from "@/components/clips/ClipMakerLoader";
import { requireAdmin } from "@/lib/admin-session";

export const metadata: Metadata = { title: "Clip maker", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Videos and stills of Lumi for TikTok and Instagram, drawn in the browser. */
export default async function Page() {
  await requireAdmin();
  return (
    <div className="relative left-1/2 w-[min(calc(100vw-2rem),76rem)] -translate-x-1/2">
      <p>
        <Link href="/admin" className="text-sm font-semibold text-muted underline underline-offset-4">
          Back to orders
        </Link>
      </p>
      <h1 className="mt-4 text-h2 font-bold">Clip maker</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Short videos and stills for TikTok and Instagram: the real case spinning with Lumi&apos;s face on its screen and your feature
        lines, or a close-up of the face with captions. Everything is drawn in this browser, and your settings are remembered here.
      </p>
      <ClipMakerLoader />
    </div>
  );
}
