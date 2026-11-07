// The Clip maker's timing, backgrounds and text, as plain functions so they can be tested
// without a browser. Times are in seconds from the start of the clip.

export interface Segment {
  kind: "line" | "end";
  text: string;
  /** Animation the face plays during this segment (a key of the persona's animations), if any. */
  anim?: string;
  start: number;
  end: number;
}

export interface Timeline {
  total: number;
  /** When the spin settles facing the camera (the end card's start). */
  settleAt: number;
  segments: Segment[];
}

export interface TimelineOptions {
  /** Empty time before the first line, so the clip opens on the Lumi. */
  intro?: number;
  /** How long each feature line stays up. */
  perLine?: number;
  endCard?: number;
}

export const FADE = 0.35;

export function timeline(lines: { text: string; anim?: string }[], opts: TimelineOptions = {}): Timeline {
  const intro = opts.intro ?? 0.8;
  const perLine = opts.perLine ?? 2.4;
  const endCard = opts.endCard ?? 3;
  const segments: Segment[] = [];
  let t = intro;
  for (const l of lines) {
    const text = l.text.trim();
    if (!text) continue;
    segments.push({ kind: "line", text, ...(l.anim ? { anim: l.anim } : {}), start: t, end: t + perLine });
    t += perLine;
  }
  segments.push({ kind: "end", text: "", start: t, end: t + endCard });
  return { total: t + endCard, settleAt: t, segments };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** How visible a segment is at time t: opacity 0..1, and a slide offset (1 = fully below, 0 = in place). */
export function segmentState(s: Segment, t: number): { opacity: number; slide: number } {
  if (t < s.start || t >= s.end) return { opacity: 0, slide: 1 };
  const fadeIn = clamp01((t - s.start) / FADE);
  // The end card stays up to the last frame; lines fade out before the next one comes in.
  const fadeOut = s.kind === "end" ? 1 : clamp01((s.end - t) / FADE);
  return { opacity: Math.min(easeOut(fadeIn), fadeOut), slide: 1 - easeOut(fadeIn) };
}

/** The segment on screen at time t (segments never overlap). */
export function segmentAt(tl: Timeline, t: number): Segment | undefined {
  return tl.segments.find((s) => t >= s.start && t < s.end) ?? (t >= tl.total ? tl.segments.at(-1) : undefined);
}

/**
 * The turntable angle (radians) at time t: whole turns eased in and out so the Lumi faces the
 * camera exactly when the end card comes up, then holds still. `turns` 0 means a gentle sway.
 */
export function spinAngle(t: number, settleAt: number, turns: number): number {
  if (t >= settleAt || settleAt <= 0) return 0;
  const x = clamp01(t / settleAt);
  if (turns <= 0) return Math.sin(x * Math.PI * 2) * 0.35 * (1 - x);
  return Math.PI * 2 * turns * easeInOut(x);
}

// ---- Backgrounds ------------------------------------------------------------------------

export type BackgroundId = "shell" | "night" | "lavender" | "mint" | "peach" | "photo";

export const BACKGROUNDS: { id: BackgroundId; name: string }[] = [
  { id: "shell", name: "Matches the shell" },
  { id: "night", name: "Night glow" },
  { id: "lavender", name: "Lavender" },
  { id: "mint", name: "Mint" },
  { id: "peach", name: "Peach" },
  { id: "photo", name: "Your photo" },
];

const BRAND: Record<"lavender" | "mint" | "peach", [string, string]> = {
  lavender: ["#f0e7fa", "#ddbbea"],
  mint: ["#e5f4ea", "#b6e5cf"],
  peach: ["#fbe8e3", "#ffcdb5"],
};

export const INK = "#30263a";

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes a colour toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  const [r, g, b] = hexRgb(hex).map((c) => Math.round(c + (target - c) * a));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Relative luminance 0..1 of a hex colour. */
export function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Text colour for a background: dark ink on light ones, white on dark ones and photos. */
export function inkFor(bg: BackgroundId, shell: string): string {
  if (bg === "night" || bg === "photo") return "#ffffff";
  if (bg === "shell") return luminance(shell) > 0.3 ? INK : "#ffffff";
  return INK;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: BackgroundId,
  shell: string,
  photo?: CanvasImageSource & { width: number; height: number },
) {
  if (bg === "photo" && photo) {
    // Cover the frame, centred, then darken a little so white text reads.
    const s = Math.max(w / photo.width, h / photo.height);
    const pw = photo.width * s, ph = photo.height * s;
    ctx.drawImage(photo, (w - pw) / 2, (h - ph) / 2, pw, ph);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg === "night" || (bg === "photo" && !photo)) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#1d1b33");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = ctx.createRadialGradient(w / 2, h * 0.47, 0, w / 2, h * 0.47, w * 0.7);
    r.addColorStop(0, "rgba(60, 240, 255, 0.22)");
    r.addColorStop(1, "rgba(60, 240, 255, 0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const [top, bottom] = bg === "shell" ? [shade(shell, 0.55), shade(shell, -0.08)] : BRAND[bg as keyof typeof BRAND];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A soft light behind the Lumi.
  const r = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.65);
  r.addColorStop(0, "rgba(255, 255, 255, 0.45)");
  r.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}

// ---- Text -------------------------------------------------------------------------------

/** Splits text into lines that fit maxWidth, by words. */
export function wrap(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export interface TextStyle {
  ink: string;
  font: string;
  displayFont: string;
}

/** A feature line in a soft pill, in the lower part of the frame. */
export function drawLine(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, state: { opacity: number; slide: number }, st: TextStyle) {
  if (state.opacity <= 0) return;
  const size = Math.round(w * 0.062);
  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.font = `800 ${size}px ${st.displayFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap((s) => ctx.measureText(s).width, text, w * 0.78);
  const lh = size * 1.18;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.4;
  const boxH = lines.length * lh + size * 0.9;
  const cy = h * 0.8 + state.slide * h * 0.03;
  const dark = st.ink !== "#ffffff";
  ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.72)" : "rgba(10, 12, 28, 0.55)";
  ctx.beginPath();
  ctx.roundRect(w / 2 - boxW / 2, cy - boxH / 2, boxW, boxH, size * 0.6);
  ctx.fill();
  ctx.fillStyle = st.ink;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}

// The Snaggo mark (public/icon.svg without its tile), in its own units: about 800 x 670.
const MARK = "M183 915Q520 600 873 407Q995 545 982 762L870 585L775 688L718 596L601 750L582 703L485 942L597 850L620 922L770 795L833 970L937 856L940 1043L876 1078L397 1047L297 900ZM330 806L527 653A125 125 0 0 1 330 806Z";
let markPath: Path2D | undefined;

/** The Snaggo mark and name, centred on cx, size = the name's font size. */
export function drawBrand(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, st: TextStyle) {
  markPath ??= new Path2D(MARK);
  ctx.save();
  ctx.font = `800 ${size}px ${st.displayFont}`;
  const markH = size * 1.05;
  const markW = (800 / 670) * markH;
  const gap = size * 0.3;
  const textW = ctx.measureText("Snaggo").width;
  const x0 = cx - (markW + gap + textW) / 2;
  ctx.fillStyle = st.ink;
  ctx.save();
  ctx.translate(x0, cy - markH / 2);
  ctx.scale(markH / 670, markH / 670);
  ctx.translate(-183, -407);
  ctx.fill(markPath, "evenodd");
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Snaggo", x0 + markW + gap, cy + size * 0.04);
  ctx.restore();
}

/** The end card: the brand at the top, then the title and the call to action under the settled Lumi. */
export function drawEndCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: { opacity: number; slide: number },
  card: { title: string; line: string },
  st: TextStyle,
) {
  if (state.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = state.opacity;
  drawBrand(ctx, w / 2, Math.min(h * 0.09, w * 0.16) - state.slide * h * 0.02, Math.round(w * 0.06), st);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const title = Math.round(w * 0.085);
  ctx.fillStyle = st.ink;
  ctx.font = `800 ${title}px ${st.displayFont}`;
  ctx.fillText(card.title, w / 2, h * 0.79 + state.slide * h * 0.03);
  ctx.font = `700 ${Math.round(w * 0.05)}px ${st.font}`;
  ctx.fillText(card.line, w / 2, h * 0.79 + title * 1.05 + state.slide * h * 0.03);
  ctx.restore();
}

/** A caption at the top or bottom of the frame (face close-ups). */
export function drawCaption(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, where: "top" | "bottom", st: TextStyle) {
  if (!text.trim()) return;
  const size = Math.round(w * 0.07);
  ctx.save();
  ctx.font = `800 ${size}px ${st.displayFont}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = st.ink;
  const lines = wrap((s) => ctx.measureText(s).width, text, w * 0.84);
  const lh = size * 1.15;
  const cy = where === "top" ? h * 0.17 : h * 0.83;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}
