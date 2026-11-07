"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { products } from "@/content/products";
import { CLIP_FEATURES, type ClipFeature } from "@/content/clip-features";
import { drawFrame, loadFrames, manifest } from "@/lib/lumi-frames";
import { download, pickFormat, recordCanvas, type ClipFormat } from "@/lib/clip-recorder";
import { formatMoney } from "@/lib/money";
import { confirmed } from "@/lib/placeholder";
import { input, panel, primaryButton, SelectField, SliderField, smallButton, TextField } from "@/components/studio/controls";
import type { SpinScene } from "./scene3d";
import {
  BACKGROUNDS,
  drawBackground,
  drawCaption,
  drawEndCard,
  drawLine,
  inkFor,
  segmentAt,
  segmentState,
  spinAngle,
  timeline,
  type BackgroundId,
  type TextStyle,
} from "./overlay";

const SIZES = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080] } as const;
type SizeId = keyof typeof SIZES;
type Mode = "spin" | "face";
const PREVIEW_SCALE = 0.5;
const IDLE = "";

const lumi = products[0]!;
const price = confirmed(lumi.price);
const SHELLS = lumi.variants.map((v) => ({ name: v.name, hex: v.swatch }));

interface Settings {
  mode: Mode;
  size: SizeId;
  persona: string;
  shell: string;
  bg: BackgroundId;
  turns: number;
  elevation: number;
  zoom: number;
  perLine: number;
  lines: ClipFeature[];
  endTitle: string;
  endLine: string;
  faceAnim: string;
  top: string;
  bottom: string;
  seconds: number;
}

const DEFAULTS: Settings = {
  mode: "spin",
  size: "9:16",
  persona: manifest.personas[0]!.id,
  shell: SHELLS[0]?.hex ?? "#dcddda",
  bg: "shell",
  turns: 1,
  elevation: 12,
  zoom: 1,
  perLine: 2.4,
  lines: CLIP_FEATURES,
  endTitle: lumi.name,
  endLine: price ? `${formatMoney(price)} at snaggo.tech` : "snaggo.tech",
  faceAnim: "pat_giggle",
  top: "When you pat your keychain",
  bottom: "",
  seconds: 6,
};

const STORAGE_KEY = "lumi-clip-maker-v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULTS, ...saved };
    return manifest.personas.some((p) => p.id === s.persona) ? s : { ...s, persona: DEFAULTS.persona };
  } catch {
    return DEFAULTS;
  }
}

type Img = HTMLImageElement | ImageBitmap;

/**
 * Makes short videos and stills of Lumi for TikTok and Instagram: a 3D spin of the real case
 * with feature lines, or a close-up of the face with captions. Everything is drawn in the
 * browser; nothing is uploaded.
 */
