import Link from "next/link";
import { makingSteps, origin } from "@/content/making";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/Section";
import { ButtonLink } from "../ui/Button";

const SHOWN = ["case", "brain", "dice", "testing"] as const;
const LABEL: Record<(typeof SHOWN)[number], string> = { case: "Designed", brain: "Wired", dice: "Rolled", testing: "Tested" };

/** Four steps of how a Lumi is made, each linking into /how-its-made. */
export function HowItsMade() {
  const steps = SHOWN.map((id) => makingSteps.find((s) => s.id === id)!);
  return (
    <section aria-labelledby="made-title" className="container-page py-12 lg:py-16">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          id="made-title"
          eyebrow={origin.chip}
          title="From a pile of parts to a face that notices you."
          lead={origin.line}
        />
        <div className="flex shrink-0 flex-wrap gap-3">
          <ButtonLink href="/how-its-made" variant="outline">How it&apos;s made</ButtonLink>
          <ButtonLink href="/roll" variant="soft">Roll a Lumi</ButtonLink>
        </div>
      </div>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Reveal delay={i * 0.06}>
              <Link
                href={`/how-its-made#${s.id}`}
                className="block h-full rounded-card bg-white p-5 ring-1 ring-line transition-shadow hover:shadow-soft"
              >
                <p className="eyebrow">{i + 1}. {LABEL[s.id as (typeof SHOWN)[number]]}</p>
                <p className="mt-2 font-bold">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.text[0]!.split(". ")[0]!.replace(/\.$/, "")}.</p>
              </Link>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
