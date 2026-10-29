"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { GalleryImage } from "@/content/products";
import { persona } from "@/lib/lumi-frames";
import { duration, ease } from "@/lib/motion";
import { DeviceFrame } from "../lumi/DeviceFrame";

export function Gallery({ images, personaId, name }: { images: GalleryImage[]; personaId?: string; name: string }) {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  if (!images.length) return null;
  const n = images.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const img = images[i]!;
  const p = personaId ? persona(personaId) : undefined;

  return (
    <div
      className="select-none"
      role="region"
      aria-roledescription="carousel"
      aria-label={`${name} images`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-panel bg-gradient-to-br from-lavender-pale to-cloud"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current === null) return;
          const dx = e.clientX - start.current;
          start.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={img.src}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: duration.base, ease }}
            className="absolute inset-0 grid place-items-center p-[6%]"
            aria-live="polite"
          >
            {img.screen && p ? (
              <DeviceFrame image={img} src={p.idle.file} label={`${p.name}, idling`} priority={i === 0} className="w-full" sizes="(min-width: 1024px) 50vw, 100vw" />
            ) : (
              <Image src={img.src} alt={img.alt} width={img.width} height={img.height} priority={i === 0} sizes="(min-width: 1024px) 50vw, 100vw" className="h-full w-auto object-contain" />
            )}
          </motion.div>
        </AnimatePresence>
        {n > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft hover:bg-white" aria-label="Previous image">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft hover:bg-white" aria-label="Next image">
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
        <p className="absolute right-4 bottom-4 left-4 text-center text-xs text-muted">
          {img.caption ?? (img.kind === "render" ? "Render" : "")}
          <span className="sr-only"> · Image {i + 1} of {n}</span>
        </p>
      </div>
      {n > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((im, j) => (
            <button
              key={im.src}
              type="button"
              onClick={() => setI(j)}
              aria-label={`Show image ${j + 1}: ${im.alt}`}
              aria-current={i === j}
              className={clsx(
                "relative size-20 shrink-0 overflow-hidden rounded-[18px] bg-lavender-pale ring-2 transition-[box-shadow]",
                i === j ? "ring-ink" : "ring-transparent hover:ring-ink/20",
              )}
            >
              <Image src={im.src} alt="" fill sizes="80px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
