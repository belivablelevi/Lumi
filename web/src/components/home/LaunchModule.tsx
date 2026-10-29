import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { Launch } from "@/content/launches";
import { confirmed } from "@/lib/placeholder";
import { LaunchSignupForm } from "../forms/LaunchSignupForm";
import { ButtonLink } from "../ui/Button";
import { Countdown } from "./Countdown";

export function LaunchModule({ launch }: { launch: Launch }) {
  const at = confirmed(launch.launchAt);
  const tz = confirmed(launch.timeZone);
  return (
    <section aria-labelledby="launch-title" className="container-page py-16 lg:py-24">
      <div className="relative grid overflow-hidden rounded-panel bg-night text-white lg:grid-cols-2">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(34rem_26rem_at_0%_100%,rgb(221_187_234/0.22),transparent_70%)]" aria-hidden />
        <div className="relative p-8 sm:p-12 lg:p-16">
          <p className="eyebrow text-white/55">Upcoming launch</p>
          <h2 id="launch-title" className="mt-3 text-h1 font-extrabold">{at ? launch.name : "Something new is on the way"}</h2>
          <p className="mt-4 max-w-md text-lead text-white/75">{launch.description}</p>
          <div className="mt-8">
            {at && tz ? (
              <Countdown at={at} timeZone={tz} />
            ) : (
              <p className="inline-flex rounded-chip bg-white/10 px-4 py-2 text-sm font-semibold">Date to be announced</p>
            )}
          </div>
          <LaunchSignupForm topic={launch.id} tone="dark" className="mt-8 max-w-md" />
          <ButtonLink href={`/launches#${launch.id}`} variant="ghost" className="mt-2 -ml-4 text-white hover:bg-white/10">
            View launch details <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
        {launch.image ? (
          <div className="relative min-h-72 lg:min-h-0">
            <Image src={launch.image.src} alt={launch.image.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-8 lg:p-14" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
