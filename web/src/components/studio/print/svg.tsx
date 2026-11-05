/**
 * Drawing helpers for Studio's print pages. Everything is drawn in points (1/72 in) inside SVGs
 * sized in inches, the same coordinates as the desktop Studio's QPainter code
 * (tools/studio/lumi_studio/odds_card.py and unit_cards.py), so the cards come out the same.
 */
import type { CSSProperties } from "react";

export const PT = 72;
export const CLOUD = "#f9f7f3";
export const LAVENDER_PALE = "#f0e7fa";
export const LAVENDER_DEEP = "#774791";
export const INK = "#30263a";
export const MUTED = "#685f6c";
export const LINE = "#e9e3ea";
export const GLASS = "#0b0b0e";
export const RARITY_COLOURS: Record<string, string> = { common: "#9aa5b1", uncommon: "#4cd07d", rare: "#4aa8ff", legendary: "#ffb627" };
/** The site's colours, deepened so they read on the cream card when printed. */
export const RARITY_TEXT: Record<string, string> = { common: "#5f6b78", uncommon: "#1f8a4c", rare: "#1f6fc4", legendary: "#a86d00" };

export interface Font {
  size: number;
  bold?: boolean;
  /** Bricolage Grotesque (headings) instead of Manrope. */
  display?: boolean;
  /** Extra letter spacing, as Qt's percentage spacing minus 100. */
  spacing?: number;
}

export const font = (size: number, bold = false, display = false, spacing = 0): Font => ({ size, bold, display, spacing });

function fontStyle(f: Font): CSSProperties {
  return {
    fontFamily: f.display ? "var(--font-bricolage), sans-serif" : "var(--font-manrope), sans-serif",
    fontWeight: f.display ? (f.bold ? 800 : 700) : f.bold ? 700 : 400,
    fontSize: `${f.size}px`, // one CSS px is one point inside these SVGs
    letterSpacing: f.spacing ? `${f.spacing / 100}em` : undefined,
    lineHeight: 1.22,
  };
}

/** Text in a box, wrapping like Qt's drawText with word wrap. */
export function T({ x, y, w, h, children, f, colour = INK, align = "left", valign = "top" }: {
  x: number; y: number; w: number; h: number; children: React.ReactNode; f: Font; colour?: string;
  align?: "left" | "right" | "center"; valign?: "top" | "middle";
}) {
  return (
    <foreignObject x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h) + 4}>
      <div
        style={{
          ...fontStyle(f),
          color: colour,
          textAlign: align,
          height: valign === "middle" ? `${h}px` : undefined,
          display: valign === "middle" ? "flex" : "block",
          alignItems: valign === "middle" ? "center" : undefined,
          justifyContent: valign === "middle" ? (align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start") : undefined,
          margin: 0,
        }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

/** A title with an optional note set right after it, in one line (the odds card's sections). */
export function Section({ x, y, w, title, note }: { x: number; y: number; w: number; title: string; note?: string }) {
  return (
    <foreignObject x={x} y={y} width={w} height={18}>
      <div style={{ ...fontStyle(font(9.5, true, true)), color: INK, whiteSpace: "nowrap" }}>
        {title}
        {note ? <span style={{ ...fontStyle(font(6.6)), color: MUTED, marginLeft: 5 }}>{note}</span> : null}
      </div>
    </foreignObject>
  );
}

let clipCount = 0;
export const clipId = (name: string) => `${name}-${++clipCount}`;

/**
 * A face on a little black OLED: the image fills the box inside rounded glass. `source` crops
 * the 512 x 256 image ([x, y, w, h] in image pixels) to zoom in.
 */
export function Glass({ x, y, w, h, href, source }: { x: number; y: number; w: number; h: number; href: string; source?: [number, number, number, number] }) {
  const pad = h * 0.07;
  const id = clipId("glass");
  const [sx, sy, sw, sh] = source ?? [0, 0, 512, 256];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h * 0.14} fill={GLASS} />
      <clipPath id={id}>
        <rect x={x + pad} y={y + pad} width={w - 2 * pad} height={h - 2 * pad} rx={h * 0.08} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <svg x={x + pad} y={y + pad} width={w - 2 * pad} height={h - 2 * pad} viewBox={`${sx} ${sy} ${sw} ${sh}`} preserveAspectRatio="none">
          <image href={href} x={0} y={0} width={512} height={256} style={{ imageRendering: "pixelated" }} />
        </svg>
      </g>
    </g>
  );
}
