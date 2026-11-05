"use client";

import { useState } from "react";
import { RARITIES } from "@/lib/studio/core";
import { generateBatch, personaRow, quotas, readManifest, rowPersona, writeManifest } from "@/lib/studio/factory";
import { openFiles, saveFile } from "@/lib/studio/files";
import { NumberField, RarityBadge, TextField, panel, primaryButton, smallButton } from "./controls";
import { openPrint } from "@/lib/studio/client";
import { useStudio } from "./state";

export function FactoryTab({ onShowPersona }: { onShowPersona: () => void }) {
  const { core, state, update, notify } = useStudio();
  const f = state.factory;
  const rows = state.manifest;
  const [busy, setBusy] = useState(false);
  const setFactory = (c: Partial<typeof f>) => update((s) => ({ ...s, factory: { ...s.factory, ...c } }));
  const mixTotal = RARITIES.reduce((a, r) => a + f.mix[r], 0);
  const plan = quotas(f.count, f.mix);

  const generate = () => {
    setBusy(true);
    // Let the button show it's working before the (synchronous) batch runs.
    setTimeout(() => {
      try {
        const batch = generateBatch(core, {
          count: f.count, seed: f.seed, prefix: f.prefix, start: f.start, mix: f.mix,
          avoidLooks: state.avoid.looks, avoidNames: state.avoid.names,
        });
        update((s) => ({ ...s, manifest: batch.map((p) => personaRow(core, p)), manifestName: `${f.seed}.csv` }));
        notify(`Made ${batch.length} units. Save the manifest to keep it; the same seed and settings always give the same batch.`);
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const open = async () => {
    const [file] = await openFiles("Lumi manifest", [".csv"]);
    if (!file) return;
    const read = readManifest(await file.text());
    update((s) => ({ ...s, manifest: read, manifestName: file.name }));
    notify(`Opened ${file.name}: ${read.length} units.`);
  };
  const save = async () => {
    if (await saveFile(state.manifestName || `${f.seed}.csv`, writeManifest(rows), "text/csv", "Lumi manifest")) notify("Manifest saved.");
  };
  const addAvoid = async () => {
    const files = await openFiles("Earlier Lumi manifests", [".csv"], true);
    if (!files.length) return;
    const looks = new Set(state.avoid.looks);
    const names = new Set(state.avoid.names);
    for (const file of files) for (const r of readManifest(await file.text())) {
      if (r.look) looks.add(Number(r.look));
      if (r.name) names.add(r.name);
    }
    update((s) => ({ ...s, avoid: { files: [...s.avoid.files, ...files.map((x) => x.name)], looks: [...looks], names: [...names] } }));
  };

  return (
    <div className="space-y-4">
      <div className={`${panel} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <NumberField label="How many units" value={f.count} min={1} max={20000} onChange={(count) => setFactory({ count: Math.max(1, Math.min(20000, Math.round(count))) })} />
        <TextField label="Batch seed" value={f.seed} onChange={(seed) => setFactory({ seed })} hint="The same seed and settings always give the same batch." />
        <TextField label="Serial prefix" value={f.prefix} maxBytes={16} onChange={(prefix) => setFactory({ prefix })} />
        <NumberField label="First serial number" value={f.start} min={1} onChange={(start) => setFactory({ start: Math.max(1, Math.round(start)) })} hint={`${f.prefix}-${String(f.start).padStart(6, "0")} onward`} />
        <fieldset className="sm:col-span-2 lg:col-span-4">
          <legend className="mb-1 text-xs font-semibold text-ink-soft">Rarity mix (%)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RARITIES.map((r) => (
              <NumberField
                key={r}
                label={r}
                value={Math.round(f.mix[r] * 1000) / 10}
                min={0}
                max={100}
                step={0.5}
                onChange={(v) => setFactory({ mix: { ...f.mix, [r]: Math.max(0, v) / 100 } })}
                hint={`${plan[r]} units`}
              />
            ))}
          </div>
          {Math.abs(mixTotal - 1) > 0.001 ? <p className="mt-1 text-xs text-muted">The mix adds up to {Math.round(mixTotal * 1000) / 10}%; it&apos;s scaled to 100%.</p> : null}
        </fieldset>
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-xs font-semibold text-ink-soft">Never repeat units from</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{state.avoid.files.length ? state.avoid.files.join(", ") : "none"}</span>
            <button type="button" className={smallButton} onClick={addAvoid}>
              Add earlier manifest…
            </button>
            {state.avoid.files.length ? (
              <button type="button" className={smallButton} onClick={() => update((s) => ({ ...s, avoid: { files: [], looks: [], names: [] } }))}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate batch"}
        </button>
        <button type="button" className={smallButton} onClick={save} disabled={!rows.length}>
          Save manifest…
        </button>
        <button type="button" className={smallButton} onClick={open}>
          Open manifest…
        </button>
        <button type="button" className={smallButton} onClick={() => openPrint("cards", rows)} disabled={!rows.length} title="A birth certificate for every unit, 8 per Letter sheet, both sides">
          Print birth certificates
        </button>
        <button type="button" className={smallButton} onClick={() => openPrint("odds")} title="The 4 × 6 in personality-odds insert, for a print shop">
          Print odds card
        </button>
        <button type="button" className={smallButton} onClick={() => openPrint("odds-letter")} title="Two odds cards per Letter sheet, for printing at home">
          Odds card, 2 per Letter
        </button>
      </div>

      <div className={panel}>
        <h2 className="text-sm font-bold text-ink">
          {state.manifestName || "Manifest"} <span className="font-normal text-muted">({rows.length} units)</span>
        </h2>
        {rows.length ? (
          <div className="mt-3 max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="sticky top-0 bg-white text-xs text-muted">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Serial</th>
                  <th className="py-1 pr-3 font-semibold">Name</th>
                  <th className="py-1 pr-3 font-semibold">Rarity</th>
                  <th className="py-1 pr-3 font-semibold">Temperament</th>
                  <th className="py-1 pr-3 font-semibold">Look</th>
                  <th className="py-1 pr-3 font-semibold">MAC</th>
                  <th className="py-1 font-semibold">
                    <span className="sr-only">Show</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.serial} className="border-t border-line">
                    <td className="py-1 pr-3 tabular-nums">{r.serial}</td>
                    <td className="py-1 pr-3 font-semibold">{r.name}</td>
                    <td className="py-1 pr-3">
                      <RarityBadge rarity={r.rarity} />
                    </td>
                    <td className="py-1 pr-3">{r.temperament}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.look}</td>
                    <td className="py-1 pr-3 tabular-nums text-muted">{r.mac || "–"}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-lavender-deep underline underline-offset-2"
                        onClick={() => {
                          update((s) => ({ ...s, persona: { ...rowPersona(r), favourites: [] } }));
                          onShowPersona();
                        }}
                      >
                        Show<span className="sr-only"> {r.name}</span> in Personality
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Generate a batch or open a manifest.</p>
        )}
      </div>
    </div>
  );
}
