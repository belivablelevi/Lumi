"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Gamepad2, Play, Smartphone } from "lucide-react";
import clsx from "clsx";
import type { GalleryImage } from "@/content/products";
import { loadDuel, randomSeed, type Duel, type DuelPersona } from "@/lib/duel";
import { drawFrame } from "@/lib/lumi-frames";
import { RarityDot } from "../lumi/PersonaChip";

/** Hands control back to the demo after this long without input. */
export const IDLE_MS = 10_000;
const SCALE = 4;

type Mode = "loading" | "paused" | "demo" | "playing" | "error";

/** Where the keychain sits in the front renders, so the game can crop to the device itself. */
const DEVICE = { left: 0.128, top: 0.026, width: 0.744, height: 0.932 };

function Screen({ image, canvasRef, label }: { image: GalleryImage; canvasRef: React.RefObject<HTMLCanvasElement | null>; label: string }) {
  const s = image.screen!;
  return (
    <div className="relative" style={{ aspectRatio: `${DEVICE.width} / ${DEVICE.height}` }}>
      <div
        className="absolute"
        style={{
          width: `${100 / DEVICE.width}%`,
          height: `${100 / DEVICE.height}%`,
          left: `${(-DEVICE.left / DEVICE.width) * 100}%`,
          top: `${(-DEVICE.top / DEVICE.height) * 100}%`,
        }}
      >
        <Image src={image.src} alt="" fill sizes="(min-width: 1024px) 30vw, 60vw" className="object-contain" />
        <div className="absolute" style={{ left: `${s.left * 100}%`, top: `${s.top * 100}%`, width: `${s.width * 100}%`, height: `${s.height * 100}%` }}>
          <canvas
            ref={canvasRef}
            width={128 * SCALE}
            height={64 * SCALE}
            role="img"
            aria-label={label}
            className="block h-full w-full [image-rendering:pixelated] drop-shadow-[0_0_6px_rgba(60,240,255,0.55)]"
          />
        </div>
      </div>
    </div>
  );
}

