import type { Metadata } from "next";
import { manifest } from "@/lib/lumi-frames";
import { temperamentLine } from "@/content/personas";
import { PageHeader } from "@/components/ui/PageHeader";
import { PersonalityShowcase } from "@/components/home/PersonalityShowcase";
import { SectionHeading } from "@/components/ui/Section";
import { OledScreen } from "@/components/lumi/OledScreen";

export const metadata: Metadata = { title: "Our World", description: "The idea behind Lumi: small companions with personalities of their own." };

const IDEAS = [
  { title: "Expressive first", text: "A Lumi's face is its whole personality. Twenty-nine expressions blend into each other, with blinks and little glances on top, so it never looks frozen." },
  { title: "No buttons, no apps", text: "You talk to a Lumi with your hands. A pat, a shake, a tilt, picking it up. It answers right away." },
  { title: "One of a kind", text: "Every Lumi gets its own eyes, glint, accent and temperament at random. No two are the same, which one you get is down to luck, and a few are legendary." },
  { title: "Better together", text: "Two Lumis can play Boop Pong: classic Pong across two little screens, steered by tilting." },
];

export default function OurWorldPage() {
  return (
    <>
      <PageHeader eyebrow="Our World" title="Little companions. Big personality." lead="Lumi is built on a simple idea: the things we carry every day could have a little more character." />
      <section className="container-page grid gap-5 sm:grid-cols-2" aria-label="What Lumi is about">
        {IDEAS.map((x, i) => (
          <div key={x.title} className={`rounded-card p-7 ${["bg-lavender-pale", "bg-mint-pale", "bg-peach-pale", "bg-white ring-1 ring-line"][i]}`}>
            <h2 className="text-h3 font-bold">{x.title}</h2>
            <p className="mt-2 text-ink-soft">{x.text}</p>
          </div>
        ))}
      </section>
      <div className="mt-16"><PersonalityShowcase /></div>
      <section className="container-page py-16" aria-labelledby="temper-title">
        <SectionHeading id="temper-title" eyebrow="Temperaments" title="Five ways to be a Lumi" />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Object.entries(temperamentLine).map(([k, v]) => (
            <li key={k} className="rounded-card bg-white p-5 ring-1 ring-line">
              <p className="font-bold capitalize">{k}</p>
              <p className="mt-1 text-sm text-muted">{v}</p>
            </li>
          ))}
        </ul>
        <div className="mt-12 rounded-panel bg-night p-6 sm:p-10">
          <div className="mx-auto aspect-[2/1] max-w-xl">
            <OledScreen src={manifest.personas[0]!.animations.boot_hello!.file} label="Lumi saying hello" />
          </div>
        </div>
      </section>
    </>
  );
}
