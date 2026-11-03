/**
 * The odds of every Lumi trait, as the firmware rolls them
 * (firmware/lib/lumi_core/src/genes.cpp). tests/unit/odds.test.ts checks
 * these tables still match the firmware, so update both together.
 */

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export interface Gene {
  id: string;
  label: string;
  /** What this trait changes, for people. */
  about: string;
  options: { name: string; weight: number }[];
}

const opts = (names: string[], weights: number[]) => names.map((name, i) => ({ name, weight: weights[i]! }));

/** In the firmware's gene order. */
export const genes: Gene[] = [
  {
    id: "eyeShape",
    label: "Eye shape",
    about: "The outline of both eyes, which every expression is drawn from.",
    options: opts(["classic", "round", "pill", "wide", "boxy", "almond", "droopy", "tiny"], [30, 20, 15, 12, 10, 6, 5, 2]),
  },
  { id: "eyeSize", label: "Eye size", about: "How big the eyes are.", options: opts(["smallest", "small", "medium", "big", "biggest"], [10, 20, 40, 20, 10]) },
  { id: "eyeSpacing", label: "Eye spacing", about: "How far apart the eyes sit.", options: opts(["closest", "close", "normal", "apart", "far apart"], [10, 20, 40, 20, 10]) },
  { id: "eyeHeight", label: "Eye height", about: "Where the eyes sit on the screen.", options: opts(["high", "middle", "low"], [25, 50, 25]) },
  {
    id: "highlight",
    label: "Highlight",
    about: "The glint in its eyes.",
    options: opts(["square", "none", "dot", "double", "star", "ring"], [40, 8, 25, 15, 8, 4]),
  },
  {
    id: "accent",
    label: "Accent",
    about: "A little extra on the face.",
    options: opts(["none", "lashes", "brows", "freckles", "blush", "beauty mark"], [55, 12, 12, 10, 8, 3]),
  },
  {
    id: "temperament",
    label: "Temperament",
    about: "How it behaves, which you only find out by spending time with it.",
    options: opts(["cheerful", "sleepy", "shy", "grumpy", "hyper"], [30, 20, 20, 15, 15]),
  },
];

/** What each temperament changes in the firmware (TemperamentTraits in genes.cpp). */
export const temperaments: Record<string, string> = {
  cheerful: "Starts out happy and cheers up easily. Giggles when patted, and hums, dances and sparkles more than the others.",
  sleepy: "Tires about 60% faster and rests longer between moves. Yawns, zones out and nods off.",
  shy: "Goes bashful when you pat it, squishes up, and takes its time between moves.",
  grumpy: "Starts off unimpressed and takes more pats to cheer up. Side-eyes, pouts and looks smug.",
  hyper: "Fidgets far more often than the others and tires about 30% faster. Dances, sparkles and goes cross-eyed.",
};

/** A combination is in a tier when its chance is below that tier's line (genes.cpp). */
export const tierBelow = { uncommon: 2.4e-5, rare: 6.6e-6, legendary: 1.62e-6 } as const;

const share = (g: Gene, i: number) => g.options[i]!.weight / g.options.reduce((s, o) => s + o.weight, 0);

/** Chance of option i of gene g, 0 .. 1. */
export const optionChance = (g: Gene, i: number) => share(g, i);

export function tierOf(p: number): Rarity {
  if (p < tierBelow.legendary) return "legendary";
  if (p < tierBelow.rare) return "rare";
  if (p < tierBelow.uncommon) return "uncommon";
  return "common";
}

/** Every combination's chance, worked out once: 108,000 of them. */
function enumerate() {
  const tiers: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
  let most = 0;
  let least = 1;
  let count = 0;
  const walk = (k: number, p: number) => {
    if (k === genes.length) {
      tiers[tierOf(p)] += p;
      most = Math.max(most, p);
      least = Math.min(least, p);
      count++;
      return;
    }
    const g = genes[k]!;
    g.options.forEach((_, i) => walk(k + 1, p * share(g, i)));
  };
  walk(0, 1);
  return { tiers, most, least, count };
}

const all = enumerate();

/** How many different Lumis there can be. */
export const combinations = all.count;
/** Different faces, leaving out temperament (which you can't see). */
export const faces = combinations / genes.at(-1)!.options.length;
/** Share of all Lumis in each tier, 0 .. 1. */
export const tierShare = all.tiers;
/** The most likely exact Lumi is 1 in this many. */
export const mostLikelyOneIn = Math.round(1 / all.most);
/** The least likely exact Lumi is 1 in this many. */
export const leastLikelyOneIn = Math.round(1 / all.least);
/** Different names a Lumi can get (nameFromSeed in genes.cpp). */
export const names = 1408;

export const rarities: Rarity[] = ["common", "uncommon", "rare", "legendary"];
