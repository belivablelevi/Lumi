/**
 * The personality-odds insert that ships with each Lumi: a 4 x 6 in card, both sides. Every number
 * comes from the firmware's gene weights and every face from its face engine. A port of
 * tools/studio/lumi_studio/odds_card.py.
 */
import { RARITIES, type StudioCore } from "@/lib/studio/core";
import { frameDataUrl, litBounds } from "@/lib/studio/frame-image";
import { GENE, geneOdds, percents, rarityOdds, withGene } from "@/lib/studio/odds";
import { CLOUD, Glass, LAVENDER_DEEP, LAVENDER_PALE, LINE, MUTED, PT, RARITY_COLOURS, Section, T, clipId, font } from "./svg";

const W = 4 * PT;
const H = 6 * PT;
const BLEED = 0.125 * PT;
const MARGIN = 18;
const LETTER: [number, number] = [8.5 * PT, 11 * PT];
const LETTER_GAP = 36;

// What each temperament is like (its favourite animations in genes.cpp), and a face that shows it.
const TEMPERAMENTS: Record<string, [string, string]> = {
  cheerful: ["Giggles when you pat it, hums and dances.", "happy"],
  sleepy: ["Tires quickly. Yawns, zones out and nods off.", "sleepy"],
  shy: ["Blushes and squishes up when you pat it.", "cute"],
  grumpy: ["Side-eyes and pouts, but secretly loves a pat.", "suspicious"],
  hyper: ["Bouncy and quick. Dances until it goes cross-eyed.", "excited"],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useFace(core: StudioCore) {
  return (genes: number[], expr = "neutral") => core.renderExpression(Math.max(0, core.expressions.indexOf(expr)), genes, 600);
}

function Background() {
  return (
    <>
      <rect x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} fill={CLOUD} />
      <rect x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={BLEED + 86} fill={LAVENDER_PALE} />
    </>
  );
}

function Header({ title, intro, size = 24 }: { title: string; intro: string; size?: number }) {
  return (
    <>
      <T x={MARGIN} y={MARGIN} w={W - 2 * MARGIN} h={10} f={font(6.2, true, false, 14)} colour={LAVENDER_DEEP}>
        POCKET LUMI  ·  PERSONALITY GUIDE
      </T>
      <T x={MARGIN} y={MARGIN + 10} w={W - 2 * MARGIN} h={32} f={font(size, false, true)}>{title}</T>
      <T x={MARGIN} y={MARGIN + 44} w={W - 2 * MARGIN} h={30} f={font(7.6)} colour={MUTED}>{intro}</T>
    </>
  );
}

function OddsFront({ core }: { core: StudioCore }) {
  const face = useFace(core);
  const rarity = rarityOdds(core);
  const pcts = percents(RARITIES.map((t) => rarity[t]));
  const barY = 100 + 15 + 1;
  const barW = W - 2 * MARGIN;
  const bar = clipId("bar");
  // Where each tier's part of the bar starts.
  const starts = RARITIES.map((_, i) => MARGIN + RARITIES.slice(0, i).reduce((a, t) => a + barW * rarity[t], 0));
  const col = barW / RARITIES.length;
  const tY = 100 + 15 + 48;
  const tStart = tY + 15;
  const odds = geneOdds(core, GENE.temperament);
  const tp = percents(odds.map(([, s]) => s));
  const row = 41;
  return (
    <>
      <Background />
      <Header
        title="Meet your Lumi"
        intro="No two Lumis are alike. Its looks and temperament were picked by chance when it was made. Here's how likely each one is."
      />
      <Section x={MARGIN} y={100} w={W - 2 * MARGIN} title="How rare is yours?" />
      <clipPath id={bar}>
        <rect x={MARGIN} y={barY} width={barW} height={13} rx={6.5} />
      </clipPath>
      <g clipPath={`url(#${bar})`}>
        {RARITIES.map((t, i) => (
          <rect key={t} x={starts[i]} y={barY} width={barW * rarity[t] + 0.3} height={13} fill={RARITY_COLOURS[t]} />
        ))}
      </g>
      {RARITIES.map((t, i) => {
        const lx = MARGIN + i * col;
        const y = 115;
        return (
          <g key={t}>
            <circle cx={lx + 3} cy={y + 24.5} r={3} fill={RARITY_COLOURS[t]} />
            <T x={lx + 9} y={y + 19} w={col - 9} h={10} f={font(7.4, true)}>{cap(t)}</T>
            <T x={lx + 9} y={y + 28.5} w={col - 9} h={10} f={font(7.4)} colour={MUTED}>{`${pcts[i]}%`}</T>
          </g>
        );
      })}
      <Section x={MARGIN} y={tY} w={W - 2 * MARGIN} title="Temperament" note="how it acts" />
      {odds.map(([name], i) => {
        const ry = tStart + 2 + i * row;
        const [desc, expr] = TEMPERAMENTS[name] ?? ["", "neutral"];
        return (
          <g key={name}>
            <Glass x={MARGIN} y={ry} w={64} h={32} href={frameDataUrl(face(withGene(GENE.temperament, i), expr), 4)} />
            <T x={MARGIN + 74} y={ry + 3} w={120} h={14} f={font(10.5, false, true)}>{cap(name)}</T>
            <T x={W - MARGIN - 60} y={ry + 3} w={60} h={14} f={font(10.5, false, true)} align="right">{`${tp[i]}%`}</T>
            <T x={MARGIN + 74} y={ry + 17} w={W - 2 * MARGIN - 74} h={16} f={font(7)} colour={MUTED}>{desc}</T>
            {i < odds.length - 1 ? (
              <line x1={MARGIN + 74} y1={ry + row - 4.5} x2={W - MARGIN} y2={ry + row - 4.5} stroke={LINE} strokeWidth={0.6} />
            ) : null}
          </g>
        );
      })}
      <line x1={MARGIN} y1={H - MARGIN - 22} x2={W - MARGIN} y2={H - MARGIN - 22} stroke={LINE} strokeWidth={0.6} />
      <T x={MARGIN} y={H - MARGIN - 18} w={W - 2 * MARGIN} h={20} f={font(6.4)} colour={MUTED}>
        To see your Lumi&apos;s name and rarity, hold it upside down until the menu opens, then tilt to BATTERY and pat it.
      </T>
    </>
  );
}

