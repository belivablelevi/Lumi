/**
 * Factory batches and manifests for Studio in Chrome. A port of tools/studio/lumi_studio/factory.py:
 * the same seed and settings give the same batch as the desktop app (checked against
 * tests/golden/studio_parity.json), and manifests use the same CSV columns.
 */
import { RARITIES, U64, type Rarity, type StudioCore } from "./core";
import type { Persona } from "./model";
import { sha256 } from "./sha256";

export const DEFAULT_MIX: Record<Rarity, number> = { common: 0.6, uncommon: 0.25, rare: 0.12, legendary: 0.03 };
export const MANIFEST_FIELDS = [
  "serial", "name", "rarity", "look", "eye_shape", "eye_size", "spacing", "height", "highlight",
  "accent", "temperament", "genes", "mac", "provisioned_at",
] as const;
export type ManifestRow = Record<(typeof MANIFEST_FIELDS)[number], string>;

const utf8 = (s: string) => new TextEncoder().encode(s);

function seedOf(batchSeed: string, i: number): bigint {
  const h = sha256(utf8(`${batchSeed}:${i}`));
  let v = 0n;
  for (let k = 7; k >= 0; k--) v = (v << 8n) | BigInt(h[k]!);
  return v;
}

/** Splits `count` units across rarity tiers, largest remainders first (ties in tier order). */
export function quotas(count: number, mix: Partial<Record<Rarity, number>> = DEFAULT_MIX): Record<Rarity, number> {
  const total = RARITIES.reduce((s, r) => s + (mix[r] ?? 0), 0) || 1;
  const raw = Object.fromEntries(RARITIES.map((r) => [r, (count * (mix[r] ?? 0)) / total])) as Record<Rarity, number>;
  const q = Object.fromEntries(RARITIES.map((r) => [r, Math.trunc(raw[r])])) as Record<Rarity, number>;
  const left = count - RARITIES.reduce((s, r) => s + q[r], 0);
  // Python's sorted() is stable, so equal remainders keep tier order.
  const order = [...RARITIES].sort((a, b) => raw[b] - q[b] - (raw[a] - q[a]));
  for (const r of order.slice(0, Math.max(0, left))) q[r] += 1;
  return q;
}

export interface BatchOptions {
  count: number;
  seed?: string;
  mix?: Partial<Record<Rarity, number>>;
  prefix?: string;
  start?: number;
  avoidLooks?: Iterable<number>;
  avoidNames?: Iterable<string>;
  maxTries?: number;
}

const NAME_STEP = 0x9e3779b97f4a7c15n;

function compareBytes(a: Uint8Array, b: Uint8Array) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/** Unique personas: no two share a look or a name (also against `avoid*`, e.g. earlier batches). */
export function generateBatch(core: StudioCore, opts: BatchOptions): Persona[] {
  const { count, seed = "batch-1", prefix = "LUMI", start = 1, maxTries = 5_000_000 } = opts;
  const need = quotas(count, opts.mix ?? DEFAULT_MIX);
  const usedLooks = new Set(opts.avoidLooks ?? []);
  const usedNames = new Set([...(opts.avoidNames ?? [])].map((n) => n.toLowerCase()));
  const out: Persona[] = [];
  const left = () => RARITIES.reduce((s, r) => s + need[r], 0);
  let i = 0;
  while (left() && i < maxTries) {
    const s = seedOf(seed, i);
    i += 1;
    const genes = core.genesFromSeed(s);
    const tier = core.genesRarity(genes);
    const look = core.genesCode(genes);
    if (need[tier] <= 0 || usedLooks.has(look)) continue;
    let name = core.nameFromSeed(s);
    let k = 0;
    while (usedNames.has(name.toLowerCase()) && k < 64) {
      k += 1;
      name = core.nameFromSeed((s ^ (BigInt(k) * NAME_STEP)) & U64);
    }
    if (usedNames.has(name.toLowerCase())) continue;
    usedLooks.add(look);
    usedNames.add(name.toLowerCase());
    need[tier] -= 1;
    out.push({ name, genes, serial: "", favourites: [] });
  }
  if (left()) {
    const missing = RARITIES.filter((r) => need[r]).map((r) => `${need[r]} ${r}`).join(", ");
    throw new Error(`Ran out of unique looks before filling the batch (still need ${missing}).`);
  }
  // Interleave tiers so rare units aren't all at the end of the line.
  const keyed = out.map((p) => ({ p, key: sha256(utf8(`${seed}/${p.name}`)) }));
  keyed.sort((a, b) => compareBytes(a.key, b.key));
  return keyed.map(({ p }, n) => ({ ...p, serial: `${prefix}-${String(start + n).padStart(6, "0")}` }));
}

export function personaRow(core: StudioCore, p: Persona, mac = "", when = ""): ManifestRow {
  const g = p.genes;
  const opt = (gene: number) => core.geneOptions[gene]![g[gene]!] ?? "";
  return {
    serial: p.serial, name: p.name, rarity: core.genesRarity(g), look: String(core.genesCode(g)),
    eye_shape: opt(0), eye_size: opt(1), spacing: opt(2), height: opt(3), highlight: opt(4), accent: opt(5), temperament: opt(6),
    genes: g.join(" "), mac, provisioned_at: when,
  };
}

export const rowPersona = (row: Pick<ManifestRow, "name" | "serial" | "genes">): Persona => ({
  name: row.name, serial: row.serial, genes: row.genes.trim().split(/\s+/).map(Number), favourites: [],
});

// ---- CSV (the same dialect as Python's csv module: minimal quoting, CRLF) ----------------

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function writeManifest(rows: readonly Partial<ManifestRow>[]): string {
  const lines = [MANIFEST_FIELDS.join(",")];
  for (const r of rows) lines.push(MANIFEST_FIELDS.map((f) => csvField(r[f] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Parses CSV text into records keyed by the header row. */
export function readManifest(text: string): ManifestRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  if (!header) return [];
  return body.map((r) => {
    const rec = Object.fromEntries(MANIFEST_FIELDS.map((f) => [f, ""])) as ManifestRow;
    header.forEach((h, i) => {
      if ((MANIFEST_FIELDS as readonly string[]).includes(h)) rec[h as keyof ManifestRow] = r[i] ?? "";
    });
    return rec;
  });
}

/** How rare this exact Lumi is (every gene, temperament included), as "1/122,441". */
export function oddsText(core: StudioCore, genes: readonly number[]): string {
  const p = core.genesProbability(genes);
  return p > 0 ? `1/${Math.round(1 / p).toLocaleString("en-US")}` : "";
}