function PersonaTag({ who, p }: { who: string; p?: DuelPersona }) {
  return (
    <div className="mt-2 text-center">
      <p className="text-xs font-bold tracking-wider text-white/50 uppercase">{who}</p>
      <p data-persona-name className="mt-0.5 font-display text-lg font-bold text-white">{p?.name ?? "…"}</p>
      {p ? (
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-white/65 capitalize">
          <span className="inline-flex items-center gap-1"><RarityDot rarity={p.rarity} /> {p.rarity}</span>
          <span>· {p.traits.temperament}</span>
          <span>· {p.traits.eyeShape} eyes</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Boop Pong against a Lumi, running the real firmware in WebAssembly. Tilt a
 * phone, drag, or use the arrow keys; tap or Space to smash. With nobody
 * playing for 10 seconds it plays itself.
 */
export function PongDuel({ you, pal }: { you: GalleryImage; pal: GalleryImage }) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("loading");
  const [personas, setPersonas] = useState<[DuelPersona, DuelPersona] | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false);
  const [usingTilt, setUsingTilt] = useState(false);

  const duel = useRef<Duel | null>(null);
  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const deviceA = useRef<HTMLDivElement>(null);
  const deviceB = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const input = useRef({ target: 0, lastInput: -Infinity, pat: false, keys: { left: false, right: false }, tiltBase: null as number | null });
  const visible = useRef(true);
  const modeRef = useRef<Mode>("loading");
  const setModeBoth = useCallback((m: Mode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  const newMatch = useCallback(() => {
    const d = duel.current;
    if (!d) return;
    d.newMatch(randomSeed(), randomSeed());
    setPersonas([d.persona(0), d.persona(1)]);
    setScore([0, 0]);
  }, []);

  // Load the firmware.
  useEffect(() => {
    let alive = true;
    loadDuel(fetch("/duel/lumi-duel.wasm"))
      .then((d) => {
        if (!alive) return;
        duel.current = d;
        newMatch();
        setModeBoth(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "paused" : "demo");
      })
      .catch(() => alive && setModeBoth("error"));
    const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    // Only phones and tablets need asking (iOS); a desktop browser may have the API without a sensor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeedsMotionPermission(typeof DOE?.requestPermission === "function" && window.matchMedia("(pointer: coarse)").matches);
    return () => {
      alive = false;
    };
  }, [newMatch, setModeBoth]);

  // Someone touched the controls: they're playing now.
  const touched = useCallback(() => {
    input.current.lastInput = performance.now();
    if (modeRef.current === "demo" || modeRef.current === "paused") setModeBoth("playing");
  }, [setModeBoth]);

  // The game loop: one loop for both demo and playing, so switching is seamless.
  const running = mode === "demo" || mode === "playing";
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let endedAt = 0;
    const ctx = [canvasA.current?.getContext("2d") ?? null, canvasB.current?.getContext("2d") ?? null];
    const devices = [deviceA.current, deviceB.current];
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const d = duel.current;
      if (!d || !visible.current || document.hidden) {
        last = now;
        return;
      }
      const i = input.current;
      const dt = Math.min(now - last, 100);
      last = now;
      if (i.keys.left || i.keys.right) {
        i.target = Math.max(-1, Math.min(1, i.target + (i.keys.right ? 1 : -1) * dt * 0.0035));
        i.lastInput = now;
      }
      if (modeRef.current === "playing" && now - i.lastInput > IDLE_MS) setModeBoth("demo");
      const auto = modeRef.current !== "playing";
      d.step(dt, i.target, i.pat, auto);
      i.pat = false;
      for (const k of [0, 1] as const) {
        const c = ctx[k];
        // Pixel gaps only when the screen is big enough to show them; small, they blur into noise.
        if (c) drawFrame(c, d.screen(k), SCALE, c.canvas.clientWidth >= 256);
        const el = devices[k];
        // The firmware feels gravity's x component; show the same tilt on the device.
        if (el) el.style.transform = reduce ? "" : `rotate(${(-Math.asin(Math.max(-1, Math.min(1, d.tilt(k)))) * 180) / Math.PI}deg)`;
      }
      const s: [number, number] = [d.points(0), d.points(1)];
      setScore((old) => (old[0] === s[0] && old[1] === s[1] ? old : s));
      const st = d.state();
      if (st === 3 || (st === 2 && endedAt && now - endedAt > 6000)) {
        endedAt = 0;
        newMatch();
      } else if (st === 2 && !endedAt) {
        endedAt = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, reduce, newMatch, setModeBoth]);

  // Pause off-screen.
  useEffect(() => {
    const el = region.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = !!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Phone tilt.
  useEffect(() => {
    if (!usingTilt && needsMotionPermission) return;
    const on = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      const i = input.current;
      i.tiltBase ??= e.gamma;
      const t = Math.max(-1, Math.min(1, (e.gamma - i.tiltBase) / 25));
      // Phones report tiny wobbles at rest; only a real tilt counts as playing.
      if (Math.abs(t - i.target) > 0.08 || modeRef.current === "playing") {
        if (Math.abs(t - i.target) > 0.08) touched();
        i.target = t;
      }
    };
    window.addEventListener("deviceorientation", on);
    return () => window.removeEventListener("deviceorientation", on);
  }, [usingTilt, needsMotionPermission, touched]);

  const askTilt = async () => {
    const DOE = (globalThis as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try {
      if ((await DOE?.requestPermission?.()) === "granted") {
        input.current.tiltBase = null;
        setUsingTilt(true);
        touched();
      }
    } catch {
      // Permission refused: drag still works.
    }
  };

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    input.current.target = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    // Hovering doesn't take over from the demo; a click, a drag or a touch does.
    // Once playing, the mouse steers without holding a button.
    if (e.type === "pointerdown" || e.buttons || e.pointerType !== "mouse" || modeRef.current === "playing") touched();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = input.current;
    const down = e.type === "keydown";
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") i.keys.left = down;
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") i.keys.right = down;
    else if ((e.key === " " || e.key === "Enter") && down) i.pat = true;
    else return;
    e.preventDefault();
    touched();
  };

  const status =
    mode === "loading"
      ? "Waking up two Lumis…"
      : mode === "error"
        ? "This browser couldn't start the game."
        : mode === "paused"
          ? "Paused"
          : mode === "demo"
            ? "Demo"
            : "You're playing";

  return (
    <div>
      <div
        ref={region}
        tabIndex={0}
        role="application"
        aria-roledescription="game"
        aria-label="Boop Pong. Use the left and right arrow keys to move your paddle, Space to smash."
        onKeyDown={onKey}
        onKeyUp={onKey}
        onPointerDown={(e) => {
          onPointer(e);
          input.current.pat = true;
        }}
        onPointerMove={onPointer}
        className="relative touch-pan-y rounded-panel bg-night px-4 pt-6 pb-5 outline-none select-none focus-visible:ring-4 focus-visible:ring-lavender sm:px-8"
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={clsx(
              "inline-flex items-center gap-2 rounded-chip px-3 py-1.5 text-xs font-bold",
              mode === "playing" ? "bg-mint text-ink" : "bg-white/10 text-white",
            )}
          >
            <span className={clsx("size-1.5 rounded-full", mode === "playing" ? "bg-ink" : "bg-oled")} aria-hidden />
            {status}
          </span>
          <p className="font-display text-xl font-bold text-white tabular-nums" aria-live="polite">
            <span className="sr-only">Score: you </span>
            {score[0]} <span className="text-white/40">:</span> {score[1]}
            <span className="sr-only"> pal</span>
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
          <div className="mx-auto w-full max-w-[230px] sm:max-w-[260px]">
            <div ref={deviceA} className="transition-transform duration-75 will-change-transform">
              <Screen image={you} canvasRef={canvasA} label="Your Lumi's screen" />
            </div>
            <PersonaTag who="Your Lumi" p={personas?.[0]} />
          </div>
          {/* On phones the pal sits on top, like the far side of the table. */}
          <div className="order-first mx-auto w-full max-w-[230px] sm:order-none sm:max-w-[260px]">
            <div ref={deviceB} className="transition-transform duration-75 will-change-transform">
              <Screen image={pal} canvasRef={canvasB} label="Your pal's screen" />
            </div>
            <PersonaTag who="Pal" p={personas?.[1]} />
          </div>
        </div>

        {mode === "paused" ? (
          <button
            type="button"
            onClick={() => setModeBoth("demo")}
            className="absolute inset-0 m-auto flex h-14 w-fit items-center gap-2 rounded-chip bg-white px-6 font-bold text-ink shadow-lift"
          >
            <Play className="size-4" /> Play the demo
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <Gamepad2 className="size-4 shrink-0 text-lavender-deep" aria-hidden />
          <span>
            <b>Drag</b> across the game, or press <kbd className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-line">←</kbd>{" "}
            <kbd className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-line">→</kbd>. Tap or <kbd className="rounded bg-white px-1.5 py-0.5 text-xs ring-1 ring-line">Space</kbd> to smash.
            Leave it for 10 seconds and it plays itself.
          </span>
        </p>
        {needsMotionPermission && !usingTilt ? (
          <button type="button" onClick={askTilt} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-chip bg-ink px-4 font-semibold text-white">
            <Smartphone className="size-4" /> Steer by tilting your phone
          </button>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <Smartphone className="size-4 shrink-0" aria-hidden /> On a phone, tilt it to steer, just like a real Lumi.
          </p>
        )}
      </div>
    </div>
  );
}
