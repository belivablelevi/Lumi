import clsx from "clsx";
import {
  combinations,
  faces,
  genes,
  leastLikelyOneIn,
  mostLikelyOneIn,
  names,
  optionChance,
  rarities,
  temperaments,
  tierShare,
  type Gene,
} from "@/content/odds";
import { RarityDot, rarityFill } from "../lumi/PersonaChip";
import { SectionHeading } from "../ui/Section";

const n = (x: number) => x.toLocaleString("en-CA");
const pct = (x: number) => (x >= 0.1 ? `${Math.round(x * 100)}%` : `${(x * 100).toFixed(x >= 0.01 ? 0 : 1)}%`);
const oneIn = (x: number) => (x >= 1e6 ? `1 in ${Math.round(x / 1e6)} million` : `1 in ${n(x)}`);

const STATS = [
  { value: n(combinations), label: "possible Lumis" },
  { value: n(faces), label: "different faces" },
  { value: n(names), label: "possible names" },
  { value: oneIn(leastLikelyOneIn), label: "chance of the rarest Lumi of all" },
];

function TraitOdds({ gene, wide }: { gene: Gene; wide?: boolean }) {
  const rows = gene.options.map((o, i) => ({ ...o, chance: optionChance(gene, i) })).sort((a, b) => b.chance - a.chance);
  const top = rows[0]!.chance;
  return (
    <div className={clsx("rounded-card bg-white p-5 ring-1 ring-line sm:p-6", wide && "lg:col-span-2")}>
      <h3 className="text-h3 font-bold">{gene.label}</h3>
      <p className="mt-1 text-sm text-muted">
        {gene.about} {rows.length} options.
      </p>
      <ul className={clsx("mt-4 grid gap-x-8 gap-y-2.5", wide && "lg:grid-cols-2")}>
        {rows.map((r) => (
          <li key={r.name} className={clsx("grid items-center gap-x-3", wide ? "grid-cols-[6rem_1fr_3rem]" : "grid-cols-[6.5rem_1fr_3rem]")}>
            <span className="text-[0.9375rem] font-semibold first-letter:uppercase">{r.name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-cloud" aria-hidden>
              <span className="block h-full rounded-full bg-lavender-deep" style={{ width: `${(r.chance / top) * 100}%` }} />
            </span>
            <span className="text-right text-sm text-ink-soft tabular-nums">{pct(r.chance)}</span>
            {wide ? <span className="col-span-3 mt-0.5 mb-1.5 text-sm text-muted">{temperaments[r.name]}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every chance behind a Lumi's looks and temperament, straight from the firmware's gene weights. */
export function OddsSection() {
  const temperament = genes.at(-1)!;
  const looks = genes.slice(0, -1);
  return (
    <section className="py-16 lg:py-20" aria-labelledby="odds-title">
      <div className="container-page">
        <SectionHeading
          id="odds-title"
          eyebrow="The odds"
          title="How the dice roll."
          lead="Each Lumi gets seven traits when it's made, each one rolled on its own. Common traits come up often and some are very rare. Here are the real chances, taken straight from Lumi's code."
        />

        <dl className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col rounded-card bg-white p-5 ring-1 ring-line">
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="order-first font-display text-[1.75rem] leading-tight font-bold text-ink tabular-nums sm:text-[2rem]">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 rounded-card bg-white p-5 ring-1 ring-line sm:p-6">
          <h3 className="text-h3 font-bold">Rarity</h3>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Rarity comes from how unlikely a Lumi&apos;s whole combination is, not from any one trait. A few uncommon traits together can make a legendary
            Lumi. Even the most likely combination is only {oneIn(mostLikelyOneIn)}.
          </p>
          <div className="mt-5 flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={rarities.map((r) => `${r} ${pct(tierShare[r])}`).join(", ")}>
            {rarities.map((r) => (
              <span key={r} className={clsx("h-full first:rounded-l-full last:rounded-r-full", rarityFill[r])} style={{ width: `${tierShare[r] * 100}%` }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {rarities.map((r) => (
              <li key={r}>
                <span className="flex items-center gap-2 text-sm font-bold capitalize">
                  <RarityDot rarity={r} /> {r}
                </span>
                <span className="mt-0.5 block text-ink-soft tabular-nums">
                  {pct(tierShare[r])} <span className="text-sm text-muted">· about {oneIn(Math.round(1 / tierShare[r]))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TraitOdds gene={temperament} wide />
          {looks.map((g) => (
            <TraitOdds key={g.id} gene={g} />
          ))}
        </div>
      </div>
    </section>
  );
}
