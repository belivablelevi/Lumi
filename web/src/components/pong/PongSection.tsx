import { renderImage } from "@/lib/renders";
import { SectionHeading } from "../ui/Section";
import { PongDuel } from "./PongDuel";

export function PongSection({ compact = false }: { compact?: boolean }) {
  return (
    <section id="boop-pong" aria-labelledby="pong-title" className="container-page scroll-mt-24 py-12 lg:py-16">
      <div className={compact ? "" : "grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-14"}>
        <div className={compact ? "mb-8 max-w-2xl" : ""}>
          <SectionHeading
            id="pong-title"
            eyebrow="Boop Pong"
            title="Play a Lumi at Pong."
            lead="Two Lumis, one ball. Each screen is half the table, and you tilt your Lumi to slide the paddle. This is the real Lumi firmware running in your browser."
          />
          <div className="mt-6 rounded-card bg-lavender-pale p-5">
            <p className="font-bold text-ink">Every Lumi is one of a kind</p>
            <p className="mt-1 text-ink-soft">
              Each match deals two brand-new Lumis, made by the same code that gives every real unit its own eyes, glint and temperament. You&apos;ll never meet the same pair twice, and they each win, lose and sulk in their own way.
            </p>
          </div>
        </div>
        <PongDuel you={renderImage("front-lavender.png")} pal={renderImage("front-mint.png")} />
      </div>
    </section>
  );
}
