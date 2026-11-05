"use client";

import { useId } from "react";
import { clsx } from "clsx";

export const panel = "rounded-card bg-white p-4 ring-1 ring-line";
export const input =
  "h-9 w-full rounded-lg border border-ink/15 bg-white px-2 text-sm text-ink focus:border-lavender-deep focus:outline-none focus:ring-2 focus:ring-lavender";
export const smallButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-chip border border-ink/15 bg-white px-3 text-sm font-semibold text-ink hover:border-ink/40 disabled:pointer-events-none disabled:opacity-40";
export const primaryButton =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-chip bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-soft disabled:pointer-events-none disabled:opacity-40";

export function Field({ label, children, hint, className }: { label: string; children: (id: string) => React.ReactNode; hint?: string; className?: string }) {
  const id = useId();
  return (
    <div className={clsx("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, hint, className }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string; className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <input
          id={id}
          type="number"
          className={input}
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            if (Number.isFinite(v)) onChange(v);
          }}
        />
      )}
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, hint, className }: {
  label: string; value: string; options: (string | [value: string, label: string])[]; onChange: (v: string) => void; hint?: string; className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <select id={id} className={input} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => {
            const [v, l] = Array.isArray(o) ? o : [o, o];
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      )}
    </Field>
  );
}

export function TextField({ label, value, onChange, maxBytes, hint, className }: {
  label: string; value: string; onChange: (v: string) => void; maxBytes?: number; hint?: string; className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <input
          id={id}
          className={input}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (!maxBytes || new TextEncoder().encode(v).length <= maxBytes) onChange(v);
          }}
        />
      )}
    </Field>
  );
}

/** A slider with its value, for one numeric face field. */
export function SliderField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const id = useId();
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-2">
      <label htmlFor={id} className="col-span-2 text-xs font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-full accent-lavender-deep"
      />
      <output htmlFor={id} className="text-right text-xs tabular-nums text-muted">
        {value.toFixed(digits)}
      </output>
    </div>
  );
}

/** A list of named items with add / duplicate / delete, for faces and animations. */
export function ItemList({ title, items, selected, onSelect, actions, empty }: {
  title: string; items: string[]; selected: number; onSelect: (i: number) => void; actions: React.ReactNode; empty: string;
}) {
  return (
    <div className={panel}>
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
      {items.length ? (
        <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto" aria-label={title}>
          {items.map((name, i) => (
            <li key={`${name}-${i}`}>
              <button
                type="button"
                aria-current={i === selected ? "true" : undefined}
                onClick={() => onSelect(i)}
                className={clsx(
                  "w-full truncate rounded-lg px-3 py-1.5 text-left text-sm",
                  i === selected ? "bg-lavender-pale font-semibold text-ink" : "text-ink-soft hover:bg-cloud",
                )}
              >
                {name || "(no name)"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

export const RARITY_COLOURS: Record<string, string> = { common: "#9aa5b1", uncommon: "#4cd07d", rare: "#4aa8ff", legendary: "#ffb627" };
/** The tier's colour is on the dot; the word stays in ink so it's readable on white. */
export function RarityBadge({ rarity }: { rarity: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: RARITY_COLOURS[rarity] }} />
      {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
    </span>
  );
}
