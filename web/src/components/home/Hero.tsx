"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { brand } from "@/config/brand";
import type { GalleryImage } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { ease, duration } from "@/lib/motion";
import { DeviceFrame } from "../lumi/DeviceFrame";
import { PersonaChip } from "../lumi/PersonaChip";
import { ButtonLink } from "../ui/Button";

interface HeroUnit {
  persona: string;
  image: GalleryImage;
}

function Floating({ children, delay, className }: { children: React.ReactNode; delay: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow + 0.2, ease, delay }}
    >
      {/* A gentle idle bob in CSS (see globals.css); off when motion is reduced. */}
      <div className="lumi-float" style={{ animationDelay: `${delay * 3}s` }}>
        {children}
      </div>
    </motion.div>
  );
}

export function Hero({ units, statusLabel }: { units: [HeroUnit, HeroUnit, HeroUnit]; statusLabel: string }) {
  const [main, left, right] = units;
  return (
    <section aria-labelledby="hero-title" className="container-page pt-2 pb-16 sm:pt-6 lg:pb-24">
      <div className="relative overflow-hidden rounded-panel bg-gradient-to-br from-lavender-pale via-[#f6effa] to-peach-pale">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_28rem_at_85%_10%,rgb(182_229_207/0.55),transparent_70%)]" aria-hidden />
        <div className="relative grid items-center gap-6 px-6 pt-10 pb-6 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:px-16 lg:py-16">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
            className="max-w-xl"
          >
            <motion.p
              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } } }}
              className="inline-flex items-center gap-2 rounded-chip bg-white/70 px-3 py-1.5 text-[0.8125rem] font-bold text-ink-soft"
            >
              <span className="size-1.5 rounded-full bg-lavender-deep" aria-hidden />
              Pocket Lumi · {statusLabel}
            </motion.p>
            <motion.h1
              id="hero-title"
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } } }}
              className="mt-5 text-display font-extrabold text-ink"
            >
              A little personality.
              <br />
              <span className="text-lavender-deep">A lot of feeling.</span>
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } } }}
              className="mt-6 max-w-md text-lead text-ink-soft"
            >
              Meet the tiny digital companions that bring a little more life to your keys and your desk.
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } } }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <ButtonLink href="/shop" size="lg">
                Meet the Lumis <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/launches" size="lg" variant="outline">
                Discover the next drop
              </ButtonLink>
            </motion.div>
          </motion.div>

          <div className="relative mx-auto aspect-[1.1] w-full max-w-[600px]" aria-label="Three example Lumis">
            <Floating delay={0.25} className="absolute top-[4%] left-[-2%] w-[40%]">
              <DeviceFrame image={left.image} src={persona(left.persona).idle.file} label={`${persona(left.persona).name}, idling`} sizes="240px" />
            </Floating>
            <Floating delay={0.35} className="absolute top-[0%] right-[-2%] w-[38%]">
              <DeviceFrame image={right.image} src={persona(right.persona).idle.file} label={`${persona(right.persona).name}, idling`} sizes="240px" />
            </Floating>
            <Floating delay={0.1} className="absolute bottom-[4%] left-1/2 w-[60%] -translate-x-1/2">
              <DeviceFrame image={main.image} src={persona(main.persona).idle.file} label={`${persona(main.persona).name}, idling`} priority sizes="(min-width: 1024px) 360px, 60vw" />
            </Floating>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: duration.slow }}
              className="absolute bottom-[-1%] left-1/2 hidden -translate-x-1/2 sm:block"
            >
              <PersonaChip p={persona(main.persona)} />
            </motion.div>
          </div>
        </div>
        <p className="relative px-6 pb-6 text-xs text-muted sm:px-10 lg:px-16">
          Renders of the prototype design. The screens play {brand.name}&apos;s real firmware animations; the faces are example units.
        </p>
      </div>
    </section>
  );
}
