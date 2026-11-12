import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/components/admin/CopyButton";
import { buttonClass } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/admin-session";
import { VIDEOS, VIDEO_GROUPS } from "@/lib/videos";

export const metadata: Metadata = { title: "Videos", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The finished films for TikTok and Instagram, each with its caption. */
export default async function Page() {
  await requireAdmin();
  return (
    <>
      <p>
        <Link href="/admin" className="text-sm font-semibold text-muted underline underline-offset-4">
          Back to orders
        </Link>
      </p>
      <h1 className="mt-4 text-h2 font-bold">Videos</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The {VIDEOS.length} finished films, ready to post. Play one, copy its caption, and download it to post from this device. The same
        caption works on Instagram and TikTok.
      </p>

      {VIDEO_GROUPS.map((group) => {
        const videos = VIDEOS.filter((v) => v.group === group.id);
        if (!videos.length) return null;
        return (
          <section key={group.id} className="mt-10">
            <h2 className="text-h3 font-bold">{group.title}</h2>
            <p className="mt-1 text-sm text-muted">{group.note}</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <li key={v.slug} className="flex flex-col gap-3 rounded-card bg-white p-4 ring-1 ring-line">
                  <video
                    className="aspect-[9/16] w-full rounded-card bg-ink"
                    src={`/videos/${v.slug}.mp4`}
                    controls
                    playsInline
                    preload="metadata"
                  />
                  <div>
                    <h3 className="font-semibold">{v.title}</h3>
                    <p className="text-sm text-muted">{[v.seconds ? `${v.seconds} s` : "", v.note].filter(Boolean).join(" · ")}</p>
                  </div>
                  <p className="whitespace-pre-wrap rounded-card bg-lavender-pale px-3 py-2 text-sm">{v.caption}</p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <CopyButton text={v.caption} label="Copy caption" />
                    <a href={`/videos/${v.slug}.mp4`} download={`${v.title}.mp4`} className={buttonClass("outline", "md", "h-9 px-4 text-sm")}>
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
