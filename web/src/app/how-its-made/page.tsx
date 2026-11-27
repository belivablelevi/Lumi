import type { Metadata } from "next";
import Link from "next/link";
import { inside, makingSteps, origin } from "@/content/making";
import { combinations } from "@/content/odds";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { MakingWorkshop } from "@/components/home/MakingWorkshop";

export const metadata: Metadata = {
  title: "How a Lumi is made",
  description: "Designed, printed, wired and tested in Ottawa: how a Lumi goes from a pile of parts to a face that notices you.",
  alternates: { canonical: "/how-its-made" },
};

const TINTS = ["bg-lavender-pale", "bg-mint-pale", "bg-peach-pale", "bg-white ring-1 ring-line"];

export default function HowItsMadePage() {
  return (
    <>
      <PageHeader
        eyebrow={origin.chip}
        title="From a pile of parts to a face that notices you."
        lead={`${origin.line} ${origin.partsNote}`}
      />

      <MakingWorkshop heading={false} />

      <section className="container-page pt-16" aria-label="The whole story">
        <ol className="grid gap-5 sm:grid-cols-2">
          {makingSteps.map((s, i) => (
            <li key={s.id} id={s.id} className="scroll-mt-28">
              <Reveal delay={(i % 2) * 0.06}>
                <div className={`h-full rounded-card p-7 ${TINTS[i % TINTS.length]}`}>
                  <p className="eyebrow">Step {i + 1}</p>
                  <h2 className="mt-2 text-h3 font-bold">{s.title}</h2>
                  <div className="mt-3 space-y-3 text-ink-soft">
                    {s.text.map((t) => <p key={t}>{t}</p>)}
                  </div>
                  {s.id === "dice" ? (
                    <p className="mt-4 text-sm text-ink-soft">
                      {combinations.toLocaleString("en-CA")} possible Lumis.{" "}
                      <Link href="/roll" className="font-semibold underline">Roll one yourself</Link>
                      {" "}or{" "}
                      <Link href="/products/pocket-lumi#odds-title" className="font-semibold underline">see every chance</Link>.
                    </p>
                  ) : null}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page py-16" aria-labelledby="inside-title">
        <SectionHeading id="inside-title" eyebrow="What's inside" title="Five parts, one tiny face." />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {inside.map((x) => (
            <li key={x.name} className="rounded-card bg-white p-5 ring-1 ring-line">
              <p className="font-bold">{x.name}</p>
              <p className="mt-1 text-sm text-muted">{x.what}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-muted">
          Lumi is still a prototype. The pictures on this site are renders of the design, and we&apos;ll add photos of the real thing as the first units are made.
        </p>
      </section>

      <section className="container-page pb-4" aria-label="Follow the build">
        <div className="rounded-panel bg-night p-8 text-white sm:p-12">
          <p className="eyebrow !text-white/60">Follow the build</p>
          <h2 className="mt-3 max-w-xl text-h2 font-bold">Watch it get made, one problem at a time.</h2>
          <p className="mt-3 max-w-xl text-white/70">The build log, the failed prints and the first power-on all go on Instagram and TikTok as they happen.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/roll" variant="light">Roll a Lumi</ButtonLink>
            <ButtonLink href="/our-world" variant="ghost" className="!text-white hover:!bg-white/10">Our World</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
