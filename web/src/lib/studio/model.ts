/**
 * Faces, animations, personas and the emotion-pack format, for Studio in Chrome. A port of
 * tools/studio/lumi_studio/model.py: the byte layouts mirror firmware/lib/lumi_core/src/pack.cpp,
 * and tests check the packs against the desktop Studio's (tests/golden/studio_parity.json).
 * Projects use the same .lumiproject JSON, so files move between the desktop and Chrome.
 */
import type { Rarity, StudioCore } from "./core";

export const EYE_STYLES = ["normal", "heart", "spiral", "cross", "star", "happy arc", "closed", "squint", "dot", "ring"];
export const MOUTHS = ["none", "smile", "big smile", "flat", "frown", "o", "cat", "wavy", "tongue", "smirk", "teeth"];
export const SHINES = ["square", "none", "dot", "double", "star", "ring"];
export const ACCENTS = ["none", "lashes", "brows", "freckles", "blush", "beauty mark"];
export const MOTIONS = ["none", "shake", "bounce", "wobble", "tremble", "hop"];
export const EFFECTS = ["zzz", "sweat", "tears", "blush", "sparkles", "question", "exclaim", "anger", "notes", "hearts", "low battery", "speed lines"];

export const MAX_FACES = 32;
export const MAX_ANIMS = 32;
export const MAX_KEYS = 12;
export const MAX_PACK = 8192;
export const NAME_LEN = 23; // bytes, without terminator

export interface NumericField {
  key: string;
  offset: number;
  scale: number;
  signed: boolean;
  min: number;
  max: number;
  label: string;
}
const n = (key: string, offset: number, scale: number, signed: boolean, min: number, max: number, label: string): NumericField => ({
  key, offset, scale, signed, min, max, label,
});
/** Every numeric Face field: its byte, scale and range. */
export const NUMERIC: NumericField[] = [
  n("eyeW", 0, 4, false, 0, 63.75, "Eye width"),
  n("eyeH", 1, 4, false, 0, 63.75, "Eye height"),
  n("eyeR", 2, 4, false, 0, 63.75, "Corner roundness"),
  n("spacing", 3, 2, false, 0, 127.5, "Eye spacing"),
  n("eyeY", 4, 2, false, 0, 63.5, "Eye height on screen"),
  n("lookX", 5, 2, true, -64, 63.5, "Look left / right"),
  n("lookY", 6, 2, true, -64, 63.5, "Look up / down"),
  n("openL", 7, 250, false, 0, 1.02, "Left eye open"),
  n("openR", 8, 250, false, 0, 1.02, "Right eye open"),
  n("slant", 9, 4, true, -32, 31.75, "Brow slant (angry + / sad -)"),
  n("cheek", 10, 250, false, 0, 1.02, "Smiling cheeks"),
  n("scaleL", 11, 100, false, 0, 2.55, "Left eye size"),
  n("scaleR", 12, 100, false, 0, 2.55, "Right eye size"),
  n("shine", 13, 250, false, 0, 1.02, "Show highlight"),
  n("mouthW", 14, 4, false, 0, 63.75, "Mouth width"),
  n("mouthOpen", 15, 250, false, 0, 1.02, "Mouth open"),
  n("mouthY", 16, 2, false, 0, 127.5, "Mouth height on screen"),
  n("offX", 17, 2, true, -64, 63.5, "Whole face left / right"),
  n("offY", 18, 2, true, -64, 63.5, "Whole face up / down"),
  n("baseSlant", 19, 4, true, -32, 31.75, "Resting eye tilt"),
];
export const ENUMS: { key: string; offset: number; options: string[]; label: string }[] = [
  { key: "styleL", offset: 20, options: EYE_STYLES, label: "Left eye style" },
  { key: "styleR", offset: 21, options: EYE_STYLES, label: "Right eye style" },
  { key: "mouth", offset: 22, options: MOUTHS, label: "Mouth" },
  { key: "shineStyle", offset: 23, options: SHINES, label: "Highlight style" },
  { key: "accent", offset: 24, options: ACCENTS, label: "Accent" },
];

/** Python's math.floor(v * scale + 0.5), clamped to the byte. */
function quantize(v: number, scale: number, signed: boolean): number {
  const x = Math.floor(v * scale + 0.5);
  const [lo, hi] = signed ? [-128, 127] : [0, 255];
  return Math.max(lo, Math.min(hi, x));
}

