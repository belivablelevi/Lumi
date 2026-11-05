"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/studio/core";
import { EFFECTS, EYE_STYLES, MAX_KEYS, MOTIONS, MOUTHS, newAnimation, newKey, type AnimationDef, type Key } from "@/lib/studio/model";
import { ItemList, NumberField, SelectField, TextField, panel, primaryButton, smallButton } from "./controls";
import { OledCanvas } from "./OledCanvas";
import { useLoop, useProjectPack, useStudio } from "./state";

function uniqueName(base: string, taken: string[]) {
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base}${i}`;
  return name;
}

const cell = "h-8 w-full min-w-0 rounded-md border border-ink/15 bg-white px-1.5 text-xs text-ink";

function KeyRow({ k, index, faceOptions, selected, onSelect, onChange }: {
  k: Key; index: number; faceOptions: [string, string][]; selected: boolean; onSelect: () => void; onChange: (k: Key) => void;
}) {
  const set = (c: Partial<Key>) => onChange({ ...k, ...c });
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  return (
    <tr className={selected ? "bg-lavender-pale" : undefined} onFocus={onSelect} onClick={onSelect}>
      <td className="px-1 py-1 text-xs tabular-nums text-muted">{index + 1}</td>
      <td className="px-1 py-1">
        <select aria-label={`Key ${index + 1} face`} className={cell} value={k.face} onChange={(e) => set({ face: e.target.value })}>
          {faceOptions.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input aria-label={`Key ${index + 1} look left/right`} type="number" className={cell} value={k.lookX} onChange={(e) => set({ lookX: num(e.target.value, -128, 127) })} />
      </td>
      <td className="px-1 py-1">
        <input aria-label={`Key ${index + 1} look up/down`} type="number" className={cell} value={k.lookY} onChange={(e) => set({ lookY: num(e.target.value, -128, 127) })} />
      </td>
      <td className="px-1 py-1">
        <select aria-label={`Key ${index + 1} motion`} className={cell} value={k.motion} onChange={(e) => set({ motion: e.target.value })}>
          {MOTIONS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <input aria-label={`Key ${index + 1} blend ms`} type="number" step={10} className={cell} value={k.tween} onChange={(e) => set({ tween: num(e.target.value, 0, 20000) })} />
      </td>
      <td className="px-1 py-1">
        <input aria-label={`Key ${index + 1} hold ms`} type="number" step={10} className={cell} value={k.hold} onChange={(e) => set({ hold: num(e.target.value, 0, 20000) })} />
      </td>
      <td className="px-1 py-1">
        <details className="relative">
          <summary className={`${cell} flex cursor-pointer items-center truncate`}>{k.fx.join(", ") || "none"}</summary>
          <div className="absolute z-10 mt-1 grid w-44 gap-1 rounded-lg bg-white p-2 shadow-lg ring-1 ring-line">
            {EFFECTS.map((name) => (
              <label key={name} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-lavender-deep"
                  checked={k.fx.includes(name)}
                  onChange={(e) => set({ fx: e.target.checked ? EFFECTS.filter((x) => x === name || k.fx.includes(x)) : k.fx.filter((x) => x !== name) })}
                />
                {name}
              </label>
            ))}
          </div>
        </details>
      </td>
      <td className="px-1 py-1">
        <select aria-label={`Key ${index + 1} eyes`} className={cell} value={k.eyes} onChange={(e) => set({ eyes: e.target.value })}>
          {["keep", ...EYE_STYLES].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </td>
      <td className="px-1 py-1">
        <select aria-label={`Key ${index + 1} mouth`} className={cell} value={k.mouth} onChange={(e) => set({ mouth: e.target.value })}>
          {["keep", ...MOUTHS].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

export function AnimationsTab() {
  const { core, state, update } = useStudio();
  const anims = state.project.animations;
  const [selected, setSelected] = useState(0);
  const [keySel, setKeySel] = useState(0);
  const [loop, setLoop] = useState(false);
  const [onPersona, setOnPersona] = useState(false);
  const [builtin, setBuiltin] = useState(core.builtinAnimations[0]?.name ?? "");
  const [playing, setPlaying] = useState<string | null>(null);
  const [frame, setFrame] = useState<Uint8Array | null>(null);
  const index = Math.min(selected, anims.length - 1);
  const anim = index >= 0 ? anims[index] : undefined;
  const pack = useProjectPack();

  const player = useRef<Player | null>(null);
  useEffect(() => {
    const p = core.player(1);
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
    player.current?.setGenes(onPersona ? state.persona.genes : null);
  }, [onPersona, state.persona.genes]);

  useLoop(true, (ms) => {
    const p = player.current;
    if (!p) return;
    p.update(ms);
    if (playing && !p.busy()) {
      if (loop) p.play(playing);
      else setPlaying(null);
    }
    setFrame(p.render());
  });

  const play = (name: string) => {
    const p = player.current;
    if (!p) return;
    p.loadPack(pack);
    if (p.play(name) >= 0) setPlaying(name);
  };

  const setAnim = (fn: (a: AnimationDef) => AnimationDef) =>
    update((s) => ({ ...s, project: { ...s.project, animations: s.project.animations.map((a, i) => (i === index ? fn(a) : a)) } }));
  const setAnims = (fn: (a: AnimationDef[]) => AnimationDef[]) => update((s) => ({ ...s, project: { ...s.project, animations: fn(s.project.animations) } }));

  const faceOptions = useMemo<[string, string][]>(
    () => [
      ...state.project.faces.map((f): [string, string] => [`custom:${f.name}`, `★ ${f.name}`]),
      ...core.expressions.map((e): [string, string] => [`expr:${e}`, e]),
    ],
    [core.expressions, state.project.faces],
  );

  const keys = anim?.keys ?? [];
  const k = Math.min(keySel, keys.length - 1);
  const moveKey = (d: -1 | 1) => {
    const j = k + d;
    if (k < 0 || j < 0 || j >= keys.length) return;
    setAnim((a) => {
      const next = [...a.keys];
      [next[k], next[j]] = [next[j]!, next[k]!];
      return { ...a, keys: next };
    });
    setKeySel(j);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <ItemList
          title="Animations"
          items={anims.map((a) => a.name)}
          selected={index}
          onSelect={setSelected}
          empty="No animations yet."
          actions={
            <>
              <button
                type="button"
                className={smallButton}
                onClick={() => {
                  setAnims((a) => [...a, newAnimation({ name: uniqueName("my_anim", a.map((x) => x.name)), keys: [newKey({ face: "expr:happy", motion: "hop" })] })]);
                  setSelected(anims.length);
                }}
              >
                New
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={!anim}
                onClick={() => {
                  if (!anim) return;
                  setAnims((a) => [...a, { ...anim, name: uniqueName(`${anim.name}_copy`.slice(0, 20), a.map((x) => x.name)), keys: anim.keys.map((x) => ({ ...x, fx: [...x.fx] })) }]);
                  setSelected(anims.length);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={!anim}
                onClick={() => {
                  setAnims((a) => a.filter((_, i) => i !== index));
                  setSelected(Math.max(0, index - 1));
                }}
              >
                Delete
              </button>
            </>
          }
        />
        <div className={panel}>
          <OledCanvas frame={frame} label={playing ? `Playing ${playing}` : "Animation preview"} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={primaryButton} disabled={!anim || !pack} onClick={() => anim && play(anim.name)}>
              ▶ Play
            </button>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              <input type="checkbox" className="accent-lavender-deep" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              Loop
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              <input type="checkbox" className="accent-lavender-deep" checked={onPersona} onChange={(e) => setOnPersona(e.target.checked)} />
              On {state.persona.name}
            </label>
          </div>
          {!pack && anims.length ? <p className="mt-2 text-xs text-[#b42318]">Fix the problems in the status bar to play.</p> : null}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <SelectField
              label="Built-ins"
              value={builtin}
              options={core.builtinAnimations.map((b) => [b.name, `${b.name} (${b.trigger})`])}
              onChange={setBuiltin}
              className="w-full"
            />
            <button type="button" className={smallButton} onClick={() => play(builtin)}>
              Play built-in
            </button>
          </div>
        </div>
      </div>

      {anim ? (
        <div className="space-y-4">
          <div className={`${panel} grid gap-3 sm:grid-cols-2 xl:grid-cols-5`}>
            <TextField
              label="Name"
              value={anim.name}
              maxBytes={23}
              onChange={(name) => setAnim((a) => ({ ...a, name }))}
              className="xl:col-span-2"
            />
            <SelectField label="Plays when" value={anim.trigger} options={core.triggers} onChange={(trigger) => setAnim((a) => ({ ...a, trigger }))} />
            <NumberField
              label="Weight (1-10)"
              value={anim.weight}
              min={1}
              max={10}
              onChange={(weight) => setAnim((a) => ({ ...a, weight: Math.max(1, Math.min(10, Math.round(weight))) }))}
              hint="How often it plays next to others for the same trigger."
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Mood from" value={anim.moodMin} min={0} max={100} onChange={(moodMin) => setAnim((a) => ({ ...a, moodMin: Math.round(moodMin) }))} />
              <NumberField label="to" value={anim.moodMax} min={0} max={100} onChange={(moodMax) => setAnim((a) => ({ ...a, moodMax: Math.round(moodMax) }))} />
            </div>
          </div>

          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">
                Keys <span className="font-normal text-muted">({keys.length} of {MAX_KEYS})</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={smallButton}
                  disabled={keys.length >= MAX_KEYS}
                  onClick={() => {
                    setAnim((a) => ({ ...a, keys: [...a.keys, newKey(a.keys.at(-1) ? { ...a.keys.at(-1), fx: [...a.keys.at(-1)!.fx] } : {})] }));
                    setKeySel(keys.length);
                  }}
                >
                  Add key
                </button>
                <button
                  type="button"
                  className={smallButton}
                  disabled={k < 0}
                  onClick={() => {
                    setAnim((a) => ({ ...a, keys: a.keys.filter((_, i) => i !== k) }));
                    setKeySel(Math.max(0, k - 1));
                  }}
                >
                  Remove key
                </button>
                <button type="button" className={smallButton} disabled={k <= 0} onClick={() => moveKey(-1)}>
                  Move up
                </button>
                <button type="button" className={smallButton} disabled={k < 0 || k >= keys.length - 1} onClick={() => moveKey(1)}>
                  Move down
                </button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-1 font-semibold">#</th>
                    <th className="px-1 font-semibold">Face</th>
                    <th className="px-1 font-semibold">Look ←→</th>
                    <th className="px-1 font-semibold">Look ↑↓</th>
                    <th className="px-1 font-semibold">Motion</th>
                    <th className="px-1 font-semibold">Blend ms</th>
                    <th className="px-1 font-semibold">Hold ms</th>
                    <th className="px-1 font-semibold">Effects</th>
                    <th className="px-1 font-semibold">Eyes</th>
                    <th className="px-1 font-semibold">Mouth</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key, i) => (
                    <KeyRow
                      key={i}
                      k={key}
                      index={i}
                      faceOptions={faceOptions}
                      selected={i === k}
                      onSelect={() => setKeySel(i)}
                      onChange={(next) => setAnim((a) => ({ ...a, keys: a.keys.map((x, j) => (j === i ? next : x)) }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${panel} text-sm text-muted`}>Make an animation to edit it here.</div>
      )}
    </div>
  );
}
