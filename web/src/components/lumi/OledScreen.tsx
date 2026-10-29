"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { drawFrame, loadFrames, manifest } from "@/lib/lumi-frames";

const SCALE = 4; // canvas pixels per OLED pixel (3 lit + 1 gap)

function draw(ctx: CanvasRenderingContext2D, frame: Uint8Array | undefined, grid: boolean) {
  drawFrame(ctx, frame, SCALE, grid);
}

export interface OledScreenProps {
  /** A .lumi file exported from the firmware. */
  src: string;
  /** Show this frame only (e.g. one expression from expressions.lumi). */
  frame?: number;
  loop?: boolean;
  /** Frame to hold when motion is reduced or before frames load. */
  stillFrame?: number;
  label: string;
  className?: string;
  onEnded?: () => void;
  /** Show the gaps between pixels. Turn off for small screens, where the grid turns to noise. */
  grid?: boolean;
}

/**
 * Plays frames rendered by Lumi's own firmware: pixel for pixel what the
 * device's screen shows. Pauses off-screen and holds a still frame when the
 * visitor prefers reduced motion.
 */
export function OledScreen({ src, frame, loop = true, stillFrame = 0, label, className = "", onEnded, grid = true }: OledScreenProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{ src: string; frames: Uint8Array[] } | null>(null);
  const frames = loaded?.src === src ? loaded.frames : null;
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotion();
  const ended = useRef(onEnded);
  useEffect(() => {
    ended.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let alive = true;
    loadFrames(src).then(
      (f) => alive && setLoaded({ src, frames: f }),
      () => alive && setLoaded({ src, frames: [] }),
    );
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !frames) return;
    if (frame !== undefined || reduce || !visible || frames.length <= 1) {
      draw(ctx, frames[frame ?? Math.min(stillFrame, frames.length - 1)], grid);
      return;
    }
    let i = 0;
    let last = performance.now();
    let raf = 0;
    draw(ctx, frames[0], grid);
    const tick = (now: number) => {
      const steps = Math.floor((now - last) / manifest.frameMs);
      if (steps > 0) {
        last += steps * manifest.frameMs;
        i += steps;
        if (i >= frames.length) {
          if (!loop) {
            draw(ctx, frames[frames.length - 1], grid);
            ended.current?.();
            return;
          }
          i %= frames.length;
        }
        draw(ctx, frames[i], grid);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames, frame, reduce, visible, loop, stillFrame, grid]);

  return (
    <canvas
      ref={canvas}
      width={128 * SCALE}
      height={64 * SCALE}
      role="img"
      aria-label={label}
      className={`block h-full w-full [image-rendering:pixelated] drop-shadow-[0_0_6px_rgba(60,240,255,0.55)] ${className}`}
    />
  );
}
