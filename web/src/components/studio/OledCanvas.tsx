"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";
import { OLED_CYAN, OLED_OFF, pixelOn } from "@/lib/studio/frame-image";

/** One 128 x 64 frame from the face engine, drawn like the unit's OLED. */
export function OledCanvas({ frame, label, scale = 4, className }: { frame: Uint8Array | null; label: string; scale?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = OLED_OFF;
    ctx.fillRect(0, 0, 128 * scale, 64 * scale);
    if (!frame) return;
    ctx.fillStyle = OLED_CYAN;
    const size = scale > 2 ? scale - 1 : scale;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (pixelOn(frame, x, y)) ctx.fillRect(x * scale, y * scale, size, size);
  }, [frame, scale]);
  return (
    <canvas
      ref={ref}
      width={128 * scale}
      height={64 * scale}
      role="img"
      aria-label={label}
      className={clsx("block aspect-[2/1] w-full rounded-lg bg-[#061014] [image-rendering:pixelated]", className)}
    />
  );
}
