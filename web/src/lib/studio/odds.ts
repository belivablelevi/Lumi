/**
 * The odds printed on the personality-odds card and shown in Studio, from the firmware's gene
 * weights. A port of the numbers part of tools/studio/lumi_studio/odds_card.py.
 */
import { RARITIES, type Rarity, type StudioCore } from "./core";

export const GENE = { shape: 0, size: 1, spacing: 2, height: 3, shine: 4, accent: 5, temperament: 6 } as const;
/** The most common option of every gene: a typical Lumi, varied one gene at a time. */
export const TYPICAL = [0, 2, 2, 1, 0, 0, 0];

export const withGene = (gene: number, option: number) => TYPICAL.map((v, i) => (i === gene ? option : v));

/** [option name, share 0..1] for one gene. */
export function geneOdds(core: StudioCore, gene: number): [string, number][] {
  const weights = core.geneWeights[gene]!;
  const total = weights.reduce((a, b) => a + b, 0);
  return core.geneOptions[gene]!.map((name, i) => [name, weights[i]! / total]);
}

const rarityCache = new WeakMap<StudioCore, Record<Rarity, number>>();

/** Each tier's share, exact: every combination weighed by how likely it is (about a second, once). */
export function rarityOdds(core: StudioCore): Record<Rarity, number> {
  const cached = rarityCache.get(core);
  if (cached) return cached;
  const shares = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  const counts = core.geneOptions.map((o) => o.length);
  const genes = counts.map(() => 0);
  const total = counts.reduce((a, b) => a * b, 1);
  for (let n = 0; n < total; n++) {
    let rest = n;
    for (let g = counts.length - 1; g >= 0; g--) {
      genes[g] = rest % counts[g]!;
      rest = Math.floor(rest / counts[g]!);
    }
    shares[core.genesRarity(genes)] += core.genesProbability(genes);
  }
  rarityCache.set(core, shares);
  return shares;
}

/** Whole percentages that still add up to 100 (largest remainder). */
export function percents(shares: number[]): number[] {
  const raw = shares.map((s) => s * 100);
  const out = raw.map((r) => Math.trunc(r));
  const left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((_, i) => i).sort((a, b) => raw[b]! - out[b]! - (raw[a]! - out[a]!));
  for (const i of order.slice(0, Math.max(0, left))) out[i]! += 1;
  return out;
}
