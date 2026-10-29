"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import clsx from "clsx";
import { emotions, personaStories } from "@/content/personas";
import { persona } from "@/lib/lumi-frames";
import { duration, ease } from "@/lib/motion";
import { OledScreen } from "../lumi/OledScreen";
import { RarityDot } from "../lumi/PersonaChip";
import { SectionHeading } from "../ui/Section";

export function PersonalityShowcase() {
  const [emotion, setEmotion] = useState<(typeof emotions)[number]["id"]>("happy");
  const [who, setWho] = useState(personaStories[0]!.id);
  const e = emotions.find((x) => x.id === emotion)!;
  const p = persona(who);
  const anim = p.animations[e.animation];

  return (
    <section aria-labelledby="kind-title" className="bg-white py-16 lg:py-24">
      <div className="container-page grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <SectionHeading
            id="kind-title"
            eyebrow="Personality"
            title="Find your kind of Lumi."
            lead="Every Lumi has the same 64 animations, but the eyes and temperament it gets by luck change how they feel. Pick a mood and an example unit."
          />
          <fieldset className="mt-8">
            <legend className="text-sm font-bold text-ink">Mood</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {emotions.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={emotion === x.id}
                  onClick={() => setEmotion(x.id)}
                  className={clsx(
                    "h-11 rounded-chip px-4 text-[0.9375rem] font-semibold transition-colors duration-200",
                    emotion === x.id ? "bg-ink text-white" : "bg-cloud text-ink-soft hover:bg-lavender-pale",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-6">
            <legend className="text-sm font-bold text-ink">Example unit</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {personaStories.map((s) => {
                const q = persona(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={who === s.id}
                    onClick={() => setWho(s.id)}
                    className={clsx(
                      "rounded-control border px-3 py-2.5 text-left transition-colors duration-200",
                      who === s.id ? "border-ink bg-ink/[0.03]" : "border-line hover:border-ink/30",
                    )}
                  >
                    <span className="block font-bold">{q.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted capitalize">
                      <RarityDot rarity={q.rarity} /> {q.traits.temperament}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div>
          <div className="relative rounded-panel bg-gradient-to-br from-lavender-pale to-mint-pale p-5 sm:p-8">
            <div className="rounded-[28px] bg-night p-4 shadow-lift sm:p-6">
              <div className="aspect-[2/1] w-full">
                {anim ? (
                  <OledScreen key={`${who}-${e.id}`} src={anim.file} label={`${p.name}: ${e.label.toLowerCase()} (${e.animation} animation)`} />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-white/60">No animation for this mood yet</div>
                )}
              </div>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${who}-${e.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: duration.base, ease }}
                className="mt-5 px-1"
                aria-live="polite"
              >
                <p className="text-h3 font-bold">
                  {p.name} is {e.label.toLowerCase()}
                </p>
                <p className="mt-1 text-ink-soft">{e.text}</p>
                <p className="mt-3 text-xs text-muted">
                  Firmware animation <code className="rounded bg-white/70 px-1.5 py-0.5">{e.animation}</code>, rendered by Lumi&apos;s own code.
                  {anim ? ` Plays on: ${anim.trigger.replace("_", " ")}.` : ""}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
