"use client";

import { useMemo, useState } from "react";
import { ENUMS, EFFECTS, NUMERIC, faceFrom, faceToBytes, snapFace, type FaceParams, type Project } from "@/lib/studio/model";
import { ItemList, SelectField, SliderField, TextField, panel, smallButton } from "./controls";
import { OledCanvas } from "./OledCanvas";
import { useLoop, useStudio } from "./state";

function uniqueName(base: string, taken: string[]) {
  let name = base;
  for (let i = 2; taken.includes(name); i++) name = `${base} ${i}`;
  return name;
}

/** Renames a face and every animation key that uses it. */
function renameFace(p: Project, index: number, name: string): Project {
  const old = p.faces[index]!.name;
  return {
    faces: p.faces.map((f, i) => (i === index ? { ...f, name } : f)),
    animations: p.animations.map((a) => ({
      ...a,
      keys: a.keys.map((k) => (k.face === `custom:${old}` ? { ...k, face: `custom:${name}` } : k)),
    })),
  };
}

export function FacesTab() {
  const { core, state, update } = useStudio();
  const faces = state.project.faces;
  const [selected, setSelected] = useState(0);
  const [startFrom, setStartFrom] = useState("neutral");
  const [onPersona, setOnPersona] = useState(false);
  const [t, setT] = useState(600);
  const index = Math.min(selected, faces.length - 1);
  const face = index >= 0 ? faces[index] : undefined;

  // Effects (zzz, sparkles …) move, so animate the preview when the face has any.
  useLoop(Boolean(face?.params.fx), (ms) => setT(600 + Math.floor(ms / 50) * 50));

  const frame = useMemo(
    () => (face ? core.renderFace(faceToBytes(face.params), onPersona ? state.persona.genes : null, face.params.fx ? t : 600) : null),
    [core, face, onPersona, state.persona.genes, t],
  );

  const setProject = (fn: (p: Project) => Project) => update((s) => ({ ...s, project: fn(s.project) }));
  const setParams = (changes: FaceParams) =>
    setProject((p) => ({ ...p, faces: p.faces.map((f, i) => (i === index ? { ...f, params: snapFace({ ...f.params, ...changes }) } : f)) }));

  const add = () => {
    setProject((p) => ({
      ...p,
      faces: [...p.faces, { name: uniqueName(`my ${startFrom}`, p.faces.map((f) => f.name)), params: faceFrom(core, startFrom) }],
    }));
    setSelected(faces.length);
  };
  const duplicate = () => {
    if (!face) return;
    setProject((p) => ({ ...p, faces: [...p.faces, { name: uniqueName(`${face.name} copy`, p.faces.map((f) => f.name)), params: { ...face.params } }] }));
    setSelected(faces.length);
  };
  const remove = () => {
    if (!face) return;
    const used = state.project.animations.filter((a) => a.keys.some((k) => k.face === `custom:${face.name}`)).map((a) => a.name);
    if (used.length && !confirm(`"${face.name}" is used by ${used.join(", ")}. Delete it anyway?`)) return;
    setProject((p) => ({ ...p, faces: p.faces.filter((_, i) => i !== index) }));
    setSelected(Math.max(0, index - 1));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <ItemList
          title="Custom faces"
          items={faces.map((f) => f.name)}
          selected={index}
          onSelect={setSelected}
          empty="No faces yet. Pick one to start from and press New face."
          actions={
            <>
              <SelectField label="Start from" value={startFrom} options={core.expressions} onChange={setStartFrom} className="w-full" />
              <button type="button" className={smallButton} onClick={add}>
                New face
              </button>
              <button type="button" className={smallButton} onClick={duplicate} disabled={!face}>
                Duplicate
              </button>
              <button type="button" className={smallButton} onClick={remove} disabled={!face}>
                Delete
              </button>
            </>
          }
        />
        <p className="px-1 text-xs text-muted">Up to 32 faces. Values snap to what the unit can store, so the preview is exact.</p>
      </div>

      {face ? (
        <div className="space-y-4">
          <div className={`${panel} grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]`}>
            <div>
              <OledCanvas frame={frame} label={`Preview of the face ${face.name}`} />
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={onPersona} onChange={(e) => setOnPersona(e.target.checked)} className="accent-lavender-deep" />
                Preview on the persona from the Personality tab ({state.persona.name})
              </label>
            </div>
            <div className="space-y-3">
              <TextField
                label="Name"
                value={face.name}
                maxBytes={23}
                onChange={(name) => {
                  if (name && !faces.some((f, i) => i !== index && f.name === name)) setProject((p) => renameFace(p, index, name));
                }}
                hint="Animations refer to faces by name; renaming updates them."
              />
              {ENUMS.map((f) => (
                <SelectField
                  key={f.key}
                  label={f.label}
                  value={String(face.params[f.key] ?? 0)}
                  options={f.options.map((o, i) => [String(i), o])}
                  onChange={(v) => setParams({ [f.key]: Number(v) })}
                />
              ))}
            </div>
          </div>

          <div className={`${panel} grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3`}>
            {NUMERIC.map((f) => (
              <SliderField
                key={f.key}
                label={f.label}
                value={face.params[f.key] ?? 0}
                min={f.min}
                max={f.max}
                step={1 / f.scale}
                onChange={(v) => setParams({ [f.key]: v })}
              />
            ))}
          </div>

          <fieldset className={panel}>
            <legend className="px-1 text-sm font-bold text-ink">Effects</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EFFECTS.map((name, bit) => (
                <label key={name} className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    className="accent-lavender-deep"
                    checked={((face.params.fx ?? 0) & (1 << bit)) !== 0}
                    onChange={(e) => setParams({ fx: e.target.checked ? (face.params.fx ?? 0) | (1 << bit) : (face.params.fx ?? 0) & ~(1 << bit) })}
                  />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : (
        <div className={`${panel} text-sm text-muted`}>Make a face to edit it here.</div>
      )}
    </div>
  );
}
