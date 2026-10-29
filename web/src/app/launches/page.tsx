import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { launches } from "@/content/launches";
import { productBySlug } from "@/lib/catalogue";
import { confirmed } from "@/lib/placeholder";
import { STATUS_LABEL } from "@/lib/product-state";
import { PageHeader } from "@/components/ui/PageHeader";
import { LaunchSignupForm } from "@/components/forms/LaunchSignupForm";
import { Countdown } from "@/components/home/Countdown";
import { StatusBadge } from "@/components/ui/StatusBadge";

export const metadata: Metadata = { title: "Launches", description: "What's coming next from Lumi, and how to hear about it first." };

function When({ iso, tz }: { iso?: string; tz?: string }) {
  if (!iso || !tz) return <span className="text-muted">To be announced</span>;
  return (
    <span>
      {new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeStyle: "short", timeZone: tz, timeZoneName: "short" }).format(new Date(iso))}
    </span>
  );
}

export default function LaunchesPage() {
  return (
    <>
      <PageHeader eyebrow="Launches" title="What's coming next" lead="Dates appear here only once they're confirmed. Sign up and we'll email you when something opens." />
      <div className="container-page space-y-6">
        {launches.map((l) => {
          const at = confirmed(l.launchAt);
          const tz = confirmed(l.timeZone);
          const products = l.productSlugs.map(productBySlug).filter((p) => !!p);
          return (
            <section key={l.id} id={l.id} aria-labelledby={`${l.id}-title`} className="scroll-mt-28 grid overflow-hidden rounded-panel bg-white ring-1 ring-line lg:grid-cols-[1fr_1.1fr]">
              <div className="relative min-h-64 bg-lavender-pale">
                {l.image ? (
                  <Image src={l.image.src} alt={l.image.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-contain p-8" />
                ) : (
                  <div className="grid h-full min-h-64 place-items-center p-8 text-center text-sm text-muted">No pictures yet</div>
                )}
              </div>
              <div className="p-7 sm:p-10">
                <div className="flex flex-wrap gap-2">
                  {products.map((p) => <StatusBadge key={p.slug} status={p.status} />)}
                </div>
                <h2 id={`${l.id}-title`} className="mt-4 text-h2 font-bold">{l.name}</h2>
                <p className="mt-3 text-ink-soft">{l.description}</p>
                <dl className="mt-6 grid gap-3 text-[0.9375rem] sm:grid-cols-2">
                  <div><dt className="font-bold">Launch</dt><dd><When iso={at} tz={tz} /></dd></div>
                  <div><dt className="font-bold">Pre-orders open</dt><dd><When iso={confirmed(l.preorderOpensAt)} tz={tz} /></dd></div>
                </dl>
                {at && tz ? <div className="mt-6 rounded-card bg-night p-5 text-white"><Countdown at={at} timeZone={tz} /></div> : null}
                <LaunchSignupForm topic={l.id} className="mt-6" />
                <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold">
                  {products.map((p) => (
                    <Link key={p.slug} href={`/products/${p.slug}`} className="underline underline-offset-4">{p.name}: {STATUS_LABEL[p.status].toLowerCase()}</Link>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
