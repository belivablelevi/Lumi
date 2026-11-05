"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Rarity, StudioCore } from "@/lib/studio/core";
import { DEFAULT_MIX, type ManifestRow } from "@/lib/studio/factory";
import { emptyProject, encodePack, PackError, projectFromJson, projectToJson, type Persona, type Project } from "@/lib/studio/model";
import { TYPICAL } from "@/lib/studio/odds";

export interface FactorySettings {
  count: number;
  seed: string;
  prefix: string;
  start: number;
  mix: Record<Rarity, number>;
}

export interface StudioState {
  project: Project;
  projectName: string;
  persona: Persona;
  manifest: ManifestRow[];
  manifestName: string;
  factory: FactorySettings;
  /** Earlier manifests whose looks and names a new batch must avoid. */
  avoid: { files: string[]; looks: number[]; names: string[] };
}

export const initialState = (): StudioState => ({
  project: emptyProject(),
  projectName: "untitled.lumiproject",
  persona: { name: "Mochi", genes: [...TYPICAL], serial: "", favourites: [] },
  manifest: [],
  manifestName: "",
  factory: { count: 100, seed: "batch-1", prefix: "LUMI", start: 1, mix: { ...DEFAULT_MIX } },
  avoid: { files: [], looks: [], names: [] },
});

const STORAGE_KEY = "lumi-studio-v1";

/** Work in progress kept in this browser, so a closed tab loses nothing. */
function loadSaved(core: StudioCore): StudioState {
  const base = initialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<StudioState> & { project?: unknown };
    return {
      ...base,
      ...saved,
      project: projectFromJson(core, saved.project),
      persona: { ...base.persona, ...saved.persona },
      factory: { ...base.factory, ...saved.factory },
      avoid: { ...base.avoid, ...saved.avoid },
    };
  } catch {
    return base;
  }
}

export type PackStatus = { ok: true; bytes: number } | { ok: false; problems: string[] };

interface StudioContextValue {
  core: StudioCore;
  state: StudioState;
  update: (fn: (s: StudioState) => StudioState) => void;
  status: PackStatus;
  /** Shows a short message at the bottom of the page. */
  notify: (message: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio outside StudioProvider");
  return ctx;
}

export function StudioProvider({ core, notify, children }: { core: StudioCore; notify: (m: string) => void; children: React.ReactNode }) {
  const [state, setState] = useState<StudioState>(() => loadSaved(core));
  const update = useCallback((fn: (s: StudioState) => StudioState) => setState(fn), []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, project: projectToJson(state.project) }));
      } catch {
        // Storage full or blocked: the files are still the real copy.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state]);

  const status = useMemo<PackStatus>(() => {
    try {
      return { ok: true, bytes: encodePack(core, state.project).length };
    } catch (e) {
      return { ok: false, problems: e instanceof PackError ? e.message.split("\n") : [String(e)] };
    }
  }, [core, state.project]);

  const value = useMemo(() => ({ core, state, update, status, notify }), [core, state, update, status, notify]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

/** Calls `tick(elapsedMs)` every animation frame while `running`. */
export function useLoop(running: boolean, tick: (ms: number) => void) {
  const ref = useRef(tick);
  useEffect(() => {
    ref.current = tick;
  });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      ref.current(now - start);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** The project's pack, or null when it has problems (players then run without it). */
export function useProjectPack(): Uint8Array | null {
  const { core, state } = useStudio();
  return useMemo(() => {
    try {
      return encodePack(core, state.project);
    } catch {
      return null;
    }
  }, [core, state.project]);
}
