"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { macSeed, type Player } from "@/lib/studio/core";
import { oddsText } from "@/lib/studio/factory";
import { OledCanvas } from "./OledCanvas";
import { RarityBadge, SelectField, TextField, panel, smallButton } from "./controls";
import { useLoop, useProjectPack, useStudio } from "./state";

const GENE_LABELS = ["Eye shape", "Eye size", "Eye spacing", "Eye height", "Highlight", "Accent", "Temperament"];

function randomSeed(): bigint {
  const words = crypto.getRandomValues(new Uint32Array(2));
  return (BigInt(words[0]!) << 32n) | BigInt(words[1]!);
}

export function PersonalityTab() {
  const { core, state, update, notify } = useStudio();
  const persona = state.persona;
  const genes = persona.genes;
  const pack = useProjectPack();
  const [mac, setMac] = useState("24:0A:C4:82:B7:0E");
  const [frame, setFrame] = useState<Uint8Array | null>(null);
  const setPersona = (c: Partial<typeof persona>) => update((s) => ({ ...s, persona: { ...s.persona, ...c } }));

  // A live preview: this unit idling with blinks, breathing and idle animations.
  const player = useRef<Player | null>(null);
  useEffect(() => {
    const p = core.player(3);
    p.setIdle(true);
    player.current = p;
    return () => {
      p.free();
      player.current = null;
    };
  }, [core]);
  useEffect(() => {
    player.current?.loadPack(pack);
  }, [pack]);
  useEffect(() => {
    player.current?.setGenes(genes);
  }, [genes]);
  useLoop(true, (ms) => {
    const p = player.current;
    if (!p) return;
    p.update(ms);
    setFrame(p.render());
  });

  const rarity = core.genesRarity(genes);
  const odds = oddsText(core, genes);
  const expressions = useMemo(() => core.expressions.map((_, i) => core.renderExpression(i, genes, 600)), [core, genes]);
  const animationNames = useMemo(
    () => [...new Set([...core.builtinAnimations.map((a) => a.name), ...state.project.animations.map((a) => a.name)])],
    [core.builtinAnimations, state.project.animations],
  );

  const random = () => {
    const seed = randomSeed();
    setPersona({ genes: core.genesFromSeed(seed), name: core.nameFromSeed(seed) });
  };
  const fromMac = () => {
    try {
      const seed = macSeed(mac);
      setPersona({ genes: core.genesFromSeed(seed), name: core.nameFromSeed(seed), serial: "" });
      notify(`This is who an unprovisioned unit with ${mac.toUpperCase()} becomes.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className={panel}>
          <div className="flex flex-wrap items-end gap-2">
            <TextField label="Name" value={persona.name} maxBytes={15} onChange={(name) => setPersona({ name })} className="min-w-0 flex-1" />
            <button type="button" className={smallButton} onClick={random}>
              🎲 Random unit
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <RarityBadge rarity={rarity} />
            <span className="text-sm text-muted">{odds ? `${odds} chance of this exact look` : ""}</span>
          </div>
          <p className="mt-1 text-xs text-muted">Look #{core.genesCode(genes).toLocaleString("en-US")} of {core.lookCount.toLocaleString("en-US")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {GENE_LABELS.map((label, g) => {
              const weights = core.geneWeights[g]!;
              const total = weights.reduce((a, b) => a + b, 0);
              return (
                <SelectField
                  key={label}
                  label={label}
                  value={String(genes[g])}
                  options={core.geneOptions[g]!.map((o, i) => [String(i), `${o} (${Math.round((weights[i]! / total) * 100)}%)`])}
                  onChange={(v) => setPersona({ genes: genes.map((x, i) => (i === g ? Number(v) : x)) })}
                />
              );
            })}
          </div>
        </div>

        <div className={panel}>
          <div className="flex flex-wrap items-end gap-2">
            <TextField label="Chip MAC" value={mac} onChange={setMac} className="min-w-[11rem] flex-1" />
            <button type="button" className={smallButton} onClick={fromMac}>
              Show its automatic persona
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">A unit that was never provisioned builds its persona from its MAC.</p>
        </div>

        <fieldset className={panel}>
          <legend className="px-1 text-sm font-bold text-ink">Favourite animations</legend>
          <p className="text-xs text-muted">Up to 4. They play three times as often on this unit.</p>
          <div className="mt-2 grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
            {animationNames.map((name) => {
              const on = persona.favourites.includes(name);
              return (
                <label key={name} className="flex items-center gap-2 truncate text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    className="accent-lavender-deep"
                    checked={on}
                    disabled={!on && persona.favourites.length >= 4}
                    onChange={(e) =>
                      setPersona({ favourites: e.target.checked ? [...persona.favourites, name] : persona.favourites.filter((f) => f !== name) })
                    }
                  />
                  {name}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="space-y-4">
        <div className={panel}>
          <OledCanvas frame={frame} label={`${persona.name} idling`} />
          <p className="mt-2 text-xs text-muted">Live: this unit idling, with blinks, breathing and idle animations.</p>
        </div>
        <div className={panel}>
          <h2 className="text-sm font-bold text-ink">
            Every expression on this unit <span className="font-normal text-muted">(check none look broken)</span>
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {expressions.map((f, i) => (
              <li key={core.expressions[i]}>
                <OledCanvas frame={f} scale={2} label={`${persona.name}: ${core.expressions[i]}`} />
                <p className="mt-1 text-center text-xs text-muted">{core.expressions[i]}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