export function ClipMaker() {
  const [s, setS] = useState<Settings>(loadSettings);
  const set = useCallback((patch: Partial<Settings>) => setS((x) => ({ ...x, ...patch })), []);
  const [photo, setPhoto] = useState<Img | null>(null);
  const [sceneState, setSceneState] = useState<"loading" | "ready" | "failed">("loading");
  const [frames, setFrames] = useState<Record<string, Uint8Array[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [format] = useState<ClipFormat | null>(() =>
    typeof MediaRecorder === "undefined" ? null : pickFormat((t) => MediaRecorder.isTypeSupported(t)),
  );

  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SpinScene | null>(null);
  // start < 0 means "from the next frame".
  const clock = useRef({ start: -1, scale: PREVIEW_SCALE, recording: false });

  const persona = manifest.personas.find((p) => p.id === s.persona) ?? manifest.personas[0]!;
  const animNames = Object.keys(persona.animations);
  const tl = useMemo(() => timeline(s.lines, { perLine: s.perLine }), [s.lines, s.perLine]);
  const length = s.mode === "spin" ? tl.total : s.seconds;

  // Remember the settings in this browser.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        // Private window or storage blocked: the clip still works, it just isn't remembered.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [s]);

  // The 3D scene, once.
  useEffect(() => {
    let alive = true;
    import("./scene3d")
      .then(({ createSpinScene }) => createSpinScene())
      .then(
        (sc) => {
          if (!alive) return sc.dispose();
          scene.current = sc;
          setSceneState("ready");
        },
        () => alive && setSceneState("failed"),
      );
    return () => {
      alive = false;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  // Frames for the idle loop and every animation the clip uses.
  const needed = useMemo(() => {
    const files = new Set([persona.idle.file]);
    const anims = s.mode === "spin" ? s.lines.map((l) => l.anim) : [s.faceAnim];
    for (const a of anims) if (a && persona.animations[a]) files.add(persona.animations[a].file);
    return [...files];
  }, [persona, s.mode, s.lines, s.faceAnim]);
  useEffect(() => {
    let alive = true;
    for (const f of needed) {
      loadFrames(f).then(
        (fr) => alive && setFrames((x) => (x[f] ? x : { ...x, [f]: fr })),
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
  }, [needed]);

  // Everything the draw loop reads, kept in a ref so the loop never restarts.
  const live = useRef({ s, tl, length, persona, frames, photo });
  useEffect(() => {
    live.current = { s, tl, length, persona, frames, photo };
  }, [s, tl, length, persona, frames, photo]);

  const faceAt = useCallback((t: number): Uint8Array | undefined => {
    const { s, tl, persona, frames } = live.current;
    const ms = manifest.frameMs;
    const idle = frames[persona.idle.file];
    const idleFrame = idle?.length ? idle[Math.floor((t * 1000) / ms) % idle.length] : undefined;
    if (s.mode === "face") {
      const a = persona.animations[s.faceAnim];
      const fr = a ? frames[a.file] : idle;
      return fr?.length ? fr[Math.floor((t * 1000) / ms) % fr.length] : idleFrame;
    }
    const seg = segmentAt(tl, t);
    const a = seg?.anim ? persona.animations[seg.anim] : undefined;
    const fr = a ? frames[a.file] : undefined;
    if (!seg || !fr?.length) return idleFrame;
    // Play the animation once from the line's start, then go back to idling.
    const i = Math.floor(((t - seg.start) * 1000) / ms);
    return i < fr.length ? fr[i] : idleFrame;
  }, []);

  const draw = useCallback(
    (t: number, scale: number) => {
      const c = canvas.current;
      if (!c) return;
      const { s, tl, photo } = live.current;
      const [W, H] = SIZES[s.size];
      const w = Math.round(W * scale), h = Math.round(H * scale);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d")!;
      const bodyStyle = getComputedStyle(document.body);
      const st: TextStyle = {
        ink: inkFor(s.bg, s.shell),
        font: bodyStyle.getPropertyValue("--font-manrope").trim() || "system-ui, sans-serif",
        displayFont: bodyStyle.getPropertyValue("--font-bricolage").trim() || "system-ui, sans-serif",
      };
      drawBackground(ctx, w, h, s.bg, s.shell, photo ?? undefined);
      const face = faceAt(t);

      if (s.mode === "spin") {
        const sc = scene.current;
        if (sc) {
          sc.setShell(s.shell);
          sc.setFace(face);
          ctx.drawImage(sc.render(w, h, { angle: spinAngle(t, tl.settleAt, s.turns), elevation: s.elevation, zoom: s.zoom }), 0, 0, w, h);
        }
        const seg = segmentAt(tl, t);
        if (seg?.kind === "line") drawLine(ctx, w, h, seg.text, segmentState(seg, t), st);
        if (seg?.kind === "end") {
          drawEndCard(ctx, w, h, segmentState(seg, Math.min(t, seg.end - 0.001)), { title: s.endTitle, line: s.endLine }, st);
        }
        return;
      }

      // Face close-up: the screen, big, with a glow, and the captions.
      const px = Math.max(1, Math.floor((w * 0.8) / 128));
      const fw = 128 * px, fh = 64 * px;
      const x = Math.round((w - fw) / 2), y = Math.round((h - fh) / 2);
      const pad = px * 6;
      ctx.fillStyle = "#06070b";
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, fw + pad * 2, fh + pad * 2, pad * 1.4);
      ctx.fill();
      const off = document.createElement("canvas");
      off.width = fw;
      off.height = fh;
      drawFrame(off.getContext("2d")!, face, px, px >= 4);
      ctx.save();
      ctx.filter = `blur(${Math.round(px * 1.5)}px)`;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(off, x, y);
      ctx.restore();
      ctx.drawImage(off, x, y);
      drawCaption(ctx, w, h, s.top, "top", st);
      drawCaption(ctx, w, h, s.bottom, "bottom", st);
    },
    [faceAt],
  );

  // The preview loop: plays the clip over and over.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const k = clock.current;
      const now = performance.now();
      if (k.start < 0) k.start = now;
      const t = (now - k.start) / 1000;
      const len = live.current.length;
      draw(k.recording ? Math.min(t, len) : t % len, k.scale);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const restart = () => {
    clock.current.start = -1;
  };

  async function record() {
    const c = canvas.current;
    if (!c || !format) return;
    setBusy(`Recording ${Math.ceil(length)} seconds. Keep this tab open and in front.`);
    clock.current = { start: performance.now(), scale: 1, recording: true };
    draw(0, 1);
    try {
      const blob = await recordCanvas(c, length + 0.2, format);
      download(blob, `lumi-${s.mode}-${s.persona}.${format.ext}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Recording failed.");
    } finally {
      clock.current = { start: -1, scale: PREVIEW_SCALE, recording: false };
      setBusy(null);
    }
  }

  function still() {
    const c = canvas.current;
    if (!c) return;
    const t = ((performance.now() - clock.current.start) / 1000) % length;
    draw(t, 1);
    c.toBlob((b) => b && download(b, `lumi-${s.mode}-${s.persona}.png`), "image/png");
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await createImageBitmap(file));
      set({ bg: "photo" });
    } catch {
      alert("That file couldn't be read as a picture.");
    }
  }

  const setLine = (i: number, patch: Partial<ClipFeature>) =>
    set({ lines: s.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const animOptions: [string, string][] = [[IDLE, "Idle"], ...animNames.map((a): [string, string] => [a, a.replace(/_/g, " ")])];
  const [W, H] = SIZES[s.size];
  const locked = busy !== null;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <fieldset disabled={locked} className="min-w-0 space-y-4">
        <div className={panel}>
          <div className="flex gap-2" role="group" aria-label="Clip type">
            {(
              [
                ["spin", "3D spin"],
                ["face", "Face close-up"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={s.mode === m}
                onClick={() => {
                  set({ mode: m });
                  restart();
                }}
                className={clsx(s.mode === m ? primaryButton : smallButton, "flex-1")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SelectField label="Size" value={s.size} onChange={(v) => set({ size: v as SizeId })} options={[
              ["9:16", "9:16 TikTok, Reels"],
              ["4:5", "4:5 Instagram post"],
              ["1:1", "1:1 Square"],
            ]} />
            <SelectField label="Personality" value={s.persona} onChange={(v) => set({ persona: v })} options={manifest.personas.map((p): [string, string] => [p.id, `${p.name} (${p.rarity})`])} />
          </div>
        </div>

        <div className={panel}>
          <h2 className="text-sm font-bold text-ink">Look</h2>
          {s.mode === "spin" ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-ink-soft">Shell colour</p>
              <div className="flex flex-wrap items-center gap-2">
                {SHELLS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={s.shell === c.hex}
                    onClick={() => set({ shell: c.hex })}
                    className={clsx("size-8 rounded-full ring-1 ring-ink/20", s.shell === c.hex && "ring-2 ring-ink ring-offset-2")}
                    style={{ background: c.hex }}
                  />
                ))}
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                  <input type="color" value={s.shell} onChange={(e) => set({ shell: e.target.value })} className="h-8 w-10 cursor-pointer rounded" />
                  Any colour
                </label>
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 items-end gap-3">
            <SelectField label="Background" value={s.bg} onChange={(v) => set({ bg: v as BackgroundId })} options={BACKGROUNDS.map((b): [string, string] => [b.id, b.name])} />
            <label className={clsx(smallButton, "cursor-pointer")}>
              Use a photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </label>
          </div>
          {s.bg === "photo" && !photo ? <p className="mt-2 text-xs text-muted">Pick a photo: it stays in this browser and isn&apos;t uploaded.</p> : null}
          {s.mode === "spin" ? (
            <div className="mt-4 space-y-3">
              <SliderField label="Turns before it settles" value={s.turns} min={0} max={3} step={1} onChange={(v) => set({ turns: v })} />
              <SliderField label="Camera height" value={s.elevation} min={-5} max={35} step={1} onChange={(v) => set({ elevation: v })} />
              <SliderField label="Zoom" value={s.zoom} min={0.6} max={1.8} step={0.05} onChange={(v) => set({ zoom: v })} />
            </div>
          ) : null}
        </div>

        {s.mode === "spin" ? (
          <div className={panel}>
            <h2 className="text-sm font-bold text-ink">Feature lines</h2>
            <p className="mt-1 text-xs text-muted">Shown one at a time while it spins. Each can play an animation on the screen.</p>
            <ol className="mt-3 space-y-2">
              {s.lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_7.5rem_auto] items-center gap-2">
                  <input aria-label={`Line ${i + 1}`} className={input} value={l.text} onChange={(e) => setLine(i, { text: e.target.value })} />
                  <select aria-label={`Line ${i + 1} animation`} className={input} value={l.anim ?? IDLE} onChange={(e) => setLine(i, { anim: e.target.value || undefined })}>
                    {animOptions.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                  <button type="button" className={smallButton} aria-label={`Remove line ${i + 1}`} onClick={() => set({ lines: s.lines.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={() => set({ lines: [...s.lines, { text: "" }] })}>Add line</button>
              <button type="button" className={smallButton} onClick={() => set({ lines: CLIP_FEATURES })}>Reset lines</button>
            </div>
            <div className="mt-4">
              <SliderField label="Seconds per line" value={s.perLine} min={1.2} max={4} step={0.1} onChange={(v) => set({ perLine: v })} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <TextField label="End card title" value={s.endTitle} onChange={(v) => set({ endTitle: v })} />
              <TextField label="End card line" value={s.endLine} onChange={(v) => set({ endLine: v })} />
            </div>
          </div>
        ) : (
          <div className={panel}>
            <h2 className="text-sm font-bold text-ink">Face and captions</h2>
            <div className="mt-3 space-y-3">
              <SelectField label="Animation" value={s.faceAnim} onChange={(v) => set({ faceAnim: v })} options={animOptions} />
              <TextField label="Top caption" value={s.top} onChange={(v) => set({ top: v })} />
              <TextField label="Bottom caption" value={s.bottom} onChange={(v) => set({ bottom: v })} />
              <SliderField label="Length (seconds)" value={s.seconds} min={3} max={15} step={1} onChange={(v) => set({ seconds: v })} />
            </div>
          </div>
        )}
      </fieldset>

      <div className="min-w-0">
        <div className="lg:sticky lg:top-6">
          <div className="mx-auto w-full max-w-[22rem]">
            <canvas
              ref={canvas}
              role="img"
              aria-label="Clip preview"
              className="block h-auto w-full rounded-card shadow-lg ring-1 ring-line"
              style={{ aspectRatio: `${W} / ${H}` }}
            />
            {s.mode === "spin" && sceneState !== "ready" ? (
              <p className="mt-2 text-center text-sm text-muted">
                {sceneState === "loading" ? "Loading the 3D Lumi…" : "The 3D view couldn't start in this browser (it needs WebGL)."}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className={smallButton} onClick={restart} disabled={locked}>Restart</button>
              <button type="button" className={primaryButton} onClick={record} disabled={locked || !format}>
                Record video ({Math.ceil(length)} s)
              </button>
              <button type="button" className={smallButton} onClick={still} disabled={locked}>Save still (PNG)</button>
            </div>
            <p role="status" className="mt-3 text-center text-sm text-ink-soft">
              {busy ??
                (!format
                  ? "This browser can't record video. Use Chrome or Edge."
                  : format.ext === "webm"
                    ? "This browser records WebM. Instagram needs MP4: use Chrome or Edge, or convert it."
                    : `Saves a ${W} × ${H} MP4 with no sound: add music in TikTok or Instagram.`)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