/** A face's parameters, as the 32-byte pack format stores them. */
export type FaceParams = Record<string, number>;

export function faceFromBytes(b: Uint8Array): FaceParams {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: FaceParams = {};
  for (const f of NUMERIC) out[f.key] = (f.signed ? v.getInt8(f.offset) : v.getUint8(f.offset)) / f.scale;
  for (const f of ENUMS) out[f.key] = b[f.offset]!;
  out.fx = b[25]! | (b[26]! << 8);
  return out;
}

export function faceToBytes(face: FaceParams): Uint8Array {
  const b = new Uint8Array(32);
  const v = new DataView(b.buffer);
  for (const f of NUMERIC) {
    const q = quantize(face[f.key] ?? 0, f.scale, f.signed);
    if (f.signed) v.setInt8(f.offset, q);
    else v.setUint8(f.offset, q);
  }
  for (const f of ENUMS) b[f.offset] = (face[f.key] ?? 0) & 0xff;
  const fx = face.fx ?? 0;
  b[25] = fx & 0xff;
  b[26] = (fx >> 8) & 0xff;
  return b;
}

/** A face snapped to what the pack can store (like Face.update in the desktop app). */
export function snapFace(face: FaceParams): FaceParams {
  return faceFromBytes(faceToBytes(face));
}

/** A built-in expression as an editable face; `changes` are applied and snapped. */
export function faceFrom(core: StudioCore, expression: number | string, changes: FaceParams = {}): FaceParams {
  const index = typeof expression === "number" ? expression : core.expressions.indexOf(expression);
  return snapFace({ ...faceFromBytes(core.expressionBytes(Math.max(0, index))), ...changes });
}

export interface Key {
  face: string; // "expr:<name>" or "custom:<face name>"
  lookX: number;
  lookY: number;
  motion: string;
  tween: number;
  hold: number;
  fx: string[];
  eyes: string; // "keep" or an EYE_STYLES name
  mouth: string; // "keep" or a MOUTHS name
}
export const newKey = (k: Partial<Key> = {}): Key => ({
  face: "expr:neutral", lookX: 0, lookY: 0, motion: "none", tween: 200, hold: 600, fx: [], eyes: "keep", mouth: "keep", ...k,
});

export interface AnimationDef {
  name: string;
  trigger: string;
  moodMin: number;
  moodMax: number;
  weight: number;
  keys: Key[];
}
export const newAnimation = (a: Partial<AnimationDef> & { name: string }): AnimationDef => ({
  trigger: "pat", moodMin: 0, moodMax: 100, weight: 1, keys: [], ...a,
});

export interface Persona {
  name: string;
  genes: number[];
  serial: string;
  favourites: string[];
}

export interface Project {
  faces: { name: string; params: FaceParams }[];
  animations: AnimationDef[];
}
export const emptyProject = (): Project => ({ faces: [], animations: [] });

export function fxMask(names: readonly string[]): number {
  let m = 0;
  for (const name of names) {
    const i = EFFECTS.indexOf(name);
    if (i < 0) throw new Error(`unknown effect ${name}`);
    m |= 1 << i;
  }
  return m;
}
export const fxNames = (mask: number) => EFFECTS.filter((_, i) => mask & (1 << i));

// ---- .lumiproject ----------------------------------------------------------------

const KEY_FIELDS = ["face", "lookX", "lookY", "motion", "tween", "hold", "fx", "eyes", "mouth"] as const;

/** The .lumiproject JSON, in the desktop app's field order. */
export function projectToJson(p: Project) {
  return {
    version: 1,
    faces: p.faces.map((f) => ({ name: f.name, params: faceJson(f.params) })),
    animations: p.animations.map((a) => ({
      name: a.name, trigger: a.trigger, moodMin: a.moodMin, moodMax: a.moodMax, weight: a.weight,
      keys: a.keys.map((k) => Object.fromEntries(KEY_FIELDS.map((f) => [f, k[f]]))),
    })),
  };
}

function faceJson(params: FaceParams) {
  const snapped = snapFace(params);
  const out: Record<string, number> = {};
  for (const f of NUMERIC) out[f.key] = snapped[f.key]!;
  for (const f of ENUMS) out[f.key] = snapped[f.key]!;
  out.fx = snapped.fx!;
  return out;
}

