import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { OledScreen } from "../lumi/OledScreen";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/Section";
import { StatusBadge } from "../ui/StatusBadge";

export function ChooseCompanion({ pocket, desk }: { pocket: Product; desk?: Product }) {
  const img = pocket.images.find((i) => i.src.endsWith("on-keyring.png")) ?? pocket.images[0];
  return (
    <section aria-labelledby="choose-title" className="container-page py-12 lg:py-16">
      <SectionHeading id="choose-title" eyebrow="Choose your companion" title="One for your keys. One for your desk." />
      <div className="mt-10 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Reveal>
          <Link href="/pocket" className="group relative flex min-h-[28rem] flex-col overflow-hidden rounded-panel bg-mint-pale p-8 sm:p-10">
            <div className="relative z-10 max-w-xs">
              <StatusBadge status={pocket.status} />
              <h3 className="mt-4 text-h1 font-extrabold">Pocket Lumis</h3>
              <p className="mt-3 text-ink-soft">Keychain-sized, 35 × 37 mm. Clips onto your keys or bag and reacts to every pat, shake and tilt.</p>
              <span className="mt-6 inline-flex items-center gap-2 font-bold text-ink">
                Explore Pocket Lumis <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
            {img ? (
              <div className="absolute right-[-6%] bottom-[-8%] w-[62%] max-w-[420px] transition-transform duration-500 ease-(--ease-out-soft) group-hover:-rotate-3 sm:w-[48%]">
                <Image src={img.src} alt={img.alt} width={img.width} height={img.height} sizes="(min-width: 1024px) 420px, 60vw" />
              </div>
            ) : null}
          </Link>
        </Reveal>
        {desk ? (
          <Reveal delay={0.08}>
            <Link href="/desk" className="group flex min-h-[28rem] flex-col overflow-hidden rounded-panel bg-ink p-8 text-white sm:p-10">
              <div>
                <StatusBadge status={desk.status} className="bg-white/10 text-white" />
                <h3 className="mt-4 text-h1 font-extrabold">Desk Lumis</h3>
                <p className="mt-3 max-w-xs text-white/75">{desk.description[0]}</p>
                <span className="mt-6 inline-flex items-center gap-2 font-bold">
                  Follow along <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
              <div className="mt-auto pt-10">
                <div className="mx-auto aspect-[2/1] w-full max-w-[300px] rounded-[18px] bg-black p-3 ring-1 ring-white/10">
                  <OledScreen src={persona("ni").animations.nod_off!.file} label="A sleepy Lumi face" />
                </div>
                <p className="mt-3 text-center text-xs text-white/50">Design in progress. This is a Lumi face, not the Desk Lumi itself.</p>
              </div>
            </Link>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
