/**
 * Birth certificates: one business-card-size card per unit (3.5 x 2 in), eight to a Letter sheet,
 * fronts then backs, with cut marks. A port of tools/studio/lumi_studio/unit_cards.py.
 * Backs sit mirrored left to right, so after flipping on the long edge each back lands behind
 * its front.
 */
import type { StudioCore } from "@/lib/studio/core";
import { oddsText, rowPersona, type ManifestRow } from "@/lib/studio/factory";
import { frameDataUrl } from "@/lib/studio/frame-image";
import { CLOUD, GLASS, INK, LAVENDER_DEEP, LAVENDER_PALE, LINE, MUTED, PT, RARITY_COLOURS, RARITY_TEXT, T, clipId, font } from "./svg";

const CW = 3.5 * PT;
const CH = 2 * PT;
const BLEED = 0.125 * PT;
const PAD = 12;
const COLS = 2;
const ROWS = 4;
const GAP = 22; // between cards on the sheet: room for bleed and cut marks
export const PER_SHEET = COLS * ROWS;
const LETTER: [number, number] = [8.5 * PT, 11 * PT];

const WAKE = "I travel asleep, so bumps in the post can't wake me. Tap my screen three times and I'll say hello.";
const MENU = "Hold me upside down for 2 seconds, then turn me back up. Tilt to choose, pat to pick.";

// The Pocket Lumi from the front, in mm, from hardware/enclosure/lumi_case.scad.
const MM = 2.2; // points per mm in the drawing
const CASE_W = 35, CASE_H = 37, CASE_R = 6;
const WIN_W = 22.8, WIN_H = 12, WIN_R = 1.2;
const WIN_DY = 1.8; // the window's centre sits this far below the case's centre
const ACTIVE_W = 21.7, ACTIVE_H = 10.9; // the lit part of the OLED
const BAIL_W = 10, BAIL_H = 7.5, BAIL_HOLE = 3.4;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}
function circlePath(cx: number, cy: number, r: number) {
  return `M${cx - r},${cy}A${r},${r} 0 1 0 ${cx + r},${cy}A${r},${r} 0 1 0 ${cx - r},${cy}Z`;
}

/** The Lumi at true proportions: white shell, keyring tab, and its own face on the screen. `top` is the tab's top. */
function Lumi({ cx, top, face }: { cx: number; top: number; face: string }) {
  const cy0 = top + BAIL_H * MM;
  const caseX = cx - (CASE_W * MM) / 2;
  const outline = { stroke: "#d9d1dc", strokeWidth: 0.7 };
  const tab = roundedRectPath(cx - (BAIL_W * MM) / 2, top, BAIL_W * MM, (BAIL_H + 4) * MM, (BAIL_W * MM) / 2);
  const hole = circlePath(cx, top + (BAIL_W * MM) / 2, (BAIL_HOLE * MM) / 2);
  const winW = WIN_W * MM, winH = WIN_H * MM;
  const winCy = cy0 + (CASE_H * MM) / 2 + WIN_DY * MM;
  let w = ACTIVE_W * MM;
  let h = w / 2;
  if (h > ACTIVE_H * MM) {
    h = ACTIVE_H * MM;
    w = h * 2;
  }
  return (
    <g>
      <path d={`${tab}${hole}`} fillRule="evenodd" fill="#ffffff" {...outline} />
      <rect x={caseX} y={cy0 + 1.6} width={CASE_W * MM} height={CASE_H * MM} rx={CASE_R * MM} fill="rgba(48,38,58,0.1)" />
      <rect x={caseX} y={cy0} width={CASE_W * MM} height={CASE_H * MM} rx={CASE_R * MM} fill="#ffffff" {...outline} />
      <rect x={cx - winW / 2} y={winCy - winH / 2} width={winW} height={winH} rx={WIN_R * MM} fill={GLASS} />
      <image href={face} x={cx - w / 2} y={winCy - h / 2} width={w} height={h} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />
    </g>
  );
}

