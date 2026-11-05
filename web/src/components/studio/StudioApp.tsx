"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { getCore } from "@/lib/studio/client";
import type { StudioCore } from "@/lib/studio/core";
import { hasFilePickers, openFiles, saveFile } from "@/lib/studio/files";
import { emptyProject, encodePack, firmwareHeader, projectFromJson, projectToJson } from "@/lib/studio/model";
import { AnimationsTab } from "./AnimationsTab";
import { FacesTab } from "./FacesTab";
import { FactoryTab } from "./FactoryTab";
import { PersonalityTab } from "./PersonalityTab";
import { smallButton } from "./controls";
import { StudioProvider, useStudio } from "./state";

const TABS = ["Faces", "Animations", "Personality", "Factory batch"] as const;
type Tab = (typeof TABS)[number];

function Toolbar() {
  const { core, state, update, status, notify } = useStudio();

  const run = (fn: () => Promise<unknown>) => () =>
    fn().catch((e: unknown) => notify(e instanceof Error ? e.message : String(e)));

  const newProject = () => {
    if (!confirm("Start a new project? Save this one first if you want to keep it.")) return;
    update((s) => ({ ...s, project: emptyProject(), projectName: "untitled.lumiproject" }));
  };
  const open = run(async () => {
    const [file] = await openFiles("Lumi Studio project", [".lumiproject", ".json"]);
    if (!file) return;
    const project = projectFromJson(core, JSON.parse(await file.text()));
    update((s) => ({ ...s, project, projectName: file.name }));
    notify(`Opened ${file.name}.`);
  });
  const save = run(async () => {
    const text = JSON.stringify(projectToJson(state.project), null, 2);
    if (await saveFile(state.projectName, text, "application/json", "Lumi Studio project")) notify("Project saved.");
  });
  const exportPack = run(async () => {
    const data = encodePack(core, state.project, state.persona);
    const name = `${state.persona.name || "lumi"}.lumipack`;
    if (await saveFile(name, data as Uint8Array<ArrayBuffer>, "application/octet-stream", "Lumi emotion pack")) notify(`Saved ${name} (${data.length} bytes).`);
  });
  const exportFirmware = run(async () => {
    const text = firmwareHeader(encodePack(core, state.project));
    if (await saveFile("default_pack.h", text, "text/plain", "C header"))
      notify("Saved default_pack.h. Put it in firmware/lib/lumi_core/src/generated/, then rebuild and flash.");
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={smallButton} onClick={newProject}>
        New project
      </button>
      <button type="button" className={smallButton} onClick={open}>
        Open project…
      </button>
      <button type="button" className={smallButton} onClick={save}>
        Save project…
      </button>
      <span aria-hidden className="mx-1 h-6 w-px bg-line" />
      <button type="button" className={smallButton} onClick={exportPack} disabled={!status.ok} title="The project's emotions plus the Personality tab's persona, as one pack file">
        Export .lumipack
      </button>
      <button type="button" className={smallButton} onClick={exportFirmware} disabled={!status.ok} title="Build the project's emotions into the firmware, for every unit">
        Export to firmware
      </button>
    </div>
  );
}

function StatusBar() {
  const { state, status } = useStudio();
  const p = state.project;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-white px-4 py-2 text-xs ring-1 ring-line" role="status">
      <span className="text-muted">
        {state.projectName} · {p.faces.length} faces · {p.animations.length} animations
      </span>
      {status.ok ? (
        <span className="text-muted">Pack {status.bytes.toLocaleString("en-US")} of 8,192 bytes</span>
      ) : (
        <details className="text-[#b42318]">
          <summary className="cursor-pointer font-semibold">
            {status.problems.length} problem{status.problems.length === 1 ? "" : "s"} to fix before export
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {status.problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Workspace() {
  const [tab, setTab] = useState<Tab>("Faces");
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Studio" className="flex flex-wrap gap-1 rounded-chip bg-white p-1 ring-1 ring-line">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`tab-${t}`}
              aria-selected={t === tab}
              aria-controls="studio-panel"
              onClick={() => setTab(t)}
              className={clsx("rounded-chip px-4 py-1.5 text-sm font-semibold", t === tab ? "bg-ink text-white" : "text-ink-soft hover:bg-cloud")}
            >
              {t}
            </button>
          ))}
        </div>
        <Toolbar />
      </div>
      <div role="tabpanel" id="studio-panel" aria-labelledby={`tab-${tab}`} className="mt-4">
        {tab === "Faces" ? <FacesTab /> : null}
        {tab === "Animations" ? <AnimationsTab /> : null}
        {tab === "Personality" ? <PersonalityTab /> : null}
        {tab === "Factory batch" ? <FactoryTab onShowPersona={() => setTab("Personality")} /> : null}
      </div>
      <StatusBar />
    </>
  );
}

export function StudioApp() {
  const [core, setCore] = useState<StudioCore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pickers] = useState(() => typeof window === "undefined" || hasFilePickers());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    getCore().then(setCore, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const notify = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 6000);
  }, []);

  if (error) return <p className="mt-6 rounded-card bg-[#fde8e7] p-4 text-sm">Couldn&apos;t start the face engine: {error}</p>;
  if (!core) return <p className="mt-6 text-sm text-muted">Starting Lumi&apos;s face engine…</p>;
  return (
    <StudioProvider core={core} notify={notify}>
      {!pickers ? (
        <p className="mt-4 rounded-card bg-lavender-pale px-4 py-2 text-xs text-ink-soft">
          This browser can&apos;t show Save dialogs, so files download instead. Chrome (and Chromebooks) can.
        </p>
      ) : null}
      <Workspace />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {message ? <p className="pointer-events-auto max-w-xl rounded-chip bg-ink px-4 py-2 text-sm text-white shadow-lg">{message}</p> : null}
      </div>
    </StudioProvider>
  );
}
