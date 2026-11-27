"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Box, ClipboardCheck, Cpu, Dices, Hand, Package, Check } from "lucide-react";
import { loadFrames, manifest, persona } from "@/lib/lumi-frames";
import { makingSteps, origin } from "@/content/making";
import { renderImage } from "@/lib/renders";
import type { SpinScene } from "../clips/scene3d";
import { ButtonLink } from "../ui/Button";

type StepId = "case" | "brain" | "dice" | "senses" | "testing" | "packing";

const TABS: { id: StepId; label: string; Icon: typeof Box }[] = [
  { id: "case", label: "Designed", Icon: Box },
  { id: "brain", label: "Wired", Icon: Cpu },
  { id: "dice", label: "Rolled", Icon: Dices },
  { id: "senses", label: "Alive", Icon: Hand },
  { id: "testing", label: "Tested", Icon: ClipboardCheck },
  { id: "packing", label: "Packed", Icon: Package },
];

const SHELLS = [
  { name: "Black", hex: "#26272b" },
  { name: "Light grey", hex: "#dcddda" },
  { name: "Milky green", hex: "#b6dfc2" },
];

const ACTIONS = [
  { label: "Pat", anim: "pat_giggle" },
  { label: "Pat twice", anim: "double_pat_hearts" },
  { label: "Pick up", anim: "pickup_surprised" },
  { label: "Leave it", anim: "nod_off" },
];

const PERSONAS = ["yotos", "ni", "katos", "mimox"];
const CHECKS = ["The screen lights up", "The motion sensor feels a pat", "It charges over USB-C", "It wakes up and shows its face"];
const THREE_D: StepId[] = ["case", "dice", "senses"];

interface Clip {
  frames: Uint8Array[];
  loop: boolean;
  t0: number;
  then?: { id: string; anim: string };
}

function chipId(seed: number) {
  return "0x" + Math.floor(seed).toString(16).toUpperCase().padStart(4, "0");
}

