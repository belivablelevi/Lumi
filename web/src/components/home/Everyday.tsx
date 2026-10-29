import Image from "next/image";
import type { GalleryImage } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { OledScreen } from "../lumi/OledScreen";
import { Reveal } from "../ui/Reveal";
import { SectionHeading } from "../ui/Section";

export function Everyday({ keyring, side }: { keyring: GalleryImage; side: GalleryImage }) {
  return (
    <section aria-labelledby="everyday-title" className="container-page py-16 lg:py-24">
      <SectionHeading
        id="everyday-title"
        eyebrow="Made for your everyday"
        title="Small enough to come along. Lively enough to notice."
        lead="Lumi has no buttons. You pat it, tilt it, pick it up, and it answers."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <Reveal className="md:row-span-2">
          <figure className="flex h-full flex-col overflow-hidden rounded-card bg-peach-pale">
            <div className="relative flex-1 p-6">
              <Image src={keyring.src} alt={keyring.alt} width={keyring.width} height={keyring.height} sizes="(min-width: 768px) 33vw, 90vw" className="mx-auto h-full max-h-[460px] w-auto object-contain" />
            </div>
            <figcaption className="p-6 pt-0">
              <p className="font-bold">On your keys</p>
              <p className="text-sm text-muted">A keyring loop on top. It sleeps in your pocket and wakes when you pick it up.</p>
            </figcaption>
          </figure>
        </Reveal>
        <Reveal delay={0.06}>
          <figure className="overflow-hidden rounded-card bg-lavender-pale">
            <div className="relative aspect-[4/3]">
              <Image src={side.src} alt={side.alt} fill sizes="(min-width: 768px) 33vw, 90vw" className="object-contain p-4" />
            </div>
            <figcaption className="p-6 pt-0">
              <p className="font-bold">Charges over USB-C</p>
              <p className="text-sm text-muted">A port on the side. New animations can arrive over Wi-Fi.</p>
            </figcaption>
          </figure>
        </Reveal>
        <Reveal delay={0.12}>
          <figure className="overflow-hidden rounded-card bg-night text-white">
            <div className="p-6">
              <div className="aspect-[2/1] rounded-[14px] bg-black p-2 ring-1 ring-white/10">
                <OledScreen src={persona("mimox").animations.pong_win_match!.file} label="Lumi celebrating a Boop Pong win" />
              </div>
            </div>
            <figcaption className="p-6 pt-0">
              <p className="font-bold">Play with a friend</p>
              <p className="text-sm text-white/70">Boop Pong: hold two Lumis near each other and tilt to move your paddle.</p>
            </figcaption>
          </figure>
        </Reveal>
        <Reveal delay={0.18} className="md:col-span-2">
          <div className="flex h-full flex-col justify-center rounded-card border border-dashed border-ink/15 p-6 text-sm text-muted">
            <p className="font-bold text-ink">Photos are on the way</p>
            <p className="mt-1">
              These are renders of the prototype design. We&apos;ll add real photos of Lumis on desks, bags and keys once the first units are made.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