type Tile = { href: string; source?: [number, number, number, number]; name: string; pc: number };

function OddsBack({ core }: { core: StudioCore }) {
  const face = useFace(core);
  const inner = W - 2 * MARGIN;
  const parts: React.ReactNode[] = [];

  /** One tile per option of `gene` on a typical Lumi; with `half`, zoomed on the same square around that eye. */
  const items = (gene: number, half?: 0 | 1): Tile[] => {
    const odds = geneOdds(core, gene);
    const frames = odds.map((_, i) => face(withGene(gene, i)));
    let source: Tile["source"];
    if (half !== undefined) {
      const [x0, x1] = half === 0 ? [0, 64] : [64, 128];
      const boxes = frames.map((f) => litBounds(f, x0, x1)).filter((b): b is [number, number, number, number] => b !== null);
      // In the 512 x 256 image's pixels (4 per OLED pixel), like the desktop.
      const l = Math.min(...boxes.map((b) => b[0])) * 4, t = Math.min(...boxes.map((b) => b[1])) * 4;
      const r = Math.max(...boxes.map((b) => b[2])) * 4, b = Math.max(...boxes.map((b2) => b2[3])) * 4;
      const side = Math.max(r - l, b - t) + 24;
      source = [(l + r) / 2 - side / 2, (t + b) / 2 - side / 2, side, side];
    }
    const pc = percents(odds.map(([, s]) => s));
    return frames.map((f, i) => ({ href: frameDataUrl(f, 4), source, name: odds[i]![0], pc: pc[i]! }));
  };

  const grid = (y: number, tiles: Tile[], cols: number, tw: number, th: number, gap: number, stacked = false) => {
    const labelH = stacked ? 18 : 10;
    tiles.forEach((tile, i) => {
      const cx = MARGIN + (i % cols) * (tw + gap);
      const cy = y + Math.floor(i / cols) * (th + labelH + 6);
      parts.push(
        <g key={`${y}-${i}`}>
          <Glass x={cx} y={cy} w={tw} h={th} href={tile.href} source={tile.source} />
          <T x={cx} y={cy + th + 2} w={tw + gap} h={10} f={font(6.6, true)}>{tile.name}</T>
          {stacked ? (
            <T x={cx} y={cy + th + 10} w={tw} h={10} f={font(6.6)} colour={MUTED}>{`${tile.pc}%`}</T>
          ) : (
            <T x={cx} y={cy + th + 2} w={tw} h={10} f={font(6.6)} colour={MUTED} align="right">{`${tile.pc}%`}</T>
          )}
        </g>,
      );
    });
    return y + Math.ceil(tiles.length / cols) * (th + labelH + 6);
  };
  const section = (y: number, title: string, note?: string) => {
    parts.push(<Section key={`s-${title}`} x={MARGIN} y={y} w={inner} title={title} note={note} />);
    return y + 15;
  };

  let y = section(100, "Eye shape");
  let gap = 8;
  let tw = (inner - 3 * gap) / 4;
  y = grid(y + 1, items(GENE.shape), 4, tw, tw / 2, gap);
  gap = 6;
  tw = (inner - 5 * gap) / 6;
  y = section(y + 4, "Sparkle", "the glint in its eyes");
  y = grid(y + 1, items(GENE.shine, 0), 6, tw, tw, gap, true);
  y = section(y + 4, "A little extra");
  y = grid(y + 1, items(GENE.accent, 1), 6, tw, tw, gap, true);
  y = section(y + 2, "Also varies");
  for (const [label, gene] of [["Eye size", GENE.size], ["Eye spacing", GENE.spacing], ["Eye height", GENE.height]] as const) {
    const o = geneOdds(core, gene);
    const pc = percents(o.map(([, s]) => s));
    parts.push(
      <g key={label}>
        <T x={MARGIN} y={y} w={52} h={10} f={font(6.4, true)}>{label}</T>
        <T x={MARGIN + 50} y={y} w={W - 2 * MARGIN - 50} h={10} f={font(6.4)} colour={MUTED}>
          {o.map(([n], i) => `${n} ${pc[i]}%`).join(", ")}
        </T>
      </g>,
    );
    y += 10.5;
  }

  return (
    <>
      <Background />
      <Header
        title="How rare are its looks?"
        intro="Each feature was picked on its own, so a Lumi can be common in one way and rare in another. The smaller the number, the rarer it is."
        size={21}
      />
      {parts}
    </>
  );
}