function traits(r: ManifestRow) {
  const bits = [`${r.eye_shape} eyes`, r.highlight !== "none" ? `${r.highlight} glint` : "no glint"];
  if (r.accent && r.accent !== "none") bits.push(r.accent);
  bits.push(`${r.eye_size} size, ${r.spacing} spacing, ${r.height} height`);
  return bits.join(" · ");
}

function Background() {
  return <rect x={-BLEED} y={-BLEED} width={CW + 2 * BLEED} height={CH + 2 * BLEED} fill={CLOUD} />;
}

function Front({ row, core }: { row: ManifestRow; core: StudioCore }) {
  const genes = rowPersona(row).genes;
  const face = frameDataUrl(core.renderExpression(core.expressions.indexOf("neutral"), genes, 600), 4);
  const x = 128 + PAD;
  const w = CW - x - PAD;
  const odds = oddsText(core, genes);
  const born = (row.provisioned_at || "").slice(0, 10);
  return (
    <>
      <Background />
      <rect x={-BLEED} y={-BLEED} width={128 + BLEED} height={CH + 2 * BLEED} fill={LAVENDER_PALE} />
      <Lumi cx={64} top={(CH - (BAIL_H + CASE_H) * MM) / 2} face={face} />
      <T x={x} y={PAD} w={w} h={10} f={font(5.6, true, false, 14)} colour={LAVENDER_DEEP}>POCKET LUMI</T>
      <T x={x} y={PAD + 9} w={w} h={28} f={font(19, false, true)}>{row.name}</T>
      <circle cx={x + 3} cy={PAD + 45.5} r={3} fill={RARITY_COLOURS[row.rarity] ?? "#999999"} />
      <T x={x + 9} y={PAD + 40} w={w - 9} h={11} f={font(7.6, true)}>{cap(row.rarity)}</T>
      <T x={x} y={PAD + 54} w={w} h={11} f={font(7.4)} colour={MUTED}>{`${cap(row.temperament)} temperament`}</T>
      {odds ? (
        <>
          <T x={x} y={PAD + 67} w={w} h={16} f={font(12, false, true)} colour={RARITY_TEXT[row.rarity] ?? INK}>{odds}</T>
          <T x={x} y={PAD + 82} w={w} h={10} f={font(5.8)} colour={MUTED}>chance of this exact Lumi</T>
        </>
      ) : null}
      <line x1={x} y1={CH - PAD - 16} x2={CW - PAD} y2={CH - PAD - 16} stroke={LINE} strokeWidth={0.6} />
      <T x={x} y={CH - PAD - 12} w={w} h={10} f={font(6.2, true)}>{row.serial}</T>
      <T x={x} y={CH - PAD - 12} w={w} h={10} f={font(6.2)} colour={MUTED} align="right">{born ? `Made ${born}` : ""}</T>
    </>
  );
}

function Back({ row }: { row: ManifestRow }) {
  const w = CW - 2 * PAD;
  const chipW = w * 0.86;
  return (
    <>
      <Background />
      <T x={PAD} y={PAD} w={w} h={22} f={font(14, false, true)}>{`Hi, I'm ${row.name}!`}</T>
      <T x={PAD} y={PAD + 24} w={w} h={34} f={font(7.4)}>{WAKE}</T>
      <rect x={PAD} y={PAD + 50} width={chipW} height={19} rx={6} fill={LAVENDER_PALE} />
      <T x={PAD + 6} y={PAD + 50} w={30} h={19} f={font(5.6, true)} colour={LAVENDER_DEEP} valign="middle">Settings</T>
      <T x={PAD + 36} y={PAD + 50} w={chipW - 42} h={19} f={font(5.4)} valign="middle">{MENU}</T>
      <T x={PAD} y={PAD + 75} w={w} h={22} f={font(6.2)} colour={MUTED}>{`My looks: ${traits(row)}`}</T>
      <line x1={PAD} y1={CH - PAD - 16} x2={CW - PAD} y2={CH - PAD - 16} stroke={LINE} strokeWidth={0.6} />
      <T x={PAD} y={CH - PAD - 12} w={w} h={10} f={font(6.2)} colour={MUTED}>{`${row.serial}  ·  look #${row.look}`}</T>
      <T x={PAD} y={CH - PAD - 12} w={w} h={10} f={font(6.2, true)} colour={LAVENDER_DEEP} align="right">snaggo.tech</T>
    </>
  );
}