/** Reads a .lumiproject. Like the desktop, a face starts from expression 0 and then takes its saved values. */
export function projectFromJson(core: StudioCore, d: unknown): Project {
  const o = (d ?? {}) as { faces?: { name: string; params: FaceParams }[]; animations?: Partial<AnimationDef>[] };
  const start = faceFromBytes(core.expressionBytes(0));
  return {
    faces: (o.faces ?? []).map((f) => ({ name: String(f.name), params: snapFace({ ...start, ...f.params }) })),
    animations: (o.animations ?? []).map((a) =>
      newAnimation({ ...a, name: String(a.name ?? ""), keys: (a.keys ?? []).map((k) => newKey(k)) }),
    ),
  };
}

// ---- checks ----------------------------------------------------------------------

const utf8 = (s: string) => new TextEncoder().encode(s);

/** Human-readable reasons this project can't be packed (empty if fine). Same wording as the desktop. */
export function problems(core: StudioCore, p: Project): string[] {
  const out: string[] = [];
  const faceNames = new Set(p.faces.map((f) => f.name));
  if (p.faces.length > MAX_FACES) out.push(`Too many custom faces: ${p.faces.length} (max ${MAX_FACES}).`);
  if (faceNames.size !== p.faces.length) out.push("Two custom faces have the same name.");
  if (p.animations.length > MAX_ANIMS) out.push(`Too many animations: ${p.animations.length} (max ${MAX_ANIMS}).`);
  const names = new Set<string>();
  for (const a of p.animations) {
    const label = `Animation '${a.name || "?"}'`;
    if (!a.name || utf8(a.name).length > NAME_LEN) out.push(`${label}: name must be 1-${NAME_LEN} characters.`);
    if (names.has(a.name)) out.push(`${label}: name used twice.`);
    names.add(a.name);
    if (!core.triggers.includes(a.trigger)) out.push(`${label}: unknown trigger '${a.trigger}'.`);
    if (!(0 <= a.moodMin && a.moodMin <= a.moodMax && a.moodMax <= 100)) out.push(`${label}: mood range must be 0-100 with min <= max.`);
    if (!(1 <= a.weight && a.weight <= 10)) out.push(`${label}: weight must be 1-10.`);
    if (!(1 <= a.keys.length && a.keys.length <= MAX_KEYS)) out.push(`${label}: needs 1-${MAX_KEYS} keys.`);
    a.keys.forEach((k, idx) => {
      const i = idx + 1;
      const [kind, ref] = splitRef(k.face);
      if (kind === "expr" && !core.expressions.includes(ref)) out.push(`${label} key ${i}: unknown expression '${ref}'.`);
      else if (kind === "custom" && !faceNames.has(ref)) out.push(`${label} key ${i}: no custom face called '${ref}'.`);
      else if (kind !== "expr" && kind !== "custom") out.push(`${label} key ${i}: bad face reference '${k.face}'.`);
      if (k.tween + k.hold > 20000 || k.tween < 0 || k.hold < 0) out.push(`${label} key ${i}: tween + hold must be 0-20000 ms.`);
      if (!MOTIONS.includes(k.motion)) out.push(`${label} key ${i}: unknown motion '${k.motion}'.`);
      if (k.eyes !== "keep" && !EYE_STYLES.includes(k.eyes)) out.push(`${label} key ${i}: unknown eye style '${k.eyes}'.`);
      if (k.mouth !== "keep" && !MOUTHS.includes(k.mouth)) out.push(`${label} key ${i}: unknown mouth '${k.mouth}'.`);
      if (!(-128 <= k.lookX && k.lookX <= 127 && -128 <= k.lookY && k.lookY <= 127)) out.push(`${label} key ${i}: look must be -128..127.`);
    });
  }
  return out;
}

function splitRef(ref: string): [string, string] {
  const i = ref.indexOf(":");
  return i < 0 ? [ref, ""] : [ref.slice(0, i), ref.slice(i + 1)];
}

// ---- pack encoding -----------------------------------------------------------------

let crcTable: Uint32Array | null = null;
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of data) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