function Side({ side, core }: { side: "front" | "back"; core: StudioCore }) {
  const id = clipId("odds");
  return (
    <>
      <clipPath id={id}>
        <rect x={-BLEED} y={-BLEED} width={W + 2 * BLEED} height={H + 2 * BLEED} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{side === "front" ? <OddsFront core={core} /> : <OddsBack core={core} />}</g>
    </>
  );
}

/** The card on its own: 2 pages of 4.25 x 6.25 in (4 x 6 in plus bleed), for a print shop. */
export function OddsCardPages({ core }: { core: StudioCore }) {
  const pw = W + 2 * BLEED, ph = H + 2 * BLEED;
  return (
    <>
      {(["front", "back"] as const).map((side) => (
        <svg key={side} className="studio-sheet" width={`${pw / PT}in`} height={`${ph / PT}in`} viewBox={`0 0 ${pw} ${ph}`}>
          <g transform={`translate(${BLEED} ${BLEED})`}>
            <Side side={side} core={core} />
          </g>
        </svg>
      ))}
    </>
  );
}

function letterSlots(): [number, number][] {
  const [lw, lh] = LETTER;
  const x = (lw - H) / 2;
  const top = (lh - 2 * W - LETTER_GAP) / 2;
  return [[x, top], [x, top + W + LETTER_GAP]];
}

/** Two cards per Letter sheet with cut marks: print both pages double-sided, flip on the long edge. */
export function OddsCardLetter({ core }: { core: StudioCore }) {
  const [lw, lh] = LETTER;
  const s = letterSlots();
  const xs = [...new Set(s.flatMap(([x]) => [x, x + H]))].sort((a, b) => a - b);
  const ys = [...new Set(s.flatMap(([, y]) => [y, y + W]))].sort((a, b) => a - b);
  const near = BLEED + 6, far = BLEED + 24;
  return (
    <>
      {(["front", "back"] as const).map((side) => (
        <svg key={side} className="studio-sheet" width="8.5in" height="11in" viewBox={`0 0 ${lw} ${lh}`}>
          <rect width={lw} height={lh} fill="#ffffff" />
          {s.map(([x, y], i) => (
            // Fronts have their top pointing left; backs point right, so they read upright after the flip.
            <g key={i} transform={side === "front" ? `translate(${x} ${y + W}) rotate(-90)` : `translate(${x + H} ${y}) rotate(90)`}>
              <Side side={side} core={core} />
            </g>
          ))}
          {side === "front" ? (
            <g stroke="#000000" strokeWidth={0.4}>
              {xs.map((x) => (
                <g key={`x${x}`}>
                  <line x1={x} y1={ys[0]! - near} x2={x} y2={ys[0]! - far} />
                  <line x1={x} y1={ys.at(-1)! + near} x2={x} y2={ys.at(-1)! + far} />
                </g>
              ))}
              {ys.map((y) => (
                <g key={`y${y}`}>
                  <line x1={xs[0]! - near} y1={y} x2={xs[0]! - far} y2={y} />
                  <line x1={xs.at(-1)! + near} y1={y} x2={xs.at(-1)! + far} y2={y} />
                </g>
              ))}
            </g>
          ) : null}
          {side === "front" ? (
            <T x={0} y={lh - 30} w={lw} h={12} f={font(7)} colour={MUTED} align="center">
              Print at 100% (actual size), double-sided, flip on long edge. Cut on the marks.
            </T>
          ) : null}
        </svg>
      ))}
    </>
  );
}

