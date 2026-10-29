"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { manifest, persona } from "@/lib/lumi-frames";
import { OledScreen } from "../lumi/OledScreen";
import { RarityDot } from "../lumi/PersonaChip";

/** Steps through the 29 expressions as one example unit draws them. */
export function ExpressionCycler({ personaIds }: { personaIds: string[] }) {
  const [who, setWho] = useState(personaIds[0]!);
  const [e, setE] = useState(manifest.expressions.indexOf("happy"));
  const p = persona(who);
  const n = manifest.expressions.length;
  const name = manifest.expressions[e]!;
  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
      <div className="rounded-panel bg-night p-5 sm:p-8">
        <div className="aspect-[2/1]">
          <OledScreen src={p.expressions} frame={e} label={`${p.name}, ${name} expression`} />
        </div>
        <div className="mt-5 flex items-center justify-between text-white">
          <button type="button" onClick={() => setE((x) => (x - 1 + n) % n)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous expression">
            <ChevronLeft className="size-5" />
          </button>
          <p className="text-center" aria-live="polite">
            <span className="block font-display text-2xl font-bold capitalize">{name}</span>
            <span className="text-xs text-white/55">{e + 1} of {n}</span>
          </p>
          <button type="button" onClick={() => setE((x) => (x + 1) % n)} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next expression">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      <div>
        <p className="text-sm font-bold">Example unit</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {personaIds.map((id) => {
            const q = persona(id);
            return (
              <button key={id} type="button" aria-pressed={who === id} onClick={() => setWho(id)}
                className={clsx("rounded-control border px-3 py-3 text-left transition-colors", who === id ? "border-ink bg-white" : "border-line hover:border-ink/30")}>
                <span className="block font-bold">{q.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted capitalize">
                  <RarityDot rarity={q.rarity} /> {q.rarity} · {q.traits.eyeShape} eyes · {q.traits.highlight} glint
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {manifest.expressions.map((x, j) => (
            <button key={x} type="button" onClick={() => setE(j)} aria-pressed={e === j}
              className={clsx("rounded-chip px-2.5 py-1 text-xs font-semibold capitalize transition-colors", e === j ? "bg-ink text-white" : "bg-white text-ink-soft ring-1 ring-line hover:ring-ink/30")}>
              {x}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Drawn by Lumi&apos;s own firmware (core {manifest.core}). On the device these blend into one another, with blinking and breathing on top.
        </p>
      </div>
    </div>
  );
}