function scramble() {
  return "0x" + Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

/** Simplified drawing of the board. Honest about it: not to scale, not the real layout. */
function BoardDiagram() {
  const label = "fill-white text-[11px] font-bold";
  return (
    <figure className="absolute inset-0 flex flex-col items-center justify-center p-4">
      <svg viewBox="0 0 330 330" role="img" aria-label="A simplified drawing of Lumi's circuit board: the ESP32-C3 chip, the screen connector, the motion sensor and the USB-C port" className="h-full max-h-[420px] w-full">
        <rect x="95" y="20" width="140" height="290" rx="14" fill="#16503f" stroke="#3b8a70" strokeWidth="2" />
        <circle cx="165" cy="36" r="7" fill="#0b2f25" stroke="#3b8a70" />
        {/* traces */}
        <g stroke="#3fae8a" strokeWidth="1.5" fill="none" opacity="0.7">
          <path d="M130 100 V150 H165" /><path d="M200 100 V135 H165" /><path d="M165 230 V250" /><path d="M120 200 H150 V190" />
          <path d="M210 200 H185 V190" /><path d="M120 150 V240 H140" />
        </g>
        {/* screen connector */}
        <rect x="120" y="58" width="90" height="16" rx="3" fill="#1f2a30" stroke="#8fd9c0" />
        {/* ESP32-C3 */}
        <rect x="125" y="110" width="80" height="80" rx="6" fill="#26272b" stroke="#b6e5cf" strokeWidth="2" />
        <text x="165" y="154" textAnchor="middle" className="fill-white text-[13px] font-bold">ESP32-C3</text>
        <text x="165" y="170" textAnchor="middle" className="fill-white/60 text-[9px]">the brain</text>
        {/* motion sensor */}
        <rect x="190" y="212" width="26" height="26" rx="3" fill="#26272b" stroke="#ffd678" strokeWidth="2" />
        {/* usb-c */}
        <rect x="140" y="288" width="50" height="22" rx="6" fill="#c9cdd2" stroke="#fff" />
        <rect x="150" y="294" width="30" height="10" rx="5" fill="#26272b" />
        {/* battery pads */}
        <circle cx="116" cy="256" r="6" fill="#d9b24c" /><circle cx="116" cy="276" r="6" fill="#d9b24c" />
        {/* callouts */}
        <g strokeWidth="1.2" stroke="#fff" opacity="0.8">
          <path d="M120 66 H62" /><path d="M205 150 H262" /><path d="M216 225 H262" /><path d="M140 300 H62" /><path d="M110 266 H62" />
        </g>
        <text x="4" y="62" className={label}>Screen</text><text x="4" y="75" className="fill-white/60 text-[9px]">connector</text>
        <text x="266" y="148" className={label}>Chip</text>
        <text x="266" y="222" className={label}>Motion</text><text x="266" y="235" className="fill-white/60 text-[9px]">sensor</text>
        <text x="4" y="303" className={label}>USB-C</text>
        <text x="4" y="269" className={label}>Battery</text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-white/60">A simplified drawing, not to scale. Every part sits on the back of one small board.</figcaption>
    </figure>
  );
}

export function MakingWorkshop({ initial = "case" as StepId, heading = true }: { initial?: StepId; heading?: boolean }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<StepId>(initial);
  const [shell, setShell] = useState(SHELLS[2]!.hex);
  const [who, setWho] = useState(0);
  const [id, setId] = useState(chipId(persona("yotos").seed));
  const [ticks, setTicks] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ step: initial as StepId, shell: SHELLS[2]!.hex, visible: false, angle: -0.5, sway: 0, drag: null as null | { x: number; a: number }, reduce: !!reduce });
  const clip = useRef<Clip | null>(null);
  const spinner = useRef<SpinScene | null>(null);
  const token = useRef(0);

  useEffect(() => {
    live.current.step = step;
    live.current.shell = shell;
    live.current.reduce = !!reduce;
  }, [step, shell, reduce]);

  const play = useCallback(async (personaId: string, anim: string, then?: { id: string; anim: string }) => {
    const mine = ++token.current;
    const p = persona(personaId);
    const file = anim === "idle" ? p.idle.file : p.animations[anim]?.file;
    if (!file) return;
    try {
      const frames = await loadFrames(file);
      if (mine !== token.current || !frames.length) return;
      clip.current = { frames, loop: anim === "idle", t0: performance.now(), then };
    } catch {
      /* the screen just keeps its last face */
    }
  }, []);

  // 3D scene and render loop.
  useEffect(() => {
    let raf = 0;
    let dead = false;
    let last = performance.now();
    const el = stage.current;
    const io = el && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { live.current.visible = !!e?.isIntersecting; }, { threshold: 0.05 }) : null;
    if (el) io?.observe(el); else live.current.visible = true;

    import("./lumiScene")
      .then((m) => m.createSpinScene())
      .then((s) => {
        if (dead) { s.dispose(); return; }
        spinner.current = s;
        setReady(true);
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const L = live.current;
          const c = canvas.current;
          if (!c || !L.visible || !THREE_D.includes(L.step)) return;
          if (!L.drag && !L.reduce) {
            if (L.step === "case") L.angle += dt * 0.5;
            else {   // face front, with a gentle sway
              L.sway += dt;
              L.angle += (Math.sin(L.sway * 0.7) * 0.55 - L.angle) * Math.min(1, dt * 3);
            }
          }
          const cl = clip.current;
          if (cl) {
            let i = Math.floor((now - cl.t0) / manifest.frameMs);
            if (i >= cl.frames.length) {
              if (cl.loop) i %= cl.frames.length;
              else {
                i = cl.frames.length - 1;
                if (cl.then) { const t = cl.then; clip.current = null; void play(t.id, t.anim); }
              }
            }
            s.setFace(cl.frames[i]);
          }
          s.setShell(L.shell);
          const w = c.clientWidth, h = c.clientHeight;
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
          const out = s.render(c.width, c.height, { angle: L.angle, elevation: 10, zoom: 1.15 });
          const g = c.getContext("2d");
          g?.clearRect(0, 0, c.width, c.height);
          g?.drawImage(out, 0, 0, c.width, c.height);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch((e) => { console.error("Lumi 3D scene failed", e); if (!dead) setFailed(true); });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      io?.disconnect();
      spinner.current?.dispose();
      spinner.current = null;
    };
  }, [play]);

  // The face that goes with each step.
  useEffect(() => {
    if (step === "dice") void play(PERSONAS[who]!, "boot_hello", { id: PERSONAS[who]!, anim: "idle" });
    else if (step === "senses") void play("yotos", "boot_hello", { id: "yotos", anim: "idle" });
    else void play("yotos", "idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Dice: a new chip every few seconds, the ID scrambling before it lands.
  useEffect(() => {
    if (step !== "dice") return;
    const p = persona(PERSONAS[who]!);
    let n = 0;
    const spin = window.setInterval(() => {
      n += 1;
      if (n > 7) { window.clearInterval(spin); setId(chipId(p.seed)); } else setId(scramble());
    }, 70);
    const next = reduce ? 0 : window.setTimeout(() => {
      const nx = (who + 1) % PERSONAS.length;
      setWho(nx);
      void play(PERSONAS[nx]!, "boot_hello", { id: PERSONAS[nx]!, anim: "idle" });
    }, 5200);
    return () => { window.clearInterval(spin); if (next) window.clearTimeout(next); };
  }, [step, who, reduce, play]);

  // Testing: the checks tick off one by one.
  useEffect(() => {
    if (step !== "testing") return;
    const timers: number[] = [];
    const sync = window.setTimeout(() => setTicks(0), 0);
    CHECKS.forEach((_, i) => timers.push(window.setTimeout(() => setTicks(i + 1), reduce ? 0 : 500 + i * 700)));
    return () => { window.clearTimeout(sync); timers.forEach(window.clearTimeout); };
  }, [step, reduce]);

  // Deep links from the rest of the site (/how-its-made#dice and so on).
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      const t = h === "case" ? "case" : TABS.find((x) => x.id === h)?.id;
      if (t) setStep(t);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const info = makingSteps.find((s) => s.id === step)!;
  const p = persona(PERSONAS[who]!);
  const is3d = THREE_D.includes(step);

  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === step);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setStep(TABS[(i + 1) % TABS.length]!.id); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setStep(TABS[(i + TABS.length - 1) % TABS.length]!.id); }
  };

  return (
    <section aria-labelledby="workshop-title" className="relative overflow-hidden bg-night py-16 text-white lg:py-24">
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-oled/10 blur-3xl" />
      <div className="container-page relative">
        {heading ? (
          <div className="max-w-3xl">
            <p className="eyebrow !text-oled">{origin.chip}</p>
            <h2 id="workshop-title" className="mt-3 text-h2 font-bold">From a pile of parts to a face that notices you.</h2>
            <p className="mt-3 text-lg text-white/70">{origin.line} {origin.partsNote}</p>
          </div>
        ) : <h2 id="workshop-title" className="sr-only">How a Lumi is made</h2>}

        <div className="mt-10 grid items-stretch gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          {/* The stage */}
          <div className="min-w-0">
            <div ref={stage} className="relative aspect-[4/5] overflow-hidden rounded-panel bg-[radial-gradient(ellipse_at_50%_35%,#2b2f4a_0%,#14152a_62%)] ring-1 ring-white/10 sm:aspect-[5/5]">
              {is3d ? (
                failed ? (
                  <Image src={renderImage("mini-pcb-three-quarter.png").src} alt="Render of the Lumi case, in mint" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-6" />
                ) : (
                  <canvas
                    ref={canvas}
                    aria-label="A 3D model of the Lumi case with its screen on. Drag to turn it."
                    role="img"
                    className={`absolute inset-0 size-full cursor-grab touch-pan-y transition-opacity duration-500 active:cursor-grabbing ${ready ? "opacity-100" : "opacity-0"}`}
                    onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); live.current.drag = { x: e.clientX, a: live.current.angle }; }}
                    onPointerMove={(e) => { const d = live.current.drag; if (d) live.current.angle = d.a + (e.clientX - d.x) / 90; }}
                    onPointerUp={() => { live.current.drag = null; }}
                    onPointerCancel={() => { live.current.drag = null; }}
                  />
                )
              ) : null}

              {step === "brain" ? <BoardDiagram /> : null}

              {step === "testing" ? (
                <ul className="absolute inset-0 flex flex-col justify-center gap-3 p-6 sm:p-10" aria-label="What is checked on every Lumi">
                  {CHECKS.map((c, i) => (
                    <li key={c} className={`flex items-center gap-4 rounded-card px-5 py-4 text-lg font-bold transition-all duration-500 ${i < ticks ? "bg-oled/15 text-white" : "bg-white/5 text-white/40"}`}>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-500 ${i < ticks ? "bg-oled text-night" : "bg-white/10"}`}>
                        {i < ticks ? <Check className="size-5" aria-hidden /> : null}
                      </span>
                      {c}
                    </li>
                  ))}
                  <li className="px-1 pt-2 text-sm text-white/60">Checked by hand on every Lumi, on top of the automatic tests that run on the software.</li>
                </ul>
              ) : null}

              {step === "packing" ? (
                <div className="absolute inset-0 flex flex-col">
                  <div className="relative flex-1">
                    <Image src={renderImage("on-keyring.png").src} alt="Render of a Lumi on a keyring" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-6" />
                  </div>
                  <p className="p-4 text-center text-xs text-white/60">Prototype render. Photos of the real packing go here once the first units are made.</p>
                </div>
              ) : null}

              {step === "dice" ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-5">
                  <p className="text-xs font-bold tracking-wider text-white/50 uppercase">Chip ID</p>
                  <p className="font-mono text-xl font-bold tracking-widest text-oled sm:text-2xl" aria-live="off">{id}</p>
                </div>
              ) : null}

              {step === "dice" ? (
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-5">
                  <span className="rounded-chip bg-white/10 px-3 py-1 text-sm font-bold">{p.name}</span>
                  <span className="rounded-chip bg-white/10 px-3 py-1 text-sm">{p.traits.temperament}</span>
                  <span className="rounded-chip bg-white/10 px-3 py-1 text-sm capitalize">{p.rarity}</span>
                </div>
              ) : null}

              {step === "senses" ? (
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-4">
                  {ACTIONS.map((a) => (
                    <button key={a.anim} type="button" onClick={() => void play("yotos", a.anim, { id: "yotos", anim: "idle" })}
                      className="rounded-chip bg-white px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oled">
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "case" ? (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
                  <div className="flex gap-2" role="group" aria-label="Case colour">
                    {SHELLS.map((s) => (
                      <button key={s.hex} type="button" onClick={() => setShell(s.hex)} aria-label={s.name} aria-pressed={shell === s.hex}
                        className={`size-9 rounded-full ring-2 ring-offset-2 ring-offset-[#14152a] transition-transform hover:scale-110 ${shell === s.hex ? "ring-oled" : "ring-white/20"}`}
                        style={{ background: s.hex }} />
                    ))}
                  </div>
                  <p className="text-xs text-white/50">Drag to turn it. This is the case we print.</p>
                </div>
              ) : null}
            </div>
          </div>

          {/* The steps */}
          <div className="flex min-w-0 flex-col">
            <div role="tablist" aria-label="How a Lumi is made" onKeyDown={onKey} className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {TABS.map(({ id: tid, label, Icon }, i) => (
                <button key={tid} role="tab" id={`tab-${tid}`} aria-selected={step === tid} aria-controls="making-panel" tabIndex={step === tid ? 0 : -1}
                  onClick={() => setStep(tid)}
                  className={`flex shrink-0 items-center gap-2 rounded-card px-4 py-3 text-left text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oled ${step === tid ? "bg-white text-night" : "bg-white/8 text-white/80 hover:bg-white/15"}`}>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span><span>{i + 1}. </span>{label}</span>
                </button>
              ))}
            </div>

            <div id="making-panel" role="tabpanel" aria-labelledby={`tab-${step}`} className="mt-6 flex-1 rounded-panel bg-white/5 p-7 ring-1 ring-white/10 sm:p-9">
              <p className="eyebrow !text-oled">Step {TABS.findIndex((t) => t.id === step) + 1} of {TABS.length}</p>
              <h3 className="mt-2 text-h3 font-bold">{info.title}</h3>
              <div className="mt-4 space-y-3 text-lg text-white/75">
                {info.text.map((t) => <p key={t}>{t}</p>)}
              </div>
              {step === "dice" ? (
                <p className="mt-4 text-white/75">
                  Watch the chip ID change: every ID rolls a different Lumi.{" "}
                  <Link href="/products/pocket-lumi#odds-title" className="font-semibold text-oled underline underline-offset-4">See every chance</Link>
                </p>
              ) : null}
              {step === "senses" ? <p className="mt-4 text-white/75">Try it on the Lumi on the left. These are its real animations.</p> : null}
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/roll" variant="light">Roll a Lumi</ButtonLink>
                <ButtonLink href="/how-its-made" variant="ghost" className="!text-white hover:!bg-white/10">The whole story</ButtonLink>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-white/50">Lumi is still a prototype. The pictures on this site are renders of the design, and we&apos;ll add photos of the real thing as the first units are made.</p>
      </div>
    </section>
  );
}