function slots(): [number, number][] {
  const [lw, lh] = LETTER;
  const left = (lw - COLS * CW - (COLS - 1) * GAP) / 2;
  const top = (lh - ROWS * CH - (ROWS - 1) * GAP) / 2;
  const out: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push([left + c * (CW + GAP), top + r * (CH + GAP)]);
  return out;
}

function CutMarks() {
  const s = slots();
  const xs = [...new Set(s.flatMap(([x]) => [x, x + CW]))].sort((a, b) => a - b);
  const ys = [...new Set(s.flatMap(([, y]) => [y, y + CH]))].sort((a, b) => a - b);
  const near = BLEED + 3, far = BLEED + 15;
  const top = ys[0]!, bottom = ys.at(-1)!, left = xs[0]!, right = xs.at(-1)!;
  return (
    <g stroke="#000000" strokeWidth={0.4}>
      {xs.map((x) => (
        <g key={`x${x}`}>
          <line x1={x} y1={top - near} x2={x} y2={top - far} />
          <line x1={x} y1={bottom + near} x2={x} y2={bottom + far} />
        </g>
      ))}
      {ys.map((y) => (
        <g key={`y${y}`}>
          <line x1={left - near} y1={y} x2={left - far} y2={y} />
          <line x1={right + near} y1={y} x2={right + far} y2={y} />
        </g>
      ))}
    </g>
  );
}

/** Every sheet: a page of fronts, then a page of backs. */
export function UnitCardSheets({ rows, core }: { rows: ManifestRow[]; core: StudioCore }) {
  const sorted = [...rows].sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
  const sheets: ManifestRow[][] = [];
  for (let i = 0; i < sorted.length; i += PER_SHEET) sheets.push(sorted.slice(i, i + PER_SHEET));
  const s = slots();
  return (
    <>
      {sheets.flatMap((sheet, n) =>
        (["front", "back"] as const).map((side) => {
          const range = `${sheet[0]?.serial ?? ""}${sheet.length > 1 ? ` – ${sheet.at(-1)!.serial}` : ""}`;
          const note = side === "front" ? "Print at 100% (actual size), double-sided, flip on long edge. Cut on the marks." : "Backs";
          return (
            <svg key={`${n}-${side}`} className="studio-sheet" width="8.5in" height="11in" viewBox={`0 0 ${LETTER[0]} ${LETTER[1]}`}>
              <rect width={LETTER[0]} height={LETTER[1]} fill="#ffffff" />
              {sheet.map((row, i) => {
                const col = i % COLS, r = Math.floor(i / COLS);
                const [x, y] = s[r * COLS + (side === "front" ? col : COLS - 1 - col)]!;
                const id = clipId("card");
                return (
                  <g key={row.serial} transform={`translate(${x} ${y})`}>
                    <clipPath id={id}>
                      <rect x={-BLEED} y={-BLEED} width={CW + 2 * BLEED} height={CH + 2 * BLEED} />
                    </clipPath>
                    <g clipPath={`url(#${id})`}>{side === "front" ? <Front row={row} core={core} /> : <Back row={row} />}</g>
                  </g>
                );
              })}
              <CutMarks />
              <T x={0} y={LETTER[1] - 24} w={LETTER[0]} h={12} f={font(6.5)} colour={MUTED} align="center">{`${note}   ·   ${range}`}</T>
            </svg>
          );
        }),
      )}
    </>
  );
}