class Bytes {
  private parts: number[] = [];
  u8(...v: number[]) {
    for (const x of v) this.parts.push(x & 0xff);
    return this;
  }
  i8(v: number) {
    return this.u8(v < 0 ? v + 256 : v);
  }
  u16(v: number) {
    return this.u8(v & 0xff, (v >> 8) & 0xff);
  }
  i16(v: number) {
    return this.u16(v < 0 ? v + 0x10000 : v);
  }
  u32(v: number) {
    return this.u8(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  bytes(b: Uint8Array) {
    for (const x of b) this.parts.push(x);
    return this;
  }
  /** A length-prefixed UTF-8 string, cut to `max` bytes. */
  str(s: string, max: number) {
    const b = utf8(s).slice(0, max);
    return this.u8(b.length).bytes(b);
  }
  get length() {
    return this.parts.length;
  }
  done() {
    return Uint8Array.from(this.parts);
  }
}

export class PackError extends Error {}

/** Builds an emotion pack. Throws PackError with the reasons if it can't. */
export function encodePack(core: StudioCore, project: Project | null, persona: Persona | null = null): Uint8Array {
  const p = project ?? emptyProject();
  const issues = problems(core, p);
  if (persona) {
    if (persona.genes.length !== 7) issues.push("Persona genes must have 7 values.");
    if (persona.favourites.length > 4) issues.push("A persona can have at most 4 favourite animations.");
  }
  if (issues.length) throw new PackError(issues.join("\n"));

  const faceNames = p.faces.map((f) => f.name);
  const payload = new Bytes();
  if (p.faces.length) {
    const body = new Bytes().u8(p.faces.length);
    for (const f of p.faces) body.bytes(faceToBytes(f.params));
    payload.u8(1).u16(body.length).bytes(body.done());
  }
  if (p.animations.length) {
    const body = new Bytes().u8(p.animations.length);
    for (const a of p.animations) {
      body.str(a.name, NAME_LEN);
      body.u8(core.triggers.indexOf(a.trigger), a.moodMin, a.moodMax, a.weight, a.keys.length);
      for (const k of a.keys) {
        const [kind, ref] = splitRef(k.face);
        const r = kind === "custom" ? faceNames.indexOf(ref) : -1 - core.expressions.indexOf(ref);
        body.i16(r).i8(k.lookX).i8(k.lookY).u8(MOTIONS.indexOf(k.motion)).u16(k.tween).u16(k.hold).u16(fxMask(k.fx));
        body.i8(k.eyes === "keep" ? -1 : EYE_STYLES.indexOf(k.eyes)).i8(k.mouth === "keep" ? -1 : MOUTHS.indexOf(k.mouth));
      }
    }
    payload.u8(2).u16(body.length).bytes(body.done());
  }
  if (persona) {
    const body = new Bytes().str(persona.name, 15).str(persona.serial, NAME_LEN).bytes(Uint8Array.from(persona.genes));
    body.u8(persona.favourites.length);
    for (const fav of persona.favourites) body.str(fav, NAME_LEN);
    payload.u8(3).u16(body.length).bytes(body.done());
  }
  const pl = payload.done();
  const data = new Bytes().bytes(utf8("LPK1")).u8(1, 0).u16(0).u32(pl.length).u32(crc32(pl)).bytes(pl).done();
  if (data.length > MAX_PACK) throw new PackError(`Pack is ${data.length} bytes; the limit is ${MAX_PACK}. Remove some faces or animations.`);
  const check = core.validatePack(data);
  if (!check.ok) throw new PackError(`The firmware would reject this pack: ${check.message}`);
  return data;
}

/** generated/default_pack.h, so every unit built from it ships with these emotions. */
export function firmwareHeader(data: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += 16) {
    lines.push("    " + Array.from(data.subarray(i, i + 16), (b) => `0x${b.toString(16).toUpperCase().padStart(2, "0")}`).join(", ") + ",");
  }
  const body = data.length ? lines.join("\n") : "    0";
  return `// Emotions built into every Lumi. Lumi Studio overwrites this file with
// "Export to firmware"; rebuild and flash afterwards.
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace lumi {

static const uint8_t kDefaultPack[] = {
${body}
};
static const size_t kDefaultPackSize = ${data.length};

}  // namespace lumi
`;
}

export const rarityOf = (core: StudioCore, genes: readonly number[]): Rarity => core.genesRarity(genes);
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
